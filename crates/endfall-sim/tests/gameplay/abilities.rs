//! Unit abilities: Stim, Entrench, Blink, Overcharge; casting for a selection, refusals, the AI using them.

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
    if kind.def().shields > 0.0 {
        w.factions = vec![&VAEL, &HUMANS];
    }
    let me = w.make_unit(kind, PLAYER, 30.0 * TILE, 30.0 * TILE);
    let foe = w.make_unit(UnitKind::Vanguard, ENEMY, 34.0 * TILE, 30.0 * TILE);
    set_hp(&mut w, foe, 1e6);
    w.hold_unit(foe);
    w.update_fog(); // (they see each other from the first tick: nothing fires at what its side does not see)
    w.attack_ent(me, foe);
    (w, me, foe)
}

#[test]
fn stim_costs_hull_and_fires_and_runs_faster_for_a_while() {
    let (mut w, t, _) = range_scene(UnitKind::Trooper, 1);
    let base = shots(&mut w, t, 6);
    let (mut w, t, _) = range_scene(UnitKind::Trooper, 1);
    let hp = w.unit(t).unwrap().hp;
    w.cast(t, AbilityKind::Stim).unwrap();
    assert_eq!(w.unit(t).unwrap().hp, hp - 10.0, "Stim costs 10 hull");
    let stimmed = shots(&mut w, t, 6);
    assert!(
        stimmed * 10 >= base * 14,
        "about 1.5x the shots: {stimmed} vs {base}"
    );
    // Faster on its feet too.
    let mut a = tech_arena(2);
    let p = a.make_unit(UnitKind::Trooper, PLAYER, 10.0 * TILE, 30.0 * TILE);
    let q = a.make_unit(UnitKind::Trooper, PLAYER, 10.0 * TILE, 34.0 * TILE);
    a.cast(q, AbilityKind::Stim).unwrap();
    a.move_to(p, 50.0 * TILE, 30.0 * TILE);
    a.move_to(q, 50.0 * TILE, 34.0 * TILE);
    run(&mut a, 3);
    let (px, qx) = (a.unit(p).unwrap().x, a.unit(q).unwrap().x);
    assert!(
        qx - 10.0 * TILE > (px - 10.0 * TILE) * 1.2,
        "stimmed walks farther: {qx} vs {px}"
    );
    // It wears off.
    run(&mut a, 10);
    assert!(a.unit(q).unwrap().boost.is_none(), "over after 10 s");
    // Not when too hurt to pay for it.
    set_hp(&mut a, p, 9.0);
    assert_eq!(a.cast(p, AbilityKind::Stim), Err("Too hurt".to_string()));
}

#[test]
fn entrench_reaches_farther_but_cannot_move_and_packs_up_to_walk() {
    // A target at 8 tiles: out of a Vanguard's normal reach (6), inside its entrenched one (9).
    let mut w = tech_arena(3);
    let v = w.make_unit(UnitKind::Vanguard, PLAYER, 30.0 * TILE, 30.0 * TILE);
    let foe = w.make_unit(UnitKind::Vanguard, ENEMY, 38.5 * TILE, 30.0 * TILE);
    set_hp(&mut w, foe, 1e6);
    w.hold_unit(foe);
    w.hold_unit(v);
    assert_eq!(shots(&mut w, v, 3), 0, "out of reach on hold");
    w.cast(v, AbilityKind::Entrench).unwrap();
    assert_eq!(shots(&mut w, v, 2), 0, "no shots while settling in (2 s)");
    assert!(shots(&mut w, v, 4) > 0, "entrenched, it reaches 8 tiles");
    // It cannot be pushed into walking: a move order packs it up first (2 s), then it walks.
    let x0 = w.unit(v).unwrap().x;
    w.move_to(v, 10.0 * TILE, 30.0 * TILE);
    assert!(w.unit(v).unwrap().mode.is_none());
    run(&mut w, 1);
    assert_eq!(w.unit(v).unwrap().x, x0, "still packing up");
    run(&mut w, 3);
    assert!(w.unit(v).unwrap().x < x0 - TILE, "then it walks");
    // Stop keeps an entrenched unit entrenched (holding).
    let v2 = w.make_unit(UnitKind::Vanguard, PLAYER, 20.0 * TILE, 40.0 * TILE);
    w.cast(v2, AbilityKind::Entrench).unwrap();
    w.stop_unit(v2);
    let u = w.unit(v2).unwrap();
    assert!(u.mode.is_some() && u.task == Task::Hold);
}

