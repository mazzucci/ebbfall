//! Scratch (fix batch 2, item 7): how units that overlap part, or do not. Prints measurements, asserts nothing.
//! cargo test --release --test stuck -- --nocapture --test-threads=1
use UnitKind::*;
use endfall_sim::data::*;
use endfall_sim::map::Id;
use endfall_sim::world::{Task, World};

const TPS: u32 = 30;

fn arena(seed: u32) -> World {
    let mut w = World::new(seed, 1);
    w.disable_ai();
    w.units.clear();
    w.recalc_supply(PLAYER);
    w.recalc_supply(ENEMY);
    // (open ground: no hills, so a scene has room and the numbers are the units' own)
    for y in 1..w.map.h - 1 {
        for x in 1..w.map.w - 1 {
            let i = w.map.idx(x, y);
            w.map.rock[i] = 0;
        }
    }
    w
}
/// The middle (px) of a clear w x h tile rectangle (nearest the map's middle).
fn clear(w: &World, rw: i32, rh: i32) -> (f64, f64) {
    let mut best: Option<(i32, i32, i32)> = None;
    for y in 2..w.map.h - rh - 2 {
        for x in 2..w.map.w - rw - 2 {
            if (y..y + rh).all(|b| (x..x + rw).all(|a| !w.map.blocked(a, b))) {
                let k = (x + rw / 2 - 32).abs() + (y + rh / 2 - 32).abs();
                if best.is_none_or(|b| k < b.0) {
                    best = Some((k, x, y));
                }
            }
        }
    }
    let (_, x, y) = best.expect("clear ground");
    (
        (x as f64 + rw as f64 / 2.0) * TILE,
        (y as f64 + rh as f64 / 2.0) * TILE,
    )
}
fn d(w: &World, a: Id, b: Id) -> f64 {
    match (w.unit(a), w.unit(b)) {
        (Some(a), Some(b)) => (a.x - b.x).hypot(a.y - b.y),
        _ => f64::NAN,
    }
}
fn sum(w: &World, a: Id, b: Id) -> f64 {
    w.unit(a).map_or(f64::NAN, |u| u.r) + w.unit(b).map_or(f64::NAN, |u| u.r)
}
fn run(w: &mut World, ticks: u32) {
    for _ in 0..ticks {
        w.step();
        w.events.clear();
    }
}
fn st(w: &World, a: Id) -> String {
    w.unit(a).map_or("dead".into(), |u| {
        let t = format!("{:?}", u.task);
        format!(
            "{}{}",
            t.split([' ', '{']).next().unwrap(),
            if u.mode.is_some() { "+set" } else { "" }
        )
    })
}
/// d at 0, 0.1, 0.5, 1, 2, 4, 10, 30 s from now, with the last state.
fn series(w: &mut World, name: &str, a: Id, b: Id) {
    let mut out = format!("{name:58} sum {:2.0} |", sum(w, a, b));
    let mut at = 0;
    for t in [0, 3, 15, 30, 60, 120, 300, 900] {
        run(w, t - at);
        at = t;
        out += &format!(" {:5.1}", d(w, a, b));
    }
    println!("{out} | {} / {}", st(w, a), st(w, b));
}
fn set_order(w: &mut World, id: Id, o: &str, x: f64, y: f64) {
    match o {
        "move" => w.move_to(id, x, y),
        "amove" => w.attack_move(id, x, y),
        "hold" => w.hold_unit(id),
        _ => {}
    }
}

#[test]
fn a_placed_pairs() {
    println!("\n== A. pairs put on top of each other, left alone (d px at 0 .1 .5 1 2 4 10 30 s)");
    let base = arena(5);
    let (x, y) = clear(&base, 12, 10);
    for (k1, o1, k2, o2) in [
        (Knight, "", Knight, ""),
        (Knight, "", SiegeTank, ""),
        (Knight, "hold", SiegeTank, ""),
        (Knight, "", SiegeTank, "hold"),
        (Knight, "hold", SiegeTank, "hold"),
        (SiegeTank, "", SiegeTank, ""),
        (Knight, "hold", Knight, "hold"),
        (Knight, "", Knight, "hold"),
        (Trooper, "hold", Trooper, "hold"),
        (Monolith, "", Monolith, ""),
        (Monolith, "", Monolith, "hold"),
    ] {
        for gap in [0.0, 10.0] {
            let mut w = arena(5);
            let a = w.make_unit(k1, PLAYER, x, y);
            let b = w.make_unit(k2, PLAYER, x + gap, y);
            set_order(&mut w, a, o1, 0., 0.);
            set_order(&mut w, b, o2, 0., 0.);
            series(
                &mut w,
                &format!("{k1:?} {o1} + {k2:?} {o2}, {gap} px apart"),
                a,
                b,
            );
        }
    }
}

