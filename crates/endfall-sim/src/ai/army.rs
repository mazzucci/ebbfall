//! The AI's army: watching for intruders, repairs, defence, raids and waves (research is in research.rs, production
//! in produce.rs).

use super::*;

impl World {
    /// Where a wave goes: the enemy headquarters it knows of, else a production building, else any building it
    /// knows (a lone forward Depot or Spire no longer draws the whole wave away), else the sweep.
    pub(crate) fn attack_target(&self) -> (f64, f64) {
        let ai = self.ai();
        let production = |id: Id| {
            self.bldg(id)
                .is_some_and(|b| !b.kind.def().trains.is_empty())
        };
        if let Some(k) = ai
            .known
            .iter()
            .find(|k| k.3)
            .or_else(|| ai.known.iter().find(|k| production(k.0)))
            .or(ai.known.first())
        {
            return (k.1, k.2);
        }
        self.sweep_point()
    }

    /// Wasps (two or more) raid the player's harvesters; badly hurt ones fly home.
    pub(crate) fn tend_raiders(&mut self, wasps: &[Id], rally: Pt) {
        let mut raiders: Vec<Id> = self
            .ai()
            .raiders
            .iter()
            .copied()
            .filter(|&r| self.unit(r).is_some())
            .collect();
        let healthy = |w: &World, id: Id| w.unit(id).is_some_and(|u| u.hp >= u.maxhp * 0.4);
        if raiders.is_empty() {
            let fit: Vec<Id> = wasps
                .iter()
                .copied()
                .filter(|&id| healthy(self, id))
                .collect();
            if fit.len() >= 2 {
                raiders = fit.into_iter().take(4).collect();
            }
        }
        let (tx, ty) = self.attack_target();
        let mut keep = Vec::new();
        for r in raiders {
            let u = self.unit(r).unwrap();
            if !healthy(self, r) {
                // Home to defend, once: it leaves the raid and joins the army (no one heals machines).
                self.move_to(r, rally.x, rally.y);
                continue;
            }
            keep.push(r);
            let (ux, uy, idle) = (u.x, u.y, u.task == Task::Idle);
            let hunting = matches!(u.task, Task::Attack { target, .. }
                if self.unit(target).is_some_and(|t| t.kind.def().worker));
            if hunting {
                continue;
            }
            let prey = self
                .units
                .iter()
                .filter(|o| o.team == self.foe() && o.kind.def().worker && self.ai_sees(o.x, o.y))
                .min_by(|a, b| {
                    dist(a.x, a.y, ux, uy)
                        .partial_cmp(&dist(b.x, b.y, ux, uy))
                        .unwrap()
                })
                .map(|o| o.id);
            // Harvesters come first: a raider drops whatever it auto-targeted on the way once it sees one.
            match prey {
                Some(p) => self.attack_ent(r, p),
                None if idle => self.attack_move(r, tx, ty),
                None => {}
            }
        }
        self.ai_mut().raiders = keep;
    }

    /// Attack a target if this unit's weapon can hit it, otherwise attack-move to where it is.
    pub(crate) fn engage(&mut self, a: Id, target: Id) {
        if self.can_hit(a, target) {
            self.attack_ent(a, target);
        } else if let Some((x, y)) = self.geo(target).map(|g| g.center()) {
            self.attack_move(a, x, y);
        }
    }

