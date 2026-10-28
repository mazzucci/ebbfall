# Ebbfall icon, second pass: a wave, not a shoe

The owner's feedback on the icon that shipped in PR #147: it looks more like a woman's shoe than a wave, and should it
sit on a round plate like most app icons do. This folder compares the shipped icon with the original concept A,
proposes four marks that read as water at a glance, settles the plate question per icon file, and holds the files to
drop in. Nothing in the repo was changed; everything was rendered with the game's headless Chromium.

## Files

| File | What |
| --- | --- |
| `png/contact-sheet.png` (`sheet.html`) | everything on one sheet: the shipped icon, the original A, the four new marks and the favicon cut at 512 (shown 128), 96, 48, 32 and 16; the maskable under a circle, a squircle and a teardrop launcher; the Apple touch icon under iOS's corners; the favicon in a light and a dark tab; each mark on a circle, the current rounded square, a squircle and no plate; each on an Android (circle launcher) and an iPhone home screen beside Phone, Messages, Maps and Camera |
| `deliver/` | **the recommended icon, ready to copy**: `icon.svg` (H on the circle plate), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (as `tools/icons.mjs` makes them), `favicon-16.svg` and `favicon-link.html` (the `<link rel="icon">` line for `index.html`) |
| `svg/icon-{G,H,I,J}-{circle,rsq,squircle,none}.svg` | the four marks on each plate (`none` = the mark alone on transparent); `cur` and `A` are the shipped icon and the original concept on the same plates for comparison; `Ifull` is I across a whole square |
| `png/icon-*-maskable-512.png`, `png/icon-*-apple-180.png` | each variant's maskable (fitted to the 40% safe zone, at most 80%, like `tools/icons.mjs`) and Apple touch icon |
| `make.mjs`, `compose.mjs`, `deliver.mjs`, `render.mjs`, `crop.mjs` | the scripts: `node make.mjs` writes the SVGs, `node compose.mjs` the per-variant PNGs and checks the safe-zone rule of `test/offline.test.js` on each, `node deliver.mjs` the files in `deliver/`, `node render.mjs png/contact-sheet.png sheet.html 1560` the sheet. They need `PATH=~/tools/bin:~/.local/node/bin:$PATH` and `LD_LIBRARY_PATH=/tmp/chromelibs/root/usr/lib/x86_64-linux-gnu` |
| `fonts/` | Chakra Petch and Share Tech Mono (OFL, copied from `src/fonts`) so `sheet.html` opens standalone |

## 1. The shipped icon against the original A

The owner is right, and the comparison says why. See the first two rows of the sheet.

**The shipped icon** (`public/icon.svg`, "A refined"): one short rise at the top left, a long fall, and a flat run-out
to the right edge, stroke 11, the shards sitting on the run-out. That silhouette is a high-heeled shoe seen from the
side: the rise and the crest are the heel, the long fall is the arch, the flat run-out is the sole, and the shards
are where the toe would be. It is a shoe at every size from 512 down to 48, and at 32 and 16 it is a gold tick / a
swoosh. Under the launcher masks (circle, squircle, teardrop) and on both home screens it stays a shoe; in the tab at
16 px it is a gold check mark with a teal dot. It never reads as water: nothing in it repeats, nothing is horizontal
at the water's height, and a single line that goes down and then flat is a profile, not a surface.

**The original A** (`/tmp/fable-brand/icon-A.svg`): two bumps, stroke 7, the shards above the line. The two bumps do
read as a line of waves at 128 and 96, but the shards above turn it into a landscape (two peaks under two suns) and at
48 and below it is the "chart" / "mountains" icon the first review called it. It is not a shoe, but it is not water
either, and it is thin at 16 px.

What the two have in common, and what the redesign drops: a single gold line as the whole mark. Water on an icon reads
through either repetition (several parallel lines) or the one shape everyone knows (a breaking wave with a hollow
under the lip). A single wavy line with nothing around it is a chart, a signature, or a shoe.

## 2. Four marks that read as water

