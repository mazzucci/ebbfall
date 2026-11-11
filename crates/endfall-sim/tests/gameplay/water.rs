//! Water (the Shore map's model, stage "the Shore map"): heights against one water level make land, shallows and
//! deep water; units get about by class (Walk: land and shallows; Fly: the air; Amph, anywhere, stays in the sim but no
//! kind has it since the re-theme); walkers wade at `WADE_SPEED`; nothing fires from deep water; both peoples build on
//! land only. On every map without
//! water every tile is land, so none of it changes anything there (the goldens pin that); these scenes are a flat
//! arena with water drawn in by hand.

use crate::common::*;
use endfall_sim::data::{Move, WADE_SPEED};
use endfall_sim::map::{Foot, Ground};

/// A flat arena (the Kingdom in seat 0, the Expedition in seat 1) with nobody's AI, everything explored, and water drawn in:
/// a band of deep water across x 30..34 (heights -3), a ford of shallows through it at y 29..31 (height 0), and a
/// strip of shallows at x 20..22 (height 0).
fn waters() -> World {
    let mut w = World::with_setup(3, 1, MapKind::Standard, false, [&HUMANS, &VAEL]);
    w.disable_ai();
    w.units.clear();
    flatten(&mut w, 12..52, 12..52);
    for y in 0..w.map.h {
        for x in 0..w.map.w {
            let i = w.map.idx(x, y);
            if (30..34).contains(&x) {
                w.map.height[i] = if (29..31).contains(&y) { 0 } else { -3 };
            } else if (20..22).contains(&x) {
                w.map.height[i] = 0;
            }
        }
    }
    for e in &mut w.explored {
        e.fill(1);
    }
    w
}
fn px(t: f64) -> f64 {
    t * 32.0 + 16.0
}
fn ground_of(w: &World, id: Id) -> Ground {
    let u = w.unit(id).unwrap();
    let (tx, ty) = w.map.tile_of(u.x, u.y);
    w.map.ground(tx, ty, w.water)
}

#[test]
fn every_unit_has_its_class() {
    // Flyers fly; every ground unit of both peoples walks (no amphibians since the re-theme).
    for k in UNIT_KINDS {
        let d = k.def();
        let want = if d.air { Move::Fly } else { Move::Walk };
        assert_eq!(d.mv, want, "{}", d.name);
    }
}

#[test]
fn heights_make_land_shallows_and_deep_water() {
    let w = waters();
    assert_eq!(w.map.ground(25, 25, 0), Ground::Land);
    assert_eq!(w.map.ground(20, 25, 0), Ground::Shallow);
    assert_eq!(w.map.ground(31, 25, 0), Ground::Deep);
    assert_eq!(w.map.ground(31, 30, 0), Ground::Shallow, "the ford");
    // The thresholds: land above the water, shallows within two of it, deep below that.
    let mut m = World::new(1, 1).map;
    let i = m.idx(5, 5);
    for (h, g) in [
        (1, Ground::Land),
        (0, Ground::Shallow),
        (-1, Ground::Shallow),
        (-2, Ground::Deep),
    ] {
        m.height[i] = h;
        assert_eq!(m.ground(5, 5, 0), g, "height {h}");
    }
    // Every generated map but the Shore is all land.
    for kind in MapKind::ALL.into_iter().filter(|&k| k != MapKind::Shore) {
        let w = World::with_map(7, 1, kind);
        assert!(
            w.map.height.iter().all(|&h| h > w.water),
            "{kind:?}: all land"
        );
    }
}

