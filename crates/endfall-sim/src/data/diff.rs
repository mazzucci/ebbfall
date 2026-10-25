//! The scripted opponent's tuning per difficulty: a level is how well it plays, not what it is given (only Brutal
//! gathers faster than the player).

/// A time for a step it never takes.
pub const NEVER: f64 = f64::MAX;

/// AI tuning per difficulty. `first`/`gap`: seconds before the first wave and between waves. `extra_rax`: main
/// factories it may add beyond its schedule (`rax`, one more after 5 and 9 minutes) to spend shards piling up.
/// `research_from`/`expand_at`/`air_at`: seconds before it researches, takes a second base, raises an air factory
/// (NEVER: it does not). `raids`: flyers hunt the player's workers. `prong`: a big wave sends a third at an
/// expansion. `answers`: it adapts its mix to what it has seen. `abilities`: its units use theirs.
pub struct Diff {
    pub income: f64,
    pub wave: usize,
    pub wave_grow: usize,
    pub harv: usize,
    pub rax: usize,
    pub extra_rax: usize,
    pub first: f64,
    pub gap: f64,
    pub research_from: f64,
    pub expand_at: f64,
    pub air_at: f64,
    pub raids: bool,
    pub prong: bool,
    pub answers: bool,
    pub abilities: bool,
}

pub const DIFF: [Diff; 4] = [
    // Easy: a slow, plain script. Few workers, one factory, small late waves; no research, second base, flyers,
    // abilities or adapting.
    Diff {
        income: 1.0,
        wave: 4,
        wave_grow: 2,
        harv: 7,
        rax: 1,
        extra_rax: 0,
        first: 240.0,
        gap: 80.0,
        research_from: NEVER,
        expand_at: NEVER,
        air_at: NEVER,
        raids: false,
        prong: false,
        answers: false,
        abilities: false,
    },
    // Medium: the whole script at an even pace (11 workers at x1.0 field about the army 13 at x0.9 did before, after
    // phone playtests found its mid-game waves too much), but one attack at a time.
    Diff {
        income: 1.0,
        wave: 7,
        wave_grow: 2,
        harv: 11,
        rax: 2,
        extra_rax: 3,
        first: 170.0,
        gap: 60.0,
        research_from: 420.0,
        expand_at: 420.0,
        air_at: 330.0,
        raids: true,
        prong: false,
        answers: true,
        abilities: true,
    },
    // Hard: earlier and bigger, and it splits its waves.
    Diff {
        income: 1.0,
        wave: 9,
        wave_grow: 3,
        harv: 16,
        rax: 3,
        extra_rax: 4,
        first: 140.0,
        gap: 50.0,
        research_from: 300.0,
        expand_at: 330.0,
        air_at: 300.0,
        raids: true,
        prong: true,
        answers: true,
        abilities: true,
    },
    // Brutal: Hard, faster still, gathering 30% more than the player (the only level that is given anything).
    Diff {
        income: 1.3,
        wave: 9,
        wave_grow: 4,
        harv: 18,
        rax: 4,
        extra_rax: 5,
        first: 120.0,
        gap: 45.0,
        research_from: 300.0,
        expand_at: 330.0,
        air_at: 300.0,
        raids: true,
        prong: true,
        answers: true,
        abilities: true,
    },
];