#[test]
fn b_one_point() {
    println!(
        "\n== B. a pair sent to one point (d from the order's 4th second: when both could have arrived, +0 .. +30 s)"
    );
    let base = arena(5);
    let (x, y) = clear(&base, 20, 10);
    for (k1, k2) in [
        (Knight, SiegeTank),
        (SiegeTank, SiegeTank),
        (Knight, Knight),
        (Trooper, SiegeTank),
        (Rider, SiegeTank),
        (Monolith, Monolith),
    ] {
        for o in ["formation", "amove group", "move each"] {
            let mut w = arena(5);
            let a = w.make_unit(k1, PLAYER, x - 200., y - 20.);
            let b = w.make_unit(k2, PLAYER, x - 200., y + 20.);
            match o {
                "formation" => w.formation(&[a, b], x, y),
                "amove group" => w.attack_move_group(&[a, b], x, y),
                _ => {
                    w.move_to(a, x, y);
                    w.move_to(b, x, y);
                }
            }
            run(&mut w, 4 * TPS);
            series(&mut w, &format!("{k1:?} + {k2:?}, {o}"), a, b);
        }
    }
    println!("-- a second unit ordered right onto (or near) a firm one (from the order)");
    for (k1, k2, hold) in [
        (Knight, SiegeTank, false),
        (SiegeTank, SiegeTank, false),
        (Trooper, SiegeTank, false),
        (Knight, Knight, true),
        (Archer(), SiegeTank, false),
    ] {
        for (o, off) in [
            ("move", 0.0),
            ("amove", 0.0),
            ("move", 5.0),
            ("move", 10.0),
            ("move", 15.0),
            ("move", 22.0),
        ] {
            let mut w = arena(5);
            let b = w.make_unit(k2, PLAYER, x, y);
            if hold {
                w.hold_unit(b);
            }
            run(&mut w, 4 * TPS);
            let a = w.make_unit(k1, PLAYER, x - 150., y - 30.);
            set_order(&mut w, a, o, x + off, y);
            series(
                &mut w,
                &format!("{k1:?} {o} {off} px off a firm {k2:?}"),
                a,
                b,
            );
        }
    }
}
#[allow(non_snake_case)]
fn Archer() -> UnitKind {
    Lancer
}

#[test]
fn c_leave() {
    println!(
        "\n== C. ordered away (300 px east): the time to be 60 px from the other, worst of the tries (s; - never in 20 s)"
    );
    let base = arena(5);
    let (x, y) = clear(&base, 26, 10);
    for (k1, k2, who) in [
        (Knight, SiegeTank, 0),
        (Knight, SiegeTank, 1),
        (Knight, SiegeTank, 2),
        (SiegeTank, SiegeTank, 0),
        (Knight, Knight, 0),
    ] {
        for gap in [
            (0.0, 0.0),
            (10.0, 0.0),
            (10.0, 3.0),
            (-10.0, 0.0),
            (28.0, 0.0),
            (28.0, 0.5),
            (28.0, 5.0),
        ] {
            let mut w = arena(5);
            let a = w.make_unit(k1, PLAYER, x - 150., y);
            let b = w.make_unit(k2, PLAYER, x - 150. + gap.0, y + gap.1);
            w.hold_unit(a);
            w.hold_unit(b);
            run(&mut w, 5 * TPS);
            if who != 1 {
                w.move_to(a, x + 150., y);
            }
            if who != 0 {
                w.move_to(b, x + 150., y + if who == 2 { 28. } else { 0. });
            }
            let mut at = None;
            for t in 0..20 * TPS {
                run(&mut w, 1);
                if at.is_none() && d(&w, a, b) > 60. {
                    at = Some(t as f64 / 30.);
                }
            }
            println!(
                "{:18} {:24} at ({:5.1},{:4.1}): {}  | {} / {}, d {:.1}",
                format!("{k1:?}+{k2:?}"),
                ["first goes", "second goes", "both go (28 px apart)"][who],
                gap.0,
                gap.1,
                at.map_or("-".into(), |t| format!("{t:.1}")),
                st(&w, a),
                st(&w, b),
                d(&w, a, b)
            );
        }
    }
}

