//! Movement: paths, steering, reaching targets, the spatial hash and unit separation.

use super::*;

impl World {
    // ---- spatial hash (rebuilt every tick) ----
    pub(crate) fn cell(x: f64, y: f64) -> (i32, i32) {
        (jsmath::to_i32(x / CELL), jsmath::to_i32(y / CELL))
    }
    pub(crate) fn rebuild_hash(&mut self) {
        for c in self.hash.iter_mut() {
            c.clear();
        }
        self.graveyard.clear();
        let (gw, gh) = (self.hash_w, self.hash.len() as i32 / self.hash_w);
        for u in &self.units {
            let (cx, cy) = Self::cell(u.x, u.y);
            let (cx, cy) = (cx.clamp(0, gw - 1), cy.clamp(0, gh - 1));
            self.hash[(cy * gw + cx) as usize].push(u.id);
        }
    }
    pub(crate) fn nearby(&self, x: f64, y: f64, rad: f64) -> Vec<Id> {
        let mut out = Vec::new();
        let c = (rad / CELL).ceil() as i32;
        let (cx, cy) = Self::cell(x, y);
        let (gw, gh) = (self.hash_w, self.hash.len() as i32 / self.hash_w);
        for dy in -c..=c {
            for dx in -c..=c {
                let (gx, gy) = (cx + dx, cy + dy);
                if gx >= 0 && gy >= 0 && gx < gw && gy < gh {
                    out.extend_from_slice(&self.hash[(gy * gw + gx) as usize]);
                }
            }
        }
        out
    }
    /// A unit from the hash: alive, or killed earlier this tick.
    pub(crate) fn hashed(&self, id: Id) -> Option<&Unit> {
        self.unit(id)
            .or_else(|| self.graveyard.iter().find(|u| u.id == id))
    }

    // ---- orders (commands.js) ----
    /// Plan a route to (`x`, `y`) (see paths.rs: a group's route shared, long searches budgeted). Returns false when
    /// the unit must wait for the next tick's budget: its old route (if any) stands and it asks again next tick.
    pub(crate) fn path_to(&mut self, uid: Id, x: f64, y: f64) -> bool {
        if self.u(uid).kind.def().air {
            // Flyers go straight there, over rock and buildings.
            let to = Pt {
                x: clamp(x, 16.0, self.map.ww() - 16.0),
                y: clamp(y, 16.0, self.map.wh() - 16.0),
            };
            let u = self.um(uid);
            u.path = Some(vec![to]);
            u.repath = 0.6;
            return true;
        }
        let (ux, uy, team) = (self.u(uid).x, self.u(uid).y, self.u(uid).team);
        let (a, b) = (self.map.tile_of(ux, uy), self.map.tile_of(x, y));
        let paths::Plan::Route(mut path) = self.plan_walk(team, (ux, uy), a, b) else {
            self.um(uid).repath = 0.0;
            return false;
        };
        let bi = self.map.idx(b.0, b.1);
        let blocked_tile = self.map.rock[bi] != 0 || self.map.occ[bi] != 0;
        // The exact point only if the route reaches its tile: a route that stops short (the goal is free but walled
        // off) ends where it can, or the unit would walk on into the wall from its end.
        let centre = Pt {
            x: b.0 as f64 * TILE + 16.0,
            y: b.1 as f64 * TILE + 16.0,
        };
        if let Some(p) = path.as_mut()
            && let Some(last) = p.last_mut()
            && !blocked_tile
            && *last == centre
        {
            *last = Pt {
                x: clamp(x, 16.0, self.map.ww() - 16.0),
                y: clamp(y, 16.0, self.map.wh() - 16.0),
            };
        }
        let rep = 0.6 + self.rnd() * 0.3;
        let u = self.um(uid);
        u.path = path;
        u.repath = rep;
        true
    }

    // ---- per-tick update (update.js) ----
    pub(crate) fn step_path(&mut self, uid: Id, dt: f64) -> bool {
        let speed = self.live_speed(uid);
        let u = self.um(uid);
        let Some(path) = u.path.as_mut() else {
            return true;
        };
        if path.is_empty() {
            return true;
        }
        let w = path[0];
        let d = dist(u.x, u.y, w.x, w.y);
        let mv = speed * dt;
        u.face = jsmath::atan2(w.y - u.y, w.x - u.x);
        if d <= mv + 1.0 {
            u.x = w.x;
            u.y = w.y;
            path.remove(0);
            return path.is_empty();
        }
        u.x += (w.x - u.x) / d * mv;
        u.y += (w.y - u.y) / d * mv;
        false
    }

