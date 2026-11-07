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
    assert_eq!(w.res[PLAYER as usize], [850, 1000], "no ether paid");
    assert!(w.cancel_construction(forge));
    assert_eq!(w.res[PLAYER as usize], [850 + 112, 1000]);
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
        let (mw, mh) = (probe.map.w as u32, probe.map.h as u32);
        let from = (r.below(mw) as i32, r.below(mh) as i32);
        let site = (r.below(mw - 3) as i32, r.below(mh - 3) as i32);
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
                    && x < probe.map.w
                    && y < probe.map.h
                    && reach[probe.map.idx(x, y)]
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
    let taken = (0..w.map.occ.len())
        .filter(|&i| w.map.occ[i] == f as i32)
        .count();
    assert_eq!(taken, 4, "it blocks four tiles");
    assert_eq!(BldgKind::Forge.def().name, "Workshop");
}

#[test]
fn a_lumen_stays_at_its_vael_site_until_it_stands() {
    // PRD: builders who stay (Stelian, 2026-11-06). The Vael build as the Harbour does: the Glint stays on the site
    // while it rises, and goes back to the salt once it stands.
    let mut w = rich_vael(4242);
    let l = harvesters(&w, PLAYER);
    let (tx, ty) = spot(&w, BldgKind::Spire);
    let site = w
        .place_building(PLAYER, BldgKind::Spire, tx, ty, Some(l[0]))
        .unwrap();
    let mut rose = false;
    for _ in 0..30 * 60 {
        w.step();
        let b = w.bldg(site).unwrap();
        if b.done {
            break;
        }
        if b.progress > 0.0 {
            rose = true;
            assert_eq!(
                w.unit(l[0]).unwrap().task,
                Task::Build { b: site },
                "the Glint stays while it rises (progress {:.2})",
                b.progress
            );
        }
    }
    assert!(rose && w.bldg(site).unwrap().done, "the Sunpetal stands");
    assert!(
        !w.can_build(l[1], site),
        "nothing left to build on a finished one"
    );
    run(&mut w, 1);
    assert!(
        matches!(w.unit(l[0]).unwrap().task, Task::Gather { .. }),
        "and the Glint went back to the salt: {:?}",
        w.unit(l[0]).unwrap().task
    );
}

#[test]
fn a_vael_site_stalls_without_its_lumen_and_resumes_when_one_returns() {
    // The Harbour's rule, now both peoples': no builder, no progress; another Glint sent to it finishes it.
    for (mut w, kind) in [
        (rich_vael(4242), BldgKind::Spire),
        (rich(4242), BldgKind::Depot),
    ] {
        let l = harvesters(&w, PLAYER);
        let (tx, ty) = spot(&w, kind);
        let site = w.place_building(PLAYER, kind, tx, ty, Some(l[0])).unwrap();
        run(&mut w, 8);
        let p = w.bldg(site).unwrap().progress;
        assert!(p > 0.0, "{kind:?}: it started rising");
        w.stop_unit(l[0]);
        run(&mut w, 5);
        assert_eq!(
            w.bldg(site).unwrap().progress,
            p,
            "{kind:?}: no builder, no progress"
        );
        assert!(!w.bldg(site).unwrap().done);
        assert!(
            w.can_build(l[1], site),
            "{kind:?}: a site waits for a builder"
        );
        assert!(w.start_build(l[1], site));
        run(&mut w, kind.def().build as u32 + 10);
        assert!(w.bldg(site).unwrap().done, "{kind:?}: resumed and finished");
    }
}

#[test]
fn a_persons_new_siphon_keeps_its_builder_until_it_stands_then_sends_it_back_to_work() {
    // Rule 3: a person's new extractor, either people's, has its builder on it until it stands (it needs no worker
    // after: it pays by itself), and the builder then goes back to the salt, as from any building.
    for (mut w, ext, rax) in [
        (rich_vael(9), BldgKind::Siphon, BldgKind::Kiln),
        (rich(9), BldgKind::Extractor, BldgKind::Barracks),
    ] {
        let (cx, cy) = core(&w, PLAYER);
        w.make_building(rax, PLAYER, cx - 5, cy, true);
        let h = harvesters(&w, PLAYER)[0];
        let (vx, vy) = player_vent(&w);
        let b = w
            .place_building(PLAYER, ext, vx, vy, Some(h))
            .unwrap_or_else(|e| panic!("{ext:?}: {e}"));
        for _ in 0..30 * 90 {
            w.step();
            if w.bldg(b).unwrap().done {
                break;
            }
            assert_eq!(
                w.unit(h).unwrap().task,
                Task::Build { b },
                "{ext:?}: its builder stays until it stands"
            );
        }
        assert!(w.bldg(b).unwrap().done, "{ext:?}: built");
        run(&mut w, 1);
        assert!(
            matches!(w.unit(h).unwrap().task, Task::Gather { node, .. } if w.map.node(node).is_some_and(|n| !n.ether)),
            "{ext:?}: its builder back on the salt: {:?}",
            w.unit(h).unwrap().task
        );
        assert!(
            w.bldg(b).unwrap().pumped > 0.0,
            "{ext:?}: and it draws by itself"
        );
    }
}

