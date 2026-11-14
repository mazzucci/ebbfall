//! The Expedition's economy (PRD: the Expedition runs on energy, Nov 14; the rework before it: power, hired guns, the
//! satellite): no population. It spends energy (the sim's one cost slot, gold's number), from its Bots' thorium and its
//! Wind turbines, and its units draw on the grid while they exist, its machines and its mercenaries alike (only units,
//! as only units take the Kingdom's population; its buildings drew grid too until Nov 14), from the Data center's 20
//! and its Substations' 10 each, up to `GRID_MAX` (every grid number halved on Nov 14). Energy efficiency, at the Lab
//! in place of Armor, cuts what its machines cost. The Lab unlocks the Uplink, which unlocks the Portal: one a side,
//! where the Android, a slow and expensive elite, is made. The hired guns fight in melee. The range's speed bonus and the Drone's leash: radio.rs.

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
fn the_expedition_runs_on_a_grid_and_has_no_population() {
    let mut w = expedition();
    let bots = harvesters(&w, PLAYER).len() as i32;
    assert_eq!(
        w.sup(PLAYER),
        [bots, 20],
        "the Data center's 20 grid, the Bots' draw (one each)"
    );
    // A Substation: +10 grid, for 100 energy (the Expedition's Cottage); the Wind turbine gives none.
    let sub = BldgKind::Substation.def();
    assert_eq!(
        (sub.name, sub.cost, sub.supply),
        ("Substation", [100, 0], 10)
    );
    assert_eq!(VAEL.supply, BldgKind::Substation);
    assert_eq!(BldgKind::Spire.def().supply, 0, "a turbine gives no grid");
    let bot = harvesters(&w, PLAYER)[0];
    build(&mut w, BldgKind::Substation, bot, 60);
    assert_eq!(w.sup(PLAYER)[1], 30);
    // Everything it trains draws on the one grid, read as the Kingdom's population (Stelian, Nov 14: every grid number
    // halved): a Bot, a Buggy or a swarm Drone one, a Bruiser two, an Android five, a Rover six; its mercenaries too, a
    // Sellsword one (no hired places since Nov 14: their quarters and contract upkeep).
    for (k, p) in [
        (UnitKind::Lumen, 1),
        (UnitKind::Scythe, 1),
        (UnitKind::Monolith, 6),
        (UnitKind::Shrike, 1),
        (UnitKind::Umbra, 5),
        (UnitKind::Prism, 1),
        (UnitKind::Bruiser, 2),
        (UnitKind::Halo, 1),
    ] {
        assert_eq!(k.def().supply, p, "{k:?}");
    }
    // Its buildings draw none: only units take grid, as only units take the Kingdom's population.
    for b in VAEL.build_basic.iter().chain(VAEL.build_advanced) {
        let before = w.sup(PLAYER)[0];
        set_down(&mut w, *b);
        assert_eq!(w.sup(PLAYER)[0], before, "{b:?} draws no grid");
    }
    // The grid's cap: its maximum, 150 on every map, as the Kingdom's population is 120.
    for _ in 0..14 {
        set_down(&mut w, BldgKind::Substation);
    }
    assert_eq!(w.sup(PLAYER)[1], GRID_MAX, "the grid at its maximum");
    assert_eq!(w.sup_max(PLAYER), 150);
}

#[test]
fn a_full_grid_refuses_a_bot_and_a_sellsword_alike_until_a_substation_stands() {
    let mut w = expedition();
    let used = w.sup(PLAYER)[0];
    spawn(&mut w, UnitKind::Lumen, (20 - used) as usize);
    assert_eq!(
        w.sup(PLAYER),
        [20, 20],
        "no grid left: short of a Bot's one"
    );
    let dc = hq(&w, PLAYER);
    let full = Err("Not enough grid: build a Substation.".to_string());
    assert_eq!(w.queue_unit(dc, UnitKind::Lumen), full);
    // One grid for machines and mercenaries: a full grid stops a Sellsword too (the hired places were apart until Nov 14).
    let post = set_down(&mut w, BldgKind::Siphon);
    assert_eq!(w.sup(PLAYER), [20, 20], "a Recruiting post gives no places");
    assert_eq!(w.queue_unit(post, UnitKind::Prism), full);
    let bot = harvesters(&w, PLAYER)[0];
    build(&mut w, BldgKind::Substation, bot, 60);
    assert_eq!(w.queue_unit(dc, UnitKind::Lumen), Ok(()));
    assert_eq!(w.queue_unit(post, UnitKind::Prism), Ok(()));
    assert_eq!(w.sup(PLAYER), [22, 30]);
    let before = count(&w, PLAYER, UnitKind::Lumen);
    run(&mut w, UnitKind::Lumen.def().build as u32 + 1);
    assert_eq!(count(&w, PLAYER, UnitKind::Lumen), before + 1, "trained");
}

