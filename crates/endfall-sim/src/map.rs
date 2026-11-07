//! Terrain, resource nodes and the occupancy grid (port of src/sim/map.js).

use crate::data::{Move, TILE};
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
    /// Which shard field (a clump of crystals, laid down together) it belongs to; 0 for a vent.
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

/// Which of a map's `k` starts (in ring order) each of `n` seats takes, then the starts nobody takes: the seats spread
/// evenly round the ring (3 of 4 leave one corner free, 6 of 8 two opposite starts), the whole turned by `side % k`
/// (two seats on two starts: 1 trades them), and with fewer seats than starts the pattern turned among the seats by
/// `side / k` (which seat sits beside the free start, or between two others, is the draw's, not the seat number's).
pub fn seat_starts(k: usize, n: usize, side: u32) -> Vec<usize> {
    let (turn, r) = (side as usize % k, side as usize / k % n);
    let mut order: Vec<usize> = (0..n).map(|s| (turn + (s + r) % n * k / n) % k).collect();
    order.extend((0..k).filter(|i| !order.contains(i)).collect::<Vec<_>>());
    order
}

/// `seat_starts` for seats in teams (a team id per seat, allies in consecutive seats): with fewer seats than starts the
/// free starts go between teams, never inside one, spread as evenly as the teams allow (before a team whose first seat
/// is `s`, `s * (k - n) / n` of them, as many as the seats spread evenly would have there: three against three on
/// eight starts sits as it always did), the whole turned by `side % k`. Each seat its own team, or a start for every
/// seat: `seat_starts`. Each team must be one run of consecutive seats (the menus' and the relay's are); a team that
/// wraps round the seat order ([0, 1, 1, 1, 0]) or is spread out is not kept together.
pub fn team_starts(k: usize, teams: &[u8], side: u32) -> Vec<usize> {
    let n = teams.len();
    let teamed = (0..n).any(|a| (a + 1..n).any(|b| teams[a] == teams[b])); // (two seats sharing a team)
    if n >= k || !teamed {
        return seat_starts(k, n, side);
    }
    let (turn, free) = (side as usize % k, k - n);
    let mut first = 0; // (the first seat of this run of allies)
    let mut order: Vec<usize> = (0..n)
        .map(|s| {
            if s > 0 && teams[s] != teams[s - 1] {
                first = s;
            }
            (turn + s + first * free / n) % k
        })
        .collect();
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

/// What a tile is at a water level (`Map::ground`): dry land, shallows (Walk units wade), or deep water (only Amph
/// units go there, and nothing fires from it).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Ground {
    Land,
    Shallow,
    Deep,
}

/// Height of every tile of the map kinds that have no water: land, above any water level the game uses.
pub const DRY: i8 = 1;

/// What a unit may stand on: its movement class and the water level (World::water). Rock, buildings and the map's
/// edge block every walker; deep water blocks Walk units too (`Map::passable`).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Foot {
    pub class: Move,
    pub water: i8,
}

pub struct Map {
    /// Width and height in tiles; every grid below is `w * h`, row by row.
    pub w: i32,
    pub h: i32,
    /// 1 = impassable rock.
    pub rock: Vec<u8>,
    /// Each tile's height, in tile units: against the water level it is land, shallows or deep water (`ground`).
    /// From the map's kind and seed like `rock`; `DRY` everywhere on the kinds without water. Not hashed.
    pub height: Vec<i8>,
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
    /// The middle of each expansion's clearing (tiles; every start's images too, the natural's first): its field on
    /// the side away from its main, room for its Core on the near side. Empty on a test arena.
    pub expansions: Vec<(f64, f64)>,
    /// The Shore map's reef basins, one per start in the order of `bases` (top-left tile of a 4x4 headquarters in the
    /// middle of each): where a Vael seat starts instead of its cove. Empty on every other kind.
    pub basins: Vec<(i32, i32)>,
}

/// The character of a map, chosen in the menu. The order is the client's index: append only.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum MapKind {
    /// Balanced fields and winding passes.
    #[default]
    Standard,
    /// Ten times the shards in every field.
    DeepFields,
    /// Rich vents, each holding three times the ether, and one in the centre where it keeps 10 tiles off every field's
    /// salt (its expansions are chosen so it does; no sampled seed lacks it), where the other kinds may have a field.
    EtherStorm,
    /// Little rock: open ground, fast attacks.
    OpenPlains,
    /// Much rock, narrow passes.
    Labyrinth,
    /// Fields picked nearly clean: 40% of the shards, 60% of the ether.
    Barren,
    /// A shore and a reef (two starts): each start a cove on land and a reef basin in the shallows, a deep band down
    /// the middle between the reefs. A Human seat starts in its cove, a Vael seat in its basin (`basins`).
    Shore,
}

