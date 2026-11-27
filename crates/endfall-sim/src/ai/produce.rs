//! The AI's production: the right unit from each factory, what it holds back for its next building and a capital
//! unit, rally points.

use super::*;

/// Game times (s) after which the AI wants its first and second capital unit.
const CAPITAL_AT: [f64; 2] = [450.0, 660.0];
/// Enemy siege units seen at once from which a level that adapts answers them (`World::siege_answered`).
pub(crate) const SIEGE_SEEN: usize = 2;

impl World {
    /// Production: the right unit from each building, rally points, nothing while saving.
    pub(crate) fn ai_produce(&mut self, brain: &mut Brain) {
        let Brain {
            e,
            t,
            my_b,
            enemy_air,
            rally,
            saving,
            want,
            ..
        } = brain.clone();
        // Production. The main factory answers enemy flyers (as far as the AI knows) with its anti-air (Archers,
        // Sellswords); the Kingdom's Workshop, once the Forge stands, answers them with Ballistas (then the Barracks
        // bring only half the answer in Archers); each factory mixes in what the side's mix calls for (`AiScript::mix`).
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
        // A capital unit due: the other factories keep its price back too, or the army spends every coin and the
        // giant never comes. What is held back (for it, and for the building the build order wants next) only
        // counts against a unit for the resources that unit spends.
        let capital_due = self.capital_due(e, &my_b, t);
        // (its tech building, a 300-gold bet since the arc: half its price held, so its line keeps training while it
        // saves for it; UPDATE 7)
        let tech = self.factions[e as usize].ai.tech;
        let held = {
            let r = want.map_or([0, 0], |w| {
                let c = w.def().cost;
                if w == tech { c.map(|g| g / 2) } else { c }
            });
            let k = capital_due.map_or([0, 0], |k| self.unit_cost(e, k));
            [r[0] + k[0], r[1] + k[1]]
        };
        let need = |c: [i32; 2]| [0, 1].map(|i| c[i] + if c[i] > 0 { held[i] } else { 0 });
        // The gate's elite (the arc: the Expedition's Portal, its Android or Rover): while its Portal stands idle with an
        // Uplink open, the other factories hold an elite's price back, or the posts spend every coin first each turn and
        // the Portal never trains (`gate_hold`).
        let gate_hold =
            self.gate_hold(e, &my_b) + self.siege_hold(e, &my_b, t) + self.dive_hold(e, &my_b, t);
        // (its Uplink's price is held as the build order's `want`, `held` above: its next building whenever it is due)
        // Its elite due (the Expedition's Portal and its Android): the other factories keep its places free, or the
        // cheaper machines fill the grid every round and the Portal is never raised or never trains.
        let reserve = self.elite_reserve(e, &my_b, t);
        let tech2 = self.factions[e as usize].ai.tech2;
        // Its scout (`AiScript::scout`, the Balloon): one, from the factory that trains it, nothing held back from it.
        let mut wanted_scout = self.factions[e as usize]
            .ai
            .scout
            .filter(|&k| self.level_allows(k) && mine(self, k) == 0);
        // Enemy flyers: two answers per flyer seen, counted with those queued (`AiScript::answer_weight`). The heavier
        // answer once a finished building of ours with room in its queue can train it (its requirement standing); then
        // the cheap one only to half the answer (a vehicle bay full of tanks leaves it all to the cheap one).
        let script = &self.factions[e as usize].ai;
        let heavy_aa = script.heavy_anti_air.filter(|&k| {
            k.def()
                .req
                .is_none_or(|r| self.ai_count(&my_b, true, r) >= 1)
                && my_b
                    .iter()
                    .filter_map(|&id| self.bldg(id))
                    .any(|b| b.done && b.queue.len() < 2 && b.kind.def().trains.contains(&k))
        });
        let answers = |w: &World| {
            let s = &w.factions[e as usize].ai;
            mine(w, s.anti_air)
                + s.heavy_anti_air
                    .map_or(0, |k| s.answer_weight(k) * mine(w, k))
                + s.also_anti_air.iter().map(|&k| mine(w, k)).sum::<usize>()
        };
        let cheap_cap = if heavy_aa.is_some() {
            enemy_air
        } else {
            enemy_air * 2
        };
        // Supply tight: the specialists' factories (the second tech building, the Expedition's Portal and its elite,
        // first; then the air factory and the vehicle bay) take the free places before the barracks, else several
        // barracks (or the air factory's cheaper machines) fill them every round and a specialist that is due never
        // fits. With room to spare, every factory in building order as ever.
        let order: Vec<Id> = {
            // (the places the specialists take: population, or the Expedition's grid)
            let room = self.room(e);
            let s = &self.factions[e as usize].ai;
            let rank = |id: &Id| match self.bldg(*id) {
                Some(b) if s.tech2 == Some(b.kind) => 0,
                Some(b) if b.kind == s.air || s.heavy == Some(b.kind) => 1,
                _ => 2,
            };
            let mut order = my_b.clone();
            if room < self.places(e, SUPPLY_TIGHT) {
                order.sort_by_key(rank); // (stable: building order within each rank)
            }
            order
        };
        // (a plan's dare: with its line unit dared away, the mix counts its barracks' substitute as its line, and a raider
        // dared away counts as its raiders all out)
        let (line, raiders_out) = {
            let s = &self.factions[e as usize].ai;
            let line = if self.ai_banned(e, s.basic) {
                self.ai_substitute(s.rax).unwrap_or(s.basic)
            } else {
                s.basic
            };
            (line, self.ai_banned(e, s.raider))
        };
        for &bid in &order {
            let Some(b) = self.bldg(bid) else { continue };
            if !b.done || b.kind.def().hq || b.kind.def().trains.is_empty() {
                continue;
            }
            let s = &self.factions[e as usize].ai;
            let scout = wanted_scout.filter(|k| {
                b.kind.def().trains.contains(k)
                    && k.def()
                        .req
                        .is_none_or(|r| self.ai_count(&my_b, true, r) >= 1)
            });
            let at_gate = Some(b.kind) == self.factions[e as usize].ai.tech2;
            // (the vehicle bay's siege, the Kingdom's top tier, holds nothing back for a building either: its Cannons
            // came at 14 minutes, the bay waiting on every Cottage and tower; the arc)
            let siege_bay = s.heavy == Some(b.kind)
                || (self.siege_answered()
                    && s.dive.is_some_and(|k| b.kind.def().trains.contains(&k)));
            let energy = self.effect_level(e, Effect::EnergyCost);
            let need = |k: UnitKind| {
                let cost = World::cost_at(k, energy);
                if Some(k) == scout || siege_bay {
                    cost
                } else if at_gate {
                    need(cost)
                } else {
                    let c = need(cost);
                    [c[0] + gate_hold, c[1]]
                }
            };
            // The main factory answers enemy flyers, then each factory mixes in the specialists it trains by ratio
            // (each once its requirement stands: a Knight per four Guards once the Forge stands; the Expedition's
            // Factory a Rover per four Sellswords, between its Buggies).
            // (a vehicle bay, or a factory that is neither the main nor the air factory, the Expedition's Portal: only
            // its anti-air and what the mix calls for)
            let heavy = s.heavy == Some(b.kind) || (b.kind != s.rax && b.kind != s.air);
            // (only what its level trains: a mix above it leaves the factory to its other units)
            let level = self.level();
            // (of the specialists this factory trains, the one furthest behind its ratio: the first by the mix's order
            // on a tie, so a factory training two (the Expedition's Rover and Drone) alternates rather than starving
            // the second)
            let mixed = s
                .mix
                .iter()
                .map(|&m| level.mix_entry(m))
                .filter(|&(k, per, from)| {
                    if !self.level_allows(k) {
                        return false;
                    }
                    let per = self.answer_ratio(k, per);
                    b.kind.def().trains.contains(&k)
                        && t >= from
                        && k.def()
                            .req
                            .is_none_or(|r| self.ai_count(&my_b, true, r) >= 1)
                        // (the gate's elites, at the Portal, whatever its line, and the vehicle bay's siege one ahead of
                        // its ratio: each people's top tier; the arc. Since Nov 13 the siege keeps near its ratio: whatever
                        // the line, Kingdoms of sixteen Cannons and four Guards broke their waves on every defense for an
                        // hour; and the Ballistas keep to theirs: they came whatever the line too, and doubled the answer
                        // to three Drones)
                        && (at_gate
                            || (s.heavy == Some(b.kind)
                                && k.def().weapon.is_some_and(|w| w.siege)
                                && mine(self, k) * per <= mine(self, line))
                            || (mine(self, k) + 1) * per <= mine(self, line))
                })
                .min_by_key(|&(k, per, _)| (mine(self, k) + 1) * self.answer_ratio(k, per));
            // The air factory's capital unit (a late giant): one after CAPITAL_AT[0] s, a second after [1]; it saves
            // up for it rather than spending the money on raiders.
            let capital = b.kind.def().trains.iter().copied().find(|&k| {
                k.def().capital
                    && self.level_allows(k)
                    && k.def()
                        .req
                        .is_none_or(|r| self.ai_count(&my_b, true, r) >= 1)
            });
            let allowance = CAPITAL_AT.iter().filter(|&&at| t > at).count();
            if b.kind == s.air
                && scout.is_none()
                && let Some(c) = capital
                && mine(self, c) < allowance
            {
                let (idle, rallied) = (b.queue.is_empty(), b.rally.is_some());
                if !rallied {
                    self.set_rally(bid, rally.x, rally.y, None);
                }
                if idle && !saving && self.can_afford(e, self.unit_cost(e, c)) {
                    let _ = self.queue_unit(bid, c);
                }
                continue;
            }
            let short_of_aa = enemy_air > 0 && answers(self) < enemy_air * 2;
            let u = if let Some(k) = scout {
                k
            } else if (b.kind == s.rax || heavy)
                && b.kind.def().trains.contains(&s.anti_air)
                && short_of_aa
                && mine(self, s.anti_air) < cheap_cap
            {
                // (from the factory that trains it: the Kingdom's Barracks, the Expedition's Portal)
                s.anti_air
            } else if let Some(k) =
                heavy_aa.filter(|k| short_of_aa && b.kind.def().trains.contains(k))
            {
                k
            } else if let Some((k, _, _)) = mixed
                && (b.kind == s.rax
                    || heavy
                    // (its answer to the enemy's siege: waited for, the others holding its price back, `dive_hold`)
                    || (Some(k) == s.dive && self.siege_answered())
                    // (the air factory takes turns: a mixed-in unit (a Knight, a Rover), then a raider, until its
                    // raiders are all out: neither starves the other)
                    // (and while it can't afford the mixed-in unit, a raider instead of nothing: the barracks spend
                    // as the money comes in, so waiting for a Knight's price would leave the air factory idle)
                    || (b.kind == s.air
                        && (mine(self, k) <= mine(self, s.raider)
                            || raiders_out
                            || mine(self, s.raider) >= 6)
                        && (raiders_out || mine(self, s.raider) >= 6 || self.can_afford(e, need(k)))))
            {
                k
            } else if (b.kind == s.air && (raiders_out || mine(self, s.raider) >= 6)) || heavy {
                continue; // (the vehicle bay trains only its anti-air and what the mix calls for)
            } else if self.ai_banned(e, b.kind.def().trains[0]) {
                // (a plan's dare: its first unit dared away, the next it may train, or nothing)
                match self.ai_substitute(b.kind) {
                    Some(k) => k,
                    None => continue,
                }
            } else {
                b.kind.def().trains[0]
            };
            // (a unit above its level's mix: its line unit instead, or nothing from a vehicle bay or an air factory)
            let u = if self.level_allows(u) {
                u
            } else if heavy || b.kind == s.air {
                continue;
            } else if self.ai_banned(e, b.kind.def().trains[0]) {
                match self.ai_substitute(b.kind) {
                    Some(k) => k,
                    None => continue,
                }
            } else {
                b.kind.def().trains[0]
            };
            // (its line at its level's most on a grid side, `line_max`: nothing more of it)
            if self.factions[e as usize].grid
                && s.rax.def().trains.contains(&u)
                && self.line_used(e) + self.takes(e, u) > self.line_max(e)
            {
                continue;
            }
            let (qlen, bkind) = (b.queue.len(), b.kind);
            if b.rally.is_none() {
                self.set_rally(bid, rally.x, rally.y, None);
            }
            // Units wait while the money is spoken for by the building the build order wants next (supply, a
            // factory, the tech, the air factory): otherwise the army spends every shard as it comes in.
            // (the guided first game: its army no bigger than `GUIDED_ARMY`, then `GUIDED_ARMY_AFTER`)
            // (and nothing past its level's most fighters, `Diff::army_max`: its gold banks; a worker or its scout still)
            let full = self.army_full(e) && !u.def().worker && u.def().armed();
            if qlen < 2 && !saving && !self.guided_army_full(e, t) && !full {
                // (and the giant's supply: it needs several free places at once; the build order wants supply
                // earlier meanwhile, see `ai_build`)
                let [used, cap] = self.sup(e);
                let takes = self.takes(e, u);
                // (the Expedition's mercenaries too: they took hired places of their own until Nov 14, and their share
                // of the grid has its own cap, `line_max`; held back for the elite, its line starved)
                let line = self.factions[e as usize].grid && s.rax.def().trains.contains(&u);
                let elite_room = tech2 == Some(bkind) || line || cap - used >= takes + reserve;
                let room = Some(u) == scout
                    || (capital_due.is_none_or(|k| cap - used >= takes + self.takes(e, k))
                        && elite_room);
                if room
                    && self.can_afford(e, need(u))
                    && self.queue_unit(bid, u).is_ok()
                    && Some(u) == scout
                {
                    wanted_scout = None; // (one: not one from every factory that trains it this turn)
                }
            }
        }
    }