#[test]
fn blink_hops_towards_the_target_onto_open_ground_and_waits_its_cooldown() {
    let mut w = tech_arena(4);
    w.factions = vec![&VAEL, &HUMANS];
    let s = w.make_unit(UnitKind::Scythe, PLAYER, 20.0 * TILE, 30.0 * TILE);
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
        Err("Blink is not ready".to_string())
    );
    run(&mut w, 21);
    assert!(
        w.can_cast(s, AbilityKind::Blink).is_ok(),
        "ready after 20 s"
    );
    // Facing a building with no target: it lands on the nearest open tile, never inside.
    let mut w = tech_arena(5);
    w.factions = vec![&VAEL, &HUMANS];
    let s = w.make_unit(UnitKind::Scythe, PLAYER, 20.0 * TILE, 30.5 * TILE);
    w.make_building(BldgKind::Depot, ENEMY, 23, 29, true);
    w.cast(s, AbilityKind::Blink).unwrap(); // faces east (team 0), straight at the Depot
    let u = w.unit(s).unwrap();
    let (tx, ty) = ((u.x / TILE) as i32, (u.y / TILE) as i32);
    assert!(!w.map.blocked(tx, ty), "landed on open ground at {tx},{ty}");
}

#[test]
fn overcharge_doubles_a_monoliths_fire_for_a_while() {
    let (mut w, m, _) = range_scene(UnitKind::Monolith, 6);
    let base = shots(&mut w, m, 6);
    let (mut w, m, _) = range_scene(UnitKind::Monolith, 6);
    w.cast(m, AbilityKind::Overcharge).unwrap();
    let over = shots(&mut w, m, 6);
    assert!(
        over >= base * 2 - 1,
        "about twice the shells: {over} vs {base}"
    );
    assert!(w.cast(m, AbilityKind::Overcharge).is_err(), "30 s cooldown");
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
    set_hp(&mut w, mine[2], 5.0); // too hurt
    let units = [mine[0], mine[1], mine[2], theirs, medic];
    assert_eq!(
        w.apply(
            PLAYER,
            &Command::Cast {
                units: units.to_vec(),
                ability: AbilityKind::Stim
            }
        ),
        Ok(())
    );
    let boosted = |w: &World, u: Id| w.unit(u).unwrap().boost.is_some();
    assert!(boosted(&w, mine[0]) && boosted(&w, mine[1]));
    assert!(!boosted(&w, mine[2]), "the hurt one sits it out");
    assert!(
        !boosted(&w, theirs),
        "another seat's unit is never cast for"
    );
    // Nobody able: the first reason comes back for the player.
    let only_medic = Command::Cast {
        units: vec![medic],
        ability: AbilityKind::Stim,
    };
    assert_eq!(
        w.apply(PLAYER, &only_medic),
        Err("Cannot use Stim".to_string())
    );
}

#[test]
fn the_ai_uses_abilities_in_its_fights() {
    // Two AIs, Humans against the Vael: in their fights both sides cast, a researched ability too (Entrench or
    // Overcharge: the AI researches its techs and uses them).
    // (over a few games: whether a researched ability gets its moment depends on how a game goes)
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
        if cast.contains(&"entrench") || cast.contains(&"overcharge") {
            break;
        }
    }
    assert!(
        cast.contains(&"stim") && cast.contains(&"blink"),
        "both sides used abilities: {cast:?}"
    );
    assert!(
        cast.contains(&"entrench") || cast.contains(&"overcharge"),
        "a researched ability was used: {cast:?} (techs{techs})"
    );
}