impl MapKind {
    pub const ALL: [MapKind; 7] = [
        MapKind::Standard,
        MapKind::DeepFields,
        MapKind::EtherStorm,
        MapKind::OpenPlains,
        MapKind::Labyrinth,
        MapKind::Barren,
        MapKind::Shore,
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
/// The Shore map: a reef basin's middle lies this many tiles from the centre (20, not 14, since the first Shore report:
/// basins 28 apart and 40 from a cove made the first wave decide every game); its reef ring's inner radius (10: room
/// for a main's field); the deep band's half-width round the axis between the two basins, and the shallows
/// beyond it; the heights of shallows and of deep water (at the water level 0: `Map::ground`).
const SHORE_BASIN: f64 = 20.0;
/// How far (degrees) a reef basin is turned from straight south (or north) of the centre, away from its own cove.
const SHORE_TURN: f64 = 20.0;
/// The Shore map's rock threshold (noise above it is rock; higher is more open), raised until a walker connects.
const SHORE_ROCK: f64 = 0.74;
const SHORE_REEF: f64 = 10.0;
const SHORE_DEEP: f64 = 6.0;
const SHORE_SHALLOWS: f64 = 4.0;
const SHORE_SHALLOW_H: i8 = 0;

/// Where a Shore reef basin's main field lies: `turn` radians from the direction of its channel (the basin's middle the
/// pivot), `r` tiles out (6.5: a main's outcrop by the Core, `MAIN_CLUMP_R` from its middle; farther, the same outcrop
/// carried out that much further in the same direction, its shape unchanged). The menus always play `BACK`; the others
/// are the balance lab's exposed-income variants (`World::set_shore_field`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ShoreField {
    pub turn: f64,
    pub r: f64,
}

impl ShoreField {
    /// To the Core's flank, square to the channel on the side away from the sea gate (every game's; the name is from
    /// when it lay behind the Core).
    pub const BACK: ShoreField = ShoreField {
        turn: PI / 2.0,
        r: 6.5,
    };
    /// On the channel's side, facing the Humans' cove, 40 degrees off the channel (it reaches across the channel's
    /// line, inside the reef; the walkers' way in stays as long: a gameplay test measures it).
    pub const CHANNEL: ShoreField = ShoreField {
        turn: 40.0 * PI / 180.0,
        r: 6.5,
    };
    /// `CHANNEL`'s field carried 7 tiles further out, past the reef ring. Not distance alone: in a few seeds the
    /// generator's rock settles differently.
    pub const CHANNEL_FAR: ShoreField = ShoreField {
        turn: 40.0 * PI / 180.0,
        r: 13.5,
    };
}

/// How far a main's field lies from its Core's middle, as `ShoreField::r` counts it.
const MAIN_FIELD_R: f64 = 6.5;

impl Default for ShoreField {
    fn default() -> Self {
        ShoreField::BACK
    }
}
const SHORE_DEEP_H: i8 = -3;

/// The pocket's one ramp, in tiles across.
const RAMP_W: f64 = 4.5;
/// Vents (mine shafts, 2x2) lie at least this many tiles apart (top-left to top-left, either way): two tiles of ground
/// between them.
const VENT_GAP: i32 = 4;

/// The open mine shafts (vents: no base has one of its own; an extractor on one is income out in the open): two per
/// start, the first start's and their images. The first lies `SHAFT_NEAR` tiles from its main's Core (centre to centre),
/// towards the map's middle, outside the pocket (ideally `SHAFT_NEAR_AT`); the second `SHAFT_FAR` out (ideally
/// `SHAFT_FAR_AT`, `SHAFT_FAR_TURN` degrees round from the middle's direction: contested ground, between neighbours),
/// nearer its own start than any other by `SHAFT_OWN`. Each at least `SHAFT_CLEAR` tiles from every main's Core and
/// every expansion's site, `SHAFT_OFF_LINE` off the line from a main to its natural and off its ramp's, and
/// `SHAFT_CENTRE` from the middle where a field or vent stands there, and `SHAFT_SALT` from every salt crystal of every
/// field (a main's, an expansion's, the centre's: no field has a shaft by it).
const SHAFT_NEAR: (f64, f64) = (16.0, 20.0);
const SHAFT_NEAR_AT: f64 = 18.0;
const SHAFT_FAR: (f64, f64) = (24.0, 36.0);
const SHAFT_FAR_AT: f64 = 27.0;
const SHAFT_FAR_TURN: f64 = 35.0;
const SHAFT_OWN: f64 = 2.0;
const SHAFT_CLEAR: f64 = 10.5;
const SHAFT_OFF_LINE: f64 = 4.5;
const SHAFT_CENTRE: f64 = 8.0;
const SHAFT_SALT: f64 = 10.0;

/// A salt outcrop: crystals in a rounded, uneven clump (not an arc, not in rows), as tile offsets in a box (`X` a
/// crystal), one picked per map from its seed and turned by one of the grid's eight symmetries. The crystals stand in
/// little groups (side by side, never touching only at a corner, where a worker would squeeze between them) with a
/// tile of ground or more between groups, so every crystal has free ground beside it, reached from outside. A main's
/// has seven (`CLUMP_7`), an expansion's five (`CLUMP_5`).
const CLUMP_7: [[&str; 5]; 4] = [
    [".XX..", ".X...", "...XX", "X....", "X...."],
    ["..X..", ".XX..", "....X", "X...X", "X...."],
    [".X...", ".X.XX", ".....", "XX...", "...X."],
    ["..XX.", "X....", "X..X.", "...X.", ".X..."],
];
const CLUMP_5: [[&str; 4]; 3] = [
    [".XX.", "....", "X..X", "X..."],
    ["X...", "X.XX", "....", ".X.."],
    ["..X.", "..X.", "X...", "X..X"],
];
/// How far (tiles) a main's outcrop lies from its Core's middle (the clump's middle), to one flank of the Core; an
/// expansion's from its site's middle, on the far side from its main.
const MAIN_CLUMP_R: f64 = 6.2;
const EXP_CLUMP_R: f64 = 5.0;
/// An expansion's crystals keep within this many tiles of its site's middle where they can (clear of a Shore reef).
const EXP_REACH: f64 = 6.4;
/// A main's crystals lie at least this far (tiles, in a straight line) out from its Core's edge, tile middle to tile
/// middle: two tiles of ground between, and none at a corner of the Core.
const MAIN_KEEP: f64 = 3.0;

/// The distance from point `p` to the segment from `a` to `b`.
fn seg_dist(p: (f64, f64), a: (f64, f64), b: (f64, f64)) -> f64 {
    let (vx, vy) = (b.0 - a.0, b.1 - a.1);
    let l2 = vx * vx + vy * vy;
    let t = if l2 > 0.0 {
        (((p.0 - a.0) * vx + (p.1 - a.1) * vy) / l2).clamp(0.0, 1.0)
    } else {
        0.0
    };
    jsmath::hypot(p.0 - (a.0 + vx * t), p.1 - (a.1 + vy * t))
}

/// Where the open shafts may go, for the first start (its images follow by `Sym`): the ground's layout, before rock.
struct ShaftRules<'a> {
    sym: Sym,
    w: i32,
    h: i32,
    /// The first start's Core (top-left tile): a walker from there reaches every shaft.
    b0: (i32, i32),
    /// Every main's Core middle (the first start's first): a shaft lies nearer its own than any other.
    cores: Vec<(f64, f64)>,
    /// Every main's Core middle and, on the Shore, every reef basin's middle: a shaft keeps `SHAFT_NEAR`'s least from each.
    keep_off: Vec<(f64, f64)>,
    /// Every expansion's site, every start's.
    sites: Vec<(f64, f64)>,
    /// Lines a shaft keeps off: each main to its natural, and out through its ramp.
    lines: Vec<((f64, f64), (f64, f64))>,
    centre: (f64, f64),
    centre_busy: bool,
    /// Where the fields' crystals will lie (tile middles), every start's: what the ideal spots keep `SHAFT_SALT` from
    /// (`Map::salt_of`; the placement itself measures the crystals laid down).
    salt: Vec<(f64, f64)>,
    /// Whether a tile is land a Walk builder may build on (always, but on the Shore).
    land: &'a dyn Fn(i32, i32) -> bool,
    /// The numbers it holds a shaft to: `Limits::STRICT` for every map so far; the looser ones only where a map's
    /// shafts found no room under them (`Map::mend_shafts`).
    limits: Limits,
    /// Whether a shaft that finds no room under `Limits::STRICT` takes `Limits::ROOMY`'s wider rings: only where the
    /// layout leaves the strict rings no room even on open ground (`Map::shafts_fit`).
    roomy: bool,
}

/// What a shaft must keep to (`ShaftRules::allows`): its distance from its own Core, the first's and the second's (the
/// second at least `far_past` beyond the first), its margin nearer its own start than any other, its distance from the
/// other Cores (and basins), the expansions' sites, the main-to-natural and ramp lines and a busy centre, from its own
/// images, from every crystal, and the gap to other vents (`vent_fits`).
#[derive(Clone, Copy, PartialEq)]
struct Limits {
    near: (f64, f64),
    far: (f64, f64),
    far_past: f64,
    own: f64,
    keep: f64,
    clear: f64,
    off_line: f64,
    centre: f64,
    apart: f64,
    salt: f64,
    gap: i32,
}

impl Limits {
    /// Every map's (the goldens pin the maps they make).
    const STRICT: Limits = Limits {
        near: SHAFT_NEAR,
        far: SHAFT_FAR,
        far_past: 5.0,
        own: SHAFT_OWN,
        keep: SHAFT_NEAR.0,
        clear: SHAFT_CLEAR,
        off_line: SHAFT_OFF_LINE,
        centre: SHAFT_CENTRE,
        apart: 6.0,
        salt: SHAFT_SALT,
        gap: VENT_GAP,
    };
    /// Where a shaft finds no room under those (a tight layout: the salt of the Shore's basins and expansions round its
    /// rings): `STRICT` with wider rings round its Core, everything else kept.
    const ROOMY: Limits = Limits {
        near: (14.0, 22.0),
        far: (21.0, 40.0),
        far_past: 4.0,
        ..Limits::STRICT
    };
    /// Where those found no room: wider rings, less room round sites and lines.
    const RELAXED: Limits = Limits {
        near: (13.0, 24.0),
        far: (20.0, 42.0),
        far_past: 4.0,
        own: 0.0,
        keep: 12.0,
        clear: 8.0,
        off_line: 2.5,
        centre: 5.0,
        apart: 5.0,
        salt: SHAFT_SALT,
        gap: VENT_GAP,
    };
    /// The last try: anywhere a walker reaches on its own side of the map, clear of the Cores.
    const LAST: Limits = Limits {
        near: (8.0, 32.0),
        far: (10.0, 48.0),
        far_past: 3.0,
        own: 0.0,
        keep: 8.0,
        clear: 0.0,
        off_line: 0.0,
        centre: 3.0,
        apart: 4.0,
        salt: 8.0,
        gap: VENT_GAP - 1,
    };
}

