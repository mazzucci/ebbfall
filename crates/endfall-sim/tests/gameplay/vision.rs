//! Shared vision: allies see, explore and detect together (a seat's fog is its own sight and its allies'); a free for
//! all and a duel see as before; a seat that is out still lends the sight of what it left, while that stands.

use super::common::*;
use endfall_sim::world::Event;

/// Four seats on 96x96, nobody an AI (nothing moves but the miners), with these teams (empty: each its own).
fn four(teams: &[u8]) -> World {
    let races = [&HUMANS, &VAEL, &HUMANS, &VAEL];
    let mut w = World::with_size(31, 1, MapKind::Standard, MapSize::square(96), 31, &races);
    assert!(w.set_ai_seats(vec![false; 4]));
    if !teams.is_empty() {
        assert!(w.set_teams(teams));
    }
    w
}

/// Open ground near the middle of the map, far from every start (out of every seat's sight), in world pixels.
fn middle(w: &World) -> (f64, f64) {
    let (tx, ty) = w
        .map
        .nearest_free(w.map.w / 2, w.map.h / 2, 8)
        .expect("open ground");
    for s in 0..4 {
        assert_eq!(
            w.vis[s][w.map.idx(tx, ty)],
            0,
            "seat {s} does not see the middle yet"
        );
    }
    ((tx as f64 + 0.5) * TILE, (ty as f64 + 0.5) * TILE)
}

fn sees(w: &World, seat: u8, x: f64, y: f64) -> bool {
    let (tx, ty) = w.map.tile_of(x, y);
    w.vis[seat as usize][w.map.idx(tx, ty)] != 0
}

fn explored(w: &World, seat: u8, x: f64, y: f64) -> bool {
    let (tx, ty) = w.map.tile_of(x, y);
    w.explored[seat as usize][w.map.idx(tx, ty)] != 0
}

/// Seat 1's Trooper in the middle with seat 2's Trooper beside it, both holding. Returns (seat 1's, seat 2's).
fn scene(w: &mut World) -> (Id, Id) {
    let (x, y) = middle(w);
    let ally = w.make_unit(UnitKind::Trooper, 1, x, y);
    let enemy = w.make_unit(UnitKind::Trooper, 2, x + 40.0, y);
    w.hold_unit(ally);
    w.hold_unit(enemy);
    w.step();
    (ally, enemy)
}

#[test]
fn an_allys_unit_shows_an_enemy_to_the_whole_team() {
    let mut w = four(&[0, 0, 1, 1]);
    let (ally, enemy) = scene(&mut w);
    let (ex, ey) = (w.unit(enemy).unwrap().x, w.unit(enemy).unwrap().y);
    assert!(sees(&w, 0, ex, ey), "seat 0 sees where its ally does");
    assert!(w.seen_by(0, enemy), "and the enemy there");
    assert!(
        w.seen_by(3, ally),
        "seat 2's ally sees seat 1's Trooper in turn"
    );
    // Every seat of a team has the same fog: the team's.
    assert_eq!(w.vis[0], w.vis[1]);
    assert_eq!(w.vis[2], w.vis[3]);
    assert_eq!(w.explored[0], w.explored[1]);
    assert_ne!(w.vis[0], w.vis[2], "the other team sees otherwise");
    // The ally gone: out of sight, still explored.
    w.damage(ally, 1e9, None);
    w.step();
    assert!(
        !sees(&w, 0, ex, ey) && !w.seen_by(0, enemy),
        "nobody of the team there: fog again"
    );
    assert!(
        explored(&w, 0, ex, ey),
        "what the ally explored stays explored for the team"
    );
}

#[test]
fn an_allys_detector_reveals_a_cloaked_enemy_to_the_team() {
    let mut w = four(&[0, 0, 1, 1]);
    let (x, y) = middle(&w);
    let mine = w.make_unit(UnitKind::Trooper, 0, x, y);
    let obs = w.make_unit(UnitKind::Observer, 2, x + 40.0, y);
    w.hold_unit(mine);
    w.hold_unit(obs);
    w.step();
    assert!(sees(&w, 0, x + 40.0, y), "its spot is in sight");
    assert!(
        !w.seen_by(0, obs) && w.cloaked_from(0, obs_unit(&w, obs)),
        "cloaked: unseen"
    );
    // Seat 1's Observer (a detector) beside it: the whole team detects it.
    let det = w.make_unit(UnitKind::Observer, 1, x + 20.0, y + 20.0);
    w.hold_unit(det);
    w.step();
    assert!(
        w.detects(0, x + 40.0, y),
        "seat 0 detects where its ally's detector does"
    );
    assert!(w.seen_by(0, obs), "the cloaked enemy is seen by seat 0");
    assert!(!w.cloaked_from(0, obs_unit(&w, obs)) && !w.cloaked_from(1, obs_unit(&w, obs)));
    // A Trooper of seat 0 can now fire at it (detection is what an attack order needs).
    run(&mut w, 6);
    assert!(
        w.unit(obs).is_none_or(|o| o.hp < o.maxhp),
        "seat 0's Trooper fires at what its ally detects"
    );
}

