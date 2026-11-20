# Ebbfall: notes for coding agents

A browser real-time strategy game, a classic base-building RTS (one resource, gold, which the Expedition calls
energy; a population cap, the Expedition's the grid instead; two peoples), built as
a learning-and-fun project. The simulation is Rust compiled to WASM (`crates/endfall-sim`); the client is plain
JavaScript ES modules, Vite and PixiJS 8 (WebGL) over code-generated sprite sheets (pre-rendered 3D units and
buildings, painted terrain); no framework, no engine. The simulation is deterministic so that lockstep multiplayer
works without rewriting it.

**ARCHITECTURE.md** is the map of the code, how the game is built: what every file, module and test is for, and CI and
the deploy in full. **GAMEPLAY.md** is how the game plays: seats, teams, maps and spawning; water, the tide and the
Shore. Open them when you need to find your way; this file keeps the rules and the commands.

Two Notion pages hold what is not code: Ebbfall: planning (the roadmap, reviews, open questions) and Ebbfall:
developer docs ("Multiplayer design": lockstep, the relay, hosting, deploy and rollback; "Ebbfall art": the art
pipeline, frame names, seat colours). The docs microsite at /docs/ (tools/docs: how to play, the two peoples, about) and the in-game help
sheet explain it to players: no plans and no developer notes there. Agendas, handoff notes for paused work, the owner's decisions and anything to
remember for later go to Notion too (subpages of Ebbfall: planning, one per work item, the branch named), never to
local files: every session, on any machine, must be able to read them. See `README.md` for the player-facing
description. The game was called Endfall until 2026-10-26: player-facing text says Ebbfall and the repo is
github.com/mazzucci/ebbfall; internal names (`endfall-sim`, `window.endfall`, `ENDFALL_*`, storage keys, the local
folder) keep the old word.

Subagents run at high effort (Stelian, 2026-11-06: "keep at high to avoid introducing slop by trying to save tokens").

## Prerequisites (on the Mac)

- Node 22 (`.nvmrc`), npm.
- Rust via rustup (https://rustup.rs). `rust-toolchain.toml` pins the toolchain and makes rustup add the
  `wasm32-unknown-unknown` target automatically. The matching `wasm-bindgen` CLI is downloaded into `.tools/` by
  `npm run build:wasm` on first use. No Homebrew packages.
- `npm install` once after cloning (installs Vite and PixiJS).

## Commands (from the repo root)

```sh
npm run build:wasm # compile crates/endfall-sim to WASM + JS bindings in src/engine/pkg/ (dev and build run it first)
npm run dev        # Vite dev server with hot reload, http://localhost:5173 (also on the LAN for phone testing)
npm run build      # production build into dist/ (static files, deploy anywhere)
npm run preview    # serve dist/ on http://localhost:4173
npm test           # headless sim tests (node --test), no browser needed
npm run sim        # scripted 10-minute game per difficulty on the Rust sim, prints economy/army snapshots
npm run lab -- report   # the balance lab (crates/endfall-lab/README.md): a fixed batch of AI-vs-AI games natively,
                        # win rates with 95% intervals, target checks (PASS/WARN), key figures; JSON in target/lab/
npm run lab -- compare A.json B.json   # two reports cell by cell: what moved, and whether more than the noise
npm run lab -- report --sizes 64 --maps Shore --shore-field channel   # the Shore with the basins' field exposed
                        # (channel-far: farther out; each people's income and losses at fields in the Shore section)
npm run lab -- sheet    # the formula sheet: every unit's numbers, DPS, cost-weighted efficiency, time to kill
npm run lab -- plans    # games with random AI plans (workers, first wave, expansion; a placebo and a planted coin):
                        # a logistic model of what wins, win rates by setting; --plant runs the planted control;
                        # --first-max 12:00 draws first waves up to 12:00; each first wave's value and result by bin;
                        # --tide (report too): the same batch with the tide on
                        # (--maps Shore: the Shore map's section: each people from each half, waves, routes, its gate)
npm run lab -- turtle   # a Medium seat that never attacks (no waves, no raids; --raids keeps its raids) against
                        # Medium (the tide's turtle row, its baseline)
cargo test         # Rust sim unit + gameplay tests (crates/endfall-sim/tests/gameplay/) + golden hashes, native, no WASM needed
cargo test --release --test gameplay   # the same gameplay suite with 4x more random-play seeds
npm run test:e2e   # end-to-end gameplay through the real UI in headless Chromium (needs npm run build first and
                   # a browser: npx playwright-core install chromium); ENDFALL_ENGINE=webkit or firefox runs the
                   # cross-engine subset there (`engines: true`; WebKit skips the
                   # menu's focus test); ENDFALL_ALL=1 runs all but the Chromium-only ones. Firefox has WebGL on Linux
                   # only with a display: it runs headed whenever DISPLAY is set (so on a desktop it takes your screen,
                   # full screen too); use xvfb-run -a npm run test:e2e, as CI does. ENDFALL_SHARD=i/n runs the i-th
                   # of n shards balanced by measured time (test/e2e/times.json: longest first into the least-loaded
                   # shard, a test not in it weighs the median; a file run alone runs its tests of that shard; CI splits
                   # Chromium over ten jobs); `d.skipUntil` fast-forwards
                   # in the page until a condition holds (prefer it to `until` for a plain wait)
node tools/e2e-times.mjs <run id>... # refresh test/e2e/times.json from green ci.yml runs' e2e logs (each test's median); plan [n]: the shards
node tools/devices/smoke.mjs # the device smoke (tools/devices/README.md): local Playwright, the iOS Simulator, an
                             # Android emulator or BrowserStack's real devices
node tools/art/generate.mjs  # regenerate public/art/ after changing tools/art or tools/render3d (output is committed;
                             # the 3D part needs a Chromium, see Notion: Ebbfall art)
node tools/icons.mjs         # regenerate public/icon-*.png (the app icons) after changing public/icon.svg (a Chromium too)
node tools/docs/crops.mjs    # regenerate the docs' sprite crops (public/docs/img/sprites/) after the art changes (a Chromium;
                             # output is committed; test/docs.test.js fails while they are stale)
node tools/docs/shots.mjs    # regenerate the docs' screenshots and gameplay clip from the built game (npm run build first; a
                             # Chromium, slow: minutes; output is committed); names run some: battles heroes controls clip
node tools/menu-clip.mjs     # regenerate public/menu/clip-*.webp (the poster of the clip on the menu's first page: the game's own
                             # copies of the docs') after the docs' clip changes (a Chromium; output is committed; shots.mjs's
                             # clip step runs it itself; test/menu-clip.test.js fails while they are stale)
node tools/og.mjs            # regenerate public/og.png (the link preview's image) after changing the icon, the art or its
                             # wording (a Chromium too; output is committed, kept under 300 KB)
```

CI (`.github/workflows/ci.yml`) runs on every pull request: rustfmt, clippy and `cargo test` (`rust`); the WASM build,
`npm test` and `npm run build` (`build`); the browser tests in Chromium over ten `e2e` jobs split by measured time, summed up by `e2e: all`;
the cross-engine subset (`engines`, WebKit and Firefox) and the golden games on an ARM Mac (`arm`), both read by hand.
The ruleset requires build, rust and `e2e: all` (red unless the build and every shard passed). On `main`, `relay` then `deploy` publish https://ebbfall.com/
(a Cloudflare Worker, site/); the site never outruns the relay's protocol. The full description (the relay's build
check, the deploy's guards, the Devices workflow): ARCHITECTURE.md, "CI and the deploy".

A change to the simulation must keep `cargo test` and `npm test` green, in particular the determinism tests (same seed
and commands produce the same `stateHash()`), and every rule change needs a scenario in the gameplay tests.

## Rules that keep the sim multiplayer-ready

- The sim never touches the DOM, the clock or an unseeded RNG. Randomness comes from the world's seeded
  `Mulberry32`. Order of RNG draws is part of the rules.
- Game rules use f64 with JS semantics, not fixed-point: WASM float arithmetic is deterministic on every browser
  and CPU, and libm is the same code natively and in WASM, so every player running the same .wasm agrees. Use
  `jsmath` helpers (round, sign, to_i32, hypot) rather than their Rust lookalikes, which differ at the edges.
- The sim advances only through `step()` at the fixed 30 Hz tick. Never pass a variable dt.
- Anything the player should see or hear that is not world state (sounds, toasts, explosions) is an event:
  `emit({t:'sfx'|'toast'|'burst'|'hit'|'fire', ...})`. The client drains `G.events` each frame in `main.js`.
- Player intent enters the sim only through the orders on `Game` (move, attack, gather, build, place, queue,
  cancel, rally, formation), each a `Command` applied for a seat by `World::apply` (logged and replayable). They take ids and plain numbers/strings: these are the future network commands.
  The client calls them through src/engine/core.js, which accepts entity objects and passes their ids.
- Iteration order matters for determinism: iterate arrays, not `Set`/`Map` built from object identity, and sort
  with total orderings (tie-break on `id`).
- In Rust the world is a value (`World`), so several games per page, snapshots and rollback are possible. The
  client still sees one game through the `G` mirror in src/engine/core.js.

## Conventions

The gameplay these rules protect (how seats sit round a map, teams, the AI seats and their styles, map sizes and
starts, spawning, builders, water and the tide) is described in GAMEPLAY.md. The rules:

- Seats: a World has N seats (`World::seats()`), and every per-seat thing is a `Vec` indexed by seat (`factions`,
  `res`, `vis`, `stats`, `upgrades`, ...; `team` on an entity is its seat). Rules never single out a seat: fog,
  alerts, toasts, sounds and stats are per seat, events carry the seat they are for, and `is_ai(team)` is the only
  difference a seat's player makes. `PLAYER = 0`, `ENEMY = 1` are only the menu's defaults.
- Teams: `enemies(a, b)` / `allies` decide who fights, never "the other seat" (`1 - team`). A seat that is out gives
  no orders (`World::apply` refuses them). Teams enter the state hash only when not each seat its own.
- AI numbers: every AI decision reads its numbers through `World::tuning`. An AI seat's plan may come from the game
  link, and deltas and intents to it from an embedding page over postMessage (claude/PROTOCOL.md: allowed origins
  only, every message validated), in single-player games only (`Game::setPlan`, `Game::planDelta`): validated and
  clamped in Rust, refused in lockstep, never sent over the network, and recorded in replays with their ticks.
  `World::set_ai_styles` and the lab's own plan inputs (`World::set_ai_plans`) stay lab-only and are not hashed.
- Two-start habits the goldens pin stay on two-start maps only; anything new for maps of more starts is gated on
  `map.bases.len() > 2`, and AI rules for several enemies on more than one enemy still in.
- Positions are in world pixels (`TILE = 32`); `tx, ty` are tile coordinates; ranges and sight are in tiles.
- Walkability: every walkability check for a unit takes its `Foot` (`World::foot(kind)`, `Map::passable`,
  `nearest_passable`, `astar`, `los`); `blocked` and `nearest_free` stay class-free. Placement for the player and the
  AI goes through the same `can_place`. The tide enters the hash only when on, and on a map without water all of it
  is inert (the goldens pin that).
- Map size: the map's size is the map's (`Map::w`, `h`): index grids with `map.idx(x, y)` and `map.in_map`, never a
  constant width. The client's `MW`/`MH`/`WW`/`WH` (src/engine/core.js) are the current game's: read them where they
  are used, and size anything per-tile when a game starts (`renderTerrain`), never at module load.
- Costs are `[gold, 0]`: one resource; the second slot, once a second resource, is always 0.
- Keep files small and single-purpose; dense one-liners are acceptable in hot loops but not in rules code.
- Commit messages: imperative, one line, what and why. Do not commit `dist/`, `node_modules/`, `target/`, `.tools/`
  or `src/engine/pkg/`.
- Rust sim: f64 rules through `jsmath` helpers, no `HashMap`/`HashSet` iteration, validate ids/teams coming from JS
  (a panic poisons the `Game`), `wasm-bindgen` stays pinned with `=`.

## Tests that guard gameplay

- `crates/endfall-sim/tests/golden.rs`: whole games pinned to literal state hashes (native, and two of them in WASM in
  `test/engine.test.js`). Refactors must leave them unchanged; a rule change updates the table on purpose.
- `crates/endfall-sim/tests/gameplay/` (one test binary: `common/` helpers, then `orders`, `construction`, `economy`,
  `combat`, `ai`, `maps`, `seats`, `paths`, `water`, `shore`, `tide`, `random_play`, ...): the rules scenario by scenario
  (what each file covers: ARCHITECTURE.md, "Tests that guard gameplay"), and `random_play_never_breaks_the_world`:
  random orders (including stale and nonsense ids) through the same `Game` API the browser uses, across many seeds,
  checking world invariants after every tick. Add a scenario here for every rule you add or change.
- `test/e2e/gameplay.e2e.mjs`: the same journeys through the real UI (click/tap units and buildings, hotkeys, command
  card buttons) on desktop and a landscape phone. The debug handle may only be used to read state, fast-forward
  (`endfall.skip`), grant resources and set up a scene (`engine.debugSpawn`, `engine.debugSetHp`, `engine.debugResearch`, `engine.debugSetGold`); the actions under
  test must go through the UI. Add a scenario for every new UI flow.

## Testing a change by hand

`npm run dev`, open the URL, Medium difficulty. `window.endfall` in the console exposes `G`, `ui`, the camera and
`setResources` for poking at a running game (scripted playtests use it too), and `status()` (the audio context's
state, mute, full screen and whether the page may go full screen at all (`fullscreenEnabled`, the browser's word: false
on iPhone Safari; branch on it, not on the button), the page's errors since it opened; the device checks read it). A sanity run: select Villagers, `B` then `W`, place a Cottage near the
Castle, train Guards from a Barracks (`B` then `C`; `K` trains), `A`-move into the enemy base on the far side of the map. On a phone on the same
network, open the LAN URL Vite prints (touch controls: tap/drag to select, tap to command, two fingers to pan).
