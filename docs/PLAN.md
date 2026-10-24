# Endfall: plan

A browser RTS inspired by StarCraft: Brood War (1998) without being it: harvest, build, raise an army, destroy the
other side's Command Core. Runs entirely in the browser; multiplayer is the headline goal after the single-player
loop feels right.

## Where it stands (October 2026)

- Playable prototype: one faction, one procedurally shaped 64x64 map, one scripted opponent with three difficulties.
- Economy: shards (finite fields) and ether (vents that need an Extractor); supply from Core and Depots.
- Seven structures (Core, Depot, Ether Rig, Garrison, Foundry, Turret, Airfield), six units (Harvester,
  Trooper, Vanguard, Lancer, Medic, and the flying Wasp), fog of war, control groups, rally points, attack-move, hold.
- Mouse, keyboard and touch controls. Works on a phone.
- Sim and client are separate modules. The sim runs headless in Node, uses a seeded RNG, advances by a fixed tick
  and is covered by a determinism test.

## Architecture decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Simulation | Rust compiled to WASM (`crates/endfall-sim`) | Deterministic core for lockstep, small download. Ported from the JS prototype with bit-exact parity, then the JS copy was retired. |
| Sim numerics | f64 with JS semantics + libm, not fixed-point | WASM floats are deterministic across browsers/CPUs; everyone runs the same .wasm. Keeping the JS arithmetic made tick-by-tick parity checking possible during the port. Revisit only if a native (non-WASM) peer ever has to agree. |
| Client | JavaScript ES modules | Fast UI iteration; `src/engine` mirrors the sim for the renderer, HUD and input. |
| Rendering | PixiJS 8 (WebGL) over a generated pixel-art atlas | Batching, filters and blend modes for free; the art is produced by `tools/art` (docs/ART.md) so it is versioned and replaceable. |
| Build | Vite | Zero config, HMR, static `dist/`. |
| Simulation | Fixed 30 Hz tick, deterministic | Prerequisite for lockstep multiplayer and replays. |
| Sim/client boundary | Events out, commands in | Client renders state and events; player intent only enters through `commands.js`. |
| Netcode (planned) | Deterministic lockstep with input delay, relay server | Tiny bandwidth, scales to any unit count; the Brood War approach. |

## Milestones

