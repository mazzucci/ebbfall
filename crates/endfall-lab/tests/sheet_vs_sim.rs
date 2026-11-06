//! The formula sheet's time to kill against real one-on-one fights in the sim: within 10%.

use endfall_lab::sheet::{rows, time_to_kill};
use endfall_sim::data::UnitKind;
use endfall_sim::world::World;

/// Seconds from the target's first damage to its death, `attacker` (made too tough to fall to return fire) firing
/// at a held `target` on open ground.
fn fight(attacker: UnitKind, target: UnitKind) -> f64 {
    let mut w = World::new(1, 1);
    w.disable_ai();
    w.units.clear();
    let (x, y) = (900.0, 1200.0);
    for ty in (y as i32 / 32 - 6)..(y as i32 / 32 + 6) {
        for tx in (x as i32 / 32 - 8)..(x as i32 / 32 + 4) {
            let i = w.map.idx(tx, ty);
            w.map.rock[i] = 0;
        }
    }
    let t = w.make_unit(target, 1, x, y);
    w.hold_unit(t);
    let a = w.make_unit(attacker, 0, x - 120.0, y);
    w.units.iter_mut().find(|u| u.id == a).unwrap().hp = 1e9;
    w.attack_ent(a, t);
    let full = |w: &World| w.unit(t).map(|u| (u.hp, u.sh));
    let start = full(&w).unwrap();
    let mut first = None;
    for tick in 0..120 * 30 {
        w.step();
        w.events.clear();
        match full(&w) {
            None => return (tick - first.expect("hit before it fell")) as f64 / 30.0,
            Some(now) if first.is_none() && now != start => first = Some(tick),
            _ => {}
        }
    }
    panic!("{target:?} still standing after two minutes");
}

#[test]
fn the_sheets_time_to_kill_matches_a_fight_in_the_sim() {
    for (attacker, target, why) in [
        (
            UnitKind::Trooper,
            UnitKind::Scythe,
            "shields, then armour 1",
        ),
        // (an armoured target that never settles: a held Breakwater beaches, armour 6, which the sheet leaves out)
        (UnitKind::Trooper, UnitKind::Interceptor, "armour 1"),
        (UnitKind::Lancer, UnitKind::Shrike, "a flyer with shields"),
    ] {
        let row = rows().into_iter().find(|r| r.kind == attacker).unwrap();
        let sheet = time_to_kill(&row, target).expect("it can hit it");
        let sim = fight(attacker, target);
        assert!(
            (sheet - sim).abs() <= 0.1 * sim.max(sheet),
            "{attacker:?} on {target:?} ({why}): sheet {sheet:.2} s, sim {sim:.2} s"
        );
        eprintln!("{attacker:?} on {target:?} ({why}): sheet {sheet:.2} s, sim {sim:.2} s");
    }
}
