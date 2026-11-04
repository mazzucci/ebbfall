//! Each seat's first attack wave in a game (PRD: the tide on the Shore map, R8, "why later waves win"): its army
//! value as it launched, and its result, the value it destroyed against the value it lost while it was out. Read
//! between ticks only.
//!
//! A wave is out from the tick the seat's AI sends one (`World::ai_wave_of`) to the tick it has none. Its loss is
//! the value of its own units gone by then; what it destroyed, the value of the enemy's units and buildings standing
//! at its launch and gone by then (the enemy's losses elsewhere in that time count too: early in a game there are
//! few). Value: shards plus ether at `ETHER_WEIGHT`, the formula sheet's default.

use endfall_sim::world::World;

/// Shards per ether in a wave's value (the formula sheet's default weight).
pub const ETHER_WEIGHT: f64 = 1.5;

/// A seat's first wave: the tick it launched, its value then, and what it destroyed and lost while out.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FirstWave {
    pub at: u32,
    pub value: f64,
    pub destroyed: f64,
    pub lost: f64,
}

fn worth(c: [i32; 2]) -> f64 {
    c[0] as f64 + ETHER_WEIGHT * c[1] as f64
}

/// The value of whatever of `ids` still stands in `w`.
fn standing_value(w: &World, ids: &[(u32, f64)]) -> f64 {
    ids.iter()
        .filter(|(id, _)| w.unit(*id).is_some() || w.bldg(*id).is_some())
        .map(|(_, v)| v)
        .sum()
}

/// A wave being watched: its units and the enemy's things at its launch, with their values.
struct Out {
    at: u32,
    mine: Vec<(u32, f64)>,
    theirs: Vec<(u32, f64)>,
}

impl Out {
    fn done(&self, w: &World) -> FirstWave {
        let total = |v: &[(u32, f64)]| v.iter().map(|x| x.1).sum::<f64>();
        FirstWave {
            at: self.at,
            value: total(&self.mine),
            lost: total(&self.mine) - standing_value(w, &self.mine),
            destroyed: total(&self.theirs) - standing_value(w, &self.theirs),
        }
    }
}

/// Watches both seats' first waves through a game.
#[derive(Default)]
pub struct Watcher {
    out: [Option<Out>; 2],
    pub done: [Option<FirstWave>; 2],
}

impl Watcher {
    /// After a tick: a first wave launched, or one that came home (or was lost).
    pub fn observe(&mut self, w: &World) {
        for s in 0..2 {
            if self.done[s].is_some() {
                continue;
            }
            let wave = w.ai_wave_of(s as u8);
            match (&self.out[s], wave) {
                (None, Some(ids)) => {
                    let mine = ids
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
                    self.out[s] = Some(Out {
                        at: w.tick,
                        mine,
                        theirs,
                    });
                }
                (Some(o), None) => {
                    self.done[s] = Some(o.done(w));
                }
                _ => {}
            }
        }
    }
    /// At the game's end: a wave still out is taken as it stands.
    pub fn finish(mut self, w: &World) -> [Option<FirstWave>; 2] {
        for s in 0..2 {
            if self.done[s].is_none() {
                self.done[s] = self.out[s].as_ref().map(|o| o.done(w));
            }
        }
        self.done
    }
}

#[cfg(test)]
mod tests {
    use crate::plans::play_seats;
    use endfall_sim::data::{DIFF, Diff};
    use endfall_sim::map::MapKind;

    #[test]
    fn a_first_wave_is_recorded_once_with_its_value_and_result() {
        // Medium against Medium, the first waves at 2:00 and 3:00: both launch within ten minutes.
        let early = |t: f64| {
            Some(Diff {
                first: t,
                ..DIFF[1]
            })
        };
        let p = play_seats(
            MapKind::Standard,
            0,
            2,
            [early(120.0), early(180.0)],
            10,
            false,
        );
        for (s, at) in [(0, 120.0), (1, 180.0)] {
            let f = p.first_wave[s].unwrap_or_else(|| panic!("seat {s} sent a wave"));
            assert!(
                f.at as f64 / 30.0 > at,
                "seat {s}: not before its plan's time"
            );
            assert!(f.value > 0.0);
            assert!(
                (0.0..=f.value).contains(&f.lost),
                "seat {s}: lost {}",
                f.lost
            );
            assert!(f.destroyed >= 0.0);
        }
        // the same with the tide, on the Shore: it plays (the first waves as they come)
        let t = play_seats(MapKind::Shore, 0, 2, [early(120.0), early(180.0)], 6, true);
        assert!(t.end_tick > 0);
    }
}
