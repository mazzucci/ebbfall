//! The Humans: the Core, harvesters that build and repair, infantry, vehicles (Vanguards and Siege Tanks from the
//! Factory), Turrets and Raiders.

use super::*;

pub const HUMANS: Faction = Faction {
    key: "humans",
    name: "Humans",
    hq: BldgKind::Core,
    worker: UnitKind::Harvester,
    build_basic: &[
        BldgKind::Depot,
        BldgKind::Barracks,
        BldgKind::Extractor,
        BldgKind::Turret,
    ],
    build_advanced: &[
        BldgKind::Forge,
        BldgKind::Airfield,
        BldgKind::Core,
        BldgKind::Factory,
    ],
    supply: BldgKind::Depot,
    ether: BldgKind::Extractor,
    power: None,
    sounds: ["bolt", "shell", "missile", "melee"],
    repairs: true,
    warp: false,
    ai: AiScript {
        rax: BldgKind::Barracks,
        tech: BldgKind::Forge,
        tech2: None,
        tower: BldgKind::Turret,
        air: BldgKind::Airfield,
        heavy: Some(BldgKind::Factory),
        basic: UnitKind::Trooper,
        anti_air: UnitKind::Lancer,
        mix: &[
            (UnitKind::Medic, 6, 0.0),
            (UnitKind::SiegeTank, 6, 330.0),
            (UnitKind::Vanguard, 2, 0.0),
        ],
        raider: UnitKind::Raider,
        wave_scale: 1.0,
        tech_from: 300.0,
        air_lead: 0.0,
    },
};

