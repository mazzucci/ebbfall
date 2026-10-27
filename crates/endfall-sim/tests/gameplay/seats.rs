//! Seats and teams: allies never fight, kills count for the killer's seat, a seat that is out leaves the game to the
//! rest, and the last team standing wins (three seats on a duel's map: the third gets its start from the test,
//! `World::add_seat`, on open ground away from the other two); then AIs four, six and eight to a map, free for all and
//! two against two, on maps with a start for each.

use crate::common::*;
use endfall_sim::world::Command;

/// Open ground for a third headquarters (4x4 and a ring round it), as far as can be from both starts.
fn third_base(w: &World) -> (i32, i32) {
    let mut best: Option<(i32, i32, i32)> = None;
    for ty in 3..w.map.h - 7 {
        for tx in 3..w.map.w - 7 {
            if (ty - 1..ty + 5).any(|y| (tx - 1..tx + 5).any(|x| w.map.blocked(x, y))) {
                continue;
            }
            let far = w.map.bases[..2]
                .iter()
                .map(|b| (b.0 - tx).pow(2) + (b.1 - ty).pow(2))
                .min()
                .unwrap();
            if best.is_none_or(|b| far > b.0) {
                best = Some((far, tx, ty));
            }
        }
    }
    let (_, tx, ty) = best.expect("open ground");
    (tx, ty)
}

/// Three seats, nobody's an AI, with these teams.
fn three(seed: u32, teams: [u8; 3]) -> World {
    let mut w = World::new(seed, 1);
    let base = third_base(&w);
    assert_eq!(w.add_seat(&HUMANS, base), 2);
    assert!(w.set_ai_seats([false; 3]));
    assert!(w.set_teams(&teams));
    w
}

/// Every unit and building of `seat`, destroyed (by nobody: no kill to count).
fn wipe(w: &mut World, seat: u8) {
    let ids: Vec<Id> = w
        .units
        .iter()
        .filter(|u| u.team == seat)
        .map(|u| u.id)
        .chain(w.bldgs.iter().filter(|b| b.team == seat).map(|b| b.id))
        .collect();
    for id in ids {
        w.damage(id, 1e9, None);
    }
}

/// A Trooper of seat 0 and one of seat 2 side by side in the open, idle; their hp after `secs` seconds.
fn neighbours(teams: [u8; 3], secs: u32) -> (World, Id, Id) {
    let mut w = three(21, teams);
    let (bx, by) = w.map.bases[2];
    let (x, y) = ((bx as f64 + 2.0) * TILE, (by as f64 + 6.5) * TILE);
    let a = w.make_unit(UnitKind::Trooper, 0, x - 20.0, y);
    let b = w.make_unit(UnitKind::Trooper, 2, x + 20.0, y);
    run(&mut w, secs);
    (w, a, b)
}

#[test]
fn allied_seats_do_not_fight_and_enemies_do() {
    let (w, a, b) = neighbours([0, 1, 0], 6);
    for id in [a, b] {
        let u = w.unit(id).expect("allies leave each other alone");
        assert_eq!(u.hp, u.maxhp);
        assert_eq!(u.task, Task::Idle, "no ally taken for a target");
    }
    // An order to attack an ally is refused.
    let mut w = w;
    w.attack_ent(a, b);
    assert_eq!(w.unit(a).unwrap().task, Task::Idle);
    // The same two on different teams: they fight.
    let (w, a, b) = neighbours([0, 1, 2], 6);
    let hurt = |id| w.unit(id).is_none_or(|u| u.hp < u.maxhp);
    assert!(hurt(a) || hurt(b), "enemies side by side fight");
}

#[test]
fn a_kill_counts_for_the_seat_that_made_it() {
    let mut w = three(22, [0, 1, 2]);
    let (bx, by) = w.map.bases[2];
    let (x, y) = ((bx as f64 + 2.0) * TILE, (by as f64 + 6.5) * TILE);
    let shooter = w.make_unit(UnitKind::Trooper, 2, x, y);
    let prey = w.make_unit(UnitKind::Harvester, 1, x + 60.0, y);
    w.attack_ent(shooter, prey);
    for _ in 0..30 * TPS {
        if w.unit(prey).is_none() {
            break;
        }
        w.step();
    }
    assert!(w.unit(prey).is_none(), "the harvester falls");
    assert_eq!(w.stats[2].killed, 1, "seat 2's kill");
    assert_eq!(
        w.stats[0].killed, 0,
        "not the seat that happens to be seat 1's old opponent"
    );
    assert_eq!(w.stats[1].lost, 1);
}

