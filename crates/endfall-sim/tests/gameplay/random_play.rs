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
