//! The AI's production: the right unit from each factory, what it holds back for its next building and a capital
//! unit, rally points.

use super::*;

/// Game times (s) after which the AI wants its first and second capital unit.
const CAPITAL_AT: [f64; 2] = [450.0, 660.0];

/// Unspent ether the AI counts as piling up (it then leans on its ether-hungry specialists).
pub(crate) const ETHER_FLOAT: i32 = 200;

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
        // Production. Barracks answer enemy flyers (as far as the AI knows) with Lancers and bring a Medic per six
        // Troopers; the Factory, once the Forge stands, answers flyers with Interceptors (then the Barracks bring only
        // half the answer in Lancers), and mixes in a Vanguard per two Troopers and, from 5:30, a Siege Tank per six.
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
        // Hit by something unseen (anywhere): one detector of its own goes with the army (its side's field detector:
        // an Observer, a Halo), first from the factory that trains it, and nothing is held back from it.
        let mut wanted_detector = self.factions[e as usize]
            .field_detector()
            .filter(|&k| self.ai().unseen_hit && mine(self, k) == 0);
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
        for &bid in &my_b {
            let Some(b) = self.bldg(bid) else { continue };
            if !b.done || b.kind.def().hq || b.kind.def().trains.is_empty() {
                continue;
            }
            let s = &self.factions[e as usize].ai;
            let detector = wanted_detector.filter(|k| {
                b.kind.def().trains.contains(k)
                    && k.def()
                        .req
                        .is_none_or(|r| self.ai_count(&my_b, true, r) >= 1)
            });
            let need = |k: UnitKind| {
                if Some(k) == detector {
                    k.def().cost
                } else {
                    need(k.def().cost)
                }
            };
            // The main factory answers enemy flyers, then each factory mixes in the specialists it trains by ratio
            // (each once its requirement stands: a Vanguard per two Troopers once the Forge stands beats massed
            // infantry; the Vael's Zenith an Umbra per six Scythes, between its capital barges). Ether piling up (the
            // line unit costs none) halves the ratios: spend it on specialists.
            let floating = self.res[e as usize][1] >= ETHER_FLOAT;
            let heavy = s.heavy == Some(b.kind);
            let mixed = s.mix.iter().find(|&&(k, per, from)| {
                let per = self.answer_ratio(k, if floating { per.div_ceil(2) } else { per });
                let Some(per) = self.cloak_ratio(k, per) else {
                    return false;
                };
                b.kind.def().trains.contains(&k)
                    && t >= from
                    && k.def()
                        .req
                        .is_none_or(|r| self.ai_count(&my_b, true, r) >= 1)
                    && (mine(self, k) + 1) * per <= mine(self, s.basic)
            });
            // The air factory's capital unit (a late giant): one after CAPITAL_AT[0] s, a second after [1]; it saves
            // up for it rather than spending the money on raiders.
            let capital = b.kind.def().trains.iter().copied().find(|k| {
                k.def().capital
                    && k.def()
                        .req
                        .is_none_or(|r| self.ai_count(&my_b, true, r) >= 1)
            });
            let allowance = CAPITAL_AT.iter().filter(|&&at| t > at).count();
            if b.kind == s.air
                && detector.is_none()
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
            let u = if let Some(k) = detector {
                k
            } else if b.kind == s.rax && short_of_aa && mine(self, s.anti_air) < cheap_cap {
                s.anti_air
            } else if let Some(k) =
                heavy_aa.filter(|k| short_of_aa && b.kind.def().trains.contains(k))
            {
                k
            } else if let Some(&(k, _, _)) = mixed
                && (b.kind == s.rax
                    || heavy
                    // (the air factory takes turns: a mixed-in unit (the Vael's Umbra), then a raider, until its
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
            // Short of ether for the specialist? Troopers (shards only) rather than an idle barracks. Short of
            // shards it waits for them instead, as a Trooper would only delay the specialist.
            let u = if self.res[e as usize][1] >= need(u)[1] {
                u
            } else if heavy {
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
            if qlen < 2 && !saving {
                // (and the giant's supply: it needs several free places at once; the build order wants supply
                // earlier meanwhile, see `ai_build`)
                let [used, cap] = self.sup[e as usize];
                let room = Some(u) == detector
                    || capital_due.is_none_or(|k| cap - used >= u.def().supply + k.def().supply);
                if room
                    && self.can_afford(e, need(u))
                    && self.queue_unit(bid, u).is_ok()
                    && Some(u) == detector
                {
                    wanted_detector = None; // (one: not one from every factory that trains it this turn)
                }
            }
        }
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
                b.kind.def().trains.iter().copied().find(|k| {
                    k.def().capital
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

    /// A mix ratio (one `k` per `per` line units) for an always-cloaked fighter (the Umbra): as scripted until it has
    /// seen an enemy field detector with an enemy army (`Ai::detector_seen`), none from then on. A player who sees
    /// detection walking with the enemy army stops sending blades that would only be found: the Human AI, once hit
    /// unseen, keeps an Observer with its army for the rest of the game, and a Vael army mixes in Halos, so a detector
    /// seen once is one met again. None on a level that does not adapt (Easy: an unseen killer is no lesson for a
    /// beginner). Any other unit: `per` as it is.
    pub(crate) fn cloak_ratio(&self, k: UnitKind, per: usize) -> Option<usize> {
        if !k.cloaked_fighter() {
            return Some(per);
        }
        (self.level().answers && !self.ai().detector_seen).then_some(per)
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
    use crate::ai::Brain;
    use crate::data::*;
    use crate::map::MapKind;
    use crate::world::World;

    #[test]
    fn the_mix_answers_what_the_enemy_fields() {
        let mut w = World::new(17, 1);
        w.ai_turn = ENEMY;
        assert_eq!(w.answer_ratio(UnitKind::Vanguard, 2), 2);
        w.ai_mut().infantry_seen = (10, 0.0);
        assert_eq!(
            w.answer_ratio(UnitKind::Vanguard, 2),
            1,
            "splash against massed infantry"
        );
        assert_eq!(
            w.answer_ratio(UnitKind::Medic, 6),
            6,
            "only the splashing specialists"
        );
        w.ai_mut().infantry_seen = (2, 0.0);
        w.ai_mut().heavy_seen = (5, 0.0);
        assert_eq!(
            w.answer_ratio(UnitKind::Vanguard, 2),
            4,
            "fewer heavies against heavies"
        );
    }

    #[test]
    fn umbras_come_until_an_enemy_detector_is_seen_with_its_army() {
        // The Vael AI mixes in Umbras as scripted; an enemy Observer it sees alone (a scout) changes nothing; one it
        // sees beside enemy fighters (with their army) stops them for good. Never on Easy; other units keep theirs.
        let mut w = World::with_setup(17, 1, MapKind::Standard, false, [&HUMANS, &VAEL]);
        w.ai_turn = ENEMY;
        assert_eq!(w.cloak_ratio(UnitKind::Umbra, 4), Some(4));
        let (x, y) = (32.0 * TILE, 32.0 * TILE);
        w.make_unit(UnitKind::Halo, ENEMY, x, y); // (its eyes: it sees the cloaked Observer only where it detects)
        let obs = w.make_unit(UnitKind::Observer, PLAYER, x + 2.0 * TILE, y);
        let watch = |w: &mut World| {
            w.update_fog();
            let mut b = Brain {
                e: ENEMY,
                ..Brain::default()
            };
            w.ai_watch(&mut b);
        };
        watch(&mut w);
        assert!(w.ai_sees_unit(w.unit(obs).unwrap()), "it sees the Observer");
        assert_eq!(w.cloak_ratio(UnitKind::Umbra, 4), Some(4), "a lone scout");
        w.make_unit(UnitKind::Trooper, PLAYER, x + 4.0 * TILE, y);
        watch(&mut w);
        assert_eq!(
            w.cloak_ratio(UnitKind::Umbra, 4),
            None,
            "with the army: none"
        );
        w.units.retain(|u| u.team != PLAYER);
        watch(&mut w);
        assert_eq!(w.cloak_ratio(UnitKind::Umbra, 4), None, "for good");
        assert_eq!(w.cloak_ratio(UnitKind::Monolith, 3), Some(3));
        let mut easy = World::with_setup(17, 0, MapKind::Standard, false, [&HUMANS, &VAEL]);
        easy.ai_turn = ENEMY;
        assert_eq!(easy.cloak_ratio(UnitKind::Umbra, 4), None, "never on Easy");
    }
}
