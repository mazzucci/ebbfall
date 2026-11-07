//! The Vael: warp-in construction, power fields and shields (the design is on the design-mockups branch).

use super::*;

/// The Vael: hovering ceramic constructs of living ether.
pub const VAEL: Faction = Faction {
    key: "vael",
    name: "Vael",
    hq: BldgKind::Conflux,
    worker: UnitKind::Lumen,
    // The basic page holds what can be built from the start (the Conflux too), the Kiln first; the advanced page what
    // needs the Kiln (the Ward and the Siphon too), so it appears once the Kiln stands (owner, 2026-11-03; the Siphon
    // moved there with its requirement, the PM, 2026-11-06).
    build_basic: &[BldgKind::Kiln, BldgKind::Spire, BldgKind::Conflux],
    build_advanced: &[
        BldgKind::Loom,
        BldgKind::Zenith,
        BldgKind::Ward,
        BldgKind::Eclipse,
        BldgKind::Siphon,
    ],
    supply: BldgKind::Spire,
    ether: BldgKind::Siphon,
    sounds: ["lance", "slam", "lance", "blade"],
    repairs: false,
    warp: true,
    ai: AiScript {
        rax: BldgKind::Kiln,
        tech: BldgKind::Loom,
        tech2: Some(BldgKind::Eclipse),
        tower: BldgKind::Ward,
        air: BldgKind::Zenith,
        heavy: None,
        basic: UnitKind::Scythe,
        anti_air: UnitKind::Prism,
        heavy_anti_air: None,
        mix: &[
            (UnitKind::Prism, 1, 0.0),
            (UnitKind::Monolith, 3, 0.0),
            (UnitKind::Halo, 6, 0.0),
            // (an Umbra per six Scythes from 5:00, from its Zenith once its Eclipse stands, until it has seen an enemy
            // detector with the enemy army: `World::cloak_ratio`)
            (UnitKind::Umbra, 6, 300.0),
        ],
        raider: UnitKind::Shrike,
        wave_scale: 0.6,
        tech_from: 300.0,
        // (its Zenith half a minute sooner: from 7:30 it saves for the Sovereign, so Shrikes came only where it stood
        // well before that, in 6-28% of AI games)
        air_lead: 30.0,
    },
};

