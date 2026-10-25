//! Player intent as values: every order a player (or, later, the network) can give is a `Command`, applied for a
//! seat (team) by `World::apply`, which checks that what it names belongs to that seat. Commands can be logged with
//! the tick they were applied on, and a log replayed onto a fresh world gives the same game: the basis of lockstep
//! multiplayer, replays and desync reports.

use super::*;

#[derive(Clone, Debug, PartialEq)]
pub enum Command {
    Move {
        unit: Id,
        x: f64,
        y: f64,
    },
    AttackMove {
        unit: Id,
        x: f64,
        y: f64,
    },
    Attack {
        unit: Id,
        target: Id,
    },
    Stop {
        unit: Id,
    },
    Hold {
        unit: Id,
    },
    Gather {
        unit: Id,
        node: Id,
    },
    Build {
        unit: Id,
        bldg: Id,
    },
    Repair {
        unit: Id,
        bldg: Id,
    },
    Place {
        kind: BldgKind,
        tx: i32,
        ty: i32,
        builder: Option<Id>,
    },
    Queue {
        bldg: Id,
        kind: UnitKind,
    },
    CancelQueue {
        bldg: Id,
        index: usize,
    },
    Research {
        bldg: Id,
        up: Upgrade,
    },
    CancelResearch {
        bldg: Id,
    },
    CancelConstruction {
        bldg: Id,
    },
    Rally {
        bldg: Id,
        x: f64,
        y: f64,
        node: Option<Id>,
    },
    Formation {
        units: Vec<Id>,
        x: f64,
        y: f64,
    },
}

impl Command {
    /// How many kinds of order there are (codes 0..KINDS).
    pub const KINDS: u8 = 16;
    /// A small stable number for the kind of order (logs, the network, test coverage). Append only.
    pub fn code(&self) -> u8 {
        match self {
            Command::Move { .. } => 0,
            Command::AttackMove { .. } => 1,
            Command::Attack { .. } => 2,
            Command::Stop { .. } => 3,
            Command::Hold { .. } => 4,
            Command::Gather { .. } => 5,
            Command::Build { .. } => 6,
            Command::Repair { .. } => 7,
            Command::Place { .. } => 8,
            Command::Queue { .. } => 9,
            Command::CancelQueue { .. } => 10,
            Command::Research { .. } => 11,
            Command::CancelResearch { .. } => 12,
            Command::CancelConstruction { .. } => 13,
            Command::Rally { .. } => 14,
            Command::Formation { .. } => 15,
        }
    }
}

/// A logged command: the tick it was applied on (before that tick's step) and the seat that gave it.
pub type Logged = (u32, u8, Command);

impl World {
    /// Apply a command for `seat`. Units and buildings it names must be that seat's; points must be real numbers.
    /// Err carries the message to show (only orders that can fail say why: placing, training, research).
    pub fn apply(&mut self, seat: u8, cmd: &Command) -> Result<(), String> {
        if seat > 1 {
            return Ok(()); // not a seat (from outside: validated, never trusted)
        }
        if let Some(log) = &mut self.log {
            log.push((self.tick, seat, cmd.clone()));
        }
        let unit = |w: &World, id: Id| w.unit(id).is_some_and(|u| u.team == seat);
        let bldg = |w: &World, id: Id| w.bldg(id).is_some_and(|b| b.team == seat);
        let finite = |x: f64, y: f64| x.is_finite() && y.is_finite();
        match *cmd {
            Command::Move { unit: u, x, y } if unit(self, u) && finite(x, y) => {
                self.move_to(u, x, y)
            }
            Command::AttackMove { unit: u, x, y } if unit(self, u) && finite(x, y) => {
                self.attack_move(u, x, y)
            }
            Command::Attack { unit: u, target } if unit(self, u) => self.attack_ent(u, target),
            Command::Stop { unit: u } if unit(self, u) => self.stop_unit(u),
            Command::Hold { unit: u } if unit(self, u) => self.hold_unit(u),
            Command::Gather { unit: u, node } if unit(self, u) => {
                self.start_gather(u, node);
            }
            Command::Build { unit: u, bldg: b } if unit(self, u) => {
                self.start_build(u, b);
            }
            Command::Repair { unit: u, bldg: b } if unit(self, u) => {
                self.start_repair(u, b);
            }
            Command::Place {
                kind,
                tx,
                ty,
                builder,
            } => {
                let builder = builder.filter(|&b| unit(self, b));
                return self.place_building(seat, kind, tx, ty, builder).map(|_| ());
            }
            Command::Queue { bldg: b, kind } => {
                if !bldg(self, b) {
                    return Err("Not yours".into());
                }
                return self.queue_unit(b, kind);
            }
            Command::CancelQueue { bldg: b, index } if bldg(self, b) => self.cancel_queue(b, index),
            Command::Research { bldg: b, up } => {
                if !bldg(self, b) {
                    return Err("Not yours".into());
                }
                return self.start_research(b, up);
            }
            Command::CancelResearch { bldg: b } if bldg(self, b) => self.cancel_research(b),
            Command::CancelConstruction { bldg: b } if bldg(self, b) => {
                self.cancel_construction(b);
            }
            Command::Rally {
                bldg: b,
                x,
                y,
                node,
            } if bldg(self, b) && finite(x, y) => self.set_rally(b, x, y, node),
            Command::Formation { ref units, x, y } if finite(x, y) => {
                let mine: Vec<Id> = units.iter().copied().filter(|&u| unit(self, u)).collect();
                self.formation(&mine, x, y);
            }
            _ => {} // not this seat's, or not a real point: ignored
        }
        Ok(())
    }

    /// Start (or stop) logging applied commands. Only commands are logged: the debug setters (spawning, hp,
    /// resources, switching the AI off) are not part of a replay.
    pub fn record(&mut self, on: bool) {
        self.log = on.then(Vec::new);
    }
}
