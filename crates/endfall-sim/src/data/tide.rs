//! The tide's numbers (PRD: the tide on the Shore map): the water level's cycle, its levels, the warning and the
//! sweep. Tunable: the balance lab moves them.

/// One cycle's phases (seconds, before the cycle's own spread): high water, the ebb (falling), low water, the flood
/// (rising). A game starts at high water, so the first low tide comes at about 1:30.
pub const TIDE_HIGH_S: f64 = 60.0;
pub const TIDE_FALL_S: f64 = 30.0;
pub const TIDE_LOW_S: f64 = 60.0;
pub const TIDE_RISE_S: f64 = 30.0;
/// Each cycle is longer or shorter than that by up to this share, drawn from the world's RNG as it starts.
pub const TIDE_SPREAD: f64 = 0.15;
/// The water level at low and at high water (tile height units: `Map::ground`). It moves one step at a time over the
/// ebb and the flood. Provisional: the Shore's flats (the tide's second PR) set the final pair with their height.
pub const WATER_LOW: i8 = -2;
pub const WATER_HIGH: i8 = 2;
/// Seconds before the flood starts that each seat with walkers on ground it will cover is warned (and its idle ones
/// sent to dry ground, `World::retreat`).
pub const TIDE_WARN_S: f64 = 20.0;
/// A walker still on ground the flood makes deep is swept to the nearest ground it may stand on, losing this share
/// of its maximum health, and stunned this long (unless the flood destroys instead: `World::flood_kills`).
pub const SWEEP_HP: f64 = 0.3;
pub const SWEEP_STUN_S: f64 = 2.0;
/// How far (tiles, a square radius) the sweep looks for ground to put a walker on.
pub const SWEEP_REACH: i32 = 24;
