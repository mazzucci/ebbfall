//! Terrain, resource nodes and the occupancy grid (port of src/sim/map.js).

use crate::data::{BASES, MH, MW, TILE};
use crate::jsmath::{self, PI};
use crate::rng::Mulberry32;

pub type Id = u32;

#[derive(Clone, Debug)]
pub struct Node {
    pub id: Id,
    pub ether: bool,
    pub tx: i32,
    pub ty: i32,
    pub x: f64,
    pub y: f64,
    pub amount: i32,
    pub miners: i32,
    pub r: f64,
    /// Building id of the extractor standing on an ether vent.
    pub extractor: Option<Id>,
}

pub struct Map {
    /// 1 = impassable rock.
    pub rock: Vec<u8>,
    /// 0 free, >0 building id, <0 negative resource-node id.
    pub occ: Vec<i32>,
    /// Noise value per tile, kept for the renderer.
    pub shade: Vec<f32>,
    /// Shard fields (1 tile) and ether vents (2x2), sorted by id.
    pub nodes: Vec<Node>,
}

pub fn idx(x: i32, y: i32) -> usize {
    (y * MW + x) as usize
}
pub fn in_map(x: i32, y: i32) -> bool {
    x >= 0 && y >= 0 && x < MW && y < MH
}

/// Value noise with three octaves over a seeded permutation (port of makeNoise in util.js).
struct Noise {
    p: [u8; 512],
}

impl Noise {
    fn new(rnd: &mut Mulberry32) -> Self {
        let mut p = [0u8; 512];
        for (i, v) in p.iter_mut().enumerate().take(256) {
            *v = i as u8;
        }
        for i in (1..256usize).rev() {
            let j = rnd.below(i as u32 + 1) as usize;
            p.swap(i, j);
        }
        for i in 0..256 {
            p[i + 256] = p[i];
        }
        Noise { p }
    }
    fn h(&self, x: i32, y: i32) -> f64 {
        let a = self.p[(x & 255) as usize] as i32;
        self.p[((a + y) & 255) as usize] as f64 / 255.0
    }
    fn val(&self, x: f64, y: f64) -> f64 {
        let sm = |t: f64| t * t * (3.0 - 2.0 * t);
        let (xi, yi) = (x.floor(), y.floor());
        let (fx, fy) = (sm(x - xi), sm(y - yi));
        let (xi, yi) = (xi as i32, yi as i32);
        let lerp = |a: f64, b: f64, t: f64| a + (b - a) * t;
        lerp(
            lerp(self.h(xi, yi), self.h(xi + 1, yi), fx),
            lerp(self.h(xi, yi + 1), self.h(xi + 1, yi + 1), fx),
            fy,
        )
    }
    fn get(&self, x: f64, y: f64) -> f64 {
        0.6 * self.val(x, y)
            + 0.3 * self.val(x * 2.1 + 7.0, y * 2.1 + 3.0)
            + 0.1 * self.val(x * 4.3 + 11.0, y * 4.3 + 5.0)
    }
}

impl Map {
    pub fn empty() -> Self {
        let n = (MW * MH) as usize;
        Map {
            rock: vec![0; n],
            occ: vec![0; n],
            shade: vec![0.0; n],
            nodes: Vec::new(),
        }
    }

    pub fn blocked(&self, x: i32, y: i32) -> bool {
        !in_map(x, y) || self.rock[idx(x, y)] != 0 || self.occ[idx(x, y)] != 0
    }

    pub fn node(&self, id: Id) -> Option<&Node> {
        self.nodes
            .binary_search_by_key(&id, |n| n.id)
            .ok()
            .map(|i| &self.nodes[i])
    }
    pub fn node_mut(&mut self, id: Id) -> Option<&mut Node> {
        self.nodes
            .binary_search_by_key(&id, |n| n.id)
            .ok()
            .map(move |i| &mut self.nodes[i])
    }