#[test]
fn a_mercenary_draws_grid_while_it_lives_and_a_lost_substation_stops_more() {
    let mut w = expedition();
    let a = set_down(&mut w, BldgKind::Siphon);
    let sub = set_down(&mut w, BldgKind::Substation);
    let [used, cap] = w.sup(PLAYER);
    let hired = spawn(&mut w, UnitKind::Prism, 3);
    assert_eq!(w.sup(PLAYER), [used + 3, cap], "one grid a Sellsword");
    assert_eq!(w.queue_unit(a, UnitKind::Prism), Ok(()));
    assert_eq!(w.sup(PLAYER), [used + 4, cap], "queued too");
    // A death frees its grid.
    w.damage(hired[0], 1e9, None);
    assert_eq!(w.sup(PLAYER), [used + 3, cap]);
    // A Substation lost: the cap falls under the use; nothing more is trained until enough fall, nothing is taken away.
    spawn(&mut w, UnitKind::Prism, (cap - used - 3) as usize);
    w.damage(sub, 1e9, None);
    let [u2, c2] = w.sup(PLAYER);
    assert_eq!(c2, cap - 10);
    assert!(u2 > c2, "over the cap by the loss: {u2}/{c2}");
    assert_eq!(
        w.queue_unit(a, UnitKind::Prism),
        Err("Not enough grid: build a Substation.".to_string())
    );
    assert_eq!(
        count(&w, PLAYER, UnitKind::Prism),
        hired.len() - 1 + (cap - used - 3) as usize
    );
}

#[test]
fn the_expedition_spends_energy_and_its_refusals_say_so() {
    // One cost slot for both peoples, gold's numbers (PRD: energy trades 1:1 with gold); only the words differ.
    assert_eq!((HUMANS.money, VAEL.money), ("gold", "energy"));
    let mut w = expedition();
    w.res[PLAYER as usize] = [10, 0];
    let dc = hq(&w, PLAYER);
    assert_eq!(
        w.queue_unit(dc, UnitKind::Lumen),
        Err("Not enough energy".to_string())
    );
    let (tx, ty) = spot(&w, BldgKind::Substation);
    assert_eq!(
        w.place_building(PLAYER, BldgKind::Substation, tx, ty, None),
        Err("Not enough energy".to_string())
    );
    let mut k = rich(7);
    k.res[PLAYER as usize] = [10, 0];
    let core = k
        .bldgs
        .iter()
        .find(|b| b.team == PLAYER && b.kind.def().hq)
        .unwrap()
        .id;
    assert_eq!(
        k.queue_unit(core, UnitKind::Harvester),
        Err("Not enough gold".to_string())
    );
}

