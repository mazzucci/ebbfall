//! Plans for an AI seat (play against Claude, claude/PLAN_VOCAB.md): a plan is clamped and noted, refused in lockstep,
//! recorded and replayed exactly with its deltas on their ticks; an empty plan plays as Hard does; a field wins over the
//! style; the dare (`wont_build`) holds and never takes the line unit; later waves gather (`m`); intents act; a bad code
//! changes nothing; check-ins move no hash.

use super::common::*;
use endfall_sim::summary::{self, Summary};

/// A two-seat game on a 64x64 map: the person at seat 0, the AI (the Kingdom, or `foe`'s people) at seat 1.
fn game(seed: u32, foe: u32) -> Game {
    Game::with_size(seed, 1, 0, 0, 0, foe, 64).unwrap()
}

/// Two AI seats on `size`: seat 0 Hard with `plan` (None: plain Hard), seat 1 Hard; the Kingdom both, or `races`.
fn duel(seed: u32, size: i32, races: [&'static Faction; 2], plan: Option<&str>) -> World {
    let mut w = World::with_size(seed, 2, MapKind::Standard, MapSize::square(size), 0, &races);
    assert!(w.set_ai_seats([true, true]) && w.set_diffs(&[2, 2]));
    if let Some(p) = plan {
        w.set_plan(0, p).expect("a plan");
    }
    w
}

/// The size of each wave seat `seat` sends in `secs` (its units as it goes).
fn waves(w: &mut World, seat: u8, secs: u32) -> Vec<usize> {
    let (mut out, mut was) = (Vec::new(), false);
    for _ in 0..secs * TPS {
        w.step();
        w.events.clear();
        let now = w.ai_wave_of(seat);
        if let (Some(ids), false) = (now, was) {
            out.push(ids.len());
        }
        was = now.is_some();
        if w.over {
            break;
        }
    }
    out
}

#[test]
fn a_plan_is_clamped_and_noted_plays_hard_and_is_only_for_an_ai_seat_before_play() {
    let mut g = game(3, 0);
    assert_eq!(g.set_plan(1, "1.w40.f1m.ncannon.nguard.m99"), "");
    assert_eq!(g.plan_code(1), "1.w20.f2m.ncannon.m40");
    let notes = g.plan_notes();
    for s in ["workers 40", "first wave 1:00", "guard", "later waves 99"] {
        assert!(notes.contains(s), "{s}: {notes}");
    }
    assert_eq!(g.diff_of(1), 2, "a planned seat plays Hard");
    // a person's seat, no such seat, not a code: refused, and the plan as it was
    assert!(!g.set_plan(0, "1.w14").is_empty());
    assert!(!g.set_plan(7, "1.w14").is_empty());
    for bad in ["", "1.w14.w15", "2.w14", "1.w14;drop", "1.<b>", "1.pguards"] {
        assert!(!g.set_plan(1, bad).is_empty(), "{bad}");
    }
    assert_eq!(g.plan_code(1), "1.w20.f2m.ncannon.m40");
    g.step();
    assert!(
        !g.set_plan(1, "1.w12").is_empty(),
        "before the game starts only"
    );
}

#[test]
fn plans_and_deltas_are_refused_in_lockstep_and_a_plan_set_before_is_dropped() {
    let mut g = game(4, 0);
    g.start_lockstep();
    assert!(!g.set_plan(1, "1.w14").is_empty());
    assert!(!g.plan_delta(1, "1.xattack").is_empty());
    assert_eq!(g.plan_code(1), "");
    let mut h = game(4, 0);
    assert_eq!(h.set_plan(1, "1.w14"), "");
    h.start_lockstep();
    assert_eq!(h.plan_code(1), "", "no plan in an online game");
}

#[test]
fn a_planned_game_with_deltas_and_orders_replays_exactly() {
    for seed in [5u32, 21] {
        let mut g = game(seed, seed % 2);
        assert_eq!(g.set_plan(1, "1.w13.f3m.s6.m12.ono"), "");
        let mut r = Mulberry32::new(seed ^ 0x9a17);
        let mut hashes = Vec::new();
        for tick in 0..30 * 300 {
            if tick % 9 == 0 {
                random_order_with(&mut g, &mut r, false);
            }
            match tick {
                3000 => assert_eq!(g.plan_delta(1, "1.xattack.g1m"), ""),
                5400 => assert_eq!(g.plan_delta(1, "1.o5m.xpull"), ""),
                6000 => assert!(!g.plan_delta(1, "1.junk").is_empty()), // (refused: nothing recorded)
                7000 => assert_eq!(g.plan_delta(1, "1.xmass.xhold"), ""),
                _ => {}
            }
            g.step();
            hashes.push(g.state_hash());
        }
        assert_eq!(g.plan_code(1), "1.w13.f3m.s6.o5m.m12.g1m");
        assert!(g.start_replay(), "a planned game can be watched again");
        for (i, want) in hashes.iter().enumerate() {
            g.step();
            assert_eq!(
                g.state_hash(),
                *want,
                "seed {seed}: the replay diverged at tick {}",
                i + 1
            );
        }
        assert_eq!(
            g.plan_code(1),
            "1.w13.f3m.s6.o5m.m12.g1m",
            "the replay's plan, its deltas played"
        );
    }
}

#[test]
fn the_same_plan_and_deltas_give_the_same_game() {
    let play = || {
        let mut g = game(9, 1);
        assert_eq!(g.set_plan(1, "1.w15.e5m.pdrone.nbuggy"), "");
        let mut hs = Vec::new();
        for tick in 0..30 * 240 {
            if tick == 4000 {
                g.plan_delta(1, "1.xattack.m9");
            }
            g.step();
            hs.push(g.state_hash());
        }
        hs
    };
    assert_eq!(play(), play());
}

#[test]
fn an_empty_plan_plays_exactly_as_hard_and_a_field_wins_over_the_style() {
    // The same seed, plain Hard and Hard with the empty plan: the same style, tuning and game (the plan is in the
    // hash, so compare what the seats do).
    let mut a = duel(7, 64, [&HUMANS, &VAEL], None);
    let mut b = duel(7, 64, [&HUMANS, &VAEL], Some("1"));
    for _ in 0..30 * 360 {
        a.step();
        b.step();
    }
    assert_eq!(a.ai_style(0), b.ai_style(0));
    assert_eq!(a.tuning(0), b.tuning(0));
    let state = |w: &World| -> Vec<(u32, i64, i64)> {
        w.units
            .iter()
            .map(|u| (u.id, (u.x * 16.0) as i64, (u.y * 16.0) as i64))
            .collect()
    };
    assert_eq!(state(&a), state(&b));
    assert_eq!(a.res, b.res);
    assert_ne!(
        a.state_hash(),
        b.state_hash(),
        "a plan is recorded in the hash"
    );
    // A forced Pressure style (its first wave 30 s sooner, its natural later, its top tier 2:00 later): the plan's
    // fields win.
    let mut w = duel(7, 64, [&HUMANS, &HUMANS], Some("1.f5m.e6m.k7m"));
    assert!(w.set_ai_styles(&[Some(Style::Pressure), None]));
    run(&mut w, 1);
    let d = w.tuning(0);
    assert_eq!(w.ai_style(0), Some(Style::Pressure));
    assert_eq!(
        (d.first, d.expand_at, d.expand_shift, d.tier_at[0]),
        (300.0, 360.0, 0.0, 420.0)
    );
}

#[test]
fn wont_build_holds_and_never_takes_the_line_unit() {
    // The Kingdom dares away its Archers and asks to drop its Guards too: the Guards stay, no Archer is ever trained,
    // and it still fields an army; the Expedition dares away its Buggies and Drones likewise.
    for (f, code, banned, line) in [
        (
            &HUMANS,
            "1.narcher.nguard",
            vec![UnitKind::Lancer],
            UnitKind::Trooper,
        ),
        (
            &VAEL,
            "1.nbuggy.ndrone.nsellsword",
            vec![UnitKind::Scythe, UnitKind::Shrike],
            UnitKind::Prism,
        ),
    ] {
        let mut w = duel(11, 96, [f, &HUMANS], Some(code));
        assert_eq!(w.plan_of(0).unwrap().wont_build, banned);
        let mut s = Summary::new(&w);
        for _ in 0..30 * 480 {
            w.step();
            w.events.clear();
            s.observe(&w);
            for k in &banned {
                assert_eq!(count(&w, 0, *k), 0, "{k:?} trained");
            }
        }
        assert!(
            count(&w, 0, line) + w.stats[0].lost as usize > 5,
            "its line unit fields an army"
        );
        let json = s.json(&w, false);
        assert!(json.contains("\"wont_build\":{\"units\":["), "{json}");
        assert!(
            json.contains("\"trained\":0}"),
            "the summary shows it kept its word"
        );
    }
}

#[test]
fn later_waves_gather_to_their_least_count() {
    // Plain Hard's later waves trickle (as few as half their count, crushing or pushing); with `m20` every wave after
    // the first leaves with twenty units at least, unless at its cap.
    let mut plain = duel(3, 96, [&HUMANS, &HUMANS], None);
    let mut massed = duel(3, 96, [&HUMANS, &HUMANS], Some("1.m20"));
    let p = waves(&mut plain, 0, 22 * 60);
    let m = waves(&mut massed, 0, 22 * 60);
    assert!(m.len() >= 2, "it attacked again: {m:?}");
    let capped = massed.supply[0][0] >= massed.supply[0][1] - 2;
    assert!(capped || m[1..].iter().all(|&n| n >= 20), "massed: {m:?}");
    assert!(
        p[1..].iter().any(|&n| n < 20),
        "plain Hard's trickle: {p:?}"
    );
}

#[test]
fn intents_attack_now_hold_pull_back_and_mass() {
    // Attack now: a wave leaves at the seat's next turn, long before its first wave's time and count.
    let mut w = duel(5, 64, [&HUMANS, &HUMANS], Some("1.f12m.s16"));
    run(&mut w, 270);
    let army = |w: &World| {
        w.units
            .iter()
            .filter(|u| u.team == 0 && !u.kind.def().worker)
            .count()
    };
    assert!(w.ai_wave_of(0).is_none() && army(&w) > 0 && army(&w) < 16);
    w.plan_delta(0, "1.xattack").unwrap();
    run(&mut w, 2);
    assert!(
        w.ai_wave_of(0).is_some(),
        "it went at once: {:?} {:?} army {}",
        w.ai_notes(0),
        w.ai_trace(0),
        w.units
            .iter()
            .filter(|u| u.team == 0 && !u.kind.def().worker)
            .count()
    );
    // Pull back: the wave out comes home.
    w.plan_delta(0, "1.xpull").unwrap();
    run(&mut w, 2);
    assert!(w.ai_wave_of(0).is_none(), "it came home");
    assert_eq!(
        w.ai_notes(0).unwrap().ended,
        Some(endfall_sim::world::WaveEnd::PulledBack)
    );
    // Mass: its next wave waits for half again its count. Hold: no wave for two minutes, even ordered later... until
    // an attack now ends the hold.
    let before = w.ai_next_wave(0).unwrap();
    w.plan_delta(0, "1.xmass.xhold.f2m.s4.g0m30").unwrap();
    assert!(w.ai_next_wave(0).unwrap() >= before + 4);
    let held = waves(&mut w, 0, 100);
    assert!(held.is_empty(), "held home: {held:?}");
    w.plan_delta(0, "1.xattack").unwrap();
    run(&mut w, 2);
    assert!(w.ai_wave_of(0).is_some(), "an attack now ends the hold");
}

#[test]
fn a_bad_code_or_a_seat_without_a_plan_changes_nothing() {
    let mut w = duel(8, 64, [&HUMANS, &VAEL], Some("1.w14"));
    run(&mut w, 10);
    let h = w.state_hash();
    for bad in [
        "",
        "1",
        "1.w14.w14",
        "1.zz",
        "1.x",
        "x1.w14",
        "1.f6m.xdance",
        &"1.w14".repeat(40),
    ] {
        if bad == "1" {
            continue; // (an empty delta is a delta: nothing changes either way)
        }
        assert!(w.plan_delta(0, bad).is_err(), "{bad}");
    }
    assert!(w.plan_delta(1, "1.xattack").is_err(), "seat 1 has no plan");
    assert_eq!(w.state_hash(), h);
    assert_eq!(w.plan_of(0).unwrap().code(), "1.w14");
}

#[test]
fn check_ins_move_no_hash_and_show_only_what_the_seat_saw() {
    // The same planned game with and without check-ins: the same hashes. The first check-in comes at 2:00, seat 0's
    // plan in force and only what its sight shows of the enemy.
    let mut a = duel(2, 64, [&HUMANS, &VAEL], Some("1.w14.m16"));
    let mut b = duel(2, 64, [&HUMANS, &VAEL], Some("1.w14.m16"));
    let mut s = Summary::new(&b);
    s.check_in_for(Some(0));
    let mut digests = Vec::new();
    for _ in 0..30 * 420 {
        a.step();
        b.step();
        s.observe(&b);
        assert_eq!(a.state_hash(), b.state_hash());
        while let Some(d) = s.take_check_in() {
            // (the enemy army in sight is what seat 0's sight shows now, by value)
            let seen: i32 = b
                .seen(0)
                .iter()
                .filter_map(|&id| b.unit(id))
                .filter(|u| !u.kind.def().worker)
                .map(|u| u.kind.def().cost[0])
                .sum();
            assert!(d.contains(&format!("\"army_value\":{seen},")), "{d}");
            digests.push((b.tick, d));
        }
    }
    assert!(digests.len() >= 3, "{}", digests.len());
    let (tick, first) = &digests[0];
    assert_eq!(*tick, 120 * TPS);
    assert!(
        first.contains("\"kind\":\"checkin\"") && first.contains("\"plan\":\"1.w14.m16\""),
        "{first}"
    );
    assert!(
        first.len() < 4 * 1024,
        "a short digest: {} bytes",
        first.len()
    );
    assert_eq!(s.check_ins_made(), digests.len());
    let _ = summary::play; // (the native helper stays the lab's)
}

#[test]
fn a_game_seed_plays_a_fresh_game_on_the_same_map_and_replays_it() {
    // The same map (Standard 64x64, seed 7) and plan, game seeds 1 to 6: the map's ground is the same each time, Hard's
    // style draw is not always; the same game seed gives the same game, its replay included.
    let mut styles = Vec::new();
    let mut rock = None;
    for gs in 1..=6u32 {
        let mut w = duel(7, 64, [&HUMANS, &HUMANS], Some("1.w14"));
        w.set_game_seed(gs).unwrap();
        run(&mut w, 1);
        styles.push(w.ai_style(1));
        assert!(
            rock.get_or_insert_with(|| w.map.rock.clone()) == &w.map.rock,
            "the same map"
        );
    }
    styles.dedup();
    assert!(styles.len() > 1, "fresh style draws: {styles:?}");
    let play = |gs: u32| {
        let mut g = game(7, 0);
        assert_eq!(g.set_game_seed(gs), "");
        assert_eq!(g.set_plan(1, "1.w14"), "");
        (0..30 * 90)
            .map(|_| {
                g.step();
                g.state_hash()
            })
            .collect::<Vec<u32>>()
    };
    assert_eq!(play(3), play(3));
    assert_ne!(play(3), play(4));
    let mut g = game(7, 0);
    assert_eq!(g.set_game_seed(5), "");
    let hs: Vec<u32> = (0..30 * 60)
        .map(|_| {
            g.step();
            g.state_hash()
        })
        .collect();
    assert!(!g.set_game_seed(6).is_empty(), "before play only");
    assert!(g.start_replay());
    for want in hs {
        g.step();
        assert_eq!(g.state_hash(), want, "the replay keeps its game seed");
    }
    // Online: refused, and one set before is dropped (every client's world the same)
    let mut online = game(7, 0);
    assert_eq!(online.set_game_seed(9), "");
    online.start_lockstep();
    assert!(!online.set_game_seed(9).is_empty());
    assert_eq!(online.world().game_seed, None);
    assert_eq!(online.world().state_hash(), game(7, 0).world().state_hash());
}

#[test]
fn check_ins_tell_a_base_under_attack_and_never_go_dark() {
    // Seat 0's base and its six Guards fall to twenty Knights of seat 1's from 3:30: events say what fell, in its own words ("your main
    // base"), and the check-ins keep coming at least every 2:20 while it happens (an event never swallows them).
    let mut w = duel(4, 64, [&HUMANS, &HUMANS], Some("1.w12"));
    let mut s = Summary::new(&w);
    s.check_in_for(Some(0));
    let mut digests: Vec<(u32, String)> = Vec::new();
    let step = |w: &mut World, s: &mut Summary, digests: &mut Vec<(u32, String)>| {
        w.step();
        w.events.clear();
        s.observe(w);
        while let Some(d) = s.take_check_in() {
            digests.push((w.tick, d));
        }
    };
    for _ in 0..30 * 210 {
        step(&mut w, &mut s, &mut digests);
    }
    let (cx, cy) = core(&w, 0);
    // (its home army: six Guards by its Castle)
    for i in 0..6 {
        w.make_unit(
            UnitKind::Trooper,
            0,
            (cx as f64 + 5.0) * TILE,
            (cy as f64 + i as f64) * TILE,
        );
    }
    w.recalc_supply(0);
    for i in 0..20 {
        let k = w.make_unit(
            UnitKind::Knight,
            1,
            (cx as f64 + 12.0) * TILE,
            (cy as f64 + i as f64 * 0.5) * TILE,
        );
        w.attack_move(k, (cx as f64 + 2.0) * TILE, (cy as f64 + 2.0) * TILE);
    }
    for _ in 0..30 * 300 {
        step(&mut w, &mut s, &mut digests);
        if w.out[0] {
            break;
        }
    }
    let all: String = digests.iter().map(|d| d.1.as_str()).collect();
    assert!(
        all.contains(" fell at your main base"),
        "a building of its fell: {all}"
    );
    assert!(all.contains("your army was wiped out at home"), "{all}");
    assert!(!all.contains("seat 0's"), "its own words");
    for pair in digests.windows(2) {
        assert!(
            pair[1].0 - pair[0].0 <= (120 + 20) * TPS,
            "dark from {} to {}",
            pair[0].0 / TPS,
            pair[1].0 / TPS
        );
    }
    assert!(
        digests
            .iter()
            .all(|d| d.1.contains("\"money_name\":\"gold\""))
    );
}
