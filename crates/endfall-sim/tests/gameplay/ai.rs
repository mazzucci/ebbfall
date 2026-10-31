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
    let seen = (0..4)
        .any(|dy| (0..4).any(|dx| w.explored[ENEMY as usize][w.map.idx(px + dx, py + dy)] != 0));
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
        UPGRADES
            .iter()
            .any(|u| u.levels() > 1 && w.upgrades[ENEMY as usize][u.index()] >= 1),
        "AI finished at least one level (not only a tech) by 14 min: {:?}",
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
        let hidden = (0..w.map.h)
            .flat_map(|ty| (0..w.map.w).map(move |tx| (tx, ty)))
            // (checked as ENEMY: the player may not build in unexplored ground, but this test cheats)
            .filter(|&(tx, ty)| w.can_place(BldgKind::Depot, tx, ty, ENEMY))
            .filter(|&(tx, ty)| reach[w.map.idx(tx, ty)])
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
    // An unarmed Observer, seen (a Turret of the AI's beside it detects it), is no air threat: no Lancers. A Wasp in
    // the same spot is.
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
        if kind == UnitKind::Observer {
            w.make_building(BldgKind::Turret, ENEMY, cx - 5, cy + 7, true);
            let o = w.units.iter_mut().find(|u| u.id == id).unwrap();
            (o.hp, o.maxhp) = (1e9, 1e9); // (the Turret shoots it; it must stay to be seen)
            w.step();
            assert!(w.seen_by(ENEMY, id), "the AI sees the scout");
        }
        run(&mut w, 80);
        let trained = count(&w, ENEMY, UnitKind::Lancer) > 0
            || w.bldgs
                .iter()
                .any(|b| b.team == ENEMY && b.queue.contains(&UnitKind::Lancer));
        assert_eq!(trained, lancers, "{kind:?}: Lancers trained = {trained}");
    }
}

#[test]
fn the_ai_taps_its_expansion_vents_when_the_home_vents_run_dry() {
    let mut w = World::new(33, 1);
    let c = w
        .bldgs
        .iter_mut()
        .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
        .unwrap();
    c.hp = 1e9;
    c.maxhp = 1e9;
    // The two vents by the AI's base hold little: they run dry early.
    let (ex, ey) = core(&w, ENEMY);
    let home: Vec<Id> = w
        .map
        .nodes
        .iter()
        .filter(|n| n.ether && (n.tx - ex).abs().max((n.ty - ey).abs()) <= 10)
        .map(|n| n.id)
        .collect();
    assert_eq!(home.len(), 2, "two vents by the main");
    for &v in &home {
        w.map.node_mut(v).unwrap().amount = 300;
    }
    run(&mut w, 840);
    for &v in &home {
        assert_eq!(w.map.node(v).unwrap().amount, 0, "the home vents ran dry");
    }
    let tapped: Vec<_> = w
        .map
        .nodes
        .iter()
        .filter(|n| n.ether && !home.contains(&n.id))
        .filter(|n| {
            n.extractor
                .and_then(|x| w.bldg(x))
                .is_some_and(|b| b.team == ENEMY)
        })
        .collect();
    assert!(!tapped.is_empty(), "an Extractor on another vent");
    let on_dry = w
        .units
        .iter()
        .filter(|u| {
            u.team == ENEMY && matches!(u.task, Task::Gather { node, .. } if home.contains(&node))
        })
        .count();
    assert!(
        on_dry <= 2,
        "at most one harvester on each dry vent: {on_dry}"
    );
    // Later, saving ether (one worker on it): nobody heads for the dry vent while the other flows.
    for _ in 0..12 {
        run(&mut w, 60);
        let busy_dry = w
            .units
            .iter()
            .filter(|u| u.team == ENEMY && u.carry == 0)
            .filter(|u| matches!(u.task, Task::Gather { node, phase: Phase::Go | Phase::Wait, .. } if home.contains(&node)))
            .count();
        assert!(
            busy_dry <= 2,
            "{busy_dry} head for the dry vent at {}s",
            w.time as i32
        );
    }
    let flowing: Vec<Id> = w
        .map
        .nodes
        .iter()
        .filter(|n| n.ether && !home.contains(&n.id) && n.amount > 0)
        .filter(|n| {
            n.extractor
                .and_then(|x| w.bldg(x))
                .is_some_and(|b| b.team == ENEMY)
        })
        .map(|n| n.id)
        .collect();
    let miners = w
        .units
        .iter()
        .filter(|u| {
            u.team == ENEMY
                && matches!(u.task, Task::Gather { node, .. } if flowing.contains(&node))
        })
        .count();
    assert!(
        miners >= 1,
        "someone mines the flowing vents at {}s",
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
    // Its own Kilns may all stand inside the Conflux's field (no Spire loss darkens those), so one more Kiln goes
    // up away from it, beside its own Spire; then every Spire falls.
    let mut w = World::with_setup(4242, 1, MapKind::Standard, false, [&HUMANS, &VAEL]);
    let c = w
        .bldgs
        .iter_mut()
        .find(|b| b.team == PLAYER && b.kind.def().hq)
        .unwrap();
    c.hp = 1e9;
    c.maxhp = 1e9;
    run(&mut w, 200);
    let b = w.map.bases[ENEMY as usize];
    let ty = if b.1 < 32 { b.1 + 14 } else { b.1 - 14 };
    w.make_building(BldgKind::Spire, ENEMY, b.0 + 4, ty, true);
    let kiln = w.make_building(BldgKind::Kiln, ENEMY, b.0, ty, true);
    run(&mut w, 1);
    assert!(w.bldg(kiln).unwrap().powered, "the Spire lights it");
    let spires: Vec<Id> = w
        .bldgs
        .iter()
        .filter(|b| b.team == ENEMY && b.kind == BldgKind::Spire)
        .map(|b| b.id)
        .collect();
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
    assert!(dark.contains(&kiln), "the far Kiln went dark");
    run(&mut w, 120);
    for id in dark {
        let b = w.bldg(id).expect("nothing attacks it");
        assert!(b.powered, "the AI put a new Spire by its dark {:?}", b.kind);
    }
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
    // (Medium seeds and maps where the AI once fell behind its factory schedule, a main pocket full; 38 in place of 44
    // since each main has two vents: 44's pocket now fills with Spires before 6:00, and 38 fell behind before)
    for (seed, kind, races) in [
        (3, MapKind::Standard, [&HUMANS, &VAEL]),
        (21, MapKind::Labyrinth, [&VAEL, &HUMANS]),
        (38, MapKind::Labyrinth, [&VAEL, &HUMANS]),
    ] {
        let mut w = World::with_setup(seed, 1, kind, false, races);
        w.set_ai_seats([true, true]);
        w.hold_waves = true; // (a factory lost to a wave is not a factory with no room; held until 6:00)
        for _ in 0..30 * 355 {
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
                "seed {seed} {kind:?} seat {seat}: {n} factories by 6 minutes"
            );
        }
    }
}

