//! Crowds settle instead of trembling: a unit that cannot get where it is going (boxed in, at a crowded goal, in a
//! queue at a gap) stands still facing one way, rather than turning on the spot and shuffling back and forth.
//!
//! The measures, over a window when the scene should be calm:
//! - turns: how often a unit's drawn facing (one of 16, as the client draws it) changes, per unit per second;
//! - shuffle: how far units walk in all, per unit per second, beyond where they end up (back-and-forth motion).

use crate::common::*;

/// The client draws 16 facings: the one a heading falls in.
fn facing16(face: f64) -> i32 {
    let step = std::f64::consts::TAU / 16.0;
    (face / step).round().rem_euclid(16.0) as i32
}

/// The worst unit of `ids` over `secs` seconds: (flickers per second, reversals per second). A flicker is the drawn
/// facing changing and changing back within a third of a second (10 ticks): the visible tremble. A reversal is a
/// tick's step of more than a quarter pixel that goes back against the unit's previous such step.
fn tremble(w: &mut World, ids: &[Id], secs: f64) -> (f64, f64) {
    let at = |w: &World| -> Vec<Option<(f64, f64, i32)>> {
        ids.iter()
            .map(|&id| w.unit(id).map(|u| (u.x, u.y, facing16(u.face))))
            .collect()
    };
    let mut last = at(w);
    let n = ids.len();
    let (mut flicks, mut revs) = (vec![0usize; n], vec![0usize; n]);
    let mut step: Vec<Option<(f64, f64)>> = vec![None; n];
    // the facing before the last change, and the tick of that change
    let mut turned: Vec<Option<(i32, u32)>> = vec![None; n];
    let ticks = (secs * TPS as f64) as u32;
    for t in 0..ticks {
        w.step();
        let now = at(w);
        for i in 0..n {
            if let (Some(a), Some(b)) = (last[i], now[i]) {
                if a.2 != b.2 {
                    if let Some((before, when)) = turned[i]
                        && before == b.2
                        && t - when <= 10
                    {
                        flicks[i] += 1;
                    }
                    turned[i] = Some((a.2, t));
                }
                let (dx, dy) = (b.0 - a.0, b.1 - a.1);
                if dx * dx + dy * dy > 0.0625 {
                    if let Some((px, py)) = step[i]
                        && px * dx + py * dy < 0.0
                    {
                        revs[i] += 1;
                    }
                    step[i] = Some((dx, dy));
                }
            }
        }
        last = now;
    }
    let worst = |v: &[usize]| *v.iter().max().unwrap_or(&0) as f64 / secs;
    (worst(&flicks), worst(&revs))
}

fn px(t: f64) -> f64 {
    t * TILE + 16.0
}

/// `n` Troopers of `team` in a block (`cols` across, `gap` px apart) centered on world point (x, y).
fn troopers(w: &mut World, team: u8, x: f64, y: f64, n: usize, cols: usize, gap: f64) -> Vec<Id> {
    let rows = n.div_ceil(cols);
    (0..n)
        .map(|i| {
            let ox = (i % cols) as f64 * gap - (cols - 1) as f64 * gap / 2.0;
            let oy = (i / cols) as f64 * gap - (rows - 1) as f64 * gap / 2.0;
            w.make_unit(UnitKind::Trooper, team, x + ox, y + oy)
        })
        .collect()
}

