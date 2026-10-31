//! Balance: cost-equal duel matrices for both races, and the early raid answer.

use super::common::*;

#[test]
#[ignore]
fn balance_matrix() {
    use UnitKind::*;
    let armies: [(&str, &[UnitKind]); 7] = [
        ("trooper", &[Trooper]),
        ("vanguard", &[Vanguard]),
        ("lancer", &[Lancer]),
        ("wasp", &[Wasp]),
        ("trp+medic", &[Trooper, Trooper, Trooper, Trooper, Medic]),
        ("trp+vang", &[Trooper, Trooper, Vanguard]),
        ("lancer+trp", &[Lancer, Trooper]),
    ];
    for budget in [1100.0, 2200.0] {
        println!("budget {budget}");
        for (na, a) in armies {
            let row: Vec<String> = armies
                .iter()
                .map(|(_, b)| {
                    // flyers that cannot shoot up, against each other: the fight cannot end
                    let air = |m: &[UnitKind]| {
                        m.iter()
                            .all(|k| k.def().air && k.def().damage_vs(true) == 0.0)
                    };
                    if air(a) && air(b) {
                        "  n/a".to_string()
                    } else {
                        format!("{:+.2}", duel(a, b, budget))
                    }
                })
                .collect();
            println!("{na:>11} {}", row.join(" "));
        }
    }
}

#[test]
fn the_counters_hold_in_cost_equal_fights() {
    // Thresholds sit well inside the measured values (balance_matrix, flat arena, median of three spawn offsets).
    use UnitKind::*;
    for budget in [1100.0, 2200.0] {
        let d = |a: &[UnitKind], b: &[UnitKind]| duel(a, b, budget);
        assert!(
            d(&[Lancer], &[Wasp]) > 0.4,
            "{budget}: Lancers shoot down Wasps"
        );
        assert!(
            d(&[Trooper], &[Wasp]) > 0.4,
            "{budget}: Troopers outrange Wasps"
        );
        assert!(
            d(&[Trooper], &[Lancer]) > 0.5,
            "{budget}: Lancers are weak against the ground"
        );
        assert!(
            d(&[Vanguard], &[Trooper]) > 0.0,
            "{budget}: splashing shells beat massed Troopers"
        );
        assert!(
            d(&[Trooper, Trooper, Vanguard], &[Trooper]) > 0.2,
            "{budget}: combined arms beat Trooper spam"
        );
        // Wasps pick off the Troopers first and the Vanguards cannot shoot back: a tank-heavy army needs anti-air.
        assert!(
            d(&[Trooper, Trooper, Vanguard], &[Wasp]) < 0.0,
            "{budget}: Wasps punish an army without enough anti-air"
        );
        assert!(
            d(&[Trooper, Lancer], &[Wasp]) > 0.4,
            "{budget}: while Troopers and Lancers shoot them down"
        );
    }
}

#[test]
fn a_turret_or_a_few_troopers_answer_an_early_wasp_raid() {
    let (lost, wasps) = raid(2, 0, 0);
    assert_eq!(
        (lost, wasps),
        (8, 0),
        "an undefended mineral line is easy prey"
    );
    let (lost, wasps) = raid(2, 1, 0);
    assert!(
        wasps == 2 && lost <= 4,
        "a turret shoots down a two-Wasp raid ({lost}/8 harvesters lost)"
    );
    let (lost, wasps) = raid(2, 0, 4);
    assert!(
        wasps == 2 && lost <= 4,
        "so do four Troopers ({lost}/8 lost)"
    );
}

