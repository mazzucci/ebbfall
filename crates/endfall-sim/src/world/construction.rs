//! Building over time: construction and repair by harvesters, research and training in buildings.

use super::*;

impl World {
    /// A builder or repairer that stays put (walled in, site cut off, jammed on a corner) gives up instead of waiting
    /// forever: it goes idle and returns true. The position includes last tick's separation push.
    pub(crate) fn gave_up(&mut self, uid: Id, team: u8, dt: f64, what: &str) -> bool {
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
        let worker = self.factions[team as usize].worker.def().name;
        self.toast(team, format!("A {worker} cannot reach {what}"), true);
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
        if !self.approach_settled(uid, g, r + 8.0, SETTLE, dt) {
            self.gave_up(uid, team, dt, "the building to repair it");
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
            let msg = format!("{} to repair", self.factions[team as usize].not_enough());
            self.toast(team, msg, true);
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
            return; // (it rises only while a builder works on it: `update_build`)
        }
        let d = b.kind.def();
        if d.pays > 0.0 {
            self.pump(bid, dt);
        }
        let b = self.bm(bid).unwrap();
        if let Some(w) = d.weapon
            && b.cd <= 0.0
        {
            let (bx, by, team) = (b.x, b.y, b.team);
            if let Some(t) = self.find_target(
                bx,
                by,
                team,
                w.range * TILE,
                None, // (no tower is a siege gun)
                false,
                w.hits(),
                false, // (buildings stand on the ground)
            ) {
                let (tx, ty) = self.geo(t).unwrap().center();
                self.bm(bid).unwrap().aim = jsmath::atan2(ty - by, tx - bx);
                self.fire(bid, t);
            }
        }
        // (a building that trains only with another standing, the Portal with an Uplink: its training waits meanwhile)
        let (team, with) = (
            self.bldg(bid).unwrap().team,
            self.bldg(bid).unwrap().kind.def().trains_with,
        );
        let gate_open = with.is_none_or(|r| self.has_bldg(team, r));
        let b = self.bm(bid).unwrap();
        if let Some(&q) = b.queue.first()
            && gate_open
        {
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
                self.recalc_supply(team); // (Grid efficiency: its machines draw less from now)
                self.toast(team, format!("{} researched", up.level_name(level)), false);
                self.sfx(team, "researched");
                let (bx, by) = (self.bldg(bid).unwrap().x, self.bldg(bid).unwrap().y);
                self.ping(team, bx, by);
            } else {
                self.bm(bid).unwrap().research = Some((up, p));
            }
        }
    }

    /// A harvester building a site: walk to it, then raise it; when it is done, the crew waits beside it (a site lost or
    /// cancelled sends it back to work).
    pub(crate) fn update_build(&mut self, uid: Id, b: Id, r: f64, team: u8, dt: f64) {
        let Some(g) = self.bldg(b).filter(|bd| !bd.done).and_then(|_| self.geo(b)) else {
            self.resume_after(uid);
            return;
        };
        let reached = self.approach_settled(uid, g, r + 8.0, SETTLE, dt);
        if !reached && self.gave_up(uid, team, dt, "its building site") {
            return;
        }
        if reached {
            self.um(uid).stuck = 0.0;
            if self.advance_construction(b, dt) {
                self.finish_construction(b, Some(uid));
            }
        }
    }

    /// Construction progress for `dt` (a builder at work, of either people), at its side's rate
    /// (a `BuildSpeed` tech). True when it is done.
    pub(crate) fn advance_construction(&mut self, b: Id, dt: f64) -> bool {
        let team = self.bldg(b).unwrap().team;
        let rate = self.build_rate(team);
        let bd = self.bm(b).unwrap();
        let build = bd.kind.def().build;
        bd.progress += dt * rate / build;
        bd.hp = bd.maxhp.min(bd.hp + dt * rate / build * bd.maxhp * 0.9);
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

    /// How fast `team`'s buildings go up, as a multiple: `TECH_BUILD` with its construction tech, else 1.
    pub fn build_rate(&self, team: u8) -> f64 {
        if self.effect_level(team, Effect::BuildSpeed) > 0 {
            TECH_BUILD
        } else {
            1.0
        }
    }

    /// A building just finished: supply, the news, and its crew idle beside it (`builder`: the one who finished it):
    /// a builder does not go back to mining by itself (Stelian, Nov 12); the AI sends its own back.
    pub(crate) fn finish_construction(&mut self, b: Id, builder: Option<Id>) {
        let bd = self.bldg(b).unwrap();
        let (bteam, bx, by) = (bd.team, bd.x, bd.y);
        self.recalc_supply(bteam);
        // (no toast: the minimap ping and the chime say it; nothing pops up over a fight)
        self.ping(bteam, bx, by);
        self.sfx(bteam, "done");
        let others: Vec<Id> = self
            .units
            .iter()
            .filter(|o| Some(o.id) != builder && o.task == (Task::Build { b }))
            .map(|o| o.id)
            .collect();
        for o in others.into_iter().chain(builder) {
            self.set_idle(o);
        }
    }
}
