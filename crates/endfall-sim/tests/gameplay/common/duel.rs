//! Cost-equal fights for the balance tests: duels, raids, and the flat arenas they run in.

use super::*;

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

/// A flat arena where both sides have researched every tech (abilities unlocked, flyers sped up).
pub fn tech_arena(seed: u32) -> World {
    let mut w = flat_arena(seed);
    all_techs(&mut w);
    w
}

/// Both sides have every one-level tech.
pub fn all_techs(w: &mut World) {
    for up in UPGRADES.into_iter().filter(|u| u.levels() == 1) {
        for t in 0..2 {
            w.upgrades[t][up.index()] = 1;
        }
    }
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
            let i = w.map.idx(x, y);
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
/// What each side does in a duel besides fighting (casting abilities, kiting), once a second: the world, that side's
/// units, the other side's.
pub type Micro = fn(&mut World, &[Id], &[Id]);
/// No micro: the armies just fight.
pub fn no_micro(_: &mut World, _: &[Id], _: &[Id]) {}
/// The scripted opponent's use of abilities (`World::auto_cast`): Stim, Blink, Entrench, Cloak, a tank packing up.
pub fn ability_micro(w: &mut World, mine: &[Id], _: &[Id]) {
    if let Some(team) = mine.iter().find_map(|&u| w.unit(u)).map(|u| u.team) {
        w.auto_cast(team);
    }
}

pub fn duel_once(
    a: &[UnitKind],
    b: &[UnitKind],
    budget: f64,
    off: (f64, f64),
    micro: Micro,
) -> f64 {
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
            micro(&mut w, &ia, &ib);
            micro(&mut w, &ib, &ia);
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
    duel_with(a, b, budget, no_micro)
}

/// A duel where both sides also play `micro` (abilities): scored like `duel`.
pub fn duel_with(a: &[UnitKind], b: &[UnitKind], budget: f64, micro: Micro) -> f64 {
    let mut r: Vec<f64> = [(0.0, 0.0), (0.0, 13.0), (9.0, -7.0)]
        .iter()
        .map(|&off| {
            (duel_once(a, b, budget, off, micro) - duel_once(b, a, budget, off, micro)) / 2.0
        })
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
