//! Coverage (the arc, Nov 13: "machines need signal; mercenaries don't"; a penalty, not a wall, since Nov 27): the
//! Expedition's combat machines (`data::radio::needs_range`) go anywhere, at `IN_RANGE_SPEED` inside the coverage of a
//! finished Data center (`conflux`) or Uplink (`uplink`) of their own seat or an ally, and at `OUT_OF_RANGE_SPEED`
//! outside it (`radio_speed`, read by `live_speed` every tick from where the machine stands). Their orders and routes
//! are a player's as any unit's: nothing keeps them inside. A seat with no source at all has its machines outside
//! everywhere. Only speed changes: a machine strikes as hard outside as inside.
//!
//! In range means by exact distance: a point is in range when its distance to a source's center is at most the
//! source's reach (`in_radio`), so the client's circles (`radio_circles`, the same list) and the rule agree. The
//! sources are listed again whenever they change: checked at the start of every tick (a source counts from the tick
//! after it is done until the tick after it is gone), when a building is made and when the teams change. The list is
//! derived from the buildings, so deterministic and not hashed.

use super::*;
use crate::data::radio::{IN_RANGE_SPEED, OUT_OF_RANGE_SPEED, needs_range, range_of};

/// A source of range: a finished Data center or Uplink.
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
    /// List the sources again if they changed since they were last listed (`force`: whatever they are, as when the
    /// teams change). Cheap when nothing changed: one pass over the buildings.
    pub(crate) fn refresh_radio(&mut self, force: bool) {
        let same = self
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
        self.radio_ver = self.radio_ver.wrapping_add(1);
    }

    /// The sources `team` has range from (its own and its allies'), as `x, y, reach` (world px) each, in the
    /// buildings' order: the client draws their circles (a point is in range when it lies in one of them).
    pub fn radio_circles(&self, team: u8) -> Vec<f64> {
        self.radio_sources(team)
            .flat_map(|s| [s.x, s.y, s.reach])
            .collect()
    }

    /// Bumped whenever the sources are listed again (the client redraws the circles only then).
    pub fn radio_version(&self) -> u32 {
        self.radio_ver
    }

    /// Whether (x, y) (world px) is within `team`'s range (its own sources and its allies'): within a source's reach
    /// of its center, by exact distance.
    pub fn in_radio(&self, team: u8, x: f64, y: f64) -> bool {
        self.in_radio_by(team, x, y, 0.0)
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

    /// A machine inside its side's range: it moves at `IN_RANGE_SPEED`.
    pub fn radio_boosted(&self, uid: Id) -> bool {
        let u = self.u(uid);
        needs_range(u.kind) && self.in_radio(u.team, u.x, u.y)
    }

    /// A machine outside its side's range (anywhere, for a side with no source): it moves at `OUT_OF_RANGE_SPEED`.
    pub fn radio_slowed(&self, uid: Id) -> bool {
        let u = self.u(uid);
        needs_range(u.kind) && !self.in_radio(u.team, u.x, u.y)
    }

    /// `live_speed`'s factor for coverage: for a machine, `IN_RANGE_SPEED` inside it and `OUT_OF_RANGE_SPEED` outside;
    /// for anything else, 1.
    pub(crate) fn radio_speed(&self, uid: Id) -> f64 {
        if self.radio_boosted(uid) {
            IN_RANGE_SPEED
        } else if self.radio_slowed(uid) {
            OUT_OF_RANGE_SPEED
        } else {
            1.0
        }
    }
}
