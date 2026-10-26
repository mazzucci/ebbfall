//! Lockstep (docs/MULTIPLAYER.md): in a networked game a `Game` does not apply its player's orders at once. It
//! encodes them into an outbox for the network to send; every seat's orders come back (decoded from the relay's
//! bundle, its own included) through `schedule`, each with the tick it runs on, and a tick runs only once the relay
//! has said every seat's orders for it are in (`allow_until`). Every client applies the same orders on the same ticks
//! in the same order (tick, seat, arrival), so every world stays the same.

use crate::world::Command;
use crate::{Game, valid_team};
use wasm_bindgen::prelude::*;

#[derive(Default)]
pub(crate) struct Lockstep {
    /// This player's orders, encoded, not yet taken by the network.
    outbox: Vec<f64>,
    /// Orders to run: (tick, seat, arrival number, command), kept in the order they will run.
    due: Vec<(u32, u8, u32, Command)>,
    arrivals: u32,
    /// Ticks below this may run: every seat's orders for them are in.
    until: u32,
}

impl Game {
    /// In lockstep: an order goes to the outbox (it runs when the relay sends it back). Returns whether it did.
    pub(crate) fn send(&mut self, cmd: &Command) -> bool {
        match &mut self.lock {
            Some(l) => {
                l.outbox.extend(cmd.encode());
                true
            }
            None => false,
        }
    }

    /// Run the orders due on this tick (their errors go to their seat as a toast: the order was sent a turn ago).
    pub(crate) fn run_due(&mut self) {
        let tick = self.w.tick;
        let Some(l) = &mut self.lock else { return };
        let n = l.due.iter().take_while(|d| d.0 <= tick).count();
        let now: Vec<(u32, u8, u32, Command)> = l.due.drain(..n).collect();
        for (_, seat, _, cmd) in now {
            if let Err(msg) = self.w.apply(seat, &cmd) {
                self.w.toast(seat, msg, true);
            }
        }
    }
}

#[wasm_bindgen]
impl Game {
    /// Play in lockstep from now on (a networked game): orders go out, not in, until the relay sends them back.
    #[wasm_bindgen(js_name = startLockstep)]
    pub fn start_lockstep(&mut self) {
        self.lock = Some(Lockstep::default());
    }

    /// Whether this game is played in lockstep.
    #[wasm_bindgen(js_name = isLockstep)]
    pub fn is_lockstep(&self) -> bool {
        self.lock.is_some()
    }

    /// This player's orders since the last call, encoded (the network sends them as they are).
    #[wasm_bindgen(js_name = takeOrders)]
    pub fn take_orders(&mut self) -> Vec<f64> {
        self.lock
            .as_mut()
            .map_or_else(Vec::new, |l| std::mem::take(&mut l.outbox))
    }

    /// Orders from the relay: `seat`'s, encoded, to run on `tick`. Anything malformed is dropped (from the first bad
    /// command on), as is a tick already run (it cannot happen with a well-behaved relay).
    pub fn schedule(&mut self, tick: u32, seat: u8, words: &[f64]) {
        let now = self.w.tick;
        let (Some(l), Some(seat)) = (&mut self.lock, valid_team(seat)) else {
            return;
        };
        if tick < now {
            return;
        }
        for cmd in Command::decode_all(words) {
            l.arrivals += 1;
            let entry = (tick, seat, l.arrivals, cmd);
            let at = l
                .due
                .iter()
                .position(|d| (d.0, d.1, d.2) > (entry.0, entry.1, entry.2))
                .unwrap_or(l.due.len());
            l.due.insert(at, entry);
        }
    }

    /// Ticks below `tick` may run: the relay has every seat's orders for them.
    #[wasm_bindgen(js_name = allowUntil)]
    pub fn allow_until(&mut self, tick: u32) {
        if let Some(l) = &mut self.lock {
            l.until = l.until.max(tick);
        }
    }

    /// Whether the next tick may run now (always, outside lockstep).
    #[wasm_bindgen(js_name = canStep)]
    pub fn can_step(&self) -> bool {
        self.lock.as_ref().is_none_or(|l| self.w.tick < l.until)
    }

    /// Run every tick that may run, up to `tick` (catching up, or rebuilding a game from its log, without the client's
    /// per-tick work). Returns the tick reached.
    #[wasm_bindgen(js_name = runTo)]
    pub fn run_to(&mut self, tick: u32) -> u32 {
        while self.w.tick < tick && self.can_step() {
            self.step();
        }
        self.w.tick
    }
}
