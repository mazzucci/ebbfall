//! Coverage (the arc, Nov 13: "machines need signal; mercenaries don't"; a penalty, not a wall, since Nov 27): the
//! Expedition's combat machines go anywhere, faster inside the coverage of a finished Data center or Uplink of their
//! side and slower outside it. The numbers here; the rules in world/radio.rs.

use super::{BldgKind, UnitKind};

/// The main building's (`conflux`, the Data center) range, in tiles.
pub const CONFLUX_RANGE: f64 = 18.0;
/// The Uplink's coverage, in tiles, the same on every map (Stelian, Nov 13: 54, so one forward Uplink covers a push
/// across a medium or a large map; 20, and 24 on the bigger maps, before).
pub const UPLINK_RANGE: f64 = 54.0;
/// A machine's speed inside coverage, as a multiple of its own.
pub const IN_RANGE_SPEED: f64 = 1.3;
/// A machine's speed outside coverage, as a multiple of its own (Stelian, Nov 27: the signal a penalty, not a wall;
/// before, it could not leave coverage at all). With no source left at all, its side's machines are outside everywhere.
pub const OUT_OF_RANGE_SPEED: f64 = 0.7;

/// The coverage a finished building of this kind gives (tiles), or 0.
pub fn range_of(kind: BldgKind) -> f64 {
    match kind {
        BldgKind::Conflux => CONFLUX_RANGE,
        BldgKind::Uplink => UPLINK_RANGE,
        _ => 0.0,
    }
}

/// Whether a building of this kind goes up only inside its seat's coverage (Stelian, Nov 15): every building of a
/// people whose headquarters gives coverage (the Expedition), but the sources themselves (the Data center, by its
/// headquarters spacing only, and the Uplink, anywhere explored). Placing only: a building stands and works whatever
/// happens to the coverage afterwards.
pub fn needs_coverage(hq: BldgKind, kind: BldgKind) -> bool {
    range_of(hq) > 0.0 && range_of(kind) == 0.0
}

/// Whether a unit of this kind is a machine that needs signal: the Expedition's combat machines (the Buggy, the Drone,
/// the Rover, the Android), faster inside coverage and slower outside it. Its Bots move at their own pace anywhere
/// (they walk out to build forward Uplinks and reach far mines: no bonus, no penalty), and so do its hired people and
/// the Kingdom's units.
pub fn needs_range(kind: UnitKind) -> bool {
    matches!(
        kind,
        UnitKind::Scythe | UnitKind::Monolith | UnitKind::Shrike | UnitKind::Umbra
    )
}
