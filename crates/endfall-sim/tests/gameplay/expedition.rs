//! The Expedition rework (PRD: power, hired guns, the satellite): no population. Its machines use Power (the Data center
//! +20, a wind turbine +8), its Androids too; its hired guns (the Sellsword, the Bruiser, the Medic) take hired places,
//! six a Recruiting post, one count for the side. Power and hired places each have a maximum (the balance pass: 45 and
//! 15 on 64x64, the two together the Kingdom's population limit). Launch satellite (at the Data center, once a Lab
//! stands) is told to its own seat alone and unlocks the Uplink, which unlocks the Portal: one a side, using Power from
//! the moment it is placed, where the Android, a slow and expensive elite, is made. The hired guns fight in melee. The
//! range's speed bonus and the Drone's leash: radio.rs.

use crate::common::*;

/// A rich Expedition player (seat 0) against an idle Kingdom, nobody's AI, everything explored.
fn expedition() -> World {
    let mut w = rich_vael(7);
    for e in &mut w.explored {
        e.fill(1);
    }
    w
}

fn hq(w: &World, team: u8) -> Id {
    w.bldgs
        .iter()
        .find(|b| b.team == team && b.kind.def().hq)
        .unwrap()
        .id
}

/// A finished building of `kind` for the player, set down at a free spot (a set-up, not an order).
fn set_down(w: &mut World, kind: BldgKind) -> Id {
    let (tx, ty) = spot(w, kind);
    let b = w.make_building(kind, PLAYER, tx, ty, true);
    w.recalc_supply(PLAYER);
    b
}

/// Units of `kind` for the player by its Data center (a set-up).
fn spawn(w: &mut World, kind: UnitKind, n: usize) -> Vec<Id> {
    let b = w.bldg(hq(w, PLAYER)).unwrap();
    let (x, y) = (b.x, b.y + 96.0);
    let ids = (0..n)
        .map(|i| {
            w.make_unit(
                kind,
                PLAYER,
                x + (i % 6) as f64 * 24.0,
                y + (i / 6) as f64 * 24.0,
            )
        })
        .collect();
    w.recalc_supply(PLAYER);
    ids
}

#[test]
fn the_expedition_has_power_for_machines_and_no_population() {
    let mut w = expedition();
    let bots = harvesters(&w, PLAYER).len() as i32;
    assert_eq!(
        w.pool(PLAYER, Pool::Supply),
        [bots, 20],
        "the Data center's 20 Power, the Bots' use"
    );
    assert_eq!(w.pool(PLAYER, Pool::Hired), [0, 0]);
    // A wind turbine: +8 Power, for 100 gold.
    assert_eq!(BldgKind::Spire.def().name, "Wind turbine");
    assert_eq!(BldgKind::Spire.def().cost, [100, 0]);
    let bot = harvesters(&w, PLAYER)[0];
    build(&mut w, BldgKind::Spire, bot, 60);
    assert_eq!(w.sup(PLAYER)[1], 28);
    // Every machine uses Power at its old supply, the Android three; the people none.
    for (k, p) in [
        (UnitKind::Lumen, 1),
        (UnitKind::Scythe, 2),
        (UnitKind::Monolith, 4),
        (UnitKind::Shrike, 2),
        (UnitKind::Umbra, 3),
    ] {
        assert_eq!((k.def().pool, k.def().supply), (Pool::Supply, p), "{k:?}");
    }
    for k in [UnitKind::Prism, UnitKind::Bruiser, UnitKind::Halo] {
        assert_eq!((k.def().pool, k.def().supply), (Pool::Hired, 1), "{k:?}");
    }
    // The Power cap: its own maximum (45 on 64x64).
    for _ in 0..12 {
        set_down(&mut w, BldgKind::Spire);
    }
    assert_eq!(w.sup(PLAYER)[1], 45, "Power at its maximum");
    // The Kingdom keeps its population.
    assert!(
        HUMANS
            .build_basic
            .iter()
            .chain(HUMANS.build_advanced)
            .flat_map(|b| b.def().trains.iter())
            .all(|k| k.def().pool == Pool::Supply)
    );
}

