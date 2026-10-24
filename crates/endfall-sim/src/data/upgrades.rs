//! Team-wide upgrades.

/// Team-wide upgrades, three levels each, researched at a building that lists them (`BldgDef::researches`).
/// The order is the index the snapshot sends; append only.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Upgrade {
    Weapons,
    Armor,
}

/// What an upgrade's levels do. Several upgrades may share one effect (a race's own version of it).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Effect {
    /// Each level adds the unit's (or turret's) `up_dmg` to its damage.
    Weapons,
    /// Each level adds 1 armor to every unit.
    Armor,
}

pub struct UpgradeDef {
    pub key: &'static str,
    pub name: &'static str,
    pub effect: Effect,
    /// Cost of levels 1, 2 and 3.
    pub cost: [[i32; 2]; 3],
    /// Research time of levels 1, 2 and 3, in seconds.
    pub time: [f64; 3],
}

pub const MAX_UPGRADE: u8 = 3;

const WEAPONS: UpgradeDef = UpgradeDef {
    key: "weapons",
    name: "Weapons",
    effect: Effect::Weapons,
    cost: [[100, 100], [175, 175], [250, 250]],
    time: [60.0, 75.0, 90.0],
};
const ARMOR: UpgradeDef = UpgradeDef {
    key: "armor",
    name: "Armor",
    effect: Effect::Armor,
    ..WEAPONS
};

/// Every upgrade, in index order.
pub const UPGRADES: [Upgrade; 2] = [Upgrade::Weapons, Upgrade::Armor];

impl Upgrade {
    pub fn def(self) -> &'static UpgradeDef {
        match self {
            Upgrade::Weapons => &WEAPONS,
            Upgrade::Armor => &ARMOR,
        }
    }
    pub fn parse(s: &str) -> Option<Upgrade> {
        UPGRADES.into_iter().find(|u| u.def().key == s)
    }
    pub fn index(self) -> usize {
        self as usize
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
