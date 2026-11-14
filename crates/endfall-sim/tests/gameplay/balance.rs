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
    // through it, and since a mine takes in eight Villagers for 7.5 s, now and then the whole crew is inside as the
    // raid passes)
    assert!(
        undefended.iter().all(|&r| r.1 == 0)
            && undefended.iter().filter(|&&r| r.0 >= 6).count() >= 10,
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
fn a_siege_line_holds_where_the_same_gold_in_troopers_does_not() {
    // Tanks deployed behind a line of Troopers, against a clump that walks in: they beat it, by more than Troopers
    // for the same price would (the measured values: +0.50 against +0.24 Troopers' loss, +0.59 against +0.34 for
    // Scythes, +0.39 against +0.36 for Scythes and Prisms).
    use UnitKind::*;
    let trp = siege_line(1, (Trooper, 8), &[Trooper]);
    assert!(trp > 0.2, "Troopers break on a tank's line: {trp:+.2}");
    assert!(trp > siege_line(0, (Trooper, 16), &[Trooper]) + 0.3);
    // (Buggies, since the arc stronger one for one and cheaper, are no longer broken by it outright: the line still does
    // better against them than the same gold in Guards)
    let scy = siege_line(1, (Trooper, 8), &[Scythe]);
    assert!(
        scy > siege_line(0, (Trooper, 16), &[Scythe]),
        "against Buggies too: {scy:+.2}"
    );
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
fn top_units_beat_lines_siege_holds_and_only_tech_answers_it() {
    // The top units and siege (Stelian and the PM, Nov 13; it replaces the arc's counter guarantee, machines over the
    // Kingdom's units one for one):
    // - an elite (the Knight, the Android) is a big step per unit ("a marine against a battle cruiser"): one beats
    //   four of its side's line, and in the open three beat about 1.3 to 1.5 times their gold of the other side's line;
    // - siege (the Cannon, the Rover) behind towers holds against two to three times its gold of massed basics;
    // - the answer to entrenched siege is the other side's tech, never more basics: diving inside its ring (Drones,
    //   Knights), out-spotting it (Rovers with Drones), or its own siege, each winning at a ratio the basics lose at;
    // - tech against tech stays a fight. Thresholds sit inside what `top_unit_probe` and `entrenched_probe` measured
    //   (Nov 13). No upgrades.
    use UnitKind::*;
    let kingdom_line = [Trooper, Trooper, Lancer];
    // The per-unit step: one elite against four of its own side's line unit.
    assert!(
        duel_n(Knight, 1, &[Trooper], 4, no_micro) > 0.3,
        "a Knight beats four Guards"
    );
    assert!(
        duel_n(Umbra, 1, &[Prism], 4, no_micro) > 0.3,
        "an Android beats four Sellswords"
    );
    // Per gold in the open: three elites beat 1.2 times their gold of the other side's line, and lose to 1.7 times.
    let per_gold = |top: UnitKind, line: &[UnitKind], r: f64| {
        let per: f64 = line.iter().map(|&k| unit_value(k)).sum::<f64>() / line.len() as f64;
        let m = (unit_value(top) * 3.0 * r / per).round() as usize;
        duel_n(top, 3, line, m, no_micro)
    };
    for (top, line) in [(Knight, &[Prism][..]), (Umbra, &kingdom_line[..])] {
        assert!(
            per_gold(top, line, 1.2) > 0.0,
            "{top:?} beats 1.2 times its gold of the line"
        );
        assert!(
            per_gold(top, line, 1.7) < 0.0,
            "{top:?} loses to 1.7 times its gold of the line"
        );
    }
    // Entrenched siege holds against massed basics at twice its gold (two and a half for the Cannons' splash)...
    let cannons = |att: &[UnitKind], r: f64| {
        entrenched(PLAYER, (SiegeTank, 3), (BldgKind::Turret, 2), att, r)
    };
    let rovers =
        |att: &[UnitKind], r: f64| entrenched(ENEMY, (Monolith, 3), (BldgKind::Ward, 1), att, r);
    let held: [(&str, f64); 3] = [
        (
            "3 Cannons and 2 Watchtowers hold 2.5 times their gold of Sellswords",
            cannons(&[Prism], 2.5),
        ),
        // (1.4 and 1.25 times since Nov 14, twice before: the Rover priced above the Android, 550 for 380, its damage a
        // second the same in a heavier, slower salvo; 1.4 times is as many Guards as twice its old price bought, and
        // with Archers it ties at 1.4)
        (
            "3 Rovers behind a mast hold 1.4 times their gold of Guards",
            rovers(&[Trooper], 1.4),
        ),
        ("... and 1.25 times of Guards and Archers", rovers(&kingdom_line, 1.25)),
    ];
    // ... and falls to the other side's tech at no more than that.
    let broken: [(&str, f64); 4] = [
        (
            "Drones dive the Cannons and towers at their gold",
            cannons(&[Shrike], 1.0),
        ),
        (
            "Rovers with Drones out-spot them at twice it",
            cannons(&[Monolith, Shrike], 2.0),
        ),
        (
            "Knights dive the Rovers at 1.5 times",
            rovers(&[Knight], 1.5),
        ),
        (
            "Cannons out-shell the Rovers at their gold",
            rovers(&[SiegeTank], 1.0),
        ),
    ];
    for (claim, got) in held {
        assert!(got > 0.0, "{claim}: {got:+.2}");
    }
    for (claim, got) in broken {
        assert!(got < 0.0, "{claim}: {got:+.2}");
    }
    // Tech against tech: the Knight and the Android, equal gold, neither wiped out.
    let k = duel(&[Knight], &[Umbra], 2200.0);
    assert!(
        k.abs() < 0.7,
        "Knights against Androids stay a fight: {k:+.2}"
    );
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
    // towers, units lost and killed, and banked gold.
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
                        " | s{s}: army {army:>2} wk {workers:>2} cores {cores} towers {towers} lost {:>3} killed {:>3} gold {:>5}",
                        st.lost, st.killed, w.res[s as usize][0]
                    );
                }
                println!("{line}");
            }
        }
        println!("  winner {} at {:.0} s", w.winner, w.time);
    }
}

