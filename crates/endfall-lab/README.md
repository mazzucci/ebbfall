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
- **The gate** of the Shore map's PRD, one row per check: first fight, results and timeouts, game length, each people
  from either half at Medium, waves that reached, mirrors.

`npm run lab -- report --sizes 64 --maps Shore --seeds 30` is the Shore report kept for the gate, with the Standard
64x64 cells beside it as the control.

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
