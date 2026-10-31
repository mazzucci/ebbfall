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
        // (at its two-vent price, 175/125, about even with Vanguards at the larger budget: +0.33 / -0.18)
        range(
            "Monolith v Vanguard",
            d(&[Monolith], &[Vanguard]),
            -0.3,
            1.0,
        );
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
        // The Lancer's ground damage 5 -> 9 (2026-10-31): still weak on the ground (Troopers beat it, above), but no
        // longer dead weight beside Troopers (-0.59 / -0.58 against Prisms before, -0.24 / -0.33 after).
        range(
            "Lancer+Trooper v Prism",
            d(&[Lancer, Trooper], &[Prism]),
            -0.45,
            0.2,
        );
    }
}

#[test]
fn a_halo_finds_cloaked_raiders_for_its_army() {
    // With every tech and the AI's use of abilities: Cloaked Wasps and veiled Shrikes beat Prisms that cannot see
    // them. One Halo per three Prisms detects them (5 tiles, 2026-10-31) and turns both fights round (Prism+Halo
    // -0.81 / -0.97 before the Halo detected, +0.95 / +0.85 after).
    use UnitKind::*;
    for foe in [Wasp, Shrike] {
        let alone = duel_with(&[Prism], &[foe], 2800.0, tech_micro);
        let led = duel_with(&[Prism, Prism, Prism, Halo], &[foe], 2800.0, tech_micro);
        assert!(
            alone < -0.3,
            "Prisms alone lose to cloaked {foe:?}: {alone:+.2}"
        );
        assert!(led > 0.3, "a Halo among them finds the {foe:?}: {led:+.2}");
    }
}

#[test]
fn the_capital_units_hold_their_counters_in_cost_equal_fights() {
    // A Bastion (800 by value) or a Sovereign (850) crushes heavy ground and loses to what shoots up; budgets of four.
    use UnitKind::*;
    let range = |name: &str, v: f64, lo: f64, hi: f64| {
        assert!(v >= lo && v <= hi, "{name}: {v:+.2} not in {lo}..{hi}")
    };
    for budget in [3300.0, 6600.0] {
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
        // Its ground trade (2026-10-31, range 9, damage 48): no longer clearly beaten by the Vael's own line army
        // (-0.46 / -0.40 at 750 by value and damage 40; -0.37 / +0.33 at 850 and 48).
        range(
            "Sovereign v Scythe+Prism",
            d(&[Sovereign], &[Scythe, Prism]),
            -0.5,
            1.0,
        );
    }
}
