//! The tide (PRD: the tide on the Shore map): the water level moves through a cycle (high water, the ebb, low water,
//! the flood), each cycle a little longer or shorter, drawn from the world's RNG as it starts. Against the level each
//! tile's ground changes (`Map::ground`): the routes it cuts are dropped, the seats with walkers on ground the flood
//! will cover are warned before it comes (and their idle ones sent to dry ground, a per-seat switch), and a walker
//! still there when its tile goes deep is swept ashore, hurt and stunned (or destroyed, behind a switch). Off unless
//! `set_tide`: a game without it never draws, hashes or changes anything here.

use super::*;

/// The phases of a cycle, in order.
pub const HIGH: usize = 0;
pub const EBB: usize = 1;
pub const LOW: usize = 2;
pub const FLOOD: usize = 3;

impl World {
    /// Turn the tide on or off and start the game again with it (call it first, before the seats' levels, plans and AI
    /// seats). A game starts at high water.
    pub fn set_tide(&mut self, on: bool) {
        self.tide = on.then_some(Tide {
            start: 0,
            phases: [0; 4],
            warned: false,
        });
        self.reset(self.seed, self.diff);
    }
    /// The flood destroys the walkers it catches instead of sweeping them ashore (the balance lab's comparison).
    pub fn set_flood_kills(&mut self, on: bool) {
        self.flood_kills = on;
    }
    /// Whether a seat's walkers leave ground the flood will cover when it is announced (on by default).
    pub fn retreats(&self, seat: u8) -> bool {
        self.no_retreat & (1 << seat) == 0
    }

    /// The tide's phase now: (phase, ticks into it, ticks left in it); None without the tide.
    pub fn tide_phase(&self) -> Option<(usize, u32, u32)> {
        let t = self.tide.as_ref()?;
        let mut into = self.tick.saturating_sub(t.start);
        for (k, &p) in t.phases.iter().enumerate() {
            if into < p {
                return Some((k, into, p - into));
            }
            into -= p;
        }
        Some((FLOOD, t.phases[FLOOD], 0))
    }

    /// A new cycle from this tick: high water, its phases drawn.
    pub(crate) fn start_tide(&mut self) {
        let f = 1.0 + TIDE_SPREAD * (2.0 * self.rnd() - 1.0);
        let ticks = |s: f64| (jsmath::round(s * f / DT) as u32).max(1);
        let phases = [
            ticks(TIDE_HIGH_S),
            ticks(TIDE_FALL_S),
            ticks(TIDE_LOW_S),
            ticks(TIDE_RISE_S),
        ];
        self.tide = Some(Tide {
            start: self.tick,
            phases,
            warned: false,
        });
        self.water = WATER_HIGH;
    }

    /// The level `into` ticks into a cycle of `phases`: high, then down a step at a time over the ebb, low, then up a
    /// step at a time over the flood (evenly: the first step a step's share into the phase, the last as the next
    /// phase begins, so low water is exactly the low phase and high water the high one).
    pub fn tide_level(phases: &[u32; 4], into: u32) -> i8 {
        let span = (WATER_HIGH - WATER_LOW) as u32;
        let step = |into: u32, len: u32| ((into * span / len.max(1)).min(span)) as i8;
        let (h, e, l) = (phases[HIGH], phases[EBB], phases[LOW]);
        if into < h {
            WATER_HIGH
        } else if into < h + e {
            WATER_HIGH - step(into - h, e)
        } else if into < h + e + l {
            WATER_LOW
        } else {
            WATER_LOW + step(into - h - e - l, phases[FLOOD])
        }
    }

    /// The tide's tick, before the units': a new cycle when one ends, the warning, and the level.
    pub(crate) fn tide_tick(&mut self) {
        let t = self.tide.as_ref().expect("the tide is on");
        let len: u32 = t.phases.iter().sum();
        if self.tick.saturating_sub(t.start) >= len {
            let water = self.water;
            self.start_tide();
            self.water = water; // (the new cycle's high water is set below, as a change, like any other)
        }
        let t = self.tide.as_ref().unwrap();
        let into = self.tick - t.start;
        let flood_at = t.phases[HIGH] + t.phases[EBB] + t.phases[LOW];
        let warn_at = flood_at.saturating_sub(jsmath::round(TIDE_WARN_S / DT) as u32);
        if !t.warned && into >= warn_at {
            self.tide.as_mut().unwrap().warned = true;
            self.flood_warning();
        }
        let level = World::tide_level(&self.tide.as_ref().unwrap().phases, into);
        if level != self.water {
            let rising = level > self.water;
            self.water = level;
            self.water_changed(rising);
        }
    }