impl ShaftRules<'_> {
    /// Whether a shaft centred at `q` (tile units: its top-left tile plus a half) is allowed, the first (`far` false:
    /// `SHAFT_NEAR` from the first Core) or the second (`far`: `SHAFT_FAR`, and past the first by 5 at least), clear of
    /// the crystals at `salt` (tile middles), its images too.
    fn allows(
        &self,
        l: Limits,
        q: (f64, f64),
        far: bool,
        near_r: f64,
        salt: &[(f64, f64)],
    ) -> bool {
        let d = |a: (f64, f64), b: (f64, f64)| jsmath::hypot(a.0 - b.0, a.1 - b.1);
        let c0 = self.cores[0];
        let r = d(q, c0);
        let (lo, hi) = if far {
            (l.far.0.max(near_r + l.far_past), l.far.1)
        } else {
            l.near
        };
        let v = (
            jsmath::round(q.0 - 0.5) as i32,
            jsmath::round(q.1 - 0.5) as i32,
        );
        (lo..=hi).contains(&r)
            && v.0 >= 2
            && v.1 >= 2
            && v.0 <= self.w - 4
            && v.1 <= self.h - 4
            && self.cores[1..].iter().all(|&c| d(q, c) > r + l.own)
            && self.keep_off.iter().all(|&c| d(q, c) >= l.keep)
            && self.sites.iter().all(|&e| d(q, e) >= l.clear)
            && self
                .lines
                .iter()
                .all(|&(a, b)| seg_dist(q, a, b) >= l.off_line)
            && (!self.centre_busy || d(q, self.centre) >= l.centre)
            && (1..self.sym.k).all(|g| d(q, self.sym.point(g, q)) >= l.apart)
            && (0..2).all(|dy| (0..2).all(|dx| (self.land)(v.0 + dx, v.1 + dy)))
            && (0..self.sym.k).all(|g| {
                let q = self.sym.point(g, q);
                salt.iter().all(|&s| d(q, s) >= l.salt)
            })
    }

    /// The ideal spots of the first start's two shafts on open ground (the generator clears rock round them), each the
    /// best allowed point of a sweep round the middle's direction; None where nothing is allowed (the placement then
    /// searches round a point straight towards the middle).
    fn ideals(&self) -> [(f64, f64); 2] {
        let c0 = self.cores[0];
        let mid = jsmath::atan2(self.centre.1 - c0.1, self.centre.0 - c0.0);
        let at = |a: f64, r: f64| (c0.0 + jsmath::cos(a) * r, c0.1 + jsmath::sin(a) * r);
        // (scores: the first straight towards the middle at SHAFT_NEAR_AT; the second SHAFT_FAR_TURN round at
        // SHAFT_FAR_AT; ties to the side away from the natural's line)
        let best = |far: bool, near_r: f64| {
            let mut best: Option<(f64, (f64, f64))> = None;
            let (lo, hi) = if far { SHAFT_FAR } else { SHAFT_NEAR };
            for i in 0..=36 {
                let off = -90.0 + 5.0 * i as f64;
                let mut r = lo;
                while r <= hi {
                    let q = at(mid + off * PI / 180.0, r);
                    let score = if far {
                        (off.abs() - SHAFT_FAR_TURN).abs() / 10.0 + (r - SHAFT_FAR_AT).abs() / 2.0
                    } else {
                        off.abs() / 10.0 + (r - SHAFT_NEAR_AT).abs()
                    } - 0.001 * seg_dist(q, self.lines[0].0, self.lines[0].1);
                    if self.allows(self.limits, q, far, near_r, &self.salt)
                        && best.is_none_or(|(s, _)| score < s)
                    {
                        best = Some((score, q));
                    }
                    r += 0.5;
                }
            }
            best.map(|(_, q)| q)
        };
        let a = best(false, 0.0).unwrap_or(at(mid, SHAFT_NEAR_AT));
        let r = jsmath::hypot(a.0 - c0.0, a.1 - c0.1);
        let b = best(true, r).unwrap_or(at(mid + SHAFT_FAR_TURN * PI / 180.0, SHAFT_FAR_AT));
        [a, b]
    }
}

