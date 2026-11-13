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
    // (the Sentry mast basic since the arc, Nov 13: the early Expedition is mercenaries and masts)
    build_basic: &[
        BldgKind::Siphon,
        BldgKind::Spire,
        BldgKind::Conflux,
        BldgKind::Ward,
    ],
    build_advanced: &[
        BldgKind::Kiln,
        BldgKind::Loom,
        BldgKind::Uplink,
        BldgKind::Eclipse,
    ],
    supply: BldgKind::Spire,
    market: None,
    sounds: ["lance", "slam", "lance", "blade"],
    repairs: true, // (its Bots repair buildings, as Villagers do; machines are not repaired: the arc, Nov 13)
    power: true,
    start_workers: 4, // (TUNING)
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
        // (a Bruiser per four Sellswords once the Lab stands, the melee line's heavy front; a Drone per four from the
        // Factory, between its Buggies, the anti-air the melee line lacks; from the Portal an Android per three from 5:00
        // and a Rover per four, the Android first (Nov 13: with the Rover first, Rovers lost one by one were made again
        // and again, and the Android never came))
        mix: &[
            (UnitKind::Bruiser, 4, 0.0),
            (UnitKind::Monolith, 4, 0.0),
            (UnitKind::Shrike, 4, 0.0),
            (UnitKind::Umbra, 3, 300.0),
        ],
        dive: Some(UnitKind::Shrike),
        raider: UnitKind::Scythe,
        scout: None,
        wave_scale: 0.6,
        tech_from: 300.0,
        // (its Factory half a minute sooner: its Rovers and Drones come from there)
        air_lead: 30.0,
        // (three more Sentry masts by 6:30: its defense while it goes for the Portal)
        towers_more: &[],
    },
};

