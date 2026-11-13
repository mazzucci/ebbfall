# Balance lab

Plays fixed batches of AI-vs-AI games natively on the sim, compares two batches, and prints a formula sheet from the
game's own tables. Nothing here changes the game: the sim is only stepped and read. All output goes to stdout
(Markdown) and `target/lab/` (JSON, CSV; gitignored).

## Commands

```sh
npm run lab -- report            # the default batch: a Markdown summary, and target/lab/report-<commit>.json
npm run lab -- report --quick    # a small batch (64x64, Medium and Hard, 3 seeds): 50 s on 4 cores
npm run lab -- compare A.json B.json
npm run lab -- sheet             # the formula sheet, and target/lab/sheet-<commit>.csv
npm run lab -- plans             # 2,000 games with random AI plans: which settings win (about 100 min on 4 cores)
npm run lab -- plans --plant     # the planted control: 1,000 games with a +10% income coin, and a direct check
npm run lab -- plans --maps Shore --first-max 12:00   # first waves drawn up to 12:00: where later stops winning
npm run lab -- bets              # three plans a side (rush, defense, tech) against each other: the 3x3 by side
npm run lab -- tiers             # attack now or invest further: a committer per layer against a teching opponent
npm run lab -- tiers --steady    # the same against Medium itself teching (--greedy: the greedy human)
npm run lab -- turtle            # a Medium seat that never attacks against Medium on the Shore (200 games, ~15 min)
npm run lab -- trace --size 96 --races Kingdom,Expedition --levels Medium --seed 3   # one game, traced
```

### `report`

The default batch (Stelian, Nov 13: the main rows), on two-player 96x96 and 128x128 Standard maps (64x64 is gone from the
menus):

- Easy and Medium each against itself, in four matchups: Kingdom vs Expedition, Expedition vs Kingdom, and the two
  mirrors;
- each level against each higher one on 96x96, the menus' Hard included (`Kind::Cross`: Medium against Easy, Hard
  against Easy and against Medium: the ladder's steps), every pairing of the peoples, the higher level in either seat.
  Hard is the menus' Hard, the sim's level 2 since Nov 13; the sim's level 3 is "Hard3" ("Brutal" reads as it).

That is 40 cells, 10 seeds each (seeds 1 to 10), with a 30 game-minute cap: 400 games, about 25 minutes on 3 threads.
A game still running at the cap is a timeout: it is reported, not counted as a win.

**Baselines and before/after pairs use `--seeds 30`**; 10-seed screens are compared seed for seed with the baseline
(each game is seeded by its cell and seed, so the same cell and seed is the same game).

| Flag | What it does |
| --- | --- |
| `--quick` | a small batch (64x64, Medium and Hard and the ladder between them, 3 seeds) |
| `--seeds N` | seeds 1 to N in every cell |
| `--cap MIN` | the timeout, in game minutes |
| `--sizes 96,128` | map sizes (64, 72, 80, 96 or 128) |
| `--maps OpenPlains,Labyrinth` | other map kinds, added to Standard |
| `--levels Easy,Medium,Hard,Hard3` | the levels played ("Brutal" reads as Hard3) |
| `--ladder` | each level against the one below it too, each race a mirror, the higher level in either seat |
| `--no-cross` | without the cross cells between the levels |
| `--no-mirrors` | each level's Kingdom against the Expedition alone, without the two mirrors: half the games, and the same games in those cells |
| `--threads N` | parallel games (default: every core); the JSON is the same whatever N |
| `--length-band 10-15` | Medium's aimed median length, in minutes (reported, not gated) |
| `--out FILE` | where the JSON goes |

The same commit and flags give a byte-identical JSON file: games are seeded, results are sorted by cell and seed
before anything is written, and the wall-clock time appears only in the stdout header.

### Reading a report

Every win rate comes with its 95% Wilson interval: 55% (33–75%) from 20 games means the truth could be anywhere in
that range, 50% included. A cell's rate is the Humans' in Humans vs Vael, the first seat's in a mirror, and the
higher level's on the ladder.

