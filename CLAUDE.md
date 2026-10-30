# Ebbfall: notes for coding agents

A browser real-time strategy game in the 1998 StarCraft mold, built as a learning-and-fun project. The simulation is
Rust compiled to WASM (`crates/endfall-sim`); the client is plain JavaScript ES modules, Vite and PixiJS 8 (WebGL)
over code-generated sprite sheets (pre-rendered 3D units and buildings, painted terrain); no framework, no engine. The simulation is deterministic so that lockstep multiplayer can be added without
rewriting it. See `docs/PLAN.md` for the roadmap and open questions
and `README.md` for the player-facing description. The game was called Endfall until 2026-10-26: player-facing text
says Ebbfall and the repo is github.com/mazzucci/ebbfall; internal names (`endfall-sim`, `window.endfall`, `ENDFALL_*`,
storage keys, the local folder) keep the old word.

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
cargo test         # Rust sim unit + gameplay tests (crates/endfall-sim/tests/gameplay/) + golden hashes, native, no WASM needed
cargo test --release --test gameplay   # the same gameplay suite with 4x more random-play seeds
npm run test:e2e   # end-to-end gameplay through the real UI in headless Chromium (needs npm run build first and
                   # a browser: npx playwright-core install chromium); ENDFALL_ENGINE=webkit or firefox runs the
                   # cross-engine subset there (`engines: true`; WebKit skips the
                   # menu's focus test); ENDFALL_ALL=1 runs all but the Chromium-only ones. Firefox has WebGL on Linux
                   # only with a display: it runs headed whenever DISPLAY is set (so on a desktop it takes your screen,
                   # full screen too); use xvfb-run -a npm run test:e2e, as CI does
node tools/devices/smoke.mjs # the device smoke (tools/devices/README.md): local Playwright, the iOS Simulator, an
                             # Android emulator or BrowserStack's real devices
node tools/art/generate.mjs  # regenerate public/art/ after changing tools/art or tools/render3d (output is committed;
                             # the 3D part needs a Chromium, see docs/ART.md)