fn obs_unit(w: &World, id: Id) -> &Unit {
    w.unit(id).expect("observer")
}

#[test]
fn a_free_for_all_sees_alone() {
    for teams in [&[][..], &[3, 2, 1, 0][..]] {
        let mut w = four(teams);
        let (ally, enemy) = scene(&mut w);
        let (ex, ey) = (w.unit(enemy).unwrap().x, w.unit(enemy).unwrap().y);
        assert!(
            sees(&w, 1, ex, ey) && w.seen_by(1, enemy),
            "seat 1 sees its neighbour"
        );
        for s in [0, 3] {
            assert!(
                !sees(&w, s, ex, ey),
                "{teams:?}: seat {s} sees nothing of the middle"
            );
            assert!(!w.seen_by(s, enemy) && !w.seen_by(s, ally));
        }
        // Each seat's fog is its own sight only: seat 0's sight is what its own units and buildings show.
        let mut own = vec![0u8; w.vis[0].len()];
        for u in w.units.iter().filter(|u| u.team == 0) {
            let (tx, ty) = w.map.tile_of(u.x, u.y);
            own[w.map.idx(tx, ty)] = 1;
        }
        assert!(
            own.iter().zip(&w.vis[0]).all(|(o, v)| *o == 0 || *v != 0),
            "seat 0 sees its own"
        );
        assert!(
            !w.vis[0].iter().zip(&w.vis[1]).all(|(a, b)| a == b),
            "two seats, two fogs"
        );
    }
}

#[test]
fn a_duel_sees_alone() {
    let mut w = World::new(5, 1);
    let (x, y) = {
        let (tx, ty) = w.map.nearest_free(w.map.w / 2, w.map.h / 2, 8).unwrap();
        ((tx as f64 + 0.5) * TILE, (ty as f64 + 0.5) * TILE)
    };
    let u = w.make_unit(UnitKind::Trooper, ENEMY, x, y);
    w.hold_unit(u);
    w.step();
    assert!(
        sees(&w, ENEMY, x, y) && !sees(&w, PLAYER, x, y),
        "the enemy's sight is not the player's"
    );
}

#[test]
fn an_ally_that_is_out_still_shows_what_its_leftovers_see() {
    let mut w = four(&[0, 0, 1, 1]);
    let (ally, enemy) = scene(&mut w);
    w.concede(1);
    assert!(w.out[1] && !w.over, "seat 1 is out; its ally plays on");
    w.step();
    assert!(w.inert(1), "what it left is inert");
    assert!(
        w.seen_by(0, enemy),
        "its Trooper, inert but there, still shows the enemy to seat 0"
    );
    // Seat 0's own sight reaches the out seat too.
    let (cx, cy) = core(&w, 0);
    let at = ((cx as f64 + 2.0) * TILE, (cy as f64 + 2.0) * TILE);
    assert!(
        sees(&w, 1, at.0, at.1),
        "the out seat sees what its team sees"
    );
    // Its Trooper destroyed: that sight is gone.
    w.damage(ally, 1e9, None);
    w.step();
    assert!(!w.seen_by(0, enemy), "nothing left there: nothing seen");
}

