//! The tide (PRD: the tide on the Shore map): the water level's cycle (high water, the ebb, low water, the flood),
//! deterministic and in the hash only when on; routes the flood cuts dropped, no walker ever on deep ground; the
//! warning and the retreat (a per-seat switch); the sweep (or, behind a switch, destruction); building by the tide;
//! nothing firing from under high water. Scenes are a flat arena with a band of flats drawn in by hand.

use crate::common::*;
use endfall_sim::data::{Move, SWEEP_HP, TIDE_SPREAD, TIDE_WARN_S, WATER_HIGH, WATER_LOW};
use endfall_sim::map::{Foot, Ground};
use endfall_sim::path::{Pt, los};
use endfall_sim::world::{Command, Event};

/// Flats: height -2, land at low water and deep at high.
const FLATS: std::ops::Range<i32> = 30..34;

/// A flat arena with the tide on (the Kingdom in seat 0, the Expedition in seat 1), nobody's AI and no units, everything explored,
/// and a band of flats across x 30..34.
fn tidal(seed: u32) -> World {
    let mut w = World::with_setup(seed, 1, MapKind::Standard, false, [&HUMANS, &VAEL]);
    w.set_tide(true);
    w.disable_ai();
    w.units.clear();
    flatten(&mut w, 12..52, 12..52);
    for y in 0..w.map.h {
        for x in FLATS {
            let i = w.map.idx(x, y);
            w.map.height[i] = -2;
        }
    }
    for e in &mut w.explored {
        e.fill(1);
    }
    w
}
fn px(t: f64) -> f64 {
    t * 32.0 + 16.0
}
fn ground_of(w: &World, id: Id) -> Ground {
    let u = w.unit(id).unwrap();
    let (tx, ty) = w.map.tile_of(u.x, u.y);
    w.map.ground(tx, ty, w.water)
}
/// Step until `done` (at most `limit` ticks), keeping the events; panics if it never comes.
fn step_until(w: &mut World, limit: u32, events: &mut Vec<Event>, done: impl Fn(&World) -> bool) {
    for _ in 0..limit {
        if done(w) {
            return;
        }
        w.step();
        events.append(&mut w.events);
    }
    assert!(done(w), "not within {limit} ticks");
}
fn phase(w: &World) -> usize {
    w.tide_phase().unwrap().0
}

#[test]
fn the_tide_runs_high_ebb_low_flood_alike_for_a_seed_and_never_without_it() {
    let levels = |seed: u32| {
        let mut w = World::new(seed, 1);
        w.set_tide(true);
        w.disable_ai();
        let mut v = vec![w.water];
        let mut starts = vec![];
        for _ in 0..30 * 400 {
            w.step();
            w.events.clear();
            v.push(w.water);
            let (p, into, _) = w.tide_phase().unwrap();
            if p == 0 && into == 0 {
                starts.push(w.tick);
            }
        }
        (v, starts)
    };
    let (a, starts) = levels(7);
    assert_eq!(a, levels(7).0, "the same seed, the same tide");
    assert_eq!(a[0], WATER_HIGH, "a game starts at high water");
    assert_eq!(*a.iter().min().unwrap(), WATER_LOW);
    assert_eq!(*a.iter().max().unwrap(), WATER_HIGH);
    assert!(
        a.windows(2).all(|p| (p[1] - p[0]).abs() <= 1),
        "a step at a time"
    );
    // the first low water at about 1:30 (high 60 s and the ebb 30 s, each cycle within its spread)
    let first_low = a.iter().position(|&l| l == WATER_LOW).unwrap() as f64 / 30.0;
    assert!(
        (90.0 * (1.0 - TIDE_SPREAD) - 1.0..=90.0 * (1.0 + TIDE_SPREAD) + 1.0).contains(&first_low),
        "the first low water at {first_low:.0} s"
    );
    // each cycle 3:00 within its spread, and not all alike across seeds
    let mut lens: Vec<u32> = starts.windows(2).map(|s| s[1] - s[0]).collect();
    lens.insert(0, starts[0]);
    for l in &lens {
        let s = *l as f64 / 30.0;
        assert!(
            (180.0 * (1.0 - TIDE_SPREAD) - 1.0..=180.0 * (1.0 + TIDE_SPREAD) + 1.0).contains(&s),
            "a cycle of {s:.0} s"
        );
    }
    assert!(
        (1..6).any(|s| levels(s).0 != a),
        "another seed, another tide"
    );
    // without it the level stays 0, and turning it off is the plain game
    let mut off = World::new(7, 1);
    off.set_tide(false);
    let plain = World::new(7, 1);
    assert_eq!(off.state_hash(), plain.state_hash());
    assert!(off.tide_phase().is_none());
    let mut on = World::new(7, 1);
    on.set_tide(true);
    assert_ne!(
        on.state_hash(),
        plain.state_hash(),
        "the tide is in the hash"
    );
    for _ in 0..30 * 200 {
        off.step();
        off.events.clear();
        assert_eq!(off.water, 0);
    }
}

