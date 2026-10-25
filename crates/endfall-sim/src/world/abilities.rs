//! Unit abilities: casting (one tap, for a whole selection), their effects on a unit's live stats, the per-tick
//! countdowns, and `auto_cast`, the rules the scripted opponent (and the balance duels) use them by.

use super::*;

impl World {
    /// The slot of `ability` in `uid`'s kind, if the kind has it.
    fn ability_slot(&self, uid: Id, ability: AbilityKind) -> Option<usize> {
        self.unit(uid)?
            .kind
            .def()
            .abilities
            .iter()
            .position(|&a| a == ability)
    }

    /// Whether `uid` could cast `ability` now; Err says why not (for the player).
    pub fn can_cast(&self, uid: Id, ability: AbilityKind) -> Result<(), String> {
        let Some(slot) = self.ability_slot(uid, ability) else {
            return Err(format!("Cannot use {}", ability.def().name));
        };
        let u = self.u(uid);
        if !self.ability_unlocked(u.team, ability) {
            let up = Upgrade::unlocking(ability).unwrap();
            return Err(format!("Research {} first", up.def().name));
        }
        if u.ab_cd[slot] > 0.0 {
            return Err(format!("{} is not ready", ability.def().name));
        }
        if u.swap > 0.0 {
            return Err("Busy entrenching".into());
        }
        if u.warp > 0.0 {
            return Err("Still warping in".into());
        }
        if let AbilityEffect::Boost { hp, .. } = ability.def().effect
            && u.hp <= hp
        {
            return Err("Too hurt".into());
        }
        Ok(())
    }

    /// `uid` uses `ability` (refused as in `can_cast`).
    pub fn cast(&mut self, uid: Id, ability: AbilityKind) -> Result<(), String> {
        self.can_cast(uid, ability)?;
        let slot = self.ability_slot(uid, ability).unwrap();
        let d = ability.def();
        let now = self.time;
        self.um(uid).ab_cd[slot] = d.cooldown;
        match d.effect {
            AbilityEffect::Boost { secs, hp, .. } => {
                let u = self.um(uid);
                u.hp -= hp;
                u.boost = Some((ability, now + secs));
            }
            AbilityEffect::Entrench { swap, .. } => {
                let entrenching = self.u(uid).mode.is_none();
                if entrenching {
                    // Settles in where it stands and holds: it fires at what comes into its (longer) reach.
                    self.release_mine(uid);
                    self.set_task(uid, Task::Hold);
                } else {
                    self.set_task(uid, Task::Idle);
                }
                let u = self.um(uid);
                u.mode = entrenching.then_some(ability);
                u.swap = swap;
            }
            AbilityEffect::Blink { dist } => self.blink(uid, dist * TILE),
            // (the boost timer carries it: a cloaking unit has no other timed ability)
            AbilityEffect::Cloak { secs } => self.um(uid).boost = Some((ability, now + secs)),
        }
        let (x, y, team) = {
            let u = self.u(uid);
            (u.x, u.y, u.team)
        };
        let seen = [0, 1].map(|t| t == team || self.seen_by(t, uid));
        self.emit(Event::Cast {
            x,
            y,
            ability: d.key,
            seen,
        });
        Ok(())
    }

    /// Every unit of `units` that can use `ability` does (a selection taps once); Err only if none could, with the
    /// first reason of a unit that has the ability (else the first reason).
    pub fn cast_group(&mut self, units: &[Id], ability: AbilityKind) -> Result<(), String> {
        let (mut own_err, mut other_err, mut any) = (None, None, false);
        for &u in units {
            let has = self.ability_slot(u, ability).is_some();
            match self.cast(u, ability) {
                Ok(()) => any = true,
                Err(e) if has => {
                    own_err.get_or_insert(e);
                }
                Err(e) => {
                    other_err.get_or_insert(e);
                }
            }
        }
        if any {
            Ok(())
        } else {
            Err(own_err.or(other_err).unwrap_or_default())
        }
    }

