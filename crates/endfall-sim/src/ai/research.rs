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
            anti_air,
            expand,
            dry,
            ..
        } = brain.clone();
        // Research: an economy tech (Rapid Construction) first, once its opening factories stand; its techs
        // (abilities, a faster flyer) as soon as their building stands, on levels whose units use abilities; weapons
        // and armor in turn from the difficulty's research_from (Easy never); none while saving for an expansion. Until it can afford the next one it saves up (no new units), but never while under
        // attack or short of anti-air against flyers, and for at most SAVE_MAX seconds at a time.
        const SAVE_MAX: f64 = 30.0;
        let d = self.level();
        // (techs from its side's tech_from at the latest, and never while its factories are behind the build order:
        // army first)
        let script = &self.factions[e as usize].ai;
        let rax = script.rax;
        let on_schedule = self.ai_count(&my_b, false, rax) >= self.rax_schedule(t);
        let techs = d.abilities && t > d.research_from.min(script.tech_from) && on_schedule;
        // An economy tech (faster construction) as soon as the opening's factories stand, on levels that research
        // at all: it pays back over the whole game.
        let economy =
            d.research_from < NEVER && on_schedule && self.ai_count(&my_b, true, rax) >= d.rax;
        let levels_due = t > d.research_from;
        let threatened = intruder.is_some() || (enemy_air > 0 && anti_air < enemy_air * 2);
        let mut saving = false;
        if (techs || levels_due || economy) && !expand {
            for &bid in &my_b {
                let Some(b) = self.bldg(bid) else { continue };
                if b.kind.def().researches.is_empty() || !b.done || b.research.is_some() {
                    continue;
                }
                // Techs first (an ability or speed is worth more than a level; the economy's before the army's),
                // then the lowest level (the earlier upgrade on a tie).
                let levels = self.upgrades[e as usize];
                let mut order = UPGRADES;
                order.sort_by_key(|&u| {
                    (u.levels() > 1, levels[u.index()], !is_economy(u), u.index())
                });
                let busy = |w: &World, up: Upgrade| {
                    w.bldgs
                        .iter()
                        .any(|o| o.team == e && o.research.is_some_and(|(u, _)| u == up))
                };
                let here = b.kind.def().researches;
                let candidates: Vec<Upgrade> = order
                    .into_iter()
                    .filter(|&up| {
                        here.contains(&up)
                            && (if is_economy(up) {
                                economy
                            } else if up.levels() == 1 {
                                techs
                            } else {
                                levels_due
                            })
                            && self.tech_of_use(e, &my_b, up)
                            && self.upgrades[e as usize][up.index()] < up.levels()
                            && !busy(self, up)
                    })
                    .collect();
                // The first it can afford; a tech it cannot is passed over (never saved for), a level is saved for.
                for up in candidates {
                    let level = self.upgrades[e as usize][up.index()] + 1;
                    if self.can_afford(e, up.cost(level)) {
                        let _ = self.start_research(bid, up);
                        break;
                    }
                    if up.levels() > 1 {
                        saving = true;
                        break;
                    }
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
            if t - since > SAVE_MAX && !(expand && dry) {
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

    /// Whether a tech would serve this side now: an ability's only once a building of its own that trains a unit
    /// with that ability stands (no Cloaking Field before an Airfield); anything else always.
    fn tech_of_use(&self, e: u8, my_b: &[Id], up: Upgrade) -> bool {
        let Effect::Unlock(ab) = up.def().effect else {
            return true;
        };
        my_b.iter().filter_map(|&id| self.bldg(id)).any(|b| {
            b.team == e
                && b.done
                && b.kind
                    .def()
                    .trains
                    .iter()
                    .any(|k| k.def().abilities.contains(&ab))
        })
    }
}

/// A tech for the economy rather than the army (researched early, on every level that researches).
fn is_economy(up: Upgrade) -> bool {
    up.def().effect == Effect::BuildSpeed
}
