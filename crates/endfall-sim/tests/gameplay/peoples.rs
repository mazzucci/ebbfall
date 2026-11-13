//! The re-theme's peoples (rules PR): the Kingdom (sim race `humans`) and the Expedition (`vael`). Each building's
//! production list, no cloak, no shields and no detection, every ground unit walking, and the healers kept in the
//! tables, trained nowhere and still healing.

use super::common::*;
use endfall_sim::data::Move;

#[test]
fn each_building_trains_its_peoples_list() {
    use BldgKind::*;
    use UnitKind::*;
    let lists: [(BldgKind, &[UnitKind]); 9] = [
        (Core, &[Harvester]),
        (Barracks, &[Trooper, Lancer]),
        (Airfield, &[Rider, Knight]),
        (Factory, &[Bastion, SiegeTank, Observer]),
        (Conflux, &[Lumen]),
        (Siphon, &[Prism, Bruiser]),
        (Kiln, &[Scythe, Shrike]),
        (Eclipse, &[Umbra, Monolith]),
        (Forge, &[]),
    ];
    for (b, units) in lists {
        assert_eq!(b.def().trains, units, "{b:?}");
    }
    for b in [Depot, Extractor, Turret, Spire, Loom, Ward, Uplink] {
        assert!(b.def().trains.is_empty(), "{b:?} trains nothing");
    }
    // The requirements: the heavies wait for their people's tech (the Kingdom's Forge, the Expedition's Lab).
    for (u, req) in [
        (Knight, Some(Forge)),
        (Bastion, Some(Forge)),
        (SiegeTank, Some(Forge)),
        (Rider, None),
        (Observer, None),
        (Bruiser, Some(Loom)),
        (Monolith, None),
        (Prism, None),
        (Scythe, None),
        (Shrike, Some(Loom)),
        (Umbra, None),
    ] {
        assert_eq!(u.def().req, req, "{u:?}");
    }
    // Each people builds its own, the Expedition's Recruiting post first (its barracks).
    assert_eq!(VAEL.build_basic[0], Siphon);
    assert!(Siphon.def().req.is_none());
    for b in [Kiln, Loom] {
        assert_eq!(b.def().req, Some(Siphon), "{b:?}");
    }
    assert_eq!(
        Ward.def().req,
        None,
        "the Sentry mast: basic, the early defense"
    );
    // (the Portal: once an Uplink stands, which needs a Lab; it trains only while one stands)
    assert_eq!(Eclipse.def().req, Some(Uplink));
    assert_eq!(Eclipse.def().trains_with, Some(Uplink));
    assert_eq!(Uplink.def().req, Some(Loom));
    // The Kingdom's Stables need its Blacksmith (the top tier's way, serial since the arc); its Market, one a Castle,
    // built in the base, the Barracks.
    assert_eq!(Airfield.def().req, Some(Forge));
    assert_eq!(Extractor.def().req, Some(Barracks));
    assert!(Extractor.def().pays && Extractor.def().per_hq && !Siphon.def().pays);
    for f in FACTIONS {
        let other = FACTIONS.iter().find(|o| o.key != f.key).unwrap();
        for &b in f.build_basic.iter().chain(f.build_advanced) {
            assert!(!other.builds(b), "{b:?} is {}'s only", f.key);
        }
    }
    // Every unit takes places in its pool (population or Power, or hired places).
    for k in UNIT_KINDS {
        assert!(k.def().supply >= 1, "{k:?}");
    }
}

#[test]
fn nothing_is_ever_hidden() {
    // No cloak and no detection since the re-theme: the Android (the Undertow's place, which lurked) is seen and shot
    // wherever its enemy has sight, after standing still as long as it likes; the snapshot sends nothing about cloaks.
    let mut w = flat_arena(5);
    w.factions = vec![&HUMANS, &VAEL];
    let (x, y) = (30.0 * TILE, 30.0 * TILE);
    let android = w.make_unit(UnitKind::Umbra, ENEMY, x + 5.0 * TILE, y);
    let archer = w.make_unit(UnitKind::Lancer, PLAYER, x, y);
    set_hp(&mut w, android, 1e6);
    set_hp(&mut w, archer, 1e6);
    w.hold_unit(android);
    w.hold_unit(archer);
    let hp0 = w.unit(android).unwrap().hp;
    run(&mut w, 10);
    assert!(w.seen_by(PLAYER, android), "seen after ten still seconds");
    assert!(w.can_hit(archer, android));
    assert!(w.unit(android).unwrap().hp < hp0, "and shot");
    let fields = endfall_sim::snapshot::UNIT_FIELDS;
    assert!(
        !fields.contains(&"hid") && !fields.contains(&"cloaked"),
        "{fields:?}"
    );
    // Nothing detects either: no unit or building has a detection radius any more (the field is gone from the data).
    let json = endfall_sim::data::data_json();
    assert!(
        !json.contains("detect") && !json.contains("cloak"),
        "{json}"
    );
}

#[test]
fn every_ground_unit_walks() {
    // No amphibious movement: every ground unit of both peoples walks (land and shallows, never deep water), the Bot
    // too; flyers fly. (`Move::Amph` stays in the sim, unused.)
    for k in UNIT_KINDS {
        let d = k.def();
        let want = if d.air { Move::Fly } else { Move::Walk };
        assert_eq!(d.mv, want, "{k:?}");
    }
    assert_eq!(VAEL.worker.def().mv, Move::Walk, "the Bot walks");
}

#[test]
fn the_healers_are_trained_nowhere_and_still_heal() {
    // The Mender and the Tender stay in the tables (the heal rules and their tests), but no building of either people
    // trains them and the AI never builds one; spawned in a test, a Mender still heals.
    for k in [UnitKind::Medic, UnitKind::Halo] {
        assert!(k.def().heal > 0.0, "{k:?} heals");
        assert!(!k.trainable(), "{k:?} is trained nowhere");
        for f in FACTIONS {
            assert!(f.ai.mix.iter().all(|m| m.0 != k), "{k:?} in no AI mix");
        }
    }
    for k in UNIT_KINDS {
        assert_eq!(
            k.trainable(),
            k.def().heal == 0.0,
            "{k:?}: all but the healers are trained"
        );
    }
    let mut w = arena(11);
    w.make_unit(UnitKind::Medic, PLAYER, 600.0, 900.0);
    let guard = w.make_unit(UnitKind::Trooper, PLAYER, 630.0, 900.0);
    w.units.iter_mut().find(|u| u.id == guard).unwrap().hp = 10.0;
    run(&mut w, 12);
    let u = w.unit(guard).unwrap();
    assert_eq!(u.hp, u.maxhp, "a spawned Mender heals a Guard to full");
}
