//! `tiers`: attack now or invest further (Stelian, Nov 13). Each people's tech has three layers:
//! - **basic**: the barracks (the Kingdom's Barracks; the Expedition's Recruiting post and Factory);
//! - **mid**: the tech building and what it opens (the Blacksmith and the Workshop's Cannons; the Lab, the Uplink and
//!   the Drone);
//! - **top**: the elite building and its units (the Stables and the Knight; the Portal, the Rover and the Android).
//!
//! A "commit at tier k" plan stops teching at layer k and goes for the foe with what that layer fields; its opponent
//! keeps teching (`bets`' tech plan: its tech building at 1:00, the top tier early, its first wave at 9:00). Each plan
//! is Medium's tuning with a few settings moved, per people where the layers' buildings differ, set for a seat through
//! `World::set_ai_plans` (lab only). The target: no dominant layer (none wins most of its games against the teching
//! opponent) and no dead one (one that never pays: it loses nearly always, or its units never come).

use crate::json::Json;
use crate::plans::{BASE, PAIRINGS, Played, play_jobs, play_watched};
use crate::stats::{median, mmss, wilson};
use endfall_sim::data::{DIFF, Diff, FACTIONS, NEVER};
use endfall_sim::map::MapKind;
use std::fmt::Write;

const TPS: f64 = 30.0;
/// The layers, in their order.
pub const TIERS: [&str; 3] = ["basic", "mid", "top"];
/// A layer dominates when its commit wins more than this share of its decided games, and is dead under `DEAD`.
pub const DOMINANT: f64 = 0.65;
pub const DEAD: f64 = 0.2;

/// The plan of people `race` (`FACTIONS` index) that commits at layer `k` (`TIERS`' order), from Medium's.
pub fn commit(race: usize, k: usize) -> Diff {
    let medium = DIFF[BASE];
    // (a raiders' factory that needs the tech building is the top layer's, the Kingdom's Stables: never below it; the
    // Expedition's Factory is basic)
    let script = &FACTIONS[race].ai;
    let no_stables = if script.air.def().req == Some(script.tech) {
        NEVER
    } else {
        medium.air_at
    };
    match k {
        // Its barracks only: no tech building (so no research, no siege, no Lab units, no Portal), every unit its
        // barracks and basic factory field, its first wave at 4:00 and going in without waiting for a margin.
        0 => Diff {
            tech_at: NEVER,
            research_from: NEVER,
            mix_tier: 1,
            tier_at: &[],
            air_at: no_stables,
            first: 240.0,
            wave_margin: 1.0,
            all_in_after: 120.0,
            ..medium
        },
        // Its tech building and what it opens, never the top layer (no Stables, no Portal: tier 1 at most), its first
        // wave at 7:00.
        1 => Diff {
            tech_at: 120.0,
            mix_tier: 1,
            tier_at: &[],
            air_at: no_stables,
            first: 420.0,
            wave_margin: 1.0,
            all_in_after: 120.0,
            ..medium
        },
        // The top layer, then the foe: `bets`' tech plan with its first wave at 10:00, going in without a margin.
        _ => Diff {
            first: 600.0,
            wave_margin: 1.0,
            all_in_after: 120.0,
            ..crate::bets::plan(2)
        },
    }
}

/// The opponent that keeps teching: `bets`' tech plan (one barracks, its first wave at 9:00: a weak benchmark, an upper
/// bound for "attack before it").
pub fn teching() -> Diff {
    crate::bets::plan(2)
}

/// The greedy human (the PM, Nov 13): teching as `teching` does, but on Medium's economy and factories, with a small
/// army at home (Medium's reserve) and two towers early, its first move when its top tier lands (10:00).
pub fn greedy() -> Diff {
    Diff {
        rax: DIFF[BASE].rax,
        extra_rax: 1,
        towers: &[150.0, 300.0],
        tower_max: &[],
        first: 600.0,
        ..teching()
    }
}

/// What the batch plays.
#[derive(Clone, Debug)]
pub struct TierBatch {
    pub size: i32,
    pub seeds: u32,
    pub cap_min: u32,
    pub threads: usize,
    /// The opponent: the greedy human (`greedy`, `--greedy`) rather than `teching`.
    pub greedy: bool,
}

/// A cell: the peoples' pairing (`PAIRINGS`' index), the committing seat and its layer.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TierCell {
    pub pairing: usize,
    pub seat: usize,
    pub tier: usize,
}

