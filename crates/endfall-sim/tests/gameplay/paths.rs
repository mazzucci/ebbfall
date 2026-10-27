//! Group paths (M4 step 2d): units of a seat given one order share one route, long searches are budgeted per seat per
//! tick (the rest wait their turn), every route a unit takes is walkable, and everyone still arrives.

use crate::common::*;
use endfall_sim::path::{Pt, los};
use endfall_sim::world::{LONG_SEARCH, LONG_SEARCHES};

/// A 128x128 map for two seats with nobody playing (no AI: only the test's orders move anything).
fn big(seed: u32, kind: MapKind) -> World {
    let mut w = World::with_size(seed, 1, kind, MapSize::square(128), 0, &[&HUMANS, &HUMANS]);
    assert!(w.set_ai_seats([false, false]));
    w
}

/// The first tile (row by row from `from`'s top-left, outward ring by ring) whose `r`-square around is all free and
/// reachable on foot from `seen`'s source.
fn open_spot(w: &World, from: (i32, i32), r: i32, seen: &[bool]) -> (i32, i32) {
    for ring in 0..40 {
        for y in from.1 - ring..=from.1 + ring {
            for x in from.0 - ring..=from.0 + ring {
                let open = (y - r..=y + r).all(|yy| {
                    (x - r..=x + r).all(|xx| {
                        w.map.in_map(xx, yy) && !w.map.blocked(xx, yy) && seen[w.map.idx(xx, yy)]
                    })
                });
                if open {
                    return (x, y);
                }
            }
        }
    }
    panic!("no open ground near {from:?}");
}

/// A start's centre, in tiles (the 4x4 Core's top-left plus 2).
fn start(w: &World, seat: usize) -> (i32, i32) {
    (w.map.bases[seat].0 + 2, w.map.bases[seat].1 + 2)
}

/// The tiles reachable on foot from seat 0's start.
fn home_ground(w: &World) -> Vec<bool> {
    let (x, y) = start(w, 0);
    reachable(w, w.map.nearest_free(x, y, 8).unwrap())
}

/// A spot `k` tenths of the way from seat 0's start to seat 1's.
fn between(w: &World, k: i32) -> (i32, i32) {
    let (a, b) = (start(w, 0), start(w, 1));
    (a.0 + (b.0 - a.0) * k / 10, a.1 + (b.1 - a.1) * k / 10)
}

/// `n` Troopers of seat 0 in a block (`cols` across, 28 px apart) round tile `at`.
fn block(w: &mut World, at: (i32, i32), n: usize, cols: usize) -> Vec<Id> {
    (0..n)
        .map(|i| {
            let x = at.0 as f64 * TILE + 16.0 + (i % cols) as f64 * 28.0 - 28.0;
            let y = at.1 as f64 * TILE + 16.0 + (i / cols) as f64 * 28.0 - 28.0;
            w.make_unit(UnitKind::Trooper, PLAYER, x, y)
        })
        .collect()
}

/// The centre of the tile a point is on.
fn centre_of(w: &World, p: Pt) -> Pt {
    let t = w.map.tile_of(p.x, p.y);
    Pt {
        x: t.0 as f64 * TILE + 16.0,
        y: t.1 as f64 * TILE + 16.0,
    }
}

