//! Spike (play against Claude): `duel`, one game of a written plan against Hard. Seat 0 is Hard's AI steered by the
//! plan (a JSON file, spike/PLAN_VOCAB.md), seat 1 plain Hard; played natively to its end or the cap, the game summary
//! (`endfall_sim::summary`) written out with seat 0 labeled as the plan's. Each field is clamped to the lab's ranges
//! and every clamp is reported. The plan rides `World::set_ai_plans` (a `Diff` from Hard's numbers, as `plans` builds
//! them from Medium's) and the dare `World::set_ai_bans` (the spike's only AI change: a planned seat never trains the
//! kinds it dares away).

use crate::batch::TPS;
use crate::json::Json;
use endfall_sim::data::{DIFF, Diff, FACTIONS, Faction, NEVER, UNIT_KINDS, UnitKind};
use endfall_sim::map::{MapKind, MapSize};
use endfall_sim::world::{OutWhy, World};

/// The level the plan steers, and the level it plays against: Hard.
pub const HARD: usize = 2;
/// The label of the plan's seat in the summary.
pub const LABEL: &str = "Claude's plan (Hard AI)";
/// The most kinds a dare may bar.
pub const MAX_DARES: usize = 3;
/// The most towers a plan may ask for.
pub const MAX_TOWERS: usize = 6;

/// One game: the map, the peoples (indexes into `FACTIONS`: the plan's seat, then Hard's), the map seed, the cap.
pub struct Duel {
    pub map: MapKind,
    pub size: i32,
    pub races: [usize; 2],
    pub seed: u32,
    pub cap_min: u32,
}

/// A plan read from JSON: its tuning, its dare (a bit per `UnitKind::index`), the plan as applied (for the summary),
/// and the notes on what was clamped, defaulted or ignored.
pub struct Plan {
    pub diff: Diff,
    pub bans: u64,
    pub applied: String,
    pub notes: Vec<String>,
}

/// "m:ss" from seconds.
fn mmss(s: f64) -> String {
    let s = s.round() as i64;
    format!("{}:{:02}", s / 60, s % 60)
}

/// A time field: "m:ss", a number of seconds, or "never" (None: never).
fn time_of(v: &Json) -> Result<Option<f64>, String> {
    match v {
        Json::Num(n) => Ok(Some(*n)),
        Json::Str(s) if s.trim().eq_ignore_ascii_case("never") => Ok(None),
        Json::Str(s) => {
            let s = s.trim();
            match s.split_once(':') {
                Some((m, sec)) => {
                    let m: f64 = m.parse().map_err(|_| format!("'{s}' is not m:ss"))?;
                    let sec: f64 = sec.parse().map_err(|_| format!("'{s}' is not m:ss"))?;
                    Ok(Some(m * 60.0 + sec))
                }
                None => s
                    .parse::<f64>()
                    .map(Some)
                    .map_err(|_| format!("'{s}' is not m:ss")),
            }
        }
        _ => Err("not a time (\"m:ss\" or \"never\")".into()),
    }
}

/// The unit kinds a people trains (workers left out), in index order.
pub fn fighters(f: &Faction) -> Vec<UnitKind> {
    let mut bldgs = vec![f.hq];
    bldgs.extend(f.build_basic.iter().chain(f.build_advanced));
    UNIT_KINDS
        .into_iter()
        .filter(|k| !k.def().worker && bldgs.iter().any(|b| b.def().trains.contains(k)))
        .collect()
}

/// A unit of people `f` by its name or key, any case, a plural "s" allowed.
fn unit_named(f: &Faction, name: &str) -> Option<UnitKind> {
    let n = name.trim().to_lowercase();
    let is = |k: &UnitKind, n: &str| {
        k.def().name.eq_ignore_ascii_case(n) || k.def().key.eq_ignore_ascii_case(n)
    };
    let all = fighters(f);
    all.iter()
        .copied()
        .find(|k| is(k, &n))
        .or_else(|| all.iter().copied().find(|k| is(k, n.trim_end_matches('s'))))
}

const FIELDS: [&str; 11] = [
    "workers",
    "first_wave",
    "first_wave_size",
    "expand",
    "barracks",
    "tech_building",
    "top_tier",
    "towers",
    "raids",
    "favor",
    "wont_build",
];

