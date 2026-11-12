//! The Expedition (sim race `vael`; the Vael before the re-theme): the Data center, Bots that build, Sellswords and
//! Bruisers from the Recruiting post, Buggies, Rovers and Drones from the Factory, Androids from the Portal. No shields
//! (the mechanism stays, as data) and every ground unit walks. Keys never change; the names are display strings only.
//!
//! No population (PRD: the Expedition rework): its machines (Bot, Buggy, Rover, Drone) use Power (`Pool::Supply`), from
//! the Data center and wind turbines; its hired guns (Sellsword, Bruiser, Medic) take hired places (`Pool::Hired`), six
//! a Recruiting post. Power and hired places each have a maximum (`power_limit`, `hired_limit`). The satellite
//! (researched at the Data center once a Lab stands) unlocks the Uplink, which unlocks the Portal: one a side, using
//! Power while it stands, where the Android, a slow and expensive elite machine, is made. Machines move faster inside
//! the range of the Data center or an Uplink (data/radio.rs).

use super::*;

pub const VAEL: Faction = Faction {
    key: "vael",
    name: "Expedition",
    hq: BldgKind::Conflux,
    worker: UnitKind::Lumen,
    // The basic page holds what can be built from the start (the Conflux too), the Recruiting post first (the
    // Expedition's barracks); the advanced page what needs it, so it appears once the Recruiting post stands.
    build_basic: &[BldgKind::Siphon, BldgKind::Spire, BldgKind::Conflux],
    build_advanced: &[
        BldgKind::Kiln,
        BldgKind::Loom,
        BldgKind::Ward,
        BldgKind::Uplink,
        BldgKind::Eclipse,
    ],
    supply: BldgKind::Spire,
    market: None,
    sounds: ["lance", "slam", "lance", "blade"],
    repairs: false,
    power: true,
    ai: AiScript {
        rax: BldgKind::Siphon,
        tech: BldgKind::Loom,
        tech2: Some(BldgKind::Eclipse),
        tower: BldgKind::Ward,
        relay: Some(BldgKind::Uplink),
        air: BldgKind::Kiln,
        heavy: None,
        basic: UnitKind::Prism,
        // (the Android, from the Portal: its hired guns are melee since the rework; its Drones, mixed in, hit the air too)
        anti_air: UnitKind::Umbra,
        heavy_anti_air: None,
        // (a Bruiser per four Sellswords once the Lab stands, the melee line's heavy front; a Rover per three and a Drone
        // per four from the Factory, between its Buggies, the reach and the anti-air the melee line lacks; an Android per
        // four from the Portal from 5:00)
        mix: &[
            (UnitKind::Bruiser, 4, 0.0),
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
    name: "Bot",
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
    name: "Buggy",
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
/// The Sellsword: a hired local with a light sword, the Expedition's melee line (ground only). One hired place. Against
/// the Guard (the formula sheet): about twice the Guard for twice its price, a little less for the money (Lanchester
/// 0.15 to the Guard's 0.16, which also braces) and much more for its place: places are what the Expedition runs short of.
pub(super) const PRISM: UnitDef = UnitDef {
    key: "prism",
    name: "Sellsword",
    cost: [100, 0],
    supply: 1,
    pool: Pool::Hired,
    hp: 110.0,
    armor: 1.0,
    speed: 92.0,
    sight: 8.0,
    r: 11.0,
    build: 24.0,
    bio: true,
    weapon: Some(Weapon {
        range: 0.8,
        dmg: 12.0,
        cd: 0.9,
        melee: true,
        up_dmg: 1.0,
        ..W
    }),
    ..UNIT
};
/// A healer: in the tables (the mend rules keep their tests), trained nowhere since the re-theme.
pub(super) const HALO: UnitDef = UnitDef {
    key: "halo",
    name: "Medic",
    cost: [100, 0],
    hp: 60.0,
    speed: 110.0,
    sight: 10.0,
    build: 20.0,
    heal: 6.0,
    mend: true,
    req: Some(BldgKind::Loom),
    pool: Pool::Hired, // (a hired local: one place)
    ..UNIT
};
/// The Android: the Expedition's elite, from its one Portal (the balance pass): a machine (three Power), slow and
/// expensive to make (two minutes, 300 gold: three Sellswords' price for three Power; the formula sheet's least
/// efficient unit for its gold, by design), tough, armored and long-ranged, hitting the ground and the air at its old
/// fire rate (a shot a second instead made no difference the lab could see); never hidden.
pub(super) const UMBRA: UnitDef = UnitDef {
    key: "umbra",
    name: "Android",
    cost: [300, 0],
    supply: 3, // (Power)
    hp: 200.0,
    armor: 2.0,
    speed: 90.0,
    sight: 9.0,
    r: 10.0,
    build: 120.0,
    weapon: Some(Weapon {
        range: 7.0,
        dmg: 25.0,
        dmg_air: 20.0,
        cd: 1.2,
        proj: Some(ProjKind::Bolt),
        up_dmg: 3.0,
        ..W
    }),
    ..UNIT
};
/// The Rover: rocket artillery (the Conch's place, its shields counted into its hull); it fires on the move,
/// splashes, and outranges the towers. 200 gold (250 before the economy pass: priced for the scarce economy, like the
/// Expedition's tech path).
pub(super) const MONOLITH: UnitDef = UnitDef {
    key: "monolith",
    name: "Rover",
    cost: [200, 0],
    supply: 4,
    hp: 200.0,
    armor: 1.0,
    speed: 58.0,
    sight: 9.0,
    r: 15.0,
    build: 40.0,
    req: Some(BldgKind::Loom),
    weapon: Some(Weapon {
        range: 8.0,
        dmg: 40.0,
        cd: 2.6,
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
    name: "Drone",
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
/// The Bruiser: a hired local with a big shield and an axe, the Expedition's tough melee front line (the Recruiting
/// post's, once a Lab stands; ground only). One hired place (the balance pass weighed two: the formula sheet makes it the
/// strongest unit for its place by far, 18 DPS and 320 hull a place to the Sellsword's 13 and 110, but the lab's Hard
/// Kingdom went from 59% to 76% against the Expedition with it at two: under the hired maximum the Expedition needs
/// it). Against the Knight (the formula sheet): the same price, more hull and armor, less damage and far slower: it
/// holds the line rather than runs it down (Lanchester 0.12 to the Knight's 0.12).
pub(super) const BRUISER: UnitDef = UnitDef {
    key: "bruiser",
    name: "Bruiser",
    cost: [225, 0],
    supply: 1,
    pool: Pool::Hired,
    hp: 320.0,
    armor: 3.0,
    speed: 78.0,
    sight: 8.0,
    r: 13.0,
    build: 40.0,
    req: Some(BldgKind::Loom),
    bio: true,
    weapon: Some(Weapon {
        range: 0.9,
        dmg: 22.0,
        cd: 1.2,
        melee: true,
        up_dmg: 3.0,
        ..W
    }),
    ..UNIT
};

pub(super) const CONFLUX: BldgDef = BldgDef {
    key: "conflux",
    name: "Data center",
    short: "Data center",
    cost: [400, 0],
    w: 4,
    h: 4,
    hp: 1400.0,
    armor: 2.0,
    supply: 20, // (Power)
    build: 80.0,
    sight: 10.0,
    trains: &[UnitKind::Lumen],
    researches: &[Upgrade::Satellite],
    dropoff: true,
    hq: true,
    ..BLDG
};
/// The wind turbine: +8 Power (the Cabin's place and key).
pub(super) const SPIRE: BldgDef = BldgDef {
    key: "spire",
    name: "Wind turbine",
    short: "Turbine",
    cost: [100, 0],
    hp: 400.0,
    supply: 8,
    build: 25.0,
    sight: 6.0,
    ..BLDG
};
/// The Recruiting post: Sellswords, and Bruisers once a Lab stands; the Expedition's barracks, built anywhere and as
/// many as it likes. It pays nothing. Each adds six hired places to its side's one count (any post hires while the
/// count has room).
pub(super) const SIPHON: BldgDef = BldgDef {
    key: "siphon",
    name: "Recruiting post",
    short: "Recruiting",
    cost: [150, 0],
    supply: 6,
    pool: Pool::Hired,
    hp: 600.0,
    build: 40.0,
    sight: 7.0,
    trains: &[UnitKind::Prism, UnitKind::Bruiser],
    ..BLDG
};
/// The Factory: Buggies, Rovers (once a Lab stands) and Drones.
pub(super) const KILN: BldgDef = BldgDef {
    key: "kiln",
    name: "Factory",
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
    name: "Lab",
    cost: [150, 0],
    hp: 800.0,
    build: 45.0,
    sight: 7.0,
    req: Some(BldgKind::Siphon),
    researches: &[Upgrade::Weapons, Upgrade::Armor, Upgrade::Slipstream],
    ..BLDG
};
/// The Sentry mast: guns on a mast, the Expedition's early defense (the Watchtower's counterpart; no range since the
/// rework).
pub(super) const WARD: BldgDef = BldgDef {
    key: "ward",
    name: "Sentry mast",
    short: "Sentry mast",
    cost: [65, 0],
    hp: 320.0,
    build: 13.0,
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
/// The Portal (once an Uplink stands): Androids. One a side (`single`), and it uses 4 Power while it stands, from the
/// moment it is placed (`uses`: a Rover's worth, so the Portal and three Androids hold 13 of the 45 Power on 64x64:
/// the elite is a trade against the other machines, not a free extra).
pub(super) const ECLIPSE: BldgDef = BldgDef {
    key: "eclipse",
    name: "Portal",
    cost: [100, 0],
    hp: 800.0,
    uses: 4,
    single: true,
    build: 45.0,
    sight: 7.0,
    req: Some(BldgKind::Uplink),
    trains: &[UnitKind::Umbra],
    ..BLDG
};
/// The Uplink: a big satellite dish, unarmed, once the satellite is up; it gives machines range (data/radio.rs) and
/// unlocks the Portal. 3x3 (a wide, squat dish). 100 gold, and the satellite 150 and the Portal 100 (150, 200 and 150
/// before the economy pass halved mining: the Expedition's way to its elite then cost twice as long in income as it
/// was weighed at); a forward Uplink (the AI's leapfrog) is still a real investment, not the old 65-gold tower.
pub(super) const UPLINK: BldgDef = BldgDef {
    key: "uplink",
    name: "Uplink",
    cost: [100, 0],
    w: 3,
    h: 3,
    hp: 600.0,
    build: 40.0,
    sight: 8.0,
    req_up: Some(Upgrade::Satellite),
    ..BLDG
};
