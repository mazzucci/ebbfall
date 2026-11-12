//! The leash (`CHASE_LEASH`): a unit that picks a fight itself follows its target only so far from the spot it stood
//! on (idle, at a rally point) or from its attack-move's line, then goes back; an attack order has no leash.

use super::common::*;

/// The farthest (px) a unit may get from its leash's anchor while chasing: the leash, a melee reach and a tile of slack.
const BOUND: f64 = (CHASE_LEASH + 2.0) * TILE;

/// Distance (px) from (px, py) to the segment from a to b.
fn to_line(px: f64, py: f64, a: (f64, f64), b: (f64, f64)) -> f64 {
    let (dx, dy) = (b.0 - a.0, b.1 - a.1);
    let len2 = dx * dx + dy * dy;
    let t = if len2 > 0.0 {
        (((px - a.0) * dx + (py - a.1) * dy) / len2).clamp(0.0, 1.0)
    } else {
        0.0
    };
    (px - a.0 - dx * t).hypot(py - a.1 - dy * t)
}

#[test]
fn an_idle_unit_chases_a_passer_by_only_so_far_and_comes_back() {
    // A fresh Guard idle at its spot; an enemy Villager (a shade faster) walks by and on across the map. The Guard
    // goes for it, gives up past its leash, and walks back to where it stood.
    let mut w = flat_arena(3);
    let home = (18.0 * TILE, 32.0 * TILE);
    let guard = w.make_unit(UnitKind::Trooper, PLAYER, home.0, home.1);
    let scout = w.make_unit(UnitKind::Harvester, ENEMY, 21.0 * TILE, 32.0 * TILE);
    w.move_to(scout, 50.0 * TILE, 32.0 * TILE);
    let mut chased = false;
    let mut far = 0.0f64;
    for _ in 0..40 * TPS {
        w.step();
        let u = w.unit(guard).expect("the Guard lives");
        chased |= matches!(u.task, Task::Attack { target, .. } if target == scout);
        far = far.max((u.x - home.0).hypot(u.y - home.1));
    }
    assert!(chased, "the Guard went for the passer-by");
    assert!(
        far <= BOUND,
        "it never got farther than its leash: {:.1} tiles",
        far / TILE
    );
    assert!(far >= 4.0 * TILE, "it did chase: {:.1} tiles", far / TILE);
    let u = w.unit(guard).unwrap();
    assert_eq!(u.task, Task::Idle, "back and idle");
    assert!(
        (u.x - home.0).hypot(u.y - home.1) < 1.5 * TILE,
        "back at its spot: {:.1} tiles off",
        (u.x - home.0).hypot(u.y - home.1) / TILE
    );
    assert!(w.unit(scout).is_some(), "and the passer-by got away");
}

#[test]
fn an_attack_move_group_does_not_run_off_after_a_fleeing_unit() {
    // Four Guards attack-move east across open ground; an enemy Villager by their way runs off south. They turn on
    // it, but none follows it farther than the leash from its line, and all of them get to the goal.
    let mut w = flat_arena(5);
    let goal = (48.0 * TILE, 20.0 * TILE);
    let guards: Vec<Id> = (0..4)
        .map(|i| {
            w.make_unit(
                UnitKind::Trooper,
                PLAYER,
                14.0 * TILE,
                (19.0 + i as f64) * TILE,
            )
        })
        .collect();
    let starts: Vec<(f64, f64)> = guards
        .iter()
        .map(|&g| (w.unit(g).unwrap().x, w.unit(g).unwrap().y))
        .collect();
    w.attack_move_group(&guards, goal.0, goal.1);
    let runner = w.make_unit(UnitKind::Harvester, ENEMY, 22.0 * TILE, 23.0 * TILE);
    w.move_to(runner, 22.0 * TILE, 50.0 * TILE);
    let mut turned = false;
    for _ in 0..60 * TPS {
        w.step();
        for (&g, &s) in guards.iter().zip(&starts) {
            let u = w.unit(g).expect("every Guard lives");
            turned |= matches!(u.task, Task::Attack { target, .. } if target == runner);
            let off = to_line(u.x, u.y, s, goal);
            assert!(
                off <= BOUND,
                "Guard {g} {:.1} tiles off its way at {:.1} s",
                off / TILE,
                w.time
            );
        }
    }
    assert!(turned, "the group turned on the runner");
    for &g in &guards {
        let u = w.unit(g).unwrap();
        let d = (u.x - goal.0).hypot(u.y - goal.1);
        assert!(
            d < 3.0 * TILE,
            "Guard {g} at the goal: {:.1} tiles off",
            d / TILE
        );
    }
}

#[test]
fn an_attack_order_has_no_leash() {
    // Sent at the passer-by, the Guard follows it well past the leash (the player asked for it).
    let mut w = flat_arena(3);
    let home = (18.0 * TILE, 32.0 * TILE);
    let guard = w.make_unit(UnitKind::Trooper, PLAYER, home.0, home.1);
    let scout = w.make_unit(UnitKind::Harvester, ENEMY, 21.0 * TILE, 32.0 * TILE);
    w.move_to(scout, 50.0 * TILE, 32.0 * TILE);
    w.attack_ent(guard, scout);
    run(&mut w, 25);
    let u = w.unit(guard).unwrap();
    assert!(
        (u.x - home.0).hypot(u.y - home.1) > (CHASE_LEASH + 4.0) * TILE,
        "it kept after it: {:.1} tiles out",
        (u.x - home.0).hypot(u.y - home.1) / TILE
    );
}

