//! The batch: which games a report plays (cells of matchup x map x levels, a run of seeds each), playing one game
//! natively with a read-only record of what happened, and playing them all on threads in a fixed order.

use endfall_sim::data::{BLDG_KINDS, FACTIONS, Faction, UNIT_KINDS};
use endfall_sim::map::{MapKind, MapSize};
use endfall_sim::world::{Event, World};
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};

pub const TPS: u32 = 30;
/// The AI levels, as the menus name them (src/engine/util.js DIFF_NAMES).
pub const LEVELS: [&str; 4] = ["Easy", "Medium", "Hard", "Brutal"];

/// What a cell measures: both seats at one level, or a level against the one below it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Kind {
    Level,
    Ladder,
}

/// One cell: a map, the races and levels by seat. Seat 0 is the one named first.
#[derive(Clone, Debug, PartialEq)]
pub struct Cell {
    pub kind: Kind,
    pub map: MapKind,
    pub size: i32,
    /// Index into `FACTIONS` by seat.
    pub races: [usize; 2],
    pub levels: [usize; 2],
}

impl Cell {
    pub fn faction(&self, seat: usize) -> &'static Faction {
        FACTIONS[self.races[seat]]
    }
    /// A stable name, the key `compare` matches cells by: "64 Standard: Humans Hard vs Vael Hard".
    pub fn id(&self) -> String {
        format!(
            "{} {:?}: {} {} vs {} {}",
            self.size,
            self.map,
            self.faction(0).name,
            LEVELS[self.levels[0]],
            self.faction(1).name,
            LEVELS[self.levels[1]]
        )
    }
    pub fn mirror(&self) -> bool {
        self.races[0] == self.races[1]
    }
}

/// What a report plays.
#[derive(Clone, Debug, PartialEq)]
pub struct Batch {
    pub sizes: Vec<i32>,
    pub maps: Vec<MapKind>,
    pub levels: Vec<usize>,
    /// Ladder pairs (each level against the one below it) as well as each level against itself.
    pub ladder: bool,
    pub seeds: u32,
    /// Game minutes before a game still running is a timeout.
    pub cap_min: u32,
}

impl Batch {
    /// The default batch (R2): 64x64 and 96x96 Standard, every level against itself and the ladder.
    pub fn default_batch() -> Batch {
        Batch {
            sizes: vec![64, 96],
            maps: vec![MapKind::Standard],
            levels: vec![0, 1, 2, 3],
            ladder: true,
            seeds: 5,
            cap_min: 30,
        }
    }
    /// `--quick`: 64x64 only, Medium and Hard and the ladder between them, three seeds (about 30 s on a laptop).
    pub fn quick() -> Batch {
        Batch {
            sizes: vec![64],
            maps: vec![MapKind::Standard],
            levels: vec![1, 2],
            ladder: true,
            seeds: 3,
            cap_min: 30,
        }
    }

    /// Every cell, in a fixed order: size, map, then each level against itself (Humans vs Vael, Vael vs Humans,
    /// Humans vs Humans, Vael vs Vael), then the ladder (the higher level first and second, each race a mirror).
    pub fn cells(&self) -> Vec<Cell> {
        let (h, v) = (0, 1);
        let mut out = Vec::new();
        for &size in &self.sizes {
            for &map in &self.maps {
                for &l in &self.levels {
                    for races in [[h, v], [v, h], [h, h], [v, v]] {
                        out.push(Cell {
                            kind: Kind::Level,
                            map,
                            size,
                            races,
                            levels: [l, l],
                        });
                    }
                }
                if self.ladder {
                    for &l in &self.levels {
                        if l == 0 || !self.levels.contains(&(l - 1)) {
                            continue;
                        }
                        for race in [h, v] {
                            for levels in [[l, l - 1], [l - 1, l]] {
                                out.push(Cell {
                                    kind: Kind::Ladder,
                                    map,
                                    size,
                                    races: [race, race],
                                    levels,
                                });
                            }
                        }
                    }
                }
            }
        }
        out
    }
}

/// One seat's record of a game.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SeatRec {
    /// By unit kind index (`UNIT_KINDS`): trained during the game (not the starting workers), and lost.
    pub units_built: Vec<u32>,
    pub units_lost: Vec<u32>,
    /// By building kind index (`BLDG_KINDS`): finished during the game (not the starting headquarters), and
    /// destroyed (finished or not).
    pub bldgs_built: Vec<u32>,
    pub bldgs_lost: Vec<u32>,
    /// [shards, ether].
    pub mined: [i64; 2],
    pub spent: [i64; 2],
    pub peak_supply: i32,
    /// The sim's own summary (`Stats`): built, lost, killed, razed.
    pub stats: [u32; 4],
}

/// One game's record.
#[derive(Clone, Debug, PartialEq)]
pub struct GameRec {
    pub seed: u32,
    /// The winning seat, or None for a timeout.
    pub winner: Option<usize>,
    pub end_tick: u32,
    /// The first tick something of one seat was hit by the other.
    pub first_attack: Option<u32>,
    /// The first tick an ether vent ran dry.
    pub first_dry: Option<u32>,
    pub seats: [SeatRec; 2],
}

