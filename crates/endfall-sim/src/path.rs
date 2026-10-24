//! A* over the tile grid with 8-way movement and no corner cutting, then line-of-sight smoothing
//! (port of src/sim/path.js, including its f32 cost grid and heap tie-breaking).

use crate::data::{MH, MW, TILE};
use crate::jsmath;
use crate::map::{Map, idx};

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

/// Scratch arrays reused across searches; `stamp` marks which search a cell belongs to.
pub struct PathScratch {
    g_cost: Vec<f32>,
    came: Vec<i32>,
    closed: Vec<u8>,
    stamp_arr: Vec<u32>,
    stamp: u32,
}

impl PathScratch {
    pub fn new() -> Self {
        let n = (MW * MH) as usize;
        PathScratch {
            g_cost: vec![0.0; n],
            came: vec![0; n],
            closed: vec![0; n],
            stamp_arr: vec![0; n],
            stamp: 1,
        }
    }
}

impl Default for PathScratch {
    fn default() -> Self {
        Self::new()
    }
}

/// World-space waypoints (excluding the start), or None if unreachable. Expands at most 5000 nodes.
pub fn astar(
    map: &Map,
    s: &mut PathScratch,
    sx: i32,
    sy: i32,
    gx: i32,
    gy: i32,
) -> Option<Vec<Pt>> {
    let (gx, gy) = map.nearest_free(gx, gy, 8)?;
    let (sx, sy) = if map.blocked(sx, sy) {
        map.nearest_free(sx, sy, 3)?
    } else {
        (sx, sy)
    };
    s.stamp = s.stamp.wrapping_add(1);
    let stamp = s.stamp;
    let mut open = Heap { a: Vec::new() };
    let h = |x: i32, y: i32| {
        let (dx, dy) = ((x - gx).abs() as f64, (y - gy).abs() as f64);
        dx.max(dy) + 0.414 * dx.min(dy)
    };
    let si = idx(sx, sy);
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
    let (mut best, mut best_h, mut n) = (None::<usize>, 1e9, 0);
    while !open.a.is_empty() && {
        let ok = n < 5000;
        n += 1;
        ok
    } {
        let c = open.pop();
        if s.closed[c.i] != 0 && s.stamp_arr[c.i] == stamp {
            continue;
        }
        s.closed[c.i] = 1;
        let hh = h(c.x, c.y);
        if hh < best_h {
            best_h = hh;
            best = Some(c.i);
        }
        if c.x == gx && c.y == gy {
            best = Some(c.i);
            break;
        }
        for dy in -1..=1 {
            for dx in -1..=1 {
                if dx == 0 && dy == 0 {
                    continue;
                }
                let (nx, ny) = (c.x + dx, c.y + dy);
                if map.blocked(nx, ny) {
                    continue;
                }
                if dx != 0 && dy != 0 && (map.blocked(c.x + dx, c.y) || map.blocked(c.x, c.y + dy))
                {
                    continue;
                }
                let ni = idx(nx, ny);
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
    let best = best?;
    let mut path = Vec::new();
    let mut i = best as i32;
    while i != -1 {
        let iu = i as usize;
        path.push(Pt {
            x: (iu as i32 % MW) as f64 * TILE + 16.0,
            y: (iu as i32 / MW) as f64 * TILE + 16.0,
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
        let mut j = path.len() - 1;
        while j > k && !los(map, cur, path[j]) {
            j -= 1;
        }
        out.push(path[j]);
        cur = path[j];
        k = j + 1;
    }
    Some(out)
}

/// True when a unit-sized body can travel the straight segment a→b without touching a blocked tile.
pub fn los(map: &Map, a: Pt, b: Pt) -> bool {
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
            if map.blocked(
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
