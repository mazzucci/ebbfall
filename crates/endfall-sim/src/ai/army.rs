//! The AI's army: watching for intruders, repairs, defense, raids and waves (research is in research.rs, production
//! in produce.rs).

use super::*;
use crate::data::radio;

/// A known enemy base this far (px) from a wave's goal draws a second prong; GUARDS units stay at its own
/// expansion.
const SECOND_PRONG_GAP: f64 = 15.0 * TILE;
const GUARDS: usize = 3;
/// A wave short of its count goes anyway with this many times the worth of the enemy army it expects (`crushing`).
const CRUSH: f64 = 3.0;
/// A wave sizes up what it meets within this many px of its units (`Diff::retreat_below`).
const CONTACT_NEAR: f64 = 8.0 * TILE;
/// For this long (s) after its wave ends, the foe's units at its buildings are chasers, not the foe coming
/// (`passive_foe`).
const CHASE_S: f64 = 90.0;

/// The longest the guided first game holds the opponent's waves back (s).
pub const HOLD_WAVES_MAX: f64 = 360.0;
/// The guided first game's first wave goes once released, and not before this (s): Easy's own first wave went at 4:00
/// before it moved to 7:45 (a newcomer not hit before about 8:00); the guide holds the wave itself, until its army is
/// ready, and a wave it waits minutes for after that would leave the newcomer standing.
pub const GUIDED_FIRST: f64 = 240.0;
/// The most fighters (counted with those queued) the opponent of the guided first game has while its waves are held:
/// half the guide's army of six line units and two anti-air, and its first wave's size on Easy (`Diff::wave`).
pub const GUIDED_ARMY: usize = 4;
/// The most it has once they are released, for the rest of the game: fewer than its first wave, so it sends no other
/// (Easy's next wave is six) and the guide's last step, an attack with ten, wins (with six it rarely did).
pub const GUIDED_ARMY_AFTER: usize = 3;
/// The range: a wave's forward Uplink goes this many tiles past the edge of its side's range along its way, never
/// nearer its goal than `RELAY_GOAL_ROOM` tiles, once the wave's front is within `RELAY_FRONT` tiles of that spot (or
/// past it).
const RELAY_AHEAD: f64 = 7.0;
const RELAY_GOAL_ROOM: f64 = 10.0;
const RELAY_FRONT: f64 = 4.0;
/// The push: machines kept home (their goal out of coverage) before the next Uplink goes up towards it.
const PUSH_MACHINES: usize = 4;
/// The push: how far (tiles) past its coverage's edge a goal may lie for its machines to go with the wave.
const PUSH_REACH: f64 = 8.0;
/// The push's next Uplink goes this many tiles inside its coverage's edge towards the goal.
const PUSH_INSIDE: f64 = 3.0;
/// A machine of a wave held at its coverage's edge: within `EDGE_NEAR` tiles of it (or past it), quiet (neither firing
/// nor hit) for `HELD_QUIET` s.
const EDGE_NEAR: f64 = 1.5;
const HELD_QUIET: f64 = 20.0;
/// A wave out this long (s) whose every unit has been quiet (neither firing nor hit) as long is over, wherever it stands
/// (a wave of two left standing short of the foe's base for eight minutes kept a winning army of 6,000 at home).
const WAVE_QUIET: f64 = 90.0;
/// A gathering wave goes in once this share of its main body stands within `STAGE_NEAR` px of its staging point.
const STAGE_SHARE: f64 = 0.75;
const STAGE_NEAR: f64 = 4.0 * TILE;
/// Supply short of the cap that counts as at the cap: a seat 1 or 2 short trains little more than one more unit.
pub(crate) const CAP_SLACK: i32 = 2;

/// A unit's worth in an army: its cost in gold.
fn army_worth(k: UnitKind) -> f64 {
    k.def().cost[0] as f64
}

impl World {
    /// The guided first game: its hold on the opponent's waves, set by `guided_hold` (the client's `holdWaves`): no
    /// wave while on (until `HOLD_WAVES_MAX` s at most), and meanwhile the opponent's army stops growing at
    /// `GUIDED_ARMY`; released, the first wave goes (from `GUIDED_FIRST`, whatever its level's first wave), and its
    /// army grows to `GUIDED_ARMY_AFTER` at most for the rest of
    /// the game (`guided_army_full`). It raises no towers by the clock either (`ai_build`): a Lookout under repair
    /// stopped every attack a newcomer's army could make. Its workers and other buildings are as on its level.
    pub fn guided_hold(&mut self, on: bool) {
        self.hold_waves = on;
        self.guided |= on;
    }

    /// Whether the waves are held at game time `t` (s).
    pub(crate) fn waves_held(&self, t: f64) -> bool {
        self.hold_waves && t < HOLD_WAVES_MAX
    }

    /// Whether seat `e`, an AI of the guided first game, trains no more fighters for now: `GUIDED_ARMY` fighters
    /// (armed, not workers; queued ones counted) already its while its waves are held, `GUIDED_ARMY_AFTER` after.
    pub(crate) fn guided_army_full(&self, e: u8, t: f64) -> bool {
        if !self.guided {
            return false;
        }
        let cap = if self.waves_held(t) {
            GUIDED_ARMY
        } else {
            GUIDED_ARMY_AFTER
        };
        let fighter = |k: UnitKind| !k.def().worker && k.def().armed();
        let have = self
            .units
            .iter()
            .filter(|u| u.team == e && fighter(u.kind))
            .count()
            + self
                .bldgs
                .iter()
                .filter(|b| b.team == e)
                .flat_map(|b| b.queue.iter())
                .filter(|&&k| fighter(k))
                .count();
        have >= cap
    }

