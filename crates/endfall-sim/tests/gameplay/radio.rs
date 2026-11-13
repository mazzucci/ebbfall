//! Coverage (the arc, Nov 13: "machines need signal; mercenaries don't"): the Expedition's combat machines (the
//! Buggy, the Drone, the Rover, the Android) work only inside the coverage of a finished Data center (`conflux`, 18
//! tiles) or Uplink (`uplink`, 54 tiles on every map since Nov 13) of their side or an ally, by exact distance from
//! the source's center, and move at `IN_RANGE_SPEED` there. Ordered past its edge they stop at it and fight what they
//! reach from there; one left outside (its Uplink fell: stranded) moves only towards coverage, at `STRANDED_SPEED`,
//! and walks back by itself when idle. The Sentry mast (`ward`) gives none. Bots, people and the Kingdom are free.
//! Seed 3's Expedition Data center stands at tile (52, 8); the lane at y 40, x 18..46 is at least 31 tiles from it.
//! An Uplink's 54 tiles cover most of that 64x64 map, so the scenes about coverage's edge use a second Data center as
//! their source (`source`): the edge rules are the same for every source, only the reach differs.

use crate::common::*;
use endfall_sim::data::radio::{
    CONFLUX_RANGE, IN_RANGE_SPEED, STRANDED_SPEED, UPLINK_RANGE, needs_range,
};
use endfall_sim::jsmath;
use endfall_sim::world::radio::NO_SIGNAL;
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

