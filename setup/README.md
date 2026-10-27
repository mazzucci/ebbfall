# Single-player setup: three ways out of the dropdowns

The owner finds PR #148's seat list (a YOU row and up to seven AI rows, three native selects each) crowded. Eight
players on a 667x375 phone is 23 selects and 7 crosses on one screen. The three mockups here keep everything the list
allows (any team split, each AI's race and difficulty on its own, 2-8 players, the same component for the lobby) but
put the details one tap away: **a seat is one token** (colour band, name, race, difficulty pips) and **a token opens
one small sheet** of chips (the lobby's own radio-group buttons). The three approaches differ in how the *teams* are
expressed and how fast the usual setups are reached.

| File | Approach | Teams are… | Taps to "me vs three allied AIs" from 1v1 |
|---|---|---|---|
| `a-sides.html` | **A. Sides board** | spatial: a panel per side, YOUR SIDE first | **2** (+ AI, + AI in ENEMIES) |
| `b-presets.html` | **B. Presets first** | a chip (1v1, 2v2, 1v3, FFA 4, 3v3, 4v4, 2v2v2v2, FFA 8) | **1** |
| `c-roster.html` | **C. Roster accordion** | a number per seat, as today (T1-T8) | 6 (+ AI, + AI, open AI 2, T2, open AI 3, T2) |

Today's list: 6 taps plus two native pickers to scroll (+ AI, + AI, team select, pick, team select, pick).

Renders: `shots/<approach>-<state>-<size>.png`, states `1v1`, `1v3`, `4v4`, `2v2v2v2`, `edit`; sizes `667x375`,
`844x390`, `412x915`, `desktop` (1200x700). Contact sheets: `contact-a-sides.png`, `contact-b-presets.png`,
`contact-c-roster.png`. Open the HTML over HTTP (`node render.mjs` re-renders everything; the mockups are ES modules,
which Chromium will not load from `file://`).

## What is shared: the token and the sheet (`base.css`, `common.js`)

- **Token** (`.tok`): a 36 px button (32 px on short phones). A 4 px colour band down its left edge is the seat's
  in-game colour (the dot today, but a stripe reads at a glance across eight of them). Then the name (YOU in gold),
  the race in mono (`HUM`/`VAEL`/`RND` on phones, full names on desktop), four difficulty pips (lit = level), and a
  faint pen glyph at the end that brightens on hover: "tap to change". It carries the `.ib` button look, which is the
  page's only "tappable" vocabulary, so it is not mistaken for a label. `aria-label` reads "AI 2: Vael, Medium, team
  2. Change". A read-only token (another player's seat in the lobby) is `.ro`: dashed border, no pen, `disabled`.
- **Sheet** (`.sheet`, `role=dialog`): RACE chips, PLAYS chips (EASY…BRUTAL) with the chosen level's one-line
  description under them (details on demand; today they are `title`s nobody sees on a phone), SIDE chips (YOURS,
  SIDE 2…, + NEW SIDE, each with its colour), REMOVE (dashed, not for YOU and not when two seats remain) and DONE. A
  bottom sheet on phones (thumb reach, familiar), a small centred dialog on desktop. Height on 667x375: 227 px, no
  scrolling. Keyboard: Tab to a token, Enter opens the sheet with focus on the first lit chip, arrow keys move within a
  group, Escape or DONE closes and returns focus to the token.

Both can be built in `seats.js` with no library: `token(row, i, {ro, open})` and `sheet(row, i, choices)` as
pure DOM builders next to the existing `seatRow`/`selectBox`.

## A. Sides board

A panel per team, YOUR SIDE first (gold border), then ENEMIES (or SIDE 2, SIDE 3… when there are several), each holding
its tokens in a grid (two abreast when the panel is wide: eight players at 667 px are two panels of 2x2), a dashed
`+ ALLY` / `+ AI` at its foot, and a thin dashed `+ SIDE` strip at the end that adds an AI on a side of its own. A
side empties when its last seat moves or is removed. Free for all is simply a panel per seat (eight of them fit:
four by two at 667 px).

Strengths

- Teams are *seen*, not decoded from T1…T8: "who is with me, who is against me" is the first thing the layout says,
  and the sim's rule (allies start side by side) is literally the picture.
- The common cases are cheap: 1v3 is two taps on `+ AI`; 2v2 is `+ ALLY`, `+ AI`; a new AI inherits its side-mates'
  race and difficulty (today: the last AI's), so most setups never open the sheet.
- The lobby maps directly: a token is a person (their name, their race pick, a READY tick) or an AI; guests see their
  own token editable (race) and everything else `.ro`; the host sees `+ AI`, `+ SIDE` and a MOVE row in the sheet.
  Moving a person between sides is a sheet choice (no drag and drop needed; drag could be added later for mouse users
  as a shortcut with the same result).
- Screen readers get `group` landmarks named "Your side", "Enemies"/"Side 2"…, each listing its tokens; the team of a
  seat is its ancestor, not a hidden number.

Weaknesses

- One more level than a flat list: changing an AI's difficulty is tap, tap, DONE (three), where the list was a select
  and a pick (two). Mitigation: the sheet's chips are big and the sheet needs no scrolling.
- With five or more sides (FFA 5-8) the panels are small; the header carries a count (`· 2`) because tokens can wrap.
- The `+ SIDE` strip is a new idiom; the `aria-label`/`title` "An AI on a side of its own" has to carry it.

## B. Presets first

Two chip rows decide the usual game: MATCH (1v1, 2v2, 1v3, FFA 4, 3v3, 4v4, 2v2v2v2, FFA 8) and AI (one difficulty
and one race for every AI). Under them the line-up: the seats grouped by side with `VS` between, every seat a token
that opens the same sheet for its own race, difficulty or side. Any per-seat change lights CUSTOM in the MATCH row,
and the AI row shows nothing lit plus "mixed"; tapping a chip there sets all AIs again.

Strengths

- Fastest to the owner's cases: 1v3 and 4v4 are one tap each; the first-time player sees exactly two decisions
  (match, difficulty) and a START button.
- Smallest page in the 1v1 state; the line-up doubles as the explanation of what the chips did.

Weaknesses

- Two sources of truth (the preset and the seats). CUSTOM and "mixed" states need explaining, and a preset tap
  silently rebuilds the seats, throwing away per-seat edits (a confirm would be worse; a toast is the least bad).
- The MATCH row is itself eight chips, and on a 412 px portrait screen the page becomes four rows of chips above the
  line-up: closer to the dashboard the owner does not want. Presets of people (the lobby) are odd: "4v4" with six
  humans and two AIs needs the seats to be named anyway.
- Lobby mapping is weaker: presets fit AIs, not people arriving in order. The host would still use the line-up tokens
  for everything that matters.

## C. Roster accordion

Today's list, flattened: one token per seat with a team tag (T1…T8), two columns where there is room, and the tapped
seat opens an inline editor (RACE, PLAYS, TEAM chips, REMOVE, DONE) that spans the grid beneath its pair. No overlay.

Strengths

- Least change: `renderSeats` keeps its rows; the three selects become one token and a disclosure. A screen reader
  gets a plain list of buttons with `aria-expanded`; nothing modal.
- Chips instead of native selects gives the same look on every platform (iOS's wheel picker and Android's dialog
  differ a lot from the gold chip rows the lobby already has).

Weaknesses

- Teams are still numbers, so 1v3 is six taps, and "which side is T3" takes thought; the colour swatch on the team
  chips helps but does not say "enemy".
- On 667x375 with eight players the open editor pushes the page past the fold (`shots/c-roster-edit-667x375.png`:
  START GAME is half cut; the page scrolls). It fits at 844x390 and in portrait.
- Each open editor moves the rows under it; tapping down a list of AIs to set them one by one is jumpy.

## Recommendation: A, with B's match-up chips as a one-line shortcut

Build **A (Sides board)** as the component. It is the only one of the three whose *picture* is the rule the sim
enforces, it serves the lobby without a second idiom (a person is a token, the host's extras are the same sheet
rows), and it keeps a 667x375 screen at one glance for eight players with nothing cut off. Then, if the owner wants
the one-tap cases, add a single MATCH row above the board with the five splits `maps.js teamsFor` already knows
(FREE FOR ALL, 2v2, 3v3, 4v4, 2v2v2v2) plus 1v3; tapping one rearranges the sides (new AIs copy the last AI); any edit
unlights the row. That line is optional and can come in a second PR; A stands without it.

Not recommended: B alone (two states to explain, weak in the lobby), C (teams stay abstract; the editor overflows the
smallest target with eight players).

Details worth keeping from the mockups whichever is chosen: the colour *band* instead of a dot, the difficulty
*pips* (a level reads in a glance and the four names are one tap away), the level's description in the sheet, the
`+ ALLY` wording on your own side, and `disabled` START with the note when every seat is on one side (as today).

## Implementation sketch (A)

Files: `src/client/seats.js`, `src/client/menu.js`, `index.html` (`#menuSolo`), `src/style.css`; later
`src/client/online.js` for the lobby. `test/seats.test.js` keeps passing: the data model does not change.

**Data: unchanged.** `menu.rows` stays `[{ race, team, diff? }]`, you first. `arrange`, `startSetup`, `legacyRows`,
`oneTeam`, `freeTeam`, `compact`, `validRows`, `seatColor` all stay. The board is a *view* of `rows` grouped by
`team`; "side k" is the k-th team in `arrange`'s key order (yours first), so sides are stable while rows change.

**`seats.js`: replace the two DOM helpers.**

- Remove `selectBox` and `seatRow` (and `RACE_SHORT`'s reason to exist on phones becomes the token's short race).
- Add `seatToken(row, i, color, { short, ro, open, onOpen })` returning the `.tok` button (band, name, race, pips,
  pen; `aria-label` as above; `disabled` when `ro`).
- Add `sideBox(name, tokens, { me, count, add: { label, title, on } })` returning a `.side` panel.
- Add `seatSheet(row, i, color, sides, { onRace, onDiff, onTeam, onRemove, onDone, canRemove })` returning the
  `.scrim` with its `role=dialog` sheet: RACE chips, PLAYS chips + hint (`DIFF_TITLES` moves here from menu.js), SIDE
  chips (`sides`: `[{ team, name, color }]` plus `+ NEW SIDE` → `freeTeam(rows)`), REMOVE, DONE. One function
  `chipRow(items, on, label, pick)` builds the radio groups; `menu.js`'s `teamButtons`/`mapButtons` can share it.
- Focus handling: the sheet traps Tab, Escape closes, closing restores focus to the token (`data-k` as today).

**`menu.js`: `renderSeats` becomes `renderBoard`.**

- Group `rows` by team in `arrange` order; for each team build `sideBox` with `seatToken`s (colour from `seatColor(order.indexOf(i))`
  as now), `+ ALLY`/`+ AI` while `rows.length < MAX_PLAYERS` → `setRows([...rows, { race: last.race, team: t, diff: last.diff }])`
  where `last` is the side's last AI (or the last AI anywhere, or Easy); the `+ SIDE` strip → the same with `team: freeTeam(rows)`.
- A token's `onOpen` sets `menu.editing = i` and renders the sheet; each sheet change calls `set(i, k, v)` as today
  (`compact` after a team change or a removal, so sides stay dense); the board re-renders under the open sheet.
- `oneTeam` → START disabled and `#soloNote` as today.
- `coarse`/`short` stays for the race label; the 16 px select rule in `style.css` goes (no selects, no iOS zoom).

**`index.html`:** `#soloSeats` becomes `<div id="soloBoard" role="group" aria-label="Sides">`; the sheet is appended
to `#start` when open (one element, reused).

**`style.css`:** drop `.isel`, `.srow`, `#btnAddAi` and the `(pointer:coarse)` select rules; add `.tok`, `.pips`,
`.board`, `.side`, `.newside`, `.scrim`, `.sheet` from `base.css`/`a-sides.html` (about 40 lines in the file's style).

**Lobby (`online.js`, later):** `seatList` rows become the same `sideBox`/`seatToken`s with `ro` for others' seats
and `onOpen` only on your own (race) or, for the host, on every seat (race, difficulty, side, kick); `+ AI` and
`+ SIDE` for the host only; `teamButtons` (the 2v2/3v3 presets) can stay as the MATCH shortcut row above the board.
`ROOM_TEAMS` descriptions become the sides' headers.

**Tests:** `seats.test.js` unchanged; add DOM tests for `seatToken` (label, pips count, `ro`), `seatSheet` (chips
reflect the row, REMOVE hidden for YOU and at two seats) and `renderBoard` grouping (sides in `arrange` order, `+ SIDE`
gone at eight).

## Files here

- `base.css`, `common.js`: the shared look and builders.  `fonts/`: Chakra Petch and Share Tech Mono (OFL), copied from `src/fonts`.
- `a-sides.html`, `b-presets.html`, `c-roster.html`: the mockups; `?state=1v1|1v3|4v4|2v2v2v2|edit`.
- `render.mjs`: renders `shots/` and the contact sheets (`contact-*.html` are their sources). `shots/a-sides-ffa8-667x375.png`: the board with eight sides (free for all), rendered on its own.
- `shots/today-8-small.png`: today's list with eight seats at 667x375, for comparison.
