//! `turtle`: a Medium AI seat that never attacks against plain Medium (PRD: the tide on the Shore map, R8). Its plan
//! is Medium's tuning with `first` = never (no wave ever launches) and no raids (Medium's flyers otherwise hunt the
//! enemy's workers whatever the waves); `--raids` keeps the raids, the PRD's letter (`first` = never alone). Every
//! pairing of the peoples, the turtle in either seat, the same map seeds in every cell. A turtle that does not lose is
//! Medium's weakness, before any tide: the tide's "a turtling bot loses over 70%" row is read against this baseline.

use crate::json::Json;
use crate::minutes::{self, Sample};
use crate::plans::{BASE, PAIRINGS, Played, play_jobs, play_watched};
use crate::stats::{median, mmss, wilson};
use crate::waves::{self, TABLE_HEAD, Wave};
use endfall_sim::data::{DIFF, Diff, NEVER};
use endfall_sim::map::MapKind;

const TPS: f64 = 30.0;
const PEOPLE: [&str; 2] = ["Humans", "Vael"];

/// What the batch plays.
#[derive(Clone, Debug)]
pub struct TurtleBatch {
    pub maps: Vec<MapKind>,
    /// Map seeds 1 to this, in every cell.
    pub seeds: u32,
    pub cap_min: u32,
    /// The turtle keeps Medium's raids (flyers hunting the enemy's workers).
    pub raids: bool,
    /// The attacker's income multiplier (`Diff::income`; None: plain Medium's): the ceiling test, whether more income
    /// alone breaks the turtle.
    pub attacker_income: Option<f64>,
    /// The attacker's `Diff::fog_factor` (None: its level's).
    pub attacker_fog: Option<f64>,
    /// The weak turtle (`weak_turtle`; the gate's newcomers row): Easy's economy, no expansion.
    pub weak: bool,
}

impl TurtleBatch {
    pub fn default_batch() -> Self {
        TurtleBatch {
            maps: vec![MapKind::Shore],
            seeds: 25,
            cap_min: 30,
            raids: false,
            attacker_income: None,
            attacker_fog: None,
            weak: false,
        }
    }
}

/// The turtle's tuning: Medium's, never launching a wave and (unless `raids`) never raiding; it still builds, defends
/// and expands as Medium does.
pub fn turtle(raids: bool) -> Diff {
    Diff {
        first: NEVER,
        raids: raids && DIFF[BASE].raids,
        ..DIFF[BASE]
    }
}

/// The weak turtle (PRD: the AI breaks a defence, the gate's newcomers row): the turtle on Easy's economy (its
/// workers, factories and income) that never takes a second base; it still builds its towers and defends.
pub fn weak_turtle() -> Diff {
    let easy = DIFF[0];
    Diff {
        income: easy.income,
        harv: easy.harv,
        rax: easy.rax,
        extra_rax: easy.extra_rax,
        vents_from: easy.vents_from,
        expand_at: NEVER,
        expands_when_dry: false,
        passive_expand: NEVER,
        max_bases: 1,
        ..turtle(false)
    }
}

/// One game: its map, seating (`PAIRINGS`), the turtle's seat, its map seed.
#[derive(Clone, Copy, Debug)]
pub struct Cell {
    pub map: MapKind,
    pub pairing: usize,
    pub turtle: usize,
    pub map_seed: u32,
}

impl Cell {
    /// The turtle's people and its opponent's (indices into `PEOPLE`).
    fn peoples(&self) -> (usize, usize) {
        let p = PAIRINGS[self.pairing];
        (p[self.turtle], p[1 - self.turtle])
    }
    /// Each seat's plan: the turtle's on its seat, plain Medium (no plan) on the other, or Medium with
    /// `attacker_income` for its income.
    fn plans(&self, b: &TurtleBatch) -> [Option<Diff>; 2] {
        let (raids, attacker_income) = (b.raids, b.attacker_income);
        let mut plans = [None, None];
        plans[self.turtle] = Some(if b.weak { weak_turtle() } else { turtle(raids) });
        plans[1 - self.turtle] =
            (attacker_income.is_some() || b.attacker_fog.is_some()).then(|| Diff {
                income: attacker_income.unwrap_or(DIFF[BASE].income),
                fog_factor: b.attacker_fog.unwrap_or(DIFF[BASE].fog_factor),
                ..DIFF[BASE]
            });
        plans
    }
}

