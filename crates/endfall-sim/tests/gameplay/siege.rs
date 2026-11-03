//! The Siege Tank: it fires only deployed (its toggle, `Deploy`), from past its own sight on what its side sees, never
//! at what is inside its blind ring; it deploys by itself on reaching a target and packs up to move.

use super::common::*;
use endfall_sim::world::Event;

/// Shots fired from where `shooter` stands over `secs`, by gun: (light gun, siege gun), told apart by their sound.
fn guns(w: &mut World, shooter: Id, secs: u32) -> (usize, usize) {
    let (mut light, mut siege) = (0, 0);
    for _ in 0..secs * TPS {
        let sx = w.unit(shooter).map_or(f64::NAN, |u| u.x);
        w.step();
        for e in w.events.drain(..) {
            if let Event::Fire { x, weapon, .. } = e
                && (x - sx).abs() < 1.0
            {
                match weapon {
                    "bolt" => light += 1,
                    _ => siege += 1,
                }
            }
        }
    }
    (light, siege)
}

/// Shells fired from where `shooter` stands over `secs`.
fn shells(w: &mut World, shooter: Id, secs: u32) -> usize {
    let mut n = 0;
    for _ in 0..secs * TPS {
        let sx = w.unit(shooter).map_or(f64::NAN, |u| u.x);
        w.step();
        for e in w.events.drain(..) {
            if let Event::Fire { x, .. } = e
                && (x - sx).abs() < 1.0
            {
                n += 1;
            }
        }
    }
    n
}

/// A tank of the player's at (30, 30) tiles on flat ground, and a sturdy enemy that holds `dx` tiles east of it.
fn tank_scene(dx: f64) -> (World, Id, Id) {
    let mut w = tech_arena(5);
    let tank = w.make_unit(UnitKind::SiegeTank, PLAYER, 30.0 * TILE, 30.0 * TILE);
    let foe = w.make_unit(UnitKind::Vanguard, ENEMY, (30.0 + dx) * TILE, 30.0 * TILE);
    set_hp(&mut w, foe, 1e6);
    w.hold_unit(foe);
    w.update_fog();
    (w, tank, foe)
}

fn deployed(w: &World, u: Id) -> bool {
    w.unit(u)
        .is_some_and(|u| u.mode == Some(AbilityKind::Deploy) && u.swap == 0.0)
}

#[test]
fn a_tank_that_stops_deploys_by_itself_and_a_move_packs_it_up() {
    // Deploying is the tank's own doing (owner, 2026-11-03: no button): stopped, it sets up (3 s, not firing
    // meanwhile), then shells an enemy at 8 tiles (past every other ground weapon's reach, inside its 11). An order
    // to move packs it up first (3 s), then it drives; where it stops, it sets up again.
    let (mut w, tank, _) = tank_scene(8.0);
    w.hold_unit(tank);
    assert_eq!(shells(&mut w, tank, 2), 0, "settling in (3 s)");
    assert!(shells(&mut w, tank, 6) >= 2, "then it shells (every 2.8 s)");
    assert!(deployed(&w, tank));
    let x0 = w.unit(tank).unwrap().x;
    w.move_to(tank, 20.0 * TILE, 30.0 * TILE);
    let u = w.unit(tank).unwrap();
    assert!(
        u.mode.is_none() && u.swap > 0.0,
        "packing up: {:?} {}",
        u.mode,
        u.swap
    );
    run(&mut w, 2);
    assert_eq!(w.unit(tank).unwrap().x, x0, "not while packing up");
    run(&mut w, 3);
    assert!(w.unit(tank).unwrap().x < x0 - TILE, "then on its way");
    run(&mut w, 10);
    let u = w.unit(tank).unwrap();
    assert!(
        (u.x - 20.0 * TILE).abs() < TILE && deployed(&w, tank),
        "arrived and set up again: at {:.1}, {:?}",
        u.x / TILE,
        u.mode
    );
}

