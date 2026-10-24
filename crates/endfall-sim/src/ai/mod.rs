//! The scripted opponent. Runs twice a second: assigns workers, follows a build order, keeps supply ahead,
//! expands, defends its base, raids with Wasps and attacks in growing waves. It plays under fog of war: it
//! scouts, remembers the player buildings it has seen and sweeps the map when it knows of none. Draws only
//! from the world RNG.

mod army;
mod build;
mod economy;
mod scouting;

use crate::data::*;
use crate::jsmath::{self, PI, dist};
use crate::map::{Id, idx, in_map};
use crate::path::Pt;
use crate::world::{Ai, Phase, Task, World};

impl World {
    /// Switch the opponents off (tests of the player's own abilities should not race the AI's attacks). The seats
    /// stay AI seats (`is_ai`): only their play stops.
    pub fn disable_ai(&mut self) {
        self.ai = [None, None];
    }

    /// Choose which seats the scripted opponent plays, with fresh brains (tests and tools; the menu offers one AI).
    pub fn set_ai_seats(&mut self, seats: [bool; 2]) {
        self.ai_seats = seats;
        self.init_ai();
    }

    /// The units of an AI's current attack wave, if one is out (tests and tools).
    pub fn ai_wave(&self) -> Option<Vec<Id>> {
        self.ai
            .iter()
            .flatten()
            .find(|a| a.attacking)
            .and_then(|a| a.attackers.clone())
    }

    /// A fresh brain for every AI seat.
    pub(crate) fn init_ai(&mut self) {
        for team in [0, 1] {
            self.ai[team as usize] = self.is_ai(team).then(|| Ai {
                team,
                t: 0.0,
                wave: DIFF[self.diff].wave,
                last_wave: -20.0,
                attacking: false,
                attackers: None,
                rally: None,
                sites: Vec::new(),
                saving_since: None,
                no_save_until: 0.0,
                known: Vec::new(),
                seen_air_until: -1.0,
                scout: None,
                scouted: false,
                raiders: Vec::new(),
                wave_size: 0,
                sweep: 0,
                sweep_since: 0.0,
                ether_lean: false,
            });
        }
    }

    /// The seat whose AI is taking its turn (set by `ai_tick` for the length of the turn), and its opponent.
    pub(crate) fn seat(&self) -> u8 {
        self.ai_turn
    }
    pub(crate) fn foe(&self) -> u8 {
        1 - self.ai_turn
    }
    /// The brain of the seat taking its turn.
    pub(crate) fn ai(&self) -> &Ai {
        self.ai[self.ai_turn as usize].as_ref().unwrap()
    }
    pub(crate) fn ai_mut(&mut self) -> &mut Ai {
        self.ai[self.ai_turn as usize].as_mut().unwrap()
    }

    /// Every AI seat's half-second turn, team 0's first.
    pub(crate) fn ai_tick(&mut self, dt: f64) {
        for i in 0..2 {
            if let Some(team) = self.ai[i].as_ref().map(|a| a.team) {
                self.ai_turn = team;
                self.ai_turn_of_seat(dt);
            }
        }
    }

    /// One AI's turn: what it has and knows, then its phases in a fixed order (the order of RNG draws and of orders
    /// is part of the rules: keep it).
    fn ai_turn_of_seat(&mut self, dt: f64) {
        if self.over {
            return;
        }
        let a = self.ai_mut();
        a.t += dt;
        if a.t < 0.5 {
            return;
        }
        a.t = 0.0;
        self.update_knowledge();
        let (e, t) = (self.seat(), self.time);
        let my_b: Vec<Id> = self
            .bldgs
            .iter()
            .filter(|b| b.team == e)
            .map(|b| b.id)
            .collect();
        let my_u: Vec<Id> = self
            .units
            .iter()
            .filter(|u| u.team == e)
            .map(|u| u.id)
            .collect();
        let core = my_b
            .iter()
            .copied()
            .find(|&id| {
                let b = self.bldg(id).unwrap();
                b.kind.def().hq && b.done
            })
            .or_else(|| {
                my_b.iter()
                    .copied()
                    .find(|&id| self.bldg(id).unwrap().kind.def().hq)
            });
        let harv: Vec<Id> = my_u
            .iter()
            .copied()
            .filter(|&id| self.unit(id).unwrap().kind.def().worker)
            .collect();
        let army: Vec<Id> = my_u
            .iter()
            .copied()
            .filter(|&id| !self.unit(id).unwrap().kind.def().worker)
            .collect();
        let (cx, cy) = match core {
            Some(c) => {
                let c = self.bldg(c).unwrap();
                (
                    c.tx as f64 + c.w as f64 / 2.0,
                    c.ty as f64 + c.h as f64 / 2.0,
                )
            }
            None => (
                self.map.bases[self.seat() as usize].0 as f64 + 2.0,
                self.map.bases[self.seat() as usize].1 as f64 + 2.0,
            ),
        };
        let building: Vec<BldgKind> = my_b
            .iter()
            .map(|&id| self.bldg(id).unwrap().clone())
            .filter(|b| !b.done)
            .map(|b| b.kind)
            .collect();
        if self.ai().rally.is_none() {
            let pb = self.map.bases[self.foe() as usize];
            let ang = jsmath::atan2(pb.1 as f64 - cy, pb.0 as f64 - cx);
            let rally = Pt {
                x: (cx + jsmath::cos(ang) * 9.0) * TILE,
                y: (cy + jsmath::sin(ang) * 9.0) * TILE,
            };
            self.ai_mut().rally = Some(rally);
        }
        let rally = self.ai().rally.unwrap();

        let mut b = Brain {
            e,
            t,
            my_b,
            harv,
            army,
            cx,
            cy,
            rally,
            building,
            ..Brain::default()
        };
        self.ai_workers(&mut b);
        self.ai_harvesters(&mut b);
        self.ai_build(&mut b);
        self.ai_expand(&mut b);
        self.ai_watch(&mut b);
        self.ai_research(&mut b);
        self.ai_produce(&mut b);
        self.ai_army(&mut b);
        self.recalc_supply(e);
    }

    /// How many of our buildings of kind `k` (only finished ones if `done`).
    pub(crate) fn ai_count(&self, my_b: &[Id], done: bool, k: BldgKind) -> usize {
        my_b.iter()
            .filter(|&&id| {
                self.bldg(id)
                    .is_some_and(|b| b.kind == k && (b.done || !done))
            })
            .count()
    }
}

/// What the AI has and knows this tick, handed from phase to phase.
#[derive(Clone, Default)]
pub(crate) struct Brain {
    e: u8,
    t: f64,
    my_b: Vec<Id>,
    harv: Vec<Id>,
    army: Vec<Id>,
    cx: f64,
    cy: f64,
    rally: Pt,
    building: Vec<BldgKind>,
    ext: Option<Id>,
    flowing: bool,
    cores: Vec<Id>,
    want: Option<BldgKind>,
    expand: bool,
    intruder: Option<Id>,
    enemy_air: usize,
    lancers: usize,
    saving: bool,
}
