//! Check-ins for a planned seat while it plays (play against Claude, claude/PROTOCOL.md): every `EVERY` ticks, and on
//! key events (its wave arrives or is wiped out, its base is attacked, a building of its falls, its army is wiped out at
//! home, an expansion of its falls, the enemy's first top-tier unit is seen), a short digest of what that seat has and what its own sight (and its allies') has shown of
//! its enemies (`World::seen`), and what changed since the last one. A reader (Claude) answers with a plan delta.
//! Read-only like the rest of the summary: no hash moves, no randomness drawn.

use super::attacks::News;
use super::json::{Base, bases, counts, end_words, place, place_words, time, unit_counts};
use super::{Death, NB, NU, Summary, Thing};
use crate::TICK_RATE;
use crate::data::{Obj, array, quote, *};
use crate::world::{WaveEnd, World};
use std::collections::VecDeque;

/// A check-in every 2 game-minutes.
pub const EVERY: u32 = 120 * TICK_RATE;
/// Events no closer than this to the last digest (they wait, gathered); a check-in this close to an event waits as long
/// (never dropped: a base under attack must not go dark).
pub const EVENT_GAP: u32 = 20 * TICK_RATE;

/// The check-ins of one seat.
#[derive(Clone, Debug)]
pub(super) struct CheckIns {
    pub seat: u8,
    /// The tick the next check-in is due, and the last digest's.
    next: u32,
    last: Option<u32>,
    /// Events not yet told.
    reasons: Vec<String>,
    /// Digests made and not yet taken: JSON.
    queue: VecDeque<String>,
    /// How many were made.
    pub made: usize,
    /// At the last digest: units trained by kind, what its units had killed (value), enemy units killed and buildings
    /// razed (its stats), and its attacks ended.
    trained: [u32; NU],
    killed_value: f64,
    killed: u32,
    razed: u32,
    attacks: usize,
    /// A check-in that came due too close to the last digest, waiting `EVENT_GAP`.
    postponed: bool,
    /// The most fighters it had at home (out of any wave) at once since it last had none: an army wiped out at home.
    home_army: usize,
}

/// Place words as seat `me` reads them: "your main base", "the enemy's expansion" (with one enemy seat; else "seat 2's").
fn as_seen(words: &str, me: u8, w: &World) -> String {
    let mut out = words.replace(&format!("seat {me}'s "), "your ");
    let foes: Vec<usize> = (0..w.seats()).filter(|&e| w.enemies(me, e as u8)).collect();
    if let [foe] = foes[..] {
        out = out.replace(&format!("seat {foe}'s "), "the enemy's ");
    }
    out
}

/// The armed fighters of seat `me` not out with its AI's wave.
fn at_home(w: &World, me: u8) -> usize {
    let wave = w.ai_wave_of(me).unwrap_or(&[]);
    w.units
        .iter()
        .filter(|u| {
            u.team == me && !u.kind.def().worker && u.kind.def().armed() && !wave.contains(&u.id)
        })
        .count()
}

impl CheckIns {
    pub fn new(seat: u8, tick: u32) -> CheckIns {
        CheckIns {
            seat,
            next: (tick / EVERY + 1) * EVERY,
            last: None,
            reasons: Vec::new(),
            queue: VecDeque::new(),
            made: 0,
            trained: [0; NU],
            killed_value: 0.0,
            killed: 0,
            razed: 0,
            attacks: 0,
            postponed: false,
            home_army: 0,
        }
    }

    pub fn take(&mut self) -> Option<String> {
        self.queue.pop_front()
    }

