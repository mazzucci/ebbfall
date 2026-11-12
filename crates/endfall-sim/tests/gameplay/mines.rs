//! Gold mines: one per field on every map, holding the field's gold; workers go inside (hidden, out of reach), come
//! out with a load, up to the mine's cap at once while the rest wait at its side; a crowd never jams; an empty mine
//! takes nobody in; a saturated mine pays what the economy pass set; the AI gathers from mines and expands to them.

use super::common::*;
use endfall_sim::world::Command;

/// Gold in one crystal of a field before the mines (map.rs `add_shard`, `CRYSTAL_GOLD`), times the map kind's share.
fn crystal(kind: MapKind) -> i32 {
    match kind {
        MapKind::DeepFields => CRYSTAL_GOLD * 10,
        MapKind::Barren => CRYSTAL_GOLD * 2 / 5,
        _ => CRYSTAL_GOLD,
    }
}

/// Seat `seat`'s mines within `r` tiles (square) of its headquarters' middle.
fn mines_by(w: &World, seat: u8, r: i32) -> Vec<Id> {
    let (cx, cy) = core(w, seat);
    w.map
        .nodes
        .iter()
        .filter(|n| (n.tx - cx - 1).abs().max((n.ty - cy - 1).abs()) <= r)
        .map(|n| n.id)
        .collect()
}

fn inside_of(w: &World, node: Id) -> usize {
    w.units
        .iter()
        .filter(|u| u.inside() && matches!(u.task, Task::Gather { node: n, .. } if n == node))
        .count()
}

#[test]
fn every_map_has_one_mine_per_field_holding_the_fields_gold() {
    let seeds: u32 = if cfg!(debug_assertions) { 3 } else { 20 };
    for n in [64, 96, 128] {
        for kind in MapKind::ALL {
            if kind == MapKind::Shore && n != 64 {
                continue; // (a Shore with more starts is Standard ground: maps.rs)
            }
            for seed in 0..seeds {
                let seats = endfall_sim::map::max_starts(MapSize::square(n));
                let w = World::with_size(
                    seed * 5 + 1,
                    1,
                    kind,
                    MapSize::square(n),
                    0,
                    &vec![&HUMANS; seats],
                );
                let ctx = format!("{n}x{n} {kind:?} seed {}", seed * 5 + 1);
                let mut fields: Vec<u32> = w.map.nodes.iter().map(|m| m.field).collect();
                fields.sort_unstable();
                fields.dedup();
                assert_eq!(fields.len(), w.map.nodes.len(), "{ctx}: one mine per field");
                for m in &w.map.nodes {
                    assert!(
                        !m.ether && m.s == MINE_SIZE,
                        "{ctx}: mine {} is a {}x{} mine",
                        m.id,
                        m.s,
                        m.s
                    );
                    assert_eq!(
                        m.amount, m.total,
                        "{ctx}: mine {} untouched holds what it held",
                        m.id
                    );
                    // (a field's crystals, all of them: seven by a main, five at an expansion, up to three in the center)
                    let k = m.total / crystal(kind);
                    assert!(
                        m.total % crystal(kind) == 0 && (1..=7).contains(&k),
                        "{ctx}: mine {} holds {} (a whole field's)",
                        m.id,
                        m.total
                    );
                }
                for seat in 0..seats as u8 {
                    let home = mines_by(&w, seat, 10);
                    assert_eq!(home.len(), 1, "{ctx}: seat {seat}'s one home mine");
                    let m = w.map.node(home[0]).unwrap();
                    assert_eq!(
                        m.total,
                        7 * crystal(kind),
                        "{ctx}: seat {seat}'s home mine holds its seven crystals"
                    );
                }
                check_invariants(&w, &ctx);
            }
        }
    }
}

