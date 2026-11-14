//! AI play styles (PRD: AI styles and the level ladder). A level sets how strong an AI is; a style sets its plan for
//! one game: which attack layers it plays. Each AI seat draws one at its first turn from the world's seeded RNG, with a
//! leaning unit (`Diff::focus`) and, on Easy, its army cap and the time it climbs to the mid tier (`World::draw_style`,
//! ai/mod.rs). The style is never shown to the player (Stelian, Nov 13): no event, no toast, nothing in the UI.

use super::{Diff, NEVER, UnitKind};
use crate::jsmath;

/// A plan for the game, each a subset of the three attack layers (basic, mid, top: Stelian's bet applied to the AI).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Style {
    /// Basic and mid attacks: its first wave sooner and smaller, a later natural, later tech and top tier.
    Pressure,
    /// Mid and top attacks: its level's own plan.
    Timing,
    /// An early natural (due sooner, and before its other buildings), then a bigger push: its waves bigger.
    Boom,
}

impl Style {
    pub const ALL: [Style; 3] = [Style::Pressure, Style::Timing, Style::Boom];

    pub fn name(self) -> &'static str {
        match self {
            Style::Pressure => "Pressure",
            Style::Timing => "Timing",
            Style::Boom => "Boom",
        }
    }

    /// A style by its name, case ignored (the balance lab's `--styles`).
    pub fn from_name(s: &str) -> Option<Style> {
        Style::ALL
            .into_iter()
            .find(|st| st.name().eq_ignore_ascii_case(s))
    }

    /// Its index in `ALL`.
    pub fn index(self) -> usize {
        self as usize
    }
}

/// Each level's chances of each style (`Style::ALL` order), out of 100: Easy never plays Pressure (no early attacks
/// for a newcomer), Medium 15/50/35, Hard leaning Timing and Boom, the sim's level 3 its own plan alone.
pub const STYLE_WEIGHTS: [[u32; 3]; 4] = [[0, 50, 50], [15, 50, 35], [20, 40, 40], [0, 100, 0]];

/// Easy's army cap (`Diff::army_max`), drawn per game in this range (Stelian, Nov 13).
pub const EASY_ARMY: (usize, usize) = (8, 14);
/// When Easy climbs to the mid tier (s), drawn per game in this range (Stelian, Nov 14: 10:00 to 13:00).
pub const EASY_MID_AT: (f64, f64) = (600.0, 780.0);
/// Easy's Boom: its top tier from this time (s), one or two units of it at most (`EASY_TOP`).
pub const EASY_TOP_AT: f64 = 900.0;
pub const EASY_TOP: (usize, usize) = (1, 2);
/// A stalled game's push (`Diff::stall_from`) starts at a time drawn per seat in this range (s): two mirrored AIs'
/// all-ins no longer land together (the PM, Nov 14; 15:00 for every seat before).
pub const STALL_FROM: (f64, f64) = (780.0, 1020.0);

/// The draws one AI seat makes at its first turn, in this order (the order is part of the rules), each a float in
/// [0, 1) from the world's RNG: the style, the leaning unit, Easy's army cap, Easy's mid tier, Easy's top-tier count, the
/// stalled game's push. Every seat makes all six whatever its level uses.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct StyleDraws(pub [f64; 6]);

/// An integer in `lo..=hi` from a draw in [0, 1).
fn pick(u: f64, lo: usize, hi: usize) -> usize {
    lo + jsmath::to_i32((u * (hi - lo + 1) as f64).floor()).max(0) as usize
}

/// A whole second in `lo..=hi` from a draw in [0, 1).
fn pick_time(u: f64, (lo, hi): (f64, f64)) -> f64 {
    lo + (u * (hi - lo + 1.0)).floor()
}

/// The style a level draws from `u` (in [0, 1)), by `STYLE_WEIGHTS`.
pub fn style_of(level: usize, u: f64) -> Style {
    let w = STYLE_WEIGHTS[level.min(STYLE_WEIGHTS.len() - 1)];
    let total: u32 = w.iter().sum();
    let mut roll = (u * total as f64).floor();
    for (st, &wt) in Style::ALL.into_iter().zip(&w) {
        if roll < wt as f64 {
            return st;
        }
        roll -= wt as f64;
    }
    Style::Timing
}

