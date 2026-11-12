//! Economy: supply, gold mines (workers go in, come out with a load and carry it home), and Markets paying by
//! themselves.

use super::*;

/// A gold mine "running low": fewer than this many gold left in it.
pub const MINE_LOW: i32 = 1500;

impl World {
    /// The most supply a seat can have on this map (`data::supply_limit`): the Kingdom's population limit, and the
    /// Expedition's Power and hired places together (`pool_max`).
    pub fn supply_limit(&self) -> i32 {
        supply_limit(self.map.w)
    }

    /// A seat's population (the Kingdom) or Power (the Expedition): `[used, cap]` of `Pool::Supply`.
    pub fn sup(&self, team: u8) -> [i32; 2] {
        self.pool(team, Pool::Supply)
    }

    /// A seat's `[used, cap]` of one pool.
    pub fn pool(&self, team: u8, pool: Pool) -> [i32; 2] {
        self.pools[team as usize][pool.index()]
    }

    /// The most places a seat's `pool` can have on this map: the Kingdom's population the map's `supply_limit` (it has no
    /// hired places); the Expedition's Power `power_limit` and its hired places `hired_limit`, the two together the
    /// Kingdom's one limit.
    pub fn pool_max(&self, team: u8, pool: Pool) -> i32 {
        let w = self.map.w;
        match (self.factions[team as usize].power, pool) {
            (true, Pool::Supply) => power_limit(w),
            (true, Pool::Hired) => hired_limit(w),
            (false, Pool::Supply) => supply_limit(w),
            (false, Pool::Hired) => 0,
        }
    }

    /// Every pool's use of a seat together (the balance lab's army size; nothing caps the sum: each pool has its own
    /// maximum, `pool_max`).
    pub fn army_used(&self, team: u8) -> i32 {
        self.pools[team as usize].iter().map(|p| p[0]).sum()
    }

    /// The places a unit of `pool` could still take: its pool's free places (its cap is never above its maximum).
    pub fn room(&self, team: u8, pool: Pool) -> i32 {
        let [used, cap] = self.pool(team, pool);
        cap - used
    }

    /// Count a seat's places again, every pool: its units and those queued use them, its finished buildings give them,
    /// each pool capped at its maximum (`pool_max`); a building that uses Power (`BldgDef::uses`, the Portal) uses it
    /// from the moment it is placed. A building lost can leave a pool's use above its cap: nothing more of it is
    /// trained until enough fall (`queue_unit`), nothing is taken away.
    pub fn recalc_supply(&mut self, team: u8) {
        let mut p = [[0; 2]; POOLS];
        for u in self.units.iter().filter(|u| u.team == team) {
            let d = u.kind.def();
            p[d.pool.index()][0] += d.supply;
        }
        for b in self.bldgs.iter().filter(|b| b.team == team) {
            let d = b.kind.def();
            if b.done {
                p[d.pool.index()][1] += d.supply;
            }
            p[Pool::Supply.index()][0] += d.uses;
            for q in &b.queue {
                p[q.def().pool.index()][0] += q.def().supply;
            }
        }
        for pool in ALL_POOLS {
            let max = self.pool_max(team, pool);
            let s = &mut p[pool.index()];
            s[1] = s[1].min(max);
        }
        self.pools[team as usize] = p;
    }