    /// Generate terrain and resources for `seed`; `next_id` is the shared entity id counter.
    pub fn generate(seed: u32, next_id: &mut Id) -> Self {
        let mut m = Map::empty();
        let mut rnd = Mulberry32::new(seed);
        let noise = Noise::new(&mut rnd);
        let mut thr = 0.6;
        const OPEN: [(f64, f64, f64); 5] = [
            (32.0, 32.0, 7.0),
            (16.0, 22.0, 6.0),
            (47.0, 41.0, 6.0),
            (14.0, 38.0, 4.0),
            (49.0, 25.0, 4.0),
        ];
        for _ in 0..12 {
            for y in 0..MH {
                for x in 0..MW {
                    let n = noise.get(x as f64 / 7.5, y as f64 / 7.5);
                    m.shade[idx(x, y)] = n as f32;
                    let mut r = if n > thr { 1 } else { 0 };
                    if x == 0 || y == 0 || x == MW - 1 || y == MH - 1 {
                        r = 1;
                    }
                    for b in BASES {
                        if jsmath::hypot(x as f64 - b.0 as f64 - 1.5, y as f64 - b.1 as f64 - 1.5)
                            < 12.0
                        {
                            r = 0;
                        }
                    }
                    for e in OPEN {
                        if jsmath::hypot(x as f64 - e.0, y as f64 - e.1) < e.2 {
                            r = 0;
                        }
                    }
                    m.rock[idx(x, y)] = r;
                }
            }
            if m.connected(BASES[0], BASES[1]) {
                break;
            }
            thr += 0.03;
        }
        let (b0, b1) = (BASES[0], BASES[1]);
        m.add_shards(
            next_id,
            b0.0 as f64 + 1.5,
            b0.1 as f64 + 1.5,
            PI * 0.75,
            7,
            6.5,
        );
        m.add_vent(next_id, b0.0 + 9, b0.1 - 2);
        m.add_shards(
            next_id,
            b1.0 as f64 + 1.5,
            b1.1 as f64 + 1.5,
            -PI * 0.25,
            7,
            6.5,
        );
        m.add_vent(next_id, b1.0 - 7, b1.1 + 4);
        m.add_shards(next_id, 32.0, 32.0, PI * 0.5, 6, 5.0);
        m.add_vent(next_id, 27, 27);
        m.add_shards(next_id, 16.0, 22.0, PI, 5, 4.5);
        m.add_shards(next_id, 47.0, 41.0, 0.0, 5, 4.5);
        m
    }

    fn add_shards(&mut self, next_id: &mut Id, cx: f64, cy: f64, ang: f64, n: i32, rad: f64) {
        for i in 0..n {
            let a = ang + (i as f64 - (n - 1) as f64 / 2.0) * 0.32;
            let d = rad + if i % 2 == 1 { 0.9 } else { 0.0 };
            let mut tx = jsmath::round(cx + jsmath::cos(a) * d) as i32;
            let mut ty = jsmath::round(cy + jsmath::sin(a) * d) as i32;
            let mut k = 0;
            while k < 6
                && (!in_map(tx, ty)
                    || self.occ[idx(tx, ty)] != 0
                    || (self.rock[idx(tx, ty)] != 0 && k > 3))
            {
                tx += jsmath::sign(jsmath::cos(a)) as i32;
                ty += jsmath::sign(jsmath::sin(a)) as i32;
                k += 1;
            }
            if !in_map(tx, ty) {
                continue;
            }
            self.rock[idx(tx, ty)] = 0;
            let id = *next_id;
            *next_id += 1;
            self.nodes.push(Node {
                id,
                ether: false,
                tx,
                ty,
                x: tx as f64 * TILE + 16.0,
                y: ty as f64 * TILE + 16.0,
                amount: 1500,
                miners: 0,
                r: 14.0,
                extractor: None,
            });
            self.occ[idx(tx, ty)] = -(id as i32);
        }
    }

    fn add_vent(&mut self, next_id: &mut Id, tx: i32, ty: i32) {
        for y in 0..2 {
            for x in 0..2 {
                self.rock[idx(tx + x, ty + y)] = 0;
            }
        }
        let id = *next_id;
        *next_id += 1;
        self.nodes.push(Node {
            id,
            ether: true,
            tx,
            ty,
            x: tx as f64 * TILE + 32.0,
            y: ty as f64 * TILE + 32.0,
            amount: 5000,
            miners: 0,
            r: 24.0,
            extractor: None,
        });
        for y in 0..2 {
            for x in 0..2 {
                self.occ[idx(tx + x, ty + y)] = -(id as i32);
            }
        }
    }

    /// Flood fill over passable rock (ignores occupancy).
    pub fn connected(&self, a: (i32, i32), b: (i32, i32)) -> bool {
        let mut seen = vec![false; (MW * MH) as usize];
        let mut q = vec![a];
        seen[idx(a.0, a.1)] = true;
        while let Some((x, y)) = q.pop() {
            if (x, y) == b {
                return true;
            }
            for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
                let (nx, ny) = (x + dx, y + dy);
                if in_map(nx, ny) && self.rock[idx(nx, ny)] == 0 && !seen[idx(nx, ny)] {
                    seen[idx(nx, ny)] = true;
                    q.push((nx, ny));
                }
            }
        }
        false
    }

    /// Nearest unblocked tile to (tx,ty) within a square radius, searching ring by ring.
    pub fn nearest_free(&self, tx: i32, ty: i32, max_r: i32) -> Option<(i32, i32)> {
        if !self.blocked(tx, ty) {
            return Some((tx, ty));
        }
        for r in 1..=max_r {
            for dy in -r..=r {
                for dx in -r..=r {
                    if dx.abs().max(dy.abs()) != r {
                        continue;
                    }
                    let (x, y) = (tx + dx, ty + dy);
                    if !self.blocked(x, y) {
                        return Some((x, y));
                    }
                }
            }
        }
        None
    }
}
