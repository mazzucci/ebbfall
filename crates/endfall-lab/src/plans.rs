//! `plans`: games where each AI seat follows a plan drawn at random (PRD: the balance lab: plans). A plan starts from
//! Medium's tuning and sets the workers it aims for, its first wave's time and when it expands; a placebo coin changes
//! nothing, and a planted coin raises its income 10% in the control run (`--plant`). Drawn independently of
//! everything else, a setting's effect on winning is a cause, not a correlation: the batch fits a logistic model of
//! the first seat's win on the seats' differences, and bins each setting's win rate.

use crate::first_wave::{FirstWave, Watcher};
use crate::json::Json;
use crate::model::{self, Fit};
use crate::stats::{median, mmss, wilson};
use endfall_sim::Mulberry32;
use endfall_sim::data::{DIFF, Diff, FACTIONS, NEVER};
use endfall_sim::map::{MapKind, MapSize};
use endfall_sim::world::World;
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};

const TPS: u32 = 30;
/// The level a plan starts from.
pub const BASE: usize = 1;
/// The planted effect: income x this with the planted coin, in the control run.
pub const PLANT: f64 = 1.10;

/// The earliest first wave a plan draws, and the default latest (s).
pub const FIRST_MIN: f64 = 120.0;
pub const FIRST_MAX: f64 = 420.0;
/// The first wave's bins are this wide (s).
const FIRST_BIN: f64 = 75.0;

/// The four seatings each map is played in: Humans against Vael either way, and both mirrors (factions' indices).
pub const PAIRINGS: [[usize; 2]; 4] = [[0, 1], [1, 0], [0, 0], [1, 1]];
const PAIRING_NAMES: [&str; 4] = [
    "Humans v Vael",
    "Vael v Humans",
    "Humans mirror",
    "Vael mirror",
];

/// What the batch plays.
#[derive(Clone, Debug)]
pub struct PlanBatch {
    pub games: usize,
    pub maps: Vec<MapKind>,
    /// The plans' own seed (never the world's).
    pub seed: u32,
    /// The control run: the planted coin raises income.
    pub plant: bool,
    /// In the control run, games played twice for the direct check (seat 0 planted, with the bonus on and off).
    pub check: usize,
    pub cap_min: u32,
    /// The latest first wave a plan draws (seconds; the earliest is 2:00): 7:00 by default, `--first-max`.
    pub first_max: f64,
    /// The tide on (`--tide`; the Shore's).
    pub tide: bool,
}

impl PlanBatch {
    pub fn default_batch() -> Self {
        PlanBatch {
            games: 2000,
            maps: vec![MapKind::Standard, MapKind::Shore],
            seed: 1,
            plant: false,
            check: 200,
            cap_min: 30,
            first_max: FIRST_MAX,
            tide: false,
        }
    }
}

/// One seat's plan: the settings drawn, and the coins.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Plan {
    pub harv: usize,
    pub first: f64,
    /// Seconds, or NEVER.
    pub expand_at: f64,
    pub placebo: bool,
    pub planted: bool,
}

impl Plan {
    /// Draw a plan (the PRD's ranges, uniformly): workers 8 to 20, the first wave 2:00 to `first_max` (7:00 by
    /// default), expanding 3:00 to 12:00 or (one draw in five) never, two fair coins.
    pub fn draw(r: &mut Mulberry32, first_max: f64) -> Plan {
        let mut u = || r.next_u32() as f64 / 4_294_967_296.0;
        let harv = 8 + (u() * 13.0) as usize;
        let first = FIRST_MIN + u() * (first_max - FIRST_MIN);
        let never = u() < 0.2;
        let at = 180.0 + u() * 540.0;
        let placebo = u() < 0.5;
        let planted = u() < 0.5;
        Plan {
            harv,
            first,
            expand_at: if never { NEVER } else { at },
            placebo,
            planted,
        }
    }
    /// The AI tuning it plays: Medium's with these settings (and the planted bonus when it is live).
    pub fn diff(&self, plant: bool) -> Diff {
        let base = DIFF[BASE];
        Diff {
            harv: self.harv,
            first: self.first,
            expand_at: self.expand_at,
            income: base.income * if plant && self.planted { PLANT } else { 1.0 },
            ..base
        }
    }
    pub fn never(&self) -> bool {
        self.expand_at >= NEVER
    }
}

/// A game's setup: its map, seating, map seed and both plans.
#[derive(Clone, Copy, Debug)]
pub struct Setup {
    pub map: MapKind,
    pub pairing: usize,
    pub map_seed: u32,
    pub plans: [Plan; 2],
}

/// Every game's setup, the plans drawn in order from the batch's seed (the same seed, the same plans).
pub fn setups(b: &PlanBatch) -> Vec<Setup> {
    let mut r = Mulberry32::new(b.seed);
    let m = b.maps.len().max(1);
    (0..b.games)
        .map(|i| Setup {
            map: b.maps[i % m],
            pairing: (i / m) % PAIRINGS.len(),
            map_seed: 1 + (i / (m * PAIRINGS.len())) as u32,
            plans: [
                Plan::draw(&mut r, b.first_max),
                Plan::draw(&mut r, b.first_max),
            ],
        })
        .collect()
}

