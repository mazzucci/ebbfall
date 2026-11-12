//! The range (the Expedition rework's speed bonus): the Expedition's machines move at `IN_RANGE_SPEED` inside the
//! range of a finished Data center (`conflux`, 18 tiles) or Uplink (`uplink`, 12 tiles) of their side or an ally,
//! measured by exact distance from the source's center, and at their normal speed everywhere else. The Sentry mast
//! (`ward`) gives none. The Drone (`shrike`) goes at most `LEASH_MARGIN` tiles past the range and backs off inside
//! rather than idle out there. People and the Kingdom are unaffected.
//! Seed 3's Expedition Data center stands at tile (52, 8); the lane at y 40, x 18..46 is at least 31 tiles from it.

use crate::common::*;
use endfall_sim::data::radio::{
    CONFLUX_RANGE, IN_RANGE_SPEED, LEASH_MARGIN, UPLINK_RANGE, needs_range,
};

fn px(t: f64) -> f64 {
    t * 32.0 + 16.0
}

/// The Kingdom in seat 0, the Expedition in seat 1 (its satellite up), nobody's AI, no starting units, everything
/// explored, the lane flattened.
fn lane() -> World {
    let mut w = World::with_setup(3, 1, MapKind::Standard, false, [&HUMANS, &VAEL]);
    w.disable_ai();
    w.units.clear();
    flatten(&mut w, 12..52, 30..48);
    for e in &mut w.explored {
        e.fill(1);
    }
    w.upgrades[ENEMY as usize][Upgrade::Satellite.index()] = 1;
    for x in 18..46 {
        assert!(
            !w.in_radio(ENEMY, px(x as f64), px(40.0)),
            "the lane starts out of range"
        );
    }
    w
}

/// How far (px) a unit of `kind` at the lane's west end, sent east, gets in `secs` seconds.
fn walked(w: &mut World, kind: UnitKind, secs: u32) -> f64 {
    let id = w.make_unit(kind, ENEMY, px(20.0), px(40.0));
    w.move_to(id, px(45.0), px(40.0));
    run(w, secs);
    let u = w.unit(id).unwrap();
    u.x - px(20.0)
}

fn dist_to(w: &World, u: Id, b: Id) -> f64 {
    let (u, b) = (w.unit(u).unwrap(), w.bldg(b).unwrap());
    ((u.x - b.x).powi(2) + (u.y - b.y).powi(2)).sqrt()
}

const MACHINES: [UnitKind; 4] = [
    UnitKind::Lumen,
    UnitKind::Scythe,
    UnitKind::Monolith,
    UnitKind::Shrike,
];

#[test]
fn a_machine_moves_at_its_normal_speed_out_of_range_and_faster_in_it() {
    // Out of range: every machine at its own speed (the Drone flying towards its Data center's range, which its leash
    // allows).
    for kind in MACHINES {
        let mut w = lane();
        let speed = kind.def().speed;
        let d = walked(&mut w, kind, 3);
        assert!(
            (d - speed * 3.0).abs() < 10.0,
            "{kind:?} out of range: {d} px in 3 s at {speed} px/s"
        );
    }
    // In an Uplink's range (west of the lane, the walk well inside it for a second): faster.
    for kind in MACHINES {
        let mut w = lane();
        w.make_building(BldgKind::Uplink, ENEMY, 17, 36, true);
        w.step();
        let speed = kind.def().speed;
        let d = walked(&mut w, kind, 1);
        assert!(
            (d - speed * IN_RANGE_SPEED).abs() < 8.0,
            "{kind:?} in range: {d} px in 1 s, {IN_RANGE_SPEED} of {speed} px/s"
        );
    }
    // People are no machines: a Sellsword keeps its own speed in range.
    let mut w = lane();
    w.make_building(BldgKind::Uplink, ENEMY, 17, 36, true);
    w.step();
    let speed = UnitKind::Prism.def().speed;
    let d = walked(&mut w, UnitKind::Prism, 1);
    assert!(
        (d - speed).abs() < 8.0,
        "a Sellsword: {d} px in 1 s at {speed} px/s"
    );
}

