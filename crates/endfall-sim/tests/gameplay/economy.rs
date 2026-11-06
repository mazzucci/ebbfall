//! Economy: mining salt, fields running dry, Pumps on seeps, supply.

use super::common::*;

#[test]
fn a_finished_pump_pays_salt_with_no_workers() {
    // PRD: the conversion, rule 1. A Pump on a seep pays its owner half a salt a second, a whole salt every 2 s,
    // with nobody on it; it counts as mined. Both peoples' Pumps.
    for (mut w, kind) in [
        (rich(9), BldgKind::Extractor),
        (rich_vael(9), BldgKind::Siphon),
    ] {
        for h in harvesters(&w, PLAYER) {
            w.stop_unit(h); // (nobody mines: what comes in is the Pump's)
        }
        let (vx, vy) = player_vent(&w);
        let pump = w.make_building(kind, PLAYER, vx, vy, true);
        assert!(
            w.bldg(pump).unwrap().vent.is_some(),
            "{kind:?} stands on the seep"
        );
        w.res[PLAYER as usize] = [0, 0];
        let mined = w.ledger[PLAYER as usize].mined[0];
        run(&mut w, 1);
        assert_eq!(
            w.res[PLAYER as usize][0], 0,
            "{kind:?}: nothing in the first second"
        );
        run(&mut w, 1);
        assert_eq!(w.res[PLAYER as usize][0], 1, "{kind:?}: one salt after 2 s");
        run(&mut w, 58);
        assert_eq!(
            w.res[PLAYER as usize],
            [30, 0],
            "{kind:?}: 30 salt a minute, no ether"
        );
        assert_eq!(
            w.ledger[PLAYER as usize].mined[0] - mined,
            30,
            "{kind:?}: counted as mined"
        );
        assert!(
            w.units.iter().all(|u| u.team != PLAYER || u.carry == 0),
            "{kind:?}: nobody carried any of it"
        );
        // Gone, it pays nothing.
        w.damage(pump, 1e6, None);
        assert!(w.bldg(pump).is_none(), "{kind:?}: destroyed");
        let have = w.res[PLAYER as usize][0];
        run(&mut w, 10);
        assert_eq!(
            w.res[PLAYER as usize][0], have,
            "{kind:?}: no Pump, no salt"
        );
    }
}

#[test]
fn an_unfinished_pump_pays_nothing_and_a_seep_is_never_mined() {
    let mut w = rich(9);
    let h = harvesters(&w, PLAYER);
    for &u in &h {
        w.stop_unit(u);
    }
    let (vx, vy) = player_vent(&w);
    let site = w.make_building(BldgKind::Extractor, PLAYER, vx, vy, false);
    let vent = w.bldg(site).unwrap().vent.expect("on the seep");
    w.res[PLAYER as usize] = [0, 0];
    run(&mut w, 10);
    assert_eq!(w.res[PLAYER as usize][0], 0, "a site pays nothing");
    // A worker sent to the seep is refused, with or without its Pump, and tells why.
    w.events.clear();
    assert!(!w.start_gather(h[0], vent), "a seep is not mined");
    assert!(
        w.events.iter().any(
            |e| matches!(e, endfall_sim::world::Event::Toast { msg, .. } if msg.contains("Excavator"))
        ),
        "the player is told the Excavator digs by itself"
    );
    w.damage(site, 1e6, None);
    w.make_building(BldgKind::Extractor, PLAYER, vx, vy, true);
    assert!(!w.start_gather(h[0], vent), "nor with its Pump finished");
    // A full game's workers never carry from a seep: two Medium AIs for five minutes.
    let mut w = World::with_size(3, 1, MapKind::Standard, MapSize::DUEL, 0, &[&HUMANS, &VAEL]);
    assert!(w.set_ai_seats([true, true]));
    for _ in 0..5 * 60 * TPS {
        w.step();
        for u in &w.units {
            if let Task::Gather { node, .. } = u.task {
                assert!(
                    w.map.node(node).is_none_or(|n| !n.ether),
                    "unit {} of seat {} works a seep",
                    u.id,
                    u.team
                );
            }
        }
    }
    assert!(
        (0..2).all(|s| w.pumps(s) >= 1),
        "both AIs planted Pumps: {} and {}",
        w.pumps(0),
        w.pumps(1)
    );
    assert_eq!(w.res[0][1] + w.res[1][1], 0, "no ether anywhere");
}

#[test]
fn a_rally_on_a_seep_is_a_plain_point() {
    // New workers mine where their building's rally names a salt field; a seep is never mined, so a rally on one is
    // a point to walk to (from the Game API or the network: the client never sends one).
    let mut w = rich(9);
    let hq = w.bldgs.iter().find(|b| b.team == PLAYER).unwrap().id;
    let seep = w.map.nodes.iter().find(|n| n.ether).unwrap().id;
    let field = w.map.nodes.iter().find(|n| !n.ether).unwrap().id;
    w.set_rally(hq, 100.0, 200.0, Some(seep));
    assert_eq!(
        w.bldg(hq).unwrap().rally.unwrap().node,
        None,
        "a seep: a plain point"
    );
    w.set_rally(hq, 100.0, 200.0, Some(field));
    assert_eq!(
        w.bldg(hq).unwrap().rally.unwrap().node,
        Some(field),
        "a salt field: mined"
    );
}