The target checks print PASS or WARN. They are signals for a person, not gates (the command always exits 0):

- **Kingdom vs Expedition** at each level above Easy and each size (both seat orders pooled) PASSes within 35–65% (the
  guardrail; 40–60% aimed). Easy is reported in the tables, not gated.
- **Hard beats Easy decisively on 96**: Hard wins 90% or more of all its games against Easy, and the median length
  (timeouts counted at the cap) is 15:00 or less. **Hard against Medium ends on 96**: 5% timeouts or less. **Medium to Hard, a step not a wall**: Hard wins about
  75–90% of its games against Medium (the PM, Nov 13).
- **The Kingdom ahead in short games, the Expedition in long ones** (below), at each level above Easy.
- **A mirror** WARNs when its interval leaves out 50%: the seat or start position matters.
- **The ladder** (with `--ladder`) WARNs when a level beats the one below it less than 70% of the time.
- **Timeouts** WARN when more than 5% of any cell's games hit the cap; Easy against Easy is counted apart, reported
  and not gated.

**Game length** (a table after the checks): each level against itself per size, the median of the finished games and
the timeouts beside it. Reported, not gated. **Between the levels**: each cross pair's higher-level wins and median
length, pooled and by the peoples (the ladder's steps: a step near 100% while the one below is gentle is a cliff).

With 10 seeds a cell, a single cell's interval is about ±30 points: per-cell figures rarely mean much alone. The
pooled checks (about 20 games per level and size for Kingdom vs Expedition, 80 per Hard cross check) carry the signal.
And with many checks, some WARN by chance: a 95% interval misses the truth one time in twenty, so among the default
batch's 8 mirror checks a stray WARN can come. A WARN that repeats with `--seeds 30` is worth a look.

The key figures block is the Balance reports database's fields (Notion), one per line, ready to copy. The
observed exchange rate is the median over games of shards mined over ether mined, and the same for what was spent:
how many shards a point of ether is worth in practice, the evidence for the sheet's ether weight.

What a game records: units trained (not the starting workers) and lost, and buildings finished (not the starting
headquarters) and destroyed, both by kind (a construction site the AI cancels is counted apart, not as lost); shards and ether mined and spent (the sim's `ledger`); peak supply; the
sim's own stats; the first attack and the first ether vent that ran dry.

### A human's opening

The AIs spend every coin at once, so the gold checks never show what a person feels. `report` also plays a plain
scripted player alone (no AI, no foe moving), three map seeds a people and size: workers to its crew, supply when
short, a production building from 1:00, a second once the first stands, then units from each, one at a time, saving
for the first thing it cannot pay for (human.rs). Over 2:00-6:00 it gives the bank (median, most), the share of the
time it waits for gold and the share of its production buildings' time busy, then its bank each minute to 8:00. The
target (the PM, Nov 13): one production building kept busy or a second one built, not both, and no bank piling up.

### The Kingdom by game length, and the top tier

**By game length:** the Kingdom's win rate against the Expedition (both seat orders, every map but the Shore, timeouts
left out) in three bins of the game's length: under 10 minutes, 10 to 15, over 15; per level and size, and per level
pooled over the sizes, each with its 95% interval and its games. The design target is the Kingdom ahead in short games
(about 55–65%) and the Expedition in long ones. Two target checks per level follow it: "the Kingdom ahead in games under
10 min" PASSes on a rate over 50%, "the Expedition ahead in games over 15 min" on one under 50% (point estimates: with
few games in a bin, read the interval).

**The top tier:** per people, level and size (each level against itself), the median time of the seat's first
top-tier unit (the Kingdom's first Knight or Cannon, the Expedition's first Android) and of its first of each
tech building finished (the Blacksmith, the Stables and the Workshop; the Lab, the Uplink and the Portal), over the
seats that got there, how many of all beside it. The target is the first top-tier unit at about 8–10 min. Each seat's
record holds the tick of its first unit trained of each kind (`first_unit_tick`) and its first building finished of
each kind (`first_bldg_tick`).

