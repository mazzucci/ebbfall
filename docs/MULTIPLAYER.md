# Multiplayer: design

How Ebbfall plays over the Internet: what is built, in what order, and why. Owner's goal (2026-10-26): play friends
over the Internet, and eventually more players on larger maps, up to 8. Mobile-first stays the hard constraint.
Revised the same day after a review of the first draft (the relay keeps the clock; phones' lifecycle from the start;
the N-seat refactor before the lobby).

## The approach: deterministic lockstep through a relay that keeps the clock

Every player runs the whole simulation; only orders travel. The simulation is built for this (CLAUDE.md "Rules that
keep the sim multiplayer-ready"): a fixed 30 Hz tick, a seeded RNG, f64 that WASM computes identically everywhere,
every order a `Command` applied for a seat and logged, a per-tick `state_hash`, and replays rebuilt from the log.

Why lockstep and not a server simulating the game: bandwidth does not grow with the number of units, there is no
server to run the game on, and replays, desync checks and rejoining come from the command log. The cost: input delay
(an order shows ~150-300 ms later; Brood War's was similar, and a unit's acknowledgement plays at once) and the
slowest machine sets the pace.

Why a relay and not peer-to-peer: it works through every NAT and phone network, it is one connection per player
with 8 players instead of 7, and it is the referee: the clock, seats, who is away.

### The relay keeps the clock

The relay closes a **turn** (3 ticks, 100 ms) on its own timer, whether or not anyone sent anything. An order a
client sends is stamped by the relay into turn `current + D` (D: the input delay, 2 turns to start, raised for a
slow link from the measured round trip). The closed turn's bundle `{turn, [seat, cmds]...}` goes to everyone.
Clients send only when they have orders, plus an ack every 3 turns (the last turn run; with the state hash at the
latest checkpoint turn, every 10th, compared whenever each seat gets there). The clock starts once every client has
loaded the game, and a seat is away after 3 s without an ack.
A client runs turns from a small buffer, a little behind the relay's clock, and catches up when behind (several
turns a frame). The relay slows its clock when a seat's acks lag behind (a slow phone) and stops it when a seat is
away (below), so nobody runs ahead. One phone's 4G hiccup costs that phone a stutter, not everyone a freeze.

### Orders on the wire

- `Command::encode` / `decode` in the sim: a compact array (`code`, then its fields; kinds, upgrades and abilities as
  indices, ids as integers, points as numbers), lists capped. `decode` is total: anything malformed is dropped,
  never a panic (release builds abort on panic, and a bad command would stop every client at once). Fuzzed with
  random input; a round-trip test for every command kind.
- A client applies **its own orders too only from the relayed bundle** (decoded), never from its outbox: whatever
  the encoding loses, every client loses it the same way.
- Within a tick: by seat, then in the order the seat sent them; `World::apply`'s per-seat checks keep a client from
  ordering anyone else's units.
- The relay treats commands as opaque, stamps the seat from the connection, and caps their size and rate.

### What is not an order, and must not be outside the log

- **The game's setup** (seed, map kind, sides, races, seats) is decided by the room and sent to everyone (today the
  menu draws it with `Math.random`). The `Game` gets a constructor for any seat (`me` set, not team 0).
- **Pause** is the relay's: it stops the clock (a resume command could never run on a stopped clock). The pause card
  splits into the local menu (help, sound: the game runs on) and a room pause (a few per player a game).
- **A seat leaving, or an AI taking it over** (games of more than two): relay-injected entries in the log, so replays
  and rejoining see them; a takeover AI plays without the AI's income or rule handicaps. `start_replay` replays the
  AI seats as they changed, not as they ended.
- **Debug knobs** (`debug*`, `setResources`, `holdWaves`, `disableAi`, `record`, `startReplay`, `endfall.skip`) are
  refused by a lockstep `Game`.

### Immediate feedback for delayed orders

Orders take effect a turn or two later, so the client keeps a **pending layer**: what it has sent and not yet seen
run. Resources it has committed are shown as spent, a queued unit shows in the queue, a placed building's ghost
stays until its Place runs, the card's checks use the pending totals. When a scheduled order fails where it runs
(the money went elsewhere first), the sim emits a per-seat **refused** event, and the card shakes or toasts then.

### Phones: away and back

There is no handling of a hidden page today. In multiplayer:
- The simulation keeps running under the game's own overlays (menu, help, the leave dialog): only the room pause
  stops it.
