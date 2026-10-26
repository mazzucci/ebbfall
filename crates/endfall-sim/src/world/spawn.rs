//! Making units and buildings, and units leaving a production building.

use super::*;

impl World {
    /// A building is gone (destroyed or cancelled): its tiles are free again, and a refinery's vent is a bare
    /// vent once more (marked by its node id, negated, in the grid).
    pub(crate) fn clear_footprint(&mut self, b: &Bldg) {
        for y in 0..b.h {
            for x in 0..b.w {
                self.map.occ[idx(b.tx + x, b.ty + y)] = b.vent.map_or(0, |v| -(v as i32));
            }
        }
        if let Some(n) = b.vent.and_then(|v| self.map.node_mut(v)) {
            n.extractor = None;
        }
    }

    // ---- entities ----
    pub fn make_unit(&mut self, kind: UnitKind, team: u8, x: f64, y: f64) -> Id {
        let d = kind.def();
        let id = self.next_id;
        self.next_id += 1;
        self.units.push(Unit {
            id,
            kind,
            team,
            x,
            y,
            hp: d.hp,
            maxhp: d.hp,
            sh: d.shields,
            maxsh: d.shields,
            hit_at: f64::NEG_INFINITY,
            struck: f64::NEG_INFINITY,
            told: f64::NEG_INFINITY,
            r: d.r,
            task: Task::Idle,
            path: None,
            cd: 0.0,
            face: if team != 0 { PI } else { 0.0 },
            carry: 0,
            carry_ether: None,
            last_node: None,
            repath: 0.0,
            flash: 0.0,
            aggro_cd: 0.0,
            stuck: 0.0,
            anchor: (x, y),
            no_build_until: 0.0,
            heal_fx: 0.0,
            healed_at: u32::MAX,
            ab_cd: [0.0; ABILITY_SLOTS],
            boost: None,
            mode: None,
            swap: 0.0,
            warp: 0.0,
            pace: None,
        });
        id
    }

    pub fn make_building(&mut self, kind: BldgKind, team: u8, tx: i32, ty: i32, done: bool) -> Id {
        let d = kind.def();
        let id = self.next_id;
        self.next_id += 1;
        let mut b = Bldg {
            id,
            kind,
            team,
            tx,
            ty,
            w: d.w,
            h: d.h,
            x: (tx as f64 + d.w as f64 / 2.0) * TILE,
            y: (ty as f64 + d.h as f64 / 2.0) * TILE,
            hp: if done { d.hp } else { (d.hp * 0.1).max(10.0) },
            maxhp: d.hp,
            sh: d.shields, // a seed is shielded from the start
            maxsh: d.shields,
            hit_at: f64::NEG_INFINITY,
            planted: false,
            powered: true,
            progress: if done { 1.0 } else { 0.0 },
            done,
            queue: Vec::new(),
            prog: 0.0,
            rally: None,
            cd: 0.0,
            flash: 0.0,
            r: d.w.max(d.h) as f64 * TILE / 2.0,
            vent: None,
            aim: 0.0,
            research: None,
            repair_debt: [0.0, 0.0],
        };
        for y in 0..d.h {
            for x in 0..d.w {
                let i = idx(tx + x, ty + y);
                if self.map.occ[i] < 0 && d.on_vent {
                    let nid = (-self.map.occ[i]) as Id;
                    if let Some(nd) = self.map.node_mut(nid) {
                        nd.extractor = Some(id);
                        b.vent = Some(nid);
                    }
                }
                self.map.occ[i] = id as i32;
            }
        }
        // Nudge units standing in the footprint.
        for k in 0..self.units.len() {
            let (tx2, ty2) = (
                jsmath::to_i32(self.units[k].x / TILE),
                jsmath::to_i32(self.units[k].y / TILE),
            );
            if !self.units[k].kind.def().air
                && tx2 >= tx
                && tx2 < tx + d.w
                && ty2 >= ty
                && ty2 < ty + d.h
                && let Some(f) = self.map.nearest_free(tx2, ty2, 4)
            {
                // (several land on one point; separate() parts them, see the zero-distance case there)
                self.units[k].x = f.0 as f64 * TILE + 16.0;
                self.units[k].y = f.1 as f64 * TILE + 16.0;
            }
        }
        self.bldgs.push(b);
        self.recalc_supply(team);
        id
    }

