//! Seats and teams: how many play, who is allied with whom, each seat's start, and who is out (the end of the game:
//! the last team standing wins).

use super::*;

impl World {
    /// How many seats play (2 to `MAX_SEATS`, at most the map's starts: `map::max_starts`).
    pub fn seats(&self) -> usize {
        self.factions.len()
    }
    /// Whether seats `a` and `b` are on different teams: they fight (a seat is never its own enemy).
    pub fn enemies(&self, a: u8, b: u8) -> bool {
        self.teams[a as usize] != self.teams[b as usize]
    }
    /// Whether seats `a` and `b` are on one team (a seat is its own ally).
    pub fn allies(&self, a: u8, b: u8) -> bool {
        !self.enemies(a, b)
    }

    /// Choose each seat's team before play: a team id per seat, each below the number of seats, at least two teams.
    /// False (nothing changes) otherwise. The fog follows at once (allies share vision from the first frame). With
    /// fewer seats than starts the free starts go between teams (`map::team_starts`; each team a run of consecutive
    /// seats): a world that has not started is dealt again on that layout (the same map, the same draws).
    pub fn set_teams(&mut self, teams: &[u8]) -> bool {
        let n = self.seats();
        if teams.len() != n
            || teams.iter().any(|&t| t as usize >= n)
            || teams.iter().all(|&t| t == teams[0])
        {
            return false;
        }
        let k = crate::map::max_starts(self.map_size);
        let moved = self.tick == 0
            && n <= k
            && crate::map::team_starts(k, teams, self.side)
                != crate::map::team_starts(k, &self.teams, self.side);
        self.teams = teams.to_vec();
        if moved {
            self.reset(self.seed, self.diff); // (it ends with update_fog, on these teams)
        } else {
            self.refresh_radio(true); // (allies share range)
            self.update_fog();
        }
        true
    }

    /// Every per-seat list of the game's state, fresh for each seat (a new game).
    pub(super) fn clear_seats(&mut self) {
        self.out.clear();
        self.out_why.clear();
        self.res.clear();
        self.supply.clear();
        self.explored.clear();
        self.vis.clear();
        self.stats.clear();
        self.army_log.clear();
        self.lost_to.clear();
        self.ledger.clear();
        self.upgrades.clear();
        for _ in 0..self.seats() {
            self.push_seat();
        }
    }
    /// One more seat's fresh entry on every per-seat list of the game's state.
    fn push_seat(&mut self) {
        let tiles = (self.map_size.w * self.map_size.h) as usize;
        self.out.push(false);
        self.out_why.push(OutWhy::In);
        self.res.push([50, 0]);
        self.supply.push([0, 0]);
        self.explored.push(vec![0; tiles]);
        self.vis.push(vec![0; tiles]);
        self.stats.push(Stats::default());
        self.army_log.push(Vec::new());
        self.lost_to.push(Vec::new());
        self.ledger.push(Ledger::default());
        self.upgrades.push([0; UPGRADES.len()]);
    }

    /// A seat's start at its base: the headquarters and its people's `start_workers` at work (four Villagers, two Bots).
    pub(super) fn deal_start(&mut self, team: u8) {
        let (bx, by) = self.map.bases[team as usize];
        let faction = self.factions[team as usize];
        self.make_building(faction.hq, team, bx, by, true);
        // Its workers, each between the Core and one of the four tiles of the mine nearest it (the nearest tiles first),
        // all gathering there: the same start for every seat (the map is symmetric), whichever way the base faces.
        let (cx, cy) = (bx as f64 + 2.0, by as f64 + 2.0);
        let home = self
            .map
            .nodes
            .iter()
            .filter(|n| !n.ether)
            .map(|n| (jsmath::hypot(n.x / TILE - cx, n.y / TILE - cy), n.id))
            .min_by(|p, q| p.0.partial_cmp(&q.0).unwrap().then(p.1.cmp(&q.1)));
        let mut near: Vec<(f64, Id, i32, i32)> = Vec::new();
        if let Some(n) = home.and_then(|(_, id)| self.map.node(id)) {
            for (x, y) in (0..n.s).flat_map(|dy| (0..n.s).map(move |dx| (n.tx + dx, n.ty + dy))) {
                let d = jsmath::hypot(x as f64 + 0.5 - cx, y as f64 + 0.5 - cy);
                near.push((d, n.id, x, y));
            }
        }
        if near.len() > faction.start_workers {
            near.sort_by(|a, b| a.0.total_cmp(&b.0).then((a.3, a.2).cmp(&(b.3, b.2))));
            near.truncate(faction.start_workers);
        }
        for &(d, node, nx, ny) in &near {
            let k = 3.0 / d.max(3.0); // three tiles out from the Core's center, towards that tile
            let at = (
                jsmath::to_i32(cx + (nx as f64 + 0.5 - cx) * k),
                jsmath::to_i32(cy + (ny as f64 + 0.5 - cy) * k),
            );
            let f = self
                .map
                .nearest_passable_to(
                    self.foot(faction.worker),
                    at.0,
                    at.1,
                    4,
                    (cx * TILE, cy * TILE),
                )
                .unwrap_or((bx, by + 5));
            let u = self.make_unit(
                faction.worker,
                team,
                f.0 as f64 * TILE + 16.0,
                f.1 as f64 * TILE + 16.0,
            );
            self.start_gather(u, node);
        }
        self.recalc_supply(team);
    }