    /// Intruders near our buildings, repairs once the fight is over, and what the AI knows of enemy flyers.
    pub(crate) fn ai_watch(&mut self, brain: &mut Brain) {
        let Brain {
            e, t, harv, my_b, ..
        } = brain.clone();
        // An enemy near our buildings (answered by the army below; also stops saving for research).
        let mut intruder = None;
        'scan: for u in &self.units {
            if u.team != self.foe() || !self.ai_sees(u.x, u.y) {
                continue;
            }
            for &bid in &my_b {
                let b = self.bldg(bid).unwrap();
                if dist(u.x, u.y, b.x, b.y) < 420.0 + b.r {
                    intruder = Some(u.id);
                    break 'scan;
                }
            }
        }
        // Repairs once the fighting at home is over: one harvester on the worst-hit building at a time.
        if intruder.is_none()
            && self.factions[e as usize].repairs
            && !self
                .units
                .iter()
                .any(|u| u.team == e && matches!(u.task, Task::Repair { .. }))
        {
            let worst = my_b
                .iter()
                .filter_map(|&id| self.bldg(id))
                .filter(|b| b.done && b.hp < b.maxhp * 0.7)
                // with a little money in hand for it (else harvester after harvester walks over and gives up)
                .filter(|b| {
                    let c = b.kind.def().cost;
                    self.can_afford(e, [c[0].min(10), c[1].min(10)])
                })
                .min_by(|p, q| {
                    (p.hp / p.maxhp)
                        .partial_cmp(&(q.hp / q.maxhp))
                        .unwrap()
                        .then(p.id.cmp(&q.id))
                })
                .map(|b| (b.id, b.x, b.y));
            if let Some((bid, bx, by)) = worst
                && let Some(h) = self.free_builder(&harv, bx, by)
            {
                self.start_repair(h, bid);
            }
        }
        let seen_air = self
            .units
            .iter()
            .filter(|u| {
                u.team == self.foe()
                    && u.kind.def().air
                    && u.kind.def().armed()
                    && self.ai_sees(u.x, u.y)
            })
            .count();
        let enemy_air = if t < self.ai().seen_air_until {
            seen_air.max(2)
        } else {
            seen_air
        };
        let lancers = self
            .units
            .iter()
            .filter(|u| u.team == e && u.kind == self.factions[e as usize].ai.anti_air)
            .count();

