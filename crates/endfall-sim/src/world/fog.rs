//! Fog of war: what each seat sees, its own sight and its allies' (allies share vision).

use super::*;

impl World {
    // ---- fog of war: one layer per seat, each seat's own sight first, then shared with its allies ----
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
        }
        self.share_vision();
    }

    /// Allies share vision: each seat sees and has explored what any seat of its team does. Vision comes from what stands on the map: a seat that is
    /// out still lends the sight of what it left (inert, but there) until that is destroyed, and sees what its team
    /// sees. The team's first seat gathers the team's layers, then every other seat of the team takes a copy: in place,
    /// in seat order, nothing allocated. With every seat its own team (a duel, a free for all) nothing changes.
    fn share_vision(&mut self) {
        let n = self.seats();
        let first = |w: &World, s: usize| (0..s).find(|&a| w.teams[a] == w.teams[s]);
        for gather in [true, false] {
            for s in 1..n {
                let Some(f) = first(self, s) else { continue };
                for layers in [&mut self.vis, &mut self.explored] {
                    let (lo, hi) = layers.split_at_mut(s);
                    if gather {
                        lo[f].iter_mut().zip(&hi[0]).for_each(|(a, b)| *a |= b);
                    } else {
                        hi[0].copy_from_slice(&lo[f]);
                    }
                }
            }
        }
    }

    /// The seats that see unit or building `id` of seat `team` (its own, and whoever has it in sight), bit `t` for seat
    /// `t`: who is shown a shot or a cast.
    pub(crate) fn seen_mask(&self, team: u8, id: Id) -> u8 {
        (0..self.seats() as u8)
            .filter(|&t| t == team || self.seen_by(t, id))
            .fold(0, |m, t| m | 1 << t)
    }

    /// Whether `team` can see this unit or building (its own always; its allies' are in its sight: theirs too).
    pub fn seen_by(&self, team: u8, id: Id) -> bool {
        if let Some(u) = self.unit(id) {
            return self.sees_unit(team, u);
        }
        self.bldg(id).is_some_and(|b| self.sees_bldg(team, b))
    }

    /// Whether `team` can see unit `u`: its own always; another's on a tile in its sight, unless inside a mine.
    pub fn sees_unit(&self, team: u8, u: &Unit) -> bool {
        if u.team == team {
            return true;
        }
        if u.inside() {
            return false; // (in a mine: out of everyone's sight but its side's)
        }
        let (tx, ty) = self.map.tile_of(u.x, u.y);
        self.vis[team as usize][self.map.idx(tx, ty)] != 0
    }

    /// Whether `team` can see building `b`: its own always; another's with a tile of its footprint in its sight.
    pub fn sees_bldg(&self, team: u8, b: &Bldg) -> bool {
        if b.team == team {
            return true;
        }
        let vis = &self.vis[team as usize];
        (0..b.h).any(|y| (0..b.w).any(|x| vis[self.map.idx(b.tx + x, b.ty + y)] != 0))
    }

    /// What `team` sees of its enemies right now (its own sight and its allies'): the ids of their units, then of their
    /// buildings, in sight. Read-only, read by no rule: a fog-honest view of the foe for a reader outside the game
    /// (the game summary's "what this seat saw").
    pub fn seen(&self, team: u8) -> Vec<Id> {
        let units = self
            .units
            .iter()
            .filter(|u| self.enemies(team, u.team) && self.sees_unit(team, u))
            .map(|u| u.id);
        let bldgs = self
            .bldgs
            .iter()
            .filter(|b| self.enemies(team, b.team) && self.sees_bldg(team, b))
            .map(|b| b.id);
        units.chain(bldgs).collect()
    }
}

/// Each tile (index) of a map of `size` within `s` tiles of world point (x, y), by tile center.
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
