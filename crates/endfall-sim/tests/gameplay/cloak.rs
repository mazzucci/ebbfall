//! Cloak and detection: the Observer is unseen and untouchable except where the other side detects (a finished
//! Turret, a powered Ward, an Observer).

use super::common::*;

#[allow(non_snake_case)]
fn U(w: &World, id: Id) -> &Unit {
    w.unit(id).expect("unit")
}

/// The player's Lancer with an enemy Observer hovering beside it, by the player's base. Returns (lancer, observer).
fn lancer_and_observer(w: &mut World) -> (Id, Id) {
    let (tx, ty) = spot(w, BldgKind::Turret);
    let (x, y) = ((tx as f64 + 1.0) * TILE, (ty as f64 + 1.0) * TILE);
    let lancer = w.make_unit(UnitKind::Lancer, PLAYER, x, y);
    let obs = w.make_unit(UnitKind::Observer, ENEMY, x + 60.0, y);
    w.hold_unit(obs);
    w.step();
    (lancer, obs)
}

#[test]
fn an_observer_is_unseen_and_untouchable_until_detected() {
    let mut w = rich(13);
    let (lancer, obs) = lancer_and_observer(&mut w);
    let (otx, oty) = World::tile_of(U(&w, obs).x, U(&w, obs).y);
    assert!(
        w.vis[PLAYER as usize][endfall_sim::map::idx(otx, oty)] != 0,
        "its spot is in sight"
    );
    assert!(!w.seen_by(PLAYER, obs), "unseen: the cloak hides it");
    assert!(w.seen_by(ENEMY, obs), "its own side sees it");
    w.attack_ent(lancer, obs);
    assert!(
        !matches!(U(&w, lancer).task, Task::Attack { .. }),
        "an order to attack what is not there is refused"
    );
    run(&mut w, 4);
    assert_eq!(U(&w, obs).hp, U(&w, obs).maxhp, "nothing fires at it");
    // A Turret close by detects it: seen, and shot down.
    let (tx, ty) = (
        World::tile_of(U(&w, lancer).x, U(&w, lancer).y).0 - 3,
        World::tile_of(U(&w, lancer).x, U(&w, lancer).y).1,
    );
    w.make_building(BldgKind::Turret, PLAYER, tx, ty, true);
    w.step();
    assert!(w.seen_by(PLAYER, obs), "detected");
    run(&mut w, 6);
    assert!(w.unit(obs).is_none(), "shot down once detected");
}

#[test]
fn an_attack_on_a_cloaked_unit_ends_when_detection_does() {
    let mut w = rich(13);
    let (lancer, obs) = lancer_and_observer(&mut w);
    // The player's own Observer detects; the Lancer attacks; then that Observer is gone.
    let mine = w.make_unit(
        UnitKind::Observer,
        PLAYER,
        U(&w, lancer).x,
        U(&w, lancer).y - 40.0,
    );
    w.hold_unit(mine);
    let o = w.units.iter_mut().find(|u| u.id == obs).unwrap();
    (o.hp, o.maxhp) = (1e6, 1e6);
    w.step();
    assert!(w.seen_by(PLAYER, obs), "an Observer detects");
    w.attack_ent(lancer, obs);
    run(&mut w, 1);
    assert!(
        matches!(U(&w, lancer).task, Task::Attack { .. }),
        "attacking"
    );
    w.damage(mine, 1e6, None);
    run(&mut w, 1);
    assert!(
        !matches!(U(&w, lancer).task, Task::Attack { target, .. } if target == obs),
        "lost it"
    );
    let hp = U(&w, obs).hp;
    run(&mut w, 3);
    assert_eq!(U(&w, obs).hp, hp, "no more shots");
}

#[test]
fn a_ward_detects_only_while_powered() {
    let mut w = World::with_setup(13, 1, MapKind::Standard, false, [&VAEL, &HUMANS]);
    w.disable_ai();
    let (cx, cy) = core(&w, PLAYER);
    // Far from the Conflux's own field: a Spire and a Ward beside it.
    let (sx, sy) = (cx + if cx < 32 { 12 } else { -12 }, cy);
    let spire = w.make_building(BldgKind::Spire, PLAYER, sx, sy, true);
    let ward = w.make_building(BldgKind::Ward, PLAYER, sx + 3, sy, true);
    let obs = w.make_unit(
        UnitKind::Observer,
        ENEMY,
        (sx as f64 + 4.0) * TILE,
        (sy as f64 + 4.0) * TILE,
    );
    w.hold_unit(obs);
    run(&mut w, 1);
    assert!(w.bldg(ward).unwrap().powered);
    assert!(w.seen_by(PLAYER, obs), "a powered Ward detects");
    w.damage(spire, 1e6, None);
    run(&mut w, 1);
    assert!(!w.bldg(ward).unwrap().powered, "dark");
    assert!(!w.seen_by(PLAYER, obs), "a dark Ward detects nothing");
}

