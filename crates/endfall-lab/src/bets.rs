//! `bets`: the game's core decision, three plans a side (Stelian, Nov 12: a player bets on an army and defenses for a
//! short game, or on the tech path for strong late units, and a wrong bet should lose). Each plan is Medium's tuning
//! with a few settings moved, set for a seat through `World::set_ai_plans` (lab only, never from JS or the network, not
//! hashed):
//! - **rush** (army first): an early first wave from three barracks, no tech building, no towers;
//! - **defense** (towers first, then an army): six towers by 5:30, its first wave at 8:00;
//! - **tech** (straight to the top tier): its tech building at 1:00, its side's techs and launch at once, its top-tier
//!   units mixed in early, one barracks, its first wave at 9:00.
//!
//! Every pairing of two different plans, each in either seat, in each people's mirror and across the peoples, map
//! seeds 1 to N. The target: rush beats tech, defense beats rush, tech beats defense in long games, each about 55–70%;
//! none always wins and none is pointless.

use crate::json::Json;
use crate::plans::{BASE, PAIRINGS, Played, play_jobs, play_watched};
use crate::stats::{median, mmss, wilson};
use endfall_sim::data::{DIFF, Diff, FACTIONS, NEVER, UnitKind};
use endfall_sim::map::MapKind;
use std::fmt::Write;

const TPS: f64 = 30.0;
/// The plans' names, in their order.
pub const PLANS: [&str; 3] = ["rush", "defense", "tech"];
/// Which plan each is meant to beat (rush beats tech, defense beats rush, tech beats defense: in long games).
pub const BEATS: [usize; 3] = [2, 0, 1];
/// A long game for the tech plan's check (s): over 15 minutes.
pub const LONG: f64 = 900.0;

/// Plan `p`'s tuning (`PLANS`' order), from Medium's.
pub fn plan(p: usize) -> Diff {
    let medium = DIFF[BASE];
    match p {
        // Army first: three barracks and its first wave at 2:30; its raiders' factory as Medium, but no tech building
        // (so no top tier, no siege, no Lab units), no towers, no research.
        0 => Diff {
            first: 150.0,
            wave: 6,
            rax: 3,
            extra_rax: 4,
            research_from: NEVER,
            tech_at: NEVER,
            towers: &[],
            expand_at: 600.0,
            ..medium
        },
        // Towers first: six by 5:30, then an army; its first wave at 8:00.
        1 => Diff {
            towers: &[90.0, 120.0, 180.0, 240.0, 270.0, 330.0],
            first: 480.0,
            ..medium
        },
        // Straight to the top tier: its tech building at 1:00, its side's techs (and the satellite) at once, the vehicle
        // bay and the air factory early, every unit allowed, the top tier mixed in early and thick; one barracks to
        // start, its first wave at 9:00.
        _ => Diff {
            tech_at: 60.0,
            tech_from: 120.0,
            research_from: 300.0,
            heavy_at: 0.0,
            air_at: 150.0,
            mix_tier: 2,
            mix_over: &[
                (UnitKind::Knight, 2, 0.0),
                (UnitKind::SiegeTank, 3, 0.0),
                (UnitKind::Umbra, 1, 0.0),
            ],
            rax: 1,
            extra_rax: 2,
            first: 540.0,
            ..medium
        },
    }
}

/// What the batch plays.
#[derive(Clone, Debug)]
pub struct BetBatch {
    pub size: i32,
    /// Map seeds 1 to this, in every cell.
    pub seeds: u32,
    pub cap_min: u32,
    pub threads: usize,
}

/// A cell: the peoples' pairing (`PAIRINGS`' index) and each seat's plan.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BetCell {
    pub pairing: usize,
    pub plans: [usize; 2],
}

/// Every cell: in each people's mirror and across the peoples (either seating), every ordered pair of two different
/// plans in the mirrors and every pair across.
pub fn cells() -> Vec<BetCell> {
    let mut out = Vec::new();
    for pairing in [2, 3, 0, 1] {
        for a in 0..PLANS.len() {
            for b in 0..PLANS.len() {
                if PAIRINGS[pairing][0] == PAIRINGS[pairing][1] && a == b {
                    continue;
                }
                out.push(BetCell {
                    pairing,
                    plans: [a, b],
                });
            }
        }
    }
    out
}

pub struct BetRun {
    pub batch: BetBatch,
    pub commit: String,
    /// (cell, seed, game), in cell then seed order.
    pub games: Vec<(BetCell, u32, Played)>,
}