    /// Where a wave goes: the enemy headquarters it knows of, else a production building, else any building it
    /// knows (a lone forward Depot or Spire no longer draws the whole wave away), else the sweep. The foe's first
    /// (the nearest enemy still in: a wave does not cross the map past it), then any enemy's, once the foe's start
    /// has been looked at (explored, by this seat or an ally: it sees what they see, so it may know a farther enemy's
    /// base before its foe's); until then, the foe's start.
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
        if let Some(k) = pick(true) {
            return (k.1, k.2);
        }
        if let Some(k) = pick(false) {
            let (fx, fy) = (self.foe_base().0 * TILE, self.foe_base().1 * TILE);
            return if self.ai_explored(fx, fy) {
                (k.1, k.2)
            } else {
                (fx, fy)
            };
        }
        self.sweep_point()
    }

    /// Raiders (two or more of the race's raider kind: Riders, Buggies) raid the player's harvesters, and with none in
    /// sight an enemy Market it knows of out in the open (away from every enemy headquarters); badly hurt ones go home.
    pub(crate) fn tend_raiders(&mut self, candidates: &[Id], rally: Pt) {
        let mut raiders: Vec<Id> = self
            .ai()
            .raiders
            .iter()
            .copied()
            .filter(|&r| self.unit(r).is_some())
            .collect();
        let healthy = |w: &World, id: Id| w.unit(id).is_some_and(|u| u.hp >= u.maxhp * 0.4);
        if raiders.is_empty() {
            let fit: Vec<Id> = candidates
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
            let razing = matches!(u.task, Task::Attack { target, .. }
                if self.bldg(target).is_some_and(|b| b.kind.def().pays));
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
            match prey.or_else(|| self.remote_extractor(r, ux, uy)) {
                Some(p) if !(razing && self.bldg(p).is_some()) => self.attack_ent(r, p),
                Some(_) => {}
                None if idle => self.attack_move(r, tx, ty),
                None => {}
            }
        }
        self.ai_mut().raiders = keep;
    }

    /// The enemy Market nearest (ux, uy) that this seat has seen and that raider `r` can hit, standing out in the open:
    /// more than 12 tiles from every enemy headquarters (a raid, not an attack on a base; Markets go up in bases, so
    /// rarely).
    fn remote_extractor(&self, r: Id, ux: f64, uy: f64) -> Option<Id> {
        let cores: Vec<(f64, f64)> = self
            .bldgs
            .iter()
            .filter(|b| self.hostile(b.team) && b.kind.def().hq)
            .map(|b| (b.x, b.y))
            .collect();
        self.ai()
            .known
            .iter()
            .filter_map(|k| self.bldg(k.0))
            .filter(|b| {
                b.kind.def().pays
                    && self.hostile(b.team)
                    && self.can_hit(r, b.id)
                    && !self.spared(self.ai_turn, b) // (the guided game's: never a target)
            })
            .filter(|b| {
                cores
                    .iter()
                    .all(|&(x, y)| dist(b.x, b.y, x, y) > 12.0 * TILE)
            })
            .min_by(|a, b| {
                dist(a.x, a.y, ux, uy)
                    .partial_cmp(&dist(b.x, b.y, ux, uy))
                    .unwrap()
                    .then(a.id.cmp(&b.id))
            })
            .map(|b| b.id)
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
        // The enemy army it sees now (armed units, workers left out), by value: the most lately seen is what its next
        // wave must beat (a sighting smaller than the last one recent enough does not lower it).
        let sighted: Vec<Id> = self
            .units
            .iter()
            .filter(|u| self.hostile(u.team) && !u.kind.def().worker && u.kind.def().armed())
            .filter(|u| self.ai_sees_unit(u))
            .map(|u| u.id)
            .collect();
        let worth = |w: &World, ids: &[Id]| -> f64 {
            ids.iter()
                .filter_map(|&id| w.unit(id))
                .map(|u| army_worth(u.kind))
                .sum()
        };
        let seen = worth(self, &sighted);
        // (what it saw, less what of it has fallen since: a wave it wiped out no longer counts)
        let left = worth(self, &self.ai().army_seen_ids);
        let mine = self.own_army_worth(e);
        let age = self.level().sighting_age;
        let ai = self.ai_mut();
        ai.army_seen.0 = ai.army_seen.0.min(left);
        if seen > 0.0 && (seen >= ai.army_seen.0 || t - ai.army_seen.1 > age) {
            ai.army_seen = (seen, t, mine);
            ai.army_seen_ids = sighted;
        }
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
        // (an armed enemy at its buildings: the foe is not passive; `Diff::passive_expand`. Any of them, not only the
        // intruder answered above: a worker or a spotter nearer in id order must not hide an attack.)
        let threat = self.units.iter().any(|u| {
            self.hostile(u.team)
                && u.kind.def().threat()
                && self.ai_sees_unit(u)
                && my_b
                    .iter()
                    .filter_map(|&id| self.bldg(id))
                    .any(|b| dist(u.x, u.y, b.x, b.y) < 420.0 + b.r)
        });
        if threat {
            let ai = self.ai_mut();
            ai.attacked_at = t;
            // (the foe's units come after its wave that just ended: a chase, not the foe coming; `passive_foe`)
            if ai.attacking || t - ai.last_wave > CHASE_S {
                ai.came_at = t;
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
        // Its answer to them so far, in `anti_air` units (a Ballista is worth two Archers).
        let script = &self.factions[e as usize].ai;
        let anti_air = self
            .units
            .iter()
            .filter(|u| u.team == e)
            .map(|u| script.answer_weight(u.kind))
            .sum();
        brain.intruder = intruder;
        brain.raid = raid;
        brain.enemy_air = enemy_air;
        brain.anti_air = anti_air;
    }

    /// The army: jump intruders, Raider raids, waves to where the player is believed to be, retreat, regroup.
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
        self.leash_home_army(&army, &brain.my_b, rally);
        self.recall_wave(&army, raid, intruder, t);
        // Raids on the enemy's workers (raiders stay out of the waves).
        let raider = self.factions[self.seat() as usize].ai.raider;
        let candidates: Vec<Id> = army
            .iter()
            .copied()
            // (no machine raids since the arc: it would stop at its coverage's edge)
            .filter(|&a| {
                self.unit(a)
                    .is_some_and(|u| u.kind == raider && !radio::needs_range(u.kind))
            })
            .collect();
        if self.level().raids {
            self.tend_raiders(&candidates, rally);
        }
        let raiders = self.ai().raiders.clone();
        let army: Vec<Id> = army.into_iter().filter(|a| !raiders.contains(a)).collect();
        // Its scout (the Balloon) stays out of them too: it looks at the foe before a wave (`strong_enough`).
        let army = self.tend_scout_unit(army, rally);
        // Guards at its own expansion stay out of the waves too (picked from what is left: not the raiders).
        let army = self.tend_guards(army);
        // The home reserve stays out of them as well.
        let army = self.tend_reserve(army, rally, t);

        // Waves go where the AI believes the enemy is (it scouts and remembers; it does not see through fog).
        let goal = self.attack_target();
        // Machines need signal (the arc): with the goal out of its side's coverage they stay home, defending, and the
        // wave goes without them (else they stopped at the edge and the wave went in split); they go once coverage
        // reaches the goal (a forward Uplink).
        let seat = self.seat();
        // (near enough: the goal within `PUSH_REACH` tiles past its coverage's edge, where its machines strike it from
        // inside: the Rover's rockets reach 12)
        let covered = self.in_radio_by(seat, goal.0, goal.1, PUSH_REACH);
        let army: Vec<Id> = if covered {
            army
        } else {
            // (the push: an Uplink, then the machines. Its machines wait at its forward-most Uplink on the way, and
            // with enough of them it raises the next one past its coverage's edge towards the goal)
            let (machines, rest): (Vec<Id>, Vec<Id>) = army
                .into_iter()
                .partition(|&a| self.unit(a).is_some_and(|u| radio::needs_range(u.kind)));
            self.tend_push(&machines, &rest, goal);
            rest
        };
        self.ai_launch_wave(&army, t, goal);
        let ai = self.ai();
        if let Some(attackers) = ai.attackers.clone().filter(|_| ai.attacking) {
            self.ai_steer_wave(&army, &attackers, t, rally, goal);
            if self.ai().attacking {
                self.tend_relay(&attackers, goal);
            }
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

    /// The side's scout units (`AiScript::scout`: the Balloon) are kept out of the army: one out looking stays on its
    /// errand (`strong_enough`), the others come back to the rally when idle away from it. Returns the rest.
    fn tend_scout_unit(&mut self, army: Vec<Id>, rally: Pt) -> Vec<Id> {
        let Some(kind) = self.factions[self.seat() as usize].ai.scout else {
            return army;
        };
        let looking = self.ai().looking.map(|(id, _)| id);
        let (scouts, rest): (Vec<Id>, Vec<Id>) =
            army.into_iter().partition(|&a| self.u(a).kind == kind);
        for s in scouts {
            let u = self.u(s);
            if Some(s) != looking
                && u.task == Task::Idle
                && dist(u.x, u.y, rally.x, rally.y) > 160.0
            {
                self.move_to(s, rally.x, rally.y);
            }
        }
        rest
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

    /// The home army's chases on a leash: a unit at home (not out with the wave, nor raiding) after an enemy unit more
    /// than `CHASE_LEASH` tiles past where it counts as at our buildings (`ai_watch`'s reach) gives up and walks back to
    /// the rally. (Found on main: a player's worker that came near and ran home was chased across the map, and the
    /// chasers, idle at its base, took on its headquarters minutes before the first wave.)
    fn leash_home_army(&mut self, army: &[Id], my_b: &[Id], rally: Pt) {
        let ai = self.ai();
        let out: Vec<Id> = ai
            .attackers
            .iter()
            .flatten()
            .chain(ai.raiders.iter())
            .copied()
            .collect();
        for &a in army {
            if out.contains(&a) {
                continue;
            }
            let Task::Attack { target, .. } = self.u(a).task else {
                continue;
            };
            let Some(t) = self.unit(target) else {
                continue;
            };
            let (tx, ty) = (t.x, t.y);
            let home = my_b
                .iter()
                .filter_map(|&b| self.bldg(b))
                .any(|b| dist(tx, ty, b.x, b.y) < 420.0 + b.r + CHASE_LEASH * TILE);
            if !home {
                let ox = (self.rnd() - 0.5) * 120.0;
                let oy = (self.rnd() - 0.5) * 120.0;
                self.move_to(a, rally.x + ox, rally.y + oy);
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
        let held = self.waves_held(t); // (the guided first game: until the player is ready)
        // (at the cap a wave is as big as it gets: it goes whatever its count; and so does a wave that crushes what the
        // foe has shown of its army, `crushing`)
        let short = army.len() < need && !self.at_cap(self.seat()) && !self.crushing(army, need, t);
        // (the guided first game: its first wave when the guide releases it, `GUIDED_FIRST`)
        let first = if self.guided {
            d.first.min(GUIDED_FIRST)
        } else {
            d.first
        };
        if held || ai.attacking || short || t - ai.last_wave <= d.gap || t <= first {
            if !ai.attacking && short {
                self.ai_mut().ready_since = None;
            }
            return;
        }
        if !self.strong_enough(army, t) {
            return;
        }
        // (a clumsy level sends only its wave's size, its oldest units; the rest stay home)
        let army = if d.wave_only {
            &army[..need.min(army.len())]
        } else {
            army
        };
        let stage = if d.stage > 0.0 {
            self.stage_point((gx, gy), d.stage)
        } else {
            None
        };
        // (the tower range: a wave with machines that need range, on a level that stages, gathers at its forward-most
        // tower on the way)
        let machines = army
            .iter()
            .any(|&a| self.unit(a).is_some_and(|u| radio::needs_range(u.kind)));
        let stage = if d.stage > 0.0 && machines {
            self.turret_stage((gx, gy)).or(stage)
        } else {
            stage
        };
        let ai = self.ai_mut();
        ai.relay_off = false;
        ai.ready_since = None;
        ai.staging = stage.map(|(x, y)| (x, y, t));
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
            // (the second prong goes straight at the expansion; the main body gathers first, when it does)
            let (tx, ty) = if i < split {
                second.unwrap()
            } else {
                stage.unwrap_or((gx, gy))
            };
            let ox = (self.rnd() - 0.5) * 80.0;
            let oy = (self.rnd() - 0.5) * 80.0;
            let (px, py) = self.wave_point(a, tx + ox, ty + oy);
            self.attack_move(a, px, py);
        }
        let ai = self.ai_mut();
        ai.attackers = Some(army.to_vec());
        ai.prong = order[..split].to_vec();
    }

    /// A clumsy level's wave that gave up or fell (`Diff::wave_only`) does not grow the next: its first hit stays its first
    /// wave's size (three or four units) however often it turns back.
    fn no_growth_after_giving_up(&mut self) {
        let d = self.level();
        if d.wave_only {
            let ai = self.ai_mut();
            ai.wave = ai.wave.saturating_sub(d.wave_grow).max(d.wave);
        }
    }

    /// Coverage: where wave unit `a` is sent for (x, y): that point, or for a machine the last point of the way there
    /// inside its side's coverage (it gathers where it can stand: the machines push behind the Uplinks).
    fn wave_point(&self, a: Id, x: f64, y: f64) -> (f64, f64) {
        let u = self.u(a);
        if radio::needs_range(u.kind) {
            self.radio_leash_point(u.team, u.x, u.y, x, y)
        } else {
            (x, y)
        }
    }

    /// The rally point (else its start's middle), px.
    fn rally_or_home(&self) -> (f64, f64) {
        let home = self.map.bases[self.seat() as usize];
        self.ai().rally.map_or(
            ((home.0 as f64 + 2.0) * TILE, (home.1 as f64 + 2.0) * TILE),
            |p| (p.x, p.y),
        )
    }

    /// The range: where a wave gathers for its goal: its finished relay (`AiScript::relay`, the Uplink) nearest the
    /// goal, if that is at least four tiles nearer it than the rally point (for a people with one).
    fn turret_stage(&self, (gx, gy): (f64, f64)) -> Option<(f64, f64)> {
        let seat = self.seat();
        let tower = self.factions[seat as usize].ai.relay?;
        let (rx, ry) = self.rally_or_home();
        let from_rally = dist(rx, ry, gx, gy);
        let b = self
            .bldgs
            .iter()
            .filter(|b| b.team == seat && b.kind == tower && b.done)
            .min_by(|a, b| {
                dist(a.x, a.y, gx, gy)
                    .partial_cmp(&dist(b.x, b.y, gx, gy))
                    .unwrap()
                    .then(a.id.cmp(&b.id))
            })?;
        (dist(b.x, b.y, gx, gy) < from_rally - 4.0 * TILE).then_some((b.x, b.y))
    }

    /// The range: the leapfrog relay (`AiScript::relay`, the Uplink, once its satellite is up: later in the game).
    /// While a wave with machines is out, the AI keeps one relay site at a time going `RELAY_AHEAD` tiles past the edge
    /// of its range along the way from its rally point to the goal, once the wave's front has come that far; never
    /// holding the wave for it. A site under fire is abandoned (its cost partly back) and the wave places no other.
    fn tend_relay(&mut self, attackers: &[Id], (gx, gy): (f64, f64)) {
        let seat = self.seat();
        let Some(tower) = self.factions[seat as usize].ai.relay else {
            return;
        };
        let machines = attackers
            .iter()
            .any(|&a| self.unit(a).is_some_and(|u| radio::needs_range(u.kind)));
        if !machines || self.ai().relay_off || !self.has_req(seat, tower) {
            return;
        }
        self.raise_relay(attackers, (gx, gy), true);
    }

    /// The push (the arc: "an Uplink, then the machines"): while its goal lies out of its coverage, its machines (kept
    /// out of the waves) wait at its forward-most Uplink on the way, and once it has `PUSH_MACHINES` of them it raises
    /// the next Uplink past its coverage's edge towards the goal (one site at a time, as the wave's leapfrog does).
    fn tend_push(&mut self, machines: &[Id], rest: &[Id], goal: (f64, f64)) {
        let seat = self.seat();
        let Some(tower) = self.factions[seat as usize].ai.relay else {
            return;
        };
        let at = self
            .turret_stage(goal)
            .unwrap_or_else(|| self.rally_or_home());
        for &m in machines {
            let u = self.u(m);
            if matches!(u.task, Task::Idle) && dist(u.x, u.y, at.0, at.1) > 4.0 * TILE {
                let (x, y) = self.radio_leash_point(seat, u.x, u.y, at.0, at.1);
                self.move_to(m, x, y);
            }
        }
        if machines.len() < PUSH_MACHINES || !self.has_req(seat, tower) {
            return;
        }
        // (a site abandoned under fire lets the next go after the gap between waves)
        if self.ai().relay_off && self.ai().attacking {
            return;
        }
        self.ai_mut().relay_off = false;
        self.raise_relay(machines, goal, false);
        // (its site guarded: the army at home, idle, goes to stand by it while it rises)
        if let Some((sx, sy)) = self
            .ai()
            .relay_site
            .and_then(|id| self.bldg(id))
            .filter(|b| !b.done)
            .map(|b| (b.x, b.y))
            && !self.ai().attacking
        {
            for &a in rest {
                let u = self.u(a);
                if matches!(u.task, Task::Idle) && dist(u.x, u.y, sx, sy) > 5.0 * TILE {
                    self.attack_move(a, sx, sy);
                }
            }
        }
    }

    /// One leapfrog Uplink (`AiScript::relay`): `RELAY_AHEAD` tiles past the edge of its coverage along the way from
    /// its rally point to the goal; with `front`, only once the escort's unit nearest the goal has come about that far.
    fn raise_relay(&mut self, escort: &[Id], (gx, gy): (f64, f64), front_needed: bool) {
        let seat = self.seat();
        let Some(tower) = self.factions[seat as usize].ai.relay else {
            return;
        };
        let attackers = escort;
        // (a tower finished this tick: its range counts before the edge is looked for again)
        self.refresh_radio(false);
        // The site under way: abandoned under fire, let go once it stands (or is gone).
        if let Some(id) = self.ai().relay_site {
            match self.bldg(id).map(|b| (b.done, b.hp)) {
                Some((false, hp)) if hp < self.ai().relay_hp - 1e-9 => {
                    self.cancel_construction(id);
                    let ai = self.ai_mut();
                    ai.relay_site = None;
                    ai.relay_off = true;
                    return;
                }
                Some((false, hp)) => {
                    self.ai_mut().relay_hp = hp;
                    return;
                }
                Some((true, _)) => self.ai_mut().relay_site = None,
                None => {
                    // (destroyed before it stood: as abandoned under fire)
                    let ai = self.ai_mut();
                    ai.relay_site = None;
                    ai.relay_off = true;
                    return;
                }
            }
        }
        // The edge of its range on the way, and the spot past it: along the walkers' way from its rally point to the
        // goal, a point a tile (straight across before Nov 13: where that crossed water or rock, the Shore's channel, no
        // site was ever found and the push stood still).
        let way = self.relay_way(self.rally_or_home(), (gx, gy));
        let len = way.len() as f64 * TILE;
        if way.len() < 2 {
            return;
        }
        let Some(edge) = way
            .iter()
            .position(|&(x, y)| !self.in_radio(seat, x, y))
            .map(|i| i as f64 * TILE)
        else {
            return; // (covered all the way)
        };
        // (a wave's leapfrog past the edge, where its front stands; the push just inside it, where its machines can
        // guard the site from their coverage; either no nearer the goal than `RELAY_GOAL_ROOM`, and then worth it while
        // its coverage reaches past today's edge: the last stretch to the goal, short of a whole leap, was never covered
        // before Nov 13, and machine waves stood at the edge a few tiles short of the foe's base for good)
        let ahead = if front_needed {
            edge + RELAY_AHEAD * TILE
        } else {
            (edge - PUSH_INSIDE * TILE).max(TILE)
        };
        let at = ahead.min(len - RELAY_GOAL_ROOM * TILE);
        let reach = radio::range_of(tower, self.map.w) * TILE;
        if at < TILE || at + reach < edge + PUSH_INSIDE * TILE {
            return;
        }
        let (px, py) = way[((at / TILE) as usize).min(way.len() - 1)];
        // The wave's front (its unit nearest the goal) must be about there already (for a wave's leapfrog).
        let front = attackers
            .iter()
            .filter_map(|&a| self.unit(a))
            .map(|u| dist(u.x, u.y, gx, gy))
            .fold(f64::INFINITY, f64::min);
        if (front_needed && front > len - at + RELAY_FRONT * TILE)
            || !self.can_afford(seat, tower.def().cost)
        {
            return;
        }
        let Some(spot) = self.find_spot(tower, px / TILE, py / TILE) else {
            return;
        };
        let workers: Vec<Id> = self
            .units
            .iter()
            .filter(|u| u.team == seat && u.kind.def().worker)
            .map(|u| u.id)
            .collect();
        let (sx, sy) = (spot.0 as f64 * TILE, spot.1 as f64 * TILE);
        if let Some(b) = self.free_builder(&workers, sx, sy)
            && let Ok(id) = self.place_building(seat, tower, spot.0, spot.1, Some(b))
        {
            let hp = self.bldg(id).map_or(0.0, |b| b.hp);
            let ai = self.ai_mut();
            ai.relay_site = Some(id);
            ai.relay_hp = hp;
        }
    }

    /// The walkers' way from `from` to `to` (px), a point every tile along it from `from` (the relay's sites are looked
    /// for along it): a search over the walkable tiles, or the straight line where there is none.
    fn relay_way(&self, from: (f64, f64), to: (f64, f64)) -> Vec<(f64, f64)> {
        let foot = crate::map::Foot {
            class: Move::Walk,
            water: self.water,
        };
        let (a, b) = (
            self.map.tile_of(from.0, from.1),
            self.map.tile_of(to.0, to.1),
        );
        let mut scratch = crate::path::PathScratch::new((self.map.w * self.map.h) as usize);
        let corners: Vec<(f64, f64)> =
            crate::path::astar(&self.map, foot, &mut scratch, a.0, a.1, b.0, b.1)
                .map(|p| p.iter().map(|q| (q.x, q.y)).collect())
                .unwrap_or_else(|| vec![to]);
        let mut way = vec![from];
        let mut at = from;
        for c in corners {
            let d = dist(at.0, at.1, c.0, c.1);
            let n = (d / TILE).floor() as usize;
            for k in 1..=n {
                let f = k as f64 * TILE / d;
                way.push((at.0 + (c.0 - at.0) * f, at.1 + (c.1 - at.1) * f));
            }
            at = way.last().copied().unwrap_or(at);
            if n == 0 {
                at = c;
            }
        }
        way
    }

    /// The worth of seat `e`'s army (armed units, workers left out).
    fn own_army_worth(&self, e: u8) -> f64 {
        self.units
            .iter()
            .filter(|u| u.team == e && !u.kind.def().worker && u.kind.def().armed())
            .map(|u| army_worth(u.kind))
            .sum()
    }

    /// Whether `army` (short of the wave's count `need`) crushes the enemy army it expects: at least half the count,
    /// a sighting at all, and `CRUSH` times its worth, a stale one counted as in `strong_enough` (Medium sat on
    /// fourteen fighters for six minutes, its reserve and expansion guards keeping the wave short of thirteen, while
    /// its foe had one Sellsword).
    fn crushing(&self, army: &[Id], need: usize, t: f64) -> bool {
        let (seen, when, mine_then) = self.ai().army_seen;
        if army.len() * 2 < need || when <= 0.0 {
            return false;
        }
        let expected = if t - when <= self.level().sighting_age {
            seen
        } else {
            seen + (self.own_army_worth(self.seat()) - mine_then).max(0.0)
        };
        let mine: f64 = army
            .iter()
            .filter_map(|&a| self.unit(a))
            .filter(|u| u.kind.def().armed())
            .map(|u| army_worth(u.kind))
            .sum();
        mine >= CRUSH * expected
    }

    /// By strength (`Diff::wave_margin`; PRD: the AI breaks a defense): a wave ready by count and time waits until
    /// its armed units' worth beats the enemy army it expects by the margin (fading to even over `margin_fade`
    /// seconds of waiting, if it fades). It expects the army it last saw; a sighting older than `sighting_age` is
    /// stale: it first sends its cheapest armed unit to look (waiting up to `look_for` seconds), then expects the last
    /// sighting plus what its own army has grown since (a foe that keeps building is not frozen at its last sighting).
    /// Never seen at all: it goes (today's rules). With full supply, or `all_in_after` seconds since its last wave,
    /// it goes with everything it has.
    fn strong_enough(&mut self, army: &[Id], t: f64) -> bool {
        use crate::world::{LaunchCheck, LaunchWhy};
        let d = self.level();
        let mine: f64 = army
            .iter()
            .filter_map(|&a| self.unit(a))
            .filter(|u| u.kind.def().armed())
            .map(|u| army_worth(u.kind))
            .sum();
        let go = |w: &mut World, why, expected| {
            w.ai_mut().check = Some(LaunchCheck {
                why,
                mine,
                expected,
            });
            true
        };
        if d.wave_margin <= 0.0 {
            return go(self, LaunchWhy::NoMargin, 0.0);
        }
        let since = *self.ai_mut().ready_since.get_or_insert(t);
        let seat = self.seat();
        if self.at_cap(seat) || t - self.ai().last_wave > d.all_in_after {
            let expected = self.ai().army_seen.0;
            return go(self, LaunchWhy::AllIn, expected);
        }
        let (seen, when, mine_then) = self.ai().army_seen;
        if seen <= 0.0 {
            return go(self, LaunchWhy::NeverSeen, 0.0);
        }
        let fresh = t - when <= d.sighting_age;
        if fresh {
            self.ai_mut().looking = None;
        } else if d.look_for > 0.0 {
            // Look first: one unit to the foe's base, unless one is out looking already.
            match self.ai().looking {
                Some((id, at)) if t - at < d.look_for && self.unit(id).is_some() => return false,
                Some((_, at)) if t - at < d.look_for => {}
                Some(_) => {} // (it looked long enough: go by the estimate)
                None => {
                    // (its scout if it has one, the Balloon, else its cheapest armed walker)
                    let seat = self.seat();
                    let scout = self.factions[seat as usize].ai.scout.and_then(|k| {
                        self.units
                            .iter()
                            .find(|u| u.team == seat && u.kind == k)
                            .map(|u| u.id)
                    });
                    let cheapest = army
                        .iter()
                        .copied()
                        .filter(|&a| self.u(a).kind.def().armed() && !self.u(a).kind.def().air)
                        .min_by(|&p, &q| {
                            army_worth(self.u(p).kind)
                                .total_cmp(&army_worth(self.u(q).kind))
                                .then(p.cmp(&q))
                        });
                    if let Some(a) = scout.or(cheapest) {
                        let (gx, gy) = self.attack_target();
                        self.move_to(a, gx, gy);
                        self.ai_mut().looking = Some((a, t));
                        return false;
                    }
                }
            }
        }
        let expected = if fresh {
            seen
        } else {
            seen + (self.own_army_worth(seat) - mine_then).max(0.0)
        };
        let fade = ((t - since) / d.margin_fade).clamp(0.0, 1.0);
        let margin = d.wave_margin + (1.0 - d.wave_margin) * fade;
        let why = if fresh {
            LaunchWhy::Fresh
        } else {
            LaunchWhy::Stale
        };
        mine >= margin * expected && go(self, why, expected)
    }

    /// The home reserve (`Diff::reserve`): fighters at home worth that share of its whole army (those already in it
    /// first, then the cheapest; walking fighters that hit the ground, none out with a wave), back at the rally when
    /// idle away from it. None at full supply (then everything goes), and none but against a passive foe
    /// (`passive_foe`). Returns the rest of the army.
    fn tend_reserve(&mut self, army: Vec<Id>, rally: Pt, t: f64) -> Vec<Id> {
        let seat = self.seat();
        let share = self.level().reserve;
        if share <= 0.0 || self.at_cap(self.seat()) || !self.passive_foe(t) {
            self.ai_mut().reserve.clear();
            return army;
        }
        let target = share * self.own_army_worth(seat);
        let out = self.ai().attackers.clone().unwrap_or_default();
        let fits = |w: &World, a: Id| {
            let d = w.u(a).kind.def();
            !out.contains(&a) && d.armed() && Self::hits_of(w.u(a).kind).0 && !d.air && !d.capital
        };
        let kept: Vec<Id> = self
            .ai()
            .reserve
            .iter()
            .copied()
            .filter(|a| army.contains(a) && fits(self, *a))
            .collect();
        let mut free: Vec<Id> = army
            .iter()
            .copied()
            .filter(|a| !kept.contains(a) && fits(self, *a))
            .collect();
        free.sort_by(|&p, &q| {
            army_worth(self.u(p).kind)
                .total_cmp(&army_worth(self.u(q).kind))
                .then(p.cmp(&q))
        });
        let mut reserve = vec![];
        let mut held = 0.0;
        for a in kept.into_iter().chain(free) {
            if held >= target {
                break;
            }
            held += army_worth(self.u(a).kind);
            reserve.push(a);
        }
        for &a in &reserve {
            let u = self.u(a);
            if u.task == Task::Idle && dist(u.x, u.y, rally.x, rally.y) > 160.0 {
                let ox = (self.rnd() - 0.5) * 120.0;
                let oy = (self.rnd() - 0.5) * 120.0;
                self.move_to(a, rally.x + ox, rally.y + oy);
            }
        }
        self.ai_mut().reserve = reserve.clone();
        army.into_iter().filter(|a| !reserve.contains(a)).collect()
    }

    /// Whether `seat`'s army stands at its maximum, within `CAP_SLACK`: every pool it has (`pool_max` above 0: the
    /// Kingdom's population; the Expedition's Power and its hired places, each against its own maximum). A wave then
    /// goes with everything, the reserve too.
    pub(crate) fn at_cap(&self, seat: u8) -> bool {
        ALL_POOLS.into_iter().all(|p| {
            let max = self.pool_max(seat, p);
            max == 0 || self.pool(seat, p)[0] + self.places(seat, p, CAP_SLACK) >= max
        })
    }

    /// A passive foe (`Diff::passive_expand`): none of its armed units at our buildings for that long, those that
    /// came within `CHASE_S` of our last wave's end left out (chasers of our wave home, not the foe coming). The
    /// siege rules, the home reserve and the pull-back on contact, are for such a foe only (one that sits behind its
    /// defense); against a foe that comes at it, its waves go as before.
    fn passive_foe(&self, t: f64) -> bool {
        t - self.ai().came_at > self.level().passive_expand
    }

    /// Whether a wave out is outmatched (`Diff::retreat_below`): its armed units' worth under that many times the
    /// worth of the enemy's armed units (workers left out) and working armed buildings it sees within `CONTACT_NEAR`
    /// of one of them.
    fn outmatched(&self, alive: &[Id]) -> bool {
        let below = self.level().retreat_below;
        if below <= 0.0 {
            return false;
        }
        let ours: Vec<(f64, f64)> = alive.iter().map(|&a| (self.u(a).x, self.u(a).y)).collect();
        let near = |x: f64, y: f64| {
            ours.iter()
                .any(|&(ux, uy)| dist(ux, uy, x, y) < CONTACT_NEAR)
        };
        let theirs: f64 = self
            .units
            .iter()
            .filter(|u| self.hostile(u.team) && !u.kind.def().worker && u.kind.def().armed())
            .filter(|u| self.ai_sees_unit(u) && near(u.x, u.y))
            .map(|u| army_worth(u.kind))
            .sum::<f64>()
            + self
                .bldgs
                .iter()
                .filter(|b| {
                    let d = b.kind.def();
                    self.hostile(b.team)
                        && b.done
                        && d.weapon.is_some()
                        && self.ai_sees(b.x, b.y)
                        && near(b.x, b.y)
                })
                .map(|b| b.kind.def().cost[0] as f64)
                .sum::<f64>();
        if theirs <= 0.0 {
            return false;
        }
        let mine: f64 = alive
            .iter()
            .filter(|&&a| self.u(a).kind.def().armed())
            .map(|&a| army_worth(self.u(a).kind))
            .sum();
        mine < below * theirs
    }

    /// Where a wave gathers before it goes in (`Diff::stage`): `tiles` short of its goal on the way from its rally
    /// point, on ground a walker may stand on; None when its rally point is that close to the goal already.
    fn stage_point(&self, (gx, gy): (f64, f64), tiles: f64) -> Option<(f64, f64)> {
        let seat = self.seat() as usize;
        let home = self.map.bases[seat];
        let (rx, ry) = self.ai().rally.map_or(
            ((home.0 as f64 + 2.0) * TILE, (home.1 as f64 + 2.0) * TILE),
            |p| (p.x, p.y),
        );
        let d = dist(gx, gy, rx, ry);
        let back = tiles * TILE;
        if d <= back + 4.0 * TILE {
            return None;
        }
        let (sx, sy) = (gx + (rx - gx) / d * back, gy + (ry - gy) / d * back);
        let foot = crate::map::Foot {
            class: Move::Walk,
            water: self.water,
        };
        let (tx, ty) = self.map.tile_of(sx, sy);
        let (px, py) = self.map.nearest_passable_to(foot, tx, ty, 6, (rx, ry))?;
        Some((px as f64 * TILE + 16.0, py as f64 * TILE + 16.0))
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
                // (walking fighters that can hit the ground: not a raider's kind, a flyer, a capital giant or one
                // armed against flyers only)
                !guards.contains(a)
                    && !out.contains(a)
                    && d.armed()
                    && Self::hits_of(self.u(*a).kind).0
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
        // (a unit armed only against flyers could not take a base: it neither keeps a wave out nor counts as what is
        // left of it; no kind is, since the re-theme)
        let air_only = |w: &World, a: Id| {
            let k = w.u(a).kind;
            k.def().armed() && !Self::hits_of(k).0
        };
        let left = alive.iter().filter(|&&a| !air_only(self, a)).count();
        // (a machine with no way to its target through coverage stops at the edge and holds its order there. A wave
        // left with only such machines is over; else it never ended, and no other went)
        let held = |w: &World, a: Id| {
            let u = w.u(a);
            radio::needs_range(u.kind)
                && u.cd < -HELD_QUIET
                && t - u.struck > HELD_QUIET
                && !w.in_radio_by(u.team, u.x, u.y, -EDGE_NEAR)
        };
        let quiet = |w: &World, a: Id| {
            let u = w.u(a);
            u.cd < -WAVE_QUIET && t - u.struck > WAVE_QUIET
        };
        let stalled = alive.iter().all(|&a| held(self, a))
            || (t - ai.last_wave > WAVE_QUIET && alive.iter().all(|&a| quiet(self, a)));
        if alive.is_empty() {
            self.no_growth_after_giving_up(); // (all of it fell: it met more than it could take)
            self.ai_mut().attacking = false;
        } else if lost
            || left == 0
            || stalled
            || (wave_size >= 4 && left * 10 < wave_size * self.level().give_up)
        {
            // Pull the survivors back instead of feeding them in one by one.
            for a in alive {
                let ox = (self.rnd() - 0.5) * 120.0;
                let oy = (self.rnd() - 0.5) * 120.0;
                self.move_to(a, rally.x + ox, rally.y + oy);
            }
            self.no_growth_after_giving_up();
            let ai = self.ai_mut();
            ai.attacking = false;
            ai.attackers = None;
            ai.last_wave = t;
        } else if (self.level().retreat_any || self.passive_foe(t)) && self.outmatched(&alive) {
            // Outmatched on contact with a passive foe: back to its rally, where its reserve and towers meet whoever chases it.
            for a in alive {
                let ox = (self.rnd() - 0.5) * 120.0;
                let oy = (self.rnd() - 0.5) * 120.0;
                self.move_to(a, rally.x + ox, rally.y + oy);
            }
            self.no_growth_after_giving_up();
            let ai = self.ai_mut();
            ai.attacking = false;
            ai.attackers = None;
            ai.staging = None;
            ai.last_wave = t;
        } else if let Some((sx, sy, since)) = self.ai().staging {
            // Gathering: in together once most of the main body is at the staging point (or it waited long enough);
            // until then its idle units walk there.
            let prong = self.ai().prong.clone();
            let main: Vec<Id> = alive
                .iter()
                .copied()
                .filter(|a| !prong.contains(a))
                .collect();
            // (a Drone gathers at the end of its leash on the way, if the point is past it)
            let near = main
                .iter()
                .filter(|&&a| {
                    let (px, py) = self.wave_point(a, sx, sy);
                    dist(self.u(a).x, self.u(a).y, px, py) < STAGE_NEAR
                })
                .count();
            if near as f64 >= main.len() as f64 * STAGE_SHARE || t - since > self.level().stage_wait
            {
                self.ai_mut().staging = None;
                for a in main {
                    let ox = (self.rnd() - 0.5) * 80.0;
                    let oy = (self.rnd() - 0.5) * 80.0;
                    let (px, py) = self.wave_point(a, gx + ox, gy + oy);
                    self.attack_move(a, px, py);
                }
            } else {
                for a in main {
                    let (px, py) = self.wave_point(a, sx, sy);
                    let u = self.u(a);
                    if u.task == Task::Idle && dist(u.x, u.y, px, py) >= STAGE_NEAR {
                        self.attack_move(a, px, py);
                    }
                }
            }
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
                    Some(&(_, bx, by)) => {
                        let (px, py) = self.wave_point(a, bx, by);
                        self.attack_move(a, px, py);
                    }
                    // Nothing known left: sweep the enemy's start, then the shard fields around it.
                    None => {
                        let (px, py) = self.wave_point(a, gx, gy);
                        self.attack_move(a, px, py);
                    }
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

    /// Seat 1's AI with its wave of six Troopers out by the map's center and two at home, as four Troopers of
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
            && wave.iter().all(|&a| matches!(w.u(a).task, Task::AMove { x, y, .. } if (x - hx).abs() + (y - hy).abs() < 400.0))
    }

    /// Seat 1's AI at `level` on a 64x64 duel, ten Troopers at home and its wave ready by count and time (t 400, its
    /// last wave at 300): the world, its army and its brain. Its tuning is its level's without a home reserve or a
    /// retreat on contact (the scenes of those set their own: `ready_with`).
    fn ready(level: usize) -> (World, Vec<Id>, Brain) {
        // (a margin of at most 1.3, the levels' before Nov 13: the scenes are about the mechanism; Easy's none)
        let plan = Diff {
            reserve: 0.0,
            retreat_below: 0.0,
            wave_margin: DIFF[level].wave_margin.min(1.3),
            ..DIFF[level]
        };
        ready_with(level, plan)
    }
    fn ready_with(level: usize, plan: Diff) -> (World, Vec<Id>, Brain) {
        let mut w = World::with_size(
            5,
            level,
            MapKind::Standard,
            MapSize::DUEL,
            0,
            &[&HUMANS, &HUMANS],
        );
        assert!(w.set_ai_plans(&[None, Some(plan)]));
        w.ai_turn = 1;
        let (bx, by) = w.map.bases[1];
        let (hx, hy) = ((bx as f64 + 2.0) * TILE, (by as f64 + 2.0) * TILE);
        let army: Vec<Id> = (0..10)
            .map(|i| {
                w.make_unit(
                    UnitKind::Trooper,
                    1,
                    hx + 60.0 + (i % 5) as f64 * 24.0,
                    hy + 80.0 + (i / 5) as f64 * 24.0,
                )
            })
            .collect();
        w.update_fog();
        let ai = w.ai_mut();
        ai.last_wave = 300.0;
        ai.rally = Some(Pt { x: hx, y: hy });
        let my_b = w
            .bldgs
            .iter()
            .filter(|b| b.team == 1)
            .map(|b| b.id)
            .collect();
        let b = Brain {
            e: 1,
            t: 400.0,
            my_b,
            army: army.clone(),
            rally: Pt { x: hx, y: hy },
            ..Brain::default()
        };
        (w, army, b)
    }
    /// A Trooper's worth, the unit of the scenes below.
    fn trooper() -> f64 {
        super::army_worth(UnitKind::Trooper)
    }

    #[test]
    fn a_wave_waits_for_strength_against_the_army_it_saw_and_goes_once_ahead() {
        // Ten Troopers against twelve seen: it waits (a margin of 1.3); against seven seen (10 >= 9.1) it goes.
        let (mut w, _, mut b) = ready(1);
        w.ai_mut().army_seen = (12.0 * trooper(), 390.0, 0.0);
        w.ai_army(&mut b);
        assert!(!w.ai().attacking, "ten against twelve: it waits");
        assert_eq!(w.ai().ready_since, Some(400.0), "ready since now");
        w.ai_mut().army_seen = (7.0 * trooper(), 395.0, 0.0);
        w.ai_army(&mut b);
        assert!(w.ai().attacking, "ten against seven: it goes");
        assert_eq!(w.ai().ready_since, None);
        // never seen anything: today's rules, it goes
        let (mut w, _, mut b) = ready(1);
        w.ai_army(&mut b);
        assert!(w.ai().attacking, "nothing ever seen: it goes");
        // full supply: all in, whatever it saw
        let (mut w, army, mut b) = ready(1);
        w.ai_mut().army_seen = (30.0 * trooper(), 399.0, 0.0);
        w.pools[1][0][0] = w.supply_limit();
        w.ai_army(&mut b);
        assert!(w.ai().attacking, "full supply: all in");
        assert_eq!(
            w.ai().attackers.as_ref().unwrap().len(),
            army.len(),
            "with everything"
        );
    }

    #[test]
    fn a_stale_sighting_sends_a_unit_to_look_then_counts_the_foes_growth() {
        // Seven seen three minutes ago (stale): it sends one Trooper to the foe's base and waits.
        let (mut w, army, mut b) = ready(1);
        let worth_now: f64 = 10.0 * trooper();
        w.ai_mut().army_seen = (7.0 * trooper(), 400.0 - 180.0, worth_now - 4.0 * trooper());
        w.ai_army(&mut b);
        assert!(!w.ai().attacking, "stale: it looks first");
        let (looker, _) = w.ai().looking.expect("one unit out to look");
        assert!(army.contains(&looker));
        let (gx, gy) = w.attack_target();
        assert!(
            matches!(w.u(looker).task, Task::Move { x, y } if x == gx && y == gy),
            "to the foe's base"
        );
        // while it looks, no wave
        b.t = 430.0;
        w.ai_army(&mut b);
        assert!(!w.ai().attacking, "still looking");
        // it looked a minute and saw nothing new: it expects seven plus its own army's growth since (four): eleven,
        // and ten is not 1.3 times that
        b.t = 461.0;
        w.ai_army(&mut b);
        assert!(
            !w.ai().attacking,
            "expects the foe grew as it did: it waits"
        );
        // a fresh sighting of six: it goes
        w.ai_mut().army_seen = (6.0 * trooper(), 461.0, worth_now);
        w.ai_army(&mut b);
        assert!(w.ai().attacking, "seen fresh, and ahead: it goes");
        assert!(w.ai().looking.is_none());
    }

    #[test]
    fn with_a_fading_margin_or_a_long_wait_it_goes_anyway() {
        // The mechanisms kept for a plan (the levels use neither): the margin fading over three minutes, and all in
        // after four minutes without a wave.
        let plan = |fade: f64, all_in: f64| Diff {
            margin_fade: fade,
            all_in_after: all_in,
            reserve: 0.0,
            retreat_below: 0.0,
            wave_margin: 1.3,
            ..DIFF[1]
        };
        let (mut w, _, mut b) = ready(1);
        assert!(w.set_ai_plans(&[None, Some(plan(180.0, NEVER))]));
        w.ai_turn = 1;
        w.ai_mut().last_wave = 330.0;
        w.ai_mut().rally = Some(b.rally);
        w.ai_mut().army_seen = (9.0 * trooper(), 399.0, 0.0);
        w.ai_army(&mut b);
        assert!(!w.ai().attacking, "ten against 1.3 times nine: it waits");
        b.t = 550.0;
        w.ai_mut().army_seen = (9.0 * trooper(), 549.0, 0.0);
        w.ai_army(&mut b);
        assert!(w.ai().attacking, "the margin faded to 1.05");
        let (mut w, _, mut b) = ready(1);
        assert!(w.set_ai_plans(&[None, Some(plan(NEVER, 240.0))]));
        w.ai_turn = 1;
        w.ai_mut().rally = Some(b.rally);
        w.ai_mut().last_wave = 400.0 - 241.0;
        w.ai_mut().army_seen = (30.0 * trooper(), 399.0, 0.0);
        w.ai_army(&mut b);
        assert!(w.ai().attacking, "over four minutes without a wave: all in");
    }

    #[test]
    fn easy_keeps_todays_waves() {
        let (mut w, _, mut b) = ready(0);
        w.ai_mut().wave = 4;
        b.t = 500.0; // (past Easy's first wave, 7:45)
        w.ai_mut().army_seen = (30.0 * trooper(), 499.0, 0.0);
        w.ai_army(&mut b);
        assert!(w.ai().attacking, "Easy does not wait for strength");
        assert!(w.ai().staging.is_none(), "nor gather");
    }

    #[test]
    fn against_a_passive_foe_a_home_reserve_of_its_cheapest_fighters_stays_at_the_rally() {
        // Medium's reserve, a quarter of its army's worth, against a foe that has not come at it: of ten Troopers
        // (and a Rider, pricier), three Troopers stay home as the wave goes; the Rider goes with the wave.
        let (mut w, army, mut b) = ready_with(1, DIFF[1]);
        let (hx, hy) = (b.rally.x, b.rally.y);
        let tank = w.make_unit(UnitKind::Rider, 1, hx + 60.0, hy + 140.0);
        b.army.push(tank);
        w.ai_army(&mut b);
        assert!(w.ai().attacking, "the wave goes");
        let reserve = w.ai().reserve.clone();
        let total = 10.0 * trooper() + super::army_worth(UnitKind::Rider);
        let held: f64 = reserve
            .iter()
            .map(|&a| super::army_worth(w.u(a).kind))
            .sum();
        assert!(
            held >= 0.25 * total && held - trooper() < 0.25 * total,
            "a quarter of its worth, no more than one unit over: {held} of {total}"
        );
        assert!(
            reserve.iter().all(|a| army.contains(a)),
            "Troopers, the cheapest"
        );
        let wave = w.ai().attackers.clone().unwrap();
        assert!(wave.contains(&tank), "the Rider goes");
        assert!(
            reserve.iter().all(|a| !wave.contains(a)),
            "the reserve stays out of it"
        );
        assert!(
            reserve
                .iter()
                .all(|&a| !matches!(w.u(a).task, Task::AMove { .. }))
        );
        // a reserve unit that wandered off walks back to the rally
        let r = reserve[0];
        (w.um(r).x, w.um(r).y) = (hx + 400.0, hy);
        b.t = 410.0;
        w.ai_army(&mut b);
        assert_eq!(w.ai().reserve[0], r, "the same units stay in it");
        assert!(
            matches!(w.u(r).task, Task::Move { x, .. } if (x - hx).abs() < 100.0),
            "back to the rally"
        );
        // at full supply everything goes: the next wave takes the reserve too
        let (mut w, army, mut b) = ready_with(1, DIFF[1]);
        w.pools[1][0][0] = w.supply_limit();
        w.ai_army(&mut b);
        assert!(w.ai().reserve.is_empty());
        assert_eq!(
            w.ai().attackers.as_ref().unwrap().len(),
            army.len(),
            "all in"
        );
        // a foe that came at its buildings lately is not passive: no reserve, everything goes
        let (mut w, army, mut b) = ready_with(1, DIFF[1]);
        w.ai_mut().came_at = b.t - 10.0;
        w.ai_army(&mut b);
        assert!(
            w.ai().reserve.is_empty(),
            "no reserve against a foe that comes"
        );
        assert_eq!(w.ai().attackers.as_ref().unwrap().len(), army.len());
        // Easy keeps none
        let (mut w, _, mut b) = ready_with(0, DIFF[0]);
        w.ai_mut().wave = 4;
        w.ai_army(&mut b);
        assert!(w.ai().reserve.is_empty(), "Easy keeps no reserve");
    }

    #[test]
    fn an_outmatched_wave_pulls_back_to_its_rally_on_contact_with_a_passive_foe() {
        // A wave of ten Troopers out, with no reserve (to count only the wave): it meets what it sees near it. `came`:
        // the foe's armed units were at its buildings just before.
        let scene = |enemies: usize, came: bool| {
            let (mut w, army, mut b) = ready_with(
                1,
                Diff {
                    reserve: 0.0,
                    ..DIFF[1]
                },
            );
            w.ai_army(&mut b);
            assert!(w.ai().attacking);
            w.ai_mut().staging = None;
            // the wave halfway across, the foe's Troopers in front of it
            let (gx, gy) = w.attack_target();
            let (mx, my) = ((b.rally.x + gx) / 2.0, (b.rally.y + gy) / 2.0);
            for (i, &a) in army.iter().enumerate() {
                let u = w.um(a);
                (u.x, u.y) = (mx + (i % 5) as f64 * 20.0, my + (i / 5) as f64 * 20.0);
                u.task = Task::Idle;
            }
            for i in 0..enemies {
                w.make_unit(
                    UnitKind::Trooper,
                    0,
                    mx + 120.0 + (i % 5) as f64 * 20.0,
                    my + (i / 5) as f64 * 20.0,
                );
            }
            w.update_fog();
            b.t = 420.0;
            if came {
                w.ai_mut().came_at = 410.0;
            }
            w.ai_army(&mut b);
            (w, army, b)
        };
        // ten against seven: it fights on
        let (w, _, _) = scene(7, false);
        assert!(w.ai().attacking, "ahead: it fights on");
        // ten against fourteen: back to its rally, the wave over (the next waits its gap)
        let (w, army, b) = scene(14, false);
        assert!(!w.ai().attacking, "outmatched: it pulls back");
        assert_eq!(w.ai().last_wave, 420.0);
        for &a in &army {
            assert!(
                matches!(w.u(a).task, Task::Move { x, y } if crate::jsmath::dist(x, y, b.rally.x, b.rally.y) < 100.0),
                "to its rally"
            );
        }
        // the same against a foe that has just come at its buildings: it fights on, as today
        let (w, _, _) = scene(14, true);
        assert!(w.ai().attacking, "not a passive foe: it fights on");
        // Easy retreats on contact whatever the foe has done (`retreat_any`: `easy_gives_up_on_contact...`)
        assert!(DIFF[0].retreat_any && DIFF[0].retreat_below > 0.0);
    }

    #[test]
    fn chasers_of_its_wave_home_do_not_make_the_foe_active() {
        // Its wave ended at 400; at 450 a foe's Trooper is at its buildings: a chaser (attacked, but the foe still
        // passive). At 600 another comes: the foe came.
        let (mut w, _, mut b) = ready(1);
        w.ai_mut().last_wave = 400.0;
        w.ai_mut().attacking = false;
        let (hx, hy) = (b.rally.x, b.rally.y);
        // (a foe's worker there first, lower in id order: it does not hide the Troopers)
        w.make_unit(UnitKind::Harvester, 0, hx - 40.0, hy);
        let chaser = w.make_unit(UnitKind::Trooper, 0, hx + 40.0, hy);
        w.update_fog();
        b.t = 450.0;
        w.ai_watch(&mut b);
        assert_eq!(w.ai().attacked_at, 450.0);
        assert_eq!(w.ai().came_at, 0.0, "a chaser");
        assert!(w.passive_foe(450.0));
        b.t = 600.0;
        w.ai_watch(&mut b);
        assert_eq!(w.ai().came_at, 600.0, "long after its wave: the foe came");
        assert!(!w.passive_foe(610.0));
        // while its wave is out (just launched), the foe at its buildings came too
        (w.ai_mut().attacking, w.ai_mut().last_wave) = (true, 610.0);
        b.t = 620.0;
        w.ai_watch(&mut b);
        assert_eq!(w.ai().came_at, 620.0, "its wave out: the foe came");
        assert!(w.unit(chaser).is_some());
    }

    #[test]
    fn a_wave_gathers_short_of_its_goal_and_goes_in_together() {
        let (mut w, army, mut b) = ready(1);
        w.ai_army(&mut b);
        assert!(w.ai().attacking);
        let (sx, sy, _) = w.ai().staging.expect("it gathers first");
        let (gx, gy) = w.attack_target();
        let back = crate::jsmath::dist(sx, sy, gx, gy) / TILE;
        assert!(
            (9.0..15.0).contains(&back),
            "about twelve tiles short of its goal: {back:.1}"
        );
        for &a in &army {
            let Task::AMove { x, y, .. } = w.u(a).task else {
                panic!("attack-moving")
            };
            assert!(
                crate::jsmath::dist(x, y, sx, sy) < 64.0,
                "to the staging point, not the goal"
            );
        }
        // half of it there: it waits
        for &a in army.iter().take(5) {
            let u = w.um(a);
            (u.x, u.y) = (sx, sy);
        }
        b.t = 410.0;
        w.ai_army(&mut b);
        assert!(w.ai().staging.is_some(), "half there: it waits");
        // most of it there: in together, at the goal
        for &a in army.iter().take(8) {
            let u = w.um(a);
            (u.x, u.y) = (sx, sy);
        }
        b.t = 415.0;
        w.ai_army(&mut b);
        assert!(w.ai().staging.is_none(), "most there: it goes in");
        for &a in &army {
            let Task::AMove { x, y, .. } = w.u(a).task else {
                panic!("attack-moving")
            };
            assert!(crate::jsmath::dist(x, y, gx, gy) < 64.0, "to the goal");
        }
        // a wave that never gathers goes in after its wait
        let (mut w, _, mut b) = ready(1);
        w.ai_army(&mut b);
        let since = w.ai().staging.unwrap().2;
        b.t = since + w.tuning(1).stage_wait + 1.0;
        w.ai_army(&mut b);
        assert!(w.ai().staging.is_none(), "it waited long enough");
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
        // the map) first and a Garrison of seat 0's: the Garrison is the goal; with only seat 3's known, seat 0's
        // start until that has been looked at, then seat 3's headquarters.
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
        let start = (w.foe_base().0 * TILE, w.foe_base().1 * TILE);
        assert_eq!(
            w.attack_target(),
            start,
            "only another enemy's known: the foe's start, not yet looked at, first"
        );
        let (tx, ty) = w.map.tile_of(start.0, start.1);
        let i = w.map.idx(tx, ty);
        w.explored[1][i] = 1;
        assert_eq!(
            w.attack_target(),
            (far.x, far.y),
            "the foe's start looked at, nothing of it known: the other enemy"
        );
        w.ai_mut().known.push((rax, r.x, r.y, false, 0));
        assert_eq!(w.attack_target(), (r.x, r.y), "the foe's first");
    }

    #[test]
    fn the_scout_is_done_once_it_knows_its_foes_headquarters_not_another_enemys() {
        // Seat 1's scout on its way; it knows seat 3's headquarters (an ally may show it that): it scouts on. Seat 0's
        // (its foe's) known: back to work.
        let mut w = World::with_size(
            17,
            1,
            MapKind::Standard,
            MapSize::square(96),
            0,
            &[&HUMANS; 4],
        );
        w.ai_turn = 1;
        let hq = |w: &World, s: u8| {
            let b = w
                .bldgs
                .iter()
                .find(|b| b.team == s && b.kind.def().hq)
                .unwrap();
            (b.id, b.x, b.y, true, s)
        };
        let harv: Vec<Id> = w
            .units
            .iter()
            .filter(|u| u.team == 1 && u.kind.def().worker)
            .map(|u| u.id)
            .collect();
        let s = harv[0];
        let (fx, fy) = w.foe_base();
        w.move_to(s, fx * TILE, fy * TILE);
        w.ai_mut().scout = Some(s);
        w.ai_mut().scouted = true;
        w.ai_mut().known = vec![hq(&w, 3)];
        w.tend_scout(&harv);
        assert_eq!(
            w.ai().scout,
            Some(s),
            "another enemy's headquarters: still scouting"
        );
        let foe = hq(&w, 0);
        w.ai_mut().known.push(foe);
        w.tend_scout(&harv);
        assert_eq!(w.ai().scout, None, "the foe's: done");
    }

    #[test]
    fn easy_gives_up_on_contact_and_its_survivors_go_home() {
        // Easy is clumsy (Stelian, Nov 13: "it should give up and retreat quickly"): its wave is its four (the rest stay
        // home), and meeting a defence near its own worth it walks home whatever the foe has done before (no passive
        // foe needed, `Diff::retreat_any`); against less it fights on.
        let scene = |enemies: usize| {
            let (mut w, army, mut b) = ready_with(0, DIFF[0]);
            b.t = 480.0; // (past its first wave's 7:45)
            w.ai_army(&mut b);
            assert!(w.ai().attacking, "its first wave goes");
            let wave = w.ai().attackers.clone().unwrap();
            assert_eq!(wave.len(), 4, "four go");
            assert!(
                army.iter().filter(|a| !wave.contains(a)).count() == 6,
                "six stay home"
            );
            let (gx, gy) = w.attack_target();
            let (mx, my) = ((b.rally.x + gx) / 2.0, (b.rally.y + gy) / 2.0);
            for (i, &a) in wave.iter().enumerate() {
                let u = w.um(a);
                (u.x, u.y) = (mx + i as f64 * 20.0, my);
                u.task = Task::Idle;
            }
            for i in 0..enemies {
                w.make_unit(
                    UnitKind::Trooper,
                    0,
                    mx + 120.0 + (i % 5) as f64 * 20.0,
                    my + (i / 5) as f64 * 20.0,
                );
            }
            w.update_fog();
            b.t = 490.0;
            w.ai_army(&mut b);
            (w, wave, b)
        };
        let (w, _, _) = scene(2);
        assert!(w.ai().attacking, "four against two: it fights on");
        let (w, wave, b) = scene(4);
        assert!(!w.ai().attacking, "four against four: it gives up");
        for &a in &wave {
            assert!(
                matches!(w.u(a).task, Task::Move { x, y } if crate::jsmath::dist(x, y, b.rally.x, b.rally.y) < 100.0),
                "home to its rally"
            );
        }
        // Medium does not (it retreats only from a passive foe, `retreat_below`)
        assert!(!DIFF[1].retreat_any && DIFF[0].retreat_any);
    }

    #[test]
    fn the_tier_rises_with_the_clock_on_easy_and_medium() {
        // A level's tier (`Diff::tier_at`): Easy its line units from the start, its raiders, siege and Drones from 9:00,
        // its top tier (the Knight, the Android, the Rover) from 13:00; Medium its top tier from 8:00; Hard everything.
        use UnitKind::*;
        let at = |level: usize, t: f64, k: UnitKind| {
            let (mut w, _, _) = ready_with(level, DIFF[level]);
            w.time = t;
            w.level_allows(k)
        };
        assert!(at(0, 0.0, Trooper) && at(0, 0.0, Prism) && !at(0, 0.0, Umbra));
        assert!(!at(0, 530.0, Scythe) && at(0, 540.0, Scythe) && at(0, 600.0, SiegeTank));
        assert!(!at(0, 770.0, Knight) && at(0, 780.0, Knight) && at(0, 780.0, Monolith));
        assert!(
            at(1, 0.0, Scythe)
                && !at(1, 470.0, Umbra)
                && at(1, 480.0, Umbra)
                && at(1, 480.0, Knight)
        );
        assert!(at(2, 0.0, Knight));
    }

    #[test]
    fn a_wave_left_with_only_machines_held_quiet_at_the_coverage_edge_is_over() {
        // The Expedition's wave out: six machines at its Data center's coverage edge, told to attack the foe's
        // headquarters, which no way through coverage reaches: they hold there.
        // Quiet for 20 s (not firing, not hit), the wave is over and they go back to the rally, so the next can go;
        // one of them firing lately, it goes on. (Before, such a wave never ended: a three-seat game ran 45 minutes.)
        let scene = |fired_ago: f64| {
            let mut w =
                World::with_size(5, 1, MapKind::Standard, MapSize::DUEL, 0, &[&HUMANS, &VAEL]);
            w.refresh_radio(true);
            w.ai_turn = 1;
            let (bx, by) = w.map.bases[1];
            let (hx, hy) = ((bx as f64 + 2.0) * TILE, (by as f64 + 2.0) * TILE);
            let reach = crate::data::radio::range_of(BldgKind::Conflux, w.map.w) * TILE;
            let (fx, fy) = w.map.bases[0];
            let core = w.bldgs.iter().find(|b| b.team == 0).unwrap().id;
            let (dx, dy) = ((fx - bx) as f64, (fy - by) as f64);
            let len = crate::jsmath::hypot(dx, dy);
            let army: Vec<Id> = (0..6)
                .map(|i| {
                    let k = if i < 3 {
                        UnitKind::Monolith
                    } else {
                        UnitKind::Scythe
                    };
                    let (x, y) = (
                        hx + dx / len * reach + i as f64 * 6.0,
                        hy + dy / len * reach,
                    );
                    let a = w.make_unit(k, 1, x, y);
                    let u = w.um(a);
                    u.task = Task::Attack {
                        target: core,
                        back: None,
                    };
                    u.cd = -fired_ago;
                    a
                })
                .collect();
            let rally = Pt { x: hx, y: hy };
            let ai = w.ai_mut();
            ai.rally = Some(rally);
            ai.attacking = true;
            ai.attackers = Some(army.clone());
            ai.wave_size = 6;
            ai.last_wave = 300.0;
            let goal = (fx as f64 * TILE, fy as f64 * TILE);
            w.ai_steer_wave(&army, &army, 400.0, rally, goal);
            (w, army, rally)
        };
        let (w, army, rally) = scene(30.0);
        assert!(
            !w.ai().attacking,
            "held quiet at the edge: the wave is over"
        );
        assert_eq!(w.ai().last_wave, 400.0);
        for &a in &army {
            assert!(
                matches!(w.u(a).task, Task::Move { x, y } if crate::jsmath::dist(x, y, rally.x, rally.y) < 100.0),
                "back to its rally"
            );
        }
        let (w, _, _) = scene(5.0);
        assert!(w.ai().attacking, "firing lately: it goes on");
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
    fn raiders_with_no_worker_in_sight_go_for_a_known_market_out_in_the_open() {
        // The player's Market out past its base (Markets go up in bases, but one may stand anywhere), known to the
        // AI; its raiders see no worker: they attack the Market. A worker in sight comes first.
        let mut w = World::new(17, 1);
        let (bx, by) = w.map.bases[PLAYER as usize];
        let core = ((bx as f64 + 2.0) * TILE, (by as f64 + 2.0) * TILE);
        let far = (14..20)
            .flat_map(|r| (0..32).map(move |a| (r, a)))
            .map(|(r, a)| {
                let ang = a as f64 / 32.0 * std::f64::consts::TAU;
                (
                    (bx as f64 + 2.0 + ang.cos() * r as f64) as i32,
                    (by as f64 + 2.0 + ang.sin() * r as f64) as i32,
                )
            })
            .find(|&(tx, ty)| {
                w.can_place(BldgKind::Extractor, tx, ty, PLAYER) || {
                    let (x, y) = (tx, ty);
                    w.map.in_map(x + 1, y + 1)
                        && (0..2).all(|dy| (0..2).all(|dx| !w.map.blocked(x + dx, y + dy)))
                }
            })
            .expect("open ground out past the base");
        let market = w.make_building(BldgKind::Extractor, PLAYER, far.0, far.1, true);
        let p = w.bldg(market).unwrap().clone();
        assert!(
            (p.x - core.0).hypot(p.y - core.1) > 12.0 * TILE,
            "the Market stands out in the open"
        );
        w.ai_turn = ENEMY;
        let raiders: Vec<Id> = (0..2)
            .map(|i| w.make_unit(UnitKind::Rider, ENEMY, p.x + 200.0, p.y + 30.0 * i as f64))
            .collect();
        w.update_fog();
        w.ai_mut().known = vec![(market, p.x, p.y, false, PLAYER)];
        let rally = Pt { x: p.x, y: p.y };
        w.tend_raiders(&raiders, rally);
        for &r in &raiders {
            assert!(
                matches!(w.unit(r).unwrap().task, Task::Attack { target, .. } if target == market),
                "raider {r} goes for the Market: {:?}",
                w.unit(r).unwrap().task
            );
        }
        // A worker it sees comes first.
        let worker = w.make_unit(UnitKind::Harvester, PLAYER, p.x + 150.0, p.y);
        w.update_fog();
        w.tend_raiders(&raiders, rally);
        assert!(
            matches!(w.unit(raiders[0]).unwrap().task, Task::Attack { target, .. } if target == worker),
            "the worker first"
        );
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
            .filter(|&&a| matches!(w.u(a).task, Task::AMove { x, y, .. } if ((x - e.x).powi(2) + (y - e.y).powi(2)).sqrt() < 100.0))
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
        // A Rider right by the expansion is still not a guard (it raids).
        let (exx, exy) = (
            (ex as f64 + 2.0) * 32.0,
            (ey.clamp(4, 56) as f64 + 2.0) * 32.0,
        );
        let raider = w.make_unit(UnitKind::Rider, ENEMY, exx + 40.0, exy);
        army.push(raider);
        let rest = w.tend_guards(army.clone());
        assert_eq!(rest.len(), 4);
        assert_eq!(w.ai().guards.len(), 3);
        assert!(
            !w.ai().guards.contains(&raider) && rest.contains(&raider),
            "not the Rider"
        );
        // Kept, not re-picked, on the next turn.
        let again = w.tend_guards(army.clone());
        assert_eq!(again, rest);
    }

    #[test]
    fn what_it_expects_of_the_foe_falls_with_the_units_it_saw() {
        // (found in the 2v2's 90-minute games: a defender that wiped a wave out at home still expected that wave, and
        // waited for a margin over it that it never reached) Six enemy Guards in sight at its base: it expects them; they
        // fall, and on its next look it expects nothing of them.
        let (mut w, _, mut b) = ready(1);
        let (hx, hy) = (b.rally.x, b.rally.y);
        let foes: Vec<Id> = (0..6)
            .map(|i| w.make_unit(UnitKind::Trooper, 0, hx + 120.0 + i as f64 * 20.0, hy))
            .collect();
        w.update_fog();
        w.ai_watch(&mut b);
        assert_eq!(w.ai().army_seen.0, 6.0 * trooper(), "it saw six Guards");
        for &f in &foes[..4] {
            w.units.retain(|u| u.id != f);
        }
        w.update_fog();
        w.ai_watch(&mut b);
        assert_eq!(w.ai().army_seen.0, 2.0 * trooper(), "two of them left");
    }

    #[test]
    fn a_wave_short_of_its_count_goes_when_it_crushes_what_the_foe_has() {
        // (found in the lab: Medium sat on fourteen fighters for six minutes, its reserve and guards keeping the wave
        // short of its count, while its foe had one Sellsword) Ten Troopers where the wave wants twenty: they wait
        // against a foe seen with five, and go against one seen with one (three times its worth and more).
        let plan = Diff {
            wave: 20,
            reserve: 0.0,
            retreat_below: 0.0,
            ..DIFF[1]
        };
        for (seen, goes) in [(5.0, false), (1.0, true)] {
            let (mut w, _, mut b) = ready_with(1, plan);
            w.ai_mut().wave = 20;
            w.ai_mut().army_seen = (seen * trooper(), 395.0, 10.0 * trooper());
            w.ai_army(&mut b);
            assert_eq!(w.ai().attacking, goes, "against {seen} seen");
        }
    }

    #[test]
    fn a_wave_quiet_for_a_minute_and_a_half_is_over() {
        // (found in the lab: a wave of two left standing short of the foe's base for eight minutes kept a winning army
        // at home) A wave out two minutes whose units have neither fired nor been hit for 90 s comes home.
        let (mut w, army, mut b) = ready(1);
        w.ai_army(&mut b);
        assert!(w.ai().attacking, "the wave goes");
        w.time = 400.0 + 120.0;
        b.t = w.time;
        for &a in &army {
            let u = w.um(a);
            u.cd = -100.0;
            u.struck = -1000.0;
        }
        w.ai_army(&mut b);
        assert!(!w.ai().attacking, "over");
    }

    #[test]
    fn easy_is_clumsy_until_12_00_only() {
        // `Diff::clumsy_until`: Easy's waves are its clumsy ones (just their size, giving up on contact) until 12:00, then
        // whole armies that pull back as Medium's do and wait for an edge (`Diff::at`); the other levels never change.
        let (early, late) = (DIFF[0].at(700.0), DIFF[0].at(720.0));
        assert!(early.wave_only && early.retreat_any && early.give_up == 7);
        assert!(!late.wave_only && !late.retreat_any && late.give_up == 4);
        assert!(late.wave_margin >= 1.3 && late.all_in_after <= 300.0);
        for d in &DIFF[1..] {
            assert_eq!(d.at(0.0), *d);
            assert_eq!(d.at(3000.0), *d);
        }
    }
}
