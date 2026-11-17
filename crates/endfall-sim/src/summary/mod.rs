//! The game summary: what each seat had, what it saw of its foes, its attacks, the main fights and how the game ended,
//! as compact JSON for a reader between games (a future "play against Claude": Claude reads it and rewrites its seat's
//! plan). Route-agnostic: the browser's `Game` keeps one (`summaryJson`), and native tools build their own.
//!
//! Read-only: `Summary::observe` takes the world after each tick and never changes it, so it moves no state hash and
//! draws no randomness. What it records comes from the world as it stands, compared with the tick before: units
//! trained and lost, buildings finished, cancelled and lost, research finished, seats going out; every `SAMPLE_EVERY`
//! ticks each seat's economy and army. Each seat's view of its foes uses its own sight only (`World::sees_unit`,
//! `sees_bldg`: its vision and its allies'). Deterministic: the same game gives the same summary, byte for byte.

mod attacks;
mod json;

use crate::TICK_RATE;
use crate::data::*;
use crate::map::Id;
use crate::world::World;
use attacks::Attacks;

/// Ticks between two samples of each seat's economy and army: 30 s of game time.
pub const SAMPLE_EVERY: u32 = 30 * TICK_RATE;
/// Ticks between two counts of the enemy army in a seat's sight (its largest is kept): 1 s.
const SIGHT_EVERY: u32 = TICK_RATE;
const NU: usize = UNIT_KINDS.len();
const NB: usize = BLDG_KINDS.len();

/// A unit or a building, by kind.
#[derive(Clone, Copy, Debug, PartialEq)]
enum Thing {
    Unit(UnitKind),
    Bldg(BldgKind),
}

impl Thing {
    fn name(self) -> &'static str {
        match self {
            Thing::Unit(k) => k.def().name,
            Thing::Bldg(k) => k.def().name,
        }
    }
    /// What it cost (gold; the second slot is always 0).
    fn value(self) -> i32 {
        let c = match self {
            Thing::Unit(k) => k.def().cost,
            Thing::Bldg(k) => k.def().cost,
        };
        c[0] + c[1]
    }
}

/// Something standing at the tick before.
#[derive(Clone, Copy, Debug)]
struct Was {
    id: Id,
    team: u8,
    x: f64,
    y: f64,
    thing: Thing,
    done: bool,
}

/// A unit that died or a building that fell (cancelled sites left out), where it stood the tick before.
#[derive(Clone, Copy, Debug)]
struct Death {
    tick: u32,
    id: Id,
    team: u8,
    x: f64,
    y: f64,
    thing: Thing,
}

/// A headquarters a seat finished away from its start.
#[derive(Clone, Copy, Debug)]
struct Expansion {
    id: Id,
    done: u32,
    tx: i32,
    ty: i32,
    lost: Option<u32>,
}

/// What a seat saw of one enemy seat.
#[derive(Clone, Debug, Default)]
struct Saw {
    units: Vec<(UnitKind, u32)>,
    bldgs: Vec<(BldgKind, u32)>,
    /// Its expansions (headquarters away from its start), when first seen: (id, tick, tile x, tile y, finished then).
    expansions: Vec<(Id, u32, i32, i32, bool)>,
    /// The most of its fighting units in sight at once: (count, tick, by kind).
    peak: Option<(u32, u32, [u16; NU])>,
}

/// One seat's record.
#[derive(Clone, Debug)]
struct SeatRec {
    // (each sample's)
    workers: Vec<u32>,
    gold_banked: Vec<i32>,
    income_per_min: Vec<i64>,
    army_value: Vec<i32>,
    army: Vec<[u16; NU]>,
    mined_at_sample: i64,
    trained: [u32; NU],
    first_trained: [Option<u32>; NU],
    built: Vec<(BldgKind, u32)>,
    researched: Vec<(crate::data::Upgrade, u8, u32)>,
    expansions: Vec<Expansion>,
    out_at: Option<u32>,
    /// By enemy seat (an ally's, and its own, stay empty).
    saw: Vec<Saw>,
}

