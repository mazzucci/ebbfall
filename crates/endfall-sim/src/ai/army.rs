//! The AI's army: watching for intruders, repairs, research and saving, production, defence, raids and waves.

use super::*;

/// Unspent ether the AI counts as piling up (it then leans on its ether-hungry specialists).
const ETHER_FLOAT: i32 = 200;

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

    /// Research, and saving up for it or for an expansion (never while threatened, never for long).
    pub(crate) fn ai_research(&mut self, brain: &mut Brain) {
        let Brain {
            e,
            t,
            my_b,
            intruder,
            enemy_air,
            lancers,
            expand,
            ..
        } = brain.clone();
        // Research: weapons and armor in turn, starting earlier on harder levels, once any expansion is down.
        // Until it can afford the next level it saves up (no new units), but never while under attack or short
        // of Lancers against flyers, and for at most SAVE_MAX seconds at a time.
        const SAVE_MAX: f64 = 30.0;
        let research_from = [600.0, 420.0, 300.0][self.diff];
        let threatened = intruder.is_some() || (enemy_air > 0 && lancers < enemy_air * 2);
        let mut saving = false;
        if t > research_from && !expand {
            for &bid in &my_b {
                let Some(b) = self.bldg(bid) else { continue };
                if b.kind.def().researches.is_empty() || !b.done || b.research.is_some() {
                    continue;
                }
                // The lowest level first (the earlier upgrade on a tie).
                let levels = self.upgrades[e as usize];
                let mut order = UPGRADES;
                order.sort_by_key(|u| (levels[u.index()], u.index()));
                let busy = |w: &World, up: Upgrade| {
                    w.bldgs
                        .iter()
                        .any(|o| o.team == e && o.research.is_some_and(|(u, _)| u == up))
                };
                let here = b.kind.def().researches;
                let Some(up) = order.into_iter().find(|&up| {
                    here.contains(&up)
                        && self.upgrades[e as usize][up.index()] < MAX_UPGRADE
                        && !busy(self, up)
                }) else {
                    continue;
                };
                let level = self.upgrades[e as usize][up.index()] + 1;
                if self.can_afford(e, up.cost(level)) {
                    let _ = self.start_research(bid, up);
                } else {
                    saving = true;
                }
            }
        }
        // Saving up for an expansion works the same way.
        if expand && !self.can_afford(e, self.factions[e as usize].hq.def().cost) {
            saving = true;
        }
        let ai = self.ai_mut();
        if saving && !threatened && t >= ai.no_save_until {
            let since = *ai.saving_since.get_or_insert(t);
            if t - since > SAVE_MAX {
                ai.saving_since = None;
                ai.no_save_until = t + 30.0; // spend for a while before saving again
                saving = false;
            }
        } else {
            ai.saving_since = None;
            saving = false;
        }

        brain.saving = saving;
    }

    /// Production: the right unit from each building, rally points, nothing while saving.
    pub(crate) fn ai_produce(&mut self, brain: &mut Brain) {
        let Brain {
            e,
            my_b,
            enemy_air,
            rally,
            saving,
            want,
            ..
        } = brain.clone();
        // Production. Barracks answer enemy flyers (as far as the AI knows) with Lancers, bring a Medic per six
        // Troopers and, once the Forge stands, a Vanguard per two.
        let mine = |w: &World, k: UnitKind| {
            w.units
                .iter()
                .filter(|u| u.team == e && u.kind == k)
                .count()
                + w.bldgs
                    .iter()
                    .filter(|b| b.team == e)
                    .flat_map(|b| b.queue.iter())
                    .filter(|&&q| q == k)
                    .count()
        };
        for &bid in &my_b {
            let Some(b) = self.bldg(bid) else { continue };
            if !b.done || b.kind.def().hq || b.kind.def().trains.is_empty() {
                continue;
            }
            let s = &self.factions[e as usize].ai;
            // The main factory answers enemy flyers, then mixes its specialists in by ratio (each once its
            // requirement stands: a Vanguard per two Troopers once the Forge stands beats massed infantry).
            // Ether piling up (the line unit costs none) halves the ratios: spend it on specialists.
            let floating = self.res[e as usize][1] >= ETHER_FLOAT;
            let mixed = s.mix.iter().find(|&&(k, per)| {
                let per = if floating { per.div_ceil(2) } else { per };
                k.def()
                    .req
                    .is_none_or(|r| self.ai_count(&my_b, true, r) >= 1)
                    && (mine(self, k) + 1) * per <= mine(self, s.basic)
            });
            let u = if b.kind == s.rax && enemy_air > 0 && mine(self, s.anti_air) < enemy_air * 2 {
                s.anti_air
            } else if b.kind == s.rax
                && let Some(&(k, _)) = mixed
            {
                k
            } else if b.kind == s.air && mine(self, s.raider) >= 6 {
                continue;
            } else {
                b.kind.def().trains[0]
            };
            // Short of ether for the specialist? Troopers (shards only) rather than an idle barracks. Short of
            // shards it waits for them instead, as a Trooper would only delay the specialist.
            let u = if self.res[e as usize][1] >= u.def().cost[1] {
                u
            } else {
                b.kind.def().trains[0]
            };
            let qlen = b.queue.len();
            if b.rally.is_none() {
                self.set_rally(bid, rally.x, rally.y, None);
            }
            if qlen < 2 && !saving {
                let c = u.def().cost;
                if self.can_afford(e, c)
                    && (want != Some(self.factions[e as usize].supply)
                        || self.res[e as usize][0] > c[0] + 100)
                {
                    let _ = self.queue_unit(bid, u);
                }
            }
        }
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

    #[test]
    fn shards_piling_up_with_every_factory_busy_call_for_one_more() {
        let mut w = World::new(17, 1);
        w.ai_turn = ENEMY;
        let rax = w.make_building(BldgKind::Barracks, ENEMY, 40, 12, true);
        let my_b = vec![rax];
        w.res[ENEMY as usize] = [500, 0];
        assert_eq!(
            w.extra_rax(ENEMY, &my_b),
            0,
            "an idle factory spends them first"
        );
        w.bldgs
            .iter_mut()
            .find(|b| b.id == rax)
            .unwrap()
            .queue
            .push(UnitKind::Trooper);
        assert_eq!(w.extra_rax(ENEMY, &my_b), 1, "busy, and shards in the bank");
        w.res[ENEMY as usize] = [300, 0];
        assert_eq!(w.extra_rax(ENEMY, &my_b), 0, "not piling up");
    }
}
