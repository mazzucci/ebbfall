//! Random orders (stale and nonsense ids too) across many seeds never break the world's invariants.

use super::common::*;

// One test per difficulty, so the three run in parallel.
#[test]
fn random_play_never_breaks_the_world_easy() {
    random_play(0);
}
#[test]
fn random_play_never_breaks_the_world_medium() {
    random_play(1);
}
#[test]
fn random_play_never_breaks_the_world_hard() {
    random_play(2);
}

fn random_play(diff: u32) {
    let seeds: u32 = if cfg!(debug_assertions) { 6 } else { 24 };
    for seed in 0..seeds {
        {
            let mut g = Game::new(seed * 7919 + 1, diff);
            let mut r = Mulberry32::new(seed ^ 0xabcdef);
            for tick in 0..30 * 60 * 6 {
                if tick % 7 == 0 {
                    for _ in 0..1 + r.below(3) {
                        random_order(&mut g, &mut r);
                    }
                }
                g.step();
                check_invariants(g.world(), &format!("seed {seed} diff {diff} tick {tick}"));
                if g.world().over {
                    break;
                }
            }
        }
    }
}

#[test]
fn a_recorded_game_replays_to_the_same_state() {
    // Random orders through the Game API (stale and nonsense ids too) are logged with their tick; the log applied
    // to a fresh world gives the same state hash on every tick: the basis of lockstep multiplayer and replays.
    use endfall_sim::world::Command;
    for seed in [3u32, 11, 4242] {
        let mut g = Game::new(seed, 1);
        g.record(true);
        let mut r = Mulberry32::new(seed ^ 0x5eed);
        let mut hashes = Vec::new();
        for tick in 0..30 * 120 {
            if tick % 5 == 0 {
                for _ in 0..1 + r.below(3) {
                    random_order_with(&mut g, &mut r, false);
                }
            }
            g.step();
            hashes.push(g.world().state_hash());
        }
        let log = g.world().log.clone().expect("recording");
        assert!(
            log.len() > 50,
            "seed {seed}: orders were logged ({})",
            log.len()
        );
        let mut w = World::new(seed, 1);
        let mut next = 0;
        for (i, want) in hashes.iter().enumerate() {
            while next < log.len() && log[next].0 == w.tick {
                let (_, seat, ref cmd) = log[next];
                let _ = w.apply(seat, cmd);
                next += 1;
            }
            w.step();
            assert_eq!(
                w.state_hash(),
                *want,
                "seed {seed}: the replay diverged at tick {}",
                i + 1
            );
        }
        // A seat cannot order the other seat's units.
        let foe = w.units.iter().find(|u| u.team == ENEMY).map(|u| u.id);
        if let Some(id) = foe {
            let _ = w.apply(
                PLAYER,
                &Command::Move {
                    unit: id,
                    x: 100.0,
                    y: 100.0,
                },
            );
            assert!(
                !matches!(w.unit(id).unwrap().task, Task::Move { .. }),
                "an order for the other side is ignored"
            );
        }
    }
}