#[test]
fn as_the_tide_moves_no_walker_stands_or_plans_through_deep_water() {
    // Troopers ordered to and fro across the flats through two cycles: after every tick, none on deep ground and
    // none with a route through it (the flood drops a route it cuts; the sweep takes those it catches ashore).
    let mut w = tidal(3);
    let ids: Vec<Id> = (0..6)
        .map(|k| {
            w.make_unit(
                UnitKind::Trooper,
                0,
                px(if k % 2 == 0 { 26.0 } else { 38.0 }),
                px(20.0 + k as f64 * 3.0),
            )
        })
        .collect();
    let walker = |w: &World| {
        for u in w.units.iter().filter(|u| u.kind.def().mv == Move::Walk) {
            let (tx, ty) = w.map.tile_of(u.x, u.y);
            assert_ne!(
                w.map.ground(tx, ty, w.water),
                Ground::Deep,
                "tick {}: a walker in deep water",
                w.tick
            );
            if let Some(p) = &u.path {
                // every leg, not only its ends: a smoothed route crosses the flats in one straight leg
                let foot = Foot {
                    class: Move::Walk,
                    water: w.water,
                };
                let mut at = Pt { x: u.x, y: u.y };
                for &q in p {
                    assert!(
                        los(&w.map, foot, at, q),
                        "tick {}: a walker's route through deep water",
                        w.tick
                    );
                    at = q;
                }
            }
        }
    };
    for tick in 0..30 * 380u32 {
        if tick.is_multiple_of(90) {
            for (k, &id) in ids.iter().enumerate() {
                if w.unit(id).is_some() {
                    let x = if (tick / 90 + k as u32).is_multiple_of(2) {
                        24.0
                    } else {
                        40.0
                    };
                    let _ = w.apply(
                        0,
                        &Command::Move {
                            unit: id,
                            x: px(x),
                            y: px(18.0 + k as f64 * 4.0),
                        },
                    );
                }
            }
        }
        w.step();
        w.events.clear();
        walker(&w);
    }
}

