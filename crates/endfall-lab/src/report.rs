//! `report`: a batch's games turned into per-cell figures, the target checks, the key figures (the Balance reports
//! database's fields), a Markdown summary and the JSON that `compare` reads.

use crate::batch::{Batch, Cell, ECON_AT, GameRec, HARD, Kind, LEVELS, TPS};
use crate::json::Json;
use crate::stats::{median, mmss, quantile, wilson};
use endfall_sim::data::{BLDG_KINDS, BldgKind, FACTIONS, UNIT_KINDS, UnitKind};
use std::fmt::Write;

/// A win rate: `k` of `n` decided games (timeouts left out), what it is the rate of, and its 95% Wilson interval.
#[derive(Clone, Debug, PartialEq)]
pub struct Rate {
    pub of: String,
    pub k: usize,
    pub n: usize,
}
impl Rate {
    pub fn p(&self) -> f64 {
        if self.n == 0 {
            f64::NAN
        } else {
            self.k as f64 / self.n as f64
        }
    }
    pub fn ci(&self) -> (f64, f64) {
        wilson(self.k, self.n)
    }
    pub fn excludes_half(&self) -> bool {
        let (lo, hi) = self.ci();
        self.n > 0 && (hi < 0.5 || lo > 0.5)
    }
    pub fn json(&self) -> Json {
        let (lo, hi) = self.ci();
        Json::obj()
            .with("of", self.of.as_str())
            .with("k", self.k)
            .with("n", self.n)
            .with("p", self.p())
            .with("lo", lo)
            .with("hi", hi)
    }
    /// "55% (33–75%)".
    pub fn show(&self) -> String {
        if self.n == 0 {
            return "—".into();
        }
        let (lo, hi) = self.ci();
        format!(
            "{:.0}% ({:.0}–{:.0}%)",
            self.p() * 100.0,
            lo * 100.0,
            hi * 100.0
        )
    }
}

/// The seat whose wins a cell's rate counts: Humans in Humans vs Vael, the higher level on the ladder and in Hard's
/// cross cells, the first seat in a mirror.
fn rate_seat(c: &Cell, seat: usize) -> bool {
    match c.kind {
        Kind::Ladder | Kind::Cross => c.levels[seat] > c.levels[1 - seat],
        Kind::Level if c.mirror() => seat == 0,
        Kind::Level => c.races[seat] == 0,
    }
}
fn rate_of(c: &Cell) -> String {
    match c.kind {
        Kind::Ladder | Kind::Cross => format!("{} wins", LEVELS[c.levels[0].max(c.levels[1])]),
        Kind::Level if c.mirror() => "first seat wins".into(),
        Kind::Level => "Humans win".into(),
    }
}
pub fn cell_rate(c: &Cell, games: &[GameRec]) -> Rate {
    let decided: Vec<usize> = games.iter().filter_map(|g| g.winner).collect();
    Rate {
        of: rate_of(c),
        k: decided.iter().filter(|&&s| rate_seat(c, s)).count(),
        n: decided.len(),
    }
}

fn secs(t: u32) -> f64 {
    t as f64 / TPS as f64
}
fn lengths(games: &[GameRec]) -> Vec<f64> {
    games
        .iter()
        .filter(|g| g.winner.is_some())
        .map(|g| secs(g.end_tick))
        .collect()
}

/// One target check: PASS or WARN, with its numbers.
#[derive(Clone, Debug, PartialEq)]
pub struct Check {
    pub name: String,
    pub pass: bool,
    pub detail: String,
}
impl Check {
    pub fn line(&self) -> String {
        format!(
            "- **{}** {}: {}",
            if self.pass { "PASS" } else { "WARN" },
            self.name,
            self.detail
        )
    }
    pub fn json(&self) -> Json {
        Json::obj()
            .with("name", self.name.as_str())
            .with("pass", self.pass)
            .with("detail", self.detail.as_str())
    }
}

/// A row of the Shore map's gate: its check, its target, what the report measured, and whether it met it.
pub struct GateRow {
    pub name: &'static str,
    pub target: String,
    pub measured: String,
    pub pass: bool,
}

/// The ratio of shards to ether in `pairs`, the median over games (a seat-game with no ether left out).
fn ratio_median(pairs: &[[i64; 2]]) -> Option<f64> {
    let r: Vec<f64> = pairs
        .iter()
        .filter(|p| p[1] > 0)
        .map(|p| p[0] as f64 / p[1] as f64)
        .collect();
    median(&r)
}

pub struct Report {
    pub commit: String,
    pub batch: Batch,
    pub band: (f64, f64),
    pub cells: Vec<Cell>,
    pub games: Vec<Vec<GameRec>>,
}

/// A cell of the maps the classic checks are about: every kind but the Shore (whose checks are its gate's, apart).
fn classic(c: &Cell) -> bool {
    c.map != endfall_sim::map::MapKind::Shore
}