#[test]
fn a_bot_is_refused_at_the_power_cap_and_trained_once_a_turbine_stands() {
    let mut w = expedition();
    let used = w.sup(PLAYER)[0];
    spawn(&mut w, UnitKind::Lumen, (20 - used) as usize);
    assert_eq!(w.sup(PLAYER), [20, 20]);
    let dc = hq(&w, PLAYER);
    assert_eq!(
        w.queue_unit(dc, UnitKind::Lumen),
        Err("Not enough Power: build a Wind turbine.".to_string())
    );
    // Hired places and Power are apart: a full Power pool does not stop a Sellsword.
    let post = set_down(&mut w, BldgKind::Siphon);
    assert_eq!(w.queue_unit(post, UnitKind::Prism), Ok(()));
    let bot = harvesters(&w, PLAYER)[0];
    build(&mut w, BldgKind::Spire, bot, 60);
    assert_eq!(w.queue_unit(dc, UnitKind::Lumen), Ok(()));
    assert_eq!(w.sup(PLAYER), [21, 28]);
    let before = count(&w, PLAYER, UnitKind::Lumen);
    run(&mut w, 15);
    assert_eq!(count(&w, PLAYER, UnitKind::Lumen), before + 1, "trained");
}

#[test]
fn hired_places_six_a_post_one_count_and_a_death_frees_one() {
    let mut w = expedition();
    let a = set_down(&mut w, BldgKind::Siphon);
    assert_eq!(w.pool(PLAYER, Pool::Hired), [0, 6], "six places a post");
    let power = w.sup(PLAYER);
    let hired = spawn(&mut w, UnitKind::Prism, 4);
    set_down(&mut w, BldgKind::Loom);
    spawn(&mut w, UnitKind::Bruiser, 1);
    assert_eq!(w.queue_unit(a, UnitKind::Prism), Ok(()));
    assert_eq!(
        w.pool(PLAYER, Pool::Hired),
        [6, 6],
        "one place each, queued too"
    );
    assert_eq!(w.sup(PLAYER), power, "no Power for people");
    assert_eq!(
        w.queue_unit(a, UnitKind::Bruiser),
        Err("No free places: build another Recruiting post.".to_string())
    );
    // A death frees a place, whichever post hired it.
    w.damage(hired[0], 1e9, None);
    assert_eq!(w.pool(PLAYER, Pool::Hired), [5, 6]);
    assert_eq!(w.queue_unit(a, UnitKind::Prism), Ok(()));
    assert!(w.queue_unit(a, UnitKind::Prism).is_err(), "full again");
    // A second post: six more for the one count, and either post hires.
    let b = set_down(&mut w, BldgKind::Siphon);
    assert_eq!(w.pool(PLAYER, Pool::Hired), [6, 12]);
    assert_eq!(w.queue_unit(b, UnitKind::Prism), Ok(()));
    assert_eq!(w.queue_unit(a, UnitKind::Prism), Ok(()));
    assert_eq!(w.pool(PLAYER, Pool::Hired), [8, 12]);
    // A post lost: the count falls under its use; nothing more is hired until enough fall, nobody is taken away.
    // (the Sellsword queued there goes with it)
    w.damage(b, 1e9, None);
    assert_eq!(w.pool(PLAYER, Pool::Hired), [7, 6]);
    assert!(w.queue_unit(a, UnitKind::Prism).is_err());
}

