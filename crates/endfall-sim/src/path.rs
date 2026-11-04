//! A* over the tile grid with 8-way movement and no corner cutting, then line-of-sight smoothing
//! (an f32 cost grid and fixed heap tie-breaks: which of two equal paths a unit takes is part of the rules).

use crate::data::TILE;
use crate::jsmath;
use crate::map::{Foot, Map};

#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub struct Pt {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Copy)]
struct HeapNode {
    i: usize,
    x: i32,
    y: i32,
    f: f64,
}

/// Binary min-heap on `f`, with exactly the sift rules of the JS Heap class.
struct Heap {
    a: Vec<HeapNode>,
}

impl Heap {
    fn push(&mut self, n: HeapNode) {
        let a = &mut self.a;
        a.push(n);
        let mut i = a.len() - 1;
        while i > 0 {
            let p = (i - 1) >> 1;
            if a[p].f <= a[i].f {
                break;
            }
            a.swap(p, i);
            i = p;
        }
    }
    fn pop(&mut self) -> HeapNode {
        let a = &mut self.a;
        let top = a[0];
        let l = a.pop().unwrap();
        if !a.is_empty() {
            a[0] = l;
            let mut i = 0;
            loop {
                let mut s = i;
                let (lc, rc) = (2 * i + 1, 2 * i + 2);
                if lc < a.len() && a[lc].f < a[s].f {
                    s = lc;
                }
                if rc < a.len() && a[rc].f < a[s].f {
                    s = rc;
                }
                if s == i {
                    break;
                }
                a.swap(s, i);
                i = s;
            }
        }
        top
    }
}

/// Scratch arrays reused across searches (one cell per map tile); `stamp` marks which search a cell belongs to.
pub struct PathScratch {
    g_cost: Vec<f32>,
    came: Vec<i32>,
    closed: Vec<u8>,
    stamp_arr: Vec<u32>,
    stamp: u32,
    /// Searches run and nodes expanded since the game began: a measure of the path work, not world state.
    pub searches: u64,
    pub expanded: u64,
}

impl PathScratch {
    /// For a map of `n` tiles.
    pub fn new(n: usize) -> Self {
        PathScratch {
            g_cost: vec![0.0; n],
            came: vec![0; n],
            closed: vec![0; n],
            stamp_arr: vec![0; n],
            stamp: 1,
            searches: 0,
            expanded: 0,
        }
    }
}

impl PathScratch {
    /// The number of tiles it is for.
    pub fn len(&self) -> usize {
        self.g_cost.len()
    }
    pub fn is_empty(&self) -> bool {
        self.g_cost.is_empty()
    }
}

/// Nodes a search may expand on a 64x64 map (4096 tiles), and in proportion on others: a goal walled off (or behind a
/// long detour) costs about this many pops before the search gives up on the nearest point it found.
pub const SEARCH_CAP: usize = 5000;

/// How far ahead (in steps of the raw route) the smoothing looks for a straight line from each waypoint: a long
/// straight stretch gets a waypoint every so many tiles instead of one, and smoothing a long route costs that much
/// per waypoint rather than the route's whole length (it was about half a cross-map path's time).
pub const SMOOTH_LOOK: usize = 24;

/// World-space waypoints (excluding the start), or None if unreachable, for a walker with `foot` (only tiles it may
/// stand on: `Map::passable`). Expands at most `SEARCH_CAP` nodes per 4096 tiles of map.
pub fn astar(
    map: &Map,
    foot: Foot,
    s: &mut PathScratch,
    sx: i32,
    sy: i32,
    gx: i32,
    gy: i32,
) -> Option<Vec<Pt>> {
    astar_capped(
        map,
        foot,
        s,
        sx,
        sy,
        gx,
        gy,
        SEARCH_CAP * map.rock.len() / 4096,
    )
}

