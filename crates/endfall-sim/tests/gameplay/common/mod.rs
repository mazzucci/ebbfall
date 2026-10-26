//! Shared helpers for the gameplay tests: worlds, scenes, building and running, duels.
#![allow(dead_code)]

pub use endfall_sim::data::Upgrade;
pub use endfall_sim::data::*;
pub use endfall_sim::map::{Id, MapKind, MapSize};
#[allow(unused_imports)]
pub use endfall_sim::world::{BUILDER_PATIENCE, REPAIR_COST};
pub use endfall_sim::world::{Phase, Task, Unit, World};
pub use endfall_sim::{Game, Mulberry32};

pub const TPS: u32 = 30;

pub fn run(w: &mut World, secs: u32) {
    for _ in 0..secs * TPS {
        w.step();
    }
}

pub fn harvesters(w: &World, team: u8) -> Vec<Id> {
    w.units
        .iter()
        .filter(|u| u.team == team && u.kind.def().worker)
        .map(|u| u.id)
        .collect()
}

pub fn core(w: &World, team: u8) -> (i32, i32) {
    let c = w
        .bldgs
        .iter()
        .find(|b| b.team == team && b.kind.def().hq)
        .expect("core");
    (c.tx, c.ty)
}

/// A free spot for `kind` in rings around the player's core.
pub fn spot(w: &World, kind: BldgKind) -> (i32, i32) {
    let (cx, cy) = core(w, PLAYER);
    for r in 3..14 {
        for a in 0..24 {
            let ang = a as f64 / 24.0 * std::f64::consts::TAU;
            let tx = (cx as f64 + 2.0 + ang.cos() * r as f64 - 1.0).round() as i32;
            let ty = (cy as f64 + 2.0 + ang.sin() * r as f64 - 1.0).round() as i32;
            if w.can_place(kind, tx, ty, PLAYER) {
                return (tx, ty);
            }
        }
    }
    panic!("no spot for {kind:?}");
}

/// Place `kind` with `builder` and run until it is finished (or fail after `limit` seconds).
pub fn build(w: &mut World, kind: BldgKind, builder: Id, limit: u32) -> Id {
    let (tx, ty) = if kind.def().on_vent {
        player_vent(w)
    } else {
        spot(w, kind)
    };
    let b = w
        .place_building(PLAYER, kind, tx, ty, Some(builder))
        .unwrap_or_else(|e| panic!("{kind:?}: {e}"));
    for _ in 0..limit * TPS {
        w.step();
        if let Some(bd) = w.bldg(b).filter(|b| b.done) {
            assert_eq!(
                bd.hp, bd.maxhp,
                "{kind:?} finishes at full hp (else it reads as damaged)"
            );
            return b;
        }
    }
    panic!(
        "{kind:?} not finished after {limit}s: progress {:?}",
        w.bldg(b).map(|b| b.progress)
    );
}

pub fn player_vent(w: &World) -> (i32, i32) {
    let (cx, cy) = core(w, PLAYER);
    let n = w
        .map
        .nodes
        .iter()
        .filter(|n| n.ether)
        .min_by_key(|n| (n.tx - cx).abs() + (n.ty - cy).abs())
        .unwrap();
    (n.tx, n.ty)
}

/// A world with plenty of resources and no opponent, for testing what the player can do.
/// A rich world, no opponent, the player on the Vael (the AI side stays human).
pub fn rich_vael(seed: u32) -> World {
    let mut w = World::with_setup(seed, 1, MapKind::Standard, false, [&VAEL, &HUMANS]);
    w.disable_ai();
    w.res[PLAYER as usize] = [20_000, 20_000];
    w
}

pub fn rich(seed: u32) -> World {
    let mut w = World::new(seed, 1);
    w.disable_ai();
    w.res[PLAYER as usize] = [20_000, 20_000];
    w
}

pub fn count(w: &World, team: u8, kind: UnitKind) -> usize {
    w.units
        .iter()
        .filter(|u| u.team == team && u.kind == kind)
        .count()
}

// ---------------- flyers, anti-air and healing ----------------

/// A quiet world with no starting units, for duels.
pub fn arena(seed: u32) -> World {
    let mut w = World::new(seed, 1);
    w.disable_ai();
    w.units.clear();
    w.recalc_supply(PLAYER);
    w.recalc_supply(ENEMY);
    w
}

// ---------------- upgrades ----------------

/// A finished forge for the player in a quiet arena with plenty of resources.
pub fn forge_arena(seed: u32) -> (World, Id) {
    let mut w = arena(seed);
    w.res[PLAYER as usize] = [5000, 5000];
    let f = w.make_building(BldgKind::Forge, PLAYER, 20, 40, true);
    (w, f)
}

