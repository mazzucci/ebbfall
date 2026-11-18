//! Each seat's attacks, as the balance lab watches its AI waves (crates/endfall-lab/src/waves.rs), for any number of
//! seats. An AI seat's attack is its wave (`World::ai_wave_of`): out from the tick its AI sends one to the tick it has
//! none, its units those the AI sent (and any it adds). A person's seat has no wave to read, so its attack is what
//! comes near the enemy: it starts when `MIN_UNITS` of its fighting units stand within `REACH` tiles of an enemy
//! building, takes in each of its fighting units that comes that near while it lasts, and ends `CALM` ticks after the
//! last of them was that near (or when none is left). Either arrives when one of its units first comes within `REACH`
//! tiles of an enemy building: that building's seat is its target. What it destroyed is what of the enemy fell within
//! `REACH` tiles of one of its units (both where they stood the tick before); what it lost, its units that died.

use super::{Death, NB, NU, Thing};
use crate::TICK_RATE;
use crate::data::TILE;
use crate::map::Id;
use crate::world::{Bldg, WaveEnd, WaveWhy, World};

/// Within this many tiles of an enemy building's edge an attack has arrived; what fell this near one of its units, it
/// destroyed (the lab's `REACH`).
pub const REACH: f64 = 8.0;
/// A person's attack starts with this many of its fighting units near an enemy building.
const MIN_UNITS: usize = 3;
/// A person's attack ends this long after the last of its units was near an enemy building.
const CALM: u32 = 20 * TICK_RATE;
/// How often a person's units are checked for nearness (the checks are the costly part).
const CHECK_EVERY: u32 = TICK_RATE / 2;
/// At contact (an attack's arrival), the enemy's armed units and towers within this many tiles of where it arrived
/// are what it met.
pub const CONTACT: f64 = 12.0;

/// One attack.
#[derive(Clone, Debug)]
pub(super) struct Attack {
    pub seat: u8,
    /// An AI wave (else a person's units near the enemy).
    pub wave: bool,
    pub started: u32,
    /// Its units, by kind, and what they cost.
    pub kinds: [u16; NU],
    pub value: i32,
    /// When it arrived, the target seat and where (world px).
    pub arrived: Option<(u32, u8, f64, f64)>,
    pub ended: Option<u32>,
    pub destroyed_value: i32,
    pub destroyed_bldgs: [u16; NB],
    pub killed_units: u32,
    pub lost_value: i32,
    pub lost_units: u32,
    /// At its arrival: the value of its units standing, and of the enemy's armed units and towers it met (`CONTACT`).
    pub contact: Option<(i32, i32)>,
    /// An AI wave's: why it went (its units, the count it needed), and why it ended (`World::ai_notes`).
    pub left: Option<(WaveWhy, usize, usize)>,
    pub end_why: Option<WaveEnd>,
}

/// What happened to the attacks this tick (the check-ins' events): arrivals (the attack's seat, where it arrived and
/// the seat it reached), and attacks that ended.
#[derive(Default)]
pub(super) struct News {
    pub arrived: Vec<(u8, u8, f64, f64)>,
    pub ended: Vec<Attack>,
}

/// An attack out: its record and its units standing, where they stood the tick before.
#[derive(Clone, Debug)]
struct Out {
    rec: Attack,
    members: Vec<(Id, f64, f64)>,
    last_near: u32,
}

/// Every seat's attacks.
#[derive(Clone, Debug)]
pub(super) struct Attacks {
    out: Vec<Option<Out>>,
    pub done: Vec<Attack>,
}

/// The distance from (x, y) to building `b`'s edge, squared (world px).
fn edge2(b: &Bldg, x: f64, y: f64) -> f64 {
    let dx = ((x - b.x).abs() - b.w as f64 * TILE / 2.0).max(0.0);
    let dy = ((y - b.y).abs() - b.h as f64 * TILE / 2.0).max(0.0);
    dx * dx + dy * dy
}

/// An enemy building of `seat`'s within `REACH` of (x, y), if any.
fn near_enemy(w: &World, seat: u8, x: f64, y: f64) -> Option<&Bldg> {
    let r2 = (REACH * TILE) * (REACH * TILE);
    w.bldgs
        .iter()
        .find(|b| w.enemies(seat, b.team) && edge2(b, x, y) < r2)
}

impl Attacks {
    pub fn new(seats: usize) -> Attacks {
        Attacks {
            out: vec![None; seats],
            done: Vec::new(),
        }
    }

    /// The attacks out now, as they stand (each seat's at most one).
    pub fn still_out(&self) -> impl Iterator<Item = &Attack> {
        self.out.iter().flatten().map(|o| &o.rec)
    }

    /// How many attacks seat `seat` has made so far (those out counted).
    pub fn count_of(&self, seat: u8) -> usize {
        self.done.iter().filter(|a| a.seat == seat).count()
            + self.out.get(seat as usize).is_some_and(|o| o.is_some()) as usize
    }

