//! Seats and teams: how many play, who is allied with whom, each seat's start, and who is out (the end of the game:
//! the last team standing wins).

use super::*;

impl World {
    /// How many seats play (2 for now; up to `MAX_SEATS` once the maps have the starts for them).
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
    /// False (nothing changes) otherwise.
    pub fn set_teams(&mut self, teams: &[u8]) -> bool {
        let n = self.seats();
        if teams.len() != n
            || teams.iter().any(|&t| t as usize >= n)
            || teams.iter().all(|&t| t == teams[0])
        {
            return false;
        }
        self.teams = teams.to_vec();
        true
    }

    /// Every per-seat list of the game's state, fresh for each seat (a new game).
    pub(super) fn clear_seats(&mut self) {
        self.out.clear();
        self.res.clear();
        self.sup.clear();
        self.explored.clear();
        self.vis.clear();
        self.det.clear();
        self.stats.clear();
        self.army_log.clear();
        self.lost_to.clear();
        self.upgrades.clear();
        self.unseen_alert.clear();
        for _ in 0..self.seats() {
            self.push_seat();
        }
    }
    /// One more seat's fresh entry on every per-seat list of the game's state.
    fn push_seat(&mut self) {
        let tiles = (MW * MH) as usize;
        self.out.push(false);
        self.res.push([50, 0]);
        self.sup.push([0, 0]);
        self.explored.push(vec![0; tiles]);
        self.vis.push(vec![0; tiles]);
        self.det.push(vec![0; tiles]);
        self.stats.push(Stats::default());
        self.army_log.push(Vec::new());
        self.lost_to.push(Vec::new());
        self.upgrades.push([0; UPGRADES.len()]);
        self.unseen_alert.push(f64::MIN);
    }

    /// A seat's start at its base: the headquarters and four harvesters at work.
    pub(super) fn deal_start(&mut self, team: u8) {
        let (bx, by) = self.map.bases[team as usize];
        let faction = self.factions[team as usize];
        self.make_building(faction.hq, team, bx, by, true);
        // Four harvesters, each between the Core and one of the four crystals nearest it, mining that crystal:
        // the same start for both sides (the map is mirrored), whichever way the base faces.
        let (cx, cy) = (bx as f64 + 2.0, by as f64 + 2.0);
        let mut near: Vec<(f64, Id, i32, i32)> = self
            .map
            .nodes
            .iter()
            .filter(|n| !n.ether)
            .map(|n| {
                (
                    jsmath::hypot(n.tx as f64 + 0.5 - cx, n.ty as f64 + 0.5 - cy),
                    n.id,
                    n.tx,
                    n.ty,
                )
            })
            .collect();
        near.sort_by(|p, q| p.0.partial_cmp(&q.0).unwrap().then(p.1.cmp(&q.1)));
        for &(d, node, nx, ny) in near.iter().take(4) {
            let k = 3.0 / d.max(3.0); // three tiles out from the Core's centre, towards the crystal
            let at = (
                jsmath::to_i32(cx + (nx as f64 + 0.5 - cx) * k),
                jsmath::to_i32(cy + (ny as f64 + 0.5 - cy) * k),
            );
            let f = self.map.nearest_free(at.0, at.1, 4).unwrap_or((bx, by + 5));
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

    /// One more seat (tests only, until M4's maps have more starts): its start dealt at `base` (the top-left tile of its
    /// headquarters), on its own team, played by a person. Call before the first step; a `reset` regenerates the
    /// map, which has no start for it, and refuses.
    #[doc(hidden)]
    pub fn add_seat(&mut self, faction: &'static Faction, base: (i32, i32)) -> u8 {
        assert!(self.seats() < MAX_SEATS, "no seat left");
        let seat = self.seats() as u8;
        self.factions.push(faction);
        self.teams.push(seat);
        self.ai_seats.push(false);
        self.ai.push(None);
        self.map.bases.push(base);
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
        self.knock_out(seat);
    }

    /// `seat` is out; the game is over once the seats still in are all one team (the winner).
    fn knock_out(&mut self, seat: u8) {
        self.out[seat as usize] = true;
        let mut left = (0..self.seats())
            .filter(|&s| !self.out[s])
            .map(|s| self.teams[s]);
        let first = left.next();
        if left.all(|t| Some(t) == first) {
            self.over = true;
            self.winner = first.map_or(-1, |t| t as i32);
        }
    }

    pub(crate) fn check_end(&mut self) {
        if self.over {
            return;
        }
        // A seat is out with no buildings left, except that a person's seat still has a chance while a worker of
        // theirs lives (it can build again); the AI's does not wait for that. It is also out when nothing of it can
        // act any more: no headquarters that stands or will (a planted site grows by itself), no worker, no fighter,
        // and no factory with a unit in training or the means to train one (a few Depots do not keep a game going).
        // The last seat is checked first (with two: seat 1, then seat 0).
        let out = |w: &World, t: u8| {
            let worker = w.units.iter().any(|u| u.team == t && u.kind.def().worker);
            let fighter = w.units.iter().any(|u| u.team == t && u.kind.def().threat());
            let mine = || w.bldgs.iter().filter(move |b| b.team == t);
            let hq = mine().any(|b| b.kind.def().hq && (b.done || b.planted));
            let factory = mine().any(|b| {
                b.done
                    && (!b.queue.is_empty()
                        || b.kind.def().trains.iter().any(|k| {
                            k.def().threat()
                                && k.def()
                                    .req
                                    .is_none_or(|r| mine().any(|o| o.kind == r && o.done))
                                && w.can_afford(t, k.def().cost)
                        }))
            });
            let none = mine().next().is_none();
            (none && (w.is_ai(t) || !worker)) || !(hq || worker || fighter || factory)
        };
        for loser in (0..self.seats() as u8).rev() {
            if !self.out[loser as usize] && out(self, loser) {
                self.knock_out(loser);
                if self.over {
                    return;
                }
            }
        }
    }
}
