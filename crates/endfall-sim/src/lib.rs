//! Endfall simulation in Rust, compiled to WASM for the browser.
//!
//! Originally a bit-exact port of the prototype's JS sim (it keeps JS arithmetic: see jsmath.rs). The rules from
//! CLAUDE.md apply: fixed tick, all randomness from the
//! seeded RNG, no wall clock, iterate `Vec`s (never `HashMap`s) where order affects results. The JS client talks
//! to it only through the `#[wasm_bindgen]` surface below; `src/engine/` wraps that in the shape the client uses.

mod ai;
pub mod data;
pub mod jsmath;
pub mod map;
pub mod path;
mod rng;
pub mod snapshot;
pub mod world;

use data::{BldgKind, UnitKind};
pub use rng::Mulberry32;
use wasm_bindgen::prelude::*;
use world::{Command, Event, World};

/// Simulation ticks per second; `DT` is `1 / TICK_RATE`.
pub const TICK_RATE: u32 = 30;

/// Record sizes of the flat snapshot arrays (one f64 per field; the layouts are in snapshot.rs).
pub const UNIT_STRIDE: usize = snapshot::UNIT_FIELDS.len();
pub const BLDG_STRIDE: usize = snapshot::BLDG_FIELDS.len();
pub const PROJ_STRIDE: usize = snapshot::PROJ_FIELDS.len();
pub const NODE_STRIDE: usize = snapshot::NODE_FIELDS.len();

#[wasm_bindgen]
pub struct Game {
    w: World,
    /// The team whose orders this Game accepts (the local player). Orders for anything else are ignored.
    me: u8,
}

