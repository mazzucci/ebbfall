//! Game data. Costs are [shards, ether]; distances in tiles unless named otherwise; speeds in px/s.
//! The client's copy (names, hotkeys, descriptions) is src/engine/constants.js; `test/engine.test.js` checks
//! that the numbers agree.

pub const TILE: f64 = 32.0;
pub const MW: i32 = 64;
pub const MH: i32 = 64;
pub const WW: f64 = MW as f64 * TILE;
pub const WH: f64 = MH as f64 * TILE;
pub const DT: f64 = 1.0 / 30.0;
pub const PLAYER: u8 = 0;
/// Keep a point inside the playable map (16 px margin, like unit movement).
pub fn clamp_x(x: f64) -> f64 {
    x.clamp(16.0, WW - 16.0)
}
pub fn clamp_y(y: f64) -> f64 {
    y.clamp(16.0, WH - 16.0)
}
pub const ENEMY: u8 = 1;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ProjKind {
    Bolt,
    Shell,
    Missile,
}

/// Unit kinds. The order is the index used by the client (constants.js UNITS key order); append only.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum UnitKind {
    Harvester,
    Trooper,
    Vanguard,
    Lancer,
    Medic,
    Wasp,
    Observer,
}

/// Building kinds, same rule as UnitKind.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum BldgKind {
    Core,
    Depot,
    Extractor,
    Barracks,
    Forge,
    Turret,
    Airfield,
}

pub struct UnitDef {
    pub key: &'static str,
    pub cost: [i32; 2],
    pub supply: i32,
    pub hp: f64,
    pub armor: f64,
    pub speed: f64,
    pub range: f64,
    /// Damage per shot against ground targets (units and buildings); 0 = cannot attack the ground.
    pub dmg: f64,
    /// Damage per shot against flying units; 0 = cannot attack the air.
    pub dmg_air: f64,
    pub cd: f64,
    pub sight: f64,
    pub r: f64,
    pub build: f64,
    pub melee: bool,
    pub proj: Option<ProjKind>,
    /// Flies: moves in straight lines over terrain and buildings, only collides with other flyers.
    pub air: bool,
    /// Living infantry (Medics heal these).
    pub bio: bool,
    /// Hit points per second healed into nearby damaged infantry (Medic).
    pub heal: f64,
    /// A finished building of this kind is needed to train the unit.
    pub req: Option<BldgKind>,
    /// Extra damage per Weapons upgrade level (added to whichever of dmg / dmg_air is non-zero).
    pub up_dmg: f64,
}

/// Team-wide upgrades researched at the War Forge, three levels each.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Upgrade {
    Weapons,
    Armor,
}

pub const MAX_UPGRADE: u8 = 3;

impl Upgrade {
    pub fn key(self) -> &'static str {
        match self {
            Upgrade::Weapons => "weapons",
            Upgrade::Armor => "armor",
        }
    }
    pub fn name(self) -> &'static str {
        match self {
            Upgrade::Weapons => "Weapons",
            Upgrade::Armor => "Armor",
        }
    }
    pub fn parse(s: &str) -> Option<Upgrade> {
        [Upgrade::Weapons, Upgrade::Armor]
            .into_iter()
            .find(|u| u.key() == s)
    }
    pub fn index(self) -> usize {
        self as usize
    }
    /// Cost of researching `level` (1..=3).
    pub fn cost(self, level: u8) -> [i32; 2] {
        let c = [100, 175, 250][(level.clamp(1, 3) - 1) as usize];
        [c, c]
    }
    /// Research time in seconds for `level` (1..=3).
    pub fn time(self, level: u8) -> f64 {
        [60.0, 75.0, 90.0][(level.clamp(1, 3) - 1) as usize]
    }
}

pub struct BldgDef {
    pub key: &'static str,
    pub name: &'static str,
    pub cost: [i32; 2],
    pub w: i32,
    pub h: i32,
    pub hp: f64,
    pub armor: f64,
    pub supply: i32,
    pub build: f64,
    pub sight: f64,
    pub trains: &'static [UnitKind],
    pub dropoff: bool,
    pub on_vent: bool,
    pub req: Option<BldgKind>,
    pub range: f64,
    pub dmg: f64,
    pub dmg_air: f64,
    pub cd: f64,
    pub proj: Option<ProjKind>,
    /// Extra damage per Weapons upgrade level (turrets).
    pub up_dmg: f64,
}