/// The summary of one game so far. Build it on the world at its start (`new`), call `observe` after every tick, and
/// read it with `json` whenever.
#[derive(Clone, Debug)]
pub struct Summary {
    /// The tick last observed (a world that did not move on by one tick since is taken as a new start).
    tick: u32,
    seats: Vec<SeatRec>,
    samples: Vec<u32>,
    units: Vec<Was>,
    bldgs: Vec<Was>,
    upgrades: Vec<[u8; UPGRADES.len()]>,
    cancelled: Vec<[u32; NB]>,
    deaths: Vec<Death>,
    attacks: Attacks,
    /// The tick the game was over (a winner), if it is.
    over_at: Option<u32>,
    // (scratch, kept to spare an allocation a tick)
    units_now: Vec<Was>,
    bldgs_now: Vec<Was>,
}

fn was_unit(u: &crate::world::Unit) -> Was {
    Was {
        id: u.id,
        team: u.team,
        x: u.x,
        y: u.y,
        thing: Thing::Unit(u.kind),
        done: true,
    }
}

fn was_bldg(b: &crate::world::Bldg) -> Was {
    Was {
        id: b.id,
        team: b.team,
        x: b.x,
        y: b.y,
        thing: Thing::Bldg(b.kind),
        done: b.done,
    }
}

impl Summary {
    /// A summary of the game `w` starts (what stands at its start is neither trained nor built).
    pub fn new(w: &World) -> Summary {
        let n = w.seats();
        Summary {
            tick: w.tick,
            seats: (0..n)
                .map(|s| SeatRec {
                    workers: Vec::new(),
                    gold_banked: Vec::new(),
                    income_per_min: Vec::new(),
                    army_value: Vec::new(),
                    army: Vec::new(),
                    mined_at_sample: w.ledger.get(s).map_or(0, |l| l.mined[0] + l.mined[1]),
                    trained: [0; NU],
                    first_trained: [None; NU],
                    built: Vec::new(),
                    researched: Vec::new(),
                    expansions: Vec::new(),
                    out_at: None,
                    saw: vec![Saw::default(); n],
                })
                .collect(),
            samples: Vec::new(),
            units: w.units.iter().map(was_unit).collect(),
            bldgs: w.bldgs.iter().map(was_bldg).collect(),
            upgrades: w.upgrades.clone(),
            cancelled: w.ledger.iter().map(|l| l.cancelled).collect(),
            deaths: Vec::new(),
            attacks: Attacks::new(n),
            over_at: None,
            units_now: Vec::new(),
            bldgs_now: Vec::new(),
        }
    }

    /// Take in the tick the world just played. Read-only on the world. A world that did not move on by exactly one
    /// tick (a restart, a summary built late) starts the summary again from it.
    pub fn observe(&mut self, w: &World) {
        if w.tick != self.tick + 1 || w.seats() != self.seats.len() {
            *self = Summary::new(w);
            return;
        }
        self.tick = w.tick;
        if self.over_at.is_some() {
            return; // (the game is over: nothing more to tell)
        }
        let deaths = self.diff_entities(w);
        self.research(w);
        self.attacks.observe(w, &deaths);
        self.deaths.extend(deaths);
        self.sightings(w);
        for s in 0..w.seats() {
            if w.out[s] && self.seats[s].out_at.is_none() {
                self.seats[s].out_at = Some(w.tick);
            }
        }
        if w.tick.is_multiple_of(SAMPLE_EVERY) {
            self.sample(w);
        }
        if w.winner >= 0 {
            self.over_at = Some(w.tick);
        }
    }

