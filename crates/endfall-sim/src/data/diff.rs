//! The scripted opponent's tuning per difficulty.

/// AI tuning per difficulty. `first`/`gap`: seconds before the first wave and between waves.
pub struct Diff {
    pub income: f64,
    pub wave: usize,
    pub wave_grow: usize,
    pub harv: usize,
    pub rax: usize,
    pub first: f64,
    pub gap: f64,
}

pub const DIFF: [Diff; 3] = [
    Diff {
        income: 0.75,
        wave: 5,
        wave_grow: 2,
        harv: 10,
        rax: 1,
        first: 240.0,
        gap: 75.0,
    },
    Diff {
        income: 1.0,
        wave: 7,
        wave_grow: 3,
        harv: 13,
        rax: 2,
        first: 170.0,
        gap: 60.0,
    },
    Diff {
        income: 1.35,
        wave: 9,
        wave_grow: 4,
        harv: 16,
        rax: 3,
        first: 120.0,
        gap: 45.0,
    },
];