    /// A walker's foot at high water: the ground it may stand on whatever the tide.
    fn foot_at_high(&self) -> Foot {
        Foot {
            class: Move::Walk,
            water: WATER_HIGH,
        }
    }

    /// Whether a walker at (x, y) stands on ground the next high water makes deep.
    fn floods(&self, x: f64, y: f64) -> bool {
        let (tx, ty) = self.map.tile_of(x, y);
        self.map.ground(tx, ty, WATER_HIGH) == Ground::Deep
    }

    /// The warning, `TIDE_WARN_S` before the flood: each seat with walkers on ground it will cover hears it once, and
    /// (its switch on) sends its idle walkers and its idle or mining workers there to the nearest ground that stays
    /// dry. A walker under any other order keeps it: staying is a choice.
    fn flood_warning(&mut self) {
        for seat in 0..self.seats() as u8 {
            if self.out.get(seat as usize).copied().unwrap_or(false) {
                continue;
            }
            let caught: Vec<(Id, f64, f64, bool)> = self
                .units
                .iter()
                .filter(|u| u.team == seat && u.kind.def().mv == Move::Walk)
                .filter(|u| self.floods(u.x, u.y))
                .map(|u| {
                    let free = match u.task {
                        Task::Idle => true,
                        Task::Gather { .. } => u.kind.def().worker,
                        _ => false,
                    };
                    (u.id, u.x, u.y, free)
                })
                .collect();
            let Some(&(_, px, py, _)) = caught.first() else {
                continue;
            };
            self.toast(seat, "The tide is turning: the flats will flood", true);
            self.sfx(seat, "alert");
            self.ping(seat, px, py);
            if !self.retreats(seat) {
                continue;
            }
            let foot = self.foot_at_high();
            for (id, x, y, free) in caught {
                if !free {
                    continue;
                }
                let (tx, ty) = self.map.tile_of(x, y);
                if let Some((dx, dy)) =
                    self.map
                        .nearest_passable_to(foot, tx, ty, SWEEP_REACH, (x, y))
                {
                    self.move_to(id, dx as f64 * TILE + 16.0, dy as f64 * TILE + 16.0);
                }
            }
        }
    }

    /// The level moved: routes it cuts are dropped (the groups' shared ones and each walker's own, whose every leg is
    /// checked: a smoothed route crosses the flats in one straight leg), and the walker plans again; on the way up
    /// every walker on ground now deep is swept ashore or, with `flood_kills`, destroyed.
    fn water_changed(&mut self, rising: bool) {
        self.terrain_changed();
        let water = self.water;
        let deep = |m: &Map, x: f64, y: f64| {
            let (tx, ty) = m.tile_of(x, y);
            m.ground(tx, ty, water) == Ground::Deep
        };
        let foot = Foot {
            class: Move::Walk,
            water,
        };
        for i in 0..self.units.len() {
            let u = &self.units[i];
            if u.kind.def().mv != Move::Walk {
                continue;
            }
            let cut = u.path.as_ref().is_some_and(|p| {
                let mut at = Pt { x: u.x, y: u.y };
                p.iter().any(|&q| {
                    let open = crate::path::los(&self.map, foot, at, q);
                    at = q;
                    !open
                })
            });
            if cut {
                let u = &mut self.units[i];
                u.path = None;
                u.repath = 0.0;
            }
        }
        if !rising {
            return;
        }
        let swept: Vec<Id> = self
            .units
            .iter()
            .filter(|u| u.kind.def().mv == Move::Walk && deep(&self.map, u.x, u.y))
            .map(|u| u.id)
            .collect();
        let foot = Foot {
            class: Move::Walk,
            water,
        };
        for id in swept {
            if self.flood_kills {
                self.kill(id, None);
                continue;
            }
            let (x, y) = (self.u(id).x, self.u(id).y);
            let (tx, ty) = self.map.tile_of(x, y);
            let to = self
                .map
                .nearest_passable_to(foot, tx, ty, SWEEP_REACH, (x, y));
            let u = self.um(id);
            if let Some((dx, dy)) = to {
                u.x = dx as f64 * TILE + 16.0;
                u.y = dy as f64 * TILE + 16.0;
            }
            u.path = None;
            u.repath = 0.0;
            u.hp -= SWEEP_HP * u.maxhp;
            u.flash = 0.12;
            u.stun = SWEEP_STUN_S;
            if u.hp <= 0.0 {
                self.kill(id, None);
            }
        }
    }
}
