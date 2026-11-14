//! Game data. Costs are [gold, 0] (the second slot always 0); distances in tiles unless named otherwise; speeds in px/s.
//! The only source of game numbers: build:wasm exports them to src/engine/pkg/data.js, and the client's
//! src/engine/constants.js adds just hotkeys and descriptions.
//!
//! Here: map and tick constants, the kinds and the shape of their definitions, the economy constants and the
//! factions' structure. Each race's numbers are in its own file (humans, vael); upgrades, difficulty and the JSON
//! export have theirs.

mod diff;
mod export;
mod humans;
pub mod radio;
mod tide;
mod upgrades;
mod vael;

pub use diff::*;
pub use export::data_json;
pub(crate) use export::{Obj, ToJson, array, quote};
pub use humans::HUMANS;
pub use tide::*;
pub use upgrades::*;
pub use vael::VAEL;

pub const TILE: f64 = 32.0;
pub const DT: f64 = 1.0 / 30.0;
pub const PLAYER: u8 = 0;
pub const ENEMY: u8 = 1;
/// The most seats a World can have (bit masks of seats fit a u8: `Event::Fire::seen`, the snapshot's `hid`).
pub const MAX_SEATS: usize = 8;
/// The Kingdom's most population, the same on every map (PRD: the Expedition runs on energy, Nov 14: fixed caps, tuned
/// together with the grid's). 100, 120 and 140 by the map's width before.
pub const POP_MAX: i32 = 120;
/// The Expedition's most grid, the same on every map: what its machines, its mercenaries and its buildings draw while
/// they exist (PRD: the Expedition runs on energy, Nov 14: "Energy builds things; the grid keeps them running"). The
/// Power and the hired places it replaces were 240 and 30 on 96x96 (a hired place two grid: 300), 280 and 35 on
/// 128x128; the Data center gives 55 and a Substation 20, so thirteen Substations fill it.
pub const GRID_MAX: i32 = 300;
/// A machine takes about this many grid for a Kingdom unit's one place of its tier, a mercenary as much (the AI's
/// margins in grid scale by it: `World::places`).
pub const GRID_PER_PLACE: i32 = 2;
/// The share of its grid a machine draws by Grid efficiency level (`Effect::GridUse`, the Expedition's research at the
/// Lab in place of its Armor), each level 15% less: a unit's draw rounds to whole grid (`World::takes`).
pub const GRID_USE: [f64; 3] = [1.0, 0.85, 0.7];

/// The share of its speed a Walk unit keeps in the shallows (Amph units and flyers keep all of theirs).
pub const WADE_SPEED: f64 = 0.7;
/// A worker carrying gold walks at this share of its speed (the load slows it; Stelian, Nov 12: calm trips, not a
/// frantic shuttle): with the workers' own speed cut to about 87%, about 72% of what it was.
pub const LOADED_SPEED: f64 = 0.83;
/// The share of its speed a harpooned unit keeps while slowed (`Weapon::slow`; flyers too).
pub const SLOW_SPEED: f64 = 0.5;

/// How a unit gets about: on foot over land and shallows (Walk), anywhere water or land (Amph), or in the air (Fly).
/// Rock and buildings block Walk and Amph alike (src/map.rs `passable`). No kind is Amph since the re-theme (every
/// ground unit of both peoples walks); the class stays, as data.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Move {
    Walk,
    Amph,
    Fly,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ProjKind {
    Bolt,
    Shell,
    Missile,
}

/// Declares a kind enum, the list of every kind (in index order: the index the snapshot and the wire send) and its
/// table of definitions, from one list.
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
    /// Unit kinds (the Kingdom's, sim race `humans`, then the Expedition's, `vael`). The order is the index the snapshot
    /// and the wire send, within one build (the client's tables come from the same build, and a room seats one build):
    /// the re-theme removed the retired kinds (the Breakwater, the Kite, the Netter, the Argonaut) rather than keep them
    /// untrainable. New kinds go at the end.
    UnitKind: UnitDef, UNIT_KINDS {
        Harvester => humans::HARVESTER,
        Trooper => humans::TROOPER,
        Lancer => humans::LANCER,
        Medic => humans::MEDIC,
        Observer => humans::OBSERVER,
        Lumen => vael::LUMEN,
        Scythe => vael::SCYTHE,
        Prism => vael::PRISM,
        Monolith => vael::MONOLITH,
        Shrike => vael::SHRIKE,
        Halo => vael::HALO,
        Bastion => humans::BASTION,
        SiegeTank => humans::SIEGE_TANK,
        Umbra => vael::UMBRA,
        Rider => humans::RIDER,
        Knight => humans::KNIGHT,
        Bruiser => vael::BRUISER,
    }
}