#[test]
#[ignore]
fn arc_counter_probe() {
    use UnitKind::*;
    let kingdom = [Trooper, Lancer, Rider, Knight, Bastion, SiegeTank];
    let machines = [Scythe, Shrike, Monolith, Umbra];
    println!("unit for unit (8 a side), rows machines, columns {kingdom:?}");
    for m in machines {
        let row: Vec<String> = kingdom
            .iter()
            .map(|&k| format!("{:+.2}", duel_count(m, k, 8, tech_micro)))
            .collect();
        println!("{m:?}: {}", row.join(" "));
    }
    for budget in [2200.0, 4400.0] {
        println!("cost-equal {budget}: rows Kingdom answers, columns {machines:?}");
        for a in [
            &[Lancer][..],
            &[Trooper, Trooper, Lancer],
            &[Bastion],
            &[SiegeTank, Knight],
            &[Knight],
            &[Rider],
        ] {
            let row: Vec<String> = machines
                .iter()
                .map(|&m| format!("{:+.2}", duel_with(a, &[m], budget, tech_micro)))
                .collect();
            println!("{a:?}: {}", row.join(" "));
        }
    }
}

#[test]
#[ignore]
fn top_unit_probe() {
    // The top units against basic lines: the most of each line (by gold, a share of the top units' price) that 3 of the
    // top unit beat, no upgrades; and one top unit against N of its own side's basic unit.
    use UnitKind::*;
    let kingdom_line = [Trooper, Trooper, Lancer];
    let exp_line = [Prism];
    for b in [1000.0, 2000.0] {
        println!(
            "lines at {b}: Guard+Archer v Sellsword {:+.2}, 2 Guards+Archer v Sellsword {:+.2}, Guard v Sellsword {:+.2}",
            duel(&[Trooper, Lancer], &[Prism], b),
            duel(&kingdom_line, &[Prism], b),
            duel(&[Trooper], &[Prism], b)
        );
    }
    for (top, line) in [
        (Knight, &exp_line[..]),
        (SiegeTank, &exp_line[..]),
        (Umbra, &kingdom_line[..]),
        (Monolith, &kingdom_line[..]),
    ] {
        let own = if matches!(top, Knight | SiegeTank) {
            &kingdom_line[..]
        } else {
            &exp_line[..]
        };
        println!(
            "{top:?}: 3 beat {:.2}x of the other line, {:.2}x of their own; one against N of its own basic: {}",
            breakeven(top, 3, line, no_micro),
            breakeven(top, 3, own, no_micro),
            (2..9)
                .map(|n| format!("{n}:{:+.2}", duel_n(top, 1, &own[..1], n, no_micro)))
                .collect::<Vec<_>>()
                .join(" ")
        );
    }
}

