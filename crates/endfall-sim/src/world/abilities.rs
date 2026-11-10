//! Unit abilities (toggles since the re-theme: the Guard's Brace, the Trebuchet's Deploy): casting (one tap, for a
//! whole selection), their effects on a unit's live stats and the per-tick countdowns.

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
            return Err(if u.mode.is_some() {
                "Busy settling in".into()
            } else {
                "Busy packing up".into()
            });
        }
        if u.slowed > 0.0 {
            return Err("Harpooned: no abilities while slowed".into());
        }
        Ok(())
    }

    /// `uid` uses `ability` (refused as in `can_cast`).
    pub fn cast(&mut self, uid: Id, ability: AbilityKind) -> Result<(), String> {
        self.can_cast(uid, ability)?;
        let slot = self.ability_slot(uid, ability).unwrap();
        let d = ability.def();
        self.um(uid).ab_cd[slot] = d.cooldown;
        let settling = self.u(uid).mode.is_none();
        if settling {
            // Settles in where it stands and holds: it fires at what comes into its reach.
            self.release_mine(uid);
            self.set_task(uid, Task::Hold);
        } else {
            self.set_task(uid, Task::Idle);
        }
        self.set_toggle(uid, ability, settling);
        let (x, y, team) = {
            let u = self.u(uid);
            (u.x, u.y, u.team)
        };
        let seen = self.seen_mask(team, uid);
        self.emit(Event::Cast {
            x,
            y,
            ability: d.key,
            seen,
        });
        Ok(())
    }

    /// Turns `uid`'s toggle `ability` on or off, whatever it is doing (its task stays): `swap` seconds of settling in
    /// or packing up start.
    pub(crate) fn set_toggle(&mut self, uid: Id, ability: AbilityKind, on: bool) {
        let AbilityEffect::Settle { swap, .. } = ability.def().effect;
        let u = self.um(uid);
        u.mode = on.then_some(ability);
        u.swap = swap;
    }

    /// A siege gun sets up by itself on reaching its target (an attack, an attack-move or an idle unit's own pick):
    /// its toggle goes on as if cast, the task stays (it fires once settled). Whether it set up: not when it may not
    /// (harpooned, `can_cast`), and the caller fights on without it.
    pub(crate) fn deploy(&mut self, uid: Id) -> bool {
        let Some(k) = self.u(uid).kind.toggle() else {
            return false;
        };
        if self.u(uid).mode.is_some() || self.can_cast(uid, k).is_err() {
            return false;
        }
        let task = self.u(uid).task;
        let _ = self.cast(uid, k);
        self.um(uid).task = task; // (cast holds it: keep the attack)
        true
    }

    /// Every unit of `units` that can use `ability` does (a selection taps once); Err only if none could, with the
    /// first reason of a unit that has the ability (else the first reason).
    pub fn cast_group(&mut self, units: &[Id], ability: AbilityKind) -> Result<(), String> {
        if ability.def().auto {
            return Err(format!(
                "{}: by itself, not on an order",
                ability.def().name
            ));
        }
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

    /// Cooldowns and settling run down.
    pub(crate) fn tick_abilities(&mut self, dt: f64) {
        for u in &mut self.units {
            for c in &mut u.ab_cd {
                *c = (*c - dt).max(0.0);
            }
            // (a whole number of seconds counted down by DT leaves a rounding crumb: none of it is a tick)
            let left = u.swap - dt;
            u.swap = if left > 1e-9 { left } else { 0.0 };
        }
    }

    /// A move order on a deployed unit packs it up first (it drives once the packing is done).
    pub(crate) fn pack_up_to_move(&mut self, uid: Id) {
        let u = self.um(uid);
        if let Some(k) = u.mode {
            let AbilityEffect::Settle { swap, .. } = k.def().effect;
            u.swap = swap;
            u.mode = None;
        }
    }

    /// Walking speed multiplier: 0 while deployed or settling.
    pub(crate) fn speed_mul(&self, uid: Id) -> f64 {
        let u = self.u(uid);
        if u.mode.is_some() || u.swap > 0.0 {
            0.0
        } else {
            1.0
        }
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
    /// Extra reach in tiles (its toggle's, while on), or None while settling in or packing up (no firing then), and for a siege
    /// gun on its tracks with no light gun.
    pub(crate) fn reach_add(&self, uid: Id) -> Option<f64> {
        let u = self.u(uid);
        if u.swap > 0.0 || (u.mode.is_none() && u.kind.siege() && u.kind.def().light.is_none()) {
            return None;
        }
        Some(match u.mode.map(|k| k.def().effect) {
            Some(AbilityEffect::Settle { range, .. }) => range,
            None => 0.0,
        })
    }
}
