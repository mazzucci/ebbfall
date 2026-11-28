//! `compare`: two reports' JSON side by side: what moved, and whether it moved more than the noise. When both
//! reports hold games on the same seeds (each game's record keeps its seed and winner), the comparison is paired:
//! each matchup's games are matched seed for seed, both seatings of a seed one unit, and the change is tested on the
//! units (`paired`: a paired bootstrap interval and an exact sign-flip test). Without common seeds it falls back,
//! labeled so, to the unpaired check: the two 95% intervals apart.

use crate::batch::LEVELS;
use crate::json::Json;
use crate::paired::{Paired, paired, score};
use crate::stats::mmss;
use std::fmt::Write;

/// "bigger than noise" (unpaired): two intervals that do not overlap.
pub fn apart(a: (f64, f64), b: (f64, f64)) -> bool {
    a.1 < b.0 || b.1 < a.0
}

fn cells(r: &Json) -> Vec<&Json> {
    r.get("cells")
        .map(Json::arr)
        .unwrap_or(&[])
        .iter()
        .collect()
}
fn id(c: &Json) -> &str {
    c.get("id").and_then(Json::str).unwrap_or("?")
}
fn rate(c: &Json) -> Option<(f64, f64, f64, f64)> {
    let r = c.get("rate")?;
    (r.f("n") > 0.0).then(|| (r.f("p"), r.f("lo"), r.f("hi"), r.f("n")))
}
fn pct(p: f64) -> String {
    if p.is_finite() {
        format!("{:.0}%", p * 100.0)
    } else {
        "—".into()
    }
}
fn of(c: &Json) -> &str {
    c.get("rate")
        .and_then(|r| r.get("of"))
        .and_then(Json::str)
        .unwrap_or("")
}
fn strs(c: &Json, key: &str) -> Vec<String> {
    c.get(key)
        .map(Json::arr)
        .unwrap_or(&[])
        .iter()
        .filter_map(|v| v.str().map(str::to_string))
        .collect()
}

/// The seat whose wins a cell's rate counts, from its JSON (as the report's `rate_seat`): the higher level when the
/// levels differ, else the Kingdom when the peoples differ, else the first seat.
fn rated_seat(c: &Json) -> usize {
    let (races, levels) = (strs(c, "races"), strs(c, "levels"));
    let level = |s: usize| {
        levels
            .get(s)
            .and_then(|l| LEVELS.iter().position(|x| x == l))
    };
    if let (Some(a), Some(b)) = (level(0), level(1))
        && a != b
    {
        return (b > a) as usize;
    }
    let kingdom = endfall_sim::data::FACTIONS[0].name;
    match (races.first(), races.get(1)) {
        (Some(a), Some(b)) if a != b => (b == kingdom) as usize,
        _ => 0,
    }
}

/// A game's outcome for the side a cell's rate counts: won, lost, or None (a timeout).
type Outcome = Option<bool>;

/// Each game's seed and outcome, from the cell's records (none in a report without them).
fn games(c: &Json) -> Vec<(u32, Outcome)> {
    let seat = rated_seat(c);
    c.get("records")
        .map(Json::arr)
        .unwrap_or(&[])
        .iter()
        .filter_map(|g| {
            let seed = g.get("seed").and_then(Json::num)?;
            let won = g
                .get("winner")
                .and_then(Json::num)
                .map(|w| w as usize == seat);
            Some((seed as u32, won))
        })
        .collect()
}

/// The key of a cell's matchup, its seating left out: size, map, and each seat's people and level, sorted. Both
/// seatings of a matchup share it (a mirror at one level is its own).
fn matchup(c: &Json) -> String {
    let (races, levels) = (strs(c, "races"), strs(c, "levels"));
    if races.len() != 2 || levels.len() != 2 {
        return id(c).to_string();
    }
    let mut seats = [
        format!("{} {}", races[0], levels[0]),
        format!("{} {}", races[1], levels[1]),
    ];
    seats.sort();
    format!(
        "{} {}: {} / {}",
        c.f("size"),
        c.get("map").and_then(Json::str).unwrap_or("?"),
        seats[0],
        seats[1]
    )
}

