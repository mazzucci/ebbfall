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
/// The most supply (population) a seat can have, by the map's width in tiles: 100 on 64x64, 120 on 96x96, 140 on
/// 128x128 (60, 70 and 80 until the economy's second round: the cap is rarely reached, so the limit on an army is the
/// rate of gold and when attacks can come, not the cap). Bigger maps run longer, hold more fields, and room for an AI's
/// home reserve beside its wave.
pub fn supply_limit(map_w: i32) -> i32 {
    if map_w <= 64 {
        100
    } else if map_w <= 96 {
        120
    } else {
        140
    }
}

/// The Expedition's most Power, by the map's width: 200 on 64x64, 240 on 96x96, 280 on 128x128, twice the Kingdom's
/// population (Stelian, Nov 12: the Expedition is limited by Power, the Kingdom by gold; a machine takes about twice
/// the places a Kingdom unit of its tier does, a Wind turbine gives 20 and the Data center 40, so about eight turbines
/// fill it). 45, 52 and 60 in the balance pass.
pub fn power_limit(map_w: i32) -> i32 {
    if map_w <= 64 {
        200
    } else if map_w <= 96 {
        240
    } else {
        280
    }
}
/// A machine takes about this many Power places for a Kingdom unit's one of its tier (the AI's margins in Power scale
/// by it: `World::places`).
pub const POWER_PER_PLACE: i32 = 2;
/// The Expedition's most hired places, by the map's width, a maximum of its own (gold only: the early mercenary game):
/// 25, 30, 35 (15, 18 and 20 in the balance pass, the map's limit less
/// its Power).
pub fn hired_limit(map_w: i32) -> i32 {
    if map_w <= 64 {
        25
    } else if map_w <= 96 {
        30
    } else {
        35
    }
}

