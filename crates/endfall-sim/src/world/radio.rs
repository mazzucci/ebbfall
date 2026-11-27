//! The Data center's area and the signal (data/radio.rs; apart since Nov 27). Two notions, both derived from the
//! buildings:
//!
//! - **The area** (`in_area`): within a finished Data center's (`conflux`) reach of its center, of the seat's own or an
//!   ally's, by exact distance. Placement reads it (`World::refusal`: an Expedition building goes up only inside it),
//!   and the client draws it (`radio_circles`, the same list), so the rule and the rim agree.
//! - **The signal** (`has_signal`): inside the area, or anywhere while a finished Uplink (`uplink`) of the seat or an
//!   ally stands (`signal_everywhere`). The Expedition's combat machines (`data::radio::needs_range`) go anywhere, at
//!   `IN_RANGE_SPEED` with the signal and at `OUT_OF_RANGE_SPEED` without (`radio_speed`, read by `live_speed` every
//!   tick from where the machine stands). Their orders and routes are a player's as any unit's: nothing keeps them
//!   inside. Only speed changes: a machine strikes as hard without the signal as with it.
//!
//! The sources are listed again whenever they change: checked at the start of every tick (a source counts from the
//! tick after it is done until the tick after it is gone), when a building is made and when the teams change. The list
//! is derived from the buildings, so deterministic and not hashed.

use super::*;
use crate::data::radio::{IN_RANGE_SPEED, OUT_OF_RANGE_SPEED, area_of, map_wide, needs_range};

/// Said to a seat's player when its machines gain the signal across the whole map (its first Uplink stands), and when
/// they lose it (its last Uplink fell).
pub const UPLINK_ON: &str = "Uplink online: your machines have the signal across the whole map.";
pub const UPLINK_OFF: &str =
    "Uplink lost: your machines are slower outside your Data centers' areas.";

/// What a source gives: an area round it (px), or the signal everywhere.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Reach {
    /// A Data center: its area, px from its center.
    Area(f64),
    /// An Uplink: the signal across the whole map (no area: buildings do not go up by it).
    Map,
}

/// A source: a finished Data center or Uplink.
#[derive(Clone, Copy, Debug)]
pub struct RadioSrc {
    pub id: Id,
    pub team: u8,
    pub x: f64,
    pub y: f64,
    pub reach: Reach,
}

/// What a building gives now, if anything.
fn reach_of(b: &Bldg) -> Option<Reach> {
    if !b.done {
        None
    } else if area_of(b.kind) > 0.0 {
        Some(Reach::Area(area_of(b.kind) * TILE))
    } else if map_wide(b.kind) {
        Some(Reach::Map)
    } else {
        None
    }
}

impl World {
    /// List the sources again if they changed since they were last listed (`force`: whatever they are, as when the
    /// teams change). Cheap when nothing changed: one pass over the buildings.
    pub(crate) fn refresh_radio(&mut self, force: bool) {
        let same = self
            .bldgs
            .iter()
            .filter(|b| reach_of(b).is_some())
            .map(|b| b.id)
            .eq(self.radio_src.iter().map(|s| s.id));
        if same && !force {
            return;
        }
        let wide_before: Vec<bool> = (0..self.seats() as u8)
            .map(|s| self.signal_everywhere(s))
            .collect();
        self.radio_src = self
            .bldgs
            .iter()
            .filter_map(|b| {
                reach_of(b).map(|reach| RadioSrc {
                    id: b.id,
                    team: b.team,
                    x: b.x,
                    y: b.y,
                    reach,
                })
            })
            .collect();
        self.radio_ver = self.radio_ver.wrapping_add(1);
        // Its player told when its machines gain or lose the signal across the map (a seat whose people has an area:
        // the Expedition's).
        for (s, before) in wide_before.into_iter().enumerate() {
            let s = s as u8;
            let now = self.signal_everywhere(s);
            if now != before && area_of(self.factions[s as usize].hq) > 0.0 {
                if now {
                    self.toast(s, UPLINK_ON, false);
                } else {
                    self.toast(s, UPLINK_OFF, true);
                }
            }
        }
    }

    /// The Data centers' areas `team` has (its own and its allies'), as `x, y, reach` (world px) each, in the
    /// buildings' order: the client draws their circles (a point is in the area when it lies in one of them).
    pub fn radio_circles(&self, team: u8) -> Vec<f64> {
        self.areas(team).flat_map(|(x, y, r)| [x, y, r]).collect()
    }

    /// Bumped whenever the sources are listed again (the client redraws the circles only then).
    pub fn radio_version(&self) -> u32 {
        self.radio_ver
    }

    /// Whether (x, y) (world px) is within `team`'s area (its own Data centers' and its allies'): within a Data
    /// center's reach of its center, by exact distance. Where its buildings go up.
    pub fn in_area(&self, team: u8, x: f64, y: f64) -> bool {
        self.in_area_by(team, x, y, 0.0)
    }

    /// Whether (x, y) lies within `extra` tiles past the edge of `team`'s area (by distance to the Data centers).
    pub fn in_area_by(&self, team: u8, x: f64, y: f64, extra: f64) -> bool {
        self.areas(team)
            .any(|(sx, sy, r)| dist(sx, sy, x, y) <= r + extra * TILE)
    }

    /// Whether `team`'s machines have the signal across the whole map: a finished Uplink of its own or an ally's
    /// stands.
    pub fn signal_everywhere(&self, team: u8) -> bool {
        self.radio_sources(team).any(|s| s.reach == Reach::Map)
    }

    /// Whether `team`'s machines have the signal at (x, y): everywhere while an Uplink stands, else inside its area.
    pub fn has_signal(&self, team: u8, x: f64, y: f64) -> bool {
        self.signal_everywhere(team) || self.in_area(team, x, y)
    }

    fn radio_sources(&self, team: u8) -> impl Iterator<Item = &RadioSrc> {
        self.radio_src
            .iter()
            .filter(move |s| self.allies(s.team, team))
    }

    /// `team`'s Data centers' areas (its own and its allies'), as (x, y, reach) in world px.
    fn areas(&self, team: u8) -> impl Iterator<Item = (f64, f64, f64)> + '_ {
        self.radio_sources(team).filter_map(|s| match s.reach {
            Reach::Area(r) => Some((s.x, s.y, r)),
            Reach::Map => None,
        })
    }

    /// A machine with its side's signal: it moves at `IN_RANGE_SPEED`.
    pub fn radio_boosted(&self, uid: Id) -> bool {
        let u = self.u(uid);
        needs_range(u.kind) && self.has_signal(u.team, u.x, u.y)
    }

    /// A machine without it (outside its side's area with no Uplink; anywhere, for a side with no source): it moves
    /// at `OUT_OF_RANGE_SPEED`.
    pub fn radio_slowed(&self, uid: Id) -> bool {
        let u = self.u(uid);
        needs_range(u.kind) && !self.has_signal(u.team, u.x, u.y)
    }

    /// `live_speed`'s factor for the signal: for a machine, `IN_RANGE_SPEED` with it and `OUT_OF_RANGE_SPEED` without;
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
