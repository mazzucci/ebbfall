//! The batch: which games a report plays (cells of matchup x map x levels, a run of seeds each), playing one game
//! natively with a read-only record of what happened, and playing them all on threads in a fixed order.

use endfall_sim::data::Move;
use endfall_sim::data::{BLDG_KINDS, FACTIONS, Faction, UNIT_KINDS};
use endfall_sim::map::{Foot, Ground, MapKind, MapSize, ShoreField};
use endfall_sim::path::{PathScratch, astar};
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
    /// Where the Shore's reef basins hold their main field (`--shore-field`; the exposed-income variants): `BACK`,
    /// every game's, by default.
    pub shore_field: ShoreField,
    /// The tide on (`--tide`; it moves the water on maps with water, the Shore).
    pub tide: bool,
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
            shore_field: ShoreField::BACK,
            tide: false,
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
            shore_field: ShoreField::BACK,
            tide: false,
        }
    }

    /// Every cell, in a fixed order: size, map, then each level against itself (Humans vs Vael, Vael vs Humans,
    /// Humans vs Humans, Vael vs Vael), then the ladder (the higher level first and second, each race a mirror).
    /// The Shore basins' field, when it is moved and the batch plays the Shore at all (else every game is as ever).
    pub fn moved_shore_field(&self) -> Option<ShoreField> {
        (self.shore_field != ShoreField::BACK && self.maps.contains(&MapKind::Shore))
            .then_some(self.shore_field)
    }

    pub fn cells(&self) -> Vec<Cell> {
        let (h, v) = (0, 1);
        let mut out = Vec::new();
        for &size in &self.sizes {
            // (the Shore is a two-start map: at 96 and 128 it would be the Standard ground under another name)
            for &map in self
                .maps
                .iter()
                .filter(|&&m| m != MapKind::Shore || size == 64)
            {
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
    /// destroyed (finished or not; a cancelled site is not destroyed).
    pub bldgs_built: Vec<u32>,
    pub bldgs_lost: Vec<u32>,
    /// Construction sites cancelled (the AI gives up on one that stalls), by building kind: not counted as lost.
    pub bldgs_cancelled: Vec<u32>,
    /// [shards, ether].
    pub mined: [i64; 2],
    pub spent: [i64; 2],
    pub peak_supply: i32,
    /// The sim's own summary (`Stats`): built, lost, killed, razed.
    pub stats: [u32; 4],
    /// The AI's attack waves: launched, and those that reached the enemy (a unit of it within `WAVE_REACH` tiles of
    /// an enemy building).
    pub waves: [u32; 2],
    /// The army's ground unit-samples (every `SAMPLE` ticks; workers left out) in all, and in deep water.
    pub ground_samples: [u32; 2],
    /// Units lost within `FIELD_NEAR` tiles of a crystal or vent (where they stood the tick before), workers and the
    /// rest: [workers, others].
    pub lost_near_field: [u32; 2],
    /// Which half of the map the seat started in: its headquarters south of the middle row.
    pub south: bool,
}

/// The tick of the Pumps' count: 5:00.
pub const PUMPS_AT: u32 = 5 * 60 * TPS;

/// A unit within this many tiles of an enemy building: its wave reached the other side.
pub const WAVE_REACH: f64 = 8.0;
/// Ticks between the samples of where units stand (deep water).
pub const SAMPLE: u32 = 15;
/// A unit lost within this many tiles of a crystal's or a vent's middle was lost at a field (a worker's reach and a
/// little more: at 8 tiles it was most of the Shore's open ground).
pub const FIELD_NEAR: f64 = 4.0;

/// What stands, by id: (id, seat, kind index, a building, finished, x, y).
type Seen = (u32, u8, u16, bool, bool, f64, f64);

/// One game's record.
#[derive(Clone, Debug, PartialEq)]
pub struct GameRec {
    pub seed: u32,
    /// The winning seat, or None for a timeout.
    pub winner: Option<usize>,
    pub end_tick: u32,
    /// The first tick something of one seat was hit by the other.
    pub first_attack: Option<u32>,
    /// The finished Pumps each seat held at 5:00 (None: the game ended before; PRD: the conversion, the snowball check).
    pub pumps_at_5: Option<[u32; 2]>,
    pub seats: [SeatRec; 2],
    /// On a map with water: the route lengths (tiles) between the two starts' headquarters, for a walker and for an
    /// amphibian (None: no way).
    pub routes: Option<[Option<f64>; 2]>,
    /// Every attack wave of the game, both seats' (`waves::Watch`).
    pub waves: Vec<crate::waves::Wave>,
}

/// The length (tiles) of `foot`'s route from beside block `a` to beside block `b` (4x4 headquarters' tiles).
fn route(w: &World, foot: Foot, a: (i32, i32), b: (i32, i32)) -> Option<f64> {
    let m = &w.map;
    let beside = |t: (i32, i32)| {
        (-1..=4)
            .flat_map(|d| {
                [
                    (t.0 - 1, t.1 + d),
                    (t.0 + 4, t.1 + d),
                    (t.0 + d, t.1 - 1),
                    (t.0 + d, t.1 + 4),
                ]
            })
            .find(|&(x, y)| m.passable(foot, x, y))
    };
    let (from, to) = (beside(a)?, beside(b)?);
    let mut s = PathScratch::new(m.rock.len());
    let p = astar(m, foot, &mut s, from.0, from.1, to.0, to.1)?;
    let mut at = (from.0 as f64 * 32.0 + 16.0, from.1 as f64 * 32.0 + 16.0);
    let mut len = 0.0;
    for q in &p {
        len += ((q.x - at.0).powi(2) + (q.y - at.1).powi(2)).sqrt();
        at = (q.x, q.y);
    }
    (p.last().map(|q| m.tile_of(q.x, q.y)) == Some(to)).then_some(len / 32.0)
}

/// What a game's record watches between ticks, read-only: what stands (by id), and the Pumps at 5:00.
pub struct Tracker {
    /// What there was after the last tick, by id: (id, seat, kind index, a building, finished).
    known: Vec<Seen>,
    pub first_attack: Option<u32>,
    pub pumps_at_5: Option<[u32; 2]>,
    pub seats: [SeatRec; 2],
    /// Each seat's wave out (and whether it has reached yet).
    wave_out: [Option<bool>; 2],
}

fn standing(w: &World) -> Vec<Seen> {
    let mut now: Vec<Seen> = w
        .units
        .iter()
        .map(|u| (u.id, u.team, u.kind.index() as u16, false, true, u.x, u.y))
        .chain(
            w.bldgs
                .iter()
                .map(|b| (b.id, b.team, b.kind.index() as u16, true, b.done, b.x, b.y)),
        )
        .collect();
    now.sort_unstable_by_key(|e| e.0);
    now
}

impl Tracker {
    /// Start watching `w` as it stands (what is there now, the start, is neither built nor lost).
    pub fn new(w: &World) -> Tracker {
        let mut seats: [SeatRec; 2] = Default::default();
        for s in &mut seats {
            s.units_built = vec![0; UNIT_KINDS.len()];
            s.units_lost = vec![0; UNIT_KINDS.len()];
            s.bldgs_built = vec![0; BLDG_KINDS.len()];
            s.bldgs_lost = vec![0; BLDG_KINDS.len()];
        }
        for (s, rec) in seats.iter_mut().enumerate() {
            // (by the headquarters' middle: its 4x4 block's top-left tile plus two)
            rec.south = w.map.bases.get(s).is_some_and(|b| (b.1 + 2) * 2 > w.map.h);
        }
        Tracker {
            known: standing(w),
            first_attack: None,
            pumps_at_5: None,
            seats,
            wave_out: [None; 2],
        }
    }

    /// After tick `tick`, before its events are drained: what was trained, finished, destroyed or cancelled.
    pub fn observe(&mut self, w: &World, tick: u32) {
        if self.first_attack.is_none()
            && w.events.iter().any(|e| matches!(e, Event::Attacked { .. }))
        {
            self.first_attack = Some(tick);
        }
        if tick == PUMPS_AT {
            self.pumps_at_5 = Some([0, 1].map(|s| w.pumps(s) as u32));
        }
        for (s, rec) in self.seats.iter_mut().enumerate() {
            rec.peak_supply = rec.peak_supply.max(w.pools[s][0][0]);
        }
        self.waves(w);
        if tick.is_multiple_of(SAMPLE) {
            self.ground(w);
        }
        let now = standing(w);
        // (both lists by id: a merge finds what is new, what is gone and what was finished this tick)
        let (known, seats) = (&self.known, &mut self.seats);
        let (mut i, mut j) = (0, 0);
        while i < known.len() || j < now.len() {
            match (known.get(i), now.get(j)) {
                (Some(a), Some(b)) if a.0 == b.0 => {
                    if a.3 && !a.4 && b.4 {
                        seats[b.1 as usize].bldgs_built[b.2 as usize] += 1;
                    }
                    i += 1;
                    j += 1;
                }
                (Some(a), b) if b.is_none_or(|b| a.0 < b.0) => {
                    // (gone: a unit killed, a building destroyed, or a site cancelled, which `finish` takes back out)
                    let r = &mut seats[a.1 as usize];
                    if a.3 {
                        r.bldgs_lost[a.2 as usize] += 1
                    } else {
                        r.units_lost[a.2 as usize] += 1;
                        let near = FIELD_NEAR * 32.0;
                        if w.map
                            .nodes
                            .iter()
                            .any(|n| (n.x - a.5).hypot(n.y - a.6) < near)
                        {
                            r.lost_near_field[!UNIT_KINDS[a.2 as usize].def().worker as usize] += 1;
                        }
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
                (Some(_), None) | (None, None) => unreachable!(), // (the arm above takes a gone one; the loop stops)
            }
        }
        self.known = now;
    }

    /// Waves, every tick (cheap): launched when a seat's AI sends one out, reached when one of its units comes within
    /// `WAVE_REACH` tiles of an enemy building's edge.
    fn waves(&mut self, w: &World) {
        for s in 0..2u8 {
            let si = s as usize;
            let Some(ids) = w.ai_wave_of(s) else {
                self.wave_out[si] = None;
                continue;
            };
            if self.wave_out[si].is_none() {
                self.seats[si].waves[0] += 1;
                self.wave_out[si] = Some(false);
            }
            let reach = WAVE_REACH * 32.0;
            let there = ids.iter().filter_map(|&id| w.unit(id)).any(|u| {
                w.bldgs.iter().any(|b| {
                    // (to the footprint's edge)
                    let dx = ((u.x - b.x).abs() - b.w as f64 * 16.0).max(0.0);
                    let dy = ((u.y - b.y).abs() - b.h as f64 * 16.0).max(0.0);
                    b.team != s && (dx * dx + dy * dy).sqrt() < reach
                })
            });
            if there && self.wave_out[si] == Some(false) {
                self.seats[si].waves[1] += 1;
                self.wave_out[si] = Some(true);
            }
        }
    }

    /// Where the armies' ground units stand (workers left out), every `SAMPLE` ticks.
    fn ground(&mut self, w: &World) {
        for u in w
            .units
            .iter()
            .filter(|u| !u.kind.def().air && !u.kind.def().worker)
        {
            let r = &mut self.seats[u.team as usize].ground_samples;
            r[0] += 1;
            r[1] += (w.ground_at(u.x, u.y) == Ground::Deep) as u32;
        }
    }

    /// The seats' records at the end: the sim's ledger and stats added, cancelled sites taken out of the lost.
    pub fn finish(mut self, w: &World) -> [SeatRec; 2] {
        for (s, rec) in self.seats.iter_mut().enumerate() {
            let l = &w.ledger[s];
            rec.mined = l.mined;
            rec.spent = l.spent;
            rec.bldgs_cancelled = l.cancelled.to_vec();
            for (lost, &c) in rec.bldgs_lost.iter_mut().zip(&l.cancelled) {
                *lost -= c.min(*lost);
            }
            let st = &w.stats[s];
            rec.stats = [st.built, st.lost, st.killed, st.razed];
        }
        self.seats
    }
}

/// Play one game of `cell` from `seed` to its end, or to `cap_min` game minutes, recording as it goes. The world
/// is only read between ticks: the record cannot change the game.
pub fn play(cell: &Cell, seed: u32, cap_min: u32, field: ShoreField, tide: bool) -> GameRec {
    let size = MapSize::square(cell.size);
    let mut w = World::with_size(
        seed,
        cell.levels[0],
        cell.map,
        size,
        0,
        &[cell.faction(0), cell.faction(1)],
    );
    if field != ShoreField::BACK {
        w.set_shore_field(field);
    }
    if tide {
        w.set_tide(true);
    }
    assert!(
        w.set_diffs(&[cell.levels[0] as u8, cell.levels[1] as u8]),
        "per-seat levels"
    );
    assert!(w.set_ai_seats([true, true]), "two AI seats");
    let cap = cap_min * 60 * TPS;
    let routes = (!w.map.basins.is_empty()).then(|| {
        let walk = Foot {
            class: Move::Walk,
            water: w.water,
        };
        let amph = Foot {
            class: Move::Amph,
            water: w.water,
        };
        [
            route(&w, walk, w.map.bases[0], w.map.bases[1]),
            route(&w, amph, w.map.bases[0], w.map.bases[1]),
        ]
    });
    let mut track = Tracker::new(&w);
    let mut watch = crate::waves::Watch::default();
    let mut tick = 0;
    while w.winner < 0 && tick < cap {
        w.step();
        tick += 1;
        track.observe(&w, tick);
        watch.observe(&w);
        w.events.clear();
    }
    let (first_attack, pumps_at_5) = (track.first_attack, track.pumps_at_5);
    GameRec {
        seed,
        winner: (w.winner >= 0).then_some(w.winner as usize),
        end_tick: tick,
        first_attack,
        pumps_at_5,
        seats: track.finish(&w),
        routes,
        waves: watch.finish(&w),
    }
}

/// Every game of `cells` x seeds 1..=`seeds`, on `threads` threads, in (cell, seed) order whatever the threads.
/// `progress` hears each game as it ends (done, total).
pub fn play_all(
    cells: &[Cell],
    seeds: u32,
    cap_min: u32,
    field: ShoreField,
    tide: bool,
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
                    let rec = play(&cells[c], seed, cap_min, field, tide);
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

#[cfg(test)]
mod tests {
    use super::*;
    use endfall_sim::data::{BldgKind, UnitKind};

    #[test]
    fn a_unit_lost_beside_a_crystal_or_a_vent_counts_at_a_field_and_one_lost_far_off_does_not() {
        let mut w = World::new(1, 1);
        w.disable_ai();
        let n = &w.map.nodes[0];
        let (nx, ny) = (n.x, n.y);
        // the farthest point of the map from every node
        let far = (0..w.map.h)
            .flat_map(|y| {
                (0..w.map.w).map(move |x| (x as f64 * 32.0 + 16.0, y as f64 * 32.0 + 16.0))
            })
            .max_by(|a, b| {
                let d = |p: &(f64, f64)| {
                    w.map
                        .nodes
                        .iter()
                        .map(|n| (n.x - p.0).hypot(n.y - p.1))
                        .fold(f64::MAX, f64::min)
                };
                d(a).total_cmp(&d(b))
            })
            .unwrap();
        let worker = w.make_unit(UnitKind::Harvester, 0, nx + 64.0, ny);
        let trooper = w.make_unit(UnitKind::Trooper, 0, nx, ny + 3.5 * 32.0);
        let away = w.make_unit(UnitKind::Trooper, 1, far.0, far.1);
        let mut t = Tracker::new(&w);
        t.observe(&w, 1);
        w.units.retain(|u| ![worker, trooper, away].contains(&u.id));
        t.observe(&w, 2);
        let seats = t.finish(&w);
        assert_eq!(
            seats[0].lost_near_field,
            [1, 1],
            "a worker and a trooper, each within 4 tiles"
        );
        assert_eq!(
            seats[1].lost_near_field,
            [0, 0],
            "lost far from every field"
        );
        assert_eq!(
            seats[1].units_lost[UnitKind::Trooper.index()],
            1,
            "but lost"
        );
    }

    #[test]
    fn the_tracker_counts_what_is_trained_finished_lost_and_cancelled() {
        let mut w = World::new(1, 1);
        w.disable_ai();
        let mut t = Tracker::new(&w);
        let (h, d) = (UnitKind::Trooper.index(), BldgKind::Depot.index());
        // A unit trained, then gone.
        let u = w.make_unit(UnitKind::Trooper, 0, 900.0, 1200.0);
        t.observe(&w, 1);
        w.units.retain(|x| x.id != u);
        t.observe(&w, 2);
        // A site that is finished later, one cancelled, one destroyed before it was finished; one placed finished.
        let done_later = w.make_building(BldgKind::Depot, 0, 20, 20, false);
        let cancelled = w.make_building(BldgKind::Depot, 0, 24, 20, false);
        let razed = w.make_building(BldgKind::Depot, 0, 28, 20, false);
        t.observe(&w, 3);
        w.bldgs
            .iter_mut()
            .find(|b| b.id == done_later)
            .unwrap()
            .done = true;
        assert!(w.cancel_construction(cancelled));
        w.bldgs.retain(|b| b.id != razed);
        w.make_building(BldgKind::Depot, 1, 32, 20, true);
        t.observe(&w, 4);
        let seats = t.finish(&w);
        let s = &seats[0];
        assert_eq!(
            (s.units_built[h], s.units_lost[h]),
            (1, 1),
            "a trooper trained and lost"
        );
        assert_eq!(s.bldgs_built[d], 1, "one depot finished");
        assert_eq!(
            s.bldgs_lost[d], 1,
            "one destroyed (the cancelled site is not lost)"
        );
        assert_eq!(s.bldgs_cancelled[d], 1);
        assert_eq!(seats[1].bldgs_built[d], 1, "placed finished: built");
        assert_eq!(
            s.units_built.iter().sum::<u32>(),
            1,
            "the starting workers are not counted"
        );
    }
}

#[cfg(test)]
mod shore_tests {
    use super::*;

    #[test]
    fn the_shore_is_played_at_64_only_and_its_games_record_routes_waves_and_deep_water() {
        let b = Batch {
            sizes: vec![64, 96],
            maps: vec![MapKind::Standard, MapKind::Shore],
            levels: vec![1],
            ladder: false,
            seeds: 1,
            cap_min: 9,
            shore_field: ShoreField::BACK,
            tide: false,
        };
        let cells = b.cells();
        assert!(
            cells
                .iter()
                .filter(|c| c.map == MapKind::Shore)
                .all(|c| c.size == 64),
            "the Shore at 64x64 only"
        );
        assert_eq!(cells.iter().filter(|c| c.map == MapKind::Shore).count(), 4);
        let shore = cells
            .iter()
            .find(|c| c.map == MapKind::Shore && c.races == [0, 1])
            .unwrap();
        let g = play(shore, 1, 9, ShoreField::BACK, false);
        let r = g.routes.expect("a map with water: its routes");
        assert!(
            r[0].is_some() && r[1].is_some(),
            "both peoples have a way: {r:?}"
        );
        assert!(
            g.seats.iter().any(|s| s.waves[0] >= 1),
            "an attack wave in nine minutes"
        );
        assert!(g.seats.iter().all(|s| s.waves[1] <= s.waves[0]));
        assert!(
            g.seats
                .iter()
                .all(|s| s.ground_samples[0] > 0 && s.ground_samples[1] <= s.ground_samples[0])
        );
        assert_ne!(
            g.seats[0].south, g.seats[1].south,
            "the two starts in different halves"
        );
        // (a map without water: no routes)
        let standard = cells.iter().find(|c| c.map == MapKind::Standard).unwrap();
        assert_eq!(play(standard, 1, 1, ShoreField::BACK, false).routes, None);
    }
}
