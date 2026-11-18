//! A plan for an AI seat (play against Claude; claude/PLAN_VOCAB.md): the strategy fields a writer may set on Hard's AI,
//! read from a compact code that a game link (`?plan=`) or an embedding page carries. Single player only: the sim
//! refuses it in lockstep (`Game::setPlan`, `Game::planDelta`) and it never goes over the network.
//!
//! The code, version 1: `1.<field>.<field>...`, lower-case letters and digits and dots only (a chat's link detection
//! keeps all of it). Each field is a letter and its value; times are `<m>m` or `<m>m<ss>` (`4m30`), `no` where a step
//! may be left out. `o` (a tower) and `n` (a unit it won't build) repeat; every other letter appears once. Intents
//! (`x...`) only in a delta (at the start they refuse the code), `n` only at the start (a delta's is dropped). The grammar is strict: anything else refuses the whole code. A
//! value out of its range is clamped, a unit that does not fit is dropped, and each adjustment is noted.
//!
//! Fields a plan leaves out keep Hard's numbers as the seat's drawn style plays them (`apply`): a plan overrides only
//! what it sets, and where a field conflicts with the style, the field wins.

use super::{Diff, Faction, NEVER, UNIT_KINDS, UnitKind};

/// The level a planned seat plays (Hard): its numbers and its drawn style are what a plan leaves out.
pub const PLAN_LEVEL: usize = 2;
/// The code's version (its first field).
pub const PLAN_VERSION: &str = "1";
/// The longest code taken.
pub const PLAN_MAX_LEN: usize = 160;
/// The most towers a plan asks for, and the most units it won't build.
pub const PLAN_MAX_TOWERS: usize = 6;
pub const PLAN_MAX_BANS: usize = 3;

/// The fields' ranges (seconds for times): workers, the first wave's time and size, expansion, barracks, the tech
/// building, the top tier, a tower, the later waves' least size, the least gap between waves.
pub const WORKERS: (u32, u32) = (8, 20);
pub const FIRST_WAVE: (f64, f64) = (120.0, 720.0);
pub const FIRST_SIZE: (u32, u32) = (4, 16);
pub const EXPAND: (f64, f64) = (180.0, 720.0);
pub const BARRACKS: (u32, u32) = (1, 4);
pub const TECH: (f64, f64) = (60.0, 600.0);
pub const TOP_TIER: (f64, f64) = (0.0, 1200.0);
pub const TOWER: (f64, f64) = (60.0, 1200.0);
pub const LATER_MIN: (u32, u32) = (4, 40);
pub const WAVE_GAP: (f64, f64) = (30.0, 300.0);

/// An immediate order for the plan seat's AI, in a delta (carried out at its next turn).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Intent {
    /// Its next wave goes now with what it has (no count, gap, time or strength to wait for).
    Attack,
    /// No wave leaves for `HOLD_FOR` seconds (an `Attack` ends the hold).
    Hold,
    /// The wave out comes back to its rally.
    PullBack,
    /// Its next wave waits for half again its count (four more at least, `LATER_MIN`'s top at most).
    Mass,
}

/// How long `Intent::Hold` keeps its waves home (s).
pub const HOLD_FOR: f64 = 120.0;

impl Intent {
    pub const ALL: [Intent; 4] = [Intent::Attack, Intent::Hold, Intent::PullBack, Intent::Mass];
    /// Its word in a code (after the `x`).
    pub fn word(self) -> &'static str {
        match self {
            Intent::Attack => "attack",
            Intent::Hold => "hold",
            Intent::PullBack => "pull",
            Intent::Mass => "mass",
        }
    }
}

/// A plan: each field a writer set (None: the seat's own Hard value). Times in seconds, `NEVER` for "no".
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Plan {
    pub workers: Option<u32>,
    pub first_wave: Option<f64>,
    pub first_size: Option<u32>,
    pub expand: Option<f64>,
    pub barracks: Option<u32>,
    pub tech: Option<f64>,
    /// 0: from the start.
    pub top_tier: Option<f64>,
    /// In time order; an empty list: no towers.
    pub towers: Option<Vec<f64>>,
    pub raids: Option<bool>,
    pub favor: Option<UnitKind>,
    pub wont_build: Vec<UnitKind>,
    pub later_min: Option<u32>,
    pub wave_gap: Option<f64>,
}

/// A code read: the fields it set, its intents (a delta's), and what was adjusted.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Parsed {
    pub plan: Plan,
    pub intents: Vec<Intent>,
    pub notes: Vec<String>,
}