/// Every unit's route can be walked: straight from where it stands (or its tile's centre, where its own search
/// began) to its first waypoint (`fresh`: just planned, before anyone is jostled off its line), and straight from
/// each waypoint to the next (the last one taken at its tile's centre: the exact spot ordered is anywhere on that
/// free tile, a body's width from rock as ever).
fn routes_walkable(w: &World, ids: &[Id], fresh: bool, ctx: &str) {
    for &id in ids {
        let u = w.unit(id).unwrap();
        let Some(p) = &u.path else { continue };
        let mut p = p.clone();
        let Some(last) = p.last_mut() else { continue };
        *last = centre_of(w, *last);
        let (first, at) = (p[0], Pt { x: u.x, y: u.y });
        let centre = centre_of(w, at);
        assert!(
            !fresh || los(&w.map, at, first) || los(&w.map, centre, first),
            "{ctx}: unit {id} at ({:.2}, {:.2}) cannot walk to its first waypoint ({:.2}, {:.2}): {:?}",
            u.x / TILE,
            u.y / TILE,
            first.x / TILE,
            first.y / TILE,
            p.iter()
                .map(|q| (q.x / TILE, q.y / TILE))
                .collect::<Vec<_>>()
        );
        for s in p.windows(2) {
            assert!(
                los(&w.map, s[0], s[1]),
                "{ctx}: unit {id}'s route crosses rock from ({:.0}, {:.0}) to ({:.0}, {:.0}); {:?} at {:?}",
                s[0].x / TILE,
                s[0].y / TILE,
                s[1].x / TILE,
                s[1].y / TILE,
                p.iter()
                    .map(|q| (q.x / TILE, q.y / TILE))
                    .collect::<Vec<_>>(),
                (u.x / TILE, u.y / TILE)
            );
        }
    }
}

/// Steps until every unit of `ids` is idle (or `secs` pass); the seconds it took.
fn walk_until_idle(w: &mut World, ids: &[Id], secs: u32) -> f64 {
    for t in 0..secs * TPS {
        if ids.iter().all(|&id| w.unit(id).unwrap().task == Task::Idle) {
            return t as f64 / TPS as f64;
        }
        w.step();
    }
    f64::INFINITY
}

#[test]
fn a_group_order_across_a_big_map_plans_one_route() {
    // Twelve Troopers in a block near seat 0's start, sent as one group (a move in formation, an attack-move) most of
    // the way across a 128x128 map: one search (the first unit's), the other eleven take its route, and all arrive
    // (each at its own spot of the formation).
    for (seed, kind) in [(3, MapKind::Standard), (8, MapKind::Labyrinth)] {
        for amove in [false, true] {
            let mut w = big(seed, kind);
            let seen = home_ground(&w);
            let from = open_spot(&w, between(&w, 2), 2, &seen);
            let to = open_spot(&w, between(&w, 8), 3, &seen);
            let ids = block(&mut w, from, 12, 4);
            let (gx, gy) = (to.0 as f64 * TILE + 16.0, to.1 as f64 * TILE + 16.0);
            let before = w.path_work();
            if amove {
                w.attack_move_group(&ids, gx, gy);
            } else {
                w.formation(&ids, gx, gy);
            }
            let after = w.path_work();
            let ctx = format!("seed {seed} {kind:?} amove {amove}");
            assert_eq!(
                after.searches - before.searches,
                1,
                "{ctx}: one search for the group"
            );
            assert_eq!(
                after.shared - before.shared,
                11,
                "{ctx}: the others share it"
            );
            assert!(
                ids.iter().all(|&id| w.unit(id).unwrap().path.is_some()),
                "{ctx}: every unit has its route"
            );
            routes_walkable(&w, &ids, true, &ctx);
            let tiles = ((to.0 - from.0).abs().max((to.1 - from.1).abs())) as f64;
            let bound = tiles * TILE * 1.6 / 92.0 + 10.0;
            let took = walk_until_idle(&mut w, &ids, bound as u32);
            assert!(took <= bound, "{ctx}: all there in {bound:.0} s");
            for &id in &ids {
                let u = w.unit(id).unwrap();
                assert!(
                    (u.x - gx).hypot(u.y - gy) < 4.0 * TILE,
                    "{ctx}: unit {id} ended at ({:.0}, {:.0}), the group's spot is {to:?}",
                    u.x / TILE,
                    u.y / TILE
                );
            }
        }
    }
}