    /// Move toward a target until within reach. Returns true once in reach.
    pub(crate) fn approach(&mut self, uid: Id, target: Geo, reach: f64, dt: f64) -> bool {
        let (ux, uy) = (self.u(uid).x, self.u(uid).y);
        let p = target.aim_point(ux, uy);
        let d = target.edge_dist(ux, uy);
        if d <= reach {
            let u = self.um(uid);
            u.path = None;
            u.face = jsmath::atan2(p.1 - uy, p.0 - ux);
            return true;
        }
        if self.u(uid).kind.def().air {
            // Flyers close in on a straight line, nothing below can block them.
            let mv = self.live_speed(uid) * dt;
            let (ww, wh) = (self.map.ww(), self.map.wh());
            let u = self.um(uid);
            u.path = None;
            u.face = jsmath::atan2(p.1 - uy, p.0 - ux);
            u.x = clamp(ux + (p.0 - ux) / d * mv, 16.0, ww - 16.0);
            u.y = clamp(uy + (p.1 - uy) / d * mv, 16.0, wh - 16.0);
            return false;
        }
        let u = self.um(uid);
        u.repath -= dt;
        if u.path.is_none() || u.repath <= 0.0 {
            if let Geo::Rect { tx, ty, w, h, .. } = target {
                // (a long way to a building waits its turn as any long search: the old route stands meanwhile)
                let team = self.u(uid).team;
                let (a, g) = (self.map.tile_of(ux, uy), self.map.tile_of(p.0, p.1));
                if self.may_search(team, a, g) {
                    let path = self.path_to_rect(ux, uy, (tx, ty, w, h), p);
                    let u = self.um(uid);
                    u.path = path;
                    u.repath = 0.7;
                } else {
                    self.um(uid).repath = 0.0;
                }
            } else {
                let (tx, ty) = target.center();
                self.path_to(uid, tx, ty);
            }
        }
        if self.u(uid).path.as_ref().is_some_and(|p| !p.is_empty()) {
            self.step_path(uid, dt);
        } else {
            let mv = self.live_speed(uid) * dt;
            let u = self.u(uid);
            let (nx, ny) = (u.x + (p.0 - u.x) / d * mv, u.y + (p.1 - u.y) / d * mv);
            if !self
                .map
                .blocked(jsmath::to_i32(nx / TILE), jsmath::to_i32(ny / TILE))
            {
                let u = self.um(uid);
                u.x = nx;
                u.y = ny;
            }
        }
        false
    }

    /// A path to a free tile beside a building footprint that can actually be reached: the free tiles around
    /// it are tried nearest first (a free tile can be cut off by rock), falling back to the old nearest-free goal.
    pub(crate) fn path_to_rect(
        &mut self,
        ux: f64,
        uy: f64,
        (tx, ty, w, h): (i32, i32, i32, i32),
        aim: (f64, f64),
    ) -> Option<Vec<Pt>> {
        let start = self.map.tile_of(ux, uy);
        let mut ring: Vec<(f64, i32, i32)> = Vec::new();
        for y in ty - 1..=ty + h {
            for x in tx - 1..=tx + w {
                if (x >= tx && x < tx + w && y >= ty && y < ty + h) || self.map.blocked(x, y) {
                    continue;
                }
                let (cx, cy) = (x as f64 * TILE + 16.0, y as f64 * TILE + 16.0);
                ring.push((dist(cx, cy, ux, uy), x, y));
            }
        }
        ring.sort_by(|a, b| {
            a.0.partial_cmp(&b.0)
                .unwrap()
                .then((a.1, a.2).cmp(&(b.1, b.2)))
        });
        for &(_, x, y) in ring.iter().take(4) {
            if (x, y) == start {
                return Some(Vec::new());
            }
            if let Some(path) = astar(&self.map, &mut self.scratch, start.0, start.1, x, y) {
                let goal = Pt {
                    x: x as f64 * TILE + 16.0,
                    y: y as f64 * TILE + 16.0,
                };
                if path.last() == Some(&goal) {
                    return Some(path);
                }
            }
        }
        let g = self.map.tile_of(aim.0, aim.1);
        astar(&self.map, &mut self.scratch, start.0, start.1, g.0, g.1)
    }

