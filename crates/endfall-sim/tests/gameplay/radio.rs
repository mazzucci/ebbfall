//! The tower range (radio range): the Expedition's machines need range from a finished Data center (`conflux`, 18
//! tiles) or Radio tower (`ward`, 12 tiles) of their side or an ally. Outside it a machine moves at
//! `OUT_OF_RANGE_SPEED`; the Drone (`shrike`) goes at most `LEASH_MARGIN` tiles past it and backs off inside rather than
//! idle out there. People and the Kingdom are unaffected.
//! Seed 3's Expedition Data center stands at tile (52, 8); the lane at y 40, x 18..46 is at least 31 tiles from it.

use crate::common::*;
use endfall_sim::data::radio::{
    CONFLUX_RANGE, LEASH_MARGIN, OUT_OF_RANGE_SPEED, WARD_RANGE, needs_range,
};

fn px(t: f64) -> f64 {
    t * 32.0 + 16.0
}

/// The Kingdom in seat 0, the Expedition in seat 1, nobody's AI, no starting units, everything explored, the lane
/// flattened.
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

#[test]
fn a_machine_out_of_range_moves_slower_and_a_person_does_not() {
    // Every machine: the Bot, the Buggy, the Rover and the Drone (flying towards its range, which its leash allows).
    for kind in [
        UnitKind::Lumen,
        UnitKind::Scythe,
        UnitKind::Monolith,
        UnitKind::Shrike,
    ] {
        let mut w = lane();
        let speed = kind.def().speed;
        let d = walked(&mut w, kind, 3);
        assert!(
            (d - speed * OUT_OF_RANGE_SPEED * 3.0).abs() < 10.0,
            "{kind:?} out of range: {d} px in 3 s, {OUT_OF_RANGE_SPEED} of {speed} px/s"
        );
    }
    // People are no machines: a Sellsword keeps its speed out there.
    let mut w = lane();
    let speed = UnitKind::Prism.def().speed;
    let d = walked(&mut w, UnitKind::Prism, 3);
    assert!(
        (d - speed * 3.0).abs() < 10.0,
        "a Sellsword: {d} px in 3 s at {speed} px/s"
    );
}

#[test]
fn a_machine_in_range_moves_at_full_speed_and_a_site_gives_no_range() {
    // A Radio tower under construction gives no range; a finished one does, to its own side only.
    let mut w = lane();
    w.make_building(BldgKind::Ward, ENEMY, 19, 37, false);
    assert!(!w.in_radio(ENEMY, px(20.0), px(40.0)), "a site: no range");
    for kind in [UnitKind::Scythe, UnitKind::Lumen] {
        let mut w = lane();
        w.make_building(BldgKind::Ward, ENEMY, 19, 37, true);
        assert!(w.in_radio(ENEMY, px(20.0), px(40.0)));
        assert!(
            !w.in_radio(PLAYER, px(20.0), px(40.0)),
            "range is the side's own"
        );
        let speed = kind.def().speed;
        let d = walked(&mut w, kind, 3);
        assert!(
            (d - speed * 3.0).abs() < 10.0,
            "{kind:?} in range: {d} px in 3 s at {speed} px/s"
        );
    }
}

