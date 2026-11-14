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
    /// leaves its Castle idle for want of gold (Brutal's build order spent every coin, and its Human AI, whose
    /// builders leave the line, fell behind the Expedition's in the opening).
    pub workers_first: bool,
    /// Seconds before it raises more than one Market (one a Castle): its main's goes up once it has seven workers, the
    /// expansion's not before this.
    pub vents_from: f64,
    /// A wave ready by count and time also waits until its value is this many times the foe's army it last saw (PRD:
    /// the AI breaks a defense; 0: no such wait, today's rules). The margin fades to 1 over `margin_fade` seconds of
    /// waiting (NEVER: it does not fade). A sighting older than `sighting_age` is stale: it first sends a unit to
    /// look (waiting up to `look_for` seconds for it), then counts the foe as the last sighting plus what its own army
    /// has grown since. With full supply, or `all_in_after` seconds since its last wave, it goes with everything.
    pub wave_margin: f64,
    pub margin_fade: f64,
    pub sighting_age: f64,
    pub look_for: f64,
    pub all_in_after: f64,
    /// A stalled game (the PM, Nov 13: games that grind): from this game time, a seat whose side has razed no enemy
    /// building for `STALL_WINDOW` seconds masses its next wave for up to `STALL_HOLD` seconds (to the cap, or until it
    /// crushes the foe's army), never while the foe is at its buildings, then goes all in and fights to its last unit:
    /// one decisive push instead of even waves traded for ever against Cannons and towers (NEVER: never; Easy).
    pub stall_from: f64,
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
    /// Clumsy waves (Easy; Stelian, Nov 13: "first attack only with 3-4 units; it should give up and retreat
    /// quickly"): `wave_only` sends just its wave's size (`wave`, growing by `wave_grow`), the rest staying home;
    /// `retreat_any` pulls a wave back when outmatched (`retreat_below`) whatever the foe has done; and a wave pulls
    /// back once fewer than `give_up` tenths of it are left (4 on every level but Easy's 7).
    pub wave_only: bool,
    pub retreat_any: bool,
    pub give_up: usize,
    /// Until when (s) a clumsy wave that gave up or fell does not grow the next: past it (Easy: 12:00), once a wave of its
    /// has reached the foe (`Ai::reached`: a newcomer's first hit stays three or four units), each wave is one more than
    /// the last, still clumsy and quick to give up (Stelian, Nov 13: slowly from three or four, never its whole army), so
    /// its games end (with its waves at three or four for good, Easy against Easy, and
    /// Easy against the Expedition on 96x96, ran past 30 minutes with both armies idle at home).
    pub clumsy_until: f64,
    /// The most fighters it holds, home and out (armed units, workers left out; queued ones counted), by units: 0 for no
    /// cap. Easy's 14 (the PM, Nov 13): its army stops growing there and its gold banks; ending an Easy game is the
    /// player's job.
    pub army_max: usize,
    /// The most advanced units it trains from the start (`UnitKind::ai_tier`): 0 its line units and the scout (Easy),
    /// 1 its raiders, the Cannon, the Ballista and the Drone too (Medium and Hard), 2 everything (the sim's level 3).
    pub mix_tier: u8,
    /// The game times (s) from which its tier rises by one each, above `mix_tier` (Stelian, Nov 13: a slow tech climb,
    /// "our whole story about the Expedition is to get to the machines"): Easy climbs the whole ladder late and slowly,
    /// its raiders, siege and Drones from 9:00 and its top tier from 13:00; Medium its top tier from 8:00, Hard from 6:00.
    /// The sim's level 3: none.
    pub tier_at: &'static [f64],
    /// Entries of a race's mix (`AiScript::mix`: kind, one per that many line units, from that many seconds) this level
    /// plays differently, matched by kind (Brutal: the Kingdom's Cannons sooner and more of them). A kind of the
    /// other race leaves that race's mix as it is.
    pub mix_over: &'static [(super::UnitKind, usize, f64)],
    /// The most grid its line takes on a grid side (the Expedition's mercenaries, only part of its army), below the AI's
    /// share `line_grid` (0: that share), on 64x64 (as many more on a bigger map as that share has). Easy keeps the 15
    /// hired places it had, 30 grid (36 and 42 on the bigger maps): at the economy's second round's 25 its
    /// all-Sellsword line beat the Easy Kingdom's Guards and Archers in nearly every game, where the lower cap sent its
    /// money to its machines and Portal instead.
    pub line_max: i32,
    /// When it raises its tech building (`AiScript::tech`: the Blacksmith, the Lab), its barracks standing: 2:30 on
    /// every level (the balance lab's plans move it).
    pub tech_at: f64,
    /// The times (s) from which it wants each of its towers (`AiScript::tower`), one more at each, sites counted: 2:30
    /// and 8:00 on every level (a bank it cannot spend must not go into towers).
    pub towers: &'static [f64],
    /// The most towers of a kind it raises at this level, below `towers` (matched by kind: a race whose tower is not
    /// named builds all of them). Easy and Medium's Expedition, one Sentry mast: two held its base against waves long
    /// past the 10-15 minutes Medium is for, its gold better spent on its army.
    pub tower_max: &'static [(super::BldgKind, usize)],
    /// When a people takes its natural at this level, by its headquarters' kind, in place of `expand_at` (none: every
    /// people at `expand_at`): on maps up to 96 tiles wide, and on bigger ones. Medium's and Hard's Kingdom later (Nov
    /// 13): its tech, its towers and an early Castle at once left its army thin, and Medium's Kingdom won a third of its
    /// games against the Expedition on 96, a fifth on 128 (the lab, 30 seeds: at 8:00 on both it won 54% on 96 and 29%
    /// on 128, at 10:00 85% and 57%).
    pub expand_at_of: &'static [(super::BldgKind, f64, f64)],
    /// Its side's tech time (`AiScript::tech_from`: its techs, its second tech building) at
    /// the latest this: NEVER on every level (the side's own; the balance lab's tech-first plan brings it forward).
    pub tech_from: f64,
    /// Its side's tech time no sooner than this (s): 0 on every level but Easy, whose Uplink and Portal
    /// and techs come late, with its tier (`tier_at`).
    pub tech_not_before: f64,
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
    /// How advanced a unit is for the AI's per-level mix (`Diff::mix_tier`, `tier_at`): 0 the workers, line units,
    /// the Archer and the scout; 2 the top tier (the Knight, the Bruiser, and the Portal's Android and Rover, since Nov
    /// 13: elites and siege, dear and few); 1 the rest (raiders, the Cannon, the Ballista, the Drone).
    pub fn ai_tier(self) -> u8 {
        use super::UnitKind::*;
        match self {
            Harvester | Lumen | Trooper | Lancer | Prism | Observer => 0,
            Knight | Bruiser | Umbra | Monolith => 2,
            _ => 1,
        }
    }
}

