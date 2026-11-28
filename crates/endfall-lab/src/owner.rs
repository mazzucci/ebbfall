//! The owner's opening, a frozen lab opponent (`owner-v1`; the AI rework, step 1). Stelian beats Hard as the
//! Expedition by expanding early and wide, adding Wind turbines, massing an army and attacking; the AI never punishes
//! the open expansion. This scripts that player so later AI work is measured against the same thing: it plays only
//! through the orders a person gives (`World`'s place, queue, gather, move and attack-move), reads nothing of any AI,
//! and keeps its plan fixed even once the AI learns to beat it. Changing the plan makes a new version (`owner-v2`,
//! beside this one), never an edit of this one.
//!
//! **The plan (`owner-v1`)**, one look every half second, its wants in this order, saving for the first it cannot pay
//! for (as `human.rs`):
//! 1. a Bot from each idle finished Data center while its Bots number under 11 a base with a mine (at most 33);
//! 2. a Substation when fewer than 3 grid are free and 2 more a finished Recruiting post, one rising at a time (two
//!    with three Recruiting posts);
//! 3. its first Recruiting post from 0:40, and from it a Sellsword (or Bruiser, as in 9) whenever it stands idle: it
//!    keeps recruiting while it saves for its expansion;
//! 4. its second Data center from 2:15 (its builder leaves at 1:40 for the nearest free mine: the AI's choice of an
//!    expansion, a mine over 12 tiles from its main and 22 from the foe's start, nearest its main), saving for it;
//!    a third the same way once the second stands, from 8:00 or once a base's mine runs low; a Data center lost is
//!    placed again;
//! 5. Wind turbines, five a Data center (the rule's most), round each finished Data center;
//! 6. a second Recruiting post once the expansion is placed, a third once it stands;
//! 7. defended only: two Sentry masts at the expansion, on its side toward the foe, once it stands;
//! 8. a Lab once the expansion stands and the three Recruiting posts are placed;
//! 9. from each other idle Recruiting post a Sellsword, or a Bruiser once a Lab stands while it has fewer than one
//!    Bruiser per four Sellswords.
//!
//! Its idle Bots mine at the finished Data center's mine with the fewest of them, and five move over when the
//! expansion stands. Its army (Sellswords and Bruisers) gathers 6 tiles from a base toward the foe: **defended** at
//! the expansion once it stands (and two masts there), **undefended** at the main. It defends on sight of an armed
//! foe within 10 tiles of a building it guards (defended: every building; undefended: those nearer its main than its
//! expansions, so an attack on an expansion is left to it): its army at home attack-moves there. It **pushes** when
//! 20 fighters stand at home, or at 12:00 with 10: every fighter attack-moves on the foe's building nearest them
//! (a person knows the foe's start on a two-start map; the script knows its other buildings too, its one shortcut).
//! After that each 12 at home go together, and a fighter that falls idle out there goes on to the nearest.
//!
//! What a game records: the first expansion's placing, finishing and fall, when an armed foe first came within 12 tiles of
//! it and when the foe first hit something of the script's there (`Event::Attacked`), the Bots lost there, the first
//! foe hit anywhere, the push's time and army, and the result.

use crate::json::Json;
use crate::paired::{Paired, paired, score};
use crate::stats::{median, mmss, wilson};
use endfall_sim::data::{BldgKind, Diff, FACTIONS, UnitKind, VAEL};
use endfall_sim::map::{Id, MapKind, MapSize, max_starts};
use endfall_sim::world::{Event, Task, World};
use std::fmt::Write;

/// The frozen plan's name, written into every record.
pub const VERSION: &str = "owner-v1";
/// The plan's numbers (see the module's notes).
pub mod plan {
    /// Ticks between looks (half a second).
    pub const LOOK: u32 = 15;
    /// Bots a finished Data center's mine is worked by (11, 22, 33).
    pub const CREW_BASE: usize = 11;
    /// The third Data center: from 8:00, or once a finished base's mine runs low (`MINE_LOW`).
    pub const THIRD_AT: f64 = 480.0;
    /// Grid free under which a Substation goes up, and 2 more a finished Recruiting post.
    pub const LOW_GRID: i32 = 3;
    pub const RAX_AT: f64 = 40.0;
    pub const BUILDER_AT: f64 = 100.0;
    pub const EXPAND_AT: f64 = 135.0;
    pub const TURBINES: usize = 5;
    pub const MASTS: usize = 2;
    pub const BRUISER_EVERY: usize = 4;
    /// Bots that move to the expansion once it stands.
    pub const MOVE_OVER: usize = 5;
    /// Tiles from a base toward the foe where the army gathers.
    pub const GATHER: f64 = 6.0;
    /// Tiles round a guarded building within which an armed foe calls the army.
    pub const THREAT: f64 = 10.0;
    pub const PUSH_ARMY: usize = 20;
    pub const PUSH_LATEST: f64 = 720.0;
    pub const PUSH_MIN: usize = 10;
    pub const REGROUP: usize = 12;
    /// Tiles round the expansion's middle that count as at it (sightings, hits, Bots lost).
    pub const AT_EXP: f64 = 12.0;
}
use plan::*;

const TILE: f64 = 32.0;
const TPS: f64 = 30.0;

/// The two variants: the army and two masts at the expansion, or the army at the main and the expansion left alone.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Guard {
    Defended,
    Undefended,
}
impl Guard {
    pub const ALL: [Guard; 2] = [Guard::Defended, Guard::Undefended];
    pub fn name(self) -> &'static str {
        match self {
            Guard::Defended => "defended",
            Guard::Undefended => "undefended",
        }
    }
}

/// One game: the map, the foe (its people's index, its level, and a lab plan in place of its level's own), the
/// variant, and which start the script takes (`swap`: the other one, as the report's other seating).
#[derive(Clone, Copy, Debug)]
pub struct Setup {
    pub size: i32,
    pub seed: u32,
    pub swap: bool,
    pub foe_race: usize,
    pub foe_level: usize,
    pub foe_plan: Option<Diff>,
    pub guard: Guard,
    pub cap_min: u32,
}

