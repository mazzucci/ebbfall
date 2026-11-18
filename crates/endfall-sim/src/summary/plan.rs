//! A planned seat's "plan vs what happened" (play against Claude, claude/PLAN_VOCAB.md): each step its plan times
//! against when it happened, with what held it up (the AI's own notes, `World::ai_notes`, tallied each second), and how
//! its counts, its later waves, its dare and its leaning unit came out.

use super::json::{Base, slip_words, time};
use super::{Step, Summary};
use crate::data::{Obj, array, quote, *};
use crate::world::World;

/// A time the plan names: "m:ss", or "never".
fn planned(t: f64) -> String {
    if t >= NEVER {
        quote("never")
    } else {
        quote(&mmss(t))
    }
}

/// The plan block of seat `seat` (which has a plan).
pub(super) fn plan_json(s: &Summary, w: &World, seat: usize, _bases: &[Base]) -> String {
    let me = seat as u8;
    let r = &s.seats[seat];
    let f = w.factions[seat];
    let d = w.tuning(me);
    let code = w.plan_of(me).map(|p| p.code()).unwrap_or_default();
    let placed = |k: BldgKind, n: usize| r.placed.iter().filter(|p| p.0 == k).nth(n).map(|p| p.1);
    let built = |k: BldgKind, n: usize| r.built.iter().filter(|p| p.0 == k).nth(n).map(|p| p.1);
    let at = |t: Option<u32>| t.map_or("null".into(), time);
    let with_slip = |o: Obj, step: Step| match slip_words(s, seat, step) {
        Some(h) => o.str("held_up_by", &h),
        None => o,
    };
    let mut steps = Vec::new();
    // its first wave
    let waves: Vec<&super::attacks::Attack> = s
        .attacks
        .done
        .iter()
        .chain(s.attacks.still_out())
        .filter(|a| a.seat == me && a.wave)
        .collect();
    let mut o = Obj::new()
        .str("step", "first wave")
        .raw("planned", planned(d.first))
        .num(
            "planned_size",
            (d.wave as f64 * f.ai.wave_scale).ceil() as usize,
        )
        .raw("went", at(waves.first().map(|a| a.started)));
    if let Some(a) = waves.first() {
        o = o.num("with", a.kinds.iter().map(|&n| n as u32).sum::<u32>());
    }
    steps.push(with_slip(o, Step::Wave(0)).done());
    // its tech building
    let o = Obj::new()
        .str("step", &format!("tech building ({})", f.ai.tech.def().name))
        .raw("planned", planned(d.tech_at))
        .raw("placed", at(placed(f.ai.tech, 0)))
        .raw("finished", at(built(f.ai.tech, 0)));
    steps.push(with_slip(o, Step::Tech).done());
    // each tower
    for (i, &t) in w.tower_times(me).iter().enumerate() {
        let o = Obj::new()
            .str(
                "step",
                &format!("tower {} ({})", i + 1, f.ai.tower.def().name),
            )
            .raw("planned", planned(t))
            .raw("placed", at(placed(f.ai.tower, i)))
            .raw("finished", at(built(f.ai.tower, i)));
        steps.push(with_slip(o, Step::Tower(i)).done());
    }
    // its natural (the first headquarters it placed: its start's stood from the start)
    let o = Obj::new()
        .str("step", &format!("second base ({})", f.hq.def().name))
        .raw("planned", planned(w.expand_time(me)))
        .raw("placed", at(placed(f.hq, 0)))
        .raw("finished", at(r.expansions.first().map(|e| e.done)));
    steps.push(with_slip(o, Step::Expand).done());
    // its top tier: the first top-tier unit, and what it needed
    let top_at = if d.mix_tier >= 2 { 0.0 } else { d.tier_at[0] };
    let tops: Vec<UnitKind> = super::json::trainable(f)
        .into_iter()
        .filter(|k| k.ai_tier() >= 2)
        .collect();
    let first_top = tops
        .iter()
        .filter_map(|&k| r.first_trained[k.index()].map(|t| (t, k)))
        .min_by_key(|&(t, k)| (t, k.index()));
    let mut o = Obj::new()
        .str("step", "top tier")
        .raw("planned", planned(top_at));
    o = match first_top {
        Some((t, k)) => o.str(
            "first",
            &format!(
                "{} at {}",
                k.def().name,
                mmss((t / crate::TICK_RATE) as f64)
            ),
        ),
        None => o.raw("first", "null"),
    };
    // (what each top-tier unit is trained at, and what that needs, with when each was finished)
    let needs: Vec<String> = tops
        .iter()
        .filter_map(|&k| {
            let at_b = BLDG_KINDS.into_iter().find(|b| {
                f.build_basic.iter().chain(f.build_advanced).any(|x| x == b)
                    && b.def().trains.contains(&k)
            })?;
            let fin = |b: BldgKind| {
                built(b, 0).map_or("never built".to_string(), |t| {
                    format!("finished {}", mmss((t / crate::TICK_RATE) as f64))
                })
            };
            let mut words = format!("{}: {} {}", k.def().name, at_b.def().name, fin(at_b));
            if let Some(req) = at_b.def().req {
                words += &format!(", needing {} {}", req.def().name, fin(req));
            }
            Some(words)
        })
        .collect();
    o = o.raw("trained_at", array(needs.iter().map(|n| quote(n))));
    steps.push(o.done());
    // the counts
    let workers = Obj::new()
        .num("planned_at_main", d.harv)
        .num("most", r.peak_workers.0)
        .raw(
            "first_had_then",
            if r.peak_workers.0 > 0 {
                time(r.peak_workers.1)
            } else {
                "null".into()
            },
        )
        .done();
    let five = 300 * crate::TICK_RATE;
    let rax = Obj::new()
        .num("planned", d.rax)
        .num(
            "finished_by_5_00",
            r.built
                .iter()
                .filter(|b| b.0 == f.ai.rax && b.1 <= five)
                .count(),
        )
        .done();
    let later: Vec<u32> = waves
        .iter()
        .skip(1)
        .map(|a| a.kinds.iter().map(|&n| n as u32).sum())
        .collect();
    let later = Obj::new()
        .num(
            "least_count",
            (d.later_min as f64 * f.ai.wave_scale).ceil() as usize,
        )
        .num("gap_s", d.gap)
        .raw("sizes", array(&later))
        .done();
    let plan = w.plan_of(me);
    let bans: Vec<UnitKind> = plan.map(|p| p.wont_build.clone()).unwrap_or_default();
    let mut o = Obj::new()
        .str("code", &code)
        .str(
            "note",
            "Fields the plan leaves out are Hard's as its drawn style plays them; times are when each step may begin.",
        )
        .raw("steps", array(steps))
        .raw("workers", workers)
        .raw("barracks", rax)
        .raw("later_waves", later);
    if !bans.is_empty() {
        o = o.raw(
            "wont_build",
            Obj::new()
                .raw("units", array(bans.iter().map(|k| quote(k.def().name))))
                .num(
                    "trained",
                    bans.iter().map(|k| r.trained[k.index()]).sum::<u32>(),
                )
                .done(),
        );
    }
    if let Some(k) = plan.and_then(|p| p.favor) {
        let army: u32 = r
            .trained
            .iter()
            .zip(UNIT_KINDS)
            .filter(|(_, k)| !k.def().worker)
            .map(|(n, _)| *n)
            .sum();
        o = o.raw(
            "favor",
            Obj::new()
                .str("unit", k.def().name)
                .num("trained", r.trained[k.index()])
                .num("of_all_fighters_trained", army)
                .done(),
        );
    }
    o.done()
}