### The Shore map (`--maps Shore`)

The Shore map is a two-start 64x64 map with water, so the lab plays it at 64x64 only. With `--maps Shore` the
report adds a section of its own:

- **Each people's win rate from each half of the map** (south or north start), Humans against Vael, at each level and
  pooled, with 95% intervals.
- **The AI's attack waves**, per people and level: how many it launched and the share that reached the other side.
  A wave is counted when a seat's AI sends one out, and it reached when one of its units came within 8 tiles of an
  enemy building (`World::ai_wave_of`, read every 15 ticks).
- **The Vael's time in deep water:** the share of their ground units' samples there. A rise with timeouts would name
  a stall at sea.
- **Routes per seed:** the walk and swim lengths between the Human cove and the Vael basin.
- **Income and losses at fields**, per people and level (Humans against Vael, both seat orders): shards and ether
  mined a minute of play (timeouts too), workers lost a minute, and workers and other units lost at a field a game
  (within 4 tiles of a crystal's or a vent's middle, where the unit stood the tick before it was gone; a crystal
  mined out no longer counts, a dry vent still does).
- **The gate** of the Shore map's PRD, one row per check: first fight, results and timeouts, game length, each people
  from either half at Medium, waves that reached, mirrors.

`npm run lab -- report --sizes 64 --maps Shore --seeds 30` is the Shore report kept for the gate, with the Standard
64x64 cells beside it as the control.

**Exposed income** (`--shore-field back|channel|channel-far`; PRD: the tide on the Shore map, R8): where the Vael
basins' main field lies. `back` is every game's map, behind the Core; `channel` turns it to the channel's side,
facing the Humans' cove (40 degrees off the channel, the same 6.5 tiles out, its vents following); `channel-far`
carries that field 7 tiles further out, past the reef ring, the vents left where `channel` has them. That is not
distance alone: in about a third of seeds the far field lies within 6 tiles of the facing cove's farthest expansion
(whose vents then move), and in a few seeds the generator's rock settles differently. Read `channel` against `back`
first. A report with the
field moved names it in its batch (`shore_field`), so `compare` against the plain Shore report says the batches
differ; the Standard cells are the same games in both.

### `compare`

```sh
git checkout main && npm run lab -- report            # target/lab/report-65e24be.json
git checkout my-change && npm run lab -- report       # target/lab/report-1a2b3c4.json
npm run lab -- compare target/lab/report-65e24be.json target/lab/report-1a2b3c4.json
```

For every cell in both reports: the win rate in A and B, the change, and **bigger than noise** when the two 95%
intervals do not overlap. Then median length and timeouts in each, and B's target checks. Cells in only one report
are listed, not compared, and different batches (seeds, cap, maps) are called out at the top.

A worked example (an illustration of the shape, not a real run). A change makes the Vael's Scythe cheaper:

```
| 64 Standard: Humans Hard vs Vael Hard (Humans win) | 60% of 5 | 20% of 5 | -40 pts | within noise | ...
...
0 cell(s) moved more than the noise.
```

The Hard cell fell 40 points, but on 5 games each that is within the noise. Run both sides with `--seeds 30`
(and `--levels Hard --sizes 64` to keep it short), then compare again: a move that survives as **bigger than
noise** there is real. Then look at what changed: the unit mix in each report's tables (did the Vael build more
Scythes, and lose fewer per built?) says why.

### `sheet`

One row per unit of both races (the Siege Tank twice: deployed, and mobile on its light gun), base stats with no
upgrades: cost, supply, build time, hull, shields, armour, speed, range, cooldown, damage against ground and air,
splash, and the derived figures:

- **DPS**: damage over the time between shots *as the sim fires them*. A cooldown counts down by whole 30 Hz ticks,
  so 0.8 s fires every 25 ticks (0.833 s).
- **Effective HP**: hull plus shields. Armour then comes off each hit on the hull, at least 1 still landing.
- **Weighted cost**: shards plus ether x `w`. `--ether-weight-from report.json` takes `w` from a report's observed
  rate (recommended); `--ether-weight W` sets it; without either, `w = 1.5`, an assumption the header says so.