#[test]
fn a_worker_inside_a_mine_is_hidden_out_of_reach_and_comes_out_with_a_load() {
    let mut w = World::new(5, 1);
    w.disable_ai();
    let h = harvesters(&w, PLAYER)[0];
    let node = gather_node(&w, h).unwrap();
    let mut went_in = false;
    for _ in 0..30 * TPS {
        w.step();
        if w.unit(h).unwrap().inside() {
            went_in = true;
            break;
        }
    }
    assert!(went_in, "the worker goes into its mine");
    assert_eq!(
        w.map.node(node).unwrap().miners as usize,
        inside_of(&w, node)
    );
    // An enemy right beside it: it neither sees nor reaches it, and nothing hurts it.
    let (x, y) = (w.unit(h).unwrap().x, w.unit(h).unwrap().y);
    let foe = w.make_unit(UnitKind::Trooper, ENEMY, x + 20.0, y);
    w.hold_unit(foe);
    w.step();
    assert!(w.unit(h).unwrap().inside(), "still inside");
    assert!(w.geo(h).is_none(), "no shape to aim at");
    assert!(!w.seen_by(ENEMY, h), "out of the enemy's sight");
    assert!(w.seen_by(PLAYER, h), "its own side knows where it is");
    assert!(!w.can_hit(foe, h));
    let hits = (true, false); // (a Guard hits the ground)
    let others: Vec<Id> = w
        .units
        .iter()
        .filter(|u| u.team == PLAYER && u.id != h)
        .map(|u| u.id)
        .collect();
    for &o in &others {
        w.stop_unit(o); // (the others out of its way: only `h` could be a target)
        w.units.retain(|u| u.id != o);
    }
    assert_eq!(
        w.find_target(x + 20.0, y, ENEMY, 400.0, None, true, hits, false),
        None,
        "nothing to pick up there"
    );
    w.attack_ent(foe, h);
    assert!(
        target_of(&w, foe).is_none(),
        "an attack order on it is refused"
    );
    let hp = w.unit(h).unwrap().hp;
    w.damage(h, 1e9, Some(foe));
    assert_eq!(w.unit(h).unwrap().hp, hp, "a blow does not reach it");
    w.damage(foe, 1e9, None);
    // Out again, with a load, carrying it home.
    let mut out = false;
    for _ in 0..10 * TPS {
        w.step();
        let u = w.unit(h).unwrap();
        if !u.inside() {
            assert_eq!(u.carry, MINE_LOAD, "out with a full load");
            assert!(
                matches!(
                    u.task,
                    Task::Gather {
                        phase: Phase::Return,
                        ..
                    }
                ),
                "{:?}",
                u.task
            );
            assert!(w.geo(h).is_some(), "back in the world");
            out = true;
            break;
        }
    }
    assert!(out, "it comes out within its time inside");
}

#[test]
fn a_mine_takes_in_up_to_its_cap_and_the_rest_wait_at_its_side() {
    let mut w = World::new(9, 1);
    w.disable_ai();
    let mine = mines_by(&w, PLAYER, 10)[0];
    let at = {
        let u = w.unit(harvesters(&w, PLAYER)[0]).unwrap();
        (u.x, u.y)
    };
    for _ in 0..MINE_CAP as usize + 5 - 4 {
        let u = w.make_unit(UnitKind::Harvester, PLAYER, at.0, at.1);
        w.start_gather(u, mine);
    }
    w.recalc_supply(PLAYER);
    let (mut most, mut waited) = (0, false);
    for t in 0..90 * TPS {
        w.step();
        let inside = inside_of(&w, mine);
        assert!(
            inside <= MINE_CAP as usize,
            "{inside} inside a mine for {MINE_CAP}"
        );
        most = most.max(inside);
        waited |= w.units.iter().any(|u| {
            matches!(
                u.task,
                Task::Gather {
                    phase: Phase::Wait,
                    ..
                }
            )
        });
        if t % TPS == 0 {
            check_invariants(&w, &format!("tick {t}"));
        }
    }
    assert_eq!(most, MINE_CAP as usize, "it fills up");
    assert!(waited, "the rest wait at its side");
}

