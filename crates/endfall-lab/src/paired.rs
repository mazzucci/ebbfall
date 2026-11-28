//! Paired statistics: two batches played on the same seeds, compared seed for seed. A game's seed fixes its map and
//! every draw, so the same cell and seed in two builds differ only by what the builds changed; comparing two separate
//! win rates throws that pairing away (`compare`'s unpaired fallback).
//!
//! The unit is a seed: its games in both seatings of a matchup together, so a seed counts once, however many games it
//! holds. Each unit's change is the mean, over its games, of the score in B less the score in A (a win 1, a timeout
//! 1/2, a loss 0): -1 to 1. Two figures come from those changes:
//! - **the interval**: a paired bootstrap over the units (`RESAMPLES` resamples of the units with replacement, from
//!   the lab's own seeded RNG, so the same input gives the same interval), its 2.5% and 97.5% percentiles of the mean;
//! - **the exact test**: the sign-flip (randomization) test of the mean against 0. With no effect, A and B are
//!   exchangeable within a unit, so each unit's change is as likely flipped; the p-value is the share of the 2^n sign
//!   patterns whose sum lies at least as far from 0, counted exactly. With one game a unit and no timeouts it is the
//!   exact McNemar test.
//!
//! A change is flagged **beyond the noise** when the interval excludes 0 and the exact test agrees (p < 0.05). The
//! bootstrap alone is too sure with few changed seeds (two seeds of two that both flipped give an interval of one
//! point); the test is exact at any size, and the interval says how big the change is.

use endfall_sim::Mulberry32;

/// Bootstrap resamples per interval.
pub const RESAMPLES: usize = 10_000;
/// The exact test's level.
pub const ALPHA: f64 = 0.05;

/// A paired change: the units, their mean change (B less A, in score: -1 to 1), its 95% bootstrap interval, and the
/// exact sign-flip test's two-sided p-value.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Paired {
    pub units: usize,
    pub mean: f64,
    pub lo: f64,
    pub hi: f64,
    pub p: f64,
}

impl Paired {
    /// The interval excludes 0 and the exact test agrees.
    pub fn beyond_noise(&self) -> bool {
        (self.lo > 0.0 || self.hi < 0.0) && self.p < ALPHA
    }
    /// "-29 pts (-50 to -8)", in points of score.
    pub fn show(&self) -> String {
        format!(
            "{:+.0} pts ({:+.0} to {:+.0})",
            self.mean * 100.0,
            self.lo * 100.0,
            self.hi * 100.0
        )
    }
}

/// A game's score for the side a rate counts: a win 1, a timeout 1/2, a loss 0.
pub fn score(won: Option<bool>) -> f64 {
    match won {
        Some(true) => 1.0,
        Some(false) => 0.0,
        None => 0.5,
    }
}

/// The paired change of `d` (each unit's change, B less A, -1 to 1); None without a unit.
pub fn paired(d: &[f64]) -> Option<Paired> {
    if d.is_empty() {
        return None;
    }
    let n = d.len();
    let mean = d.iter().sum::<f64>() / n as f64;
    // (the lab's own RNG, seeded by the units' count: the same changes, the same interval)
    let mut rng = Mulberry32::new(0x5eed_0000 ^ n as u32);
    let mut means: Vec<f64> = (0..RESAMPLES)
        .map(|_| (0..n).map(|_| d[rng.below(n as u32) as usize]).sum::<f64>() / n as f64)
        .collect();
    means.sort_by(f64::total_cmp);
    let at = |q: f64| means[((RESAMPLES - 1) as f64 * q).round() as usize];
    Some(Paired {
        units: n,
        mean,
        lo: at(0.025),
        hi: at(0.975),
        p: sign_flip_p(d),
    })
}

