//! Coverage (the arc, Nov 13: "machines need signal; mercenaries don't"; a penalty, not a wall, since Nov 27): the
//! Expedition's combat machines (the Buggy, the Drone, the Rover, the Android) go anywhere, at `IN_RANGE_SPEED` inside
//! the coverage of a finished Data center (`conflux`, 18 tiles) or Uplink (`uplink`, 54 tiles on every map since Nov
//! 13) of their side or an ally, by exact distance from the source's center, and at `OUT_OF_RANGE_SPEED` outside it;
//! with no source left at all, outside everywhere. The Sentry mast (`ward`) gives none. Bots, people and the Kingdom
//! move at their own speed anywhere.
//! Seed 3's Expedition Data center stands at tile (52, 8); the lane at y 40, x 18..46 is at least 31 tiles from it.
//! An Uplink's 54 tiles cover most of that 64x64 map, so the scenes about coverage's edge use a second Data center as
//! their source (`source`): the edge is the same for every source, only the reach differs.

use crate::common::*;
use endfall_sim::data::radio::{
    CONFLUX_RANGE, IN_RANGE_SPEED, OUT_OF_RANGE_SPEED, UPLINK_RANGE, needs_coverage, needs_range,
};
use endfall_sim::jsmath;
use endfall_sim::world::{Command, Event};

fn px(t: f64) -> f64 {
    t * 32.0 + 16.0
}

/// The Kingdom in seat 0, the Expedition in seat 1, nobody's AI, no starting units, everything
/// explored, the lane flattened.
fn lane() -> World {
    let mut w = World::with_setup(3, 1, MapKind::Standard, false, [&HUMANS, &VAEL]);
    w.disable_ai();
    w.units.clear();
    flatten(&mut w, 12..52, 30..48);
    for e in &mut w.explored {
        e.fill(1);
    }
    for x in 18..46 {
        assert!(
            !w.in_radio(ENEMY, px(x as f64), px(40.0)),
            "the lane starts out of coverage"
        );
    }
    w
}

/// A source of coverage for the Expedition with its 4x4 at tile (tx, ty): a finished Data center, 18 tiles round its
/// center (tx + 2, ty + 2), so an edge falls on the lane.
fn source(w: &mut World, tx: i32, ty: i32) -> Id {
    let b = w.make_building(BldgKind::Conflux, ENEMY, tx, ty, true);
    w.recalc_supply(ENEMY);
    b
}

/// How far (px) a unit of `kind` at (x0, 40), sent to (x1, 40), gets in `secs` seconds.
fn walked_from(w: &mut World, kind: UnitKind, x0: f64, x1: f64, secs: u32) -> f64 {
    let id = w.make_unit(kind, ENEMY, px(x0), px(40.0));
    w.move_to(id, px(x1), px(40.0));
    run(w, secs);
    (w.unit(id).unwrap().x - px(x0)).abs()
}

fn dist_to(w: &World, u: Id, b: Id) -> f64 {
    let (u, b) = (w.unit(u).unwrap(), w.bldg(b).unwrap());
    ((u.x - b.x).powi(2) + (u.y - b.y).powi(2)).sqrt()
}

const MACHINES: [UnitKind; 4] = [
    UnitKind::Scythe,
    UnitKind::Monolith,
    UnitKind::Shrike,
    UnitKind::Umbra,
];

/// How far (px) machine `id` goes in one second from now (its order as it is).
fn second_of(w: &mut World, id: Id) -> f64 {
    let (x0, y0) = (w.unit(id).unwrap().x, w.unit(id).unwrap().y);
    run(w, 1);
    let u = w.unit(id).unwrap();
    jsmath::dist(u.x, u.y, x0, y0)
}