#[test]
fn an_ai_pump_pays_at_its_levels_income() {
    // Brutal gathers 1.3 times as fast; its Pumps pay 1.3 times as much too (39 salt a minute, not 30).
    let mut w = World::with_setup(9, 3, MapKind::Standard, false, [&HUMANS, &HUMANS]);
    assert!(w.set_ai_seats([false, true]));
    w.disable_ai();
    for h in harvesters(&w, ENEMY) {
        w.stop_unit(h);
    }
    let (cx, cy) = core(&w, ENEMY);
    let n = w
        .map
        .nodes
        .iter()
        .filter(|n| n.ether)
        .min_by_key(|n| (n.tx - cx).abs() + (n.ty - cy).abs())
        .unwrap();
    let (vx, vy) = (n.tx, n.ty);
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
    assert_eq!((used, cap), (9, 10));
    w.cancel_queue(core_id, 4);
    w.cancel_queue(core_id, 3);
    let res_before = w.res[PLAYER as usize][0];
    w.cancel_queue(core_id, 0);
    assert_eq!(w.res[PLAYER as usize][0], res_before + 50, "cancel refunds");
    let h = harvesters(&w, PLAYER);
    build(&mut w, BldgKind::Depot, h[0], 90);
    assert_eq!(w.sup[PLAYER as usize][1], 18);
}