#[test]
fn deploying_is_never_an_order() {
    // A player's (or anyone's) order to deploy is refused: the tank does it by itself.
    let (mut w, tank, _) = tank_scene(8.0);
    w.move_to(tank, 20.0 * TILE, 30.0 * TILE);
    assert!(w.cast_group(&[tank], AbilityKind::Deploy).is_err());
    assert!(w.unit(tank).unwrap().mode.is_none(), "still on its tracks");
}

#[test]
fn every_tank_that_stops_deploys_the_computers_too() {
    // On every level the AI's tanks follow the same rule: one left standing sets up by itself.
    for diff in 0..4 {
        let mut w = World::new(9, diff);
        let b = w.map.bases[ENEMY as usize];
        let tank = w.make_unit(
            UnitKind::SiegeTank,
            ENEMY,
            (b.0 as f64 + 8.0) * TILE,
            (b.1 as f64 + 8.0) * TILE,
        );
        for _ in 0..5 * TPS {
            w.step();
            w.events.clear();
        }
        let u = w.unit(tank).unwrap();
        assert!(
            u.mode == Some(AbilityKind::Deploy) || !matches!(u.task, Task::Idle | Task::Hold),
            "diff {diff}: a standing tank sets up ({:?}, {:?})",
            u.task,
            u.mode
        );
    }
}

#[test]
fn nothing_inside_its_blind_ring_can_be_hit() {
    // 2 tiles (edge to edge less than its 2.5): never; 4 tiles: yes.
    let (mut w, tank, foe) = tank_scene(2.0 + (14.0 + 14.0) / TILE);
    w.cast(tank, AbilityKind::Deploy).unwrap();
    assert_eq!(shells(&mut w, tank, 10), 0, "inside the blind ring");
    let hp = w.unit(foe).unwrap().hp;
    assert_eq!(hp, 1e6, "untouched");
    let (mut w, tank, _) = tank_scene(4.0 + (14.0 + 14.0) / TILE);
    w.cast(tank, AbilityKind::Deploy).unwrap();
    assert!(shells(&mut w, tank, 10) >= 2, "outside it");
    // On its tracks, sent at a target inside the ring, it does not set up for nothing: its light gun fights it.
    let (mut w, tank, foe) = tank_scene(1.5);
    w.attack_ent(tank, foe);
    let fired = guns(&mut w, tank, 4);
    let u = w.unit(tank).unwrap();
    assert!(
        u.mode.is_none() && matches!(u.task, Task::Attack { .. }),
        "{:?} {:?}",
        u.mode,
        u.task
    );
    assert!(fired.0 >= 2 && fired.1 == 0, "the light gun: {fired:?}");
}

#[test]
fn it_reaches_past_its_own_sight_only_on_what_its_side_sees() {
    // A target 10.5 tiles off (its sight is 10, its reach 11): unseen, no shell; with an ally looking, shelled.
    let (mut w, tank, foe) = tank_scene(10.5 + (14.0 + 14.0) / TILE);
    w.cast(tank, AbilityKind::Deploy).unwrap();
    assert!(!w.seen_by(PLAYER, foe), "out of its own sight");
    assert_eq!(
        shells(&mut w, tank, 8),
        0,
        "it never fires at what its side cannot see"
    );
    let spotter = w.make_unit(UnitKind::Observer, PLAYER, 36.0 * TILE, 30.0 * TILE);
    w.hold_unit(spotter);
    assert!(shells(&mut w, tank, 8) >= 2, "a spotter's sight is enough");
    assert_eq!(w.unit(tank).unwrap().face, 0.0, "facing its target, east");
}

