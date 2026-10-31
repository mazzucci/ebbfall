//! Golden state hashes: whole games (the AI on, so its decisions and RNG draws count) and a scripted player, pinned
//! to literal hashes at a few ticks. Refactors must leave these unchanged; a rule change updates them on purpose
//! (run with `-- --nocapture` and copy the printed table).

use endfall_sim::Game;
use endfall_sim::data::*;
use endfall_sim::map::MapKind;
use endfall_sim::world::World;

const CHECKS: [u32; 3] = [300, 2700, 9000]; // 10 s, 1.5 min, 5 min

fn world(seed: u32, diff: usize, kind: MapKind, swap: bool) -> World {
    World::with_map_side(seed, diff, kind, swap)
}

/// A player who builds a Depot and a Garrison, trains Troopers and sends them at the enemy.
fn scripted(w: &mut World, tick: u32) {
    let core = w
        .bldgs
        .iter()
        .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
        .map(|b| (b.id, b.tx, b.ty));
    let Some((core_id, cx, cy)) = core else {
        return;
    };
    let harv: Vec<_> = w
        .units
        .iter()
        .filter(|u| u.team == PLAYER && u.kind == UnitKind::Harvester)
        .map(|u| u.id)
        .collect();
    let place = |w: &mut World, kind: BldgKind, builder| {
        for r in 3..12 {
            for a in 0..16 {
                let ang = a as f64 / 16.0 * std::f64::consts::TAU;
                let (tx, ty) = (
                    (cx as f64 + 2.0 + ang.cos() * r as f64).round() as i32,
                    (cy as f64 + 2.0 + ang.sin() * r as f64).round() as i32,
                );
                if w.can_place(kind, tx, ty, PLAYER) {
                    let _ = w.place_building(PLAYER, kind, tx, ty, Some(builder));
                    return;
                }
            }
        }
    };
    match tick {
        30 => {
            let _ = w.queue_unit(core_id, UnitKind::Harvester);
        }
        900 if !harv.is_empty() => place(w, BldgKind::Depot, harv[0]),
        1500 if harv.len() > 1 => place(w, BldgKind::Barracks, harv[1]),
        t if t > 3000 && t % 300 == 0 => {
            if let Some(rax) = w
                .bldgs
                .iter()
                .find(|b| b.team == PLAYER && b.kind == BldgKind::Barracks && b.done)
                .map(|b| b.id)
            {
                let _ = w.queue_unit(rax, UnitKind::Trooper);
            }
            if t % 1800 == 0 {
                let (ex, ey) = w.map.bases[ENEMY as usize];
                let army: Vec<_> = w
                    .units
                    .iter()
                    .filter(|u| u.team == PLAYER && u.kind == UnitKind::Trooper)
                    .map(|u| u.id)
                    .collect();
                for u in army {
                    w.attack_move(u, ex as f64 * TILE, ey as f64 * TILE);
                }
            }
        }
        _ => {}
    }
}

/// (label, seed, diff, map, swapped, scripted player)
const GAMES: [(&str, u32, usize, MapKind, bool, bool); 7] = [
    ("ashen-easy", 4242, 0, MapKind::Standard, false, false),
    (
        "glass-medium-swapped",
        1998,
        1,
        MapKind::DeepFields,
        true,
        false,
    ),
    ("cinder-hard", 2077, 2, MapKind::Labyrinth, false, false),
    ("storm-medium", 77, 1, MapKind::EtherStorm, false, false),
    (
        "plains-hard-scripted",
        7,
        2,
        MapKind::OpenPlains,
        true,
        true,
    ),
    ("barren-easy-scripted", 21, 0, MapKind::Barren, false, true),
    (
        "ashen-brutal-scripted",
        1234,
        3,
        MapKind::Standard,
        false,
        true,
    ),
];

const EXPECTED: [[u32; 3]; 7] = [
    [225769678, 459449819, 2802894623],
    [1738558066, 628952134, 3770649902],
    [742342052, 3274588528, 1747652883],
    [3509870422, 1683228023, 977595460],
    [3143509957, 786269075, 2977629163],
    [360035449, 2521857241, 2429179824],
    [1762498007, 3662336395, 1068096813],
];

#[test]
fn golden_hashes_pin_behaviour_during_refactors() {
    let mut got = [[0u32; 3]; 7];
    for (g, &(label, seed, diff, kind, swap, script)) in GAMES.iter().enumerate() {
        let mut w = world(seed, diff, kind, swap);
        let mut c = 0;
        for tick in 1..=CHECKS[2] {
            if script {
                scripted(&mut w, tick);
            }
            w.step();
            if tick == CHECKS[c] {
                got[g][c] = w.state_hash();
                c += 1;
            }
        }
        println!("{label}: {:?}", got[g]);
    }
    println!("const EXPECTED: [[u32; 3]; 7] = {got:?};");
    assert_eq!(
        got, EXPECTED,
        "behaviour changed: update EXPECTED only for an intended rule change"
    );
}

/// A Vael player (the AI on the humans): pinned like the others; a Vael rule change updates it on purpose.
const EXPECTED_VAEL: [u32; 3] = [2926029440, 3232739583, 3920634432];