    /// After a tick (the summary's other records already up to date, but this tick's deaths not yet in its list).
    pub fn observe(
        &mut self,
        s: &Summary,
        w: &World,
        deaths: &[Death],
        news: &News,
        first_top: &[(usize, UnitKind)],
    ) {
        let me = self.seat;
        if w.out.get(me as usize).is_none_or(|&o| o) {
            return;
        }
        let b = bases(s, w);
        let place = |b: &[Base], t: u32, x: f64, y: f64| as_seen(&place(b, t, x, y), me, w);
        for &(seat, to, x, y) in &news.arrived {
            if seat == me {
                self.reasons.push(format!(
                    "your wave reached {}",
                    unq(&place(&b, w.tick, x, y))
                ));
            } else if to == me {
                self.reasons.push(format!(
                    "an enemy attack reached {}",
                    unq(&place(&b, w.tick, x, y))
                ));
            }
        }
        for a in news.ended.iter().filter(|a| a.seat == me && a.wave) {
            if a.end_why == Some(WaveEnd::AllFell) {
                self.reasons.push("your wave was wiped out".into());
            }
        }
        for d in deaths.iter().filter(|d| d.team == me) {
            let Thing::Bldg(k) = d.thing else { continue };
            if s.seats[me as usize].expansions.iter().any(|e| e.id == d.id) {
                self.reasons.push(format!(
                    "your expansion at {} fell",
                    unq(&place(&b, w.tick, d.x, d.y))
                ));
            } else {
                self.reasons.push(format!(
                    "your {} fell at {}",
                    k.def().name,
                    unq(&place(&b, w.tick, d.x, d.y))
                ));
            }
        }
        // (its fighters at home all gone, three or more at once since it last had none: the last of them fell this tick)
        let home = at_home(w, me);
        let lost_one = deaths
            .iter()
            .any(|d| d.team == me && matches!(d.thing, Thing::Unit(k) if !k.def().worker));
        if self.home_army >= 3 && home == 0 && lost_one {
            self.reasons.push("your army was wiped out at home".into());
        }
        self.home_army = if home == 0 {
            0
        } else {
            self.home_army.max(home)
        };
        for &(viewer, k) in first_top {
            if viewer == me as usize {
                self.reasons
                    .push(format!("first enemy {} seen", k.def().name));
            }
        }
        let t = w.tick;
        let spaced = self.last.is_none_or(|l| t >= l + EVENT_GAP);
        if t >= self.next {
            self.postponed = true;
            while self.next <= t {
                self.next += EVERY;
            }
        }
        if !self.reasons.is_empty() && spaced {
            let why = gather(std::mem::take(&mut self.reasons));
            self.postponed = false; // (the check-in due goes out with the event)
            self.digest(s, w, deaths, "event", why);
        } else if self.postponed && spaced {
            self.postponed = false;
            self.digest(s, w, deaths, "checkin", vec!["every 2 minutes".into()]);
        }
    }