/// What a game showed (times in seconds).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Rec {
    /// The script won (Some(true)), lost, or the game timed out (None).
    pub won: Option<bool>,
    pub end_s: f64,
    pub exp_placed: Option<f64>,
    pub exp_done: Option<f64>,
    pub exp_lost: Option<f64>,
    /// An armed foe first within `AT_EXP` of the expansion (once placed).
    pub exp_seen: Option<f64>,
    /// The foe first hit something of the script's within `AT_EXP` of the expansion (once placed).
    pub exp_hit: Option<f64>,
    pub bots_lost_at_exp: u32,
    /// The foe first hit anything of the script's.
    pub first_hit: Option<f64>,
    pub push_at: Option<f64>,
    /// Fighters, and their worth in energy, when it pushed.
    pub push_army: usize,
    pub push_value: i32,
    pub bots_at_8: usize,
    pub turbines_at_8: usize,
}

/// The script's state through a game.
struct Owner {
    me: u8,
    guard: Guard,
    main: Id,
    foe_home: (f64, f64),
    tried: Vec<Id>,
    target_mine: Option<Id>,
    builder: Option<Id>,
    exp: Option<Id>,
    third: Option<Id>,
    exp_at: Option<(f64, f64)>,
    moved_over: bool,
    rax: Vec<Id>,
    masts: usize,
    lab: Option<Id>,
    pushing: bool,
    out: Vec<Id>,
    rallies: Vec<(Id, (f64, f64))>,
}

fn d(a: (f64, f64), b: (f64, f64)) -> f64 {
    endfall_sim::jsmath::hypot(a.0 - b.0, a.1 - b.1)
}

/// A free spot for `kind` in rings round `c` (world px) from `r0` to `r1` tiles: the first by ring and angle, or with
/// `toward`, the one nearest that point.
fn spot(
    w: &World,
    team: u8,
    kind: BldgKind,
    c: (f64, f64),
    r0: i32,
    r1: i32,
    toward: Option<(f64, f64)>,
) -> Option<(i32, i32)> {
    let def = kind.def();
    let mut best: Option<(f64, (i32, i32))> = None;
    for r in r0..=r1 {
        for a in 0..24 {
            let ang = a as f64 / 24.0 * std::f64::consts::TAU;
            let tx = endfall_sim::jsmath::round(
                c.0 / TILE + endfall_sim::jsmath::cos(ang) * r as f64 - def.w as f64 / 2.0,
            ) as i32;
            let ty = endfall_sim::jsmath::round(
                c.1 / TILE + endfall_sim::jsmath::sin(ang) * r as f64 - def.h as f64 / 2.0,
            ) as i32;
            if !w.can_place(kind, tx, ty, team) {
                continue;
            }
            let Some(t) = toward else {
                return Some((tx, ty));
            };
            let mid = (
                (tx as f64 + def.w as f64 / 2.0) * TILE,
                (ty as f64 + def.h as f64 / 2.0) * TILE,
            );
            let dist = d(mid, t);
            if best.is_none_or(|b| dist < b.0) {
                best = Some((dist, (tx, ty)));
            }
        }
    }
    best.map(|b| b.1)
}

impl Owner {
    fn new(w: &World, me: u8, guard: Guard) -> Owner {
        let main = w
            .bldgs
            .iter()
            .find(|b| b.team == me && b.kind.def().hq)
            .expect("a start")
            .id;
        let foe = (0..w.seats() as u8).find(|&s| s != me).unwrap();
        let (fx, fy) = w.map.bases[foe as usize];
        Owner {
            me,
            guard,
            main,
            foe_home: ((fx as f64 + 2.0) * TILE, (fy as f64 + 2.0) * TILE),
            tried: vec![],
            target_mine: None,
            builder: None,
            exp: None,
            third: None,
            exp_at: None,
            moved_over: false,
            rax: vec![],
            masts: 0,
            lab: None,
            pushing: false,
            out: vec![],
            rallies: vec![],
        }
    }

    fn main_at(&self, w: &World) -> Option<(f64, f64)> {
        w.bldg(self.main).map(|b| (b.x, b.y))
    }
    fn exp_done(&self, w: &World) -> bool {
        self.exp.and_then(|e| w.bldg(e)).is_some_and(|b| b.done)
    }
    /// The third Data center is due: the natural stands, and it is 8:00 or a finished base's mine runs low.
    fn third_due(&self, w: &World) -> bool {
        self.exp_done(w)
            && self.third.is_none()
            && (w.time >= THIRD_AT
                || self.base_mines(w).iter().any(|&(id, _)| {
                    w.map
                        .node(id)
                        .is_some_and(|n| n.amount < endfall_sim::world::MINE_LOW)
                }))
    }
    /// A Data center to place now: the natural from 2:15, then the third once due.
    fn base_due(&self, w: &World) -> bool {
        (self.exp.is_none() && w.time >= EXPAND_AT) || self.third_due(w)
    }

    /// The expansion's mine: the AI's rule (a mine with gold over 300, over 12 tiles from the main, over 22 from the
    /// foe's start, no headquarters within 12 tiles of it), nearest the main; one tried and found with no room is
    /// passed over.
    fn pick_mine(&self, w: &World) -> Option<Id> {
        let home = self.main_at(w)?;
        let foe = self.foe_home;
        w.map
            .nodes
            .iter()
            .filter(|n| n.amount > 300 && !self.tried.contains(&n.id))
            .filter(|n| {
                let at = (n.x, n.y);
                d(at, home) > 12.0 * TILE
                    && d(at, foe) > 22.0 * TILE
                    && !w
                        .bldgs
                        .iter()
                        .any(|b| b.kind.def().hq && d((b.x, b.y), at) <= 12.0 * TILE)
            })
            .min_by(|a, b| {
                d((a.x, a.y), home)
                    .total_cmp(&d((b.x, b.y), home))
                    .then(a.id.cmp(&b.id))
            })
            .map(|n| n.id)
    }

