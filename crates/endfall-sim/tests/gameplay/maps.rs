//! Maps: every kind is walkable, fair and mirrored; sides can trade bases.

use super::common::*;

#[test]
fn every_map_kind_generates_a_sound_map_with_its_character() {
    let rock_share =
        |w: &World| w.map.rock.iter().filter(|&&r| r != 0).count() as f64 / w.map.rock.len() as f64;
    // Rock share per kind, summed over the seeds: a single seed may need its rock relaxed to connect the fields.
    let mut rock = [0.0f64; 3]; // standard, open plains, labyrinth
    // (2, 6, 18, 21: seeds whose Labyrinth once walled off whole fields)
    for seed in [1, 2, 3, 6, 18, 21, 77, 1998, 2077, 4242, 99999] {
        rock[0] += rock_share(&World::new(seed, 1));
        let std = World::new(seed, 1);
        let std_shards: i32 = std
            .map
            .nodes
            .iter()
            .filter(|n| !n.ether)
            .map(|n| n.amount)
            .sum();
        let std_ether: i32 = std
            .map
            .nodes
            .iter()
            .filter(|n| n.ether)
            .map(|n| n.amount)
            .sum();
        let std_vents = std.map.nodes.iter().filter(|n| n.ether).count();
        for kind in MapKind::ALL {
            let w = World::with_map(seed, 1, kind);
            assert!(
                w.map.connected(w.map.bases[0], w.map.bases[1]),
                "seed {seed} {kind:?}: the bases connect"
            );
            // Every field owns its tiles (an extra vent must not land on a shard field).
            for n in &w.map.nodes {
                let size = if n.ether { 2 } else { 1 };
                for y in 0..size {
                    for x in 0..size {
                        assert_eq!(
                            w.map.occ[((n.ty + y) * MW + n.tx + x) as usize],
                            -(n.id as i32),
                            "seed {seed} {kind:?}: node {} owns its tiles",
                            n.id
                        );
                    }
                }
            }
            // Every field can be reached from the player's base: some open tile next to it connects.
            for n in &w.map.nodes {
                let size = if n.ether { 2 } else { 1 };
                let reachable = (-1..=size).any(|dy| {
                    (-1..=size).any(|dx| {
                        let (x, y) = (n.tx + dx, n.ty + dy);
                        x > 0
                            && y > 0
                            && x < MW - 1
                            && y < MH - 1
                            && w.map.rock[(y * MW + x) as usize] == 0
                            && w.map.occ[(y * MW + x) as usize] == 0
                            && w.map.connected(w.map.bases[0], (x, y))
                    })
                });
                assert!(
                    reachable,
                    "seed {seed} {kind:?}: the field at {},{} can be reached",
                    n.tx, n.ty
                );
            }
            let shards: i32 = w
                .map
                .nodes
                .iter()
                .filter(|n| !n.ether)
                .map(|n| n.amount)
                .sum();
            let ether: i32 = w
                .map
                .nodes
                .iter()
                .filter(|n| n.ether)
                .map(|n| n.amount)
                .sum();
            let vents = w.map.nodes.iter().filter(|n| n.ether).count();
            match kind {
                MapKind::DeepFields => {
                    assert_eq!(shards, std_shards * 10, "seed {seed}: ten times the shards")
                }
                MapKind::EtherStorm => assert!(
                    vents > std_vents && ether > std_ether * 3,
                    "seed {seed}: more, richer vents"
                ),
                MapKind::Barren => assert!(
                    shards < std_shards / 2 && ether < std_ether,
                    "seed {seed}: picked clean"
                ),
                MapKind::OpenPlains => rock[1] += rock_share(&w),
                MapKind::Labyrinth => rock[2] += rock_share(&w),
                MapKind::Standard => assert_eq!(shards, std_shards),
            }
        }
    }
    assert!(
        rock[1] < rock[0] * 0.8,
        "open plains have clearly less rock: {rock:?}"
    );
    assert!(rock[2] > rock[0] * 1.2, "labyrinths clearly more: {rock:?}");
}

