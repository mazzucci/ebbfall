//! Combat: weapons and targets, flyers, turrets, medics, upgrades, splash, balance.

use super::common::*;

#[test]
fn a_turret_shoots_enemies_in_range() {
    let mut w = rich(13);
    let (tx, ty) = spot(&w, BldgKind::Turret);
    w.make_building(BldgKind::Turret, PLAYER, tx, ty, true);
    let (x, y) = ((tx as f64 + 1.0) * TILE + 150.0, (ty as f64 + 1.0) * TILE);
    let foe = w.make_unit(UnitKind::Trooper, ENEMY, x, y);
    w.hold_unit(foe);
    run(&mut w, 10);
    assert!(
        w.unit(foe).is_none_or(|u| u.hp < u.maxhp),
        "the turret hit the intruder"
    );
}

#[test]
fn flyers_cross_cliffs_in_a_straight_line() {
    let mut w = arena(4242);
    // Find a straight segment whose middle crosses rock.
    let mut found = None;
    'search: for y in 4..60 {
        for x in 4..50 {
            let blocked_mid = (x + 4..x + 9).any(|xx| w.map.rock[(y * MW + xx) as usize] != 0);
            if !w.map.blocked(x, y) && !w.map.blocked(x + 13, y) && blocked_mid {
                found = Some((x, y));
                break 'search;
            }
        }
    }
    let (x, y) = found.expect("a cliff to fly over");
    let (sx, sy, tx) = (
        x as f64 * TILE + 16.0,
        y as f64 * TILE + 16.0,
        (x + 13) as f64 * TILE + 16.0,
    );
    let wasp = w.make_unit(UnitKind::Wasp, PLAYER, sx, sy);
    w.move_to(wasp, tx, sy);
    let mut over_rock = false;
    let secs = (tx - sx) / UnitKind::Wasp.def().speed + 1.0;
    for _ in 0..(secs * TPS as f64) as u32 {
        w.step();
        let u = w.unit(wasp).unwrap();
        let (cx, cy) = World::tile_of(u.x, u.y);
        over_rock |= w.map.rock[(cy * MW + cx) as usize] != 0;
        assert!((u.y - sy).abs() < 1.0, "flies straight");
    }
    assert!(over_rock, "it flew over rock");
    assert!(
        (w.unit(wasp).unwrap().x - tx).abs() < 40.0,
        "arrived in straight-line time"
    );
}

#[test]
fn ground_only_weapons_cannot_touch_flyers() {
    let mut w = arena(7);
    let van = w.make_unit(UnitKind::Vanguard, PLAYER, 600.0, 900.0);
    let wasp = w.make_unit(UnitKind::Wasp, ENEMY, 680.0, 900.0);
    w.attack_ent(van, wasp);
    assert_eq!(
        w.unit(van).unwrap().task,
        Task::Idle,
        "an order to shoot a flyer is refused"
    );
    w.hold_unit(wasp); // the wasp just hovers; it would shoot the vanguard if attacked? no: it is on hold and in range
    run(&mut w, 8);
    let v = w.unit(van).unwrap();
    assert!(
        !matches!(v.task, Task::Attack { .. }),
        "the vanguard neither auto-targets nor retaliates against the wasp"
    );
    assert!(
        w.unit(wasp).is_some_and(|u| u.hp == u.maxhp),
        "and never hurts it"
    );
}

#[test]
fn lancers_troopers_and_turrets_shoot_flyers_down() {
    for shooter in ["lancer", "trooper", "turret"] {
        let mut w = arena(9);
        match shooter {
            "turret" => {
                w.make_building(BldgKind::Turret, PLAYER, 20, 30, true);
            }
            k => {
                w.make_unit(
                    UnitKind::parse(k).unwrap(),
                    PLAYER,
                    21.0 * TILE,
                    31.0 * TILE,
                );
            }
        }
        // The wasp hovers just outside its own reach; anything that can hit the air should bring it down.
        let wasp = w.make_unit(UnitKind::Wasp, ENEMY, 21.0 * TILE + 170.0, 31.0 * TILE);
        w.hold_unit(wasp);
        run(&mut w, 40);
        assert!(w.unit(wasp).is_none(), "{shooter} shot the wasp down");
    }
}

#[test]
fn two_lancers_beat_a_wasp_up_close() {
    // (two Lancers cost about what one Wasp does)
    let mut w = arena(10);
    let lancer = w.make_unit(UnitKind::Lancer, PLAYER, 600.0, 900.0);
    let other = w.make_unit(UnitKind::Lancer, PLAYER, 600.0, 930.0);
    let wasp = w.make_unit(UnitKind::Wasp, ENEMY, 660.0, 900.0);
    w.attack_ent(wasp, lancer);
    w.attack_ent(other, wasp);
    run(&mut w, 20);
    assert!(
        w.unit(wasp).is_none() && (w.unit(lancer).is_some() || w.unit(other).is_some()),
        "anti-air wins its duel"
    );
}