    fn bots(&self, w: &World) -> Vec<Id> {
        w.units
            .iter()
            .filter(|u| u.team == self.me && u.kind == VAEL.worker)
            .map(|u| u.id)
            .collect()
    }
    fn fighters(&self, w: &World) -> Vec<Id> {
        w.units
            .iter()
            .filter(|u| u.team == self.me && matches!(u.kind, UnitKind::Prism | UnitKind::Bruiser))
            .map(|u| u.id)
            .collect()
    }
    /// A Bot to build with: one mining (never the expansion's builder on its way).
    fn worker(&self, w: &World) -> Option<Id> {
        w.units
            .iter()
            .filter(|u| u.team == self.me && u.kind == VAEL.worker)
            .filter(|u| Some(u.id) != self.builder)
            .find(|u| matches!(u.task, Task::Gather { .. }))
            .map(|u| u.id)
    }
    /// Where the army gathers.
    fn gather(&self, w: &World) -> Option<(f64, f64)> {
        let base = match self.guard {
            Guard::Defended if self.exp_done(w) => self.exp_at,
            _ => self.main_at(w),
        }?;
        let dist = d(base, self.foe_home).max(1.0);
        let k = GATHER * TILE / dist;
        Some((
            base.0 + (self.foe_home.0 - base.0) * k,
            base.1 + (self.foe_home.1 - base.1) * k,
        ))
    }

    /// The mines of finished Data centers (within 10 tiles of one), with how many Bots mine each.
    fn base_mines(&self, w: &World) -> Vec<(Id, usize)> {
        let dcs: Vec<(f64, f64)> = w
            .bldgs
            .iter()
            .filter(|b| b.team == self.me && b.kind.def().hq && b.done)
            .map(|b| (b.x, b.y))
            .collect();
        w.map
            .nodes
            .iter()
            .filter(|n| n.amount > 0 && dcs.iter().any(|&c| d(c, (n.x, n.y)) <= 10.0 * TILE))
            .map(|n| {
                let crew = w
                    .units
                    .iter()
                    .filter(|u| {
                        u.team == self.me
                            && matches!(u.task, Task::Gather { node, .. } if node == n.id)
                    })
                    .count();
                (n.id, crew)
            })
            .collect()
    }

    fn tend_workers(&mut self, w: &mut World) {
        let mines = self.base_mines(w);
        // the expansion stands: five Bots of the main's mine go over
        if !self.moved_over
            && self.exp_done(w)
            && let Some(exp_at) = self.exp_at
        {
            self.moved_over = true;
            let near_exp = mines
                .iter()
                .filter_map(|&(id, _)| w.map.node(id))
                .filter(|n| d((n.x, n.y), exp_at) <= 10.0 * TILE)
                .min_by(|a, b| d((a.x, a.y), exp_at).total_cmp(&d((b.x, b.y), exp_at)))
                .map(|n| n.id);
            if let Some(to) = near_exp {
                let movers: Vec<Id> = w
                    .units
                    .iter()
                    .filter(|u| {
                        u.team == self.me
                            && matches!(u.task, Task::Gather { node, .. } if node != to)
                            && Some(u.id) != self.builder
                    })
                    .take(MOVE_OVER)
                    .map(|u| u.id)
                    .collect();
                for u in movers {
                    w.start_gather(u, to);
                }
            }
        }
        let idle: Vec<Id> = w
            .units
            .iter()
            .filter(|u| u.team == self.me && u.kind == VAEL.worker && u.task == Task::Idle)
            .filter(|u| Some(u.id) != self.builder)
            .map(|u| u.id)
            .collect();
        let mut mines = self.base_mines(w);
        for u in idle {
            let pick = mines
                .iter_mut()
                .min_by(|a, b| a.1.cmp(&b.1).then(a.0.cmp(&b.0)));
            let node = match pick {
                Some(m) => {
                    m.1 += 1;
                    Some(m.0)
                }
                None => {
                    // (no finished base with gold: the nearest mine with gold)
                    let at = w.unit(u).map(|u| (u.x, u.y)).unwrap_or_default();
                    w.map
                        .nodes
                        .iter()
                        .filter(|n| n.amount > 0)
                        .min_by(|a, b| {
                            d((a.x, a.y), at)
                                .total_cmp(&d((b.x, b.y), at))
                                .then(a.id.cmp(&b.id))
                        })
                        .map(|n| n.id)
                }
            };
            if let Some(n) = node {
                w.start_gather(u, n);
            }
        }
        // each finished Data center sends its new Bots to its own mine
        let dcs: Vec<(Id, (f64, f64))> = w
            .bldgs
            .iter()
            .filter(|b| b.team == self.me && b.kind.def().hq && b.done && b.rally.is_none())
            .map(|b| (b.id, (b.x, b.y)))
            .collect();
        for (dc, at) in dcs {
            let mine = w
                .map
                .nodes
                .iter()
                .filter(|n| n.amount > 0)
                .min_by(|a, b| {
                    d((a.x, a.y), at)
                        .total_cmp(&d((b.x, b.y), at))
                        .then(a.id.cmp(&b.id))
                })
                .map(|n| (n.id, n.x, n.y));
            if let Some((id, x, y)) = mine {
                w.set_rally(dc, x, y, Some(id));
            }
        }
    }

    /// The expansion's builder: off at 1:40 toward its mine; another if it falls before placing.
    fn tend_builder(&mut self, w: &mut World) {
        let due = (self.exp.is_none() && w.time >= BUILDER_AT) || self.third_due(w);
        if !due {
            return;
        }
        if self.target_mine.is_none() {
            self.target_mine = self.pick_mine(w);
        }
        let Some(mine) = self
            .target_mine
            .and_then(|m| w.map.node(m))
            .map(|n| (n.id, n.x, n.y))
        else {
            return;
        };
        if self.builder.is_none_or(|b| w.unit(b).is_none()) {
            self.builder = self.worker(w);
            if let (Some(b), Some(home)) = (self.builder, self.main_at(w)) {
                // (to the mine's near side, 5 tiles toward the main)
                let k = 5.0 * TILE / d((mine.1, mine.2), home).max(1.0);
                w.move_to(
                    b,
                    mine.1 + (home.0 - mine.1) * k,
                    mine.2 + (home.1 - mine.2) * k,
                );
            }
        }
    }

