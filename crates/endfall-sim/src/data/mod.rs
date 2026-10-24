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
pub(crate) use export::{Obj, array, quote};
pub use humans::HUMANS;
pub use upgrades::*;
pub use vael::VAEL;

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
    /// Unit kinds (the Humans', then the Vael's).
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
    }
}

kinds! {
    /// Building kinds (the Humans', then the Vael's).
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
    }
}

pub struct UnitDef {
    pub key: &'static str,
    /// Shown to the player (the key is the stable id: save data, art frames).
    pub name: &'static str,
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
    /// The faction's worker: mines, builds and repairs; it never starts a fight and is not a threat to anyone.
    pub worker: bool,
    /// Shield points over the hull (the Vael): they take damage first and regenerate out of combat.
    pub shields: f64,
    /// Splash: this share of a shot's damage also hits the target's walking neighbours within `splash_r` px.
    pub splash: f64,
    pub splash_r: f64,
}

pub struct BldgDef {
    pub key: &'static str,
    pub name: &'static str,
    /// Label on a button ("" = the last word of the name).
    pub short: &'static str,
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
    /// The faction's headquarters: what a side starts with.
    pub hq: bool,
    /// Upgrades researched here.
    pub researches: &'static [Upgrade],
    /// Shield points over the hull (the Vael).
    pub shields: f64,
    /// Works only inside a power field (placed in one, dark when none covers it).
    pub needs_power: bool,
    /// Radius (tiles, centre to building centre) of the power field this building casts when finished; 0 = none.
    pub power: f64,
}

/// A playable side: its headquarters and worker (the start), and its Build list (basic and advanced pages).
pub struct Faction {
    pub key: &'static str,
    pub name: &'static str,
    pub hq: BldgKind,
    pub worker: UnitKind,
    pub build_basic: &'static [BldgKind],
    pub build_advanced: &'static [BldgKind],
    /// Its workers repair damaged buildings (the Vael regenerate shields instead).
    pub repairs: bool,
    /// Warp-in: a worker plants a site and is free at once; the building then grows by itself.
    pub warp: bool,
    /// How the scripted opponent plays this side.
    pub ai: AiScript,
}

/// The scripted opponent's recipe for a side: which building fills each role in its build order, and which units
/// fill each role in its army.
pub struct AiScript {
    pub supply: BldgKind,
    pub ether: BldgKind,
    pub rax: BldgKind,
    pub tech: BldgKind,
    pub tower: BldgKind,
    pub air: BldgKind,
    /// The cheap line unit the main factory trains by default.
    pub basic: UnitKind,
    /// The answer to enemy flyers (two per flyer seen).
    pub anti_air: UnitKind,
    /// Mixed in: one of `.0` per `.1` basic units, in order (each only once its requirement stands).
    pub mix: &'static [(UnitKind, usize)],
    /// The air factory's raider (raids workers; at most six).
    pub raider: UnitKind,
    /// Wave sizes scale by this (fewer, stronger units: 0.6).
    pub wave_scale: f64,
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
    worker: false,
    shields: 0.0,
    splash: 0.0,
    splash_r: 0.0,
};
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
    range: 0.0,
    dmg: 0.0,
    dmg_air: 0.0,
    cd: 0.0,
    proj: None,
    up_dmg: 0.0,
    hq: false,
    researches: &[],
    shields: 0.0,
    needs_power: false,
    power: 0.0,
};
impl UnitDef {
    /// Damage this unit deals to a target that is (or is not) flying; 0 when it cannot attack it.
    pub fn damage_vs(&self, air: bool) -> f64 {
        if air { self.dmg_air } else { self.dmg }
    }
    pub fn armed(&self) -> bool {
        self.dmg > 0.0 || self.dmg_air > 0.0
    }
    /// Armed and not a worker: picks fights, answers fire, and counts as a threat to others.
    pub fn threat(&self) -> bool {
        !self.worker && self.armed()
    }
}

impl BldgDef {
    pub fn damage_vs(&self, air: bool) -> f64 {
        if air { self.dmg_air } else { self.dmg }
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

/// Top-left tile of each team's starting Command Core. Index = team.
/// Starting Core positions of an empty map (test arenas); generated maps choose their own (`Map::bases`).
pub const BASES: [(i32, i32); 2] = [(9, 54), (54, 9)];
