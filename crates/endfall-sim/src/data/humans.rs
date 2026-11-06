//! The Humans: the Core, harvesters that build and repair, infantry, vehicles (Vanguards, Siege Tanks and
//! Interceptors from the Factory), Turrets and Raiders.

use super::*;

pub const HUMANS: Faction = Faction {
    key: "humans",
    name: "Harbour",
    hq: BldgKind::Core,
    worker: UnitKind::Harvester,
    // The basic page holds what can be built from the start (the Core too); the advanced page what needs the
    // Garrison (the Turret too), so it appears once the Garrison stands (owner, 2026-11-03).
    build_basic: &[
        BldgKind::Depot,
        BldgKind::Barracks,
        BldgKind::Extractor,
        BldgKind::Core,
    ],
    build_advanced: &[
        BldgKind::Forge,
        BldgKind::Airfield,
        BldgKind::Turret,
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
        heavy_anti_air: Some(UnitKind::Interceptor),
        // (Roster v2's Line: a Harpooner per two Pickets, its harpoon slowing what closes in; a Mender per six behind
        // them; Breakwaters at the front once the Slipway stands)
        mix: &[
            (UnitKind::Lancer, 2, 0.0),
            (UnitKind::Medic, 6, 0.0),
            (UnitKind::SiegeTank, 6, 330.0),
            (UnitKind::Vanguard, 2, 0.0),
        ],
        raider: UnitKind::Raider,
        wave_scale: 1.0,
        tech_from: 210.0, // (the Workshop sooner: Menders and the Slipway's Breakwaters earlier)
        air_lead: 0.0,
    },
};

