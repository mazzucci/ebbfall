//! The AI styles in a report (PRD: AI styles and the level ladder): each level's win rate by the style its seat drew
//! (`World::ai_style`), against its own level and across the levels, and the parity check (no style stands out beyond
//! the noise). Classic maps only (the Shore has its own section).

use crate::batch::{Cell, GameRec, Kind, LEVELS};
use crate::json::Json;
use crate::report::{Check, Rate, Report};
use endfall_sim::data::{FACTIONS, Style};
use endfall_sim::map::MapKind;
use std::fmt::Write;

/// Which seats a row counts: `level`'s seats that drew `style`, against their own level (`cross` None) or against
/// `cross`'s level (`Kind::Cross` cells), on `size` (None: every size), of people `race` (None: both).
#[derive(Clone, Copy)]
pub struct StyleRow {
    pub level: usize,
    pub style: Style,
    pub cross: Option<usize>,
    pub size: Option<i32>,
    pub race: Option<usize>,
}

/// A row's figures: the seat's wins of the decided games, and the timeouts among its games.
pub struct StyleFigures {
    pub rate: Rate,
    pub timeouts: usize,
    pub games: usize,
}

impl Report {
    fn style_cells(&self) -> impl Iterator<Item = (&Cell, &Vec<GameRec>)> {
        self.cells
            .iter()
            .zip(&self.games)
            .filter(|(c, _)| c.map != MapKind::Shore)
    }

    /// The figures of `row`.
    pub fn style_figures(&self, row: StyleRow) -> StyleFigures {
        let mut f = StyleFigures {
            rate: Rate {
                of: format!("{} {} wins", LEVELS[row.level], row.style.name()),
                k: 0,
                n: 0,
            },
            timeouts: 0,
            games: 0,
        };
        for (c, games) in self.style_cells() {
            let fits = match row.cross {
                None => c.kind == Kind::Level && c.levels == [row.level; 2],
                Some(other) => {
                    c.kind == Kind::Cross
                        && c.levels.contains(&row.level)
                        && c.levels.contains(&other)
                }
            };
            if !fits || row.size.is_some_and(|s| c.size != s) {
                continue;
            }
            for seat in 0..2 {
                if c.levels[seat] != row.level || row.race.is_some_and(|r| c.races[seat] != r) {
                    continue;
                }
                for g in games {
                    if g.seats[seat].style != Some(row.style) {
                        continue;
                    }
                    f.games += 1;
                    match g.winner {
                        Some(w) => {
                            f.rate.n += 1;
                            f.rate.k += (w == seat) as usize;
                        }
                        None => f.timeouts += 1,
                    }
                }
            }
        }
        f
    }

    /// The levels played against themselves, and the (higher, lower) cross pairs, as the style rows read them.
    fn style_groups(&self) -> Vec<(usize, Option<usize>)> {
        let mut v: Vec<(usize, Option<usize>)> = Vec::new();
        for c in self.cells.iter().filter(|c| c.map != MapKind::Shore) {
            let g = match c.kind {
                Kind::Level => (c.levels[0], None),
                Kind::Cross => {
                    let (hi, lo) = (c.levels[0].max(c.levels[1]), c.levels[0].min(c.levels[1]));
                    (hi, Some(lo))
                }
                Kind::Ladder => continue,
            };
            if !v.contains(&g) {
                v.push(g);
            }
            if let (hi, Some(lo)) = g
                && !v.contains(&(lo, Some(hi)))
            {
                v.push((lo, Some(hi)));
            }
        }
        v
    }