impl Game {
    /// An order from this Game's player: applied for its seat (orders for anything else are ignored).
    fn order(&mut self, cmd: Command) {
        let _ = self.w.apply(self.me, &cmd);
    }
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
            me: data::PLAYER,
        }
    }

    /// A new game with the races chosen (index into FACTIONS for the player and for the AI; unknown = Humans).
    #[wasm_bindgen(js_name = withSetup)]
    pub fn with_setup(seed: u32, diff: u32, map: u32, side: u32, player: u32, ai: u32) -> Game {
        let pick = |i: u32| *data::FACTIONS.get(i as usize).unwrap_or(&data::FACTIONS[0]);
        let f = [pick(player), pick(ai)]; // (the player is team 0)
        Game {
            w: World::with_setup(
                seed,
                diff as usize,
                map::MapKind::from_index(map),
                side == 1,
                f,
            ),
            me: data::PLAYER,
        }
    }

    /// The seat this Game plays: its orders, its fog, its events.
    pub fn me(&self) -> u8 {
        self.me
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
        self.order(Command::Move { unit, x, y });
    }
    #[wasm_bindgen(js_name = attackMove)]
    pub fn attack_move(&mut self, unit: u32, x: f64, y: f64) {
        self.order(Command::AttackMove { unit, x, y });
    }
    #[wasm_bindgen(js_name = attackEnt)]
    pub fn attack_ent(&mut self, unit: u32, target: u32) {
        self.order(Command::Attack { unit, target });
    }
    #[wasm_bindgen(js_name = stopUnit)]
    pub fn stop_unit(&mut self, unit: u32) {
        self.order(Command::Stop { unit });
    }
    #[wasm_bindgen(js_name = holdUnit)]
    pub fn hold_unit(&mut self, unit: u32) {
        self.order(Command::Hold { unit });
    }
    #[wasm_bindgen(js_name = startGather)]
    pub fn start_gather(&mut self, unit: u32, node: u32) {
        self.order(Command::Gather { unit, node });
    }
    #[wasm_bindgen(js_name = startBuild)]
    pub fn start_build(&mut self, unit: u32, bldg: u32) {
        self.order(Command::Build { unit, bldg });
    }
    /// Repair a damaged finished building of the same team (harvesters only; anything else is ignored).
    pub fn repair(&mut self, unit: u32, bldg: u32) {
        self.order(Command::Repair { unit, bldg });
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
        let (Some(kind), Some(_)) = (
            BldgKind::parse(kind),
            valid_team(team).filter(|&t| t == self.me),
        ) else {
            return "Unknown building or team".into();
        };
        let builder = (builder != 0).then_some(builder);
        res(self.w.apply(
            self.me,
            &Command::Place {
                kind,
                tx,
                ty,
                builder,
            },
        ))
    }
    #[wasm_bindgen(js_name = queueUnit)]
    pub fn queue_unit(&mut self, bldg: u32, kind: &str) -> String {
        let Some(kind) = UnitKind::parse(kind) else {
            return "Unknown unit".into();
        };
        res(self.w.apply(self.me, &Command::Queue { bldg, kind }))
    }
    #[wasm_bindgen(js_name = cancelQueue)]
    pub fn cancel_queue(&mut self, bldg: u32, i: u32) {
        self.order(Command::CancelQueue {
            bldg,
            index: i as usize,
        });
    }
    /// Research the next level of an upgrade key ("weapons", "armor", "shields") at one of our research buildings ("" = started).
    pub fn research(&mut self, bldg: u32, upgrade: &str) -> String {
        let Some(up) = data::Upgrade::parse(upgrade) else {
            return "Unknown upgrade".into();
        };
        res(self.w.apply(self.me, &Command::Research { bldg, up }))
    }
    /// Stop the research at one of our buildings (full refund).
    #[wasm_bindgen(js_name = cancelResearch)]
    pub fn cancel_research(&mut self, bldg: u32) {
        self.order(Command::CancelResearch { bldg });
    }

    /// Cancel one of our unfinished buildings (75% refund).
    #[wasm_bindgen(js_name = cancelConstruction)]
    pub fn cancel_construction(&mut self, bldg: u32) {
        self.order(Command::CancelConstruction { bldg });
    }
    /// `node` 0 = none.
    #[wasm_bindgen(js_name = setRally)]
    pub fn set_rally(&mut self, bldg: u32, x: f64, y: f64, node: u32) {
        self.order(Command::Rally {
            bldg,
            x,
            y,
            node: (node != 0).then_some(node),
        });
    }
    /// This seat gives up: the game ends, the other side the winner.
    pub fn concede(&mut self) {
        self.order(Command::Concede);
    }
    /// Attack-move for a selection: together, at the pace of its slowest unit.
    #[wasm_bindgen(js_name = attackMoveGroup)]
    pub fn attack_move_group(&mut self, units: &[u32], x: f64, y: f64) {
        self.order(Command::GroupAttackMove {
            units: units.to_vec(),
            x,
            y,
        });
    }
    pub fn formation(&mut self, units: &[u32], x: f64, y: f64) {
        self.order(Command::Formation {
            units: units.to_vec(),
            x,
            y,
        });
    }
    /// Every unit of `units` that has the ability (by key) and can use it now does; "" = used, else why not.
    pub fn cast(&mut self, units: &[u32], ability: &str) -> String {
        let Some(ability) = data::AbilityKind::parse(ability) else {
            return "Unknown ability".into();
        };
        let cmd = Command::Cast {
            units: units.to_vec(),
            ability,
        };
        res(self.w.apply(self.me, &cmd))
    }
    /// Log every order given from now on (with its tick), for replays and desync reports.
    pub fn record(&mut self, on: bool) {
        self.w.record(on);
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

    /// Set a building's hp, within 1..max (tests and tools only).
    #[wasm_bindgen(js_name = debugSetHp)]
    pub fn debug_set_hp(&mut self, bldg: u32, hp: f64) {
        if let Some(b) = self.w.bldgs.iter_mut().find(|b| b.id == bldg)
            && hp.is_finite()
        {
            b.hp = hp.clamp(1.0, b.maxhp);
        }
    }

    /// Put a unit on the map (tests and tools only). Returns its id, or 0 for an unknown kind or team.
    #[wasm_bindgen(js_name = debugSpawn)]
    pub fn debug_spawn(&mut self, team: u8, kind: &str, x: f64, y: f64) -> u32 {
        let (Some(k), Some(t)) = (UnitKind::parse(kind), valid_team(team)) else {
            return 0;
        };
        let id = self.w.make_unit(k, t, data::clamp_x(x), data::clamp_y(y));
        self.w.recalc_supply(t);
        id
    }

    /// Switch the opponent off (tests and tools only).
    #[wasm_bindgen(js_name = disableAi)]
    pub fn disable_ai(&mut self) {
        self.w.disable_ai();
    }

    /// The guided first game: hold the opponent's waves back (until 6:00 at most), or let them come. A setup knob, not a
    /// command: a replay of a guided game does not carry it.
    #[wasm_bindgen(js_name = holdWaves)]
    pub fn hold_waves(&mut self, on: bool) {
        self.w.hold_waves = on;
    }

    /// Set a team's resources (tests and tools only).
    #[wasm_bindgen(js_name = setResources)]
    pub fn set_resources(&mut self, team: u8, shards: i32, ether: i32) {
        self.w.res[team as usize & 1] = [shards, ether];
    }

    /// The world's scalars (fields: snapshot::INFO_FIELDS), then the upgrade levels (snapshot::push_upgrades).
    pub fn info(&self) -> Vec<f64> {
        let mut out = Vec::with_capacity(snapshot::INFO_FIELDS.len() + 2 * data::UPGRADES.len());
        snapshot::push_info(&mut out, &self.w, &self.w);
        snapshot::push_upgrades(&mut out, &self.w);
        out
    }

    /// One record per unit (fields: snapshot::UNIT_FIELDS).
    pub fn units(&self) -> Vec<f64> {
        let mut out = Vec::with_capacity(self.w.units.len() * UNIT_STRIDE);
        for u in &self.w.units {
            snapshot::push_unit(&mut out, u, &self.w);
        }
        out
    }

    /// One record per building (fields: snapshot::BLDG_FIELDS).
    pub fn buildings(&self) -> Vec<f64> {
        let mut out = Vec::with_capacity(self.w.bldgs.len() * BLDG_STRIDE);
        for b in &self.w.bldgs {
            snapshot::push_bldg(&mut out, b, &self.w);
        }
        out
    }

    /// One record per projectile (fields: snapshot::PROJ_FIELDS).
    pub fn projectiles(&self) -> Vec<f64> {
        let mut out = Vec::with_capacity(self.w.projs.len() * PROJ_STRIDE);
        for p in &self.w.projs {
            snapshot::push_proj(&mut out, p, &self.w);
        }
        out
    }

    /// One record per resource node (fields: snapshot::NODE_FIELDS).
    pub fn nodes(&self) -> Vec<f64> {
        let mut out = Vec::with_capacity(self.w.map.nodes.len() * NODE_STRIDE);
        for n in &self.w.map.nodes {
            snapshot::push_node(&mut out, n, &self.w);
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
    /// `team`'s army value every 10 s since the start (the end screen's chart).
    #[wasm_bindgen(js_name = armyLog)]
    pub fn army_log(&self, team: u8) -> Vec<u32> {
        valid_team(team).map_or_else(Vec::new, |t| self.w.army_log[t as usize].clone())
    }
    /// Tiles `team` has ever seen.
    pub fn explored(&self, team: u8) -> Vec<u8> {
        self.w.explored[team as usize & 1].clone()
    }

    /// Events since the last call, as a JSON array of {t:'sfx'|'toast'|'burst'|'hit', ...}.
    #[wasm_bindgen(js_name = drainEvents)]
    pub fn drain_events(&mut self) -> String {
        let me = self.me;
        let parts: Vec<String> = self
            .w
            .events
            .drain(..)
            .filter_map(|e| match e {
                Event::Sfx { team, .. }
                | Event::Toast { team, .. }
                | Event::Attacked { team, .. }
                    if team != me =>
                {
                    None
                }
                Event::Fire { seen, .. } | Event::Cast { seen, .. } if !seen[me as usize] => None,
                e => Some(e),
            })
            .map(|e| event_json(&e))
            .collect();
        format!("[{}]", parts.join(","))
    }
}

/// One event as the JSON object the client reads (`t`: its type; see src/main.js).
fn event_json(e: &Event) -> String {
    use data::Obj;
    let o = |t: &str| Obj::new().str("t", t);
    match e {
        Event::Sfx { name, .. } => o("sfx").str("name", name),
        Event::Toast { msg, bad, .. } => o("toast").str("msg", msg).num("bad", bad),
        Event::Burst { x, y, r, team, n } => o("burst")
            .num("x", x)
            .num("y", y)
            .num("r", r)
            .num("team", team)
            .num("n", n),
        Event::Attacked { x, y, building, .. } => o("attacked")
            .num("x", x)
            .num("y", y)
            .num("building", building),
        Event::Heal { x, y, tx, ty, mend } => o("heal")
            .num("x", x)
            .num("y", y)
            .num("tx", tx)
            .num("ty", ty)
            .num("mend", mend),
        Event::Hit { x, y, big } => o("hit").num("x", x).num("y", y).num("big", big),
        Event::Fire { x, y, weapon, .. } => o("fire").num("x", x).num("y", y).str("w", weapon),
        Event::Cast { x, y, ability, .. } => {
            o("cast").num("x", x).num("y", y).str("ability", ability)
        }
    }
    .done()
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

/// The first `n` raw outputs of the seeded RNG (the client's `mulberry` in util.js produces the same stream).
#[wasm_bindgen(js_name = rngSequence)]
pub fn rng_sequence(seed: u32, n: u32) -> Vec<u32> {
    let mut r = Mulberry32::new(seed);
    (0..n).map(|_| r.next_u32()).collect()
}

/// The snapshot record layouts and code names as JSON (build:wasm puts them in src/engine/pkg/data.js).
#[wasm_bindgen(js_name = schemaJson)]
pub fn schema_json() -> String {
    snapshot::schema_json()
}

/// The game's data tables as JSON (written to src/engine/pkg/data.js by build:wasm: the client's only source of them).
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
    fn a_game_passes_on_only_its_own_seats_news() {
        let mut g = Game::new(1, 0);
        g.w.events.clear();
        g.w.toast(ENEMY, "theirs", false);
        g.w.toast(PLAYER, "mine", false);
        g.w.sfx(ENEMY, "coin");
        g.w.emit(Event::Fire {
            x: 1.0,
            y: 2.0,
            weapon: "bolt",
            seen: [false, true],
        });
        g.w.emit(Event::Fire {
            x: 3.0,
            y: 4.0,
            weapon: "shell",
            seen: [true, true],
        });
        let out = g.drain_events();
        assert!(
            out.contains("mine") && !out.contains("theirs") && !out.contains("coin"),
            "{out}"
        );
        assert!(
            out.contains("shell") && !out.contains("bolt"),
            "only shots this seat sees: {out}"
        );
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