#[test]
fn power_and_hired_places_each_have_a_maximum_by_map_size_and_the_kingdom_keeps_its_one_limit() {
    // Two maximums in place of one shared limit: Power and hired places each capped by their own buildings and their
    // own maximum, the two together the map's limit (45 + 15 on 64x64, 52 + 18 on 96x96, 60 + 20 on 128x128). Each is
    // enforced on its own: a full Power pool never stops a Sellsword, a full hired count never stops a Bot. The
    // Kingdom's population keeps the map's one limit.
    for (size, power, hired) in [(64, 45, 15), (96, 52, 18), (128, 60, 20)] {
        let mut w = World::with_size(
            7,
            1,
            MapKind::Standard,
            MapSize::square(size),
            0,
            &[&VAEL, &HUMANS],
        );
        w.disable_ai();
        w.res[PLAYER as usize] = [50_000, 0];
        for e in &mut w.explored {
            e.fill(1);
        }
        assert_eq!(
            (
                w.pool_max(PLAYER, Pool::Supply),
                w.pool_max(PLAYER, Pool::Hired)
            ),
            (power, hired),
            "{size}x{size}"
        );
        assert_eq!(power + hired, w.supply_limit(), "{size}: the map's limit");
        assert_eq!(
            w.pool_max(ENEMY, Pool::Supply),
            w.supply_limit(),
            "{size}: the Kingdom's population limit"
        );
        // Buildings past either maximum add nothing.
        for _ in 0..8 {
            set_down(&mut w, BldgKind::Spire);
        }
        let posts: Vec<Id> = (0..4).map(|_| set_down(&mut w, BldgKind::Siphon)).collect();
        assert_eq!(
            w.sup(PLAYER)[1],
            power,
            "{size}: Power capped at its maximum"
        );
        assert_eq!(
            w.pool(PLAYER, Pool::Hired)[1],
            hired,
            "{size}: hired places capped at theirs"
        );
        // Power full: no Bot, but a Sellsword still.
        let used = w.sup(PLAYER)[0];
        spawn(&mut w, UnitKind::Lumen, (power - used) as usize);
        assert_eq!(w.sup(PLAYER), [power, power]);
        let dc = hq(&w, PLAYER);
        assert_eq!(
            w.queue_unit(dc, UnitKind::Lumen),
            Err("Power at maximum.".to_string())
        );
        assert_eq!(w.queue_unit(posts[0], UnitKind::Prism), Ok(()), "{size}");
        // Hired full: no Sellsword; and with a Bot gone, a Bot again.
        let fill = hired - w.pool(PLAYER, Pool::Hired)[0];
        spawn(&mut w, UnitKind::Prism, fill as usize);
        assert_eq!(w.pool(PLAYER, Pool::Hired), [hired, hired]);
        assert_eq!(
            w.queue_unit(posts[1], UnitKind::Prism),
            Err("Hired at maximum.".to_string())
        );
        let bot = harvesters(&w, PLAYER)[0];
        w.damage(bot, 1e9, None);
        assert_eq!(w.queue_unit(dc, UnitKind::Lumen), Ok(()), "{size}");
        assert_eq!(w.army_used(PLAYER), power + hired);
    }
    // The Kingdom: one population limit, unchanged (60 on 64x64), and no hired places.
    let mut w = rich(7);
    for e in &mut w.explored {
        e.fill(1);
    }
    assert_eq!(w.pool_max(PLAYER, Pool::Supply), 60);
    assert_eq!(w.pool_max(PLAYER, Pool::Hired), 0);
    for _ in 0..7 {
        let (tx, ty) = spot(&w, BldgKind::Depot);
        w.make_building(BldgKind::Depot, PLAYER, tx, ty, true);
    }
    w.recalc_supply(PLAYER);
    assert_eq!(w.sup(PLAYER)[1], 60, "population capped at the map's limit");
}

#[test]
fn the_expedition_has_no_portal_pool() {
    // Two pools only: population or Power, and hired places. The Portal adds no places; the Android takes Power.
    assert_eq!(POOLS, 2);
    assert_eq!(ALL_POOLS, [Pool::Supply, Pool::Hired]);
    assert_eq!(Pool::parse("portal"), None);
    let d = BldgKind::Eclipse.def();
    assert_eq!(d.supply, 0, "the Portal gives no places");
    assert_eq!(UnitKind::Umbra.def().pool, Pool::Supply);
    let mut w = expedition();
    w.upgrades[PLAYER as usize][Upgrade::Satellite.index()] = 1;
    set_down(&mut w, BldgKind::Uplink);
    let before = w.pools[PLAYER as usize];
    set_down(&mut w, BldgKind::Eclipse);
    let after = w.pools[PLAYER as usize];
    assert_eq!(after[Pool::Hired.index()], before[Pool::Hired.index()]);
    assert_eq!(
        after[Pool::Supply.index()],
        [
            before[Pool::Supply.index()][0] + d.uses,
            before[Pool::Supply.index()][1]
        ],
        "it only uses Power"
    );
}

