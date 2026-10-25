//! Construction: placing, building, stalling and resuming, cancelling, repairing.

use super::common::*;

#[test]
fn construction_stops_without_a_builder_and_resumes_with_one() {
    let mut w = rich(5);
    let h = harvesters(&w, PLAYER);
    let (tx, ty) = spot(&w, BldgKind::Depot);
    let b = w
        .place_building(PLAYER, BldgKind::Depot, tx, ty, Some(h[0]))
        .unwrap();
    run(&mut w, 12);
    let started = w.bldg(b).unwrap().progress;
    assert!(started > 0.0, "builder made progress");
    w.stop_unit(h[0]);
    run(&mut w, 10);
    assert_eq!(
        w.bldg(b).unwrap().progress,
        started,
        "no builder, no progress"
    );
    w.start_build(h[1], b);
    run(&mut w, 40);
    assert!(w.bldg(b).unwrap().done, "a new builder finished it");
}

#[test]
fn a_walled_in_builder_gives_up_instead_of_waiting_forever() {
    let mut w = rich(23);
    flatten(&mut w, 12..21, 18..27); // known open ground for the pocket
    // Wall a harvester into a one-tile pocket at tile (16,22) with four finished depots.
    let h = harvesters(&w, PLAYER)[0];
    for (tx, ty) in [(15, 20), (17, 21), (16, 23), (14, 22)] {
        w.make_building(BldgKind::Depot, PLAYER, tx, ty, true);
    }
    {
        let u = w.units.iter_mut().find(|u| u.id == h).unwrap();
        u.x = 16.0 * TILE + 16.0;
        u.y = 22.0 * TILE + 16.0;
    }
    let (tx, ty) = spot(&w, BldgKind::Barracks);
    let rax = w
        .place_building(PLAYER, BldgKind::Barracks, tx, ty, Some(h))
        .unwrap();
    assert_eq!(w.unit(h).unwrap().task, Task::Build { b: rax });
    run(&mut w, 10);
    assert_ne!(
        w.unit(h).unwrap().task,
        Task::Build { b: rax },
        "the trapped builder gave up"
    );
    assert!(
        w.unit(h).unwrap().no_build_until > w.time,
        "and is not picked again right away"
    );
}

#[test]
fn cancelling_construction_refunds_three_quarters() {
    let mut w = rich(25);
    let h = harvesters(&w, PLAYER);
    let rax = build(&mut w, BldgKind::Barracks, h[0], 120);
    let (tx, ty) = spot(&w, BldgKind::Forge);
    w.res[PLAYER as usize] = [1000, 1000];
    let forge = w
        .place_building(PLAYER, BldgKind::Forge, tx, ty, Some(h[1]))
        .unwrap();
    assert_eq!(w.res[PLAYER as usize], [850, 900]);
    assert!(w.cancel_construction(forge));
    assert_eq!(w.res[PLAYER as usize], [850 + 112, 900 + 75]);
    assert!(
        w.bldg(forge).is_none() && w.can_place(BldgKind::Forge, tx, ty, PLAYER),
        "the site is free again"
    );
    assert!(
        !w.cancel_construction(rax),
        "finished buildings cannot be cancelled"
    );
}

#[test]
fn builders_walking_a_long_way_around_do_not_give_up() {
    // Paths that first lead sideways or away from the site (cases a review found being abandoned): on each map,
    // a site whose walk is at least 1.5 times the straight line.
    for seed in [22, 50, 7] {
        let (from, site) = long_way_around(seed)
            .unwrap_or_else(|| panic!("seed {seed}: no long way around found"));
        let (mut w, h, b) = lone_builder(seed, from, site, BldgKind::Barracks);
        builds_within(&mut w, h, b, 150)
            .unwrap_or_else(|e| panic!("seed {seed} {from:?} -> {site:?}: {e}"));
    }
}

#[test]
fn a_builder_jammed_on_a_corner_does_not_wait_forever() {
    let (mut w, h, b) = lone_builder(23, (21, 36), (44, 26), BldgKind::Barracks);
    run(&mut w, 90);
    let done = w.bldg(b).is_some_and(|b| b.done);
    let gave_up = w.unit(h).is_some_and(|u| u.task != (Task::Build { b }));
    assert!(
        done || gave_up,
        "after 90 s the builder either finished or gave up"
    );
}