/// Every game, in a fixed order: map, seating, the turtle's seat, map seed.
pub fn cells(b: &TurtleBatch) -> Vec<Cell> {
    let mut v = Vec::new();
    for &map in &b.maps {
        for pairing in 0..PAIRINGS.len() {
            for turtle in 0..2 {
                for map_seed in 1..=b.seeds {
                    v.push(Cell {
                        map,
                        pairing,
                        turtle,
                        map_seed,
                    });
                }
            }
        }
    }
    v
}

pub struct TurtleRun {
    pub batch: TurtleBatch,
    pub commit: String,
    pub cells: Vec<Cell>,
    pub games: Vec<Played>,
    /// Each game's attack waves (`waves::Watch`), both seats'.
    pub waves: Vec<Vec<Wave>>,
    /// Each game's seats minute by minute (`minutes::Minutes`).
    pub minutes: Vec<Vec<[Sample; 2]>>,
}

pub fn run(
    batch: TurtleBatch,
    commit: &str,
    threads: usize,
    progress: &(dyn Fn(usize, usize) + Sync),
) -> TurtleRun {
    let cells = cells(&batch);
    let cap = batch.cap_min;
    let (mut games, mut waves, mut mins) = (vec![], vec![], vec![]);
    let played = play_jobs(
        &cells,
        |c| play_watched(c.map, c.pairing, c.map_seed, c.plans(&batch), cap, false),
        threads,
        progress,
    );
    for (p, w, m) in played {
        games.push(p);
        waves.push(w);
        mins.push(m);
    }
    TurtleRun {
        batch,
        commit: commit.to_string(),
        cells,
        games,
        waves,
        minutes: mins,
    }
}

/// A group of games' tally from the turtle's side: lost, won, timeouts, and the lengths of the games it lost (s).
#[derive(Default)]
struct Tally {
    lost: usize,
    won: usize,
    timeouts: usize,
    lost_at: Vec<f64>,
}

impl Tally {
    fn add(&mut self, c: &Cell, p: &Played) {
        match p.winner {
            None => self.timeouts += 1,
            Some(w) if w as usize == c.turtle => self.won += 1,
            Some(_) => {
                self.lost += 1;
                self.lost_at.push(p.end_tick as f64 / TPS);
            }
        }
    }
    fn games(&self) -> usize {
        self.lost + self.won + self.timeouts
    }
    /// The share of games the turtle lost (a timeout counts as not lost), with its 95% interval.
    fn loss_rate(&self) -> (f64, f64, f64) {
        let n = self.games();
        let (lo, hi) = wilson(self.lost, n);
        (self.lost as f64 / n.max(1) as f64, lo, hi)
    }
    fn json(&self) -> Json {
        let (r, lo, hi) = self.loss_rate();
        Json::obj()
            .with("games", self.games())
            .with("turtle_lost", self.lost)
            .with("turtle_won", self.won)
            .with("timeouts", self.timeouts)
            .with("loss_rate", r)
            .with("lo", lo)
            .with("hi", hi)
            .with("median_loss_s", median(&self.lost_at))
    }
    fn row(&self, label: &str) -> String {
        let (r, lo, hi) = self.loss_rate();
        format!(
            "| {label} | {} | {:.0}% ({:.0}–{:.0}%) | {} | {} | {} |\n",
            self.games(),
            100.0 * r,
            100.0 * lo,
            100.0 * hi,
            self.won,
            self.timeouts,
            median(&self.lost_at).map_or("—".into(), mmss)
        )
    }
}

impl TurtleRun {
    /// The rows: per map, each pairing of peoples with the turtle first and second, then both orders; then each
    /// map's whole, and the whole batch.
    fn rows(&self) -> Vec<(String, Tally)> {
        let mut rows = Vec::new();
        let tally = |f: &dyn Fn(&Cell) -> bool| {
            let mut t = Tally::default();
            for (c, p) in self.cells.iter().zip(&self.games) {
                if f(c) {
                    t.add(c, p);
                }
            }
            t
        };
        for &map in &self.batch.maps {
            for (tp, turtle) in PEOPLE.iter().enumerate() {
                for (op, against) in PEOPLE.iter().enumerate() {
                    let who = format!("{map:?}: a {turtle} turtle against {against} Medium");
                    for seat in 0..2 {
                        rows.push((
                            format!("{who}, the turtle in seat {}", seat + 1),
                            tally(&|c| c.map == map && c.peoples() == (tp, op) && c.turtle == seat),
                        ));
                    }
                    rows.push((
                        format!("**{who}**"),
                        tally(&|c| c.map == map && c.peoples() == (tp, op)),
                    ));
                }
            }
            rows.push((format!("**{map:?}, all**"), tally(&|c| c.map == map)));
        }
        if self.batch.maps.len() > 1 {
            rows.push(("**All maps**".into(), tally(&|_| true)));
        }
        rows
    }

