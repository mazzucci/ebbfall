//! Combat: choosing targets, firing, projectiles, damage, death, the medic, alerts and the end of the game.

use super::*;

/// Shields take a hit first, at full value (armor protects only the hull); returns what is left for the hull.
/// Being hit restarts the wait before shields regenerate.
fn absorb(sh: &mut f64, maxsh: f64, hit_at: &mut f64, now: f64, amt: f64) -> f64 {
    if maxsh <= 0.0 {
        return amt; // no shields at all (a race without them): nothing changes
    }
    *hit_at = now;
    let took = sh.min(amt);
    *sh -= took;
    amt - took
}

impl World {
    /// The levels a team has of every upgrade with this effect, added up.
    pub fn effect_level(&self, team: u8, effect: Effect) -> u8 {
        UPGRADES
            .iter()
            .filter(|u| u.def().effect == effect)
            .map(|u| self.upgrades[team as usize][u.index()])
            .sum()
    }

    /// Extra damage a unit kind deals with its team's weapon upgrades.
    pub fn weapon_bonus(&self, team: u8, per_level: f64) -> f64 {
        per_level * self.effect_level(team, Effect::Weapons) as f64
    }

    // ---- combat ----
    /// The best enemy in range for a weapon that `hits` (ground, air), shooting from (x, y), for a shooter that
    /// flies or not (`flier`). Priority first (see `threat_tier`: whatever can hurt the shooter, then other units,
    /// then plain buildings), then distance.
    #[allow(clippy::too_many_arguments)]
    pub fn find_target(
        &self,
        x: f64,
        y: f64,
        team: u8,
        range: f64,
        only_units: bool,
        hits: (bool, bool),
        flier: bool,
    ) -> Option<Id> {
        let mut best: Option<(u8, f64, Id)> = None;
        let mut consider = |tier: u8, d: f64, id: Id| {
            if d < range && best.is_none_or(|(bt, bd, _)| (tier, d) < (bt, bd)) {
                best = Some((tier, d, id));
            }
        };
        for u in &self.units {
            let air = u.kind.def().air;
            if u.team == team || (air && !hits.1) || (!air && !hits.0) {
                continue;
            }
            consider(unit_tier(u.kind, flier), dist(u.x, u.y, x, y) - u.r, u.id);
        }
        if !only_units && hits.0 {
            for b in &self.bldgs {
                if b.team == team {
                    continue;
                }
                let g = Geo::Rect {
                    tx: b.tx,
                    ty: b.ty,
                    w: b.w,
                    h: b.h,
                    x: b.x,
                    y: b.y,
                    r: b.r,
                };
                let tier = if b.done && b.kind.def().damage_vs(flier) > 0.0 {
                    0
                } else {
                    2
                };
                consider(tier, g.edge_dist(x, y), b.id);
            }
        }
        best.map(|(_, _, id)| id)
    }

    /// How urgent a target is for a shooter that flies or not: 0 it can hurt the shooter (a fighting unit or a
    /// finished turret armed against its layer), 1 another unit, 2 a building that cannot shoot back.
    pub fn threat_tier(&self, id: Id, flier: bool) -> u8 {
        if let Some(u) = self.unit(id) {
            return unit_tier(u.kind, flier);
        }
        match self.bldg(id) {
            Some(b) if b.done && b.kind.def().damage_vs(flier) > 0.0 => 0,
            _ => 2,
        }
    }

    /// Whether `shooter` (unit or building) has a weapon that can hit `target` (flying or not).
    pub fn can_hit(&self, shooter: Id, target: Id) -> bool {
        let air = self.unit(target).is_some_and(|u| u.kind.def().air);
        if self.unit(target).is_none() && self.bldg(target).is_none() {
            return false;
        }
        if let Some(u) = self.unit(shooter) {
            u.kind.def().damage_vs(air) > 0.0
        } else {
            self.bldg(shooter)
                .is_some_and(|b| b.kind.def().damage_vs(air) > 0.0)
        }
    }
    /// (can hit ground, can hit air) for a unit kind.
    pub(crate) fn hits_of(kind: UnitKind) -> (bool, bool) {
        let d = kind.def();
        (d.dmg > 0.0, d.dmg_air > 0.0)
    }

