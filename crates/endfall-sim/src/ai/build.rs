//! The AI's build order and expansion: what to build next, where, and by whom; tending its sites.

use super::*;

/// Unspent shards the AI counts as piling up (it then adds a factory).
const SHARD_FLOAT: i32 = 400;

/// After placing a base, how long (s) before it takes another for a passive foe (`Diff::passive_expand`).
const PASSIVE_BASE_GAP: f64 = 90.0;
/// Shards left in the fields by its main below which the AI takes its natural now (`Diff::expands_when_dry`),
/// whatever the clock says (on barren maps the home field runs dry before the difficulty's time; later it could not
/// pay for it).
const HOME_LOW: i32 = 2000;
/// How far from its centre the AI looks for room for a building (tiles), and how far once there is none nearer and
/// no second base to build by: a full main pocket must not hold its factories up until the natural stands (26, not
/// 22, since a main has two vents: a cramped one filled up sooner and the room left lay just past 22).
const ROOM: f64 = 15.0;
const ROOM_FAR: f64 = 26.0;
/// How far (tiles) from the middle of another start the AI keeps its far buildings: past that start's pocket.
const POCKET_ROOM: f64 = 16.0;

impl World {
    /// The free open shaft (a vent with no extractor) this seat takes next: the nearest by walking distance from its
    /// main at (cx, cy) (tiles) on its own side of the map (nearer its own start than any other seat's still in, an
    /// ally's too; a free start's shafts are anyone's), its
    /// top-left tile. The walk is measured once per main (`Ai::shafts`: the ground does not move) by a flood over the
    /// ground its workers stand on.
    pub(crate) fn free_shaft(&mut self, cx: f64, cy: f64) -> Option<(i32, i32)> {
        let from = (cx as i32, cy as i32);
        if self.ai().shafts.as_ref().is_none_or(|(at, _)| *at != from) {
            let order = self.shafts_by_walk(cx, cy);
            self.ai_mut().shafts = Some((from, order));
        }
        let e = self.seat();
        let start = |s: usize| {
            let (x, y) = self.map.bases[s];
            (x as f64 + 2.0, y as f64 + 2.0)
        };
        let own = start(e as usize);
        // (every other seat still in, its allies too: an ally's near shaft is the ally's to take)
        let foes: Vec<(f64, f64)> = (0..self.seats() as u8)
            .filter(|&s| s != e && !self.out[s as usize])
            .map(|s| start(s as usize))
            .collect();
        let (_, order) = self.ai().shafts.as_ref()?;
        order.iter().find_map(|&(_, id)| {
            let n = self.map.node(id)?;
            let (vx, vy) = (n.tx as f64 + 1.0, n.ty as f64 + 1.0);
            let d = |(x, y): (f64, f64)| jsmath::hypot(vx - x, vy - y);
            (n.extractor.is_none() && foes.iter().all(|&f| d(own) < d(f))).then_some((n.tx, n.ty))
        })
    }

