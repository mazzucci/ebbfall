# Ebbfall: plan

A browser RTS inspired by StarCraft: Brood War (1998) without being it: harvest, build, raise an army, destroy the
other side's Command Core. Runs entirely in the browser; multiplayer is the headline goal after the single-player
loop feels right.

## Where it stands (late October 2026)

- Playable in the browser and offline (installable, service worker): two races, three named map characters,
  a scripted opponent for either race with four difficulties (Easy, Medium, Hard, Brutal: by how well it plays; only Brutal gathers faster), random start side.
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
- [x] Rust/WASM simulation with CI build and GitHub Pages deploy (https://ebbfall.com/)
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
- [x] Vael warp-in for units (2026-10-25, holistic review item 3): a Vael factory (not the Conflux, not Lumens) whose rally point is inside one of their power fields sends each new unit there: it warps in on the nearest open tile (a flyer on the point itself) and is inert for `UNIT_WARP` (2.5 s): no moving, firing, healing or casting, but it can be hit. Otherwise units step out beside the factory as before. A forward Spire becomes a reinforcement point; the Humans walk. Client: a violet ghost in a pulsing ring (like a warp site), "Warping in" in the console, ability buttons grey. Next: the Vael AI rallying to a forward Spire.
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
- [x] AI room in a walled main (2026-10-25): after the main pockets a quarter of AI seats fell behind their factory schedule (the pocket filled under the AI's placement rules) and banked 500-5,000 shards. Its field clearance now scales with the building (2 tiles plus half its size: 3.5 for a 3x3, was 4.5 for all), and when the main has no room it builds by its second base. Behind schedule at 8 minutes: 3 seats of 48 (was 12). A scenario pins three of the seeds.
- [x] Macro help (2026-10-25, holistic review item 12): a double-click / double-tap on a finished building selects all of ours of its type on screen (it used to select nothing); with several factories of a kind selected the card is theirs, a unit goes to the one with the shortest queue, Cancel takes the last from the longest, Rally sets them all, research goes to an idle one. A third top-bar chip (landscape and desktop) counts idle factories (finished, powered, nothing queued) and selects the next one (`,`). Not done: a x5 action (the long-press panel is not interactive; five taps or two factories do it); new HQs already send their workers to the nearest field.
- [x] Counters (2026-10-25, holistic review item 23): every fighter's long-press detail shows "Strong against" and "Weak against" with portraits (the tooltip names them on desktop), from `strong`/`weak` in constants.js, measured with the balance.rs duels; a test keeps the table to real kinds and fighters, and whatever a fighter beats lists it as a weakness. The counters name the other race mostly (a mirror match shows little).
- [x] Group pace (2026-10-25, holistic review item 15): a selection given one attack-move (`Command::GroupAttackMove`, `attackMoveGroup`) or move (formation) marches at its slowest member's speed (`Unit::pace`; flyers and walkers each by their own), healers at 90% of it so they trail the fighters; the cap holds on the move, not in a fight, and the march resumes at the pace after one (the group re-forms); any new order clears it. Medics no longer outrun Troopers into a fight. The AI still orders unit by unit.
- [x] Camera help (2026-10-25, holistic review item 13): a Home button beside SELECT on touch screens (the Home key on a keyboard); a second tap on the Army chip (or Q) within a second also looks at the army; the ATTACK chip (or Space) cycles through the last three places attacked (more than 8 tiles apart), newest first.
- [x] Concede (2026-10-25, holistic review item 22): CONCEDE on the pause card (a first tap asks "GIVE UP? TAP AGAIN" for 4 s) ends the game as a defeat through `Command::Concede` (a network command like the others; `World::conceded` for the end screen's "You conceded"). Losing still needs everything destroyed otherwise; Quit leaves without a result.
- [x] Capital units (2026-10-25, holistic review item 10): one late giant per race, `UnitDef::capital`. Humans: the **Bastion** (Airfield; 300/200, 6 supply, 450 hp armour 2, slow flyer, a splashing cannon that also hits air): crushes Vanguards, Scythes and the Sovereign, falls to Lancers, Prisms, Shrikes and massed Troopers. Vael: the **Sovereign** (Zenith; 350/200, 6 supply, 300 + 250 shields, a tripod walker with a long splashing beam, ground only): beats Troopers, Lancers and Prisms, falls to anything that flies. New 3D models (tools/render3d), counters, a toast and siren the first time the enemy's is seen ("Bastion ready" for your own). The AI raises one after 7.5 minutes and a second after 11 at its air factory, keeping the price back (only of what a unit spends: a Trooper does not wait for ether) and wanting supply earlier meanwhile; and it now keeps its money back for the building its build order wants next (it had stopped building Airfields and Zeniths, spending every shard on units). AI-vs-AI over 72 games per level: Humans 40 on Easy, 43.5 on Medium.
- [x] Subgroups from the tile strip (2026-10-25, holistic review item 14): on a phone the box is the only selection tool, so a group could not be split. In the selection panel a tap on a type tile keeps only that type and a long-press drops it; with a mouse (one tile per unit) a click keeps that unit alone and Shift+click drops it.
- [x] Guided first game (2026-10-25, holistic review item 5): FIRST GAME on the menu starts Easy on the first map as the Humans with a six-step checklist over the map (train two workers, supply, a factory, six soldiers, hold the first attack, attack the enemy base), each step one line with a portrait and the button it wants pulsing; the opponent's first wave waits until the six soldiers stand (or 6:00, with a warning 20 s before) through `World::hold_waves` (`Game::holdWaves`, a setup knob like disableAi). Kinds come from the faction, so the steps are race-neutral. A guided game is not counted in the record.
- [x] Feedback events (2026-10-25, holistic review item 18): a minimap ping (`Event::Ping`, per seat) when a building or a research finishes; a toast and a ping when a shard field crosses into its last 1,500 shards (counted over all the crystals of that field: each crystal knows its field, `Node::field`; time to expand); and from the HUD itself: the first enemy flyer seen ("get some anti-air"), a ping on a worker idle for 10 s, "No army left" when the army is wiped out.
- [x] Self-hosted fonts (2026-10-25, holistic review item 24): Chakra Petch and Share Tech Mono ship with the game (src/fonts, latin woff2, font-display: swap, OFL texts beside them), so an offline start has its typefaces and an online one asks no font service. (The review's other half, starting zoomed in on phones, goes against the standing choice to start fully zoomed out, so it is not done.)
- [x] AI that reads the player (2026-10-25, holistic review item 7): it remembers the most enemy infantry and heavy walkers it has seen at once (90 s) and answers in its mix (a splashing specialist twice as often against 8+ infantry, half as often against 4+ heavies); a wave of six or more sends its fastest third at a known second enemy base while the rest hits the goal; three walking fighters stay home at its own expansion (not its raiders, flyers or capital giants). (The decoy fix, item 7d, was #72.) AI-vs-AI over 72 games per level: Humans 38.5 on Easy, 44 on Medium.
- [x] One worker per new refinery (2026-10-25, owner's call; replaces the crew of three): a finished Ether Rig is mined by the worker that built it (other builders go back to their work); a Vael Siphon, whose planter has left, gets the nearest worker. Early on a player may want everyone else on shards; more ether workers are the player's choice.
- [x] Screen diet (2026-10-25, the owner's rule: the screen is not a dashboard, on phones or desktop; complexity is discovered on demand): the top bar keeps shards, ether, supply (fixed-width slots, so it never shifts as they grow), full screen, sound and pause. Gone from it: the brand, the clock (now in the pause card), the upgrade strip (a research building shows its progress when selected; unit figures show the bonus), every count, and the idle-worker chip (workers go back to work by themselves; the . key and a ping after 10 s idle remain). The army and idle-factory chips are bare icons, shown only while they have something to offer. No empty "Nothing selected" panel on desktop. On phones SELECT and Home together are exactly the minimap's width.
- [x] Map preview (2026-10-25, owner agreed): a small thumbnail of the chosen map beside the map buttons (rock, fields, vents and both starts; `mapPreview(seed, kind)` generates the map alone), a question mark for Random. The map's story is still told on the end screen; the menu gains no text.
- [x] Placement ghost on touch (2026-10-25, owner agreed): picking a building on a touch screen shows its ghost at once on the buildable spot nearest the middle of the view (with its power field for the Vael); a tap places it there or anywhere else, and a tap on a red spot still gives up, as before. Desktop unchanged (the ghost follows the mouse).
- [x] AI spending (2026-10-25): the Human AI lost about four in five Medium games to the Vael AI. The cause was not the units: its Ether Rig went up first and three harvesters banked ether it could not spend until the Foundry (the Vael Prism needs no tech), so its first army was smaller and lost the first fight and then its workers. Now an AI takes ether at once only if a unit in its mix spends ether without tech, else after its first factory; it starts its tech building as soon as that building's ether is banked (not only after 150 s); banked ether halves its mix ratios (more specialists); and banked shards with every factory busy add a factory beyond the schedule (Diff.extra_rax: none on Easy, 3 on Medium, 4 on Hard; never while saving up or supply-blocked). With the Human AI playing properly, part of the 2026-10-24 Vael cut came back: Scythe dmg 11 (was 10), Prism shields 60 (was 50) and dmg 14 (was 13). AI-vs-AI, 72 games per level over two seed sets: Humans win 40 on Easy and 39.5 on Medium (main: about 43 and 17).
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
- [ ] Announcer voice (holistic review item 17, owner: prototype two phrases first): `src/client/voice.js`, a formant synthesizer (a sawtooth buzz and a noise hiss through three gliding band-pass formants, phrases written as phonemes), "Base under attack" and "Research complete" in two styles: the Humans' operator on a field radio (narrow band, light clipping, squelch) and the Vael chorus (two voices a fifth apart, an echo). Hear it at `voice-lab.html` (on Pages: https://ebbfall.com/voice-lab.html) beside the device's own speech voice for comparison. Not in the game until the owner judges it.
- [x] Cloak and detection, part 1 (2026-10-25, holistic review item 4, owner agreed): the Observer is cloaked (the other side neither sees nor targets it, and it does not show on their screen or minimap) and is a detector itself; finished Turrets and powered Wards detect within 7 tiles. Rules: `UnitDef::cloaked`, `detect` on units and buildings, a per-seat detection grid built with the fog (`World::det`, derived, not hashed), `World::cloaked_from` used by `seen_by`, target finding, `can_hit` (an attack order on what you cannot see is refused), a running attack (dropped when detection ends), answering fire and what the AI sees. Client: a `hid` bit per seat in the unit snapshot; a cloaked unit (ours, or theirs where we detect it) is drawn as a faint shimmer; the Observer, Turret and Ward descriptions say so (nothing new on screen). Next: one cloak-capable raider per race (a Wasp cloak toggle on energy, a Vael Veil), and the AI answering a seen cloaked unit with a detector at its mineral line.
- [x] Difficulty by skill, not income (2026-10-25, holistic review item 6): four levels, each a row of `data/diff.rs` (the per-level special cases that were scattered through the AI are now fields: `research_from`, `expand_at`, `air_at`, `raids`, `prong`, `answers`, `abilities`, plus `supply_ahead`/`supply_at_once` for how far ahead it builds supply). Everyone gathers at x1.0 but Brutal (x1.3). Easy: 7 workers, one Garrison to start, its first wave at 4:00 (5-8 units) every 80 s after; no research, second base, air, raids, abilities or adapting. Medium: the whole script at an even pace (12 workers; 11 left the Human AI well behind the Vael AI), one attack at a time, the first at about 3:00 (5-7 units; the menu's title said 4:30, wrongly). Hard: 16 workers, three Garrisons, a bigger first wave (5-8 at about 3:15), research from 5:00, split waves. Brutal: 18 workers, four Garrisons, the first wave at about 3:00, supply built 10 ahead two at a time (so its x1.3 becomes army, not a bank of shards). Against a passive player the armies at 4/6/8/10 minutes (supply): Easy 9/21/40/54, Medium 14/44/64/84, Hard 14/48/68/98, Brutal 26/52/77/124 (main: Easy 52 and Medium 71-78 at 10 minutes). AI-vs-AI over two seed sets (72 games a level) the races stay even up to Hard (Humans win 35, 34 and 34.5 of 72 on Easy, Medium and Hard); on Brutal the Vael AI wins about 60 of 72. That is the income: the same Brutal at x1.0 is 28.5 of 72, and x1.2 is no better than x1.3, so a rich economy favours the Vael. The cause found: a Human builder stops mining while it builds (a Vael Lumen plants and goes back), so building fast costs the Humans income; with four factories to start the Brutal Human AI had 10 harvesters at 4:00 to the Vael's 16. Brutal now starts with three like Hard (Humans win 22 of 72; its army still about 130 supply at 10 minutes to Hard's 98). Follow-up: whether players feel the same builder tax when they build fast. Menu: BRUTAL beside HARD, titles saying what each level does; a seventh golden game pins Brutal.
- [x] Branching tech (2026-10-25, holistic review item 9, owner agreed): one-level techs beside Weapons/Armor/Shields (`UpgradeDef::levels`, effects `Unlock(ability)` and `Speed(unit)`). A line unit's ability is there from the first fight (Stim, Blink); a heavy unit's waits for its tech: Entrenching (Foundry, 125/125, 70 s) for the Vanguard, Overcharge Core (Loom, 150/150, 80 s) for the Monolith; and each air factory has a speed tech for its flyer (Afterburners: Wasps, Slipstream: Shrikes, +30%, 100/100, 60 s). The Airfield and the Zenith now need only the first factory (Garrison, Kiln): air is a branch of its own beside the ground tech. Card: a research building keeps fixed slots (two researches, Cancel, then its techs below; a finished tech leaves its slot empty); a locked ability's button says which tech and where. The AI researches its techs from 5:00 (sooner where its level researches sooner), only on levels whose units use abilities, never while its factories are behind the build order and never saving for one. Gating Stim and Blink too was tried and left the Human AI far behind (it leans on Stim in the first fights): Humans won 23-25 of 72 Medium games; with these choices 35, 33 and 37 of 72 on Easy, Medium and Hard.
- [x] Cloak and detection, part 2 (2026-10-25): one cloak-capable raider per race. The Wasp's Cloak and the Shrike's Veil: a tap, cloaked for 12 s (seen and targeted only where the other side detects), 40 s to come back; researched at the race's tech building (Cloaking Field at the Foundry, Veil Weave at the Loom, 150/150, 80 s) so the factory cards keep their two rows. The timed cloak rides the boost timer (no new unit state); `cloaked_from` covers it, so the client's hiding, shimmer and every targeting rule follow. The AI researches it like its other techs and cloaks a raider once engaged with something armed near. AI-vs-AI over two seed sets: Humans win 32 and 39 of 72 on Medium and Hard. Next: a cue when something of yours is hit by what you cannot see.
- [x] The AI answers cloak (2026-10-25): hit by something it cannot see, it remembers where (`Ai::cloak_hit`, set in `damage`) and raises its tower (Turret or Ward, both detectors) by that spot ahead of its build order, unless a detector of its own already stands within 6 tiles; the mark clears once one does.
- [x] Games end when they are decided (2026-10-26, playtest review items 3 and 4): a side is out once nothing of it can act (no headquarters that stands or grows, no worker, no fighter, no factory with a unit in training or the means to train one): a few Depots no longer keep a lost game going for a minute; the end card then says "Nothing left to fight with". The AI's required wave size still grows after each launch but only up to `Diff::wave_max` (12/14/16/14: Easy keeps growing a while), so a winning AI goes out to finish instead of waiting at home for its twentieth unit. AI-vs-AI over two seed sets: Humans win 33 and 39 of 72 on Medium and Hard; average game about 10 minutes.
- [x] Toast diet (2026-10-26, playtest review item 2: nothing pops up over a fight): no toast for a finished building (the minimap ping and chime say it); "destroyed" only for the headquarters, a factory or a research building (the rest is the burst); a press it cannot pay for (shards, ether) shakes the button and flashes its cost with the error sound instead of a toast (the long-press detail says what is short; "Supply blocked" stays a toast: it asks for a decision); at most two toasts (an alert is the last to go), bottom-left above SELECT (phone) or at the stage's bottom-left (desktop), never in the middle of the screen.
- [x] The end screen says what beat you (2026-10-26, playtest review item 5): the sim counts each side's units lost by what killed them (`World::lost_to`, a unit or turret kind; not hashed, like the army log; `Game::lostTo`), and the end card adds one line under the stats: "Most of your losses: to Monoliths (31) and Prisms (14)", with their portraits, and what beats the worst of them ("Wasps beat Monoliths", from the units' weak-against list). Detail on demand, on the one screen built for it.
- [x] Labels that fit and a tell for an active ability (2026-10-26, playtest review item 12): short labels for the long techs (Entrench, Afterburn, Overcharge, Cloak Field); a Stim, Overcharge, Cloak or Veil is refused while more than half of it is left (a thumb that taps twice pays once; the button shakes), and a timed ability's button is lit while any selected unit is under it (no countdown).
- [x] Shift queues five (2026-10-26, playtest review item 6, desktop half): Shift+click on a unit button, or Shift with its key, queues five, spread over the selected factories. The phone half (a long-press on an affordable unit repeats instead of showing its detail) waits for the owner: it would trade away the detail on demand.
- [x] Owner's playtest notes (2026-10-25): no "turn your phone" card (the tap that starts goes full screen, which locks landscape; a phone held upright simply plays upright); the menu is a page of its own (the whole screen, content centred) with EXIT GAME (a page can close itself only as a home-screen app; otherwise it leaves full screen and says the tab can be closed); the pause card is four equal buttons (Resume, How to play, Restart, Leave game) and Concede is gone (leaving a game in progress gives it up: a defeat on the record, as the leave dialog says); placing a building shows no ghost until the finger is down: the ghost appears under it, green or red, follows it, and the building goes where the finger lifts; lifted on red it says why and keeps placing (the Build button is its Cancel), as an armed Attack waits for its target. Replaces the placement ghost of 2026-10-25.
- [x] Replays (2026-10-26, playtest review item 15): WATCH on the end card plays the game just finished again from its first tick, both sides in view, at 4x (the bar's speed button: 1x/2x/4x/8x; DONE back to the card). Every `Game` logs its orders; `Game::start_replay` rebuilds the same setup and applies the log on its ticks (the scripted opponent replays itself), refuses orders meanwhile ("Watching a replay"), and returns false for a game with a knob outside the log (a debug setter, the guided game's hold: no WATCH after the first game). A replay shows no toasts, pings or alerts, notes no sightings and never counts on the record.
- [x] Easy that stays interesting (2026-10-26, playtest review item 17): a player who holds Easy's early waves used to walk over an AI stuck on 7 workers and one base. Easy now takes its natural after 9:00 (after Medium's 7:00: it stays the gentle level) and only then adds one factory beyond its schedule (`Diff::extras_after_expanding`: its slow bank goes to the expansion first). Against a player who holds every wave, army supply fielded 8:00-14:00 (5 seeds, Human/Vael AI): standard maps 345/365 (main 281/354, Medium 505/478), open plains 415/392 (311/371; Medium 533/482); a passive player still meets the first wave at 4:00. (A 6:00 natural with two extra factories was tried and reached Medium's army on open plains and three times it on barren maps.) With it, the Human AI keeps one spare worker for its builder (a Human builder stays at its site until the building stands, a Vael planter leaves at once; one at most, as workers are never disbanded). AI vs AI, Humans' wins of 72 on Easy/Medium/Hard/Brutal: 37/33/42/26 (main measured the same way: 36/33/39/29). Brutal's lean is not the builder tax: next, its float. Seen on the way: Medium and Hard never expand on barren maps (their home field runs dry before they bank a Core).

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
- **Name.** "Endfall" (chosen 2026-10-17) became **Ebbfall** on 2026-10-26 ("ebb": the tide going out; the world's ether tide draining away), with the domain ebbfall.com. Internal names (the `endfall-sim` crate, `window.endfall`, `ENDFALL_*` variables, storage keys, the repo) keep the old word.