#[test]
fn the_ai_raises_a_capital_unit_late_in_the_game() {
    // The Human AI with money to spare: past 7.5 minutes, once its Airfield stands, it raises a Bastion.
    let mut w = World::new(9, 1);
    let c = w
        .bldgs
        .iter_mut()
        .find(|b| b.team == PLAYER && b.kind.def().hq)
        .unwrap();
    c.hp = 1e9;
    c.maxhp = 1e9;
    for _ in 0..30 * 720 {
        w.res[ENEMY as usize] = [2000, 1000];
        w.step();
        w.events.clear();
    }
    assert!(
        w.units
            .iter()
            .any(|u| u.team == ENEMY && u.kind == UnitKind::Bastion),
        "a Bastion by 12 minutes"
    );
}

#[test]
fn the_guided_first_game_holds_the_first_wave_until_released() {
    // Easy, with the waves held: no attack before 4:50 even with an army ready; released, the wave goes.
    let mut w = World::new(4242, 0);
    w.hold_waves = true;
    let mut ever = false;
    for _ in 0..30 * 290 {
        w.res[ENEMY as usize] = [2000, 500];
        w.step();
        w.events.clear();
        ever |= w.ai_wave().is_some();
    }
    assert!(!ever, "no wave while held");
    w.hold_waves = false;
    for _ in 0..30 * 60 {
        w.step();
        w.events.clear();
        ever |= w.ai_wave().is_some();
    }
    assert!(ever, "the wave goes once released");
}

#[test]
fn the_guided_first_game_hold_runs_out_at_six_minutes() {
    // Held the whole time: no wave before 6:00, one soon after.
    let mut w = World::new(4242, 0);
    w.hold_waves = true;
    let mut first = None;
    for _ in 0..30 * 420 {
        w.res[ENEMY as usize] = [2000, 500];
        w.step();
        w.events.clear();
        if first.is_none() && w.ai_wave().is_some() {
            first = Some(w.time);
        }
    }
    let t = first.expect("a wave by 7:00");
    assert!((360.0..420.0).contains(&t), "after the hold ran out: {t}");
}