/// A played game: the winner's seat (None: a timeout), its length, and each seat's first wave (None: it sent none).
#[derive(Clone, Copy, Debug)]
pub struct Played {
    pub winner: Option<u8>,
    pub end_tick: u32,
    pub first_wave: [Option<FirstWave>; 2],
}

/// Play one setup to its end or the cap.
pub fn play(s: &Setup, plant: bool, cap_min: u32, tide: bool) -> Played {
    let plans = [Some(s.plans[0].diff(plant)), Some(s.plans[1].diff(plant))];
    play_seats(s.map, s.pairing, s.map_seed, plans, cap_min, tide)
}

/// Play a 64x64 game of two Medium AI seats, each with its plan (None: Medium's own tuning), to its end or the cap.
pub fn play_seats(
    map: MapKind,
    pairing: usize,
    map_seed: u32,
    plans: [Option<Diff>; 2],
    cap_min: u32,
    tide: bool,
) -> Played {
    play_watched(map, pairing, map_seed, plans, cap_min, tide).0
}

/// `play_seats`, and every wave of the game (`waves::Watch`).
pub fn play_watched(
    map: MapKind,
    pairing: usize,
    map_seed: u32,
    plans: [Option<Diff>; 2],
    cap_min: u32,
    tide: bool,
) -> (Played, Vec<crate::waves::Wave>) {
    let pair = PAIRINGS[pairing];
    let mut w = World::with_size(
        map_seed,
        BASE,
        map,
        MapSize::square(64),
        0,
        &[FACTIONS[pair[0]], FACTIONS[pair[1]]],
    );
    if tide {
        w.set_tide(true);
    }
    assert!(w.set_diffs(&[BASE as u8, BASE as u8]), "per-seat levels");
    assert!(w.set_ai_plans(&plans), "per-seat plans");
    assert!(w.set_ai_seats([true, true]), "two AI seats");
    let cap = cap_min * 60 * TPS;
    let (mut watch, mut first) = (crate::waves::Watch::default(), Watcher::default());
    while w.winner < 0 && w.tick < cap {
        w.step();
        w.events.clear();
        watch.observe(&w);
        first.observe(&w);
    }
    let played = Played {
        winner: (w.winner >= 0).then_some(w.winner as u8),
        end_tick: w.tick,
        first_wave: first.finish(&w),
    };
    (played, watch.finish(&w))
}

/// Play `jobs` on `threads` threads, the results in the jobs' order whatever the threads.
pub(crate) fn play_jobs<J: Sync, R: Send>(
    jobs: &[J],
    play: impl Fn(&J) -> R + Sync,
    threads: usize,
    progress: &(dyn Fn(usize, usize) + Sync),
) -> Vec<R> {
    let slots: Vec<Mutex<Option<R>>> = jobs.iter().map(|_| Mutex::new(None)).collect();
    let (next, done) = (AtomicUsize::new(0), AtomicUsize::new(0));
    std::thread::scope(|scope| {
        for _ in 0..threads.max(1) {
            scope.spawn(|| {
                loop {
                    let k = next.fetch_add(1, Ordering::SeqCst);
                    let Some(j) = jobs.get(k) else { break };
                    *slots[k].lock().unwrap() = Some(play(j));
                    progress(done.fetch_add(1, Ordering::SeqCst) + 1, jobs.len());
                }
            });
        }
    });
    slots
        .into_iter()
        .map(|s| s.into_inner().unwrap().expect("every game played"))
        .collect()
}

/// The batch's results: its setups and games, and in the control run the direct check's pairs.
pub struct PlanRun {
    pub batch: PlanBatch,
    pub commit: String,
    pub setups: Vec<Setup>,
    pub games: Vec<Played>,
    /// The direct check (control run only): seat 0 planted, its setup played with the bonus on, then off.
    pub check: Vec<(Setup, Played, Played)>,
}

/// Play the batch (and, in the control run, the direct check).
pub fn run(
    batch: PlanBatch,
    commit: &str,
    threads: usize,
    progress: &(dyn Fn(usize, usize) + Sync),
) -> PlanRun {
    let setups = setups(&batch);
    let mut jobs: Vec<(Setup, bool)> = setups.iter().map(|&s| (s, batch.plant)).collect();
    // The direct check: the first `check` setups with seat 0 planted and seat 1 not, with the bonus on and off.
    let checks: Vec<Setup> = if batch.plant {
        setups
            .iter()
            .take(batch.check)
            .map(|s| {
                let mut c = *s;
                c.plans[0].planted = true;
                c.plans[1].planted = false;
                c
            })
            .collect()
    } else {
        Vec::new()
    };
    for &c in &checks {
        jobs.push((c, true));
        jobs.push((c, false));
    }
    let (cap, tide) = (batch.cap_min, batch.tide);
    let played = play_jobs(
        &jobs,
        |(s, plant)| play(s, *plant, cap, tide),
        threads,
        progress,
    );
    let n = setups.len();
    let check = checks
        .iter()
        .enumerate()
        .map(|(k, &c)| (c, played[n + 2 * k], played[n + 2 * k + 1]))
        .collect();
    PlanRun {
        commit: commit.to_string(),
        games: played[..n].to_vec(),
        setups,
        check,
        batch,
    }
}