    /// The nearest gold mine with gold left within `max_d` px (an empty mine takes nobody in).
    pub fn nearest_node(&self, x: f64, y: f64, max_d: f64) -> Option<Id> {
        let (mut best, mut bd) = (None, max_d);
        for n in &self.map.nodes {
            if n.ether || n.amount <= 0 {
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

    /// A finished Pump on a seep pays its owner salt with no workers (PRD: the conversion, rule 1): `PUMP_RATE` a
    /// second, banked a whole salt at a time from its own fraction (`Bldg::pumped`, hashed). An AI's income
    /// multiplier counts here as at a field (Brutal's x1.3: its edge is its whole economy's).
    pub(crate) fn pump(&mut self, bid: Id, dt: f64) {
        let team = self.bldg(bid).unwrap().team;
        let income = if self.is_ai(team) {
            self.tuning(team).income
        } else {
            1.0
        };
        let b = self.bm(bid).unwrap();
        b.pumped += PUMP_RATE * income * dt;
        // (sixty ticks of 1/60 sum to a hair under 1: the tolerance pays on the 60th, not the 61st)
        let whole = (b.pumped + 1e-9).floor();
        if whole >= 1.0 {
            b.pumped = (b.pumped - whole).max(0.0);
            self.res[team as usize][0] += whole as i32;
            self.ledger[team as usize].mined[0] += whole as i64;
        }
    }

    pub(crate) fn resume_after(&mut self, uid: Id) {
        let u = self.u(uid);
        if u.kind.def().worker {
            let (x, y) = (u.x, u.y);
            let last = u
                .last_node
                .filter(|&n| self.map.node(n).is_some_and(|n| n.amount > 0 && !n.ether));
            if let Some(nd) = last.or_else(|| self.nearest_node(x, y, 500.0))
                && self.start_gather(uid, nd)
            {
                return;
            }
        }
        self.set_idle(uid);
    }

    /// A mine near `n` with clearly fewer workers on it than `n`: at least two fewer, counting this one, so moving
    /// always evens the load and nobody shuttles back and forth. The least crowded wins, then the nearest.
    pub(crate) fn less_crowded_field(&self, uid: Id, n: &Node, team: u8) -> Option<Id> {
        // Only mines served by the same drop-off and not much farther from it: a hop never strays from the base
        // toward a mine out in the open.
        let drop = self.nearest_dropoff(team, n.x, n.y)?;
        let reach = drop.edge_dist(n.x, n.y) + 2.5 * TILE;
        let cands: Vec<Id> = self
            .map
            .nodes
            .iter()
            .filter(|m| {
                !m.ether
                    && m.id != n.id
                    && m.amount > 0
                    && dist(m.x, m.y, n.x, n.y) <= SPREAD_RANGE * TILE
                    && drop.edge_dist(m.x, m.y) <= reach
            })
            .map(|m| m.id)
            .collect();
        if cands.is_empty() {
            return None;
        }
        let mut on = vec![0usize; cands.len()];
        let mut here = 0;
        for u in &self.units {
            if let (true, Task::Gather { node, .. }) = (u.team == team, u.task) {
                if node == n.id {
                    here += 1;
                } else if let Some(i) = cands.iter().position(|&c| c == node) {
                    on[i] += 1;
                }
            }
        }
        let (ux, uy) = (self.u(uid).x, self.u(uid).y);
        cands
            .iter()
            .zip(on)
            .filter(|&(_, k)| k + 2 <= here)
            .map(|(&c, k)| {
                let m = self.map.node(c).unwrap();
                (k, dist(m.x, m.y, ux, uy), c)
            })
            .min_by(|a, b| {
                (a.0, a.1)
                    .partial_cmp(&(b.0, b.1))
                    .unwrap()
                    .then(a.2.cmp(&b.2))
            })
            .map(|(_, _, c)| c)
    }

    /// The finished drop-off of `team` nearest (by edge) to (x, y); the first in building order on a tie.
    pub(crate) fn nearest_dropoff(&self, team: u8, x: f64, y: f64) -> Option<Geo> {
        self.bldgs
            .iter()
            .filter(|b| b.team == team && b.done && b.kind.def().dropoff)
            .map(|b| b.geo())
            .min_by(|a, b| a.edge_dist(x, y).partial_cmp(&b.edge_dist(x, y)).unwrap())
    }

    /// A worker's gather task, phase by phase: walk to the mine (or wait at its side while it is full), go inside
    /// (`Phase::Mine`: hidden, `Unit::inside`), come out with a load and carry it home.
    pub(crate) fn update_gather(&mut self, uid: Id, node: Id, phase: Phase, timer: f64, dt: f64) {
        let team = self.u(uid).team;
        let n = self.map.node(node).cloned();
        let usable = n.as_ref().is_some_and(|n| n.amount > 0 && !n.ether);
        let Some(n) = n.filter(|_| usable) else {
            return self.gather_elsewhere(uid, node, phase, timer);
        };
        let income = if self.is_ai(team) {
            self.tuning(team).income
        } else {
            1.0
        };
        match phase {
            Phase::Go | Phase::Wait => self.gather_arrive(uid, &n, phase, timer, income, dt),
            Phase::Mine => self.gather_mine(uid, &n, timer - dt),
            Phase::Return => self.gather_return(uid, node, timer, income, dt),
        }
    }

    /// The mine is gone or empty: the nearest other mine, carrying home first if loaded; idle when there is none. A
    /// worker inside comes out with nothing.
    fn gather_elsewhere(&mut self, uid: Id, node: Id, phase: Phase, timer: f64) {
        if phase == Phase::Mine
            && let Some(nm) = self.map.node_mut(node)
        {
            nm.miners -= 1;
            self.come_out(uid);
        }
        let (ux, uy, carry) = {
            let u = self.u(uid);
            (u.x, u.y, u.carry)
        };
        let nd = self.nearest_node(ux, uy, 900.0);
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
    }

    /// Walking to the mine, or waiting at its side: in when there is room (fewer than `MINE_CAP` inside), else try a
    /// less crowded mine nearby.
    fn gather_arrive(&mut self, uid: Id, n: &Node, phase: Phase, timer: f64, income: f64, dt: f64) {
        let (team, r) = (self.u(uid).team, self.u(uid).r);
        let node = n.id;
        if !self.approach_settled(uid, n.geo(), r + 6.0, SETTLE, dt) {
            return;
        }
        let nm = self.map.node_mut(node).unwrap();
        let task = if nm.miners < MINE_CAP {
            nm.miners += 1;
            Task::Gather {
                node,
                phase: Phase::Mine,
                timer: MINE_TIME / income,
            }
        } else if phase == Phase::Go || timer <= 0.0 {
            // Full: try a less crowded mine close by (checked on arrival, then every half second while waiting).
            match self.less_crowded_field(uid, n, team) {
                Some(m) => {
                    self.um(uid).last_node = Some(m);
                    Task::Gather {
                        node: m,
                        phase: Phase::Go,
                        timer: 0.0,
                    }
                }
                None => Task::Gather {
                    node,
                    phase: Phase::Wait,
                    timer: 0.5,
                },
            }
        } else {
            Task::Gather {
                node,
                phase: Phase::Wait,
                timer: timer - dt,
            }
        };
        self.um(uid).task = task;
    }

    /// Inside the mine (`timer`: what is left of the time): when done, come out with a load and head home. A mine
    /// taken to nothing stays where it stands, empty (its last gold said once).
    fn gather_mine(&mut self, uid: Id, n: &Node, timer: f64) {
        let node = n.id;
        if timer > 0.0 {
            self.um(uid).task = Task::Gather {
                node,
                phase: Phase::Mine,
                timer,
            };
            return;
        }
        let team = self.u(uid).team;
        let nm = self.map.node_mut(node).unwrap();
        nm.miners -= 1;
        let take = nm.amount.min(MINE_LOAD);
        nm.amount -= take;
        let left = nm.amount;
        // A mine crossing into its last MINE_LOW gold: time to expand.
        if left < MINE_LOW && left + take >= MINE_LOW {
            self.toast(team, "A gold mine is running low: time to expand", true);
            self.ping(team, n.x, n.y);
        }
        let u = self.um(uid);
        u.carry = take;
        u.task = Task::Gather {
            node,
            phase: Phase::Return,
            timer,
        };
        self.come_out(uid);
        if left <= 0 {
            // Told to the miner's seat and to the enemies who see it, not to its allies (who see it through its eyes:
            // not their mine).
            let i = self.map.idx(n.tx, n.ty);
            let miner = self.u(uid).team;
            for t in 0..self.seats() as u8 {
                if self.vis[t as usize][i] != 0 && (t == miner || self.enemies(t, miner)) {
                    self.toast(t, "A gold mine is mined out", false);
                }
            }
        }
    }

    /// Out of a mine where it went in; where that ground is no longer ground it may stand on (the tide came over it
    /// while the worker was inside, out of the sweep's reach), at the nearest that is.
    pub(crate) fn come_out(&mut self, uid: Id) {
        let (x, y, kind) = (self.u(uid).x, self.u(uid).y, self.u(uid).kind);
        let foot = self.foot(kind);
        let (tx, ty) = self.map.tile_of(x, y);
        if !self.map.passable(foot, tx, ty)
            && let Some((dx, dy)) = self.map.nearest_passable_to(foot, tx, ty, 8, (x, y))
        {
            let u = self.um(uid);
            u.x = dx as f64 * TILE + 16.0;
            u.y = dy as f64 * TILE + 16.0;
            u.path = None;
        }
    }

    /// Carrying a load to the nearest drop-off (idle without one), then back to the mine.
    fn gather_return(&mut self, uid: Id, node: Id, timer: f64, income: f64, dt: f64) {
        let (ux, uy, team, r) = {
            let u = self.u(uid);
            (u.x, u.y, u.team, u.r)
        };
        let Some(drop) = self.nearest_dropoff(team, ux, uy) else {
            self.set_idle(uid);
            return;
        };
        if self.approach_settled(uid, drop, r + 6.0, SETTLE, dt) {
            let u = self.um(uid);
            let gain = jsmath::round(u.carry as f64 * income) as i32;
            u.carry = 0;
            u.task = Task::Gather {
                node,
                phase: Phase::Go,
                timer,
            };
            self.res[team as usize][0] += gain;
            self.ledger[team as usize].mined[0] += gain as i64;
            self.sfx(team, "coin");
        }
    }
}
