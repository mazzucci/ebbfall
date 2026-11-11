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
    Entrenching, // (Sandbags: unlocks the Guard's Brace)
    Afterburners,
    Slipstream,
    RapidConstruction,
    Satellite,
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
    /// Researched, this unit kind moves `TECH_SPEED` times as fast.
    Speed(UnitKind),
    /// Researched, this side's buildings go up `TECH_BUILD` times as fast (sites already rising too). An economy
    /// tech: a Human builder mines nothing while it builds.
    BuildSpeed,
    /// Researched, the side has launched its satellite: every seat is told, and it unlocks what needs it (the
    /// Expedition's Uplink, `BldgDef::req_up`).
    Launch,
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
    /// A finished building of this kind its side needs to start it (the satellite: a Lab).
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
/// Sandbags: unlocks the Guard's Brace (Dig In's tech before the re-theme).
const ENTRENCHING: UpgradeDef = UpgradeDef {
    key: "entrenching",
    name: "Shield Drill",
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
    effect: Effect::Speed(UnitKind::Rider),
    ..TECH
};
const SLIPSTREAM: UpgradeDef = UpgradeDef {
    key: "slipstream",
    name: "Overclock",
    effect: Effect::Speed(UnitKind::Shrike),
    ..TECH
};

const RAPID_CONSTRUCTION: UpgradeDef = UpgradeDef {
    key: "rapidConstruction",
    name: "Master Builders",
    short: "",
    effect: Effect::BuildSpeed,
    ..TECH
};

/// Launch satellite, at the Expedition's Data center once a Lab stands: expensive and slow, told to every seat, and the
/// Uplink's requirement (PRD: the Expedition rework, rule 5).
const SATELLITE: UpgradeDef = UpgradeDef {
    key: "satellite",
    name: "Launch satellite",
    short: "Satellite",
    effect: Effect::Launch,
    cost: [[200, 0]; 3],
    time: [60.0; 3],
    req: Some(BldgKind::Loom),
    ..TECH
};
/// What a side and its allies are told when it launches its satellite.
pub const LAUNCH_OURS: &str = "You launched a satellite.";
/// What its enemies are told.
pub const LAUNCH_THEIRS: &str = "The enemy launched a satellite.";

/// Every upgrade, in index order.
pub const UPGRADES: [Upgrade; 8] = [
    Upgrade::Weapons,
    Upgrade::Armor,
    Upgrade::Shields,
    Upgrade::Entrenching,
    Upgrade::Afterburners,
    Upgrade::Slipstream,
    Upgrade::RapidConstruction,
    Upgrade::Satellite,
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
            Upgrade::Satellite => &SATELLITE,
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