All four keep the brand colours (gold `#f5a524` with `#ffd27a` for foam, shard teal `#4fd1c5`, dark `#0b0f16`), keep the
teal shards of the game's resource, and keep the link with the first page's three teal tide lines. Rows three to six
of the sheet.

- **G. Tide lines.** The water's edge in gold, thick, and two fainter teal marks above it where the water was, each
  shorter than the last; the shards left bare at the top. It is the landing page's three lines, in the icon. Reads
  as water at every size including 16 (three stacked lines are a texture that survives any blur), and it tells the
  ebb: the water has gone down from the upper marks. Weakness: it is the universal "waves" glyph (water utilities,
  swimming, vibration), so it is the least ownable, and at a glance it says "water", not "a wave".
- **H. Breaker.** One gold wave curling over, foam on its lip, the hollow of the barrel showing; under its lip, the
  teal shards on the shore it draws back from, and the shore line. This is the 🌊 silhouette; at 128, 96, 48 and
  under every mask it has exactly one reading, and on the Android circle beside Phone and Messages it is the clearest
  of the six. At 16 it is a gold hump with a notch and a teal dot: no longer a drawing, but nothing else either, and
  the favicon cut (last row) keeps the hollow so the hump has a shape. Weakness: at 16 it is a blob; a breaker is a
  common water mark; it says "wave" more than "ebb" (the shards and the shore line do the ebb).
- **I. Low tide.** The plate is the mark: a dark disc with the water's edge across it in gold below the centre, the
  sea under the line in dim teal, a fainter old tide mark above it, the shards on the dry side. The best telling of
  the name (the level is low, the old mark shows where it was), the most "app icon" of the four, the one that gives
  the plate a reason, and it holds at 16 (a gold wave line across a dark disc with teal under it). Weakness: it is a
  disc, so under a circle launcher or iOS's corners it has to either be cropped (its sea across the whole square:
  row "I full bleed", which fails the safe-zone test as written, because the sea is outside the 40% circle) or sit
  as a disc inside the launcher's shape (the "I" row: a dark ring around it in the circle, a disc in a rounded square
  on the iPhone). The first looks best but needs a second rendering of the mark and a different test; the second
  looks like a sticker.
- **J. The curl.** The shipped icon's stroke style, but drawn as a wave: one stroked line rising and curling over
  into a spiral, no flat run-out, the shards under the lip, the shore line below. Reads as a wave at 48 and above and
  under the masks; it is the one closest to what shipped. Weakness: at 32 and 16 the spiral closes and it is a gold
  hook (a fiddlehead, a 6); without the shore line a stroke that rises and curls can start down the shoe road again.

**Pick: H, the breaker.** The owner wants it to read as a wave at a glance, and H is the only one of the four with a
single reading at every size that matters on a phone (48 to 128) and under every mask. G is water but generic; I is the
richest story but costs a pipeline change for a result that is a disc in a circle; J is a wave at 48 and a hook at 16.
H's weakness at 16 is answered by the favicon cut, and its "wave, not ebb" is answered by the shards and the shore line
under the lip: the water has pulled back from them.

## 3. The plate

What each surface does with the files, and what follows:

| Surface | File | Cropped? | Plate |
| --- | --- | --- | --- |
| iPhone home screen | `apple-touch-icon.png` (180) | iOS rounds its own corners (~22%), no transparency | none drawn: the full square is the plate. `tools/icons.mjs` already draws the icon at 80% on a flat `#0b0f16` square |
| Android home screen, app switcher | `icon-maskable-512.png` | the launcher's mask: circle, squircle, teardrop | none drawn: the full-bleed square is the plate, the mark keeps to the 40% safe zone (the test checks it) |
| Chrome's install dialog, the desktop shortcut / taskbar / dock, Android's install prompt | `icon.svg`, `icon-192.png`, `icon-512.png` (purpose `any`) | **not cropped** | **this is where the drawn plate matters** |
| Browser tab, bookmarks, history | the inline favicon (`index.html`) | not cropped | same |

