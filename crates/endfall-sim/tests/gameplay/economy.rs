//! Economy: mining gold, mines running dry, the Market, the Recruiting post, supply.

use super::common::*;

#[test]
fn a_finished_market_pays_gold_with_no_workers_and_a_recruiting_post_nothing() {
    // The Kingdom's Market, built in its base, pays its owner 0.35 gold a second, a whole gold every 2.9 s or so, with
    // nobody on it (half a gold a second before the balance round that followed the economy pass); it counts as mined. A site pays nothing, and the Expedition's Recruiting post never pays.
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
    run(&mut w, 4);
    assert_eq!(w.res[PLAYER as usize][0], 0, "nothing in the first 4 s");
    run(&mut w, 1);
    assert_eq!(
        w.res[PLAYER as usize][0], 1,
        "one gold after 5 s (0.24 a second since Nov 13)"
    );
    run(&mut w, 55);
    assert_eq!(w.res[PLAYER as usize], [14, 0], "14 gold a minute");
    assert_eq!(
        w.ledger[PLAYER as usize].mined[0] - mined,
        14,
        "counted as mined"
    );
    assert!(
        w.units.iter().all(|u| u.team != PLAYER || u.carry == 0),
        "nobody carried any of it"
    );
    w.damage(market, 1e6, None);
    let have = w.res[PLAYER as usize][0];
    run(&mut w, 10);
    assert_eq!(w.res[PLAYER as usize][0], have, "no Market, no gold");
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
    assert!(BldgKind::Siphon.def().pays == 0.0 && BldgKind::Extractor.def().pays > 0.0);
}

#[test]
fn trade_raises_every_market_s_pay_by_level_researched_at_the_market() {
    // Trade (Stelian, Nov 14): the Kingdom's economic research at the Market, two levels with names of their own, the
    // Better drills' shape (150 then 175 gold, 60 then 75 s): its Markets pay a quarter more, then half more.
    assert!(
        BldgKind::Extractor
            .def()
            .researches
            .contains(&Upgrade::Trade)
    );
    assert_eq!(Upgrade::Trade.levels(), 2);
    assert_eq!(
        (Upgrade::Trade.cost(1), Upgrade::Trade.cost(2)),
        ([150, 0], [175, 0])
    );
    assert_eq!(
        (Upgrade::Trade.time(1), Upgrade::Trade.time(2)),
        (60.0, 75.0)
    );
    assert_eq!(Upgrade::Trade.level_name(1), "Expand trade routes");
    assert_eq!(Upgrade::Trade.level_name(2), "Raise commercial taxes");
    let minute = |level: u8| {
        let mut w = rich(9);
        for h in harvesters(&w, PLAYER) {
            w.stop_unit(h);
        }
        let (tx, ty) = spot(&w, BldgKind::Extractor);
        w.make_building(BldgKind::Extractor, PLAYER, tx, ty, true);
        w.upgrades[PLAYER as usize][Upgrade::Trade.index()] = level;
        w.res[PLAYER as usize] = [0, 0];
        run(&mut w, 60);
        w.res[PLAYER as usize][0]
    };
    let (none, routes, taxes) = (minute(0), minute(1), minute(2));
    assert_eq!(none, 14, "14 gold a minute untraded");
    assert_eq!(routes, 18, "a quarter more: 18");
    assert_eq!(taxes, 21, "half more: 21");
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
    // Brutal gathers 1.3 times as fast; its Markets pay 1.3 times as much too (18 gold a minute, not 14: 18.7, banked a
    // whole gold at a time).
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
    assert_eq!(w.res[ENEMY as usize][0], 18);
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
    let [used, cap] = w.sup(PLAYER);
    assert_eq!((used, cap), (9, 20), "the Lighthouse's 20 population");
    w.cancel_queue(core_id, 4);
    w.cancel_queue(core_id, 3);
    let res_before = w.res[PLAYER as usize][0];
    w.cancel_queue(core_id, 0);
    assert_eq!(w.res[PLAYER as usize][0], res_before + 50, "cancel refunds");
    let h = harvesters(&w, PLAYER);
    build(&mut w, BldgKind::Depot, h[0], 90);
    assert_eq!(w.sup(PLAYER)[1], 28);
}

