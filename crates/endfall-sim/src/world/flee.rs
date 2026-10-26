//! Workers that run: a worker at work (mining, or idle by its field) with an armed enemy in reach of it, or just hit,
//! and nothing of its own near that could fight that enemy, runs to the far side of its headquarters, and goes back
//! to work once nothing armed is near it or its field for a while. A worker ordered to build, repair or move stays on
//! its order, as does one its player sent to a field moments ago.

use super::*;

/// Tiles past an armed enemy's weapon range at which a worker runs (it runs before it is in range, not once shot);
/// the farthest it looks for one.
const FLEE_MARGIN: f64 = 1.0;
const LOOK: f64 = 9.0;
/// Tiles: a fighter or armed building of its own this close keeps a worker at work; an armed enemy this close to the
/// worker or to its field keeps a running worker from going back.
const GUARD_NEAR: f64 = 6.0;
const STILL_NEAR: f64 = 7.0;
/// Seconds: quiet this long and a worker that ran goes back to work; a hit this recent counts as an attack (by
/// anything, seen or not); a gather order its player gave this recently is not overruled.
const CALM: f64 = 8.0;
const HIT_RECENT: f64 = 0.5;
const TOLD: f64 = 10.0;
/// Tiles: an idle worker runs only this near its field (one parked elsewhere is somewhere on purpose).
const IDLE_NEAR: f64 = 8.0;

impl World {
    /// The nearest armed enemy (one that hits ground) `team` sees with (x, y) within its reach plus `margin` tiles
    /// (or within `tiles` when given): where it is, and whether it flies.
    fn armed_foe_near(
        &self,
        team: u8,
        x: f64,
        y: f64,
        margin: f64,
        tiles: Option<f64>,
    ) -> Option<(f64, f64, bool)> {
        self.nearby(x, y, LOOK.max(tiles.unwrap_or(0.0)) * TILE)
            .into_iter()
            .filter_map(|o| self.unit(o))
            .filter(|o| {
                let d = o.kind.def();
                let reach = tiles.unwrap_or_else(|| d.weapon.map_or(0.0, |w| w.range) + margin);
                self.enemies(o.team, team)
                    && o.warp <= 0.0
                    && d.threat()
                    && d.damage_vs(false) > 0.0
                    && dist(o.x, o.y, x, y) <= reach * TILE
                    && self.seen_by(team, o.id)
            })
            .min_by(|a, b| {
                dist(a.x, a.y, x, y)
                    .partial_cmp(&dist(b.x, b.y, x, y))
                    .unwrap()
                    .then(a.id.cmp(&b.id))
            })
            .map(|o| (o.x, o.y, o.kind.def().air))
    }

    /// Whether a worker should run, and from where: an armed enemy it sees in reach of it, or a hit just now (from
    /// where it stands), with no fighter or armed building of its own near that could hit that enemy.
    pub(crate) fn alarm(&self, uid: Id) -> Option<(f64, f64)> {
        let u = self.u(uid);
        let (x, y, team) = (u.x, u.y, u.team);
        if self.time - u.told < TOLD {
            return None; // (its player just sent it here)
        }
        if u.task == Task::Idle
            && !u
                .last_node
                .and_then(|n| self.map.node(n))
                .is_some_and(|n| dist(n.x, n.y, x, y) <= IDLE_NEAR * TILE)
        {
            return None; // (idle somewhere on purpose)
        }
        let foe = self.armed_foe_near(team, x, y, FLEE_MARGIN, None);
        let struck = self.time - u.struck < HIT_RECENT;
        let (fx, fy, air) = foe.or(struck.then_some((x, y, false)))?;
        let near = |ox: f64, oy: f64| dist(ox, oy, x, y) <= GUARD_NEAR * TILE;
        let guarded = self
            .nearby(x, y, GUARD_NEAR * TILE)
            .into_iter()
            .filter_map(|o| self.unit(o))
            .any(|o| {
                o.team == team
                    && o.warp <= 0.0
                    && o.kind.def().threat()
                    && o.kind.def().damage_vs(air) > 0.0
                    && near(o.x, o.y)
            })
            || self.bldgs.iter().any(|b| {
                b.team == team
                    && b.done
                    && (b.powered || !b.kind.def().needs_power)
                    && b.kind.def().weapon.is_some_and(|w| w.damage_vs(air) > 0.0)
                    && near(b.x, b.y)
            });
        (!guarded).then_some((fx, fy))
    }

    /// Run: to the far side of its nearest headquarters from the threat, remembering its field. False with no
    /// headquarters to run to (a side down to its workers has nowhere safe: they stay and work, or die).
    pub(crate) fn start_flee(&mut self, uid: Id, from: (f64, f64)) -> bool {
        let u = self.u(uid);
        let (team, ux, uy) = (u.team, u.x, u.y);
        let node = match u.task {
            Task::Gather { node, .. } => Some(node),
            Task::Flee { node, .. } => node,
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

    /// A running worker: on to its refuge (running on from a threat that followed it there); back to work once
    /// nothing armed has been near it or its field for CALM seconds.
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
        let at_refuge = dist(ux, uy, x, y) <= TILE;
        // (looked at four times a second, like the alarm)
        if (self.tick + uid).is_multiple_of(8) {
            if at_refuge && let Some(from) = self.alarm(uid) {
                self.start_flee(uid, from); // (followed: away from it again)
                return;
            }
            let field = node.and_then(|n| self.map.node(n)).map(|n| (n.x, n.y));
            let threatened = self.time - u.struck < HIT_RECENT
                || self
                    .armed_foe_near(team, ux, uy, 0.0, Some(STILL_NEAR))
                    .is_some()
                || field.is_some_and(|(nx, ny)| {
                    self.armed_foe_near(team, nx, ny, 0.0, Some(STILL_NEAR))
                        .is_some()
                });
            let calm = if threatened { 0.0 } else { calm + 8.0 * dt };
            if calm >= CALM {
                // Back to work, as after any interrupted order: its field, or the nearest (a lost refinery's vent sends
                // it to shards).
                if let Some(n) = node {
                    self.um(uid).last_node = Some(n);
                }
                self.resume_after(uid);
                return;
            }
            if let Task::Flee { calm: c, .. } = &mut self.um(uid).task {
                *c = calm;
            }
        }
        if !at_refuge {
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