#[test]
fn the_supply_cap_grows_with_the_map() {
    // Roster v2: 60 on 64x64, 70 on 96x96, 80 on 128x128 (`World::supply_limit`). Supply buildings past the cap add
    // nothing, and a seat at the cap is supply blocked.
    for (n, cap, f) in [(64, 60, &HUMANS), (96, 70, &VAEL), (128, 80, &HUMANS)] {
        let mut w = World::with_size(7, 1, MapKind::Standard, MapSize::square(n), 0, &[f, f]);
        w.disable_ai();
        assert_eq!(w.supply_limit(), cap, "{n}x{n}");
        // Supply buildings round the headquarters (Windmasts or Sunpetals), one past what reaches the cap.
        let each = f.supply.def().supply;
        let hq = f.hq.def().supply;
        let need = ((cap - hq) as f64 / each as f64).ceil() as i32;
        for _ in 0..need + 1 {
            let (tx, ty) = spot(&w, f.supply);
            w.make_building(f.supply, PLAYER, tx, ty, true);
        }
        w.recalc_supply(PLAYER);
        assert_eq!(w.sup[PLAYER as usize][1], cap, "{n}x{n}: capped at {cap}");
        // Filled to the cap: blocked, and told the limit (another energy building would not help).
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
                "Energy at its limit ({cap}): no more until some fall"
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
    for _ in 0..6 {
        let _ = w.queue_unit(core_id, UnitKind::Harvester);
    }
    run(&mut w, 70); // trains five: 9 of 10 supply used
    w.queue_unit(core_id, UnitKind::Harvester)
        .expect("the tenth fits");
    assert_eq!(
        w.queue_unit(core_id, UnitKind::Harvester),
        Err("Out of energy. Build a Windmast.".to_string())
    );
}

#[test]
fn builders_go_back_to_the_salt() {
    // The builder of a Pump, as of anything else, goes back to the salt it was mining (nobody works a seep).
    let mut w = rich(5);
    run(&mut w, 3);
    let h = harvesters(&w, PLAYER);
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
fn one_harvester_mines_a_field_at_a_time() {
    let mut w = rich(9);
    let field = home_fields(&w)[0];
    // Every other shard field gone: nowhere to spread to.
    let others: Vec<Id> = w
        .map
        .nodes
        .iter()
        .filter(|n| !n.ether && n.id != field)
        .map(|n| n.id)
        .collect();
    for id in &others {
        let n = w.map.node(*id).unwrap();
        let i = w.map.idx(n.tx, n.ty);
        w.map.occ[i] = 0;
    }
    w.map.nodes.retain(|n| !others.contains(&n.id));
    let h = harvesters(&w, PLAYER);
    for &u in &h {
        assert!(w.start_gather(u, field));
    }
    let mut waited = false;
    for _ in 0..60 * TPS {
        w.step();
        let mining = w
            .units
            .iter()
            .filter(|u| {
                u.team == PLAYER
                    && matches!(
                        u.task,
                        Task::Gather {
                            phase: Phase::Mine,
                            ..
                        }
                    )
            })
            .count();
        assert!(mining <= 1, "{mining} mine one field at once");
        waited |= w.units.iter().any(|u| {
            matches!(
                u.task,
                Task::Gather {
                    phase: Phase::Wait,
                    ..
                }
            )
        });
    }
    assert!(waited, "four on one field take turns");
    for &u in &h {
        assert_eq!(
            gather_node(&w, u),
            Some(field),
            "and stay: there is no other field"
        );
    }
}

#[test]
fn harvesters_sent_to_one_field_spread_over_the_quiet_ones_nearby() {
    let mut w = rich(9);
    let core_id = w
        .bldgs
        .iter()
        .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
        .unwrap()
        .id;
    let (x, y) = (
        w.bldg(core_id).unwrap().x,
        w.bldg(core_id).unwrap().y + 90.0,
    );
    for _ in 0..4 {
        w.make_unit(UnitKind::Harvester, PLAYER, x, y);
    }
    let field = home_fields(&w)[0];
    let h = harvesters(&w, PLAYER);
    for &u in &h {
        assert!(w.start_gather(u, field));
    }
    run(&mut w, 40);
    let mut used: Vec<Id> = h.iter().filter_map(|&u| gather_node(&w, u)).collect();
    used.sort();
    used.dedup();
    assert!(
        used.len() >= 3,
        "eight harvesters work {} fields",
        used.len()
    );
    for &f in &used {
        let on = h.iter().filter(|&&u| gather_node(&w, u) == Some(f)).count();
        assert!(on <= 3, "field {f} has {on}");
    }
    // Settled: nobody shuttles between fields.
    let before: Vec<_> = h.iter().map(|&u| gather_node(&w, u)).collect();
    let mut moves = 0;
    let mut last = before.clone();
    for _ in 0..60 * TPS {
        w.step();
        let now: Vec<_> = h.iter().map(|&u| gather_node(&w, u)).collect();
        moves += now.iter().zip(&last).filter(|(a, b)| a != b).count();
        last = now;
    }
    assert!(moves <= 2, "{moves} field changes in a minute once spread");
}

#[test]
fn busy_harvesters_only_hop_to_fields_no_farther_from_the_drop_off() {
    // Two shard fields left on open ground: one by a Core, the other 6 tiles farther out. Harvesters crowding the
    // near one wait rather than wander out to the far one; a field as close to the Core takes them.
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
            let (size, ox, oy) = (if n.ether { 2 } else { 1 }, n.tx, n.ty);
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
        let h: Vec<Id> = (0..4)
            .map(|i| {
                w.make_unit(
                    UnitKind::Harvester,
                    PLAYER,
                    x + 80.0,
                    y - 30.0 + i as f64 * 20.0,
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
            assert_eq!(on_second, 0, "nobody strays to the far field");
        } else {
            assert!(on_second >= 1, "the equally near field takes the overflow");
        }
    }
}

#[test]
fn a_shard_field_running_low_is_announced_once_with_a_ping() {
    use endfall_sim::world::{Event, FIELD_LOW};
    let mut w = rich(5);
    // The player's home field (the crystals laid down with the one nearest the Core), cut to uneven amounts just
    // above the mark: its harvesters mine it down through it in their own order.
    let core = w
        .bldgs
        .iter()
        .find(|b| b.team == PLAYER && b.kind.def().hq)
        .unwrap()
        .clone();
    let near = w
        .map
        .nodes
        .iter()
        .filter(|n| !n.ether)
        .min_by(|a, b| {
            let da = (a.x - core.x).powi(2) + (a.y - core.y).powi(2);
            let db = (b.x - core.x).powi(2) + (b.y - core.y).powi(2);
            da.partial_cmp(&db).unwrap()
        })
        .unwrap()
        .field;
    let home: Vec<usize> = (0..w.map.nodes.len())
        .filter(|&i| w.map.nodes[i].field == near)
        .collect();
    assert!(home.len() >= 5, "a whole arc: {}", home.len());
    for (k, &i) in home.iter().enumerate() {
        w.map.nodes[i].amount =
            (FIELD_LOW + 200) / home.len() as i32 + if k % 2 == 0 { 40 } else { -30 };
    }
    let (mut toasts, mut pings) = (0, 0);
    for _ in 0..30 * 120 {
        w.step();
        for e in w.events.drain(..) {
            match e {
                Event::Toast { team: 0, msg, .. } if msg.contains("running low") => toasts += 1,
                Event::Ping { team: 0, .. } => pings += 1,
                _ => {}
            }
        }
    }
    let left: i32 = home.iter().map(|&i| w.map.nodes[i].amount).sum();
    assert!(left < FIELD_LOW, "mined through the mark: {left}");
    assert_eq!(toasts, 1, "announced once for the field");
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
    // A raider parks by the field (it cannot die, and holds there).
    let raider = w.make_unit(UnitKind::Trooper, ENEMY, nx + 3.0 * TILE, ny);
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