#[test]
fn the_caps_are_fixed_population_120_and_grid_300() {
    // The same on every map since Nov 14 (PRD: the Expedition runs on energy; 100, 120 and 140 population by the map's
    // width before, and the Expedition's Power and hired places apart): the Kingdom's population `POP_MAX`, the
    // Expedition's grid `GRID_MAX`. Supply buildings past the cap add nothing, and a seat at the cap is supply blocked.
    assert_eq!((POP_MAX, GRID_MAX), (120, 300));
    for (n, cap, f) in [
        (64, 120, &HUMANS),
        (96, 300, &VAEL),
        (128, 120, &HUMANS),
        (128, 300, &VAEL),
    ] {
        let mut w = World::with_size(7, 1, MapKind::Standard, MapSize::square(n), 0, &[f, f]);
        w.disable_ai();
        assert_eq!(w.sup_max(PLAYER), cap, "{n}x{n}");
        // Supply buildings round the headquarters (Cottages or Sunpetals), one past what reaches the cap.
        let each = f.supply.def().supply;
        let hq = f.hq.def().supply;
        let need = ((cap - hq) as f64 / each as f64).ceil() as i32;
        for _ in 0..need + 1 {
            let (tx, ty) = spot(&w, f.supply);
            w.make_building(f.supply, PLAYER, tx, ty, true);
        }
        w.recalc_supply(PLAYER);
        assert_eq!(w.sup(PLAYER)[1], cap, "{n}x{n}: capped at {cap}");
        // Filled to the cap: blocked, and told the limit (another population building would not help).
        w.supply[PLAYER as usize][0] = cap;
        let hq_id = w
            .bldgs
            .iter()
            .find(|b| b.team == PLAYER && b.kind.def().hq)
            .unwrap()
            .id;
        // (the Expedition's grid)
        let told = if f.grid {
            "Grid at maximum.".to_string()
        } else {
            format!("Population at its limit ({cap}): no more until some fall")
        };
        assert_eq!(w.queue_unit(hq_id, f.worker), Err(told), "{n}x{n}");
    }
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
    assert_eq!(w.sup(PLAYER), [19, 20]);
    w.queue_unit(core_id, UnitKind::Harvester)
        .expect("the twentieth fits");
    assert_eq!(
        w.queue_unit(core_id, UnitKind::Harvester),
        Err("Population full. Build a Cottage.".to_string())
    );
}

#[test]
fn builders_wait_beside_what_they_built() {
    // Stelian, Nov 12: a builder stays idle beside the building it finished, a Market as anything else (nobody works a
    // Market), instead of going back to mining by itself; it mines again on an order.
    let mut w = rich(5);
    run(&mut w, 3);
    let h = harvesters(&w, PLAYER);
    let (tx, ty) = spot(&w, BldgKind::Barracks);
    w.make_building(BldgKind::Barracks, PLAYER, tx, ty, true); // (a Market needs the Barracks)
    let market = build(&mut w, BldgKind::Extractor, h[0], 90);
    let depot = build(&mut w, BldgKind::Depot, h[1], 90);
    run(&mut w, 5);
    for (u, b) in [(h[0], market), (h[1], depot)] {
        let (u, b) = (w.unit(u).unwrap(), w.bldg(b).unwrap());
        assert_eq!(u.task, Task::Idle, "{:?}'s builder waits", b.kind);
        assert!(
            ((u.x - b.x).abs() - b.w as f64 * 16.0).max((u.y - b.y).abs() - b.h as f64 * 16.0)
                < 2.0 * 32.0,
            "{:?}'s builder beside it",
            b.kind
        );
    }
    // On an order, back to the mine.
    let mine = home_fields(&w)[0];
    assert!(w.start_gather(h[0], mine));
    run(&mut w, 1);
    assert!(matches!(w.unit(h[0]).unwrap().task, Task::Gather { .. }));
}