#[test]
fn machines_go_anywhere_faster_inside_coverage_and_slower_outside() {
    for k in MACHINES {
        assert!(needs_range(k), "{k:?} needs signal");
    }
    for k in [
        UnitKind::Lumen,
        UnitKind::Prism,
        UnitKind::Bruiser,
        UnitKind::Trooper,
    ] {
        assert!(!needs_range(k), "{k:?}: its own speed anywhere");
    }
    // Faster inside coverage (an Uplink west of the lane; a second's walk well inside it).
    for kind in MACHINES {
        let mut w = lane();
        w.make_building(BldgKind::Uplink, ENEMY, 17, 36, true);
        w.step();
        let speed = kind.def().speed;
        let d = walked_from(&mut w, kind, 20.0, 45.0, 1);
        assert!(
            (d - speed * IN_RANGE_SPEED).abs() < 8.0,
            "{kind:?} in coverage: {d} px in 1 s, {IN_RANGE_SPEED} of {speed} px/s"
        );
    }
    // Slower outside it (the Data center's coverage far off), whichever way it goes: towards it or away.
    for kind in MACHINES {
        let speed = kind.def().speed;
        for to in [45.0, 14.0] {
            let mut w = lane();
            let d = walked_from(&mut w, kind, 30.0, to, 1);
            assert!(
                (d - speed * OUT_OF_RANGE_SPEED).abs() < 8.0,
                "{kind:?} out of coverage, towards x {to}: {d} px in 1 s, {OUT_OF_RANGE_SPEED} of {speed} px/s"
            );
        }
    }
    // A Bot and a Sellsword: their own speed in coverage and out of it, anywhere.
    for kind in [UnitKind::Lumen, UnitKind::Prism] {
        for uplink in [false, true] {
            let mut w = lane();
            if uplink {
                w.make_building(BldgKind::Uplink, ENEMY, 17, 36, true);
                w.step();
            }
            let speed = kind.def().speed;
            let d = walked_from(&mut w, kind, 20.0, 45.0, 1);
            assert!(
                (d - speed).abs() < 8.0,
                "{kind:?}: {d} px in 1 s at {speed} px/s"
            );
            let away = walked_from(&mut w, kind, 30.0, 14.0, 1);
            assert!((away - speed).abs() < 8.0, "{kind:?} goes anywhere");
        }
    }
}

#[test]
fn coverage_is_by_exact_distance_from_the_sources_centre() {
    // A source's center (a 4x4 at (28, 36): center (30, 38) tiles, on a tile corner); points just inside and just
    // outside its reach, along a diagonal (off every tile center), are in and out of coverage, and so is a Buggy there.
    let mut w = lane();
    let up = source(&mut w, 28, 36);
    let (cx, cy) = (w.bldg(up).unwrap().x, w.bldg(up).unwrap().y);
    assert_eq!((cx, cy), (30.0 * 32.0, 38.0 * 32.0));
    let reach = CONFLUX_RANGE * 32.0;
    for (ax, ay) in [(0.6, 0.8), (-0.8, 0.6), (1.0, 0.0), (0.28, -0.96)] {
        let at = |r: f64| (cx + ax * r, cy + ay * r);
        let (ix, iy) = at(reach - 0.5);
        let (ox, oy) = at(reach + 0.5);
        assert!(w.in_radio(ENEMY, ix, iy), "just inside ({ax}, {ay})");
        assert!(!w.in_radio(ENEMY, ox, oy), "just outside ({ax}, {ay})");
        let inside = w.make_unit(UnitKind::Scythe, ENEMY, ix, iy);
        let outside = w.make_unit(UnitKind::Scythe, ENEMY, ox, oy);
        assert!(
            w.radio_boosted(inside) && !w.radio_slowed(inside),
            "a Buggy just inside ({ax}, {ay})"
        );
        assert!(
            !w.radio_boosted(outside) && w.radio_slowed(outside),
            "a Buggy just outside ({ax}, {ay})"
        );
    }
}

#[test]
fn a_site_and_a_sentry_mast_give_no_coverage() {
    // An Uplink under construction gives none; nor does a finished Sentry mast; a finished Uplink does, to its own side
    // only.
    let mut w = lane();
    w.make_building(BldgKind::Uplink, ENEMY, 19, 37, false);
    w.make_building(BldgKind::Ward, ENEMY, 23, 37, true);
    w.step();
    assert!(!w.in_radio(ENEMY, px(20.0), px(40.0)), "a site: none");
    assert!(
        !w.in_radio(ENEMY, px(24.0), px(38.0)),
        "a Sentry mast: none"
    );
    let mut w = lane();
    w.make_building(BldgKind::Uplink, ENEMY, 19, 37, true);
    assert!(w.in_radio(ENEMY, px(20.0), px(40.0)));
    assert!(
        !w.in_radio(PLAYER, px(20.0), px(40.0)),
        "coverage is the side's own"
    );
}

