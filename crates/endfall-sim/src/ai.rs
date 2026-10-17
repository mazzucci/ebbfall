//! The scripted opponent (port of src/sim/ai.js). Runs twice a second: assigns workers, follows a build
//! order, keeps supply ahead, defends its base, and attacks in growing waves. Draws only from the world RNG.

use crate::data::*;
use crate::jsmath::{self, PI, dist};
use crate::map::Id;
use crate::path::Pt;
use crate::world::{Ai, Phase, Task, World};

impl World {
    pub(crate) fn init_ai(&mut self) {
        self.ai = Some(Ai {
            t: 0.0,
            wave: DIFF[self.diff].wave,
            last_wave: -20.0,
            attacking: false,
            attackers: None,
            rally: None,
        });
    }

    fn find_spot(&mut self, kind: BldgKind, cx: f64, cy: f64) -> Option<(i32, i32)> {
        let d = kind.def();
        if d.on_vent {
            let (mut best, mut bd) = (None, 1e9);
            for n in &self.map.nodes {
                if n.ether && n.extractor.is_none() {
                    let dd = jsmath::hypot(n.tx as f64 - cx, n.ty as f64 - cy);
                    if dd < bd && dd < 16.0 {
                        bd = dd;
                        best = Some((n.tx, n.ty));
                    }
                }
            }
            return best;
        }
        let a0 = self.rnd() * PI * 2.0;
        let mut r = 3.5;
        while r < 15.0 {
            for k in 0..20 {
                let a = a0 + k as f64 / 20.0 * PI * 2.0;
                let tx = jsmath::round(cx + jsmath::cos(a) * r - d.w as f64 / 2.0) as i32;
                let ty = jsmath::round(cy + jsmath::sin(a) * r - d.h as f64 / 2.0) as i32;
                if !self.can_place(kind, tx, ty, ENEMY) {
                    continue;
                }
                let (mx, my) = (tx as f64 + d.w as f64 / 2.0, ty as f64 + d.h as f64 / 2.0);
                if self
                    .map
                    .nodes
                    .iter()
                    .all(|n| jsmath::hypot(n.tx as f64 + 0.5 - mx, n.ty as f64 + 0.5 - my) >= 4.5)
                {
                    return Some((tx, ty));
                }
            }
            r += 1.0;
        }
        None
    }

    fn gathering_ether(&self, id: Id) -> Option<bool> {
        match self.unit(id)?.task {
            Task::Gather { node, .. } => Some(self.map.node(node).is_some_and(|n| n.ether)),
            _ => None,
        }
    }

