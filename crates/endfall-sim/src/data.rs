//! Game data, mirroring src/sim/constants.js value for value. Costs are [shards, ether]; distances in tiles
//! unless named otherwise; speeds in px/s. `test/engine.test.js` checks this table against constants.js.

pub const TILE: f64 = 32.0;
pub const MW: i32 = 64;
pub const MH: i32 = 64;
pub const WW: f64 = MW as f64 * TILE;
pub const WH: f64 = MH as f64 * TILE;
pub const DT: f64 = 1.0 / 30.0;
pub const PLAYER: u8 = 0;
pub const ENEMY: u8 = 1;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ProjKind {
    Bolt,
    Shell,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum UnitKind {
    Harvester,
    Trooper,
    Vanguard,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum BldgKind {
    Core,
    Depot,
    Extractor,
    Barracks,
    Forge,
    Turret,
}

pub struct UnitDef {
    pub key: &'static str,
    pub cost: [i32; 2],
    pub supply: i32,
    pub hp: f64,
    pub armor: f64,
    pub speed: f64,
    pub range: f64,
    pub dmg: f64,
    pub cd: f64,
    pub sight: f64,
    pub r: f64,
    pub build: f64,
    pub melee: bool,
    pub proj: Option<ProjKind>,
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
    pub trains: Option<UnitKind>,
    pub dropoff: bool,
    pub on_vent: bool,
    pub req: Option<BldgKind>,
    pub range: f64,
    pub dmg: f64,
    pub cd: f64,
    pub proj: Option<ProjKind>,
}

pub const UNIT_KINDS: [UnitKind; 3] = [UnitKind::Harvester, UnitKind::Trooper, UnitKind::Vanguard];
pub const BLDG_KINDS: [BldgKind; 6] = [
    BldgKind::Core,
    BldgKind::Depot,
    BldgKind::Extractor,
    BldgKind::Barracks,
    BldgKind::Forge,
    BldgKind::Turret,
];

const HARVESTER: UnitDef = UnitDef {
    key: "harvester",
    cost: [50, 0],
    supply: 1,
    hp: 40.0,
    armor: 0.0,
    speed: 96.0,
    range: 0.6,
    dmg: 4.0,
    cd: 1.0,
    sight: 7.0,
    r: 9.0,
    build: 12.0,
    melee: true,
    proj: None,
};
const TROOPER: UnitDef = UnitDef {
    key: "trooper",
    cost: [50, 0],
    supply: 1,
    hp: 48.0,
    armor: 0.0,
    speed: 92.0,
    range: 4.5,
    dmg: 7.0,
    cd: 0.8,
    sight: 8.0,
    r: 9.0,
    build: 15.0,
    melee: false,
    proj: Some(ProjKind::Bolt),
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
    melee: false,
    proj: Some(ProjKind::Shell),
};

#[allow(clippy::too_many_arguments)]
const fn bldg(
    key: &'static str,
    name: &'static str,
    cost: [i32; 2],
    wh: i32,
    hp: f64,
    armor: f64,
    build: f64,
    sight: f64,
) -> BldgDef {
    BldgDef {
        key,
        name,
        cost,
        w: wh,
        h: wh,
        hp,
        armor,
        supply: 0,
        build,
        sight,
        trains: None,
        dropoff: false,
        on_vent: false,
        req: None,
        range: 0.0,
        dmg: 0.0,
        cd: 0.0,
        proj: None,
    }
}

const CORE: BldgDef = BldgDef {
    supply: 10,
    trains: Some(UnitKind::Harvester),
    dropoff: true,
    ..bldg("core", "Command Core", [400, 0], 4, 1300.0, 2.0, 75.0, 10.0)
};
const DEPOT: BldgDef = BldgDef {
    supply: 8,
    ..bldg("depot", "Supply Depot", [100, 0], 2, 360.0, 1.0, 22.0, 5.0)
};
const EXTRACTOR: BldgDef = BldgDef {
    on_vent: true,
    ..bldg(
        "extractor",
        "Ether Extractor",
        [75, 0],
        2,
        420.0,
        1.0,
        25.0,
        5.0,
    )
};
const BARRACKS: BldgDef = BldgDef {
    trains: Some(UnitKind::Trooper),
    ..bldg("barracks", "Barracks", [150, 0], 3, 720.0, 1.0, 40.0, 7.0)
};
const FORGE: BldgDef = BldgDef {
    trains: Some(UnitKind::Vanguard),
    req: Some(BldgKind::Barracks),
    ..bldg("forge", "War Forge", [150, 100], 3, 820.0, 1.0, 45.0, 7.0)
};
const TURRET: BldgDef = BldgDef {
    req: Some(BldgKind::Barracks),
    range: 7.0,
    dmg: 18.0,
    cd: 1.1,
    proj: Some(ProjKind::Bolt),
    ..bldg(
        "turret",
        "Sentinel Turret",
        [100, 0],
        2,
        320.0,
        1.0,
        20.0,
        9.0,
    )
};

impl UnitKind {
    pub fn def(self) -> &'static UnitDef {
        match self {
            UnitKind::Harvester => &HARVESTER,
            UnitKind::Trooper => &TROOPER,
            UnitKind::Vanguard => &VANGUARD,
        }
    }
    pub fn parse(s: &str) -> Option<UnitKind> {
        UNIT_KINDS.into_iter().find(|k| k.def().key == s)
    }
    pub fn index(self) -> usize {
        self as usize
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
pub const BASES: [(i32, i32); 2] = [(9, 54), (54, 9)];

/// The tables as JSON, so the JS side can check them against constants.js.
pub fn data_json() -> String {
    let opt = |p: Option<ProjKind>| match p {
        Some(ProjKind::Bolt) => "\"bolt\"",
        Some(ProjKind::Shell) => "\"shell\"",
        None => "null",
    };
    let units: Vec<String> = UNIT_KINDS
        .iter()
        .map(|k| {
            let d = k.def();
            format!(
                "\"{}\":{{\"cost\":[{},{}],\"supply\":{},\"hp\":{},\"armor\":{},\"speed\":{},\"range\":{},\"dmg\":{},\"cd\":{},\"sight\":{},\"r\":{},\"build\":{},\"melee\":{},\"proj\":{}}}",
                d.key, d.cost[0], d.cost[1], d.supply, d.hp, d.armor, d.speed, d.range, d.dmg, d.cd, d.sight, d.r, d.build, d.melee, opt(d.proj)
            )
        })
        .collect();
    let bldgs: Vec<String> = BLDG_KINDS
        .iter()
        .map(|k| {
            let d = k.def();
            format!(
                "\"{}\":{{\"name\":\"{}\",\"cost\":[{},{}],\"w\":{},\"h\":{},\"hp\":{},\"armor\":{},\"supply\":{},\"build\":{},\"sight\":{},\"trains\":{},\"dropoff\":{},\"onVent\":{},\"req\":{},\"range\":{},\"dmg\":{},\"cd\":{},\"proj\":{}}}",
                d.key, d.name, d.cost[0], d.cost[1], d.w, d.h, d.hp, d.armor, d.supply, d.build, d.sight,
                d.trains.map_or("null".to_string(), |u| format!("\"{}\"", u.def().key)),
                d.dropoff, d.on_vent,
                d.req.map_or("null".to_string(), |b| format!("\"{}\"", b.def().key)),
                d.range, d.dmg, d.cd, opt(d.proj)
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
    format!(
        "{{\"units\":{{{}}},\"buildings\":{{{}}},\"diff\":[{}],\"bases\":[{{\"x\":{},\"y\":{}}},{{\"x\":{},\"y\":{}}}]}}",
        units.join(","),
        bldgs.join(","),
        diffs.join(","),
        BASES[0].0,
        BASES[0].1,
        BASES[1].0,
        BASES[1].1
    )
}
