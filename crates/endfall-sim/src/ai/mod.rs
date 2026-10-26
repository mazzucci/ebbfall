//! The scripted opponent. Runs twice a second: assigns workers, follows a build order, keeps supply ahead,
//! expands, defends its base, raids with Wasps and attacks in growing waves. It plays under fog of war: it
//! scouts, remembers the player buildings it has seen and sweeps the map when it knows of none. Draws only
//! from the world RNG.

mod army;
mod build;
mod economy;
mod produce;
mod research;
mod scouting;

use crate::data::*;
use crate::jsmath::{self, PI, dist};
use crate::map::{Id, idx, in_map};
use crate::path::Pt;
use crate::world::{Phase, Task, World};

pub(crate) struct Ai {
    /// The seat it plays.
    pub team: u8,
    pub t: f64,
    pub wave: usize,
    pub last_wave: f64,
    pub attacking: bool,
    pub attackers: Option<Vec<Id>>,
    pub rally: Option<Pt>,
    /// Own buildings under construction: (id, progress last seen, time it last advanced).
    pub sites: Vec<(Id, f64, f64)>,
    /// When the current saving-for-research streak began, and the time before which it may not save again.
    pub saving_since: Option<f64>,
    pub no_save_until: f64,
    /// Player buildings the AI has seen and not yet seen gone: (id, x, y, is a core). The AI plays with fog.
    pub known: Vec<(Id, f64, f64, bool)>,
    /// Until when the AI keeps preparing for player flyers it has seen.
    pub seen_air_until: f64,
    /// The early scout (a harvester), and whether it has been sent.
    pub scout: Option<Id>,
    pub scouted: bool,
    /// Wasps raiding the player's harvesters.
    pub raiders: Vec<Id>,
    /// With no player building known: which point of the sweep (the player's start, then the shard fields
    /// nearest it) the army heads for next.
    pub sweep: usize,
    pub sweep_since: f64,
    /// Ether is piling up: keep a single harvester on it (with hysteresis).
    pub ether_lean: bool,
    /// How many units the current attack wave started with (it retreats below 40%).
    pub wave_size: usize,
    /// The most enemy infantry (walking, bio) and heavy walkers (armour 2+) seen at once lately: (count, when).
    /// Its mix answers: splash against massed infantry, fewer heavies of its own against heavies.
    pub infantry_seen: (usize, f64),
    pub heavy_seen: (usize, f64),
    /// Units kept home at its own expansion (out of the waves).
    pub guards: Vec<Id>,
    /// Where something it could not see last hit it (a cloaked raider): a detector goes there.
    pub cloak_hit: Option<(f64, f64)>,
}

impl World {
    /// Switch the opponents off (tests of the player's own abilities should not race the AI's attacks). The seats
    /// stay AI seats (`is_ai`): only their play stops.
    pub fn disable_ai(&mut self) {
        self.ai.iter_mut().for_each(|a| *a = None);
    }

    /// Choose which seats the scripted opponent plays (a flag per seat; false, and nothing changes, for a wrong length),
    /// with fresh brains (tests and tools; the menu offers one AI).
    pub fn set_ai_seats(&mut self, seats: impl AsRef<[bool]>) -> bool {
        let seats = seats.as_ref();
        if seats.len() != self.seats() {
            return false;
        }
        self.ai_seats = seats.to_vec();
        self.init_ai();
        true
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
        self.ai = (0..self.seats() as u8)
            .map(|team| self.is_ai(team).then(|| self.new_brain(team)))
            .collect();
    }

    fn new_brain(&self, team: u8) -> Ai {
        Ai {
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
            infantry_seen: (0, 0.0),
            heavy_seen: (0, 0.0),
            guards: Vec::new(),
            cloak_hit: None,
            sweep: 0,
            sweep_since: 0.0,
            ether_lean: false,
        }
    }