    /// Back to idle (an entrenched unit holds instead: idle, it would chase what it cannot reach).
    pub(crate) fn set_idle(&mut self, uid: Id) {
        let t = if self.u(uid).mode.is_some() {
            Task::Hold
        } else {
            Task::Idle
        };
        self.set_task(uid, t);
    }

    pub(crate) fn update_move(&mut self, uid: Id, x: f64, y: f64, dt: f64) {
        let u = self.um(uid);
        u.repath -= dt;
        if u.path.is_none() && u.repath <= 0.0 && !self.path_to(uid, x, y) {
            return; // (waiting for its route: it stands this tick)
        }
        if self.u(uid).path.is_none() || self.step_path(uid, dt) {
            // Arrived, or at the end of the route (the goal itself may be a building or rock: the route ends
            // at the nearest free tile, and that is as close as we get).
            self.set_idle(uid);
        }
    }

    /// Push overlapping units apart and out of blocked tiles. A unit holding position or warping in stands firm:
    /// others flow around it.
    pub(crate) fn separate(&mut self) {
        let firm = |u: &Unit| u.task == Task::Hold || u.warp > 0.0;
        for i in 0..self.units.len() {
            if firm(&self.units[i]) {
                continue;
            }
            let (id, ux, uy) = (self.units[i].id, self.units[i].x, self.units[i].y);
            let air = self.units[i].kind.def().air;
            for o in self.nearby(ux, uy, 40.0) {
                if o == id {
                    continue;
                }
                let (ox, oy, or, ohold, oair, unseen) = {
                    let o = self.hashed(o).unwrap();
                    let me = &self.units[i];
                    let unseen = o.team != me.team
                        && (self.cloaked_from(me.team, o) || self.cloaked_from(o.team, me));
                    (o.x, o.y, o.r, firm(o), o.kind.def().air, unseen)
                };
                if air != oair || unseen {
                    continue; // flyers and walkers do not bump into each other, nor anything into what it cannot see
                }
                let u = &mut self.units[i];
                let (dx, dy) = (u.x - ox, u.y - oy);
                // Exactly on top of each other: part along x, by id, so the push is never a zero vector.
                let (dx, dy) = if dx == 0.0 && dy == 0.0 {
                    (if id < o { -1.0 } else { 1.0 }, 0.0)
                } else {
                    (dx, dy)
                };
                let d = jsmath::hypot(dx, dy);
                let min = u.r + or;
                if d < min {
                    let push = (min - d) * 0.5 * if ohold { 1.0 } else { 0.5 };
                    u.x += dx / d * push;
                    u.y += dy / d * push;
                }
            }
            let u = &mut self.units[i];
            u.x = clamp(u.x, 16.0, self.map.ww() - 16.0);
            u.y = clamp(u.y, 16.0, self.map.wh() - 16.0);
            let t = self.map.tile_of(u.x, u.y);
            if !air
                && self.map.blocked(t.0, t.1)
                && let Some(f) = self.map.nearest_free(t.0, t.1, 4)
            {
                let u = &mut self.units[i];
                let (cx, cy) = (f.0 as f64 * TILE + 16.0, f.1 as f64 * TILE + 16.0);
                let d = dist(u.x, u.y, cx, cy);
                if d < 6.0 {
                    // (easing out rather than snapping to the centre, so several pushed in do not land on one spot)
                    u.x = cx;
                    u.y = cy;
                } else {
                    u.x += (cx - u.x) / d * 6.0;
                    u.y += (cy - u.y) / d * 6.0;
                }
                // A walker's route may run through what pushed it out (a building put up across it since): it plans
                // again, at most once per replan period (it keeps its timer: a crowd at a wall is pushed every tick).
                // Anything else asks for a fresh approach at once, as before.
                if matches!(
                    u.task,
                    Task::Move { .. } | Task::AMove { .. } | Task::Flee { .. }
                ) {
                    if u.repath <= 0.0 {
                        u.path = None;
                    }
                } else {
                    u.repath = 0.0;
                }
            }
        }
    }
}
