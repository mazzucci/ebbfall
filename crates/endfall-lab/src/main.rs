//! `npm run lab -- report | compare A.json B.json | sheet`: see README.md.

use endfall_lab::batch::{Batch, LEVELS};
use endfall_lab::json::Json;
use endfall_lab::{compare, run_report, sheet};
use endfall_sim::map::MapKind;
use std::path::PathBuf;
use std::time::Instant;

/// target/lab at the workspace's root (gitignored, as all of target/).
fn out_dir() -> PathBuf {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    root.canonicalize().unwrap_or(root).join("target/lab")
}

/// The commit this is built from, short, with "+dirty" when tracked files have changes.
fn commit() -> String {
    let git = |args: &[&str]| {
        std::process::Command::new("git")
            .args(args)
            .current_dir(env!("CARGO_MANIFEST_DIR"))
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    };
    let head = git(&["rev-parse", "--short", "HEAD"]).unwrap_or_else(|| "unknown".into());
    let dirty =
        git(&["status", "--porcelain", "--untracked-files=no"]).is_some_and(|s| !s.is_empty());
    if dirty { format!("{head}+dirty") } else { head }
}

/// Today's date (UTC), from the clock: for the header only.
fn today() -> String {
    let days = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs() / 86_400) as i64;
    // (civil from days, Howard Hinnant's algorithm)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + (m <= 2) as i64;
    format!("{y:04}-{m:02}-{d:02}")
}

fn die(msg: &str) -> ! {
    eprintln!(
        "lab: {msg}\n\nUsage: npm run lab -- report [--quick] [--seeds N] [--cap MIN] [--sizes 64,96] [--maps OpenPlains,...]\n       [--levels Easy,Medium,...] [--no-ladder] [--tide] [--shore-field back|channel|channel-far] [--threads N] [--length-band 10-20] [--out FILE]\n       npm run lab -- compare A.json B.json\n       npm run lab -- sheet [--ether-weight W | --ether-weight-from report.json]\n       npm run lab -- plans [--games N] [--maps Standard,Shore] [--seed S] [--plant] [--check N] [--first-max M:SS] [--tide] [--cap MIN] [--threads N] [--out FILE]
       npm run lab -- turtle [--seeds N] [--maps Shore] [--raids] [--weak] [--attacker-income X] [--attacker-retreat X] [--attacker-level Hard] [--cap MIN] [--threads N] [--out FILE]"
    );
    std::process::exit(2)
}

fn parse_map(s: &str) -> MapKind {
    MapKind::ALL
        .into_iter()
        .find(|m| format!("{m:?}").eq_ignore_ascii_case(s))
        .unwrap_or_else(|| die(&format!("no map '{s}'")))
}
fn parse_level(s: &str) -> usize {
    LEVELS
        .iter()
        .position(|l| l.eq_ignore_ascii_case(s))
        .or_else(|| s.parse().ok().filter(|&l: &usize| l < LEVELS.len()))
        .unwrap_or_else(|| die(&format!("no level '{s}'")))
}

