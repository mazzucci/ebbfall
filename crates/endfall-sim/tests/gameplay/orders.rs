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

/// Builds every building of a race once (each as soon as its requirement and power stand), then trains every unit
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
        let powered = |w: &World| {
            w.bldgs
                .iter()
                .any(|b| b.team == PLAYER && b.kind.def().power > 0.0 && b.done)
        };
        let Some(at) = todo.iter().position(|&k| {
            let d = k.def();
            d.req.is_none_or(|r| has(&w, r)) && (!d.needs_power || powered(&w))
        }) else {
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
        w.queue_unit(forge, UnitKind::Vanguard).is_err(),
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
fn medics_and_vanguards_need_a_forge_and_an_airfield_a_garrison() {
    let mut w = rich(13);
    let h = harvesters(&w, PLAYER);
    let (tx, ty) = spot(&w, BldgKind::Airfield);
    assert_eq!(
        w.place_building(PLAYER, BldgKind::Airfield, tx, ty, Some(h[1])),
        Err("Requires Garrison".into()),
        "air is a branch off the first factory"
    );
    let rax = build(&mut w, BldgKind::Barracks, h[0], 120);
    for k in [UnitKind::Medic, UnitKind::Vanguard] {
        assert_eq!(
            w.queue_unit(rax, k),
            Err("Requires Foundry".into()),
            "{k:?}"
        );
    }
    let (tx, ty) = spot(&w, BldgKind::Airfield);
    assert!(
        w.place_building(PLAYER, BldgKind::Airfield, tx, ty, Some(h[1]))
            .is_ok(),
        "no Foundry needed for an Airfield"
    );
    build(&mut w, BldgKind::Forge, h[2], 120);
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
    // Every unit is trained somewhere on one side.
    for u in UNIT_KINDS {
        assert!(
            BLDG_KINDS.iter().any(|b| b.def().trains.contains(&u)),
            "{u:?} is trained somewhere"
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
    let toasts = |w: &mut World| -> Vec<String> {
        w.events
            .drain(..)
            .filter_map(|e| match e {
                endfall_sim::world::Event::Toast {
                    msg, team: PLAYER, ..
                } => Some(msg),
                _ => None,
            })
            .collect()
    };
    for (w, rig, hall) in [
        (
            &mut rich(5),
            "Build an Ether Rig on the vent first",
            "Foundry",
        ),
        (
            &mut rich_vael(5),
            "Build a Siphon on the vent first",
            "Loom",
        ),
    ] {
        w.events.clear();
        let worker = harvesters(w, PLAYER)[0];
        let vent = w.map.nodes.iter().find(|n| n.ether).unwrap().id;
        assert!(!w.start_gather(worker, vent), "no refinery on the vent yet");
        assert_eq!(toasts(w), vec![rig.to_string()]);
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
    let v = w.make_unit(UnitKind::Vanguard, PLAYER, x0, y0 + 40.0);
    let m = w.make_unit(UnitKind::Medic, PLAYER, x0, y0 - 40.0);
    w.attack_move_group(&[t, v, m], x0 + 1000.0, y0);
    run(&mut w, 6);
    assert!(x(&w, v) > x0 + 300.0, "the group moved: {}", x(&w, v));
    assert!(
        (x(&w, t) - x(&w, v)).abs() < 24.0,
        "the Trooper keeps pace with the Vanguard: {} vs {}",
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
    let v = w.make_unit(UnitKind::Vanguard, PLAYER, x0, y0 + 40.0);
    w.make_unit(UnitKind::Trooper, ENEMY, x0 + 500.0, y0);
    w.attack_move_group(&[t, v], x0 + 1100.0, y0);
    run(&mut w, 17);
    assert!(
        x(&w, v) > x0 + 700.0,
        "the fight is over and the march goes on: {}",
        x(&w, v)
    );
    assert!(
        (x(&w, t) - x(&w, v)).abs() < 48.0,
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
fn a_side_that_can_do_nothing_more_has_lost() {
    // The player's Core and every worker gone, only a Depot left and no fighter: the game ends, the AI wins.
    let mut w = World::new(13, 1);
    w.disable_ai();
    let depot = w.make_building(BldgKind::Depot, PLAYER, 20, 40, true);
    let doomed: Vec<Id> = w
        .bldgs
        .iter()
        .filter(|b| b.team == PLAYER && b.id != depot)
        .map(|b| b.id)
        .collect();
    for id in doomed {
        w.damage(id, 1e9, None);
    }
    run(&mut w, 1);
    assert!(!w.over, "workers left: still in it");
    // A Trooper keeps it going once the workers are gone too (a fighter can still win the game).
    let t = w.make_unit(UnitKind::Trooper, PLAYER, 640.0, 1280.0);
    for id in harvesters(&w, PLAYER) {
        w.damage(id, 1e9, None);
    }
    run(&mut w, 1);
    assert!(!w.over, "a fighter left: still in it");
    w.damage(t, 1e9, None);
    run(&mut w, 1);
    assert!(
        w.over && w.winner == ENEMY as i32,
        "nothing left that can act: over"
    );
}
