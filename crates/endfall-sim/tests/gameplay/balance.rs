//! Balance: cost-equal duel matrices for both races, and the early raid answer.

use super::common::*;

#[test]
#[ignore]
fn balance_matrix() {
    // The Kingdom's armies against each other, cost-equal, for tuning.
    use UnitKind::*;
    let armies: [(&str, &[UnitKind]); 8] = [
        ("guard", &[Trooper]),
        ("archer", &[Lancer]),
        ("rider", &[Rider]),
        ("knight", &[Knight]),
        ("ballista", &[Bastion]),
        ("2grd+arch", &[Trooper, Trooper, Lancer]),
        ("grd+knight", &[Trooper, Trooper, Knight]),
        ("arch+grd", &[Lancer, Trooper]),
    ];
    for budget in [2200.0, 4400.0] {
        println!("budget {budget}");
        for (na, a) in armies {
            let row: Vec<String> = armies
                .iter()
                .map(|(_, b)| format!("{:+.2}", duel(a, b, budget)))
                .collect();
            println!("{na:>11} {}", row.join(" "));
        }
    }
}

#[test]
#[ignore]
fn anti_air_matrix() {
    // The Ballista, the Archer and the Sellsword against flyers and the ground (cost-equal), for tuning.
    use UnitKind::*;
    let rows: [(&str, &[UnitKind], &[UnitKind]); 12] = [
        ("ballista v drone", &[Bastion], &[Shrike]),
        ("ballista v guard", &[Bastion], &[Trooper]),
        ("ballista v sellsword", &[Bastion], &[Prism]),
        ("ballista v buggy", &[Bastion], &[Scythe]),
        ("grd+ballista v drone", &[Trooper, Bastion], &[Shrike]),
        ("archer v drone", &[Lancer], &[Shrike]),
        ("archer v guard", &[Lancer], &[Trooper]),
        ("archer v buggy", &[Lancer], &[Scythe]),
        ("archer v sellsword", &[Lancer], &[Prism]),
        ("sellsword v drone", &[Prism], &[Shrike]),
        ("android v drone", &[Umbra], &[Shrike]),
        ("grd+arch v drone", &[Trooper, Lancer], &[Shrike]),
    ];
    for budget in [2200.0, 4400.0] {
        for (name, a, b) in rows {
            println!("{budget} {name:>22}: {:+.2}", duel(a, b, budget));
        }
    }
}

#[test]
fn a_turret_or_a_few_lancers_answer_an_early_raider_raid() {
    // Over a dozen maps (one scene is a knife's edge: where each harvester stands as the raid comes in decides it):
    // an undefended mineral line loses all eight (or six or seven: those inside the mine are out of reach), a turret
    // or four Archers bring the two Riders down in nearly every raid, half the villagers or fewer lost in a typical one.
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
    // (a worker that stays inside its mine while the Riders are there is out of their reach: one or two may live
    // through it)
    assert!(
        undefended.iter().all(|&r| r.0 >= 6 && r.1 == 0),
        "an undefended mineral line is easy prey: {undefended:?}"
    );
    for (what, v) in [("a turret", raids(1, 0)), ("four Archers", raids(0, 4))] {
        let down = v.iter().filter(|r| r.1 == 2).count();
        assert!(
            down >= 10 && median_lost(&v) <= 4,
            "{what} brings down a two-Rider raid: {down} of 12 raids, {} of 8 harvesters lost in a typical one ({v:?})",
            median_lost(&v)
        );
    }
}