impl Report {
    fn level_cells(
        &self,
        f: impl Fn(&Cell) -> bool,
    ) -> impl Iterator<Item = (&Cell, &Vec<GameRec>)> {
        self.cells
            .iter()
            .zip(&self.games)
            .filter(move |(c, _)| f(c))
    }
    /// Humans vs Vael at `level`, both seat orders and every map pooled (None: every level).
    fn humans_vs_vael(&self, level: Option<usize>) -> Rate {
        let mut r = Rate {
            of: "Humans win".into(),
            k: 0,
            n: 0,
        };
        for (c, g) in self.level_cells(|c| {
            classic(c)
                && c.kind == Kind::Level
                && !c.mirror()
                && level.is_none_or(|l| c.levels[0] == l)
        }) {
            let x = cell_rate(c, g);
            r.k += x.k;
            r.n += x.n;
        }
        r
    }
    /// Humans vs Vael at `level` on `size`, both seat orders and every classic map pooled.
    fn humans_vs_vael_at(&self, level: usize, size: i32) -> Rate {
        let mut r = Rate {
            of: "Humans win".into(),
            k: 0,
            n: 0,
        };
        for (c, g) in self.level_cells(|c| {
            classic(c)
                && c.kind == Kind::Level
                && !c.mirror()
                && c.levels[0] == level
                && c.size == size
        }) {
            let x = cell_rate(c, g);
            r.k += x.k;
            r.n += x.n;
        }
        r
    }
    /// The higher level against `level - 1`, races, seat orders and maps pooled.
    fn ladder(&self, level: usize) -> Rate {
        let mut r = Rate {
            of: format!("{} beats {}", LEVELS[level], LEVELS[level - 1]),
            k: 0,
            n: 0,
        };
        for (c, g) in self.level_cells(|c| {
            classic(c) && c.kind == Kind::Ladder && c.levels[0].max(c.levels[1]) == level
        }) {
            let x = cell_rate(c, g);
            r.k += x.k;
            r.n += x.n;
        }
        r
    }
    fn ladder_levels(&self) -> Vec<usize> {
        let mut l: Vec<usize> = self
            .cells
            .iter()
            .filter(|c| classic(c) && c.kind == Kind::Ladder)
            .map(|c| c.levels[0].max(c.levels[1]))
            .collect();
        l.sort_unstable();
        l.dedup();
        l
    }
    /// Of `level` against itself (every pairing of the peoples) on classic maps of `size` (None: every size): the
    /// median length of the finished games, how many timed out, and how many games.
    fn level_length(&self, level: usize, size: Option<i32>) -> (Option<f64>, usize, usize) {
        let cells = || {
            self.level_cells(move |c| {
                classic(c)
                    && c.kind == Kind::Level
                    && c.levels[0] == level
                    && size.is_none_or(|s| c.size == s)
            })
        };
        let all: Vec<f64> = cells().flat_map(|(_, g)| lengths(g)).collect();
        let timeouts = cells()
            .map(|(_, g)| g.iter().filter(|g| g.winner.is_none()).count())
            .sum();
        (median(&all), timeouts, cells().map(|(_, g)| g.len()).sum())
    }
    /// Hard (`HARD`) against `low` (`Kind::Cross` cells): Hard's wins of all games (a timeout is not a win), the median
    /// length of all games with a timeout counted at the cap, and the timeouts.
    fn cross(&self, low: usize) -> (Rate, Option<f64>, usize) {
        let mut r = Rate {
            of: format!("Hard wins against {}", LEVELS[low]),
            k: 0,
            n: 0,
        };
        let (mut len, mut timeouts) = (Vec::new(), 0);
        for (c, g) in self.level_cells(|c| {
            c.kind == Kind::Cross && c.levels.contains(&HARD) && c.levels.contains(&low)
        }) {
            for g in g {
                r.n += 1;
                r.k += g.winner.is_some_and(|w| rate_seat(c, w)) as usize;
                timeouts += g.winner.is_none() as usize;
                len.push(secs(g.end_tick));
            }
        }
        (r, median(&len), timeouts)
    }
    fn cross_levels(&self) -> Vec<usize> {
        let mut l: Vec<usize> = self
            .cells
            .iter()
            .filter(|c| c.kind == Kind::Cross)
            .map(|c| c.levels[0].min(c.levels[1]))
            .collect();
        l.sort_unstable();
        l.dedup();
        l
    }
    /// (seat-games' mined, spent) for `race` on (size, map), or everywhere.
    fn ledgers(
        &self,
        race: Option<usize>,
        at: Option<(i32, endfall_sim::map::MapKind)>,
    ) -> (Vec<[i64; 2]>, Vec<[i64; 2]>) {
        let (mut mined, mut spent) = (Vec::new(), Vec::new());
        for (c, games) in self.level_cells(|c| at.is_none_or(|(s, m)| c.size == s && c.map == m)) {
            for g in games {
                for s in 0..2 {
                    if race.is_none_or(|r| c.races[s] == r) {
                        mined.push(g.seats[s].mined);
                        spent.push(g.seats[s].spent);
                    }
                }
            }
        }
        (mined, spent)
    }
    /// Of the decided games (level cells, classic maps) whose seats held different numbers of Pumps at 5:00, those
    /// the seat with more won (PRD: the conversion, the snowball check: +10% income won about 75% of such games).
    pub fn pumps_rate(&self) -> Rate {
        let (mut k, mut n) = (0, 0);
        for (_, games) in self.level_cells(classic) {
            for g in games {
                if let (Some(w), Some(p)) = (g.winner, g.pumps_at_5)
                    && p[0] != p[1]
                {
                    n += 1;
                    k += (p[w] > p[1 - w]) as usize;
                }
            }
        }
        Rate {
            of: "more Pumps at 5:00".into(),
            k,
            n,
        }
    }
    pub fn shards_per_ether(&self) -> Option<f64> {
        let mined: Vec<[i64; 2]> = self
            .level_cells(classic)
            .flat_map(|(_, games)| games.iter().flat_map(|g| g.seats.iter().map(|s| s.mined)))
            .collect();
        ratio_median(&mined)
    }
    fn timeouts(&self) -> (usize, usize) {
        let all: Vec<&GameRec> = self
            .level_cells(classic)
            .flat_map(|(_, g)| g.iter())
            .collect();
        (all.iter().filter(|g| g.winner.is_none()).count(), all.len())
    }

    /// The Kingdom's win rate against the Expedition in each game-length bin (`LENGTH_BINS`: under 10 minutes, 10 to
    /// 15, over 15), at `level` and `size` (None: pooled), both seat orders and every classic map pooled, timeouts left
    /// out (the design target: the Kingdom ahead early, the Expedition late).
    pub fn length_bins(&self, level: Option<usize>, size: Option<i32>) -> [Rate; 3] {
        let mut out = LENGTH_BINS.map(|(name, _, _)| Rate {
            of: format!("Kingdom wins, {name}"),
            k: 0,
            n: 0,
        });
        for (c, games) in self.level_cells(|c| {
            classic(c)
                && c.kind == Kind::Level
                && !c.mirror()
                && level.is_none_or(|l| c.levels[0] == l)
                && size.is_none_or(|s| c.size == s)
        }) {
            for g in games {
                let Some(w) = g.winner else { continue };
                let t = secs(g.end_tick);
                let Some(b) = LENGTH_BINS
                    .iter()
                    .position(|&(_, lo, hi)| t >= lo * 60.0 && t < hi * 60.0)
                else {
                    continue;
                };
                out[b].n += 1;
                out[b].k += rate_seat(c, w) as usize;
            }
        }
        out
    }

