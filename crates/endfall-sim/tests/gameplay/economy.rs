//! Economy: mining salt, fields running dry, the Market, the Recruiting post, supply.

use super::common::*;

#[test]
fn a_finished_market_pays_salt_with_no_workers_and_a_recruiting_post_nothing() {
    // The Kingdom's Market, built in its base, pays its owner half a salt a second, a whole salt every 2 s, with nobody
    // on it; it counts as mined. A site pays nothing, and the Expedition's Recruiting post never pays.
    let mut w = rich(9);
    for h in harvesters(&w, PLAYER) {
        w.stop_unit(h); // (nobody mines: what comes in is the Market's)
    }
    let (tx, ty) = spot(&w, BldgKind::Extractor);
    let site = w.make_building(BldgKind::Extractor, PLAYER, tx, ty, false);
    w.res[PLAYER as usize] = [0, 0];
    run(&mut w, 10);
    assert_eq!(w.res[PLAYER as usize][0], 0, "a site pays nothing");
    w.damage(site, 1e6, None);
    let market = w.make_building(BldgKind::Extractor, PLAYER, tx, ty, true);
    let mined = w.ledger[PLAYER as usize].mined[0];
    run(&mut w, 1);
    assert_eq!(w.res[PLAYER as usize][0], 0, "nothing in the first second");
    run(&mut w, 1);
    assert_eq!(w.res[PLAYER as usize][0], 1, "one salt after 2 s");
    run(&mut w, 58);
    assert_eq!(w.res[PLAYER as usize], [30, 0], "30 salt a minute");
    assert_eq!(
        w.ledger[PLAYER as usize].mined[0] - mined,
        30,
        "counted as mined"
    );
    assert!(
        w.units.iter().all(|u| u.team != PLAYER || u.carry == 0),
        "nobody carried any of it"
    );
    w.damage(market, 1e6, None);
    let have = w.res[PLAYER as usize][0];
    run(&mut w, 10);
    assert_eq!(w.res[PLAYER as usize][0], have, "no Market, no salt");
    // The Recruiting post: nothing, ever.
    let mut w = rich_vael(9);
    for h in harvesters(&w, PLAYER) {
        w.stop_unit(h);
    }
    let (tx, ty) = spot(&w, BldgKind::Siphon);
    w.make_building(BldgKind::Siphon, PLAYER, tx, ty, true);
    w.res[PLAYER as usize] = [0, 0];
    run(&mut w, 30);
    assert_eq!(
        w.res[PLAYER as usize][0], 0,
        "a Recruiting post pays nothing"
    );
    assert!(!BldgKind::Siphon.def().pays && BldgKind::Extractor.def().pays);
}

#[test]
fn one_market_a_castle_and_recruiting_posts_without_number_anywhere() {
    // The Market needs the Barracks and stands in the base, no shaft: one a finished Castle, sites counted (a second is
    // refused; a Castle at an expansion allows another). The Expedition's Recruiting post needs nothing and goes up
    // anywhere, as many as it likes. No map has a shaft.
    let mut w = rich(9);
    let h = harvesters(&w, PLAYER);
    let (tx, ty) = spot(&w, BldgKind::Extractor);
    assert_eq!(
        w.place_building(PLAYER, BldgKind::Extractor, tx, ty, Some(h[0])),
        Err("Requires Barracks".into())
    );
    let (cx, cy) = core(&w, PLAYER);
    w.make_building(BldgKind::Barracks, PLAYER, cx - 5, cy, true);
    w.place_building(PLAYER, BldgKind::Extractor, tx, ty, Some(h[0]))
        .unwrap();
    let (tx2, ty2) = spot(&w, BldgKind::Extractor);
    assert_eq!(
        w.place_building(PLAYER, BldgKind::Extractor, tx2, ty2, Some(h[1])),
        Err("One Market per Castle".into()),
        "a site counts"
    );
    let far = w.make_building(BldgKind::Core, PLAYER, 30, 30, false);
    assert!(
        !w.hq_room(PLAYER, BldgKind::Extractor),
        "a Castle still rising allows none"
    );
    w.bldgs.iter_mut().find(|b| b.id == far).unwrap().done = true;
    assert!(
        w.place_building(PLAYER, BldgKind::Extractor, tx2, ty2, Some(h[1]))
            .is_ok(),
        "a second Castle, a second Market"
    );
    let mut w = rich_vael(9);
    let l = harvesters(&w, PLAYER);
    for i in 0..4 {
        let (tx, ty) = spot(&w, BldgKind::Siphon);
        w.place_building(PLAYER, BldgKind::Siphon, tx, ty, Some(l[i % l.len()]))
            .unwrap_or_else(|e| panic!("post {i}: {e}"));
    }
    for seed in [1u32, 7, 4242] {
        for kind in [MapKind::Standard, MapKind::EtherStorm, MapKind::Shore] {
            let w = World::with_setup(seed, 1, kind, false, [&HUMANS, &VAEL]);
            assert!(
                w.map.nodes.iter().all(|n| !n.ether),
                "seed {seed} {kind:?}: no shaft"
            );
        }
    }
}

