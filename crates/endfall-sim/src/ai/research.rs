//! The AI's research, and saving up for it or for an expansion.

use super::*;

impl World {
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
}
