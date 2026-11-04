//! Ebbfall's balance lab (crates/endfall-lab/README.md): AI-vs-AI batches played natively on the sim, a report of
//! what they show, a comparison of two reports, a formula sheet from the sim's tables, and games with random plans
//! (`plans`: which settings of a plan win), and a never-attacking turtle against Medium (`turtle`). All I/O, clocks and
//! threads live here; the sim is only stepped and read.

pub mod batch;
pub mod compare;
pub mod json;
pub mod model;
pub mod plans;
pub mod report;
pub mod sheet;
pub mod stats;
pub mod turtle;
pub mod waves;

use batch::Batch;
use report::Report;

/// Play `batch` on `threads` threads and gather the report (`commit`: what it is a report of).
pub fn run_report(
    batch: Batch,
    band: (f64, f64),
    commit: &str,
    threads: usize,
    progress: &(dyn Fn(usize, usize) + Sync),
) -> Report {
    let cells = batch.cells();
    let games = batch::play_all(
        &cells,
        batch.seeds,
        batch.cap_min,
        batch.shore_field,
        threads,
        progress,
    );
    Report {
        commit: commit.to_string(),
        batch,
        band,
        cells,
        games,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use endfall_sim::map::MapKind;

    #[test]
    fn a_report_is_the_same_bytes_whatever_the_threads() {
        // A tiny batch: one cell (Humans vs Vael, Easy, 64x64), two seeds, a three-minute cap.
        let batch = Batch {
            sizes: vec![64],
            maps: vec![MapKind::Standard],
            levels: vec![0],
            ladder: false,
            seeds: 2,
            cap_min: 3,
            shore_field: endfall_sim::map::ShoreField::BACK,
        };
        let quiet = |_: usize, _: usize| {};
        let one = run_report(batch.clone(), (10.0, 20.0), "test", 1, &quiet)
            .json()
            .write();
        let three = run_report(batch.clone(), (10.0, 20.0), "test", 3, &quiet)
            .json()
            .write();
        let again = run_report(batch, (10.0, 20.0), "test", 3, &quiet)
            .json()
            .write();
        assert_eq!(one, three, "single- and multi-threaded");
        assert_eq!(three, again, "run twice");
        let r = json::Json::parse(&one).unwrap();
        assert_eq!(
            r.get("cells").map(|c| c.arr().len()),
            Some(4),
            "the four matchups at one level"
        );
        assert!(one.contains("\"first_attack_tick\""));
    }
}