    /// The gold `e`'s other factories hold back for its vehicle bay's siege (`AiScript::heavy`: the Kingdom's Workshop and
    /// its Cannons, its top tier; the arc): while the bay stands idle and a siege unit of its mix is due (its time come,
    /// its requirement standing, on a level that fields it), that unit's price; else 0. (Its Barracks spent every coin
    /// first each turn, and its Cannons came at 14 minutes.)
    pub(crate) fn siege_hold(&self, e: u8, my_b: &[Id], t: f64) -> i32 {
        let s = &self.factions[e as usize].ai;
        let Some(heavy) = s.heavy else { return 0 };
        let idle = my_b
            .iter()
            .filter_map(|&id| self.bldg(id))
            .any(|b| b.kind == heavy && b.done && b.queue.is_empty());
        if !idle {
            return 0;
        }
        let level = self.level();
        s.mix
            .iter()
            .map(|&m| level.mix_entry(m))
            .filter(|&(k, _, from)| {
                heavy.def().trains.contains(&k)
                    && t >= from
                    && self.level_allows(k)
                    && k.def().req.is_none_or(|r| self.has_bldg(e, r))
                    && k.def().weapon.is_some_and(|w| w.siege)
            })
            .map(|(k, _, _)| k.def().cost[0])
            .min()
            .unwrap_or(0)
    }