    fn digest(&mut self, s: &Summary, w: &World, deaths: &[Death], kind: &str, why: Vec<String>) {
        let me = self.seat;
        let seat = me as usize;
        let r = &s.seats[seat];
        let f = w.factions[seat];
        let b = bases(s, w);
        let since = self.last.unwrap_or(0);
        self.made += 1;
        // its own state
        let (mut army, mut value, mut workers) = ([0u16; NU], 0, 0);
        for u in w.units.iter().filter(|u| u.team == me) {
            if u.kind.def().worker {
                workers += 1;
            } else {
                army[u.kind.index()] += 1;
                value += Thing::Unit(u.kind).value();
            }
        }
        let (mut done, mut sites) = ([0u32; NB], [0u32; NB]);
        for bl in w.bldgs.iter().filter(|bl| bl.team == me) {
            if bl.done {
                done[bl.kind.index()] += 1;
            } else {
                sites[bl.kind.index()] += 1;
            }
        }
        let bcounts = |c: &[u32; NB]| {
            counts(
                BLDG_KINDS.iter().map(|k| (k.def().name, c[k.index()])),
                false,
            )
        };
        let research: Vec<String> = UPGRADES
            .iter()
            .enumerate()
            .filter(|(i, _)| w.upgrades[seat][*i] > 0)
            .map(|(i, up)| quote(&up.level_name(w.upgrades[seat][i])))
            .collect();
        let wave = match w.ai_wave_of(me) {
            Some(ids) => {
                let left: Vec<&crate::world::Unit> =
                    ids.iter().filter_map(|&id| w.unit(id)).collect();
                let (cx, cy) = if left.is_empty() {
                    (0.0, 0.0)
                } else {
                    let n = left.len() as f64;
                    (
                        left.iter().map(|u| u.x).sum::<f64>() / n,
                        left.iter().map(|u| u.y).sum::<f64>() / n,
                    )
                };
                let mut o = Obj::new().raw("out", "true").num("units_left", left.len());
                if let Some((_, units, _)) = w.ai_notes(me).and_then(|n| n.left) {
                    o = o.num("went_with", units);
                }
                if !left.is_empty() {
                    o = o.str("where", &unq(&as_seen(&place(&b, w.tick, cx, cy), me, w)));
                }
                o.done()
            }
            None => {
                let need = w
                    .ai_next_wave(me)
                    .map_or(0, |n| (n as f64 * f.ai.wave_scale).ceil() as usize);
                let mut o = Obj::new().raw("out", "false").num("next_needs", need);
                if let Some(h) = w.ai_notes(me).and_then(|n| n.wave) {
                    o = o.str("held_by", &h.words());
                }
                if let Some(e) = w.ai_notes(me).and_then(|n| n.ended) {
                    o = o.str("last_ended", end_words(e));
                }
                o.done()
            }
        };
        let income = r.income_per_min.last().copied().unwrap_or(0);
        let you = Obj::new()
            .str("money_name", f.money)
            .num("bank", w.res[seat][0] + w.res[seat][1])
            .num("income_per_min", income)
            .num("workers", workers)
            .str(
                "places",
                &format!("{}/{}", w.supply[seat][0], w.supply[seat][1]),
            )
            .raw(
                "army",
                Obj::new()
                    .num("value", value)
                    .raw("units", unit_counts(&army))
                    .done(),
            )
            .raw("buildings", bcounts(&done))
            .raw("sites", bcounts(&sites))
            .raw("research", array(research))
            .raw("wave", wave)
            .done();
        // what it sees of its enemies now (its own sight and its allies'), and has seen
        let seen = w.seen(me);
        let (mut eu, mut ev, mut eb) = ([0u16; NU], 0, [0u32; NB]);
        for id in &seen {
            if let Some(u) = w.unit(*id) {
                eu[u.kind.index()] += 1;
                if !u.kind.def().worker {
                    ev += Thing::Unit(u.kind).value();
                }
            } else if let Some(bl) = w.bldg(*id) {
                eb[bl.kind.index()] += 1;
            }
        }
        let enemies: Vec<String> = (0..w.seats())
            .filter(|&e| w.enemies(me, e as u8))
            .map(|e| {
                let v = &r.saw[e];
                let peak = v.peak.map_or("null".into(), |(n, t, _)| {
                    Obj::new().num("units", n).raw("at", time(t)).done()
                });
                let mains: Vec<Base> = b.iter().filter(|x| x.3 == "main base").copied().collect();
                let d = w.factions[e].hq.def();
                Obj::new()
                    .num("seat", e)
                    .str("people", w.factions[e].name)
                    .raw(
                        "unit_types",
                        array(v.units.iter().map(|(k, _)| quote(k.def().name))),
                    )
                    .raw(
                        "building_types",
                        array(v.bldgs.iter().map(|(k, _)| quote(k.def().name))),
                    )
                    .raw("largest_army", peak)
                    .raw(
                        "expansions",
                        array(v.expansions.iter().map(|x| {
                            quote(&as_seen(
                                &place_words(
                                    &mains,
                                    x.1,
                                    x.2 as f64 + d.w as f64 / 2.0,
                                    x.3 as f64 + d.h as f64 / 2.0,
                                ),
                                me,
                                w,
                            ))
                        })),
                    )
                    .done()
            })
            .collect();
        let enemy = Obj::new()
            .raw(
                "in_sight",
                Obj::new()
                    .raw("units", unit_counts(&eu))
                    .num("army_value", ev)
                    .raw("buildings", bcounts(&eb))
                    .done(),
            )
            .raw("seen_so_far", array(enemies))
            .done();
        // what changed since the last digest
        let trained: Vec<(&str, u32)> = UNIT_KINDS
            .iter()
            .map(|k| (k.def().name, r.trained[k.index()] - self.trained[k.index()]))
            .collect();
        let (mut lu, mut lb, mut lv) = ([0u32; NU], [0u32; NB], 0);
        for d in s
            .deaths
            .iter()
            .chain(deaths)
            .filter(|d| d.team == me && d.tick > since)
        {
            lv += d.thing.value();
            match d.thing {
                Thing::Unit(k) => lu[k.index()] += 1,
                Thing::Bldg(k) => lb[k.index()] += 1,
            }
        }
        let killed_value: f64 = r.trades.iter().map(|t| t.1).sum::<f64>() + r.tower_kills;
        let st = w.stats[seat];
        let done_attacks: Vec<&super::attacks::Attack> =
            s.attacks.done.iter().filter(|a| a.seat == me).collect();
        let attacks = array(done_attacks.iter().skip(self.attacks).map(|a| {
            let mut o = Obj::new()
                .raw("went", time(a.started))
                .num("units", a.kinds.iter().map(|&n| n as u32).sum::<u32>())
                .num("lost", a.lost_value)
                .num("killed", a.destroyed_value);
            if let Some(e) = a.end_why {
                o = o.str("ended", end_words(e));
            }
            o.done()
        }));
        let since_last = Obj::new()
            .raw("from", time(since))
            .raw("trained", counts(trained, false))
            .raw(
                "lost",
                Obj::new()
                    .num("value", lv)
                    .raw(
                        "units",
                        counts(
                            UNIT_KINDS.iter().map(|k| (k.def().name, lu[k.index()])),
                            false,
                        ),
                    )
                    .raw("buildings", bcounts(&lb))
                    .done(),
            )
            .raw(
                "killed",
                Obj::new()
                    .num(
                        "value",
                        crate::jsmath::round(killed_value - self.killed_value) as i64,
                    )
                    .num("units", st.killed - self.killed)
                    .num("buildings_razed", st.razed - self.razed)
                    .done(),
            )
            .raw("attacks_ended", attacks)
            .done();
        let digest = Obj::new()
            .num("n", self.made)
            .raw("at", time(w.tick))
            .raw("why", array(why.iter().map(|x| quote(x))))
            .str("plan", &w.plan_of(me).map(|p| p.code()).unwrap_or_default())
            .raw("you", you)
            .raw("enemy", enemy)
            .raw("since_last", since_last)
            .done();
        self.queue.push_back(
            Obj::new()
                .str("kind", kind)
                .num("tick", w.tick)
                .raw("digest", digest)
                .done(),
        );
        // the marks for the next one
        self.last = Some(w.tick);
        self.trained = r.trained;
        self.killed_value = killed_value;
        self.killed = st.killed;
        self.razed = st.razed;
        self.attacks = done_attacks.len();
    }
}

/// The reasons as told: each once, with how many times it happened ("your Cottage fell at your main base (x3)").
fn gather(reasons: Vec<String>) -> Vec<String> {
    let mut out: Vec<(String, usize)> = Vec::new();
    for r in reasons {
        match out.iter_mut().find(|o| o.0 == r) {
            Some(o) => o.1 += 1,
            None => out.push((r, 1)),
        }
    }
    out.into_iter()
        .map(|(r, n)| if n > 1 { format!("{r} (x{n})") } else { r })
        .collect()
}

/// A quoted place's words, without the quotes.
fn unq(s: &str) -> String {
    s.trim_matches('"').to_string()
}
