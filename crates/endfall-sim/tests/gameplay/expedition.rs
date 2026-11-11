//! The Expedition rework (PRD: power, hired guns, the satellite): no population. Its machines use Power (the Data center
//! +20, a wind turbine +8); its hired guns (the Sellsword, the Bruiser, the Medic) take hired places, six a Recruiting
//! post, one count for the side; its Marines take Portal places, four a Portal. Launch satellite (at the Data center,
//! once a Lab stands) is told to every seat and unlocks the Uplink, which unlocks the Portal. The hired guns fight in
//! melee. The range's speed bonus and the Drone's leash: radio.rs.

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
    assert_eq!(w.pool(PLAYER, Pool::Portal), [0, 0]);
    // A wind turbine: +8 Power, for 100 gold.
    assert_eq!(BldgKind::Spire.def().name, "Wind turbine");
    assert_eq!(BldgKind::Spire.def().cost, [100, 0]);
    let bot = harvesters(&w, PLAYER)[0];
    build(&mut w, BldgKind::Spire, bot, 60);
    assert_eq!(w.sup(PLAYER)[1], 28);
    // Every machine uses Power at its old supply; the people none.
    for (k, p) in [
        (UnitKind::Lumen, 1),
        (UnitKind::Scythe, 2),
        (UnitKind::Monolith, 4),
        (UnitKind::Shrike, 2),
    ] {
        assert_eq!((k.def().pool, k.def().supply), (Pool::Supply, p), "{k:?}");
    }
    for k in [UnitKind::Prism, UnitKind::Bruiser, UnitKind::Halo] {
        assert_eq!((k.def().pool, k.def().supply), (Pool::Hired, 1), "{k:?}");
    }
    assert_eq!(
        (UnitKind::Umbra.def().pool, UnitKind::Umbra.def().supply),
        (Pool::Portal, 1)
    );
    // The Power cap: the map's limit, like the Kingdom's population.
    for _ in 0..12 {
        set_down(&mut w, BldgKind::Spire);
    }
    assert_eq!(
        w.sup(PLAYER)[1],
        w.supply_limit(),
        "Power at the map's limit"
    );
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
        Err("Not enough Power. Build a Wind turbine.".to_string())
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
        Err("No free places for hire. Build a Recruiting post.".to_string())
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
fn one_army_limit_holds_power_and_places_together() {
    // Power, hired and Portal places each have their own cap, and all of them together the map's limit (60 here): with
    // Power and hired places filled to it between them, a Sellsword and a Bot are refused though their own pools have
    // room; a death makes room again.
    let mut w = expedition();
    let limit = w.supply_limit();
    assert_eq!(limit, 60);
    for _ in 0..5 {
        set_down(&mut w, BldgKind::Spire);
    }
    let post = set_down(&mut w, BldgKind::Siphon);
    for _ in 0..7 {
        set_down(&mut w, BldgKind::Siphon);
    }
    assert_eq!(w.sup(PLAYER)[1], 60);
    assert_eq!(w.pool(PLAYER, Pool::Hired)[1], 48);
    let bots = w.sup(PLAYER)[0];
    spawn(&mut w, UnitKind::Lumen, (30 - bots) as usize);
    let hired = spawn(&mut w, UnitKind::Prism, 30);
    assert_eq!(w.sup(PLAYER), [30, 60]);
    assert_eq!(w.pool(PLAYER, Pool::Hired), [30, 48]);
    assert_eq!(w.army_used(PLAYER), limit);
    let told = Err(format!(
        "Army at its limit ({limit}): no more until some fall"
    ));
    assert_eq!(
        w.queue_unit(post, UnitKind::Prism),
        told,
        "hired places to spare"
    );
    let dc = hq(&w, PLAYER);
    assert_eq!(w.queue_unit(dc, UnitKind::Lumen), told, "Power to spare");
    w.damage(hired[0], 1e9, None);
    assert_eq!(
        w.queue_unit(dc, UnitKind::Lumen),
        Ok(()),
        "a death makes room"
    );
    assert!(
        w.queue_unit(post, UnitKind::Prism).is_err(),
        "and the Bot took it"
    );
}

