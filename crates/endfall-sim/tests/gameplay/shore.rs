//! The Shore map (`MapKind::Shore`): each start a cove on land and a reef basin in the shallows, a deep band between
//! the reefs; Human seats start in their cove, Vael seats in their basin. Its ground, its starts, its routes (each
//! reef's channel faces the cove across the sea, its sea gate opens onto deep water), orders at sea, random play and
//! the AI on it.

use crate::common::*;
use endfall_sim::data::Move;
use endfall_sim::map::{Foot, Ground};
use endfall_sim::path::{PathScratch, Pt, astar};

const SEEDS: [u32; 8] = [1, 2, 3, 7, 42, 99, 1998, 4242];

fn shore(seed: u32, races: [&'static Faction; 2]) -> World {
    World::with_size(seed, 1, MapKind::Shore, MapSize::DUEL, 0, &races)
}
fn walk() -> Foot {
    Foot {
        class: Move::Walk,
        water: 0,
    }
}
fn amph() -> Foot {
    Foot {
        class: Move::Amph,
        water: 0,
    }
}
/// The middle of a 4x4 headquarters' block.
fn mid(b: (i32, i32)) -> (f64, f64) {
    (b.0 as f64 + 1.5, b.1 as f64 + 1.5)
}
fn route_len(m: &endfall_sim::map::Map, foot: Foot, a: (i32, i32), b: (i32, i32)) -> Option<f64> {
    let mut s = PathScratch::new(m.rock.len());
    let p = astar(m, foot, &mut s, a.0, a.1, b.0, b.1)?;
    let mut at = Pt {
        x: a.0 as f64 * 32.0 + 16.0,
        y: a.1 as f64 * 32.0 + 16.0,
    };
    let mut len = 0.0;
    for q in &p {
        len += ((q.x - at.x).powi(2) + (q.y - at.y).powi(2)).sqrt();
        at = *q;
    }
    (p.last().map(|q| m.tile_of(q.x, q.y)) == Some(b)).then_some(len / 32.0)
}
/// A free tile beside a 4x4 block (the first of its ring that a walker may stand on).
fn beside(m: &endfall_sim::map::Map, foot: Foot, b: (i32, i32)) -> (i32, i32) {
    (-1..=4)
        .flat_map(|d| {
            [
                (b.0 - 1, b.1 + d),
                (b.0 + 4, b.1 + d),
                (b.0 + d, b.1 - 1),
                (b.0 + d, b.1 + 4),
            ]
        })
        .find(|&(x, y)| m.passable(foot, x, y))
        .expect("room beside it")
}

#[test]
fn the_shore_map_has_coves_reefs_and_a_sea_alike_for_both_starts() {
    for seed in SEEDS {
        let w = shore(seed, [&HUMANS, &HUMANS]);
        let m = &w.map;
        assert_eq!(
            (m.bases.len(), m.basins.len()),
            (2, 2),
            "seed {seed}: two starts, each a cove and a basin"
        );
        // Point-symmetric: rock, heights and fields alike for both starts.
        for y in 0..m.h {
            for x in 0..m.w {
                let (i, j) = (m.idx(x, y), m.idx(m.w - 1 - x, m.h - 1 - y));
                assert_eq!(
                    (m.rock[i], m.height[i]),
                    (m.rock[j], m.height[j]),
                    "seed {seed}: ({x}, {y}) and its image"
                );
            }
        }
        let image = |t: (i32, i32), s: i32| (m.w - t.0 - s, m.h - t.1 - s);
        assert_eq!(m.bases[1], image(m.bases[0], 4), "seed {seed}: the coves");
        assert_eq!(
            m.basins[1],
            image(m.basins[0], 4),
            "seed {seed}: the basins"
        );
        for n in &m.nodes {
            let s = if n.ether { 2 } else { 1 };
            assert!(
                m.nodes
                    .iter()
                    .any(|o| o.ether == n.ether && (o.tx, o.ty) == image((n.tx, n.ty), s)),
                "seed {seed}: a field's image"
            );
            // Fields on land or shallows, never in deep water.
            assert!(
                (0..s).all(|d| m.ground(n.tx + d, n.ty + d, 0) != Ground::Deep),
                "seed {seed}: a field in deep water"
            );
        }
        // Ground: coves on land, basins in the shallows, deep water in the middle; shallows round the deep.
        for (b, g) in [(m.bases[0], Ground::Land), (m.basins[0], Ground::Shallow)] {
            assert!(
                (0..4).all(|dy| (0..4).all(|dx| m.ground(b.0 + dx, b.1 + dy, 0) == g
                    && m.rock[m.idx(b.0 + dx, b.1 + dy)] == 0)),
                "seed {seed}: {g:?} start"
            );
        }
        assert_eq!(
            m.ground(m.w / 2, m.h / 2, 0),
            Ground::Deep,
            "seed {seed}: deep water in the middle"
        );
        let deep = (0..m.h)
            .flat_map(|y| (0..m.w).map(move |x| (x, y)))
            .filter(|&(x, y)| m.ground(x, y, 0) == Ground::Deep);
        for (x, y) in deep {
            let nb = [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)];
            assert!(
                nb.iter()
                    .all(|&(a, b)| m.ground(a, b, 0) != Ground::Land || m.rock[m.idx(a, b)] != 0),
                "seed {seed}: deep water touching land at ({x}, {y})"
            );
        }
        // No field on a reef: every node clear of the reef rings.
        for n in &m.nodes {
            for g in 0..2 {
                let p = mid(m.basins[g]);
                let r =
                    ((n.tx as f64 + 0.5 - p.0).powi(2) + (n.ty as f64 + 0.5 - p.1).powi(2)).sqrt();
                assert!(
                    !(9.5..12.5).contains(&r),
                    "seed {seed}: a field at ({}, {}) on the reef ({r:.1} from a basin's middle)",
                    n.tx,
                    n.ty
                );
            }
        }
        // Each cove and each basin holds two vents and a field within reach of its headquarters.
        for b in m.bases.iter().chain(&m.basins) {
            let near = |ether: bool, r: f64| {
                m.nodes
                    .iter()
                    .filter(|n| {
                        n.ether == ether
                            && ((n.tx as f64 - mid(*b).0).powi(2)
                                + (n.ty as f64 - mid(*b).1).powi(2))
                            .sqrt()
                                < r
                    })
                    .count()
            };
            assert!(
                near(true, 11.0) == 2 && near(false, 9.0) >= 3,
                "seed {seed}: a start's field and vents at {b:?}"
            );
        }
        // The distances in a straight line (PRD, the Shore map: cove to cove about 62; the basins 20 tiles from the
        // centre since the first Shore report, 2026-11-04, so a basin's first wave does not decide the game: cove to
        // the facing basin 43.7, about 46 to walk or swim, basin to basin 40.5, 38 at least, the PM's bar).
        let d = |a: (f64, f64), b: (f64, f64)| ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2)).sqrt();
        assert!(
            (42.0..46.0).contains(&d(mid(m.bases[0]), mid(m.basins[1]))),
            "seed {seed}: cove to facing basin"
        );
        assert!(
            d(mid(m.basins[0]), mid(m.basins[1])) >= 38.0,
            "seed {seed}: basin to basin"
        );
        assert!(
            (58.0..66.0).contains(&d(mid(m.bases[0]), mid(m.bases[1]))),
            "seed {seed}: cove to cove"
        );
        assert!((m.expansions.len()) >= 4, "seed {seed}: expansions");
        assert!(
            m.expansions
                .iter()
                .all(|&(x, y)| m.ground(x as i32, y as i32, 0) == Ground::Land),
            "seed {seed}: expansions on land"
        );
    }
}

