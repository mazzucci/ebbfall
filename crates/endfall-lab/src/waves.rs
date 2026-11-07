//! Every AI attack wave of a two-seat game (PRD: the AI breaks a defence, R1): its value as it launched, what it met
//! when it arrived (the first tick one of its units came within `REACH` tiles of an enemy building: the wave's value
//! then, in all and within `REACH` tiles of that unit, against the defence there, the enemy's armed units and armed,
//! working buildings within `REACH` tiles of that unit), its result (the value it destroyed against the value it lost
//! while out) and where its units fell (on the way, to towers, to units). Read between ticks only.
//!
//! A wave is out from the tick its seat's AI sends one (`World::ai_wave_of`) to the tick it has none; losses after it
//! (survivors caught on the way home) are not its. What it destroyed is the value of the enemy's units and buildings
//! that fell within `REACH` tiles of one of its living units (where both stood the tick before), whenever they were
//! made. A unit of the wave that fell after the arrival fell to a tower when the seat's losses to buildings
//! (`World::lost_to`) grew that tick, else to a unit (or to anything without a killer: the tide's sweep). With a split
//! wave (Hard and up: a prong at an expansion) the arrival is whichever prong arrives first. Value: shards plus ether
//! at `ETHER_WEIGHT`, the formula sheet's default.

use endfall_sim::data::UNIT_KINDS;
use endfall_sim::world::{LaunchCheck, LaunchWhy, World};

/// Shards per ether in a wave's value (the formula sheet's default weight).
pub const ETHER_WEIGHT: f64 = 1.5;
/// A wave arrived when one of its units came this many tiles from an enemy building's edge; the defence it met is
/// what of the enemy's was armed within this many tiles of that unit; what fell this near one of its units, it destroyed.
pub const REACH: f64 = 8.0;

/// One wave.
#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub struct Wave {
    pub seat: u8,
    pub launched: u32,
    /// Its value as it launched.
    pub value: f64,
    /// The AI's own check as it went (`World::ai_launch_check`): why, and the foe's army it expected.
    pub check: Option<LaunchCheck>,
    /// The foe's true army then (armed units, workers left out) and its armed, working buildings, by value.
    pub foe_army: f64,
    pub foe_towers: f64,
    /// When it arrived: the tick, its value then (in all, and within `REACH` tiles of the unit that arrived), and the
    /// defence's there (None: it never arrived).
    pub arrived: Option<Arrival>,
    pub destroyed: f64,
    pub lost: f64,
    /// Of `lost`: before it arrived, and after it to towers and to units.
    pub lost_on_way: f64,
    pub lost_to_towers: f64,
    pub lost_to_units: f64,
}

/// A wave's arrival.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Arrival {
    pub tick: u32,
    pub value: f64,
    pub near: f64,
    pub defence: f64,
}

/// A cost's value: shards plus ether at `ETHER_WEIGHT`.
pub fn worth(c: [i32; 2]) -> f64 {
    c[0] as f64 + ETHER_WEIGHT * c[1] as f64
}

/// Something standing, as last seen: (id, value, x, y).
type Seen = (u32, f64, f64, f64);

/// A wave out: its record so far, its units still standing and the enemy's things, each as seen the tick before.
struct Out {
    rec: Wave,
    mine: Vec<Seen>,
    theirs: Vec<Seen>,
}

/// Watches both seats' waves through a game.
#[derive(Default)]
pub struct Watch {
    out: [Option<Out>; 2],
    /// Each seat's losses to buildings so far (`lost_to`'s building slots, summed).
    to_bldgs: [u32; 2],
    pub waves: Vec<Wave>,
}

/// A seat's units lost to buildings so far.
fn lost_to_bldgs(w: &World, s: usize) -> u32 {
    w.lost_to
        .get(s)
        .map_or(0, |row| row.iter().skip(UNIT_KINDS.len()).sum())
}

