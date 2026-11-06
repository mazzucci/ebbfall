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
        ("raider", &[Raider]),
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
#[ignore]
fn anti_air_matrix() {
    // The Interceptor and the Lancer against flyers and the ground (cost-equal), for tuning.
    use UnitKind::*;
    let rows: [(&str, &[UnitKind], &[UnitKind]); 18] = [
        ("icp v raider", &[Interceptor], &[Raider]),
        ("icp v shrike", &[Interceptor], &[Shrike]),
        ("icp v bastion", &[Interceptor], &[Bastion]),
        ("icp v trooper", &[Interceptor], &[Trooper]),
        ("icp v scythe", &[Interceptor], &[Scythe]),
        ("icp v lancer", &[Interceptor], &[Lancer]),
        ("trp+icp v shrike", &[Trooper, Interceptor], &[Shrike]),
        ("trp+icp v raider", &[Trooper, Interceptor], &[Raider]),
        ("trp+icp v bastion", &[Trooper, Interceptor], &[Bastion]),
        ("trp+icp v trooper", &[Trooper, Interceptor], &[Trooper]),
        ("lancer v raider", &[Lancer], &[Raider]),
        ("lancer v shrike", &[Lancer], &[Shrike]),
        ("lancer v bastion", &[Lancer], &[Bastion]),
        ("lancer v trooper", &[Lancer], &[Trooper]),
        ("lancer v scythe", &[Lancer], &[Scythe]),
        ("lancer v prism", &[Lancer], &[Prism]),
        ("lancer+trp v prism", &[Lancer, Trooper], &[Prism]),
        ("lancer+trp v raider", &[Lancer, Trooper], &[Raider]),
    ];
    for budget in [2200.0, 4400.0] {
        for (name, a, b) in rows {
            println!("{budget} {name:>20}: {:+.2}", duel(a, b, budget));
        }
    }
}

#[test]
fn a_turret_or_a_few_lancers_answer_an_early_raider_raid() {
    // Over a dozen maps (one scene is a knife's edge: where each harvester stands as the raid comes in decides it):
    // an undefended mineral line loses all eight, a turret or four Lancers (the Harpooners: the Picket cannot shoot up
    // since Roster v2) shoot the two Raiders down in nearly every raid, half the harvesters or fewer lost in a typical
    // one.
    let seeds = 1..=12u32;
    let raids = |turrets, lancers| -> Vec<(usize, usize)> {
        seeds
            .clone()
            .map(|s| raid_on(s, 2, turrets, lancers))
            .collect()
    };
    let median_lost = |v: &[(usize, usize)]| {
        let mut l: Vec<usize> = v.iter().map(|r| r.0).collect();
        l.sort();
        l[l.len() / 2]
    };
    let undefended = raids(0, 0);
    assert!(
        undefended.iter().all(|&r| r == (8, 0)),
        "an undefended mineral line is easy prey: {undefended:?}"
    );
    for (what, v) in [("a turret", raids(1, 0)), ("four Lancers", raids(0, 4))] {
        let down = v.iter().filter(|r| r.1 == 2).count();
        assert!(
            down >= 10 && median_lost(&v) <= 4,
            "{what} shoots down a two-Raider raid: {down} of 12 raids, {} of 8 harvesters lost in a typical one ({v:?})",
            median_lost(&v)
        );
    }
}

#[test]
fn a_halo_finds_cloaked_raiders_for_its_army() {
    // With every tech and the AI's use of abilities: veiled Shrikes (Petrels with Seaglass) beat Prisms (Lenses) that
    // cannot see them (the Raider's cloak went with Roster v2). One Halo per three Prisms detects them (5 tiles,
    // 2026-10-31) and turns the fight round. (Not the Undertow since Lurk: in an open fight it shows after its first
    // blow; its ambush is in tests/gameplay/cloak.rs.)
    use UnitKind::*;
    let foe = Shrike;
    let alone = duel_with(&[Prism], &[foe], 2800.0, tech_micro);
    let led = duel_with(&[Prism, Prism, Prism, Halo], &[foe], 2800.0, tech_micro);
    assert!(
        alone < -0.3,
        "Prisms alone lose to cloaked {foe:?}: {alone:+.2}"
    );
    assert!(led > 0.3, "a Halo among them finds the {foe:?}: {led:+.2}");
}

