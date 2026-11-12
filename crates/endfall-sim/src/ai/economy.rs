//! The AI's economy: workers on gold, more harvesters, staffing an expansion.

use super::*;

/// Workers the AI adds for its second base.
const EXP_CREW: usize = 3;
/// The workers inside a mine at once the levels' crews (`Diff::harv`) are written for (seven before the economy's
/// second round, the cap of every worker then).
const CREW_CAP: usize = 7;

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

    /// Our finished Markets (they pay by themselves).
    pub fn pumps(&self, e: u8) -> usize {
        self.bldgs
            .iter()
            .filter(|b| b.team == e && b.done && b.kind.def().pays)
            .count()
    }

    /// Workers: idle ones mine gold from their own base. (A Market needs no crew: it pays by itself.)
    pub(crate) fn ai_workers(&mut self, brain: &mut Brain) {
        let Brain { harv, .. } = brain.clone();
        for &h in &harv {
            let u = self.unit(h).unwrap();
            if u.task == Task::Idle {
                let (hx, hy) = self.home_of(u.x, u.y); // never the enemy's fields
                let n = self
                    .nearest_node(hx, hy, 800.0)
                    .or_else(|| self.nearest_node(hx, hy, 1200.0))
                    .or_else(|| self.our_side_node(hx, hy));
                if let Some(n) = n {
                    self.start_gather(h, n);
                }
            }
        }
        brain.pumps = self.pumps(self.seat());
    }

    /// Every mine near home dry (its idle workers would stand there for good): the nearest mine with gold to (x, y)
    /// that lies nearer one of our buildings than any enemy's, wherever it is (never the enemy's fields).
    fn our_side_node(&self, x: f64, y: f64) -> Option<Id> {
        let e = self.seat();
        let near = |n: &crate::map::Node, ours: bool| {
            self.bldgs
                .iter()
                .filter(|b| {
                    if ours {
                        b.team == e
                    } else {
                        self.enemies(e, b.team)
                    }
                })
                .map(|b| dist(b.x, b.y, n.x, n.y))
                .fold(f64::INFINITY, f64::min)
        };
        self.map
            .nodes
            .iter()
            .filter(|n| !n.ether && n.amount > 0 && near(n, true) < near(n, false))
            .min_by(|a, b| {
                dist(a.x, a.y, x, y)
                    .total_cmp(&dist(b.x, b.y, x, y))
                    .then(a.id.cmp(&b.id))
            })
            .map(|n| n.id)
    }

    /// The crew the AI trains workers for, with `cores` finished Cores (`harv_target_of` the seat taking its turn).
    pub(crate) fn harv_target(&self, cores: usize) -> usize {
        self.harv_target_of(self.seat(), cores)
    }

    /// The crew AI seat `e` trains workers for, with `cores` finished Cores: its difficulty's, and `EXP_CREW` more
    /// with a second base (no more for a third or fourth: under a cap of 40 a base past the second brings a Market and
    /// fresh fields for the crew it has, not more workers); in its worker's crew size for a mine (`crew_of`).
    pub fn harv_target_of(&self, e: u8, cores: usize) -> usize {
        self.crew_of(e, self.tuning(e).harv + EXP_CREW * (cores >= 2) as usize)
    }

    /// A crew of `n` in seat `e`'s workers: the levels' crews are written for a mine of `CREW_CAP` inside at once, and
    /// a people whose worker fits more (eight Villagers) or fewer (five Bots) keeps as many more or fewer
    /// (Stelian, Nov 12: the Kingdom many and cheap, the Expedition few and efficient).
    pub(crate) fn crew_of(&self, e: u8, n: usize) -> usize {
        let cap = self.factions[e as usize].worker.def().mine_cap as usize;
        (n * cap + CREW_CAP / 2) / CREW_CAP
    }

    /// More harvesters while short of the target; an expansion gets five from the main base.
    pub(crate) fn ai_harvesters(&mut self, brain: &mut Brain) {
        let Brain { harv, my_b, .. } = brain.clone();
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
        let harv_target = self.harv_target(cores.len());
        // A builder stays at its site until the building stands (either people), so the AI keeps one spare for it: it
        // replaces one worker away building or repairing, so its income does not dip with every building it raises.
        // (One at most: workers are never disbanded, so more would stay for good.)
        let away = harv
            .iter()
            .filter(|&&h| {
                self.unit(h)
                    .is_some_and(|u| matches!(u.task, Task::Build { .. } | Task::Repair { .. }))
            })
            .count();
        let crew = harv.len() - away.min(1);
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
            // (five and eight in the levels' crews: in its own workers, `crew_of`)
            let e = self.seat();
            if working < self.crew_of(e, 5) && harv.len() >= self.crew_of(e, 8) {
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
                if let (Some(h), Some(n)) = (mover, self.nearest_node(ex, ey, 400.0)) {
                    self.start_gather(h, n);
                }
            }
        }
        brain.cores = cores;
    }
}
