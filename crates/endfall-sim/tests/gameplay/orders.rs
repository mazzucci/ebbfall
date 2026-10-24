//! Orders, the tech tree and the Game API: training, research, ownership checks, where units go and stand.

use super::common::*;

#[test]
fn every_building_and_unit_can_be_made() {
    for seed in [1, 7, 4242] {
        let mut w = rich(seed);
        let h = harvesters(&w, PLAYER);
        let depot = build(&mut w, BldgKind::Depot, h[0], 90);
        let rax = build(&mut w, BldgKind::Barracks, h[1], 120);
        let forge = build(&mut w, BldgKind::Forge, h[2], 120);
        let _turret = build(&mut w, BldgKind::Turret, h[3], 90);
        let _ext = build(&mut w, BldgKind::Extractor, h[0], 90);
        let _second_core = build(&mut w, BldgKind::Core, h[1], 150);
        let airfield = build(&mut w, BldgKind::Airfield, h[2], 150);
        assert!(w.bldg(depot).unwrap().done);
        let core_id = w
            .bldgs
            .iter()
            .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
            .unwrap()
            .id;
        let before = [
            count(&w, PLAYER, UnitKind::Harvester),
            count(&w, PLAYER, UnitKind::Trooper),
            count(&w, PLAYER, UnitKind::Vanguard),
        ];
        w.queue_unit(core_id, UnitKind::Harvester).unwrap();
        w.queue_unit(rax, UnitKind::Trooper).unwrap();
        w.queue_unit(rax, UnitKind::Vanguard).unwrap(); // (the Forge unlocks it at the Barracks)
        assert!(
            w.queue_unit(forge, UnitKind::Vanguard).is_err(),
            "the Forge researches, it does not train"
        );
        w.queue_unit(rax, UnitKind::Lancer).unwrap();
        w.queue_unit(rax, UnitKind::Medic).unwrap();
        w.queue_unit(airfield, UnitKind::Wasp).unwrap();
        w.queue_unit(airfield, UnitKind::Observer).unwrap();
        run(&mut w, 100);
        for k in [
            UnitKind::Lancer,
            UnitKind::Medic,
            UnitKind::Wasp,
            UnitKind::Observer,
        ] {
            assert_eq!(count(&w, PLAYER, k), 1, "seed {seed}: {k:?} trained");
        }
        assert_eq!(
            count(&w, PLAYER, UnitKind::Harvester),
            before[0] + 1,
            "seed {seed}: harvester trained"
        );
        assert_eq!(
            count(&w, PLAYER, UnitKind::Trooper),
            before[1] + 1,
            "seed {seed}: trooper trained"
        );
        assert_eq!(
            count(&w, PLAYER, UnitKind::Vanguard),
            before[2] + 1,
            "seed {seed}: vanguard trained"
        );
    }
}

#[test]
fn forge_and_turret_need_a_finished_barracks() {
    let mut w = rich(3);
    let h = harvesters(&w, PLAYER);
    for kind in [BldgKind::Forge, BldgKind::Turret] {
        let (tx, ty) = spot(&w, kind);
        assert_eq!(
            w.place_building(PLAYER, kind, tx, ty, Some(h[0])),
            Err("Requires Garrison".to_string())
        );
    }
    let (tx, ty) = spot(&w, BldgKind::Barracks);
    let rax = w
        .place_building(PLAYER, BldgKind::Barracks, tx, ty, Some(h[1]))
        .unwrap();
    assert!(
        !w.has_req(PLAYER, BldgKind::Forge),
        "an unfinished barracks does not count"
    );
    while !w.bldg(rax).unwrap().done {
        w.step();
    }
    assert!(w.has_req(PLAYER, BldgKind::Forge) && w.has_req(PLAYER, BldgKind::Turret));
}

#[test]
fn only_own_harvesters_build_and_buildings_train_only_their_units() {
    let mut w = rich(17);
    let h = harvesters(&w, PLAYER);
    let (tx, ty) = spot(&w, BldgKind::Barracks);
    let rax = w
        .place_building(PLAYER, BldgKind::Barracks, tx, ty, None)
        .unwrap();
    let trooper = w.make_unit(UnitKind::Trooper, PLAYER, 300.0, 1700.0);
    let foe = w.make_unit(UnitKind::Harvester, ENEMY, 300.0, 1700.0);
    assert!(!w.start_build(trooper, rax), "troopers do not build");
    assert!(
        !w.start_build(foe, rax),
        "the enemy does not build our barracks"
    );
    assert_eq!(
        w.queue_unit(rax, UnitKind::Trooper),
        Err("Garrison cannot train that".into()),
        "not before it is finished"
    );
    assert!(w.start_build(h[0], rax));
    while !w.bldg(rax).unwrap().done {
        w.step();
    }
    assert_eq!(
        w.queue_unit(rax, UnitKind::Vanguard),
        Err("Requires Foundry".into()),
        "a Garrison trains vanguards only once a Foundry stands"
    );
    assert!(w.queue_unit(rax, UnitKind::Trooper).is_ok());
    let depot = build(&mut w, BldgKind::Depot, h[1], 90);
    assert!(
        w.queue_unit(depot, UnitKind::Trooper).is_err(),
        "a depot trains nothing"
    );
}