    /// The parity checks: against its own level, each style's interval holds 50% (a style that wins more than its
    /// mirror stands out); across the levels, each of the seat's styles' intervals holds the pooled rate of that level's
    /// seats there (not where that rate is under 3% or over 97%). Styles with fewer than 10 decided games are left out
    /// (too few to read).
    pub fn style_checks(&self) -> Vec<Check> {
        let mut out = Vec::new();
        for (level, cross) in self.style_groups() {
            let all = |st| {
                self.style_figures(StyleRow {
                    level,
                    style: st,
                    cross,
                    size: None,
                    race: None,
                })
            };
            let figs: Vec<(Style, StyleFigures)> = Style::ALL
                .into_iter()
                .map(|st| (st, all(st)))
                .filter(|(_, f)| f.rate.n >= 10)
                .collect();
            if figs.len() < 2 {
                continue;
            }
            let (k, n) = figs
                .iter()
                .fold((0, 0), |(k, n), (_, f)| (k + f.rate.k, n + f.rate.n));
            let target = if cross.is_none() {
                0.5
            } else {
                k as f64 / n as f64
            };
            // (a cross pair one level all but always wins leaves no room for a style to stand out)
            if !(0.03..=0.97).contains(&target) {
                continue;
            }
            let off: Vec<String> = figs
                .iter()
                .filter(|(_, f)| {
                    let (lo, hi) = f.rate.ci();
                    target < lo - 1e-9 || target > hi + 1e-9
                })
                .map(|(st, f)| format!("{} {}", st.name(), f.rate.show()))
                .collect();
            let against = cross.map_or("itself".to_string(), |o| LEVELS[o].to_string());
            out.push(Check {
                name: format!("style parity: {} against {against}", LEVELS[level]),
                pass: off.is_empty(),
                detail: format!(
                    "{} (each interval holds {:.0}%){}",
                    figs.iter()
                        .map(|(st, f)| format!("{} {}", st.name(), f.rate.show()))
                        .collect::<Vec<_>>()
                        .join(", "),
                    target * 100.0,
                    if off.is_empty() {
                        String::new()
                    } else {
                        format!("; out: {}", off.join(", "))
                    }
                ),
            });
        }
        out
    }

    pub fn style_json(&self) -> Vec<Json> {
        let mut v = Vec::new();
        for (level, cross) in self.style_groups() {
            for st in Style::ALL {
                let f = self.style_figures(StyleRow {
                    level,
                    style: st,
                    cross,
                    size: None,
                    race: None,
                });
                if f.games == 0 {
                    continue;
                }
                v.push(
                    f.rate
                        .json()
                        .with("level", LEVELS[level])
                        .with("against", cross.map_or(LEVELS[level], |o| LEVELS[o]))
                        .with("style", st.name())
                        .with("games", f.games)
                        .with("timeouts", f.timeouts),
                );
            }
        }
        v
    }

    /// "## The AI styles": a row per level, opponent and style: the seat's wins pooled, by size and by people, its
    /// games and timeouts.
    pub fn style_markdown(&self) -> String {
        let groups = self.style_groups();
        if groups.is_empty() {
            return String::new();
        }
        let mut s = String::new();
        let sizes: Vec<i32> = self.batch.sizes.clone();
        let _ = write!(
            s,
            "\n## The AI styles\n\nEach AI seat draws a style at its first turn (PRD: AI styles and the level ladder; never shown to the player). A row: the seats of a level that drew the style, against their own level or another, their wins of the decided games (95% interval), by map size and by people; games, and timeouts among them. Against its own level a style should hold 50% (a mirror of the same style is in it too); across the levels, near the pooled rate.\n\n| Level | Against | Style | All |"
        );
        for size in &sizes {
            let _ = write!(s, " {size} |");
        }
        for f in FACTIONS {
            let _ = write!(s, " {} |", f.name);
        }
        let _ = writeln!(s, " Games | Timeouts |");
        let _ = writeln!(
            s,
            "|{}",
            " --- |".repeat(4 + sizes.len() + FACTIONS.len() + 2)
        );
        for (level, cross) in groups {
            for st in Style::ALL {
                let row = |size, race| StyleRow {
                    level,
                    style: st,
                    cross,
                    size,
                    race,
                };
                let all = self.style_figures(row(None, None));
                if all.games == 0 {
                    continue;
                }
                let _ = write!(
                    s,
                    "| {} | {} | {} | {} |",
                    LEVELS[level],
                    cross.map_or(LEVELS[level], |o| LEVELS[o]),
                    st.name(),
                    all.rate.show()
                );
                for &size in &sizes {
                    let _ = write!(
                        s,
                        " {} |",
                        self.style_figures(row(Some(size), None)).rate.show()
                    );
                }
                for r in 0..FACTIONS.len() {
                    let _ = write!(
                        s,
                        " {} |",
                        self.style_figures(row(None, Some(r))).rate.show()
                    );
                }
                let _ = writeln!(s, " {} | {} |", all.games, all.timeouts);
            }
        }
        s
    }
}
