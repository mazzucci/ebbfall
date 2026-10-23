//! The scripted opponent. Runs twice a second: assigns workers, follows a build order, keeps supply ahead,
//! expands, defends its base, raids with Wasps and attacks in growing waves. It plays under fog of war: it
//! scouts, remembers the player buildings it has seen and sweeps the map when it knows of none. Draws only
//! from the world RNG.

use crate::data::*;
use crate::jsmath::{self, PI, dist};
use crate::map::{Id, idx, in_map};
use crate::path::Pt;
use crate::world::{Ai, Phase, Task, World};

impl World {
    /// Switch the opponent off (tests of the player's own abilities should not race the AI's attacks).
    pub fn disable_ai(&mut self) {
        self.ai = None;
    }

    /// The units of the AI's current attack wave, if one is out (tests and tools).
    pub fn ai_wave(&self) -> Option<Vec<Id>> {
        self.ai
            .as_ref()
            .filter(|a| a.attacking)
            .and_then(|a| a.attackers.clone())
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
            saving_since: None,
            no_save_until: 0.0,
            known: Vec::new(),
            seen_air_until: -1.0,
            scout: None,
            scouted: false,
            raiders: Vec::new(),
            wave_size: 0,
            sweep: 0,
            sweep_since: 0.0,
            ether_lean: false,
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
            if matches!(u.task, Task::Build { .. } | Task::Repair { .. })
                || u.carry != 0
                || u.no_build_until > self.time
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

    /// Whether the AI can see a point right now (it plays with fog of war like the player).
    fn ai_sees(&self, x: f64, y: f64) -> bool {
        let (tx, ty) = World::tile_of(x, y);
        self.vis[ENEMY as usize][idx(tx, ty)] != 0
    }

    /// Remember player buildings when they come into view, forget them when their spot is seen empty, and note
    /// player flyers.
    fn update_knowledge(&mut self) {
        let t = self.time;
        let seen: Vec<(Id, f64, f64, bool)> = self
            .bldgs
            .iter()
            .filter(|b| {
                b.team == PLAYER
                    && (0..b.h).any(|y| {
                        (0..b.w).any(|x| self.vis[ENEMY as usize][idx(b.tx + x, b.ty + y)] != 0)
                    })
            })
            .map(|b| (b.id, b.x, b.y, b.kind == BldgKind::Core))
            .collect();
        let air_seen = self
            .units
            .iter()
            .any(|u| u.team == PLAYER && u.kind.def().air && self.ai_sees(u.x, u.y));
        let gone: Vec<Id> = self
            .ai
            .as_ref()
            .unwrap()
            .known
            .iter()
            .filter(|k| self.bldg(k.0).is_none() && self.ai_sees(k.1, k.2))
            .map(|k| k.0)
            .collect();
        let ai = self.ai.as_mut().unwrap();
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
        if self.ai.as_ref().unwrap().known.is_empty() {
            let (x, y) = self.sweep_point();
            let ai = self.ai.as_ref().unwrap();
            if self.ai_sees(x, y) || t - ai.sweep_since > 60.0 {
                let ai = self.ai.as_mut().unwrap();
                ai.sweep += 1;
                ai.sweep_since = t;
            }
        } else {
            self.ai.as_mut().unwrap().sweep_since = t;
        }
    }

    /// The sweep: the player's start, then every shard field and a coarse grid of open ground, by distance from
    /// the start, round and round.
    fn sweep_point(&self) -> (f64, f64) {
        let start = (
            (self.map.bases[0].0 as f64 + 2.0) * TILE,
            (self.map.bases[0].1 as f64 + 2.0) * TILE,
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
        let k = self.ai.as_ref().unwrap().sweep % (pts.len() + 1);
        if k == 0 { start } else { pts[k - 1] }
    }

    /// The point our nearest finished Core stands on (where harvesters should mine), else the given point.
    fn home_of(&self, x: f64, y: f64) -> (f64, f64) {
        self.bldgs
            .iter()
            .filter(|b| b.team == ENEMY && b.kind == BldgKind::Core && b.done)
            .min_by(|a, b| {
                dist(a.x, a.y, x, y)
                    .partial_cmp(&dist(b.x, b.y, x, y))
                    .unwrap()
                    .then(a.id.cmp(&b.id))
            })
            .map_or((x, y), |b| (b.x, b.y))
    }

    /// Where the AI thinks the player is: a known core, else any known building, else the next sweep point.
    fn attack_target(&self) -> (f64, f64) {
        let ai = self.ai.as_ref().unwrap();
        if let Some(k) = ai.known.iter().find(|k| k.3).or(ai.known.first()) {
            return (k.1, k.2);
        }
        self.sweep_point()
    }

    /// Early on, send one harvester to look at the player's start; bring it back to mining afterwards.
    fn tend_scout(&mut self, harv: &[Id]) {
        let t = self.time;
        let ai = self.ai.as_ref().unwrap();
        if !ai.scouted && t >= 70.0 {
            let pick = harv.iter().copied().find(|&h| {
                let u = self.unit(h).unwrap();
                u.carry == 0 && !matches!(u.task, Task::Build { .. } | Task::Repair { .. })
            });
            if let Some(h) = pick {
                let (x, y) = (
                    (self.map.bases[0].0 as f64 + 2.0) * TILE,
                    (self.map.bases[0].1 as f64 + 2.0) * TILE,
                );
                self.move_to(h, x, y);
                let ai = self.ai.as_mut().unwrap();
                ai.scout = Some(h);
                ai.scouted = true;
            }
            return;
        }
        let Some(s) = ai.scout else { return };
        let Some(u) = self.unit(s) else {
            self.ai.as_mut().unwrap().scout = None;
            return;
        };
        let done = u.task == Task::Idle || self.ai.as_ref().unwrap().known.iter().any(|k| k.3);
        if done && !matches!(u.task, Task::Gather { .. }) {
            let (x, y) = self.home_of(u.x, u.y);
            if let Some(n) = self.nearest_node(x, y, ENEMY, false, 1200.0) {
                self.start_gather(s, n);
            }
            self.ai.as_mut().unwrap().scout = None;
        }
    }

    /// Wasps (two or more) raid the player's harvesters; badly hurt ones fly home.
    fn tend_raiders(&mut self, wasps: &[Id], rally: Pt) {
        let mut raiders: Vec<Id> = self
            .ai
            .as_ref()
            .unwrap()
            .raiders
            .iter()
            .copied()
            .filter(|&r| self.unit(r).is_some())
            .collect();
        let healthy = |w: &World, id: Id| w.unit(id).is_some_and(|u| u.hp >= u.maxhp * 0.4);
        if raiders.is_empty() {
            let fit: Vec<Id> = wasps
                .iter()
                .copied()
                .filter(|&id| healthy(self, id))
                .collect();
            if fit.len() >= 2 {
                raiders = fit.into_iter().take(4).collect();
            }
        }
        let (tx, ty) = self.attack_target();
        let mut keep = Vec::new();
        for r in raiders {
            let u = self.unit(r).unwrap();
            if !healthy(self, r) {
                // Home to defend, once: it leaves the raid and joins the army (no one heals machines).
                self.move_to(r, rally.x, rally.y);
                continue;
            }
            keep.push(r);
            let (ux, uy, idle) = (u.x, u.y, u.task == Task::Idle);
            let hunting = matches!(u.task, Task::Attack { target, .. }
                if self.unit(target).is_some_and(|t| t.kind == UnitKind::Harvester));
            if hunting {
                continue;
            }
            let prey = self
                .units
                .iter()
                .filter(|o| {
                    o.team == PLAYER && o.kind == UnitKind::Harvester && self.ai_sees(o.x, o.y)
                })
                .min_by(|a, b| {
                    dist(a.x, a.y, ux, uy)
                        .partial_cmp(&dist(b.x, b.y, ux, uy))
                        .unwrap()
                })
                .map(|o| o.id);
            // Harvesters come first: a raider drops whatever it auto-targeted on the way once it sees one.
            match prey {
                Some(p) => self.attack_ent(r, p),
                None if idle => self.attack_move(r, tx, ty),
                None => {}
            }
        }
        self.ai.as_mut().unwrap().raiders = keep;
    }

    /// A spot for a second Core: by a shard field away from both bases, nearest to our main core.
    fn expansion_spot(&self, cx: f64, cy: f64) -> Option<(i32, i32)> {
        let (px, py) = (
            self.map.bases[0].0 as f64 + 2.0,
            self.map.bases[0].1 as f64 + 2.0,
        );
        let mut fields: Vec<(f64, i32, i32)> = self
            .map
            .nodes
            .iter()
            .filter(|n| !n.ether && n.amount > 300)
            .filter(|n| {
                jsmath::hypot(n.tx as f64 - cx, n.ty as f64 - cy) > 12.0
                    && jsmath::hypot(n.tx as f64 - px, n.ty as f64 - py) > 22.0
            })
            .map(|n| {
                (
                    jsmath::hypot(n.tx as f64 - cx, n.ty as f64 - cy),
                    n.tx,
                    n.ty,
                )
            })
            .collect();
        fields.sort_by(|a, b| {
            a.0.partial_cmp(&b.0)
                .unwrap()
                .then((a.1, a.2).cmp(&(b.1, b.2)))
        });
        for &(_, nx, ny) in fields.iter().take(6) {
            for r in 4..10 {
                for k in 0..16 {
                    let a = k as f64 / 16.0 * PI * 2.0;
                    let tx = jsmath::round(nx as f64 + jsmath::cos(a) * r as f64 - 2.0) as i32;
                    let ty = jsmath::round(ny as f64 + jsmath::sin(a) * r as f64 - 2.0) as i32;
                    if self.can_place(BldgKind::Core, tx, ty, ENEMY)
                        && self.walkway_around(tx, ty, 4, 4)
                        && self.map.nodes.iter().all(|n| {
                            jsmath::hypot(
                                n.tx as f64 + 0.5 - (tx as f64 + 2.0),
                                n.ty as f64 + 0.5 - (ty as f64 + 2.0),
                            ) >= 3.5
                        })
                    {
                        return Some((tx, ty));
                    }
                }
            }
        }
        None
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
        self.update_knowledge();
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
            None => (
                self.map.bases[1].0 as f64 + 2.0,
                self.map.bases[1].1 as f64 + 2.0,
            ),
        };
        let cnt = |w: &World, k: BldgKind| {
            my_b.iter()
                .filter(|&&id| w.bldg(id).is_some_and(|b| b.kind == k))
                .count()
        };
        let done = |w: &World, k: BldgKind| {
            my_b.iter()
                .filter(|&&id| w.bldg(id).is_some_and(|b| b.kind == k && b.done))
                .count()
        };
        let building: Vec<BldgKind> = my_b
            .iter()
            .map(|&id| b_of(self, id))
            .filter(|b| !b.done)
            .map(|b| b.kind)
            .collect();
        if self.ai.as_ref().unwrap().rally.is_none() {
            let pb = self.map.bases[0];
            let ang = jsmath::atan2(pb.1 as f64 - cy, pb.0 as f64 - cx);
            let rally = Pt {
                x: (cx + jsmath::cos(ang) * 9.0) * TILE,
                y: (cy + jsmath::sin(ang) * 9.0) * TILE,
            };
            self.ai.as_mut().unwrap().rally = Some(rally);
        }
        let rally = self.ai.as_ref().unwrap().rally.unwrap();

        // Workers: idle ones mine; keep up to three on ether once an extractor stands, one while ether piles up.
        let ext = my_b.iter().copied().find(|&id| {
            let b = self.bldg(id).unwrap();
            b.kind == BldgKind::Extractor && b.done
        });
        let mut ether = harv
            .iter()
            .filter(|&&h| self.gathering_ether(h) == Some(true))
            .count();
        let stock = self.res[e as usize][1];
        let ai = self.ai.as_mut().unwrap();
        if stock > 400 {
            ai.ether_lean = true;
        } else if stock < 250 {
            ai.ether_lean = false;
        }
        let ether_cap = if ai.ether_lean { 1 } else { 3 };
        for &h in &harv {
            if self.unit(h).unwrap().task == Task::Idle {
                let want_ether = ext.is_some() && ether < ether_cap;
                let u = self.unit(h).unwrap();
                let (hx, hy) = self.home_of(u.x, u.y); // never the player's fields
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
        if ether > ether_cap {
            let h = harv.iter().copied().find(|&h| {
                self.gathering_ether(h) == Some(true) && self.unit(h).unwrap().carry == 0
            });
            if let Some(h) = h {
                let (hx, hy) = (self.unit(h).unwrap().x, self.unit(h).unwrap().y);
                if let Some(n) = self.nearest_node(hx, hy, e, false, 1200.0) {
                    self.start_gather(h, n);
                }
            }
        } else if ext.is_some() && ether < ether_cap {
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
        let cores: Vec<Id> = my_b
            .iter()
            .copied()
            .filter(|&id| {
                self.bldg(id)
                    .is_some_and(|b| b.kind == BldgKind::Core && b.done)
            })
            .collect();
        let harv_target = d.harv + 5 * cores.len().saturating_sub(1);
        let mut queued = queued_h;
        for &c in &cores {
            if harv.len() + queued < harv_target
                && self.bldg(c).unwrap().queue.is_empty()
                && self.queue_unit(c, UnitKind::Harvester).is_ok()
            {
                queued += 1;
            }
        }
        // An expansion gets harvesters from the main base until five work its fields.
        if let Some(&exp) = cores.get(1) {
            let (ex, ey) = (self.bldg(exp).unwrap().x, self.bldg(exp).unwrap().y);
            let near_exp = |w: &World, h: Id| match w.unit(h).map(|u| u.task) {
                Some(Task::Gather { node, .. }) => w
                    .map
                    .node(node)
                    .is_some_and(|n| dist(n.x, n.y, ex, ey) < 400.0), // the radius it assigns within
                _ => false,
            };
            let working = harv.iter().filter(|&&h| near_exp(self, h)).count();
            if working < 5 && harv.len() >= 8 {
                let mover = harv.iter().copied().find(|&h| {
                    let u = self.unit(h).unwrap();
                    !near_exp(self, h)
                        && u.carry == 0
                        && matches!(
                            u.task,
                            Task::Gather {
                                phase: Phase::Go | Phase::Wait,
                                ..
                            }
                        )
                });
                if let (Some(h), Some(n)) = (mover, self.nearest_node(ex, ey, e, false, 400.0)) {
                    self.start_gather(h, n);
                }
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
        // A second base, outside the build order above: the AI saves up for it (see research) and places it
        // even while supply depots go up.
        let exp_spot = if self.diff >= 1
            && t > [f64::MAX, 420.0, 330.0][self.diff]
            && cnt(self, BldgKind::Core) < 2
            && harv.len() + 2 >= d.harv
        {
            self.expansion_spot(cx, cy)
        } else {
            None
        };
        let expand = exp_spot.is_some(); // nowhere to go: no saving, research carries on
        if let Some(spot) = exp_spot
            && self.can_afford(e, BldgKind::Core.def().cost)
        {
            let (sx, sy) = (spot.0 as f64 * TILE, spot.1 as f64 * TILE);
            if let Some(b) = self.free_builder(&harv, sx, sy) {
                let _ = self.place_building(e, BldgKind::Core, spot.0, spot.1, Some(b));
            }
        }
        self.tend_sites(&harv);
        self.tend_scout(&harv);
        // tend_sites may have cancelled sites: every building id from here on must still exist.
        let my_b: Vec<Id> = my_b
            .iter()
            .copied()
            .filter(|&id| self.bldg(id).is_some())
            .collect();

        // An enemy near our buildings (answered by the army below; also stops saving for research).
        let mut intruder = None;
        'scan: for u in &self.units {
            if u.team != PLAYER || !self.ai_sees(u.x, u.y) {
                continue;
            }
            for &bid in &my_b {
                let b = self.bldg(bid).unwrap();
                if dist(u.x, u.y, b.x, b.y) < 420.0 + b.r {
                    intruder = Some(u.id);
                    break 'scan;
                }
            }
        }
        // Repairs once the fighting at home is over: one harvester on the worst-hit building at a time.
        if intruder.is_none()
            && !self
                .units
                .iter()
                .any(|u| u.team == e && matches!(u.task, Task::Repair { .. }))
        {
            let worst = my_b
                .iter()
                .filter_map(|&id| self.bldg(id))
                .filter(|b| b.done && b.hp < b.maxhp * 0.7)
                // with a little money in hand for it (else harvester after harvester walks over and gives up)
                .filter(|b| {
                    let c = b.kind.def().cost;
                    self.can_afford(e, [c[0].min(10), c[1].min(10)])
                })
                .min_by(|p, q| {
                    (p.hp / p.maxhp)
                        .partial_cmp(&(q.hp / q.maxhp))
                        .unwrap()
                        .then(p.id.cmp(&q.id))
                })
                .map(|b| (b.id, b.x, b.y));
            if let Some((bid, bx, by)) = worst
                && let Some(h) = self.free_builder(&harv, bx, by)
            {
                self.start_repair(h, bid);
            }
        }
        let seen_air = self
            .units
            .iter()
            .filter(|u| u.team == PLAYER && u.kind.def().air && self.ai_sees(u.x, u.y))
            .count();
        let enemy_air = if t < self.ai.as_ref().unwrap().seen_air_until {
            seen_air.max(2)
        } else {
            seen_air
        };
        let lancers = self
            .units
            .iter()
            .filter(|u| u.team == e && u.kind == UnitKind::Lancer)
            .count();

        // Research: weapons and armor in turn, starting earlier on harder levels, once any expansion is down.
        // Until it can afford the next level it saves up (no new units), but never while under attack or short
        // of Lancers against flyers, and for at most SAVE_MAX seconds at a time.
        const SAVE_MAX: f64 = 45.0;
        let research_from = [600.0, 420.0, 300.0][self.diff];
        let threatened = intruder.is_some() || (enemy_air > 0 && lancers < enemy_air * 2);
        let mut saving = false;
        if t > research_from && !expand {
            for &bid in &my_b {
                let Some(b) = self.bldg(bid) else { continue };
                if b.kind != BldgKind::Forge || !b.done || b.research.is_some() {
                    continue;
                }
                let [wl, al] = self.upgrades[e as usize];
                let order = if wl <= al {
                    [Upgrade::Weapons, Upgrade::Armor]
                } else {
                    [Upgrade::Armor, Upgrade::Weapons]
                };
                let busy = |w: &World, up: Upgrade| {
                    w.bldgs
                        .iter()
                        .any(|o| o.team == e && o.research.is_some_and(|(u, _)| u == up))
                };
                let Some(up) = order.into_iter().find(|&up| {
                    self.upgrades[e as usize][up.index()] < MAX_UPGRADE && !busy(self, up)
                }) else {
                    continue;
                };
                let level = self.upgrades[e as usize][up.index()] + 1;
                if self.can_afford(e, up.cost(level)) {
                    let _ = self.start_research(bid, up);
                } else {
                    saving = true;
                }
            }
        }
        // Saving up for an expansion works the same way.
        if expand && !self.can_afford(e, BldgKind::Core.def().cost) {
            saving = true;
        }
        let ai = self.ai.as_mut().unwrap();
        if saving && !threatened && t >= ai.no_save_until {
            let since = *ai.saving_since.get_or_insert(t);
            if t - since > SAVE_MAX {
                ai.saving_since = None;
                ai.no_save_until = t + 30.0; // spend for a while before saving again
                saving = false;
            }
        } else {
            ai.saving_since = None;
            saving = false;
        }

        // Production. Barracks answer enemy flyers (as far as the AI knows) with Lancers, bring a Medic per six
        // Troopers and, once the Forge stands, a Vanguard per two.
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
            let Some(b) = self.bldg(bid) else { continue };
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
                // A Vanguard per two Troopers once the Forge stands: the mix that beats massed infantry.
                BldgKind::Barracks
                    if done(self, BldgKind::Forge) >= 1
                        && (mine(self, UnitKind::Vanguard) + 1) * 2
                            <= mine(self, UnitKind::Trooper) =>
                {
                    UnitKind::Vanguard
                }
                BldgKind::Airfield if mine(self, UnitKind::Wasp) >= 6 => continue,
                _ => b.kind.def().trains[0],
            };
            // Short of ether for the specialist? Troopers (shards only) rather than an idle barracks. Short of
            // shards it waits for them instead, as a Trooper would only delay the specialist.
            let u = if self.res[e as usize][1] >= u.def().cost[1] {
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

        // Wasp raids on the player's harvesters (raiders stay out of the waves).
        let wasps: Vec<Id> = army
            .iter()
            .copied()
            .filter(|&a| self.unit(a).is_some_and(|u| u.kind == UnitKind::Wasp))
            .collect();
        self.tend_raiders(&wasps, rally);
        let raiders = self.ai.as_ref().unwrap().raiders.clone();
        let army: Vec<Id> = army.into_iter().filter(|a| !raiders.contains(a)).collect();

        // Waves go where the AI believes the player is (it scouts and remembers; it does not see through fog).
        let (gx, gy) = self.attack_target();
        let ai = self.ai.as_ref().unwrap();
        if !ai.attacking && army.len() >= ai.wave && t - ai.last_wave > d.gap && t > d.first {
            let ai = self.ai.as_mut().unwrap();
            ai.last_wave = t;
            ai.wave += d.wave_grow;
            ai.attacking = true;
            ai.wave_size = army.len();
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
            let wave_size = ai.wave_size;
            // A wave that has searched for four minutes without finding anything comes home to regroup.
            let lost = ai.known.is_empty() && t - ai.last_wave > 240.0;
            let alive: Vec<Id> = army
                .iter()
                .copied()
                .filter(|a| attackers.contains(a))
                .collect();
            if alive.is_empty() {
                self.ai.as_mut().unwrap().attacking = false;
            } else if lost || (wave_size >= 4 && alive.len() * 10 < wave_size * 4) {
                // Lost most of the wave: pull the survivors back instead of feeding them in one by one.
                for a in alive {
                    let ox = (self.rnd() - 0.5) * 120.0;
                    let oy = (self.rnd() - 0.5) * 120.0;
                    self.move_to(a, rally.x + ox, rally.y + oy);
                }
                let ai = self.ai.as_mut().unwrap();
                ai.attacking = false;
                ai.attackers = None;
                ai.last_wave = t;
            } else {
                let known: Vec<(Id, f64, f64)> = self
                    .ai
                    .as_ref()
                    .unwrap()
                    .known
                    .iter()
                    .map(|k| (k.0, k.1, k.2))
                    .collect();
                for a in alive {
                    let u = self.unit(a).unwrap();
                    if u.task != Task::Idle {
                        continue;
                    }
                    let (ux, uy) = (u.x, u.y);
                    let best = known
                        .iter()
                        .filter(|k| self.bldg(k.0).is_some())
                        .min_by(|p, q| {
                            dist(ux, uy, p.1, p.2)
                                .partial_cmp(&dist(ux, uy, q.1, q.2))
                                .unwrap()
                        });
                    match best {
                        Some(&(b, bx, by)) if dist(ux, uy, bx, by) < 700.0 => self.engage(a, b),
                        Some(&(_, bx, by)) => self.attack_move(a, bx, by),
                        // Nothing known left: sweep the player's start, then the shard fields around it.
                        None => self.attack_move(a, gx, gy),
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
