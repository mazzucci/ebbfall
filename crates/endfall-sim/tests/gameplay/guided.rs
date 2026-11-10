//! The guided first game (the menu's FIRST GAME, src/client/tutorial.js): Easy, Ashen Basin (seed 4242, the Standard
//! map), Humans against Humans. A newcomer who follows the checklist, at a newcomer's pace, holds the first wave with
//! the army the guide asks for, then wins with the army its last step asks for.

use crate::common::*;
use endfall_sim::world::Command;

/// The guide's army: six Pickets (a 1-population line unit: six fit under the first cap) and two Harpooners.
const SOLDIERS: usize = 6;
const ANTI_AIR: usize = 2;
/// The army the guide's last step asks for before the attack (tutorial.js `goal`): one Picket more than the
/// Lighthouse's population holds with the guide's six workers and its army, so the Cottage step comes first.
fn army_goal() -> usize {
    let room = BldgKind::Core.def().supply as usize - 6 - SOLDIERS - ANTI_AIR;
    SOLDIERS + ANTI_AIR + room + 1
}
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
    /// The guide's Excavator, on its open shaft, still standing after the wave.
    extractor: bool,
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

/// A spot for `kind` near the player's Core (`spot`'s rings) with none of the player's units on or right by it.
fn clear_spot(w: &World, kind: BldgKind) -> (i32, i32) {
    let (cx, cy) = core(w, PLAYER);
    let d = kind.def();
    for r in 3..16 {
        for a in 0..24 {
            let ang = a as f64 / 24.0 * std::f64::consts::TAU;
            let tx = (cx as f64 + 2.0 + ang.cos() * r as f64 - 1.0).round() as i32;
            let ty = (cy as f64 + 2.0 + ang.sin() * r as f64 - 1.0).round() as i32;
            let (mx, my) = (
                (tx as f64 + d.w as f64 / 2.0) * TILE,
                (ty as f64 + d.h as f64 / 2.0) * TILE,
            );
            let crowded = w
                .units
                .iter()
                .any(|u| u.team == PLAYER && (u.x - mx).hypot(u.y - my) < 3.0 * TILE);
            if w.can_place(kind, tx, ty, PLAYER) && !crowded {
                return (tx, ty);
            }
        }
    }
    spot(w, kind)
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
fn play_guided(seed: u32, pace: f64, react: f64) -> (Guided, World) {
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
            // A Crew Hall; later (step 3) an Excavator on the mine shaft the guide pings.
            1 | 3 => {
                let kind = if step == 1 {
                    BldgKind::Barracks
                } else {
                    BldgKind::Extractor
                };
                if done(&w, kind).is_some() {
                    step += 1;
                    step_at = t;
                    if step == 4 {
                        w.guided_hold(false); // (the army and the Market ready: the guide lets them come)
                        released = Some(t);
                    }
                } else if !reading && !placed(&w, kind) {
                    let (tx, ty) = spot(&w, kind);
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
            2 => {
                let rax = done(&w, BldgKind::Barracks).unwrap();
                let (n, aa) = (
                    count(&w, PLAYER, UnitKind::Trooper),
                    count(&w, PLAYER, UnitKind::Lancer),
                );
                if n >= SOLDIERS && aa >= ANTI_AIR {
                    step = 3;
                    step_at = t;
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
    let g = Guided {
        released,
        wave: wave.len(),
        arrived: arrived.expect("the wave reached the base"),
        kills: wave.iter().filter(|&&id| w.unit(id).is_none()).count(),
        army_left: army(&w).len(),
        core: w.bldg(lighthouse).is_some(),
        extractor: done(&w, BldgKind::Extractor).is_some(),
    };
    (g, w)
}

/// The guide's last two steps, after the wave: a Cottage (the population the last army needs), then train with the
/// bank until the army is `army_goal()` strong (after `pace` s of reading each), then attack-move it at the enemy Lighthouse, and at the nearest enemy building whenever it stands idle
/// (what a newcomer does once the Lighthouse is down). The game time it is won at, if within 8 minutes.
fn win_guided(w: &mut World, pace: f64) -> Option<f64> {
    w.guided_hold(false); // (released already, unless the hold ran out first)
    let from = w.time;
    let mut attacking = false;
    for tick in 0..30 * 480u32 {
        w.step();
        w.events.clear();
        if w.over {
            return (w.winner == PLAYER as i32).then_some(w.time);
        }
        if tick % 15 != 0 {
            continue;
        }
        // The guided opponent after the release: at most 3 fighters trained (a wave's survivors may add one), no Lookout.
        let foes = w
            .units
            .iter()
            .filter(|u| u.team == ENEMY && !u.kind.def().worker)
            .count();
        assert!(
            foes <= 4,
            "the guided opponent keeps at most 3 fighters (plus a wave survivor): {foes}"
        );
        assert!(
            !w.bldgs
                .iter()
                .any(|b| b.team == ENEMY && b.kind == BldgKind::Turret),
            "the guided opponent raises no Lookout"
        );
        if w.time - from < pace {
            continue;
        }
        for h in idle_workers(w) {
            if let Some(n) = nearest_field(w, h) {
                let _ = w.apply(PLAYER, &Command::Gather { unit: h, node: n });
            }
        }
        // The population step: a Cottage first (its site resumed if its builder ran from a passing enemy, as the
        // site's Resume does for a player).
        if done(w, BldgKind::Depot).is_none() {
            let builder = harvesters(w, PLAYER)
                .into_iter()
                .find(|&h| matches!(w.unit(h).unwrap().task, Task::Gather { .. }));
            let site = w
                .bldgs
                .iter()
                .find(|b| b.team == PLAYER && b.kind == BldgKind::Depot)
                .map(|b| b.id);
            let tended = |w: &World, b: Id| w.units.iter().any(|u| u.task == Task::Build { b });
            if let (Some(b), Some(h)) = (site, builder)
                && !tended(w, b)
            {
                let _ = w.apply(PLAYER, &Command::Build { unit: h, bldg: b });
            }
            if !placed(w, BldgKind::Depot)
                && let Some(h) = builder
            {
                // (where no unit of ours stands: a site does not rise under the army, and a player puts a Cottage
                // where there is room)
                let (tx, ty) = clear_spot(w, BldgKind::Depot);
                let _ = w.apply(
                    PLAYER,
                    &Command::Place {
                        kind: BldgKind::Depot,
                        tx,
                        ty,
                        builder: Some(h),
                    },
                );
            }
        }
        let a = army(w);
        if !attacking {
            let Some(rax) = done(w, BldgKind::Barracks) else {
                continue;
            };
            let q = w.bldg(rax).unwrap().queue.len();
            if a.len() >= army_goal() {
                attacking = true;
            } else if a.len() + q < army_goal() && q < 2 {
                let _ = w.apply(
                    PLAYER,
                    &Command::Queue {
                        bldg: rax,
                        kind: UnitKind::Trooper,
                    },
                );
                continue;
            } else {
                continue;
            }
        }
        // (the enemy Lighthouse first, then whatever stands nearest the army)
        let (cx, cy) = {
            let n = a.len().max(1) as f64;
            let (sx, sy) = a
                .iter()
                .filter_map(|&id| w.unit(id))
                .fold((0.0, 0.0), |s, u| (s.0 + u.x, s.1 + u.y));
            (sx / n, sy / n)
        };
        let goal = w
            .bldgs
            .iter()
            .filter(|b| b.team == ENEMY)
            .min_by(|p, q| {
                let key = |b: &&endfall_sim::world::Bldg| {
                    (b.kind != BldgKind::Core, (b.x - cx).hypot(b.y - cy))
                };
                key(p).partial_cmp(&key(q)).unwrap().then(p.id.cmp(&q.id))
            })
            .map(|b| (b.x, b.y));
        let idle: Vec<Id> = a
            .iter()
            .copied()
            .filter(|&id| w.unit(id).is_some_and(|u| matches!(u.task, Task::Idle)))
            .collect();
        if let Some((x, y)) = goal
            && !idle.is_empty()
        {
            let _ = w.apply(PLAYER, &Command::GroupAttackMove { units: idle, x, y });
        }
    }
    None
}

#[test]
fn the_guided_first_game_holds_the_first_wave_and_is_won_by_following_the_guide() {
    // The guide's map at three paces (a quick reader; a slow one; one so slow that the hold runs out at 6:00 before
    // the army is trained), and other Standard seeds; the army, standing where it was trained, is sent at the wave
    // 20 s after it reaches the base. Held, the opponent's army stops at four (the sim's GUIDED_ARMY), so its first
    // wave is half the guide's eight (it was 10 to 15 before: the eight fell, and the Lighthouse with them). Then the
    // last steps: a Cottage (the Lighthouse's 20 population hold the guide's six workers and eight soldiers, not the
    // last army), fifteen strong with the bank, and the attack. Released, the opponent's army stays at three at most (the
    // sim's GUIDED_ARMY_AFTER) and it raises no towers: the guide's way wins (it never did with them: a Lookout under
    // repair and a refilled army stopped even twenty Pickets).
    for (seed, pace) in [
        (4242, 5.0),
        (4242, 20.0),
        (4242, 30.0),
        (1, 15.0),
        (7, 15.0),
        (99, 15.0),
    ] {
        let (g, mut w) = play_guided(seed, pace, 20.0);
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
        assert!(g.core, "{ctx}: the Lighthouse stands");
        assert!(
            g.extractor,
            "{ctx}: the Excavator on its open shaft survives the first wave"
        );
        // (more than half: the Guards fight up close since the re-theme, and lose a little more than the Pickets did)
        assert!(
            g.army_left > (SOLDIERS + ANTI_AIR) / 2,
            "{ctx}: most of the guide's army lives"
        );
        let from = w.time;
        let won = win_guided(&mut w, pace);
        eprintln!(
            "seed {seed} pace {pace}: wave {} held at {:.0} s; steps 6 and 7 from {from:.0} s, won at {won:?}",
            g.wave, g.arrived
        );
        assert!(
            won.is_some_and(|t| t - from < 360.0),
            "{ctx}: the guide's last step wins the game within 6 minutes (from {from:.0} s): {won:?}"
        );
        assert!(
            done(&w, BldgKind::Extractor).is_some(),
            "{ctx}: the Excavator on its open shaft stands at the end"
        );
        assert!(
            done(&w, BldgKind::Depot).is_some(),
            "{ctx}: the Cottage the last army needed"
        );
    }
}
