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
                MapKind::EtherStorm => {
                    // (a centre vent always, which a standard map has only with its centre field)
                    let centre = w.map.occ[w.map.idx(w.map.w / 2, w.map.h / 2)];
                    assert!(
                        centre < 0 && w.map.node(-centre as Id).unwrap().ether,
                        "seed {seed}: a vent in the centre"
                    );
                    assert!(
                        vents >= std_vents && ether >= std_ether * 3,
                        "seed {seed}: richer vents"
                    );
                    assert!(
                        w.map
                            .nodes
                            .iter()
                            .filter(|n| n.ether)
                            .all(|n| n.amount == 15000),
                        "seed {seed}: three times the ether in every vent"
                    );
                }
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
    // The menus' maps (src/client/maps.js): a duel's three on 64x64, three on 96x96 with four starts and three on
    // 128x128 with eight, all taken (a Core on every start).
    for (seed, kind, n) in [
        (4242, 0, 64),
        (1998, 1, 64),
        (2077, 4, 64),
        (1291, 0, 96),
        (2940, 1, 96),
        (1582, 3, 96),
        (5, 0, 128),
        (9, 3, 128),
        (2, 4, 128),
    ] {
        let p = endfall_sim::map_preview(seed, kind, Some(n as u32));
        let seats = endfall_sim::map::max_starts(MapSize::square(n));
        let w = World::with_size(
            seed,
            1,
            MapKind::from_index(kind),
            MapSize::square(n),
            0,
            &vec![&HUMANS; seats],
        );
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
    World::with_size(seed, 1, kind, MapSize::square(n), 0, &[&HUMANS, &HUMANS])
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
        let mut w = World::with_size(seed, 1, kind, MapSize::square(96), 0, &[&HUMANS, &VAEL]);
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

/// A game of `seats` people (nobody's an AI) on a map of `n` x `n` tiles, with the starts it is generated with.
fn seated(seed: u32, kind: MapKind, n: i32, seats: usize, side: u32) -> World {
    let races: Vec<&'static Faction> = (0..seats)
        .map(|s| if s % 2 == 0 { &HUMANS } else { &VAEL })
        .collect();
    let mut w = World::with_size(seed, 1, kind, MapSize::square(n), side, &races);
    w.set_ai_seats(vec![false; seats]);
    w
}

/// What a start has round it, which every start of a fair map has alike: the nearest other start, the rock within 16
/// tiles, its home crystals and vents (within 10), and the crystals and vents of the expansions near it (14 to 38 tiles
/// out: the natural's site lies within 32), all from its Core's centre.
fn start_share(w: &World, b: (i32, i32)) -> (i32, usize, usize, i32, usize, usize, usize) {
    let c = (b.0 as f64 + 1.5, b.1 as f64 + 1.5);
    let d = |x: f64, y: f64| ((x - c.0).powi(2) + (y - c.1).powi(2)).sqrt();
    let neighbour = w
        .map
        .bases
        .iter()
        .filter(|&&o| o != b)
        .map(|o| (o.0 - b.0).pow(2) + (o.1 - b.1).pow(2))
        .min()
        .unwrap();
    let mut rock = 0;
    for y in 0..w.map.h {
        for x in 0..w.map.w {
            rock += (w.map.rock[w.map.idx(x, y)] != 0 && d(x as f64, y as f64) <= 16.0) as usize;
        }
    }
    // (a vent's centre is a tile further in than its top-left)
    let at = |n: &endfall_sim::map::Node| {
        let s = if n.ether { 0.5 } else { 0.0 };
        d(n.tx as f64 + s, n.ty as f64 + s)
    };
    let (mut home, mut home_amount, mut home_vents, mut out, mut out_vents) = (0, 0, 0, 0, 0);
    for n in &w.map.nodes {
        match (n.ether, at(n)) {
            (false, r) if r <= 10.0 => {
                home += 1;
                home_amount += n.amount;
            }
            (true, r) if r <= 10.0 => home_vents += 1,
            (false, r) if (14.0..=38.0).contains(&r) => out += 1,
            (true, r) if (14.0..=38.0).contains(&r) => out_vents += 1,
            _ => {}
        }
    }
    (
        neighbour,
        rock,
        home,
        home_amount,
        home_vents,
        out,
        out_vents,
    )
}

#[test]
fn maps_for_more_seats_have_a_fair_start_for_each() {
    // M4: 96x96 has four starts (the quarter turns of one), 128x128 eight (the quarter turns and their mirror images),
    // whatever the seats: every start the same ground, home field and vent, natural expansion and neighbours, all of them in
    // walking reach of each other; the seats spread round them, a start nobody takes left free.
    let seeds: u32 = if cfg!(debug_assertions) { 2 } else { 20 };
    for (n, seats, starts) in [
        (96, 4, 4),
        (96, 3, 4),
        (96, 2, 4),
        (128, 4, 8),
        (128, 2, 8),
        (128, 8, 8),
        (128, 6, 8),
    ] {
        for seed in 0..seeds {
            for kind in MapKind::ALL {
                let seed = seed * 13 + 5;
                let w = seated(seed, kind, n, seats, seed);
                let ctx = format!("{n}x{n} {seats} seats seed {seed} {kind:?}");
                check_invariants(&w, &ctx);
                assert_eq!(w.map.bases.len(), starts, "{ctx}: the starts");
                for (s, &b) in w.map.bases.iter().enumerate() {
                    let taken: Vec<u8> = w
                        .bldgs
                        .iter()
                        .filter(|o| (o.tx, o.ty) == b)
                        .map(|o| o.team)
                        .collect();
                    if s < seats {
                        assert_eq!(taken, vec![s as u8], "{ctx}: seat {s} on its start");
                        assert_eq!(harvesters(&w, s as u8).len(), 4, "{ctx}");
                    } else {
                        assert!(taken.is_empty(), "{ctx}: start {s} free");
                    }
                    let edge = b.0.min(b.1).min(n - 4 - b.0).min(n - 4 - b.1);
                    assert!(
                        (8..=9).contains(&edge),
                        "{ctx}: start {s} by its edge: {edge}"
                    );
                }
                // Walkable: from beside the first start to every other one and to every field.
                let p = w.map.bases[0];
                let reach = reachable(&w, w.map.nearest_free(p.0 + 1, p.1 + 4, 6).unwrap());
                let near = |x: i32, y: i32, s: i32| {
                    (-1..=s).any(|dy| {
                        (-1..=s).any(|dx| {
                            w.map.in_map(x + dx, y + dy) && reach[w.map.idx(x + dx, y + dy)]
                        })
                    })
                };
                for &b in &w.map.bases[1..] {
                    assert!(
                        near(b.0, b.1, 4),
                        "{ctx}: the start at {b:?} can be walked to"
                    );
                }
                for f in &w.map.nodes {
                    let s = if f.ether { 2 } else { 1 };
                    assert!(near(f.tx, f.ty, s), "{ctx}: the field at {},{}", f.tx, f.ty);
                }
                // Fair: every start's share alike, and a natural (crystals and a vent) by each.
                let first = start_share(&w, w.map.bases[0]);
                for &b in &w.map.bases {
                    assert_eq!(start_share(&w, b), first, "{ctx}: the start at {b:?}");
                }
                let (neighbour, _, home, _, home_vents, out, out_vents) = first;
                assert!(neighbour >= 40 * 40, "{ctx}: neighbours {neighbour}");
                assert!(home >= 5 && home_vents >= 1, "{ctx}: a home field and vent");
                assert!(out >= 4 && out_vents >= 1, "{ctx}: a natural: {first:?}");
                // Each main a pocket with one narrow ramp (an open plain's open), no crystals in the way.
                for &b in &w.map.bases {
                    let out = ways_out(&w, b, 14.5);
                    assert!(out.len() >= 4, "{ctx}: the main at {b:?} has a way out");
                    let spread = out
                        .iter()
                        .flat_map(|a| {
                            out.iter()
                                .map(move |o| (a.0 - o.0).abs().max((a.1 - o.1).abs()))
                        })
                        .max()
                        .unwrap();
                    assert!(
                        (kind == MapKind::OpenPlains) == (spread > 8),
                        "{ctx}: the main at {b:?}: ways out {spread} across"
                    );
                }
            }
        }
    }
}

#[test]
fn seats_spread_round_the_starts_and_side_turns_them() {
    use endfall_sim::map::{max_starts, seat_starts};
    assert_eq!(
        [64, 96, 128].map(|n| max_starts(MapSize::square(n))),
        [2, 4, 8]
    );
    assert_eq!(
        max_starts(MapSize { w: 128, h: 96 }),
        2,
        "a map that is not square"
    );
    assert_eq!(seat_starts(2, 2, 0), [0, 1]);
    assert_eq!(
        seat_starts(2, 2, 1),
        [1, 0],
        "two seats: 1 trades their places"
    );
    assert_eq!(
        seat_starts(4, 3, 0),
        [0, 1, 2, 3],
        "three of four: one corner free"
    );
    assert_eq!(seat_starts(4, 3, 2), [2, 3, 0, 1]);
    assert_eq!(
        seat_starts(8, 4, 1),
        [1, 3, 5, 7, 0, 2, 4, 6],
        "every other start"
    );
    assert_eq!(
        seat_starts(8, 6, 0),
        [0, 1, 2, 4, 5, 6, 3, 7],
        "six of eight: two opposite starts free"
    );
    // Fewer seats than starts: which seat sits between two others (or beside a free start) is the side's draw, not
    // the seat number's: over the draws, every seat meets each place (0, 1 or 2 taken neighbours) equally often.
    for (k, n) in [(4usize, 3usize), (8, 5), (8, 6), (8, 7)] {
        let mut places = vec![[0u32; 3]; n];
        for side in 0..(k * n) as u32 {
            let at = seat_starts(k, n, side);
            let taken = |i: usize| at[..n].contains(&(i % k));
            for (s, &i) in at[..n].iter().enumerate() {
                places[s][taken(i + 1) as usize + taken(i + k - 1) as usize] += 1;
            }
            let mut seen = at.clone();
            seen.sort();
            assert_eq!(
                seen,
                (0..k).collect::<Vec<_>>(),
                "{n} of {k}, side {side}: every start once"
            );
        }
        assert!(
            places.iter().all(|p| *p == places[0]),
            "{n} of {k}: the same places for every seat: {places:?}"
        );
    }
    // The same map whatever the side; the seats keep their order round it, turned.
    let (a, b) = (
        seated(31, MapKind::Standard, 96, 4, 0),
        seated(31, MapKind::Standard, 96, 4, 1),
    );
    assert_eq!(a.map.rock, b.map.rock);
    for s in 0..4u8 {
        assert_eq!(core(&b, s), core(&a, (s + 1) % 4), "seat {s} one start on");
    }
}

#[test]
fn a_map_keeps_all_its_starts_with_fewer_seats() {
    // The map the menus show is the map played: two seats on a 96x96 or a 128x128 map play its four- or eight-start
    // layout (the same rock as with every start taken), on opposite starts free for all; the starts nobody took are
    // free ground. With teams, allies sit side by side and the free starts go between the teams.
    for (n, k) in [(96, 4usize), (128, 8)] {
        let full = seated(5, MapKind::Standard, n, k, 0);
        for side in 0..(2 * k) as u32 {
            let w = seated(5, MapKind::Standard, n, 2, side);
            assert_eq!(
                w.map.rock, full.map.rock,
                "{n}x{n}, side {side}: the map with all its starts"
            );
            assert_eq!(w.map.bases.len(), k, "{n}x{n}: every start listed");
            assert_eq!(
                w.bldgs.iter().filter(|b| b.kind.def().hq).count(),
                2,
                "{n}x{n}: a Core per seat, none on a free start"
            );
            let ring = full.map.bases.clone();
            let at = |s: u8| {
                ring.iter()
                    .position(|&b| b == w.map.bases[s as usize])
                    .unwrap()
            };
            let apart = (at(1) + k - at(0)) % k;
            assert_eq!(
                apart,
                k / 2,
                "{n}x{n}, side {side}: two seats on opposite starts"
            );
        }
    }
    // Two against one on the eight starts: the allies side by side, three free starts on each side of the enemy.
    let races = [&HUMANS, &VAEL, &HUMANS];
    for side in 0..16u32 {
        let mut w = World::with_size(5, 1, MapKind::Standard, MapSize::square(128), side, &races);
        assert!(w.set_teams(&[0, 0, 1]));
        let full = seated(5, MapKind::Standard, 128, 8, 0);
        let at = |s: usize| {
            full.map
                .bases
                .iter()
                .position(|&b| b == w.map.bases[s])
                .unwrap()
        };
        assert_eq!(
            (at(1) + 8 - at(0)) % 8,
            1,
            "side {side}: the allies on neighbouring starts"
        );
        let (gap_a, gap_b) = ((at(2) + 8 - at(1)) % 8, (at(0) + 8 - at(2)) % 8);
        assert!(
            gap_a >= 3 && gap_b >= 3,
            "side {side}: the enemy far from both ({gap_a}, {gap_b})"
        );
    }
}

#[test]
fn units_on_a_map_of_many_starts_face_and_step_out_towards_its_centre() {
    // (two starts: seat 0 faces east and steps out south, the rest west and north, as always: the goldens pin it)
    let mut w = World::with_size(
        41,
        1,
        MapKind::Standard,
        MapSize::square(128),
        0,
        &[&HUMANS; 8],
    );
    w.set_ai_seats([false; 8]);
    let (cx, cy) = (w.map.ww() / 2.0, w.map.wh() / 2.0);
    let mut rax = Vec::new();
    for s in 0..8u8 {
        let (bx, by) = core(&w, s);
        let (ox, oy) = ((bx as f64 + 2.0) * TILE, (by as f64 + 2.0) * TILE);
        let u = w.unit(harvesters(&w, s)[0]).unwrap();
        assert!(
            (u.face - (cy - oy).atan2(cx - ox)).abs() < 1e-9,
            "seat {s}: a harvester faces the centre"
        );
        // A Garrison by the Core: a Trooper trained there with no rally point steps out towards the centre.
        let at = (-12..=12)
            .flat_map(|dy| (-12..=12).map(move |dx| (bx + dx, by + dy)))
            .filter(|&(x, y)| w.can_place(BldgKind::Barracks, x, y, s))
            .min_by_key(|&(x, y)| (x - bx).pow(2) + (y - by).pow(2))
            .unwrap();
        let b = w.make_building(BldgKind::Barracks, s, at.0, at.1, true);
        w.res[s as usize] = [500, 0];
        w.queue_unit(b, UnitKind::Trooper).unwrap();
        rax.push(b);
    }
    run(&mut w, 30);
    for s in 0..8u8 {
        let b = w.bldg(rax[s as usize]).unwrap();
        let t = w
            .units
            .iter()
            .find(|u| u.team == s && u.kind == UnitKind::Trooper)
            .unwrap();
        let (dx, dy) = (t.x - b.x, t.y - b.y);
        assert!(
            dx * (cx - b.x) + dy * (cy - b.y) > 0.0,
            "seat {s}: the Trooper stepped out on the centre's side"
        );
    }
}

#[test]
fn every_start_of_a_larger_map_mines_alike_from_the_first_minute() {
    // Two minutes of mining with the four first harvesters: every seat about the same shards (one race here). Not
    // exactly: the starts are images of each other, but walking is not quite the same in every direction on the grid
    // (the path search's tie-breaks): up to 8% apart on a duel's map, 12% on eight starts, whose fields lie off the
    // grid's axes.
    let seeds: u32 = if cfg!(debug_assertions) { 2 } else { 8 };
    for (n, seats) in [(96, 4), (128, 8)] {
        for seed in 0..seeds {
            let races: Vec<&'static Faction> = vec![&HUMANS; seats];
            let mut w =
                World::with_size(seed, 1, MapKind::Standard, MapSize::square(n), seed, &races);
            w.set_ai_seats(vec![false; seats]);
            run(&mut w, 120);
            let shards: Vec<f64> = w.res.iter().map(|r| r[0] as f64).collect();
            let (lo, hi) = shards
                .iter()
                .fold((f64::MAX, 0.0f64), |(a, b), &s| (a.min(s), b.max(s)));
            assert!(
                hi - lo <= 0.13 * hi,
                "{n}x{n} seed {seed}: {shards:?} shards after two minutes"
            );
        }
    }
}

/// A challenge link (src/client/challenge.js) carries `side` reduced to `side % (k * n)`: the starts must depend on
/// nothing more of it, free for all or in teams (where `team_starts` turns by `side % k` alone), or every link shared
/// before a change here would start its game elsewhere.
#[test]
fn starts_depend_on_side_modulo_starts_times_seats_only() {
    use endfall_sim::map::{seat_starts, team_starts};
    for k in [2usize, 4, 6, 8] {
        for n in 2..=k {
            let teams: Vec<u8> = (0..n).map(|s| (s * 2 / n) as u8).collect();
            for side in [0u32, 1, 5, 17, 63, 1000, 123_456_789] {
                let m = side % (k * n) as u32;
                assert_eq!(
                    seat_starts(k, n, side),
                    seat_starts(k, n, m),
                    "seat_starts k={k} n={n} side={side}"
                );
                assert_eq!(
                    team_starts(k, &teams, side),
                    team_starts(k, &teams, m),
                    "team_starts k={k} n={n} side={side}"
                );
            }
        }
    }
}

/// Steps (4-neighbour, over free ground) from `from` to every tile, or `u32::MAX` where it cannot walk.
fn steps_from(w: &World, from: (i32, i32)) -> Vec<u32> {
    let mut d = vec![u32::MAX; w.map.rock.len()];
    let mut todo = std::collections::VecDeque::from([from]);
    d[w.map.idx(from.0, from.1)] = 0;
    while let Some((x, y)) = todo.pop_front() {
        let here = d[w.map.idx(x, y)];
        for (nx, ny) in [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)] {
            if !w.map.blocked(nx, ny) && d[w.map.idx(nx, ny)] == u32::MAX {
                d[w.map.idx(nx, ny)] = here + 1;
                todo.push_back((nx, ny));
            }
        }
    }
    d
}

