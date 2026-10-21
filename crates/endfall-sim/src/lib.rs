//! Endfall simulation in Rust, compiled to WASM for the browser.
//!
//! A port of `src/sim/` that keeps its rules and its arithmetic, so the two produce the same per-tick state
//! hashes (see `scripts/parity.mjs`). The rules from CLAUDE.md apply: fixed tick, all randomness from the
//! seeded RNG, no wall clock, iterate `Vec`s (never `HashMap`s) where order affects results. The JS client talks
//! to it only through the `#[wasm_bindgen]` surface below; `src/engine/` wraps that in the shape the client uses.

mod ai;
pub mod data;
pub mod jsmath;
pub mod map;
pub mod path;
mod rng;
pub mod world;

use data::{BldgKind, ProjKind, UnitKind};
pub use rng::Mulberry32;
use wasm_bindgen::prelude::*;
use world::{Event, Phase, Task, World};

/// Simulation ticks per second; `DT` is `1 / TICK_RATE`.
pub const TICK_RATE: u32 = 30;

/// Record sizes of the flat snapshot arrays (one f64 per field). Keep in sync with src/engine/core.js.
pub const UNIT_STRIDE: usize = 16;
pub const BLDG_STRIDE: usize = 24;
pub const PROJ_STRIDE: usize = 8;
pub const NODE_STRIDE: usize = 12;

#[wasm_bindgen]
pub struct Game {
    w: World,
}

fn res(r: Result<(), String>) -> String {
    r.err().unwrap_or_default()
}

/// Teams from JS are validated here: an out-of-range index would panic, and a panic poisons the Game object.
fn valid_team(t: u8) -> Option<u8> {
    (t < 2).then_some(t)
}