pub(super) const HARVESTER: UnitDef = UnitDef {
    key: "harvester",
    name: "Harvester",
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
pub(super) const TROOPER: UnitDef = UnitDef {
    key: "trooper",
    name: "Trooper",
    cost: [50, 0],
    hp: 48.0,
    speed: 92.0,
    build: 15.0,
    bio: true,
    weapon: Some(Weapon {
        range: 4.5,
        dmg: 7.0,
        dmg_air: 7.0,
        cd: 0.8,
        proj: Some(ProjKind::Bolt),
        up_dmg: 1.0,
        ..W
    }),
    abilities: &[AbilityKind::Stim],
    ..UNIT
};
pub(super) const VANGUARD: UnitDef = UnitDef {
    key: "vanguard",
    name: "Vanguard",
    cost: [125, 75],
    supply: 3,
    hp: 170.0,
    armor: 2.0,
    speed: 68.0,
    sight: 9.0,
    r: 14.0,
    build: 28.0,
    req: Some(BldgKind::Forge),
    weapon: Some(Weapon {
        range: 6.0,
        dmg: 30.0,
        cd: 1.7,
        proj: Some(ProjKind::Shell),
        up_dmg: 3.0,
        splash: SHELL_SPLASH,
        splash_r: SHELL_SPLASH_R,
        ..W
    }),
    ..UNIT
};
/// Back-line artillery: deployed (`Deploy`), its siege gun outranges everything on the ground and splashes hard, but
/// cannot hit what comes within its blind ring, nor flyers, and its reach is past its own sight: it fires on what its
/// side sees. On its tracks it has only a light gun.
pub(super) const SIEGE_TANK: UnitDef = UnitDef {
    key: "siegeTank",
    name: "Siege Tank",
    cost: [150, 125],
    supply: 3,
    hp: 160.0,
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
        dmg: 60.0,
        cd: 3.0,
        proj: Some(ProjKind::Shell),
        up_dmg: 5.0,
        splash: 0.75,
        splash_r: 64.0,
        ..W
    }),
    // On its tracks: a light gun, clearly second to the siege gun (no splash, no blind ring, no need of a spotter).
    light: Some(Weapon {
        range: 6.0,
        dmg: 13.0,
        cd: 1.2,
        proj: Some(ProjKind::Bolt),
        up_dmg: 1.0,
        ..W
    }),
    abilities: &[AbilityKind::Deploy],
    ..UNIT
};
pub(super) const LANCER: UnitDef = UnitDef {
    key: "lancer",
    name: "Lancer",
    cost: [75, 25],
    hp: 60.0,
    speed: 88.0,
    sight: 9.0,
    build: 18.0,
    bio: true,
    weapon: Some(Weapon {
        range: 6.0,
        dmg: 9.0,
        dmg_air: 30.0,
        cd: 1.2,
        proj: Some(ProjKind::Missile),
        up_dmg: 2.0,
        ..W
    }),
    ..UNIT
};
pub(super) const MEDIC: UnitDef = UnitDef {
    key: "medic",
    name: "Medic",
    cost: [40, 20],
    hp: 45.0,
    speed: 90.0,
    build: 20.0,
    bio: true,
    heal: 14.0,
    req: Some(BldgKind::Forge),
    ..UNIT
};
/// The Humans' capital ship: slow, armoured, its cannon splashes the ground and reaches flyers.
pub(super) const BASTION: UnitDef = UnitDef {
    key: "bastion",
    name: "Bastion",
    cost: [300, 250],
    supply: 6,
    hp: 450.0,
    armor: 2.0,
    speed: 58.0,
    sight: 10.0,
    r: 18.0,
    build: 60.0,
    air: true,
    capital: true,
    weapon: Some(Weapon {
        range: 6.5,
        dmg: 24.0,
        dmg_air: 18.0,
        cd: 1.4,
        proj: Some(ProjKind::Shell),
        up_dmg: 3.0,
        splash: SHELL_SPLASH,
        splash_r: SHELL_SPLASH_R,
        ..W
    }),
    ..UNIT
};
pub(super) const RAIDER: UnitDef = UnitDef {
    key: "raider",
    name: "Raider",
    cost: [100, 60],
    supply: 2,
    hp: 100.0,
    speed: 150.0,
    sight: 9.0,
    r: 10.0,
    build: 24.0,
    air: true,
    weapon: Some(Weapon {
        range: 3.0,
        dmg: 9.0,
        cd: 0.7,
        proj: Some(ProjKind::Bolt),
        up_dmg: 1.0,
        ..W
    }),
    abilities: &[AbilityKind::Cloak],
    ..UNIT
};
/// A cheap unarmed flying scout: fast, sees far, flies over cliffs. Cloaked (the other side sees it only where it
/// detects: near a Turret, a Ward or an Observer of its own), and a detector itself.
pub(super) const OBSERVER: UnitDef = UnitDef {
    key: "observer",
    name: "Observer",
    cost: [25, 25],
    hp: 40.0,
    speed: 175.0,
    sight: 10.0,
    r: 8.0,
    build: 14.0,
    air: true,
    cloaked: true,
    detect: 7.0,
    ..UNIT
};
pub(super) const CORE: BldgDef = BldgDef {
    key: "core",
    hq: true,
    name: "Command Core",
    cost: [400, 0],
    w: 4,
    h: 4,
    hp: 1300.0,
    armor: 2.0,
    supply: 10,
    build: 75.0,
    sight: 10.0,
    trains: &[UnitKind::Harvester],
    dropoff: true,
    ..BLDG
};
pub(super) const DEPOT: BldgDef = BldgDef {
    key: "depot",
    name: "Supply Depot",
    cost: [100, 0],
    hp: 360.0,
    supply: 8,
    build: 22.0,
    ..BLDG
};
pub(super) const EXTRACTOR: BldgDef = BldgDef {
    key: "extractor",
    name: "Ether Rig",
    short: "Ether Rig",
    cost: [75, 0],
    hp: 420.0,
    build: 25.0,
    on_vent: true,
    ..BLDG
};
pub(super) const BARRACKS: BldgDef = BldgDef {
    key: "barracks",
    name: "Garrison",
    cost: [150, 0],
    w: 3,
    h: 3,
    hp: 720.0,
    build: 40.0,
    sight: 7.0,
    trains: &[UnitKind::Trooper, UnitKind::Lancer, UnitKind::Medic],
    ..BLDG
};
pub(super) const FORGE: BldgDef = BldgDef {
    key: "forge",
    researches: &[
        Upgrade::Weapons,
        Upgrade::Armor,
        Upgrade::CloakingField,
        Upgrade::RapidConstruction,
    ],
    name: "Foundry",
    cost: [150, 100],
    hp: 820.0,
    build: 45.0,
    sight: 7.0,
    trains: &[],
    req: Some(BldgKind::Barracks),
    ..BLDG
};
/// The vehicle bay: Vanguards and Siege Tanks (both need the Foundry too).
pub(super) const FACTORY: BldgDef = BldgDef {
    key: "factory",
    name: "Factory",
    cost: [125, 50],
    w: 3,
    h: 3,
    hp: 800.0,
    build: 35.0,
    sight: 7.0,
    trains: &[UnitKind::Vanguard, UnitKind::SiegeTank],
    req: Some(BldgKind::Barracks),
    ..BLDG
};
pub(super) const TURRET: BldgDef = BldgDef {
    key: "turret",
    name: "Turret",
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
    detect: 7.0, // (reveals cloaked units within its range)
    ..BLDG
};
pub(super) const AIRFIELD: BldgDef = BldgDef {
    key: "airfield",
    name: "Airfield",
    cost: [150, 100],
    w: 3,
    h: 3,
    hp: 760.0,
    build: 50.0,
    sight: 8.0,
    trains: &[UnitKind::Raider, UnitKind::Observer, UnitKind::Bastion],
    req: Some(BldgKind::Barracks), // (air is a branch of its own, beside the ground tech)
    researches: &[Upgrade::Afterburners],
    ..BLDG
};