pub(super) const LUMEN: UnitDef = UnitDef {
    key: "lumen",
    name: "Glint",
    cost: [50, 0],
    hp: 20.0,
    shields: 20.0,
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
    mv: Move::Amph,
    ..UNIT
};
pub(super) const SCYTHE: UnitDef = UnitDef {
    key: "scythe",
    name: "Needle",
    cost: [100, 0],
    supply: 2,
    hp: 70.0,
    shields: 40.0,
    armor: 1.0,
    speed: 88.0,
    sight: 8.0,
    r: 10.0,
    build: 22.0,
    weapon: Some(Weapon {
        range: 0.9,
        dmg: 11.0,
        cd: 0.9,
        melee: true,
        up_dmg: 2.0,
        ..W
    }),
    mv: Move::Amph,
    ..UNIT
};
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
    weapon: Some(Weapon {
        range: 5.5,
        dmg: 14.0,
        dmg_air: 14.0,
        cd: 1.1,
        proj: Some(ProjKind::Bolt),
        up_dmg: 1.0,
        ..W
    }),
    mv: Move::Amph,
    abilities: &[AbilityKind::Overcharge],
    ..UNIT
};
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
    detect: 5.0, // (the Vael's detector in the field: its army's eyes)
    mv: Move::Amph,
    ..UNIT
};
/// The Umbra (the Undertow): a blade that lurks (Roster v2): once it has neither walked nor struck for `LURK_S` it is
/// hidden, seen and struck only where the other side detects; it shows the moment it moves or strikes. It lies in wait
/// by an Excavator or on a path; detected, it is a costly blade.
/// Trained at the Zenith (an advanced hover unit, as the Sovereign is) once an Eclipse stands; a ground unit all the
/// same.
pub(super) const UMBRA: UnitDef = UnitDef {
    key: "umbra",
    name: "Undertow",
    cost: [175, 0],
    supply: 2,
    hp: 90.0,
    armor: 1.0,
    speed: 95.0,
    sight: 8.0,
    r: 10.0,
    build: 30.0,
    req: Some(BldgKind::Eclipse),
    lurk: true,
    weapon: Some(Weapon {
        range: 0.9,
        dmg: 32.0,
        cd: 1.2,
        melee: true,
        up_dmg: 3.0,
        ..W
    }),
    mv: Move::Amph,
    ..UNIT
};
/// The Vael capital barge: a great shell gliding low, whose beam splashes the ground from far off; it cannot hit flyers.
pub(super) const SOVEREIGN: UnitDef = UnitDef {
    key: "sovereign",
    name: "Argonaut",
    cost: [500, 0],
    supply: 6,
    hp: 300.0,
    shields: 200.0,
    armor: 2.0,
    speed: 52.0,
    sight: 10.0,
    r: 18.0,
    build: 60.0,
    capital: true,
    weapon: Some(Weapon {
        range: 9.0,
        dmg: 48.0,
        cd: 1.6,
        proj: Some(ProjKind::Bolt),
        up_dmg: 4.0,
        splash: 0.5,
        splash_r: 48.0,
        ..W
    }),
    mv: Move::Amph,
    detect: 7.0,
    ..UNIT
};
pub(super) const MONOLITH: UnitDef = UnitDef {
    key: "monolith",
    name: "Conch",
    cost: [250, 0],
    supply: 4,
    hp: 180.0,
    shields: 120.0,
    armor: 2.0,
    speed: 55.0,
    sight: 9.0,
    r: 15.0,
    build: 40.0,
    req: Some(BldgKind::Loom),
    weapon: Some(Weapon {
        range: 7.0,
        dmg: 52.0,
        cd: 2.2,
        proj: Some(ProjKind::Shell),
        up_dmg: 4.0,
        splash: 0.5,
        splash_r: 40.0,
        ..W
    }),
    abilities: &[AbilityKind::Blink],
    mv: Move::Amph,
    ..UNIT
};
pub(super) const SHRIKE: UnitDef = UnitDef {
    key: "shrike",
    name: "Petrel",
    cost: [175, 0],
    supply: 2,
    hp: 80.0,
    shields: 40.0,
    speed: 165.0,
    sight: 9.0,
    r: 11.0,
    build: 28.0,
    air: true,
    mv: Move::Fly,
    weapon: Some(Weapon {
        range: 3.5,
        dmg: 12.0,
        dmg_air: 8.0,
        cd: 0.7,
        proj: Some(ProjKind::Bolt),
        up_dmg: 1.0,
        ..W
    }),
    abilities: &[AbilityKind::Veil],
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
pub(super) const SIPHON: BldgDef = BldgDef {
    key: "siphon",
    name: "Siphon",
    cost: [75, 0],
    hp: 200.0, // (as the Humans' Excavator: no shields)
    build: 25.0,
    on_vent: true,
    // (its people's barracks first: workers on the crystals, then soldiers, then a shaft out in the open)
    req: Some(BldgKind::Kiln),
    ..BLDG
};
pub(super) const KILN: BldgDef = BldgDef {
    key: "kiln",
    name: "Cradle",
    cost: [150, 0],
    w: 3,
    h: 3,
    hp: 800.0,
    build: 45.0,
    sight: 7.0,
    trains: &[
        UnitKind::Scythe,
        UnitKind::Prism,
        UnitKind::Monolith,
        UnitKind::Halo,
    ],
    ..BLDG
};
pub(super) const LOOM: BldgDef = BldgDef {
    key: "loom",
    name: "Glasshouse",
    cost: [150, 0],
    hp: 800.0,
    build: 45.0,
    sight: 7.0,
    req: Some(BldgKind::Kiln),
    researches: &[Upgrade::Weapons, Upgrade::Shields, Upgrade::OverchargeCore],
    ..BLDG
};
pub(super) const WARD: BldgDef = BldgDef {
    key: "ward",
    name: "Anemone",
    cost: [125, 0],
    hp: 320.0,
    build: 25.0,
    sight: 9.0,
    req: Some(BldgKind::Kiln),
    weapon: Some(Weapon {
        range: 7.0,
        dmg: 20.0,
        dmg_air: 28.0,
        cd: 1.2,
        proj: Some(ProjKind::Bolt),
        up_dmg: 2.0,
        ..W
    }),
    detect: 7.0, // (reveals cloaked units within its range)
    ..BLDG
};
pub(super) const ZENITH: BldgDef = BldgDef {
    key: "zenith",
    name: "Gyre",
    cost: [175, 0],
    w: 3,
    h: 3,
    hp: 800.0,
    build: 55.0,
    sight: 8.0,
    // (the advanced hover units: the flyer, the cloaked blade (once an Eclipse stands) and the capital barge)
    trains: &[UnitKind::Shrike, UnitKind::Umbra, UnitKind::Sovereign],
    req: Some(BldgKind::Kiln), // (air is a branch of its own, beside the ground tech)
    ..BLDG
};
/// The Eclipse (shadow tech, after the Loom): where light is hidden. The Lumen is the Vael's light, the Umbra its
/// shadow; the Eclipse unlocks the Umbra (trained at the Zenith) and weaves the flyers' shadow techs.
pub(super) const ECLIPSE: BldgDef = BldgDef {
    key: "eclipse",
    name: "Darkwater",
    cost: [150, 0],
    hp: 800.0,
    build: 45.0,
    sight: 7.0,
    req: Some(BldgKind::Loom),
    researches: &[Upgrade::VeilWeave, Upgrade::Slipstream],
    ..BLDG
};
