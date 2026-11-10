//! The Expedition (sim race `vael`; the Vael before the re-theme): the Data centre, Bots that build, Sellswords and
//! Bruisers from the Recruiting post, Buggies, Rovers and Drones from the Factory, Marines from the Portal. No shields
//! (the mechanism stays, as data) and every ground unit walks. Display names stay the old ones until the words PR.

use super::*;

pub const VAEL: Faction = Faction {
    key: "vael",
    name: "Vael",
    hq: BldgKind::Conflux,
    worker: UnitKind::Lumen,
    // The basic page holds what can be built from the start (the Conflux too), the Recruiting post first (the
    // Expedition's barracks); the advanced page what needs it, so it appears once the Recruiting post stands. (The
    // Recruiting post still stands on a shaft and pumps until the economy PR frees it of both.)
    build_basic: &[BldgKind::Siphon, BldgKind::Spire, BldgKind::Conflux],
    build_advanced: &[
        BldgKind::Kiln,
        BldgKind::Loom,
        BldgKind::Ward,
        BldgKind::Eclipse,
    ],
    supply: BldgKind::Spire,
    ether: BldgKind::Siphon,
    sounds: ["lance", "slam", "lance", "blade"],
    repairs: false,
    ai: AiScript {
        rax: BldgKind::Siphon,
        tech: BldgKind::Loom,
        tech2: Some(BldgKind::Eclipse),
        tower: BldgKind::Ward,
        air: BldgKind::Kiln,
        heavy: None,
        basic: UnitKind::Prism,
        anti_air: UnitKind::Prism,
        heavy_anti_air: None,
        // (a Bruiser per five Sellswords once the Lab stands; a Rover per three and a Drone per four from the Factory,
        // between its Buggies; a Marine per four from the Portal from 5:00)
        mix: &[
            (UnitKind::Bruiser, 5, 0.0),
            (UnitKind::Monolith, 3, 0.0),
            (UnitKind::Shrike, 4, 0.0),
            (UnitKind::Umbra, 4, 300.0),
        ],
        raider: UnitKind::Scythe,
        scout: None,
        wave_scale: 0.6,
        tech_from: 300.0,
        // (its Factory half a minute sooner: its Rovers and Drones come from there)
        air_lead: 30.0,
    },
};

/// The Bot: the Expedition's worker.
pub(super) const LUMEN: UnitDef = UnitDef {
    key: "lumen",
    name: "Glint",
    cost: [50, 0],
    hp: 40.0,
    speed: 100.0,
    sight: 7.0,
    r: 9.0,
    build: 12.0,
    worker: true,
    weapon: Some(Weapon {
        range: 0.6,
        dmg: 4.0,
        melee: true,
        ..W
    }),
    ..UNIT
};
/// The Buggy: a fast raider vehicle with a light gun (the Expedition's raider, as the Rider is the Kingdom's).
pub(super) const SCYTHE: UnitDef = UnitDef {
    key: "scythe",
    name: "Needle",
    cost: [100, 0],
    supply: 2,
    hp: 100.0,
    armor: 1.0,
    speed: 135.0,
    sight: 9.0,
    r: 12.0,
    build: 24.0,
    weapon: Some(Weapon {
        range: 3.0,
        dmg: 8.0,
        cd: 0.7,
        proj: Some(ProjKind::Bolt),
        up_dmg: 1.0,
        ..W
    }),
    ..UNIT
};
/// The Sellsword: the Expedition's main ranged infantry, ground and air (the Lens's numbers, without its Surge).
pub(super) const PRISM: UnitDef = UnitDef {
    key: "prism",
    name: "Lens",
    cost: [110, 0],
    supply: 2,
    hp: 90.0,
    armor: 1.0,
    speed: 85.0,
    sight: 9.0,
    r: 11.0,
    build: 30.0,
    bio: true,
    weapon: Some(Weapon {
        range: 5.5,
        dmg: 14.0,
        dmg_air: 14.0,
        cd: 1.1,
        proj: Some(ProjKind::Bolt),
        up_dmg: 1.0,
        ..W
    }),
    ..UNIT
};
/// A healer: in the tables (the mend rules keep their tests), trained nowhere since the re-theme.
pub(super) const HALO: UnitDef = UnitDef {
    key: "halo",
    name: "Tender",
    cost: [100, 0],
    hp: 60.0,
    speed: 110.0,
    sight: 10.0,
    build: 20.0,
    heal: 6.0,
    mend: true,
    req: Some(BldgKind::Loom),
    ..UNIT
};
/// The Marine: the Expedition's elite ranged soldier, from the Portal; never hidden.
pub(super) const UMBRA: UnitDef = UnitDef {
    key: "umbra",
    name: "Undertow",
    cost: [125, 0],
    supply: 2,
    hp: 110.0,
    armor: 1.0,
    speed: 90.0,
    sight: 9.0,
    r: 10.0,
    build: 28.0,
    bio: true,
    weapon: Some(Weapon {
        range: 6.0,
        dmg: 18.0,
        dmg_air: 12.0,
        cd: 1.2,
        proj: Some(ProjKind::Bolt),
        up_dmg: 2.0,
        ..W
    }),
    ..UNIT
};
/// The Rover: rocket artillery (the Conch's place, its shields counted into its hull); it fires on the move,
/// splashes, and outranges the towers.
pub(super) const MONOLITH: UnitDef = UnitDef {
    key: "monolith",
    name: "Conch",
    cost: [250, 0],
    supply: 4,
    hp: 240.0,
    armor: 1.0,
    speed: 58.0,
    sight: 9.0,
    r: 15.0,
    build: 40.0,
    req: Some(BldgKind::Loom),
    weapon: Some(Weapon {
        range: 8.0,
        dmg: 50.0,
        cd: 2.4,
        proj: Some(ProjKind::Missile),
        up_dmg: 4.0,
        splash: 0.5,
        splash_r: 44.0,
        ..W
    }),
    ..UNIT
};
/// The Drone: a fast low flyer that hits the ground and the air (the Petrel's numbers, its shields in its hull).
pub(super) const SHRIKE: UnitDef = UnitDef {
    key: "shrike",
    name: "Petrel",
    cost: [175, 0],
    supply: 2,
    hp: 120.0,
    speed: 165.0,
    sight: 9.0,
    r: 11.0,
    build: 28.0,
    air: true,
    mv: Move::Fly,
    weapon: Some(Weapon {
        range: 3.5,
        dmg: 12.0,
        dmg_air: 10.0,
        cd: 0.7,
        proj: Some(ProjKind::Bolt),
        up_dmg: 1.0,
        ..W
    }),
    ..UNIT
};
/// The Bruiser: a hired local with a riot shield and a heavy gun, the Expedition's top tier (the Recruiting post's,
/// once a Lab stands).
pub(super) const BRUISER: UnitDef = UnitDef {
    key: "bruiser",
    name: "Bruiser",
    cost: [225, 0],
    supply: 4,
    hp: 300.0,
    armor: 3.0,
    speed: 75.0,
    sight: 9.0,
    r: 13.0,
    build: 40.0,
    req: Some(BldgKind::Loom),
    bio: true,
    weapon: Some(Weapon {
        range: 4.0,
        dmg: 22.0,
        cd: 1.0,
        proj: Some(ProjKind::Bolt),
        up_dmg: 3.0,
        ..W
    }),
    ..UNIT
};

