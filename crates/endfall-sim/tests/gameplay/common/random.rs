//! Random orders through the same Game API the browser uses (stale and nonsense ids included).

use super::*;

/// A random building key of either race, or one that is not a kind (random orders try them all).
fn any_bldg_key(r: &mut Mulberry32) -> &'static str {
    let i = r.below(BLDG_KINDS.len() as u32 + 1) as usize;
    BLDG_KINDS.get(i).map_or("nonsense", |k| k.def().key)
}

/// A random unit key of either race, or one that is not a kind.
fn any_unit_key(r: &mut Mulberry32) -> &'static str {
    let i = r.below(UNIT_KINDS.len() as u32 + 1) as usize;
    UNIT_KINDS.get(i).map_or("nonsense", |k| k.def().key)
}

/// One random order through the same Game API the browser uses, with ids that may be stale or garbage.
pub fn random_order(g: &mut Game, r: &mut Mulberry32) {
    random_order_with(g, r, true);
}

/// A random order; `cheats` also allows granting resources (not a player order: it is never logged).
pub fn random_order_with(g: &mut Game, r: &mut Mulberry32, cheats: bool) {
    let w = g.world();
    let mut ids: Vec<u32> = w
        .units
        .iter()
        .map(|u| u.id)
        .chain(w.bldgs.iter().map(|b| b.id))
        .chain(w.map.nodes.iter().map(|n| n.id))
        .collect();
    ids.extend([0, 1, 99_999, w.units.last().map_or(5, |u| u.id + 1)]);
    let pick = |r: &mut Mulberry32| ids[r.below(ids.len() as u32) as usize];
    let (x, y) = (r.below(2200) as f64 - 60.0, r.below(2200) as f64 - 60.0);
    let (a, b) = (pick(r), pick(r));
    match r.below(18) {
        0 => g.move_to(a, x, y),
        1 => g.attack_move(a, x, y),
        2 => g.attack_ent(a, b),
        3 => g.stop_unit(a),
        4 => g.hold_unit(a),
        5 => g.start_gather(a, b),
        6 => g.start_build(a, b),
        7 => {
            let _ = g.place_building(
                r.below(3) as u8,
                any_bldg_key(r),
                (x / 32.0) as i32,
                (y / 32.0) as i32,
                a,
            );
        }
        8 => {
            let _ = g.queue_unit(a, any_unit_key(r));
        }
        9 => g.cancel_queue(a, r.below(7)),
        10 => g.set_rally(a, x, y, if r.below(2) == 0 { b } else { 0 }),
        11 => g.formation(&[a, b, pick(r)], x, y),
        12 if cheats => g.set_resources(PLAYER, r.below(3000) as i32, r.below(1000) as i32),
        13 => g.cancel_construction(a),
        14 => {
            let i = r.below(UPGRADES.len() as u32 + 1) as usize;
            let _ = g.research(a, UPGRADES.get(i).map_or("nonsense", |u| u.def().key));
        }
        15 => g.cancel_research(a),
        16 => g.repair(a, b),
        17 => {
            let i = r.below(ABILITIES.len() as u32 + 1) as usize;
            let _ = g.cast(
                &[a, b, pick(r)],
                ABILITIES.get(i).map_or("nonsense", |k| k.def().key),
            );
        }
        _ => {}
    }
}