    /// The expansion's spot by its mine (rings 6 to 12 tiles out, nearest the main), if the ground is explored.
    fn exp_spot(&self, w: &World) -> Option<(i32, i32)> {
        let n = w.map.node(self.target_mine?)?;
        let home = self.main_at(w)?;
        let def = VAEL.hq.def();
        for r in 6..=12 {
            let mut best: Option<(f64, (i32, i32))> = None;
            for k in 0..16 {
                let a = k as f64 / 16.0 * std::f64::consts::TAU;
                let tx = endfall_sim::jsmath::round(
                    n.tx as f64 + endfall_sim::jsmath::cos(a) * r as f64 - 2.0,
                ) as i32;
                let ty = endfall_sim::jsmath::round(
                    n.ty as f64 + endfall_sim::jsmath::sin(a) * r as f64 - 2.0,
                ) as i32;
                if !w.can_place(VAEL.hq, tx, ty, self.me) {
                    continue;
                }
                let mid = (
                    (tx as f64 + def.w as f64 / 2.0) * TILE,
                    (ty as f64 + def.h as f64 / 2.0) * TILE,
                );
                let dist = d(mid, home);
                if best.is_none_or(|b| dist < b.0) {
                    best = Some((dist, (tx, ty)));
                }
            }
            if let Some(b) = best {
                return Some(b.1);
            }
        }
        None
    }

    fn rising(&self, w: &World, kind: BldgKind) -> usize {
        w.bldgs
            .iter()
            .filter(|b| b.team == self.me && b.kind == kind && !b.done)
            .count()
    }
    fn count(&self, w: &World, kind: BldgKind) -> usize {
        w.bldgs
            .iter()
            .filter(|b| b.team == self.me && b.kind == kind)
            .count()
    }

    /// Place `kind` at (tx, ty) with a mining Bot; its id.
    fn place(&self, w: &mut World, kind: BldgKind, at: (i32, i32)) -> Option<Id> {
        let builder = self.worker(w)?;
        w.place_building(self.me, kind, at.0, at.1, Some(builder))
            .ok()
    }

    /// The wants of this look, in order; spends until the first it cannot pay for.
    fn tend_economy(&mut self, w: &mut World) {
        let me = self.me;
        let t = w.time;
        let exp_done = self.exp_done(w);
        let dcs: Vec<(Id, bool, (f64, f64))> = w
            .bldgs
            .iter()
            .filter(|b| b.team == me && b.kind.def().hq && b.done)
            .map(|b| (b.id, b.queue.is_empty(), (b.x, b.y)))
            .collect();
        let bots = self.bots(w).len()
            + w.bldgs
                .iter()
                .filter(|b| b.team == me && b.kind.def().hq)
                .map(|b| b.queue.len())
                .sum::<usize>();
        // (a base whose mine ran dry needs no crew)
        let crew = CREW_BASE * self.base_mines(w).len().clamp(1, 3);
        let mut wants: Vec<Want> = vec![];
        let mut queued = bots;
        for &(dc, idle, _) in &dcs {
            if idle && queued < crew {
                wants.push(Want::Unit(dc, VAEL.worker));
                queued += 1;
            }
        }
        let [used, cap] = w.sup(me);
        let rax_done = self
            .rax
            .iter()
            .filter(|&&r| w.bldg(r).is_some_and(|b| b.done))
            .count();
        let at_once = if self.rax.len() >= 3 { 2 } else { 1 };
        if cap - used < LOW_GRID + 2 * rax_done as i32
            && cap < w.sup_max(me)
            && self.rising(w, VAEL.supply) < at_once
        {
            wants.push(Want::Near(VAEL.supply, None));
        }
        self.rax.retain(|&r| w.bldg(r).is_some());
        if t >= RAX_AT && self.rax.is_empty() {
            wants.push(Want::Near(BldgKind::Siphon, None));
        }
        let lab_done = w.has_bldg(me, BldgKind::Loom);
        let count = |k: UnitKind| {
            w.units
                .iter()
                .filter(|u| u.team == me && u.kind == k)
                .count()
                + w.bldgs
                    .iter()
                    .filter(|b| b.team == me)
                    .map(|b| b.queue.iter().filter(|&&q| q == k).count())
                    .sum::<usize>()
        };
        let (mut swords, mut bruisers) = (count(UnitKind::Prism), count(UnitKind::Bruiser));
        let recruit = |swords: &mut usize, bruisers: &mut usize| {
            if lab_done && *bruisers * BRUISER_EVERY < *swords {
                *bruisers += 1;
                UnitKind::Bruiser
            } else {
                *swords += 1;
                UnitKind::Prism
            }
        };
        // (its first Recruiting post keeps recruiting while it saves for its expansion)
        if let Some(&r) = self.rax.first()
            && w.bldg(r).is_some_and(|b| b.done && b.queue.is_empty())
        {
            wants.push(Want::Unit(r, recruit(&mut swords, &mut bruisers)));
        }
        if self.base_due(w) && self.target_mine.is_some() {
            wants.push(Want::Expansion);
        }
        if rax_done > 0 {
            for &(_, _, at) in &dcs {
                let near = w
                    .bldgs
                    .iter()
                    .filter(|b| {
                        b.team == me && b.kind == BldgKind::Spire && d((b.x, b.y), at) <= 8.0 * TILE
                    })
                    .count();
                if near < TURBINES && w.hq_room(me, BldgKind::Spire) {
                    wants.push(Want::Near(BldgKind::Spire, Some(at)));
                    break;
                }
            }
        }
        let rax_want = 1 + self.exp.is_some() as usize + exp_done as usize;
        if !self.rax.is_empty() && self.rax.len() < rax_want {
            wants.push(Want::Near(BldgKind::Siphon, None));
        }
        if self.guard == Guard::Defended
            && exp_done
            && self.masts < MASTS
            && let Some(at) = self.exp_at
        {
            wants.push(Want::Mast(at));
        }
        if exp_done
            && self.rax.len() >= 3
            && self.lab.is_none_or(|l| w.bldg(l).is_none())
            && w.has_req(me, BldgKind::Loom)
        {
            wants.push(Want::Near(BldgKind::Loom, None));
        }
        for &r in self.rax.iter().skip(1) {
            if w.bldg(r).is_some_and(|b| b.done && b.queue.is_empty()) {
                wants.push(Want::Unit(r, recruit(&mut swords, &mut bruisers)));
            }
        }
        let main_at = self.main_at(w);
        for want in wants {
            let cost = match want {
                Want::Unit(_, k) => w.unit_cost(me, k),
                Want::Near(k, _) => k.def().cost,
                Want::Mast(_) => BldgKind::Ward.def().cost,
                Want::Expansion => VAEL.hq.def().cost,
            };
            if !w.can_afford(me, cost) {
                break;
            }
            match want {
                Want::Unit(b, k) => {
                    let _ = w.queue_unit(b, k);
                }
                Want::Near(k, at) => {
                    let Some(c) = at.or(main_at) else { continue };
                    let (r0, r1) = if k == BldgKind::Spire {
                        (3, 8)
                    } else {
                        (4, 14)
                    };
                    if let Some(s) = spot(w, me, k, c, r0, r1, None)
                        && let Some(id) = self.place(w, k, s)
                    {
                        match k {
                            BldgKind::Siphon => self.rax.push(id),
                            BldgKind::Loom => self.lab = Some(id),
                            _ => {}
                        }
                    }
                }
                Want::Mast(at) => {
                    if let Some(s) = spot(w, me, BldgKind::Ward, at, 3, 7, Some(self.foe_home))
                        && self.place(w, BldgKind::Ward, s).is_some()
                    {
                        self.masts += 1;
                    }
                }
                Want::Expansion => {
                    let Some(b) = self.builder.filter(|&b| w.unit(b).is_some()) else {
                        break; // (saving while a builder is found)
                    };
                    match self.exp_spot(w) {
                        Some(s) => {
                            if let Ok(id) = w.place_building(me, VAEL.hq, s.0, s.1, Some(b)) {
                                self.target_mine = None;
                                if self.exp.is_none() {
                                    self.exp = Some(id);
                                    self.exp_at = w.bldg(id).map(|x| (x.x, x.y));
                                } else {
                                    self.third = Some(id);
                                }
                            }
                        }
                        None => {
                            // the builder at the mine and still no room: the next mine
                            let at_mine = self
                                .target_mine
                                .and_then(|m| w.map.node(m))
                                .zip(w.unit(b))
                                .is_some_and(|(n, u)| d((n.x, n.y), (u.x, u.y)) < 7.0 * TILE);
                            if at_mine && let Some(m) = self.target_mine {
                                self.tried.push(m);
                                self.target_mine = self.pick_mine(w);
                                self.builder = None;
                                w.stop_unit(b);
                            }
                            break; // (saving for it)
                        }
                    }
                }
            }
        }
        // the builder, its Data center placed, goes back to work when it is done
        if let Some(b) = self.builder
            && self.target_mine.is_none()
            && w.unit(b).is_none_or(|u| u.task == Task::Idle)
        {
            self.builder = None;
        }
    }