#[test]
fn the_ai_keeps_a_few_fighters_at_its_expansion() {
    let mut w = World::new(33, 1);
    let c = w
        .bldgs
        .iter_mut()
        .find(|b| b.team == PLAYER && b.kind == BldgKind::Core)
        .unwrap();
    c.hp = 1e9;
    c.maxhp = 1e9;
    run(&mut w, 720);
    let home = w.map.bases[ENEMY as usize];
    let (hx, hy) = ((home.0 as f64 + 2.0) * 32.0, (home.1 as f64 + 2.0) * 32.0);
    let exp = w
        .bldgs
        .iter()
        .find(|b| {
            b.team == ENEMY
                && b.done
                && b.kind.def().hq
                && ((b.x - hx).powi(2) + (b.y - hy).powi(2)).sqrt() > 8.0 * 32.0
        })
        .expect("the AI expanded");
    let near = w
        .units
        .iter()
        .filter(|u| {
            let d = u.kind.def();
            u.team == ENEMY
                && d.armed()
                && !d.worker
                && ((u.x - exp.x).powi(2) + (u.y - exp.y).powi(2)).sqrt() < 7.0 * 32.0
        })
        .count();
    assert!(near >= 3, "fighters stay at the expansion: {near}");
}

#[test]
fn easy_plays_a_plain_game_and_only_brutal_gathers_faster() {
    // Easy, rich and left alone for 12 minutes: no research, no air factory, its natural only after 9:00.
    let mut w = World::new(17, 0);
    let c = w
        .bldgs
        .iter_mut()
        .find(|b| b.team == PLAYER && b.kind.def().hq)
        .unwrap();
    c.hp = 1e9;
    c.maxhp = 1e9;
    for _ in 0..30 * 720 {
        w.res[ENEMY as usize] = [2000, 1000];
        w.step();
        w.events.clear();
    }
    let f = w.factions[ENEMY as usize];
    let mine = |k: BldgKind| {
        w.bldgs
            .iter()
            .filter(|b| b.team == ENEMY && b.kind == k)
            .count()
    };
    assert_eq!(
        mine(f.ai.tech),
        1,
        "its tech building stands (so no research is a choice)"
    );
    assert_eq!(
        w.upgrades[ENEMY as usize].iter().sum::<u8>(),
        0,
        "no research"
    );
    assert_eq!(mine(f.hq), 2, "its natural, late");
    assert_eq!(mine(f.ai.air), 0, "no air factory");
    // (two bases' crews, and the one spare a person's AI keeps for its builder)
    assert!(
        harvesters(&w, ENEMY).len() <= DIFF[0].harv + 5 + 1,
        "few workers: {}",
        harvesters(&w, ENEMY).len()
    );
    // Gathering: the same on Medium as the player's, 30% more on Brutal; the player's own is unchanged.
    let gathered = |diff: usize| {
        let mut w = World::new(17, diff);
        w.disable_ai(); // (its starting workers mine on; the seat is still an AI seat)
        let start = w.res.clone();
        run(&mut w, 90);
        [0, 1].map(|t| w.res[t][0] - start[t][0])
    };
    let (medium, brutal) = (gathered(1), gathered(3));
    assert_eq!(
        medium[PLAYER as usize], brutal[PLAYER as usize],
        "the player gathers alike"
    );
    let (me, mp) = (
        medium[ENEMY as usize] as f64,
        medium[PLAYER as usize] as f64,
    );
    assert!(
        (me - mp).abs() <= mp * 0.1,
        "Medium gathers about like the player (the sides' fields differ a little): {medium:?}"
    );
    assert!(
        brutal[ENEMY as usize] as f64 >= medium[ENEMY as usize] as f64 * 1.2,
        "Brutal gathers more: {brutal:?} vs {medium:?}"
    );
}

#[test]
fn easy_keeps_growing_after_the_player_holds_its_waves() {
    // A player who holds every wave (buildings that cannot fall, a dozen unkillable Troopers at the Core): Easy takes
    // its natural after 9:00 (after Medium's: it stays the gentle level), crews it, and only then adds a factory
    // beyond its schedule, so a player who holds its early waves still meets a growing army. Both races.
    for f in [[&HUMANS, &HUMANS], [&HUMANS, &VAEL]] {
        let mut w = World::with_setup(17, 0, MapKind::Standard, false, f);
        for b in w.bldgs.iter_mut().filter(|b| b.team == PLAYER) {
            b.hp = 1e9;
            b.maxhp = 1e9;
        }
        let (cx, cy) = {
            let c = w
                .bldgs
                .iter()
                .find(|b| b.team == PLAYER && b.kind.def().hq)
                .unwrap();
            (c.x, c.y)
        };
        for i in 0..12 {
            let id = w.make_unit(
                UnitKind::Trooper,
                PLAYER,
                cx + 60.0 + (i % 4) as f64 * 20.0,
                cy + 60.0 + (i / 4) as f64 * 20.0,
            );
            let u = w.units.iter_mut().find(|u| u.id == id).unwrap();
            u.hp = 1e9;
            u.maxhp = 1e9;
        }
        w.recalc_supply(PLAYER);
        let f_ai = w.factions[ENEMY as usize];
        let count = |w: &World, k: BldgKind| {
            w.bldgs
                .iter()
                .filter(|b| b.team == ENEMY && b.kind == k && b.done)
                .count()
        };
        let mut hqs_at_9 = 0;
        while w.time < 960.0 {
            w.step();
            w.events.clear();
            if (w.time - 535.0).abs() < 0.02 {
                hqs_at_9 = count(&w, f_ai.hq);
            }
        }
        let name = f[1].name;
        assert_eq!(hqs_at_9, 1, "{name}: no natural before 9:00");
        assert_eq!(count(&w, f_ai.hq), 2, "{name}: its natural");
        assert!(harvesters(&w, ENEMY).len() >= 10, "{name}: crewed");
        let schedule = DIFF[0].rax + 2; // (one more after 5 and after 9 minutes)
        assert!(
            count(&w, f_ai.ai.rax) > schedule,
            "{name}: a factory beyond its schedule: {}",
            count(&w, f_ai.ai.rax)
        );
        assert_eq!(
            w.upgrades[ENEMY as usize].iter().sum::<u8>(),
            0,
            "{name}: still no research"
        );
    }
}