    /// The attacker's waves (the plain Medium seat's, against the turtle), by map and its people, then in all.
    fn attack_groups(&self) -> Vec<(String, Vec<&Wave>)> {
        let attacks = |keep: &dyn Fn(&Cell) -> bool| {
            let mut v: Vec<&Wave> = vec![];
            for (c, ws) in self.cells.iter().zip(&self.waves) {
                if keep(c) {
                    v.extend(ws.iter().filter(|w| w.seat as usize != c.turtle));
                }
            }
            v
        };
        let mut rows = vec![];
        for &map in &self.batch.maps {
            for (p, people) in PEOPLE.iter().enumerate() {
                rows.push((
                    format!("{map:?}: {people} Medium's waves"),
                    attacks(&|c| c.map == map && c.peoples().1 == p),
                ));
            }
        }
        rows.push(("**All**".into(), attacks(&|_| true)));
        rows
    }

    fn wave_rows(&self) -> Vec<(String, waves::Summary)> {
        self.attack_groups()
            .into_iter()
            .map(|(l, v)| (l, waves::summary(v)))
            .collect()
    }

    fn check_rows(&self) -> Vec<(String, waves::Checks)> {
        self.attack_groups()
            .into_iter()
            .map(|(l, v)| (l, waves::checks(v)))
            .collect()
    }

    /// Minute by minute, by map and pairing (then by map): of the games still on at that minute, the medians of the
    /// attacker's and the turtle's income a minute (over the five minutes before), workers, bases, army and supply.
    fn minute_rows(&self) -> Vec<(String, Vec<String>)> {
        let mut out = vec![];
        let group = |keep: &dyn Fn(&Cell) -> bool| -> Vec<String> {
            let mut lines = vec![];
            for m in [5usize, 10, 15, 20, 25, 30] {
                let (mut on, mut inc, mut wk, mut bs, mut ar, mut sp) = (
                    0,
                    [vec![], vec![]],
                    [vec![], vec![]],
                    [vec![], vec![]],
                    [vec![], vec![]],
                    [vec![], vec![]],
                );
                for (c, at) in self.cells.iter().zip(&self.minutes) {
                    if !keep(c) || at.len() < m {
                        continue;
                    }
                    on += 1;
                    let a = 1 - c.turtle; // the attacker's seat
                    for (k, seat) in [a, c.turtle].into_iter().enumerate() {
                        let x = at[m - 1][seat];
                        inc[k].push(minutes::income(at, m, seat).unwrap_or(0.0));
                        wk[k].push(x.workers as f64);
                        bs[k].push(x.bases as f64);
                        ar[k].push(x.army);
                        sp[k].push(x.supply as f64);
                    }
                }
                if on == 0 {
                    continue;
                }
                let pair = |v: &[Vec<f64>; 2], d: usize| {
                    let f = |x: &Vec<f64>| median(x).map_or("—".into(), |y| format!("{y:.d$}"));
                    format!("{} / {}", f(&v[0]), f(&v[1]))
                };
                lines.push(format!(
                    "| {m}:00 | {on} | {} | {} | {} | {} | {} |\n",
                    pair(&inc, 0),
                    pair(&wk, 0),
                    pair(&bs, 1),
                    pair(&ar, 0),
                    pair(&sp, 0)
                ));
            }
            lines
        };
        for &map in &self.batch.maps {
            for (tp, turtle) in PEOPLE.iter().enumerate() {
                for (ap, against) in PEOPLE.iter().enumerate() {
                    out.push((
                        format!("{map:?}: {against} Medium against a {turtle} turtle"),
                        group(&|c| c.map == map && c.peoples() == (tp, ap)),
                    ));
                }
            }
            out.push((format!("{map:?}, all"), group(&|c| c.map == map)));
        }
        out
    }

