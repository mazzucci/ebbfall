//! The scripted opponent: it finishes games, scouts, raids, expands, retreats, answers flyers.

use super::common::*;

#[test]
fn the_ai_finishes_games_on_every_difficulty() {
    for diff in 0..3 {
        for seed in [2u32, 99] {
            let mut w = World::new(seed, diff);
            for _ in 0..30 * 60 * 15 {
                if w.over {
                    break;
                }
                w.step();
            }
            assert!(
                w.over && w.winner == ENEMY as i32,
                "diff {diff} seed {seed}: AI should beat an idle player in 15 min"
            );
        }
    }
}

#[test]
fn the_ai_plays_either_seat() {
    // On seat 0 against an idle seat 1, it wins the same way (it knows its own base and its foe's from its seat).
    for seed in [2u32, 99] {
        let mut w = World::new(seed, 1);
        w.set_ai_seats([true, false]);
        for _ in 0..30 * 60 * 15 {
            if w.over {
                break;
            }
            w.step();
        }
        assert!(
            w.over && w.winner == PLAYER as i32,
            "seed {seed}: the AI on seat 0 beats an idle seat 1 (t={:.0})",
            w.time
        );
        assert!(
            w.stats[0].razed > 0 && w.stats[1].lost > 0,
            "each seat keeps its own score"
        );
    }
}

#[test]
fn two_ais_play_each_other_to_the_end() {
    for (seed, races) in [
        (5u32, [&HUMANS, &HUMANS]),
        (8, [&VAEL, &HUMANS]),
        (13, [&HUMANS, &VAEL]),
    ] {
        let mut w = World::with_setup(seed, 1, MapKind::Standard, false, races);
        w.set_ai_seats([true, true]);
        let mut hits = [0, 0];
        for _ in 0..30 * 60 * 40 {
            if w.over {
                break;
            }
            w.step();
            for e in w.events.drain(..) {
                if let endfall_sim::world::Event::Attacked { team, .. } = e {
                    hits[team as usize] += 1;
                }
            }
        }
        assert!(
            w.over,
            "seed {seed}: someone wins within 40 min (t={:.0})",
            w.time
        );
        assert!(
            hits[0] > 0 && hits[1] > 0,
            "seed {seed}: both seats fought: {hits:?}"
        );
    }
}

#[test]
fn the_ai_keeps_training_troopers_when_short_of_ether() {
    let mut w = World::new(31, 1);
    run(&mut w, 150);
    let id = w.make_unit(UnitKind::Wasp, PLAYER, 60.0, 60.0); // a flyer far away makes it want Lancers
    w.hold_unit(id);
    let before = count(&w, ENEMY, UnitKind::Trooper);
    for _ in 0..90 * TPS {
        w.res[ENEMY as usize][1] = 0; // no ether at all
        w.step();
    }
    assert!(
        count(&w, ENEMY, UnitKind::Trooper) > before + 2,
        "barracks fall back to Troopers"
    );
}

#[test]
fn the_ai_answers_flyers_with_lancers() {
    let mut w = World::new(31, 0); // Easy: its first attack comes late enough to watch it react
    run(&mut w, 150); // let it build a barracks
    let (cx, cy) = core(&w, ENEMY);
    for k in 0..3 {
        // parked in sight of the AI's base but out of reach of its buildings (watching, not raiding)
        let id = w.make_unit(
            UnitKind::Wasp,
            PLAYER,
            (cx as f64 - 7.0) * TILE - k as f64 * 30.0,
            (cy as f64 + 9.0) * TILE,
        );
        w.hold_unit(id);
    }
    run(&mut w, 80);
    assert!(!w.over, "the game is still on");
    assert!(
        count(&w, ENEMY, UnitKind::Lancer) > 0
            || w.bldgs
                .iter()
                .any(|b| b.team == ENEMY && b.queue.contains(&UnitKind::Lancer)),
        "AI trains lancers against flyers"
    );
}

