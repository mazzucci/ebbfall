//! The summary as JSON, for a reader between games. Compact (no spaces) and self-describing: times are game time as
//! "m:ss", values are what things cost in each seat's money (gold for the Kingdom, energy for the Expedition), places
//! are named after the seats' bases ("seat 1's main base", "open ground 20 tiles north-east of seat 0's main base").
//! The top level:
//!
//! - `about`: what this is, in a sentence, and the conventions.
//! - `map`: its kind, size and seed; `length`: the game time summarized.
//! - `result`: the winning seats and how the game ended (`destroyed`, `conceded`, `helpless`, `timeout`,
//!   `unfinished`).
//! - `per_minute`: when the per-seat per-minute lists were sampled (every minute).
//! - `seats`: one per seat: who played it, its money's word, an AI's drawn `style` and leaning unit, a planned seat's
//!   `plan` ("plan vs what happened": plan.rs), its outcome, its `economy` (per minute), `spent` (on workers, army,
//!   buildings, expansions, towers and tech, in all and by 5 minutes), its `army` (value per minute, units every 5
//!   minutes), `units_trained` (every unit type its people can train, zeros too) and `first_trained`,
//!   `buildings_completed`, `research_completed`, `attacks` (each with why it went and why it ended, its strength
//!   against what it met at contact), `trades` (by its unit type: value lost and value killed), `losses`, and
//!   `saw_of_enemies`: what it saw of each enemy seat with its own (and its allies') sight only.
//! - `main_fights`: the biggest clusters of deaths in place and time, each seat's losses in them.

use super::attacks::{Attack, REACH};
use super::{Death, NU, SPENT_ON, Step, Summary, Thing};
use crate::TICK_RATE;
use crate::data::*;
use crate::data::{Obj, array, quote};
use crate::world::{OutWhy, WaveEnd, WaveWhy, World};

/// A fight: deaths no more than `FIGHT_GAP` ticks after its last, within `FIGHT_RADIUS` tiles of its first.
const FIGHT_GAP: u32 = 15 * TICK_RATE;
const FIGHT_RADIUS: f64 = 12.0;
/// The fights listed: the biggest by value lost, in time order.
const MAIN_FIGHTS: usize = 6;
/// A place within this many tiles of a base is named after it.
const BASE_RADIUS: f64 = 16.0;
/// The difficulties' names, by level.
const LEVELS: [&str; 4] = ["Easy", "Medium", "Hard", "Hard3"];

/// The army's units are listed every this many samples (5 minutes).
const ARMY_EVERY: usize = 5;

/// Game time as "m:ss".
pub(super) fn time(tick: u32) -> String {
    let s = tick / TICK_RATE;
    format!("\"{}:{:02}\"", s / 60, s % 60)
}

/// An object of name: value, in the order given, the zeros left out unless `zeros`.
pub(super) fn counts<'a>(items: impl IntoIterator<Item = (&'a str, u32)>, zeros: bool) -> String {
    items
        .into_iter()
        .filter(|&(_, n)| zeros || n > 0)
        .fold(Obj::new(), |o, (k, n)| o.num(k, n))
        .done()
}

pub(super) fn unit_counts(kinds: &[u16; NU]) -> String {
    counts(
        UNIT_KINDS
            .iter()
            .map(|k| (k.def().name, kinds[k.index()] as u32)),
        false,
    )
}

/// The unit kinds a people trains, in index order.
pub(super) fn trainable(f: &Faction) -> Vec<UnitKind> {
    let mut bldgs = vec![f.hq];
    bldgs.extend(f.build_basic.iter().chain(f.build_advanced));
    UNIT_KINDS
        .into_iter()
        .filter(|k| bldgs.iter().any(|b| b.def().trains.contains(k)))
        .collect()
}