    /// Tell the player when something of theirs comes under attack: once per fight. A hit is quiet if any alert in
    /// the last ALERT_GAP seconds was within ALERT_DIST px (so several simultaneous fights each alert once), except
    /// that the first hit on a building gets through after alerts about units only.
    pub(crate) fn alert_attacked(&mut self, target: Id) {
        const ALERT_GAP: f64 = 12.0;
        const ALERT_DIST: f64 = 480.0;
        let Some((x, y, team, building)) = self
            .unit(target)
            .map(|u| (u.x, u.y, u.team, false))
            .or_else(|| self.bldg(target).map(|b| (b.x, b.y, b.team, true)))
        else {
            return;
        };
        if team != PLAYER {
            return;
        }
        let now = self.time;
        self.alerts.retain(|a| now - a.0 < ALERT_GAP);
        let quiet = self
            .alerts
            .iter()
            .any(|&(_, ax, ay, ab)| dist(x, y, ax, ay) < ALERT_DIST && (ab || !building));
        if quiet {
            return;
        }
        self.alerts.push((now, x, y, building));
        self.emit(Event::Attacked { x, y, building });
    }

    pub fn damage(&mut self, target: Id, amt: f64, by: Option<Id>) {
        let by = by.filter(|&b| self.team_of(b).is_some());
        if by.is_some_and(|b| self.team_of(b) != self.team_of(target)) {
            self.alert_attacked(target);
        }
        if let Some(i) = self.ui(target) {
            let armor_up = self.effect_level(self.units[i].team, Effect::Armor) as f64;
            let now = self.time;
            let u = &mut self.units[i];
            let rest = absorb(&mut u.sh, u.maxsh, &mut u.hit_at, now, amt);
            if rest > 0.0 {
                u.hp -= (rest - u.kind.def().armor - armor_up).max(1.0);
            }
            u.flash = 0.12;
            if let Some(by) = by {
                let (ux, uy, team) = (u.x, u.y, u.team);
                let by_air = self.unit(by).is_some_and(|b| b.kind.def().air);
                let me_air = self.units[i].kind.def().air;
                // Busy with a target it picked up itself that matters less than the one shooting it: answer.
                let lesser = match self.units[i].task {
                    Task::Attack {
                        target: cur,
                        back: Some(_),
                    } => self.threat_tier(cur, me_air) > self.threat_tier(by, me_air),
                    _ => false,
                };
                let u = &mut self.units[i];
                let answers = !u.kind.def().worker && u.kind.def().damage_vs(by_air) > 0.0;
                match u.task {
                    Task::Idle | Task::AMove { .. } if answers => {
                        // Idle: come back to this spot afterwards (and the leash applies).
                        let back = match u.task {
                            Task::AMove { x, y } => Some(Back { x, y, amove: true }),
                            _ => Some(Back {
                                x: u.x,
                                y: u.y,
                                amove: false,
                            }),
                        };
                        u.task = Task::Attack { target: by, back };
                    }
                    Task::Attack { ref mut target, .. } if answers && lesser => *target = by,
                    _ => {}
                }
                for a in self.nearby(ux, uy, 180.0) {
                    if let Some(j) = self.ui(a) {
                        let o = &mut self.units[j];
                        if o.team != team
                            || o.kind.def().worker
                            || o.kind.def().damage_vs(by_air) <= 0.0
                        {
                            continue;
                        }
                        if o.task == Task::Idle {
                            o.task = Task::Attack {
                                target: by,
                                back: Some(Back {
                                    x: o.x,
                                    y: o.y,
                                    amove: false,
                                }),
                            };
                        }
                    }
                }
            }
            if self.units[self.ui(target).unwrap()].hp <= 0.0 {
                self.kill(target);
            }
        } else if let Some(i) = self.bi(target) {
            let now = self.time;
            let b = &mut self.bldgs[i];
            let rest = absorb(&mut b.sh, b.maxsh, &mut b.hit_at, now, amt);
            if rest > 0.0 {
                b.hp -= (rest - b.kind.def().armor).max(1.0);
            }
            b.flash = 0.12;
            if b.hp <= 0.0 {
                self.kill(target);
            }
        }
    }

