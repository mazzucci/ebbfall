//! Economy: supply, mining fields, harvesters choosing and sharing fields, and Pumps on seeps paying by themselves.

use super::*;

/// A salt field "running low": fewer than this many salt left over all its crystals.
pub const FIELD_LOW: i32 = 1500;

impl World {
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
        self.sup[team as usize] = [used, cap.min(SUPPLY_LIMIT)];
    }

    /// The nearest salt field with salt left within `max_d` px (a seep is never mined: its Pump pays by itself).
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

    /// A field near `n` with clearly fewer harvesters on it
    /// than `n`: at least two fewer, counting this one, so moving always evens the load and nobody shuttles back and
    /// forth. The least crowded wins, then the nearest.
    pub(crate) fn less_crowded_field(&self, uid: Id, n: &Node, team: u8) -> Option<Id> {
        // Only fields served by the same drop-off and not much farther from it: a hop never strays from the base
        // toward a field out in the open.
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

    /// A worker's gather task, phase by phase: walk to the field (or queue at it), mine, carry it home.
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

    /// The field is gone or dry: the nearest other field, carrying home first if loaded; idle when there is none.
    fn gather_elsewhere(&mut self, uid: Id, node: Id, phase: Phase, timer: f64) {
        if phase == Phase::Mine
            && let Some(nm) = self.map.node_mut(node)
        {
            nm.miners -= 1;
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

    /// Walking to the field, or waiting at it: mine when a slot is free, else try a less crowded field nearby.
    fn gather_arrive(&mut self, uid: Id, n: &Node, phase: Phase, timer: f64, income: f64, dt: f64) {
        let (team, r) = (self.u(uid).team, self.u(uid).r);
        let node = n.id;
        let tgt = Geo::Round {
            x: n.x,
            y: n.y,
            r: n.r,
        };
        if !self.approach_settled(uid, tgt, r + 13.0, SETTLE, dt) {
            return;
        }
        let nm = self.map.node_mut(node).unwrap();
        let task = if nm.miners < MINE_SLOTS {
            nm.miners += 1;
            Task::Gather {
                node,
                phase: Phase::Mine,
                timer: SHARD_MINE_TIME / income,
            }
        } else if phase == Phase::Go || timer <= 0.0 {
            // Busy: like a worker in 1998, try a less crowded field close by (checked on arrival, then every half
            // second while waiting).
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

    /// Mining (`timer`: what is left of it): when done, take a load and head home; a field taken to nothing is gone.
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
        let take = nm.amount.min(8);
        nm.amount -= take;
        let left = nm.amount;
        // A field crossing into its last FIELD_LOW salt (counted over all its crystals): time to expand.
        let field: i32 = self
            .map
            .nodes
            .iter()
            .filter(|o| o.field == n.field)
            .map(|o| o.amount)
            .sum();
        if field < FIELD_LOW && field + take >= FIELD_LOW {
            self.toast(team, "A salt field is running low: time to expand", true);
            self.ping(team, n.x, n.y);
        }
        let u = self.um(uid);
        u.carry = take;
        u.task = Task::Gather {
            node,
            phase: Phase::Return,
            timer,
        };
        if left <= 0 {
            let i = self.map.idx(n.tx, n.ty);
            self.map.occ[i] = 0;
            self.terrain_changed();
            self.map.nodes.retain(|m| m.id != node);
            // Told to the miner's seat and to the enemies who see it, not to its allies (who see it through its eyes:
            // not their field).
            let miner = self.u(uid).team;
            for t in 0..self.seats() as u8 {
                if self.vis[t as usize][i] != 0 && (t == miner || self.enemies(t, miner)) {
                    self.toast(t, "A salt field ran dry", false);
                }
            }
        }
    }

    /// Carrying a load to the nearest drop-off (idle without one), then back to the field.
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