/// A walker's shortest route between two tiles (8-way, breadth first), start to goal.
fn route(w: &World, s: (i32, i32), g: (i32, i32)) -> Vec<(i32, i32)> {
    let foot = w.foot(UnitKind::Trooper);
    let mut prev = vec![usize::MAX; w.map.rock.len()];
    let mut seen = vec![false; w.map.rock.len()];
    let mut q = std::collections::VecDeque::from([s]);
    seen[w.map.idx(s.0, s.1)] = true;
    while let Some((x, y)) = q.pop_front() {
        if (x, y) == g {
            break;
        }
        for (dx, dy) in [
            (1, 0),
            (-1, 0),
            (0, 1),
            (0, -1),
            (1, 1),
            (1, -1),
            (-1, 1),
            (-1, -1),
        ] {
            let (nx, ny) = (x + dx, y + dy);
            if !w.map.in_map(nx, ny) || !w.map.passable(foot, nx, ny) || seen[w.map.idx(nx, ny)] {
                continue;
            }
            seen[w.map.idx(nx, ny)] = true;
            prev[w.map.idx(nx, ny)] = w.map.idx(x, y);
            q.push_back((nx, ny));
        }
    }
    let mut out = vec![];
    let mut i = w.map.idx(g.0, g.1);
    while i != usize::MAX {
        out.push((i as i32 % w.map.w, i as i32 / w.map.w));
        i = prev[i];
    }
    out.reverse();
    out
}

#[test]
fn an_attack_move_fights_what_stands_on_its_route_where_the_route_bends_far_off_the_straight_line()
{
    // Six Guards attack-move from one headquarters to the other; an enemy Archer holds where their route bends
    // farthest from the straight line between them (12 and more tiles on these maps). The leash is tied where the
    // march turns to fight, not to that line: they take the Archer on and kill it.
    for (seed, kind) in [(2, MapKind::Standard), (1, MapKind::Shore)] {
        let mut w = World::with_size(seed, 1, kind, MapSize::DUEL, 0, &[&HUMANS, &HUMANS]);
        w.disable_ai();
        let foot = w.foot(UnitKind::Trooper);
        let free = |w: &World, p: (i32, i32)| {
            (0..8)
                .flat_map(|r| {
                    (-r..=r).flat_map(move |dy| (-r..=r).map(move |dx| (p.0 + dx, p.1 + dy)))
                })
                .find(|&(x, y)| {
                    w.map.in_map(x, y)
                        && w.map.passable(foot, x, y)
                        && w.map.occ[w.map.idx(x, y)] == 0
                })
                .unwrap()
        };
        let (c0, c1) = (core(&w, PLAYER), core(&w, ENEMY));
        let (s, g) = (
            free(&w, (c0.0 + 1, c0.1 + 4)),
            free(&w, (c1.0 + 1, c1.1 + 4)),
        );
        let px = |p: (i32, i32)| (p.0 as f64 * TILE + 16.0, p.1 as f64 * TILE + 16.0);
        let (a, b) = (px(s), px(g));
        let bend = *route(&w, s, g)
            .iter()
            .max_by(|p, q| {
                let (pp, qq) = (px(**p), px(**q));
                to_line(pp.0, pp.1, a, b)
                    .partial_cmp(&to_line(qq.0, qq.1, a, b))
                    .unwrap()
            })
            .unwrap();
        let off = to_line(px(bend).0, px(bend).1, a, b) / TILE;
        assert!(
            off > CHASE_LEASH + 1.0,
            "seed {seed} {kind:?}: the route bends {off:.1} tiles off the line"
        );
        let guards: Vec<Id> = (0..6)
            .map(|i| {
                w.make_unit(
                    UnitKind::Trooper,
                    PLAYER,
                    a.0 + (i % 3) as f64 * 20.0,
                    a.1 + (i / 3) as f64 * 20.0,
                )
            })
            .collect();
        let archer = w.make_unit(UnitKind::Lancer, ENEMY, px(bend).0, px(bend).1);
        w.hold_unit(archer);
        w.attack_move_group(&guards, b.0, b.1);
        let mut fell = None;
        for _ in 0..90 * TPS {
            w.step();
            if w.unit(archer).is_none() {
                fell = Some(w.time);
                break;
            }
        }
        assert!(
            fell.is_some(),
            "seed {seed} {kind:?}: the Archer on the route ({off:.1} tiles off the line) was killed"
        );
    }
}

#[test]
fn units_shelled_from_past_their_leash_go_for_the_gun() {
    // Idle Guards shelled by a deployed Cannon from near its full reach (farther than a Guard's own leash and reach):
    // the gun's reach counts, so they charge it, inside its blind ring, rather than stand under its shells.
    let mut w = flat_arena(3);
    let guards: Vec<Id> = (0..4)
        .map(|i| {
            w.make_unit(
                UnitKind::Trooper,
                PLAYER,
                18.0 * TILE,
                (31.0 + i as f64) * TILE,
            )
        })
        .collect();
    let gun = w.make_unit(UnitKind::SiegeTank, ENEMY, 29.0 * TILE, 32.0 * TILE);
    w.attack_ent(gun, guards[1]);
    let mut charged = false;
    for _ in 0..40 * TPS {
        w.step();
        charged |= guards.iter().any(|&g| {
            w.unit(g)
                .is_some_and(|u| matches!(u.task, Task::Attack { target, .. } if target == gun))
        });
    }
    assert!(charged, "the Guards went for the gun");
    assert!(w.unit(gun).is_none(), "and destroyed it");
}
