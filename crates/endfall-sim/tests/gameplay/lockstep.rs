//! Lockstep (docs/MULTIPLAYER.md): two clients, one per seat, and a relay, in one process. The relay closes a turn
//! (3 ticks) on its own clock, puts the orders it has into the turn `DELAY` ahead (seats in a different order in the
//! bundle every other turn), and sends the bundle to both clients, each after its own random delay (so bundles may
//! arrive out of order: a client takes them in turn order, as the network layer will). Both play with armies and
//! money, giving random orders through the same Game API the browser uses. Every client must run exactly the orders
//! each seat sent, on the right tick, in the right order, and every world must be the same on every tick; a third
//! client rebuilt from the bundles at the end must be the same too.

use super::common::*;
use endfall_sim::world::Command;
use std::collections::BTreeMap;

const TURN: u32 = 3;
const DELAY: u32 = 2;

type Bundle = Vec<(u8, Vec<f64>)>;

struct Client {
    g: Game,
    /// Bundles on their way: turn -> (the relay turn it arrives at, the bundle).
    wire: BTreeMap<u32, (u32, Bundle)>,
    hashes: Vec<(u32, u32)>,
}

/// The same game on every client: Humans against the Vael, both with money and a small army each, in mid-map.
fn client(seed: u32, me: u8) -> Game {
    let mut g = Game::with_seats(seed, 1, 0, 0, &[0, 1], &[], &[], me, None).unwrap();
    for t in 0..2u8 {
        g.set_resources(t, 3000, 1500);
        for i in 0..6 {
            let kind = if t == 0 { "trooper" } else { "scythe" };
            g.debug_spawn(t, kind, 900.0 + t as f64 * 220.0, 900.0 + i as f64 * 30.0);
        }
    }
    g.start_lockstep();
    g
}

/// Feed a bundle to a game (the network layer's job).
fn feed(g: &mut Game, turn: u32, bundle: &Bundle) -> bool {
    let seats: Vec<u8> = bundle.iter().map(|b| b.0).collect();
    let lens: Vec<u32> = bundle.iter().map(|b| b.1.len() as u32).collect();
    let words: Vec<f64> = bundle.iter().flat_map(|b| b.1.iter().copied()).collect();
    g.receive_turn(turn, &seats, &lens, &words)
}

impl Client {
    /// Take every bundle that has arrived, in turn order (one that came early waits for the gap before it).
    fn receive(&mut self, now: u32) {
        loop {
            let next = self.g.next_turn();
            match self.wire.get(&next) {
                Some((at, _)) if *at <= now => {
                    let (_, bundle) = self.wire.remove(&next).unwrap();
                    assert!(feed(&mut self.g, next, &bundle));
                }
                _ => break,
            }
        }
    }
    fn run(&mut self) {
        while self.g.can_step() {
            self.g.step();
            self.hashes
                .push((self.g.tick(), self.g.world().state_hash()));
        }
    }
}

/// An order for this seat's own things (random orders mostly name things that are not its own).
fn own_order(g: &mut Game, me: u8, r: &mut Mulberry32) {
    let w = g.world();
    let units: Vec<u32> = w
        .units
        .iter()
        .filter(|u| u.team == me)
        .map(|u| u.id)
        .collect();
    let bldgs: Vec<u32> = w
        .bldgs
        .iter()
        .filter(|b| b.team == me)
        .map(|b| b.id)
        .collect();
    let (x, y) = (300.0 + r.below(1400) as f64, 300.0 + r.below(1400) as f64);
    match r.below(4) {
        0 if !units.is_empty() => g.attack_move_group(&units, x, y),
        1 if !bldgs.is_empty() => {
            let b = bldgs[r.below(bldgs.len() as u32) as usize];
            let kind = UNIT_KINDS[r.below(UNIT_KINDS.len() as u32) as usize]
                .def()
                .key;
            let _ = g.queue_unit(b, kind);
        }
        2 if !units.is_empty() => {
            let kind = BLDG_KINDS[r.below(BLDG_KINDS.len() as u32) as usize]
                .def()
                .key;
            let _ = g.place_building(me, kind, (x / TILE) as i32, (y / TILE) as i32, units[0]);
        }
        _ if !units.is_empty() => g.formation(&units[..units.len().min(4)], x, y),
        _ => {}
    }
}