#[test]
fn a_crowd_at_a_mine_never_jams() {
    // Thirty workers, far more than the mine takes or the walk needs, on one mine for five minutes: every one of them
    // keeps going in and delivering (they pass through each other at the mine's side; nobody stands stuck there).
    for seed in [3, 9] {
        let mut w = World::new(seed, 1);
        w.disable_ai();
        let mine = mines_by(&w, PLAYER, 10)[0];
        let at = {
            let u = w.unit(harvesters(&w, PLAYER)[0]).unwrap();
            (u.x, u.y)
        };
        for k in 0..26 {
            let u = w.make_unit(
                UnitKind::Harvester,
                PLAYER,
                at.0 + (k % 5) as f64 * 6.0,
                at.1 + (k / 5) as f64 * 6.0,
            );
            w.start_gather(u, mine);
        }
        w.recalc_supply(PLAYER);
        let hs = harvesters(&w, PLAYER);
        let mut carried: Vec<i32> = hs.iter().map(|&h| w.unit(h).unwrap().carry).collect();
        let mut trips = vec![0; hs.len()];
        for t in 0..300 * TPS {
            w.step();
            for (i, &h) in hs.iter().enumerate() {
                let c = w.unit(h).unwrap().carry;
                if carried[i] > 0 && c == 0 {
                    trips[i] += 1;
                }
                carried[i] = c;
            }
            if t % (5 * TPS) == 0 {
                check_invariants(&w, &format!("seed {seed} tick {t}"));
            }
        }
        let least = *trips.iter().min().unwrap();
        // (thirty sharing seven places at about four gold a second each: some sixteen trips apiece)
        assert!(
            least >= 6,
            "seed {seed}: every worker keeps delivering: {trips:?}"
        );
        assert!(
            hs.iter().all(|&h| gather_node(&w, h) == Some(mine)),
            "seed {seed}: all still at their mine"
        );
    }
}

#[test]
fn an_empty_mine_takes_nobody_in() {
    let mut w = World::new(7, 1);
    w.disable_ai();
    let mine = mines_by(&w, PLAYER, 10)[0];
    w.map.node_mut(mine).unwrap().amount = 0;
    let hs = harvesters(&w, PLAYER);
    for &h in &hs {
        w.start_gather(h, mine); // (ordered there again, as a player might)
    }
    for _ in 0..30 * TPS {
        w.step();
        assert_eq!(inside_of(&w, mine), 0, "nobody goes into an empty mine");
        assert_eq!(w.map.node(mine).unwrap().miners, 0);
    }
    let m = w
        .map
        .node(mine)
        .expect("an empty mine stays where it stands");
    assert_eq!(
        w.map.occ[w.map.idx(m.tx, m.ty)],
        -(mine as i32),
        "and still takes its ground"
    );
    // They went to the nearest mine with gold within reach, as from a field mined out, or stand idle.
    for &h in &hs {
        let u = w.unit(h).unwrap();
        match u.task {
            Task::Gather { node, .. } => {
                assert_ne!(node, mine);
                assert!(w.map.node(node).unwrap().amount > 0);
            }
            Task::Idle => {}
            t => panic!("worker {h}: {t:?}"),
        }
    }
}

/// Gold a minute (delivered, from 1:00 to 4:00) that `n` Villagers bring in from the player's home mine on `seed`'s
/// Standard map, the AI off.
fn home_income(seed: u32, n: usize) -> i64 {
    let mut w = World::new(seed, 1);
    w.disable_ai();
    let at = {
        let u = w.unit(harvesters(&w, PLAYER)[0]).unwrap();
        (u.x, u.y)
    };
    w.units.retain(|u| u.team != PLAYER);
    let mine = home_fields(&w)[0];
    for _ in 0..n {
        let u = w.make_unit(UnitKind::Harvester, PLAYER, at.0, at.1);
        assert!(w.start_gather(u, mine));
    }
    w.recalc_supply(PLAYER);
    run(&mut w, 60);
    let m0 = w.ledger[0].mined[0];
    run(&mut w, 180);
    (w.ledger[0].mined[0] - m0) / 3
}

