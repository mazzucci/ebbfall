use endfall_sim::data::*;
use endfall_sim::world::World;
#[test]
fn mini() {
    for (k1, o1) in [
        (UnitKind::Trooper, "move"),
        (UnitKind::SiegeTank, "move"),
        (UnitKind::SiegeTank, "idle"),
        (UnitKind::Trooper, "hold"),
    ] {
        let mut w = World::new(5, 1);
        w.disable_ai();
        w.units.clear();
        let mut spot = None;
        'f: for y in 20..50usize {
            for x in 20..44usize {
                if (y..y + 6).all(|b| (x..x + 10).all(|a| !w.map.blocked(a as _, b as _))) {
                    spot = Some((x as f64 * 32. + 200., y as f64 * 32. + 100.));
                    break 'f;
                }
            }
        }
        let (x, y) = spot.unwrap();
        let b = w.make_unit(UnitKind::SiegeTank, 0, x, y);
        if o1 == "hold" {
            w.hold_unit(b);
        }
        for _ in 0..150 {
            w.step();
        }
        let off = if o1 == "move" { 120. } else { 10. };
        let a = w.make_unit(k1, 0, x - off, y - off * 0.2);
        match o1 {
            "move" => {
                w.move_to(a, x, y);
            }
            "hold" => {
                w.hold_unit(a);
            }
            _ => {}
        }
        for _ in 0..600 {
            w.step();
        }
        let (a, b) = (w.unit(a).unwrap(), w.unit(b).unwrap());
        println!(
            "MINI {k1:?} {o1} by a Cannon: d {:.1} of {} | {:?} mode {} / {:?} mode {}",
            (a.x - b.x).hypot(a.y - b.y),
            a.r + b.r,
            a.task,
            a.mode.is_some(),
            b.task,
            b.mode.is_some()
        );
    }
}
