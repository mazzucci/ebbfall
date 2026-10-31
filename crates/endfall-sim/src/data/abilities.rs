//! Unit abilities. Each is one tap on the command card (a self-cast or a toggle), so they work with a thumb: no
//! targeting. A unit kind lists its abilities in `UnitDef::abilities`; the rules are in world/abilities.rs.

use super::*;

/// What an ability does.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum AbilityEffect {
    /// For `secs`: fire `fire` times as fast and move `speed` times as fast; costs `hp` of the caster's hull.
    Boost {
        secs: f64,
        fire: f64,
        speed: f64,
        hp: f64,
    },
    /// A toggle: settled in (deployed), +`range` tiles of reach and no moving; `swap` seconds to settle in or pack up,
    /// without moving or firing. A siege weapon (`Weapon::siege`) fires only while it is on.
    Settle { range: f64, swap: f64 },
    /// A hop of up to `dist` tiles towards the target (or the way the unit faces), onto open ground.
    Blink { dist: f64 },
    /// Cloaked for `secs` (as an Observer is: seen and targeted only where the other side detects).
    Cloak { secs: f64 },
}

def_struct! {
    pub struct AbilityDef {
        key: &'static str,
        name: &'static str = "name",
        /// On/off (Deploy) rather than a one-off cast.
        toggle: bool = "toggle",
        /// Seconds before it can be used again.
        cooldown: f64 = "cooldown",
        effect: AbilityEffect,
    }
}

/// How many abilities a unit kind may list (the size of its per-unit cooldowns).
pub const ABILITY_SLOTS: usize = 2;

const STIM: AbilityDef = AbilityDef {
    key: "stim",
    name: "Stim",
    toggle: false,
    cooldown: 1.0,
    effect: AbilityEffect::Boost {
        secs: 10.0,
        fire: 1.5,
        speed: 1.25,
        hp: 10.0,
    },
};
/// Retired (2026-10-31): the Vanguard's dig-in, too close to the Siege Tank's Deploy. No unit lists it and no
/// building researches its tech (`Upgrade::Entrenching`); it keeps its place in the kinds (snapshot indices).
const ENTRENCH: AbilityDef = AbilityDef {
    key: "entrench",
    name: "Entrench",
    toggle: true,
    cooldown: 0.0,
    effect: AbilityEffect::Settle {
        range: 3.0,
        swap: 2.0,
    },
};
/// The Siege Tank's: its gun fires only deployed (its weapon is `siege`), so no extra reach; slow to set up.
const DEPLOY: AbilityDef = AbilityDef {
    key: "deploy",
    name: "Deploy",
    toggle: true,
    cooldown: 0.0,
    effect: AbilityEffect::Settle {
        range: 0.0,
        swap: 3.0,
    },
};
const BLINK: AbilityDef = AbilityDef {
    key: "blink",
    name: "Blink",
    toggle: false,
    cooldown: 20.0,
    effect: AbilityEffect::Blink { dist: 4.0 },
};
const OVERCHARGE: AbilityDef = AbilityDef {
    key: "overcharge",
    name: "Overcharge",
    toggle: false,
    cooldown: 30.0,
    effect: AbilityEffect::Boost {
        secs: 6.0,
        fire: 2.0,
        speed: 1.0,
        hp: 0.0,
    },
};

const CLOAK: AbilityDef = AbilityDef {
    key: "cloak",
    name: "Cloak",
    toggle: false,
    cooldown: 40.0,
    effect: AbilityEffect::Cloak { secs: 12.0 },
};
const VEIL: AbilityDef = AbilityDef {
    key: "veil",
    name: "Veil",
    toggle: false,
    ..CLOAK
};

kinds! {
    /// Abilities. The order is the index the snapshot sends: append only.
    AbilityKind: AbilityDef, ABILITIES {
        Stim => STIM,
        Entrench => ENTRENCH, // (retired)
        Blink => BLINK,
        Overcharge => OVERCHARGE,
        Cloak => CLOAK,
        Veil => VEIL,
        Deploy => DEPLOY,
    }
}