/// The scenes, each returning (name, turns/s, shuffle px/s) over its calm window.
fn scenes(seed: u32) -> Vec<(&'static str, f64, f64)> {
    let mut out = Vec::new();

    // 1. An army attack-moved to an empty spot: all of it goes to the one point, and should then stand.
    let mut w = flat_arena(seed);
    let ids = troopers(&mut w, PLAYER, px(20.0), px(30.0), 16, 4, 28.0);
    w.attack_move_group(&ids, px(36.0), px(30.0));
    run(&mut w, 12);
    let (t, s) = tremble(&mut w, &ids, 8.0);
    out.push(("attack-move to one spot, after arriving", t, s));

    // 2. A group sent (in formation) into ground a crowd of idle units already stands on.
    let mut w = flat_arena(seed);
    let _crowd = troopers(&mut w, PLAYER, px(36.0), px(30.0), 16, 4, 24.0);
    let ids = troopers(&mut w, PLAYER, px(20.0), px(30.0), 9, 3, 28.0);
    w.formation(&ids, px(36.0), px(30.0));
    run(&mut w, 12);
    let (t, s) = tremble(&mut w, &ids, 8.0);
    out.push(("formation into a standing crowd", t, s));

    // 3. Through a one-tile gap in a wall: the queue at the gap.
    let mut w = flat_arena(seed);
    for y in 14..50 {
        if y != 30 {
            let i = w.map.idx(30, y);
            w.map.rock[i] = 1;
        }
    }
    let ids = troopers(&mut w, PLAYER, px(24.0), px(30.0), 16, 4, 28.0);
    w.formation(&ids, px(38.0), px(30.0));
    run(&mut w, 4);
    let (t, s) = tremble(&mut w, &ids, 8.0);
    out.push(("queue at a one-tile gap", t, s));

    // 4. Melee units on one building: those that cannot reach it wait their turn.
    let mut w = flat_arena(seed);
    let depot = w.make_building(BldgKind::Depot, ENEMY, 36, 30, true);
    let blades: Vec<Id> = (0..14)
        .map(|i| {
            w.make_unit(
                UnitKind::Scythe,
                PLAYER,
                px(26.0) + (i % 4) as f64 * 28.0,
                px(28.0) + (i / 4) as f64 * 28.0,
            )
        })
        .collect();
    for &b in &blades {
        w.attack_ent(b, depot);
    }
    run(&mut w, 6);
    let (t, s) = tremble(&mut w, &blades, 6.0);
    out.push(("melee crowd on one building", t, s));

    // 5. One unit ringed by idle ones, sent out of the ring: it should push through, not dance.
    let mut w = flat_arena(seed);
    let (cx, cy) = (px(30.0), px(30.0));
    let hero = w.make_unit(UnitKind::Trooper, PLAYER, cx, cy);
    for k in 0..8 {
        let a = k as f64 * std::f64::consts::TAU / 8.0;
        w.make_unit(
            UnitKind::Trooper,
            PLAYER,
            cx + a.cos() * 24.0,
            cy + a.sin() * 24.0,
        );
    }
    w.move_to(hero, px(40.0), px(30.0));
    let (t, s) = tremble(&mut w, &[hero], 6.0);
    out.push(("one unit ringed, sent out", t, s));

    // The same scenes measured while they happen (from the order on), not after.
    let mut w = flat_arena(seed);
    let ids = troopers(&mut w, PLAYER, px(20.0), px(30.0), 16, 4, 28.0);
    w.attack_move_group(&ids, px(36.0), px(30.0));
    let (t, s) = tremble(&mut w, &ids, 12.0);
    out.push(("attack-move to one spot, whole way", t, s));
    let mut w = flat_arena(seed);
    let _crowd = troopers(&mut w, PLAYER, px(36.0), px(30.0), 16, 4, 24.0);
    let ids = troopers(&mut w, PLAYER, px(20.0), px(30.0), 9, 3, 28.0);
    w.formation(&ids, px(36.0), px(30.0));
    let (t, s) = tremble(&mut w, &ids, 12.0);
    out.push(("formation into a crowd, whole way", t, s));

    // 6. Two groups meeting head-on in a corridor three tiles wide.
    let mut w = flat_arena(seed);
    for x in 14..50 {
        for y in [28, 32] {
            let i = w.map.idx(x, y);
            w.map.rock[i] = 1;
        }
    }
    let a = troopers(&mut w, PLAYER, px(18.0), px(30.0), 9, 3, 28.0);
    let b = troopers(&mut w, PLAYER, px(44.0), px(30.0), 9, 3, 28.0);
    w.formation(&a, px(44.0), px(30.0));
    w.formation(&b, px(18.0), px(30.0));
    let both: Vec<Id> = a.iter().chain(&b).copied().collect();
    let (t, s) = tremble(&mut w, &both, 16.0);
    out.push(("two groups head-on in a corridor", t, s));

    // 7. Ranged units ordered onto one tough target that the front ranks hide from the back ones.
    let mut w = flat_arena(seed);
    let tank = w.make_unit(UnitKind::Knight, ENEMY, px(38.0), px(30.0));
    set_hp(&mut w, tank, 1e9);
    w.hold_unit(tank);
    let ids = troopers(&mut w, PLAYER, px(24.0), px(30.0), 20, 4, 28.0);
    for &id in &ids {
        w.attack_ent(id, tank);
    }
    let (t, s) = tremble(&mut w, &ids, 12.0);
    out.push(("ranged crowd on one tough target", t, s));

    // 8. A group sent to the far side of a building: round it.
    let mut w = flat_arena(seed);
    w.make_building(BldgKind::Barracks, PLAYER, 29, 28, true);
    let ids = troopers(&mut w, PLAYER, px(24.0), px(30.0), 12, 3, 28.0);
    w.formation(&ids, px(36.0), px(30.0));
    let (t, s) = tremble(&mut w, &ids, 10.0);
    out.push(("group round a building", t, s));

    // 9. Two armies meeting in the open (both sides measured), until one is gone.
    let mut w = flat_arena(seed);
    let a = troopers(&mut w, PLAYER, px(22.0), px(30.0), 16, 4, 28.0);
    let b = troopers(&mut w, ENEMY, px(40.0), px(30.0), 16, 4, 28.0);
    w.attack_move_group(&a, px(40.0), px(30.0));
    w.attack_move_group(&b, px(22.0), px(30.0));
    let both: Vec<Id> = a.iter().chain(&b).copied().collect();
    let (t, s) = tremble(&mut w, &both, 12.0);
    out.push(("two armies meet", t, s));
    out
}