pub fn run(b: BetBatch, commit: &str, progress: &(dyn Fn(usize, usize) + Sync)) -> BetRun {
    let jobs: Vec<(BetCell, u32)> = cells()
        .into_iter()
        .flat_map(|c| (1..=b.seeds).map(move |s| (c, s)))
        .collect();
    let played = play_jobs(
        &jobs,
        |&(c, seed)| {
            let plans = c.plans.map(|p| Some(plan(p)));
            play_watched(
                MapKind::Standard,
                b.size,
                c.pairing,
                seed,
                plans,
                b.cap_min,
                false,
            )
            .0
        },
        b.threads,
        progress,
    );
    BetRun {
        batch: b,
        commit: commit.to_string(),
        games: jobs
            .into_iter()
            .zip(played)
            .map(|((c, s), p)| (c, s, p))
            .collect(),
    }
}

/// Wins of a plan against another: (row wins, decided games, timeouts, lengths of the decided games in seconds).
#[derive(Clone, Debug, Default)]
pub struct Tally {
    pub k: usize,
    pub n: usize,
    pub timeouts: usize,
    pub lengths: Vec<f64>,
}

impl Tally {
    pub fn show(&self) -> String {
        if self.n == 0 {
            return "—".into();
        }
        let (lo, hi) = wilson(self.k, self.n);
        format!(
            "{:.0}% ({:.0}–{:.0}%) of {}",
            100.0 * self.k as f64 / self.n as f64,
            100.0 * lo,
            100.0 * hi,
            self.n
        )
    }
    pub fn p(&self) -> f64 {
        self.k as f64 / self.n.max(1) as f64
    }
}

impl BetRun {
    /// Plan `a` of people `ra` against plan `b` of people `rb`, either seating pooled (`long`: only games over
    /// `LONG`). In a mirror (`ra == rb`) both seatings of the pair are its two cells (one seat matches in each: the
    /// plans differ).
    pub fn tally(&self, ra: usize, a: usize, rb: usize, b: usize, long: bool) -> Tally {
        let mut t = Tally::default();
        for (c, _, g) in &self.games {
            let races = PAIRINGS[c.pairing];
            for seat in 0..2 {
                if races[seat] != ra
                    || races[1 - seat] != rb
                    || c.plans[seat] != a
                    || c.plans[1 - seat] != b
                {
                    continue;
                }
                let Some(w) = g.winner else {
                    t.timeouts += 1;
                    continue;
                };
                let len = g.end_tick as f64 / TPS;
                if long && len < LONG {
                    continue;
                }
                t.n += 1;
                t.k += (w as usize == seat) as usize;
                t.lengths.push(len);
            }
        }
        t
    }

    /// The matrices: (title, row people, column people), each 3x3 of the row plan's wins.
    fn matrices() -> [(String, usize, usize); 4] {
        let n = |r: usize| FACTIONS[r].name;
        [
            (format!("{} mirror", n(0)), 0, 0),
            (format!("{} mirror", n(1)), 1, 1),
            (format!("{} plans against {} plans", n(0), n(1)), 0, 1),
            (format!("{} plans against {} plans", n(1), n(0)), 1, 0),
        ]
    }

    /// The target checks: in each people's mirror, each plan against the one it should beat (tech in long games).
    pub fn checks(&self) -> Vec<(String, bool, String)> {
        let mut out = Vec::new();
        for r in 0..2 {
            for a in 0..PLANS.len() {
                let b = BEATS[a];
                let t = self.tally(r, a, r, b, a == 2);
                out.push((
                    format!(
                        "{}: {} beats {}{}",
                        FACTIONS[r].name,
                        PLANS[a],
                        PLANS[b],
                        if a == 2 { " in games over 15 min" } else { "" }
                    ),
                    t.n > 0 && (0.55..=0.70).contains(&t.p()),
                    format!("{} (55–70% wanted)", t.show()),
                ));
            }
        }
        out
    }