#[test]
fn range_is_by_exact_distance_from_the_sources_centre() {
    // An Uplink's center lies on a tile corner (3x3 at (29, 37): center (30.5, 38.5) tiles); points just inside and just
    // outside its reach, along a diagonal (off every tile center), are in and out of range, and so is a Bot set there.
    let mut w = lane();
    let up = w.make_building(BldgKind::Uplink, ENEMY, 29, 37, true);
    let (cx, cy) = (w.bldg(up).unwrap().x, w.bldg(up).unwrap().y);
    assert_eq!((cx, cy), (30.5 * 32.0, 38.5 * 32.0));
    let reach = UPLINK_RANGE * 32.0;
    for (ax, ay) in [(0.6, 0.8), (-0.8, 0.6), (1.0, 0.0), (0.28, -0.96)] {
        let at = |r: f64| (cx + ax * r, cy + ay * r);
        let (ix, iy) = at(reach - 0.5);
        let (ox, oy) = at(reach + 0.5);
        assert!(w.in_radio(ENEMY, ix, iy), "just inside ({ax}, {ay})");
        assert!(!w.in_radio(ENEMY, ox, oy), "just outside ({ax}, {ay})");
        let inside = w.make_unit(UnitKind::Lumen, ENEMY, ix, iy);
        let outside = w.make_unit(UnitKind::Lumen, ENEMY, ox, oy);
        assert!(w.radio_boosted(inside), "a Bot just inside ({ax}, {ay})");
        assert!(!w.radio_boosted(outside), "a Bot just outside ({ax}, {ay})");
    }
}

#[test]
fn a_site_and_a_sentry_mast_give_no_range() {
    // An Uplink under construction gives no range; nor does a finished Sentry mast; a finished Uplink does, to its own
    // side only.
    let mut w = lane();
    w.make_building(BldgKind::Uplink, ENEMY, 19, 37, false);
    w.make_building(BldgKind::Ward, ENEMY, 23, 37, true);
    w.step();
    assert!(!w.in_radio(ENEMY, px(20.0), px(40.0)), "a site: no range");
    assert!(
        !w.in_radio(ENEMY, px(24.0), px(38.0)),
        "a Sentry mast: no range"
    );
    let d = walked(&mut w, UnitKind::Scythe, 1);
    let speed = UnitKind::Scythe.def().speed;
    assert!((d - speed).abs() < 8.0, "no bonus by a mast: {d} px in 1 s");
    let mut w = lane();
    w.make_building(BldgKind::Uplink, ENEMY, 19, 37, true);
    assert!(w.in_radio(ENEMY, px(20.0), px(40.0)));
    assert!(
        !w.in_radio(PLAYER, px(20.0), px(40.0)),
        "range is the side's own"
    );
}

#[test]
fn the_data_center_and_an_uplink_give_range_until_the_uplink_falls() {
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
        "the Kingdom has no range of its own"
    );
    // An Uplink: 12 tiles round its middle, from the tick it is done.
    let up = w.make_building(BldgKind::Uplink, ENEMY, 29, 39, true);
    let (ux, uy) = (30.5 * 32.0, 40.5 * 32.0);
    assert!(w.in_radio(ENEMY, ux + (UPLINK_RANGE - 0.1) * 32.0, uy));
    assert!(!w.in_radio(ENEMY, ux + (UPLINK_RANGE + 0.1) * 32.0, uy));
    let ver = w.radio_version();
    w.step();
    assert_eq!(w.radio_version(), ver, "nothing changed: not built again");
    // Destroyed: its range goes with it (the next tick).
    w.damage(up, 1e9, None);
    assert!(w.bldg(up).is_none());
    w.step();
    assert!(!w.in_radio(ENEMY, ux, uy), "the Uplink's range is gone");
    assert!(w.in_radio(ENEMY, hq.0, hq.1), "the Data center's stays");
    // The circles the client draws: the Data center's alone now, at its center with its reach; none for the Kingdom.
    assert_eq!(
        w.radio_circles(ENEMY),
        vec![hq.0, hq.1, CONFLUX_RANGE * 32.0]
    );
    assert!(w.radio_circles(PLAYER).is_empty());
}

#[test]
fn an_allys_range_counts() {
    // Two Expedition seats on one team against two Kingdom seats, 96x96.
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
    // A spot far from every Data center: an ally's Uplink there gives seat 0 range, not the enemy.
    let (tx, ty) = (4..92)
        .flat_map(|y| (4..92).map(move |x| (x, y)))
        .find(|&(x, y)| {
            !w.in_radio_by(0, px(x as f64), px(y as f64), 6.0)
                && w.can_place(BldgKind::Uplink, x, y, 1)
                && (0..5).all(|dx| w.map.rock[w.map.idx(x + 3 + dx, y + 1)] == 0)
        })
        .expect("a spot out of range");
    let (cx, cy) = ((tx as f64 + 1.5) * 32.0, (ty as f64 + 1.5) * 32.0);
    assert!(!w.in_radio(0, cx, cy));
    w.make_building(BldgKind::Uplink, 1, tx, ty, true);
    assert!(w.in_radio(0, cx, cy), "the ally's Uplink");
    assert!(w.in_radio(1, cx, cy), "its own");
    assert!(
        !w.in_radio(2, cx, cy) && !w.in_radio(3, cx, cy),
        "not the enemy's"
    );
    // The circles the client draws for seat 0 hold its ally's Uplink (after its Data center), not the enemy's.
    let circles = w.radio_circles(0);
    assert_eq!(circles[circles.len() - 3..], [cx, cy, UPLINK_RANGE * 32.0]);
    assert!(
        w.radio_circles(2)
            .chunks(3)
            .all(|c| c[0] != cx || c[1] != cy)
    );
    // And seat 0's Bot beside it, out of its own seat's range, moves faster in its ally's.
    let (bx, by) = (px(tx as f64 + 3.0), px(ty as f64 + 1.0));
    let bot = w.make_unit(UnitKind::Lumen, 0, bx, by);
    let speed = UnitKind::Lumen.def().speed;
    w.move_to(bot, bx + 4.0 * 32.0, by);
    run(&mut w, 1);
    let d = w.unit(bot).unwrap().x - bx;
    assert!(
        d > speed * 1.2,
        "a Bot in its ally's range: {d} px in 1 s at {speed} px/s"
    );
}