fn report(args: &[String]) {
    let mut batch = Batch::default_batch();
    let (mut threads, mut band, mut out) = (
        std::thread::available_parallelism().map_or(1, |n| n.get()),
        (10.0, 20.0),
        None,
    );
    let mut extra_maps = Vec::new();
    let mut it = args.iter();
    while let Some(a) = it.next() {
        let mut val = || {
            it.next()
                .cloned()
                .unwrap_or_else(|| die(&format!("{a} needs a value")))
        };
        match a.as_str() {
            "--quick" => {
                let seeds_set = batch.seeds != Batch::default_batch().seeds;
                let keep = batch.seeds;
                batch = Batch::quick();
                if seeds_set {
                    batch.seeds = keep;
                }
            }
            "--seeds" => batch.seeds = val().parse().unwrap_or_else(|_| die("--seeds N")),
            "--cap" => batch.cap_min = val().parse().unwrap_or_else(|_| die("--cap MINUTES")),
            "--sizes" => {
                batch.sizes = val()
                    .split(',')
                    .map(|s| s.parse().unwrap_or_else(|_| die("--sizes 64,96")))
                    .collect()
            }
            "--maps" => extra_maps = val().split(',').map(parse_map).collect(),
            "--levels" => batch.levels = val().split(',').map(parse_level).collect(),
            "--no-ladder" => batch.ladder = false,
            "--shore-field" => {
                use endfall_sim::map::ShoreField;
                batch.shore_field = match val().as_str() {
                    "back" => ShoreField::BACK,
                    "channel" => ShoreField::CHANNEL,
                    "channel-far" => ShoreField::CHANNEL_FAR,
                    _ => die("--shore-field back, channel or channel-far"),
                }
            }
            "--tide" => batch.tide = true,
            "--threads" => threads = val().parse().unwrap_or_else(|_| die("--threads N")),
            "--length-band" => {
                let v = val();
                let (lo, hi) = v
                    .split_once('-')
                    .unwrap_or_else(|| die("--length-band LO-HI (minutes)"));
                band = (
                    lo.parse().unwrap_or_else(|_| die("--length-band")),
                    hi.parse().unwrap_or_else(|_| die("--length-band")),
                );
            }
            "--out" => out = Some(PathBuf::from(val())),
            _ => die(&format!("unknown flag {a}")),
        }
    }
    for m in extra_maps {
        if !batch.maps.contains(&m) {
            batch.maps.push(m);
        }
    }
    for &s in &batch.sizes {
        if ![64, 96, 128].contains(&s) {
            die("sizes are 64, 96 or 128");
        }
    }
    let commit = commit();
    let total = batch.cells().len() * batch.seeds as usize;
    eprintln!("lab: {total} games on {threads} threads…");
    let t0 = Instant::now();
    let step = (total / 20).max(1);
    let progress = |done: usize, total: usize| {
        if done.is_multiple_of(step) || done == total {
            eprintln!(
                "lab: {done}/{total} games, {:.0} s",
                t0.elapsed().as_secs_f64()
            );
        }
    };
    let r = run_report(batch.clone(), band, &commit, threads, &progress);
    let secs = t0.elapsed().as_secs_f64();
    let path = out.unwrap_or_else(|| out_dir().join(format!("report-{commit}.json")));
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    std::fs::write(&path, r.json().write())
        .unwrap_or_else(|e| die(&format!("cannot write {}: {e}", path.display())));
    let header = format!(
        "Commit {commit}, {}. Batch: sizes {:?}, maps {:?}, levels {}, ladder {}, {} seeds a cell, {} min cap{}: {total} games in {:.0} s on {threads} threads. JSON: {}",
        today(),
        batch.sizes,
        batch.maps,
        batch
            .levels
            .iter()
            .map(|&l| LEVELS[l])
            .collect::<Vec<_>>()
            .join(", "),
        if batch.ladder { "yes" } else { "no" },
        batch.seeds,
        batch.cap_min,
        batch.moved_shore_field().map_or(String::new(), |f| {
            format!(
                ", the Shore basins' field {}",
                endfall_lab::report::shore_field_name(f)
            )
        }),
        secs,
        path.display()
    );
    print!("{}", r.markdown(&header));
}

