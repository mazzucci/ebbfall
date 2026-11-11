//! The tower range (radio range, the re-theme): the Expedition's machines need range from a finished Data center or
//! Radio tower of their side. The numbers here; the coverage and the rules in world/radio.rs.

use super::{BldgKind, UnitKind};

/// The main building's (`conflux`, the Data center) range, in tiles.
pub const CONFLUX_RANGE: f64 = 18.0;
/// The turret's (`ward`, the Radio tower) range, in tiles.
pub const WARD_RANGE: f64 = 12.0;
/// The share of its speed a machine keeps outside range.
pub const OUT_OF_RANGE_SPEED: f64 = 0.75;
/// How far (tiles) past the edge of its side's range the flying machine (`shrike`, the Drone) may go.
pub const LEASH_MARGIN: f64 = 5.0;
/// How far (tiles) past the edge of its side's range an AI's machines chase.
pub const CHASE_MARGIN: f64 = 3.0;

/// The range a finished building of this kind gives (tiles), or 0.
pub fn range_of(kind: BldgKind) -> f64 {
    match kind {
        BldgKind::Conflux => CONFLUX_RANGE,
        BldgKind::Ward => WARD_RANGE,
        _ => 0.0,
    }
}

/// Whether a unit of this kind is a machine that needs range (the Expedition's Bot, Buggy, Rover and Drone; its people
/// and the Kingdom's units do not).
pub fn needs_range(kind: UnitKind) -> bool {
    matches!(
        kind,
        UnitKind::Lumen | UnitKind::Scythe | UnitKind::Monolith | UnitKind::Shrike
    )
}
