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
    let (otx, oty) = w.map.tile_of(U(&w, obs).x, U(&w, obs).y);
    assert!(
        w.vis[PLAYER as usize][w.map.idx(otx, oty)] != 0,
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
        w.map.tile_of(U(&w, lancer).x, U(&w, lancer).y).0 - 3,
        w.map.tile_of(U(&w, lancer).x, U(&w, lancer).y).1,
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
fn a_researched_cloak_is_permanent_and_only_a_detector_finds_it() {
    // The Raider's Cloak (Cloaking Field) and the Shrike's Veil (Veil Weave): no button and no timer (owner,
    // 2026-11-03): once its side has the tech the unit is always cloaked; a detector beside it still finds it.
    for (kind, tech, side) in [
        (UnitKind::Raider, Upgrade::CloakingField, "Raider"),
        (UnitKind::Shrike, Upgrade::VeilWeave, "Shrike"),
    ] {
        let mut w = flat_arena(14);
        let flyer = w.make_unit(kind, ENEMY, 30.0 * TILE, 30.0 * TILE);
        w.hold_unit(flyer);
        let o = w.units.iter_mut().find(|u| u.id == flyer).unwrap();
        (o.hp, o.maxhp) = (1e6, 1e6);
        let lancer = w.make_unit(UnitKind::Lancer, PLAYER, 26.0 * TILE, 30.0 * TILE);
        w.hold_unit(lancer);
        w.step();
        assert!(w.seen_by(PLAYER, flyer), "{side}: seen before its tech");
        let ab = kind.def().abilities[0];
        assert!(w.cast(flyer, ab).is_err(), "{side}: never cast");
        w.upgrades[ENEMY as usize][tech.index()] = 1;
        w.step();
        assert!(!w.seen_by(PLAYER, flyer), "{side}: cloaked once researched");
        run(&mut w, 1); // (a missile already on its way still lands)
        let hp = U(&w, flyer).hp;
        run(&mut w, 20);
        assert!(
            !w.seen_by(PLAYER, flyer),
            "{side}: still cloaked 20 s on (no timer)"
        );
        assert_eq!(
            U(&w, flyer).hp,
            hp,
            "{side}: the Lancer cannot shoot what it cannot see"
        );
        w.make_building(BldgKind::Turret, PLAYER, 27, 32, true);
        w.step();
        assert!(
            w.seen_by(PLAYER, flyer),
            "{side}: a detector beside it finds it"
        );
    }
}

#[test]
fn the_ai_puts_a_detector_where_something_unseen_hit_it() {
    // A cloaked Raider of the player's shoots at the AI's harvesters: the AI puts a Turret up by them, nearer the hit
    // than its own schedule (the first from 2:30) puts one. Checked against the same minute played without the Raider
    // (8.2 tiles from the hit against 10.9 for the scheduled one). (This Raider cannot die and shoots whoever comes
    // near, builders included, so the decision is what is checked, not the finished tower.)
    let mut w = World::new(31, 1);
    // (after its Foundry and its second vent's Rig stand, as it raises two sites at a time; and a Turret's price in
    // the bank, which that vent's new crew has just spent)
    run(&mut w, 175);
    w.res[ENEMY as usize][0] += BldgKind::Turret.def().cost[0];
    let h = harvesters(&w, ENEMY)[0];
    let (hx, hy) = (U(&w, h).x, U(&w, h).y);
    // (the same world, played the same way: the sim is deterministic)
    let mut quiet = World::new(31, 1);
    run(&mut quiet, 175);
    quiet.res[ENEMY as usize][0] += BldgKind::Turret.def().cost[0];
    let raider = w.make_unit(UnitKind::Raider, PLAYER, hx + 40.0, hy);
    let o = w.units.iter_mut().find(|u| u.id == raider).unwrap();
    (o.hp, o.maxhp) = (1e9, 1e9);
    w.upgrades[PLAYER as usize][Upgrade::CloakingField.index()] = 1;
    // (the nearest Turret to the hit, in tiles; none: infinitely far)
    let nearest = |w: &World| {
        w.bldgs
            .iter()
            .filter(|b| b.team == ENEMY && b.kind == BldgKind::Turret)
            .map(|b| ((b.x - hx).powi(2) + (b.y - hy).powi(2)).sqrt() / TILE)
            .fold(f64::INFINITY, f64::min)
    };
    assert_eq!(nearest(&w), f64::INFINITY, "no Turret yet");
    for _ in 0..60 {
        // (cloaked for good, it keeps shooting at a harvester near where it started)
        // (a miner: its workers now run from what hits them, and the one building the tower is not the target)
        if let Some(t) = harvesters(&w, ENEMY).into_iter().find(|&t| {
            let u = U(&w, t);
            matches!(u.task, Task::Gather { .. })
                && ((u.x - hx).powi(2) + (u.y - hy).powi(2)).sqrt() < 6.0 * TILE
        }) {
            w.attack_ent(raider, t);
        }
        run(&mut w, 1);
    }
    for _ in 0..60 {
        run(&mut quiet, 1);
    }
    let (hit, unhit) = (nearest(&w), nearest(&quiet));
    assert!(
        hit < 10.0 && hit < unhit,
        "a Turret by the hit ({hit:.1} tiles), nearer than the schedule's ({unhit:.1})"
    );
}

#[test]
fn an_unseen_hit_far_from_home_raises_no_tower_there_and_the_build_order_goes_on() {
    // An AI Trooper shot by a cloaked Raider out by the player's base: no tower out there, and the AI keeps building.
    let mut w = World::new(31, 1);
    run(&mut w, 140);
    let (px, py) = core(&w, PLAYER);
    let (x, y) = ((px as f64 + 2.0) * TILE + 200.0, (py as f64 + 2.0) * TILE);
    let t = w.make_unit(UnitKind::Trooper, ENEMY, x, y);
    w.hold_unit(t);
    let raider = w.make_unit(UnitKind::Raider, PLAYER, x + 40.0, y);
    let o = w.units.iter_mut().find(|u| u.id == raider).unwrap();
    (o.hp, o.maxhp) = (1e9, 1e9);
    w.upgrades[PLAYER as usize][Upgrade::CloakingField.index()] = 1;
    let built = w.bldgs.iter().filter(|b| b.team == ENEMY).count();
    for _ in 0..60 {
        if w.unit(t).is_some() {
            w.attack_ent(raider, t);
        }
        run(&mut w, 1);
    }
    let far = w
        .bldgs
        .iter()
        .any(|b| b.team == ENEMY && ((b.x - x).powi(2) + (b.y - y).powi(2)).sqrt() < 15.0 * TILE);
    assert!(!far, "no AI building out by the player's base");
    assert!(
        w.bldgs.iter().filter(|b| b.team == ENEMY).count() > built,
        "its build order went on"
    );
}

#[test]
fn an_attack_by_something_unseen_is_told_once_in_a_while() {
    // A cloaked Raider shooting a Trooper: the player's alert says the attacker is unseen, once (not every hit); once it
    // shows (or a detector finds it), the alerts are ordinary ones.
    let mut w = flat_arena(14);
    let raider = w.make_unit(UnitKind::Raider, ENEMY, 30.0 * TILE, 30.0 * TILE);
    let trooper = w.make_unit(UnitKind::Trooper, PLAYER, 32.0 * TILE, 30.0 * TILE);
    for id in [raider, trooper] {
        let u = w.units.iter_mut().find(|u| u.id == id).unwrap();
        (u.hp, u.maxhp) = (1e6, 1e6); // (both outlive the test)
    }
    w.hold_unit(trooper);
    w.upgrades[ENEMY as usize][Upgrade::CloakingField.index()] = 1;
    let alerts = |w: &mut World, secs: u32| {
        let (mut unseen, mut seen) = (0, 0);
        for _ in 0..secs * TPS {
            w.step();
            for e in w.events.drain(..) {
                if let endfall_sim::world::Event::Attacked {
                    team: PLAYER,
                    unseen: u,
                    ..
                } = e
                {
                    if u { unseen += 1 } else { seen += 1 }
                }
            }
        }
        (unseen, seen)
    };
    let (unseen, seen) = alerts(&mut w, 11);
    assert!(U(&w, trooper).hp < 1e6, "the cloaked Raider shoots");
    assert_eq!((unseen, seen), (1, 0), "one unseen alert, not one a hit");
    let (unseen, _) = alerts(&mut w, 15);
    assert_eq!(unseen, 0, "not again within the gap");
    let (unseen, _) = alerts(&mut w, 10);
    assert_eq!(unseen, 1, "told again once the gap is past");
    // A Turret beside the Trooper detects it: an ordinary fight.
    w.make_building(BldgKind::Turret, PLAYER, 31, 32, true);
    alerts(&mut w, 1); // (its sight and detection from the next tick)
    let (unseen, _) = alerts(&mut w, 40);
    assert_eq!(unseen, 0, "detected: nothing unseen");
}

#[test]
fn a_halo_detects_cloaked_units_near_it() {
    // The Vael's detector in the field (2026-10-31): a Halo reveals what is cloaked within 5 tiles of it, as an
    // Observer does within 7; farther off, though in its sight, the cloak holds.
    let mut w = flat_arena(14);
    w.factions = vec![&VAEL, &HUMANS];
    let (x, y) = (30.0 * TILE, 30.0 * TILE);
    let halo = w.make_unit(UnitKind::Halo, PLAYER, x, y);
    let near = w.make_unit(UnitKind::Observer, ENEMY, x + 3.0 * TILE, y);
    let far = w.make_unit(UnitKind::Observer, ENEMY, x - 8.0 * TILE, y);
    for u in [halo, near, far] {
        w.hold_unit(u);
    }
    w.step();
    let (ftx, fty) = w.map.tile_of(U(&w, far).x, U(&w, far).y);
    assert!(
        w.vis[PLAYER as usize][w.map.idx(ftx, fty)] != 0,
        "the far one is in sight"
    );
    assert!(w.seen_by(PLAYER, near), "detected within 5 tiles");
    assert!(!w.seen_by(PLAYER, far), "not 8 tiles off");
    // And it is a detector like the others to the rest of the game: what the client's unseen-attacker toast names.
    assert_eq!(VAEL.field_detector(), Some(UnitKind::Halo));
    assert_eq!(HUMANS.field_detector(), Some(UnitKind::Observer));
}

#[test]
fn an_umbra_is_always_cloaked_strikes_unseen_and_is_struck_where_detected() {
    // The Vael's shadow blade carries the Observer's permanent cloak on a fighter: Troopers can neither see nor shoot
    // it while it cuts them down, and the hit is told as an unseen one. An Observer over them reveals it: it is shot.
    let mut w = flat_arena(14);
    w.factions = vec![&HUMANS, &VAEL];
    let (x, y) = (30.0 * TILE, 30.0 * TILE);
    let trooper = w.make_unit(UnitKind::Trooper, PLAYER, x, y);
    w.hold_unit(trooper);
    let umbra = w.make_unit(UnitKind::Umbra, ENEMY, x + 3.0 * TILE, y);
    w.step();
    assert!(w.is_cloaked(U(&w, umbra)), "cloaked with no ability");
    assert!(!w.seen_by(PLAYER, umbra), "unseen in plain sight");
    w.attack_ent(trooper, umbra);
    assert!(
        !matches!(U(&w, trooper).task, Task::Attack { .. }),
        "an order to attack it is refused"
    );
    w.attack_ent(umbra, trooper);
    let mut unseen = 0;
    for _ in 0..8 * TPS {
        w.step();
        for e in w.events.drain(..) {
            if let endfall_sim::world::Event::Attacked {
                team: PLAYER,
                unseen: true,
                ..
            } = e
            {
                unseen += 1;
            }
        }
    }
    assert!(w.unit(trooper).is_none(), "the Trooper fell");
    assert_eq!(unseen, 1, "told once that something unseen attacks");
    let u = U(&w, umbra);
    assert_eq!((u.hp, u.sh), (u.maxhp, u.maxsh), "untouched");
    // Four Troopers with an Observer over them: detected, and shot as it closes in.
    let troopers: Vec<Id> = (0..4)
        .map(|k| w.make_unit(UnitKind::Trooper, PLAYER, x, y + (k as f64 - 1.5) * 20.0))
        .collect();
    let obs = w.make_unit(UnitKind::Observer, PLAYER, x, y);
    w.hold_unit(obs);
    w.step();
    assert!(w.seen_by(PLAYER, umbra), "an Observer detects it");
    w.attack_ent(umbra, troopers[0]);
    run(&mut w, 6);
    assert!(
        w.unit(umbra).is_none_or(|u| u.sh < u.maxsh),
        "detected, it is shot"
    );
}

#[test]
fn a_mend_on_an_undetected_cloaked_unit_is_not_shown_to_the_enemy() {
    // A Halo mends an Umbra's shields in the player's sight: the Halo is seen, the Umbra is not, so the mend's
    // light (which runs from one to the other) is not shown to the player; once an Observer detects the Umbra, it is.
    let mut w = flat_arena(14);
    w.factions = vec![&HUMANS, &VAEL];
    let (x, y) = (30.0 * TILE, 30.0 * TILE);
    let trooper = w.make_unit(UnitKind::Trooper, PLAYER, x - 6.5 * TILE, y);
    let halo = w.make_unit(UnitKind::Halo, ENEMY, x, y + TILE);
    let umbra = w.make_unit(UnitKind::Umbra, ENEMY, x, y);
    for u in [trooper, halo, umbra] {
        w.hold_unit(u);
    }
    let mends = |w: &mut World, secs: u32| -> Vec<u8> {
        w.units.iter_mut().find(|u| u.id == umbra).unwrap().sh = 0.0;
        let mut seen = Vec::new();
        for _ in 0..secs * TPS {
            w.step();
            for e in w.events.drain(..) {
                if let endfall_sim::world::Event::Heal { seen: s, .. } = e {
                    seen.push(s);
                }
            }
        }
        seen
    };
    let seen = mends(&mut w, 2);
    assert!(w.seen_by(PLAYER, halo) && !w.seen_by(PLAYER, umbra));
    assert!(!seen.is_empty(), "the Halo mends the Umbra");
    assert!(
        seen.iter()
            .all(|s| s & 1 << PLAYER == 0 && s & 1 << ENEMY != 0),
        "its own side sees the mend, the player does not: {seen:?}"
    );
    let obs = w.make_unit(UnitKind::Observer, PLAYER, x - 2.0 * TILE, y);
    w.hold_unit(obs);
    let seen = mends(&mut w, 2);
    assert!(
        seen.iter().any(|s| s & 1 << PLAYER != 0),
        "detected: the mend shows ({seen:?})"
    );
}

/// Permanent cloaks and balance: Humans against Vael, AI on both sides (Medium and Hard, ten seeds, both starts):
/// the games each race wins by 25:00, and how many games a cloak tech was researched in.
#[test]
#[ignore]
fn permanent_cloak_balance_probe() {
    // `cargo test --release --test gameplay permanent_cloak_balance_probe -- --ignored --nocapture`
    for diff in [1usize, 2] {
        let (mut wins, mut games, mut cloaks) = ([0u32; 2], 0, [0u32; 2]);
        for seed in 1..=10u32 {
            for flip in [false, true] {
                let races: [&Faction; 2] = if flip {
                    [&VAEL, &HUMANS]
                } else {
                    [&HUMANS, &VAEL]
                };
                let vael = if flip { 0 } else { 1 };
                let mut w = World::with_setup(seed, diff, MapKind::Standard, false, races);
                w.set_ai_seats([true, true]);
                while w.time < 25.0 * 60.0 && w.winner < 0 {
                    w.step();
                    w.events.clear();
                }
                games += 1;
                if w.winner >= 0 {
                    wins[(w.winner as usize == vael) as usize] += 1;
                }
                cloaks[0] += (w.upgrades[1 - vael][Upgrade::CloakingField.index()] > 0) as u32;
                cloaks[1] += (w.upgrades[vael][Upgrade::VeilWeave.index()] > 0) as u32;
            }
        }
        println!(
            "level {diff}: wins Humans {} Vael {} of {games}; Cloaking Field in {} games, Veil Weave in {}",
            wins[0], wins[1], cloaks[0], cloaks[1]
        );
    }
}