    /// Armed foes within `THREAT` tiles of a building the script guards: the nearest to the gathering point.
    fn threat(&self, w: &World, gather: (f64, f64)) -> Option<(f64, f64)> {
        let main = self.main_at(w);
        let others: Vec<(f64, f64)> = [self.exp, self.third]
            .into_iter()
            .flatten()
            .filter(|&e| e != self.main)
            .filter_map(|e| w.bldg(e).map(|b| (b.x, b.y)))
            .collect();
        let guarded: Vec<(f64, f64)> = w
            .bldgs
            .iter()
            .filter(|b| b.team == self.me)
            .filter(|b| match (self.guard, main) {
                (Guard::Undefended, Some(m)) => {
                    others.iter().all(|&e| d((b.x, b.y), m) <= d((b.x, b.y), e))
                }
                _ => true,
            })
            .map(|b| (b.x, b.y))
            .collect();
        w.units
            .iter()
            .filter(|u| w.enemies(u.team, self.me))
            .filter(|u| u.kind.def().weapon.is_some() && !u.kind.def().worker)
            .filter(|u| guarded.iter().any(|&g| d(g, (u.x, u.y)) <= THREAT * TILE))
            .map(|u| (u.x, u.y))
            .min_by(|a, b| d(*a, gather).total_cmp(&d(*b, gather)))
    }

    /// The foe's building nearest `at`.
    fn target(&self, w: &World, at: (f64, f64)) -> Option<(f64, f64)> {
        w.bldgs
            .iter()
            .filter(|b| w.enemies(b.team, self.me))
            .map(|b| (b.x, b.y))
            .min_by(|a, b| d(*a, at).total_cmp(&d(*b, at)))
    }

    /// Gathers, defends and pushes; returns the army when it pushes first (count, worth).
    fn tend_army(&mut self, w: &mut World) -> Option<(usize, i32)> {
        let gather = self.gather(w)?;
        // its Recruiting posts send their recruits to the gathering point
        for &r in &self.rax {
            let set = self.rallies.iter().find(|x| x.0 == r).map(|x| x.1);
            if set != Some(gather) && w.bldg(r).is_some() {
                w.set_rally(r, gather.0, gather.1, None);
                self.rallies.retain(|x| x.0 != r);
                self.rallies.push((r, gather));
            }
        }
        let all = self.fighters(w);
        self.out.retain(|id| all.contains(id));
        let home: Vec<Id> = all
            .iter()
            .copied()
            .filter(|id| !self.out.contains(id))
            .collect();
        let mut pushed = None;
        let go = if self.pushing {
            home.len() >= REGROUP
        } else {
            home.len() >= PUSH_ARMY || (w.time >= PUSH_LATEST && home.len() >= PUSH_MIN)
        };
        if go {
            let c = centroid(w, &home);
            if let Some(tgt) = self.target(w, c) {
                if !self.pushing {
                    let value = home
                        .iter()
                        .filter_map(|&id| w.unit(id))
                        .map(|u| w.unit_cost(self.me, u.kind)[0])
                        .sum();
                    pushed = Some((home.len(), value));
                }
                self.pushing = true;
                w.attack_move_group(&home, tgt.0, tgt.1);
                self.out.extend(home.iter().copied());
            }
        } else if let Some(at) = self.threat(w, gather) {
            for &id in &home {
                let busy = w
                    .unit(id)
                    .is_some_and(|u| matches!(u.task, Task::Attack { .. } | Task::AMove { .. }));
                if !busy {
                    w.attack_move(id, at.0, at.1);
                }
            }
        } else {
            // idle ones far from the gathering point walk back to it
            for &id in &home {
                if let Some(u) = w.unit(id)
                    && u.task == Task::Idle
                    && d((u.x, u.y), gather) > 4.0 * TILE
                {
                    w.attack_move(id, gather.0, gather.1);
                }
            }
        }
        // out there, one fallen idle goes on to the nearest of the foe's buildings
        let idle_out: Vec<(Id, (f64, f64))> = self
            .out
            .iter()
            .filter_map(|&id| w.unit(id))
            .filter(|u| u.task == Task::Idle)
            .map(|u| (u.id, (u.x, u.y)))
            .collect();
        for (id, at) in idle_out {
            if let Some(t) = self.target(w, at) {
                w.attack_move(id, t.0, t.1);
            }
        }
        pushed
    }
}