#[test]
fn the_ai_replaces_a_worker_that_is_away_building() {
    // A person's builder stays at its site until the building stands: the Human AI keeps one spare, so a worker sent
    // off to build is replaced and its income does not dip with every building it raises; one at most (the extra
    // ones stay for good), and the Vael AI, whose planter leaves at once, keeps none.
    let mut w = World::new(17, 1);
    // (its difficulty's, and a crew for its second vent once that flows)
    let target = |w: &World| w.harv_target_of(ENEMY, 1);
    let core = |w: &World| {
        w.bldgs
            .iter()
            .find(|b| b.team == ENEMY && b.kind.def().hq)
            .map(|b| (b.id, b.tx, b.ty))
            .unwrap()
    };
    let building = |w: &World| {
        w.units
            .iter()
            .any(|u| u.team == ENEMY && matches!(u.task, Task::Build { .. }))
    };
    // Wait for a full crew, nothing queued at the Core and nobody off building.
    let mut t = 0;
    while !(harvesters(&w, ENEMY).len() >= target(&w)
        && w.bldg(core(&w).0).unwrap().queue.is_empty()
        && !building(&w))
    {
        assert!(t < 30 * 360, "never a full, settled crew");
        w.step();
        w.events.clear();
        t += 1;
    }
    // Exactly a full crew (earlier builders' replacements are still about): the extra ones fall.
    while harvesters(&w, ENEMY).len() > target(&w) {
        let extra = *harvesters(&w, ENEMY).last().unwrap();
        w.damage(extra, 1e9, None);
        w.step();
        w.events.clear();
    }
    let (cid, cx, cy) = core(&w);
    let before = harvesters(&w, ENEMY).len();
    // One of them goes off to build a Depot (and stays there, as a Human builder does).
    let builder = harvesters(&w, ENEMY)[0];
    let (tx, ty) = (4..18)
        .flat_map(|r| (0..24).map(move |a| (r, a)))
        .map(|(r, a)| {
            let ang = a as f64 / 24.0 * std::f64::consts::TAU;
            (
                (cx as f64 + 1.0 + ang.cos() * r as f64).round() as i32,
                (cy as f64 + 1.0 + ang.sin() * r as f64).round() as i32,
            )
        })
        .find(|&(tx, ty)| w.can_place(BldgKind::Depot, tx, ty, ENEMY))
        .expect("room for a Depot");
    // (the Depot's price, and a worker's: its bank may be spent just now)
    w.res[ENEMY as usize][0] += 100 + UnitKind::Harvester.def().cost[0];
    w.place_building(ENEMY, BldgKind::Depot, tx, ty, Some(builder))
        .expect("placed");
    run(&mut w, 2);
    let queued = w
        .bldg(cid)
        .unwrap()
        .queue
        .iter()
        .filter(|k| k.def().worker)
        .count();
    assert!(
        harvesters(&w, ENEMY).len() + queued > before,
        "a replacement for the builder: {} + {queued} queued vs {before}",
        harvesters(&w, ENEMY).len()
    );
    // And no more than one, however long it runs.
    run(&mut w, 30);
    assert!(
        harvesters(&w, ENEMY).len() <= target(&w) + 1,
        "one spare at most: {}",
        harvesters(&w, ENEMY).len()
    );
}