#[test]
fn the_ai_only_reacts_to_flyers_it_has_seen() {
    let mut w = World::new(31, 0);
    run(&mut w, 150);
    // A wasp hiding in the top-left corner, far from anything the AI has looked at.
    let wasp = w.make_unit(UnitKind::Wasp, PLAYER, 40.0, 40.0);
    w.hold_unit(wasp);
    run(&mut w, 40);
    assert_eq!(
        count(&w, ENEMY, UnitKind::Lancer),
        0,
        "no lancers against a flyer it cannot see"
    );
    assert!(
        !w.bldgs
            .iter()
            .any(|b| b.team == ENEMY && b.queue.contains(&UnitKind::Lancer))
    );
    // Now fly it into view.
    let (cx, cy) = core(&w, ENEMY);
    w.move_to(wasp, (cx as f64 - 3.0) * TILE, (cy as f64 + 6.0) * TILE);
    run(&mut w, 40);
    assert!(
        count(&w, ENEMY, UnitKind::Lancer) > 0
            || w.bldgs
                .iter()
                .any(|b| b.team == ENEMY && b.queue.contains(&UnitKind::Lancer)),
        "lancers once it has seen the flyer"
    );
}

#[test]
fn the_ai_scouts_the_player_base_early() {
    let mut w = World::new(41, 1);
    let (px, py) = core(&w, PLAYER);
    run(&mut w, 150);
    let seen = (0..4).any(|dy| {
        (0..4).any(|dx| w.explored[ENEMY as usize][((py + dy) * MW + px + dx) as usize] != 0)
    });
    assert!(seen, "the AI has looked at the player's core");
    // The scout goes back to mining at home, not at the player's fields.
    run(&mut w, 90);
    let (cx, cy) = ((px as f64 + 2.0) * TILE, (py as f64 + 2.0) * TILE);
    let poaching = w
        .units
        .iter()
        .filter(|u| u.team == ENEMY && u.kind == UnitKind::Harvester)
        .filter(|u| match u.task {
            Task::Gather { node, .. } => w
                .map
                .node(node)
                .is_some_and(|n| ((n.x - cx).powi(2) + (n.y - cy).powi(2)).sqrt() < 800.0),
            _ => false,
        })
        .count();
    assert_eq!(poaching, 0, "no AI harvester mines by the player's base");
}

#[test]
fn ai_wasps_raid_the_players_harvesters() {
    let mut w = World::new(43, 1);
    run(&mut w, 120); // scouting done
    // A soldier stands among the player's harvesters: the raiders go for the harvesters anyway.
    let mine: Vec<&Unit> = w
        .units
        .iter()
        .filter(|u| u.team == PLAYER && u.kind == UnitKind::Harvester)
        .collect();
    let n = mine.len() as f64;
    let (mx, my) = (
        mine.iter().map(|u| u.x).sum::<f64>() / n,
        mine.iter().map(|u| u.y).sum::<f64>() / n,
    );
    let guard = w.make_unit(UnitKind::Vanguard, PLAYER, mx, my);
    w.hold_unit(guard);
    let (cx, cy) = core(&w, ENEMY);
    for k in 0..3 {
        w.make_unit(
            UnitKind::Wasp,
            ENEMY,
            (cx as f64 + 2.0) * TILE + k as f64 * 30.0,
            (cy as f64 + 6.0) * TILE,
        );
    }
    let hp = |w: &World| {
        w.units
            .iter()
            .filter(|u| u.team == PLAYER && u.kind == UnitKind::Harvester)
            .map(|u| u.hp)
            .sum::<f64>()
    };
    let before = hp(&w);
    // Until the harvesters have taken a beating, the guard is left alone.
    for _ in 0..60 * TPS {
        w.step();
        if before - hp(&w) >= 100.0 {
            break;
        }
    }
    let lost = before - hp(&w);
    assert!(
        lost >= 100.0,
        "the raid hurt the player's harvesters: {lost}"
    );
    let g = w.unit(guard).unwrap();
    assert!(
        g.maxhp - g.hp < lost * 0.4,
        "the raiders went for the harvesters, not the guard: guard lost {}, harvesters {lost}",
        g.maxhp - g.hp
    );
}