#[test]
fn the_vael_counters_hold_in_cost_equal_fights() {
    // The loop to protect (race/VAEL.md): Scythes beat Lancers and workers, Troopers beat Scythes and Prisms; Prisms beat
    // Wasps and Lancers; Vanguards beat Prisms; Monoliths beat Vanguards; Wasps beat Monoliths and Scythes;
    // Lancers and Troopers beat Shrikes; Shrikes beat Wasps and Vanguards. Bigger budgets than the human matrix:
    // a Monolith is worth 375.
    use UnitKind::*;
    let range = |name: &str, v: f64, lo: f64, hi: f64| {
        assert!(v >= lo && v <= hi, "{name}: {v:+.2} not in {lo}..{hi}")
    };
    for budget in [2200.0, 4400.0] {
        let d = |a: &[UnitKind], b: &[UnitKind]| duel(a, b, budget);
        // Troopers win the small fights: in AI-vs-AI games (1v1, both seats, every map) that is what evens the races.
        range("Scythe v Trooper", d(&[Scythe], &[Trooper]), -0.5, 0.1);
        range("Scythe v Lancer", d(&[Scythe], &[Lancer]), 0.5, 1.0);
        range(
            "Wasp v Scythe (cannot hit air)",
            d(&[Wasp], &[Scythe]),
            0.9,
            1.0,
        );
        range("Prism v Wasp", d(&[Prism], &[Wasp]), 0.4, 1.0);
        range("Prism v Lancer", d(&[Prism], &[Lancer]), 0.5, 1.0);
        range("Prism v Trooper", d(&[Prism], &[Trooper]), -0.75, 0.0);
        range("Vanguard v Prism", d(&[Vanguard], &[Prism]), 0.2, 1.0);
        range("Monolith v Vanguard", d(&[Monolith], &[Vanguard]), 0.0, 1.0);
        range("Monolith v Trooper", d(&[Monolith], &[Trooper]), -0.3, 1.0);
        range("Shrike v Wasp", d(&[Shrike], &[Wasp]), 0.6, 1.0);
        range("Lancer v Shrike", d(&[Lancer], &[Shrike]), 0.6, 1.0);
        range("Trooper v Shrike", d(&[Trooper], &[Shrike]), 0.3, 1.0);
        range("Shrike v Vanguard", d(&[Shrike], &[Vanguard]), 0.6, 1.0);
        range(
            "Scythe+Prism v Trooper+Vanguard",
            d(&[Scythe, Prism], &[Trooper, Trooper, Vanguard]),
            -0.7,
            0.1,
        );
        range(
            "Scythe+Prism v Lancer+Trooper",
            d(&[Scythe, Prism], &[Lancer, Trooper]),
            0.2,
            1.0,
        );
    }
}

#[test]
fn the_capital_units_hold_their_counters_in_cost_equal_fights() {
    // A Bastion (700 by value) or a Sovereign (750) crushes heavy ground and loses to what shoots up; budgets of four.
    use UnitKind::*;
    let range = |name: &str, v: f64, lo: f64, hi: f64| {
        assert!(v >= lo && v <= hi, "{name}: {v:+.2} not in {lo}..{hi}")
    };
    for budget in [2800.0, 5600.0] {
        let d = |a: &[UnitKind], b: &[UnitKind]| duel(a, b, budget);
        range("Bastion v Vanguard", d(&[Bastion], &[Vanguard]), 0.6, 1.0);
        range("Bastion v Scythe", d(&[Bastion], &[Scythe]), 0.6, 1.0);
        range("Bastion v Sovereign", d(&[Bastion], &[Sovereign]), 0.6, 1.0);
        range("Bastion v Lancer", d(&[Bastion], &[Lancer]), -1.0, -0.05);
        range("Bastion v Prism", d(&[Bastion], &[Prism]), -1.0, -0.05);
        range("Bastion v Shrike", d(&[Bastion], &[Shrike]), -1.0, -0.1);
        range("Sovereign v Trooper", d(&[Sovereign], &[Trooper]), 0.3, 1.0);
        range("Sovereign v Prism", d(&[Sovereign], &[Prism]), 0.3, 1.0);
        range("Sovereign v Lancer", d(&[Sovereign], &[Lancer]), 0.6, 1.0);
        range(
            "Sovereign v Wasp (cannot hit air)",
            d(&[Sovereign], &[Wasp]),
            -1.0,
            -0.9,
        );
    }
}