#[test]
fn the_data_center_and_an_uplink_give_coverage_until_the_uplink_falls() {
    let mut w = lane();
    let hq = w
        .bldgs
        .iter()
        .find(|b| b.team == ENEMY && b.kind == BldgKind::Conflux)
        .map(|b| (b.x, b.y))
        .unwrap();
    // The Data center: 18 tiles round its middle (south of it, on the map).
    assert!(w.in_radio(ENEMY, hq.0, hq.1 + (CONFLUX_RANGE - 0.1) * 32.0));
    assert!(!w.in_radio(ENEMY, hq.0, hq.1 + (CONFLUX_RANGE + 0.1) * 32.0));
    assert!(
        !w.in_radio(PLAYER, hq.0, hq.1),
        "the Kingdom has none of its own"
    );
    // An Uplink: 54 tiles round its middle, from the tick it is done.
    let up = w.make_building(BldgKind::Uplink, ENEMY, 29, 39, true);
    let (ux, uy) = (30.5 * 32.0, 40.5 * 32.0);
    assert!(w.in_radio(ENEMY, ux + (UPLINK_RANGE - 0.1) * 32.0, uy));
    assert!(!w.in_radio(ENEMY, ux + (UPLINK_RANGE + 0.1) * 32.0, uy));
    assert_eq!(UPLINK_RANGE, 54.0, "54 tiles");
    w.step();
    assert_eq!(
        w.radio_circles(ENEMY)[3..],
        [ux, uy, UPLINK_RANGE * 32.0],
        "on 64x64 as on the bigger maps"
    );
    let ver = w.radio_version();
    w.step();
    assert_eq!(w.radio_version(), ver, "nothing changed: not built again");
    w.damage(up, 1e9, None);
    assert!(w.bldg(up).is_none());
    w.step();
    assert!(!w.in_radio(ENEMY, ux, uy), "the Uplink's coverage is gone");
    assert!(w.in_radio(ENEMY, hq.0, hq.1), "the Data center's stays");
    assert_eq!(
        w.radio_circles(ENEMY),
        vec![hq.0, hq.1, CONFLUX_RANGE * 32.0]
    );
    assert!(w.radio_circles(PLAYER).is_empty());
}

#[test]
fn an_allys_coverage_counts_and_an_uplink_reaches_as_far_on_every_map() {
    // Two Expedition seats on one team against two Kingdom seats, 96x96 (an Uplink's 54 tiles there, as on every map).
    let mut w = World::with_size(
        5,
        1,
        MapKind::Standard,
        MapSize::square(96),
        0,
        &[&VAEL, &VAEL, &HUMANS, &HUMANS],
    );
    assert!(w.set_teams(&[0, 0, 1, 1]));
    w.disable_ai();
    w.units.clear();
    let (tx, ty) = (4..92)
        .flat_map(|y| (4..92).map(move |x| (x, y)))
        .find(|&(x, y)| {
            !w.in_radio_by(0, px(x as f64), px(y as f64), 6.0)
                && w.can_place(BldgKind::Uplink, x, y, 1)
                && (0..5).all(|dx| w.map.rock[w.map.idx(x + 3 + dx, y + 1)] == 0)
        })
        .expect("a spot out of coverage");
    let (cx, cy) = ((tx as f64 + 1.5) * 32.0, (ty as f64 + 1.5) * 32.0);
    assert!(!w.in_radio(0, cx, cy));
    w.make_building(BldgKind::Uplink, 1, tx, ty, true);
    assert!(w.in_radio(0, cx, cy), "the ally's Uplink");
    assert!(w.in_radio(1, cx, cy), "its own");
    assert!(
        !w.in_radio(2, cx, cy) && !w.in_radio(3, cx, cy),
        "not the enemy's"
    );
    let circles = w.radio_circles(0);
    assert_eq!(circles[circles.len() - 3..], [cx, cy, UPLINK_RANGE * 32.0]);
    assert!(
        w.radio_circles(2)
            .chunks(3)
            .all(|c| c[0] != cx || c[1] != cy)
    );
    // Seat 0's Buggy beside it, out of its own seat's coverage, moves faster in its ally's.
    let (bx, by) = (px(tx as f64 + 3.0), px(ty as f64 + 1.0));
    let buggy = w.make_unit(UnitKind::Scythe, 0, bx, by);
    let speed = UnitKind::Scythe.def().speed;
    w.move_to(buggy, bx + 4.0 * 32.0, by);
    for _ in 0..15 {
        w.step();
    }
    let d = (w.unit(buggy).unwrap().x - bx) * 2.0; // (px a second, over half a second)
    assert!(
        d > speed * 1.2,
        "a Buggy in its ally's coverage: {d} px in 1 s at {speed} px/s"
    );
}

