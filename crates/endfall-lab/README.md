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
npm run lab -- turtle            # a Medium seat that never attacks against Medium on the Shore (200 games, ~15 min)
```

### `report`

The default batch, on 64x64 and 96x96 Standard maps:

- every AI level against itself, in four matchups: Humans vs Vael, Vael vs Humans, and the two mirrors;
- the ladder: each level against the one below it, each race a mirror, the higher level in either seat.

That is 56 cells, 5 seeds each (seeds 1 to 5), with a 30 game-minute cap. A game still running at the cap is a
timeout: it is reported, not counted as a win. The default batch is 280 games: 432 s on 4 cores (about 3 s a
64x64 game, 8 s a 96x96 one), less with more cores.

**Baselines and before/after pairs use `--seeds 30`** (1,680 games, about 45 minutes on 4 cores); the default's 5
seeds are for a quick look.

| Flag | What it does |
| --- | --- |
| `--quick` | the small batch above |
| `--seeds N` | seeds 1 to N in every cell |
| `--cap MIN` | the timeout, in game minutes |
| `--sizes 64,96` | map sizes (64, 96 or 128) |
| `--maps OpenPlains,Labyrinth` | other map kinds, added to Standard |
| `--levels Easy,Medium,Hard,Brutal` | the levels played (the ladder pairs neighbours among them) |
| `--no-ladder` | only each level against itself |
| `--threads N` | parallel games (default: every core); the JSON is the same whatever N |
| `--length-band 10-20` | the wanted median length on 64x64, in minutes |
| `--out FILE` | where the JSON goes |

The same commit and flags give a byte-identical JSON file: games are seeded, results are sorted by cell and seed
before anything is written, and the wall-clock time appears only in the stdout header.

### Reading a report

Every win rate comes with its 95% Wilson interval: 55% (33–75%) from 20 games means the truth could be anywhere in
that range, 50% included. A cell's rate is the Humans' in Humans vs Vael, the first seat's in a mirror, and the
higher level's on the ladder.

The target checks print PASS or WARN. They are signals for a person, not gates (the command always exits 0):

- **Humans vs Vael** at a level (both seat orders and both maps pooled) WARNs when the Humans' rate is outside
  45–55% *and* its interval leaves out 50%: a real lean, not noise.
- **A mirror** WARNs when its interval leaves out 50%: the seat or start position matters.
- **The ladder** WARNs when a level beats the one below it less than 70% of the time (races, seats, maps pooled).
- **Game length on 64x64** WARNs when the median of the finished 64x64 games of each level against itself is
  outside the band (10–20 min). Timeouts are left out (the check says how many), so many timeouts pull it short.
- **Timeouts** WARN when more than 5% of any cell's games hit the cap.

With 5 seeds a cell, a single cell's interval is about ±35 points: per-cell figures rarely mean much alone. The
pooled checks (about 20 games per level for Humans vs Vael, 40 per ladder step) carry the signal. And with many
checks, some WARN by chance: a 95% interval misses the truth one time in twenty, so among the default batch's 16
mirror checks one stray WARN is expected. A WARN that repeats with `--seeds 30` is worth a look.

The key figures block is the Balance reports database's fields (Notion), one per line, ready to copy. The
observed exchange rate is the median over games of shards mined over ether mined, and the same for what was spent:
how many shards a point of ether is worth in practice, the evidence for the sheet's ether weight.

What a game records: units trained (not the starting workers) and lost, and buildings finished (not the starting
headquarters) and destroyed, both by kind (a construction site the AI cancels is counted apart, not as lost); shards and ether mined and spent (the sim's `ledger`); peak supply; the
sim's own stats; the first attack and the first ether vent that ran dry.

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

### `turtle`

A Medium AI seat that never attacks (Medium's tuning with `first` = never, so no wave launches, and no raids, since
Medium's flyers otherwise hunt the enemy's workers whatever the waves; it still builds, defends and expands) against
plain Medium, for the tide's gate (PRD: the tide on the Shore map, R8: a turtling bot must lose
over 70%). Every pairing of the peoples, the turtle in either seat, map seeds 1 to `--seeds` in every cell: 8 cells a
map. A timeout counts as not lost. The report gives the turtle's loss rate with its 95% interval per pairing and seat,
per pairing, per map and in all, with its wins, the timeouts and the median length of a game it lost. Flags:
`--seeds N` (25), `--maps` (Shore), `--raids` (the turtle keeps Medium's raids: `first` = never alone, the PRD's
letter), `--cap MIN` (30), `--threads N`, `--out FILE`. A turtle that does not lose
before the tide is Medium's weakness, not the tide's.
