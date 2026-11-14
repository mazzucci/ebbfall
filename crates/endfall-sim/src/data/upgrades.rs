//! Team-wide upgrades: the three-level Weapons/Armor/Shields, and one-level techs (an ability, a faster raider or
//! flyer, faster construction) that make each people's tech a set of choices the other side must scout. Shields are
//! data since the re-theme (nobody has any, and nobody researches Hardshell); the shield rules keep their tests.

use super::{AbilityKind, BldgKind, UnitKind};

/// Team-wide upgrades, researched at a building that lists them (`BldgDef::researches`).
/// The order is the index the snapshot and the wire send.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Upgrade {
    Weapons,
    Armor,
    Shields,
    Entrenching, // (Shield Wall: unlocks the Guard's Brace)
    Afterburners,
    // (Overclock, the Drone's speed: no longer offered, Nov 14: too late, no real value; its slot kept for the wire's
    // indices)
    Slipstream,
    // (Master Builders: no longer offered, Nov 14: it came too late to matter; kept so the indices the snapshot and the
    // wire send stay where they were)
    RapidConstruction,
    // (Better drills: no longer offered, Nov 14: a Bot mine pays as a Villager mine from the start; kept for the indices)
    Drills,
    GridEfficiency,
}

/// What an upgrade's levels do. Several upgrades may share one effect (a race's own version of it).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Effect {
    /// Each level adds the unit's (or turret's) `up_dmg` to its damage.
    Weapons,
    /// Each level adds 1 armor to every unit.
    Armor,
    /// Each level soaks 1 damage of every hit that lands on shields (at least 1 still lands): the Vael's armor.
    Shields,
    /// Researched, the ability can be used (until then its button is locked).
    Unlock(AbilityKind),
    /// Researched, these unit kinds move `TECH_SPEED` times as fast.
    Speed(&'static [UnitKind]),
    /// Researched, this side's buildings go up `TECH_BUILD` times as fast (sites already rising too). An economy
    /// tech: a Human builder mines nothing while it builds.
    BuildSpeed,
    /// Each level, its workers carry more gold a trip (`DRILL_LOAD`).
    MineLoad,
    /// Each level, its machines draw less grid (`GRID_USE`).
    GridUse,
}

/// The speed a `Speed` tech gives its unit, as a multiple.
pub const TECH_SPEED: f64 = 1.3;
/// The construction rate a `BuildSpeed` tech gives, as a multiple (1.25: a building takes 80% of its time).
pub const TECH_BUILD: f64 = 1.25;

pub struct UpgradeDef {
    pub key: &'static str,
    pub name: &'static str,
    /// Label on a button when the name is too long for one ("" = the name).
    pub short: &'static str,
    pub effect: Effect,
    /// Cost of levels 1, 2 and 3.
    pub cost: [[i32; 2]; 3],
    /// Research time of levels 1, 2 and 3, in seconds.
    pub time: [f64; 3],
    /// How many levels it has: 3, or 1 for a tech (only the first cost and time count).
    pub levels: u8,
    /// A finished building of this kind its side needs to start it.
    pub req: Option<BldgKind>,
}

/// The most levels an upgrade has.
pub const MAX_UPGRADE: u8 = 3;

const WEAPONS: UpgradeDef = UpgradeDef {
    key: "weapons",
    name: "Weapons",
    short: "",
    effect: Effect::Weapons,
    cost: [[100, 0], [175, 0], [250, 0]],
    time: [60.0, 75.0, 90.0],
    levels: 3,
    req: None,
};
const ARMOR: UpgradeDef = UpgradeDef {
    key: "armor",
    name: "Armor",
    effect: Effect::Armor,
    ..WEAPONS
};

const SHIELDS: UpgradeDef = UpgradeDef {
    key: "shields",
    name: "Shields",
    effect: Effect::Shields,
    ..WEAPONS
};

