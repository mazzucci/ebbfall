//! The tower range (radio range): the Expedition's machines (`data::radio::needs_range`) need range from a finished
//! Data center (`conflux`) or Radio tower (`ward`) of their own seat or an ally. Outside it a machine moves at
//! `OUT_OF_RANGE_SPEED`; the Drone (the flying machine) goes no more than `LEASH_MARGIN` tiles past its edge.
//!
//! Coverage is a grid, a bit per seat on every tile (a tile is covered when its centre lies within a source's range),
//! built again whenever the sources change: checked at the start of every tick (a source counts from the tick after
//! it is done until the tick after it is gone), when a building is made and when the teams change. It is derived from
//! the buildings, so it is deterministic and not hashed. The speed rule and the client's display read the grid; the
//! leash and the AI's margins measure the distance to the sources themselves.

use super::*;
use crate::data::radio::{LEASH_MARGIN, OUT_OF_RANGE_SPEED, needs_range, range_of};

/// How far (tiles) inside the edge the Drone backs off to.
const BACK_OFF: f64 = 2.0;

/// A source of range: a finished Data center or Radio tower.
#[derive(Clone, Copy, Debug)]
pub struct RadioSrc {
    pub id: Id,
    pub team: u8,
    pub x: f64,
    pub y: f64,
    /// Its range, px.
    pub reach: f64,
}

/// Whether a building gives range now.
fn is_source(b: &Bldg) -> bool {
    b.done && range_of(b.kind) > 0.0
}

impl World {
    /// Build the coverage again if its sources changed since it was last built (`force`: whatever they are, as when the
    /// teams change). Cheap when nothing changed: one pass over the buildings.
    pub(crate) fn refresh_radio(&mut self, force: bool) {
        let tiles = (self.map.w * self.map.h) as usize;
        let same = self.radio.len() == tiles
            && self
                .bldgs
                .iter()
                .filter(|b| is_source(b))
                .map(|b| b.id)
                .eq(self.radio_src.iter().map(|s| s.id));
        if same && !force {
            return;
        }
        self.radio_src = self
            .bldgs
            .iter()
            .filter(|b| is_source(b))
            .map(|b| RadioSrc {
                id: b.id,
                team: b.team,
                x: b.x,
                y: b.y,
                reach: range_of(b.kind) * TILE,
            })
            .collect();
        self.radio.clear();
        self.radio.resize(tiles, 0);
        let seats = self.seats() as u8;
        let (w, h) = (self.map.w, self.map.h);
        for k in 0..self.radio_src.len() {
            let s = self.radio_src[k];
            let mask = (0..seats)
                .filter(|&t| self.allies(s.team, t))
                .fold(0u8, |m, t| m | 1 << t);
            let lo = |c: f64| jsmath::to_i32(((c - s.reach) / TILE).floor()).max(0);
            let hi = |c: f64, n: i32| jsmath::to_i32(((c + s.reach) / TILE).floor()).min(n - 1);
            for ty in lo(s.y)..=hi(s.y, h) {
                for tx in lo(s.x)..=hi(s.x, w) {
                    let (cx, cy) = (tx as f64 * TILE + 16.0, ty as f64 * TILE + 16.0);
                    if dist(s.x, s.y, cx, cy) <= s.reach {
                        let i = self.map.idx(tx, ty);
                        self.radio[i] |= mask;
                    }
                }
            }
        }
        self.radio_ver = self.radio_ver.wrapping_add(1);
    }

    /// The coverage as seen by `team`: a byte per tile, 1 where it has range (the client's display).
    pub fn radio_cover(&self, team: u8) -> Vec<u8> {
        self.radio.iter().map(|&m| (m >> team) & 1).collect()
    }

    /// Bumped whenever the coverage is built again (the client redraws it only then).
    pub fn radio_version(&self) -> u32 {
        self.radio_ver
    }

    /// Whether (x, y) (world px) is within `team`'s range (its own sources and its allies'): its tile is covered.
    pub fn in_radio(&self, team: u8, x: f64, y: f64) -> bool {
        let (tx, ty) = (jsmath::to_i32(x / TILE), jsmath::to_i32(y / TILE));
        self.map.in_map(tx, ty)
            && self
                .radio
                .get(self.map.idx(tx, ty))
                .is_some_and(|&m| (m >> team) & 1 == 1)
    }

    /// Whether (x, y) lies within `extra` tiles past the edge of `team`'s range (by distance to the sources).
    pub fn in_radio_by(&self, team: u8, x: f64, y: f64, extra: f64) -> bool {
        self.radio_sources(team)
            .any(|s| dist(s.x, s.y, x, y) <= s.reach + extra * TILE)
    }

    fn radio_sources(&self, team: u8) -> impl Iterator<Item = &RadioSrc> {
        self.radio_src
            .iter()
            .filter(move |s| self.allies(s.team, team))
    }

    /// How far (px) (x, y) lies from the nearest edge of `team`'s range grown by `extra` tiles: 0 inside, infinite
    /// with no source.
    fn radio_gap(&self, team: u8, x: f64, y: f64, extra: f64) -> f64 {
        self.radio_sources(team)
            .map(|s| (dist(s.x, s.y, x, y) - s.reach - extra * TILE).max(0.0))
            .fold(f64::INFINITY, f64::min)
    }

    /// A machine outside its side's range: it moves at `OUT_OF_RANGE_SPEED`.
    pub(crate) fn radio_slowed(&self, uid: Id) -> bool {
        let u = self.u(uid);
        needs_range(u.kind) && !self.in_radio(u.team, u.x, u.y)
    }

