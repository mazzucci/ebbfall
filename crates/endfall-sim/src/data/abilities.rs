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
    /// A toggle: settled in (deployed), +`range` tiles of reach, +`armor` armour and no moving; `swap` seconds to
    /// settle in or pack up, without moving or firing. A siege weapon (`Weapon::siege`) fires only while it is on.
    Settle { range: f64, swap: f64, armor: f64 },
    /// A hop of up to `dist` tiles towards the target (or the way the unit faces), onto open ground.
    Blink { dist: f64 },
    /// Always cloaked once researched (as an Observer is: seen and targeted only where the other side detects); never
    /// cast.
    Cloak,
}

def_struct! {
    pub struct AbilityDef {
        key: &'static str,
        name: &'static str = "name",
        /// On/off (Deploy) rather than a one-off cast.
        toggle: bool = "toggle",
        /// Used by the unit itself, never by an order: no button on the card, and a player's order to use it is
        /// refused (the Siege Tank deploys and packs up by itself).
        auto: bool = "auto",
        /// Seconds before it can be used again.
        cooldown: f64 = "cooldown",
        effect: AbilityEffect,
    }
}

/// How many abilities a unit kind may list (the size of its per-unit cooldowns).
pub const ABILITY_SLOTS: usize = 2;

/// Retired with Roster v2 (the Marine's): no unit lists it; it keeps its place in the kinds (snapshot indices).
const STIM: AbilityDef = AbilityDef {
    key: "stim",
    name: "Stim",
    toggle: false,
    auto: false,
    cooldown: 1.0,
    effect: AbilityEffect::Boost {
        secs: 10.0,
        fire: 1.5,
        speed: 1.25,
        hp: 10.0,
    },
};
/// Dig In, the Picket's (Roster v2; retired from the Vanguard on 2026-10-31): Red Alert's sandbags, +2 range and no
/// moving, a button on and off, researched with Sandbags (`Upgrade::Entrenching`).
const ENTRENCH: AbilityDef = AbilityDef {
    key: "entrench",
    name: "Dig In",
    toggle: true,
    auto: false,
    cooldown: 0.0,
    effect: AbilityEffect::Settle {
        range: 2.0,
        swap: 2.0,
        armor: 0.0,
    },
};
/// The Siege Tank's: its gun fires only deployed (its weapon is `siege`), so no extra reach; slow to set up. The
/// tank does it by itself (on reaching its target, an idle tank for what comes into its reach; packing up when
/// nothing is left in reach or it is sent to move), never on an order.
const DEPLOY: AbilityDef = AbilityDef {
    key: "deploy",
    name: "Drop Anchor",
    toggle: true,
    auto: true,
    cooldown: 0.0,
    effect: AbilityEffect::Settle {
        range: 0.0,
        swap: 3.0,
        armor: 0.0,
    },
};
/// The Breakwater's (Roster v2): it beaches itself where it fights, as the Anchor Gun anchors (by itself, packing up
/// when sent to move), quicker to set up, and beached it is a wall: +4 armour (6 in all) and its splash gun; on the
/// move only its light gun.
const BEACH: AbilityDef = AbilityDef {
    key: "beach",
    name: "Beach",
    toggle: true,
    auto: true,
    cooldown: 0.0,
    effect: AbilityEffect::Settle {
        range: 0.0,
        swap: 2.0,
        armor: 4.0,
    },
};
const BLINK: AbilityDef = AbilityDef {
    key: "blink",
    name: "Surface",
    toggle: false,
    auto: false,
    cooldown: 30.0,
    effect: AbilityEffect::Blink { dist: 4.0 },
};
const OVERCHARGE: AbilityDef = AbilityDef {
    key: "overcharge",
    name: "Surge",
    toggle: false,
    auto: false,
    cooldown: 30.0,
    effect: AbilityEffect::Boost {
        secs: 6.0,
        fire: 2.0,
        speed: 1.0,
        hp: 0.0,
    },
};

/// Once researched the unit is always cloaked (`World::is_cloaked`), with no button: an automatic ability that is
/// never cast. As Cloak it was the Raider's, retired with Roster v2 (the Kite is never hidden); as Seaglass (`VEIL`),
/// the Petrel's.
const CLOAK: AbilityDef = AbilityDef {
    key: "cloak",
    name: "Cloak",
    toggle: false,
    auto: true,
    cooldown: 0.0,
    effect: AbilityEffect::Cloak,
};
const VEIL: AbilityDef = AbilityDef {
    key: "veil",
    name: "Seaglass",
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
        Beach => BEACH,
    }
}
