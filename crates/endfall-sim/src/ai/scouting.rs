//! What the AI knows: it plays under fog, remembers what it saw, scouts and sweeps the map.

use super::*;

/// How long (s) the AI remembers the most enemy infantry or heavies it saw at once.
const COMPOSITION_MEMORY: f64 = 90.0;

impl World {
    /// Whether the AI can see a point right now (it plays with fog of war like the player).
    pub(crate) fn ai_sees(&self, x: f64, y: f64) -> bool {
        let (tx, ty) = World::tile_of(x, y);
        self.vis[self.seat() as usize][idx(tx, ty)] != 0
    }

    /// Whether this AI sees enemy unit `u` (in sight, and detected if cloaked).
    pub(crate) fn ai_sees_unit(&self, u: &crate::world::Unit) -> bool {
        self.ai_sees(u.x, u.y) && !self.cloaked_from(self.seat(), u)
    }

    /// Remember player buildings when they come into view, forget them when their spot is seen empty, and note
    /// player flyers.
    pub(crate) fn update_knowledge(&mut self) {
        let t = self.time;
        let seen: Vec<(Id, f64, f64, bool)> = self
            .bldgs
            .iter()
            .filter(|b| {
                b.team == self.foe()
                    && (0..b.h).any(|y| {
                        (0..b.w)
                            .any(|x| self.vis[self.seat() as usize][idx(b.tx + x, b.ty + y)] != 0)
                    })
            })
            .map(|b| (b.id, b.x, b.y, b.kind.def().hq))
            .collect();
        let air_seen = self.units.iter().any(|u| {
            u.team == self.foe() && u.kind.def().air && u.kind.def().armed() && self.ai_sees_unit(u)
        }); // (a scout is no air threat)
        let gone: Vec<Id> = self
            .ai()
            .known
            .iter()
            .filter(|k| self.bldg(k.0).is_none() && self.ai_sees(k.1, k.2))
            .map(|k| k.0)
            .collect();
        // What the enemy fields, as far as it is seen: walking infantry and heavy walkers.
        let (mut inf, mut heavy) = (0, 0);
        for u in self
            .units
            .iter()
            .filter(|u| u.team == self.foe() && self.ai_sees_unit(u))
        {
            let d = u.kind.def();
            if d.air || d.worker || !d.armed() {
                continue;
            }
            if d.bio {
                inf += 1;
            }
            if d.armor >= 2.0 {
                heavy += 1;
            }
        }
        let ai = self.ai_mut();
        for (memo, n) in [(&mut ai.infantry_seen, inf), (&mut ai.heavy_seen, heavy)] {
            if n >= memo.0 || t - memo.1 > COMPOSITION_MEMORY {
                *memo = (n, t);
            }
        }
        for s in seen {
            if !ai.known.iter().any(|k| k.0 == s.0) {
                ai.known.push(s);
            }
        }
        ai.known.retain(|k| !gone.contains(&k.0));
        if air_seen {
            ai.seen_air_until = t + 90.0;
        }
        // Nothing known: once the current sweep point is in view (and still nothing turned up), or after a
        // minute of trying to get there, move on.
        if self.ai().known.is_empty() {
            let (x, y) = self.sweep_point();
            let ai = self.ai();
            if self.ai_sees(x, y) || t - ai.sweep_since > 60.0 {
                let ai = self.ai_mut();
                ai.sweep += 1;
                ai.sweep_since = t;
            }
        } else {
            self.ai_mut().sweep_since = t;
        }
    }

    /// The sweep: the player's start, then every shard field and a coarse grid of open ground, by distance from
    /// the start, round and round.
    pub(crate) fn sweep_point(&self) -> (f64, f64) {
        let start = (
            (self.map.bases[self.foe() as usize].0 as f64 + 2.0) * TILE,
            (self.map.bases[self.foe() as usize].1 as f64 + 2.0) * TILE,
        );
        let mut pts: Vec<(f64, f64)> = self
            .map
            .nodes
            .iter()
            .filter(|n| !n.ether)
            .map(|n| (n.x, n.y))
            .collect();
        // A 6x6 grid from 5 tiles in to 5 tiles from the far edge: every tile lies within sight of a stop.
        let grid = |n: i32| (0..6).map(move |i| 5 + i * (n - 11) / 5);
        for gy in grid(MH) {
            for gx in grid(MW) {
                let open = (-2..=2).flat_map(|dy| (-2..=2).map(move |dx| (gx + dx, gy + dy)));
                if let Some((tx, ty)) = open
                    .filter(|&(x, y)| in_map(x, y) && self.map.rock[idx(x, y)] == 0)
                    .min_by_key(|&(x, y)| (x - gx).abs() + (y - gy).abs())
                {
                    pts.push(((tx as f64 + 0.5) * TILE, (ty as f64 + 0.5) * TILE));
                }
            }
        }
        let key = |p: &(f64, f64)| dist(p.0, p.1, start.0, start.1);
        pts.sort_by(|a, b| {
            key(a)
                .partial_cmp(&key(b))
                .unwrap()
                .then(a.0.partial_cmp(&b.0).unwrap())
                .then(a.1.partial_cmp(&b.1).unwrap())
        });
        // One stop per area: a field's crystals (or a grid point beside them) are a single place to look.
        let mut stops: Vec<(f64, f64)> = Vec::new();
        for p in pts {
            if stops.iter().all(|q| dist(p.0, p.1, q.0, q.1) > 7.0 * TILE) {
                stops.push(p);
            }
        }
        let pts = stops;
        let k = self.ai().sweep % (pts.len() + 1);
        if k == 0 { start } else { pts[k - 1] }
    }

    /// Early on, send one harvester to look at the player's start; bring it back to mining afterwards.
    pub(crate) fn tend_scout(&mut self, harv: &[Id]) {
        let t = self.time;
        let ai = self.ai();
        if !ai.scouted && t >= 70.0 {
            let pick = harv.iter().copied().find(|&h| {
                let u = self.unit(h).unwrap();
                u.carry == 0 && !matches!(u.task, Task::Build { .. } | Task::Repair { .. })
            });
            if let Some(h) = pick {
                let (x, y) = (
                    (self.map.bases[self.foe() as usize].0 as f64 + 2.0) * TILE,
                    (self.map.bases[self.foe() as usize].1 as f64 + 2.0) * TILE,
                );
                self.move_to(h, x, y);
                let ai = self.ai_mut();
                ai.scout = Some(h);
                ai.scouted = true;
            }
            return;
        }
        let Some(s) = ai.scout else { return };
        let Some(u) = self.unit(s) else {
            self.ai_mut().scout = None;
            return;
        };
        // Done once it is idle, has seen the enemy's headquarters, or is already mining again (sent back to work
        // by the worker phase): it is then an ordinary worker again (free to build).
        let gathering = matches!(u.task, Task::Gather { .. });
        let done = gathering || u.task == Task::Idle || self.ai().known.iter().any(|k| k.3);
        if done {
            if !gathering {
                let (x, y) = self.home_of(u.x, u.y);
                if let Some(n) = self.nearest_node(x, y, self.seat(), false, 1200.0) {
                    self.start_gather(s, n);
                }
            }
            self.ai_mut().scout = None;
        }
    }
}