#[test]
fn a_drone_stops_at_its_leash_and_stays_there_and_fights_what_it_reaches_from_there() {
    let mut w = lane();
    let ward = w.make_building(BldgKind::Uplink, ENEMY, 19, 37, true);
    let edge = UPLINK_RANGE * 32.0;
    let leash = (UPLINK_RANGE + LEASH_MARGIN) * 32.0;
    // Sent far east: it flies to the end of its leash, never past it, and stops there; idle within the leash, it stays.
    let s = w.make_unit(UnitKind::Shrike, ENEMY, px(21.0), px(40.0));
    w.move_to(s, px(45.0), px(40.0));
    let mut farthest: f64 = 0.0;
    for _ in 0..12 * TPS {
        w.step();
        farthest = farthest.max(dist_to(&w, s, ward));
    }
    assert!(
        farthest <= leash + 1.0 && farthest > leash - 8.0,
        "out to the end of its leash: {farthest} px"
    );
    let d = dist_to(&w, s, ward);
    let task = w.unit(s).unwrap().task;
    assert!(
        d > leash - 8.0 && task == Task::Idle,
        "it stays at its leash: {d} px from the Uplink ({task:?})"
    );
    // Told to attack a building past its leash's reach, it does not chase it out there either.
    let depot = w.make_building(BldgKind::Depot, PLAYER, 46, 39, true);
    w.attack_ent(s, depot);
    for _ in 0..12 * TPS {
        w.step();
        assert!(dist_to(&w, s, ward) <= leash + 1.0, "within its leash");
    }
    let b = w.bldg(depot).unwrap();
    assert_eq!(b.hp, b.maxhp, "the Depot is out of its reach");
    // A building within its reach of the end of its leash: it fights it from there.
    let near = w.make_building(BldgKind::Depot, PLAYER, 38, 39, true);
    w.attack_ent(s, near);
    run(&mut w, 8);
    let d = dist_to(&w, s, ward);
    assert!(d > edge && d <= leash + 1.0, "out at its leash: {d} px");
    let b = w.bldg(near).unwrap();
    assert!(b.hp < b.maxhp, "it strikes the near Depot from there");
}

#[test]
fn a_drone_left_beyond_its_leash_backs_off_inside_its_range() {
    // Two Uplinks; the Drone rests by the eastern one. That one falls: beyond the western one's leash, it backs off
    // inside that one's range.
    let mut w = lane();
    let west = w.make_building(BldgKind::Uplink, ENEMY, 19, 37, true);
    let east = w.make_building(BldgKind::Uplink, ENEMY, 37, 37, true);
    let s = w.make_unit(UnitKind::Shrike, ENEMY, px(43.0), px(40.0));
    run(&mut w, 2);
    assert!(dist_to(&w, s, west) > (UPLINK_RANGE + LEASH_MARGIN) * 32.0);
    assert_eq!(
        w.unit(s).unwrap().task,
        Task::Idle,
        "idle by the eastern Uplink"
    );
    w.damage(east, 1e9, None);
    run(&mut w, 15);
    let d = dist_to(&w, s, west);
    assert!(
        d < UPLINK_RANGE * 32.0,
        "back inside the western Uplink's range: {d} px"
    );
}