/// A matchup compared seed for seed: its cells in A (one, or both seatings), its label, the outcome transitions over
/// its paired games (`[A][B]`, each win, timeout, loss), the rated side's wins of the decided paired games in A and in
/// B, and the paired change (None: no common seed).
pub struct Pool {
    pub label: String,
    pub of: String,
    pub cells: Vec<String>,
    pub moves: [[usize; 3]; 3],
    pub a: (usize, usize),
    pub b: (usize, usize),
    pub change: Option<Paired>,
}

const OUTCOMES: [&str; 3] = ["win", "timeout", "loss"];
fn slot(o: Outcome) -> usize {
    match o {
        Some(true) => 0,
        None => 1,
        Some(false) => 2,
    }
}

impl Pool {
    /// "win→loss 6, win→timeout 1 (16 same)".
    pub fn transitions(&self) -> String {
        let mut moved = vec![];
        let mut same = 0;
        for (i, row) in self.moves.iter().enumerate() {
            for (j, &n) in row.iter().enumerate() {
                if i == j {
                    same += n;
                } else if n > 0 {
                    moved.push(format!("{}→{} {n}", OUTCOMES[i], OUTCOMES[j]));
                }
            }
        }
        if moved.is_empty() {
            format!("none ({same} same)")
        } else {
            format!("{} ({same} same)", moved.join(", "))
        }
    }
    pub fn games(&self) -> usize {
        self.moves.iter().flatten().sum()
    }
}

/// The matchups both reports hold, seed for seed: each matchup of A's matched cells (by id, in A's order) with both
/// seatings pooled, its units the seeds both reports played in any of its cells.
pub fn pools(a: &Json, b: &Json) -> Vec<Pool> {
    let (ca, cb) = (cells(a), cells(b));
    let mut keys: Vec<String> = vec![];
    for x in &ca {
        if cb.iter().any(|y| id(y) == id(x)) && !keys.contains(&matchup(x)) {
            keys.push(matchup(x));
        }
    }
    keys.into_iter()
        .map(|key| {
            let pair: Vec<(&Json, &Json)> = ca
                .iter()
                .filter(|x| matchup(x) == key)
                .filter_map(|x| cb.iter().find(|y| id(y) == id(x)).map(|y| (*x, *y)))
                .collect();
            let mut moves = [[0; 3]; 3];
            let (mut ra, mut rb) = ((0, 0), (0, 0));
            // seed -> the score changes of its games
            let mut units: Vec<(u32, Vec<f64>)> = vec![];
            for (x, y) in &pair {
                let gb = games(y);
                for (seed, oa) in games(x) {
                    let Some(&(_, ob)) = gb.iter().find(|g| g.0 == seed) else {
                        continue;
                    };
                    moves[slot(oa)][slot(ob)] += 1;
                    for (r, o) in [(&mut ra, oa), (&mut rb, ob)] {
                        if let Some(won) = o {
                            r.0 += won as usize;
                            r.1 += 1;
                        }
                    }
                    let dv = score(ob) - score(oa);
                    match units.iter_mut().find(|u| u.0 == seed) {
                        Some(u) => u.1.push(dv),
                        None => units.push((seed, vec![dv])),
                    }
                }
            }
            units.sort_by_key(|u| u.0);
            let d: Vec<f64> = units
                .iter()
                .map(|(_, v)| v.iter().sum::<f64>() / v.len() as f64)
                .collect();
            let first = pair[0].0;
            Pool {
                label: if pair.len() > 1 {
                    format!("{}, both seatings", id(first))
                } else {
                    id(first).to_string()
                },
                of: of(first).to_string(),
                cells: pair.iter().map(|(x, _)| id(x).to_string()).collect(),
                moves,
                a: ra,
                b: rb,
                change: paired(&d),
            }
        })
        .collect()
}

fn share(r: (usize, usize)) -> String {
    if r.1 == 0 {
        "—".into()
    } else {
        format!("{} of {}", pct(r.0 as f64 / r.1 as f64), r.1)
    }
}

