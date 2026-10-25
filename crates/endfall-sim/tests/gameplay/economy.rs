//! Economy: mining shards and ether, fields and vents running dry, supply.

use super::common::*;

#[test]
fn harvesters_mine_ether_from_a_finished_extractor() {
    let mut w = rich(9);
    w.res[PLAYER as usize][1] = 0;
    let h = harvesters(&w, PLAYER);
    build(&mut w, BldgKind::Extractor, h[0], 90);
    let vent = w
        .map
        .nodes
        .iter()
        .find(|n| n.ether && n.extractor.is_some())
        .unwrap()
        .id;
    for &u in &h[..3] {
        assert!(w.start_gather(u, vent));
    }
    run(&mut w, 40);
    assert!(
        w.res[PLAYER as usize][1] > 0,
        "ether: {}",
        w.res[PLAYER as usize][1]
    );
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
        Err("Supply blocked. Build a Depot.".to_string())
    );
}

#[test]
fn the_builder_of_an_extractor_starts_mining_its_ether() {
    let mut w = rich(5);
    let h = harvesters(&w, PLAYER);
    let ext = build(&mut w, BldgKind::Extractor, h[0], 90);
    let vent = w.bldg(ext).unwrap().vent.expect("on a vent");
    run(&mut w, 1);
    assert!(
        matches!(w.unit(h[0]).unwrap().task, Task::Gather { node, .. } if node == vent),
        "the builder mines the new Extractor: {:?}",
        w.unit(h[0]).unwrap().task
    );
    // ... and a builder of anything else goes back to what it was doing.
    let h1 = *h
        .iter()
        .find(|&&u| !matches!(w.unit(u).unwrap().task, Task::Gather { node, .. } if node == vent))
        .unwrap();
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
fn ether_vents_run_dry_and_then_give_a_trickle() {
    use endfall_sim::world::Event;
    let mut w = rich(9);
    w.res[PLAYER as usize][1] = 0;
    let h = harvesters(&w, PLAYER);
    build(&mut w, BldgKind::Extractor, h[0], 90);
    let vent = w
        .map
        .nodes
        .iter()
        .find(|n| n.ether && n.extractor.is_some())
        .unwrap()
        .id;
    // The builder already mines it; mining takes from the vent like from a shard field.
    run(&mut w, 30);
    let mined = w.res[PLAYER as usize][1];
    let left = w.map.node(vent).unwrap().amount;
    let carried: i32 = w
        .units
        .iter()
        .filter(|u| u.team == PLAYER && u.carry_ether == Some(true))
        .map(|u| u.carry)
        .sum();
    assert!(mined > 0, "the builder mined ether");
    assert_eq!(
        left + mined + carried,
        5000,
        "every ether banked or carried came out of the vent"
    );
    // Nearly dry: two harvesters empty it, then keep bringing a trickle; the player hears about it once.
    w.map.node_mut(vent).unwrap().amount = 10;
    w.events.clear();
    assert!(w.start_gather(h[1], vent));
    let before = w.res[PLAYER as usize][1];
    let mut toasts = 0;
    for _ in 0..90 * TPS {
        w.step();
        toasts += w
            .events
            .drain(..)
            .filter(|e| matches!(e, Event::Toast { msg, .. } if msg.contains("depleted")))
            .count();
    }
    let n = w.map.node(vent).expect("a dry vent stays on the map");
    assert_eq!(n.amount, 0, "the vent is empty and never negative");
    assert_eq!(toasts, 1, "one notice when it runs dry");
    let after = w.res[PLAYER as usize][1] - before;
    assert!(
        after > 10 + 4 * VENT_TRICKLE,
        "the trickle keeps coming: {after}"
    );
    assert!(
        after < 10 + 20 * 6,
        "but far slower than a full vent: {after}"
    );
    for &u in &h[..2] {
        assert!(
            matches!(w.unit(u).unwrap().task, Task::Gather { node, .. } if node == vent),
            "harvesters stay on the dry vent"
        );
    }
}

#[test]
fn harvesters_pick_a_flowing_vent_over_a_dry_one() {
    let mut w = rich(9);
    let (cx, cy) = core(&w, PLAYER);
    let mut vents: Vec<(i32, Id, i32, i32)> = w
        .map
        .nodes
        .iter()
        .filter(|n| n.ether)
        .map(|n| ((n.tx - cx).abs() + (n.ty - cy).abs(), n.id, n.tx, n.ty))
        .collect();
    vents.sort();
    let (near, far) = (vents[0], vents[1]);
    for v in [near, far] {
        w.make_building(BldgKind::Extractor, PLAYER, v.2, v.3, true);
    }
    let n = w.map.node(near.1).unwrap();
    let (x, y) = (n.x, n.y);
    assert_eq!(w.nearest_node(x, y, PLAYER, true, 1e9), Some(near.1));
    w.map.node_mut(near.1).unwrap().amount = 0;
    assert_eq!(
        w.nearest_node(x, y, PLAYER, true, 1e9),
        Some(far.1),
        "the flowing one"
    );
    w.map.node_mut(far.1).unwrap().amount = 0;
    assert_eq!(
        w.nearest_node(x, y, PLAYER, true, 1e9),
        Some(near.1),
        "all dry: the nearest trickle"
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
        let i = (n.ty * MW + n.tx) as usize;
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
                    w.map.occ[((oy + y) * MW + ox + x) as usize] = 0;
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
fn busy_harvesters_only_hop_to_vents_with_their_own_extractor() {
    let mut w = rich(9);
    let h = harvesters(&w, PLAYER);
    build(&mut w, BldgKind::Extractor, h[0], 90);
    let mine = w
        .map
        .nodes
        .iter()
        .find(|n| n.ether && n.extractor.is_some())
        .unwrap()
        .id;
    let (mx, my) = (w.map.node(mine).unwrap().tx, w.map.node(mine).unwrap().ty);
    // Two more vents right beside ours: one with an enemy Extractor, one with none.
    let others: Vec<Id> = w
        .map
        .nodes
        .iter()
        .filter(|n| n.ether && n.id != mine)
        .map(|n| n.id)
        .take(2)
        .collect();
    let mut placed = vec![];
    for (&id, (dx, dy)) in others.iter().zip([(3, 0), (-3, 0), (0, 3), (0, -3)]) {
        let (tx, ty) = (mx + dx, my + dy);
        let free = (0..2).all(|y| {
            (0..2).all(|x| {
                let i = ((ty + y) * MW + tx + x) as usize;
                w.map.occ[i] == 0 && w.map.rock[i] == 0
            })
        });
        if free {
            move_node(&mut w, id, tx, ty);
            placed.push((id, tx, ty));
        }
    }
    assert!(!placed.is_empty(), "room beside the vent");
    let (eid, etx, ety) = placed[0];
    w.make_building(BldgKind::Extractor, ENEMY, etx, ety, true);
    for &u in &h {
        w.start_gather(u, mine);
    }
    run(&mut w, 30);
    for &(id, _, _) in &placed {
        let on = w
            .units
            .iter()
            .filter(|u| {
                u.team == PLAYER && matches!(u.task, Task::Gather { node, .. } if node == id)
            })
            .count();
        assert_eq!(
            on,
            0,
            "nobody hops to vent {id} (enemy Extractor: {})",
            id == eid
        );
    }
}

#[test]
fn a_new_refinery_gets_one_worker() {
    let on_vent = |w: &World, v: Id| {
        w.units
            .iter()
            .filter(|u| {
                u.team == PLAYER && matches!(u.task, Task::Gather { node, .. } if node == v)
            })
            .count()
    };
    // Humans: its builder only; the Vael (whose Lumen plants and leaves): the nearest one. Early on a player may want
    // every other worker on shards.
    for (mut w, kind) in [
        (rich(5), BldgKind::Extractor),
        (rich_vael(5), BldgKind::Siphon),
    ] {
        run(&mut w, 3); // everyone mining shards
        let worker = harvesters(&w, PLAYER)[0];
        let b = build(&mut w, kind, worker, 120);
        let vent = w.bldg(b).unwrap().vent.unwrap();
        assert_eq!(
            on_vent(&w, vent),
            1,
            "{kind:?}: one worker on the new refinery"
        );
    }
    // An AI seat balances its own ether workers: nothing is sent for it.
    let mut w = rich(5);
    w.set_ai_seats([true, true]);
    w.disable_ai();
    run(&mut w, 3);
    let worker = harvesters(&w, PLAYER)[0];
    let b = build(&mut w, BldgKind::Extractor, worker, 120);
    let vent = w.bldg(b).unwrap().vent.unwrap();
    assert_eq!(on_vent(&w, vent), 1, "only the AI's builder");
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
fn two_builders_of_a_refinery_leave_one_on_it() {
    // Two harvesters build the Extractor together: when it is done, one mines ether and the other goes back to shards.
    let mut w = rich(5);
    run(&mut w, 3);
    let hs = harvesters(&w, PLAYER);
    let (a, b) = (hs[0], hs[1]);
    let (vx, vy) = player_vent(&w);
    let ext = w
        .place_building(PLAYER, BldgKind::Extractor, vx, vy, Some(a))
        .expect("placed");
    assert!(w.start_build(b, ext), "the second harvester joins");
    for _ in 0..30 * 90 {
        w.step();
        if w.bldg(ext).is_some_and(|e| e.done) {
            break;
        }
    }
    run(&mut w, 1);
    let vent = w.bldg(ext).unwrap().vent.unwrap();
    let on = [a, b]
        .iter()
        .filter(|&&u| matches!(w.unit(u).unwrap().task, Task::Gather { node, .. } if node == vent))
        .count();
    assert_eq!(on, 1, "one of the two builders mines the new Extractor");
    let mines_vent =
        |u: Id| matches!(w.unit(u).unwrap().task, Task::Gather { node, .. } if node == vent);
    let other = if mines_vent(a) { b } else { a };
    assert!(
        matches!(w.unit(other).unwrap().task, Task::Gather { node, .. } if w.map.node(node).is_some_and(|n| !n.ether)),
        "the other goes back to the shards: {:?}",
        w.unit(other).unwrap().task
    );
}
