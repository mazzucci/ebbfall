//! Paths for groups, and a budget of long searches: units of one seat sent to the same place (or the same building) in
//! the same tick share one route (the first unit's search; the others join it where they can see it), and each seat
//! runs at most `LONG_SEARCHES` long searches a tick. A unit refused one with no route asks again the next tick (in
//! the units' order, which is by id); one replanning a route it has keeps it until its next replan, and replans may
//! take only the first search of a tick, so a new order never waits behind a crowd of replans. A wave of 30 setting
//! off across a 128x128 map was 30 searches of 1-3 ms in one tick.
//!
//! What a tick planned is kept until the end of the step (`Plans::clear`), and forgotten as soon as a building goes up
//! or comes down or a shard field runs dry (`terrain_changed`): derived, never hashed, and the same on every client,
//! since every client gives the same orders in the same order.

use super::*;
use crate::data::radio;
use crate::path::{astar_capped, at_goal, los};

/// A search from a start this many tiles (or more) from its goal, on either axis, is long: shared and budgeted.
pub const LONG_SEARCH: i32 = 16;
/// Long searches a seat may run in one tick (the last only for a unit with no route); more wait.
pub const LONG_SEARCHES: u8 = 2;
/// A unit may take a route planned this tick when its goal is within this many tiles of the route's goal (a wave's
/// spread, a formation's square) and it starts within `JOIN_START` tiles of the route's start.
const JOIN_GOAL: i32 = 4;
const JOIN_START: i32 = 8;
/// The route's first waypoints a unit looks at to join it (the farthest it can walk to in a straight line).
const JOIN_LOOK: usize = 6;
/// Nodes a short search may expand: onto a shared route the unit cannot see, or from its end to the unit's spot.
const SHORT_CAP: usize = 300;

/// A long route planned this tick: its seat, start and goal tiles, the building it leads to the side of (if it is
/// a way to a building: `World::path_to_rect`), and its points from the start's center on.
struct Shared {
    team: u8,
    /// Who can walk it: the route's walkers' class (and the water level).
    foot: Foot,
    start: (i32, i32),
    goal: (i32, i32),
    rect: Option<Rect>,
    pts: Vec<Pt>,
}

/// A building's footprint: top-left tile, width and height.
pub(crate) type Rect = (i32, i32, i32, i32);

/// Where a unit is bound: a spot (its tile), or the side of a building.
#[derive(Clone, Copy)]
enum Bound {
    Tile((i32, i32)),
    Rect(Rect),
}

/// This tick's routes and each seat's long searches so far, and the counts since the game began.
#[derive(Default)]
pub(crate) struct Plans {
    shared: Vec<Shared>,
    long: Vec<u8>,
    work: PathWork,
    /// The seats told this tick that a machine cannot get where it was sent (`World::tell_no_signal`): once a group.
    told: Vec<u8>,
}

/// Path work since the game began, for tests and benches (`World::path_work`; not world state, not hashed).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct PathWork {
    /// Searches run (long and short: a unit's own, or onto a group's route and off its end).
    pub searches: u64,
    /// Nodes those searches expanded.
    pub expanded: u64,
    /// Long searches (`LONG_SEARCH`), each counted against its seat's budget.
    pub long: u64,
    /// Long routes taken from a group's route instead of a search.
    pub shared: u64,
    /// Times a unit was told to wait for the next tick's budget.
    pub waits: u64,
}