/// What of the enemy of seat `s` stands now, with values and places, by id (units and buildings share one id
/// sequence: `observe` looks them up by binary search).
fn enemies(w: &World, s: usize) -> Vec<Seen> {
    let mut v: Vec<Seen> = w
        .units
        .iter()
        .filter(|u| u.team as usize != s)
        .map(|u| (u.id, worth(u.kind.def().cost), u.x, u.y))
        .chain(
            w.bldgs
                .iter()
                .filter(|b| b.team as usize != s)
                .map(|b| (b.id, worth(b.kind.def().cost), b.x, b.y)),
        )
        .collect();
    v.sort_unstable_by_key(|e| e.0);
    v
}

impl Watch {
    /// After a tick.
    pub fn observe(&mut self, w: &World) {
        for s in 0..2 {
            let towers_now = lost_to_bldgs(w, s);
            let to_towers = towers_now.saturating_sub(self.to_bldgs[s]);
            self.to_bldgs[s] = towers_now;
            let wave = w.ai_wave_of(s as u8);
            if self.out[s].is_none() {
                if let Some(ids) = wave {
                    self.out[s] = Some(launch(w, s, ids));
                }
                continue;
            }
            let o = self.out[s].as_mut().unwrap();
            // what of the enemy's fell near one of its units (both where they stood the tick before)
            let now = enemies(w, s);
            let near = REACH * 32.0;
            for &(id, v, x, y) in &o.theirs {
                let gone = now.binary_search_by_key(&id, |e| e.0).is_err();
                if gone && o.mine.iter().any(|m| (m.2 - x).hypot(m.3 - y) < near) {
                    o.rec.destroyed += v;
                }
            }
            o.theirs = now;
            // its units that fell this tick, and where the rest stand now
            let mut fell: Vec<f64> = vec![];
            o.mine.retain_mut(|m| match w.unit(m.0) {
                Some(u) => {
                    (m.2, m.3) = (u.x, u.y);
                    true
                }
                None => {
                    fell.push(m.1);
                    false
                }
            });
            let mut towers = to_towers as usize;
            for v in fell {
                o.rec.lost += v;
                if o.rec.arrived.is_none() {
                    o.rec.lost_on_way += v;
                } else if towers > 0 {
                    towers -= 1;
                    o.rec.lost_to_towers += v;
                } else {
                    o.rec.lost_to_units += v;
                }
            }
            if o.rec.arrived.is_none() {
                o.rec.arrived = arrival(w, s, &o.mine);
            }
            if wave.is_none() {
                self.waves.push(self.out[s].take().unwrap().rec);
            }
        }
    }
    /// At the game's end: a wave still out is taken as it stands.
    pub fn finish(mut self, _w: &World) -> Vec<Wave> {
        for s in 0..2 {
            if let Some(o) = self.out[s].take() {
                self.waves.push(o.rec);
            }
        }
        self.waves
    }
}

fn launch(w: &World, s: usize, ids: &[u32]) -> Out {
    let mine: Vec<Seen> = ids
        .iter()
        .filter_map(|&id| w.unit(id).map(|u| (id, worth(u.kind.def().cost), u.x, u.y)))
        .collect();
    let theirs = enemies(w, s);
    Out {
        rec: Wave {
            seat: s as u8,
            launched: w.tick,
            value: mine.iter().map(|m| m.1).sum(),
            check: w.ai_launch_check(s as u8),
            foe_army: army_of(w, |t| t != s),
            foe_towers: w
                .bldgs
                .iter()
                .filter(|b| b.team as usize != s && working_tower(b))
                .map(|b| worth(b.kind.def().cost))
                .sum(),
            ..Wave::default()
        },
        mine,
        theirs,
    }
}

/// The worth of the armed units (workers left out) of the seats `keep` keeps.
pub fn army_of(w: &World, keep: impl Fn(usize) -> bool) -> f64 {
    w.units
        .iter()
        .filter(|u| keep(u.team as usize) && !u.kind.def().worker && u.kind.def().armed())
        .map(|u| worth(u.kind.def().cost))
        .sum()
}

