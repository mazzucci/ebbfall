//! The guided first game (the menu's FIRST GAME, src/client/tutorial.js): Easy, Ashen Basin (seed 4242, the Standard
//! map), Humans against Humans. A newcomer who follows the checklist, at a newcomer's pace, holds the first wave with
//! the army the guide asks for.

use crate::common::*;
use endfall_sim::world::Command;

/// The guide's army: six Pickets (a 1-energy line unit: six fit under the first cap) and two Harpooners.
const SOLDIERS: usize = 6;
const ANTI_AIR: usize = 2;
/// An enemy this close to the player's Lighthouse (px) is at the base.
const AT_BASE: f64 = 14.0 * 32.0;

/// What one guided game came to.
#[derive(Debug)]
struct Guided {
    released: Option<f64>,
    wave: usize,
    arrived: f64,
    kills: usize,
    army_left: usize,
    core: bool,
    depot: bool,
}

fn idle_workers(w: &World) -> Vec<Id> {
    w.units
        .iter()
        .filter(|u| u.team == PLAYER && u.kind.def().worker && matches!(u.task, Task::Idle))
        .map(|u| u.id)
        .collect()
}

fn nearest_field(w: &World, id: Id) -> Option<Id> {
    let u = w.unit(id)?;
    w.map
        .nodes
        .iter()
        .filter(|n| !n.ether && n.amount > 0)
        .min_by(|a, b| {
            let da = (a.tx as f64 * 32.0 - u.x).hypot(a.ty as f64 * 32.0 - u.y);
            let db = (b.tx as f64 * 32.0 - u.x).hypot(b.ty as f64 * 32.0 - u.y);
            da.partial_cmp(&db).unwrap().then(a.id.cmp(&b.id))
        })
        .map(|n| n.id)
}

fn done(w: &World, kind: BldgKind) -> Option<Id> {
    w.bldgs
        .iter()
        .find(|b| b.team == PLAYER && b.kind == kind && b.done)
        .map(|b| b.id)
}

fn placed(w: &World, kind: BldgKind) -> bool {
    w.bldgs.iter().any(|b| b.team == PLAYER && b.kind == kind)
}

fn army(w: &World) -> Vec<Id> {
    w.units
        .iter()
        .filter(|u| u.team == PLAYER && matches!(u.kind, UnitKind::Trooper | UnitKind::Lancer))
        .map(|u| u.id)
        .collect()
}

