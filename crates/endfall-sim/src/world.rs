//! The world and the rules that change it: entities, placement, economy, supply, production, fog of war,
//! combat, orders and the per-tick update. A port of src/sim/{state,commands,update}.js that keeps the JS
//! evaluation order (including the order of RNG draws and stable sorts) so per-tick state hashes match.
//!
//! Entities refer to each other by id. Units, buildings and nodes are each kept sorted by id (ids only grow
//! and removal preserves order), so lookups are binary searches and "not found" means "dead".

use crate::data::*;
use crate::jsmath::{self, PI, clamp, dist};
use crate::map::{Id, Map, idx, in_map};
use crate::path::{PathScratch, Pt, astar};
use crate::rng::Mulberry32;

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

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Task {
    Idle,
    Hold,
    Move { x: f64, y: f64 },
    AMove { x: f64, y: f64 },
    Attack { target: Id, back: Option<Back> },
    Gather { node: Id, phase: Phase, timer: f64 },
    Build { b: Id },
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
}

/// A builder that stays within STUCK_RADIUS px of one spot for BUILDER_PATIENCE seconds without reaching its
/// site gives up. Walking (even away from the site, around an obstacle) leaves the radius within a fraction of a
/// second; jittering against a corner or being walled in does not.
pub const BUILDER_PATIENCE: f64 = 6.0;
pub const STUCK_RADIUS: f64 = 12.0;

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
}