#[test]
fn a_new_worker_waits_for_an_order_and_a_rally_on_a_mine_walks_it_there_to_wait() {
    // Stelian, Nov 12: a new Villager or Bot appears at its Castle or Data center and waits: no gathering by itself.
    // A rally point on a gold mine walks it to the mine, where it waits beside it without mining; mining starts only on
    // an order. The starting workers begin on the mine as ever.
    for f in [&HUMANS, &VAEL] {
        let mut w = World::with_setup(5, 1, MapKind::Standard, false, [f, f]);
        w.disable_ai();
        w.res[PLAYER as usize] = [1000, 0];
        assert!(
            harvesters(&w, PLAYER)
                .iter()
                .all(|&h| matches!(w.unit(h).unwrap().task, Task::Gather { .. })),
            "{}: the starting workers mine",
            f.name
        );
        let hq = w
            .bldgs
            .iter()
            .find(|b| b.team == PLAYER && b.kind.def().hq)
            .unwrap()
            .id;
        let before = harvesters(&w, PLAYER);
        assert_eq!(w.queue_unit(hq, f.worker), Ok(()));
        run(&mut w, f.worker.def().build as u32 + 1);
        let new: Vec<Id> = harvesters(&w, PLAYER)
            .into_iter()
            .filter(|h| !before.contains(h))
            .collect();
        assert_eq!(new.len(), 1);
        run(&mut w, 20);
        let u = w.unit(new[0]).unwrap();
        let b = w.bldg(hq).unwrap();
        assert_eq!(u.task, Task::Idle, "{}: the new worker waits", f.name);
        assert!(
            (u.x - b.x).hypot(u.y - b.y) < 4.0 * 32.0,
            "{}: at its headquarters",
            f.name
        );
        assert_eq!(u.carry, 0);
        // A rally on the home mine: the next walks there and waits beside it, outside, carrying nothing.
        let mine = home_fields(&w)[0];
        let (mx, my) = (w.map.node(mine).unwrap().x, w.map.node(mine).unwrap().y);
        w.set_rally(hq, mx, my, Some(mine));
        let before = harvesters(&w, PLAYER);
        assert_eq!(w.queue_unit(hq, f.worker), Ok(()));
        run(&mut w, f.worker.def().build as u32 + 1);
        let next = harvesters(&w, PLAYER)
            .into_iter()
            .find(|h| !before.contains(h))
            .unwrap();
        let mined = w.ledger[PLAYER as usize].mined[0];
        for _ in 0..30 * TPS {
            w.step();
            let u = w.unit(next).unwrap();
            assert!(!u.inside() && u.carry == 0, "{}: it never mines", f.name);
        }
        let u = w.unit(next).unwrap();
        assert_eq!(u.task, Task::Idle, "{}: waiting at the mine", f.name);
        assert!(
            (u.x - mx).hypot(u.y - my) < 3.0 * 32.0,
            "{}: beside the mine ({:.0} px)",
            f.name,
            (u.x - mx).hypot(u.y - my)
        );
        // (the starting crew mined on meanwhile)
        assert!(w.ledger[PLAYER as usize].mined[0] > mined);
        // An order sends it in.
        assert!(w.start_gather(next, mine));
        run(&mut w, 15);
        assert!(
            w.unit(next).unwrap().carry > 0
                || w.unit(next).unwrap().inside()
                || w.ledger[PLAYER as usize].mined[0] > mined
        );
    }
}