/// The goal of a search for tile `g`: `g` itself where `foot` may stand on it (radius 0), else the free tiles of the
/// nearest ring round it that has any (radius 1 to 8). A blocked goal (a crystal, a building) is reached at whichever
/// of them the search gets to first: the side a unit comes to first, from every direction alike, and the same side
/// as it walks there (a fixed choice made the search's end the first tile of a scan, the ring's top row: every
/// harvester aimed at the north side of its crystal, the near side for a base south of its field and the far side for
/// one north of it).
pub fn goal_radius(map: &Map, foot: Foot, g: (i32, i32)) -> Option<i32> {
    if map.passable(foot, g.0, g.1) {
        return Some(0);
    }
    (1..=8).find(|&r| {
        (-r..=r).any(|d| {
            [(d, -r), (d, r), (-r, d), (r, d)]
                .iter()
                .any(|&(dx, dy)| map.passable(foot, g.0 + dx, g.1 + dy))
        })
    })
}

/// Whether a search for `g` that ended on tile `t` got there (`goal_radius`): anything that checks a search's end.
pub fn at_goal(map: &Map, foot: Foot, g: (i32, i32), t: (i32, i32)) -> bool {
    goal_radius(map, foot, g).is_some_and(|r| {
        map.passable(foot, t.0, t.1) && (t.0 - g.0).abs().max((t.1 - g.1).abs()) == r
    })
}