    pub fn checks(&self) -> Vec<Check> {
        let mut out = Vec::new();
        // The Kingdom against the Expedition per level above Easy and size (both seatings): the guardrail 35–65%, 40–60%
        // aimed (Stelian, Nov 13). Easy is reported in the tables, not gated (a PRD is coming).
        for &l in self.batch.levels.iter().filter(|&&l| l > 0) {
            for &size in &self.batch.sizes {
                let r = self.humans_vs_vael_at(l, size);
                if r.n == 0 {
                    continue;
                }
                out.push(Check {
                    name: format!("Kingdom vs Expedition, {}, {size}", LEVELS[l]),
                    pass: (0.35..=0.65).contains(&r.p()),
                    detail: format!(
                        "Kingdom {} of {}: {} (35–65% the guardrail, 40–60% aimed)",
                        r.k,
                        r.n,
                        r.show()
                    ),
                });
            }
        }
        // Hard finishes its games (Stelian, Nov 13): against Easy decisively (90%+ of the games won, the median length,
        // timeouts at the cap, 15:00 or less), against Medium it ends rather than grinds (timeouts 5% or less).
        for low in self.cross_levels() {
            let (r, len, timeouts) = self.cross(low);
            let detail = format!(
                "Hard won {} of {}: {}; median length {} (timeouts at the cap); {timeouts} timeouts",
                r.k,
                r.n,
                r.show(),
                mmss(len.unwrap_or(f64::NAN))
            );
            out.push(if low == 0 {
                Check {
                    name: "Hard beats Easy decisively on 96".into(),
                    pass: r.p() >= 0.9 && len.is_some_and(|m| m <= 15.0 * 60.0),
                    detail: format!("{detail} (90%+ and 15:00 or less wanted)"),
                }
            } else {
                Check {
                    name: format!("Hard against {} ends on 96", LEVELS[low]),
                    pass: timeouts as f64 <= 0.05 * r.n as f64,
                    detail: format!("{detail} (5% timeouts or less wanted)"),
                }
            });
        }
        // The design target by game length: the Kingdom ahead in short games, the Expedition in long ones (a bin with no
        // game passes).
        for &l in self.batch.levels.iter().filter(|&&l| l > 0) {
            let [early, _, late] = self.length_bins(Some(l), None);
            if early.n > 0 {
                out.push(Check {
                    name: format!("the Kingdom ahead in games under 10 min, {}", LEVELS[l]),
                    pass: early.p() > 0.5,
                    detail: format!(
                        "{} of {}: {} (55–65% wanted)",
                        early.k,
                        early.n,
                        early.show()
                    ),
                });
            }
            if late.n > 0 {
                out.push(Check {
                    name: format!("the Expedition ahead in games over 15 min, {}", LEVELS[l]),
                    pass: late.p() < 0.5,
                    detail: format!("the Kingdom {} of {}: {}", late.k, late.n, late.show()),
                });
            }
        }
        for (c, g) in self.level_cells(|c| classic(c) && c.kind == Kind::Level && c.mirror()) {
            let r = cell_rate(c, g);
            out.push(Check {
                name: format!("mirror {}", c.id()),
                pass: !r.excludes_half(),
                detail: format!("first seat {} of {}: {}", r.k, r.n, r.show()),
            });
        }
        for l in self.ladder_levels() {
            let r = self.ladder(l);
            out.push(Check {
                name: r.of.clone(),
                pass: r.n == 0 || r.p() >= 0.7,
                detail: format!("{} of {}: {} (70% wanted)", r.k, r.n, r.show()),
            });
        }
        // Timeouts: no cell over 5%, Easy against Easy apart (reported, not gated: Stelian, Nov 13).
        let easy = |c: &Cell| c.levels == [0, 0];
        let mut over: Vec<String> = Vec::new();
        for (c, g) in self.level_cells(|c| !easy(c)) {
            let t = g.iter().filter(|g| g.winner.is_none()).count();
            if !g.is_empty() && t as f64 > 0.05 * g.len() as f64 {
                over.push(format!("{} ({t} of {})", c.id(), g.len()));
            }
        }
        let (t, n) = self.timeouts();
        let easy_t: usize = self
            .level_cells(easy)
            .map(|(_, g)| g.iter().filter(|g| g.winner.is_none()).count())
            .sum();
        out.push(Check {
            name: "timeouts".into(),
            pass: over.is_empty(),
            detail: if over.is_empty() {
                format!("{t} of {n} games ({easy_t} Easy against Easy, not gated), no other cell over 5%")
            } else {
                format!(
                    "{t} of {n} games ({easy_t} Easy against Easy, not gated); over 5%: {}",
                    over.join("; ")
                )
            },
        });
        // The Shore map's gate (when the report played it), so `compare` follows it too.
        for g in self.shore_gate() {
            out.push(Check {
                name: format!("Shore gate: {}", g.name),
                pass: g.pass,
                detail: format!("{} ({} wanted)", g.measured, g.target),
            });
        }
        out
    }

    /// The Balance reports database's fields, in its order.
    pub fn key_figures(&self, checks: &[Check]) -> Vec<(&'static str, String)> {
        let hv = self.humans_vs_vael(None);
        let dev = self
            .level_cells(|c| classic(c) && c.kind == Kind::Level && c.mirror())
            .map(|(c, g)| cell_rate(c, g))
            .filter(|r| r.n > 0)
            .map(|r| (r.p() - 0.5).abs() * 100.0)
            .fold(f64::NAN, f64::max);
        let steps = self.ladder_levels();
        let ladder = steps.iter().all(|&l| {
            let r = self.ladder(l);
            r.n == 0 || r.p() >= 0.7
        });
        let (t, n) = self.timeouts();
        let num = |v: Option<f64>, d: usize| {
            v.filter(|v| v.is_finite())
                .map_or("—".into(), |v| format!("{v:.d$}"))
        };
        vec![
            (
                "Humans win % vs Vael",
                num((hv.n > 0).then(|| hv.p() * 100.0), 1),
            ),
            ("Mirror max deviation %", num(Some(dev), 1)),
            (
                "Ladder holds",
                (if steps.is_empty() {
                    "—"
                } else if ladder {
                    "yes"
                } else {
                    "no"
                })
                .into(),
            ),
            (
                "Median length Medium (min)",
                num(self.level_length(1, None).0.map(|s| s / 60.0), 1),
            ),
            ("Observed shards per ether", num(self.shards_per_ether(), 2)),
            ("More Pumps at 5:00 won", self.pumps_rate().show()),
            (
                "Timeouts %",
                num((n > 0).then(|| t as f64 * 100.0 / n as f64), 1),
            ),
            (
                "WARNs",
                checks.iter().filter(|c| !c.pass).count().to_string(),
            ),
        ]
    }

    pub fn json(&self) -> Json {
        let b = &self.batch;
        let batch = Json::obj()
            .with(
                "sizes",
                b.sizes.iter().map(|&s| Json::from(s)).collect::<Vec<_>>(),
            )
            .with(
                "maps",
                b.maps
                    .iter()
                    .map(|m| Json::from(format!("{m:?}")))
                    .collect::<Vec<_>>(),
            )
            .with(
                "levels",
                b.levels
                    .iter()
                    .map(|&l| Json::from(LEVELS[l]))
                    .collect::<Vec<_>>(),
            )
            .with("ladder", b.ladder)
            .with("seeds", b.seeds)
            .with("cap_min", b.cap_min);
        // (only when moved: a report of every game's map keeps its batch as it was)
        let batch = match b.moved_shore_field() {
            None => batch,
            Some(f) => batch.with("shore_field", shore_field_name(f)),
        };
        // (only with the tide: a report without it keeps its batch as it was)
        let batch = if b.tide {
            batch.with("tide", true)
        } else {
            batch
        };
        // (likewise only without the mirrors)
        let batch = if b.mirrors {
            batch
        } else {
            batch.with("mirrors", false)
        };
        let cells: Vec<Json> = self
            .cells
            .iter()
            .zip(&self.games)
            .map(|(c, g)| cell_json(c, g))
            .collect();
        let mut exchange = Vec::new();
        for &size in &b.sizes {
            for &map in &b.maps {
                for (r, f) in FACTIONS.iter().enumerate() {
                    let (mined, spent) = self.ledgers(Some(r), Some((size, map)));
                    exchange.push(
                        Json::obj()
                            .with("race", f.name)
                            .with("size", size)
                            .with("map", format!("{map:?}"))
                            .with("games", mined.len())
                            .with("mined_shards_per_ether", ratio_median(&mined))
                            .with("spent_shards_per_ether", ratio_median(&spent)),
                    );
                }
            }
        }
        let checks = self.checks();
        let key = self
            .key_figures(&checks)
            .into_iter()
            .fold(Json::obj(), |o, (k, v)| o.with(k, v));
        Json::obj()
            .with("lab", 1u32)
            .with("commit", self.commit.as_str())
            .with("batch", batch)
            .with("length_band_min", vec![self.band.0, self.band.1])
            .with("key", key)
            .with("checks", checks.iter().map(Check::json).collect::<Vec<_>>())
            .with("exchange", exchange)
            .with("shore_income", self.shore_income_json())
            .with("pumps_at_5", self.pumps_rate().json())
            .with("length_bins", self.length_bins_json())
            .with("top_tier", self.top_tier_json())
            .with("human", crate::human::json(&self.human_rows()))
            .with(
                "waves",
                self.wave_rows()
                    .iter()
                    .map(|(l, w)| w.json().with("row", l.as_str()))
                    .collect::<Vec<_>>(),
            )
            .with("cells", cells)
    }