/// Entrenched siege (Stelian, Nov 13: "range plus splash crush a mass"): `siege` (a kind and how many) of seat `def`
/// a few tiles behind `towers` (a kind and how many, finished), on flat ground (with an Uplink behind them for a side
/// whose machines need coverage), as attackers worth `ratio` times the siege units' gold (`attackers`, a mix as in
/// `duel`) attack-move in from 25 tiles off. Scored like `duel`, the towers counted at their price (+: the defense
/// held). Played from three offsets, the median.
pub fn entrenched(
    def: u8,
    siege: (UnitKind, usize),
    towers: (BldgKind, usize),
    attackers: &[UnitKind],
    ratio: f64,
) -> f64 {
    let mut r: Vec<f64> = [0.0, 40.0, -50.0]
        .iter()
        .map(|&off| entrenched_once(def, siege, towers, attackers, ratio, off))
        .collect();
    r.sort_by(|p, q| p.partial_cmp(q).unwrap());
    r[1]
}

fn entrenched_once(
    def: u8,
    siege: (UnitKind, usize),
    towers: (BldgKind, usize),
    attackers: &[UnitKind],
    ratio: f64,
    off: f64,
) -> f64 {
    let mut w = flat_arena(16);
    let att = 1 - def;
    let y0 = 32.0 * TILE + off;
    let mut line = Vec::new();
    for i in 0..siege.1 {
        let y = y0 + (i as f64 - (siege.1 as f64 - 1.0) / 2.0) * 44.0;
        line.push(w.make_unit(siege.0, def, 15.0 * TILE, y));
    }
    let mut keep = Vec::new();
    for i in 0..towers.1 {
        let ty = (y0 / TILE) as i32 + (i as i32 - towers.1 as i32 / 2) * 4;
        keep.push(w.make_building(towers.0, def, 19, ty, true));
    }
    let machines = |k: &[UnitKind]| k.iter().any(|&u| endfall_sim::data::radio::needs_range(u));
    if machines(&[siege.0]) {
        w.make_building(BldgKind::Uplink, def, 9, (y0 / TILE) as i32 - 1, true);
    }
    if machines(attackers) {
        w.make_building(BldgKind::Uplink, att, 30, (y0 / TILE) as i32 + 6, true);
    }
    w.recalc_supply(def);
    w.recalc_supply(att);
    for &t in &line {
        let _ = w.cast(t, AbilityKind::Deploy);
    }
    let spent_siege: f64 = line
        .iter()
        .map(|&u| unit_value(w.unit(u).unwrap().kind))
        .sum();
    let spent_a = spent_siege
        + keep
            .iter()
            .map(|&b| w.bldg(b).unwrap().kind.def().cost[0] as f64)
            .sum::<f64>();
    let per: f64 = attackers.iter().map(|&k| unit_value(k)).sum();
    let n = (spent_siege * ratio / per).round().max(1.0) as usize;
    let kinds: Vec<UnitKind> = (0..n).flat_map(|_| attackers.iter().copied()).collect();
    let gap = kinds.iter().map(|k| k.def().r).fold(0.0, f64::max) * 2.0 + 4.0;
    let foes: Vec<Id> = kinds
        .iter()
        .enumerate()
        .map(|(i, &k)| {
            let (col, row) = ((i / 8) as f64, (i % 8) as f64 - 3.5);
            w.make_unit(k, att, 40.0 * TILE + col * gap, y0 + row * gap)
        })
        .collect();
    w.recalc_supply(att);
    let spent_b: f64 = kinds.iter().map(|&k| unit_value(k)).sum();
    run(&mut w, 3); // (the siege settles in)
    let alive = |w: &World| {
        let units: f64 = line
            .iter()
            .filter_map(|&i| w.unit(i))
            .map(|u| unit_value(u.kind) * u.hp / u.maxhp)
            .sum();
        let bldgs: f64 = keep
            .iter()
            .filter_map(|&b| w.bldg(b))
            .map(|b| b.kind.def().cost[0] as f64 * b.hp / b.maxhp)
            .sum();
        let them: f64 = foes
            .iter()
            .filter_map(|&i| w.unit(i))
            .map(|u| unit_value(u.kind) * u.hp / u.maxhp)
            .sum();
        (units + bldgs, them)
    };
    for t in 0..150 * TPS {
        if t % TPS == 0 {
            // (the attackers keep coming: an idle one walks at the line again)
            for &f in &foes {
                if w.unit(f).is_some_and(|u| u.task == Task::Idle) {
                    w.attack_move(f, 12.0 * TILE, y0);
                }
            }
        }
        w.step();
        w.events.clear();
        let (a, b) = alive(&w);
        if a < 1.0 || b < 1.0 {
            break;
        }
    }
    let (a, b) = alive(&w);
    a / spent_a - b / spent_b
}