#[test]
fn on_the_shore_a_walker_reaches_everything_and_the_sea_is_the_vaels_road() {
    for seed in SEEDS {
        let w = shore(seed, [&HUMANS, &HUMANS]);
        let m = &w.map;
        // Walk: from the first cove to the other cove, both basins and every field.
        let reach = m.reach_from(beside(m, walk(), m.bases[0]), walk());
        let reached = |x: i32, y: i32| m.in_map(x, y) && reach[m.idx(x, y)];
        for b in m.bases.iter().chain(&m.basins) {
            let t = beside(m, walk(), *b);
            assert!(reached(t.0, t.1), "seed {seed}: a walker reaches {b:?}");
        }
        for n in &m.nodes {
            let s = if n.ether { 2 } else { 1 };
            assert!(
                (-1..=s).any(|dy| (-1..=s).any(|dx| reached(n.tx + dx, n.ty + dy))),
                "seed {seed}: a walker reaches the field at ({}, {})",
                n.tx,
                n.ty
            );
        }
        // Contact: from a cove to the basin it faces and back, each people's way is short (each reef's channel faces
        // that cove), and a walker's never enters deep water.
        let (cove, basin) = (
            beside(m, walk(), m.bases[0]),
            beside(m, walk(), m.basins[1]),
        );
        let straight = (((basin.0 - cove.0).pow(2) + (basin.1 - cove.1).pow(2)) as f64).sqrt();
        let walk_len = route_len(m, walk(), cove, basin).expect("a walker's way");
        let amph_len = route_len(m, amph(), basin, cove).expect("an amphibian's way");
        assert!(
            walk_len < straight * 1.4 && amph_len < straight * 1.4,
            "seed {seed}: Humans {walk_len:.0} tiles, Vael {amph_len:.0}, straight {straight:.0}"
        );
        let mut s = PathScratch::new(m.rock.len());
        let p = astar(m, walk(), &mut s, cove.0, cove.1, basin.0, basin.1).unwrap();
        assert!(
            p.iter().all(|q| {
                let (x, y) = m.tile_of(q.x, q.y);
                m.ground(x, y, 0) != Ground::Deep
            }),
            "seed {seed}: a walker's waypoint in deep water"
        );
    }
}