/// A plan setting the report models and bins.
#[derive(Clone, Copy, PartialEq)]
enum Setting {
    Workers,
    FirstWave,
    Expand,
    Placebo,
    Planted,
}
const SETTINGS: [Setting; 5] = [
    Setting::Workers,
    Setting::FirstWave,
    Setting::Expand,
    Setting::Placebo,
    Setting::Planted,
];

impl Setting {
    fn name(self) -> &'static str {
        match self {
            Setting::Workers => "Workers",
            Setting::FirstWave => "The first wave's time",
            Setting::Expand => "When to expand",
            Setting::Placebo => "Placebo",
            Setting::Planted => "Planted (+10% income)",
        }
    }
    /// A seat's bin for this setting (the first wave's bins run to the batch's `first_max`), and the bins' labels.
    fn bin(self, p: &Plan, first_max: f64) -> usize {
        match self {
            Setting::Workers => ((p.harv - 8) / 3).min(3),
            Setting::FirstWave => {
                (((p.first - FIRST_MIN) / FIRST_BIN) as usize).min(first_bins(first_max) - 1)
            }
            Setting::Expand if p.never() => 4,
            Setting::Expand => (((p.expand_at - 180.0) / 135.0) as usize).min(3),
            Setting::Placebo => p.placebo as usize,
            Setting::Planted => p.planted as usize,
        }
    }
    fn labels(self, first_max: f64) -> Vec<String> {
        let fixed = |l: &[&str]| l.iter().map(|s| s.to_string()).collect();
        match self {
            Setting::Workers => fixed(&["8-10", "11-13", "14-16", "17-20"]),
            Setting::FirstWave => (0..first_bins(first_max))
                .map(|k| {
                    let lo = FIRST_MIN + k as f64 * FIRST_BIN;
                    format!("{}-{}", mmss(lo), mmss((lo + FIRST_BIN).min(first_max)))
                })
                .collect(),
            Setting::Expand => {
                fixed(&["3:00-5:15", "5:15-7:30", "7:30-9:45", "9:45-12:00", "never"])
            }
            Setting::Placebo | Setting::Planted => fixed(&["0", "1"]),
        }
    }
}

/// How many bins of the first wave's time: 1:15 each from 2:00 to `first_max` (four to 7:00, eight to 12:00).
fn first_bins(first_max: f64) -> usize {
    (((first_max - FIRST_MIN) / FIRST_BIN).ceil() as usize).max(1)
}

/// The model's columns: the intercept, each setting's difference between the seats (the continuous ones standardised
/// by the spread of a seat's draws), the seating (against Humans v Vael) and the map (against the first).
struct Design {
    names: Vec<String>,
    /// Which setting each column belongs to (None: intercept, seating, map).
    of: Vec<Option<Setting>>,
    rows: Vec<Vec<f64>>,
    won: Vec<bool>,
    /// The games the rows are (timeouts left out).
    games: Vec<usize>,
}

fn sd(xs: &[f64]) -> f64 {
    let n = xs.len() as f64;
    let m = xs.iter().sum::<f64>() / n;
    (xs.iter().map(|x| (x - m) * (x - m)).sum::<f64>() / n)
        .sqrt()
        .max(1e-9)
}

fn design(run: &PlanRun) -> Design {
    let plans: Vec<&Plan> = run.setups.iter().flat_map(|s| s.plans.iter()).collect();
    let harv: Vec<f64> = plans.iter().map(|p| p.harv as f64).collect();
    let first: Vec<f64> = plans.iter().map(|p| p.first).collect();
    let expanders: Vec<f64> = plans
        .iter()
        .filter(|p| !p.never())
        .map(|p| p.expand_at)
        .collect();
    let exp_mean = expanders.iter().sum::<f64>() / expanders.len().max(1) as f64;
    // (a seat that never expands takes the expanders' mean time: its "never" column carries the difference)
    let exp_time = |p: &Plan| if p.never() { exp_mean } else { p.expand_at };
    let (s_harv, s_first, s_exp) = (sd(&harv), sd(&first), sd(&expanders));
    let maps = &run.batch.maps;
    let mut names: Vec<String> = vec![
        "intercept",
        "workers (per SD)",
        "first wave's time (per SD)",
        "expansion time (per SD)",
        "never expands",
        "placebo",
        "planted",
    ]
    .into_iter()
    .map(String::from)
    .collect();
    let mut of = vec![
        None,
        Some(Setting::Workers),
        Some(Setting::FirstWave),
        Some(Setting::Expand),
        Some(Setting::Expand),
        Some(Setting::Placebo),
        Some(Setting::Planted),
    ];
    let pairings: Vec<usize> = (1..PAIRINGS.len())
        .filter(|&p| run.setups.iter().any(|s| s.pairing == p))
        .collect();
    for &p in &pairings {
        names.push(format!("seating: {}", PAIRING_NAMES[p]));
        of.push(None);
    }
    for m in maps.iter().skip(1) {
        names.push(format!("map: {m:?}"));
        of.push(None);
    }
    let (mut rows, mut won, mut games) = (Vec::new(), Vec::new(), Vec::new());
    for (g, (s, p)) in run.setups.iter().zip(&run.games).enumerate() {
        let Some(winner) = p.winner else { continue };
        let [a, b] = &s.plans;
        let mut row = vec![
            1.0,
            (a.harv as f64 - b.harv as f64) / s_harv,
            (a.first - b.first) / s_first,
            (exp_time(a) - exp_time(b)) / s_exp,
            a.never() as u8 as f64 - b.never() as u8 as f64,
            a.placebo as u8 as f64 - b.placebo as u8 as f64,
            a.planted as u8 as f64 - b.planted as u8 as f64,
        ];
        row.extend(pairings.iter().map(|&q| (s.pairing == q) as u8 as f64));
        row.extend(maps.iter().skip(1).map(|&m| (s.map == m) as u8 as f64));
        rows.push(row);
        won.push(winner == 0);
        games.push(g);
    }
    Design {
        names,
        of,
        rows,
        won,
        games,
    }
}

