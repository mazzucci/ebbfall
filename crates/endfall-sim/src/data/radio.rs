//! Coverage (the arc, Nov 13: "machines need signal; mercenaries don't"): the Expedition's combat machines work only
//! inside the coverage of a finished Data center or Uplink of their side, and move faster there. The numbers here;
//! the rules in world/radio.rs.

use super::{BldgKind, UnitKind};

/// The main building's (`conflux`, the Data center) range, in tiles.
pub const CONFLUX_RANGE: f64 = 18.0;
/// The Uplink's coverage, in tiles: wider than the Data center's, most of a map's quarter (the arc: 12 before); on
/// the bigger maps a little more.
pub const UPLINK_RANGE: f64 = 20.0;
pub const UPLINK_RANGE_BIG: f64 = 24.0;
/// A machine's speed inside coverage, as a multiple of its own.
pub const IN_RANGE_SPEED: f64 = 1.3;
/// A machine outside coverage (stranded: its Uplink fell) moves at this share of its own speed, and only towards it.
pub const STRANDED_SPEED: f64 = 0.6;
/// How far (tiles) past the edge of coverage a machine may go: none since the arc (the Drone had 5).
pub const LEASH_MARGIN: f64 = 0.0;

/// The coverage a finished building of this kind gives on a map `map_w` tiles wide (tiles), or 0.
pub fn range_of(kind: BldgKind, map_w: i32) -> f64 {
    match kind {
        BldgKind::Conflux => CONFLUX_RANGE,
        BldgKind::Uplink if map_w > 64 => UPLINK_RANGE_BIG,
        BldgKind::Uplink => UPLINK_RANGE,
        _ => 0.0,
    }
}

/// Whether a unit of this kind is a machine that needs signal: the Expedition's combat machines (the Buggy, the Drone,
/// the Rover, the Android). Its Bots are free (they walk out to build forward Uplinks and reach far mines, at their calm
/// pace: no bonus), and its hired people and the Kingdom's units fight anywhere.
pub fn needs_range(kind: UnitKind) -> bool {
    matches!(
        kind,
        UnitKind::Scythe | UnitKind::Monolith | UnitKind::Shrike | UnitKind::Umbra
    )
}