#[test]
fn a_wave_spread_over_its_side_waits_its_turn_for_long_searches() {
    // Thirty Troopers in six bunches of five well apart (no bunch can take another's route), all sent across a
    // 128x128 map in one tick, as an AI's wave: at most `LONG_SEARCHES` long searches in any tick, the rest wait a
    // tick or two for theirs (standing meanwhile, still under orders), and all arrive.
    let mut w = big(5, MapKind::Standard);
    let seen = home_ground(&w);
    let base = between(&w, 2);
    let mut ids = Vec::new();
    for k in 0..6 {
        let at = (base.0 + (k % 3) * 12 - 12, base.1 + (k / 3) * 12 - 6);
        let at = open_spot(&w, at, 1, &seen);
        ids.extend(block(&mut w, at, 5, 3));
    }
    let to = open_spot(&w, between(&w, 8), 3, &seen);
    let (gx, gy) = (to.0 as f64 * TILE + 16.0, to.1 as f64 * TILE + 16.0);
    let mut r = Mulberry32::new(9);
    let before = w.path_work();
    for &id in &ids {
        let ox = r.below(81) as f64 - 40.0;
        let oy = r.below(81) as f64 - 40.0;
        w.attack_move(id, gx + ox, gy + oy);
    }
    // (orders count in the budget of the tick that follows them: the window ends with the step)
    let (mut last, mut ticks_to_plan) = (before, None);
    for t in 1..=12 {
        w.step();
        let now = w.path_work();
        assert!(
            now.long - last.long <= LONG_SEARCHES as u64,
            "tick {t}: {} long searches, at most {LONG_SEARCHES}",
            now.long - last.long
        );
        last = now;
        if ticks_to_plan.is_none() && ids.iter().all(|&id| w.unit(id).unwrap().path.is_some()) {
            ticks_to_plan = Some(t);
        }
    }
    let pw = w.path_work();
    assert!(pw.waits > before.waits, "some waited their turn");
    assert!(
        pw.long - before.long >= 3,
        "each bunch its own long search: {}",
        pw.long - before.long
    );
    assert!(
        ticks_to_plan.is_some_and(|t| t <= 4),
        "every unit has its route within four ticks: {ticks_to_plan:?}"
    );
    assert!(
        ids.iter()
            .all(|&id| matches!(w.unit(id).unwrap().task, Task::AMove { .. })),
        "nobody gave up its order while it waited"
    );
    routes_walkable(&w, &ids, false, "the wave");
    let tiles = ((to.0 - base.0).abs().max((to.1 - base.1).abs()) + 20) as f64;
    let bound = tiles * TILE * 1.6 / 92.0 + 10.0;
    let took = walk_until_idle(&mut w, &ids, bound as u32);
    assert!(took <= bound, "all there in {bound:.0} s");
    for &id in &ids {
        let u = w.unit(id).unwrap();
        assert!((u.x - gx).hypot(u.y - gy) < 5.0 * TILE, "unit {id} arrived");
    }
}

#[test]
fn routes_shared_by_groups_never_cross_rock() {
    // Groups scattered over winding maps, each sent somewhere far: whoever takes another's route walks straight onto
    // it only where nothing is in the way (or finds a short way), and on from its end to its own spot the same way.
    let seeds: &[u32] = if cfg!(debug_assertions) {
        &[2]
    } else {
        &[2, 4, 6, 7]
    };
    for &seed in seeds {
        for kind in [MapKind::Labyrinth, MapKind::Standard] {
            let mut w = big(seed, kind);
            let seen = home_ground(&w);
            let mut r = Mulberry32::new(seed);
            let mut all = Vec::new();
            for g in 0..8 {
                let at = (8 + r.below(112) as i32, 8 + r.below(112) as i32);
                let at = open_spot(&w, at, 2, &seen);
                let ids: Vec<Id> = (0..6)
                    .map(|i| {
                        let x = at.0 as f64 * TILE + 16.0 + ((i % 3) as f64 - 1.0) * 28.0;
                        let y = at.1 as f64 * TILE + 16.0 + ((i / 3) as f64 - 0.5) * 28.0;
                        w.make_unit(UnitKind::Trooper, PLAYER, x, y)
                    })
                    .collect();
                let to = open_spot(
                    &w,
                    (8 + r.below(112) as i32, 8 + r.below(112) as i32),
                    0,
                    &seen,
                );
                let (gx, gy) = (to.0 as f64 * TILE + 16.0, to.1 as f64 * TILE + 16.0);
                if g % 2 == 0 {
                    w.attack_move_group(&ids, gx, gy);
                } else {
                    w.formation(&ids, gx, gy);
                }
                all.extend(ids);
            }
            for t in 0..6 {
                routes_walkable(&w, &all, t == 0, &format!("seed {seed} {kind:?} tick {t}"));
                w.step();
            }
            assert!(
                w.path_work().shared > 0,
                "seed {seed} {kind:?}: routes were shared"
            );
        }
    }
}