/// The model's findings.
pub struct Findings {
    pub names: Vec<String>,
    pub fit: Fit,
    /// Per setting: the log-likelihood lost when its columns are left out.
    pub importance: Vec<(&'static str, f64)>,
    /// Correlations between the settings' columns (names, matrix).
    pub corr: (Vec<String>, Vec<Vec<f64>>),
    /// The planted coin's average effect on the first seat's chance (the model's: planted against neither).
    pub planted_effect: f64,
    pub timeouts: usize,
}

fn findings(run: &PlanRun) -> Option<Findings> {
    let d = design(run);
    let fit = model::fit(&d.rows, &d.won)?;
    let importance = SETTINGS
        .iter()
        .map(|&st| {
            let keep: Vec<usize> = (0..d.names.len())
                .filter(|&j| d.of[j] != Some(st))
                .collect();
            let rows: Vec<Vec<f64>> = d
                .rows
                .iter()
                .map(|r| keep.iter().map(|&j| r[j]).collect())
                .collect();
            let lost = model::fit(&rows, &d.won).map_or(f64::NAN, |f| fit.loglik - f.loglik);
            (st.name(), lost)
        })
        .collect();
    let cols: Vec<usize> = (1..d.names.len()).filter(|&j| d.of[j].is_some()).collect();
    let names = cols.iter().map(|&j| d.names[j].clone()).collect();
    let column = |j: usize| d.rows.iter().map(|r| r[j]).collect::<Vec<_>>();
    let matrix = cols
        .iter()
        .map(|&a| {
            cols.iter()
                .map(|&b| model::correlation(&column(a), &column(b)))
                .collect()
        })
        .collect();
    let pj = 6; // the planted column
    let planted_effect = d
        .rows
        .iter()
        .map(|r| {
            let (mut on, mut off) = (r.clone(), r.clone());
            on[pj] = 1.0;
            off[pj] = 0.0;
            model::predict(&fit.beta, &on) - model::predict(&fit.beta, &off)
        })
        .sum::<f64>()
        / d.rows.len().max(1) as f64;
    Some(Findings {
        names: d.names,
        fit,
        importance,
        corr: (names, matrix),
        planted_effect,
        timeouts: run.games.len() - d.games.len(),
    })
}

/// A seat's win rate by a setting's bin, overall and in short and long games (split at the median length).
struct Bins {
    setting: Setting,
    /// [bin] -> (won, played) overall, in short games, in long games
    all: Vec<(usize, usize)>,
    short: Vec<(usize, usize)>,
    long: Vec<(usize, usize)>,
}

fn bins(run: &PlanRun) -> (Vec<Bins>, f64) {
    let finished: Vec<f64> = run
        .games
        .iter()
        .filter(|p| p.winner.is_some())
        .map(|p| p.end_tick as f64)
        .collect();
    let split = median(&finished).unwrap_or(0.0);
    let out = SETTINGS
        .iter()
        .map(|&st| {
            let k = st.labels(run.batch.first_max).len();
            let mut b = Bins {
                setting: st,
                all: vec![(0, 0); k],
                short: vec![(0, 0); k],
                long: vec![(0, 0); k],
            };
            for (s, p) in run.setups.iter().zip(&run.games) {
                let Some(winner) = p.winner else { continue };
                for seat in 0..2 {
                    let i = st.bin(&s.plans[seat], run.batch.first_max);
                    let w = (winner as usize == seat) as usize;
                    let half = if (p.end_tick as f64) < split {
                        &mut b.short
                    } else {
                        &mut b.long
                    };
                    half[i].0 += w;
                    half[i].1 += 1;
                    b.all[i].0 += w;
                    b.all[i].1 += 1;
                }
            }
            b
        })
        .collect();
    (out, split / TPS as f64)
}

fn rate(c: (usize, usize)) -> String {
    if c.1 == 0 {
        return "—".into();
    }
    let (lo, hi) = wilson(c.0, c.1);
    format!(
        "{:.0}% ({:.0}–{:.0}%) of {}",
        100.0 * c.0 as f64 / c.1 as f64,
        100.0 * lo,
        100.0 * hi,
        c.1
    )
}

/// The direct check: seat 0's win rate with the bonus on and off, and the difference with its 95% interval.
fn direct(run: &PlanRun) -> Option<(f64, f64, f64, f64, usize)> {
    let pairs: Vec<(bool, bool)> = run
        .check
        .iter()
        .filter_map(|(_, on, off)| Some((on.winner? == 0, off.winner? == 0)))
        .collect();
    let n = pairs.len();
    if n == 0 {
        return None;
    }
    let p_on = pairs.iter().filter(|p| p.0).count() as f64 / n as f64;
    let p_off = pairs.iter().filter(|p| p.1).count() as f64 / n as f64;
    // (paired: the same setups played twice; the variance of the per-pair difference)
    let diffs: Vec<f64> = pairs
        .iter()
        .map(|&(a, b)| a as u8 as f64 - b as u8 as f64)
        .collect();
    let d = p_on - p_off;
    let var = diffs.iter().map(|x| (x - d) * (x - d)).sum::<f64>() / (n as f64 - 1.0).max(1.0);
    let half = 1.959_963_984_540_054 * (var / n as f64).sqrt();
    Some((p_on, p_off, d - half, d + half, n))
}

impl PlanRun {
    /// Each first-wave bin's waves (a seat's own plan's bin, every game): how many launched of the seats, the median
    /// launch and value at launch, and the pooled result (value destroyed over value lost while out).
    fn first_wave_rows(&self) -> Vec<(String, usize, usize, f64, f64, f64, f64)> {
        let fm = self.batch.first_max;
        Setting::FirstWave
            .labels(fm)
            .into_iter()
            .enumerate()
            .map(|(k, label)| {
                let (mut seats, mut at, mut value, mut destroyed, mut lost) =
                    (0, vec![], vec![], 0.0, 0.0);
                for (s, p) in self.setups.iter().zip(&self.games) {
                    for seat in 0..2 {
                        if Setting::FirstWave.bin(&s.plans[seat], fm) != k {
                            continue;
                        }
                        seats += 1;
                        if let Some(f) = p.first_wave[seat] {
                            at.push(f.at as f64 / TPS as f64);
                            value.push(f.value);
                            destroyed += f.destroyed;
                            lost += f.lost;
                        }
                    }
                }
                let med = |v: &[f64]| median(v).unwrap_or(f64::NAN);
                (
                    label,
                    seats,
                    at.len(),
                    med(&at),
                    med(&value),
                    destroyed,
                    lost,
                )
            })
            .collect()
    }