impl Plans {
    /// The end of a step: the next tick plans afresh, with a fresh budget.
    pub(crate) fn clear(&mut self) {
        self.shared.clear();
        self.long.clear();
        self.told.clear();
    }
    /// Whether `seat` was told this tick that a machine cannot get there, and telling it.
    pub(crate) fn signal_told(&self, seat: u8) -> bool {
        self.told.contains(&seat)
    }
    pub(crate) fn tell_signal(&mut self, seat: u8) {
        self.told.push(seat);
    }
    /// One more long search for `team`, if its budget allows. A unit that has a route already (refreshing it) may
    /// take only the first: the last is kept for units with none, so a new order waits a tick or two at most however
    /// many units are refreshing.
    fn take(&mut self, team: u8, refresh: bool) -> bool {
        let t = team as usize;
        if self.long.len() <= t {
            self.long.resize(t + 1, 0);
        }
        let cap = if refresh {
            LONG_SEARCHES - 1
        } else {
            LONG_SEARCHES
        };
        if self.long[t] >= cap {
            return false;
        }
        self.charge(team);
        true
    }
    /// A long search run for `team` (counted whether or not its budget had room: the extra tries of a way to a
    /// building).
    pub(crate) fn charge(&mut self, team: u8) {
        let t = team as usize;
        if self.long.len() <= t {
            self.long.resize(t + 1, 0);
        }
        self.long[t] = self.long[t].saturating_add(1);
        self.work.long += 1;
    }
}

fn far(a: (i32, i32), b: (i32, i32), r: i32) -> bool {
    (a.0 - b.0).abs() > r || (a.1 - b.1).abs() > r
}

fn centre((x, y): (i32, i32)) -> Pt {
    Pt {
        x: x as f64 * TILE + 16.0,
        y: y as f64 * TILE + 16.0,
    }
}

/// What planning a walker's route gave: a route (None: no way there), or a wait for the next tick's budget.
pub(crate) enum Plan {
    Route(Option<Vec<Pt>>),
    Wait,
}

impl World {
    /// The path work since the game began.
    pub fn path_work(&self) -> PathWork {
        PathWork {
            searches: self.scratch.searches,
            expanded: self.scratch.expanded,
            ..self.plans.work
        }
    }

    /// The routes planned so far are stale: a building went up or came down, or a field ran dry.
    pub(crate) fn terrain_changed(&mut self) {
        self.plans.shared.clear();
    }

    /// Whether a search from `a` to `b` may run now: a short one always, a long one if `team`'s budget for this tick
    /// allows (it counts against it; `refresh`: the unit has a route already, see `Plans::take`). Refused, the unit
    /// asks again later.
    fn may_search(&mut self, team: u8, a: (i32, i32), b: (i32, i32), refresh: bool) -> bool {
        if !far(a, b, LONG_SEARCH - 1) || self.plans.take(team, refresh) {
            return true;
        }
        self.plans.work.waits += 1;
        false
    }

    /// Keep a long route planned this tick for others to share: from tile `a` to `goal` (the tile asked for; None:
    /// where the route ends, a building's side), or to the side of `rect`.
    fn keep(
        &mut self,
        team: u8,
        foot: Foot,
        a: (i32, i32),
        goal: Option<(i32, i32)>,
        rect: Option<Rect>,
        path: &Option<Vec<Pt>>,
    ) {
        let Some(p) = path.as_ref().filter(|p| !p.is_empty()) else {
            return;
        };
        let end = p[p.len() - 1];
        let mut pts = vec![centre(a)];
        pts.extend_from_slice(p);
        self.plans.shared.push(Shared {
            team,
            foot,
            start: a,
            goal: goal.unwrap_or_else(|| self.map.tile_of(end.x, end.y)),
            rect,
            pts,
        });
    }

    /// A walker's route from (`ux`, `uy`) (tile `a`) to tile `b`: a group's route planned this tick if it can take
    /// it, else its own search, budgeted when long (and then kept for the others). `refresh`: it has a route already.
    pub(crate) fn plan_walk(
        &mut self,
        team: u8,
        foot: Foot,
        (ux, uy): (f64, f64),
        a: (i32, i32),
        b: (i32, i32),
        refresh: bool,
    ) -> Plan {
        let long = far(a, b, LONG_SEARCH - 1);
        if long
            && let Some(p) = self.join_shared(team, foot, Pt { x: ux, y: uy }, a, Bound::Tile(b))
        {
            self.plans.work.shared += 1;
            return Plan::Route(self.first_leg_from(foot, (ux, uy), a, Some(p)));
        }
        if !self.may_search(team, a, b, refresh) {
            return Plan::Wait;
        }
        let path = astar(&self.map, foot, &mut self.scratch, a.0, a.1, b.0, b.1);
        if long {
            self.keep(team, foot, a, Some(b), None, &path);
        }
        Plan::Route(self.first_leg_from(foot, (ux, uy), a, path))
    }