#[test]
fn d_trapped() {
    println!(
        "\n== D. one unit among firm ones 28 px apart (a formation's spacing), ordered 200 px out: the share that got out in 20 s"
    );
    let base = arena(5);
    let (x, y) = clear(&base, 20, 16);
    for k1 in [Trooper, Lancer, Rider, Knight, Harvester] {
        for (k2, hold) in [(SiegeTank, false), (Knight, true), (Trooper, true)] {
            let mut out = 0;
            let mut n = 0;
            for dir in 0..16 {
                let mut w = arena(5);
                let a = w.make_unit(k1, PLAYER, x, y);
                for i in -1..=1 {
                    for j in -1..=1 {
                        if (i, j) != (0, 0) {
                            let b = w.make_unit(k2, PLAYER, x + 28. * i as f64, y + 28. * j as f64);
                            if hold {
                                w.hold_unit(b);
                            }
                        }
                    }
                }
                run(&mut w, 4 * TPS);
                let an = dir as f64 * std::f64::consts::TAU / 16.0 + 0.05;
                let to = (x + 200. * an.cos(), y + 200. * an.sin());
                w.move_to(a, to.0, to.1);
                run(&mut w, 20 * TPS);
                let u = w.unit(a).unwrap();
                n += 1;
                if (u.x - to.0).hypot(u.y - to.1) < 60. {
                    out += 1;
                }
            }
            println!(
                "{k1:?} among 8 {k2:?}{}: {out} of {n} got out",
                if hold { " (Hold)" } else { " (deployed)" }
            );
        }
    }
    println!(
        "-- a row of firm ones 28 px apart, a unit crosses it (from 100 px one side to 100 px the other), 16 crossing points"
    );
    for k1 in [Trooper, Lancer, Rider, Knight] {
        for (k2, hold) in [(SiegeTank, false), (Trooper, true)] {
            for cnt in [2, 3, 5] {
                let (mut through, mut worst) = (0, 0.0f64);
                for i in 0..16 {
                    let mut w = arena(5);
                    for j in 0..cnt {
                        let b = w.make_unit(
                            k2,
                            PLAYER,
                            x,
                            y + 28. * (j as f64 - (cnt as f64 - 1.) / 2.),
                        );
                        if hold {
                            w.hold_unit(b);
                        }
                    }
                    run(&mut w, 4 * TPS);
                    let yy = y - 14. + 28. * i as f64 / 15.;
                    let a = w.make_unit(k1, PLAYER, x - 100., yy);
                    w.move_to(a, x + 100., yy);
                    let mut t = 0;
                    while t < 20 * TPS && w.unit(a).unwrap().x < x + 60. {
                        run(&mut w, 1);
                        t += 1;
                    }
                    if t < 20 * TPS {
                        through += 1;
                        worst = worst.max(t as f64 / 30.);
                    }
                }
                println!(
                    "{k1:?} through a row of {cnt} {k2:?}: {through} of 16, the slowest {worst:.1} s (unhindered {:.1})",
                    160. / k1.def().speed
                );
            }
        }
    }
}