    pub(crate) fn kill(&mut self, id: Id) {
        let team;
        if let Some(i) = self.ui(id) {
            let u = self.units.remove(i);
            team = u.team;
            if u.last_node.is_some()
                && let Task::Gather {
                    node,
                    phase: Phase::Mine,
                    ..
                } = u.task
                && let Some(n) = self.map.node_mut(node)
            {
                n.miners -= 1;
            }
            self.emit(Event::Burst {
                x: u.x,
                y: u.y,
                r: u.r,
                team,
                n: 10,
            });
            if team == PLAYER {
                self.stats.lost += 1;
            } else {
                self.stats.killed += 1;
            }
            self.emit(Event::Sfx(if team == PLAYER { "lost" } else { "kill" }));
            self.graveyard.push(u);
        } else if let Some(i) = self.bi(id) {
            let b = self.bldgs.remove(i);
            team = b.team;
            for y in 0..b.h {
                for x in 0..b.w {
                    self.map.occ[idx(b.tx + x, b.ty + y)] = b.vent.map_or(0, |v| -(v as i32));
                }
            }
            if let Some(n) = b.vent.and_then(|v| self.map.node_mut(v)) {
                n.extractor = None;
            }
            for q in &b.queue {
                self.pay(team, q.def().cost, 1);
            }
            if let Some((up, _)) = b.research {
                let level = self.upgrades[team as usize][up.index()] + 1;
                self.pay(team, up.cost(level), 1);
            }
            for u in self.units.iter_mut() {
                if u.task == (Task::Build { b: id }) {
                    u.task = Task::Idle;
                }
            }
            self.emit(Event::Burst {
                x: b.x,
                y: b.y,
                r: b.r,
                team,
                n: 24,
            });
            if team != PLAYER {
                self.stats.razed += 1;
            }
            if team == PLAYER {
                self.toast(format!("{} destroyed", b.kind.def().name), true);
            }
        } else {
            return;
        }
        self.recalc_supply(team);
        self.check_end();
    }

    pub(crate) fn check_end(&mut self) {
        if self.over {
            return;
        }
        let pb = self.bldgs.iter().any(|b| b.team == PLAYER);
        let eb = self.bldgs.iter().any(|b| b.team == ENEMY);
        if !eb {
            self.over = true;
            self.winner = PLAYER as i32;
        } else if !pb
            && !self
                .units
                .iter()
                .any(|u| u.team == PLAYER && u.kind.def().worker)
        {
            self.over = true;
            self.winner = ENEMY as i32;
        }
    }

    pub(crate) fn fire(&mut self, shooter: Id, target: Id) {
        let air = self.unit(target).is_some_and(|u| u.kind.def().air);
        let (x, y, team, dmg, cd, proj, up, splash) = if let Some(u) = self.unit(shooter) {
            let d = u.kind.def();
            (
                u.x,
                u.y,
                u.team,
                d.damage_vs(air),
                d.cd,
                d.proj,
                d.up_dmg,
                (d.splash, d.splash_r),
            )
        } else {
            let b = self.bldg(shooter).unwrap();
            let d = b.kind.def();
            (
                b.x,
                b.y,
                b.team,
                d.damage_vs(air),
                d.cd,
                d.proj,
                d.up_dmg,
                (0.0, 0.0),
            )
        };
        if dmg <= 0.0 {
            return; // this weapon cannot hit that target
        }
        let dmg = dmg + self.weapon_bonus(team, up);
        if let Some(i) = self.ui(shooter) {
            self.units[i].cd = cd;
        } else if let Some(b) = self.bm(shooter) {
            b.cd = cd;
        }
        match proj {
            Some(kind) => {
                let speed = match kind {
                    ProjKind::Shell => 300.0,
                    ProjKind::Missile => 340.0,
                    ProjKind::Bolt => 460.0,
                };
                self.projs.push(Proj {
                    x,
                    y,
                    target,
                    speed,
                    dmg,
                    kind,
                    by: shooter,
                    team,
                    splash: splash.0,
                    splash_r: splash.1,
                });
                if team == PLAYER || self.visible(shooter) {
                    let weapon = match kind {
                        ProjKind::Bolt => "bolt",
                        ProjKind::Shell => "shell",
                        ProjKind::Missile => "missile",
                    };
                    self.emit(Event::Fire { x, y, weapon });
                }
            }
            None => {
                if team == PLAYER || self.visible(shooter) {
                    self.emit(Event::Fire {
                        x,
                        y,
                        weapon: "melee",
                    });
                }
                self.damage(target, dmg, Some(shooter))
            }
        }
    }

