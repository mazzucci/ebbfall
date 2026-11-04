//! Every AI attack wave of a two-seat game (PRD: the AI breaks a defence, R1): its value as it launched, what it met
//! when it arrived (the first tick one of its units came within `REACH` tiles of an enemy building: its value then
//! against the defence there, the enemy's armed units and armed buildings within `REACH` tiles of that unit), its
//! result (the value it destroyed against the value it lost while out) and where its units fell (on the way, to
//! towers, to units). Read between ticks only.
//!
//! A wave is out from the tick its seat's AI sends one (`World::ai_wave_of`) to the tick it has none. What it
//! destroyed is the value of the enemy's units and buildings standing at its launch and gone by then (the enemy's
//! losses elsewhere in that time count too). A unit of the wave that fell after the arrival fell to a tower when the
//! seat's losses to buildings (`World::lost_to`) grew that tick, else to a unit. Value: shards plus ether at
//! `ETHER_WEIGHT`, the formula sheet's default.

use endfall_sim::data::UNIT_KINDS;
use endfall_sim::world::World;

/// Shards per ether in a wave's value (the formula sheet's default weight).
pub const ETHER_WEIGHT: f64 = 1.5;
/// A wave arrived when one of its units came this many tiles from an enemy building's edge; the defence it met is
/// what of the enemy's was armed within this many tiles of that unit.
pub const REACH: f64 = 8.0;

/// One wave.
#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub struct Wave {
    pub seat: u8,
    pub launched: u32,
    /// Its value as it launched.
    pub value: f64,
    /// The tick it arrived, its value then, and the defence's there (None: it never arrived).
    pub arrived: Option<(u32, f64, f64)>,
    pub destroyed: f64,
    pub lost: f64,
    /// Of `lost`: before it arrived, and after it to towers and to units.
    pub lost_on_way: f64,
    pub lost_to_towers: f64,
    pub lost_to_units: f64,
}

fn worth(c: [i32; 2]) -> f64 {
    c[0] as f64 + ETHER_WEIGHT * c[1] as f64
}