    /// Whether the seat taking its turn answers the enemy's siege now: on a level that adapts (`Diff::answers`), with
    /// `SIEGE_SEEN` or more of it seen at once lately.
    pub(crate) fn siege_answered(&self) -> bool {
        self.level().answers && self.ai().siege_seen.0 >= SIEGE_SEEN
    }

    /// The gold `e`'s other factories hold back for its answer to siege (`AiScript::dive`: the Knight, the Drone; Stelian,
    /// Nov 13: the answer to entrenched siege is the other side's tech, never more basics), as `siege_hold`: while it
    /// answers the enemy's siege (`siege_answered`) and a finished factory that trains it stands idle, its price; else 0.
    pub(crate) fn dive_hold(&self, e: u8, my_b: &[Id], t: f64) -> i32 {
        let s = &self.factions[e as usize].ai;
        let Some(k) = s
            .dive
            .filter(|&k| self.siege_answered() && self.level_allows(k))
        else {
            return 0;
        };
        let level = self.level();
        let due = s
            .mix
            .iter()
            .map(|&m| level.mix_entry(m))
            .any(|(m, _, from)| m == k && t >= from);
        let idle = my_b
            .iter()
            .filter_map(|&id| self.bldg(id))
            .any(|b| b.done && b.queue.is_empty() && b.kind.def().trains.contains(&k));
        if due && idle && k.def().req.is_none_or(|r| self.has_bldg(e, r)) {
            k.def().cost[0]
        } else {
            0
        }
    }

