//! Crowds: units of a group held up round a waypoint they share pass it by; the group arrives.

use super::common::*;

const MID: (f64, f64) = (32.0 * TILE, 32.0 * TILE);

/// `n` units of `kinds` (one after the other) of the player's in a block west of the middle, in open ground with the
/// player's machines in coverage.
fn group(kinds: &[UnitKind], n: usize) -> (World, Vec<Id>) {
    let mut w = flat_arena(5);
    w.make_building(BldgKind::Uplink, PLAYER, 50, 50, true);
    let cols = (n as f64).sqrt().ceil() as usize;
    let ids = (0..n)
        .map(|i| {
            let (c, r) = ((i % cols) as f64, (i / cols) as f64);
            w.make_unit(
                kinds[i % kinds.len()],
                PLAYER,
                MID.0 - 420.0 + 44.0 * c,
                MID.1 - 60.0 + 44.0 * (r - (cols as f64 - 1.0) / 2.0),
            )
        })
        .collect();
    (w, ids)
}
fn walking(w: &World, ids: &[Id]) -> usize {
    ids.iter()
        .filter(|&&i| {
            matches!(
                w.unit(i).unwrap().task,
                Task::Move { .. } | Task::AMove { .. }
            )
        })
        .count()
}

#[test]
fn a_group_in_formation_passes_the_waypoints_it_crowds_and_arrives() {
    // (a route's shared waypoints were touched exactly, so slow units crowded one short of their spots and stayed)
    for (what, kinds) in [
        ("Cannons", &[UnitKind::SiegeTank][..]),
        ("Rovers", &[UnitKind::Monolith]),
        (
            "Knights and Cannons",
            &[UnitKind::Knight, UnitKind::SiegeTank],
        ),
        (
            "Rovers and Androids",
            &[UnitKind::Monolith, UnitKind::Umbra],
        ),
    ] {
        for n in [4usize, 6, 9, 12, 16, 24] {
            for (dx, dy) in [(0.0, 0.0), (90.0, 14.0), (50.0, -37.0)] {
                let (mut w, ids) = group(kinds, n);
                w.formation(&ids, MID.0 + 120.0 + dx, MID.1 + dy);
                run(&mut w, 40);
                assert_eq!(
                    walking(&w, &ids),
                    0,
                    "{n} {what} at ({dx}, {dy}): all arrived"
                );
                for &i in &ids {
                    let u = w.unit(i).unwrap();
                    let d = (u.x - MID.0 - 120.0 - dx).hypot(u.y - MID.1 - dy);
                    assert!(
                        d < 30.0 * (n as f64).sqrt() + 60.0,
                        "{n} {what}: a {:?} stopped {d:.0} px off",
                        u.kind
                    );
                }
            }
        }
    }
}

#[test]
fn a_group_sent_to_one_point_stops_round_it_held_up_by_its_own() {
    // (those the crowd kept off the point walked on at it for good: a march cannot set a Cannon up, a move ignores a
    // shooter)
    for (what, kinds) in [
        ("Cannons", &[UnitKind::SiegeTank][..]),
        ("Rovers", &[UnitKind::Monolith]),
        (
            "Guards, Archers and Cannons",
            &[UnitKind::Trooper, UnitKind::Lancer, UnitKind::SiegeTank],
        ),
        (
            "Rovers and Androids",
            &[UnitKind::Monolith, UnitKind::Umbra],
        ),
    ] {
        for n in [6usize, 9, 16, 24] {
            for amove in [true, false] {
                let (mut w, ids) = group(kinds, n);
                if amove {
                    w.attack_move_group(&ids, MID.0 + 120.0, MID.1);
                } else {
                    for &i in &ids {
                        w.move_to(i, MID.0 + 120.0, MID.1);
                    }
                }
                run(&mut w, 45);
                assert_eq!(
                    walking(&w, &ids),
                    0,
                    "{n} {what}, attack-move {amove}: all stopped"
                );
            }
        }
    }
}

#[test]
fn a_unit_held_up_far_from_its_goal_is_still_on_its_way() {
    // A wall of holding enemies across the only way, a tile wide: the Guard keeps at its move, far from its point.
    let mut w = flat_arena(5);
    for y in 13..51 {
        for x in 31..34 {
            if y != 32 {
                let i = w.map.idx(x, y);
                w.map.rock[i] = 1;
            }
        }
    }
    for x in [32.0, 33.0] {
        let e = w.make_unit(UnitKind::Knight, ENEMY, x * TILE + 16.0, 32.0 * TILE + 16.0);
        set_hp(&mut w, e, 1e6);
        w.hold_unit(e);
    }
    let a = w.make_unit(UnitKind::Trooper, PLAYER, 27.0 * TILE, 32.0 * TILE + 16.0);
    set_hp(&mut w, a, 1e6);
    w.move_to(a, 40.0 * TILE, 32.0 * TILE + 16.0);
    run(&mut w, 20);
    assert!(
        matches!(w.unit(a).unwrap().task, Task::Move { .. }),
        "held up six tiles from its point, still on its way"
    );
    // A packing Cannon is not held up: it drives off once packed.
    let mut w = flat_arena(5);
    let c = w.make_unit(UnitKind::SiegeTank, PLAYER, MID.0, MID.1);
    run(&mut w, 4);
    w.move_to(c, MID.0 + 40.0, MID.1);
    run(&mut w, 6);
    let x = w.unit(c).unwrap().x;
    assert!((x - MID.0 - 40.0).abs() < 1.0, "drove the 40 px: {x}");
}
