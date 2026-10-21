# Endfall: plan

A browser RTS inspired by StarCraft: Brood War (1998) without being it: harvest, build, raise an army, destroy the
other side's Command Core. Runs entirely in the browser; multiplayer is the headline goal after the single-player
loop feels right.

## Where it stands (October 2026)

- Playable prototype: one faction, one procedurally shaped 64x64 map, one scripted opponent with three difficulties.
- Economy: shards (finite fields) and ether (vents that need an Extractor); supply from Core and Depots.
- Six structures (Core, Depot, Extractor, Barracks, War Forge, Sentinel Turret), three units (Harvester, Trooper,
  Vanguard), fog of war, control groups, rally points, attack-move, hold.
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
- [ ] Second faction or at least a fourth and fifth unit (an air unit, a caster) so there are real counters
- [ ] Upgrades (weapon/armor tiers) researched at the Forge
- [ ] Better AI: scouting, reacting to the player's composition, harassment, expansions
- [ ] Hand-authored maps + a tiny map format (JSON); keep the generator for skirmish
- [ ] Sprite art pass (currently vector shapes) and sound design
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
