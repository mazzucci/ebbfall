//! Lockstep (docs/MULTIPLAYER.md): two clients, one per seat, and a relay, in one process. The relay closes a turn
//! (3 ticks) on its own clock, stamps the orders it has into the turn `DELAY` ahead, and sends the bundle to both
//! clients, each after its own random delay (in order). Both give random orders through the same Game API the
//! browser uses. Their worlds must be the same on every tick.

use super::common::*;
use std::collections::VecDeque;

const TURN: u32 = 3;
const DELAY: u32 = 2;

type Bundle = Vec<(u8, Vec<f64>)>;

struct Client {
    g: Game,
    /// Bundles on their way: (turn the relay sent it on + this client's lag, the turn it is for, the bundle).
    wire: VecDeque<(u32, u32, Bundle)>,
    hashes: Vec<(u32, u32)>,
}

impl Client {
    fn receive(&mut self, now: u32) {
        while let Some((at, turn, _)) = self.wire.front()
            && *at <= now
        {
            let turn = *turn;
            let (_, _, bundle) = self.wire.pop_front().unwrap();
            for (seat, words) in bundle {
                self.g.schedule(turn * TURN, seat, &words);
            }
            self.g.allow_until((turn + 1) * TURN);
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

#[test]
fn two_clients_through_a_relay_stay_in_step() {
    for seed in [3u32, 4242] {
        let mut cs: Vec<Client> = (0..2u8)
            .map(|me| {
                let mut g = Game::for_seat(seed, 0, 0, 0, 1, me); // (Humans against the Vael)
                g.start_lockstep();
                Client {
                    g,
                    wire: VecDeque::new(),
                    hashes: Vec::new(),
                }
            })
            .collect();
        let mut net = Mulberry32::new(seed ^ 0x5eed);
        let mut orders = [Mulberry32::new(seed), Mulberry32::new(seed + 1)];
        // The first DELAY turns can have no orders: their bundles are empty.
        for c in cs.iter_mut() {
            for turn in 0..DELAY {
                c.wire.push_back((0, turn, Vec::new()));
            }
        }
        let turns = 30 * 120 / TURN; // two minutes
        for t in 0..turns {
            // Each client: whatever has arrived, as far as it may run, a few random orders now and then.
            for (i, c) in cs.iter_mut().enumerate() {
                c.receive(t);
                c.run();
                if orders[i].below(3) == 0 {
                    for _ in 0..1 + orders[i].below(3) {
                        random_order_with(&mut c.g, &mut orders[i], false);
                    }
                }
            }
            // The relay closes turn t: the orders it has go into turn t + DELAY, to everyone, each with its own lag.
            let bundle: Bundle = cs
                .iter_mut()
                .enumerate()
                .map(|(seat, c)| (seat as u8, c.g.take_orders()))
                .filter(|(_, w)| !w.is_empty())
                .collect();
            for c in cs.iter_mut() {
                let last = c.wire.back().map_or(0, |b| b.0);
                let lag = net.below(4); // (0-3 turns: up to 300 ms of jitter)
                c.wire
                    .push_back(((t + lag).max(last), t + DELAY, bundle.clone()));
            }
        }
        for c in cs.iter_mut() {
            c.receive(u32::MAX);
            c.run();
        }
        assert!(
            cs[0].g.tick() > 30 * 100,
            "seed {seed}: the game ran ({})",
            cs[0].g.tick()
        );
        assert_eq!(
            cs[0].g.tick(),
            cs[1].g.tick(),
            "seed {seed}: both ran to the same tick"
        );
        assert_eq!(
            cs[0].hashes, cs[1].hashes,
            "seed {seed}: the same world on every tick"
        );
        let log = |c: &Client| c.g.world().log.clone().unwrap_or_default();
        assert!(
            log(&cs[0]).len() > 100,
            "seed {seed}: orders from both were played"
        );
        assert!(log(&cs[0]).iter().any(|e| e.1 == 0) && log(&cs[0]).iter().any(|e| e.1 == 1));
        assert_eq!(log(&cs[0]), log(&cs[1]), "seed {seed}: the same log");
    }
}

#[test]
fn a_lockstep_game_runs_no_tick_before_its_orders_are_in_and_refuses_the_knobs() {
    let mut g = Game::for_seat(5, 0, 0, 0, 0, 1);
    g.start_lockstep();
    assert!(!g.can_step(), "nothing allowed yet");
    g.step();
    assert_eq!(g.tick(), 0, "a step it may not take is not taken");
    // An order goes out, not in: the world does not change until it comes back.
    let h = g.world().units.iter().find(|u| u.team == 1).unwrap().id;
    g.move_to(h, 100.0, 100.0);
    let out = g.take_orders();
    assert!(!out.is_empty() && g.take_orders().is_empty(), "taken once");
    assert!(
        g.world().log.as_ref().unwrap().is_empty(),
        "not applied yet"
    );
    g.schedule(0, 1, &out);
    g.allow_until(3);
    assert_eq!(g.run_to(100), 3, "it runs as far as it may");
    assert_eq!(
        g.world().log.as_ref().unwrap().len(),
        1,
        "applied on its tick"
    );
    // The knobs outside the log are refused.
    let n = g.world().units.len();
    assert_eq!(g.debug_spawn(1, "trooper", 300.0, 300.0), 0);
    g.set_resources(1, 9999, 9999);
    assert_eq!(g.world().units.len(), n);
    assert!(g.world().res[1][0] < 9999);
    assert!(!g.start_replay());
    // A malformed bundle is dropped, and an order for a tick already run is ignored.
    g.schedule(3, 1, &[999.0, 1.0]);
    g.schedule(0, 1, &out);
    g.allow_until(6);
    g.run_to(6);
    assert_eq!(g.world().log.as_ref().unwrap().len(), 1);
}
