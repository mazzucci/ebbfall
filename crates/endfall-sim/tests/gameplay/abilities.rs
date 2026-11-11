//! Unit abilities since the re-theme: the Guard's Brace and the Cannon's Drop Anchor (toggles); casting for a
//! selection, refusals, the AI using them, what the re-theme retired (the boosts, the hop, the cloaks), the speed techs
//! and the Archer's harpoon.

use super::common::*;
use endfall_sim::world::{Command, Event};

#[test]
fn a_selection_casts_together_and_only_its_own_units() {
    let mut w = tech_arena(7);
    let mine: Vec<Id> = (0..3)
        .map(|i| {
            w.make_unit(
                UnitKind::Trooper,
                PLAYER,
                20.0 * TILE,
                (20 + i) as f64 * TILE,
            )
        })
        .collect();
    let theirs = w.make_unit(UnitKind::Trooper, ENEMY, 40.0 * TILE, 20.0 * TILE);
    let medic = w.make_unit(UnitKind::Medic, PLAYER, 22.0 * TILE, 20.0 * TILE);
    w.cast(mine[2], AbilityKind::Entrench).unwrap(); // (busy settling in: it sits the group's tap out)
    let units = [mine[0], mine[1], mine[2], theirs, medic];
    assert_eq!(
        w.apply(
            PLAYER,
            &Command::Cast {
                units: units.to_vec(),
                ability: AbilityKind::Entrench
            }
        ),
        Ok(())
    );
    let dug = |w: &World, u: Id| w.unit(u).unwrap().mode.is_some();
    assert!(dug(&w, mine[0]) && dug(&w, mine[1]));
    assert!(dug(&w, mine[2]), "the busy one stays as it was (bracing)");
    assert!(!dug(&w, theirs), "another seat's unit is never cast for");
    // Nobody able: the first reason comes back for the player.
    let only_medic = Command::Cast {
        units: vec![medic],
        ability: AbilityKind::Entrench,
    };
    assert_eq!(
        w.apply(PLAYER, &only_medic),
        Err("Cannot use Brace".to_string())
    );
    let only_busy = Command::Cast {
        units: vec![mine[2], medic],
        ability: AbilityKind::Entrench,
    };
    assert_eq!(
        w.apply(PLAYER, &only_busy),
        Err("Busy settling in".to_string()),
        "the reason of a unit that has it"
    );
}

#[test]
fn the_ai_uses_abilities_in_its_fights() {
    // Two AIs, the Kingdom against the Expedition: in their fights the Kingdom's Cannon drops anchor by itself.
    // (over a few games: whether an ability gets its moment depends on how a game goes)
    let mut cast: Vec<&str> = Vec::new();
    for seed in [6u32, 7, 8, 9] {
        let mut w = World::with_setup(seed, 1, MapKind::Standard, false, [&HUMANS, &VAEL]);
        w.set_ai_seats([true, true]);
        for _ in 0..30 * 60 * 15 {
            if w.over {
                break;
            }
            w.step();
            for e in w.events.drain(..) {
                if let Event::Cast { ability, .. } = e
                    && !cast.contains(&ability)
                {
                    cast.push(ability);
                }
            }
        }
        if cast.contains(&"deploy") {
            break;
        }
    }
    assert!(cast.contains(&"deploy"), "a Cannon anchored: {cast:?}");
    assert!(
        !cast.contains(&"entrench"),
        "the AI braces nothing: {cast:?}"
    );
}

