//! Orders (what the Game API and the AI ask for) and the rules that accept or refuse them: placing, paying, training, research, rally points.

use super::*;

impl World {
    pub fn can_place(&self, kind: BldgKind, tx: i32, ty: i32, team: u8) -> bool {
        let d = kind.def();
        if !in_map(tx, ty) || !in_map(tx + d.w - 1, ty + d.h - 1) {
            return false;
        }
        if d.on_vent {
            let nd = self
                .map
                .nodes
                .iter()
                .find(|n| n.ether && n.tx == tx && n.ty == ty);
            return match nd {
                Some(n) => {
                    n.extractor.is_none() && (team != PLAYER || self.explored[0][idx(tx, ty)] != 0)
                }
                None => false,
            };
        }
        for y in -1..=d.h {
            for x in -1..=d.w {
                let (xx, yy) = (tx + x, ty + y);
                if !in_map(xx, yy) {
                    continue;
                }
                let i = idx(xx, yy);
                let edge = x < 0 || y < 0 || x >= d.w || y >= d.h;
                if edge {
                    if self.map.occ[i] < 0 {
                        return false;
                    }
                    continue;
                }
                if self.map.rock[i] != 0 || self.map.occ[i] != 0 {
                    return false;
                }
                if team == PLAYER && self.explored[0][i] == 0 {
                    return false;
                }
            }
        }
        true
    }

    pub fn has_req(&self, team: u8, kind: BldgKind) -> bool {
        match kind.def().req {
            None => true,
            Some(r) => self
                .bldgs
                .iter()
                .any(|b| b.team == team && b.kind == r && b.done),
        }
    }
    pub fn can_afford(&self, team: u8, cost: [i32; 2]) -> bool {
        self.res[team as usize][0] >= cost[0] && self.res[team as usize][1] >= cost[1]
    }
    pub(crate) fn pay(&mut self, team: u8, cost: [i32; 2], sign: i32) {
        self.res[team as usize][0] += sign * cost[0];
        self.res[team as usize][1] += sign * cost[1];
    }
    pub(crate) fn short_of(&self, team: u8, cost: [i32; 2]) -> String {
        format!(
            "Not enough {}",
            if self.res[team as usize][0] < cost[0] {
                "shards"
            } else {
                "ether"
            }
        )
    }

    /// Queue a unit at a building; Err carries the message to show.
    pub fn queue_unit(&mut self, bid: Id, kind: UnitKind) -> Result<(), String> {
        let Some(b) = self.bldg(bid) else {
            return Err("Gone".into());
        };
        let (team, qlen) = (b.team, b.queue.len());
        if !b.done || !b.kind.def().trains.contains(&kind) {
            return Err(format!("{} cannot train that", b.kind.def().name));
        }
        let d = kind.def();
        if let Some(r) = d.req
            && !self
                .bldgs
                .iter()
                .any(|o| o.team == team && o.kind == r && o.done)
        {
            return Err(format!("Requires {}", r.def().name));
        }
        if qlen >= 5 {
            return Err("Queue is full".into());
        }
        if !self.can_afford(team, d.cost) {
            return Err(self.short_of(team, d.cost));
        }
        let s = self.sup[team as usize];
        if s[0] + d.supply > s[1] {
            return Err("Supply blocked. Build a Depot.".into());
        }
        self.pay(team, d.cost, -1);
        self.bm(bid).unwrap().queue.push(kind);
        self.recalc_supply(team);
        Ok(())
    }

    pub fn cancel_queue(&mut self, bid: Id, i: usize) {
        let Some(b) = self.bm(bid) else { return };
        if i >= b.queue.len() {
            return;
        }
        let t = b.queue.remove(i);
        if i == 0 {
            b.prog = 0.0;
        }
        let team = b.team;
        self.pay(team, t.def().cost, 1);
        self.recalc_supply(team);
    }

