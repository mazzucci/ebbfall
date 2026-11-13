//! One game, traced (`npm run lab -- trace`): every `--every` seconds of game time, each seat's gold, gold mined,
//! workers, finished buildings, army (worth, and count by kind) and its AI's wave state (`World::ai_trace`), then how
//! it ended. For telling a stall (armies idle, a wave stuck, an AI that stops building or attacking) from a grind.
//! Read between ticks only: the trace cannot change the game.

use crate::batch::{LEVELS, TPS};
use crate::waves::army_of;
use endfall_sim::data::FACTIONS;
use endfall_sim::map::{MapKind, MapSize};
use endfall_sim::world::World;
use std::collections::BTreeMap;
use std::fmt::Write;

/// The game a trace plays: as many seats as `races` (indexes into `FACTIONS`), each an AI at its level (the first's
/// for seats past the list), the map seed and its seats' turn (`side`), and teams (None: each seat its own).
pub struct Setup {
    pub size: i32,
    pub map: MapKind,
    pub races: Vec<usize>,
    pub levels: Vec<usize>,
    pub teams: Option<Vec<u8>>,
    pub seed: u32,
    pub side: u32,
    /// Each seat's plan by name (`plan_named`; None or a missing entry: its level's own tuning).
    pub plans: Vec<Option<String>>,
}

/// A lab plan by name for a seat of people `race`: `rush`, `defense`, `tech` (`bets`), `basic`, `mid`, `top` (a
/// `tiers` committer) or `greedy` (`tiers::greedy`).
pub fn plan_named(name: &str, race: usize) -> Option<endfall_sim::data::Diff> {
    let tier = crate::tiers::TIERS.iter().position(|t| *t == name);
    let bet = crate::bets::PLANS.iter().position(|p| *p == name);
    match (tier, bet) {
        (Some(k), _) => Some(crate::tiers::commit(race, k)),
        (_, Some(b)) => Some(crate::bets::plan(b)),
        _ if name == "greedy" => Some(crate::tiers::greedy()),
        _ => None,
    }
}

/// The trace of `setup`'s game, a line per seat every `every` s, to its end or `cap_min` minutes.
pub fn trace(s: &Setup, cap_min: u32, every: u32) -> String {
    let factions: Vec<_> = s.races.iter().map(|&r| FACTIONS[r]).collect();
    let n = factions.len();
    let mut w = World::with_size(
        s.seed,
        s.levels[0],
        s.map,
        MapSize::square(s.size),
        s.side,
        &factions,
    );
    let levels: Vec<u8> = (0..n)
        .map(|i| *s.levels.get(i).unwrap_or(&s.levels[0]) as u8)
        .collect();
    assert!(w.set_diffs(&levels), "per-seat levels");
    let plans: Vec<Option<endfall_sim::data::Diff>> = (0..n)
        .map(|i| {
            s.plans
                .get(i)
                .cloned()
                .flatten()
                .and_then(|p| plan_named(&p, s.races[i]))
        })
        .collect();
    if plans.iter().any(|p| p.is_some()) {
        assert!(w.set_ai_plans(&plans), "per-seat plans");
    }
    assert!(w.set_ai_seats(vec![true; n]), "AI seats");
    if let Some(t) = &s.teams {
        assert!(w.set_teams(t), "teams");
    }
    let names: Vec<String> = (0..n)
        .map(|i| {
            let plan = s.plans.get(i).cloned().flatten();
            format!(
                "{} {}{}",
                factions[i].name,
                LEVELS[levels[i] as usize],
                plan.map_or(String::new(), |p| format!(" ({p})"))
            )
        })
        .collect();
    let mut out = format!(
        "# {} {:?} seed {} side {}: {} teams {:?}\n",
        s.size,
        s.map,
        s.seed,
        s.side,
        names.join(" / "),
        s.teams
    );
    let (cap, every) = (cap_min * 60 * TPS, every.max(1) * TPS);
    let mut tick = 0;
    while w.winner < 0 && tick < cap {
        w.step();
        tick += 1;
        w.events.clear();
        if tick % every == 0 {
            out += &at(&w);
        }
    }
    let _ = writeln!(
        out,
        "end {:02}:{:02} winner {} out {:?}",
        tick / TPS / 60,
        tick / TPS % 60,
        if w.winner < 0 {
            "none (cap)".into()
        } else {
            w.winner.to_string()
        },
        w.out
    );
    out
}

/// Every seat's line at this moment (a seat that is out is left out).
fn at(w: &World) -> String {
    let t = w.time as u32;
    let mut s = String::new();
    for seat in 0..w.seats() as u8 {
        if w.out[seat as usize] {
            continue;
        }
        let mut kinds: BTreeMap<&str, u32> = BTreeMap::new();
        for u in w
            .units
            .iter()
            .filter(|u| u.team == seat && !u.kind.def().worker)
        {
            *kinds.entry(u.kind.def().key).or_default() += 1;
        }
        let workers = w
            .units
            .iter()
            .filter(|u| u.team == seat && u.kind.def().worker)
            .count();
        let bldgs = w.bldgs.iter().filter(|b| b.team == seat && b.done).count();
        let mut bk: BTreeMap<&str, u32> = BTreeMap::new();
        for b in w.bldgs.iter().filter(|b| b.team == seat) {
            *bk.entry(b.kind.def().key).or_default() += 1;
        }
        let bk: Vec<String> = bk.iter().map(|(k, n)| format!("{k}{n}")).collect();
        let army: Vec<String> = kinds.iter().map(|(k, n)| format!("{k}{n}")).collect();
        let _ = writeln!(
            s,
            "{:02}:{:02} s{seat} gold {:4} mined {:6} wk {:2} bl {:2} army {:5.0} [{}] | {} | {}",
            t / 60,
            t % 60,
            w.res[seat as usize][0],
            w.ledger.get(seat as usize).map_or(0, |l| l.mined[0]),
            workers,
            bldgs,
            army_of(w, |x| x == seat as usize),
            army.join(" "),
            w.ai_trace(seat).unwrap_or_default(),
            bk.join(" ")
        );
    }
    s
}
