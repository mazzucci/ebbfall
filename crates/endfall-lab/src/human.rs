//! A human's opening (the PM, Nov 13: "measure it as a human would"): the lab's AIs spend every coin at once, so its gold
//! checks never see what a person feels. Here a plain scripted player opens on its own (nobody's AI, no foe moving):
//! workers to a crew on its mine, its supply when it runs short, one production building from 1:00, a second once the
//! first stands, then units from each, one at a time, in that order, saving for the first thing it cannot pay for. From
//! 1:00 to 8:00 it records its bank, whether it is waiting for gold, and whether its production is busy. The target:
//! from 2:00 to 6:00 it keeps one production building busy or builds a second, not both, and the bank does not pile up
//! while doing one.

use crate::json::Json;
use crate::stats::mmss;
use endfall_sim::data::{BldgKind, FACTIONS, Faction, Pool, UnitKind};
use endfall_sim::map::{Id, MapKind, MapSize};
use endfall_sim::world::{Task, World};

/// Map seeds a people and size plays.
pub const SEEDS: u32 = 3;
/// The window the target is about (s), and the whole record's.
const FROM: f64 = 120.0;
const TO: f64 = 360.0;
const END: f64 = 480.0;
/// The script looks every this many ticks (half a second).
const EVERY: u32 = 15;

/// One opening's record: (time, bank, waiting for gold, production buildings standing, of them busy), every look
/// from 1:00, and when its second production building was placed.
#[derive(Clone, Debug, Default)]
pub struct Opening {
    pub looks: Vec<(f64, i32, bool, usize, usize)>,
    pub second_at: Option<f64>,
    pub workers_at_6: usize,
}

/// A free spot for `kind` in rings round `team`'s headquarters.
fn spot(w: &World, team: u8, kind: BldgKind) -> Option<(i32, i32)> {
    let hq = w.bldgs.iter().find(|b| b.team == team && b.kind.def().hq)?;
    let (cx, cy) = (
        hq.tx as f64 + hq.w as f64 / 2.0,
        hq.ty as f64 + hq.h as f64 / 2.0,
    );
    for r in 4..16 {
        for a in 0..24 {
            let ang = a as f64 / 24.0 * std::f64::consts::TAU;
            let tx = endfall_sim::jsmath::round(cx + ang.cos() * r as f64 - 1.0) as i32;
            let ty = endfall_sim::jsmath::round(cy + ang.sin() * r as f64 - 1.0) as i32;
            if w.can_place(kind, tx, ty, team) {
                return Some((tx, ty));
            }
        }
    }
    None
}