#[test]
fn an_attack_order_packs_a_deployed_unit_up_and_a_lost_target_or_stop_leaves_it_holding() {
    // (the toggle's rules, on the one unit that has one: the Siege Tank's Deploy)
    let mut w = tech_arena(8);
    let v = w.make_unit(UnitKind::SiegeTank, PLAYER, 20.0 * TILE, 30.0 * TILE);
    w.cast(v, AbilityKind::Deploy).unwrap();
    run(&mut w, 4);
    let far = w.make_unit(UnitKind::Trooper, ENEMY, 36.0 * TILE, 30.0 * TILE);
    w.hold_unit(far);
    w.attack_ent(v, far);
    assert!(
        w.unit(v).unwrap().mode.is_none(),
        "an attack order past its reach means going there: it packs up"
    );
    let x0 = w.unit(v).unwrap().x;
    run(&mut w, 5);
    assert!(
        w.unit(v).unwrap().x > x0 + TILE,
        "then it drives to the target"
    );
    // Deployed, and its target gone: it holds where it is, still deployed (it does not wander off).
    let v2 = w.make_unit(UnitKind::SiegeTank, PLAYER, 20.0 * TILE, 40.0 * TILE);
    w.cast(v2, AbilityKind::Deploy).unwrap();
    run(&mut w, 4);
    let t = w.make_unit(UnitKind::Trooper, ENEMY, 27.0 * TILE, 40.0 * TILE);
    w.hold_unit(t);
    w.update_fog();
    run(&mut w, 15);
    assert!(w.unit(t).is_none(), "it shelled the trooper in its reach");
    let u = w.unit(v2).unwrap();
    assert!(
        u.mode.is_some() && u.task == Task::Hold,
        "and holds, deployed: {:?}",
        u.task
    );
    // Stop keeps a deployed unit deployed (holding).
    w.stop_unit(v2);
    let u = w.unit(v2).unwrap();
    assert!(u.mode.is_some() && u.task == Task::Hold);
}

#[test]
fn an_ability_waits_for_its_tech_and_a_tech_has_one_level() {
    // The Guard's Brace waits for Sandbags, researched at the Forge (`Upgrade::Entrenching`, one level).
    let (mut w, forge) = forge_arena(11);
    let p = w.make_unit(UnitKind::Trooper, PLAYER, 640.0, 1280.0);
    assert_eq!(
        w.cast(p, AbilityKind::Entrench),
        Err("Research Shield Drill first".to_string())
    );
    assert!(w.unit(p).unwrap().mode.is_none());
    research_level(&mut w, forge, Upgrade::Entrenching);
    assert!(
        w.cast(p, AbilityKind::Entrench).is_ok(),
        "on once researched"
    );
    assert_eq!(
        w.start_research(forge, Upgrade::Entrenching),
        Err("Shield Drill is fully upgraded".into()),
        "one level"
    );
    // The other side's Guards are not: a tech is a team's.
    let foe = w.make_unit(UnitKind::Trooper, ENEMY, 900.0, 1280.0);
    assert_eq!(
        w.cast(foe, AbilityKind::Entrench),
        Err("Research Shield Drill first".to_string())
    );
}

#[test]
fn brace_gives_a_guard_four_armour_and_holds_it_until_it_lifts() {
    // A braced Guard (Brace: +4 armour and no moving, 1 s to set and to lift) takes a Knight's blow less 1 + 4 armour,
    // against less 1 on its feet; it holds where it stands, fights what comes into its reach, and a move order lifts it
    // first.
    let mut w = tech_arena(14);
    let g = w.make_unit(UnitKind::Trooper, PLAYER, 30.0 * TILE, 30.0 * TILE);
    set_hp(&mut w, g, 1e6);
    w.hold_unit(g);
    let blow = UnitKind::Knight.def().weapon.unwrap().dmg + w.weapon_bonus(ENEMY, 3.0);
    let armour = UnitKind::Trooper.def().armor;
    let hit = |w: &mut World| {
        let before = w.unit(g).unwrap().hp;
        let k = w.make_unit(UnitKind::Knight, ENEMY, 31.0 * TILE, 30.0 * TILE);
        w.attack_ent(k, g);
        for _ in 0..3 * TPS {
            w.step();
            if w.unit(g).unwrap().hp < before {
                break;
            }
        }
        w.units.retain(|u| u.id != k);
        before - w.unit(g).unwrap().hp
    };
    assert_eq!(hit(&mut w), blow - armour, "on its feet");
    w.cast(g, AbilityKind::Entrench).unwrap();
    assert_eq!(w.unit(g).unwrap().task, Task::Hold, "braced, it holds");
    run(&mut w, 1);
    assert_eq!(w.unit(g).unwrap().swap, 0.0, "set in a second");
    assert_eq!(hit(&mut w), blow - armour - 4.0, "braced: 4 more armour");
    // It strikes what comes into its reach.
    let foe = w.make_unit(UnitKind::Trooper, ENEMY, 30.0 * TILE + 22.0, 30.0 * TILE);
    w.hold_unit(foe);
    run(&mut w, 2);
    assert!(
        w.unit(foe).is_none_or(|u| u.hp < u.maxhp),
        "it strikes the Guard beside it"
    );
    w.units.retain(|u| u.id != foe);
    // It does not move while braced: a move order lifts it first (1 s), then it walks.
    let x0 = w.unit(g).unwrap().x;
    w.move_to(g, 20.0 * TILE, 30.0 * TILE);
    assert!(w.unit(g).unwrap().mode.is_none(), "lifting");
    for _ in 0..TPS / 2 {
        w.step();
    }
    assert_eq!(w.unit(g).unwrap().x, x0, "still while it lifts");
    run(&mut w, 3);
    assert!(w.unit(g).unwrap().x < x0 - TILE, "then it walks off");
    // Off again by its button, too: its own armour again.
    w.hold_unit(g);
    w.cast(g, AbilityKind::Entrench).unwrap();
    run(&mut w, 2);
    w.cast(g, AbilityKind::Entrench).unwrap();
    assert!(w.unit(g).unwrap().mode.is_none(), "off again");
    run(&mut w, 2);
    assert_eq!(hit(&mut w), blow - armour, "back on its feet");
}

