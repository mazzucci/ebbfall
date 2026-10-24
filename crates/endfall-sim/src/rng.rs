//! Seeded PRNG. Bit-for-bit the same as `mulberry` in `src/engine/util.js`, which returns `next_u32() / 2^32`.

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Mulberry32 {
    state: u32,
}

impl Mulberry32 {
    pub fn new(seed: u32) -> Self {
        Self { state: seed }
    }

    pub fn next_u32(&mut self) -> u32 {
        self.state = self.state.wrapping_add(0x6d2b_79f5);
        let a = self.state;
        let mut t = (a ^ (a >> 15)).wrapping_mul(1 | a);
        t = (t.wrapping_add((t ^ (t >> 7)).wrapping_mul(61 | t))) ^ t;
        t ^ (t >> 14)
    }

    /// Uniform integer in `0..n` (n > 0). Same as `Math.floor(rnd() * n)` in the JS sim for n < 2^21.
    pub fn below(&mut self, n: u32) -> u32 {
        ((self.next_u32() as u64 * n as u64) >> 32) as u32
    }

    pub fn state(&self) -> u32 {
        self.state
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_the_js_reference_sequence() {
        // Produced by `mulberry(12345)` in src/sim/util.js, multiplied back by 2^32.
        let mut r = Mulberry32::new(12345);
        let got: Vec<u32> = (0..5).map(|_| r.next_u32()).collect();
        assert_eq!(got, JS_SEED_12345);
    }

    #[test]
    fn below_stays_in_range() {
        let mut r = Mulberry32::new(1);
        assert!((0..10_000).all(|_| r.below(7) < 7));
    }

    const JS_SEED_12345: [u32; 5] = [
        4_207_900_869,
        1_317_490_944,
        2_079_646_450,
        3_513_001_552,
        2_187_978_186,
    ];
}