/// An armed building that works: a finished one.
fn working_tower(b: &endfall_sim::world::Bldg) -> bool {
    b.done && b.kind.def().weapon.is_some()
}

/// Whether one of the wave's units stands within `REACH` tiles of an enemy building: the tick, the wave's value (in
/// all and within `REACH` tiles of that unit) and the defence's within `REACH` tiles of it (armed units, workers left
/// out, and armed buildings that work: finished ones).
fn arrival(w: &World, s: usize, mine: &[Seen]) -> Option<Arrival> {
    let reach = REACH * 32.0;
    let edge = |b: &endfall_sim::world::Bldg, x: f64, y: f64| {
        let dx = ((x - b.x).abs() - b.w as f64 * 16.0).max(0.0);
        let dy = ((y - b.y).abs() - b.h as f64 * 16.0).max(0.0);
        (dx * dx + dy * dy).sqrt()
    };
    let first = mine.iter().filter_map(|m| w.unit(m.0)).find(|u| {
        w.bldgs
            .iter()
            .any(|b| b.team as usize != s && edge(b, u.x, u.y) < reach)
    })?;
    let (x, y) = (first.x, first.y);
    let units: f64 = w
        .units
        .iter()
        .filter(|u| u.team as usize != s && !u.kind.def().worker && u.kind.def().weapon.is_some())
        .filter(|u| (u.x - x).hypot(u.y - y) < reach)
        .map(|u| worth(u.kind.def().cost))
        .sum();
    let towers: f64 = w
        .bldgs
        .iter()
        .filter(|b| b.team as usize != s && working_tower(b))
        .filter(|b| edge(b, x, y) < reach)
        .map(|b| worth(b.kind.def().cost))
        .sum();
    Some(Arrival {
        tick: w.tick,
        value: mine.iter().map(|m| m.1).sum(),
        near: mine
            .iter()
            .filter(|m| (m.2 - x).hypot(m.3 - y) < reach)
            .map(|m| m.1)
            .sum(),
        defence: units + towers,
    })
}

/// A group of waves summed up: how many launched and arrived (and arrived to no defence at all), the quartiles of
/// their value near the arriving unit over the defence's there (the defended ones), what they destroyed and lost, and
/// where they lost it.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Summary {
    pub launched: usize,
    pub arrived: usize,
    pub undefended: usize,
    /// (25%, median, 75%) of value / defence at arrival; None without a defended arrival.
    pub ratio: Option<(f64, f64, f64)>,
    pub destroyed: f64,
    pub lost: f64,
    pub lost_on_way: f64,
    pub lost_to_towers: f64,
    pub lost_to_units: f64,
}

pub fn summary<'a>(waves: impl IntoIterator<Item = &'a Wave>) -> Summary {
    let mut s = Summary::default();
    let mut ratios = vec![];
    for w in waves {
        s.launched += 1;
        if let Some(a) = w.arrived {
            s.arrived += 1;
            if a.defence > 0.0 {
                ratios.push(a.near / a.defence);
            } else {
                s.undefended += 1;
            }
        }
        s.destroyed += w.destroyed;
        s.lost += w.lost;
        s.lost_on_way += w.lost_on_way;
        s.lost_to_towers += w.lost_to_towers;
        s.lost_to_units += w.lost_to_units;
    }
    use crate::stats::quantile;
    s.ratio = (!ratios.is_empty()).then(|| {
        (
            quantile(&ratios, 0.25).unwrap(),
            quantile(&ratios, 0.5).unwrap(),
            quantile(&ratios, 0.75).unwrap(),
        )
    });
    s
}

/// The Markdown table's head for `row`.
pub const TABLE_HEAD: &str = "| Waves | Launched | Arrived (to no defence) | Value near / defence at arrival (25%, median, 75%) | Destroyed near it / lost | Lost on the way / to towers / to units |\n| --- | --- | --- | --- | --- | --- |\n";