#[test]
fn machines_need_signal_bots_and_people_go_anywhere() {
    for k in MACHINES {
        assert!(needs_range(k), "{k:?} needs signal");
    }
    for k in [
        UnitKind::Lumen,
        UnitKind::Prism,
        UnitKind::Bruiser,
        UnitKind::Trooper,
    ] {
        assert!(!needs_range(k), "{k:?} goes anywhere");
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
    // Stranded outside it (the Data center's coverage far off): slower, and only towards it.
    for kind in MACHINES {
        let mut w = lane();
        let speed = kind.def().speed;
        // (the Data center north-east of the lane: east is towards it)
        let d = walked_from(&mut w, kind, 30.0, 45.0, 1);
        assert!(
            (d - speed * STRANDED_SPEED).abs() < 8.0,
            "{kind:?} stranded: {d} px in 1 s, {STRANDED_SPEED} of {speed} px/s"
        );
        // (sent west, away from it: refused at the first step; idle, it then walks back towards it by itself)
        let mut w = lane();
        let id = w.make_unit(kind, ENEMY, px(30.0), px(40.0));
        w.move_to(id, px(14.0), px(40.0));
        let mut west = px(30.0);
        for _ in 0..2 * TPS {
            w.step();
            west = west.min(w.unit(id).unwrap().x);
        }
        assert!(
            west > px(30.0) - 4.0,
            "{kind:?}: no farther from coverage ({west} px)"
        );
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
            w.radio_boosted(inside) && !w.radio_stranded(inside),
            "a Buggy just inside ({ax}, {ay})"
        );
        assert!(
            !w.radio_boosted(outside) && w.radio_stranded(outside),
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
fn a_machine_ordered_past_coverage_stops_at_its_edge_stays_there_and_fights_what_it_reaches() {
    for kind in [UnitKind::Scythe, UnitKind::Shrike] {
        let mut w = lane();
        let up = source(&mut w, 19, 37);
        let edge = CONFLUX_RANGE * 32.0;
        // Sent far east: it goes to the edge, never past it, and stops there; idle at the edge, it stays.
        let s = w.make_unit(kind, ENEMY, px(21.0), px(40.0));
        w.move_to(s, px(50.0), px(40.0));
        let mut farthest: f64 = 0.0;
        for _ in 0..15 * TPS {
            w.step();
            farthest = farthest.max(dist_to(&w, s, up));
        }
        assert!(
            farthest <= edge + 1.0 && farthest > edge - 12.0,
            "{kind:?}: out to the edge: {farthest} px"
        );
        let d = dist_to(&w, s, up);
        let task = w.unit(s).unwrap().task;
        assert!(
            d > edge - 12.0 && task == Task::Idle,
            "{kind:?} stays at the edge: {d} px ({task:?})"
        );
        // Told to attack a building out of its reach from the edge: it does not go out there.
        let depot = w.make_building(BldgKind::Depot, PLAYER, 46, 39, true);
        w.attack_ent(s, depot);
        for _ in 0..10 * TPS {
            w.step();
            assert!(dist_to(&w, s, up) <= edge + 1.0, "{kind:?} within coverage");
        }
        let b = w.bldg(depot).unwrap();
        assert_eq!(b.hp, b.maxhp, "{kind:?}: the Depot is out of its reach");
        // A building within its reach from the edge: it fights it from there.
        let near = w.make_building(BldgKind::Depot, PLAYER, 40, 39, true);
        w.attack_ent(s, near);
        run(&mut w, 8);
        assert!(
            dist_to(&w, s, up) <= edge + 1.0,
            "{kind:?} still within coverage"
        );
        let b = w.bldg(near).unwrap();
        assert!(b.hp < b.maxhp, "{kind:?} strikes the near Depot from there");
    }
}

#[test]
fn a_stranded_machine_fights_where_it_stands_and_walks_back_when_idle() {
    // Two sources; the Buggy rests by the eastern one. That one falls: out of the western one's coverage, it walks back
    // inside it by itself, slowly; before, it answers what attacks it where it stands.
    let mut w = lane();
    let west = source(&mut w, 13, 37);
    let east = source(&mut w, 40, 37);
    let s = w.make_unit(UnitKind::Scythe, ENEMY, px(48.0), px(40.0));
    run(&mut w, 2);
    assert!(dist_to(&w, s, west) > CONFLUX_RANGE * 32.0);
    assert_eq!(
        w.unit(s).unwrap().task,
        Task::Idle,
        "idle by the eastern source"
    );
    w.damage(east, 1e9, None);
    w.step();
    assert!(w.radio_stranded(s), "stranded");
    run(&mut w, 40);
    // (into its side's coverage: the home Data center's or the western source's, whichever edge is nearer)
    let u = w.unit(s).unwrap();
    assert!(
        w.in_radio(ENEMY, u.x, u.y) && !w.radio_stranded(s),
        "back inside coverage: at ({:.0}, {:.0})",
        u.x / 32.0,
        u.y / 32.0
    );
    let _ = west;
    // Stranded again, with a foe in reach: it fights it there.
    let mut w = lane();
    source(&mut w, 13, 37);
    let east = source(&mut w, 40, 37);
    let s = w.make_unit(UnitKind::Scythe, ENEMY, px(48.0), px(40.0));
    run(&mut w, 1);
    w.damage(east, 1e9, None);
    let foe = w.make_unit(UnitKind::Trooper, PLAYER, px(50.0), px(40.0));
    w.hold_unit(foe);
    run(&mut w, 3);
    let f = w.unit(foe).unwrap();
    assert!(f.hp < f.maxhp, "it fights where it stands");
    assert!(w.radio_stranded(s), "still out there");
}

#[test]
fn notches_between_two_overlapping_sources() {
    // Two overlapping sources make one connected coverage whose edge has notches where the circles meet. A machine sent
    // from the middle of one to the middle of the other, on a straight line through the waist, gets there (the line
    // stays in the union); one whose straight way clips a notch goes round it inside (`waist`, below).
    let mut w = lane();
    let a = source(&mut w, 13, 37);
    let b = source(&mut w, 45, 37);
    let (ax, ay, bx) = (
        w.bldg(a).unwrap().x,
        w.bldg(a).unwrap().y,
        w.bldg(b).unwrap().x,
    );
    w.step();
    // (from beside one source's 4x4 to beside the other's)
    let s = w.make_unit(UnitKind::Scythe, ENEMY, ax + 96.0, ay);
    w.move_to(s, bx - 96.0, ay);
    run(&mut w, 20);
    let u = w.unit(s).unwrap();
    assert!(
        (u.x - (bx - 96.0)).abs() < 40.0,
        "across the waist: at {:.0}, wanted {:.0}",
        u.x,
        bx - 96.0
    );
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
fn a_machine_whose_straight_way_leaves_coverage_goes_round_inside_it() {
    // Eight tiles off the line between the centers the straight way crosses the waist outside coverage: before, the
    // machine stopped at the edge for good (and an attack order there never fired). Now its route keeps to the
    // covered tiles: a Buggy sent across arrives, and one told to attack a Depot over there gets there and hits it,
    // never leaving coverage on the way.
    let (mut w, a, b) = waist();
    let (y, from, to) = (a.1 + 8.0 * 32.0, a.0 + 4.0 * 32.0, b.0 - 4.0 * 32.0);
    assert!(
        !w.in_radio(ENEMY, (a.0 + b.0) / 2.0, y),
        "the straight way leaves coverage"
    );
    let s = w.make_unit(UnitKind::Scythe, ENEMY, from, y);
    assert_eq!(w.apply(ENEMY, &Command::Move { unit: s, x: to, y }), Ok(()));
    for _ in 0..40 * TPS {
        w.step();
        let u = w.unit(s).unwrap();
        assert!(
            w.in_radio(ENEMY, u.x, u.y),
            "inside coverage all the way: ({:.0}, {:.0})",
            u.x,
            u.y
        );
    }
    let u = w.unit(s).unwrap();
    assert!(
        jsmath::dist(u.x, u.y, to, y) < 40.0,
        "arrived: at ({:.0}, {:.0}), wanted ({to:.0}, {y:.0})",
        u.x,
        u.y
    );
    // an attack order across the waist
    let depot = w.make_building(
        BldgKind::Depot,
        PLAYER,
        (b.0 / 32.0) as i32 - 3,
        (y / 32.0) as i32 - 1,
        true,
    );
    let k = w.make_unit(UnitKind::Scythe, ENEMY, from, y);
    assert_eq!(
        w.apply(
            ENEMY,
            &Command::Attack {
                unit: k,
                target: depot
            }
        ),
        Ok(())
    );
    run(&mut w, 45);
    assert!(
        w.bldg(depot).is_none_or(|d| d.hp < d.maxhp),
        "it got there and fired"
    );
}

#[test]
fn a_target_with_no_covered_way_to_it_stops_the_machine_at_the_edge_and_its_player_is_told() {
    // A Depot well outside coverage, off the waist: a Buggy told to attack it goes as far as coverage allows and
    // stops there, never firing, and its player hears why (once for the group).
    let (mut w, a, b) = waist();
    let mid = (a.0 + b.0) / 2.0;
    let depot = w.make_building(
        BldgKind::Depot,
        PLAYER,
        (mid / 32.0) as i32 - 1,
        (a.1 / 32.0) as i32 + 20,
        true,
    );
    let ks: Vec<Id> = (0..3)
        .map(|i| {
            w.make_unit(
                UnitKind::Scythe,
                ENEMY,
                a.0 + 4.0 * 32.0,
                a.1 + i as f64 * 24.0,
            )
        })
        .collect();
    w.events.clear();
    for &k in &ks {
        assert_eq!(
            w.apply(
                ENEMY,
                &Command::Attack {
                    unit: k,
                    target: depot
                }
            ),
            Ok(())
        );
    }
    let told = w
        .events
        .iter()
        .filter(|e| matches!(e, Event::Toast { team, msg, bad: true } if *team == ENEMY && msg == NO_SIGNAL))
        .count();
    assert_eq!(told, 1, "told once: {:?}", w.events);
    run(&mut w, 40);
    let d = w.bldg(depot).unwrap();
    assert_eq!(d.hp, d.maxhp, "out of its reach: never fired");
    for &k in &ks {
        let u = w.unit(k).unwrap();
        // (within a tile of it: three at one spot of the edge jostle, and the push between units is not held at it)
        assert!(w.in_radio_by(ENEMY, u.x, u.y, 1.0), "stopped at coverage");
        assert!(
            !w.in_radio_by(ENEMY, u.x, u.y, -3.0),
            "at its edge, as near as it gets: ({:.0}, {:.0})",
            u.x,
            u.y
        );
    }
    // a way there through coverage: nothing said
    w.events.clear();
    let s = w.make_unit(UnitKind::Scythe, ENEMY, a.0 + 4.0 * 32.0, a.1);
    assert_eq!(
        w.apply(
            ENEMY,
            &Command::Move {
                unit: s,
                x: b.0,
                y: b.1
            }
        ),
        Ok(())
    );
    assert!(
        !w.events
            .iter()
            .any(|e| matches!(e, Event::Toast { msg, .. } if msg == NO_SIGNAL))
    );
}

#[test]
fn the_expedition_ai_pushes_one_forward_uplink_that_covers_the_foe_then_its_machines() {
    // The push (the arc: "an Uplink, then the machines"; one Uplink since Nov 13): the Expedition's AI against the
    // Kingdom's on 96x96 two-player maps (its foe's buildings made to last), four Rovers and a Lab from the start. With
    // its goal out of its coverage its machines stay out of its waves and wait inside its coverage, and it raises one
    // Uplink whose coverage takes in the foe's headquarters, as far back as that allows: beyond its Data center's
    // coverage where the foe is far (the diagonal starts), and its machines then stand nearer the foe than they began;
    // within ten minutes, with a single Uplink. None of its machines ever leaves its coverage while it stands (by more
    // than two tiles: a crowd at the edge jostles).
    for seed in [1, 2, 4] {
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
        w.make_building(BldgKind::Loom, ENEMY, lx, ly, true); // (the Uplink's requirement)
        for b in w.bldgs.iter_mut().filter(|b| b.team == PLAYER) {
            (b.hp, b.maxhp) = (1e9, 1e9);
        }
        let foe = w
            .bldgs
            .iter()
            .find(|b| b.team == PLAYER && b.kind.def().hq)
            .map(|b| (b.x, b.y))
            .unwrap();
        let d = |a: (f64, f64), b: (f64, f64)| ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2)).sqrt();
        let far = d(hq, foe) > (CONFLUX_RANGE + UPLINK_RANGE) * 32.0;
        let nearest_machine = |w: &World| {
            w.units
                .iter()
                .filter(|u| u.team == ENEMY && needs_range(u.kind))
                .map(|u| d((u.x, u.y), foe))
                .fold(f64::INFINITY, f64::min)
        };
        let start = nearest_machine(&w);
        let mut covering = None;
        let mut uplinks_lost = false;
        let mut seen = 0;
        while w.time < 600.0 && !w.over {
            w.step();
            let ups: Vec<(f64, f64)> = w
                .bldgs
                .iter()
                .filter(|b| b.team == ENEMY && b.kind == BldgKind::Uplink && b.done)
                .map(|b| (b.x, b.y))
                .collect();
            uplinks_lost |= ups.len() < seen;
            seen = seen.max(ups.len());
            if covering.is_none() {
                covering = ups
                    .iter()
                    .copied()
                    .find(|&u| d(u, foe) <= (UPLINK_RANGE - 6.0) * 32.0);
            }
            if !uplinks_lost && w.tick.is_multiple_of(30) {
                for u in w
                    .units
                    .iter()
                    .filter(|u| u.team == ENEMY && needs_range(u.kind))
                {
                    assert!(
                        w.in_radio(ENEMY, u.x, u.y) || w.in_radio_by(ENEMY, u.x, u.y, 2.0),
                        "seed {seed}: a {:?} out of coverage at {:.0} s ({:?}) at ({:.1}, {:.1}) tiles, its Data center at ({:.1}, {:.1})",
                        u.kind,
                        w.time,
                        u.task,
                        u.x / 32.0,
                        u.y / 32.0,
                        hq.0 / 32.0,
                        hq.1 / 32.0
                    );
                }
            }
        }
        let up = covering.unwrap_or_else(|| panic!("seed {seed}: no Uplink covering the foe"));
        assert_eq!(seen, 1, "seed {seed}: one Uplink");
        // (well short of the foe's base: sited to cover its goal, the foe's building it knows best, which may stand
        // forward of its headquarters, with tiles to spare)
        assert!(
            d(up, foe) > (UPLINK_RANGE - 30.0) * 32.0,
            "seed {seed}: the Uplink {:.0} tiles from the foe: no farther forward than it needs",
            d(up, foe) / 32.0
        );
        if far {
            assert!(
                d(up, hq) > CONFLUX_RANGE * 32.0,
                "seed {seed}: forward of its Data center's coverage"
            );
            assert!(
                nearest_machine(&w) < start,
                "seed {seed}: its machines nearer the foe ({:.0} px from {start:.0})",
                nearest_machine(&w)
            );
        }
    }
}
