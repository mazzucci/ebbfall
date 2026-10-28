//! Endfall simulation in Rust, compiled to WASM for the browser.
//!
//! Originally a bit-exact port of the prototype's JS sim (it keeps JS arithmetic: see jsmath.rs). The rules from
//! CLAUDE.md apply: fixed tick, all randomness from the
//! seeded RNG, no wall clock, iterate `Vec`s (never `HashMap`s) where order affects results. The JS client talks
//! to it only through the `#[wasm_bindgen]` surface below; `src/engine/` wraps that in the shape the client uses.

mod ai;
pub mod data;
pub mod jsmath;
mod lockstep;
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
    /// Watching the game just played again: its log, the next entry to apply, and the tick it ended on.
    replay: Option<Replay>,
    /// A knob outside the log was used (the guided game's hold, a debug setter): the log is not the whole game, so
    /// no replay.
    untracked: bool,
    /// A networked game: orders go out to the relay and come back scheduled (lockstep.rs).
    lock: Option<lockstep::Lockstep>,
}

struct Replay {
    log: Vec<world::Logged>,
    next: usize,
    end: u32,
}

impl Game {
    fn wrap(mut w: World) -> Game {
        w.record(true); // every game can be watched again
        Game {
            w,
            me: data::PLAYER,
            replay: None,
            untracked: false,
            lock: None,
        }
    }

    /// An order from this Game's player, applied for its seat (orders for anything else are ignored); none while a
    /// replay plays (the log is the game).
    fn apply(&mut self, cmd: &Command) -> Result<(), String> {
        if self.replay.is_some() {
            return Err("Watching a replay".into());
        }
        if let Some(sent) = self.send(cmd) {
            return sent; // (it runs when the relay sends it back)
        }
        self.w.apply(self.me, cmd)
    }

    /// Whether a knob outside the log may be used (never in a networked game: every world must stay the same).
    fn knob(&mut self) -> bool {
        self.untracked = true;
        self.lock.is_none()
    }

    fn order(&mut self, cmd: Command) {
        let _ = self.apply(&cmd);
    }
}

fn res(r: Result<(), String>) -> String {
    r.err().unwrap_or_default()
}

impl Game {
    /// Seats from JS are validated here: an out-of-range index would panic, and a panic poisons the Game object.
    pub(crate) fn valid_team(&self, t: u8) -> Option<u8> {
        ((t as usize) < self.w.seats()).then_some(t)
    }

    /// `withSeats` with every AI at the game's `diff` (Rust callers; JS leaves `diffs` out).
    #[allow(clippy::too_many_arguments)]
    pub fn with_seats(
        seed: u32,
        diff: u32,
        map: u32,
        side: u32,
        factions: &[u32],
        teams: &[u8],
        ai: &[u8],
        me: u8,
        size: Option<u32>,
    ) -> Result<Game, String> {
        Game::with_seat_diffs(seed, diff, map, side, factions, teams, ai, me, size, None)
    }
}

/// A race by index into FACTIONS (unknown = Humans).
fn faction(i: u32) -> &'static data::Faction {
    data::FACTIONS.get(i as usize).unwrap_or(&data::FACTIONS[0])
}