#[test]
fn sent_at_a_target_it_drives_into_reach_deploys_and_shells_it() {
    // A Turret (reach 7) seen from 10 tiles: the tank stops in its own reach, out of the Turret's, and wins untouched.
    let mut w = tech_arena(6);
    let turret = w.make_building(BldgKind::Turret, ENEMY, 44, 30, true);
    let tank = w.make_unit(UnitKind::SiegeTank, PLAYER, 20.0 * TILE, 31.0 * TILE);
    w.update_fog();
    w.attack_ent(tank, turret);
    for _ in 0..60 * TPS {
        w.step();
        if w.bldg(turret).is_none() {
            break;
        }
    }
    assert!(w.bldg(turret).is_none(), "the Turret fell");
    let u = w.unit(tank).unwrap();
    assert_eq!(u.hp, u.maxhp, "never in the Turret's reach");
    assert_eq!(u.mode, Some(AbilityKind::Deploy), "it set up to fire");
    assert!(
        (44.0 * TILE - u.x) > 8.0 * TILE,
        "from out of the Turret's reach: {:.1} tiles",
        (44.0 * TILE - u.x) / TILE
    );
}

#[test]
fn on_an_attack_move_it_sets_up_for_what_it_meets_then_goes_on_and_sets_up_where_it_stops() {
    let mut w = tech_arena(7);
    let tank = w.make_unit(UnitKind::SiegeTank, PLAYER, 16.0 * TILE, 30.0 * TILE);
    let foe = w.make_unit(UnitKind::Medic, ENEMY, 30.0 * TILE, 30.0 * TILE);
    w.hold_unit(foe);
    w.update_fog();
    w.attack_move(tank, 46.0 * TILE, 30.0 * TILE);
    let mut set_up = false;
    for _ in 0..40 * TPS {
        w.step();
        set_up |= deployed(&w, tank);
    }
    assert!(set_up, "it deployed for the Medic");
    assert!(w.unit(foe).is_none(), "and shelled it");
    let u = w.unit(tank).unwrap();
    assert!(
        u.x > 40.0 * TILE,
        "then packed up and went on: at {:.1}",
        u.x / TILE
    );
    assert!(deployed(&w, tank), "and set up again where it stopped");
}

#[test]
fn a_deployed_tank_stands_firm_and_takes_the_next_target_in_reach() {
    let (mut w, tank, foe) = tank_scene(6.0);
    let foe2 = w.make_unit(UnitKind::Medic, ENEMY, 37.0 * TILE, 33.0 * TILE);
    w.hold_unit(foe2);
    w.update_fog();
    w.attack_ent(tank, foe);
    run(&mut w, 4);
    assert!(deployed(&w, tank), "set up where it stood (in reach)");
    let (x0, y0) = (w.unit(tank).unwrap().x, w.unit(tank).unwrap().y);
    // Friends walking through do not shove it.
    for i in 0..4 {
        let t = w.make_unit(UnitKind::Trooper, PLAYER, x0 - 60.0, y0 + i as f64 * 6.0);
        w.move_to(t, x0 + 80.0, y0);
    }
    set_hp(&mut w, foe, 1.0);
    run(&mut w, 12);
    assert!(
        w.unit(foe).is_none() && w.unit(foe2).is_none(),
        "both shelled"
    );
    let u = w.unit(tank).unwrap();
    assert_eq!((u.x, u.y), (x0, y0), "it never moved");
    assert!(deployed(&w, tank), "an order to attack: it stays set up");
}

#[test]
fn the_ai_builds_a_factory_and_fields_siege_tanks_later_on() {
    // Its Factory once the Foundry stands; Vanguards from it, and from 5:30 a Siege Tank per six Troopers.
    let mut w = World::new(9, 2);
    let b = w.map.bases[ENEMY as usize];
    w.make_building(BldgKind::Forge, ENEMY, b.0 + 6, b.1 - 1, true);
    w.make_building(BldgKind::Barracks, ENEMY, b.0 - 4, b.1 + 6, true);
    let home = w.bldgs.iter_mut().find(|b| b.team == PLAYER).unwrap();
    (home.hp, home.maxhp) = (1e9, 1e9); // (the player's base stands: the game goes on)
    let mut factory_at = None;
    while w.time < 450.0 {
        w.res[ENEMY as usize] = [3000, 1000];
        w.step();
        w.events.clear();
        if factory_at.is_none()
            && w.bldgs
                .iter()
                .any(|b| b.team == ENEMY && b.kind == BldgKind::Factory)
        {
            factory_at = Some(w.time);
        }
    }
    let at = factory_at.expect("a Factory");
    assert!(at < 120.0, "soon after its tech stands: {at:.0} s");
    assert!(count(&w, ENEMY, UnitKind::Vanguard) >= 1, "Vanguards");
    assert!(count(&w, ENEMY, UnitKind::SiegeTank) >= 1, "Siege Tanks");
}

