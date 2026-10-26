//! Seats and teams: allies never fight, kills count for the killer's seat, a seat that is out leaves the game to the
//! rest, and the last team standing wins. Generated maps have two starts, so a third seat gets its start from the
//! test (`World::add_seat`) on open ground away from the other two.

use crate::common::*;

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
    World::with_seats(26, 1, MapKind::Standard, false, &[&HUMANS, &VAEL, &HUMANS]);
}

#[test]
fn the_seat_constructor_checks_its_setup_and_plays_two_seats_as_before() {
    let ok = |f: &[u32], t: &[u8], ai: &[u8], me: u8| {
        Game::with_seats(27, 1, 0, 0, f, t, ai, me).is_ok()
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
    let mut a = Game::with_seats(27, 1, 0, 0, &[1, 0], &[0, 1], &[0, 1], 0).unwrap();
    let mut b = Game::with_setup(27, 1, 0, 0, 1, 0);
    for _ in 0..600 {
        a.step();
        b.step();
    }
    assert_eq!(a.state_hash(), b.state_hash());
    assert_eq!(a.world().ai_seats, vec![false, true]);
    // A game for seat 1 takes seat 1's orders, and reads a seat it does not have as nothing.
    let g = Game::with_seats(27, 1, 0, 0, &[0, 0], &[], &[], 1).unwrap();
    assert_eq!(g.me(), 1);
    assert!(g.army_log(5).is_empty() && g.vis(5).iter().all(|&v| v == 0));
    assert!(!g.can_afford(5, 0, 0));
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
