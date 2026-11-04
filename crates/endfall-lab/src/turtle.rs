//! `turtle`: a Medium AI seat that never launches a wave (its plan: Medium's tuning with `first` = never) against
//! plain Medium (PRD: the tide on the Shore map, R8). Every pairing of the peoples, the turtle in either seat, the
//! same map seeds in every cell. A turtle that does not lose is Medium's weakness, before any tide: the tide's
//! "a turtling bot loses over 70%" row is read against this baseline.

use crate::json::Json;
use crate::plans::{BASE, PAIRINGS, Played, play_jobs, play_seats};
use crate::stats::{median, mmss, wilson};
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
}

impl TurtleBatch {
    pub fn default_batch() -> Self {
        TurtleBatch {
            maps: vec![MapKind::Shore],
            seeds: 25,
            cap_min: 30,
        }
    }
}

/// The turtle's tuning: Medium's, never launching a wave (it still builds, defends and expands as Medium does).
pub fn turtle() -> Diff {
    Diff {
        first: NEVER,
        ..DIFF[BASE]
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
}

pub fn run(
    batch: TurtleBatch,
    commit: &str,
    threads: usize,
    progress: &(dyn Fn(usize, usize) + Sync),
) -> TurtleRun {
    let cells = cells(&batch);
    let cap = batch.cap_min;
    let games = play_jobs(
        &cells,
        |c| {
            let mut plans = [None, None];
            plans[c.turtle] = Some(turtle());
            play_seats(c.map, c.pairing, c.map_seed, plans, cap)
        },
        threads,
        progress,
    );
    TurtleRun {
        batch,
        commit: commit.to_string(),
        cells,
        games,
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
            .map(|(c, p)| {
                Json::obj()
                    .with("map", format!("{:?}", c.map))
                    .with("turtle", PEOPLE[c.peoples().0])
                    .with("against", PEOPLE[c.peoples().1])
                    .with("turtle_seat", c.turtle)
                    .with("map_seed", c.map_seed)
                    .with("winner", p.winner.map(|w| w as u32))
                    .with("end_tick", p.end_tick)
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
                    .with("cap_min", self.batch.cap_min),
            )
            .with("rows", rows)
            .with("games", games)
    }

    pub fn markdown(&self, header: &str) -> String {
        let mut s = format!(
            "# The turtle\n\n{header}\n\nA Medium AI seat that never launches a wave (Medium's tuning, `first` = never: it still builds, defends and expands) against plain Medium, each pairing of the peoples with the turtle in either seat, map seeds 1 to {}. A timeout counts as not lost. The tide's gate wants a turtle to lose over 70%; this is the baseline before the tide.\n\n| Games | Played | Turtle lost (95%) | Turtle won | Timeouts | Median length of a loss |\n| --- | --- | --- | --- | --- | --- |\n",
            self.batch.seeds
        );
        for (label, t) in self.rows() {
            s += &t.row(&label);
        }
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_turtle_is_medium_that_never_attacks() {
        let t = turtle();
        assert_eq!(t.first, NEVER);
        assert_eq!(
            Diff {
                first: DIFF[BASE].first,
                ..t
            },
            DIFF[BASE]
        );
    }

    #[test]
    fn every_pairing_and_seat_on_the_same_seeds_and_the_same_bytes() {
        let b = TurtleBatch {
            maps: vec![MapKind::Shore],
            seeds: 1,
            cap_min: 2,
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
        assert!(md.contains("**Shore, all**"));
    }
}