/// The Bot: the Expedition's worker.
pub(super) const LUMEN: UnitDef = UnitDef {
    key: "lumen",
    name: "Bot",
    cost: [50, 0],
    hp: 40.0,
    speed: 87.0, // (100 before the economy's second round: calmer trips)
    sight: 7.0,
    r: 9.0,
    build: 18.0,  // (12 before: the ramp comes from time, every worker an investment)
    supply: 2, // (Power: 1 before the economy's second round, twice a Villager's place as every machine)
    mine_cap: 6, // (5 before Nov 13: with the income cut a Bot mine paid 80% of a Villager mine and the Expedition fell behind; now about 95%, the PM)
    mine_load: 9, // (13 before Nov 13: cut in step with the Villager's, a 30% cut for gold that is scarce for a person too)
    worker: true,
    weapon: Some(Weapon {
        range: 0.6,
        dmg: 4.0,
        melee: true,
        ..W
    }),
    ..UNIT
};
/// The Buggy: a fast vehicle with a light gun, the early machine from the Factory (the coverage's cavalry: the
/// Expedition's unit that catches raiders at its Bots; the arc, Nov 13).
pub(super) const SCYTHE: UnitDef = UnitDef {
    key: "scythe",
    name: "Buggy",
    cost: [80, 0],
    supply: 4, // (Power: 2 before the economy's second round)
    hp: 110.0,
    armor: 1.0,
    speed: 135.0,
    sight: 9.0,
    r: 12.0,
    build: 24.0,
    weapon: Some(Weapon {
        range: 4.0,
        dmg: 10.0,
        cd: 0.8,
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
    hp: 100.0, // (110 before Nov 13: the Kingdom's Guards and Archers on par at equal gold)
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
    cost: [525, 0], // (250 before Nov 13: an elite, about four Sellswords' hp and damage; armies of them stay small)
    supply: 10,     // (Power: 6 before Nov 13, 3 before the economy's second round)
    hp: 440.0,      // (220 before Nov 13)
    armor: 3.0,
    speed: 90.0,
    sight: 9.0,
    r: 10.0,
    build: 60.0, // (45.0 s before the economy pass: a bet in time as well as gold)
    weapon: Some(Weapon {
        range: 8.0,
        dmg: 63.0, // (30 before Nov 13)
        dmg_air: 50.0,
        cd: 1.2,
        proj: Some(ProjKind::Bolt),
        up_dmg: 3.0,
        ..W
    }),
    ..UNIT
};
/// The Rover: a rocket launcher, the Expedition's artillery, through the Portal beside the Android (the arc, Nov 13):
/// it fires on the move, splashes, and outranges the towers, but sees no farther than any unit: it needs spotters.
pub(super) const MONOLITH: UnitDef = UnitDef {
    key: "monolith",
    name: "Rover",
    cost: [380, 0], // (240 before Nov 13: siege that crushes a mass, dear and few)
    supply: 12,     // (Power: 8 before Nov 13, 4 before the economy's second round)
    hp: 360.0,      // (220 before Nov 13)
    armor: 1.0,
    speed: 58.0,
    sight: 9.0,
    r: 15.0,
    build: 52.0, // (40.0 s before the economy pass: a bet in time as well as gold)
    weapon: Some(Weapon {
        range: 12.0, // (11 for a day, Nov 13; 12 again since: it out-ranges the Cannon, its answer to entrenched siege)
        min_range: 3.0,
        dmg: 70.0, // (45 before Nov 13)
        cd: 2.5,
        proj: Some(ProjKind::Missile),
        up_dmg: 4.0,
        splash: 0.6,
        splash_r: 54.0,
        ..W
    }),
    ..UNIT
};
/// The Drone: a small, fast attack drone for swarms (the arc, Nov 13): fragile and weak alone, the fastest unit in the
/// game, a short camera's sight (it spots for the Rovers by flying ahead of them), the ground and the air. Lab-gated.
pub(super) const SHRIKE: UnitDef = UnitDef {
    key: "shrike",
    name: "Drone",
    cost: [65, 0],
    supply: 2, // (Power: the smallest a machine takes; 2 before the economy's second round too)
    hp: 40.0,
    speed: 192.0, // (6 tiles a second, 7.8 in coverage)
    sight: 7.0,
    r: 9.0,
    build: 12.0,
    air: true,
    mv: Move::Fly,
    req: Some(BldgKind::Loom),
    weapon: Some(Weapon {
        range: 3.0,
        dmg: 6.0,
        dmg_air: 6.0,
        cd: 0.5,
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
    supply: 2, // (hired places: 1 before the economy's second round)
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
    supply: 40, // (Power: 20 before the economy's second round)
    build: 80.0,
    sight: 10.0,
    trains: &[UnitKind::Lumen],
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
    supply: 20, // (Power: 8 before the economy's second round)
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
/// The Factory: Buggies, and Drones once a Lab stands. It holds 6 Power while it stands (`uses`).
pub(super) const KILN: BldgDef = BldgDef {
    key: "kiln",
    name: "Factory",
    cost: [120, 0],
    w: 3,
    h: 3,
    hp: 800.0,
    uses: 6,
    build: 45.0,
    sight: 7.0,
    trains: &[UnitKind::Scythe, UnitKind::Shrike],
    req: Some(BldgKind::Siphon),
    ..BLDG
};
pub(super) const LOOM: BldgDef = BldgDef {
    key: "loom",
    name: "Lab",
    cost: [200, 0], // (120 before the economy pass, Nov 13: a bet between units and construction)
    hp: 800.0,
    uses: 4,
    build: 45.0,
    sight: 7.0,
    req: Some(BldgKind::Siphon),
    // (the Expedition's research: its weapons, armor and its Drones' speed, the satellite and its Bots' drills)
    researches: &[
        Upgrade::Weapons,
        Upgrade::Armor,
        Upgrade::Slipstream,
        Upgrade::Satellite,
        Upgrade::Drills,
    ],
    ..BLDG
};
/// The Sentry mast: guns on a mast, the Expedition's early defense (the Watchtower's counterpart; no range since the
/// rework).
pub(super) const WARD: BldgDef = BldgDef {
    key: "ward",
    name: "Sentry mast",
    short: "Sentry mast",
    cost: [125, 0], // (65 before the economy pass, Nov 13: a bet between units and construction)
    hp: 220.0,
    armor: 0.0,
    uses: 2,
    build: 13.0,
    sight: 9.0,
    weapon: Some(Weapon {
        range: 8.0,
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
    cost: [350, 0], // (150 before the economy pass, Nov 13: one a player, the big bet)
    hp: 1000.0,
    armor: 2.0,
    uses: 8, // (Power: 4 before the economy's second round)
    single: true,
    build: 60.0, // (45.0 s before the economy pass: a bet in time as well as gold)
    sight: 7.0,
    req: Some(BldgKind::Uplink),
    trains_with: Some(BldgKind::Uplink),
    // (the gate's machines: the Android and the Rover, one queue; it trains only while an Uplink stands: `World::gate_open`)
    trains: &[UnitKind::Umbra, UnitKind::Monolith],
    ..BLDG
};
/// The Uplink: a big satellite dish, unarmed, once the satellite is up; it gives machines range (data/radio.rs) and
/// unlocks the Portal. 3x3 (a wide, squat dish). 150 gold, a tech building's price: with the satellite's 200 the way to
/// the Portal costs about what the Lab-to-Portal way did plus the launch, and a forward Uplink (the AI's leapfrog) is
/// a real investment, not the old 65-gold tower.
pub(super) const UPLINK: BldgDef = BldgDef {
    key: "uplink",
    name: "Uplink",
    cost: [150, 0], // (125 before the economy pass, Nov 13: a bet between units and construction)
    w: 3,
    h: 3,
    hp: 750.0,
    armor: 2.0,
    uses: 6,
    build: 40.0,
    sight: 8.0,
    req_up: Some(Upgrade::Satellite),
    ..BLDG
};