#[test]
fn an_ai_market_pays_at_its_levels_income() {
    // Brutal gathers 1.3 times as fast; its Markets pay 1.3 times as much too (39 salt a minute, not 30).
    let mut w = World::with_setup(9, 3, MapKind::Standard, false, [&HUMANS, &HUMANS]);
    assert!(w.set_ai_seats([false, true]));
    w.disable_ai();
    for h in harvesters(&w, ENEMY) {
        w.stop_unit(h);
    }
    let (cx, cy) = core(&w, ENEMY);
    let (vx, vy) = (cx - 4, cy - 4);
    assert!(w.can_place(BldgKind::Extractor, vx, vy, ENEMY));
    w.make_building(BldgKind::Extractor, ENEMY, vx, vy, true);
    w.res[ENEMY as usize] = [0, 0];
    run(&mut w, 60);
    assert_eq!(w.res[ENEMY as usize][0], 39);
}

#[test]
fn supply_blocks_training_and_depots_raise_the_cap() {
    let mut w = rich(11);
    let core_id = w
        .bldgs
        .iter()
        .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
        .unwrap()
        .id;
    let mut queued = 0;
    while w.queue_unit(core_id, UnitKind::Harvester).is_ok() {
        queued += 1;
    }
    assert_eq!(queued, 5, "queue holds five");
    let [used, cap] = w.sup[PLAYER as usize];
    assert_eq!((used, cap), (9, 20), "the Lighthouse's 20 population");
    w.cancel_queue(core_id, 4);
    w.cancel_queue(core_id, 3);
    let res_before = w.res[PLAYER as usize][0];
    w.cancel_queue(core_id, 0);
    assert_eq!(w.res[PLAYER as usize][0], res_before + 50, "cancel refunds");
    let h = harvesters(&w, PLAYER);
    build(&mut w, BldgKind::Depot, h[0], 90);
    assert_eq!(w.sup[PLAYER as usize][1], 28);
}

#[test]
fn the_supply_cap_grows_with_the_map() {
    // Roster v2: 60 on 64x64, 70 on 96x96, 80 on 128x128 (`World::supply_limit`). Supply buildings past the cap add
    // nothing, and a seat at the cap is supply blocked.
    for (n, cap, f) in [(64, 60, &HUMANS), (96, 70, &VAEL), (128, 80, &HUMANS)] {
        let mut w = World::with_size(7, 1, MapKind::Standard, MapSize::square(n), 0, &[f, f]);
        w.disable_ai();
        assert_eq!(w.supply_limit(), cap, "{n}x{n}");
        // Supply buildings round the headquarters (Cottages or Sunpetals), one past what reaches the cap.
        let each = f.supply.def().supply;
        let hq = f.hq.def().supply;
        let need = ((cap - hq) as f64 / each as f64).ceil() as i32;
        for _ in 0..need + 1 {
            let (tx, ty) = spot(&w, f.supply);
            w.make_building(f.supply, PLAYER, tx, ty, true);
        }
        w.recalc_supply(PLAYER);
        assert_eq!(w.sup[PLAYER as usize][1], cap, "{n}x{n}: capped at {cap}");
        // Filled to the cap: blocked, and told the limit (another population building would not help).
        w.sup[PLAYER as usize][0] = cap;
        let hq_id = w
            .bldgs
            .iter()
            .find(|b| b.team == PLAYER && b.kind.def().hq)
            .unwrap()
            .id;
        assert_eq!(
            w.queue_unit(hq_id, f.worker),
            Err(format!(
                "Population at its limit ({cap}): no more until some fall"
            )),
            "{n}x{n}"
        );
    }
    assert_eq!(
        [64, 96, 128].map(supply_limit),
        [60, 70, 80],
        "the table by map width"
    );
}