#[test]
fn a_researched_wasp_cloaks_for_a_while_and_a_detector_still_finds_it() {
    let mut w = flat_arena(14);
    let wasp = w.make_unit(UnitKind::Wasp, ENEMY, 30.0 * TILE, 30.0 * TILE);
    w.hold_unit(wasp);
    let o = w.units.iter_mut().find(|u| u.id == wasp).unwrap();
    (o.hp, o.maxhp) = (1e6, 1e6); // (it outlives being seen again)
    let lancer = w.make_unit(UnitKind::Lancer, PLAYER, 26.0 * TILE, 30.0 * TILE);
    w.hold_unit(lancer);
    assert_eq!(
        w.cast(wasp, AbilityKind::Cloak),
        Err("Research Cloaking Field first".into())
    );
    w.upgrades[ENEMY as usize][Upgrade::CloakingField.index()] = 1;
    w.cast(wasp, AbilityKind::Cloak).unwrap();
    w.step();
    assert!(!w.seen_by(PLAYER, wasp), "cloaked");
    let hp = U(&w, wasp).hp;
    run(&mut w, 5);
    assert_eq!(
        U(&w, wasp).hp,
        hp,
        "the Lancer cannot shoot what it cannot see"
    );
    run(&mut w, 8);
    assert!(w.seen_by(PLAYER, wasp), "visible again after 12 s");
    run(&mut w, 2);
    assert!(U(&w, wasp).hp < hp, "and shot once visible");
    // Cloaked again later (after its cooldown), but a Turret beside it detects it.
    run(&mut w, 30);
    w.cast(wasp, AbilityKind::Cloak).unwrap();
    w.make_building(BldgKind::Turret, PLAYER, 27, 32, true);
    w.step();
    assert!(w.seen_by(PLAYER, wasp), "detected");
}

#[test]
fn the_ai_cloaks_a_wasp_only_against_anti_air_and_not_where_it_is_detected() {
    // An AI Wasp attacking a building: it cloaks with a Lancer near, not with only a Vanguard near (it cannot hit
    // air), and not beside a detecting Turret (no point).
    let scene = |foe: UnitKind, turret: bool| {
        let mut w = flat_arena(15);
        w.upgrades[ENEMY as usize][Upgrade::CloakingField.index()] = 1;
        let depot = w.make_building(BldgKind::Depot, PLAYER, 30, 30, true);
        let wasp = w.make_unit(UnitKind::Wasp, ENEMY, 33.0 * TILE, 31.0 * TILE);
        w.attack_ent(wasp, depot);
        let f = w.make_unit(foe, PLAYER, 26.0 * TILE, 31.0 * TILE);
        w.hold_unit(f);
        if turret {
            w.make_building(BldgKind::Turret, PLAYER, 34, 28, true);
        }
        w.step();
        w.auto_cast(ENEMY);
        U(&w, wasp).boost.is_some()
    };
    assert!(scene(UnitKind::Lancer, false), "cloaks against a Lancer");
    assert!(
        !scene(UnitKind::Vanguard, false),
        "not against what cannot hit air"
    );
    assert!(!scene(UnitKind::Lancer, true), "not beside a detector");
}

#[test]
fn the_ai_puts_a_detector_where_something_unseen_hit_it() {
    // A cloaked Wasp of the player's shoots at the AI's harvesters before the AI's first scheduled Turret (4:00): the
    // AI raises one by them anyway, which finds the Wasp and shoots it.
    let mut w = World::new(31, 1);
    run(&mut w, 140);
    let h = harvesters(&w, ENEMY)[0];
    let (hx, hy) = (U(&w, h).x, U(&w, h).y);
    let wasp = w.make_unit(UnitKind::Wasp, PLAYER, hx + 40.0, hy);
    let o = w.units.iter_mut().find(|u| u.id == wasp).unwrap();
    (o.hp, o.maxhp) = (1e9, 1e9);
    w.upgrades[PLAYER as usize][Upgrade::CloakingField.index()] = 1;
    let turrets = |w: &World| {
        w.bldgs
            .iter()
            .filter(|b| b.team == ENEMY && b.kind == BldgKind::Turret)
            .count()
    };
    assert_eq!(turrets(&w), 0, "no Turret yet");
    for _ in 0..90 {
        // (it re-cloaks whenever it can, and keeps shooting at a harvester near where it started)
        let _ = w.cast(wasp, AbilityKind::Cloak);
        if let Some(t) = harvesters(&w, ENEMY).into_iter().find(|&t| {
            let u = U(&w, t);
            ((u.x - hx).powi(2) + (u.y - hy).powi(2)).sqrt() < 6.0 * TILE
        }) {
            w.attack_ent(wasp, t);
        }
        run(&mut w, 1);
    }
    assert!(w.time < 240.0, "still before the scheduled Turret");
    assert!(turrets(&w) >= 1, "the AI raised a Turret");
    assert!(U(&w, wasp).hp < 1e9, "which found the Wasp and shot it");
}
