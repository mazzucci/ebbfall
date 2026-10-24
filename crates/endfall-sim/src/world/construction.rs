//! Building over time: construction and repair by harvesters, research and training in buildings.

use super::*;

impl World {
    /// A builder or repairer that stays put (walled in, site cut off, jammed on a corner) gives up instead of waiting
    /// forever: it goes idle and returns true. The position includes last tick's separation push.
    pub(crate) fn gave_up(&mut self, uid: Id, team: u8, dt: f64, why: &str) -> bool {
        let time = self.time;
        let u = self.um(uid);
        if dist(u.x, u.y, u.anchor.0, u.anchor.1) > STUCK_RADIUS {
            u.anchor = (u.x, u.y);
            u.stuck = 0.0;
        } else {
            u.stuck += dt;
        }
        if u.stuck <= BUILDER_PATIENCE {
            return false;
        }
        u.stuck = 0.0;
        u.no_build_until = time + 30.0;
        if team == PLAYER {
            self.toast(why, true);
        }
        self.set_idle(uid);
        true
    }

    /// A repairer walks to its building and restores hp at construction speed, paying REPAIR_COST of the price
    /// for a full repair as it goes. Short of resources or done, it goes back to mining.
    pub(crate) fn update_repair(&mut self, uid: Id, b: Id, r: f64, team: u8, dt: f64) {
        let Some(g) = self
            .bldg(b)
            .filter(|bd| bd.done && bd.hp < bd.maxhp)
            .and_then(|_| self.geo(b))
        else {
            self.resume_after(uid);
            return;
        };
        if !self.approach(uid, g, r + 8.0, dt) {
            self.gave_up(
                uid,
                team,
                dt,
                "A Harvester cannot reach the building to repair it",
            );
            return;
        }
        self.um(uid).stuck = 0.0;
        let bd = self.bldg(b).unwrap();
        let (maxhp, hp, cost, build, debt) = (
            bd.maxhp,
            bd.hp,
            bd.kind.def().cost,
            bd.kind.def().build,
            bd.repair_debt,
        );
        let heal = (dt / build * maxhp).min(maxhp - hp);
        let owed = [0, 1].map(|k| debt[k] + cost[k] as f64 * REPAIR_COST * heal / maxhp);
        let charge = owed.map(|o| o.floor() as i32);
        if !self.can_afford(team, charge) {
            if team == PLAYER {
                let msg = format!("{} to repair", self.short_of(team, charge));
                self.toast(msg, true);
            }
            let time = self.time;
            self.um(uid).no_build_until = time + 30.0; // the AI does not send it straight back
            self.resume_after(uid);
            return;
        }
        self.pay(team, charge, -1);
        let bd = self.bm(b).unwrap();
        bd.repair_debt = [0, 1].map(|k| owed[k] - charge[k] as f64);
        bd.hp = (bd.hp + heal).min(bd.maxhp);
        let (bx, by, br, full) = (bd.x, bd.y, bd.r, bd.hp >= bd.maxhp);
        // Welding sparks now and then, on the side the repairer works from.
        let u = self.um(uid); // (update_unit counts cd down)
        if u.cd <= 0.0 {
            u.cd = 0.6;
            let (ux, uy) = (u.x, u.y);
            let d = dist(ux, uy, bx, by).max(1.0);
            let k = (d - br * 0.6).max(0.0) / d;
            self.emit(Event::Hit {
                x: ux + (bx - ux) * k,
                y: uy + (by - uy) * k,
                big: false,
            });
        }
        if full {
            let crew: Vec<Id> = self
                .units
                .iter()
                .filter(|o| o.task == (Task::Repair { b }))
                .map(|o| o.id)
                .collect();
            for o in crew {
                self.resume_after(o);
            }
        }
    }

