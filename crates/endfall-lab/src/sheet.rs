//! `sheet`: the formula sheet. One row per unit (two for a unit with a second gun: the Siege Tank deployed and on its
//! tracks), from the sim's own tables, base stats with no upgrades (as src/client/stats.js shows them); then a
//! time-to-kill matrix by the sim's own damage rules (`absorb`, `hull_loss`).

use endfall_sim::data::{DT, FACTIONS, UNIT_KINDS, UnitKind, Weapon};
use endfall_sim::world::{absorb, hull_loss};
use std::fmt::Write;

const TILE: f64 = 32.0;

/// One row: a unit with one of its guns.
#[derive(Clone)]
pub struct Row {
    pub kind: UnitKind,
    pub race: &'static str,
    /// "Siege Tank (deployed)", or the plain name.
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
            match d.light {
                Some(light) => {
                    out.push(Row {
                        kind: k,
                        race: f.name,
                        name: format!("{} (deployed)", d.name),
                        weapon: d.weapon,
                    });
                    out.push(Row {
                        kind: k,
                        race: f.name,
                        name: format!("{} (mobile)", d.name),
                        weapon: Some(light),
                    });
                }
                None => out.push(Row {
                    kind: k,
                    race: f.name,
                    name: d.name.to_string(),
                    weapon: d.weapon,
                }),
            }
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
    pub fn cost(&self, w: f64) -> f64 {
        let c = self.kind.def().cost;
        c[0] as f64 + c[1] as f64 * w
    }
    /// Lanchester efficiency: damage per second x effective health over the weighted cost squared.
    pub fn lanchester(&self, w: f64) -> f64 {
        self.best_dps() * self.ehp() / self.cost(w).powi(2)
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
/// each through the sim's `absorb` (shields first) and `hull_loss` (armour off, at least 1), the first at once and one
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

/// Rank (1 = best) of each armed row by Lanchester efficiency at ether weight `w`.
fn ranks(rows: &[&Row], w: f64) -> Vec<usize> {
    let mut order: Vec<usize> = (0..rows.len()).collect();
    order.sort_by(|&a, &b| {
        rows[b]
            .lanchester(w)
            .total_cmp(&rows[a].lanchester(w))
            .then(a.cmp(&b))
    });
    let mut rank = vec![0; rows.len()];
    for (r, &i) in order.iter().enumerate() {
        rank[i] = r + 1;
    }
    rank
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

/// The sheet as Markdown and as CSV. `w`: the ether weight used; `observed`: a report's shards-per-ether rate (for the
/// sensitivity section), `source`: where `w` came from.
pub fn sheet(w: f64, observed: Option<f64>, source: &str) -> (String, String) {
    let rows = rows();
    let mut md = String::new();
    let mut csv = String::from(
        "race,unit,shards,ether,supply,build_s,hp,shields,armor,speed_tiles_s,range_tiles,cooldown_s,dmg_ground,dmg_air,splash,dps_ground,dps_air,effective_hp,weighted_cost,dps_per_cost,dps_per_supply,lanchester\n",
    );
    let _ = writeln!(
        md,
        "# Formula sheet\n\nBase stats, no upgrades. Ether weight w = {w} ({source}): weighted cost = shards + ether x w.\n"
    );
    let _ = writeln!(
        md,
        "| Race | Unit | Cost | Supply | Build | HP | Shields | Armour | Speed | Range | Cooldown | Dmg ground / air | Splash | DPS ground / air | Eff. HP | Weighted cost | DPS / cost | DPS / supply | Lanchester |"
    );
    let _ = writeln!(
        md,
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
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
            "| {} | {}{worker} | {}/{} | {} | {}s | {} | {} | {} | {:.1} | {} | {} | {} / {} | {} | {} / {} | {} | {:.0} | {} | {} | {} |",
            r.race,
            r.name,
            d.cost[0],
            d.cost[1],
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
            r.cost(w),
            f3(r.best_dps() / r.cost(w)),
            f3(per_supply),
            if r.armed() {
                format!("{:.4}", r.lanchester(w) * 1000.0)
            } else {
                "—".into()
            },
        );
        let _ = writeln!(
            csv,
            "{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}",
            r.race,
            r.name,
            d.cost[0],
            d.cost[1],
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
            r.cost(w),
            r.best_dps() / r.cost(w),
            per_supply,
            r.lanchester(w)
        );
    }
    let _ = writeln!(md, "\n(Lanchester efficiency shown x1000.)\n");

    // Sensitivity: the ranking at several weights.
    let armed: Vec<&Row> = rows
        .iter()
        .filter(|r| r.armed() && !r.kind.def().worker)
        .collect();
    let mut weights = vec![1.0, 1.5, 2.0];
    if let Some(o) = observed {
        weights.push(o);
    }
    let table: Vec<Vec<usize>> = weights.iter().map(|&w| ranks(&armed, w)).collect();
    let _ = writeln!(
        md,
        "## Sensitivity to the ether weight\n\nRank by Lanchester efficiency (1 = most for the money), workers and unarmed units left out.\n"
    );
    let head: Vec<String> = weights
        .iter()
        .enumerate()
        .map(|(i, w)| {
            if observed.is_some() && i == weights.len() - 1 {
                format!("w = {w:.2} (observed)")
            } else {
                format!("w = {w}")
            }
        })
        .collect();
    let _ = writeln!(md, "| Unit | {} | Moves |", head.join(" | "));
    let _ = writeln!(md, "| --- |{} --- |", " --- |".repeat(weights.len()));
    let mut shaky = Vec::new();
    for (i, r) in armed.iter().enumerate() {
        let rs: Vec<usize> = table.iter().map(|t| t[i]).collect();
        let spread = rs.iter().max().unwrap() - rs.iter().min().unwrap();
        if spread > 3 {
            shaky.push(r.name.clone());
        }
        let _ = writeln!(
            md,
            "| {} | {} | {} |",
            r.name,
            rs.iter()
                .map(|x| x.to_string())
                .collect::<Vec<_>>()
                .join(" | "),
            if spread > 3 {
                format!("**{spread} places**")
            } else {
                spread.to_string()
            }
        );
    }
    let _ = writeln!(
        md,
        "\n{}\n",
        if shaky.is_empty() {
            "No unit's rank moves more than three places: these conclusions do not hang on the weight.".to_string()
        } else {
            format!(
                "Rank moves more than three places (depends on the weight, do not trust yet): {}.",
                shaky.join(", ")
            )
        }
    );

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
- Cost: shards/ether. Build: seconds to train. Speed: tiles per second. Range: tiles. Cooldown: seconds between shots.\n\
- DPS: damage per shot over the time between shots as the sim fires them (the cooldown rounded up to whole 30 Hz ticks), against ground and against air.\n\
- Eff. HP: hull plus shields; armour then takes its value off each hit on the hull (at least 1 still lands).\n\
- Weighted cost: shards plus ether times w, the ether weight (how many shards a point of ether is worth).\n\
- DPS / cost and DPS / supply: the better of its two DPS for the money and for the supply.\n\
- Lanchester: DPS x Eff. HP over the weighted cost squared; for the same money, an army's strength in a straight fight grows with the square of its numbers.\n\
- Time to kill: shots one on one through the sim's own rules (shields first, then armour off each hit, at least 1), the first at once.\n\
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
        for k in UNIT_KINDS {
            assert!(rows.iter().any(|r| r.kind == k), "{} missing", k.def().name);
        }
        assert!(
            rows.iter().any(|r| r.name == "Siege Tank (deployed)")
                && rows.iter().any(|r| r.name == "Siege Tank (mobile)")
        );
        let (md, csv) = sheet(1.5, Some(2.0), "test");
        for k in UNIT_KINDS {
            assert!(
                md.contains(k.def().name) && csv.contains(k.def().name),
                "{}",
                k.def().name
            );
        }
    }

    #[test]
    fn time_to_kill_follows_shields_then_armour() {
        // A Trooper on a Trooper: (hp / max(dmg - armour, 1)) shots, the first at once.
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
