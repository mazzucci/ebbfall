//! Each seat's economy and forces minute by minute (PRD: the AI breaks a defence: does out-expanding a passive foe
//! pay?): at every whole minute of game time, for each of a two-seat game's seats, what it has mined so far (shards
//! plus ether at `waves::ETHER_WEIGHT`), its workers, its finished headquarters, its army's worth (armed units, workers
//! left out) and its supply used. Read between ticks only.

use crate::waves::{army_of, worth};
use endfall_sim::world::World;

/// Ticks in a minute of game time (30 Hz).
pub const TICKS_A_MINUTE: u32 = 60 * 30;

/// One seat at one minute.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Sample {
    pub mined: f64,
    pub workers: u32,
    pub bases: u32,
    pub army: f64,
    pub supply: i32,
}

/// A game's samples: `at[m - 1]` is both seats' at the end of minute `m`.
#[derive(Default)]
pub struct Minutes {
    pub at: Vec<[Sample; 2]>,
}

impl Minutes {
    /// After a tick.
    pub fn observe(&mut self, w: &World) {
        if w.tick > 0 && w.tick.is_multiple_of(TICKS_A_MINUTE) {
            self.at.push([sample(w, 0), sample(w, 1)]);
        }
    }
}

fn sample(w: &World, s: usize) -> Sample {
    let m = w.ledger.get(s).map_or([0, 0], |l| l.mined);
    Sample {
        mined: worth([m[0] as i32, m[1] as i32]),
        workers: w
            .units
            .iter()
            .filter(|u| u.team as usize == s && u.kind.def().worker)
            .count() as u32,
        bases: w
            .bldgs
            .iter()
            .filter(|b| b.team as usize == s && b.done && b.kind.def().hq)
            .count() as u32,
        army: army_of(w, |t| t == s),
        supply: w.pools.get(s).map_or(0, |v| v[0][0]),
    }
}

/// Income a minute over the five minutes up to minute `m` (1-based; fewer at the start).
pub fn income(at: &[[Sample; 2]], m: usize, seat: usize) -> Option<f64> {
    let now = at.get(m.checked_sub(1)?)?[seat].mined;
    let back = m.min(5);
    let then = if m > back {
        at[m - back - 1][seat].mined
    } else {
        0.0
    };
    Some((now - then) / back as f64)
}

impl Sample {
    pub fn json(&self) -> crate::json::Json {
        crate::json::Json::obj()
            .with("mined", self.mined)
            .with("workers", self.workers)
            .with("bases", self.bases)
            .with("army", self.army)
            .with("supply", self.supply as i64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn income_is_a_five_minute_average_and_shorter_at_the_start() {
        let at: Vec<[Sample; 2]> = (1..=7)
            .map(|m| {
                let s = Sample {
                    mined: 100.0 * m as f64,
                    ..Sample::default()
                };
                [s, Sample::default()]
            })
            .collect();
        assert_eq!(income(&at, 2, 0), Some(100.0));
        assert_eq!(income(&at, 7, 0), Some(100.0));
        assert_eq!(income(&at, 7, 1), Some(0.0));
        assert_eq!(income(&at, 8, 0), None);
        assert_eq!(income(&at, 0, 0), None);
    }
}
