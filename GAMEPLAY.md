# Ebbfall: gameplay

How the game plays, for coding agents: the rules the simulation implements, in detail. CLAUDE.md holds the rules the
code must keep and the commands; ARCHITECTURE.md maps the code. Keep this file true when you change a rule.

## Seats, teams and maps

- Seats: a World has N seats (`World::seats()`, 2 to `MAX_SEATS`, at most the map's starts: 2 on 64x64, 4 on 96x96, 8
  on 128x128, `map::max_starts`, all of them generated whatever the seats). Seats sit round the map in order
  (`map::seat_starts`): allies in consecutive seats are neighbours, which is how the menus' teams are made, and with
  teams `Game::with_seats` turns the seats by whole starts only and the free starts go between teams
  (`map::team_starts`), so any split of consecutive seats starts side by side.
- Teams: each seat is on a team (`World::teams`, each its own by default). The game is over when the seats still in
  (`out`) are all one team, and `winner` is that team; a concede knocks out its seat only. While the game goes on,
  what an out seat leaves is inert (`World::inert`: stopped, then left out of the tick; it can still be destroyed).
  Fog is shared with allies (`update_fog` ORs a team's layers); `Game::drain_events` passes on its own seat's events
  (`seen` is a bit per seat).
- AI seats: the scripted opponent plays whichever seats `World::ai_seats` marks, one brain per seat (`World::seat()`
  inside its turn). It fights every enemy and plans against `foe()`, the nearest enemy start still in, ties to its
  partner (seats 0 and 1, 2 and 3, ...). Each AI seat may have its own difficulty (`World::diff_of`,
  `Game.withSeats`' optional `diffs`). `World::tuning` gives the plan (balance lab only: a whole `Diff` per seat,
  `World::set_ai_plans`), else the level's numbers as the seat's drawn style plays them: each AI seat draws its style,
  hidden, from the seeded RNG at its first turn (`World::set_ai_styles` forces one, lab and tests only). What being an
  AI changes: AI income, building in unexplored ground, losing as soon as its buildings are gone.
- A plan for an AI seat (play against Claude; claude/PLAN_VOCAB.md, `World::set_plan`, `Game::setPlan`): in single
  player only (refused in lockstep, never on the network), from a game link (`?plan=`) or an embedding page, set before
  play. The seat plays Hard and its drawn style, with the plan's fields over them (a field it leaves out keeps Hard's;
  a field wins over the style): its crew, its first wave's time and size, its natural, barracks, tech building, top
  tier, towers, raids, a leaning unit, units it won't build (never the line unit; `World::ai_banned`), its later waves'
  least count (`Diff::later_min`: no crushing shortcut or stalled push sends fewer) and the gap between waves. During
  an embedded game a delta (`World::plan_delta`, `Game::planDelta`) replaces fields from its tick and carries intents
  out at the seat's next turn (attack now, hold two minutes, pull back, mass the next wave). The start plan and each
  delta with its tick are recorded with the game (a replay plays them) and the plans are hashed once any is set.
- Maps: the menus offer 96x96 with four starts and 128x128 with eight, each size with maps of its own, any of them for
  as many players as its starts, a duel too. 64x64 (`MapSize::DUEL`, two starts) is hidden from the menus but still
  generated and played: the goldens, `?seed=`, a challenge or room naming one (src/client/maps.js). A map is always
  generated with all its starts, the free ones free ground.
- Mines (Stelian, Nov 15; `map.rs`, `lay_mines`): every field is one 2x2 gold mine. Each start's own mine lies
  exactly `HQ_MINE_GAP` (4) tiles of ground from its headquarters, square to one of its sides; an expansion's field lies
  `EXP_CLUMP_R` out from its site, on the far side from its main where it can (turned 45, 90 or 135 degrees where that
  would crowd another mine), with room for a headquarters on the near side. Any two mines lie `MINE_APART` (12) tiles
  apart or more, center to center, on every kind, size and start count. A map with a center field (`middle`) has one
  mine and its images on a ring round the middle, each midway between two neighboring starts: two mines 7 out with two
  starts, four 10 out with four, four 12 out on the axes with eight.
