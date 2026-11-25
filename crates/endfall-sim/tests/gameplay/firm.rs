//! Standing firm: a unit that holds, or is deployed and settled in, is never pushed; one settling in is pushed clear; a
//! walker passes its own seat's firm units to its goal and is pushed clear where it stops.

use super::common::*;

const MID: (f64, f64) = (32.0 * TILE, 32.0 * TILE);
/// A formation's spacing (px): two Cannons, or a Cannon and a Knight, just touching.
const TOUCHING: f64 = 28.0;

fn set_up(w: &World, id: Id) -> bool {
    w.unit(id).is_some_and(|u| u.mode.is_some())
}
fn apart(w: &World, a: Id, b: Id) -> f64 {
    let (a, b) = (w.unit(a).unwrap(), w.unit(b).unwrap());
    (a.x - b.x).hypot(a.y - b.y)
}
/// A unit of the player's at (dx, dy) px off the middle.
fn unit(w: &mut World, kind: UnitKind, dx: f64, dy: f64) -> Id {
    w.make_unit(kind, PLAYER, MID.0 + dx, MID.1 + dy)
}
/// A Cannon there that set itself up, or another unit holding there.
fn firm(w: &mut World, kind: UnitKind, dx: f64, dy: f64) -> Id {
    let id = unit(w, kind, dx, dy);
    if kind != UnitKind::SiegeTank {
        w.hold_unit(id);
    }
    id
}
/// A flat arena's `firm` units, settled.
fn firm_scene(kind: UnitKind, at: &[(f64, f64)]) -> (World, Vec<Id>) {
    let mut w = flat_arena(5);
    let ids = at
        .iter()
        .map(|&(x, y)| firm(&mut w, kind, x, y))
        .collect::<Vec<_>>();
    run(&mut w, 4);
    (w, ids)
}
/// Everyone has stopped, the Cannons set up, and no two stand nearer than their radii (a touch of rounding allowed).
fn settled(w: &World, what: &str) {
    for (i, a) in w.units.iter().enumerate() {
        assert!(
            !matches!(a.task, Task::Move { .. } | Task::AMove { .. }),
            "{what}: a {:?} still on its way, at {:.1} px from the middle",
            a.kind,
            (a.x - MID.0).hypot(a.y - MID.1)
        );
        assert!(
            a.kind != UnitKind::SiegeTank || set_up(w, a.id),
            "{what}: a Cannon not set up"
        );
        for b in &w.units[i + 1..] {
            let (d, min) = ((a.x - b.x).hypot(a.y - b.y), a.r + b.r);
            assert!(
                d > min * 0.98,
                "{what}: a {:?} and a {:?} {d:.1} px apart, radii {min}",
                a.kind,
                b.kind
            );
        }
    }
}

#[test]
fn units_rallied_to_one_point_all_arrive_and_settle() {
    // The Stables' and the Workshop's rally points on one spot: the first Cannon there sets up and stands firm.
    let mut w = flat_arena(5);
    w.res[PLAYER as usize] = [20_000, 0];
    w.make_building(BldgKind::Barracks, PLAYER, 14, 14, true);
    w.make_building(BldgKind::Forge, PLAYER, 14, 18, true);
    for i in 0..4 {
        w.make_building(BldgKind::Depot, PLAYER, 18 + 3 * i, 14, true);
    }
    let stables = *BLDG_KINDS
        .iter()
        .find(|b| b.def().trains.contains(&UnitKind::Knight))
        .unwrap();
    let s = w.make_building(stables, PLAYER, 22, 24, true);
    let f = w.make_building(BldgKind::Factory, PLAYER, 27, 24, true);
    let g = w
        .bldgs
        .iter()
        .find(|b| b.kind == BldgKind::Barracks)
        .map(|b| b.id)
        .unwrap();
    for b in [s, f, g] {
        w.set_rally(b, MID.0, MID.1, None);
    }
    for (b, kind, n) in [
        (s, UnitKind::Knight, 3),
        (f, UnitKind::SiegeTank, 3),
        (g, UnitKind::Trooper, 4),
    ] {
        for _ in 0..n {
            w.queue_unit(b, kind).unwrap();
        }
    }
    run(&mut w, 240);
    assert_eq!(w.units.len(), 10, "all trained");
    settled(&w, "at the rally point");
}

#[test]
fn a_unit_sent_to_a_point_a_firm_friend_covers_arrives() {
    for kind in [UnitKind::SiegeTank, UnitKind::Knight] {
        for who in [
            UnitKind::Knight,
            UnitKind::Trooper,
            UnitKind::Lancer,
            UnitKind::SiegeTank,
        ] {
            for off in [0.0, 10.0, 15.0] {
                for amove in [false, true] {
                    let (mut w, ids) = firm_scene(kind, &[(0.0, 0.0)]);
                    let a = unit(&mut w, who, -150.0, -30.0);
                    if amove {
                        w.attack_move(a, MID.0 + off, MID.1);
                    } else {
                        w.move_to(a, MID.0 + off, MID.1);
                    }
                    run(&mut w, 8);
                    settled(
                        &w,
                        &format!("a {who:?} sent {off} px off a firm {kind:?}, amove {amove}"),
                    );
                    let u = w.unit(ids[0]).unwrap();
                    assert_eq!((u.x, u.y), MID, "the firm one never moved");
                }
            }
        }
    }
}

