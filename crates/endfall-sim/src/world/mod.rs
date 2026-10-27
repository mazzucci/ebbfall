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
mod seats;
mod spawn;
mod types;
mod wire;

use crate::ai::Ai;
use crate::data::*;
use crate::jsmath::{self, PI, clamp, dist};
use crate::map::{Id, Map, MapKind, MapSize, Node};
use crate::path::{PathScratch, Pt, astar};
use crate::rng::Mulberry32;
pub use command::{Command, Logged};
pub use economy::FIELD_LOW;
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
    pub time: f64,
    pub tick: u32,
    pub units: Vec<Unit>,
    pub bldgs: Vec<Bldg>,
    pub projs: Vec<Proj>,
    pub res: Vec<[i32; 2]>,
    pub sup: Vec<[i32; 2]>,
    pub explored: Vec<Vec<u8>>,
    pub vis: Vec<Vec<u8>>,
    /// Tiles where each seat reveals its enemies' cloaked units (from `update_fog`, like `vis`). Rebuilt at the end of each
    /// step, so the next step's units act on it (a detector lost this tick still counts once); derived from the world,
    /// so not hashed.
    pub det: Vec<Vec<u8>>,
    pub over: bool,
    /// The team that won (-1: none yet). With every seat its own team, the winning seat.
    pub winner: i32,
    /// The seat that conceded (-1: nobody), for the end screen's words.
    pub conceded: i32,
    /// The guided first game: the scripted opponent sends no wave while this is set (at most `HOLD_WAVES_MAX` s).
    pub hold_waves: bool,
    /// Each seat's game summary (units trained and lost, enemy units killed and buildings razed).
    pub stats: Vec<Stats>,
    /// Each seat's army value (shards + ether of its fighting units), sampled every `ARMY_LOG_EVERY` ticks: the end
    /// screen's chart. Not world state (derived, not hashed).
    pub army_log: Vec<Vec<u32>>,
    /// Each seat's units lost, counted by what killed them: a unit kind's index, or `UNIT_KINDS.len()` plus a
    /// building kind's (a turret). The end screen's "what beat you". Not hashed, like `army_log`.
    pub lost_to: Vec<Vec<u32>>,
    /// While a projectile lands: its shooter's `lost_to` slot and seat (the shooter may be gone by then).
    hit_by: Option<(usize, u8)>,
    /// Upgrade levels per seat, in `UPGRADES` order.
    pub upgrades: Vec<[u8; UPGRADES.len()]>,
    /// Recent "under attack" alerts (team, time, x, y, was a building), for throttling.
    alerts: Vec<(u8, f64, f64, f64, bool)>,
    /// When each team was last told that something it cannot see is attacking (not hashed: presentation).
    unseen_alert: Vec<f64>,
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
    /// The spatial hash: units by `CELL` square, row by row, `hash_w` cells across (sized to the map).
    hash: Vec<Vec<Id>>,
    hash_w: i32,
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

    /// `with_seats` on a map of `size` tiles, generated with the starts the seats need (`map::starts_for`: up to 4 on
    /// 96x96, 8 on 128x128).
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
            det: Vec::new(),
            over: false,
            winner: -1,
            conceded: -1,
            hold_waves: false,
            stats: Vec::new(),
            army_log: Vec::new(),
            lost_to: Vec::new(),
            hit_by: None,
            upgrades: Vec::new(),
            alerts: Vec::new(),
            unseen_alert: Vec::new(),
            events: Vec::new(),
            map: Map::empty(map_size),
            ai: Vec::new(),
            ai_turn: ENEMY,
            ai_seats: (0..n).map(|s| s != PLAYER as usize).collect(),
            rng: Mulberry32::new(1),
            next_id: 1,
            scratch: PathScratch::new(0),
            hash: Vec::new(),
            hash_w: 0,
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
        self.clear_seats();
        self.over = false;
        self.winner = -1;
        self.conceded = -1;
        self.hold_waves = false;
        self.alerts.clear();
        self.events.clear();
        let starts = crate::map::starts_for(self.map_size, self.seats());
        self.map = Map::generate(
            seed,
            self.map_kind,
            self.map_size,
            starts,
            &mut self.next_id,
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
        self.map.bases = crate::map::seat_starts(starts, self.seats(), self.side)
            .into_iter()
            .map(|i| ring[i])
            .collect();
        for team in 0..self.seats() as u8 {
            self.deal_start(team);
        }
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
        let own = self.base_speed(uid) * self.speed_mul(uid);
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
        self.rebuild_hash();
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
        self.ai_tick(dt);
        if self.tick.is_multiple_of(ARMY_LOG_EVERY) {
            self.log_armies();
        }
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
