//! Gameplay tests: the whole tech tree can be built and trained, construction can be interrupted and resumed,
//! ether can be mined, supply and refunds behave, turrets defend, and a long randomized run (random orders,
//! including stale and nonsense ids, across many seeds) never breaks the world's invariants.

use endfall_sim::data::Upgrade;
use endfall_sim::data::*;
use endfall_sim::map::Id;
#[allow(unused_imports)]
use endfall_sim::world::{BUILDER_PATIENCE, REPAIR_COST};
use endfall_sim::world::{Phase, Task, Unit, World};
use endfall_sim::{Game, Mulberry32};

const TPS: u32 = 30;

fn run(w: &mut World, secs: u32) {
    for _ in 0..secs * TPS {
        w.step();
    }
}

fn harvesters(w: &World, team: u8) -> Vec<Id> {
    w.units
        .iter()
        .filter(|u| u.team == team && u.kind == UnitKind::Harvester)
        .map(|u| u.id)
        .collect()
}

fn core(w: &World, team: u8) -> (i32, i32) {
    let c = w
        .bldgs
        .iter()
        .find(|b| b.team == team && b.kind == BldgKind::Core)
        .expect("core");
    (c.tx, c.ty)
}

/// A free spot for `kind` in rings around the player's core.
fn spot(w: &World, kind: BldgKind) -> (i32, i32) {
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
fn build(w: &mut World, kind: BldgKind, builder: Id, limit: u32) -> Id {
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

fn player_vent(w: &World) -> (i32, i32) {
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
fn rich(seed: u32) -> World {
    let mut w = World::new(seed, 1);
    w.disable_ai();
    w.res[PLAYER as usize] = [20_000, 20_000];
    w
}

fn count(w: &World, team: u8, kind: UnitKind) -> usize {
    w.units
        .iter()
        .filter(|u| u.team == team && u.kind == kind)
        .count()
}

#[test]
fn every_building_and_unit_can_be_made() {
    for seed in [1, 7, 4242] {
        let mut w = rich(seed);
        let h = harvesters(&w, PLAYER);
        let depot = build(&mut w, BldgKind::Depot, h[0], 90);
        let rax = build(&mut w, BldgKind::Barracks, h[1], 120);
        let forge = build(&mut w, BldgKind::Forge, h[2], 120);
        let _turret = build(&mut w, BldgKind::Turret, h[3], 90);
        let _ext = build(&mut w, BldgKind::Extractor, h[0], 90);
        let _second_core = build(&mut w, BldgKind::Core, h[1], 150);
        let airfield = build(&mut w, BldgKind::Airfield, h[2], 150);
        assert!(w.bldg(depot).unwrap().done);
        let core_id = w
            .bldgs
            .iter()
            .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
            .unwrap()
            .id;
        let before = [
            count(&w, PLAYER, UnitKind::Harvester),
            count(&w, PLAYER, UnitKind::Trooper),
            count(&w, PLAYER, UnitKind::Vanguard),
        ];
        w.queue_unit(core_id, UnitKind::Harvester).unwrap();
        w.queue_unit(rax, UnitKind::Trooper).unwrap();
        w.queue_unit(forge, UnitKind::Vanguard).unwrap();
        w.queue_unit(rax, UnitKind::Lancer).unwrap();
        w.queue_unit(rax, UnitKind::Medic).unwrap();
        w.queue_unit(airfield, UnitKind::Wasp).unwrap();
        run(&mut w, 70);
        for k in [UnitKind::Lancer, UnitKind::Medic, UnitKind::Wasp] {
            assert_eq!(count(&w, PLAYER, k), 1, "seed {seed}: {k:?} trained");
        }
        assert_eq!(
            count(&w, PLAYER, UnitKind::Harvester),
            before[0] + 1,
            "seed {seed}: harvester trained"
        );
        assert_eq!(
            count(&w, PLAYER, UnitKind::Trooper),
            before[1] + 1,
            "seed {seed}: trooper trained"
        );
        assert_eq!(
            count(&w, PLAYER, UnitKind::Vanguard),
            before[2] + 1,
            "seed {seed}: vanguard trained"
        );
    }
}

#[test]
fn forge_and_turret_need_a_finished_barracks() {
    let mut w = rich(3);
    let h = harvesters(&w, PLAYER);
    for kind in [BldgKind::Forge, BldgKind::Turret] {
        let (tx, ty) = spot(&w, kind);
        assert_eq!(
            w.place_building(PLAYER, kind, tx, ty, Some(h[0])),
            Err("Requires Barracks".to_string())
        );
    }
    let (tx, ty) = spot(&w, BldgKind::Barracks);
    let rax = w
        .place_building(PLAYER, BldgKind::Barracks, tx, ty, Some(h[1]))
        .unwrap();
    assert!(
        !w.has_req(PLAYER, BldgKind::Forge),
        "an unfinished barracks does not count"
    );
    while !w.bldg(rax).unwrap().done {
        w.step();
    }
    assert!(w.has_req(PLAYER, BldgKind::Forge) && w.has_req(PLAYER, BldgKind::Turret));
}

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
fn a_turret_shoots_enemies_in_range() {
    let mut w = rich(13);
    let (tx, ty) = spot(&w, BldgKind::Turret);
    w.make_building(BldgKind::Turret, PLAYER, tx, ty, true);
    let (x, y) = ((tx as f64 + 1.0) * TILE + 150.0, (ty as f64 + 1.0) * TILE);
    let foe = w.make_unit(UnitKind::Trooper, ENEMY, x, y);
    w.hold_unit(foe);
    run(&mut w, 10);
    assert!(
        w.unit(foe).is_none_or(|u| u.hp < u.maxhp),
        "the turret hit the intruder"
    );
}

#[test]
fn the_ai_finishes_games_on_every_difficulty() {
    for diff in 0..3 {
        for seed in [2u32, 99] {
            let mut w = World::new(seed, diff);
            for _ in 0..30 * 60 * 15 {
                if w.over {
                    break;
                }
                w.step();
            }
            assert!(
                w.over && w.winner == ENEMY as i32,
                "diff {diff} seed {seed}: AI should beat an idle player in 15 min"
            );
        }
    }
}

#[test]
fn only_own_harvesters_build_and_buildings_train_only_their_units() {
    let mut w = rich(17);
    let h = harvesters(&w, PLAYER);
    let (tx, ty) = spot(&w, BldgKind::Barracks);
    let rax = w
        .place_building(PLAYER, BldgKind::Barracks, tx, ty, None)
        .unwrap();
    let trooper = w.make_unit(UnitKind::Trooper, PLAYER, 300.0, 1700.0);
    let foe = w.make_unit(UnitKind::Harvester, ENEMY, 300.0, 1700.0);
    assert!(!w.start_build(trooper, rax), "troopers do not build");
    assert!(
        !w.start_build(foe, rax),
        "the enemy does not build our barracks"
    );
    assert_eq!(
        w.queue_unit(rax, UnitKind::Trooper),
        Err("Barracks cannot train that".into()),
        "not before it is finished"
    );
    assert!(w.start_build(h[0], rax));
    while !w.bldg(rax).unwrap().done {
        w.step();
    }
    assert!(
        w.queue_unit(rax, UnitKind::Vanguard).is_err(),
        "a barracks does not train vanguards"
    );
    assert!(w.queue_unit(rax, UnitKind::Trooper).is_ok());
    let depot = build(&mut w, BldgKind::Depot, h[1], 90);
    assert!(
        w.queue_unit(depot, UnitKind::Trooper).is_err(),
        "a depot trains nothing"
    );
}

#[test]
fn the_game_api_ignores_orders_for_the_other_side() {
    let mut g = Game::new(21, 1);
    let foe = g
        .world()
        .units
        .iter()
        .find(|u| u.team == ENEMY)
        .unwrap()
        .clone();
    let core = g.world().bldgs.iter().find(|b| b.team == ENEMY).unwrap().id;
    g.move_to(foe.id, 10.0, 10.0);
    g.stop_unit(foe.id);
    g.repair(foe.id, core);
    assert_eq!(
        g.world().unit(foe.id).unwrap().task,
        foe.task,
        "enemy unit untouched"
    );
    assert_eq!(g.queue_unit(core, "harvester"), "Not yours");
    assert!(g.place_building(ENEMY, "depot", 50, 12, 0).contains("team"));
}

#[test]
fn a_walled_in_builder_gives_up_instead_of_waiting_forever() {
    let mut w = rich(23);
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

// ---------------- flyers, anti-air and healing ----------------

/// A quiet world with no starting units, for duels.
fn arena(seed: u32) -> World {
    let mut w = World::new(seed, 1);
    w.disable_ai();
    w.units.clear();
    w.recalc_supply(PLAYER);
    w.recalc_supply(ENEMY);
    w
}

#[test]
fn flyers_cross_cliffs_in_a_straight_line() {
    let mut w = arena(4242);
    // Find a straight segment whose middle crosses rock.
    let mut found = None;
    'search: for y in 4..60 {
        for x in 4..50 {
            let blocked_mid = (x + 4..x + 9).any(|xx| w.map.rock[(y * MW + xx) as usize] != 0);
            if !w.map.blocked(x, y) && !w.map.blocked(x + 13, y) && blocked_mid {
                found = Some((x, y));
                break 'search;
            }
        }
    }
    let (x, y) = found.expect("a cliff to fly over");
    let (sx, sy, tx) = (
        x as f64 * TILE + 16.0,
        y as f64 * TILE + 16.0,
        (x + 13) as f64 * TILE + 16.0,
    );
    let wasp = w.make_unit(UnitKind::Wasp, PLAYER, sx, sy);
    w.move_to(wasp, tx, sy);
    let mut over_rock = false;
    let secs = (tx - sx) / UnitKind::Wasp.def().speed + 1.0;
    for _ in 0..(secs * TPS as f64) as u32 {
        w.step();
        let u = w.unit(wasp).unwrap();
        let (cx, cy) = World::tile_of(u.x, u.y);
        over_rock |= w.map.rock[(cy * MW + cx) as usize] != 0;
        assert!((u.y - sy).abs() < 1.0, "flies straight");
    }
    assert!(over_rock, "it flew over rock");
    assert!(
        (w.unit(wasp).unwrap().x - tx).abs() < 40.0,
        "arrived in straight-line time"
    );
}

#[test]
fn ground_only_weapons_cannot_touch_flyers() {
    let mut w = arena(7);
    let van = w.make_unit(UnitKind::Vanguard, PLAYER, 600.0, 900.0);
    let wasp = w.make_unit(UnitKind::Wasp, ENEMY, 680.0, 900.0);
    w.attack_ent(van, wasp);
    assert_eq!(
        w.unit(van).unwrap().task,
        Task::Idle,
        "an order to shoot a flyer is refused"
    );
    w.hold_unit(wasp); // the wasp just hovers; it would shoot the vanguard if attacked? no: it is on hold and in range
    run(&mut w, 8);
    let v = w.unit(van).unwrap();
    assert!(
        !matches!(v.task, Task::Attack { .. }),
        "the vanguard neither auto-targets nor retaliates against the wasp"
    );
    assert!(
        w.unit(wasp).is_some_and(|u| u.hp == u.maxhp),
        "and never hurts it"
    );
}

#[test]
fn lancers_troopers_and_turrets_shoot_flyers_down() {
    for shooter in ["lancer", "trooper", "turret"] {
        let mut w = arena(9);
        match shooter {
            "turret" => {
                w.make_building(BldgKind::Turret, PLAYER, 20, 30, true);
            }
            k => {
                w.make_unit(
                    UnitKind::parse(k).unwrap(),
                    PLAYER,
                    21.0 * TILE,
                    31.0 * TILE,
                );
            }
        }
        // The wasp hovers just outside its own reach; anything that can hit the air should bring it down.
        let wasp = w.make_unit(UnitKind::Wasp, ENEMY, 21.0 * TILE + 170.0, 31.0 * TILE);
        w.hold_unit(wasp);
        run(&mut w, 40);
        assert!(w.unit(wasp).is_none(), "{shooter} shot the wasp down");
    }
}

#[test]
fn a_lancer_beats_a_wasp_up_close() {
    let mut w = arena(10);
    let lancer = w.make_unit(UnitKind::Lancer, PLAYER, 600.0, 900.0);
    let wasp = w.make_unit(UnitKind::Wasp, ENEMY, 660.0, 900.0);
    w.attack_ent(wasp, lancer);
    run(&mut w, 20);
    assert!(
        w.unit(wasp).is_none() && w.unit(lancer).is_some(),
        "anti-air wins its duel"
    );
}

#[test]
fn medics_heal_infantry_but_not_machines() {
    let mut w = arena(11);
    let medic = w.make_unit(UnitKind::Medic, PLAYER, 600.0, 900.0);
    let trooper = w.make_unit(UnitKind::Trooper, PLAYER, 630.0, 900.0);
    let van = w.make_unit(UnitKind::Vanguard, PLAYER, 600.0, 940.0);
    for (id, hp) in [(trooper, 10.0), (van, 50.0)] {
        w.units.iter_mut().find(|u| u.id == id).unwrap().hp = hp;
    }
    let _ = medic;
    run(&mut w, 10);
    assert_eq!(
        w.unit(trooper).unwrap().hp,
        w.unit(trooper).unwrap().maxhp,
        "trooper healed to full"
    );
    assert_eq!(w.unit(van).unwrap().hp, 50.0, "vanguards are machines");
}

#[test]
fn medics_walk_to_hurt_infantry_they_can_see() {
    let mut w = arena(12);
    let medic = w.make_unit(UnitKind::Medic, PLAYER, 600.0, 900.0);
    let trooper = w.make_unit(UnitKind::Trooper, PLAYER, 780.0, 900.0);
    w.units.iter_mut().find(|u| u.id == trooper).unwrap().hp = 5.0;
    run(&mut w, 15);
    assert!(
        w.unit(trooper).unwrap().hp > 40.0,
        "the medic came over and healed"
    );
    assert!(w.unit(medic).unwrap().x > 650.0);
}

#[test]
fn medics_need_a_forge_and_airfields_need_a_forge() {
    let mut w = rich(13);
    let h = harvesters(&w, PLAYER);
    let rax = build(&mut w, BldgKind::Barracks, h[0], 120);
    assert_eq!(
        w.queue_unit(rax, UnitKind::Medic),
        Err("Requires War Forge".into())
    );
    let (tx, ty) = spot(&w, BldgKind::Airfield);
    assert_eq!(
        w.place_building(PLAYER, BldgKind::Airfield, tx, ty, Some(h[1])),
        Err("Requires War Forge".into())
    );
    build(&mut w, BldgKind::Forge, h[1], 120);
    assert!(w.queue_unit(rax, UnitKind::Medic).is_ok());
}

#[test]
fn walkers_and_flyers_pass_under_and_over_each_other() {
    let mut w = arena(14);
    let wasp = w.make_unit(UnitKind::Wasp, PLAYER, 700.0, 900.0);
    w.hold_unit(wasp);
    let trooper = w.make_unit(UnitKind::Trooper, PLAYER, 600.0, 900.0);
    w.move_to(trooper, 800.0, 900.0);
    run(&mut w, 4);
    let (tx, wx) = (w.unit(trooper).unwrap().x, w.unit(wasp).unwrap().x);
    assert!(tx > 760.0, "the trooper walked under the wasp: {tx}");
    assert_eq!(wx, 700.0, "and did not push it");
}

#[test]
fn units_sent_onto_a_building_stop_beside_it() {
    let mut w = arena(15);
    let core = w.bldgs.iter().find(|b| b.team == PLAYER).unwrap().clone(); // our own: nothing to attack
    let trooper = w.make_unit(UnitKind::Trooper, PLAYER, core.x - 200.0, core.y + 150.0);
    let medic = w.make_unit(UnitKind::Medic, PLAYER, core.x - 220.0, core.y + 150.0);
    w.move_to(trooper, core.x, core.y);
    w.attack_move(medic, core.x, core.y);
    run(&mut w, 20);
    assert_eq!(
        w.unit(trooper).unwrap().task,
        Task::Idle,
        "a move onto a building ends beside it"
    );
    assert_eq!(
        w.unit(medic).unwrap().task,
        Task::Idle,
        "so does an attack-move by an unarmed unit"
    );
}

#[test]
fn the_ai_keeps_training_troopers_when_short_of_ether() {
    let mut w = World::new(31, 1);
    run(&mut w, 150);
    let id = w.make_unit(UnitKind::Wasp, PLAYER, 60.0, 60.0); // a flyer far away makes it want Lancers
    w.hold_unit(id);
    let before = count(&w, ENEMY, UnitKind::Trooper);
    for _ in 0..90 * TPS {
        w.res[ENEMY as usize][1] = 0; // no ether at all
        w.step();
    }
    assert!(
        count(&w, ENEMY, UnitKind::Trooper) > before + 2,
        "barracks fall back to Troopers"
    );
}

#[test]
fn the_ai_answers_flyers_with_lancers() {
    let mut w = World::new(31, 0); // Easy: its first attack comes late enough to watch it react
    run(&mut w, 150); // let it build a barracks
    let (cx, cy) = core(&w, ENEMY);
    for k in 0..3 {
        // parked by the AI's core, where it can see them
        let id = w.make_unit(
            UnitKind::Wasp,
            PLAYER,
            (cx as f64 - 3.0) * TILE - k as f64 * 30.0,
            (cy as f64 + 6.0) * TILE,
        );
        w.hold_unit(id);
    }
    run(&mut w, 80);
    assert!(!w.over, "the game is still on");
    assert!(
        count(&w, ENEMY, UnitKind::Lancer) > 0
            || w.bldgs
                .iter()
                .any(|b| b.team == ENEMY && b.queue.contains(&UnitKind::Lancer)),
        "AI trains lancers against flyers"
    );
}

#[test]
fn the_ai_only_reacts_to_flyers_it_has_seen() {
    let mut w = World::new(31, 0);
    run(&mut w, 150);
    // A wasp hiding in the top-left corner, far from anything the AI has looked at.
    let wasp = w.make_unit(UnitKind::Wasp, PLAYER, 40.0, 40.0);
    w.hold_unit(wasp);
    run(&mut w, 40);
    assert_eq!(
        count(&w, ENEMY, UnitKind::Lancer),
        0,
        "no lancers against a flyer it cannot see"
    );
    assert!(
        !w.bldgs
            .iter()
            .any(|b| b.team == ENEMY && b.queue.contains(&UnitKind::Lancer))
    );
    // Now fly it into view.
    let (cx, cy) = core(&w, ENEMY);
    w.move_to(wasp, (cx as f64 - 3.0) * TILE, (cy as f64 + 6.0) * TILE);
    run(&mut w, 40);
    assert!(
        count(&w, ENEMY, UnitKind::Lancer) > 0
            || w.bldgs
                .iter()
                .any(|b| b.team == ENEMY && b.queue.contains(&UnitKind::Lancer)),
        "lancers once it has seen the flyer"
    );
}

#[test]
fn the_ai_scouts_the_player_base_early() {
    let mut w = World::new(41, 1);
    let (px, py) = core(&w, PLAYER);
    run(&mut w, 150);
    let seen = (0..4).any(|dy| {
        (0..4).any(|dx| w.explored[ENEMY as usize][((py + dy) * MW + px + dx) as usize] != 0)
    });
    assert!(seen, "the AI has looked at the player's core");
    // The scout goes back to mining at home, not at the player's fields.
    run(&mut w, 90);
    let (cx, cy) = ((px as f64 + 2.0) * TILE, (py as f64 + 2.0) * TILE);
    let poaching = w
        .units
        .iter()
        .filter(|u| u.team == ENEMY && u.kind == UnitKind::Harvester)
        .filter(|u| match u.task {
            Task::Gather { node, .. } => w
                .map
                .node(node)
                .is_some_and(|n| ((n.x - cx).powi(2) + (n.y - cy).powi(2)).sqrt() < 800.0),
            _ => false,
        })
        .count();
    assert_eq!(poaching, 0, "no AI harvester mines by the player's base");
}

#[test]
fn ai_wasps_raid_the_players_harvesters() {
    let mut w = World::new(43, 1);
    run(&mut w, 120); // scouting done
    // A soldier stands among the player's harvesters: the raiders go for the harvesters anyway.
    let mine: Vec<&Unit> = w
        .units
        .iter()
        .filter(|u| u.team == PLAYER && u.kind == UnitKind::Harvester)
        .collect();
    let n = mine.len() as f64;
    let (mx, my) = (
        mine.iter().map(|u| u.x).sum::<f64>() / n,
        mine.iter().map(|u| u.y).sum::<f64>() / n,
    );
    let guard = w.make_unit(UnitKind::Vanguard, PLAYER, mx, my);
    w.hold_unit(guard);
    let (cx, cy) = core(&w, ENEMY);
    for k in 0..3 {
        w.make_unit(
            UnitKind::Wasp,
            ENEMY,
            (cx as f64 + 2.0) * TILE + k as f64 * 30.0,
            (cy as f64 + 6.0) * TILE,
        );
    }
    let hp = |w: &World| {
        w.units
            .iter()
            .filter(|u| u.team == PLAYER && u.kind == UnitKind::Harvester)
            .map(|u| u.hp)
            .sum::<f64>()
    };
    let before = hp(&w);
    // Until the harvesters have taken a beating, the guard is left alone.
    for _ in 0..60 * TPS {
        w.step();
        if before - hp(&w) >= 100.0 {
            break;
        }
    }
    let lost = before - hp(&w);
    assert!(
        lost >= 100.0,
        "the raid hurt the player's harvesters: {lost}"
    );
    let g = w.unit(guard).unwrap();
    assert_eq!(g.hp, g.maxhp, "the raiders went for the harvesters first");
}

#[test]
fn hurt_wasps_stay_home_and_healthy_ones_raid() {
    let mut w = World::new(43, 1);
    run(&mut w, 120);
    let (cx, cy) = core(&w, ENEMY);
    let at = |k: i32| {
        (
            (cx as f64 + 2.0) * TILE + k as f64 * 30.0,
            (cy as f64 + 6.0) * TILE,
        )
    };
    // Four hurt wasps first (lower ids), then two healthy ones.
    let hurt: Vec<Id> = (0..4)
        .map(|k| {
            let (x, y) = at(k);
            let id = w.make_unit(UnitKind::Wasp, ENEMY, x, y);
            w.units.iter_mut().find(|u| u.id == id).unwrap().hp = 25.0;
            id
        })
        .collect();
    let fit: Vec<Id> = (4..6)
        .map(|k| {
            let (x, y) = at(k);
            w.make_unit(UnitKind::Wasp, ENEMY, x, y)
        })
        .collect();
    let home = ((cx as f64 + 2.0) * TILE, (cy as f64 + 2.0) * TILE);
    let away = |w: &World, id: Id| {
        w.unit(id).map_or(0.0, |u| {
            ((u.x - home.0).powi(2) + (u.y - home.1).powi(2)).sqrt()
        })
    };
    run(&mut w, 30);
    for &h in &hurt {
        assert!(away(&w, h) < 500.0, "hurt wasp {h} stays home");
    }
    assert!(
        fit.iter().any(|&f| away(&w, f) > 900.0),
        "the healthy wasps went raiding"
    );
}

#[test]
fn the_ai_expands_to_a_second_base() {
    let mut w = World::new(33, 1);
    let c = w
        .bldgs
        .iter_mut()
        .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
        .unwrap();
    c.hp = 1e9;
    c.maxhp = 1e9;
    run(&mut w, 720);
    let cores: Vec<_> = w
        .bldgs
        .iter()
        .filter(|b| b.team == ENEMY && b.kind == BldgKind::Core && b.done)
        .map(|b| (b.x, b.y))
        .collect();
    assert_eq!(cores.len(), 2, "AI has a second core by 12 min");
    let exp = cores[1];
    let working = w
        .units
        .iter()
        .filter(|u| u.team == ENEMY && matches!(u.task, Task::Gather { node, .. } if w.map.node(node).is_some_and(|n| ((n.x - exp.0).powi(2) + (n.y - exp.1).powi(2)).sqrt() < 300.0)))
        .count();
    assert!(working >= 3, "harvesters work the expansion: {working}");
}

#[test]
fn a_beaten_attack_wave_falls_back() {
    let mut w = World::new(45, 1);
    let c = w
        .bldgs
        .iter_mut()
        .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
        .unwrap();
    c.hp = 1e9;
    c.maxhp = 1e9;
    // Wait for the first wave to get well on its way.
    let (cx, cy) = core(&w, ENEMY);
    let home = ((cx as f64 + 2.0) * TILE, (cy as f64 + 2.0) * TILE);
    let away = |w: &World, id: Id| {
        w.unit(id)
            .is_some_and(|u| ((u.x - home.0).powi(2) + (u.y - home.1).powi(2)).sqrt() > 600.0)
    };
    let mut wave = Vec::new();
    for _ in 0..30 * 600 {
        w.step();
        wave = w.ai_wave().unwrap_or_default();
        if wave.len() >= 6 && wave.iter().all(|&id| away(&w, id)) {
            break;
        }
    }
    assert!(wave.len() >= 6, "a wave went out");
    // All but two die (under 40% of the wave is left).
    let doomed: Vec<Id> = wave.iter().copied().take(wave.len() - 2).collect();
    w.units.retain(|u| !doomed.contains(&u.id));
    w.recalc_supply(ENEMY);
    let survivors: Vec<Id> = wave
        .iter()
        .copied()
        .filter(|id| !doomed.contains(id))
        .collect();
    let d0: f64 = survivors
        .iter()
        .map(|&s| {
            let u = w.unit(s).unwrap();
            ((u.x - home.0).powi(2) + (u.y - home.1).powi(2)).sqrt()
        })
        .sum();
    run(&mut w, 8);
    let d1: f64 = survivors
        .iter()
        .filter_map(|&s| w.unit(s))
        .map(|u| ((u.x - home.0).powi(2) + (u.y - home.1).powi(2)).sqrt())
        .sum();
    assert!(d1 < d0 - 200.0, "survivors head home: {d0:.0} -> {d1:.0}");
}

#[test]
fn the_player_hears_about_attacks_once_per_fight() {
    use endfall_sim::world::Event;
    let mut w = arena(16);
    let mine = w.make_unit(UnitKind::Vanguard, PLAYER, 600.0, 900.0);
    w.hold_unit(mine);
    let foe = w.make_unit(UnitKind::Trooper, ENEMY, 700.0, 900.0);
    w.attack_ent(foe, mine);
    let mut alerts = 0;
    for _ in 0..8 * TPS {
        w.step();
        alerts += w
            .events
            .drain(..)
            .filter(|e| {
                matches!(
                    e,
                    Event::Attacked {
                        building: false,
                        ..
                    }
                )
            })
            .count();
    }
    assert_eq!(alerts, 1, "one alert for one ongoing fight");
    // A second fight far away alerts at once.
    let far = w.make_unit(UnitKind::Trooper, PLAYER, 1800.0, 300.0);
    w.hold_unit(far);
    let foe2 = w.make_unit(UnitKind::Trooper, ENEMY, 1860.0, 300.0);
    w.attack_ent(foe2, far);
    let mut more = 0;
    for _ in 0..3 * TPS {
        w.step();
        more += w
            .events
            .drain(..)
            .filter(|e| matches!(e, Event::Attacked { .. }))
            .count();
    }
    assert_eq!(more, 1, "a new fight elsewhere is reported");
}

#[test]
fn two_simultaneous_fights_alert_once_each() {
    use endfall_sim::world::Event;
    let mut w = arena(18);
    for (x, y) in [(500.0, 900.0), (1600.0, 400.0)] {
        let mine = w.make_unit(UnitKind::Vanguard, PLAYER, x, y);
        w.hold_unit(mine);
        let foe = w.make_unit(UnitKind::Trooper, ENEMY, x + 80.0, y);
        w.attack_ent(foe, mine);
    }
    let mut alerts = 0;
    for _ in 0..8 * TPS {
        w.step();
        alerts += w
            .events
            .drain(..)
            .filter(|e| matches!(e, Event::Attacked { .. }))
            .count();
    }
    assert_eq!(alerts, 2, "one per fight, not one per hit");
}

// ---------------- upgrades ----------------

/// A finished forge for the player in a quiet arena with plenty of resources.
fn forge_arena(seed: u32) -> (World, Id) {
    let mut w = arena(seed);
    w.res[PLAYER as usize] = [5000, 5000];
    let f = w.make_building(BldgKind::Forge, PLAYER, 20, 40, true);
    (w, f)
}

fn research_level(w: &mut World, forge: Id, up: Upgrade) {
    w.start_research(forge, up).unwrap();
    let level = w.upgrades[PLAYER as usize][up.index()] + 1;
    run(w, up.time(level) as u32 + 1);
    assert_eq!(w.upgrades[PLAYER as usize][up.index()], level);
}

/// Damage of the first hit a `shooter` lands on a target of kind `target`.
fn first_hit(w: &mut World, shooter: UnitKind, shooter_team: u8, target: UnitKind) -> f64 {
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

#[test]
fn weapons_upgrades_add_each_units_bonus() {
    let (mut w, f) = forge_arena(30);
    assert_eq!(
        first_hit(&mut w, UnitKind::Trooper, PLAYER, UnitKind::Vanguard),
        7.0 - 2.0
    );
    research_level(&mut w, f, Upgrade::Weapons);
    assert_eq!(
        first_hit(&mut w, UnitKind::Trooper, PLAYER, UnitKind::Vanguard),
        7.0 + 1.0 - 2.0,
        "Trooper +1"
    );
    assert_eq!(
        first_hit(&mut w, UnitKind::Vanguard, PLAYER, UnitKind::Vanguard),
        30.0 + 3.0 - 2.0,
        "Vanguard +3"
    );
}

#[test]
fn armor_upgrades_soak_one_more_point_per_level() {
    let (mut w, f) = forge_arena(31);
    research_level(&mut w, f, Upgrade::Armor);
    research_level(&mut w, f, Upgrade::Armor);
    assert_eq!(
        first_hit(&mut w, UnitKind::Trooper, ENEMY, UnitKind::Trooper),
        7.0 - 2.0,
        "two armor levels"
    );
    research_level(&mut w, f, Upgrade::Armor);
    assert_eq!(
        first_hit(&mut w, UnitKind::Harvester, ENEMY, UnitKind::Vanguard),
        1.0,
        "every hit does at least 1"
    );
}

#[test]
fn research_rules_and_refunds() {
    let (mut w, f) = forge_arena(32);
    let rax = w.make_building(BldgKind::Barracks, PLAYER, 26, 40, true);
    assert!(
        w.start_research(rax, Upgrade::Weapons).is_err(),
        "only at a War Forge"
    );
    let f2 = w.make_building(BldgKind::Forge, PLAYER, 20, 46, true);
    w.start_research(f, Upgrade::Weapons).unwrap();
    assert_eq!(w.res[PLAYER as usize], [4900, 4900]);
    assert!(
        w.start_research(f, Upgrade::Armor).is_err(),
        "one research per forge"
    );
    assert!(
        w.start_research(f2, Upgrade::Weapons).is_err(),
        "not the same upgrade twice at once"
    );
    w.start_research(f2, Upgrade::Armor).unwrap();
    w.cancel_research(f2);
    assert_eq!(
        w.res[PLAYER as usize],
        [4900, 4900],
        "cancel refunds in full"
    );
    // Losing the forge mid-research refunds too.
    let hp = w.bldg(f).unwrap().hp;
    let foe = w.make_unit(
        UnitKind::Vanguard,
        ENEMY,
        20.0 * TILE + 48.0,
        40.0 * TILE + 140.0,
    );
    w.units.iter_mut().find(|u| u.id == foe).unwrap().hp = 1e9; // a very determined vanguard
    w.units.iter_mut().find(|u| u.id == foe).unwrap().maxhp = 1e9;
    w.attack_ent(foe, f);
    for _ in 0..120 * TPS {
        if w.bldg(f).is_none() {
            break;
        }
        w.step();
    }
    let _ = hp;
    assert!(w.bldg(f).is_none(), "the forge fell");
    w.units.retain(|u| u.id != foe); // and the vanguard goes home before it finds the other forge
    assert_eq!(
        w.res[PLAYER as usize],
        [5000, 5000],
        "its research was refunded"
    );
    for _ in 0..3 {
        research_level(&mut w, f2, Upgrade::Weapons);
    }
    assert!(
        w.start_research(f2, Upgrade::Weapons).is_err(),
        "three levels at most"
    );
}

#[test]
fn the_ai_researches_upgrades_in_a_long_game() {
    let mut w = World::new(33, 1);
    // A player whose core cannot fall, so the game lasts long enough to watch the AI's later behaviour.
    let c = w
        .bldgs
        .iter_mut()
        .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
        .unwrap();
    c.hp = 1e9;
    c.maxhp = 1e9;
    let army = |w: &World| {
        w.units
            .iter()
            .filter(|u| u.team == ENEMY && u.kind != UnitKind::Harvester)
            .count()
    };
    run(&mut w, 600);
    let army_10 = army(&w);
    run(&mut w, 240);
    assert!(!w.over, "the game is still on");
    let [wl, al] = w.upgrades[ENEMY as usize];
    assert!(
        wl + al >= 1,
        "AI finished at least one upgrade by 14 min: {:?}",
        w.upgrades[1]
    );
    assert!(
        army(&w) > army_10,
        "and kept building its army while researching ({army_10} -> {})",
        army(&w)
    );
}

#[test]
fn the_ai_survives_its_building_sites_being_starved() {
    // An army camping outside the AI base kills every harvester that goes near a site under construction, so the
    // AI's watchdog eventually cancels the site. That used to crash the AI turn.
    for seed in [33, 7, 1234, 99] {
        let mut w = World::new(seed, 1);
        let c = w
            .bldgs
            .iter_mut()
            .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
            .unwrap();
        c.hp = 1e9;
        c.maxhp = 1e9;
        for _ in 0..30 * 60 * 9 {
            let sites: Vec<(f64, f64)> = w
                .bldgs
                .iter()
                .filter(|b| b.team == ENEMY && !b.done)
                .map(|b| (b.x, b.y))
                .collect();
            w.units.retain(|u| {
                !(u.team == ENEMY
                    && u.kind == UnitKind::Harvester
                    && sites
                        .iter()
                        .any(|&(x, y)| ((u.x - x).powi(2) + (u.y - y).powi(2)).sqrt() < 160.0))
            });
            w.recalc_supply(ENEMY);
            w.step();
        }
    }
}

// ---------------- randomized orders + invariants ----------------

fn check_invariants(w: &World, ctx: &str) {
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
            n.miners <= 2,
            "{ctx}: node {} has {} miners",
            n.id,
            n.miners
        );
    }
}

const KINDS_B: [&str; 8] = [
    "depot",
    "barracks",
    "extractor",
    "forge",
    "turret",
    "core",
    "airfield",
    "nonsense",
];
const KINDS_U: [&str; 7] = [
    "harvester",
    "trooper",
    "vanguard",
    "lancer",
    "medic",
    "wasp",
    "nonsense",
];

/// One random order through the same Game API the browser uses, with ids that may be stale or garbage.
fn random_order(g: &mut Game, r: &mut Mulberry32) {
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
            let _ = g.queue_unit(a, KINDS_U[r.below(7) as usize]);
        }
        9 => g.cancel_queue(a, r.below(7)),
        10 => g.set_rally(a, x, y, if r.below(2) == 0 { b } else { 0 }),
        11 => g.formation(&[a, b, pick(r)], x, y),
        12 => g.set_resources(PLAYER, r.below(3000) as i32, r.below(1000) as i32),
        13 => g.cancel_construction(a),
        14 => {
            let _ = g.research(a, ["weapons", "armor", "nonsense"][r.below(3) as usize]);
        }
        15 => g.cancel_research(a),
        16 => g.repair(a, b),
        _ => {}
    }
}