    /// A walker's way from (`ux`, `uy`) to the side of a building (`rect`, aiming at `aim`): as `plan_walk`, shared by
    /// the units of a seat going to the same building in the same tick, and budgeted when long (each of
    /// `path_to_rect`'s tries counts).
    pub(crate) fn plan_to_rect(
        &mut self,
        team: u8,
        foot: Foot,
        (ux, uy): (f64, f64),
        rect: Rect,
        aim: (f64, f64),
        refresh: bool,
    ) -> Plan {
        let a = self.map.tile_of(ux, uy);
        let g = self.map.tile_of(aim.0, aim.1);
        let long = far(a, g, LONG_SEARCH - 1);
        if long
            && let Some(p) = self.join_shared(team, foot, Pt { x: ux, y: uy }, a, Bound::Rect(rect))
        {
            self.plans.work.shared += 1;
            return Plan::Route(self.first_leg_from(foot, (ux, uy), a, Some(p)));
        }
        if !self.may_search(team, a, g, refresh) {
            return Plan::Wait;
        }
        let path = self.path_to_rect(foot, ux, uy, rect, aim, long.then_some(team));
        if long {
            self.keep(team, foot, a, None, Some(rect), &path);
        }
        Plan::Route(self.first_leg_from(foot, (ux, uy), a, path))
    }

    /// A route is smoothed from the center of the unit's tile `a`, but the unit walks its first leg from where it
    /// stands. Off-center beside a rock corner, that straight line can take it into the rock the route went round:
    /// pushed back out (`separate`), it plans again, the same route, and a worker on its round (which replans at once
    /// when pushed) stepped into the corner and back every tick for minutes. Such a unit steps to its tile's center
    /// first. (Its center's line only: one merely walking close to a wall goes straight on.)
    fn first_leg_from(
        &self,
        foot: Foot,
        (ux, uy): (f64, f64),
        a: (i32, i32),
        path: Option<Vec<Pt>>,
    ) -> Option<Vec<Pt>> {
        let mut p = path?;
        let pos = Pt { x: ux, y: uy };
        if let Some(&first) = p.first()
            && self.map.passable(foot, a.0, a.1)
            && !centre_clear(&self.map, foot, pos, first)
        {
            p.insert(0, centre(a));
        }
        Some(p)
    }

    /// The first route planned this tick by `team` that a unit at `pos` (tile `a`) bound for tile `b` (or a
    /// building) can take: it walks straight to the farthest of the route's first waypoints it can (or finds a short
    /// way onto its start), follows it, and at its end goes on to its own tile (straight, or by a short search that
    /// gets there). None: no such route.
    fn join_shared(
        &mut self,
        team: u8,
        foot: Foot,
        pos: Pt,
        a: (i32, i32),
        to: Bound,
    ) -> Option<Vec<Pt>> {
        let k = self.plans.shared.iter().position(|e| {
            e.team == team
                && e.foot == foot
                && !far(e.start, a, JOIN_START)
                && match to {
                    Bound::Tile(b) => e.rect.is_none() && !far(e.goal, b, JOIN_GOAL),
                    Bound::Rect(r) => e.rect == Some(r),
                }
        })?;
        let b = match to {
            Bound::Tile(b) => b,
            Bound::Rect(_) => self.plans.shared[k].goal, // (the same place beside the building)
        };
        let e = &self.plans.shared[k];
        let look = e.pts.len().min(JOIN_LOOK);
        let mut out = match (0..look)
            .rev()
            .find(|&j| los(&self.map, foot, pos, e.pts[j]))
        {
            Some(j) => e.pts[j..].to_vec(),
            None => {
                let (start, rest) = (e.start, e.pts[1..].to_vec());
                let mut p = astar_capped(
                    &self.map,
                    foot,
                    &mut self.scratch,
                    a.0,
                    a.1,
                    start.0,
                    start.1,
                    SHORT_CAP,
                )?;
                if p.last() != Some(&centre(start)) && a != start {
                    return None; // (no short way onto it: a search of its own)
                }
                p.extend(rest);
                p
            }
        };
        let goal = self.plans.shared[k].goal;
        if b != goal {
            // From the route's end to its own tile: straight from the waypoint before the end, or from the end, or a
            // short search.
            let g = centre(b);
            let n = out.len();
            let free = self.map.passable(foot, b.0, b.1);
            if free && n >= 2 && los(&self.map, foot, out[n - 2], g) {
                out[n - 1] = g;
            } else if free && los(&self.map, foot, out.last().copied().unwrap_or(pos), g) {
                out.push(g);
            } else {
                let end = out.last().copied().unwrap_or(pos);
                let t = self.map.tile_of(end.x, end.y);
                let tail = astar_capped(
                    &self.map,
                    foot,
                    &mut self.scratch,
                    t.0,
                    t.1,
                    b.0,
                    b.1,
                    SHORT_CAP,
                )?;
                // (it must get there: a spot behind a wall from the route's end needs a search of its own)
                let last = tail.last().copied().unwrap_or(end);
                if !at_goal(&self.map, foot, b, self.map.tile_of(last.x, last.y)) {
                    return None;
                }
                out.extend(tail);
            }
        }
        Some(out)
    }
}