#[test]
fn a_machine_ordered_out_of_coverage_goes_there_slower_fights_there_and_is_quick_again_back_inside()
{
    for kind in [UnitKind::Scythe, UnitKind::Shrike] {
        let speed = kind.def().speed;
        let mut w = lane();
        let up = source(&mut w, 19, 37);
        let edge = CONFLUX_RANGE * 32.0;
        // Sent far east, out past the edge: it goes all the way there, and stops there.
        let s = w.make_unit(kind, ENEMY, px(21.0), px(40.0));
        w.move_to(s, px(48.0), px(40.0));
        for _ in 0..30 * TPS {
            w.step();
            if w.unit(s).unwrap().task == Task::Idle {
                break;
            }
        }
        let u = w.unit(s).unwrap();
        assert!(
            (u.x - px(48.0)).abs() < 8.0 && (u.y - px(40.0)).abs() < 8.0 && u.task == Task::Idle,
            "{kind:?} got there: ({:.0}, {:.0}) {:?}",
            u.x,
            u.y,
            u.task
        );
        assert!(
            dist_to(&w, s, up) > edge + 4.0 * 32.0,
            "{kind:?}: well outside"
        );
        assert!(w.radio_slowed(s) && !w.radio_boosted(s), "{kind:?} slowed");
        // Out there, slower: on to the lane's end, still outside.
        w.move_to(s, px(48.0), px(33.0));
        let d = second_of(&mut w, s);
        assert!(
            (d - speed * OUT_OF_RANGE_SPEED).abs() < 8.0,
            "{kind:?} outside: {d} px in 1 s, {OUT_OF_RANGE_SPEED} of {speed} px/s"
        );
        // Told to attack a building out there, farther from coverage still: it goes and hits it.
        let depot = w.make_building(BldgKind::Depot, PLAYER, 42, 44, true);
        let b = w.bldg(depot).unwrap();
        assert!(!w.in_radio(ENEMY, b.x, b.y), "the Depot out of coverage");
        assert_eq!(
            w.apply(
                ENEMY,
                &Command::Attack {
                    unit: s,
                    target: depot
                }
            ),
            Ok(())
        );
        run(&mut w, 8);
        let b = w.bldg(depot).unwrap();
        assert!(b.hp < b.maxhp, "{kind:?} strikes the Depot out there");
        // Back inside: its speed with the bonus again.
        w.move_to(s, px(14.0), px(40.0));
        for _ in 0..30 * TPS {
            w.step();
            let u = w.unit(s).unwrap();
            if w.in_radio_by(ENEMY, u.x, u.y, -3.0) {
                break;
            }
        }
        assert!(w.radio_boosted(s), "{kind:?} back inside");
        let d = second_of(&mut w, s);
        assert!(
            (d - speed * IN_RANGE_SPEED).abs() < 8.0,
            "{kind:?} back inside: {d} px in 1 s, {IN_RANGE_SPEED} of {speed} px/s"
        );
    }
}

