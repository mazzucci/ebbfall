//! The world and the rules that change it: entities, placement, economy, supply, production, fog of war,
//! combat, orders and the per-tick update. A port of src/sim/{state,commands,update}.js that keeps the JS
//! evaluation order (including the order of RNG draws and stable sorts) so per-tick state hashes match.
//!
//! Entities refer to each other by id. Units, buildings and nodes are each kept sorted by id (ids only grow
//! and removal preserves order), so lookups are binary searches and "not found" means "dead".

mod abilities;
mod combat;
mod command;
mod construction;
mod economy;
mod fog;
mod movement;
mod orders;
mod spawn;

use crate::ai::Ai;
use crate::data::*;
use crate::jsmath::{self, PI, clamp, dist};
use crate::map::{Id, Map, MapKind, Node, idx, in_map};
use crate::path::{PathScratch, Pt, astar};
use crate::rng::Mulberry32;
pub use command::{Command, Logged};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Phase {
    Go,
    Wait,
    Mine,
    Return,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Back {
    pub x: f64,
    pub y: f64,
    pub amove: bool,
}

/// A unit's effective stats for this tick, read once at its start (`World::live`): its kind's numbers, which abilities
/// and modes will change there and only there.
#[derive(Clone, Copy)]
pub(crate) struct Live {
    pub range: f64,
    pub combat: bool,
    pub team: u8,
    pub r: f64,
    pub sight: f64,
    pub kind: UnitKind,
    pub hits: (bool, bool),
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Task {
    Idle,
    Hold,
    Move {
        x: f64,
        y: f64,
    },
    AMove {
        x: f64,
        y: f64,
    },
    Attack {
        target: Id,
        back: Option<Back>,
    },
    Gather {
        node: Id,
        phase: Phase,
        timer: f64,
    },
    Build {
        b: Id,
    },
    /// Restore a damaged, finished building of our team (harvesters).
    Repair {
        b: Id,
    },
}

impl Task {
    /// A small number per kind of task (for the state hash; the snapshot uses the same order).
    pub fn code(&self) -> i32 {
        match self {
            Task::Idle => 0,
            Task::Hold => 1,
            Task::Move { .. } => 2,
            Task::AMove { .. } => 3,
            Task::Attack { .. } => 4,
            Task::Gather { .. } => 5,
            Task::Build { .. } => 6,
            Task::Repair { .. } => 7,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Unit {
    pub id: Id,
    pub kind: UnitKind,
    pub team: u8,
    pub x: f64,
    pub y: f64,
    pub hp: f64,
    pub maxhp: f64,
    /// Shields over the hull (0 for a race without them), and when it was last hit (s; shields wait to regenerate).
    pub sh: f64,
    pub maxsh: f64,
    pub hit_at: f64,
    pub r: f64,
    pub task: Task,
    pub path: Option<Vec<Pt>>,
    pub cd: f64,
    pub face: f64,
    pub carry: i32,
    /// Some(true) = ether, Some(false) = shards, None = never carried anything.
    pub carry_ether: Option<bool>,
    pub last_node: Option<Id>,
    pub repath: f64,
    pub flash: f64,
    pub aggro_cd: f64,
    /// Seconds a builder has stayed within STUCK_RADIUS of `anchor` without reaching its site.
    pub stuck: f64,
    pub anchor: (f64, f64),
    /// Game time before which this harvester is not picked as a builder again (it just failed to reach a site).
    pub no_build_until: f64,
    /// Medic: seconds until the next heal effect event.
    pub heal_fx: f64,
    /// The tick a Medic last healed this unit: one Medic per patient per tick (heals do not stack).
    pub healed_at: u32,
    /// Ability cooldowns left (s), by slot in the kind's `abilities` order.
    pub ab_cd: [f64; ABILITY_SLOTS],
    /// A timed boost (Stim, Overcharge) and the game time it ends.
    pub boost: Option<(AbilityKind, f64)>,
    /// The toggle that is on (Entrench), and the seconds left settling in or packing up (no moving or firing then).
    pub mode: Option<AbilityKind>,
    pub swap: f64,
    /// Seconds left warping in (a Vael unit sent to a power field): it cannot move, fire or heal, but can be hit.
    pub warp: f64,
    /// A group's marching pace (px/s): set by a group order to its slowest member's speed, so the group arrives
    /// together; it only caps a unit on the move (not in a fight), and any new order clears it.
    pub pace: Option<f64>,
}

/// A builder that stays within STUCK_RADIUS px of one spot for BUILDER_PATIENCE seconds without reaching its
/// site gives up. Walking (even away from the site, around an obstacle) leaves the radius within a fraction of a
/// second; jittering against a corner or being walled in does not.
pub const BUILDER_PATIENCE: f64 = 6.0;
pub const STUCK_RADIUS: f64 = 12.0;
/// Repairing a building from nothing to full costs this share of its price, paid as the hp come back. A harvester
/// repairs at construction speed (the building's build time for its whole hp).
pub const REPAIR_COST: f64 = 0.25;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rally {
    pub x: f64,
    pub y: f64,
    pub node: Option<Id>,
}

#[derive(Clone, Debug)]
pub struct Bldg {
    pub id: Id,
    pub kind: BldgKind,
    pub team: u8,
    pub tx: i32,
    pub ty: i32,
    pub w: i32,
    pub h: i32,
    pub x: f64,
    pub y: f64,
    pub hp: f64,
    pub maxhp: f64,
    pub sh: f64,
    pub maxsh: f64,
    pub hit_at: f64,
    /// Warp-in: the site has been planted and grows by itself.
    pub planted: bool,
    /// Inside a power field (always true for a building that needs none).
    pub powered: bool,
    pub progress: f64,
    pub done: bool,
    pub queue: Vec<UnitKind>,
    pub prog: f64,
    pub rally: Option<Rally>,
    pub cd: f64,
    pub flash: f64,
    pub r: f64,
    pub vent: Option<Id>,
    pub aim: f64,
    /// Upgrade being researched here and its progress (0..1).
    pub research: Option<(Upgrade, f64)>,
    /// Fractions of shards and ether owed for repairs, charged a whole unit at a time.
    pub repair_debt: [f64; 2],
}

impl Bldg {
    /// Its footprint, for approach and edge distances.
    pub fn geo(&self) -> Geo {
        Geo::Rect {
            tx: self.tx,
            ty: self.ty,
            w: self.w,
            h: self.h,
            x: self.x,
            y: self.y,
            r: self.r,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Proj {
    pub x: f64,
    pub y: f64,
    pub target: Id,
    pub speed: f64,
    pub dmg: f64,
    pub kind: ProjKind,
    pub by: Id,
    pub team: u8,
    /// The shooter's splash (share of the damage, radius in px), fixed when it was fired.
    pub splash: f64,
    pub splash_r: f64,
}

#[derive(Clone, Debug, PartialEq)]
/// Events are for one seat (`team`: whose player sees or hears it) or, with no team, for whoever can see the spot;
/// `Game::drain_events` passes on those of its own seat.
pub enum Event {
    /// Something of `team`'s was hit by the other side (throttled: one per fight, see ALERT_*).
    Attacked {
        team: u8,
        x: f64,
        y: f64,
        building: bool,
    },
    /// A Medic healing: from (x, y) to the patient at (tx, ty).
    Heal {
        x: f64,
        y: f64,
        tx: f64,
        ty: f64,
        /// A Halo mending shields (a Medic healing otherwise).
        mend: bool,
    },
    Sfx {
        team: u8,
        name: &'static str,
    },
    Toast {
        team: u8,
        msg: String,
        bad: bool,
    },
    Burst {
        x: f64,
        y: f64,
        r: f64,
        team: u8,
        n: u32,
    },
    Hit {
        x: f64,
        y: f64,
        big: bool,
    },
    /// A shot: where, the weapon ("bolt", "shell", "missile", "melee") and which seats see it (their own shots,
    /// or the shooter in their sight).
    Fire {
        x: f64,
        y: f64,
        weapon: &'static str,
        seen: [bool; 2],
    },
    /// An ability used where the caster stands (after a Blink: where it landed), for the seats that see it.
    Cast {
        x: f64,
        y: f64,
        ability: &'static str,
        seen: [bool; 2],
    },
}

/// Ticks between samples of `World::army_log` (10 s).
pub const ARMY_LOG_EVERY: u32 = 300;

#[derive(Clone, Copy, Debug, Default)]
pub struct Stats {
    pub built: u32,
    pub lost: u32,
    pub killed: u32,
    pub razed: u32,
}

/// Shape of an entity at the moment it is looked up: what approach/edge-distance/closest-point need.
#[derive(Clone, Copy, Debug)]
pub enum Geo {
    Round {
        x: f64,
        y: f64,
        r: f64,
    },
    Rect {
        tx: i32,
        ty: i32,
        w: i32,
        h: i32,
        x: f64,
        y: f64,
        r: f64,
    },
}

impl Geo {
    pub fn center(&self) -> (f64, f64) {
        match *self {
            Geo::Round { x, y, .. } | Geo::Rect { x, y, .. } => (x, y),
        }
    }
    pub fn r(&self) -> f64 {
        match *self {
            Geo::Round { r, .. } | Geo::Rect { r, .. } => r,
        }
    }
    /// Closest point to p (the center for round things), as JS closestPt/target selection does.
    pub fn aim_point(&self, px: f64, py: f64) -> (f64, f64) {
        match *self {
            Geo::Round { x, y, .. } => (x, y),
            Geo::Rect { tx, ty, w, h, .. } => (
                clamp(px, tx as f64 * TILE, (tx + w) as f64 * TILE),
                clamp(py, ty as f64 * TILE, (ty + h) as f64 * TILE),
            ),
        }
    }
    pub fn edge_dist(&self, px: f64, py: f64) -> f64 {
        match *self {
            Geo::Round { x, y, r } => dist(x, y, px, py) - r,
            Geo::Rect { .. } => {
                let (cx, cy) = self.aim_point(px, py);
                dist(cx, cy, px, py)
            }
        }
    }
    pub fn is_rect(&self) -> bool {
        matches!(self, Geo::Rect { .. })
    }
}

const GRID: i32 = 32; // spatial hash cells of 64 px over a 2048 px world

pub struct World {
    pub seed: u32,
    /// The map's character (kept for resets).
    pub map_kind: MapKind,
    /// The players trade starting places (drawn by the client for each game; the map is point-symmetric, so fair).
    pub sides_swapped: bool,
    /// Each team's side (headquarters, worker, Build list).
    pub factions: [&'static Faction; 2],
    /// Applied commands with their tick and seat, while recording (see `record`).
    pub log: Option<Vec<Logged>>,
    pub diff: usize,
    pub time: f64,
    pub tick: u32,
    pub units: Vec<Unit>,
    pub bldgs: Vec<Bldg>,
    pub projs: Vec<Proj>,
    pub res: [[i32; 2]; 2],
    pub sup: [[i32; 2]; 2],
    pub explored: [Vec<u8>; 2],
    pub vis: [Vec<u8>; 2],
    pub over: bool,
    pub winner: i32,
    /// Each seat's game summary (units trained and lost, enemy units killed and buildings razed).
    pub stats: [Stats; 2],
    /// Each seat's army value (shards + ether of its fighting units), sampled every `ARMY_LOG_EVERY` ticks: the end
    /// screen's chart. Not world state (derived, not hashed).
    pub army_log: [Vec<u32>; 2],
    /// Upgrade levels per team, in `UPGRADES` order.
    pub upgrades: [[u8; UPGRADES.len()]; 2],
    /// Recent "under attack" alerts (team, time, x, y, was a building), for throttling.
    alerts: Vec<(u8, f64, f64, f64, bool)>,
    pub events: Vec<Event>,
    pub map: Map,
    /// Each seat's scripted opponent, if it has one (indexed by team).
    pub(crate) ai: [Option<Ai>; 2],
    /// The seat whose AI is taking its turn (see `World::seat`).
    pub(crate) ai_turn: u8,
    /// Which seats the scripted opponent plays (they get the difficulty's income and may build in unexplored
    /// ground; the others are people). Fixed for the game, even when the AI is switched off.
    pub ai_seats: [bool; 2],
    pub(crate) rng: Mulberry32,
    next_id: Id,
    scratch: PathScratch,
    hash: Vec<Vec<Id>>,
    /// Units killed since the spatial hash was built. The JS hash keeps references to them, and separation
    /// still pushes against their last position, so the port keeps them around until the next rebuild.
    graveyard: Vec<Unit>,
}

/// How urgent a unit is as a target: 0 a fighting unit that can hit the shooter's layer (Harvesters only scratch),
/// 1 any other unit.
fn unit_tier(kind: UnitKind, flier: bool) -> u8 {
    if !kind.def().worker && kind.def().damage_vs(flier) > 0.0 {
        0
    } else {
        1
    }
}

impl World {
    pub fn new(seed: u32, diff: usize) -> World {
        World::with_map(seed, diff, MapKind::Standard)
    }

    /// A new game on a map of the given character (World::new is the standard map).
    pub fn with_map(seed: u32, diff: usize, map_kind: MapKind) -> World {
        World::with_map_side(seed, diff, map_kind, false)
    }

    /// A new game where the two sides may trade starting places (`swap`): same map, the other corner.
    pub fn with_map_side(seed: u32, diff: usize, map_kind: MapKind, swap: bool) -> World {
        World::with_setup(seed, diff, map_kind, swap, [&HUMANS, &HUMANS])
    }

    /// A new game with each team's side (faction) chosen: index = team.
    pub fn with_setup(
        seed: u32,
        diff: usize,
        map_kind: MapKind,
        swap: bool,
        factions: [&'static Faction; 2],
    ) -> World {
        let n = (MW * MH) as usize;
        let mut w = World {
            seed,
            diff,
            map_kind,
            sides_swapped: swap,
            factions,
            log: None,
            time: 0.0,
            tick: 0,
            units: Vec::new(),
            bldgs: Vec::new(),
            projs: Vec::new(),
            res: [[50, 0], [50, 0]],
            sup: [[0, 0], [0, 0]],
            explored: [vec![0; n], vec![0; n]],
            vis: [vec![0; n], vec![0; n]],
            over: false,
            winner: -1,
            stats: [Stats::default(); 2],
            army_log: [Vec::new(), Vec::new()],
            upgrades: [[0; UPGRADES.len()]; 2],
            alerts: Vec::new(),
            events: Vec::new(),
            map: Map::empty(),
            ai: [None, None],
            ai_turn: ENEMY,
            ai_seats: [false, true],
            rng: Mulberry32::new(1),
            next_id: 1,
            scratch: PathScratch::new(),
            hash: vec![Vec::new(); (GRID * GRID) as usize],
            graveyard: Vec::new(),
        };
        w.reset(seed, diff);
        w
    }

    /// Reset the world for a new game (resetGame).
    pub fn reset(&mut self, seed: u32, diff: usize) {
        self.seed = seed;
        self.diff = diff.min(DIFF.len() - 1);
        if self.log.is_some() {
            self.log = Some(Vec::new()); // a new game, a new log
        }
        self.rng = Mulberry32::new(seed ^ 0x9e37_79b9);
        self.next_id = 1;
        self.time = 0.0;
        self.tick = 0;
        self.units.clear();
        self.bldgs.clear();
        self.projs.clear();
        self.graveyard.clear();
        self.res = [[50, 0], [50, 0]];
        self.sup = [[0, 0], [0, 0]];
        for t in 0..2 {
            self.explored[t].fill(0);
            self.vis[t].fill(0);
        }
        self.over = false;
        self.winner = -1;
        self.stats = [Stats::default(); 2];
        self.army_log = [Vec::new(), Vec::new()];
        self.upgrades = [[0; UPGRADES.len()]; 2];
        self.alerts.clear();
        self.events.clear();
        self.map = Map::generate(seed, self.map_kind, &mut self.next_id);
        if self.sides_swapped {
            self.map.bases.swap(0, 1);
        }
        for team in [PLAYER, ENEMY] {
            let (bx, by) = self.map.bases[team as usize];
            let faction = self.factions[team as usize];
            self.make_building(faction.hq, team, bx, by, true);
            // Four harvesters, each between the Core and one of the four crystals nearest it, mining that crystal:
            // the same start for both sides (the map is mirrored), whichever way the base faces.
            let (cx, cy) = (bx as f64 + 2.0, by as f64 + 2.0);
            let mut near: Vec<(f64, Id, i32, i32)> = self
                .map
                .nodes
                .iter()
                .filter(|n| !n.ether)
                .map(|n| {
                    (
                        jsmath::hypot(n.tx as f64 + 0.5 - cx, n.ty as f64 + 0.5 - cy),
                        n.id,
                        n.tx,
                        n.ty,
                    )
                })
                .collect();
            near.sort_by(|p, q| p.0.partial_cmp(&q.0).unwrap().then(p.1.cmp(&q.1)));
            for &(d, node, nx, ny) in near.iter().take(4) {
                let k = 3.0 / d.max(3.0); // three tiles out from the Core's centre, towards the crystal
                let at = (
                    jsmath::to_i32(cx + (nx as f64 + 0.5 - cx) * k),
                    jsmath::to_i32(cy + (ny as f64 + 0.5 - cy) * k),
                );
                let f = self.map.nearest_free(at.0, at.1, 4).unwrap_or((bx, by + 5));
                let u = self.make_unit(
                    faction.worker,
                    team,
                    f.0 as f64 * TILE + 16.0,
                    f.1 as f64 * TILE + 16.0,
                );
                self.start_gather(u, node);
            }
            self.recalc_supply(team);
        }
        self.init_ai();
        self.update_fog();
    }

    pub(crate) fn emit(&mut self, e: Event) {
        self.events.push(e);
    }
    /// A message for one seat's player.
    pub(crate) fn toast(&mut self, team: u8, msg: impl Into<String>, bad: bool) {
        self.emit(Event::Toast {
            team,
            msg: msg.into(),
            bad,
        });
    }
    /// A sound for one seat's player.
    pub(crate) fn sfx(&mut self, team: u8, name: &'static str) {
        self.emit(Event::Sfx { team, name });
    }
    /// What casts a seat's power fields, by name ("power" for a race without them).
    pub(crate) fn power_name(&self, team: u8) -> &'static str {
        self.factions[team as usize]
            .power
            .map_or("power", |k| k.def().name)
    }
    /// Whether the scripted opponent plays this seat.
    pub fn is_ai(&self, team: u8) -> bool {
        self.ai_seats[team as usize]
    }
    /// G.rng(): a float in [0, 1).
    pub(crate) fn rnd(&mut self) -> f64 {
        self.rng.next_u32() as f64 / 4_294_967_296.0
    }

    // ---- lookups ----
    pub fn ui(&self, id: Id) -> Option<usize> {
        self.units.binary_search_by_key(&id, |u| u.id).ok()
    }
    pub fn bi(&self, id: Id) -> Option<usize> {
        self.bldgs.binary_search_by_key(&id, |b| b.id).ok()
    }
    pub fn unit(&self, id: Id) -> Option<&Unit> {
        self.ui(id).map(|i| &self.units[i])
    }
    pub(crate) fn u(&self, id: Id) -> &Unit {
        &self.units[self.ui(id).expect("live unit")]
    }
    pub(crate) fn um(&mut self, id: Id) -> &mut Unit {
        let i = self.ui(id).expect("live unit");
        &mut self.units[i]
    }
    pub fn bldg(&self, id: Id) -> Option<&Bldg> {
        self.bi(id).map(|i| &self.bldgs[i])
    }
    pub(crate) fn bm(&mut self, id: Id) -> Option<&mut Bldg> {
        let i = self.bi(id)?;
        Some(&mut self.bldgs[i])
    }
    /// Team of a live unit or building.
    pub fn team_of(&self, id: Id) -> Option<u8> {
        self.unit(id)
            .map(|u| u.team)
            .or_else(|| self.bldg(id).map(|b| b.team))
    }
    /// Geometry of a live unit, building or node.
    pub fn geo(&self, id: Id) -> Option<Geo> {
        if let Some(u) = self.unit(id) {
            return Some(Geo::Round {
                x: u.x,
                y: u.y,
                r: u.r,
            });
        }
        if let Some(b) = self.bldg(id) {
            return Some(b.geo());
        }
        self.map.node(id).map(|n| Geo::Round {
            x: n.x,
            y: n.y,
            r: n.r,
        })
    }

    /// A unit's effective stats right now (the one place abilities and modes will change them).
    pub(crate) fn live(&self, uid: Id) -> Live {
        let u = self.u(uid);
        let d = u.kind.def();
        // Entrenched: farther; settling in or packing up: no reach at all (it cannot fire then).
        let range = match self.reach_add(uid) {
            Some(add) => d.weapon.map_or(0.0, |w| w.range + add) * TILE,
            None => 0.0,
        };
        Live {
            range,
            combat: d.threat(),
            team: u.team,
            r: u.r,
            sight: d.sight,
            kind: u.kind,
            hits: Self::hits_of(u.kind),
        }
    }
    /// A unit's walking speed right now (px/s).
    pub(crate) fn live_speed(&self, uid: Id) -> f64 {
        let u = self.u(uid);
        let own = u.kind.def().speed * self.speed_mul(uid);
        match (u.pace, u.task) {
            (Some(p), Task::Move { .. } | Task::AMove { .. }) => own.min(p),
            _ => own,
        }
    }
    /// The seconds between shots of `shooter`'s weapon (a unit or a building), whose base is `base`.
    pub(crate) fn live_cd(&self, shooter: Id, base: f64) -> f64 {
        if self.unit(shooter).is_some() {
            base / self.fire_mul(shooter)
        } else {
            base
        }
    }

    /// One unit's tick: its weapon and flash cool down, a healer heals, then its task runs.
    pub(crate) fn update_unit(&mut self, uid: Id, dt: f64) {
        let u = self.um(uid);
        u.cd -= dt;
        u.flash -= dt;
        if u.warp > 0.0 {
            u.warp = (u.warp - dt).max(0.0);
            return;
        }
        let c = self.live(uid);
        let task = self.u(uid).task;
        if c.kind.def().heal > 0.0 {
            self.medic(uid, dt);
        }
        match task {
            Task::Idle => self.update_idle(uid, false, c, dt),
            Task::Hold => self.update_idle(uid, true, c, dt),
            Task::Move { x, y } => self.update_move(uid, x, y, dt),
            Task::AMove { x, y } => self.update_amove(uid, x, y, c, dt),
            Task::Attack { target, back } => self.update_attack(uid, target, back, c, dt),
            Task::Gather { node, phase, timer } => self.update_gather(uid, node, phase, timer, dt),
            Task::Repair { b } => self.update_repair(uid, b, c.r, c.team, dt),
            Task::Build { b } => self.update_build(uid, b, c.r, c.team, dt),
        }
    }

    /// Advance the world by one fixed tick.
    pub fn step(&mut self) {
        let dt = DT;
        self.time += dt;
        self.tick += 1;
        self.rebuild_hash();
        let ids: Vec<Id> = self.units.iter().map(|u| u.id).collect();
        for id in ids {
            if self.ui(id).is_some() {
                self.update_unit(id, dt);
            }
        }
        self.separate();
        let bids: Vec<Id> = self.bldgs.iter().map(|b| b.id).collect();
        for id in bids {
            if self.bi(id).is_some() {
                self.update_building(id, dt);
            }
        }
        self.update_projs(dt);
        self.regen_shields(dt);
        self.tick_abilities(dt);
        self.update_fog();
        self.ai_tick(dt);
        if self.tick.is_multiple_of(ARMY_LOG_EVERY) {
            self.log_armies();
        }
    }

    /// One sample of each seat's army value for the end screen's chart.
    fn log_armies(&mut self) {
        for team in 0..2u8 {
            let v = self
                .units
                .iter()
                .filter(|u| u.team == team && !u.kind.def().worker)
                .map(|u| u.kind.def().cost[0] + u.kind.def().cost[1])
                .sum::<i32>();
            self.army_log[team as usize].push(v.max(0) as u32);
        }
    }

    /// Cheap state fingerprint for desync detection; the same scheme and inputs as stateHash() in update.js.
    pub fn state_hash(&self) -> u32 {
        let mut h: u32 = 2_166_136_261;
        let mut mix = |v: i32| h = (h ^ v as u32).wrapping_mul(16_777_619);
        mix(self.tick as i32);
        mix(self.res[0][0]);
        mix(self.res[0][1]);
        mix(self.res[1][0]);
        mix(self.res[1][1]);
        // Hidden state too, so a divergence shows on the tick it happens, not when a position drifts later.
        mix(self.rng.state() as i32);
        mix(self.next_id as i32);
        for t in 0..2 {
            mix(self.sup[t][0]);
            mix(self.sup[t][1]);
        }
        for n in &self.map.nodes {
            mix(n.id as i32);
            mix(n.amount);
            mix(n.miners);
        }
        for u in &self.units {
            mix(u.id as i32);
            mix(jsmath::to_i32(u.x * 16.0));
            mix(jsmath::to_i32(u.y * 16.0));
            mix(jsmath::to_i32(u.hp * 16.0));
            mix(u.task.code());
            if u.maxsh > 0.0 {
                mix(jsmath::to_i32(u.sh * 16.0));
            }
            // Ability state, once there is any (a unit that never cast hashes as before).
            if u.boost.is_some()
                || u.mode.is_some()
                || u.swap > 0.0
                || u.ab_cd.iter().any(|&c| c > 0.0)
            {
                for &c in &u.ab_cd {
                    mix(jsmath::to_i32(c * 16.0));
                }
                mix(u.boost.map_or(0, |(k, end)| {
                    k.index() as i32 + 1 + jsmath::to_i32(end * 16.0) * 8
                }));
                mix(u.mode.map_or(0, |k| k.index() as i32 + 1));
                mix(jsmath::to_i32(u.swap * 16.0));
            }
            if u.warp > 0.0 {
                mix(jsmath::to_i32(u.warp * 16.0));
            }
            if let Some(p) = u.pace {
                mix(jsmath::to_i32(p * 16.0));
            }
        }
        for b in &self.bldgs {
            mix(b.id as i32);
            mix(jsmath::to_i32(b.hp * 16.0));
            if b.maxsh > 0.0 {
                mix(jsmath::to_i32(b.sh * 16.0));
            }
            if b.planted && !b.done {
                mix(1); // a planted seed grows by itself next tick
            }
            mix(jsmath::to_i32(b.progress * 1024.0));
            mix(b.queue.len() as i32);
            if let Some((up, p)) = b.research {
                mix(up.index() as i32 + 1);
                mix(jsmath::to_i32(p * 1024.0));
            }
        }
        for t in 0..2 {
            for &level in &self.upgrades[t] {
                mix(level as i32);
            }
        }
        h
    }
}

/// "n" when a name takes "an" ("an Ether Rig"), else "" ("a Siphon").
pub(crate) fn an(name: &str) -> &'static str {
    if name.starts_with(['A', 'E', 'I', 'O', 'U']) {
        "n"
    } else {
        ""
    }
}