/// One saturated mine pays what the economy pass set: a load of 8 where it was 16, so half what a saturated field
/// paid before the mines (measured on main, 811bd13: seven crystals, one worker on each at a time, 8 gold in 2 s; 1674,
/// 1672 and 1674 gold a minute, which a load of 16 matched), with the same harness: 24 workers on the home mine, gold a
/// minute from 1:00 to 4:00.
#[test]
fn a_saturated_mine_pays_what_the_economy_pass_set() {
    assert_eq!(MINE_LOAD, 8);
    for (seed, field) in [(1u32, 1674i64), (2, 1672), (4, 1674)] {
        let field = field * MINE_LOAD as i64 / 16;
        let full = home_income(seed, 24);
        assert!(
            (full - field).abs() as f64 <= 0.03 * field as f64,
            "seed {seed}: a saturated mine {full} a minute, the field {field}"
        );
        // Saturated: more workers add nothing.
        let more = home_income(seed, 30);
        assert!(
            (more - full).abs() as f64 <= 0.03 * full as f64,
            "seed {seed}: {full} with 24, {more} with 30"
        );
    }
}

#[test]
fn every_ai_gathers_from_mines_and_expands_to_them() {
    // Each people's AI at every level against a seat that does nothing (its Castle unbreakable): its workers go into
    // its mines, and by 11:00 it has a second base whose mine its workers work.
    for diff in 0..4 {
        for race in [&HUMANS, &VAEL] {
            let mut w = World::with_setup(
                3 + diff as u32,
                diff,
                MapKind::Standard,
                false,
                [&HUMANS, race],
            );
            let c = w
                .bldgs
                .iter_mut()
                .find(|b| b.team == PLAYER && b.kind.def().hq)
                .unwrap();
            (c.hp, c.maxhp) = (1e9, 1e9);
            let ctx = format!("level {diff} {}", race.name);
            let mut inside = false;
            for t in 0..660 * TPS {
                w.step();
                if t % TPS == 0 {
                    inside |= w.units.iter().any(|u| u.team == ENEMY && u.inside());
                }
            }
            assert!(inside, "{ctx}: its workers go into mines");
            let cores: Vec<(f64, f64)> = w
                .bldgs
                .iter()
                .filter(|b| b.team == ENEMY && b.kind.def().hq && b.done)
                .map(|b| (b.x, b.y))
                .collect();
            assert!(cores.len() >= 2, "{ctx}: a second base by 11:00");
            let by_exp = |n: Id| {
                let m = w.map.node(n).unwrap();
                cores[1..]
                    .iter()
                    .any(|c| ((m.x - c.0).powi(2) + (m.y - c.1).powi(2)).sqrt() < 300.0)
            };
            let working = w
                .units
                .iter()
                .filter(|u| {
                    u.team == ENEMY && matches!(u.task, Task::Gather { node, .. } if by_exp(node))
                })
                .count();
            assert!(
                working >= 3,
                "{ctx}: workers at an expansion's mine: {working}"
            );
        }
    }
}

/// Seat 1's Medium AI at 1:40 (its last base long enough ago, before a passive foe's 3:00 would call one) given a
/// second Castle by its natural's mine (finished, or a site just laid), ten workers and gold in hand; `dry`: the
/// bases (main, natural) whose mines are emptied by hand then. How many headquarters (sites too) it has 20 s later.
fn bases_by(second_done: bool, dry: &[bool; 2]) -> usize {
    let mut w = World::new(5, 1);
    w.set_ai_seats([false, true]);
    w.hold_waves = true;
    run(&mut w, 100);
    let (cx, cy) = core(&w, ENEMY);
    let at = |w: &World, n: Id| {
        let m = w.map.node(n).unwrap();
        (m.x / TILE - cx as f64 - 2.0).hypot(m.y / TILE - cy as f64 - 2.0)
    };
    let mut mines: Vec<Id> = w.map.nodes.iter().map(|n| n.id).collect();
    mines.sort_by(|&a, &b| at(&w, a).partial_cmp(&at(&w, b)).unwrap());
    let n = w.map.node(mines[1]).unwrap(); // (the natural's)
    let (nx, ny) = (n.tx, n.ty);
    let spot = (4..10)
        .flat_map(|r| (0..16).map(move |k| (r, k)))
        .map(|(r, k)| {
            let a = k as f64 / 16.0 * std::f64::consts::TAU;
            (
                nx + (a.cos() * r as f64) as i32 - 2,
                ny + (a.sin() * r as f64) as i32 - 2,
            )
        })
        .find(|&(x, y)| w.can_place(BldgKind::Core, x, y, ENEMY))
        .expect("room for a Castle by the natural");
    w.make_building(BldgKind::Core, ENEMY, spot.0, spot.1, second_done);
    // (a base's mines: those within 12 tiles of its Castle, as the AI counts them)
    for ((x, y), &empty) in [
        ((cx + 2) as f64, (cy + 2) as f64),
        (spot.0 as f64 + 2.0, spot.1 as f64 + 2.0),
    ]
    .into_iter()
    .zip(dry)
    {
        for m in w.map.nodes.iter_mut() {
            if empty && (m.x / TILE - x).abs().max((m.y / TILE - y).abs()) <= 12.0 {
                m.amount = 0;
            }
        }
    }
    for k in 0..6 {
        w.make_unit(
            UnitKind::Harvester,
            ENEMY,
            (cx as f64 + 2.0) * TILE + k as f64 * 10.0,
            (cy as f64 + 5.0) * TILE,
        );
    }
    w.recalc_supply(ENEMY);
    w.res[ENEMY as usize] = [20_000, 0];
    run(&mut w, 20);
    if !second_done {
        assert!(
            w.bldgs
                .iter()
                .any(|b| b.team == ENEMY && b.kind.def().hq && !b.done),
            "the site still going up"
        );
    }
    w.bldgs
        .iter()
        .filter(|b| b.team == ENEMY && b.kind.def().hq)
        .count()
}