#[test]
fn medics_heal_infantry_but_not_machines() {
    let mut w = arena(11);
    let medic = w.make_unit(UnitKind::Medic, PLAYER, 600.0, 900.0);
    let trooper = w.make_unit(UnitKind::Trooper, PLAYER, 630.0, 900.0);
    let van = w.make_unit(UnitKind::Vanguard, PLAYER, 600.0, 940.0);
    for (id, hp) in [(trooper, 10.0), (van, 50.0)] {
        w.units.iter_mut().find(|u| u.id == id).unwrap().hp = hp;
    }
    let _ = medic;
    run(&mut w, 10);
    assert_eq!(
        w.unit(trooper).unwrap().hp,
        w.unit(trooper).unwrap().maxhp,
        "trooper healed to full"
    );
    assert_eq!(w.unit(van).unwrap().hp, 50.0, "vanguards are machines");
}

#[test]
fn medics_walk_to_hurt_infantry_they_can_see() {
    let mut w = arena(12);
    let medic = w.make_unit(UnitKind::Medic, PLAYER, 600.0, 900.0);
    let trooper = w.make_unit(UnitKind::Trooper, PLAYER, 780.0, 900.0);
    w.units.iter_mut().find(|u| u.id == trooper).unwrap().hp = 5.0;
    run(&mut w, 15);
    assert!(
        w.unit(trooper).unwrap().hp > 40.0,
        "the medic came over and healed"
    );
    assert!(w.unit(medic).unwrap().x > 650.0);
}

#[test]
fn walkers_and_flyers_pass_under_and_over_each_other() {
    let mut w = flat_arena(14);
    let wasp = w.make_unit(UnitKind::Wasp, PLAYER, 700.0, 900.0);
    w.hold_unit(wasp);
    let trooper = w.make_unit(UnitKind::Trooper, PLAYER, 600.0, 900.0);
    w.move_to(trooper, 800.0, 900.0);
    run(&mut w, 4);
    let (tx, wx) = (w.unit(trooper).unwrap().x, w.unit(wasp).unwrap().x);
    assert!(tx > 760.0, "the trooper walked under the wasp: {tx}");
    assert_eq!(wx, 700.0, "and did not push it");
}

#[test]
fn the_player_hears_about_attacks_once_per_fight() {
    use endfall_sim::world::Event;
    let mut w = arena(16);
    let mine = w.make_unit(UnitKind::Vanguard, PLAYER, 600.0, 900.0);
    w.hold_unit(mine);
    let foe = w.make_unit(UnitKind::Trooper, ENEMY, 700.0, 900.0);
    w.attack_ent(foe, mine);
    let mut alerts = 0;
    for _ in 0..8 * TPS {
        w.step();
        alerts += w
            .events
            .drain(..)
            .filter(|e| {
                matches!(
                    e,
                    Event::Attacked {
                        team: PLAYER,
                        building: false,
                        ..
                    }
                )
            })
            .count();
    }
    assert_eq!(alerts, 1, "one alert for one ongoing fight");
    // A second fight far away alerts at once.
    let far = w.make_unit(UnitKind::Trooper, PLAYER, 1800.0, 300.0);
    w.hold_unit(far);
    let foe2 = w.make_unit(UnitKind::Trooper, ENEMY, 1860.0, 300.0);
    w.attack_ent(foe2, far);
    let mut more = 0;
    for _ in 0..3 * TPS {
        w.step();
        more += w
            .events
            .drain(..)
            .filter(|e| matches!(e, Event::Attacked { team: PLAYER, .. }))
            .count();
    }
    assert_eq!(more, 1, "a new fight elsewhere is reported");
}

#[test]
fn two_simultaneous_fights_alert_once_each() {
    use endfall_sim::world::Event;
    let mut w = arena(18);
    for (x, y) in [(500.0, 900.0), (1600.0, 400.0)] {
        let mine = w.make_unit(UnitKind::Vanguard, PLAYER, x, y);
        w.hold_unit(mine);
        let foe = w.make_unit(UnitKind::Trooper, ENEMY, x + 80.0, y);
        w.attack_ent(foe, mine);
    }
    let mut alerts = [0, 0];
    for _ in 0..8 * TPS {
        w.step();
        for e in w.events.drain(..) {
            if let Event::Attacked { team, .. } = e {
                alerts[team as usize] += 1;
            }
        }
    }
    assert_eq!(alerts[0], 2, "one per fight, not one per hit");
    assert!(alerts[1] > 0, "the other seat hears about its own losses");
}

#[test]
fn weapons_upgrades_add_each_units_bonus() {
    let (mut w, f) = forge_arena(30);
    assert_eq!(
        first_hit(&mut w, UnitKind::Trooper, PLAYER, UnitKind::Vanguard),
        7.0 - 2.0
    );
    research_level(&mut w, f, Upgrade::Weapons);
    assert_eq!(
        first_hit(&mut w, UnitKind::Trooper, PLAYER, UnitKind::Vanguard),
        7.0 + 1.0 - 2.0,
        "Trooper +1"
    );
    assert_eq!(
        first_hit(&mut w, UnitKind::Vanguard, PLAYER, UnitKind::Vanguard),
        30.0 + 3.0 - 2.0,
        "Vanguard +3"
    );
}

