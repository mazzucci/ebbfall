//! Combat: choosing targets, firing, projectiles, damage, death, the medic, alerts and the end of the game.

use super::*;

/// Shields take a hit first (armor protects only the hull; shield upgrades, `sh_armor`, soak that much of a hit that
/// lands on shields, at least 1 still landing); returns what is left for the hull. Being hit restarts the wait
/// before shields regenerate.
fn absorb(sh: &mut f64, maxsh: f64, hit_at: &mut f64, now: f64, amt: f64, sh_armor: f64) -> f64 {
    if maxsh <= 0.0 {
        return amt; // no shields at all (a race without them): nothing changes
    }
    *hit_at = now;
    if *sh <= 0.0 {
        return amt;
    }
    let on = if sh_armor > 0.0 {
        (amt - sh_armor).max(amt.min(1.0))
    } else {
        amt
    };
    let took = sh.min(on);
    *sh -= took;
    on - took
}

/// How far (px, to the patient's edge) a healer reaches: a Medic 2.5 tiles, a Halo (`mend`) 3.
fn heal_reach(mend: bool) -> f64 {
    (if mend { 3.0 } else { 2.5 }) * TILE
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
    /// flies or not (`flier`): nearer than `range` px (edge distance). A siege gun (`siege`: its blind ring, px) also
    /// takes nothing nearer than its ring and only what `team` sees (its sight and its allies': it outranges its own
    /// sight, so it needs a spotter); other shooters reach about as far as they see and take what is in reach, as
    /// a tile-centre sight test fails at its edge (an entrenched Vanguard, a Sovereign). Priority first (see
    /// `threat_tier`: whatever can hurt the shooter, then other units, then plain buildings), then distance.
    #[allow(clippy::too_many_arguments)]
    pub fn find_target(
        &self,
        x: f64,
        y: f64,
        team: u8,
        range: f64,
        siege: Option<f64>,
        only_units: bool,
        hits: (bool, bool),
        flier: bool,
    ) -> Option<Id> {
        let mut best: Option<(u8, f64, Id)> = None;
        let mut consider = |tier: u8, d: f64, id: Id| {
            if d < range
                && best.is_none_or(|(bt, bd, _)| (tier, d) < (bt, bd))
                && siege.is_none_or(|min| d >= min && self.seen_by(team, id))
            {
                best = Some((tier, d, id));
            }
        };
        for u in &self.units {
            let air = u.kind.def().air;
            if !self.enemies(team, u.team)
                || (air && !hits.1)
                || (!air && !hits.0)
                || self.cloaked_from(team, u)
            {
                continue;
            }
            consider(unit_tier(u.kind, flier), dist(u.x, u.y, x, y) - u.r, u.id);
        }
        if !only_units && hits.0 {
            for b in &self.bldgs {
                if !self.enemies(team, b.team) {
                    continue;
                }
                let g = b.geo();
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
        if self
            .team_of(shooter)
            .is_some_and(|t| self.hidden_from(t, target))
        {
            return false; // (cloaked and not detected)
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
        kind.def().weapon.map_or((false, false), |w| w.hits())
    }

    /// A unit's or building's weapon, with where it shoots from and its side; None if it is unarmed or gone.
    pub(crate) fn weapon_of(&self, id: Id) -> Option<(Weapon, f64, f64, u8)> {
        if let Some(u) = self.unit(id) {
            return u.kind.def().weapon.map(|w| (w, u.x, u.y, u.team));
        }
        let b = self.bldg(id)?;
        b.kind.def().weapon.map(|w| (w, b.x, b.y, b.team))
    }

    /// Tell a player when something of theirs comes under attack: once per fight. A hit is quiet if any alert of
    /// theirs in the last ALERT_GAP seconds was within ALERT_DIST px (so several simultaneous fights each alert once), except
    /// that the first hit on a building gets through after alerts about units only.
    pub(crate) fn alert_attacked(&mut self, target: Id, unseen: bool) {
        const ALERT_GAP: f64 = 12.0;
        const ALERT_DIST: f64 = 480.0;
        const UNSEEN_GAP: f64 = 30.0; // (the news that it takes a detector, not every hit)
        let Some((x, y, team, building)) = self
            .unit(target)
            .map(|u| (u.x, u.y, u.team, false))
            .or_else(|| self.bldg(target).map(|b| (b.x, b.y, b.team, true)))
        else {
            return;
        };
        let now = self.time;
        if unseen && now - self.unseen_alert[team as usize] >= UNSEEN_GAP {
            self.unseen_alert[team as usize] = now;
            self.alerts.push((team, now, x, y, building));
            self.emit(Event::Attacked {
                team,
                x,
                y,
                building,
                unseen,
            });
            return;
        }
        self.alerts.retain(|a| now - a.1 < ALERT_GAP);
        let quiet = self.alerts.iter().any(|&(at, _, ax, ay, ab)| {
            at == team && dist(x, y, ax, ay) < ALERT_DIST && (ab || !building)
        });
        if quiet {
            return;
        }
        self.alerts.push((team, now, x, y, building));
        self.emit(Event::Attacked {
            team,
            x,
            y,
            building,
            unseen: false,
        });
    }

    pub fn damage(&mut self, target: Id, amt: f64, by: Option<Id>) {
        let killer = by
            .and_then(|b| self.loss_slot(b))
            .or(self.hit_by.map(|h| h.0));
        let by = by.filter(|&b| self.team_of(b).is_some());
        // Whose kill it is, if it is one: the shooter's seat (a shot's, if the shooter is gone).
        let credit = by
            .and_then(|b| self.team_of(b))
            .or(self.hit_by.map(|h| h.1));
        if let (Some(b), Some(t)) = (by, self.team_of(target))
            && self.team_of(b) != Some(t)
        {
            self.alert_attacked(target, self.hidden_from(t, b));
        }
        // Hit by something it cannot see: an AI side takes a detector along with its army from now on (anywhere), and
        // at home (by one of its buildings) remembers where, for a tower. (No tower out in the field, in the enemy's
        // base.)
        if let (Some(b), Some(t)) = (by, self.team_of(target))
            && self.hidden_from(t, b)
            && self.ai[t as usize].is_some()
        {
            let home = self.geo(target).map(|g| g.center()).filter(|at| {
                self.bldgs
                    .iter()
                    .any(|o| o.team == t && dist(o.x, o.y, at.0, at.1) < 12.0 * TILE)
            });
            let ai = self.ai[t as usize].as_mut().unwrap();
            ai.unseen_hit = true;
            if home.is_some() {
                ai.cloak_hit = home;
            }
        }
        if let Some(i) = self.ui(target) {
            let team = self.units[i].team;
            let armor_up = self.effect_level(team, Effect::Armor) as f64;
            let sh_up = self.effect_level(team, Effect::Shields) as f64;
            let now = self.time;
            let u = &mut self.units[i];
            u.struck = now;
            let rest = absorb(&mut u.sh, u.maxsh, &mut u.hit_at, now, amt, sh_up);
            if rest > 0.0 {
                u.hp -= (rest - u.kind.def().armor - armor_up).max(1.0);
            }
            u.flash = 0.12;
            if let Some(by) = by {
                self.answer_fire(i, by);
            }
            if self.units[self.ui(target).unwrap()].hp <= 0.0 {
                if let Some(slot) = killer.filter(|&s| s != usize::MAX) {
                    self.count_loss(team, slot);
                }
                self.kill(target, credit);
            }
        } else if let Some(i) = self.bi(target) {
            let sh_up = self.effect_level(self.bldgs[i].team, Effect::Shields) as f64;
            let now = self.time;
            let b = &mut self.bldgs[i];
            let rest = absorb(&mut b.sh, b.maxsh, &mut b.hit_at, now, amt, sh_up);
            if rest > 0.0 {
                b.hp -= (rest - b.kind.def().armor).max(1.0);
            }
            b.flash = 0.12;
            if b.hp <= 0.0 {
                self.kill(target, credit);
            }
        }
    }

    /// Unit `i` was hit by `by`: it shoots back if it can (idle or attack-moving, or busy with a lesser target it
    /// picked up itself), and idle armed friends within 180 px join in.
    fn answer_fire(&mut self, i: usize, by: Id) {
        let u = &self.units[i];
        let (ux, uy, team) = (u.x, u.y, u.team);
        if self.hidden_from(team, by) {
            return; // shot at by something it cannot see
        }
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
                if o.team != team || o.kind.def().worker || o.kind.def().damage_vs(by_air) <= 0.0 {
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

    /// Where a kill by `by` (a unit or a turret) is counted in `lost_to`; None once it is gone.
    fn loss_slot(&self, by: Id) -> Option<usize> {
        match (self.unit(by), self.bldg(by)) {
            (Some(u), _) => Some(u.kind.index()),
            (_, Some(b)) => Some(UNIT_KINDS.len() + b.kind.index()),
            _ => None,
        }
    }

    /// One more of `team`'s units lost to what `slot` names, for the end screen.
    fn count_loss(&mut self, team: u8, slot: usize) {
        let row = &mut self.lost_to[team as usize];
        if row.len() <= slot {
            row.resize(UNIT_KINDS.len() + BLDG_KINDS.len(), 0);
        }
        row[slot] += 1;
    }

    /// `id` dies (a unit) or falls (a building), by `by`'s hand (a seat; the kill counts for an enemy only).
    pub(crate) fn kill(&mut self, id: Id, by: Option<u8>) {
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
            self.stats[team as usize].lost += 1;
            let by = by.filter(|&k| self.enemies(k, team));
            if let Some(k) = by {
                self.stats[k as usize].killed += 1;
            }
            self.sfx(team, "lost");
            if let Some(k) = by {
                self.sfx(k, "kill");
            }
            self.graveyard.push(u);
        } else if let Some(i) = self.bi(id) {
            let b = self.bldgs.remove(i);
            team = b.team;
            self.clear_footprint(&b);
            for q in &b.queue {
                self.pay(team, q.def().cost, 1);
            }
            if let Some((up, _)) = b.research {
                let level = self.upgrades[team as usize][up.index()] + 1;
                self.pay(team, up.cost(level), 1);
            }
            let crew: Vec<Id> = self
                .units
                .iter()
                .filter(|u| u.task == (Task::Build { b: id }))
                .map(|u| u.id)
                .collect();
            for u in crew {
                self.set_task(u, Task::Idle);
            }
            self.emit(Event::Burst {
                x: b.x,
                y: b.y,
                r: b.r,
                team,
                n: 24,
            });
            if let Some(k) = by.filter(|&k| self.enemies(k, team)) {
                self.stats[k as usize].razed += 1;
            }
            // Said only for what matters (the headquarters, a factory, a research building); the rest is the burst.
            let d = b.kind.def();
            if d.hq || !d.trains.is_empty() || !d.researches.is_empty() {
                self.toast(team, format!("{} destroyed", d.name), true);
            }
        } else {
            return;
        }
        self.recalc_supply(team);
        self.check_end();
    }

    /// A shot for the seats that see it (their own, or the shooter in their sight).
    fn fired(&mut self, shooter: Id, team: u8, x: f64, y: f64, weapon: &'static str) {
        let seen = self.seen_mask(team, shooter);
        if seen != 0 {
            self.emit(Event::Fire { x, y, weapon, seen });
        }
    }

    pub(crate) fn fire(&mut self, shooter: Id, target: Id) {
        let air = self.unit(target).is_some_and(|u| u.kind.def().air);
        let Some((w, x, y, team)) = self.weapon_of(shooter) else {
            return; // unarmed (or gone)
        };
        let cd = self.live_cd(shooter, w.cd);
        let (dmg, proj, up, splash) = (w.damage_vs(air), w.proj, w.up_dmg, (w.splash, w.splash_r));
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
                    by_slot: self.loss_slot(shooter).unwrap_or(usize::MAX),
                    team,
                    splash: splash.0,
                    splash_r: splash.1,
                });
                let sounds = self.factions[team as usize].sounds;
                let weapon = match kind {
                    ProjKind::Bolt => sounds[0],
                    ProjKind::Shell => sounds[1],
                    ProjKind::Missile => sounds[2],
                };
                self.fired(shooter, team, x, y, weapon);
            }
            None => {
                let melee = self.factions[team as usize].sounds[3];
                self.fired(shooter, team, x, y, melee);
                self.damage(target, dmg, Some(shooter))
            }
        }
    }

    /// A Medic heals the most hurt friendly infantry within 2.5 tiles that no other healer tended this tick (so two
    /// Medics tend two patients rather than doubling up on one); when idle with nobody in range it walks toward hurt
    /// allies it can see. A Halo (`mend`) does the same for shields, on any shielded ally, within 3 tiles.
    pub(crate) fn medic(&mut self, uid: Id, dt: f64) {
        let (mx, my, team, heal, mend, sight, idle) = {
            let u = self.u(uid);
            let d = u.kind.def();
            (
                u.x,
                u.y,
                u.team,
                d.heal,
                d.mend,
                d.sight * TILE,
                u.task == Task::Idle,
            )
        };
        let range = heal_reach(mend);
        // What this healer restores on a patient: (now, full), or None if it cannot tend it.
        let need = |o: &Unit| {
            if mend {
                (o.maxsh > 0.0).then_some((o.sh, o.maxsh))
            } else {
                o.kind.def().bio.then_some((o.hp, o.maxhp))
            }
        };
        let mut best: Option<(f64, Id, f64)> = None; // (hp fraction, id, distance)
        let mut seek: Option<(f64, f64, f64)> = None; // nearest hurt ally in sight: (distance, x, y)
        for o in &self.units {
            let Some((now, full)) = need(o).filter(|&(now, full)| now < full) else {
                continue;
            };
            if o.id == uid || o.team != team {
                continue;
            }
            let d = dist(o.x, o.y, mx, my) - o.r;
            if d <= range {
                if o.healed_at == self.tick {
                    continue; // another healer has this one (and a spare one need not walk to it)
                }
                let f = now / full;
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
            if mend {
                p.sh = (p.sh + heal * dt).min(p.maxsh);
            } else {
                p.hp = (p.hp + heal * dt).min(p.maxhp);
            }
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
                    mend,
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
                self.hit_by = Some((p.by_slot, p.team)); // (a kill still counts if the shooter died meanwhile)
                self.damage(p.target, p.dmg, Some(p.by));
                for s in splash {
                    if self.unit(s).is_some() {
                        self.damage(s, p.dmg * p.splash, Some(p.by));
                    }
                }
                self.hit_by = None;
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
    pub(crate) fn update_idle(&mut self, uid: Id, hold: bool, c: Live, dt: f64) {
        let u = self.um(uid);
        u.aggro_cd -= dt;
        if c.combat && u.aggro_cd <= 0.0 {
            u.aggro_cd = 0.3;
            let (ux, uy) = (u.x, u.y);
            // (an idle siege gun looks as far as it shoots: it sets up where it stands)
            let rng = if hold {
                c.range + c.r
            } else {
                c.siege.unwrap_or(c.sight * TILE * 0.85)
            };
            let flier = c.kind.def().air;
            if let Some(t) = self.find_target(ux, uy, c.team, rng, c.blind(), false, c.hits, flier)
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
    pub(crate) fn update_amove(&mut self, uid: Id, x: f64, y: f64, c: Live, dt: f64) {
        let u = self.um(uid);
        u.aggro_cd -= dt;
        if u.aggro_cd <= 0.0 {
            u.aggro_cd = 0.3;
            let (ux, uy) = (u.x, u.y);
            let t = self.find_target(
                ux,
                uy,
                c.team,
                c.siege.unwrap_or(c.sight * TILE * 0.85),
                c.blind(),
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
        // A healer keeps pace with the army: it walks on until a fighting ally is within its reach, then stays (and
        // heals) while that fight lasts, instead of walking through to arrive first.
        let d = c.kind.def();
        if !c.combat && d.heal > 0.0 && self.allies_fighting_near(uid, heal_reach(d.mend) * 0.8) {
            return;
        }
        self.update_move(uid, x, y, dt);
    }

    /// Whether an armed ally of `uid` is fighting (attacking something) within `r` px of it (edge distance).
    fn allies_fighting_near(&self, uid: Id, r: f64) -> bool {
        let u = self.u(uid);
        self.units.iter().any(|o| {
            o.id != uid
                && o.team == u.team
                && o.kind.def().threat()
                && matches!(o.task, Task::Attack { .. })
                && dist(o.x, o.y, u.x, u.y) - o.r < r
        })
    }

    /// Attack a target; a self-picked one gives way to a bigger threat and is let go well out of sight.
    /// Back to the march a fight interrupted, at the group's pace if it had one (the group re-forms).
    fn resume_back(&mut self, uid: Id, b: Back) {
        let pace = self.u(uid).pace;
        if b.amove {
            self.attack_move(uid, b.x, b.y);
        } else {
            self.move_to(uid, b.x, b.y);
        }
        self.um(uid).pace = pace;
    }

    pub(crate) fn update_attack(
        &mut self,
        uid: Id,
        target: Id,
        back: Option<Back>,
        c: Live,
        dt: f64,
    ) {
        let Some(t) = self
            .geo(target)
            .filter(|_| self.team_of(target).is_some() && !self.hidden_from(c.team, target))
        else {
            // A deployed siege gun takes the next target in its reach before packing up for the march.
            if let Some(reach) = c.siege.filter(|_| self.u(uid).mode.is_some()) {
                let (ux, uy, flier) = (self.u(uid).x, self.u(uid).y, c.kind.def().air);
                if let Some(t2) =
                    self.find_target(ux, uy, c.team, reach, c.blind(), false, c.hits, flier)
                    && let Task::Attack { target, .. } = &mut self.um(uid).task
                {
                    *target = t2;
                    return;
                }
            }
            match back {
                Some(b) => self.resume_back(uid, b),
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
                self.resume_back(uid, b);
                return;
            }
            if self.u(uid).aggro_cd <= 0.0 {
                self.um(uid).aggro_cd = 0.5;
                let flier = c.kind.def().air;
                let now = self.threat_tier(target, flier);
                let seen = c.sight * TILE * 0.85;
                let better = self
                    .find_target(ux, uy, c.team, seen, c.blind(), false, c.hits, flier)
                    .filter(|&t2| self.threat_tier(t2, flier) == 0)
                    .or_else(|| {
                        self.find_target(
                            ux,
                            uy,
                            c.team,
                            c.range + c.r,
                            c.blind(),
                            false,
                            c.hits,
                            flier,
                        )
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
        if let Some(reach) = c.siege {
            self.siege_attack(uid, target, t, back, c, reach, dt);
            return;
        }
        // Like the JS, this tick still closes on and fires at the original target.
        if self.approach(uid, t, c.range + c.r * 0.5, dt) && self.u(uid).cd <= 0.0 {
            self.fire(uid, target);
        }
    }

    /// A siege gun's attack: on the move it closes to its deployed `reach` of the target (px, its radius counted) and
    /// deploys there; deployed, it never walks: it fires at the target while it is between its blind ring and its
    /// reach and seen, else takes the best other one there, else goes back to what it was doing (packing up for it)
    /// or, sent at this target, holds. A target inside its blind ring is given up.
    #[allow(clippy::too_many_arguments)]
    fn siege_attack(
        &mut self,
        uid: Id,
        target: Id,
        t: Geo,
        back: Option<Back>,
        c: Live,
        reach: f64,
        dt: f64,
    ) {
        let u = self.u(uid);
        let (ux, uy, deployed, swap) = (u.x, u.y, u.mode.is_some(), u.swap);
        if swap > 0.0 {
            return; // settling in or packing up: neither walking nor firing
        }
        let d = t.edge_dist(ux, uy);
        let seen = self.seen_by(c.team, target);
        let in_band = d >= c.min && d < reach && seen;
        if !deployed {
            if d < c.min {
                match back {
                    Some(b) => self.resume_back(uid, b),
                    None => self.set_idle(uid),
                }
            } else if in_band {
                self.deploy(uid);
            } else {
                // (in reach but out of its side's sight: on until its own eyes see it)
                let close = if d < reach {
                    c.sight * TILE * 0.8
                } else {
                    reach - TILE * 0.5
                };
                self.approach(uid, t, close, dt);
            }
            return;
        }
        if in_band {
            let (cx, cy) = t.center();
            let u = self.um(uid);
            u.face = jsmath::atan2(cy - uy, cx - ux);
            if u.cd <= 0.0 {
                self.fire(uid, target);
            }
            return;
        }
        let flier = c.kind.def().air;
        if let Some(t2) = self.find_target(ux, uy, c.team, reach, c.blind(), false, c.hits, flier) {
            if let Task::Attack { target, .. } = &mut self.um(uid).task {
                *target = t2;
            }
            return;
        }
        match back {
            Some(b) => self.resume_back(uid, b),
            None => self.set_idle(uid),
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