/// A one-level tech: 100/100, 60 s.
const TECH: UpgradeDef = UpgradeDef {
    key: "",
    name: "",
    short: "",
    effect: Effect::Weapons,
    cost: [[100, 0]; 3],
    time: [60.0; 3],
    levels: 1,
    req: None,
};
/// Shield Wall: unlocks the Guard's Brace (Dig In's tech before the re-theme).
const ENTRENCHING: UpgradeDef = UpgradeDef {
    key: "entrenching",
    name: "Shield Wall",
    short: "",
    effect: Effect::Unlock(AbilityKind::Entrench),
    cost: [[125, 0]; 3],
    time: [70.0; 3],
    ..TECH
};
const AFTERBURNERS: UpgradeDef = UpgradeDef {
    key: "afterburners",
    name: "Horseshoes",
    short: "",
    effect: Effect::Speed(&[UnitKind::Rider, UnitKind::Knight]), // (the Knight too since Nov 14: Stelian)
    ..TECH
};
/// (no building researches it since Nov 14)
const SLIPSTREAM: UpgradeDef = UpgradeDef {
    key: "slipstream",
    name: "Overclock",
    effect: Effect::Speed(&[UnitKind::Shrike]),
    ..TECH
};

/// (no building researches it since Nov 14: Stelian, it unlocked too late to matter)
const RAPID_CONSTRUCTION: UpgradeDef = UpgradeDef {
    key: "rapidConstruction",
    name: "Master Builders",
    short: "",
    effect: Effect::BuildSpeed,
    ..TECH
};

/// Better drills: the Expedition's mining research at the Lab until Nov 14 (no building researches it since: the Bot mine
/// pays as a Villager mine's from the start, and the Expedition grows by its Wind turbines).
const DRILLS: UpgradeDef = UpgradeDef {
    key: "drills",
    name: "Better drills",
    short: "Drills",
    effect: Effect::MineLoad,
    cost: [[150, 0], [175, 0], [175, 0]],
    time: [60.0, 75.0, 75.0],
    levels: 2,
    req: None,
};
/// The gold a worker's load gains by `Effect::MineLoad` level (0, 1, 2): a Bot's 9 a trip goes to 10, then 11, its mine
/// from about 95% of a Villager mine to about 107%, then 118% (Stelian: level, then 115-120%).
pub const DRILL_LOAD: [i32; 3] = [0, 1, 2];

/// Grid efficiency: the Expedition's research at the Lab in place of Armor (PRD: the Expedition runs on energy, Nov 14),
/// two levels, each cutting what its machines draw on the grid by 15% (`GRID_USE`): more machines under the same grid.
const GRID_EFFICIENCY: UpgradeDef = UpgradeDef {
    key: "gridEfficiency",
    name: "Grid efficiency",
    short: "Grid",
    effect: Effect::GridUse,
    cost: [[100, 0], [175, 0], [175, 0]],
    time: [60.0, 75.0, 75.0],
    levels: 2,
    req: None,
};

/// Every upgrade, in index order.
pub const UPGRADES: [Upgrade; 9] = [
    Upgrade::Weapons,
    Upgrade::Armor,
    Upgrade::Shields,
    Upgrade::Entrenching,
    Upgrade::Afterburners,
    Upgrade::Slipstream,
    Upgrade::RapidConstruction,
    Upgrade::Drills,
    Upgrade::GridEfficiency,
];

impl Upgrade {
    pub fn def(self) -> &'static UpgradeDef {
        match self {
            Upgrade::Weapons => &WEAPONS,
            Upgrade::Armor => &ARMOR,
            Upgrade::Shields => &SHIELDS,
            Upgrade::Entrenching => &ENTRENCHING,
            Upgrade::Afterburners => &AFTERBURNERS,
            Upgrade::Slipstream => &SLIPSTREAM,
            Upgrade::RapidConstruction => &RAPID_CONSTRUCTION,
            Upgrade::Drills => &DRILLS,
            Upgrade::GridEfficiency => &GRID_EFFICIENCY,
        }
    }
    pub fn parse(s: &str) -> Option<Upgrade> {
        UPGRADES.into_iter().find(|u| u.def().key == s)
    }
    pub fn index(self) -> usize {
        self as usize
    }
    /// How many levels it has (3, or 1 for a tech).
    pub fn levels(self) -> u8 {
        self.def().levels
    }
    /// The tech that unlocks `ability`, if one does.
    pub fn unlocking(ability: AbilityKind) -> Option<Upgrade> {
        UPGRADES
            .into_iter()
            .find(|u| u.def().effect == Effect::Unlock(ability))
    }
    /// Cost of researching `level` (1..=3).
    pub fn cost(self, level: u8) -> [i32; 2] {
        self.def().cost[(level.clamp(1, 3) - 1) as usize]
    }
    /// Research time in seconds for `level` (1..=3).
    pub fn time(self, level: u8) -> f64 {
        self.def().time[(level.clamp(1, 3) - 1) as usize]
    }
}