    /// The gold `e`'s other factories hold back for its gate's elite (`gate_hold` in `ai_produce`): the price of the unit
    /// its finished Portal (`AiScript::tech2`) trains next by the mix (the one furthest behind its ratio, as the Portal
    /// picks it; the cheapest it trains with none due), while that Portal is idle, on a level that fields it; else 0. (The cheapest alone left the Android, dearer than the Rover since
    /// Nov 13, never paid for.)
    pub(crate) fn gate_hold(&self, e: u8, my_b: &[Id]) -> i32 {
        let s = &self.factions[e as usize].ai;
        let Some(k2) = s.tech2 else {
            return 0;
        };
        let Some(gate) = my_b
            .iter()
            .filter_map(|&id| self.bldg(id))
            .find(|b| b.kind == k2 && b.done && b.queue.is_empty())
        else {
            return 0;
        };
        let trains = gate.kind.def().trains;
        let count = |k: UnitKind| {
            self.units
                .iter()
                .filter(|u| u.team == e && u.kind == k)
                .count()
        };
        let level = self.level();
        let next = s
            .mix
            .iter()
            .map(|&m| level.mix_entry(m))
            .filter(|&(k, _, from)| {
                trains.contains(&k) && self.level_allows(k) && self.time >= from
            })
            .min_by_key(|&(k, per, _)| (count(k) + 1) * per)
            .map(|(k, _, _)| k.def().cost[0]);
        next.or_else(|| {
            trains
                .iter()
                .filter(|&&u| self.level_allows(u))
                .map(|u| u.def().cost[0])
                .min()
        })
        .unwrap_or(0)
    }

