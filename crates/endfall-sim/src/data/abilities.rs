//! Unit abilities. Each is one tap on the command card (a toggle), so they work with a thumb: no targeting. A unit
//! kind lists its abilities in `UnitDef::abilities`; the rules are in world/abilities.rs. Since the re-theme two are
//! left: the Guard's Brace and the Cannon's Deploy (the boosts, the hop and the cloaks went with their units).

use super::*;

/// What an ability does.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum AbilityEffect {
    /// A toggle: settled in (deployed), +`range` tiles of reach, +`armor` armor and no moving; `swap` seconds to
    /// settle in or pack up, without moving or firing. A siege weapon (`Weapon::siege`) fires only while it is on.
    Settle { range: f64, swap: f64, armor: f64 },
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

/// Brace, the Guard's (the re-theme's; Dig In before it, which gave reach): the spears set, +4 armor and no moving, a
/// button on and off, researched with Shield Drill (`Upgrade::Entrenching`). Quick to set and to lift.
const ENTRENCH: AbilityDef = AbilityDef {
    key: "entrench",
    name: "Brace",
    toggle: true,
    auto: false,
    cooldown: 0.0,
    effect: AbilityEffect::Settle {
        range: 0.0,
        swap: 1.0,
        armor: 4.0,
    },
};
/// The Siege Tank's: its gun fires only deployed (its weapon is `siege`), so no extra reach; slow to set up. The
/// tank does it by itself (on reaching its target, an idle tank for what comes into its reach; packing up when
/// nothing is left in reach or it is sent to move), never on an order.
const DEPLOY: AbilityDef = AbilityDef {
    key: "deploy",
    name: "Set Up",
    toggle: true,
    auto: true,
    cooldown: 0.0,
    effect: AbilityEffect::Settle {
        range: 0.0,
        swap: 3.0,
        armor: 0.0,
    },
};

kinds! {
    /// Abilities. The order is the index the snapshot and the wire send (the re-theme removed Stim, Surface, Surge,
    /// Cloak, Seaglass and Beach).
    AbilityKind: AbilityDef, ABILITIES {
        Entrench => ENTRENCH,
        Deploy => DEPLOY,
    }
}
