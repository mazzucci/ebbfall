//! The game summary (crates/endfall-sim/src/summary/): deterministic, read-only (no state hash moves), each seat's view
//! of its foes from its own sight only, a person's attacks found by where its units go, and small enough to read.

use super::common::*;
use endfall_sim::summary::{self, Summary};

/// The part of the summary for seat 0's view of its foes (its `saw_of_enemies`, up to seat 1's record).
fn seat0_saw(json: &str) -> &str {
    let from = json.find("\"saw_of_enemies\":").expect("seat 0's view");
    let to = json.find("{\"seat\":1,").expect("seat 1's record");
    &json[from..to]
}

/// Two seats on 96x96, nobody an AI: nothing moves unless told.
fn quiet() -> World {
    let mut w = World::with_size(
        5,
        1,
        MapKind::Standard,
        MapSize::square(96),
        0,
        &[&HUMANS, &VAEL],
    );
    assert!(w.set_ai_seats(vec![false; 2]));
    w
}

/// Open ground near the middle of the map, out of seat 0's sight (tiles).
fn middle(w: &World) -> (i32, i32) {
    let (tx, ty) = w
        .map
        .nearest_free(w.map.w / 2, w.map.h / 2, 8)
        .expect("open ground");
    for y in ty..ty + 4 {
        for x in tx..tx + 4 {
            assert_eq!(
                w.vis[0][w.map.idx(x, y)],
                0,
                "seat 0 does not see the middle"
            );
        }
    }
    (tx, ty)
}

#[test]
fn the_same_seed_and_orders_give_the_same_summary() {
    // A person (random orders, including nonsense) against Medium, twice: the same summary, byte for byte.
    let play = || {
        let mut g = Game::with_seats(9, 1, 0, 0, &[0, 1], &[], &[0, 1], 0, Some(96)).unwrap();
        let mut r = Mulberry32::new(77);
        for t in 0..6 * 60 * TPS {
            if t % 10 == 0 {
                random_order(&mut g, &mut r);
            }
            g.step();
        }
        (g.summary_json(), g.state_hash())
    };
    let (a, ha) = play();
    let (b, hb) = play();
    assert_eq!(ha, hb);
    assert_eq!(a, b, "the same summary");
    assert!(a.starts_with("{\"about\":") && a.contains("\"seats\":[{\"seat\":0,"));
    assert!(a.contains("\"how\":\"unfinished\""), "a game still playing");
}

#[test]
fn the_summary_moves_no_state_hash() {
    // Medium against Medium for five minutes, one world summarized and one not: the same hash at every tick.
    let make = || {
        World::with_size(
            4,
            1,
            MapKind::Standard,
            MapSize::square(96),
            0,
            &[&HUMANS, &VAEL],
        )
    };
    let (mut a, mut b) = (make(), make());
    assert!(a.set_ai_seats(vec![true; 2]) && b.set_ai_seats(vec![true; 2]));
    let mut s = Summary::new(&a);
    for _ in 0..5 * 60 * TPS {
        a.step();
        s.observe(&a);
        let _ = s.json(&a, false); // (reading it too, now and then would do; every tick is the stricter check)
        b.step();
        assert_eq!(a.state_hash(), b.state_hash(), "tick {}", a.tick);
    }
    // and through the Game: reading the summary leaves the hash
    let mut g = Game::with_seats(4, 1, 0, 0, &[0, 1], &[], &[1, 1], 0, Some(96)).unwrap();
    for _ in 0..60 * TPS {
        g.step();
    }
    let h = g.state_hash();
    let _ = g.summary_json();
    assert_eq!(g.state_hash(), h);
}