    /// The grid `e` keeps free for its elite (`AiScript::tech2`, the Expedition's Portal, and the mixed-in unit it
    /// trains, the Android), so its other factories' machines leave room for them: before the Portal is placed, while
    /// it is wanted (`tech2_wanted`), one Android's; once it stands or goes up, one Android's
    /// while the mix's ratio to the line calls for another. 0 for a side without one.
    pub(crate) fn elite_reserve(&self, e: u8, my_b: &[Id], t: f64) -> i32 {
        let s = &self.factions[e as usize].ai;
        let Some(k2) = s.tech2 else { return 0 };
        let level = self.level();
        let Some((k, per, _)) = s
            .mix
            .iter()
            .map(|&m| level.mix_entry(m))
            .find(|&(k, _, _)| k2.def().trains.contains(&k) && self.level_allows(k))
        else {
            return 0;
        };
        let mine = |k: UnitKind| {
            self.units
                .iter()
                .filter(|u| u.team == e && u.kind == k)
                .count()
                + self
                    .bldgs
                    .iter()
                    .filter(|b| b.team == e)
                    .flat_map(|b| b.queue.iter())
                    .filter(|&&q| q == k)
                    .count()
        };
        if self.ai_count(my_b, false, k2) == 0 {
            if self.tech2_wanted(e, my_b, t, k2) {
                self.takes(e, k)
            } else {
                0
            }
        } else if (mine(k) + 1) * per
            <= mine(if self.ai_banned(e, s.basic) {
                self.ai_substitute(s.rax).unwrap_or(s.basic)
            } else {
                s.basic
            })
        {
            self.takes(e, k)
        } else {
            0
        }
    }

    /// What a factory of the AI taking its turn trains in place of a unit its plan's dare bars: the first of
    /// its units, workers left out, that its level fields and the dare allows (None: none).
    pub(crate) fn ai_substitute(&self, factory: BldgKind) -> Option<UnitKind> {
        factory
            .def()
            .trains
            .iter()
            .copied()
            .find(|&k| !k.def().worker && self.level_allows(k))
    }