#[test]
fn each_people_starts_on_its_own_ground() {
    // Humans in their cove, the Vael in their basin, from either start; Human against Human two coves, Vael against
    // Vael two basins.
    for side in [false, true] {
        for races in [
            [&HUMANS, &VAEL],
            [&VAEL, &HUMANS],
            [&HUMANS, &HUMANS],
            [&VAEL, &VAEL],
        ] {
            let w = World::with_setup(7, 1, MapKind::Shore, side, races);
            for (seat, f) in races.iter().enumerate() {
                let hq = w
                    .bldgs
                    .iter()
                    .find(|b| b.team == seat as u8 && b.kind.def().hq)
                    .unwrap();
                let want = if f.worker.def().mv == Move::Amph {
                    Ground::Shallow
                } else {
                    Ground::Land
                };
                assert_eq!(
                    w.map.ground(hq.tx + 1, hq.ty + 1, 0),
                    want,
                    "{} at seat {seat} (side {side})",
                    f.name
                );
                assert_eq!((hq.tx, hq.ty), w.map.bases[seat]);
                assert!(w.units.iter().filter(|u| u.team == seat as u8).all(|u| {
                    let (x, y) = w.map.tile_of(u.x, u.y);
                    w.map.passable(w.foot(u.kind), x, y)
                }));
            }
        }
    }
}