pub const UNIT_KINDS: [UnitKind; 7] = [
    UnitKind::Harvester,
    UnitKind::Trooper,
    UnitKind::Vanguard,
    UnitKind::Lancer,
    UnitKind::Medic,
    UnitKind::Wasp,
    UnitKind::Observer,
];
pub const BLDG_KINDS: [BldgKind; 7] = [
    BldgKind::Core,
    BldgKind::Depot,
    BldgKind::Extractor,
    BldgKind::Barracks,
    BldgKind::Forge,
    BldgKind::Turret,
    BldgKind::Airfield,
];

const UNIT: UnitDef = UnitDef {
    key: "",
    cost: [0, 0],
    supply: 1,
    hp: 1.0,
    armor: 0.0,
    speed: 90.0,
    range: 0.0,
    dmg: 0.0,
    dmg_air: 0.0,
    cd: 1.0,
    sight: 8.0,
    r: 9.0,
    build: 15.0,
    melee: false,
    proj: None,
    air: false,
    bio: false,
    heal: 0.0,
    req: None,
    up_dmg: 0.0,
};
const HARVESTER: UnitDef = UnitDef {
    key: "harvester",
    cost: [50, 0],
    hp: 40.0,
    speed: 96.0,
    range: 0.6,
    dmg: 4.0,
    cd: 1.0,
    sight: 7.0,
    build: 12.0,
    melee: true,
    ..UNIT
};
/// Ether per trip from an Extractor on a vent that has run dry (a full one gives 6).
pub const VENT_TRICKLE: i32 = 2;

/// A Vanguard shell also hits walking units of the target's side within this many px, for this share of its damage.
pub const SHELL_SPLASH_R: f64 = 40.0;
pub const SHELL_SPLASH: f64 = 0.6;

const TROOPER: UnitDef = UnitDef {
    key: "trooper",
    cost: [50, 0],
    hp: 48.0,
    speed: 92.0,
    range: 4.5,
    dmg: 7.0,
    dmg_air: 7.0,
    cd: 0.8,
    build: 15.0,
    proj: Some(ProjKind::Bolt),
    bio: true,
    up_dmg: 1.0,
    ..UNIT
};
const VANGUARD: UnitDef = UnitDef {
    key: "vanguard",
    cost: [125, 75],
    supply: 3,
    hp: 170.0,
    armor: 2.0,
    speed: 68.0,
    range: 6.0,
    dmg: 30.0,
    cd: 1.7,
    sight: 9.0,
    r: 14.0,
    build: 28.0,
    proj: Some(ProjKind::Shell),
    up_dmg: 3.0,
    req: Some(BldgKind::Forge),
    ..UNIT
};
const LANCER: UnitDef = UnitDef {
    key: "lancer",
    cost: [75, 25],
    hp: 60.0,
    speed: 88.0,
    range: 6.0,
    dmg: 5.0,
    dmg_air: 30.0,
    cd: 1.2,
    sight: 9.0,
    build: 18.0,
    proj: Some(ProjKind::Missile),
    bio: true,
    up_dmg: 2.0,
    ..UNIT
};
const MEDIC: UnitDef = UnitDef {
    key: "medic",
    cost: [40, 20],
    hp: 45.0,
    speed: 90.0,
    build: 20.0,
    bio: true,
    heal: 14.0,
    req: Some(BldgKind::Forge),
    ..UNIT
};
const WASP: UnitDef = UnitDef {
    key: "wasp",
    cost: [100, 60],
    supply: 2,
    hp: 100.0,
    speed: 150.0,
    range: 3.0,
    dmg: 9.0,
    cd: 0.7,
    sight: 9.0,
    r: 10.0,
    build: 24.0,
    proj: Some(ProjKind::Bolt),
    air: true,
    up_dmg: 1.0,
    ..UNIT
};
/// A cheap unarmed flying scout: fast, sees far, flies over cliffs. (No cloak and no detection: it is simply small
/// and quick, and anything that shoots air can bring it down.)
const OBSERVER: UnitDef = UnitDef {
    key: "observer",
    cost: [25, 25],
    hp: 40.0,
    speed: 175.0,
    range: 0.0,
    dmg: 0.0,
    sight: 10.0,
    r: 8.0,
    build: 14.0,
    air: true,
    ..UNIT
};