#[test]
fn the_warning_sends_idle_walkers_and_workers_ashore_and_leaves_the_rest() {
    let mut w = tidal(4);
    let mut ev = vec![];
    step_until(&mut w, 30 * 200, &mut ev, |w| {
        phase(w) == 2 && w.water == WATER_LOW
    });
    let on_flats = |x: f64| px(x);
    let idle = w.make_unit(UnitKind::Trooper, 0, on_flats(31.0), px(20.0));
    let held = w.make_unit(UnitKind::Trooper, 0, on_flats(32.0), px(24.0));
    let worker = w.make_unit(HUMANS.worker, 0, on_flats(31.0), px(28.0));
    let wader = w.make_unit(VAEL.worker, 1, on_flats(32.0), px(32.0));
    let _ = w.apply(0, &Command::Hold { unit: held });
    for id in [idle, held, worker, wader] {
        assert_eq!(
            ground_of(&w, id),
            Ground::Land,
            "on the flats, dry at low water"
        );
    }
    ev.clear();
    // to high water: the warning, the flood, the sweep
    step_until(&mut w, 30 * 200, &mut ev, |w| {
        phase(w) == 0 && w.water == WATER_HIGH
    });
    let toasts = |team: u8| {
        ev.iter()
            .filter(|e| matches!(e, Event::Toast { team: t, msg, .. } if *t == team && msg.contains("flood")))
            .count()
    };
    assert_eq!(
        toasts(0),
        1,
        "the Kingdom, with walkers on the flats, warned once"
    );
    assert_eq!(
        toasts(1),
        1,
        "the Expedition too: its Bot walks (no amphibians since the re-theme)"
    );
    assert!(ev.iter().any(|e| matches!(
        e,
        Event::Sfx {
            team: 0,
            name: "alert"
        }
    )));
    for id in [idle, worker] {
        let u = w.unit(id).unwrap();
        assert_ne!(ground_of(&w, id), Ground::Deep);
        assert_eq!(
            u.hp, u.maxhp,
            "{:?} went ashore before the flood: never swept",
            u.kind
        );
    }
    let h = w.unit(held).unwrap();
    assert_ne!(ground_of(&w, held), Ground::Deep, "swept ashore");
    assert!(
        (h.hp - h.maxhp * (1.0 - SWEEP_HP)).abs() < 1e-9,
        "swept: {} of {}",
        h.hp,
        h.maxhp
    );
    let v = w.unit(wader).unwrap();
    assert_eq!(
        (v.hp, v.stun),
        (v.maxhp, 0.0),
        "the Bot, idle, went ashore too: never swept"
    );
    assert_ne!(ground_of(&w, wader), Ground::Deep);
}

#[test]
fn at_the_warning_a_mining_worker_goes_ashore_and_an_attack_move_keeps_its_order() {
    let mut w = tidal(9);
    let mut ev = vec![];
    // a few ticks before the warning
    let warn = (TIDE_WARN_S * 30.0) as u32;
    step_until(&mut w, 30 * 200, &mut ev, |w| {
        let (p, _, left) = w.tide_phase().unwrap();
        p == 2 && left <= warn + 3
    });
    assert!(!w.tide.as_ref().unwrap().warned);
    let node = w.map.nodes.iter().find(|n| !n.ether).unwrap().id;
    let miner = w.make_unit(HUMANS.worker, 0, px(31.0), px(20.0));
    let _ = w.apply(0, &Command::Gather { unit: miner, node });
    let raider = w.make_unit(UnitKind::Trooper, 0, px(32.0), px(24.0));
    // (along the flats: it stays on them)
    let _ = w.apply(
        0,
        &Command::AttackMove {
            unit: raider,
            x: px(32.0),
            y: px(50.0),
        },
    );
    assert!(matches!(w.unit(miner).unwrap().task, Task::Gather { .. }));
    step_until(&mut w, 30 * 5, &mut ev, |w| w.tide.as_ref().unwrap().warned);
    assert!(
        matches!(w.unit(miner).unwrap().task, Task::Move { .. }),
        "the miner on the flats sent ashore: {:?}",
        w.unit(miner).unwrap().task
    );
    assert!(
        matches!(w.unit(raider).unwrap().task, Task::AMove { .. }),
        "the attack-move keeps its order: {:?}",
        w.unit(raider).unwrap().task
    );
}

#[test]
fn a_swept_walker_is_stunned_and_with_its_switch_off_an_idle_one_stays_out() {
    let mut w = tidal(5);
    let _ = w.apply(0, &Command::SetRetreat { on: false });
    assert!(!w.retreats(0) && w.retreats(1));
    let mut ev = vec![];
    step_until(&mut w, 30 * 200, &mut ev, |w| phase(w) == 2);
    let idle = w.make_unit(UnitKind::Trooper, 0, px(32.0), px(20.0));
    // the tick it is swept: stunned, and standing still while it is
    step_until(&mut w, 30 * 200, &mut ev, |w| {
        w.unit(idle).unwrap().stun > 0.0
    });
    let u = w.unit(idle).unwrap();
    assert!(
        (u.hp - u.maxhp * (1.0 - SWEEP_HP)).abs() < 1e-9,
        "the idle one was left out: swept"
    );
    let at = (u.x, u.y);
    // (east, its side of the flats: at high water they are deep from edge to edge)
    let _ = w.apply(
        0,
        &Command::Move {
            unit: idle,
            x: px(44.0),
            y: px(20.0),
        },
    );
    for _ in 0..30 {
        w.step();
        w.events.clear();
    }
    let u = w.unit(idle).unwrap();
    assert_eq!((u.x, u.y), at, "stunned: it does not move");
    for _ in 0..90 {
        w.step();
        w.events.clear();
    }
    assert_ne!(
        (w.unit(idle).unwrap().x, w.unit(idle).unwrap().y),
        at,
        "and then it does"
    );
    // switched on again
    let _ = w.apply(0, &Command::SetRetreat { on: true });
    assert!(w.retreats(0));
}