    /// `live_speed`'s factor for the range: `OUT_OF_RANGE_SPEED` outside it, else 1.
    pub(crate) fn radio_speed(&self, uid: Id) -> f64 {
        if self.radio_slowed(uid) {
            OUT_OF_RANGE_SPEED
        } else {
            1.0
        }
    }

    /// A flying machine (the Drone: its leash applies).
    fn radio_flyer(&self, uid: Id) -> bool {
        let k = self.u(uid).kind;
        needs_range(k) && k.def().air
    }

    /// Whether `uid` may move to (nx, ny): always, unless it is the Drone going more than `LEASH_MARGIN` past its range.
    /// One already farther out (its source fell) may move only towards the range; with no source, anywhere.
    pub(crate) fn radio_allows(&self, uid: Id, nx: f64, ny: f64) -> bool {
        let u = self.u(uid);
        if !self.radio_flyer(uid) || self.in_radio_by(u.team, nx, ny, LEASH_MARGIN) {
            return true;
        }
        let now = self.radio_gap(u.team, u.x, u.y, LEASH_MARGIN);
        now.is_infinite() || (now > 0.0 && self.radio_gap(u.team, nx, ny, LEASH_MARGIN) < now)
    }

    /// The Drone idle beyond its leash (its source fell): it backs off to `BACK_OFF` tiles inside the nearest source's
    /// range (a move order). False when it has no source (it stays free).
    fn radio_back_off(&mut self, uid: Id) -> bool {
        let (team, ux, uy) = (self.u(uid).team, self.u(uid).x, self.u(uid).y);
        let near = self
            .radio_sources(team)
            .map(|s| {
                let d = dist(s.x, s.y, ux, uy);
                (d - s.reach, d, s.x, s.y, s.reach, s.id)
            })
            .min_by(|a, b| a.0.partial_cmp(&b.0).unwrap().then(a.5.cmp(&b.5)));
        let Some((_, d, sx, sy, reach, _)) = near else {
            return false;
        };
        let keep = reach - BACK_OFF * TILE;
        let (tx, ty) = if d > 0.0 {
            (sx + (ux - sx) / d * keep, sy + (uy - sy) / d * keep)
        } else {
            (sx, sy)
        };
        self.move_to(uid, tx, ty);
        true
    }

    /// The Drone idle beyond its leash (a source fell under it) with nothing in its weapon's reach backs off inside its
    /// range; anywhere within the leash it stays where it stopped. Looked at when an idle unit looks for a fight (its
    /// `aggro_cd`), and never for a seat without a source. Whether it backed off.
    pub(crate) fn radio_idle_check(&mut self, uid: Id, dt: f64) -> bool {
        if !self.radio_flyer(uid) {
            return false;
        }
        let u = self.u(uid);
        if u.aggro_cd - dt > 0.0
            || self.radio_sources(u.team).next().is_none()
            || self.in_radio_by(u.team, u.x, u.y, LEASH_MARGIN)
        {
            return false;
        }
        self.radio_reach_target(uid).is_none() && self.radio_back_off(uid)
    }

    /// An enemy within the weapon's reach of where the Drone is now, if any (it fights from the end of its leash): the
    /// reach `update_attack` closes to.
    fn radio_reach_target(&self, uid: Id) -> Option<Id> {
        let c = self.live(uid);
        if !c.combat {
            return None;
        }
        let u = self.u(uid);
        self.find_target(
            u.x,
            u.y,
            c.team,
            c.range + c.r * 0.5,
            c.ring,
            false,
            c.hits,
            true,
        )
    }

    /// The Drone at the end of its leash: it takes on an enemy in its reach from there (an attack keeps what it would go
    /// back to; true), else it stops there (false: the caller ends its order, and idle within the leash it stays).
    pub(crate) fn radio_at_leash(&mut self, uid: Id) -> bool {
        self.um(uid).path = None;
        // (not the target it is closing on: that one is out of its reach, or it would not be moving)
        let now = match self.u(uid).task {
            Task::Attack { target, .. } => Some(target),
            _ => None,
        };
        let Some(t2) = self.radio_reach_target(uid).filter(|&t| Some(t) != now) else {
            return false;
        };
        let back = match self.u(uid).task {
            Task::Attack { back, .. } => back,
            Task::AMove { x, y } => Some(Back { x, y, amove: true }),
            _ => {
                let u = self.u(uid);
                Some(Back {
                    x: u.x,
                    y: u.y,
                    amove: false,
                })
            }
        };
        self.um(uid).task = Task::Attack { target: t2, back };
        true
    }

    /// Where a Drone of `team` at (x, y) sent towards (tx, ty) can go: that point, or the last point of the straight way
    /// there within its leash (the AI's wave moves, so its Drones gather where they can stand).
    pub(crate) fn radio_leash_point(
        &self,
        team: u8,
        x: f64,
        y: f64,
        tx: f64,
        ty: f64,
    ) -> (f64, f64) {
        if self.radio_sources(team).next().is_none()
            || self.in_radio_by(team, tx, ty, LEASH_MARGIN)
            || !self.in_radio_by(team, x, y, LEASH_MARGIN)
        {
            return (tx, ty);
        }
        let d = dist(x, y, tx, ty);
        let steps = jsmath::to_i32((d / 16.0).ceil()).max(1);
        let mut last = (x, y);
        for k in 1..=steps {
            let f = k as f64 / steps as f64;
            let p = (x + (tx - x) * f, y + (ty - y) * f);
            if !self.in_radio_by(team, p.0, p.1, LEASH_MARGIN) {
                break;
            }
            last = p;
        }
        last
    }
}