const BLDG: BldgDef = BldgDef {
    key: "",
    name: "",
    cost: [0, 0],
    w: 2,
    h: 2,
    hp: 1.0,
    armor: 1.0,
    supply: 0,
    build: 20.0,
    sight: 5.0,
    trains: &[],
    dropoff: false,
    on_vent: false,
    req: None,
    range: 0.0,
    dmg: 0.0,
    dmg_air: 0.0,
    cd: 0.0,
    proj: None,
    up_dmg: 0.0,
};
const CORE: BldgDef = BldgDef {
    key: "core",
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
const DEPOT: BldgDef = BldgDef {
    key: "depot",
    name: "Supply Depot",
    cost: [100, 0],
    hp: 360.0,
    supply: 8,
    build: 22.0,
    ..BLDG
};
const EXTRACTOR: BldgDef = BldgDef {
    key: "extractor",
    name: "Ether Extractor",
    cost: [75, 0],
    hp: 420.0,
    build: 25.0,
    on_vent: true,
    ..BLDG
};
const BARRACKS: BldgDef = BldgDef {
    key: "barracks",
    name: "Barracks",
    cost: [150, 0],
    w: 3,
    h: 3,
    hp: 720.0,
    build: 40.0,
    sight: 7.0,
    trains: &[
        UnitKind::Trooper,
        UnitKind::Lancer,
        UnitKind::Medic,
        UnitKind::Vanguard,
    ],
    ..BLDG
};
const FORGE: BldgDef = BldgDef {
    key: "forge",
    name: "War Forge",
    cost: [150, 100],
    w: 3,
    h: 3,
    hp: 820.0,
    build: 45.0,
    sight: 7.0,
    trains: &[],
    req: Some(BldgKind::Barracks),
    ..BLDG
};
const TURRET: BldgDef = BldgDef {
    key: "turret",
    name: "Sentinel Turret",
    cost: [100, 0],
    hp: 320.0,
    build: 20.0,
    sight: 9.0,
    req: Some(BldgKind::Barracks),
    range: 7.0,
    dmg: 18.0,
    dmg_air: 26.0,
    cd: 1.1,
    proj: Some(ProjKind::Bolt),
    up_dmg: 2.0,
    ..BLDG
};
const AIRFIELD: BldgDef = BldgDef {
    key: "airfield",
    name: "Airfield",
    cost: [150, 100],
    w: 3,
    h: 3,
    hp: 760.0,
    build: 50.0,
    sight: 8.0,
    trains: &[UnitKind::Wasp, UnitKind::Observer],
    req: Some(BldgKind::Forge),
    ..BLDG
};

impl UnitKind {
    pub fn def(self) -> &'static UnitDef {
        match self {
            UnitKind::Harvester => &HARVESTER,
            UnitKind::Trooper => &TROOPER,
            UnitKind::Vanguard => &VANGUARD,
            UnitKind::Lancer => &LANCER,
            UnitKind::Medic => &MEDIC,
            UnitKind::Wasp => &WASP,
            UnitKind::Observer => &OBSERVER,
        }
    }
    pub fn parse(s: &str) -> Option<UnitKind> {
        UNIT_KINDS.into_iter().find(|k| k.def().key == s)
    }
    pub fn index(self) -> usize {
        self as usize
    }
}

impl UnitDef {
    /// Damage this unit deals to a target that is (or is not) flying; 0 when it cannot attack it.
    pub fn damage_vs(&self, air: bool) -> f64 {
        if air { self.dmg_air } else { self.dmg }
    }
    pub fn armed(&self) -> bool {
        self.dmg > 0.0 || self.dmg_air > 0.0
    }
}

impl BldgDef {
    pub fn damage_vs(&self, air: bool) -> f64 {
        if air { self.dmg_air } else { self.dmg }
    }
}

impl BldgKind {
    pub fn def(self) -> &'static BldgDef {
        match self {
            BldgKind::Core => &CORE,
            BldgKind::Depot => &DEPOT,
            BldgKind::Extractor => &EXTRACTOR,
            BldgKind::Barracks => &BARRACKS,
            BldgKind::Forge => &FORGE,
            BldgKind::Turret => &TURRET,
            BldgKind::Airfield => &AIRFIELD,
        }
    }
    pub fn parse(s: &str) -> Option<BldgKind> {
        BLDG_KINDS.into_iter().find(|k| k.def().key == s)
    }
    pub fn index(self) -> usize {
        self as usize
    }
}

/// AI tuning per difficulty. `first`/`gap`: seconds before the first wave and between waves.
pub struct Diff {
    pub income: f64,
    pub wave: usize,
    pub wave_grow: usize,
    pub harv: usize,
    pub rax: usize,
    pub first: f64,
    pub gap: f64,
}