#[test]
fn vael_production_needs_no_sunpetal_near_it() {
    // Roster v2 retired the power field (and its code went with plant-and-leave construction): a Cradle (the Kiln)
    // goes up on any free ground far from every Sunpetal and the Tidewell, and with every Sunpetal and the Tidewell
    // gone it trains, an Anemone (Ward) fires and a Glasshouse (Loom) researches on.
    let mut w = rich_vael(4242);
    let l = harvesters(&w, PLAYER);
    let (cx, cy) = core(&w, PLAYER);
    // The first free 3x3 at least 9 tiles from the Tidewell: no field anywhere near it.
    let (tx, ty) = (9..14)
        .flat_map(|r| (0..24).map(move |a| (r, a)))
        .map(|(r, a)| {
            let ang = a as f64 / 24.0 * std::f64::consts::TAU;
            (
                (cx as f64 + 2.0 + ang.cos() * r as f64) as i32,
                (cy as f64 + 2.0 + ang.sin() * r as f64) as i32,
            )
        })
        .find(|&(tx, ty)| w.can_place(BldgKind::Kiln, tx, ty, PLAYER))
        .expect("a free spot far from the Tidewell");
    let kiln = w
        .place_building(PLAYER, BldgKind::Kiln, tx, ty, Some(l[1]))
        .unwrap();
    run(&mut w, 60);
    assert!(w.bldg(kiln).unwrap().done);
    let loom = build(&mut w, BldgKind::Loom, l[2], 90);
    let ward = build(&mut w, BldgKind::Ward, l[3], 90);
    // (queued while the Tidewell still gives supply)
    w.queue_unit(kiln, UnitKind::Scythe).unwrap();
    // Nothing that ever cast a field is left: the Tidewell falls (with its workers kept: the game goes on).
    let hq = w
        .bldgs
        .iter()
        .find(|b| b.team == PLAYER && b.kind == BldgKind::Conflux)
        .unwrap()
        .id;
    w.damage(hq, 1e6, None);
    assert!(
        !w.bldgs
            .iter()
            .any(|b| b.team == PLAYER && b.kind == BldgKind::Spire)
    );
    w.start_research(loom, Upgrade::Weapons).unwrap();
    run(&mut w, 1);
    let r = w.bldg(loom).unwrap().research;
    let (x, y) = (
        w.bldg(ward).unwrap().x + 4.0 * TILE,
        w.bldg(ward).unwrap().y,
    );
    let foe = w.make_unit(UnitKind::Medic, ENEMY, x, y); // (unarmed: it does not fight back)
    w.hold_unit(foe);
    let hp = w.unit(foe).unwrap().hp;
    run(&mut w, 5);
    assert!(
        w.unit(foe).is_none_or(|u| u.hp < hp),
        "the Anemone fires with no Sunpetal anywhere"
    );
    assert!(
        w.bldg(loom).unwrap().research.map(|r| r.1) > r.map(|r| r.1),
        "the Glasshouse researches on"
    );
    run(&mut w, 30);
    assert_eq!(
        count(&w, PLAYER, UnitKind::Scythe),
        1,
        "and the Needle comes out"
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
        Err("Population full. Build a Sunpetal.".to_string())
    );
}

// ---------------- no Vael warp-in ----------------

/// A Vael Kiln at (20,30) with a Spire beside it, and a forward Spire at (40,30), on open ground.
fn kiln_and_forward_spire() -> (World, Id, (f64, f64)) {
    let mut w = rich_vael(5);
    flatten(&mut w, 12..52, 12..52);
    w.make_building(BldgKind::Spire, PLAYER, 20, 26, true);
    let kiln = w.make_building(BldgKind::Kiln, PLAYER, 20, 30, true);
    let fwd = w.make_building(BldgKind::Spire, PLAYER, 40, 30, true);
    let at = w.bldg(fwd).map(|f| (f.x + 64.0, f.y)).unwrap();
    (w, kiln, at)
}

