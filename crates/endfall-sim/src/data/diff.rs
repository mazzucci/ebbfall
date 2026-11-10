//! The scripted opponent's tuning per difficulty: a level is mostly how well it plays, not what it is given (Hard
//! gathers 10% faster than the player, so it beats Medium; Brutal 30%).

/// A time for a step it never takes.
pub const NEVER: f64 = f64::MAX;

/// AI tuning per difficulty. `first`/`gap`: seconds before the first wave and between waves. `extra_rax`: main
/// factories it may add beyond its schedule (`rax`, one more after 5 and 9 minutes) to spend shards piling up.
/// `research_from`/`expand_at`/`air_at`/`heavy_at`: seconds before it researches, takes a second base, raises an air
/// factory, raises its vehicle bay (NEVER: it does not). `raids`: flyers hunt the player's workers. `prong`: a big wave sends a third at an
/// expansion. `answers`: it adapts its mix to what it has seen. `abilities`: its units use theirs.
/// `supply_ahead`: free supply below which it builds more; `supply_at_once`: how many supply buildings at a time.
/// The AI reads a seat's through `World::tuning`: its level's, or a plan the balance lab set for that seat.
#[derive(Clone, Copy, Debug, PartialEq)]
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
    pub heavy_at: f64,
    pub raids: bool,
    pub prong: bool,
    pub answers: bool,
    pub abilities: bool,
    pub supply_ahead: i32,
    pub supply_at_once: usize,
    /// The most a wave's required size grows to (it grows by `wave_grow` after each launch): a winning AI goes out
    /// to finish instead of waiting at home for ever bigger waves.
    pub wave_max: usize,
    /// Its `extra_rax` wait for its second base: a slow economy spends its bank on the expansion first.
    pub extras_after_expanding: bool,
    /// It takes its natural as soon as the fields by its main run low, before `expand_at` (Easy keeps to its
    /// schedule: the gentle level may starve on a barren map).
    pub expands_when_dry: bool,
    /// While its crew is short of its target, it holds a worker's price back from its buildings, so building never
    /// leaves its Core idle for want of shards (Brutal's build order spent every shard, and its Human AI, whose
    /// builders leave the line, fell behind the Vael's in the opening).
    pub workers_first: bool,
    /// Seconds before it plants more than one Pump (each base has two seeps): its main's first goes up once it has
    /// seven workers, the rest not before this; then the expansion's.
    pub vents_from: f64,
    /// A wave ready by count and time also waits until its value is this many times the foe's army it last saw (PRD:
    /// the AI breaks a defence; 0: no such wait, today's rules). The margin fades to 1 over `margin_fade` seconds of
    /// waiting (NEVER: it does not fade). A sighting older than `sighting_age` is stale: it first sends a unit to
    /// look (waiting up to `look_for` seconds for it), then counts the foe as the last sighting plus what its own army
    /// has grown since. With full supply, or `all_in_after` seconds since its last wave, it goes with everything.
    pub wave_margin: f64,
    pub margin_fade: f64,
    pub sighting_age: f64,
    pub look_for: f64,
    pub all_in_after: f64,
    /// A wave first gathers this many tiles short of its goal (0: it goes straight in) and goes in together once most
    /// of it is there, or after `stage_wait` seconds.
    pub stage: f64,
    pub stage_wait: f64,
    /// Out-expanding a passive foe: with its natural taken and no enemy at its buildings for `passive_expand`
    /// seconds (NEVER: never), it takes another base, at most `max_bases` in all.
    pub passive_expand: f64,
    pub max_bases: usize,
    /// A home reserve: this share of its army's worth (its cheapest fighters) never goes out with a wave; it stays
    /// at the rally and defends (0: none). At full supply the reserve goes all in too. Like `retreat_below`, only
    /// against a passive foe (none of its armed units at our buildings for `passive_expand` seconds).
    pub reserve: f64,
    /// Retreat on contact: a wave whose worth is under this many times what it sees of the enemy's armed units and
    /// working towers near it pulls back to its rally, where its reserve and towers meet the chasers (0: never).
    pub retreat_below: f64,
    /// The most advanced units it trains (`UnitKind::ai_tier`): 0 its line units, their anti-air and the scout (Easy),
    /// 1 its raiders, siege, anti-air vehicles, Marines and Drones too (Medium), 2 everything (Hard and up).
    pub mix_tier: u8,
    /// Entries of a race's mix (`AiScript::mix`: kind, one per that many line units, from that many seconds) this level
    /// plays differently, matched by kind (Brutal: the Kingdom's Trebuchets sooner and more of them). A kind of the
    /// other race leaves that race's mix as it is.
    pub mix_over: &'static [(super::UnitKind, usize, f64)],
}

impl Diff {
    /// A race's mix entry as this level plays it (`mix_over`).
    pub fn mix_entry(&self, entry: (super::UnitKind, usize, f64)) -> (super::UnitKind, usize, f64) {
        self.mix_over
            .iter()
            .copied()
            .find(|o| o.0 == entry.0)
            .unwrap_or(entry)
    }
}

impl super::UnitKind {
    /// How advanced a unit is for the AI's per-level mix (`Diff::mix_tier`): 0 the workers, line units, their
    /// anti-air and the scout; 2 the top tier (the Knight, the Bruiser); 1 the rest.
    pub fn ai_tier(self) -> u8 {
        use super::UnitKind::*;
        match self {
            Harvester | Lumen | Trooper | Lancer | Prism | Observer => 0,
            Knight | Bruiser => 2,
            _ => 1,
        }
    }
}