impl Map {
    /// Open ground, no fields; the two starts near opposite corners (test arenas: generated maps choose their own).
    pub fn empty(size: MapSize) -> Self {
        let n = (size.w * size.h) as usize;
        Map {
            w: size.w,
            h: size.h,
            rock: vec![0; n],
            height: vec![DRY; n],
            occ: vec![0; n],
            shade: vec![0.0; n],
            nodes: Vec::new(),
            bases: vec![(9, size.h - 10), (size.w - 10, 9)],
            expansions: Vec::new(),
            basins: Vec::new(),
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

    /// The tile (x, y) at water level `water`: land above it, shallows within two of it, deep water below. (Rock is
    /// still rock, whatever its height; off the map counts as land.)
    pub fn ground(&self, x: i32, y: i32, water: i8) -> Ground {
        if !self.in_map(x, y) {
            return Ground::Land;
        }
        let h = self.height[self.idx(x, y)];
        if h > water {
            Ground::Land
        } else if h > water - 2 {
            Ground::Shallow
        } else {
            Ground::Deep
        }
    }

    /// Whether a unit with `foot` may stand on (x, y): never off the map, on rock or a building, and a Walk unit never
    /// in deep water. (Flyers only need the map.)
    pub fn passable(&self, foot: Foot, x: i32, y: i32) -> bool {
        match foot.class {
            Move::Fly => self.in_map(x, y),
            Move::Amph => !self.blocked(x, y),
            Move::Walk => !self.blocked(x, y) && self.ground(x, y, foot.water) != Ground::Deep,
        }
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
        Map::generate_with(seed, kind, size, starts, next_id, ShoreField::BACK)
    }

    /// `generate`, with a Shore basin's main field at `field` (the balance lab's variants; every game's is `BACK`).
    pub fn generate_with(
        seed: u32,
        kind: MapKind,
        size: MapSize,
        starts: usize,
        next_id: &mut Id,
        field: ShoreField,
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
        if kind == MapKind::Shore && starts == 2 {
            return Map::generate_shore(seed, size, next_id, field);
        }
        // (a Shore with more than two starts is not made yet: such a game gets the Standard ground, never a panic)
        let kind = if kind == MapKind::Shore {
            MapKind::Standard
        } else {
            kind
        };
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
            // (an ether storm's: `SHAFT_CLEAR` from the centre's vent, and its salt, out beyond it from the main, clear
            // of the vent by `SHAFT_SALT` and room for the clump)
            let salt_mid = {
                let r = d(p, c0).max(1e-9);
                (
                    p.0 + (p.0 - c0.0) / r * EXP_CLUMP_R,
                    p.1 + (p.1 - c0.1) / r * EXP_CLUMP_R,
                )
            };
            let ok = (18.0..=far).contains(&d(p, c0)) // (an expansion, not part of the main base)
                && cores[1..].iter().all(|&c| d(p, c) > d(p, c0) + 6.0)
                && d(p, centre) > 7.0
                && (kind != MapKind::EtherStorm
                    || (d(p, centre) >= SHAFT_CLEAR && d(salt_mid, centre) >= SHAFT_SALT + 4.0))
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
        // Each main's salt to one flank of its Core: the side farther from its ramp (the front stays free to build).
        let away = jsmath::atan2(c0.1 - centre.1, c0.0 - centre.0);
        let from_ramp = |a: f64| ((a - ramp_dir + 3.0 * PI).rem_euclid(2.0 * PI) - PI).abs();
        let flank = if from_ramp(away - PI / 2.0) > from_ramp(away + PI / 2.0) + 1e-9 {
            away - PI / 2.0
        } else {
            away + PI / 2.0
        };
        let shape = Mulberry32::new(seed ^ 0x5a17_c1a7).next_u32();
        // The centre: an ether storm's holds its vent and no field (`SHAFT_SALT` from every crystal: where its
        // expansions' salt leaves it no room, which the choice of sites makes rare, it holds nothing); the other kinds'
        // a field (`middle`) and no vent.
        let centre_field = middle && kind != MapKind::EtherStorm;
        // The open shafts: where they may go (and where every crystal will lie, for their ideal spots).
        let ramp_of = |g: usize| {
            let (c, a) = (cores[g], sym.angle(g, ramp_dir));
            (
                c,
                (c.0 + jsmath::cos(a) * 20.0, c.1 + jsmath::sin(a) * 20.0),
            )
        };
        let land = |_: i32, _: i32| true;
        let plan = |sites: &[(f64, f64)]| {
            let salt_with = |vent: bool| {
                Map::salt_of(size, |m, id| {
                    m.place_salt(id, sym, c0, flank, shape, sites, (centre_field, vent))
                })
            };
            let mut salt = salt_with(kind == MapKind::EtherStorm);
            let centre_vent =
                kind == MapKind::EtherStorm && salt.iter().all(|&s| d(s, centre) >= SHAFT_SALT);
            if kind == MapKind::EtherStorm && !centre_vent {
                salt = salt_with(false);
            }
            let rules = ShaftRules {
                sym,
                w: mw,
                h: mh,
                b0,
                cores: cores.clone(),
                keep_off: cores.clone(),
                sites: sites
                    .iter()
                    .flat_map(|&p| (0..k).map(move |g| sym.point(g, p)))
                    .collect(),
                lines: (0..k)
                    .flat_map(|g| [(cores[g], sym.point(g, natural)), ramp_of(g)])
                    .collect(),
                centre,
                centre_busy: centre_field || centre_vent,
                salt,
                land: &land,
                limits: Limits::STRICT,
                roomy: false,
            };
            (centre_vent, rules)
        };
        // A layout whose shafts find no room even on open ground (rock only ever takes room away) under the strict
        // rules lets a shaft take `Limits::ROOMY`'s wider rings; where they find none either (the salt of three
        // expansions round them), it loses its farthest expansion until they do, as the Shore's does.
        let (centre_vent, mut rules) = loop {
            let (centre_vent, mut rules) = plan(&sites);
            let centre = (centre_field, centre_vent);
            let fit = |rules: &ShaftRules| {
                Map::shafts_fit(size, 2 * k + centre_vent as usize, |m, id| {
                    m.place_fields(id, rules, rules.ideals(), flank, shape, &sites, centre)
                })
            };
            if fit(&rules) {
                break (centre_vent, rules);
            }
            rules.roomy = true;
            if fit(&rules) || sites.is_empty() {
                break (centre_vent, rules);
            }
            sites.pop();
        };
        let mut open: Vec<(f64, f64, f64)> = cores.iter().map(|c| (c.0, c.1, 12.0)).collect();
        // An expansion's clearing: its field on the far side and room for a Core on the near side.
        for &p in &sites {
            for g in 0..k {
                let q = sym.point(g, p);
                open.push((q.0, q.1, 7.5));
            }
        }
        if centre_vent {
            open.push((centre.0, centre.1, 3.5));
        } else if centre_field {
            open.push((centre.0, centre.1, 6.5));
        }
        let ideals = rules.ideals();
        for q in ideals {
            for g in 0..k {
                let q = sym.point(g, q);
                open.push((q.0, q.1, 3.0));
            }
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
            let centre = (centre_field, centre_vent);
            m.place_fields(next_id, &rules, ideals, flank, shape, &sites, centre);
            let reach = m.walkable_from(b0);
            let reached = |x: i32, y: i32| m.in_map(x, y) && reach[m.idx(x, y)];
            let fields_ok = m.nodes.iter().all(|n| {
                let s = if n.ether { 2 } else { 1 };
                (-1..=s).any(|dy| (-1..=s).any(|dx| reached(n.tx + dx, n.ty + dy)))
            });
            // (and both shafts found room: more open ground next time if not)
            let shafts_ok =
                m.nodes.iter().filter(|n| n.ether).count() == 2 * k + centre_vent as usize;
            if orbit[1..].iter().all(|b| reached(b.0, b.1)) && fields_ok && shafts_ok {
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
        // Two open shafts a start, and the centre's vent: where no threshold gave them room, laid again under looser
        // rules (a start never goes without; no map so far needs it, and a change to the generator that makes one
        // need it fails its tests loudly here).
        let want = 2 * k + centre_vent as usize;
        let strict = m.nodes.iter().filter(|n| n.ether).count() == want;
        m.mend_shafts(next_id, &mut rules, ideals, want);
        debug_assert!(
            strict,
            "seed {seed} {kind:?} {mw}x{mh}: every start has its two open shafts without mending"
        );
        debug_assert_eq!(
            m.nodes.iter().filter(|n| n.ether).count(),
            want,
            "seed {seed} {kind:?} {mw}x{mh}: every start has its two open shafts"
        );
        m.expansions = sites
            .iter()
            .flat_map(|&p| (0..k).map(move |g| sym.point(g, p)))
            .collect();
        for n in &mut m.nodes {
            n.amount = jsmath::round(n.amount as f64 * if n.ether { ether } else { shard }) as i32;
        }
        m
    }

    /// The Shore map (two starts, point-symmetric about the centre): each start's share holds a **cove** on land (a
    /// pocket as on the other kinds, in a corner, its ramp facing the sea) and a **reef basin** in the shallows (a ring
    /// of reef rock, `SHORE_BASIN` tiles from the centre, south or north, with a channel facing the cove across the sea
    /// and a sea gate onto the deep band: the Vael's road to the other share, which walkers cannot take). A deep band
    /// runs down the middle between the two reefs, shallows `SHORE_SHALLOWS` wide all round it; the land east and west
    /// of it meets beyond each reef. Cove and basin each hold a field (either can be a start: a Human
    /// seat takes its cove, a Vael seat its basin); the expansions and each start's two open shafts lie on land. Rock is
    /// raised until a walker (Walk) gets from the first cove to the other cove, to both basins and to every field.
    fn generate_shore(seed: u32, size: MapSize, next_id: &mut Id, field: ShoreField) -> Self {
        let (mw, mh) = (size.w, size.h);
        let sym = Sym { k: 2, w: mw, h: mh };
        let mut m = Map::empty(size);
        let mut rnd = Mulberry32::new(seed);
        let noise = Noise::new(&mut rnd);
        let mut f = || rnd.next_u32() as f64 / 4_294_967_296.0;
        let centre = ((mw - 1) as f64 / 2.0, (mh - 1) as f64 / 2.0);
        let d = |a: (f64, f64), b: (f64, f64)| jsmath::hypot(a.0 - b.0, a.1 - b.1);
        // The first cove in the south-west corner (its Core's top-left tile), its basin south of the centre, turned
        // `SHORE_TURN` away from its cove (so a passage runs between the reef and the cove's wall).
        let b0 = (8, mh - 12);
        let c0 = (b0.0 as f64 + 1.5, b0.1 as f64 + 1.5);
        let south = PI / 2.0 - SHORE_TURN * PI / 180.0;
        let p0 = (
            centre.0 + jsmath::cos(south) * SHORE_BASIN,
            centre.1 + jsmath::sin(south) * SHORE_BASIN,
        );
        let basin0 = (
            jsmath::round(p0.0 - 1.5) as i32,
            jsmath::round(p0.1 - 1.5) as i32,
        );
        let turn = (f() * 2.0) as usize % 2;
        let coves = [b0, sym.block(1, b0, 4)];
        let basins = [basin0, sym.block(1, basin0, 4)];
        m.bases = (0..2).map(|i| coves[(turn + i) % 2]).collect();
        m.basins = (0..2).map(|i| basins[(turn + i) % 2]).collect();
        let cores = [c0, sym.point(1, c0)];
        let pools = [p0, sym.point(1, p0)];
        // The sea's axis: the segment between the two reefs' middles; a tile's distance to it says deep or shallow.
        let axis = |x: f64, y: f64| {
            let (ax, ay, bx, by) = (pools[0].0, pools[0].1, pools[1].0, pools[1].1);
            let (vx, vy) = (bx - ax, by - ay);
            let t = (((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)).clamp(0.0, 1.0);
            jsmath::hypot(x - (ax + vx * t), y - (ay + vy * t))
        };
        let pool = |x: f64, y: f64| {
            pools
                .iter()
                .map(|&p| d((x, y), p))
                .fold(f64::INFINITY, f64::min)
        };
        let sea = |x: f64, y: f64| {
            axis(x, y) < SHORE_DEEP + SHORE_SHALLOWS || pool(x, y) < SHORE_REEF + 1.5
        };
        // Expansions: two or three sites on land in the first share (the same rules as the other kinds, and clear of
        // the sea and the basins), each repeated for the other start.
        let want = 2 + (f() < 0.4) as usize;
        let mut sites: Vec<(f64, f64)> = Vec::new();
        for _ in 0..800 {
            if sites.len() >= want {
                break;
            }
            // (nearer the edges than on the other kinds: the land is the strip between the coves and the sea)
            let p = (5.0 + f() * (mw - 10) as f64, 5.0 + f() * (mh - 10) as f64);
            let ok = (16.0..=38.0).contains(&d(p, c0))
                && d(p, cores[1]) > d(p, c0) + 6.0
                && d(p, centre) > 7.0
                && d(p, sym.point(1, p)) > 12.0
                && axis(p.0, p.1) > SHORE_DEEP + SHORE_SHALLOWS + 3.0
                // (clear of the reefs by more than an expansion's clearing: 7.5 tiles round its middle)
                && pool(p.0, p.1) > SHORE_REEF + 1.5 + 7.5
                && sites
                    .iter()
                    .all(|&q| (0..2).all(|g| d(sym.point(g, p), q) > 11.0));
            if ok {
                sites.push(p);
            }
        }
        sites.sort_by(|p, q| d(*p, c0).partial_cmp(&d(*q, c0)).unwrap());
        let scale = 6.0 + f() * 4.5;
        // The walls: each cove's ring with its ramp towards the centre (the sea), each reef's ring with its channel
        // towards the cove it faces and its sea gate.
        let gap_ring = |x: f64, y: f64, c: (f64, f64), r0: f64, dir: f64| -> bool {
            let r = jsmath::hypot(x - c.0, y - c.1);
            if !(r0..r0 + 2.0).contains(&r) {
                return false;
            }
            let a = jsmath::atan2(y - c.1, x - c.0);
            let off = (a - dir + 3.0 * PI).rem_euclid(2.0 * PI) - PI;
            off.abs() * r > RAMP_W / 2.0
        };
        let ramp: Vec<f64> = (0..2)
            .map(|g| jsmath::atan2(centre.1 - cores[g].1, centre.0 - cores[g].0))
            .collect();
        // Each reef's land channel faces the cove across the sea (the one it faces: a Human seat there walks in by it).
        let channel: Vec<f64> = (0..2)
            .map(|g| jsmath::atan2(cores[1 - g].1 - pools[g].1, cores[1 - g].0 - pools[g].0))
            .collect();
        // Each reef's sea gate, towards the centre: it opens onto the deep band, so only amphibians pass it.
        let gate: Vec<f64> = (0..2)
            .map(|g| jsmath::atan2(centre.1 - pools[g].1, centre.0 - pools[g].0))
            .collect();
        let wall = |x: f64, y: f64| {
            (0..2).any(|g| gap_ring(x, y, cores[g], POCKET_R, ramp[g]))
                || (0..2).any(|g| {
                    let r = jsmath::hypot(x - pools[g].0, y - pools[g].1);
                    // (a reef ring 1.5 thick, with its land channel and its sea gate)
                    r < SHORE_REEF + 1.5
                        && gap_ring(x, y, pools[g], SHORE_REEF, channel[g])
                        && gap_ring(x, y, pools[g], SHORE_REEF, gate[g])
                })
        };
        // Clearings: each Core's room, each site's, outside each ramp and each channel, and the sea (no rock in water
        // but the reefs).
        let mut open: Vec<(f64, f64, f64)> = cores.iter().map(|c| (c.0, c.1, POCKET_R)).collect();
        for &p in &sites {
            for g in 0..2 {
                let q = sym.point(g, p);
                open.push((q.0, q.1, 7.5));
            }
        }
        for g in 0..2 {
            let r = POCKET_R + 3.0;
            open.push((
                cores[g].0 + jsmath::cos(ramp[g]) * r,
                cores[g].1 + jsmath::sin(ramp[g]) * r,
                3.5,
            ));
            let r = SHORE_REEF + 3.5;
            open.push((
                pools[g].0 + jsmath::cos(channel[g]) * r,
                pools[g].1 + jsmath::sin(channel[g]) * r,
                3.5,
            ));
        }
        // Heights: a reef's basin and the band's rim shallows, the band's middle deep (outside the reefs), the rest
        // land (read where the first share holds the tile: its image is the same).
        let height = |x: i32, y: i32| {
            let (sx, sy) = [(x, y), sym.tile(1, (x, y))]
                .into_iter()
                .min_by_key(|&(x, y)| y * mw + x)
                .unwrap();
            let (fx, fy) = (sx as f64, sy as f64);
            if pool(fx, fy) < SHORE_REEF {
                SHORE_SHALLOW_H
            } else if axis(fx, fy) < SHORE_DEEP && pool(fx, fy) >= SHORE_REEF + 1.5 {
                SHORE_DEEP_H
            } else if axis(fx, fy) < SHORE_DEEP + SHORE_SHALLOWS {
                SHORE_SHALLOW_H
            } else {
                DRY
            }
        };
        // The cove's salt to one flank of its Core (its ramp faces the centre: either flank is as far from it).
        let away = jsmath::atan2(c0.1 - centre.1, c0.0 - centre.0);
        let flank = away + PI / 2.0;
        let shape = Mulberry32::new(seed ^ 0x5a17_c1a7).next_u32();
        // The open shafts: on land (a walker builds there at high water), off each cove's ramp and its natural's line.
        let land = |x: i32, y: i32| x >= 0 && y >= 0 && x < mw && y < mh && height(x, y) == DRY;
        let shaft_rules = |sites: &[(f64, f64)]| {
            let natural = sites.first().copied().unwrap_or(centre);
            ShaftRules {
                sym,
                w: mw,
                h: mh,
                b0,
                cores: cores.to_vec(),
                keep_off: cores.iter().chain(&pools).copied().collect(),
                sites: sites
                    .iter()
                    .flat_map(|&p| (0..2).map(move |g| sym.point(g, p)))
                    .collect(),
                lines: (0..2)
                    .flat_map(|g| {
                        let c = cores[g];
                        let out = (
                            c.0 + jsmath::cos(ramp[g]) * 20.0,
                            c.1 + jsmath::sin(ramp[g]) * 20.0,
                        );
                        [(c, sym.point(g, natural)), (c, out)]
                    })
                    .collect(),
                centre,
                centre_busy: false,
                salt: Map::salt_of(size, |m, id| {
                    m.place_basin_fields(id, sym, p0, channel[0], field, shape);
                    m.place_salt(id, sym, c0, flank, shape, sites, (false, false));
                }),
                land: &land,
                limits: Limits::STRICT,
                roomy: false,
            }
        };
        let ideals = shaft_rules(&sites).ideals();
        for q in ideals {
            for g in 0..2 {
                let q = sym.point(g, q);
                open.push((q.0, q.1, 3.0));
            }
        }
        let tiles = (mw * mh) as usize;
        let (mut nv, mut fixed, mut clear) =
            (vec![0.0; tiles], vec![false; tiles], vec![false; tiles]);
        for y in 0..mh {
            for x in 0..mw {
                let (sx, sy) = [(x, y), sym.tile(1, (x, y))]
                    .into_iter()
                    .min_by_key(|&(x, y)| m.idx(x, y))
                    .unwrap();
                let (fx, fy) = (sx as f64, sy as f64);
                let i = m.idx(x, y);
                nv[i] = noise.get(fx / scale, fy / scale);
                fixed[i] = x == 0 || y == 0 || x == mw - 1 || y == mh - 1 || wall(fx, fy);
                clear[i] =
                    sea(fx, fy) || open.iter().any(|e| jsmath::hypot(fx - e.0, fy - e.1) < e.2);
                m.height[i] = height(x, y);
            }
        }
        let walk = Foot {
            class: Move::Walk,
            water: 0,
        };
        // (little rock on land, as on open plains: the sea is this map's character, and walkers need its passages)
        let id0 = *next_id;
        // Rock raised until it connects; a layout no threshold makes whole (a shaft that finds no room anywhere)
        // loses its farthest expansion and tries again.
        loop {
            // (as `generate`: `Limits::ROOMY`'s wider rings where the strict ones find no room even on open ground)
            let mut rules = shaft_rules(&sites);
            rules.roomy = !Map::shafts_fit(size, 4, |m, id| {
                m.place_basin_fields(id, sym, p0, channel[0], field, shape);
                m.place_fields(id, &rules, ideals, flank, shape, &sites, (false, false));
            });
            let mut thr = SHORE_ROCK;
            let mut ok = false;
            for _ in 0..16 {
                for i in 0..tiles {
                    m.shade[i] = nv[i] as f32;
                    m.rock[i] = (fixed[i] || (nv[i] > thr && !clear[i])) as u8;
                }
                m.nodes.clear();
                m.occ.fill(0);
                *next_id = id0;
                m.place_basin_fields(next_id, sym, p0, channel[0], field, shape);
                m.place_fields(
                    next_id,
                    &rules,
                    ideals,
                    flank,
                    shape,
                    &sites,
                    (false, false),
                );
                let reach = m.reach_from(b0, walk);
                let reached = |x: i32, y: i32| m.in_map(x, y) && reach[m.idx(x, y)];
                let fields_ok = m.nodes.iter().all(|n| {
                    let s = if n.ether { 2 } else { 1 };
                    (-1..=s).any(|dy| (-1..=s).any(|dx| reached(n.tx + dx, n.ty + dy)))
                });
                let starts_ok = coves.iter().chain(&basins).all(|b| reached(b.0, b.1));
                // (and both shafts found room: more open ground next time if not)
                let vents_ok = m.nodes.iter().filter(|n| n.ether).count() == 4;
                if starts_ok && fields_ok && vents_ok {
                    ok = true;
                    break;
                }
                thr += 0.03;
            }
            if ok || sites.is_empty() {
                // (a layout that connects even without expansions always does: the coves and basins never move)
                debug_assert!(
                    ok,
                    "seed {seed}: the Shore map does not connect for a walker"
                );
                break;
            }
            sites.pop();
        }
        m.expansions = sites
            .iter()
            .flat_map(|&p| (0..2).map(move |g| sym.point(g, p)))
            .collect();
        // Two open shafts a start: where none gave them room, laid again under looser rules (as `generate`).
        let strict = m.nodes.iter().filter(|n| n.ether).count() == 4;
        m.mend_shafts(next_id, &mut shaft_rules(&sites), ideals, 4);
        debug_assert!(
            strict,
            "seed {seed}: every Shore start has its two open shafts without mending"
        );
        debug_assert_eq!(
            m.nodes.iter().filter(|n| n.ether).count(),
            4,
            "seed {seed}: every Shore start has its two open shafts"
        );
        m
    }

    /// A reef basin's field and its image in the other share: a main's salt outcrop (seven crystals, `MAIN_CLUMP_R`
    /// from the basin's middle, as a cove's), to the flank of its Core square to the channel (`ShoreField::BACK`), not
    /// an expansion's: the smaller, nearer one mined faster and ran low, so a Vael start expanded two minutes early
    /// (the first Shore report). No vent: the shafts lie out in the open.
    /// `at` (lab only) puts the field elsewhere: `ShoreField::BACK` is every game's.
    fn place_basin_fields(
        &mut self,
        next_id: &mut Id,
        sym: Sym,
        p0: (f64, f64),
        channel: f64,
        at: ShoreField,
        shape: u32,
    ) {
        let dir = channel + at.turn;
        // (a field farther than a main's is the main's outcrop carried out: the same shape, its middle moved)
        // (a field by the Core keeps inside the reef, as near as its Core allows; one carried out past it, the lab's,
        // does not try)
        let (r, reach) = if at.r <= MAIN_FIELD_R {
            (MAIN_CLUMP_R - 1.0, SHORE_REEF - 0.9)
        } else {
            (at.r - MAIN_FIELD_R + MAIN_CLUMP_R, f64::INFINITY)
        };
        let field = self.add_clump(
            next_id,
            p0,
            dir,
            (r, MAIN_KEEP, reach),
            7,
            shape.rotate_left(16),
        );
        let img: Vec<(i32, i32)> = field.iter().map(|&t| sym.tile(1, t)).collect();
        self.add_shards_at(next_id, &img);
    }

    /// Tiles a unit with `foot` can reach from `from` (4-neighbour steps over tiles it may stand on).
    pub fn reach_from(&self, from: (i32, i32), foot: Foot) -> Vec<bool> {
        let mut seen = vec![false; self.rock.len()];
        let mut q = vec![from];
        seen[self.idx(from.0, from.1)] = true;
        while let Some((x, y)) = q.pop() {
            for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
                let (nx, ny) = (x + dx, y + dy);
                if self.passable(foot, nx, ny) && !seen[self.idx(nx, ny)] {
                    seen[self.idx(nx, ny)] = true;
                    q.push((nx, ny));
                }
            }
        }
        seen
    }

    /// The resource fields of a generated map, each start's the exact tile-for-tile image of the first's: its salt
    /// (`place_salt`), then the open shafts (`place_shafts`). No base has a vent of its own.
    #[allow(clippy::too_many_arguments)]
    fn place_fields(
        &mut self,
        next_id: &mut Id,
        rules: &ShaftRules,
        ideals: [(f64, f64); 2],
        flank: f64,
        shape: u32,
        sites: &[(f64, f64)],
        centre: (bool, bool),
    ) {
        let (sym, c0) = (rules.sym, rules.cores[0]);
        self.place_salt(next_id, sym, c0, flank, shape, sites, centre);
        self.place_shafts(next_id, rules, ideals);
    }

    /// Each base's own salt outcrop to one flank of its Core (`flank`, a direction), the centre's field or vent
    /// (`centre`: whether it holds either; never both, a field would lie by the vent), the expansions (nearest the main
    /// first), each with its outcrop on the far side from the main. Where a crystal falls depends only on the
    /// nodes laid before it, never on rock (`salt_of` lays them on an empty map to find where they will lie).
    #[allow(clippy::too_many_arguments)]
    fn place_salt(
        &mut self,
        next_id: &mut Id,
        sym: Sym,
        c0: (f64, f64),
        flank: f64,
        shape: u32,
        sites: &[(f64, f64)],
        (centre_field, centre_vent): (bool, bool),
    ) {
        let (mw, mh) = (self.w, self.h);
        let centre = ((mw - 1) as f64 / 2.0, (mh - 1) as f64 / 2.0);
        let images = |tiles: &[(i32, i32)], g: usize| -> Vec<(i32, i32)> {
            tiles.iter().map(|&t| sym.tile(g, t)).collect()
        };
        let at = (MAIN_CLUMP_R, MAIN_KEEP, f64::INFINITY);
        let home = self.add_clump(next_id, c0, flank, at, 7, shape);
        for g in 1..sym.k {
            self.add_shards_at(next_id, &images(&home, g));
        }
        if centre_field {
            let left = self.add_shards(next_id, centre.0 - 3.0, centre.1, PI, 3, 2.5);
            for g in 1..sym.k {
                self.add_shards_at(next_id, &images(&left, g)); // (where an image falls on the field, it is the field)
            }
        }
        if centre_vent {
            self.add_vent(next_id, mw / 2 - 1, mh / 2 - 1); // a 2x2 vent on the centre is its own image
        }
        for (i, &p) in sites.iter().enumerate() {
            // The crystals lie on the far side of the site from the main, clear of the main's ramp.
            let out = jsmath::atan2(p.1 - c0.1, p.0 - c0.0);
            let turn = shape.rotate_left(5 * (i as u32 + 1));
            let at = (EXP_CLUMP_R, 0.0, EXP_REACH);
            let field = self.add_clump(next_id, p, out, at, 5, turn);
            for g in 1..sym.k {
                self.add_shards_at(next_id, &images(&field, g));
            }
        }
    }

    /// Where the crystals `lay` puts down on an empty map of `size` will lie (tile middles): crystals fall by the nodes
    /// before them only, so these are the generated map's (the ideal shaft spots keep clear of them).
    fn salt_of(size: MapSize, lay: impl FnOnce(&mut Map, &mut Id)) -> Vec<(f64, f64)> {
        let mut m = Map::empty(size);
        lay(&mut m, &mut 1);
        m.salt()
    }

    /// Whether `lay` (fields, then shafts) puts down `want` vents on an empty map of `size`: open ground, where rock
    /// takes no room away.
    fn shafts_fit(size: MapSize, want: usize, lay: impl FnOnce(&mut Map, &mut Id)) -> bool {
        let mut m = Map::empty(size);
        lay(&mut m, &mut 1);
        m.nodes.iter().filter(|n| n.ether).count() == want
    }

    /// Every crystal's tile middle (tile units).
    fn salt(&self) -> Vec<(f64, f64)> {
        self.nodes
            .iter()
            .filter(|n| !n.ether)
            .map(|n| (n.tx as f64, n.ty as f64))
            .collect()
    }

    /// The first start's two open shafts and their images: each the allowed spot (`ShaftRules::allows`, clear of the
    /// crystals laid down) nearest its ideal where a shaft fits (`vent_fits`) and a walker from the first start reaches
    /// its side. A shaft that finds no room is left out, which the generator then mends (more open ground) or fails on
    /// loudly.
    fn place_shafts(&mut self, next_id: &mut Id, rules: &ShaftRules, ideals: [(f64, f64); 2]) {
        let (sym, c0) = (rules.sym, rules.cores[0]);
        let walk = Foot {
            class: Move::Walk,
            water: 0,
        };
        let reach = self.reach_from(rules.b0, walk);
        let salt = self.salt();
        let mut near_r = 0.0;
        // (under `Limits::STRICT`, where the layout needs it, a shaft that finds no room tries `Limits::ROOMY`'s rings)
        let tiers = if rules.roomy && rules.limits == Limits::STRICT {
            vec![Limits::STRICT, Limits::ROOMY]
        } else {
            vec![rules.limits]
        };
        for (i, ideal) in ideals.into_iter().enumerate() {
            let far = i == 1;
            let mut best: Option<(f64, (i32, i32))> = None;
            for &l in &tiers {
                if best.is_some() {
                    break;
                }
                let r = if far { l.far.1 } else { l.near.1 }.ceil() as i32 + 1;
                let (bx, by) = (c0.0 as i32, c0.1 as i32);
                for y in (by - r).max(0)..=(by + r).min(self.h - 1) {
                    for x in (bx - r).max(0)..=(bx + r).min(self.w - 1) {
                        let q = (x as f64 + 0.5, y as f64 + 0.5);
                        let dd = jsmath::hypot(q.0 - ideal.0, q.1 - ideal.1);
                        if best.is_some_and(|(b, _)| dd >= b)
                            || !rules.allows(l, q, far, near_r, &salt)
                        {
                            continue;
                        }
                        let ring = (-1..=2).any(|dy| {
                            (-1..=2).any(|dx| {
                                let (tx, ty) = (x + dx, y + dy);
                                self.in_map(tx, ty) && reach[self.idx(tx, ty)]
                            })
                        });
                        if ring && self.vent_fits(sym, (x, y), l.gap) {
                            best = Some((dd, (x, y)));
                        }
                    }
                }
            }
            let Some((_, v)) = best else {
                return;
            };
            near_r = jsmath::hypot(v.0 as f64 + 0.5 - c0.0, v.1 as f64 + 0.5 - c0.1);
            for g in 0..sym.k {
                let v = sym.block(g, v, 2);
                self.add_vent(next_id, v.0, v.1);
            }
        }
    }

    /// The last resort where a map's shafts found no room under `Limits::STRICT` (and `ROOMY`) at any rock threshold:
    /// its shafts (the last vents laid down) taken up and laid again under `Limits::RELAXED`, then `Limits::LAST`,
    /// until every start has its two (`want` vents in all, the centre's counted). A map that never needs it is
    /// unchanged.
    fn mend_shafts(
        &mut self,
        next_id: &mut Id,
        rules: &mut ShaftRules,
        ideals: [(f64, f64); 2],
        want: usize,
    ) {
        let vents = |m: &Map| m.nodes.iter().filter(|n| n.ether).count();
        for limits in [Limits::RELAXED, Limits::LAST] {
            if vents(self) == want {
                return;
            }
            // (the shafts are the last nodes laid down: any vents after the last crystal, the centre's excepted)
            let (cx, cy) = (self.w / 2 - 1, self.h / 2 - 1);
            while let Some(n) = self
                .nodes
                .last()
                .filter(|n| n.ether && (n.tx, n.ty) != (cx, cy))
            {
                let (tx, ty) = (n.tx, n.ty);
                for y in ty..ty + 2 {
                    for x in tx..tx + 2 {
                        let i = self.idx(x, y);
                        self.occ[i] = 0;
                    }
                }
                self.nodes.pop();
                *next_id -= 1;
            }
            rules.limits = limits;
            self.place_shafts(next_id, rules, ideals);
        }
    }

    /// Whether a vent (2x2, top-left `v`) and its images fit: on the map, a tile clear of the edge, on open ground with
    /// a tile of it (no rock, crystal or vent) round each, so workers can walk all round it, and `gap` from every other
    /// vent (`VENT_GAP`). Every field so far is the same in every
    /// start's share, so what is free round `v` is free round each image.
    fn vent_fits(&self, sym: Sym, v: (i32, i32), gap: i32) -> bool {
        let clear = (-1..=2).all(|dy| {
            (-1..=2).all(|dx| {
                let (x, y) = (v.0 + dx, v.1 + dy);
                self.in_map(x, y) && self.occ[self.idx(x, y)] == 0 && self.rock[self.idx(x, y)] == 0
            })
        });
        let apart = |a: (i32, i32), b: (i32, i32)| (a.0 - b.0).abs().max((a.1 - b.1).abs()) >= gap;
        let imgs: Vec<(i32, i32)> = (0..sym.k).map(|g| sym.block(g, v, 2)).collect();
        clear
            && self
                .nodes
                .iter()
                .filter(|n| n.ether)
                .all(|n| apart(v, (n.tx, n.ty)))
            && v.0 >= 1
            && v.1 >= 1
            && v.0 <= self.w - 3
            && v.1 <= self.h - 3
            && imgs
                .iter()
                .enumerate()
                .all(|(i, a)| imgs[i + 1..].iter().all(|&b| apart(*a, b)))
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

    /// A salt outcrop of `n` crystals (7 or 5: `CLUMP_7`, `CLUMP_5`), its pattern picked by `shape`, its middle `r`
    /// tiles from `from` (tiles) towards `dir`, or farther until every crystal lies `keep` tiles out from the 4x4 Core
    /// centred on `from` (a main's: two tiles of ground between its Core and the salt, and no crystal at its corner,
    /// where a worker would squeeze past); of the pattern's eight turns, the first from `shape`'s that lies nearest
    /// with every crystal within `reach` of `from` (a reef basin's: inside its reef), else the nearest. A crystal whose
    /// tile is taken goes to the nearest free one round it. Returns the tiles used (to mirror them exactly).
    #[allow(clippy::too_many_arguments)]
    fn add_clump(
        &mut self,
        next_id: &mut Id,
        from: (f64, f64),
        dir: f64,
        (r, keep, reach): (f64, f64, f64),
        n: usize,
        shape: u32,
    ) -> Vec<(i32, i32)> {
        let rows: &[&str] = if n == 7 {
            &CLUMP_7[(shape % CLUMP_7.len() as u32) as usize]
        } else {
            &CLUMP_5[(shape % CLUMP_5.len() as u32) as usize]
        };
        let s = rows.len() as i32;
        let offsets = |turn: u32| -> Vec<(i32, i32)> {
            rows.iter()
                .enumerate()
                .flat_map(|(y, row)| {
                    row.bytes()
                        .enumerate()
                        .filter(|&(_, c)| c == b'X')
                        .map(move |(x, _)| (x as i32 - s / 2, y as i32 - s / 2))
                })
                .map(|(ox, oy)| if turn >= 4 { (-ox, oy) } else { (ox, oy) })
                .map(|(ox, oy)| match turn % 4 {
                    0 => (ox, oy),
                    1 => (-oy, ox),
                    2 => (-ox, -oy),
                    _ => (oy, -ox),
                })
                .collect()
        };
        let at = |r: f64| {
            (
                jsmath::round(from.0 + jsmath::cos(dir) * r) as i32,
                jsmath::round(from.1 + jsmath::sin(dir) * r) as i32,
            )
        };
        // (how far a crystal's tile lies out from the Core's: past its edge, in a straight line)
        let clear = |(cx, cy): (i32, i32), offs: &[(i32, i32)]| {
            offs.iter().all(|&(ox, oy)| {
                let (x, y) = ((cx + ox) as f64 - from.0, (cy + oy) as f64 - from.1);
                jsmath::hypot((x.abs() - 1.5).max(0.0), (y.abs() - 1.5).max(0.0)) >= keep
            })
        };
        let within = |(cx, cy): (i32, i32), offs: &[(i32, i32)]| {
            offs.iter().all(|&(ox, oy)| {
                jsmath::hypot((cx + ox) as f64 - from.0, (cy + oy) as f64 - from.1) <= reach
            })
        };
        let base = shape / 8 % 8;
        let (_, _, offsets, (cx, cy)) = (0..8u32)
            .map(|t| {
                let offs = offsets((base + t) % 8);
                let out = (0..12)
                    .find(|&i| clear(at(r + 0.5 * i as f64), &offs))
                    .unwrap_or(12);
                let c = at(r + 0.5 * out.min(11) as f64);
                (!within(c, &offs), out, offs, c)
            })
            .min_by_key(|(far, out, _, _)| (*far, *out))
            .unwrap();
        let field = self.new_field();
        let mut used = Vec::new();
        let free = |m: &Map, x: i32, y: i32| {
            x >= 1 && y >= 1 && x <= m.w - 2 && y <= m.h - 2 && m.occ[m.idx(x, y)] == 0
        };
        for (ox, oy) in offsets {
            let (tx, ty) = (
                (cx + ox).clamp(1, self.w - 2),
                (cy + oy).clamp(1, self.h - 2),
            );
            let spot = (0..=2).find_map(|r| {
                (-r..=r).find_map(|dy| {
                    (-r..=r)
                        .filter(|dx: &i32| dx.abs().max(dy.abs()) == r)
                        .map(|dx| (tx + dx, ty + dy))
                        .find(|&(x, y)| free(self, x, y))
                })
            });
            if let Some((tx, ty)) = spot
                && self.add_shard(next_id, tx, ty, field)
            {
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

    /// Nearest unblocked tile to (tx,ty) within a square radius, searching ring by ring. (Ground of any depth: for
    /// a unit, `nearest_passable`.)
    pub fn nearest_free(&self, tx: i32, ty: i32, max_r: i32) -> Option<(i32, i32)> {
        self.nearest_where(tx, ty, max_r, |x, y| !self.blocked(x, y))
    }
    /// Nearest tile to (tx,ty) a unit with `foot` may stand on, within a square radius, ring by ring.
    pub fn nearest_passable(&self, foot: Foot, tx: i32, ty: i32, max_r: i32) -> Option<(i32, i32)> {
        self.nearest_where(tx, ty, max_r, |x, y| self.passable(foot, x, y))
    }
    /// Nearest tile to (tx,ty) a unit with `foot` may stand on, within a square radius, ring by ring; of a ring's
    /// tiles the one nearest `from` (a point in pixels: where the unit is, or aims). Ties go by the side of the line
    /// from (tx,ty) to `from` (the tile clockwise of it), then along it towards `from`, then nearer (tx,ty), then by (y, x). For a unit put somewhere
    /// once (eased out of rock, out of a new building's footprint, landing a jump, a start's harvesters): the same
    /// choice from every direction, where `nearest_passable` takes a ring's top row first, and a half turn of the map
    /// (the starts' symmetry) turns the choice with it. (A search's blocked goal is `path::goal_radius`'s.)
    pub fn nearest_passable_to(
        &self,
        foot: Foot,
        tx: i32,
        ty: i32,
        max_r: i32,
        from: (f64, f64),
    ) -> Option<(i32, i32)> {
        if self.passable(foot, tx, ty) {
            return Some((tx, ty));
        }
        let (gx, gy) = (tx as f64 * TILE + 16.0, ty as f64 * TILE + 16.0);
        let (fx, fy) = (from.0 - gx, from.1 - gy);
        for r in 1..=max_r {
            // (squared distance to `from`, clockwise of the line (higher first), along it towards `from` (higher
            // first), squared distance to (tx,ty), y, x)
            let mut best: Option<(f64, f64, f64, i32, i32, i32)> = None;
            for dy in -r..=r {
                for dx in -r..=r {
                    if dx.abs().max(dy.abs()) != r || !self.passable(foot, tx + dx, ty + dy) {
                        continue;
                    }
                    let (cx, cy) = (dx as f64 * TILE, dy as f64 * TILE);
                    let d = (cx - fx) * (cx - fx) + (cy - fy) * (cy - fy);
                    let (side, along) = (fx * cy - fy * cx, fx * cx + fy * cy);
                    let key = (d, side, along, dx * dx + dy * dy, ty + dy, tx + dx);
                    let better = |b: &(f64, f64, f64, i32, i32, i32)| {
                        if d != b.0 {
                            return d < b.0;
                        }
                        if side != b.1 {
                            return side > b.1;
                        }
                        if along != b.2 {
                            return along > b.2;
                        }
                        (key.3, key.4, key.5) < (b.3, b.4, b.5)
                    };
                    if best.is_none_or(|b| better(&b)) {
                        best = Some(key);
                    }
                }
            }
            if let Some((_, _, _, _, y, x)) = best {
                return Some((x, y));
            }
        }
        None
    }
    fn nearest_where(
        &self,
        tx: i32,
        ty: i32,
        max_r: i32,
        ok: impl Fn(i32, i32) -> bool,
    ) -> Option<(i32, i32)> {
        if ok(tx, ty) {
            return Some((tx, ty));
        }
        for r in 1..=max_r {
            for dy in -r..=r {
                for dx in -r..=r {
                    if dx.abs().max(dy.abs()) != r {
                        continue;
                    }
                    let (x, y) = (tx + dx, ty + dy);
                    if ok(x, y) {
                        return Some((x, y));
                    }
                }
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A map whose shafts find no room under the strict rules (rock over every ring they may lie in) still gets two
    /// per start, each start's the image of the first's, a walker's reach from its start: `mend_shafts`.
    #[test]
    fn shafts_that_find_no_room_are_laid_again_under_looser_rules() {
        let size = MapSize::DUEL;
        let sym = Sym { k: 2, w: 64, h: 64 };
        let mut m = Map::empty(size);
        let b0 = (8, 52);
        m.bases = vec![b0, sym.block(1, b0, 4)];
        let cores: Vec<(f64, f64)> = (0..2)
            .map(|g| sym.point(g, (b0.0 as f64 + 1.5, b0.1 as f64 + 1.5)))
            .collect();
        // (rock wherever a strict shaft could stand: 15 to 37 tiles from either Core)
        for y in 1..63 {
            for x in 1..63 {
                let r = cores
                    .iter()
                    .map(|c| jsmath::hypot(x as f64 + 0.5 - c.0, y as f64 + 0.5 - c.1))
                    .fold(f64::INFINITY, f64::min);
                if (15.0..=37.0).contains(&r) {
                    let i = m.idx(x, y);
                    m.rock[i] = 1;
                }
            }
        }
        let land = |_: i32, _: i32| true;
        let mut rules = ShaftRules {
            sym,
            w: 64,
            h: 64,
            b0,
            cores: cores.clone(),
            keep_off: cores.clone(),
            sites: Vec::new(),
            // (a natural's line, out towards the map's edge: out of the way)
            lines: vec![(cores[0], (cores[0].0 - 1.0, cores[0].1 + 1.0))],
            centre: (31.5, 31.5),
            centre_busy: false,
            salt: Vec::new(),
            land: &land,
            limits: Limits::STRICT,
            roomy: false,
        };
        let ideals = rules.ideals();
        let mut next_id = 1;
        m.place_shafts(&mut next_id, &rules, ideals);
        assert_eq!(m.nodes.len(), 0, "no room under the strict rules");
        m.mend_shafts(&mut next_id, &mut rules, ideals, 4);
        assert_eq!(m.nodes.len(), 4, "two shafts a start");
        let reach = m.reach_from(
            (b0.0 + 1, b0.1 - 1),
            Foot {
                class: Move::Walk,
                water: 0,
            },
        );
        for n in &m.nodes {
            assert!(
                m.nodes
                    .iter()
                    .any(|o| (o.tx, o.ty) == sym.block(1, (n.tx, n.ty), 2)),
                "each shaft's image"
            );
            let reached = (-1..=2).any(|dy| (-1..=2).any(|dx| reach[m.idx(n.tx + dx, n.ty + dy)]));
            assert!(reached, "the shaft at {},{} reached", n.tx, n.ty);
        }
    }
}