#[test]
fn e_rally() {
    println!(
        "\n== E. a Stables and a Workshop (3 Knights, 2 Cannons), after 120 s: each pair closer than its radii, and who never settled"
    );
    for seed in [5, 9] {
        for rally in ["none", "one point", "two points 20 px apart"] {
            let mut w = arena(seed);
            let (x, y) = clear(&w, 22, 14);
            let (tx, ty) = ((x / TILE) as i32 - 8, (y / TILE) as i32 - 4);
            w.res[0] = [20000, 0];
            w.make_building(BldgKind::Barracks, PLAYER, 3, 3, true);
            w.make_building(BldgKind::Forge, PLAYER, 3, 7, true);
            for i in 0..10 {
                w.make_building(BldgKind::Depot, PLAYER, 8 + 3 * i, 1, true);
            }
            let s = w.make_building(BldgKind::Hippodrome(), PLAYER, tx, ty, true);
            let f = w.make_building(BldgKind::Factory, PLAYER, tx + 5, ty, true);
            if rally != "none" {
                w.set_rally(s, x + 100., y + 80., None);
                w.set_rally(
                    f,
                    x + 100. + if rally == "one point" { 0. } else { 20. },
                    y + 80.,
                    None,
                );
            }
            for _ in 0..3 {
                w.queue_unit(s, Knight).unwrap();
            }
            for _ in 0..2 {
                w.queue_unit(f, SiegeTank).unwrap();
            }
            run(&mut w, 260 * TPS);
            report(&w, &format!("seed {seed}, rally {rally}"));
        }
    }
}
trait H {
    #[allow(non_snake_case)]
    fn Hippodrome() -> BldgKind;
}
impl H for BldgKind {
    fn Hippodrome() -> BldgKind {
        *BLDG_KINDS
            .iter()
            .find(|b| b.def().trains.contains(&Knight))
            .unwrap()
    }
}
/// Pairs closer than 97% of their radii, and units still on a Move/AMove.
fn report(w: &World, name: &str) {
    let mut out = Vec::new();
    let mut tight = 0;
    let mut min = f64::INFINITY;
    for (i, a) in w.units.iter().enumerate() {
        for b in &w.units[i + 1..] {
            if a.kind.def().air != b.kind.def().air {
                continue;
            }
            let q = (a.x - b.x).hypot(a.y - b.y) / (a.r + b.r);
            min = min.min(q);
            if q < 0.97 {
                tight += 1;
                out.push(format!(
                    "{:?}({})/{:?}({}) {:.0}%",
                    a.kind,
                    st(w, a.id),
                    b.kind,
                    st(w, b.id),
                    q * 100.
                ));
            }
        }
    }
    let unset = w
        .units
        .iter()
        .filter(|u| matches!(u.task, Task::Move { .. } | Task::AMove { .. }))
        .count();
    println!(
        "{name}: {} units, {tight} pairs under 97% (least {:.0}%), {unset} still walking",
        w.units.len(),
        min * 100.
    );
    for o in out.iter().take(8) {
        println!("      {o}");
    }
}

#[test]
fn f_settling() {
    println!("\n== F. a group of n settles, 40 s after the order (350 px)");
    let base = arena(5);
    let (x, y) = clear(&base, 24, 14);
    let mixes: [(&str, &[UnitKind]); 5] = [
        ("Knights", &[Knight]),
        ("Cannons", &[SiegeTank]),
        ("Knights+Cannons", &[Knight, SiegeTank]),
        ("Guards+Archers+Cannons", &[Trooper, Lancer, SiegeTank]),
        ("Rovers", &[Monolith]),
    ];
    for (name, ks) in mixes {
        for n in [4usize, 9, 16] {
            for o in ["formation", "amove"] {
                let mut w = arena(5);
                let ids: Vec<Id> = (0..n)
                    .map(|i| {
                        w.make_unit(
                            ks[i % ks.len()],
                            PLAYER,
                            x - 250. + 30. * (i % 4) as f64,
                            y - 60. + 30. * (i / 4) as f64,
                        )
                    })
                    .collect();
                if o == "amove" {
                    w.attack_move_group(&ids, x + 120., y)
                } else {
                    w.formation(&ids, x + 120., y)
                }
                run(&mut w, 40 * TPS);
                report(&w, &format!("{n} {name}, {o}"));
                // Then all ordered back by formation: does everybody come?
                w.formation(&ids, x - 200., y);
                run(&mut w, 40 * TPS);
                let near = ids
                    .iter()
                    .filter(|&&i| {
                        w.unit(i)
                            .is_some_and(|u| (u.x - x + 200.).hypot(u.y - y) < 130.)
                    })
                    .count();
                print!("      ordered back: {near} of {n}");
                // Then only the non-Cannons sent off.
                let soft: Vec<Id> = ids
                    .iter()
                    .copied()
                    .filter(|&i| w.unit(i).unwrap().kind != SiegeTank)
                    .collect();
                if soft.len() < n && !soft.is_empty() {
                    w.formation(&soft, x + 150., y);
                    run(&mut w, 25 * TPS);
                    let gone = soft
                        .iter()
                        .filter(|&&i| w.unit(i).is_some_and(|u| u.x > x))
                        .count();
                    print!(
                        "; the Cannons left there, the others sent off: {gone} of {} got away",
                        soft.len()
                    );
                }
                println!();
            }
        }
    }
}

