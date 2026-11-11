//! Orders, the tech tree and the Game API: training, research, ownership checks, where units go and stand.

use super::common::*;

#[test]
fn every_building_and_unit_can_be_made() {
    for f in FACTIONS {
        for seed in [1, 7, 4242] {
            every_building_and_unit_of(f, seed);
        }
    }
}

/// Builds every building of a race once (each as soon as its requirement stands), then trains every unit
/// each building offers, one of each.
fn every_building_and_unit_of(f: &'static Faction, seed: u32) {
    let mut w = World::with_setup(seed, 1, MapKind::Standard, false, [f, &HUMANS]);
    w.disable_ai();
    w.res[PLAYER as usize] = [20_000, 20_000];
    let workers = harvesters(&w, PLAYER);
    let mut todo: Vec<BldgKind> = f
        .build_basic
        .iter()
        .chain(f.build_advanced)
        .copied()
        .collect();
    let mut built: Vec<Id> = w
        .bldgs
        .iter()
        .filter(|b| b.team == PLAYER)
        .map(|b| b.id)
        .collect();
    for i in 0.. {
        let has = |w: &World, k: BldgKind| {
            w.bldgs
                .iter()
                .any(|b| b.team == PLAYER && b.kind == k && b.done)
        };
        let Some(at) = todo
            .iter()
            .position(|&k| k.def().req.is_none_or(|r| has(&w, r)))
        else {
            assert!(todo.is_empty(), "{}: {todo:?} can never be built", f.key);
            break;
        };
        let k = todo.remove(at);
        built.push(build(&mut w, k, workers[i % workers.len()], 150));
    }
    let wants: Vec<(Id, UnitKind)> = UNIT_KINDS
        .into_iter()
        .filter_map(|u| {
            let at = built
                .iter()
                .find(|&&b| w.bldg(b).unwrap().kind.def().trains.contains(&u))?;
            Some((*at, u))
        })
        .collect();
    assert!(
        wants.iter().any(|&(_, u)| u == f.worker),
        "{}: its HQ trains its worker",
        f.key
    );
    let before: Vec<usize> = wants.iter().map(|&(_, u)| count(&w, PLAYER, u)).collect();
    for &(b, u) in &wants {
        w.queue_unit(b, u)
            .unwrap_or_else(|e| panic!("{} seed {seed}: {u:?}: {e}", f.key));
    }
    run(&mut w, 150);
    for (&(_, u), n) in wants.iter().zip(before) {
        assert_eq!(
            count(&w, PLAYER, u),
            n + 1,
            "{} seed {seed}: {u:?} trained",
            f.key
        );
    }
}

#[test]
fn a_research_building_does_not_train() {
    let mut w = rich(1);
    let forge = w.make_building(BldgKind::Forge, PLAYER, 20, 40, true);
    assert!(
        w.queue_unit(forge, UnitKind::Knight).is_err(),
        "the Forge researches, it does not train"
    );
}

