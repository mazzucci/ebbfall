//! The AI's build order and expansion: what to build next, where, and by whom; tending its sites.

use super::*;

/// Unspent shards the AI counts as piling up (it then adds a factory).
const SHARD_FLOAT: i32 = 400;

/// Shards left in the fields by its main below which the AI takes its natural now (`Diff::expands_when_dry`),
/// whatever the clock says (on barren maps the home field runs dry before the difficulty's time; later it could not
/// pay for it).
const HOME_LOW: i32 = 2000;
/// How far from its centre the AI looks for room for a building (tiles), and how far once there is none nearer and
/// no second base to build by: a full main pocket must not hold its factories up until the natural stands.
const ROOM: f64 = 15.0;
const ROOM_FAR: f64 = 22.0;

impl World {
    pub(crate) fn find_spot(&mut self, kind: BldgKind, cx: f64, cy: f64) -> Option<(i32, i32)> {
        self.find_spot_within(kind, cx, cy, 3.5, ROOM, &|_, _, _| true)
    }

    /// A spot for `kind` in rings from `from` to `room` tiles around (cx, cy), where `ok` also allows it.
    fn find_spot_within(
        &mut self,
        kind: BldgKind,
        cx: f64,
        cy: f64,
        from: f64,
        room: f64,
        ok: &dyn Fn(&World, i32, i32) -> bool,
    ) -> Option<(i32, i32)> {
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
        let mut r = from;
        while r < room {
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
                    && ok(self, tx, ty)
                {
                    return Some((tx, ty));
                }
            }
            r += 1.0;
        }
        None
    }

    /// Room out past the main (rings `from` to `ROOM_FAR`): only where a worker can walk from the main (rings that far
    /// out can fall in a sealed pocket), and clear of the natural's site (the Core it saves for goes there).
    fn find_far_spot(&mut self, kind: BldgKind, cx: f64, cy: f64, from: f64) -> Option<(i32, i32)> {
        let start = self.map.nearest_free(cx as i32, cy as i32, 6)?;
        let reach = self.walkable_from(start);
        let natural = self.expansion_spot(cx, cy);
        let ok = |_: &World, tx: i32, ty: i32| {
            // (the walkway tile left of it: free, so reachable if the site is)
            in_map(tx - 1, ty)
                && reach[idx(tx - 1, ty)]
                && natural.is_none_or(|(nx, ny)| (tx - nx).abs().max((ty - ny).abs()) > 7)
        };
        self.find_spot_within(kind, cx, cy, from, ROOM_FAR, &ok)
    }

    /// Tiles a walker can reach from `start` (4-neighbour steps over free ground).
    fn walkable_from(&self, start: (i32, i32)) -> Vec<bool> {
        let mut seen = vec![false; (MW * MH) as usize];
        let mut todo = vec![start];
        seen[idx(start.0, start.1)] = true;
        while let Some((x, y)) = todo.pop() {
            for (nx, ny) in [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)] {
                if in_map(nx, ny) && !seen[idx(nx, ny)] && !self.map.blocked(nx, ny) {
                    seen[idx(nx, ny)] = true;
                    todo.push((nx, ny));
                }
            }
        }
        seen
    }

    /// Whether the fields by the main (centre cx, cy) are running low, on a level that then takes its natural at once.
    pub(crate) fn home_dry(&self, cx: f64, cy: f64) -> bool {
        let home: i32 = self
            .map
            .nodes
            .iter()
            .filter(|n| !n.ether && (n.tx as f64 - cx).abs().max((n.ty as f64 - cy).abs()) <= 12.0)
            .map(|n| n.amount)
            .sum();
        DIFF[self.diff].expands_when_dry && home < HOME_LOW
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

    /// How many main factories the build order wants by time `t`: the difficulty's, one more after 5 and 9 minutes.
    pub(crate) fn rax_schedule(&self, t: f64) -> usize {
        DIFF[self.diff].rax + (t > 300.0) as usize + (t > 540.0) as usize
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
        let hq = self.factions[e as usize].hq;
        let expanded = || {
            my_b.iter()
                .filter_map(|&id| self.bldg(id))
                .filter(|b| b.kind == hq && b.done)
                .count()
                >= 2
        };
        self.res[e as usize][0] >= SHARD_FLOAT
            && all > 0
            && busy == all
            && all < schedule + d.extra_rax
            && cap - used >= 4
            && self.ai().saving_since.is_none()
            && (!d.extras_after_expanding || expanded())
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
        let rax_schedule = self.rax_schedule(t);
        // Free supply that calls for more: the difficulty's margin, plus room for a capital unit while one is due.
        let supply_margin =
            d.supply_ahead + self.capital_due(e, &my_b, t).map_or(0, |k| k.def().supply);
        let supply_rising = building.iter().filter(|&&k| k == f.supply).count();
        // Hit by something unseen: a detector (its tower) by the spot, unless one stands near it already.
        let detector_at = self.ai().cloak_hit.filter(|&(x, y)| {
            !self.bldgs.iter().any(|b| {
                b.team == e
                    && b.kind.def().detect > 0.0
                    && (!b.kind.def().needs_power || b.powered || !b.done) // (a site counts: one is coming)
                    && dist(b.x, b.y, x, y) < 6.0 * TILE
            })
        });
        if detector_at.is_none() {
            self.ai_mut().cloak_hit = None;
        }
        let want = if relight.is_some()
            || (cap - used <= supply_margin && cap < 200 && supply_rising < d.supply_at_once)
        {
            Some(f.supply)
        } else if detector_at.is_some() && self.has_req(e, s.tower) && !building.contains(&s.tower)
        {
            Some(s.tower) // (before the build order: something it cannot see is hurting it)
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
        // (the rules let air follow the first factory; this AI chooses ground tech first)
        } else if self.ai_count(&my_b, true, s.tech) >= 1
            && self.ai_count(&my_b, false, s.air) == 0
            && t > d.air_at
        {
            Some(s.air)
        } else {
            None
        };
        // The natural is due (its Core is being saved for): building far out must not spend that bank.
        let hq_cost = f.hq.def().cost;
        let expansion_due =
            (t > d.expand_at || self.home_dry(cx, cy)) && self.ai_count(&my_b, false, f.hq) < 2;
        let placeable = want.filter(|&w| {
            building.len() < d.supply_at_once + 1 // (two at once; three where supply goes up in pairs)
                && self.has_req(e, w)
                && self.can_afford(e, w.def().cost)
        });
        let spot = match placeable {
            Some(w) => {
                let (fx, fy) = match exp_vent {
                    Some(at)
                        if w == f.ether
                            && (self.ai_count(&my_b, false, w) >= 1
                                || !free_vent(self, (cx, cy))) =>
                    {
                        at
                    }
                    _ => match (relight, detector_at) {
                        (Some(at), _) if w == f.supply => at, // by the dark building
                        (_, Some((x, y))) if w == s.tower => (x / TILE, y / TILE), // by the unseen attacker's mark
                        _ => (cx, cy),
                    },
                };
                // A full main (a walled pocket fills up): by the second base instead, if there is one, else farther out.
                let second = cores.get(1).and_then(|&c| self.bldg(c)).map(|b| {
                    (
                        b.tx as f64 + b.w as f64 / 2.0,
                        b.ty as f64 + b.h as f64 / 2.0,
                    )
                });
                // One try per unseen hit (a mark it cannot serve, say no power there for a Ward, must not hold the
                // build order up); the next hit marks again.
                let for_mark = w == s.tower && detector_at.is_some();
                if for_mark {
                    self.ai_mut().cloak_hit = None;
                }
                // (Not an extractor, which needs its vent, nor a power source meant to relight a dark building, nor
                // a detector meant for the spot it was hit at.)
                match self.find_spot(w, fx, fy) {
                    None if w != f.ether && !(w == f.supply && relight.is_some()) && !for_mark => {
                        second
                            .and_then(|(ex, ey)| self.find_spot(w, ex, ey))
                            .or_else(|| {
                                // (not while the natural is due and the bank cannot pay for both)
                                (!expansion_due
                                    || self.can_afford(
                                        e,
                                        [0, 1].map(|i| w.def().cost[i] + hq_cost[i]),
                                    ))
                                .then(|| self.find_far_spot(w, fx, fy, 3.5))
                                .flatten()
                            })
                    }
                    spot => spot,
                }
            }
            None => None,
        };
        // No powered room left anywhere for a building that needs power (a Vael factory in a full main): a power
        // source first, out past the main's room, so the next try has a field to build in.
        let (place, spot) = match (placeable, spot, f.power) {
            (Some(w), None, Some(p))
                if w.def().needs_power
                    && (w == s.rax || w == s.air) // (a factory: not a tower meant for a mark)
                    && !building.contains(&p)
                    && self.can_afford(
                        e,
                        [0, 1].map(|i| {
                            w.def().cost[i] + p.def().cost[i] + if expansion_due { hq_cost[i] } else { 0 }
                        }),
                    ) =>
            {
                (Some(p), self.find_far_spot(p, cx, cy, ROOM))
            }
            other => (other.0, other.1),
        };
        if let (Some(w), Some(spot)) = (place, spot) {
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
        // even while supply depots go up. Sooner if the home field is running dry.
        let dry = self.home_dry(cx, cy);
        brain.dry = dry;
        let exp_spot = if (t > d.expand_at || dry)
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

#[cfg(test)]
mod tests {
    use crate::data::*;
    use crate::world::World;

    #[test]
    fn shards_piling_up_with_every_factory_busy_call_for_one_more() {
        // Medium: one factory on the schedule, up to three extra.
        let mut w = World::new(17, 1);
        w.ai_turn = ENEMY;
        let rax = w.make_building(BldgKind::Barracks, ENEMY, 40, 12, true);
        let site = w.make_building(BldgKind::Barracks, ENEMY, 44, 12, false);
        let mut my_b = vec![rax];
        w.res[ENEMY as usize] = [500, 0];
        assert!(
            !w.extra_rax(ENEMY, &my_b, 1),
            "an idle factory spends them first"
        );
        w.bm(rax).unwrap().queue.push(UnitKind::Trooper);
        assert!(w.extra_rax(ENEMY, &my_b, 1), "busy, and shards in the bank");
        my_b.push(site);
        assert!(!w.extra_rax(ENEMY, &my_b, 1), "one is still going up");
        my_b.pop();
        w.res[ENEMY as usize] = [300, 0];
        assert!(!w.extra_rax(ENEMY, &my_b, 1), "not piling up");
        w.res[ENEMY as usize] = [500, 0];
        w.sup[ENEMY as usize] = [10, 12];
        assert!(
            !w.extra_rax(ENEMY, &my_b, 1),
            "supply-blocked: a factory would not help"
        );
        w.recalc_supply(ENEMY);
        w.ai_mut().saving_since = Some(0.0);
        assert!(
            !w.extra_rax(ENEMY, &my_b, 1),
            "saving up: the bank is spoken for"
        );
        w.ai_mut().saving_since = None;
        assert!(w.extra_rax(ENEMY, &my_b, 1));
        // Easy: its extras wait for a second base.
        w.diff = 0;
        assert!(!w.extra_rax(ENEMY, &my_b, 1), "Easy expands first");
        let hq = w.factions[ENEMY as usize].hq;
        my_b.push(w.make_building(hq, ENEMY, 20, 40, true));
        my_b.push(w.make_building(hq, ENEMY, 50, 40, true));
        assert!(w.extra_rax(ENEMY, &my_b, 1), "and then adds factories");
    }
}