impl Summary {
    pub fn row(&self, label: &str) -> String {
        let pct = |a: f64| {
            if self.lost > 0.0 {
                format!("{:.0}%", 100.0 * a / self.lost)
            } else {
                "—".into()
            }
        };
        format!(
            "| {label} | {} | {} ({}) | {} | {} | {} / {} / {} |\n",
            self.launched,
            self.arrived,
            self.undefended,
            self.ratio
                .map_or("—".into(), |(a, b, c)| format!("{a:.2}, {b:.2}, {c:.2}")),
            if self.lost > 0.0 {
                format!(
                    "{:.2} ({:.0} / {:.0})",
                    self.destroyed / self.lost,
                    self.destroyed,
                    self.lost
                )
            } else {
                format!("— ({:.0} / 0)", self.destroyed)
            },
            pct(self.lost_on_way),
            pct(self.lost_to_towers),
            pct(self.lost_to_units),
        )
    }
    pub fn json(&self) -> crate::json::Json {
        let r = self.ratio.map(|(a, b, c)| vec![a, b, c]);
        crate::json::Json::obj()
            .with("launched", self.launched)
            .with("arrived", self.arrived)
            .with("undefended", self.undefended)
            .with("ratio_quartiles", r)
            .with("destroyed", self.destroyed)
            .with("lost", self.lost)
            .with("lost_on_way", self.lost_on_way)
            .with("lost_to_towers", self.lost_to_towers)
            .with("lost_to_units", self.lost_to_units)
    }
}

/// Why waves went and how the AI's expectation met the truth (PRD: the AI breaks a defence): how many went for each
/// reason (`LaunchWhy`), the quartiles of the foe army it expected over the foe's true army as it went (the waves that
/// went against an expectation, against a foe with an army), of the wave's worth over that true army, and of the share
/// of its value at the front on arrival (within `REACH` tiles of the unit that arrived).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Checks {
    /// No margin, all in, never seen, fresh, stale; and no check at all.
    pub why: [usize; 6],
    pub expected_over_true: Option<(f64, f64, f64)>,
    pub wave_over_true: Option<(f64, f64, f64)>,
    pub front_share: Option<(f64, f64, f64)>,
}

fn quartiles(xs: &[f64]) -> Option<(f64, f64, f64)> {
    use crate::stats::quantile;
    Some((quantile(xs, 0.25)?, quantile(xs, 0.5)?, quantile(xs, 0.75)?))
}

pub fn checks<'a>(waves: impl IntoIterator<Item = &'a Wave>) -> Checks {
    let mut c = Checks::default();
    let (mut est, mut own, mut front) = (vec![], vec![], vec![]);
    for w in waves {
        let i = match w.check.map(|k| k.why) {
            Some(LaunchWhy::NoMargin) => 0,
            Some(LaunchWhy::AllIn) => 1,
            Some(LaunchWhy::NeverSeen) => 2,
            Some(LaunchWhy::Fresh) => 3,
            Some(LaunchWhy::Stale) => 4,
            None => 5,
        };
        c.why[i] += 1;
        if w.foe_army > 0.0 {
            own.push(w.value / w.foe_army);
            if let Some(k) = w.check.filter(|k| k.expected > 0.0) {
                est.push(k.expected / w.foe_army);
            }
        }
        if let Some(a) = w.arrived.filter(|a| a.value > 0.0) {
            front.push(a.near / a.value);
        }
    }
    c.expected_over_true = quartiles(&est);
    c.wave_over_true = quartiles(&own);
    c.front_share = quartiles(&front);
    c
}

/// The Markdown table's head for `Checks::row`.
pub const CHECKS_HEAD: &str = "| Waves | Went: no margin / all in / never seen / fresh / stale / unknown | Expected foe army / its true army at launch (25%, median, 75%) | Wave / foe's true army at launch | Share of the wave at the front on arrival |\n| --- | --- | --- | --- | --- |\n";

