//! The Kingdom (sim race `humans`; the Harbour before the re-theme): the Castle, villagers that build and repair,
//! Guards and Archers from the Barracks, Riders and Knights from the Stables, Ballistas, Trebuchets and the Balloon from
//! the Workshop, and Towers. Keys never change; the names are display strings only.

use super::*;

pub const HUMANS: Faction = Faction {
    key: "humans",
    name: "Kingdom",
    hq: BldgKind::Core,
    worker: UnitKind::Harvester,
    // The basic page holds what can be built from the start (the Core too), the Crew Hall first; the advanced page
    // what needs the Crew Hall (the Turret and the Excavator too), so it appears once the Crew Hall stands (owner,
    // 2026-11-03; the Excavator moved there with its requirement, the PM, 2026-11-06).
    build_basic: &[BldgKind::Barracks, BldgKind::Depot, BldgKind::Core],
    build_advanced: &[
        BldgKind::Forge,
        BldgKind::Airfield,
        BldgKind::Turret,
        BldgKind::Factory,
        BldgKind::Extractor,
    ],
    supply: BldgKind::Depot,
    market: Some(BldgKind::Extractor),
    sounds: ["bolt", "shell", "missile", "melee"],
    repairs: true,
    power: false,
    ai: AiScript {
        rax: BldgKind::Barracks,
        tech: BldgKind::Forge,
        tech2: None,
        tower: BldgKind::Turret,
        relay: None,
        air: BldgKind::Airfield,
        heavy: Some(BldgKind::Factory),
        basic: UnitKind::Trooper,
        anti_air: UnitKind::Lancer,
        heavy_anti_air: Some(UnitKind::Bastion),
        // (an Archer per Guard behind the spears; a Trebuchet per six Guards from 5:30 and a Ballista per eight from
        // the Workshop; a Knight per four from the Stables)
        mix: &[
            (UnitKind::Lancer, 1, 0.0),
            (UnitKind::SiegeTank, 6, 330.0),
            (UnitKind::Bastion, 8, 0.0),
            (UnitKind::Knight, 4, 0.0),
        ],
        raider: UnitKind::Rider,
        scout: Some(UnitKind::Observer),
        wave_scale: 1.0,
        tech_from: 210.0, // (the Forge sooner: the Workshop's Trebuchets and the Knights earlier)
        air_lead: 0.0,
    },
};