    /// After a tick, with its deaths: what happened to the attacks.
    pub fn observe(&mut self, w: &World, deaths: &[Death]) -> News {
        let mut news = News::default();
        for s in 0..self.out.len() {
            let seat = s as u8;
            let wave = if w.is_ai(seat) {
                w.ai_wave_of(seat)
            } else {
                None
            };
            // (an AI seat's wave sent, or a person's units come near)
            if self.out[s].is_none() {
                if let Some(ids) = wave {
                    let mut o = start(w, seat, true, ids);
                    o.rec.left = w.ai_notes(seat).and_then(|n| n.left);
                    self.out[s] = Some(o);
                } else if !w.is_ai(seat) && !w.out[s] && w.tick.is_multiple_of(CHECK_EVERY) {
                    let near = near_units(w, seat);
                    if near.len() >= MIN_UNITS {
                        let o = start(w, seat, false, &near);
                        if let Some((_, to, x, y)) = o.rec.arrived {
                            news.arrived.push((seat, to, x, y));
                        }
                        self.out[s] = Some(o);
                    }
                }
                continue;
            }
            let o = self.out[s].as_mut().unwrap();
            // what of the enemy fell near one of its units, and its own that fell
            let r2 = (REACH * TILE) * (REACH * TILE);
            for d in deaths {
                if d.team == seat {
                    if let Some(i) = o.members.iter().position(|m| m.0 == d.id) {
                        o.members.remove(i);
                        o.rec.lost_value += d.thing.value();
                        o.rec.lost_units += 1;
                    }
                } else if w.enemies(seat, d.team)
                    && o.members.iter().any(|m| {
                        let (dx, dy) = (m.1 - d.x, m.2 - d.y);
                        dx * dx + dy * dy < r2
                    })
                {
                    o.rec.destroyed_value += d.thing.value();
                    match d.thing {
                        Thing::Bldg(k) => o.rec.destroyed_bldgs[k.index()] += 1,
                        Thing::Unit(_) => o.rec.killed_units += 1,
                    }
                }
            }
            // units it gained: an AI's added to its wave, a person's come near the enemy
            let joined: Vec<Id> = match wave {
                Some(ids) => ids.to_vec(),
                None if !o.rec.wave && w.tick.is_multiple_of(CHECK_EVERY) => {
                    let near = near_units(w, seat);
                    if !near.is_empty() {
                        o.last_near = w.tick;
                    }
                    near
                }
                None => Vec::new(),
            };
            for id in joined {
                if !o.members.iter().any(|m| m.0 == id)
                    && let Some(u) = w.unit(id)
                {
                    o.members.push((id, u.x, u.y));
                    o.rec.kinds[u.kind.index()] += 1;
                    o.rec.value += Thing::Unit(u.kind).value();
                }
            }
            for m in &mut o.members {
                if let Some(u) = w.unit(m.0) {
                    (m.1, m.2) = (u.x, u.y);
                }
            }
            if o.rec.arrived.is_none() {
                o.rec.arrived = o.members.iter().find_map(|m| {
                    near_enemy(w, seat, m.1, m.2).map(|b| (w.tick, b.team, m.1, m.2))
                });
                if let Some((_, to, x, y)) = o.rec.arrived {
                    o.rec.contact = Some(contact(w, seat, &o.members, x, y));
                    news.arrived.push((seat, to, x, y));
                }
            }
            let over = if o.rec.wave {
                wave.is_none()
            } else {
                o.members.is_empty() || w.tick >= o.last_near + CALM
            };
            if over || w.winner >= 0 {
                let mut rec = self.out[s].take().unwrap().rec;
                rec.ended = Some(w.tick);
                if rec.wave {
                    rec.end_why = w.ai_notes(seat).and_then(|n| n.ended);
                }
                news.ended.push(rec.clone());
                self.done.push(rec);
            }
        }
        news
    }
}

/// `seat`'s fighting units within `REACH` of an enemy building now, by id.
fn near_units(w: &World, seat: u8) -> Vec<Id> {
    w.units
        .iter()
        .filter(|u| u.team == seat && u.kind.def().threat())
        .filter(|u| near_enemy(w, seat, u.x, u.y).is_some())
        .map(|u| u.id)
        .collect()
}

fn start(w: &World, seat: u8, wave: bool, ids: &[Id]) -> Out {
    let mut rec = Attack {
        seat,
        wave,
        started: w.tick,
        kinds: [0; NU],
        value: 0,
        arrived: None,
        ended: None,
        destroyed_value: 0,
        destroyed_bldgs: [0; NB],
        killed_units: 0,
        lost_value: 0,
        lost_units: 0,
        contact: None,
        left: None,
        end_why: None,
    };
    let mut members = Vec::new();
    for &id in ids {
        if let Some(u) = w.unit(id) {
            members.push((id, u.x, u.y));
            rec.kinds[u.kind.index()] += 1;
            rec.value += Thing::Unit(u.kind).value();
        }
    }
    if !wave {
        rec.arrived = members
            .iter()
            .find_map(|m| near_enemy(w, seat, m.1, m.2).map(|b| (w.tick, b.team, m.1, m.2)));
        if let Some((_, _, x, y)) = rec.arrived {
            rec.contact = Some(contact(w, seat, &members, x, y));
        }
    }
    Out {
        rec,
        members,
        last_near: w.tick,
    }
}

/// At contact: the value of an attack's units standing, and of `seat`'s enemies' armed units and towers within
/// `CONTACT` tiles of (x, y).
fn contact(w: &World, seat: u8, members: &[(Id, f64, f64)], x: f64, y: f64) -> (i32, i32) {
    let r2 = (CONTACT * TILE) * (CONTACT * TILE);
    let near = |px: f64, py: f64| (px - x) * (px - x) + (py - y) * (py - y) <= r2;
    let mine = members
        .iter()
        .filter_map(|m| w.unit(m.0))
        .map(|u| Thing::Unit(u.kind).value())
        .sum();
    let units: i32 = w
        .units
        .iter()
        .filter(|u| w.enemies(seat, u.team) && u.kind.def().threat() && near(u.x, u.y))
        .map(|u| Thing::Unit(u.kind).value())
        .sum();
    let towers: i32 = w
        .bldgs
        .iter()
        .filter(|b| {
            w.enemies(seat, b.team)
                && b.done
                && b.kind == w.factions[b.team as usize].ai.tower
                && near(b.x, b.y)
        })
        .map(|b| Thing::Bldg(b.kind).value())
        .sum();
    (mine, units + towers)
}