/// Every cell: each pairing (the two mirrors, then across in either seating), each layer, the committer in either seat.
pub fn cells() -> Vec<TierCell> {
    let mut out = Vec::new();
    for pairing in [2, 3, 0, 1] {
        for tier in 0..TIERS.len() {
            for seat in 0..2 {
                out.push(TierCell {
                    pairing,
                    seat,
                    tier,
                });
            }
        }
    }
    out
}

pub struct TierRun {
    pub batch: TierBatch,
    pub commit: String,
    pub games: Vec<(TierCell, u32, Played)>,
}

pub fn run(b: TierBatch, commit_id: &str, progress: &(dyn Fn(usize, usize) + Sync)) -> TierRun {
    let jobs: Vec<(TierCell, u32)> = cells()
        .into_iter()
        .flat_map(|c| (1..=b.seeds).map(move |s| (c, s)))
        .collect();
    let played = play_jobs(
        &jobs,
        |&(c, seed)| {
            let races = PAIRINGS[c.pairing];
            let foe = if b.greedy { greedy() } else { teching() };
            let mut plans = [Some(foe), Some(foe)];
            plans[c.seat] = Some(commit(races[c.seat], c.tier));
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
    TierRun {
        batch: b,
        commit: commit_id.to_string(),
        games: jobs
            .into_iter()
            .zip(played)
            .map(|((c, s), p)| (c, s, p))
            .collect(),
    }
}

/// A layer's record: the committer's wins, decided games, timeouts, the decided games' lengths (s), and its first
/// waves' launch times (s).
#[derive(Clone, Debug, Default)]
pub struct Tally {
    pub k: usize,
    pub n: usize,
    pub timeouts: usize,
    pub lengths: Vec<f64>,
    pub first: Vec<f64>,
}

impl Tally {
    pub fn p(&self) -> f64 {
        self.k as f64 / self.n.max(1) as f64
    }
    pub fn show(&self) -> String {
        if self.n == 0 {
            return "—".into();
        }
        let (lo, hi) = wilson(self.k, self.n);
        format!(
            "{:.0}% ({:.0}–{:.0}%) of {}",
            100.0 * self.p(),
            100.0 * lo,
            100.0 * hi,
            self.n
        )
    }
}

impl TierRun {
    /// People `race` committing at `tier` against people `foe` teching (None: either), both seats pooled.
    pub fn tally(&self, race: usize, foe: Option<usize>, tier: usize) -> Tally {
        let mut t = Tally::default();
        for (c, _, g) in &self.games {
            let races = PAIRINGS[c.pairing];
            if c.tier != tier
                || races[c.seat] != race
                || foe.is_some_and(|f| races[1 - c.seat] != f)
            {
                continue;
            }
            if let Some(f) = g.first_wave[c.seat] {
                t.first.push(f.at as f64 / TPS);
            }
            let Some(w) = g.winner else {
                t.timeouts += 1;
                continue;
            };
            t.n += 1;
            t.k += (w as usize == c.seat) as usize;
            t.lengths.push(g.end_tick as f64 / TPS);
        }
        t
    }

    /// The checks, per people (against either foe): no layer dominant, none dead.
    pub fn checks(&self) -> Vec<(String, bool, String)> {
        let mut out = Vec::new();
        for (r, f) in FACTIONS.iter().enumerate().take(2) {
            let rates: Vec<Tally> = (0..TIERS.len()).map(|k| self.tally(r, None, k)).collect();
            let dominant: Vec<&str> = (0..TIERS.len())
                .filter(|&k| rates[k].n > 0 && rates[k].p() > DOMINANT)
                .map(|k| TIERS[k])
                .collect();
            let dead: Vec<&str> = (0..TIERS.len())
                .filter(|&k| rates[k].n > 0 && rates[k].p() < DEAD)
                .map(|k| TIERS[k])
                .collect();
            let all = (0..TIERS.len())
                .map(|k| format!("{} {}", TIERS[k], rates[k].show()))
                .collect::<Vec<_>>()
                .join("; ");
            out.push((
                format!("{}: no dominant layer", f.name),
                dominant.is_empty(),
                format!(
                    "{all} ({}% or less wanted{})",
                    (DOMINANT * 100.0) as u32,
                    if dominant.is_empty() {
                        String::new()
                    } else {
                        format!("; dominant: {}", dominant.join(", "))
                    }
                ),
            ));
            out.push((
                format!("{}: no dead layer", f.name),
                dead.is_empty(),
                format!(
                    "under {}% is dead{}",
                    (DEAD * 100.0) as u32,
                    if dead.is_empty() {
                        String::new()
                    } else {
                        format!("; dead: {}", dead.join(", "))
                    }
                ),
            ));
        }
        out
    }

    pub fn markdown(&self, header: &str) -> String {
        let foe = if self.batch.greedy {
            "the greedy human: teching on Medium's economy and factories, a small army at home and two towers, its first move at 10:00 when its top tier lands"
        } else {
            "the bets' tech plan: one barracks, its first wave at 9:00"
        };
        let mut s = format!(
            "# Attack now or invest further: the layers\n\n{header}\n\nA committer stops teching at a layer and goes for the foe (crates/endfall-lab/src/tiers.rs): **basic** its barracks alone, its first wave at 4:00; **mid** its tech building and what it opens, no Stables or Portal, its first wave at 7:00; **top** straight to its top layer, its first wave at 10:00. Its opponent keeps teching ({foe}). A cell is the committer's wins of the decided games, both seats pooled, timeouts apart, with the 95% interval. The target: no layer dominant (over {}%), none dead (under {}%).\n\n## Target checks\n\n",
            (DOMINANT * 100.0) as u32,
            (DEAD * 100.0) as u32
        );
        for (name, pass, detail) in self.checks() {
            let _ = writeln!(
                s,
                "- **{}** {name}: {detail}",
                if pass { "PASS" } else { "WARN" }
            );
        }
        let _ = writeln!(
            s,
            "\n## By pairing\n\n| Committer | Against (teching) | Layer | Committer wins | Timeouts | Median length | First wave, median |\n| --- | --- | --- | --- | --- | --- | --- |"
        );
        for (r, rf) in FACTIONS.iter().enumerate().take(2) {
            for (f, ff) in FACTIONS.iter().enumerate().take(2) {
                for (k, tier) in TIERS.iter().enumerate() {
                    let t = self.tally(r, Some(f), k);
                    let _ = writeln!(
                        s,
                        "| {} | {} | {} | {} | {} | {} | {} |",
                        rf.name,
                        ff.name,
                        tier,
                        t.show(),
                        t.timeouts,
                        median(&t.lengths).map_or("—".into(), mmss),
                        median(&t.first).map_or("—".into(), mmss)
                    );
                }
            }
        }
        s
    }

    pub fn json(&self) -> Json {
        let mut rows = Vec::new();
        for (r, rf) in FACTIONS.iter().enumerate().take(2) {
            for (f, ff) in FACTIONS.iter().enumerate().take(2) {
                for (k, name) in TIERS.iter().enumerate() {
                    let t = self.tally(r, Some(f), k);
                    rows.push(
                        Json::obj()
                            .with("committer", rf.name)
                            .with("foe", ff.name)
                            .with("tier", *name)
                            .with("k", t.k)
                            .with("n", t.n)
                            .with("timeouts", t.timeouts)
                            .with("median_s", median(&t.lengths)),
                    );
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
                    .with("cap_min", self.batch.cap_min)
                    .with("greedy", self.batch.greedy),
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
            .with("rows", rows)
            .with(
                "games",
                self.games
                    .iter()
                    .map(|(c, seed, g)| {
                        Json::obj()
                            .with("pairing", c.pairing)
                            .with("seat", c.seat)
                            .with("tier", TIERS[c.tier])
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
    fn the_layers_play_every_pairing_and_seat_and_tally_each_game_once() {
        assert_eq!(cells().len(), 4 * 3 * 2);
        // The plans differ from Medium where they say: basic has no tech building, mid no top tier, and only the
        // Kingdom's mid and basic go without its Stables (its raiders' factory, the top layer's building).
        assert_eq!(commit(0, 0).tech_at, NEVER);
        assert!(
            commit(1, 1).tech_at < NEVER
                && commit(1, 1).mix_tier == 1
                && commit(1, 1).tier_at.is_empty()
        );
        assert_eq!(commit(0, 1).air_at, NEVER);
        assert_eq!(commit(1, 1).air_at, DIFF[BASE].air_at);
        assert_eq!(commit(0, 2).mix_tier, 2);
        let b = TierBatch {
            size: 64,
            seeds: 1,
            cap_min: 3,
            threads: 2,
            greedy: false,
        };
        let r = run(b, "test", &|_, _| {});
        assert_eq!(r.games.len(), cells().len());
        // Each game counts once, for its committer.
        let counted: usize = (0..2)
            .flat_map(|race| (0..3).map(move |k| (race, k)))
            .map(|(race, k)| {
                let t = r.tally(race, None, k);
                t.n + t.timeouts
            })
            .sum();
        assert_eq!(counted, r.games.len());
        assert!(r.markdown("").contains("## By pairing"));
        assert!(r.json().write().contains("\"rows\""));
    }
}
