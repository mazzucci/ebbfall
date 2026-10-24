//! The AI's economy: workers on shards and ether, more harvesters, staffing an expansion.

use super::*;

impl World {
    /// The point our nearest finished Core stands on (where harvesters should mine), else the given point.
    pub(crate) fn home_of(&self, x: f64, y: f64) -> (f64, f64) {
        self.bldgs
            .iter()
            .filter(|b| b.team == ENEMY && b.kind == BldgKind::Core && b.done)
            .min_by(|a, b| {
                dist(a.x, a.y, x, y)
                    .partial_cmp(&dist(b.x, b.y, x, y))
                    .unwrap()
                    .then(a.id.cmp(&b.id))
            })
            .map_or((x, y), |b| (b.x, b.y))
    }

    pub(crate) fn gathering_ether(&self, id: Id) -> Option<bool> {
        match self.unit(id)?.task {
            Task::Gather { node, .. } => Some(self.map.node(node).is_some_and(|n| n.ether)),
            _ => None,
        }
    }
    /// Workers: idle ones mine; ether workers follow the cap; nobody stays on a dry vent while one flows.
    pub(crate) fn ai_workers(&mut self, brain: &mut Brain) {
        let Brain { e, harv, my_b, .. } = brain.clone();
        // Workers: idle ones mine; keep up to three on ether once an extractor stands, one while ether piles up.
        let ext = my_b.iter().copied().find(|&id| {
            let b = self.bldg(id).unwrap();
            b.kind == BldgKind::Extractor && b.done
        });
        let mut ether = harv
            .iter()
            .filter(|&&h| self.gathering_ether(h) == Some(true))
            .count();
        let stock = self.res[e as usize][1];
        let ai = self.ai.as_mut().unwrap();
        if stock > 400 {
            ai.ether_lean = true;
        } else if stock < 250 {
            ai.ether_lean = false;
        }
        // A dry vent only trickles: one harvester is plenty there.
        let flowing = ext.is_some()
            && self.map.nodes.iter().any(|n| {
                n.ether
                    && n.amount > 0
                    && n.extractor
                        .is_some_and(|x| self.bldg(x).is_some_and(|b| b.team == e && b.done))
            });
        let ai = self.ai.as_mut().unwrap();
        let ether_cap = if ai.ether_lean || !flowing { 1 } else { 3 };
        for &h in &harv {
            if self.unit(h).unwrap().task == Task::Idle {
                let want_ether = ext.is_some() && ether < ether_cap;
                let u = self.unit(h).unwrap();
                let (hx, hy) = self.home_of(u.x, u.y); // never the player's fields
                let n = self
                    .nearest_node(
                        hx,
                        hy,
                        e,
                        want_ether,
                        if flowing && want_ether { 3000.0 } else { 800.0 },
                    )
                    .or_else(|| self.nearest_node(hx, hy, e, false, 1200.0));
                if let Some(n) = n {
                    self.start_gather(h, n);
                    if want_ether {
                        ether += 1;
                    }
                }
            }
        }
        let on_dry = |w: &World, h: Id| match w.unit(h).map(|u| u.task) {
            Some(Task::Gather { node, .. }) => {
                w.map.node(node).is_some_and(|n| n.ether && n.amount <= 0)
            }
            _ => false,
        };
        // Off a dry vent as soon as one of ours still flows (anywhere: the expansion's may be far).
        if flowing {
            let h = harv.iter().copied().find(|&h| {
                on_dry(self, h)
                    && self.unit(h).unwrap().carry == 0
                    && !matches!(
                        self.unit(h).unwrap().task,
                        Task::Gather {
                            phase: Phase::Mine,
                            ..
                        }
                    )
            });
            if let Some(h) = h {
                let (hx, hy) = (self.unit(h).unwrap().x, self.unit(h).unwrap().y);
                if let Some(n) = self
                    .nearest_node(hx, hy, e, true, 3000.0)
                    .filter(|&n| self.map.node(n).is_some_and(|n| n.amount > 0))
                {
                    self.start_gather(h, n);
                }
            }
        }
        if ether > ether_cap {
            // The one on a dry vent goes first.
            let idle_ether = |w: &World, h: Id| {
                w.gathering_ether(h) == Some(true) && w.unit(h).unwrap().carry == 0
            };
            let h = harv
                .iter()
                .copied()
                .find(|&h| idle_ether(self, h) && on_dry(self, h))
                .or_else(|| harv.iter().copied().find(|&h| idle_ether(self, h)));
            if let Some(h) = h {
                let (hx, hy) = (self.unit(h).unwrap().x, self.unit(h).unwrap().y);
                if let Some(n) = self.nearest_node(hx, hy, e, false, 1200.0) {
                    self.start_gather(h, n);
                }
            }
        } else if ext.is_some() && ether < ether_cap {
            let h = harv.iter().copied().find(|&h| {
                let u = self.unit(h).unwrap();
                self.gathering_ether(h) == Some(false)
                    && !matches!(
                        u.task,
                        Task::Gather {
                            phase: Phase::Mine,
                            ..
                        }
                    )
                    && u.carry == 0
            });
            if let Some(h) = h {
                let (hx, hy) = (self.unit(h).unwrap().x, self.unit(h).unwrap().y);
                if let Some(n) =
                    self.nearest_node(hx, hy, e, true, if flowing { 3000.0 } else { 800.0 })
                {
                    self.start_gather(h, n);
                }
            }
        }

        brain.ext = ext;
        brain.flowing = flowing;
    }