    /// The units and buildings that came and went since the tick before (merge walks: both lists are in id order),
    /// and the buildings finished. Returns this tick's deaths.
    fn diff_entities(&mut self, w: &World) -> Vec<Death> {
        let tick = w.tick;
        let mut deaths = Vec::new();
        self.units_now.clear();
        self.units_now.extend(w.units.iter().map(was_unit));
        self.bldgs_now.clear();
        self.bldgs_now.extend(w.bldgs.iter().map(was_bldg));
        // units: new ones were trained (or made), gone ones died
        let (mut i, mut j) = (0, 0);
        while i < self.units.len() || j < self.units_now.len() {
            let (a, b) = (self.units.get(i), self.units_now.get(j));
            match (a, b) {
                (Some(a), Some(b)) if a.id == b.id => {
                    i += 1;
                    j += 1;
                }
                (Some(a), b) if b.is_none_or(|b| a.id < b.id) => {
                    deaths.push(death(tick, a));
                    i += 1;
                }
                (_, Some(b)) => {
                    if let Thing::Unit(k) = b.thing {
                        let r = &mut self.seats[b.team as usize];
                        r.trained[k.index()] += 1;
                        r.first_trained[k.index()].get_or_insert(tick);
                    }
                    j += 1;
                }
                _ => unreachable!(),
            }
        }
        // buildings: finished ones, and gone ones fell (or were cancelled: the seat's ledger counts those)
        let mut cancelled = std::mem::take(&mut self.cancelled);
        let (mut i, mut j) = (0, 0);
        while i < self.bldgs.len() || j < self.bldgs_now.len() {
            let (a, b) = (self.bldgs.get(i).copied(), self.bldgs_now.get(j).copied());
            match (a, b) {
                (Some(a), Some(b)) if a.id == b.id => {
                    if !a.done && b.done {
                        self.finished(w, &b);
                    }
                    i += 1;
                    j += 1;
                }
                (Some(a), b) if b.is_none_or(|b| a.id < b.id) => {
                    let t = a.team as usize;
                    let k = match a.thing {
                        Thing::Bldg(k) => k.index(),
                        Thing::Unit(_) => unreachable!(),
                    };
                    let now = w.ledger.get(t).map_or(0, |l| l.cancelled[k]);
                    if !a.done && cancelled.get(t).is_some_and(|c| c[k] < now) {
                        cancelled[t][k] += 1; // (a site cancelled: no loss)
                    } else {
                        deaths.push(death(tick, &a));
                        if let Some(e) = self.seats[t].expansions.iter_mut().find(|e| e.id == a.id)
                        {
                            e.lost = Some(tick);
                        }
                    }
                    i += 1;
                }
                (_, Some(b)) => {
                    if b.done {
                        self.finished(w, &b); // (made finished: a test's or a debug spawn)
                    }
                    j += 1;
                }
                _ => unreachable!(),
            }
        }
        self.cancelled = cancelled;
        std::mem::swap(&mut self.units, &mut self.units_now);
        std::mem::swap(&mut self.bldgs, &mut self.bldgs_now);
        deaths
    }

    /// A building finished: its time, and a headquarters away from its seat's start is an expansion.
    fn finished(&mut self, w: &World, b: &Was) {
        let Thing::Bldg(k) = b.thing else { return };
        let r = &mut self.seats[b.team as usize];
        r.built.push((k, w.tick));
        if let Some(bl) = w.bldg(b.id)
            && k.def().hq
            && w.map.bases.get(b.team as usize) != Some(&(bl.tx, bl.ty))
        {
            r.expansions.push(Expansion {
                id: b.id,
                done: w.tick,
                tx: bl.tx,
                ty: bl.ty,
                lost: None,
            });
        }
    }

    /// Research finished: each seat's levels against the tick before.
    fn research(&mut self, w: &World) {
        for (s, now) in w.upgrades.iter().enumerate() {
            let Some(was) = self.upgrades.get_mut(s) else {
                continue;
            };
            for (i, &up) in UPGRADES.iter().enumerate() {
                for level in was[i] + 1..=now[i] {
                    self.seats[s].researched.push((up, level, w.tick));
                }
            }
            *was = *now;
        }
    }