#[test]
#[ignore]
fn siege_matrix() {
    // The Siege Tank's duels (cost-equal, nine tiles apart: they undervalue reach) and its siege lines, for tuning.
    use UnitKind::*;
    let rows: [(&str, &[UnitKind], &[UnitKind]); 8] = [
        ("tank v trooper", &[SiegeTank], &[Trooper]),
        ("tank v scythe", &[SiegeTank], &[Scythe]),
        ("tank v wasp", &[SiegeTank], &[Wasp]),
        ("tank v vanguard", &[SiegeTank], &[Vanguard]),
        ("tank v prism", &[SiegeTank], &[Prism]),
        ("tank v monolith", &[SiegeTank], &[Monolith]),
        (
            "4trp+tank v trooper",
            &[Trooper, Trooper, Trooper, Trooper, SiegeTank],
            &[Trooper],
        ),
        (
            "4trp+tank v scythe",
            &[Trooper, Trooper, Trooper, Trooper, SiegeTank],
            &[Scythe],
        ),
    ];
    for budget in [2200.0, 4400.0] {
        for (name, a, b) in rows {
            println!(
                "{budget} {name:>20}: {:+.2}, with abilities {:+.2}",
                duel(a, b, budget),
                duel_with(a, b, budget, ability_micro)
            );
        }
    }
    for (name, tanks, guards, att) in [
        ("1 tank + 8 trp v trp", 1, (Trooper, 8), &[Trooper][..]),
        ("16 trp v trp", 0, (Trooper, 16), &[Trooper][..]),
        ("1 tank + 8 trp v scythe", 1, (Trooper, 8), &[Scythe][..]),
        ("16 trp v scythe", 0, (Trooper, 16), &[Scythe][..]),
        (
            "2 tanks + 12 trp v scy+pri",
            2,
            (Trooper, 12),
            &[Scythe, Prism][..],
        ),
        ("28 trp v scy+pri", 0, (Trooper, 28), &[Scythe, Prism][..]),
        ("2 tanks v scythe", 2, (Trooper, 0), &[Scythe][..]),
    ] {
        println!("{name:>28}: {:+.2}", siege_line(tanks, guards, att));
    }
}

#[test]
fn a_siege_line_holds_where_the_same_shards_in_troopers_do_not() {
    // Tanks deployed behind a line of Troopers, against a clump that walks in: they beat it, by more than Troopers
    // for the same price would (the measured values: +0.50 against +0.24 Troopers' loss, +0.59 against +0.34 for
    // Scythes, +0.39 against +0.36 for Scythes and Prisms).
    use UnitKind::*;
    let trp = siege_line(1, (Trooper, 8), &[Trooper]);
    assert!(trp > 0.2, "Troopers break on a tank's line: {trp:+.2}");
    assert!(trp > siege_line(0, (Trooper, 16), &[Trooper]) + 0.3);
    let scy = siege_line(1, (Trooper, 8), &[Scythe]);
    assert!(scy > 0.3, "so do Scythes: {scy:+.2}");
    assert!(scy > siege_line(0, (Trooper, 16), &[Scythe]));
    let mix = siege_line(2, (Trooper, 12), &[Scythe, Prism]);
    assert!(mix > 0.15, "and the Vael's line army: {mix:+.2}");
}

#[test]
fn siege_tanks_alone_lose_to_what_closes_in_and_to_flyers() {
    use UnitKind::*;
    // Two tanks with no escort: Scythes walk into their blind ring.
    let alone = siege_line(2, (Trooper, 0), &[Scythe]);
    assert!(
        alone < -0.15,
        "unescorted tanks fall to Scythes: {alone:+.2}"
    );
    // A few tanks against Scythes that Blink under their guns (cost-equal; massed tanks cover each other better).
    let blink = duel_with(&[SiegeTank], &[Scythe], 2200.0, ability_micro);
    assert!(blink < -0.1, "Blink closes the gap: {blink:+.2}");
    for budget in [2200.0, 4400.0] {
        for flyer in [Wasp, Shrike] {
            let v = duel(&[SiegeTank], &[flyer], budget);
            assert!(
                v < -0.9,
                "{budget}: a tank cannot shoot up ({flyer:?}: {v:+.2})"
            );
        }
    }
}