/// A base a place may be named after: its center (tiles), its seat, what it is, and the ticks it stood from and to.
pub(super) type Base = (f64, f64, u8, &'static str, u32, u32);

/// The bases a place may be named after: each seat's start ("main base") and its expansions while they stood.
pub(super) fn bases(s: &Summary, w: &World) -> Vec<Base> {
    let mut v = Vec::new();
    for seat in 0..w.seats() {
        let d = w.factions[seat].hq.def();
        let half = |n: i32| n as f64 / 2.0;
        if let Some(&(tx, ty)) = w.map.bases.get(seat) {
            let (x, y) = (tx as f64 + half(d.w), ty as f64 + half(d.h));
            v.push((x, y, seat as u8, "main base", 0, u32::MAX));
        }
        for e in &s.seats[seat].expansions {
            let (x, y) = (e.tx as f64 + half(d.w), e.ty as f64 + half(d.h));
            v.push((
                x,
                y,
                seat as u8,
                "expansion",
                e.done,
                e.lost.unwrap_or(u32::MAX),
            ));
        }
    }
    v
}

/// A compass direction from (x0, y0) towards (x, y), tiles (y grows south).
fn direction(x0: f64, y0: f64, x: f64, y: f64) -> &'static str {
    const NAMES: [&str; 8] = [
        "east",
        "south-east",
        "south",
        "south-west",
        "west",
        "north-west",
        "north",
        "north-east",
    ];
    let a = crate::jsmath::atan2(y - y0, x - x0);
    let i = crate::jsmath::round(a / (crate::jsmath::PI / 4.0)).rem_euclid(8.0) as usize;
    NAMES[i]
}

/// A place (world px) at `tick`, named after the nearest base standing then: "seat 1's main base" within
/// `BASE_RADIUS` tiles of it, else so many tiles in a direction from it (no bare tiles).
pub(super) fn place(bases: &[Base], tick: u32, x: f64, y: f64) -> String {
    quote(&place_words(bases, tick, x / TILE, y / TILE))
}

/// `place`'s words, for a point in tiles.
pub(super) fn place_words(bases: &[Base], tick: u32, tx: f64, ty: f64) -> String {
    let near = bases
        .iter()
        .filter(|b| b.4 <= tick && tick <= b.5)
        .map(|b| (b, (b.0 - tx) * (b.0 - tx) + (b.1 - ty) * (b.1 - ty)))
        .min_by(|a, b| a.1.total_cmp(&b.1));
    match near {
        Some((b, d2)) if d2 <= BASE_RADIUS * BASE_RADIUS => format!("seat {}'s {}", b.2, b.3),
        Some((b, d2)) => format!(
            "open ground {} tiles {} of seat {}'s {}",
            crate::jsmath::round(d2.sqrt()),
            direction(b.0, b.1, tx, ty),
            b.2,
            b.3
        ),
        None => "open ground".into(),
    }
}

/// A fight: its deaths' span, center and losses.
struct Fight {
    start: u32,
    end: u32,
    x: f64,
    y: f64,
    deaths: Vec<Death>,
}

impl Fight {
    fn value(&self) -> i32 {
        self.deaths.iter().map(|d| d.thing.value()).sum()
    }
}

/// The deaths grouped into fights (in time order; each death joins the open fight it is near, else starts one).
fn fights(deaths: &[Death]) -> Vec<Fight> {
    let r2 = (FIGHT_RADIUS * TILE) * (FIGHT_RADIUS * TILE);
    let mut all: Vec<Fight> = Vec::new();
    for d in deaths {
        let open = all.iter_mut().rev().find(|f| {
            let (dx, dy) = (f.x - d.x, f.y - d.y);
            d.tick <= f.end + FIGHT_GAP && dx * dx + dy * dy <= r2
        });
        match open {
            Some(f) => {
                f.end = d.tick;
                f.deaths.push(*d);
            }
            None => all.push(Fight {
                start: d.tick,
                end: d.tick,
                x: d.x,
                y: d.y,
                deaths: vec![*d],
            }),
        }
    }
    all
}

/// Why a wave went, in words.
fn left_words(why: WaveWhy, units: usize, need: usize) -> String {
    match why {
        WaveWhy::Count => format!("count {units}/{need}"),
        WaveWhy::AtCap => format!("at its cap {units}/{need}"),
        WaveWhy::Crushing => {
            format!("short {units}/{need} but crushing what it expected")
        }
        WaveWhy::StallPush => {
            format!("stalled-game push {units}/{need}")
        }
        WaveWhy::Ordered => format!("ordered (attack now) {units}"),
    }
}

