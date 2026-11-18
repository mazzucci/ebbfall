# Writing a plan for Ebbfall's AI

You (Claude) write a plan for one AI seat in Ebbfall, a real-time strategy game. The seat is the game's **Hard AI
playing your plan**: it still places every building, trains, fights, retreats and picks targets by itself, and your plan
sets its strategy: how greedy its economy is, when and how big its attacks are, when it expands and techs, what it
builds, leans on or refuses to build. After the game you get the game summary (JSON); in an embedded game you also get a
check-in every 2 game-minutes and on key events, and you may answer each with a delta. The transport (link, messages) is
in `claude/PROTOCOL.md`.

What you set never breaks the rules: the sim validates every field, clamps a value out of range and drops what does not
fit, and every adjustment is reported back (`adjusted`).

## The game in brief

- One resource. Workers mine it from gold mines; everything costs it. The Kingdom calls it **gold**, the Expedition
  **energy** (the same number). Units take places: the Kingdom's population (Cottages), the Expedition's grid
  (Substations).
- Two peoples:

| | Kingdom | Expedition |
| --- | --- | --- |
| Headquarters (a second base is another one) | Castle (400) | Data center (350) |
| Workers | Villager (50) | Bot (50) |
| Line building and units | Barracks (150): **Guard** (line, melee, 50), Archer (ranged, hits air, 75) | Recruiting post (150): **Sellsword** (line, melee, 100), Bruiser (heavy melee, top tier, 225; needs the Lab) |
| Tech building | Blacksmith (300): upgrades; the Workshop, the Stables and the Knight need it | Lab (200): upgrades; the Drone, the Bruiser and the Uplink need it |
| Other unit buildings | Workshop (300): Cannon (siege, 275), Ballista (anti-air, 125), Balloon (scout, 50). Stables (350; needs a Market): Rider (raider, 100), Knight (elite, top tier, 325) | Factory (120): Buggy (raider, 80), Drone (flyer, hits air, 65). Portal (350; needs an Uplink, 275): Android (top tier, 525), Rover (top tier siege, 550) |
| Income building | Market (75): pays by itself, one a Castle | Wind turbine (18): pays by itself, five a Data center |
| Tower | Watchtower (150) | Sentry mast (125) |

- A seat loses when its buildings are gone, or when it has nothing left to fight with and no money to train more.
- The default test game: Standard map, 96x96, two seats, stopped at 30:00 (a timeout: nobody wins).

## How the AI economy works

A base has one gold mine by its headquarters. **A main base saturates at about 14 workers** (measured: 13 workers mine
about 460 a minute on Hard, 14 about 570, and 17 or 23 still about 575): workers past that add almost nothing until a
second base gives them another mine. The `workers` field is the AI's crew target at its main; it ends up with about 3
more (builders, its scout), and about 3 more again once it has a second base. Hard mines 10% faster than a person.

