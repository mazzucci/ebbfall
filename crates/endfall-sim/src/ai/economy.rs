//! The AI's economy: workers on shards and ether, more harvesters, staffing an expansion.

use super::*;

impl World {
    /// The point our nearest finished Core stands on (where harvesters should mine), else the given point.
    pub(crate) fn home_of(&self, x: f64, y: f64) -> (f64, f64) {
        self.bldgs
            .iter()
            .filter(|b| b.team == self.seat() && b.kind.def().hq && b.done)
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
        // Keep up to three on ether once an extractor stands, one while ether piles up.
        let ext = my_b.iter().copied().find(|&id| {
            let b = self.bldg(id).unwrap();
            b.kind == self.factions[self.seat() as usize].ether && b.done
        });
        let ether = harv
            .iter()
            .filter(|&&h| self.gathering_ether(h) == Some(true))
            .count();
        let stock = self.res[e as usize][1];
        let ai = self.ai_mut();
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
        let ether_cap = if self.ai().ether_lean || !flowing {
            1
        } else {
            3
        };
        let ether = self.ai_idle_to_work(&harv, ext.is_some(), flowing, ether, ether_cap);
        if flowing {
            self.ai_off_dry_vent(&harv);
        }
        if ether > ether_cap {
            self.ai_one_off_ether(&harv);
        } else if ext.is_some() && ether < ether_cap {
            self.ai_one_onto_ether(&harv, flowing);
        }
        brain.ext = ext;
        brain.flowing = flowing;
    }

    /// Send worker `h` to the nearest field of ours (a vent if `ether`) within `range` px of it, if there is one.
    fn ai_regather(&mut self, h: Id, ether: bool, range: f64) {
        let (hx, hy) = (self.unit(h).unwrap().x, self.unit(h).unwrap().y);
        if let Some(n) = self.nearest_node(hx, hy, self.seat(), ether, range) {
            self.start_gather(h, n);
        }
    }

    /// Idle workers go mining from their own base: ether while under the cap (`ether` on it so far), else shards.
    /// Returns how many are on ether after.
    fn ai_idle_to_work(
        &mut self,
        harv: &[Id],
        has_ext: bool,
        flowing: bool,
        mut ether: usize,
        cap: usize,
    ) -> usize {
        let e = self.seat();
        for &h in harv {
            if self.unit(h).unwrap().task == Task::Idle {
                let want_ether = has_ext && ether < cap;
                let u = self.unit(h).unwrap();
                let (hx, hy) = self.home_of(u.x, u.y); // never the enemy's fields
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
        ether
    }

    /// Whether worker `h` is gathering at a dry vent.
    fn on_dry_vent(&self, h: Id) -> bool {
        match self.unit(h).map(|u| u.task) {
            Some(Task::Gather { node, .. }) => self
                .map
                .node(node)
                .is_some_and(|n| n.ether && n.amount <= 0),
            _ => false,
        }
    }

    /// Whether worker `h` is free to change fields: empty-handed and not in the middle of mining.
    fn ai_between_loads(&self, h: Id) -> bool {
        let u = self.unit(h).unwrap();
        u.carry == 0
            && !matches!(
                u.task,
                Task::Gather {
                    phase: Phase::Mine,
                    ..
                }
            )
    }

    /// One worker off a dry vent, onto a vent of ours that still flows (anywhere: the expansion's may be far).
    fn ai_off_dry_vent(&mut self, harv: &[Id]) {
        let h = harv
            .iter()
            .copied()
            .find(|&h| self.on_dry_vent(h) && self.ai_between_loads(h));
        if let Some(h) = h {
            let (hx, hy) = (self.unit(h).unwrap().x, self.unit(h).unwrap().y);
            if let Some(n) = self
                .nearest_node(hx, hy, self.seat(), true, 3000.0)
                .filter(|&n| self.map.node(n).is_some_and(|n| n.amount > 0))
            {
                self.start_gather(h, n);
            }
        }
    }

    /// Over the ether cap: one empty-handed ether worker back to shards (the one on a dry vent first).
    fn ai_one_off_ether(&mut self, harv: &[Id]) {
        let idle_ether =
            |w: &World, h: Id| w.gathering_ether(h) == Some(true) && w.unit(h).unwrap().carry == 0;
        let h = harv
            .iter()
            .copied()
            .find(|&h| idle_ether(self, h) && self.on_dry_vent(h))
            .or_else(|| harv.iter().copied().find(|&h| idle_ether(self, h)));
        if let Some(h) = h {
            self.ai_regather(h, false, 1200.0);
        }
    }

    /// Under the ether cap: one shard worker between loads onto a vent.
    fn ai_one_onto_ether(&mut self, harv: &[Id], flowing: bool) {
        let h = harv
            .iter()
            .copied()
            .find(|&h| self.gathering_ether(h) == Some(false) && self.ai_between_loads(h));
        if let Some(h) = h {
            self.ai_regather(h, true, if flowing { 3000.0 } else { 800.0 });
        }
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
                    .filter(|&&q| q.def().worker)
                    .count()
            })
            .sum();
        let cores: Vec<Id> = my_b
            .iter()
            .copied()
            .filter(|&id| self.bldg(id).is_some_and(|b| b.kind.def().hq && b.done))
            .collect();
        let harv_target = d.harv + 5 * cores.len().saturating_sub(1);
        // A side whose builder stays at its site until the building stands (people; a Vael planter leaves at once)
        // keeps one spare for it: the AI replaces one worker away building or repairing, so its income does not dip
        // with every building it raises. (One at most: workers are never disbanded, so more would stay for good.)
        let away = harv
            .iter()
            .filter(|&&h| {
                self.unit(h)
                    .is_some_and(|u| matches!(u.task, Task::Build { .. } | Task::Repair { .. }))
            })
            .count();
        let spare = if self.factions[e as usize].warp {
            0
        } else {
            away.min(1)
        };
        let crew = harv.len() - spare;
        let mut queued = queued_h;
        for &c in &cores {
            if crew + queued < harv_target
                && self.bldg(c).unwrap().queue.is_empty()
                && self
                    .queue_unit(c, self.factions[self.seat() as usize].worker)
                    .is_ok()
            {
                queued += 1;
            }
        }
        // An expansion gets harvesters from the main base until five work its fields.
        if let Some(&exp) = cores.get(1) {
            let (ex, ey) = (self.bldg(exp).unwrap().x, self.bldg(exp).unwrap().y);
            let near_exp = |w: &World, h: Id| match w.unit(h).map(|u| u.task) {
                // (one that ran from a raid there still works there: no replacement sent into the raid)
                Some(
                    Task::Gather { node, .. }
                    | Task::Flee {
                        node: Some(node), ..
                    },
                ) => w
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
