//! The scripted opponent's tuning per difficulty.

/// AI tuning per difficulty. `first`/`gap`: seconds before the first wave and between waves. `extra_rax`: main
/// factories it may add beyond its schedule (`rax`, one more after 5 and 9 minutes) to spend shards piling up.
pub struct Diff {
    pub income: f64,
    pub wave: usize,
    pub wave_grow: usize,
    pub harv: usize,
    pub rax: usize,
    pub extra_rax: usize,
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
        extra_rax: 0,
        first: 240.0,
        gap: 75.0,
    },
    // Medium: tuned down after phone playtests (income 1.0 -> 0.9, waves grow by 2, not 3): its mid-game waves
    // overran a phone player.
    Diff {
        income: 0.9,
        wave: 7,
        wave_grow: 2,
        harv: 13,
        rax: 2,
        extra_rax: 3,
        first: 170.0,
        gap: 60.0,
    },
    Diff {
        income: 1.35,
        wave: 9,
        wave_grow: 4,
        harv: 16,
        rax: 3,
        extra_rax: 4,
        first: 120.0,
        gap: 45.0,
    },
];