#[test]
fn what_the_retheme_retired_stays_retired() {
    // Two abilities are left, both toggles: Brace (the Guard's) and Drop Anchor (the Cannon's). Stim, Surface, Surge,
    // Cloak, Seaglass and Beach are gone with their units and techs; a name of one from an old client is refused.
    assert_eq!(ABILITIES, [AbilityKind::Entrench, AbilityKind::Deploy]);
    assert!(ABILITIES.iter().all(|a| a.def().toggle));
    assert_eq!(UnitKind::Trooper.toggle(), Some(AbilityKind::Entrench));
    assert_eq!(UnitKind::SiegeTank.toggle(), Some(AbilityKind::Deploy));
    for (k, list) in UNIT_KINDS.map(|k| (k, k.def().abilities)) {
        assert!(
            list.is_empty() || k == UnitKind::Trooper || k == UnitKind::SiegeTank,
            "{k:?}: {list:?}"
        );
    }
    for gone in ["stim", "blink", "overcharge", "cloak", "veil", "beach"] {
        assert_eq!(AbilityKind::parse(gone), None, "{gone}");
    }
    for gone in ["overchargeCore", "cloakingField", "veilWeave"] {
        assert_eq!(Upgrade::parse(gone), None, "{gone}");
    }
    let mut g = Game::new(5, 1);
    let u = g
        .world()
        .units
        .iter()
        .find(|u| u.team == PLAYER)
        .unwrap()
        .id;
    assert_ne!(g.cast(&[u], "stim"), "", "an unknown ability is refused");
    // On the wire a cast decodes to the same command.
    let cast = Command::Cast {
        units: vec![u],
        ability: AbilityKind::Entrench,
    };
    let words = cast.encode();
    assert_eq!(Command::decode(&words), Some((cast, words.len())));
}

#[test]
fn a_speed_tech_makes_its_raider_faster_alone_and_in_a_group() {
    // Tailwind (`Upgrade::Afterburners`, at the Stables): the Rider moves 1.3 times as fast.
    let travel = |tech: bool, n: usize| {
        let mut w = flat_arena(12);
        if tech {
            w.upgrades[PLAYER as usize][Upgrade::Afterburners.index()] = 1;
        }
        let us: Vec<Id> = (0..n)
            .map(|i| {
                w.make_unit(
                    UnitKind::Rider,
                    PLAYER,
                    20.0 * TILE,
                    (28.0 + 2.0 * i as f64) * TILE,
                )
            })
            .collect();
        w.attack_move_group(&us, 50.0 * TILE, 30.0 * TILE);
        run(&mut w, 3);
        w.unit(us[0]).unwrap().x - 20.0 * TILE
    };
    for n in [1, 2] {
        let (slow, fast) = (travel(false, n), travel(true, n));
        assert!(fast > slow * 1.25, "Tailwind, {n} Riders: {fast} vs {slow}");
    }
    assert_eq!(
        Upgrade::Afterburners.def().effect,
        Effect::Speed(UnitKind::Rider)
    );
    assert_eq!(
        Upgrade::Slipstream.def().effect,
        Effect::Speed(UnitKind::Shrike)
    );
}

