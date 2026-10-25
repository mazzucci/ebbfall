//! The scripted opponent's tuning per difficulty: a level is how well it plays, not what it is given (only Brutal
//! gathers faster than the player).

/// A time for a step it never takes.
pub const NEVER: f64 = f64::MAX;

/// AI tuning per difficulty. `first`/`gap`: seconds before the first wave and between waves. `extra_rax`: main
/// factories it may add beyond its schedule (`rax`, one more after 5 and 9 minutes) to spend shards piling up.
/// `research_from`/`expand_at`/`air_at`: seconds before it researches, takes a second base, raises an air factory
/// (NEVER: it does not). `raids`: flyers hunt the player's workers. `prong`: a big wave sends a third at an
/// expansion. `answers`: it adapts its mix to what it has seen. `abilities`: its units use theirs.
/// `supply_ahead`: free supply below which it builds more; `supply_at_once`: how many supply buildings at a time.
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
    pub supply_ahead: i32,
    pub supply_at_once: usize,
    /// The most a wave's required size grows to (it grows by `wave_grow` after each launch): a winning AI goes out
    /// to finish instead of waiting at home for ever bigger waves.
    pub wave_max: usize,
}

pub const DIFF: [Diff; 4] = [
    // Easy: a slow, plain script. Few workers, one factory to start, small late waves; no research, second base, flyers,
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
        supply_ahead: 4,
        wave_max: 12,
        supply_at_once: 1,
    },
    // Medium: the whole script at an even pace (12 workers at x1.0, about what 13 at x0.9 gathered before, after phone
    // playtests found its mid-game waves too much; 11 left the Human AI behind the Vael AI), but one attack at a time.
    Diff {
        income: 1.0,
        wave: 7,
        wave_grow: 2,
        harv: 12,
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
        supply_ahead: 4,
        wave_max: 14,
        supply_at_once: 1,
    },
    // Hard: a bigger first wave (8, at about 3:15), more factories behind it, and it splits its waves.
    Diff {
        income: 1.0,
        wave: 8,
        wave_grow: 3,
        harv: 16,
        rax: 3,
        extra_rax: 4,
        first: 150.0,
        gap: 50.0,
        research_from: 300.0,
        expand_at: 330.0,
        air_at: 300.0,
        raids: true,
        prong: true,
        answers: true,
        abilities: true,
        supply_ahead: 6,
        wave_max: 16,
        supply_at_once: 1,
    },
    // Brutal: Hard, faster still, gathering 30% more than the player (the only level that is given anything), and
    // building supply far enough ahead (two at a time) that the extra income becomes army, not a bank. Three
    // factories to start, like Hard: with four, the Human AI's builders spent so long off the line (a Human builder
    // stays until its building stands) that it gathered far less than the Vael AI.
    Diff {
        income: 1.3,
        wave: 7,
        wave_grow: 4,
        harv: 18,
        rax: 3,
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
        supply_ahead: 10,
        wave_max: 14,
        supply_at_once: 2,
    },
];
