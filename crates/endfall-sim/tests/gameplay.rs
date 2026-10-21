//! Gameplay tests: the whole tech tree can be built and trained, construction can be interrupted and resumed,
//! ether can be mined, supply and refunds behave, turrets defend, and a long randomized run (random orders,
//! including stale and nonsense ids, across many seeds) never breaks the world's invariants.

use endfall_sim::data::*;
use endfall_sim::map::Id;
#[allow(unused_imports)]
use endfall_sim::world::BUILDER_PATIENCE;
use endfall_sim::world::{Phase, Task, World};
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
        if w.bldg(b).is_some_and(|b| b.done) {
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
    for k in 0..3 {
        let id = w.make_unit(UnitKind::Wasp, PLAYER, 300.0 + k as f64 * 30.0, 1500.0);
        w.hold_unit(id);
    }
    run(&mut w, 120);
    assert!(
        count(&w, ENEMY, UnitKind::Lancer) > 0
            || w.bldgs
                .iter()
                .any(|b| b.team == ENEMY && b.queue.contains(&UnitKind::Lancer)),
        "AI trains lancers against flyers"
    );
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
    match r.below(15) {
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