node tools/icons.mjs         # regenerate public/icon-*.png (the app icons) after changing public/icon.svg (a Chromium too)
```

CI (`.github/workflows/ci.yml`) runs rustfmt, clippy, `cargo test`, the WASM build, `npm test`, `npm run build` and the
browser tests (all in Chromium, the cross-engine subset in WebKit and Firefox) on every pull request, and publishes
`main` to https://ebbfall.com/, a Cloudflare Worker with static assets (site/; GitHub Pages until 2026-10-30;
docs/MULTIPLAYER.md, Hosting: the deploy, analytics, the rollback). On `main` the relay goes first (the `relay` job,
then `deploy`): it is deployed when the live relay is not this commit's, by what is live rather than by what the push changed (a cancelled
run must not leave a relay change undeployed): the job hashes the bundle wrangler would upload (`deploy --dry-run`,
wrangler pinned) with wrangler.toml, reads the live build from `GET https://relay.ebbfall.com/version`
(`{proto, build}`, relay/version.js), and deploys with `--var RELAY_BUILD:<hash>` when they differ, when there is no
/version, or on a run started by hand; then waits for /version to say the new build. The `deploy` job (the site)
publishes only when the live relay's `proto` is relay/room.js's PROTO (src/net/net.js's, which a test keeps equal), so
the site never outruns the relay. The **Devices** workflow (`devices.yml`, by hand and weekly) checks an
iPad, an iPhone and a Pixel (docs/MULTIPLAYER.md, "Browsers and devices").

A change to the simulation must keep `cargo test` and `npm test` green, in particular the determinism tests (same seed
and commands produce the same `stateHash()`), and every rule change needs a scenario in the gameplay tests.

## Layout

```
voice-lab.html        a page apart from the game for judging the announcer's voices (a second Vite entry;
                      src/client/voice-lab.js): each race's synth styles A, B, C and the device's voice D, one tap a phrase
selftest.html         the device check (a third entry): plays the golden games, says whether this device computes them
                      exactly (online play needs it); open it on a phone to check that phone
?bench                the device test (src/client/bench.js, in the game's own page): an 8-AI 128x128 game from 3:00, a
                      minute measured through main.js's loop (`probe`), the report POSTed to the relay for a PERF-XXXXXX code
index.html            page shell: top bar, canvas stage, HUD (minimap, selection panel, command card), overlays
src/boot.js           entry: the menu first (menu.js, online.js's lobby, the sound and full screen (corner.js) wired at once,
                      no renderer in its graph), then loads the game (main.js) behind it; a start waits, its button LOADING…
                      (RELOAD if the game could not load; READY likewise, online.js); the service worker's registration
src/main.js           the game (boot.js loads it): wires the sim (via src/engine) to the client, fixed-step loop, start/end
                      screens, events; awaits the WASM (`engine.ready`) and, through gl/render.js, the art
src/style.css         all styling; design tokens at the top of :root
src/engine/           the client's view of the Rust sim: index.js starts instantiating the WASM (`ready`: nothing calls
                      the sim before it has resolved), core.js mirrors it into the
                      G / map / entity-object shape the client reads and turns orders into calls by id.
                      constants.js reads the sim's tables (pkg/data.js, generated by build:wasm) and adds hotkeys
                      and descriptions;
                      util.js small helpers; golden.js the golden games' table and runner (Node test, browsers in CI,
                      selftest.html). pkg/ is generated by build:wasm and not committed
crates/endfall-sim/   THE GAME. Rust, no I/O, no clock, no HashMap iteration. Builds natively for cargo test.
  src/data/           the only source of game numbers: mod.rs (constants, kinds declared once by `kinds!`, the shape
                      of definitions and factions), humans.rs and vael.rs (each race's units, buildings and faction),
                      upgrades.rs, diff.rs (AI tuning per difficulty), export.rs (the tables as JSON, one small writer)
  src/jsmath.rs       JS-exact helpers: Math.round, Math.sign, ToInt32, V8's Math.hypot; libm for trig
  src/map.rs          the map's size (`MapSize`), terrain generation (2, 4 or 8 starts, one start's share and its
                      symmetric images: `max_starts`, `seat_starts`, `team_starts`), nodes, occupancy grid, nearest_free
  src/path.rs         A* + line-of-sight smoothing (f32 cost grid, fixed heap tie-breaks, a look-ahead window)
  src/world/          the world: mod.rs (World, step, state_hash), types (entities, events), seats.rs (seats, teams,
                      starts, who is out, the last team standing), orders, spawn, economy, construction,
                      wire.rs (commands as numbers for the network: encode, a total decode),
                      combat, movement, paths.rs (a group's one route shared by the units of one order, long
                      searches budgeted per seat per tick), fog
  src/ai/             scripted opponent: mod.rs (its turn every 16 ticks, each brain on a tick of its own, phase by phase),
                      economy, build, research, produce, army, scouting
  src/lib.rs          the wasm-bindgen surface: Game (orders, queries, flat snapshot arrays, events)
  src/lockstep.rs     a networked Game: orders out to the relay, everyone's back on their tick (docs/MULTIPLAYER.md)
  src/snapshot.rs     the snapshot records, each declared once (writer + field names the client reads by name)
src/client/           everything that touches the browser
  gl/render.js        PixiJS renderer: camera + zoom, dual-grid terrain, sprites, effects, lights, fog, minimap; the
                      HUD's portraits cut from the atlas (`portrait`)
  screen.js           full screen / landscape lock where the page's full screen works (`pageFullscreenWorks`: not on
                      iPad or iPhone); START, FIRST GAME, REMATCH and READY go full screen on a touch screen only (with a
                      mouse, a desktop has room enough: only the button goes in; BACK TO GAME restores it either way); the
                      player's choice to leave it, the page held still in a browser tab, the leave-game guard
  corner.js           sound and full screen always in reach: the top bar's pair in a game, the screen's corner (#corner)
                      over every menu page, the lobby and every card (the pause card: full screen only, as it pauses the
                      sound); one sound setting; on iPad/iPhone the full-screen button opens the Add to Home Screen card
                      (#homeTip)
  store.js            what this device remembers (localStorage, endfall.*; endfall.controls: the keyboard scheme); the
                      player's name, one key (endfall.name) and one sanitiser (`cleanName`: trimmed, 16 at most, as the
                      relay takes it) behind `playerName` get/set, shared by the lobby's NAME and OPTIONS' (test/store.test.js)
  controls.js         the desktop keyboard scheme: CLASSIC (letters; arrows, edge, minimap, middle drag) or WASD (W A S D
                      always pan; a command's key is its card slot's, GRID: E R T / F G H / C V B by key position),
                      `keyed`; shown where `(pointer: fine)`
  options.js          the OPTIONS card: a list of settings drawn by one helper, chips or a text field: NAME (every device,
                      the lobby's name, store.js `playerName`, kept on change or blur, empty allowed) and CONTROLS (where
                      `(pointer: fine)`); its button shown where any applies, so everywhere; opened from the menu's first
                      page and the pause card; opening it focuses a lit chip or BACK, never the field (no phone keyboard)
  scenery.js          deterministic scatter of scenery props (doodads) from the map seed; visual only
  menu.js             start menu: a first page (SINGLE PLAYER, MULTIPLAYER, How to play, About, the record; FIRST GAME
                      until a first game is over), the single-player page (the board: eight fixed spots, you and one to
                      seven AIs, a token per seat whose sheet sets its race, RANDOM too, an AI's level, and its side;
                      + AI in the lowest empty spot; the map list, any map that seats them, with a preview, FIRST GAME),
                      the About page (the source, the device check, the version); the map list and preview the lobby
                      shares
  seats.js            the board's eight fixed spots (a seat keeps its spot, and its spot's colour in the game, whatever
                      its side; adding fills the lowest empty spot, removing empties one: nothing moves): a spot per
                      entry (`{ race, team, diff }`, null when empty, you in spot 0) and how they become the game's
                      seats (`arrange` puts each side's seats side by side, your side first; `startSetup`, with
                      `spots`, each seat's spot), pure (test/seats.test.js: `arrange`, `startSetup`, `enemyLevel`,
                      `newAi`, `canRemove`, `sideChoices`, ...); and the board's DOM pieces, the lobby's too, built from
                      a seat's view: `tokenEl` (colour band, name, race, level pips, its side's tag; a host's crown, a
                      ready check, AWAY, an open seat's SIT HERE), `emptySpot` (+ AI, + SEAT, or a faint outline),
                      `chipRow` (a radio group), `seatSheet` (RACE, LEVEL, SIDE; footer buttons), `sheetDialog` (a
                      modal <dialog>)
  maps.js             the maps the menus offer, every one whatever the players (a map seats as many as its starts: 2
                      on 64x64, 4 on 96x96, 8 on 128x128; the chosen map decides the size; `fits`, `fitMap`: the
                      smallest that seats them when they outgrow it), named fixed maps and a random one per size, a
                      map's label ("Iron Compass · up to 8"), the map an online setup plays, the team splits a saved
                      setup of the menu before the board names; pure (test/maps.test.js; the relay imports it too)
  ui.js               client UI state (ui.sel, ui.mode, ui.place), the armed-order table, hint, toasts, setSelection
  hud.js              top bar and selection panel
  cards.js            what the command card holds for a selection: its buttons by slot and their keys (pure: read by
                      test/cards.test.js)
  card.js             the command card's buttons (cards.js holds them), long-press details, what a button does
  tools.js            player helpers: select idle workers / army / same type, control groups, alerts
  bench.js            the device test (?bench): the card, its game, the per-frame timings, the report and its code
  pause.js            the pause card: alone it pauses, in a replay BACK TO REPLAY / DONE, online a menu over a game that
                      goes on, with a pause for everyone (the relay's) and its state on every side; full screen out/in
  icons.js            line icons (inline SVG; no imports: the menu draws them before the game has loaded)
  look.js             per-kind presentation the sim does not know: building art parts, unit voices, the seat colours
                      and the spot each game seat plays in (`setSpots`, `colorOf`: a player keeps its board spot's colour)
  input.js            mouse / touch / keyboard / minimap handling -> selection changes and sim commands
  audio.js            Web Audio synthesized sfx; the context opens only in a gesture WebKit counts (a touch's end, a click,
                      a key) and nothing plays until it runs; `holdSound`: the pause card suspends it
  voice.js            the formant-synthesized announcer (audio.js `say`: under attack, research complete, not enough
                      shards/ether, in each race's voice): STYLES, three a race, and each race's device style
  speech.js           the announcer in the device's own voice (Web Speech API): a voice per race picked from the device's
                      English voices, the synth where it has none; unlocked in a gesture, cut by the pause card and mute.
                      The announcer is OFF in the game (audio.js `audio.announcer = null`, 2026-10-28) until the owner
                      finds a voice they like in voice-lab.html; 'device' or 'synth' turns it back on
  fx.js               particles and markers (client-only, fed by sim events)
  scout.js            what this side has seen of the enemy's army (the pause card's and end card's scouting lines)
  offline.js          INSTALL (the browser's prompt where it offers one, else the Home Screen card on iPad/iPhone) on the
                      first page, About and the pause card; PLAY OFFLINE (the first page once installed or where nothing
                      installs, and About) asks the service worker and says so until everything is saved
  online.js           Multiplayer: the lobby (open/join a room by code or link, a line on how; the room is single
                      player's board of eight spots: people, AIs and open seats as tokens, your race in your token's
                      sheet, READY a lit toggle; the host's sheets put anyone on any side, set an AI's race and level,
                      share or fill or remove an open seat; + AI / + SEAT in the lowest empty spot; the map list; a
                      guest's board read-only, SIT HERE; a name first, NEW ROOM and JOIN dimmed
                      without one; in a room the address is ?room=CODE, the link a reload or a friend opens) and the glue between
                      src/net and the game (relay URL: ?relay=, VITE_RELAY_URL, or the dev host's port 8788; a build
                      with VITE_RELAY_URL shows MULTIPLAYER in the HTML itself, vite.config.js)
src/net/net.js        the network client (docs/MULTIPLAYER.md): hello/rejoin, lobby messages (seats by spot), its game seat
                      from `start`, sends this side's orders,
                      feeds the relay's turns to the lockstep Game, acks with checkpoint hashes, reconnects; no DOM
test/engine.test.js   the WASM sim through src/engine in Node: presentation of every kind, RNG/hypot, golden hashes, gameplay
test/scenery.test.js  the scenery scatter on real maps: deterministic, props where they belong, sprites in the atlas
test/art.test.js      the atlas against the game: every unit, building and turret frame has its team mask, a tint per seat
test/audio.test.js    the sound engine on a stub Web Audio API: every recipe plays, every sound the sim names exists
test/e2e/             browser tests: harness.mjs (serves dist/, drives mouse/keys/touch; its `test` takes `engines: true`
                      for the cross-engine subset and `chromium: 'why'` for Chromium-only), gameplay.e2e.mjs (scenarios),
                      touch.e2e.mjs (phone gestures: one-finger pan and glide, SELECT box, minimap nudge),
                      online.e2e.mjs (two browsers through a local relay: room, join link, lockstep, leaving concedes,
                      the pause card's menu and a pause for everyone, the board (AIs, levels, sides, nothing moving, a
                      guest's view, an open seat's SHARE LINK), two people against two AIs, six with AI seats in their
                      spots' colours, eight seats on phones),
                      bench.e2e.mjs (?bench: a short run measured, its report sent through a local relay, read back by code;
                      no keys while it measures, a swapped game stops it, a relay that does not answer),
                      corner.e2e.mjs (sound and full screen on every screen and card, clear of their content; iPad and
                      iPhone: no page full screen, the Home Screen card; the player's choice to leave full screen wins),
                      window.e2e.mjs (an iPad's and a phone's browser tab with its bars: the menus, the HUD and the cards
                      fit, no page scroll, the map fills the room and fits again when the bars collapse),
                      selftest.e2e.mjs (the golden games in the engine under test), offline.e2e.mjs (INSTALL,
                      PLAY OFFLINE against the real service worker, the app icons), voice.e2e.mjs (the voice lab
                      loads and plays; every synth style rendered offline and measured: peak, loudness, length, no
                      rumble; ENDFALL_VOICE_OUT=dir writes WAVs to listen to)
test/offline.test.js  the service worker (tools/offline/sw.js) on a fake Cache Storage: PLAY OFFLINE's answer, a resumed
                      install, Cloudflare's analytics beacon left to the network; the manifest's app icons
test/net.test.js      two Net clients with WASM Games through the Node relay: same world every tick through a dropped socket,
                      a suspended page, a wake during a pending reconnect, orders given while offline; rooms of three,
                      four (two AIs at different levels) and eight with AI seats; a guest at spot 1 who plays game
                      seat 2 (the start arranges the sides)
test/cards.test.js    every card of both races (units, buildings, Build pages, armed orders, placing) on the WASM sim:
                      a WASD key per button by slot, none twice on a card, never W A S D, Q or P
test/seats.test.js    the board's rules: spots to seats, team ids and each seat's spot, a new AI's spot and side, the
                      sides a sheet offers, a saved board checked (and one from before the spots)
test/relay-bench.test.js the Node relay's HTTP side for the device test's reports (POST/GET, chunked oversize, limits);
                      the Worker's (codes, ORIGINS, limits per address and in all, expiry) are in relay-worker.test.js
test/site-worker.test.js the site's Worker (site/worker.js) on a fake ASSETS binding: the page for every link, headers,
                      what is not a file, www and http, the beacon only with a token, _headers, wrangler.toml; with dist/
                      built, every file the service worker stores
test/site-dns.test.js site/dns.mjs on a fake Cloudflare API: GitHub Pages' records of the apex and www picked out (never
                      relay.ebbfall.com or others), the summary, proxy/unproxy (one batch of PATCHes of `proxied`, nothing
                      the second time), a leftover custom domain dropped, a restore past a failure
test/store.test.js    the player's name: `cleanName` (and that the relay names a hello the same), `playerName`'s one key
test/maps.test.js     the menus' maps (src/client/maps.js): the players each map seats, maps that fit (the smallest that
                      does when they outgrow one), labels, an online setup's map at its own size, the team splits
relay/                the multiplayer relay (docs/MULTIPLAYER.md): room.js, the rules as a pure state machine (seats on
                      the board's fixed spots (a seat keeps its spot in the lobby), AI seats and their levels, the
                      game's seats arranged by side only at the start (`setup.spots`), the room's map checked against
                      its seats (it imports src/client/maps.js), lobby, the turn clock, the log, away and back,
                      desync checks); server.mjs, a Node WebSocket server
                      for local play and the tests (`node relay/server.mjs`); worker.js, the same rules on Cloudflare (a
                      Worker and one Durable Object per room; wrangler.toml; CI deploys it when the live one is not
                      this commit's build); bench.js, the device test's reports over HTTP (POST /bench, GET
                      /bench/<CODE>), in both; version.js, GET /version (`{proto, build}`, what CI reads), in both
site/                 the site, https://ebbfall.com/ (docs/MULTIPLAYER.md, Hosting): dist/ as a Worker's static assets
                      (wrangler.toml: ebbfall.com/* and www as zone routes, exact paths as on GitHub Pages, the Worker
                      first only for / and /index.html); worker.js (the game's page, the place for link previews and the
                      optional analytics beacon; www and http to https://ebbfall.com/; a page load that is not a file goes
                      to /, a missing file is a 404), cache.js (assets/ immutable; the pages, sw.js and the manifest
                      no-cache), build.mjs (wrangler's build step: dist/_headers from cache.js), dns.mjs (the two
                      hostnames' records: logged before a deploy, GitHub Pages' own proxied after it so the routes see
                      the traffic, DNS-only again for a rollback); CI's deploy job
tools/chromium.mjs    headless Chromium launcher with software WebGL, shared by the art generator and the e2e tests
tools/engines.mjs     the e2e tests' engine (ENDFALL_ENGINE: chromium, webkit, firefox) and its device profiles
tools/devices/        the device smoke (Devices workflow): devices.mjs (the iPad, iPhone, Pixel per backend), drivers.mjs
                      (BrowserStack, iOS Simulator through Appium, Android emulator, local Playwright, any WebDriver),
                      webdriver.mjs (a fetch-only W3C client), smoke.mjs (the steps, screenshots, summary.json); README.md
tools/offline/        the Vite plugin that writes dist/sw.js (plugin.mjs) from the service worker's template (sw.js)
tools/icons.mjs       public/icon-*.png (the install prompt's PNG icons) from public/icon.svg; output committed
scripts/headless.js   scripted bot-vs-AI run for balance checks
scripts/build-wasm.mjs cargo build for wasm32 + wasm-bindgen into src/engine/pkg/
tools/render3d/       3D models (models.js, buildings.js, vael.js for the second race), materials, camera/lights and the
                      sprite finish, run in headless Chromium (three.js)
tools/art/            generator driver, terrain and effect painters, packer, PNG encoder; see docs/ART.md
public/art/           generated atlas.json index + atlas-<n>.png/json pages (PixiJS spritesheets, scale 2), committed
docs/ART.md           art style guide, palette, frame names
docs/PLAN.md          roadmap, architecture decisions, open questions (mirrored in Notion)
```

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

- Seats and teams: a World has N seats (`World::seats()`, 2 to `MAX_SEATS`, at most the map's starts: 2 on 64x64, 4 on
  96x96, 8 on 128x128, `map::max_starts`, all of them generated whatever the seats; seats sit round the map in order, `map::seat_starts`: allies in consecutive
  seats are neighbours, which is how the menus' teams are made, and with teams `Game::with_seats` turns the seats by
  whole starts only and the free starts go between teams, `map::team_starts`, so any split of consecutive seats starts
  side by side; each AI seat may have its own difficulty, `World::diff_of`, `Game.withSeats`' optional `diffs`),
  and every per-seat thing is a `Vec` indexed by seat (`factions`, `res`, `vis`, `stats`, `upgrades`, ...; `team` on
  an entity is its seat). Each seat is on a team (`World::teams`, each its own by default): `enemies(a, b)` / `allies`
  decide who fights, never "the other seat" (`1 - team`). The game is over when the seats still in (`out`) are all one
  team, and `winner` is that team; a concede knocks out its seat only. A seat that is out gives no orders
  (`World::apply` refuses them) and, while the game goes on, what it leaves is inert (`World::inert`: stopped, then left
  out of the tick; it can still be destroyed). Teams enter the state hash only when not each seat its own. `PLAYER = 0`, `ENEMY = 1` are only the
  menu's defaults. Rules never single out a seat: fog, alerts, toasts, sounds and stats are per seat (fog is
  shared with allies: `update_fog` ORs a team's layers), events carry the seat they are for (`Game::drain_events` passes on its own seat's; `seen` is a bit per seat),
  the scripted opponent plays whichever seats `World::ai_seats` marks (one brain per seat, `World::seat()` inside its
  turn; it fights every enemy and plans against `foe()`, the nearest enemy start still in, ties to its partner: seats
  0 and 1, 2 and 3, ...), and `is_ai(team)` is the
  only difference a seat's player makes (AI income, building in
  unexplored ground, losing as soon as its buildings are gone; a person's new refinery gets one worker (its builder; for the Vael, whose planter has left, the nearest), the AI
  balances its own).