#[test]
fn the_game_api_ignores_orders_for_the_other_side() {
    let mut g = Game::new(21, 1);
    let foe = g
        .world()
        .units
        .iter()
        .find(|u| u.team == ENEMY)
        .unwrap()
        .clone();
    let core = g.world().bldgs.iter().find(|b| b.team == ENEMY).unwrap().id;
    g.move_to(foe.id, 10.0, 10.0);
    g.stop_unit(foe.id);
    g.repair(foe.id, core);
    assert_eq!(
        g.world().unit(foe.id).unwrap().task,
        foe.task,
        "enemy unit untouched"
    );
    assert_eq!(g.queue_unit(core, "harvester"), "Not yours");
    assert!(g.place_building(ENEMY, "depot", 50, 12, 0).contains("team"));
}

#[test]
fn medics_vanguards_and_airfields_need_a_forge() {
    let mut w = rich(13);
    let h = harvesters(&w, PLAYER);
    let rax = build(&mut w, BldgKind::Barracks, h[0], 120);
    for k in [UnitKind::Medic, UnitKind::Vanguard] {
        assert_eq!(
            w.queue_unit(rax, k),
            Err("Requires Foundry".into()),
            "{k:?}"
        );
    }
    let (tx, ty) = spot(&w, BldgKind::Airfield);
    assert_eq!(
        w.place_building(PLAYER, BldgKind::Airfield, tx, ty, Some(h[1])),
        Err("Requires Foundry".into())
    );
    build(&mut w, BldgKind::Forge, h[1], 120);
    assert!(w.queue_unit(rax, UnitKind::Medic).is_ok());
    assert!(w.queue_unit(rax, UnitKind::Vanguard).is_ok());
}

#[test]
fn units_sent_onto_a_building_stop_beside_it() {
    let mut w = arena(15);
    let core = w.bldgs.iter().find(|b| b.team == PLAYER).unwrap().clone(); // our own: nothing to attack
    let trooper = w.make_unit(UnitKind::Trooper, PLAYER, core.x - 200.0, core.y + 150.0);
    let medic = w.make_unit(UnitKind::Medic, PLAYER, core.x - 220.0, core.y + 150.0);
    w.move_to(trooper, core.x, core.y);
    w.attack_move(medic, core.x, core.y);
    run(&mut w, 20);
    assert_eq!(
        w.unit(trooper).unwrap().task,
        Task::Idle,
        "a move onto a building ends beside it"
    );
    assert_eq!(
        w.unit(medic).unwrap().task,
        Task::Idle,
        "so does an attack-move by an unarmed unit"
    );
}

#[test]
fn research_rules_and_refunds() {
    let (mut w, f) = forge_arena(32);
    let rax = w.make_building(BldgKind::Barracks, PLAYER, 26, 40, true);
    assert!(
        w.start_research(rax, Upgrade::Weapons).is_err(),
        "only at a Foundry"
    );
    let f2 = w.make_building(BldgKind::Forge, PLAYER, 20, 46, true);
    w.start_research(f, Upgrade::Weapons).unwrap();
    assert_eq!(w.res[PLAYER as usize], [4900, 4900]);
    assert!(
        w.start_research(f, Upgrade::Armor).is_err(),
        "one research per forge"
    );
    assert!(
        w.start_research(f2, Upgrade::Weapons).is_err(),
        "not the same upgrade twice at once"
    );
    w.start_research(f2, Upgrade::Armor).unwrap();
    w.cancel_research(f2);
    assert_eq!(
        w.res[PLAYER as usize],
        [4900, 4900],
        "cancel refunds in full"
    );
    // Losing the forge mid-research refunds too.
    let hp = w.bldg(f).unwrap().hp;
    let foe = w.make_unit(
        UnitKind::Vanguard,
        ENEMY,
        20.0 * TILE + 48.0,
        40.0 * TILE + 140.0,
    );
    w.units.iter_mut().find(|u| u.id == foe).unwrap().hp = 1e9; // a very determined vanguard
    w.units.iter_mut().find(|u| u.id == foe).unwrap().maxhp = 1e9;
    w.attack_ent(foe, f);
    for _ in 0..120 * TPS {
        if w.bldg(f).is_none() {
            break;
        }
        w.step();
    }
    let _ = hp;
    assert!(w.bldg(f).is_none(), "the forge fell");
    w.units.retain(|u| u.id != foe); // and the vanguard goes home before it finds the other forge
    assert_eq!(
        w.res[PLAYER as usize],
        [5000, 5000],
        "its research was refunded"
    );
    for _ in 0..3 {
        research_level(&mut w, f2, Upgrade::Weapons);
    }
    assert!(
        w.start_research(f2, Upgrade::Weapons).is_err(),
        "three levels at most"
    );
}