#[test]
fn hurt_wasps_stay_home_and_healthy_ones_raid() {
    let mut w = World::new(43, 1);
    run(&mut w, 120);
    let (cx, cy) = core(&w, ENEMY);
    let at = |k: i32| {
        (
            (cx as f64 + 2.0) * TILE + k as f64 * 30.0,
            (cy as f64 + 6.0) * TILE,
        )
    };
    // Four hurt wasps first (lower ids), then two healthy ones.
    let hurt: Vec<Id> = (0..4)
        .map(|k| {
            let (x, y) = at(k);
            let id = w.make_unit(UnitKind::Wasp, ENEMY, x, y);
            w.units.iter_mut().find(|u| u.id == id).unwrap().hp = 25.0;
            id
        })
        .collect();
    let fit: Vec<Id> = (4..6)
        .map(|k| {
            let (x, y) = at(k);
            w.make_unit(UnitKind::Wasp, ENEMY, x, y)
        })
        .collect();
    let home = ((cx as f64 + 2.0) * TILE, (cy as f64 + 2.0) * TILE);
    let away = |w: &World, id: Id| {
        w.unit(id).map_or(0.0, |u| {
            ((u.x - home.0).powi(2) + (u.y - home.1).powi(2)).sqrt()
        })
    };
    run(&mut w, 30);
    for &h in &hurt {
        assert!(away(&w, h) < 500.0, "hurt wasp {h} stays home");
    }
    assert!(
        fit.iter().any(|&f| away(&w, f) > 900.0),
        "the healthy wasps went raiding"
    );
}

#[test]
fn the_ai_expands_to_a_second_base() {
    let mut w = World::new(33, 1);
    let c = w
        .bldgs
        .iter_mut()
        .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
        .unwrap();
    c.hp = 1e9;
    c.maxhp = 1e9;
    run(&mut w, 720);
    let cores: Vec<_> = w
        .bldgs
        .iter()
        .filter(|b| b.team == ENEMY && b.kind == BldgKind::Core && b.done)
        .map(|b| (b.x, b.y))
        .collect();
    assert_eq!(cores.len(), 2, "AI has a second core by 12 min");
    let exp = cores[1];
    let working = w
        .units
        .iter()
        .filter(|u| u.team == ENEMY && matches!(u.task, Task::Gather { node, .. } if w.map.node(node).is_some_and(|n| ((n.x - exp.0).powi(2) + (n.y - exp.1).powi(2)).sqrt() < 300.0)))
        .count();
    assert!(working >= 3, "harvesters work the expansion: {working}");
}

#[test]
fn the_ai_finds_room_for_its_natural_on_cramped_labyrinths() {
    // (seeds whose natural once had no room for a Core between its vent, its field and the rock)
    for seed in [7, 253] {
        let mut w = World::with_map(seed, 1, MapKind::Labyrinth);
        let c = w
            .bldgs
            .iter_mut()
            .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
            .unwrap();
        c.hp = 1e9;
        c.maxhp = 1e9;
        run(&mut w, 720);
        let cores = w
            .bldgs
            .iter()
            .filter(|b| b.team == ENEMY && b.kind == BldgKind::Core)
            .count();
        assert_eq!(cores, 2, "seed {seed}: the AI expanded");
    }
}

#[test]
fn a_beaten_attack_wave_falls_back() {
    let mut w = World::new(45, 1);
    let c = w
        .bldgs
        .iter_mut()
        .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
        .unwrap();
    c.hp = 1e9;
    c.maxhp = 1e9;
    // Wait for the first wave to get well on its way.
    let (cx, cy) = core(&w, ENEMY);
    let home = ((cx as f64 + 2.0) * TILE, (cy as f64 + 2.0) * TILE);
    let away = |w: &World, id: Id| {
        w.unit(id)
            .is_some_and(|u| ((u.x - home.0).powi(2) + (u.y - home.1).powi(2)).sqrt() > 600.0)
    };
    let mut wave = Vec::new();
    for _ in 0..30 * 600 {
        w.step();
        wave = w.ai_wave().unwrap_or_default();
        if wave.len() >= 6 && wave.iter().all(|&id| away(&w, id)) {
            break;
        }
    }
    assert!(wave.len() >= 6, "a wave went out");
    // All but two die (under 40% of the wave is left).
    let doomed: Vec<Id> = wave.iter().copied().take(wave.len() - 2).collect();
    w.units.retain(|u| !doomed.contains(&u.id));
    w.recalc_supply(ENEMY);
    let survivors: Vec<Id> = wave
        .iter()
        .copied()
        .filter(|id| !doomed.contains(id))
        .collect();
    let d0: f64 = survivors
        .iter()
        .map(|&s| {
            let u = w.unit(s).unwrap();
            ((u.x - home.0).powi(2) + (u.y - home.1).powi(2)).sqrt()
        })
        .sum();
    run(&mut w, 8);
    let d1: f64 = survivors
        .iter()
        .filter_map(|&s| w.unit(s))
        .map(|u| ((u.x - home.0).powi(2) + (u.y - home.1).powi(2)).sqrt())
        .sum();
    assert!(d1 < d0 - 200.0, "survivors head home: {d0:.0} -> {d1:.0}");
}