#[test]
fn every_upgrade_is_researched_somewhere_and_reaches_the_snapshot() {
    for u in UPGRADES {
        assert!(
            BLDG_KINDS.iter().any(|b| b.def().researches.contains(&u)),
            "{u:?} is researched at some building"
        );
        assert_eq!(Upgrade::parse(u.def().key), Some(u));
    }
    let mut w = World::new(1, 1);
    w.upgrades[1][Upgrade::Armor.index()] = 2;
    assert_eq!(w.effect_level(1, Effect::Armor), 2);
    assert_eq!(w.effect_level(0, Effect::Armor), 0);
    let mut out = vec![];
    endfall_sim::snapshot::push_upgrades(&mut out, &w);
    let n = UPGRADES.len();
    assert_eq!(out.len(), 2 * n, "each team's level of each upgrade");
    assert_eq!(
        out[n + Upgrade::Armor.index()],
        2.0,
        "team 1's after team 0's"
    );
}

#[test]
fn armor_upgrades_soak_one_more_point_per_level() {
    let (mut w, f) = forge_arena(31);
    research_level(&mut w, f, Upgrade::Armor);
    research_level(&mut w, f, Upgrade::Armor);
    assert_eq!(
        first_hit(&mut w, UnitKind::Trooper, ENEMY, UnitKind::Trooper),
        7.0 - 2.0,
        "two armor levels"
    );
    research_level(&mut w, f, Upgrade::Armor);
    assert_eq!(
        first_hit(&mut w, UnitKind::Harvester, ENEMY, UnitKind::Vanguard),
        1.0,
        "every hit does at least 1"
    );
}

#[test]
fn every_weapon_reports_its_shots_for_the_sound() {
    use endfall_sim::world::Event;
    for (shooter, target, weapon) in [
        (UnitKind::Trooper, UnitKind::Trooper, "bolt"),
        (UnitKind::Vanguard, UnitKind::Trooper, "shell"),
        (UnitKind::Lancer, UnitKind::Wasp, "missile"),
        (UnitKind::Harvester, UnitKind::Trooper, "melee"),
        // The Vael sound like glass and ceramic.
        (UnitKind::Prism, UnitKind::Trooper, "lance"),
        (UnitKind::Monolith, UnitKind::Trooper, "slam"),
        (UnitKind::Scythe, UnitKind::Trooper, "blade"),
    ] {
        let mut w = arena(16);
        if shooter.def().shields > 0.0 {
            w.factions = [&VAEL, &HUMANS];
        }
        let me = w.make_unit(shooter, PLAYER, 600.0, 900.0);
        let foe = w.make_unit(target, ENEMY, 615.0, 900.0);
        w.hold_unit(foe);
        w.attack_ent(me, foe);
        let mut heard = Vec::new();
        for _ in 0..3 * TPS {
            w.step();
            for e in w.events.drain(..) {
                if let Event::Fire { x, weapon, .. } = e {
                    heard.push((weapon, x));
                }
            }
        }
        assert!(
            heard
                .iter()
                .any(|&(wp, x)| wp == weapon && (x - 600.0).abs() < 40.0),
            "{shooter:?}: a {weapon} shot from where it stands, heard: {heard:?}"
        );
    }
}

#[test]
fn a_shell_splashes_walking_neighbours_only() {
    // Unarmed Medics stand in for the infantry, so nothing but the shell does damage; the flyer case comes second.
    let first_shell = |w: &mut World, watch: &[Id]| -> Vec<f64> {
        let hp = |w: &World, u: Id| w.unit(u).map_or(0.0, |u| u.hp);
        let start: Vec<f64> = watch.iter().map(|&u| hp(w, u)).collect();
        for _ in 0..4 * TPS {
            w.step();
            if hp(w, watch[0]) < start[0] {
                break; // the first shell landed (before anyone heals)
            }
        }
        watch
            .iter()
            .zip(&start)
            .map(|(&u, s)| s - hp(w, u))
            .collect()
    };
    let dmg = UnitKind::Vanguard.def().damage_vs(false);
    let mut w = arena(16);
    let v = w.make_unit(UnitKind::Vanguard, PLAYER, 600.0, 900.0);
    let target = w.make_unit(UnitKind::Medic, ENEMY, 750.0, 900.0);
    let near = w.make_unit(UnitKind::Medic, ENEMY, 750.0, 925.0); // 25 px from the target
    let far = w.make_unit(UnitKind::Medic, ENEMY, 750.0, 960.0); // 60 px: out of the splash
    let friend = w.make_unit(UnitKind::Medic, PLAYER, 760.0, 880.0);
    for u in [target, near, far, friend] {
        w.hold_unit(u);
    }
    w.attack_ent(v, target);
    let lost = first_shell(&mut w, &[target, near, far, friend]);
    assert_eq!(
        lost,
        vec![dmg, dmg * SHELL_SPLASH, 0.0, 0.0],
        "target, walking neighbour (splash), beyond the radius, own side"
    );
    // A flyer over the target is not splashed.
    let mut w = arena(16);
    let v = w.make_unit(UnitKind::Vanguard, PLAYER, 600.0, 900.0);
    let target = w.make_unit(UnitKind::Medic, ENEMY, 750.0, 900.0);
    let flyer = w.make_unit(UnitKind::Wasp, ENEMY, 752.0, 905.0);
    w.hold_unit(target);
    w.hold_unit(flyer);
    w.attack_ent(v, target);
    let lost = first_shell(&mut w, &[target, flyer]);
    assert_eq!(lost, vec![dmg, 0.0], "the flyer is untouched");
}