pub const DIFF: [Diff; 4] = [
    // Easy: a slow, plain script. Few workers, two factories to start; no research, raiders, abilities or adapting. It
    // fields its line units and their anti-air only. Its first wave goes at 8:00, so a newcomer is never hit before
    // 8:00 (at 4:00 it arrived by 4:30: the lab's newcomer, `turtle --weak --attacker-level Easy`). It takes its natural
    // after 9:00 (after Medium's) and only then adds a factory to spend on, so a player who holds its early waves still
    // meets a growing army later. One mine until then: a second's crew of workers would only pile up gold it has no
    // factory to spend on.
    Diff {
        income: 1.0,
        wave: 4, // (its first wave: four of the Kingdom's, three of the Expedition's (its `wave_scale`), the rest at home)
        wave_grow: 1, // (its waves grow slowly: 4, 5, 6 ... to 12; the Expedition's at its 0.6)
        harv: 7,
        rax: 2, // (two Barracks from the start: with the higher caps' hired places, before the grid, its Easy line outgrew
        // one Barracks' before the 8:00 wave)
        extra_rax: 1,
        first: 480.0, // (7:45 before Nov 13: a wave that leaves at 8:00 cannot hit before it, on any map)
        gap: 80.0,
        research_from: NEVER,
        expand_at: 540.0,
        air_at: 540.0, // (its raiders' factory with its tier's first rise: the Expedition's Factory, the Kingdom's Stables)
        heavy_at: 600.0, // (its vehicle bay late too: the Kingdom's Workshop, its Cannons from about 10:00)
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
        stall_from: NEVER,
        stage: 0.0,
        stage_wait: 30.0,
        passive_expand: NEVER,
        max_bases: 2,
        reserve: 0.0,
        retreat_below: 1.2, // (it gives up on contact with a defence near its own worth)
        wave_only: true,
        retreat_any: true,
        give_up: 7,
        clumsy_until: 720.0,
        army_max: 14,
        mix_tier: 0,
        tier_at: &[540.0, 780.0],
        // (an Archer per two Guards, not one: its line meets the Expedition's melee Sellswords alone until 9:00, where the
        // Archers fell first; Medium's Archers stay one a Guard, its answer to the Buggies and Drones that come sooner)
        mix_over: &[(super::UnitKind::Lancer, 2, 0.0)],
        line_max: 30,
        tech_at: 150.0,
        towers: &[150.0, 480.0],
        tower_max: &[(super::BldgKind::Ward, 1), (super::BldgKind::Turret, 1)],
        expand_at_of: &[],
        tech_from: NEVER,
        tech_not_before: 540.0,
    },
    // Medium: the whole script at an even pace, but one attack at a time, the first at 4:00 (the step after Easy's 8:00;
    // it went at 2:50, and Medium beat Easy in every game of the lab's ladder). Workers by level (7, 10, 11, 12, and 3 more
    // with a second base): under a cap of 40 (PRD: the conversion) a crew of 12 to 18 left too little room for an army;
    // the Markets make up the income (the lab after PR 1 tunes them).
    Diff {
        income: 1.0,
        wave: 7,
        wave_grow: 2,
        harv: 10,
        rax: 2,
        extra_rax: 3,
        first: 240.0,
        gap: 60.0,
        research_from: 420.0,
        expand_at: 420.0, // (the Kingdom's later: `expand_at_of`)
        air_at: 330.0,
        heavy_at: 0.0,
        raids: true,
        prong: false,
        answers: true,
        abilities: true,
        supply_ahead: 4,
        wave_max: 24, // (14 before the arc: under caps of 100 and more, waves of fourteen trickled in and the games stalled)
        supply_at_once: 1,
        expands_when_dry: true,
        extras_after_expanding: false,
        workers_first: false,
        vents_from: 0.0,
        wave_margin: 1.3,
        margin_fade: NEVER,
        sighting_age: 120.0,
        look_for: 60.0,
        all_in_after: 300.0, // (since the arc: with caps of 100 and more the cap rarely sends it all in, and a margin-bound wave could wait for ever)
        stall_from: 900.0,
        stage: 12.0,
        stage_wait: 30.0,
        passive_expand: 180.0,
        max_bases: 4,
        reserve: 0.25,
        retreat_below: 1.0,
        wave_only: false,
        retreat_any: false,
        give_up: 4,
        clumsy_until: 0.0,
        army_max: 0,
        mix_tier: 1,
        tier_at: &[480.0],
        mix_over: &[],
        line_max: 0,
        tech_at: 150.0,
        towers: &[150.0, 480.0],
        tower_max: &[(super::BldgKind::Ward, 1)],
        expand_at_of: &[(super::BldgKind::Core, 480.0, 600.0)],
        tech_from: NEVER,
        tech_not_before: 0.0,
    },
    // Hard (the menus' Hard since Nov 13): a bigger first wave (8), more factories behind it, and it splits its waves.
    Diff {
        income: 1.1, // (Roster v2 balance pass: the ladder, Hard over Medium; Brutal has 1.3)
        wave: 8,
        wave_grow: 3,
        harv: 11,
        rax: 3,
        extra_rax: 4,
        first: 240.0, // (no sooner than Medium's: the PM, Nov 13; 2:30 before)
        gap: 50.0,
        research_from: 300.0,
        expand_at: 330.0, // (the Kingdom's later: `expand_at_of`)
        air_at: 300.0,
        heavy_at: 0.0,
        raids: true,
        prong: true,
        answers: true,
        abilities: true,
        supply_ahead: 6,
        wave_max: 26,
        supply_at_once: 1,
        expands_when_dry: true,
        extras_after_expanding: false,
        workers_first: false,
        vents_from: 0.0,
        wave_margin: 1.3,
        margin_fade: NEVER,
        sighting_age: 120.0,
        look_for: 60.0,
        all_in_after: 240.0, // (since the arc: with caps of 100 and more the cap rarely sends it all in, and a margin-bound wave could wait for ever)
        stall_from: 900.0,
        stage: 12.0,
        stage_wait: 30.0,
        passive_expand: 180.0,
        max_bases: 4,
        reserve: 0.25,
        retreat_below: 1.0,
        wave_only: false,
        retreat_any: false,
        give_up: 4,
        clumsy_until: 0.0,
        army_max: 0,
        mix_tier: 1,
        tier_at: &[360.0], // (its top tier from 6:00, Medium's from 8:00: from the start its Expedition saved for its
        // Portal and had no army until 12:00; the PM, Nov 13)
        mix_over: &[],
        line_max: 0,
        tech_at: 150.0,
        towers: &[150.0, 480.0],
        tower_max: &[],
        expand_at_of: &[(super::BldgKind::Core, 480.0, 600.0)],
        tech_from: NEVER,
        tech_not_before: 0.0,
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
        all_in_after: 240.0, // (since the arc: with caps of 100 and more the cap rarely sends it all in, and a margin-bound wave could wait for ever)
        stall_from: 900.0,
        stage: 12.0,
        stage_wait: 30.0,
        passive_expand: 180.0,
        max_bases: 4,
        reserve: 0.25,
        retreat_below: 1.0,
        wave_only: false,
        retreat_any: false,
        give_up: 4,
        clumsy_until: 0.0,
        army_max: 0,
        mix_tier: 2,
        // (the balance follow-ups: an Anchor Gun per four Pickets from 4:00, not per six from 5:30; Humans against Vael
        // at 64x64 from 20% to 40%, seed for seed; at other levels it cost the Human turtle row and the 96 mirror)
        tier_at: &[],
        mix_over: &[(super::UnitKind::SiegeTank, 4, 240.0)],
        line_max: 0,
        tech_at: 150.0,
        towers: &[150.0, 480.0],
        tower_max: &[],
        expand_at_of: &[],
        tech_from: NEVER,
        tech_not_before: 0.0,
    },
];