- Hidden on desktop: turns are run from the socket's message handler (animation frames stop in a background tab).
- Hidden on a phone (the system suspends the page within seconds and the socket dies): the relay marks the seat
  away after a few seconds without an ack and stops the clock; the others see "Waiting for <name>" and may give them
  up to 60 s (a budget per player per game, so one flaky phone cannot hold a game indefinitely); then the seat leaves.
- Coming back: a ping at once, a reconnect if there is no answer within 2 s (sockets come back "open but dead").
  **Reconnect** (the page still alive, the world in memory): send the last turn simulated, receive the bundles since.
  **Rejoin** (the page reloaded): the room and a seat token are kept on the device; the client rebuilds the game from
  the room's log at full speed (`Game::fast_forward`: no snapshots, no events) with a progress bar while the room is
  paused. A 20-minute game is 36,000 ticks: seconds on a desktop, perhaps a minute or more on a phone; measured in
  M3a, and a saved checkpoint (World save/load, tested hash-for-hash) only if that is too slow.
- WebGL context loss (phones drop it under memory pressure) is handled: rebuild the renderer, the game goes on.

### Builds and versions

The service worker keeps a build until the next visit, so friends will often be on different builds. The handshake
carries the protocol version and the `.wasm` hash; a mismatch shows "Update needed" with one button (fetch the new
build, activate it, reload into the same join link). Built (2026-10-26): the build bakes in `__SIM_BUILD__` (a hash
of the `.wasm`, vite.config.js); a room keeps its first seat's and refuses another with `version`; the lobby says so
with RELOAD (the service worker's update, then back to `?join=CODE`); and a new build that installs while the player
is out of a game (the menu or the lobby) switches over at once, back into the lobby's room. Determinism across engines is checked, not assumed: the golden
games run in WASM in Chromium, Firefox and WebKit in CI (and a macOS ARM runner), and a hidden `?selftest` page
runs them on a real phone. The sim's dependencies stay pinned (`libm` exactly), and no float-changing build flags
(SIMD, a fast-math `wasm-opt`).

### Desync

Acks carry the hash at checkpoint turns; the relay compares. Clients keep a ring of per-tick hashes, so on a mismatch the first
diverging tick is known; each side sends its trail and a snapshot of that tick (units and buildings), to be fixed
from. With two players the game ends "out of sync"; with more, the odd one out rejoins.

## Hosting

The relay is a pure state machine with an injected clock (rooms, seats, turns, the log), with two thin adapters: a
Node `ws` server (local play, LAN or Tailscale, the CI tests) and a Cloudflare Durable Object, one per room.

- The relay is **its own Worker**, deployed only when relay code changes: a deploy restarts the objects and drops
  every socket, so it must not ride on every site merge. The relay never needs to know the game's build (clients
  compare hashes), so the site can stay on GitHub Pages; moving it to Cloudflare is optional.
- Plain WebSockets in a game (hibernation saves nothing while a game runs and loses in-memory state); the log stays
  in memory, and a relay restart rebuilds the room from a client's log.
- Rooms: a 4-letter code claimed when free (retry when taken), expiring when empty; caps on message size and rate,
  commands per turn and list lengths; per-address limits on creating and joining. On the free plan a flood can only
  use up the day's quota (multiplayer down until midnight UTC): acceptable for a game among friends.
- Cost: the free plan's duration limit (13,000 GB-s a day) allows about 85 two-player games of 20 minutes a day;
  Workers Paid ($5 a month) removes the concern. Needs from the owner, when the relay is ready: a Cloudflare API token.

## Milestones (in order)

**M3a. Lockstep core, and N seats in the sim.** Both are pure sim work protected by the goldens, and every later step
(setup, lobby, concede, victory, leaving, the end card) would otherwise be built twice.
1. `Command::encode` / `decode` (total, fuzzed); the lockstep `Game` (outbox, `schedule`, a tick runs only when its
   turn is complete, debug knobs refused, the refused event); `Game::fast_forward`; a `Game` for any seat. Test: two
   `Game`s in one process through a fake relay with jitter, reordering and a mid-game rejoin stay hash-identical,
   natively and in WASM under Node.