impl Checks {
    pub fn row(&self, label: &str) -> String {
        let q = |x: Option<(f64, f64, f64)>| {
            x.map_or("—".into(), |(a, b, c)| format!("{a:.2}, {b:.2}, {c:.2}"))
        };
        let w = self.why;
        format!(
            "| {label} | {} / {} / {} / {} / {} / {} | {} | {} | {} |\n",
            w[0],
            w[1],
            w[2],
            w[3],
            w[4],
            w[5],
            q(self.expected_over_true),
            q(self.wave_over_true),
            q(self.front_share)
        )
    }
    pub fn json(&self) -> crate::json::Json {
        let q = |x: Option<(f64, f64, f64)>| x.map(|(a, b, c)| vec![a, b, c]);
        crate::json::Json::obj()
            .with("why", self.why.to_vec())
            .with("expected_over_true", q(self.expected_over_true))
            .with("wave_over_true", q(self.wave_over_true))
            .with("front_share", q(self.front_share))
    }
}

impl Wave {
    /// One wave as JSON.
    pub fn json(&self) -> crate::json::Json {
        crate::json::Json::obj()
            .with("seat", self.seat as u32)
            .with("launched", self.launched)
            .with("value", self.value)
            .with(
                "check",
                self.check.map(|k| {
                    crate::json::Json::obj()
                        .with("why", format!("{:?}", k.why))
                        .with("mine", k.mine)
                        .with("expected", k.expected)
                }),
            )
            .with("foe_army", self.foe_army)
            .with("foe_towers", self.foe_towers)
            .with(
                "arrived",
                self.arrived.map(|a| {
                    crate::json::Json::obj()
                        .with("tick", a.tick)
                        .with("value", a.value)
                        .with("near", a.near)
                        .with("defence", a.defence)
                }),
            )
            .with("destroyed", self.destroyed)
            .with("lost", self.lost)
            .with("lost_on_way", self.lost_on_way)
            .with("lost_to_towers", self.lost_to_towers)
            .with("lost_to_units", self.lost_to_units)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plans::play_watched;
    use endfall_sim::data::{DIFF, Diff};
    use endfall_sim::map::MapKind;

    #[test]
    fn every_wave_is_recorded_with_its_arrival_and_its_losses_add_up() {
        // Medium against Medium, both sending waves early: within twelve minutes some launch and some arrive.
        let early = Some(Diff {
            first: 120.0,
            ..DIFF[1]
        });
        let (p, waves, _) = play_watched(MapKind::Standard, 0, 3, [early, early], 12, false);
        assert!(p.end_tick > 0);
        assert!(waves.len() >= 2, "{} waves", waves.len());
        assert!(waves.iter().any(|w| w.arrived.is_some()), "a wave arrived");
        for w in &waves {
            assert!(w.value > 0.0);
            let parts = w.lost_on_way + w.lost_to_towers + w.lost_to_units;
            assert!((w.lost - parts).abs() < 1e-9, "the losses add up: {w:?}");
            assert!(w.lost <= w.value + 1e-9, "no more lost than it had: {w:?}");
            assert!(w.destroyed >= 0.0);
            // (each thing counted once, when it falls: no wave destroys more than a whole base's worth and an army)
            assert!(w.destroyed < 20_000.0, "destroyed counted once: {w:?}");
            if let Some(a) = w.arrived {
                assert!(a.tick >= w.launched && a.value <= w.value + 1e-9 && a.defence >= 0.0);
                assert!(
                    a.near <= a.value + 1e-9 && a.near > 0.0,
                    "the arriving unit itself is near"
                );
            } else {
                assert_eq!(w.lost_on_way, w.lost, "never arrived: all lost on the way");
            }
        }
        let s = summary(&waves);
        assert_eq!(s.launched, waves.len());
        assert!(s.row("all").starts_with("| all | "));
    }
}