    /// Every vent its workers can walk to from (cx, cy) (tiles), by steps (4-neighbour, over the ground they stand on,
    /// buildings in the way), nearest first, ties by id.
    fn shafts_by_walk(&self, cx: f64, cy: f64) -> Vec<(u32, Id)> {
        let Some(start) = self.map.nearest_passable_to(
            self.worker_foot(),
            cx as i32,
            cy as i32,
            6,
            (cx * TILE, cy * TILE),
        ) else {
            return Vec::new();
        };
        let foot = self.worker_foot();
        let m = &self.map;
        let mut steps = vec![u32::MAX; m.rock.len()];
        let mut todo = std::collections::VecDeque::from([start]);
        steps[m.idx(start.0, start.1)] = 0;
        while let Some((x, y)) = todo.pop_front() {
            let here = steps[m.idx(x, y)];
            for (nx, ny) in [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)] {
                if m.in_map(nx, ny) && steps[m.idx(nx, ny)] == u32::MAX && m.passable(foot, nx, ny)
                {
                    steps[m.idx(nx, ny)] = here + 1;
                    todo.push_back((nx, ny));
                }
            }
        }
        let mut order: Vec<(u32, Id)> = m
            .nodes
            .iter()
            .filter(|n| n.ether)
            .filter_map(|n| {
                // (the nearest tile round the 2x2 a worker stands on)
                let near = (-1..=2)
                    .flat_map(|dy| (-1..=2).map(move |dx| (n.tx + dx, n.ty + dy)))
                    .filter(|&(x, y)| m.in_map(x, y))
                    .map(|(x, y)| steps[m.idx(x, y)])
                    .min()?;
                (near != u32::MAX).then_some((near, n.id))
            })
            .collect();
        order.sort();
        order
    }

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
            return self.free_shaft(cx, cy);
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
    /// out can fall in a sealed pocket), clear of the natural's site (the Core it saves for goes there), of every
    /// expansion (a neighbour's natural may lie that far out) and of every other start.
    fn find_far_spot(&mut self, kind: BldgKind, cx: f64, cy: f64, from: f64) -> Option<(i32, i32)> {
        let start = self.map.nearest_passable_to(
            self.worker_foot(),
            cx as i32,
            cy as i32,
            6,
            (cx * TILE, cy * TILE),
        )?;
        let reach = self.walkable_from(start);
        let natural = self.expansion_spot(cx, cy);
        let me = self.seat() as usize;
        let ok = |w: &World, tx: i32, ty: i32| {
            let (x, y) = (tx as f64, ty as f64);
            // (the walkway tile left of it: free, so reachable if the site is)
            w.map.in_map(tx - 1, ty)
                && reach[w.map.idx(tx - 1, ty)]
                && natural.is_none_or(|(nx, ny)| (tx - nx).abs().max((ty - ny).abs()) > 7)
                && w.map
                    .expansions
                    .iter()
                    .all(|&(ex, ey)| (x - ex).abs().max((y - ey).abs()) > 7.0)
                && w.map.bases.iter().enumerate().all(|(s, &(bx, by))| {
                    s == me || jsmath::hypot(x - bx as f64 - 2.0, y - by as f64 - 2.0) > POCKET_ROOM
                })
        };
        self.find_spot_within(kind, cx, cy, from, ROOM_FAR, &ok)
    }

    /// What this seat's workers may stand on (its builders' class at the water level).
    pub(crate) fn worker_foot(&self) -> crate::map::Foot {
        self.foot(self.factions[self.seat() as usize].worker)
    }

    /// Tiles this seat's workers can reach from `start` (4-neighbour steps over ground they may stand on).
    fn walkable_from(&self, start: (i32, i32)) -> Vec<bool> {
        let foot = self.worker_foot();
        let mut seen = vec![false; self.map.rock.len()];
        let mut todo = vec![start];
        seen[self.map.idx(start.0, start.1)] = true;
        while let Some((x, y)) = todo.pop() {
            for (nx, ny) in [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)] {
                if self.map.in_map(nx, ny)
                    && !seen[self.map.idx(nx, ny)]
                    && self.map.passable(foot, nx, ny)
                {
                    seen[self.map.idx(nx, ny)] = true;
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
        self.level().expands_when_dry && home < HOME_LOW
    }

    /// The AI keeps a free one-tile walkway around everything it builds, so it never walls its own units in (ground
    /// its workers may stand on).
    pub(crate) fn walkway_around(&self, tx: i32, ty: i32, w: i32, h: i32) -> bool {
        let foot = self.worker_foot();
        for y in -1..=h {
            for x in -1..=w {
                if x >= 0 && y >= 0 && x < w && y < h {
                    continue;
                }
                let (xx, yy) = (tx + x, ty + y);
                if !self.map.passable(foot, xx, yy) {
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
            let attended = self.units.iter().any(|u| u.task == (Task::Build { b: id }));
            if !attended && let Some(h) = self.free_builder(harv, x, y) {
                self.start_build(h, id);
            }
        }
        sites.retain(|s| self.bldg(s.0).is_some());
        self.ai_mut().sites = sites;
    }

    /// A spot for a second Core: by a shard field away from our main and every other seat's start, nearest to our
    /// main core. On a map of more than two starts, also nearer our start than any other seat's (the field and the
    /// spot): a neighbour's natural may lie nearer than our own (a start nobody took is free ground).
    pub(crate) fn expansion_spot(&self, cx: f64, cy: f64) -> Option<(i32, i32)> {
        let me = self.seat() as usize;
        let start = |s: usize| {
            let (x, y) = self.map.bases[s];
            (x as f64 + 2.0, y as f64 + 2.0)
        };
        let theirs: Vec<(f64, f64)> = (0..self.seats()).filter(|&s| s != me).map(start).collect();
        // (two starts: anywhere 22 tiles from the foe's, as always)
        let ours = |x: f64, y: f64| {
            let from = |(px, py): (f64, f64)| jsmath::hypot(x - px, y - py);
            self.map.bases.len() <= 2 || theirs.iter().all(|&p| from(p) > from(start(me)))
        };
        let mut fields: Vec<(f64, i32, i32)> = self
            .map
            .nodes
            .iter()
            .filter(|n| !n.ether && n.amount > 300)
            .filter(|n| {
                let from = |(x, y): (f64, f64)| jsmath::hypot(n.tx as f64 - x, n.ty as f64 - y);
                from((cx, cy)) > 12.0
                    && theirs.iter().all(|&p| from(p) > 22.0)
                    && ours(n.tx as f64, n.ty as f64)
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
                        && ours(tx as f64 + 2.0, ty as f64 + 2.0)
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
        self.level().rax + (t > 300.0) as usize + (t > 540.0) as usize
    }

    /// `n` main factories, or as many as it can have: a main factory on a shaft (the Expedition's Recruiting post,
    /// until the economy PR frees it of its site) only while a shaft on its side is free, so with none free the ones
    /// it has (sites counted) are all it gets.
    pub(crate) fn rax_target(&mut self, my_b: &[Id], n: usize, cx: f64, cy: f64) -> usize {
        let rax = self.factions[self.seat() as usize].ai.rax;
        if !rax.def().on_vent || self.free_shaft(cx, cy).is_some() {
            n
        } else {
            n.min(self.ai_count(my_b, false, rax))
        }
    }

    /// How many factories of `e`'s count against that schedule: its main factories, and its vehicle bay (a side with
    /// one makes its specialists there, not at a Garrison: the same production as one more Garrison).
    fn factories(&self, e: u8, my_b: &[Id]) -> usize {
        let s = &self.factions[e as usize].ai;
        self.ai_count(my_b, false, s.rax) + s.heavy.map_or(0, |h| self.ai_count(my_b, false, h))
    }

    /// The factory to add when shards pile up for want of one: a bank of `SHARD_FLOAT` with every one of a kind busy
    /// (its main factories), while
    /// not supply-blocked (busy queues that cannot finish are not a factory problem) and not saving up (for an
    /// expansion or research: the bank is spoken for), and while under the difficulty's allowance of extra factories
    /// over the `schedule`. None: no extra factory.
    pub(crate) fn extra_rax(&self, e: u8, my_b: &[Id], schedule: usize) -> Option<BldgKind> {
        let s = &self.factions[e as usize].ai;
        let busy_all = |k: BldgKind| {
            let (busy, all) = my_b
                .iter()
                .filter_map(|&id| self.bldg(id))
                .filter(|b| b.kind == k)
                .fold((0, 0), |(busy, all), b| {
                    (busy + (b.done && !b.queue.is_empty()) as usize, all + 1)
                });
            all > 0 && busy == all
        };
        // (a main factory: a vehicle bay works only when the mix calls for its units)
        let kind = busy_all(s.rax).then_some(s.rax)?;
        let d = self.tuning(e);
        let [used, cap] = self.sup[e as usize];
        let hq = self.factions[e as usize].hq;
        let expanded = || {
            my_b.iter()
                .filter_map(|&id| self.bldg(id))
                .filter(|b| b.kind == hq && b.done)
                .count()
                >= 2
        };
        (self.res[e as usize][0] >= SHARD_FLOAT
            && self.factories(e, my_b) < schedule + d.extra_rax
            && cap - used >= 4
            && self.ai().saving_since.is_none()
            && (!d.extras_after_expanding || expanded()))
        .then_some(kind)
    }

    /// The side's second tech building (`AiScript::tech2`, the Expedition's Portal) when the build order wants it: not
    /// raised yet, its own requirement standing, and either a mixed-in unit it trains (the Marine) or unlocks (one
    /// another factory of its own, already placed, trains) due by the time it stands, on a level that fields it, or
    /// one of its techs of use and not yet researched, from the side's tech time on a level that uses them.
    pub(crate) fn tech2_due(&self, e: u8, my_b: &[Id], t: f64) -> Option<BldgKind> {
        let s = &self.factions[e as usize].ai;
        let k = s.tech2?;
        if self.ai_count(my_b, false, k) > 0 || !self.has_req(e, k) {
            return None;
        }
        // (a unit it unlocks: once a factory of its own that trains it is placed, or it would unlock nothing)
        let trained = |u: UnitKind| {
            my_b.iter()
                .filter_map(|&id| self.bldg(id))
                .any(|b| b.kind.def().trains.contains(&u))
        };
        let level = self.level();
        let unlocks = s
            .mix
            .iter()
            .map(|&m| level.mix_entry(m))
            .any(|(u, _, from)| {
                (k.def().trains.contains(&u) || (u.def().req == Some(k) && trained(u)))
                    && self.level_allows(u)
                    && t > from - k.def().build
            });
        let d = self.level();
        let techs = d.abilities
            && t > d.research_from.min(s.tech_from)
            && k.def().researches.iter().any(|&up| {
                self.upgrades[e as usize][up.index()] < up.levels() && self.tech_of_use(e, my_b, up)
            });
        (unlocks || techs).then_some(k)
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
            pumps,
            cores,
            ..
        } = brain.clone();
        let d = self.level();
        // A free shaft to take (wanting an extractor without one would stall the build).
        let shaft = self.free_shaft(cx, cy);
        let [used, cap] = self.sup[e as usize];
        let f = self.factions[e as usize];
        let s = &f.ai;
        // An extractor on every shaft it can (PRD: the conversion, rule 1), one site at a time, the nearest free one
        // on its side first (`free_shaft`): the first once it has seven workers, the rest from the level's
        // `vents_from`; a lost one is built again on the same terms.
        // (Not in the guided first game: its opponent's income stays in its base, which the guide's last step
        // attacks; an extractor out on a shaft kept paying for fighters after the base fell. `guided_hold`)
        // (Only once its requirement stands, the barracks: wanted before then it would hold the rest of the build
        // order, the barracks too, behind a building it cannot place.)
        let pump_due = !building.contains(&f.ether)
            && harv.len() >= 7
            && (pumps == 0 || t > d.vents_from)
            && !self.guided
            && self.has_req(e, f.ether);
        // (a main factory on a shaft, the Expedition's Recruiting post until the economy PR: only while one is free;
        // `rax_short`)
        let rax_room = !s.rax.def().on_vent || shaft.is_some();
        let rax_schedule = self.rax_schedule(t);
        // Free supply that calls for more: the difficulty's margin, plus room for a capital unit while one is due.
        let supply_margin =
            d.supply_ahead + self.capital_due(e, &my_b, t).map_or(0, |k| k.def().supply);
        let supply_rising = building.iter().filter(|&&k| k == f.supply).count();
        let want = if cap - used <= supply_margin
            && cap < self.supply_limit()
            && supply_rising < d.supply_at_once
        {
            Some(f.supply)
        } else if pump_due && shaft.is_some() {
            Some(f.ether)
        } else if self.factories(e, &my_b) < rax_schedule && rax_room {
            Some(s.rax)
        } else if let Some(k) = self.extra_rax(e, &my_b, rax_schedule).filter(|_| rax_room) {
            Some(k)
        } else if self.ai_count(&my_b, true, s.rax) >= 1
            && pumps > 0
            && self.ai_count(&my_b, false, s.tech) == 0
            && t > 150.0
        {
            Some(s.tech)
        } else if let Some(heavy) = s.heavy
            && self.ai_count(&my_b, true, s.rax) >= 1
            && self.ai_count(&my_b, true, s.tech) >= 1
            && self.ai_count(&my_b, false, heavy) == 0
            && t > d.heavy_at
        {
            Some(heavy) // (once its vehicles' tech stands)
        // Its towers by the clock, two at most (sites counted): a bank it cannot spend must not go into towers (under
        // the cap of 40, a detector by every unseen hit came to 13 a seat, and multi-seat games stalled).
        } else if self.ai_count(&my_b, true, s.rax) >= 1
            && self.ai_count(&my_b, false, s.tower) < (t > 150.0) as usize + (t > 480.0) as usize
            && !self.guided
        // (the guided first game: none; `guided_hold`)
        {
            Some(s.tower)
        // (the rules let air follow the first factory; this AI chooses ground tech first)
        } else if self.ai_count(&my_b, true, s.tech) >= 1
            && self.ai_count(&my_b, false, s.air) == 0
            && d.air_at < NEVER
            && t > d.air_at - s.air_lead
            // (its raiders must be in its level's mix: it would otherwise stand there training nothing)
            && self.level_allows(s.raider)
        {
            Some(s.air)
        } else {
            self.tech2_due(e, &my_b, t) // (its second tech: the Portal)
        };
        // The natural is due (its Core is being saved for): building far out must not spend that bank.
        let hq_cost = f.hq.def().cost;
        let expansion_due =
            (t > d.expand_at || self.home_dry(cx, cy)) && self.ai_count(&my_b, false, f.hq) < 2;
        // Workers first (`Diff::workers_first`): while its crew is short, a worker's price stays in the bank, so a
        // building waits a moment rather than leave the Core idle for want of shards.
        // Only while a worker can be trained now (a Core, room in supply): the reserve must never hold back the Depot
        // a supply-capped side needs to train the very worker it saves for.
        let [used, cap] = self.sup[e as usize];
        let can_train = !cores.is_empty() && used + f.worker.def().supply <= cap;
        let hold = if d.workers_first && can_train && harv.len() < self.harv_target(cores.len()) {
            f.worker.def().cost
        } else {
            [0, 0]
        };
        let placeable = want.filter(|&w| {
            building.len() < d.supply_at_once + 1 // (two at once; three where supply goes up in pairs)
                && self.has_req(e, w)
                && self.can_afford(e, [0, 1].map(|i| w.def().cost[i] + hold[i]))
        });
        let spot = match placeable {
            Some(w) => {
                let (fx, fy) = (cx, cy);
                // A full main (a walled pocket fills up): by the second base instead, if there is one, else farther out.
                let second = cores.get(1).and_then(|&c| self.bldg(c)).map(|b| {
                    (
                        b.tx as f64 + b.w as f64 / 2.0,
                        b.ty as f64 + b.h as f64 / 2.0,
                    )
                });
                // (Not a building on a shaft, which needs its shaft.)
                match self.find_spot(w, fx, fy) {
                    None if !w.def().on_vent => {
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
        if let (Some(w), Some(spot)) = (placeable, spot) {
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
        let d = self.level();
        // A second base, outside the build order above: the AI saves up for it (see research) and places it
        // even while supply depots go up. Sooner if the home field is running dry.
        let dry = self.home_dry(cx, cy);
        brain.dry = dry;
        let hqs = self.ai_count(&my_b, false, self.factions[e as usize].hq);
        // Out-expanding a passive foe (`Diff::passive_expand`): its natural taken, nothing of the enemy's armed at its
        // buildings for a while and its last base not just placed, it takes another, up to `max_bases`.
        let ai = self.ai();
        let passive = hqs >= 2
            && hqs < d.max_bases
            && t - ai.attacked_at > d.passive_expand
            && t - ai.last_base_at > PASSIVE_BASE_GAP;
        let exp_spot =
            if ((t > d.expand_at || dry) && hqs < 2 || passive) && harv.len() + 2 >= d.harv {
                self.expansion_spot(cx, cy)
            } else {
                None
            };
        let expand = exp_spot.is_some(); // nowhere to go: no saving, research carries on
        if let Some(spot) = exp_spot
            && self.can_afford(e, self.factions[e as usize].hq.def().cost)
        {
            let (sx, sy) = (spot.0 as f64 * TILE, spot.1 as f64 * TILE);
            if let Some(b) = self.free_builder(&harv, sx, sy)
                && self
                    .place_building(e, self.factions[e as usize].hq, spot.0, spot.1, Some(b))
                    .is_ok()
            {
                self.ai_mut().last_base_at = t;
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
    use crate::map::{MapKind, MapSize};

    /// Seat 1's Medium AI on a 64x64 duel with its natural taken, fourteen workers and money in hand, at 10:00, its
    /// last attack at `attacked`: how many bases it has once it has taken its turn at expanding.
    fn bases_after(attacked: f64) -> usize {
        use crate::ai::Brain;
        let mut w = World::with_size(
            5,
            1,
            MapKind::Standard,
            MapSize::DUEL,
            0,
            &[&HUMANS, &HUMANS],
        );
        w.ai_turn = 1;
        let core = w
            .bldgs
            .iter()
            .find(|b| b.team == 1 && b.kind == BldgKind::Core)
            .unwrap();
        let (cx, cy) = (
            core.tx as f64 + core.w as f64 / 2.0,
            core.ty as f64 + core.h as f64 / 2.0,
        );
        let spot = w.expansion_spot(cx, cy).expect("a natural");
        w.make_building(BldgKind::Core, 1, spot.0, spot.1, true);
        let harv: Vec<_> = (0..14)
            .map(|i| {
                w.make_unit(
                    UnitKind::Harvester,
                    1,
                    (cx + 3.0) * TILE + i as f64 * 8.0,
                    cy * TILE,
                )
            })
            .collect();
        w.res[1] = [5000, 5000];
        let ai = w.ai_mut();
        ai.attacked_at = attacked;
        ai.last_base_at = 300.0;
        let my_b: Vec<_> = w
            .bldgs
            .iter()
            .filter(|b| b.team == 1)
            .map(|b| b.id)
            .collect();
        let mut b = Brain {
            e: 1,
            t: 600.0,
            my_b,
            harv,
            cx,
            cy,
            ..Brain::default()
        };
        w.ai_expand(&mut b);
        w.bldgs
            .iter()
            .filter(|b| b.team == 1 && b.kind == BldgKind::Core)
            .count()
    }

    #[test]
    fn a_foe_that_never_comes_is_out_expanded() {
        assert_eq!(
            bases_after(0.0),
            3,
            "no enemy at its buildings for ten minutes: a third base"
        );
        assert_eq!(
            bases_after(550.0),
            2,
            "attacked a minute ago: its natural is enough"
        );
    }
    use crate::world::World;

    #[test]
    fn on_a_map_of_many_starts_each_ai_expands_on_its_own_side() {
        // Eight starts round a 128x128 map, neighbours 44 tiles apart: a neighbour's natural can lie nearer than our
        // own, and no start's 22 tiles keep the AI off it. Each seat's spot is nearer its own start than any other.
        for seed in 0..12 {
            for (n, seats) in [(128, 8), (128, 6), (96, 4)] {
                let kind = MapKind::ALL[seed as usize % MapKind::ALL.len()];
                let mut w = World::with_size(
                    seed,
                    1,
                    kind,
                    MapSize::square(n),
                    seed,
                    &vec![&HUMANS; seats],
                );
                w.set_ai_seats(vec![true; seats]);
                let starts: Vec<(f64, f64)> = w.map.bases[..seats]
                    .iter()
                    .map(|b| (b.0 as f64 + 2.0, b.1 as f64 + 2.0))
                    .collect();
                for s in 0..seats {
                    w.ai_turn = s as u8;
                    let (cx, cy) = starts[s];
                    let (tx, ty) = w.expansion_spot(cx, cy).unwrap_or_else(|| {
                        panic!("{n}x{n} {seats} seats seed {seed} seat {s}: a spot")
                    });
                    let d = |p: (f64, f64)| {
                        ((tx as f64 + 2.0 - p.0).powi(2) + (ty as f64 + 2.0 - p.1).powi(2)).sqrt()
                    };
                    let theirs = (0..seats)
                        .filter(|&o| o != s)
                        .map(|o| d(starts[o]))
                        .fold(f64::MAX, f64::min);
                    assert!(
                        d(starts[s]) < theirs,
                        "{n}x{n} {seats} seats seed {seed} seat {s}: ({tx}, {ty}) is {:.1} from home, {theirs:.1} from another start",
                        d(starts[s])
                    );
                }
            }
        }
    }

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
            w.extra_rax(ENEMY, &my_b, 1).is_none(),
            "an idle factory spends them first"
        );
        w.bm(rax).unwrap().queue.push(UnitKind::Trooper);
        assert_eq!(
            w.extra_rax(ENEMY, &my_b, 1),
            Some(BldgKind::Barracks),
            "busy, and shards in the bank"
        );
        my_b.push(site);
        assert!(
            w.extra_rax(ENEMY, &my_b, 1).is_none(),
            "one is still going up"
        );
        my_b.pop();
        w.res[ENEMY as usize] = [300, 0];
        assert!(w.extra_rax(ENEMY, &my_b, 1).is_none(), "not piling up");
        w.res[ENEMY as usize] = [500, 0];
        w.sup[ENEMY as usize] = [10, 12];
        assert!(
            w.extra_rax(ENEMY, &my_b, 1).is_none(),
            "supply-blocked: a factory would not help"
        );
        w.recalc_supply(ENEMY);
        w.ai_mut().saving_since = Some(0.0);
        assert!(
            w.extra_rax(ENEMY, &my_b, 1).is_none(),
            "saving up: the bank is spoken for"
        );
        w.ai_mut().saving_since = None;
        assert_eq!(w.extra_rax(ENEMY, &my_b, 1), Some(BldgKind::Barracks));
        // Easy: its extras wait for a second base.
        w.diff = 0;
        assert!(w.extra_rax(ENEMY, &my_b, 1).is_none(), "Easy expands first");
        let hq = w.factions[ENEMY as usize].hq;
        my_b.push(w.make_building(hq, ENEMY, 20, 40, true));
        my_b.push(w.make_building(hq, ENEMY, 50, 40, true));
        assert!(
            w.extra_rax(ENEMY, &my_b, 1).is_some(),
            "and then adds factories"
        );
        // A vehicle bay counts as one; busy or not, the factory added is a main one (a bay works only when the mix
        // calls for its units).
        w.diff = 1;
        let bay = w.make_building(BldgKind::Factory, ENEMY, 40, 20, true);
        my_b.push(bay);
        assert_eq!(w.extra_rax(ENEMY, &my_b, 1), Some(BldgKind::Barracks));
        w.bm(bay).unwrap().queue.push(UnitKind::SiegeTank);
        assert_eq!(w.extra_rax(ENEMY, &my_b, 1), Some(BldgKind::Barracks));
        w.make_building(BldgKind::Barracks, ENEMY, 44, 20, true);
        let full = w
            .bldgs
            .iter()
            .filter(|b| b.team == ENEMY)
            .map(|b| b.id)
            .collect::<Vec<_>>();
        assert_eq!(
            w.extra_rax(ENEMY, &full, 0),
            None,
            "no more than the allowance: three factories over a schedule of none"
        );
    }
}