/// True when a point traveling the straight segment a→b stays off blocked tiles (a unit's center: what `separate`
/// pushes out of rock).
fn centre_clear(map: &Map, foot: Foot, a: Pt, b: Pt) -> bool {
    let steps = (jsmath::dist(a.x, a.y, b.x, b.y) / 4.0).ceil() + 1.0;
    let mut i = 0.0;
    while i <= steps {
        let t = i / steps;
        let (x, y) = (a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
        if !map.passable(foot, (x / TILE).floor() as i32, (y / TILE).floor() as i32) {
            return false;
        }
        i += 1.0;
    }
    true
}

/// Coverage on a route: a tile is covered when its center lies this many px inside a source's reach (so a step
/// between two covered tiles stays inside), and a straight leg when its points, every `LEG_STEP` px, lie `LEG_INSET`
/// px inside.
const TILE_INSET: f64 = 6.0;
const LEG_INSET: f64 = 2.0;
const LEG_STEP: f64 = 8.0;
/// A route short of its goal goes on straight towards it in steps of this many px while they keep inside coverage.
const EDGE_STEP: f64 = 4.0;

/// Whether (x, y) lies at least `inset` px inside one of `srcs` (x, y, reach).
fn covered(srcs: &[(f64, f64, f64)], x: f64, y: f64, inset: f64) -> bool {
    srcs.iter()
        .any(|&(sx, sy, r)| jsmath::dist(sx, sy, x, y) <= r - inset)
}

/// Whether the straight way a→b keeps inside `srcs` (`LEG_INSET`).
fn leg_covered(srcs: &[(f64, f64, f64)], a: Pt, b: Pt) -> bool {
    let steps = jsmath::to_i32((jsmath::dist(a.x, a.y, b.x, b.y) / LEG_STEP).ceil()).max(1);
    (0..=steps).all(|k| {
        let f = k as f64 / steps as f64;
        covered(
            srcs,
            a.x + (b.x - a.x) * f,
            a.y + (b.y - a.y) * f,
            LEG_INSET,
        )
    })
}

impl World {
    /// Coverage (the arc): a machine inside its side's coverage keeps to it. Its `path` towards tile `goal`, if any
    /// leg of it leaves coverage, gives way to a search through covered tiles to the same goal, or to the nearest
    /// covered point to it if none gets there (where it stops: the edge stop); with no search left in the seat's
    /// budget this tick it waits for the next (`Plan::Wait`). Any other unit's route, a flyer's, a stranded machine's
    /// (it goes back by the old rule) or one with coverage everywhere on it, stands as it is.
    pub(crate) fn keep_covered(
        &mut self,
        uid: Id,
        path: Option<Vec<Pt>>,
        goal: (i32, i32),
    ) -> Plan {
        let u = self.u(uid);
        let (team, ux, uy, kind) = (u.team, u.x, u.y, u.kind);
        if !radio::needs_range(kind) || kind.def().air || !self.in_radio(team, ux, uy) {
            return Plan::Route(path);
        }
        let Some(p) = path.as_deref() else {
            return Plan::Route(path); // (no way there at all)
        };
        let srcs = self.radio_reach_list(team);
        let pos = Pt { x: ux, y: uy };
        let whole = std::iter::once(pos)
            .chain(p.iter().copied())
            .zip(p.iter().copied())
            .all(|(a, b)| leg_covered(&srcs, a, b));
        if whole {
            return Plan::Route(path);
        }
        let a = self.map.tile_of(ux, uy);
        if !self.may_search(team, a, goal, false) {
            return Plan::Wait;
        }
        let foot = self.foot(kind);
        let cap = crate::path::SEARCH_CAP * self.map.rock.len() / 4096;
        let found = crate::path::astar_within(
            &self.map,
            foot,
            &mut self.scratch,
            a,
            goal,
            cap,
            |x, y| {
                covered(
                    &srcs,
                    x as f64 * TILE + 16.0,
                    y as f64 * TILE + 16.0,
                    TILE_INSET,
                )
            },
            |p, q| leg_covered(&srcs, p, q),
        );
        let (mut route, reached) = found.unwrap_or_default();
        if !reached {
            // (short of the goal: on from the route's end straight towards it, as far as coverage goes: the edge)
            let end = route.last().copied().unwrap_or(pos);
            let g = centre(goal);
            let d = jsmath::dist(end.x, end.y, g.x, g.y);
            let steps = jsmath::to_i32((d / EDGE_STEP).floor());
            let mut last = None;
            for k in 1..=steps {
                let f = k as f64 * EDGE_STEP / d;
                let q = Pt {
                    x: end.x + (g.x - end.x) * f,
                    y: end.y + (g.y - end.y) * f,
                };
                if !covered(&srcs, q.x, q.y, LEG_INSET) || !los(&self.map, foot, end, q) {
                    break;
                }
                last = Some(q);
            }
            route.extend(last);
        }
        // (the first leg from where it stands, if that stays covered; else from its tile's center)
        let mut route = self
            .first_leg_from(foot, (ux, uy), a, Some(route))
            .unwrap_or_default();
        if let Some(&first) = route.first()
            && !leg_covered(&srcs, pos, first)
            && first != centre(a)
        {
            route.insert(0, centre(a));
        }
        Plan::Route(Some(route))
    }

    /// Whether a machine of `team` at (x, y) can get to tile `goal` through its side's coverage (a player's order
    /// past it is told so: `World::apply`). True for anything not inside coverage.
    pub(crate) fn covered_way(
        &mut self,
        team: u8,
        kind: UnitKind,
        (x, y): (f64, f64),
        goal: (i32, i32),
        reach: f64,
    ) -> bool {
        if !self.in_radio(team, x, y) {
            return true;
        }
        let srcs = self.radio_reach_list(team);
        let foot = self.foot(kind);
        let cap = crate::path::SEARCH_CAP * self.map.rock.len() / 4096;
        let a = self.map.tile_of(x, y);
        let found = crate::path::astar_within(
            &self.map,
            foot,
            &mut self.scratch,
            a,
            goal,
            cap,
            |x, y| {
                covered(
                    &srcs,
                    x as f64 * TILE + 16.0,
                    y as f64 * TILE + 16.0,
                    TILE_INSET,
                )
            },
            |p, q| leg_covered(&srcs, p, q),
        );
        match found {
            Some((_, true)) => true,
            Some((p, false)) => {
                let end = p.last().copied().unwrap_or(Pt { x, y });
                let g = centre(goal);
                jsmath::dist(end.x, end.y, g.x, g.y) <= reach
            }
            None => false,
        }
    }
}