#[wasm_bindgen]
impl Game {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u32, diff: u32) -> Game {
        Game {
            w: World::new(seed, diff as usize),
        }
    }

    /// Start a new game on this instance.
    pub fn reset(&mut self, seed: u32, diff: u32) {
        self.w.reset(seed, diff as usize);
    }

    /// Advance the world by one fixed tick.
    pub fn step(&mut self) {
        self.w.step();
    }

    pub fn tick(&self) -> u32 {
        self.w.tick
    }

    #[wasm_bindgen(js_name = stateHash)]
    pub fn state_hash(&self) -> u32 {
        self.w.state_hash()
    }

    // ---- orders: unit/building/node ids in, error message out ("" = ok) ----
    #[wasm_bindgen(js_name = moveTo)]
    pub fn move_to(&mut self, unit: u32, x: f64, y: f64) {
        if self.w.ui(unit).is_some() {
            self.w.move_to(unit, x, y);
        }
    }
    #[wasm_bindgen(js_name = attackMove)]
    pub fn attack_move(&mut self, unit: u32, x: f64, y: f64) {
        if self.w.ui(unit).is_some() {
            self.w.attack_move(unit, x, y);
        }
    }
    #[wasm_bindgen(js_name = attackEnt)]
    pub fn attack_ent(&mut self, unit: u32, target: u32) {
        if self.w.ui(unit).is_some() {
            self.w.attack_ent(unit, target);
        }
    }
    #[wasm_bindgen(js_name = stopUnit)]
    pub fn stop_unit(&mut self, unit: u32) {
        if self.w.ui(unit).is_some() {
            self.w.stop_unit(unit);
        }
    }
    #[wasm_bindgen(js_name = holdUnit)]
    pub fn hold_unit(&mut self, unit: u32) {
        if self.w.ui(unit).is_some() {
            self.w.hold_unit(unit);
        }
    }
    #[wasm_bindgen(js_name = startGather)]
    pub fn start_gather(&mut self, unit: u32, node: u32) {
        if self.w.ui(unit).is_some() {
            self.w.start_gather(unit, node);
        }
    }
    #[wasm_bindgen(js_name = startBuild)]
    pub fn start_build(&mut self, unit: u32, bldg: u32) {
        if self.w.ui(unit).is_some() && self.w.bi(bldg).is_some() {
            self.w.start_build(unit, bldg);
        }
    }
    /// `builder` 0 = none.
    #[wasm_bindgen(js_name = placeBuilding)]
    pub fn place_building(
        &mut self,
        team: u8,
        kind: &str,
        tx: i32,
        ty: i32,
        builder: u32,
    ) -> String {
        let (Some(k), Some(team)) = (BldgKind::parse(kind), valid_team(team)) else {
            return "Unknown building or team".into();
        };
        res(self
            .w
            .place_building(team, k, tx, ty, (builder != 0).then_some(builder))
            .map(|_| ()))
    }
    #[wasm_bindgen(js_name = queueUnit)]
    pub fn queue_unit(&mut self, bldg: u32, kind: &str) -> String {
        let Some(k) = UnitKind::parse(kind) else {
            return "Unknown unit".into();
        };
        res(self.w.queue_unit(bldg, k))
    }
    #[wasm_bindgen(js_name = cancelQueue)]
    pub fn cancel_queue(&mut self, bldg: u32, i: u32) {
        self.w.cancel_queue(bldg, i as usize);
    }
    /// `node` 0 = none.
    #[wasm_bindgen(js_name = setRally)]
    pub fn set_rally(&mut self, bldg: u32, x: f64, y: f64, node: u32) {
        self.w.set_rally(bldg, x, y, (node != 0).then_some(node));
    }
    pub fn formation(&mut self, units: &[u32], x: f64, y: f64) {
        self.w.formation(units, x, y);
    }

    // ---- rule queries ----
    #[wasm_bindgen(js_name = canPlace)]
    pub fn can_place(&self, kind: &str, tx: i32, ty: i32, team: u8) -> bool {
        valid_team(team)
            .is_some_and(|t| BldgKind::parse(kind).is_some_and(|k| self.w.can_place(k, tx, ty, t)))
    }
    #[wasm_bindgen(js_name = hasReq)]
    pub fn has_req(&self, team: u8, kind: &str) -> bool {
        valid_team(team)
            .is_some_and(|t| BldgKind::parse(kind).is_some_and(|k| self.w.has_req(t, k)))
    }
    #[wasm_bindgen(js_name = canAfford)]
    pub fn can_afford(&self, team: u8, shards: i32, ether: i32) -> bool {
        valid_team(team).is_some_and(|t| self.w.can_afford(t, [shards, ether]))
    }

    /// Set a team's resources (tests and tools only).
    #[wasm_bindgen(js_name = setResources)]
    pub fn set_resources(&mut self, team: u8, shards: i32, ether: i32) {
        self.w.res[team as usize & 1] = [shards, ether];
    }

    // ---- snapshot for the renderer and HUD ----
    /// [time, tick, res P shards, res P ether, res E shards, res E ether, sup P used, sup P cap, sup E used,
    ///  sup E cap, over, winner, built, lost, killed, razed, seed, diff]
    pub fn info(&self) -> Vec<f64> {
        let w = &self.w;
        let s = w.stats;
        vec![
            w.time,
            w.tick as f64,
            w.res[0][0] as f64,
            w.res[0][1] as f64,
            w.res[1][0] as f64,
            w.res[1][1] as f64,
            w.sup[0][0] as f64,
            w.sup[0][1] as f64,
            w.sup[1][0] as f64,
            w.sup[1][1] as f64,
            w.over as u8 as f64,
            w.winner as f64,
            s.built as f64,
            s.lost as f64,
            s.killed as f64,
            s.razed as f64,
            w.seed as f64,
            w.diff as f64,
        ]
    }

    /// Per unit: [id, kind, team, x, y, hp, maxhp, r, face, flash, carry, carryType (-1 none, 0 shards,
    /// 1 ether), task (0 idle, 1 hold, 2 move, 3 amove, 4 attack, 5 gather, 6 build), phase (-1, or 0 go,
    /// 1 wait, 2 mine, 3 return), target id (attack/build/gather, else 0), cd].
    pub fn units(&self) -> Vec<f64> {
        let mut out = Vec::with_capacity(self.w.units.len() * UNIT_STRIDE);
        for u in &self.w.units {
            let (task, phase, target) = match u.task {
                Task::Idle => (0, -1, 0),
                Task::Hold => (1, -1, 0),
                Task::Move { .. } => (2, -1, 0),
                Task::AMove { .. } => (3, -1, 0),
                Task::Attack { target, .. } => (4, -1, target),
                Task::Gather { node, phase, .. } => (
                    5,
                    match phase {
                        Phase::Go => 0,
                        Phase::Wait => 1,
                        Phase::Mine => 2,
                        Phase::Return => 3,
                    },
                    node,
                ),
                Task::Build { b } => (6, -1, b),
            };
            out.extend_from_slice(&[
                u.id as f64,
                u.kind.index() as f64,
                u.team as f64,
                u.x,
                u.y,
                u.hp,
                u.maxhp,
                u.r,
                u.face,
                u.flash,
                u.carry as f64,
                u.carry_ether.map_or(-1.0, |e| e as u8 as f64),
                task as f64,
                phase as f64,
                target as f64,
                u.cd,
            ]);
        }
        out
    }

    /// Per building: [id, kind, team, tx, ty, hp, maxhp, progress, done, prog, flash, aim, hasRally, rallyX,
    /// rallyY, rallyNode, queueLen, q0..q4 (unit kind or -1), 0, 0].
    pub fn buildings(&self) -> Vec<f64> {
        let mut out = Vec::with_capacity(self.w.bldgs.len() * BLDG_STRIDE);
        for b in &self.w.bldgs {
            let (hr, rx, ry, rn) = match b.rally {
                Some(r) => (1.0, r.x, r.y, r.node.unwrap_or(0) as f64),
                None => (0.0, 0.0, 0.0, 0.0),
            };
            out.extend_from_slice(&[
                b.id as f64,
                b.kind.index() as f64,
                b.team as f64,
                b.tx as f64,
                b.ty as f64,
                b.hp,
                b.maxhp,
                b.progress,
                b.done as u8 as f64,
                b.prog,
                b.flash,
                b.aim,
                hr,
                rx,
                ry,
                rn,
                b.queue.len() as f64,
            ]);
            for i in 0..5 {
                out.push(b.queue.get(i).map_or(-1.0, |k| k.index() as f64));
            }
            out.extend_from_slice(&[0.0, 0.0]);
        }
        out
    }

    /// Per projectile: [x, y, kind (0 bolt, 1 shell), team, aimX, aimY, 0, 0]; aim = the point it flies at.
    pub fn projectiles(&self) -> Vec<f64> {
        let mut out = Vec::with_capacity(self.w.projs.len() * PROJ_STRIDE);
        for p in &self.w.projs {
            let (ax, ay) = self
                .w
                .geo(p.target)
                .map_or((p.x, p.y), |g| g.aim_point(p.x, p.y));
            let k = if p.kind == ProjKind::Shell { 1.0 } else { 0.0 };
            out.extend_from_slice(&[p.x, p.y, k, p.team as f64, ax, ay, 0.0, 0.0]);
        }
        out
    }

    /// Per resource node: [id, ether, tx, ty, x, y, amount, miners, extractor id (0 none), r, 0, 0].
    pub fn nodes(&self) -> Vec<f64> {
        let mut out = Vec::with_capacity(self.w.map.nodes.len() * NODE_STRIDE);
        for n in &self.w.map.nodes {
            out.extend_from_slice(&[
                n.id as f64,
                n.ether as u8 as f64,
                n.tx as f64,
                n.ty as f64,
                n.x,
                n.y,
                n.amount as f64,
                n.miners as f64,
                n.extractor.unwrap_or(0) as f64,
                n.r,
                0.0,
                0.0,
            ]);
        }
        out
    }

    /// Terrain: 1 = rock. Fixed for the whole game.
    pub fn rock(&self) -> Vec<u8> {
        self.w.map.rock.clone()
    }
    /// Noise value per tile, for the renderer. Fixed for the whole game.
    pub fn shade(&self) -> Vec<f32> {
        self.w.map.shade.clone()
    }
    /// Occupancy: 0 free, >0 building id, <0 negative node id.
    pub fn occ(&self) -> Vec<i32> {
        self.w.map.occ.clone()
    }
    /// Tiles `team` sees right now.
    pub fn vis(&self, team: u8) -> Vec<u8> {
        self.w.vis[team as usize & 1].clone()
    }
    /// Tiles `team` has ever seen.
    pub fn explored(&self, team: u8) -> Vec<u8> {
        self.w.explored[team as usize & 1].clone()
    }

    /// Events since the last call, as a JSON array of {t:'sfx'|'toast'|'burst'|'hit', ...}.
    #[wasm_bindgen(js_name = drainEvents)]
    pub fn drain_events(&mut self) -> String {
        let parts: Vec<String> = self
            .w
            .events
            .drain(..)
            .map(|e| match e {
                Event::Sfx(name) => format!("{{\"t\":\"sfx\",\"name\":\"{name}\"}}"),
                Event::Toast { msg, bad } => {
                    format!("{{\"t\":\"toast\",\"msg\":\"{}\",\"bad\":{bad}}}", msg.replace('\\', "\\\\").replace('"', "\\\""))
                }
                Event::Burst { x, y, r, team, n } => {
                    format!("{{\"t\":\"burst\",\"x\":{x},\"y\":{y},\"r\":{r},\"team\":{team},\"n\":{n}}}")
                }
                Event::Hit { x, y, big } => format!("{{\"t\":\"hit\",\"x\":{x},\"y\":{y},\"big\":{big}}}"),
            })
            .collect();
        format!("[{}]", parts.join(","))
    }
}