#[test]
fn maps_are_walkable_mirrored_and_fair_from_the_first_minute() {
    use endfall_sim::map::MapKind;
    let seeds: u32 = if cfg!(debug_assertions) { 30 } else { 300 };
    for seed in 0..seeds {
        for kind in [MapKind::Standard, MapKind::Labyrinth] {
            let w = World::with_map(seed, 1, kind);
            // Walkable: from beside the player's Core to beside the enemy's, and to every field (crystals block).
            let (p, e) = (w.map.bases[0], w.map.bases[1]);
            let start = w.map.nearest_free(p.0 + 1, p.1 + 4, 6).unwrap();
            let reach = reachable(&w, start);
            let near = |x: i32, y: i32, s: i32| {
                (-1..=s).any(|dy| {
                    (-1..=s).any(|dx| {
                        let (tx, ty) = (x + dx, y + dy);
                        in_map(tx, ty) && reach[(ty * MW + tx) as usize]
                    })
                })
            };
            assert!(
                near(e.0, e.1, 4),
                "seed {seed} {kind:?}: the bases can walk to each other"
            );
            for n in &w.map.nodes {
                assert!(
                    near(n.tx, n.ty, if n.ether { 2 } else { 1 }),
                    "seed {seed} {kind:?}: the field at {},{} can be reached",
                    n.tx,
                    n.ty
                );
                // Mirrored tile for tile (a vent is 2x2, so its mirror starts one tile further in).
                let m = if n.ether {
                    (MW - 2 - n.tx, MH - 2 - n.ty)
                } else {
                    (MW - 1 - n.tx, MH - 1 - n.ty)
                };
                assert!(
                    w.map
                        .nodes
                        .iter()
                        .any(|o| o.ether == n.ether && (o.tx, o.ty) == m && o.amount == n.amount),
                    "seed {seed} {kind:?}: the field at {},{} has its mirror twin",
                    n.tx,
                    n.ty
                );
            }
        }
    }
    // A fair start: two minutes of mining with the four first harvesters gives both sides the same shards.
    for seed in 0..if cfg!(debug_assertions) { 8 } else { 60 } {
        let mut w = World::new(seed, 1);
        w.set_ai_seats([false, false]); // (an AI seat earns the difficulty's income)
        run(&mut w, 120);
        let (a, b) = (
            w.res[PLAYER as usize][0] as f64,
            w.res[ENEMY as usize][0] as f64,
        );
        assert!(
            (a - b).abs() <= 0.1 * a.max(b),
            "seed {seed}: {a} vs {b} shards after two minutes"
        );
    }
}

#[test]
fn sides_can_trade_starting_places_on_the_same_map() {
    for seed in [4242, 1998, 7] {
        let a = World::new(seed, 1);
        let b = World::with_map_side(seed, 1, MapKind::Standard, true);
        assert_eq!(a.map.rock, b.map.rock, "seed {seed}: the same map");
        assert_eq!(
            core(&a, PLAYER),
            core(&b, ENEMY),
            "seed {seed}: the player starts where the AI did"
        );
        assert_eq!(core(&a, ENEMY), core(&b, PLAYER));
        assert_eq!(harvesters(&b, PLAYER).len(), 4);
        let mut g = b;
        run(&mut g, 120);
        assert!(!g.over, "the swapped game plays");
    }
}

/// The tiles just outside a ring of `r` tiles around the core on `base` that can be walked to from the core without
/// leaving the ring (rock blocks; fields and buildings do not count, they are not terrain).
fn ways_out(w: &World, base: (i32, i32), r: f64) -> Vec<(i32, i32)> {
    let c = (base.0 as f64 + 1.5, base.1 as f64 + 1.5);
    let dist = |(x, y): (i32, i32)| ((x as f64 - c.0).powi(2) + (y as f64 - c.1).powi(2)).sqrt();
    let mut seen = vec![false; (MW * MH) as usize];
    let mut todo = vec![base];
    let mut out = vec![];
    seen[(base.1 * MW + base.0) as usize] = true;
    while let Some((x, y)) = todo.pop() {
        if dist((x, y)) >= r {
            out.push((x, y));
            continue;
        }
        for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
            let (nx, ny) = (x + dx, y + dy);
            let i = (ny * MW + nx) as usize;
            if in_map(nx, ny) && !seen[i] && w.map.rock[i] == 0 {
                seen[i] = true;
                todo.push((nx, ny));
            }
        }
    }
    out
}

#[test]
fn each_main_is_a_pocket_with_one_ramp_except_on_open_plains() {
    let spread = |t: &[(i32, i32)]| {
        t.iter()
            .flat_map(|a| {
                t.iter()
                    .map(move |b| (a.0 - b.0).abs().max((a.1 - b.1).abs()))
            })
            .max()
            .unwrap_or(0)
    };
    for seed in [1, 2, 3, 6, 18, 21, 77, 1998, 2077, 4242] {
        for kind in MapKind::ALL {
            let w = World::with_map(seed, 1, kind);
            for base in w.map.bases {
                // Just past the wall (12 tiles out, 2 thick): only the ramp's mouth is reachable, a few tiles wide.
                let out = ways_out(&w, base, 14.5);
                assert!(
                    !out.is_empty(),
                    "seed {seed} {kind:?}: the main at {base:?} has a way out"
                );
                if kind == MapKind::OpenPlains {
                    assert!(
                        spread(&out) > 15,
                        "seed {seed}: an open plain's main is open"
                    );
                } else {
                    assert!(
                        spread(&out) <= 8,
                        "seed {seed} {kind:?}: the main at {base:?} has one narrow ramp: {out:?}"
                    );
                }
            }
        }
    }
}