#[test]
fn a_walker_never_enters_deep_water_and_takes_the_ford() {
    // Sent across the band: the Guard and the Buggy (the Expedition's: it walks too) both take the ford; and a Guard
    // sent into the deep water stops on the shore instead.
    let mut w = waters();
    let trooper = w.make_unit(UnitKind::Trooper, PLAYER, px(25.0), px(40.0));
    let scythe = w.make_unit(UnitKind::Scythe, PLAYER, px(25.0), px(44.0)); // (one side: nobody fights)
    let wader = w.make_unit(UnitKind::Trooper, PLAYER, px(26.0), px(20.0));
    w.move_to(trooper, px(40.0), px(40.0));
    w.move_to(scythe, px(40.0), px(44.0));
    w.move_to(wader, px(32.0), px(20.0)); // (deep water)
    let mut forded = [false; 2];
    let on_ford = |w: &World, id: Id| {
        let u = w.unit(id).unwrap();
        let (tx, ty) = w.map.tile_of(u.x, u.y);
        (29..31).contains(&ty) && (30..34).contains(&tx)
    };
    for _ in 0..40 * TPS {
        w.step();
        w.events.clear();
        for id in [trooper, wader, scythe] {
            assert_ne!(ground_of(&w, id), Ground::Deep, "a walker in deep water");
        }
        forded[0] |= on_ford(&w, trooper);
        forded[1] |= on_ford(&w, scythe);
    }
    let (t, s) = (w.unit(trooper).unwrap(), w.unit(scythe).unwrap());
    assert!(
        forded[0] && (t.x - px(40.0)).abs() < 20.0 && (t.y - px(40.0)).abs() < 20.0,
        "the Guard got there by the ford: {:?}",
        (t.x, t.y)
    );
    assert!(
        forded[1] && (s.x - px(40.0)).abs() < 20.0 && (s.y - px(44.0)).abs() < 20.0,
        "so did the Buggy: {:?}",
        (s.x, s.y)
    );
    let wd = w.unit(wader).unwrap();
    let (gx, gy) = w.map.tile_of(wd.x, wd.y);
    assert!(
        w.map.ground(gx, gy, 0) == Ground::Land && (gx - 32).abs() <= 2 && (gy - 20).abs() <= 2,
        "sent into deep water, the Trooper stops on the nearest dry ground (by the ford if need be): {:?}",
        (gx, gy)
    );
    // The routes themselves: a walker's never crosses deep water.
    let foot = w.foot(UnitKind::Trooper);
    assert_eq!(
        foot,
        Foot {
            class: Move::Walk,
            water: 0
        }
    );
    assert_eq!(
        w.foot(UnitKind::Scythe),
        foot,
        "the Expedition's ground units walk too"
    );
    assert!(!w.map.passable(foot, 31, 25) && w.map.passable(foot, 31, 29));
}

#[test]
fn walkers_wade_slower_in_the_shallows() {
    // Over two seconds each: a Guard on land, a Guard in the shallows (the strip at x 20..22, walking along it), and a
    // Bot in the shallows, which wades as well (it walks since the re-theme; a Radio tower by the strip keeps it in
    // range, so the wading alone slows it).
    let mut w = waters();
    w.make_building(BldgKind::Ward, ENEMY, 26, 12, true);
    let on_land = w.make_unit(UnitKind::Trooper, PLAYER, px(25.0), px(14.0));
    let wading = w.make_unit(UnitKind::Trooper, PLAYER, px(21.0), px(14.0));
    let lumen = w.make_unit(UnitKind::Lumen, ENEMY, px(20.0), px(14.0));
    for id in [on_land, wading, lumen] {
        let u = w.unit(id).unwrap();
        let x = u.x;
        w.move_to(id, x, px(48.0));
    }
    let y0: Vec<f64> = [on_land, wading, lumen]
        .iter()
        .map(|&id| w.unit(id).unwrap().y)
        .collect();
    for _ in 0..2 * TPS {
        w.step();
        w.events.clear();
        assert_eq!(
            ground_of(&w, wading),
            Ground::Shallow,
            "it stays in the strip"
        );
        assert_eq!(ground_of(&w, lumen), Ground::Shallow, "so does the Bot");
    }
    let gone: Vec<f64> = [on_land, wading, lumen]
        .iter()
        .zip(&y0)
        .map(|(&id, y)| w.unit(id).unwrap().y - y)
        .collect();
    let speed = |k: UnitKind| k.def().speed * 2.0;
    assert!(
        (gone[0] / speed(UnitKind::Trooper) - 1.0).abs() < 0.05,
        "on land, full speed: {gone:?}"
    );
    assert!(
        (gone[1] / gone[0] - WADE_SPEED).abs() < 0.03,
        "in the shallows, {WADE_SPEED} of it: {gone:?}"
    );
    assert!(
        (gone[2] / speed(UnitKind::Lumen) - WADE_SPEED).abs() < 0.05,
        "a Bot wades as slowly: {gone:?}"
    );
}

