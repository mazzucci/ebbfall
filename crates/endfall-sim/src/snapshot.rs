//! The flat snapshot arrays the client mirrors (one f64 per field, records back to back). Each record is declared
//! once, here: the macro writes both the function that fills it and the list of its field names, which the client
//! reads (through pkg/data.js) to find a field by name. A new field is one line, with no offsets to keep in step.

use crate::data::{BldgKind, ProjKind, UnitKind};
use crate::map::Node;
use crate::world::{Bldg, Phase, Proj, Task, Unit, World};

macro_rules! record {
    ($(#[$doc:meta])* $fields:ident, $push:ident, |$it:ident: &$ty:ty, $w:ident| { $($name:ident = $val:expr),* $(,)? }) => {
        $(#[$doc])*
        pub const $fields: &[&str] = &[$(stringify!($name)),*];
        #[allow(unused_variables)]
        pub fn $push(out: &mut Vec<f64>, $it: &$ty, $w: &World) {
            $( out.push(($val) as f64); )*
        }
    };
}

/// Task codes (the order of `TASKS`), the gather phase (-1 none) and the task's target id (0 none).
fn task_parts(t: &Task) -> (i32, i32, u32) {
    match *t {
        Task::Gather { node, phase, .. } => (t.code(), phase_code(phase), node),
        Task::Attack { target, .. } => (t.code(), -1, target),
        Task::Build { b } | Task::Repair { b } => (t.code(), -1, b),
        _ => (t.code(), -1, 0),
    }
}
fn phase_code(p: Phase) -> i32 {
    match p {
        Phase::Go => 0,
        Phase::Wait => 1,
        Phase::Mine => 2,
        Phase::Return => 3,
    }
}
/// Names of the task codes (Task::code) and gather phases, for the client.
pub const TASKS: &[&str] = &[
    "idle", "hold", "move", "amove", "attack", "gather", "build", "repair",
];
pub const PHASES: &[&str] = &["go", "wait", "mine", "return"];
pub const PROJ_KINDS: &[&str] = &["bolt", "shell", "missile"];
/// Queue slots sent per building (the queue holds up to five).
pub const QUEUE_SLOTS: usize = 5;

fn queued(b: &Bldg, i: usize) -> f64 {
    b.queue.get(i).map_or(-1.0, |k: &UnitKind| k.index() as f64)
}

record! {
    /// Per unit. carry_type: -1 none, 0 shards, 1 ether.
    UNIT_FIELDS, push_unit, |u: &Unit, w| {
        id = u.id, kind = u.kind.index(), team = u.team, x = u.x, y = u.y, hp = u.hp, maxhp = u.maxhp, r = u.r,
        face = u.face, flash = u.flash, carry = u.carry, carry_type = u.carry_ether.map_or(-1.0, |e| e as u8 as f64),
        task = task_parts(&u.task).0, phase = task_parts(&u.task).1, target = task_parts(&u.task).2, cd = u.cd,
    }
}

record! {
    /// Per building. q0..q4: queued unit kinds (-1 empty); research: 0 none, else upgrade index + 1.
    BLDG_FIELDS, push_bldg, |b: &Bldg, w| {
        id = b.id, kind = b.kind.index(), team = b.team, tx = b.tx, ty = b.ty, hp = b.hp, maxhp = b.maxhp,
        progress = b.progress, done = b.done as u8, prog = b.prog, flash = b.flash, aim = b.aim,
        has_rally = b.rally.is_some() as u8, rally_x = b.rally.map_or(0.0, |r| r.x), rally_y = b.rally.map_or(0.0, |r| r.y),
        rally_node = b.rally.and_then(|r| r.node).unwrap_or(0), queue_len = b.queue.len(),
        q0 = queued(b, 0), q1 = queued(b, 1), q2 = queued(b, 2), q3 = queued(b, 3), q4 = queued(b, 4),
        research = b.research.map_or(0.0, |(u, _)| u.index() as f64 + 1.0), research_prog = b.research.map_or(0.0, |(_, p)| p),
    }
}

record! {
    /// Per projectile; aim = the point it flies at.
    PROJ_FIELDS, push_proj, |p: &Proj, w| {
        x = p.x, y = p.y,
        kind = match p.kind { ProjKind::Bolt => 0, ProjKind::Shell => 1, ProjKind::Missile => 2 },
        team = p.team,
        aim_x = w.geo(p.target).map_or(p.x, |g| g.aim_point(p.x, p.y).0),
        aim_y = w.geo(p.target).map_or(p.y, |g| g.aim_point(p.x, p.y).1),
    }
}

record! {
    /// Per resource node; extractor: the building on a vent (0 none).
    NODE_FIELDS, push_node, |n: &Node, w| {
        id = n.id, ether = n.ether as u8, tx = n.tx, ty = n.ty, x = n.x, y = n.y, amount = n.amount,
        miners = n.miners, extractor = n.extractor.unwrap_or(0), r = n.r,
    }
}

record! {
    /// The world's scalars: clock, resources and supply per team, the end, stats, settings, upgrade levels.
    INFO_FIELDS, push_info, |w0: &World, w| {
        time = w.time, tick = w.tick, shards0 = w.res[0][0], ether0 = w.res[0][1], shards1 = w.res[1][0],
        ether1 = w.res[1][1], sup_used0 = w.sup[0][0], sup_cap0 = w.sup[0][1], sup_used1 = w.sup[1][0],
        sup_cap1 = w.sup[1][1], over = w.over as u8, winner = w.winner, built = w.stats.built, lost = w.stats.lost,
        killed = w.stats.killed, razed = w.stats.razed, seed = w.seed, diff = w.diff,
        weapons0 = w.upgrades[0][0], armor0 = w.upgrades[0][1], weapons1 = w.upgrades[1][0], armor1 = w.upgrades[1][1],
        map_kind = w.map_kind as u32,
        faction0 = w.factions[0].index(),
        faction1 = w.factions[1].index(),
    }
}

/// The record layouts and code names as JSON, for the client (build:wasm puts it in pkg/data.js).
pub fn schema_json() -> String {
    let list = |xs: &[&str]| {
        xs.iter()
            .map(|x| format!("\"{x}\""))
            .collect::<Vec<_>>()
            .join(",")
    };
    let kinds = |ks: Vec<&str>| list(&ks);
    format!(
        "{{\"unit\":[{}],\"bldg\":[{}],\"proj\":[{}],\"node\":[{}],\"info\":[{}],\"tasks\":[{}],\"phases\":[{}],\"projKinds\":[{}],\"unitKinds\":[{}],\"bldgKinds\":[{}],\"upgrades\":[{}],\"queueSlots\":{}}}",
        list(UNIT_FIELDS),
        list(BLDG_FIELDS),
        list(PROJ_FIELDS),
        list(NODE_FIELDS),
        list(INFO_FIELDS),
        list(TASKS),
        list(PHASES),
        list(PROJ_KINDS),
        kinds(
            crate::data::UNIT_KINDS
                .iter()
                .map(|k| k.def().key)
                .collect()
        ),
        kinds(
            crate::data::BLDG_KINDS
                .iter()
                .map(|k: &BldgKind| k.def().key)
                .collect()
        ),
        kinds(
            [crate::data::Upgrade::Weapons, crate::data::Upgrade::Armor]
                .iter()
                .map(|u| u.key())
                .collect()
        ),
        QUEUE_SLOTS,
    )
}