#[test]
fn the_ai_sends_its_new_workers_and_its_builders_to_the_mine() {
    // The AI orders its own workers (Stelian, Nov 12: no worker gathers by itself): each it trains goes to a mine within
    // its next turns, and so does each builder once its building stands, so its economy keeps its pace; an idle worker
    // of an AI never waits long.
    let mut w = World::with_setup(5, 1, MapKind::Standard, false, [&HUMANS, &VAEL]);
    assert!(w.set_ai_seats([true, true]));
    let mut idle_for: Vec<(Id, u32)> = Vec::new();
    let mut longest = 0;
    let mut trained = 0;
    let start: Vec<Id> = w.units.iter().map(|u| u.id).collect();
    while w.time < 360.0 {
        w.step();
        w.events.clear();
        let idle: Vec<Id> = w
            .units
            .iter()
            .filter(|u| u.kind.def().worker && u.task == Task::Idle)
            .map(|u| u.id)
            .collect();
        idle_for.retain(|e| idle.contains(&e.0));
        for id in idle {
            match idle_for.iter_mut().find(|e| e.0 == id) {
                Some(e) => {
                    e.1 += 1;
                    longest = longest.max(e.1);
                }
                None => idle_for.push((id, 1)),
            }
        }
        trained = w
            .units
            .iter()
            .filter(|u| u.kind.def().worker && !start.contains(&u.id))
            .count();
    }
    assert!(trained >= 8, "both AIs trained workers: {trained}");
    assert!(
        longest <= 2 * 16,
        "no AI worker idle for more than two of its turns: {longest} ticks"
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
        let h: Vec<Id> = (0..UnitKind::Harvester.def().mine_cap + 4)
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
    // (out of the mine: a worker inside is out of reach, 7.5 s at a time)
    for _ in 0..15 * TPS {
        if !w.unit(h).unwrap().inside() {
            break;
        }
        w.step();
    }
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
fn the_ledger_accounts_for_every_coin() {
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
            // (over 1000 by 3:00 with a load of 16; half that since the economy pass's 8; less since Nov 13's cut)
            assert!(m0 > 350, "seed {seed} {kind:?}: the harvesters mine ({m0})");
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

#[test]
fn a_worker_carrying_gold_walks_slower_than_an_empty_one() {
    // Calm trips (Stelian, Nov 12): the workers walk at about 87% of their old speed, and a load of gold slows one to
    // `LOADED_SPEED` of that (about 72% of the old). Two Villagers on open ground, one carrying gold, sent the same way.
    let mut w = arena(4);
    flatten(&mut w, 10..40, 30..40);
    let (y0, y1) = (34.0 * 32.0 + 16.0, 36.0 * 32.0 + 16.0);
    let empty = w.make_unit(UnitKind::Harvester, PLAYER, 12.0 * 32.0, y0);
    let loaded = w.make_unit(UnitKind::Harvester, PLAYER, 12.0 * 32.0, y1);
    w.units.iter_mut().find(|u| u.id == loaded).unwrap().carry =
        UnitKind::Harvester.def().mine_load;
    w.move_to(empty, 38.0 * 32.0, y0);
    w.move_to(loaded, 38.0 * 32.0, y1);
    run(&mut w, 1);
    let (e0, l0) = (w.unit(empty).unwrap().x, w.unit(loaded).unwrap().x);
    run(&mut w, 4);
    let (e1, l1) = (w.unit(empty).unwrap().x, w.unit(loaded).unwrap().x);
    let (ve, vl) = ((e1 - e0) / 4.0, (l1 - l0) / 4.0);
    assert!(
        (ve - UnitKind::Harvester.def().speed).abs() < 2.0,
        "empty: {ve:.1} px/s"
    );
    assert!(
        (vl / ve - LOADED_SPEED).abs() < 0.02,
        "loaded: {vl:.1} px/s against {ve:.1}"
    );
    assert!((0.85..=0.90).contains(&(UnitKind::Harvester.def().speed / 96.0)));
    assert!((0.85..=0.90).contains(&(UnitKind::Lumen.def().speed / 100.0)));
    assert!((0.70..=0.75).contains(&(UnitKind::Harvester.def().speed * LOADED_SPEED / 96.0)));
}
