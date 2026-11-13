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
            let blocked_mid = (x + 4..x + 9).any(|xx| w.map.rock[w.map.idx(xx, y)] != 0);
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
    let raider = w.make_unit(UnitKind::Shrike, PLAYER, sx, sy);
    w.move_to(raider, tx, sy);
    let mut over_rock = false;
    let secs = (tx - sx) / UnitKind::Shrike.def().speed + 1.0;
    for _ in 0..(secs * TPS as f64) as u32 {
        w.step();
        let u = w.unit(raider).unwrap();
        let (cx, cy) = w.map.tile_of(u.x, u.y);
        over_rock |= w.map.rock[w.map.idx(cx, cy)] != 0;
        assert!((u.y - sy).abs() < 1.0, "flies straight");
    }
    assert!(over_rock, "it flew over rock");
    assert!(
        (w.unit(raider).unwrap().x - tx).abs() < 40.0,
        "arrived in straight-line time"
    );
}

#[test]
fn ground_only_weapons_cannot_touch_flyers() {
    // The spears and lances (the Guard, the Rider, the Knight), the Buggy's light gun, the Bruiser's heavy gun and the
    // Rover's rockets: the Archer and the Ballista are the Kingdom's anti-air, the Sellsword, the Android and the Drone
    // the Expedition's.
    for kind in [
        UnitKind::Trooper,
        UnitKind::Rider,
        UnitKind::Knight,
        UnitKind::Scythe,
        UnitKind::Bruiser,
        UnitKind::Monolith,
    ] {
        let mut w = arena(7);
        let van = w.make_unit(kind, PLAYER, 600.0, 900.0);
        set_hp(&mut w, van, 1e6); // (it outlives the Drone's fire: what it does back is watched)
        let raider = w.make_unit(UnitKind::Shrike, ENEMY, 680.0, 900.0);
        assert!(!w.can_hit(van, raider), "{kind:?} cannot hit a flyer");
        w.attack_ent(van, raider);
        assert_eq!(
            w.unit(van).unwrap().task,
            Task::Idle,
            "{kind:?}: an order to hit a flyer is refused"
        );
        w.hold_unit(raider); // (the Drone just hovers, on hold, shooting what is in its reach)
        run(&mut w, 8);
        let v = w.unit(van).unwrap();
        assert!(
            !matches!(v.task, Task::Attack { .. }),
            "{kind:?} neither auto-targets nor retaliates against the Drone"
        );
        assert!(
            w.unit(raider).is_some_and(|u| u.hp == u.maxhp),
            "{kind:?} never hurts it"
        );
    }
}

#[test]
fn a_ballista_hits_flyers_hard_and_the_ground_too() {
    // The Kingdom's anti-air (the Netter's place) has a ground attack: its bolts hit a Guard, softer than a Drone.
    let d = UnitKind::Bastion.def();
    let wp = d.weapon.unwrap();
    assert!(!d.air && d.mv == Move::Walk, "a ground vehicle");
    assert!(wp.dmg > 0.0 && wp.dmg_air > 2.0 * wp.dmg);
    let mut w = arena(7);
    let b = w.make_unit(UnitKind::Bastion, PLAYER, 600.0, 900.0);
    let guard = w.make_unit(UnitKind::Trooper, ENEMY, 700.0, 900.0);
    let depot = w.make_building(BldgKind::Depot, ENEMY, 21, 26, true);
    assert!(
        w.can_hit(b, guard) && w.can_hit(b, depot),
        "it can hit the ground"
    );
    w.hold_unit(guard);
    assert_eq!(
        first_hit(&mut w, UnitKind::Bastion, PLAYER, UnitKind::Trooper),
        wp.dmg - UnitKind::Trooper.def().armor
    );
    assert_eq!(
        first_hit(&mut w, UnitKind::Bastion, PLAYER, UnitKind::Shrike),
        wp.dmg_air
    );
}

#[test]
fn anti_air_units_and_turrets_shoot_flyers_down() {
    for shooter in ["lancer", "bastion", "umbra", "turret"] {
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
        // The Drone hovers just outside its own reach; anything that can hit the air should bring it down.
        let raider = w.make_unit(UnitKind::Shrike, ENEMY, 21.0 * TILE + 170.0, 31.0 * TILE);
        w.hold_unit(raider);
        run(&mut w, 40);
        assert!(w.unit(raider).is_none(), "{shooter} shot the Drone down");
    }
}

