//! The world invariants checked after every tick of random play.

use super::*;

pub fn check_invariants(w: &World, ctx: &str) {
    for list in [
        w.units.iter().map(|u| u.id).collect::<Vec<_>>(),
        w.bldgs.iter().map(|b| b.id).collect(),
    ] {
        assert!(
            list.windows(2).all(|p| p[0] < p[1]),
            "{ctx}: entity lists sorted by id, no duplicates"
        );
    }
    for u in &w.units {
        assert!(
            u.x.is_finite() && u.y.is_finite(),
            "{ctx}: unit {} position {},{}",
            u.id,
            u.x,
            u.y
        );
        assert!(
            u.x >= 0.0 && u.y >= 0.0 && u.x <= WW && u.y <= WH,
            "{ctx}: unit {} off the map {},{}",
            u.id,
            u.x,
            u.y
        );
        assert!(
            u.hp > 0.0 && u.hp <= u.maxhp,
            "{ctx}: unit {} hp {}",
            u.id,
            u.hp
        );
        assert!(
            u.carry >= 0 && u.carry <= 8,
            "{ctx}: unit {} carry {}",
            u.id,
            u.carry
        );
    }
    for b in &w.bldgs {
        assert!(
            b.hp > 0.0 && b.hp <= b.maxhp,
            "{ctx}: building {} hp {}",
            b.id,
            b.hp
        );
        assert!(
            (0.0..=1.0).contains(&b.progress),
            "{ctx}: building {} progress {}",
            b.id,
            b.progress
        );
        assert!(b.queue.len() <= 5);
        if let Some((up, p)) = b.research {
            assert!(
                b.kind.def().researches.contains(&up) && b.done,
                "{ctx}: research at {:?}",
                b.kind
            );
            assert!((0.0..1.0).contains(&p), "{ctx}: research progress {p}");
            assert!(
                w.upgrades[b.team as usize][up.index()] < 3,
                "{ctx}: researching past level 3"
            );
            assert_eq!(
                w.bldgs
                    .iter()
                    .filter(|o| o.team == b.team && o.research.is_some_and(|(u, _)| u == up))
                    .count(),
                1,
                "{ctx}: {up:?} researched twice"
            );
        }
        assert!(
            (0.0..=1.0).contains(&b.prog),
            "{ctx}: building {} prog {}",
            b.id,
            b.prog
        );
        assert!(
            b.done || b.queue.is_empty(),
            "{ctx}: unfinished building {} has a queue",
            b.id
        );
        assert!(
            b.queue.iter().all(|k| b.kind.def().trains.contains(k)),
            "{ctx}: building {} queues {:?}",
            b.id,
            b.queue
        );
        for y in 0..b.h {
            for x in 0..b.w {
                assert_eq!(
                    w.map.occ[((b.ty + y) * MW + b.tx + x) as usize],
                    b.id as i32,
                    "{ctx}: occupancy under building {}",
                    b.id
                );
            }
        }
    }
    for (i, &o) in w.map.occ.iter().enumerate() {
        if o > 0 {
            assert!(
                w.bldg(o as Id).is_some(),
                "{ctx}: tile {i} occupied by dead building {o}"
            );
        } else if o < 0 {
            assert!(
                w.map.node((-o) as Id).is_some(),
                "{ctx}: tile {i} occupied by missing node {}",
                -o
            );
        }
    }
    for t in 0..2 {
        assert!(
            w.res[t][0] >= 0 && w.res[t][1] >= 0,
            "{ctx}: team {t} resources {:?}",
            w.res[t]
        );
        let used: i32 = w
            .units
            .iter()
            .filter(|u| u.team as usize == t)
            .map(|u| u.kind.def().supply)
            .sum::<i32>()
            + w.bldgs
                .iter()
                .filter(|b| b.team as usize == t)
                .flat_map(|b| b.queue.iter())
                .map(|k| k.def().supply)
                .sum::<i32>();
        assert_eq!(w.sup[t][0], used, "{ctx}: team {t} supply used");
        let cap: i32 = w
            .bldgs
            .iter()
            .filter(|b| b.team as usize == t && b.done)
            .map(|b| b.kind.def().supply)
            .sum();
        assert_eq!(w.sup[t][1], cap.min(200), "{ctx}: team {t} supply cap");
    }
    for u in &w.units {
        assert!(
            u.sh >= 0.0 && u.sh <= u.maxsh,
            "{ctx}: unit {} shields {}/{}",
            u.id,
            u.sh,
            u.maxsh
        );
    }
    for b in &w.bldgs {
        assert!(
            b.sh >= 0.0 && b.sh <= b.maxsh,
            "{ctx}: building {} shields {}/{}",
            b.id,
            b.sh,
            b.maxsh
        );
    }
    for p in &w.projs {
        assert!(
            p.x.is_finite() && p.y.is_finite(),
            "{ctx}: projectile position"
        );
    }
    if !w.over {
        assert!(
            w.bldgs.iter().any(|b| b.team == ENEMY),
            "{ctx}: enemy has no buildings but the game is not over"
        );
        assert!(
            w.bldgs.iter().any(|b| b.team == PLAYER)
                || w.units
                    .iter()
                    .any(|u| u.team == PLAYER && u.kind.def().worker),
            "{ctx}: player is eliminated but the game is not over"
        );
    }
    for n in &w.map.nodes {
        let mining = w
            .units
            .iter()
            .filter(
                |u| matches!(u.task, Task::Gather { node, phase: Phase::Mine, .. } if node == n.id),
            )
            .count() as i32;
        assert_eq!(
            n.miners, mining,
            "{ctx}: node {} miners counter vs mining units",
            n.id
        );
        assert!(
            n.miners <= MINE_SLOTS,
            "{ctx}: node {} has {} miners",
            n.id,
            n.miners
        );
    }
}