#[test]
fn builders_reach_every_reachable_site() {
    let trials: u32 = if cfg!(debug_assertions) { 25 } else { 300 };
    let mut r = Mulberry32::new(99);
    let mut tried = 0;
    while tried < trials {
        let seed = r.below(1000);
        let probe = World::new(seed, 1);
        let from = (r.below(MW as u32) as i32, r.below(MH as u32) as i32);
        let site = (r.below(MW as u32 - 3) as i32, r.below(MH as u32 - 3) as i32);
        if probe.map.blocked(from.0, from.1)
            || !probe.can_place(BldgKind::Barracks, site.0, site.1, ENEMY)
        {
            continue;
        }
        let reach = reachable(&probe, from);
        let side_reachable = (site.1 - 1..=site.1 + 3).any(|y| {
            (site.0 - 1..=site.0 + 3).any(|x| {
                (x < site.0 || x > site.0 + 2 || y < site.1 || y > site.1 + 2)
                    && x >= 0
                    && y >= 0
                    && x < MW
                    && y < MH
                    && reach[(y * MW + x) as usize]
            })
        });
        if !side_reachable {
            continue;
        }
        tried += 1;
        let (mut w, h, b) = lone_builder(seed, from, site, BldgKind::Barracks);
        builds_within(&mut w, h, b, 200)
            .unwrap_or_else(|e| panic!("seed {seed} from {from:?} site {site:?}: {e}"));
    }
}

#[test]
fn harvesters_repair_damaged_buildings_for_a_share_of_the_price() {
    let (mut w, depot, h) = damaged_depot(5, 0.2);
    let before = w.res[PLAYER as usize];
    assert!(w.start_repair(h, depot));
    let mut secs = 0.0;
    while w.bldg(depot).unwrap().hp < w.bldg(depot).unwrap().maxhp && secs < 40.0 {
        w.step();
        secs += 1.0 / TPS as f64;
    }
    let b = w.bldg(depot).unwrap();
    assert_eq!(b.hp, b.maxhp, "repaired to full");
    // 80% of the hp at construction speed (22 s build) takes about 17.6 s plus the walk.
    assert!((17.0..30.0).contains(&secs), "repair time {secs:.1} s");
    let spent = before[0] - w.res[PLAYER as usize][0];
    let price = BldgKind::Depot.def().cost[0] as f64 * REPAIR_COST * 0.8;
    assert!(
        (spent as f64 - price).abs() <= 1.0,
        "paid {spent} shards for 80% (expected about {price})"
    );
    run(&mut w, 2);
    assert!(
        matches!(w.unit(h).unwrap().task, Task::Gather { .. }),
        "back to mining afterwards: {:?}",
        w.unit(h).unwrap().task
    );
}

#[test]
fn two_harvesters_repair_twice_as_fast() {
    let (mut w, depot, h) = damaged_depot(5, 0.2);
    let other = harvesters(&w, PLAYER)[2];
    assert!(w.start_repair(h, depot) && w.start_repair(other, depot));
    run(&mut w, 14);
    let b = w.bldg(depot).unwrap();
    assert_eq!(
        b.hp, b.maxhp,
        "two repairers finish 80% in well under the single-repairer time"
    );
}

#[test]
fn repairs_stop_when_the_money_runs_out() {
    let (mut w, depot, h) = damaged_depot(5, 0.2);
    w.res[PLAYER as usize] = [3, 0];
    assert!(w.start_repair(h, depot));
    run(&mut w, 25);
    let b = w.bldg(depot).unwrap();
    assert!(
        b.hp < b.maxhp * 0.5,
        "only a little was repaired: {}/{}",
        b.hp,
        b.maxhp
    );
    assert!(w.res[PLAYER as usize][0] >= 0, "never in debt");
    assert!(
        !matches!(w.unit(h).unwrap().task, Task::Repair { .. }),
        "the harvester gave up"
    );
}