pub(super) const CONFLUX: BldgDef = BldgDef {
    key: "conflux",
    name: "Tidewell",
    cost: [400, 0],
    w: 4,
    h: 4,
    hp: 1400.0,
    armor: 2.0,
    supply: 20,
    build: 80.0,
    sight: 10.0,
    trains: &[UnitKind::Lumen],
    dropoff: true,
    hq: true,
    ..BLDG
};
pub(super) const SPIRE: BldgDef = BldgDef {
    key: "spire",
    name: "Sunpetal",
    cost: [100, 0],
    hp: 400.0,
    supply: 8,
    build: 25.0,
    sight: 6.0,
    ..BLDG
};
/// The Recruiting post: Sellswords, and Bruisers once a Lab stands; the Expedition's barracks. Until the economy PR it
/// still stands on a shaft and pumps salt as the Kingdom's Excavator does (priced as a barracks).
pub(super) const SIPHON: BldgDef = BldgDef {
    key: "siphon",
    name: "Siphon",
    cost: [150, 0],
    hp: 600.0,
    build: 40.0,
    sight: 7.0,
    on_vent: true,
    trains: &[UnitKind::Prism, UnitKind::Bruiser],
    ..BLDG
};
/// The Factory: Buggies, Rovers (once a Lab stands) and Drones.
pub(super) const KILN: BldgDef = BldgDef {
    key: "kiln",
    name: "Cradle",
    cost: [150, 0],
    w: 3,
    h: 3,
    hp: 800.0,
    build: 45.0,
    sight: 7.0,
    trains: &[UnitKind::Scythe, UnitKind::Monolith, UnitKind::Shrike],
    req: Some(BldgKind::Siphon),
    ..BLDG
};
pub(super) const LOOM: BldgDef = BldgDef {
    key: "loom",
    name: "Glasshouse",
    cost: [150, 0],
    hp: 800.0,
    build: 45.0,
    sight: 7.0,
    req: Some(BldgKind::Siphon),
    researches: &[Upgrade::Weapons, Upgrade::Armor, Upgrade::Slipstream],
    ..BLDG
};
pub(super) const WARD: BldgDef = BldgDef {
    key: "ward",
    name: "Anemone",
    cost: [125, 0],
    hp: 320.0,
    build: 25.0,
    sight: 9.0,
    req: Some(BldgKind::Siphon),
    weapon: Some(Weapon {
        range: 7.0,
        dmg: 20.0,
        dmg_air: 28.0,
        cd: 1.2,
        proj: Some(ProjKind::Bolt),
        up_dmg: 2.0,
        ..W
    }),
    ..BLDG
};
/// The Portal (after the Lab): Marines.
pub(super) const ECLIPSE: BldgDef = BldgDef {
    key: "eclipse",
    name: "Darkwater",
    cost: [150, 0],
    hp: 800.0,
    build: 45.0,
    sight: 7.0,
    req: Some(BldgKind::Loom),
    trains: &[UnitKind::Umbra],
    ..BLDG
};
