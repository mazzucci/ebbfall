//! The Vael: warp-in construction, power fields and shields (the design is on the design-mockups branch).

use super::*;

/// The Vael: hovering ceramic constructs of living ether.
pub const VAEL: Faction = Faction {
    key: "vael",
    name: "Vael",
    hq: BldgKind::Conflux,
    worker: UnitKind::Lumen,
    build_basic: &[
        BldgKind::Spire,
        BldgKind::Kiln,
        BldgKind::Siphon,
        BldgKind::Ward,
    ],
    build_advanced: &[BldgKind::Loom, BldgKind::Zenith, BldgKind::Conflux],
    supply: BldgKind::Spire,
    ether: BldgKind::Siphon,
    power: Some(BldgKind::Spire),
    sounds: ["lance", "slam", "lance", "blade"],
    repairs: false,
    warp: true,
    ai: AiScript {
        rax: BldgKind::Kiln,
        tech: BldgKind::Loom,
        tower: BldgKind::Ward,
        air: BldgKind::Zenith,
        basic: UnitKind::Scythe,
        anti_air: UnitKind::Prism,
        mix: &[
            (UnitKind::Prism, 1),
            (UnitKind::Monolith, 3),
            (UnitKind::Halo, 6),
        ],
        raider: UnitKind::Shrike,
        wave_scale: 0.6,
    },
};

pub(super) const LUMEN: UnitDef = UnitDef {
    key: "lumen",
    name: "Lumen",
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
    ..UNIT
};
pub(super) const SCYTHE: UnitDef = UnitDef {
    key: "scythe",
    name: "Scythe",
    cost: [100, 0],
    supply: 2,
    hp: 80.0,
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
    abilities: &[AbilityKind::Blink],
    ..UNIT
};
pub(super) const PRISM: UnitDef = UnitDef {
    key: "prism",
    name: "Prism",
    cost: [100, 35],
    supply: 2,
    hp: 70.0,
    shields: 60.0,
    armor: 1.0,
    speed: 85.0,
    sight: 9.0,
    r: 11.0,
    build: 30.0,
    weapon: Some(Weapon {
        range: 5.5,
        dmg: 14.0,
        dmg_air: 14.0,
        cd: 0.9,
        proj: Some(ProjKind::Bolt),
        up_dmg: 1.0,
        ..W
    }),
    ..UNIT
};
pub(super) const HALO: UnitDef = UnitDef {
    key: "halo",
    name: "Halo",
    cost: [75, 50],
    hp: 40.0,
    shields: 40.0,
    speed: 110.0,
    sight: 10.0,
    build: 20.0,
    heal: 10.0,
    mend: true,
    req: Some(BldgKind::Loom),
    ..UNIT
};
/// The Vael capital walker: a towering tripod whose beam splashes the ground from far off; it cannot hit flyers.
pub(super) const SOVEREIGN: UnitDef = UnitDef {
    key: "sovereign",
    name: "Sovereign",
    cost: [350, 200],
    supply: 6,
    hp: 300.0,
    shields: 250.0,
    armor: 2.0,
    speed: 52.0,
    sight: 10.0,
    r: 18.0,
    build: 60.0,
    capital: true,
    weapon: Some(Weapon {
        range: 7.5,
        dmg: 40.0,
        cd: 1.6,
        proj: Some(ProjKind::Bolt),
        up_dmg: 4.0,
        splash: 0.5,
        splash_r: 48.0,
        ..W
    }),
    ..UNIT
};
pub(super) const MONOLITH: UnitDef = UnitDef {
    key: "monolith",
    name: "Monolith",
    cost: [175, 100],
    supply: 4,
    hp: 160.0,
    shields: 140.0,
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
    abilities: &[AbilityKind::Overcharge],
    ..UNIT
};
pub(super) const SHRIKE: UnitDef = UnitDef {
    key: "shrike",
    name: "Shrike",
    cost: [125, 75],
    supply: 2,
    hp: 90.0,
    shields: 60.0,
    speed: 165.0,
    sight: 9.0,
    r: 11.0,
    build: 28.0,
    air: true,
    weapon: Some(Weapon {
        range: 3.5,
        dmg: 12.0,
        dmg_air: 8.0,
        cd: 0.7,
        proj: Some(ProjKind::Bolt),
        up_dmg: 1.0,
        ..W
    }),
    ..UNIT
};

pub(super) const CONFLUX: BldgDef = BldgDef {
    key: "conflux",
    name: "Conflux",
    cost: [400, 0],
    w: 4,
    h: 4,
    hp: 1000.0,
    shields: 400.0,
    armor: 2.0,
    supply: 10,
    build: 80.0,
    sight: 10.0,
    trains: &[UnitKind::Lumen],
    dropoff: true,
    hq: true,
    power: 7.0,
    ..BLDG
};
pub(super) const SPIRE: BldgDef = BldgDef {
    key: "spire",
    name: "Spire",
    cost: [100, 0],
    hp: 200.0,
    shields: 200.0,
    supply: 8,
    build: 25.0,
    sight: 6.0,
    power: 6.5,
    ..BLDG
};
pub(super) const SIPHON: BldgDef = BldgDef {
    key: "siphon",
    name: "Siphon",
    cost: [75, 0],
    hp: 300.0,
    shields: 150.0,
    build: 25.0,
    on_vent: true,
    ..BLDG
};
pub(super) const KILN: BldgDef = BldgDef {
    key: "kiln",
    name: "Kiln",
    cost: [150, 0],
    w: 3,
    h: 3,
    hp: 500.0,
    shields: 300.0,
    build: 45.0,
    sight: 7.0,
    trains: &[
        UnitKind::Scythe,
        UnitKind::Prism,
        UnitKind::Monolith,
        UnitKind::Halo,
    ],
    needs_power: true,
    ..BLDG
};
pub(super) const LOOM: BldgDef = BldgDef {
    key: "loom",
    name: "Loom",
    cost: [150, 100],
    hp: 500.0,
    shields: 300.0,
    build: 45.0,
    sight: 7.0,
    req: Some(BldgKind::Kiln),
    researches: &[Upgrade::Weapons, Upgrade::Shields],
    needs_power: true,
    ..BLDG
};
pub(super) const WARD: BldgDef = BldgDef {
    key: "ward",
    name: "Ward",
    cost: [125, 0],
    hp: 200.0,
    shields: 120.0,
    build: 25.0,
    sight: 9.0,
    req: Some(BldgKind::Kiln),
    needs_power: true,
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
    name: "Zenith",
    cost: [175, 125],
    w: 3,
    h: 3,
    hp: 500.0,
    shields: 300.0,
    build: 55.0,
    sight: 8.0,
    trains: &[UnitKind::Shrike, UnitKind::Sovereign],
    req: Some(BldgKind::Loom),
    needs_power: true,
    ..BLDG
};