- Two-seat habits the goldens pin stay on two-start maps only: seat 0 facing east and stepping out south (with
  `map.bases.len() > 2` units face and step out towards the map's centre), and the AI's rules for several enemies (a
  wave called home to a raid by another) apply only with more than one enemy still in.
- Positions are in world pixels (`TILE = 32`); `tx, ty` are tile coordinates; ranges and sight are in tiles.
- The map's size is the map's (`Map::w`, `h`, in tiles; the menus offer 64x64, `MapSize::DUEL`, with two starts, 96x96
  with four and 128x128 with eight, each size with maps of its own, any of them for as many players as its starts
  (src/client/maps.js); a map is always generated with all its starts, the free ones free ground): index
  grids with `map.idx(x, y)` and `map.in_map`, never a constant width. The
  client's `MW`/`MH`/`WW`/`WH` (src/engine/core.js) are the current game's, set when it starts: read them where they
  are used, and size anything per-tile when a game starts (`renderTerrain`), never at module load.
- Costs are `[shards, ether]`.
- Keep files small and single-purpose; dense one-liners are acceptable in hot loops but not in rules code.
- Commit messages: imperative, one line, what and why. Do not commit `dist/`, `node_modules/`, `target/`, `.tools/`
  or `src/engine/pkg/`.
- Rust sim: f64 rules through `jsmath` helpers, no `HashMap`/`HashSet` iteration, validate ids/teams coming from JS
  (a panic poisons the `Game`), `wasm-bindgen` stays pinned with `=`.

## Tests that guard gameplay

- `crates/endfall-sim/tests/golden.rs`: whole games pinned to literal state hashes (native, and two of them in WASM in
  `test/engine.test.js`). Refactors must leave them unchanged; a rule change updates the table on purpose.
- `crates/endfall-sim/tests/gameplay/` (one test binary: `common.rs` helpers, then `orders`, `construction`, `economy`,
  `combat`, `ai`, `maps`, `seats`, `paths`, `random_play`): every building can be built and every unit trained, requirements,
  construction that stalls without a builder and resumes, ether mining, supply and refunds, turrets, the AI finishing
  games (also four AIs free for all and two against two on 96x96, six and eight on 128x128, and three-, four-, six- and
  eight-seat games to their end through `Game::with_seats`; a seat that is out refused and inert; every AI thinking
  every 16 ticks on a tick of its own), maps of 2, 4 and 8 starts
  that are walkable and alike for every start, group paths (one search for a group's order, long searches budgeted,
  no shared route through rock), and `random_play_never_breaks_the_world`: random orders (including stale and nonsense ids) through the same
  `Game` API the browser uses, across many seeds, checking world invariants (positions, hp, occupancy grid, supply,
  resources, miner counters) after every tick. Add a scenario here for every rule you add or change.
- `test/e2e/gameplay.e2e.mjs`: the same journeys through the real UI (click/tap units and buildings, hotkeys, command
  card buttons) on desktop and a landscape phone. The debug handle may only be used to read state, fast-forward
  (`endfall.skip`), grant resources and set up a scene (`engine.debugSpawn`, `engine.debugSetHp`, `engine.debugResearch`); the actions under
  test must go through the UI. Add a scenario for every new UI flow.

## Testing a change by hand

`npm run dev`, open the URL, Medium difficulty. `window.endfall` in the console exposes `G`, `ui`, the camera and
`setResources` for poking at a running game (scripted playtests use it too), and `status()` (the audio context's
state, mute, full screen and whether the page may go full screen at all (`fullscreenEnabled`, the browser's word: false
on iPhone Safari; branch on it, not on the button), the page's errors since it opened; the device checks read it). A sanity run: select harvesters, `B` then `D`, place a Depot near the
Core, train Troopers from a Garrison, `A`-move into the enemy base on the far side of the map. On a phone on the same
network, open the LAN URL Vite prints (touch controls: tap/drag to select, tap to command, two fingers to pan).
