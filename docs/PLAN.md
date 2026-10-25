# Endfall: plan

A browser RTS inspired by StarCraft: Brood War (1998) without being it: harvest, build, raise an army, destroy the
other side's Command Core. Runs entirely in the browser; multiplayer is the headline goal after the single-player
loop feels right.

## Where it stands (late October 2026)

- Playable in the browser and offline (installable, service worker): two races, three named map characters,
  a scripted opponent for either race with three difficulties (Easy, Medium, Hard), random start side.
- Humans: Core, Depot, Ether Rig, Garrison, Foundry, Turret, Airfield; Harvester, Trooper, Vanguard, Lancer, Medic,
  Wasp, Observer. Workers build and repair; upgrades at the Foundry.
- Vael: Conflux, Spire, Siphon, Kiln, Loom, Ward, Zenith; Lumen, Scythe, Prism, Monolith, Shrike. Warp-in
  construction, power fields, shields that regenerate; no repair.
- Economy: shards (finite fields) and ether (vents that need a refinery); supply from headquarters and supply
  buildings. Fog of war, control groups, rally points, attack-move, hold.
- Mobile first: touch controls, a compact console and command card, landscape and portrait.
- The sim is Rust compiled to WASM: deterministic (golden state hashes, replayable command log), seats instead of a
  fixed human team (one AI brain per seat, events per seat), ready for lockstep multiplayer.

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
- [x] Better AI: plays under fog (scouts with a harvester, remembers what it saw), answers seen flyers with Lancers, raids harvesters with Wasps, expands to a second base on Medium and Hard, pulls a beaten wave back
- [ ] AI: react to the player's ground composition, multi-prong attacks
- [ ] Hand-authored maps + a tiny map format (JSON); keep the generator for skirmish
- [x] Sprite art pass (pre-rendered 3D units and buildings, painted terrain)
- [x] Repair: harvesters restore damaged buildings at construction speed for a quarter of the price (the AI repairs too)
- [x] Observer (2026-10-23): a cheap (25/25) unarmed flying scout from the Airfield, fast with 10-tile sight (the farthest in the game); no cloak or detection; the AI ignores it as an air threat.
- [x] Map variety (2026-10-23): maps used to share one layout (bases always bottom-left/top-right, every field in the same place). The generator now draws per seed: where the bases face each other (either diagonal, west/east, south/north; `Map.bases`), the rock feature size, two or three mirrored expansion sites and an optional centre field; terrain and resources are point-symmetric so both sides get the same map.
- [x] End screen (2026-10-25, holistic review item 19): a chart of both armies over the game (army value = shards + ether of fighting units, sampled every 10 s in `World::army_log`, not hashed; two lines, no numbers, the enemy's revealed at the end), REMATCH (same map, seed, races and difficulty) beside NEW GAME (the menu), and this device's record per race and difficulty beside START ("2 won · 1 lost", nothing before a first game).
- [x] Main pockets (2026-10-25): each main sits in a ring of rock (12 tiles out, 2 thick) with one ramp, about five tiles wide, facing its natural (the expansion nearest it), so a base has a front door to wall off or hold, and the natural outside it is the first thing to take and defend. Expansion fields lie on the far side of their site from the main (they once plugged the ramp), and the natural always has a vent. Open plains keep their open ground. Next: expansions that matter (smaller main fields, a richer natural, a toast when the main runs low).
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
  deplete (5000, like shard fields); a dry vent stays and its Ether Rig gives a trickle of 2 per trip; the AI keeps
  one worker on a dry vent and taps the vent at its expansion.
- [x] Mining like 1998 (2026-10-24): one Harvester mines a field or vent at a time (`MINE_SLOTS`); the rest wait. A
  Harvester that finds its field busy moves to a field within 7 tiles that has at least two fewer Harvesters on it
  (counting itself), so the load evens out and nobody shuttles. A shard field saturates at three (100, 192, 240/min
  near the Core); ether mines in 1.6 s instead of 2.8 s, so a vent also takes about three (78, 159, 222/min).
- [x] Phone HUD (2026-10-24): the selection console at the bottom between the minimap and the command card, always
  there at one width (portrait, name, health, attack and armor; research and production as bars, no timers); the
  command card has three buttons a row; no Move, Stop or Deselect buttons (tap the ground to move, Hold, Esc on
  desktop); an armed order's button turns into its Cancel; the Build list has basic and Advanced (V) pages.
- [x] Phone playtest fixes (2026-10-24, from a Fable playtest on a phone): a site that loses its last builder says
  so once; the same toast is never repeated within a few seconds (no "Supply blocked" storm; the supply counter
  pulses instead); touch hints say "tap"; no keyboard letters on touch buttons; a group shows one tile per type with a
  count on small screens; the construction bar and hint fit the phone; taps pick units within a fingertip at any zoom
  and a double-tap counts on a unit that moved. New players start on Easy; Normal is now called Medium. Each game draws
  which of the map's two bases is ours (`World::with_map_side`). Later: drag-to-place buildings with a confirm tap.
- [x] Offline (2026-10-24): `tools/offline/plugin.mjs` writes `dist/sw.js` after each build, listing every file (no
  source maps) under a cache named by a hash of the files; the service worker stores them on install and serves them
  cache-first, so the game opens and plays offline. A new build installs a new cache; on the menu the page switches at
  once, in a game it says the new version loads next time.
- [x] Second race, the Vael (design: race/VAEL.md on the design-mockups branch), phase 1 (2026-10-24): their kinds
  and art (tools/render3d/vael.js), a VAEL faction chosen in the menu (and the enemy's race: Humans, Vael, Random);
  shields over hull (regenerate after 6 s, 3/s units, 2/s buildings; no repair), warp-in construction, power fields
  (Conflux 7, Spire 6.5 tiles; Kiln, Loom, Ward and Zenith go dark without one), per-unit splash (Monolith 50% in
  40 px), the scripted opponent playing either race from a per-faction AiScript. Balance against the design's duel
  targets (`the_vael_counters_hold_in_cost_equal_fights`, budgets 2200/4400): Scythe dmg 14; Prism 100/35, 70+80,
  16 ground / 16 air, cd 0.9; Monolith 175/100, dmg 52 (superseded by the race balance below). Known: Prisms lose a little more to massed Troopers than the
  design asked (-0.4 vs -0.3). Phase 2: the Halo (shield mending), Shields research, Vael sounds, human AI Spire
  targeting, raid and AI-vs-AI balance.
- [x] Vael phase 2, the Halo (2026-10-24): 75/50, 40 hull + 40 shields, speed 110, sight 10, from the Kiln with a
  Loom; mends 10 shields/s into the most drained shielded ally within 3 tiles, in combat too (the only shield
  restore under fire), one patient per healer per tick, walks to drained allies in sight when idle. The Medic rule
  with a `mend` flag. The Vael AI mixes one in per six Scythes. Art from the existing model (atlas page 6).
- [x] Vael phase 2, sounds (2026-10-25): each faction names its shot sounds (`Faction::sounds`, by projectile);
  the Vael's are synthesized glass and ceramic: `lance` (Prism, Ward, Shrike), `slam` (Monolith), `blade` (Scythe).
- [x] Ether and Medium, from the third phone playtest (2026-10-25): a person's new Ether Rig or Siphon gets a crew of
  three at once (the nearest shard workers, empty-handed first, within 15 tiles; the AI balances its own), as
  players floated shards while short of ether. Medium tuned down (AI income 1.0 -> 0.9, waves grow by 2 instead of
  3). Also fixed: the AI drafted its own scout as a builder, so on some maps it never scouted.
- [x] Unit abilities, v1 (2026-10-25): one tap each on the card (self-cast or toggle, no targeting, so they work with a
  thumb): Trooper Stim (10 s of 1.5x fire and 1.25x speed for 10 hull), Vanguard Entrench (toggle: +3 range, no
  moving, 2 s to dig in or pack up; a move order packs it up first), Scythe Blink (4 tiles towards its target, 20 s),
  Monolith Overcharge (6 s of double fire, 30 s). data/abilities.rs (the table), world/abilities.rs (rules, live stat
  changes, `auto_cast`: the AI's and the duels' use: boosts and Blink only in a real fight of 3+ armed enemies,
  Entrench only for defenders). Command::Cast for a selection; card buttons grey while not ready (no countdowns).
  Balance kept: Humans win 11/23 on Easy and 7/24 on Medium against the Vael in AI-vs-AI (12 and 9 before).
- [x] Race balance from AI-vs-AI games (2026-10-24): the Vael AI won 46 of 48 games against the human AI (Easy and
  Medium, both seats, every map), in about half the time of a human mirror. In play the Scythe ran down retreating
  Troopers and shields carried small fights. Now Scythe 80+40 shields, speed 88 (slower than a Trooper; 90 tipped Medium back to 3 wins in 24), dmg 10;
  Prism 70+50, 13 ground / 13 air; Ward 200+120. Humans win about half on Easy and a third on Medium (where the
  human AI's Lancers and Wasps answer Shrikes and Prisms poorly). Massed Troopers are now the Vael's counter in
  the duel matrix. A golden pins an AI-vs-AI Vael game (`golden_hashes_pin_a_vael_ai_against_the_human_ai`).
- [x] Vael phase 2, Shields research (2026-10-24): the Loom's second research (design: replaces Armor for the
  Vael), three levels at the Weapons prices; each soaks 1 damage of every hit that lands on shields, units and
  buildings (at least 1 lands), then hull armor applies to the rest. One row in the upgrades table plus
  `Effect::Shields`. The goldens moved only because the state hash mixes a third upgrade level (checked: with it left
  out, every old hash held). Phase 2 is complete with the Halo and Vael sounds; human AI Spire targeting was
  tried and dropped (no measurable effect in AI-vs-AI games).
- [x] Sound design: synthesized layered effects (no assets), positional by camera (pan, distance), weapon and impact sounds from sim events, unit radio chirps, chimes, ambient wind
- [ ] Resizable maps (estimate, 2026-10-23; not scheduled): the 64x64 size is a compile-time constant in about 80
  places. Sim: `MW/MH/WW/WH` in data/mod.rs, the free `idx()` and fixed-size grids (rock, shade, occ, vis, explored, the
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

1. Open the project on the Mac, `npm install`, `npm run dev`, play a few games on Medium and note what feels off.
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