#[test]
fn nothing_fires_from_deep_water() {
    // A Prism holding in deep water by the shore, a held Trooper in its range on land (and out of the Trooper's own
    // range: the Prism outranges it): no shot. Ordered to attack, the Prism comes out of the water and fires.
    let mut w = waters();
    let prism = w.make_unit(UnitKind::Prism, ENEMY, px(31.5), px(40.0));
    let target = w.make_unit(UnitKind::Trooper, PLAYER, px(36.5), px(40.0));
    w.hold_unit(prism);
    w.hold_unit(target);
    assert_eq!(ground_of(&w, prism), Ground::Deep);
    let hp = w.unit(target).unwrap().hp;
    for _ in 0..4 * TPS {
        w.step();
        w.events.clear();
    }
    assert_eq!(
        w.unit(target).unwrap().hp,
        hp,
        "held in deep water, in range, the Prism does not fire"
    );
    w.attack_ent(prism, target);
    let mut fired_from = None;
    for _ in 0..10 * TPS {
        w.step();
        w.events.clear();
        if fired_from.is_none() && w.unit(target).is_none_or(|t| t.hp < hp) {
            fired_from = w.unit(prism).map(|_| ground_of(&w, prism));
        }
    }
    assert!(
        matches!(fired_from, Some(Ground::Shallow | Ground::Land)),
        "ordered to attack, it fires once out of the deep: {fired_from:?}"
    );
}

#[test]
fn both_peoples_build_on_land_only() {
    // Every builder walks since the re-theme: both peoples build on land, never in the shallows or deep water.
    let w = waters();
    let (land, shallows, deep) = ((24, 40), (20, 40), (31, 40));
    for (team, kind) in [(PLAYER, BldgKind::Depot), (ENEMY, BldgKind::Spire)] {
        let got = [land, shallows, deep].map(|(x, y)| w.builds_on(team, x, y));
        assert_eq!(
            got,
            [true, false, false],
            "{kind:?}'s side: land, shallows, deep"
        );
    }
    // Whole footprints (2x2): on the shallows strip refused, on land beside it fine; in the deep water refused, and
    // one half over it too.
    assert_eq!((BldgKind::Depot.def().w, BldgKind::Spire.def().w), (2, 2));
    for (team, kind) in [(PLAYER, BldgKind::Depot), (ENEMY, BldgKind::Spire)] {
        assert!(
            !w.can_place(kind, 20, 40, team) && w.can_place(kind, 24, 40, team),
            "{kind:?}: not in the shallows, on land"
        );
        assert!(
            !w.can_place(kind, 31, 44, team),
            "{kind:?}: not in deep water"
        );
        assert!(!w.can_place(kind, 29, 44, team), "{kind:?}: not half in it");
    }
}

#[test]
fn fired_on_in_deep_water_it_does_not_fire_back_from_there() {
    // A Trooper on the shore shoots a Prism resting in deep water: the Prism answers, but only once it has come out
    // onto shallows or land; while it is in deep water the Trooper takes nothing.
    let mut w = waters();
    let prism = w.make_unit(UnitKind::Prism, ENEMY, px(31.5), px(40.0));
    let trooper = w.make_unit(UnitKind::Trooper, PLAYER, px(28.0), px(40.0));
    w.hold_unit(trooper);
    w.attack_ent(trooper, prism);
    let hp = w.unit(trooper).unwrap().hp;
    let mut answered = false;
    for _ in 0..12 * TPS {
        w.step();
        w.events.clear();
        let (Some(p), Some(t)) = (w.unit(prism), w.unit(trooper)) else {
            break;
        };
        let deep = {
            let (tx, ty) = w.map.tile_of(p.x, p.y);
            w.map.ground(tx, ty, w.water) == Ground::Deep
        };
        if t.hp < hp {
            assert!(
                !deep || answered,
                "the Trooper was hit while the Prism stood in deep water"
            );
            answered = true;
        }
    }
    assert!(answered, "the Prism came out and answered");
}