#[test]
fn two_clients_through_a_relay_run_exactly_what_was_sent_on_every_tick() {
    for seed in [3u32, 4242] {
        let mut cs: Vec<Client> = (0..2u8)
            .map(|me| Client {
                g: client(seed, me),
                wire: BTreeMap::new(),
                hashes: Vec::new(),
            })
            .collect();
        let mut net = Mulberry32::new(seed ^ 0x5eed);
        let mut orders = [Mulberry32::new(seed), Mulberry32::new(seed + 1)];
        let mut sent: Vec<(u32, Bundle)> = Vec::new(); // every bundle the relay sent
        for turn in 0..DELAY {
            sent.push((turn, Vec::new()));
            for c in cs.iter_mut() {
                c.wire.insert(turn, (0, Vec::new()));
            }
        }
        let turns = 30 * 120 / TURN; // two minutes
        for t in 0..turns {
            for (i, c) in cs.iter_mut().enumerate() {
                c.receive(t);
                c.run();
                if orders[i].below(2) == 0 {
                    random_order_with(&mut c.g, &mut orders[i], false);
                    own_order(&mut c.g, i as u8, &mut orders[i]);
                }
            }
            // The relay closes turn t: the orders it has go into turn t + DELAY, seats in either order, to each
            // client after its own lag (0-5 turns: bundles overtake each other).
            let mut bundle: Bundle = cs
                .iter_mut()
                .enumerate()
                .map(|(seat, c)| (seat as u8, c.g.take_orders()))
                .filter(|(_, w)| !w.is_empty())
                .collect();
            if t % 2 == 1 {
                bundle.reverse();
            }
            for c in cs.iter_mut() {
                c.wire.insert(t + DELAY, (t + net.below(6), bundle.clone()));
            }
            sent.push((t + DELAY, bundle));
        }
        for c in cs.iter_mut() {
            c.receive(u32::MAX);
            c.run();
        }
        // Exactly what each seat sent ran, on its turn's first tick, seat by seat, in the order sent.
        let mut expected = Vec::new();
        for (turn, b) in &sent {
            let mut b = b.clone();
            b.sort_by_key(|e| e.0);
            for (seat, words) in b {
                for cmd in Command::decode_all(&words) {
                    expected.push((turn * TURN, seat, cmd));
                }
            }
        }
        assert!(expected.iter().any(|e| e.1 == 0) && expected.iter().any(|e| e.1 == 1));
        assert!(
            expected.len() > 200,
            "seed {seed}: orders from both seats ({})",
            expected.len()
        );
        for c in &cs {
            let log = c.g.world().log.clone().unwrap_or_default();
            assert_eq!(
                log, expected,
                "seed {seed}: the orders sent, each on its tick, in order"
            );
        }
        assert_eq!(
            cs[0].g.tick(),
            cs[1].g.tick(),
            "seed {seed}: both ran to the same tick"
        );
        assert_eq!(
            cs[0].g.tick(),
            (turns + DELAY) * TURN,
            "seed {seed}: every turn ran"
        );
        assert_eq!(
            cs[0].hashes, cs[1].hashes,
            "seed {seed}: the same world on every tick"
        );
        let w = cs[0].g.world();
        assert!(
            w.stats.iter().map(|s| s.built + s.killed).sum::<u32>() > 0,
            "seed {seed}: something was trained or fought: {:?}",
            w.stats
        );
        // A third client, seat 1's, rebuilt from every bundle at the end (a rejoin): the same world.
        let mut late = client(seed, 1);
        for (turn, b) in &sent {
            assert!(feed(&mut late, *turn, b));
        }
        assert_eq!(late.run_to(u32::MAX), cs[0].g.tick());
        assert_eq!(
            late.world().state_hash(),
            cs[0].g.world().state_hash(),
            "seed {seed}: rejoined"
        );
    }
}

