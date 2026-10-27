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
  splits into the local menu and a room pause. Built (2026-10-27): online the card (src/client/pause.js) is a "Menu"
  over a game that goes on (BACK TO GAME, HOW TO PLAY, LEAVE GAME; no RESTART: one side cannot restart a shared
  game) with PAUSE FOR EVERYONE while this seat has pauses left. `pause {}` asks the relay (relay/room.js: `PAUSES` = 3
  a game per seat, `PAUSE_MS` = five minutes at most, only while the clock runs and no pause is on); it tells everyone
  `pause {seat, ms, left}` and closes no turns until `resume {}` from that same seat, or the time runs out (`resume
  {seat: -1}`); a seat that leaves ends its own pause. Every client shows the card in its paused state: "You paused ·
  4:12 left" with RESUME for the caller, "Paused by Bo · 4:12 left" with a greyed BO'S PAUSE for the others (nobody
  else can end it, not even by sending `resume`), counting down from `ms`; the "Waiting for" line stays off meanwhile
  (a seat away during a pause is not waited for: its away budget is frozen until the resume). When it ends, the
  card closes for the caller and for those it opened for, and is the menu again for those who had opened it. A seat
  that comes back during a pause is sent it after its turns, and `start` carries the pauses left per seat (`left`), so
  a reloaded page offers the right count. The clients need nothing more: with no turns the lockstep `Game` waits, the
  Net keeps acking once a second (a paused seat is not an away seat), and the relay's clock restarts from the resume
  (no burst of turns).
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
- **In the lobby (the lobby hold, built 2026-10-27):** the host opens a room on a phone and goes to a messaging app to
  send the code; the phone kills the page's socket. The relay keeps the seat (name, race, token, the host's role) for
  `LOBBY_HOLD_MS` (5 minutes), away (`here: false`) and not ready: the others see the name with AWAY and "Waiting
  for Ann…", a friend joining takes the next truly open seat (never a held one, nor moves to it), and the room cannot
  start while a held seat is away (it is not ready). The page keeps reconnecting (the usual backoff, capped at 4 s,
  and at once when it is in view again: `wake`) for as long as it holds a seat, and its token takes the seat back:
  the same code, the same seats; once the hold is over it gives up too ("Can't connect"), as a page that never got
  a seat does after a few tries. After the hold the seat is open again (the host's: "The host left: SIT HERE", as
  before). A player back without the token (the link opened in a messaging app's browser, then in Chrome; another
  device) finds a full room told "a seat is kept a few minutes for a player who stepped away", and the host may free
  an AWAY seat at once (× on it: `free {seat}`; never matched by name). Leaving the room on purpose (BACK, or a
  single-player game from the menu) says `leave` first, and a ping after it: its pong confirms the leave arrived (no
  pong in 2 s: the socket was half-open, so a reconnect and the leave again); the seat is open at once, and the
  page forgets the room's token. A held seat's sim build is checked when it comes back, not against a newcomer. On
  Cloudflare the lobby (seats with their tokens, AI seats, map, teams, difficulty; no connections) is stored when it
  changes (at most one write a second, the last change always, at once when the last socket closes; a ready toggle
  writes nothing), so a held seat survives the room's eviction from memory (see M3d's limits); a stored record of a
  bad shape comes back as an empty lobby.

### Builds and versions

The service worker keeps a build until the next visit, so friends will often be on different builds. The handshake
carries the protocol version and the `.wasm` hash; a mismatch shows "Update needed" with one button (fetch the new
build, activate it, reload into the same join link). Built (2026-10-26): the build bakes in `__SIM_BUILD__` (a hash
of the `.wasm`, vite.config.js); a room keeps its first seat's and refuses another with `version`; the lobby says so
with UPDATE (the service worker's update, then back to `?join=CODE`); and a new build that installs while the player
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
   (only when not the default, so the goldens stay), the end card's wording with allies ("the enemy conceded"). (All
   but shared vision: done in M4 step 2c.)
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
a lobby is evicted from memory a minute or two after its last socket closes and comes back as it was (its seats held
for their tokens, the lobby hold above, or empty) from its storage record when someone joins within 10 minutes (an
alarm deletes the record once the room has been empty that long); a running game is never stored (an evicted or
redeployed game is over).