#[test]
fn three_archers_beat_a_drone_up_close() {
    // (three Archers cost a little more than one Drone does)
    let mut w = arena(10);
    let lancer = w.make_unit(UnitKind::Lancer, PLAYER, 600.0, 900.0);
    let other = w.make_unit(UnitKind::Lancer, PLAYER, 600.0, 930.0);
    let third = w.make_unit(UnitKind::Lancer, PLAYER, 600.0, 870.0);
    let raider = w.make_unit(UnitKind::Shrike, ENEMY, 660.0, 900.0);
    w.attack_ent(raider, lancer);
    w.attack_ent(other, raider);
    w.attack_ent(third, raider);
    run(&mut w, 20);
    assert!(
        w.unit(raider).is_none() && [lancer, other, third].iter().any(|&a| w.unit(a).is_some()),
        "anti-air wins its duel"
    );
}

#[test]
fn medics_heal_infantry_but_not_machines() {
    let mut w = arena(11);
    let medic = w.make_unit(UnitKind::Medic, PLAYER, 600.0, 900.0);
    let trooper = w.make_unit(UnitKind::Trooper, PLAYER, 630.0, 900.0);
    let van = w.make_unit(UnitKind::SiegeTank, PLAYER, 600.0, 940.0);
    for (id, hp) in [(trooper, 10.0), (van, 50.0)] {
        w.units.iter_mut().find(|u| u.id == id).unwrap().hp = hp;
    }
    let _ = medic;
    run(&mut w, 12);
    assert_eq!(
        w.unit(trooper).unwrap().hp,
        w.unit(trooper).unwrap().maxhp,
        "trooper healed to full"
    );
    assert_eq!(w.unit(van).unwrap().hp, 50.0, "Cannons are machines");
}

#[test]
fn medics_walk_to_hurt_infantry_they_can_see() {
    let mut w = arena(12);
    let medic = w.make_unit(UnitKind::Medic, PLAYER, 600.0, 900.0);
    let trooper = w.make_unit(UnitKind::Trooper, PLAYER, 780.0, 900.0);
    w.units.iter_mut().find(|u| u.id == trooper).unwrap().hp = 5.0;
    run(&mut w, 15);
    assert!(
        w.unit(trooper).unwrap().hp > 30.0,
        "the medic came over and healed"
    );
    assert!(w.unit(medic).unwrap().x > 650.0);
}

#[test]
fn walkers_and_flyers_pass_under_and_over_each_other() {
    let mut w = flat_arena(14);
    let raider = w.make_unit(UnitKind::Shrike, PLAYER, 700.0, 900.0);
    w.hold_unit(raider);
    let trooper = w.make_unit(UnitKind::Trooper, PLAYER, 600.0, 900.0);
    w.move_to(trooper, 800.0, 900.0);
    run(&mut w, 4);
    let (tx, wx) = (w.unit(trooper).unwrap().x, w.unit(raider).unwrap().x);
    assert!(tx > 760.0, "the trooper walked under the raider: {tx}");
    assert_eq!(wx, 700.0, "and did not push it");
}

#[test]
fn the_player_hears_about_attacks_once_per_fight() {
    use endfall_sim::world::Event;
    let mut w = arena(16);
    let mine = w.make_unit(UnitKind::Knight, PLAYER, 600.0, 900.0);
    w.hold_unit(mine);
    let foe = w.make_unit(UnitKind::Lancer, ENEMY, 700.0, 900.0);
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
        let mine = w.make_unit(UnitKind::Knight, PLAYER, x, y);
        w.hold_unit(mine);
        let foe = w.make_unit(UnitKind::Lancer, ENEMY, x + 80.0, y);
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
        first_hit(&mut w, UnitKind::Trooper, PLAYER, UnitKind::Knight),
        7.0 - 3.0
    );
    research_level(&mut w, f, Upgrade::Weapons);
    assert_eq!(
        first_hit(&mut w, UnitKind::Trooper, PLAYER, UnitKind::Knight),
        7.0 + 1.0 - 3.0,
        "Guard +1"
    );
    assert_eq!(
        first_hit(&mut w, UnitKind::Knight, PLAYER, UnitKind::Knight),
        38.0 + 3.0 - 3.0,
        "Knight +3"
    );
}