- **Lanchester efficiency**: DPS x effective HP over the weighted cost squared. For the same money, an army's
  strength in a straight fight grows with the square of its numbers.

The sensitivity section ranks the armed units by Lanchester efficiency at `w` = 1, 1.5, 2 and the observed rate.
It flags any unit whose rank moves more than three places: a conclusion that hangs on the weight.

The time-to-kill matrix runs shots one on one through the sim's own `absorb` and `hull_loss` (shields first, then
armour off each hit, at least 1). A test checks it against real fights in the sim.

The sheet is a heuristic. Range, speed, splash, healing, overkill and pathing change real fights, which is what
the duel matrix (`crates/endfall-sim/tests/gameplay/balance.rs`) and the report measure.

### `plans`

Games where each AI seat follows a plan drawn at random (PRD: the balance lab: plans). A plan is Medium's tuning with
three settings drawn uniformly: the workers it aims for (`harv`, 8 to 20), its first wave's time (`first`, 2:00 to
7:00) and when it expands (`expand_at`, 3:00 to 12:00, or never in one draw in five). It also carries two coins: a
**placebo**, which changes nothing, and a **planted** coin, which raises the seat's income 10% only in the control run.
The plans come from the lab's own seeded RNG (`--seed`), never the world's, and reach the AI through
`World::set_ai_plans` (the sim reads every AI number through `World::tuning`). The menus' AI is untouched.

The batch plays 64x64 Standard and Shore (`--maps`), each in four seatings: Humans against Vael both ways, and both
mirrors. Game *i* takes the map *i* mod the maps, then the seating, then a map seed, and two fresh plans. Flags:
`--games N` (2,000; 1,000 with `--plant`), `--maps`, `--seed S` (1), `--plant`, `--check N` (200: the direct check's
setups), `--first-max M:SS` (7:00: the latest first wave drawn; the bins stay 1:15 wide, so 12:00 makes eight, and
the other settings draw the same values as with the default), `--cap MIN` (30), `--threads N`, `--out FILE`. The JSON is the same bytes for the same commit and flags, on
any platform (the model's `exp` and `log` are libm's).

**The model** is a logistic regression of "the first seat wins" (timeouts left out and counted) on each setting's
difference between the seats: workers and the two times in standard deviations of a seat's draw, "never expands" and
the coins as 0/±1. The seating and the map are controls. A seat that never expands takes the expanders' mean
expansion time, so "never expands" carries that difference alone. Reading it:
- **A coefficient** is the change in the log-odds of the first seat winning per unit of the difference. A positive
  coefficient means more of the setting than the opponent helps. "Beyond zero" means its 95% interval excludes zero.
- **Importance** is the log-likelihood lost when a setting's columns are dropped and the model refitted. It ranks the
  settings by how much they explain.
- **The correlation matrix** of the settings' columns should be near zero: the draws are independent by design. A
  large value means something is wrong with the drawing.
- **Win rate by setting** bins a seat's own setting against whether it won (each finished game counts both seats),
  overall and in short and long games (split at the median finished length). An effect may not be a straight line:
  too few workers and too many can both lose. The bins show the shape the coefficient averages away.