#[test]
fn golden_hashes_pin_a_vael_game() {
    let mut w = World::with_setup(4242, 1, MapKind::Standard, false, [&VAEL, &HUMANS]);
    let mut got = [0u32; 3];
    let mut c = 0;
    for tick in 1..=CHECKS[2] {
        w.step();
        if tick == CHECKS[c] {
            got[c] = w.state_hash();
            c += 1;
        }
    }
    println!("const EXPECTED_VAEL: [u32; 3] = {got:?};");
    assert_eq!(
        got, EXPECTED_VAEL,
        "a Vael game changed: update EXPECTED_VAEL only for an intended rule change"
    );
}

/// The two AIs, Vael against Humans: pins the Vael units, their AI and the matchup's balance in play.
const EXPECTED_VAEL_AI: [u32; 3] = [4134931756, 2318313087, 1102872078];

#[test]
fn golden_hashes_pin_a_vael_ai_against_the_human_ai() {
    let mut w = World::with_setup(77, 1, MapKind::Standard, false, [&VAEL, &HUMANS]);
    w.set_ai_seats([true, true]);
    let mut got = [0u32; 3];
    let mut c = 0;
    for tick in 1..=CHECKS[2] {
        w.step();
        w.events.clear();
        if tick == CHECKS[c] {
            got[c] = w.state_hash();
            c += 1;
        }
    }
    println!("const EXPECTED_VAEL_AI: [u32; 3] = {got:?};");
    assert!(
        w.units.iter().any(|u| u.team == 0 && !u.kind.def().worker),
        "the Vael AI fielded an army"
    );
    assert_eq!(
        got, EXPECTED_VAEL_AI,
        "the Vael AI game changed: update EXPECTED_VAEL_AI only for an intended rule change"
    );
}

/// What the state hash does not cover, pinned too: each seat's end-card stats (built, lost, killed, razed), what it
/// lost to, and the result (over, winner, conceded, the tick it ended) of whole games: two AIs, and the scripted
/// player against the AI. Kill credit and victory rules change these; refactors must not.
fn results(w: &World, tick: u32) -> String {
    let seats = (0..2)
        .map(|s| {
            let st = &w.stats[s];
            let lost: u32 = w.lost_to[s].iter().sum();
            format!(
                "{}/{}/{}/{} lost_to {}",
                st.built, st.lost, st.killed, st.razed, lost
            )
        })
        .collect::<Vec<_>>()
        .join(" | ");
    format!(
        "{seats} | over {} winner {} conceded {} at {tick}",
        w.over, w.winner, w.conceded
    )
}

const RESULT_GAMES: [(u32, usize, MapKind, bool); 3] = [
    (77, 1, MapKind::Standard, false),
    (2077, 3, MapKind::Labyrinth, false),
    (7, 2, MapKind::OpenPlains, true),
];

const EXPECTED_RESULTS: [&str; 3] = [
    "99/103/65/0 lost_to 103 | 114/65/103/24 lost_to 65 | over true winner 1 conceded -1 at 23056",
    "125/44/77/37 lost_to 44 | 73/77/44/0 lost_to 77 | over true winner 0 conceded -1 at 14543",
    "11/15/1/0 lost_to 15 | 33/1/15/2 lost_to 1 | over true winner 1 conceded -1 at 8540",
];

#[test]
fn golden_results_pin_stats_and_victory() {
    let mut got = Vec::new();
    for (g, &(seed, diff, kind, script)) in RESULT_GAMES.iter().enumerate() {
        let mut w = world(seed, diff, kind, false);
        if !script {
            w.set_ai_seats([true, true]);
        }
        let mut tick = 0;
        while !w.over && tick < 36000 {
            tick += 1;
            if script {
                scripted(&mut w, tick);
            }
            w.step();
            w.events.clear();
        }
        let r = results(&w, tick);
        println!("{g}: {r}");
        got.push(r);
    }
    println!("const EXPECTED_RESULTS: [&str; 3] = {got:?};");
    assert_eq!(
        got, EXPECTED_RESULTS,
        "stats or results changed: update EXPECTED_RESULTS only on purpose"
    );
}

/// Two against two, every seat an AI, on 96x96 (built as the menus build it, `Game::with_seats`): pins teams, shared
/// vision and the AIs' play with allies. Its WASM copy is "teams-2v2-ai" in src/engine/golden.js.
const EXPECTED_TEAMS_AI: [u32; 3] = [2856260489, 2988045713, 1766926839];

#[test]
fn golden_hashes_pin_two_against_two_ais() {
    let mut g = Game::with_seats(
        31,
        1,
        0,
        0,
        &[0, 1, 0, 1],
        &[0, 0, 1, 1],
        &[1, 1, 1, 1],
        0,
        Some(96),
    )
    .unwrap();
    let mut got = [0u32; 3];
    let mut c = 0;
    for tick in 1..=CHECKS[2] {
        g.step();
        let _ = g.drain_events(); // (as a client does)
        if tick == CHECKS[c] {
            got[c] = g.state_hash();
            c += 1;
        }
    }
    println!("const EXPECTED_TEAMS_AI: [u32; 3] = {got:?};");
    assert_eq!(
        got, EXPECTED_TEAMS_AI,
        "the 2v2 AI game changed: update EXPECTED_TEAMS_AI (and golden.js) only for an intended rule change"
    );
}