#[test]
fn every_upgrade_is_researched_somewhere_and_reaches_the_snapshot() {
    for u in UPGRADES {
        // (but Hardshell: shields are data since the re-theme, and nothing researches it)
        assert_eq!(
            BLDG_KINDS.iter().any(|b| b.def().researches.contains(&u)),
            u != Upgrade::Shields,
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
        7.0 - 1.0 - 2.0,
        "two armor levels on the Guard's own 1"
    );
    research_level(&mut w, f, Upgrade::Armor);
    assert_eq!(
        first_hit(&mut w, UnitKind::Harvester, ENEMY, UnitKind::Knight),
        1.0,
        "every hit does at least 1"
    );
}

#[test]
fn every_weapon_reports_its_shots_for_the_sound() {
    use endfall_sim::world::Event;
    for (shooter, target, weapon) in [
        (UnitKind::Trooper, UnitKind::Trooper, "melee"),
        (UnitKind::Lancer, UnitKind::Shrike, "missile"),
        (UnitKind::Harvester, UnitKind::Trooper, "melee"),
        // The Expedition sound like glass and ceramic (its sounds are the Vael's until the words PR).
        (UnitKind::Prism, UnitKind::Trooper, "blade"),
        (UnitKind::Scythe, UnitKind::Trooper, "lance"),
        (UnitKind::Lumen, UnitKind::Trooper, "blade"),
    ] {
        let mut w = arena(16);
        if VAEL
            .build_basic
            .iter()
            .chain(VAEL.build_advanced)
            .chain([&VAEL.hq])
            .any(|b| b.def().trains.contains(&shooter))
        {
            w.factions = vec![&VAEL, &HUMANS];
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
    // (the Rover's rockets: 0.5 of the hit within 44 px)
    let wp = UnitKind::Monolith.def().weapon.unwrap();
    let dmg = wp.dmg;
    let mut w = flat_arena(16);
    let v = w.make_unit(UnitKind::Monolith, PLAYER, 600.0, 900.0);
    let target = w.make_unit(UnitKind::Medic, ENEMY, 750.0, 900.0);
    set_hp(&mut w, target, 500.0); // (it outlives the first rocket: the whole hit shows)
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
        vec![dmg, dmg * wp.splash, 0.0, 0.0],
        "target, walking neighbour (splash), beyond the radius, own side"
    );
    // A flyer over the target is not splashed.
    let mut w = flat_arena(16);
    let v = w.make_unit(UnitKind::Monolith, PLAYER, 600.0, 900.0);
    let target = w.make_unit(UnitKind::Medic, ENEMY, 750.0, 900.0);
    set_hp(&mut w, target, 500.0);
    let flyer = w.make_unit(UnitKind::Observer, ENEMY, 752.0, 905.0);
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
        let f = w.make_unit(UnitKind::Lancer, ENEMY, 700.0, 880.0 + k as f64 * 20.0);
        w.attack_ent(f, t);
    }
    run(&mut w, 15);
    assert!(
        w.unit(t).is_none(),
        "three Archers focusing one Guard out-shoot two Medics"
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
    assert!(
        w.unit(t).unwrap().hp > 5.0 + UnitKind::Medic.def().heal,
        "the patient is healed (by one Medic: more than a second of its rate in two)"
    );
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
        w.vis[PLAYER as usize][{
            let (tx, ty) = w.map.tile_of(f.x, f.y);
            w.map.idx(tx, ty)
        }] > 0,
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
    // A Knight cannot strike up, nor can a Guard; an Archer can: a Drone on attack-move goes for the Archer even when
    // farther.
    let mut w = flat_arena(16);
    let vanguard = w.make_unit(UnitKind::Knight, ENEMY, 30.0 * TILE, 32.0 * TILE);
    let picket = w.make_unit(UnitKind::Trooper, ENEMY, 29.0 * TILE, 33.0 * TILE);
    let lancer = w.make_unit(UnitKind::Lancer, ENEMY, 25.0 * TILE, 32.0 * TILE);
    for u in [vanguard, picket, lancer] {
        w.hold_unit(u);
    }
    let raider = w.make_unit(UnitKind::Shrike, PLAYER, 31.0 * TILE, 32.0 * TILE);
    w.attack_move(raider, 40.0 * TILE, 32.0 * TILE);
    run(&mut w, 1);
    assert_eq!(target_of(&w, raider), Some(lancer));
    // And the Knight, which strikes the ground, treats the Drone as a threat as it does the Archer.
    assert_eq!(w.threat_tier(lancer, false), 0);
    assert_eq!(w.threat_tier(raider, false), 0, "a Drone shoots ground");
    for (u, name) in [(vanguard, "a Knight"), (picket, "a Guard")] {
        assert_eq!(w.threat_tier(u, true), 1, "{name} cannot reach a flyer");
    }
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
    // Busy with the Depot, an unarmed unit at the edge of sight (out of weapon range) does not pull it away.
    let mut w = flat_arena(16);
    let depot = w.make_building(BldgKind::Depot, ENEMY, 30, 30, true);
    let me = w.make_unit(UnitKind::Trooper, PLAYER, 29.5 * TILE, 32.0 * TILE);
    w.attack_move(me, 36.0 * TILE, 32.0 * TILE);
    run(&mut w, 1);
    assert_eq!(target_of(&w, me), Some(depot));
    let harv = w.make_unit(UnitKind::Harvester, ENEMY, 23.0 * TILE, 32.0 * TILE);
    w.hold_unit(harv);
    run(&mut w, 2);
    assert_eq!(target_of(&w, me), Some(depot), "keeps hitting the Depot");
}

#[test]
fn a_chased_target_out_of_sight_is_let_go_and_the_attack_move_resumes() {
    let mut w = flat_arena(16);
    let me = w.make_unit(UnitKind::Lancer, PLAYER, 20.0 * TILE, 32.0 * TILE);
    let obs = w.make_unit(UnitKind::Observer, ENEMY, 25.0 * TILE, 32.0 * TILE); // (a flyer that will not chase)
    w.hold_unit(obs);
    w.attack_move(me, 40.0 * TILE, 32.0 * TILE);
    run(&mut w, 1);
    assert_eq!(target_of(&w, me), Some(obs));
    // The flyer is carried far off: the Lancer does not follow it across the map.
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
    let foe = w.make_unit(UnitKind::Knight, ENEMY, 19.0 * TILE, 32.0 * TILE);
    w.hold_unit(foe);
    w.damage(me, 1.0, Some(foe));
    assert_eq!(target_of(&w, me), Some(foe), "turns on the shooter");
}

#[test]
fn idle_defenders_shot_by_a_passing_raider_give_up_and_walk_home() {
    // (Archers: the Guard has no strike at a flyer)
    let mut w = flat_arena(16);
    let me = w.make_unit(UnitKind::Lancer, PLAYER, 30.0 * TILE, 32.0 * TILE);
    let mate = w.make_unit(UnitKind::Lancer, PLAYER, 31.0 * TILE, 32.0 * TILE);
    let raider = w.make_unit(UnitKind::Shrike, ENEMY, 30.0 * TILE, 38.0 * TILE);
    w.hold_unit(raider);
    // (made to last: the swarm Drone is fragile, and the Archers' first volley must not end the scene)
    let o = w.units.iter_mut().find(|u| u.id == raider).unwrap();
    (o.hp, o.maxhp) = (1e6, 1e6);
    run(&mut w, 1);
    w.damage(me, 1.0, Some(raider));
    assert_eq!(target_of(&w, me), Some(raider));
    assert_eq!(
        target_of(&w, mate),
        Some(raider),
        "the idle neighbour joins in"
    );
    // The Drone leaves for good: both let it go and walk back to where they stood.
    let o = w.units.iter_mut().find(|u| u.id == raider).unwrap();
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
    w.factions = vec![&VAEL, &HUMANS];
    let s = w.make_unit(UnitKind::Scythe, PLAYER, 30.0 * TILE, 30.0 * TILE);
    give_shields(&mut w, s, TEST_SHIELDS);
    w.hold_unit(s);
    w.upgrades[PLAYER as usize][Upgrade::Shields.index()] = 2;
    let d = UnitKind::Scythe.def();
    w.damage(s, 7.0, None);
    assert_eq!(
        w.unit(s).unwrap().sh,
        TEST_SHIELDS - 5.0,
        "two levels soak 2 of a 7-damage hit on shields"
    );
    w.damage(s, 2.0, None);
    assert_eq!(
        w.unit(s).unwrap().sh,
        TEST_SHIELDS - 6.0,
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
        BLDG_KINDS
            .iter()
            .all(|b| !b.def().researches.contains(&Upgrade::Shields)),
        "data since the re-theme: researched nowhere"
    );
}

#[test]
fn a_tender_mends_nacre_first_then_hull_and_never_past_full() {
    // Roster v2: the Tender (`mend`) tends any ally of its seat, its nacre (shields) first, then its hull; in combat
    // too, one patient at a time.
    let mut w = flat_arena(18);
    w.factions = vec![&VAEL, &HUMANS];
    let (x, y) = (30.0 * TILE, 30.0 * TILE);
    let tender = w.make_unit(UnitKind::Halo, PLAYER, x, y);
    let a = w.make_unit(UnitKind::Scythe, PLAYER, x + 40.0, y);
    let b = w.make_unit(UnitKind::Scythe, PLAYER, x - 40.0, y);
    let far = w.make_unit(UnitKind::Scythe, PLAYER, x + 9.0 * TILE, y);
    for u in [tender, a, b, far] {
        w.hold_unit(u);
    }
    for u in [a, b, far] {
        give_shields(&mut w, u, TEST_SHIELDS);
    }
    let d = UnitKind::Scythe.def();
    for u in [a, b, far] {
        w.damage(u, TEST_SHIELDS + 20.0, None); // nacre gone, some hull lost
    }
    let hull = w.unit(a).unwrap().hp;
    assert!(hull < d.hp);
    run(&mut w, 2);
    // No regeneration yet (SHIELD_DELAY), so whatever came back was mended: about its rate on one patient at a time,
    // all of it nacre while the nacre is not full.
    let (sa, sb) = (w.unit(a).unwrap().sh, w.unit(b).unwrap().sh);
    let mend = UnitKind::Halo.def().heal;
    assert!(
        sa + sb > 1.5 * mend && sa + sb < 2.5 * mend,
        "one Tender mends about {mend}/s: {sa} + {sb}"
    );
    assert_eq!(w.unit(far).unwrap().sh, 0.0, "out of reach (9 tiles)");
    for u in [a, b] {
        assert_eq!(w.unit(u).unwrap().hp, hull, "nacre first: the hull waits");
    }
    // Under fire too: hits keep resetting the regeneration delay, the Tender still mends.
    for t in 0..2 * TPS {
        if t % 15 == 0 {
            w.damage(a, 1.0, None); // two small hits a second each
            w.damage(b, 1.0, None);
        }
        w.step();
    }
    let (sa2, sb2) = (w.unit(a).unwrap().sh, w.unit(b).unwrap().sh);
    assert!(sa2 + sb2 > sa + sb, "mending outpaces 1-damage hits");
    // Nacre nearly full: the rest of a second's mend goes to the hull.
    w.units.iter_mut().find(|u| u.id == b).unwrap().hp = d.hp; // (one patient)
    w.units.iter_mut().find(|u| u.id == b).unwrap().sh = TEST_SHIELDS;
    w.units.iter_mut().find(|u| u.id == a).unwrap().sh = TEST_SHIELDS - 2.0;
    run(&mut w, 1);
    let u = w.unit(a).unwrap();
    assert_eq!(u.sh, TEST_SHIELDS, "the nacre topped up");
    assert!(
        (u.hp - (hull + mend - 2.0)).abs() < 0.5,
        "then the hull: {} from {hull}",
        u.hp
    );
    // Left long enough, both are whole and no more.
    run(&mut w, 30);
    for u in [a, b] {
        let u = w.unit(u).unwrap();
        assert_eq!((u.hp, u.sh), (u.maxhp, u.maxsh), "full, never past it");
    }
}

#[test]
fn a_tender_mends_a_hull_only_ally_and_two_tenders_do_not_double_up() {
    // The Sellsword has no nacre: the Tender mends its hull, up to full and no further. Two Tenders by one
    // patient tend it one at a time (as two Medics do); a Human ally is tended too.
    let mut w = flat_arena(18);
    w.factions = vec![&VAEL, &HUMANS];
    let (x, y) = (30.0 * TILE, 30.0 * TILE);
    let mend = UnitKind::Halo.def().heal;
    let t1 = w.make_unit(UnitKind::Halo, PLAYER, x, y);
    let lens = w.make_unit(UnitKind::Prism, PLAYER, x + 40.0, y);
    for u in [t1, lens] {
        w.hold_unit(u);
    }
    assert_eq!(w.unit(lens).unwrap().maxsh, 0.0, "a Lens has no nacre");
    let maxhp = w.unit(lens).unwrap().maxhp;
    w.units.iter_mut().find(|u| u.id == lens).unwrap().hp = maxhp - 30.0;
    run(&mut w, 2);
    let hp = w.unit(lens).unwrap().hp;
    assert!(
        (hp - (maxhp - 30.0 + 2.0 * mend)).abs() < 1.0,
        "its hull mended at {mend}/s: {hp}"
    );
    run(&mut w, 10);
    assert_eq!(w.unit(lens).unwrap().hp, maxhp, "whole, never past it");
    // A second Tender: still one Tender's rate on the one patient.
    let t2 = w.make_unit(UnitKind::Halo, PLAYER, x + 80.0, y);
    w.hold_unit(t2);
    w.units.iter_mut().find(|u| u.id == lens).unwrap().hp = maxhp - 60.0;
    run(&mut w, 2);
    let gain = w.unit(lens).unwrap().hp - (maxhp - 60.0);
    assert!(
        (gain - 2.0 * mend).abs() < 1.0,
        "two Tenders do not double up: {gain} in 2 s"
    );
    // Any ally of its seat: a Picket beside it too.
    let p = w.make_unit(UnitKind::Trooper, PLAYER, x, y + 30.0);
    w.hold_unit(p);
    w.damage(p, 20.0, None);
    let php = w.unit(p).unwrap().hp;
    run(&mut w, 2);
    assert!(w.unit(p).unwrap().hp > php, "a Tender mends a Picket too");
    // Never the other side's (an unarmed one, alone with it: nobody fights).
    let mut w = flat_arena(18);
    w.factions = vec![&VAEL, &HUMANS];
    let t = w.make_unit(UnitKind::Halo, PLAYER, x, y);
    let foe = w.make_unit(UnitKind::Medic, ENEMY, x + 40.0, y);
    for u in [t, foe] {
        w.hold_unit(u);
    }
    w.damage(foe, 20.0, None);
    let fhp = w.unit(foe).unwrap().hp;
    run(&mut w, 2);
    assert_eq!(w.unit(foe).unwrap().hp, fhp, "not an enemy");
}

#[test]
fn shields_take_hits_first_and_come_back_out_of_combat() {
    let mut w = flat_arena(16);
    w.factions = vec![&VAEL, &HUMANS];
    let s = w.make_unit(UnitKind::Scythe, PLAYER, 30.0 * TILE, 30.0 * TILE);
    give_shields(&mut w, s, TEST_SHIELDS);
    w.hold_unit(s);
    let d = UnitKind::Scythe.def();
    // A hit smaller than the shields: all on the shields, at full value (armor does not apply to them).
    w.damage(s, 25.0, None);
    let u = w.unit(s).unwrap();
    assert_eq!(
        (u.hp, u.sh),
        (d.hp, TEST_SHIELDS - 25.0),
        "shields first, armor ignored"
    );
    // A hit bigger than what is left: the rest goes to the hull, minus armor.
    w.damage(s, 50.0, None);
    let u = w.unit(s).unwrap();
    assert_eq!(u.sh, 0.0);
    assert_eq!(
        u.hp,
        d.hp - (50.0 - (TEST_SHIELDS - 25.0) - d.armor),
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
    assert_eq!(u.sh, TEST_SHIELDS, "full again in about 6 + shields/3 s");
    assert_eq!(u.hp, hull, "the hull never heals by itself");
    // Without shields (every unit's since the re-theme): a hit is as it always was.
    let t = w.make_unit(UnitKind::Trooper, ENEMY, 36.0 * TILE, 30.0 * TILE);
    w.hold_unit(t);
    w.damage(t, 10.0, None);
    let d = UnitKind::Trooper.def();
    assert_eq!(w.unit(t).unwrap().hp, d.hp - (10.0 - d.armor));
    assert_eq!(w.unit(t).unwrap().maxsh, 0.0);
}

#[test]
fn nothing_has_shields_and_bots_repair_buildings_only() {
    // No shields since the re-theme (the mechanism stays, as data): no unit or building has any. A Bot repairs a
    // damaged building as a Villager does (the arc, Nov 13: an Uplink, say), and no machine: those are not repaired.
    for k in BLDG_KINDS {
        assert_eq!(k.def().shields, 0.0, "{k:?} has no shields");
    }
    for k in UNIT_KINDS {
        assert_eq!(k.def().shields, 0.0, "{k:?} has no shields");
    }
    let mut w = rich_vael(4242);
    w.upgrades[PLAYER as usize][Upgrade::Satellite.index()] = 1;
    let l = harvesters(&w, PLAYER);
    let uplink = build(&mut w, BldgKind::Uplink, l[0], 120);
    w.damage(uplink, 300.0, None);
    let b = w.bldg(uplink).unwrap();
    assert_eq!((b.sh, b.maxsh), (0.0, 0.0));
    let (hull, max) = (b.hp, b.maxhp);
    assert!(hull < max, "the hull took it");
    assert!(w.can_repair(l[1], uplink), "a Bot repairs an Uplink");
    let spent = w.ledger[PLAYER as usize].spent[0];
    assert!(w.start_repair(l[1], uplink));
    run(&mut w, 60);
    assert_eq!(w.bldg(uplink).unwrap().hp, max, "repaired in full");
    assert!(w.ledger[PLAYER as usize].spent[0] > spent, "at a price");
    // A machine is not repaired.
    let (x, y) = (w.unit(l[1]).unwrap().x, w.unit(l[1]).unwrap().y);
    let buggy = w.make_unit(UnitKind::Scythe, PLAYER, x + 40.0, y);
    w.damage(buggy, 30.0, None);
    assert!(!w.can_repair(l[1], buggy), "a Bot cannot repair a Buggy");
    assert!(!w.start_repair(l[1], buggy));
    // The Kingdom still repairs.
    let mut w = rich(4242);
    let h = harvesters(&w, PLAYER);
    let depot = build(&mut w, BldgKind::Depot, h[0], 90);
    w.damage(depot, 100.0, None);
    assert!(w.can_repair(h[1], depot));
}

#[test]
fn a_monolith_splashes_with_its_own_numbers() {
    let mut w = arena(16);
    w.factions = vec![&VAEL, &HUMANS];
    let d = UnitKind::Monolith.def();
    let wp = d.weapon.unwrap();
    assert_eq!((wp.splash, wp.splash_r), (0.6, 54.0));
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
    assert_eq!(
        start[1] - lost[1],
        wp.dmg * wp.splash,
        "its neighbour takes its splash share"
    );
}

#[test]
fn a_healer_on_attack_move_keeps_behind_the_fight() {
    // Before, an attack-moving Medic walked straight through while the soldiers stopped to fight, and arrived first.
    // (on open ground: seed 21's strip across the map from x 18 to 40 at y 27, 28)
    let mut w = arena(21);
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
    w.make_unit(UnitKind::Knight, ENEMY, 1600.0, 300.0);
    run(&mut w, 10);
    assert_eq!(w.army_log[1].last(), Some(&325), "a Knight: 325 gold");
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
        w.stop_unit(id); // (out of the mine first: inside, nothing hits it)
        w.damage(id, 1e9, None);
    }
    run(&mut w, 1);
    assert!(!w.over, "a fighter left: still in it");
    // A Barracks with the gold for a Guard keeps it going too; spent out, it does not (with the mines run dry, two
    // broke sides would never end).
    let rax = w.make_building(BldgKind::Barracks, PLAYER, 26, 40, true);
    w.res[PLAYER as usize] = [500, 0];
    w.damage(t, 1e9, None);
    run(&mut w, 1);
    assert!(!w.over, "a factory that can still train: still in it");
    assert_eq!(w.out_why[PLAYER as usize], OutWhy::In);
    w.res[PLAYER as usize] = [0, 0];
    w.damage(rax, 1e9, None);
    run(&mut w, 1);
    assert!(
        w.over && w.winner == ENEMY as i32,
        "nothing left that can act: over"
    );
    assert_eq!(
        w.out_why[PLAYER as usize],
        OutWhy::Helpless,
        "the end screen's words: nothing left to fight with, and no gold to train more"
    );
}

#[test]
fn an_ai_with_a_barracks_is_out_when_it_falls_or_at_once_without_the_gold_each_with_its_reason() {
    // The AI's Castle falls with a Barracks standing and no worker or fighter. With the gold for a Guard it stays in
    // until the Barracks falls too: its last building fell. Broke, it is out at once: nothing left to fight with, and
    // no gold to train more.
    for gold in [1000, 0] {
        let mut w = World::new(13, 1);
        w.disable_ai(); // (still an AI's seat, with no brain to rebuild)
        assert!(w.is_ai(ENEMY));
        for id in harvesters(&w, ENEMY) {
            w.stop_unit(id);
            w.damage(id, 1e9, None);
        }
        let (cx, cy) = core(&w, ENEMY);
        let bx = if cx > 10 { cx - 6 } else { cx + 6 };
        let rax = w.make_building(BldgKind::Barracks, ENEMY, bx, cy, true);
        let castle = w
            .bldgs
            .iter()
            .find(|b| b.team == ENEMY && b.kind.def().hq)
            .unwrap()
            .id;
        w.res[ENEMY as usize] = [gold, 0];
        w.damage(castle, 1e9, None);
        run(&mut w, 2);
        if gold > 0 {
            assert!(!w.over, "with gold: its Barracks keeps it in");
            w.damage(rax, 1e9, None);
            run(&mut w, 1);
            assert!(
                w.over && w.winner == PLAYER as i32,
                "its last building fell"
            );
            assert_eq!(w.out_why[ENEMY as usize], OutWhy::Buildings);
        } else {
            assert!(w.over && w.winner == PLAYER as i32, "broke: out at once");
            assert!(w.bldg(rax).is_some(), "its Barracks still standing");
            assert_eq!(w.out_why[ENEMY as usize], OutWhy::Helpless);
        }
        assert_eq!(w.out_why[PLAYER as usize], OutWhy::In);
    }
}

#[test]
fn the_end_screen_learns_what_killed_each_side() {
    // A Lancer kills a player's Trooper; a Turret kills another: each counted under its killer.
    let mut w = flat_arena(16);
    let lancer = w.make_unit(UnitKind::Lancer, ENEMY, 30.0 * TILE, 30.0 * TILE);
    let t1 = w.make_unit(UnitKind::Trooper, PLAYER, 32.0 * TILE, 30.0 * TILE);
    w.damage(t1, 1e6, Some(lancer));
    let turret = w.make_building(BldgKind::Turret, ENEMY, 40, 40, true);
    let t2 = w.make_unit(UnitKind::Trooper, PLAYER, 41.0 * TILE, 43.0 * TILE);
    w.damage(t2, 1e6, Some(turret));
    let row = &w.lost_to[PLAYER as usize];
    assert_eq!(row[UnitKind::Lancer.index()], 1);
    assert_eq!(row[UNIT_KINDS.len() + BldgKind::Turret.index()], 1);
    assert_eq!(row.iter().sum::<u32>(), 2);
    assert!(w.lost_to[ENEMY as usize].iter().all(|&n| n == 0));
}

#[test]
fn a_kill_by_a_shell_whose_shooter_died_still_counts() {
    let mut w = flat_arena(17);
    let vanguard = w.make_unit(UnitKind::Monolith, ENEMY, 26.0 * TILE, 30.0 * TILE);
    // (an unarmed Medic: the only rocket in the air is the Rover's)
    let t = w.make_unit(UnitKind::Medic, PLAYER, 30.0 * TILE, 30.0 * TILE);
    w.hold_unit(t);
    w.attack_ent(vanguard, t);
    // Until its first rocket is in the air, then the Rover dies; the Medic is one hit from death.
    for _ in 0..30 * 5 {
        w.step();
        if !w.projs.is_empty() {
            break;
        }
    }
    assert!(!w.projs.is_empty(), "a shell is in the air");
    w.damage(vanguard, 1e9, None);
    let o = w.units.iter_mut().find(|u| u.id == t).unwrap();
    o.hp = 1.0;
    run(&mut w, 3);
    assert!(w.unit(t).is_none(), "the shell killed it");
    assert_eq!(
        w.lost_to[PLAYER as usize][UnitKind::Monolith.index()],
        1,
        "counted under the Rover"
    );
}
