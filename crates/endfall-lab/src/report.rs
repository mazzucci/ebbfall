//! `report`: a batch's games turned into per-cell figures, the target checks, the key figures (the Balance reports
//! database's fields), a Markdown summary and the JSON that `compare` reads.

use crate::batch::{Batch, Cell, GameRec, Kind, LEVELS, TPS};
use crate::json::Json;
use crate::stats::{median, mmss, quantile, wilson};
use endfall_sim::data::{FACTIONS, UNIT_KINDS};
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

/// The seat whose wins a cell's rate counts: Humans in Humans vs Vael, the higher level on the ladder, the first
/// seat in a mirror.
fn rate_seat(c: &Cell, seat: usize) -> bool {
    match c.kind {
        Kind::Ladder => c.levels[seat] > c.levels[1 - seat],
        Kind::Level if c.mirror() => seat == 0,
        Kind::Level => c.races[seat] == 0,
    }
}
fn rate_of(c: &Cell) -> String {
    match c.kind {
        Kind::Ladder => format!("{} wins", LEVELS[c.levels[0].max(c.levels[1])]),
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
            c.kind == Kind::Level && !c.mirror() && level.is_none_or(|l| c.levels[0] == l)
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
        for (c, g) in
            self.level_cells(|c| c.kind == Kind::Ladder && c.levels[0].max(c.levels[1]) == level)
        {
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
            .filter(|c| c.kind == Kind::Ladder)
            .map(|c| c.levels[0].max(c.levels[1]))
            .collect();
        l.sort_unstable();
        l.dedup();
        l
    }
    /// The median length of the finished 64x64 games of each level against itself (the ladder's games, between
    /// unequal sides, left out; timeouts left out too: `timeouts_64` says how many).
    fn length_64(&self) -> Option<f64> {
        let all: Vec<f64> = self
            .level_cells(|c| c.size == 64 && c.kind == Kind::Level)
            .flat_map(|(_, g)| lengths(g))
            .collect();
        median(&all)
    }
    fn timeouts_64(&self) -> usize {
        self.level_cells(|c| c.size == 64 && c.kind == Kind::Level)
            .map(|(_, g)| g.iter().filter(|g| g.winner.is_none()).count())
            .sum()
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
    pub fn shards_per_ether(&self) -> Option<f64> {
        ratio_median(&self.ledgers(None, None).0)
    }
    fn timeouts(&self) -> (usize, usize) {
        let all = self.games.iter().flatten();
        (
            all.clone().filter(|g| g.winner.is_none()).count(),
            all.count(),
        )
    }

    pub fn checks(&self) -> Vec<Check> {
        let mut out = Vec::new();
        for &l in &self.batch.levels {
            let r = self.humans_vs_vael(Some(l));
            if r.n == 0 {
                continue;
            }
            let off = !(0.45..=0.55).contains(&r.p()) && r.excludes_half();
            out.push(Check {
                name: format!("Humans vs Vael, {}", LEVELS[l]),
                pass: !off,
                detail: format!("Humans {} of {}: {}", r.k, r.n, r.show()),
            });
        }
        for (c, g) in self.level_cells(|c| c.kind == Kind::Level && c.mirror()) {
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
        if let Some(m) = self.length_64() {
            let (lo, hi) = self.band;
            out.push(Check {
                name: "game length on 64x64".into(),
                pass: (lo * 60.0..=hi * 60.0).contains(&m),
                detail: format!(
                    "median {} of the finished games, each level against itself ({lo}–{hi} min wanted; {} timeouts left out)",
                    mmss(m),
                    self.timeouts_64()
                ),
            });
        }
        let mut over: Vec<String> = Vec::new();
        for (c, g) in self.level_cells(|_| true) {
            let t = g.iter().filter(|g| g.winner.is_none()).count();
            if !g.is_empty() && t as f64 > 0.05 * g.len() as f64 {
                over.push(format!("{} ({t} of {})", c.id(), g.len()));
            }
        }
        let (t, n) = self.timeouts();
        out.push(Check {
            name: "timeouts".into(),
            pass: over.is_empty(),
            detail: if over.is_empty() {
                format!("{t} of {n} games, no cell over 5%")
            } else {
                format!("{t} of {n} games; over 5%: {}", over.join("; "))
            },
        });
        out
    }

    /// The Balance reports database's fields, in its order.
    pub fn key_figures(&self, checks: &[Check]) -> Vec<(&'static str, String)> {
        let hv = self.humans_vs_vael(None);
        let dev = self
            .level_cells(|c| c.kind == Kind::Level && c.mirror())
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
                "Median length 64x64 (min)",
                num(self.length_64().map(|s| s / 60.0), 1),
            ),
            ("Observed shards per ether", num(self.shards_per_ether(), 2)),
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
        for &size in &self.batch.sizes {
            for &map in &self.batch.maps {
                let _ = writeln!(s, "\n## {size}x{size} {map:?}\n");
                let _ = writeln!(
                    s,
                    "| Cell | Games | Win rate (95%) | Timeouts | Length, median (IQR) | First attack | First vent dry |"
                );
                let _ = writeln!(s, "| --- | --- | --- | --- | --- | --- | --- |");
                for (c, g) in self.level_cells(|c| c.size == size && c.map == map) {
                    let r = cell_rate(c, g);
                    let len = lengths(g);
                    let (q1, q3) = (quantile(&len, 0.25), quantile(&len, 0.75));
                    let fa: Vec<f64> = g.iter().filter_map(|g| g.first_attack).map(secs).collect();
                    let fd: Vec<f64> = g.iter().filter_map(|g| g.first_dry).map(secs).collect();
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
                        if fd.is_empty() {
                            "—".into()
                        } else {
                            format!(
                                "{} ({} of {})",
                                mmss(median(&fd).unwrap()),
                                fd.len(),
                                g.len()
                            )
                        },
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
        s
    }
}

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

fn cell_json(c: &Cell, games: &[GameRec]) -> Json {
    let len = lengths(games);
    let fa: Vec<f64> = games
        .iter()
        .filter_map(|g| g.first_attack)
        .map(secs)
        .collect();
    let fd: Vec<f64> = games.iter().filter_map(|g| g.first_dry).map(secs).collect();
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
        .with("first_vent_dry_s", median(&fd))
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

fn game_json(g: &GameRec) -> Json {
    use endfall_sim::data::BLDG_KINDS;
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
    };
    Json::obj()
        .with("seed", g.seed)
        .with("winner", g.winner)
        .with("end_tick", g.end_tick)
        .with("first_attack_tick", g.first_attack)
        .with("first_vent_dry_tick", g.first_dry)
        .with("seats", vec![seat(&g.seats[0]), seat(&g.seats[1])])
}