/// Where a code is read: the plan a game starts with, or a delta during it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PlanAt {
    Start,
    Delta,
}

/// "m:ss" from seconds (whole seconds).
pub fn mmss(s: f64) -> String {
    let s = s.max(0.0).floor() as i64;
    format!("{}:{:02}", s / 60, s % 60)
}

/// A time in a code: `<m>m` or `<m>m<ss>` (m 0-99, ss 00-59).
fn read_time(v: &str) -> Option<f64> {
    let (m, s) = v.split_once('m')?;
    let digits = |x: &str, lo: usize, hi: usize| {
        (lo..=hi).contains(&x.len()) && x.bytes().all(|b| b.is_ascii_digit())
    };
    if !digits(m, 1, 2) || !(s.is_empty() || digits(s, 2, 2)) {
        return None;
    }
    let secs: u32 = if s.is_empty() { 0 } else { s.parse().ok()? };
    (secs < 60).then(|| m.parse::<u32>().ok().map(|m| (m * 60 + secs) as f64))?
}

/// A time as a code writes it: `6m`, `4m30`.
fn write_time(s: f64) -> String {
    let s = s.max(0.0).floor() as u32;
    if s.is_multiple_of(60) {
        format!("{}m", s / 60)
    } else {
        format!("{}m{:02}", s / 60, s % 60)
    }
}

/// The unit kinds a people trains (workers and kinds trained nowhere left out), in index order.
pub fn plan_fighters(f: &Faction) -> Vec<UnitKind> {
    let mut bldgs = vec![f.hq];
    bldgs.extend(f.build_basic.iter().chain(f.build_advanced));
    UNIT_KINDS
        .into_iter()
        .filter(|k| !k.def().worker && bldgs.iter().any(|b| b.def().trains.contains(k)))
        .collect()
}

/// A unit's word in a code: its name in lower case, letters only.
pub fn unit_word(k: UnitKind) -> String {
    k.def()
        .name
        .chars()
        .filter(|c| c.is_ascii_alphabetic())
        .map(|c| c.to_ascii_lowercase())
        .collect()
}

/// The unit a code's word names among every kind (None: no unit has that word).
fn unit_of_word(w: &str) -> Option<UnitKind> {
    UNIT_KINDS.into_iter().find(|&k| unit_word(k) == w)
}