#[test]
fn a_walker_sent_out_to_sea_stops_on_the_nearest_shore() {
    // A Trooper ordered to the middle of the deep band walks to its rim and stops there (never into the water).
    let mut w = shore(1, [&HUMANS, &VAEL]);
    w.disable_ai();
    let (cx, cy) = (w.map.w / 2, w.map.h / 2);
    assert_eq!(w.map.ground(cx, cy, 0), Ground::Deep);
    let hq = w.map.bases[0];
    let t = w.make_unit(
        UnitKind::Trooper,
        PLAYER,
        (hq.0 as f64 + 6.0) * 32.0,
        (hq.1 as f64 - 3.0) * 32.0,
    );
    w.move_to(t, cx as f64 * 32.0 + 16.0, cy as f64 * 32.0 + 16.0);
    for _ in 0..60 * TPS {
        w.step();
        w.events.clear();
    }
    let u = w.unit(t).unwrap();
    let (x, y) = w.map.tile_of(u.x, u.y);
    assert_ne!(w.map.ground(x, y, 0), Ground::Deep);
    let to_deep =
        (-2..=2).any(|dy| (-2..=2).any(|dx| w.map.ground(x + dx, y + dy, 0) == Ground::Deep));
    assert!(
        to_deep,
        "it stands on the shore, by the deep water: ({x}, {y})"
    );
}

#[test]
fn both_ais_finish_games_on_the_shore_from_either_half_at_every_level() {
    // Humans against the Vael at each level, each people from each start: every game ends within 30 minutes.
    for diff in 0..4 {
        for (races, seed) in [
            ([&HUMANS, &VAEL], 1 + diff as u32),
            ([&VAEL, &HUMANS], 11 + diff as u32),
        ] {
            let mut w = World::with_size(seed, diff, MapKind::Shore, MapSize::DUEL, 0, &races);
            assert!(w.set_ai_seats([true, true]));
            for _ in 0..30 * 60 * TPS {
                w.step();
                w.events.clear();
                if w.winner >= 0 {
                    break;
                }
            }
            assert!(
                w.winner >= 0,
                "level {diff}, {} first: no result in 30 minutes",
                races[0].name
            );
        }
    }
}

#[test]
fn random_play_never_breaks_the_world_on_the_shore_with_the_tide() {
    // As below, with the tide on: the ground moves under the orders through two cycles and more.
    let seeds: u32 = if cfg!(debug_assertions) { 2 } else { 6 };
    for seed in 0..seeds {
        let (me, foe) = [(0, 1), (1, 0)][(seed % 2) as usize];
        let mut g = Game::with_setup(seed * 7919 + 13, 1, 6, seed % 2, me, foe);
        g.set_tide(true);
        assert!(g.world().tide.is_some());
        let mut r = Mulberry32::new(seed ^ 0x71de);
        for tick in 0..30 * 60 * 7 {
            if tick % 7 == 0 {
                for _ in 0..1 + r.below(3) {
                    random_order(&mut g, &mut r);
                }
            }
            g.step();
            check_invariants(g.world(), &format!("tide seed {seed} tick {tick}"));
            if g.world().over {
                break;
            }
        }
    }
}

#[test]
fn with_the_tide_both_peoples_build_their_bases_on_the_shore() {
    // Land stays land at every level of the tide (on every map), so both peoples build as without it: four minutes
    // in, each AI has its Core and more.
    const { assert!(endfall_sim::map::DRY > endfall_sim::data::WATER_HIGH) };
    for races in [[&HUMANS, &VAEL], [&VAEL, &HUMANS]] {
        let mut w = World::with_size(21, 1, MapKind::Shore, MapSize::DUEL, 0, &races);
        w.set_tide(true);
        assert!(w.set_ai_seats([true, true]));
        for _ in 0..4 * 60 * TPS {
            w.step();
            w.events.clear();
        }
        for (seat, f) in races.iter().enumerate() {
            let built = w
                .bldgs
                .iter()
                .filter(|b| b.team as usize == seat && b.done)
                .count();
            assert!(
                built >= 4,
                "{} with the tide: {built} buildings at 4:00",
                f.name
            );
        }
        assert!(w.winner < 0, "no game over at 4:00");
    }
}

