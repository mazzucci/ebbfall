//! Workers that run: a worker at work (mining, or idle) with an armed enemy close, or just hit, and nothing of its
//! own near to fight for it, runs to the far side of its headquarters, and goes back to its field once nothing armed
//! has been in sight for a while. A worker ordered to build, repair or move stays on its order.

use super::*;

/// Tiles: an armed enemy this close sets a worker running; a fighter or armed building of its own this close keeps
/// it at work; an armed enemy this close keeps a running worker from calming down.
const FLEE_NEAR: f64 = 3.0;
const GUARD_NEAR: f64 = 6.0;
const STILL_NEAR: f64 = 6.0;
/// Seconds: nothing armed in sight this long and a worker that ran goes back to work; a hit this recent counts as
/// an attack (by anything, seen or not).
const CALM: f64 = 8.0;
const HIT_RECENT: f64 = 0.5;

impl World {
    /// An armed enemy (one that hits ground) this team sees within `tiles` of (x, y): where it is.
    fn armed_foe_near(&self, team: u8, x: f64, y: f64, tiles: f64) -> Option<(f64, f64)> {
        self.nearby(x, y, tiles * TILE)
            .into_iter()
            .filter_map(|o| self.unit(o))
            .find(|o| {
                o.team != team
                    && o.kind.def().threat()
                    && o.kind.def().damage_vs(false) > 0.0
                    && dist(o.x, o.y, x, y) <= tiles * TILE
                    && self.seen_by(team, o.id)
            })
            .map(|o| (o.x, o.y))
    }

    /// Whether a worker should run, and from where: an armed enemy it sees within FLEE_NEAR, or a hit just now (from
    /// where it stands), with no fighter or armed building of its own within GUARD_NEAR.
    pub(crate) fn alarm(&self, uid: Id) -> Option<(f64, f64)> {
        let u = self.u(uid);
        let (x, y, team) = (u.x, u.y, u.team);
        let from = self
            .armed_foe_near(team, x, y, FLEE_NEAR)
            .or((self.time - u.struck < HIT_RECENT).then_some((x, y)))?;
        let near = |ox: f64, oy: f64| dist(ox, oy, x, y) <= GUARD_NEAR * TILE;
        let guarded = self
            .nearby(x, y, GUARD_NEAR * TILE)
            .into_iter()
            .filter_map(|o| self.unit(o))
            .any(|o| o.team == team && o.kind.def().threat() && near(o.x, o.y))
            || self.bldgs.iter().any(|b| {
                b.team == team && b.done && b.kind.def().weapon.is_some() && near(b.x, b.y)
            });
        (!guarded).then_some(from)
    }

    /// Run: to the far side of its nearest headquarters from the threat, remembering its field. False with no
    /// headquarters to run to (a side down to its workers has nowhere safe: they stay and work, or die).
    pub(crate) fn start_flee(&mut self, uid: Id, from: (f64, f64)) -> bool {
        let u = self.u(uid);
        let (team, ux, uy) = (u.team, u.x, u.y);
        let node = match u.task {
            Task::Gather { node, .. } => Some(node),
            _ => u.last_node,
        };
        let hq = self
            .bldgs
            .iter()
            .filter(|b| b.team == team && b.done && b.kind.def().hq)
            .min_by(|a, b| {
                dist(a.x, a.y, ux, uy)
                    .partial_cmp(&dist(b.x, b.y, ux, uy))
                    .unwrap()
                    .then(a.id.cmp(&b.id))
            });
        let Some(b) = hq else {
            return false;
        };
        // (hit by something unseen: away from where the worker stands, so to the side away from its field)
        let (dx, dy) = (b.x - from.0, b.y - from.1);
        let d = jsmath::hypot(dx, dy).max(1.0);
        let r = b.w.max(b.h) as f64 * TILE / 2.0 + 2.0 * TILE;
        let (x, y) = (b.x + dx / d * r, b.y + dy / d * r);
        let (x, y) = (crate::data::clamp_x(x), crate::data::clamp_y(y));
        self.release_mine(uid); // (off its field: the field's miner count goes down)
        self.set_task(
            uid,
            Task::Flee {
                node,
                x,
                y,
                calm: 0.0,
            },
        );
        true
    }

    /// A running worker: on to its refuge; back to its field (or idle) after CALM seconds with nothing armed near.
    pub(crate) fn update_flee(
        &mut self,
        uid: Id,
        node: Option<Id>,
        x: f64,
        y: f64,
        calm: f64,
        dt: f64,
    ) {
        let u = self.u(uid);
        let (team, ux, uy) = (u.team, u.x, u.y);
        let threatened = self.armed_foe_near(team, ux, uy, STILL_NEAR).is_some()
            || self.time - u.struck < HIT_RECENT;
        let calm = if threatened { 0.0 } else { calm + dt };
        if calm >= CALM {
            let back = node.filter(|&n| self.map.node(n).is_some_and(|n| n.amount > 0));
            match back {
                Some(n) if self.start_gather(uid, n) => {}
                _ => self.set_idle(uid),
            }
            return;
        }
        if let Task::Flee { calm: c, .. } = &mut self.um(uid).task {
            *c = calm;
        }
        if dist(ux, uy, x, y) > TILE {
            let u = self.um(uid);
            u.repath -= dt;
            if u.path.is_none() && u.repath <= 0.0 {
                self.path_to(uid, x, y);
            }
            if self.u(uid).path.is_some() && self.step_path(uid, dt) {
                self.um(uid).path = None;
            }
        }
    }
}