/// Play one opening of `faction` on map `seed` at `size` tiles.
pub fn play(faction: &'static Faction, seed: u32, size: i32) -> Opening {
    let other = FACTIONS
        .iter()
        .copied()
        .find(|f| f.name != faction.name)
        .unwrap();
    let mut w = World::with_size(
        seed,
        1,
        MapKind::Standard,
        MapSize::square(size),
        0,
        &[faction, other],
    );
    assert!(w.set_ai_seats([false, false]), "nobody's AI");
    let me = 0u8;
    let crew = w.harv_target_of(me, 1);
    let (rax, basic) = (faction.ai.rax, faction.ai.basic);
    let mut out = Opening::default();
    let mut placed: Vec<Id> = vec![];
    while w.time < END {
        w.step();
        w.events.clear();
        if !w.tick.is_multiple_of(EVERY) {
            continue;
        }
        let hq = w
            .bldgs
            .iter()
            .find(|b| b.team == me && b.kind.def().hq && b.done)
            .map(|b| (b.id, b.x, b.y));
        let Some((hq, hx, hy)) = hq else { break };
        // Idle workers to the nearest mine with gold.
        let idle: Vec<Id> = w
            .units
            .iter()
            .filter(|u| u.team == me && u.kind == faction.worker && u.task == Task::Idle)
            .map(|u| u.id)
            .collect();
        for u in idle {
            let mine = w
                .map
                .nodes
                .iter()
                .filter(|n| !n.ether && n.amount > 0)
                .min_by(|a, b| {
                    endfall_sim::jsmath::hypot(a.x - hx, a.y - hy)
                        .total_cmp(&endfall_sim::jsmath::hypot(b.x - hx, b.y - hy))
                        .then(a.id.cmp(&b.id))
                })
                .map(|n| n.id);
            if let Some(n) = mine {
                w.start_gather(u, n);
            }
        }
        // Its wants, in order; it saves for the first it cannot pay for.
        let workers = w
            .units
            .iter()
            .filter(|u| u.team == me && u.kind == faction.worker)
            .count();
        let hq_queue = w.bldg(hq).map_or(0, |b| b.queue.len());
        let [used, cap] = w.pool(me, Pool::Supply);
        let supply_rising = w
            .bldgs
            .iter()
            .any(|b| b.team == me && b.kind == faction.supply && !b.done);
        let prods: Vec<Id> = placed.clone();
        let done: Vec<Id> = prods
            .iter()
            .copied()
            .filter(|&b| w.bldg(b).is_some_and(|b| b.done))
            .collect();
        let mut wants: Vec<Want> = vec![];
        if workers + hq_queue < crew && hq_queue == 0 {
            wants.push(Want::Unit(hq, faction.worker));
        }
        if cap - used < 3 && cap < w.pool_max(me, Pool::Supply) && !supply_rising {
            wants.push(Want::Bldg(faction.supply));
        }
        if w.time >= 60.0 && prods.is_empty() {
            wants.push(Want::Bldg(rax));
        }
        if prods.len() == 1 && done.len() == 1 {
            wants.push(Want::Bldg(rax));
        }
        for &b in &done {
            let room = basic.def().pool != Pool::Hired || {
                let [h, m] = w.pool(me, Pool::Hired);
                h + basic.def().supply <= m
            };
            if w.bldg(b).is_some_and(|b| b.queue.is_empty()) && room {
                wants.push(Want::Unit(b, basic));
            }
        }
        let mut waiting = false;
        for want in wants {
            let cost = match want {
                Want::Unit(_, k) => k.def().cost,
                Want::Bldg(k) => k.def().cost,
            };
            if !w.can_afford(me, cost) {
                waiting = true;
                break;
            }
            match want {
                Want::Unit(b, k) => {
                    let _ = w.queue_unit(b, k);
                }
                Want::Bldg(k) => {
                    let builder = w
                        .units
                        .iter()
                        .filter(|u| u.team == me && u.kind == faction.worker)
                        .find(|u| matches!(u.task, Task::Gather { .. }))
                        .map(|u| u.id);
                    if let (Some(u), Some((tx, ty))) = (builder, spot(&w, me, k))
                        && let Ok(id) = w.place_building(me, k, tx, ty, Some(u))
                        && k == rax
                    {
                        placed.push(id);
                        if placed.len() == 2 {
                            out.second_at = Some(w.time);
                        }
                    }
                }
            }
        }
        if w.time >= 60.0 {
            let busy = done
                .iter()
                .filter(|&&b| w.bldg(b).is_some_and(|b| !b.queue.is_empty()))
                .count();
            out.looks
                .push((w.time, w.res[me as usize][0], waiting, done.len(), busy));
        }
        if (w.time - TO).abs() < 0.26 {
            out.workers_at_6 = workers;
        }
    }
    out
}

#[derive(Clone, Copy)]
enum Want {
    Unit(Id, UnitKind),
    Bldg(BldgKind),
}

/// The figures of a set of openings over 2:00-6:00: the bank's median and its most, the share of looks waiting for gold,
/// the share of production-building looks busy, the second building's median placing, workers at 6:00.
pub struct Figures {
    pub bank_median: f64,
    pub bank_most: i32,
    pub waiting: f64,
    pub busy: f64,
    pub second_at: Option<f64>,
    pub workers: f64,
    pub bank_at: Vec<(u32, f64)>,
}

fn median(mut v: Vec<f64>) -> f64 {
    v.sort_by(f64::total_cmp);
    v.get(v.len() / 2).copied().unwrap_or(f64::NAN)
}