/// Why a wave ended, in words.
pub(super) fn end_words(e: WaveEnd) -> &'static str {
    match e {
        WaveEnd::AllFell => "all fell",
        WaveEnd::GaveUp => "under 40% left: came home",
        WaveEnd::Outmatched => "outmatched: pulled back",
        WaveEnd::Quiet => "nothing to fight: came home",
        WaveEnd::CalledHome => "called home by a raid",
        WaveEnd::PulledBack => "pulled back (ordered)",
    }
}

/// The reasons a step waited (seconds each), the biggest first: "not enough money 70%, ..." (None: it never waited).
pub(super) fn slip_words(s: &Summary, seat: usize, step: Step) -> Option<String> {
    let mut v: Vec<(String, u32)> = s.seats[seat]
        .slips
        .iter()
        .filter(|x| x.0 == step)
        .map(|x| (x.1.words(), x.2))
        .collect();
    let total: u32 = v.iter().map(|x| x.1).sum();
    if total == 0 {
        return None;
    }
    v.sort_by_key(|x| std::cmp::Reverse(x.1));
    Some(
        v.iter()
            .take(2)
            .filter(|(_, n)| n * 10 >= total)
            .map(|(w, n)| format!("{w} {}%", n * 100 / total))
            .collect::<Vec<_>>()
            .join(", "),
    )
}

fn attack_json(a: &Attack, bases: &[Base], held: Option<String>) -> String {
    let mut o = Obj::new()
        .raw("left", time(a.started))
        .num("units", a.kinds.iter().map(|&n| n as u32).sum::<u32>())
        .raw("composition", unit_counts(&a.kinds))
        .num("value", a.value);
    if let Some((why, units, need)) = a.left {
        o = o.str("went", &left_words(why, units, need));
    }
    if let Some(h) = held {
        o = o.str("held_by", &h);
    }
    o = match a.arrived {
        Some((t, seat, x, y)) => o
            .raw("arrived", time(t))
            .num("target_seat", seat)
            .raw("where", place(bases, t, x, y)),
        None => o.raw("arrived", "null"),
    };
    if let Some((ours, theirs)) = a.contact {
        o = o.raw(
            "contact",
            Obj::new().num("ours", ours).num("met", theirs).done(),
        );
    }
    let bldgs = counts(
        BLDG_KINDS
            .iter()
            .map(|k| (k.def().name, a.destroyed_bldgs[k.index()] as u32)),
        false,
    );
    let razed_hq = BLDG_KINDS
        .iter()
        .any(|k| k.def().hq && a.destroyed_bldgs[k.index()] > 0);
    let (d, l) = (a.destroyed_value, a.lost_value);
    let result = if a.ended.is_none() {
        "still out"
    } else if a.arrived.is_none() {
        "never arrived"
    } else if d == 0 && l == 0 {
        "no fighting"
    } else if razed_hq {
        "razed a headquarters"
    } else if d > 0 && 2 * d >= 3 * l {
        "won the exchange"
    } else if 2 * l >= 3 * d && l > 0 {
        "lost the exchange"
    } else {
        "even exchange"
    };
    o = o
        .raw("ended", a.ended.map_or("null".into(), time))
        .num("killed_value", d)
        .num("killed_units", a.killed_units);
    if bldgs != "{}" {
        o = o.raw("razed", bldgs);
    }
    o = o
        .num("lost_value", l)
        .num("lost_units", a.lost_units)
        .str("result", result);
    if let Some(e) = a.end_why {
        o = o.str("why_ended", end_words(e));
    }
    o.done()
}

/// The words for how a seat that is out went out.
fn why(o: OutWhy) -> &'static str {
    match o {
        OutWhy::In => "still in",
        OutWhy::Conceded => "conceded",
        OutWhy::Buildings => "destroyed",
        OutWhy::Helpless => "helpless",
    }
}

