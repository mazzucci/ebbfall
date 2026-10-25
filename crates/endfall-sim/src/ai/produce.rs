//! The AI's production: the right unit from each factory, what it holds back for its next building and a capital
//! unit, rally points.

use super::*;

/// Game times (s) after which the AI wants its first and second capital unit.
const CAPITAL_AT: [f64; 2] = [450.0, 660.0];

/// Unspent ether the AI counts as piling up (it then leans on its ether-hungry specialists).
const ETHER_FLOAT: i32 = 200;

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
                let per = self.answer_ratio(k, if floating { per.div_ceil(2) } else { per });
                k.def()
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
            let u = if self.res[e as usize][1] >= need(u.def().cost)[1] {
                u
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
                let room =
                    capital_due.is_none_or(|k| cap - used >= u.def().supply + k.def().supply);
                if room && self.can_afford(e, need(u.def().cost)) {
                    let _ = self.queue_unit(bid, u);
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

    /// A mix ratio (one `k` per `per` line units) answered to what the enemy fields: a splashing specialist comes
    /// twice as often against massed infantry (8+ seen), half as often against heavies (4+) with little infantry.
    pub(crate) fn answer_ratio(&self, k: UnitKind, per: usize) -> usize {
        if !k.def().weapon.is_some_and(|w| w.splash > 0.0) {
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
}