#[test]
fn the_data_center_and_a_radio_tower_give_range_until_the_tower_falls() {
    let mut w = lane();
    let hq = w
        .bldgs
        .iter()
        .find(|b| b.team == ENEMY && b.kind == BldgKind::Conflux)
        .map(|b| (b.x, b.y))
        .unwrap();
    // The Data center: 18 tiles round its middle (south of it, on the map).
    assert!(w.in_radio(ENEMY, hq.0, hq.1 + (CONFLUX_RANGE - 1.0) * 32.0));
    assert!(!w.in_radio(ENEMY, hq.0, hq.1 + (CONFLUX_RANGE + 1.0) * 32.0));
    assert!(
        !w.in_radio(PLAYER, hq.0, hq.1),
        "the Kingdom has no range of its own"
    );
    // A Radio tower: 12 tiles round its middle, from the tick it is done.
    let ward = w.make_building(BldgKind::Ward, ENEMY, 29, 39, true);
    let (wx, wy) = (30.0 * 32.0, 40.0 * 32.0);
    assert!(w.in_radio(ENEMY, wx + (WARD_RANGE - 1.0) * 32.0, wy));
    assert!(!w.in_radio(ENEMY, wx + (WARD_RANGE + 1.0) * 32.0, wy));
    let ver = w.radio_version();
    w.step();
    assert_eq!(w.radio_version(), ver, "nothing changed: not built again");
    // Destroyed: its range goes with it (the next tick).
    w.damage(ward, 1e9, None);
    assert!(w.bldg(ward).is_none());
    w.step();
    assert!(!w.in_radio(ENEMY, wx, wy), "the tower's range is gone");
    assert!(w.in_radio(ENEMY, hq.0, hq.1), "the Data center's stays");
    // The cover the client draws: the same tiles.
    let cover = w.radio_cover(ENEMY);
    let (tx, ty) = ((hq.0 / 32.0) as i32, (hq.1 / 32.0) as i32);
    assert_eq!(cover[w.map.idx(tx, ty)], 1);
    assert_eq!(cover[w.map.idx(30, 40)], 0);
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
    // A spot far from every Data center: an ally's tower there gives seat 0 range, not the enemy.
    let (tx, ty) = (4..92)
        .flat_map(|y| (4..92).map(move |x| (x, y)))
        .find(|&(x, y)| {
            !w.in_radio_by(0, px(x as f64), px(y as f64), 6.0)
                && w.can_place(BldgKind::Ward, x, y, 1)
                && (0..4).all(|dx| w.map.rock[w.map.idx(x + 3 + dx, y)] == 0)
        })
        .expect("a spot out of range");
    let (cx, cy) = (px(tx as f64), px(ty as f64));
    assert!(!w.in_radio(0, cx, cy));
    w.make_building(BldgKind::Ward, 1, tx, ty, true);
    assert!(w.in_radio(0, cx, cy), "the ally's tower");
    assert!(w.in_radio(1, cx, cy), "its own");
    assert!(
        !w.in_radio(2, cx, cy) && !w.in_radio(3, cx, cy),
        "not the enemy's"
    );
    // And seat 0's Bot beside it, out of its own seat's range, moves at its full speed.
    let (bx, by) = (px(tx as f64 + 4.0), cy);
    let bot = w.make_unit(UnitKind::Lumen, 0, bx, by);
    let speed = UnitKind::Lumen.def().speed;
    w.move_to(bot, bx + 3.0 * 32.0, by);
    run(&mut w, 1);
    let d = w.unit(bot).unwrap().x - bx;
    assert!(
        d > speed * 0.9,
        "a Bot in its ally's range: {d} px in 1 s at {speed} px/s"
    );
}

#[test]
fn a_drone_goes_no_farther_than_its_leash_and_backs_off_inside_its_range() {
    let mut w = lane();
    let ward = w.make_building(BldgKind::Ward, ENEMY, 19, 37, true);
    let edge = WARD_RANGE * 32.0;
    let leash = (WARD_RANGE + LEASH_MARGIN) * 32.0;
    // Sent far east: it flies to the end of its leash, never past it, then backs off inside its range and rests there.
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
        d < edge - 32.0 && task == Task::Idle,
        "it backed off inside its range: {d} px from the tower ({task:?})"
    );
    // Told to attack a building past its leash's reach, it does not chase it out there either.
    let depot = w.make_building(BldgKind::Depot, PLAYER, 44, 39, true);
    w.attack_ent(s, depot);
    for _ in 0..12 * TPS {
        w.step();
        assert!(dist_to(&w, s, ward) <= leash + 1.0, "within its leash");
    }
    let b = w.bldg(depot).unwrap();
    assert_eq!(b.hp, b.maxhp, "the Depot is out of its reach");
    assert!(
        dist_to(&w, s, ward) <= edge,
        "and it rests inside its range"
    );
    // A building within its reach of the end of its leash: sent east again, it fights from there, no backing off.
    let near = w.make_building(BldgKind::Depot, PLAYER, 38, 39, true);
    w.move_to(s, px(45.0), px(40.0));
    run(&mut w, 8);
    let d = dist_to(&w, s, ward);
    assert!(d > edge && d <= leash + 1.0, "out at its leash: {d} px");
    let b = w.bldg(near).unwrap();
    assert!(b.hp < b.maxhp, "it strikes the near Depot from there");
}

#[test]
fn the_expedition_ai_places_a_forward_tower_on_a_machine_waves_march() {
    // The Expedition's AI against the Kingdom's, two Rovers in its army from the start: once its first wave is out (with
    // them), it raises a Radio tower beyond its Data center's range on the way, and the wave goes on meanwhile.
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
                        .any(|b| b.team == ENEMY && b.kind == BldgKind::Ward && far(&w, b)),
                    "seed {seed}: no forward tower before the wave"
                );
                launched = Some(w.time);
            }
            if launched.is_some()
                && w.bldgs
                    .iter()
                    .any(|b| b.team == ENEMY && b.kind == BldgKind::Ward && far(&w, b))
            {
                forward = Some(w.time);
                assert!(
                    w.ai_wave_of(ENEMY).is_some(),
                    "seed {seed}: the wave is still out, not held for it"
                );
                break;
            }
        }
        let t0 = launched.unwrap_or_else(|| panic!("seed {seed}: no wave"));
        let t1 = forward.unwrap_or_else(|| panic!("seed {seed}: no forward tower"));
        assert!(
            t1 - t0 < 60.0,
            "seed {seed}: a forward tower {} s after the wave went",
            t1 - t0
        );
    }
}
