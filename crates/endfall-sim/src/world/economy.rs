//! Economy: supply, mining fields and vents, harvesters choosing and sharing fields.

use super::*;

impl World {
    pub(crate) fn extractor_ready(&self, node: Id, team: Option<u8>) -> bool {
        let Some(n) = self.map.node(node) else {
            return false;
        };
        match n.extractor.and_then(|e| self.bldg(e)) {
            Some(b) => b.done && team.is_none_or(|t| b.team == t),
            None => false,
        }
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

    pub fn nearest_node(&self, x: f64, y: f64, team: u8, ether: bool, max_d: f64) -> Option<Id> {
        // A dry vent still gives a trickle: worth mining, but only when no vent within reach still flows.
        let (mut best, mut bd) = ((None, None), (max_d, max_d));
        for n in &self.map.nodes {
            if n.ether != ether || (!ether && n.amount <= 0) {
                continue;
            }
            if ether && !self.extractor_ready(n.id, Some(team)) {
                continue;
            }
            let d = dist(n.x, n.y, x, y);
            if n.amount > 0 && d < bd.0 {
                bd.0 = d;
                best.0 = Some(n.id);
            } else if n.amount <= 0 && d < bd.1 {
                bd.1 = d;
                best.1 = Some(n.id);
            }
        }
        best.0.or(best.1)
    }

    pub(crate) fn resume_after(&mut self, uid: Id) {
        let u = self.u(uid);
        if u.kind.def().worker {
            let (x, y, team) = (u.x, u.y, u.team);
            let last = u
                .last_node
                .filter(|&n| self.map.node(n).is_some_and(|n| n.amount > 0 || n.ether));
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

    /// A field of the same kind near `n` (a vent needs our finished Extractor) with clearly fewer harvesters on it
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
                m.ether == n.ether
                    && m.id != n.id
                    && m.amount > 0
                    && dist(m.x, m.y, n.x, n.y) <= SPREAD_RANGE * TILE
                    && drop.edge_dist(m.x, m.y) <= reach
                    && (!m.ether || self.extractor_ready(m.id, Some(team)))
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
        let usable = n.as_ref().is_some_and(|n| {
            (n.amount > 0 || n.ether) && (!n.ether || self.extractor_ready(n.id, None))
        });
        let Some(n) = n.filter(|_| usable) else {
            let ether = self.map.node(node).is_some_and(|n| n.ether);
            return self.gather_elsewhere(uid, node, ether, phase, timer);
        };
        let income = if self.is_ai(team) {
            DIFF[self.diff].income
        } else {
            1.0
        };
        match phase {
            Phase::Go | Phase::Wait => self.gather_arrive(uid, &n, phase, timer, income, dt),
            Phase::Mine => self.gather_mine(uid, &n, timer - dt),
            Phase::Return => self.gather_return(uid, node, timer, income, dt),
        }
    }

    /// The field is gone, dry or unserved: the nearest other field of the same resource (else any shard field),
    /// carrying home first if loaded; idle when there is none.
    fn gather_elsewhere(&mut self, uid: Id, node: Id, ether: bool, phase: Phase, timer: f64) {
        if phase == Phase::Mine
            && let Some(nm) = self.map.node_mut(node)
        {
            nm.miners -= 1;
        }
        let (ux, uy, team, carry) = {
            let u = self.u(uid);
            (u.x, u.y, u.team, u.carry)
        };
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
    }

    /// Walking to the field, or waiting at it: mine when a slot is free, else try a less crowded field nearby.
    fn gather_arrive(&mut self, uid: Id, n: &Node, phase: Phase, timer: f64, income: f64, dt: f64) {
        let (team, r) = (self.u(uid).team, self.u(uid).r);
        let node = n.id;
        let tgt = if n.ether {
            self.geo(n.extractor.unwrap()).unwrap()
        } else {
            Geo::Round {
                x: n.x,
                y: n.y,
                r: n.r,
            }
        };
        if !self.approach(uid, tgt, if n.ether { r + 6.0 } else { r + 13.0 }, dt) {
            return;
        }
        let nm = self.map.node_mut(node).unwrap();
        let task = if nm.miners < MINE_SLOTS {
            nm.miners += 1;
            Task::Gather {
                node,
                phase: Phase::Mine,
                timer: (if n.ether {
                    ETHER_MINE_TIME
                } else {
                    SHARD_MINE_TIME
                }) / income,
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

    /// Mining (`timer`: what is left of it): when done, take a load and head home; a shard field taken to nothing
    /// is gone, a vent runs dry to a trickle.
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
        // A vent runs dry like a field, but its Extractor still gives a trickle once it has.
        let before = nm.amount;
        let take = if n.ether && before <= 0 {
            VENT_TRICKLE
        } else {
            before.min(if n.ether { 6 } else { 8 })
        };
        nm.amount = (before - take).max(0);
        let left = nm.amount;
        if n.ether && before > 0 && left == 0 {
            self.toast(
                team,
                "An ether vent is depleted: its Ether Rig now gives a trickle",
                false,
            );
        }
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
            for t in [0, 1] {
                if self.vis[t as usize][i] != 0 {
                    self.toast(t, "A shard field ran dry", false);
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
        if self.approach(uid, drop, r + 6.0, dt) {
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
            self.sfx(team, "coin");
        }
    }
}