    /// What each seat in the game sees of each enemy for the first time: a kind of unit or building, an expansion; and
    /// every `SIGHT_EVERY` ticks, the enemy's fighting units in its sight. Its own sight and its allies' only.
    fn sightings(&mut self, w: &World) {
        let n = w.seats();
        let count = w.tick.is_multiple_of(SIGHT_EVERY);
        for s in 0..n {
            if w.out[s] {
                continue;
            }
            let me = s as u8;
            let mut army: Vec<(u32, [u16; NU])> = vec![(0, [0; NU]); n];
            let saw = &mut self.seats[s].saw;
            for u in w.units.iter().filter(|u| w.enemies(me, u.team)) {
                let e = &mut saw[u.team as usize];
                let new = !e.units.iter().any(|&(k, _)| k == u.kind);
                let fighter = !u.kind.def().worker && u.kind.def().armed();
                if (new || (count && fighter)) && w.sees_unit(me, u) {
                    if new {
                        e.units.push((u.kind, w.tick));
                    }
                    if count && fighter {
                        let a = &mut army[u.team as usize];
                        a.0 += 1;
                        a.1[u.kind.index()] += 1;
                    }
                }
            }
            for b in w.bldgs.iter().filter(|b| w.enemies(me, b.team)) {
                let e = &mut saw[b.team as usize];
                let new = !e.bldgs.iter().any(|&(k, _)| k == b.kind);
                let expansion = b.kind.def().hq
                    && w.map.bases.get(b.team as usize) != Some(&(b.tx, b.ty))
                    && !e.expansions.iter().any(|x| x.0 == b.id);
                if (new || expansion) && w.sees_bldg(me, b) {
                    if new {
                        e.bldgs.push((b.kind, w.tick));
                    }
                    if expansion {
                        e.expansions.push((b.id, w.tick, b.tx, b.ty, b.done));
                    }
                }
            }
            for (e, (c, kinds)) in army.into_iter().enumerate() {
                if c > 0 && saw[e].peak.is_none_or(|p| c > p.0) {
                    saw[e].peak = Some((c, w.tick, kinds));
                }
            }
        }
    }

    /// Each seat's economy and army now.
    fn sample(&mut self, w: &World) {
        self.samples.push(w.tick);
        for (s, r) in self.seats.iter_mut().enumerate() {
            let mut army = [0u16; NU];
            let (mut workers, mut value) = (0, 0);
            for u in w.units.iter().filter(|u| u.team as usize == s) {
                if u.kind.def().worker {
                    workers += 1;
                } else {
                    army[u.kind.index()] += 1;
                    value += Thing::Unit(u.kind).value();
                }
            }
            let mined = w.ledger.get(s).map_or(0, |l| l.mined[0] + l.mined[1]);
            r.workers.push(workers);
            r.gold_banked.push(w.res[s][0] + w.res[s][1]);
            r.income_per_min
                .push((mined - r.mined_at_sample) * 60 / (SAMPLE_EVERY / TICK_RATE) as i64);
            r.mined_at_sample = mined;
            r.army_value.push(value);
            r.army.push(army);
        }
    }

    /// The summary as JSON (`json.rs` describes its fields). `timed_out`: the game was stopped at a time limit (a
    /// tool's cap) rather than read while it plays.
    pub fn json(&self, w: &World, timed_out: bool) -> String {
        json::write(self, w, timed_out)
    }
}

fn death(tick: u32, a: &Was) -> Death {
    Death {
        tick,
        id: a.id,
        team: a.team,
        x: a.x,
        y: a.y,
        thing: a.thing,
    }
}

/// Play `w` for `ticks` ticks, or until it is over, observing it: the summary of what it played (native tools and
/// tests). `timed_out` in its JSON is the caller's: the game stopped at the limit with no winner.
pub fn play(w: &mut World, ticks: u32) -> Summary {
    let mut s = Summary::new(w);
    for _ in 0..ticks {
        if w.winner >= 0 {
            break;
        }
        w.step();
        w.events.clear();
        s.observe(w);
    }
    s
}