/// Workers on a base's fields: harvesters in a crowd at the fields and the drop-off.
fn mining(seed: u32) -> (f64, f64) {
    let mut w = rich(seed);
    let hq = core(&w, PLAYER);
    let fields = home_fields(&w);
    let mut ids = harvesters(&w, PLAYER);
    for k in 0..12 {
        let id = w.make_unit(
            UnitKind::Harvester,
            PLAYER,
            px(hq.0 as f64) + (k % 4) as f64 * 20.0,
            px(hq.1 as f64 + 3.0),
        );
        ids.push(id);
    }
    for (i, &id) in ids.iter().enumerate() {
        w.start_gather(id, fields[i % fields.len()]);
    }
    run(&mut w, 10);
    tremble(&mut w, &ids, 20.0)
}

#[test]
#[ignore]
fn jitter_probe() {
    // A measure, not a test: `cargo test --release --test gameplay jitter_probe -- --ignored --nocapture`.
    for seed in [3, 17, 29] {
        for (name, t, s) in scenes(seed) {
            println!(
                "seed {seed:>2}  {name:<42} worst flickers/s {t:>5.2}  worst reversals/s {s:>5.2}"
            );
        }
        let (t, s) = mining(seed);
        println!(
            "seed {seed:>2}  {:<42} worst flickers/s {t:>5.2}  worst reversals/s {s:>5.2}",
            "16 workers mining"
        );
    }
}