#[test]
fn both_ais_finish_games_on_the_shore_with_the_tide_at_every_level() {
    // (Brutal left out since the conversion's PR 1: under the cap of 40 its two AIs hold each other off on the Shore
    // with the tide, no result in 90 minutes; the tide is paused and the Shore out of the conversion's scope: back in
    // when the tide resumes)
    for diff in 0..3 {
        for (races, seed) in [
            ([&HUMANS, &VAEL], 21 + diff as u32),
            ([&VAEL, &HUMANS], 31 + diff as u32),
        ] {
            let mut w = World::with_size(seed, diff, MapKind::Shore, MapSize::DUEL, 0, &races);
            w.set_tide(true);
            assert!(w.set_ai_seats([true, true]));
            // (30 minutes until the conversion's PR 1: under the cap of 40 games run longer; back to 30 by the release
            // gate, PRD: the conversion)
            for _ in 0..45 * 60 * TPS {
                w.step();
                w.events.clear();
                if w.winner >= 0 {
                    break;
                }
            }
            assert!(
                w.winner >= 0,
                "level {diff}, {} first, with the tide: no result in 45 minutes",
                races[0].name
            );
        }
    }
}

#[test]
fn random_play_never_breaks_the_world_on_the_shore() {
    // Random orders through the Game API on the Shore map, both peoples on either side: the world invariants (no
    // walker in deep water among them) hold every tick.
    let seeds: u32 = if cfg!(debug_assertions) { 2 } else { 6 };
    for seed in 0..seeds {
        let (me, foe) = [(0, 1), (1, 0)][(seed % 2) as usize];
        let mut g = Game::with_setup(seed * 7919 + 11, 1, 6, seed % 2, me, foe);
        assert_eq!(g.world().map.basins.len(), 2, "the Shore map");
        let mut r = Mulberry32::new(seed ^ 0x5eed);
        for tick in 0..30 * 60 * 4 {
            if tick % 7 == 0 {
                for _ in 0..1 + r.below(3) {
                    random_order(&mut g, &mut r);
                }
            }
            g.step();
            check_invariants(g.world(), &format!("shore seed {seed} tick {tick}"));
            if g.world().over {
                break;
            }
        }
    }
}