#[test]
fn an_expedition_waves_machines_keep_attacking_out_of_range() {
    // The Expedition's AI against a Kingdom player who does nothing, two Rovers in its army from the start. Once its
    // wave is out, a Rover of it told to attack the Kingdom's Core (far beyond its range, as the wave's `engage` does)
    // keeps at it over the AI's next turns: machines are no slower out of range, so the AI calls none home for it.
    let mut w = World::with_setup(3, 1, MapKind::Standard, false, [&HUMANS, &VAEL]);
    let hq = w
        .bldgs
        .iter()
        .find(|b| b.team == ENEMY && b.kind == BldgKind::Conflux)
        .map(|b| (b.x, b.y))
        .unwrap();
    for k in 0..2 {
        w.make_unit(
            UnitKind::Monolith,
            ENEMY,
            hq.0 + 96.0,
            hq.1 + 32.0 * k as f64,
        );
    }
    w.recalc_supply(ENEMY);
    let core = w
        .bldgs
        .iter()
        .find(|b| b.team == PLAYER && b.kind.def().hq)
        .map(|b| (b.id, b.x, b.y))
        .unwrap();
    assert!(!w.in_radio_by(ENEMY, core.1, core.2, 3.0));
    let rover = loop {
        w.step();
        assert!(w.time < 300.0, "no wave");
        if let Some(r) = w.ai_wave_of(ENEMY).and_then(|v| {
            v.iter()
                .copied()
                .find(|&a| w.unit(a).is_some_and(|u| u.kind == UnitKind::Monolith))
        }) {
            break r;
        }
    };
    w.attack_ent(rover, core.0);
    for _ in 0..4 * 16 {
        w.step();
        let task = w.unit(rover).map(|u| u.task);
        assert!(
            matches!(task, Some(Task::Attack { target, .. }) if target == core.0),
            "the Rover keeps attacking the Core: {task:?} at tick {}",
            w.tick
        );
    }
}

#[test]
fn the_expedition_ai_places_a_forward_uplink_on_a_machine_waves_march() {
    // The Expedition's AI against the Kingdom's, two Rovers in its army from the start: once its first wave is out (with
    // them) and its satellite up, it raises an Uplink beyond its Data center's range on the way, and the wave goes on
    // meanwhile.
    for seed in [3, 11, 77] {
        let mut w = World::with_setup(seed, 1, MapKind::Standard, false, [&HUMANS, &VAEL]);
        assert!(w.set_ai_seats([true, true]));
        let hq = w
            .bldgs
            .iter()
            .find(|b| b.team == ENEMY && b.kind == BldgKind::Conflux)
            .map(|b| (b.x, b.y))
            .unwrap();
        for k in 0..2 {
            w.make_unit(
                UnitKind::Monolith,
                ENEMY,
                hq.0 + 96.0,
                hq.1 + 32.0 * k as f64,
            );
        }
        w.recalc_supply(ENEMY);
        w.res[ENEMY as usize][0] += 1000;
        w.upgrades[ENEMY as usize][Upgrade::Satellite.index()] = 1;
        let foe = w
            .bldgs
            .iter()
            .find(|b| b.team == PLAYER && b.kind.def().hq)
            .map(|b| (b.x, b.y))
            .unwrap();
        let d = |a: (f64, f64), b: (f64, f64)| ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2)).sqrt();
        // (beyond the Data center's range, nearer the foe than the Data center is)
        let far = |_: &World, b: &endfall_sim::world::Bldg| {
            d((b.x, b.y), hq) > CONFLUX_RANGE * 32.0 && d((b.x, b.y), foe) < d(hq, foe)
        };
        let mut launched = None;
        let mut forward = None;
        while w.time < 300.0 && !w.over {
            w.step();
            if launched.is_none()
                && let Some(wave) = w.ai_wave_of(ENEMY)
            {
                let machines = wave
                    .iter()
                    .any(|&a| w.unit(a).is_some_and(|u| needs_range(u.kind)));
                assert!(machines, "seed {seed}: the Rovers go with the wave");
                assert!(
                    !w.bldgs
                        .iter()
                        .any(|b| b.team == ENEMY && b.kind == BldgKind::Uplink && far(&w, b)),
                    "seed {seed}: no forward Uplink before the wave"
                );
                launched = Some(w.time);
            }
            if launched.is_some()
                && w.bldgs
                    .iter()
                    .any(|b| b.team == ENEMY && b.kind == BldgKind::Uplink && far(&w, b))
            {
                forward = Some(w.time);
                let site = w
                    .bldgs
                    .iter()
                    .find(|b| b.team == ENEMY && b.kind == BldgKind::Uplink && far(&w, b));
                assert_eq!(
                    w.ai_relay_site(ENEMY),
                    site.map(|b| b.id),
                    "seed {seed}: the wave's forward Uplink"
                );
                assert!(
                    w.ai_wave_of(ENEMY).is_some(),
                    "seed {seed}: the wave is still out, not held for it"
                );
                break;
            }
        }
        let t0 = launched.unwrap_or_else(|| panic!("seed {seed}: no wave"));
        let t1 = forward.unwrap_or_else(|| panic!("seed {seed}: no forward Uplink"));
        assert!(
            t1 - t0 < 60.0,
            "seed {seed}: a forward Uplink {} s after the wave went",
            t1 - t0
        );
    }
}