#[test]
fn with_its_switch_the_flood_destroys_the_walkers_it_catches() {
    let mut w = tidal(6);
    w.set_flood_kills(true);
    let mut ev = vec![];
    step_until(&mut w, 30 * 200, &mut ev, |w| phase(w) == 2);
    let held = w.make_unit(UnitKind::Trooper, 0, px(31.0), px(24.0));
    let wader = w.make_unit(VAEL.worker, 1, px(32.0), px(30.0));
    let _ = w.apply(0, &Command::Hold { unit: held });
    step_until(&mut w, 30 * 200, &mut ev, |w| w.water == WATER_HIGH);
    assert!(w.unit(held).is_none(), "the flood took it");
    assert!(
        w.unit(wader).is_some(),
        "not the idle Bot: it went ashore at the warning"
    );
}

#[test]
fn with_the_tide_each_people_builds_where_its_tide_allows() {
    let mut w = tidal(7);
    let mut set = |x: i32, h: i8| {
        for y in 40..44 {
            let i = w.map.idx(x, y);
            w.map.height[i] = h;
        }
    };
    // a tile at each height: dry at high water (1, land everywhere), dry only below high water (0), shallow at low
    // water (-4), deep even then (-5)
    set(14, 1);
    set(15, 0);
    set(16, -4);
    set(17, -5);
    for water in [WATER_LOW, -1, WATER_HIGH] {
        w.water = water; // (whatever the level now: the tide's extremes decide)
        // (every builder walks since the re-theme: both peoples by the same rule)
        for team in [0, 1] {
            assert!(
                w.builds_on(team, 14, 41),
                "seat {team} on land that stays dry"
            );
            assert!(!w.builds_on(team, 15, 41), "not on what high water covers");
            assert!(!w.builds_on(team, 16, 41) && !w.builds_on(team, 17, 41));
        }
    }
}

#[test]
fn a_building_under_high_water_does_not_fire() {
    // A Kingdom Turret on the flats (built there by hand: the tide's rules would not let anyone build there) and an
    // Expedition worker on land beside them: the Turret fires at low water, not under high water.
    let mut w = tidal(8);
    let mut ev = vec![];
    step_until(&mut w, 30 * 200, &mut ev, |w| phase(w) == 2);
    let turret = w.make_building(BldgKind::Turret, 0, 32, 20, true);
    let shot_at = |w: &mut World, ev: &mut Vec<Event>, ticks: u32| {
        let t = w.make_unit(VAEL.worker, 1, px(29.0), px(21.0));
        let _ = w.apply(1, &Command::Hold { unit: t });
        let hp0 = w.unit(t).unwrap().hp;
        for _ in 0..ticks {
            w.step();
            ev.append(&mut w.events);
        }
        let hp = w.unit(t).map_or(0.0, |u| u.hp);
        w.units.retain(|u| u.id != t);
        hp < hp0
    };
    assert!(
        shot_at(&mut w, &mut ev, 60),
        "at low water the Turret fires"
    );
    step_until(&mut w, 30 * 200, &mut ev, |w| {
        phase(w) == 0 && w.water == WATER_HIGH
    });
    let (tx, ty) = (32, 20);
    assert_eq!(w.map.ground(tx, ty, w.water), Ground::Deep);
    assert!(w.bldg(turret).is_some());
    assert!(
        !shot_at(&mut w, &mut ev, 60),
        "under high water it does not"
    );
}