#[test]
fn each_portal_holds_four_marines() {
    let mut w = expedition();
    w.upgrades[PLAYER as usize][Upgrade::Satellite.index()] = 1;
    set_down(&mut w, BldgKind::Uplink);
    let p = set_down(&mut w, BldgKind::Eclipse);
    assert_eq!(w.pool(PLAYER, Pool::Portal), [0, 4]);
    let power = w.sup(PLAYER);
    spawn(&mut w, UnitKind::Umbra, 3);
    assert_eq!(w.queue_unit(p, UnitKind::Umbra), Ok(()));
    assert_eq!(w.pool(PLAYER, Pool::Portal), [4, 4]);
    assert_eq!(w.pool(PLAYER, Pool::Hired), [0, 0], "not hired places");
    assert_eq!(w.sup(PLAYER), power, "nor Power");
    assert_eq!(
        w.queue_unit(p, UnitKind::Umbra),
        Err("No free Portal places. Build a Portal.".to_string())
    );
    let q = set_down(&mut w, BldgKind::Eclipse);
    assert_eq!(w.pool(PLAYER, Pool::Portal), [4, 8]);
    assert_eq!(w.queue_unit(q, UnitKind::Umbra), Ok(()));
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
    assert_eq!(w.res[PLAYER as usize][0], gold - 200);
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
fn the_launch_is_told_to_every_seat() {
    // Four seats on 96x96: the Expedition in seats 0 and 3, the Kingdom in 1 and 2, seats 0 and 1 a team against 2 and
    // 3. Seat 0 launches: every seat is told, "You launched" on its side (its ally of the other people too) and "The
    // enemy launched" on the other (its fellow Expedition too), and the launch is an event at its Data center (the
    // client's rocket), once.
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
                    if msg == LAUNCH_OURS || msg == LAUNCH_THEIRS =>
                {
                    told.push((team, msg == LAUNCH_OURS))
                }
                endfall_sim::world::Event::Launch { x, y, team } => launches.push((x, y, team)),
                _ => {}
            }
        }
    }
    told.sort();
    assert_eq!(
        told,
        vec![(0, true), (1, true), (2, false), (3, false)],
        "every seat told once, in its side's words"
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
fn the_expedition_ai_powers_hires_launches_and_reaches_the_portal_at_every_level() {
    // The Expedition's AI against the Kingdom's, at every level (the Kingdom's buildings made to last, so the game runs
    // its course): it raises Recruiting posts, wind turbines as its machines need Power (Easy fields none but its Bots:
    // a turbine only if those fill its Data center's 20), launches its satellite, raises an Uplink and a Portal, and
    // never stands above its places but as a lost building leaves it.
    for diff in 0..DIFF.len() {
        let mut w = World::with_setup(11, diff, MapKind::Standard, false, [&HUMANS, &VAEL]);
        w.set_ai_seats([true, true]);
        for b in w.bldgs.iter_mut().filter(|b| b.team == PLAYER) {
            (b.hp, b.maxhp) = (1e9, 1e9);
        }
        let mut seen = [false; 4]; // turbine, post, Uplink, Portal (finished)
        let mut launched = None;
        let mut power_full = false;
        let mut prev = Vec::new();
        while w.time < 15.0 * 60.0 && !(seen.iter().all(|&s| s) && launched.is_some()) {
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
        let want = [diff > 0 || power_full, true, true, true];
        assert!(
            seen.iter().zip(want).all(|(&s, w)| s || !w),
            "diff {diff}: turbine, post, Uplink, Portal: {seen:?} by {:.0} s (over {}, winner {})",
            w.time,
            w.over,
            w.winner
        );
        let t = launched.unwrap_or_else(|| panic!("diff {diff}: no launch"));
        assert!(t > 150.0, "diff {diff}: launched at {t:.0} s, not at once");
    }
}