    /// The seat whose AI is taking its turn (set by `ai_tick` for the length of the turn).
    pub(crate) fn seat(&self) -> u8 {
        self.ai_turn
    }
    /// The enemy seat it plays against (scouts, sweeps from, rallies towards): the one whose base is nearest its own,
    /// among those still in (then among all), ties to the lower seat. With two seats, the other one.
    pub(crate) fn foe(&self) -> u8 {
        let me = self.ai_turn;
        let (mx, my) = self.map.bases[me as usize];
        (0..self.seats() as u8)
            .filter(|&s| self.enemies(me, s))
            .min_by_key(|&s| {
                let (x, y) = self.map.bases[s as usize];
                (self.out[s as usize], (x - mx).pow(2) + (y - my).pow(2), s)
            })
            .unwrap_or(me)
    }
    /// Where the foe's headquarters started (tile, its centre).
    pub(crate) fn foe_base(&self) -> (f64, f64) {
        let (x, y) = self.map.bases[self.foe() as usize];
        (x as f64 + 2.0, y as f64 + 2.0)
    }
    /// Whether `team` is an enemy of the seat taking its turn (any enemy: it defends against all and hunts what it
    /// sees; it plans against `foe`).
    pub(crate) fn hostile(&self, team: u8) -> bool {
        self.enemies(self.ai_turn, team)
    }
    /// The brain of the seat taking its turn.
    pub(crate) fn ai(&self) -> &Ai {
        self.ai[self.ai_turn as usize].as_ref().unwrap()
    }
    pub(crate) fn ai_mut(&mut self) -> &mut Ai {
        self.ai[self.ai_turn as usize].as_mut().unwrap()
    }

    /// Every AI seat's half-second turn, seat 0's first.
    pub(crate) fn ai_tick(&mut self, dt: f64) {
        for i in 0..self.seats() {
            if let Some(team) = self.ai[i].as_ref().map(|a| a.team) {
                self.ai_turn = team;
                self.ai_turn_of_seat(dt);
            }
        }
    }

    /// One AI's turn: what it has and knows, then its phases in a fixed order (the order of RNG draws and of orders
    /// is part of the rules: keep it).
    fn ai_turn_of_seat(&mut self, dt: f64) {
        if self.over || self.out[self.seat() as usize] {
            return; // (a seat that is out plays no more)
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
        self.ai_abilities(&mut b);
        self.recalc_supply(e);
    }

    /// Abilities: kept as the last phase, after the army moved, so using them never reorders the draws before it
    /// (the rules are `World::auto_cast`, shared with the balance duels).
    fn ai_abilities(&mut self, _brain: &mut Brain) {
        if DIFF[self.diff].abilities {
            self.auto_cast(self.seat());
        }
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
    /// The fields by its main are running dry: the expansion is due now, and saving for it does not give up.
    dry: bool,
    intruder: Option<Id>,
    enemy_air: usize,
    lancers: usize,
    saving: bool,
}

#[cfg(test)]
mod tests {
    use crate::data::*;
    use crate::world::World;

    #[test]
    fn the_ai_plays_against_the_nearest_enemy_still_in() {
        let mut w = World::new(31, 1);
        w.ai_turn = ENEMY;
        assert_eq!(w.foe(), PLAYER, "two seats: the other one");
        // A third seat starts right by seat 0: seat 1 picks the nearer of its two enemies.
        let (bx, by) = w.map.bases[0];
        let near = w.map.bases[1];
        let third = (near.0 + (bx - near.0) / 3, near.1 + (by - near.1) / 3);
        w.map.bases.push(third);
        w.factions.push(&HUMANS);
        w.teams.push(2);
        w.out.push(false);
        assert_eq!(w.foe(), 2, "the nearest enemy base");
        w.out[2] = true;
        assert_eq!(w.foe(), PLAYER, "one still in before one that is out");
        w.out[2] = false;
        w.teams = vec![0, 1, 1];
        assert_eq!(w.foe(), PLAYER, "never an ally");
        w.ai_turn = 2;
        assert_eq!(w.foe(), PLAYER);
        // Equally near: the lower seat.
        w.teams = vec![0, 1, 2];
        w.map.bases[2] = w.map.bases[1];
        w.ai_turn = 0;
        assert_eq!(w.foe(), 1, "a tie goes to the lower seat");
    }
}
