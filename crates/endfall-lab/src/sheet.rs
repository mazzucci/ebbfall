//! `sheet`: the formula sheet. One row per unit, from the sim's own tables, base stats with no upgrades (as
//! src/client/stats.js shows them); then a time-to-kill matrix by the sim's own damage rules (`absorb`, `hull_loss`).

use endfall_sim::data::{DT, FACTIONS, UNIT_KINDS, UnitKind, Weapon};
use endfall_sim::world::{absorb, hull_loss};
use std::fmt::Write;

const TILE: f64 = 32.0;

/// One row: a unit and its gun.
#[derive(Clone)]
pub struct Row {
    pub kind: UnitKind,
    pub race: &'static str,
    pub name: String,
    pub weapon: Option<Weapon>,
}

/// Every unit of both races, each race's in the order of `UNIT_KINDS`: those its buildings train and its worker.
pub fn rows() -> Vec<Row> {
    let mut out = Vec::new();
    for f in FACTIONS {
        let trains = |k: UnitKind| {
            k == f.worker
                || std::iter::once(f.hq)
                    .chain(f.build_basic.iter().copied())
                    .chain(f.build_advanced.iter().copied())
                    .any(|b| b.def().trains.contains(&k))
        };
        for k in UNIT_KINDS.into_iter().filter(|&k| trains(k)) {
            let d = k.def();
            out.push(Row {
                kind: k,
                race: f.name,
                name: d.name.to_string(),
                weapon: d.weapon,
            });
        }
    }
    out
}

impl Row {
    pub fn dps(&self, air: bool) -> f64 {
        self.weapon
            .map_or(0.0, |w| w.damage_vs(air) / fire_period(w.cd))
    }
    /// The better of its damage per second against ground and air: what the efficiency figures use.
    pub fn best_dps(&self) -> f64 {
        self.dps(false).max(self.dps(true))
    }
    pub fn ehp(&self) -> f64 {
        let d = self.kind.def();
        d.hp + d.shields
    }
    /// Its cost in gold (costs are `[gold, 0]`).
    pub fn cost(&self) -> f64 {
        self.kind.def().cost[0] as f64
    }
    /// Lanchester efficiency: damage per second x effective health over the cost squared.
    pub fn lanchester(&self) -> f64 {
        self.best_dps() * self.ehp() / self.cost().powi(2)
    }
    pub fn armed(&self) -> bool {
        self.best_dps() > 0.0
    }
}

/// The seconds between shots as the sim fires them: a weapon's cooldown is set to `cd` and counts down by a tick
/// (`DT`) each tick until it is spent, so 0.8 s fires every 25 ticks (0.833 s) and 1.2 s every 36.
pub fn fire_period(cd: f64) -> f64 {
    let (mut c, mut n) = (cd, 0u32);
    while c > 0.0 {
        c -= DT;
        n += 1;
    }
    n as f64 * DT
}

/// Seconds for one `attacker` to kill one `target` with no upgrades, standing in range: shots until the hull is gone,
/// each through the sim's `absorb` (shields first) and `hull_loss` (armor off, at least 1), the first at once and one
/// every `fire_period` after. None when it cannot hit it. (Models no shield regeneration, splash, healing or
/// abilities.)
pub fn time_to_kill(attacker: &Row, target: UnitKind) -> Option<f64> {
    let w = attacker.weapon?;
    let t = target.def();
    let dmg = w.damage_vs(t.air);
    if dmg <= 0.0 {
        return None;
    }
    let (mut sh, mut hp, mut hit_at) = (t.shields, t.hp, 0.0);
    let mut shots = 0u32;
    while hp > 0.0 {
        let rest = absorb(&mut sh, t.shields, &mut hit_at, 0.0, dmg, 0.0);
        if rest > 0.0 {
            hp -= hull_loss(rest, t.armor);
        }
        shots += 1;
    }
    Some((shots - 1) as f64 * fire_period(w.cd))
}

fn f1(v: f64) -> String {
    if v == 0.0 {
        "—".into()
    } else {
        format!("{v:.1}")
    }
}
fn f3(v: f64) -> String {
    if v == 0.0 || !v.is_finite() {
        "—".into()
    } else {
        format!("{v:.3}")
    }
}