#[test]
fn random_play_never_breaks_the_world() {
    let seeds: u32 = if cfg!(debug_assertions) { 6 } else { 24 };
    for seed in 0..seeds {
        for diff in 0..3u32 {
            let mut g = Game::new(seed * 7919 + 1, diff);
            let mut r = Mulberry32::new(seed ^ 0xabcdef);
            for tick in 0..30 * 60 * 6 {
                if tick % 7 == 0 {
                    for _ in 0..1 + r.below(3) {
                        random_order(&mut g, &mut r);
                    }
                }
                g.step();
                check_invariants(g.world(), &format!("seed {seed} diff {diff} tick {tick}"));
                if g.world().over {
                    break;
                }
            }
        }
    }
}

/// The AI must beat an idle player on every map and difficulty (it once walled in its own builder on Hard and
/// then waited forever for a depot it could not build).
#[test]
fn the_ai_beats_an_idle_player_on_many_maps() {
    let maps: u32 = if cfg!(debug_assertions) { 3 } else { 40 };
    for diff in 0..3 {
        let mut slowest = (0, 0);
        for m in 0..maps {
            let seed = m * 104_729 + 3;
            let mut w = World::new(seed, diff);
            let mut t = 0;
            while !w.over && t < 30 * 60 * 20 {
                w.step();
                t += 1;
            }
            assert!(
                w.over && w.winner == ENEMY as i32,
                "diff {diff} seed {seed}: no AI win after 20 min"
            );
            slowest = slowest.max((t / 30, seed));
        }
        println!(
            "diff {diff}: slowest AI win {}s (seed {})",
            slowest.0, slowest.1
        );
    }
}

