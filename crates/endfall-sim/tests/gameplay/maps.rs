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
                            w.map.occ[w.map.idx(n.tx + x, n.ty + y)],
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
                            && x < w.map.w - 1
                            && y < w.map.h - 1
                            && w.map.rock[w.map.idx(x, y)] == 0
                            && w.map.occ[w.map.idx(x, y)] == 0
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

/// Walkable: from beside the first seat's Core to beside the second's, and to every field (crystals block); and
/// mirrored tile for tile.
fn assert_walkable_and_mirrored(w: &World, ctx: &str) {
    let (p, e) = (w.map.bases[0], w.map.bases[1]);
    let start = w.map.nearest_free(p.0 + 1, p.1 + 4, 6).unwrap();
    let reach = reachable(w, start);
    let near = |x: i32, y: i32, s: i32| {
        (-1..=s).any(|dy| {
            (-1..=s).any(|dx| {
                let (tx, ty) = (x + dx, y + dy);
                w.map.in_map(tx, ty) && reach[w.map.idx(tx, ty)]
            })
        })
    };
    assert!(near(e.0, e.1, 4), "{ctx}: the bases can walk to each other");
    for n in &w.map.nodes {
        assert!(
            near(n.tx, n.ty, if n.ether { 2 } else { 1 }),
            "{ctx}: the field at {},{} can be reached",
            n.tx,
            n.ty
        );
        // Mirrored tile for tile (a vent is 2x2, so its mirror starts one tile further in).
        let m = if n.ether {
            (w.map.w - 2 - n.tx, w.map.h - 2 - n.ty)
        } else {
            (w.map.w - 1 - n.tx, w.map.h - 1 - n.ty)
        };
        assert!(
            w.map
                .nodes
                .iter()
                .any(|o| o.ether == n.ether && (o.tx, o.ty) == m && o.amount == n.amount),
            "{ctx}: the field at {},{} has its mirror twin",
            n.tx,
            n.ty
        );
    }
}