#[test]
fn a_seat_sees_of_its_foe_only_what_its_sight_showed() {
    // Seat 1 raises a Factory and a Data center (an expansion) in the middle, out of seat 0's sight: the summary's
    // seat 0 never saw them, and `seen` does not list them, until a Guard of seat 0 walks up.
    let mut w = quiet();
    let (tx, ty) = middle(&w);
    let mut s = Summary::new(&w);
    let kind = BLDG_KINDS
        .into_iter()
        .find(|k| k.def().name == "Factory")
        .unwrap();
    let factory = w.make_building(kind, 1, tx, ty, true);
    let (hx, hy) = (tx + 6, ty);
    let hq = w.make_building(VAEL.hq, 1, hx, hy, true);
    for _ in 0..10 * TPS {
        w.step();
        s.observe(&w);
    }
    assert!(!w.seen(0).contains(&factory) && !w.seen(0).contains(&hq));
    let json = s.json(&w, false);
    let saw = seat0_saw(&json);
    assert!(
        !saw.contains("\"Factory\"") && !saw.contains("\"Data center\""),
        "{saw}"
    );
    assert!(saw.contains("\"expansions_seen\":[]"), "{saw}");
    // (seat 1 knows its own: its record lists them as built)
    assert!(
        json.contains(
            "\"buildings_completed\":{\"Data center\":[\"0:00\"],\"Factory\":[\"0:00\"]}"
        ),
        "{json}"
    );
    // a Guard of seat 0 comes in sight of them
    let guard = w.make_unit(
        UnitKind::Trooper,
        0,
        (tx as f64 + 5.0) * TILE,
        (ty as f64 + 5.5) * TILE,
    );
    w.hold_unit(guard);
    for _ in 0..2 * TPS {
        w.step();
        s.observe(&w);
    }
    assert!(w.seen(0).contains(&factory) && w.seen(0).contains(&hq));
    let json = s.json(&w, false);
    let saw = seat0_saw(&json);
    assert!(
        saw.contains("\"Factory\":\"0:1") && saw.contains("\"Data center\":\"0:1"),
        "{saw}"
    );
    assert!(
        saw.contains(&format!("\"tile\":\"{hx},{hy}\"")),
        "the expansion seen: {saw}"
    );
}

#[test]
fn a_persons_attack_is_its_units_come_to_the_enemys_buildings() {
    // Four Guards of seat 0 (a person's) are set down by seat 1's headquarters: an attack on seat 1, with its four.
    let mut w = quiet();
    let core = w
        .bldgs
        .iter()
        .find(|b| b.team == 1 && b.kind.def().hq)
        .map(|b| (b.x, b.y))
        .unwrap();
    let mut s = Summary::new(&w);
    for i in 0..4 {
        let g = w.make_unit(
            UnitKind::Trooper,
            0,
            core.0 - 6.0 * TILE,
            core.1 + i as f64 * 20.0,
        );
        w.attack_move(g, core.0, core.1);
    }
    for _ in 0..20 * TPS {
        w.step();
        s.observe(&w);
    }
    let json = s.json(&w, false);
    let seat0 = &json[..json.find("{\"seat\":1,").unwrap()];
    assert!(
        seat0.contains(
            "\"attacks\":[{\"started\":\"0:00\",\"units\":4,\"composition\":{\"Guard\":4}"
        ),
        "{seat0}"
    );
    assert!(
        seat0.contains("\"target_seat\":1,\"where\":\"seat 1's main base"),
        "{seat0}"
    );
    assert!(seat0.contains("\"attacks_are\":\"its fighting units coming near enemy buildings\""));
}

#[test]
fn a_fifteen_minute_game_summarizes_in_under_eight_kilobytes() {
    // Medium against Medium on 96x96, the Kingdom against the Expedition, fifteen minutes (or its end).
    let mut w = World::with_size(
        3,
        1,
        MapKind::Standard,
        MapSize::square(96),
        0,
        &[&HUMANS, &VAEL],
    );
    assert!(w.set_ai_seats(vec![true; 2]));
    let s = summary::play(&mut w, 15 * 60 * TPS);
    let json = s.json(&w, w.winner < 0);
    assert!(json.len() < 8 * 1024, "{} bytes", json.len());
    for key in [
        "\"result\":",
        "\"economy\":",
        "\"workers_over_time\":",
        "\"income_per_min_over_time\":",
        "\"units_trained\":",
        "\"buildings_completed\":",
        "\"attacks\":[{",
        "\"main_fights\":[{",
        "\"saw_of_enemies\":[{",
    ] {
        assert!(json.contains(key), "{key}");
    }
    // every unit type a people trains is counted, the zeros too
    for k in UNIT_KINDS {
        let trains = |f: &Faction| {
            std::iter::once(f.hq)
                .chain(f.build_basic.iter().copied())
                .chain(f.build_advanced.iter().copied())
                .any(|b| b.def().trains.contains(&k))
        };
        if trains(&HUMANS) || trains(&VAEL) {
            assert!(
                json.contains(&format!("\"{}\":", k.def().name)),
                "{}",
                k.def().name
            );
        }
    }
}