So the question is only about the uncropped "any" icon and the favicon, and there the answer is: yes, a plate, and a
**circle**. Reasons: on a phone, where the game is played, the icon is a circle anyway (most Android launchers), and the
same disc then appears in the install prompt, the tab and the home screen; on the desktop a round icon sits fine among
Chrome, Spotify, Slack; the current rounded square (`rx 12/64`, 19%) is a near-iOS shape that iOS never actually uses
(it crops its own) and that looks like an unmasked Android icon everywhere else. The sheet's PLATES section shows each
mark on a circle, the rounded square, a squircle and nothing: H works on all three; on none it loses the dark ground
the gold needs on a light tab bar. A squircle would also be fine (the same `<rect>` with `rx` 20); the circle is the
decisive choice because it matches what the launcher does to the maskable.

The plate is **solid** `#0b0f16`, not a gradient: `tools/icons.mjs` finds the background colour in the first
`<rect fill>`, builds the maskable by drawing the icon on a square of that colour and counts every pixel of another
colour as content that must fit the safe zone, and `test/offline.test.js` requires every pixel outside the 40% circle
to be exactly that colour. A gradient plate would either be scaled down inside the maskable (a disc in a ring) or
fail the test. Solid is also what the theme colour and the first page's floor are.

The plate is written as `<rect width="64" height="64" rx="32" fill="#0b0f16"/>`, a circle that the tool's and the
test's `<rect ... fill="#......">` regex still find, so **neither the tool nor the test needs a change**.

## 4. Recommendation per file, and what to replace

| File | Recommendation | From |
| --- | --- | --- |
| `public/icon.svg` | H on the circle plate (`rx 32`), 64x64 viewBox | `deliver/icon.svg` |
| `public/icon-192.png`, `public/icon-512.png` (purpose `any`) | the same, rasterised: the disc with transparent corners | `node tools/icons.mjs` (or `deliver/icon-192.png`, `deliver/icon-512.png`) |
| `public/icon-maskable-512.png` | the mark alone on the full-bleed `#0b0f16` square, fitted to the safe zone (the tool fits it at 0.77: the disc plate is the background colour, so only the mark counts); passes the test | `node tools/icons.mjs` (or `deliver/icon-maskable-512.png`) |
| `public/apple-touch-icon.png` | the mark at 80% on the full square, iOS rounds the corners | `node tools/icons.mjs` (or `deliver/apple-touch-icon.png`) |
| `index.html` line 14, `<link rel="icon">` | the 16x16 favicon cut: the breaker with its hollow, one shard, the shore line, no foam, on an `rx 8` disc | `deliver/favicon-link.html` (the whole line) |
| `public/manifest.webmanifest` | no change: same file names, sizes and purposes | |

Steps:

1. `cp /tmp/fable-icon2/deliver/icon.svg public/icon.svg`
2. `node tools/icons.mjs` (rewrites the four PNGs; it will report the maskable at 0.77). The PNGs in `deliver/` are
   the same images from the canvas encoder, for looking at; the committed ones should come from the tool so that the
   art's own PNG encoder writes them as before.
3. Replace line 14 of `index.html` with the line in `deliver/favicon-link.html`.
4. `npm test` (the safe-zone test passes: checked here with the same rule on `deliver/icon-maskable-512.png`, 0 pixels
   outside the 40% circle that are not the background).
5. Nothing else: the manifest is unchanged, so the service worker's file list is unchanged; the PNG bytes change, so
   the precache refreshes with the next version as any changed file does.

If the owner would rather have I (the low-tide disc), say so and the cost is: a second SVG (`Ifull`, the sea across
the square) for the maskable and the Apple touch icon, `tools/icons.mjs` reading two sources, and the safe-zone test
replaced by one that checks that nothing but the sea and the line is outside the 40% circle. It is a nicer icon on the
home screen than its "disc in a ring" rendering on the sheet, but it is an afternoon of pipeline for a story that H
tells well enough with its shards.