pub const DIFF: [Diff; 3] = [
    Diff {
        income: 0.75,
        wave: 5,
        wave_grow: 2,
        harv: 10,
        rax: 1,
        first: 240.0,
        gap: 75.0,
    },
    Diff {
        income: 1.0,
        wave: 7,
        wave_grow: 3,
        harv: 13,
        rax: 2,
        first: 170.0,
        gap: 60.0,
    },
    Diff {
        income: 1.35,
        wave: 9,
        wave_grow: 4,
        harv: 16,
        rax: 3,
        first: 120.0,
        gap: 45.0,
    },
];

/// Top-left tile of each team's starting Command Core. Index = team.
/// Starting Core positions of an empty map (test arenas); generated maps choose their own (`Map::bases`).
pub const BASES: [(i32, i32); 2] = [(9, 54), (54, 9)];

/// The tables as JSON, so the JS side can check them against constants.js.
pub fn data_json() -> String {
    let opt = |p: Option<ProjKind>| match p {
        Some(ProjKind::Bolt) => "\"bolt\"",
        Some(ProjKind::Shell) => "\"shell\"",
        Some(ProjKind::Missile) => "\"missile\"",
        None => "null",
    };
    let key_or_null =
        |b: Option<BldgKind>| b.map_or("null".to_string(), |b| format!("\"{}\"", b.def().key));
    let units: Vec<String> = UNIT_KINDS
        .iter()
        .map(|k| {
            let d = k.def();
            format!(
                "\"{}\":{{\"cost\":[{},{}],\"supply\":{},\"hp\":{},\"armor\":{},\"speed\":{},\"range\":{},\"dmg\":{},\"dmgAir\":{},\"cd\":{},\"sight\":{},\"r\":{},\"build\":{},\"melee\":{},\"proj\":{},\"air\":{},\"bio\":{},\"heal\":{},\"req\":{},\"upDmg\":{}}}",
                d.key, d.cost[0], d.cost[1], d.supply, d.hp, d.armor, d.speed, d.range, d.dmg, d.dmg_air, d.cd, d.sight, d.r, d.build, d.melee,
                opt(d.proj), d.air, d.bio, d.heal, key_or_null(d.req), d.up_dmg
            )
        })
        .collect();
    let bldgs: Vec<String> = BLDG_KINDS
        .iter()
        .map(|k| {
            let d = k.def();
            let trains: Vec<String> = d.trains.iter().map(|u| format!("\"{}\"", u.def().key)).collect();
            format!(
                "\"{}\":{{\"name\":\"{}\",\"cost\":[{},{}],\"w\":{},\"h\":{},\"hp\":{},\"armor\":{},\"supply\":{},\"build\":{},\"sight\":{},\"trains\":[{}],\"dropoff\":{},\"onVent\":{},\"req\":{},\"range\":{},\"dmg\":{},\"dmgAir\":{},\"cd\":{},\"proj\":{},\"upDmg\":{}}}",
                d.key, d.name, d.cost[0], d.cost[1], d.w, d.h, d.hp, d.armor, d.supply, d.build, d.sight, trains.join(","), d.dropoff, d.on_vent,
                key_or_null(d.req), d.range, d.dmg, d.dmg_air, d.cd, opt(d.proj), d.up_dmg
            )
        })
        .collect();
    let diffs: Vec<String> = DIFF
        .iter()
        .map(|d| {
            format!(
                "{{\"income\":{},\"wave\":{},\"waveGrow\":{},\"harv\":{},\"rax\":{},\"first\":{},\"gap\":{}}}",
                d.income, d.wave, d.wave_grow, d.harv, d.rax, d.first, d.gap
            )
        })
        .collect();
    let ups: Vec<String> = [Upgrade::Weapons, Upgrade::Armor]
        .iter()
        .map(|u| {
            format!(
                "\"{}\":{{\"cost\":[{},{},{}],\"time\":[{},{},{}]}}",
                u.key(),
                u.cost(1)[0],
                u.cost(2)[0],
                u.cost(3)[0],
                u.time(1),
                u.time(2),
                u.time(3)
            )
        })
        .collect();
    format!(
        "{{\"units\":{{{}}},\"buildings\":{{{}}},\"upgrades\":{{{}}},\"diff\":[{}]}}",
        units.join(","),
        bldgs.join(","),
        ups.join(","),
        diffs.join(",")
    )
}
