//! Group paths: units of a seat given one order share one route, long searches are budgeted per seat per
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
        let foot = w.foot(u.kind);
        assert!(
            !fresh || los(&w.map, foot, at, first) || los(&w.map, foot, centre, first),
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
                los(&w.map, foot, s[0], s[1]),
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

#[test]
fn units_closing_on_far_buildings_never_starve_a_new_order_of_its_route() {
    // Sixty Troopers spread over seat 0's side (none near enough another to share its way), each sent at seat 1's Core
    // across a 128x128 map: each replans its way every 0.7 s, more than the budget's long searches. A unit with a
    // route keeps it when the budget is spent (until its next replan), and replans may use only the first of a tick's
    // long searches: every one gets its way, and four far moves ordered three seconds in get theirs within a few
    // ticks (they once waited for the rest of the game).
    let mut w = big(5, MapKind::Standard);
    let seen = home_ground(&w);
    let core = w
        .bldgs
        .iter()
        .find(|b| b.team == ENEMY && b.kind.def().hq)
        .unwrap()
        .id;
    let target = start(&w, 1);
    let mut spots = Vec::new();
    for y in (6..122).step_by(8) {
        for x in (6..122).step_by(8) {
            let open = (y - 1..=y + 1).all(|yy| (x - 1..=x + 1).all(|xx| !w.map.blocked(xx, yy)));
            let far = (x - target.0).abs().max((y - target.1).abs()) > 2 * LONG_SEARCH;
            if open && far && seen[w.map.idx(x, y)] {
                spots.push((x, y));
            }
        }
    }
    assert!(spots.len() >= 64, "room for them: {}", spots.len());
    let at = |p: (i32, i32)| (p.0 as f64 * TILE + 16.0, p.1 as f64 * TILE + 16.0);
    let attackers: Vec<Id> = spots[..60]
        .iter()
        .map(|&p| w.make_unit(UnitKind::Trooper, PLAYER, at(p).0, at(p).1))
        .collect();
    let movers: Vec<Id> = spots[60..64]
        .iter()
        .map(|&p| w.make_unit(UnitKind::Trooper, PLAYER, at(p).0, at(p).1))
        .collect();
    for &a in &attackers {
        w.attack_ent(a, core);
    }
    let mut routed = vec![false; attackers.len()];
    for _ in 0..3 * TPS {
        w.step();
        for (k, &a) in attackers.iter().enumerate() {
            routed[k] |= w
                .unit(a)
                .unwrap()
                .path
                .as_ref()
                .is_some_and(|p| !p.is_empty());
        }
    }
    assert!(
        routed.iter().all(|&r| r),
        "every attacker had its way within 3 s: {} of 60",
        routed.iter().filter(|&&r| r).count()
    );
    // Four far moves, each to the opposite corner from where it stands.
    for &m in &movers {
        let u = w.unit(m).unwrap();
        let (x, y) = (w.map.ww() - u.x, w.map.wh() - u.y);
        w.move_to(m, x, y);
    }
    let mut waited = 0;
    while movers.iter().any(|&m| w.unit(m).unwrap().path.is_none()) {
        waited += 1;
        assert!(
            waited <= 4,
            "the far moves have their routes within four ticks"
        );
        w.step();
    }
    assert!(
        movers
            .iter()
            .all(|&m| matches!(w.unit(m).unwrap().task, Task::Move { .. })),
        "and kept their orders"
    );
}

#[test]
fn a_unit_bound_beside_the_groups_goal_but_behind_a_wall_still_gets_there() {
    // A wall across the map, open only at its ends: one unit sent to just before it, another (from the same place in
    // the same tick) to just behind it. The second may not take the first's route and stop at the wall: it plans its
    // own, round the end, and gets there.
    let mut w = big(3, MapKind::Standard);
    flatten(&mut w, 2..126, 2..126);
    for y in 4..124 {
        let i = w.map.idx(60, y);
        if w.map.occ[i] == 0 {
            w.map.rock[i] = 1;
        }
    }
    let a = w.make_unit(
        UnitKind::Trooper,
        PLAYER,
        30.0 * TILE + 16.0,
        60.0 * TILE + 16.0,
    );
    let b = w.make_unit(
        UnitKind::Trooper,
        PLAYER,
        30.0 * TILE + 16.0,
        61.0 * TILE + 16.0,
    );
    let goal = |x: i32| (x as f64 * TILE + 16.0, 60.0 * TILE + 16.0);
    w.move_to(a, goal(58).0, goal(58).1);
    w.move_to(b, goal(62).0, goal(62).1);
    walk_until_idle(&mut w, &[a, b], 120);
    for (id, x) in [(a, 58), (b, 62)] {
        let u = w.unit(id).unwrap();
        assert!(
            (u.x - goal(x).0).hypot(u.y - goal(x).1) < TILE,
            "unit for ({x}, 60) is at ({:.1}, {:.1})",
            u.x / TILE,
            u.y / TILE
        );
    }
}

/// The path work per tick of 12-minute games of Hard AIs (two on 64x64, 96x96 and 128x128, four on 96x96, eight on
/// 128x128; seeds by PATH_SEEDS, "3,17,29,41,53" by default): the step's time (average, 99th and 99.9th percentile,
/// worst) and searches per tick (average, worst). A measure, not a test: `cargo test --release --test gameplay
/// path_cost -- --ignored --nocapture`.
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
            "{seats} AIs on {n}x{n}: step {avg:.3} ms, p99 {:.2}, p99.9 {:.2}, worst {:.1} ({} searches); searches/tick {:.2}, worst {}; long {long}",
            sorted[(ticks * 0.99) as usize],
            sorted[(ticks * 0.999) as usize],
            ms[worst],
            calls[worst],
            calls.iter().sum::<u64>() as f64 / ticks,
            calls.iter().max().unwrap()
        );
    }
}