#[test]
fn two_medics_do_not_make_a_trooper_immortal() {
    // Heals do not stack: each Medic tends a different patient in a tick.
    let mut w = arena(16);
    let t = w.make_unit(UnitKind::Trooper, PLAYER, 600.0, 900.0);
    for k in 0..2 {
        let m = w.make_unit(UnitKind::Medic, PLAYER, 580.0, 880.0 + k as f64 * 40.0);
        w.hold_unit(m);
    }
    w.hold_unit(t);
    for k in 0..3 {
        let f = w.make_unit(UnitKind::Trooper, ENEMY, 700.0, 880.0 + k as f64 * 20.0);
        w.attack_ent(f, t);
    }
    run(&mut w, 15);
    assert!(
        w.unit(t).is_none(),
        "three Troopers focusing one Trooper out-shoot two Medics"
    );
}

#[test]
fn a_spare_medic_stays_put_while_another_heals() {
    let mut w = flat_arena(16);
    let t = w.make_unit(UnitKind::Trooper, PLAYER, 600.0, 900.0);
    w.units.iter_mut().find(|u| u.id == t).unwrap().hp = 5.0;
    w.hold_unit(t);
    let _m1 = w.make_unit(UnitKind::Medic, PLAYER, 560.0, 880.0);
    let m2 = w.make_unit(UnitKind::Medic, PLAYER, 560.0, 920.0);
    let start = (w.unit(m2).unwrap().x, w.unit(m2).unwrap().y);
    run(&mut w, 2);
    let u = w.unit(m2).unwrap();
    assert!(
        ((u.x - start.0).powi(2) + (u.y - start.1).powi(2)).sqrt() < 3.0,
        "the second Medic does not shuffle onto the patient"
    );
    assert!(w.unit(t).unwrap().hp > 30.0, "the patient is healed");
}

#[test]
fn an_observer_scouts_but_cannot_fight() {
    let mut w = flat_arena(16);
    let o = w.make_unit(UnitKind::Observer, PLAYER, 700.0, 1000.0);
    let foe = w.make_unit(UnitKind::Harvester, ENEMY, 760.0, 1000.0);
    w.hold_unit(foe);
    w.attack_ent(o, foe);
    assert!(
        matches!(w.unit(o).unwrap().task, Task::Idle),
        "an unarmed unit refuses an attack order"
    );
    w.attack_move(o, 1100.0, 1000.0);
    run(&mut w, 6);
    assert_eq!(
        w.unit(foe).unwrap().hp,
        w.unit(foe).unwrap().maxhp,
        "unarmed: it hurts nobody"
    );
    let u = w.unit(o).unwrap();
    assert!(u.x > 1000.0, "it flies on regardless: x {}", u.x);
    // It sees farther than a Trooper: a unit 9.5 tiles away is in view.
    let far = w.make_unit(UnitKind::Trooper, ENEMY, u.x + 9.5 * TILE, u.y);
    w.hold_unit(far);
    run(&mut w, 1);
    let f = w.unit(far).unwrap();
    assert!(
        w.vis[PLAYER as usize][World::tile_of(f.x, f.y).1 as usize * MW as usize
            + World::tile_of(f.x, f.y).0 as usize]
            > 0,
        "seen from 9.5 tiles"
    );
    assert!(UnitKind::Observer.def().air, "and it flies");
}

#[test]
fn attack_moving_units_shoot_what_shoots_them_before_the_nearest_building() {
    // An armed enemy beats a closer Depot.
    let (mut w, me, depot, foe) = priority_scene(UnitKind::Trooper);
    run(&mut w, 1);
    assert_eq!(
        target_of(&w, me),
        Some(foe),
        "the Trooper answers the Trooper"
    );
    let _ = depot;
    // An unarmed one (a Medic) still beats a building.
    let (mut w, me, _, medic) = priority_scene(UnitKind::Medic);
    run(&mut w, 1);
    assert_eq!(target_of(&w, me), Some(medic), "units before buildings");
    // A finished Turret is a threat, an unfinished one is just a building.
    for done in [true, false] {
        let mut w = flat_arena(16);
        let depot = w.make_building(BldgKind::Depot, ENEMY, 30, 30, true);
        let turret = w.make_building(BldgKind::Turret, ENEMY, 26, 31, done);
        let me = w.make_unit(UnitKind::Trooper, PLAYER, 29.5 * TILE, 32.4 * TILE);
        w.attack_move(me, 36.0 * TILE, 32.0 * TILE);
        run(&mut w, 1);
        let want = if done { turret } else { depot };
        assert_eq!(target_of(&w, me), Some(want), "turret done: {done}");
    }
}