#[test]
fn turns_come_in_order_no_tick_runs_before_its_turn_and_the_knobs_are_refused() {
    let mut g = Game::with_seats(5, 1, 0, 0, &[0, 0], &[], &[], 1, None).unwrap();
    g.start_lockstep();
    assert!(!g.can_step(), "nothing allowed yet");
    g.step();
    assert_eq!(g.tick(), 0, "a step it may not take is not taken");
    // An order goes out, not in: the world does not change until it comes back.
    let h = g.world().units.iter().find(|u| u.team == 1).unwrap().id;
    g.move_to(h, 100.0, 100.0);
    g.move_to(h, f64::NAN, 100.0); // (refused: it would arrive as 0)
    let out = g.take_orders();
    assert_eq!(
        Command::decode_all(&out).len(),
        1,
        "one order out, the bad one refused"
    );
    assert!(g.take_orders().is_empty(), "taken once");
    assert!(
        g.world().log.as_ref().unwrap().is_empty(),
        "not applied yet"
    );
    assert!(
        !g.receive_turn(1, &[], &[], &[]),
        "a turn that skips ahead is refused"
    );
    assert!(g.receive_turn(0, &[1], &[out.len() as u32], &out));
    assert!(
        !g.receive_turn(0, &[1], &[out.len() as u32], &out),
        "a duplicate is refused"
    );
    assert_eq!(g.next_turn(), 1);
    assert_eq!(g.run_to(100), 3, "it runs as far as its turns allow");
    assert_eq!(
        g.world().log.as_ref().unwrap().len(),
        1,
        "applied once, on its tick"
    );
    // The knobs outside the log are refused.
    let n = g.world().units.len();
    assert_eq!(g.debug_spawn(1, "trooper", 300.0, 300.0), 0);
    g.set_resources(1, 9999, 9999);
    assert_eq!(g.world().units.len(), n);
    assert!(g.world().res[1][0] < 9999);
    assert!(!g.start_replay());
    // A malformed bundle runs nothing from its first bad command on, and the game goes on.
    assert!(g.receive_turn(1, &[1], &[2], &[999.0, 1.0]));
    g.run_to(6);
    assert_eq!(g.tick(), 6);
    assert_eq!(g.world().log.as_ref().unwrap().len(), 1);
}

#[test]
fn ai_seats_play_alike_in_every_clients_game() {
    // M4: a room's seats the AI plays have no client: every client runs them in its own game, from the same setup (the
    // AI seats, the teams). Two people and an AI free for all, then two people with two AIs two against two: both
    // clients' worlds agree on every tick while both send orders, and the AI builds up.
    let setups: [(&[u32], &[u8], &[u8]); 2] = [
        (&[0, 1, 1], &[], &[0, 0, 1]),
        (&[0, 1, 0, 1], &[0, 0, 1, 1], &[0, 0, 1, 1]),
    ];
    for (factions, teams, ai) in setups {
        let mut gs: Vec<Game> = (0..2u8)
            .map(|me| {
                let mut g =
                    Game::with_seats(77, 2, 0, 9, factions, teams, ai, me, Some(96)).unwrap();
                g.start_lockstep();
                g
            })
            .collect();
        let mut r = [Mulberry32::new(1), Mulberry32::new(2)];
        for turn in 0..1200u32 {
            let mut bundle: Bundle = Vec::new();
            for (me, g) in gs.iter_mut().enumerate() {
                if turn % 20 == 0 {
                    own_order(g, me as u8, &mut r[me]);
                }
                let w = g.take_orders();
                if !w.is_empty() {
                    bundle.push((me as u8, w));
                }
            }
            for g in gs.iter_mut() {
                assert!(feed(g, turn, &bundle));
                while g.can_step() {
                    g.step();
                }
            }
            assert_eq!(
                gs[0].state_hash(),
                gs[1].state_hash(),
                "{} seats: the same world at turn {turn}",
                factions.len()
            );
        }
        let w = gs[0].world();
        let ai_seat = ai.iter().position(|&a| a == 1).unwrap() as u8;
        assert!(
            w.bldgs.iter().filter(|b| b.team == ai_seat).count() >= 4,
            "{} seats: the AI seat {ai_seat} built up",
            factions.len()
        );
        assert_eq!(w.teams.len(), factions.len());
    }
}