#[wasm_bindgen]
impl Game {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u32, diff: u32) -> Game {
        Game::wrap(World::new(seed, diff as usize))
    }

    /// A new game with the races chosen (index into FACTIONS for the player and for the AI; unknown = Humans).
    #[wasm_bindgen(js_name = withSetup)]
    pub fn with_setup(seed: u32, diff: u32, map: u32, side: u32, player: u32, ai: u32) -> Game {
        let f = [faction(player), faction(ai)]; // (the player is seat 0)
        Game::wrap(World::with_setup(
            seed,
            diff as usize,
            map::MapKind::from_index(map),
            side == 1,
            f,
        ))
    }

    /// `withSetup` on a map of `size` x `size` tiles, 64, 96 or 128 (throws otherwise): two seats on a map with all its
    /// starts (`side` turns them round it), the rest free ground. Single player's duel on any map.
    #[wasm_bindgen(js_name = withSize)]
    #[allow(clippy::too_many_arguments)]
    pub fn with_size(
        seed: u32,
        diff: u32,
        map: u32,
        side: u32,
        player: u32,
        ai: u32,
        size: u32,
    ) -> Result<Game, String> {
        if ![64, 96, 128].contains(&size) {
            return Err(format!("A {size}x{size} map: 64, 96 or 128 tiles across"));
        }
        Ok(Game::wrap(World::with_size(
            seed,
            diff as usize,
            map::MapKind::from_index(map),
            map::MapSize::square(size as i32),
            side,
            &[faction(player), faction(ai)],
        )))
    }

    /// A game for any number of seats, seen from seat `me`: each seat's race (index into FACTIONS), team (empty: each
    /// seat its own) and whether the scripted opponent plays it (1) or a person (0; empty: nobody's an AI), on a map
    /// of `size` x `size` tiles (64, the default, has 2 starts; 96 has 4; 128 has 8); `side` turns the seats round the
    /// starts; `diffs`, each AI seat's own difficulty (empty or left out: every AI plays `diff`). Throws for a setup
    /// the sim cannot play (fewer than 2 seats, more than the map's starts, another size, lists of other lengths, one
    /// team).
    #[wasm_bindgen(js_name = withSeats)]
    #[allow(clippy::too_many_arguments)]
    pub fn with_seat_diffs(
        seed: u32,
        diff: u32,
        map: u32,
        side: u32,
        factions: &[u32],
        teams: &[u8],
        ai: &[u8],
        me: u8,
        size: Option<u32>,
        diffs: Option<Vec<u8>>,
    ) -> Result<Game, String> {
        let n = factions.len();
        let size = size.unwrap_or(64);
        if ![64, 96, 128].contains(&size) {
            return Err(format!("A {size}x{size} map: 64, 96 or 128 tiles across"));
        }
        let size = map::MapSize::square(size as i32);
        let starts = map::max_starts(size).min(data::MAX_SEATS);
        if !(2..=starts).contains(&n) {
            return Err(format!(
                "{n} seats: a {}x{} map has {starts} starts",
                size.w, size.h
            ));
        }
        if (me as usize) >= n || ![0, n].contains(&ai.len()) || ![0, n].contains(&teams.len()) {
            return Err("A seat list of the wrong length, or no such seat".into());
        }
        let f: Vec<_> = factions.iter().map(|&i| faction(i)).collect();
        // With teams, the seats turn round the ring by whole starts only (`side % k`): turning the pattern among the
        // seats too (`seat_starts`' `side / k`) would split a team of consecutive seats round a free start (six seats
        // on eight starts sit on 0, 1, 2 and 4, 5, 6: three against three must take one group each).
        let teamed = (0..teams.len()).any(|a| (a + 1..teams.len()).any(|b| teams[a] == teams[b])); // (two seats sharing a team)
        let side = if teamed { side % starts as u32 } else { side };
        let mut w = World::with_size(
            seed,
            diff as usize,
            map::MapKind::from_index(map),
            size,
            side,
            &f,
        );
        if !teams.is_empty() && !w.set_teams(teams) {
            return Err(
                "Teams: an id per seat, below the number of seats, two teams at least".into(),
            );
        }
        if !w.set_diffs(diffs.as_deref().unwrap_or(&[])) {
            return Err("A difficulty list of the wrong length".into());
        }
        let ai: Vec<bool> = (0..n).map(|s| ai.get(s).is_some_and(|&a| a != 0)).collect();
        w.set_ai_seats(ai);
        let mut g = Game::wrap(w);
        g.me = me;
        Ok(g)
    }

    /// The seat this Game plays: its orders, its fog, its events.
    pub fn me(&self) -> u8 {
        self.me
    }

    /// Advance the world by one fixed tick (in a replay, after the orders logged for this tick; in lockstep, after the
    /// orders scheduled for it, and only if it may run: see `canStep`).
    pub fn step(&mut self) {
        if !self.can_step() {
            return;
        }
        self.run_due();
        if let Some(r) = &mut self.replay {
            while let Some((tick, seat, cmd)) = r.log.get(r.next)
                && *tick == self.w.tick
            {
                let _ = self.w.apply(*seat, cmd);
                r.next += 1;
            }
        }
        self.w.step();
    }

    /// Watch the game played so far again from its first tick: the same setup, the logged orders on their ticks
    /// (the scripted opponent replays itself: it draws only from the world's RNG). Both sides' vision; no orders
    /// taken. False if this game cannot be replayed (nothing logged, or a knob outside the log was used).
    #[wasm_bindgen(js_name = startReplay)]
    pub fn start_replay(&mut self) -> bool {
        if self.lock.is_some() {
            return false; // (a networked game is watched again once it is over: a later step)
        }
        let log = match &self.replay {
            Some(r) => r.log.clone(), // (watching again)
            None => match self.w.log.clone() {
                Some(log) if !self.untracked => log,
                _ => return false,
            },
        };
        let end = self.replay.as_ref().map_or(self.w.tick, |r| r.end);
        let old = &self.w;
        let mut w = World::with_size(
            old.seed,
            old.diff,
            old.map_kind,
            old.map_size,
            old.side,
            &old.factions,
        );
        w.set_teams(&old.teams);
        w.diffs = old.diffs.clone();
        w.set_ai_seats(&old.ai_seats);
        self.w = w;
        self.replay = Some(Replay { log, next: 0, end });
        true
    }

    /// Whether a replay is playing, and the tick it ends on (0 when none).
    #[wasm_bindgen(js_name = replayEnd)]
    pub fn replay_end(&self) -> u32 {
        self.replay.as_ref().map_or(0, |r| r.end)
    }

    pub fn tick(&self) -> u32 {
        self.w.tick
    }

    /// The difficulty seat `seat`'s AI plays at (its own, else the game's; 0 for no such seat).
    #[wasm_bindgen(js_name = diffOf)]
    pub fn diff_of(&self, seat: u8) -> u32 {
        self.valid_team(seat)
            .map_or(0, |s| self.w.diff_of(s) as u32)
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
            self.valid_team(team).filter(|&t| t == self.me),
        ) else {
            return "Unknown building or team".into();
        };
        let builder = (builder != 0).then_some(builder);
        res(self.apply(&Command::Place {
            kind,
            tx,
            ty,
            builder,
        }))
    }
    #[wasm_bindgen(js_name = queueUnit)]
    pub fn queue_unit(&mut self, bldg: u32, kind: &str) -> String {
        let Some(kind) = UnitKind::parse(kind) else {
            return "Unknown unit".into();
        };
        res(self.apply(&Command::Queue { bldg, kind }))
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
        res(self.apply(&Command::Research { bldg, up }))
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
    /// This seat gives up: it is out (with two seats, the game ends and the other wins).
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
        res(self.apply(&cmd))
    }
    /// Log every order given from now on (with its tick), for replays and desync reports.
    pub fn record(&mut self, on: bool) {
        if !self.knob() {
            return; // (a networked game's log is the game)
        }
        self.w.record(on);
    }

    // ---- rule queries ----
    #[wasm_bindgen(js_name = canPlace)]
    pub fn can_place(&self, kind: &str, tx: i32, ty: i32, team: u8) -> bool {
        self.valid_team(team)
            .is_some_and(|t| BldgKind::parse(kind).is_some_and(|k| self.w.can_place(k, tx, ty, t)))
    }
    #[wasm_bindgen(js_name = hasReq)]
    pub fn has_req(&self, team: u8, kind: &str) -> bool {
        self.valid_team(team)
            .is_some_and(|t| BldgKind::parse(kind).is_some_and(|k| self.w.has_req(t, k)))
    }
    #[wasm_bindgen(js_name = canAfford)]
    pub fn can_afford(&self, team: u8, shards: i32, ether: i32) -> bool {
        self.valid_team(team)
            .is_some_and(|t| self.w.can_afford(t, [shards, ether]))
    }

    /// Set a building's hp, within 1..max (tests and tools only).
    #[wasm_bindgen(js_name = debugSetHp)]
    pub fn debug_set_hp(&mut self, bldg: u32, hp: f64) {
        if !self.knob() {
            return;
        }
        if let Some(b) = self.w.bldgs.iter_mut().find(|b| b.id == bldg)
            && hp.is_finite()
        {
            b.hp = hp.clamp(1.0, b.maxhp);
        }
    }

    /// Put a unit on the map (tests and tools only). Returns its id, or 0 for an unknown kind or team.
    #[wasm_bindgen(js_name = debugSpawn)]
    pub fn debug_spawn(&mut self, team: u8, kind: &str, x: f64, y: f64) -> u32 {
        if !self.knob() {
            return 0;
        }
        let (Some(k), Some(t)) = (UnitKind::parse(kind), self.valid_team(team)) else {
            return 0;
        };
        let (x, y) = (self.w.map.clamp_x(x), self.w.map.clamp_y(y));
        let id = self.w.make_unit(k, t, x, y);
        self.w.recalc_supply(t);
        id
    }

    /// Give a seat an upgrade's level (tests and tools only; a set-up, not a command). Returns false for an unknown
    /// upgrade or team, or a level it does not have.
    #[wasm_bindgen(js_name = debugResearch)]
    pub fn debug_research(&mut self, team: u8, key: &str, level: u8) -> bool {
        if !self.knob() {
            return false;
        }
        let (Some(up), Some(t)) = (data::Upgrade::parse(key), self.valid_team(team)) else {
            return false;
        };
        if level > up.levels() {
            return false;
        }
        self.w.upgrades[t as usize][up.index()] = level;
        true
    }

    /// Switch the opponent off (tests and tools only).
    #[wasm_bindgen(js_name = disableAi)]
    pub fn disable_ai(&mut self) {
        if !self.knob() {
            return;
        }
        self.w.disable_ai();
    }

    /// The guided first game: hold the opponent's waves back (until 6:00 at most), or let them come. A setup knob, not a
    /// command: a replay of a guided game does not carry it.
    #[wasm_bindgen(js_name = holdWaves)]
    pub fn hold_waves(&mut self, on: bool) {
        if self.lock.is_some() {
            return;
        }
        self.untracked |= on;
        self.w.hold_waves = on;
    }

    /// Set a team's resources (tests and tools only).
    #[wasm_bindgen(js_name = setResources)]
    pub fn set_resources(&mut self, team: u8, shards: i32, ether: i32) {
        if !self.knob() {
            return;
        }
        if let Some(t) = self.valid_team(team) {
            self.w.res[t as usize] = [shards, ether];
        }
    }

    /// The world's scalars (fields: snapshot::INFO_FIELDS), then a record per seat (snapshot::SEAT_FIELDS), then
    /// the upgrade levels (snapshot::push_upgrades).
    pub fn info(&self) -> Vec<f64> {
        let n = self.w.seats();
        let mut out = Vec::with_capacity(
            snapshot::INFO_FIELDS.len() + n * (snapshot::SEAT_FIELDS.len() + data::UPGRADES.len()),
        );
        snapshot::push_info(&mut out, &self.w, &self.w);
        for seat in 0..n as u8 {
            snapshot::push_seat(&mut out, &seat, &self.w);
        }
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

    /// The map's width in tiles (every per-tile list is `mapW * mapH`, row by row). Fixed for the whole game.
    #[wasm_bindgen(js_name = mapW)]
    pub fn map_w(&self) -> i32 {
        self.w.map.w
    }
    /// The map's height in tiles.
    #[wasm_bindgen(js_name = mapH)]
    pub fn map_h(&self) -> i32 {
        self.w.map.h
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
    /// Tiles `team` sees right now, with its allies (they share vision; in a replay: what any seat sees).
    pub fn vis(&self, team: u8) -> Vec<u8> {
        self.sight(&self.w.vis, team)
    }
    /// `team`'s army value every 10 s since the start (the end screen's chart).
    #[wasm_bindgen(js_name = armyLog)]
    pub fn army_log(&self, team: u8) -> Vec<u32> {
        self.valid_team(team)
            .map_or_else(Vec::new, |t| self.w.army_log[t as usize].clone())
    }
    /// `team`'s units lost, by what killed them (unit kinds, then building kinds; empty before any loss).
    #[wasm_bindgen(js_name = lostTo)]
    pub fn lost_to(&self, team: u8) -> Vec<u32> {
        self.valid_team(team)
            .map_or_else(Vec::new, |t| self.w.lost_to[t as usize].clone())
    }
    /// Tiles `team` or an ally has ever seen (in a replay: any seat).
    pub fn explored(&self, team: u8) -> Vec<u8> {
        self.sight(&self.w.explored, team)
    }

    fn sight(&self, layers: &[Vec<u8>], team: u8) -> Vec<u8> {
        if self.replay.is_some() {
            let mut all = layers[0].clone();
            for l in &layers[1..] {
                all.iter_mut().zip(l).for_each(|(a, b)| *a |= b);
            }
            all
        } else {
            self.valid_team(team)
                .map_or_else(|| vec![0; layers[0].len()], |t| layers[t as usize].clone())
        }
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
                | Event::Ping { team, .. }
                | Event::Attacked { team, .. }
                    if team != me =>
                {
                    None
                }
                Event::Fire { seen, .. } | Event::Cast { seen, .. }
                    if (seen >> me) & 1 == 0 && self.replay.is_none() =>
                {
                    None
                }
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
        Event::Ping { x, y, .. } => o("ping").num("x", x).num("y", y),
        Event::Burst { x, y, r, team, n } => o("burst")
            .num("x", x)
            .num("y", y)
            .num("r", r)
            .num("team", team)
            .num("n", n),
        Event::Attacked {
            x,
            y,
            building,
            unseen,
            ..
        } => o("attacked")
            .num("x", x)
            .num("y", y)
            .num("building", building)
            .num("unseen", unseen),
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

/// A map's layout for the menu's thumbnail, generated alone (no game): one byte per tile, row by row, on a map of
/// `size` x `size` tiles (64, the default: a duel's two starts; 96: four starts, for three or four seats; 128: eight;
/// any other size: 64) with every start the size has: 0 open ground, 1 rock, 2 shards, 3 an ether vent, 4 a starting
/// base (all starts alike: which is whose is drawn each game).
#[wasm_bindgen(js_name = mapPreview)]
pub fn map_preview(seed: u32, kind: u32, size: Option<u32>) -> Vec<u8> {
    let mut next_id = 1;
    let size = match size {
        Some(n @ (96 | 128)) => map::MapSize::square(n as i32),
        _ => map::MapSize::DUEL,
    };
    let starts = map::max_starts(size);
    let m = map::Map::generate(
        seed,
        map::MapKind::from_index(kind),
        size,
        starts,
        &mut next_id,
    );
    let mut g = m.rock.clone();
    let mut mark = |x: i32, y: i32, v: u8| {
        if m.in_map(x, y) {
            g[m.idx(x, y)] = v;
        }
    };
    for n in &m.nodes {
        let (size, v) = if n.ether { (2, 3) } else { (1, 2) };
        for dy in 0..size {
            for dx in 0..size {
                mark(n.tx + dx, n.ty + dy, v);
            }
        }
    }
    for &(bx, by) in &m.bases {
        for dy in 0..4 {
            for dx in 0..4 {
                mark(bx + dx, by + dy, 4);
            }
        }
    }
    debug_assert_eq!(g.len(), (size.w * size.h) as usize);
    g
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
            seen: 0b10,
        });
        g.w.emit(Event::Fire {
            x: 3.0,
            y: 4.0,
            weapon: "shell",
            seen: 0b11,
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
    fn an_unseen_alert_reaches_the_client_flagged() {
        let mut g = Game::new(5, 1);
        for unseen in [true, false] {
            g.w.emit(Event::Attacked {
                team: PLAYER,
                x: 1.0,
                y: 2.0,
                building: false,
                unseen,
            });
        }
        let out = g.drain_events();
        assert!(
            out.contains("\"unseen\":true") && out.contains("\"unseen\":false"),
            "{out}"
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
