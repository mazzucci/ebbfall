# Multiplayer: design

How Ebbfall plays over the Internet, and why it works this way: friends in one room, up to 8 players on maps of
their size, phones first.

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
loaded the game (or left), and a seat is away after 3 s without an ack. A seat still loading 3 s after the start, or
gone before it loaded, is away too (the others see whom they wait for), on its budget: one that never loads is conceded
and the others play on. The client's READY waits until its game has loaded (src/boot.js loads it behind the menu), so
a start finds every game ready.
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
  room draws it, not each client). The `Game` has a constructor for any seat (`me` set, not team 0).
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

In multiplayer:
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
  paused. A 20-minute game is 36,000 ticks: seconds on a desktop, longer on a phone.
- WebGL context loss (phones drop it under memory pressure) is handled: rebuild the renderer, the game goes on.
- **A name, and the room in the address bar (2026-10-30):** NEW ROOM and JOIN are dimmed (`aria-disabled`, still
  focusable) until a name is typed; a tap or Enter meanwhile focuses the field with "Enter your name" beside it. The
  name is remembered on the device (store.js `name`) and filled in. The relay trims it, cuts it to 16 and turns a
  hello without one away (`error {code: 'name'}`). In a room (on its `seat`) the address is `?room=CODE` (replaced in
  place, the other parameters kept), the same link SHARE LINK shares; leaving the room (BACK, the menu from a game, the
  end card's) takes it off. A page opened on `?room=CODE` (a friend's link, a reload, UPDATE; an older `?join=CODE`
  too) goes straight into the room with the remembered name, this tab's seat token taking its seat back; with no name
  it shows the join form, the code filled in, and joins nothing until one is typed.
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
  Cloudflare the lobby (seats with their tokens, sides, AI seats and their levels, the map; no connections) is stored when it
  changes (at most one write a second, the last change always, at once when the last socket closes; a ready toggle
  writes nothing), so a held seat survives the room's eviction from memory; a stored record of a
  bad shape comes back as an empty lobby.

### Builds and versions

