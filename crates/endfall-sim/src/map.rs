//! Terrain, resource nodes and the occupancy grid (port of src/sim/map.js).

use crate::data::TILE;
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
    /// Which shard field (an arc of crystals, laid down together) it belongs to; 0 for a vent.
    pub field: u32,
}

/// The most starts a generated map of `size` has: 2 on a duel's 64x64 (or any map that is not square), 4 on 96x96 (the
/// quarter turns of one start), 8 on 128x128 (the quarter turns and their mirror images).
pub fn max_starts(size: MapSize) -> usize {
    match size.w.min(size.h) {
        _ if size.w != size.h => 2,
        n if n >= 128 => 8,
        n if n >= 96 => 4,
        _ => 2,
    }
}

/// The starts a map for `seats` seats is generated with: the fewest of 2, 4 and 8 that seat them all (3 seats play on
/// a four-start map, 5 to 7 on an eight-start one), at most the size's `max_starts` (a World refuses the rest).
pub fn starts_for(size: MapSize, seats: usize) -> usize {
    let k = [2, 4, 8].into_iter().find(|&k| k >= seats).unwrap_or(8);
    k.min(max_starts(size))
}

/// Which of a map's `k` starts (in ring order) each of `n` seats takes, then the starts nobody takes: the seats spread
/// evenly round the ring (seat `s` at `s * k / n`: 3 of 4 leave one corner free, 6 of 8 two opposite starts), the
/// whole turned by `side` (two seats on two starts: 1 trades them).
pub fn seat_starts(k: usize, n: usize, side: u32) -> Vec<usize> {
    let turn = side as usize % k;
    let mut order: Vec<usize> = (0..n).map(|s| (turn + s * k / n) % k).collect();
    order.extend((0..k).filter(|i| !order.contains(i)).collect::<Vec<_>>());
    order
}

/// A map's size in tiles.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MapSize {
    pub w: i32,
    pub h: i32,
}

impl MapSize {
    /// A two-seat map (every map the menus offer); M4: about 96x96 for four, 128x128 for six to eight.
    pub const DUEL: MapSize = MapSize { w: 64, h: 64 };
    pub const fn square(n: i32) -> MapSize {
        MapSize { w: n, h: n }
    }
}

pub struct Map {
    /// Width and height in tiles; every grid below is `w * h`, row by row.
    pub w: i32,
    pub h: i32,
    /// 1 = impassable rock.
    pub rock: Vec<u8>,
    /// 0 free, >0 building id, <0 negative resource-node id.
    pub occ: Vec<i32>,
    /// Noise value per tile, kept for the renderer.
    pub shade: Vec<f32>,
    /// Shard fields (1 tile) and ether vents (2x2), sorted by id.
    pub nodes: Vec<Node>,
    /// Top-left tiles of the starting Command Cores (4x4). A generated map lists its starts in ring order (each the
    /// next one's neighbour round the map); a World puts them in seat order (`seat_starts`), the starts nobody took
    /// after the seats' (a World refuses more seats than its map has bases).
    pub bases: Vec<(i32, i32)>,
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

/// The symmetry a generated map is drawn with: its `k` starts are one start's images under these maps of the grid (2:
/// the point mirror through the centre; 4: the quarter turns of a square; 8: the quarter turns and their mirror
/// images), and so is everything else (ground, pockets, fields, vents): every start gets the same.
#[derive(Clone, Copy)]
struct Sym {
    k: usize,
    w: i32,
    h: i32,
}

impl Sym {
    /// Element `g` in ring order (0 the identity; each start the next one's neighbour round the map) as quarter turns
    /// after an optional mirror (top to bottom). With 8: R^j, then R^(j+1) after the mirror.
    fn elem(&self, g: usize) -> (usize, bool) {
        match self.k {
            2 => (2 * g, false),
            4 => (g, false),
            _ => ((g / 2 + g % 2) % 4, g % 2 == 1),
        }
    }
    /// Element `g` on a point in tile units (a quarter turn: (x, y) to (w-1-y, x); half a turn: the point mirror).
    fn point(&self, g: usize, (x, y): (f64, f64)) -> (f64, f64) {
        let (r, flip) = self.elem(g);
        let (w1, h1) = ((self.w - 1) as f64, (self.h - 1) as f64);
        let y = if flip { h1 - y } else { y };
        match r {
            0 => (x, y),
            1 => (w1 - y, x),
            2 => (w1 - x, h1 - y),
            _ => (y, h1 - x),
        }
    }
    fn tile(&self, g: usize, (x, y): (i32, i32)) -> (i32, i32) {
        let (r, flip) = self.elem(g);
        let y = if flip { self.h - 1 - y } else { y };
        match r {
            0 => (x, y),
            1 => (self.w - 1 - y, x),
            2 => (self.w - 1 - x, self.h - 1 - y),
            _ => (y, self.h - 1 - x),
        }
    }
    /// Element `g` on a block of `s` x `s` tiles, by its top-left tile.
    fn block(&self, g: usize, (x, y): (i32, i32), s: i32) -> (i32, i32) {
        let (a, b) = (self.tile(g, (x, y)), self.tile(g, (x + s - 1, y + s - 1)));
        (a.0.min(b.0), a.1.min(b.1))
    }
    /// Element `g` on a direction (radians; not normalised: half a turn adds PI).
    fn angle(&self, g: usize, a: f64) -> f64 {
        let (r, flip) = self.elem(g);
        (if flip { -a } else { a }) + r as f64 * (PI / 2.0)
    }
}

/// A main base's pocket: the ring of rock around it starts this many tiles from the Core's centre (2 thick).
const POCKET_R: f64 = 12.0;
/// The pocket's one ramp, in tiles across.
const RAMP_W: f64 = 4.5;

impl Map {
    /// Open ground, no fields; the two starts near opposite corners (test arenas: generated maps choose their own).
    pub fn empty(size: MapSize) -> Self {
        let n = (size.w * size.h) as usize;
        Map {
            w: size.w,
            h: size.h,
            rock: vec![0; n],
            occ: vec![0; n],
            shade: vec![0.0; n],
            nodes: Vec::new(),
            bases: vec![(9, size.h - 10), (size.w - 10, 9)],
        }
    }