#[test]
fn maps_are_walkable_mirrored_and_fair_from_the_first_minute() {
    use endfall_sim::map::MapKind;
    let seeds: u32 = if cfg!(debug_assertions) { 30 } else { 1000 };
    // (340, 978, 1558: seeds where the natural's crystals once plugged the ramp out of a main)
    for seed in (0..seeds).chain([340, 978, 1558]) {
        for kind in [MapKind::Standard, MapKind::Labyrinth] {
            let w = World::with_map(seed, 1, kind);
            assert_walkable_and_mirrored(&w, &format!("seed {seed} {kind:?}"));
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
/// leaving the ring (rock and crystals block; buildings, the core included, do not).
fn ways_out(w: &World, base: (i32, i32), r: f64) -> Vec<(i32, i32)> {
    let c = (base.0 as f64 + 1.5, base.1 as f64 + 1.5);
    let dist = |(x, y): (i32, i32)| ((x as f64 - c.0).powi(2) + (y as f64 - c.1).powi(2)).sqrt();
    let mut seen = vec![false; w.map.rock.len()];
    let mut todo = vec![base];
    let mut out = vec![];
    seen[w.map.idx(base.0, base.1)] = true;
    while let Some((x, y)) = todo.pop() {
        if dist((x, y)) >= r {
            out.push((x, y));
            continue;
        }
        for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
            let (nx, ny) = (x + dx, y + dy);
            if !w.map.in_map(nx, ny) {
                continue;
            }
            let i = w.map.idx(nx, ny);
            if !seen[i] && w.map.rock[i] == 0 && w.map.occ[i] >= 0 {
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
    // (340, 978, 1558: the natural's crystals once narrowed or plugged the ramp)
    for seed in (0..60).chain([340, 978, 1558, 1998, 2077, 4242]) {
        for kind in MapKind::ALL {
            let w = World::with_map(seed, 1, kind);
            for base in w.map.bases.clone() {
                // Just past the wall (12 tiles out, 2 thick): only the ramp's mouth is reachable, a few tiles wide,
                // with no crystals in the way.
                let out = ways_out(&w, base, 14.5);
                assert!(
                    out.len() >= 4,
                    "seed {seed} {kind:?}: the main at {base:?} has a clear way out: {out:?}"
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

#[test]
fn the_menu_preview_shows_the_map_as_it_will_be_played() {
    for (seed, kind) in [(4242, 0), (1998, 1), (2077, 4)] {
        let p = endfall_sim::map_preview(seed, kind);
        let w = World::with_map(seed, 1, MapKind::from_index(kind));
        assert_eq!(p.len(), w.map.rock.len());
        for y in 0..w.map.h {
            for x in 0..w.map.w {
                let i = w.map.idx(x, y);
                let want = match w.map.occ[i] {
                    o if o < 0 => {
                        if w.map.node(-o as Id).unwrap().ether {
                            3
                        } else {
                            2
                        }
                    }
                    o if o > 0 => 4, // (a starting Core)
                    _ => w.map.rock[i],
                };
                assert_eq!(p[i], want, "seed {seed} kind {kind}: tile {x},{y}");
            }
        }
    }
}

/// A two-seat game on a map of `n` x `n` tiles.
fn sized(seed: u32, kind: MapKind, n: i32) -> World {
    World::with_size(
        seed,
        1,
        kind,
        MapSize::square(n),
        false,
        &[&HUMANS, &HUMANS],
    )
}

#[test]
fn larger_maps_are_walkable_mirrored_and_fair() {
    // M4: about 96x96 for four seats, 128x128 for six to eight (two starts for now). The generator scales: the same
    // pockets and fields round each base, the bases as far from their edges, more expansions on more ground.
    let seeds: u32 = if cfg!(debug_assertions) { 6 } else { 60 };
    for n in [96, 128] {
        for seed in 0..seeds {
            for kind in MapKind::ALL {
                let w = sized(seed * 7 + 3, kind, n);
                let ctx = format!("{n}x{n} seed {} {kind:?}", seed * 7 + 3);
                assert_eq!((w.map.w, w.map.h), (n, n), "{ctx}");
                assert_eq!(w.map.rock.len(), (n * n) as usize, "{ctx}");
                assert_eq!(w.vis[0].len(), (n * n) as usize, "{ctx}: fog for the map");
                check_invariants(&w, &ctx);
                assert_walkable_and_mirrored(&w, &ctx);
                for seat in [PLAYER, ENEMY] {
                    // Its start, and its home field and vent right by the Core.
                    let (cx, cy) = core(&w, seat);
                    let near = |ether: bool, r: i32| {
                        w.map
                            .nodes
                            .iter()
                            .filter(|f| f.ether == ether)
                            .filter(|f| (f.tx - cx - 1).abs().max((f.ty - cy - 1).abs()) <= r)
                            .count()
                    };
                    assert!(near(false, 10) >= 5, "{ctx} seat {seat}: a home field");
                    assert!(near(true, 10) >= 1, "{ctx} seat {seat}: a home vent");
                    assert_eq!(harvesters(&w, seat).len(), 4, "{ctx}");
                    let edge = cx.min(cy).min(n - 4 - cx).min(n - 4 - cy);
                    assert!((8..=9).contains(&edge), "{ctx}: a base by its edge: {edge}");
                }
                // More ground, more expansions: past the two home fields, two or three per side, plus one per 32
                // tiles past 64 (each mirrored).
                let fields = w.map.nodes.iter().map(|f| f.field).max().unwrap();
                let want = 2 + 2 * (2 + (n - 64) / 32) as u32;
                assert!(fields >= want, "{ctx}: {fields} shard fields");
            }
        }
    }
}

#[test]
fn two_ais_fight_on_a_larger_map() {
    // A 96x96 map (M4's four-seat size, two starts for now): eight minutes of AI against AI, the world's invariants
    // after every tick, and both sides field an army and meet.
    for (seed, kind) in [(11u32, MapKind::Standard), (29, MapKind::Labyrinth)] {
        let mut w = World::with_size(seed, 1, kind, MapSize::square(96), false, &[&HUMANS, &VAEL]);
        w.set_ai_seats([true, true]);
        let mut hits = [0, 0];
        for tick in 0..30 * 60 * 8 {
            w.step();
            for e in w.events.drain(..) {
                if let endfall_sim::world::Event::Attacked { team, .. } = e {
                    hits[team as usize] += 1;
                }
            }
            check_invariants(&w, &format!("96x96 seed {seed} tick {tick}"));
            if w.over {
                break;
            }
        }
        for seat in 0..2 {
            let army = w.army_log[seat].iter().max().copied().unwrap_or(0);
            assert!(army >= 1000, "seed {seed} seat {seat}: an army ({army})");
        }
        assert!(
            hits[0] > 0 && hits[1] > 0,
            "seed {seed}: both seats were attacked: {hits:?}"
        );
    }
}

#[test]
fn the_far_side_of_a_large_map_is_in_play() {
    // Past the 64x64 map's 2048 px: units there bump apart, see and fight (the spatial hash and fog sized to the
    // map), and a walker crosses the whole map in one order (the path search's cap scaled to it).
    for seed in [4242, 1998, 7] {
        let mut w = sized(seed, MapKind::Labyrinth, 128);
        w.set_ai_seats([false, false]);
        let (bx, by) = core(&w, PLAYER);
        // The corner across from the player's base, cleared.
        let (fx, fy) = (
            if bx < 64 { 112 } else { 14 },
            if by < 64 { 112 } else { 14 },
        );
        flatten(&mut w, fx - 6..fx + 7, fy - 6..fy + 7);
        let (x, y) = ((fx as f64 + 0.5) * TILE, (fy as f64 + 0.5) * TILE);
        let (a, b) = (
            w.make_unit(UnitKind::Trooper, PLAYER, x, y),
            w.make_unit(UnitKind::Trooper, PLAYER, x, y),
        );
        let foe = w.make_unit(UnitKind::Trooper, ENEMY, x + 4.0 * TILE, y);
        w.hold_unit(foe); // (the two may step out to fight it: a unit holding stands firm, others part round it)
        // A walker from beside the player's Core to the reachable tile nearest the enemy's, across the map.
        let start = w.map.nearest_free(bx + 1, by + 4, 6).unwrap();
        let reach = reachable(&w, start);
        let (ex, ey) = core(&w, ENEMY);
        let goal = (0..w.map.h)
            .flat_map(|ty| (0..w.map.w).map(move |tx| (tx, ty)))
            .filter(|&(tx, ty)| reach[w.map.idx(tx, ty)])
            .min_by_key(|&(tx, ty)| (tx - ex - 1).pow(2) + (ty - ey - 1).pow(2))
            .unwrap();
        let (gx, gy) = ((goal.0 as f64 + 0.5) * TILE, (goal.1 as f64 + 0.5) * TILE);
        let walker = w.make_unit(
            UnitKind::Trooper,
            PLAYER,
            (start.0 as f64 + 0.5) * TILE,
            (start.1 as f64 + 0.5) * TILE,
        );
        w.move_to(walker, gx, gy);
        run(&mut w, 1);
        let (ua, ub) = (w.unit(a).unwrap(), w.unit(b).unwrap());
        assert!(
            (ua.x - ub.x).abs() + (ua.y - ub.y).abs() > 8.0,
            "seed {seed}: two units on one spot part"
        );
        assert!(
            w.vis[PLAYER as usize][w.map.idx(fx + 4, fy)] != 0,
            "seed {seed}: the far corner is in sight"
        );
        run(&mut w, 4);
        assert!(
            w.unit(foe).is_none_or(|u| u.hp < u.maxhp),
            "seed {seed}: the foe there is shot"
        );
        run(&mut w, 120);
        let u = w.unit(walker).unwrap();
        let d = ((u.x - gx).powi(2) + (u.y - gy).powi(2)).sqrt() / TILE;
        assert!(
            d < 2.0,
            "seed {seed}: the walker crossed the map: {d:.1} tiles short"
        );
    }
}