    /// Whether the seat taking its turn trains `k` at its level now (`Diff::mix_tier`, risen by `tier_at`), and for a
    /// top-tier unit, whether it holds fewer than its most (`Diff::top_max`, queued ones counted).
    pub(crate) fn level_allows(&self, k: UnitKind) -> bool {
        // (a plan's dare: its plan's dare, the kinds it never trains)
        if self.ai_banned(self.seat(), k) {
            return false;
        }
        let d = self.level();
        let risen = d.tier_at.iter().filter(|&&at| self.time >= at).count() as u8;
        if k.ai_tier() > d.mix_tier + risen {
            return false;
        }
        d.top_max == 0 || k.ai_tier() < 2 || self.top_tier_of(self.seat()) < d.top_max
    }

    /// Seat `e`'s top-tier units (`UnitKind::ai_tier` 2), queued ones counted.
    pub(crate) fn top_tier_of(&self, e: u8) -> usize {
        self.units
            .iter()
            .filter(|u| u.team == e && u.kind.ai_tier() == 2)
            .count()
            + self
                .bldgs
                .iter()
                .filter(|b| b.team == e)
                .flat_map(|b| b.queue.iter())
                .filter(|k| k.ai_tier() == 2)
                .count()
    }

    /// Seat `e`'s side's tech time (its techs, its second tech building): its people's
    /// (`AiScript::tech_from`), its tuning's if sooner, and never before its tuning's `tech_not_before` (Easy: late).
    pub(crate) fn tech_time(&self, e: u8) -> f64 {
        let d = self.tuning(e);
        self.factions[e as usize]
            .ai
            .tech_from
            .min(d.tech_from)
            .max(d.tech_not_before)
    }

    /// The capital unit `e`'s finished air factory should raise now (one after CAPITAL_AT[0] s, a second after
    /// [1]), if any: counted with those queued.
    pub(crate) fn capital_due(&self, e: u8, my_b: &[Id], t: f64) -> Option<UnitKind> {
        let air = self.factions[e as usize].ai.air;
        let k = my_b
            .iter()
            .filter_map(|&id| self.bldg(id))
            .filter(|b| b.done && b.kind == air)
            .find_map(|b| {
                b.kind.def().trains.iter().copied().find(|&k| {
                    k.def().capital
                        && self.level_allows(k)
                        && k.def()
                            .req
                            .is_none_or(|r| self.ai_count(my_b, true, r) >= 1)
                })
            })?;
        let have = self
            .units
            .iter()
            .filter(|u| u.team == e && u.kind == k)
            .count()
            + self
                .bldgs
                .iter()
                .filter(|b| b.team == e)
                .flat_map(|b| b.queue.iter())
                .filter(|&&q| q == k)
                .count();
        (have < CAPITAL_AT.iter().filter(|&&at| t > at).count()).then_some(k)
    }