    /// The Markdown summary (`header`: the lines above the key figures: commit, date, batch, run time).
    pub fn markdown(&self, header: &str) -> String {
        let mut s = String::new();
        let checks = self.checks();
        let _ = writeln!(
            s,
            "# Balance report {}\n\n{header}\n\n## Key figures\n",
            self.commit
        );
        for (k, v) in self.key_figures(&checks) {
            let _ = writeln!(s, "{k}: {v}");
        }
        let _ = writeln!(s, "\n## Target checks\n");
        for c in &checks {
            let _ = writeln!(s, "{}", c.line());
        }
        let (lo, hi) = self.band;
        let _ = writeln!(
            s,
            "\n## Game length\n\nEach level against itself (every pairing of the peoples), classic maps: the median of the finished games (timeouts left out, counted beside it). Reported, not gated (Medium aimed at {lo}–{hi} min).\n\n| Level | Size | Median length | Timeouts |\n| --- | --- | --- | --- |"
        );
        for &l in &self.batch.levels {
            for &size in &self.batch.sizes {
                let (m, t, n) = self.level_length(l, Some(size));
                if n > 0 {
                    let _ = writeln!(
                        s,
                        "| {} | {size} | {} | {t} of {n} |",
                        LEVELS[l],
                        mmss(m.unwrap_or(f64::NAN))
                    );
                }
            }
        }
        for &size in &self.batch.sizes {
            for &map in &self.batch.maps {
                let _ = writeln!(s, "\n## {size}x{size} {map:?}\n");
                let _ = writeln!(
                    s,
                    "| Cell | Games | Win rate (95%) | Timeouts | Length, median (IQR) | First attack | Pumps at 5:00, mean (seat 1 / 2) |"
                );
                let _ = writeln!(s, "| --- | --- | --- | --- | --- | --- | --- |");
                for (c, g) in self.level_cells(|c| c.size == size && c.map == map) {
                    let r = cell_rate(c, g);
                    let len = lengths(g);
                    let (q1, q3) = (quantile(&len, 0.25), quantile(&len, 0.75));
                    let fa: Vec<f64> = g.iter().filter_map(|g| g.first_attack).map(secs).collect();
                    let id = c.id();
                    let name = id.split_once(": ").map_or(id.as_str(), |x| x.1);
                    let _ = writeln!(
                        s,
                        "| {name} | {} | {}: {} | {} | {} ({}–{}) | {} | {} |",
                        g.len(),
                        r.of,
                        r.show(),
                        g.iter().filter(|g| g.winner.is_none()).count(),
                        mmss(median(&len).unwrap_or(f64::NAN)),
                        mmss(q1.unwrap_or(f64::NAN)),
                        mmss(q3.unwrap_or(f64::NAN)),
                        mmss(median(&fa).unwrap_or(f64::NAN)),
                        pumps_mean(g)
                            .map_or("—".into(), |m| format!("{:.1} / {:.1}", m[0], m[1])),
                    );
                }
                let _ = writeln!(
                    s,
                    "\n| Race | Mined shards per ether | Spent shards per ether | Seat-games |"
                );
                let _ = writeln!(s, "| --- | --- | --- | --- |");
                for (r, f) in FACTIONS.iter().enumerate() {
                    let (mined, spent) = self.ledgers(Some(r), Some((size, map)));
                    let n2 = |v: Option<f64>| v.map_or("—".into(), |v| format!("{v:.2}"));
                    let _ = writeln!(
                        s,
                        "| {} | {} | {} | {} |",
                        f.name,
                        n2(ratio_median(&mined)),
                        n2(ratio_median(&spent)),
                        mined.len()
                    );
                }
                let _ = writeln!(
                    s,
                    "\n| Race | Unit | Share of units built | Lost per built |"
                );
                let _ = writeln!(s, "| --- | --- | --- | --- |");
                for (r, f) in FACTIONS.iter().enumerate() {
                    for (kind, built, lost, share) in
                        mix(self.level_cells(|c| c.size == size && c.map == map), r)
                    {
                        let _ = writeln!(
                            s,
                            "| {} | {} | {:.0}% | {} |",
                            f.name,
                            UNIT_KINDS[kind].def().name,
                            share * 100.0,
                            if built == 0 {
                                "—".into()
                            } else {
                                format!("{:.2}", lost as f64 / built as f64)
                            }
                        );
                    }
                }
            }
        }
        s += &self.length_bins_markdown();
        s += &self.top_tier_markdown();
        s += &crate::human::markdown(&self.human_rows());
        s += &self.waves_markdown();
        s += &self.shore_markdown();
        s
    }

    /// Each level's and size's rows of `length_bins`, then each level's pooled over the sizes.
    fn length_bins_rows(&self) -> Vec<(usize, Option<i32>, [Rate; 3])> {
        let mut rows = Vec::new();
        for &l in &self.batch.levels {
            for &size in &self.batch.sizes {
                rows.push((l, Some(size), self.length_bins(Some(l), Some(size))));
            }
            if self.batch.sizes.len() > 1 {
                rows.push((l, None, self.length_bins(Some(l), None)));
            }
        }
        rows.retain(|r| r.2.iter().any(|b| b.n > 0));
        rows
    }
    fn length_bins_json(&self) -> Vec<Json> {
        self.length_bins_rows()
            .iter()
            .map(|(l, size, bins)| {
                LENGTH_BINS.iter().zip(bins).fold(
                    Json::obj()
                        .with("level", LEVELS[*l])
                        .with("size", size.map(|s| s as i64)),
                    |o, ((name, _, _), r)| o.with(name, r.json()),
                )
            })
            .collect()
    }
    fn length_bins_markdown(&self) -> String {
        let rows = self.length_bins_rows();
        if rows.is_empty() {
            return String::new();
        }
        let mut s = String::from(
            "\n## The Kingdom by game length\n\nThe Kingdom's win rate against the Expedition by how long the game ran (both seat orders, every map but the Shore; timeouts left out), with its 95% interval and the games in the bin. The design target: the Kingdom ahead in short games (55–65%), the Expedition in long ones.\n\n| Level | Size |",
        );
        for (name, _, _) in LENGTH_BINS {
            let _ = write!(s, " {name} |");
        }
        s += "\n| --- | --- |";
        s += &" --- |".repeat(LENGTH_BINS.len());
        s += "\n";
        for (l, size, bins) in rows {
            let _ = write!(
                s,
                "| {} | {} |",
                LEVELS[l],
                size.map_or("all".into(), |s| s.to_string())
            );
            for b in &bins {
                let _ = write!(s, " {} of {} |", b.show(), b.n);
            }
            s += "\n";
        }
        s
    }
}

/// What the top tier's timing follows, per people (`FACTIONS` index): the first top-tier unit (the first of these
/// kinds trained), then the first of each building finished.
pub struct TopTier {
    pub units: &'static [UnitKind],
    pub units_name: &'static str,
    pub bldgs: &'static [BldgKind],
}
/// A row of the top tier's table: (people, level, size, seats, each column's times in seconds).
type TopTierRow = (usize, usize, i32, usize, Vec<Vec<f64>>);
pub const TOP_TIER: [TopTier; 2] = [
    TopTier {
        units: &[UnitKind::Knight, UnitKind::SiegeTank],
        units_name: "Knight or Cannon",
        bldgs: &[BldgKind::Forge, BldgKind::Airfield, BldgKind::Factory],
    },
    TopTier {
        units: &[UnitKind::Umbra],
        units_name: "Android",
        bldgs: &[BldgKind::Loom, BldgKind::Uplink, BldgKind::Eclipse],
    },
];

