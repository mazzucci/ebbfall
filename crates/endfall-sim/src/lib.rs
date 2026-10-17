//! Endfall simulation (Rust port, in progress).
//!
//! This is the skeleton the port of `src/sim/` grows into. The rules from CLAUDE.md apply: fixed tick, all
//! randomness from the seeded RNG, no wall clock, no floats in game rules, iterate `Vec`s (never `HashMap`s)
//! where order affects results. The JS client talks to it only through the `#[wasm_bindgen]` surface below.

mod rng;

pub use rng::Mulberry32;
use wasm_bindgen::prelude::*;

/// Simulation ticks per second; the JS sim's `DT` is `1 / TICK_RATE`.
pub const TICK_RATE: u32 = 30;

#[wasm_bindgen]
pub struct Game {
    tick: u32,
    rng: Mulberry32,
}

#[wasm_bindgen]
impl Game {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u32) -> Game {
        Game {
            tick: 0,
            rng: Mulberry32::new(seed),
        }
    }

    /// Advance the world by one fixed tick.
    pub fn step(&mut self) {
        self.tick += 1;
        // Placeholder for the ported rules: consume randomness so the hash depends on the RNG stream.
        self.rng.next_u32();
    }

    pub fn tick(&self) -> u32 {
        self.tick
    }

    /// FNV-1a over the world state, the same scheme as `stateHash()` in `src/sim/update.js`.
    #[wasm_bindgen(js_name = stateHash)]
    pub fn state_hash(&self) -> u32 {
        let mut h = Fnv::new();
        h.mix(self.tick);
        h.mix(self.rng.state());
        h.finish()
    }
}

/// Crate version, so the client can log which sim build it loaded.
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// The first `n` raw outputs of the seeded RNG; lets the JS tests check parity with `mulberry` in util.js.
#[wasm_bindgen(js_name = rngSequence)]
pub fn rng_sequence(seed: u32, n: u32) -> Vec<u32> {
    let mut r = Mulberry32::new(seed);
    (0..n).map(|_| r.next_u32()).collect()
}

struct Fnv(u32);

impl Fnv {
    fn new() -> Self {
        Fnv(2_166_136_261)
    }
    fn mix(&mut self, v: u32) {
        self.0 = (self.0 ^ v).wrapping_mul(16_777_619);
    }
    fn finish(&self) -> u32 {
        self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(seed: u32, ticks: u32) -> Game {
        let mut g = Game::new(seed);
        for _ in 0..ticks {
            g.step();
        }
        g
    }

    #[test]
    fn same_seed_same_hash() {
        assert_eq!(run(4242, 2700).state_hash(), run(4242, 2700).state_hash());
    }

    #[test]
    fn different_seed_different_hash() {
        assert_ne!(run(1, 300).state_hash(), run(2, 300).state_hash());
    }

    #[test]
    fn ticks_advance() {
        assert_eq!(run(7, TICK_RATE * 10).tick(), 300);
    }
}