/// Runs until `kind` appears for the player; returns it.
fn trained(w: &mut World, kind: UnitKind) -> Id {
    let before: Vec<Id> = w.units.iter().map(|u| u.id).collect();
    for _ in 0..30 * 60 {
        w.step();
        if let Some(u) = w
            .units
            .iter()
            .find(|u| u.kind == kind && u.team == PLAYER && !before.contains(&u.id))
        {
            return u.id;
        }
    }
    panic!("no {kind:?} trained");
}

#[test]
fn a_vael_unit_steps_out_at_its_factory_even_with_a_rally_by_a_sunpetal() {
    // Before Roster v2 a unit warped in at a rally point inside a power field; there are no fields now: it comes out
    // beside its Cradle, at once able to act, and walks to the rally.
    let (mut w, kiln, at) = kiln_and_forward_spire();
    w.set_rally(kiln, at.0, at.1, None);
    w.queue_unit(kiln, UnitKind::Scythe).unwrap();
    w.queue_unit(kiln, UnitKind::Scythe).unwrap();
    let s = trained(&mut w, UnitKind::Scythe);
    let (k, u) = (w.bldg(kiln).unwrap(), w.unit(s).unwrap());
    assert!(
        ((u.x - k.x).powi(2) + (u.y - k.y).powi(2)).sqrt() < 4.0 * 32.0,
        "beside the Cradle, not at the forward Sunpetal: ({}, {})",
        u.x,
        u.y
    );
    run(&mut w, 15);
    let u = w.unit(s).unwrap();
    assert!(
        ((u.x - at.0).powi(2) + (u.y - at.1).powi(2)).sqrt() < 3.0 * 32.0,
        "it walked to its rally: ({}, {})",
        u.x,
        u.y
    );
    let b = trained(&mut w, UnitKind::Scythe);
    let (k, u) = (w.bldg(kiln).unwrap(), w.unit(b).unwrap());
    assert!(
        ((u.x - k.x).powi(2) + (u.y - k.y).powi(2)).sqrt() < 4.0 * 32.0,
        "nor the next one"
    );
}

#[test]
fn units_step_out_beside_the_factory_otherwise() {
    // A rally far off: the unit comes out beside the Kiln, no warp.
    let (mut w, kiln, at) = kiln_and_forward_spire();
    w.set_rally(kiln, at.0 + 12.0 * 32.0, at.1, None);
    w.queue_unit(kiln, UnitKind::Scythe).unwrap();
    let s = trained(&mut w, UnitKind::Scythe);
    let (k, u) = (w.bldg(kiln).unwrap(), w.unit(s).unwrap());
    assert!(((u.x - k.x).powi(2) + (u.y - k.y).powi(2)).sqrt() < 4.0 * 32.0);
    // Nor do the headquarters' workers.
    let core = w
        .bldgs
        .iter()
        .find(|b| b.team == PLAYER && b.kind.def().hq)
        .unwrap()
        .id;
    let c = w.bldg(core).unwrap();
    let (cx, cy) = (c.x + 3.0 * 32.0, c.y);
    w.set_rally(core, cx, cy, None);
    w.queue_unit(core, UnitKind::Lumen).unwrap();
    let l = trained(&mut w, UnitKind::Lumen);
    let (k, u) = (w.bldg(core).unwrap(), w.unit(l).unwrap());
    assert!(((u.x - k.x).powi(2) + (u.y - k.y).powi(2)).sqrt() < 4.0 * 32.0);
    // Nor do the Humans' units.
    let mut h = rich(5);
    flatten(&mut h, 12..52, 12..52);
    let rax = h.make_building(BldgKind::Barracks, PLAYER, 20, 30, true);
    let r = h.bldg(rax).unwrap();
    let (rx, ry) = (r.x + 8.0 * 32.0, r.y);
    h.set_rally(rax, rx, ry, None);
    h.queue_unit(rax, UnitKind::Trooper).unwrap();
    let t = trained(&mut h, UnitKind::Trooper);
    let (k, u) = (h.bldg(rax).unwrap(), h.unit(t).unwrap());
    assert!(((u.x - k.x).powi(2) + (u.y - k.y).powi(2)).sqrt() < 4.0 * 32.0);
}

/// Ticks a lone builder at work takes to raise a `kind` for the player (from its first progress to done).
fn ticks_to_build(w: &mut World, kind: BldgKind) -> u32 {
    let h = harvesters(w, PLAYER)[0];
    let (tx, ty) = spot(w, kind);
    let b = w.place_building(PLAYER, kind, tx, ty, Some(h)).unwrap();
    let mut ticks = 0;
    for _ in 0..30 * 120 {
        w.step();
        let bd = w.bldg(b).unwrap();
        if bd.progress > 0.0 {
            ticks += 1;
        }
        if bd.done {
            return ticks;
        }
    }
    panic!("{kind:?} not built");
}