/// Put a lone player harvester at tile `from` and an unfinished `kind` at tile `site`; returns (world, unit, building).
fn lone_builder(seed: u32, from: (i32, i32), site: (i32, i32), kind: BldgKind) -> (World, Id, Id) {
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

fn builds_within(w: &mut World, h: Id, b: Id, secs: u32) -> Result<(), String> {
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

#[test]
fn builders_walking_a_long_way_around_do_not_give_up() {
    // Paths that first lead sideways or away from the site (cases a review found being abandoned).
    for (seed, from, site) in [(22, (15, 39), (57, 16)), (50, (5, 30), (6, 54))] {
        let (mut w, h, b) = lone_builder(seed, from, site, BldgKind::Barracks);
        builds_within(&mut w, h, b, 150).unwrap_or_else(|e| panic!("seed {seed}: {e}"));
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

/// Tiles reachable on foot from `from` (4-neighbour flood fill over unblocked tiles).
fn reachable(w: &World, from: (i32, i32)) -> Vec<bool> {
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
fn the_ai_hunts_down_buildings_it_has_not_seen() {
    // A passive player with a Depot hidden far from both bases: after razing the main base the AI must search
    // the map rather than stand on the empty start forever.
    for seed in [2, 33] {
        let mut w = World::new(seed, 1);
        // The open spot farthest from both starts, well away from the player's.
        let (p, e) = (core(&w, PLAYER), core(&w, ENEMY));
        let far = |t: (i32, i32)| {
            let d = |c: (i32, i32)| (t.0 - c.0).pow(2) + (t.1 - c.1).pow(2);
            d(p).min(d(e))
        };
        let hidden = (0..MH)
            .flat_map(|ty| (0..MW).map(move |tx| (tx, ty)))
            // (checked as ENEMY: the player may not build in unexplored ground, but this test cheats)
            .filter(|&(tx, ty)| w.can_place(BldgKind::Depot, tx, ty, ENEMY))
            .filter(|&(tx, ty)| (tx - p.0).pow(2) + (ty - p.1).pow(2) >= 24 * 24)
            .max_by_key(|&t| far(t))
            .unwrap();
        w.make_building(BldgKind::Depot, PLAYER, hidden.0, hidden.1, true);
        for _ in 0..1500 * TPS {
            w.step();
            if w.over {
                break;
            }
        }
        assert!(
            w.over && w.winner == ENEMY as i32,
            "seed {seed}: the AI found the hidden depot (t={:.0})",
            w.time
        );
    }
}

/// A player Depot, finished, then knocked down to `frac` of its hp; the harvesters walk off and wait (no income).
fn damaged_depot(seed: u32, frac: f64) -> (World, Id, Id) {
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
fn the_ai_repairs_its_buildings_once_the_fight_is_over() {
    let mut w = World::new(7, 1);
    let c = w
        .bldgs
        .iter_mut()
        .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
        .unwrap();
    c.hp = 1e9;
    c.maxhp = 1e9;
    run(&mut w, 200);
    let (id, max) = w
        .bldgs
        .iter()
        .find(|b| b.team == ENEMY && b.done && b.kind == BldgKind::Depot)
        .map(|b| (b.id, b.maxhp))
        .expect("the AI has a depot");
    w.bldgs.iter_mut().find(|b| b.id == id).unwrap().hp = (max * 0.3).round();
    run(&mut w, 45);
    let hp = w.bldg(id).map_or(0.0, |b| b.hp);
    // It may run short of shards before the last few hp (it spends on its army too), as a player can.
    assert!(hp > max * 0.8, "the AI repaired its depot: {hp}/{max}");
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
fn a_broke_ai_does_not_shuttle_its_repairer_back_and_forth() {
    let mut w = World::new(7, 1);
    let c = w
        .bldgs
        .iter_mut()
        .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
        .unwrap();
    c.hp = 1e9;
    c.maxhp = 1e9;
    run(&mut w, 200);
    let id = w
        .bldgs
        .iter()
        .find(|b| b.team == ENEMY && b.done && b.kind == BldgKind::Depot)
        .unwrap()
        .id;
    w.bldgs.iter_mut().find(|b| b.id == id).unwrap().hp = 50.0;
    let mut starts = 0;
    let mut was = false;
    for _ in 0..20 * TPS {
        w.res[ENEMY as usize] = [0, 0]; // broke throughout
        w.step();
        let now = w.units.iter().any(|u| u.task == (Task::Repair { b: id }));
        if now && !was {
            starts += 1;
        }
        was = now;
    }
    assert!(
        starts <= 1,
        "the AI sent a repairer {starts} times while broke"
    );
}