    /// A new unit from a building: warped in at the rally point (see `warp_spot`), else stepping out beside it.
    pub(crate) fn spawn_from(&mut self, bid: Id, kind: UnitKind) -> Id {
        let b = self.bldg(bid).unwrap().clone();
        let warp = self.warp_spot(&b, kind);
        let (x, y) = match warp {
            Some(at) => at,
            None => {
                let f = self.exit_tile(&b, kind);
                (f.0 as f64 * TILE + 16.0, f.1 as f64 * TILE + 16.0)
            }
        };
        let u = self.make_unit(kind, b.team, x, y);
        self.stats[b.team as usize].built += 1;
        self.sfx(b.team, "ready");
        if warp.is_some() {
            self.um(u).warp = UNIT_WARP; // already where it was sent
        } else if let Some(rl) = b.rally {
            match rl.node {
                Some(n) if kind.def().worker => {
                    self.start_gather(u, n);
                }
                _ => self.move_to(u, rl.x, rl.y),
            }
        } else if kind.def().worker && b.kind.def().dropoff {
            let (ux, uy) = (self.u(u).x, self.u(u).y);
            if let Some(nd) = self.nearest_node(ux, uy, b.team, false, 900.0) {
                self.start_gather(u, nd);
            }
        }
        self.recalc_supply(b.team);
        u
    }

    /// Where a warping side's factory (not its headquarters, not a worker) sends a new unit: its rally point (kept
    /// inside the map) when that is inside one of the side's power fields, on the nearest tile there that is open
    /// (for a walker) and not under another unit of its layer, so a batch lands side by side.
    fn warp_spot(&self, b: &Bldg, kind: UnitKind) -> Option<(f64, f64)> {
        let rl = b.rally?;
        let d = kind.def();
        if !self.factions[b.team as usize].warp
            || d.worker
            || b.kind.def().hq
            || rl.node.is_some()
            || !self.powered_at(b.team, rl.x, rl.y)
        {
            return None;
        }
        let (rx, ry) = (clamp_x(rl.x), clamp_y(rl.y));
        let t = Self::tile_of(rx, ry);
        let centre = |(x, y): (i32, i32)| (x as f64 * TILE + 16.0, y as f64 * TILE + 16.0);
        // (crowded, distance, y, x): smaller is better.
        let mut best: Option<(bool, f64, i32, i32)> = None;
        for y in t.1 - 2..=t.1 + 2 {
            for x in t.0 - 2..=t.0 + 2 {
                if !crate::map::in_map(x, y) || (!d.air && self.map.blocked(x, y)) {
                    continue;
                }
                let (cx, cy) = centre((x, y));
                let key = (self.crowded(x, y, d.air), dist(cx, cy, rx, ry), y, x);
                if best.is_none_or(|k| {
                    key.0
                        .cmp(&k.0)
                        .then(key.1.partial_cmp(&k.1).unwrap())
                        .then((key.2, key.3).cmp(&(k.2, k.3)))
                        .is_lt()
                }) {
                    best = Some(key);
                }
            }
        }
        let k = best?;
        Some(if (k.3, k.2) == t && !k.0 {
            (rx, ry)
        } else {
            centre((k.3, k.2))
        })
    }

    /// Whether a unit of the layer (flyers or walkers) already stands on tile (x, y).
    fn crowded(&self, x: i32, y: i32, air: bool) -> bool {
        let (cx, cy) = (x as f64 * TILE + 16.0, y as f64 * TILE + 16.0);
        self.units
            .iter()
            .any(|u| u.kind.def().air == air && dist(u.x, u.y, cx, cy) < 22.0)
    }

    /// The free tile around the building a new unit steps out onto: an uncrowded one if there is any (so a batch
    /// stands side by side instead of on one spot), nearest the building, towards the rally point (or the far side of
    /// the map).
    fn exit_tile(&self, b: &Bldg, kind: UnitKind) -> (i32, i32) {
        let air = kind.def().air;
        let rf = match b.rally {
            Some(rl) => (rl.x, rl.y),
            None => (
                b.x,
                b.y + MH as f64 * TILE * if b.team != 0 { -1.0 } else { 1.0 },
            ),
        };
        // (crowded, ring, distance to the rally side, y, x): smaller is better, compared in that order.
        type Spot = (bool, i32, f64, i32, i32);
        let mut best: Option<Spot> = None;
        for r in 0..4 {
            for y in (b.ty - r - 1)..=(b.ty + b.h + r) {
                for x in (b.tx - r - 1)..=(b.tx + b.w + r) {
                    let inner =
                        x >= b.tx - r && x < b.tx + b.w + r && y >= b.ty - r && y < b.ty + b.h + r;
                    if inner || self.map.blocked(x, y) {
                        continue; // only the ring r tiles out
                    }
                    let key = (
                        self.crowded(x, y, air),
                        r,
                        dist(x as f64 * TILE, y as f64 * TILE, rf.0, rf.1),
                        y,
                        x,
                    );
                    if best.is_none_or(|k| {
                        (key.0, key.1)
                            .cmp(&(k.0, k.1))
                            .then(key.2.partial_cmp(&k.2).unwrap())
                            .then((key.3, key.4).cmp(&(k.3, k.4)))
                            .is_lt()
                    }) {
                        best = Some(key);
                    }
                }
            }
        }
        best.map_or((b.tx, b.ty + b.h), |k| (k.4, k.3))
    }
}