/// Play one game of `cell` from `seed` to its end, or to `cap_min` game minutes, recording as it goes. The world
/// is only read between ticks: the record cannot change the game.
pub fn play(cell: &Cell, seed: u32, cap_min: u32) -> GameRec {
    let size = MapSize::square(cell.size);
    let mut w = World::with_size(
        seed,
        cell.levels[0],
        cell.map,
        size,
        0,
        &[cell.faction(0), cell.faction(1)],
    );
    assert!(
        w.set_diffs(&[cell.levels[0] as u8, cell.levels[1] as u8]),
        "per-seat levels"
    );
    assert!(w.set_ai_seats([true, true]), "two AI seats");
    let cap = cap_min * 60 * TPS;
    let mut seats: [SeatRec; 2] = Default::default();
    for s in &mut seats {
        s.units_built = vec![0; UNIT_KINDS.len()];
        s.units_lost = vec![0; UNIT_KINDS.len()];
        s.bldgs_built = vec![0; BLDG_KINDS.len()];
        s.bldgs_lost = vec![0; BLDG_KINDS.len()];
    }
    // What was there after the last tick, by id: (seat, kind index, a building, finished).
    let mut known: Vec<(u32, u8, u16, bool, bool)> = Vec::new();
    let snapshot = |w: &World| {
        let mut now: Vec<(u32, u8, u16, bool, bool)> = w
            .units
            .iter()
            .map(|u| (u.id, u.team, u.kind.index() as u16, false, true))
            .chain(
                w.bldgs
                    .iter()
                    .map(|b| (b.id, b.team, b.kind.index() as u16, true, b.done)),
            )
            .collect();
        now.sort_unstable_by_key(|e| e.0);
        now
    };
    known.extend(snapshot(&w));
    let ether: Vec<usize> = (0..w.map.nodes.len())
        .filter(|&i| w.map.nodes[i].ether && w.map.nodes[i].amount > 0)
        .collect();
    let (mut first_attack, mut first_dry) = (None, None);
    let mut tick = 0;
    while w.winner < 0 && tick < cap {
        w.step();
        tick += 1;
        if first_attack.is_none() && w.events.iter().any(|e| matches!(e, Event::Attacked { .. })) {
            first_attack = Some(tick);
        }
        w.events.clear();
        if first_dry.is_none()
            && ether
                .iter()
                .any(|&i| w.map.nodes.get(i).is_some_and(|n| n.amount <= 0))
        {
            first_dry = Some(tick);
        }
        for (s, rec) in seats.iter_mut().enumerate() {
            rec.peak_supply = rec.peak_supply.max(w.sup[s][0]);
        }
        let now = snapshot(&w);
        // (both lists by id: a merge finds what is new, what is gone and what was finished this tick)
        let (mut i, mut j) = (0, 0);
        while i < known.len() || j < now.len() {
            let (a, b) = (known.get(i), now.get(j));
            match (a, b) {
                (Some(a), Some(b)) if a.0 == b.0 => {
                    if a.3 && !a.4 && b.4 {
                        seats[b.1 as usize].bldgs_built[b.2 as usize] += 1;
                    }
                    i += 1;
                    j += 1;
                }
                (Some(a), b) if b.is_none_or(|b| a.0 < b.0) => {
                    let r = &mut seats[a.1 as usize];
                    if a.3 {
                        r.bldgs_lost[a.2 as usize] += 1
                    } else {
                        r.units_lost[a.2 as usize] += 1
                    }
                    i += 1;
                }
                (_, Some(b)) => {
                    let r = &mut seats[b.1 as usize];
                    if !b.3 {
                        r.units_built[b.2 as usize] += 1;
                    } else if b.4 {
                        r.bldgs_built[b.2 as usize] += 1; // (placed and finished within one tick)
                    }
                    j += 1;
                }
                (None, None) => unreachable!(),
                _ => unreachable!(),
            }
        }
        known = now;
    }
    for (s, rec) in seats.iter_mut().enumerate() {
        rec.mined = w.ledger[s].mined;
        rec.spent = w.ledger[s].spent;
        let st = &w.stats[s];
        rec.stats = [st.built, st.lost, st.killed, st.razed];
    }
    GameRec {
        seed,
        winner: (w.winner >= 0).then_some(w.winner as usize),
        end_tick: tick,
        first_attack,
        first_dry,
        seats,
    }
}

/// Every game of `cells` x seeds 1..=`seeds`, on `threads` threads, in (cell, seed) order whatever the threads.
/// `progress` hears each game as it ends (done, total).
pub fn play_all(
    cells: &[Cell],
    seeds: u32,
    cap_min: u32,
    threads: usize,
    progress: &(dyn Fn(usize, usize) + Sync),
) -> Vec<Vec<GameRec>> {
    let jobs: Vec<(usize, u32)> = (0..cells.len())
        .flat_map(|c| (1..=seeds).map(move |s| (c, s)))
        .collect();
    let slots: Vec<Mutex<Option<GameRec>>> = jobs.iter().map(|_| Mutex::new(None)).collect();
    let (next, done) = (AtomicUsize::new(0), AtomicUsize::new(0));
    std::thread::scope(|scope| {
        for _ in 0..threads.max(1) {
            scope.spawn(|| {
                loop {
                    let k = next.fetch_add(1, Ordering::SeqCst);
                    let Some(&(c, seed)) = jobs.get(k) else { break };
                    let rec = play(&cells[c], seed, cap_min);
                    *slots[k].lock().unwrap() = Some(rec);
                    progress(done.fetch_add(1, Ordering::SeqCst) + 1, jobs.len());
                }
            });
        }
    });
    let mut out: Vec<Vec<GameRec>> = cells.iter().map(|_| Vec::new()).collect();
    for (k, slot) in slots.into_iter().enumerate() {
        out[jobs[k].0].push(slot.into_inner().unwrap().expect("every game played"));
    }
    out
}