#[test]
fn a_short_walk_is_neither_shared_nor_budgeted() {
    // Within `LONG_SEARCH` tiles every unit plans its own route at once, as always: twelve scattered units sent a
    // little way each in one tick all get their route that tick.
    let mut w = big(3, MapKind::Standard);
    let seen = home_ground(&w);
    let at = open_spot(&w, between(&w, 3), 2, &seen);
    let mut ids = Vec::new();
    for k in 0..12 {
        let p = open_spot(
            &w,
            (at.0 + (k % 4) * 6 - 9, at.1 + (k / 4) * 6 - 6),
            0,
            &seen,
        );
        ids.push(w.make_unit(
            UnitKind::Trooper,
            PLAYER,
            p.0 as f64 * TILE + 16.0,
            p.1 as f64 * TILE + 16.0,
        ));
    }
    let before = w.path_work();
    for (k, &id) in ids.iter().enumerate() {
        let u = w.unit(id).unwrap();
        let d = (LONG_SEARCH / 2) as f64 * TILE;
        let (x, y) = (u.x + if k % 2 == 0 { d } else { -d }, u.y);
        w.move_to(id, x, y);
    }
    let after = w.path_work();
    assert_eq!(after.long, before.long, "no long search");
    assert_eq!(after.waits, before.waits, "nobody waits");
    assert_eq!(after.searches - before.searches, 12, "a search each");
}

/// The path work per tick of 12-minute games of Hard AIs (two on 64x64, 96x96 and 128x128, four on 96x96, eight on
/// 128x128; seeds by PATH_SEEDS, "3,17,29,41,53" by default): the step's time (average, 99th percentile, worst) and
/// searches per tick (average, worst). A measure, not a test: `cargo test --release --test gameplay path_cost --
/// --ignored --nocapture` (docs/MULTIPLAYER.md, M4 step 2d).
#[test]
#[ignore]
fn path_cost_per_tick() {
    let seeds: Vec<u32> = std::env::var("PATH_SEEDS")
        .unwrap_or("3,17,29,41,53".into())
        .split(',')
        .map(|s| s.trim().parse().unwrap())
        .collect();
    for (n, seats) in [(64, 2), (96, 2), (128, 2), (96, 4), (128, 8)] {
        let (mut ms, mut calls, mut long) = (Vec::new(), Vec::new(), 0);
        for &seed in &seeds {
            let races: Vec<&'static Faction> = (0..seats)
                .map(|s| if s % 2 == 0 { &HUMANS } else { &VAEL })
                .collect();
            let mut w =
                World::with_size(seed, 2, MapKind::Standard, MapSize::square(n), seed, &races);
            w.set_ai_seats(vec![true; seats]);
            while w.winner < 0 && w.tick < 30 * 60 * 12 {
                let before = w.path_work().searches;
                let t0 = std::time::Instant::now();
                w.step();
                ms.push(t0.elapsed().as_secs_f64() * 1e3);
                calls.push(w.path_work().searches - before);
                w.events.clear();
            }
            long += w.path_work().long;
        }
        let ticks = ms.len() as f64;
        let avg = ms.iter().sum::<f64>() / ticks;
        let mut sorted = ms.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let worst = ms
            .iter()
            .position(|&m| m == sorted[sorted.len() - 1])
            .unwrap();
        println!(
            "{seats} AIs on {n}x{n}: step {avg:.3} ms, p99 {:.2}, worst {:.1} ({} searches); searches/tick {:.2}, worst {}; long {long}",
            sorted[(ticks * 0.99) as usize],
            ms[worst],
            calls[worst],
            calls.iter().sum::<u64>() as f64 / ticks,
            calls.iter().max().unwrap()
        );
    }
}