/// The leaning unit (`Diff::focus`) from `u`: one of the race's mix entries (`mix`, as the level plays them) whose
/// ratio a lean changes, within the tier the level can reach (`reach`, `UnitKind::ai_tier`). None for a mix with none.
pub fn focus_of(d: &Diff, mix: &[(UnitKind, usize, f64)], reach: u8, u: f64) -> Option<UnitKind> {
    let can: Vec<UnitKind> = mix
        .iter()
        .map(|&m| d.mix_over.iter().copied().find(|o| o.0 == m.0).unwrap_or(m))
        .filter(|&(k, per, _)| k.ai_tier() <= reach && per > 1)
        .map(|(k, _, _)| k)
        .collect();
    (!can.is_empty()).then(|| can[pick(u, 0, can.len() - 1)])
}

/// Level `level`'s tuning `base` played in style `st`, with the seat's draws `r` and its race's mix (for the leaning
/// unit). Pure: the same inputs give the same tuning.
pub fn styled(
    base: Diff,
    level: usize,
    st: Style,
    mix: &[(UnitKind, usize, f64)],
    r: &StyleDraws,
) -> Diff {
    let mut d = base;
    let [_, u_focus, u_army, u_mid, u_top, u_stall] = r.0;
    if d.stall_from < NEVER {
        d.stall_from = pick_time(u_stall, STALL_FROM);
    }
    if level == 0 {
        // Easy: its army cap and its climb to the mid tier drawn; the top tier only in Boom, late, one or two units.
        d.army_max = pick(u_army, EASY_ARMY.0, EASY_ARMY.1);
        let mid = pick_time(u_mid, EASY_MID_AT);
        d.tier_at = [mid, NEVER];
        // (its raiders' factory, its vehicle bay and its techs wait for that tier: nothing they train before it)
        d.air_at = d.air_at.max(mid);
        d.heavy_at = d.heavy_at.max(mid + 60.0);
        d.tech_not_before = d.tech_not_before.max(mid);
        if st == Style::Boom {
            d.tier_at = [mid, EASY_TOP_AT];
            d.top_max = pick(u_top, EASY_TOP.0, EASY_TOP.1);
            // (its first wave a minute later, a worker more: it builds before it attacks; still four units at most)
            d.first += 60.0;
            d.harv += 1;
        }
    } else if level <= 2 {
        match st {
            Style::Pressure => {
                d.first -= 30.0;
                d.wave = d.wave.saturating_sub(1).max(3);
                d.expand_shift += 90.0;
                d.tech_not_before = d
                    .tech_not_before
                    .max(if level == 1 { 480.0 } else { 360.0 });
                d.tier_at[0] += 120.0;
            }
            Style::Timing => {}
            Style::Boom => {
                d.expand_shift -= if level == 1 { 90.0 } else { 60.0 };
                d.natural_first = true;
                d.wave += 2;
            }
        }
    }
    // (the tier it can reach: its leaning unit within it, never Easy's one or two top-tier units)
    let reach = if level == 0 {
        d.mix_tier + 1
    } else {
        d.mix_tier + d.tier_at.iter().filter(|&&at| at < NEVER).count() as u8
    };
    d.focus = focus_of(&d, mix, reach, u_focus);
    d
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::{DIFF, HUMANS, VAEL};

    fn draws(u: f64) -> StyleDraws {
        StyleDraws([u; 6])
    }

    #[test]
    fn each_level_draws_its_styles_by_weight() {
        let count = |level: usize| {
            let mut n = [0; 3];
            for i in 0..1000 {
                n[style_of(level, i as f64 / 1000.0).index()] += 1;
            }
            n
        };
        assert_eq!(
            count(0),
            [0, 500, 500],
            "Easy: Timing or Boom, never Pressure"
        );
        assert_eq!(count(1), [150, 500, 350]);
        assert_eq!(count(2), [200, 400, 400]);
        assert_eq!(count(3), [0, 1000, 0]);
        assert_eq!(style_of(1, 0.999_999), Style::Boom);
    }

    #[test]
    fn easy_draws_its_army_cap_and_its_mid_tier_and_only_its_boom_reaches_the_top() {
        for i in 0..100 {
            let u = i as f64 / 100.0;
            for st in [Style::Timing, Style::Boom] {
                let d = styled(DIFF[0], 0, st, HUMANS.ai.mix, &draws(u));
                assert!((8..=14).contains(&d.army_max), "{}", d.army_max);
                assert!((600.0..=780.0).contains(&d.tier_at[0]), "{:?}", d.tier_at);
                assert_eq!(d.retreat_below, 0.0, "Easy does not retreat");
                assert!(!d.retreat_any && d.give_up == 0);
                assert_eq!(d.wave, 4, "its first wave four units at most");
                assert!(d.first >= 480.0, "never before 8:00");
                if st == Style::Boom {
                    assert_eq!(d.tier_at[1], 900.0);
                    assert!((1..=2).contains(&d.top_max));
                } else {
                    assert_eq!(d.tier_at[1], NEVER, "the mid tier at most");
                }
                assert!(d.focus.is_none_or(|k| k.ai_tier() <= 1), "{:?}", d.focus);
            }
        }
        let lo = styled(DIFF[0], 0, Style::Timing, VAEL.ai.mix, &draws(0.0));
        let hi = styled(DIFF[0], 0, Style::Timing, VAEL.ai.mix, &draws(0.999_999));
        assert_eq!((lo.army_max, hi.army_max), (8, 14), "the whole range");
        assert_eq!((lo.tier_at[0], hi.tier_at[0]), (600.0, 780.0));
    }

    #[test]
    fn the_stalled_game_s_push_is_drawn_per_seat_and_never_on_a_level_without_one() {
        let lo = styled(DIFF[1], 1, Style::Timing, HUMANS.ai.mix, &draws(0.0));
        let hi = styled(DIFF[1], 1, Style::Timing, HUMANS.ai.mix, &draws(0.999_999));
        assert_eq!((lo.stall_from, hi.stall_from), (780.0, 1020.0));
        let easy = styled(DIFF[0], 0, Style::Timing, HUMANS.ai.mix, &draws(0.5));
        assert_eq!(easy.stall_from, NEVER);
    }

    #[test]
    fn timing_is_its_level_s_own_plan_but_for_its_draws() {
        for (level, &base) in DIFF.iter().enumerate().take(3).skip(1) {
            let d = styled(
                base,
                level,
                Style::Timing,
                HUMANS.ai.mix,
                &draws(0.5),
            );
            let plain = Diff {
                stall_from: d.stall_from,
                focus: d.focus,
                ..base
            };
            assert_eq!(d, plain);
        }
    }

    #[test]
    fn pressure_attacks_sooner_and_techs_later_boom_expands_sooner_and_waits_for_a_bigger_push() {
        for (level, &base) in DIFF.iter().enumerate().take(3).skip(1) {
            let p = styled(base, level, Style::Pressure, VAEL.ai.mix, &draws(0.5));
            assert!(p.first < base.first && p.wave < base.wave);
            assert!(p.expand_shift > 0.0 && p.tier_at[0] > base.tier_at[0]);
            let b = styled(base, level, Style::Boom, VAEL.ai.mix, &draws(0.5));
            assert!(b.expand_shift < 0.0 && b.natural_first && !base.natural_first);
            assert!(b.wave > base.wave);
            assert_eq!(
                b.first, base.first,
                "its turbines on its level's time (`first`)"
            );
        }
    }

    #[test]
    fn the_leaning_unit_comes_at_two_thirds_of_its_ratio() {
        let d = Diff {
            focus: Some(UnitKind::SiegeTank),
            ..DIFF[1]
        };
        assert_eq!(
            d.mix_entry((UnitKind::SiegeTank, 6, 330.0)),
            (UnitKind::SiegeTank, 4, 330.0)
        );
        assert_eq!(
            d.mix_entry((UnitKind::Knight, 4, 0.0)),
            (UnitKind::Knight, 4, 0.0)
        );
        let leans: Vec<Option<UnitKind>> = (0..10)
            .map(|i| {
                styled(
                    DIFF[1],
                    1,
                    Style::Timing,
                    HUMANS.ai.mix,
                    &draws(i as f64 / 10.0),
                )
                .focus
            })
            .collect();
        for k in [UnitKind::SiegeTank, UnitKind::Bastion, UnitKind::Knight] {
            assert!(leans.contains(&Some(k)), "{k:?} in {leans:?}");
        }
        assert!(
            !leans.contains(&Some(UnitKind::Lancer)),
            "one a Guard already"
        );
    }
}
