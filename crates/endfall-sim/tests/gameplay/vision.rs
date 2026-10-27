//! Shared vision: allies see, explore and detect together (a seat's fog is its own sight and its allies'); a free for
//! all and a duel see as before; a seat that is out still lends the sight of what it left, while that stands.

use super::common::*;

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