#[test]
fn a_unit_that_stopped_by_a_firm_friend_answers_its_attacker() {
    // (pressing on the Cannon for good, it was still on its move, and a move ignores a shooter)
    let (mut w, _) = firm_scene(UnitKind::SiegeTank, &[(0.0, 0.0)]);
    let a = unit(&mut w, UnitKind::Knight, -150.0, -4.0);
    w.move_to(a, MID.0, MID.1);
    run(&mut w, 6);
    let g = w.make_unit(UnitKind::Trooper, ENEMY, MID.0 - 70.0, MID.1 - 4.0);
    set_hp(&mut w, g, 1200.0);
    w.attack_ent(g, a);
    run(&mut w, 6);
    assert!(w.unit(g).unwrap().hp < 1200.0, "the Knight fought back");
}

#[test]
fn cannons_in_formation_all_arrive_and_set_up() {
    for n in [4usize, 9, 16] {
        let mut w = flat_arena(5);
        let ids: Vec<Id> = (0..n)
            .map(|i| {
                let (c, r) = ((i % 4) as f64, (i / 4) as f64);
                unit(
                    &mut w,
                    UnitKind::SiegeTank,
                    -250.0 + 30.0 * c,
                    -60.0 + 30.0 * r,
                )
            })
            .collect();
        w.formation(&ids, MID.0 + 100.0, MID.1);
        run(&mut w, 30);
        settled(&w, &format!("{n} Cannons"));
    }
}

#[test]
fn cannons_sent_at_one_target_all_set_up_in_reach_of_it() {
    // (those behind pressed on the first ones' backs, never in reach)
    let mut w = flat_arena(5);
    let t = w.make_building(BldgKind::Depot, ENEMY, 48, 32, true);
    let b = w.bldgs.iter_mut().find(|b| b.id == t).unwrap();
    (b.hp, b.maxhp) = (1e6, 1e6);
    let spotter = unit(&mut w, UnitKind::Observer, 11.0 * TILE, 0.0);
    w.hold_unit(spotter);
    let ids: Vec<Id> = (0..9)
        .map(|i| {
            let (c, r) = ((i % 3) as f64, (i / 3) as f64);
            unit(
                &mut w,
                UnitKind::SiegeTank,
                -200.0 + 30.0 * c,
                -30.0 + 30.0 * r,
            )
        })
        .collect();
    for &i in &ids {
        w.attack_ent(i, t);
    }
    run(&mut w, 25);
    settled(&w, "nine Cannons on one target");
}

#[test]
fn a_unit_ringed_by_firm_friends_gets_out() {
    let ring: Vec<(f64, f64)> = (-1..=1)
        .flat_map(|x| (-1..=1).map(move |y| (x as f64 * TOUCHING, y as f64 * TOUCHING)))
        .filter(|&p| p != (0.0, 0.0))
        .collect();
    for kind in [UnitKind::SiegeTank, UnitKind::Knight] {
        for who in [UnitKind::Knight, UnitKind::Trooper, UnitKind::Rider] {
            for dir in 0..16 {
                let (mut w, _) = firm_scene(kind, &ring);
                let a = unit(&mut w, who, 0.0, 0.0);
                let an = dir as f64 * std::f64::consts::TAU / 16.0 + 0.05;
                let to = (MID.0 + 200.0 * an.cos(), MID.1 + 200.0 * an.sin());
                w.move_to(a, to.0, to.1);
                run(&mut w, 6);
                let u = w.unit(a).unwrap();
                assert!(
                    (u.x - to.0).hypot(u.y - to.1) < 2.0,
                    "a {who:?} among eight {kind:?}, sent out towards {dir}/16"
                );
            }
        }
    }
}

#[test]
fn a_unit_walks_through_two_touching_cannons_of_its_own_not_an_enemys() {
    for enemy in [false, true] {
        for who in [
            UnitKind::Knight,
            UnitKind::Trooper,
            UnitKind::Lancer,
            UnitKind::Rider,
        ] {
            let mut w = flat_arena(5);
            let seat = if enemy { ENEMY } else { PLAYER };
            for s in [-0.5, 0.5] {
                let c = w.make_unit(UnitKind::SiegeTank, seat, MID.0, MID.1 + s * TOUCHING);
                set_hp(&mut w, c, 1e6);
            }
            run(&mut w, 4);
            let a = unit(&mut w, who, -100.0, 0.0);
            set_hp(&mut w, a, 1e6);
            w.move_to(a, MID.0 + 100.0, MID.1);
            run(&mut w, 8);
            let through = w.unit(a).unwrap().x > MID.0 + 60.0;
            assert_eq!(
                through, !enemy,
                "a {who:?}, the Cannons an enemy's: {enemy}"
            );
        }
    }
}

#[test]
fn a_cannon_settling_in_is_pushed_clear_and_once_settled_stands_firm() {
    for gap in [0.0, 10.0] {
        let mut w = flat_arena(5);
        let a = unit(&mut w, UnitKind::SiegeTank, 0.0, 0.0);
        let b = unit(&mut w, UnitKind::SiegeTank, gap, 0.0);
        w.step();
        assert!(set_up(&w, a) && set_up(&w, b), "both setting up");
        run(&mut w, 4);
        assert!(
            apart(&w, a, b) > TOUCHING * 0.98,
            "pushed clear as they settled: {:.1} px",
            apart(&w, a, b)
        );
        // Settled: a friend set down on it, and one walking up, part from it, and it never moves.
        let at = |w: &World| {
            let u = w.unit(a).unwrap();
            (u.x, u.y)
        };
        let before = at(&w);
        let k = w.make_unit(UnitKind::Knight, PLAYER, before.0 - 6.0, before.1 + 3.0);
        let g = unit(&mut w, UnitKind::Trooper, -120.0, 40.0);
        w.move_to(g, before.0, before.1);
        run(&mut w, 6);
        assert_eq!(at(&w), before, "firm");
        for x in [k, g] {
            assert!(apart(&w, a, x) > w.unit(x).unwrap().r, "clear of it");
        }
        settled(&w, "round a settled Cannon");
    }
}
