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
                let (cx, cy, s2) = (x / TILE, y / TILE, s * s);
                let y0 = jsmath::to_i32(cy - s).max(0);
                let y1 = jsmath::to_i32(cy + s).min(MH - 1);
                let x0 = jsmath::to_i32(cx - s).max(0);
                let x1 = jsmath::to_i32(cx + s).min(MW - 1);
                for ty in y0..=y1 {
                    for tx in x0..=x1 {
                        let (dx, dy) = (tx as f64 + 0.5 - cx, ty as f64 + 0.5 - cy);
                        if dx * dx + dy * dy <= s2 {
                            let i = idx(tx, ty);
                            self.vis[team][i] = 1;
                            self.explored[team][i] = 1;
                        }
                    }
                }
            }
        }
    }

    /// Whether the human player (team 0) can see this unit or building.
    pub fn visible(&self, id: Id) -> bool {
        if let Some(u) = self.unit(id) {
            if u.team == PLAYER {
                return true;
            }
            let tx = jsmath::to_i32(u.x / TILE).clamp(0, MW - 1);
            let ty = jsmath::to_i32(u.y / TILE).clamp(0, MH - 1);
            return self.vis[0][idx(tx, ty)] != 0;
        }
        if let Some(b) = self.bldg(id) {
            if b.team == PLAYER {
                return true;
            }
            for y in 0..b.h {
                for x in 0..b.w {
                    if self.vis[0][idx(b.tx + x, b.ty + y)] != 0 {
                        return true;
                    }
                }
            }
        }
        false
    }
}
