//! Play against Claude, natively (claude/PLAN_VOCAB.md, claude/PROTOCOL.md): `duel`, one game of a written plan against
//! an AI, and `plan-gate`, the parity check that a planned seat with an empty plan plays as plain Hard.
//!
//! A duel's seat 0 is Hard's AI with the plan (`World::set_plan`, the code a game link carries), seat 1 the AI it plays
//! (Hard by default). With an answers file it also makes check-ins for seat 0 (`Summary::check_in_for`): it plays until
//! a check-in it has no answer for, writes that digest out and stops; the writer adds an answer (a delta code, or `-`
//! for none) and runs it again. The game is deterministic, so each run replays the same game up to there, applying each
//! answer `--delay` game-seconds after its digest (the writer's thinking time: the game never waits for it).

use crate::batch::TPS;
use endfall_sim::data::FACTIONS;
use endfall_sim::map::{MapKind, MapSize};
use endfall_sim::summary::Summary;
use endfall_sim::world::{OutWhy, World};
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};

/// The level a plan plays against by default: Hard.
pub const HARD: usize = 2;

/// One game: the map, the peoples (indexes into `FACTIONS`: the plan's seat, then the other), the other seat's level,
/// the map seed, the cap.
#[derive(Clone)]
pub struct Duel {
    pub map: MapKind,
    pub size: i32,
    pub races: [usize; 2],
    pub vs_level: usize,
    pub seed: u32,
    pub cap_min: u32,
}

/// One answer to a check-in: its number, the delta code (None: no change).
pub type Answer = (usize, Option<String>);

/// Read an answers file: one line a check-in, `N CODE` or `N -` (`#` lines and blank ones skipped; anything after
/// ` | ` on a line is the writer's line for the player, kept out of the game here).
pub fn read_answers(text: &str) -> Result<Vec<Answer>, String> {
    let mut v = Vec::new();
    for line in text
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
    {
        let line = line.split(" | ").next().unwrap_or("").trim();
        let (n, code) = line
            .split_once(' ')
            .ok_or(format!("answers: '{line}' is not 'N CODE'"))?;
        let n: usize = n
            .parse()
            .map_err(|_| format!("answers: '{n}' is not a check-in number"))?;
        let code = code.trim();
        v.push((n, (code != "-").then(|| code.to_string())));
    }
    Ok(v)
}

/// How a duel went.
pub struct Played {
    /// The summary (JSON), when the game was played to its end or cap.
    pub summary: Option<String>,
    /// A check-in it stopped at, with no answer: its number and digest.
    pub waiting: Option<(usize, String)>,
    pub line: String,
    /// What the plan had clamped or dropped, and each answer's.
    pub notes: Vec<String>,
    /// Every check-in's size in bytes, in order.
    pub digests: Vec<usize>,
}

/// The world of a duel, its plan set (Err: the plan's refusal).
pub fn world(g: &Duel, plan: &str) -> Result<(World, Vec<String>), String> {
    let mut w = World::with_size(
        g.seed,
        HARD,
        g.map,
        MapSize::square(g.size),
        0,
        &[FACTIONS[g.races[0]], FACTIONS[g.races[1]]],
    );
    assert!(w.set_ai_seats([true, true]), "two AI seats");
    assert!(w.set_diffs(&[HARD as u8, g.vs_level as u8]), "levels");
    let notes = w.set_plan(0, plan)?;
    Ok((w, notes))
}

/// Play a duel. `answers`: None for no check-ins; else the answers so far (the game stops at the first check-in past
/// them), each applied `delay_s` game-seconds after its check-in.
pub fn play(
    g: &Duel,
    plan: &str,
    answers: Option<&[Answer]>,
    delay_s: u32,
) -> Result<Played, String> {
    let (mut w, mut notes) = world(g, plan)?;
    let mut s = Summary::new(&w);
    if answers.is_some() {
        s.check_in_for(Some(0));
    }
    let (mut digests, mut due): (Vec<usize>, Vec<(u32, usize, String)>) = (Vec::new(), Vec::new());
    let cap = g.cap_min * 60 * TPS;
    let mut waiting = None;
    while w.tick < cap && w.winner < 0 {
        // (an answer lands on its tick, before the step: as the browser applies a message between steps)
        while let Some(i) = due.iter().position(|d| d.0 == w.tick) {
            let (_, n, code) = due.remove(i);
            match w.plan_delta(0, &code) {
                Ok(ns) => notes.extend(ns.into_iter().map(|x| format!("answer {n}: {x}"))),
                Err(e) => notes.push(format!("answer {n} refused: {e}")),
            }
        }
        w.step();
        w.events.clear();
        s.observe(&w);
        while let Some(c) = s.take_check_in() {
            let n = digests.len() + 1;
            digests.push(c.len());
            let answers = answers.unwrap_or(&[]);
            match answers.iter().find(|a| a.0 == n) {
                Some((_, Some(code))) => due.push((w.tick + delay_s * TPS, n, code.clone())),
                Some((_, None)) => {}
                None => {
                    waiting = Some((n, c));
                    break;
                }
            }
        }
        if waiting.is_some() {
            break;
        }
    }
    let t = w.tick / TPS;
    let at = format!("{}:{:02}", t / 60, t % 60);
    let verdict = if waiting.is_some() {
        format!("CHECK-IN at {at}")
    } else {
        match w.winner {
            0 => format!("WON at {at}"),
            1 => format!(
                "LOST at {at} ({})",
                match w.out_why[0] {
                    OutWhy::Buildings => "destroyed",
                    OutWhy::Conceded => "conceded",
                    OutWhy::Helpless => "helpless",
                    OutWhy::In => "still in",
                }
            ),
            _ => format!("TIMEOUT at {at}"),
        }
    };
    let line = format!(
        "plan ({}) vs {} ({}), {:?} {}x{} seed {}: {verdict}",
        FACTIONS[g.races[0]].name,
        ["Easy", "Medium", "Hard"].get(g.vs_level).unwrap_or(&"?"),
        FACTIONS[g.races[1]].name,
        g.map,
        g.size,
        g.size,
        g.seed
    );
    let summary = waiting.is_none().then(|| s.json(&w, w.winner < 0));
    Ok(Played {
        summary,
        waiting,
        line,
        notes,
        digests,
    })
}