pub fn research_level(w: &mut World, forge: Id, up: Upgrade) {
    w.start_research(forge, up).unwrap();
    let level = w.upgrades[PLAYER as usize][up.index()] + 1;
    run(w, up.time(level) as u32 + 1);
    assert_eq!(w.upgrades[PLAYER as usize][up.index()], level);
}

/// Damage of the first hit a `shooter` lands on a target of kind `target`.
pub fn first_hit(w: &mut World, shooter: UnitKind, shooter_team: u8, target: UnitKind) -> f64 {
    w.units.clear(); // a clean duel each time
    let t = w.make_unit(target, 1 - shooter_team, 900.0, 1200.0);
    w.hold_unit(t);
    let s = w.make_unit(shooter, shooter_team, 900.0 - 100.0, 1200.0);
    w.attack_ent(s, t);
    let hp0 = w.unit(t).unwrap().hp;
    for _ in 0..10 * TPS {
        w.step();
        let hp = w.unit(t).unwrap().hp;
        if hp < hp0 {
            return hp0 - hp;
        }
    }
    panic!("no hit");
}

mod duel;
mod invariants;
mod random;
pub use duel::*;
pub use invariants::*;
pub use random::*;

/// Put a lone player harvester at tile `from` and an unfinished `kind` at tile `site`; returns (world, unit, building).
pub fn lone_builder(
    seed: u32,
    from: (i32, i32),
    site: (i32, i32),
    kind: BldgKind,
) -> (World, Id, Id) {
    let mut w = World::new(seed, 1);
    w.disable_ai();
    w.units.clear();
    let h = w.make_unit(
        UnitKind::Harvester,
        PLAYER,
        from.0 as f64 * TILE + 16.0,
        from.1 as f64 * TILE + 16.0,
    );
    let b = w.make_building(kind, PLAYER, site.0, site.1, false);
    w.recalc_supply(PLAYER);
    assert!(w.start_build(h, b));
    (w, h, b)
}

pub fn builds_within(w: &mut World, h: Id, b: Id, secs: u32) -> Result<(), String> {
    for _ in 0..secs * TPS {
        w.step();
        if w.bldg(b).is_some_and(|b| b.done) {
            return Ok(());
        }
        if w.unit(h).is_some_and(|u| u.task != (Task::Build { b })) {
            return Err(format!(
                "builder gave up at {:.1}s at {:?}",
                w.time,
                w.unit(h).map(|u| (u.x, u.y))
            ));
        }
    }
    Err(format!("not built after {secs}s"))
}

/// Walking distance in tiles from `from` to every tile (4-neighbour, unblocked), -1 where unreachable.
pub fn walk_dist(w: &World, from: (i32, i32)) -> Vec<i32> {
    let mut d = vec![-1; w.map.rock.len()];
    let mut q = std::collections::VecDeque::from([from]);
    d[w.map.idx(from.0, from.1)] = 0;
    while let Some((x, y)) = q.pop_front() {
        for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
            let (nx, ny) = (x + dx, y + dy);
            if !w.map.blocked(nx, ny) && d[w.map.idx(nx, ny)] < 0 {
                d[w.map.idx(nx, ny)] = d[w.map.idx(x, y)] + 1;
                q.push_back((nx, ny));
            }
        }
    }
    d
}

/// A builder's start and a Barracks site on `seed`'s map, reachable but at least 1.5 times as far on foot as in
/// a straight line (the first one found, deterministically).
pub fn long_way_around(seed: u32) -> Option<((i32, i32), (i32, i32))> {
    let w = World::new(seed, 1);
    let mut r = Mulberry32::new(seed ^ 0x51ed);
    for _ in 0..4000 {
        let from = (2 + r.below(60) as i32, 2 + r.below(60) as i32);
        let site = (2 + r.below(58) as i32, 2 + r.below(58) as i32);
        if w.map.blocked(from.0, from.1) || !w.can_place(BldgKind::Barracks, site.0, site.1, ENEMY)
        {
            continue;
        }
        let straight = (((from.0 - site.0).pow(2) + (from.1 - site.1).pow(2)) as f64).sqrt();
        if straight < 15.0 {
            continue;
        }
        let d = walk_dist(&w, from);
        // the nearest tile beside the site's footprint
        let walk = (site.1 - 1..=site.1 + 3)
            .flat_map(|y| (site.0 - 1..=site.0 + 3).map(move |x| (x, y)))
            .filter(|&(x, y)| w.map.in_map(x, y) && d[w.map.idx(x, y)] >= 0)
            .map(|(x, y)| d[w.map.idx(x, y)])
            .min();
        if walk.is_some_and(|k| k as f64 >= straight * 1.5) {
            return Some((from, site));
        }
    }
    None
}