#[test]
fn an_attack_order_packs_an_entrenched_unit_up_and_a_lost_target_leaves_it_holding() {
    let mut w = tech_arena(8);
    let v = w.make_unit(UnitKind::Vanguard, PLAYER, 20.0 * TILE, 30.0 * TILE);
    w.cast(v, AbilityKind::Entrench).unwrap();
    run(&mut w, 3);
    let far = w.make_unit(UnitKind::Trooper, ENEMY, 34.0 * TILE, 30.0 * TILE);
    w.hold_unit(far);
    w.attack_ent(v, far);
    assert!(
        w.unit(v).unwrap().mode.is_none(),
        "an attack order means going there: it packs up"
    );
    let x0 = w.unit(v).unwrap().x;
    run(&mut w, 5);
    assert!(
        w.unit(v).unwrap().x > x0 + TILE,
        "then it walks to the target"
    );
    // Entrenched, and its target gone: it holds where it is, still entrenched (it does not wander off).
    let v2 = w.make_unit(UnitKind::Vanguard, PLAYER, 20.0 * TILE, 40.0 * TILE);
    w.cast(v2, AbilityKind::Entrench).unwrap();
    run(&mut w, 3);
    let t = w.make_unit(UnitKind::Trooper, ENEMY, 27.0 * TILE, 40.0 * TILE);
    w.hold_unit(t);
    run(&mut w, 15);
    assert!(w.unit(t).is_none(), "it shot the trooper in its reach");
    let u = w.unit(v2).unwrap();
    assert!(
        u.mode.is_some() && u.task == Task::Hold,
        "and holds, entrenched: {:?}",
        u.task
    );
}

#[test]
fn the_ai_does_not_restim_while_a_stim_runs() {
    let mut w = tech_arena(9);
    let t = w.make_unit(UnitKind::Trooper, PLAYER, 20.0 * TILE, 30.0 * TILE);
    w.make_unit(UnitKind::Medic, PLAYER, 19.0 * TILE, 30.0 * TILE);
    for i in 0..3 {
        let foe = w.make_unit(
            UnitKind::Vanguard,
            ENEMY,
            24.0 * TILE,
            (29 + i) as f64 * TILE,
        );
        set_hp(&mut w, foe, 1e6);
        w.hold_unit(foe);
    }
    let foe = w.units.iter().find(|u| u.team == ENEMY).unwrap().id;
    w.attack_ent(t, foe);
    let mut casts = 0;
    for tick in 0..10 * TPS {
        w.step();
        w.events.clear();
        if tick % 15 == 0 {
            let before = w.unit(t).map(|u| u.boost);
            w.auto_cast(PLAYER);
            if w.unit(t).map(|u| u.boost) != before {
                casts += 1;
            }
        }
    }
    assert!(
        casts <= 1,
        "one Stim for the 10 s, not one a second: {casts}"
    );
}

#[test]
fn an_ability_waits_for_its_tech_and_a_tech_has_one_level() {
    let (mut w, forge) = forge_arena(11);
    let v = w.make_unit(UnitKind::Vanguard, PLAYER, 640.0, 1280.0);
    assert_eq!(
        w.cast(v, AbilityKind::Entrench),
        Err("Research Entrenching first".into()),
        "locked until researched"
    );
    // A line unit's ability needs no tech.
    let t = w.make_unit(UnitKind::Trooper, PLAYER, 700.0, 1280.0);
    assert!(w.cast(t, AbilityKind::Stim).is_ok(), "Stim from the start");
    research_level(&mut w, forge, Upgrade::Entrenching);
    assert!(w.cast(v, AbilityKind::Entrench).is_ok(), "unlocked");
    assert_eq!(
        w.start_research(forge, Upgrade::Entrenching),
        Err("Entrenching is fully upgraded".into()),
        "one level"
    );
    // The other side's Vanguards are still locked: a tech is a team's.
    let foe = w.make_unit(UnitKind::Vanguard, ENEMY, 900.0, 1280.0);
    assert!(w.cast(foe, AbilityKind::Entrench).is_err());
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
                    UnitKind::Wasp,
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
            "Afterburners, {n} Wasps: {fast} vs {slow}"
        );
    }
}

#[test]
fn a_second_stim_while_the_first_runs_is_refused_and_costs_nothing() {
    let mut w = flat_arena(3);
    let t = w.make_unit(UnitKind::Trooper, PLAYER, 30.0 * TILE, 30.0 * TILE);
    let hp = w.unit(t).unwrap().hp;
    w.cast(t, AbilityKind::Stim).unwrap();
    run(&mut w, 2); // (past its 1 s cooldown, most of its 10 s left)
    assert_eq!(
        w.cast(t, AbilityKind::Stim),
        Err("Stim is already on".into())
    );
    assert_eq!(w.unit(t).unwrap().hp, hp - 10.0, "paid once");
    run(&mut w, 4); // (less than half left: a top-up is allowed)
    assert!(w.cast(t, AbilityKind::Stim).is_ok());
}