kinds! {
    /// Building kinds (the Kingdom's, then the Expedition's). Same rule (the Gyre, the Vael's hangar, removed).
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
        Factory => humans::FACTORY,
        Eclipse => vael::ECLIPSE,
        Uplink => vael::UPLINK,
        Substation => vael::SUBSTATION,
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
        /// Splash: this share of a shot's damage also hits the target's walking neighbors within `splash_r` px.
        splash: f64 = "splash",
        splash_r: f64 = "splashR",
        /// Extra damage per Weapons upgrade level (added to whichever of dmg / dmg_air is non-zero).
        up_dmg: f64 = "upDmg",
        /// The Harpoon: a unit it hits is slowed for this many seconds (`SLOW_SPEED`, and no abilities); 0 = none.
        slow: f64 = "slow",
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
    slow: 0.0,
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
    /// The seconds a worker of this kind spends inside a mine for a load (`UnitDef::mine_time`, or `MINE_TIME`).
    pub fn mine_time(self) -> f64 {
        let t = self.def().mine_time;
        if t > 0.0 { t } else { MINE_TIME }
    }
    /// Its toggle (Deploy), if it has one: the first of its abilities that settles it in.
    pub fn toggle(self) -> Option<AbilityKind> {
        self.def()
            .abilities
            .iter()
            .copied()
            .find(|a| matches!(a.def().effect, AbilityEffect::Settle { .. }))
    }
    /// Its weapon fires only while its toggle is on (a Siege Tank).
    pub fn siege(self) -> bool {
        self.def().weapon.is_some_and(|w| w.siege) && self.toggle().is_some()
    }
    /// Whether some building of either people trains it (the healers stay in the tables, trained nowhere: the heal
    /// rules keep their tests, and a healer can come back as data).
    pub fn trainable(self) -> bool {
        FACTIONS.iter().any(|f| {
            f.build_basic
                .iter()
                .chain(f.build_advanced)
                .any(|b| b.def().trains.contains(&self))
        })
    }
}

