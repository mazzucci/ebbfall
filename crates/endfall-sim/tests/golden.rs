//! Golden state hashes: whole games (the AI on, so its decisions and RNG draws count) and a scripted player, pinned
//! to literal hashes at a few ticks. Refactors must leave these unchanged; a rule change updates them on purpose
//! (run with `-- --nocapture` and copy the printed table).

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
const GAMES: [(&str, u32, usize, MapKind, bool, bool); 6] = [
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
];

const EXPECTED: [[u32; 3]; 6] = [
    [3305503495, 4049534581, 3519871719],
    [1618133316, 363769540, 807177099],
    [4257072518, 2522347270, 1018446728],
    [2651625201, 449198681, 2411182759],
    [3688206754, 964409724, 990646778],
    [521517577, 2271197018, 2287071912],
];

#[test]
fn golden_hashes_pin_behaviour_during_refactors() {
    let mut got = [[0u32; 3]; 6];
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
    println!("const EXPECTED: [[u32; 3]; 6] = {got:?};");
    assert_eq!(
        got, EXPECTED,
        "behaviour changed: update EXPECTED only for an intended rule change"
    );
}

/// A Vael player (the AI on the humans): pinned like the others; a Vael rule change updates it on purpose.
const EXPECTED_VAEL: [u32; 3] = [4015188100, 3170118862, 83416002];

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