    /// A mix ratio (one `k` per `per` line units) answered to what the enemy fields: a splashing specialist comes
    /// twice as often against massed infantry (8+ seen), half as often against heavies (4+) with little infantry.
    pub(crate) fn answer_ratio(&self, k: UnitKind, per: usize) -> usize {
        // (its answer to the enemy's siege: one per line unit while it sees that siege)
        if Some(k) == self.factions[self.seat() as usize].ai.dive && self.siege_answered() {
            return 1;
        }
        if !self.level().answers || !k.def().weapon.is_some_and(|w| w.splash > 0.0) {
            return per;
        }
        let (inf, heavy) = (self.ai().infantry_seen.0, self.ai().heavy_seen.0);
        if inf >= 8 {
            per.div_ceil(2)
        } else if heavy >= 4 {
            per * 2
        } else {
            per
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::data::*;
    use crate::world::World;

    #[test]
    fn the_mix_answers_what_the_enemy_fields() {
        let mut w = World::new(17, 1);
        w.ai_turn = ENEMY;
        assert_eq!(w.answer_ratio(UnitKind::SiegeTank, 2), 2);
        w.ai_mut().infantry_seen = (10, 0.0);
        assert_eq!(
            w.answer_ratio(UnitKind::SiegeTank, 2),
            1,
            "splash against massed infantry"
        );
        assert_eq!(
            w.answer_ratio(UnitKind::Knight, 6),
            6,
            "only the splashing specialists"
        );
        w.ai_mut().infantry_seen = (2, 0.0);
        w.ai_mut().heavy_seen = (5, 0.0);
        assert_eq!(
            w.answer_ratio(UnitKind::SiegeTank, 2),
            4,
            "fewer heavies against heavies"
        );
    }

    #[test]
    fn the_answer_to_siege_is_its_dive_unit_trained_and_saved_for() {
        // Two enemy siege guns seen at once: a level that adapts (Medium) trains its dive unit (the Kingdom's Knight) one
        // per Guard instead of one per four, and its other factories hold a Knight's price while its Stables stand idle;
        // Easy adapts nothing. (Found in the lab: Medium's Kingdom never trained a Knight against Rovers behind a mast,
        // its Barracks spending every coin first, and its waves broke on them for good.)
        for (level, answers) in [(1, true), (0, false)] {
            let mut w = World::new(17, level);
            w.ai_turn = ENEMY;
            w.time = 900.0;
            let (bx, by) = w.map.bases[ENEMY as usize];
            w.make_building(BldgKind::Forge, ENEMY, bx + 6, by - 1, true);
            let stables = w.make_building(BldgKind::Airfield, ENEMY, bx + 6, by + 6, true);
            let my_b: Vec<_> = w
                .bldgs
                .iter()
                .filter(|b| b.team == ENEMY)
                .map(|b| b.id)
                .collect();
            assert_eq!(
                w.dive_hold(ENEMY, &my_b, 900.0),
                0,
                "nothing seen: nothing held"
            );
            w.ai_mut().siege_seen = (2, 890.0);
            let ratio = w.answer_ratio(UnitKind::Knight, 4);
            let hold = w.dive_hold(ENEMY, &my_b, 900.0);
            if answers {
                assert_eq!((ratio, hold), (1, UnitKind::Knight.def().cost[0]), "Medium");
                w.res[ENEMY as usize][0] = 2000;
                w.queue_unit(stables, UnitKind::Knight).unwrap();
                assert_eq!(
                    w.dive_hold(ENEMY, &my_b, 900.0),
                    0,
                    "a Knight in training: none held"
                );
            } else {
                assert_eq!((ratio, hold), (4, 0), "Easy");
            }
        }
    }

    #[test]
    fn the_gate_holds_the_price_of_the_elite_it_trains_next() {
        // The Portal idle: its next unit by the mix is held, the Android first (one per three of the line), then the
        // Rover (one per four); the cheapest alone left the Android, dearer since Nov 13, never paid for.
        let mut w = World::with_setup(
            17,
            1,
            crate::map::MapKind::Standard,
            false,
            [&HUMANS, &VAEL],
        );
        w.ai_turn = ENEMY;
        w.time = 900.0;
        let (bx, by) = w.map.bases[ENEMY as usize];
        w.make_building(BldgKind::Uplink, ENEMY, bx + 6, by - 2, true);
        w.make_building(BldgKind::Eclipse, ENEMY, bx + 6, by + 5, true);
        let my_b: Vec<_> = w
            .bldgs
            .iter()
            .filter(|b| b.team == ENEMY)
            .map(|b| b.id)
            .collect();
        assert_eq!(
            w.gate_hold(ENEMY, &my_b),
            UnitKind::Umbra.def().cost[0],
            "the Android first"
        );
        let (x, y) = ((bx as f64 - 3.0) * 32.0, by as f64 * 32.0);
        w.make_unit(UnitKind::Umbra, ENEMY, x, y);
        assert_eq!(
            w.gate_hold(ENEMY, &my_b),
            UnitKind::Monolith.def().cost[0],
            "then a Rover"
        );
    }

    #[test]
    fn medium_s_and_hard_s_kingdom_take_their_natural_later_on_bigger_maps_hard_s_expedition_at_7_00()
     {
        // `Diff::expand_at_of` (Nov 13): on Medium and Hard the Kingdom takes its natural later than the Expedition, on
        // maps up to 96 wide and on bigger ones: Hard at 7:00 and 10:00 (8:00 on 96 until Nov 19), Medium at 8:15 and
        // 11:00 since Nov 17 (with the mines spaced out, Medium's Kingdom won half its games at 8:00 and 10:00); the
        // Expedition at Medium's `expand_at`, and on Hard at 7:00 on both sizes since Nov 18 (at Hard's 5:30 its army
        // stood still while its Data center went up, and the Kingdom won 89% of its games on 96); every people on Easy
        // at Easy's.
        for (size, level, kingdom, expedition) in [
            (96, 1, 495.0, DIFF[1].expand_at),
            (128, 1, 660.0, DIFF[1].expand_at),
            (96, 2, 420.0, 420.0),
            (128, 2, 600.0, 420.0),
        ] {
            let mut w = World::with_size(
                1,
                level,
                crate::map::MapKind::Standard,
                crate::map::MapSize::square(size),
                0,
                &[&HUMANS, &VAEL],
            );
            assert!(w.set_diffs(&[level as u8, level as u8]));
            w.ai_turn = PLAYER;
            assert_eq!(
                w.expand_time(PLAYER),
                kingdom,
                "{size}, level {level}: the Kingdom"
            );
            w.ai_turn = ENEMY;
            assert_eq!(
                w.expand_time(ENEMY),
                expedition,
                "{size}, level {level}: the Expedition"
            );
        }
        let w = World::with_setup(1, 0, crate::map::MapKind::Standard, false, [&HUMANS, &VAEL]);
        assert_eq!(w.expand_time(PLAYER), DIFF[0].expand_at, "Easy as ever");
    }

    #[test]
    fn a_plan_s_tech_from_brings_its_side_s_tech_time_forward() {
        // The balance lab's tech-first plan (`Diff::tech_from`): its seat's tech time is the plan's when sooner than its
        // people's own; the other seat keeps its level's.
        let mut w = World::with_setup(4, 1, crate::map::MapKind::Standard, false, [&VAEL, &VAEL]);
        let own = w.tech_time(1);
        let plan = Diff {
            tech_from: 120.0,
            ..DIFF[1]
        };
        assert!(w.set_ai_plans(&[Some(plan), None]));
        assert_eq!(w.tech_time(0), 120.0_f64.min(own));
        assert!(
            w.tech_time(0) < own,
            "sooner than its people's own ({own} s)"
        );
        assert_eq!(w.tech_time(1), own);
    }

    #[test]
    fn a_standing_lab_makes_the_uplink_due_with_no_machine_yet_and_easy_s_with_its_machines() {
        // The Uplink first (Stelian, Nov 27): due once its Lab stands, no machine needed (four, or its Portal placed,
        // before); never a second while one stands or goes up; Easy's only once its level fields machines (its mid
        // tier, drawn 10:00 to 13:00: none before then, so no Uplink for nothing).
        for level in [0, 1] {
            let mut w = World::with_setup(
                17,
                level,
                crate::map::MapKind::Standard,
                false,
                [&HUMANS, &VAEL],
            );
            w.ai_turn = ENEMY;
            let (bx, by) = w.map.bases[ENEMY as usize];
            assert!(!w.uplink_due(ENEMY), "no Lab");
            w.make_building(BldgKind::Loom, ENEMY, bx + 6, by - 2, true);
            w.time = 200.0;
            assert_eq!(w.uplink_due(ENEMY), level > 0, "a Lab, at 3:20");
            w.time = 800.0; // (past Easy's mid tier, whatever its draw)
            assert!(w.uplink_due(ENEMY), "a Lab, machines in its mix");
            w.make_building(BldgKind::Uplink, ENEMY, bx - 6, by + 4, false);
            assert!(!w.uplink_due(ENEMY), "one going up: no second");
        }
    }
}