#[test]
fn the_ai_researches_upgrades_in_a_long_game() {
    let mut w = World::new(33, 1);
    // A player whose core cannot fall, so the game lasts long enough to watch the AI's later behaviour.
    let c = w
        .bldgs
        .iter_mut()
        .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
        .unwrap();
    c.hp = 1e9;
    c.maxhp = 1e9;
    let army = |w: &World| {
        w.units
            .iter()
            .filter(|u| u.team == ENEMY && u.kind != UnitKind::Harvester)
            .count()
    };
    run(&mut w, 600);
    let army_10 = army(&w);
    run(&mut w, 240);
    assert!(!w.over, "the game is still on");
    assert!(
        w.upgrades[ENEMY as usize].iter().sum::<u8>() >= 1,
        "AI finished at least one upgrade by 14 min: {:?}",
        w.upgrades[1]
    );
    assert!(
        army(&w) > army_10,
        "and kept building its army while researching ({army_10} -> {})",
        army(&w)
    );
}

#[test]
fn the_ai_survives_its_building_sites_being_starved() {
    // An army camping outside the AI base kills every harvester that goes near a site under construction, so the
    // AI's watchdog eventually cancels the site. That used to crash the AI turn.
    for seed in [33, 7, 1234, 99] {
        let mut w = World::new(seed, 1);
        let c = w
            .bldgs
            .iter_mut()
            .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
            .unwrap();
        c.hp = 1e9;
        c.maxhp = 1e9;
        for _ in 0..30 * 60 * 9 {
            let sites: Vec<(f64, f64)> = w
                .bldgs
                .iter()
                .filter(|b| b.team == ENEMY && !b.done)
                .map(|b| (b.x, b.y))
                .collect();
            w.units.retain(|u| {
                !(u.team == ENEMY
                    && u.kind == UnitKind::Harvester
                    && sites
                        .iter()
                        .any(|&(x, y)| ((u.x - x).powi(2) + (u.y - y).powi(2)).sqrt() < 160.0))
            });
            w.recalc_supply(ENEMY);
            w.step();
        }
    }
}

/// The AI must beat an idle player on every map and difficulty (it once walled in its own builder on Hard and
/// then waited forever for a depot it could not build).
// One test per difficulty, so the three run in parallel.
#[test]
fn the_ai_beats_an_idle_player_on_many_maps_easy() {
    ai_beats_idle_player(0);
}
#[test]
fn the_ai_beats_an_idle_player_on_many_maps_medium() {
    ai_beats_idle_player(1);
}
#[test]
fn the_ai_beats_an_idle_player_on_many_maps_hard() {
    ai_beats_idle_player(2);
}

fn ai_beats_idle_player(diff: usize) {
    let maps: u32 = if cfg!(debug_assertions) { 3 } else { 40 };
    {
        let mut slowest = (0, 0);
        for m in 0..maps {
            let seed = m * 104_729 + 3;
            let mut w = World::new(seed, diff);
            let mut t = 0;
            while !w.over && t < 30 * 60 * 20 {
                w.step();
                t += 1;
            }
            assert!(
                w.over && w.winner == ENEMY as i32,
                "diff {diff} seed {seed}: no AI win after 20 min"
            );
            slowest = slowest.max((t / 30, seed));
        }
        println!(
            "diff {diff}: slowest AI win {}s (seed {})",
            slowest.0, slowest.1
        );
    }
}