/// Where each seat's first wave goes: the mean goal of its first attack-move order to three or more fighters bound
/// more than 30 tiles from its start, within `secs` seconds (None: no wave yet).
fn first_waves(w: &mut World, secs: u32) -> Vec<Option<(f64, f64)>> {
    let n = w.seats();
    let mut waves = vec![None; n];
    for _ in 0..secs * TPS {
        w.step();
        for (seat, wave) in waves.iter_mut().enumerate() {
            if wave.is_some() {
                continue;
            }
            let (bx, by) = w.map.bases[seat];
            let home = ((bx as f64 + 2.0) * TILE, (by as f64 + 2.0) * TILE);
            let goals: Vec<(f64, f64)> = w
                .units
                .iter()
                .filter(|u| u.team as usize == seat && !u.kind.def().worker)
                .filter_map(|u| match u.task {
                    Task::AMove { x, y } if (x - home.0).hypot(y - home.1) > 30.0 * TILE => {
                        Some((x, y))
                    }
                    _ => None,
                })
                .collect();
            if goals.len() >= 3 {
                let k = goals.len() as f64;
                *wave = Some((
                    goals.iter().map(|g| g.0).sum::<f64>() / k,
                    goals.iter().map(|g| g.1).sum::<f64>() / k,
                ));
            }
        }
        if waves.iter().all(|v| v.is_some()) {
            break;
        }
    }
    waves
}

/// The seat whose start is nearest world point (x, y), among `among`.
fn nearest_start(w: &World, (x, y): (f64, f64), among: &[u8]) -> u8 {
    *among
        .iter()
        .min_by(|&&a, &&b| {
            let d = |s: u8| {
                let (bx, by) = w.map.bases[s as usize];
                ((bx as f64 + 2.0) * TILE - x).hypot((by as f64 + 2.0) * TILE - y)
            };
            d(a).partial_cmp(&d(b)).unwrap()
        })
        .unwrap()
}

#[test]
fn in_two_against_two_each_ais_first_wave_goes_for_its_foe() {
    // What an ally saw (another enemy's base) neither ends the scouting nor draws the first wave across the map.
    for seed in [14, 3, 21, 33] {
        let races = [&HUMANS, &VAEL, &HUMANS, &VAEL];
        let mut w = World::with_size(
            seed,
            1,
            MapKind::Standard,
            MapSize::square(96),
            seed,
            &races,
        );
        assert!(w.set_ai_seats(vec![true; 4]));
        assert!(w.set_teams(&[0, 0, 1, 1]));
        let foes: Vec<u8> = (0..4).map(|s| w.foe_of(s)).collect();
        let waves = first_waves(&mut w, 420);
        for seat in 0..4u8 {
            let goal = waves[seat as usize].expect("a first wave within 7 minutes");
            let enemies: Vec<u8> = (0..4).filter(|&s| w.enemies(seat, s)).collect();
            assert_eq!(
                nearest_start(&w, goal, &enemies),
                foes[seat as usize],
                "seed {seed}: seat {seat}'s first wave (to {goal:?}) goes for its foe"
            );
        }
    }
}

/// Each seat's fog in `teamed` is the OR of its allies' in `alone` (the same world, every seat its own team).
fn shared_as_ored(alone: &World, teamed: &World, what: &str) {
    let n = alone.seats();
    let layers = |w: &World| [w.vis.clone(), w.explored.clone(), w.det.clone()];
    let (a, t) = (layers(alone), layers(teamed));
    for (k, name) in ["vis", "explored", "det"].iter().enumerate() {
        for s in 0..n {
            let want: Vec<u8> = (0..a[k][s].len())
                .map(|i| {
                    (0..n)
                        .filter(|&o| teamed.allies(s as u8, o as u8))
                        .any(|o| a[k][o][i] != 0) as u8
                })
                .collect();
            assert!(
                t[k][s] == want,
                "{what}: seat {s}'s {name} is its team's (teams {:?})",
                teamed.teams
            );
        }
    }
}

#[test]
fn teams_of_seats_apart_and_of_three_share_their_fog() {
    // Allies need not sit side by side ([0, 1, 0, 1] on 96x96), and a team may be three (six seats on 128x128).
    let races: Vec<&'static Faction> = (0..6)
        .map(|s| if s % 2 == 0 { &HUMANS } else { &VAEL })
        .collect();
    for (size, seats, teams) in [
        (96, 4, vec![0u8, 1, 0, 1]),
        (128, 6, vec![0, 0, 0, 1, 1, 1]),
        (128, 6, vec![0, 1, 2, 0, 1, 2]),
    ] {
        let make = |teamed: bool| {
            let mut w = World::with_size(
                9,
                1,
                MapKind::Standard,
                MapSize::square(size),
                1, // (a side below the starts' count: teams do not deal the seats again, `map::team_starts`)
                &races[..seats],
            );
            assert!(w.set_ai_seats(vec![false; seats]));
            if teamed {
                assert!(w.set_teams(&teams));
            }
            w
        };
        let (mut alone, mut teamed) = (make(false), make(true));
        shared_as_ored(
            &alone,
            &teamed,
            "before the first step (set_teams brings the fog up to date)",
        );
        // A detector of each team's last seat somewhere of its own, then a few seconds of mining.
        for w in [&mut alone, &mut teamed] {
            let (bx, by) = w.map.bases[seats - 1];
            w.make_unit(
                UnitKind::Observer,
                (seats - 1) as u8,
                (bx as f64 + 8.0) * TILE,
                by as f64 * TILE,
            );
        }
        run(&mut alone, 5);
        run(&mut teamed, 5);
        shared_as_ored(&alone, &teamed, "after 5 s");
        assert!(
            teamed.det.iter().any(|d| d.iter().any(|&x| x != 0)),
            "something detects"
        );
    }
}

