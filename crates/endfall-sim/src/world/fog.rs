//! Fog of war: what each team sees.

use super::*;

impl World {
    // ---- fog of war: one layer per team; rules use team 0's (the human's) like the JS sim ----
    pub fn update_fog(&mut self) {
        for team in 0..2 {
            self.vis[team].fill(0);
            let mut marks: Vec<(f64, f64, f64)> = Vec::new();
            for u in self.units.iter().filter(|u| u.team as usize == team) {
                marks.push((u.x, u.y, u.kind.def().sight));
            }
            for b in self.bldgs.iter().filter(|b| b.team as usize == team) {
                marks.push((b.x, b.y, if b.done { b.kind.def().sight } else { 3.0 }));
            }
            for (x, y, s) in marks {
                for i in disc(x, y, s) {
                    self.vis[team][i] = 1;
                    self.explored[team][i] = 1;
                }
            }
            // Detection: where this team's detectors (finished, and powered if they need it) reveal cloaked units.
            self.det[team].fill(0);
            let mut detectors: Vec<(f64, f64, f64)> = Vec::new();
            for u in self
                .units
                .iter()
                .filter(|u| u.team as usize == team && u.kind.def().detect > 0.0)
            {
                detectors.push((u.x, u.y, u.kind.def().detect));
            }
            for b in self
                .bldgs
                .iter()
                .filter(|b| b.team as usize == team && b.done && b.kind.def().detect > 0.0)
            {
                if !b.kind.def().needs_power || b.powered {
                    detectors.push((b.x, b.y, b.kind.def().detect));
                }
            }
            for (x, y, s) in detectors {
                for i in disc(x, y, s) {
                    self.det[team][i] = 1;
                }
            }
        }
    }

    /// Whether unit `u` is hidden from `team`: cloaked, another team's, and outside its detection.
    pub fn cloaked_from(&self, team: u8, u: &Unit) -> bool {
        let (tx, ty) = World::tile_of(u.x, u.y);
        u.team != team && u.kind.def().cloaked && self.det[team as usize][idx(tx, ty)] == 0
    }

    /// Whether `id` (unit or building) is hidden from `team` by cloak (buildings never are).
    pub fn hidden_from(&self, team: u8, id: Id) -> bool {
        self.unit(id).is_some_and(|u| self.cloaked_from(team, u))
    }

    /// Whether `team` can see this unit or building (its own always).
    pub fn seen_by(&self, team: u8, id: Id) -> bool {
        let vis = &self.vis[team as usize];
        if let Some(u) = self.unit(id) {
            if u.team == team {
                return true;
            }
            let tx = jsmath::to_i32(u.x / TILE).clamp(0, MW - 1);
            let ty = jsmath::to_i32(u.y / TILE).clamp(0, MH - 1);
            return vis[idx(tx, ty)] != 0 && !self.cloaked_from(team, u);
        }
        if let Some(b) = self.bldg(id) {
            if b.team == team {
                return true;
            }
            for y in 0..b.h {
                for x in 0..b.w {
                    if vis[idx(b.tx + x, b.ty + y)] != 0 {
                        return true;
                    }
                }
            }
        }
        false
    }
}

/// The map tiles (indices) within `s` tiles of world point (x, y), by tile centre.
fn disc(x: f64, y: f64, s: f64) -> Vec<usize> {
    let (cx, cy, s2) = (x / TILE, y / TILE, s * s);
    let y0 = jsmath::to_i32(cy - s).max(0);
    let y1 = jsmath::to_i32(cy + s).min(MH - 1);
    let x0 = jsmath::to_i32(cx - s).max(0);
    let x1 = jsmath::to_i32(cx + s).min(MW - 1);
    let mut out = Vec::new();
    for ty in y0..=y1 {
        for tx in x0..=x1 {
            let (dx, dy) = (tx as f64 + 0.5 - cx, ty as f64 + 0.5 - cy);
            if dx * dx + dy * dy <= s2 {
                out.push(idx(tx, ty));
            }
        }
    }
    out
}