2. Seats: the sim's two sides become N (`[T; 2]` per-seat state becomes per-seat `Vec`s, `foe()` becomes enemies by
   team, victory "last team standing"), and the snapshot and client follow (`shards0/1`, `faction0/1`, `seen: [bool;
   2]`, `1 - G.me`). Two seats behave exactly as today: the goldens do not move. *Done (2026-10-26):* `World::seats()`,
   `teams` with `enemies`/`allies`, `out` and the winning team (world/seats.rs); a per-seat snapshot record;
   `Game.withSeats(seed, diff, map, side, factions, teams, ai, me)` refuses more seats than the map's starts (2 until
   M4); the AI plans against the nearest enemy start still in. Left for M4: starts for N seats, per-seat colours in
   the art, allies sharing vision, what an out seat's leftover units do (and refusing an out seat's orders: today a
   conceded player in a 2v2 could keep fighting for their ally), teams in the network setup and in the state hash
   (only when not the default, so the goldens stay), the end card's wording with allies ("the enemy conceded").
   Stats and results, which the state hash does not cover, are pinned in golden.rs too (`EXPECTED_RESULTS`).
3. The cross-engine golden matrix in CI, and the `?selftest` page. Done (2026-10-26): `src/engine/golden.js` (the
   golden games, checked against golden.rs), `selftest.html` (the device check, for a phone), the golden games in
   Chromium, Firefox and WebKit in CI's e2e step, and natively and in WASM on an ARM Mac (CI's `arm` job, which
   publishing waits for).

**M3b. Relay and net client.** The relay state machine and its Node adapter; `src/net/` (socket, turn buffer,
acks, reconnect); the setup message and seat constructor in use; away and back. E2E: two browser contexts through
the local relay with injected latency and jitter, socket kills, hidden-page emulation and CPU throttling.

**M3c. Lobby, mobile-first.** MULTIPLAYER on the menu: create a room (the code, a share link `ebbfall.com/?join=CODE`
through the phone's share sheet) or join by code; seats with race picks (2 for now); ready; start. Few words, big
buttons. The end card names the other player; rematch. Rematch built (2026-10-26): REMATCH on the online end card (lit when
the friend asked; WAITING… once this side did); when every seat still there wants one, the room is a lobby again
with the same seats, races and map, and READY starts a new game. The end card keeps the connection (heartbeats) so
nobody is taken for away while deciding.

**M3d. Deploy.** The relay Worker on Cloudflare (the owner's token in CI's secrets), its adapter tested with the
Workers test pool. The client finds it at a fixed address.
Built (2026-10-26): `relay/worker.js` and `relay/wrangler.toml`, tested in Node with fake socket pairs and a fake
namespace (`test/relay-worker.test.js`) rather than the Workers pool (no wrangler or vitest in the dev dependencies).
To switch it on, the owner: (1) creates a Cloudflare API token (template "Edit Cloudflare Workers") and adds the
repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, then runs the CI workflow once by hand
(Actions, CI, Run workflow) for the first deploy, at `relay.ebbfall.com` (a custom domain on the ebbfall.com zone,
which must be in the same Cloudflare account, with no `relay` DNS record yet; made by the deploy); later deploys
happen when a push to main changes relay/; (2) adds the repository variable `RELAY_URL` = `wss://relay.ebbfall.com/`,
which the build bakes in: MULTIPLAYER appears on the menu's first page.
Limits: a deploy restarts every room, ending the games in progress (their players are told the server restarted);
an empty lobby is evicted from memory a minute or two after its last socket closes and comes back, empty, from a small
storage record when someone joins within 10 minutes; a running game is never stored.

**M4. More players, larger maps (up to 8).** Teams in the lobby (free-for-all, 2v2, 4v4), AI to fill empty seats.
Map size per map (`MW`/`MH` become the map's: today they are constants in the sim and the client, which allocates
its grids when it loads): 64x64 for 2, about 96x96 for 4, 128x128 for 6-8; the generator places N bases. Pathfinding
on up to 16k tiles: raise the search cap, maybe flow fields for big groups; measure first. Performance with ~800
units on a mid phone decides whether 8 is offered on phones (4 is the likely comfortable number there).
1. Map size per map. *Done (2026-10-26):* the size is the map's (`Map::w`, `h`; `MapSize`, `MapSize::DUEL` 64x64 for
   every map the menus offer), kept by the World for resets (`World::map_size`, `World::with_size`); `idx`, `in_map`,
   `tile_of` and the 16 px clamps are `Map` methods, and the per-tile grids (fog, detection, the path search's
   scratch) and the spatial hash are sized when a game starts. The generator scales from 64x64, where every formula
   gives the numbers it always had, draw for draw (the goldens did not move): the bases keep their distance from their
   edges (corners, or the middle of opposite sides), pockets, rock features and fields keep their size, and a larger
   map gets one more expansion site per 32 tiles past 64, reaching 16 tiles farther; still two starts. The AI's sweep
   grid keeps a stop about every 10 tiles. WASM: `Game.mapW()`/`mapH()`, and `Game.withSize(..., size)` (64, 96 or 128:
   even sizes, as the centre vent is its own mirror; tests only for now); the client's `MW`/`MH`/`WW`/`WH` (core.js) are live bindings set when a game starts, which
   remakes the grids, and the renderer remakes its fog, shade and minimap canvases when the size changes. The A*
   cap is 5000 expansions per 4096 tiles (20,000 on 128x128): left at 5000, a walker could not cross a 128x128 map
   in one order. Timings (native release build on a loaded 4-core VM, so roughly; a phone's WASM will be a few times
   slower), median `astar` from beside one base to beside the other, smoothing included: 64x64 0.5 ms, 96x96
   1.0-1.3 ms, 128x128 2.6 ms; to a walled-off goal (the search runs to its cap) 0.6-0.8, 1.2-1.9 and 2.4-3.2 ms.
   About half a long path's time is the line-of-sight smoothing (quadratic in the path's length). Tests: gameplay
   `maps.rs` (96x96 and 128x128 maps for every kind: walkable, mirrored, home fields, more expansions; the far side
   of a 128x128 map in play; eight minutes of AI against AI on 96x96 under the random-play invariants) and an engine
   test (a larger game, then smaller ones). Left for step 2: N starts and the lobby's choice of size, the menu's
   preview of other sizes, the AI's timings over longer walks (its sweep moves on after 60 s; a cross-map walk on
   128x128 takes slow units 70-90 s), and the path cost of a wave: two Hard AIs for 12 min, native release, average
   per tick 0.06 ms on 64x64, 0.1 on 96x96, 0.15-0.22 on 128x128, but the worst tick (a wave setting off, 38-50
   cross-map paths of 2-3 ms each in one tick) 4 ms, 18-50 ms and 78-136 ms: a phone's WASM would hitch for 300 ms
   or more. Before 128x128 is offered: one path per group (or a flow field), repaths spread over ticks, or cheaper
   smoothing.