#[test]
fn a_person_may_build_where_only_an_ally_has_looked() {
    // Before the first step too: the teams' fog is shared as soon as they are set.
    let (alone, mut teamed) = (four(&[]), four(&[0, 0, 1, 1]));
    let (bx, by) = alone.map.bases[1];
    let spot = (by - 8..by + 12)
        .flat_map(|ty| (bx - 8..bx + 12).map(move |tx| (tx, ty)))
        .find(|&(tx, ty)| teamed.can_place(BldgKind::Depot, tx, ty, 0))
        .expect("room for a Depot by the ally's base");
    assert!(
        !alone.can_place(BldgKind::Depot, spot.0, spot.1, 0),
        "alone, that ground is unexplored: refused"
    );
    let h = harvesters(&teamed, 0)[0];
    teamed.res[0] = [500, 0];
    let placed = teamed.place_building(0, BldgKind::Depot, spot.0, spot.1, Some(h));
    assert!(placed.is_ok(), "with an ally there: placed ({placed:?})");
}

/// The seats told "A shard field ran dry" when one of seat 0's crystals runs out, with an Observer of `watcher`
/// beside it (teams [0, 0, 1, 1]).
fn told_dry(watcher: Option<u8>) -> Vec<u8> {
    let mut w = four(&[0, 0, 1, 1]);
    let h = harvesters(&w, 0)[0];
    let Task::Gather { node, .. } = w.unit(h).unwrap().task else {
        panic!("a miner at work")
    };
    let n = w.map.nodes.iter_mut().find(|n| n.id == node).unwrap();
    n.amount = 1;
    let (x, y) = (n.x, n.y);
    if let Some(s) = watcher {
        let o = w.make_unit(UnitKind::Observer, s, x + 20.0, y);
        w.hold_unit(o);
    }
    w.events.clear();
    for _ in 0..20 * TPS {
        w.step();
        if w.map.node(node).is_none() {
            break;
        }
    }
    assert!(w.map.node(node).is_none(), "the crystal ran out");
    let mut told: Vec<u8> = w
        .events
        .iter()
        .filter_map(|e| match e {
            Event::Toast { team, msg, .. } if msg == "A shard field ran dry" => Some(*team),
            _ => None,
        })
        .collect();
    told.sort();
    told
}

#[test]
fn a_shard_field_running_dry_is_told_to_its_miner_and_enemies_who_see_it_not_to_allies() {
    assert_eq!(
        told_dry(None),
        vec![0],
        "the miner's seat; its ally sees it, but it is not its field"
    );
    assert_eq!(
        told_dry(Some(2)),
        vec![0, 2, 3],
        "an enemy watching, and its ally (who sees what it sees)"
    );
}

#[test]
fn a_team_game_watched_again_is_the_game_played() {
    // A person and an AI against two AIs on 96x96: the replay rebuilds the teams and plays the logged orders.
    let mut g = Game::with_seats(
        12,
        1,
        0,
        0,
        &[0, 1, 0, 1],
        &[0, 0, 1, 1],
        &[0, 1, 1, 1],
        0,
        Some(96),
    )
    .unwrap();
    let mut r = Mulberry32::new(12);
    let mut hashes = Vec::new();
    for tick in 0..30 * 120 {
        if tick % 11 == 0 {
            random_order_with(&mut g, &mut r, false);
        }
        g.step();
        hashes.push(g.state_hash());
    }
    assert!(g.start_replay(), "watchable");
    for (i, want) in hashes.iter().enumerate() {
        g.step();
        assert_eq!(
            g.state_hash(),
            *want,
            "the replay diverged at tick {}",
            i + 1
        );
    }
}