#[test]
fn a_siege_tank_shells_static_defence_from_outside_its_reach() {
    // A Turret (reach 7) and a powered Ward fall to one tank sent at them; the tank is never hit.
    for (kind, power) in [
        (BldgKind::Turret, None),
        (BldgKind::Ward, Some(BldgKind::Spire)),
    ] {
        let mut w = tech_arena(6);
        w.factions = vec![&HUMANS, &VAEL];
        if let Some(p) = power {
            w.make_building(p, ENEMY, 47, 30, true);
        }
        let tower = w.make_building(kind, ENEMY, 44, 30, true);
        w.update_fog();
        let tank = w.make_unit(UnitKind::SiegeTank, PLAYER, 20.0 * TILE, 31.0 * TILE);
        w.attack_ent(tank, tower);
        for _ in 0..90 * TPS {
            w.step();
            if w.bldg(tower).is_none() {
                break;
            }
        }
        assert!(w.bldg(tower).is_none(), "{kind:?} fell");
        let u = w.unit(tank).unwrap();
        assert_eq!(u.hp, u.maxhp, "{kind:?}: never in its reach");
    }
}

/// A siege line holds: `tanks` Siege Tanks deployed `TILE * 3` behind `guards` (a kind and how many) on flat ground,
/// as an army worth about the same (`attackers`, a mix as in `duel`) attack-moves in from 20 tiles off. Scored like
/// `duel` (+: the line held). Played from three offsets, the median.
pub fn siege_line(tanks: usize, guards: (UnitKind, usize), attackers: &[UnitKind]) -> f64 {
    let mut r: Vec<f64> = [0.0, 40.0, -50.0]
        .iter()
        .map(|&off| siege_line_once(tanks, guards, attackers, off))
        .collect();
    r.sort_by(|p, q| p.partial_cmp(q).unwrap());
    r[1]
}

fn siege_line_once(
    tanks: usize,
    guards: (UnitKind, usize),
    attackers: &[UnitKind],
    off: f64,
) -> f64 {
    let mut w = flat_arena(16);
    let y0 = 30.0 * TILE + off;
    let mut line = Vec::new();
    for i in 0..tanks {
        line.push(w.make_unit(
            UnitKind::SiegeTank,
            PLAYER,
            15.0 * TILE,
            y0 + (i as f64 - (tanks as f64 - 1.0) / 2.0) * 40.0,
        ));
    }
    for i in 0..guards.1 {
        let (col, row) = ((i / 6) as f64, (i % 6) as f64 - 2.5);
        line.push(w.make_unit(guards.0, PLAYER, (20.0 + col) * TILE, y0 + row * 24.0));
    }
    for &t in &line[..tanks] {
        w.cast(t, AbilityKind::Deploy).unwrap();
    }
    let spent_a: f64 = line
        .iter()
        .map(|&u| unit_value(w.unit(u).unwrap().kind))
        .sum();
    let per: f64 = attackers.iter().map(|&k| unit_value(k)).sum();
    let n = (spent_a / per).round().max(1.0) as usize;
    let kinds: Vec<UnitKind> = (0..n).flat_map(|_| attackers.iter().copied()).collect();
    let gap = kinds.iter().map(|k| k.def().r).fold(0.0, f64::max) * 2.0 + 4.0;
    let foes: Vec<Id> = kinds
        .iter()
        .enumerate()
        .map(|(i, &k)| {
            let (col, row) = ((i / 6) as f64, (i % 6) as f64 - 2.5);
            w.make_unit(k, ENEMY, 40.0 * TILE + col * gap, y0 + row * gap)
        })
        .collect();
    let spent_b: f64 = kinds.iter().map(|&k| unit_value(k)).sum();
    run(&mut w, 3); // (the tanks settle in)
    for &f in &foes {
        w.attack_move(f, 12.0 * TILE, y0);
    }
    let alive = |w: &World, ids: &[Id]| {
        ids.iter()
            .filter_map(|&i| w.unit(i))
            .map(|u| unit_value(u.kind) * u.hp / u.maxhp)
            .sum::<f64>()
    };
    for _ in 0..90 * TPS {
        w.step();
        w.events.clear();
        if alive(&w, &line) < 1.0 || alive(&w, &foes) < 1.0 {
            break;
        }
    }
    alive(&w, &line) / spent_a - alive(&w, &foes) / spent_b
}