#[test]
fn sent_at_a_target_inside_its_blind_ring_a_deployed_tank_holds() {
    // Packing up would be for nothing (it would give the target up once packed): it stays set up and holds.
    let (mut w, tank, _) = tank_scene(8.0);
    w.cast(tank, AbilityKind::Deploy).unwrap();
    run(&mut w, 4);
    let near = w.make_unit(UnitKind::Medic, ENEMY, 31.5 * TILE, 30.0 * TILE);
    w.update_fog();
    w.attack_ent(tank, near);
    let u = w.unit(tank).unwrap();
    assert_eq!(
        (u.mode, u.swap, u.task),
        (Some(AbilityKind::Deploy), 0.0, Task::Hold),
        "still deployed, holding"
    );
    assert!(
        shells(&mut w, tank, 6) >= 1,
        "and shelling what it can reach"
    );
}

#[test]
fn on_its_tracks_it_has_only_a_light_gun_and_deployed_only_the_siege_gun() {
    // On its tracks (sent at an enemy inside its blind ring, it fights it there rather than set up for nothing):
    // the light gun. Then an enemy 5 tiles off, past its 2.5-tile ring: deployed, the siege gun only.
    let (mut w, tank, foe) = tank_scene(1.5);
    set_hp(&mut w, tank, 1e6); // (the Vanguard reaches it too)
    w.attack_ent(tank, foe);
    let (light, siege) = guns(&mut w, tank, 6);
    assert!(
        light >= 4 && siege == 0,
        "on its tracks, the light gun ({light}, {siege})"
    );
    let hit = 1e6 - w.unit(foe).unwrap().hp;
    let per_shot = hit / light as f64;
    assert!(per_shot < 15.0, "light: {per_shot:.1} a shot");
    let (mut w, tank, _) = tank_scene(5.0);
    set_hp(&mut w, tank, 1e6);
    w.cast(tank, AbilityKind::Deploy).unwrap();
    let (light, siege) = guns(&mut w, tank, 10);
    assert!(
        light == 0 && siege >= 2,
        "deployed, the siege gun only ({light}, {siege})"
    );
    // Light and clearly second: less than two thirds of a Vanguard's damage a second, and no splash.
    let l = UnitKind::SiegeTank.def().light.unwrap();
    let v = UnitKind::Vanguard.def().weapon.unwrap();
    assert!(
        l.dmg / l.cd < v.dmg / v.cd * 0.67 && l.splash == 0.0 && !l.siege && l.min_range == 0.0
    );
    assert!(l.dmg_air == 0.0, "ground only");
}

#[test]
fn an_idle_tank_deploys_where_it_stands_and_is_free_again_once_its_target_is_gone() {
    // A player's tank left standing (idle, not holding) sets up by itself. Sent at a target, it deploys, shells it and,
    // with it gone, is idle again (deployed): free for the next order, an AI's regroup or sweep among them (they take only
    // idle units), not left holding.
    let (mut w, tank, foe) = tank_scene(8.0);
    run(&mut w, 4);
    assert!(deployed(&w, tank), "idle, it set up by itself");
    set_hp(&mut w, foe, 1.0);
    w.attack_ent(tank, foe);
    run(&mut w, 6);
    assert!(w.unit(foe).is_none(), "shelled");
    let u = w.unit(tank).unwrap();
    assert_eq!(
        (u.task, u.mode),
        (Task::Idle, Some(AbilityKind::Deploy)),
        "idle and still deployed"
    );
}
