//! The world's entities and records: tasks, units, buildings, projectiles, events, stats and the shape an entity has
//! when it is looked up (Geo).

use super::*;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Phase {
    Go,
    Wait,
    Mine,
    Return,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Back {
    pub x: f64,
    pub y: f64,
    pub amove: bool,
}

/// A unit's effective stats for this tick, read once at its start (`World::live`): its kind's numbers, which abilities
/// and modes will change there and only there.
#[derive(Clone, Copy)]
pub(crate) struct Live {
    /// Reach (px, to the target's edge, from the shooter's centre: its radius not counted); 0 while it cannot fire.
    pub range: f64,
    /// A siege gun's blind ring (px, the same measure as find_target's: plus its radius); 0 = none.
    pub min: f64,
    /// A siege gun's reach once deployed (px, plus its radius), deployed or not: where it sets up. None otherwise.
    pub siege: Option<f64>,
    /// A deployed siege gun's blind ring (px; it also fires only on what its side sees): `find_target`'s for the gun
    /// it fires now. None for every other shooter, a siege gun on its tracks (its light gun) included.
    pub ring: Option<f64>,
    pub combat: bool,
    pub team: u8,
    pub r: f64,
    pub sight: f64,
    pub kind: UnitKind,
    pub hits: (bool, bool),
}

impl Live {
    /// For `find_target`, looking for where to set up: a siege gun's blind ring whether it is deployed or not (what
    /// it will deploy for must be outside it, and seen), None for other shooters.
    pub fn setup_ring(&self) -> Option<f64> {
        self.siege.map(|_| self.min)
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Task {
    Idle,
    Hold,
    Move {
        x: f64,
        y: f64,
    },
    AMove {
        x: f64,
        y: f64,
    },
    Attack {
        target: Id,
        back: Option<Back>,
    },
    Gather {
        node: Id,
        phase: Phase,
        timer: f64,
    },
    Build {
        b: Id,
    },
    /// Restore a damaged, finished building of our team (harvesters).
    Repair {
        b: Id,
    },
    /// A worker running from an armed enemy (world/flee.rs): to (x, y), back to `node` once `calm` reaches its mark.
    Flee {
        node: Option<Id>,
        x: f64,
        y: f64,
        calm: f64,
    },
}

impl Task {
    /// A small number per kind of task (for the state hash; the snapshot uses the same order).
    pub fn code(&self) -> i32 {
        match self {
            Task::Idle => 0,
            Task::Hold => 1,
            Task::Move { .. } => 2,
            Task::AMove { .. } => 3,
            Task::Attack { .. } => 4,
            Task::Gather { .. } => 5,
            Task::Build { .. } => 6,
            Task::Repair { .. } => 7,
            Task::Flee { .. } => 8,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Unit {
    pub id: Id,
    pub kind: UnitKind,
    pub team: u8,
    pub x: f64,
    pub y: f64,
    pub hp: f64,
    pub maxhp: f64,
    /// Shields over the hull (0 for a race without them), and when it was last hit (s; shields wait to regenerate).
    pub sh: f64,
    pub maxsh: f64,
    pub hit_at: f64,
    /// When it was last damaged by anything (s; a worker runs), and when its player last sent it to a field (it
    /// stays there a while even under fire).
    pub struck: f64,
    pub told: f64,
    pub r: f64,
    pub task: Task,
    pub path: Option<Vec<Pt>>,
    pub cd: f64,
    pub face: f64,
    pub carry: i32,
    /// Some(true) = ether, Some(false) = shards, None = never carried anything.
    pub carry_ether: Option<bool>,
    pub last_node: Option<Id>,
    pub repath: f64,
    pub flash: f64,
    pub aggro_cd: f64,
    /// Seconds a builder has stayed within STUCK_RADIUS of `anchor` without reaching its site.
    pub stuck: f64,
    pub anchor: (f64, f64),
    /// Game time before which this harvester is not picked as a builder again (it just failed to reach a site).
    pub no_build_until: f64,
    /// Medic: seconds until the next heal effect event.
    pub heal_fx: f64,
    /// The tick a Medic last healed this unit: one Medic per patient per tick (heals do not stack).
    pub healed_at: u32,
    /// Ability cooldowns left (s), by slot in the kind's `abilities` order.
    pub ab_cd: [f64; ABILITY_SLOTS],
    /// A timed boost (Stim, Overcharge) and the game time it ends.
    pub boost: Option<(AbilityKind, f64)>,
    /// The toggle that is on (Deploy), and the seconds left settling in or packing up (no moving or firing then).
    pub mode: Option<AbilityKind>,
    pub swap: f64,
    /// Seconds left warping in (a Vael unit sent to a power field): it cannot move, fire or heal, but can be hit.
    pub warp: f64,
    /// A group's marching pace (px/s): set by a group order to its slowest member's speed, so the group arrives
    /// together; it only caps a unit on the move (not in a fight), and any new order clears it.
    pub pace: Option<f64>,
}

/// A builder that stays within STUCK_RADIUS px of one spot for BUILDER_PATIENCE seconds without reaching its
/// site gives up. Walking (even away from the site, around an obstacle) leaves the radius within a fraction of a
/// second; jittering against a corner or being walled in does not.
pub const BUILDER_PATIENCE: f64 = 6.0;
pub const STUCK_RADIUS: f64 = 12.0;
/// Repairing a building from nothing to full costs this share of its price, paid as the hp come back. A harvester
/// repairs at construction speed (the building's build time for its whole hp).
pub const REPAIR_COST: f64 = 0.25;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rally {
    pub x: f64,
    pub y: f64,
    pub node: Option<Id>,
}

#[derive(Clone, Debug)]
pub struct Bldg {
    pub id: Id,
    pub kind: BldgKind,
    pub team: u8,
    pub tx: i32,
    pub ty: i32,
    pub w: i32,
    pub h: i32,
    pub x: f64,
    pub y: f64,
    pub hp: f64,
    pub maxhp: f64,
    pub sh: f64,
    pub maxsh: f64,
    pub hit_at: f64,
    /// Warp-in: the site has been planted and grows by itself.
    pub planted: bool,
    /// Inside a power field (always true for a building that needs none).
    pub powered: bool,
    pub progress: f64,
    pub done: bool,
    pub queue: Vec<UnitKind>,
    pub prog: f64,
    pub rally: Option<Rally>,
    pub cd: f64,
    pub flash: f64,
    pub r: f64,
    pub vent: Option<Id>,
    pub aim: f64,
    /// Upgrade being researched here and its progress (0..1).
    pub research: Option<(Upgrade, f64)>,
    /// Fractions of shards and ether owed for repairs, charged a whole unit at a time.
    pub repair_debt: [f64; 2],
}

impl Bldg {
    /// Its footprint, for approach and edge distances.
    pub fn geo(&self) -> Geo {
        Geo::Rect {
            tx: self.tx,
            ty: self.ty,
            w: self.w,
            h: self.h,
            x: self.x,
            y: self.y,
            r: self.r,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Proj {
    pub x: f64,
    pub y: f64,
    pub target: Id,
    pub speed: f64,
    pub dmg: f64,
    pub kind: ProjKind,
    pub by: Id,
    /// The shooter's kind as `World::lost_to` counts it, fixed when it was fired (the shooter may die before it lands).
    pub by_slot: usize,
    pub team: u8,
    /// The shooter's splash (share of the damage, radius in px), fixed when it was fired.
    pub splash: f64,
    pub splash_r: f64,
}

#[derive(Clone, Debug, PartialEq)]
/// Events are for one seat (`team`: whose player sees or hears it) or, with no team, for whoever can see the spot;
/// `Game::drain_events` passes on those of its own seat.
pub enum Event {
    /// Something of `team`'s was hit by another seat (throttled: one per fight, see ALERT_*).
    Attacked {
        team: u8,
        x: f64,
        y: f64,
        building: bool,
        /// The unseen alert: by something this team cannot see (a cloaked raider where it detects nothing), told at
        /// most once every 30 s; other hits by it meanwhile are ordinary alerts.
        unseen: bool,
    },
    /// A Medic healing: from (x, y) to the patient at (tx, ty).
    Heal {
        x: f64,
        y: f64,
        tx: f64,
        ty: f64,
        /// A Halo mending shields (a Medic healing otherwise).
        mend: bool,
    },
    Sfx {
        team: u8,
        name: &'static str,
    },
    /// A mark on one seat's minimap (something of theirs finished, or wants their attention).
    Ping {
        team: u8,
        x: f64,
        y: f64,
    },
    Toast {
        team: u8,
        msg: String,
        bad: bool,
    },
    Burst {
        x: f64,
        y: f64,
        r: f64,
        team: u8,
        n: u32,
    },
    Hit {
        x: f64,
        y: f64,
        big: bool,
    },
    /// A shot: where, the weapon ("bolt", "shell", "missile", "melee") and which seats see it (bit `t` for seat `t`:
    /// their own shots, or the shooter in their sight).
    Fire {
        x: f64,
        y: f64,
        weapon: &'static str,
        seen: u8,
    },
    /// An ability used where the caster stands (after a Blink: where it landed), for the seats that see it.
    Cast {
        x: f64,
        y: f64,
        ability: &'static str,
        seen: u8,
    },
}

/// Ticks between samples of `World::army_log` (10 s).
pub const ARMY_LOG_EVERY: u32 = 300;

#[derive(Clone, Copy, Debug, Default)]
pub struct Stats {
    pub built: u32,
    pub lost: u32,
    pub killed: u32,
    pub razed: u32,
}

/// Shape of an entity at the moment it is looked up: what approach/edge-distance/closest-point need.
#[derive(Clone, Copy, Debug)]
pub enum Geo {
    Round {
        x: f64,
        y: f64,
        r: f64,
    },
    Rect {
        tx: i32,
        ty: i32,
        w: i32,
        h: i32,
        x: f64,
        y: f64,
        r: f64,
    },
}

impl Geo {
    pub fn center(&self) -> (f64, f64) {
        match *self {
            Geo::Round { x, y, .. } | Geo::Rect { x, y, .. } => (x, y),
        }
    }
    pub fn r(&self) -> f64 {
        match *self {
            Geo::Round { r, .. } | Geo::Rect { r, .. } => r,
        }
    }
    /// Closest point to p (the center for round things), as JS closestPt/target selection does.
    pub fn aim_point(&self, px: f64, py: f64) -> (f64, f64) {
        match *self {
            Geo::Round { x, y, .. } => (x, y),
            Geo::Rect { tx, ty, w, h, .. } => (
                clamp(px, tx as f64 * TILE, (tx + w) as f64 * TILE),
                clamp(py, ty as f64 * TILE, (ty + h) as f64 * TILE),
            ),
        }
    }
    pub fn edge_dist(&self, px: f64, py: f64) -> f64 {
        match *self {
            Geo::Round { x, y, r } => dist(x, y, px, py) - r,
            Geo::Rect { .. } => {
                let (cx, cy) = self.aim_point(px, py);
                dist(cx, cy, px, py)
            }
        }
    }
    pub fn is_rect(&self) -> bool {
        matches!(self, Geo::Rect { .. })
    }
}