#[test]
#[ignore]
fn siege_matrix() {
    // The Siege Tank's duels (cost-equal, nine tiles apart: they undervalue reach) and its siege lines, for tuning.
    use UnitKind::*;
    let rows: [(&str, &[UnitKind], &[UnitKind]); 8] = [
        ("tank v trooper", &[SiegeTank], &[Trooper]),
        ("tank v scythe", &[SiegeTank], &[Scythe]),
        ("tank v raider", &[SiegeTank], &[Raider]),
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
                duel_with(a, b, budget, tech_micro)
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
}

#[test]
fn a_siege_tank_shells_static_defence_from_outside_its_reach() {
    // A Turret (reach 7) and a Ward fall to one tank sent at them; the tank is never hit.
    for kind in [BldgKind::Turret, BldgKind::Ward] {
        let mut w = tech_arena(6);
        w.factions = vec![&HUMANS, &VAEL];
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

/// Every tech and the AI's ability use (`tech_micro`), and the side's Pickets dig in where they stand (Dig In, as a
/// player holding a line would).
fn dig_micro(w: &mut World, mine: &[Id], theirs: &[Id]) {
    tech_micro(w, mine, theirs);
    for &id in mine {
        if w.unit(id)
            .is_some_and(|u| u.kind == UnitKind::Trooper && u.mode.is_none() && u.swap <= 0.0)
        {
            let _ = w.cast(id, AbilityKind::Entrench);
        }
    }
}

#[test]
#[ignore]
fn roster_v2_cross_matrix() {
    // Roster v2's compositions, Harbour against Vael at equal cost: every tech and the AI's casts on both sides, and
    // the same Harbour armies with their Pickets dug in (`dig`).
    use UnitKind::*;
    let harbour: [(&str, &[UnitKind]); 8] = [
        ("picket", &[Trooper]),
        ("harpooner", &[Lancer]),
        ("2pkt+harp", &[Trooper, Trooper, Lancer]),
        (
            "4pkt+2harp+mend",
            &[Trooper, Trooper, Trooper, Trooper, Lancer, Lancer, Medic],
        ),
        ("breakwater", &[Vanguard]),
        ("bw+2pkt", &[Vanguard, Trooper, Trooper]),
        ("anchor+bw", &[SiegeTank, Vanguard]),
        ("kite", &[Raider]),
    ];
    let vael: [(&str, &[UnitKind]); 6] = [
        ("needle", &[Scythe]),
        ("lens", &[Prism]),
        ("needle+lens", &[Scythe, Prism]),
        ("2needle+tender", &[Scythe, Scythe, Halo]),
        ("conch", &[Monolith]),
        ("conch+2lens", &[Monolith, Prism, Prism]),
    ];
    for budget in [2200.0, 4400.0] {
        println!(
            "budget {budget}: rows Harbour, columns {}",
            vael.map(|v| v.0).join(" ")
        );
        for (na, a) in harbour {
            let row: Vec<String> = vael
                .iter()
                .map(|(_, b)| format!("{:+.2}", duel_with(a, b, budget, tech_micro)))
                .collect();
            let dug: Vec<String> = vael
                .iter()
                .map(|(_, b)| format!("{:+.2}", duel_with(a, b, budget, dig_micro)))
                .collect();
            println!("{na:>16} {} | dug {}", row.join(" "), dug.join(" "));
        }
    }
}

#[test]
fn roster_v2s_counters_hold_in_cost_equal_fights() {
    // Roster v2's own claims (its "Race against race" and compositions), with every tech and the AI's casts on both
    // sides, at two budgets. Thresholds sit inside the values measured by roster_v2_cross_matrix and anti_air_matrix.
    use UnitKind::*;
    for budget in [2200.0, 4400.0] {
        let d = |a: &[UnitKind], b: &[UnitKind]| duel_with(a, b, budget, tech_micro);
        // (anti-air without the techs: Seaglass would hide the Petrels from what shoots them)
        let plain = |a: &[UnitKind], b: &[UnitKind]| duel(a, b, budget);
        let checks: [(&str, f64, f64); 13] = [
            (
                "Pickets beat Needles: they shoot as the blades close",
                d(&[Trooper], &[Scythe]),
                0.1,
            ),
            ("the Lens outranges Pickets", -d(&[Trooper], &[Prism]), 0.1),
            (
                "a beached Breakwater breaks Needles",
                d(&[Vanguard], &[Scythe]),
                0.5,
            ),
            (
                "a beached Breakwater's splash beats massed Pickets",
                d(&[Vanguard], &[Trooper]),
                0.2,
            ),
            (
                "the Conch's splash beats a clump of Pickets",
                -d(&[Trooper], &[Monolith]),
                0.5,
            ),
            (
                "Anchor Guns behind Breakwaters hold the Conch",
                d(&[SiegeTank, Vanguard], &[Monolith]),
                -0.15,
            ),
            (
                "the Kite beats what cannot shoot up",
                d(&[Raider], &[Scythe]),
                0.8,
            ),
            ("Lenses shoot Kites down", -d(&[Raider], &[Prism]), 0.4),
            (
                "the Netter shoots flyers down",
                plain(&[Interceptor], &[Shrike]),
                0.6,
            ),
            (
                "the Netter is dead weight on the ground",
                -plain(&[Interceptor], &[Trooper]),
                0.9,
            ),
            (
                "Harpooners answer Petrels",
                plain(&[Lancer], &[Shrike]),
                0.4,
            ),
            ("Harpooners answer Kites", plain(&[Lancer], &[Raider]), 0.3),
            (
                "Harpooners are weak against the ground",
                -plain(&[Lancer], &[Trooper]),
                0.3,
            ),
        ];
        for (claim, got, floor) in checks {
            assert!(
                got > floor,
                "{budget}: {claim}: {got:+.2} (more than {floor:+.2} wanted)"
            );
        }
    }
}

#[test]
fn every_units_killer_on_its_card_beats_it() {
    // Each fighting unit's train button names what beats it (src/engine/constants.js PAIRS, "Beaten by ..."): the
    // card must not lie. Cost-equal, every tech and the AI's casts on the ground; flyers without the techs (Seaglass
    // would hide the Petrels). Unarmed units (the Mender, the Spyglass, the Tender) lose to anything and are left out.
    use UnitKind::*;
    let killers: [(UnitKind, UnitKind); 13] = [
        (Trooper, Monolith),
        (Lancer, Scythe),
        (Vanguard, Monolith),
        (SiegeTank, Shrike),
        (Interceptor, Scythe),
        (Raider, Prism),
        (Bastion, Shrike),
        (Scythe, Vanguard),
        (Prism, SiegeTank),
        (Monolith, Raider),
        (Umbra, Trooper),
        (Shrike, Interceptor),
        (Sovereign, Raider),
    ];
    for budget in [2200.0, 4400.0] {
        for (unit, killer) in killers {
            let air = unit.def().air || killer.def().air;
            let s = if air {
                duel(&[killer], &[unit], budget)
            } else {
                duel_with(&[killer], &[unit], budget, tech_micro)
            };
            assert!(
                s > 0.1,
                "{budget}: the {:?}'s card says it is beaten by {:?}: {s:+.2}",
                unit,
                killer
            );
        }
    }
}

#[test]
#[ignore]
fn brutal_worker_loss_probe() {
    // Brutal Humans against Brutal Vael on 64x64: what kills the Humans' units (lost_to), and how many Riggers are gone
    // by 4:00, 7:00 and the end.
    let mut total = vec![0u32; UNIT_KINDS.len() + BLDG_KINDS.len()];
    for seed in 1..=8u32 {
        let mut w = World::with_setup(seed, 3, MapKind::Standard, false, [&HUMANS, &VAEL]);
        w.set_ai_seats([true, true]);
        let mut gone = [0usize; 3];
        let mut seen: Vec<Id> = Vec::new();
        let mut dead = 0usize;
        while !w.over && w.time < 1200.0 {
            w.step();
            w.events.clear();
            let alive: Vec<Id> = w
                .units
                .iter()
                .filter(|u| u.team == 0 && u.kind == UnitKind::Harvester)
                .map(|u| u.id)
                .collect();
            dead += seen.iter().filter(|id| !alive.contains(id)).count();
            seen = alive;
            if (w.time - 240.0).abs() < 0.02 {
                gone[0] = dead;
            }
            if (w.time - 420.0).abs() < 0.02 {
                gone[1] = dead;
            }
        }
        gone[2] = dead;
        for (k, n) in w.lost_to[0].iter().enumerate() {
            total[k] += n;
        }
        println!(
            "seed {seed}: winner {:?} at {:.0} s; Riggers gone by 4:00 {}, 7:00 {}, end {}",
            w.winner, w.time, gone[0], gone[1], gone[2]
        );
    }
    let mut top: Vec<(u32, String)> = total
        .iter()
        .enumerate()
        .filter(|(_, n)| **n > 0)
        .map(|(k, &n)| {
            let name = if k < UNIT_KINDS.len() {
                UNIT_KINDS[k].def().name.to_string()
            } else {
                BLDG_KINDS[k - UNIT_KINDS.len()].def().name.to_string()
            };
            (n, name)
        })
        .collect();
    top.sort_by_key(|t| std::cmp::Reverse(t.0));
    println!("the Humans' losses by killer: {top:?}");
}

#[test]
#[ignore]
fn human_mirror_grind_probe() {
    // The Human Medium mirror on 96x96 (the lab's timeouts): each minute, each seat's army supply, workers, Cores,
    // towers, units lost and killed, and banked salt.
    use endfall_sim::map::MapSize;
    let seeds: Vec<u32> = std::env::var("PROBE_SEEDS")
        .map(|s| s.split(',').map(|x| x.parse().unwrap()).collect())
        .unwrap_or(vec![4, 6, 7]);
    for seed in seeds {
        let mut w = World::with_size(
            seed,
            1,
            MapKind::Standard,
            MapSize::square(96),
            0,
            &[&HUMANS, &HUMANS],
        );
        assert!(w.set_diffs(&[1, 1]));
        assert!(w.set_ai_seats([true, true]));
        println!("seed {seed}");
        while w.winner < 0 && w.time < 1800.0 {
            w.step();
            w.events.clear();
            if w.tick.is_multiple_of(60 * 30) {
                let mut line = format!("{:>3} min", (w.time / 60.0).round());
                for s in 0..2u8 {
                    let army: i32 = w
                        .units
                        .iter()
                        .filter(|u| u.team == s && !u.kind.def().worker)
                        .map(|u| u.kind.def().supply)
                        .sum();
                    let workers = w
                        .units
                        .iter()
                        .filter(|u| u.team == s && u.kind.def().worker)
                        .count();
                    let cores = w
                        .bldgs
                        .iter()
                        .filter(|b| b.team == s && b.kind == BldgKind::Core)
                        .count();
                    let towers = w
                        .bldgs
                        .iter()
                        .filter(|b| b.team == s && b.kind == BldgKind::Turret)
                        .count();
                    let st = &w.stats[s as usize];
                    line += &format!(
                        " | s{s}: army {army:>2} wk {workers:>2} cores {cores} towers {towers} lost {:>3} killed {:>3} salt {:>5}",
                        st.lost, st.killed, w.res[s as usize][0]
                    );
                }
                println!("{line}");
            }
        }
        println!("  winner {} at {:.0} s", w.winner, w.time);
    }
}