/// Play the guide on `seed` at `pace` (seconds the newcomer takes to read each step before acting) and `react`
/// (seconds before the army is sent at the wave once it reaches the base).
fn play_guided(seed: u32, pace: f64, react: f64) -> Guided {
    let mut w = World::new(seed, 0);
    w.guided_hold(true); // (the client's holdWaves(true) as the guided game starts)
    let lighthouse = w
        .bldgs
        .iter()
        .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
        .unwrap()
        .id;
    let (lx, ly) = {
        let b = w.bldg(lighthouse).unwrap();
        (b.x, b.y)
    };
    let start_workers = harvesters(&w, PLAYER).len();
    let mut step = 0;
    let mut step_at = 0.0;
    let mut released = None;
    let mut wave: Option<Vec<Id>> = None;
    let mut arrived = None;
    let mut sent = false;
    let mut over_since = None;
    for tick in 0..30 * 900u32 {
        w.step();
        w.events.clear();
        let t = w.time;
        if tick % 15 != 0 {
            continue;
        }
        // (a newcomer's workers go back to mining: the Lighthouse's own, and a builder whose building stands)
        for h in idle_workers(&w) {
            if let Some(n) = nearest_field(&w, h) {
                let _ = w.apply(PLAYER, &Command::Gather { unit: h, node: n });
            }
        }
        let reading = t - step_at < pace;
        let builder = || {
            harvesters(&w, PLAYER)
                .into_iter()
                .find(|&h| matches!(w.unit(h).unwrap().task, Task::Gather { .. }))
        };
        match step {
            // Train two workers.
            0 => {
                if harvesters(&w, PLAYER).len() >= start_workers + 2 {
                    step = 1;
                    step_at = t;
                } else if !reading && w.bldg(lighthouse).unwrap().queue.is_empty() {
                    let _ = w.apply(
                        PLAYER,
                        &Command::Queue {
                            bldg: lighthouse,
                            kind: UnitKind::Harvester,
                        },
                    );
                }
            }
            // A Windmast, a Pump on a brine seep, a Crew Hall.
            1..=3 => {
                let kind = [BldgKind::Depot, BldgKind::Extractor, BldgKind::Barracks][step - 1];
                if done(&w, kind).is_some() {
                    step += 1;
                    step_at = t;
                } else if !reading && !placed(&w, kind) {
                    let (tx, ty) = if kind.def().on_vent {
                        player_vent(&w)
                    } else {
                        spot(&w, kind)
                    };
                    if let Some(h) = builder() {
                        let _ = w.apply(
                            PLAYER,
                            &Command::Place {
                                kind,
                                tx,
                                ty,
                                builder: Some(h),
                            },
                        );
                    }
                }
            }
            // The army: six Pickets and two Harpooners.
            4 => {
                let rax = done(&w, BldgKind::Barracks).unwrap();
                let (n, aa) = (
                    count(&w, PLAYER, UnitKind::Trooper),
                    count(&w, PLAYER, UnitKind::Lancer),
                );
                if n >= SOLDIERS && aa >= ANTI_AIR {
                    step = 5;
                    step_at = t;
                    w.guided_hold(false); // (the guide lets them come)
                    released = Some(t);
                } else if !reading {
                    let q = &w.bldg(rax).unwrap().queue;
                    let queued = |k| q.iter().filter(|&&x| x == k).count();
                    let kind = if n + queued(UnitKind::Trooper) < SOLDIERS {
                        Some(UnitKind::Trooper)
                    } else if aa + queued(UnitKind::Lancer) < ANTI_AIR {
                        Some(UnitKind::Lancer)
                    } else {
                        None
                    };
                    if let Some(kind) = kind.filter(|_| q.len() < 2) {
                        let _ = w.apply(PLAYER, &Command::Queue { bldg: rax, kind });
                    }
                }
            }
            _ => {}
        }
        if wave.is_none() {
            wave = w.ai_wave_of(ENEMY).map(|a| a.to_vec());
        }
        let near: Vec<(f64, f64)> = w
            .units
            .iter()
            .filter(|u| u.team == ENEMY && u.kind.def().armed() && !u.kind.def().worker)
            .filter(|u| (u.x - lx).hypot(u.y - ly) < AT_BASE)
            .map(|u| (u.x, u.y))
            .collect();
        if arrived.is_none() && !near.is_empty() {
            arrived = Some(t);
        }
        // A late reaction, no micro: once, the whole army attack-moves at the first enemy it saw.
        if let Some(a) = arrived
            && !sent
            && t - a >= react
        {
            sent = true;
            let target = near.first().copied().unwrap_or((lx, ly));
            let _ = w.apply(
                PLAYER,
                &Command::GroupAttackMove {
                    units: army(&w),
                    x: target.0,
                    y: target.1,
                },
            );
        }
        // Over: the wave came and no enemy army is at the base for 20 s (or the Lighthouse fell).
        if arrived.is_some() && near.is_empty() {
            if t - *over_since.get_or_insert(t) > 20.0 {
                break;
            }
        } else {
            over_since = None;
        }
        if w.bldg(lighthouse).is_none() || w.over {
            break;
        }
    }
    let wave = wave.expect("a first wave");
    Guided {
        released,
        wave: wave.len(),
        arrived: arrived.expect("the wave reached the base"),
        kills: wave.iter().filter(|&&id| w.unit(id).is_none()).count(),
        army_left: army(&w).len(),
        core: w.bldg(lighthouse).is_some(),
        depot: done(&w, BldgKind::Depot).is_some(),
    }
}

#[test]
fn the_guided_first_game_s_army_holds_the_first_wave() {
    // The guide's map at three paces (a quick reader; a slow one; one so slow that the hold runs out at 6:00 before
    // the army is trained), and other Standard seeds; the army, standing where it was trained, is sent at the wave
    // 20 s after it reaches the base. Held, the opponent's army stops at four (the sim's GUIDED_ARMY), so its first
    // wave is half the guide's eight (it was 10 to 15 before: the eight fell, and the Lighthouse with them).
    for (seed, pace) in [
        (4242, 5.0),
        (4242, 20.0),
        (4242, 30.0),
        (1, 15.0),
        (7, 15.0),
        (99, 15.0),
    ] {
        let g = play_guided(seed, pace, 20.0);
        let ctx = format!("seed {seed} pace {pace}: {g:?}");
        let held_until = g.released.map_or(360.0, |r| r.min(360.0));
        assert!(g.arrived > held_until, "{ctx}: no wave while held");
        assert!(
            g.wave <= 4,
            "{ctx}: the first wave is half the guide's army"
        );
        assert!(
            g.kills + 1 >= g.wave,
            "{ctx}: the wave is destroyed or driven off"
        );
        assert!(
            g.core && g.depot,
            "{ctx}: the Lighthouse and the Windmast stand"
        );
        assert!(
            g.army_left >= SOLDIERS + ANTI_AIR - 2,
            "{ctx}: most of the guide's army lives"
        );
    }
}