    fn first_wave_markdown(&self) -> String {
        let mut s = "\n## The first wave\n\nEach seat's first wave by its plan's bin: how many seats launched one, when (median), its army value as it launched (median; shards plus ether at 1.5), and its result while out (the value it destroyed over the value it lost, pooled).\n\n| Bin | Launched | Median launch | Median value | Destroyed / lost |\n| --- | --- | --- | --- | --- |\n".to_string();
        for (label, seats, n, at, value, d, l) in self.first_wave_rows() {
            let ratio = if l > 0.0 {
                format!("{:.2} ({d:.0} / {l:.0})", d / l)
            } else {
                format!("— ({d:.0} / 0)")
            };
            s += &format!(
                "| {label} | {n} of {seats} | {} | {value:.0} | {ratio} |\n",
                mmss(at)
            );
        }
        s
    }

    pub fn json(&self) -> Json {
        let f = findings(self);
        let (bins, split) = bins(self);
        let plan_json = |p: &Plan| {
            Json::obj()
                .with("harv", p.harv)
                .with("first", p.first)
                .with("expand_at", (!p.never()).then_some(p.expand_at))
                .with("placebo", p.placebo)
                .with("planted", p.planted)
        };
        let games: Vec<Json> = self
            .setups
            .iter()
            .zip(&self.games)
            .map(|(s, p)| {
                Json::obj()
                    .with("map", format!("{:?}", s.map))
                    .with("seating", PAIRING_NAMES[s.pairing])
                    .with("map_seed", s.map_seed)
                    .with(
                        "plans",
                        vec![plan_json(&s.plans[0]), plan_json(&s.plans[1])],
                    )
                    .with("winner", p.winner.map(|w| w as u32))
                    .with("end_tick", p.end_tick)
                    .with(
                        "first_wave",
                        p.first_wave
                            .iter()
                            .map(|f| {
                                f.map(|f| {
                                    Json::obj()
                                        .with("tick", f.at)
                                        .with("value", f.value)
                                        .with("destroyed", f.destroyed)
                                        .with("lost", f.lost)
                                })
                            })
                            .collect::<Vec<_>>(),
                    )
            })
            .collect();
        let mut j = Json::obj()
            .with("lab", "plans")
            .with("commit", self.commit.as_str())
            .with(
                "batch",
                Json::obj()
                    .with("games", self.batch.games)
                    .with(
                        "maps",
                        self.batch
                            .maps
                            .iter()
                            .map(|m| format!("{m:?}"))
                            .collect::<Vec<_>>(),
                    )
                    .with("seed", self.batch.seed)
                    .with("plant", self.batch.plant)
                    .with(
                        "check",
                        if self.batch.plant {
                            self.batch.check
                        } else {
                            0
                        },
                    )
                    .with("cap_min", self.batch.cap_min)
                    .with("first_max", self.batch.first_max)
                    .with("tide", self.batch.tide),
            )
            .with("short_long_split_s", split);
        if let Some(f) = &f {
            let coef: Vec<Json> = (0..f.names.len())
                .map(|k| {
                    let (lo, hi) = f.fit.interval(k);
                    Json::obj()
                        .with("feature", f.names[k].as_str())
                        .with("beta", f.fit.beta[k])
                        .with("se", f.fit.se[k])
                        .with("lo", lo)
                        .with("hi", hi)
                })
                .collect();
            j = j.with(
                "model",
                Json::obj()
                    .with("converged", f.fit.converged)
                    .with("loglik", f.fit.loglik)
                    .with("timeouts", f.timeouts)
                    .with("coefficients", coef)
                    .with(
                        "importance",
                        f.importance
                            .iter()
                            .map(|(n, l)| Json::obj().with("setting", *n).with("loglik_lost", *l))
                            .collect::<Vec<_>>(),
                    )
                    .with("planted_effect", f.planted_effect)
                    .with(
                        "correlations",
                        Json::obj()
                            .with("features", f.corr.0.clone())
                            .with("matrix", f.corr.1.to_vec()),
                    ),
            );
        }
        let bins_json: Vec<Json> = bins
            .iter()
            .map(|b| {
                let side = |v: &[(usize, usize)]| {
                    v.iter()
                        .zip(b.setting.labels(self.batch.first_max))
                        .map(|(c, l)| Json::obj().with("bin", l).with("won", c.0).with("of", c.1))
                        .collect::<Vec<_>>()
                };
                Json::obj()
                    .with("setting", b.setting.name())
                    .with("all", side(&b.all))
                    .with("short", side(&b.short))
                    .with("long", side(&b.long))
            })
            .collect();
        j = j.with("bins", bins_json);
        if let Some((on, off, lo, hi, n)) = direct(self) {
            j = j.with(
                "direct_check",
                Json::obj()
                    .with("pairs", n)
                    .with("on", on)
                    .with("off", off)
                    .with("lo", lo)
                    .with("hi", hi),
            );
        }
        j.with("games", games)
    }