/// The pools a unit's places come from (`UnitDef::pool`) and a building adds to (`BldgDef::pool`), each a `[used, cap]`
/// per seat (`World::pools`): the Kingdom's population and the Expedition's Power (`Supply`, the same pool under two
/// names: every Kingdom unit, and the Expedition's machines, its Androids too) and the Expedition's hired places
/// (`Hired`: its Sellswords, Bruisers and Medics, from its Recruiting posts). Each pool is capped by its own buildings
/// and by its own maximum (`World::pool_max`: the Kingdom's population the map's `supply_limit`; the Expedition's
/// Power `power_limit` and its hired places `hired_limit`).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Pool {
    Supply,
    Hired,
}
/// How many pools there are (`Pool`'s index into `World::pools`).
pub const POOLS: usize = 2;
/// Every pool, in index order.
pub const ALL_POOLS: [Pool; POOLS] = [Pool::Supply, Pool::Hired];
impl Pool {
    pub fn index(self) -> usize {
        self as usize
    }
    pub fn key(self) -> &'static str {
        match self {
            Pool::Supply => "supply",
            Pool::Hired => "hired",
        }
    }
    pub fn parse(s: &str) -> Option<Pool> {
        ALL_POOLS.into_iter().find(|p| p.key() == s)
    }
}

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
        /// Shield points over the hull (the Vael): they take damage first and regenerate out of combat.
        shields: f64 = "shields",
        cost: [i32; 2] = "cost",
        /// The places it takes in its `pool` (population or Power, or hired places).
        supply: i32 = "supply",
        pool: Pool = "pool",
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
        /// The places it adds to its `pool` once finished (population or Power, or hired places).
        supply: i32 = "supply",
        pool: Pool = "pool",
        /// The Power (`Pool::Supply`) it uses while it stands, from the moment it is placed until it is destroyed or
        /// cancelled (the Portal).
        uses: i32 = "uses",
        /// At most one a seat, standing or going up (the Portal: `World::single_room`).
        single: bool = "single",
        build: f64 = "build",
        sight: f64 = "sight",
        trains: &'static [UnitKind] = "trains",
        dropoff: bool = "dropoff",
        /// Pays its owner gold by itself, with no workers (`PUMP_RATE` a second): the Kingdom's Market.
        pays: bool = "pays",
        /// At most one a finished headquarters of its side (the Market: a new Castle at an expansion allows another).
        per_hq: bool = "perHq",
        req: Option<BldgKind> = "req",
        /// A research its side must have done to build it (the Uplink: the satellite).
        req_up: Option<Upgrade> = "reqUp",
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
    /// Its supply building, and its income building if it has one (the Kingdom's Market; the Expedition has none): the
    /// roles its messages and its AI name.
    pub supply: BldgKind,
    pub market: Option<BldgKind>,
    /// The sound of its shots, by projectile: [bolt, shell, missile, melee] (recipe names in src/client/audio.js).
    pub sounds: [&'static str; 4],
    /// Its workers repair damaged buildings.
    pub repairs: bool,
    /// Its `Pool::Supply` is Power, its machines' alone (the Expedition: no population; its people take hired places),
    /// and it has a maximum of each (`World::pool_max`) where the Kingdom has one population limit.
    pub power: bool,
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
    pool: Pool::Supply,
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
    shields: 0.0,
    weapon: None,
    light: None,
    abilities: &[],
    capital: false,
};
/// Units a building's production queue holds (the one in training first).
pub const QUEUE_MAX: usize = 5;
/// A gold mine (one per field, map.rs `lay_mines`): its footprint in tiles (the art's, 2x2), the workers inside it at
/// once and the gold each comes out with are its kind's (`UnitDef::mine_cap`, `mine_load`: eight Villagers with 9, five
/// Bots with 12), and the seconds a worker spends inside. Calm trips (Stelian, Nov 12): a long stay inside and a big
/// load. A saturated mine pays the Kingdom about 575 a minute and the Expedition about 83% of it at first
/// (`a_mine_fits_eight_villagers_or_five_bots_and_a_bot_mine_pays_a_little_less`), a Villager bringing in about 55 a
/// minute, a Bot about 75: the Expedition starts behind and out-earns the Kingdom later, with its research. More income
/// comes from more mines, the Expedition's research and the Kingdom's Market. Before: 7 inside for 4 s with 8 (the
/// economy pass; 16 before it), about 10 workers to saturate a mine at about 830 a minute.
pub const MINE_SIZE: i32 = 2;
pub const MINE_TIME: f64 = 7.5;
/// The most workers inside a mine at once, of any kind (the largest `UnitDef::mine_cap`), and the largest load.
pub const MINE_CAP_MOST: i32 = 8;
pub const MINE_LOAD_MOST: i32 = 17; // (a Bot's 12 with two levels of Better drills)
/// The gold in one crystal of a field as the map is laid (a field's mine holds its crystals' gold, `map.rs`
/// `lay_mines`: seven by a main, 14,000 gold): a main mine lasts a normal game, over 20 minutes at its full rate, so
/// scarcity comes from the rate (the load, the mine's cap, the worker's price) and expanding is a choice for more of it,
/// not forced by a dry mine. 1500 before the economy pass, 1000 in it (the first mines dry by about 9:00).
pub const CRYSTAL_GOLD: i32 = 2000;
/// Gold a second a finished Market pays its owner, with no workers (PRD: the conversion, rule 1): it pays back its 75 in
/// about three and a half minutes. 0.5 before the economy pass halved what a worker brings in, which doubled the
/// Market's worth beside it; a partial cut (the full one, 0.25, swung Hard's 64x64 games the other way in the lab).
pub const PUMP_RATE: f64 = 0.35;
/// What a refusal for want of gold says (the client's announcer keys on it).
pub const NOT_ENOUGH: &str = "Not enough gold";
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
    pool: Pool::Supply,
    uses: 0,
    single: false,
    build: 20.0,
    sight: 5.0,
    trains: &[],
    dropoff: false,
    pays: false,
    per_hq: false,
    req: None,
    req_up: None,
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