**The controls** show the method works:
- **The placebo** should hold zero in the main batch. A sound method puts it outside zero about one run in twenty (the
  model's tests check that on null data at 400 and 2,000 rows), so rerun with another `--seed` before doubting the
  method. Outside zero again would mean the method finds noise.
- **The planted coin** (`--plant`) must be found: an interval above zero, and more important than the placebo. The
  report gives the model's average effect of the bonus on the first seat's chance, in points.
- **The direct check** plays the first `--check` setups twice, seat 0 planted and seat 1 not, with the bonus on and
  then off. Seat 0's win-rate difference, with its 95% interval (paired), is the effect measured directly. The model's
  estimate should fall within it. A pair counts only when both its games finished, and the model averages over the
  batch's finished games, so the two figures cover slightly different games.

**The first wave** (a table after the bins; `first_wave` per seat in each game's JSON): each seat's first attack
wave by its plan's first-wave bin: how many seats launched one, when (median), its army value as it launched
(median; shards plus ether at 1.5, the formula sheet's default), and its result while out, the value it destroyed
over the value it lost, pooled. A wave is out from the tick its AI sends it (`World::ai_wave_of`) to the tick it has
none; what it destroyed is the enemy's units and buildings standing at its launch and gone by then (the enemy's
losses elsewhere in that time count too: early in a game there are few). It answers why later first waves win:
bigger at launch, better trades, or both.

**`--tide`** (here and on `report`) plays the same batch with the tide on (`World::set_tide`: the water level's cycle on
maps with water). Run every tide batch beside the same batch without it: the difference is the tide's. Until the AI knows the
tide (the tide's third PR), it plays as if the water stood still: a worker sent ashore at the warning is left idle, and
the AI's economy sends idle workers back to a field, flats or not, so they can be swept every cycle. Read `--tide`
numbers before that PR as the tide's effect on an AI that ignores it.

**Predictions first.** Before a run, write down which way each setting should move the win rate, and in short or long
games (the PRD's section 7). Copy the report's results next to them: matched, missed, or unclear (interval too wide).
A miss is a finding. Several big misses mean the framework needs checking before its results are believed.

### The waves (in `report` and `turtle`)

Every AI attack wave is recorded (`waves.rs`; PRD: the AI breaks a defence, R1): its value as it launched; when it
arrived (the first tick one of its units came within 8 tiles of an enemy building's edge), its value then, in all and
within 8 tiles of that unit, against the defence there (the enemy's armed units, workers left out, and armed buildings
that work, finished and powered, within 8 tiles of that unit; the table's ratio is the near value over it); its result
while out (the value of the enemy's units and buildings that fell within 8 tiles of one of its units, whenever made,
against the value of its own units lost; losses after it, survivors caught going home, are not its); and where its
units fell: on the way (before it arrived), to towers (the seat's losses to buildings grew that tick,
`World::lost_to`) or to units (or to anything without a killer, the tide's sweep). With a split wave (Hard and up) the
arrival is the first prong's. Value: shards plus ether at 1.5. `report` sums them per map,
level (each against itself) and attacking people in "The waves"; `turtle` sums the plain Medium seat's waves against
the turtle by map and people. "Arrived (to no defence)" counts arrivals with nothing armed within 8 tiles: the defence
was elsewhere; the ratio's quartiles are over the defended ones. Each game's JSON lists its waves.

### `bets`

The game's core decision (Stelian, Nov 12): a player bets on an army and defenses for a short game, or on the tech
path for strong late units, and a wrong bet should lose. Three plans a side, each Medium's tuning with a few settings
moved (`bets.rs`, set per seat through `World::set_ai_plans`, lab only):

- **rush** (army first): three barracks and its first wave at 2:30, no tech building (so no top tier, no siege, no Lab
  units), no towers, no research, its expansion at 10:00;
- **defense** (towers first, then an army): six towers by 5:30 (`Diff::towers`), its first wave at 8:00;
- **tech** (straight to the top tier): its tech building at 1:00 (`Diff::tech_at`), its side's techs
  at once (`Diff::tech_from`), its vehicle bay and air factory early, the top tier mixed in early and thick (a Knight per
  two Guards, a Cannon per three, an Android per Sellsword), one barracks to start, its first wave at 9:00.

Every ordered pair of two different plans in each people's mirror (six) and every pair across the peoples in either
seating (eighteen), map seeds 1 to `--seeds` (20) on `--size` (64) Standard maps, a `--cap` (30 min) after which a game
is a timeout. The report gives, per people's mirror and across the peoples, the 3x3 of the row plan's wins against the
column plan (both seatings pooled, timeouts apart, with 95% intervals), the same in games over 15 minutes, the median
lengths, and the target checks: in each mirror, rush beats tech, defense beats rush and tech beats defense in games
over 15 minutes, each at 55–70%.

### `tiers`

Attack now or invest further (Stelian, Nov 13). Each people's tech has three layers: **basic** (the Barracks; the
Recruiting post and the Factory), **mid** (the Blacksmith and the Workshop's Cannon; the Lab, the Uplink and the Drone)
and **top** (the Stables and the Knight; the Portal, the Rover and the Android). A committer (tiers.rs `commit`, from
Medium's tuning) stops teching at its layer and goes for the foe: basic its barracks alone, its first wave at 4:00; mid
its tech building and what it opens, no Stables or Portal, its first wave at 7:00; top straight up on Medium's two
barracks, an elite queued per line unit, no expansion or towers, its first wave at 10:00; **basic late** and **mid
late** as basic and mid, their first wave at 10:30, past the opponent's top tier. Its opponent keeps teching: by
default the bets' tech plan (one barracks, its first wave at 9:00: a weak benchmark), with `--greedy` the greedy human
(the tech plan on Medium's barracks, two towers by 5:00, a reserve at home, its first move at 10:00), with `--steady`
the steady teching player (Medium itself, its first move at 10:00: the realistic one). Every pairing of the peoples,
the committer in either seat, map seeds 1 to `--seeds` (10) on `--size` (96). The report gives the committer's wins of
the decided games by layer and pairing, timeouts, lengths and first waves, and two checks per people on the three
layers: no dominant layer (over 65%) and no dead one (under 20%).

`trace --plans top,greedy` plays one such game traced (a plan per seat: `rush`, `defense`, `tech`, `basic`, `mid`,
`top`, `greedy`, or `-` for the level's own).

### `turtle`

A Medium AI seat that never attacks (Medium's tuning with `first` = never, so no wave launches, and no raids, since
Medium's flyers otherwise hunt the enemy's workers whatever the waves; it still builds, defends and expands) against
plain Medium, for the tide's gate (PRD: the tide on the Shore map, R8: a turtling bot must lose
over 70%). Every pairing of the peoples, the turtle in either seat, map seeds 1 to `--seeds` in every cell: 8 cells a
map. A timeout counts as not lost. The report gives the turtle's loss rate with its 95% interval per pairing and seat,
per pairing, per map and in all, with its wins, the timeouts and the median length of a game it lost. Flags:
`--seeds N` (25), `--maps` (Shore), `--size 64|96|128` (the maps' size; the Shore is 64x64 only), `--raids` (the
turtle keeps Medium's raids: `first` = never alone, the PRD's letter), `--weak` (the weak turtle: Easy's economy on one
base, the newcomer), `--attacker-level` (the attacker's whole tuning; Medium by default), `--cap MIN` (30),
`--threads N`, `--out FILE`. A turtle that does not lose before the tide is Medium's weakness, not the tide's. "The
first hit" gives, of each game, when the attacker's first wave arrived, how many games were hit before 8:00, and that
wave's units (median, most): with `--weak --attacker-level Easy --maps Standard` (and `--size 96`) it is when, and with
how many, a passive newcomer first meets Easy (since Nov 13: no sooner than 7:45, and four units at most).

### `trace`

One game, a line per seat every `--every` seconds (30): its gold, gold mined, workers, finished buildings, army worth
and units by kind, its AI's wave state (`World::ai_trace`: the wave's count, whether one is out and how much of it
stands, its last wave, since when the next is ready, the enemy army it expects and when it saw it, its reserve, guards
and raiders, the enemy siege it saw) and its buildings by kind, then how it ended. For telling a stall (armies idle at
home, a wave stuck, an AI that stops building or attacking) from a grind (waves trading, both rebuilding). Flags:
`--size` (64), `--map` (Standard), `--races` (one per seat, by name or key: four for four seats), `--levels` (one, or
one per seat), `--teams 0,0,1,1`, `--seed`, `--side` (the seats' turn on the map, 0), `--cap` (30 min), `--every`.
