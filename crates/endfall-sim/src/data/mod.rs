//! Game data. Costs are [shards, ether]; distances in tiles unless named otherwise; speeds in px/s.
//! The only source of game numbers: build:wasm exports them to src/engine/pkg/data.js, and the client's
//! src/engine/constants.js adds just hotkeys and descriptions.
//!
//! Here: map and tick constants, the kinds and the shape of their definitions, the economy constants and the
//! factions' structure. Each race's numbers are in its own file (humans, vael); upgrades, difficulty and the JSON
//! export have theirs.

mod diff;
mod export;
mod humans;
mod upgrades;
mod vael;

pub use diff::*;
pub use export::data_json;
pub(crate) use export::{Obj, ToJson, array, quote};
pub use humans::HUMANS;
pub use upgrades::*;
pub use vael::VAEL;

pub const TILE: f64 = 32.0;
pub const DT: f64 = 1.0 / 30.0;
pub const PLAYER: u8 = 0;
pub const ENEMY: u8 = 1;
/// The most seats a World can have (bit masks of seats fit a u8: `Event::Fire::seen`, the snapshot's `hid`).
pub const MAX_SEATS: usize = 8;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ProjKind {
    Bolt,
    Shell,
    Missile,
}

/// Declares a kind enum, the list of every kind (in index order: the index the snapshot sends, so append only)
/// and its table of definitions, from one list.
macro_rules! kinds {
    ($(#[$m:meta])* $Kind:ident: $Def:ty, $ALL:ident { $($V:ident => $D:expr),* $(,)? }) => {
        $(#[$m])*
        #[derive(Clone, Copy, PartialEq, Eq, Debug)]
        pub enum $Kind {
            $($V),*
        }
        /// Every kind, in index order.
        pub const $ALL: [$Kind; [$($Kind::$V),*].len()] = [$($Kind::$V),*];
        impl $Kind {
            pub fn def(self) -> &'static $Def {
                match self {
                    $($Kind::$V => &$D),*
                }
            }
            pub fn parse(s: &str) -> Option<$Kind> {
                $ALL.into_iter().find(|k| k.def().key == s)
            }
            pub fn index(self) -> usize {
                self as usize
            }
        }
    };
}

kinds! {
    /// Unit kinds (the Humans', then the Vael's). The order is the index the snapshot sends: append only.
    UnitKind: UnitDef, UNIT_KINDS {
        Harvester => humans::HARVESTER,
        Trooper => humans::TROOPER,
        Vanguard => humans::VANGUARD,
        Lancer => humans::LANCER,
        Medic => humans::MEDIC,
        Wasp => humans::WASP,
        Observer => humans::OBSERVER,
        Lumen => vael::LUMEN,
        Scythe => vael::SCYTHE,
        Prism => vael::PRISM,
        Monolith => vael::MONOLITH,
        Shrike => vael::SHRIKE,
        Halo => vael::HALO,
        Bastion => humans::BASTION,
        Sovereign => vael::SOVEREIGN,
        SiegeTank => humans::SIEGE_TANK,
    }
}

kinds! {
    /// Building kinds (the Humans', then the Vael's). Same rule: append only.
    BldgKind: BldgDef, BLDG_KINDS {
        Core => humans::CORE,
        Depot => humans::DEPOT,
        Extractor => humans::EXTRACTOR,
        Barracks => humans::BARRACKS,
        Forge => humans::FORGE,
        Turret => humans::TURRET,
        Airfield => humans::AIRFIELD,
        Conflux => vael::CONFLUX,
        Spire => vael::SPIRE,
        Siphon => vael::SIPHON,
        Kiln => vael::KILN,
        Loom => vael::LOOM,
        Ward => vael::WARD,
        Zenith => vael::ZENITH,
        Factory => humans::FACTORY,
    }
}

/// Declares a definition struct and its JSON for the client from one field list: `field: Type = "jsonKey"`; a field
/// without a JSON key stays out of the export (the key itself is the map key). Field types export through `ToJson`.
macro_rules! def_struct {
    ($(#[$m:meta])* pub struct $Name:ident { $( $(#[$fm:meta])* $f:ident : $t:ty $(= $json:literal)? ),* $(,)? }) => {
        $(#[$m])*
        pub struct $Name {
            $( $(#[$fm])* pub $f: $t ),*
        }
        impl $Name {
            /// The fields with a JSON key, as an object, in declaration order.
            pub fn to_json(&self) -> String {
                let o = Obj::new();
                $( $( let o = o.raw($json, ToJson::to_json(&self.$f)); )? )*
                o.done()
            }
        }
    };
}

mod abilities;
pub use abilities::*;

def_struct! {
    /// A weapon: what a unit or a defensive building shoots with.
    #[derive(Clone, Copy)]
    pub struct Weapon {
        /// Reach in tiles (edge to edge).
        range: f64 = "range",
        /// Nothing nearer than this many tiles (edge to edge) can be hit: a siege gun's blind ring (0 = none).
        min_range: f64 = "minRange",
        /// Fires only while its unit's toggle is on (a Siege Tank deployed); on the move it cannot fire at all.
        siege: bool = "siege",
        /// Damage per shot against ground targets (units and buildings); 0 = cannot attack the ground.
        dmg: f64 = "dmg",
        /// Damage per shot against flying units; 0 = cannot attack the air.
        dmg_air: f64 = "dmgAir",
        /// Seconds between shots.
        cd: f64 = "cd",
        proj: Option<ProjKind> = "proj",
        melee: bool = "melee",
        /// Splash: this share of a shot's damage also hits the target's walking neighbours within `splash_r` px.
        splash: f64 = "splash",
        splash_r: f64 = "splashR",
        /// Extra damage per Weapons upgrade level (added to whichever of dmg / dmg_air is non-zero).
        up_dmg: f64 = "upDmg",
    }
}

/// The defaults a weapon in the tables fills in from.
pub(crate) const W: Weapon = Weapon {
    range: 0.0,
    min_range: 0.0,
    siege: false,
    dmg: 0.0,
    dmg_air: 0.0,
    cd: 1.0,
    proj: None,
    melee: false,
    splash: 0.0,
    splash_r: 0.0,
    up_dmg: 0.0,
};

impl Weapon {
    /// Damage against a target that is (or is not) flying; 0 when it cannot hit it.
    pub fn damage_vs(&self, air: bool) -> f64 {
        if air { self.dmg_air } else { self.dmg }
    }
    /// What it can hit: (ground, air).
    pub fn hits(&self) -> (bool, bool) {
        (self.dmg > 0.0, self.dmg_air > 0.0)
    }
}

impl UnitKind {
    /// Its toggle (Entrench, Deploy), if it has one: the first of its abilities that settles it in.
    pub fn toggle(self) -> Option<AbilityKind> {
        self.def()
            .abilities
            .iter()
            .copied()
            .find(|a| matches!(a.def().effect, AbilityEffect::Entrench { .. }))
    }
    /// Its weapon fires only while its toggle is on (a Siege Tank).
    pub fn siege(self) -> bool {
        self.def().weapon.is_some_and(|w| w.siege) && self.toggle().is_some()
    }
}

def_struct! {
    pub struct UnitDef {
        key: &'static str,
        /// Shown to the player (the key is the stable id: save data, art frames).
        name: &'static str = "name",
        /// The faction's worker: mines, builds and repairs; it never starts a fight and is not a threat to anyone.
        worker: bool = "worker",
        /// Shield points over the hull (the Vael): they take damage first and regenerate out of combat.
        shields: f64 = "shields",
        cost: [i32; 2] = "cost",
        supply: i32 = "supply",
        hp: f64 = "hp",
        armor: f64 = "armor",
        speed: f64 = "speed",
        sight: f64 = "sight",
        r: f64 = "r",
        build: f64 = "build",
        /// Flies: moves in straight lines over terrain and buildings, only collides with other flyers.
        air: bool = "air",
        /// Living infantry (Medics heal these).
        bio: bool = "bio",
        /// Hit points per second healed into nearby damaged infantry (Medic), or with `mend`, shield points into nearby
        /// shielded allies (Halo).
        heal: f64 = "heal",
        /// The heal goes to shields, not hulls: the Halo mends any shielded ally, in combat too.
        mend: bool = "mend",
        /// A finished building of this kind is needed to train the unit.
        req: Option<BldgKind> = "req",
        /// What it shoots with; None = unarmed.
        weapon: Option<Weapon> = "weapon",
        /// Its abilities (at most ABILITY_SLOTS), in card order.
        abilities: &'static [AbilityKind] = "abilities",
        /// A capital unit: one of a side's late, expensive giants (announced when the other side first sees one).
        capital: bool = "capital",
        /// Always cloaked: the other side can neither see nor target it except where it detects (`detect`).
        cloaked: bool = "cloaked",
        /// Radius (tiles) in which it reveals the other side's cloaked units; 0 = none.
        detect: f64 = "detect",
    }
}

def_struct! {
    pub struct BldgDef {
        key: &'static str,
        name: &'static str = "name",
        /// Label on a button ("" = the last word of the name).
        short: &'static str = "short",
        /// The faction's headquarters: what a side starts with.
        hq: bool = "hq",
        /// Shield points over the hull (the Vael).
        shields: f64 = "shields",
        /// Works only inside a power field (placed in one, dark when none covers it).
        needs_power: bool = "needsPower",
        /// Radius (tiles, centre to building centre) of the power field this building casts when finished; 0 = none.
        power: f64 = "power",
        /// Upgrades researched here.
        researches: &'static [Upgrade] = "researches",
        cost: [i32; 2] = "cost",
        w: i32 = "w",
        h: i32 = "h",
        hp: f64 = "hp",
        armor: f64 = "armor",
        supply: i32 = "supply",
        build: f64 = "build",
        sight: f64 = "sight",
        trains: &'static [UnitKind] = "trains",
        dropoff: bool = "dropoff",
        on_vent: bool = "onVent",
        req: Option<BldgKind> = "req",
        /// A turret's weapon; None = no defence.
        weapon: Option<Weapon> = "weapon",
        /// Radius (tiles) in which it reveals the other side's cloaked units when finished (and powered); 0 = none.
        detect: f64 = "detect",
    }
}

/// Seconds a unit takes to warp in at a power field (a warping side's factory sending it to its rally point).
pub const UNIT_WARP: f64 = 2.5;

/// A playable side: its headquarters and worker (the start), and its Build list (basic and advanced pages).
pub struct Faction {
    pub key: &'static str,
    pub name: &'static str,
    pub hq: BldgKind,
    pub worker: UnitKind,
    pub build_basic: &'static [BldgKind],
    pub build_advanced: &'static [BldgKind],
    /// Its supply building, its refinery (built on an ether vent) and what casts its power fields, if it has them:
    /// the roles its messages and its AI name.
    pub supply: BldgKind,
    pub ether: BldgKind,
    pub power: Option<BldgKind>,
    /// The sound of its shots, by projectile: [bolt, shell, missile, melee] (recipe names in src/client/audio.js).
    pub sounds: [&'static str; 4],
    /// Its workers repair damaged buildings (the Vael regenerate shields instead).
    pub repairs: bool,
    /// Warp-in: a worker plants a site and is free at once; the building then grows by itself. And a factory's
    /// new units warp in at its rally point when that is inside one of the side's power fields (`UNIT_WARP` s).
    pub warp: bool,
    /// How the scripted opponent plays this side.
    pub ai: AiScript,
}

/// The scripted opponent's recipe for a side: which building fills each role in its build order (besides the
/// faction's supply and refinery), and which units fill each role in its army.
pub struct AiScript {
    pub rax: BldgKind,
    pub tech: BldgKind,
    pub tower: BldgKind,
    pub air: BldgKind,
    /// Its vehicle bay, if it has one: it trains only the mixed-in units it can make, by the mix's ratios (beside
    /// the main factory, which then keeps to its own).
    pub heavy: Option<BldgKind>,
    /// The cheap line unit the main factory trains by default.
    pub basic: UnitKind,
    /// The answer to enemy flyers (two per flyer seen).
    pub anti_air: UnitKind,
    /// Mixed in: one of `.0` per `.1` basic units, in order (each only once its requirement stands, and not before
    /// `.2` seconds of game time: a late specialist).
    pub mix: &'static [(UnitKind, usize, f64)],
    /// The air factory's raider (raids workers; at most six).
    pub raider: UnitKind,
    /// Wave sizes scale by this (fewer, stronger units: 0.6).
    pub wave_scale: f64,
    /// Seconds before it starts its techs (sooner only on a level that researches sooner; none does today). A
    /// knob per side: both wait until 5:00, when the opening's factories and power fields are up.
    pub tech_from: f64,
}

impl Faction {
    /// Whether this side can build `kind` (everything on its Build list, the headquarters included).
    pub fn builds(&self, kind: BldgKind) -> bool {
        self.build_basic.contains(&kind) || self.build_advanced.contains(&kind)
    }
    /// Index in FACTIONS (what the client is sent).
    pub fn index(&self) -> usize {
        FACTIONS.iter().position(|f| f.key == self.key).unwrap_or(0)
    }
}

/// The playable sides, in the order their index is sent to the client.
pub const FACTIONS: [&Faction; 2] = [&HUMANS, &VAEL];

const UNIT: UnitDef = UnitDef {
    key: "",
    name: "",
    cost: [0, 0],
    supply: 1,
    hp: 1.0,
    armor: 0.0,
    speed: 90.0,
    sight: 8.0,
    r: 9.0,
    build: 15.0,
    air: false,
    bio: false,
    heal: 0.0,
    mend: false,
    req: None,
    worker: false,
    shields: 0.0,
    weapon: None,
    abilities: &[],
    capital: false,
    cloaked: false,
    detect: 0.0,
};
/// Units a building's production queue holds (the one in training first).
pub const QUEUE_MAX: usize = 5;
/// Harvesters that can mine one field or vent at the same time; the others wait or move to a quieter field.
pub const MINE_SLOTS: i32 = 1;
/// Seconds to mine a load: 8 shards, or 6 ether (faster, so one vent still feeds about three harvesters).
pub const SHARD_MINE_TIME: f64 = 2.0;
pub const ETHER_MINE_TIME: f64 = 1.6;
/// How far (tiles) from a busy field a harvester looks for a quieter one.
pub const SPREAD_RANGE: f64 = 7.0;
/// Shields regenerate after this long without being hit (s), at these rates per second (units, buildings).
pub const SHIELD_DELAY: f64 = 6.0;
pub const SHIELD_REGEN_UNIT: f64 = 3.0;
pub const SHIELD_REGEN_BLDG: f64 = 2.0;

/// Ether per trip from an Ether Rig on a vent that has run dry (a full one gives 6).
pub const VENT_TRICKLE: i32 = 2;

/// A Vanguard shell also hits walking units of the target's side within this many px, for this share of its damage.
pub const SHELL_SPLASH_R: f64 = 40.0;
pub const SHELL_SPLASH: f64 = 0.6;

const BLDG: BldgDef = BldgDef {
    key: "",
    name: "",
    short: "",
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
    hq: false,
    researches: &[],
    shields: 0.0,
    needs_power: false,
    power: 0.0,
    weapon: None,
    detect: 0.0,
};
impl UnitDef {
    /// Damage this unit deals to a target that is (or is not) flying; 0 when it cannot attack it.
    pub fn damage_vs(&self, air: bool) -> f64 {
        self.weapon.map_or(0.0, |w| w.damage_vs(air))
    }
    pub fn armed(&self) -> bool {
        self.weapon.is_some()
    }
    /// Armed and not a worker: picks fights, answers fire, and counts as a threat to others.
    pub fn threat(&self) -> bool {
        !self.worker && self.armed()
    }
}

impl BldgDef {
    pub fn damage_vs(&self, air: bool) -> f64 {
        self.weapon.map_or(0.0, |w| w.damage_vs(air))
    }
}

impl BldgDef {
    /// The short name on a button: `short`, or the last word of the name ("Supply Depot" -> "Depot").
    pub fn label(&self) -> &'static str {
        if !self.short.is_empty() {
            self.short
        } else {
            self.name.rsplit(' ').next().unwrap_or(self.name)
        }
    }
}