- Placing a headquarters (a Castle, a Data center): `HQ_MINE_GAP` tiles of ground from any gold mine, footprint to
  footprint ("Too close to a mine for a headquarters"), and `HQ_SPACING` (12) from the seat's own other headquarters
  ("Too close to your other base."); every other building, the Uplink included, only keeps a tile of ground from a mine
  ("Too close to a mine"). The AI places through the same `can_place`.
- Spawning (src/world/spawn.rs): on two-start maps seat 0 faces east and steps out south, the habits the goldens pin.
  On maps of more starts (`map.bases.len() > 2`) units face the map's centre (`home_face`) and step out on their
  building's south side (`exit_tile`), the free southern spot nearest the centre, or nearest the rally point when one
  is set, so a new unit is seen leaving; with no southern spot open, the nearest free spot. The AI's rules for several
  enemies (a wave called home to a raid by another) apply only with more than one enemy still in.
- Builders and workers: a builder of either people stays at its site until the building stands, then waits idle
  beside it; a headquarters' rally point starts on its nearest gold mine (by distance, ties on the mine's id; a Castle
  or Data center built later too), and a new worker from it goes mining there by itself (Nov 27). A worker idle after
  any other order waits for the next (a repairer goes back to its last mine, as before), a rally set on the building
  itself clears it, and the AI orders its own workers.

## Units and weapons

- Who hits flyers (Stelian, Nov 18): melee weapons and artillery hit the ground only; every direct-fire ranged weapon
  hits flyers too. Read from a weapon's data (`Weapon`, a unit's `weapon`, a tower's `weapon`): melee is
  `melee`; artillery is a siege gun (`siege`) or a shot with splash (`splash > 0`: the Cannon, the Rover); direct-fire
  ranged is any other weapon. Melee and artillery have `dmg_air` 0, direct fire has `dmg_air` above 0. A test over the
  tables keeps it (`every_weapon_follows_the_air_rule`, tests/gameplay/combat.rs), so no new unit or tower is an
  exception unnoticed.
- No special effects: a hit takes health and nothing else (no slow, no stun from a weapon; the Archer's slow went on
  Nov 18). A unit's edge comes from its numbers: health, armor, damage, reload, range, speed, cost.
- Standing firm (`World::separate`, tests/gameplay/firm.rs): units of a layer that overlap push each other apart; one
  that holds, or is deployed and settled in (a Cannon sets up by itself wherever it stops), is firm: never pushed, the
  others part from it. A Cannon still settling in is pushed clear as any unit is, so none sets up on top of another. A
  unit walking (a move, an attack-move, a chase, a flight) passes its own seat's firm units (never an ally's or an
  enemy's) and is pushed clear where it stops: it reaches a point one of them covers, gets out of a ring of them and
  through two side by side. A worker mining, building or repairing does not pass them. Two that hold on the same spot
  stay there.
- Crowds (movement.rs, tests/gameplay/crowd.rs): the units of a group share a route's waypoints. One held up (no way
  made within half its radius) for 2 s on a move or an attack-move, within two bodies of a waypoint, passes it by if the
  way on is open; for 3 s within two bodies of where it was sent, it has arrived (an attack-move only with nothing in
  its look to fight). Not on an attack, gathering, building, repairing or fleeing; not while packing up.

## Water, the tide and the Shore map

