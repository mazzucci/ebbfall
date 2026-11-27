//! The Data center's area and the signal (the arc, Nov 13: "machines need signal; mercenaries don't"; a penalty, not a
//! wall, since Nov 27; placement and signal apart since Nov 27, Stelian: "buildings go up near a Data center; an Uplink
//! gives your machines the signal across the whole map"). The numbers here; the rules in world/radio.rs.
//!
//! - **The area** (placement): a finished Data center's `CONFLUX_RANGE` tiles. An Expedition building goes up only
//!   inside its side's area (`needs_area`); the Data center and the Uplink themselves anywhere explored.
//! - **The signal** (the machines' speed): inside the area, or anywhere while an Uplink of its side stands
//!   (`map_wide`). A machine with the signal moves at `IN_RANGE_SPEED`, one without at `OUT_OF_RANGE_SPEED`.

use super::{BldgKind, UnitKind};

/// The Data center's (`conflux`) area, in tiles: where its side's buildings go up, and where its machines have the
/// signal with no Uplink.
pub const CONFLUX_RANGE: f64 = 18.0;
/// A machine's speed with the signal, as a multiple of its own.
pub const IN_RANGE_SPEED: f64 = 1.3;
/// A machine's speed without it, as a multiple of its own (Stelian, Nov 27: the signal a penalty, not a wall, x0.7, then
/// x0.5 the same day; before, it could not leave coverage at all). With no Data center and no Uplink left, its side's
/// machines have none anywhere.
pub const OUT_OF_RANGE_SPEED: f64 = 0.5;

/// The area a finished building of this kind gives (tiles), or 0: the Data center's.
pub fn area_of(kind: BldgKind) -> f64 {
    match kind {
        BldgKind::Conflux => CONFLUX_RANGE,
        _ => 0.0,
    }
}

/// Whether a finished building of this kind gives its side's machines the signal across the whole map: the Uplink.
pub fn map_wide(kind: BldgKind) -> bool {
    kind == BldgKind::Uplink
}

/// Whether a building of this kind goes up only inside its seat's area (Stelian, Nov 15): every building of a people
/// whose headquarters gives one (the Expedition), but the Data center (by its headquarters spacing only) and the Uplink
/// (anywhere explored). Placing only: a building stands and works whatever happens to the area afterwards.
pub fn needs_area(hq: BldgKind, kind: BldgKind) -> bool {
    area_of(hq) > 0.0 && area_of(kind) == 0.0 && !map_wide(kind)
}

/// Whether a unit of this kind is a machine that needs signal: the Expedition's combat machines (the Buggy, the Drone,
/// the Rover, the Android), faster with it and slower without. Its Bots move at their own pace anywhere (they walk out
/// to raise new Data centers and reach far mines: no bonus, no penalty), and so do its hired people and the Kingdom's
/// units.
pub fn needs_range(kind: UnitKind) -> bool {
    matches!(
        kind,
        UnitKind::Scythe | UnitKind::Monolith | UnitKind::Shrike | UnitKind::Umbra
    )
}