/// The exact two-sided sign-flip p-value of `d` against 0. Each change is counted in quarters (a unit's mean change
/// over one or two games, timeouts half, is a whole number of quarters), so the sum's distribution over the 2^n sign
/// patterns is a count over whole numbers, built up unit by unit.
pub fn sign_flip_p(d: &[f64]) -> f64 {
    let k: Vec<usize> = d
        .iter()
        .map(|x| endfall_sim::jsmath::round(x.abs() * 4.0) as usize)
        .collect();
    let total: usize = k.iter().sum();
    if total == 0 {
        return 1.0;
    }
    // dist[s]: the probability that the flipped sum is s - total
    let mut dist = vec![0.0f64; 2 * total + 1];
    dist[total] = 1.0;
    for &ki in k.iter().filter(|&&ki| ki > 0) {
        let mut next = vec![0.0f64; dist.len()];
        for (s, &p) in dist.iter().enumerate() {
            if p > 0.0 {
                next[s - ki] += p / 2.0;
                next[s + ki] += p / 2.0;
            }
        }
        dist = next;
    }
    let observed: i64 = d
        .iter()
        .map(|x| endfall_sim::jsmath::round(x * 4.0) as i64)
        .sum::<i64>()
        .abs();
    let p: f64 = dist
        .iter()
        .enumerate()
        .filter(|(s, _)| (*s as i64 - total as i64).abs() >= observed)
        .map(|(_, p)| p)
        .sum();
    p.min(1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seven_wins_to_none_of_twenty_three_on_the_same_seeds_is_beyond_the_noise() {
        // One game a unit: 7 wins became losses, 16 games the same (the Hard-128 case: 7 of 23 to 0 of 23). The two
        // separate Wilson intervals overlap (7 of 23: 16-51%, 0 of 23: 0-14%: barely apart, and at 6 of 23 they
        // overlap); the pairing sees seven seeds that moved one way and none the other.
        let mut d = vec![-1.0; 7];
        d.extend([0.0; 16]);
        let r = paired(&d).unwrap();
        assert!((r.mean + 7.0 / 23.0).abs() < 1e-12);
        assert!(r.hi < 0.0, "{r:?}");
        // (McNemar's exact test: 2 x 2^-7)
        assert!((r.p - 2.0 / 128.0).abs() < 1e-12, "{r:?}");
        assert!(r.beyond_noise());
        // 6 to 0 of 23, where the unpaired intervals overlap: the pairing still sees it
        let mut d = vec![-1.0; 6];
        d.extend([0.0; 17]);
        let r = paired(&d).unwrap();
        assert!(
            r.beyond_noise() && (r.p - 2.0 / 64.0).abs() < 1e-12,
            "{r:?}"
        );
        let (a, b) = (crate::stats::wilson(6, 23), crate::stats::wilson(0, 23));
        assert!(!crate::compare::apart(a, b), "unpaired: within noise");
    }

    #[test]
    fn the_same_seeds_in_both_seatings_count_once_and_timeouts_count_half() {
        // Twelve seeds, two games each (both seatings): the units' changes are means of two games' changes. Six
        // seeds lost one win each, one seed lost a win to a timeout: 7 games moved, over 12 units.
        let mut d = vec![-0.5; 6];
        d.push(-0.25);
        d.extend([0.0; 5]);
        let r = paired(&d).unwrap();
        assert_eq!(r.units, 12);
        assert!(r.hi < 0.0 && r.p < 0.05, "{r:?}");
        // (seven units moved, all one way: 2 x 2^-7 whatever their sizes)
        assert!((r.p - 2.0 / 128.0).abs() < 1e-12, "{r:?}");
        assert!(r.beyond_noise());
        assert_eq!(score(None), 0.5);
    }

    #[test]
    fn a_handful_of_flips_is_not_beyond_the_noise_and_nothing_moved_is_nothing() {
        // Two seeds of two both flipped: the bootstrap's interval is a single point, the exact test says 0.5.
        let r = paired(&[-1.0, -1.0]).unwrap();
        assert!(
            r.hi < 0.0 && (r.p - 0.5).abs() < 1e-12 && !r.beyond_noise(),
            "{r:?}"
        );
        // Three of 23, all one way: p = 0.25.
        let mut d = vec![1.0; 3];
        d.extend([0.0; 20]);
        let r = paired(&d).unwrap();
        assert!(!r.beyond_noise() && (r.p - 0.25).abs() < 1e-12, "{r:?}");
        // Balanced changes: no effect.
        let mut d = vec![1.0; 5];
        d.extend([-1.0; 5]);
        d.extend([0.0; 10]);
        let r = paired(&d).unwrap();
        assert!(
            r.mean == 0.0 && r.lo < 0.0 && r.hi > 0.0 && r.p == 1.0,
            "{r:?}"
        );
        let r = paired(&[0.0; 10]).unwrap();
        assert!(r.mean == 0.0 && r.p == 1.0 && !r.beyond_noise());
        assert_eq!(paired(&[]), None);
        // The same input, the same interval.
        assert_eq!(paired(&d), paired(&d));
    }

    #[test]
    fn the_exact_test_matches_a_brute_force_count() {
        // Mixed sizes (quarters, halves, wholes): count all 2^n sign patterns directly.
        let d = [0.25, -0.5, 1.0, 0.75, 0.0, 0.5, -0.25, 1.0, 0.5];
        let obs: f64 = d.iter().sum::<f64>().abs();
        let n = d.len();
        let mut hits = 0;
        for mask in 0u32..(1 << n) {
            let s: f64 = (0..n)
                .map(|i| {
                    if mask >> i & 1 == 1 {
                        -d[i].abs()
                    } else {
                        d[i].abs()
                    }
                })
                .sum();
            hits += (s.abs() >= obs - 1e-9) as u32;
        }
        let brute = hits as f64 / (1u32 << n) as f64;
        assert!(
            (sign_flip_p(&d) - brute).abs() < 1e-12,
            "{} vs {brute}",
            sign_flip_p(&d)
        );
    }
}