impl Game {
    /// The world behind the WASM surface, for Rust-side tests and tools.
    pub fn world(&self) -> &World {
        &self.w
    }
}

/// Crate version, so the client can log which sim build it loaded.
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// The first `n` raw outputs of the seeded RNG; lets the JS tests check parity with `mulberry` in util.js.
#[wasm_bindgen(js_name = rngSequence)]
pub fn rng_sequence(seed: u32, n: u32) -> Vec<u32> {
    let mut r = Mulberry32::new(seed);
    (0..n).map(|_| r.next_u32()).collect()
}

/// The unit, building and difficulty tables as JSON, for checking against src/sim/constants.js.
#[wasm_bindgen(js_name = dataJson)]
pub fn data_json() -> String {
    data::data_json()
}

/// `Math.hypot` as the sim computes it; exposed so the tests can compare it with V8's.
#[wasm_bindgen(js_name = jsHypot)]
pub fn js_hypot(a: f64, b: f64) -> f64 {
    jsmath::hypot(a, b)
}

#[cfg(test)]
mod tests {
    use super::*;
    use data::{ENEMY, PLAYER};

    fn run(seed: u32, diff: u32, ticks: u32) -> Game {
        let mut g = Game::new(seed, diff);
        for _ in 0..ticks {
            g.step();
        }
        g
    }