#[test]
fn a_unit_busy_with_a_building_turns_on_a_newcomer_that_shoots_it() {
    let mut w = flat_arena(16);
    let depot = w.make_building(BldgKind::Depot, ENEMY, 30, 30, true);
    let me = w.make_unit(UnitKind::Trooper, PLAYER, 29.0 * TILE, 32.0 * TILE);
    w.attack_move(me, 36.0 * TILE, 32.0 * TILE);
    run(&mut w, 1);
    assert_eq!(target_of(&w, me), Some(depot));
    let foe = w.make_unit(UnitKind::Trooper, ENEMY, 24.0 * TILE, 32.0 * TILE);
    w.hold_unit(foe);
    run(&mut w, 1);
    assert_eq!(target_of(&w, me), Some(foe), "switches to the shooter");
    // An explicit order stands: told to hit the Depot, it keeps hitting the Depot.
    w.attack_ent(me, depot);
    run(&mut w, 2);
    assert_eq!(target_of(&w, me), Some(depot), "the order stands");
}

#[test]
fn flyers_do_not_fear_what_cannot_reach_them() {
    // A Vanguard cannot shoot up, a Trooper can: a Wasp on attack-move goes for the Trooper even when farther.
    let mut w = flat_arena(16);
    let vanguard = w.make_unit(UnitKind::Vanguard, ENEMY, 30.0 * TILE, 32.0 * TILE);
    let trooper = w.make_unit(UnitKind::Trooper, ENEMY, 25.0 * TILE, 32.0 * TILE);
    w.hold_unit(vanguard);
    w.hold_unit(trooper);
    let wasp = w.make_unit(UnitKind::Wasp, PLAYER, 31.0 * TILE, 32.0 * TILE);
    w.attack_move(wasp, 40.0 * TILE, 32.0 * TILE);
    run(&mut w, 1);
    assert_eq!(target_of(&w, wasp), Some(trooper));
    // And the Vanguard, which shoots ground, treats the Wasp as a plain unit but the Trooper as a threat.
    assert_eq!(w.threat_tier(trooper, false), 0);
    assert_eq!(w.threat_tier(wasp, false), 0, "a Wasp shoots ground");
    assert_eq!(
        w.threat_tier(vanguard, true),
        1,
        "a Vanguard cannot reach a flyer"
    );
}

#[test]
fn harvesters_are_not_threats_and_unarmed_units_do_not_pull_units_off_buildings() {
    // A Harvester nearer than an enemy Trooper: the Trooper is the one shooting, so it comes first.
    let mut w = flat_arena(16);
    w.make_building(BldgKind::Depot, ENEMY, 30, 30, true);
    let me = w.make_unit(UnitKind::Trooper, PLAYER, 29.0 * TILE, 32.0 * TILE);
    let harv = w.make_unit(UnitKind::Harvester, ENEMY, 27.0 * TILE, 32.5 * TILE);
    let foe = w.make_unit(UnitKind::Trooper, ENEMY, 24.0 * TILE, 32.5 * TILE);
    w.hold_unit(harv);
    w.hold_unit(foe);
    w.attack_move(me, 36.0 * TILE, 32.0 * TILE);
    run(&mut w, 1);
    assert_eq!(target_of(&w, me), Some(foe));
    assert_eq!(w.threat_tier(harv, false), 1, "a Harvester only scratches");
    // Busy with the Depot, an Observer at the edge of sight (out of weapon range) does not pull it away.
    let mut w = flat_arena(16);
    let depot = w.make_building(BldgKind::Depot, ENEMY, 30, 30, true);
    let me = w.make_unit(UnitKind::Trooper, PLAYER, 29.5 * TILE, 32.0 * TILE);
    w.attack_move(me, 36.0 * TILE, 32.0 * TILE);
    run(&mut w, 1);
    assert_eq!(target_of(&w, me), Some(depot));
    let obs = w.make_unit(UnitKind::Observer, ENEMY, 23.0 * TILE, 32.0 * TILE);
    w.hold_unit(obs);
    run(&mut w, 2);
    assert_eq!(target_of(&w, me), Some(depot), "keeps hitting the Depot");
}

#[test]
fn a_chased_target_out_of_sight_is_let_go_and_the_attack_move_resumes() {
    let mut w = flat_arena(16);
    let me = w.make_unit(UnitKind::Trooper, PLAYER, 20.0 * TILE, 32.0 * TILE);
    let obs = w.make_unit(UnitKind::Observer, ENEMY, 25.0 * TILE, 32.0 * TILE);
    w.hold_unit(obs);
    w.attack_move(me, 40.0 * TILE, 32.0 * TILE);
    run(&mut w, 1);
    assert_eq!(target_of(&w, me), Some(obs));
    // The Observer flies far off: the Trooper does not follow it across the map.
    let o = w.units.iter_mut().find(|u| u.id == obs).unwrap();
    o.y -= 16.0 * TILE;
    run(&mut w, 1);
    assert!(
        matches!(w.unit(me).unwrap().task, Task::AMove { .. }),
        "back on the attack-move: {:?}",
        w.unit(me).unwrap().task
    );
}