    /// One more seat (tests only): its start dealt at `base` (the top-left tile of its headquarters), on its own team,
    /// played by a person. Call before the first step; a `reset` regenerates the map, which has no start for it, and
    /// refuses.
    #[doc(hidden)]
    pub fn add_seat(&mut self, faction: &'static Faction, base: (i32, i32)) -> u8 {
        assert!(self.seats() < MAX_SEATS, "no seat left");
        let seat = self.seats() as u8;
        self.factions.push(faction);
        self.teams.push(seat);
        self.ai_seats.push(false);
        self.ai.push(None);
        self.map.bases.insert(seat as usize, base); // (before any start nobody took)
        self.push_seat();
        self.deal_start(seat);
        self.update_fog();
        seat
    }

    /// `seat` gives up: it is out (nothing if the game is over or it is out already). With every other seat still in
    /// on one team, that team wins.
    pub fn concede(&mut self, seat: u8) {
        if self.over || seat as usize >= self.seats() || self.out[seat as usize] {
            return;
        }
        self.conceded = seat as i32;
        self.knock_out(seat, OutWhy::Conceded);
    }

    /// `seat` is out; the game is over once the seats still in are all one team (the winner). While the game goes on
    /// (more than two seats), what the seat leaves behind is inert (`inert`): its units stop where they are (a miner
    /// lets go of its crystal) and do nothing more, nor do its buildings; they stay on the map, and can be destroyed.
    fn knock_out(&mut self, seat: u8, why: OutWhy) {
        self.out[seat as usize] = true;
        self.out_why[seat as usize] = why;
        let mut left = (0..self.seats())
            .filter(|&s| !self.out[s])
            .map(|s| self.teams[s]);
        let first = left.next();
        if left.all(|t| Some(t) == first) {
            self.over = true;
            self.winner = first.map_or(-1, |t| t as i32);
            return;
        }
        let ids: Vec<Id> = self
            .units
            .iter()
            .filter(|u| u.team == seat)
            .map(|u| u.id)
            .collect();
        for id in ids {
            self.release_mine(id);
            self.set_task(id, Task::Idle);
        }
    }

    /// Whether `seat`'s units and buildings are left out of the tick: it is out and the game goes on without it (they
    /// neither move, fire, mine, build, train nor research). Never in a duel: a seat out there ends the game.
    pub fn inert(&self, seat: u8) -> bool {
        self.out[seat as usize] && !self.over
    }

    pub(crate) fn check_end(&mut self) {
        if self.over {
            return;
        }
        // The last seat is checked first (with two: seat 1, then seat 0).
        for loser in (0..self.seats() as u8).rev() {
            if self.out[loser as usize] {
                continue;
            }
            if let Some(why) = self.beaten(loser) {
                self.knock_out(loser, why);
                if self.over {
                    return;
                }
            }
        }
    }

    /// Whether seat `t` is beaten, and how. Its last building fell: an AI's seat is out at once, a person's once no
    /// worker of theirs is left either (a worker can build again). Or, buildings standing, it has nothing left to fight
    /// with and no gold to train more: no finished headquarters, no worker, no fighter, and no finished factory with a
    /// unit in training or the gold to train a fighter (a few Cottages do not keep a game going, nor a broke Barracks:
    /// with the mines run dry, two such sides would never end).
    pub fn beaten(&self, t: u8) -> Option<OutWhy> {
        let worker = self
            .units
            .iter()
            .any(|u| u.team == t && u.kind.def().worker);
        let fighter = self
            .units
            .iter()
            .any(|u| u.team == t && u.kind.def().threat());
        let mine = || self.bldgs.iter().filter(move |b| b.team == t);
        if mine().next().is_none() && (self.is_ai(t) || !worker) {
            return Some(OutWhy::Buildings);
        }
        let hq = mine().any(|b| b.kind.def().hq && b.done);
        let factory = mine().any(|b| {
            b.done
                && (!b.queue.is_empty()
                    || b.kind.def().trains.iter().any(|k| {
                        k.def().threat()
                            && k.def()
                                .req
                                .is_none_or(|r| mine().any(|o| o.kind == r && o.done))
                            && self.can_afford(t, k.def().cost)
                            // (and room for it: an Expedition with no Data center nor Substation left has no grid)
                            && self.room(t) >= self.takes(t, *k)
                    }))
        });
        (!(hq || worker || fighter || factory)).then_some(OutWhy::Helpless)
    }
}