    pub fn markdown(&self, header: &str) -> String {
        let mut s = format!(
            "# The bets: rush, defense, tech\n\n{header}\n\nEach plan is Medium's tuning with a few settings moved (crates/endfall-lab/src/bets.rs): **rush** an early first wave from three barracks, no tech building, no towers; **defense** six towers by 5:30, its first wave at 8:00; **tech** its tech building at 1:00, its techs and launch at once, its top tier early, one barracks, its first wave at 9:00. A cell is the row plan's wins against the column plan, both seatings pooled, timeouts left out (counted apart), with the 95% interval. The target: rush beats tech, defense beats rush, tech beats defense in long games, each about 55–70%.\n\n## Target checks\n\n"
        );
        for (name, pass, detail) in self.checks() {
            let _ = writeln!(
                s,
                "- **{}** {name}: {detail}",
                if pass { "PASS" } else { "WARN" }
            );
        }
        for (title, ra, rb) in Self::matrices() {
            for long in [false, true] {
                let _ = write!(
                    s,
                    "\n## {title}{}\n\n| row wins against | {} |\n| --- |{}\n",
                    if long { ", games over 15 min" } else { "" },
                    PLANS.join(" | "),
                    " --- |".repeat(PLANS.len())
                );
                for a in 0..PLANS.len() {
                    let _ = write!(s, "| {} |", PLANS[a]);
                    for b in 0..PLANS.len() {
                        let cell = if ra == rb && a == b {
                            "—".into()
                        } else {
                            self.tally(ra, a, rb, b, long).show()
                        };
                        let _ = write!(s, " {cell} |");
                    }
                    s += "\n";
                }
            }
            let _ = write!(
                s,
                "\nMedian length (timeouts), row against column:\n\n| | {} |\n| --- |{}\n",
                PLANS.join(" | "),
                " --- |".repeat(PLANS.len())
            );
            for a in 0..PLANS.len() {
                let _ = write!(s, "| {} |", PLANS[a]);
                for b in 0..PLANS.len() {
                    let t = self.tally(ra, a, rb, b, false);
                    let cell = if ra == rb && a == b {
                        "—".into()
                    } else {
                        format!(
                            "{} ({})",
                            median(&t.lengths).map_or("—".into(), mmss),
                            t.timeouts
                        )
                    };
                    let _ = write!(s, " {cell} |");
                }
                s += "\n";
            }
        }
        s
    }

    pub fn json(&self) -> Json {
        let mut mats = Vec::new();
        for (title, ra, rb) in Self::matrices() {
            for a in 0..PLANS.len() {
                for b in 0..PLANS.len() {
                    if ra == rb && a == b {
                        continue;
                    }
                    for long in [false, true] {
                        let t = self.tally(ra, a, rb, b, long);
                        let (lo, hi) = wilson(t.k, t.n);
                        mats.push(
                            Json::obj()
                                .with("matrix", title.as_str())
                                .with("row", PLANS[a])
                                .with("col", PLANS[b])
                                .with("long", long)
                                .with("k", t.k)
                                .with("n", t.n)
                                .with("lo", lo)
                                .with("hi", hi)
                                .with("timeouts", t.timeouts)
                                .with("median_s", median(&t.lengths)),
                        );
                    }
                }
            }
        }
        Json::obj()
            .with("lab", 1u32)
            .with("commit", self.commit.as_str())
            .with(
                "batch",
                Json::obj()
                    .with("size", self.batch.size)
                    .with("seeds", self.batch.seeds)
                    .with("cap_min", self.batch.cap_min),
            )
            .with(
                "checks",
                self.checks()
                    .into_iter()
                    .map(|(n, p, d)| {
                        Json::obj()
                            .with("name", n)
                            .with("pass", p)
                            .with("detail", d)
                    })
                    .collect::<Vec<_>>(),
            )
            .with("cells", mats)
            .with(
                "games",
                self.games
                    .iter()
                    .map(|(c, seed, g)| {
                        Json::obj()
                            .with("pairing", c.pairing)
                            .with("plans", vec![PLANS[c.plans[0]], PLANS[c.plans[1]]])
                            .with("seed", *seed)
                            .with("winner", g.winner.map(|w| w as u32))
                            .with("end_tick", g.end_tick)
                    })
                    .collect::<Vec<_>>(),
            )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_bets_play_every_pair_of_different_plans_and_tally_each_game_once_per_side() {
        let c = cells();
        // (two mirrors of six ordered pairs, two cross seatings of nine)
        assert_eq!(c.len(), 2 * 6 + 2 * 9);
        // The three plans differ from Medium where they say and nowhere a menu reads.
        assert_eq!(plan(0).towers.len(), 0);
        assert_eq!(plan(1).towers.len(), 6);
        assert!(plan(2).tech_at < DIFF[BASE].tech_at && plan(2).tech_from < NEVER);
        let b = BetBatch {
            size: 64,
            seeds: 1,
            cap_min: 4,
            threads: 2,
        };
        let r = run(b, "test", &|_, _| {});
        assert_eq!(r.games.len(), c.len());
        // At a 4-minute cap most games time out; a decided game counts once for each side of its pair.
        for ra in 0..2 {
            for a in 0..3 {
                for b in 0..3 {
                    if a == b {
                        continue;
                    }
                    let (x, y) = (r.tally(ra, a, ra, b, false), r.tally(ra, b, ra, a, false));
                    assert_eq!(x.n, y.n, "the pair seen from either plan");
                    assert_eq!(x.k + y.k, x.n, "one of the two won");
                    assert_eq!(x.n + x.timeouts, 2, "two seatings, one seed");
                }
            }
        }
        let md = r.markdown("");
        assert!(md.contains("## Kingdom mirror") && md.contains("Target checks"));
        assert!(r.json().write().contains("\"matrix\""));
    }
}