    /// A hop of up to `max` px towards the unit's target (or the way it faces), onto the nearest open tile there.
    fn blink(&mut self, uid: Id, max: f64) {
        let (ux, uy, face, target) = {
            let u = self.u(uid);
            let t = match u.task {
                Task::Attack { target, .. } => self.geo(target).map(|g| g.center()),
                _ => None,
            };
            (u.x, u.y, u.face, t)
        };
        let (dx, dy) = match target {
            // Up to the target, not through it: stop a body's width short.
            Some((tx, ty)) => {
                let d = dist(ux, uy, tx, ty);
                let go = (d - 24.0).clamp(0.0, max);
                if d > 0.0 {
                    ((tx - ux) / d * go, (ty - uy) / d * go)
                } else {
                    (0.0, 0.0)
                }
            }
            None => (jsmath::cos(face) * max, jsmath::sin(face) * max),
        };
        let (gx, gy) = (clamp_x(ux + dx), clamp_y(uy + dy));
        let tile = Self::tile_of(gx, gy);
        let Some((fx, fy)) = self.map.nearest_free(tile.0, tile.1, 3) else {
            return; // nowhere to land: stays put (the cooldown is spent)
        };
        let (nx, ny) = if (fx, fy) == tile {
            (gx, gy)
        } else {
            ((fx as f64 + 0.5) * TILE, (fy as f64 + 0.5) * TILE)
        };
        let u = self.um(uid);
        u.x = nx;
        u.y = ny;
        u.path = None;
        u.repath = 0.0;
    }

    /// Cooldowns and settling run down, boosts end.
    pub(crate) fn tick_abilities(&mut self, dt: f64) {
        let now = self.time;
        for u in &mut self.units {
            for c in &mut u.ab_cd {
                *c = (*c - dt).max(0.0);
            }
            u.swap = (u.swap - dt).max(0.0);
            if u.boost.is_some_and(|(_, end)| now >= end) {
                u.boost = None;
            }
        }
    }

    /// A move order on an entrenched unit packs it up first (it walks once the packing is done).
    pub(crate) fn unentrench_to_move(&mut self, uid: Id) {
        let u = self.um(uid);
        if let Some(k) = u.mode {
            if let AbilityEffect::Entrench { swap, .. } = k.def().effect {
                u.swap = swap;
            }
            u.mode = None;
        }
    }

    /// How a boost changes a stat: `pick` takes the boost's (fire, speed) multipliers.
    fn boost_mul(&self, uid: Id, pick: fn(f64, f64) -> f64) -> f64 {
        match self.unit(uid).and_then(|u| u.boost) {
            Some((k, _)) => match k.def().effect {
                AbilityEffect::Boost { fire, speed, .. } => pick(fire, speed),
                _ => 1.0,
            },
            None => 1.0,
        }
    }
    /// Walking speed multiplier: 0 while entrenched or settling, the boost's while boosted.
    pub(crate) fn speed_mul(&self, uid: Id) -> f64 {
        let u = self.u(uid);
        if u.mode.is_some() || u.swap > 0.0 {
            return 0.0;
        }
        self.boost_mul(uid, |_, s| s)
    }

    /// A unit's own top speed (px/s): its kind's, with its team's speed tech for it. The march pace of a group and
    /// a unit's speed both start from this, so a researched flyer is faster in a group too.
    pub(crate) fn base_speed(&self, uid: Id) -> f64 {
        let u = self.u(uid);
        let tech = if self.effect_level(u.team, Effect::Speed(u.kind)) > 0 {
            TECH_SPEED
        } else {
            1.0
        };
        u.kind.def().speed * tech
    }

    /// Whether `team` may use `ability`: no tech unlocks it, or that tech is researched.
    pub fn ability_unlocked(&self, team: u8, ability: AbilityKind) -> bool {
        Upgrade::unlocking(ability).is_none_or(|up| self.upgrades[team as usize][up.index()] > 0)
    }
    /// Fire-rate multiplier (a building has none).
    pub(crate) fn fire_mul(&self, uid: Id) -> f64 {
        self.boost_mul(uid, |f, _| f)
    }
    /// Extra reach in tiles (entrenched), or None while settling in or packing up (no firing then).
    pub(crate) fn reach_add(&self, uid: Id) -> Option<f64> {
        let u = self.u(uid);
        if u.swap > 0.0 {
            return None;
        }
        Some(match u.mode.map(|k| k.def().effect) {
            Some(AbilityEffect::Entrench { range, .. }) => range,
            _ => 0.0,
        })
    }