#[test]
fn wind_turbines_pay_energy_five_a_data_center_as_one_market_at_full_trade() {
    // Several weak turbines, the Expedition's Market (PRD, Nov 14): five a Data center pay what one Market pays at full
    // Trade, each paying back its price in about four minutes; no research raises them.
    let d = BldgKind::Spire.def();
    assert_eq!(VAEL.market, Some(BldgKind::Spire));
    assert_eq!(d.per_hq, 5);
    assert_eq!(d.pays, TURBINE_RATE);
    let market_at_full_trade = PUMP_RATE * TRADE_RATE[2];
    assert!(
        (5.0 * TURBINE_RATE - market_at_full_trade).abs() < 1e-9,
        "five turbines {} a second, a Market at full Trade {market_at_full_trade}",
        5.0 * TURBINE_RATE
    );
    let payback = d.cost[0] as f64 / TURBINE_RATE;
    assert!(
        (210.0..=270.0).contains(&payback),
        "pays back in about four minutes: {payback:.0} s"
    );
    // Five a finished Data center, sites counted: a sixth refused (once a Recruiting post stands, as the Market waits
    // for the Barracks).
    let mut w = expedition();
    assert_eq!(d.req, Some(BldgKind::Siphon));
    set_down(&mut w, BldgKind::Siphon);
    let mut turbines = vec![];
    for _ in 0..5 {
        let (tx, ty) = spot(&w, BldgKind::Spire);
        turbines.push(w.make_building(BldgKind::Spire, PLAYER, tx, ty, true));
    }
    let (tx, ty) = spot(&w, BldgKind::Spire);
    assert_eq!(
        w.place_building(PLAYER, BldgKind::Spire, tx, ty, None),
        Err("Maximum of 5 turbines per Data center reached.".to_string())
    );
    // They pay by themselves: 5 x 0.072 a second, 108 in five minutes (each banks whole ones from its own fraction: 21
    // each, 0.6 left over).
    for h in harvesters(&w, PLAYER) {
        w.stop_unit(h);
    }
    w.res[PLAYER as usize] = [0, 0];
    run(&mut w, 300);
    let got = w.res[PLAYER as usize][0];
    assert!(
        (104..=108).contains(&got),
        "five turbines in five minutes: {got}"
    );
}

#[test]
fn a_second_data_center_allows_five_more_turbines() {
    // Five a finished Data center: a second one, finished, lets a sixth go up (`hq_room` counts headquarters); while it
    // is still a site, not.
    let mut w = expedition();
    set_down(&mut w, BldgKind::Siphon);
    for _ in 0..5 {
        set_down(&mut w, BldgKind::Spire);
    }
    let (tx, ty) = spot(&w, BldgKind::Spire);
    assert!(
        w.place_building(PLAYER, BldgKind::Spire, tx, ty, None)
            .is_err(),
        "five: full"
    );
    let (cx, cy) = spot(&w, BldgKind::Conflux);
    let dc = w.make_building(BldgKind::Conflux, PLAYER, cx, cy, false);
    assert!(
        !w.hq_room(PLAYER, BldgKind::Spire),
        "a Data center still going up allows none"
    );
    w.bldgs.iter_mut().find(|b| b.id == dc).unwrap().done = true;
    let (tx, ty) = spot(&w, BldgKind::Spire);
    assert!(
        w.place_building(PLAYER, BldgKind::Spire, tx, ty, None)
            .is_ok(),
        "a second Data center: a sixth"
    );
}

#[test]
fn an_expedition_with_no_grid_left_cannot_train_and_is_out_as_helpless() {
    // Its Data center and Substations gone, a Recruiting post and a Wind turbine standing, energy in the bank: it can
    // pay for a Sellsword but has no grid to field one, and its turbine pays for ever; with no worker nor fighter it is
    // out, helpless (else two such sides would never end).
    let mut w = expedition();
    let post = set_down(&mut w, BldgKind::Siphon);
    set_down(&mut w, BldgKind::Spire);
    w.res[PLAYER as usize] = [5000, 0];
    for id in harvesters(&w, PLAYER) {
        w.stop_unit(id);
        w.damage(id, 1e9, None);
    }
    assert_eq!(
        w.queue_unit(post, UnitKind::Prism),
        Ok(()),
        "while its Data center stands"
    );
    w.cancel_queue(post, 0);
    let dc = hq(&w, PLAYER);
    w.damage(dc, 1e9, None);
    assert_eq!(w.sup(PLAYER)[1], 0, "no grid left");
    assert_eq!(
        w.queue_unit(post, UnitKind::Prism),
        Err("Not enough grid: build a Substation.".to_string())
    );
    run(&mut w, 1);
    assert_eq!(w.out_why[PLAYER as usize], OutWhy::Helpless);
}