impl Report {
    /// Of every seat of `race` at `level` and `size` (level cells, classic maps): the ticks of its first top-tier unit,
    /// of each of `TOP_TIER`'s buildings, each a list of the seats that got there (the column's
    /// median is of those, out of `seats`).
    fn top_tier(&self, race: usize, level: usize, size: i32) -> (usize, Vec<Vec<f64>>) {
        let t = &TOP_TIER[race];
        let cols = 1 + t.bldgs.len();
        let (mut seats, mut out) = (0, vec![Vec::new(); cols]);
        for (c, games) in self.level_cells(|c| {
            classic(c) && c.kind == Kind::Level && c.levels[0] == level && c.size == size
        }) {
            for g in games {
                for (si, rec) in g.seats.iter().enumerate() {
                    if c.races[si] != race {
                        continue;
                    }
                    seats += 1;
                    if let Some(f) = t
                        .units
                        .iter()
                        .filter_map(|k| rec.first_unit[k.index()])
                        .min()
                    {
                        out[0].push(secs(f));
                    }
                    for (i, b) in t.bldgs.iter().enumerate() {
                        if let Some(f) = rec.first_bldg[b.index()] {
                            out[1 + i].push(secs(f));
                        }
                    }
                }
            }
        }
        (seats, out)
    }
    fn top_tier_heads(race: usize) -> Vec<String> {
        let t = &TOP_TIER[race];
        std::iter::once(format!("first {}", t.units_name))
            .chain(t.bldgs.iter().map(|b| b.def().name.to_string()))
            .collect()
    }
    fn top_tier_rows(&self) -> Vec<TopTierRow> {
        let mut rows = Vec::new();
        for race in 0..TOP_TIER.len() {
            for &l in &self.batch.levels {
                for &size in &self.batch.sizes {
                    let (n, cols) = self.top_tier(race, l, size);
                    if n > 0 {
                        rows.push((race, l, size, n, cols));
                    }
                }
            }
        }
        rows
    }
    fn top_tier_json(&self) -> Vec<Json> {
        self.top_tier_rows()
            .into_iter()
            .map(|(race, l, size, n, cols)| {
                Self::top_tier_heads(race).iter().zip(&cols).fold(
                    Json::obj()
                        .with("race", FACTIONS[race].name)
                        .with("level", LEVELS[l])
                        .with("size", size)
                        .with("seats", n),
                    |o, (h, v)| {
                        o.with(
                            h.as_str(),
                            Json::obj()
                                .with("median_s", median(v))
                                .with("seats", v.len()),
                        )
                    },
                )
            })
            .collect()
    }
    /// A human's opening (human.rs) at each size of the batch (sizes the openings' maps are made at only).
    fn human_rows(&self) -> Vec<(&'static str, i32, crate::human::Figures)> {
        let sizes: Vec<i32> = self
            .batch
            .sizes
            .iter()
            .copied()
            .filter(|&s| s <= 96)
            .collect();
        crate::human::rows(&sizes)
    }
    fn top_tier_markdown(&self) -> String {
        let rows = self.top_tier_rows();
        if rows.is_empty() {
            return String::new();
        }
        let mut s = String::from(
            "\n## The top tier\n\nWhen each people's top tier came, each level against itself (every map but the Shore): the median time of its first top-tier unit and of its first of each building finished, over the seats that got there (how many of all, beside it). The target: the first top-tier unit at about 8–10 min.\n",
        );
        for (race, f) in FACTIONS.iter().enumerate().take(TOP_TIER.len()) {
            let heads = Self::top_tier_heads(race);
            let _ = write!(s, "\n| {} | Size |", f.name);
            for h in &heads {
                let _ = write!(s, " {h} |");
            }
            s += "\n| --- | --- |";
            s += &" --- |".repeat(heads.len());
            s += "\n";
            for (_, l, size, n, cols) in rows.iter().filter(|r| r.0 == race) {
                let _ = write!(s, "| {} | {size} |", LEVELS[*l]);
                for v in cols {
                    let _ = write!(
                        s,
                        " {} ({}/{n}) |",
                        median(v).map_or("—".into(), mmss),
                        v.len()
                    );
                }
                s += "\n";
            }
        }
        s
    }
}

/// The game-length bins of the design target (name, from, to, in minutes).
pub const LENGTH_BINS: [(&str, f64, f64); 3] = [
    ("under 10 min", 0.0, 10.0),
    ("10 to 15 min", 10.0, 15.0),
    ("over 15 min", 15.0, f64::INFINITY),
];

/// A race's unit mix over `cells`: (kind index, built, lost, share of the race's non-worker units built), kinds it
/// built, in kind order.
fn mix<'a>(
    cells: impl Iterator<Item = (&'a Cell, &'a Vec<GameRec>)>,
    race: usize,
) -> Vec<(usize, u32, u32, f64)> {
    let (mut built, mut lost) = (vec![0u32; UNIT_KINDS.len()], vec![0u32; UNIT_KINDS.len()]);
    for (c, games) in cells {
        for g in games {
            for s in 0..2 {
                if c.races[s] == race {
                    for k in 0..UNIT_KINDS.len() {
                        built[k] += g.seats[s].units_built[k];
                        lost[k] += g.seats[s].units_lost[k];
                    }
                }
            }
        }
    }
    let fighters: u32 = (0..UNIT_KINDS.len())
        .filter(|&k| !UNIT_KINDS[k].def().worker)
        .map(|k| built[k])
        .sum();
    (0..UNIT_KINDS.len())
        .filter(|&k| !UNIT_KINDS[k].def().worker && built[k] > 0)
        .map(|k| {
            (
                k,
                built[k],
                lost[k],
                built[k] as f64 / fighters.max(1) as f64,
            )
        })
        .collect()
}

/// The mean finished Pumps each seat held at 5:00, over the games that reached it.
fn pumps_mean(games: &[GameRec]) -> Option<[f64; 2]> {
    let at: Vec<[u32; 2]> = games.iter().filter_map(|g| g.pumps_at_5).collect();
    (!at.is_empty())
        .then(|| [0, 1].map(|s| at.iter().map(|p| p[s] as f64).sum::<f64>() / at.len() as f64))
}

fn cell_json(c: &Cell, games: &[GameRec]) -> Json {
    let len = lengths(games);
    let fa: Vec<f64> = games
        .iter()
        .filter_map(|g| g.first_attack)
        .map(secs)
        .collect();
    let mix_json = |race: usize| -> Json {
        Json::Arr(
            mix(std::iter::once((c, &games.to_vec())), race)
                .into_iter()
                .map(|(k, b, l, sh)| {
                    Json::obj()
                        .with("unit", UNIT_KINDS[k].def().key)
                        .with("built", b)
                        .with("lost", l)
                        .with("share", sh)
                })
                .collect(),
        )
    };
    let mut races: Vec<usize> = c.races.to_vec();
    races.dedup();
    Json::obj()
        .with("id", c.id())
        .with(
            "kind",
            if c.kind == Kind::Ladder {
                "ladder"
            } else {
                "level"
            },
        )
        .with("size", c.size)
        .with("map", format!("{:?}", c.map))
        .with("races", vec![c.faction(0).name, c.faction(1).name])
        .with("levels", vec![LEVELS[c.levels[0]], LEVELS[c.levels[1]]])
        .with("games", games.len())
        .with(
            "timeouts",
            games.iter().filter(|g| g.winner.is_none()).count(),
        )
        .with("rate", cell_rate(c, games).json())
        .with(
            "length_s",
            Json::obj()
                .with("median", median(&len))
                .with("q1", quantile(&len, 0.25))
                .with("q3", quantile(&len, 0.75)),
        )
        .with("first_attack_s", median(&fa))
        .with(
            "pumps_at_5_mean",
            pumps_mean(games).map(|m| vec![m[0], m[1]]),
        )
        .with(
            "mix",
            races
                .iter()
                .fold(Json::obj(), |o, &r| o.with(FACTIONS[r].name, mix_json(r))),
        )
        .with("records", games.iter().map(game_json).collect::<Vec<_>>())
}