/// Two-second windows of four games on generated maps, a Hard Vael AI against an idle Human player (whose four
/// starting workers mine; each game ends when the Vael raze it, in four to five minutes), in which a unit turned and
/// stepped back 8 times or more in all: (turns, reversals, its kind, whether it is a worker, a line on it).
fn trembling_in_real_games() -> Vec<(usize, usize, bool, String)> {
    let mut worst = Vec::new();
    for (seed, kind) in [
        (3, MapKind::Standard),
        (8, MapKind::Labyrinth),
        (17, MapKind::Standard),
        (29, MapKind::OpenPlains),
    ] {
        let mut w = World::with_size(seed, 2, kind, MapSize::DUEL, 0, &[&HUMANS, &VAEL]);
        let win = 2 * TPS;
        // per unit: last x, y, facing, last real step, turns and reversals this window
        type Track = (f64, f64, i32, Option<(f64, f64)>, usize, usize);
        let mut prev: std::collections::BTreeMap<Id, Track> = Default::default();
        for t in 0..(12 * 60 * TPS) {
            w.step();
            if w.winner >= 0 {
                break;
            }
            for u in &w.units {
                let e = prev
                    .entry(u.id)
                    .or_insert((u.x, u.y, facing16(u.face), None, 0, 0));
                let f = facing16(u.face);
                e.4 += (e.2 != f) as usize;
                let (dx, dy) = (u.x - e.0, u.y - e.1);
                if dx * dx + dy * dy > 0.0625 {
                    if let Some((px, py)) = e.3
                        && px * dx + py * dy < 0.0
                    {
                        e.5 += 1;
                    }
                    e.3 = Some((dx, dy));
                }
                (e.0, e.1, e.2) = (u.x, u.y, f);
            }
            if (t + 1) % win == 0 {
                for u in &w.units {
                    let Some(e) = prev.get_mut(&u.id) else {
                        continue;
                    };
                    if e.4 + e.5 >= 8 {
                        let (tx, ty) = w.map.tile_of(u.x, u.y);
                        worst.push((
                            e.4,
                            e.5,
                            u.kind.def().worker,
                            format!(
                                "seed {seed} {:>5.1}s {:?} team {} task {:?} at tile ({tx},{ty})",
                                t as f64 / TPS as f64,
                                u.kind,
                                u.team,
                                u.task
                            ),
                        ));
                    }
                    e.4 = 0;
                    e.5 = 0;
                }
            }
        }
    }
    worst.sort_by_key(|a| std::cmp::Reverse(a.0 + a.1));
    worst
}

#[test]
fn workers_in_real_games_do_not_tremble() {
    // Four games of a Vael AI against an idle Human player: two-second windows in which a worker turned and stepped
    // back 8 times or more. Before gathering workers passed through each other and settled at their work: 288 (275 of
    // them Lumens queueing, mining or setting off at a field); after: a handful. (With both seats played by the AI,
    // a slower measure: 2869 before, 364 after.) 12 on the maps whose shafts lay by fields, 17 since they keep 10 tiles
    // off every crystal: the games play otherwise once the shafts are in use, and their Lumens queue at their main's
    // field a few times more. That is queueing, not a stutter (measured for #245): the worst unit is the same before and
    // after, 10 changes in its worst window (8 turns, 2 reversals), and no unit shows in more than 2 windows; the new
    // windows are Lumens walking round their clump to a free crystal.
    let workers: Vec<_> = trembling_in_real_games()
        .into_iter()
        .filter(|w| w.2)
        .collect();
    assert!(
        workers.len() <= 18,
        "{} trembling worker windows; the worst: {:?}",
        workers.len(),
        workers.iter().take(5).map(|w| &w.3).collect::<Vec<_>>()
    );
}

/// The worst trembling in real games, printed with what each unit was doing.
#[test]
#[ignore]
fn jitter_in_real_games() {
    // `cargo test --release --test gameplay jitter_in_real_games -- --ignored --nocapture`
    let worst = trembling_in_real_games();
    println!(
        "windows of 2 s with 8+ facing changes plus reversals: {}",
        worst.len()
    );
    for (t, r, _, s) in worst.iter().take(25) {
        println!("turns {t:>2} reversals {r:>2}  {s}");
    }
}