#[test]
fn a_machine_whose_uplink_falls_stays_where_it_is_slowed_and_fights_there() {
    // Two sources; the Buggy rests by the eastern one. That one falls: it stays where it stood (no walk back), slower
    // now, and fights what comes at it there.
    let mut w = lane();
    source(&mut w, 13, 37);
    let east = source(&mut w, 40, 37);
    let s = w.make_unit(UnitKind::Scythe, ENEMY, px(48.0), px(40.0));
    run(&mut w, 1);
    assert!(w.radio_boosted(s), "inside the eastern source's coverage");
    let (x0, y0) = (w.unit(s).unwrap().x, w.unit(s).unwrap().y);
    w.damage(east, 1e9, None);
    w.step();
    assert!(w.radio_slowed(s), "outside now");
    run(&mut w, 20);
    let u = w.unit(s).unwrap();
    assert!(
        jsmath::dist(u.x, u.y, x0, y0) < 8.0 && u.task == Task::Idle,
        "it stays where it stood: ({:.0}, {:.0}) {:?}",
        u.x,
        u.y,
        u.task
    );
    let foe = w.make_unit(UnitKind::Trooper, PLAYER, px(50.0), px(40.0));
    w.hold_unit(foe);
    run(&mut w, 3);
    let f = w.unit(foe).unwrap();
    assert!(f.hp < f.maxhp, "it fights where it stands");
}

#[test]
fn a_seat_with_no_source_left_has_its_machines_slowed_everywhere() {
    // Its Data center gone (a Factory and a Bot left, so the seat plays on) and no Uplink: no coverage anywhere, and its
    // machines move at `OUT_OF_RANGE_SPEED` wherever they are: by its old base as in the lane. A Bot keeps its speed.
    let mut w = lane();
    let (hx, hy) = w
        .bldgs
        .iter()
        .find(|b| b.team == ENEMY && b.kind == BldgKind::Conflux)
        .map(|b| (b.x, b.y))
        .unwrap();
    w.make_building(BldgKind::Kiln, ENEMY, 30, 33, true);
    w.make_unit(UnitKind::Lumen, ENEMY, px(20.0), px(34.0));
    let hq: Vec<Id> = w
        .bldgs
        .iter()
        .filter(|b| b.team == ENEMY && b.kind == BldgKind::Conflux)
        .map(|b| b.id)
        .collect();
    for b in hq {
        w.damage(b, 1e9, None);
    }
    w.step();
    assert!(!w.over, "the seat plays on");
    assert!(w.radio_circles(ENEMY).is_empty(), "no source left");
    assert!(!w.in_radio(ENEMY, hx, hy));
    for kind in MACHINES {
        let speed = kind.def().speed;
        let d = walked_from(&mut w, kind, 30.0, 45.0, 1);
        assert!(
            (d - speed * OUT_OF_RANGE_SPEED).abs() < 8.0,
            "{kind:?} with no source: {d} px in 1 s"
        );
        let id = w.make_unit(kind, ENEMY, hx, hy + 3.0 * 32.0);
        w.move_to(id, hx, hy + 9.0 * 32.0);
        let d = second_of(&mut w, id);
        assert!(
            (d - speed * OUT_OF_RANGE_SPEED).abs() < 8.0,
            "{kind:?} by its old base: {d} px in 1 s"
        );
    }
    let speed = UnitKind::Lumen.def().speed;
    let d = walked_from(&mut w, UnitKind::Lumen, 30.0, 45.0, 1);
    assert!((d - speed).abs() < 8.0, "a Bot at its own speed: {d}");
}

/// Two sources of the Expedition overlapping in a narrow waist on open ground: their centers (px), and the waist's
/// half height (tiles), about seven. Nobody's AI: orders are a player's.
fn waist() -> (World, (f64, f64), (f64, f64)) {
    let mut w = lane();
    flatten(&mut w, 6..58, 22..54);
    assert!(w.set_ai_seats([false, false]));
    let a = source(&mut w, 11, 37);
    let b = source(&mut w, 44, 37);
    let (a, b) = (w.bldg(a).unwrap(), w.bldg(b).unwrap());
    let (a, b) = ((a.x, a.y), (b.x, b.y));
    w.step();
    let half = ((b.0 - a.0) / 2.0 / 32.0).powi(2);
    let waist = (CONFLUX_RANGE * CONFLUX_RANGE - half).sqrt();
    assert!(
        waist > 4.0 && waist < 8.0,
        "a narrow waist: {waist:.1} tiles"
    );
    (w, a, b)
}