    pub fn size(&self) -> MapSize {
        MapSize {
            w: self.w,
            h: self.h,
        }
    }
    /// The index of tile (x, y) in the grids.
    pub fn idx(&self, x: i32, y: i32) -> usize {
        (y * self.w + x) as usize
    }
    pub fn in_map(&self, x: i32, y: i32) -> bool {
        x >= 0 && y >= 0 && x < self.w && y < self.h
    }
    /// Width and height in world pixels.
    pub fn ww(&self) -> f64 {
        self.w as f64 * TILE
    }
    pub fn wh(&self) -> f64 {
        self.h as f64 * TILE
    }
    /// The tile under a world point, clamped onto the map.
    pub fn tile_of(&self, x: f64, y: f64) -> (i32, i32) {
        (
            jsmath::to_i32(x / TILE).clamp(0, self.w - 1),
            jsmath::to_i32(y / TILE).clamp(0, self.h - 1),
        )
    }
    /// Keep a point inside the playable map (16 px margin, like unit movement).
    pub fn clamp_x(&self, x: f64) -> f64 {
        x.clamp(16.0, self.ww() - 16.0)
    }
    pub fn clamp_y(&self, y: f64) -> f64 {
        y.clamp(16.0, self.wh() - 16.0)
    }

    pub fn blocked(&self, x: i32, y: i32) -> bool {
        !self.in_map(x, y) || self.rock[self.idx(x, y)] != 0 || self.occ[self.idx(x, y)] != 0
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

    /// Generate terrain and resources for `seed` in the character of `kind`, `size` tiles, with `starts` starting
    /// bases (2, 4 or 8, at most `max_starts`); `next_id` is the shared entity id counter. A map is one start's share
    /// and its images (`Sym`: two starts point-symmetric about the centre, four the quarter turns of a square, eight
    /// those and their mirror images), so every start gets the same ground, fields and vents; the seed picks the
    /// layout: where the bases stand (two: opposite corners or sides; four: the corners or the middles of the sides;
    /// eight: two by each side, as far from each other as from their neighbours round the corner), the size of the
    /// rock features, where the expansions lie and whether the centre holds a field. A larger map keeps the bases'
    /// distance from their edges, the size of rock features, fields and pockets, and gets more expansions, farther
    /// out (on 64x64 every formula below gives the numbers it always had, draw for draw: the goldens pin them).
    pub fn generate(
        seed: u32,
        kind: MapKind,
        size: MapSize,
        starts: usize,
        next_id: &mut Id,
    ) -> Self {
        debug_assert!(
            size.w % 2 == 0 && size.h % 2 == 0,
            "an even size: the centre vent is its own mirror"
        );
        assert!(
            [2, 4, 8].contains(&starts) && starts <= max_starts(size),
            "{starts} starts on {}x{}",
            size.w,
            size.h
        );
        let (mw, mh) = (size.w, size.h);
        let sym = Sym {
            k: starts,
            w: mw,
            h: mh,
        };
        let k = starts;
        let mut m = Map::empty(size);
        let mut rnd = Mulberry32::new(seed);
        let noise = Noise::new(&mut rnd);
        let mut f = || rnd.next_u32() as f64 / 4_294_967_296.0;
        // Where the bases stand (two: they face each other, opposite corners, either diagonal, or opposite sides;
        // four: the corners or the middles of the sides), the first base's, and who starts where.
        let layouts = [
            (8, mh - 12),
            (8, 8),
            (9, (mh - 4) / 2),
            ((mw - 4) / 2, mh - 13),
        ];
        let pick = (f() * 4.0) as usize % 4;
        // (eight: on the left side, as far from its mirror image below as from its neighbour round the corner)
        let b0 = if k == 8 {
            (9, mh * 5 / 16)
        } else {
            layouts[pick]
        };
        let orbit: Vec<(i32, i32)> = (0..k).map(|g| sym.block(g, b0, 4)).collect(); // (the core is 4x4)
        let turn = (f() * k as f64) as usize % k;
        m.bases = (0..k).map(|i| orbit[(turn + i) % k]).collect();
        let centre = ((mw - 1) as f64 / 2.0, (mh - 1) as f64 / 2.0);
        let core_c = |b: (i32, i32)| (b.0 as f64 + 1.5, b.1 as f64 + 1.5);
        let c0 = core_c(b0);
        let cores: Vec<(f64, f64)> = (0..k).map(|g| sym.point(g, c0)).collect();
        let d = |a: (f64, f64), b: (f64, f64)| jsmath::hypot(a.0 - b.0, a.1 - b.1);
        // Expansions: two or three sites in the first base's share (two starts: one more per 32 tiles past 64,
        // reaching 16 tiles farther; four: past 96), each repeated for every other start.
        let more = (mw.min(mh) - [64, 96, 128][k / 4]).max(0);
        let want = 2 + (f() < 0.4) as usize + (more / 32) as usize;
        let far = 32.0 + more as f64 / 2.0;
        let mut sites: Vec<(f64, f64)> = Vec::new();
        for _ in 0..200 * k / 2 {
            if sites.len() >= want {
                break;
            }
            let p = (10.0 + f() * (mw - 20) as f64, 10.0 + f() * (mh - 20) as f64);
            // (more than two starts: the first, the natural, within the duel's 32 tiles)
            let far = if k > 2 && sites.is_empty() { 32.0 } else { far };
            let ok = (18.0..=far).contains(&d(p, c0)) // (an expansion, not part of the main base)
                && cores[1..].iter().all(|&c| d(p, c) > d(p, c0) + 6.0)
                && d(p, centre) > 7.0
                && (1..k).all(|g| d(p, sym.point(g, p)) > 12.0)
                && sites
                    .iter()
                    .all(|&q| (0..k).all(|g| d(sym.point(g, p), q) > 11.0));
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
        let mut open: Vec<(f64, f64, f64)> = cores.iter().map(|c| (c.0, c.1, 12.0)).collect();
        // An expansion's clearing: its field on the far side and room for a Core on the near side, beside the vent.
        for &p in &sites {
            for g in 0..k {
                let q = sym.point(g, p);
                open.push((q.0, q.1, 7.5));
            }
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
            for g in 0..k {
                let q = sym.point(g, ramp_out);
                open.push((q.0, q.1, 3.5));
            }
        }
        // On a pocket's wall (a ring around a main) but not on its ramp, a gap of RAMP_W tiles facing its natural.
        // Every main is checked: the share of the map drawn from the noise may hold any (the rest are its images),
        // and each main's ramp faces its own natural.
        let ring = |x: f64, y: f64, c: (f64, f64), dir: f64| -> bool {
            let r = jsmath::hypot(x - c.0, y - c.1);
            if !(POCKET_R..POCKET_R + 2.0).contains(&r) {
                return false;
            }
            let a = jsmath::atan2(y - c.1, x - c.0);
            let off = (a - dir + 3.0 * PI).rem_euclid(2.0 * PI) - PI; // angle from the ramp, in -PI..PI
            off.abs() * r > RAMP_W / 2.0
        };
        let ramps: Vec<((f64, f64), f64)> =
            (0..k).map(|g| (cores[g], sym.angle(g, ramp_dir))).collect();
        let wall = |x: f64, y: f64| pocket && ramps.iter().any(|&(c, dir)| ring(x, y, c, dir));
        // Each tile's noise, and whether it is rock whatever the threshold (the border, a pocket's wall) or open
        // whatever it is (a clearing), read where the share drawn from the noise holds it: one start's share of the
        // map is drawn, the rest are its images (the tile of its orbit that comes first, row by row).
        let tiles = (mw * mh) as usize;
        let (mut nv, mut fixed, mut clear) =
            (vec![0.0; tiles], vec![false; tiles], vec![false; tiles]);
        for y in 0..mh {
            for x in 0..mw {
                let (sx, sy) = (0..k)
                    .map(|g| sym.tile(g, (x, y)))
                    .min_by_key(|&(x, y)| m.idx(x, y))
                    .unwrap();
                let i = m.idx(x, y);
                nv[i] = noise.get(sx as f64 / scale, sy as f64 / scale);
                fixed[i] =
                    x == 0 || y == 0 || x == mw - 1 || y == mh - 1 || wall(sx as f64, sy as f64);
                clear[i] = open
                    .iter()
                    .any(|e| jsmath::hypot(sx as f64 - e.0, sy as f64 - e.1) < e.2);
            }
        }
        // Rock where the noise is above the threshold: higher means more open ground. Raised until the bases can
        // walk to each other and every field can be reached (with the fields in place: a crystal may plug a gap).
        let mut thr = match kind {
            MapKind::OpenPlains => 0.74,
            MapKind::Labyrinth => 0.5,
            _ => 0.6,
        };
        let id0 = *next_id;
        for _ in 0..16 {
            for i in 0..tiles {
                m.shade[i] = nv[i] as f32;
                m.rock[i] = if fixed[i] || (nv[i] > thr && !clear[i]) {
                    1
                } else {
                    0
                };
            }
            m.nodes.clear();
            m.occ.fill(0);
            *next_id = id0;
            m.place_fields(next_id, kind, sym, c0, centre, &sites, middle);
            let reach = m.walkable_from(b0);
            let reached = |x: i32, y: i32| m.in_map(x, y) && reach[m.idx(x, y)];
            let fields_ok = m.nodes.iter().all(|n| {
                let s = if n.ether { 2 } else { 1 };
                (-1..=s).any(|dy| (-1..=s).any(|dx| reached(n.tx + dx, n.ty + dy)))
            });
            if orbit[1..].iter().all(|b| reached(b.0, b.1)) && fields_ok {
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

    /// The resource fields of a generated map, each start's the exact tile-for-tile image of the first's: each base's
    /// own field behind it (away from the centre) with a vent to one side, the expansions (nearest the main first:
    /// the natural and every other one have a vent, all of them on an ether storm), and the centre field and vent.
    #[allow(clippy::too_many_arguments)]
    fn place_fields(
        &mut self,
        next_id: &mut Id,
        kind: MapKind,
        sym: Sym,
        c0: (f64, f64),
        centre: (f64, f64),
        sites: &[(f64, f64)],
        middle: bool,
    ) {
        let (mw, mh) = (self.w, self.h);
        let images = |tiles: &[(i32, i32)], g: usize| -> Vec<(i32, i32)> {
            tiles.iter().map(|&t| sym.tile(g, t)).collect()
        };
        let away = jsmath::atan2(c0.1 - centre.1, c0.0 - centre.0);
        let side = away + PI * 0.5;
        let v0 = (
            (jsmath::round(c0.0 + jsmath::cos(side) * 8.0) as i32 - 1).clamp(1, mw - 3),
            (jsmath::round(c0.1 + jsmath::sin(side) * 8.0) as i32 - 1).clamp(1, mh - 3),
        );
        let home = self.add_shards(next_id, c0.0, c0.1, away, 7, 6.5);
        self.add_vent(next_id, v0.0, v0.1);
        for g in 1..sym.k {
            self.add_shards_at(next_id, &images(&home, g));
            let v = sym.block(g, v0, 2);
            self.add_vent(next_id, v.0, v.1);
        }
        for (i, &p) in sites.iter().enumerate() {
            // The crystals lie on the far side of the site from the main, clear of the main's ramp.
            let out = jsmath::atan2(p.1 - c0.1, p.0 - c0.0);
            let field = self.add_shards(next_id, p.0, p.1, out, 5, 4.5);
            for g in 1..sym.k {
                self.add_shards_at(next_id, &images(&field, g));
            }
            if i % 2 == 0 || kind == MapKind::EtherStorm {
                let v = (jsmath::round(p.0) as i32 - 1, jsmath::round(p.1) as i32 - 1);
                for g in 0..sym.k {
                    let v = sym.block(g, v, 2);
                    self.add_vent(next_id, v.0, v.1);
                }
            }
        }
        if middle {
            let left = self.add_shards(next_id, centre.0 - 3.0, centre.1, PI, 3, 2.5);
            for g in 1..sym.k {
                self.add_shards_at(next_id, &images(&left, g)); // (where an image falls on the field, it is the field)
            }
            self.add_vent(next_id, mw / 2 - 1, mh / 2 - 1); // a 2x2 vent on the centre is its own image
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
        let field = self.new_field();
        let mut used = Vec::new();
        for i in 0..n {
            let a = ang + (i as f64 - (n - 1) as f64 / 2.0) * 0.32;
            let d = rad + if i % 2 == 1 { 0.9 } else { 0.0 };
            let mut tx = jsmath::round(cx + jsmath::cos(a) * d) as i32;
            let mut ty = jsmath::round(cy + jsmath::sin(a) * d) as i32;
            let mut k = 0;
            while k < 6
                && (!self.in_map(tx, ty)
                    || self.occ[self.idx(tx, ty)] != 0
                    || (self.rock[self.idx(tx, ty)] != 0 && k > 3))
            {
                tx += jsmath::sign(jsmath::cos(a)) as i32;
                ty += jsmath::sign(jsmath::sin(a)) as i32;
                k += 1;
            }
            if self.add_shard(next_id, tx, ty, field) {
                used.push((tx, ty));
            }
        }
        used
    }

    /// Shard crystals on exactly these tiles (the mirror image of another field).
    fn add_shards_at(&mut self, next_id: &mut Id, tiles: &[(i32, i32)]) {
        let field = self.new_field();
        for &(tx, ty) in tiles {
            self.add_shard(next_id, tx, ty, field);
        }
    }

    /// A fresh shard field id (one more than any so far).
    fn new_field(&self) -> u32 {
        self.nodes.iter().map(|n| n.field).max().unwrap_or(0) + 1
    }

    fn add_shard(&mut self, next_id: &mut Id, tx: i32, ty: i32, field: u32) -> bool {
        if !self.in_map(tx, ty) || self.occ[self.idx(tx, ty)] != 0 {
            return false;
        }
        let i = self.idx(tx, ty);
        self.rock[i] = 0;
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
            field,
        });
        self.occ[i] = -(id as i32);
        true
    }

    /// Tiles a walker can reach from `from` (4-neighbour, over unblocked tiles: rock and fields both block).
    fn walkable_from(&self, from: (i32, i32)) -> Vec<bool> {
        let mut seen = vec![false; self.rock.len()];
        let mut q = vec![from];
        seen[self.idx(from.0, from.1)] = true;
        while let Some((x, y)) = q.pop() {
            for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
                let (nx, ny) = (x + dx, y + dy);
                if !self.blocked(nx, ny) && !seen[self.idx(nx, ny)] {
                    seen[self.idx(nx, ny)] = true;
                    q.push((nx, ny));
                }
            }
        }
        seen
    }

    fn add_vent(&mut self, next_id: &mut Id, tx: i32, ty: i32) {
        for y in 0..2 {
            for x in 0..2 {
                let i = self.idx(tx + x, ty + y);
                self.rock[i] = 0;
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
            field: 0,
        });
        for y in 0..2 {
            for x in 0..2 {
                let i = self.idx(tx + x, ty + y);
                self.occ[i] = -(id as i32);
            }
        }
    }

    /// Flood fill over passable rock (ignores occupancy).
    pub fn connected(&self, a: (i32, i32), b: (i32, i32)) -> bool {
        let mut seen = vec![false; self.rock.len()];
        let mut q = vec![a];
        seen[self.idx(a.0, a.1)] = true;
        while let Some((x, y)) = q.pop() {
            if (x, y) == b {
                return true;
            }
            for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
                let (nx, ny) = (x + dx, y + dy);
                if self.in_map(nx, ny)
                    && self.rock[self.idx(nx, ny)] == 0
                    && !seen[self.idx(nx, ny)]
                {
                    seen[self.idx(nx, ny)] = true;
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