#[test]
#[ignore]
fn entrenched_probe() {
    // Entrenched siege against masses of basics at 1 to 4 times the siege's gold, and the tech answers at 1 to 2 times.
    use UnitKind::*;
    let k = (BldgKind::Turret, 2);
    let e = (BldgKind::Ward, 1);
    type Scene<'a> = (
        &'a str,
        u8,
        (UnitKind, usize),
        (BldgKind, usize),
        &'a [UnitKind],
    );
    let scenes: [Scene; 10] = [
        (
            "3 Cannons + 2 towers v Sellswords",
            PLAYER,
            (SiegeTank, 3),
            k,
            &[Prism],
        ),
        (
            "3 Cannons + 2 towers v Bruisers+Ss",
            PLAYER,
            (SiegeTank, 3),
            k,
            &[Bruiser, Prism, Prism],
        ),
        (
            "3 Cannons + 2 towers v Drones",
            PLAYER,
            (SiegeTank, 3),
            k,
            &[Shrike],
        ),
        (
            "3 Cannons + 2 towers v Rovers",
            PLAYER,
            (SiegeTank, 3),
            k,
            &[Monolith],
        ),
        (
            "3 Cannons + 2 towers v Rover+Drone",
            PLAYER,
            (SiegeTank, 3),
            k,
            &[Monolith, Shrike],
        ),
        (
            "3 Cannons + 2 towers v Androids",
            PLAYER,
            (SiegeTank, 3),
            k,
            &[Umbra],
        ),
        (
            "3 Rovers + mast v Guards",
            ENEMY,
            (Monolith, 3),
            e,
            &[Trooper],
        ),
        (
            "3 Rovers + mast v Guards+Archers",
            ENEMY,
            (Monolith, 3),
            e,
            &[Trooper, Trooper, Lancer],
        ),
        (
            "3 Rovers + mast v Knights",
            ENEMY,
            (Monolith, 3),
            e,
            &[Knight],
        ),
        (
            "3 Rovers + mast v Cannons",
            ENEMY,
            (Monolith, 3),
            e,
            &[SiegeTank],
        ),
    ];
    for (name, def, siege, towers, att) in scenes {
        let row: Vec<String> = [1.0, 1.5, 2.0, 2.5, 3.0, 4.0]
            .iter()
            .map(|&r| format!("{r}x {:+.2}", entrenched(def, siege, towers, att, r)))
            .collect();
        println!("{name:>36}: {}", row.join("  "));
    }
}

#[test]
#[ignore]
fn basic_scaling_probe() {
    // Do basic units scale too cheaply (Stelian, Nov 13)? For each people's basic mass against each people's top tier:
    // the gold, as a share of the other side's, at which the basic mass starts winning: in the open against three of
    // the top unit (`breakeven`), and against three siege units behind towers (`entrenched`, the share of the siege's
    // own gold, the towers on top; swept 0.75x to 3x).
    use UnitKind::*;
    let lines: [(&str, &[UnitKind]); 2] = [
        (
            "Kingdom line (2 Guards, an Archer)",
            &[Trooper, Trooper, Lancer],
        ),
        ("Expedition line (Sellswords)", &[Prism]),
    ];
    for (top, who) in [(Knight, "3 Knights"), (Umbra, "3 Androids")] {
        for (name, line) in lines {
            println!(
                "open: {name} against {who}: wins from {:.2}x the gold",
                breakeven(top, 3, line, no_micro)
            );
        }
    }
    let sieges = [
        (
            "3 Cannons + 2 Watchtowers",
            PLAYER,
            (SiegeTank, 3),
            (BldgKind::Turret, 2),
        ),
        (
            "3 Rovers + a Sentry mast",
            ENEMY,
            (Monolith, 3),
            (BldgKind::Ward, 1),
        ),
    ];
    for (who, def, siege, towers) in sieges {
        let towers_gold = towers.0.def().cost[0] as f64 * towers.1 as f64;
        let siege_gold = siege.0.def().cost[0] as f64 * siege.1 as f64;
        for (name, line) in lines {
            let mut from = None;
            let mut r = 0.75;
            while r <= 3.0 + 1e-9 {
                if entrenched(def, siege, towers, line, r) < 0.0 {
                    from = Some(r);
                    break;
                }
                r += 0.25;
            }
            println!(
                "entrenched: {name} against {who}: wins from {} the siege's gold ({} with the towers)",
                from.map_or("over 3x".into(), |r| format!("{r:.2}x")),
                from.map_or("—".into(), |r| format!(
                    "{:.2}x",
                    r * siege_gold / (siege_gold + towers_gold)
                ))
            );
        }
    }
}