- Water (the Shore map's model): each tile has a height (`Map::height`, `i8`, from the map's kind and seed; `DRY`
  everywhere on the kinds without water) and the world one water level (`World::water`: 0, not hashed, unless the
  tide is on). Against it a tile is land, shallows (within two below) or deep water (`Map::ground`). A unit gets about by
  its kind's class (`UnitDef::mv`, `Move`): Walk (every ground unit of both peoples since the re-theme: land and
  shallows), Amph (anywhere: no kind has it since the re-theme; the class and its rules stay, as data), Fly (flyers,
  exactly the `air` ones). Every walkability check for a unit takes its `Foot` (class and water
  level: `World::foot(kind)`, `Map::passable`, `nearest_passable`, `astar`, `los`); `blocked` and `nearest_free` stay
  class-free (map generation, buildings, flyers). The contact rules: a Walk unit in the shallows moves at `WADE_SPEED`
  (0.7, in `live_speed`); nothing fires from deep water (`fire` refuses, an attacker in deep water closes in until it
  stands on shallows or land, an idle or attack-moving one picks no fight there, and one there drops a flyer or a target itself in deep water;
  a crowd's push never shoves a walker into it); buildings go by the builder's class (`builds_on`: a
  Walk builder on land, an Amph builder on land and shallows, nobody in deep water), the AI's placement through the same
  `can_place`. On a map without water all of it is inert (the goldens pin that).
- The tide (PRD: the tide on the Shore map; `World::set_tide`, a world switch, off by default: the menus play without
  it until the tide's clock and water are drawn; Rust callers, the lab and the tests turn it on): the water level
  moves through a cycle (`world/tide.rs`, its numbers in `data/tide.rs`): high water, the ebb, low water, the flood
  (3:00 by default, each cycle up to 15% longer or shorter, drawn from the world's RNG as it starts; a game starts at
  high water), a step at a time between `WATER_LOW` and `WATER_HIGH`; `tide_phase`, `tide_level`. It runs first in
  `step`. When the level moves, routes it cuts are dropped (`terrain_changed` and each walker's own) and, on the way
  up, a walker on ground now deep is swept to the nearest ground it may stand on, losing 30% of its maximum health
  and stunned 2 s (`Unit::stun`), or destroyed with `set_flood_kills` (the lab's comparison).
  `TIDE_WARN_S` before the flood each seat with walkers on ground it will cover is warned (a toast, the alert sound, a
  ping) and, its switch on (`SetRetreat`, a command; `World::no_retreat`, a bit per seat; on by default), its idle
  walkers and its idle or mining workers there walk to ground that stays dry; units under any other order keep it.
  Amphibians (none since the re-theme) are never swept. With the tide, building goes by the level that matters (`builds_on`: a Walk builder on
  land at high water, an Amph builder on what is at most shallow at low water), and no building fires from deep water
  either. The tide enters the hash only when on (level, cycle, switches; a stunned unit's stun), so every game
  without it hashes as before; `golden_hashes_pin_the_shore_with_the_tide` pins one with it.
- The Shore map (`MapKind::Shore`, appended; 64x64, two starts): each start's share holds a cove on land (a pocket in
  a corner, its ramp facing the sea) and a reef basin in the shallows (a reef ring with a land channel facing the cove
  across the sea and a sea gate onto the deep band, which only amphibians pass), a deep band between the two reefs,
  shallows round it. Starts by people: a seat whose builders are Amph starts in its start's basin (`Map::basins`;
  nobody since the re-theme), the others in its cove; the start a seat does not use stays open ground with its field. No vent in
  a cove or a basin (no shaft either, since the re-theme's economy). A Shore
  with more than two starts falls back to Standard ground. It has maps of its own (Mirror Lake, Random Lake, appended
  to `MAPS`, with their line), hidden from the menus with every 64x64 map since 2026-11-13 (`?map=12` opens it for the
  tests); the other random maps never draw it (`RANDOM_KINDS`). The renderer
  tints the shallows and deep water (the shade layer and the minimap; `core.js` `ground`). In the balance lab only,
  a basin's main field can lie elsewhere (`ShoreField`: `BACK`, every game's, to the headquarters' flank; `CHANNEL` and
  `CHANNEL_FAR`, the exposed-income variants, towards the cove it faces; `World::set_shore_field`, never from JS or
  the network and not hashed, `Map::generate_with`).