def_struct! {
    pub struct UnitDef {
        key: &'static str,
        /// Shown to the player (the key is the stable id: save data, art frames).
        name: &'static str = "name",
        /// The faction's worker: mines, builds and repairs; it never starts a fight and is not a threat to anyone.
        worker: bool = "worker",
        /// A worker's mining (Stelian, Nov 12: the Kingdom many and cheap, the Expedition few and efficient): how many
        /// may be inside a gold mine at once (counting everyone inside, of either people: one goes in while fewer than
        /// its own kind's number are), and the gold it comes out with. 0 for every other unit.
        mine_cap: i32 = "mineCap",
        mine_load: i32 = "mineLoad",
        /// The seconds it spends inside a mine for a load (0: `MINE_TIME`): the Bot a little less, so a saturated Bot
        /// mine pays as a Villager mine (six with 9 in 7.2 s, eight with 7 in 7.5 s).
        mine_time: f64 = "mineTime",
        /// Shield points over the hull (the Vael): they take damage first and regenerate out of combat.
        shields: f64 = "shields",
        cost: [i32; 2] = "cost",
        /// The places it takes: the Kingdom's population, or the Expedition's grid (its machines and its mercenaries
        /// alike; a machine's draw falls with Grid efficiency, `World::takes`).
        supply: i32 = "supply",
        hp: f64 = "hp",
        armor: f64 = "armor",
        speed: f64 = "speed",
        sight: f64 = "sight",
        r: f64 = "r",
        build: f64 = "build",
        /// Flies: moves in straight lines over terrain and buildings, only collides with other flyers.
        air: bool = "air",
        /// How it gets about (`Move`): Walk for every ground unit, Fly for flyers (exactly the `air` ones).
        mv: Move = "move",
        /// Living infantry (Medics heal these).
        bio: bool = "bio",
        /// Hit points per second healed into nearby damaged infantry (the Mender), or with `mend` into any nearby ally.
        heal: f64 = "heal",
        /// The heal goes to any ally, nacre (shields) first, then hull: the Tender mends in combat too.
        mend: bool = "mend",
        /// A finished building of this kind is needed to train the unit.
        req: Option<BldgKind> = "req",
        /// What it shoots with; None = unarmed. A siege gun's (`Weapon::siege`) only while its toggle is on.
        weapon: Option<Weapon> = "weapon",
        /// A siege gun's light gun, what it shoots with while its toggle is off (on its tracks); None = nothing then.
        light: Option<Weapon> = "light",
        /// Its abilities (at most ABILITY_SLOTS), in card order.
        abilities: &'static [AbilityKind] = "abilities",
        /// A capital unit: one of a side's late, expensive giants (announced when the other side first sees one; none
        /// since the re-theme, as data).
        capital: bool = "capital",
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
        /// Upgrades researched here.
        researches: &'static [Upgrade] = "researches",
        cost: [i32; 2] = "cost",
        w: i32 = "w",
        h: i32 = "h",
        hp: f64 = "hp",
        armor: f64 = "armor",
        /// The places it adds once finished (population, or the Expedition's grid).
        supply: i32 = "supply",
        /// The grid it uses while it stands, from the moment it is placed until it is destroyed or
        /// cancelled (the Portal).
        uses: i32 = "uses",
        /// At most one a seat, standing or going up (the Portal: `World::single_room`).
        single: bool = "single",
        build: f64 = "build",
        sight: f64 = "sight",
        trains: &'static [UnitKind] = "trains",
        dropoff: bool = "dropoff",
        /// Pays its owner by itself, with no workers, this much a second (0: nothing): the Kingdom's Market
        /// `PUMP_RATE`, the Expedition's Wind turbine `TURBINE_RATE`.
        pays: f64 = "pays",
        /// At most this many a finished headquarters of its side (0: no such rule): one Market a Castle, five Wind
        /// turbines a Data center (a new headquarters at an expansion allows more).
        per_hq: i32 = "perHq",
        req: Option<BldgKind> = "req",
        /// A building its side must have standing, finished, for this one to train (the Portal: an Uplink; the arc,
        /// Nov 13): its training waits while there is none, and a unit is refused with the reason.
        trains_with: Option<BldgKind> = "trainsWith",
        /// A turret's weapon; None = no defense.
        weapon: Option<Weapon> = "weapon",
    }
}