impl Plan {
    /// Read a code for a seat of people `f`, at the start or as a delta. Err: the code is not one (its grammar), and
    /// nothing of it is taken.
    pub fn parse(code: &str, f: &Faction, at: PlanAt) -> Result<Parsed, String> {
        if code.len() > PLAN_MAX_LEN {
            return Err(format!("A plan code is at most {PLAN_MAX_LEN} characters"));
        }
        if !code
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'.')
        {
            return Err("A plan code has only lower-case letters, digits and dots".into());
        }
        let mut parts = code.split('.');
        if parts.next() != Some(PLAN_VERSION) {
            return Err(format!(
                "A plan code starts with its version, {PLAN_VERSION}"
            ));
        }
        let mut out = Parsed::default();
        let (p, notes) = (&mut out.plan, &mut out.notes);
        let mut seen: Vec<u8> = Vec::new();
        let mut towers: Vec<f64> = Vec::new();
        let mut no_towers = false;
        for part in parts {
            let key = *part
                .as_bytes()
                .first()
                .ok_or("An empty field in the plan code")?;
            let v = &part[1..];
            if !matches!(key, b'o' | b'n' | b'x') {
                if seen.contains(&key) {
                    return Err(format!("'{}' appears twice", key as char));
                }
                seen.push(key);
            }
            let bad = || format!("'{part}' is not a field the plan vocabulary knows");
            let int = |v: &str| {
                (!v.is_empty() && v.len() <= 3 && v.bytes().all(|b| b.is_ascii_digit()))
                    .then(|| v.parse::<u32>().unwrap())
            };
            let time = |v: &str| read_time(v);
            let time_or_no = |v: &str| {
                if v == "no" { Some(NEVER) } else { read_time(v) }
            };
            match key {
                b'w' => {
                    p.workers = Some(clamp_n(notes, "workers", int(v).ok_or_else(bad)?, WORKERS))
                }
                b'f' => {
                    p.first_wave = Some(clamp_t(
                        notes,
                        "first wave",
                        time(v).ok_or_else(bad)?,
                        FIRST_WAVE,
                    ))
                }
                b's' => {
                    p.first_size = Some(clamp_n(
                        notes,
                        "first wave size",
                        int(v).ok_or_else(bad)?,
                        FIRST_SIZE,
                    ))
                }
                b'e' => {
                    p.expand = Some(clamp_t(
                        notes,
                        "expand",
                        time_or_no(v).ok_or_else(bad)?,
                        EXPAND,
                    ))
                }
                b'b' => {
                    p.barracks = Some(clamp_n(
                        notes,
                        "barracks",
                        int(v).ok_or_else(bad)?,
                        BARRACKS,
                    ))
                }
                b't' => {
                    p.tech = Some(clamp_t(
                        notes,
                        "tech building",
                        time_or_no(v).ok_or_else(bad)?,
                        TECH,
                    ))
                }
                b'k' => {
                    p.top_tier = Some(clamp_t(
                        notes,
                        "top tier",
                        time_or_no(v).ok_or_else(bad)?,
                        TOP_TIER,
                    ))
                }
                b'o' if v == "no" => no_towers = true,
                b'o' => {
                    let t = clamp_t(notes, "tower", time(v).ok_or_else(bad)?, TOWER);
                    if towers.len() >= PLAN_MAX_TOWERS {
                        notes.push(format!(
                            "tower {}: at most {PLAN_MAX_TOWERS} towers, dropped",
                            mmss(t)
                        ));
                    } else {
                        towers.push(t);
                    }
                }
                b'r' => {
                    p.raids = Some(match v {
                        "1" => true,
                        "0" => false,
                        _ => return Err(bad()),
                    })
                }
                b'p' => {
                    let k = unit_of_word(v).ok_or_else(bad)?;
                    let mix: Vec<UnitKind> = f.ai.mix.iter().map(|m| m.0).collect();
                    if mix.contains(&k) {
                        p.favor = Some(k);
                    } else {
                        notes.push(format!(
                            "favor {v}: not one the {} leans on ({}), dropped",
                            f.name,
                            mix.iter()
                                .map(|&k| unit_word(k))
                                .collect::<Vec<_>>()
                                .join(", ")
                        ));
                    }
                }
                b'n' => {
                    let k = unit_of_word(v).ok_or_else(bad)?;
                    if at == PlanAt::Delta {
                        notes.push(format!("won't build {v}: set at the start only, dropped"));
                    } else if k == f.ai.basic {
                        notes.push(format!(
                            "won't build {v}: the {}'s line unit stays, dropped",
                            f.name
                        ));
                    } else if !plan_fighters(f).contains(&k) {
                        notes.push(format!("won't build {v}: not a {} unit, dropped", f.name));
                    } else if p.wont_build.contains(&k) {
                    } else if p.wont_build.len() >= PLAN_MAX_BANS {
                        notes.push(format!(
                            "won't build {v}: at most {PLAN_MAX_BANS} units, dropped"
                        ));
                    } else {
                        p.wont_build.push(k);
                    }
                }
                b'm' => {
                    p.later_min = Some(clamp_n(
                        notes,
                        "later waves",
                        int(v).ok_or_else(bad)?,
                        LATER_MIN,
                    ))
                }
                b'g' => {
                    p.wave_gap = Some(clamp_t(
                        notes,
                        "wave gap",
                        time(v).ok_or_else(bad)?,
                        WAVE_GAP,
                    ))
                }
                b'x' => {
                    let i = Intent::ALL
                        .into_iter()
                        .find(|i| i.word() == v)
                        .ok_or_else(bad)?;
                    if at == PlanAt::Start {
                        return Err(format!("'{part}': an intent is for during the game"));
                    } else if !out.intents.contains(&i) {
                        out.intents.push(i);
                    }
                }
                _ => return Err(bad()),
            }
        }
        if no_towers && !towers.is_empty() {
            return Err("'ono' and a tower time together".into());
        }
        if no_towers || !towers.is_empty() {
            towers.sort_by(f64::total_cmp);
            out.plan.towers = Some(towers);
        }
        Ok(out)
    }

    /// The plan as a code, its fields in the vocabulary's order (what `parse` reads back to the same plan).
    pub fn code(&self) -> String {
        let mut s = String::from(PLAN_VERSION);
        let mut put = |k: char, v: String| {
            s.push('.');
            s.push(k);
            s.push_str(&v);
        };
        let t_or_no = |t: f64| {
            if t >= NEVER {
                "no".to_string()
            } else {
                write_time(t)
            }
        };
        if let Some(n) = self.workers {
            put('w', n.to_string());
        }
        if let Some(t) = self.first_wave {
            put('f', write_time(t));
        }
        if let Some(n) = self.first_size {
            put('s', n.to_string());
        }
        if let Some(t) = self.expand {
            put('e', t_or_no(t));
        }
        if let Some(n) = self.barracks {
            put('b', n.to_string());
        }
        if let Some(t) = self.tech {
            put('t', t_or_no(t));
        }
        if let Some(t) = self.top_tier {
            put('k', t_or_no(t));
        }
        match &self.towers {
            Some(ts) if ts.is_empty() => put('o', "no".into()),
            Some(ts) => ts.iter().for_each(|&t| put('o', write_time(t))),
            None => {}
        }
        if let Some(r) = self.raids {
            put('r', (r as u8).to_string());
        }
        if let Some(k) = self.favor {
            put('p', unit_word(k));
        }
        for &k in &self.wont_build {
            put('n', unit_word(k));
        }
        if let Some(n) = self.later_min {
            put('m', n.to_string());
        }
        if let Some(t) = self.wave_gap {
            put('g', write_time(t));
        }
        s
    }

    /// A delta's fields over this plan: each one it sets replaces this one's (its towers the whole list).
    pub fn merge(&mut self, d: &Plan) {
        macro_rules! over {
            ($($f:ident),*) => { $( if d.$f.is_some() { self.$f = d.$f.clone(); } )* };
        }
        over!(
            workers, first_wave, first_size, expand, barracks, tech, top_tier, towers, raids,
            favor, later_min, wave_gap
        );
    }

    /// Whether it bars kind `k` (`wont_build`).
    pub fn bans(&self, k: UnitKind) -> bool {
        self.wont_build.contains(&k)
    }

    /// Hard's tuning as the seat's drawn style plays it (`styled`), with this plan's fields over it: a field it sets
    /// wins over the style. Its towers are read from the plan itself (`World::tower_times`).
    pub fn apply(&self, base: Diff) -> Diff {
        let mut d = base;
        if let Some(n) = self.workers {
            d.harv = n as usize;
        }
        if let Some(t) = self.first_wave {
            d.first = t;
        }
        if let Some(n) = self.first_size {
            d.wave = n as usize;
        }
        if let Some(t) = self.expand {
            d.expand_at = t;
            d.expand_at_of = &[];
            d.expand_shift = 0.0; // (the field wins over the style's shift)
        }
        if let Some(n) = self.barracks {
            d.rax = n as usize;
            d.extra_rax = n as usize + 1;
        }
        if let Some(t) = self.tech {
            d.tech_at = t;
            if t >= NEVER {
                d.research_from = NEVER; // (no upgrades, nothing that needs it)
            } else if t <= 90.0 {
                // (its techs at once: the balance lab's tech-first plan; the style's later tech gives way)
                d.tech_from = 120.0;
                d.tech_not_before = 0.0;
            }
        }
        if let Some(t) = self.top_tier {
            if t <= 0.0 {
                d.mix_tier = d.mix_tier.max(2);
                d.tier_at = [NEVER, NEVER];
            } else {
                d.tier_at = [t, NEVER];
            }
        }
        if self.towers.is_some() {
            d.tower_max = &[];
        }
        if let Some(r) = self.raids {
            d.raids = r;
        }
        if let Some(k) = self.favor {
            d.focus = Some(k);
        }
        if let Some(n) = self.later_min {
            d.later_min = n as usize;
            d.wave_max = d.wave_max.max(n as usize);
        }
        if let Some(t) = self.wave_gap {
            d.gap = t;
        }
        d
    }
}