fn kinds_json(v: &[u32], key: impl Fn(usize) -> &'static str) -> Json {
    v.iter()
        .enumerate()
        .filter(|(_, n)| **n > 0)
        .fold(Json::obj(), |o, (i, &n)| o.with(key(i), n))
}

fn firsts_json(v: &[Option<u32>], key: impl Fn(usize) -> &'static str) -> Json {
    v.iter()
        .enumerate()
        .filter_map(|(i, t)| t.map(|t| (i, t)))
        .fold(Json::obj(), |o, (i, t)| o.with(key(i), t))
}

fn game_json(g: &GameRec) -> Json {
    let seat = |s: &crate::batch::SeatRec| {
        Json::obj()
            .with(
                "units_built",
                kinds_json(&s.units_built, |i| UNIT_KINDS[i].def().key),
            )
            .with(
                "units_lost",
                kinds_json(&s.units_lost, |i| UNIT_KINDS[i].def().key),
            )
            .with(
                "bldgs_built",
                kinds_json(&s.bldgs_built, |i| BLDG_KINDS[i].def().key),
            )
            .with(
                "bldgs_lost",
                kinds_json(&s.bldgs_lost, |i| BLDG_KINDS[i].def().key),
            )
            .with(
                "bldgs_cancelled",
                kinds_json(&s.bldgs_cancelled, |i| BLDG_KINDS[i].def().key),
            )
            .with("mined", vec![s.mined[0], s.mined[1]])
            .with("spent", vec![s.spent[0], s.spent[1]])
            .with("peak_supply", s.peak_supply)
            .with(
                "stats",
                Json::obj()
                    .with("built", s.stats[0])
                    .with("lost", s.stats[1])
                    .with("killed", s.stats[2])
                    .with("razed", s.stats[3]),
            )
            .with("waves", vec![s.waves[0], s.waves[1]])
            .with(
                "ground_samples",
                vec![s.ground_samples[0], s.ground_samples[1]],
            )
            .with(
                "lost_near_field",
                vec![s.lost_near_field[0], s.lost_near_field[1]],
            )
            .with("south", s.south)
            .with(
                "econ",
                s.econ
                    .iter()
                    .zip(ECON_AT)
                    .map(|(e, m)| {
                        Json::obj()
                            .with("min", m)
                            .with("bank", vec![e.bank[0] as i64, e.bank[1] as i64])
                            .with("mined", vec![e.mined[0], e.mined[1]])
                    })
                    .collect::<Vec<_>>(),
            )
            .with(
                "at_max_tick",
                vec![Json::from(s.at_max[0]), Json::from(s.at_max[1])],
            )
            .with("home_dry_tick", s.home_dry)
            .with("second_base_tick", s.second_base)
            .with(
                "first_unit_tick",
                firsts_json(&s.first_unit, |i| UNIT_KINDS[i].def().key),
            )
            .with(
                "first_bldg_tick",
                firsts_json(&s.first_bldg, |i| BLDG_KINDS[i].def().key),
            )
    };
    Json::obj()
        .with("seed", g.seed)
        .with("winner", g.winner)
        .with("end_tick", g.end_tick)
        .with("first_attack_tick", g.first_attack)
        .with("pumps_at_5", g.pumps_at_5.map(|p| vec![p[0], p[1]]))
        .with("seats", vec![seat(&g.seats[0]), seat(&g.seats[1])])
        .with("mines", g.mines)
        .with("mines_dry_ticks", g.mines_dry.clone())
        .with(
            "routes",
            g.routes.map(|r| vec![Json::from(r[0]), Json::from(r[1])]),
        )
        .with(
            "waves",
            g.waves
                .iter()
                .map(crate::waves::Wave::json)
                .collect::<Vec<_>>(),
        )
}

/// The Shore map's part of the report (the gate of the PRD "Stage 1a, the Shore map"): each people's win rate from
/// each half of the map, the AI's waves (launched, and reaching the other side), the Vael's ground units' time in deep
/// water, the routes between the starts, and the gate's rows.
impl Report {
    fn shore_cells(&self) -> impl Iterator<Item = (&Cell, &Vec<GameRec>)> {
        self.level_cells(|c| c.map == endfall_sim::map::MapKind::Shore)
    }

    /// Each people's income and losses at fields in the Humans-vs-Vael Shore games at `level` (None: every level),
    /// per minute of play (timeouts too): [shards a minute, ether a minute, workers lost a minute, workers lost at a
    /// field a game, other units lost at a field a game], and the games. Indexed by race.
    fn shore_income(&self, level: Option<usize>) -> [([f64; 5], usize); 2] {
        let mut sum = [[0f64; 5]; 2];
        let (mut minutes, mut games) = (0.0, 0usize);
        for (c, gs) in self.shore_cells().filter(|(c, _)| {
            c.kind == Kind::Level && !c.mirror() && level.is_none_or(|l| c.levels[0] == l)
        }) {
            for g in gs {
                minutes += g.end_tick as f64 / (60.0 * TPS as f64);
                games += 1;
                for seat in 0..2 {
                    let (r, s) = (c.races[seat], &g.seats[seat]);
                    let workers: u32 = s
                        .units_lost
                        .iter()
                        .enumerate()
                        .filter(|(k, _)| UNIT_KINDS[*k].def().worker)
                        .map(|(_, n)| n)
                        .sum();
                    sum[r][0] += s.mined[0] as f64;
                    sum[r][1] += s.mined[1] as f64;
                    sum[r][2] += workers as f64;
                    sum[r][3] += s.lost_near_field[0] as f64;
                    sum[r][4] += s.lost_near_field[1] as f64;
                }
            }
        }
        let per = |v: [f64; 5]| {
            let m = minutes.max(f64::MIN_POSITIVE);
            let n = games.max(1) as f64;
            [v[0] / m, v[1] / m, v[2] / m, v[3] / n, v[4] / n]
        };
        [(per(sum[0]), games), (per(sum[1]), games)]
    }

    fn shore_income_json(&self) -> Option<Json> {
        self.shore_cells().next()?;
        let levels: Vec<Option<usize>> = self
            .batch
            .levels
            .iter()
            .map(|&l| Some(l))
            .chain([None])
            .collect();
        let rows: Vec<Json> = levels
            .iter()
            .flat_map(|&l| {
                self.shore_income(l)
                    .into_iter()
                    .enumerate()
                    .map(move |(r, (v, n))| {
                        Json::obj()
                            .with("level", l.map_or("all", |l| LEVELS[l]))
                            .with("race", FACTIONS[r].name)
                            .with("games", n)
                            .with("shards_per_min", v[0])
                            .with("ether_per_min", v[1])
                            .with("workers_lost_per_min", v[2])
                            .with("workers_lost_at_fields_per_game", v[3])
                            .with("others_lost_at_fields_per_game", v[4])
                    })
            })
            .collect();
        Some(Json::from(rows))
    }