#[test]
fn an_ai_whose_every_base_is_dry_takes_another() {
    assert_eq!(
        bases_by(true, &[false, false]),
        2,
        "gold at its bases: two are enough"
    );
    assert_eq!(
        bases_by(true, &[true, false]),
        2,
        "its natural still full: two are enough"
    );
    assert!(
        bases_by(true, &[true, true]) >= 3,
        "both bases' mines empty: a third base"
    );
    // (a dry main and a natural still going up: the site counts as a base, its mine full)
    assert_eq!(
        bases_by(false, &[true, false]),
        2,
        "its natural a site: no third before it stands"
    );
}

#[test]
fn a_healer_does_not_tend_a_worker_inside_a_mine() {
    // (the healers are trained nowhere since the re-theme; their rule stays, and a worker inside is out of its reach)
    let mut w = World::new(5, 1);
    w.disable_ai();
    let h = harvesters(&w, PLAYER)[0];
    for _ in 0..30 * TPS {
        w.step();
        if w.unit(h).unwrap().inside() {
            break;
        }
    }
    assert!(w.unit(h).unwrap().inside());
    let (x, y) = (w.unit(h).unwrap().x, w.unit(h).unwrap().y);
    set_hp(&mut w, h, 10.0);
    let medic = w.make_unit(UnitKind::Medic, PLAYER, x + 16.0, y);
    w.hold_unit(medic);
    w.recalc_supply(PLAYER);
    for _ in 0..TPS {
        w.step();
    }
    let u = w.unit(h).unwrap();
    assert!(u.inside(), "still inside");
    assert_eq!(u.hp, 10.0, "not healed while inside");
}

