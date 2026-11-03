//! `compare`: two reports' JSON side by side, cell by cell: what moved, and whether it moved more than the noise
//! (the two 95% intervals apart).

use crate::json::Json;
use crate::stats::mmss;
use std::fmt::Write;

/// "bigger than noise": two intervals that do not overlap.
pub fn apart(a: (f64, f64), b: (f64, f64)) -> bool {
    a.1 < b.0 || b.1 < a.0
}

fn cells(r: &Json) -> Vec<&Json> {
    r.get("cells")
        .map(Json::arr)
        .unwrap_or(&[])
        .iter()
        .collect()
}
fn id(c: &Json) -> &str {
    c.get("id").and_then(Json::str).unwrap_or("?")
}
fn rate(c: &Json) -> Option<(f64, f64, f64, f64)> {
    let r = c.get("rate")?;
    (r.f("n") > 0.0).then(|| (r.f("p"), r.f("lo"), r.f("hi"), r.f("n")))
}
fn pct(p: f64) -> String {
    if p.is_finite() {
        format!("{:.0}%", p * 100.0)
    } else {
        "—".into()
    }
}

/// The comparison as Markdown, and the number of cells marked bigger than noise.
pub fn compare(a: &Json, b: &Json, a_name: &str, b_name: &str) -> (String, usize) {
    let mut s = String::new();
    let commit = |r: &Json| {
        r.get("commit")
            .and_then(Json::str)
            .unwrap_or("?")
            .to_string()
    };
    let _ = writeln!(
        s,
        "# Balance comparison: {} → {}\n\nA: {a_name} ({})  \nB: {b_name} ({})\n",
        commit(a),
        commit(b),
        commit(a),
        commit(b)
    );
    if a.get("batch") != b.get("batch") || a.get("length_band_min") != b.get("length_band_min") {
        let show = |r: &Json| {
            r.get("batch")
                .map_or("?".into(), |b| b.write().replace('\n', ""))
        };
        let _ = writeln!(
            s,
            "**The two reports used different batches:** A {}; B {}. Only the cells both have are compared.\n",
            show(a),
            show(b)
        );
    }
    let (ca, cb) = (cells(a), cells(b));
    let _ = writeln!(
        s,
        "| Cell | Win rate A | Win rate B | Change | Noise? | Length A | Length B | Timeouts A | Timeouts B |"
    );
    let _ = writeln!(s, "| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    let mut marked = 0;
    for x in &ca {
        let Some(y) = cb.iter().find(|y| id(y) == id(x)) else {
            continue;
        };
        let (ra, rb) = (rate(x), rate(y));
        let (change, mark) = match (ra, rb) {
            (Some(p), Some(q)) => {
                let big = apart((p.1, p.2), (q.1, q.2));
                marked += big as usize;
                (
                    format!("{:+.0} pts", (q.0 - p.0) * 100.0),
                    if big {
                        "**bigger than noise**"
                    } else {
                        "within noise"
                    },
                )
            }
            _ => ("—".into(), "—"),
        };
        let len = |c: &Json| c.get("length_s").map_or(f64::NAN, |l| l.f("median"));
        let of = x
            .get("rate")
            .and_then(|r| r.get("of"))
            .and_then(Json::str)
            .unwrap_or("");
        let _ = writeln!(
            s,
            "| {} ({of}) | {} | {} | {change} | {mark} | {} | {} | {} of {} | {} of {} |",
            id(x),
            ra.map_or("—".into(), |r| format!("{} of {}", pct(r.0), r.3)),
            rb.map_or("—".into(), |r| format!("{} of {}", pct(r.0), r.3)),
            mmss(len(x)),
            mmss(len(y)),
            x.f("timeouts"),
            x.f("games"),
            y.f("timeouts"),
            y.f("games"),
        );
    }
    let only = |p: &[&Json], q: &[&Json]| -> Vec<String> {
        p.iter()
            .filter(|x| !q.iter().any(|y| id(y) == id(x)))
            .map(|x| id(x).to_string())
            .collect()
    };
    for (name, list) in [("A", only(&ca, &cb)), ("B", only(&cb, &ca))] {
        if !list.is_empty() {
            let _ = writeln!(s, "\nOnly in {name} (not compared): {}", list.join("; "));
        }
    }
    let _ = writeln!(
        s,
        "\n{marked} cell(s) moved more than the noise.\n\n## Target checks of B\n"
    );
    for c in b.get("checks").map(Json::arr).unwrap_or(&[]) {
        let pass = matches!(c.get("pass"), Some(Json::Bool(true)));
        let _ = writeln!(
            s,
            "- **{}** {}: {}",
            if pass { "PASS" } else { "WARN" },
            c.get("name").and_then(Json::str).unwrap_or(""),
            c.get("detail").and_then(Json::str).unwrap_or("")
        );
    }
    (s, marked)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn report(seeds: u32, cells: Vec<Json>) -> Json {
        Json::obj()
            .with("commit", "x")
            .with("batch", Json::obj().with("seeds", seeds))
            .with("cells", cells)
            .with(
                "checks",
                vec![
                    Json::obj()
                        .with("name", "timeouts")
                        .with("pass", true)
                        .with("detail", "none"),
                ],
            )
    }
    fn cell(id: &str, k: usize, n: usize) -> Json {
        let (lo, hi) = crate::stats::wilson(k, n);
        Json::obj()
            .with("id", id)
            .with("games", n)
            .with("timeouts", 0u32)
            .with(
                "rate",
                Json::obj()
                    .with("of", "Humans win")
                    .with("k", k)
                    .with("n", n)
                    .with("p", k as f64 / n as f64)
                    .with("lo", lo)
                    .with("hi", hi),
            )
            .with("length_s", Json::obj().with("median", 600.0))
    }

    #[test]
    fn compare_marks_only_what_moved_more_than_the_noise() {
        let a = report(
            30,
            vec![
                cell("one", 15, 30),
                cell("two", 15, 30),
                cell("gone", 10, 30),
            ],
        );
        let b = report(
            30,
            vec![
                cell("one", 17, 30),
                cell("two", 29, 30),
                cell("new", 10, 30),
            ],
        );
        let (text, marked) = compare(&a, &b, "a.json", "b.json");
        assert_eq!(marked, 1, "{text}");
        let line = |name: &str| {
            text.lines()
                .find(|l| l.starts_with(&format!("| {name} ")))
                .unwrap_or_default()
                .to_string()
        };
        assert!(
            line("one").contains("within noise") && line("one").contains("+7 pts"),
            "{}",
            line("one")
        );
        assert!(line("two").contains("bigger than noise"), "{}", line("two"));
        assert!(
            text.contains("Only in A (not compared): gone")
                && text.contains("Only in B (not compared): new"),
            "{text}"
        );
        assert!(!text.contains("different batches"));
        let (text, _) = compare(&a, &report(5, vec![]), "a", "b");
        assert!(text.contains("different batches"), "{text}");
    }

    #[test]
    fn a_report_against_itself_shows_no_change() {
        let a = report(30, vec![cell("one", 15, 30), cell("two", 29, 30)]);
        let (text, marked) = compare(&a, &a, "a", "a");
        assert_eq!(marked, 0);
        assert!(
            text.lines()
                .filter(|l| l.starts_with("| one") || l.starts_with("| two"))
                .all(|l| l.contains("+0 pts")),
            "{text}"
        );
    }
}