/// The gate's result for one cell: (wins of plain Hard, wins of the planned seat, games that differ in their winner).
pub type GateCell = (u32, u32, u32);

/// The parity gate (the PR's): for each cell (`Duel` with its seed set per game), seeds 1..=`seeds`, seat 0 plain Hard
/// and then Hard with an empty plan, the same seed: how often seat 0 won each way, and how many games' winners differ.
pub fn gate(cells: &[Duel], seeds: u32, threads: usize) -> Vec<GateCell> {
    let jobs: Vec<(usize, u32, bool)> = (0..cells.len())
        .flat_map(|c| (1..=seeds).flat_map(move |s| [(c, s, false), (c, s, true)]))
        .collect();
    let slots: Vec<Mutex<Option<i32>>> = jobs.iter().map(|_| Mutex::new(None)).collect();
    let next = AtomicUsize::new(0);
    std::thread::scope(|scope| {
        for _ in 0..threads.max(1) {
            scope.spawn(|| {
                loop {
                    let k = next.fetch_add(1, Ordering::SeqCst);
                    let Some(&(c, seed, planned)) = jobs.get(k) else {
                        break;
                    };
                    let g = Duel {
                        seed,
                        ..cells[c].clone()
                    };
                    let mut w = World::with_size(
                        g.seed,
                        HARD,
                        g.map,
                        MapSize::square(g.size),
                        0,
                        &[FACTIONS[g.races[0]], FACTIONS[g.races[1]]],
                    );
                    assert!(
                        w.set_ai_seats([true, true])
                            && w.set_diffs(&[HARD as u8, g.vs_level as u8])
                    );
                    if planned {
                        w.set_plan(0, "1").expect("the empty plan");
                    }
                    let cap = g.cap_min * 60 * TPS;
                    while w.tick < cap && w.winner < 0 {
                        w.step();
                        w.events.clear();
                    }
                    *slots[k].lock().unwrap() = Some(w.winner);
                }
            });
        }
    });
    let won: Vec<i32> = slots
        .into_iter()
        .map(|s| s.into_inner().unwrap().unwrap())
        .collect();
    (0..cells.len())
        .map(|c| {
            let mut cell = (0, 0, 0);
            for (k, job) in jobs.iter().enumerate().filter(|(_, j)| j.0 == c && !j.2) {
                let (plain, planned) = (won[k], won[k + 1]);
                debug_assert!(!job.2 && jobs[k + 1].2);
                cell.0 += (plain == 0) as u32;
                cell.1 += (planned == 0) as u32;
                cell.2 += (plain != planned) as u32;
            }
            cell
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn answers_read_numbers_and_codes_and_skip_the_player_line() {
        let a = read_answers("# round 1\n1 -\n2 1.m20.xmass | Gathering now.\n\n3 1.xattack\n")
            .unwrap();
        assert_eq!(
            a,
            vec![
                (1, None),
                (2, Some("1.m20.xmass".into())),
                (3, Some("1.xattack".into()))
            ]
        );
        assert!(read_answers("one 1.w14").is_err());
    }

    #[test]
    fn a_short_duel_stops_at_its_first_check_in_and_goes_on_once_answered() {
        let g = Duel {
            map: MapKind::Standard,
            size: 64,
            races: [0, 1],
            vs_level: HARD,
            seed: 3,
            cap_min: 3,
        };
        let p = play(&g, "1.w12", Some(&[]), 15).unwrap();
        let (n, digest) = p.waiting.expect("a check-in at 2:00");
        assert_eq!(n, 1);
        assert!(
            digest.contains("\"kind\":\"checkin\"") && digest.contains("\"plan\":\"1.w12\""),
            "{digest}"
        );
        let q = play(&g, "1.w12", Some(&[(1, Some("1.xhold".into()))]), 15).unwrap();
        assert!(q.waiting.is_none() && q.summary.is_some(), "{}", q.line);
    }
}
