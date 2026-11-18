//! `npm run lab -- report | compare A.json B.json | sheet`: see README.md.

use endfall_lab::batch::{Batch, LEVELS};
use endfall_lab::json::Json;
use endfall_lab::{compare, run_report, sheet, trace};
use endfall_sim::data::FACTIONS;
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
        "lab: {msg}\n\nUsage: npm run lab -- report [--quick] [--seeds N] [--cap MIN] [--sizes 64,96] [--maps OpenPlains,...]\n       [--levels Easy,Medium,...] [--ladder] [--no-mirrors] [--no-cross] [--tide] [--shore-field back|channel|channel-far] [--threads N] [--length-band 10-20] [--out FILE]\n       npm run lab -- compare A.json B.json\n       npm run lab -- sheet [--ether-weight W | --ether-weight-from report.json]\n       npm run lab -- plans [--games N] [--maps Standard,Shore] [--seed S] [--plant] [--check N] [--first-max M:SS] [--tide] [--cap MIN] [--threads N] [--out FILE]
       npm run lab -- bets [--seeds N] [--size 64] [--cap MIN] [--threads N] [--out FILE]
       npm run lab -- tiers [--seeds N] [--size 96] [--greedy | --steady] [--cap MIN] [--threads N] [--out FILE]
       npm run lab -- turtle [--seeds N] [--maps Shore] [--size 64] [--raids] [--weak] [--attacker-income X] [--attacker-retreat X] [--attacker-level Hard] [--attacker-style Boom] [--cap MIN] [--threads N] [--out FILE]"
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
    if s.eq_ignore_ascii_case("brutal") {
        return 3;
    }
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
        (10.0, 15.0),
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
            "--ladder" => batch.ladder = true,
            "--no-cross" => batch.cross = false,
            "--no-mirrors" => batch.mirrors = false,
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
        if ![64, 72, 80, 96, 128].contains(&s) {
            die("sizes are 64, 72, 80, 96 or 128 (72 and 80: two-start sizes for the lab)");
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
        "Commit {commit}, {}. Batch: sizes {:?}, maps {:?}, levels {}, ladder {}{}{}, {} seeds a cell, {} min cap{}: {total} games in {:.0} s on {threads} threads. JSON: {}",
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
        if batch.mirrors { "" } else { ", no mirrors" },
        if batch.cross && batch.sizes.contains(&96) {
            ", Hard against each lower level on 96"
        } else {
            ""
        },
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

fn bets(args: &[String]) {
    use endfall_lab::bets::{self, BetBatch};
    let mut b = BetBatch {
        size: 64,
        seeds: 20,
        cap_min: 30,
        threads: std::thread::available_parallelism().map_or(1, |n| n.get()),
    };
    let mut out = None;
    let mut it = args.iter();
    while let Some(a) = it.next() {
        let mut val = || {
            it.next()
                .cloned()
                .unwrap_or_else(|| die(&format!("{a} needs a value")))
        };
        match a.as_str() {
            "--seeds" => {
                b.seeds = val()
                    .parse()
                    .ok()
                    .filter(|&n| n > 0)
                    .unwrap_or_else(|| die("--seeds N, at least 1"))
            }
            "--size" => {
                b.size = val()
                    .parse()
                    .ok()
                    .filter(|n| [64, 72, 80, 96, 128].contains(n))
                    .unwrap_or_else(|| die("--size 64, 72, 80, 96 or 128"))
            }
            "--cap" => b.cap_min = val().parse().unwrap_or_else(|_| die("--cap MINUTES")),
            "--threads" => b.threads = val().parse().unwrap_or_else(|_| die("--threads N")),
            "--out" => out = Some(PathBuf::from(val())),
            _ => die(&format!("unknown flag {a}")),
        }
    }
    let commit = commit();
    let total = bets::cells().len() * b.seeds as usize;
    eprintln!("lab: {total} games on {} threads…", b.threads);
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
    let r = bets::run(b.clone(), &commit, &progress);
    let path = out.unwrap_or_else(|| out_dir().join(format!("bets-{commit}.json")));
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    std::fs::write(&path, r.json().write())
        .unwrap_or_else(|e| die(&format!("cannot write {}: {e}", path.display())));
    let header = format!(
        "Commit {commit}, {}. Batch: {}x{} Standard, map seeds 1 to {}, {} min cap: {total} games in {:.0} s on {} threads. JSON: {}",
        today(),
        b.size,
        b.size,
        b.seeds,
        b.cap_min,
        t0.elapsed().as_secs_f64(),
        b.threads,
        path.display()
    );
    print!("{}", r.markdown(&header));
}

fn tiers(args: &[String]) {
    use endfall_lab::tiers::{self, TierBatch};
    let mut b = TierBatch {
        size: 96,
        seeds: 10,
        cap_min: 30,
        threads: std::thread::available_parallelism().map_or(1, |n| n.get()),
        foe: tiers::Foe::Tech,
    };
    let mut out = None;
    let mut it = args.iter();
    while let Some(a) = it.next() {
        let mut val = || {
            it.next()
                .cloned()
                .unwrap_or_else(|| die(&format!("{a} needs a value")))
        };
        match a.as_str() {
            "--seeds" => {
                b.seeds = val()
                    .parse()
                    .ok()
                    .filter(|&n| n > 0)
                    .unwrap_or_else(|| die("--seeds N, at least 1"))
            }
            "--size" => {
                b.size = val()
                    .parse()
                    .ok()
                    .filter(|n| [64, 72, 80, 96, 128].contains(n))
                    .unwrap_or_else(|| die("--size 64, 72, 80, 96 or 128"))
            }
            "--cap" => b.cap_min = val().parse().unwrap_or_else(|_| die("--cap MINUTES")),
            "--threads" => b.threads = val().parse().unwrap_or_else(|_| die("--threads N")),
            "--out" => out = Some(PathBuf::from(val())),
            "--greedy" => b.foe = tiers::Foe::Greedy,
            "--steady" => b.foe = tiers::Foe::Steady,
            _ => die(&format!("unknown flag {a}")),
        }
    }
    let commit = commit();
    let total = tiers::cells().len() * b.seeds as usize;
    eprintln!("lab: {total} games on {} threads…", b.threads);
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
    let r = tiers::run(b.clone(), &commit, &progress);
    let path = out.unwrap_or_else(|| out_dir().join(format!("tiers-{commit}.json")));
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    std::fs::write(&path, r.json().write())
        .unwrap_or_else(|e| die(&format!("cannot write {}: {e}", path.display())));
    let header = format!(
        "Commit {commit}, {}. Batch: {}x{} Standard, map seeds 1 to {}, {} min cap: {total} games in {:.0} s on {} threads. JSON: {}",
        today(),
        b.size,
        b.size,
        b.seeds,
        b.cap_min,
        t0.elapsed().as_secs_f64(),
        b.threads,
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
            "--size" => {
                batch.size = val()
                    .parse()
                    .ok()
                    .filter(|n| [64, 72, 80, 96, 128].contains(n))
                    .unwrap_or_else(|| die("--size 64, 72, 80, 96 or 128"))
            }
            "--raids" => batch.raids = true,
            "--weak" => batch.weak = true,
            "--attacker-level" => batch.attacker_level = parse_level(&val()),
            "--attacker-style" => {
                batch.attacker_style = Some(
                    endfall_sim::data::Style::from_name(&val())
                        .unwrap_or_else(|| die("--attacker-style Pressure, Timing or Boom")),
                )
            }
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
    if batch.size != 64 && batch.maps.contains(&MapKind::Shore) {
        die("the Shore map is 64x64 only");
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
        "Commit {commit}, {}. Batch: maps {:?} at {}x{}, {} seeds a cell, {} min cap{}: {total} games in {secs:.0} s on {threads} threads. JSON: {}",
        today(),
        batch.maps,
        batch.size,
        batch.size,
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
            }
            + &batch.attacker_style.map_or(String::new(), |st| format!(
                ", the attacker's style {}",
                st.name()
            )),
        path.display()
    );
    print!("{}", r.markdown(&header));
}

fn read(path: &str) -> Json {
    let text =
        std::fs::read_to_string(path).unwrap_or_else(|e| die(&format!("cannot read {path}: {e}")));
    Json::parse(&text).unwrap_or_else(|e| die(&format!("{path}: {e}")))
}

/// `trace`: one game, a line per seat every `--every` s (default 30): `--size 96 --map Standard --races Humans,Vael
/// --levels Medium[,Easy] --seed 3 --cap 30`; `--races` names every seat (four for four seats), `--teams 0,0,1,1`,
/// `--side N` the seats' turn on the map (default 0).
fn trace(args: &[String]) {
    let (s, cap, every) = setup(args, 64, true);
    print!("{}", trace::trace(&s, cap, every));
}

/// `summary`: one AI-vs-AI game's summary (`endfall_sim::summary`), the JSON a reader gets between games, to its end
/// or `--cap` minutes (default 15): the flags of `trace` (default 96x96), and `--out FILE` to write it there too.
fn summary(args: &[String]) {
    let mut rest = Vec::new();
    let mut out = None;
    let mut it = args.iter();
    while let Some(a) = it.next() {
        if a == "--out" {
            out = Some(it.next().unwrap_or_else(|| die("--out FILE")).clone());
        } else {
            rest.push(a.clone());
        }
    }
    let (s, cap, _) = setup(&rest, 96, false);
    let json = trace::summary(&s, cap);
    if let Some(path) = out {
        std::fs::write(&path, &json).unwrap_or_else(|e| die(&format!("cannot write {path}: {e}")));
        eprintln!("{} bytes to {path}", json.len());
    }
    println!("{json}");
}

/// `duel` (play against Claude, claude/PLAN_VOCAB.md): one game, seat 0 Hard's AI with a plan (`--plan CODE`, or
/// `--plan-file FILE`: its first line not starting with #), seat 1 an AI (`--vs-level 0|1|2`, Hard by default);
/// `--seed N --map Standard --size 96 --race Kingdom --vs-race Kingdom --cap 30 --out FILE`. With `--answers FILE`
/// it makes check-ins for seat 0: at the first one the file does not answer it writes the digest (`--digest FILE`,
/// else stdout) and stops; each answer lands `--delay` game-seconds (15) after its check-in. Prints what the plan had
/// adjusted, the result line and the check-ins' sizes; the summary goes to `--out` (else stdout).
fn duel(args: &[String]) {
    use endfall_lab::duel;
    let mut g = duel::Duel {
        map: MapKind::Standard,
        size: 96,
        races: [0, 0],
        vs_level: duel::HARD,
        seed: 1,
        cap_min: 30,
    };
    let (mut plan, mut out, mut answers, mut digest, mut delay) = (None, None, None, None, 15u32);
    let people = |n: &str| {
        FACTIONS
            .iter()
            .position(|f| f.name.eq_ignore_ascii_case(n) || f.key.eq_ignore_ascii_case(n))
            .unwrap_or_else(|| die(&format!("no people '{n}' (Kingdom or Expedition)")))
    };
    let read = |path: &str| {
        std::fs::read_to_string(path).unwrap_or_else(|e| die(&format!("cannot read {path}: {e}")))
    };
    let mut it = args.iter();
    while let Some(a) = it.next() {
        let v = it
            .next()
            .unwrap_or_else(|| die(&format!("{a} needs a value")));
        match a.as_str() {
            "--plan" => plan = Some(v.clone()),
            "--plan-file" => {
                plan = Some(
                    read(v)
                        .lines()
                        .map(str::trim)
                        .find(|l| !l.is_empty() && !l.starts_with('#'))
                        .unwrap_or_else(|| die("--plan-file: no code in it"))
                        .to_string(),
                )
            }
            "--seed" => g.seed = v.parse().unwrap_or_else(|_| die("--seed N")),
            "--map" => g.map = parse_map(v),
            "--size" => {
                g.size = v
                    .parse()
                    .ok()
                    .filter(|s| [64, 96, 128].contains(s))
                    .unwrap_or_else(|| die("--size 64|96|128"))
            }
            "--race" => g.races[0] = people(v),
            "--vs-race" => g.races[1] = people(v),
            "--vs-level" => {
                g.vs_level = v
                    .parse()
                    .ok()
                    .filter(|l| *l <= 2)
                    .unwrap_or_else(|| die("--vs-level 0|1|2"))
            }
            "--cap" => g.cap_min = v.parse().unwrap_or_else(|_| die("--cap MINUTES")),
            "--out" => out = Some(v.clone()),
            "--answers" => answers = Some(duel::read_answers(&read(v)).unwrap_or_else(|e| die(&e))),
            "--digest" => digest = Some(v.clone()),
            "--delay" => delay = v.parse().unwrap_or_else(|_| die("--delay SECONDS")),
            _ => die(&format!("duel: unknown flag {a}")),
        }
    }
    let plan = plan.unwrap_or_else(|| die("duel --plan CODE"));
    let start = Instant::now();
    let p = duel::play(&g, &plan, answers.as_deref(), delay)
        .unwrap_or_else(|e| die(&format!("the plan: {e}")));
    let secs = start.elapsed().as_secs_f64();
    for n in &p.notes {
        eprintln!("adjusted: {n}");
    }
    let sizes = &p.digests;
    let total: usize = sizes.iter().sum();
    let stats = format!(
        "check-ins {} ({} bytes in all, {} the largest)",
        sizes.len(),
        total,
        sizes.iter().max().unwrap_or(&0)
    );
    if let Some((n, d)) = &p.waiting {
        match &digest {
            Some(path) => std::fs::write(path, d)
                .unwrap_or_else(|e| die(&format!("cannot write {path}: {e}"))),
            None => println!("{d}"),
        }
        println!(
            "{} | check-in {n} waiting for an answer | {stats} | {secs:.1} s",
            p.line
        );
        std::process::exit(3);
    }
    let summary = p.summary.unwrap_or_default();
    match out {
        Some(o) => {
            std::fs::write(&o, &summary).unwrap_or_else(|e| die(&format!("cannot write {o}: {e}")));
            println!(
                "{} | summary {} bytes to {o} | {stats} | {secs:.1} s",
                p.line,
                summary.len()
            );
        }
        None => {
            println!("{summary}");
            eprintln!("{} | {stats} | {secs:.1} s", p.line);
        }
    }
}

/// `plan-gate` (the play-against-Claude PR's parity check): seat 0 plain Hard, then Hard with an empty plan, the same
/// seeds (`--seeds 30`), against Medium and Hard of both peoples, seat 0 of both peoples, on Standard 96x96 (`--cap
/// 30`, `--threads`): seat 0's wins each way and the games whose winner differs.
fn plan_gate(args: &[String]) {
    use endfall_lab::duel;
    let (mut seeds, mut cap, mut threads) = (30u32, 30u32, 4usize);
    let mut it = args.iter();
    while let Some(a) = it.next() {
        let v = it
            .next()
            .unwrap_or_else(|| die(&format!("{a} needs a value")));
        match a.as_str() {
            "--seeds" => seeds = v.parse().unwrap_or_else(|_| die("--seeds N")),
            "--cap" => cap = v.parse().unwrap_or_else(|_| die("--cap MINUTES")),
            "--threads" => threads = v.parse().unwrap_or_else(|_| die("--threads N")),
            _ => die(&format!("plan-gate: unknown flag {a}")),
        }
    }
    let mut cells = Vec::new();
    for vs_level in [1, 2] {
        for me in 0..2 {
            for foe in 0..2 {
                cells.push(duel::Duel {
                    map: MapKind::Standard,
                    size: 96,
                    races: [me, foe],
                    vs_level,
                    seed: 0,
                    cap_min: cap,
                });
            }
        }
    }
    let start = Instant::now();
    let res = duel::gate(&cells, seeds, threads);
    println!("| Seat 0 (Hard) | Against | Plain Hard won | Empty plan won | Games that differ |");
    println!("| --- | --- | --- | --- | --- |");
    for (c, (plain, planned, differ)) in cells.iter().zip(res) {
        println!(
            "| {} | {} {} | {plain}/{seeds} | {planned}/{seeds} | {differ} |",
            FACTIONS[c.races[0]].name,
            ["Easy", "Medium", "Hard"][c.vs_level],
            FACTIONS[c.races[1]].name
        );
    }
    eprintln!("{:.0} s", start.elapsed().as_secs_f64());
}

/// The flags `trace` and `summary` share (`summary`: no `--every`, a 15-minute cap): the game, its cap, the trace's
/// interval.
fn setup(args: &[String], size: i32, every_flag: bool) -> (trace::Setup, u32, u32) {
    let mut s = trace::Setup {
        size,
        map: MapKind::Standard,
        races: vec![0, 1],
        levels: vec![1],
        teams: None,
        seed: 1,
        side: 0,
        plans: Vec::new(),
    };
    let (mut cap, mut every) = (if every_flag { 30 } else { 15 }, 30);
    let mut it = args.iter();
    while let Some(a) = it.next() {
        let v = it
            .next()
            .unwrap_or_else(|| die(&format!("{a} needs a value")));
        match a.as_str() {
            "--size" => s.size = v.parse().unwrap_or_else(|_| die("--size 64|96|128")),
            "--map" => s.map = parse_map(v),
            "--races" => {
                s.races = v
                    .split(',')
                    .map(|n| {
                        FACTIONS
                            .iter()
                            .position(|f| {
                                f.name.eq_ignore_ascii_case(n) || f.key.eq_ignore_ascii_case(n)
                            })
                            .unwrap_or_else(|| die(&format!("no people '{n}'")))
                    })
                    .collect()
            }
            "--levels" => s.levels = v.split(',').map(parse_level).collect(),
            "--teams" => {
                s.teams = Some(
                    v.split(',')
                        .map(|t| t.parse().unwrap_or_else(|_| die("--teams 0,0,1,1")))
                        .collect(),
                )
            }
            "--seed" => s.seed = v.parse().unwrap_or_else(|_| die("--seed N")),
            "--plans" => {
                s.plans = v
                    .split(',')
                    .map(|p| {
                        (p != "-").then(|| {
                            if trace::plan_named(p, 0).is_none() {
                                die("--plans: rush, defense, tech, basic, mid, top, greedy or - (none), a seat each")
                            }
                            p.to_string()
                        })
                    })
                    .collect()
            }
            "--side" => s.side = v.parse().unwrap_or_else(|_| die("--side N")),
            "--cap" => cap = v.parse().unwrap_or_else(|_| die("--cap MINUTES")),
            "--every" if every_flag => {
                every = v.parse().unwrap_or_else(|_| die("--every SECONDS"))
            }
            _ => die(&format!("unknown flag {a}")),
        }
    }
    (s, cap, every)
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("report") => report(&args[1..]),
        Some("plans") => plans(&args[1..]),
        Some("turtle") => turtle(&args[1..]),
        Some("bets") => bets(&args[1..]),
        Some("tiers") => tiers(&args[1..]),
        Some("trace") => trace(&args[1..]),
        Some("summary") => summary(&args[1..]),
        Some("duel") => duel(&args[1..]),
        Some("plan-gate") => plan_gate(&args[1..]),
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
        _ => die("a command: report, compare, sheet, plans, turtle, bets, tiers, trace or summary"),
    }
}