fn plans(args: &[String]) {
    use endfall_lab::plans::{self, PlanBatch};
    let mut batch = PlanBatch::default_batch();
    let (mut threads, mut out, mut games_set) = (
        std::thread::available_parallelism().map_or(1, |n| n.get()),
        None,
        false,
    );
    let mut it = args.iter();
    while let Some(a) = it.next() {
        let mut val = || {
            it.next()
                .cloned()
                .unwrap_or_else(|| die(&format!("{a} needs a value")))
        };
        match a.as_str() {
            "--games" => {
                batch.games = val().parse().unwrap_or_else(|_| die("--games N"));
                games_set = true;
            }
            "--maps" => batch.maps = val().split(',').map(parse_map).collect(),
            "--seed" => batch.seed = val().parse().unwrap_or_else(|_| die("--seed S")),
            "--plant" => batch.plant = true,
            "--check" => batch.check = val().parse().unwrap_or_else(|_| die("--check N")),
            "--cap" => batch.cap_min = val().parse().unwrap_or_else(|_| die("--cap MINUTES")),
            "--tide" => batch.tide = true,
            "--first-max" => {
                batch.first_max = endfall_lab::stats::parse_mmss(&val())
                    .filter(|&s| s > plans::FIRST_MIN && s <= 3600.0)
                    .unwrap_or_else(|| die("--first-max M:SS, after 2:00 and at most 60:00"))
            }
            "--threads" => threads = val().parse().unwrap_or_else(|_| die("--threads N")),
            "--out" => out = Some(PathBuf::from(val())),
            _ => die(&format!("unknown flag {a}")),
        }
    }
    // (the control run's default size: 1,000 games)
    if batch.plant && !games_set {
        batch.games = 1000;
    }
    let commit = commit();
    let total = batch.games
        + if batch.plant {
            2 * batch.check.min(batch.games)
        } else {
            0
        };
    eprintln!("lab: {total} games on {threads} threads…");
    let t0 = Instant::now();
    let step = (total / 20).max(1);
    let progress = |done: usize, total: usize| {
        if done.is_multiple_of(step) || done == total {
            eprintln!(
                "lab: {done}/{total} games, {:.0} s",
                t0.elapsed().as_secs_f64()
            );
        }
    };
    let r = plans::run(batch.clone(), &commit, threads, &progress);
    let secs = t0.elapsed().as_secs_f64();
    let kind = if batch.plant { "plant" } else { "plans" };
    let path = out.unwrap_or_else(|| out_dir().join(format!("{kind}-{commit}.json")));
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    std::fs::write(&path, r.json().write())
        .unwrap_or_else(|e| die(&format!("cannot write {}: {e}", path.display())));
    let header = format!(
        "Commit {commit}, {}. Batch: {} games, maps {:?}, seed {}, {} min cap{}: {total} games in {secs:.0} s on {threads} threads. JSON: {}",
        today(),
        batch.games,
        batch.maps,
        batch.seed,
        batch.cap_min,
        if batch.plant {
            format!(
                ", the planted control with a direct check of {} setups",
                batch.check.min(batch.games)
            )
        } else {
            String::new()
        },
        path.display()
    );
    print!("{}", r.markdown(&header));
}