#[test]
fn every_base_has_two_vents_alike_for_every_start_and_in_easy_reach() {
    // Two vents by every main, one to either side of its Core (its field behind it), and two by every expansion,
    // whatever the size, the kind and the symmetry: on open ground inside the main's pocket, owning their tiles, a
    // short walk from beside the Core, and the same for every start.
    let seeds: u32 = if cfg!(debug_assertions) { 4 } else { 40 };
    for n in [64, 96, 128] {
        let starts = endfall_sim::map::max_starts(MapSize::square(n));
        for seed in 0..seeds {
            for kind in MapKind::ALL {
                let seed = seed * 11 + 1;
                let w = seated(seed, kind, n, starts, 0);
                let ctx = format!("{n}x{n} seed {seed} {kind:?}");
                let vents: Vec<&endfall_sim::map::Node> =
                    w.map.nodes.iter().filter(|v| v.ether).collect();
                // (a vent's centre, in tiles: its top-left tile's corner plus one)
                let centre = |v: &endfall_sim::map::Node| (v.tx as f64 + 1.0, v.ty as f64 + 1.0);
                let d = |a: (f64, f64), b: (f64, f64)| {
                    ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2)).sqrt()
                };
                for v in &vents {
                    for (x, y) in [(0, 0), (1, 0), (0, 1), (1, 1)] {
                        let i = w.map.idx(v.tx + x, v.ty + y);
                        assert_eq!(
                            w.map.occ[i],
                            -(v.id as i32),
                            "{ctx}: vent {} owns its tiles",
                            v.id
                        );
                        assert_eq!(w.map.rock[i], 0, "{ctx}: vent {} on open ground", v.id);
                    }
                }
                let mut first: Option<Vec<i64>> = None;
                for &b in &w.map.bases {
                    let c = (b.0 as f64 + 2.0, b.1 as f64 + 2.0);
                    let home: Vec<_> = vents.iter().filter(|v| d(centre(v), c) <= 10.0).collect();
                    assert_eq!(home.len(), 2, "{ctx}: two vents by the main at {b:?}");
                    // Inside the pocket (its wall starts 12 tiles from the Core's centre), clear of the Core.
                    let mut far: Vec<i64> = home
                        .iter()
                        .map(|v| {
                            let r = d(centre(v), c);
                            assert!(
                                (5.0..=9.5).contains(&r),
                                "{ctx}: the vent at {},{} is {r:.1} from the Core",
                                v.tx,
                                v.ty
                            );
                            (r * 1000.0).round() as i64
                        })
                        .collect();
                    // A short walk from beside the Core to each: around nothing in the way.
                    let start = w.map.nearest_free(b.0 + 1, b.1 + 4, 6).unwrap();
                    let steps = steps_from(&w, start);
                    for v in &home {
                        let near = (-1..=2)
                            .flat_map(|y| (-1..=2).map(move |x| (v.tx + x, v.ty + y)))
                            .filter(|&(x, y)| w.map.in_map(x, y))
                            .map(|(x, y)| steps[w.map.idx(x, y)])
                            .min()
                            .unwrap();
                        assert!(
                            near <= 16,
                            "{ctx}: the vent at {},{}: {near} steps from the Core",
                            v.tx,
                            v.ty
                        );
                    }
                    // Alike for every start (the starts are images of each other).
                    far.sort();
                    match &first {
                        None => first = Some(far),
                        Some(f) => assert_eq!(
                            &far, f,
                            "{ctx}: the main at {b:?} has its vents as the first has"
                        ),
                    }
                }
                // Two by every expansion, all mirrored: every vent is a main's, an expansion's or the centre's.
                for &e in &w.map.expansions {
                    let by = vents.iter().filter(|v| d(centre(v), e) <= 7.5).count();
                    assert!(
                        by >= 2,
                        "{ctx}: the expansion at ({:.1}, {:.1}) has {by} vents",
                        e.0,
                        e.1
                    );
                }
                let mid = w.map.occ[w.map.idx(n / 2, n / 2)];
                let centre_vent = mid < 0 && w.map.node(-mid as Id).unwrap().ether;
                assert_eq!(
                    vents.len(),
                    2 * w.map.bases.len() + 2 * w.map.expansions.len() + centre_vent as usize,
                    "{ctx}: two vents a base, and the centre's"
                );
                assert_eq!(
                    w.map.expansions.len() % starts,
                    0,
                    "{ctx}: every start's expansions"
                );
            }
        }
    }
}