#[test]
fn the_vael_ai_keeps_no_spare_worker() {
    // A Vael planter leaves its site at once: the Vael AI's workers stay at its target through a long game on every
    // level (an expansion adds five).
    for (diff, d) in DIFF.iter().enumerate() {
        let mut w = World::with_setup(17, diff, MapKind::Standard, false, [&HUMANS, &VAEL]);
        for b in w.bldgs.iter_mut().filter(|b| b.team == PLAYER) {
            b.hp = 1e9;
            b.maxhp = 1e9;
        }
        let mut most = 0;
        for _ in 0..30 * 480 {
            w.step();
            w.events.clear();
            let cores = w
                .bldgs
                .iter()
                .filter(|b| b.team == ENEMY && b.kind.def().hq && b.done)
                .count();
            // (its difficulty's, five more a base, and a crew for each flowing vent past the first)
            let target = w.harv_target_of(ENEMY, cores);
            assert!(target >= d.harv + 5 * cores.saturating_sub(1));
            most = most.max(harvesters(&w, ENEMY).len() as i64 - target as i64);
        }
        assert!(most <= 0, "diff {diff}: {most} over its target");
    }
}

#[test]
fn on_a_barren_map_the_ai_takes_its_natural_before_its_home_field_runs_dry() {
    // Barren fields hold 40% of the shards: the home field runs dry by about 6:00, before Medium's time to expand,
    // and after that it could never pay for a Core. Medium and up now expand once the field by the main runs low;
    // Easy keeps to its schedule (the gentle level).
    for diff in 0..DIFF.len() {
        let mut w = World::with_setup(17, diff, MapKind::Barren, false, [&HUMANS, &HUMANS]);
        for b in w.bldgs.iter_mut().filter(|b| b.team == PLAYER) {
            b.hp = 1e9;
            b.maxhp = 1e9;
        }
        let hq = w.factions[ENEMY as usize].hq;
        let mut first = None;
        while w.time < 540.0 {
            w.step();
            w.events.clear();
            if first.is_none()
                && w.bldgs
                    .iter()
                    .filter(|b| b.team == ENEMY && b.kind == hq)
                    .count()
                    >= 2
            {
                first = Some(w.time);
            }
        }
        if diff == 0 {
            assert_eq!(first, None, "Easy: no natural before 9:00");
        } else {
            let at = first.unwrap_or(f64::MAX);
            assert!(at < 330.0, "diff {diff}: its natural by 5:30 ({at:.0} s)");
        }
    }
}

#[test]
fn brutal_spends_its_income_when_its_main_fills_up() {
    // Brutal's x1.3 income needs more factories than a main pocket has room for: with none left near its centre it
    // builds farther out (and the Vael raise a Spire out there first, for a field to build in) instead of waiting for
    // its natural. Its mean bank at 6 and 8 minutes over three seeds, against a player who holds: about 3,650 for
    // either race before, about 1,250 / 1,800 (Human / Vael AI) now.
    for f in [[&HUMANS, &HUMANS], [&HUMANS, &VAEL]] {
        let mut banked = Vec::new();
        for seed in [3u32, 17, 44] {
            let mut w = World::with_setup(seed, 3, MapKind::Standard, false, f);
            for b in w.bldgs.iter_mut().filter(|b| b.team == PLAYER) {
                b.hp = 1e9;
                b.maxhp = 1e9;
            }
            for at in [360.0, 480.0] {
                while w.time < at {
                    w.step();
                    w.events.clear();
                }
                banked.push(w.res[ENEMY as usize][0]);
            }
        }
        let mean = banked.iter().sum::<i32>() / banked.len() as i32;
        assert!(
            mean < 2500,
            "{}: {banked:?} banked (mean {mean})",
            f[1].name
        );
    }
}

#[test]
fn the_human_ai_researches_rapid_construction_early_on_hard_but_never_on_easy() {
    // The economy tech comes first on a level that researches (once its opening factories stand); Easy never
    // researches.
    let researched_at = |diff: usize| {
        let mut w = World::new(21, diff);
        let c = w
            .bldgs
            .iter_mut()
            .find(|b| b.team == PLAYER && b.kind.def().hq)
            .unwrap();
        c.hp = 1e9;
        c.maxhp = 1e9;
        let up = Upgrade::RapidConstruction;
        for _ in 0..30 * 600 {
            w.step();
            w.events.clear();
            let mine = |k: BldgKind, done: bool| {
                w.bldgs
                    .iter()
                    .filter(|b| b.team == ENEMY && b.kind == k && (b.done || !done))
                    .count()
            };
            if w.bldgs
                .iter()
                .any(|b| b.team == ENEMY && b.research.is_some_and(|(u, _)| u == up))
            {
                assert!(
                    mine(BldgKind::Barracks, true) >= DIFF[diff].rax,
                    "not before its opening factories stand"
                );
            }
            if w.upgrades[ENEMY as usize][up.index()] > 0 {
                let others: u8 = UPGRADES
                    .iter()
                    .filter(|&&u| u != up)
                    .map(|u| w.upgrades[ENEMY as usize][u.index()])
                    .sum();
                assert_eq!(others, 0, "the economy tech before any other");
                return Some(w.time);
            }
        }
        None
    };
    let hard = researched_at(2).expect("Hard researches Rapid Construction by 10:00");
    assert!(
        hard < 300.0,
        "early, before the army's techs at 5:00: {hard:.0}s"
    );
    assert_eq!(researched_at(0), None, "Easy never researches");
}