#[test]
fn a_full_core_reports_supply_blocked() {
    let mut w = rich(12);
    let core_id = w
        .bldgs
        .iter()
        .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
        .unwrap()
        .id;
    // (19 of the Lighthouse's 20 population used: four workers and fifteen more)
    let (x, y) = (
        w.bldg(core_id).unwrap().x,
        w.bldg(core_id).unwrap().y + 80.0,
    );
    for _ in 0..15 {
        w.make_unit(UnitKind::Harvester, PLAYER, x, y);
    }
    w.recalc_supply(PLAYER);
    assert_eq!(w.sup[PLAYER as usize], [19, 20]);
    w.queue_unit(core_id, UnitKind::Harvester)
        .expect("the twentieth fits");
    assert_eq!(
        w.queue_unit(core_id, UnitKind::Harvester),
        Err("Population full. Build a Cottage.".to_string())
    );
}

#[test]
fn builders_go_back_to_the_salt() {
    // The builder of an Excavator, as of anything else, goes back to the salt it was mining (nobody works a shaft).
    let mut w = rich(5);
    run(&mut w, 3);
    let h = harvesters(&w, PLAYER);
    let (tx, ty) = spot(&w, BldgKind::Barracks);
    w.make_building(BldgKind::Barracks, PLAYER, tx, ty, true); // (an Excavator needs the Crew Hall)
    build(&mut w, BldgKind::Extractor, h[0], 90);
    run(&mut w, 1);
    assert!(
        matches!(w.unit(h[0]).unwrap().task, Task::Gather { node, .. } if w.map.node(node).is_some_and(|n| !n.ether)),
        "a Pump's builder goes back to the salt: {:?}",
        w.unit(h[0]).unwrap().task
    );
    let h1 = h[1];
    let depot = build(&mut w, BldgKind::Depot, h1, 90);
    run(&mut w, 1);
    assert!(w.bldg(depot).is_some());
    assert!(
        matches!(w.unit(h1).unwrap().task, Task::Gather { node, .. } if w.map.node(node).is_some_and(|n| !n.ether)),
        "a Depot's builder goes back to the shards: {:?}",
        w.unit(h1).unwrap().task
    );
}

#[test]
fn busy_workers_only_hop_to_mines_no_farther_from_the_drop_off() {
    // Two mines left on open ground: one by a Core, the other 6 tiles farther out. Workers crowding the near one (more
    // than it takes in) wait rather than wander out to the far one; a mine as close to the Core takes them.
    for far in [true, false] {
        let mut w = flat_arena(16);
        let core_id = w.make_building(BldgKind::Core, PLAYER, 20, 30, true);
        let fields: Vec<Id> = w
            .map
            .nodes
            .iter()
            .filter(|n| !n.ether)
            .map(|n| n.id)
            .take(2)
            .collect();
        let gone: Vec<Id> = w
            .map
            .nodes
            .iter()
            .filter(|n| !fields.contains(&n.id))
            .map(|n| n.id)
            .collect();
        for &id in &gone {
            let n = w.map.node(id).unwrap();
            let (size, ox, oy) = (n.s, n.tx, n.ty);
            for y in 0..size {
                for x in 0..size {
                    let i = w.map.idx(ox + x, oy + y);
                    w.map.occ[i] = 0;
                }
            }
        }
        w.map.nodes.retain(|n| !gone.contains(&n.id));
        move_node(&mut w, fields[0], 26, 31);
        if far {
            move_node(&mut w, fields[1], 32, 31);
        } else {
            move_node(&mut w, fields[1], 24, 37);
        }
        let (x, y) = (w.bldg(core_id).unwrap().x, w.bldg(core_id).unwrap().y);
        let h: Vec<Id> = (0..MINE_CAP + 4)
            .map(|i| {
                w.make_unit(
                    UnitKind::Harvester,
                    PLAYER,
                    x + 80.0,
                    y - 30.0 + (i % 4) as f64 * 20.0,
                )
            })
            .collect();
        for &u in &h {
            assert!(w.start_gather(u, fields[0]));
        }
        run(&mut w, 30);
        let on_second = h
            .iter()
            .filter(|&&u| gather_node(&w, u) == Some(fields[1]))
            .count();
        if far {
            assert_eq!(on_second, 0, "nobody strays to the far mine");
        } else {
            assert!(on_second >= 1, "the equally near mine takes the overflow");
        }
    }
}