    /// More harvesters while short of the target; an expansion gets five from the main base.
    pub(crate) fn ai_harvesters(&mut self, brain: &mut Brain) {
        let Brain { e, harv, my_b, .. } = brain.clone();
        let d = &DIFF[self.diff];
        // Economy and build order.
        let queued_h: usize = my_b
            .iter()
            .map(|&id| {
                self.bldg(id)
                    .unwrap()
                    .queue
                    .iter()
                    .filter(|&&q| q == UnitKind::Harvester)
                    .count()
            })
            .sum();
        let cores: Vec<Id> = my_b
            .iter()
            .copied()
            .filter(|&id| {
                self.bldg(id)
                    .is_some_and(|b| b.kind == BldgKind::Core && b.done)
            })
            .collect();
        let harv_target = d.harv + 5 * cores.len().saturating_sub(1);
        let mut queued = queued_h;
        for &c in &cores {
            if harv.len() + queued < harv_target
                && self.bldg(c).unwrap().queue.is_empty()
                && self.queue_unit(c, UnitKind::Harvester).is_ok()
            {
                queued += 1;
            }
        }
        // An expansion gets harvesters from the main base until five work its fields.
        if let Some(&exp) = cores.get(1) {
            let (ex, ey) = (self.bldg(exp).unwrap().x, self.bldg(exp).unwrap().y);
            let near_exp = |w: &World, h: Id| match w.unit(h).map(|u| u.task) {
                Some(Task::Gather { node, .. }) => w
                    .map
                    .node(node)
                    .is_some_and(|n| dist(n.x, n.y, ex, ey) < 400.0), // the radius it assigns within
                _ => false,
            };
            let working = harv.iter().filter(|&&h| near_exp(self, h)).count();
            if working < 5 && harv.len() >= 8 {
                let mover = harv.iter().copied().find(|&h| {
                    let u = self.unit(h).unwrap();
                    !near_exp(self, h)
                        && u.carry == 0
                        && matches!(
                            u.task,
                            Task::Gather {
                                phase: Phase::Go | Phase::Wait,
                                ..
                            }
                        )
                });
                if let (Some(h), Some(n)) = (mover, self.nearest_node(ex, ey, e, false, 400.0)) {
                    self.start_gather(h, n);
                }
            }
        }
        brain.cores = cores;
    }
}
