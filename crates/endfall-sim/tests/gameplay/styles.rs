//! AI play styles (PRD: AI styles and the level ladder): each AI seat draws a style at its first turn from the world's
//! seeded RNG (Pressure, Timing, Boom; Easy never Pressure), a leaning unit, and on Easy its army cap and its climb to
//! the mid tier; every seat's stalled-game push starts at a time of its own. The style changes the plan, never the
//! level's strength, and the player never learns it.

use super::common::*;

/// Two AIs against each other at `level` on 96x96, past their first turns.
fn duel(seed: u32, level: usize, races: [&'static Faction; 2]) -> World {
    let mut w = World::with_size(
        seed,
        level,
        MapKind::Standard,
        MapSize::square(96),
        0,
        &races,
    );
    assert!(w.set_ai_seats([true, true]));
    w
}

#[test]
fn each_ai_seat_draws_its_style_at_its_first_turn_the_same_for_the_same_seed() {
    // Before its first turn a seat has no style and plays its level's own tuning; at it, it draws, and the same seed draws
    // the same (the draws come from the world's RNG, in a fixed order: multiplayer-safe).
    let mut a = duel(3, 1, [&HUMANS, &VAEL]);
    assert_eq!((a.ai_style(0), a.ai_style(1)), (None, None));
    assert_eq!(a.tuning(1), DIFF[1], "its level's own before it draws");
    past_first_turns(&mut a);
    let mut b = duel(3, 1, [&HUMANS, &VAEL]);
    past_first_turns(&mut b);
    assert!(a.ai_style(0).is_some() && a.ai_style(1).is_some());
    assert_eq!(
        (a.ai_style(0), a.ai_style(1)),
        (b.ai_style(0), b.ai_style(1))
    );
    assert_eq!(a.tuning(1), b.tuning(1));
    assert_eq!(a.state_hash(), b.state_hash());
    // A person's seat draws nothing.
    let mut w = World::new(3, 1);
    past_first_turns(&mut w);
    assert_eq!(
        (w.ai_style(PLAYER), w.ai_style(ENEMY).is_some()),
        (None, true)
    );
}

#[test]
fn every_level_plays_each_of_its_styles_over_many_games_and_easy_never_pressure() {
    for level in 0..3 {
        let mut seen = [0usize; 3];
        for seed in 1..=40 {
            let mut w = duel(seed, level, [&HUMANS, &VAEL]);
            past_first_turns(&mut w);
            for s in 0..2 {
                seen[w.ai_style(s).unwrap().index()] += 1;
            }
        }
        if level == 0 {
            assert_eq!(seen[Style::Pressure.index()], 0, "Easy: no Pressure");
            assert!(
                seen[1] > 20 && seen[2] > 20,
                "Easy: Timing and Boom: {seen:?}"
            );
        } else {
            assert!(seen.iter().all(|&n| n > 5), "level {level}: {seen:?}");
        }
    }
}

#[test]
fn the_style_is_never_shown_its_draw_emits_nothing() {
    // Stelian, Nov 13: the player never learns the style. The same game with the AI made to play Pressure and Boom emits
    // the same events through its first turns: the draw itself says nothing (no toast, no sound, no event).
    let events = |st: Style| {
        let mut w = World::new(9, 1);
        assert!(w.set_ai_styles(&[None, Some(st)]));
        let mut all = Vec::new();
        for _ in 0..40 {
            w.step();
            all.append(&mut w.events);
        }
        assert_eq!(w.ai_style(ENEMY), Some(st));
        all
    };
    assert_eq!(events(Style::Pressure), events(Style::Boom));
}

#[test]
fn a_forced_style_keeps_the_seat_s_other_draws() {
    // The balance lab's per-style rows (`set_ai_styles`): the style is replaced, its leaning unit, its army cap, its mid
    // tier and its stalled-game push are the same draws.
    let draw = |st: Style| {
        let mut w = duel(5, 0, [&HUMANS, &VAEL]);
        assert!(w.set_ai_styles(&[Some(st), Some(st)]));
        past_first_turns(&mut w);
        w.tuning(1)
    };
    let (t, b) = (draw(Style::Timing), draw(Style::Boom));
    assert_eq!(
        (t.focus, t.army_max, t.tier_at[0], t.stall_from),
        (b.focus, b.army_max, b.tier_at[0], b.stall_from)
    );
    assert_eq!(t.tier_at[1], NEVER, "Easy's Timing: the mid tier at most");
    assert_eq!(b.tier_at[1], 900.0, "Easy's Boom: its top tier from 15:00");
}

#[test]
fn a_lab_plan_is_played_as_it_is() {
    // A seat the balance lab gave a whole plan (`set_ai_plans`) plays it, whatever it draws.
    let plan = Diff {
        first: 600.0,
        ..DIFF[1]
    };
    let mut w = duel(5, 1, [&HUMANS, &VAEL]);
    assert!(w.set_ai_plans(&[None, Some(plan)]));
    past_first_turns(&mut w);
    assert_eq!(w.tuning(1), plan);
    assert!(
        w.ai_style(1).is_some(),
        "it draws all the same: the draws' order is the rules'"
    );
}

#[test]
fn mirrored_ais_start_their_stalled_game_pushes_apart() {
    // The PM, Nov 14: two mirrored AIs' all-ins landed together at 15:00. Each seat draws its push's start between 13:00
    // and 17:00; over a few games the two seats' differ, and Easy (no push) draws none.
    let mut apart = 0;
    for seed in 1..=10 {
        let mut w = duel(seed, 1, [&HUMANS, &HUMANS]);
        past_first_turns(&mut w);
        let (a, b) = (w.tuning(0).stall_from, w.tuning(1).stall_from);
        for t in [a, b] {
            assert!((780.0..=1020.0).contains(&t), "{t}");
        }
        apart += ((a - b).abs() >= 30.0) as usize;
    }
    assert!(
        apart >= 7,
        "{apart} of 10 games a half minute apart or more"
    );
    let mut w = duel(1, 0, [&HUMANS, &HUMANS]);
    past_first_turns(&mut w);
    assert_eq!(w.tuning(0).stall_from, NEVER);
}

/// Seat 1 at `level` in style `st` against an idle seat 0 whose buildings never fall, on 96x96: when its first wave
/// went and when its second headquarters stood (s), within `secs`.
fn plan_of(level: usize, st: Style, secs: f64) -> (Option<f64>, Option<f64>) {
    let mut w = World::with_size(
        2,
        level,
        MapKind::Standard,
        MapSize::square(96),
        0,
        &[&HUMANS, &VAEL],
    );
    assert!(w.set_ai_seats([false, true]));
    assert!(w.set_ai_styles(&[None, Some(st)]));
    for b in w.bldgs.iter_mut().filter(|b| b.team == PLAYER) {
        (b.hp, b.maxhp) = (1e9, 1e9);
    }
    let (mut wave, mut base) = (None, None);
    while w.time < secs {
        w.step();
        w.events.clear();
        if wave.is_none() && w.ai_wave_of(ENEMY).is_some() {
            wave = Some(w.time);
        }
        let hqs = w
            .bldgs
            .iter()
            .filter(|b| b.team == ENEMY && b.kind.def().hq && b.done)
            .count();
        if base.is_none() && hqs >= 2 {
            base = Some(w.time);
        }
    }
    (wave, base)
}

#[test]
fn pressure_attacks_first_and_expands_last_boom_expands_first() {
    // The styles' plans on Medium, the same game: Pressure's first wave goes sooner than its level's own (Timing) and
    // its natural later; Boom's first wave later (it waits for a bigger one) and its natural due first (`expand_time`;
    // when it stands is the economy's too: a crew and the price saved).
    let (p_wave, p_base) = plan_of(1, Style::Pressure, 900.0);
    let (t_wave, t_base) = plan_of(1, Style::Timing, 900.0);
    let (b_wave, b_base) = plan_of(1, Style::Boom, 900.0);
    let (p_wave, t_wave, b_wave) = (p_wave.unwrap(), t_wave.unwrap(), b_wave.unwrap());
    assert!(
        p_wave < t_wave && t_wave < b_wave,
        "first waves: Pressure {p_wave:.0}, Timing {t_wave:.0}, Boom {b_wave:.0}"
    );
    // (Boom's natural: due sooner, below; in this game it stands when Timing's does, its crew and price the limit)
    let (t_base, _) = (t_base.unwrap(), b_base.unwrap());
    assert!(
        p_base.is_none_or(|p| p > t_base),
        "Pressure's natural {p_base:?}, Timing's {t_base:.0}"
    );
    for f in [&HUMANS, &VAEL] {
        let due = |st: Style| {
            let mut w = duel(2, 1, [&HUMANS, f]);
            assert!(w.set_ai_styles(&[Some(st); 2]));
            past_first_turns(&mut w);
            w.tuning(1).expand_shift
        };
        assert!(due(Style::Boom) < due(Style::Timing) && due(Style::Timing) < due(Style::Pressure));
    }
}

#[test]
fn easy_s_boom_fields_two_top_tier_units_at_most_and_none_before_15_00_its_timing_none() {
    // Stelian, Nov 14: some Easy styles may field one or two top-tier units after about 15:00; the others stay at the
    // mid tier. Rich, against an idle player whose buildings never fall, its army kept under its cap as losses would.
    for (st, f) in [
        (Style::Boom, &HUMANS),
        (Style::Boom, &VAEL),
        (Style::Timing, &VAEL),
    ] {
        let mut w = World::with_size(
            4,
            0,
            MapKind::Standard,
            MapSize::square(96),
            0,
            &[&HUMANS, f],
        );
        assert!(w.set_ai_seats([false, true]));
        assert!(w.set_ai_styles(&[None, Some(st)]));
        for b in w.bldgs.iter_mut().filter(|b| b.team == PLAYER) {
            (b.hp, b.maxhp) = (1e9, 1e9);
        }
        let (mut most, mut first) = (0, None);
        let top = |w: &World| {
            let queued = w
                .bldgs
                .iter()
                .filter(|b| b.team == ENEMY)
                .flat_map(|b| b.queue.iter())
                .filter(|k| k.ai_tier() == 2)
                .count();
            queued
                + w.units
                    .iter()
                    .filter(|u| u.team == ENEMY && u.kind.ai_tier() == 2)
                    .count()
        };
        while w.time < 1500.0 {
            w.res[ENEMY as usize][0] = w.res[ENEMY as usize][0].max(1500);
            // (its army kept under its cap: five of its line units (a Knight comes one per four) and its top tier stay)
            if w.tick.is_multiple_of(30 * TPS) {
                let basic = w.factions[ENEMY as usize].ai.basic;
                let fighters: Vec<(bool, Id)> = w
                    .units
                    .iter()
                    .filter(|u| u.team == ENEMY && !u.kind.def().worker && u.kind.ai_tier() < 2)
                    .map(|u| (u.kind != basic, u.id))
                    .collect();
                let mut fighters = fighters;
                fighters.sort();
                for &(_, id) in fighters.iter().skip(5) {
                    w.damage(id, 1e9, None);
                }
            }
            w.step();
            w.events.clear();
            let n = top(&w);
            if n > 0 && first.is_none() {
                first = Some(w.time);
            }
            most = most.max(n);
        }
        let cap = w.tuning(ENEMY).top_max;
        if st == Style::Boom {
            assert!((1..=2).contains(&cap));
            assert!(
                most <= cap,
                "{} Boom: {most} top-tier, {cap} at most",
                f.name
            );
            assert!(
                first.is_none_or(|t| t >= 900.0),
                "{} Boom: from 15:00: {first:?}",
                f.name
            );
            assert!(most >= 1, "{} Boom: it does field one", f.name);
        } else {
            assert_eq!(most, 0, "{} Timing: the mid tier at most", f.name);
        }
    }
}
