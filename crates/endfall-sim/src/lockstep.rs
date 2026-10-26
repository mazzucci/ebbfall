//! Lockstep (docs/MULTIPLAYER.md): in a networked game a `Game` does not apply its player's orders at once. It
//! encodes them into an outbox for the network to send; every seat's orders come back in the relay's turn bundles
//! (its own included), taken strictly in turn order (`receiveTurn`: a duplicate or a gap is refused), each turn's
//! orders running on its first tick, and a tick runs only once its turn has arrived. Every client applies the same
//! orders on the same ticks in the same order (tick, seat, arrival), so every world stays the same.

use crate::world::Command;
use crate::{Game, valid_team};
use wasm_bindgen::prelude::*;

/// Ticks in a turn (the relay's: relay/room.js TICKS_PER_TURN).
pub const TICKS_PER_TURN: u32 = 3;

#[derive(Default)]
pub(crate) struct Lockstep {
    /// The next turn expected from the relay.
    next_turn: u32,
    /// This player's orders, encoded, not yet taken by the network.
    outbox: Vec<f64>,
    /// Orders to run: (tick, seat, arrival number, command), kept in the order they will run.
    due: Vec<(u32, u8, u32, Command)>,
    arrivals: u32,
    /// Ticks below this may run: every seat's orders for them are in.
    until: u32,
}

impl Game {
    /// In lockstep: an order goes to the outbox (it runs when the relay sends it back): Some(Ok). One that would not
    /// arrive as it was given (a point that is not a number: JSON makes it 0 on every client) is refused. None
    /// outside lockstep.
    pub(crate) fn send(&mut self, cmd: &Command) -> Option<Result<(), String>> {
        let l = self.lock.as_mut()?;
        let w = cmd.encode();
        if Command::decode(&w) != Some((cmd.clone(), w.len())) {
            return Some(Err("That order cannot be sent".into()));
        }
        l.outbox.extend(w);
        Some(Ok(()))
    }

    /// `seat`'s orders, encoded, to run on `tick` (from a turn bundle). Anything malformed is dropped from the first bad
    /// command on.
    fn schedule(&mut self, tick: u32, seat: u8, words: &[f64]) {
        let (Some(l), Some(seat)) = (&mut self.lock, valid_team(seat)) else {
            return;
        };
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

    /// Run the orders due on this tick (their errors go to their seat as a toast: the order was sent a turn ago).
    pub(crate) fn run_due(&mut self) {
        let tick = self.w.tick;
        let Some(l) = &mut self.lock else { return };
        let n = l.due.iter().take_while(|d| d.0 <= tick).count();
        let now: Vec<(u32, u8, u32, Command)> = l.due.drain(..n).collect();
        for (_, seat, _, cmd) in now {
            if let Err(msg) = self.w.apply(seat, &cmd)
                && !msg.is_empty()
            {
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

    /// A turn from the relay: `seats[i]`'s orders are the next `lens[i]` numbers of `words`. Turns must come in order:
    /// returns false (and takes nothing) for one that is not the next expected (a duplicate after a reconnect, or one
    /// that skipped ahead: the network buffers until the gap is filled). Its orders run on the turn's first tick, and
    /// the ticks up to the next turn may then run.
    #[wasm_bindgen(js_name = receiveTurn)]
    pub fn receive_turn(&mut self, turn: u32, seats: &[u8], lens: &[u32], words: &[f64]) -> bool {
        let Some(l) = &mut self.lock else {
            return false;
        };
        if turn != l.next_turn || seats.len() != lens.len() {
            return false;
        }
        l.next_turn += 1;
        let mut at = 0usize;
        for (&seat, &n) in seats.iter().zip(lens) {
            let end = (at + n as usize).min(words.len());
            self.schedule(turn * TICKS_PER_TURN, seat, &words[at..end]);
            at = end;
        }
        let l = self.lock.as_mut().unwrap();
        l.until = l.until.max((turn + 1) * TICKS_PER_TURN);
        true
    }

    /// The next turn this game expects from the relay (on a reconnect: everything from here on).
    #[wasm_bindgen(js_name = nextTurn)]
    pub fn next_turn(&self) -> u32 {
        self.lock.as_ref().map_or(0, |l| l.next_turn)
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
