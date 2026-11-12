//! Ebbfall's balance lab (crates/endfall-lab/README.md): AI-vs-AI batches played natively on the sim, a report of
//! what they show, a comparison of two reports, a formula sheet from the sim's tables, and games with random plans
//! (`plans`: which settings of a plan win), and a never-attacking turtle against Medium (`turtle`). All I/O, clocks and
//! threads live here; the sim is only stepped and read.

pub mod batch;
pub mod compare;
pub mod first_wave;
pub mod json;
pub mod minutes;
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
        batch.tide,
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
            tide: false,
            mirrors: true,
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
        // the economy: the banks at 2:00 and 3:00 (a 3-minute cap), the pools at their maximum, the mines run dry
        let econ = r.get("cells").unwrap().arr()[0]
            .get("records")
            .unwrap()
            .arr()[0]
            .get("seats")
            .unwrap()
            .arr()[0]
            .get("econ")
            .unwrap()
            .arr()
            .len();
        assert_eq!(econ, 2, "sampled at 2:00 and 3:00");
        for key in [
            "at_max_tick",
            "home_dry_tick",
            "second_base_tick",
            "mines_dry_ticks",
        ] {
            assert!(one.contains(&format!("\"{key}\"")), "{key}");
        }
    }

    #[test]
    fn without_mirrors_a_level_plays_the_two_peoples_alone_and_the_length_bins_hold_every_decided_game()
     {
        // One level on 64x64, no mirrors: the Kingdom against the Expedition in either seat, two cells, the same games
        // as those cells of a batch with the mirrors (each game seeded by its cell and seed). Twelve minutes: some games
        // end, the rest time out.
        let mut batch = Batch {
            sizes: vec![64],
            maps: vec![MapKind::Standard],
            levels: vec![2],
            ladder: false,
            seeds: 2,
            cap_min: 12,
            shore_field: endfall_sim::map::ShoreField::BACK,
            tide: false,
            mirrors: false,
        };
        assert_eq!(batch.cells().len(), 2);
        assert!(batch.cells().iter().all(|c| !c.mirror()));
        let quiet = |_: usize, _: usize| {};
        let r = run_report(batch.clone(), (10.0, 20.0), "test", 2, &quiet);
        batch.mirrors = true;
        let with = batch.cells();
        assert_eq!(&with[..2], &r.cells[..], "the same two cells first");
        let decided: usize = r
            .games
            .iter()
            .flatten()
            .filter(|g| g.winner.is_some())
            .count();
        let bins = r.length_bins(Some(2), None);
        assert_eq!(
            bins.iter().map(|b| b.n).sum::<usize>(),
            decided,
            "each decided game in one bin"
        );
        assert_eq!(
            bins[2].n,
            r.games
                .iter()
                .flatten()
                .filter(|g| g.winner.is_some() && g.end_tick >= 15 * 60 * 30)
                .count()
        );
        let json = r.json().write();
        assert!(
            json.contains("\"length_bins\"") && json.contains("\"mirrors\":false"),
            "{}",
            &json[..300]
        );
        let md = r.markdown("");
        assert!(md.contains("## The Kingdom by game length") && md.contains("## The top tier"));
        // (each seat's firsts: its first trained unit's tick no later than the game's end, and some trained by 12:00)
        let firsts: Vec<u32> = r
            .games
            .iter()
            .flatten()
            .flat_map(|g| {
                g.seats
                    .iter()
                    .flat_map(|s| s.first_unit.iter().flatten().copied())
            })
            .collect();
        assert!(
            !firsts.is_empty()
                && json.contains("\"first_unit_tick\"")
                && json.contains("\"top_tier\"")
        );
        assert!(r.games.iter().flatten().all(|g| g.seats.iter().all(|s| {
            s.first_unit
                .iter()
                .chain(&s.first_bldg)
                .flatten()
                .all(|&t| t <= g.end_tick)
        })));
    }
}