#[test]
fn a_machine_takes_the_straight_way_out_of_coverage_and_nobody_is_told() {
    // Eight tiles off the line between the centers the straight way crosses the waist outside coverage: a Buggy sent
    // across takes it (no way round inside coverage, as before Nov 27), slowed where it is outside, and arrives; orders
    // out of coverage, one machine's or a group's, say nothing.
    let (mut w, a, b) = waist();
    let (y, from, to) = (a.1 + 8.0 * 32.0, a.0 + 4.0 * 32.0, b.0 - 4.0 * 32.0);
    assert!(
        !w.in_radio(ENEMY, (a.0 + b.0) / 2.0, y),
        "the straight way leaves coverage"
    );
    let s = w.make_unit(UnitKind::Scythe, ENEMY, from, y);
    w.events.clear();
    assert_eq!(w.apply(ENEMY, &Command::Move { unit: s, x: to, y }), Ok(()));
    let (mut out, mut farthest) = (false, 0.0f64);
    for _ in 0..30 * TPS {
        w.step();
        let u = w.unit(s).unwrap();
        out |= w.radio_slowed(s);
        farthest = farthest.max((u.y - y).abs());
    }
    let u = w.unit(s).unwrap();
    assert!(out, "it went out of coverage on the way");
    assert!(
        farthest < 32.0,
        "straight across: {farthest:.0} px off the line"
    );
    assert!(
        jsmath::dist(u.x, u.y, to, y) < 40.0,
        "arrived: at ({:.0}, {:.0}), wanted ({to:.0}, {y:.0})",
        u.x,
        u.y
    );
    // A group sent far out of coverage, as a formation and as an attack-move: no word from the sim.
    let ks: Vec<Id> = (0..3)
        .map(|i| w.make_unit(UnitKind::Scythe, ENEMY, from, a.1 + i as f64 * 24.0))
        .collect();
    let far = ((a.0 + b.0) / 2.0, a.1 + 20.0 * 32.0);
    assert!(!w.in_radio(ENEMY, far.0, far.1));
    for cmd in [
        Command::Formation {
            units: ks.clone(),
            x: far.0,
            y: far.1,
        },
        Command::GroupAttackMove {
            units: ks.clone(),
            x: far.0,
            y: far.1,
        },
    ] {
        assert_eq!(w.apply(ENEMY, &cmd), Ok(()));
    }
    run(&mut w, 25);
    assert!(
        !w.events
            .iter()
            .any(|e| matches!(e, Event::Toast { team, .. } if *team == ENEMY)),
        "nothing said: {:?}",
        w.events
    );
    for &k in &ks {
        let u = w.unit(k).unwrap();
        assert!(
            jsmath::dist(u.x, u.y, far.0, far.1) < 3.0 * 32.0,
            "the group got there: ({:.0}, {:.0})",
            u.x,
            u.y
        );
    }
}