#[test]
fn g_fight() {
    println!(
        "\n== G. a melee unit on a firm enemy: the closest it comes (centers), and where it stands after 6 s"
    );
    let base = arena(5);
    let (x, y) = clear(&base, 20, 10);
    for (k1, k2, hold) in [
        (Knight, SiegeTank, false),
        (Knight, Trooper, true),
        (Trooper, SiegeTank, false),
        (Bruiser, SiegeTank, false),
        (Rider, Knight, true),
    ] {
        let mut w = arena(5);
        let b = w.make_unit(k2, ENEMY, x, y);
        if hold {
            w.hold_unit(b);
        }
        run(&mut w, 4 * TPS);
        let i = w.units.iter().position(|u| u.id == b).unwrap();
        (w.units[i].hp, w.units[i].maxhp) = (1e6, 1e6);
        let a = w.make_unit(k1, PLAYER, x - 150., y + 4.);
        let i = w.units.iter().position(|u| u.id == a).unwrap();
        (w.units[i].hp, w.units[i].maxhp) = (1e6, 1e6);
        w.attack_ent(a, b);
        let mut min = f64::INFINITY;
        for _ in 0..6 * TPS {
            run(&mut w, 1);
            min = min.min(d(&w, a, b));
        }
        println!(
            "{k1:?} on {k2:?}: radii {}, closest {min:.1}, at the end {:.1} ({} / {})",
            sum(&w, a, b),
            d(&w, a, b),
            st(&w, a),
            st(&w, b)
        );
    }
    println!(
        "-- 4 Cannons and 8 Knights attack-move (one point) at 10 Guards 14 tiles off (hp x20): overlaps during the fight, sampled each 0.5 s"
    );
    for seed in [5, 9] {
        let mut w = arena(seed);
        let (x, y) = clear(&w, 26, 10);
        let mut ids = Vec::new();
        for i in 0..12 {
            ids.push(w.make_unit(
                if i % 3 == 0 { SiegeTank } else { Knight },
                PLAYER,
                x - 350. + 30. * (i % 3) as f64,
                y - 45. + 30. * (i / 3) as f64,
            ));
        }
        for i in 0..10 {
            let g = w.make_unit(
                Trooper,
                ENEMY,
                x + 250. + 30. * (i % 2) as f64,
                y - 60. + 30. * (i / 2) as f64,
            );
            let j = w.units.iter().position(|u| u.id == g).unwrap();
            w.units[j].hp *= 20.;
            w.units[j].maxhp *= 20.;
        }
        for u in w.units.iter_mut() {
            u.hp *= 5.;
            u.maxhp *= 5.;
        }
        w.attack_move_group(&ids, x + 260., y);
        let (mut hist, mut firm_tight) = ([0u32; 4], 0u32);
        for _ in 0..80 {
            run(&mut w, 15);
            for (i, a) in w.units.iter().enumerate() {
                for b in &w.units[i + 1..] {
                    let q = (a.x - b.x).hypot(a.y - b.y) / (a.r + b.r);
                    if q < 1.0 {
                        hist[if q < 0.5 {
                            0
                        } else if q < 0.75 {
                            1
                        } else if q < 0.9 {
                            2
                        } else {
                            3
                        }] += 1;
                    }
                    if q < 0.9 && a.mode.is_some() && b.mode.is_some() {
                        firm_tight += 1;
                    }
                }
            }
        }
        println!(
            "seed {seed}: pair-samples under 50/75/90/100% of the radii: {hist:?} of 80 samples; two deployed Cannons under 90%: {firm_tight}"
        );
        report(&w, "   at the end");
    }
}