/// How far `uid` walks in one second towards (x, y) (px), from where it stands.
fn walked(w: &mut World, uid: Id, x: f64, y: f64) -> f64 {
    let (x0, y0) = (w.unit(uid).unwrap().x, w.unit(uid).unwrap().y);
    w.move_to(uid, x, y);
    run(w, 1);
    let u = w.unit(uid).unwrap();
    ((u.x - x0).powi(2) + (u.y - y0).powi(2)).sqrt()
}

#[test]
fn a_harpoon_slows_what_it_hits_for_three_seconds_flyers_too_and_no_ability_meanwhile() {
    // The Harpoon (the Archer's shot, as the Harpooner's was): a unit it hits moves at half speed and casts nothing for 3 s; a
    // second harpoon renews the 3 s, it does not add to them. Flyers too.
    let mut w = flat_arena(21);
    w.factions = vec![&HUMANS, &VAEL];
    let (x, y) = (30.0 * TILE, 30.0 * TILE);
    for kind in [UnitKind::Scythe, UnitKind::Shrike] {
        w.units.clear();
        let foe = w.make_unit(kind, ENEMY, x + 5.0 * TILE, y);
        w.hold_unit(foe);
        let free = walked(&mut w, foe, x + 5.0 * TILE, y + 20.0 * TILE);
        w.hold_unit(foe);
        let h = w.make_unit(UnitKind::Lancer, PLAYER, x, y);
        w.attack_ent(h, foe);
        let mut hit = false;
        for _ in 0..3 * TPS {
            w.step();
            if w.unit(foe).unwrap().slowed > 0.0 {
                hit = true;
                break;
            }
        }
        assert!(hit, "{kind:?}: harpooned");
        let s = w.unit(foe).unwrap().slowed;
        assert!(s > 2.9 && s <= 3.0, "{kind:?}: for 3 s ({s})");
        w.units.retain(|u| u.id != h); // (no second harpoon while it is measured)
        let slow = walked(&mut w, foe, x + 5.0 * TILE, y - 20.0 * TILE);
        assert!(
            (slow / free - SLOW_SPEED).abs() < 0.05,
            "{kind:?}: half speed ({slow:.1} px against {free:.1})"
        );
        run(&mut w, 3);
        assert_eq!(w.unit(foe).unwrap().slowed, 0.0, "{kind:?}: worn off");
        let again = walked(&mut w, foe, x + 5.0 * TILE, y + 20.0 * TILE);
        assert!(
            (again / free - 1.0).abs() < 0.05,
            "{kind:?}: full speed again"
        );
    }
    // Two harpoons a second apart: the second renews the slow, to 3 s, never more.
    w.units.clear();
    let foe = w.make_unit(UnitKind::Scythe, ENEMY, x + 5.0 * TILE, y);
    w.hold_unit(foe);
    for k in 0..2 {
        let h = w.make_unit(UnitKind::Lancer, PLAYER, x, y + k as f64 * 30.0);
        w.attack_ent(h, foe);
    }
    let mut most: f64 = 0.0;
    for _ in 0..6 * TPS {
        w.step();
        most = most.max(w.unit(foe).map_or(0.0, |u| u.slowed));
    }
    assert!(most > 2.9 && most <= 3.0, "renewed, never stacked: {most}");
    // A harpooned Guard cannot Brace (nor use any other ability) until it wears off.
    w.units.clear();
    w.upgrades[ENEMY as usize][Upgrade::Entrenching.index()] = 1;
    let guard = w.make_unit(UnitKind::Trooper, ENEMY, x, y);
    w.units.iter_mut().find(|u| u.id == guard).unwrap().slowed = 3.0;
    let why = w.can_cast(guard, AbilityKind::Entrench).unwrap_err();
    assert!(why.contains("Slowed"), "{why}");
    assert!(w.cast(guard, AbilityKind::Entrench).is_err());
    run(&mut w, 3);
    assert_eq!(
        w.can_cast(guard, AbilityKind::Entrench),
        Ok(()),
        "free again"
    );
}