fn centroid(w: &World, ids: &[Id]) -> (f64, f64) {
    let pts: Vec<(f64, f64)> = ids
        .iter()
        .filter_map(|&id| w.unit(id))
        .map(|u| (u.x, u.y))
        .collect();
    let n = pts.len().max(1) as f64;
    (
        pts.iter().map(|p| p.0).sum::<f64>() / n,
        pts.iter().map(|p| p.1).sum::<f64>() / n,
    )
}

#[derive(Clone, Copy)]
enum Want {
    Unit(Id, UnitKind),
    /// A building round a point (a Data center's middle; None: the main's).
    Near(BldgKind, Option<(f64, f64)>),
    Mast((f64, f64)),
    Expansion,
}

/// Play one game: the script in seat 0, the foe's AI in seat 1.
pub fn play(s: &Setup) -> Rec {
    let size = MapSize::square(s.size);
    let side = if s.swap {
        (max_starts(size) / 2) as u32
    } else {
        0
    };
    let mut w = World::with_size(
        s.seed,
        s.foe_level,
        MapKind::Standard,
        size,
        side,
        &[&VAEL, FACTIONS[s.foe_race]],
    );
    assert!(
        w.set_diffs(&[s.foe_level as u8, s.foe_level as u8]),
        "per-seat levels"
    );
    if s.foe_plan.is_some() {
        assert!(w.set_ai_plans(&[None, s.foe_plan]), "the foe's plan");
    }
    assert!(w.set_ai_seats([false, true]), "the script, then the AI");
    let me = 0u8;
    let mut o = Owner::new(&w, me, s.guard);
    let mut rec = Rec::default();
    // (the first expansion, the one the record is about: a later one replacing it is not)
    let mut first: Option<(Id, (f64, f64))> = None;
    let cap = s.cap_min * 60 * TPS as u32;
    while w.winner < 0 && w.tick < cap {
        w.step();
        let t = w.time;
        let exp_at = first.map(|f| f.1);
        for e in &w.events {
            match e {
                Event::Attacked { team, x, y, .. } if *team == me => {
                    rec.first_hit.get_or_insert(t);
                    if exp_at.is_some_and(|c| d(c, (*x, *y)) <= AT_EXP * TILE) {
                        rec.exp_hit.get_or_insert(t);
                    }
                }
                Event::Burst {
                    team,
                    x,
                    y,
                    unit: Some(k),
                    ..
                } if *team == me
                    && *k == VAEL.worker
                    && exp_at.is_some_and(|c| d(c, (*x, *y)) <= AT_EXP * TILE) =>
                {
                    rec.bots_lost_at_exp += 1;
                }
                _ => {}
            }
        }
        w.events.clear();
        if !w.tick.is_multiple_of(LOOK) {
            continue;
        }
        if let Some((e, _)) = first {
            match w.bldg(e) {
                Some(b) if b.done => {
                    rec.exp_done.get_or_insert(t);
                }
                None => {
                    rec.exp_lost.get_or_insert(t);
                }
                _ => {}
            }
        }
        // a Data center lost: its place is open again (the plan takes the same number of bases)
        if o.exp.is_some_and(|e| w.bldg(e).is_none()) {
            o.exp = None;
            o.exp_at = None;
            o.masts = 0;
            o.moved_over = false;
        }
        if o.third.is_some_and(|e| w.bldg(e).is_none()) {
            o.third = None;
        }
        if let Some(c) = exp_at
            && rec.exp_seen.is_none()
            && w.units.iter().any(|u| {
                w.enemies(u.team, me)
                    && u.kind.def().weapon.is_some()
                    && !u.kind.def().worker
                    && d(c, (u.x, u.y)) <= AT_EXP * TILE
            })
        {
            rec.exp_seen = Some(t);
        }
        if w.bldg(o.main).is_none() {
            // (the main fallen: the script plays on from what it has, its expansion its main)
            if let Some(e) = o.exp.filter(|&e| w.bldg(e).is_some()) {
                o.main = e;
            } else if let Some(b) = w.bldgs.iter().find(|b| b.team == me && b.kind.def().hq) {
                o.main = b.id;
            }
        }
        o.tend_workers(&mut w);
        o.tend_builder(&mut w);
        o.tend_economy(&mut w);
        if first.is_none()
            && let (Some(e), Some(at)) = (o.exp, o.exp_at)
        {
            first = Some((e, at));
            rec.exp_placed = Some(t);
        }
        if let Some((n, v)) = o.tend_army(&mut w) {
            rec.push_at = Some(t);
            rec.push_army = n;
            rec.push_value = v;
        }
        if (t - 480.0).abs() < 0.26 {
            rec.bots_at_8 = o.bots(&w).len();
            rec.turbines_at_8 = o.count(&w, BldgKind::Spire);
        }
    }
    rec.won = (w.winner >= 0).then_some(w.winner == me as i32);
    rec.end_s = w.tick as f64 / TPS;
    rec
}