fn seat_json(s: &Summary, w: &World, seat: usize, bases: &[Base]) -> String {
    let r = &s.seats[seat];
    let me = seat as u8;
    let f = w.factions[seat];
    let player = if w.plan_of(me).is_some() {
        "AI (Hard) playing a written plan".to_string()
    } else if w.is_ai(me) {
        format!("AI ({})", LEVELS.get(w.diff_of(me)).unwrap_or(&"?"))
    } else {
        "person".into()
    };
    let outcome = if w.winner >= 0 && w.teams[seat] as i32 == w.winner {
        "won".to_string()
    } else if w.out[seat] {
        format!(
            "out at {}: {}",
            r.out_at.map_or("?".into(), |t| time(t).replace('"', "")),
            why(w.out_why[seat])
        )
    } else {
        "still in".into()
    };
    let ledger = w.ledger.get(seat).copied().unwrap_or_default();
    let mains: Vec<Base> = bases
        .iter()
        .filter(|b| b.3 == "main base")
        .copied()
        .collect();
    let expansions = array(r.expansions.iter().map(|e| {
        let d = f.hq.def();
        let (x, y) = (
            e.tx as f64 + d.w as f64 / 2.0,
            e.ty as f64 + d.h as f64 / 2.0,
        );
        Obj::new()
            .raw("completed", time(e.done))
            .str("where", &place_words(&mains, e.done, x, y))
            .raw("lost", e.lost.map_or("null".into(), time))
            .done()
    }));
    let economy = Obj::new()
        .raw("workers", array(&r.workers))
        .raw("income_per_min", array(&r.income_per_min))
        .raw("bank", array(&r.gold_banked))
        .num("mined_total", ledger.mined[0] + ledger.mined[1])
        .num("spent_total", ledger.spent[0] + ledger.spent[1])
        .raw("expansions", expansions)
        .done();
    let total = r.spent.iter().fold([0i64; 6], |mut a, b| {
        a.iter_mut().zip(b).for_each(|(x, y)| *x += y);
        a
    });
    let spent = Obj::new()
        .raw(
            "in_all",
            SPENT_ON
                .iter()
                .zip(total)
                .fold(Obj::new(), |o, (k, v)| o.num(k, v))
                .done(),
        )
        .str("by_5_min_columns", &SPENT_ON.join(","))
        .raw("by_5_min", array(r.spent.iter().map(array)))
        .done();
    let army_units = UNIT_KINDS
        .iter()
        .filter(|k| r.army.iter().any(|a| a[k.index()] > 0))
        .fold(Obj::new(), |o, k| {
            o.raw(
                k.def().name,
                array(r.army.iter().step_by(ARMY_EVERY).map(|a| a[k.index()])),
            )
        })
        .done();
    let army = Obj::new()
        .raw("value", array(&r.army_value))
        .raw("units_every_5_min", army_units)
        .done();
    // every unit type its people trains (zeros too), and any other it came to have
    let mut kinds = trainable(f);
    let others: Vec<UnitKind> = UNIT_KINDS
        .into_iter()
        .filter(|k| r.trained[k.index()] > 0 && !kinds.contains(k))
        .collect();
    kinds.extend(others);
    let trained = counts(
        kinds.iter().map(|k| (k.def().name, r.trained[k.index()])),
        true,
    );
    let first_trained = kinds
        .iter()
        .filter_map(|k| r.first_trained[k.index()].map(|t| (k.def().name, t)))
        .fold(Obj::new(), |o, (k, t)| o.raw(k, time(t)))
        .done();
    let built = BLDG_KINDS
        .iter()
        .filter(|k| r.built.iter().any(|b| b.0 == **k))
        .fold(Obj::new(), |o, k| {
            o.raw(
                k.def().name,
                array(r.built.iter().filter(|b| b.0 == *k).map(|b| time(b.1))),
            )
        })
        .done();
    let research = r
        .researched
        .iter()
        .fold(Obj::new(), |o, (up, level, t)| {
            o.raw(&up.level_name(*level), time(*t))
        })
        .done();
    let mine: Vec<&Attack> = s
        .attacks
        .done
        .iter()
        .chain(s.attacks.still_out())
        .filter(|a| a.seat == me)
        .collect();
    let attacks = array(mine.iter().enumerate().map(|(i, a)| {
        let held = if a.wave {
            slip_words(s, seat, Step::Wave(i))
        } else {
            None
        };
        attack_json(a, bases, held)
    }));
    let trades = UNIT_KINDS
        .iter()
        .filter(|k| r.trades[k.index()].0 > 0 || r.trades[k.index()].1 >= 0.5)
        .fold(Obj::new(), |o, k| {
            let (lost, killed) = r.trades[k.index()];
            o.raw(
                k.def().name,
                Obj::new()
                    .num("lost", lost)
                    .num("killed", crate::jsmath::round(killed) as i64)
                    .done(),
            )
        });
    let trades = if r.tower_kills >= 0.5 {
        trades.raw(
            &format!("{}s", f.ai.tower.def().name),
            Obj::new()
                .num("lost", 0)
                .num("killed", crate::jsmath::round(r.tower_kills) as i64)
                .done(),
        )
    } else {
        trades
    }
    .done();
    // losses: by kind, and what killed its units
    let (mut lu, mut lb, mut lv) = ([0u32; NU], [0u32; super::NB], 0);
    for d in s.deaths.iter().filter(|d| d.team == me) {
        lv += d.thing.value();
        match d.thing {
            Thing::Unit(k) => lu[k.index()] += 1,
            Thing::Bldg(k) => lb[k.index()] += 1,
        }
    }
    let row = w.lost_to.get(seat).cloned().unwrap_or_default();
    let killers = counts(
        UNIT_KINDS
            .iter()
            .map(|k| k.def().name)
            .chain(BLDG_KINDS.iter().map(|k| k.def().name))
            .zip(row.iter().copied().chain(std::iter::repeat(0))),
        false,
    );
    let losses = Obj::new()
        .num("value", lv)
        .raw(
            "units",
            counts(
                UNIT_KINDS.iter().map(|k| (k.def().name, lu[k.index()])),
                false,
            ),
        )
        .raw(
            "buildings",
            counts(
                BLDG_KINDS.iter().map(|k| (k.def().name, lb[k.index()])),
                false,
            ),
        )
        .raw("units_killed_by", killers)
        .done();
    let saw = array(
        (0..w.seats())
            .filter(|&e| w.enemies(me, e as u8))
            .map(|e| saw_json(s, w, seat, e, bases)),
    );
    let mut o = Obj::new()
        .num("seat", seat)
        .num("team", w.teams[seat])
        .str("people", f.name)
        .str("money", f.money)
        .str("player", &player);
    if let Some(st) = w.ai_style(me) {
        o = o.str("style", st.name());
        if let Some(k) = w.tuning(me).focus {
            o = o.str("leaning_unit", k.def().name);
        }
    }
    if w.plan_of(me).is_some() {
        o = o.raw("plan", super::plan::plan_json(s, w, seat, bases));
    }
    o.str("outcome", &outcome)
        .str(
            "attacks_are",
            if w.is_ai(me) {
                "its AI's attack waves"
            } else {
                "its fighting units coming near enemy buildings"
            },
        )
        .raw("economy", economy)
        .raw("spent", spent)
        .raw("army", army)
        .raw("units_trained", trained)
        .raw("first_trained", first_trained)
        .raw("buildings_completed", built)
        .raw("research_completed", research)
        .raw("attacks", attacks)
        .raw("trades", trades)
        .raw("losses", losses)
        .raw("saw_of_enemies", saw)
        .done()
}

