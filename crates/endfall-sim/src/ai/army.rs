//! The AI's army: watching for intruders, repairs, defence, raids and waves (research is in research.rs, production
//! in produce.rs).

use super::*;

/// A known enemy base this far (px) from a wave's goal draws a second prong; GUARDS units stay at its own
/// expansion.
const SECOND_PRONG_GAP: f64 = 15.0 * TILE;
const GUARDS: usize = 3;

/// The longest the guided first game holds the opponent's waves back (s).
pub const HOLD_WAVES_MAX: f64 = 360.0;

impl World {
    /// Where a wave goes: the enemy headquarters it knows of, else a production building, else any building it
    /// knows (a lone forward Depot or Spire no longer draws the whole wave away), else the sweep. The foe's first
    /// (the nearest enemy still in: a wave does not cross the map past it), then any enemy's.
    pub(crate) fn attack_target(&self) -> (f64, f64) {
        let ai = self.ai();
        let production = |id: Id| {
            self.bldg(id)
                .is_some_and(|b| !b.kind.def().trains.is_empty())
        };
        let foe = self.foe();
        let pick = |only_foe: bool| {
            let of = |k: &&(Id, f64, f64, bool, u8)| !only_foe || k.4 == foe;
            let known = || ai.known.iter().filter(of);
            known()
                .find(|k| k.3)
                .or_else(|| known().find(|k| production(k.0)))
                .or_else(|| known().next())
        };
        if let Some(k) = pick(true).or_else(|| pick(false)) {
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
                .filter(|o| self.hostile(o.team) && o.kind.def().worker && self.ai_sees_unit(o))
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
            if !self.hostile(u.team) || !self.ai_sees_unit(u) {
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
        // With more than one enemy still in, how many armed enemies are at our buildings (another may come while our
        // wave is out at the foe's; a duel's waves meet on the way).
        let n = self.seats() as u8;
        let raid = if (0..n)
            .filter(|&s| self.hostile(s) && !self.out[s as usize])
            .count()
            > 1
        {
            self.units
                .iter()
                .filter(|u| self.hostile(u.team) && u.kind.def().threat() && self.ai_sees_unit(u))
                .filter(|u| {
                    my_b.iter()
                        .filter_map(|&id| self.bldg(id))
                        .any(|b| dist(u.x, u.y, b.x, b.y) < 420.0 + b.r)
                })
                .count()
        } else {
            0
        };
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
                self.hostile(u.team)
                    && u.kind.def().air
                    && u.kind.def().armed()
                    && self.ai_sees_unit(u)
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
        brain.raid = raid;
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
            raid,
            ..
        } = brain.clone();
        if let Some(intr) = intruder {
            self.ai_defend(&army, intr, rally);
        }
        self.recall_wave(&army, raid, intruder, t);
        // Raids on the enemy's workers (raiders stay out of the waves).
        let raider = self.factions[self.seat() as usize].ai.raider;
        let wasps: Vec<Id> = army
            .iter()
            .copied()
            .filter(|&a| self.unit(a).is_some_and(|u| u.kind == raider))
            .collect();
        if self.level().raids {
            self.tend_raiders(&wasps, rally);
        }
        let raiders = self.ai().raiders.clone();
        let army: Vec<Id> = army.into_iter().filter(|a| !raiders.contains(a)).collect();
        // Guards at its own expansion stay out of the waves too (picked from what is left: not the raiders).
        let army = self.tend_guards(army);

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

    /// Home, wave: with `raid` armed enemies at our buildings (any enemy's: a third player's, or the foe's own wave
    /// that passed ours on the way), three or more and more than the army at home, the wave out comes back to fight
    /// them (as when most of it fell, the next one waits its gap).
    fn recall_wave(&mut self, army: &[Id], raid: usize, intruder: Option<Id>, t: f64) {
        let ai = self.ai();
        if raid < 3 || !ai.attacking {
            return;
        }
        let Some(attackers) = ai.attackers.clone() else {
            return;
        };
        let home = army.iter().filter(|a| !attackers.contains(a)).count();
        let Some((x, y)) = intruder.and_then(|i| self.unit(i)).map(|u| (u.x, u.y)) else {
            return;
        };
        if raid < 3 || raid <= home {
            return;
        }
        for &a in army.iter().filter(|a| attackers.contains(a)) {
            self.attack_move(a, x, y);
        }
        let ai = self.ai_mut();
        ai.attacking = false;
        ai.attackers = None;
        ai.last_wave = t;
    }

    /// Send the whole army out once it is big enough (fewer, stronger units for a race with a smaller wave scale)
    /// and the difficulty's first-wave time and gap have passed.
    fn ai_launch_wave(&mut self, army: &[Id], t: f64, (gx, gy): (f64, f64)) {
        let d = self.level();
        let ai = self.ai();
        let need =
            (ai.wave as f64 * self.factions[self.seat() as usize].ai.wave_scale).ceil() as usize;
        let held = self.hold_waves && t < HOLD_WAVES_MAX; // (the guided first game: until the player is ready)
        if held || ai.attacking || army.len() < need || t - ai.last_wave <= d.gap || t <= d.first {
            return;
        }
        let ai = self.ai_mut();
        ai.last_wave = t;
        ai.wave = (ai.wave + d.wave_grow).min(d.wave_max);
        ai.attacking = true;
        ai.wave_size = army.len();
        // A second prong: with a big enough wave and another base of the foe known well away from the goal (an
        // expansion), its fastest third goes there while the rest hits the goal.
        let foe = self.foe();
        let second = self
            .ai()
            .known
            .iter()
            .filter(|k| {
                d.prong
                    && k.3
                    && k.4 == foe
                    && self.bldg(k.0).is_some()
                    && dist(k.1, k.2, gx, gy) > SECOND_PRONG_GAP
            })
            .map(|k| (k.1, k.2))
            .next();
        let mut order: Vec<Id> = army.to_vec();
        order.sort_by(|&p, &q| {
            let (sp, sq) = (self.u(p).kind.def().speed, self.u(q).kind.def().speed);
            sq.partial_cmp(&sp).unwrap().then(p.cmp(&q))
        });
        let split = if second.is_some() && army.len() >= 6 {
            army.len() / 3
        } else {
            0
        };
        for (i, &a) in order.iter().enumerate() {
            let (tx, ty) = if i < split { second.unwrap() } else { (gx, gy) };
            let ox = (self.rnd() - 0.5) * 80.0;
            let oy = (self.rnd() - 0.5) * 80.0;
            self.attack_move(a, tx + ox, ty + oy);
        }
        self.ai_mut().attackers = Some(army.to_vec());
    }

    /// Up to GUARDS units kept at its own expansion (out of the waves): the nearest ones not out attacking, back
    /// beside it when idle. Returns the rest of the army.
    fn tend_guards(&mut self, army: Vec<Id>) -> Vec<Id> {
        let seat = self.seat();
        let home = self.map.bases[seat as usize];
        let (hx, hy) = ((home.0 as f64 + 2.0) * TILE, (home.1 as f64 + 2.0) * TILE);
        let expansion = self
            .bldgs
            .iter()
            .filter(|b| {
                b.team == seat && b.done && b.kind.def().hq && dist(b.x, b.y, hx, hy) > 8.0 * TILE
            })
            .map(|b| (b.x, b.y))
            .next();
        let Some((ex, ey)) = expansion else {
            self.ai_mut().guards.clear();
            return army;
        };
        let out = self.ai().attackers.clone().unwrap_or_default();
        let raider = self.factions[seat as usize].ai.raider;
        let mut guards: Vec<Id> = self
            .ai()
            .guards
            .iter()
            .copied()
            .filter(|g| army.contains(g))
            .collect();
        let mut free: Vec<Id> = army
            .iter()
            .copied()
            .filter(|a| {
                let d = self.u(*a).kind.def();
                // (walking fighters: not a raider's kind, a flyer or a capital giant)
                !guards.contains(a)
                    && !out.contains(a)
                    && d.armed()
                    && !d.air
                    && !d.capital
                    && self.u(*a).kind != raider
            })
            .collect();
        free.sort_by(|&p, &q| {
            let (up, uq) = (self.u(p), self.u(q));
            dist(up.x, up.y, ex, ey)
                .partial_cmp(&dist(uq.x, uq.y, ex, ey))
                .unwrap()
                .then(p.cmp(&q))
        });
        guards.extend(free.into_iter().take(GUARDS.saturating_sub(guards.len())));
        for &g in &guards {
            let u = self.u(g);
            if u.task == Task::Idle && dist(u.x, u.y, ex, ey) > 5.0 * TILE {
                self.attack_move(g, ex, ey);
            }
        }
        self.ai_mut().guards = guards.clone();
        army.into_iter().filter(|a| !guards.contains(a)).collect()
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
    use crate::ai::Brain;
    use crate::data::*;
    use crate::map::{Id, MapKind, MapSize};
    use crate::path::Pt;
    use crate::world::{Task, World};

    /// Seat 1's AI with its wave of six Troopers out by the map's centre and two at home, as four Troopers of
    /// another seat stand at its Core: the army phases' turn. Whether the wave was called home.
    fn raided(seats: usize, raider: u8) -> bool {
        let mut w = World::with_size(
            17,
            1,
            MapKind::Standard,
            MapSize::square(96),
            0,
            &vec![&HUMANS; seats],
        );
        w.ai_turn = 1;
        let (bx, by) = w.map.bases[1];
        let (hx, hy) = ((bx as f64 + 2.0) * TILE, (by as f64 + 2.0) * TILE);
        let trooper =
            |w: &mut World, team: u8, x: f64, y: f64| w.make_unit(UnitKind::Trooper, team, x, y);
        let wave: Vec<Id> = (0..6)
            .map(|i| trooper(&mut w, 1, 1500.0 + i as f64 * 30.0, 1500.0))
            .collect();
        let home: Vec<Id> = (0..2)
            .map(|i| trooper(&mut w, 1, hx + 200.0, hy + i as f64 * 30.0))
            .collect();
        for i in 0..4 {
            trooper(&mut w, raider, hx + 100.0, hy + i as f64 * 30.0);
        }
        w.update_fog();
        let ai = w.ai_mut();
        ai.attacking = true;
        ai.attackers = Some(wave.clone());
        ai.wave_size = 6;
        ai.last_wave = 0.0;
        let my_b = w
            .bldgs
            .iter()
            .filter(|b| b.team == 1)
            .map(|b| b.id)
            .collect();
        let mut b = Brain {
            e: 1,
            t: 100.0,
            my_b,
            army: wave.iter().chain(&home).copied().collect(),
            rally: Pt { x: hx, y: hy },
            ..Brain::default()
        };
        w.ai_watch(&mut b);
        w.ai_army(&mut b);
        !w.ai().attacking
            && wave.iter().all(|&a| matches!(w.u(a).task, Task::AMove { x, y } if (x - hx).abs() + (y - hy).abs() < 400.0))
    }

    #[test]
    fn a_wave_comes_home_when_another_enemy_raids_its_base() {
        assert!(
            raided(4, 3),
            "four seats: a neighbour raids while the wave is out at the foe"
        );
        assert!(raided(4, 1 + 1), "any enemy");
        // Two seats: a duel's waves meet on the way, and the rules stay as they were.
        assert!(!raided(2, 0), "two seats: the wave stays out");
    }

    #[test]
    fn a_wave_goes_for_the_foe_before_another_enemy() {
        // Four seats round a 96x96 map: seat 1's foe is its partner, seat 0. It knows seat 3's headquarters (across
        // the map) first and a Garrison of seat 0's: the Garrison is the goal; with only seat 3's known, that.
        let mut w = World::with_size(
            17,
            1,
            MapKind::Standard,
            MapSize::square(96),
            0,
            &[&HUMANS; 4],
        );
        w.ai_turn = 1;
        assert_eq!(w.foe(), 0);
        let hq = |w: &World, s: u8| {
            w.bldgs
                .iter()
                .find(|b| b.team == s && b.kind.def().hq)
                .unwrap()
                .clone()
        };
        let far = hq(&w, 3);
        let (bx, by) = w.map.bases[0];
        let rax = w.make_building(BldgKind::Barracks, 0, bx + 6, by + 6, true);
        let r = w.bldg(rax).unwrap().clone();
        w.ai_mut().known = vec![(far.id, far.x, far.y, true, 3)];
        assert_eq!(
            w.attack_target(),
            (far.x, far.y),
            "only another enemy's known"
        );
        w.ai_mut().known.push((rax, r.x, r.y, false, 0));
        assert_eq!(w.attack_target(), (r.x, r.y), "the foe's first");
    }

    #[test]
    fn a_wave_prefers_production_to_a_lone_forward_depot() {
        // The AI knows a forward Depot first and a Garrison second, not the headquarters: the Garrison is the goal.
        let mut w = World::new(17, 1);
        let depot = w.make_building(BldgKind::Depot, PLAYER, 40, 20, true);
        let rax = w.make_building(BldgKind::Barracks, PLAYER, 12, 40, true);
        w.ai_turn = ENEMY;
        let (d, r) = (w.bldg(depot).unwrap().clone(), w.bldg(rax).unwrap().clone());
        w.ai_mut().known = vec![(depot, d.x, d.y, false, 0), (rax, r.x, r.y, false, 0)];
        assert_eq!(w.attack_target(), (r.x, r.y));
        // With its headquarters known, that comes first.
        let core = w
            .bldgs
            .iter()
            .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
            .unwrap()
            .clone();
        w.ai_mut().known.push((core.id, core.x, core.y, true, 0));
        assert_eq!(w.attack_target(), (core.x, core.y));
    }

    #[test]
    fn a_big_wave_sends_a_third_at_a_known_expansion_from_hard_up() {
        for (diff, third) in [(0, 0), (1, 0), (2, 3), (3, 3)] {
            let mut w = World::new(17, diff);
            w.ai_turn = ENEMY;
            let core = w
                .bldgs
                .iter()
                .find(|b| b.team == PLAYER && b.kind.def().hq)
                .unwrap()
                .clone();
            let exp = w.make_building(BldgKind::Core, PLAYER, 30, 30, true);
            let e = w.bldg(exp).unwrap().clone();
            w.ai_mut().known = vec![(core.id, core.x, core.y, true, 0), (exp, e.x, e.y, true, 0)];
            w.ai_mut().wave = 3;
            let b = w.map.bases[ENEMY as usize];
            let army: Vec<Id> = (0..9)
                .map(|i| {
                    w.make_unit(
                        UnitKind::Trooper,
                        ENEMY,
                        (b.0 as f64 + 6.0) * 32.0 + i as f64 * 20.0,
                        (b.1 as f64 + 6.0) * 32.0,
                    )
                })
                .collect();
            w.ai_launch_wave(&army, 1000.0, (core.x, core.y));
            let to_exp = army
            .iter()
            .filter(|&&a| matches!(w.u(a).task, Task::AMove { x, y } if ((x - e.x).powi(2) + (y - e.y).powi(2)).sqrt() < 100.0))
            .count();
            assert_eq!(
                to_exp, third,
                "a third to the expansion (none on Medium): diff {diff}"
            );
        }
    }

    #[test]
    fn three_units_stay_home_at_its_expansion() {
        let mut w = World::new(17, 1);
        w.ai_turn = ENEMY;
        let b = w.map.bases[ENEMY as usize];
        let (ex, ey) = if b.0 > 30 {
            (b.0 - 18, b.1)
        } else {
            (b.0 + 18, b.1)
        };
        w.make_building(BldgKind::Core, ENEMY, ex, ey.clamp(4, 56), true);
        let mut army: Vec<Id> = (0..6)
            .map(|i| {
                w.make_unit(
                    UnitKind::Trooper,
                    ENEMY,
                    (b.0 as f64 + 4.0) * 32.0 + i as f64 * 20.0,
                    (b.1 as f64 + 4.0) * 32.0,
                )
            })
            .collect();
        // A Wasp right by the expansion is still not a guard (it raids).
        let (exx, exy) = (
            (ex as f64 + 2.0) * 32.0,
            (ey.clamp(4, 56) as f64 + 2.0) * 32.0,
        );
        let wasp = w.make_unit(UnitKind::Wasp, ENEMY, exx + 40.0, exy);
        army.push(wasp);
        let rest = w.tend_guards(army.clone());
        assert_eq!(rest.len(), 4);
        assert_eq!(w.ai().guards.len(), 3);
        assert!(
            !w.ai().guards.contains(&wasp) && rest.contains(&wasp),
            "not the Wasp"
        );
        // Kept, not re-picked, on the next turn.
        let again = w.tend_guards(army.clone());
        assert_eq!(again, rest);
    }
}