#[test]
fn units_answer_a_shooter_and_then_carry_on_with_their_attack_move() {
    // Shot while attack-moving: answer, and after the shooter dies carry on attack-moving (not a plain move).
    let mut w = flat_arena(16);
    let me = w.make_unit(UnitKind::Trooper, PLAYER, 20.0 * TILE, 32.0 * TILE);
    let foe = w.make_unit(UnitKind::Trooper, ENEMY, 20.0 * TILE, 42.0 * TILE);
    w.hold_unit(foe);
    w.attack_move(me, 44.0 * TILE, 32.0 * TILE);
    w.damage(me, 1.0, Some(foe));
    assert_eq!(target_of(&w, me), Some(foe));
    w.damage(foe, 1e6, None);
    run(&mut w, 1);
    assert!(
        matches!(
            w.unit(me).unwrap().task,
            Task::AMove { .. } | Task::Attack { .. }
        ),
        "{:?}",
        w.unit(me).unwrap().task
    );
    assert!(
        !matches!(w.unit(me).unwrap().task, Task::Move { .. }),
        "an attack-move, not a plain move"
    );
    // Busy with a Depot it found itself, a shooter from beyond sight still gets an answer.
    let mut w = flat_arena(16);
    let depot = w.make_building(BldgKind::Depot, ENEMY, 30, 30, true);
    let me = w.make_unit(UnitKind::Trooper, PLAYER, 29.5 * TILE, 32.0 * TILE);
    w.attack_move(me, 36.0 * TILE, 32.0 * TILE);
    run(&mut w, 1);
    assert_eq!(target_of(&w, me), Some(depot));
    let foe = w.make_unit(UnitKind::Vanguard, ENEMY, 19.0 * TILE, 32.0 * TILE);
    w.hold_unit(foe);
    w.damage(me, 1.0, Some(foe));
    assert_eq!(target_of(&w, me), Some(foe), "turns on the shooter");
}

#[test]
fn idle_defenders_shot_by_a_passing_wasp_give_up_and_walk_home() {
    let mut w = flat_arena(16);
    let me = w.make_unit(UnitKind::Trooper, PLAYER, 30.0 * TILE, 32.0 * TILE);
    let mate = w.make_unit(UnitKind::Trooper, PLAYER, 31.0 * TILE, 32.0 * TILE);
    let wasp = w.make_unit(UnitKind::Wasp, ENEMY, 30.0 * TILE, 38.0 * TILE);
    w.hold_unit(wasp);
    run(&mut w, 1);
    w.damage(me, 1.0, Some(wasp));
    assert_eq!(target_of(&w, me), Some(wasp));
    assert_eq!(
        target_of(&w, mate),
        Some(wasp),
        "the idle neighbour joins in"
    );
    // The Wasp leaves for good: both let it go and walk back to where they stood.
    let o = w.units.iter_mut().find(|u| u.id == wasp).unwrap();
    o.hp = 1e6;
    o.maxhp = 1e6;
    o.y = 4.0 * TILE;
    run(&mut w, 12);
    for (u, x) in [(me, 30.0), (mate, 31.0)] {
        let u = w.unit(u).unwrap();
        assert!(!matches!(u.task, Task::Attack { .. }), "{:?}", u.task);
        assert!(
            (u.x - x * TILE).abs() < 1.5 * TILE && (u.y - 32.0 * TILE).abs() < 6.0 * TILE,
            "back near its spot: {:.0},{:.0}",
            u.x / TILE,
            u.y / TILE
        );
    }
}

#[test]
fn shields_research_soaks_damage_on_shields_only() {
    let mut w = flat_arena(17);
    w.factions = [&VAEL, &HUMANS];
    let s = w.make_unit(UnitKind::Scythe, PLAYER, 30.0 * TILE, 30.0 * TILE);
    w.hold_unit(s);
    w.upgrades[PLAYER as usize][Upgrade::Shields.index()] = 2;
    let d = UnitKind::Scythe.def();
    w.damage(s, 7.0, None);
    assert_eq!(
        w.unit(s).unwrap().sh,
        d.shields - 5.0,
        "two levels soak 2 of a 7-damage hit on shields"
    );
    w.damage(s, 2.0, None);
    assert_eq!(
        w.unit(s).unwrap().sh,
        d.shields - 6.0,
        "at least 1 always lands"
    );
    let left = w.unit(s).unwrap().sh;
    w.damage(s, left + 2.0 + 10.0, None);
    let u = w.unit(s).unwrap();
    assert_eq!(
        (u.sh, u.hp),
        (0.0, d.hp - (10.0 - d.armor)),
        "the soak applies once, then hull armor on the rest"
    );
    w.damage(s, 7.0, None);
    assert_eq!(
        w.unit(s).unwrap().hp,
        d.hp - (10.0 - d.armor) - (7.0 - d.armor),
        "with the shields down, only hull armor"
    );
    assert!(
        BldgKind::Loom.def().researches.contains(&Upgrade::Shields),
        "researched at the Loom"
    );
}