#[test]
fn rapid_construction_raises_human_buildings_a_quarter_faster() {
    // A Garrison takes its 40 s without the tech, 40 / 1.25 = 32 s with it.
    let plain = ticks_to_build(&mut rich(5), BldgKind::Barracks);
    let mut w = rich(5);
    w.upgrades[PLAYER as usize][Upgrade::RapidConstruction.index()] = 1;
    let fast = ticks_to_build(&mut w, BldgKind::Barracks);
    let build = BldgKind::Barracks.def().build;
    assert!(
        (plain as f64 - build * TPS as f64).abs() <= 1.0,
        "{plain} ticks without"
    );
    assert!(
        (fast as f64 - build / TECH_BUILD * TPS as f64).abs() <= 1.0,
        "{fast} ticks with Rapid Construction ({plain} without)"
    );
    assert_eq!(
        w.bldgs.iter().filter(|b| b.done && b.hp < b.maxhp).count(),
        0,
        "and it stands at full health"
    );
}

#[test]
fn rapid_construction_costs_what_the_table_says_and_speed_up_sites_already_rising() {
    let up = Upgrade::RapidConstruction;
    assert_eq!(up.levels(), 1, "a one-level tech");
    let mut w = rich(5);
    let h = harvesters(&w, PLAYER);
    let (rx, ry) = spot(&w, BldgKind::Barracks);
    let rax = w.make_building(BldgKind::Barracks, PLAYER, rx, ry, true);
    assert!(
        w.start_research(rax, up).is_err(),
        "researched at the Foundry only"
    );
    let (fx, fy) = spot(&w, BldgKind::Forge);
    let forge = w.make_building(BldgKind::Forge, PLAYER, fx, fy, true);
    // A second Core going up (75 s) while the Foundry researches.
    let (tx, ty) = spot(&w, BldgKind::Core);
    let site = w
        .place_building(PLAYER, BldgKind::Core, tx, ty, Some(h[0]))
        .unwrap();
    run(&mut w, 10);
    let step = |w: &mut World| {
        let p = w.bldg(site).unwrap().progress;
        w.step();
        w.bldg(site).unwrap().progress - p
    };
    let before = step(&mut w);
    assert!(before > 0.0, "the builder is at work");
    let res = w.res[PLAYER as usize];
    w.start_research(forge, up).unwrap();
    let cost = up.cost(1);
    assert_eq!(
        w.res[PLAYER as usize],
        [res[0] - cost[0], res[1] - cost[1]],
        "it costs {cost:?}"
    );
    run(&mut w, up.time(1) as u32 - 1);
    assert_eq!(w.upgrades[PLAYER as usize][up.index()], 0, "not yet");
    assert!(
        (step(&mut w) - before).abs() < 1e-12,
        "same pace until then"
    );
    run(&mut w, 2);
    assert_eq!(
        w.upgrades[PLAYER as usize][up.index()],
        1,
        "researched in {} s",
        up.time(1)
    );
    assert!(!w.bldg(site).unwrap().done, "the Core is still going up");
    let after = step(&mut w);
    assert!(
        (after / before - TECH_BUILD).abs() < 1e-9,
        "the site already rising goes up {TECH_BUILD} times as fast: {before} -> {after}"
    );
    assert!(
        w.start_research(forge, up).is_err(),
        "and it is done for good"
    );
}

#[test]
fn rapid_construction_is_human_only_and_per_side() {
    // No Vael building researches it.
    assert!(
        BLDG_KINDS.iter().all(
            |k| !k.def().researches.contains(&Upgrade::RapidConstruction) || HUMANS.builds(*k)
        ),
        "researched by the Humans only"
    );
    // The Vael player's Spire grows in its own time while the Human side has the tech.
    let mut w = rich_vael(4242);
    w.upgrades[ENEMY as usize][Upgrade::RapidConstruction.index()] = 1;
    let l = harvesters(&w, PLAYER);
    let (tx, ty) = spot(&w, BldgKind::Spire);
    let site = w
        .place_building(PLAYER, BldgKind::Spire, tx, ty, Some(l[0]))
        .unwrap();
    let mut grown = 0;
    for _ in 0..30 * 60 {
        w.step();
        let b = w.bldg(site).unwrap();
        if b.progress > 0.0 {
            grown += 1;
        }
        if b.done {
            break;
        }
    }
    let build = BldgKind::Spire.def().build * TPS as f64;
    assert!(
        (grown as f64 - build).abs() <= 1.0,
        "{grown} ticks, its build time {build}"
    );
}
