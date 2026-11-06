//! Unit abilities: Surface (the Conch's hop), Surge (the Lens's), Dig In and Drop Anchor's toggle rules, the cloaks;
//! casting for a selection, refusals, the AI using them, and what Roster v2 retired (Stim, the Kite's Cloak).

use super::common::*;
use endfall_sim::world::{Command, Event};

/// Shots fired by `shooter` at a sturdy target over `secs` (counted from Fire events where it stands).
fn shots(w: &mut World, shooter: Id, secs: u32) -> usize {
    let sx = w.unit(shooter).unwrap().x;
    let mut n = 0;
    for _ in 0..secs * TPS {
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

/// A shooter of `kind` facing a target that will not die soon, 4 tiles apart, on open ground.
fn range_scene(kind: UnitKind, seed: u32) -> (World, Id, Id) {
    let mut w = tech_arena(seed);
    if kind.def().mv == Move::Amph {
        w.factions = vec![&VAEL, &HUMANS];
    }
    let me = w.make_unit(kind, PLAYER, 30.0 * TILE, 30.0 * TILE);
    let foe = w.make_unit(UnitKind::Vanguard, ENEMY, 34.0 * TILE, 30.0 * TILE);
    set_hp(&mut w, foe, 1e6);
    w.hold_unit(foe);
    w.attack_ent(me, foe);
    (w, me, foe)
}

#[test]
fn surface_hops_a_conch_towards_the_target_onto_open_ground_and_waits_its_cooldown() {
    // (Blink, named Surface: the Conch's since Roster v2, on a 30 s cooldown)
    let mut w = tech_arena(4);
    w.factions = vec![&VAEL, &HUMANS];
    let s = w.make_unit(UnitKind::Monolith, PLAYER, 20.0 * TILE, 30.0 * TILE);
    let foe = w.make_unit(UnitKind::Trooper, ENEMY, 28.0 * TILE, 30.0 * TILE);
    w.hold_unit(foe);
    w.attack_ent(s, foe);
    let x0 = w.unit(s).unwrap().x;
    w.cast(s, AbilityKind::Blink).unwrap();
    let x1 = w.unit(s).unwrap().x;
    assert!(
        (x1 - x0 - 4.0 * TILE).abs() < 1.0,
        "4 tiles towards its target: {x0} -> {x1}"
    );
    assert_eq!(
        w.cast(s, AbilityKind::Blink),
        Err("Surface is not ready".to_string())
    );
    run(&mut w, 25);
    assert!(
        w.can_cast(s, AbilityKind::Blink).is_err(),
        "not ready after 25 s"
    );
    run(&mut w, 6);
    assert!(
        w.can_cast(s, AbilityKind::Blink).is_ok(),
        "ready after 30 s"
    );
    // Facing a building with no target: it lands on the nearest open tile, never inside.
    let mut w = tech_arena(5);
    w.factions = vec![&VAEL, &HUMANS];
    let s = w.make_unit(UnitKind::Monolith, PLAYER, 20.0 * TILE, 30.5 * TILE);
    w.make_building(BldgKind::Depot, ENEMY, 23, 29, true);
    w.cast(s, AbilityKind::Blink).unwrap(); // faces east (team 0), straight at the Depot
    let u = w.unit(s).unwrap();
    let (tx, ty) = ((u.x / TILE) as i32, (u.y / TILE) as i32);
    assert!(!w.map.blocked(tx, ty), "landed on open ground at {tx},{ty}");
    // The Needle (once the Scythe) hops no more.
    let n = w.make_unit(UnitKind::Scythe, PLAYER, 20.0 * TILE, 40.0 * TILE);
    assert_eq!(
        w.cast(n, AbilityKind::Blink),
        Err("Cannot use Surface".to_string())
    );
}

#[test]
fn surge_doubles_a_lens_fire_for_a_while_once_its_chamber_is_researched() {
    // (Overcharge, named Surge: the Lens's since Roster v2, unlocked by the Surge Chamber)
    let (mut w, m, _) = range_scene(UnitKind::Prism, 6);
    let base = shots(&mut w, m, 6);
    let (mut w, m, _) = range_scene(UnitKind::Prism, 6);
    w.cast(m, AbilityKind::Overcharge).unwrap();
    let over = shots(&mut w, m, 6);
    assert!(
        over >= base * 2 - 1,
        "about twice the shots: {over} vs {base}"
    );
    assert!(w.cast(m, AbilityKind::Overcharge).is_err(), "30 s cooldown");
    // Not before the Surge Chamber; and the Conch surges no more.
    let (mut w, m, _) = range_scene(UnitKind::Prism, 6);
    w.upgrades[PLAYER as usize][Upgrade::OverchargeCore.index()] = 0;
    assert_eq!(
        w.cast(m, AbilityKind::Overcharge),
        Err("Research Surge Chamber first".to_string())
    );
    let c = w.make_unit(UnitKind::Monolith, PLAYER, 20.0 * TILE, 40.0 * TILE);
    assert_eq!(
        w.cast(c, AbilityKind::Overcharge),
        Err("Cannot use Surge".to_string())
    );
}

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
    assert!(
        dug(&w, mine[2]),
        "the busy one stays as it was (digging in)"
    );
    assert!(!dug(&w, theirs), "another seat's unit is never cast for");
    // Nobody able: the first reason comes back for the player.
    let only_medic = Command::Cast {
        units: vec![medic],
        ability: AbilityKind::Entrench,
    };
    assert_eq!(
        w.apply(PLAYER, &only_medic),
        Err("Cannot use Dig In".to_string())
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
    // Two AIs, Humans against the Vael: in their fights both sides use abilities (the Anchor Gun drops anchor by
    // itself), a researched one too (the Lens's Surge: the AI researches its Surge Chamber and uses it), and the Conch Surfaces at a
    // target a little out of its reach.
    // (over a few games: whether an ability gets its moment depends on how a game goes)
    let mut cast: Vec<&str> = Vec::new();
    let mut techs = String::new();
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
        techs += &format!(" {:?}", w.upgrades);
        if cast.contains(&"deploy") && cast.contains(&"overcharge") && cast.contains(&"blink") {
            break;
        }
    }
    assert!(
        cast.contains(&"deploy"),
        "both sides used abilities: {cast:?}"
    );
    assert!(
        cast.contains(&"overcharge"),
        "a researched ability was used: {cast:?} (techs{techs})"
    );
    assert!(cast.contains(&"blink"), "a Conch Surfaced: {cast:?}");
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
    // The Picket's Dig In waits for Sandbags, researched at the Workshop (`Upgrade::Entrenching`, one level).
    let (mut w, forge) = forge_arena(11);
    let p = w.make_unit(UnitKind::Trooper, PLAYER, 640.0, 1280.0);
    assert_eq!(
        w.cast(p, AbilityKind::Entrench),
        Err("Research Sandbags first".to_string())
    );
    assert!(w.unit(p).unwrap().mode.is_none());
    research_level(&mut w, forge, Upgrade::Entrenching);
    assert!(
        w.cast(p, AbilityKind::Entrench).is_ok(),
        "on once researched"
    );
    assert_eq!(
        w.start_research(forge, Upgrade::Entrenching),
        Err("Sandbags is fully upgraded".into()),
        "one level"
    );
    // The other side's Pickets are not: a tech is a team's.
    let foe = w.make_unit(UnitKind::Trooper, ENEMY, 900.0, 1280.0);
    assert_eq!(
        w.cast(foe, AbilityKind::Entrench),
        Err("Research Sandbags first".to_string())
    );
    // The Petrel's Seaglass is the cloak a tech still gives: hidden once researched, the other side's not.
    let mut w = arena(11);
    let s = w.make_unit(UnitKind::Shrike, PLAYER, 640.0, 1280.0);
    let foe = w.make_unit(UnitKind::Shrike, ENEMY, 900.0, 1280.0);
    assert!(
        !w.is_cloaked(w.unit(s).unwrap()),
        "no cloak until researched"
    );
    w.upgrades[PLAYER as usize][Upgrade::VeilWeave.index()] = 1;
    assert!(w.is_cloaked(w.unit(s).unwrap()), "cloaked once researched");
    assert!(!w.is_cloaked(w.unit(foe).unwrap()));
}

#[test]
fn dig_in_gives_a_picket_two_more_tiles_and_holds_it_until_it_packs_up() {
    // A held Picket and a sturdy target 6 tiles off: past its 4.5 tiles of reach, inside 6.5 dug in.
    let scene = |dig: bool| {
        let mut w = tech_arena(14);
        let p = w.make_unit(UnitKind::Trooper, PLAYER, 30.0 * TILE, 30.0 * TILE);
        let foe = w.make_unit(UnitKind::Vanguard, ENEMY, 36.0 * TILE, 30.0 * TILE);
        set_hp(&mut w, foe, 1e6);
        w.hold_unit(foe);
        w.hold_unit(p);
        if dig {
            w.cast(p, AbilityKind::Entrench).unwrap();
        }
        w.update_fog();
        (w, p)
    };
    let (mut w, p) = scene(false);
    assert_eq!(shots(&mut w, p, 6), 0, "out of its reach on its feet");
    let (mut w, p) = scene(true);
    assert_eq!(w.unit(p).unwrap().task, Task::Hold, "dug in, it holds");
    assert_eq!(shots(&mut w, p, 1), 0, "no shots while digging in (2 s)");
    let n = shots(&mut w, p, 6);
    assert!(n >= 4, "dug in, it reaches 2 tiles farther: {n} shots");
    // It does not move while dug in: a move order packs it up first (2 s), then it walks.
    let x0 = w.unit(p).unwrap().x;
    w.move_to(p, 20.0 * TILE, 30.0 * TILE);
    assert!(w.unit(p).unwrap().mode.is_none(), "packing up");
    run(&mut w, 1);
    assert_eq!(w.unit(p).unwrap().x, x0, "still while it packs up");
    run(&mut w, 3);
    assert!(w.unit(p).unwrap().x < x0 - TILE, "then it walks off");
    // Off again by its button, too: back to its own reach.
    let (mut w, p) = scene(true);
    run(&mut w, 3);
    w.cast(p, AbilityKind::Entrench).unwrap();
    assert!(w.unit(p).unwrap().mode.is_none(), "off again");
    w.hold_unit(p);
    w.events.clear(); // (the shots fired while it was dug in)
    assert_eq!(shots(&mut w, p, 8), 0, "back to 4.5 tiles");
}

#[test]
fn what_roster_v2_retired_stays_retired() {
    // Stim (the Trooper's, now the Picket's Dig In) and the Raider's Cloak (the Kite is never hidden; nothing researches
    // Cloaking Field): no unit lists them and nothing researches their techs; the kinds keep their places (the
    // snapshot sends indices). Dig In is the Picket's toggle, Drop Anchor the Anchor Gun's.
    for gone in [AbilityKind::Stim, AbilityKind::Cloak] {
        assert!(
            UNIT_KINDS
                .iter()
                .all(|k| !k.def().abilities.contains(&gone)),
            "{gone:?}"
        );
    }
    assert!(
        BLDG_KINDS
            .iter()
            .all(|b| !b.def().researches.contains(&Upgrade::CloakingField))
    );
    assert_eq!(UnitKind::Trooper.toggle(), Some(AbilityKind::Entrench));
    assert_eq!(UnitKind::Vanguard.toggle(), Some(AbilityKind::Beach));
    assert_eq!(UnitKind::SiegeTank.toggle(), Some(AbilityKind::Deploy));
    // A cast of Stim (from an old client, a replay, the wire) is refused; so is Cloaking Field's research.
    let (mut w, forge) = forge_arena(13);
    let p = w.make_unit(UnitKind::Trooper, PLAYER, 640.0, 1280.0);
    let hp = w.unit(p).unwrap().hp;
    let cast = Command::Cast {
        units: vec![p],
        ability: AbilityKind::Stim,
    };
    assert_eq!(w.apply(PLAYER, &cast), Err("Cannot use Stim".to_string()));
    let u = w.unit(p).unwrap();
    assert!(u.boost.is_none() && u.hp == hp, "nothing paid, nothing on");
    let research = Command::Research {
        bldg: forge,
        up: Upgrade::CloakingField,
    };
    assert_eq!(
        w.apply(PLAYER, &research),
        Err("Cannot research Cloaking Field".to_string())
    );
    assert_eq!(
        w.upgrades[PLAYER as usize][Upgrade::CloakingField.index()],
        0
    );
    // Even with Cloaking Field set (an old save's numbers), a Kite is not hidden.
    w.upgrades[PLAYER as usize][Upgrade::CloakingField.index()] = 1;
    let k = w.make_unit(UnitKind::Raider, PLAYER, 700.0, 1280.0);
    assert!(!w.is_cloaked(w.unit(k).unwrap()));
    // On the wire the cast still decodes (its index kept its place), to the same command.
    let words = cast.encode();
    assert_eq!(Command::decode(&words), Some((cast, words.len())));
}

#[test]
fn a_speed_tech_makes_its_flyer_faster_alone_and_in_a_group() {
    let travel = |tech: bool, n: usize| {
        let mut w = flat_arena(12);
        if tech {
            w.upgrades[PLAYER as usize][Upgrade::Afterburners.index()] = 1;
        }
        let us: Vec<Id> = (0..n)
            .map(|i| {
                w.make_unit(
                    UnitKind::Raider,
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
        assert!(
            fast > slow * 1.25,
            "Afterburners, {n} Raiders: {fast} vs {slow}"
        );
    }
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
    // The Harpoon (Roster v2, rule 1): a unit a Harpooner hits moves at half speed and casts nothing for 3 s; a
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
    // A harpooned Conch cannot Surface (nor any other ability) until it wears off: an order or the AI's own cast.
    w.units.clear();
    let conch = w.make_unit(UnitKind::Monolith, ENEMY, x, y);
    w.units.iter_mut().find(|u| u.id == conch).unwrap().slowed = 3.0;
    let why = w.can_cast(conch, AbilityKind::Blink).unwrap_err();
    assert!(why.contains("Harpooned"), "{why}");
    assert!(w.cast(conch, AbilityKind::Blink).is_err());
    run(&mut w, 3);
    assert_eq!(w.can_cast(conch, AbilityKind::Blink), Ok(()), "free again");
}

#[test]
fn a_harpooned_lens_does_not_surge_in_the_ais_fight_until_it_wears_off() {
    // The AI's casts go through the same refusal: a Lens with Surge researched, in a fight (three armed enemies near,
    // its target in reach), surges by itself only once the harpoon has worn off.
    let mut w = flat_arena(22);
    w.factions = vec![&HUMANS, &VAEL];
    w.set_ai_seats([false, true]);
    w.upgrades[ENEMY as usize][Upgrade::OverchargeCore.index()] = 1;
    let (x, y) = (30.0 * TILE, 30.0 * TILE);
    let lens = w.make_unit(UnitKind::Prism, ENEMY, x, y);
    let foes: Vec<Id> = (0..3)
        .map(|k| {
            w.make_unit(
                UnitKind::Trooper,
                PLAYER,
                x + 4.0 * TILE,
                y + (k as f64 - 1.0) * 24.0,
            )
        })
        .collect();
    for &f in &foes {
        w.hold_unit(f);
    }
    w.attack_ent(lens, foes[1]);
    w.step(); // (its side sees them)
    w.units.iter_mut().find(|u| u.id == lens).unwrap().slowed = 3.0;
    w.auto_cast(ENEMY);
    assert!(
        w.unit(lens).unwrap().boost.is_none(),
        "no Surge while harpooned"
    );
    w.units.iter_mut().find(|u| u.id == lens).unwrap().slowed = 0.0;
    w.auto_cast(ENEMY);
    assert!(
        w.unit(lens).unwrap().boost.is_some(),
        "it surges once the harpoon has worn off"
    );
}
