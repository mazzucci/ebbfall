//! Fog of war: what each team sees.

use super::*;

impl World {
    // ---- fog of war: one layer per seat (allies do not share vision yet: a later change here and in `seen_by`) ----
    pub fn update_fog(&mut self) {
        let size = self.map.size();
        for team in 0..self.seats() {
            self.vis[team].fill(0);
            let mut marks: Vec<(f64, f64, f64)> = Vec::new();
            for u in self.units.iter().filter(|u| u.team as usize == team) {
                marks.push((u.x, u.y, u.kind.def().sight));
            }
            for b in self.bldgs.iter().filter(|b| b.team as usize == team) {
                marks.push((b.x, b.y, if b.done { b.kind.def().sight } else { 3.0 }));
            }
            for (x, y, s) in marks {
                let (vis, explored) = (&mut self.vis[team], &mut self.explored[team]);
                disc(size, x, y, s, |i| {
                    vis[i] = 1;
                    explored[i] = 1;
                });
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
                let det = &mut self.det[team];
                disc(size, x, y, s, |i| det[i] = 1);
            }
        }
    }

    /// Whether unit `u` is cloaked: always (an Observer), or for now (a Cloak or Veil running).
    pub fn is_cloaked(u: &Unit) -> bool {
        u.kind.def().cloaked
            || u.boost
                .is_some_and(|(k, _)| matches!(k.def().effect, AbilityEffect::Cloak { .. }))
    }

    /// Whether `team` detects the tile under world point (x, y).
    pub fn detects(&self, team: u8, x: f64, y: f64) -> bool {
        let (tx, ty) = self.map.tile_of(x, y);
        self.det[team as usize][self.map.idx(tx, ty)] != 0
    }

    /// Whether unit `u` is hidden from `team`: cloaked, an enemy's, and outside its detection.
    pub fn cloaked_from(&self, team: u8, u: &Unit) -> bool {
        self.enemies(team, u.team) && World::is_cloaked(u) && !self.detects(team, u.x, u.y)
    }

    /// Whether `id` (unit or building) is hidden from `team` by cloak (buildings never are).
    pub fn hidden_from(&self, team: u8, id: Id) -> bool {
        self.unit(id).is_some_and(|u| self.cloaked_from(team, u))
    }

    /// The seats that see unit or building `id` of seat `team` (its own, and whoever has it in sight), bit `t` for seat
    /// `t`: who is shown a shot or a cast.
    pub(crate) fn seen_mask(&self, team: u8, id: Id) -> u8 {
        (0..self.seats() as u8)
            .filter(|&t| t == team || self.seen_by(t, id))
            .fold(0, |m, t| m | 1 << t)
    }

    /// Whether `team` can see this unit or building (its own always).
    pub fn seen_by(&self, team: u8, id: Id) -> bool {
        let vis = &self.vis[team as usize];
        if let Some(u) = self.unit(id) {
            if u.team == team {
                return true;
            }
            let (tx, ty) = self.map.tile_of(u.x, u.y);
            return vis[self.map.idx(tx, ty)] != 0 && !self.cloaked_from(team, u);
        }
        if let Some(b) = self.bldg(id) {
            if b.team == team {
                return true;
            }
            for y in 0..b.h {
                for x in 0..b.w {
                    if vis[self.map.idx(b.tx + x, b.ty + y)] != 0 {
                        return true;
                    }
                }
            }
        }
        false
    }
}

/// Each tile (index) of a map of `size` within `s` tiles of world point (x, y), by tile centre.
fn disc(size: MapSize, x: f64, y: f64, s: f64, mut each: impl FnMut(usize)) {
    let (cx, cy, s2) = (x / TILE, y / TILE, s * s);
    let y0 = jsmath::to_i32(cy - s).max(0);
    let y1 = jsmath::to_i32(cy + s).min(size.h - 1);
    let x0 = jsmath::to_i32(cx - s).max(0);
    let x1 = jsmath::to_i32(cx + s).min(size.w - 1);
    for ty in y0..=y1 {
        for tx in x0..=x1 {
            let (dx, dy) = (tx as f64 + 0.5 - cx, ty as f64 + 0.5 - cy);
            if dx * dx + dy * dy <= s2 {
                each((ty * size.w + tx) as usize);
            }
        }
    }
}