/// Every start's mines alike, square for square and gold for gold: every mine's image under the map's symmetry (the
/// half turn with two starts, the quarter turn with four, and with eight the quarter turn and the mirror top to
/// bottom) is a mine holding the same gold, and every start sees the same mines at the same distances. The seeds after
/// the range are those where the mines once differed (128x128: a cut-short field's mine holding less, a center field's
/// mine off its own axis).
#[test]
fn every_map_is_symmetric_mine_for_mine() {
    use endfall_sim::map::{Map, max_starts};
    let seeds: u32 = if cfg!(debug_assertions) { 4 } else { 60 };
    let known = [
        (MapKind::Standard, 1907),
        (MapKind::Standard, 1592),
        (MapKind::Standard, 1116),
        (MapKind::Labyrinth, 199),
        (MapKind::Barren, 1312),
        (MapKind::Barren, 1529),
        (MapKind::Barren, 1998),
        (MapKind::Barren, 2075),
    ];
    for n in [64, 96, 128] {
        let size = MapSize::square(n);
        let k = max_starts(size);
        let cases: Vec<(MapKind, u32)> = MapKind::ALL
            .iter()
            .filter(|&&kind| kind != MapKind::Shore || n == 64)
            .flat_map(|&kind| (0..seeds).map(move |s| (kind, s * 7 + 3)))
            .chain(known.iter().copied().filter(|_| n == 128))
            .collect();
        for (kind, seed) in cases {
            let m = Map::generate(seed, kind, size, k, &mut 1);
            let ctx = format!("{n}x{n} {kind:?} seed {seed}");
            let (w, h) = (m.w, m.h);
            let turn = |x: i32, y: i32, s: i32| (w - y - s, x);
            let flip = |x: i32, y: i32, s: i32| (x, h - s - y);
            let half = |x: i32, y: i32, s: i32| (w - s - x, h - s - y);
            for a in &m.nodes {
                let images = match k {
                    2 => vec![half(a.tx, a.ty, a.s)],
                    4 => vec![turn(a.tx, a.ty, a.s)],
                    _ => vec![turn(a.tx, a.ty, a.s), flip(a.tx, a.ty, a.s)],
                };
                for (ix, iy) in images {
                    let b = m.nodes.iter().find(|b| (b.tx, b.ty, b.s) == (ix, iy, a.s));
                    assert!(
                        b.is_some_and(|b| b.total == a.total),
                        "{ctx}: the mine at ({}, {}) holding {} has no image at ({ix}, {iy}) holding as much",
                        a.tx,
                        a.ty,
                        a.total
                    );
                }
            }
            let share = |b: &(i32, i32)| {
                let c = (b.0 as f64 + 1.5, b.1 as f64 + 1.5);
                let mut v: Vec<(i64, i32)> = m
                    .nodes
                    .iter()
                    .map(|q| {
                        let d = (q.tx as f64 + 0.5 - c.0).hypot(q.ty as f64 + 0.5 - c.1);
                        ((d * 10.0).round() as i64, q.total)
                    })
                    .collect();
                v.sort_unstable();
                v
            };
            let first = share(&m.bases[0]);
            for b in &m.bases {
                assert_eq!(
                    share(b),
                    first,
                    "{ctx}: the start at {b:?} sees other mines"
                );
            }
        }
    }
}

/// A worker inside its mine, stopped or sent off by its player's order (through `World::apply`, as the UI's are), comes
/// out at once and obeys: stopped, it stands; moved, it walks there; neither goes back to gathering.
#[test]
fn a_worker_ordered_while_inside_its_mine_comes_out_and_obeys() {
    for order in ["stop", "move"] {
        let mut w = World::new(5, 1);
        w.disable_ai();
        let h = harvesters(&w, PLAYER)[0];
        let node = gather_node(&w, h).unwrap();
        let mut went_in = false;
        for _ in 0..30 * TPS {
            w.step();
            if w.unit(h).unwrap().inside() {
                went_in = true;
                break;
            }
        }
        assert!(went_in, "{order}: the worker goes into its mine");
        let (cx, cy) = core(&w, PLAYER);
        let (mx, my) = ((cx as f64 + 1.5) * TILE, (cy as f64 + 6.5) * TILE);
        let cmd = match order {
            "stop" => Command::Stop { unit: h },
            _ => Command::Move {
                unit: h,
                x: mx,
                y: my,
            },
        };
        w.apply(PLAYER, &cmd).unwrap();
        let inside = inside_of(&w, node);
        let u = w.unit(h).unwrap();
        assert!(!u.inside(), "{order}: out of the mine at once");
        assert_eq!(w.map.node(node).unwrap().miners as usize, inside);
        for _ in 0..10 * TPS {
            w.step();
            let u = w.unit(h).unwrap();
            assert!(
                !matches!(u.task, Task::Gather { .. }) && !u.inside(),
                "{order}: never back to gathering: {:?}",
                u.task
            );
        }
        let u = w.unit(h).unwrap();
        match order {
            "stop" => assert!(matches!(u.task, Task::Idle), "{:?}", u.task),
            _ => assert!(
                (u.x - mx).hypot(u.y - my) < 2.0 * TILE,
                "it walked to where it was sent: ({}, {})",
                u.x,
                u.y
            ),
        }
    }
}