        brain.intruder = intruder;
        brain.enemy_air = enemy_air;
        brain.lancers = lancers;
    }

    /// The army: jump intruders, Wasp raids, waves to where the player is believed to be, retreat, regroup.
    pub(crate) fn ai_army(&mut self, brain: &mut Brain) {
        let Brain {
            t,
            army,
            rally,
            intruder,
            ..
        } = brain.clone();
        if let Some(intr) = intruder {
            self.ai_defend(&army, intr, rally);
        }
        // Raids on the enemy's workers (raiders stay out of the waves).
        let raider = self.factions[self.seat() as usize].ai.raider;
        let wasps: Vec<Id> = army
            .iter()
            .copied()
            .filter(|&a| self.unit(a).is_some_and(|u| u.kind == raider))
            .collect();
        self.tend_raiders(&wasps, rally);
        let raiders = self.ai().raiders.clone();
        let army: Vec<Id> = army.into_iter().filter(|a| !raiders.contains(a)).collect();

        // Waves go where the AI believes the enemy is (it scouts and remembers; it does not see through fog).
        let goal = self.attack_target();
        self.ai_launch_wave(&army, t, goal);
        let ai = self.ai();
        if let Some(attackers) = ai.attackers.clone().filter(|_| ai.attacking) {
            self.ai_steer_wave(&army, &attackers, t, rally, goal);
        } else {
            // At home: stragglers back to the rally point.
            for &a in &army {
                let u = self.unit(a).unwrap();
                if u.task == Task::Idle && dist(u.x, u.y, rally.x, rally.y) > 160.0 {
                    let ox = (self.rnd() - 0.5) * 120.0;
                    let oy = (self.rnd() - 0.5) * 120.0;
                    self.move_to(a, rally.x + ox, rally.y + oy);
                }
            }
        }
    }

    /// Defense: anything near our buildings gets jumped by the army at home (idle, walking, or attack-moving near
    /// the rally point). Units that cannot hit it (a flyer, say) are not dragged around.
    fn ai_defend(&mut self, army: &[Id], intr: Id, rally: Pt) {
        for &a in army {
            let u = self.unit(a).unwrap();
            let go = match u.task {
                Task::Idle | Task::Move { .. } => true,
                Task::AMove { .. } => dist(u.x, u.y, rally.x, rally.y) < 300.0,
                _ => false,
            };
            if go && self.can_hit(a, intr) {
                self.attack_ent(a, intr);
            }
        }
    }

    /// Send the whole army out once it is big enough (fewer, stronger units for a race with a smaller wave scale)
    /// and the difficulty's first-wave time and gap have passed.
    fn ai_launch_wave(&mut self, army: &[Id], t: f64, (gx, gy): (f64, f64)) {
        let d = &DIFF[self.diff];
        let ai = self.ai();
        let need =
            (ai.wave as f64 * self.factions[self.seat() as usize].ai.wave_scale).ceil() as usize;
        if ai.attacking || army.len() < need || t - ai.last_wave <= d.gap || t <= d.first {
            return;
        }
        let ai = self.ai_mut();
        ai.last_wave = t;
        ai.wave += d.wave_grow;
        ai.attacking = true;
        ai.wave_size = army.len();
        for &a in army {
            let ox = (self.rnd() - 0.5) * 80.0;
            let oy = (self.rnd() - 0.5) * 80.0;
            self.attack_move(a, gx + ox, gy + oy);
        }
        self.ai_mut().attackers = Some(army.to_vec());
    }

    /// A wave out: over when it is gone; home when most of it fell or it searched four minutes and found
    /// nothing; else its idle units go for the nearest enemy building it knows of (or sweep where it believes the
    /// enemy is).
    fn ai_steer_wave(
        &mut self,
        army: &[Id],
        attackers: &[Id],
        t: f64,
        rally: Pt,
        (gx, gy): (f64, f64),
    ) {
        let ai = self.ai();
        let wave_size = ai.wave_size;
        let lost = ai.known.is_empty() && t - ai.last_wave > 240.0;
        let alive: Vec<Id> = army
            .iter()
            .copied()
            .filter(|a| attackers.contains(a))
            .collect();
        if alive.is_empty() {
            self.ai_mut().attacking = false;
        } else if lost || (wave_size >= 4 && alive.len() * 10 < wave_size * 4) {
            // Pull the survivors back instead of feeding them in one by one.
            for a in alive {
                let ox = (self.rnd() - 0.5) * 120.0;
                let oy = (self.rnd() - 0.5) * 120.0;
                self.move_to(a, rally.x + ox, rally.y + oy);
            }
            let ai = self.ai_mut();
            ai.attacking = false;
            ai.attackers = None;
            ai.last_wave = t;
        } else {
            let known: Vec<(Id, f64, f64)> =
                self.ai().known.iter().map(|k| (k.0, k.1, k.2)).collect();
            for a in alive {
                let u = self.unit(a).unwrap();
                if u.task != Task::Idle {
                    continue;
                }
                let (ux, uy) = (u.x, u.y);
                let best = known
                    .iter()
                    .filter(|k| self.bldg(k.0).is_some())
                    .min_by(|p, q| {
                        dist(ux, uy, p.1, p.2)
                            .partial_cmp(&dist(ux, uy, q.1, q.2))
                            .unwrap()
                    });
                match best {
                    Some(&(b, bx, by)) if dist(ux, uy, bx, by) < 700.0 => self.engage(a, b),
                    Some(&(_, bx, by)) => self.attack_move(a, bx, by),
                    // Nothing known left: sweep the enemy's start, then the shard fields around it.
                    None => self.attack_move(a, gx, gy),
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::data::*;
    use crate::world::World;

    #[test]
    fn a_wave_prefers_production_to_a_lone_forward_depot() {
        // The AI knows a forward Depot first and a Garrison second, not the headquarters: the Garrison is the goal.
        let mut w = World::new(17, 1);
        let depot = w.make_building(BldgKind::Depot, PLAYER, 40, 20, true);
        let rax = w.make_building(BldgKind::Barracks, PLAYER, 12, 40, true);
        w.ai_turn = ENEMY;
        let (d, r) = (w.bldg(depot).unwrap().clone(), w.bldg(rax).unwrap().clone());
        w.ai_mut().known = vec![(depot, d.x, d.y, false), (rax, r.x, r.y, false)];
        assert_eq!(w.attack_target(), (r.x, r.y));
        // With its headquarters known, that comes first.
        let core = w
            .bldgs
            .iter()
            .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
            .unwrap()
            .clone();
        w.ai_mut().known.push((core.id, core.x, core.y, true));
        assert_eq!(w.attack_target(), (core.x, core.y));
    }
}