#[test]
fn the_last_team_standing_wins() {
    // Seats 0 and 2 against seat 1: seat 2 going down leaves its ally in the game; seat 1 going down ends it.
    let mut w = three(23, [0, 1, 0]);
    wipe(&mut w, 2);
    assert!(w.out[2], "seat 2 is out");
    assert!(!w.over, "its ally still stands: the game goes on");
    run(&mut w, 1);
    wipe(&mut w, 1);
    assert!(w.over);
    assert_eq!(
        w.winner, 0,
        "team 0 (seats 0 and 2) wins, its fallen seat too"
    );
    // Free for all: one seat down, two enemies still in.
    let mut w = three(23, [0, 1, 2]);
    wipe(&mut w, 0);
    assert!(w.out[0] && !w.over, "two enemies left");
    wipe(&mut w, 2);
    assert!(w.over);
    assert_eq!(w.winner, 1);
}

#[test]
fn a_seat_that_concedes_is_out_and_its_ally_plays_on() {
    let mut w = three(24, [0, 1, 0]);
    w.concede(0);
    assert!(w.out[0] && !w.over, "seat 2 still stands for team 0");
    assert_eq!(w.conceded, 0);
    w.concede(0); // (once out, again changes nothing)
    assert!(!w.over);
    w.concede(7); // (no such seat)
    assert!(!w.over);
    run(&mut w, 2); // (the game goes on)
    w.concede(2);
    assert!(w.over);
    assert_eq!(w.winner, 1, "team 1 is the last one standing");
    assert_eq!(w.conceded, 2);
}

#[test]
fn teams_are_set_up_once_per_seat_and_need_two_sides() {
    let mut w = World::new(25, 1);
    assert_eq!(w.seats(), 2);
    assert_eq!(w.teams, vec![0, 1], "each seat its own team");
    assert!(w.enemies(0, 1) && w.allies(0, 0));
    assert!(!w.set_teams(&[0, 0]), "one team: nobody to fight");
    assert!(!w.set_teams(&[0, 1, 1]), "a team per seat");
    assert!(!w.set_teams(&[0, 2]), "team ids below the number of seats");
    assert!(w.set_teams(&[1, 0]));
    assert!(w.enemies(0, 1));
}

#[test]
#[should_panic(expected = "3 seats on a map with 2 starts")]
fn a_map_without_a_start_for_every_seat_is_refused() {
    World::with_seats(26, 1, MapKind::Standard, 0, &[&HUMANS, &VAEL, &HUMANS]);
}