#[test]
fn one_portal_a_side_its_power_held_from_placement_and_released_on_its_loss_or_cancel() {
    let mut w = expedition();
    w.upgrades[PLAYER as usize][Upgrade::Satellite.index()] = 1;
    set_down(&mut w, BldgKind::Uplink);
    set_down(&mut w, BldgKind::Spire);
    let uses = BldgKind::Eclipse.def().uses;
    assert!(uses > 0);
    let power = w.sup(PLAYER);
    // Placed: its Power is used at once, while it goes up.
    let (px, py) = spot(&w, BldgKind::Eclipse);
    let site = w
        .place_building(PLAYER, BldgKind::Eclipse, px, py, None)
        .unwrap();
    assert_eq!(
        w.sup(PLAYER),
        [power[0] + uses, power[1]],
        "used from placement"
    );
    // A second, while the first goes up: refused.
    let (qx, qy) = spot(&w, BldgKind::Eclipse);
    let only_one = Err("Only one Portal.".to_string());
    assert_eq!(
        w.place_building(PLAYER, BldgKind::Eclipse, qx, qy, None),
        only_one,
        "one going up"
    );
    // Cancelled: its Power comes back, and another may be placed.
    assert!(w.cancel_construction(site));
    assert_eq!(w.sup(PLAYER), power, "released on cancel");
    let portal = w
        .place_building(PLAYER, BldgKind::Eclipse, qx, qy, None)
        .unwrap();
    assert_eq!(w.sup(PLAYER)[0], power[0] + uses);
    // Finished: still one only, still its Power.
    let bot = harvesters(&w, PLAYER)[0];
    w.start_build(bot, portal);
    run(&mut w, 70);
    assert!(w.bldg(portal).unwrap().done, "finished");
    assert_eq!(w.sup(PLAYER)[0], power[0] + uses, "used while it stands");
    let (rx, ry) = spot(&w, BldgKind::Eclipse);
    assert_eq!(
        w.place_building(PLAYER, BldgKind::Eclipse, rx, ry, None),
        only_one,
        "one standing"
    );
    // Destroyed: released, and another may be placed.
    w.damage(portal, 1e9, None);
    assert_eq!(w.sup(PLAYER)[0], power[0], "released on its loss");
    assert!(
        w.place_building(PLAYER, BldgKind::Eclipse, rx, ry, None)
            .is_ok()
    );
    // Without the Power for it: refused in the Power's words.
    let mut w = expedition();
    w.upgrades[PLAYER as usize][Upgrade::Satellite.index()] = 1;
    set_down(&mut w, BldgKind::Uplink);
    let [used, cap] = w.sup(PLAYER);
    spawn(&mut w, UnitKind::Lumen, (cap - used - uses + 1) as usize);
    let (px, py) = spot(&w, BldgKind::Eclipse);
    assert_eq!(
        w.place_building(PLAYER, BldgKind::Eclipse, px, py, None),
        Err("Not enough Power: build a Wind turbine.".to_string())
    );
}

#[test]
fn a_building_that_uses_no_power_goes_up_whatever_the_pools() {
    // Over its cap (its use above what its buildings give, as after a lost Cottage or turbine), a seat still places
    // the building that gives more: only a building that uses Power (the Portal) asks for room.
    let mut w = rich(7);
    for e in &mut w.explored {
        e.fill(1);
    }
    w.pools[PLAYER as usize][Pool::Supply.index()] = [30, 20];
    let (tx, ty) = spot(&w, BldgKind::Depot);
    assert!(
        w.place_building(PLAYER, BldgKind::Depot, tx, ty, None)
            .is_ok(),
        "the Kingdom's Cottage"
    );
    let mut w = expedition();
    let used = w.sup(PLAYER)[0];
    w.pools[PLAYER as usize][Pool::Supply.index()] = [used + 10, used];
    let (tx, ty) = spot(&w, BldgKind::Spire);
    assert!(
        w.place_building(PLAYER, BldgKind::Spire, tx, ty, None)
            .is_ok(),
        "the Expedition's turbine"
    );
}