#[test]
fn a_mine_running_low_is_announced_once_with_a_ping() {
    use endfall_sim::world::{Event, MINE_LOW};
    let mut w = rich(5);
    // The player's home mine, cut to just above the mark: its workers mine it down through it.
    let mine = home_fields(&w)[0];
    w.map.node_mut(mine).unwrap().amount = MINE_LOW + 100;
    let (mut toasts, mut pings) = (0, 0);
    for _ in 0..30 * 120 {
        w.step();
        for e in w.events.drain(..) {
            match e {
                Event::Toast { team: 0, msg, .. } if msg.contains("gold mine is running low") => {
                    toasts += 1
                }
                Event::Ping { team: 0, .. } => pings += 1,
                _ => {}
            }
        }
    }
    let left = w.map.node(mine).unwrap().amount;
    assert!(left < MINE_LOW, "mined through the mark: {left}");
    assert_eq!(toasts, 1, "announced once for the mine");
    assert!(pings >= 1, "with a ping");
}

#[test]
fn a_worker_runs_from_an_armed_enemy_with_nobody_to_fight_it_and_goes_back_after() {
    let mut w = World::new(17, 1);
    w.disable_ai();
    run(&mut w, 12); // (the starting workers are at their field)
    let h = harvesters(&w, PLAYER)[0];
    let field = gather_node(&w, h).expect("mining");
    let (hx, hy) = (w.unit(h).unwrap().x, w.unit(h).unwrap().y);
    let raider = w.make_unit(UnitKind::Trooper, ENEMY, hx + 40.0, hy);
    w.hold_unit(raider);
    {
        let r = w.units.iter_mut().find(|u| u.id == raider).unwrap();
        r.hp = 1e6;
        r.maxhp = 1e6;
    }
    run(&mut w, 1);
    assert!(
        matches!(w.unit(h).unwrap().task, Task::Flee { .. }),
        "it runs: {:?}",
        w.unit(h).unwrap().task
    );
    run(&mut w, 4);
    let u = w.unit(h).unwrap();
    assert!(
        (u.x - (hx + 40.0)).hypot(u.y - hy) > 4.0 * TILE,
        "it got away from the raider"
    );
    // The raider leaves: after a quiet spell the worker is back at its field.
    w.damage(raider, 1e9, None);
    run(&mut w, 12);
    assert_eq!(
        gather_node(&w, h),
        Some(field),
        "back to its field: {:?}",
        w.unit(h).unwrap().task
    );
}

#[test]
fn a_worker_stays_when_a_fighter_of_its_own_is_near_or_it_was_told_to_build() {
    let mut w = World::new(17, 1);
    w.disable_ai();
    run(&mut w, 12);
    let hs = harvesters(&w, PLAYER);
    let (h, b) = (hs[0], hs[1]);
    let (hx, hy) = (w.unit(h).unwrap().x, w.unit(h).unwrap().y);
    let guard = w.make_unit(UnitKind::Trooper, PLAYER, hx - 30.0, hy);
    w.hold_unit(guard);
    let raider = w.make_unit(UnitKind::Trooper, ENEMY, hx + 40.0, hy);
    w.hold_unit(raider);
    for id in [guard, raider] {
        let r = w.units.iter_mut().find(|u| u.id == id).unwrap();
        r.hp = 1e6;
        r.maxhp = 1e6;
    }
    // A builder on its way to a site, past the raider: it keeps going.
    let site = w.make_building(
        BldgKind::Depot,
        PLAYER,
        (hx / TILE) as i32 + 4,
        (hy / TILE) as i32 + 3,
        false,
    );
    w.start_build(b, site);
    run(&mut w, 2);
    assert!(
        matches!(w.unit(h).unwrap().task, Task::Gather { .. }),
        "guarded: it keeps mining ({:?})",
        w.unit(h).unwrap().task
    );
    assert!(
        matches!(w.unit(b).unwrap().task, Task::Build { .. }),
        "told to build: it builds ({:?})",
        w.unit(b).unwrap().task
    );
}

#[test]
fn a_worker_does_not_go_back_while_a_raider_sits_on_its_field_and_a_fresh_order_holds() {
    let mut w = World::new(17, 1);
    w.disable_ai();
    run(&mut w, 12);
    let hs = harvesters(&w, PLAYER);
    let h = hs[0];
    let field = gather_node(&w, h).expect("mining");
    let (nx, ny) = {
        let n = w.map.node(field).unwrap();
        (n.x, n.y)
    };
    // A raider parks by the field (it cannot die, and holds there): an Archer, whose shot reaches the miners.
    let raider = w.make_unit(UnitKind::Lancer, ENEMY, nx + 3.0 * TILE, ny);
    w.hold_unit(raider);
    {
        let r = w.units.iter_mut().find(|u| u.id == raider).unwrap();
        r.hp = 1e6;
        r.maxhp = 1e6;
    }
    run(&mut w, 40);
    let u = w
        .unit(h)
        .expect("alive: it did not keep walking back into the raider");
    assert!(
        matches!(u.task, Task::Flee { .. }),
        "still away: {:?}",
        u.task
    );
    // Its player sends it back anyway: it goes, and stays a while.
    w.start_gather(h, field);
    let _ = w.apply(
        PLAYER,
        &endfall_sim::world::Command::Gather {
            unit: h,
            node: field,
        },
    );
    run(&mut w, 4);
    assert!(
        matches!(w.unit(h).map(|u| u.task), Some(Task::Gather { .. }) | None),
        "the order holds: {:?}",
        w.unit(h).map(|u| u.task)
    );
}

