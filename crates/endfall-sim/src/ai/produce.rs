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
            let k = capital_due.map_or([0, 0], |k| k.def().cost);
            [r[0] + k[0], r[1] + k[1]]
        };
        let need = |c: [i32; 2]| [0, 1].map(|i| c[i] + if c[i] > 0 { held[i] } else { 0 });
        // The gate's elite (the arc: the Expedition's Portal, its Android or Rover): while its Portal stands idle with an
        // Uplink open, the other factories hold an elite's price back, or the posts spend every coin first each turn and
        // the Portal never trains (`gate_hold`).
        let gate_hold = self.gate_hold(e, &my_b)
            + self.launch_hold(e, t)
            + self.siege_hold(e, &my_b, t)
            + self.dive_hold(e, &my_b, t)
            + self.relay_hold(e);
        // Its elite due (the Expedition's Portal and its Android): the other factories keep its places free, or the
        // cheaper machines fill the Power every round and the Portal is never raised or never trains.
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
            // (the places the specialists take: population, or the Expedition's Power)
            let room = self.room(e, Pool::Supply);
            let s = &self.factions[e as usize].ai;
            let rank = |id: &Id| match self.bldg(*id) {
                Some(b) if s.tech2 == Some(b.kind) => 0,
                Some(b) if b.kind == s.air || s.heavy == Some(b.kind) => 1,
                _ => 2,
            };
            let mut order = my_b.clone();
            if room < self.places(e, Pool::Supply, SUPPLY_TIGHT) {
                order.sort_by_key(rank); // (stable: building order within each rank)
            }
            order
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
            let need = |k: UnitKind| {
                if Some(k) == scout || siege_bay {
                    k.def().cost
                } else if at_gate {
                    need(k.def().cost)
                } else {
                    let c = need(k.def().cost);
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
                                && mine(self, k) * per <= mine(self, s.basic))
                            || (mine(self, k) + 1) * per <= mine(self, s.basic))
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
                if idle && !saving && self.can_afford(e, c.def().cost) {
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
                        && (mine(self, k) <= mine(self, s.raider) || mine(self, s.raider) >= 6)
                        && (mine(self, s.raider) >= 6 || self.can_afford(e, need(k)))))
            {
                k
            } else if (b.kind == s.air && mine(self, s.raider) >= 6) || heavy {
                continue; // (the vehicle bay trains only its anti-air and what the mix calls for)
            } else {
                b.kind.def().trains[0]
            };
            // (a unit above its level's mix: its line unit instead, or nothing from a vehicle bay or an air factory)
            let u = if self.level_allows(u) {
                u
            } else if heavy || b.kind == s.air {
                continue;
            } else {
                b.kind.def().trains[0]
            };
            // (its line at its level's most, `line_max`: nothing more of that pool)
            let line_pool = self.factions[e as usize].ai.basic.def().pool;
            if u.def().pool == line_pool
                && self.pool(e, line_pool)[0] + u.def().supply > self.line_max(e)
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
                let elite_room = tech2 == Some(bkind)
                    || u.def().pool != Pool::Supply
                    || cap - used >= u.def().supply + reserve;
                let room = Some(u) == scout
                    || (capital_due.is_none_or(|k| cap - used >= u.def().supply + k.def().supply)
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

    /// The gold `e`'s factories hold back for its wave's leapfrog relay (`AiScript::relay`, the Uplink): its price, while
    /// a wave with machines is out, the relay unlocked, none going up and none abandoned; else 0. (Its factories spent
    /// every coin first each turn, and the relay that would bring its machines' coverage over the foe's base was never
    /// paid for when the wave's front got there: the machines stood at the edge.)
    pub(crate) fn relay_hold(&self, e: u8) -> i32 {
        let Some(tower) = self.factions[e as usize].ai.relay else {
            return 0;
        };
        let ai = self.ai();
        let machines = ai.attackers.as_ref().is_some_and(|a| {
            a.iter()
                .any(|&id| self.unit(id).is_some_and(|u| radio::needs_range(u.kind)))
        });
        if ai.attacking
            && machines
            && ai.relay_site.is_none()
            && !ai.relay_off
            && self.has_req(e, tower)
        {
            tower.def().cost[0]
        } else {
            0
        }
    }

    /// The gold `e`'s factories hold back for its satellite (the arc: the Expedition's way to its late game; a tech is
    /// never saved for, and its posts spent every coin first): half the launch's price, from `LAUNCH_LEAD` before its
    /// side's tech time, while its Lab stands and the launch is neither done nor under way.
    pub(crate) fn launch_hold(&self, e: u8, t: f64) -> i32 {
        let up = Upgrade::Satellite;
        let script = &self.factions[e as usize].ai;
        let tech_from = self.tech_time(e);
        let lab = up.def().req;
        let busy = self
            .bldgs
            .iter()
            .any(|b| b.team == e && b.research.is_some_and(|(u, _)| u == up));
        let wanted = script.tech2.is_some()
            && t > tech_from - super::research::LAUNCH_LEAD
            && self.upgrades[e as usize][up.index()] == 0
            && !busy
            && lab.is_none_or(|l| self.has_bldg(e, l));
        if wanted { up.cost(1)[0] / 2 } else { 0 }
    }

    /// The gold `e`'s other factories hold back for its gate's elite (`gate_hold` in `ai_produce`): the price of the unit
    /// its finished Portal (`AiScript::tech2`) trains next by the mix (the one furthest behind its ratio, as the Portal
    /// picks it; the cheapest it trains with none due), while that Portal is idle and may train (`BldgDef::trains_with`
    /// standing), on a level that fields it; else 0. (The cheapest alone left the Android, dearer than the Rover since
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
            .filter(|b| b.kind.def().trains_with.is_none_or(|r| self.has_bldg(e, r)))
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

    /// The Power `e` keeps free for its elite (`AiScript::tech2`, the Expedition's Portal, and the mixed-in unit it
    /// trains, the Android), so its other factories' machines leave room for them: before the Portal is placed, while
    /// it is wanted (`tech2_wanted`), the Portal's own use and one Android's; once it stands or goes up, one Android's
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
        if k.def().pool != Pool::Supply {
            return 0;
        }
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
                k2.def().uses + k.def().supply
            } else {
                0
            }
        } else if (mine(k) + 1) * per <= mine(s.basic) {
            k.def().supply
        } else {
            0
        }
    }

    /// Whether the seat taking its turn trains `k` at its level now (`Diff::mix_tier`, risen by `tier_at`).
    pub(crate) fn level_allows(&self, k: UnitKind) -> bool {
        let d = self.level();
        let risen = d.tier_at.iter().filter(|&&at| self.time >= at).count() as u8;
        k.ai_tier() <= d.mix_tier + risen
    }

    /// Seat `e`'s side's tech time (its techs, its satellite's launch, its second tech building): its people's
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
        w.upgrades[ENEMY as usize][Upgrade::Satellite.index()] = 1;
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
    fn a_wave_with_machines_out_holds_its_relay_s_price() {
        // A wave with a machine out and the Uplink unlocked: its factories hold an Uplink's price for the wave's leapfrog
        // relay (spent on units first, it was never paid for when the wave's front got there); none without a machine
        // in the wave, nor once a relay is going up or was abandoned.
        let mut w = World::with_setup(
            17,
            1,
            crate::map::MapKind::Standard,
            false,
            [&HUMANS, &VAEL],
        );
        w.ai_turn = ENEMY;
        w.upgrades[ENEMY as usize][Upgrade::Satellite.index()] = 1;
        let (bx, by) = w.map.bases[ENEMY as usize];
        let (x, y) = ((bx as f64 - 3.0) * 32.0, by as f64 * 32.0);
        let sellsword = w.make_unit(UnitKind::Prism, ENEMY, x, y);
        let rover = w.make_unit(UnitKind::Monolith, ENEMY, x + 30.0, y);
        let uplink = BldgKind::Uplink.def().cost[0];
        w.ai_mut().attacking = true;
        w.ai_mut().attackers = Some(vec![sellsword]);
        assert_eq!(w.relay_hold(ENEMY), 0, "no machine out");
        w.ai_mut().attackers = Some(vec![sellsword, rover]);
        assert_eq!(w.relay_hold(ENEMY), uplink, "a machine out");
        w.ai_mut().relay_off = true;
        assert_eq!(w.relay_hold(ENEMY), 0, "a relay abandoned");
    }
}