fn saw_json(s: &Summary, w: &World, seat: usize, e: usize, bases: &[Base]) -> String {
    let v = &s.seats[seat].saw[e];
    let units = v
        .units
        .iter()
        .fold(Obj::new(), |o, (k, t)| o.raw(k.def().name, time(*t)))
        .done();
    let bldgs = v
        .bldgs
        .iter()
        .fold(Obj::new(), |o, (k, t)| o.raw(k.def().name, time(*t)))
        .done();
    let d = w.factions[e].hq.def();
    let mains: Vec<Base> = bases
        .iter()
        .filter(|b| b.3 == "main base")
        .copied()
        .collect();
    let expansions = array(v.expansions.iter().map(|&(_, t, tx, ty, done)| {
        Obj::new()
            .raw("first_seen", time(t))
            .str(
                "where",
                &place_words(
                    &mains,
                    t,
                    tx as f64 + d.w as f64 / 2.0,
                    ty as f64 + d.h as f64 / 2.0,
                ),
            )
            .num("finished_then", done)
            .done()
    }));
    let peak = v.peak.map_or("null".into(), |(n, t, kinds)| {
        Obj::new()
            .raw("at", time(t))
            .num("units", n)
            .raw("composition", unit_counts(&kinds))
            .done()
    });
    Obj::new()
        .num("enemy_seat", e)
        .raw("first_seen_units", units)
        .raw("first_seen_buildings", bldgs)
        .raw("expansions_seen", expansions)
        .raw("largest_army_seen", peak)
        .done()
}