#[test]
fn only_harvesters_repair_and_only_their_own_damaged_finished_buildings() {
    let (mut w, depot, h) = damaged_depot(5, 0.5);
    let core = w
        .bldgs
        .iter()
        .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
        .unwrap()
        .id;
    assert!(
        !w.start_repair(h, core),
        "a building at full hp needs no repair"
    );
    let foe_core = w.bldgs.iter().find(|b| b.team == ENEMY).unwrap().id;
    w.bldgs.iter_mut().find(|b| b.id == foe_core).unwrap().hp -= 100.0;
    assert!(!w.start_repair(h, foe_core), "not the enemy's");
    let trooper = w.make_unit(UnitKind::Trooper, PLAYER, 600.0, 600.0);
    assert!(!w.start_repair(trooper, depot), "troopers do not repair");
    let (tx, ty) = spot(&w, BldgKind::Depot);
    let site = w
        .place_building(PLAYER, BldgKind::Depot, tx, ty, None)
        .unwrap();
    assert!(
        !w.start_repair(h, site),
        "unfinished buildings are built, not repaired"
    );
    assert!(w.start_repair(h, depot));
}

#[test]
fn an_interrupted_repair_costs_the_same_in_total() {
    let (mut w, depot, h) = damaged_depot(5, 0.2);
    let before = w.res[PLAYER as usize][0];
    assert!(w.start_repair(h, depot));
    run(&mut w, 12); // part of the way
    let hp = w.bldg(depot).unwrap().hp;
    assert!(hp > 100.0 && hp < 340.0, "stopped mid-repair at {hp}");
    w.stop_unit(h);
    run(&mut w, 2);
    assert!(w.start_repair(h, depot));
    for _ in 0..30 * TPS {
        w.step();
        if w.bldg(depot).unwrap().hp >= w.bldg(depot).unwrap().maxhp {
            break;
        }
    }
    let b = w.bldg(depot).unwrap();
    assert_eq!(b.hp, b.maxhp);
    let spent = before - w.res[PLAYER as usize][0];
    assert!(
        (spent - 20).abs() <= 1,
        "two halves cost one repair: {spent} shards"
    );
}

#[test]
fn a_repairer_goes_back_to_mining_if_its_building_is_destroyed() {
    let (mut w, depot, h) = damaged_depot(5, 0.2);
    assert!(w.start_repair(h, depot));
    run(&mut w, 4);
    w.damage(depot, 1e6, None);
    run(&mut w, 2);
    assert!(w.bldg(depot).is_none(), "the depot is gone");
    assert!(
        matches!(w.unit(h).unwrap().task, Task::Gather { .. }),
        "back to mining: {:?}",
        w.unit(h).unwrap().task
    );
}

#[test]
fn the_foundry_takes_two_by_two_tiles() {
    let mut w = rich(9);
    let h = harvesters(&w, PLAYER);
    build(&mut w, BldgKind::Barracks, h[0], 90);
    let f = build(&mut w, BldgKind::Forge, h[1], 120);
    let b = w.bldg(f).unwrap();
    assert_eq!((b.w, b.h), (2, 2));
    let taken = (0..MW * MH)
        .filter(|&i| w.map.occ[i as usize] == f as i32)
        .count();
    assert_eq!(taken, 4, "it blocks four tiles");
    assert_eq!(BldgKind::Forge.def().name, "Foundry");
}

#[test]
fn a_lumen_plants_a_vael_building_and_is_free_at_once() {
    let mut w = rich_vael(4242);
    let l = harvesters(&w, PLAYER);
    let (tx, ty) = spot(&w, BldgKind::Spire);
    let site = w
        .place_building(PLAYER, BldgKind::Spire, tx, ty, Some(l[0]))
        .unwrap();
    let mut planted_at = None;
    for t in 0..30 * 20 {
        w.step();
        if planted_at.is_none() && w.bldg(site).unwrap().planted {
            planted_at = Some(t);
            break;
        }
    }
    assert!(
        planted_at.is_some(),
        "the Lumen reached the site and planted it"
    );
    assert!(
        !matches!(w.unit(l[0]).unwrap().task, Task::Build { .. }),
        "and went back to work at once"
    );
    // Ordered far away: the Spire still finishes in its build time.
    w.move_to(l[0], 50.0, 50.0);
    run(&mut w, BldgKind::Spire.def().build as u32 + 2);
    assert!(w.bldg(site).unwrap().done, "it grew by itself");
    assert!(
        !w.can_build(l[1], site),
        "nothing for a worker to do on a seed"
    );
    // The humans still build with a worker at the site.
    let mut w = rich(4242);
    let h = harvesters(&w, PLAYER);
    let (tx, ty) = spot(&w, BldgKind::Depot);
    let d = w
        .place_building(PLAYER, BldgKind::Depot, tx, ty, Some(h[0]))
        .unwrap();
    run(&mut w, 8);
    assert!(!w.bldg(d).unwrap().planted);
    w.stop_unit(h[0]);
    let p = w.bldg(d).unwrap().progress;
    run(&mut w, 5);
    assert_eq!(w.bldg(d).unwrap().progress, p, "no builder, no progress");
}