    /// The scripted opponent's (and the duels') use of abilities for `team`'s units, in unit order: Stim and
    /// Overcharge once in a fight at reach, Blink to close on a target out of reach, Entrench when enemies are in
    /// entrenched reach but none is close, and packing up when nothing is left in reach. Sees only what `team` sees.
    pub fn auto_cast(&mut self, team: u8) {
        let ids: Vec<Id> = self
            .units
            .iter()
            .filter(|u| u.team == team && !u.kind.def().abilities.is_empty())
            .map(|u| u.id)
            .collect();
        for uid in ids {
            let Some(u) = self.unit(uid) else { continue };
            let (ux, uy, task, hp, maxhp, mode, boost) =
                (u.x, u.y, u.task, u.hp, u.maxhp, u.mode, u.boost);
            let d = u.kind.def();
            let reach = d.weapon.map_or(0.0, |w| w.range) * TILE;
            let target_d = match task {
                Task::Attack { target, .. } => self.geo(target).map(|g| g.edge_dist(ux, uy)),
                _ => None,
            };
            // What this side sees around it: the nearest enemy (edge distance) and how many armed enemy units are
            // within 8 tiles (a real fight, not a worker or a building).
            // Also how many of those (and of its turrets) can hit this unit's layer: what a cloak would hide it from.
            let (mut nearest, mut armed, mut can_hit_me) = (f64::INFINITY, 0, 0);
            for o in self.nearby(ux, uy, 12.0 * TILE) {
                if !self.team_of(o).is_some_and(|t| t != team) || !self.seen_by(team, o) {
                    continue;
                }
                let Some(g) = self.geo(o) else { continue };
                let e = g.edge_dist(ux, uy);
                nearest = nearest.min(e);
                if e < 8.0 * TILE && self.unit(o).is_some_and(|u| u.kind.def().threat()) {
                    armed += 1;
                }
                let hurts = self
                    .unit(o)
                    .is_some_and(|u| u.kind.def().damage_vs(d.air) > 0.0)
                    || self
                        .bldg(o)
                        .is_some_and(|b| b.done && b.kind.def().damage_vs(d.air) > 0.0);
                if e < 8.0 * TILE && hurts {
                    can_hit_me += 1;
                }
            }
            let detected = self.detects(1 - team, ux, uy);
            let fight = armed >= 3;
            for &ab in d.abilities {
                if self.can_cast(uid, ab).is_err() {
                    continue;
                }
                let go = match ab.def().effect {
                    // (not again while one is still running: a Medic's heals would be soaked into a permanent boost)
                    AbilityEffect::Boost { hp: cost, .. } => {
                        fight
                            && boost.is_none()
                            && target_d.is_some_and(|t| t <= reach + TILE)
                            && hp - cost > maxhp * 0.6
                    }
                    AbilityEffect::Blink { dist } => {
                        fight
                            && target_d
                                .is_some_and(|t| t > reach + 2.0 * TILE && t < (dist + 4.0) * TILE)
                    }
                    // Cloak once engaged with something armed close by (it cannot be shot back unless detected).
                    // (not where it is detected anyway, nor against what cannot hit it)
                    AbilityEffect::Cloak { .. } => {
                        can_hit_me >= 1 && !detected && boost.is_none() && target_d.is_some()
                    }
                    // Only a defender digs in (idle or holding): a wave on the move never leaves one behind.
                    AbilityEffect::Entrench { range, .. } => match mode {
                        None => {
                            matches!(task, Task::Idle | Task::Hold)
                                && nearest <= reach + range * TILE
                                && nearest > 3.0 * TILE
                        }
                        // Packs up once nothing is left within its entrenched reach (and walks on with its wave).
                        Some(_) => nearest > reach + range * TILE,
                    },
                };
                if go {
                    let _ = self.cast(uid, ab);
                }
            }
        }
    }
}
