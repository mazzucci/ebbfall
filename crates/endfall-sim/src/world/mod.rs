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
mod flee;
mod fog;
mod movement;
mod orders;
mod paths;
pub mod radio;
mod seats;
mod spawn;
mod tide;
mod types;
mod wire;

use crate::ai::Ai;
use crate::data::*;
use crate::jsmath::{self, PI, clamp, dist};
use crate::map::{Foot, Ground, Id, Map, MapKind, MapSize, Node, ShoreField};
use crate::path::{PathScratch, Pt, astar};
use crate::rng::Mulberry32;
pub use combat::{absorb, hull_loss};
pub use command::{Command, Logged};
pub use economy::FIELD_LOW;
pub use paths::{LONG_SEARCH, LONG_SEARCHES, PathWork};
pub use radio::RadioSrc;
pub use types::*;

/// The spatial hash's cells, in world pixels (two tiles).
const CELL: f64 = 64.0;

pub struct World {
    pub seed: u32,
    /// The map's character (kept for resets).
    pub map_kind: MapKind,
    /// The map's size in tiles (kept for resets).
    pub map_size: MapSize,
    /// Turns the seats round the map's starts (`map::seat_starts`; two seats: 1 trades their places). Drawn by the
    /// client for each game; every start of a generated map gets the same ground, so any is fair.
    pub side: u32,
    /// Each seat's race (headquarters, worker, Build list). Its length is the number of seats (`seats()`); every
    /// per-seat list below has one entry per seat, indexed by seat.
    pub factions: Vec<&'static Faction>,
    /// Each seat's team (alliance): seats of one team never fight each other and win together (`enemies`). Each seat
    /// its own by default. Fixed for the game (`set_teams`, at setup).
    pub teams: Vec<u8>,
    /// The seats that are out (beaten or conceded): the game is over when the seats still in are all one team.
    pub out: Vec<bool>,
    /// Applied commands with their tick and seat, while recording (see `record`).
    pub log: Option<Vec<Logged>>,
    pub diff: usize,
    /// Each AI seat's difficulty, when they differ (`set_diffs`; empty: every AI plays `diff`). Read through `diff_of`.
    pub diffs: Vec<usize>,
    /// A seat's AI tuning in place of its level's (`set_ai_plans`): the balance lab's random plans, set only from
    /// Rust, never by the menus, JS or the network, so not hashed. Empty (always, outside the lab): every AI plays its
    /// level. Read through `tuning`.
    pub ai_plans: Vec<Option<Diff>>,
    /// Where a Shore reef basin's main field lies (`set_shore_field`): the balance lab's exposed-income variants, set
    /// only from Rust, never by the menus, JS or the network, so not hashed (the map it makes is). `BACK` outside the lab.
    pub shore_field: ShoreField,
    pub time: f64,
    pub tick: u32,
    pub units: Vec<Unit>,
    pub bldgs: Vec<Bldg>,
    pub projs: Vec<Proj>,
    pub res: Vec<[i32; 2]>,
    pub sup: Vec<[i32; 2]>,
    /// Tiles each seat has ever seen, and sees now (from `update_fog`: its own sight and its allies'). Not hashed: a
    /// difference shows in what the AI does, which is.
    pub explored: Vec<Vec<u8>>,
    pub vis: Vec<Vec<u8>>,
    pub over: bool,
    /// The team that won (-1: none yet). With every seat its own team, the winning seat.
    pub winner: i32,
    /// The seat that conceded (-1: nobody), for the end screen's words.
    pub conceded: i32,
    /// The guided first game: the scripted opponent sends no wave while this is set (at most `HOLD_WAVES_MAX` s).
    pub hold_waves: bool,
    /// The guided first game (`guided_hold`): the opponent's army stops growing at `GUIDED_ARMY` units while its waves
    /// are held (its first wave about half the army the guide asks for), at `GUIDED_ARMY_AFTER` once released, and it
    /// raises no towers. Not hashed (a knob outside the log, like `hold_waves`).
    pub guided: bool,
    /// The water level, in tile units: against each tile's height (`Map::height`) it makes land, shallows and deep
    /// water (`Map::ground`). 0 without the tide (the map and the constant decide it, so not hashed); with it, the
    /// tide's (`tide`), hashed.
    pub water: i8,
    /// The tide (`set_tide`; None: off, the water level stays 0): the level's cycle, low to high and back.
    pub tide: Option<Tide>,
    /// Seats whose walkers do not leave ground the flood will cover when it is announced (a bit per seat; `SetRetreat`;
    /// none by default).
    pub no_retreat: u8,
    /// The flood destroys the walkers it catches instead of sweeping them ashore (`set_flood_kills`: the balance lab's
    /// comparison; off by default).
    pub flood_kills: bool,
    /// Each seat's game summary (units trained and lost, enemy units killed and buildings razed).
    pub stats: Vec<Stats>,
    /// Each seat's army value (shards + ether of its fighting units), sampled every `ARMY_LOG_EVERY` ticks: the end
    /// screen's chart. Not world state (derived, not hashed).
    pub army_log: Vec<Vec<u32>>,
    /// Each seat's units lost, counted by what killed them: a unit kind's index, or `UNIT_KINDS.len()` plus a
    /// building kind's (a turret). The end screen's "what beat you". Not hashed, like `army_log`.
    pub lost_to: Vec<Vec<u32>>,
    /// Each seat's resources mined and spent so far (`Ledger`). Not hashed, like `army_log`.
    pub ledger: Vec<Ledger>,
    /// While a projectile lands: its shooter's `lost_to` slot and seat (the shooter may be gone by then).
    hit_by: Option<(usize, u8)>,
    /// Upgrade levels per seat, in `UPGRADES` order.
    pub upgrades: Vec<[u8; UPGRADES.len()]>,
    /// Recent "under attack" alerts (team, time, x, y, was a building), for throttling.
    alerts: Vec<(u8, f64, f64, f64, bool)>,
    pub events: Vec<Event>,
    pub map: Map,
    /// Each seat's scripted opponent, if it has one (indexed by team).
    pub(crate) ai: Vec<Option<Ai>>,
    /// The seat whose AI is taking its turn (see `World::seat`).
    pub(crate) ai_turn: u8,
    /// Which seats the scripted opponent plays (they get the difficulty's income and may build in unexplored
    /// ground; the others are people). Fixed for the game, even when the AI is switched off.
    pub ai_seats: Vec<bool>,
    pub(crate) rng: Mulberry32,
    next_id: Id,
    scratch: PathScratch,
    /// Routes planned this tick for groups to share, and each seat's long searches (paths.rs). Derived: not hashed,
    /// emptied after every step.
    plans: paths::Plans,
    /// The spatial hash: units by `CELL` square, row by row, `hash_w` cells across (sized to the map).
    hash: Vec<Vec<Id>>,
    hash_w: i32,
    /// Units killed since the spatial hash was built. The JS hash keeps references to them, and separation
    /// still pushes against their last position, so the port keeps them around until the next rebuild.
    graveyard: Vec<Unit>,
    /// The tower range's coverage (radio.rs): a bit per seat on every tile, the sources it was built from (finished,
    /// in id order) and a count of its rebuilds. Derived from the buildings: not hashed.
    radio: Vec<u8>,
    radio_src: Vec<RadioSrc>,
    radio_ver: u32,
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