#[test]
fn h_pressing_and_foes() {
    println!(
        "\n== H. what a unit pressing on a deployed Cannon (its order's point) does when attacked: an enemy Guard (hp 1200) beside it, inside the Cannon's blind ring"
    );
    let base = arena(5);
    let (x, y) = clear(&base, 24, 10);
    for (k1, o) in [
        (Knight, "move"),
        (Knight, "amove"),
        (Knight, "idle beside it"),
        (Trooper, "move"),
        (Trooper, "idle beside it"),
    ] {
        let mut w = arena(5);
        let b = w.make_unit(SiegeTank, PLAYER, x, y);
        run(&mut w, 4 * TPS);
        let off = if o == "idle beside it" { 30. } else { 150. };
        let a = w.make_unit(k1, PLAYER, x - off, y - 4.);
        set_order(&mut w, a, o, x, y);
        run(&mut w, 10 * TPS);
        let before = st(&w, a);
        let g = w.make_unit(Trooper, ENEMY, x - 70., y - 4.);
        let i = w.units.iter().position(|u| u.id == g).unwrap();
        (w.units[i].hp, w.units[i].maxhp) = (1200., 1200.);
        w.attack_ent(g, a);
        let ah = w.unit(a).unwrap().hp;
        run(&mut w, 6 * TPS);
        println!(
            "{k1:?} {o}: {before} for 10 s; 6 s after a Guard attacks it: {}, hp {:.0} of {ah:.0}, the Guard lost {:.0}; the Cannon {}",
            st(&w, a),
            w.unit(a).map_or(0., |u| u.hp),
            1200. - w.unit(g).map_or(0., |u| u.hp),
            st(&w, b)
        );
    }
    println!(
        "-- two Cannons rallied to one point, then an enemy building-like target (a holding Guard, hp 5000) 8 tiles off, seen: shells landed in 20 s"
    );
    for (how, off) in [("the same point", 0.0), ("40 px apart", 40.0)] {
        let mut w = arena(5);
        let b = w.make_unit(SiegeTank, PLAYER, x, y);
        run(&mut w, 4 * TPS);
        let a = w.make_unit(SiegeTank, PLAYER, x - 120., y + off);
        w.move_to(a, x, y + off);
        run(&mut w, 15 * TPS);
        let (sa, sb) = (st(&w, a), st(&w, b));
        let g = w.make_unit(Trooper, ENEMY, x + 8. * TILE, y);
        let i = w.units.iter().position(|u| u.id == g).unwrap();
        (w.units[i].hp, w.units[i].maxhp) = (5000., 5000.);
        w.hold_unit(g);
        run(&mut w, 20 * TPS);
        println!(
            "{how}: {sa} / {sb} after 15 s; the Guard lost {:.0}; then {} / {}",
            5000. - w.unit(g).map_or(0., |u| u.hp),
            st(&w, a),
            st(&w, b)
        );
    }
}

#[test]
fn i_gap_at_deploy() {
    println!(
        "\n== I. Cannons on an attack order at one enemy building (they set up as they come into reach): pairs of Cannons under 97% of their radii when all are set"
    );
    for (n, secs) in [
        (2usize, 25),
        (4, 25),
        (6, 25),
        (9, 25),
        (4, 90),
        (6, 90),
        (9, 90),
    ] {
        let mut w = arena(5);
        let (x, y) = clear(&w, 34, 10);
        let t = w.make_building(
            BldgKind::Depot,
            ENEMY,
            (x / TILE) as i32 + 12,
            (y / TILE) as i32,
            true,
        );
        let j = w.bldgs.iter().position(|b| b.id == t).unwrap();
        (w.bldgs[j].hp, w.bldgs[j].maxhp) = (1e6, 1e6);
        // (a spotter, so it is seen)
        let o = w.make_unit(Observer, PLAYER, x + 9. * TILE, y);
        w.hold_unit(o);
        let ids: Vec<Id> = (0..n)
            .map(|i| {
                w.make_unit(
                    SiegeTank,
                    PLAYER,
                    x - 330. + 30. * (i % 3) as f64,
                    y - 30. + 30. * (i / 3) as f64,
                )
            })
            .collect();
        for &i in &ids {
            w.attack_ent(i, t);
        }
        run(&mut w, secs * TPS);
        let p0 = ids
            .iter()
            .filter(|&&i| w.unit(i).unwrap().mode.is_some())
            .count();
        report(&w, &format!("{n} Cannons, {secs} s ({p0} set up)"));
    }
}