**M4. More players, larger maps (up to 8).** Teams in the lobby (free-for-all, 2v2, 4v4), AI to fill empty seats
(up to four players, 2v2 and AI seats: step 2c, done; up to eight on 128x128: step 2e, done).
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
   lower than a duel's on the same map: part (d) still matters before phones get 128x128. Left: (d) group paths,
   then 5-8 players on 128x128; allies sharing vision.
   (b) A colour for every seat. *Done (2026-10-26):* eight seat colours (`SEAT_COLORS`, src/client/look.js: gold and
   magenta as before, then teal, lilac, green, blue, white, red; docs/ART.md). Units, buildings and turret heads are
   rendered once in neutral paint with a team mask frame (`<name>_m`) that the renderer draws over the art tinted
   with the seat's colour (a tint the art pipeline fits per colour, atlas.json `tints`); warp-in, construction,
   cloak, power and hit effects reach both layers, HUD portraits composite both, and with more than two seats the
   minimap draws every seat in its colour (two seats: ours and theirs, as before). The atlas went from 9 pages and
   4.4 MB to 5 pages and 3.1 MB, whatever the number of seats.

   (c) Up to four players, from the menu and the lobby. *Done (2026-10-27):*
   - **Players first, then the map, then teams** (the owner's order). A PLAYERS row (2, 3, 4; built for 8 to fit
     later) decides the size: two play a duel's 64x64 maps exactly as before, three or four a 96x96 map
     (src/client/maps.js: `SIZES`, `sizeFor`, `mapsFor`). Each size has its own maps: the generator lays a seed out
     differently at another size, so the 96x96 ones have names of their own: DUST QUARTER (seed 1291, standard, starts
     in the corners), SHARD CROWN (2940, deep fields, starts in the middles of the sides round a rich centre), LONG
     STEPPE (1582, open plains, corners), and RANDOM. They were picked from 60 seeds per character by four Medium AIs
     free for all and two against two on two turns of the seats: every game ended (7 to 21 minutes), won from
     different starts, the worst tick under 40 ms natively. A map's button carries a small badge ("up to 4") only
     when some map offered seats more than the players chosen (three players: a start stays free, or a fourth could
     join); otherwise nothing (no noise). `mapPreview(seed, kind, size)` draws any size with every start. For four,
     TEAMS on the same row: FREE FOR ALL · 2v2 (seats 0 and 1 against 2 and 3: consecutive seats, which `seat_starts`
     makes neighbours). Players and teams are remembered on the device.
   - **Single player:** you and 1-3 AIs at the OPPONENT difficulty; one ENEMY choice for all of them (RANDOM drawn per
     AI; in a 2v2 the ally AI's race too); for four, free for all or you and an AI against two. Two players start the
     duel exactly as before (`resetGame`); more go through `resetGameSeats` (`Game.withSeats`).
   - **The lobby:** the host (seat 0) picks PLAYERS (the room's seat count, 2-4: the relay's `seats {n, map}`; a
     seat a person holds is never dropped, the teams go back to each its own), TEAMS for four (`teams {teams}`: a
     team per seat or null), the map (one that seats them; every client falls back to the first that does if not),
     and fills open seats with the AI (`+ AI` per open seat: `ai {seat, on, race?}`; tap an AI seat's race for the
     next, × opens it again; one AI difficulty for the room, `diff {diff}`, shown once there is an AI seat). A
     friend may move to an open seat (`sit {seat}`: the teams are by seat; the host's seat once the host has left,
     and is the host then). With three or four seats the seats sit two a row (2v2: a team a row, VS between) with
     each seat's colour, and the title gives way to the room's code, so a 667x375 phone holds it.
   - **AI seats on the relay:** no connection, so it never waits for them (no load, no acks, never away, no ready, no
     say in a rematch or a hash check) and nothing comes from them; every client runs those seats' AI in its own game
     (the sim's `ai_seats`, deterministic). The setup is `{seed, map, side, races, names, teams, ai, diff}` (`teams` a
     team per seat, `ai` 1 per AI seat, `diff` the AI's difficulty; RANDOM races drawn alike as before, `seatRaces`);
     every client builds its game with `Game.withSeats(..., teams, ai, me, size)` (`resetGameForSeat`). Two-seat rooms
     draw their seed and side as before and play the same game (`withSeats` with two seats and no AI is `forSeat`'s,
     which is gone). `PROTO` 3: an older client is told to update.
   - **Out of a game that goes on** (more than two seats): a seat that is out (beaten or conceded) gives no more
     orders (`World::apply` refuses them: a conceded player cannot fight on for an ally), and what it leaves is inert
     (`World::inert`): its units stop where they are when it goes out (a miner lets go of its crystal) and from then on
     neither its units nor its buildings act (no moving, firing, mining, building, training or research); they stay on
     the map and can be destroyed. Simplest and deterministic; removing them was the alternative. Once the game is
     over nothing is held back (a duel never sees any of it: one seat out ends it, so the goldens did not move).
   - **Teams in the state hash** only when they are not each seat its own (the goldens' games hash as before).
   - **The end card with allies:** "Your team wins" / "Your team lost" (online, "with Bo" for friends on the team);
     a free-for-all says "The last one standing", "Your base fell" or "You conceded"; "X conceded" only of an enemy in
     a duel. The army chart sums the enemies ("Enemy armies"). Out of a free-for-all, the end card comes at once
     (DEFEAT; online the game goes on underneath); out while an ally fights on, a toast ("You are out: your team fights
     on"), and the card when the game ends.
   - **Allies in the HUD:** an ally's unit selected reads "Ally", with a friendly selection ring; its capital units are
     not announced as enemies; the minimap shows every seat in its colour (more than two seats). Allies do not attack
     each other (step a). Vision is not shared yet: later.
   Tests: gameplay `seats.rs` (an out seat's orders refused and its leftovers inert, deterministic; teams in the hash
   only when not the default; three seats with an idle person, four AIs free for all and a person with an AI ally
   against two through `Game::with_seats`, each to one team standing), `lockstep.rs` (two clients with an AI seat, and
   two people with two AIs in a 2v2, the same world every turn, the AI building up); test/relay.test.js (a two-seat
   room's setup as before; the host's seat count; AI seats: never waited for or away, no orders, the setup's teams, ai
   and difficulty, ready from people only, rematch; a person leaving with AI seats; moving seats); test/net.test.js
   (three seats with an AI and a 2v2 of two people and two AIs through the Node relay: the same game in both clients,
   the AIs at work); test/maps.test.js; engine.test.js (every map's preview with every start; an online room's game
   with AI seats); e2e: the single-player PLAYERS/TEAMS/maps flow on a 667x375 phone, a 2v2 to its end (out while the
   ally fights on), and a three-seat online room with an AI seat in two browsers (the same hash trail).
   Left: (d) group paths, then 5-8 players (128x128 maps of their own, the PLAYERS row to 8); allies sharing vision;
   an AI taking over a seat whose player left.

   (d) Group paths. *Done (2026-10-27):* measured first: the worst tick of every AI game was a wave setting off, each
   of its units planning its own cross-map route (34-94 searches in one tick, 1-3 ms each on 128x128). Now
   (`world/paths.rs`):
   - **One route for a group.** A long walk (start and goal 16 tiles or more apart on either axis, `LONG_SEARCH`) is
     planned once for the units of a seat sent to the same place in the same tick (an AI's wave, a group order,
     attack-move or formation, survivors of a fight going back to the march): the first unit's route is kept until the
     end of the step, and a unit of that seat bound within 4 tiles of its goal from within 8 tiles of its start takes
     it. It walks straight to the farthest of the route's first six waypoints it can reach in a straight line (the
     smoothing's own line-of-sight test, so never through rock or a building; seeing none, a short search of at most
     300 nodes onto the route's start, or else a search of its own), follows the route, and from its end goes on to
     its own spot (straight from the waypoint before the end, or from the end, or by a short search that must get
     there: a spot behind a wall from the route's end gets a search of its own). A way to the side of a building
     (attacking, building, repairing, bringing a load back) is shared the same way by the units of a seat going to
     that building. A building going up or coming down, or a shard field running dry, forgets the routes planned so
     far.
   - **A budget of long searches.** A seat runs at most two long searches a tick (`LONG_SEARCHES`; orders given between
     steps count in the next step's; every try of a way to a building counts). A unit refused with no route asks again
     the next tick (in the units' order, by id), standing meanwhile if it is a walker under a new order, or heading
     straight for its target; one replanning a route it has (every 0.6-0.9 s while it closes on something) keeps it
     until its next replan, and replans may take only the first search of a tick: the second is kept for units with no
     route, so a new order waits a tick or two at most however many units are replanning (a review found sixty units
     closing on a far building, replanning in id order, starving every later long order of the seat for good). Nobody
     drops its order while it waits, and short searches are never held back.
   - **Cheaper smoothing.** The smoothing looks at most 24 steps of the raw route ahead (`SMOOTH_LOOK`): a long straight
     stretch gets a waypoint every 24 tiles or so instead of one, and it costs that window per waypoint instead of the
     whole route (alone, it took the 128x128 duel's worst tick from 1.6 to 0.95 ms a search).
   Nothing new is hashed, nothing is iterated out of order, the RNG draws as before (one per route planned); the routes
   are new, so units walk a little differently: every golden game's 9000-tick hash moved (cinder-hard's and
   barren-easy-scripted's at 2700 too; none at 300), and the pinned results.
   Timings: native release, 12-minute games of Hard AIs (Humans and Vael by turns), seeds 3, 17, 29, 41 and 53 (five
   games each), on a quiet 4-core VM; the step's time per tick, average / 99th percentile / worst (main's worst tick
   was all path search: its A* time and searches in brackets):

   | game             | main                                 | group paths           |
   |------------------|--------------------------------------|-----------------------|
   | 2 AIs on 64x64   | 0.083 / 0.34 / 13.3 ms (12.8 ms, 66) | 0.081 / 0.27 / 1.5 ms |
   | 2 AIs on 96x96   | 0.112 / 0.56 / 32.5 ms (32.1 ms, 41) | 0.103 / 0.49 / 2.5 ms |
   | 2 AIs on 128x128 | 0.149 / 1.05 / 54.8 ms (54.3 ms, 34) | 0.123 / 1.00 / 4.9 ms |
   | 4 AIs on 96x96   | 0.259 / 1.16 / 43.9 ms (42.4 ms, 94) | 0.226 / 0.97 / 2.9 ms |
   | 8 AIs on 128x128 | 0.518 / 2.99 / 41.1 ms (39.0 ms, 64) | 0.520 / 2.23 / 8.6 ms |

   The most search time in any one tick is now 1.5-3 ms (about 6 ms with eight seats, up to 16 long searches). The
   earlier figures (worst 87-130 ms for the 128x128 duel) were taken on a loaded VM. Balance, AI against AI over both
   seed sets (72 games a level, the Humans' wins, Easy / Medium / Hard / Brutal): main 37.5 / 37 / 36 / 26 (136.5 of
   288, 47%), group paths 45 / 36 / 46 / 27 (154, 53%): Easy and Hard towards the Humans, the total about 1.5
   standard deviations of the difference between two such runs, within what a movement change brings (to watch at
   the next balance pass). Tests: gameplay `paths.rs` (twelve Troopers sent as a group across a 128x128 map, in
   formation and attack-moving, Standard and Labyrinth: one search, eleven routes shared, all at their spots in time;
   thirty in six bunches well apart sent across in one tick: at most two long searches a tick, some wait, all have
   their route within four ticks, none dropped its order, all arrive; groups scattered over winding maps: every route
   walkable from the unit and from waypoint to waypoint (joining without the line-of-sight test fails it and the
   first; no budget fails the second); short walks neither shared nor held back; sixty Troopers spread out, each
   closing on a far Core: every one has its way within 3 s, and four far moves ordered 3 s in have theirs within four
   ticks (letting replans take every search fails it); a wall across the map, one unit sent before it and one, from
   the same place in the same tick, behind it: the second gets there (taking the first's route and a tail that stops
   at the wall fails it); `path_cost_per_tick`, ignored, prints the table's figures). The scenarios already there (a
   route round a building put up across it, a group sent to a walled-off spot, random play) pass unchanged; the four
   AIs' free for all on 96x96 now runs up to 18 minutes (its seed 11 knocks out its first seat at 16 instead of 14).
   Left before 5-8 players on 128x128: the worst tick is now the AIs' turns, all on the same tick (every 16 ticks,
   each brain's half-second clock in step with the others): eight cost 7-10 ms together in the first minutes;
   staggering them by seat would spread that. Then 128x128 maps of their own and the PLAYERS row to 8; on a phone
   (WASM a few times slower) that tick would be some 30-40 ms.

   (e) Five to eight players on 128x128. *Done (2026-10-27):*
   - **The AIs think on ticks of their own.** Every brain still takes its turn every 16 ticks (`AI_TURN`, about half a
     second; a count of ticks now, where it was a half-second clock of summed `dt`s that came to 16 ticks), but the
     k-th of m AI seats (in seat order) takes it `k * 16 / m` ticks after the first: up to sixteen never think on the
     same tick (eight: every second tick). A lone AI thinks as it always did (first on tick 16), so a single-player
     duel is unchanged: of the golden games only the two AI-against-AI ones moved (`EXPECTED_VAEL_AI` at 2700 and 9000,
     and `EXPECTED_RESULTS`' first two games: the second AI now thinks 8 ticks after the first). Deterministic, nothing
     new hashed; `World::ai_turns()` counts each seat's turns (tests).
     Timings: native release, `path_cost_per_tick` (12-minute games of Hard AIs, seeds 3, 17, 29, 41 and 53), main and
     this step back to back on a quiet 4-core VM; the step's time per tick, average / 99th / 99.9th percentile / worst:

     | game             | main                          | AIs on ticks of their own    |
     |------------------|-------------------------------|------------------------------|
     | 2 AIs on 64x64   | 0.082 / 0.28 / 0.52 / 1.5 ms  | 0.072 / 0.28 / 0.55 / 4.1 ms |
     | 2 AIs on 96x96   | 0.103 / 0.50 / 0.86 / 5.1 ms  | 0.101 / 0.34 / 0.85 / 1.9 ms |
     | 2 AIs on 128x128 | 0.123 / 1.00 / 1.32 / 4.9 ms  | 0.127 / 0.58 / 1.46 / 4.5 ms |
     | 4 AIs on 96x96   | 0.226 / 0.98 / 1.39 / 3.0 ms  | 0.238 / 0.70 / 1.06 / 4.8 ms |
     | 8 AIs on 128x128 | 0.522 / 2.31 / 6.95 / 11.2 ms | 0.533 / 1.38 / 2.58 / 8.0 ms |

     Eight AIs over three quiet runs: worst 10.1-11.9 ms on main, 6.1-8.0 now; 99.9th percentile 6.8-7.0 against
     1.9-2.6. A tick with an AI's turn now costs at most about 3 ms; the worst left is a burst of short path searches
     (60 searches, 24,000 nodes, in one game's tick, no AI turn in it): short searches have no budget (step d). The
     single worst tick of the smaller games is noise either way (the same work, one tick in 20,000). In headless
     Chromium (WASM, software rendering, the sim's step alone, eight Hard AIs on 128x128, seeds 3 and 17, two runs
     each): main 0.83-1.66 ms a tick on average, 99th percentile 5.7-13.1, worst 21.6-50.4 (6 and 266 ticks over
     16 ms); now 0.68-1.38, 1.9-7.3, worst 7.0-25.0 (0 and 5 over 16 ms); the slower run of each was on a busier
     machine.
     Balance, AI against AI over both seed sets (72 games a level, the Humans' wins, Easy / Medium / Hard / Brutal):
     main 45 / 36 / 46 / 27 (154 of 288), now 38.5 / 34 / 36 / 20 (128.5): both seat orders are played, so the
     offset favours no race; it reshuffles every AI-against-AI game as a movement change does. The total is about two
     standard deviations of the difference between two such runs below main's, and near where it was before group
     paths (136.5). As a check of that noise, the second AI 4 ticks after the first instead of 8 gave 37.5 / 34 / 38 /
     33 (142.5): Brutal alone went from 20 to 33 for four ticks. To watch at the next balance pass.
   - **128x128 maps of their own,** for five to eight players: IRON COMPASS (seed 5, standard: a rock diamond in the
     middle ringed by fields), SUNKEN COURT (9, open plains round a walled centre), GREY WARRENS (2, labyrinth: a maze
     of rock and narrow passes), and RANDOM. Every 128x128 map has its eight starts two by each side (step a), so the
     layouts differ by their rock and fields. Picked from ten seeds of each character by eight Medium AIs free for all
     (all sixty games ended, 15-35 minutes), then for the candidates eight and six free for all, three against three,
     four against four and four pairs on two turns of the seats: every game of the three ended (9 to 32 minutes; free
     for all 15-32, teams 9-25), won from starts on every side. Rejected: a labyrinth (seed 1) whose last two seats
     held each other off past 45 minutes, and another (5) the same with six. Three and four players keep the 96x96
     maps, two the duel's.
   - **PLAYERS 2 to 8,** in single player and in the lobby (one row; the relay's `MAX_SEATS` is 8; no message changed,
     so `PROTO` stays 3: a client of another build is turned away by the build check anyway). TEAMS on the same row:
     FREE FOR ALL always; for four 2v2, for six 3v3, for eight 4v4 and 2v2v2v2 (maps.js `teamsFor`, `teamList`: allies
     in consecutive seats, which `seat_starts` makes neighbours: with eight, seat s on start `side + s`; with six, on
     starts 0, 1, 2 and 4, 5, 6 of the ring, a team on each three, a free start between them on either side). With
     teams, the seats turn round the ring by whole starts only (`Game.withSeats` takes `side % k`): the draw that turns
     the pattern among the seats (`side / k`, which seat is squeezed in a free for all) split a team of 3v3 round a free
     start in four draws in six (2v2, 4v4 and 2v2v2v2 were side by side already; their seats now turn a little
     differently for the same draw). Five and seven play free for all. A split the players are not offered plays free
     for all (and comes back when they are). The "up to 8" badge for five to seven, as with three on 96x96 (in the
     lobby under the map's name, so four maps keep to one row). The lobby's seats sit four a row with five or more
     (three a row for six), a team a row with VS between for 3v3 and 4v4, the pairs apart for 2v2v2v2; all of it fits
     a 667x375 phone, eight seats included.
   - **Phones:** no note on the menu (the HUD stays minimal): the sim's step for eight Hard AIs in headless Chromium
     averages 0.7-1.4 ms a tick, 99.9th percentile 2.5-10 ms; a phone's WASM a few times slower would average some
     2-5 ms with rare ticks of 20-40 ms, inside the 33 ms a tick has at 30 Hz. The renderer with eight armies on
     screen is not measured (software WebGL here says nothing about a phone's GPU): to try on a real phone; if big
     games struggle there, one line under the PLAYERS row for five to eight ("big games run best on a desktop") is
     the fallback.
   Tests: gameplay `seats.rs` (every AI thinks every 16 ticks on a tick of its own, a lone AI first on tick 16, with two
   to eight seats, all AIs or a person in seat 0; allies in consecutive seats start side by side whatever the draw, for
   2v2, 3v3, 4v4 and 2v2v2v2 (without `side % k`, 3v3 fails); six and eight seats to the end on the three maps: three
   against three with an idle person, eight free for all, four pairs; release builds only), `maps.rs` (the 128x128 maps'
   previews with every start), an AI unit test (`turn_offset` distinct for up to sixteen brains); test/relay.test.js
   (eight seats, two people and six AI seats in four pairs: never waited for); test/net.test.js (an eight-seat room of
   two people and six AIs through the Node relay: the same game in both, every AI at work); test/maps.test.js (sizes to
   eight, badges, the team splits and a room's teams back to a choice); engine.test.js (eight starts in the 128x128
   previews); e2e: single player 5-8 (the maps, the teams for six and eight, a game of eight in four pairs and one of
   six, three against three, on 128x128; a 667x375 phone holds it) and online (a room of eight on a small phone, then
   six, three against three with four AI seats, in two browsers: the same hash trail).
   Left: allies sharing vision; an AI taking over a seat whose player left; a budget for short path searches (the
   worst tick left in 8-AI games is a burst of them).

## Open questions for the owner

- Player names: typed once and remembered on the device (lean), or none.
- Chat: none at first; pings later, as the review advised.
- Rated games or a ladder: not planned.