/// `astar` expanding at most `cap` nodes (a short search: a unit joining a group's route, or from its end to its own
/// spot), ending at the nearest point it found if the goal is farther.
#[allow(clippy::too_many_arguments)]
pub fn astar_capped(
    map: &Map,
    foot: Foot,
    s: &mut PathScratch,
    sx: i32,
    sy: i32,
    gx: i32,
    gy: i32,
    cap: usize,
) -> Option<Vec<Pt>> {
    let r = goal_radius(map, foot, (gx, gy))?;
    // (a start on a blocked tile: the free tile beside it nearest the goal)
    let (sx, sy) = map.nearest_passable_to(
        foot,
        sx,
        sy,
        3,
        (gx as f64 * TILE + 16.0, gy as f64 * TILE + 16.0),
    )?;
    let is_goal = |x: i32, y: i32| {
        (x - gx).abs().max((y - gy).abs()) == r && (r == 0 || map.passable(foot, x, y))
    };
    let oct = |x: i32, y: i32| {
        let (dx, dy) = ((x - gx).abs() as f64, (y - gy).abs() as f64);
        dx.max(dy) + 0.414 * dx.min(dy)
    };
    // (to the nearest tile of the ring: at least the distance to its middle less the ring's farthest corner)
    let h = |x: i32, y: i32| {
        if r == 0 {
            oct(x, y)
        } else if is_goal(x, y) {
            0.0
        } else {
            (oct(x, y) - 1.414 * r as f64).max(0.0)
        }
    };
    // Ties (equal ways to two tiles of the ring, or two nearest points to a goal it cannot reach): the tile on the
    // clockwise side of the line from the goal to the map's middle, then the nearer the goal. The map's turns (the
    // starts' symmetry) leave its middle where it is, so they turn the choice with them, and it does not depend on
    // where the search starts (a unit's replans on its way agree).
    let (mx, my) = ((map.w - 1) as f64 / 2.0, (map.h - 1) as f64 / 2.0);
    let side =
        |x: i32, y: i32| (mx - gx as f64) * (y - gy) as f64 - (my - gy as f64) * (x - gx) as f64;
    s.stamp = s.stamp.wrapping_add(1);
    let stamp = s.stamp;
    let mut open = Heap { a: Vec::new() };
    let si = map.idx(sx, sy);
    s.stamp_arr[si] = stamp;
    s.g_cost[si] = 0.0;
    s.came[si] = -1;
    s.closed[si] = 0;
    open.push(HeapNode {
        i: si,
        x: sx,
        y: sy,
        f: h(sx, sy),
    });
    // (the nearest point to the goal found so far, for a goal it cannot reach: nearest its middle, then the side rule)
    let (mut best, mut best_h, mut best_side, mut n) = (None::<usize>, 1e9, 0.0, 0);
    // (the ring's first tile reached, its cost and its tie-break keys; the search goes on through the ways as short)
    let mut found: Option<(usize, f32, f64, f64)> = None;
    while !open.a.is_empty() && {
        let ok = n < cap;
        n += 1;
        ok
    } {
        let c = open.pop();
        if s.closed[c.i] != 0 && s.stamp_arr[c.i] == stamp {
            continue;
        }
        if found.is_some_and(|f| c.f > f.1 as f64 + 1e-6) {
            break;
        }
        s.closed[c.i] = 1;
        let (hh, sd) = (oct(c.x, c.y), side(c.x, c.y));
        if found.is_none()
            && (hh < best_h
                || (hh == best_h
                    && (sd > best_side || (sd == best_side && best.is_some_and(|b| c.i < b)))))
        {
            (best_h, best_side) = (hh, sd);
            best = Some(c.i);
        }
        if is_goal(c.x, c.y) {
            let (gc, sd, near) = (s.g_cost[c.i], side(c.x, c.y), oct(c.x, c.y));
            let better = found.is_none_or(|f| {
                gc < f.1
                    || (gc == f.1
                        && (sd > f.2 || (sd == f.2 && (near < f.3 || (near == f.3 && c.i < f.0)))))
            });
            if better {
                found = Some((c.i, gc, sd, near));
                best = Some(c.i);
            }
            if r == 0 {
                break;
            }
            continue;
        }
        for dy in -1..=1 {
            for dx in -1..=1 {
                if dx == 0 && dy == 0 {
                    continue;
                }
                let (nx, ny) = (c.x + dx, c.y + dy);
                if !map.passable(foot, nx, ny) {
                    continue;
                }
                if dx != 0
                    && dy != 0
                    && (!map.passable(foot, c.x + dx, c.y) || !map.passable(foot, c.x, c.y + dy))
                {
                    continue;
                }
                let ni = map.idx(nx, ny);
                let ng = s.g_cost[c.i] as f64 + if dx != 0 && dy != 0 { 1.414 } else { 1.0 };
                if s.stamp_arr[ni] != stamp || ng < s.g_cost[ni] as f64 {
                    s.stamp_arr[ni] = stamp;
                    s.g_cost[ni] = ng as f32;
                    s.came[ni] = c.i as i32;
                    s.closed[ni] = 0;
                    open.push(HeapNode {
                        i: ni,
                        x: nx,
                        y: ny,
                        f: ng + h(nx, ny),
                    });
                }
            }
        }
    }
    s.searches += 1;
    s.expanded += n as u64;
    let best = best?;
    let mut path = Vec::new();
    let mut i = best as i32;
    while i != -1 {
        let iu = i as usize;
        path.push(Pt {
            x: (iu as i32 % map.w) as f64 * TILE + 16.0,
            y: (iu as i32 / map.w) as f64 * TILE + 16.0,
        });
        i = s.came[iu];
    }
    path.reverse();
    if !path.is_empty() {
        path.remove(0);
    }
    let mut out = Vec::new();
    let mut cur = Pt {
        x: sx as f64 * TILE + 16.0,
        y: sy as f64 * TILE + 16.0,
    };
    let mut k = 0;
    while k < path.len() {
        let mut j = (path.len() - 1).min(k + SMOOTH_LOOK);
        while j > k && !los(map, foot, cur, path[j]) {
            j -= 1;
        }
        out.push(path[j]);
        cur = path[j];
        k = j + 1;
    }
    Some(out)
}

/// True when a unit-sized body with `foot` can travel the straight segment a→b touching only tiles it may stand on.
pub fn los(map: &Map, foot: Foot, a: Pt, b: Pt) -> bool {
    let steps = (jsmath::dist(a.x, a.y, b.x, b.y) / 10.0).ceil() + 1.0;
    let mut i = 0.0;
    while i <= steps {
        let t = i / steps;
        let x = a.x + (b.x - a.x) * t;
        let y = a.y + (b.y - a.y) * t;
        for (ox, oy) in [
            (0.0, 0.0),
            (8.0, 8.0),
            (-8.0, 8.0),
            (8.0, -8.0),
            (-8.0, -8.0),
        ] {
            if !map.passable(
                foot,
                ((x + ox) / TILE).floor() as i32,
                ((y + oy) / TILE).floor() as i32,
            ) {
                return false;
            }
        }
        i += 1.0;
    }
    true
}