pub const DIFF: [Diff; 4] = [
    // Easy: a slow, plain script. Few workers, one factory to start; no research, raiders, abilities or adapting. It
    // fields its line units and their anti-air only. It takes its natural after 9:00
    // (after Medium's) and only then adds a factory to spend on, so a player who holds its early waves still meets a
    // growing army later. One vent until then: a second's crew of workers would only pile up shards it has no factory
    // to spend on.
    Diff {
        income: 1.0,
        wave: 4,
        wave_grow: 2,
        harv: 7,
        rax: 1,
        extra_rax: 1,
        first: 240.0,
        gap: 80.0,
        research_from: NEVER,
        expand_at: 540.0,
        air_at: NEVER,
        heavy_at: NEVER, // (Roster v2: Easy trains nothing of its vehicle bay's)
        raids: false,
        prong: false,
        answers: false,
        abilities: false,
        supply_ahead: 4,
        wave_max: 12,
        supply_at_once: 1,
        expands_when_dry: false,
        extras_after_expanding: true,
        workers_first: false,
        vents_from: 540.0,
        wave_margin: 0.0,
        margin_fade: NEVER,
        sighting_age: 120.0,
        look_for: 60.0,
        all_in_after: NEVER,
        stage: 0.0,
        stage_wait: 30.0,
        passive_expand: NEVER,
        max_bases: 2,
        reserve: 0.0,
        retreat_below: 0.0,
        mix_tier: 0,
        mix_over: &[],
    },
    // Medium: the whole script at an even pace, but one attack at a time. Workers by level (7, 10, 11, 12, and 3 more
    // with a second base): under a cap of 40 (PRD: the conversion) a crew of 12 to 18 left too little room for an army;
    // the Pumps make up the income (the lab after PR 1 tunes them).
    Diff {
        income: 1.0,
        wave: 7,
        wave_grow: 2,
        harv: 10,
        rax: 2,
        extra_rax: 3,
        first: 170.0,
        gap: 60.0,
        research_from: 420.0,
        expand_at: 420.0,
        air_at: 330.0,
        heavy_at: 0.0,
        raids: true,
        prong: false,
        answers: true,
        abilities: true,
        supply_ahead: 4,
        wave_max: 14,
        supply_at_once: 1,
        expands_when_dry: true,
        extras_after_expanding: false,
        workers_first: false,
        vents_from: 0.0,
        wave_margin: 1.3,
        margin_fade: NEVER,
        sighting_age: 120.0,
        look_for: 60.0,
        all_in_after: NEVER,
        stage: 12.0,
        stage_wait: 30.0,
        passive_expand: 180.0,
        max_bases: 4,
        reserve: 0.25,
        retreat_below: 1.0,
        mix_tier: 1,
        mix_over: &[],
    },
    // Hard: a bigger first wave (8, at about 3:15), more factories behind it, and it splits its waves.
    Diff {
        income: 1.1, // (Roster v2 balance pass: the ladder, Hard over Medium; Brutal has 1.3)
        wave: 8,
        wave_grow: 3,
        harv: 11,
        rax: 3,
        extra_rax: 4,
        first: 150.0,
        gap: 50.0,
        research_from: 300.0,
        expand_at: 330.0,
        air_at: 300.0,
        heavy_at: 0.0,
        raids: true,
        prong: true,
        answers: true,
        abilities: true,
        supply_ahead: 6,
        wave_max: 16,
        supply_at_once: 1,
        expands_when_dry: true,
        extras_after_expanding: false,
        workers_first: false,
        vents_from: 0.0,
        wave_margin: 1.3,
        margin_fade: NEVER,
        sighting_age: 120.0,
        look_for: 60.0,
        all_in_after: NEVER,
        stage: 12.0,
        stage_wait: 30.0,
        passive_expand: 180.0,
        max_bases: 4,
        reserve: 0.25,
        retreat_below: 1.0,
        mix_tier: 2,
        mix_over: &[],
    },
    // Brutal: Hard, faster still, gathering 30% more than the player (Hard is given 10%), and
    // building supply far enough ahead (two at a time) that the extra income becomes army, not a bank. Three
    // factories to start, like Hard: with four, the Human AI's builders spent so long off the line (a Human builder
    // stays until its building stands) that it gathered far less than the Vael AI. It trains its workers before its
    // buildings: its build order left its Core idle for want of shards while its crew was still short.
    Diff {
        income: 1.3,
        wave: 7,
        wave_grow: 4,
        harv: 12,
        rax: 3,
        extra_rax: 5,
        first: 120.0,
        gap: 45.0,
        research_from: 300.0,
        expand_at: 330.0,
        air_at: 300.0,
        heavy_at: 0.0,
        raids: true,
        prong: true,
        answers: true,
        abilities: true,
        supply_ahead: 10,
        wave_max: 14,
        supply_at_once: 2,
        expands_when_dry: true,
        extras_after_expanding: false,
        workers_first: true,
        vents_from: 0.0,
        wave_margin: 1.3,
        margin_fade: NEVER,
        sighting_age: 120.0,
        look_for: 60.0,
        all_in_after: NEVER,
        stage: 12.0,
        stage_wait: 30.0,
        passive_expand: 180.0,
        max_bases: 4,
        reserve: 0.25,
        retreat_below: 1.0,
        mix_tier: 2,
        // (the balance follow-ups: an Anchor Gun per four Pickets from 4:00, not per six from 5:30; Humans against Vael
        // at 64x64 from 20% to 40%, seed for seed; at other levels it cost the Human turtle row and the 96 mirror)
        mix_over: &[(super::UnitKind::SiegeTank, 4, 240.0)],
    },
];