pub(super) fn write(s: &Summary, w: &World, timed_out: bool) -> String {
    let bases = bases(s, w);
    let n = w.seats();
    let end = s.over_at.unwrap_or(w.tick);
    let result = if w.winner >= 0 {
        let losers: Vec<&str> = (0..n)
            .filter(|&t| w.teams[t] as i32 != w.winner)
            .map(|t| why(w.out_why[t]))
            .collect();
        let how = if losers.iter().all(|h| *h == losers[0]) {
            losers[0].to_string()
        } else {
            losers.join(", ")
        };
        Obj::new()
            .raw(
                "winning_seats",
                array((0..n).filter(|&t| w.teams[t] as i32 == w.winner)),
            )
            .str("how", &how)
            .raw("at", time(end))
    } else {
        Obj::new()
            .raw("winning_seats", "[]")
            .str("how", if timed_out { "timeout" } else { "unfinished" })
            .raw("at", time(end))
    }
    .done();
    let mut fs = fights(&s.deaths);
    fs.sort_by_key(|f| std::cmp::Reverse(f.value())); // (stable: the earlier first among equals)
    fs.truncate(MAIN_FIGHTS);
    fs.sort_by_key(|f| f.start);
    let main_fights = array(fs.iter().map(|f| {
        let losses = array((0..n).filter_map(|t| {
            let mine: Vec<&Death> = f.deaths.iter().filter(|d| d.team as usize == t).collect();
            if mine.is_empty() {
                return None;
            }
            let mut kinds: Vec<(&str, u32)> = Vec::new();
            for d in &mine {
                match kinds.iter_mut().find(|k| k.0 == d.thing.name()) {
                    Some(k) => k.1 += 1,
                    None => kinds.push((d.thing.name(), 1)),
                }
            }
            Some(
                Obj::new()
                    .num("seat", t)
                    .num("value", mine.iter().map(|d| d.thing.value()).sum::<i32>())
                    .raw("lost", counts(kinds, false))
                    .done(),
            )
        }));
        Obj::new()
            .raw("from", time(f.start))
            .raw("to", time(f.end))
            .raw("where", place(&bases, f.start, f.x, f.y))
            .raw("losses", losses)
            .done()
    }));
    let about = format!(
        "Ebbfall game summary. Times: game time m:ss. Values: cost in each seat's money (gold for the Kingdom, energy \
         for the Expedition). saw_of_enemies: only what that seat's (and its allies') sight showed. An attack arrives \
         within {REACH} tiles of an enemy building."
    );
    let sampled = match (s.samples.first(), s.samples.last()) {
        (Some(&a), Some(&b)) => format!(
            "economy and army values every minute, from {} to {}; army units every 5 minutes; spending by 5 minutes",
            time(a).replace('"', ""),
            time(b).replace('"', "")
        ),
        _ => "none yet".into(),
    };
    Obj::new()
        .str("about", &about)
        .raw(
            "map",
            Obj::new()
                .str("kind", &format!("{:?}", w.map_kind))
                .str("size", &format!("{}x{}", w.map.w, w.map.h))
                .num("seed", w.seed)
                .done(),
        )
        .raw("length", time(end))
        .raw("result", result)
        .str("per_minute", &sampled)
        .raw("seats", array((0..n).map(|t| seat_json(s, w, t, &bases))))
        .raw("main_fights", main_fights)
        .done()
}