    /// A Medic heals the most hurt friendly infantry within HEAL_RANGE that no other Medic healed this tick (so two
    /// Medics tend two patients rather than doubling up on one); when idle with nobody in range it walks toward hurt
    /// infantry it can see.
    pub(crate) fn medic(&mut self, uid: Id, dt: f64) {
        const HEAL_RANGE: f64 = 2.5 * TILE;
        let (mx, my, team, heal, sight, idle) = {
            let u = self.u(uid);
            (
                u.x,
                u.y,
                u.team,
                u.kind.def().heal,
                u.kind.def().sight * TILE,
                u.task == Task::Idle,
            )
        };
        let mut best: Option<(f64, Id, f64)> = None; // (hp fraction, id, distance)
        let mut seek: Option<(f64, f64, f64)> = None; // nearest hurt ally in sight: (distance, x, y)
        for o in &self.units {
            if o.id == uid || o.team != team || !o.kind.def().bio || o.hp >= o.maxhp {
                continue;
            }
            let d = dist(o.x, o.y, mx, my) - o.r;
            if d <= HEAL_RANGE {
                if o.healed_at == self.tick {
                    continue; // another Medic has this one (and a spare Medic need not walk to it)
                }
                let f = o.hp / o.maxhp;
                if best.is_none_or(|(bf, bid, _)| f < bf || (f == bf && o.id < bid)) {
                    best = Some((f, o.id, d));
                }
            } else if d <= sight && seek.is_none_or(|(sd, _, _)| d < sd) {
                seek = Some((d, o.x, o.y));
            }
        }
        if let Some((_, pid, _)) = best {
            let i = self.ui(pid).unwrap();
            let tick = self.tick;
            let p = &mut self.units[i];
            p.hp = (p.hp + heal * dt).min(p.maxhp);
            p.healed_at = tick;
            let (tx, ty) = (p.x, p.y);
            let u = self.um(uid);
            u.face = jsmath::atan2(ty - my, tx - mx);
            u.heal_fx -= dt;
            if u.heal_fx <= 0.0 {
                u.heal_fx = 0.4;
                self.emit(Event::Heal {
                    x: mx,
                    y: my,
                    tx,
                    ty,
                });
            }
        } else if let (true, Some((_, sx, sy))) = (idle, seek) {
            self.move_to(uid, sx, sy);
        }
    }

    pub(crate) fn update_projs(&mut self, dt: f64) {
        let mut i = self.projs.len();
        while i > 0 {
            i -= 1;
            let p = self.projs[i].clone();
            let Some(t) = self
                .geo(p.target)
                .filter(|_| self.team_of(p.target).is_some())
            else {
                self.projs.remove(i);
                continue;
            };
            let tp = t.aim_point(p.x, p.y);
            let d = dist(p.x, p.y, tp.0, tp.1);
            let mv = p.speed * dt;
            if d <= mv + t.r() * 0.3 {
                // A splashing shot also hurts the target's walking neighbours (the counter to clumped infantry).
                let splash: Vec<Id> = if p.splash > 0.0 {
                    let team = self.team_of(p.target);
                    self.units
                        .iter()
                        .filter(|u| {
                            u.id != p.target
                                && Some(u.team) == team
                                && !u.kind.def().air
                                && dist(u.x, u.y, tp.0, tp.1) < p.splash_r
                        })
                        .map(|u| u.id)
                        .collect()
                } else {
                    Vec::new()
                };
                self.damage(p.target, p.dmg, Some(p.by));
                for s in splash {
                    if self.unit(s).is_some() {
                        self.damage(s, p.dmg * p.splash, Some(p.by));
                    }
                }
                self.emit(Event::Hit {
                    x: tp.0,
                    y: tp.1,
                    big: p.kind == ProjKind::Shell,
                });
                self.projs.remove(i);
            } else {
                let q = &mut self.projs[i];
                q.x += (tp.0 - q.x) / d * mv;
                q.y += (tp.1 - q.y) / d * mv;
            }
        }
    }
    /// Idle: wait, and go for an enemy that comes into sight. Hold: shoot what comes into range, never move.
    pub(crate) fn update_idle(&mut self, uid: Id, hold: bool, c: Fighter, dt: f64) {
        let u = self.um(uid);
        u.aggro_cd -= dt;
        if c.combat && u.aggro_cd <= 0.0 {
            u.aggro_cd = 0.3;
            let (ux, uy) = (u.x, u.y);
            let rng = if hold {
                c.range + c.r
            } else {
                c.sight * TILE * 0.85
            };
            if let Some(t) = self.find_target(ux, uy, c.team, rng, false, c.hits, c.kind.def().air)
            {
                let (tx, ty) = self.geo(t).unwrap().center();
                if hold {
                    if self.u(uid).cd <= 0.0 {
                        self.fire(uid, t);
                    }
                    let u = self.um(uid);
                    u.face = jsmath::atan2(ty - u.y, tx - u.x);
                } else {
                    self.um(uid).task = Task::Attack {
                        target: t,
                        back: Some(Back {
                            x: ux,
                            y: uy,
                            amove: false,
                        }),
                    };
                }
            }
        }
    }