#[test]
fn the_expedition_ai_sends_its_machines_out_of_coverage_with_its_waves() {
    // The AI plans nothing round coverage for its waves since Nov 27: the Expedition's AI against the Kingdom's on
    // 96x96 two-player maps (its foe's buildings made to last), four Rovers and a Lab from the start. Within ten minutes
    // its machines go out with a wave, outside its coverage.
    for seed in [1, 2, 3] {
        let mut w = World::with_size(
            seed,
            1,
            MapKind::Standard,
            MapSize::square(96),
            0,
            &[&HUMANS, &VAEL],
        );
        assert!(w.set_ai_seats([true, true]));
        let hq = w
            .bldgs
            .iter()
            .find(|b| b.team == ENEMY && b.kind == BldgKind::Conflux)
            .map(|b| (b.x, b.y))
            .unwrap();
        for k in 0..4 {
            w.make_unit(
                UnitKind::Monolith,
                ENEMY,
                hq.0 + 96.0,
                hq.1 + 32.0 * k as f64,
            );
        }
        w.recalc_supply(ENEMY);
        w.res[ENEMY as usize][0] += 1000;
        let (lx, ly) = spot_for(&w, ENEMY, BldgKind::Loom);
        w.make_building(BldgKind::Loom, ENEMY, lx, ly, true);
        for b in w.bldgs.iter_mut().filter(|b| b.team == PLAYER) {
            (b.hp, b.maxhp) = (1e9, 1e9);
        }
        let mut out = None;
        while w.time < 600.0 && !w.over && out.is_none() {
            w.step();
            if w.tick.is_multiple_of(30) {
                let wave = w.ai_wave_of(ENEMY).unwrap_or(&[]);
                out = wave
                    .iter()
                    .filter_map(|&id| w.unit(id))
                    .find(|u| needs_range(u.kind) && !w.in_radio(ENEMY, u.x, u.y))
                    .map(|u| (u.kind, w.time));
            }
        }
        assert!(
            out.is_some(),
            "seed {seed}: no machine of a wave out of coverage in ten minutes"
        );
    }
}

/// A building's top-left tile.
struct Tile {
    tx: i32,
    ty: i32,
}