/// Read a plan for a seat of people `race` (FACTIONS' index) on a map `size` tiles wide.
pub fn read_plan(text: &str, race: usize, size: i32) -> Result<Plan, String> {
    let j = Json::parse(text).map_err(|e| format!("plan: {e}"))?;
    let Json::Obj(fields) = &j else {
        return Err("plan: not a JSON object".into());
    };
    let f = FACTIONS[race];
    let hard = DIFF[HARD];
    let mut d = hard;
    let mut notes = Vec::new();
    for (k, _) in fields {
        if !FIELDS.contains(&k.as_str()) && !k.starts_with('_') && k != "notes" {
            notes.push(format!("{k}: unknown field, ignored"));
        }
    }
    // A number field, clamped to [lo, hi].
    let number = |key: &str, lo: f64, hi: f64, dflt: f64, notes: &mut Vec<String>| -> f64 {
        match j.get(key) {
            None | Some(Json::Null) => dflt,
            Some(Json::Num(n)) => {
                let c = n.round().clamp(lo, hi);
                if c != *n {
                    notes.push(format!("{key}: {n} clamped to {c} (range {lo}-{hi})"));
                }
                c
            }
            Some(_) => {
                notes.push(format!("{key}: not a number, default {dflt} used"));
                dflt
            }
        }
    };
    // A time field, clamped to [lo, hi] (s), "never" only where `never` allows.
    let time =
        |key: &str, lo: f64, hi: f64, dflt: f64, never: bool, notes: &mut Vec<String>| -> f64 {
            let Some(v) = j.get(key).filter(|v| **v != Json::Null) else {
                return dflt;
            };
            match time_of(v) {
                Ok(None) if never => NEVER,
                Ok(None) => {
                    notes.push(format!("{key}: \"never\" not allowed, {} used", mmss(hi)));
                    hi
                }
                Ok(Some(t)) => {
                    let c = t.clamp(lo, hi);
                    if c != t {
                        notes.push(format!(
                            "{key}: {} clamped to {} (range {}-{})",
                            mmss(t),
                            mmss(c),
                            mmss(lo),
                            mmss(hi)
                        ));
                    }
                    c
                }
                Err(e) => {
                    notes.push(format!("{key}: {e}, default used"));
                    dflt
                }
            }
        };

    // Workers: the plans' range (8 to 20).
    d.harv = number("workers", 8.0, 20.0, hard.harv as f64, &mut notes) as usize;
    // The first wave: 2:00 (the plans' earliest) to 12:00 (the furthest `--first-max` explored); its size 4 to 16.
    d.first = time("first_wave", 120.0, 720.0, hard.first, false, &mut notes);
    d.wave = number("first_wave_size", 4.0, 16.0, hard.wave as f64, &mut notes) as usize;
    // Expansion: 3:00 to 12:00 or never (the plans'), for either people alike once set.
    if j.get("expand").is_some_and(|v| *v != Json::Null) {
        d.expand_at = time("expand", 180.0, 720.0, hard.expand_at, true, &mut notes);
        d.expand_at_of = &[];
    }
    // Barracks to start: 1 to 4 (the bets' tech plan has 1, Hard 3), one more once it is rich.
    d.rax = number("barracks", 1.0, 4.0, hard.rax as f64, &mut notes) as usize;
    d.extra_rax = d.rax + 1;
    // The tech building: 1:00 (the bets' tech plan) to 10:00, or never (the tiers' barracks-only committer: no research).
    d.tech_at = time("tech_building", 60.0, 600.0, hard.tech_at, true, &mut notes);
    if d.tech_at >= NEVER {
        d.research_from = NEVER;
    } else if d.tech_at <= 90.0 {
        // (the bets' tech plan: its side's techs at once)
        d.tech_from = 120.0;
    }
    // The top tier: from 0:00 (the bets' tech plan: from the start) to 20:00, or never (the tiers' committers).
    let top = time("top_tier", 0.0, 1200.0, hard.tier_at[0], true, &mut notes);
    if top <= 0.0 {
        d.mix_tier = 2;
        d.tier_at = [NEVER, NEVER];
    } else {
        d.tier_at = [top, NEVER];
    }
    // Towers: up to six, each from 1:00 to 20:00 (Hard: 2:30 and 8:00; the bets' defense: six by 5:30).
    let towers_of = |notes: &mut Vec<String>| -> Option<Vec<f64>> {
        let v = j.get("towers").filter(|v| **v != Json::Null)?;
        let Json::Arr(items) = v else {
            notes.push("towers: not a list of times, Hard's used".into());
            return None;
        };
        let mut ts = Vec::new();
        for (i, it) in items.iter().enumerate() {
            if i >= MAX_TOWERS {
                notes.push(format!(
                    "towers: {} asked, only the first {MAX_TOWERS} kept",
                    items.len()
                ));
                break;
            }
            match time_of(it) {
                Ok(Some(t)) => {
                    let c = t.clamp(60.0, 1200.0);
                    if c != t {
                        notes.push(format!(
                            "towers: {} clamped to {} (range 1:00-20:00)",
                            mmss(t),
                            mmss(c)
                        ));
                    }
                    ts.push(c);
                }
                _ => notes.push(format!("towers: entry {} not a time, dropped", i + 1)),
            }
        }
        ts.sort_by(f64::total_cmp);
        Some(ts)
    };
    if let Some(ts) = towers_of(&mut notes) {
        d.towers = Box::leak(ts.into_boxed_slice());
        d.tower_max = &[];
    }
    // Raids with its fast units on the foe's workers.
    match j.get("raids") {
        None | Some(Json::Null) => {}
        Some(Json::Bool(b)) => d.raids = *b,
        Some(_) => notes.push("raids: not true or false, default used".into()),
    }
    // Its leaning unit: one its people's mix fields, more of it (a third more often).
    if let Some(v) = j.get("favor").filter(|v| **v != Json::Null) {
        let mix: Vec<UnitKind> = f.ai.mix.iter().map(|m| m.0).collect();
        match v.str().and_then(|n| unit_named(f, n)) {
            Some(k) if mix.contains(&k) => d.focus = Some(k),
            _ => notes.push(format!(
                "favor: {} is not one of {}, ignored",
                v.write().trim(),
                mix.iter()
                    .map(|k| k.def().name)
                    .collect::<Vec<_>>()
                    .join(", ")
            )),
        }
    }
    // The dare: kinds it never trains.
    let mut bans = 0u64;
    let mut dared = Vec::new();
    if let Some(v) = j.get("wont_build").filter(|v| **v != Json::Null) {
        let names: Vec<&Json> = match v {
            Json::Arr(a) => a.iter().collect(),
            other => vec![other],
        };
        for n in names {
            let Some(name) = n.str() else {
                notes.push("wont_build: an entry is not a unit name, dropped".into());
                continue;
            };
            match unit_named(f, name) {
                Some(k) if bans >> k.index() & 1 == 1 => {}
                // (its line unit is what its whole script counts its army by: without it the AI collapses)
                Some(k) if k == f.ai.basic => notes.push(format!(
                    "wont_build: the {} is the {}'s line unit and cannot be dared away, dropped",
                    k.def().name,
                    f.name
                )),
                Some(_) if dared.len() >= MAX_DARES => {
                    notes.push(format!(
                        "wont_build: at most {MAX_DARES} units, '{name}' dropped"
                    ));
                }
                Some(k) => {
                    bans |= 1 << k.index();
                    dared.push(k);
                }
                None => notes.push(format!(
                    "wont_build: '{name}' is not a {} unit (one of {}), dropped",
                    f.name,
                    fighters(f)
                        .iter()
                        .map(|k| k.def().name)
                        .collect::<Vec<_>>()
                        .join(", ")
                )),
            }
        }
    }
    let t = |s: f64| {
        if s >= NEVER {
            "never".to_string()
        } else {
            mmss(s)
        }
    };
    let expand = d
        .expand_at_of
        .iter()
        .find(|o| o.0 == f.hq)
        .map_or(d.expand_at, |o| if size <= 96 { o.1 } else { o.2 });
    let applied = Json::obj()
        .with("people", f.name)
        .with("workers", d.harv as f64)
        .with("first_wave", t(d.first))
        .with("first_wave_size", d.wave as f64)
        .with("expand", t(expand))
        .with("barracks", d.rax as f64)
        .with("tech_building", t(d.tech_at))
        .with(
            "top_tier",
            if d.mix_tier >= 2 {
                "0:00".to_string()
            } else {
                t(d.tier_at[0])
            },
        )
        .with(
            "towers",
            Json::Arr(d.towers.iter().map(|&s| Json::Str(t(s))).collect()),
        )
        .with("raids", Json::Bool(d.raids))
        .with(
            "favor",
            d.focus
                .map_or(Json::Null, |k| Json::Str(k.def().name.into())),
        )
        .with(
            "wont_build",
            Json::Arr(
                dared
                    .iter()
                    .map(|k| Json::Str(k.def().name.into()))
                    .collect(),
            ),
        )
        .with(
            "adjusted",
            Json::Arr(notes.iter().map(|n| Json::Str(n.clone())).collect()),
        );
    let applied = applied.write().replace('\n', "");
    Ok(Plan {
        diff: d,
        bans,
        applied,
        notes,
    })
}