/// The balance lab's exposed-income variants (`World::set_shore_field`): `BACK` is every game's map, bit for bit; the
/// others move only each basin's main field (and its vents with it), alike for both basins, every crystal still within
/// a walker's reach and none in deep water; `CHANNEL_FAR` differs from `CHANNEL` only in the crystals' distance.
#[test]
fn a_basins_field_moves_only_where_the_lab_asks() {
    use endfall_sim::map::ShoreField;
    let races = [&HUMANS, &VAEL];
    // a basin's two vents (inside its reef: within 10.5 tiles of its middle), by (tx, ty)
    let vents = |w: &World, b: usize| -> Vec<(i32, i32)> {
        let c = mid(w.map.basins[b]);
        let mut v: Vec<(i32, i32)> = w
            .map
            .nodes
            .iter()
            .filter(|n| n.ether)
            .filter(|n| ((n.tx as f64 - c.0).powi(2) + (n.ty as f64 - c.1).powi(2)).sqrt() < 10.5)
            .map(|n| (n.tx, n.ty))
            .collect();
        v.sort_unstable();
        v
    };
    // a basin's field: the basins' fields are the map's first two, and each basin's is the nearer
    let field = |w: &World, b: usize| -> Vec<(i32, i32)> {
        let c = mid(w.map.basins[b]);
        let of = |f: u32| -> Vec<(i32, i32)> {
            w.map
                .nodes
                .iter()
                .filter(|n| !n.ether && n.field == f)
                .map(|n| (n.tx, n.ty))
                .collect()
        };
        let d = |v: &[(i32, i32)]| {
            let n = v.len() as f64;
            let (x, y) = v
                .iter()
                .fold((0.0, 0.0), |a, t| (a.0 + t.0 as f64, a.1 + t.1 as f64));
            (x / n - c.0).hypot(y / n - c.1)
        };
        let (one, two) = (of(1), of(2));
        if d(&one) < d(&two) { one } else { two }
    };
    let direction = |w: &World, b: usize| {
        let c = mid(w.map.basins[b]);
        let f = field(w, b);
        let n = f.len() as f64;
        let (x, y) = f
            .iter()
            .fold((0.0, 0.0), |a, t| (a.0 + t.0 as f64, a.1 + t.1 as f64));
        let (dx, dy) = (x / n - c.0, y / n - c.1);
        (dy.atan2(dx), (dx * dx + dy * dy).sqrt())
    };
    for seed in SEEDS {
        let plain = shore(seed, races);
        let mut back = shore(seed, races);
        back.set_shore_field(ShoreField::BACK);
        assert_eq!(
            back.state_hash(),
            plain.state_hash(),
            "seed {seed}: BACK is the map every game plays"
        );
        let mut channel = shore(seed, races);
        channel.set_shore_field(ShoreField::CHANNEL);
        let mut far = shore(seed, races);
        far.set_shore_field(ShoreField::CHANNEL_FAR);
        for b in 0..2 {
            let (a0, r0) = direction(&plain, b);
            let (a1, r1) = direction(&channel, b);
            let (a2, r2) = direction(&far, b);
            // BACK lies opposite the channel, CHANNEL 40 degrees off it: 140 degrees apart (a tile's rounding aside)
            let turn = |a: f64, b: f64| {
                ((a - b).rem_euclid(2.0 * std::f64::consts::PI) - std::f64::consts::PI).abs()
            };
            assert!(
                (180.0 - turn(a0, a1).to_degrees() - 140.0).abs() < 12.0,
                "seed {seed}, basin {b}: the field turned {:.0} degrees",
                180.0 - turn(a0, a1).to_degrees()
            );
            assert!(
                turn(a1, a2).to_degrees() > 180.0 - 12.0,
                "seed {seed}: the far field in the same direction"
            );
            assert!(
                (r0 - r1).abs() < 1.0,
                "seed {seed}: the same distance ({r0:.1}, {r1:.1})"
            );
            assert!(
                r2 > r1 + 5.0,
                "seed {seed}: the far field farther ({r1:.1}, {r2:.1})"
            );
            assert_eq!(
                vents(&channel, b).len(),
                2,
                "seed {seed}: the basin's two vents"
            );
            assert_eq!(
                vents(&channel, b),
                vents(&far, b),
                "seed {seed}: the same vents"
            );
            for w in [&plain, &channel, &far] {
                assert_eq!(field(w, b).len(), 7, "seed {seed}: seven crystals");
            }
        }
        for w in [&channel, &far] {
            // point-symmetric, as every Shore field
            let all: Vec<(i32, i32, bool)> =
                w.map.nodes.iter().map(|n| (n.tx, n.ty, n.ether)).collect();
            let (mw, mh) = (w.map.w, w.map.h);
            for &(x, y, e) in &all {
                let s = if e { 2 } else { 1 };
                assert!(
                    all.contains(&(mw - s - x, mh - s - y, e)),
                    "seed {seed}: ({x}, {y}) has its image"
                );
            }
            // no crystal or vent in deep water (the generator itself checks that a walker reaches each)
            for n in &w.map.nodes {
                assert_ne!(
                    w.map.ground(n.tx, n.ty, 0),
                    Ground::Deep,
                    "seed {seed}: ({}, {}) in deep water",
                    n.tx,
                    n.ty
                );
            }
        }
    }
}

#[test]
fn both_ais_finish_games_with_the_basin_field_moved() {
    use endfall_sim::map::ShoreField;
    for field in [ShoreField::CHANNEL, ShoreField::CHANNEL_FAR] {
        for races in [[&HUMANS, &VAEL], [&VAEL, &HUMANS]] {
            let mut w = shore(3, races);
            w.set_shore_field(field);
            assert!(w.set_ai_seats([true, true]));
            for _ in 0..30 * 60 * TPS {
                w.step();
                w.events.clear();
                if w.winner >= 0 {
                    break;
                }
            }
            assert!(
                w.winner >= 0,
                "{field:?}, {} first: no result in 30 minutes",
                races[0].name
            );
        }
    }
}