#[test]
fn the_ai_hunts_down_buildings_it_has_not_seen() {
    // A passive player with a Depot hidden far from both bases: after razing the main base the AI must search
    // the map rather than stand on the empty start forever.
    for seed in [2, 33] {
        let mut w = World::new(seed, 1);
        // The open spot farthest from both starts, well away from the player's.
        let (p, e) = (core(&w, PLAYER), core(&w, ENEMY));
        let far = |t: (i32, i32)| {
            let d = |c: (i32, i32)| (t.0 - c.0).pow(2) + (t.1 - c.1).pow(2);
            d(p).min(d(e))
        };
        // (only where a player's builder could walk: not a pocket walled in by rock)
        let reach = reachable(&w, w.map.nearest_free(p.0 + 1, p.1 + 5, 8).unwrap());
        let hidden = (0..MH)
            .flat_map(|ty| (0..MW).map(move |tx| (tx, ty)))
            // (checked as ENEMY: the player may not build in unexplored ground, but this test cheats)
            .filter(|&(tx, ty)| w.can_place(BldgKind::Depot, tx, ty, ENEMY))
            .filter(|&(tx, ty)| reach[(ty * MW + tx) as usize])
            .filter(|&(tx, ty)| (tx - p.0).pow(2) + (ty - p.1).pow(2) >= 24 * 24)
            .max_by_key(|&t| far(t))
            .unwrap();
        w.make_building(BldgKind::Depot, PLAYER, hidden.0, hidden.1, true);
        for _ in 0..1500 * TPS {
            w.step();
            if w.over {
                break;
            }
        }
        assert!(
            w.over && w.winner == ENEMY as i32,
            "seed {seed}: the AI found the hidden depot (t={:.0})",
            w.time
        );
    }
}

#[test]
fn the_ai_repairs_its_buildings_once_the_fight_is_over() {
    let mut w = World::new(7, 1);
    let c = w
        .bldgs
        .iter_mut()
        .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
        .unwrap();
    c.hp = 1e9;
    c.maxhp = 1e9;
    run(&mut w, 200);
    let (id, max) = w
        .bldgs
        .iter()
        .find(|b| b.team == ENEMY && b.done && b.kind == BldgKind::Depot)
        .map(|b| (b.id, b.maxhp))
        .expect("the AI has a depot");
    w.bldgs.iter_mut().find(|b| b.id == id).unwrap().hp = (max * 0.3).round();
    run(&mut w, 45);
    let hp = w.bldg(id).map_or(0.0, |b| b.hp);
    // It may run short of shards before the last few hp (it spends on its army too), as a player can.
    assert!(hp > max * 0.8, "the AI repaired its depot: {hp}/{max}");
}

#[test]
fn a_broke_ai_does_not_shuttle_its_repairer_back_and_forth() {
    let mut w = World::new(7, 1);
    let c = w
        .bldgs
        .iter_mut()
        .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
        .unwrap();
    c.hp = 1e9;
    c.maxhp = 1e9;
    run(&mut w, 200);
    let id = w
        .bldgs
        .iter()
        .find(|b| b.team == ENEMY && b.done && b.kind == BldgKind::Depot)
        .unwrap()
        .id;
    w.bldgs.iter_mut().find(|b| b.id == id).unwrap().hp = 50.0;
    let mut starts = 0;
    let mut was = false;
    for _ in 0..20 * TPS {
        w.res[ENEMY as usize] = [0, 0]; // broke throughout
        w.step();
        let now = w.units.iter().any(|u| u.task == (Task::Repair { b: id }));
        if now && !was {
            starts += 1;
        }
        was = now;
    }
    assert!(
        starts <= 1,
        "the AI sent a repairer {starts} times while broke"
    );
}

#[test]
fn the_ai_finishes_games_on_every_map_kind() {
    use endfall_sim::map::MapKind;
    // Two seeds per kind, plus the menu's fixed maps (src/client/menu.js MAPS): Ashen Basin, Glass Reach, Cinder Divide.
    let fixed = [
        (4242, MapKind::Standard),
        (1998, MapKind::DeepFields),
        (2077, MapKind::Labyrinth),
    ];
    let runs = MapKind::ALL
        .iter()
        .flat_map(|&k| [(3, k), (11, k)])
        .chain(fixed);
    for (seed, kind) in runs {
        {
            let mut w = World::with_map(seed, 1, kind);
            for _ in 0..900 * TPS {
                w.step();
                if w.over {
                    break;
                }
            }
            assert!(
                w.over && w.winner == ENEMY as i32,
                "{kind:?} seed {seed}: the AI beats an idle player (t={:.0})",
                w.time
            );
        }
    }
}

