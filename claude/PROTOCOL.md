# Ebbfall's embed contract: a page that plays Claude against the game

How a page that embeds Ebbfall in an `<iframe>` (the Claude Code plugin's local page, for one) starts a game with a plan
for an AI seat, receives check-ins while it plays, steers that seat with deltas and intents, and gets the summary at
the end. The plan vocabulary itself (every field, its range and default, how the AI economy works) is in
`claude/PLAN_VOCAB.md`; this file is the transport.

What stays true whatever the page does:

- **Single player only.** A plan, a delta and an intent are refused in an online (lockstep) game, and never sent over
  the network. The sim validates and clamps every field (`Game::setPlan`, `Game::planDelta`); the page cannot set
  anything the vocabulary does not name.
- **The game never pauses for Claude.** The plan seat keeps playing its current plan (the built-in Hard AI with
  Claude's fields) while Claude thinks; a delta takes effect on the tick it arrives.
- **Replays are exact.** The start plan and each delta are recorded with their tick; a replay applies them on the same
  ticks.
- **A bare link (a phone, a chat) is plan-at-start only:** `?plan=` sets the plan, and nothing changes it during the
  game. Check-ins and deltas need an embedding page.

## Choosing the mode

The page picks the mode with the iframe's URL (all parameters strict; a bad one is ignored, as if absent):

| URL | Mode |
| --- | --- |
| `https://ebbfall.com/?plan=CODE` | **Claude vs the person.** The person plays seat 0 in the single-player menu's setup; the plan steers the first enemy AI seat (Hard). |
| `https://ebbfall.com/?plan=CODE&watch=1` | **Watch: Claude vs the built-in Hard.** Seat 0 is the plan seat (Hard's AI with the plan), seat 1 plain Hard; the person spectates (both sides in view, no orders taken). |
| `...&seed=N` | The game's own seed (0 to 4294967295; with a plan only): the same map, fresh draws, the AI's style among them (`Game::setGameSeed`). The same plan and seed play the same game. Left out, each game (each rematch) draws a fresh one, told in `start`. |
| `...&vs=CHALLENGE` | Either mode on a challenge link's map, peoples and starts (`src/client/challenge.js`). |
| `...&embed=1` | Turns the message channel on (below). Without it the game neither posts nor listens. |

The person still presses START GAME on the single-player page (the page shows the plan's line). Watch plays two AI
seats: in it the menu's seat 0 is the plan's people, seat 1 the AI's.

## The allowed origins

The game listens only when it is framed (`window.parent !== window`) and the URL has `embed=1`, and takes a message only
when `event.source === window.parent` and `event.origin` is:

- a loopback origin: `http://localhost[:port]`, `http://127.0.0.1[:port]` (the plugin's page), or
- exactly the origin named by `embedder=` in the URL (`https://host[:port]`, nothing else: no path, no wildcard).

Everything else is dropped silently. The game posts only to the origin of the parent's `hello`, never to `*`.

## Messages the page sends (parent to game)

Every message is a plain object with `type` and `v: 1`; unknown types, extra fields, or a `v` other than 1 make the whole
message ignored (nothing applied, nothing answered). A `plan` or `delta` with the right fields whose code does not decode
(or whose `seed` or `say` does not pass), a `delta` with no planned game running, and a `plan` during one are answered at
once with `ebbfall:applied` and `ok: false`, `error` saying why: the page never waits for a reply that will not come.

| `type` | Fields | What it does |
| --- | --- | --- |
| `ebbfall:hello` | none | Opens the channel; the game answers `ebbfall:ready` to this origin. Send it after the iframe's `load`, again until answered. |
| `ebbfall:plan` | `code`: a plan code, string, at most 160 characters; `seed` (optional): a game seed, a whole number 0 to 4294967295 | Before a game starts: replaces the start plan (as `?plan=` would), and the game seed when given. Refused once a game is running. |
| `ebbfall:delta` | `code`: a delta code (same grammar; fields and intents), at most 160 characters; `say` (optional): a line for the player | During a game: merges the delta's fields into the plan seat's plan and carries out its intents, on the tick it arrives. `say` is shown as below. |
| `ebbfall:say` | `text`: a line for the player | During a game: shows the line. |

A line for the player (`say`, `text`) is the only free text the game accepts: a string of 1 to 140 characters after
trimming, control characters refused; shown as a short toast with `textContent` (never HTML), at most one every 5 s.

## Messages the game posts (game to parent)

| `type` | Fields | When |
| --- | --- | --- |
| `ebbfall:ready` | `build`: the game's build id; `mode`: `play` or `watch`; `plan`: the start plan's canonical code, or null; `seed`: the link's game seed, or null | In answer to `hello`. |
| `ebbfall:start` | `seat`: the plan seat; `me`: the person's seat (null in watch); `peoples`: each seat's people (`Kingdom`, `Expedition`); `map`: `{name, size}`; `plan`: the canonical code as applied; `seed`: the game seed this game plays (the link's, or a fresh one); `adjusted`: what was clamped or dropped, a list of short strings | When a game with a plan starts. |
| `ebbfall:checkin` | `tick`; `digest`: the check-in digest (below) | Every 2 game-minutes. |
| `ebbfall:event` | `tick`; `digest`: the same digest, its `why` naming the events | On a key event: the plan seat's wave arrives or is wiped out, an enemy attack reaches it, a building of its falls, its army is wiped out at home, one of its expansions falls, the enemy's first top-tier unit is seen. At most one every 20 game-seconds (events in between are gathered, the same one counted: "your Barracks fell at your main base (x3)"); a check-in due within 20 s of the last digest is sent 20 s after it, never dropped, so a base under attack never goes dark. |
| `ebbfall:applied` | `tick`; `ok`: boolean; `error`: why it was refused (when not ok); `adjusted`: list of strings; `plan`: the plan's canonical code now | In answer to every well-formed `plan` and `delta`, applied or not. |
| `ebbfall:end` | `result`: `won`, `lost` or `timeout` for the plan seat; `summary`: the game summary (JSON object, `crates/endfall-sim/src/summary/`) | When the game is over, when the person leaves it, or in watch mode at 30 game-minutes with no winner (`timeout`; the game stops there). |

### The digest

A compact JSON object, about 1–2 KB (a few hundred to a thousand tokens), built from what the plan seat knows: its own
state, and of the enemy only what its sight (and its allies') has shown. Fields:

- `n`, `at` (game time m:ss), `why` (the events, or `every 2 minutes`), `plan` (the canonical code in force);
- places in the plan seat's own words: "your main base", "the enemy's expansion", "open ground 20 tiles north-east of
  your main base";
- `you`: `money_name` (the money's word: `gold` or `energy`), `bank`, `income_per_min`, `workers`, `places` (`used/cap`), `army` (`value`,
  `units` by type), `buildings` (finished, by type), `sites` (going up), `research`, `wave` (out: its units left of how
  many, where; at home: the count it waits for, what it has, and what holds it);
- `enemy`: `in_sight` (units and buildings in sight now, with their value), `seen_so_far` (unit and building types ever
  seen, the largest army seen, expansions seen);
- `since_last`: what it trained, lost and killed since the previous digest (by type and value), its attacks' results.

## Framing notes

- The site sends `Permissions-Policy` with `fullscreen=(self)` and `autoplay=(self)` (site/cache.js): framed by another
  origin, the game cannot go full screen, and its sound starts only after a tap inside the frame. The page should
  leave room for the game rather than rely on full screen.
- There is no framing rule yet (no `frame-ancestors`, no `X-Frame-Options`). When one comes, it must keep loopback
  parents allowed, or embedding stops working.
- A test browser may block a loopback page from framing another loopback port (Chromium's local network access
  checks); the e2e test serves its host page from the game's own origin for that reason.

## A minimal page

```js
const frame = document.querySelector('iframe'); // src: https://ebbfall.com/?embed=1&plan=1.w14.f6m.s12&watch=1
const send = (m) => frame.contentWindow.postMessage({ v: 1, ...m }, 'https://ebbfall.com');
addEventListener('message', (e) => {
  if (e.origin !== 'https://ebbfall.com' || e.source !== frame.contentWindow) return;
  if (e.data.type === 'ebbfall:checkin' || e.data.type === 'ebbfall:event') askClaude(e.data.digest); // then:
  // send({ type: 'ebbfall:delta', code: '1.m20.xmass', say: 'Gathering for one big push.' });
});
frame.addEventListener('load', () => send({ type: 'ebbfall:hello' }));
```