fn clamp_n(notes: &mut Vec<String>, name: &str, v: u32, (lo, hi): (u32, u32)) -> u32 {
    let c = v.clamp(lo, hi);
    if c != v {
        notes.push(format!("{name} {v}: clamped to {c} ({lo} to {hi})"));
    }
    c
}

fn clamp_t(notes: &mut Vec<String>, name: &str, v: f64, (lo, hi): (f64, f64)) -> f64 {
    if v >= NEVER {
        return v;
    }
    let c = v.clamp(lo, hi);
    if c != v {
        notes.push(format!(
            "{name} {}: clamped to {} ({} to {})",
            mmss(v),
            mmss(c),
            mmss(lo),
            mmss(hi)
        ));
    }
    c
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::{DIFF, HUMANS, VAEL};

    #[test]
    fn a_code_reads_back_to_itself_in_the_vocabulary_s_order() {
        let code = "1.w14.f6m.s12.e7m30.b2.t2m.k8m.o2m30.o5m.r0.parcher.ncannon.nknight.m20.g1m30";
        let p = Plan::parse(code, &HUMANS, PlanAt::Start).unwrap();
        assert!(p.notes.is_empty(), "{:?}", p.notes);
        assert_eq!(p.plan.code(), code);
        let shuffled = "1.m20.w14.o5m.f6m.ncannon.s12";
        let q = Plan::parse(shuffled, &HUMANS, PlanAt::Start).unwrap();
        assert_eq!(q.plan.code(), "1.w14.f6m.s12.o5m.ncannon.m20");
        assert_eq!(
            Plan::parse(&q.plan.code(), &HUMANS, PlanAt::Start)
                .unwrap()
                .plan,
            q.plan
        );
    }

    #[test]
    fn the_grammar_is_strict_and_values_are_clamped() {
        for bad in [
            "",
            "2.w14",
            "1.w14.w15",
            "1.W14",
            "1.w",
            "1.z3",
            "1.f6",
            "1.f6m5",
            "1.f6m75",
            "1.r2",
            "1.pguards",
            "1.o5m.ono",
            "1..w14",
            "1.w14.",
            "1.w1000",
            "1.w 14",
            "1.xjump",
        ] {
            assert!(Plan::parse(bad, &HUMANS, PlanAt::Delta).is_err(), "{bad}");
        }
        let p = Plan::parse(
            "1.w40.f1m.s2.e20m.k30m.o0m30.m99.g9m",
            &HUMANS,
            PlanAt::Start,
        )
        .unwrap();
        assert_eq!(p.plan.workers, Some(20));
        assert_eq!(p.plan.first_wave, Some(120.0));
        assert_eq!(p.plan.first_size, Some(4));
        assert_eq!(p.plan.expand, Some(720.0));
        assert_eq!(p.plan.top_tier, Some(1200.0));
        assert_eq!(p.plan.towers, Some(vec![60.0]));
        assert_eq!((p.plan.later_min, p.plan.wave_gap), (Some(40), Some(300.0)));
        assert_eq!(p.notes.len(), 8, "{:?}", p.notes);
        let no = Plan::parse("1.eno.tno.kno.ono", &HUMANS, PlanAt::Start)
            .unwrap()
            .plan;
        assert_eq!(
            (no.expand, no.tech, no.top_tier),
            (Some(NEVER), Some(NEVER), Some(NEVER))
        );
        assert_eq!(no.towers, Some(vec![]));
    }

    #[test]
    fn wont_build_keeps_the_line_unit_and_its_own_people_s_units_and_only_at_the_start() {
        let p = Plan::parse(
            "1.nguard.nsellsword.narcher.nballoon.nrider.nknight",
            &HUMANS,
            PlanAt::Start,
        )
        .unwrap();
        assert_eq!(
            p.plan.wont_build,
            vec![UnitKind::Lancer, UnitKind::Observer, UnitKind::Rider]
        );
        assert_eq!(p.notes.len(), 3, "{:?}", p.notes);
        let v = Plan::parse("1.nsellsword.ndrone", &VAEL, PlanAt::Start).unwrap();
        assert_eq!(v.plan.wont_build.len(), 1);
        let d = Plan::parse("1.narcher.xattack.xmass", &HUMANS, PlanAt::Delta).unwrap();
        assert!(d.plan.wont_build.is_empty());
        assert_eq!(d.intents, vec![Intent::Attack, Intent::Mass]);
        assert!(Plan::parse("1.xattack", &HUMANS, PlanAt::Start).is_err());
    }

    #[test]
    fn an_empty_plan_is_the_tuning_it_is_given_and_a_field_wins_over_the_style() {
        let base = crate::data::styled(
            DIFF[2],
            2,
            crate::data::Style::Pressure,
            HUMANS.ai.mix,
            &crate::data::StyleDraws([0.3; 6]),
        );
        assert_eq!(Plan::default().apply(base), base);
        let p = Plan::parse("1.f5m.e6m.k7m", &HUMANS, PlanAt::Start)
            .unwrap()
            .plan;
        let d = p.apply(base);
        assert_eq!(
            (d.first, d.expand_at, d.expand_shift, d.tier_at),
            (300.0, 360.0, 0.0, [420.0, NEVER])
        );
        assert!(d.expand_at_of.is_empty());
    }

    #[test]
    fn a_delta_replaces_only_what_it_sets() {
        let mut p = Plan::parse("1.w14.o2m.o5m.m20", &HUMANS, PlanAt::Start)
            .unwrap()
            .plan;
        p.merge(
            &Plan::parse("1.o9m.g2m", &HUMANS, PlanAt::Delta)
                .unwrap()
                .plan,
        );
        assert_eq!(p.code(), "1.w14.o9m.m20.g2m");
    }
}