2. N seats on larger maps, in four parts: (a) N starts in the sim; (b) a colour per seat in the client; (c)
   the lobby (seat count, teams, AI to fill seats); (d) group paths.
   (a) *Done (2026-10-26):* a generated map is one start's share and its images under a symmetry of the grid
   (`map::Sym`), so every start gets the same ground, pocket, home field and vent, natural and neighbours: 2 starts
   (the point mirror, as before: the goldens did not move), 4 (the quarter turns of 96x96 or 128x128: the four corners
   or the middles of the four sides, the seed picks) and 8 (128x128 only: the quarter turns and their mirror images,
   two starts by each side, 44 tiles from the next one on that side and from the next one round the corner).
   `map::max_starts(size)` (2, 4, 8) replaces `STARTS`; `starts_for(size, seats)` picks the layout: two seats play the
   two-start map at any size, 3-4 seats the four-start one, 5-8 the eight-start one. A map lists its starts in ring
   order (turned by a seed draw); `seat_starts(k, n, side)` seats them evenly round the ring, seat `s` at
   `(side + s * k / n) % k`, so seats sit round the map in order (allies in consecutive seats are neighbours: the
   lobby's job), 3 of 4 starts leave one corner free, 6 of 8 two opposite starts; a start nobody takes (its pocket and
   fields) is free ground. With two starts `side` 1 trades them as before (`World::side`, a number now). Three seats on
   four starts are not quite fair: the seat in the middle has both others as neighbours (and in AI games it is
   usually the first out); a three-way layout would need a symmetry the square grid does not have. Units on a map of
   more than two starts face its centre when they appear and step out of a building (no rally point) towards it (two
   starts: as always). WASM: `Game.withSeats(..., me, size)` (64, the default, 96 or 128; seats at most the size's
   starts), and `resetGameSeats` in core.js. The AI with several enemies: `foe()` ties (each start on a ring has two
   neighbours as near) go to its partner (seats 0 and 1, 2 and 3, ...), then the next seat round: partners' waves
   meet on the way as in a duel. (Each seat going for the next one round, every wave found a base whose army was out:
   four AIs on 96x96 lost every harvester in the same minute and the game froze, nobody able to pay for a worker.) A
   wave goes for the foe's known buildings first (a second prong too), then any enemy's; with more than one enemy
   still in, a wave out comes home when three or more armed enemies (more than its army at home) are at its
   buildings; the expansion keeps 22 tiles from every other seat's start and, with more than two starts, stays nearer
   its own start than any other (a neighbour's natural can be nearer than ours). Two seats play exactly as before.
   Tests: gameplay `maps.rs` (96x96 with 3 and 4 seats, 128x128 with 4, 6 and 8, every kind: each seat on its start,
   every start walkable from the first, every start's share alike (neighbour, rock, home field and vent, natural),
   one narrow ramp per pocket; two minutes of mining alike; facing and stepping out towards the centre; `seat_starts`
   and `side`), `seats.rs` (the constructor's sizes; four AIs free for all on 96x96 up to 15 minutes under the
   invariants, partners fighting and a seat out or seats across the map fighting; a 2v2 to the end, allies never
   targeting each other, one team standing; six and eight AIs on 128x128), AI unit tests (`foe` pairs, the foe's
   buildings first, the wave called home, expansions on its own side) and an engine test (a four-seat game through
   `withSeats` mirrors four seats' records). The invariants' "eliminated but not over" holds for every seat.
   Two minutes of mining with the first four harvesters differ by up to 8% between the two starts of a duel and up to
   12% among eight starts, and it is positional, not noise (a review averaged 12 seeds x 6 kinds): starts up and left
   mine less, down and right more (128/8: 0.95 against 1.07 of the mean; 96/4: 0.96 against 1.04; the 64x64 duel
   already 2% on main). The map is the same; the cause is in movement or economy (the row-major scan in
   `nearest_free` placing the first workers, the path search's tie-breaks, `to_i32` truncation): a follow-up. With
   fewer seats than starts, which seat is squeezed (between two others, or beside a free start) is drawn: `side / k`
   turns the pattern among the seats (`seat_starts`). At Medium the Vael AI wins most free-for-all pairings against
   the Human AI; in a 2v2 a winning team may have lost one of its seats on the way.
   Timings, native release, 12-minute AI games (on a 4-core VM that other work was using too, so roughly): four Hard
   AIs on 96x96, average per tick 0.22-0.29 ms, worst 12-28 ms (Medium 0.25-0.33, worst 9-41); eight Hard AIs on
   128x128 0.47-0.58 ms, worst 9-27 ms (Medium 0.62-0.66, worst 34-42); six 0.37-0.48, worst 20-43. Two Hard AIs for
   comparison: 64x64 0.07 ms, worst 8; 96x96 0.12-0.13, worst 56-77; 128x128 0.14-0.15, worst 87-130. More seats mean
   more units every tick, but shorter walks (neighbours 44-76 tiles apart), so the worst tick, a wave setting off, is
   lower than a duel's on the same map: part (d) still matters before phones get 128x128. Left: (c) the
   lobby: seat count and map size, teams (allies in consecutive seats), AI to fill seats, the menu's preview of the
   other sizes (`mapPreview` draws a duel's map), teams in the network setup; (d) group paths. Still from M3a: allies
   sharing vision, an out seat's leftover units and buildings (an AI seat with a Core but no worker or money stays
   in), the end card's wording with allies.
   (b) A colour for every seat. *Done (2026-10-26):* eight seat colours (`SEAT_COLORS`, src/client/look.js: gold and
   magenta as before, then teal, lilac, green, blue, white, red; docs/ART.md). Units, buildings and turret heads are
   rendered once in neutral paint with a team mask frame (`<name>_m`) that the renderer draws over the art tinted
   with the seat's colour (a tint the art pipeline fits per colour, atlas.json `tints`); warp-in, construction,
   cloak, power and hit effects reach both layers, HUD portraits composite both, and with more than two seats the
   minimap draws every seat in its colour (two seats: ours and theirs, as before). The atlas went from 9 pages and
   4.4 MB to 5 pages and 3.1 MB, whatever the number of seats.

## Open questions for the owner

- Player names: typed once and remembered on the device (lean), or none.
- Chat: none at first; pings later, as the review advised.
- Rated games or a ladder: not planned.