#[test]
#[ignore]
fn raid_matrix() {
    for (wasps, turrets, troopers) in [
        (2, 0, 0),
        (2, 1, 0),
        (2, 0, 4),
        (3, 1, 0),
        (4, 1, 0),
        (4, 0, 6),
        (4, 1, 4),
    ] {
        let (h, lost) = raid(wasps, turrets, troopers);
        println!(
            "RAID {wasps} wasps vs {turrets} turret(s) + {troopers} troopers: {h}/8 harvesters lost, {lost}/{wasps} wasps lost"
        );
    }
}

#[test]
fn the_ai_fields_vanguards_from_its_barracks() {
    let mut w = World::new(2, 1);
    for b in w.bldgs.iter_mut().filter(|b| b.team == PLAYER) {
        b.hp = 1e9;
        b.maxhp = 1e9;
    }
    run(&mut w, 330);
    let (v, t) = (
        count(&w, ENEMY, UnitKind::Vanguard),
        count(&w, ENEMY, UnitKind::Trooper),
    );
    assert!(v >= 1, "the AI trains Vanguards once its Forge stands");
    assert!(
        v * 2 <= t + 2,
        "about one Vanguard per two Troopers: {v} Vanguards, {t} Troopers"
    );
}

#[test]
fn the_ai_is_not_alarmed_by_a_scout_but_answers_a_gunship() {
    // An unarmed Observer seen by the AI is no air threat: no Lancers. A Wasp in the same spot is.
    for (kind, lancers) in [(UnitKind::Observer, false), (UnitKind::Wasp, true)] {
        let mut w = World::new(31, 0);
        run(&mut w, 150);
        let (cx, cy) = core(&w, ENEMY);
        let id = w.make_unit(
            kind,
            PLAYER,
            (cx as f64 - 7.0) * TILE,
            (cy as f64 + 9.0) * TILE,
        );
        w.hold_unit(id);
        run(&mut w, 80);
        let trained = count(&w, ENEMY, UnitKind::Lancer) > 0
            || w.bldgs
                .iter()
                .any(|b| b.team == ENEMY && b.queue.contains(&UnitKind::Lancer));
        assert_eq!(trained, lancers, "{kind:?}: Lancers trained = {trained}");
    }
}

#[test]
fn the_ai_taps_its_expansion_vent_when_the_home_vent_runs_dry() {
    let mut w = World::new(33, 1);
    let c = w
        .bldgs
        .iter_mut()
        .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
        .unwrap();
    c.hp = 1e9;
    c.maxhp = 1e9;
    // The vent by the AI's base holds little: it runs dry early.
    let (ex, ey) = core(&w, ENEMY);
    let home = w
        .map
        .nodes
        .iter()
        .filter(|n| n.ether)
        .min_by_key(|n| (n.tx - ex).abs() + (n.ty - ey).abs())
        .unwrap()
        .id;
    w.map.node_mut(home).unwrap().amount = 300;
    run(&mut w, 840);
    assert_eq!(w.map.node(home).unwrap().amount, 0, "the home vent ran dry");
    let tapped: Vec<_> = w
        .map
        .nodes
        .iter()
        .filter(|n| n.ether && n.id != home)
        .filter(|n| {
            n.extractor
                .and_then(|x| w.bldg(x))
                .is_some_and(|b| b.team == ENEMY)
        })
        .collect();
    assert_eq!(tapped.len(), 1, "a second Extractor on another vent");
    let on_dry = w
        .units
        .iter()
        .filter(|u| u.team == ENEMY && matches!(u.task, Task::Gather { node, .. } if node == home))
        .count();
    assert!(
        on_dry <= 1,
        "at most one harvester on the dry vent: {on_dry}"
    );
    // Later, saving ether (one worker on it): nobody heads for the dry vent while the other flows.
    for _ in 0..12 {
        run(&mut w, 60);
        let busy_dry = w
            .units
            .iter()
            .filter(|u| u.team == ENEMY && u.carry == 0)
            .filter(|u| matches!(u.task, Task::Gather { node, phase: Phase::Go | Phase::Wait, .. } if node == home))
            .count();
        assert!(
            busy_dry <= 1,
            "{busy_dry} head for the dry vent at {}s",
            w.time as i32
        );
    }
    let flowing = w
        .map
        .nodes
        .iter()
        .filter(|n| n.ether && n.id != home && n.amount > 0)
        .find(|n| {
            n.extractor
                .and_then(|x| w.bldg(x))
                .is_some_and(|b| b.team == ENEMY)
        })
        .map(|n| n.id);
    let miners = w
        .units
        .iter()
        .filter(|u| {
            u.team == ENEMY && matches!(u.task, Task::Gather { node, .. } if Some(node) == flowing)
        })
        .count();
    assert!(
        miners >= 1,
        "someone mines the flowing vent at {}s",
        w.time as i32
    );
}