#[test]
fn the_android_is_a_slow_expensive_elite_machine_using_power() {
    let d = UnitKind::Umbra.def();
    let wp = d.weapon.unwrap();
    assert_eq!((d.hp, d.armor), (200.0, 2.0));
    assert_eq!((wp.dmg, wp.range), (25.0, 7.0));
    assert!(wp.dmg_air > 0.0, "it hits the air");
    assert_eq!((d.pool, d.supply), (Pool::Supply, 3), "three Power");
    assert!(
        (60.0..=120.0).contains(&d.build),
        "one to two minutes to make: {}",
        d.build
    );
    assert!(d.cost[0] >= 300, "expensive: {:?}", d.cost);
    assert!(!d.bio, "a machine, not a person");
    assert!(
        endfall_sim::data::radio::needs_range(UnitKind::Umbra),
        "sped up in range like the other machines"
    );
    // Trained at the Portal: three Power queued, and refused without them.
    let mut w = expedition();
    w.upgrades[PLAYER as usize][Upgrade::Satellite.index()] = 1;
    set_down(&mut w, BldgKind::Uplink);
    let p = set_down(&mut w, BldgKind::Eclipse);
    let [used, cap] = w.sup(PLAYER);
    assert_eq!(w.queue_unit(p, UnitKind::Umbra), Ok(()));
    assert_eq!(w.sup(PLAYER), [used + 3, cap]);
    spawn(&mut w, UnitKind::Lumen, (cap - used - 3 - 2) as usize);
    assert_eq!(
        w.queue_unit(p, UnitKind::Umbra),
        Err("Not enough Power: build a Wind turbine.".to_string())
    );
    // It takes its whole training time.
    let before = count(&w, PLAYER, UnitKind::Umbra);
    run(&mut w, d.build as u32 - 2);
    assert_eq!(count(&w, PLAYER, UnitKind::Umbra), before, "not yet");
    run(&mut w, 3);
    assert_eq!(count(&w, PLAYER, UnitKind::Umbra), before + 1, "trained");
}

#[test]
fn the_satellite_needs_a_lab_and_unlocks_the_uplink_whose_standing_unlocks_the_portal() {
    let mut w = expedition();
    let dc = hq(&w, PLAYER);
    let (ux, uy) = spot(&w, BldgKind::Uplink);
    assert_eq!(
        w.start_research(dc, Upgrade::Satellite),
        Err("Requires Lab".to_string())
    );
    assert_eq!(
        w.place_building(PLAYER, BldgKind::Uplink, ux, uy, None),
        Err("Requires Launch satellite".to_string())
    );
    set_down(&mut w, BldgKind::Siphon);
    set_down(&mut w, BldgKind::Loom);
    let (px, py) = spot(&w, BldgKind::Eclipse);
    assert_eq!(
        w.place_building(PLAYER, BldgKind::Eclipse, px, py, None),
        Err("Requires Uplink".to_string()),
        "the Portal needs the Uplink, the Lab is not enough"
    );
    let gold = w.res[PLAYER as usize][0];
    assert_eq!(w.start_research(dc, Upgrade::Satellite), Ok(()));
    assert_eq!(
        w.res[PLAYER as usize][0],
        gold - 150,
        "the launch costs 150"
    );
    run(&mut w, 59);
    assert!(!w.has_req(PLAYER, BldgKind::Uplink), "60 s to launch");
    run(&mut w, 2);
    assert_eq!(w.upgrades[PLAYER as usize][Upgrade::Satellite.index()], 1);
    assert!(w.has_req(PLAYER, BldgKind::Uplink));
    let bot = harvesters(&w, PLAYER)[0];
    let up = build(&mut w, BldgKind::Uplink, bot, 90);
    let d = w.bldg(up).unwrap().kind.def();
    assert!(d.weapon.is_none() && (d.w, d.h) == (3, 3), "unarmed, 3x3");
    assert!(w.has_req(PLAYER, BldgKind::Eclipse));
    let (px, py) = spot(&w, BldgKind::Eclipse);
    assert!(
        w.place_building(PLAYER, BldgKind::Eclipse, px, py, None)
            .is_ok()
    );
    // The Uplink lost: no new Portal until another stands.
    w.damage(up, 1e9, None);
    assert!(!w.has_req(PLAYER, BldgKind::Eclipse));
}