The AI builds **one building at a time**, in a fixed priority each half second: supply first (Cottages, Substations)
when it is near its cap; then its Market or turbines, its barracks to the count due, then **its tech building** (not
before its `tech_building` time, and only once a barracks stands; the Kingdom's also once its Market stands), its
vehicle bay, **its towers** (each from its time, once a barracks stands), its raiders' building, then later techs. So
every time in a plan is **the earliest the step may begin**: it is gated by money, by what it needs standing first, by
the buildings ahead of it in that order, and by at most two sites at once. Hard also puts its army first: when its army
is smaller than the foe's it last saw (from its stalled-game time on), it builds nothing but supply until it has
caught up. A second base is saved for from `expand` on, once it has its crew, and takes a minute or more to build.
The summary's `plan` block shows each step's planned time against when it happened, and what held it up.

## The wave rules

- **Its first wave** leaves once the clock passes `first_wave`, it has `first_wave_size` units at home (the Expedition
  counts 0.6 of that: 10 means 6), and its army's worth is at least 1.3 times the enemy army it last saw. A sighting
  older than 2:00 is stale: it sends a unit to look first. Four minutes after its last wave it goes whatever its
  strength.
- **Later waves** need 3 more units each (up to 26) and leave at least `wave_gap` after the last one came home or went.
  Unless `later_min` is set, a wave short of its count still goes when it crushes what it expects (3 times its worth,
  half its count at least), and a stalled game's push goes with half its count: later attacks then trickle out.
  `later_min` makes every wave after the first wait for that many units (unless it is at its cap).
- **What stays home:** its raiders (Riders, Buggies) raid workers instead; its scout; three guards at its expansion; and
  against a foe that does not attack, a home reserve of a quarter of its army.
- **Coming home:** a wave pulls back when fewer than 40% of its units are left, when it is outmatched on contact by a
  foe that has not attacked it, when it has nothing to fight for 1:30, or when a raid hits its base. A big wave sends
  its fastest third at a known expansion.
- **A stalled game** (from a time between 10:00 and 13:00, after 3 minutes in which its side razed nothing): it masses
  for up to 3 minutes, then pushes with everything and fights to its last unit.

## The plan code

One line of lower-case letters, digits and dots: `1.` (the version) and then fields, each a letter and its value, in
any order. Times are minutes `m` seconds: `4m30`, `6m` (whole minutes), `0m45`. `no` leaves a step out where the table
allows it. `o` and `n` repeat; every other letter appears once. Example (a greedy economy, two early towers, Knights
late, no Archers, later waves massed):

```
1.w14.f6m.s12.e5m.b2.t2m.k8m.o2m.o4m30.r1.pknight.narcher.m20
```

| Letter | Field | Meaning | Range | Left out (Hard as its drawn style plays it) |
| --- | --- | --- | --- | --- |
| `w` | workers | The crew it aims for at its main (about 3 more in all). Past about 11, more workers buy nothing at one base. | 8 to 20 | 11 |
| `f` | first wave | The earliest its first attack leaves (see the wave rules). | 2m to 12m | 4m (its Pressure style 3m30) |
| `s` | first wave size | Units its first attack waits for (the Expedition counts 0.6 of it). | 4 to 16 | 8 (Pressure 7, Boom 10) |
| `e` | expand | When it starts saving for its second base, or `no` (it still takes one when its mine runs dry, and more bases later against a foe that does not attack). | 3m to 12m, or no | Kingdom 8m (10m on 128x128), Expedition 5m30; Pressure 1m30 later, Boom 1m sooner and first |
| `b` | barracks | Line buildings it raises at the start; it adds one at 5:00 and at 9:00, and one more when its money piles up. | 1 to 4 | 3 |
| `t` | tech building | When it may raise its tech building, or `no` (no upgrades, nothing that needs it: the Kingdom keeps Guards, Archers and Balloons, the Expedition Sellswords and Buggies). 1m30 or sooner also brings its upgrades forward. | 1m to 10m, or no | 2m30 |
| `k` | top tier | When it may train top-tier units (Knight; Bruiser, Android, Rover), `0m` from the start, or `no`. They also need their buildings. | 0m to 20m, or no | 6m (Pressure 8m) |
| `o` | tower | One tower from this time; repeat for more, `ono` for none. | up to 6, each 1m to 20m | `o2m30.o8m` |
| `r` | raids | `r1`: its raiders hunt your workers; `r0`: they join its army. | 0 or 1 | 1 |
| `p` | favor | One unit it trains a third more often. Kingdom: `archer`, `cannon`, `ballista`, `knight`. Expedition: `bruiser`, `rover`, `drone`, `android`. | one unit | its style draws one |
| `n` | won't build | A unit it never trains (the dare). Repeat, up to 3. Never its line unit (`guard`, `sellsword`: dropped). Start only. | up to 3 units | none |
| `m` | later waves | The least count of every wave after its first (counted like `s`). | 4 to 40 | none: 3 more a wave, to 26, and trickles allowed |
| `g` | wave gap | The least time between two waves. | 0m30 to 5m | 0m50 |

Unit words are the names in lower case: `guard archer cannon ballista balloon rider knight` (Kingdom), `sellsword
bruiser buggy drone android rover` (Expedition). A unit of the other people is dropped.

**The dare (`n`):** a building whose usual unit is barred trains its next one (Barracks without Archers: Guards). With
Archers barred, the Kingdom's only answer to flyers is the Ballista; with Drones barred, the Expedition's is the
Android. A barred raider means no raids with it; its building still goes up for its other unit. The summary's
`plan.wont_build` shows how many it trained (0: it kept its word).

## Deltas and intents (an embedded game only)

During an embedded game you may answer a check-in with a **delta**: the same code with only the fields you change (they
replace the plan's from that tick; `o` replaces the whole tower list), plus **intents**, carried out at the seat's next
turn (half a second):

| Intent | What it does |
| --- | --- |
| `xattack` | Its next wave goes now with what it has (no count, gap, time or strength to wait for); ends a hold. |
| `xhold` | No wave leaves for 2 minutes (an `xattack` ends it). |
| `xpull` | The wave out comes home to its rally. |
| `xmass` | Its next wave waits for half again its count (4 more at least, 40 at most). |

Example: `1.m24.xpull.xmass` (bring the wave home, and gather a bigger one). `n` is refused in a delta, intents at the
start. A delta takes effect on the tick it arrives: **the game never waits for you**, so plan for your answer landing
some seconds after the check-in. A plain link (a phone, a chat) is plan-at-start only: nothing changes the plan during
that game.

## Reading the summary and the check-ins

- Your seat is the one whose `player` is "AI (Hard) playing a written plan"; its `plan` block has the code as it was
  played and, for each step, `planned` against `went`/`placed`/`finished` with `held_up_by` (the AI's own reasons, by
  share of the time it waited): `no money`, `needs a ...` (a building first), `a ... first` (its build order was busy
  with it), `other buildings going up`, `army first (behind)`, `too few workers`, `wave count`, `strength`, `scouting`,
  `under attack`, `gap`, `held`.
- Each attack says why it `went` (`count 12/11`, `short 6/9 but crushing what it expected`, `at its cap`,
  `stalled-game push`, `ordered`), its `contact` (`ours`: its value standing when it arrived, `met`: the enemy army and
  towers within 12 tiles), its result, and `why_ended`. `trades` give, by your unit type, the value it lost and the
  value of the enemy it killed. `spent` splits your money between workers, army, buildings, expansions, towers and tech.
- The other seat's `style` (Pressure: an early small wave, later tech; Timing: Hard's own plan; Boom: an early second
  base and bigger waves) and its `leaning_unit` are shown after the game.
- Places are named after bases ("seat 1's main base", "open ground 20 tiles north-east of seat 0's main base"); values
  are each seat's money. `saw_of_enemies` and the check-ins' `enemy` hold only what that seat's own sight showed.
- The same plan and seed play exactly the same game. The seed changes the map and the other seat's style draw.