#[test]
fn j_census() {
    println!(
        "\n== J. AI against AI, the Kingdom against the Kingdom and the Expedition, Medium and Hard, 20 minutes: each second, ground pairs of the same side"
    );
    println!(
        "   (tight: centers nearer than 90% / 75% / 50% of the radii; still: so for 5 s on end; pressing: on a Move or AMove, under 8 px moved in 5 s, its point > 4 px off, against a firm unit)"
    );
    let (mut samples, mut pairs) = (0u64, [0u64; 4]);
    let (mut still, mut still_firm, mut press, mut press_cannon, mut games) =
        (0u64, 0u64, 0u64, 0u64, 0);
    let mut kinds: std::collections::BTreeMap<String, u32> = Default::default();
    for seed in 1..=6u32 {
        for vs in [&HUMANS, &VAEL] {
            let mut w = World::with_setup(
                seed,
                1 + (seed % 2) as usize,
                endfall_sim::map::MapKind::Standard,
                false,
                [&HUMANS, vs],
            );
            w.set_ai_seats(&[true, true]);
            games += 1;
            let mut since: std::collections::BTreeMap<(Id, Id), u32> = Default::default();
            let mut at: std::collections::BTreeMap<Id, Vec<(f64, f64)>> = Default::default();
            for _ in 0..20 * 60 {
                if w.over {
                    break;
                }
                run(&mut w, TPS);
                let mut now: std::collections::BTreeMap<(Id, Id), u32> = Default::default();
                let us: Vec<_> = w
                    .units
                    .iter()
                    .filter(|u| !u.kind.def().air && !u.kind.def().worker)
                    .collect();
                for u in &us {
                    let v = at.entry(u.id).or_default();
                    v.push((u.x, u.y));
                    if v.len() > 6 {
                        v.remove(0);
                    }
                }
                samples += us.len() as u64;
                for (i, a) in us.iter().enumerate() {
                    let firm =
                        |u: &endfall_sim::world::Unit| u.task == Task::Hold || u.mode.is_some();
                    for b in &us[i + 1..] {
                        let q = (a.x - b.x).hypot(a.y - b.y) / (a.r + b.r);
                        if q < 1.0 && a.team == b.team {
                            pairs[if q < 0.5 {
                                0
                            } else if q < 0.75 {
                                1
                            } else if q < 0.9 {
                                2
                            } else {
                                3
                            }] += 1;
                        }
                        if q < 0.9 && a.team == b.team {
                            let n = since.get(&(a.id, b.id)).copied().unwrap_or(0) + 1;
                            now.insert((a.id, b.id), n);
                            if n == 5 {
                                still += 1;
                                let (fa, fb) = (firm(a), firm(b));
                                if fa && fb {
                                    still_firm += 1;
                                }
                                let mut k = [
                                    format!("{:?}{}", a.kind, if fa { "+firm" } else { "" }),
                                    format!("{:?}{}", b.kind, if fb { "+firm" } else { "" }),
                                ];
                                k.sort();
                                *kinds.entry(k.join(" / ")).or_default() += 1;
                            }
                        }
                    }
                    let to = match a.task {
                        Task::Move { x, y } => Some((x, y)),
                        Task::AMove { x, y, rejoin: None } => Some((x, y)),
                        _ => None,
                    };
                    let v = &at[&a.id];
                    if let Some((tx, ty)) = to
                        && v.len() == 6
                        && a.mode.is_none()
                        && a.swap <= 0.0
                        && v.iter().all(|p| (p.0 - a.x).hypot(p.1 - a.y) < 8.0)
                        && (tx - a.x).hypot(ty - a.y) > 4.0
                        && us.iter().any(|b| {
                            b.id != a.id
                                && firm(b)
                                && (a.x - b.x).hypot(a.y - b.y) < a.r + b.r + 1.0
                        })
                    {
                        press += 1;
                        if a.kind == SiegeTank {
                            press_cannon += 1;
                        }
                    }
                }
                since = now;
            }
        }
    }
    println!(
        "{games} games, {samples} ground-soldier samples; same-side pairs under 50/75/90/100% of the radii: {pairs:?}"
    );
    println!(
        "pairs under 90% for 5 s on end: {still} ({still_firm} both firm); unit-seconds pressing on a firm unit: {press} ({press_cannon} of them Cannons)"
    );
    let mut k: Vec<_> = kinds.into_iter().collect();
    k.sort_by(|a, b| b.1.cmp(&a.1));
    for (n, c) in k.iter().take(10) {
        println!("      {c} {n}");
    }
}