/// The sheet as Markdown and as CSV.
pub fn sheet() -> (String, String) {
    let rows = rows();
    let mut md = String::new();
    let mut csv = String::from(
        "race,unit,gold,supply,build_s,hp,shields,armor,speed_tiles_s,range_tiles,cooldown_s,dmg_ground,dmg_air,splash,dps_ground,dps_air,effective_hp,dps_per_cost,dps_per_supply,lanchester\n",
    );
    let _ = writeln!(
        md,
        "# Formula sheet\n\nBase stats, no upgrades. Costs in gold.\n"
    );
    let _ = writeln!(
        md,
        "| Race | Unit | Cost | Supply | Build | HP | Shields | Armor | Speed | Range | Cooldown | Dmg ground / air | Splash | DPS ground / air | Eff. HP | DPS / cost | DPS / supply | Lanchester |"
    );
    let _ = writeln!(
        md,
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
    );
    for r in &rows {
        let d = r.kind.def();
        let wp = r.weapon;
        let (range, cd, dg, da, splash) = wp.map_or((0.0, 0.0, 0.0, 0.0, 0.0), |w| {
            (w.range, w.cd, w.dmg, w.dmg_air, w.splash)
        });
        let per_supply = if d.supply > 0 {
            r.best_dps() / d.supply as f64
        } else {
            0.0
        };
        let worker = if d.worker { " (worker)" } else { "" };
        let _ = writeln!(
            md,
            "| {} | {}{worker} | {} | {} | {}s | {} | {} | {} | {:.1} | {} | {} | {} / {} | {} | {} / {} | {} | {} | {} | {} |",
            r.race,
            r.name,
            d.cost[0],
            d.supply,
            d.build,
            d.hp,
            d.shields,
            d.armor,
            d.speed / TILE,
            f1(range),
            if cd > 0.0 {
                format!("{cd}s")
            } else {
                "—".into()
            },
            f1(dg),
            f1(da),
            if splash > 0.0 {
                format!("{:.0}%", splash * 100.0)
            } else {
                "—".into()
            },
            f1(r.dps(false)),
            f1(r.dps(true)),
            r.ehp(),
            f3(r.best_dps() / r.cost()),
            f3(per_supply),
            if r.armed() {
                format!("{:.4}", r.lanchester() * 1000.0)
            } else {
                "—".into()
            },
        );
        let _ = writeln!(
            csv,
            "{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}",
            r.race,
            r.name,
            d.cost[0],
            d.supply,
            d.build,
            d.hp,
            d.shields,
            d.armor,
            d.speed / TILE,
            range,
            cd,
            dg,
            da,
            splash,
            r.dps(false),
            r.dps(true),
            r.ehp(),
            r.best_dps() / r.cost(),
            per_supply,
            r.lanchester()
        );
    }
    let _ = writeln!(md, "\n(Lanchester efficiency shown x1000.)\n");

    // Time to kill.
    let attackers: Vec<&Row> = rows.iter().filter(|r| r.armed()).collect();
    let targets: Vec<UnitKind> = {
        let mut t: Vec<UnitKind> = Vec::new();
        for r in &rows {
            if !t.contains(&r.kind) {
                t.push(r.kind);
            }
        }
        t
    };
    let _ = writeln!(
        md,
        "## Time to kill (seconds, one on one, no upgrades)\n\nRows attack, columns are hit; — cannot hit it.\n"
    );
    let _ = writeln!(
        md,
        "| Attacker | {} |",
        targets
            .iter()
            .map(|k| k.def().name)
            .collect::<Vec<_>>()
            .join(" | ")
    );
    let _ = writeln!(md, "| --- |{}", " --- |".repeat(targets.len()));
    for a in &attackers {
        let cells: Vec<String> = targets
            .iter()
            .map(|&t| time_to_kill(a, t).map_or("—".into(), |s| format!("{s:.1}")))
            .collect();
        let _ = writeln!(md, "| {} | {} |", a.name, cells.join(" | "));
    }
    let _ = writeln!(
        md,
        "\n## Legend\n\n\
- Cost: gold. Build: seconds to train. Speed: tiles per second. Range: tiles. Cooldown: seconds between shots.\n\
- DPS: damage per shot over the time between shots as the sim fires them (the cooldown rounded up to whole 30 Hz ticks), against ground and against air.\n\
- Eff. HP: hull plus shields; armor then takes its value off each hit on the hull (at least 1 still lands).\n\
- DPS / cost and DPS / supply: the better of its two DPS for the money and for the supply.\n\
- Lanchester: DPS x Eff. HP over the cost squared; for the same money, an army's strength in a straight fight grows with the square of its numbers.\n\
- Time to kill: shots one on one through the sim's own rules (shields first, then armor off each hit, at least 1), the first at once.\n\
- This is a heuristic: range, speed, splash, healing, overkill and pathing change real fights, which is what the duel matrix and the report measure."
    );
    (md, csv)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_unit_of_both_races_is_on_the_sheet() {
        let rows = rows();
        // (every unit a building trains: the healers stay in the tables, trained nowhere, and off the sheet)
        for k in UNIT_KINDS.into_iter().filter(|k| k.trainable()) {
            assert!(rows.iter().any(|r| r.kind == k), "{} missing", k.def().name);
        }
        // (the Cannon has one gun, set up: one row, its plain name)
        assert!(
            rows.iter()
                .any(|r| r.name == "Cannon" && r.weapon.is_some())
        );
        let (md, csv) = sheet();
        for k in UNIT_KINDS.into_iter().filter(|k| k.trainable()) {
            assert!(
                md.contains(k.def().name) && csv.contains(k.def().name),
                "{}",
                k.def().name
            );
        }
    }

    #[test]
    fn time_to_kill_follows_shields_then_armor() {
        // A Guard on a Guard: (hp / max(dmg - armor, 1)) shots, the first at once.
        let trooper = rows()
            .into_iter()
            .find(|r| r.kind == UnitKind::Trooper)
            .unwrap();
        let (w, d) = (trooper.weapon.unwrap(), UnitKind::Trooper.def());
        let shots = (d.hp / (w.dmg - d.armor).max(1.0)).ceil();
        assert_eq!(
            time_to_kill(&trooper, UnitKind::Trooper),
            Some((shots - 1.0) * fire_period(w.cd))
        );
        assert!(
            (fire_period(0.8) - 25.0 / 30.0).abs() < 1e-9
                && (fire_period(1.2) - 36.0 / 30.0).abs() < 1e-9
        );
        // Nothing hits what its weapon cannot: a ground-only gun on a flyer.
        let flyer = UNIT_KINDS.into_iter().find(|k| k.def().air).unwrap();
        let ground_only = rows()
            .into_iter()
            .find(|r| r.weapon.is_some_and(|w| w.dmg_air == 0.0 && w.dmg > 0.0))
            .unwrap();
        assert_eq!(time_to_kill(&ground_only, flyer), None);
    }
}