/// `n` workers of the player, all sent to mine the same crystal of the home field.
fn crowded_field(mut w: World, n: usize) -> (World, Vec<Id>) {
    let field = home_fields(&w)[0];
    let worker = w.factions[PLAYER as usize].worker;
    let (cx, cy) = core(&w, PLAYER);
    let mut ids = harvesters(&w, PLAYER);
    while ids.len() < n {
        let k = ids.len() as f64;
        ids.push(w.make_unit(
            worker,
            PLAYER,
            px(cx as f64 + 2.0) + k * 6.0,
            px(cy as f64 + 5.0),
        ));
    }
    for &id in &ids {
        w.start_gather(id, field);
    }
    (w, ids)
}

#[test]
fn workers_at_a_crowded_field_do_not_tremble() {
    // Twelve workers of either race sent to one crystal: they spread over the field and queue for free crystals
    // (one miner a crystal) as before, but none trembles: a worker waiting its turn, mining or turning in its load
    // does not flick its facing back and forth or shuffle on the spot. (Before: the worst worker flicked 0.05-0.1
    // times a second and stepped back about once a second, pushed in and out of reach by the miner beside it; now
    // 0 and 0.5, the steps back being its trips home.)
    for seed in [3, 17, 29] {
        for (race, w) in [("Harbour", rich(seed)), ("Vael", rich_vael(seed))] {
            let (mut w, ids) = crowded_field(w, 12);
            run(&mut w, 10);
            let (flick, rev) = tremble(&mut w, &ids, 20.0);
            assert!(
                flick <= 0.05 && rev <= 0.7,
                "seed {seed}, {race}: the worst worker flickers {flick:.2}/s and steps back {rev:.2}/s"
            );
        }
    }
}

/// What gathering without jostling does to the economy and to balance: Humans against Vael, AI on both sides
/// (Medium and Hard, ten seeds, both starts): each race's income by 5:00 and 10:00 and the games won by 25:00.
#[test]
#[ignore]
fn gathering_balance_probe() {
    // `cargo test --release --test gameplay gathering_balance_probe -- --ignored --nocapture`
    for diff in [1usize, 2] {
        let (mut inc5, mut inc10, mut wins, mut games) = ([0i64; 2], [0i64; 2], [0u32; 2], 0);
        for seed in 1..=10u32 {
            for flip in [false, true] {
                let races: [&Faction; 2] = if flip {
                    [&VAEL, &HUMANS]
                } else {
                    [&HUMANS, &VAEL]
                };
                let vael_seat = if flip { 0 } else { 1 };
                let mut w = World::with_setup(seed, diff, MapKind::Standard, false, races);
                w.set_ai_seats([true, true]);
                let mut got = [0i64; 2];
                let mut last = [w.res[0], w.res[1]];
                while w.time < 25.0 * 60.0 && w.winner < 0 {
                    w.step();
                    w.events.clear();
                    for s in 0..2 {
                        for (now, before) in w.res[s].iter().zip(last[s]) {
                            got[s] += (now - before).max(0) as i64;
                        }
                        last[s] = w.res[s];
                    }
                    let race = |s: usize| if s == vael_seat { 1 } else { 0 };
                    if (w.time - 300.0).abs() < 0.017 {
                        for s in 0..2 {
                            inc5[race(s)] += got[s];
                        }
                    }
                    if (w.time - 600.0).abs() < 0.017 {
                        for s in 0..2 {
                            inc10[race(s)] += got[s];
                        }
                    }
                }
                games += 1;
                if w.winner >= 0 {
                    wins[if w.winner as usize == vael_seat { 1 } else { 0 }] += 1;
                }
            }
        }
        let g = games as i64;
        println!(
            "level {diff}: income by 5:00 Humans {} Vael {}; by 10:00 Humans {} Vael {}; wins Humans {} Vael {} of {games}",
            inc5[0] / g,
            inc5[1] / g,
            inc10[0] / g,
            inc10[1] / g,
            wins[0],
            wins[1]
        );
    }
}
