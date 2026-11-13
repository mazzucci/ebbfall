//! The AI's research, and saving up for it or for an expansion.

use super::*;

/// How long (s) before its side's `tech_from` the AI may launch its satellite (`Effect::Launch`), on every level: the
/// launch (60 s), the Uplink and the Portal then stand about when its Androids are due.
pub(crate) const LAUNCH_LEAD: f64 = 120.0;

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
        let (rax, tech_from) = (script.rax, self.tech_time(e));
        let on_schedule = self.ai_count(&my_b, false, rax) >= self.rax_schedule(t);
        let techs = d.abilities && t > d.research_from.min(tech_from) && on_schedule;
        // An economy tech (faster construction) as soon as the opening's factories stand, on levels that research
        // at all: it pays back over the whole game. (Behind its schedule's factories or not: under the economy pass's
        // scarcer gold Hard's later factories ran behind for good, and it researched its weapons, never this.)
        let economy = d.research_from < NEVER && self.ai_count(&my_b, true, rax) >= d.rax;
        let levels_due = t > d.research_from;
        // (the satellite: on every level, from `LAUNCH_LEAD` before the side's tech time, once its Lab stands)
        let launch = t > tech_from - LAUNCH_LEAD && on_schedule;
        let threatened = intruder.is_some() || (enemy_air > 0 && anti_air < enemy_air * 2);
        let mut saving = false;
        if (techs || levels_due || economy || launch) && !expand {
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
                            } else if up.def().effect == Effect::Launch {
                                launch
                            } else if up.levels() == 1 {
                                techs
                            } else {
                                levels_due
                            })
                            && self.tech_of_use(e, &my_b, up)
                            && up.def().req.is_none_or(|r| self.has_bldg(e, r))
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
            // (an expansion's Castle is saved for twice as long: at the second round's slower income, 30 s of saving
            // came to less than its price, and the AI never expanded)
            let most = if expand { 2.0 * SAVE_MAX } else { SAVE_MAX };
            if t - since > most && !(expand && dry) {
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
    /// with that ability stands, a unit's speed only once one that trains that unit stands (no Spindrift at the Lab
    /// before a Factory); anything else always.
    pub(crate) fn tech_of_use(&self, e: u8, my_b: &[Id], up: Upgrade) -> bool {
        let serves: &dyn Fn(UnitKind) -> bool = match up.def().effect {
            // (not a toggle: the AI never braces a unit, its siege guns anchor by their own rule)
            Effect::Unlock(_) => return false,
            Effect::Speed(unit) => &move |k: UnitKind| k == unit,
            _ => return true,
        };
        my_b.iter()
            .filter_map(|&id| self.bldg(id))
            .any(|b| b.team == e && b.done && b.kind.def().trains.iter().any(|&k| serves(k)))
    }
}

/// A tech for the economy rather than the army (researched early, on every level that researches).
fn is_economy(up: Upgrade) -> bool {
    up.def().effect == Effect::BuildSpeed
}