    /// A new two-seat game with each seat's race (faction) chosen: index = seat.
    pub fn with_setup(
        seed: u32,
        diff: usize,
        map_kind: MapKind,
        swap: bool,
        factions: [&'static Faction; 2],
    ) -> World {
        World::with_seats(seed, diff, map_kind, swap as u32, &factions)
    }

    /// A new game for `factions.len()` seats (each seat's race; at least 2, at most `MAX_SEATS` and the map's starts:
    /// panics otherwise, so check what comes from outside first) on a two-seat map's 64x64. Each seat its own team;
    /// seat 0 a person, the rest the scripted opponent (`set_teams`, `set_ai_seats` change that before play); `side`
    /// turns the seats round the starts.
    pub fn with_seats(
        seed: u32,
        diff: usize,
        map_kind: MapKind,
        side: u32,
        factions: &[&'static Faction],
    ) -> World {
        World::with_size(seed, diff, map_kind, MapSize::DUEL, side, factions)
    }

    /// `with_seats` on a map of `size` tiles, generated with every start its size has (`map::max_starts`: 2 on 64x64, 4
    /// on 96x96, 8 on 128x128), whatever the seats: the map the menus showed, its free starts free ground.
    pub fn with_size(
        seed: u32,
        diff: usize,
        map_kind: MapKind,
        map_size: MapSize,
        side: u32,
        factions: &[&'static Faction],
    ) -> World {
        let n = factions.len();
        assert!((2..=MAX_SEATS).contains(&n), "{n} seats");
        let mut w = World {
            seed,
            diff,
            diffs: Vec::new(),
            ai_plans: Vec::new(),
            shore_field: ShoreField::BACK,
            map_kind,
            map_size,
            side,
            factions: factions.to_vec(),
            teams: (0..n as u8).collect(),
            out: Vec::new(),
            log: None,
            time: 0.0,
            tick: 0,
            units: Vec::new(),
            bldgs: Vec::new(),
            projs: Vec::new(),
            res: Vec::new(),
            sup: Vec::new(),
            explored: Vec::new(),
            vis: Vec::new(),
            over: false,
            winner: -1,
            conceded: -1,
            hold_waves: false,
            guided: false,
            water: 0,
            tide: None,
            no_retreat: 0,
            flood_kills: false,
            stats: Vec::new(),
            army_log: Vec::new(),
            lost_to: Vec::new(),
            ledger: Vec::new(),
            hit_by: None,
            upgrades: Vec::new(),
            alerts: Vec::new(),
            events: Vec::new(),
            map: Map::empty(map_size),
            ai: Vec::new(),
            ai_turn: ENEMY,
            ai_seats: (0..n).map(|s| s != PLAYER as usize).collect(),
            rng: Mulberry32::new(1),
            next_id: 1,
            scratch: PathScratch::new(0),
            plans: paths::Plans::default(),
            hash: Vec::new(),
            hash_w: 0,
            graveyard: Vec::new(),
            radio: Vec::new(),
            radio_src: Vec::new(),
            radio_ver: 0,
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
        self.plans = paths::Plans::default();
        self.clear_seats();
        self.over = false;
        self.winner = -1;
        self.conceded = -1;
        self.hold_waves = false;
        self.guided = false;
        self.alerts.clear();
        self.events.clear();
        let starts = crate::map::max_starts(self.map_size);
        self.map = Map::generate_with(
            seed,
            self.map_kind,
            self.map_size,
            starts,
            &mut self.next_id,
            self.shore_field,
        );
        self.size_grids();
        assert!(
            self.seats() <= starts,
            "{} seats on a map with {} starts",
            self.seats(),
            starts
        );
        // The seats onto the starts, then the starts nobody took.
        let ring = std::mem::take(&mut self.map.bases);
        let order = crate::map::team_starts(starts, &self.teams, self.side);
        self.map.bases = order.iter().map(|&i| ring[i]).collect();
        // Starts by people (the Shore map): a seat whose builders are amphibious (the Vael) starts in its start's reef
        // basin, the others in its cove; the start a seat does not use stays open ground with its field.
        let basins = std::mem::take(&mut self.map.basins);
        if !basins.is_empty() {
            self.map.basins = order.iter().map(|&i| basins[i]).collect();
            for seat in 0..self.seats() {
                if self.factions[seat].worker.def().mv == Move::Amph {
                    self.map.bases[seat] = self.map.basins[seat];
                }
            }
        }
        // (the tide's first cycle before the starts are dealt: they are placed at its high water; each seat retreats)
        self.water = 0;
        self.no_retreat = 0;
        if self.tide.is_some() {
            self.start_tide();
        }
        for team in 0..self.seats() as u8 {
            self.deal_start(team);
        }
        self.refresh_radio(true);
        self.init_ai();
        self.update_fog();
    }

    /// The path search's scratch and the spatial hash, sized to the map (once per game, never per tick).
    fn size_grids(&mut self) {
        let tiles = self.map.rock.len();
        if self.scratch.len() != tiles {
            self.scratch = PathScratch::new(tiles);
        }
        let cells = |px: f64| jsmath::to_i32((px / CELL).ceil());
        self.hash_w = cells(self.map.ww());
        self.hash
            .resize((self.hash_w * cells(self.map.wh())) as usize, Vec::new());
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
    /// A mark on one seat's minimap.
    pub(crate) fn ping(&mut self, team: u8, x: f64, y: f64) {
        self.emit(Event::Ping { team, x, y });
    }
    /// A sound for one seat's player.
    pub(crate) fn sfx(&mut self, team: u8, name: &'static str) {
        self.emit(Event::Sfx { team, name });
    }
    /// Whether the scripted opponent plays this seat.
    pub fn is_ai(&self, team: u8) -> bool {
        self.ai_seats[team as usize]
    }
    /// The difficulty an AI seat plays at (its own, else the game's).
    pub fn diff_of(&self, team: u8) -> usize {
        self.diffs.get(team as usize).copied().unwrap_or(self.diff)
    }
    /// The tuning a seat's AI plays by: the plan set for it (`set_ai_plans`), else its level's (`diff_of`). Every AI
    /// decision reads its numbers here.
    pub fn tuning(&self, team: u8) -> Diff {
        self.ai_plans
            .get(team as usize)
            .copied()
            .flatten()
            .unwrap_or(DIFF[self.diff_of(team)])
    }
    /// Move a Shore reef basin's main field (the balance lab's exposed-income variants) and start the game again on the
    /// map that makes: call it first, before the seats' levels, plans and AI seats. Nothing else changes; on a map
    /// without basins nothing at all. The balance lab's only: never from the menus, JS or the network.
    pub fn set_shore_field(&mut self, field: ShoreField) {
        self.shore_field = field;
        self.reset(self.seed, self.diff);
    }
    /// Give each seat's AI a plan of its own before play, a whole `Diff` in place of its level's (None: its level's;
    /// empty: none), with fresh brains. The balance lab's only: never from the menus, JS or the network. False
    /// (nothing changes) for a list of another length.
    pub fn set_ai_plans(&mut self, plans: &[Option<Diff>]) -> bool {
        if !plans.is_empty() && plans.len() != self.seats() {
            return false;
        }
        self.ai_plans = plans.to_vec();
        self.init_ai();
        true
    }
    /// Give each seat's AI a difficulty of its own before play (a person's seat ignores its entry; empty: every AI
    /// plays the game's `diff`), with fresh brains. False (nothing changes) for a list of another length.
    pub fn set_diffs(&mut self, diffs: &[u8]) -> bool {
        if !diffs.is_empty() && diffs.len() != self.seats() {
            return false;
        }
        self.diffs = diffs
            .iter()
            .map(|&d| (d as usize).min(DIFF.len() - 1))
            .collect();
        self.init_ai();
        true
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
        // Settled in: its toggle's extra reach; settling in or packing up: no reach at all (it cannot fire then).
        let range = match self.reach_add(uid) {
            Some(add) => self.active_weapon(uid).map_or(0.0, |w| w.range + add) * TILE,
            None => 0.0,
        };
        let min = d
            .weapon
            .filter(|w| w.min_range > 0.0)
            .map_or(0.0, |w| w.min_range * TILE + u.r);
        let siege = d
            .weapon
            .filter(|_| u.kind.siege())
            .map(|w| w.range * TILE + u.r);
        Live {
            range,
            min,
            siege,
            ring: siege.filter(|_| u.mode.is_some()).map(|_| min),
            combat: d.threat(),
            team: u.team,
            r: u.r,
            sight: d.sight,
            kind: u.kind,
            hits: Self::hits_of(u.kind),
        }
    }
    /// What a unit of `kind` may stand on now: its movement class at the current water level.
    pub fn foot(&self, kind: UnitKind) -> Foot {
        Foot {
            class: kind.def().mv,
            water: self.water,
        }
    }
    /// The ground under (x, y) (world px) at the current water level.
    pub fn ground_at(&self, x: f64, y: f64) -> Ground {
        let (tx, ty) = self.map.tile_of(x, y);
        self.map.ground(tx, ty, self.water)
    }
    /// A unit standing in deep water: it cannot fire from there (it is a road, not a battlefield).
    pub(crate) fn in_deep(&self, uid: Id) -> bool {
        let u = self.u(uid);
        !u.kind.def().air && self.ground_at(u.x, u.y) == Ground::Deep
    }

    /// A unit's walking speed right now (px/s).
    pub(crate) fn live_speed(&self, uid: Id) -> f64 {
        let u = self.u(uid);
        let mut own = self.base_speed(uid) * self.speed_mul(uid);
        if u.kind.def().mv == Move::Walk && self.ground_at(u.x, u.y) == Ground::Shallow {
            own *= WADE_SPEED; // (a walker wades through the shallows)
        }
        if u.slowed > 0.0 {
            own *= SLOW_SPEED; // (harpooned)
        }
        own *= self.radio_speed(uid); // (a machine out of range)
        match (u.pace, u.task) {
            (Some(p), Task::Move { .. } | Task::AMove { .. }) => own.min(p),
            _ => own,
        }
    }

    /// One unit's tick: its weapon and flash cool down, a healer heals, then its task runs.
    pub(crate) fn update_unit(&mut self, uid: Id, dt: f64) {
        let u = self.um(uid);
        u.cd -= dt;
        u.flash -= dt;
        if u.slowed > 0.0 {
            // (a whole number of seconds counted down by DT leaves a rounding crumb: none of it is a tick)
            let left = u.slowed - dt;
            u.slowed = if left > 1e-9 { left } else { 0.0 };
        }
        if u.stun > 0.0 {
            u.stun = (u.stun - dt).max(0.0);
            return;
        }
        let c = self.live(uid);
        let task = self.u(uid).task;
        if c.kind.def().heal > 0.0 {
            self.medic(uid, dt);
        }
        // A worker at work (mining, or idle) runs from an armed enemy close by with nothing of its own to fight it
        // (looked at four times a second, staggered by id).
        if c.kind.def().worker
            && matches!(task, Task::Gather { .. } | Task::Idle)
            && (self.tick + uid).is_multiple_of(8)
            && let Some(from) = self.alarm(uid)
            && self.start_flee(uid, from)
        {
            return;
        }
        match task {
            Task::Flee { node, x, y, calm } => self.update_flee(uid, node, x, y, calm, dt),
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
        // (the tide first: the walkers it sweeps are where they land when the spatial hash is built)
        if self.tide.is_some() {
            self.tide_tick();
        }
        self.rebuild_hash();
        self.refresh_radio(false); // (a source finished or fell last tick)
        let ids: Vec<Id> = self.units.iter().map(|u| u.id).collect();
        for id in ids {
            if self.unit(id).is_some_and(|u| !self.inert(u.team)) {
                self.update_unit(id, dt);
            } else if let Some(i) = self.ui(id) {
                let u = &mut self.units[i];
                u.flash = (u.flash - dt).max(0.0); // (an out seat's leftovers stand still, but a hit's flash fades)
            }
        }
        self.separate();
        let bids: Vec<Id> = self.bldgs.iter().map(|b| b.id).collect();
        for id in bids {
            if self.bldg(id).is_some_and(|b| !self.inert(b.team)) {
                self.update_building(id, dt);
            } else if let Some(b) = self.bm(id) {
                b.flash = (b.flash - dt).max(0.0);
            }
        }
        self.update_projs(dt);
        self.regen_shields(dt);
        self.tick_abilities(dt);
        self.update_fog();
        self.ai_tick();
        if self.tick.is_multiple_of(ARMY_LOG_EVERY) {
            self.log_armies();
        }
        self.plans.clear();
    }

    /// One sample of each seat's army value for the end screen's chart.
    fn log_armies(&mut self) {
        for team in 0..self.seats() as u8 {
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
        for r in &self.res {
            mix(r[0]);
            mix(r[1]);
        }
        // Hidden state too, so a divergence shows on the tick it happens, not when a position drifts later.
        mix(self.rng.state() as i32);
        mix(self.next_id as i32);
        for s in &self.sup {
            mix(s[0]);
            mix(s[1]);
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
            if u.mode.is_some() || u.swap > 0.0 || u.ab_cd.iter().any(|&c| c > 0.0) {
                for &c in &u.ab_cd {
                    mix(jsmath::to_i32(c * 16.0));
                }
                mix(u.mode.map_or(0, |k| k.index() as i32 + 1));
                mix(jsmath::to_i32(u.swap * 16.0));
            }
            if u.stun > 0.0 {
                mix(jsmath::to_i32(u.stun * 16.0) + 1); // (swept by the flood: only with the tide)
            }
            if u.slowed > 0.0 {
                mix(jsmath::to_i32(u.slowed * 16.0) + 2); // (harpooned)
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
            mix(jsmath::to_i32(b.progress * 1024.0));
            mix(b.queue.len() as i32);
            if b.pumped > 0.0 {
                mix(jsmath::to_i32(b.pumped * 1024.0) + 1);
            }
            if let Some((up, p)) = b.research {
                mix(up.index() as i32 + 1);
                mix(jsmath::to_i32(p * 1024.0));
            }
        }
        for levels in &self.upgrades {
            for &level in levels {
                mix(level as i32);
            }
        }
        // The teams, when they are not the default (each seat its own: the goldens' games): every client must play
        // the same alliances.
        if self.teams.iter().enumerate().any(|(s, &t)| t as usize != s) {
            for &t in &self.teams {
                mix(t as i32 + 1);
            }
        }
        // The tide, when it is on (a game without it hashes as before): the level, the cycle, the seats' switches.
        if let Some(t) = &self.tide {
            mix(self.water as i32);
            mix(t.start as i32);
            for &p in &t.phases {
                mix(p as i32);
            }
            mix(t.warned as i32);
            mix(self.no_retreat as i32);
            mix(self.flood_kills as i32);
        }
        h
    }
}
