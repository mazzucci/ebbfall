//! The AI's build order and expansion: what to build next, where, and by whom; tending its sites.

use super::*;

/// Unspent shards the AI counts as piling up (it then adds a factory).
const SHARD_FLOAT: i32 = 400;

impl World {
    pub(crate) fn find_spot(&mut self, kind: BldgKind, cx: f64, cy: f64) -> Option<(i32, i32)> {
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
                if !self.can_place(kind, tx, ty, self.seat())
                    || !self.walkway_around(tx, ty, d.w, d.h)
                {
                    continue;
                }
                // Clear of the fields (not in the harvesters' way): a building's centre this far from every crystal
                // and vent, a little farther for a big one.
                let (mx, my) = (tx as f64 + d.w as f64 / 2.0, ty as f64 + d.h as f64 / 2.0);
                let clear = 2.0 + d.w.max(d.h) as f64 / 2.0;
                if self
                    .map
                    .nodes
                    .iter()
                    .all(|n| jsmath::hypot(n.tx as f64 + 0.5 - mx, n.ty as f64 + 0.5 - my) >= clear)
                {
                    return Some((tx, ty));
                }
            }
            r += 1.0;
        }
        None
    }

    /// The AI keeps a free one-tile walkway around everything it builds, so it never walls its own units in.
    pub(crate) fn walkway_around(&self, tx: i32, ty: i32, w: i32, h: i32) -> bool {
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
    pub(crate) fn free_builder(&self, harv: &[Id], x: f64, y: f64) -> Option<Id> {
        let mut best: Option<(f64, Id)> = None;
        let scout = self.ai().scout; // (out on its errand: it would never come back to build)
        for &h in harv {
            let u = self.unit(h).unwrap();
            if matches!(u.task, Task::Build { .. } | Task::Repair { .. })
                || u.carry != 0
                || u.no_build_until > self.time
                || Some(h) == scout
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
    pub(crate) fn tend_sites(&mut self, harv: &[Id]) {
        let t = self.time;
        let open: Vec<(Id, f64, f64, f64)> = self
            .bldgs
            .iter()
            .filter(|b| b.team == self.seat() && !b.done)
            .map(|b| (b.id, b.progress, b.x, b.y))
            .collect();
        let mut sites = std::mem::take(&mut self.ai_mut().sites);
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
            let attended = self.bldg(id).is_some_and(|b| b.planted) // (a planted seed grows by itself)
                || self.units.iter().any(|u| u.task == (Task::Build { b: id }));
            if !attended && let Some(h) = self.free_builder(harv, x, y) {
                self.start_build(h, id);
            }
        }
        sites.retain(|s| self.bldg(s.0).is_some());
        self.ai_mut().sites = sites;
    }

    /// A spot for a second Core: by a shard field away from both bases, nearest to our main core.
    pub(crate) fn expansion_spot(&self, cx: f64, cy: f64) -> Option<(i32, i32)> {
        let (px, py) = (
            self.map.bases[self.foe() as usize].0 as f64 + 2.0,
            self.map.bases[self.foe() as usize].1 as f64 + 2.0,
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
                    if self.can_place(self.factions[self.seat() as usize].hq, tx, ty, self.seat())
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

    /// Whether shards pile up for want of factories: a bank of `SHARD_FLOAT` with every main factory busy, while
    /// not supply-blocked (busy queues that cannot finish are not a factory problem) and not saving up (for an
    /// expansion or research: the bank is spoken for), and while under the difficulty's allowance of extra factories
    /// over the `schedule`.
    pub(crate) fn extra_rax(&self, e: u8, my_b: &[Id], schedule: usize) -> bool {
        let rax = self.factions[e as usize].ai.rax;
        let (busy, all) = my_b
            .iter()
            .filter_map(|&id| self.bldg(id))
            .filter(|b| b.kind == rax)
            .fold((0, 0), |(busy, all), b| {
                (busy + (b.done && !b.queue.is_empty()) as usize, all + 1)
            });
        let d = &DIFF[self.diff];
        let [used, cap] = self.sup[e as usize];
        self.res[e as usize][0] >= SHARD_FLOAT
            && all > 0
            && busy == all
            && all < schedule + d.extra_rax
            && cap - used >= 4
            && self.ai().saving_since.is_none()
    }

    /// The build order: one wanted building at a time, placed by a free harvester.
    pub(crate) fn ai_build(&mut self, brain: &mut Brain) {
        let Brain {
            e,
            t,
            harv,
            my_b,
            cx,
            cy,
            building,
            ext,
            flowing,
            cores,
            ..
        } = brain.clone();
        let d = &DIFF[self.diff];
        // A free vent near a point (where find_spot looks): wanting an Extractor without one would stall the build.
        let free_vent = |w: &World, (fx, fy): (f64, f64)| {
            w.map.nodes.iter().any(|n| {
                n.ether
                    && n.extractor.is_none()
                    && jsmath::hypot(n.tx as f64 - fx, n.ty as f64 - fy) < 16.0
            })
        };
        // Where a second Extractor would go once the home vent runs dry: a free vent by the expansion.
        let exp_vent = cores.get(1).map(|&exp| {
            let b = self.bldg(exp).unwrap();
            (b.tx as f64 + 2.0, b.ty as f64 + 2.0)
        });
        let exp_vent = exp_vent.filter(|&at| free_vent(self, at));
        let [used, cap] = self.sup[e as usize];
        let f = self.factions[e as usize];
        let s = &f.ai;
        // Spire discipline: a building that went dark gets a new power source beside it before anything else.
        let dark = my_b
            .iter()
            .filter_map(|&id| self.bldg(id))
            .find(|b| b.done && b.kind.def().needs_power && !b.powered)
            .map(|b| {
                (
                    b.tx as f64 + b.w as f64 / 2.0,
                    b.ty as f64 + b.h as f64 / 2.0,
                )
            });
        let relight = dark.filter(|_| f.supply.def().power > 0.0 && !building.contains(&f.supply));
        // Ether only once there is something to spend it on: at once if a mixed-in unit needs ether and no tech
        // (the Vael Prism), else after the first factory (the Foundry, the Humans' first ether buy, needs it).
        let ether_early = s
            .mix
            .iter()
            .any(|&(k, _)| k.def().cost[1] > 0 && k.def().req.is_none());
        let rax_schedule = d.rax + (t > 300.0) as usize + (t > 540.0) as usize;
        // Free supply that calls for more: 4, or room for a capital unit too while one is due.
        let supply_margin = 4 + self.capital_due(e, &my_b, t).map_or(0, |k| k.def().supply);
        let want = if relight.is_some()
            || (cap - used <= supply_margin && cap < 200 && !building.contains(&f.supply))
        {
            Some(f.supply)
        } else if (harv.len() >= 7
            && self.ai_count(&my_b, false, f.ether) == 0
            && (ether_early || self.ai_count(&my_b, false, s.rax) >= 1)
            && free_vent(self, (cx, cy)))
            || (!flowing && exp_vent.is_some() && self.ai_count(&my_b, false, f.ether) < 2)
        {
            Some(f.ether) // the second when the home vent has run dry: the expansion's
        } else if self.ai_count(&my_b, false, s.rax) < rax_schedule
            || self.extra_rax(e, &my_b, rax_schedule)
        {
            Some(s.rax)
        } else if self.ai_count(&my_b, true, s.rax) >= 1
            && ext.is_some()
            && self.ai_count(&my_b, false, s.tech) == 0
            // (sooner once its ether is in the bank: until the tech stands there may be nothing to spend it on)
            && (t > 150.0 || self.res[e as usize][1] >= s.tech.def().cost[1])
        {
            Some(s.tech)
        } else if self.ai_count(&my_b, true, s.rax) >= 1
            && self.ai_count(&my_b, false, s.tower) < (t > 240.0) as usize + (t > 480.0) as usize
        {
            Some(s.tower)
        } else if self.diff >= 1
            && self.ai_count(&my_b, true, s.tech) >= 1
            && self.ai_count(&my_b, false, s.air) == 0
            && t > 330.0
        {
            Some(s.air)
        } else {
            None
        };
        if let Some(w) = want
            && building.len() < 2
            && self.has_req(e, w)
            && self.can_afford(e, w.def().cost)
            && let Some(spot) = {
                let (fx, fy) = match exp_vent {
                    Some(at)
                        if w == f.ether
                            && (self.ai_count(&my_b, false, w) >= 1
                                || !free_vent(self, (cx, cy))) =>
                    {
                        at
                    }
                    _ => match relight {
                        Some(at) if w == f.supply => at, // by the dark building
                        _ => (cx, cy),
                    },
                };
                // A full main (a walled pocket fills up): by the second base instead, if there is one.
                let second = cores.get(1).and_then(|&c| self.bldg(c)).map(|b| {
                    (
                        b.tx as f64 + b.w as f64 / 2.0,
                        b.ty as f64 + b.h as f64 / 2.0,
                    )
                });
                // (Not an extractor, which needs its vent, nor a power source meant to relight a dark building.)
                match self.find_spot(w, fx, fy) {
                    None if w != f.ether && !(w == f.supply && relight.is_some()) => {
                        second.and_then(|(ex, ey)| self.find_spot(w, ex, ey))
                    }
                    spot => spot,
                }
            }
        {
            let (sx, sy) = (spot.0 as f64 * TILE, spot.1 as f64 * TILE);
            if let Some(b) = self.free_builder(&harv, sx, sy) {
                let _ = self.place_building(e, w, spot.0, spot.1, Some(b));
            }
        }
        // (Held back from unit production only if it can be built at all: its requirement stands.)
        brain.want = want.filter(|&w| self.has_req(e, w));
    }

    /// A second base (saved up for), then tending sites and the scout; drops buildings that are gone.
    pub(crate) fn ai_expand(&mut self, brain: &mut Brain) {
        let Brain {
            e,
            t,
            harv,
            my_b,
            cx,
            cy,
            ..
        } = brain.clone();
        let d = &DIFF[self.diff];
        // A second base, outside the build order above: the AI saves up for it (see research) and places it
        // even while supply depots go up.
        let exp_spot = if self.diff >= 1
            && t > [f64::MAX, 420.0, 330.0][self.diff]
            && self.ai_count(&my_b, false, self.factions[e as usize].hq) < 2
            && harv.len() + 2 >= d.harv
        {
            self.expansion_spot(cx, cy)
        } else {
            None
        };
        let expand = exp_spot.is_some(); // nowhere to go: no saving, research carries on
        if let Some(spot) = exp_spot
            && self.can_afford(e, self.factions[e as usize].hq.def().cost)
        {
            let (sx, sy) = (spot.0 as f64 * TILE, spot.1 as f64 * TILE);
            if let Some(b) = self.free_builder(&harv, sx, sy) {
                let _ =
                    self.place_building(e, self.factions[e as usize].hq, spot.0, spot.1, Some(b));
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

        brain.expand = expand;
        brain.my_b = my_b;
    }
}