The service worker keeps a build until the next visit, so friends will often be on different builds. The handshake
carries the protocol version and the `.wasm` hash; a mismatch shows "Update needed" with one button (fetch the new
build, activate it, reload into the same join link). Built (2026-10-26): the build bakes in `__SIM_BUILD__` (a hash
of the `.wasm`, vite.config.js); a room keeps its first seat's and refuses another with `version`; the lobby says so
with UPDATE (the service worker's update, then back to `?room=CODE`); and a new build that installs while the player
is out of a game (the menu or the lobby) switches over at once, back into the lobby's room. Determinism across engines is checked, not assumed: the golden
games run in WASM in Chromium, Firefox and WebKit in CI (the build and engines jobs, and a macOS ARM runner), and a hidden `?selftest` page
runs them on a real phone. The sim's dependencies stay pinned (`libm` exactly), and no float-changing build flags
(SIMD, a fast-math `wasm-opt`).

### Desync

Acks carry the hash at checkpoint turns; the relay compares. Clients keep a ring of per-tick hashes, so on a mismatch the first
diverging tick is known; each side sends its trail and a snapshot of that tick (units and buildings), to be fixed
from. With two players the game ends "out of sync"; with more, the odd one out rejoins.

## Hosting

The relay is a pure state machine with an injected clock (rooms, seats, turns, the log), with two thin adapters: a
Node `ws` server (local play, LAN or Tailscale, the CI tests) and a Cloudflare Durable Object, one per room.

- The relay is **its own Worker**, deployed only when the live relay is not this commit's: a deploy restarts the
  objects and drops every socket, so it must not ride on every site merge. The relay never needs to know the game's
  build (clients compare hashes), so the site and the relay are two Workers (the site: below).
- `GET /version` (relay/version.js, in both adapters; public, no secrets, never cached) answers `{proto, build}`: the
  protocol it speaks (relay/room.js PROTO) and its build, a hash CI makes of the bundle wrangler would upload
  (`wrangler deploy --dry-run --outdir`, wrangler pinned) and of wrangler.toml, passed at deploy as the `RELAY_BUILD`
  var (null when deployed without it, by hand). On a push to main CI's `relay` job compares the live build with this
  commit's and deploys when they differ, when there is no /version (an older relay, or no answer), or on a run started
  by hand, then waits for /version to say the new build. It does not ask what the push changed: once (#162) a
  protocol change (PROTO 5) went out with a run that was cancelled, the next run's diff had no relay change, and the
  site shipped a PROTO 5 client against a PROTO 4 relay (every new room: "Ebbfall has an update"). The `deploy` job,
  after the relay, publishes the site only when the live relay's `proto` is this commit's (src/net/net.js's equals
  relay/room.js's: test/relay-worker.test.js), and fails with an error otherwise: the site never outruns the relay.
- Plain WebSockets in a game (hibernation saves nothing while a game runs and loses in-memory state); the log stays
  in memory, and a relay restart rebuilds the room from a client's log.
- Rooms: a 4-letter code claimed when free (retry when taken), expiring when empty; caps on message size, orders
  per turn and list lengths. No per-address limits on creating or joining rooms yet (a Worker has no shared memory:
  it would take an object of its own on every connection). On the free plan a flood can only use up the day's quota
  (multiplayer down until midnight UTC): acceptable for a game among friends.
- The relay also keeps the device test's reports (`?bench`, src/client/bench.js; relay/bench.js): `POST /bench` from
  the game's pages (ORIGINS, CORS with a preflight; a JSON report of a known kind and version, 64 KB at most; per
  address (an IPv6 /64) 2 a minute and 10 a day, then 10 a minute and 500 a day in all; Origin can be faked, the
  addresses cannot) answers with a code, `PERF-XXXXXX` in the room codes' letters (64 million: not guessed), and `GET
  /bench/<CODE>` (from anywhere: `curl`) returns `{code, received, report}` for a week (30 reads a minute per
  address). One more object of the room class, named `bench`, keeps every report (so its limits count everyone's and
  the week's sweep is one list; no new class, no migration); the Node relay keeps them in memory on the same port.
- Cost: the free plan's duration limit (13,000 GB-s a day) allows about 85 two-player games of 20 minutes a day;
  Workers Paid ($5 a month) removes the concern.

### The site: a Cloudflare Worker

Since 2026-10-30 (the owner's call: straight to it, rolled back if it does not work) https://ebbfall.com/ is a
Cloudflare Worker with static assets, `ebbfall-site` (site/), no longer GitHub Pages: a room's, a challenge's or a
replay's link can then show its own preview (Open Graph tags per URL, which a static host cannot do).

- **What it serves.** dist/ as the Worker's assets at their exact paths, as Pages served them (/selftest.html,
  /voice-lab.html, `?bench`, the service worker's scope at /: html_handling "none", no /selftest.html -> /selftest
  redirect, which the service worker could not answer a page load with). The Worker runs first only for the game's page
  (/ and /index.html: worker.js `page`, which writes a link's own card in, below); every other file is
  served by Cloudflare alone and costs no Worker request (the free plan's 100,000 a day are shared with the relay; past
  them, a route's request goes by its failure mode: fail open, the default, passes it on to the origin, GitHub Pages'
  last deploy behind the proxied records; fail closed answers an error until midnight UTC; far from today's traffic,
  and Workers Paid lifts it). A page load that is not a file goes to / (its query kept), a missing file is a 404.
  www.ebbfall.com and plain http go to https://ebbfall.com/ (the zone does not force https: relay.ebbfall.com answers
  http), the game's one origin.
- **Cache headers** (site/cache.js, for the Worker's responses and, through dist/_headers written before each deploy,
  for the files served alone): assets/ (Vite's hashed names) immutable; the pages, sw.js and the manifest `no-cache`
  (revalidated on every load, so a deploy is seen at once and the service worker's update finds the new build); art/,
  the icons, og.png, robots.txt and sitemap.xml Cloudflare's default (`max-age=0, must-revalidate`, with an ETag).
  Pages sent `max-age=600` for all.
- **Search and link previews.** index.html's head is the site's card for every visit and crawler: the title ("Ebbfall:
  a free browser RTS in the 1998 mold"), a description, `rel=canonical` https://ebbfall.com/, Open Graph and X
  (`summary_large_image`) tags with public/og.png (1200x630, made by tools/og.mjs from the game's own sprites), and
  JSON-LD (`VideoGame` and `WebApplication`: free, single player and multiplayer, no ratings). robots.txt allows
  everything and names sitemap.xml, which lists the one page; both are plain files (and, like og.png, left out of the
  offline store: tools/offline/plugin.mjs `WEB_ONLY`). A link with a card of its own gets it from the Worker:
  site/preview.js `preview(url)` maps the URL to the fields it changes (a room's link, `?room=CODE` or the older
  `?join=CODE`: "Join my Ebbfall game: room CODE", its own description, og:url the page with that room alone), and
  `page` writes them into the og: and twitter: tags with HTMLRewriter, with or without the beacon (below). The code is
  echoed only when it is one the relay could have made (four of its letters, upper-cased as the client reads it);
  anything else gets the site's card, so no text of a link's query ever reaches the page. The `<title>`, the
  description and the canonical stay the site's (a room is not a page to index). A challenge's link (SHARE after a
  victory against the AI, `?vs=CODE`: src/client/challenge.js, which the Worker bundles; it imports only maps.js and
  src/engine/util.js, no WASM) is the second entry: the code is read only if it is exactly one the game makes (a
  versioned code of numbers and enumerated values, the map, starts, seats' races, sides and levels and the winner's
  time; no free text at all), and the card is made from those values alone ("Can you beat this? 1 vs 3 Brutal AIs on
  Iron Compass", "Humans vs Vael · won in 12:34 · free, in your browser"), og:url the link encoded again from them,
  never the query as it came; the image stays og.png. **ETag**: the file's own (and the assets' 304) for the file as it
  is; a rewritten page is built whole and tagged with a hash of its bytes (`"p-..."`), so a browser's copy is kept with
  a 304 exactly when it is the same page, whatever changed (the card's wording in a deploy that left index.html alone,
  the room, the token). Crawlers rarely revalidate; the cards are checked by fetching a room link (`curl -s
  'https://ebbfall.com/?room=WGNJ' | grep og:`, or a challenge's: `?vs=1.8.5.ky.h00v13v23v33`) or with a platform's own debugger (Facebook's Sharing Debugger, which
  WhatsApp shares; Discord and X cache a URL's card for a while).
- **The switch** changes the server, not the origin: the service worker, its caches and what the device remembers
  carry over; the next visit's sw.js check installs the build the Worker serves, as after any deploy.
- **How the Worker gets the traffic: zone routes over proxied records.** `ebbfall.com/*` and `www.ebbfall.com/*` are
  routes of the Worker (wrangler.toml), and a route sees the requests Cloudflare proxies. The hostnames keep GitHub
  Pages' own DNS records (the apex's four A records 185.199.108-111.153, www a CNAME to mazzucci.github.io); the switch
  turns their proxy on (orange), an edit in place: the hostnames resolve all along, to GitHub until the edit, to
  Cloudflare and so to the Worker after it. GitHub, behind the records, is reached no more (the Worker answers every
  request), and stays the origin a route falls back to. Custom domains, tried first (#174), cannot take a hostname
  with records of its own: Cloudflare refused ebbfall.com ("externally managed DNS records", code 100117) even with
  wrangler's override, and deleting the records first would leave the hostnames without any for a while (resolvers
  keep that empty answer for the zone's negative TTL, 30 minutes). The certificates are the zone's (Universal SSL:
  ebbfall.com and *.ebbfall.com).
- **Deploy** (ci.yml's `deploy` job, after build, engines, arm and the relay, with the files the build job tested), once
  the live relay's `/version` says this commit's PROTO (above; nothing below runs otherwise):
  1. `node site/dns.mjs log`: the two hostnames' records into the job summary, GitHub Pages' also as JSON (reads only;
     a failed read is a warning).
  2. `node site/dns.mjs drop-domains`: a custom domain of ebbfall-site on either hostname, should #174's attempt have
     left one, deleted (none did: the records were unchanged after it).
  3. `wrangler deploy`: the Worker and its routes (with the records still DNS-only, nothing changes yet).
  4. `node site/dns.mjs proxy`: GitHub Pages' records proxied, in one batch of PATCHes of `proxied` alone (applied in
     one transaction), only those records (never relay.ebbfall.com or another); later runs find them proxied and send
     nothing. A failed deploy never gets here.
  Pages' own settings are left as they were: its custom domain keeps ebbfall.com claimed by this repository, and its
  last deploy is behind the records.
- **Zone features.** Proxied, the hostnames get the zone's settings: Rocket Loader, which rewrites a page's scripts,
  must stay off; the zone's cache does not come into it (the Worker and its assets answer).
- **Web Analytics.** Cloudflare's, cookie-less. The owner turned on automatic injection for the zone; until the switch
  ebbfall.com's records were DNS-only (grey: GitHub's addresses, no Cloudflare in the way), so nothing was injected.
  Whether automatic injection also covers a Worker's responses on a route is not documented: after the switch,
  `curl -s https://ebbfall.com/ | grep beacon.min.js`. If it is not there, set the repo variable CF_ANALYTICS_TOKEN (the
  site's token from the Web Analytics dashboard): the deploy passes it to the Worker, whose `page` then adds the beacon
  with HTMLRewriter, and the page's ETag becomes its bytes' hash (above: a browser's copy from before is fetched again,
  not kept with a 304). Never both (every visit would count twice). Either way the beacon is a deferred cross-origin
  script in index.html, and the service worker's copy of index.html may carry it: tools/offline/sw.js answers only
  same-origin GETs, so the beacon (and its report, a POST to /cdn-cgi/rum) goes to the network, is never stored, and
  offline it simply does not load: the game plays on (test/offline.test.js; checked in Chromium through `wrangler
  dev`, offline).
- **Rollback**: `CLOUDFLARE_API_TOKEN=... node site/dns.mjs unproxy` puts GitHub Pages' records back to DNS-only, so
  the hostnames go straight to GitHub Pages again (its last deploy) as soon as resolvers see it (proxied records have a
  5-minute TTL); then revert the PRs that moved the site (ci.yml's `deploy` back to GitHub Pages), so that main's next
  run publishes there and does not proxy the records again. The Worker's routes can stay: they see no traffic once
  the records are DNS-only (or remove them: Workers & Pages, ebbfall-site, Settings, Domains & Routes). Should records
  be missing, `node site/dns.mjs restore records.json` with the JSON of the first deploy's job summary recreates them
  (each on its own; `node site/dns.mjs check` lists what is there). GitHub's certificate for the two hostnames is
  valid until January 2027 and renews once the records point at GitHub again. Should GitHub Pages ever be turned off,
  a rollback needs Pages turned back on with the custom domain first, before any record points at GitHub again (or
  someone else's Pages site could claim the hostname).

### Browsers and devices

- Every pull request (.github/workflows/ci.yml): the whole browser suite (test/e2e) in Chromium in the build job, and
  in the `engines` job, beside it, the cross-engine subset (the scenarios marked `engines: true`: the menu, sound and
  full screen, a short game through the UI, taps on a phone, joining a room through a local relay, PLAY OFFLINE, the
  golden games) in WebKit and in Firefox (`ENDFALL_ENGINE=webkit|firefox npm run test:e2e`; Firefox under `xvfb-run`,
  as it has WebGL only with a display). Scenarios that need Chromium (gestures through CDP: drags, long presses,
  double taps, two fingers) say so and skip elsewhere; `ENDFALL_ALL=1` runs all the others in WebKit or Firefox too.
  Headless engines on a server have no audio device: only Chromium's audio context runs there.
- Phones and tablets (.github/workflows/devices.yml, **Devices**, by hand and on Mondays): an iPad and an iPhone
  (Safari) and a Pixel (Chrome) load the site (https://ebbfall.com/ unless told otherwise), start a single-player game
  through the menu, tap the sound and full-screen buttons and read back `endfall.status()` (the audio context's state,
  full screen and whether the page may have it, the page's errors since it opened). Screenshots, `summary.json` and the session links are the run's
  artifacts and its summary. With the `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY` secrets it uses
  BrowserStack's real devices (Playwright, as BrowserStack documents it); without them, GitHub's machines: Safari on
  the iOS Simulator on macOS (Appium's XCUITest driver, native taps) and Chrome on an Android emulator (a Play Store
  image, Playwright over adb). Free on a public repository, but slow (the first iOS run builds WebDriverAgent), hence
  not on every pull request. The scripts and how to run them by hand: tools/devices/README.md.