    /// Humans-vs-Vael Shore games at `level` (None: every level): (race, south) -> wins of decided.
    fn shore_halves(&self, level: Option<usize>) -> Vec<(usize, bool, Rate)> {
        let mut out = Vec::new();
        for (race, faction) in FACTIONS.iter().enumerate() {
            for south in [true, false] {
                let mut r = Rate {
                    of: format!(
                        "{} from the {}",
                        faction.name,
                        if south { "south" } else { "north" }
                    ),
                    k: 0,
                    n: 0,
                };
                for (c, games) in self.shore_cells().filter(|(c, _)| {
                    c.kind == Kind::Level && !c.mirror() && level.is_none_or(|l| c.levels[0] == l)
                }) {
                    for g in games {
                        let Some(win) = g.winner else { continue };
                        for seat in 0..2 {
                            if c.races[seat] == race && g.seats[seat].south == south {
                                r.n += 1;
                                r.k += (win == seat) as usize;
                            }
                        }
                    }
                }
                out.push((race, south, r));
            }
        }
        out
    }

    fn shore_markdown(&self) -> String {
        let mut s = String::new();
        if self.shore_cells().next().is_none() {
            return s;
        }
        let _ = writeln!(s, "\n## The Shore map\n");
        // Each people from each half, at each level and pooled.
        let _ = writeln!(
            s,
            "Each people's win rate from each half of the map (Humans against Vael, both seat orders):\n"
        );
        let _ = writeln!(
            s,
            "| Level | Humans from the south | Humans from the north | Vael from the south | Vael from the north |"
        );
        let _ = writeln!(s, "| --- | --- | --- | --- | --- |");
        let levels: Vec<Option<usize>> = self
            .batch
            .levels
            .iter()
            .map(|&l| Some(l))
            .chain([None])
            .collect();
        for l in levels {
            let h = self.shore_halves(l);
            let _ = writeln!(
                s,
                "| {} | {} |",
                l.map_or("all", |l| LEVELS[l]),
                h.iter()
                    .map(|(_, _, r)| r.show())
                    .collect::<Vec<_>>()
                    .join(" | ")
            );
        }
        // Income and losses at fields.
        let _ = writeln!(
            s,
            "\nEach people's income and its losses at fields (Humans against Vael, both seat orders; per minute of play, timeouts too; at a field: within {} tiles of a crystal or a vent):\n",
            crate::batch::FIELD_NEAR
        );
        let _ = writeln!(
            s,
            "| Level | People | Shards a minute | Ether a minute | Workers lost a minute | Workers lost at a field, a game | Others lost at a field, a game |"
        );
        let _ = writeln!(s, "| --- | --- | --- | --- | --- | --- | --- |");
        for l in self.batch.levels.iter().map(|&l| Some(l)).chain([None]) {
            for (r, (v, _)) in self.shore_income(l).into_iter().enumerate() {
                let _ = writeln!(
                    s,
                    "| {} | {} | {:.0} | {:.1} | {:.2} | {:.1} | {:.1} |",
                    l.map_or("all", |l| LEVELS[l]),
                    FACTIONS[r].name,
                    v[0],
                    v[1],
                    v[2],
                    v[3],
                    v[4]
                );
            }
        }
        // Waves.
        let _ = writeln!(
            s,
            "\nThe AI's attack waves, each level against itself (a wave reached when one of its units came within 8 tiles of an enemy building):\n"
        );
        let _ = writeln!(
            s,
            "| Level | Humans' waves | reached | Vael waves | reached |"
        );
        let _ = writeln!(s, "| --- | --- | --- | --- | --- |");
        let pct = |a: u32, b: u32| {
            if b == 0 {
                "—".to_string()
            } else {
                format!("{:.0}%", 100.0 * a as f64 / b as f64)
            }
        };
        for &l in &self.batch.levels {
            let w = self.shore_waves(l);
            let _ = writeln!(
                s,
                "| {} | {} | {} | {} | {} |",
                LEVELS[l],
                w[0][0],
                pct(w[0][1], w[0][0]),
                w[1][0],
                pct(w[1][1], w[1][0])
            );
        }
        if let Some(d) = self.shore_deep() {
            let _ = writeln!(
                s,
                "\nThe Vael army (workers left out) spent {:.1}% of its time in deep water.",
                d * 100.0
            );
        }
        // Routes per seed (Humans against Vael: a Human cove and a Vael basin; the map is point-symmetric, so the
        // other seat order's routes are the same).
        let _ = writeln!(
            s,
            "\nRoutes between the Human cove and the Vael basin, per seed (tiles; walkers cannot cross deep water):\n"
        );
        let _ = writeln!(s, "| Seed | Humans (Walk) | Vael (Amph) |");
        let _ = writeln!(s, "| --- | --- | --- |");
        if let Some((_, games)) = self.shore_level_cells().find(|(c, _)| c.races == [0, 1]) {
            for g in games {
                let r = g.routes.unwrap_or([None, None]);
                let f = |v: Option<f64>| v.map_or("no way".into(), |v| format!("{v:.0}"));
                let _ = writeln!(s, "| {} | {} | {} |", g.seed, f(r[0]), f(r[1]));
            }
        }
        // The gate.
        let _ = writeln!(
            s,
            "\n### The gate (PRD, the Shore map, section 5; each level against itself)\n"
        );
        let _ = writeln!(s, "| Check | Target | Measured | |");
        let _ = writeln!(s, "| --- | --- | --- | --- |");
        for g in self.shore_gate() {
            let _ = writeln!(
                s,
                "| {} | {} | {} | {} |",
                g.name,
                g.target,
                g.measured,
                if g.pass { "PASS" } else { "WARN" }
            );
        }
        s
    }

    /// The Shore's cells of each level against itself (the gate's games: the ladder's are unequal sides).
    fn shore_level_cells(&self) -> impl Iterator<Item = (&Cell, &Vec<GameRec>)> {
        self.shore_cells().filter(|(c, _)| c.kind == Kind::Level)
    }

    /// Waves at `level` by people: [[launched, reached]; races].
    fn shore_waves(&self, level: usize) -> [[u32; 2]; 2] {
        let mut w = [[0u32; 2]; 2];
        for (c, games) in self
            .shore_level_cells()
            .filter(|(c, _)| c.levels[0] == level)
        {
            for g in games {
                for seat in 0..2 {
                    for (k, n) in g.seats[seat].waves.iter().enumerate() {
                        w[c.races[seat]][k] += n;
                    }
                }
            }
        }
        w
    }

    /// The Vael army's share of its ground samples in deep water.
    fn shore_deep(&self) -> Option<f64> {
        let mut deep = [0u64; 2];
        for (c, games) in self.shore_level_cells() {
            for g in games {
                for seat in 0..2 {
                    if c.races[seat] == 1 {
                        deep[0] += g.seats[seat].ground_samples[0] as u64;
                        deep[1] += g.seats[seat].ground_samples[1] as u64;
                    }
                }
            }
        }
        (deep[0] > 0).then(|| deep[1] as f64 / deep[0] as f64)
    }

