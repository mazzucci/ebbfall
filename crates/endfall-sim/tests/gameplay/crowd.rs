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