/// What `owner` plays: the levels, the variants, both starts, map seeds from 1.
#[derive(Clone, Debug)]
pub struct OwnerBatch {
    pub size: i32,
    pub seeds: u32,
    pub levels: Vec<usize>,
    pub cap_min: u32,
    pub threads: usize,
}

pub struct OwnerRun {
    pub batch: OwnerBatch,
    pub commit: String,
    /// (level, guard, seed, swap, record), in that order.
    pub games: Vec<(usize, Guard, u32, bool, Rec)>,
}

/// Against the Kingdom's AI at each level of the batch.
pub fn run(b: OwnerBatch, commit: &str, progress: &(dyn Fn(usize, usize) + Sync)) -> OwnerRun {
    let mut jobs = vec![];
    for &level in &b.levels {
        for guard in Guard::ALL {
            for seed in 1..=b.seeds {
                for swap in [false, true] {
                    jobs.push((level, guard, seed, swap));
                }
            }
        }
    }
    let recs = crate::plans::play_jobs(
        &jobs,
        |&(level, guard, seed, swap)| {
            play(&Setup {
                size: b.size,
                seed,
                swap,
                foe_race: 0,
                foe_level: level,
                foe_plan: None,
                guard,
                cap_min: b.cap_min,
            })
        },
        b.threads,
        progress,
    );
    OwnerRun {
        batch: b,
        commit: commit.to_string(),
        games: jobs
            .into_iter()
            .zip(recs)
            .map(|((l, g, s, w), r)| (l, g, s, w, r))
            .collect(),
    }
}

/// The figures of a set of games.
pub struct Figures {
    pub games: usize,
    pub wins: usize,
    pub decided: usize,
    pub timeouts: usize,
    pub length: Option<f64>,
    pub exp_done: (usize, Option<f64>),
    pub exp_hit: (usize, Option<f64>),
    /// Games with the expansion hit within two minutes of finishing (or of placing, if it never finished).
    pub hit_in_2: usize,
    pub exp_lost: usize,
    pub bots_lost: f64,
    pub first_hit: Option<f64>,
    pub push: (usize, Option<f64>, Option<f64>, Option<f64>),
}

pub fn figures(recs: &[&Rec]) -> Figures {
    let med = |v: Vec<f64>| median(&v);
    let some = |f: &dyn Fn(&Rec) -> Option<f64>| -> Vec<f64> {
        recs.iter().filter_map(|r| f(r)).collect()
    };
    let done = some(&|r| r.exp_done);
    let hit_after: Vec<f64> = recs
        .iter()
        .filter_map(|r| Some(r.exp_hit? - r.exp_done.or(r.exp_placed)?))
        .collect();
    let push = some(&|r| r.push_at);
    Figures {
        games: recs.len(),
        wins: recs.iter().filter(|r| r.won == Some(true)).count(),
        decided: recs.iter().filter(|r| r.won.is_some()).count(),
        timeouts: recs.iter().filter(|r| r.won.is_none()).count(),
        length: med(recs
            .iter()
            .filter(|r| r.won.is_some())
            .map(|r| r.end_s)
            .collect()),
        exp_done: (done.len(), med(done)),
        exp_hit: (hit_after.len(), med(hit_after.clone())),
        hit_in_2: hit_after.iter().filter(|&&s| s <= 120.0).count(),
        exp_lost: recs.iter().filter(|r| r.exp_lost.is_some()).count(),
        bots_lost: recs.iter().map(|r| r.bots_lost_at_exp as f64).sum::<f64>()
            / recs.len().max(1) as f64,
        first_hit: med(some(&|r| r.first_hit)),
        push: (
            push.len(),
            med(push),
            med(recs
                .iter()
                .filter(|r| r.push_at.is_some())
                .map(|r| r.push_army as f64)
                .collect()),
            med(recs
                .iter()
                .filter(|r| r.push_at.is_some())
                .map(|r| r.push_value as f64)
                .collect()),
        ),
    }
}

fn rate(k: usize, n: usize) -> String {
    if n == 0 {
        return "—".into();
    }
    let (lo, hi) = wilson(k, n);
    format!(
        "{:.0}% ({:.0}–{:.0}%) of {n}",
        100.0 * k as f64 / n as f64,
        100.0 * lo,
        100.0 * hi
    )
}
fn t(s: Option<f64>) -> String {
    s.map_or("—".into(), mmss)
}

/// Defended less undefended, seed for seed (both starts of a seed one unit): the paired change in the script's score.
pub fn defended_gain(pairs: &[(u32, bool, &Rec, &Rec)]) -> Option<Paired> {
    let mut seeds: Vec<u32> = pairs.iter().map(|p| p.0).collect();
    seeds.sort_unstable();
    seeds.dedup();
    let d: Vec<f64> = seeds
        .iter()
        .map(|&s| {
            let v: Vec<f64> = pairs
                .iter()
                .filter(|p| p.0 == s)
                .map(|p| score(p.2.won) - score(p.3.won))
                .collect();
            v.iter().sum::<f64>() / v.len() as f64
        })
        .collect();
    paired(&d)
}

impl OwnerRun {
    fn recs(&self, level: usize, guard: Guard) -> Vec<&Rec> {
        self.games
            .iter()
            .filter(|g| g.0 == level && g.1 == guard)
            .map(|g| &g.4)
            .collect()
    }
    fn gain(&self, level: usize) -> Option<Paired> {
        let pairs: Vec<(u32, bool, &Rec, &Rec)> = self
            .games
            .iter()
            .filter(|g| g.0 == level && g.1 == Guard::Defended)
            .filter_map(|g| {
                let u = self.games.iter().find(|h| {
                    h.0 == level && h.1 == Guard::Undefended && h.2 == g.2 && h.3 == g.3
                })?;
                Some((g.2, g.3, &g.4, &u.4))
            })
            .collect();
        defended_gain(&pairs)
    }