    /// Attack-move: walk to (x, y), turning on any enemy met on the way.
    pub(crate) fn update_amove(&mut self, uid: Id, x: f64, y: f64, c: Fighter, dt: f64) {
        let u = self.um(uid);
        u.aggro_cd -= dt;
        if u.aggro_cd <= 0.0 {
            u.aggro_cd = 0.3;
            let (ux, uy) = (u.x, u.y);
            let t = self.find_target(
                ux,
                uy,
                c.team,
                c.sight * TILE * 0.85,
                false,
                c.hits,
                c.kind.def().air,
            );
            if let (Some(t), true) = (t, c.combat) {
                self.um(uid).task = Task::Attack {
                    target: t,
                    back: Some(Back { x, y, amove: true }),
                };
                return;
            }
        }
        self.update_move(uid, x, y, dt);
    }

    /// Attack a target; a self-picked one gives way to a bigger threat and is let go well out of sight.
    pub(crate) fn update_attack(
        &mut self,
        uid: Id,
        target: Id,
        back: Option<Back>,
        c: Fighter,
        dt: f64,
    ) {
        let Some(t) = self.geo(target).filter(|_| self.team_of(target).is_some()) else {
            match back {
                Some(b) if b.amove => self.attack_move(uid, b.x, b.y),
                Some(b) => self.move_to(uid, b.x, b.y),
                None => self.resume_after(uid),
            }
            return;
        };
        // A target picked up on the way gives way to something that matters more: anything in sight that can
        // shoot us, or a unit in weapon range instead of a plain building. An explicit attack order stands.
        if let Some(b) = back
            && c.combat
        {
            let (ux, uy) = (self.u(uid).x, self.u(uid).y);
            // The leash: a target that got well out of sight is let go, and the unit goes back to what it
            // was doing (an Observer cannot lead an army around the map).
            if t.edge_dist(ux, uy) > c.sight * TILE * 1.5 {
                if b.amove {
                    self.attack_move(uid, b.x, b.y);
                } else {
                    self.move_to(uid, b.x, b.y);
                }
                return;
            }
            if self.u(uid).aggro_cd <= 0.0 {
                self.um(uid).aggro_cd = 0.5;
                let flier = c.kind.def().air;
                let now = self.threat_tier(target, flier);
                let seen = c.sight * TILE * 0.85;
                let better = self
                    .find_target(ux, uy, c.team, seen, false, c.hits, flier)
                    .filter(|&t2| self.threat_tier(t2, flier) == 0)
                    .or_else(|| {
                        self.find_target(ux, uy, c.team, c.range + c.r, false, c.hits, flier)
                    })
                    .filter(|&t2| self.threat_tier(t2, flier) < now);
                if let Some(t2) = better
                    && let Task::Attack { target, .. } = &mut self.um(uid).task
                {
                    *target = t2;
                }
            }
        }
        self.um(uid).aggro_cd -= dt;
        // Like the JS, this tick still closes on and fires at the original target.
        if self.approach(uid, t, c.range + c.r * 0.5, dt) && self.u(uid).cd <= 0.0 {
            self.fire(uid, target);
        }
    }

    /// Shields come back after SHIELD_DELAY s without a hit: units faster than buildings; a site under
    /// construction keeps what it has. The hull never heals by itself.
    pub(crate) fn regen_shields(&mut self, dt: f64) {
        let now = self.time;
        for u in &mut self.units {
            if u.sh < u.maxsh && now - u.hit_at >= SHIELD_DELAY {
                u.sh = (u.sh + SHIELD_REGEN_UNIT * dt).min(u.maxsh);
            }
        }
        for b in &mut self.bldgs {
            if b.done && b.sh < b.maxsh && now - b.hit_at >= SHIELD_DELAY {
                b.sh = (b.sh + SHIELD_REGEN_BLDG * dt).min(b.maxsh);
            }
        }
    }
}
