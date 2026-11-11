//! The range (the Expedition rework's speed bonus): the Expedition's machines move faster inside the range of a
//! finished Data center or Uplink of their side. The numbers here; the rules in world/radio.rs.

use super::{BldgKind, UnitKind};

/// The main building's (`conflux`, the Data center) range, in tiles.
pub const CONFLUX_RANGE: f64 = 18.0;
/// The Uplink's range, in tiles (a starting number).
pub const UPLINK_RANGE: f64 = 12.0;
/// A machine's speed inside range, as a multiple (normal speed everywhere else).
pub const IN_RANGE_SPEED: f64 = 1.3;
/// How far (tiles) past the edge of its side's range the flying machine (`shrike`, the Drone) may go.
pub const LEASH_MARGIN: f64 = 5.0;

/// The range a finished building of this kind gives (tiles), or 0.
pub fn range_of(kind: BldgKind) -> f64 {
    match kind {
        BldgKind::Conflux => CONFLUX_RANGE,
        BldgKind::Uplink => UPLINK_RANGE,
        _ => 0.0,
    }
}

/// Whether a unit of this kind is a machine the range speeds up (the Expedition's Bot, Buggy, Rover and Drone; its
/// people and the Kingdom's units are not).
pub fn needs_range(kind: UnitKind) -> bool {
    matches!(
        kind,
        UnitKind::Lumen | UnitKind::Scythe | UnitKind::Monolith | UnitKind::Shrike
    )
}