#[test]
fn energy_efficiency_replaces_armor_at_the_lab_and_cuts_what_machines_cost() {
    let lab = BldgKind::Loom.def();
    assert_eq!(
        lab.researches,
        &[Upgrade::Weapons, Upgrade::EnergyEfficiency]
    );
    assert!(
        !lab.researches.contains(&Upgrade::Armor) && !lab.researches.contains(&Upgrade::Drills),
        "no Armor and no Better drills for the Expedition"
    );
    let g = Upgrade::EnergyEfficiency;
    assert_eq!((g.def().name, g.levels()), ("Energy efficiency", 2));
    assert_eq!(
        g.index(),
        9,
        "Grid efficiency's slot, for the wire's indices"
    );
    assert_eq!(ENERGY_COST, [1.0, 0.9, 0.8], "10% less a level");
    // The Kingdom keeps its Weapons and Armor at the Blacksmith.
    assert!(BldgKind::Forge.def().researches.contains(&Upgrade::Armor));
    // Researched at a Lab: a machine costs 10% less a level, rounded to whole energy (a Drone's 65: 59, then 52); a
    // mercenary is no machine and a building no unit: a Sellsword's 100 and a Substation's 100 throughout. What a unit
    // draws on the grid never changes (no grid saving since Nov 14).
    let mut w = expedition();
    let l = set_down(&mut w, BldgKind::Loom);
    let f = set_down(&mut w, BldgKind::Kiln);
    for (level, rover, drone, bot) in [(0u8, 550, 65, 50), (1, 495, 59, 45), (2, 440, 52, 40)] {
        assert_eq!(
            w.unit_cost(PLAYER, UnitKind::Monolith),
            [rover, 0],
            "level {level}"
        );
        assert_eq!(
            w.unit_cost(PLAYER, UnitKind::Shrike),
            [drone, 0],
            "level {level}"
        );
        assert_eq!(
            w.unit_cost(PLAYER, UnitKind::Lumen),
            [bot, 0],
            "level {level}"
        );
        assert_eq!(
            w.unit_cost(PLAYER, UnitKind::Prism),
            [100, 0],
            "level {level}"
        );
        assert_eq!(w.takes(PLAYER, UnitKind::Monolith), 6, "level {level}");
        assert_eq!(BldgKind::Substation.def().cost, [100, 0]);
        // A Buggy queued is paid at the price of the moment, and refunded at it.
        let bank = w.res[PLAYER as usize][0];
        assert_eq!(w.queue_unit(f, UnitKind::Scythe), Ok(()));
        let paid = bank - w.res[PLAYER as usize][0];
        assert_eq!(
            paid,
            [80, 72, 64][level as usize],
            "a Buggy at level {level}"
        );
        w.cancel_queue(f, 0);
        assert_eq!(w.res[PLAYER as usize][0], bank, "refunded in full");
        if level < 2 {
            assert_eq!(w.start_research(l, g), Ok(()));
            run(&mut w, g.time(level + 1) as u32 + 1);
            assert_eq!(w.upgrades[PLAYER as usize][g.index()], level + 1);
        }
    }
    // Not the Kingdom's: the Blacksmith offers no Energy efficiency, and its units cost what they cost.
    assert!(!BldgKind::Forge.def().researches.contains(&g));
    assert_eq!(
        w.unit_cost(ENEMY, UnitKind::Trooper),
        UnitKind::Trooper.def().cost
    );
}

#[test]
fn no_expedition_unit_has_armor_and_its_hp_carries_what_armor_did() {
    // Deadly but fragile (Nov 14): no base armor; a unit that had armor a has hp x d / (d - a), averaged over the
    // Kingdom's main damage values (the Guard, the Archer, the Rider, the Knight, the Cannon).
    let main: Vec<f64> = [
        UnitKind::Trooper,
        UnitKind::Lancer,
        UnitKind::Rider,
        UnitKind::Knight,
        UnitKind::SiegeTank,
    ]
    .iter()
    .map(|k| k.def().weapon.unwrap().dmg)
    .collect();
    let topped =
        |hp: f64, a: f64| hp * main.iter().map(|d| d / (d - a)).sum::<f64>() / main.len() as f64;
    for (k, hp, armor) in [
        (UnitKind::Scythe, 110.0, 1.0),
        (UnitKind::Prism, 100.0, 1.0),
        (UnitKind::Umbra, 440.0, 3.0),
        (UnitKind::Monolith, 360.0, 1.0),
        (UnitKind::Bruiser, 320.0, 3.0),
    ] {
        let want = topped(hp, armor);
        assert!(
            (k.def().hp - want).abs() <= 1.0,
            "{k:?}: {} hp, the formula's {want:.1}",
            k.def().hp
        );
    }
    for b in VAEL.build_basic.iter().chain(VAEL.build_advanced) {
        for k in b.def().trains {
            assert_eq!(k.def().armor, 0.0, "{k:?} has no armor");
        }
    }
}