    pub fn json(&self) -> Json {
        let rows: Vec<Json> = self
            .rows()
            .iter()
            .map(|(l, t)| t.json().with("row", l.replace("**", "")))
            .collect();
        let games: Vec<Json> = self
            .cells
            .iter()
            .zip(&self.games)
            .zip(&self.waves)
            .zip(&self.minutes)
            .map(|(((c, p), ws), mins)| {
                Json::obj()
                    .with("map", format!("{:?}", c.map))
                    .with("turtle", PEOPLE[c.peoples().0])
                    .with("against", PEOPLE[c.peoples().1])
                    .with("turtle_seat", c.turtle)
                    .with("map_seed", c.map_seed)
                    .with("winner", p.winner.map(|w| w as u32))
                    .with("end_tick", p.end_tick)
                    .with("waves", ws.iter().map(Wave::json).collect::<Vec<_>>())
                    .with(
                        "minutes",
                        mins.iter()
                            .map(|m| m.iter().map(Sample::json).collect::<Vec<_>>())
                            .collect::<Vec<_>>(),
                    )
            })
            .collect();
        Json::obj()
            .with("lab", "turtle")
            .with("commit", self.commit.as_str())
            .with(
                "batch",
                Json::obj()
                    .with(
                        "maps",
                        self.batch
                            .maps
                            .iter()
                            .map(|m| format!("{m:?}"))
                            .collect::<Vec<_>>(),
                    )
                    .with("seeds", self.batch.seeds)
                    .with("cap_min", self.batch.cap_min)
                    .with("raids", self.batch.raids)
                    .with("attacker_income", self.batch.attacker_income)
                    .with("attacker_fog", self.batch.attacker_fog)
                    .with("weak", self.batch.weak),
            )
            .with("rows", rows)
            .with(
                "waves",
                self.wave_rows()
                    .iter()
                    .map(|(l, w)| w.json().with("row", l.replace("**", "")))
                    .collect::<Vec<_>>(),
            )
            .with(
                "checks",
                self.check_rows()
                    .iter()
                    .map(|(l, c)| c.json().with("row", l.replace("**", "")))
                    .collect::<Vec<_>>(),
            )
            .with("games", games)
    }