#[test]
fn the_launch_is_told_to_its_own_seat_alone() {
    // Four seats on 96x96: the Expedition in seats 0 and 3, the Kingdom in 1 and 2, seats 0 and 1 a team against 2 and
    // 3. Seat 0 launches: only seat 0 is told ("You launched", its research-done notice), no other seat (neither its
    // ally nor its foes) gets a toast about it, and the launch is an event at its Data center (the client's rocket,
    // shown where a seat sees it), once.
    let mut w = World::with_size(
        5,
        1,
        MapKind::Standard,
        MapSize::square(96),
        0,
        &[&VAEL, &HUMANS, &HUMANS, &VAEL],
    );
    w.disable_ai();
    w.set_teams(&[0, 0, 1, 1]);
    let dc = hq(&w, 0);
    let (tx, ty) = (4..92)
        .flat_map(|y| (4..92).map(move |x| (x, y)))
        .find(|&(x, y)| w.can_place(BldgKind::Loom, x, y, 0))
        .unwrap();
    w.make_building(BldgKind::Loom, 0, tx, ty, true);
    w.res[0][0] = 1000;
    assert_eq!(w.start_research(dc, Upgrade::Satellite), Ok(()));
    w.events.clear();
    let (mut told, mut launches) = (Vec::new(), Vec::new());
    for _ in 0..61 * TPS {
        w.step();
        for e in w.events.drain(..) {
            match e {
                endfall_sim::world::Event::Toast { team, msg, .. }
                    if msg.contains("satellite") || msg.contains("launch") =>
                {
                    told.push((team, msg))
                }
                endfall_sim::world::Event::Launch { x, y, team } => launches.push((x, y, team)),
                _ => {}
            }
        }
    }
    assert_eq!(
        told,
        vec![(0, LAUNCH_OURS.to_string())],
        "its own seat told once, no other seat"
    );
    let b = w.bldg(dc).unwrap();
    assert_eq!(
        launches,
        vec![(b.x, b.y, 0)],
        "one launch, at the Data center"
    );
}

#[test]
fn the_hired_guns_fight_in_melee_on_the_ground_only() {
    for k in [UnitKind::Prism, UnitKind::Bruiser] {
        let wp = k.def().weapon.unwrap();
        assert!(wp.melee && wp.proj.is_none(), "{k:?}: melee");
        assert!(wp.range <= 1.0, "{k:?}: up close");
        assert_eq!(wp.hits(), (true, false), "{k:?}: the ground only");
    }
    for k in [UnitKind::Prism, UnitKind::Bruiser] {
        // Against a Guard 5 tiles off: it walks up and strikes from beside it.
        let mut w = arena(3);
        let (x, y) = (20.0 * 32.0, 20.0 * 32.0);
        flatten(&mut w, 15..30, 15..25);
        let me = w.make_unit(k, PLAYER, x, y);
        let guard = w.make_unit(UnitKind::Trooper, ENEMY, x + 5.0 * 32.0, y);
        w.hold_unit(guard);
        w.attack_ent(me, guard);
        let mut hit_at = None;
        for _ in 0..10 * TPS {
            w.step();
            let g = w.unit(guard).unwrap();
            if g.hp < g.maxhp {
                let u = w.unit(me).unwrap();
                hit_at = Some(((u.x - g.x).powi(2) + (u.y - g.y).powi(2)).sqrt() - u.r - g.r);
                break;
            }
        }
        let gap = hit_at.unwrap_or_else(|| panic!("{k:?} never struck the Guard"));
        assert!(gap <= 1.0 * 32.0, "{k:?} struck from {gap} px off its edge");
        // A Drone over it: it never hits it.
        let mut w = arena(3);
        flatten(&mut w, 15..30, 15..25);
        let me = w.make_unit(k, PLAYER, x, y);
        let drone = w.make_unit(UnitKind::Shrike, ENEMY, x + 20.0, y);
        w.hold_unit(drone);
        w.attack_ent(me, drone);
        run(&mut w, 3);
        let d = w.unit(drone).unwrap();
        assert_eq!(d.hp, d.maxhp, "{k:?} cannot hit a flyer");
    }
}

