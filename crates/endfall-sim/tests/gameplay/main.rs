//! Gameplay tests: the whole tech tree can be built and trained, construction can be interrupted and resumed,
//! ether can be mined, supply and refunds behave, turrets defend, and a long randomized run (random orders,
//! including stale and nonsense ids, across many seeds) never breaks the world's invariants.

mod abilities;
mod ai;
mod balance;
mod combat;
mod common;
mod construction;
mod economy;
mod maps;
mod orders;
mod random_play;