#[test]
fn the_seat_constructor_checks_its_setup_and_plays_two_seats_as_before() {
    let ok = |f: &[u32], t: &[u8], ai: &[u8], me: u8| {
        Game::with_seats(27, 1, 0, 0, f, t, ai, me, None).is_ok()
    };
    assert!(
        !ok(&[0, 1, 0], &[], &[], 0),
        "more seats than the map has starts"
    );
    assert!(!ok(&[0], &[], &[], 0), "one seat");
    assert!(!ok(&[0, 1], &[0, 0], &[], 0), "one team");
    assert!(!ok(&[0, 1], &[0], &[], 0), "a team list of another length");
    assert!(
        !ok(&[0, 1], &[], &[0, 1, 1], 0),
        "an AI list of another length"
    );
    assert!(!ok(&[0, 1], &[], &[], 2), "no such seat");
    // Two seats, the second an AI: the same game as the two-seat constructor.
    let mut a = Game::with_seats(27, 1, 0, 0, &[1, 0], &[0, 1], &[0, 1], 0, None).unwrap();
    let mut b = Game::with_setup(27, 1, 0, 0, 1, 0);
    for _ in 0..600 {
        a.step();
        b.step();
    }
    assert_eq!(a.state_hash(), b.state_hash());
    assert_eq!(a.world().ai_seats, vec![false, true]);
    // A game for seat 1 takes seat 1's orders, and reads a seat it does not have as nothing.
    let g = Game::with_seats(27, 1, 0, 0, &[0, 0], &[], &[], 1, None).unwrap();
    assert_eq!(g.me(), 1);
    assert!(g.army_log(5).is_empty() && g.vis(5).iter().all(|&v| v == 0));
    assert!(!g.can_afford(5, 0, 0));
    // On larger maps, as many seats as starts: 4 on 96x96, 8 on 128x128 (64, the default, has 2).
    let sized = |n: usize, size: u32| {
        Game::with_seats(27, 1, 0, 0, &vec![0; n], &[], &[], 0, Some(size)).is_ok()
    };
    assert!(sized(2, 64) && !sized(3, 64));
    assert!(sized(3, 96) && sized(4, 96) && !sized(5, 96));
    assert!(sized(2, 128) && sized(5, 128) && sized(8, 128) && !sized(9, 128));
    assert!(!sized(2, 80), "64, 96 or 128 tiles across");
    // Two seats on 64x64 by size: the same game as without one.
    let mut a = Game::with_seats(27, 1, 0, 1, &[1, 0], &[], &[0, 1], 0, Some(64)).unwrap();
    let mut b = Game::with_setup(27, 1, 0, 1, 1, 0);
    for _ in 0..300 {
        a.step();
        b.step();
    }
    assert_eq!(a.state_hash(), b.state_hash());
    // Four seats on 96x96, two teams, three of them AIs: each its start, its team and its record.
    let g = Game::with_seats(
        27,
        1,
        0,
        2,
        &[0, 1, 0, 1],
        &[0, 0, 1, 1],
        &[0, 1, 1, 1],
        3,
        Some(96),
    )
    .unwrap();
    let w = g.world();
    assert_eq!((w.seats(), w.map.w, g.me()), (4, 96, 3));
    assert_eq!(w.teams, vec![0, 0, 1, 1]);
    assert_eq!(w.ai_seats, vec![false, true, true, true]);
    assert_eq!(w.factions[1].hq, VAEL.hq);
    for s in 0..4u8 {
        assert_eq!(core(w, s), w.map.bases[s as usize], "seat {s} on its start");
    }
}

#[test]
fn every_seat_has_its_own_record_in_the_snapshot() {
    use endfall_sim::snapshot::{INFO_FIELDS, SEAT_FIELDS};
    let g = Game::with_setup(28, 1, 0, 0, 1, 0);
    let info = g.info();
    let at = |name: &str| INFO_FIELDS.iter().position(|f| *f == name).unwrap();
    let seat = |s: usize, name: &str| {
        info[INFO_FIELDS.len()
            + s * SEAT_FIELDS.len()
            + SEAT_FIELDS.iter().position(|f| *f == name).unwrap()]
    };
    assert_eq!(info[at("seats")], 2.0);
    assert_eq!(
        info.len(),
        INFO_FIELDS.len() + 2 * (SEAT_FIELDS.len() + UPGRADES.len())
    );
    assert_eq!(
        (seat(0, "faction"), seat(1, "faction")),
        (1.0, 0.0),
        "Vael, then Humans"
    );
    assert_eq!((seat(0, "team"), seat(1, "team")), (0.0, 1.0));
    assert_eq!(seat(1, "shards"), 50.0);
}

/// A game of AIs only, one per seat (Humans and Vael by turns), on a map of `n` x `n` tiles with a start for each.
fn ais(seed: u32, n: i32, seats: usize, teams: Option<&[u8]>) -> World {
    let races: Vec<&'static Faction> = (0..seats)
        .map(|s| if s % 2 == 0 { &HUMANS } else { &VAEL })
        .collect();
    let mut w = World::with_size(seed, 1, MapKind::Standard, MapSize::square(n), seed, &races);
    w.set_ai_seats(vec![true; seats]);
    if let Some(t) = teams {
        assert!(w.set_teams(t));
    }
    w
}