#[test]
fn the_expedition_ai_powers_hires_launches_and_trains_androids_from_one_portal_at_every_level() {
    // The Expedition's AI against the Kingdom's, at every level (every starting building made to last, so the game runs
    // its course): it raises Recruiting posts, wind turbines as its machines need Power (Easy fields few machines but
    // its Bots: a turbine only if those fill its Data center's 20), launches its satellite, raises an Uplink and a
    // Portal, never more than one Portal standing or going up, trains Androids there, and never stands above its places
    // but as a lost building leaves it.
    // (seed 20: since the economy pass's scarcer gold the Kingdom's Medium beats the Expedition's line down in seed 11's
    // game before its Portal ever has the four Sellswords and the price an Android waits for)
    for diff in 0..DIFF.len() {
        let mut w = World::with_setup(20, diff, MapKind::Standard, false, [&HUMANS, &VAEL]);
        w.set_ai_seats([true, true]);
        for b in w.bldgs.iter_mut() {
            (b.hp, b.maxhp) = (1e9, 1e9);
        }
        let mut seen = [false; 5]; // turbine, post, Uplink, Portal (finished), an Android
        let mut launched = None;
        let mut power_full = false;
        let mut portals = 0;
        let mut prev = Vec::new();
        while w.time < 20.0 * 60.0 && !(seen.iter().all(|&s| s) && launched.is_some()) {
            w.step();
            w.events.clear();
            for b in w.bldgs.iter().filter(|b| b.team == ENEMY && b.done) {
                let k = [
                    BldgKind::Spire,
                    BldgKind::Siphon,
                    BldgKind::Uplink,
                    BldgKind::Eclipse,
                ]
                .iter()
                .position(|&k| k == b.kind);
                if let Some(k) = k {
                    seen[k] = true;
                }
            }
            seen[4] |= count(&w, ENEMY, UnitKind::Umbra) > 0;
            let n = w
                .bldgs
                .iter()
                .filter(|b| b.team == ENEMY && b.kind == BldgKind::Eclipse)
                .count();
            portals = portals.max(n);
            if launched.is_none() && w.upgrades[ENEMY as usize][Upgrade::Satellite.index()] > 0 {
                launched = Some(w.time);
            }
            let [used, cap] = w.sup(ENEMY);
            power_full |= used >= cap;
            check_pools(&mut prev, &w, &format!("diff {diff} t {:.0}", w.time));
            if w.over {
                break;
            }
        }
        let want = [diff > 0 || power_full, true, true, true, true];
        assert!(
            seen.iter().zip(want).all(|(&s, w)| s || !w),
            "diff {diff}: turbine, post, Uplink, Portal, Android: {seen:?} by {:.0} s (over {}, winner {})",
            w.time,
            w.over,
            w.winner
        );
        assert_eq!(portals, 1, "diff {diff}: one Portal at most");
        let t = launched.unwrap_or_else(|| panic!("diff {diff}: no launch"));
        assert!(t > 150.0, "diff {diff}: launched at {t:.0} s, not at once");
    }
}