/// A playable side: its headquarters and worker (the start), and its Build list (basic and advanced pages).
pub struct Faction {
    pub key: &'static str,
    pub name: &'static str,
    pub hq: BldgKind,
    pub worker: UnitKind,
    pub build_basic: &'static [BldgKind],
    pub build_advanced: &'static [BldgKind],
    /// Its supply building (the Cottage, the Substation), and its income building if it has one (the Kingdom's Market,
    /// the Expedition's Wind turbine): the roles its messages and its AI name.
    pub supply: BldgKind,
    pub market: Option<BldgKind>,
    /// What it spends, in its player's words: the Kingdom's gold, the Expedition's energy (the same number in the sim's
    /// one cost slot; refusals say "Not enough gold" or "Not enough energy", `Faction::not_enough`).
    pub money: &'static str,
    /// What its workers dig from the mines, in its player's words: the Kingdom's gold, the Expedition's thorium (the
    /// same mines and loads; the Kingdom only ever sees the gold).
    pub ore: &'static str,
    /// The sound of its shots, by projectile: [bolt, shell, missile, melee] (recipe names in src/client/audio.js).
    pub sounds: [&'static str; 4],
    /// Its workers repair damaged buildings.
    pub repairs: bool,
    /// Its places are a grid (the Expedition: no population; energy for gold in its words), up to `GRID_MAX` where
    /// the Kingdom's population is up to `POP_MAX` (`World::sup_max`).
    pub grid: bool,
    /// The workers it starts with, on the mine nearest its headquarters, the nearest of its four tiles first (four for
    /// both peoples; Stelian, Nov 13: four Villagers, two Bots, half a mine each, set with the balancing phase).
    pub start_workers: usize,
    /// How the scripted opponent plays this side.
    pub ai: AiScript,
}

/// The scripted opponent's recipe for a side: which building fills each role in its build order (besides the
/// faction's supply and refinery), and which units fill each role in its army.
pub struct AiScript {
    pub rax: BldgKind,
    pub tech: BldgKind,
    /// A second tech building after `tech`, if the side has one (the Expedition's Portal): raised when a mixed-in unit
    /// it trains or unlocks is due (on a level that fields it) or one of its techs would serve (`World::tech2_due`).
    pub tech2: Option<BldgKind>,
    /// Its defensive tower (the Kingdom's Watchtower, the Expedition's Sentry mast).
    pub tower: BldgKind,
    /// The building that carries its range forward, if it has one (the Expedition's Uplink: a wave with machines
    /// gathers at its forward-most one and raises another past the edge of its range on the march; ai/army.rs).
    pub relay: Option<BldgKind>,
    pub air: BldgKind,
    /// Its vehicle bay, if it has one: it trains only its answer to flyers (`heavy_anti_air`) and the mixed-in units
    /// it can make, by the mix's ratios (beside the main factory, which then keeps to its own).
    pub heavy: Option<BldgKind>,
    /// The cheap line unit the main factory trains by default.
    pub basic: UnitKind,
    /// The answer to enemy flyers (two per flyer seen).
    pub anti_air: UnitKind,
    /// The vehicle bay's answer to enemy flyers, if any (the Ballista), worth two of `anti_air`: once it can train
    /// one, the bay fills the answer and the main factory brings only half of it (cheap early anti-air, then the
    /// tougher mid-game answer in place of some of it).
    pub heavy_anti_air: Option<UnitKind>,
    /// Mixed in: one of `.0` per `.1` basic units, in order (each only once its requirement stands, and not before
    /// `.2` seconds of game time: a late specialist).
    pub mix: &'static [(UnitKind, usize, f64)],
    /// Its answer to entrenched siege (Stelian, Nov 13: the other side's tech, never more basics): a unit that dives
    /// inside a siege gun's ring, which a level that adapts (`Diff::answers`) trains more of, and saves for, while it
    /// sees the enemy's siege (`World::dive_hold`): the Kingdom's Knight, the Expedition's Drone.
    pub dive: Option<UnitKind>,
    /// The fast raider (raids workers; at most six), trained at the `air` factory (the Rider at the Stables, the Buggy
    /// at the Expedition's Factory).
    pub raider: UnitKind,
    /// Its scout, if it has one (the Kingdom's Balloon): one is trained, kept out of the waves, and goes to look at the
    /// foe's army before a wave (`Diff::look_for`).
    pub scout: Option<UnitKind>,
    /// Wave sizes scale by this (fewer, stronger units: 0.6).
    pub wave_scale: f64,
    /// Seconds before it starts its techs (sooner only on a level that researches sooner; none does today). A
    /// knob per side: the Kingdom at 3:30 (its Forge brings the Workshop's Cannons and the Knights), the Expedition at
    /// 5:00.
    pub tech_from: f64,
    /// Seconds sooner than its level's `air_at` that it raises its air factory (0: on the level's time).
    pub air_lead: f64,
    /// More towers than its level's (`Diff::towers`), from these times (s), on levels that build towers: the
    /// Expedition's early game is mercenaries and masts while it goes for its machines (the arc).
    pub towers_more: &'static [f64],
}

impl AiScript {
    /// What an answer to enemy flyers is worth, in `anti_air` units: two for the heavier one, one for the cheap one.
    pub fn answer_weight(&self, k: UnitKind) -> usize {
        if Some(k) == self.heavy_anti_air {
            2
        } else if k == self.anti_air {
            1
        } else {
            0
        }
    }
}

impl Faction {
    /// Whether this side can build `kind` (everything on its Build list, the headquarters included).
    pub fn builds(&self, kind: BldgKind) -> bool {
        self.build_basic.contains(&kind) || self.build_advanced.contains(&kind)
    }
    /// What a refusal for want of its money says (the client's announcer keys on "Not enough").
    pub fn not_enough(&self) -> String {
        format!("Not enough {}", self.money)
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
    mv: Move::Walk,
    bio: false,
    heal: 0.0,
    mend: false,
    req: None,
    worker: false,
    mine_cap: 0,
    mine_load: 0,
    mine_time: 0.0,
    shields: 0.0,
    weapon: None,
    light: None,
    abilities: &[],
    capital: false,
};
/// Units a building's production queue holds (the one in training first).
pub const QUEUE_MAX: usize = 5;
/// A gold mine (one per field, map.rs `lay_mines`): its footprint in tiles (the art's, 2x2), the workers inside it at
/// once and the gold each comes out with are its kind's (`UnitDef::mine_cap`, `mine_load`: eight Villagers with 7, six
/// Bots with 9), and the seconds a worker spends inside (`MINE_TIME`, the Bot's own `mine_time` a little less). Calm
/// trips (Stelian, Nov 12): a long stay inside and a big load. A saturated mine pays the Kingdom about 450 a minute and
/// the Expedition as much (Nov 14: `a_mine_fits_eight_villagers_or_six_bots_and_a_bot_mine_pays_as_much`; the
/// Expedition's "thorium"), a Villager bringing in about 38 a minute, a Bot about 50. More income comes from more mines, the Kingdom's Market and Trade, and
/// the Expedition's Wind turbines. Gold is scarce for a person too (the PM, Nov 13; the lab's "A human's
/// opening"): from 2:00 to 6:00 one production building kept busy or a second one built, not both. Before Nov 13 the
/// loads were 10 and 13 (a human's bank piled up from 2:00, two Barracks busy and more) and five Bots fitted a mine (at
/// 80% of a Villager mine, with the cut the Expedition fell behind); before the economy's rounds 7 inside for 4 s with
/// 8, about 10 workers to saturate a mine at about 830 a minute.
pub const MINE_SIZE: i32 = 2;
pub const MINE_TIME: f64 = 7.5;
/// The most workers inside a mine at once, of any kind (the largest `UnitDef::mine_cap`), and the largest load.
pub const MINE_CAP_MOST: i32 = 8;
pub const MINE_LOAD_MOST: i32 = 11; // (a Bot's 9 with two levels of Better drills, no longer offered: its mechanism kept)
/// The gold in one crystal of a field as the map is laid (a field's mine holds its crystals' gold, `map.rs`
/// `lay_mines`: seven by a main, 14,000 gold): a main mine lasts a normal game, over 20 minutes at its full rate, so
/// scarcity comes from the rate (the load, the mine's cap, the worker's price) and expanding is a choice for more of it,
/// not forced by a dry mine. 1500 before the economy pass, 1000 in it (the first mines dry by about 9:00).
pub const CRYSTAL_GOLD: i32 = 2000;
/// Gold a second a finished Market pays its owner, with no workers (PRD: the conversion, rule 1): it pays back its 75 in
/// about five minutes. 0.35 before Nov 13, cut in step with the mines' income (the loads 30% down); 0.5 before the
/// economy pass halved what a worker brings in.
pub const PUMP_RATE: f64 = 0.24;
/// Energy a second a finished Wind turbine pays its owner (PRD: the Expedition runs on energy, Nov 14: several weak
/// turbines, the Expedition's Market): five a Data center (`BldgDef::per_hq`) pay what one Market does at full Trade
/// (`PUMP_RATE` x 1.5, 0.36 a second), each paying back its price in about four minutes. No research raises it: the
/// Expedition grows by building more.
pub const TURBINE_RATE: f64 = 0.072;
/// How far (tiles) from a busy field a harvester looks for a quieter one.
pub const SPREAD_RANGE: f64 = 7.0;
/// The leash (tiles): how far a unit follows a fight it picked up itself (idle, holding a rally point, on an
/// attack-move, answering fire), counted from the spot it stood on or from its attack-move's line (where the order
/// was given to its goal), its own reach on top. A target that gets farther is let go and the unit goes back (to its
/// spot, or on along its attack-move). An attack order on a target has no leash.
pub const CHASE_LEASH: f64 = 10.0;
/// Shields regenerate after this long without being hit (s), at these rates per second (units, buildings).
pub const SHIELD_DELAY: f64 = 6.0;
pub const SHIELD_REGEN_UNIT: f64 = 3.0;
pub const SHIELD_REGEN_BLDG: f64 = 2.0;

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
    uses: 0,
    single: false,
    build: 20.0,
    sight: 5.0,
    trains: &[],
    dropoff: false,
    pays: 0.0,
    per_hq: 0,
    req: None,
    trains_with: None,
    hq: false,
    researches: &[],
    shields: 0.0,
    weapon: None,
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