    /// Start researching the next level of `up` at a finished Foundry; Err carries the message to show.
    pub fn start_research(&mut self, bid: Id, up: Upgrade) -> Result<(), String> {
        let Some(b) = self.bldg(bid) else {
            return Err("Gone".into());
        };
        let team = b.team;
        if b.kind != BldgKind::Forge || !b.done {
            return Err("Research happens at a finished Foundry".into());
        }
        if b.research.is_some() {
            return Err("Already researching here".into());
        }
        let level = self.upgrades[team as usize][up.index()] + 1;
        if level > MAX_UPGRADE {
            return Err(format!("{} is fully upgraded", up.name()));
        }
        if self
            .bldgs
            .iter()
            .any(|o| o.team == team && o.research.is_some_and(|(u, _)| u == up))
        {
            return Err(format!("{} is already being researched", up.name()));
        }
        let cost = up.cost(level);
        if !self.can_afford(team, cost) {
            return Err(self.short_of(team, cost));
        }
        self.pay(team, cost, -1);
        self.bm(bid).unwrap().research = Some((up, 0.0));
        Ok(())
    }

    /// Stop the research at a building, refunding it in full.
    pub fn cancel_research(&mut self, bid: Id) {
        let Some(b) = self.bm(bid) else { return };
        let Some((up, _)) = b.research.take() else {
            return;
        };
        let team = b.team;
        let level = self.upgrades[team as usize][up.index()] + 1;
        self.pay(team, up.cost(level), 1);
    }

    pub fn set_rally(&mut self, bid: Id, x: f64, y: f64, node: Option<Id>) {
        if let Some(b) = self.bm(bid)
            && !b.kind.def().trains.is_empty()
        {
            b.rally = Some(Rally { x, y, node });
        }
    }

    pub(crate) fn release_mine(&mut self, uid: Id) {
        if let Task::Gather {
            node,
            phase: Phase::Mine,
            ..
        } = self.u(uid).task
            && let Some(n) = self.map.node_mut(node)
        {
            n.miners -= 1;
        }
    }

    pub fn move_to(&mut self, uid: Id, x: f64, y: f64) {
        self.release_mine(uid);
        self.um(uid).task = Task::Move { x, y };
        self.path_to(uid, x, y);
    }
    pub fn attack_move(&mut self, uid: Id, x: f64, y: f64) {
        self.release_mine(uid);
        self.um(uid).task = Task::AMove { x, y };
        self.path_to(uid, x, y);
    }
    pub fn attack_ent(&mut self, uid: Id, target: Id) {
        if self.team_of(target).is_none_or(|t| t == self.u(uid).team) || !self.can_hit(uid, target)
        {
            return;
        }
        self.release_mine(uid);
        let u = self.um(uid);
        u.task = Task::Attack { target, back: None };
        u.path = None;
        u.repath = 0.0;
    }
    pub fn stop_unit(&mut self, uid: Id) {
        self.release_mine(uid);
        let u = self.um(uid);
        u.task = Task::Idle;
        u.path = None;
    }
    pub fn hold_unit(&mut self, uid: Id) {
        self.release_mine(uid);
        let u = self.um(uid);
        u.task = Task::Hold;
        u.path = None;
    }

    /// Returns whether the order took effect (refused for non-harvesters and vents without our extractor).
    pub fn start_gather(&mut self, uid: Id, node: Id) -> bool {
        let u = self.u(uid);
        if u.kind != UnitKind::Harvester {
            return false;
        }
        let team = u.team;
        // A node that is gone was a depleted shard field; the gather update retargets from there.
        if self.map.node(node).is_some_and(|n| n.ether) && !self.extractor_ready(node, Some(team)) {
            if team == PLAYER {
                self.toast("Build an Ether Rig on the vent first", true);
            }
            return false;
        }
        self.release_mine(uid);
        let u = self.um(uid);
        u.last_node = Some(node);
        u.task = Task::Gather {
            node,
            phase: if u.carry != 0 {
                Phase::Return
            } else {
                Phase::Go
            },
            timer: 0.0,
        };
        u.path = None;
        u.repath = 0.0;
        true
    }

    /// Whether `uid` may work on building `b`: a harvester of the same team, and the building is unfinished.
    pub fn can_build(&self, uid: Id, b: Id) -> bool {
        match (self.unit(uid), self.bldg(b)) {
            (Some(u), Some(bd)) => u.kind == UnitKind::Harvester && u.team == bd.team && !bd.done,
            _ => false,
        }
    }

