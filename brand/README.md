# Ebbfall brand proposals: icon, wordmark, landing background

Design proposals for the owner's question: an icon drawn from the name (ebb: the tide pulling back from the shore;
fall: a drop, a descent), a look at the casing of the wordmark (EBBFALL, Ebbfall, eBBFall...), and a background for
the first page of the menu. Everything here was rendered with the game's own headless Chromium and fonts; nothing in
the repo was changed.

## Files

| File | What |
| --- | --- |
| `icon-A.svg` .. `icon-F.svg` | the six icon concepts, 64x64 viewBox, same structure as `public/icon.svg` (rounded square of `#0b0f16`, art on top), so `tools/icons.mjs` can use any of them as is |
| `icon-B-favicon.svg` | a 16x16 cut of the top pick for the `<link rel="icon">` data URL (one wave, no second line) |
| `png/icon-X-512.png`, `png/icon-X-48.png` | each concept rendered at 512 (the manifest's large icon) and 48 (a phone home screen) |
| `png/icon-X-maskable-512.png` | the maskable variant as `tools/icons.mjs` makes it: the icon at 80% on a full square of its background |
| `png/icon-B-favicon-check.png` | the favicon cut at 16 and 32 on a light tab bar and on dark |
| `icons-contact-sheet.png` (`icons-sheet.html`) | all six at 128/96/48/32/16, inside a circle and a squircle mask, as a browser-tab favicon, and on a phone home screen next to generic neighbours |
| `wordmarks-contact-sheet.png` (`wordmarks.html`) | twelve wordmark / casing variants at the menu size (52 px) and the phone size (28 px), each with a note |
| `bg-1-tide-of-shards.html` + `-844x390.png`, `-667x375.png` | landing background concept 1 (mockup of `#menuHome`, rendered at both phone sizes, 2x) |
| `bg-2-two-shores.html` + PNGs | concept 2 |
| `bg-3-terrain-tide.html` + PNGs | concept 3 (uses `bg/terrain-tile.png` and `bg/shards.png`, cropped from the atlas by `crop-atlas.mjs`) |
| `recommended-composite.html` + PNGs | the recommendation on the real page: background 1 with the waterline title |
| `menu.css` | a copy of the first page's styling (`#start`, `.card.menu`, `#menuHome`, `.ib`, `.big`, `.corner`) so the mockups match the live page |
| `fonts/` | Chakra Petch 500/600/700 and Share Tech Mono (copied from `src/fonts`, OFL) so the HTML files open standalone |
| `render.mjs`, `render-icons.mjs`, `icon-frame.html` | the scripts that produced the PNGs (`node render-icons.mjs`; `node render.mjs '[[out.png, page.html, w, h, scale]]'`), needing `PATH=~/tools/bin:~/.local/node/bin:$PATH` and `LD_LIBRARY_PATH=/tmp/chromelibs/root/usr/lib/x86_64-linux-gnu` |

## 1. Icons

Six concepts, each with its rationale. See `icons-contact-sheet.png`.

- **A. The falling tide line.** One wave line that ebbs as it falls across the square, from the top-left shore to the
  bottom-right corner; above it two teal shards the water has left bare. *Verdict: the weakest.* At 48 px it reads as
  a mountain-and-sun chart icon, not a tide. Kept to show the direction was tried.
- **B. Shard at low tide.** Today's gold crystal, with the water drawing back from it: a teal tide line cuts the
  diamond, the part still under water is dim, a second, fainter line marks where the water was. It keeps the icon the
  game already has (the shard, the resource you mine, in the human gold) and adds the name to it: the tide pulling
  back from the shore reveals the shard. Two brand colours (ally gold, shard teal), reads at 16 px as "diamond over
  waves", survives the circle mask.
- **C. The E that ebbs.** A monogram in the title's angular spirit: the stem is the shore, the three arms are the
  waves, each shorter than the last, each tip cut on the slope of a falling wave face. The sharpest at 16 px (one
  letter, one colour), and the most "1998 RTS" of the set; it says the name's initial rather than its meaning, and a
  plain E is less ownable than a picture.
- **D. Two shores.** The human shore (gold, foam rim) and the Vael shore (violet, pearl rim) across a dark strait: the
  tide has drawn back from both, and the two factions face each other over the water. Bold, the only one with the
  second race in it; at 16 px it becomes a two-tone diagonal and loses the wave edges.
- **E. The falling wave.** One gold breaker curling over and down (the fall), foam on its lip, the teal shard shore
  under it as the water pulls back (the ebb). The most literal and the most "hero": it reads at every size and in
  the circle, but a wave is a common icon (surf, weather, water apps) and the gold one looks a little like a flame
  at 16 px.
- **F. Chevron ebb.** Three chevrons pointing down (the fall), each narrower than the one above (the ebb): a tide mark
  and a rank badge in one, which suits an RTS. Very readable at every size; the least specific (chevrons are also
  "download" and "scroll down").

**Top pick: B**, with C as the runner-up. B is the one that tells the name and keeps continuity with the icon
players already have on their home screens; it holds its two colours down to 16 px (the favicon cut
`icon-B-favicon.svg` simplifies it to the diamond and one wave). C is the stronger favicon and would also make a
good in-game mark (loading screen, the About page) next to B. If the owner wants one bold, unmistakable picture
instead, E.

Legibility notes: all six were checked at 512, 96, 48, 32 and 16, inside a circle and a squircle (the maskable
safe zone, the central 80%, is clear in every one: `tools/icons.mjs` scales the icon to 80% on its background), and
on a phone home screen beside generic neighbours. The dark `#0b0f16` square reads well next to bright neighbours and
matches the app's `theme_color`.

## 2. Wordmark and casing

Twelve variants in `wordmarks-contact-sheet.png`, each at 52 px (the menu) and 28 px (a phone in landscape), with
notes on readability, character, and how it sits on the menu.

**Recommendation: keep `EBBFALL` in capitals as the mark** (variant 1: Chakra Petch 700, tracking .2em, gold),
and **give the menu title the waterline treatment** (variant 10): the word is cut at 58% of its height, gold above
the line, dim shard-teal below, with a thin teal tide line running through it. The word stands at low tide. It is
the only treatment that carries the name's meaning without touching readability or the game's voice; the caps and
the tracking match the buttons under it, and the teal links the title to the resource the game is about. See
`recommended-composite-*.png` for it on the page at both phone sizes.

On the casing:

- `Ebbfall` (2) is right for prose, the manifest, the About page, the README, where it already is. `ebbfall` (3) is
  too quiet for an RTS title.
- `eBBFall` (4): the casing itself ebbs and falls, which is a nice thought, but on the page it reads as a typo and it
  cannot be kept consistent (URL, app name, GitHub, prose all want one spelling). Not recommended as the name; it could
  live once, as a flourish on the About page, if the owner is fond of it.
- `EBB·FALL` (5) is the safe runner-up if the waterline feels like too much: the muted dot shows the two words and
  costs nothing. `EBB/FALL` (6) reads as "ebb or fall". The split weight (7) is invisible on a phone: Chakra Petch
  500 and 700 are too close. The colour ebb (8) looks like a disabled state. The typographic fall (9) and the
  spreading ebb (11) are clever once and tiresome twice. The mono underline (12) demotes the title to the tagline's
  voice.

## 3. Landing page background

Three concepts, each a mockup of the actual first page (title, tagline, the two big buttons, the FIRST GAME / HOW TO
PLAY / ABOUT row, the sound button top right) rendered at 844x390 and 667x375. All three keep the whole background
below or around the content, never behind the title or the tagline, and leave the page as uncluttered as it is now.

| | Concept | Weight | Runtime |
| --- | --- | --- | --- |
| 1 | **Tide of shards.** A dark shore. The water has drawn back to the bottom edge, leaving three tide lines and a few bare shards; a faint radial glow lifts the centre behind the title. The three lines drift 14 px over 18-29 s (transform only), still under `prefers-reduced-motion`. | ~1.5 KB of inline SVG + 6 lines of CSS | three compositor-only transforms, or none; nothing to decode |
| 2 | **Two bases across a sea.** The two factions' silhouettes on their own shores: a human Core (plinth, dome, chimneys, mast) bottom-left in gold, a Vael spire (needle, rings, stepped base) bottom-right in violet, a dark strait with one tide line between them. Static. | ~1.8 KB inline SVG | none |
| 3 | **The painted terrain, dim, at low tide.** The game's own ground tiles (from the atlas) behind a dark vignette at about a tenth of their brightness, the ether-dark water pulled back to the bottom with its wet line above it, two shard fields where the water was. Static. | 45 KB for a 256x256 tile PNG (or 0 KB: draw it from the atlas the game loads anyway, into a canvas behind the menu) + 12 KB of shard sprites | one repeating background image; trivial |

**Top pick: 1, the tide of shards.** It is the name, drawn: the water is leaving. It is the lightest, it has no
image to decode, it works on the 667x375 phone without touching a button, and it gives the page a floor without
giving it furniture. Concept 2 is a good second (it tells the two-race story) but silhouettes want more drawing time
than this to look like the real buildings, and on the narrow phone the spire is cropped. Concept 3 is the most
"game", but the texture has to be dimmed so far to keep the buttons readable that it barely registers, and then it is
not worth its bytes.

The recommended page (`recommended-composite.html`): background 1 plus the waterline title. Both use the same teal
line; the title's tide line and the floor's tide lines answer each other.

## Implementing the top picks

Icon (B):

1. Replace `public/icon.svg` with `icon-B.svg` (same viewBox, same background `<rect>`, so `tools/icons.mjs` finds
   its background colour).
2. `node tools/icons.mjs` rewrites `public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`. The maskable one
   needs no change in the SVG: the tool scales the icon to the 80% safe zone on its own.
3. `public/apple-touch-icon.png` (180x180) is not in the tool's list; add `['apple-touch-icon.png', 180, 0.8, bg]`
   to `ICONS` (iOS masks its own corners, so it wants the maskable layout) and rerun.
4. `index.html` line 14, the inline `<link rel="icon">`: replace the data URL with `icon-B-favicon.svg` (URL-encode
   the `#`s as `%23` like the current one).
5. `public/manifest.webmanifest` needs no change (same file names and purposes).

Wordmark (waterline title):

- `index.html`: `<h1>EBBFALL</h1>` becomes `<h1><span class="wl">EBBFALL</span><svg ...tide line...></svg></h1>`
  (the SVG is in `recommended-composite.html`; it is `aria-hidden`, so the title still reads as EBBFALL).
- `src/style.css`, next to the `#menuHome` rules: `#start #menuHome h1{display:inline-block;position:relative}`,
  the `.wl` rule (`background:linear-gradient(180deg,var(--ally2) 0 58%,#2c8f86 58% 100%); -webkit-background-clip:text;
  background-clip:text; color:transparent`) and the overlay SVG rule (`position:absolute; left:-3%; width:106%;
  top:0; height:100%; pointer-events:none`). The gradient-clipped text works in every browser the game supports;
  the span keeps `color` set so a very old browser without `background-clip:text` shows plain gold.
- Everything else (manifest name, About, README) keeps `Ebbfall` as it is.

Background (1):

- `index.html`: put the `<div class="bg"><svg ...></svg></div>` from `bg-1-tide-of-shards.html` as the first child of
  `#start` (before `.card.menu`), or, to keep the markup clean, save the SVG as `public/menu-bg.svg` and set it as
  `#start`'s `background-image` (then the drift animation has to live inside the SVG as its own `<style>`; an SVG
  used as a CSS background still runs its internal CSS animations in current browsers, and the service worker stores
  every file in `dist`, so nothing to register).
- `src/style.css`: the `.bg` rules, the radial gradient on `#start`, the `ebb` keyframes and the
  `prefers-reduced-motion` rule, as in the mockup's `<style>`; `.card.menu` gets `position:relative; z-index:1` (it
  already has `position:relative`).
- The other menu pages (`#menuSolo`, `#menuAbout`...) share `#start`: the shore shows under them too, which is fine
  (they are taller, and their rows sit on `panel2` buttons), or scope it with `#start:has(#menuHome:not([hidden]))`.
- Cost on a phone: one SVG of a dozen paths, three transforms animated on the compositor; no repaint of the page.