/// What a duel gives: the summary (JSON, seat 0 labeled as the plan's, the plan as applied added) and a line saying
/// how it went.
pub struct Played {
    pub summary: String,
    pub line: String,
}

/// Play the duel.
pub fn play(g: &Duel, plan: &Plan) -> Played {
    let mut w = World::with_size(
        g.seed,
        HARD,
        g.map,
        MapSize::square(g.size),
        0,
        &[FACTIONS[g.races[0]], FACTIONS[g.races[1]]],
    );
    assert!(w.set_diffs(&[HARD as u8, HARD as u8]), "levels");
    assert!(w.set_ai_plans(&[Some(plan.diff), None]), "the plan");
    assert!(w.set_ai_bans(&[plan.bans, 0]), "the dare");
    assert!(w.set_ai_seats([true, true]), "two AI seats");
    let sum = endfall_sim::summary::play(&mut w, g.cap_min * 60 * TPS);
    let timed_out = w.winner < 0;
    let json = sum.json(&w, timed_out);
    // (seat 0 is the plan's: the summary's first "player" is seat 0's)
    let json = json.replacen(
        "\"player\":\"AI (Hard)\"",
        &format!("\"player\":\"{LABEL}\""),
        1,
    );
    let json = format!(
        "{{\"plan_seat\":0,\"plan_applied\":{},{}",
        plan.applied,
        &json[1..]
    );
    let t = w.tick / TPS;
    let at = format!("{}:{:02}", t / 60, t % 60);
    let (me, foe) = (FACTIONS[g.races[0]].name, FACTIONS[g.races[1]].name);
    let verdict = match w.winner {
        0 => format!("WON at {at}"),
        1 => format!(
            "LOST at {at} ({})",
            match w.out_why[0] {
                OutWhy::Buildings => "destroyed",
                OutWhy::Conceded => "conceded",
                OutWhy::Helpless => "helpless: no units, no money",
                OutWhy::In => "still in",
            }
        ),
        _ => format!("TIMEOUT at {at} (no winner)"),
    };
    let line = format!(
        "Claude's plan ({me}) vs Hard ({foe}), {:?} {}x{} seed {}: {verdict}",
        g.map, g.size, g.size, g.seed
    );
    Played {
        summary: json,
        line,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_plan_is_clamped_and_reported() {
        let p = read_plan(
            r#"{"workers": 40, "first_wave": "1:00", "expand": "never", "towers": ["0:30","3:00"],
                "favor": "Knight", "wont_build": ["archers", "buggy"], "colour": 3}"#,
            0,
            96,
        )
        .unwrap();
        assert_eq!(p.diff.harv, 20);
        assert_eq!(p.diff.first, 120.0);
        assert!(p.diff.expand_at >= NEVER && p.diff.expand_at_of.is_empty());
        assert_eq!(p.diff.towers, &[60.0, 180.0]);
        assert_eq!(p.diff.focus, Some(UnitKind::Knight));
        assert_eq!(p.bans, 1 << UnitKind::Lancer.index());
        let all = p.notes.join("\n");
        for s in ["workers", "first_wave", "towers", "buggy", "colour"] {
            assert!(all.contains(s), "{s}: {all}");
        }
    }

    #[test]
    fn an_empty_plan_is_hard() {
        let p = read_plan("{}", 1, 96).unwrap();
        assert_eq!(p.diff.harv, DIFF[HARD].harv);
        assert_eq!(p.diff.first, DIFF[HARD].first);
        assert!(p.notes.is_empty() && p.bans == 0);
    }
}