/// A wave out: its record so far, its units still standing (with their values) and the enemy's things at its launch.
struct Out {
    rec: Wave,
    mine: Vec<(u32, f64)>,
    theirs: Vec<(u32, f64)>,
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

impl Watch {
    /// After a tick.
    pub fn observe(&mut self, w: &World) {
        for s in 0..2 {
            let towers_now = lost_to_bldgs(w, s);
            let to_towers = towers_now - self.to_bldgs[s];
            self.to_bldgs[s] = towers_now;
            let wave = w.ai_wave_of(s as u8);
            if self.out[s].is_none() {
                if let Some(ids) = wave {
                    self.out[s] = Some(launch(w, s, ids));
                }
                continue;
            }
            let o = self.out[s].as_mut().unwrap();
            // its units that fell this tick
            let mut fell: Vec<f64> = vec![];
            o.mine.retain(|&(id, v)| {
                let alive = w.unit(id).is_some();
                if !alive {
                    fell.push(v);
                }
                alive
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
                let o = self.out[s].take().unwrap();
                self.waves.push(close(w, o));
            }
        }
    }
    /// At the game's end: a wave still out is taken as it stands.
    pub fn finish(mut self, w: &World) -> Vec<Wave> {
        for s in 0..2 {
            if let Some(o) = self.out[s].take() {
                self.waves.push(close(w, o));
            }
        }
        self.waves
    }
}

fn launch(w: &World, s: usize, ids: &[u32]) -> Out {
    let mine: Vec<(u32, f64)> = ids
        .iter()
        .filter_map(|&id| w.unit(id).map(|u| (id, worth(u.kind.def().cost))))
        .collect();
    let theirs = w
        .units
        .iter()
        .filter(|u| u.team as usize != s)
        .map(|u| (u.id, worth(u.kind.def().cost)))
        .chain(
            w.bldgs
                .iter()
                .filter(|b| b.team as usize != s)
                .map(|b| (b.id, worth(b.kind.def().cost))),
        )
        .collect();
    Out {
        rec: Wave {
            seat: s as u8,
            launched: w.tick,
            value: mine.iter().map(|m| m.1).sum(),
            ..Wave::default()
        },
        mine,
        theirs,
    }
}

/// Whether one of the wave's units stands within `REACH` tiles of an enemy building: the tick, the wave's value and
/// the defence's within `REACH` tiles of that unit (armed units, workers left out, and armed buildings).
fn arrival(w: &World, s: usize, mine: &[(u32, f64)]) -> Option<(u32, f64, f64)> {
    let reach = REACH * 32.0;
    let edge = |b: &endfall_sim::world::Bldg, x: f64, y: f64| {
        let dx = ((x - b.x).abs() - b.w as f64 * 16.0).max(0.0);
        let dy = ((y - b.y).abs() - b.h as f64 * 16.0).max(0.0);
        (dx * dx + dy * dy).sqrt()
    };
    let first = mine.iter().filter_map(|&(id, _)| w.unit(id)).find(|u| {
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
        .filter(|b| b.team as usize != s && b.done && b.kind.def().weapon.is_some())
        .filter(|b| edge(b, x, y) < reach)
        .map(|b| worth(b.kind.def().cost))
        .sum();
    Some((w.tick, mine.iter().map(|m| m.1).sum(), units + towers))
}

fn close(w: &World, o: Out) -> Wave {
    let mut rec = o.rec;
    let standing: f64 = o
        .theirs
        .iter()
        .filter(|(id, _)| w.unit(*id).is_some() || w.bldg(*id).is_some())
        .map(|(_, v)| v)
        .sum();
    rec.destroyed = o.theirs.iter().map(|t| t.1).sum::<f64>() - standing;
    rec
}

/// A group of waves summed up: how many launched and arrived (and arrived to no defence at all), the quartiles of
/// their value over the defence's at arrival (the defended ones), what they destroyed and lost, and where they lost it.
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
        if let Some((_, v, d)) = w.arrived {
            s.arrived += 1;
            if d > 0.0 {
                ratios.push(v / d);
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
pub const TABLE_HEAD: &str = "| Waves | Launched | Arrived (to no defence) | Value / defence at arrival (25%, median, 75%) | Destroyed / lost | Lost on the way / to towers / to units |\n| --- | --- | --- | --- | --- | --- |\n";

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

impl Wave {
    /// One wave as JSON.
    pub fn json(&self) -> crate::json::Json {
        crate::json::Json::obj()
            .with("seat", self.seat as u32)
            .with("launched", self.launched)
            .with("value", self.value)
            .with(
                "arrived",
                self.arrived.map(|(t, v, d)| {
                    crate::json::Json::obj()
                        .with("tick", t)
                        .with("value", v)
                        .with("defence", d)
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
        let (p, waves) = play_watched(MapKind::Standard, 0, 3, [early, early], 12, false);
        assert!(p.end_tick > 0);
        assert!(waves.len() >= 2, "{} waves", waves.len());
        assert!(waves.iter().any(|w| w.arrived.is_some()), "a wave arrived");
        for w in &waves {
            assert!(w.value > 0.0);
            let parts = w.lost_on_way + w.lost_to_towers + w.lost_to_units;
            assert!((w.lost - parts).abs() < 1e-9, "the losses add up: {w:?}");
            assert!(w.lost <= w.value + 1e-9, "no more lost than it had: {w:?}");
            assert!(w.destroyed >= 0.0);
            if let Some((t, v, d)) = w.arrived {
                assert!(t >= w.launched && v <= w.value + 1e-9 && d >= 0.0);
            } else {
                assert_eq!(w.lost_on_way, w.lost, "never arrived: all lost on the way");
            }
        }
        let s = summary(&waves);
        assert_eq!(s.launched, waves.len());
        assert!(s.row("all").starts_with("| all | "));
    }
}