pub fn figures(ops: &[Opening]) -> Figures {
    let window: Vec<&(f64, i32, bool, usize, usize)> = ops
        .iter()
        .flat_map(|o| o.looks.iter())
        .filter(|l| l.0 >= FROM && l.0 <= TO)
        .collect();
    let n = window.len().max(1) as f64;
    let prod: usize = window.iter().map(|l| l.3).sum();
    let busy: usize = window.iter().map(|l| l.4).sum();
    let seconds: Vec<f64> = ops.iter().filter_map(|o| o.second_at).collect();
    let bank_at = (1..=8u32)
        .map(|m| {
            let at = m as f64 * 60.0;
            let v: Vec<f64> = ops
                .iter()
                .filter_map(|o| o.looks.iter().find(|l| l.0 >= at).map(|l| l.1 as f64))
                .collect();
            (m, median(v))
        })
        .collect();
    Figures {
        bank_median: median(window.iter().map(|l| l.1 as f64).collect()),
        bank_most: window.iter().map(|l| l.1).max().unwrap_or(0),
        waiting: window.iter().filter(|l| l.2).count() as f64 / n,
        busy: if prod > 0 {
            busy as f64 / prod as f64
        } else {
            0.0
        },
        second_at: (!seconds.is_empty()).then(|| median(seconds.clone())),
        workers: median(ops.iter().map(|o| o.workers_at_6 as f64).collect()),
        bank_at,
    }
}

/// Each people's openings at each size.
pub fn rows(sizes: &[i32]) -> Vec<(&'static str, i32, Figures)> {
    let mut out = vec![];
    for f in FACTIONS {
        for &size in sizes {
            let ops: Vec<Opening> = (1..=SEEDS).map(|s| play(f, s, size)).collect();
            out.push((f.name, size, figures(&ops)));
        }
    }
    out
}

/// The report's section.
pub fn markdown(rows: &[(&'static str, i32, Figures)]) -> String {
    let mut s = format!(
        "\n## A human's opening\n\nA plain scripted player alone (no AI, no foe moving), {SEEDS} map seeds a people and size: workers to its crew, supply when short, a production building from 1:00, a second once the first stands, then units from each, one at a time, saving for the first thing it cannot pay for. Over 2:00-6:00: its bank (median, most), the share of the time it waits for gold, and the share of its production buildings' time busy; then its bank each minute. The target: one production building busy or a second one built, not both, and no bank piling up while doing one.\n\n| People | Size | Bank 2-6 (median, most) | Waiting for gold | Production busy | Second placed | Workers at 6:00 | Bank at 1:00 ... 8:00 |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n"
    );
    for (p, size, f) in rows {
        let at: Vec<String> = f.bank_at.iter().map(|(_, b)| format!("{b:.0}")).collect();
        s += &format!(
            "| {p} | {size} | {:.0}, {} | {:.0}% | {:.0}% | {} | {:.0} | {} |\n",
            f.bank_median,
            f.bank_most,
            100.0 * f.waiting,
            100.0 * f.busy,
            f.second_at.map_or("—".into(), mmss),
            f.workers,
            at.join(", ")
        );
    }
    s
}

pub fn json(rows: &[(&'static str, i32, Figures)]) -> Vec<Json> {
    rows.iter()
        .map(|(p, size, f)| {
            Json::obj()
                .with("people", *p)
                .with("size", *size as i64)
                .with("bank_median", f.bank_median)
                .with("bank_most", f.bank_most as i64)
                .with("waiting", f.waiting)
                .with("busy", f.busy)
                .with("second_at", f.second_at)
                .with("workers_at_6", f.workers)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_human_s_opening_builds_its_two_production_buildings_and_records_its_bank() {
        let o = play(FACTIONS[0], 1, 64);
        assert!(
            o.second_at.is_some(),
            "its second production building placed"
        );
        assert!(
            o.looks.len() > 800,
            "looks from 1:00 to 8:00, every half second"
        );
        assert!(o.workers_at_6 >= 6, "its crew grew: {}", o.workers_at_6);
        let f = figures(&[o]);
        assert!(f.busy > 0.0 && f.bank_at.len() == 8);
    }
}