    pub(crate) fn update_building(&mut self, bid: Id, dt: f64) {
        let b = self.bm(bid).unwrap();
        b.flash -= dt;
        b.cd -= dt;
        if !b.done {
            if b.planted && self.advance_construction(bid, dt) {
                self.finish_construction(bid, None);
            }
            return;
        }
        let d = b.kind.def();
        if d.needs_power {
            let (bx, by, team, was) = (b.x, b.y, b.team, b.powered);
            let on = self.powered_at(team, bx, by);
            self.bm(bid).unwrap().powered = on;
            if was && !on && team == PLAYER {
                self.toast(format!("{} unpowered: build a Spire near it", d.name), true);
            }
            if !on {
                return; // dark: no training, research or firing
            }
        }
        let b = self.bm(bid).unwrap();
        if d.range > 0.0 && b.cd <= 0.0 {
            let (bx, by, team) = (b.x, b.y, b.team);
            if let Some(t) = self.find_target(
                bx,
                by,
                team,
                d.range * TILE,
                false,
                (d.dmg > 0.0, d.dmg_air > 0.0),
                false, // (buildings stand on the ground)
            ) {
                let (tx, ty) = self.geo(t).unwrap().center();
                self.bm(bid).unwrap().aim = jsmath::atan2(ty - by, tx - bx);
                self.fire(bid, t);
            }
        }
        let b = self.bm(bid).unwrap();
        if let Some(&q) = b.queue.first() {
            b.prog += dt / q.def().build;
            if b.prog >= 1.0 {
                b.prog = 0.0;
                b.queue.remove(0);
                self.spawn_from(bid, q);
            }
        }
        let b = self.bm(bid).unwrap();
        if let Some((up, p)) = b.research {
            let team = b.team;
            let level = self.upgrades[team as usize][up.index()] + 1;
            let p = p + dt / up.time(level);
            if p >= 1.0 {
                self.bm(bid).unwrap().research = None;
                self.upgrades[team as usize][up.index()] = level;
                if team == PLAYER {
                    self.toast(
                        format!(
                            "{} {} researched",
                            up.name(),
                            ["I", "II", "III"][(level - 1) as usize]
                        ),
                        false,
                    );
                    self.emit(Event::Sfx("done"));
                }
            } else {
                self.bm(bid).unwrap().research = Some((up, p));
            }
        }
    }
    /// A harvester building a site: walk to it, then raise it; when it is done, the crew goes back to work.
    pub(crate) fn update_build(&mut self, uid: Id, b: Id, r: f64, team: u8, dt: f64) {
        let Some(g) = self.bldg(b).filter(|bd| !bd.done).and_then(|_| self.geo(b)) else {
            self.resume_after(uid);
            return;
        };
        let reached = self.approach(uid, g, r + 8.0, dt);
        if !reached && self.gave_up(uid, team, dt, "A Harvester cannot reach its building site") {
            return;
        }
        if reached {
            self.um(uid).stuck = 0.0;
            if self.factions[team as usize].warp {
                // Warp-in: plant the seed and go back to work; the building grows by itself.
                self.bm(b).unwrap().planted = true;
                self.resume_after(uid);
                return;
            }
            if self.advance_construction(b, dt) {
                self.finish_construction(b, Some(uid));
            }
        }
    }

    /// Construction progress for `dt` (a builder at work, or a planted warp site by itself). True when it is done.
    pub(crate) fn advance_construction(&mut self, b: Id, dt: f64) -> bool {
        let bd = self.bm(b).unwrap();
        let build = bd.kind.def().build;
        bd.progress += dt / build;
        bd.hp = bd.maxhp.min(bd.hp + dt / build * bd.maxhp * 0.9);
        if bd.progress < 1.0 {
            return false;
        }
        bd.done = true;
        bd.progress = 1.0;
        // Snap to full unless it really took damage while going up (the per-tick sum lands an ulp short).
        bd.hp = if bd.maxhp - bd.hp < 0.5 {
            bd.maxhp
        } else {
            bd.maxhp.min(bd.hp)
        };
        true
    }

    /// A building just finished: supply, the news, and its crew back to work (`builder`: the one who finished it).
    pub(crate) fn finish_construction(&mut self, b: Id, builder: Option<Id>) {
        let bd = self.bldg(b).unwrap();
        let (bteam, name, vent) = (bd.team, bd.kind.def().name, bd.vent);
        self.recalc_supply(bteam);
        if bteam == PLAYER {
            self.toast(format!("{} complete", name), false);
            self.emit(Event::Sfx("done"));
        }
        let others: Vec<Id> = self
            .units
            .iter()
            .filter(|o| Some(o.id) != builder && o.task == (Task::Build { b }))
            .map(|o| o.id)
            .collect();
        // The crew of a new Extractor starts mining its ether; other builders go back to their work.
        for o in others.into_iter().chain(builder) {
            if !vent.is_some_and(|v| self.start_gather(o, v)) {
                self.resume_after(o);
            }
        }
    }

    /// Whether a point is inside one of `team`'s power fields (a finished Spire or Conflux near enough).
    pub fn powered_at(&self, team: u8, x: f64, y: f64) -> bool {
        self.bldgs.iter().any(|s| {
            let p = s.kind.def().power;
            s.team == team && s.done && p > 0.0 && dist(s.x, s.y, x, y) <= p * TILE
        })
    }
}