pub(super) const HARVESTER: UnitDef = UnitDef {
    key: "harvester",
    name: "Rigger",
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
    name: "Picket",
    cost: [50, 0],
    hp: 45.0,
    speed: 92.0,
    build: 15.0,
    bio: true,
    weapon: Some(Weapon {
        range: 4.5,
        dmg: 7.0,
        cd: 1.0,
        proj: Some(ProjKind::Bolt),
        up_dmg: 1.0,
        ..W
    }),
    abilities: &[AbilityKind::Entrench],
    ..UNIT
};
/// The Breakwater (Roster v2): an armoured walker that beaches itself where it fights (`Beach`, by itself, 2 s): beached,
/// armour 6 and its splash gun; on the move a light gun only. It packs up when sent to move.
pub(super) const VANGUARD: UnitDef = UnitDef {
    key: "vanguard",
    name: "Breakwater",
    cost: [150, 0],
    supply: 3,
    hp: 200.0,
    armor: 2.0,
    speed: 68.0,
    sight: 9.0,
    r: 14.0,
    build: 28.0,
    req: Some(BldgKind::Forge),
    weapon: Some(Weapon {
        range: 2.0,
        siege: true,
        dmg: 20.0,
        cd: 1.5,
        proj: Some(ProjKind::Shell),
        up_dmg: 3.0,
        splash: SHELL_SPLASH,
        splash_r: SHELL_SPLASH_R,
        ..W
    }),
    light: Some(Weapon {
        range: 1.5,
        dmg: 10.0,
        cd: 1.5,
        proj: Some(ProjKind::Bolt),
        up_dmg: 1.0,
        ..W
    }),
    abilities: &[AbilityKind::Beach],
    ..UNIT
};
/// Back-line artillery: deployed (`Deploy`), its siege gun outranges everything on the ground and splashes hard, but
/// cannot hit what comes within its blind ring, nor flyers, and its reach is past its own sight: it fires on what its
/// side sees. On its tracks it has no gun.
pub(super) const SIEGE_TANK: UnitDef = UnitDef {
    key: "siegeTank",
    name: "Anchor Gun",
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
/// The Harpooner: a slow-firing crewman, ground and air, whose harpoon slows what it hits (`Weapon::slow`); the Netter
/// is the faster, tougher answer to flyers.
pub(super) const LANCER: UnitDef = UnitDef {
    key: "lancer",
    name: "Harpooner",
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
        slow: 3.0, // (the Harpoon: half speed and no abilities for 3 s, past its 2.5 s reload)
        ..W
    }),
    ..UNIT
};
/// Ground anti-air: a fast missile vehicle that escorts the line against flyers. It cannot hit the ground at all (and
/// detects nothing: that stays the Observer's job).
pub(super) const INTERCEPTOR: UnitDef = UnitDef {
    key: "interceptor",
    name: "Netter",
    cost: [100, 0],
    supply: 2,
    hp: 110.0,
    armor: 1.0,
    speed: 115.0,
    sight: 9.0,
    r: 12.0,
    build: 24.0,
    req: Some(BldgKind::Forge),
    weapon: Some(Weapon {
        range: 6.5,
        dmg_air: 28.0,
        cd: 1.0,
        proj: Some(ProjKind::Missile),
        up_dmg: 3.0,
        ..W
    }),
    ..UNIT
};
pub(super) const MEDIC: UnitDef = UnitDef {
    key: "medic",
    name: "Mender",
    cost: [50, 0],
    hp: 45.0,
    speed: 90.0,
    build: 20.0,
    bio: true,
    heal: 5.0,
    req: Some(BldgKind::Forge),
    ..UNIT
};
/// The Humans' capital ship: slow, armoured, its cannon splashes the ground and reaches flyers.
pub(super) const BASTION: UnitDef = UnitDef {
    key: "bastion",
    name: "Windjammer",
    cost: [500, 0],
    supply: 6,
    hp: 450.0,
    armor: 2.0,
    speed: 58.0,
    sight: 10.0,
    r: 18.0,
    build: 60.0,
    air: true,
    mv: Move::Fly,
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
    name: "Kite",
    cost: [125, 0],
    supply: 2,
    hp: 100.0,
    speed: 150.0,
    sight: 9.0,
    r: 10.0,
    build: 24.0,
    air: true,
    mv: Move::Fly,
    weapon: Some(Weapon {
        range: 3.0,
        dmg: 9.0,
        cd: 0.7,
        proj: Some(ProjKind::Bolt),
        up_dmg: 1.0,
        ..W
    }),
    ..UNIT
};
/// A cheap unarmed flying scout: fast, sees far, flies over cliffs, and a detector. Not hidden since Roster v2: seen and
/// shot like any flyer.
pub(super) const OBSERVER: UnitDef = UnitDef {
    key: "observer",
    name: "Spyglass",
    cost: [50, 0],
    hp: 40.0,
    speed: 175.0,
    sight: 10.0,
    r: 8.0,
    build: 14.0,
    air: true,
    mv: Move::Fly,
    detect: 7.0,
    ..UNIT
};
pub(super) const CORE: BldgDef = BldgDef {
    key: "core",
    hq: true,
    name: "Lighthouse",
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
    name: "Windmast",
    cost: [100, 0],
    hp: 360.0,
    supply: 8,
    build: 22.0,
    ..BLDG
};
pub(super) const EXTRACTOR: BldgDef = BldgDef {
    key: "extractor",
    name: "Pump",
    short: "Pump",
    cost: [75, 0],
    // (PRD: the conversion: 200 HP, no weapon; two Striders kill one in ten seconds)
    hp: 200.0,
    build: 25.0,
    on_vent: true,
    ..BLDG
};
pub(super) const BARRACKS: BldgDef = BldgDef {
    key: "barracks",
    name: "Crew Hall",
    cost: [150, 0],
    w: 3,
    h: 3,
    hp: 720.0,
    build: 40.0,
    sight: 7.0,
    trains: &[UnitKind::Trooper, UnitKind::Lancer, UnitKind::Medic],
    short: "Crew Hall",
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
    name: "Workshop",
    cost: [150, 0],
    hp: 820.0,
    build: 45.0,
    sight: 7.0,
    trains: &[],
    req: Some(BldgKind::Barracks),
    ..BLDG
};
/// The vehicle bay: Vanguards, Siege Tanks and Interceptors (all need the Foundry too).
pub(super) const FACTORY: BldgDef = BldgDef {
    key: "factory",
    name: "Slipway",
    cost: [125, 0],
    w: 3,
    h: 3,
    hp: 800.0,
    build: 35.0,
    sight: 7.0,
    trains: &[
        UnitKind::Vanguard,
        UnitKind::SiegeTank,
        UnitKind::Interceptor,
    ],
    req: Some(BldgKind::Barracks),
    ..BLDG
};
pub(super) const TURRET: BldgDef = BldgDef {
    key: "turret",
    name: "Lookout",
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
    name: "Loft",
    cost: [150, 0],
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
