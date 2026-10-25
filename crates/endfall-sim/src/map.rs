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
    /// Top-left tiles of the two starting Command Cores (4x4): the player's, then the opponent's.
    pub bases: [(i32, i32); 2],
}

/// The character of a map, chosen in the menu. The order is the client's index: append only.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum MapKind {
    /// Balanced fields and winding passes.
    #[default]
    Standard,
    /// Ten times the shards in every field.
    DeepFields,
    /// Extra vents, each holding three times the ether.
    EtherStorm,
    /// Little rock: open ground, fast attacks.
    OpenPlains,
    /// Much rock, narrow passes.
    Labyrinth,
    /// Fields picked nearly clean: 40% of the shards, 60% of the ether.
    Barren,
}

impl MapKind {
    pub const ALL: [MapKind; 6] = [
        MapKind::Standard,
        MapKind::DeepFields,
        MapKind::EtherStorm,
        MapKind::OpenPlains,
        MapKind::Labyrinth,
        MapKind::Barren,
    ];
    pub fn from_index(i: u32) -> MapKind {
        MapKind::ALL.get(i as usize).copied().unwrap_or_default()
    }
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

/// A main base's pocket: the ring of rock around it starts this many tiles from the Core's centre (2 thick).
const POCKET_R: f64 = 12.0;
/// The pocket's one ramp, in tiles across.
const RAMP_W: f64 = 4.5;

impl Map {
    pub fn empty() -> Self {
        let n = (MW * MH) as usize;
        Map {
            rock: vec![0; n],
            occ: vec![0; n],
            shade: vec![0.0; n],
            nodes: Vec::new(),
            bases: BASES,
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

    /// Generate terrain and resources for `seed` in the character of `kind`; `next_id` is the shared entity id
    /// counter. Maps are point-symmetric about the centre (both sides get the same ground, fields and vents), and the
    /// seed picks the layout: where the two bases face each other, the size of the rock features, where the
    /// expansions lie and whether the centre holds a field.
    pub fn generate(seed: u32, kind: MapKind, next_id: &mut Id) -> Self {
        let mut m = Map::empty();
        let mut rnd = Mulberry32::new(seed);
        let noise = Noise::new(&mut rnd);
        let mut f = || rnd.next_u32() as f64 / 4_294_967_296.0;
        // The mirror of a tile through the centre of the map.
        let mir = |(x, y): (i32, i32)| (MW - 1 - x, MH - 1 - y);
        let mirf = |(x, y): (f64, f64)| ((MW - 1) as f64 - x, (MH - 1) as f64 - y);
        // Where the bases face each other: opposite corners (either diagonal) or opposite sides; who starts where.
        const LAYOUTS: [(i32, i32); 4] = [(8, 52), (8, 8), (9, 30), (30, 51)];
        let b0 = LAYOUTS[(f() * 4.0) as usize % 4];
        let b1 = (MW - 4 - b0.0, MH - 4 - b0.1); // the core is 4x4: mirror its far corner
        m.bases = if f() < 0.5 { [b0, b1] } else { [b1, b0] };
        let centre = ((MW - 1) as f64 / 2.0, (MH - 1) as f64 / 2.0);
        let core_c = |b: (i32, i32)| (b.0 as f64 + 1.5, b.1 as f64 + 1.5);
        let (c0, c1) = (core_c(b0), core_c(b1));
        let d = |a: (f64, f64), b: (f64, f64)| jsmath::hypot(a.0 - b.0, a.1 - b.1);
        // Expansions: two or three sites in the first base's half, each mirrored for the other side.
        let want = 2 + (f() < 0.4) as usize;
        let mut sites: Vec<(f64, f64)> = Vec::new();
        for _ in 0..200 {
            if sites.len() >= want {
                break;
            }
            let p = (10.0 + f() * (MW - 20) as f64, 10.0 + f() * (MH - 20) as f64);
            let ok = (18.0..=32.0).contains(&d(p, c0)) // (an expansion, not part of the main base)
                && d(p, c1) > d(p, c0) + 6.0
                && d(p, centre) > 7.0
                && d(p, mirf(p)) > 12.0
                && sites
                    .iter()
                    .all(|&q| d(p, q) > 11.0 && d(mirf(p), q) > 11.0);
            if ok {
                sites.push(p);
            }
        }
        // The natural: the expansion nearest the main (sites in that order). Each main is a pocket walled by a ring
        // of rock with one ramp, facing its natural (an open plain keeps its open ground).
        sites.sort_by(|p, q| d(*p, c0).partial_cmp(&d(*q, c0)).unwrap());
        let natural = sites.first().copied().unwrap_or(centre);
        let pocket = kind != MapKind::OpenPlains;
        let ramp_dir = jsmath::atan2(natural.1 - c0.1, natural.0 - c0.0);
        let middle = f() < 0.55; // a contested field in the centre
        let scale = 6.0 + f() * 4.5; // rock feature size, in tiles
        let mut open: Vec<(f64, f64, f64)> = vec![(c0.0, c0.1, 12.0), (c1.0, c1.1, 12.0)];
        // An expansion's clearing: its field on the far side and room for a Core on the near side, beside the vent.
        for &p in &sites {
            open.push((p.0, p.1, 7.5));
            let q = mirf(p);
            open.push((q.0, q.1, 7.5));
        }
        if middle {
            open.push((centre.0, centre.1, 6.5));
        }
        // Open ground just outside each ramp, so it leads somewhere.
        let ramp_out = (
            c0.0 + jsmath::cos(ramp_dir) * (POCKET_R + 3.0),
            c0.1 + jsmath::sin(ramp_dir) * (POCKET_R + 3.0),
        );
        if pocket {
            open.push((ramp_out.0, ramp_out.1, 3.5));
            let q = mirf(ramp_out);
            open.push((q.0, q.1, 3.5));
        }
        // On a pocket's wall (a ring around a main) but not on its ramp, a gap of RAMP_W tiles facing its natural.
        // Both mains are checked: the half of the map drawn from the noise may hold either (the other is mirrored),
        // and the second main's ramp faces the opposite way.
        let ring = |x: f64, y: f64, c: (f64, f64), dir: f64| -> bool {
            let r = jsmath::hypot(x - c.0, y - c.1);
            if !(POCKET_R..POCKET_R + 2.0).contains(&r) {
                return false;
            }
            let a = jsmath::atan2(y - c.1, x - c.0);
            let off = ((a - dir + 3.0 * PI) % (2.0 * PI)) - PI; // angle from the ramp, in -PI..PI
            off.abs() * r > RAMP_W / 2.0
        };
        let wall =
            |x: f64, y: f64| pocket && (ring(x, y, c0, ramp_dir) || ring(x, y, c1, ramp_dir + PI));
        // Rock where the noise is above the threshold: higher means more open ground. Raised until the bases can
        // walk to each other and every field can be reached (with the fields in place: a crystal may plug a gap).
        let mut thr = match kind {
            MapKind::OpenPlains => 0.74,
            MapKind::Labyrinth => 0.5,
            _ => 0.6,
        };
        let id0 = *next_id;
        for _ in 0..16 {
            for y in 0..MH {
                for x in 0..MW {
                    // One half of the map is drawn from the noise, the other is its mirror image.
                    let (sx, sy) = if idx(x, y) <= idx(MW - 1 - x, MH - 1 - y) {
                        (x, y)
                    } else {
                        mir((x, y))
                    };
                    let n = noise.get(sx as f64 / scale, sy as f64 / scale);
                    m.shade[idx(x, y)] = n as f32;
                    let border = x == 0 || y == 0 || x == MW - 1 || y == MH - 1;
                    let clear = open
                        .iter()
                        .any(|e| jsmath::hypot(sx as f64 - e.0, sy as f64 - e.1) < e.2);
                    let walled = wall(sx as f64, sy as f64);
                    m.rock[idx(x, y)] = if border || walled || (n > thr && !clear) {
                        1
                    } else {
                        0
                    };
                }
            }
            m.nodes.clear();
            m.occ.fill(0);
            *next_id = id0;
            m.place_fields(next_id, kind, c0, centre, &sites, middle);
            let reach = m.walkable_from(b0);
            let reached = |x: i32, y: i32| in_map(x, y) && reach[idx(x, y)];
            let fields_ok = m.nodes.iter().all(|n| {
                let s = if n.ether { 2 } else { 1 };
                (-1..=s).any(|dy| (-1..=s).any(|dx| reached(n.tx + dx, n.ty + dy)))
            });
            if reached(b1.0, b1.1) && fields_ok {
                break;
            }
            thr += 0.03;
        }
        let (shard, ether) = match kind {
            MapKind::DeepFields => (10.0, 1.0),
            MapKind::EtherStorm => (1.0, 3.0),
            MapKind::Barren => (0.4, 0.6),
            _ => (1.0, 1.0),
        };
        for n in &mut m.nodes {
            n.amount = jsmath::round(n.amount as f64 * if n.ether { ether } else { shard }) as i32;
        }
        m
    }

    /// The resource fields of a generated map, the second side the exact tile-for-tile mirror of the first: each
    /// base's own field behind it (away from the centre) with a vent to one side, the expansions (nearest the main
    /// first: the natural and every other one have a vent, all of them on an ether storm), and the centre field and
    /// vent.
    #[allow(clippy::too_many_arguments)]
    fn place_fields(
        &mut self,
        next_id: &mut Id,
        kind: MapKind,
        c0: (f64, f64),
        centre: (f64, f64),
        sites: &[(f64, f64)],
        middle: bool,
    ) {
        let mir = |t: &(i32, i32)| (MW - 1 - t.0, MH - 1 - t.1);
        let away = jsmath::atan2(c0.1 - centre.1, c0.0 - centre.0);
        let side = away + PI * 0.5;
        let v0 = (
            (jsmath::round(c0.0 + jsmath::cos(side) * 8.0) as i32 - 1).clamp(1, MW - 3),
            (jsmath::round(c0.1 + jsmath::sin(side) * 8.0) as i32 - 1).clamp(1, MH - 3),
        );
        let home = self.add_shards(next_id, c0.0, c0.1, away, 7, 6.5);
        self.add_vent(next_id, v0.0, v0.1);
        self.add_shards_at(next_id, &home.iter().map(mir).collect::<Vec<_>>());
        self.add_vent(next_id, MW - 2 - v0.0, MH - 2 - v0.1);
        for (k, &p) in sites.iter().enumerate() {
            // The crystals lie on the far side of the site from the main, clear of the main's ramp.
            let out = jsmath::atan2(p.1 - c0.1, p.0 - c0.0);
            let field = self.add_shards(next_id, p.0, p.1, out, 5, 4.5);
            self.add_shards_at(next_id, &field.iter().map(mir).collect::<Vec<_>>());
            if k % 2 == 0 || kind == MapKind::EtherStorm {
                let v = (jsmath::round(p.0) as i32 - 1, jsmath::round(p.1) as i32 - 1);
                self.add_vent(next_id, v.0, v.1);
                self.add_vent(next_id, MW - 2 - v.0, MH - 2 - v.1);
            }
        }
        if middle {
            let left = self.add_shards(next_id, centre.0 - 3.0, centre.1, PI, 3, 2.5);
            self.add_shards_at(next_id, &left.iter().map(mir).collect::<Vec<_>>());
            self.add_vent(next_id, MW / 2 - 1, MH / 2 - 1); // a 2x2 vent on the centre is its own mirror
        }
    }

    /// An arc of `n` shard crystals around (cx, cy) facing `ang`; returns the tiles used (to mirror them exactly).
    fn add_shards(
        &mut self,
        next_id: &mut Id,
        cx: f64,
        cy: f64,
        ang: f64,
        n: i32,
        rad: f64,
    ) -> Vec<(i32, i32)> {
        let mut used = Vec::new();
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
            if self.add_shard(next_id, tx, ty) {
                used.push((tx, ty));
            }
        }
        used
    }

    /// Shard crystals on exactly these tiles (the mirror image of another field).
    fn add_shards_at(&mut self, next_id: &mut Id, tiles: &[(i32, i32)]) {
        for &(tx, ty) in tiles {
            self.add_shard(next_id, tx, ty);
        }
    }

    fn add_shard(&mut self, next_id: &mut Id, tx: i32, ty: i32) -> bool {
        if !in_map(tx, ty) || self.occ[idx(tx, ty)] != 0 {
            return false;
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
        true
    }

    /// Tiles a walker can reach from `from` (4-neighbour, over unblocked tiles: rock and fields both block).
    fn walkable_from(&self, from: (i32, i32)) -> Vec<bool> {
        let mut seen = vec![false; (MW * MH) as usize];
        let mut q = vec![from];
        seen[idx(from.0, from.1)] = true;
        while let Some((x, y)) = q.pop() {
            for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
                let (nx, ny) = (x + dx, y + dy);
                if !self.blocked(nx, ny) && !seen[idx(nx, ny)] {
                    seen[idx(nx, ny)] = true;
                    q.push((nx, ny));
                }
            }
        }
        seen
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