fn turtle(args: &[String]) {
    use endfall_lab::turtle::{self, TurtleBatch};
    let mut batch = TurtleBatch::default_batch();
    let (mut threads, mut out) = (
        std::thread::available_parallelism().map_or(1, |n| n.get()),
        None,
    );
    let mut it = args.iter();
    while let Some(a) = it.next() {
        let mut val = || {
            it.next()
                .cloned()
                .unwrap_or_else(|| die(&format!("{a} needs a value")))
        };
        match a.as_str() {
            "--seeds" => {
                batch.seeds = val()
                    .parse()
                    .ok()
                    .filter(|&n| n > 0)
                    .unwrap_or_else(|| die("--seeds N, at least 1"))
            }
            "--maps" => batch.maps = val().split(',').map(parse_map).collect(),
            "--cap" => batch.cap_min = val().parse().unwrap_or_else(|_| die("--cap MINUTES")),
            "--raids" => batch.raids = true,
            "--weak" => batch.weak = true,
            "--attacker-level" => batch.attacker_level = parse_level(&val()),
            "--attacker-retreat" => {
                batch.attacker_retreat = Some(
                    val()
                        .parse()
                        .unwrap_or_else(|_| die("--attacker-retreat X")),
                )
            }
            "--attacker-income" => {
                batch.attacker_income =
                    Some(val().parse().unwrap_or_else(|_| die("--attacker-income X")))
            }
            "--threads" => threads = val().parse().unwrap_or_else(|_| die("--threads N")),
            "--out" => out = Some(PathBuf::from(val())),
            _ => die(&format!("unknown flag {a}")),
        }
    }
    let commit = commit();
    let total = turtle::cells(&batch).len();
    eprintln!("lab: {total} games on {threads} threads…");
    let t0 = Instant::now();
    let step = (total / 20).max(1);
    let progress = |done: usize, total: usize| {
        if done.is_multiple_of(step) || done == total {
            eprintln!(
                "lab: {done}/{total} games, {:.0} s",
                t0.elapsed().as_secs_f64()
            );
        }
    };
    let r = turtle::run(batch.clone(), &commit, threads, &progress);
    let secs = t0.elapsed().as_secs_f64();
    let kind = if batch.raids {
        "turtle-raids"
    } else if batch.weak {
        "turtle-weak"
    } else {
        "turtle"
    };
    let path = out.unwrap_or_else(|| out_dir().join(format!("{kind}-{commit}.json")));
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    std::fs::write(&path, r.json().write())
        .unwrap_or_else(|e| die(&format!("cannot write {}: {e}", path.display())));
    let header = format!(
        "Commit {commit}, {}. Batch: maps {:?}, {} seeds a cell, {} min cap{}: {total} games in {secs:.0} s on {threads} threads. JSON: {}",
        today(),
        batch.maps,
        batch.seeds,
        batch.cap_min,
        if batch.raids {
            ", the turtle raids"
        } else {
            ""
        }
        .to_string()
            + &batch
                .attacker_income
                .map_or(String::new(), |x| format!(", the attacker's income x{x}"))
            + &batch.attacker_retreat.map_or(String::new(), |x| format!(
                ", the attacker retreats below {x}"
            ))
            + &if batch.attacker_level == endfall_lab::plans::BASE {
                String::new()
            } else {
                format!(", the attacker at {}", LEVELS[batch.attacker_level])
            },
        path.display()
    );
    print!("{}", r.markdown(&header));
}

fn read(path: &str) -> Json {
    let text =
        std::fs::read_to_string(path).unwrap_or_else(|e| die(&format!("cannot read {path}: {e}")));
    Json::parse(&text).unwrap_or_else(|e| die(&format!("{path}: {e}")))
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("report") => report(&args[1..]),
        Some("plans") => plans(&args[1..]),
        Some("turtle") => turtle(&args[1..]),
        Some("compare") => {
            let [a, b] = &args[1..] else {
                die("compare A.json B.json")
            };
            print!("{}", compare::compare(&read(a), &read(b), a, b).0);
        }
        Some("sheet") => {
            let (mut w, mut source, mut observed) = (1.5, "assumed".to_string(), None);
            let mut it = args[1..].iter();
            while let Some(a) = it.next() {
                let v = it
                    .next()
                    .unwrap_or_else(|| die(&format!("{a} needs a value")));
                match a.as_str() {
                    "--ether-weight" => {
                        w = v.parse().unwrap_or_else(|_| die("--ether-weight W"));
                        source = "set by --ether-weight".into();
                    }
                    "--ether-weight-from" => {
                        let r = read(v);
                        let o = r
                            .get("key")
                            .and_then(|k| k.get("Observed shards per ether"))
                            .and_then(Json::str)
                            .and_then(|s| s.parse::<f64>().ok())
                            .unwrap_or_else(|| {
                                die(&format!("{v} has no observed shards per ether"))
                            });
                        (w, observed, source) = (o, Some(o), format!("observed in {v}"));
                    }
                    _ => die(&format!("unknown flag {a}")),
                }
            }
            let (md, csv) = sheet::sheet(w, observed, &source);
            let path = out_dir().join(format!("sheet-{}.csv", commit()));
            let _ = std::fs::create_dir_all(out_dir());
            std::fs::write(&path, csv)
                .unwrap_or_else(|e| die(&format!("cannot write {}: {e}", path.display())));
            print!("{md}\nCSV: {}\n", path.display());
        }
        _ => die("a command: report, compare, sheet, plans or turtle"),
    }
}