    pub fn markdown(&self, header: &str) -> String {
        let mut s = format!(
            "# The turtle{}\n\n{header}\n\nA Medium AI seat that never launches a wave (Medium's tuning, `first` = never{}; it still builds, defends and expands) against plain Medium, each pairing of the peoples with the turtle in either seat, map seeds 1 to {}. A timeout counts as not lost. The tide's gate wants a turtle to lose over 70%; this is the baseline before the tide.\n\n| Turtle | Games | Turtle lost (95%) | Turtle won | Timeouts | Median length of a loss |\n| --- | --- | --- | --- | --- | --- |\n",
            if self.batch.raids {
                " that raids"
            } else if self.batch.weak {
                ": the weak one (Easy's economy, one base)"
            } else {
                ""
            },
            if self.batch.raids {
                ", keeping Medium's raids: its flyers hunt the enemy's workers"
            } else {
                ", and no raids: it never attacks"
            },
            self.batch.seeds
        );
        for (label, t) in self.rows() {
            s += &t.row(&label);
        }
        s += &format!(
            "\n## The attacker's waves\n\nEach wave of the plain Medium seat against the turtle: when it arrived (a unit within {} tiles of a turtle's building), its value near that unit (within the same tiles) over the defence's there (armed units and armed buildings within {} tiles of that unit; shards plus ether at 1.5), its result (the value of what fell near its units over what it lost while out), and where it lost its units.\n\n{TABLE_HEAD}",
            waves::REACH,
            waves::REACH
        );
        for (label, w) in self.wave_rows() {
            s += &w.row(&label);
        }
        s += &format!(
            "\n## Why the waves went\n\nThe attacker's own check as each wave went (`LaunchWhy`), the foe army it expected over the turtle's true army then (armed units, workers left out; the waves that went against an expectation), the wave's worth over that true army, and the share of the wave's value within {} tiles of its first unit to arrive.\n\n{}",
            waves::REACH,
            waves::CHECKS_HEAD
        );
        for (label, c) in self.check_rows() {
            s += &c.row(&label);
        }
        s += "\n## Minute by minute\n\nOf the games still on at each minute, the medians, attacker / turtle: income a minute (shards plus ether at 1.5, mined over the five minutes before), workers, finished bases, army worth (armed units) and supply used.\n";
        for (label, lines) in self.minute_rows() {
            s += &format!(
                "\n**{label}**\n\n| Minute | Games on | Income a minute | Workers | Bases | Army | Supply |\n| --- | --- | --- | --- | --- | --- | --- |\n"
            );
            for l in lines {
                s += &l;
            }
        }
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_turtle_is_medium_that_never_attacks_and_raids_only_when_asked() {
        let t = turtle(false);
        assert_eq!((t.first, t.raids), (NEVER, false));
        assert!(DIFF[BASE].raids, "Medium raids: the switch matters");
        assert!(turtle(true).raids);
        // everything else is Medium's
        let medium = DIFF[BASE];
        assert_eq!(
            Diff {
                first: medium.first,
                raids: medium.raids,
                ..t
            },
            medium
        );
    }

    #[test]
    fn the_weak_turtle_has_easys_economy_on_one_base_and_never_attacks() {
        let w = weak_turtle();
        assert_eq!(
            (w.harv, w.rax, w.income),
            (DIFF[0].harv, DIFF[0].rax, DIFF[0].income)
        );
        assert_eq!(
            (w.expand_at, w.passive_expand, w.max_bases),
            (NEVER, NEVER, 1)
        );
        assert!(!w.expands_when_dry && !w.raids);
        assert_eq!(w.first, NEVER, "it never attacks");
    }

    #[test]
    fn the_turtle_plays_its_own_seat_against_plain_medium() {
        let b = TurtleBatch::default_batch();
        for c in cells(&b) {
            let p = c.plans(&b);
            assert_eq!(p[c.turtle], Some(turtle(false)));
            assert_eq!(p[1 - c.turtle], None, "the other seat plays its level");
            let rich = TurtleBatch {
                attacker_income: Some(1.3),
                ..b.clone()
            };
            let rich = c.plans(&rich)[1 - c.turtle].expect("the attacker's plan");
            assert_eq!(
                rich.income, 1.3,
                "the ceiling test: Medium with more income"
            );
            assert_eq!(
                Diff {
                    income: DIFF[BASE].income,
                    ..rich
                },
                DIFF[BASE]
            );
        }
    }

    /// The tallies on made-up results: a win is the turtle's seat winning, a timeout is not lost, each row its games.
    #[test]
    fn the_rows_count_from_the_turtles_side() {
        let b = TurtleBatch {
            seeds: 3,
            ..TurtleBatch::default_batch()
        };
        let cells = cells(&b);
        // seed 1: seat 0 wins at 10:00; seed 2: seat 1 wins at 20:00; seed 3: a timeout
        let games: Vec<Played> = cells
            .iter()
            .map(|c| match c.map_seed {
                1 => Played {
                    winner: Some(0),
                    end_tick: 18_000,
                    first_wave: [None, None],
                },
                2 => Played {
                    winner: Some(1),
                    end_tick: 36_000,
                    first_wave: [None, None],
                },
                _ => Played {
                    winner: None,
                    end_tick: 54_000,
                    first_wave: [None, None],
                },
            })
            .collect();
        let r = TurtleRun {
            batch: b,
            commit: "test".into(),
            cells,
            waves: vec![vec![]; games.len()],
            minutes: vec![vec![]; games.len()],
            games,
        };
        let rows = r.rows();
        let row = |l: &str| &rows.iter().find(|(k, _)| k == l).expect(l).1;
        // the turtle in seat 1 won seed 1 and lost seed 2; in seat 2 the other way round
        let first = row("Shore: a Humans turtle against Vael Medium, the turtle in seat 1");
        assert_eq!((first.won, first.lost, first.timeouts), (1, 1, 1));
        assert_eq!(first.lost_at, vec![1200.0], "lost at 20:00");
        let second = row("Shore: a Humans turtle against Vael Medium, the turtle in seat 2");
        assert_eq!((second.won, second.lost, second.timeouts), (1, 1, 1));
        assert_eq!(second.lost_at, vec![600.0], "lost at 10:00");
        let all = row("**Shore, all**");
        assert_eq!(
            (all.won, all.lost, all.timeouts, all.games()),
            (8, 8, 8, 24)
        );
        let (rate, lo, hi) = all.loss_rate();
        assert!((rate - 1.0 / 3.0).abs() < 1e-12 && lo < rate && rate < hi);
        assert!(r.markdown("test").contains("| **Shore, all** | 24 | 33% "));
    }

    #[test]
    fn every_pairing_and_seat_on_the_same_seeds_and_the_same_bytes() {
        let b = TurtleBatch {
            maps: vec![MapKind::Shore],
            seeds: 1,
            cap_min: 2,
            raids: false,
            attacker_income: None,
            attacker_fog: None,
            weak: false,
        };
        let c = cells(&b);
        assert_eq!(c.len(), 8, "four seatings, the turtle in either seat");
        let peoples: std::collections::BTreeSet<_> =
            c.iter().map(|c| (c.peoples(), c.turtle)).collect();
        assert_eq!(
            peoples.len(),
            8,
            "each people's turtle against each, first and second"
        );
        let quiet = |_: usize, _: usize| {};
        let one = run(b.clone(), "test", 1, &quiet).json().write();
        let three = run(b.clone(), "test", 3, &quiet).json().write();
        assert_eq!(one, three, "the same bytes on one thread or three");
        let md = run(b, "test", 2, &quiet).markdown("test");
        assert!(md.contains("a Vael turtle against Humans Medium, the turtle in seat 2"));
        assert!(md.contains("no raids: it never attacks"));
    }
}