/// Tiles reachable on foot from `from` (4-neighbour flood fill over unblocked tiles).
pub fn reachable(w: &World, from: (i32, i32)) -> Vec<bool> {
    let mut seen = vec![false; w.map.rock.len()];
    let mut q = vec![from];
    seen[w.map.idx(from.0, from.1)] = true;
    while let Some((x, y)) = q.pop() {
        for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
            let (nx, ny) = (x + dx, y + dy);
            if !w.map.blocked(nx, ny) && !seen[w.map.idx(nx, ny)] {
                seen[w.map.idx(nx, ny)] = true;
                q.push((nx, ny));
            }
        }
    }
    seen
}

/// A player Depot, finished, then knocked down to `frac` of its hp; the harvesters walk off and wait (no income).
pub fn damaged_depot(seed: u32, frac: f64) -> (World, Id, Id) {
    let mut w = rich(seed);
    let h = harvesters(&w, PLAYER);
    let depot = build(&mut w, BldgKind::Depot, h[0], 60);
    let (cx, cy) = core(&w, PLAYER);
    for (k, &o) in h.iter().enumerate() {
        w.move_to(
            o,
            (cx as f64 + 2.0) * TILE + k as f64 * 24.0,
            (cy as f64 - 2.0) * TILE,
        );
    }
    run(&mut w, 6);
    let b = w.bldgs.iter_mut().find(|b| b.id == depot).unwrap();
    b.hp = (b.maxhp * frac).round();
    (w, depot, h[1])
}

pub fn tile_round(v: f64) -> i32 {
    v.round() as i32
}

/// A Trooper attack-moving next to an enemy Depot while an enemy unit stands a little farther off.
pub fn priority_scene(foe: UnitKind) -> (World, Id, Id, Id) {
    let mut w = flat_arena(16);
    let depot = w.make_building(BldgKind::Depot, ENEMY, 30, 30, true);
    let me = w.make_unit(UnitKind::Trooper, PLAYER, 29.0 * TILE, 32.0 * TILE);
    let other = w.make_unit(foe, ENEMY, 25.0 * TILE, 32.5 * TILE);
    w.hold_unit(other);
    w.attack_move(me, 36.0 * TILE, 32.0 * TILE);
    (w, me, depot, other)
}

pub fn target_of(w: &World, u: Id) -> Option<Id> {
    match w.unit(u)?.task {
        Task::Attack { target, .. } => Some(target),
        _ => None,
    }
}

/// The player's shard fields around its core, nearest first.
pub fn home_fields(w: &World) -> Vec<Id> {
    let (cx, cy) = core(w, PLAYER);
    let mut f: Vec<(i32, Id)> = w
        .map
        .nodes
        .iter()
        .filter(|n| !n.ether)
        .map(|n| ((n.tx - cx - 2).pow(2) + (n.ty - cy - 2).pow(2), n.id))
        .collect();
    f.sort();
    f.into_iter().map(|(_, id)| id).collect()
}

pub fn gather_node(w: &World, u: Id) -> Option<Id> {
    match w.unit(u)?.task {
        Task::Gather { node, .. } => Some(node),
        _ => None,
    }
}

/// Move a node to another tile (scenes that need fields in known places).
pub fn move_node(w: &mut World, id: Id, tx: i32, ty: i32) {
    let n = w.map.node(id).unwrap();
    let (size, ox, oy) = (if n.ether { 2 } else { 1 }, n.tx, n.ty);
    for y in 0..size {
        for x in 0..size {
            let i = w.map.idx(ox + x, oy + y);
            w.map.occ[i] = 0;
        }
    }
    let n = w.map.node_mut(id).unwrap();
    n.tx = tx;
    n.ty = ty;
    n.x = (tx as f64 + size as f64 / 2.0) * TILE;
    n.y = (ty as f64 + size as f64 / 2.0) * TILE;
    for y in 0..size {
        for x in 0..size {
            let i = w.map.idx(tx + x, ty + y);
            w.map.occ[i] = -(id as i32);
        }
    }
}

/// Set a unit's hull (raising its maximum if needed): a sturdy target, or a hurt one.
pub fn set_hp(w: &mut World, id: Id, hp: f64) {
    let u = w.units.iter_mut().find(|u| u.id == id).unwrap();
    u.maxhp = u.maxhp.max(hp);
    u.hp = hp;
}