    pub(crate) fn ai_tick(&mut self, dt: f64) {
        let Some(a) = self.ai.as_mut() else { return };
        if self.over {
            return;
        }
        a.t += dt;
        if a.t < 0.5 {
            return;
        }
        a.t = 0.0;
        let d = &DIFF[self.diff];
        let (e, t) = (ENEMY, self.time);
        let my_b: Vec<Id> = self
            .bldgs
            .iter()
            .filter(|b| b.team == e)
            .map(|b| b.id)
            .collect();
        let my_u: Vec<Id> = self
            .units
            .iter()
            .filter(|u| u.team == e)
            .map(|u| u.id)
            .collect();
        let b_of = |w: &World, id: Id| w.bldg(id).unwrap().clone();
        let core = my_b
            .iter()
            .copied()
            .find(|&id| {
                let b = self.bldg(id).unwrap();
                b.kind == BldgKind::Core && b.done
            })
            .or_else(|| {
                my_b.iter()
                    .copied()
                    .find(|&id| self.bldg(id).unwrap().kind == BldgKind::Core)
            });
        let harv: Vec<Id> = my_u
            .iter()
            .copied()
            .filter(|&id| self.unit(id).unwrap().kind == UnitKind::Harvester)
            .collect();
        let army: Vec<Id> = my_u
            .iter()
            .copied()
            .filter(|&id| self.unit(id).unwrap().kind != UnitKind::Harvester)
            .collect();
        let (cx, cy) = match core {
            Some(c) => {
                let c = self.bldg(c).unwrap();
                (
                    c.tx as f64 + c.w as f64 / 2.0,
                    c.ty as f64 + c.h as f64 / 2.0,
                )
            }
            None => (BASES[1].0 as f64 + 2.0, BASES[1].1 as f64 + 2.0),
        };
        let cnt = |w: &World, k: BldgKind| {
            my_b.iter()
                .filter(|&&id| w.bldg(id).unwrap().kind == k)
                .count()
        };
        let done = |w: &World, k: BldgKind| {
            my_b.iter()
                .filter(|&&id| {
                    let b = w.bldg(id).unwrap();
                    b.kind == k && b.done
                })
                .count()
        };
        let building: Vec<BldgKind> = my_b
            .iter()
            .map(|&id| b_of(self, id))
            .filter(|b| !b.done)
            .map(|b| b.kind)
            .collect();
        if self.ai.as_ref().unwrap().rally.is_none() {
            let pb = BASES[0];
            let ang = jsmath::atan2(pb.1 as f64 - cy, pb.0 as f64 - cx);
            let rally = Pt {
                x: (cx + jsmath::cos(ang) * 9.0) * TILE,
                y: (cy + jsmath::sin(ang) * 9.0) * TILE,
            };
            self.ai.as_mut().unwrap().rally = Some(rally);
        }
        let rally = self.ai.as_ref().unwrap().rally.unwrap();

        // Workers: idle ones mine; keep up to three on ether once an extractor stands.
        let ext = my_b.iter().copied().find(|&id| {
            let b = self.bldg(id).unwrap();
            b.kind == BldgKind::Extractor && b.done
        });
        let mut ether = harv
            .iter()
            .filter(|&&h| self.gathering_ether(h) == Some(true))
            .count();
        for &h in &harv {
            if self.unit(h).unwrap().task == Task::Idle {
                let want_ether = ext.is_some() && ether < 3;
                let (hx, hy) = (self.unit(h).unwrap().x, self.unit(h).unwrap().y);
                let n = self
                    .nearest_node(hx, hy, e, want_ether, 800.0)
                    .or_else(|| self.nearest_node(hx, hy, e, false, 1200.0));
                if let Some(n) = n {
                    self.start_gather(h, n);
                    if want_ether {
                        ether += 1;
                    }
                }
            }
        }
        if ext.is_some() && ether < 3 {
            let h = harv.iter().copied().find(|&h| {
                let u = self.unit(h).unwrap();
                self.gathering_ether(h) == Some(false)
                    && !matches!(
                        u.task,
                        Task::Gather {
                            phase: Phase::Mine,
                            ..
                        }
                    )
                    && u.carry == 0
            });
            if let Some(h) = h {
                let (hx, hy) = (self.unit(h).unwrap().x, self.unit(h).unwrap().y);
                if let Some(n) = self.nearest_node(hx, hy, e, true, 800.0) {
                    self.start_gather(h, n);
                }
            }
        }

        // Economy and build order.
        let queued_h: usize = my_b
            .iter()
            .map(|&id| {
                self.bldg(id)
                    .unwrap()
                    .queue
                    .iter()
                    .filter(|&&q| q == UnitKind::Harvester)
                    .count()
            })
            .sum();
        if let Some(c) = core {
            let cb = self.bldg(c).unwrap();
            if cb.done && harv.len() + queued_h < d.harv && cb.queue.is_empty() {
                let _ = self.queue_unit(c, UnitKind::Harvester);
            }
        }
        let [used, cap] = self.sup[e as usize];
        let want = if cap - used <= 4 && cap < 200 && !building.contains(&BldgKind::Depot) {
            Some(BldgKind::Depot)
        } else if harv.len() >= 7 && cnt(self, BldgKind::Extractor) == 0 {
            Some(BldgKind::Extractor)
        } else if cnt(self, BldgKind::Barracks)
            < d.rax + (t > 300.0) as usize + (t > 540.0) as usize
        {
            Some(BldgKind::Barracks)
        } else if done(self, BldgKind::Barracks) >= 1
            && ext.is_some()
            && cnt(self, BldgKind::Forge) == 0
            && t > 150.0
        {
            Some(BldgKind::Forge)
        } else if done(self, BldgKind::Barracks) >= 1
            && cnt(self, BldgKind::Turret) < (t > 240.0) as usize + (t > 480.0) as usize
        {
            Some(BldgKind::Turret)
        } else {
            None
        };
        if let Some(w) = want
            && building.len() < 2
            && self.has_req(e, w)
            && self.can_afford(e, w.def().cost)
            && let Some(spot) = self.find_spot(w, cx, cy)
        {
            let (sx, sy) = (spot.0 as f64 * TILE, spot.1 as f64 * TILE);
            let mut best: Option<(f64, Id)> = None;
            for &h in &harv {
                let u = self.unit(h).unwrap();
                if matches!(u.task, Task::Build { .. }) || u.carry != 0 {
                    continue;
                }
                let dd = dist(u.x, u.y, sx, sy);
                if best.is_none_or(|(bd, _)| dd < bd) {
                    best = Some((dd, h));
                }
            }
            if let Some((_, b)) = best {
                let _ = self.place_building(e, w, spot.0, spot.1, Some(b));
            }
        }

        // Production.
        for &bid in &my_b {
            let b = self.bldg(bid).unwrap();
            let Some(u) = b.kind.def().trains else {
                continue;
            };
            if !b.done || b.kind == BldgKind::Core {
                continue;
            }
            let qlen = b.queue.len();
            if b.rally.is_none() {
                self.set_rally(bid, rally.x, rally.y, None);
            }
            if qlen < 2 {
                let c = u.def().cost;
                if self.can_afford(e, c)
                    && (want != Some(BldgKind::Depot) || self.res[e as usize][0] > c[0] + 100)
                {
                    let _ = self.queue_unit(bid, u);
                }
            }
        }

        // Defense: anything near our buildings gets jumped by the idle army.
        let mut intruder = None;
        'outer: for u in &self.units {
            if u.team != PLAYER {
                continue;
            }
            for &bid in &my_b {
                let b = self.bldg(bid).unwrap();
                if dist(u.x, u.y, b.x, b.y) < 420.0 + b.r {
                    intruder = Some(u.id);
                    break 'outer;
                }
            }
        }
        if let Some(intr) = intruder {
            for &a in &army {
                let u = self.unit(a).unwrap();
                let go = match u.task {
                    Task::Idle | Task::Move { .. } => true,
                    Task::AMove { .. } => dist(u.x, u.y, rally.x, rally.y) < 300.0,
                    _ => false,
                };
                if go {
                    self.attack_ent(a, intr);
                }
            }
        }