#[test]
fn expedition_buildings_go_up_only_inside_coverage_and_never_go_offline() {
    // Stelian, Nov 15: every Expedition building but the Data center (its headquarters spacing only) and the Uplink
    // (anywhere explored) is placed only with its center inside coverage; the Kingdom's anywhere. Placing only: a
    // building whose coverage is lost afterwards stands and works.
    for k in BLDG_KINDS {
        let sourced = k == BldgKind::Conflux || k == BldgKind::Uplink;
        assert_eq!(needs_coverage(VAEL.hq, k), !sourced, "{k:?}");
        assert!(
            !needs_coverage(HUMANS.hq, k),
            "{k:?}: the Kingdom's go anywhere"
        );
    }
    let mut w = lane();
    w.res[ENEMY as usize] = [20_000, 0];
    w.res[PLAYER as usize] = [20_000, 0];
    // Outside: in the lane, 31 tiles and more from the Data center, every one of them refused, and the order says so.
    let within = [
        BldgKind::Siphon,
        BldgKind::Substation,
        BldgKind::Spire,
        BldgKind::Kiln,
        BldgKind::Loom,
        BldgKind::Ward,
        BldgKind::Eclipse,
    ];
    for k in within {
        assert_eq!(
            w.place_refusal(k, 30, 38, ENEMY),
            Some(Refusal::Coverage),
            "{k:?} out of coverage"
        );
    }
    let bot = w.make_unit(UnitKind::Lumen, ENEMY, px(30.0), px(44.0));
    assert_eq!(
        w.place_building(ENEMY, BldgKind::Substation, 30, 38, Some(bot)),
        Err("Build within coverage".to_string())
    );
    assert_eq!(Refusal::Coverage.message(), "Build within coverage");
    // The Kingdom's there: no such rule.
    assert_eq!(w.place_refusal(BldgKind::Depot, 30, 38, PLAYER), None);
    // Inside: by the Data center.
    let (tx, ty) = spot_for(&w, ENEMY, BldgKind::Substation);
    assert_eq!(w.place_refusal(BldgKind::Substation, tx, ty, ENEMY), None);
    // By its center, by exact distance: a 2x2 just inside the Data center's edge goes up, one a tile further out not.
    let hq = w
        .bldgs
        .iter()
        .find(|b| b.team == ENEMY && b.kind == BldgKind::Conflux)
        .map(|b| (b.tx, b.ty))
        .map(|(tx, ty)| Tile { tx, ty })
        .unwrap();
    let edge = |w: &World, kind: BldgKind, tx: i32, ty: i32| {
        let d = kind.def();
        let (cx, cy) = (
            (tx as f64 + d.w as f64 / 2.0) * 32.0,
            (ty as f64 + d.h as f64 / 2.0) * 32.0,
        );
        w.in_radio(ENEMY, cx, cy)
    };
    let mut ty_in = hq.ty;
    while edge(&w, BldgKind::Substation, hq.tx, ty_in + 1) {
        ty_in += 1;
    }
    assert!(
        edge(&w, BldgKind::Substation, hq.tx, ty_in)
            && !edge(&w, BldgKind::Substation, hq.tx, ty_in + 1)
    );
    for (y, ok) in [(ty_in, true), (ty_in + 1, false)] {
        let why = w.place_refusal(BldgKind::Substation, hq.tx, y, ENEMY);
        if ok {
            assert_ne!(why, Some(Refusal::Coverage), "just inside, at row {y}");
        } else {
            assert_eq!(why, Some(Refusal::Coverage), "just outside, at row {y}");
        }
    }
    // The Data center outside coverage: allowed (its spacing is its only rule), and so is the Uplink.
    assert_eq!(w.place_refusal(BldgKind::Conflux, 22, 38, ENEMY), None);
    assert_eq!(w.place_refusal(BldgKind::Uplink, 20, 38, ENEMY), None);
    // The Uplink going up gives nothing yet; finished, buildings go up in its range.
    w.make_building(BldgKind::Loom, ENEMY, hq.tx - 4, hq.ty + 6, true);
    let up = w
        .place_building(ENEMY, BldgKind::Uplink, 20, 38, Some(bot))
        .expect("the Uplink out of coverage");
    assert_eq!(
        w.place_refusal(BldgKind::Siphon, 30, 38, ENEMY),
        Some(Refusal::Coverage),
        "a site gives none"
    );
    for _ in 0..90 * TPS {
        w.step();
        if w.bldg(up).is_some_and(|b| b.done) {
            break;
        }
    }
    assert!(w.bldg(up).unwrap().done, "the Uplink stands");
    w.step();
    for k in within {
        assert_eq!(
            w.place_refusal(k, 30, 38, ENEMY),
            None,
            "{k:?} in the Uplink's range"
        );
    }
    let post = w
        .place_building(ENEMY, BldgKind::Siphon, 30, 38, Some(bot))
        .expect("a Recruiting post in the Uplink's range");
    w.make_building(BldgKind::Substation, ENEMY, 26, 44, true);
    w.recalc_supply(ENEMY);
    for _ in 0..90 * TPS {
        w.step();
        if w.bldg(post).is_some_and(|b| b.done) {
            break;
        }
    }
    assert!(w.bldg(post).unwrap().done, "the post stands");
    let turbine = w
        .place_building(ENEMY, BldgKind::Spire, 34, 44, None)
        .expect("a Wind turbine in the Uplink's range");
    // Its Uplink falls: the post and the turbine site stay, the post still hires, the turbine is still built and pays.
    w.damage(up, 1e9, None);
    w.step();
    assert!(
        !w.in_radio(ENEMY, px(31.0), px(39.0)),
        "the post is out of coverage now"
    );
    assert_eq!(
        w.place_refusal(BldgKind::Siphon, 26, 38, ENEMY),
        Some(Refusal::Coverage)
    );
    let bot2 = w.make_unit(UnitKind::Lumen, ENEMY, px(34.0), px(42.0));
    w.start_build(bot2, turbine);
    let before = count(&w, ENEMY, UnitKind::Prism);
    w.queue_unit(post, UnitKind::Prism)
        .expect("the post hires out of coverage");
    run(&mut w, 60);
    assert!(w.bldg(post).is_some(), "the post stands");
    assert_eq!(
        count(&w, ENEMY, UnitKind::Prism),
        before + 1,
        "and hired its Sellsword"
    );
    assert!(
        w.bldg(turbine).is_some_and(|b| b.done),
        "the turbine site was finished out of coverage"
    );
    let e0 = w.res[ENEMY as usize][0];
    run(&mut w, 60);
    assert!(w.res[ENEMY as usize][0] > e0, "and it pays");
}