    /// The gate's rows (none without Shore cells): each with its target, what was measured, and PASS or WARN.
    pub fn shore_gate(&self) -> Vec<GateRow> {
        let mut out = Vec::new();
        if self.shore_level_cells().next().is_none() {
            return out;
        }
        let all: Vec<&GameRec> = self
            .shore_level_cells()
            .flat_map(|(_, g)| g.iter())
            .collect();
        let decided = all.iter().filter(|g| g.winner.is_some()).count();
        // (a game with no attack at all counts its first fight at its end)
        let fa: Vec<f64> = all
            .iter()
            .map(|g| secs(g.first_attack.unwrap_or(g.end_tick)))
            .collect();
        let first = median(&fa).unwrap_or(f64::NAN);
        out.push(GateRow {
            name: "Median time to the first fight",
            target: "under 4 minutes".into(),
            measured: mmss(first),
            pass: first < 240.0,
        });
        let worst = self
            .shore_level_cells()
            .map(|(c, g)| {
                (
                    g.iter().filter(|g| g.winner.is_none()).count() as f64 / g.len().max(1) as f64,
                    c.id(),
                )
            })
            .fold((0.0, String::new()), |a, b| if b.0 > a.0 { b } else { a });
        let share = decided as f64 / all.len().max(1) as f64;
        out.push(GateRow {
            name: "Games that reach a result",
            target: "at least 90%; under 5% timeouts in every cell".into(),
            measured: format!(
                "{:.0}% of {}; the worst cell {:.0}% timeouts{}",
                share * 100.0,
                all.len(),
                worst.0 * 100.0,
                if worst.0 > 0.0 {
                    format!(" ({})", worst.1)
                } else {
                    String::new()
                }
            ),
            pass: share >= 0.9 && worst.0 < 0.05,
        });
        let len = median(
            &self
                .shore_level_cells()
                .flat_map(|(_, g)| lengths(g))
                .collect::<Vec<_>>(),
        )
        .unwrap_or(f64::NAN);
        out.push(GateRow {
            name: "Median AI game length",
            target: "10–20 minutes".into(),
            measured: mmss(len),
            pass: (600.0..=1200.0).contains(&len),
        });
        if self.batch.levels.contains(&1) {
            let h = self.shore_halves(Some(1));
            let low = h
                .iter()
                .filter(|(_, _, r)| r.n > 0)
                .min_by(|a, b| a.2.p().total_cmp(&b.2.p()));
            let pooled = self.humans_vs_vael_on(Some(1), endfall_sim::map::MapKind::Shore);
            out.push(GateRow {
                name: "Each people from either half, Medium",
                target: "at least 40%; Humans pooled 45–55%".into(),
                measured: format!(
                    "the lowest: {}; Humans pooled {}",
                    low.map_or("—".into(), |(_, _, r)| format!("{} {}", r.of, r.show())),
                    pooled.show()
                ),
                pass: low.is_none_or(|(_, _, r)| r.p() >= 0.4)
                    && !(!(0.45..=0.55).contains(&pooled.p()) && pooled.excludes_half()),
            });
        }
        // "Most, at every level": the lowest share of any people at any level.
        let worst_wave = self
            .batch
            .levels
            .iter()
            .flat_map(|&l| {
                let w = self.shore_waves(l);
                (0..2)
                    .filter(move |&r| w[r][0] > 0)
                    .map(move |r| (w[r][1] as f64 / w[r][0] as f64, r, l, w[r]))
            })
            .min_by(|a, b| a.0.total_cmp(&b.0));
        out.push(GateRow {
            name: "AI waves that reach the other side",
            target: "most, at every level".into(),
            measured: worst_wave.map_or("no waves".into(), |(p, r, l, w)| {
                format!(
                    "the lowest: {} at {}, {} of {} ({:.0}%)",
                    FACTIONS[r].name,
                    LEVELS[l],
                    w[1],
                    w[0],
                    p * 100.0
                )
            }),
            pass: worst_wave.is_some_and(|w| w.0 > 0.5),
        });
        let mirrors: Vec<(String, Rate)> = self
            .shore_level_cells()
            .filter(|(c, _)| c.mirror())
            .map(|(c, g)| (c.id(), cell_rate(c, g)))
            .collect();
        let off: Vec<&(String, Rate)> = mirrors
            .iter()
            .filter(|(_, r)| r.n > 0 && !(0.45..=0.55).contains(&r.p()) && r.excludes_half())
            .collect();
        out.push(GateRow {
            name: "Mirrors on the Shore",
            target: "within 45–55% (or the interval holding 50%)".into(),
            measured: if off.is_empty() {
                format!("{} mirrors, none off 50%", mirrors.len())
            } else {
                off.iter()
                    .map(|(id, r)| format!("{id}: {}", r.show()))
                    .collect::<Vec<_>>()
                    .join("; ")
            },
            pass: off.is_empty(),
        });
        out
    }

    /// Humans vs Vael on one map kind at `level` (None: every level), both seat orders pooled.
    fn humans_vs_vael_on(&self, level: Option<usize>, map: endfall_sim::map::MapKind) -> Rate {
        let mut r = Rate {
            of: "Humans win".into(),
            k: 0,
            n: 0,
        };
        for (c, g) in self.level_cells(|c| {
            c.map == map
                && c.kind == Kind::Level
                && !c.mirror()
                && level.is_none_or(|l| c.levels[0] == l)
        }) {
            let x = cell_rate(c, g);
            r.k += x.k;
            r.n += x.n;
        }
        r
    }
}

impl Report {
    /// Each level's waves against itself (the level cells), by map and the attacker's people: a row each.
    fn wave_rows(&self) -> Vec<(String, crate::waves::Summary)> {
        let mut rows = vec![];
        for &map in &self.batch.maps {
            for &level in &self.batch.levels {
                for (r, f) in FACTIONS.iter().enumerate() {
                    let mut v = vec![];
                    for (c, gs) in self.level_cells(|c| {
                        c.map == map && c.kind == Kind::Level && c.levels[0] == level
                    }) {
                        for g in gs {
                            v.extend(g.waves.iter().filter(|w| c.races[w.seat as usize] == r));
                        }
                    }
                    let s = crate::waves::summary(v);
                    if s.launched > 0 {
                        rows.push((format!("{map:?}, {}: {}", LEVELS[level], f.name), s));
                    }
                }
            }
        }
        rows
    }

    fn waves_markdown(&self) -> String {
        let rows = self.wave_rows();
        if rows.is_empty() {
            return String::new();
        }
        let mut s = format!(
            "\n## The waves\n\nEach level against itself, every size, by map and the attacking people: when a wave arrived (a unit within {} tiles of an enemy building), its value near that unit (within the same tiles) over the defence's there (armed units and armed buildings within {} tiles of that unit; shards plus ether at 1.5), its result (the value of what fell near its units over what it lost while out), and where it lost its units.\n\n{}",
            crate::waves::REACH,
            crate::waves::REACH,
            crate::waves::TABLE_HEAD
        );
        for (l, w) in rows {
            s += &w.row(&l);
        }
        s
    }
}

/// `--shore-field`'s names for the basins' field: back (every game's), channel, channel-far.
pub fn shore_field_name(f: endfall_sim::map::ShoreField) -> &'static str {
    use endfall_sim::map::ShoreField;
    if f == ShoreField::CHANNEL {
        "channel"
    } else if f == ShoreField::CHANNEL_FAR {
        "channel-far"
    } else if f == ShoreField::BACK {
        "back"
    } else {
        "other"
    }
}