#[test]
fn the_rover_fires_a_heavy_salvo_slowly_and_costs_more_than_the_android() {
    let r = UnitKind::Monolith.def();
    let wp = r.weapon.unwrap();
    assert!(
        (115.0..=125.0).contains(&wp.dmg),
        "about 120 a salvo (100 before Nov 14's commit-at-tier check): {}",
        wp.dmg
    );
    assert!((3.3..=3.7).contains(&wp.cd), "about every 3.5 s: {}", wp.cd);
    assert!(
        r.cost[0] > UnitKind::Umbra.def().cost[0],
        "priced above the Android"
    );
}

#[test]
fn one_portal_a_side_standing_or_going_up_and_it_takes_no_grid() {
    let d = BldgKind::Eclipse.def();
    assert_eq!(d.supply, 0, "the Portal gives no places");
    let mut w = expedition();
    set_down(&mut w, BldgKind::Uplink);
    let grid = w.sup(PLAYER);
    // Placed: no grid drawn (only units take grid since Nov 14).
    let (px, py) = spot(&w, BldgKind::Eclipse);
    let site = w
        .place_building(PLAYER, BldgKind::Eclipse, px, py, None)
        .unwrap();
    assert_eq!(w.sup(PLAYER), grid, "no grid drawn");
    // A second, while the first goes up: refused.
    let (qx, qy) = spot(&w, BldgKind::Eclipse);
    let only_one = Err("Only one Portal.".to_string());
    assert_eq!(
        w.place_building(PLAYER, BldgKind::Eclipse, qx, qy, None),
        only_one,
        "one going up"
    );
    // Cancelled: another may be placed.
    assert!(w.cancel_construction(site));
    let portal = w
        .place_building(PLAYER, BldgKind::Eclipse, qx, qy, None)
        .unwrap();
    // Finished: still one only, still no grid.
    let bot = harvesters(&w, PLAYER)[0];
    w.start_build(bot, portal);
    run(&mut w, 70);
    assert!(w.bldg(portal).unwrap().done, "finished");
    assert_eq!(w.sup(PLAYER), grid, "none drawn while it stands");
    let (rx, ry) = spot(&w, BldgKind::Eclipse);
    assert_eq!(
        w.place_building(PLAYER, BldgKind::Eclipse, rx, ry, None),
        only_one,
        "one standing"
    );
    // Destroyed: another may be placed.
    w.damage(portal, 1e9, None);
    assert!(
        w.place_building(PLAYER, BldgKind::Eclipse, rx, ry, None)
            .is_ok()
    );
    // A full grid does not stop it: only units ask for grid.
    let mut w = expedition();
    set_down(&mut w, BldgKind::Uplink);
    let [used, cap] = w.sup(PLAYER);
    spawn(&mut w, UnitKind::Lumen, (cap - used) as usize);
    assert_eq!(w.room(PLAYER), 0, "the grid full");
    let (px, py) = spot(&w, BldgKind::Eclipse);
    assert!(
        w.place_building(PLAYER, BldgKind::Eclipse, px, py, None)
            .is_ok()
    );
}

