//! Shared helpers for the gameplay tests: worlds, scenes, building and running, duels.
#![allow(dead_code)]

pub use endfall_sim::data::Upgrade;
pub use endfall_sim::data::*;
pub use endfall_sim::map::{Id, MapKind, in_map};
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
        .filter(|u| u.team == team && u.kind == UnitKind::Harvester)
        .map(|u| u.id)
        .collect()
}

pub fn core(w: &World, team: u8) -> (i32, i32) {
    let c = w
        .bldgs
        .iter()
        .find(|b| b.team == team && b.kind == BldgKind::Core)
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
    let (tx, ty) = if kind == BldgKind::Extractor {
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

// ---------------- randomized orders + invariants ----------------

pub fn check_invariants(w: &World, ctx: &str) {
    for list in [
        w.units.iter().map(|u| u.id).collect::<Vec<_>>(),
        w.bldgs.iter().map(|b| b.id).collect(),
    ] {
        assert!(
            list.windows(2).all(|p| p[0] < p[1]),
            "{ctx}: entity lists sorted by id, no duplicates"
        );
    }
    for u in &w.units {
        assert!(
            u.x.is_finite() && u.y.is_finite(),
            "{ctx}: unit {} position {},{}",
            u.id,
            u.x,
            u.y
        );
        assert!(
            u.x >= 0.0 && u.y >= 0.0 && u.x <= WW && u.y <= WH,
            "{ctx}: unit {} off the map {},{}",
            u.id,
            u.x,
            u.y
        );
        assert!(
            u.hp > 0.0 && u.hp <= u.maxhp,
            "{ctx}: unit {} hp {}",
            u.id,
            u.hp
        );
        assert!(
            u.carry >= 0 && u.carry <= 8,
            "{ctx}: unit {} carry {}",
            u.id,
            u.carry
        );
    }
    for b in &w.bldgs {
        assert!(
            b.hp > 0.0 && b.hp <= b.maxhp,
            "{ctx}: building {} hp {}",
            b.id,
            b.hp
        );
        assert!(
            (0.0..=1.0).contains(&b.progress),
            "{ctx}: building {} progress {}",
            b.id,
            b.progress
        );
        assert!(b.queue.len() <= 5);
        if let Some((up, p)) = b.research {
            assert!(
                b.kind == BldgKind::Forge && b.done,
                "{ctx}: research at {:?}",
                b.kind
            );
            assert!((0.0..1.0).contains(&p), "{ctx}: research progress {p}");
            assert!(
                w.upgrades[b.team as usize][up.index()] < 3,
                "{ctx}: researching past level 3"
            );
            assert_eq!(
                w.bldgs
                    .iter()
                    .filter(|o| o.team == b.team && o.research.is_some_and(|(u, _)| u == up))
                    .count(),
                1,
                "{ctx}: {up:?} researched twice"
            );
        }
        assert!(
            (0.0..=1.0).contains(&b.prog),
            "{ctx}: building {} prog {}",
            b.id,
            b.prog
        );
        assert!(
            b.done || b.queue.is_empty(),
            "{ctx}: unfinished building {} has a queue",
            b.id
        );
        assert!(
            b.queue.iter().all(|k| b.kind.def().trains.contains(k)),
            "{ctx}: building {} queues {:?}",
            b.id,
            b.queue
        );
        for y in 0..b.h {
            for x in 0..b.w {
                assert_eq!(
                    w.map.occ[((b.ty + y) * MW + b.tx + x) as usize],
                    b.id as i32,
                    "{ctx}: occupancy under building {}",
                    b.id
                );
            }
        }
    }
    for (i, &o) in w.map.occ.iter().enumerate() {
        if o > 0 {
            assert!(
                w.bldg(o as Id).is_some(),
                "{ctx}: tile {i} occupied by dead building {o}"
            );
        } else if o < 0 {
            assert!(
                w.map.node((-o) as Id).is_some(),
                "{ctx}: tile {i} occupied by missing node {}",
                -o
            );
        }
    }
    for t in 0..2 {
        assert!(
            w.res[t][0] >= 0 && w.res[t][1] >= 0,
            "{ctx}: team {t} resources {:?}",
            w.res[t]
        );
        let used: i32 = w
            .units
            .iter()
            .filter(|u| u.team as usize == t)
            .map(|u| u.kind.def().supply)
            .sum::<i32>()
            + w.bldgs
                .iter()
                .filter(|b| b.team as usize == t)
                .flat_map(|b| b.queue.iter())
                .map(|k| k.def().supply)
                .sum::<i32>();
        assert_eq!(w.sup[t][0], used, "{ctx}: team {t} supply used");
        let cap: i32 = w
            .bldgs
            .iter()
            .filter(|b| b.team as usize == t && b.done)
            .map(|b| b.kind.def().supply)
            .sum();
        assert_eq!(w.sup[t][1], cap.min(200), "{ctx}: team {t} supply cap");
    }
    for p in &w.projs {
        assert!(
            p.x.is_finite() && p.y.is_finite(),
            "{ctx}: projectile position"
        );
    }
    if !w.over {
        assert!(
            w.bldgs.iter().any(|b| b.team == ENEMY),
            "{ctx}: enemy has no buildings but the game is not over"
        );
        assert!(
            w.bldgs.iter().any(|b| b.team == PLAYER)
                || w.units
                    .iter()
                    .any(|u| u.team == PLAYER && u.kind == UnitKind::Harvester),
            "{ctx}: player is eliminated but the game is not over"
        );
    }
    for n in &w.map.nodes {
        let mining = w
            .units
            .iter()
            .filter(
                |u| matches!(u.task, Task::Gather { node, phase: Phase::Mine, .. } if node == n.id),
            )
            .count() as i32;
        assert_eq!(
            n.miners, mining,
            "{ctx}: node {} miners counter vs mining units",
            n.id
        );
        assert!(
            n.miners <= MINE_SLOTS,
            "{ctx}: node {} has {} miners",
            n.id,
            n.miners
        );
    }
}

pub const KINDS_B: [&str; 8] = [
    "depot",
    "barracks",
    "extractor",
    "forge",
    "turret",
    "core",
    "airfield",
    "nonsense",
];

pub const KINDS_U: [&str; 8] = [
    "harvester",
    "trooper",
    "vanguard",
    "lancer",
    "medic",
    "wasp",
    "observer",
    "nonsense",
];

/// One random order through the same Game API the browser uses, with ids that may be stale or garbage.
pub fn random_order(g: &mut Game, r: &mut Mulberry32) {
    random_order_with(g, r, true);
}

/// A random order; `cheats` also allows granting resources (not a player order: it is never logged).
pub fn random_order_with(g: &mut Game, r: &mut Mulberry32, cheats: bool) {
    let w = g.world();
    let mut ids: Vec<u32> = w
        .units
        .iter()
        .map(|u| u.id)
        .chain(w.bldgs.iter().map(|b| b.id))
        .chain(w.map.nodes.iter().map(|n| n.id))
        .collect();
    ids.extend([0, 1, 99_999, w.units.last().map_or(5, |u| u.id + 1)]);
    let pick = |r: &mut Mulberry32| ids[r.below(ids.len() as u32) as usize];
    let (x, y) = (r.below(2200) as f64 - 60.0, r.below(2200) as f64 - 60.0);
    let (a, b) = (pick(r), pick(r));
    match r.below(17) {
        0 => g.move_to(a, x, y),
        1 => g.attack_move(a, x, y),
        2 => g.attack_ent(a, b),
        3 => g.stop_unit(a),
        4 => g.hold_unit(a),
        5 => g.start_gather(a, b),
        6 => g.start_build(a, b),
        7 => {
            let _ = g.place_building(
                r.below(3) as u8,
                KINDS_B[r.below(8) as usize],
                (x / 32.0) as i32,
                (y / 32.0) as i32,
                a,
            );
        }
        8 => {
            let _ = g.queue_unit(a, KINDS_U[r.below(8) as usize]);
        }
        9 => g.cancel_queue(a, r.below(7)),
        10 => g.set_rally(a, x, y, if r.below(2) == 0 { b } else { 0 }),
        11 => g.formation(&[a, b, pick(r)], x, y),
        12 if cheats => g.set_resources(PLAYER, r.below(3000) as i32, r.below(1000) as i32),
        13 => g.cancel_construction(a),
        14 => {
            let _ = g.research(a, ["weapons", "armor", "nonsense"][r.below(3) as usize]);
        }
        15 => g.cancel_research(a),
        16 => g.repair(a, b),
        _ => {}
    }
}

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
    let mut d = vec![-1; (MW * MH) as usize];
    let mut q = std::collections::VecDeque::from([from]);
    d[(from.1 * MW + from.0) as usize] = 0;
    while let Some((x, y)) = q.pop_front() {
        for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
            let (nx, ny) = (x + dx, y + dy);
            if !w.map.blocked(nx, ny) && d[(ny * MW + nx) as usize] < 0 {
                d[(ny * MW + nx) as usize] = d[(y * MW + x) as usize] + 1;
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
            .filter(|&(x, y)| in_map(x, y) && d[(y * MW + x) as usize] >= 0)
            .map(|(x, y)| d[(y * MW + x) as usize])
            .min();
        if walk.is_some_and(|k| k as f64 >= straight * 1.5) {
            return Some((from, site));
        }
    }
    None
}

/// Tiles reachable on foot from `from` (4-neighbour flood fill over unblocked tiles).
pub fn reachable(w: &World, from: (i32, i32)) -> Vec<bool> {
    let mut seen = vec![false; (MW * MH) as usize];
    let mut q = vec![from];
    seen[(from.1 * MW + from.0) as usize] = true;
    while let Some((x, y)) = q.pop() {
        for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
            let (nx, ny) = (x + dx, y + dy);
            if !w.map.blocked(nx, ny) && !seen[(ny * MW + nx) as usize] {
                seen[(ny * MW + nx) as usize] = true;
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

/// The value of a unit for balance: shards + 2 x ether.
pub fn unit_value(k: UnitKind) -> f64 {
    k.def().cost[0] as f64 + 2.0 * k.def().cost[1] as f64
}

/// The arena with the middle of the map flattened: no rock, no resource fields (the bases stay in their corners).
pub fn flat_arena(seed: u32) -> World {
    let mut w = arena(seed);
    flatten(&mut w, 12..52, 12..52);
    w
}

/// Clear the rock and resource fields from a rectangle of tiles (scenes that need a known piece of ground).
pub fn flatten(w: &mut World, xs: std::ops::Range<i32>, ys: std::ops::Range<i32>) {
    let inside = |x: i32, y: i32| xs.contains(&x) && ys.contains(&y);
    let gone: Vec<Id> = w
        .map
        .nodes
        .iter()
        .filter(|n| inside(n.tx, n.ty))
        .map(|n| n.id)
        .collect();
    w.map.nodes.retain(|n| !gone.contains(&n.id));
    for y in ys.clone() {
        for x in xs.clone() {
            let i = (y * MW + x) as usize;
            w.map.rock[i] = 0;
            if w.map.occ[i] < 0 {
                w.map.occ[i] = 0;
            }
        }
    }
}

/// Two armies of about `budget` (within 10%) meet on open ground, in compact blocks; idle survivors re-engage.
/// Returns the difference in surviving share of what each side spent (+ side A won, - side B won), so the odd unit
/// more that rounding gives one side does not decide the score.
pub fn duel_once(a: &[UnitKind], b: &[UnitKind], budget: f64, off: (f64, f64)) -> f64 {
    let mut w = flat_arena(16);
    let army = |mix: &[UnitKind]| -> Vec<UnitKind> {
        let per: f64 = mix.iter().map(|&k| unit_value(k)).sum();
        let n = (budget / per).round().max(1.0) as usize;
        (0..n).flat_map(|_| mix.iter().copied()).collect()
    };
    let spawn = |w: &mut World, kinds: &[UnitKind], team: u8, x0: f64, dir: f64| -> Vec<Id> {
        let gap = kinds.iter().map(|k| k.def().r).fold(0.0, f64::max) * 2.0 + 4.0;
        kinds
            .iter()
            .enumerate()
            .map(|(i, &k)| {
                let (col, row) = ((i / 6) as f64, (i % 6) as f64 - 2.5);
                w.make_unit(
                    k,
                    team,
                    x0 + dir * col * gap + off.0,
                    1024.0 + row * gap + off.1,
                )
            })
            .collect()
    };
    let (ka, kb) = (army(a), army(b));
    let spend = |k: &[UnitKind]| k.iter().map(|&u| unit_value(u)).sum::<f64>();
    let (sa, sb) = (spend(&ka), spend(&kb));
    assert!(
        (sa - budget).abs() <= budget * 0.1 && (sb - budget).abs() <= budget * 0.1,
        "armies of {sa} and {sb} for {budget}"
    );
    let ia = spawn(&mut w, &ka, PLAYER, 880.0, -1.0);
    let ib = spawn(&mut w, &kb, ENEMY, 1170.0, 1.0);
    let alive = |w: &World, ids: &[Id]| {
        ids.iter()
            .filter_map(|&i| w.unit(i))
            .map(|u| unit_value(u.kind) * u.hp / u.maxhp)
            .sum::<f64>()
    };
    for t in 0..120 * TPS {
        if t % TPS == 0 {
            // Anyone standing idle walks at the nearest enemy (no stalls with survivors out of sight).
            for (mine, theirs) in [(&ia, &ib), (&ib, &ia)] {
                for &u in mine.iter() {
                    let Some(me) = w.unit(u).filter(|u| matches!(u.task, Task::Idle) || t == 0)
                    else {
                        continue;
                    };
                    let (mx, my) = (me.x, me.y);
                    let near = theirs
                        .iter()
                        .filter_map(|&o| w.unit(o))
                        .map(|o| (o.x, o.y))
                        .min_by(|p, q| {
                            let dp = (p.0 - mx).powi(2) + (p.1 - my).powi(2);
                            let dq = (q.0 - mx).powi(2) + (q.1 - my).powi(2);
                            dp.partial_cmp(&dq).unwrap()
                        });
                    if let Some((x, y)) = near {
                        w.attack_move(u, x, y);
                    }
                }
            }
        }
        w.step();
        if alive(&w, &ia) < 1.0 || alive(&w, &ib) < 1.0 {
            break;
        }
    }
    alive(&w, &ia) / sa - alive(&w, &ib) / sb
}

/// A duel played both ways round (who spawns first updates first) and from three spawn offsets; the median.
pub fn duel(a: &[UnitKind], b: &[UnitKind], budget: f64) -> f64 {
    let mut r: Vec<f64> = [(0.0, 0.0), (0.0, 13.0), (9.0, -7.0)]
        .iter()
        .map(|&off| (duel_once(a, b, budget, off) - duel_once(b, a, budget, off)) / 2.0)
        .collect();
    r.sort_by(|p, q| p.partial_cmp(q).unwrap());
    r[1]
}

/// `wasps` raid a mineral line of 8 mining harvesters (hunting harvesters like the AI's raiders), guarded by
/// `turrets` and `troopers`; returns (harvesters lost, wasps lost) after 40 s.
pub fn raid(wasps: usize, turrets: usize, troopers: usize) -> (usize, usize) {
    let mut w = World::new(7, 1);
    w.disable_ai();
    let (cx, cy) = core(&w, PLAYER);
    let node = w
        .map
        .nodes
        .iter()
        .filter(|n| !n.ether)
        .min_by_key(|n| (n.tx - cx).pow(2) + (n.ty - cy).pow(2))
        .unwrap();
    let (nx, ny, nid) = (node.x, node.y, node.id);
    for k in 0..4 {
        w.make_unit(
            UnitKind::Harvester,
            PLAYER,
            nx + 30.0 + k as f64 * 10.0,
            ny + 30.0,
        );
    }
    let hs = harvesters(&w, PLAYER);
    for &h in &hs {
        w.start_gather(h, nid);
    }
    for k in 0..turrets {
        let f = w
            .map
            .nearest_free(
                tile_round(nx / TILE) + 2 + 3 * k as i32,
                tile_round(ny / TILE) + 2,
                6,
            )
            .unwrap();
        w.make_building(BldgKind::Turret, PLAYER, f.0, f.1, true);
    }
    for k in 0..troopers {
        let t = w.make_unit(
            UnitKind::Trooper,
            PLAYER,
            nx + 40.0 + (k % 3) as f64 * 20.0,
            ny - 40.0 + (k / 3) as f64 * 20.0,
        );
        w.hold_unit(t);
    }
    run(&mut w, 8);
    let ws: Vec<Id> = (0..wasps)
        .map(|k| {
            w.make_unit(
                UnitKind::Wasp,
                ENEMY,
                nx + 500.0,
                ny - 300.0 + k as f64 * 25.0,
            )
        })
        .collect();
    for t in 0..40 * TPS {
        if t % (TPS / 2) == 0 {
            for &wid in &ws {
                let Some(me) = w.unit(wid) else { continue };
                let hunting = matches!(me.task, Task::Attack { target, .. } if w.unit(target).is_some_and(|u| u.kind == UnitKind::Harvester));
                if hunting {
                    continue;
                }
                let (mx, my) = (me.x, me.y);
                if let Some(p) = hs
                    .iter()
                    .filter_map(|&h| w.unit(h))
                    .min_by(|a, b| {
                        ((a.x - mx).powi(2) + (a.y - my).powi(2))
                            .partial_cmp(&((b.x - mx).powi(2) + (b.y - my).powi(2)))
                            .unwrap()
                    })
                    .map(|u| u.id)
                {
                    w.attack_ent(wid, p);
                }
            }
        }
        w.step();
    }
    (
        hs.iter().filter(|&&h| w.unit(h).is_none()).count(),
        ws.iter().filter(|&&x| w.unit(x).is_none()).count(),
    )
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
            w.map.occ[((oy + y) * MW + ox + x) as usize] = 0;
        }
    }
    let n = w.map.node_mut(id).unwrap();
    n.tx = tx;
    n.ty = ty;
    n.x = (tx as f64 + size as f64 / 2.0) * TILE;
    n.y = (ty as f64 + size as f64 / 2.0) * TILE;
    for y in 0..size {
        for x in 0..size {
            w.map.occ[((ty + y) * MW + tx + x) as usize] = -(id as i32);
        }
    }
}