/// True when a point travelling the straight segment a→b stays off rock and buildings: a unit's centre, which
/// `separate` pushes back out of a blocked tile.
fn centre_line_clear(w: &World, a: Pt, b: Pt) -> bool {
    let steps = (((b.x - a.x).powi(2) + (b.y - a.y).powi(2)).sqrt() / 2.0).ceil() as i32 + 1;
    (0..=steps).all(|i| {
        let t = i as f64 / steps as f64;
        let (x, y) = (a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
        !w.map
            .blocked((x / TILE).floor() as i32, (y / TILE).floor() as i32)
    })
}

#[test]
fn a_walker_beside_a_rock_corner_does_not_step_into_it() {
    // A route is smoothed from the centre of the unit's tile, but the unit walks its first leg from where it stands.
    // Off-centre beside a corner, that line went through the rock the route went round: pushed back out, a worker on
    // its round planned the same route again at once, and stepped into the corner and back every tick (a Lumen at
    // seed 8's Labyrinth sat so for two minutes). Walkers off-centre on every side of an L of rock, sent every way:
    // the line from where each stands to its next waypoint never crosses rock, and each gets there.
    let (mut runs, mut bad) = (0, Vec::new());
    for (dx, dy) in [
        (-1, -1),
        (0, -1),
        (1, -1),
        (-1, 0),
        (1, 0),
        (-1, 1),
        (0, 1),
        (1, 1),
    ] {
        for (ox, oy) in [
            (1.0, 1.0),
            (16.0, 1.0),
            (31.0, 1.0),
            (1.0, 16.0),
            (31.0, 16.0),
            (1.0, 31.0),
            (16.0, 31.0),
            (31.0, 31.0),
        ] {
            for (gx, gy) in [
                (-6, 0),
                (6, 0),
                (0, -6),
                (0, 6),
                (-5, -5),
                (5, -5),
                (-5, 5),
                (5, 5),
                (-6, 2),
                (2, -6),
                (6, -2),
                (-2, 6),
                (-4, 7),
                (7, 4),
            ] {
                let mut w = flat_arena(1);
                let (rx, ry) = (32, 32);
                for (x, y) in [(rx, ry), (rx - 1, ry), (rx, ry - 1)] {
                    let i = w.map.idx(x, y);
                    w.map.rock[i] = 1;
                }
                let (tx, ty) = (rx + dx, ry + dy);
                if w.map.blocked(tx, ty) {
                    continue;
                }
                let u = w.make_unit(
                    UnitKind::Harvester,
                    PLAYER,
                    tx as f64 * TILE + ox,
                    ty as f64 * TILE + oy,
                );
                let goal = (
                    (rx + gx) as f64 * TILE + 16.0,
                    (ry + gy) as f64 * TILE + 16.0,
                );
                w.move_to(u, goal.0, goal.1);
                runs += 1;
                let mut arrived = false;
                for _ in 0..(12 * TPS) {
                    let un = w.unit(u).unwrap();
                    if let Some(&p) = un.path.as_ref().and_then(|p| p.first())
                        && !centre_line_clear(&w, Pt { x: un.x, y: un.y }, p)
                    {
                        bad.push(format!(
                            "from tile {dx},{dy} +({ox},{oy}) to {gx},{gy}: at ({:.1}, {:.1}) bound for ({:.1}, {:.1})",
                            un.x, un.y, p.x, p.y
                        ));
                        break;
                    }
                    w.step();
                    let un = w.unit(u).unwrap();
                    if (un.x - goal.0).abs() < 2.0 && (un.y - goal.1).abs() < 2.0 {
                        arrived = true;
                        break;
                    }
                }
                if !arrived && bad.len() < 50 {
                    bad.push(format!(
                        "from tile {dx},{dy} +({ox},{oy}) to {gx},{gy}: not there in 12 s"
                    ));
                }
            }
        }
    }
    assert!(runs > 600, "{runs} runs");
    assert!(
        bad.is_empty(),
        "{} of {runs}: {:?}",
        bad.len(),
        &bad[..bad.len().min(6)]
    );
}

#[test]
fn no_worker_stands_at_a_rock_corner_on_its_round() {
    // A real game where it happened: seed 4's Labyrinth, two Hard Vael AIs; from 1:34 a Lumen stood at tile (48, 13)
    // beside a rock, stepping into it and back on its way to a field. Every worker on its round (gathering, with a
    // route) leaves its tile within 8 seconds.
    let mut w = World::with_size(4, 3, MapKind::Labyrinth, MapSize::DUEL, 0, &[&VAEL, &VAEL]);
    assert!(w.set_ai_seats([true, true]));
    let mut since: std::collections::BTreeMap<Id, ((i32, i32), u32)> = Default::default();
    for t in 0..(3 * 60 * TPS) {
        w.step();
        if t % 15 != 0 {
            continue;
        }
        for u in &w.units {
            let tile = w.map.tile_of(u.x, u.y);
            let on_round = matches!(u.task, Task::Gather { .. })
                && u.path.as_ref().is_some_and(|p| !p.is_empty());
            if !on_round {
                since.remove(&u.id);
                continue;
            }
            let e = since.entry(u.id).or_insert((tile, t));
            if e.0 != tile {
                *e = (tile, t);
            }
            assert!(
                t - e.1 < 8 * TPS,
                "{:.1}s: {:?} {} has stood at tile {tile:?} since {:.1}s, at ({:.1}, {:.1}) bound for {:?}",
                t as f64 / TPS as f64,
                u.kind,
                u.id,
                e.1 as f64 / TPS as f64,
                u.x,
                u.y,
                u.path.as_ref().and_then(|p| p.first()).map(|p| (p.x, p.y))
            );
        }
    }
}

/// A blocked goal (a crystal, a building) ends a search on the free tile beside it that the search reaches first, the
/// same side from every direction: the problem turned half round (the two starts' symmetry) ends on the turned tile,
/// ties included. Before, the first free tile of a fixed scan (the ring's top row first) won. And a goal nobody can
/// reach ends at the same nearest point from anywhere along the way there (a unit's replans must not swing it to and
/// fro: an army walked back and forth for half an hour beside a Barracks wedged against rock).
#[test]
fn a_blocked_goal_ends_on_the_side_reached_first_from_every_direction() {
    use endfall_sim::map::Foot;
    use endfall_sim::path::{PathScratch, astar};
    let mut w = arena(3);
    let (mw, mh) = (w.map.w, w.map.h);
    flatten(&mut w, 1..mw - 1, 1..mh - 1);
    let turn = |t: (i32, i32)| (mw - 1 - t.0, mh - 1 - t.1);
    let rock = |w: &mut World, t: (i32, i32)| {
        for p in [t, turn(t)] {
            let i = w.map.idx(p.0, p.1);
            w.map.rock[i] = 1;
        }
    };
    // A crystal with two of its neighbours taken (a field's arc), and its image.
    let g = (24, 26);
    for t in [g, (g.0 + 1, g.1), (g.0, g.1 + 1)] {
        rock(&mut w, t);
    }
    let foot = Foot {
        class: Move::Walk,
        water: w.water,
    };
    let end = |w: &World, s: (i32, i32), g: (i32, i32)| {
        let mut scratch = PathScratch::new(w.map.rock.len());
        let p = astar(&w.map, foot, &mut scratch, s.0, s.1, g.0, g.1).unwrap();
        p.last().map_or(s, |q| w.map.tile_of(q.x, q.y))
    };
    let mut sides = std::collections::BTreeSet::new();
    for dy in -6..=6i32 {
        for dx in -6..=6i32 {
            if dx.abs().max(dy.abs()) != 6 {
                continue;
            }
            let s = (g.0 + dx, g.1 + dy);
            let e = end(&w, s, g);
            assert_eq!(
                end(&w, turn(s), turn(g)),
                turn(e),
                "from {s:?}: the turned search ends on the turned tile"
            );
            assert_eq!(
                (e.0 - g.0).abs().max((e.1 - g.1).abs()),
                1,
                "from {s:?}: beside the goal"
            );
            sides.insert(e);
        }
    }
    assert!(
        sides.len() >= 5,
        "every side used, not one fixed tile: {sides:?}"
    );
    // A goal walled in on three sides of a pocket nobody can enter: from far away, and from half way along the route,
    // the search ends on the same nearest tile.
    let g = (40, 20);
    for t in (37..=43)
        .flat_map(|x| [(x, 17), (x, 23)])
        .chain((18..=22).flat_map(|y| [(37, y), (43, y)]))
    {
        rock(&mut w, t);
    }
    let far = end(&w, (20, 40), g);
    let mut scratch = PathScratch::new(w.map.rock.len());
    let p = astar(&w.map, foot, &mut scratch, 20, 40, g.0, g.1).unwrap();
    let mid = w.map.tile_of(p[p.len() / 2].x, p[p.len() / 2].y);
    assert_eq!(end(&w, mid, g), far, "the same end from half way there");
    assert_eq!(end(&w, turn((20, 40)), turn(g)), turn(far), "and turned");
    // Goals on the map's diagonals (the line to its middle cannot tell the tiles beside them apart on its own: 184 of
    // these searches came out unturned before its second key), each with one of its eight neighbours taken in turn,
    // from eight directions at 2 to 59 tiles: turned alike, and the same end from half way.
    let (mut searched, mut unturned, mut swung) = (0, Vec::new(), Vec::new());
    for g in [(8, 8), (20, 20), (31, 31), (40, 40), (12, 51), (44, 19)] {
        for n in [
            (1, 0),
            (1, 1),
            (0, 1),
            (-1, 1),
            (-1, 0),
            (-1, -1),
            (0, -1),
            (1, -1),
        ] {
            let mut w = arena(3);
            flatten(&mut w, 1..mw - 1, 1..mh - 1);
            rock(&mut w, g);
            rock(&mut w, (g.0 + n.0, g.1 + n.1));
            for k in 2..60 {
                for (dx, dy) in [
                    (1, 0),
                    (1, 1),
                    (0, 1),
                    (-1, 1),
                    (-1, 0),
                    (-1, -1),
                    (0, -1),
                    (1, -1),
                ] {
                    let s = (g.0 + dx * k, g.1 + dy * k);
                    if !(1..mw - 1).contains(&s.0)
                        || !(1..mh - 1).contains(&s.1)
                        || !w.map.passable(foot, s.0, s.1)
                    {
                        continue;
                    }
                    searched += 1;
                    let e = end(&w, s, g);
                    if end(&w, turn(s), turn(g)) != turn(e) {
                        unturned.push((g, n, s));
                    }
                    let p = astar(&w.map, foot, &mut scratch, s.0, s.1, g.0, g.1).unwrap();
                    let mid = w.map.tile_of(p[p.len() / 2].x, p[p.len() / 2].y);
                    if end(&w, mid, g) != e {
                        swung.push((g, n, s));
                    }
                }
            }
        }
    }
    assert!(searched > 9000, "enough searches ({searched})");
    assert_eq!(
        unturned,
        vec![],
        "diagonal goals: the turned search ends on the turned tile (goal, taken, start)"
    );
    assert_eq!(
        swung,
        vec![],
        "diagonal goals: the same end from half way (goal, taken, start)"
    );
}