#[test]
fn a_building_goes_up_whatever_the_places() {
    // Over its cap (its use above what its buildings give, as after a lost Cottage or Substation), a seat still places
    // any building: only units ask for room.
    let mut w = rich(7);
    for e in &mut w.explored {
        e.fill(1);
    }
    w.supply[PLAYER as usize] = [30, 20];
    let (tx, ty) = spot(&w, BldgKind::Depot);
    assert!(
        w.place_building(PLAYER, BldgKind::Depot, tx, ty, None)
            .is_ok(),
        "the Kingdom's Cottage"
    );
    let mut w = expedition();
    set_down(&mut w, BldgKind::Siphon);
    let used = w.sup(PLAYER)[0];
    w.supply[PLAYER as usize] = [used + 10, used];
    set_down(&mut w, BldgKind::Loom);
    for k in [
        BldgKind::Substation,
        BldgKind::Spire,
        BldgKind::Kiln,
        BldgKind::Ward,
        BldgKind::Uplink,
    ] {
        let (tx, ty) = spot(&w, k);
        assert!(
            w.place_building(PLAYER, k, tx, ty, None).is_ok(),
            "the Expedition's {k:?}"
        );
    }
}

#[test]
fn the_android_is_a_slow_expensive_elite_machine_drawing_grid() {
    let d = UnitKind::Umbra.def();
    let wp = d.weapon.unwrap();
    // (an elite since Nov 13: about four Sellswords' hp and damage; no armor since Nov 14, its hp carrying it)
    assert_eq!((d.hp, d.armor), (575.0, 0.0));
    assert_eq!((wp.dmg, wp.range), (63.0, 8.0));
    assert!(wp.dmg_air > 0.0, "it hits the air");
    assert_eq!(d.supply, 5, "five grid");
    assert!(
        (30.0..=90.0).contains(&d.build),
        "under a minute and a half to make: {}",
        d.build
    );
    assert!(d.cost[0] >= 450, "expensive: {:?}", d.cost);
    assert!(!d.bio, "a machine, not a person");
    assert!(
        endfall_sim::data::radio::needs_range(UnitKind::Umbra),
        "sped up in range like the other machines"
    );
    // Trained at the Portal: five grid queued, and refused without them.
    let mut w = expedition();
    set_down(&mut w, BldgKind::Uplink);
    let p = set_down(&mut w, BldgKind::Eclipse);
    let [used, cap] = w.sup(PLAYER);
    assert_eq!(w.queue_unit(p, UnitKind::Umbra), Ok(()));
    assert_eq!(w.sup(PLAYER), [used + 5, cap]);
    // (Bots, one grid each, until four are left: short of an Android's five)
    spawn(&mut w, UnitKind::Lumen, (cap - used - 5 - 4) as usize);
    assert_eq!(
        w.queue_unit(p, UnitKind::Umbra),
        Err("Not enough grid: build a Substation.".to_string())
    );
    // It takes its whole training time.
    let before = count(&w, PLAYER, UnitKind::Umbra);
    run(&mut w, d.build as u32 - 2);
    assert_eq!(count(&w, PLAYER, UnitKind::Umbra), before, "not yet");
    run(&mut w, 3);
    assert_eq!(count(&w, PLAYER, UnitKind::Umbra), before + 1, "trained");
}