#[derive(Clone, Debug, PartialEq)]
pub enum Event {
    /// A Medic healing: from (x, y) to the patient at (tx, ty).
    Heal {
        x: f64,
        y: f64,
        tx: f64,
        ty: f64,
    },
    Sfx(&'static str),
    Toast {
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
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Stats {
    pub built: u32,
    pub lost: u32,
    pub killed: u32,
    pub razed: u32,
}

pub(crate) struct Ai {
    pub t: f64,
    pub wave: usize,
    pub last_wave: f64,
    pub attacking: bool,
    pub attackers: Option<Vec<Id>>,
    pub rally: Option<Pt>,
    /// Own buildings under construction: (id, progress last seen, time it last advanced).
    pub sites: Vec<(Id, f64, f64)>,
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
    pub stats: Stats,
    pub events: Vec<Event>,
    pub map: Map,
    pub(crate) ai: Option<Ai>,
    pub(crate) rng: Mulberry32,
    next_id: Id,
    scratch: PathScratch,
    hash: Vec<Vec<Id>>,
    /// Units killed since the spatial hash was built. The JS hash keeps references to them, and separation
    /// still pushes against their last position, so the port keeps them around until the next rebuild.
    graveyard: Vec<Unit>,
}

impl World {
    pub fn new(seed: u32, diff: usize) -> World {
        let n = (MW * MH) as usize;
        let mut w = World {
            seed,
            diff,
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
            stats: Stats::default(),
            events: Vec::new(),
            map: Map::empty(),
            ai: None,
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
        self.stats = Stats::default();
        self.events.clear();
        self.map = Map::generate(seed, &mut self.next_id);
        for team in [PLAYER, ENEMY] {
            let (bx, by) = BASES[team as usize];
            self.make_building(BldgKind::Core, team, bx, by, true);
            for i in 0..4 {
                let f = self
                    .map
                    .nearest_free(bx - 1 + (i % 2) * 6, by + 4 + (i >> 1) * 2, 4)
                    .unwrap_or((bx, by + 5));
                let u = self.make_unit(
                    UnitKind::Harvester,
                    team,
                    f.0 as f64 * TILE + 16.0,
                    f.1 as f64 * TILE + 16.0,
                );
                let (ux, uy) = (self.units.last().unwrap().x, self.units.last().unwrap().y);
                if let Some(n) = self.nearest_node(ux, uy, team, false, 900.0) {
                    self.start_gather(u, n);
                }
            }
            self.recalc_supply(team);
        }
        self.init_ai();
        self.update_fog();
    }

    pub(crate) fn emit(&mut self, e: Event) {
        self.events.push(e);
    }
    fn toast(&mut self, msg: impl Into<String>, bad: bool) {
        self.emit(Event::Toast {
            msg: msg.into(),
            bad,
        });
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
    fn u(&self, id: Id) -> &Unit {
        &self.units[self.ui(id).expect("live unit")]
    }
    fn um(&mut self, id: Id) -> &mut Unit {
        let i = self.ui(id).expect("live unit");
        &mut self.units[i]
    }
    pub fn bldg(&self, id: Id) -> Option<&Bldg> {
        self.bi(id).map(|i| &self.bldgs[i])
    }
    fn bm(&mut self, id: Id) -> Option<&mut Bldg> {
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
            return Some(Geo::Rect {
                tx: b.tx,
                ty: b.ty,
                w: b.w,
                h: b.h,
                x: b.x,
                y: b.y,
                r: b.r,
            });
        }
        self.map.node(id).map(|n| Geo::Round {
            x: n.x,
            y: n.y,
            r: n.r,
        })
    }
    fn extractor_ready(&self, node: Id, team: Option<u8>) -> bool {
        let Some(n) = self.map.node(node) else {
            return false;
        };
        match n.extractor.and_then(|e| self.bldg(e)) {
            Some(b) => b.done && team.is_none_or(|t| b.team == t),
            None => false,
        }
    }

    // ---- spatial hash (rebuilt every tick) ----
    fn cell(x: f64, y: f64) -> (i32, i32) {
        (jsmath::to_i32(x / 64.0), jsmath::to_i32(y / 64.0))
    }
    fn rebuild_hash(&mut self) {
        for c in self.hash.iter_mut() {
            c.clear();
        }
        self.graveyard.clear();
        for u in &self.units {
            let (cx, cy) = Self::cell(u.x, u.y);
            let (cx, cy) = (cx.clamp(0, GRID - 1), cy.clamp(0, GRID - 1));
            self.hash[(cy * GRID + cx) as usize].push(u.id);
        }
    }
    fn nearby(&self, x: f64, y: f64, rad: f64) -> Vec<Id> {
        let mut out = Vec::new();
        let c = (rad / 64.0).ceil() as i32;
        let (cx, cy) = Self::cell(x, y);
        for dy in -c..=c {
            for dx in -c..=c {
                let (gx, gy) = (cx + dx, cy + dy);
                if gx >= 0 && gy >= 0 && gx < GRID && gy < GRID {
                    out.extend_from_slice(&self.hash[(gy * GRID + gx) as usize]);
                }
            }
        }
        out
    }
    /// A unit from the hash: alive, or killed earlier this tick.
    fn hashed(&self, id: Id) -> Option<&Unit> {
        self.unit(id)
            .or_else(|| self.graveyard.iter().find(|u| u.id == id))
    }

    // ---- entities ----
    pub fn make_unit(&mut self, kind: UnitKind, team: u8, x: f64, y: f64) -> Id {
        let d = kind.def();
        let id = self.next_id;
        self.next_id += 1;
        self.units.push(Unit {
            id,
            kind,
            team,
            x,
            y,
            hp: d.hp,
            maxhp: d.hp,
            r: d.r,
            task: Task::Idle,
            path: None,
            cd: 0.0,
            face: if team != 0 { PI } else { 0.0 },
            carry: 0,
            carry_ether: None,
            last_node: None,
            repath: 0.0,
            flash: 0.0,
            aggro_cd: 0.0,
            stuck: 0.0,
            anchor: (x, y),
            no_build_until: 0.0,
        });
        id
    }

    pub fn make_building(&mut self, kind: BldgKind, team: u8, tx: i32, ty: i32, done: bool) -> Id {
        let d = kind.def();
        let id = self.next_id;
        self.next_id += 1;
        let mut b = Bldg {
            id,
            kind,
            team,
            tx,
            ty,
            w: d.w,
            h: d.h,
            x: (tx as f64 + d.w as f64 / 2.0) * TILE,
            y: (ty as f64 + d.h as f64 / 2.0) * TILE,
            hp: if done { d.hp } else { (d.hp * 0.1).max(10.0) },
            maxhp: d.hp,
            progress: if done { 1.0 } else { 0.0 },
            done,
            queue: Vec::new(),
            prog: 0.0,
            rally: None,
            cd: 0.0,
            flash: 0.0,
            r: d.w.max(d.h) as f64 * TILE / 2.0,
            vent: None,
            aim: 0.0,
        };
        for y in 0..d.h {
            for x in 0..d.w {
                let i = idx(tx + x, ty + y);
                if self.map.occ[i] < 0 && d.on_vent {
                    let nid = (-self.map.occ[i]) as Id;
                    if let Some(nd) = self.map.node_mut(nid) {
                        nd.extractor = Some(id);
                        b.vent = Some(nid);
                    }
                }
                self.map.occ[i] = id as i32;
            }
        }
        // Nudge units standing in the footprint.
        for k in 0..self.units.len() {
            let (tx2, ty2) = (
                jsmath::to_i32(self.units[k].x / TILE),
                jsmath::to_i32(self.units[k].y / TILE),
            );
            if !self.units[k].kind.def().air
                && tx2 >= tx
                && tx2 < tx + d.w
                && ty2 >= ty
                && ty2 < ty + d.h
                && let Some(f) = self.map.nearest_free(tx2, ty2, 4)
            {
                self.units[k].x = f.0 as f64 * TILE + 16.0;
                self.units[k].y = f.1 as f64 * TILE + 16.0;
            }
        }
        self.bldgs.push(b);
        self.recalc_supply(team);
        id
    }

    pub fn can_place(&self, kind: BldgKind, tx: i32, ty: i32, team: u8) -> bool {
        let d = kind.def();
        if !in_map(tx, ty) || !in_map(tx + d.w - 1, ty + d.h - 1) {
            return false;
        }
        if d.on_vent {
            let nd = self
                .map
                .nodes
                .iter()
                .find(|n| n.ether && n.tx == tx && n.ty == ty);
            return match nd {
                Some(n) => {
                    n.extractor.is_none() && (team != PLAYER || self.explored[0][idx(tx, ty)] != 0)
                }
                None => false,
            };
        }
        for y in -1..=d.h {
            for x in -1..=d.w {
                let (xx, yy) = (tx + x, ty + y);
                if !in_map(xx, yy) {
                    continue;
                }
                let i = idx(xx, yy);
                let edge = x < 0 || y < 0 || x >= d.w || y >= d.h;
                if edge {
                    if self.map.occ[i] < 0 {
                        return false;
                    }
                    continue;
                }
                if self.map.rock[i] != 0 || self.map.occ[i] != 0 {
                    return false;
                }
                if team == PLAYER && self.explored[0][i] == 0 {
                    return false;
                }
            }
        }
        true
    }

    pub fn has_req(&self, team: u8, kind: BldgKind) -> bool {
        match kind.def().req {
            None => true,
            Some(r) => self
                .bldgs
                .iter()
                .any(|b| b.team == team && b.kind == r && b.done),
        }
    }
    pub fn can_afford(&self, team: u8, cost: [i32; 2]) -> bool {
        self.res[team as usize][0] >= cost[0] && self.res[team as usize][1] >= cost[1]
    }
    fn pay(&mut self, team: u8, cost: [i32; 2], sign: i32) {
        self.res[team as usize][0] += sign * cost[0];
        self.res[team as usize][1] += sign * cost[1];
    }
    fn short_of(&self, team: u8, cost: [i32; 2]) -> String {
        format!(
            "Not enough {}",
            if self.res[team as usize][0] < cost[0] {
                "shards"
            } else {
                "ether"
            }
        )
    }

    pub fn recalc_supply(&mut self, team: u8) {
        let (mut used, mut cap) = (0, 0);
        for u in self.units.iter().filter(|u| u.team == team) {
            used += u.kind.def().supply;
        }
        for b in self.bldgs.iter().filter(|b| b.team == team) {
            if b.done {
                cap += b.kind.def().supply;
            }
            for q in &b.queue {
                used += q.def().supply;
            }
        }
        self.sup[team as usize] = [used, cap.min(200)];
    }

    /// Queue a unit at a building; Err carries the message to show.
    pub fn queue_unit(&mut self, bid: Id, kind: UnitKind) -> Result<(), String> {
        let Some(b) = self.bldg(bid) else {
            return Err("Gone".into());
        };
        let (team, qlen) = (b.team, b.queue.len());
        if !b.done || !b.kind.def().trains.contains(&kind) {
            return Err(format!("{} cannot train that", b.kind.def().name));
        }
        let d = kind.def();
        if let Some(r) = d.req
            && !self
                .bldgs
                .iter()
                .any(|o| o.team == team && o.kind == r && o.done)
        {
            return Err(format!("Requires {}", r.def().name));
        }
        if qlen >= 5 {
            return Err("Queue is full".into());
        }
        if !self.can_afford(team, d.cost) {
            return Err(self.short_of(team, d.cost));
        }
        let s = self.sup[team as usize];
        if s[0] + d.supply > s[1] {
            return Err("Supply blocked. Build a Depot.".into());
        }
        self.pay(team, d.cost, -1);
        self.bm(bid).unwrap().queue.push(kind);
        self.recalc_supply(team);
        Ok(())
    }

    pub fn cancel_queue(&mut self, bid: Id, i: usize) {
        let Some(b) = self.bm(bid) else { return };
        if i >= b.queue.len() {
            return;
        }
        let t = b.queue.remove(i);
        if i == 0 {
            b.prog = 0.0;
        }
        let team = b.team;
        self.pay(team, t.def().cost, 1);
        self.recalc_supply(team);
    }

    pub fn set_rally(&mut self, bid: Id, x: f64, y: f64, node: Option<Id>) {
        if let Some(b) = self.bm(bid)
            && !b.kind.def().trains.is_empty()
        {
            b.rally = Some(Rally { x, y, node });
        }
    }

    fn spawn_from(&mut self, bid: Id, kind: UnitKind) -> Id {
        let b = self.bldg(bid).unwrap().clone();
        let mut f = None;
        let mut r = 0;
        while r < 6 && f.is_none() {
            let mut cands = Vec::new();
            for y in (b.ty - r - 1)..=(b.ty + b.h + r) {
                for x in (b.tx - r - 1)..=(b.tx + b.w + r) {
                    if x >= b.tx - r
                        && x < b.tx + b.w + r
                        && y >= b.ty - r
                        && y < b.ty + b.h + r
                        && r > 0
                    {
                        continue;
                    }
                    if !self.map.blocked(x, y) {
                        cands.push((x, y));
                    }
                }
            }
            if !cands.is_empty() {
                let rf = match b.rally {
                    Some(rl) => (rl.x, rl.y),
                    None => (
                        b.x,
                        b.y + MH as f64 * TILE * if b.team != 0 { -1.0 } else { 1.0 },
                    ),
                };
                let key = |p: &(i32, i32)| dist(p.0 as f64 * TILE, p.1 as f64 * TILE, rf.0, rf.1);
                cands.sort_by(|p, q| key(p).partial_cmp(&key(q)).unwrap());
                f = Some(cands[0]);
            }
            r += 1;
        }
        let f = f.unwrap_or((b.tx, b.ty + b.h));
        let u = self.make_unit(
            kind,
            b.team,
            f.0 as f64 * TILE + 16.0,
            f.1 as f64 * TILE + 16.0,
        );
        if b.team == PLAYER {
            self.stats.built += 1;
        }
        if let Some(rl) = b.rally {
            match rl.node {
                Some(n) if kind == UnitKind::Harvester => {
                    self.start_gather(u, n);
                }
                _ => self.move_to(u, rl.x, rl.y),
            }
        } else if kind == UnitKind::Harvester && b.kind == BldgKind::Core {
            let (ux, uy) = (self.u(u).x, self.u(u).y);
            if let Some(nd) = self.nearest_node(ux, uy, b.team, false, 900.0) {
                self.start_gather(u, nd);
            }
        }
        self.recalc_supply(b.team);
        u
    }

    // ---- fog of war: one layer per team; rules use team 0's (the human's) like the JS sim ----
    pub fn update_fog(&mut self) {
        for team in 0..2 {
            self.vis[team].fill(0);
            let mut marks: Vec<(f64, f64, f64)> = Vec::new();
            for u in self.units.iter().filter(|u| u.team as usize == team) {
                marks.push((u.x, u.y, u.kind.def().sight));
            }
            for b in self.bldgs.iter().filter(|b| b.team as usize == team) {
                marks.push((b.x, b.y, if b.done { b.kind.def().sight } else { 3.0 }));
            }
            for (x, y, s) in marks {
                let (cx, cy, s2) = (x / TILE, y / TILE, s * s);
                let y0 = jsmath::to_i32(cy - s).max(0);
                let y1 = jsmath::to_i32(cy + s).min(MH - 1);
                let x0 = jsmath::to_i32(cx - s).max(0);
                let x1 = jsmath::to_i32(cx + s).min(MW - 1);
                for ty in y0..=y1 {
                    for tx in x0..=x1 {
                        let (dx, dy) = (tx as f64 + 0.5 - cx, ty as f64 + 0.5 - cy);
                        if dx * dx + dy * dy <= s2 {
                            let i = idx(tx, ty);
                            self.vis[team][i] = 1;
                            self.explored[team][i] = 1;
                        }
                    }
                }
            }
        }
    }

    /// Whether the human player (team 0) can see this unit or building.
    pub fn visible(&self, id: Id) -> bool {
        if let Some(u) = self.unit(id) {
            if u.team == PLAYER {
                return true;
            }
            let tx = jsmath::to_i32(u.x / TILE).clamp(0, MW - 1);
            let ty = jsmath::to_i32(u.y / TILE).clamp(0, MH - 1);
            return self.vis[0][idx(tx, ty)] != 0;
        }
        if let Some(b) = self.bldg(id) {
            if b.team == PLAYER {
                return true;
            }
            for y in 0..b.h {
                for x in 0..b.w {
                    if self.vis[0][idx(b.tx + x, b.ty + y)] != 0 {
                        return true;
                    }
                }
            }
        }
        false
    }

    // ---- combat ----
    /// The best enemy within `range` of (x, y) that a weapon able to hit `hits` = (ground, air) can attack.
    pub fn find_target(
        &self,
        x: f64,
        y: f64,
        team: u8,
        range: f64,
        only_units: bool,
        hits: (bool, bool),
    ) -> Option<Id> {
        let (mut best, mut bd) = (None, 1e9);
        for u in &self.units {
            let air = u.kind.def().air;
            if u.team == team || (air && !hits.1) || (!air && !hits.0) {
                continue;
            }
            let d = dist(u.x, u.y, x, y) - u.r;
            if d < range && d * 0.6 < bd {
                bd = d * 0.6;
                best = Some(u.id);
            }
        }
        if !only_units && hits.0 {
            for b in &self.bldgs {
                if b.team == team {
                    continue;
                }
                let g = Geo::Rect {
                    tx: b.tx,
                    ty: b.ty,
                    w: b.w,
                    h: b.h,
                    x: b.x,
                    y: b.y,
                    r: b.r,
                };
                let d = g.edge_dist(x, y);
                if d < range && d < bd {
                    bd = d;
                    best = Some(b.id);
                }
            }
        }
        best
    }

    /// Whether `shooter` (unit or building) has a weapon that can hit `target` (flying or not).
    pub fn can_hit(&self, shooter: Id, target: Id) -> bool {
        let air = self.unit(target).is_some_and(|u| u.kind.def().air);
        if self.unit(target).is_none() && self.bldg(target).is_none() {
            return false;
        }
        if let Some(u) = self.unit(shooter) {
            u.kind.def().damage_vs(air) > 0.0
        } else {
            self.bldg(shooter)
                .is_some_and(|b| b.kind.def().damage_vs(air) > 0.0)
        }
    }
    /// (can hit ground, can hit air) for a unit kind.
    fn hits_of(kind: UnitKind) -> (bool, bool) {
        let d = kind.def();
        (d.dmg > 0.0, d.dmg_air > 0.0)
    }

    fn damage(&mut self, target: Id, amt: f64, by: Option<Id>) {
        let by = by.filter(|&b| self.team_of(b).is_some());
        if let Some(i) = self.ui(target) {
            let u = &mut self.units[i];
            u.hp -= (amt - u.kind.def().armor).max(1.0);
            u.flash = 0.12;
            if let Some(by) = by {
                let (ux, uy, team) = (u.x, u.y, u.team);
                let by_air = self.unit(by).is_some_and(|b| b.kind.def().air);
                let u = &mut self.units[i];
                match u.task {
                    Task::Idle | Task::AMove { .. }
                        if u.kind != UnitKind::Harvester
                            && u.kind.def().damage_vs(by_air) > 0.0 =>
                    {
                        let back = match u.task {
                            Task::AMove { x, y } => Some(Back { x, y, amove: false }),
                            _ => None,
                        };
                        u.task = Task::Attack { target: by, back };
                    }
                    _ => {}
                }
                for a in self.nearby(ux, uy, 180.0) {
                    if let Some(j) = self.ui(a) {
                        let o = &mut self.units[j];
                        if o.team != team
                            || o.kind == UnitKind::Harvester
                            || o.kind.def().damage_vs(by_air) <= 0.0
                        {
                            continue;
                        }
                        if o.task == Task::Idle {
                            o.task = Task::Attack {
                                target: by,
                                back: None,
                            };
                        }
                    }
                }
            }
            if self.units[self.ui(target).unwrap()].hp <= 0.0 {
                self.kill(target);
            }
        } else if let Some(i) = self.bi(target) {
            let b = &mut self.bldgs[i];
            b.hp -= (amt - b.kind.def().armor).max(1.0);
            b.flash = 0.12;
            if b.hp <= 0.0 {
                self.kill(target);
            }
        }
    }

    fn kill(&mut self, id: Id) {
        let team;
        if let Some(i) = self.ui(id) {
            let u = self.units.remove(i);
            team = u.team;
            if u.last_node.is_some()
                && let Task::Gather {
                    node,
                    phase: Phase::Mine,
                    ..
                } = u.task
                && let Some(n) = self.map.node_mut(node)
            {
                n.miners -= 1;
            }
            self.emit(Event::Burst {
                x: u.x,
                y: u.y,
                r: u.r,
                team,
                n: 10,
            });
            if team == PLAYER {
                self.stats.lost += 1;
            } else {
                self.stats.killed += 1;
            }
            self.emit(Event::Sfx(if team == PLAYER { "lost" } else { "kill" }));
            self.graveyard.push(u);
        } else if let Some(i) = self.bi(id) {
            let b = self.bldgs.remove(i);
            team = b.team;
            for y in 0..b.h {
                for x in 0..b.w {
                    self.map.occ[idx(b.tx + x, b.ty + y)] = b.vent.map_or(0, |v| -(v as i32));
                }
            }
            if let Some(n) = b.vent.and_then(|v| self.map.node_mut(v)) {
                n.extractor = None;
            }
            for q in &b.queue {
                self.pay(team, q.def().cost, 1);
            }
            for u in self.units.iter_mut() {
                if u.task == (Task::Build { b: id }) {
                    u.task = Task::Idle;
                }
            }
            self.emit(Event::Burst {
                x: b.x,
                y: b.y,
                r: b.r,
                team,
                n: 24,
            });
            if team != PLAYER {
                self.stats.razed += 1;
            }
            self.emit(Event::Sfx("boom"));
            if team == PLAYER {
                self.toast(format!("{} destroyed", b.kind.def().name), true);
            }
        } else {
            return;
        }
        self.recalc_supply(team);
        self.check_end();
    }

    fn check_end(&mut self) {
        if self.over {
            return;
        }
        let pb = self.bldgs.iter().any(|b| b.team == PLAYER);
        let eb = self.bldgs.iter().any(|b| b.team == ENEMY);
        if !eb {
            self.over = true;
            self.winner = PLAYER as i32;
        } else if !pb
            && !self
                .units
                .iter()
                .any(|u| u.team == PLAYER && u.kind == UnitKind::Harvester)
        {
            self.over = true;
            self.winner = ENEMY as i32;
        }
    }

    // ---- orders (commands.js) ----
    pub fn tile_of(x: f64, y: f64) -> (i32, i32) {
        (
            jsmath::to_i32(x / TILE).clamp(0, MW - 1),
            jsmath::to_i32(y / TILE).clamp(0, MH - 1),
        )
    }

    fn path_to(&mut self, uid: Id, x: f64, y: f64) {
        if self.u(uid).kind.def().air {
            // Flyers go straight there, over rock and buildings.
            let u = self.um(uid);
            u.path = Some(vec![Pt {
                x: clamp(x, 16.0, WW - 16.0),
                y: clamp(y, 16.0, WH - 16.0),
            }]);
            u.repath = 0.6;
            return;
        }
        let (ux, uy) = (self.u(uid).x, self.u(uid).y);
        let (a, b) = (Self::tile_of(ux, uy), Self::tile_of(x, y));
        let mut path = astar(&self.map, &mut self.scratch, a.0, a.1, b.0, b.1);
        let bi = idx(b.0, b.1);
        let blocked_tile = self.map.rock[bi] != 0 || self.map.occ[bi] != 0;
        if let Some(p) = path.as_mut()
            && let Some(last) = p.last_mut()
            && !blocked_tile
        {
            *last = Pt {
                x: clamp(x, 16.0, WW - 16.0),
                y: clamp(y, 16.0, WH - 16.0),
            };
        }
        let rep = 0.6 + self.rnd() * 0.3;
        let u = self.um(uid);
        u.path = path;
        u.repath = rep;
    }

    fn release_mine(&mut self, uid: Id) {
        if let Task::Gather {
            node,
            phase: Phase::Mine,
            ..
        } = self.u(uid).task
            && let Some(n) = self.map.node_mut(node)
        {
            n.miners -= 1;
        }
    }

    pub fn move_to(&mut self, uid: Id, x: f64, y: f64) {
        self.release_mine(uid);
        self.um(uid).task = Task::Move { x, y };
        self.path_to(uid, x, y);
    }
    pub fn attack_move(&mut self, uid: Id, x: f64, y: f64) {
        self.release_mine(uid);
        self.um(uid).task = Task::AMove { x, y };
        self.path_to(uid, x, y);
    }
    pub fn attack_ent(&mut self, uid: Id, target: Id) {
        if self.team_of(target).is_none_or(|t| t == self.u(uid).team) || !self.can_hit(uid, target)
        {
            return;
        }
        self.release_mine(uid);
        let u = self.um(uid);
        u.task = Task::Attack { target, back: None };
        u.path = None;
        u.repath = 0.0;
    }
    pub fn stop_unit(&mut self, uid: Id) {
        self.release_mine(uid);
        let u = self.um(uid);
        u.task = Task::Idle;
        u.path = None;
    }
    pub fn hold_unit(&mut self, uid: Id) {
        self.release_mine(uid);
        let u = self.um(uid);
        u.task = Task::Hold;
        u.path = None;
    }

    pub fn nearest_node(&self, x: f64, y: f64, team: u8, ether: bool, max_d: f64) -> Option<Id> {
        let (mut best, mut bd) = (None, max_d);
        for n in &self.map.nodes {
            if n.ether != ether || n.amount <= 0 {
                continue;
            }
            if ether && !self.extractor_ready(n.id, Some(team)) {
                continue;
            }
            let d = dist(n.x, n.y, x, y);
            if d < bd {
                bd = d;
                best = Some(n.id);
            }
        }
        best
    }

    /// Returns whether the order took effect (refused for non-harvesters and vents without our extractor).
    pub fn start_gather(&mut self, uid: Id, node: Id) -> bool {
        let u = self.u(uid);
        if u.kind != UnitKind::Harvester {
            return false;
        }
        let team = u.team;
        // A node that is gone was a depleted shard field; the gather update retargets from there.
        if self.map.node(node).is_some_and(|n| n.ether) && !self.extractor_ready(node, Some(team)) {
            if team == PLAYER {
                self.toast("Build an Extractor on the vent first", true);
            }
            return false;
        }
        self.release_mine(uid);
        let u = self.um(uid);
        u.last_node = Some(node);
        u.task = Task::Gather {
            node,
            phase: if u.carry != 0 {
                Phase::Return
            } else {
                Phase::Go
            },
            timer: 0.0,
        };
        u.path = None;
        u.repath = 0.0;
        true
    }

    /// Whether `uid` may work on building `b`: a harvester of the same team, and the building is unfinished.
    pub fn can_build(&self, uid: Id, b: Id) -> bool {
        match (self.unit(uid), self.bldg(b)) {
            (Some(u), Some(bd)) => u.kind == UnitKind::Harvester && u.team == bd.team && !bd.done,
            _ => false,
        }
    }

    /// Send a harvester to work on an unfinished building of its team; other requests are ignored.
    pub fn start_build(&mut self, uid: Id, b: Id) -> bool {
        if !self.can_build(uid, b) {
            return false;
        }
        self.release_mine(uid);
        let u = self.um(uid);
        u.task = Task::Build { b };
        u.path = None;
        u.repath = 0.0;
        u.stuck = 0.0;
        u.anchor = (u.x, u.y);
        true
    }

    /// Cancel an unfinished building: it is removed and 75% of its cost comes back.
    pub fn cancel_construction(&mut self, bid: Id) -> bool {
        let Some(i) = self.bi(bid).filter(|&i| !self.bldgs[i].done) else {
            return false;
        };
        let b = self.bldgs.remove(i);
        for y in 0..b.h {
            for x in 0..b.w {
                self.map.occ[idx(b.tx + x, b.ty + y)] = b.vent.map_or(0, |v| -(v as i32));
            }
        }
        if let Some(n) = b.vent.and_then(|v| self.map.node_mut(v)) {
            n.extractor = None;
        }
        let cost = b.kind.def().cost;
        self.pay(b.team, [cost[0] * 3 / 4, cost[1] * 3 / 4], 1);
        for u in self.units.iter_mut() {
            if u.task == (Task::Build { b: bid }) {
                u.task = Task::Idle;
                u.path = None;
            }
        }
        if b.team == PLAYER {
            self.toast(format!("{} cancelled", b.kind.def().name), false);
        }
        self.recalc_supply(b.team);
        self.check_end();
        true
    }

    /// Place and pay for a building; Err carries the message to show.
    pub fn place_building(
        &mut self,
        team: u8,
        kind: BldgKind,
        tx: i32,
        ty: i32,
        builder: Option<Id>,
    ) -> Result<Id, String> {
        let d = kind.def();
        if !self.can_place(kind, tx, ty, team) {
            return Err("Cannot build there".into());
        }
        if !self.has_req(team, kind) {
            return Err(format!("Requires {}", d.req.unwrap().def().name));
        }
        if !self.can_afford(team, d.cost) {
            return Err(self.short_of(team, d.cost));
        }
        self.pay(team, d.cost, -1);
        let b = self.make_building(kind, team, tx, ty, false);
        if let Some(h) = builder {
            self.start_build(h, b);
        }
        for u in self.units.iter_mut() {
            if u.team == team && u.path.is_some() {
                u.repath = u.repath.min(0.1);
            }
        }
        Ok(b)
    }

    /// Spread a group around a point in a loose square.
    pub fn formation(&mut self, ids: &[Id], x: f64, y: f64) {
        let mut us: Vec<(f64, Id)> = ids
            .iter()
            .filter_map(|&id| self.unit(id).map(|u| (u.x, u.id)))
            .collect();
        let n = us.len();
        if n == 0 {
            return;
        }
        let cols = (n as f64).sqrt().ceil();
        let sp = 28.0;
        us.sort_by(|p, q| p.0.partial_cmp(&q.0).unwrap().then(p.1.cmp(&q.1)));
        for (i, &(_, id)) in us.iter().enumerate() {
            let i = i as f64;
            let ox = (i % cols - (cols - 1.0) / 2.0) * sp;
            let oy = ((i / cols).floor() - ((n as f64 / cols).ceil() - 1.0) / 2.0) * sp;
            self.move_to(
                id,
                clamp(x + ox, 16.0, WW - 16.0),
                clamp(y + oy, 16.0, WH - 16.0),
            );
        }
    }

    // ---- per-tick update (update.js) ----
    fn step_path(&mut self, uid: Id, dt: f64) -> bool {
        let u = self.um(uid);
        let speed = u.kind.def().speed;
        let Some(path) = u.path.as_mut() else {
            return true;
        };
        if path.is_empty() {
            return true;
        }
        let w = path[0];
        let d = dist(u.x, u.y, w.x, w.y);
        let mv = speed * dt;
        u.face = jsmath::atan2(w.y - u.y, w.x - u.x);
        if d <= mv + 1.0 {
            u.x = w.x;
            u.y = w.y;
            path.remove(0);
            return path.is_empty();
        }
        u.x += (w.x - u.x) / d * mv;
        u.y += (w.y - u.y) / d * mv;
        false
    }

    /// Move toward a target until within reach. Returns true once in reach.
    fn approach(&mut self, uid: Id, target: Geo, reach: f64, dt: f64) -> bool {
        let (ux, uy) = (self.u(uid).x, self.u(uid).y);
        let p = target.aim_point(ux, uy);
        let d = target.edge_dist(ux, uy);
        if d <= reach {
            let u = self.um(uid);
            u.path = None;
            u.face = jsmath::atan2(p.1 - uy, p.0 - ux);
            return true;
        }
        if self.u(uid).kind.def().air {
            // Flyers close in on a straight line, nothing below can block them.
            let u = self.um(uid);
            let mv = u.kind.def().speed * dt;
            u.path = None;
            u.face = jsmath::atan2(p.1 - uy, p.0 - ux);
            u.x = clamp(ux + (p.0 - ux) / d * mv, 16.0, WW - 16.0);
            u.y = clamp(uy + (p.1 - uy) / d * mv, 16.0, WH - 16.0);
            return false;
        }
        let u = self.um(uid);
        u.repath -= dt;
        if u.path.is_none() || u.repath <= 0.0 {
            if let Geo::Rect { tx, ty, w, h, .. } = target {
                let path = self.path_to_rect(ux, uy, (tx, ty, w, h), p);
                let u = self.um(uid);
                u.path = path;
                u.repath = 0.7;
            } else {
                let (tx, ty) = target.center();
                self.path_to(uid, tx, ty);
            }
        }
        if self.u(uid).path.as_ref().is_some_and(|p| !p.is_empty()) {
            self.step_path(uid, dt);
        } else {
            let u = self.u(uid);
            let mv = u.kind.def().speed * dt;
            let (nx, ny) = (u.x + (p.0 - u.x) / d * mv, u.y + (p.1 - u.y) / d * mv);
            if !self
                .map
                .blocked(jsmath::to_i32(nx / TILE), jsmath::to_i32(ny / TILE))
            {
                let u = self.um(uid);
                u.x = nx;
                u.y = ny;
            }
        }
        false
    }

    /// A path to a free tile beside a building footprint that can actually be reached: the free tiles around
    /// it are tried nearest first (a free tile can be cut off by rock), falling back to the old nearest-free goal.
    fn path_to_rect(
        &mut self,
        ux: f64,
        uy: f64,
        (tx, ty, w, h): (i32, i32, i32, i32),
        aim: (f64, f64),
    ) -> Option<Vec<Pt>> {
        let start = Self::tile_of(ux, uy);
        let mut ring: Vec<(f64, i32, i32)> = Vec::new();
        for y in ty - 1..=ty + h {
            for x in tx - 1..=tx + w {
                if (x >= tx && x < tx + w && y >= ty && y < ty + h) || self.map.blocked(x, y) {
                    continue;
                }
                let (cx, cy) = (x as f64 * TILE + 16.0, y as f64 * TILE + 16.0);
                ring.push((dist(cx, cy, ux, uy), x, y));
            }
        }
        ring.sort_by(|a, b| {
            a.0.partial_cmp(&b.0)
                .unwrap()
                .then((a.1, a.2).cmp(&(b.1, b.2)))
        });
        for &(_, x, y) in ring.iter().take(4) {
            if (x, y) == start {
                return Some(Vec::new());
            }
            if let Some(path) = astar(&self.map, &mut self.scratch, start.0, start.1, x, y) {
                let goal = Pt {
                    x: x as f64 * TILE + 16.0,
                    y: y as f64 * TILE + 16.0,
                };
                if path.last() == Some(&goal) {
                    return Some(path);
                }
            }
        }
        let g = Self::tile_of(aim.0, aim.1);
        astar(&self.map, &mut self.scratch, start.0, start.1, g.0, g.1)
    }

    fn fire(&mut self, shooter: Id, target: Id) {
        let air = self.unit(target).is_some_and(|u| u.kind.def().air);
        let (x, y, team, dmg, cd, proj) = if let Some(u) = self.unit(shooter) {
            let d = u.kind.def();
            (u.x, u.y, u.team, d.damage_vs(air), d.cd, d.proj)
        } else {
            let b = self.bldg(shooter).unwrap();
            let d = b.kind.def();
            (b.x, b.y, b.team, d.damage_vs(air), d.cd, d.proj)
        };
        if dmg <= 0.0 {
            return; // this weapon cannot hit that target
        }
        if let Some(i) = self.ui(shooter) {
            self.units[i].cd = cd;
        } else if let Some(b) = self.bm(shooter) {
            b.cd = cd;
        }
        match proj {
            Some(kind) => {
                let speed = match kind {
                    ProjKind::Shell => 300.0,
                    ProjKind::Missile => 340.0,
                    ProjKind::Bolt => 460.0,
                };
                self.projs.push(Proj {
                    x,
                    y,
                    target,
                    speed,
                    dmg,
                    kind,
                    by: shooter,
                    team,
                });
                if team == PLAYER || self.visible(shooter) {
                    self.emit(Event::Sfx(if kind == ProjKind::Bolt {
                        "bolt"
                    } else {
                        "shell"
                    }));
                }
            }
            None => self.damage(target, dmg, Some(shooter)),
        }
    }

    fn resume_after(&mut self, uid: Id) {
        let u = self.u(uid);
        if u.kind == UnitKind::Harvester {
            let (x, y, team) = (u.x, u.y, u.team);
            let last = u
                .last_node
                .filter(|&n| self.map.node(n).is_some_and(|n| n.amount > 0));
            if let Some(nd) = last.or_else(|| self.nearest_node(x, y, team, false, 500.0))
                && self.start_gather(uid, nd)
            {
                return;
            }
        }
        let u = self.um(uid);
        u.task = Task::Idle;
        u.path = None;
    }

    fn set_idle(&mut self, uid: Id) {
        let u = self.um(uid);
        u.task = Task::Idle;
        u.path = None;
    }

    fn update_unit(&mut self, uid: Id, dt: f64) {
        let (task, range, combat, team, r, sight, kind) = {
            let u = self.um(uid);
            u.cd -= dt;
            u.flash -= dt;
            let d = u.kind.def();
            (
                u.task,
                d.range * TILE,
                u.kind != UnitKind::Harvester && d.armed(),
                u.team,
                u.r,
                d.sight,
                u.kind,
            )
        };
        let hits = Self::hits_of(kind);
        if kind.def().heal > 0.0 {
            self.medic(uid, dt);
        }
        match task {
            Task::Idle | Task::Hold => {
                let hold = task == Task::Hold;
                let u = self.um(uid);
                u.aggro_cd -= dt;
                if combat && u.aggro_cd <= 0.0 {
                    u.aggro_cd = 0.3;
                    let (ux, uy) = (u.x, u.y);
                    let rng = if hold { range + r } else { sight * TILE * 0.85 };
                    if let Some(t) = self.find_target(ux, uy, team, rng, false, hits) {
                        let (tx, ty) = self.geo(t).unwrap().center();
                        if hold {
                            if self.u(uid).cd <= 0.0 {
                                self.fire(uid, t);
                            }
                            let u = self.um(uid);
                            u.face = jsmath::atan2(ty - u.y, tx - u.x);
                        } else {
                            self.um(uid).task = Task::Attack {
                                target: t,
                                back: Some(Back {
                                    x: ux,
                                    y: uy,
                                    amove: false,
                                }),
                            };
                        }
                    }
                }
            }
            Task::Move { x, y } => self.update_move(uid, x, y, dt),
            Task::AMove { x, y } => {
                let u = self.um(uid);
                u.aggro_cd -= dt;
                if u.aggro_cd <= 0.0 {
                    u.aggro_cd = 0.3;
                    let (ux, uy) = (u.x, u.y);
                    let t = self.find_target(ux, uy, team, sight * TILE * 0.85, false, hits);
                    if let (Some(t), true) = (t, combat) {
                        self.um(uid).task = Task::Attack {
                            target: t,
                            back: Some(Back { x, y, amove: true }),
                        };
                        return;
                    }
                }
                self.update_move(uid, x, y, dt);
            }
            Task::Attack { target, back } => {
                let Some(t) = self.geo(target).filter(|_| self.team_of(target).is_some()) else {
                    match back {
                        Some(b) if b.amove => self.attack_move(uid, b.x, b.y),
                        Some(b) => self.move_to(uid, b.x, b.y),
                        None => self.resume_after(uid),
                    }
                    return;
                };
                if combat && self.u(uid).aggro_cd <= 0.0 && t.is_rect() {
                    let (ux, uy) = (self.u(uid).x, self.u(uid).y);
                    self.um(uid).aggro_cd = 0.5;
                    if let Some(t2) = self.find_target(ux, uy, team, range + r, true, hits)
                        && let Task::Attack { target, .. } = &mut self.um(uid).task
                    {
                        *target = t2;
                    }
                }
                self.um(uid).aggro_cd -= dt;
                // Like the JS, this tick still closes on and fires at the original target.
                if self.approach(uid, t, range + r * 0.5, dt) && self.u(uid).cd <= 0.0 {
                    self.fire(uid, target);
                }
            }
            Task::Gather { node, phase, timer } => self.update_gather(uid, node, phase, timer, dt),
            Task::Build { b } => {
                let Some(bd) = self.bldg(b).filter(|bd| !bd.done) else {
                    self.resume_after(uid);
                    return;
                };
                let g = Geo::Rect {
                    tx: bd.tx,
                    ty: bd.ty,
                    w: bd.w,
                    h: bd.h,
                    x: bd.x,
                    y: bd.y,
                    r: bd.r,
                };
                let reached = self.approach(uid, g, r + 8.0, dt);
                if !reached {
                    // A builder that stays put (walled in, site cut off, jammed on a corner) gives up instead of
                    // waiting forever. The position includes last tick's separation push.
                    let (time, team) = (self.time, team);
                    let u = self.um(uid);
                    if dist(u.x, u.y, u.anchor.0, u.anchor.1) > STUCK_RADIUS {
                        u.anchor = (u.x, u.y);
                        u.stuck = 0.0;
                    } else {
                        u.stuck += dt;
                    }
                    if u.stuck > BUILDER_PATIENCE {
                        u.stuck = 0.0;
                        u.no_build_until = time + 30.0;
                        if team == PLAYER {
                            self.toast("A Harvester cannot reach its building site", true);
                        }
                        self.set_idle(uid);
                        return;
                    }
                }
                if reached {
                    self.um(uid).stuck = 0.0;
                    let bd = self.bm(b).unwrap();
                    let build = bd.kind.def().build;
                    bd.progress += dt / build;
                    bd.hp = bd.maxhp.min(bd.hp + dt / build * bd.maxhp * 0.9);
                    if bd.progress >= 1.0 {
                        bd.done = true;
                        bd.progress = 1.0;
                        bd.hp = bd.maxhp.min(bd.hp);
                        let (bteam, name) = (bd.team, bd.kind.def().name);
                        self.recalc_supply(bteam);
                        if bteam == PLAYER {
                            self.toast(format!("{} complete", name), false);
                            self.emit(Event::Sfx("done"));
                        }
                        let others: Vec<Id> = self
                            .units
                            .iter()
                            .filter(|o| o.id != uid && o.task == (Task::Build { b }))
                            .map(|o| o.id)
                            .collect();
                        for o in others {
                            self.resume_after(o);
                        }
                        self.resume_after(uid);
                    }
                }
            }
        }
    }

    /// A Medic heals the most hurt friendly infantry within HEAL_RANGE; when idle with nobody in range it walks
    /// toward hurt infantry it can see.
    fn medic(&mut self, uid: Id, dt: f64) {
        const HEAL_RANGE: f64 = 2.5 * TILE;
        let (mx, my, team, heal, sight, idle) = {
            let u = self.u(uid);
            (
                u.x,
                u.y,
                u.team,
                u.kind.def().heal,
                u.kind.def().sight * TILE,
                u.task == Task::Idle,
            )
        };
        let mut best: Option<(f64, Id, f64)> = None; // (hp fraction, id, distance)
        let mut seek: Option<(f64, f64, f64)> = None; // nearest hurt ally in sight: (distance, x, y)
        for o in &self.units {
            if o.id == uid || o.team != team || !o.kind.def().bio || o.hp >= o.maxhp {
                continue;
            }
            let d = dist(o.x, o.y, mx, my) - o.r;
            if d <= HEAL_RANGE {
                let f = o.hp / o.maxhp;
                if best.is_none_or(|(bf, bid, _)| f < bf || (f == bf && o.id < bid)) {
                    best = Some((f, o.id, d));
                }
            } else if d <= sight && seek.is_none_or(|(sd, _, _)| d < sd) {
                seek = Some((d, o.x, o.y));
            }
        }
        if let Some((_, pid, _)) = best {
            let i = self.ui(pid).unwrap();
            let p = &mut self.units[i];
            p.hp = (p.hp + heal * dt).min(p.maxhp);
            let (tx, ty) = (p.x, p.y);
            let u = self.um(uid);
            u.face = jsmath::atan2(ty - my, tx - mx);
            u.aggro_cd -= dt;
            if u.aggro_cd <= 0.0 {
                u.aggro_cd = 0.4;
                self.emit(Event::Heal {
                    x: mx,
                    y: my,
                    tx,
                    ty,
                });
            }
        } else if let (true, Some((_, sx, sy))) = (idle, seek) {
            self.move_to(uid, sx, sy);
        }
    }

    fn update_move(&mut self, uid: Id, x: f64, y: f64, dt: f64) {
        let u = self.um(uid);
        u.repath -= dt;
        if u.path.is_none() && u.repath <= 0.0 {
            self.path_to(uid, x, y);
        }
        if self.u(uid).path.is_none() || self.step_path(uid, dt) {
            let u = self.u(uid);
            if dist(u.x, u.y, x, y) < 40.0 || u.path.is_none() {
                self.set_idle(uid);
            }
        }
    }

    fn update_gather(&mut self, uid: Id, node: Id, phase: Phase, timer: f64, dt: f64) {
        let (team, r, carry) = {
            let u = self.u(uid);
            (u.team, u.r, u.carry)
        };
        let n = self.map.node(node).cloned();
        let usable = n
            .as_ref()
            .is_some_and(|n| n.amount > 0 && (!n.ether || self.extractor_ready(n.id, None)));
        if !usable {
            if phase == Phase::Mine
                && let Some(nm) = self.map.node_mut(node)
            {
                nm.miners -= 1;
            }
            let (ux, uy) = (self.u(uid).x, self.u(uid).y);
            let ether = n.as_ref().is_some_and(|n| n.ether);
            let nd = self
                .nearest_node(ux, uy, team, ether, 600.0)
                .or_else(|| self.nearest_node(ux, uy, team, false, 900.0));
            match nd {
                Some(nd) => {
                    let u = self.um(uid);
                    u.last_node = Some(nd);
                    u.task = Task::Gather {
                        node: nd,
                        phase: if carry != 0 { Phase::Return } else { Phase::Go },
                        timer,
                    };
                }
                None => self.set_idle(uid),
            }
            return;
        }
        let n = n.unwrap();
        let income = if team == ENEMY {
            DIFF[self.diff].income
        } else {
            1.0
        };
        match phase {
            Phase::Go | Phase::Wait => {
                let tgt = if n.ether {
                    self.geo(n.extractor.unwrap()).unwrap()
                } else {
                    Geo::Round {
                        x: n.x,
                        y: n.y,
                        r: n.r,
                    }
                };
                if self.approach(uid, tgt, if n.ether { r + 6.0 } else { r + 13.0 }, dt) {
                    let nm = self.map.node_mut(node).unwrap();
                    let task = if nm.miners < 2 {
                        nm.miners += 1;
                        Task::Gather {
                            node,
                            phase: Phase::Mine,
                            timer: (if n.ether { 2.8 } else { 2.0 }) / income,
                        }
                    } else {
                        Task::Gather {
                            node,
                            phase: Phase::Wait,
                            timer,
                        }
                    };
                    self.um(uid).task = task;
                }
            }
            Phase::Mine => {
                let timer = timer - dt;
                if timer <= 0.0 {
                    let nm = self.map.node_mut(node).unwrap();
                    nm.miners -= 1;
                    let take = nm.amount.min(if n.ether { 6 } else { 8 });
                    if !n.ether {
                        nm.amount -= take;
                    }
                    let left = nm.amount;
                    let u = self.um(uid);
                    u.carry = take;
                    u.carry_ether = Some(n.ether);
                    u.task = Task::Gather {
                        node,
                        phase: Phase::Return,
                        timer,
                    };
                    if left <= 0 && !n.ether {
                        let i = idx(n.tx, n.ty);
                        self.map.occ[i] = 0;
                        self.map.nodes.retain(|m| m.id != node);
                        if self.vis[0][i] != 0 {
                            self.toast("A shard field ran dry", false);
                        }
                    }
                } else {
                    self.um(uid).task = Task::Gather { node, phase, timer };
                }
            }
            Phase::Return => {
                let (ux, uy) = (self.u(uid).x, self.u(uid).y);
                let mut best: Option<Geo> = None;
                let mut bd = 1e9;
                for b in &self.bldgs {
                    if b.team == team && b.done && b.kind.def().dropoff {
                        let g = Geo::Rect {
                            tx: b.tx,
                            ty: b.ty,
                            w: b.w,
                            h: b.h,
                            x: b.x,
                            y: b.y,
                            r: b.r,
                        };
                        let d = g.edge_dist(ux, uy);
                        if d < bd {
                            bd = d;
                            best = Some(g);
                        }
                    }
                }
                let Some(best) = best else {
                    self.set_idle(uid);
                    return;
                };
                if self.approach(uid, best, r + 6.0, dt) {
                    let u = self.um(uid);
                    let gain = jsmath::round(u.carry as f64 * income) as i32;
                    let slot = if u.carry_ether == Some(true) { 1 } else { 0 };
                    u.carry = 0;
                    u.task = Task::Gather {
                        node,
                        phase: Phase::Go,
                        timer,
                    };
                    self.res[team as usize][slot] += gain;
                    if team == PLAYER {
                        self.emit(Event::Sfx("coin"));
                    }
                }
            }
        }
    }

    /// Push overlapping units apart and out of blocked tiles.
    fn separate(&mut self) {
        for i in 0..self.units.len() {
            if self.units[i].task == Task::Hold {
                continue;
            }
            let (id, ux, uy) = (self.units[i].id, self.units[i].x, self.units[i].y);
            let air = self.units[i].kind.def().air;
            for o in self.nearby(ux, uy, 40.0) {
                if o == id {
                    continue;
                }
                let (ox, oy, or, ohold, oair) = {
                    let o = self.hashed(o).unwrap();
                    (o.x, o.y, o.r, o.task == Task::Hold, o.kind.def().air)
                };
                if air != oair {
                    continue; // flyers and walkers do not bump into each other
                }
                let u = &mut self.units[i];
                let (dx, dy) = (u.x - ox, u.y - oy);
                let d = jsmath::hypot(dx, dy);
                let d = if d == 0.0 { 0.01 } else { d };
                let min = u.r + or;
                if d < min {
                    let push = (min - d) * 0.5 * if ohold { 1.0 } else { 0.5 };
                    u.x += dx / d * push;
                    u.y += dy / d * push;
                }
            }
            let u = &mut self.units[i];
            u.x = clamp(u.x, 16.0, WW - 16.0);
            u.y = clamp(u.y, 16.0, WH - 16.0);
            let t = Self::tile_of(u.x, u.y);
            if !air
                && self.map.blocked(t.0, t.1)
                && let Some(f) = self.map.nearest_free(t.0, t.1, 4)
            {
                let u = &mut self.units[i];
                let (cx, cy) = (f.0 as f64 * TILE + 16.0, f.1 as f64 * TILE + 16.0);
                let d = dist(u.x, u.y, cx, cy);
                if d < 24.0 {
                    u.x = cx;
                    u.y = cy;
                } else {
                    u.x += (cx - u.x) / d * 6.0;
                    u.y += (cy - u.y) / d * 6.0;
                }
                u.repath = 0.0;
            }
        }
    }

    fn update_building(&mut self, bid: Id, dt: f64) {
        let b = self.bm(bid).unwrap();
        b.flash -= dt;
        b.cd -= dt;
        if !b.done {
            return;
        }
        let d = b.kind.def();
        if d.range > 0.0 && b.cd <= 0.0 {
            let (bx, by, team) = (b.x, b.y, b.team);
            if let Some(t) = self.find_target(
                bx,
                by,
                team,
                d.range * TILE,
                false,
                (d.dmg > 0.0, d.dmg_air > 0.0),
            ) {
                let (tx, ty) = self.geo(t).unwrap().center();
                self.bm(bid).unwrap().aim = jsmath::atan2(ty - by, tx - bx);
                self.fire(bid, t);
            }
        }
        let b = self.bm(bid).unwrap();
        if let Some(&q) = b.queue.first() {
            b.prog += dt / q.def().build;
            if b.prog >= 1.0 {
                b.prog = 0.0;
                b.queue.remove(0);
                self.spawn_from(bid, q);
            }
        }
    }

    fn update_projs(&mut self, dt: f64) {
        let mut i = self.projs.len();
        while i > 0 {
            i -= 1;
            let p = self.projs[i].clone();
            let Some(t) = self
                .geo(p.target)
                .filter(|_| self.team_of(p.target).is_some())
            else {
                self.projs.remove(i);
                continue;
            };
            let tp = t.aim_point(p.x, p.y);
            let d = dist(p.x, p.y, tp.0, tp.1);
            let mv = p.speed * dt;
            if d <= mv + t.r() * 0.3 {
                self.damage(p.target, p.dmg, Some(p.by));
                self.emit(Event::Hit {
                    x: tp.0,
                    y: tp.1,
                    big: p.kind == ProjKind::Shell,
                });
                self.projs.remove(i);
            } else {
                let q = &mut self.projs[i];
                q.x += (tp.0 - q.x) / d * mv;
                q.y += (tp.1 - q.y) / d * mv;
            }
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
        self.update_fog();
        self.ai_tick(dt);
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
        for u in &self.units {
            mix(u.id as i32);
            mix(jsmath::to_i32(u.x * 16.0));
            mix(jsmath::to_i32(u.y * 16.0));
            mix(jsmath::to_i32(u.hp * 16.0));
        }
        for b in &self.bldgs {
            mix(b.id as i32);
            mix(jsmath::to_i32(b.hp * 16.0));
            mix(jsmath::to_i32(b.progress * 1024.0));
            mix(b.queue.len() as i32);
        }
        h
    }
}