    #[test]
    fn fresh_game_has_two_cores_and_eight_harvesters() {
        let g = Game::new(12345, 1);
        assert_eq!(g.w.bldgs.len(), 2);
        assert_eq!(g.w.units.len(), 8);
        assert!(g.w.map.nodes.len() > 20);
        assert_eq!(g.w.sup[PLAYER as usize], [4, 10]);
    }

    #[test]
    fn harvesters_bring_shards_home() {
        let g = run(777, 1, 60 * TICK_RATE);
        assert!(
            g.w.res[PLAYER as usize][0] > 50,
            "income: {}",
            g.w.res[PLAYER as usize][0]
        );
    }

    #[test]
    fn same_seed_same_hash() {
        assert_eq!(
            run(4242, 2, 2700).state_hash(),
            run(4242, 2, 2700).state_hash()
        );
        assert_ne!(run(1, 1, 300).state_hash(), run(2, 1, 300).state_hash());
    }

    #[test]
    fn placing_a_depot_costs_100_and_gets_built() {
        let mut g = Game::new(99, 0);
        g.set_resources(PLAYER, 500, 0);
        let core = g.w.bldgs.iter().find(|b| b.team == PLAYER).unwrap().clone();
        let h = g.w.units.iter().find(|u| u.team == PLAYER).unwrap().id;
        let mut placed = false;
        'search: for r in 3..9 {
            for a in 0..12 {
                #[allow(clippy::approx_constant)] // the JS test uses 6.28, not 2π
                let ang = a as f64 / 12.0 * 6.28;
                let tx =
                    jsmath::round(core.tx as f64 + 2.0 + jsmath::cos(ang) * r as f64 - 1.0) as i32;
                let ty =
                    jsmath::round(core.ty as f64 + 2.0 + jsmath::sin(ang) * r as f64 - 1.0) as i32;
                if g.can_place("depot", tx, ty, PLAYER) {
                    assert_eq!(g.place_building(PLAYER, "depot", tx, ty, h), "");
                    placed = true;
                    break 'search;
                }
            }
        }
        assert!(placed);
        assert_eq!(g.w.res[PLAYER as usize][0], 400);
        for _ in 0..45 * TICK_RATE {
            g.step();
        }
        assert!(
            g.w.bldgs
                .iter()
                .any(|b| b.team == PLAYER && b.kind == BldgKind::Depot && b.done)
        );
        assert_eq!(g.w.sup[PLAYER as usize][1], 18);
    }

    #[test]
    fn the_ai_ends_the_game_against_an_idle_player() {
        let mut g = Game::new(31337, 2);
        for _ in 0..900 * TICK_RATE {
            if g.w.over {
                break;
            }
            g.step();
        }
        assert!(g.w.bldgs.iter().filter(|b| b.team == ENEMY).count() > 3);
        assert!(g.w.over);
        assert_eq!(g.w.winner, ENEMY as i32);
    }

    #[test]
    fn snapshot_strides() {
        let g = run(5, 1, 30);
        assert_eq!(g.units().len(), g.w.units.len() * UNIT_STRIDE);
        assert_eq!(g.buildings().len(), g.w.bldgs.len() * BLDG_STRIDE);
        assert_eq!(g.nodes().len(), g.w.map.nodes.len() * NODE_STRIDE);
    }
}