#[test]
fn brutal_trains_its_workers_before_its_buildings() {
    // Brutal's build order (three factories, supply two at a time) spent every shard while its crew was still short,
    // so its Core stood idle between workers; and a Human builder leaves the line while it builds, so the Human AI fell
    // behind the Vael AI in the opening. Now a worker's price stays in the bank while the crew is short: by 3:00 (its
    // build-up done; the first waves can meet about then, so the mining margin allows for a fleeing worker or two) the Human AI's Core
    // has stood idle for under 10 s, its crew is full and it mines within two of the Vael AI. (Without it: 18-23 s idle, a crew of 17 and two to three fewer mining.)
    let d = &DIFF[3];
    assert!(d.workers_first);
    for seed in [3, 5, 17] {
        let mut w = World::with_setup(seed, 3, MapKind::Standard, false, [&HUMANS, &VAEL]);
        w.set_ai_seats([true, true]);
        let crew = |w: &World, s: u8| harvesters(w, s).len();
        let mut idle = 0.0;
        while w.time < 180.0 {
            w.step();
            w.events.clear();
            let core_idle = w
                .bldgs
                .iter()
                .any(|b| b.team == PLAYER && b.kind.def().hq && b.done && b.queue.is_empty());
            if crew(&w, PLAYER) < d.harv && core_idle {
                idle += 1.0 / 30.0;
            }
        }
        let mining = |s: u8| {
            harvesters(&w, s)
                .iter()
                .filter(|&&h| matches!(w.unit(h).unwrap().task, Task::Gather { .. }))
                .count()
        };
        assert!(idle < 10.0, "seed {seed}: its Core stood idle {idle:.1} s");
        let training: usize = w
            .bldgs
            .iter()
            .filter(|b| b.team == PLAYER && b.kind.def().hq)
            .map(|b| b.queue.iter().filter(|q| q.def().worker).count())
            .sum();
        assert!(
            crew(&w, PLAYER) + training >= d.harv,
            "seed {seed}: a full crew by 3:00 (counting one in training): {} + {training}",
            crew(&w, PLAYER)
        );
        assert!(
            mining(PLAYER) + 2 >= mining(ENEMY),
            "seed {seed}: mining {} to the Vael AI's {}",
            mining(PLAYER),
            mining(ENEMY)
        );
    }
    // The other levels build as before.
    assert!(DIFF[..3].iter().all(|d| !d.workers_first));
}

#[test]
fn the_ai_takes_both_vents_of_its_main_and_crews_them() {
    // Every main has two vents. The AI raises its second refinery once the first flows and its tech is going up
    // (Medium: before 4:00), mines both, and trains a crew for the second, so its shards do not pay for its ether.
    // Easy keeps to one until its natural is due (`Diff::vents_from`).
    let home_vents = |w: &World, seat: u8| -> Vec<Id> {
        let c = w
            .bldgs
            .iter()
            .find(|b| b.team == seat && b.kind.def().hq)
            .map(|b| (b.tx, b.ty))
            .unwrap();
        w.map
            .nodes
            .iter()
            .filter(|n| n.ether && (n.tx - c.0 - 1).abs().max((n.ty - c.1 - 1).abs()) <= 10)
            .map(|n| n.id)
            .collect()
    };
    let rig_of = |w: &World, seat: u8, v: Id| {
        w.map
            .node(v)
            .and_then(|n| n.extractor)
            .and_then(|x| w.bldg(x))
            .is_some_and(|b| b.team == seat && b.done)
    };
    for (seed, kind, races) in [
        (3, MapKind::Standard, [&HUMANS, &VAEL]),
        (7, MapKind::Labyrinth, [&VAEL, &HUMANS]),
        (11, MapKind::Barren, [&HUMANS, &HUMANS]),
        (5, MapKind::OpenPlains, [&VAEL, &VAEL]),
    ] {
        let mut w = World::with_setup(seed, 1, kind, false, races);
        w.set_ai_seats([true, true]);
        w.hold_waves = true; // (its economy, not a fight)
        let homes = [home_vents(&w, 0), home_vents(&w, 1)];
        let mut mined = [vec![false; 2], vec![false; 2]];
        for _ in 0..30 * 240 {
            w.step();
            w.events.clear();
            for seat in 0..2u8 {
                for (i, &v) in homes[seat as usize].iter().enumerate() {
                    mined[seat as usize][i] |= w.units.iter().any(|u| {
                        u.team == seat && matches!(u.task, Task::Gather { node, phase: Phase::Mine, .. } if node == v)
                    });
                }
            }
        }
        for seat in 0..2u8 {
            let ctx = format!("seed {seed} {kind:?} seat {seat}");
            assert_eq!(
                homes[seat as usize].len(),
                2,
                "{ctx}: two vents by the main"
            );
            for (i, &v) in homes[seat as usize].iter().enumerate() {
                assert!(rig_of(&w, seat, v), "{ctx}: a refinery on vent {v} by 4:00");
                assert!(mined[seat as usize][i], "{ctx}: vent {v} mined");
            }
            let crew = harvesters(&w, seat).len();
            assert!(
                crew > DIFF[1].harv,
                "{ctx}: workers trained for the second vent's crew: {crew}"
            );
        }
    }
    // Easy: one refinery until its natural is due.
    let mut w = World::with_setup(3, 0, MapKind::Standard, false, [&HUMANS, &VAEL]);
    w.set_ai_seats([true, true]);
    w.hold_waves = true;
    run(&mut w, 300);
    for seat in 0..2u8 {
        let rigs = home_vents(&w, seat)
            .iter()
            .filter(|&&v| rig_of(&w, seat, v))
            .count();
        assert_eq!(rigs, 1, "Easy seat {seat}: one refinery at 5:00");
    }
}