    pub fn markdown(&self, header: &str) -> String {
        let mut s = format!(
            "# Plans: {}\n\n{header}\n\n",
            if self.batch.plant {
                "the planted control"
            } else {
                "random plans"
            }
        );
        s += &format!(
            "Each AI seat plays Medium with its own plan{}: workers 8 to 20, the first wave 2:00 to {}, expanding 3:00 to 12:00 or (one in five) never, a placebo coin",
            if self.batch.tide {
                ", with the tide"
            } else {
                ""
            },
            mmss(self.batch.first_max)
        );
        s += if self.batch.plant {
            ", and a planted coin that raises its income 10%.\n\n"
        } else {
            ", and a planted coin (inert in this run: a second placebo).\n\n"
        };
        let Some(f) = findings(self) else {
            return s
                + "The model could not be fitted (too few games, or a column without variation).\n";
        };
        s += &format!(
            "{} games, {} timeouts left out of the model. The outcome: the first seat wins. Each setting enters as the first seat's value less the second's (the times and workers in standard deviations of a seat's draw).\n\n## The model\n\n| Feature | Coefficient (log-odds) | 95% interval | |\n| --- | --- | --- | --- |\n",
            self.games.len(),
            f.timeouts
        );
        for k in 0..f.names.len() {
            let (lo, hi) = f.fit.interval(k);
            let verdict = if lo > 0.0 || hi < 0.0 {
                "beyond zero"
            } else {
                "holds zero"
            };
            s += &format!(
                "| {} | {:+.3} | {:+.3} to {:+.3} | {verdict} |\n",
                f.names[k], f.fit.beta[k], lo, hi
            );
        }
        s += "\n**Importance** (log-likelihood lost when a setting's columns are left out; larger matters more):\n\n| Setting | Log-likelihood lost |\n| --- | --- |\n";
        for (n, l) in &f.importance {
            s += &format!("| {n} | {l:.2} |\n");
        }
        let maxr = f
            .corr
            .1
            .iter()
            .enumerate()
            .flat_map(|(i, r)| {
                r.iter()
                    .enumerate()
                    .filter(move |(j, _)| *j != i)
                    .map(|(_, v)| v.abs())
            })
            .fold(0.0, f64::max);
        s += &format!(
            "\n**Independence of the draws:** the largest correlation between two settings' columns is {maxr:.3} (near zero by design).\n\n| | {} |\n| --- |{}\n",
            f.corr.0.join(" | "),
            " --- |".repeat(f.corr.0.len())
        );
        for (i, r) in f.corr.1.iter().enumerate() {
            s += &format!(
                "| {} | {} |\n",
                f.corr.0[i],
                r.iter()
                    .map(|v| format!("{v:+.3}"))
                    .collect::<Vec<_>>()
                    .join(" | ")
            );
        }
        let (bins, split) = bins(self);
        s += &format!(
            "\n## Win rate by setting\n\nA seat's own setting and whether it won (each finished game counts both seats). Short and long: games under and over the median finished length, {}.\n",
            mmss(split)
        );
        for b in &bins {
            s += &format!(
                "\n**{}**\n\n| Bin | All games | Short games | Long games |\n| --- | --- | --- | --- |\n",
                b.setting.name()
            );
            for (i, l) in b.setting.labels(self.batch.first_max).iter().enumerate() {
                s += &format!(
                    "| {l} | {} | {} | {} |\n",
                    rate(b.all[i]),
                    rate(b.short[i]),
                    rate(b.long[i])
                );
            }
        }
        s += &self.first_wave_markdown();
        s += "\n## The controls\n\n";
        let (plo, phi) = f.fit.interval(5);
        s += &format!(
            "- **Placebo:** {:+.3} ({plo:+.3} to {phi:+.3}): {}.\n",
            f.fit.beta[5],
            if plo <= 0.0 && 0.0 <= phi {
                "its interval holds zero, as it must"
            } else {
                "**outside zero**: a sound method gives that about one run in twenty; rerun with another `--seed` before doubting the method"
            }
        );
        if self.batch.plant {
            let (lo, hi) = f.fit.interval(6);
            let found = lo > 0.0;
            let above = f.importance[4].1 > f.importance[3].1;
            s += &format!(
                "- **Planted (+10% income):** {:+.3} ({lo:+.3} to {hi:+.3}): {}; {} the placebo in importance. The model's average effect of the bonus on the first seat's chance: {:+.1} points.\n",
                f.fit.beta[6],
                if found {
                    "found, the right sign"
                } else {
                    "**not found**"
                },
                if above { "above" } else { "**not above**" },
                100.0 * f.planted_effect
            );
            if let Some((on, off, dlo, dhi, n)) = direct(self) {
                let within = dlo <= f.planted_effect && f.planted_effect <= dhi;
                s += &format!(
                    "- **Direct check:** {n} setups played twice, seat 0 planted, the bonus on then off: seat 0 won {:.1}% against {:.1}%, a difference of {:+.1} points ({:+.1} to {:+.1}). The model's {:+.1} points is {}. (A pair counts when both its games finished; the model's figure averages over the batch's finished games, so the two cover slightly different games.)\n",
                    100.0 * on,
                    100.0 * off,
                    100.0 * (on - off),
                    100.0 * dlo,
                    100.0 * dhi,
                    100.0 * f.planted_effect,
                    if within {
                        "within it"
                    } else {
                        "**outside it**"
                    }
                );
            }
        } else {
            let (lo, hi) = f.fit.interval(6);
            s += &format!(
                "- **Planted coin (inert here):** {:+.3} ({lo:+.3} to {hi:+.3}): {}.\n",
                f.fit.beta[6],
                if lo <= 0.0 && 0.0 <= hi {
                    "holds zero, as an inert coin must"
                } else {
                    "**outside zero**: about one run in twenty for a sound method; rerun with another `--seed`"
                }
            );
        }
        if !f.fit.converged {
            s += "\n**The fit did not converge**: read the coefficients with care.\n";
        }
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_same_seed_gives_the_same_plans_and_the_same_bytes() {
        let b = PlanBatch {
            games: 8,
            maps: vec![MapKind::Standard, MapKind::Shore],
            seed: 3,
            plant: true,
            check: 2,
            cap_min: 2,
            first_max: FIRST_MAX,
            tide: false,
        };
        let (a, c) = (setups(&b), setups(&b));
        assert_eq!(
            a.iter().map(|s| s.plans).collect::<Vec<_>>(),
            c.iter().map(|s| s.plans).collect::<Vec<_>>()
        );
        let other = setups(&PlanBatch {
            seed: 4,
            ..b.clone()
        });
        assert_ne!(a[0].plans, other[0].plans, "another seed, other plans");
        // every seating and map in the first eight games
        let seen: std::collections::BTreeSet<String> = a
            .iter()
            .map(|s| format!("{:?} {}", s.map, s.pairing))
            .collect();
        assert_eq!(seen.len(), 8);
        let quiet = |_: usize, _: usize| {};
        let one = run(b.clone(), "test", 1, &quiet).json().write();
        let three = run(b, "test", 3, &quiet).json().write();
        assert_eq!(one, three, "the same bytes on one thread or three");
    }

    /// The report's bytes, model and direct check included, from a run with synthetic results (no games played): the
    /// same run, the same bytes, and the model is there.
    #[test]
    fn the_report_with_its_model_is_the_same_bytes_twice() {
        let b = PlanBatch {
            games: 400,
            plant: true,
            check: 40,
            ..PlanBatch::default_batch()
        };
        let setups = setups(&b);
        let mut r = Mulberry32::new(5);
        let mut u = || r.next_u32() as f64 / 4_294_967_296.0;
        // (the first seat wins more often with more workers: something for the model to find)
        let mut result = |s: &Setup| {
            let edge = (s.plans[0].harv as f64 - s.plans[1].harv as f64) * 0.05;
            Played {
                winner: if u() < 0.03 {
                    None
                } else {
                    Some((u() > 0.5 + edge) as u8)
                },
                end_tick: 9000 + (u() * 18000.0) as u32,
                first_wave: [None, None],
            }
        };
        let games: Vec<Played> = setups.iter().map(&mut result).collect();
        let check: Vec<(Setup, Played, Played)> = setups
            .iter()
            .take(b.check)
            .map(|&s| (s, result(&s), result(&s)))
            .collect();
        let make = || PlanRun {
            batch: b.clone(),
            commit: "test".into(),
            setups: setups.clone(),
            games: games.clone(),
            check: check.clone(),
        };
        let (one, two) = (make().json().write(), make().json().write());
        assert_eq!(one, two, "the same run, the same bytes");
        for key in [
            "\"model\"",
            "\"coefficients\"",
            "\"direct_check\"",
            "\"correlations\"",
        ] {
            assert!(one.contains(key), "the report has {key}");
        }
        let md = make().markdown("test");
        assert!(md.contains("## The model") && md.contains("Direct check"));
    }

    #[test]
    fn plans_keep_to_their_ranges_and_the_planted_bonus_only_in_the_control_run() {
        let mut r = Mulberry32::new(9);
        let plans: Vec<Plan> = (0..2000).map(|_| Plan::draw(&mut r, FIRST_MAX)).collect();
        assert!(plans.iter().all(|p| (8..=20).contains(&p.harv)));
        assert!(plans.iter().all(|p| (120.0..420.0).contains(&p.first)));
        assert!(
            plans
                .iter()
                .all(|p| p.never() || (180.0..720.0).contains(&p.expand_at))
        );
        let never = plans.iter().filter(|p| p.never()).count();
        assert!(
            (300..500).contains(&never),
            "one in five never expands: {never}"
        );
        let p = Plan {
            planted: true,
            ..plans[0]
        };
        assert_eq!(p.diff(false).income, DIFF[BASE].income);
        assert_eq!(p.diff(true).income, DIFF[BASE].income * PLANT);
        assert_eq!(
            Plan {
                planted: false,
                ..p
            }
            .diff(true)
            .income,
            DIFF[BASE].income
        );
        // everything but the plan's settings is Medium's
        assert_eq!(p.diff(false).gap, DIFF[BASE].gap);
    }

    #[test]
    fn a_later_first_max_draws_later_waves_into_more_bins() {
        // The default range draws the same plans as before the flag (the same draws from the same seed).
        let (mut a, mut b) = (Mulberry32::new(9), Mulberry32::new(9));
        let wide: Vec<Plan> = (0..2000).map(|_| Plan::draw(&mut a, 720.0)).collect();
        let base: Vec<Plan> = (0..2000).map(|_| Plan::draw(&mut b, FIRST_MAX)).collect();
        assert!(wide.iter().all(|p| (120.0..720.0).contains(&p.first)));
        assert!(wide.iter().any(|p| p.first > 660.0), "up to 12:00");
        // only the first wave's time differs, so the other settings match draw for draw
        assert!(
            wide.iter()
                .zip(&base)
                .all(|(w, b)| w.harv == b.harv && w.expand_at == b.expand_at)
        );
        // pinned to the formula before `--first-max` existed: the draws in order, the first wave 120 + u x 300
        let mut r = Mulberry32::new(1);
        let u: Vec<f64> = (0..6)
            .map(|_| r.next_u32() as f64 / 4_294_967_296.0)
            .collect();
        let p = Plan::draw(&mut Mulberry32::new(1), FIRST_MAX);
        assert_eq!(p.harv, 8 + (u[0] * 13.0) as usize);
        assert_eq!(p.first.to_bits(), (120.0 + u[1] * 300.0).to_bits());
        assert_eq!((p.placebo, p.planted), (u[4] < 0.5, u[5] < 0.5));
        assert_eq!(
            Setting::FirstWave.labels(FIRST_MAX),
            ["2:00-3:15", "3:15-4:30", "4:30-5:45", "5:45-7:00"]
        );
        let l = Setting::FirstWave.labels(720.0);
        assert_eq!(l.len(), 8);
        assert_eq!((l[0].as_str(), l[7].as_str()), ("2:00-3:15", "10:45-12:00"));
        let late = Plan {
            first: 719.0,
            ..base[0]
        };
        assert_eq!(Setting::FirstWave.bin(&late, 720.0), 7);
        assert_eq!(
            Setting::FirstWave.bin(&late, FIRST_MAX),
            3,
            "the default's last bin holds anything later"
        );
        // a range that does not end on a bin's edge: the last bin ends at the range's end
        assert_eq!(
            Setting::FirstWave.labels(400.0).last().unwrap(),
            "5:45-6:40"
        );
    }
}