#[test]
fn a_halo_mends_shields_in_combat_and_never_the_hull() {
    let mut w = flat_arena(18);
    w.factions = [&VAEL, &HUMANS];
    let (x, y) = (30.0 * TILE, 30.0 * TILE);
    let halo = w.make_unit(UnitKind::Halo, PLAYER, x, y);
    let a = w.make_unit(UnitKind::Scythe, PLAYER, x + 40.0, y);
    let b = w.make_unit(UnitKind::Scythe, PLAYER, x - 40.0, y);
    let far = w.make_unit(UnitKind::Scythe, PLAYER, x + 9.0 * TILE, y);
    for u in [halo, a, b, far] {
        w.hold_unit(u);
    }
    let d = UnitKind::Scythe.def();
    for u in [a, b, far] {
        w.damage(u, d.shields + 20.0, None); // shields gone, some hull lost
    }
    let hull = w.unit(a).unwrap().hp;
    run(&mut w, 2);
    // No regeneration yet (SHIELD_DELAY), so whatever came back was mended: about 10/s on one patient at a time.
    let (sa, sb) = (w.unit(a).unwrap().sh, w.unit(b).unwrap().sh);
    assert!(
        sa + sb > 15.0 && sa + sb < 25.0,
        "one Halo mends about 10 shields/s: {sa} + {sb}"
    );
    assert_eq!(
        w.unit(far).unwrap().sh,
        0.0,
        "out of reach (9 tiles) gets nothing, in the delay"
    );
    assert_eq!(w.unit(a).unwrap().hp, hull, "the hull is not mended");
    // Under fire too: hits keep resetting the regeneration delay, the Halo still mends.
    for t in 0..2 * TPS {
        if t % 15 == 0 {
            w.damage(a, 1.0, None); // two small hits a second each
            w.damage(b, 1.0, None);
        }
        w.step();
    }
    assert!(
        w.unit(a).unwrap().sh + w.unit(b).unwrap().sh > sa + sb,
        "mending outpaces 1-damage hits"
    );
    // A Halo does not heal infantry.
    let t = w.make_unit(UnitKind::Trooper, PLAYER, x, y + 30.0);
    w.hold_unit(t);
    w.damage(t, 20.0, None);
    let thp = w.unit(t).unwrap().hp;
    run(&mut w, 2);
    assert_eq!(w.unit(t).unwrap().hp, thp, "a Halo does not heal a Trooper");
}

#[test]
fn vael_shields_take_hits_first_and_come_back_out_of_combat() {
    let mut w = flat_arena(16);
    w.factions = [&VAEL, &HUMANS];
    let s = w.make_unit(UnitKind::Scythe, PLAYER, 30.0 * TILE, 30.0 * TILE);
    w.hold_unit(s);
    let d = UnitKind::Scythe.def();
    // A hit smaller than the shields: all on the shields, at full value (armor does not apply to them).
    w.damage(s, 25.0, None);
    let u = w.unit(s).unwrap();
    assert_eq!(
        (u.hp, u.sh),
        (d.hp, d.shields - 25.0),
        "shields first, armor ignored"
    );
    // A hit bigger than what is left: the rest goes to the hull, minus armor.
    w.damage(s, 50.0, None);
    let u = w.unit(s).unwrap();
    assert_eq!(u.sh, 0.0);
    assert_eq!(
        u.hp,
        d.hp - (50.0 - (d.shields - 25.0) - d.armor),
        "the rest, minus armor, on the hull"
    );
    let hull = u.hp;
    // No regeneration for SHIELD_DELAY, then 3/s back to full; the hull stays as it is.
    run(&mut w, 5);
    assert_eq!(w.unit(s).unwrap().sh, 0.0, "nothing during the delay");
    run(&mut w, 2);
    assert!(w.unit(s).unwrap().sh > 0.0, "regenerating after the delay");
    run(&mut w, 20);
    let u = w.unit(s).unwrap();
    assert_eq!(u.sh, d.shields, "full again in about 6 + shields/3 s");
    assert_eq!(u.hp, hull, "the hull never heals by itself");
    // Humans have no shields: a hit is as it always was.
    let t = w.make_unit(UnitKind::Trooper, ENEMY, 36.0 * TILE, 30.0 * TILE);
    w.hold_unit(t);
    w.damage(t, 10.0, None);
    assert_eq!(w.unit(t).unwrap().hp, UnitKind::Trooper.def().hp - 10.0);
    assert_eq!(w.unit(t).unwrap().maxsh, 0.0);
}