#[test]
fn the_ai_takes_an_expansions_vent_only_once_its_core_stands_there() {
    // On these maps a natural's vent lies within 16 tiles of a main's Core, where the AI looks for its main's vents:
    // it must wait for its Core at the natural, not raise a third refinery out there before.
    let core_at = |w: &World, seat: u8, (x, y): (f64, f64), r: f64| {
        w.bldgs.iter().any(|b| {
            b.team == seat
                && b.done
                && b.kind.def().hq
                && ((b.tx as f64 + 1.5 - x).powi(2) + (b.ty as f64 + 1.5 - y).powi(2)).sqrt() < r
        })
    };
    for (seed, kind) in [(92, MapKind::Standard), (32, MapKind::OpenPlains)] {
        for races in [[&HUMANS, &VAEL], [&VAEL, &HUMANS]] {
            let mut w = World::with_setup(seed, 1, kind, false, races);
            w.set_ai_seats([true, true]);
            w.hold_waves = true;
            let ctx = format!("seed {seed} {kind:?} {}", races[0].name);
            // (the case: an expansion's vent within 16 tiles of a main's Core)
            let near_main = w.map.nodes.iter().any(|n| {
                n.ether
                    && w.map.expansions.iter().any(|&(ex, ey)| {
                        ((n.tx as f64 + 0.5 - ex).powi(2) + (n.ty as f64 + 0.5 - ey).powi(2)).sqrt()
                            <= 7.5
                    })
                    && w.map
                        .bases
                        .iter()
                        .any(|b| ((n.tx - b.0 - 2) as f64).hypot((n.ty - b.1 - 2) as f64) < 16.0)
            });
            assert!(near_main, "{ctx}: a natural's vent within the main's reach");
            for _ in 0..30 * 600 / 15 {
                for _ in 0..15 {
                    w.step();
                    w.events.clear();
                }
                for b in w.bldgs.iter().filter(|b| b.kind.def().on_vent) {
                    let Some(v) = b.vent.and_then(|v| w.map.node(v)) else {
                        continue;
                    };
                    let (vx, vy) = (v.tx as f64 + 0.5, v.ty as f64 + 0.5);
                    for &(ex, ey) in &w.map.expansions {
                        if ((vx - ex).powi(2) + (vy - ey).powi(2)).sqrt() <= 7.5 {
                            assert!(
                                core_at(&w, b.team, (ex, ey), 16.0),
                                "{ctx}: seat {} raised a refinery on the expansion vent at {},{} at {:.0}s with no Core there",
                                b.team,
                                v.tx,
                                v.ty,
                                w.time
                            );
                        }
                    }
                }
            }
        }
    }

#[test]
fn the_ai_takes_an_observer_along_once_something_unseen_hits_its_army_in_the_field() {
    // The Human AI with money to spare and its Airfield up trains no Observer while nothing unseen has hit it. A
    // cloaked Wasp then shoots one of its Troopers out by the player's base (far from its own buildings, where no
    // tower goes): it trains one Observer, and keeps it over its next wave rather than at home or racing ahead.
    let mut w = World::new(9, 1);
    for b in w.bldgs.iter_mut().filter(|b| b.team == PLAYER) {
        (b.hp, b.maxhp) = (1e9, 1e9);
    }
    let observers = |w: &World| count(w, ENEMY, UnitKind::Observer);
    let step = |w: &mut World| {
        w.res[ENEMY as usize] = [2000, 1000];
        w.step();
        w.events.clear();
    };
    while w.time < 420.0 {
        step(&mut w);
    }
    assert!(
        w.bldgs
            .iter()
            .any(|b| b.team == ENEMY && b.kind == BldgKind::Airfield && b.done),
        "its Airfield stands by 7:00"
    );
    assert_eq!(
        observers(&w),
        0,
        "no Observer while nothing unseen has hit it"
    );
    // The unseen hit, out in the field.
    let (px, py) = core(&w, PLAYER);
    let (x, y) = ((px as f64 + 2.0) * TILE + 200.0, (py as f64 + 2.0) * TILE);
    let trooper = w.make_unit(UnitKind::Trooper, ENEMY, x, y);
    w.hold_unit(trooper);
    let wasp = w.make_unit(UnitKind::Wasp, PLAYER, x + 40.0, y);
    w.upgrades[PLAYER as usize][Upgrade::CloakingField.index()] = 1;
    w.cast(wasp, AbilityKind::Cloak).unwrap();
    for _ in 0..3 * TPS {
        if w.unit(trooper).is_some() && w.unit(wasp).is_some() {
            w.attack_ent(wasp, trooper);
        }
        step(&mut w);
    }
    assert!(
        w.unit(trooper).is_none_or(|t| t.hp < t.maxhp),
        "the cloaked Wasp hit it"
    );
    if w.unit(wasp).is_some() {
        w.damage(wasp, 1e6, None); // (the hit is the news; the Wasp itself is not the test)
    }
    let mut trained = None;
    while w.time < 540.0 && trained.is_none() {
        step(&mut w);
        trained = (observers(&w) >= 1).then_some(w.time);
    }
    assert!(trained.is_some(), "an Observer within two minutes");
    // Over its next wave: near the middle of the wave's other units.
    let (mut over, mut samples) = (0, 0);
    while w.time < 900.0 && samples < 60 {
        step(&mut w);
        let Some(wave) = w.ai_wave() else { continue };
        let Some(obs) = w
            .units
            .iter()
            .find(|u| u.team == ENEMY && u.kind == UnitKind::Observer)
        else {
            continue;
        };
        let rest: Vec<(f64, f64)> = wave
            .iter()
            .filter_map(|&id| w.unit(id))
            .filter(|u| u.kind != UnitKind::Observer)
            .map(|u| (u.x, u.y))
            .collect();
        if rest.is_empty() || !w.tick.is_multiple_of(TPS) {
            continue;
        }
        let n = rest.len() as f64;
        let (cx, cy) = (
            rest.iter().map(|p| p.0).sum::<f64>() / n,
            rest.iter().map(|p| p.1).sum::<f64>() / n,
        );
        samples += 1;
        over += (((obs.x - cx).powi(2) + (obs.y - cy).powi(2)).sqrt() < 6.0 * TILE) as usize;
    }
    assert_eq!(observers(&w), 1, "one Observer, not a stream of them");
    assert!(samples >= 20, "a wave went out ({samples} samples)");
    assert!(
        over * 4 >= samples * 3,
        "the Observer kept over its wave: {over} of {samples} seconds"
    );
}

#[test]
fn the_vael_ai_raises_its_air_factory_sooner_than_the_humans() {
    // Each side's air factory waits for its level's `air_at`, less its script's `air_lead`: the Vael's Zenith half a
    // minute sooner (its Shrikes came only where the Zenith stood well before the 7:30 capital, in 6-28% of AI
    // games), the Humans' Airfield on time. Money to spare, against an idle player, on Medium.
    let air_at = DIFF[1].air_at;
    for f in [&VAEL, &HUMANS] {
        let mut w = World::with_setup(5, 1, MapKind::Standard, false, [&HUMANS, f]);
        for b in w.bldgs.iter_mut().filter(|b| b.team == PLAYER) {
            (b.hp, b.maxhp) = (1e9, 1e9);
        }
        let mut placed = None;
        while w.time < air_at + 30.0 && placed.is_none() {
            w.res[ENEMY as usize] = [2000, 1000];
            w.step();
            w.events.clear();
            placed = w
                .bldgs
                .iter()
                .any(|b| b.team == ENEMY && b.kind == f.ai.air)
                .then_some(w.time);
        }
        let at = placed.unwrap_or(f64::MAX);
        let due = air_at - f.ai.air_lead;
        let early = f.ai.air_lead > 0.0;
        assert!(
            at > due && at < if early { air_at } else { air_at + 30.0 },
            "{}: its {:?} at {at:.0} s, due after {due:.0} s",
            f.name,
            f.ai.air
        );
    }
    const { assert!(VAEL.ai.air_lead > HUMANS.ai.air_lead) };
}
