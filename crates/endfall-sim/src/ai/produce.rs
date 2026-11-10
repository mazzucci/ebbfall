//! The AI's production: the right unit from each factory, what it holds back for its next building and a capital
//! unit, rally points.

use super::*;

/// Game times (s) after which the AI wants its first and second capital unit.
const CAPITAL_AT: [f64; 2] = [450.0, 660.0];

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
        // A capital unit due: the other factories keep its price back too, or the army spends every shard and the
        // giant never comes. What is held back (for it, and for the building the build order wants next) only
        // counts against a unit for the resources that unit spends: a Trooper does not wait for ether.
        let capital_due = self.capital_due(e, &my_b, t);
        let held = {
            let r = want.map_or([0, 0], |w| w.def().cost);
            let k = capital_due.map_or([0, 0], |k| k.def().cost);
            [r[0] + k[0], r[1] + k[1]]
        };
        let need = |c: [i32; 2]| [0, 1].map(|i| c[i] + if c[i] > 0 { held[i] } else { 0 });
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
        // Supply tight: the specialists' factories (the air factory, the vehicle bay) take the free places before the
        // barracks, else several barracks fill them every round and a specialist that is due never fits. With room to
        // spare, every factory in building order as ever.
        let order: Vec<Id> = {
            let [used, cap] = self.sup[e as usize];
            let s = &self.factions[e as usize].ai;
            let first = |id: &Id| {
                self.bldg(*id)
                    .is_some_and(|b| b.kind == s.air || s.heavy == Some(b.kind))
            };
            if cap - used < SUPPLY_TIGHT {
                let (mut a, b): (Vec<Id>, Vec<Id>) = my_b.iter().copied().partition(first);
                a.extend(b);
                a
            } else {
                my_b.clone()
            }
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
            let need = |k: UnitKind| {
                if Some(k) == scout {
                    k.def().cost
                } else {
                    need(k.def().cost)
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
            let mixed = s
                .mix
                .iter()
                .map(|&m| level.mix_entry(m))
                .find(|&(k, per, from)| {
                    if !self.level_allows(k) {
                        return false;
                    }
                    let per = self.answer_ratio(k, per);
                    b.kind.def().trains.contains(&k)
                        && t >= from
                        && k.def()
                            .req
                            .is_none_or(|r| self.ai_count(&my_b, true, r) >= 1)
                        && (mine(self, k) + 1) * per <= mine(self, s.basic)
                });
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
            } else if b.kind == s.rax && short_of_aa && mine(self, s.anti_air) < cheap_cap {
                s.anti_air
            } else if let Some(k) =
                heavy_aa.filter(|k| short_of_aa && b.kind.def().trains.contains(k))
            {
                k
            } else if let Some((k, _, _)) = mixed
                && (b.kind == s.rax
                    || heavy
                    // (the air factory takes turns: a mixed-in unit (a Knight, a Rover), then a raider, until its
                    // raiders are all out: neither starves the other)
                    || (b.kind == s.air
                        && (mine(self, k) <= mine(self, s.raider) || mine(self, s.raider) >= 6)))
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
            let qlen = b.queue.len();
            if b.rally.is_none() {
                self.set_rally(bid, rally.x, rally.y, None);
            }
            // Units wait while the money is spoken for by the building the build order wants next (supply, a
            // factory, the tech, the air factory): otherwise the army spends every shard as it comes in.
            // (the guided first game: its army no bigger than `GUIDED_ARMY`, then `GUIDED_ARMY_AFTER`)
            if qlen < 2 && !saving && !self.guided_army_full(e, t) {
                // (and the giant's supply: it needs several free places at once; the build order wants supply
                // earlier meanwhile, see `ai_build`)
                let [used, cap] = self.sup[e as usize];
                let room = Some(u) == scout
                    || capital_due.is_none_or(|k| cap - used >= u.def().supply + k.def().supply);
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

    /// Whether the seat taking its turn trains `k` at its level (`Diff::mix_tier`).
    pub(crate) fn level_allows(&self, k: UnitKind) -> bool {
        k.ai_tier() <= self.level().mix_tier
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
}