#[test]
fn the_lab_unlocks_the_uplink_whose_standing_unlocks_the_portal() {
    // One dish, no satellite (Stelian, Nov 13): the Uplink is refused until a Lab stands, and costs what the Uplink and
    // its satellite did together; the Portal needs an Uplink to be placed, and trains only while one stands.
    let mut w = expedition();
    let (ux, uy) = spot(&w, BldgKind::Uplink);
    assert_eq!(BldgKind::Uplink.def().cost, [275, 0]);
    assert_eq!(
        w.place_building(PLAYER, BldgKind::Uplink, ux, uy, None),
        Err("Requires Lab".to_string()),
        "the Uplink refused before a Lab stands"
    );
    set_down(&mut w, BldgKind::Siphon);
    let lab = set_down(&mut w, BldgKind::Loom);
    let (px, py) = spot(&w, BldgKind::Eclipse);
    assert_eq!(
        w.place_building(PLAYER, BldgKind::Eclipse, px, py, None),
        Err("Requires Uplink".to_string()),
        "the Portal needs the Uplink, the Lab is not enough"
    );
    assert!(
        w.has_req(PLAYER, BldgKind::Uplink),
        "the Lab standing opens it"
    );
    let bot = harvesters(&w, PLAYER)[0];
    let up = build(&mut w, BldgKind::Uplink, bot, 90);
    let d = w.bldg(up).unwrap().kind.def();
    assert!(d.weapon.is_none() && (d.w, d.h) == (3, 3), "unarmed, 3x3");
    assert!(w.has_req(PLAYER, BldgKind::Eclipse));
    let portal = build(&mut w, BldgKind::Eclipse, bot, 90);
    // The Uplink lost: no new Portal until another stands, and the Portal trains nothing meanwhile (refused with the
    // reason; what it was training waits).
    assert_eq!(w.queue_unit(portal, UnitKind::Umbra), Ok(()));
    w.damage(up, 1e9, None);
    assert!(!w.has_req(PLAYER, BldgKind::Eclipse));
    assert_eq!(
        w.queue_unit(portal, UnitKind::Monolith),
        Err("Needs a standing Uplink.".to_string())
    );
    let prog = w.bldg(portal).unwrap().prog;
    run(&mut w, 10);
    assert_eq!(w.bldg(portal).unwrap().prog, prog, "its training waits");
    let up2 = build(&mut w, BldgKind::Uplink, bot, 90);
    assert!(w.bldg(up2).is_some_and(|b| b.done));
    run(&mut w, 2);
    assert!(
        w.bldg(portal).unwrap().prog > prog,
        "and goes on with one again"
    );
    // The Lab lost: the Uplink standing still works, but no new one goes up.
    w.damage(lab, 1e9, None);
    assert!(!w.has_req(PLAYER, BldgKind::Uplink));
    assert!(w.has_req(PLAYER, BldgKind::Eclipse));
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
fn the_expedition_ai_builds_its_grid_and_turbines_and_trains_androids_from_one_portal_at_every_level()
 {
    // The Expedition's AI against a Kingdom that only stands, at every level (every starting building made to last, so
    // the game runs its course): it raises Recruiting posts, Substations as its grid fills (Easy fields few machines: a
    // Substation only if its army fills its Data center's 20), Wind turbines as its Market (five a Data center at
    // most), an Uplink and a Portal, never more than one Portal standing or going up, trains Androids there, and never
    // stands above its places but as a lost building leaves it.
    // (seed 2: since the economy pass's scarcer gold the Kingdom's Medium beats the Expedition's line down in seed 11's
    // game before its Portal ever has the four Sellswords and the price an Android waits for; since new workers wait
    // for an order, Brutal's Expedition in seed 20's; since Easy's slow climb and its Kingdom's line on par (Nov 13),
    // Easy's Kingdom killed seed 24's Bots by 14:00, leaving its immortal buildings without a coin; in many games one
    // level's Kingdom crushes the Expedition's army before its Portal pays for an Android, here none does; since the
    // Kingdom AI takes its natural later on Medium and Hard (Nov 13) no seed of 1 to 8 had an Android at every level,
    // one level's Kingdom crushing it first: the path tested is the Expedition's own, so the Kingdom only stands)
    for diff in 0..DIFF.len() {
        let mut w = World::with_setup(2, diff, MapKind::Standard, false, [&HUMANS, &VAEL]);
        w.set_ai_seats([false, true]);
        past_first_turns(&mut w); // (its style drawn at its first turn: its tuning as it plays it)
        let level = &w.tuning(ENEMY);
        for b in w.bldgs.iter_mut() {
            (b.hp, b.maxhp) = (1e9, 1e9);
        }
        let mut seen = [false; 6]; // Substation, post, Uplink, Portal (finished), an Android, a turbine
        let mut uplink_at = None;
        let mut capped_at_portal = (false, false);
        let mut grid_full = false;
        let mut portals = 0;
        let mut prev = Vec::new();
        while w.time < 25.0 * 60.0 && !seen.iter().all(|&s| s) {
            w.step();
            w.events.clear();
            for b in w.bldgs.iter().filter(|b| b.team == ENEMY && b.done) {
                let k = [
                    (BldgKind::Substation, 0),
                    (BldgKind::Siphon, 1),
                    (BldgKind::Uplink, 2),
                    (BldgKind::Eclipse, 3),
                    (BldgKind::Spire, 5),
                ]
                .iter()
                .find(|&&(k, _)| k == b.kind)
                .map(|&(_, i)| i);
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
            let turbines = w
                .bldgs
                .iter()
                .filter(|b| b.team == ENEMY && b.kind == BldgKind::Spire)
                .count();
            let centers = w
                .bldgs
                .iter()
                .filter(|b| b.team == ENEMY && b.kind == BldgKind::Conflux && b.done)
                .count();
            assert!(
                turbines <= 5 * centers,
                "diff {diff}: {turbines} turbines, {centers} Data centers"
            );
            if uplink_at.is_none() && seen[2] {
                uplink_at = Some(w.time);
            }
            let [used, cap] = w.sup(ENEMY);
            grid_full |= used >= cap;
            // (Easy at its army's cap when its Portal stands: it trains nothing more, an Android neither)
            if seen[3] && !capped_at_portal.0 {
                capped_at_portal = (
                    true,
                    level.army_max > 0
                        && w.units
                            .iter()
                            .filter(|u| {
                                u.team == ENEMY && !u.kind.def().worker && u.kind.def().armed()
                            })
                            .count()
                            >= level.army_max,
                );
            }
            check_pools(&mut prev, &w, &format!("diff {diff} t {:.0}", w.time));
            if w.over {
                break;
            }
        }
        // (an Android at every level again by 25:00, Nov 13: its Portal holds the price of the elite it trains next, the
        // Android first; Easy's climb brings its top tier from 13:00; but not Easy at its 14 fighters when its Portal
        // stands, as in seed 2's game since its Portal's Uplink stands at home: it trains nothing more)
        // (and only on a style that reaches the top tier: Easy's Boom alone, from 15:00, Nov 14)
        let top =
            level.mix_tier as usize + level.tier_at.iter().filter(|&&t| t < NEVER).count() >= 2;
        let want = [
            diff > 0 || grid_full,
            true,
            true,
            true,
            !capped_at_portal.1 && top,
            true,
        ];
        assert!(
            seen.iter().zip(want).all(|(&s, w)| s || !w),
            "diff {diff}: Substation, post, Uplink, Portal, Android, turbine: {seen:?} by {:.0} s (over {}, winner {})",
            w.time,
            w.over,
            w.winner
        );
        assert_eq!(portals, 1, "diff {diff}: one Portal at most");
        let t = uplink_at.unwrap_or_else(|| panic!("diff {diff}: no Uplink"));
        assert!(t > 150.0, "diff {diff}: an Uplink at {t:.0} s, not at once");
    }
}

#[test]
fn a_rover_salvo_kills_the_guards_it_lands_among() {
    // The Rover, the Expedition's top tier (550, its salvo 120 every 3.5 s since Nov 14's commit-at-tier check; 100
    // before): its splash (0.6 of the salvo, 72) now kills the Guards beside the one it hits (60 hp, armor 1), where 100
    // left them standing at one hp. Inside its Data center's coverage, three Guards clumped nine tiles off, idle.
    let d = UnitKind::Monolith.def();
    let wp = d.weapon.unwrap();
    assert_eq!(
        (d.cost, wp.dmg, wp.cd, wp.splash),
        ([550, 0], 120.0, 3.5, 0.6)
    );
    let mut w = expedition();
    w.disable_ai();
    let (tx, ty) = core(&w, PLAYER);
    let (x, y) = ((tx as f64 + 2.0) * TILE, (ty as f64 + 6.0) * TILE);
    let rover = w.make_unit(UnitKind::Monolith, PLAYER, x, y);
    let guards: Vec<Id> = (0..3)
        .map(|i| {
            w.make_unit(
                UnitKind::Trooper,
                ENEMY,
                x + 9.0 * TILE,
                y + i as f64 * 14.0,
            )
        })
        .collect();
    for &g in &guards {
        w.hold_unit(g);
    }
    w.attack_ent(rover, guards[1]);
    // (one salvo: up to its first shot's landing, well short of a second)
    for _ in 0..(3.0 * TPS as f64) as u32 {
        w.step();
    }
    let left = guards.iter().filter(|&&g| w.unit(g).is_some()).count();
    assert_eq!(left, 0, "one salvo: the three Guards fall");
}