/// Count, for each pair of seats, the units of the first with something of the second as their target.
fn note_fights(w: &World, fights: &mut [[u32; MAX_SEATS]; MAX_SEATS]) {
    for u in &w.units {
        if let Task::Attack { target, .. } = u.task
            && let Some(t) = w.team_of(target)
            && t != u.team
        {
            fights[u.team as usize][t as usize] += 1;
        }
    }
}

#[test]
fn four_ais_fight_a_free_for_all_on_four_starts() {
    // M4: four AIs on 96x96, each its own team, for up to fifteen minutes (the world's invariants after every tick):
    // each fields an army and fights, partners first (seats 0 and 1, 2 and 3: their waves meet on the way, see
    // `foe`), and the game moves on: a seat is knocked out, or seats across the map from each other (0 and 2, 1 and
    // 3: seats sit round the map in order) fight.
    let seeds: &[u32] = if cfg!(debug_assertions) {
        &[13]
    } else {
        &[11, 12, 14] // (three seeds: this is the release suite's longest test)
    };
    for &seed in seeds {
        let mut w = ais(seed, 96, 4, None);
        let mut fights = [[0; MAX_SEATS]; MAX_SEATS];
        for tick in 0..30 * 60 * 15 {
            w.step();
            check_invariants(&w, &format!("seed {seed} tick {tick}"));
            if tick % 15 == 0 {
                note_fights(&w, &mut fights);
            }
            if w.over {
                break;
            }
        }
        let armies: Vec<u32> = w
            .army_log
            .iter()
            .map(|l| l.iter().max().copied().unwrap_or(0))
            .collect();
        for s in 0..4 {
            assert!(
                armies[s] >= 600 || w.out[s],
                "seed {seed} seat {s}: an army (or knocked out first): {armies:?}"
            );
            assert!(
                fights[s].iter().sum::<u32>() > 0,
                "seed {seed} seat {s} fought nobody: {fights:?}"
            );
        }
        assert!(
            armies.iter().any(|&a| a >= 2000),
            "seed {seed}: a big army: {armies:?}"
        );
        assert!(
            fights[0][1] > 0 && fights[1][0] > 0 && fights[2][3] > 0 && fights[3][2] > 0,
            "seed {seed}: partners fight: {fights:?}"
        );
        let across = fights[0][2] + fights[2][0] + fights[1][3] + fights[3][1];
        assert!(
            across > 0 || w.out.iter().any(|&o| o),
            "seed {seed}: the seats across the map never met and nobody is out: {fights:?}"
        );
    }
}

#[test]
fn two_against_two_allies_never_fight_and_one_team_stands() {
    // M4: a 2v2 of AIs on 96x96, allies on starts side by side (seats 0 and 1, 2 and 3: seats sit round the map in
    // order). Allies never target each other; the game ends with one team's seats all out and the other's winning.
    // (Without debug assertions, three games to the end, at most forty minutes; with them, one, invariants every
    // tenth tick.)
    let full = !cfg!(debug_assertions);
    let seeds: &[u32] = if full { &[11, 12, 13] } else { &[13] };
    for &seed in seeds {
        let mut w = ais(seed, 96, 4, Some(&[0, 0, 1, 1]));
        let mut fights = [[0; MAX_SEATS]; MAX_SEATS];
        let cap = 30 * 60 * if full { 40 } else { 15 };
        for tick in 0..cap {
            w.step();
            if full || tick % 10 == 0 {
                check_invariants(&w, &format!("seed {seed} tick {tick}"));
            }
            if tick % 15 == 0 {
                note_fights(&w, &mut fights);
            }
            if w.over {
                break;
            }
        }
        assert_eq!(
            (fights[0][1], fights[1][0], fights[2][3], fights[3][2]),
            (0, 0, 0, 0),
            "seed {seed}: allies left each other alone"
        );
        assert!(w.over, "seed {seed}: over within the cap");
        // Every seat of the losing team is out; the winners have a seat still in (an ally may have fallen on the way).
        let won = w.winner as u8;
        for s in 0..4 {
            assert!(
                w.teams[s] == won || w.out[s],
                "seed {seed}: seat {s} of the losing team {} is out (team {won} won)",
                w.teams[s]
            );
        }
        assert!(
            (0..4).any(|s| w.teams[s] == won && !w.out[s]),
            "seed {seed}: a winner stands"
        );
        for s in 0..4 {
            assert!(
                w.stats[s].killed > 0 || w.out[s],
                "seed {seed} seat {s} did not fight"
            );
        }
    }
}