    pub fn markdown(&self, header: &str) -> String {
        let mut s = format!(
            "# The owner's opening ({VERSION}) against the Kingdom\n\n{header}\n\nA scripted Expedition (crates/endfall-lab/src/owner.rs, frozen): its first Recruiting post at 0:40, its second Data center from 2:15 at the nearest free mine and a third from 8:00, five Wind turbines a Data center, three Recruiting posts and a Lab, Sellswords with a Bruiser per four, and a push at 20 fighters (or 12:00 with 10), then each 12 more. **Defended**: its army gathers at the expansion with two Sentry masts there; **undefended**: at the main, and an attack on the expansion is left to it. Against the Kingdom's AI at each level, both starts of each map seed.\n\n## Results\n\nThe script's wins of the decided games (95% interval), timeouts apart; the defended variant's gain over the undefended, seed for seed (`paired`: both starts of a seed one unit, a timeout half).\n\n| Level | Variant | Script wins | Timeouts | Median length |\n| --- | --- | --- | --- | --- |\n"
        );
        for &level in &self.batch.levels {
            for guard in Guard::ALL {
                let f = figures(&self.recs(level, guard));
                let _ = writeln!(
                    s,
                    "| {} | {} | {} | {} of {} | {} |",
                    crate::batch::LEVELS[level],
                    guard.name(),
                    rate(f.wins, f.decided),
                    f.timeouts,
                    f.games,
                    t(f.length)
                );
            }
        }
        s += "\n| Level | Defended less undefended (95%) | p |\n| --- | --- | --- |\n";
        for &level in &self.batch.levels {
            let g = self.gain(level);
            let _ = writeln!(
                s,
                "| {} | {} | {} |",
                crate::batch::LEVELS[level],
                g.map_or("—".into(), |g| format!(
                    "{}{}",
                    g.show(),
                    if g.beyond_noise() {
                        " **beyond noise**"
                    } else {
                        ""
                    }
                )),
                g.map_or("—".into(), |g| format!("{:.3}", g.p))
            );
        }
        s += "\n## The expansion and the push\n\nMedians over the games that got there. *Done*: the expansion finished (games, time). *Hit*: the Kingdom first hit something of the script's within 12 tiles of it (games, time after it finished, or after it was placed if it never did), and how many within two minutes. *Lost*: the Data center destroyed. *Bots lost*: a game's mean there. *First hit*: the Kingdom's first hit anywhere. *Push*: games that pushed, when, with how many fighters and their worth.\n\n| Level | Variant | Done | Hit | Hit within 2:00 | Lost | Bots lost | First hit | Push (time, fighters, worth) |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n";
        for &level in &self.batch.levels {
            for guard in Guard::ALL {
                let f = figures(&self.recs(level, guard));
                let _ = writeln!(
                    s,
                    "| {} | {} | {} of {} at {} | {} after {} | {} | {} | {:.1} | {} | {} at {}, {}, {} |",
                    crate::batch::LEVELS[level],
                    guard.name(),
                    f.exp_done.0,
                    f.games,
                    t(f.exp_done.1),
                    f.exp_hit.0,
                    t(f.exp_hit.1),
                    f.hit_in_2,
                    f.exp_lost,
                    f.bots_lost,
                    t(f.first_hit),
                    f.push.0,
                    t(f.push.1),
                    f.push.2.map_or("—".into(), |x| format!("{x:.0}")),
                    f.push.3.map_or("—".into(), |x| format!("{x:.0}")),
                );
            }
        }
        s
    }

    pub fn json(&self) -> Json {
        Json::obj()
            .with("lab", 1u32)
            .with("commit", self.commit.as_str())
            .with("script", VERSION)
            .with(
                "batch",
                Json::obj()
                    .with("size", self.batch.size)
                    .with("seeds", self.batch.seeds)
                    .with(
                        "levels",
                        self.batch
                            .levels
                            .iter()
                            .map(|&l| Json::from(crate::batch::LEVELS[l]))
                            .collect::<Vec<_>>(),
                    )
                    .with("cap_min", self.batch.cap_min),
            )
            .with(
                "games",
                self.games
                    .iter()
                    .map(|(l, g, seed, swap, r)| {
                        rec_json(r)
                            .with("level", crate::batch::LEVELS[*l])
                            .with("guard", g.name())
                            .with("seed", *seed)
                            .with("swap", *swap)
                    })
                    .collect::<Vec<_>>(),
            )
    }
}

pub fn rec_json(r: &Rec) -> Json {
    Json::obj()
        .with("won", r.won)
        .with("end_s", r.end_s)
        .with("exp_placed_s", r.exp_placed)
        .with("exp_done_s", r.exp_done)
        .with("exp_lost_s", r.exp_lost)
        .with("exp_seen_s", r.exp_seen)
        .with("exp_hit_s", r.exp_hit)
        .with("bots_lost_at_exp", r.bots_lost_at_exp)
        .with("first_hit_s", r.first_hit)
        .with("push_s", r.push_at)
        .with("push_army", r.push_army)
        .with("push_value", r.push_value as i64)
        .with("bots_at_8", r.bots_at_8)
        .with("turbines_at_8", r.turbines_at_8)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_owner_expands_early_builds_turbines_and_masses_against_a_passive_foe() {
        // Against the Kingdom on Easy, 64x64, thirteen minutes: the opening as written.
        for guard in Guard::ALL {
            let r = play(&Setup {
                size: 64,
                seed: 1,
                swap: false,
                foe_race: 0,
                foe_level: 0,
                foe_plan: None,
                guard,
                cap_min: 13,
            });
            let placed = r.exp_placed.expect("its second Data center placed");
            assert!((135.0..=240.0).contains(&placed), "placed at {placed}");
            let done = r.exp_done.expect("and finished");
            assert!(done - placed >= 80.0 && done < 420.0, "{done}");
            assert!(
                r.turbines_at_8 >= 8,
                "turbines at 8:00: {}",
                r.turbines_at_8
            );
            assert!(r.bots_at_8 >= 16, "Bots at 8:00: {}", r.bots_at_8);
            assert!(r.push_at.is_some() && r.push_army >= PUSH_MIN, "{r:?}");
        }
    }

    #[test]
    fn the_same_setup_plays_the_same_game() {
        let s = Setup {
            size: 64,
            seed: 3,
            swap: true,
            foe_race: 0,
            foe_level: 1,
            foe_plan: None,
            guard: Guard::Undefended,
            cap_min: 6,
        };
        assert_eq!(play(&s), play(&s));
    }
}