### M1. Project hygiene (now)
- [x] Split prototype into `src/sim` and `src/client`
- [x] Headless tests incl. determinism
- [x] Rust/WASM simulation with CI build and GitHub Pages deploy (https://mazzucci.github.io/endfall/)
- [x] Commands take entity ids instead of object references (the `Game` orders)
- [x] ~~Fixed-point positions~~: not needed in WASM, see the numerics decision above
- [x] Per-player fog layers in the sim
- [x] Delete the JS reference sim (retired once gameplay fixes started to change behaviour)
- [x] Gameplay test suites: Rust scenarios + randomized invariants, browser end-to-end tests in CI
- [ ] `stateHash()` every N ticks in dev mode, logged to console

### M2. Make the single-player game good
- [x] More units with real counters: Lancer (anti-air infantry), Medic (healer), Wasp (flying gunship from the Airfield); weapons have separate ground/air damage
- [x] Upgrades (weapon/armor tiers) researched at the Forge
- [x] Better AI: plays under fog (scouts with a harvester, remembers what it saw), answers seen flyers with Lancers, raids harvesters with Wasps, expands to a second base on Normal and Hard, pulls a beaten wave back
- [ ] AI: react to the player's ground composition, multi-prong attacks
- [ ] Hand-authored maps + a tiny map format (JSON); keep the generator for skirmish
- [x] Sprite art pass (pre-rendered 3D units and buildings, painted terrain)
- [x] Repair: harvesters restore damaged buildings at construction speed for a quarter of the price (the AI repairs too)
- [x] Observer (2026-10-23): a cheap (25/25) unarmed flying scout from the Airfield, fast with 10-tile sight (the farthest in the game); no cloak or detection; the AI ignores it as an air threat.
- [x] Map variety (2026-10-23): maps used to share one layout (bases always bottom-left/top-right, every field in the same place). The generator now draws per seed: where the bases face each other (either diagonal, west/east, south/north; `Map.bases`), the rock feature size, two or three mirrored expansion sites and an optional centre field; terrain and resources are point-symmetric so both sides get the same map.
- [x] Start menu: opponent, sound, three fixed maps (Ashen Basin, Glass Reach, Cinder Divide) with hidden characters (MapKind: standard, deep fields, ether storm, open plains, labyrinth, barren) and a random map; phone tap-to-play splash for full screen
- [x] Scenery: 3D-rendered props scattered from the map seed (boulders, spires, ruins, wrecks on plateaus; craters and debris on open ground)
- [x] Balance pass (2026-10-23): cost-equal duels on a flattened arena in compact blocks, idle survivors re-engage,
  both orders and three spawn offsets, median (`balance_matrix`), plus Wasp raids on a mineral line (`raid_matrix`).
  Troopers used to win every fight. Now Vanguard shells splash (60% within 40 px, walking units of the target's side),
  Lancers hit air for 30, Medics cost 40/20 and heal 14/s without stacking on one patient, Wasps are 100/60 with
  100 hp and 9 damage (a bigger buff made early raids unstoppable), and Turrets hit air for 26. The loop: Troopers >
  Lancers, Wasps; Vanguards > Troopers, Lancers; Trooper+Vanguard > Troopers; Wasps > Vanguards and undefended
  mineral lines; a Turret or four Troopers stop a two-Wasp raid; Lancers > Wasps. Guarded by
  `the_counters_hold_in_cost_equal_fights`, `a_turret_or_a_few_troopers_answer_an_early_wasp_raid`,
  `a_shell_splashes_walking_neighbours_only`, `two_medics_do_not_make_a_trooper_immortal`.
- [x] Target priority and dry vents (2026-10-24): units that pick their own targets (attack-move, idle) go for
  whatever can shoot them first (fighting units, finished Turrets armed against their layer; Harvesters do not count),
  then other units, then plain buildings; a self-picked building gives way to a threat in sight or a unit in weapon
  range, a shooter gets an answer even from beyond sight, a chased target well out of sight is let go, and units go back
  to their attack-move afterwards. Explicit attack orders stand. Side effect on balance: Wasps now focus the Troopers in
  a Trooper+Vanguard army and win (the Vanguards cannot shoot up); Troopers+Lancers still beat Wasps. Ether vents now
  deplete (5000, like shard fields); a dry vent stays and its Extractor gives a trickle of 2 per trip; the AI keeps
  one worker on a dry vent and taps the vent at its expansion.
- [x] Mining like 1998 (2026-10-24): one Harvester mines a field or vent at a time (`MINE_SLOTS`); the rest wait. A
  Harvester that finds its field busy moves to a field within 7 tiles that has at least two fewer Harvesters on it
  (counting itself), so the load evens out and nobody shuttles. A shard field saturates at three (100, 192, 240/min
  near the Core); ether mines in 1.6 s instead of 2.8 s, so a vent also takes about three (78, 159, 222/min).
- [x] Sound design: synthesized layered effects (no assets), positional by camera (pan, distance), weapon and impact sounds from sim events, unit radio chirps, chimes, ambient wind
- [ ] Resizable maps (estimate, 2026-10-23; not scheduled): the 64x64 size is a compile-time constant in about 80
  places. Sim: `MW/MH/WW/WH` in data.rs, the free `idx()` and fixed-size grids (rock, shade, occ, vis, explored, the
  A* scratch arrays), the spatial hash `GRID`, `BASES` and the resource layout in `Map::generate` (positions in tiles),
  the AI's knowledge of the bases. Client: constants.js, buffers sized once in core.js, the fog/shade/minimap textures
  and terrain chunks in render.js, input clamps, scenery. Plan: carry `w, h` on `Map`/`World` (and in the info
  snapshot), make `idx` a `Map` method, size every grid per game, scale `BASES`/fields with the map, resize the client
  buffers in `resetGame`. About one medium PR plus tests; perf is fine to 128x128 (A* 16k cells, 4x terrain sprites
  with chunk culling). Gameplay cost: travel time roughly doubles at 128, so AI wave timings need retuning.
- [ ] Replays: record seed + command log, play back through the same sim

### M3. Multiplayer (1v1)
- [ ] Command queue: every order becomes `{tick, player, type, args}`; the sim executes a tick only when it has both players' commands for it
- [ ] Input delay (start with ~6 ticks = 200 ms), later rollback if the delay feels bad
- [ ] Relay server: Node + `ws`, forwards commands, acts as tick authority, assigns seats; deployable on a free tier (Fly.io, Railway) or a Cloudflare Durable Object
- [ ] Lobby: create/join by code, pick difficulty-free map, ready up
- [ ] Per-player fog of war (today fog is computed from team 0's view only)
- [ ] Desync detection: exchange `stateHash()` every 100 ticks, dump both states on mismatch
- [ ] Reconnect: late joiner replays the command log from tick 0

### M4. Polish and ship
- [ ] Deploy static build (GitHub Pages / Cloudflare Pages) and the relay
- [ ] PWA manifest so it installs on a phone
- [ ] Settings: key bindings, scroll speed, sound volume

## Next steps (this week)

1. Open the project on the Mac, `npm install`, `npm run dev`, play a few games on Normal and note what feels off.
2. Ids-not-objects refactor of `commands.js` (small, mechanical, unblocks the network command format).
3. Fixed-point positions in the sim: decide the scale (1/256 px is plenty) and convert `x, y, speed, range`.
4. Spike the relay: a 100-line `ws` server plus a `net.js` client that round-trips commands between two tabs of the same machine. Prove two tabs stay in sync by hash before building a lobby.

## Open questions

- **Rust/WASM core or stay in JS?** JS floats are deterministic in practice when `Math.random`/`Date` are excluded and transcendental functions (`sin`, `atan2`, `hypot`) are avoided or tabulated in the sim. Fixed-point in JS gets most of the benefit. Rust buys speed and a stricter type system at the cost of a two-language build. Decide after measuring the sim at 400+ units.
- **Lockstep with input delay vs. rollback?** Delay is simpler and what Brood War did; rollback hides latency but needs snapshot/restore of the whole world (so `G` can no longer be a singleton). Start with delay.
- **P2P (WebRTC) or relay (WebSocket)?** A relay is simpler, works through NATs, and can be the tick authority. P2P saves hosting but still needs a signaling server. Start with the relay.
- **Second faction, or one faction done well?** Asymmetric factions are the StarCraft magic and triple the balance work. Lean: one faction with a deep tech tree first, second faction after multiplayer works.
- **Art direction.** Keep the vector look (cheap, scales, distinctive) or move to pixel sprites (more "1998")? Vector until gameplay is settled.
- **Map size and unit cap.** 64x64 tiles and ~100 units per side feels right for 1v1 on a phone screen; revisit if the pathfinder (per-unit A*) becomes the bottleneck, in which case switch to flow fields.
- **Name.** "Endfall" was chosen on 2026-10-17 after checking that no shipped game uses it; verify trademark/Steam/itch again before any public release.