#[test]
fn vael_production_needs_power_and_goes_dark_without_it() {
    let mut w = rich_vael(4242);
    let l = harvesters(&w, PLAYER);
    let (cx, cy) = core(&w, PLAYER);
    // Out of every field: the Kiln cannot be placed there.
    let far = (cx + 20).min(MW - 4);
    assert!(
        !w.can_place(BldgKind::Kiln, far, cy, PLAYER)
            || w.powered_at(PLAYER, (far as f64 + 1.5) * TILE, (cy as f64 + 1.5) * TILE)
    );
    // A Spire, then a Kiln covered only by it (not by the Conflux).
    let spire = build(&mut w, BldgKind::Spire, l[0], 90);
    let (sx, sy) = (w.bldg(spire).unwrap().x, w.bldg(spire).unwrap().y);
    let (hx, hy) = (
        w.bldg(
            w.bldgs
                .iter()
                .find(|b| b.team == PLAYER && b.kind == BldgKind::Conflux)
                .unwrap()
                .id,
        )
        .unwrap()
        .x,
        w.bldgs
            .iter()
            .find(|b| b.team == PLAYER && b.kind == BldgKind::Conflux)
            .unwrap()
            .y,
    );
    let mut site = None;
    'find: for dy in -8..=8 {
        for dx in -8..=8 {
            let (tx, ty) = ((sx / TILE) as i32 + dx, (sy / TILE) as i32 + dy);
            let (kx, ky) = ((tx as f64 + 1.5) * TILE, (ty as f64 + 1.5) * TILE);
            if w.can_place(BldgKind::Kiln, tx, ty, PLAYER)
                && endfall_sim::jsmath::dist(kx, ky, hx, hy) > 7.5 * TILE
            {
                site = Some((tx, ty));
                break 'find;
            }
        }
    }
    let (tx, ty) = site.expect("a spot only the Spire covers");
    let kiln = w
        .place_building(PLAYER, BldgKind::Kiln, tx, ty, Some(l[1]))
        .unwrap();
    run(&mut w, 60);
    assert!(w.bldg(kiln).unwrap().done && w.bldg(kiln).unwrap().powered);
    w.queue_unit(kiln, UnitKind::Scythe).unwrap();
    run(&mut w, 5);
    let p = w.bldg(kiln).unwrap().prog;
    assert!(p > 0.0, "training while powered");
    // The Spire falls: the Kiln goes dark and its training pauses; a new Spire brings it back.
    w.damage(spire, 1e6, None);
    run(&mut w, 1);
    let k = w.bldg(kiln).unwrap();
    assert!(!k.powered, "dark without a Spire");
    let p = k.prog;
    run(&mut w, 5);
    assert_eq!(w.bldg(kiln).unwrap().prog, p, "training pauses while dark");
    let (stx, sty) = ((sx / TILE) as i32 - 1, (sy / TILE) as i32 - 1);
    let s2 = w
        .place_building(PLAYER, BldgKind::Spire, stx, sty, Some(l[2]))
        .unwrap();
    run(&mut w, 40);
    assert!(
        w.bldg(s2).unwrap().done && w.bldg(kiln).unwrap().powered,
        "a new Spire powers it again"
    );
    run(&mut w, 30);
    assert_eq!(
        count(&w, PLAYER, UnitKind::Scythe),
        1,
        "and the Scythe comes out"
    );
}