    /// Whether `uid` may repair building `b`: a harvester of the same team, and the building is finished and damaged.
    pub fn can_repair(&self, uid: Id, b: Id) -> bool {
        match (self.unit(uid), self.bldg(b)) {
            (Some(u), Some(bd)) => {
                u.kind == UnitKind::Harvester
                    && u.team == bd.team
                    && bd.done
                    && bd.maxhp - bd.hp >= 1.0
            }
            _ => false,
        }
    }

    /// Send a harvester to repair a damaged building of its team; other requests are ignored.
    pub fn start_repair(&mut self, uid: Id, b: Id) -> bool {
        if !self.can_repair(uid, b) {
            return false;
        }
        self.release_mine(uid);
        let u = self.um(uid);
        u.task = Task::Repair { b };
        u.path = None;
        u.repath = 0.0;
        u.stuck = 0.0;
        u.anchor = (u.x, u.y);
        true
    }

    /// Send a harvester to work on an unfinished building of its team; other requests are ignored.
    pub fn start_build(&mut self, uid: Id, b: Id) -> bool {
        if !self.can_build(uid, b) {
            return false;
        }
        self.release_mine(uid);
        let u = self.um(uid);
        u.task = Task::Build { b };
        u.path = None;
        u.repath = 0.0;
        u.stuck = 0.0;
        u.anchor = (u.x, u.y);
        true
    }

    /// Cancel an unfinished building: it is removed and 75% of its cost comes back.
    pub fn cancel_construction(&mut self, bid: Id) -> bool {
        let Some(i) = self.bi(bid).filter(|&i| !self.bldgs[i].done) else {
            return false;
        };
        let b = self.bldgs.remove(i);
        for y in 0..b.h {
            for x in 0..b.w {
                self.map.occ[idx(b.tx + x, b.ty + y)] = b.vent.map_or(0, |v| -(v as i32));
            }
        }
        if let Some(n) = b.vent.and_then(|v| self.map.node_mut(v)) {
            n.extractor = None;
        }
        let cost = b.kind.def().cost;
        self.pay(b.team, [cost[0] * 3 / 4, cost[1] * 3 / 4], 1);
        for u in self.units.iter_mut() {
            if u.task == (Task::Build { b: bid }) {
                u.task = Task::Idle;
                u.path = None;
            }
        }
        if b.team == PLAYER {
            self.toast(format!("{} cancelled", b.kind.def().name), false);
        }
        self.recalc_supply(b.team);
        self.check_end();
        true
    }

    /// Place and pay for a building; Err carries the message to show.
    pub fn place_building(
        &mut self,
        team: u8,
        kind: BldgKind,
        tx: i32,
        ty: i32,
        builder: Option<Id>,
    ) -> Result<Id, String> {
        let d = kind.def();
        if !self.can_place(kind, tx, ty, team) {
            return Err("Cannot build there".into());
        }
        if !self.has_req(team, kind) {
            return Err(format!("Requires {}", d.req.unwrap().def().name));
        }
        if !self.can_afford(team, d.cost) {
            return Err(self.short_of(team, d.cost));
        }
        self.pay(team, d.cost, -1);
        let b = self.make_building(kind, team, tx, ty, false);
        if let Some(h) = builder {
            self.start_build(h, b);
        }
        for u in self.units.iter_mut() {
            if u.team == team && u.path.is_some() {
                u.repath = u.repath.min(0.1);
            }
        }
        Ok(b)
    }

    /// Spread a group around a point in a loose square.
    pub fn formation(&mut self, ids: &[Id], x: f64, y: f64) {
        let mut us: Vec<(f64, Id)> = ids
            .iter()
            .filter_map(|&id| self.unit(id).map(|u| (u.x, u.id)))
            .collect();
        let n = us.len();
        if n == 0 {
            return;
        }
        let cols = (n as f64).sqrt().ceil();
        let sp = 28.0;
        us.sort_by(|p, q| p.0.partial_cmp(&q.0).unwrap().then(p.1.cmp(&q.1)));
        for (i, &(_, id)) in us.iter().enumerate() {
            let i = i as f64;
            let ox = (i % cols - (cols - 1.0) / 2.0) * sp;
            let oy = ((i / cols).floor() - ((n as f64 / cols).ceil() - 1.0) / 2.0) * sp;
            self.move_to(
                id,
                clamp(x + ox, 16.0, WW - 16.0),
                clamp(y + oy, 16.0, WH - 16.0),
            );
        }
    }
}
