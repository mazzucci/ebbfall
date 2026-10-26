# Multiplayer: design

How Ebbfall plays over the Internet: what is built, in what order, and why. Owner's goal (2026-10-26): play friends
over the Internet, and eventually more players on larger maps, up to 8. Mobile-first stays the hard constraint.

## The approach: deterministic lockstep through a relay

Every player runs the whole simulation. Only orders travel: each order is stamped with the tick it will run on, a
few ticks in the future (the input delay), and every client runs a tick only once it has every seat's orders for it.
The simulation is already built for this (CLAUDE.md "Rules that keep the sim multiplayer-ready"): one fixed 30 Hz
tick, a seeded RNG, f64 that WASM computes identically everywhere, every order a `Command` applied for a seat and
logged, a per-tick `state_hash`, and replays that rebuild a game from its log (#111).

Why lockstep and not a server simulating the game: bandwidth does not grow with the number of units (a 200-unit
battle costs the same bytes as a quiet start), there is no server to run the game on, and replays, desync checks and
rejoining all fall out of the command log. The cost: input delay (an order shows ~150-250 ms later; Brood War's was
similar and a unit's acknowledgement plays at once so it does not feel late), and the slowest machine sets the pace.

Why a relay and not peer-to-peer: it works through every NAT and phone network, it is the clock and the referee
(turn order, seats, who left), and with 8 players it is one connection per player instead of 7. Players never send
to each other directly.

## Protocol (designed for N seats from the start)

- **Turns.** A turn is 3 ticks (100 ms). Each client sends one message per turn: `{turn, cmds}` (empty when idle),
  for turn `now + delay` (delay 2 turns to start: 200 ms; the relay may raise it for a slow link). Batching by turn
  keeps it to 10 messages a second per player whatever the order rate (the Cloudflare request budget counts them).
- **Relay.** Collects each seat's message for a turn and broadcasts the bundle `{turn, [seat, cmds]...}` once every
  seat's is in (or the seat is marked away). It keeps the room's log, so a rejoining client replays it.
- **Commands on the wire.** `Command` gets a flat encoding (`code`, ids, numbers, one string: its existing fields),
  `Command::encode` / `decode` in the sim, so no serde and nothing for JS to keep in step by hand.
- **Order of application.** Within a tick: by seat, then by the order a seat sent them. Every client applies the same
  list, so they stay in step; the existing per-seat validation in `World::apply` keeps a client from ordering
  someone else's units.
- **Desync check.** Every 30 turns each client sends `state_hash`; the relay compares. On a mismatch both clients
  dump their command logs and the game ends with "out of sync" (it should never happen; the dump makes it fixable).
- **Version.** The handshake carries a build hash (of the `.wasm`); the relay refuses a room of mixed builds.
- **Pause, concede, leave.** Concede is already a command. Pause becomes a command too (anyone may pause a few
  times a game; anyone resumes). A player who backgrounds the app (phones) or drops: the relay marks the seat away,
  the others see "Waiting for <name>" and may give them 60 s; then the seat leaves (its side is out, or an AI takes
  it over in games of more than two).

## Hosting

The relay is one small module, run two ways: a Node `ws` server (local play, the e2e tests in CI, a LAN or
Tailscale game) and a Cloudflare Durable Object (one object per room) behind ebbfall.com. Moving the static site
from GitHub Pages to the same Cloudflare project then keeps one deploy for both (a build hash that matches the
relay's). Free tier: ~100 two-player games a day (docs: the earlier estimate), fewer for 8 players. Needs from the
owner: a Cloudflare API token for CI, when the relay is ready to deploy.

## Milestones

**M3a. Lockstep in the sim and the client (no network yet).** `Command::encode/decode`; `Game` in lockstep mode
takes local orders into an outbox stamped `tick + delay` instead of applying them, and `schedule(tick, seat, cmd)`
for everyone's; `step()` refuses to run a tick it has not been told is complete. Single player keeps delay 0 and
nothing changes. A refused order (can't afford) shows when its tick runs; the card already checks affordability
locally so the shake stays instant. Test: two `Game`s in one process exchanging commands through a fake relay stay
hash-identical tick for tick, with random orders from both seats.

**M3b. Relay and net client.** The relay module, the Node server, `src/net/` (WebSocket, turns, the fake clock in
tests). E2E: two browser contexts play through a local relay, issue orders on both sides, compare hashes.

**M3c. Lobby, mobile-first.** MULTIPLAYER on the menu: create a room (a 4-letter code and a share link
`ebbfall.com/?join=CODE`, the phone share sheet where there is one), or join by code; seats with race picks; ready;
start. Few words, big buttons; the game itself unchanged.

**M3d. Robust.** Away and back (phones pause background tabs), rejoin by replaying the log, desync dumps, input delay
from measured latency, an opponent's name on the end card, rematch.

**M3e. Deploy.** Cloudflare Workers project: static assets plus the relay object; ebbfall.com moves there.

**M4. More players, larger maps (up to 8).**
- **The sim's two sides become N seats.** About 90 places assume two: per-seat state in `[T; 2]` arrays (resources,
  supply, fog, detection, stats, upgrades, AI brains, factions), `foe()`, start positions. They become `Vec`s sized
  by the game's seat count, `foe()` becomes "enemies" (alliances: a team per seat), and victory becomes "last team
  standing". A refactor first (tech debt before features): two seats behave exactly as today (goldens unchanged),
  then the rules that need it learn about teams.
- **Maps.** Map size from the map (`MW`/`MH` become fields: 64x64 for 2, about 96x96 for 4, 128x128 for 6-8), the
  generator places N bases around the map with point-symmetric fields as today. Pathfinding on 16k tiles needs its
  search cap raised and may move to flow fields for big groups; measure first.
- **Client.** The renderer and minimap already scale with the world size; the HUD and fog are per seat already.
  An 8-player game on a phone: zoom-out limits and the minimap's size are the things to check.
- **Lobby.** Teams (FFA, 2v2, 4v4), AI to fill empty seats.
- **Cost of 8 on phones:** ~800 units means about 4x today's per-tick work; to be measured on a mid phone before
  promising 8 there (4 is the likely comfortable number on phones, 8 on desktops).

## Open questions for the owner

- Player names: typed once and remembered on the device, or none (Player 1, 2)? Lean: typed, optional.
- Chat: none at first (pings instead, later); the review advised pings over typing.
- Rated games / ladder: not planned.
