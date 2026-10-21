//! The scripted opponent (port of src/sim/ai.js). Runs twice a second: assigns workers, follows a build
//! order, keeps supply ahead, defends its base, and attacks in growing waves. Draws only from the world RNG.

use crate::data::*;
use crate::jsmath::{self, PI, dist};
use crate::map::Id;
use crate::path::Pt;
use crate::world::{Ai, Phase, Task, World};

impl World {
    /// Switch the opponent off (tests of the player's own abilities should not race the AI's attacks).
    pub fn disable_ai(&mut self) {
        self.ai = None;
    }

    pub(crate) fn init_ai(&mut self) {
        self.ai = Some(Ai {
            t: 0.0,
            wave: DIFF[self.diff].wave,
            last_wave: -20.0,
            attacking: false,
            attackers: None,
            rally: None,
            sites: Vec::new(),
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
                if !self.can_place(kind, tx, ty, ENEMY) || !self.walkway_around(tx, ty, d.w, d.h) {
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

    /// The AI keeps a free one-tile walkway around everything it builds, so it never walls its own units in.
    fn walkway_around(&self, tx: i32, ty: i32, w: i32, h: i32) -> bool {
        for y in -1..=h {
            for x in -1..=w {
                if x >= 0 && y >= 0 && x < w && y < h {
                    continue;
                }
                let (xx, yy) = (tx + x, ty + y);
                if !crate::map::in_map(xx, yy) || self.map.blocked(xx, yy) {
                    return false;
                }
            }
        }
        true
    }

    /// The nearest harvester that is free to build: not carrying, not already building, not just failed to reach a site.
    fn free_builder(&self, harv: &[Id], x: f64, y: f64) -> Option<Id> {
        let mut best: Option<(f64, Id)> = None;
        for &h in harv {
            let u = self.unit(h).unwrap();
            if matches!(u.task, Task::Build { .. }) || u.carry != 0 || u.no_build_until > self.time
            {
                continue;
            }
            let dd = dist(u.x, u.y, x, y);
            if best.is_none_or(|(bd, _)| dd < bd) {
                best = Some((dd, h));
            }
        }
        best.map(|(_, h)| h)
    }

    /// Keep construction moving: give unattended sites a builder, cancel sites that have not advanced for a minute.
    fn tend_sites(&mut self, harv: &[Id]) {
        let t = self.time;
        let open: Vec<(Id, f64, f64, f64)> = self
            .bldgs
            .iter()
            .filter(|b| b.team == ENEMY && !b.done)
            .map(|b| (b.id, b.progress, b.x, b.y))
            .collect();
        let mut sites = std::mem::take(&mut self.ai.as_mut().unwrap().sites);
        sites.retain(|s| open.iter().any(|o| o.0 == s.0));
        for &(id, progress, x, y) in &open {
            match sites.iter_mut().find(|s| s.0 == id) {
                Some(s) if progress > s.1 + 1e-9 => {
                    s.1 = progress;
                    s.2 = t;
                }
                Some(s) if t - s.2 > 60.0 => {
                    self.cancel_construction(id);
                    continue;
                }
                Some(_) => {}
                None => sites.push((id, progress, t)),
            }
            let attended = self.units.iter().any(|u| u.task == (Task::Build { b: id }));
            if !attended && let Some(h) = self.free_builder(harv, x, y) {
                self.start_build(h, id);
            }
        }
        sites.retain(|s| self.bldg(s.0).is_some());
        self.ai.as_mut().unwrap().sites = sites;
    }

    /// Attack a target if this unit's weapon can hit it, otherwise attack-move to where it is.
    fn engage(&mut self, a: Id, target: Id) {
        if self.can_hit(a, target) {
            self.attack_ent(a, target);
        } else if let Some((x, y)) = self.geo(target).map(|g| g.center()) {
            self.attack_move(a, x, y);
        }
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
        } else if self.diff >= 1
            && done(self, BldgKind::Forge) >= 1
            && cnt(self, BldgKind::Airfield) == 0
            && t > 330.0
        {
            Some(BldgKind::Airfield)
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
            if let Some(b) = self.free_builder(&harv, sx, sy) {
                let _ = self.place_building(e, w, spot.0, spot.1, Some(b));
            }
        }
        self.tend_sites(&harv);

        // Research comes first: weapons and armor in turn, starting earlier on harder levels. Until it can
        // afford the next level it saves up (no new units) so production does not eat every shard.
        let research_from = [600.0, 420.0, 300.0][self.diff];
        let mut saving = false;
        if t > research_from {
            for &bid in &my_b {
                let b = self.bldg(bid).unwrap();
                if b.kind != BldgKind::Forge || !b.done || b.research.is_some() {
                    continue;
                }
                let [wl, al] = self.upgrades[e as usize];
                let up = if wl <= al {
                    Upgrade::Weapons
                } else {
                    Upgrade::Armor
                };
                let level = self.upgrades[e as usize][up.index()] + 1;
                if level > MAX_UPGRADE
                    || self
                        .bldgs
                        .iter()
                        .any(|o| o.team == e && o.research.is_some_and(|(u, _)| u == up))
                {
                    continue;
                }
                if self.can_afford(e, up.cost(level)) {
                    let _ = self.start_research(bid, up);
                } else {
                    saving = true;
                }
            }
        }

        // Production. Barracks answer enemy flyers with Lancers and bring a Medic per six Troopers.
        let enemy_air = self
            .units
            .iter()
            .filter(|u| u.team == PLAYER && u.kind.def().air)
            .count();
        let mine = |w: &World, k: UnitKind| {
            w.units
                .iter()
                .filter(|u| u.team == e && u.kind == k)
                .count()
                + w.bldgs
                    .iter()
                    .filter(|b| b.team == e)
                    .flat_map(|b| b.queue.iter())
                    .filter(|&&q| q == k)
                    .count()
        };
        for &bid in &my_b {
            let b = self.bldg(bid).unwrap();
            if !b.done || b.kind == BldgKind::Core || b.kind.def().trains.is_empty() {
                continue;
            }
            let u = match b.kind {
                BldgKind::Barracks
                    if enemy_air > 0 && mine(self, UnitKind::Lancer) < enemy_air * 2 =>
                {
                    UnitKind::Lancer
                }
                BldgKind::Barracks
                    if done(self, BldgKind::Forge) >= 1
                        && (mine(self, UnitKind::Medic) + 1) * 6
                            <= mine(self, UnitKind::Trooper) =>
                {
                    UnitKind::Medic
                }
                BldgKind::Airfield if mine(self, UnitKind::Wasp) >= 6 => continue,
                _ => b.kind.def().trains[0],
            };
            // Short of ether for the specialist? Troopers (shards only) rather than an idle barracks.
            let u = if self.can_afford(e, u.def().cost) {
                u
            } else {
                b.kind.def().trains[0]
            };
            let qlen = b.queue.len();
            if b.rally.is_none() {
                self.set_rally(bid, rally.x, rally.y, None);
            }
            if qlen < 2 && !saving {
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
                if go && self.can_hit(a, intr) {
                    self.attack_ent(a, intr); // units that cannot hit it (a flyer, say) are not dragged around
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
                        self.engage(a, best);
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