#[test]
fn six_and_eight_ais_play_on_eight_starts() {
    // M4: 128x128 with six and with eight AIs (each its own team) under the invariants: every seat builds up from its
    // own start in the first three minutes, and most are fighting by the end.
    let mins = if cfg!(debug_assertions) { 4 } else { 7 };
    for (seed, seats) in [(21u32, 6usize), (22, 8)] {
        let mut w = ais(seed, 128, seats, None);
        let mut fights = [[0; MAX_SEATS]; MAX_SEATS];
        for tick in 0..30 * 60 * mins {
            w.step();
            check_invariants(&w, &format!("{seats} seats seed {seed} tick {tick}"));
            if tick % 15 == 0 {
                note_fights(&w, &mut fights);
            }
            if tick == 30 * 60 * 3 {
                for s in 0..seats as u8 {
                    let (bx, by) = w.map.bases[s as usize];
                    let near = w
                        .bldgs
                        .iter()
                        .filter(|b| b.team == s && (b.tx - bx).abs().max((b.ty - by).abs()) < 16)
                        .count();
                    assert!(
                        near >= 5,
                        "{seats} seats seed {seed}: seat {s} built up ({near})"
                    );
                }
            }
        }
        let fighting = (0..seats)
            .filter(|&s| fights[s].iter().sum::<u32>() > 0)
            .count();
        assert!(fighting * 2 >= seats, "{seats} seats: {fights:?}");
    }
}

#[test]
fn a_seat_that_is_out_gives_no_orders_and_what_it_leaves_is_inert() {
    // Seats 0 and 2 against seat 1. Seat 0 concedes while its ally plays on: its orders are refused (it cannot fight
    // on for its ally), its units stop where they are (a miner lets go of its crystal) and do nothing more, its
    // buildings train nothing; an enemy can still destroy them. The same game twice is the same game.
    let play = || {
        let mut w = three(31, [0, 1, 0]);
        w.res[0] = [1000, 0];
        let core0 = w
            .bldgs
            .iter()
            .find(|b| b.team == 0 && b.kind.def().hq)
            .unwrap()
            .id;
        w.queue_unit(core0, UnitKind::Harvester).unwrap();
        run(&mut w, 2);
        let (bx, by) = w.map.bases[0];
        let (x, y) = ((bx as f64 + 2.0) * TILE, (by as f64 + 8.5) * TILE);
        let guard = w.make_unit(UnitKind::Trooper, 0, x, y);
        let raider = w.make_unit(UnitKind::Trooper, 1, x + 200.0, y);
        let miner = harvesters(&w, 0)[0];
        assert!(matches!(w.unit(miner).unwrap().task, Task::Gather { .. }));
        let mined: i32 = w.map.nodes.iter().map(|n| n.miners).sum();
        w.concede(0);
        assert!(w.out[0] && !w.over, "its ally plays on");
        assert!(w.inert(0) && !w.inert(2));
        // Its orders are refused, whatever they are.
        let before = (w.unit(guard).unwrap().x, w.unit(guard).unwrap().y);
        assert!(
            w.apply(
                0,
                &Command::Move {
                    unit: guard,
                    x: 100.0,
                    y: 100.0
                }
            )
            .is_err()
        );
        assert!(
            w.apply(
                0,
                &Command::Queue {
                    bldg: core0,
                    kind: UnitKind::Harvester
                }
            )
            .is_err()
        );
        // Its units stopped; its miner let go of its crystal.
        assert!(
            w.units
                .iter()
                .filter(|u| u.team == 0)
                .all(|u| u.task == Task::Idle),
            "every unit of the seat out stopped"
        );
        assert!(
            w.map.nodes.iter().map(|n| n.miners).sum::<i32>() < mined,
            "the miner let go"
        );
        let (shards, queue, prog) = {
            let c = w.bldg(core0).unwrap();
            (w.res[0][0], c.queue.len(), c.prog)
        };
        // An enemy trooper walks up to its trooper: it does not fire back (nor move), and falls.
        w.attack_ent(raider, guard);
        run(&mut w, 20);
        assert!(w.unit(guard).is_none(), "an inert unit can be destroyed");
        assert_eq!(
            w.unit(raider).unwrap().hp,
            w.unit(raider).unwrap().maxhp,
            "it never fired back"
        );
        let u = w.unit(miner).unwrap();
        assert_eq!(u.task, Task::Idle, "the miner stays idle");
        let c = w.bldg(core0).unwrap();
        assert_eq!(
            (w.res[0][0], c.queue.len(), c.prog),
            (shards, queue, prog),
            "nothing mined, nothing trained"
        );
        assert_ne!(before, (100.0, 100.0));
        w.state_hash()
    };
    assert_eq!(play(), play(), "deterministic");
}