        // Waves.
        let p_build: Vec<Id> = self
            .bldgs
            .iter()
            .filter(|b| b.team == PLAYER)
            .map(|b| b.id)
            .collect();
        let ai = self.ai.as_ref().unwrap();
        if !p_build.is_empty() && army.len() >= ai.wave && t - ai.last_wave > d.gap && t > d.first {
            let ai = self.ai.as_mut().unwrap();
            ai.last_wave = t;
            ai.wave += d.wave_grow;
            ai.attacking = true;
            let tgt = p_build
                .iter()
                .copied()
                .find(|&id| self.bldg(id).unwrap().kind == BldgKind::Core)
                .unwrap_or(p_build[0]);
            let (gx, gy) = (self.bldg(tgt).unwrap().x, self.bldg(tgt).unwrap().y);
            for &a in &army {
                let ox = (self.rnd() - 0.5) * 80.0;
                let oy = (self.rnd() - 0.5) * 80.0;
                self.attack_move(a, gx + ox, gy + oy);
            }
            self.ai.as_mut().unwrap().attackers = Some(army.clone());
        }
        let ai = self.ai.as_ref().unwrap();
        if ai.attacking && ai.attackers.is_some() {
            let attackers = ai.attackers.clone().unwrap();
            let alive: Vec<Id> = army
                .iter()
                .copied()
                .filter(|a| attackers.contains(a))
                .collect();
            if alive.is_empty() {
                self.ai.as_mut().unwrap().attacking = false;
            } else {
                for a in alive {
                    let u = self.unit(a).unwrap();
                    if u.task != Task::Idle || p_build.is_empty() {
                        continue;
                    }
                    let (ux, uy) = (u.x, u.y);
                    let (mut best, mut bd) = (p_build[0], 1e9);
                    for &b in &p_build {
                        let bb = self.bldg(b).unwrap();
                        let dd = dist(ux, uy, bb.x, bb.y);
                        if dd < bd {
                            bd = dd;
                            best = b;
                        }
                    }
                    if bd < 700.0 {
                        self.attack_ent(a, best);
                    } else {
                        let (bx, by) = (self.bldg(best).unwrap().x, self.bldg(best).unwrap().y);
                        self.attack_move(a, bx, by);
                    }
                }
            }
        } else {
            for &a in &army {
                let u = self.unit(a).unwrap();
                if u.task == Task::Idle && dist(u.x, u.y, rally.x, rally.y) > 160.0 {
                    let ox = (self.rnd() - 0.5) * 120.0;
                    let oy = (self.rnd() - 0.5) * 120.0;
                    self.move_to(a, rally.x + ox, rally.y + oy);
                }
            }
        }
        self.recalc_supply(e);
    }
}
