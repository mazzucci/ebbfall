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
3. The cross-engine golden matrix in CI, and the `?selftest` page.

**M3b. Relay and net client.** The relay state machine and its Node adapter; `src/net/` (socket, turn buffer,
acks, reconnect); the setup message and seat constructor in use; away and back. E2E: two browser contexts through
the local relay with injected latency and jitter, socket kills, hidden-page emulation and CPU throttling.

**M3c. Lobby, mobile-first.** MULTIPLAYER on the menu: create a room (the code, a share link `ebbfall.com/?join=CODE`
through the phone's share sheet) or join by code; seats with race picks (2 for now); ready; start. Few words, big
buttons. The end card names the other player; rematch.

**M3d. Deploy.** The relay Worker on Cloudflare (the owner's token in CI's secrets), its adapter tested with the
Workers test pool. The client finds it at a fixed address.

**M4. More players, larger maps (up to 8).** Teams in the lobby (free-for-all, 2v2, 4v4), AI to fill empty seats.
Map size per map (`MW`/`MH` become the map's: today they are constants in the sim and the client, which allocates
its grids when it loads): 64x64 for 2, about 96x96 for 4, 128x128 for 6-8; the generator places N bases. Pathfinding
on up to 16k tiles: raise the search cap, maybe flow fields for big groups; measure first. Performance with ~800
units on a mid phone decides whether 8 is offered on phones (4 is the likely comfortable number there).

## Open questions for the owner

- Player names: typed once and remembered on the device (lean), or none.
- Chat: none at first; pings later, as the review advised.
- Rated games or a ladder: not planned.
