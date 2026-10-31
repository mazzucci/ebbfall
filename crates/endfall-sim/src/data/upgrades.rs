//! Team-wide upgrades: the three-level Weapons/Armor/Shields, and one-level techs (a heavy unit's ability, a faster
//! flyer, faster construction) that make each race's tech a set of choices the other side must scout. A line unit's
//! ability (Stim, Blink) needs none: it is there from the first fight.

use super::{AbilityKind, UnitKind};

/// Team-wide upgrades, researched at a building that lists them (`BldgDef::researches`).
/// The order is the index the snapshot sends; append only.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Upgrade {
    Weapons,
    Armor,
    Shields,
    Entrenching, // (retired: nothing researches it)
    Afterburners,
    OverchargeCore,
    Slipstream,
    CloakingField,
    VeilWeave,
    RapidConstruction,
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
}

/// The most levels an upgrade has.
pub const MAX_UPGRADE: u8 = 3;

const WEAPONS: UpgradeDef = UpgradeDef {
    key: "weapons",
    name: "Weapons",
    short: "",
    effect: Effect::Weapons,
    cost: [[100, 100], [175, 175], [250, 250]],
    time: [60.0, 75.0, 90.0],
    levels: 3,
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
    cost: [[100, 100]; 3],
    time: [60.0; 3],
    levels: 1,
};
/// Retired with the Entrench it unlocked (2026-10-31): no building researches it; it keeps its index.
const ENTRENCHING: UpgradeDef = UpgradeDef {
    key: "entrenching",
    name: "Entrenching",
    short: "Entrench",
    effect: Effect::Unlock(AbilityKind::Entrench),
    cost: [[125, 125]; 3],
    time: [70.0; 3],
    ..TECH
};
const AFTERBURNERS: UpgradeDef = UpgradeDef {
    key: "afterburners",
    name: "Afterburners",
    short: "Afterburn",
    effect: Effect::Speed(UnitKind::Raider),
    ..TECH
};
const OVERCHARGE_CORE: UpgradeDef = UpgradeDef {
    key: "overchargeCore",
    name: "Overcharge Core",
    short: "Overcharge",
    effect: Effect::Unlock(AbilityKind::Overcharge),
    cost: [[150, 150]; 3],
    time: [80.0; 3],
    ..TECH
};
const SLIPSTREAM: UpgradeDef = UpgradeDef {
    key: "slipstream",
    name: "Slipstream",
    effect: Effect::Speed(UnitKind::Shrike),
    ..TECH
};

const CLOAKING_FIELD: UpgradeDef = UpgradeDef {
    key: "cloakingField",
    name: "Cloaking Field",
    short: "Cloak Field",
    effect: Effect::Unlock(AbilityKind::Cloak),
    cost: [[150, 150]; 3],
    time: [80.0; 3],
    ..TECH
};
const VEIL_WEAVE: UpgradeDef = UpgradeDef {
    key: "veilWeave",
    name: "Veil Weave",
    short: "",
    effect: Effect::Unlock(AbilityKind::Veil),
    ..CLOAKING_FIELD
};
const RAPID_CONSTRUCTION: UpgradeDef = UpgradeDef {
    key: "rapidConstruction",
    name: "Rapid Construction",
    short: "Rapid Build",
    effect: Effect::BuildSpeed,
    ..TECH
};

/// Every upgrade, in index order.
pub const UPGRADES: [Upgrade; 10] = [
    Upgrade::Weapons,
    Upgrade::Armor,
    Upgrade::Shields,
    Upgrade::Entrenching,
    Upgrade::Afterburners,
    Upgrade::OverchargeCore,
    Upgrade::Slipstream,
    Upgrade::CloakingField,
    Upgrade::VeilWeave,
    Upgrade::RapidConstruction,
];

impl Upgrade {
    pub fn def(self) -> &'static UpgradeDef {
        match self {
            Upgrade::Weapons => &WEAPONS,
            Upgrade::Armor => &ARMOR,
            Upgrade::Shields => &SHIELDS,
            Upgrade::Entrenching => &ENTRENCHING,
            Upgrade::Afterburners => &AFTERBURNERS,
            Upgrade::OverchargeCore => &OVERCHARGE_CORE,
            Upgrade::Slipstream => &SLIPSTREAM,
            Upgrade::CloakingField => &CLOAKING_FIELD,
            Upgrade::VeilWeave => &VEIL_WEAVE,
            Upgrade::RapidConstruction => &RAPID_CONSTRUCTION,
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
