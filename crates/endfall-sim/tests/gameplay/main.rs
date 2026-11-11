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
mod guided;
mod jitter;
mod lockstep;
mod maps;
mod mines;
mod orders;
mod paths;
mod peoples;
mod radio;
mod random_play;
mod seats;
mod shore;
mod siege;
mod tide;
mod vision;
mod water;
