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
    /// Switch the opponent off (tests of the player's own abilities should not race the AI's attacks).
    pub fn disable_ai(&mut self) {
        self.ai = None;
    }

    /// The units of the AI's current attack wave, if one is out (tests and tools).
    pub fn ai_wave(&self) -> Option<Vec<Id>> {
        self.ai
            .as_ref()
            .filter(|a| a.attacking)
            .and_then(|a| a.attackers.clone())
    }

    pub(crate) fn init_ai(&mut self) {
        self.ai = Some(Ai {
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

    /// The AI's half-second tick: what it has and knows, then its phases in a fixed order (the order of RNG draws and
    /// of orders is part of the rules: keep it).
    pub(crate) fn ai_tick(&mut self, dt: f64) {
        let Some(a) = self.ai.as_mut() else { return };
        if self.over {
            return;
        }
        a.t += dt;
        if a.t < 0.5 {
            return;
        }
        a.t = 0.0;
        self.update_knowledge();
        let d = &DIFF[self.diff];
        let (e, t) = (ENEMY, self.time);
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
                b.kind == BldgKind::Core && b.done
            })
            .or_else(|| {
                my_b.iter()
                    .copied()
                    .find(|&id| self.bldg(id).unwrap().kind == BldgKind::Core)
            });
        let harv: Vec<Id> = my_u
            .iter()
            .copied()
            .filter(|&id| self.unit(id).unwrap().kind == UnitKind::Harvester)
            .collect();
        let army: Vec<Id> = my_u
            .iter()
            .copied()
            .filter(|&id| self.unit(id).unwrap().kind != UnitKind::Harvester)
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
                self.map.bases[1].0 as f64 + 2.0,
                self.map.bases[1].1 as f64 + 2.0,
            ),
        };
        let building: Vec<BldgKind> = my_b
            .iter()
            .map(|&id| self.bldg(id).unwrap().clone())
            .filter(|b| !b.done)
            .map(|b| b.kind)
            .collect();
        if self.ai.as_ref().unwrap().rally.is_none() {
            let pb = self.map.bases[0];
            let ang = jsmath::atan2(pb.1 as f64 - cy, pb.0 as f64 - cx);
            let rally = Pt {
                x: (cx + jsmath::cos(ang) * 9.0) * TILE,
                y: (cy + jsmath::sin(ang) * 9.0) * TILE,
            };
            self.ai.as_mut().unwrap().rally = Some(rally);
        }
        let rally = self.ai.as_ref().unwrap().rally.unwrap();

        let _ = d;
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
