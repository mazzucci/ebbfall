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