/// The comparison as Markdown, and the number of matchups (paired) or cells (unpaired) marked beyond the noise.
pub fn compare(a: &Json, b: &Json, a_name: &str, b_name: &str) -> (String, usize) {
    let mut s = String::new();
    let commit = |r: &Json| {
        r.get("commit")
            .and_then(Json::str)
            .unwrap_or("?")
            .to_string()
    };
    let _ = writeln!(
        s,
        "# Balance comparison: {} → {}\n\nA: {a_name} ({})  \nB: {b_name} ({})\n",
        commit(a),
        commit(b),
        commit(a),
        commit(b)
    );
    if a.get("batch") != b.get("batch") || a.get("length_band_min") != b.get("length_band_min") {
        let show = |r: &Json| {
            r.get("batch")
                .map_or("?".into(), |b| b.write().replace('\n', ""))
        };
        let _ = writeln!(
            s,
            "**The two reports used different batches:** A {}; B {}. Only the cells both have are compared.\n",
            show(a),
            show(b)
        );
    }
    let (ca, cb) = (cells(a), cells(b));
    let pools = pools(a, b);
    let paired_mode = pools.iter().any(|p| p.change.is_some());
    let mut marked = 0;
    if paired_mode {
        let matched = |own: &[&Json], other: &[&Json]| -> usize {
            own.iter()
                .filter(|x| other.iter().any(|y| id(y) == id(x)))
                .map(|x| games(x).len())
                .sum()
        };
        let both: usize = pools.iter().map(Pool::games).sum();
        let _ = writeln!(
            s,
            "## Paired, seed for seed\n\nEach matchup's games matched by seed, both seatings of a seed one unit; a unit's change is its games' mean change in score for the side the rate counts (a win 1, a timeout 1/2, a loss 0). The interval is a paired bootstrap over the units, 95%; **beyond noise** when it excludes 0 and the exact sign-flip test agrees (p < 0.05). Win rates are of the paired decided games. {both} games paired{}.\n",
            {
                let (ma, mb) = (matched(&ca, &cb), matched(&cb, &ca));
                if ma > both || mb > both {
                    format!(
                        "; {} of A's and {} of B's games in the same cells are on seeds the other did not play, left out",
                        ma - both,
                        mb - both
                    )
                } else {
                    String::new()
                }
            }
        );
        let _ = writeln!(
            s,
            "| Matchup (rate of) | Seeds | A | B | Changes, A→B | Paired change (95%) | p | Noise? |"
        );
        let _ = writeln!(s, "| --- | --- | --- | --- | --- | --- | --- | --- |");
        for p in &pools {
            let Some(c) = p.change else {
                let _ = writeln!(
                    s,
                    "| {} ({}) | none in common | — | — | — | — | — | — |",
                    p.label, p.of
                );
                continue;
            };
            let big = c.beyond_noise();
            marked += big as usize;
            let _ = writeln!(
                s,
                "| {} ({}) | {} | {} | {} | {} | {} | {:.3} | {} |",
                p.label,
                p.of,
                c.units,
                share(p.a),
                share(p.b),
                p.transitions(),
                c.show(),
                c.p,
                if big {
                    "**beyond noise**"
                } else {
                    "within noise"
                }
            );
        }
        let _ = writeln!(
            s,
            "\n{marked} matchup(s) moved beyond the noise (paired).\n\n## Per seating\n\nEach cell's figures in either report, all its games (the paired test above is the one to read for what moved).\n"
        );
        let _ = writeln!(
            s,
            "| Cell | Win rate A | Win rate B | Change | Length A | Length B | Timeouts A | Timeouts B |"
        );
        let _ = writeln!(s, "| --- | --- | --- | --- | --- | --- | --- | --- |");
    } else {
        let _ = writeln!(
            s,
            "## Unpaired: separate 95% intervals\n\n**Not paired:** the two reports share no seeds (or one lacks per-game records), so each cell's two rates are compared by their own intervals, which ignores what the same seeds would show and misses moves a paired test sees. Play both on the same seeds (or `--seed-start` the same) to compare seed for seed.\n"
        );
        let _ = writeln!(
            s,
            "| Cell | Win rate A | Win rate B | Change | Noise? | Length A | Length B | Timeouts A | Timeouts B |"
        );
        let _ = writeln!(s, "| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    }
    for x in &ca {
        let Some(y) = cb.iter().find(|y| id(y) == id(x)) else {
            continue;
        };
        let (ra, rb) = (rate(x), rate(y));
        let (change, mark) = match (ra, rb) {
            (Some(p), Some(q)) => {
                let big = apart((p.1, p.2), (q.1, q.2));
                if !paired_mode {
                    marked += big as usize;
                }
                (
                    format!("{:+.0} pts", (q.0 - p.0) * 100.0),
                    if big {
                        "**bigger than noise**"
                    } else {
                        "within noise"
                    },
                )
            }
            _ => ("—".into(), "—"),
        };
        let len = |c: &Json| c.get("length_s").map_or(f64::NAN, |l| l.f("median"));
        let _ = writeln!(
            s,
            "| {} ({}) | {} | {} | {change} |{} {} | {} | {} of {} | {} of {} |",
            id(x),
            of(x),
            ra.map_or("—".into(), |r| format!("{} of {}", pct(r.0), r.3)),
            rb.map_or("—".into(), |r| format!("{} of {}", pct(r.0), r.3)),
            if paired_mode {
                String::new()
            } else {
                format!(" {mark} |")
            },
            mmss(len(x)),
            mmss(len(y)),
            x.f("timeouts"),
            x.f("games"),
            y.f("timeouts"),
            y.f("games"),
        );
    }
    let only = |p: &[&Json], q: &[&Json]| -> Vec<String> {
        p.iter()
            .filter(|x| !q.iter().any(|y| id(y) == id(x)))
            .map(|x| id(x).to_string())
            .collect()
    };
    for (name, list) in [("A", only(&ca, &cb)), ("B", only(&cb, &ca))] {
        if !list.is_empty() {
            let _ = writeln!(s, "\nOnly in {name} (not compared): {}", list.join("; "));
        }
    }
    if !paired_mode {
        let _ = writeln!(
            s,
            "\n{marked} cell(s) moved more than the noise (unpaired)."
        );
    }
    let _ = writeln!(s, "\n## Target checks of B\n");
    for c in b.get("checks").map(Json::arr).unwrap_or(&[]) {
        let pass = matches!(c.get("pass"), Some(Json::Bool(true)));
        let _ = writeln!(
            s,
            "- **{}** {}: {}",
            if pass { "PASS" } else { "WARN" },
            c.get("name").and_then(Json::str).unwrap_or(""),
            c.get("detail").and_then(Json::str).unwrap_or("")
        );
    }
    (s, marked)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn report(seeds: u32, cells: Vec<Json>) -> Json {
        Json::obj()
            .with("commit", "x")
            .with("batch", Json::obj().with("seeds", seeds))
            .with("cells", cells)
            .with(
                "checks",
                vec![
                    Json::obj()
                        .with("name", "timeouts")
                        .with("pass", true)
                        .with("detail", "none"),
                ],
            )
    }
    fn cell(id: &str, k: usize, n: usize) -> Json {
        let (lo, hi) = crate::stats::wilson(k, n);
        Json::obj()
            .with("id", id)
            .with("games", n)
            .with("timeouts", 0u32)
            .with(
                "rate",
                Json::obj()
                    .with("of", "Kingdom wins")
                    .with("k", k)
                    .with("n", n)
                    .with("p", k as f64 / n as f64)
                    .with("lo", lo)
                    .with("hi", hi),
            )
            .with("length_s", Json::obj().with("median", 600.0))
    }

    #[test]
    fn compare_marks_only_what_moved_more_than_the_noise() {
        let a = report(
            30,
            vec![
                cell("one", 15, 30),
                cell("two", 15, 30),
                cell("gone", 10, 30),
            ],
        );
        let b = report(
            30,
            vec![
                cell("one", 17, 30),
                cell("two", 29, 30),
                cell("new", 10, 30),
            ],
        );
        let (text, marked) = compare(&a, &b, "a.json", "b.json");
        assert_eq!(marked, 1, "{text}");
        let line = |name: &str| {
            text.lines()
                .find(|l| l.starts_with(&format!("| {name} ")))
                .unwrap_or_default()
                .to_string()
        };
        assert!(
            line("one").contains("within noise") && line("one").contains("+7 pts"),
            "{}",
            line("one")
        );
        assert!(line("two").contains("bigger than noise"), "{}", line("two"));
        assert!(
            text.contains("Only in A (not compared): gone")
                && text.contains("Only in B (not compared): new"),
            "{text}"
        );
        assert!(!text.contains("different batches"));
        let (text, _) = compare(&a, &report(5, vec![]), "a", "b");
        assert!(text.contains("different batches"), "{text}");
    }

    /// A cell with its games' records: (seed, winner seat or None).
    fn rec_cell(races: [&str; 2], levels: [&str; 2], games: &[(u32, Option<u32>)]) -> Json {
        let id = format!(
            "96 Standard: {} {} vs {} {}",
            races[0], levels[0], races[1], levels[1]
        );
        let rated = rated_seat(
            &Json::obj()
                .with("races", vec![races[0], races[1]])
                .with("levels", vec![levels[0], levels[1]]),
        );
        let k = games.iter().filter(|g| g.1 == Some(rated as u32)).count();
        let n = games.iter().filter(|g| g.1.is_some()).count();
        cell(&id, k, n)
            .with("size", 96)
            .with("map", "Standard")
            .with("races", vec![races[0], races[1]])
            .with("levels", vec![levels[0], levels[1]])
            .with(
                "records",
                games
                    .iter()
                    .map(|&(seed, w)| Json::obj().with("seed", seed).with("winner", w))
                    .collect::<Vec<_>>(),
            )
    }

    #[test]
    fn the_rated_seat_follows_the_report_s_rate() {
        let c = |r: [&str; 2], l: [&str; 2]| {
            rated_seat(
                &Json::obj()
                    .with("races", vec![r[0], r[1]])
                    .with("levels", vec![l[0], l[1]]),
            )
        };
        assert_eq!(c(["Kingdom", "Expedition"], ["Hard", "Hard"]), 0);
        assert_eq!(c(["Expedition", "Kingdom"], ["Hard", "Hard"]), 1);
        assert_eq!(c(["Kingdom", "Kingdom"], ["Hard", "Hard"]), 0);
        assert_eq!(c(["Kingdom", "Expedition"], ["Easy", "Medium"]), 1);
        assert_eq!(c(["Expedition", "Expedition"], ["Hard", "Easy"]), 0);
    }

    #[test]
    fn the_same_seeds_are_compared_seed_for_seed_with_both_seatings_one_unit() {
        // The Hard-128 case in small: twelve seeds in each seating; in A the Kingdom wins all 24 games, in B it loses
        // 7 and one is a timeout. Each seating alone moves 4 of 12 (the unpaired intervals overlap); paired, eight
        // seeds moved one way and none the other.
        let kve = |losses: &[u32], timeout: Option<u32>| -> Vec<(u32, Option<u32>)> {
            (1..=12)
                .map(|s| {
                    let w = if Some(s) == timeout {
                        None
                    } else if losses.contains(&s) {
                        Some(1)
                    } else {
                        Some(0)
                    };
                    (s, w)
                })
                .collect()
        };
        let flip = |g: Vec<(u32, Option<u32>)>| -> Vec<(u32, Option<u32>)> {
            g.into_iter().map(|(s, w)| (s, w.map(|w| 1 - w))).collect()
        };
        // (the Expedition's wins: rated from the Kingdom's side, so A has the Kingdom losing)
        let a = report(
            12,
            vec![
                rec_cell(["Kingdom", "Expedition"], ["Hard", "Hard"], &kve(&[], None)),
                rec_cell(
                    ["Expedition", "Kingdom"],
                    ["Hard", "Hard"],
                    &flip(kve(&[], None)),
                ),
                rec_cell(
                    ["Kingdom", "Kingdom"],
                    ["Hard", "Hard"],
                    &kve(&[2, 4], None),
                ),
            ],
        );
        let b = report(
            12,
            vec![
                rec_cell(
                    ["Kingdom", "Expedition"],
                    ["Hard", "Hard"],
                    &kve(&[1, 2, 3, 4], None),
                ),
                rec_cell(
                    ["Expedition", "Kingdom"],
                    ["Hard", "Hard"],
                    &flip(kve(&[5, 6, 7], Some(8))),
                ),
                rec_cell(
                    ["Kingdom", "Kingdom"],
                    ["Hard", "Hard"],
                    &kve(&[2, 4], None),
                ),
            ],
        );
        let ps = pools(&a, &b);
        assert_eq!(
            ps.len(),
            2,
            "both seatings of Kingdom vs Expedition pooled; the mirror alone"
        );
        let p = &ps[0];
        assert_eq!(p.cells.len(), 2);
        assert_eq!(p.moves[0][2], 7, "seven wins became losses");
        assert_eq!(p.moves[0][1], 1, "one became a timeout");
        assert_eq!(p.games(), 24);
        let c = p.change.unwrap();
        assert_eq!(c.units, 12, "a seed is one unit");
        assert!(c.beyond_noise(), "{c:?}");
        assert!(ps[1].change.unwrap().mean == 0.0);
        let (text, marked) = compare(&a, &b, "a", "b");
        assert_eq!(marked, 1, "{text}");
        assert!(text.contains("## Paired, seed for seed"), "{text}");
        assert!(
            text.contains("Kingdom Hard vs Expedition Hard, both seatings (Kingdom wins) | 12 | 100% of 24 | 70% of 23 | win→timeout 1, win→loss 7 (16 same)"),
            "{text}"
        );
        assert!(text.contains("**beyond noise**") && !text.contains("Not paired"));
        // Each seating alone, unpaired: 4 and 3 of 12 moved, within the noise.
        assert!(!text.contains("bigger than noise"), "{text}");
        // A screen on seeds 1-6 against the 12-seed baseline: paired on the six both played.
        let mut short = b.clone();
        if let Some(Json::Obj(f)) = Some(&mut short)
            && let Some((_, Json::Arr(cs))) = f.iter_mut().find(|(k, _)| k == "cells")
        {
            for c in cs.iter_mut() {
                if let Json::Obj(cf) = c
                    && let Some((_, Json::Arr(r))) = cf.iter_mut().find(|(k, _)| k == "records")
                {
                    r.truncate(6);
                }
            }
        }
        let (text, _) = compare(&a, &short, "a", "short");
        assert!(
            text.contains("left out") && text.contains("| 6 |"),
            "{text}"
        );
        // Fresh seeds (13-24) against seeds 1-12: nothing in common, the unpaired check, labeled.
        let fresh = report(
            12,
            vec![rec_cell(
                ["Kingdom", "Expedition"],
                ["Hard", "Hard"],
                &kve(&[], None)
                    .into_iter()
                    .map(|(s, w)| (s + 12, w))
                    .collect::<Vec<_>>(),
            )],
        );
        let (text, _) = compare(&a, &fresh, "a", "fresh");
        assert!(
            text.contains("## Unpaired") && text.contains("**Not paired:**"),
            "{text}"
        );
    }

    #[test]
    fn a_report_against_itself_shows_no_change() {
        let a = report(30, vec![cell("one", 15, 30), cell("two", 29, 30)]);
        let (text, marked) = compare(&a, &a, "a", "a");
        assert_eq!(marked, 0);
        assert!(
            text.lines()
                .filter(|l| l.starts_with("| one") || l.starts_with("| two"))
                .all(|l| l.contains("+0 pts")),
            "{text}"
        );
    }
}