#[test]
fn an_idle_worker_away_from_its_field_stays_where_it_was_put() {
    let mut w = World::new(17, 1);
    w.disable_ai();
    run(&mut w, 12);
    let h = harvesters(&w, PLAYER)[0];
    // Sent far from its field, idle there (a lookout).
    w.move_to(h, 32.0 * TILE, 32.0 * TILE);
    run(&mut w, 40);
    assert_eq!(w.unit(h).unwrap().task, Task::Idle);
    let (x, y) = (w.unit(h).unwrap().x, w.unit(h).unwrap().y);
    let raider = w.make_unit(UnitKind::Trooper, ENEMY, x + 3.0 * TILE, y);
    w.hold_unit(raider);
    run(&mut w, 1);
    assert_eq!(w.unit(h).map(|u| u.task), Some(Task::Idle), "it stays put");
}

#[test]
fn the_ledger_accounts_for_every_shard_and_ether() {
    // The balance lab's ledger (`World::ledger`, read by no rule): in a game with no resources granted, what a seat
    // has is always what it started with, plus what it mined, less what it spent (refunds taken back off), every tick.
    // Two Hard AIs, Humans against Vael, ten minutes: they mine, build, train, research and cancel stalled sites.
    let mut w = World::with_size(5, 2, MapKind::Standard, MapSize::DUEL, 0, &[&HUMANS, &VAEL]);
    assert!(w.set_ai_seats([true, true]));
    let start: Vec<[i32; 2]> = w.res.clone();
    for tick in 0..(10 * 60 * TPS) {
        w.step();
        w.events.clear();
        for (s, have) in start.iter().enumerate() {
            let l = w.ledger[s];
            let want = [0, 1].map(|i| have[i] as i64 + l.mined[i] - l.spent[i]);
            assert_eq!(
                [w.res[s][0] as i64, w.res[s][1] as i64],
                want,
                "seat {s} at tick {tick}: {l:?}"
            );
        }
        if w.winner >= 0 {
            break;
        }
    }
    assert!(
        (0..2).all(|s| w.ledger[s].mined[0] > 0 && w.ledger[s].spent[0] > 0),
        "both mined and spent: {:?}",
        w.ledger
    );
}

/// Each start mines its home field as fast as the other, whichever half of the map it is in: the two starts of a
/// two-start map are each other's image under a half turn, fields and all, so the starting harvesters (no AI) must
/// mine the same. A free tile beside a crystal used to be the first in a fixed scan (the ring's top row first): every
/// harvester aimed at the north side of its crystal, the near side for a base south of its field, the far side for one
/// north of it, and the south half mined more (4% by minute 3, 65% of the Brutal mirrors won).
#[test]
fn either_half_mines_its_field_alike() {
    let mut checked = 0;
    for seed in 1..=12u32 {
        for kind in [MapKind::Standard, MapKind::OpenPlains] {
            let mut w = World::with_setup(seed, 1, kind, false, [&HUMANS, &HUMANS]);
            w.disable_ai();
            let (a, b) = (core(&w, 0), core(&w, 1));
            // (only starts that are each other's half-turn image, in different halves)
            if (b.0, b.1) != (w.map.w - 4 - a.0, w.map.h - 4 - a.1) || a.1 == b.1 {
                continue;
            }
            run(&mut w, 180);
            let mined = |t: usize| w.ledger[t].mined[0];
            let (m0, m1) = (mined(0), mined(1));
            assert!(
                m0 > 1000,
                "seed {seed} {kind:?}: the harvesters mine ({m0})"
            );
            // (a delivery or two apart at most: mirrored positions round differently in the last bits)
            assert!(
                (m0 - m1).abs() <= 20,
                "seed {seed} {kind:?}: the two halves mine alike: {m0} and {m1}"
            );
            checked += 1;
        }
    }
    assert!(checked >= 6, "enough mirrored starts checked ({checked})");
}