#[test]
fn the_ai_keeps_building_when_the_player_takes_its_home_vent() {
    let mut w = World::new(33, 1);
    let c = w
        .bldgs
        .iter_mut()
        .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
        .unwrap();
    c.hp = 1e9;
    c.maxhp = 1e9;
    // Every vent within 16 tiles of the AI's core gets a player Extractor: none left at home.
    let (ex, ey) = core(&w, ENEMY);
    let taken: Vec<(i32, i32)> = w
        .map
        .nodes
        .iter()
        .filter(|n| {
            n.ether && (((n.tx - ex - 2).pow(2) + (n.ty - ey - 2).pow(2)) as f64).sqrt() < 18.0
        })
        .map(|n| (n.tx, n.ty))
        .collect();
    assert!(!taken.is_empty());
    for (tx, ty) in taken {
        w.make_building(BldgKind::Extractor, PLAYER, tx, ty, true);
    }
    run(&mut w, 720);
    let rax = w
        .bldgs
        .iter()
        .filter(|b| b.team == ENEMY && b.kind == BldgKind::Barracks)
        .count();
    assert!(rax >= 2, "the build order goes on: {rax} Barracks");
}

#[test]
fn the_vael_ai_builds_its_base_and_beats_an_idle_player() {
    for diff in 0..3usize {
        for seed in [3u32, 4242] {
            let mut w = World::with_setup(seed, diff, MapKind::Standard, false, [&HUMANS, &VAEL]);
            let mut t = 0;
            while !w.over && t < 30 * 60 * 15 {
                w.step();
                t += 1;
            }
            assert!(
                w.over && w.winner == ENEMY as i32,
                "diff {diff} seed {seed}: the Vael AI won"
            );
            for k in [BldgKind::Spire, BldgKind::Kiln, BldgKind::Siphon] {
                assert!(
                    w.bldgs.iter().any(|b| b.team == ENEMY && b.kind == k),
                    "diff {diff} seed {seed}: it built a {k:?}"
                );
            }
            assert!(
                w.bldgs
                    .iter()
                    .filter(|b| b.team == ENEMY && b.kind.def().needs_power)
                    .all(|b| b.powered || !b.done),
                "its production stands in power fields"
            );
            assert!(
                !w.bldgs
                    .iter()
                    .any(|b| b.team == ENEMY && !HUMANS.builds(b.kind) && !VAEL.builds(b.kind))
            );
            assert!(
                !w.bldgs
                    .iter()
                    .any(|b| b.team == ENEMY && HUMANS.builds(b.kind)),
                "only Vael buildings"
            );
        }
    }
}

#[test]
fn the_vael_ai_relights_a_dark_kiln() {
    // On the first seed where knocking out every Spire leaves something dark (a building may stand inside the
    // Conflux's own field, which no Spire loss can darken).
    let mut tried = 0;
    for seed in [4242, 1, 2, 3, 5, 8, 13] {
        let mut w = World::with_setup(seed, 1, MapKind::Standard, false, [&HUMANS, &VAEL]);
        let c = w
            .bldgs
            .iter_mut()
            .find(|b| b.team == PLAYER && b.kind.def().hq)
            .unwrap();
        c.hp = 1e9;
        c.maxhp = 1e9;
        run(&mut w, 200);
        let spires: Vec<Id> = w
            .bldgs
            .iter()
            .filter(|b| b.team == ENEMY && b.kind == BldgKind::Spire)
            .map(|b| b.id)
            .collect();
        assert!(!spires.is_empty());
        for s in spires {
            w.damage(s, 1e6, None);
        }
        run(&mut w, 1);
        let dark: Vec<Id> = w
            .bldgs
            .iter()
            .filter(|b| b.team == ENEMY && b.done && b.kind.def().needs_power && !b.powered)
            .map(|b| b.id)
            .collect();
        if dark.is_empty() {
            continue;
        }
        tried += 1;
        run(&mut w, 120);
        for id in dark {
            if let Some(b) = w.bldg(id) {
                assert!(
                    b.powered,
                    "seed {seed}: the AI put a new Spire by its dark {:?}",
                    b.kind
                );
            }
        }
    }
    assert!(tried >= 1, "something went dark on some seed");
}

