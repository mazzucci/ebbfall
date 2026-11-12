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
fn every_level_plays_the_new_rosters_to_the_end() {
    // The re-theme's rosters at every level: the Kingdom against the Expedition and each in a mirror, two AIs, a game
    // that ends within 40 minutes, both seats having fought (and fielded more than their line units on a level whose
    // mix allows it).
    for diff in 0..DIFF.len() {
        for (k, races) in [[&HUMANS, &VAEL], [&HUMANS, &HUMANS], [&VAEL, &VAEL]]
            .into_iter()
            .enumerate()
        {
            let seed = 40 + 3 * diff as u32 + k as u32;
            let mut w = World::with_setup(seed, diff, MapKind::Standard, false, races);
            w.set_ai_seats([true, true]);
            let mut hits = [0, 0];
            let mut tier = [0u8; 2]; // the most advanced unit each seat fielded
            while !w.over && w.time < 40.0 * 60.0 {
                w.step();
                for e in w.events.drain(..) {
                    if let endfall_sim::world::Event::Attacked { team, .. } = e {
                        hits[team as usize] += 1;
                    }
                }
                for u in &w.units {
                    tier[u.team as usize] = tier[u.team as usize].max(u.kind.ai_tier());
                }
            }
            let what = format!("level {diff}, {} v {}", races[0].key, races[1].key);
            assert!(
                w.over,
                "{what}: someone wins within 40 min (t={:.0})",
                w.time
            );
            assert!(
                hits[0] > 0 && hits[1] > 0,
                "{what}: both seats fought: {hits:?}"
            );
            // (Medium's Expedition against itself fields its mercenary line alone since the economy's second round:
            // its hired places, 25, are never full at its income, so its gold never turns to machines; the
            // Expedition's arc, machines behind Uplinks, comes with its own PR)
            let vael_mirror = races[0].power && races[1].power;
            if diff >= 2 || (diff == 1 && !vael_mirror) {
                assert!(
                    tier.iter().any(|&t| t >= 1),
                    "{what}: past its line units: {tier:?}"
                );
            }
        }
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
fn the_ai_keeps_training_troopers_with_the_second_slot_empty() {
    let mut w = World::new(31, 1);
    run(&mut w, 150);
    let id = w.make_unit(UnitKind::Shrike, PLAYER, 60.0, 60.0); // a flyer far away makes it want Archers
    w.hold_unit(id);
    let before = count(&w, ENEMY, UnitKind::Trooper);
    for _ in 0..90 * TPS {
        w.res[ENEMY as usize][1] = 0; // (the second slot: always empty since the one resource)
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
            UnitKind::Shrike,
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
fn the_ai_answers_flyers_with_ballistas_once_its_workshop_can() {
    // Three Drones watching its base. Without a Workshop: two Archers per flyer (the mix's Archers, one per Guard,
    // count towards the answer). With a Workshop and a Forge: its Workshop trains Ballistas (worth two Archers each)
    // and its Barracks brings only half the answer in Archers, besides the mix's.
    let trained = |w: &World, k: UnitKind| {
        count(w, ENEMY, k)
            + w.bldgs
                .iter()
                .filter(|b| b.team == ENEMY)
                .flat_map(|b| b.queue.iter())
                .filter(|&&q| q == k)
                .count()
    };
    for factory in [false, true] {
        let mut w = World::new(9, 1);
        for b in w.bldgs.iter_mut().filter(|b| b.team == PLAYER) {
            (b.hp, b.maxhp) = (1e9, 1e9);
        }
        let b = w.map.bases[ENEMY as usize];
        w.make_building(BldgKind::Barracks, ENEMY, b.0 - 4, b.1 + 6, true);
        if factory {
            w.make_building(BldgKind::Forge, ENEMY, b.0 + 6, b.1 - 1, true);
            w.make_building(BldgKind::Factory, ENEMY, b.0 + 6, b.1 + 6, true);
        }
        let (cx, cy) = core(&w, ENEMY);
        for k in 0..3 {
            let id = w.make_unit(
                UnitKind::Shrike,
                PLAYER,
                (cx as f64 - 7.0) * TILE - k as f64 * 30.0,
                (cy as f64 + 9.0) * TILE,
            );
            let r = w.units.iter_mut().find(|u| u.id == id).unwrap();
            (r.hp, r.maxhp) = (1e9, 1e9); // (they stay to be seen)
            w.hold_unit(id);
        }
        for _ in 0..30 * 90 {
            w.res[ENEMY as usize] = [3000, 1000];
            w.step();
            w.events.clear();
        }
        let (lancers, icps) = (
            trained(&w, UnitKind::Lancer),
            trained(&w, UnitKind::Bastion),
        );
        if factory {
            // (the mix's Archers, one per Guard, come on top of half the answer)
            assert!(icps >= 1, "Ballistas from the Workshop: {icps}");
            assert!(lancers <= 4, "Archers to half the answer: {lancers}");
            assert!(
                lancers + 2 * icps <= 8,
                "two answers per flyer, no more: {lancers} Archers, {icps} Ballistas"
            );
        } else {
            assert_eq!(icps, 0);
            assert!(
                (4..=6).contains(&lancers),
                "two Archers per flyer: {lancers}"
            );
        }
    }
}

/// Runs `w` for `secs` and returns what `e` trained meanwhile, (Archers, Guards): those it had at any time (shot
/// down too) and has queued at the end. Its Barracks is busy either way: an anti-air answer shows in the share of
/// Archers.
fn trained_over(w: &mut World, e: u8, secs: u32) -> (usize, usize) {
    let kinds = [UnitKind::Lancer, UnitKind::Trooper];
    let mut seen: Vec<Id> = w
        .units
        .iter()
        .filter(|u| u.team == e)
        .map(|u| u.id)
        .collect();
    let mut n = [0, 0];
    for _ in 0..secs * TPS {
        w.step();
        w.events.clear();
        for u in w.units.iter().filter(|u| u.team == e) {
            if !seen.contains(&u.id) {
                seen.push(u.id);
                if let Some(k) = kinds.iter().position(|&k| k == u.kind) {
                    n[k] += 1;
                }
            }
        }
    }
    (n[0], n[1])
}

/// The Archers `e` has and has queued (the anti-air answer adds them; the mix trains one per Guard anyway).
fn harpooners(w: &World, e: u8) -> usize {
    count(w, e, UnitKind::Lancer)
        + w.bldgs
            .iter()
            .filter(|b| b.team == e)
            .flat_map(|b| b.queue.iter())
            .filter(|&&q| q == UnitKind::Lancer)
            .count()
}

#[test]
fn the_ai_only_reacts_to_flyers_it_has_seen() {
    // Against a control game (the same seed, no flyer): a Drone the AI has not seen adds no Archers; once seen, it does
    // (the anti-air answer, on top of the mix's one per Guard).
    let mut control = World::new(31, 0);
    let mut w = World::new(31, 0);
    run(&mut control, 120);
    run(&mut w, 120);
    // Three Drones hiding in the top-left corner, far from anything the AI has looked at (three: its answer is two
    // anti-air per flyer seen, more than the mix's Archers cover).
    let raiders: Vec<Id> = (0..3)
        .map(|k| w.make_unit(UnitKind::Shrike, PLAYER, 40.0 + k as f64 * 24.0, 40.0))
        .collect();
    for &r in &raiders {
        w.hold_unit(r);
        let u = w.units.iter_mut().find(|u| u.id == r).unwrap();
        (u.hp, u.maxhp) = (1e9, 1e9); // (they stay to be answered: the mix's Harpooners would shoot them down)
    }
    run(&mut control, 40);
    run(&mut w, 40);
    let (had, base) = (harpooners(&w, ENEMY), harpooners(&control, ENEMY));
    assert!(
        had <= base + 1,
        "none for a flyer it cannot see: {had} against {base} without it"
    );
    // Now into view: where its base sees them, held, out of reach of its units (as in the gunship test below).
    let (cx, cy) = core(&w, ENEMY);
    for (k, &r) in raiders.iter().enumerate() {
        let u = w.units.iter_mut().find(|u| u.id == r).unwrap();
        (u.x, u.y) = (
            (cx as f64 - 7.0 + k as f64) * TILE,
            (cy as f64 + 9.0) * TILE,
        );
        w.hold_unit(r);
    }
    // (Easy's one Barracks trains them one at a time behind its queue: a minute and a half for the answer to show;
    // the Drones shoot some of them down: what it trained counts)
    let (has, base) = (
        trained_over(&mut w, ENEMY, 90),
        trained_over(&mut control, ENEMY, 90),
    );
    assert!(
        has.0 * base.1 > base.0 * has.1,
        "Archers rather than Guards once it has seen the flyer: (Archers, Guards) {has:?} against {base:?} without it"
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
fn ai_raiders_raid_the_players_harvesters() {
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
    let guard = w.make_unit(UnitKind::Knight, PLAYER, mx, my);
    w.hold_unit(guard);
    let (cx, cy) = core(&w, ENEMY);
    for k in 0..3 {
        w.make_unit(
            UnitKind::Rider,
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
fn hurt_raiders_stay_home_and_healthy_ones_raid() {
    let mut w = World::new(43, 1);
    run(&mut w, 120);
    let (cx, cy) = core(&w, ENEMY);
    let at = |k: i32| {
        (
            (cx as f64 + 2.0) * TILE + k as f64 * 30.0,
            (cy as f64 + 6.0) * TILE,
        )
    };
    // Four hurt raiders first (lower ids), then two healthy ones.
    let hurt: Vec<Id> = (0..4)
        .map(|k| {
            let (x, y) = at(k);
            let id = w.make_unit(UnitKind::Rider, ENEMY, x, y);
            w.units.iter_mut().find(|u| u.id == id).unwrap().hp = 25.0;
            id
        })
        .collect();
    let fit: Vec<Id> = (4..6)
        .map(|k| {
            let (x, y) = at(k);
            w.make_unit(UnitKind::Rider, ENEMY, x, y)
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
        assert!(away(&w, h) < 500.0, "hurt raider {h} stays home");
    }
    assert!(
        fit.iter().any(|&f| away(&w, f) > 900.0),
        "the healthy raiders went raiding"
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
    // (a passive foe: it may have taken a third by then, `Diff::passive_expand`; by 12:00 its main's mine and its
    // natural's may be mined out, and its workers at a later base's)
    assert!(cores.len() >= 2, "AI has a second core by 12 min");
    let near_exp = |n: &endfall_sim::map::Node| {
        cores[1..]
            .iter()
            .any(|c| ((n.x - c.0).powi(2) + (n.y - c.1).powi(2)).sqrt() < 300.0)
    };
    let working = w
        .units
        .iter()
        .filter(|u| u.team == ENEMY && matches!(u.task, Task::Gather { node, .. } if w.map.node(node).is_some_and(near_exp)))
        .count();
    assert!(
        working >= 3,
        "harvesters work a mine by an expansion: {working}"
    );
    // One base by each mine: a compact mine leaves room for a second Core beside it, which the AI does not take.
    for (i, a) in cores.iter().enumerate() {
        for b in &cores[i + 1..] {
            assert!(
                ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2)).sqrt() > 10.0 * TILE,
                "two Cores side by side: {a:?} {b:?}"
            );
        }
    }
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
        assert!(cores >= 2, "seed {seed}: the AI expanded");
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
    // A player whose core cannot fall, so the game lasts long enough to watch the AI's later behavior.
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
    // (or it stands at the cap of 40, where an army grows no more)
    let [used, cap] = w.sup(ENEMY);
    assert!(
        army(&w) > army_10 || used + 2 >= cap,
        "and kept building its army while researching ({army_10} -> {}, supply {used}/{cap})",
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

/// Steps until the AI (seat 1) has a finished Cottage, ten minutes at most (with the population of 100 and the slower
/// economy of the second round its first comes later than 3:20).
fn run_until_depot(w: &mut World) {
    while w.time < 600.0
        && !w
            .bldgs
            .iter()
            .any(|b| b.team == ENEMY && b.done && b.kind == BldgKind::Depot)
    {
        w.step();
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
    run_until_depot(&mut w);
    let (id, max) = w
        .bldgs
        .iter()
        .find(|b| b.team == ENEMY && b.done && b.kind == BldgKind::Depot)
        .map(|b| (b.id, b.maxhp))
        .expect("the AI has a depot");
    w.bldgs.iter_mut().find(|b| b.id == id).unwrap().hp = (max * 0.3).round();
    run(&mut w, 45);
    let hp = w.bldg(id).map_or(0.0, |b| b.hp);
    // It may run short of gold before the last few hp (it spends on its army too), as a player can, and starts a repair
    // only below 70%: since the economy pass's scarcer gold it may stop just past that line.
    assert!(hp >= max * 0.7, "the AI repaired its depot: {hp}/{max}");
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
    run_until_depot(&mut w);
    let id = w
        .bldgs
        .iter()
        .find(|b| b.team == ENEMY && b.done && b.kind == BldgKind::Depot)
        .unwrap()
        .id;
    w.bldgs.iter_mut().find(|b| b.id == id).unwrap().hp = 50.0;
    // (and no Markets: their trickle would pay a gold at a time for a repair)
    let markets: Vec<Id> = w
        .bldgs
        .iter()
        .filter(|b| b.team == ENEMY && b.kind.def().pays)
        .map(|b| b.id)
        .collect();
    for p in markets {
        w.damage(p, 1e6, None);
    }
    let mut starts = 0;
    let mut was = false;
    for _ in 0..20 * TPS {
        w.res[ENEMY as usize] = [0, 0]; // broke throughout (loads emptied: two deliveries in one tick would pay 16)
        for u in w.units.iter_mut().filter(|u| u.team == ENEMY) {
            u.carry = 0;
        }
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
    for (raiders, turrets, lancers) in [
        (2, 0, 0),
        (2, 1, 0),
        (2, 0, 4),
        (3, 1, 0),
        (4, 1, 0),
        (4, 0, 6),
        (4, 1, 4),
    ] {
        let (h, lost) = raid(raiders, turrets, lancers);
        println!(
            "RAID {raiders} raiders vs {turrets} turret(s) + {lancers} lancers: {h}/8 harvesters lost, {lost}/{raiders} raiders lost"
        );
    }
}

#[test]
fn the_ai_fields_archers_beside_its_guards() {
    let mut w = World::new(2, 1);
    for b in w.bldgs.iter_mut().filter(|b| b.team == PLAYER) {
        b.hp = 1e9;
        b.maxhp = 1e9;
    }
    run(&mut w, 330);
    let (v, t) = (
        count(&w, ENEMY, UnitKind::Lancer),
        count(&w, ENEMY, UnitKind::Trooper),
    );
    assert!(v >= 1, "the AI trains Archers");
    assert!(
        v <= t + 2,
        "about one Archer per Guard: {v} Archers, {t} Guards"
    );
}

#[test]
fn the_ai_is_not_alarmed_by_a_scout_but_answers_a_gunship() {
    // Unarmed Balloons, seen (a Turret of the AI's beside them), are no air threat: no Archers beyond its mix. Drones
    // in the same spot are (three of each: its answer is two anti-air per flyer, more than the mix covers).
    for (kind, lancers) in [(UnitKind::Observer, false), (UnitKind::Shrike, true)] {
        let mut w = World::new(31, 0);
        run(&mut w, 150);
        let (cx, cy) = core(&w, ENEMY);
        let ids: Vec<Id> = (0..3)
            .map(|k| {
                let id = w.make_unit(
                    kind,
                    PLAYER,
                    (cx as f64 - 7.0 + k as f64) * TILE,
                    (cy as f64 + 9.0) * TILE,
                );
                w.hold_unit(id);
                id
            })
            .collect();
        for &id in &ids {
            let o = w.units.iter_mut().find(|u| u.id == id).unwrap();
            (o.hp, o.maxhp) = (1e9, 1e9); // (they stay to be seen and answered)
        }
        if kind == UnitKind::Observer {
            w.make_building(BldgKind::Turret, ENEMY, cx - 5, cy + 7, true);
            w.step();
            assert!(
                ids.iter().all(|&id| w.seen_by(ENEMY, id)),
                "the AI sees the scouts"
            );
        }
        let have = trained_over(&mut w, ENEMY, 80);
        // (against a control game: the same seed and set-up, no flyer; the mix trains Archers anyway)
        let mut control = World::new(31, 0);
        run(&mut control, 150);
        if kind == UnitKind::Observer {
            control.make_building(BldgKind::Turret, ENEMY, cx - 5, cy + 7, true);
            control.step();
        }
        let base = trained_over(&mut control, ENEMY, 80);
        // (a larger share of Archers among what it trained)
        let trained = have.0 * base.1 > base.0 * have.1;
        assert_eq!(
            trained, lancers,
            "{kind:?}: an anti-air answer = {trained} ((Archers, Guards) {have:?}, {base:?} without it)"
        );
    }
}

#[test]
fn the_vael_ai_builds_its_base_and_beats_an_idle_player() {
    // Every level, its Bots tied up at their sites as the Kingdom's are (PRD: builders who stay): its Bunkhouse and its
    // Recruiting posts come before any Factory (an idle player falls first).
    for diff in 0..DIFF.len() {
        for seed in [3u32, 4242] {
            let mut w = World::with_setup(seed, diff, MapKind::Standard, false, [&HUMANS, &VAEL]);
            let mut t = 0;
            let mut power_full = false;
            while !w.over && t < 30 * 60 * 15 {
                w.step();
                t += 1;
                let [used, cap] = w.sup(ENEMY);
                power_full |= used >= cap;
            }
            assert!(
                w.over && w.winner == ENEMY as i32,
                "diff {diff} seed {seed}: the Vael AI won"
            );
            // (a wind turbine once its machines fill its Power: a quick win may never need one)
            let kinds: &[BldgKind] = if power_full {
                &[BldgKind::Spire, BldgKind::Siphon]
            } else {
                &[BldgKind::Siphon]
            };
            for &k in kinds {
                assert!(
                    w.bldgs.iter().any(|b| b.team == ENEMY && b.kind == k),
                    "diff {diff} seed {seed}: it built a {k:?}"
                );
            }
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
fn two_vael_ais_finish_a_game_at_every_level() {
    // PRD: builders who stay. With every Bot staying at its site, neither Expedition AI stalls at any level: both raise
    // their Recruiting post, a Factory goes up (on a level with raiders), and one of them wins.
    for (diff, level) in DIFF.iter().enumerate() {
        let mut w = World::with_setup(11, diff, MapKind::Standard, false, [&VAEL, &VAEL]);
        w.set_ai_seats([true, true]);
        let kinds = [BldgKind::Siphon, BldgKind::Kiln];
        let mut stood = [[false; 2]; 2]; // [seat][kind]: a finished one seen
        let mut t = 0;
        while !w.over && t < 30 * 60 * 40 {
            w.step();
            w.events.clear();
            t += 1;
            for b in w.bldgs.iter().filter(|b| b.done) {
                if let Some(k) = kinds.iter().position(|&k| k == b.kind) {
                    stood[b.team as usize][k] = true;
                }
            }
        }
        assert!(
            w.over,
            "diff {diff}: someone wins within 40 min (t={:.0})",
            w.time
        );
        // (a Factory where the level raises one: the winner's at least, the loser's base may fall first)
        let factory = level.air_at < NEVER;
        assert!(
            stood.iter().all(|s| s[0]) && stood.iter().any(|s| s[1]) == factory,
            "diff {diff}: both raised a Recruiting post, and a Factory where the level raises one: {stood:?}"
        );
    }
}

#[test]
fn the_kingdom_ai_raises_its_market_early_then_the_stables_one_market_a_castle() {
    // A Market pays from the moment it stands: the Kingdom's AI raises its first once it has seven workers, before its
    // tech building, within two minutes; its Stables (which need it) after; one Market a Castle, never more, and a lost
    // one is raised again.
    for seed in [3, 21] {
        for f in [&HUMANS] {
            let mut w = World::with_setup(seed, 1, MapKind::Standard, false, [&HUMANS, f]);
            let s = &f.ai;
            let mut first = [None; 2];
            for t in 0..30 * 200 {
                w.step();
                w.events.clear();
                for (i, k) in [f.market.unwrap(), s.tech].into_iter().enumerate() {
                    if first[i].is_none() && w.bldgs.iter().any(|b| b.team == ENEMY && b.kind == k)
                    {
                        first[i] = Some(t);
                    }
                }
            }
            let [market, tech] = first.map(|t| t.expect("placed within 200 s"));
            assert!(
                market < tech,
                "seed {seed} {}: the Market before the tech ({market} vs {tech})",
                f.key
            );
            assert!(
                market < 30 * 120,
                "seed {seed} {}: the Market within 2:00 ({market})",
                f.key
            );
        }
    }
    // Hard, money to spare against an idle player, ten minutes: one Market a Castle at every moment, the Stables
    // (whose requirement it is); the Market destroyed at 5:00 is raised again.
    let mut w = World::with_setup(5, 2, MapKind::Standard, false, [&HUMANS, &HUMANS]);
    for b in w.bldgs.iter_mut().filter(|b| b.team == PLAYER) {
        (b.hp, b.maxhp) = (1e9, 1e9);
    }
    let (mut razed, mut again) = (false, false);
    while w.time < 600.0 {
        w.res[ENEMY as usize] = [2000, 0];
        w.step();
        w.events.clear();
        let mine = |k: BldgKind| {
            w.bldgs
                .iter()
                .filter(|b| b.team == ENEMY && b.kind == k)
                .count()
        };
        let castles = w
            .bldgs
            .iter()
            .filter(|b| b.team == ENEMY && b.kind == BldgKind::Core && b.done)
            .count();
        assert!(
            mine(BldgKind::Extractor) <= castles,
            "one Market a Castle: {} for {castles}",
            mine(BldgKind::Extractor)
        );
        if !razed && w.time > 300.0 {
            let m = w
                .bldgs
                .iter()
                .find(|b| b.team == ENEMY && b.kind == BldgKind::Extractor && b.done)
                .map(|b| b.id)
                .expect("a Market by 5:00");
            w.damage(m, 1e9, None);
            razed = true;
        } else if razed {
            again |= mine(BldgKind::Extractor) > 0;
        }
    }
    assert!(again, "a lost Market raised again");
    assert!(
        w.bldgs
            .iter()
            .any(|b| b.team == ENEMY && b.kind == BldgKind::Airfield),
        "its Stables, once a Market stands"
    );
}

#[test]
fn the_ai_finds_room_for_its_factories_in_a_walled_main() {
    // (Medium seeds and maps where the AI once fell behind its factory schedule, a main pocket full. Where a pocket
    // fills up depends on the world's random draws, which both AIs share: with the two vents 38 stood in for 44, and
    // with the Human AI's Factory 44 is back, 38's Vael pocket filling with Spires before 6:00, as 44's had)
    for (seed, kind, races) in [
        (3, MapKind::Standard, [&HUMANS, &VAEL]),
        (21, MapKind::Labyrinth, [&VAEL, &HUMANS]),
        (44, MapKind::Labyrinth, [&VAEL, &HUMANS]),
    ] {
        let mut w = World::with_setup(seed, 1, kind, false, races);
        w.set_ai_seats([true, true]);
        w.hold_waves = true; // (a factory lost to a wave is not a factory with no room; held until 6:00)
        for _ in 0..30 * 355 {
            w.step();
            w.events.clear();
        }
        for seat in 0..2u8 {
            // (main factories and a vehicle bay: both count against the schedule)
            let s = &w.factions[seat as usize].ai;
            let n = w
                .bldgs
                .iter()
                .filter(|b| b.team == seat && (b.kind == s.rax || Some(b.kind) == s.heavy))
                .count();
            assert!(
                n >= 3,
                "seed {seed} {kind:?} seat {seat}: {n} factories by 6 minutes"
            );
        }
    }
}

#[test]
fn hard_fields_every_factorys_units_on_its_own_income() {
    // Each factory trains all it may on Hard, on the AI's own income (no money granted): the Stables Riders and Knights
    // (a Knight it can't afford yet leaves a Rider, not an idle Stables, while the Barracks spend as money comes in),
    // the Expedition's Factory Rovers and Drones (the mix entry furthest behind its ratio, not always the first). Against
    // an idle, unbreakable player, its army thinned now and then as in a game.
    for (f, wanted) in [
        (&HUMANS, [UnitKind::Rider, UnitKind::Knight]),
        (&VAEL, [UnitKind::Monolith, UnitKind::Shrike]),
    ] {
        let mut w = World::with_setup(7, 2, MapKind::Standard, false, [&HUMANS, f]);
        for b in w.bldgs.iter_mut().filter(|b| b.team == PLAYER) {
            (b.hp, b.maxhp) = (1e9, 1e9);
        }
        let mut kinds: Vec<UnitKind> = Vec::new();
        while w.time < 900.0 {
            if w.tick.is_multiple_of(30 * TPS) {
                make_room(&mut w, ENEMY, 6);
            }
            w.step();
            w.events.clear();
            for u in w.units.iter().filter(|u| u.team == ENEMY) {
                if !kinds.contains(&u.kind) {
                    kinds.push(u.kind);
                }
            }
        }
        for k in wanted {
            assert!(
                kinds.contains(&k),
                "Hard {}: fields {k:?} within 15 min: {kinds:?}",
                f.name
            );
        }
    }
}

#[test]
fn each_level_trains_only_its_own_mix() {
    // The mix gate (`Diff::mix_tier`, `UnitKind::ai_tier`): Easy trains only tier 0 (workers, line units, their
    // anti-air (the Android, the Expedition's), the scout), Medium fields tier 1 too (raiders, siege, the Ballista, the Drone) and never
    // tier 2 (the Knight, the Bruiser). Ten minutes each, both peoples, money to spare against an idle player.
    for f in [&HUMANS, &VAEL] {
        for diff in [0usize, 1] {
            let mut w = World::with_setup(5, diff, MapKind::Standard, false, [&HUMANS, f]);
            for b in w.bldgs.iter_mut().filter(|b| b.team == PLAYER) {
                (b.hp, b.maxhp) = (1e9, 1e9);
            }
            let mut seen = [0usize; 3]; // units of each tier it ever had, queued ones too
            let mut kinds: Vec<UnitKind> = Vec::new();
            let mut raised: Vec<BldgKind> = Vec::new();
            while w.time < 600.0 {
                w.res[ENEMY as usize] = [2000, 1000];
                if w.tick.is_multiple_of(30 * TPS) {
                    make_room(&mut w, ENEMY, 6); // (its army loses some, as in a game)
                }
                w.step();
                w.events.clear();
                let queued = w
                    .bldgs
                    .iter()
                    .filter(|b| b.team == ENEMY)
                    .flat_map(|b| b.queue.iter().copied());
                let units = w.units.iter().filter(|u| u.team == ENEMY).map(|u| u.kind);
                for k in units.chain(queued) {
                    if !kinds.contains(&k) {
                        kinds.push(k);
                        seen[k.ai_tier() as usize] += 1;
                    }
                }
                for b in w.bldgs.iter().filter(|b| b.team == ENEMY) {
                    if !raised.contains(&b.kind) {
                        raised.push(b.kind);
                    }
                }
            }
            let name = f.name;
            // Easy raises no vehicle bay nor an air factory (its raiders are above it). And the AI never researches
            // a brace it would not use (Shield Drill: it braces nothing).
            let ai = &f.ai;
            if diff == 0 {
                assert!(
                    ai.heavy.is_none_or(|h| !raised.contains(&h)) && !raised.contains(&ai.air),
                    "Easy {name}: no vehicle bay or air factory: {raised:?}"
                );
            }
            assert_eq!(
                w.upgrades[ENEMY as usize][Upgrade::Entrenching.index()],
                0,
                "level {diff} {name}: no Shield Drill"
            );
            assert_eq!(
                seen[2], 0,
                "level {diff} {name}: no tier-2 unit in ten minutes: {kinds:?}"
            );
            if diff == 0 {
                assert_eq!(seen[1], 0, "Easy {name}: tier 0 only: {kinds:?}");
            } else {
                assert!(seen[1] > 0, "Medium {name}: tier-1 units too: {kinds:?}");
            }
        }
    }
    // The tiers themselves.
    use UnitKind::*;
    for k in [Harvester, Lumen, Trooper, Lancer, Prism, Umbra, Observer] {
        assert_eq!(k.ai_tier(), 0, "{k:?}");
    }
    for k in [Rider, Scythe, Bastion, SiegeTank, Monolith, Shrike] {
        assert_eq!(k.ai_tier(), 1, "{k:?}");
    }
    for k in [Knight, Bruiser] {
        assert_eq!(k.ai_tier(), 2, "{k:?}");
    }
    assert_eq!(DIFF.map(|d| d.mix_tier), [0, 1, 2, 2]);
}

#[test]
fn brutal_brings_the_humans_anchor_guns_sooner_and_more_of_them() {
    // The balance follow-ups (`Diff::mix_over`): at Brutal an Anchor Gun per four Pickets from 4:00, at every other level
    // the race's own entry (per six from 5:30); the Vael's mix is the same at every level.
    use UnitKind::*;
    let gun = HUMANS
        .ai
        .mix
        .iter()
        .copied()
        .find(|m| m.0 == SiegeTank)
        .unwrap();
    assert_eq!(gun, (SiegeTank, 6, 330.0));
    for (l, d) in DIFF.iter().enumerate().take(3) {
        assert_eq!(d.mix_entry(gun), gun, "level {l}");
    }
    assert_eq!(DIFF[3].mix_entry(gun), (SiegeTank, 4, 240.0));
    for &m in VAEL.ai.mix {
        assert!(DIFF.iter().all(|d| d.mix_entry(m) == m), "{m:?}");
    }
    // In play: the same game at Hard and at Brutal for ten minutes, the Human AI's first Anchor Gun and how many it has
    // trained by then (Brutal: the first before 5:30, and at least as many). (Seed 5: with the chase leash, seed 7's
    // Brutal Kingdom loses its first gun early and trains one where Hard trains two.)
    let guns = |level: usize| {
        let mut w = World::with_setup(5, level, MapKind::Standard, false, [&HUMANS, &VAEL]);
        w.set_ai_seats([true, true]);
        let (mut first, mut seen) = (f64::INFINITY, Vec::new());
        while w.time < 600.0 && !w.over {
            w.step();
            w.events.clear();
            for u in w
                .units
                .iter()
                .filter(|u| u.team == 0 && u.kind == SiegeTank)
            {
                first = first.min(w.time);
                if !seen.contains(&u.id) {
                    seen.push(u.id);
                }
            }
        }
        (first, seen.len())
    };
    let ((hard_first, hard_n), (brutal_first, brutal_n)) = (guns(2), guns(3));
    assert!(
        hard_first >= 330.0,
        "Hard's first Anchor Gun at {hard_first:.0} s"
    );
    assert!(
        brutal_first < 330.0,
        "Brutal's first Anchor Gun at {brutal_first:.0} s"
    );
    // (at least as many: since the balance pass this game's Kingdom loses fewer and both levels can stand at their
    // population limit with what their mix allows by 10:00, four each)
    assert!(
        brutal_n >= hard_n,
        "Anchor Guns by 10:00: Brutal {brutal_n}, Hard {hard_n}"
    );
}

#[test]
fn the_guided_first_game_holds_the_first_wave_until_released() {
    // Medium (Easy's own first wave, 7:45, comes after the hold's longest), with the waves held: no attack before 4:50
    // even with an army ready; released, the wave goes.
    let mut w = World::new(4242, 1);
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
    // Medium, held the whole time: no wave before 6:00, one soon after.
    let mut w = World::new(4242, 1);
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
fn easy_sends_its_first_wave_at_7_45_and_medium_at_4_00() {
    // A newcomer against Easy is not hit before about 8:00 (its first wave went at 4:00 and arrived by 4:30; the lab's
    // newcomer, `turtle --weak --attacker-level Easy`, is first hit at about 8:00 on 64x64 now); Medium's first wave
    // goes at 4:00, the step after it (the economy pass: it went at 2:50). Each people's AI against an idle player.
    for (diff, due) in [(0usize, DIFF[0].first), (1, DIFF[1].first)] {
        for race in [&HUMANS, &VAEL] {
            let mut w = World::with_setup(5, diff, MapKind::Standard, false, [&HUMANS, race]);
            let mut first = None;
            while w.time < due + 120.0 && first.is_none() {
                w.step();
                w.events.clear();
                if w.ai_wave().is_some() {
                    first = Some(w.time);
                }
            }
            let t = first
                .unwrap_or_else(|| panic!("level {diff} {}: a wave by {}", race.name, due + 120.0));
            assert!(t > due, "level {diff} {}: not before {due}: {t}", race.name);
        }
    }
    assert_eq!((DIFF[0].first, DIFF[1].first), (465.0, 240.0));
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
    // (alike but for a trip: the world's one RNG times every unit's route refresh, and the AI's faster miners draw
    // from it at other moments)
    let (pm, pb) = (medium[PLAYER as usize], brutal[PLAYER as usize]);
    assert!(
        (pm - pb).abs() <= pm / 30,
        "the player gathers alike: {pm} and {pb}"
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
        // (main factories and a vehicle bay: both count against the schedule)
        let factories =
            |w: &World| count(w, f_ai.ai.rax) + f_ai.ai.heavy.map_or(0, |h| count(w, h));
        let mut hqs_at_9 = 0;
        // (the Expedition's line at its maximum of hired places after its natural: no factory can grow it)
        let mut line_full = false;
        while w.time < 960.0 {
            w.step();
            w.events.clear();
            if (w.time - 535.0).abs() < 0.02 {
                hqs_at_9 = count(&w, f_ai.hq);
            }
            if w.time > 600.0 && f_ai.power {
                line_full |= w.pool(ENEMY, Pool::Hired)[0] >= w.pool_max(ENEMY, Pool::Hired);
            }
        }
        let name = f[1].name;
        assert_eq!(hqs_at_9, 1, "{name}: no natural before 9:00");
        assert_eq!(count(&w, f_ai.hq), 2, "{name}: its natural");
        let crew = w.harv_target_of(ENEMY, 2); // (its crew with a natural, in its own workers)
        assert!(harvesters(&w, ENEMY).len() + 1 >= crew, "{name}: crewed");
        let schedule = DIFF[0].rax + 2; // (one more after 5 and after 9 minutes)
        // (since the economy pass's scarcer gold the Expedition's posts fill its hired places before it banks for a
        // fourth: its line then stands at its maximum, which a factory could not raise)
        // (since the economy's second round its slower income rarely banks the 400 an extra factory waits for by
        // 16:00: its schedule's factories all standing, a natural and its crew are the growth asked here)
        assert!(
            factories(&w) >= schedule || line_full,
            "{name}: its schedule's factories: {}, or its line at its maximum",
            factories(&w)
        );
        // (but the Expedition's satellite, launched on every level: its way to the Portal)
        let sat = w.upgrades[ENEMY as usize][Upgrade::Satellite.index()];
        assert_eq!(
            w.upgrades[ENEMY as usize].iter().sum::<u8>() - sat,
            0,
            "{name}: still no research"
        );
    }
}

#[test]
fn the_ai_replaces_a_worker_that_is_away_building() {
    // A builder stays at its site until the building stands (either people's, PRD: builders who stay): the AI keeps
    // one spare, so a worker sent off to build is replaced and its income does not dip with every building it
    // raises; one at most (the extra ones stay for good).
    for f in [&HUMANS, &VAEL] {
        let mut w = World::with_setup(17, 1, MapKind::Standard, false, [&HUMANS, f]);
        let home = w.bldgs.iter_mut().find(|b| b.team == PLAYER).unwrap();
        (home.hp, home.maxhp) = (1e9, 1e9); // (the idle player's base stands: its waves do not end the game first)
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
        // One of them goes off to build a Cottage or a Sunpetal (and stays there).
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
            .find(|&(tx, ty)| w.can_place(f.supply, tx, ty, ENEMY))
            .expect("room for a supply building");
        // (its price, and a worker's: its bank may be spent just now)
        w.res[ENEMY as usize][0] += f.supply.def().cost[0] + f.worker.def().cost[0];
        w.place_building(ENEMY, f.supply, tx, ty, Some(builder))
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
            "{}: a replacement for the builder: {} + {queued} queued vs {before}",
            f.key,
            harvesters(&w, ENEMY).len()
        );
        // And no more than one, however long it runs.
        run(&mut w, 30);
        assert!(
            harvesters(&w, ENEMY).len() <= target(&w) + 1,
            "{}: one spare at most: {}",
            f.key,
            harvesters(&w, ENEMY).len()
        );
    }
}

#[test]
fn the_vael_ai_keeps_one_spare_worker_at_most() {
    // A Bot stays at its site as a Villager does: the Expedition's AI keeps one spare for it, and no more, through a long game
    // on every level (a second base adds three).
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
            // (its difficulty's, and three more with a second base, in Bots: five for every seven of the levels' crews,
            // a mine taking in five Bots where it took seven workers)
            let target = w.harv_target_of(ENEMY, cores);
            let crew = d.harv + 3 * (cores >= 2) as usize;
            assert_eq!(target, (crew * 5 + 3) / 7);
            most = most.max(harvesters(&w, ENEMY).len() as i64 - target as i64);
        }
        assert!(most <= 1, "diff {diff}: {most} over its target");
    }
}

#[test]
fn on_a_barren_map_the_ai_takes_its_natural_before_its_home_field_runs_dry() {
    // Barren fields hold 40% of the gold: since mines last the game (the economy's second round) the home mine there
    // still runs low within a game, and after it ran dry the AI could never pay for a Core. Medium and up take their
    // natural before it does (by their schedule, or once it runs low); Easy keeps to its schedule (the gentle level):
    // no natural before 9:00.
    for diff in 0..DIFF.len() {
        let mut w = World::with_setup(17, diff, MapKind::Barren, false, [&HUMANS, &HUMANS]);
        for b in w.bldgs.iter_mut().filter(|b| b.team == PLAYER) {
            b.hp = 1e9;
            b.maxhp = 1e9;
        }
        let hq = w.factions[ENEMY as usize].hq;
        let (cx, cy) = core(&w, ENEMY);
        let home = w
            .map
            .nodes
            .iter()
            .min_by(|a, b| {
                let d = |n: &endfall_sim::map::Node| (n.tx - cx).pow(2) + (n.ty - cy).pow(2);
                d(a).cmp(&d(b))
            })
            .unwrap()
            .id;
        let (mut first, mut dry) = (None, None);
        while w.time < 900.0 && dry.is_none() {
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
            if w.map.node(home).is_some_and(|n| n.amount <= 0) {
                dry = Some(w.time);
            }
        }
        let at = first.unwrap_or(f64::MAX);
        if diff == 0 {
            assert!(at > 540.0, "Easy: no natural before 9:00 ({at:.0} s)");
        } else {
            assert!(
                at < dry.unwrap_or(f64::MAX) && at < 900.0,
                "diff {diff}: its natural ({at:.0} s) before its home mine ran dry ({dry:?})"
            );
        }
    }
}

#[test]
fn brutal_spends_its_income_when_its_main_fills_up() {
    // Brutal's x1.3 income needs more factories than a main pocket has room for: with none left near its center it
    // builds farther out (and the Vael raise a Spire out there first, for a field to build in) instead of waiting for
    // its natural. Its mean bank at 6 and 8 minutes over three seeds, against a player who holds: about 3,650 for
    // either race before, about 1,250 / 1,800 (Human / Vael AI) then. Under the cap of 40 (PRD: the conversion) a
    // seat at the cap cannot spend: only the samples short of it count, and it must reach the cap at all.
    for f in [[&HUMANS, &HUMANS], [&HUMANS, &VAEL]] {
        let (mut banked, mut capped) = (Vec::new(), 0);
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
                // (at the cap: its army at the one limit of all its pools together)
                if w.army_used(ENEMY) + 2 < w.supply_limit() {
                    banked.push(w.res[ENEMY as usize][0]);
                } else {
                    capped += 1;
                }
            }
        }
        // (under the second round's caps of 100 and more the cap is rarely reached by 8:00: every sample counts)
        let _ = capped;
        let mean = banked.iter().sum::<i32>() / banked.len().max(1) as i32;
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
    // Brutal's build order (three factories, supply two at a time) spent every coin while its crew was still short,
    // so its Core stood idle between workers; and a Human builder leaves the line while it builds, so the Human AI fell
    // behind the Vael AI in the opening. Now a worker's price stays in the bank while the crew is short: by 3:00 (its
    // build-up done; the first waves can meet about then, so the mining margin allows for a fleeing worker or two) the Human AI's Core
    // has stood idle for under 10 s, its crew is full and it has within two as many at work (mining or building) as the Vael AI. (Without it: 18-23 s idle, a crew of 17 and two to three fewer mining.)
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
        // At work: mining, or (a Human builder, who leaves the line) putting up a building.
        let mining = |s: u8| {
            harvesters(&w, s)
                .iter()
                .filter(|&&h| {
                    matches!(
                        w.unit(h).unwrap().task,
                        Task::Gather { .. } | Task::Build { .. }
                    )
                })
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
            "seed {seed}: at work {} to the Vael AI's {}",
            mining(PLAYER),
            mining(ENEMY)
        );
    }
    // The other levels build as before.
    assert!(DIFF[..3].iter().all(|d| !d.workers_first));
}

#[test]
fn the_vael_ai_raises_its_air_factory_sooner_than_the_humans() {
    // Each side's air factory (the raiders' factory: the Kingdom's Stables, the Expedition's Factory) waits for its
    // level's `air_at`, less its script's `air_lead`: the Expedition's half a minute sooner (its Rovers and Drones
    // come from there), the Kingdom's on time; the Expedition's sooner still once its hired places stand at their
    // maximum (the balance pass: its money then goes to machines). Money to spare, against an idle player, on Hard,
    // over ten maps: every one comes, never before it is due (or its hired places full), and the Expedition's typical
    // Factory before the Kingdom's typical Stables. One
    // map in ten may be late: a main whose build order keeps two other sites going (supply, a second factory, its
    // natural) has no turn for it for a few minutes.
    let air_at = DIFF[2].air_at;
    let mut medians = Vec::new();
    for f in [&VAEL, &HUMANS] {
        let due = air_at - f.ai.air_lead;
        let mut times: Vec<f64> = (1..=10u32)
            .map(|seed| {
                let mut w = World::with_setup(seed, 2, MapKind::Standard, false, [&HUMANS, f]);
                for b in w.bldgs.iter_mut().filter(|b| b.team == PLAYER) {
                    (b.hp, b.maxhp) = (1e9, 1e9);
                }
                let mut placed = None;
                let mut full = false;
                while w.time < 900.0 && placed.is_none() {
                    w.res[ENEMY as usize] = [2000, 1000];
                    let max = w.pool_max(ENEMY, Pool::Hired);
                    full = max > 0 && w.pool(ENEMY, Pool::Hired)[0] + 2 >= max;
                    w.step();
                    w.events.clear();
                    placed = w
                        .bldgs
                        .iter()
                        .any(|b| b.team == ENEMY && b.kind == f.ai.air)
                        .then_some(w.time);
                }
                // (placed with its hired places full: due then, whatever the clock)
                placed.map_or(f64::MAX, |at| if full { due + 1.0 } else { at })
            })
            .collect();
        assert!(
            times.iter().all(|&at| at > due && at < 900.0),
            "{}: its {:?} on every map, never before {due:.0} s: {times:?}",
            f.name,
            f.ai.air
        );
        let late = times.iter().filter(|&&at| at > air_at + 60.0).count();
        assert!(
            late <= 1,
            "{}: its {:?} by {:.0} s on all maps but one at most: {times:?}",
            f.name,
            f.ai.air,
            air_at + 60.0
        );
        times.sort_by(|a, b| a.partial_cmp(b).unwrap());
        medians.push((times[4] + times[5]) / 2.0);
    }
    assert!(
        medians[0] < medians[1],
        "the Expedition's Factory ({:.0} s) before the Kingdom's Stables ({:.0} s) on a typical map",
        medians[0],
        medians[1]
    );
    const { assert!(VAEL.ai.air_lead > HUMANS.ai.air_lead) };
}

#[test]
fn the_ai_raises_its_first_tower_at_two_and_a_half_minutes() {
    // Its first defense tower (a Turret, a Ward) once its first factory stands and from 2:30 (it was 4:00): an early
    // wave found nothing at home but a few units (on the Shore map, where the routes are shorter, the Humans lost about
    // three harvesters by 5:00 and won 14 of 40 at Medium; with the tower at 2:30, 1.6 and 17). Money to spare,
    // against an idle player, on Medium.
    for f in [&HUMANS, &VAEL] {
        let mut w = World::with_setup(5, 1, MapKind::Standard, false, [&HUMANS, f]);
        for b in w.bldgs.iter_mut().filter(|b| b.team == PLAYER) {
            (b.hp, b.maxhp) = (1e9, 1e9);
        }
        let mut placed = None;
        while w.time < 300.0 && placed.is_none() {
            w.res[ENEMY as usize] = [2000, 1000];
            w.step();
            w.events.clear();
            placed = w
                .bldgs
                .iter()
                .any(|b| b.team == ENEMY && b.kind == f.ai.tower)
                .then_some(w.time);
        }
        let at = placed.unwrap_or(f64::MAX);
        assert!(
            at > 150.0 && at < 240.0,
            "{}: its first {:?} at {at:.0} s (from 150 s, before the old 240 s)",
            f.name,
            f.ai.tower
        );
    }
}

#[test]
fn a_seat_s_plan_replaces_its_level_s_tuning() {
    // The balance lab's plans (World::set_ai_plans): a whole `Diff` per seat in place of its level's, read by every AI
    // decision through `World::tuning`. Without one, a seat plays its level (the goldens pin that nothing changed).
    let mut w = World::with_setup(4, 1, MapKind::Standard, false, [&HUMANS, &VAEL]);
    assert!(w.set_ai_seats([true, true]));
    for s in 0..2 {
        assert_eq!(w.tuning(s), DIFF[w.diff_of(s)], "no plan: its level's");
    }
    assert!(!w.set_ai_plans(&[None]), "a plan for every seat, or none");
    // A quick first wave (a small one, so it can leave before its level's own time) against a late one: each leaves
    // when its plan says, the quick one before Medium's own first wave could, the late one after.
    let (quick, late) = (120.0, 420.0);
    assert!(quick + 30.0 < DIFF[1].first && late > DIFF[1].first + 60.0);
    // (no siege rules, no home reserve and no pull-back: the waves' times are the plans' alone, whatever the foe does)
    let plan = |first, wave| {
        Some(Diff {
            first,
            wave,
            reserve: 0.0,
            retreat_below: 0.0,
            ..DIFF[1]
        })
    };
    assert!(w.set_ai_plans(&[plan(quick, 2), plan(late, DIFF[1].wave)]));
    assert_eq!(w.tuning(0).first, quick);
    assert_eq!(w.tuning(1).first, late);
    let mut launched = [None::<f64>; 2];
    while w.time < 600.0 && launched.iter().any(|l| l.is_none()) && w.winner < 0 {
        w.step();
        w.events.clear();
        for s in 0..2u8 {
            if launched[s as usize].is_none() && w.ai_wave_of(s).is_some() {
                launched[s as usize] = Some(w.time);
            }
        }
    }
    let [a, b] = launched.map(|l| l.unwrap_or(f64::MAX));
    assert!(
        a < 600.0 && b < 600.0,
        "both waves leave: {a:.0} s and {b:.0} s"
    );
    assert!(
        a >= quick && b >= late,
        "no wave before its plan's time: {a:.0} s and {b:.0} s"
    );
    assert!(
        a < DIFF[1].first,
        "the quick plan's wave before its level's own first wave could leave ({a:.0} s, Medium {} s)",
        DIFF[1].first
    );
}