#[test]
fn vael_buildings_regenerate_shields_and_lumens_do_not_repair() {
    let mut w = rich_vael(4242);
    let l = harvesters(&w, PLAYER);
    let spire = build(&mut w, BldgKind::Spire, l[0], 90);
    let d = BldgKind::Spire.def();
    w.damage(spire, d.shields + 50.0, None);
    let b = w.bldg(spire).unwrap();
    assert_eq!(b.sh, 0.0);
    assert!(b.hp < b.maxhp, "the hull took the rest");
    let hull = b.hp;
    assert!(!w.can_repair(l[1], spire), "a Lumen cannot repair");
    assert!(!w.start_repair(l[1], spire));
    run(&mut w, 6 + (d.shields / 2.0) as u32 + 2);
    let b = w.bldg(spire).unwrap();
    assert_eq!(b.sh, d.shields, "buildings regenerate their shields (2/s)");
    assert_eq!(b.hp, hull, "but not their hull");
    // The humans still repair.
    let mut w = rich(4242);
    let h = harvesters(&w, PLAYER);
    let depot = build(&mut w, BldgKind::Depot, h[0], 90);
    w.damage(depot, 100.0, None);
    assert!(w.can_repair(h[1], depot));
}

#[test]
fn a_monolith_splashes_with_its_own_numbers() {
    let mut w = arena(16);
    w.factions = [&VAEL, &HUMANS];
    let d = UnitKind::Monolith.def();
    let wp = d.weapon.unwrap();
    assert_eq!((wp.splash, wp.splash_r), (0.5, 40.0));
    let m = w.make_unit(UnitKind::Monolith, PLAYER, 560.0, 900.0);
    let target = w.make_unit(UnitKind::Medic, ENEMY, 750.0, 900.0);
    let near = w.make_unit(UnitKind::Medic, ENEMY, 750.0, 930.0); // 30 px: in its splash
    for u in [target, near] {
        w.hold_unit(u);
    }
    let start = [target, near].map(|u| w.unit(u).unwrap().hp);
    w.attack_ent(m, target);
    for _ in 0..6 * TPS {
        w.step();
        if w.unit(target).is_none_or(|u| u.hp < start[0]) {
            break;
        }
    }
    let lost = [target, near].map(|u| w.unit(u).map_or(0.0, |x| x.hp)); // (a dead unit has nothing left)
    assert_eq!(
        start[0] - lost[0],
        wp.dmg.min(start[0]),
        "the target takes the shot"
    );
    assert_eq!(start[1] - lost[1], wp.dmg * 0.5, "its neighbour takes half");
}

#[test]
fn a_healer_on_attack_move_keeps_behind_the_fight() {
    // Before, an attack-moving Medic walked straight through while the soldiers stopped to fight, and arrived first.
    let mut w = arena(19);
    let squad: Vec<Id> = (0..3)
        .map(|i| w.make_unit(UnitKind::Trooper, PLAYER, 600.0, 860.0 + 30.0 * i as f64))
        .collect();
    let medic = w.make_unit(UnitKind::Medic, PLAYER, 560.0, 890.0);
    for i in 0..3 {
        let foe = w.make_unit(UnitKind::Trooper, ENEMY, 860.0, 860.0 + 30.0 * i as f64);
        w.hold_unit(foe);
    }
    for &u in squad.iter().chain([&medic]) {
        w.attack_move(u, 1300.0, 890.0);
    }
    let (mut ahead, mut healed, mut hurting) = (0, 0u32, 0u32);
    for _ in 0..8 * TPS {
        w.step();
        let tick = w.tick;
        let hurt = squad
            .iter()
            .any(|&s| w.unit(s).is_some_and(|s| s.hp < s.maxhp));
        let tended = squad
            .iter()
            .any(|&s| w.unit(s).is_some_and(|s| s.healed_at == tick));
        if hurt && w.unit(medic).is_some() {
            hurting += 1;
            healed += tended as u32;
        }
        let front = squad
            .iter()
            .filter_map(|&s| w.unit(s))
            .map(|s| s.x)
            .fold(f64::MIN, f64::max);
        if let Some(m) = w.unit(medic)
            && front > f64::MIN
            && m.x > front + 16.0
        {
            ahead += 1;
        }
    }
    assert_eq!(
        ahead, 0,
        "the Medic never ran ahead of the squad while it fought"
    );
    assert!(w.unit(medic).is_some(), "and it lived through the fight");
    assert!(
        healed * 10 >= hurting * 7,
        "and it stayed close enough to heal: {healed} of {hurting} ticks with someone hurt"
    );
}

#[test]
fn the_army_log_samples_both_sides_every_ten_seconds() {
    let mut w = arena(21);
    w.make_unit(UnitKind::Trooper, PLAYER, 600.0, 900.0);
    w.make_unit(UnitKind::Harvester, PLAYER, 640.0, 900.0); // (a worker is not army)
    run(&mut w, 25);
    assert_eq!(w.army_log[0], vec![50, 50], "two samples of one Trooper");
    assert_eq!(w.army_log[1], vec![0, 0]);
    w.make_unit(UnitKind::Vanguard, ENEMY, 1600.0, 300.0);
    run(&mut w, 10);
    assert_eq!(
        w.army_log[1].last(),
        Some(&200),
        "a Vanguard: 125 shards + 75 ether"
    );
}