#[test]
fn the_power_gate_is_the_only_thing_keeping_a_kiln_out() {
    let mut w = rich_vael(4242);
    let l = harvesters(&w, PLAYER);
    let (cx, cy) = core(&w, PLAYER);
    // A free spot outside every field: a Spire (no power needed) fits there, a Kiln does not.
    let mut spot = None;
    'find: for r in 9..14 {
        for a in 0..24 {
            let ang = a as f64 / 24.0 * std::f64::consts::TAU;
            let (tx, ty) = (
                (cx as f64 + 2.0 + ang.cos() * r as f64) as i32,
                (cy as f64 + 2.0 + ang.sin() * r as f64) as i32,
            );
            let centre = ((tx as f64 + 1.5) * TILE, (ty as f64 + 1.5) * TILE);
            // Free ground for a 3x3 (two Spires cover it) plus a Spire's room beside it, and no field there.
            let free = w.can_place(BldgKind::Spire, tx, ty, PLAYER)
                && w.can_place(BldgKind::Spire, tx + 1, ty + 1, PLAYER);
            if free
                && w.can_place(BldgKind::Spire, tx + 3, ty, PLAYER)
                && !w.powered_at(PLAYER, centre.0, centre.1)
                && !w.can_place(BldgKind::Kiln, tx, ty, PLAYER)
            {
                spot = Some((tx, ty));
                break 'find;
            }
        }
    }
    let (tx, ty) = spot.expect("an unpowered spot");
    assert_eq!(
        w.place_building(PLAYER, BldgKind::Kiln, tx, ty, Some(l[1])),
        Err("Needs power: place it in a power field (near a Spire)".to_string()),
        "the refusal says what is missing"
    );
    // An unfinished Spire beside it does not power it yet; the finished one does.
    let s = w
        .place_building(PLAYER, BldgKind::Spire, tx + 3, ty, Some(l[0]))
        .unwrap();
    run(&mut w, 3);
    assert!(
        !w.bldg(s).unwrap().done && !w.can_place(BldgKind::Kiln, tx, ty, PLAYER),
        "a growing Spire powers nothing"
    );
    run(&mut w, 40);
    assert!(w.bldg(s).unwrap().done);
    assert!(
        w.can_place(BldgKind::Kiln, tx, ty, PLAYER),
        "inside the finished Spire's field the Kiln fits"
    );
}

#[test]
fn a_dark_ward_holds_its_fire_and_a_dark_loom_keeps_its_research() {
    let mut w = rich_vael(4242);
    let l = harvesters(&w, PLAYER);
    let spire = build(&mut w, BldgKind::Spire, l[0], 90);
    build(&mut w, BldgKind::Kiln, l[1], 90);
    let loom = build(&mut w, BldgKind::Loom, l[2], 90);
    let ward = build(&mut w, BldgKind::Ward, l[3], 90);
    // Darken them: no power source left at all.
    w.damage(spire, 1e6, None);
    let hq = w
        .bldgs
        .iter()
        .find(|b| b.team == PLAYER && b.kind == BldgKind::Conflux)
        .unwrap()
        .id;
    w.damage(hq, 1e6, None);
    w.start_research(loom, Upgrade::Weapons).unwrap_or(());
    run(&mut w, 1);
    assert!(
        !w.bldg(ward).unwrap().powered && !w.bldg(loom).unwrap().powered,
        "dark"
    );
    let r = w.bldg(loom).unwrap().research;
    let (x, y) = (
        w.bldg(ward).unwrap().x + 4.0 * TILE,
        w.bldg(ward).unwrap().y,
    );
    let foe = w.make_unit(UnitKind::Trooper, ENEMY, x, y);
    w.hold_unit(foe);
    let hp = w.unit(foe).unwrap().hp;
    run(&mut w, 5);
    assert_eq!(
        w.unit(foe).map(|u| u.hp),
        Some(hp),
        "a dark Ward does not fire"
    );
    assert_eq!(
        w.bldg(loom).unwrap().research,
        r,
        "a dark Loom keeps its research where it was"
    );
}

#[test]
fn supply_blocked_names_the_right_building_for_each_race() {
    let mut w = rich_vael(4242);
    w.sup[PLAYER as usize] = [10, 10];
    let hq = w
        .bldgs
        .iter()
        .find(|b| b.team == PLAYER && b.kind == BldgKind::Conflux)
        .unwrap()
        .id;
    assert_eq!(
        w.queue_unit(hq, UnitKind::Lumen),
        Err("Supply blocked. Build a Spire.".to_string())
    );
}