#[test]
fn k_escape() {
    println!(
        "\n== K. two on one spot (10 px apart) or one pressing on a firm one, then one ordered 200 px off in 16 directions: how many got there in 12 s"
    );
    let base = arena(5);
    let (x, y) = clear(&base, 20, 16);
    for (k1, k2, how) in [
        (Knight, SiegeTank, "pressing"),
        (SiegeTank, SiegeTank, "pressing"),
        (Knight, SiegeTank, "hold"),
        (SiegeTank, SiegeTank, "hold"),
        (Knight, Knight, "hold"),
    ] {
        for who in [0, 1] {
            for skew in [0.0, 0.1] {
                let (mut n, mut fails) = (0, Vec::new());
                for dir in 0..16 {
                    let mut w = arena(5);
                    let b = w.make_unit(k2, PLAYER, x, y);
                    if k2 != SiegeTank {
                        w.hold_unit(b);
                    }
                    run(&mut w, 4 * TPS);
                    let a = w.make_unit(k1, PLAYER, x - if how == "hold" { 10. } else { 100. }, y);
                    if how == "hold" {
                        w.hold_unit(a);
                        w.hold_unit(b);
                    } else {
                        w.move_to(a, x, y);
                    }
                    run(&mut w, 6 * TPS);
                    let an = dir as f64 * std::f64::consts::TAU / 16.0 + skew;
                    let to = (x + 200. * an.cos(), y + 200. * an.sin());
                    let m = if who == 0 { a } else { b };
                    w.move_to(m, to.0, to.1);
                    run(&mut w, 12 * TPS);
                    let u = w.unit(m).unwrap();
                    if (u.x - to.0).hypot(u.y - to.1) < 20. {
                        n += 1
                    } else {
                        fails.push(dir)
                    }
                }
                println!(
                    "{k1:?} on {k2:?}, {how}, the {} goes, skew {skew}: {n} of 16 (failed directions {fails:?})",
                    ["one on top", "firm one below"][who]
                );
            }
        }
    }
}

#[test]
fn l_long_crowds() {
    println!(
        "\n== L. the crowds that never settle (no Cannons too): still walking at 20, 40, 120, 300 s"
    );
    let base = arena(5);
    let (x, y) = clear(&base, 24, 14);
    for (name, ks) in [
        ("Rovers", &[Monolith][..]),
        ("Cannons", &[SiegeTank]),
        ("Guards", &[Trooper]),
        ("Archers", &[Lancer]),
        ("Guards+Archers", &[Trooper, Lancer]),
        ("Knights", &[Knight]),
        ("Guards+Archers+Cannons", &[Trooper, Lancer, SiegeTank]),
        ("Androids", &[Umbra]),
        ("Ballistas", &[Bastion]),
    ] {
        for n in [9usize, 16, 30] {
            for o in ["formation", "amove"] {
                let mut w = arena(5);
                let ids: Vec<Id> = (0..n)
                    .map(|i| {
                        w.make_unit(
                            ks[i % ks.len()],
                            PLAYER,
                            x - 280. + 30. * (i % 5) as f64,
                            y - 90. + 30. * (i / 5) as f64,
                        )
                    })
                    .collect();
                if o == "amove" {
                    w.attack_move_group(&ids, x + 120., y)
                } else {
                    w.formation(&ids, x + 120., y)
                }
                let mut out = String::new();
                let mut at = 0;
                for t in [20, 40, 120, 300] {
                    run(&mut w, (t - at) * TPS);
                    at = t;
                    out += &format!(
                        " {:3}",
                        w.units
                            .iter()
                            .filter(|u| matches!(u.task, Task::Move { .. } | Task::AMove { .. }))
                            .count()
                    );
                }
                let mut min = f64::INFINITY;
                for (i, a) in w.units.iter().enumerate() {
                    for b in &w.units[i + 1..] {
                        min = min.min((a.x - b.x).hypot(a.y - b.y) / (a.r + b.r));
                    }
                }
                println!("{n:2} {name}, {o}: {out}   least {:.0}%", min * 100.);
            }
        }
    }
}