#[test]
fn a_batch_of_troopers_stands_side_by_side_outside_the_barracks() {
    for seed in [1, 7, 4242] {
        let mut w = rich(seed);
        let h = harvesters(&w, PLAYER);
        let _depot = build(&mut w, BldgKind::Depot, h[0], 90);
        let rax = build(&mut w, BldgKind::Barracks, h[1], 120);
        for _ in 0..8 {
            assert!(
                w.queue_unit(rax, UnitKind::Trooper).is_ok() || {
                    run(&mut w, 15);
                    w.queue_unit(rax, UnitKind::Trooper).is_ok()
                }
            );
        }
        run(&mut w, 15 * 9);
        run(&mut w, 5);
        let t: Vec<(f64, f64)> = w
            .units
            .iter()
            .filter(|u| u.team == PLAYER && u.kind == UnitKind::Trooper)
            .map(|u| (u.x, u.y))
            .collect();
        assert_eq!(t.len(), 8, "seed {seed}: all trained");
        let mut closest = f64::MAX;
        for i in 0..t.len() {
            for j in i + 1..t.len() {
                closest =
                    closest.min(((t[i].0 - t[j].0).powi(2) + (t[i].1 - t[j].1).powi(2)).sqrt());
            }
        }
        let r = UnitKind::Trooper.def().r;
        assert!(
            closest >= r * 1.6,
            "seed {seed}: troopers stand apart (closest pair {closest:.1} px, radius {r})"
        );
        let b = w.bldg(rax).unwrap();
        let spread = t
            .iter()
            .map(|p| ((p.0 - b.x).powi(2) + (p.1 - b.y).powi(2)).sqrt())
            .fold(0.0, f64::max);
        assert!(
            spread < 6.0 * TILE,
            "seed {seed}: and stay near the barracks ({spread:.0} px)"
        );
    }
}

#[test]
fn units_under_a_new_building_step_out_without_stacking() {
    let mut w = rich(5);
    let h = harvesters(&w, PLAYER);
    let (tx, ty) = spot(&w, BldgKind::Depot);
    let (cx, cy) = ((tx as f64 + 1.0) * TILE, (ty as f64 + 1.0) * TILE);
    for (k, &u) in h.iter().enumerate() {
        w.stop_unit(u);
        let unit = w.units.iter_mut().find(|x| x.id == u).unwrap();
        unit.x = cx + k as f64 * 3.0;
        unit.y = cy;
    }
    // A building goes up right on top of them.
    w.make_building(BldgKind::Depot, PLAYER, tx, ty, true);
    run(&mut w, 2);
    let pos: Vec<(f64, f64)> = h
        .iter()
        .map(|&u| (w.unit(u).unwrap().x, w.unit(u).unwrap().y))
        .collect();
    for i in 0..pos.len() {
        for j in i + 1..pos.len() {
            let d = ((pos[i].0 - pos[j].0).powi(2) + (pos[i].1 - pos[j].1).powi(2)).sqrt();
            assert!(d > 8.0, "harvesters {i} and {j} stand {d:.1} px apart");
        }
        let (ux, uy) = World::tile_of(pos[i].0, pos[i].1);
        assert!(
            !w.map.blocked(ux, uy),
            "harvester {i} is not inside a building"
        );
    }
}

#[test]
fn a_faction_is_consistent_with_its_tables() {
    let f = &HUMANS;
    assert!(
        f.hq.def().hq && f.hq.def().dropoff,
        "the headquarters is flagged and takes resources"
    );
    assert!(
        f.worker.def().worker && !f.worker.def().threat(),
        "the worker is a worker, not a threat"
    );
    let listed: Vec<BldgKind> = f
        .build_basic
        .iter()
        .chain(f.build_advanced)
        .copied()
        .collect();
    for k in BLDG_KINDS {
        assert!(listed.contains(&k), "{k:?} is on the Build list");
    }
    let workers = UNIT_KINDS.iter().filter(|k| k.def().worker).count();
    assert_eq!(workers, 1, "one worker kind per faction");
    let research: Vec<_> = BLDG_KINDS
        .iter()
        .filter(|k| !k.def().researches.is_empty())
        .collect();
    assert_eq!(research, [&BldgKind::Forge], "the Foundry researches");
    let w = World::new(4242, 1);
    for team in [PLAYER, ENEMY] {
        assert_eq!(count(&w, team, f.worker), 4, "four workers to start");
        assert!(w.bldgs.iter().any(|b| b.team == team && b.kind == f.hq));
    }
}