pub(super) const HARVESTER: UnitDef = UnitDef {
    key: "harvester",
    name: "Villager",
    worker: true,
    cost: [50, 0],
    hp: 40.0,
    speed: 96.0,
    sight: 7.0,
    build: 12.0,
    weapon: Some(Weapon {
        range: 0.6,
        dmg: 4.0,
        cd: 1.0,
        melee: true,
        ..W
    }),
    ..UNIT
};
/// The Guard: spear infantry, the Kingdom's cheap line. Braced (`Brace`, once Sandbags are researched) it stands and
/// takes the charge: +4 armour, no moving.
pub(super) const TROOPER: UnitDef = UnitDef {
    key: "trooper",
    name: "Guard",
    cost: [50, 0],
    hp: 60.0,
    armor: 1.0,
    speed: 90.0,
    build: 15.0,
    bio: true,
    weapon: Some(Weapon {
        range: 0.8,
        dmg: 7.0,
        cd: 1.0,
        melee: true,
        up_dmg: 1.0,
        ..W
    }),
    abilities: &[AbilityKind::Entrench],
    ..UNIT
};
/// The Archer: ranged infantry behind the Guards, slow to draw, ground and air (its numbers the Harpooner's, whose
/// shot still slows what it hits: `Weapon::slow`).
pub(super) const LANCER: UnitDef = UnitDef {
    key: "lancer",
    name: "Archer",
    cost: [75, 0],
    hp: 60.0,
    speed: 88.0,
    sight: 9.0,
    build: 18.0,
    bio: true,
    weapon: Some(Weapon {
        range: 6.0,
        dmg: 16.0,
        dmg_air: 24.0,
        cd: 2.5,
        proj: Some(ProjKind::Missile),
        up_dmg: 2.0,
        slow: 3.0, // (half speed and no abilities for 3 s, past its 2.5 s reload)
        ..W
    }),
    ..UNIT
};
/// The Trebuchet: back-line siege. Deployed (`Deploy`), it outranges everything on the ground and splashes hard, but
/// cannot hit what comes within its blind ring, nor flyers, and its reach is past its own sight: it fires on what its
/// side sees. Packed up it has no weapon.
pub(super) const SIEGE_TANK: UnitDef = UnitDef {
    key: "siegeTank",
    name: "Trebuchet",
    cost: [175, 0],
    supply: 3,
    hp: 140.0,
    armor: 1.0,
    speed: 62.0,
    sight: 10.0,
    r: 14.0,
    build: 32.0,
    req: Some(BldgKind::Forge),
    weapon: Some(Weapon {
        range: 11.0,
        min_range: 2.5,
        siege: true,
        dmg: 55.0,
        cd: 3.0,
        proj: Some(ProjKind::Shell),
        up_dmg: 5.0,
        splash: 0.75,
        splash_r: 64.0,
        ..W
    }),
    abilities: &[AbilityKind::Deploy],
    ..UNIT
};
/// The Ballista: a bolt thrower on wheels, the Kingdom's answer to flyers (the Netter's place), whose bolts hurt the
/// ground less.
pub(super) const BASTION: UnitDef = UnitDef {
    key: "bastion",
    name: "Ballista",
    cost: [125, 0],
    supply: 2,
    hp: 120.0,
    armor: 1.0,
    speed: 80.0,
    sight: 9.0,
    r: 13.0,
    build: 26.0,
    req: Some(BldgKind::Forge),
    weapon: Some(Weapon {
        range: 7.0,
        dmg: 12.0,
        dmg_air: 28.0,
        cd: 1.2,
        proj: Some(ProjKind::Missile),
        up_dmg: 2.0,
        ..W
    }),
    ..UNIT
};
/// A healer: in the tables (the heal rules keep their tests), trained nowhere since the re-theme.
pub(super) const MEDIC: UnitDef = UnitDef {
    key: "medic",
    name: "Healer",
    cost: [50, 0],
    hp: 45.0,
    speed: 90.0,
    build: 20.0,
    bio: true,
    heal: 5.0,
    req: Some(BldgKind::Forge),
    ..UNIT
};
/// The Balloon: an unarmed scout, slow, with a long sight; the Kingdom's only flyer. Seen and shot like any flyer.
pub(super) const OBSERVER: UnitDef = UnitDef {
    key: "observer",
    name: "Balloon",
    cost: [50, 0],
    hp: 60.0,
    speed: 70.0,
    sight: 12.0,
    r: 10.0,
    build: 18.0,
    air: true,
    mv: Move::Fly,
    ..UNIT
};
/// The Rider: light cavalry, the Kingdom's fast raider (the Kite's place, on the ground).
pub(super) const RIDER: UnitDef = UnitDef {
    key: "rider",
    name: "Rider",
    cost: [100, 0],
    supply: 2,
    hp: 90.0,
    speed: 140.0,
    sight: 9.0,
    r: 12.0,
    build: 24.0,
    weapon: Some(Weapon {
        range: 0.8,
        dmg: 10.0,
        cd: 0.8,
        melee: true,
        up_dmg: 1.0,
        ..W
    }),
    ..UNIT
};
/// The Knight: heavy cavalry, the Kingdom's top tier.
pub(super) const KNIGHT: UnitDef = UnitDef {
    key: "knight",
    name: "Knight",
    cost: [225, 0],
    supply: 4,
    hp: 280.0,
    armor: 3.0,
    speed: 105.0,
    sight: 9.0,
    r: 14.0,
    build: 40.0,
    req: Some(BldgKind::Forge),
    weapon: Some(Weapon {
        range: 0.9,
        dmg: 26.0,
        cd: 1.2,
        melee: true,
        up_dmg: 3.0,
        ..W
    }),
    ..UNIT
};
pub(super) const CORE: BldgDef = BldgDef {
    key: "core",
    hq: true,
    name: "Castle",
    cost: [400, 0],
    w: 4,
    h: 4,
    hp: 1300.0,
    armor: 2.0,
    supply: 20,
    build: 75.0,
    sight: 10.0,
    trains: &[UnitKind::Harvester],
    dropoff: true,
    ..BLDG
};
pub(super) const DEPOT: BldgDef = BldgDef {
    key: "depot",
    name: "Cottage",
    cost: [100, 0],
    hp: 360.0,
    supply: 8,
    build: 22.0,
    ..BLDG
};
/// The Market: pays salt by itself, built in the base (no shaft since the re-theme's economy), one per Castle.
pub(super) const EXTRACTOR: BldgDef = BldgDef {
    key: "extractor",
    name: "Market",
    cost: [75, 0],
    hp: 200.0,
    build: 25.0,
    pays: true,
    per_hq: true,
    // (its people's barracks first: workers on the crystals, then soldiers, then the Market)
    req: Some(BldgKind::Barracks),
    ..BLDG
};
pub(super) const BARRACKS: BldgDef = BldgDef {
    key: "barracks",
    name: "Barracks",
    cost: [150, 0],
    w: 3,
    h: 3,
    hp: 720.0,
    build: 40.0,
    sight: 7.0,
    trains: &[UnitKind::Trooper, UnitKind::Lancer],
    ..BLDG
};
pub(super) const FORGE: BldgDef = BldgDef {
    key: "forge",
    researches: &[
        Upgrade::Weapons,
        Upgrade::Armor,
        Upgrade::Entrenching,
        Upgrade::RapidConstruction,
    ],
    name: "Blacksmith",
    cost: [150, 0],
    hp: 820.0,
    build: 45.0,
    sight: 7.0,
    trains: &[],
    req: Some(BldgKind::Barracks),
    ..BLDG
};
/// The Workshop: Ballistas, Trebuchets (both need the Forge too) and the Balloon.
pub(super) const FACTORY: BldgDef = BldgDef {
    key: "factory",
    name: "Workshop",
    cost: [125, 0],
    w: 3,
    h: 3,
    hp: 800.0,
    build: 35.0,
    sight: 7.0,
    trains: &[UnitKind::Bastion, UnitKind::SiegeTank, UnitKind::Observer],
    req: Some(BldgKind::Barracks),
    ..BLDG
};
pub(super) const TURRET: BldgDef = BldgDef {
    key: "turret",
    name: "Watchtower",
    cost: [100, 0],
    hp: 320.0,
    build: 20.0,
    sight: 9.0,
    req: Some(BldgKind::Barracks),
    weapon: Some(Weapon {
        range: 7.0,
        dmg: 18.0,
        dmg_air: 26.0,
        cd: 1.1,
        proj: Some(ProjKind::Bolt),
        up_dmg: 2.0,
        ..W
    }),
    ..BLDG
};
/// The Stables: Riders, and Knights once the Forge stands.
pub(super) const AIRFIELD: BldgDef = BldgDef {
    key: "airfield",
    name: "Stables",
    cost: [150, 0],
    w: 3,
    h: 3,
    hp: 760.0,
    build: 50.0,
    sight: 8.0,
    trains: &[UnitKind::Rider, UnitKind::Knight],
    req: Some(BldgKind::Extractor), // (the cavalry needs a Market: a branch of its own, beside the Forge)
    researches: &[Upgrade::Afterburners],
    ..BLDG
};
