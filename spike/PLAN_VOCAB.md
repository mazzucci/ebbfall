# Writing a plan for Ebbfall

You write a plan for one AI seat in Ebbfall, a real-time strategy game. The game then plays itself to the end: your
seat (seat 0) is the game's Hard AI following your plan, seat 1 is the plain Hard AI. Afterwards you get the game
summary (JSON). You read it, explain in a few words what happened and why, and write a revised plan.

The AI still plays the game itself: it places buildings, fights, retreats, researches and picks targets. Your plan sets
its strategy: how greedy its economy is, when and how big its first attack is, when it expands and techs, what it
builds and what it leans on.

## The game in brief

- One resource, gold. Workers mine it (the Kingdom calls them Villagers, the Expedition Bots). Everything costs gold.
- Two peoples. The default round: you play the **Kingdom**, Hard plays the **Expedition**, on a 96x96 two-player map,
  stopped at 30:00 (a timeout: nobody wins).
- A seat loses when its buildings are destroyed, or when it is "helpless" (no units and no money to make any).
- Units come in tiers. Hard fields the line and the mid tier from the start; the top tier opens at `top_tier`.

| | Kingdom | Expedition |
| --- | --- | --- |
| Headquarters (an expansion is another one) | Castle | Data center |
| Line building, its units | Barracks: Guard (line, melee, 50), Archer (ranged, hits air, 75) | Recruiting post: Sellsword (line, melee, 100), Bruiser (heavy melee, top tier, 225, needs the Lab) |
| Tech building | Blacksmith: upgrades; Cannon, Ballista, Knight and the Stables need it | Lab: upgrades; Drone, Bruiser and the Uplink (then the Portal) need it |
| Other unit buildings | Workshop: Ballista (anti-air, 125), Cannon (siege, 275), Balloon (scout); Stables: Rider (fast raider, 100), Knight (elite, top tier, 325) | Factory: Buggy (fast raider, 80), Drone (flyer, hits air, 65); Portal: Android (top tier, anti-air, 525), Rover (top tier, 550) |
| Tower | Watchtower | Sentry mast |

## The plan

A JSON object. Every field is optional: a field left out keeps Hard's own value (the default below). Times are
`"m:ss"` game time. Out-of-range values are clamped to the range, and every adjustment is printed and also listed in
the summary under `plan_applied.adjusted`. Unknown fields are ignored (a `"notes"` field, or any field starting with
`_`, is kept for you and ignored silently).

| Field | Meaning | Range | Default (Hard) |
| --- | --- | --- | --- |
| `workers` | How many workers it aims for at its main base (about 3 more once it has a second base). More workers: more income later, a smaller army early. | 8 to 20 | 11 |
| `first_wave` | The earliest its first attack leaves. It also waits until its army looks about 1.3x what it last saw of yours (or has waited 4:00). | 2:00 to 12:00 | 4:00 |
| `first_wave_size` | Units its first attack needs (the Expedition counts 0.6 of this: 10 means 6 units). Each later wave needs 3 more, to 26 at most. | 4 to 16 | 8 |
| `expand` | When it starts saving for its second base (a new headquarters, 400 gold for the Kingdom, 350 for the Expedition), or `"never"`. It finishes later than this: it has to pay for it, and it is often a minute or more. It still expands early if its home mines run dry, and later takes more bases against a passive foe. | 3:00 to 12:00, or never | Kingdom 8:00 (10:00 on 128x128); Expedition 5:30 |
| `barracks` | Line buildings it raises at the start (Barracks, Recruiting post); it adds one more later. | 1 to 4 | 3 |
| `tech_building` | When it raises its tech building (Blacksmith, Lab). `"never"`: no upgrades and nothing that needs it (the Kingdom keeps only Guards, Archers and Balloons; the Expedition only Sellswords and Buggies). 1:30 or sooner also brings its upgrades forward. | 1:00 to 10:00, or never | 2:30 |
| `top_tier` | When it may start training top-tier units (Knight; Bruiser, Android, Rover). `"0:00"`: from the start. `"never"`: never. | 0:00 to 20:00, or never | 6:00 |
| `towers` | When it raises each tower, one time per tower: `["2:30", "8:00"]` is two towers. `[]`: no towers. | up to 6 times, each 1:00 to 20:00 | `["2:30", "8:00"]` |
| `raids` | Whether it sends its fast units (Riders, Buggies) to raid your workers. | true or false | true |
| `favor` | One unit it leans on: it trains it a third more often than usual. Kingdom: Archer, Cannon, Ballista or Knight. Expedition: Bruiser, Rover, Drone or Android. | one unit, or left out | none |
| `wont_build` | The dare: units it never trains (see below). | up to 3 unit names | none |

Example:

```json
{
  "notes": "Round 1: greedy economy, two early towers, Knights late, and no Archers.",
  "workers": 14,
  "first_wave": "6:00",
  "first_wave_size": 10,
  "expand": "5:00",
  "barracks": 2,
  "tech_building": "2:00",
  "top_tier": "6:00",
  "towers": ["2:00", "4:30"],
  "raids": true,
  "favor": "Knight",
  "wont_build": ["Archer"]
}
```

## The dare (`wont_build`)

A handicap you take on: your seat never trains the units listed, by name (`"Archer"`, `"archers"` and `"lancer"` all
work). What it does instead:

- A building whose usual unit is barred trains its next unit (a Barracks with Archers barred trains Guards).
- An answer that is barred falls to the other answer: with Archers barred, the Kingdom's only anti-air is the Ballista;
  with Drones barred, the Expedition's is the Android.
- A raider barred (Rider, Buggy): no raids with it, and its building still goes up for its other unit (the Expedition's
  Factory for Drones). A building with every unit barred still goes up and stands idle.
- The line unit (Guard, Sellsword) cannot be barred: the AI counts its whole army by it. It is dropped with a note.
- Only units of your seat's people count; another people's unit is dropped with a note.

## Things to know when reading the summary

- Your seat is seat 0 (`"player": "Claude's plan (Hard AI)"`); `plan_applied` at the top is the plan as it was
  played, after clamping.
- Hard's AI (seat 1) draws a style each game (pressure, timing or boom) that the summary does not show; your seat plays
  your plan and no style. With the same plan and seed, the game is exactly the same.
- The seed changes the map's layout and the opponent's style. To test a plan, not a map, compare across a few seeds.
- `attacks` are each seat's AI waves: when they left, what they had, whether they arrived and how the exchange went.
  `saw_of_enemies` is only what that seat saw with its own sight. `main_fights` are the biggest clusters of deaths.
- All values are gold. The Expedition's money is called energy in the game; the summary says gold for both.