#[test]
#[ignore]
fn siege_matrix() {
    // The Cannon's duels (cost-equal, nine tiles apart: they undervalue reach) and its siege lines, for tuning.
    use UnitKind::*;
    let rows: [(&str, &[UnitKind], &[UnitKind]); 8] = [
        ("tank v trooper", &[SiegeTank], &[Trooper]),
        ("tank v scythe", &[SiegeTank], &[Scythe]),
        ("tank v bruiser", &[SiegeTank], &[Bruiser]),
        ("tank v knight", &[SiegeTank], &[Knight]),
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

/// Every tech (`tech_micro`), and the side's Guards brace where they stand (Brace, as a player holding a line would).
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
fn retheme_cross_matrix() {
    // The re-theme's compositions, the Kingdom against the Expedition at equal cost, every tech on both sides, and the
    // same Kingdom armies with their Guards braced (`dig`).
    use UnitKind::*;
    let kingdom: [(&str, &[UnitKind]); 9] = [
        ("guard", &[Trooper]),
        ("archer", &[Lancer]),
        ("2grd+arch", &[Trooper, Trooper, Lancer]),
        ("grd+arch", &[Trooper, Lancer]),
        ("knight", &[Knight]),
        ("knight+2grd", &[Knight, Trooper, Trooper]),
        ("treb+knight", &[SiegeTank, Knight]),
        ("rider", &[Rider]),
        ("ballista", &[Bastion]),
    ];
    let expedition: [(&str, &[UnitKind]); 7] = [
        ("sellsw", &[Prism]),
        ("buggy", &[Scythe]),
        ("android", &[Umbra]),
        ("bruiser", &[Bruiser]),
        ("rover", &[Monolith]),
        ("rover+2ss", &[Monolith, Prism, Prism]),
        ("bru+2ss", &[Bruiser, Prism, Prism]),
    ];
    for budget in [2200.0, 4400.0] {
        println!(
            "budget {budget}: rows Kingdom, columns {}",
            expedition.map(|v| v.0).join(" ")
        );
        for (na, a) in kingdom {
            let row: Vec<String> = expedition
                .iter()
                .map(|(_, b)| format!("{:+.2}", duel_with(a, b, budget, tech_micro)))
                .collect();
            let dug: Vec<String> = expedition
                .iter()
                .map(|(_, b)| format!("{:+.2}", duel_with(a, b, budget, dig_micro)))
                .collect();
            println!("{na:>12} {} | braced {}", row.join(" "), dug.join(" "));
        }
    }
}

#[test]
fn the_retheme_counters_hold_in_cost_equal_fights() {
    // The re-theme's counters, with every tech on both sides, at two budgets. Thresholds sit inside the values measured
    // by retheme_cross_matrix and anti_air_matrix (the first numbers, 2026-11-10; the lab tunes them after the tower
    // range).
    use UnitKind::*;
    for budget in [2200.0, 4400.0] {
        let d = |a: &[UnitKind], b: &[UnitKind]| duel_with(a, b, budget, tech_micro);
        let checks: [(&str, f64, f64); 11] = [
            ("Guards beat Buggies", d(&[Trooper], &[Scythe]), 0.1),
            ("Knights ride down Sellswords", d(&[Knight], &[Prism]), 0.2),
            // (the melee Bruiser, Nov 11: +0.17 at 2200; the lab tunes it)
            ("Knights beat Bruisers", d(&[Knight], &[Bruiser]), 0.1),
            (
                "the Rover's splash beats a clump of Guards",
                -d(&[Trooper], &[Monolith]),
                0.3,
            ),
            (
                "Cannons behind a Knight hold the Rover",
                d(&[SiegeTank, Knight], &[Monolith]),
                0.2,
            ),
            // (the Android an elite since the balance pass: it pays in gold for its Power, so the same gold in Archers
            // beats it; what it buys is strength for its places, which the Expedition runs short of)
            (
                "the same gold in Archers beats Androids",
                d(&[Lancer], &[Umbra]),
                0.2,
            ),
            ("Buggies beat Archers", -d(&[Lancer], &[Scythe]), 0.2),
            ("Archers answer Drones", d(&[Lancer], &[Shrike]), 0.3),
            ("Ballistas answer Drones", d(&[Bastion], &[Shrike]), 0.3),
            // (and for the same reason the same gold in Drones beats them: what the Android buys against flyers is
            // the air hit and the range at three Power, beside the Sentry mast and the Drone itself)
            (
                "the same gold in Drones beats Androids",
                d(&[Shrike], &[Umbra]),
                0.2,
            ),
            (
                "Archers are weak against the ground",
                -d(&[Lancer], &[Trooper]),
                0.2,
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
#[ignore]
fn brutal_worker_loss_probe() {
    // Brutal Kingdom against Brutal Expedition on 64x64: what kills the Kingdom's units (lost_to), and how many villagers
    // are gone by 4:00, 7:00 and the end.
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
            if w.tick == 240 * 30 {
                gone[0] = dead;
            }
            if w.tick == 420 * 30 {
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