#[test]
fn each_ai_takes_ether_when_it_has_something_to_spend_it_on() {
    // The Humans' first ether buy is the Foundry, after a Garrison: their Ether Rig follows the Garrison. The Vael
    // mix in Prisms (ether, no tech) from the start: their Siphon comes first, and their Loom as soon as its ether
    // is in the bank rather than on the clock (150 s).
    for seed in [3, 21] {
        for f in [&HUMANS, &VAEL] {
            let mut w = World::with_setup(seed, 1, MapKind::Standard, false, [&HUMANS, f]);
            let s = &f.ai;
            let mut first = [None; 3];
            for t in 0..30 * 200 {
                w.step();
                w.events.clear();
                for (i, k) in [f.ether, s.rax, s.tech].into_iter().enumerate() {
                    if first[i].is_none() && w.bldgs.iter().any(|b| b.team == ENEMY && b.kind == k)
                    {
                        first[i] = Some(t);
                    }
                }
            }
            let [ether, rax, tech] = first.map(|t| t.expect("placed within 200 s"));
            if f.key == HUMANS.key {
                assert!(
                    ether > rax,
                    "seed {seed}: the Rig after the Garrison ({ether} vs {rax})"
                );
            } else {
                assert!(
                    ether < rax,
                    "seed {seed}: the Siphon before the Kiln ({ether} vs {rax})"
                );
                assert!(
                    tech < 30 * 150,
                    "seed {seed}: the Loom once its ether is in ({tech})"
                );
            }
        }
    }
}

#[test]
fn an_ai_with_ether_piling_up_leans_on_its_specialists() {
    // A Vanguard per two Troopers normally; with ether in the bank, one per Trooper.
    let mut w = World::new(9, 1);
    let b = w.map.bases[ENEMY as usize];
    w.make_building(BldgKind::Forge, ENEMY, b.0 + 6, b.1 - 1, true);
    w.make_building(BldgKind::Barracks, ENEMY, b.0 - 4, b.1 + 6, true);
    for _ in 0..30 * 120 {
        w.res[ENEMY as usize] = [3000, 1000];
        w.step();
        w.events.clear();
    }
    let (troopers, vanguards) = (
        count(&w, ENEMY, UnitKind::Trooper),
        count(&w, ENEMY, UnitKind::Vanguard),
    );
    assert!(troopers >= 3, "it trained: {troopers}");
    assert!(
        vanguards * 2 > troopers,
        "more than a Vanguard per two Troopers: {vanguards} to {troopers}"
    );
}

#[test]
fn the_ai_finds_room_for_its_factories_in_a_walled_main() {
    // (Medium seeds and maps where a main pocket once filled up and the AI fell behind its factory schedule)
    for (seed, kind, races) in [
        (3, MapKind::Standard, [&HUMANS, &VAEL]),
        (21, MapKind::Labyrinth, [&VAEL, &HUMANS]),
        (44, MapKind::Labyrinth, [&VAEL, &HUMANS]),
    ] {
        let mut w = World::with_setup(seed, 1, kind, false, races);
        w.set_ai_seats([true, true]);
        for _ in 0..30 * 420 {
            w.step();
            w.events.clear();
        }
        for seat in 0..2u8 {
            let rax = w.factions[seat as usize].ai.rax;
            let n = w
                .bldgs
                .iter()
                .filter(|b| b.team == seat && b.kind == rax)
                .count();
            assert!(
                n >= 3,
                "seed {seed} {kind:?} seat {seat}: {n} factories by 7 minutes"
            );
        }
    }
}