#[test]
fn forge_and_turret_need_a_finished_barracks() {
    let mut w = rich(3);
    let h = harvesters(&w, PLAYER);
    for kind in [BldgKind::Forge, BldgKind::Turret] {
        let (tx, ty) = spot(&w, kind);
        assert_eq!(
            w.place_building(PLAYER, kind, tx, ty, Some(h[0])),
            Err("Requires Barracks".to_string())
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
        Err("Barracks cannot train that".into()),
        "not before it is finished"
    );
    assert!(w.start_build(h[0], rax));
    while !w.bldg(rax).unwrap().done {
        w.step();
    }
    assert_eq!(
        w.queue_unit(rax, UnitKind::SiegeTank),
        Err("Barracks cannot train that".into()),
        "siege comes from the Workshop"
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
fn the_stables_and_the_workshop_follow_the_barracks_and_their_heavies_the_forge() {
    // The Kingdom: the Barracks (Guards, Archers), then the Stables (they need a Market; Riders; Knights once the Forge
    // stands) and the Workshop (the Balloon; Ballistas and Trebuchets once the Forge stands). No building trains a
    // healer.
    let mut w = rich(13);
    let h = harvesters(&w, PLAYER);
    for k in [BldgKind::Airfield, BldgKind::Factory] {
        let (tx, ty) = spot(&w, k);
        assert_eq!(
            w.place_building(PLAYER, k, tx, ty, Some(h[1])),
            Err(format!("Requires {}", k.def().req.unwrap().def().name)),
            "cavalry (off the Market) and machines (off the Barracks): {k:?}"
        );
    }
    let rax = build(&mut w, BldgKind::Barracks, h[0], 120);
    assert_eq!(
        w.queue_unit(rax, UnitKind::Medic),
        Err("Barracks cannot train that".into()),
        "no healer in the build"
    );
    let fac = build(&mut w, BldgKind::Factory, h[3], 120);
    build(&mut w, BldgKind::Extractor, h[2], 120); // (the Stables need a Market)
    let stables = build(&mut w, BldgKind::Airfield, h[1], 120);
    for (at, k) in [
        (fac, UnitKind::Bastion),
        (fac, UnitKind::SiegeTank),
        (stables, UnitKind::Knight),
    ] {
        assert_eq!(
            w.queue_unit(at, k),
            Err("Requires Blacksmith".into()),
            "{k:?}"
        );
        assert_eq!(
            w.queue_unit(rax, k),
            Err("Barracks cannot train that".into()),
            "{k:?}: not at the Barracks"
        );
    }
    build(&mut w, BldgKind::Depot, h[0], 60); // (room for them all)
    assert!(
        w.queue_unit(fac, UnitKind::Observer).is_ok(),
        "no Forge for a Balloon"
    );
    assert!(
        w.queue_unit(stables, UnitKind::Rider).is_ok(),
        "nor for a Rider"
    );
    build(&mut w, BldgKind::Forge, h[2], 120);
    for (at, k) in [
        (fac, UnitKind::Bastion),
        (fac, UnitKind::SiegeTank),
        (stables, UnitKind::Knight),
    ] {
        assert!(w.queue_unit(at, k).is_ok(), "{k:?} once the Forge stands");
    }
}

#[test]
fn the_expeditions_recruiting_post_comes_first_and_the_bruiser_waits_for_a_lab() {
    // The Expedition: the Recruiting post (Sellswords; Bruisers once a Lab stands) needs nothing, the Factory (Buggies,
    // Drones; Rovers once a Lab stands), the Lab and the tower need it, the Portal (Marines) the Lab. The Recruiting
    // post still stands on a shaft until the economy PR.
    let mut w = rich_vael(11);
    let l = harvesters(&w, PLAYER);
    for k in [BldgKind::Kiln, BldgKind::Loom, BldgKind::Ward] {
        assert!(!w.has_req(PLAYER, k), "{k:?} waits for the Recruiting post");
    }
    assert!(
        w.has_req(PLAYER, BldgKind::Siphon),
        "the Recruiting post needs nothing"
    );
    let post = build(&mut w, BldgKind::Siphon, l[0], 150);
    build(&mut w, BldgKind::Spire, l[3], 90); // (room for them all)
    for k in [BldgKind::Kiln, BldgKind::Loom, BldgKind::Ward] {
        assert!(w.has_req(PLAYER, k), "{k:?} once it stands");
    }
    assert!(
        !w.has_req(PLAYER, BldgKind::Eclipse),
        "the Portal waits for the Lab"
    );
    assert_eq!(
        w.queue_unit(post, UnitKind::Bruiser),
        Err("Requires Lab".into()),
        "the Bruiser waits for a Lab"
    );
    assert!(
        w.queue_unit(post, UnitKind::Prism).is_ok(),
        "a Sellsword at once"
    );
    let kiln = build(&mut w, BldgKind::Kiln, l[1], 150);
    for k in [UnitKind::Scythe, UnitKind::Shrike] {
        assert!(w.queue_unit(kiln, k).is_ok(), "{k:?}");
    }
    assert_eq!(
        w.queue_unit(kiln, UnitKind::Monolith),
        Err("Requires Lab".into())
    );
    assert_eq!(
        w.queue_unit(kiln, UnitKind::Halo),
        Err("Factory cannot train that".into()),
        "no healer in the build"
    );
    build(&mut w, BldgKind::Loom, l[2], 150);
    assert!(
        w.queue_unit(post, UnitKind::Bruiser).is_ok(),
        "once the Lab stands"
    );
    assert!(w.has_req(PLAYER, BldgKind::Eclipse));
    let portal = build(&mut w, BldgKind::Eclipse, l[3], 150);
    assert!(w.queue_unit(portal, UnitKind::Umbra).is_ok());
    assert!(!UnitKind::Umbra.def().air, "the Marine is a ground unit");
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
    assert_eq!(w.res[PLAYER as usize], [4900, 5000], "no ether paid");
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
        [4900, 5000],
        "cancel refunds in full"
    );
    // Losing the forge mid-research refunds too. (Weakened, so it falls well before its research is done.)
    w.bldgs.iter_mut().find(|b| b.id == f).unwrap().hp = 200.0;
    let hp = w.bldg(f).unwrap().hp;
    let foe = w.make_unit(
        UnitKind::Knight,
        ENEMY,
        20.0 * TILE + 48.0,
        40.0 * TILE + 140.0,
    );
    w.units.iter_mut().find(|u| u.id == foe).unwrap().hp = 1e9; // a very determined Knight
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
    w.units.retain(|u| u.id != foe); // and the Knight goes home before it finds the other forge
    assert_eq!(
        w.res[PLAYER as usize],
        [5000, 5000],
        "its research was refunded"
    );
    assert_eq!(w.upgrades[PLAYER as usize][Upgrade::Weapons.index()], 0);
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
        let (ux, uy) = w.map.tile_of(pos[i].0, pos[i].1);
        assert!(
            !w.map.blocked(ux, uy),
            "harvester {i} is not inside a building"
        );
    }
}

#[test]
fn every_faction_is_consistent_with_its_tables() {
    let mut owner: Vec<(BldgKind, &str)> = Vec::new();
    for f in FACTIONS {
        assert!(
            f.hq.def().hq && f.hq.def().dropoff,
            "{}: the headquarters is flagged and takes resources",
            f.key
        );
        assert!(
            f.worker.def().worker && !f.worker.def().threat(),
            "{}: the worker is a worker",
            f.key
        );
        assert!(
            f.hq.def().trains.contains(&f.worker),
            "{}: the headquarters trains the worker",
            f.key
        );
        for &k in f.build_basic.iter().chain(f.build_advanced) {
            owner.push((k, f.key));
        }
        let w = World::with_setup(4242, 1, MapKind::Standard, false, [f, f]);
        for team in [PLAYER, ENEMY] {
            assert_eq!(
                count(&w, team, f.worker),
                4,
                "{}: four workers to start",
                f.key
            );
            assert!(w.bldgs.iter().any(|b| b.team == team && b.kind == f.hq));
        }
    }
    for k in BLDG_KINDS {
        let n = owner.iter().filter(|o| o.0 == k).count();
        assert_eq!(n, 1, "{k:?} is on exactly one side's Build list");
    }
    let workers = UNIT_KINDS.iter().filter(|k| k.def().worker).count();
    assert_eq!(workers, FACTIONS.len(), "one worker kind per faction");
    // Every unit is trained somewhere on one side, but the healers (in the tables, trained nowhere).
    for u in UNIT_KINDS {
        assert_eq!(
            BLDG_KINDS.iter().any(|b| b.def().trains.contains(&u)),
            u.def().heal == 0.0,
            "{u:?} is trained somewhere, or a healer nowhere"
        );
    }
}

#[test]
fn a_side_builds_only_its_own_race() {
    let w = rich(4242);
    let (cx, cy) = core(&w, PLAYER);
    for k in [BldgKind::Kiln, BldgKind::Spire, BldgKind::Ward] {
        let any = (-12..12).any(|dy| (-12..12).any(|dx| w.can_place(k, cx + dx, cy + dy, PLAYER)));
        assert!(!any, "the humans cannot place a {k:?}");
    }
    let w = rich_vael(4242);
    let (cx, cy) = core(&w, PLAYER);
    for k in [BldgKind::Barracks, BldgKind::Depot, BldgKind::Turret] {
        let any = (-12..12).any(|dy| (-12..12).any(|dx| w.can_place(k, cx + dx, cy + dy, PLAYER)));
        assert!(!any, "the Vael cannot place a {k:?}");
    }
}

#[test]
fn messages_name_each_races_own_buildings() {
    // (each race's research hall by its own name: the Blacksmith, the Lab)
    for (w, hall) in [(&mut rich(5), "Blacksmith"), (&mut rich_vael(5), "Lab")] {
        w.events.clear();
        let hq = w.bldgs.iter().find(|b| b.team == PLAYER).unwrap().id;
        let err = w.start_research(hq, Upgrade::Weapons).unwrap_err();
        assert_eq!(err, format!("Research happens at a finished {hall}"));
    }
}

#[test]
fn every_weapon_in_the_tables_can_hit_something() {
    // `armed()` is "has a weapon": a weapon that hits neither ground nor air would make an unarmed unit pick fights.
    let units = UNIT_KINDS.iter().map(|k| (k.def().key, k.def().weapon));
    let bldgs = BLDG_KINDS.iter().map(|k| (k.def().key, k.def().weapon));
    for (key, w) in units.chain(bldgs) {
        if let Some(w) = w {
            assert!(
                w.dmg > 0.0 || w.dmg_air > 0.0,
                "{key}: a weapon with no damage"
            );
            assert!(
                w.range > 0.0 && w.cd > 0.0,
                "{key}: a weapon needs reach and a fire rate"
            );
        }
    }
}

#[test]
fn a_group_attack_move_marches_at_the_slowest_pace_with_healers_behind() {
    let x = |w: &World, id| w.unit(id).unwrap().x;
    let mut w = flat_arena(31);
    let (y0, x0) = (900.0, 600.0);
    let t = w.make_unit(UnitKind::Trooper, PLAYER, x0, y0);
    let v = w.make_unit(UnitKind::SiegeTank, PLAYER, x0, y0 + 40.0);
    let m = w.make_unit(UnitKind::Medic, PLAYER, x0, y0 - 40.0);
    w.attack_move_group(&[t, v, m], x0 + 1000.0, y0);
    run(&mut w, 6);
    assert!(x(&w, v) > x0 + 300.0, "the group moved: {}", x(&w, v));
    assert!(
        (x(&w, t) - x(&w, v)).abs() < 24.0,
        "the Guard keeps pace with the Trebuchet: {} vs {}",
        x(&w, t),
        x(&w, v)
    );
    assert!(
        x(&w, m) < x(&w, v) - 16.0,
        "the Medic trails: {} vs {}",
        x(&w, m),
        x(&w, v)
    );
    // A new order lets a unit go at its own speed again.
    w.move_to(t, x0 + 1400.0, y0);
    run(&mut w, 3);
    assert!(
        x(&w, t) > x(&w, v) + 48.0,
        "on its own the Trooper is faster: {} vs {}",
        x(&w, t),
        x(&w, v)
    );
}

#[test]
fn a_lone_unit_ordered_as_a_group_keeps_its_speed() {
    let mut w = flat_arena(31);
    let a = w.make_unit(UnitKind::Trooper, PLAYER, 800.0, 700.0);
    w.attack_move_group(&[a], 1400.0, 700.0);
    assert!(w.unit(a).unwrap().pace.is_none());
    run(&mut w, 3);
    let moved = w.unit(a).unwrap().x - 800.0;
    assert!(moved > 92.0 * 3.0 * 0.9, "at its own speed: {moved}");
}

#[test]
fn a_group_keeps_its_pace_after_a_skirmish_on_the_way() {
    let mut w = flat_arena(31);
    let x = |w: &World, id| w.unit(id).unwrap().x;
    let (x0, y0) = (500.0, 900.0);
    let t = w.make_unit(UnitKind::Trooper, PLAYER, x0, y0);
    let v = w.make_unit(UnitKind::Bruiser, PLAYER, x0, y0 + 40.0);
    w.make_unit(UnitKind::Trooper, ENEMY, x0 + 500.0, y0);
    w.attack_move_group(&[t, v], x0 + 1100.0, y0);
    run(&mut w, 17);
    assert!(
        x(&w, v) > x0 + 700.0,
        "the fight is over and the march goes on: {}",
        x(&w, v)
    );
    // (within the 2.5 tiles between where each stopped to fight, the Picket at its 4.5 tiles of reach and the
    // Breakwater at its 2: a Picket at its own speed again would be 200 px and more ahead by now)
    assert!(
        (x(&w, t) - x(&w, v)).abs() < 2.5 * TILE + 8.0,
        "still together: {} vs {}",
        x(&w, t),
        x(&w, v)
    );
}

#[test]
fn a_player_can_concede_and_the_other_side_wins() {
    let mut g = Game::new(7, 1);
    for _ in 0..30 {
        g.step();
    }
    g.concede();
    let w = g.world();
    assert!(w.over);
    assert_eq!(w.winner, ENEMY as i32);
    assert_eq!(w.conceded, PLAYER as i32);
    // Once it is over, nothing changes the result; a new game forgets it.
    g.concede();
    assert_eq!(g.world().winner, ENEMY as i32);
    let mut w = World::new(7, 1);
    w.concede(PLAYER);
    w.reset(7, 1);
    assert!(!w.over);
    assert_eq!(w.conceded, -1);
}

#[test]
fn a_unit_finds_its_way_around_a_building_put_up_across_its_route() {
    // Walking (move or attack-move) across open ground, then a wall of buildings goes up across the route: the unit is
    // pushed out of the first one it walks into and plans a new route around them, instead of walking back into it
    // for ever (an AI's wave once stood at its own new Core for the rest of a game).
    for amove in [false, true] {
        let mut w = flat_arena(5);
        // (an unarmed walker: an idle Guard at the goal would go for the enemy base it sees from there)
        let u = w.make_unit(UnitKind::Medic, PLAYER, 15.0 * TILE, 30.0 * TILE);
        let goal = (45.0 * TILE, 30.0 * TILE);
        if amove {
            w.attack_move(u, goal.0, goal.1);
        } else {
            w.move_to(u, goal.0, goal.1);
        }
        run(&mut w, 1);
        for ty in (18..42).step_by(2) {
            w.make_building(BldgKind::Depot, PLAYER, 28, ty, true);
        }
        run(&mut w, 45);
        let p = w.unit(u).unwrap();
        assert!(
            (p.x - goal.0).hypot(p.y - goal.1) < 2.0 * TILE,
            "amove {amove}: it went around: at ({:.0}, {:.0})",
            p.x / TILE,
            p.y / TILE
        );
    }
}

#[test]
fn a_group_sent_to_a_walled_off_spot_stops_where_it_can() {
    // A free spot ringed by rock: the route stops short, and the group comes to rest at the nearest place it can
    // reach (or takes on what it meets), instead of walking on from the route's end into the rock for ever.
    for amove in [false, true] {
        let mut w = flat_arena(5);
        for y in 26..=34 {
            for x in 36..=44 {
                if (x - 40i32).abs().max((y - 30i32).abs()) == 4 {
                    let i = w.map.idx(x, y);
                    w.map.rock[i] = 1;
                }
            }
        }
        let units: Vec<Id> = (0..8)
            .map(|i| {
                w.make_unit(
                    UnitKind::Trooper,
                    PLAYER,
                    (15 + i % 4) as f64 * TILE,
                    (28 + i / 4) as f64 * TILE,
                )
            })
            .collect();
        let goal = (40.0 * TILE + 16.0, 30.0 * TILE + 16.0);
        if amove {
            w.attack_move_group(&units, goal.0, goal.1);
        } else {
            w.formation(&units, goal.0, goal.1);
        }
        run(&mut w, 40);
        let moving: Vec<_> = units
            .iter()
            .filter(|&&u| {
                matches!(
                    w.unit(u).unwrap().task,
                    Task::Move { .. } | Task::AMove { .. }
                )
            })
            .collect();
        assert!(
            moving.is_empty(),
            "amove {amove}: all at rest by the ring, still going: {:?}",
            moving
                .iter()
                .map(|&&u| {
                    let u = w.unit(u).unwrap();
                    (
                        u.task,
                        (u.x / TILE) as i32,
                        (u.y / TILE) as i32,
                        u.path.clone(),
                    )
                })
                .collect::<Vec<_>>()
        );
    }
}