#[test]
fn teams_are_in_the_state_hash_only_when_not_each_its_own() {
    // The goldens (each seat its own team) hash as before; alliances are part of the world every client must agree on.
    let a = World::new(41, 1);
    let mut b = World::new(41, 1);
    assert!(b.set_teams(&[0, 1]));
    assert_eq!(a.state_hash(), b.state_hash(), "the default: not hashed");
    assert!(b.set_teams(&[1, 0]));
    assert_ne!(a.state_hash(), b.state_hash(), "other teams: hashed");
    let four = |teams: Option<&[u8]>| {
        let mut w = ais(42, 96, 4, teams);
        w.step();
        w.state_hash()
    };
    assert_eq!(four(None), four(Some(&[0, 1, 2, 3])));
    assert_ne!(four(None), four(Some(&[0, 0, 1, 1])));
    assert_ne!(four(Some(&[0, 0, 1, 1])), four(Some(&[0, 1, 1, 0])));
}

/// A game through the WASM surface's constructor (as the menus start one), run to its end (or `mins` minutes): the
/// seats out, and the winner.
fn to_the_end(seed: u32, factions: &[u32], teams: &[u8], ai: &[u8], mins: u32) -> Game {
    let mut g = Game::with_seats(seed, 1, 0, seed, factions, teams, ai, 0, Some(96)).unwrap();
    for tick in 0..30 * 60 * mins {
        g.step();
        if tick % 30 == 0 {
            check_invariants(g.world(), &format!("seed {seed} tick {tick}"));
        }
        if g.world().over {
            break;
        }
    }
    g
}

/// The game is over, every seat not on the winning team is out, and a seat of the winning team stands.
fn ended_well(g: &Game, what: &str) {
    let w = g.world();
    assert!(w.over, "{what}: over");
    let won = w.winner;
    assert!(won >= 0, "{what}: a winner");
    for s in 0..w.seats() {
        assert!(
            w.teams[s] as i32 == won || w.out[s],
            "{what}: seat {s} lost and is out"
        );
    }
    assert!(
        (0..w.seats()).any(|s| w.teams[s] as i32 == won && !w.out[s]),
        "{what}: a winner stands"
    );
}

#[test]
fn three_and_four_seat_games_and_two_against_two_end_through_the_menus_constructor() {
    // M4 step 2c: what the menus start, through `Game.withSeats` on 96x96. Three seats (a person who gives no order,
    // and two AIs: the person is out first, and inert, and the AIs fight on to one standing); four AIs free for all;
    // and a person with an AI ally against two AIs. Each ends with one team standing.
    let mins = 45; // (the free for all of seed 52 lasts 36 minutes: two seats left fight it out)
    let g = to_the_end(51, &[0, 1, 0], &[], &[0, 1, 1], mins);
    ended_well(&g, "three seats");
    assert!(g.world().out[0], "the idle person is out");
    let g = to_the_end(52, &[0, 1, 0, 1], &[], &[1, 1, 1, 1], mins);
    ended_well(&g, "four free for all");
    assert_eq!(
        g.world().out.iter().filter(|&&o| o).count(),
        3,
        "three out, one standing"
    );
    let g = to_the_end(53, &[0, 1, 0, 1], &[0, 0, 1, 1], &[0, 1, 1, 1], mins);
    ended_well(&g, "two against two");
}
