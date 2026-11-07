# Ebbfall's look: the style sheet

The sea has ebbed and left a country of salt; two peoples fight over it. Every sprite is a lit 3D model (three.js,
`tools/render3d`) shot by `scene.js` at 4x, finished (hard cast shadow, ink on silhouettes and sharp edges, a contrast
S-curve, 5-bit banding) and packed at 2x the game's units. The banding and the ink are the retro part; the materials
are the "not drawings" part. Nothing here is a flat fill, a cartoon outline or a brush stroke: form shows by light on
material, wear sits on edges, and every unit casts a real shadow.

Step 0 (the slice) set this sheet with six models: the Rigger, Picket and Lighthouse (`harbour.js`), the Glint, Lens
and Tidewell (`vael2.js`), plus the seabed (`tools/art/terrain2.js`) and the salt field (`ground.js saltField` since step 1).
Later makers build from it; where a later model needs a material that is not here, add it to `materials.js` /
`vael.js makeVaelMats` and to this sheet in the same change.

## The ground

The drained seabed: wet sand and slate, salt crust in faint pale veins, kelp drying in dark patches. It is the darkest
thing on screen: mean value about 0.18 (sRGB 45-55), nothing on it brighter than the dim salt (sRGB ~140) and that only in
thin lines. Palette (`terrain2.js`): sand `[58,54,47]`, wet sand `[44,42,38]`, slate `[40,44,50]`, salt `[142,140,130]`,
dim salt `[96,95,88]`, kelp `[36,29,21]`, dark kelp `[23,19,14]` (brown-black, olive at the edge, never green: round 3's
green kelp doubled as the old seep). The bases (`ground_0..7`, most of the map): sand with
slate showing through, soft ripples bent by noise (no direction may show at 2x), a low slate ridge as a contour, and
faint pale salt veins, each base its own; the marks (`ground_8..19`) a kelp patch each, every one its own size, turn
and mirror, lying in clusters with bare ground between and never in the water (step 1: "The ground and the scenery"
below). The renderer picks them through
`src/client/gl/ground.js`. All base noise is periodic over the 64 px tile (scale x period = 64) so tiles seam; what is a
variant's own (veins, marks) fades out at the tile's edge. The rock plateaus are dead reef (step 1): a bleached lip, a
pitted grey-brown top, a dark layered face on every edge.

The salt (`shard_0..3` and their variants `shard_k_1..3`, over the client's crust, `src/client/gl/crust.js`): each clump
of salt nodes is one outcrop, a single pale bed of salt crust with crystal clusters of mixed sizes standing on it ("The
salt works" below). Salt is pale but the crust under the units' paint and the crystals' lit tops no brighter than
before (they peak near 230 sRGB, a few facets); it carries no light. The four stages differ by shape: standing
clusters, fewer and lower clusters, flat broken slabs, a small dark pit with a pale rim.

## The Harbour (sim race `humans`)

Dark hulls of tar and iron under pale canvas; timber, rope and brass only on small tips. A Harbour thing is a dark
body with a pale top: in greyscale it parts from the Vael (pale body, dark core) by that alone.

### Materials (`materials.js makeMats`)

| key           | what                          | three.js                                                                                   |
|---------------|-------------------------------|--------------------------------------------------------------------------------------------|
| `tar`         | tarred hull planking          | Standard 0x4a4542, map `tarTex` (plank seams, worn tar), bump 1.6, metal 0.3, rough 0.5    |
| `ironDark`    | black iron: bands, fittings, barrels | Standard 0x2c2e31, map `panel`, bump 0.8, metal 0.85, rough 0.5                     |
| `oilskin`     | coats, boots, hoods, ink edges | Standard 0x24262a, metal 0.2, rough 0.6                                                   |
| `canvas`      | pale canvas: hats, awnings, sails, cones | Standard 0xd4ccb6, map `canvasWeave` (weave, stains, stitched seams), rough 0.92 |
| `canvasDark`  | a hat's underside, old sailcloth | Standard 0x8f8872, map `canvasWeave`, rough 0.95                                        |
| `timber`      | handles, masts, jetties, keels | Standard 0x7a5b3a, map `grainTex`, rough 0.8                                              |
| `timberPale`  | timber pale enough to read at 18 px (unused since step 1: a pale part of a Harbour unit is canvas, which keeps its value in the gold seat) | Standard 0xb09468, map `grainTex`, rough 0.75   |
| `rope`        | coils, lines, lashings        | Standard 0xc8b48a, bump `ropeBump` 1.2, rough 0.95                                         |
| `brass`       | small tips only: a pick's points, a muzzle bead, the lamp's cage and finial | Standard 0xc49a3c, metal 0.95, rough 0.28 |
| `sandbag`     | (the round-2 parapet; round 3's ring uses `sandbagPale`/`sandbagShade`, see Harbour infantry): wet grey-brown, mid value (dark bags vanish on the ground, tan ones merge with gold) | Standard 0x7a7264, map `burlapTex`, rough 1 |
| `slate`       | kerbs, plinths, the salt field's bed | Standard 0x3e4247, rough 0.9, flat shaded                                           |
| `flagstone`   | a quay's paving               | Standard 0x565b60, map `flagTex` (courses of stones, damp), bump 1.2, rough 0.88           |
| `inkLine`     | the black ring either side of every team band | Standard 0x08080a, rough 0.8                                              |
| `lanternPane` | the lantern room's panes, see-through | Physical 0xf0e8d0, transparent, opacity 0.15, rough 0.1, no depth write              |
| `lampHot`, `lampCore`, `lampAmber`, `lampHalo`, `lampHalo2` | the lantern's lamp, its near-white core on the south face, the core's tight amber halo and the warm halo: the brightest Harbour pixel | Standard 0xfff8e0 emissive 0xfff2c0 x 6; Standard 0xffffff emissive x 8 (not tone-mapped); Basic 0xffb040 additive 0.45; Basic 0xffd080 / 0xffb860 additive, opacity 0.22 / 0.1 |
| `canvasShade`  | canvas a band below pale: the lantern's cone under the lamp | Standard 0xb4ac96, map `canvasWeave`, rough 0.94                                   |
| `slateLit`     | a kerb's lit top edge         | Standard 0x737a80, rough 0.85, flat shaded                                                 |
| `lanternGlass` | pale warm glass, opaque (unused by the Lighthouse, kept) | Standard 0xe6dcc0, emissive 0x9a8650 x 0.55                                  |
| `paintCanvas` | **team paint on cloth** (matte) | Standard team colour, map `canvasWeave`, rough 0.88, metal 0.02; `team()`               |
| `paint`       | team paint on iron (the older units) | Standard team colour, map `panel`, metal 0.55, rough 0.32; `team()`                 |
| `white`       | the one lamp                  | Standard 0xfff4d0, emissive 0xfff0c0 x 2.4 (not team)                                      |

Palette (hex, as the finish shows them): tar 0x24211e, iron 0x25272a, oilskin 0x1c1e22, canvas 0xd8d0ba, canvas in
shade 0x8c8670, timber 0x6e5234, pale timber 0xa88a60, rope 0xc0ac80, brass 0xb8903a, sandbag 0x6e6758, flagstone
0x4e5358, lamp 0xfff4d0, lantern glass 0xe0d6b8.

### Value rules

A Harbour unit is dark (coat, hull: value 0.10-0.15) with one pale top (hat, canvas, coil: 0.75-0.85); the one
exception is the Mender, whose coat is ash sailcloth (0.6, a band below its hat, far above tar) so that "the pale one is
the medic" (rounds 3-4 of the infantry). Keep the mid
greys for timber and rope only, in small amounts. The ground sits under both (0.18) so the dark body still parts from
it by the hard shadow and the ink, and the pale top by value. Seat 0's gold must never sit next to brass: brass is only
on a tip (a point, a bead, a finial), never a band or a plate.

### Team colour

Team paint is matte canvas (`paintCanvas`). It goes on at least a sixth of what the camera sees (measured by
`tools/art/review.mjs`, mask pixels over solid pixels, facing 0), and never only on the signature shape, and never as
a flat shape on a building's ground (a painted ring on the quay read as a decal; the dug-in Picket's groundsheet, a
half disc of cloth behind its parapet between ink hems, is the one flat team shape, and it is the unit's). The family trait: **team canvas sleeves** on
every Harbour figure, plus a team band round the Picket's hat crown (the brim and crown top stay pale) and a narrow
pack on the back (nothing wide across the shoulders: a bedroll made the Picket read as a broader Harpooner); the
Rigger's yoke, apron and sack ties (see "Harbour infantry" below). The Lighthouse: the 18-unit band under the
gallery and the gallery's deck, canvas panels on the hull roof alternating pale and team at equal width, the house's
south end wall and porch, one of the awning's two stripes, a thin band on a raised stone kerb, crate tarps, mooring
posts' tops, a pennant. Every team band sits between two `inkLine` rings or hems (0.5 units, pure black: the finish
keeps them), so a pale seat's paint (seat 6's white until step 2; lilac now) parts from pale canvas.

### Shape language

- Infantry: a round hat, and every figure upright (a level gun or a low load read as a figure lying prone). The
  Picket's canvas hat (brim r 4.4, crown r 3.1, a dark line under the brim) is the pale disc from above, with a thin
  rifle angled up ahead. Slim: nothing wide across the shoulders. Each kind must own an outline at 18 px, not only a
  colour: the Rigger, Picket, Harpooner and Mender as built are in "Harbour infantry" below.
- Vehicles: boxes and hulls (an upturned hull is a roof, a box is a cab or a crate).
- Flyers: triangles and sails.
- Buildings: the same hulls and boxes on a slate quay; a Lighthouse tower is a tarred cylinder with iron bands.

### Scale by role (sim radius, world px)

Worker 9 (the Rigger, scale 0.95, ~15 tall), line 10-11 (the Picket, 1.08, 20 tall with the hat; the Harpooner and the
Mender, 1.08), heavy 14-15,
capital 18. A figure is ~6 wide at the shoulders; a hat may reach r 5.

### Lights

Few and small: the Lighthouse has one lamp (`lampHot`, r 4.8, its core `lampCore`) in a brass cage; the Mender's hand
lamp (r 1, `lampSmall` in harbour-infantry.js) is the one light on a unit.
Nothing emissive on the Harbour is team-tinted.

### States

Shown on the sprite itself, by pose frames (`src/client/look.js UNIT_POSE`): the Picket dug in = kneeling in a ring of
pale sandbags open at the back (step 2, round 3: see "Harbour infantry"; the round-1 crescent parapet read as a
machine's body, and the round-2 brown one vanished at phone size); frame 2 while going to ground, frame 3 dug in. Beached / anchored (the machines, "Harbour machines" below): the same pattern, a pose
frame with a visible fixture on the ground (the hull down and spades out; a dropped anchor and a taut line), never a tint.

## The Vael (sim race `vael`)

Pale pearl shells on an ink core, with violet-blue "deeplight" in a few small lights. A Vael thing is a pale body with
a dark heart: the opposite value order to the Harbour.

### Materials (`vael.js makeVaelMats`)

| key                    | what                            | three.js                                                                                  |
|------------------------|---------------------------------|-------------------------------------------------------------------------------------------|
| `shell`, `shellLight`, `shellDark`, `shellDeep` | pearl ceramic: body, top plates, undersides, crevices | Physical 0xcbc2b1 / 0xdad2c2 / 0xa39a8b / 0x7e766c, map `pearl`, clearcoat 0.5 |
| `ring`                 | polished pearl rims             | Physical 0xd6cfc0, clearcoat 0.8, metal 0.2                                                |
| `ink`                  | **the ink core**: black glass bellies, discs, drums | Physical 0x0f0d16, metal 0.45, rough 0.14, clearcoat 1                   |
| `inkSeam`              | ink edges round team glaze      | Standard 0x15121c, rough 0.5                                                               |
| `glaze`, `glazePlain`  | **team glaze**                  | Physical team colour, clearcoat 0.9, iridescence 0.3; `team()`                             |
| `deeplight`            | a small light (r 1.2-1.6 on a unit, in an ink socket on the Glint's crown) | Standard 0x2a3290, emissive 0x7080ff x 1.9  |
| `deepCore`             | its white heart                 | Standard 0xc8d0ff, emissive 0xdde2ff x 1.1                                                 |
| `deepHalo1..3`         | its falloff                     | Basic 0x6a7cf0 / 0x5a68e0 / 0x4c58c8, additive, opacity 0.18 / 0.09 / 0.045                |
| `pool`, `poolDeep`     | a pool of deeplight             | Standard 0x0c1024 emissive 0x1a2260 x 0.3; 0x06081a emissive 0x121848 x 0.2 (dim, navy-ink, pearl ripple rings) |

Palette: pearl 0xd8cfbf, pearl in shade 0x9a9284, ink 0x0c0a12, deeplight 0x7080ff (its heart 0xdde2ff), pool
0x161c48, team glaze = the seat colour with a sheen.

### Value rules

A Vael unit is pale (0.8-0.9) with an ink core (0.05) showing beneath or inside. Deeplight stays small and blue-violet,
value about 0.5, so it never outshines the pearl or the salt. The pool is a dim surface (0.15), not a lamp.

### Team colour

Team glaze between `inkSeam` edges (a seam ring, a hem bar, an end cap), so a pale seat (seat 6's white until step 2, seat 3's lilac) parts from
the pearl and the deeplight. At least a sixth of the footprint, never only on the signature: the Glint's one smooth
dome on the back inside one ink seam plus the collar on its tail; the Lens's two rim arcs plus the three pods under
the rim; the Tidewell's three ring arcs plus the pylons' inner faces and caps.

### Shape language

- Workers: drops. The Glint is a fat pearl drop (`shellLight`, pale from above: its ink belly is tucked under the head, seen from the side only, since a belly showing from above made it a dark blob, the Undertow) with a blunt tail (7 long, a team sleeve on its aft half and a pearl knob at its end), one deeplight (r 1.2) on the crown ahead of the team dome with
  a pale heart; under its bow two small ink claws hold its load, a cube of salt (5.4 across, a smaller cube grown on
  it, `vael2.js` salt 0x9c968a flat-shaded, a band below the pearl, no light): the worker's cue no other unit has, as
  the Rigger's sack (step 2, round 3: the plain round drop read as a soft healer, the Tender, 2 of 4 testers in two
  rounds); it hovers low with its shadow right beneath it. Round from above: a drop drawn to a point read as a
  flying dart. Its team glaze is one smooth dome on the back inside one ink seam, and a sleeve on the tail: never a
  band across the body (bands with seams read as palings or a blade at 18 px).
- Fighters: blades and discs. The Lens is an ink-glass disc (r 7.6, the glass big and dark: the one "eye") in a narrow pearl rim (r 7.9, tube 1), the light in the middle, a thin
  pearl ring etched in the glass: from above a dark hollow with a bright centre, never the Glint's solid pale drop. Inside
  each team arc, past its ink seam, a pearl keyline on the glass (r 6.1, tube 0.5), so the team band has a light edge
  against the black in every seat (seat 1's magenta went mid-grey on the black disc under protanopia).
- Support: flowers. Heavies: spirals.
- Buildings: rings, pools, pylons on a three-lobed plinth. The Tidewell is a pearl ring round a pool on a ribbed ink
  drum, three short lit sluice channels from the pylons' feet into the pool that stop well short of the centre (no
  hub: spokes to a centre read as a badge, an open pool as an eye), broad-footed pylons.

### Scale by role

Worker 9 (the Glint, 10 across, hovers at 5), line 10-11 (the Lens, rim r 7.6, hovers at 9; a Lens is no bigger than a
Picket), heavy 14-15, capital 18.
Everything hovers; the shadow under it says how high.

### Lights

One deeplight per unit (r 1-1.5 with halos). The Tidewell: three small lights adrift on the pool and one on each
pylon's cap; the pool is dim. Lights never compete with the selection ring or the salt.

### States

By pose frames as the Harbour's (`UNIT_POSE`): a settled Vael shows a visible fixture (anchor lines of light to the
ground), never a brighter glow.

## Shared rules

- Camera and light: `scene.js` (55 degrees elevation, sun from the north-west, rim from the south-east). Models are
  built in game units (1 tile = 32), units face +x, y up, +z south.
- Each unit's cell (`r`, `h` in its table entry) must hold every facing and frame, the dug-in ring included.
- The finish needs a luminance step of 22% to draw ink: put an `oilskin` / `inkSeam` edge wherever a pale thing meets
  a pale thing (team band on canvas, glaze on pearl).
- Team masks (`<name>_m`) come from the materials marked `team()`; lamps are not team on the new look.
- Check every change with `node tools/art/review.mjs <dir>`: the contact sheet, the phone sheets (grey, protan,
  deutan), the blind set and the battle stand-in, and the printed team shares (1/6 is the floor).

## Vael units (step 1, `vael-units.js`)

The six units after the slice, built on the Vael rules above: pale pearl on an ink core, one small deeplight each
(r 0.7-2), team glaze between ink seams on at least a sixth of the footprint and never only on the signature. The
Lens kept its slice shape with a bigger, darker glass and a narrower rim (r 7.6); the Glint (`vael2.js`) got a longer tail with a team sleeve and a pearl knob, because
in the white seat a short tail left a round eye that read as the Lens. Everything hovers; the shadow says how high.
Round 1's blind test read a slim leaf as a boat's hull, a small pointed flower as a star, a dark leaf as a Harbour
craft and a barge with a big coil as a Conch: hence the shapes below.

| kind (key)             | signature shape, from above          | size (sim r)           | team glaze                                         | the light          |
|------------------------|--------------------------------------|------------------------|----------------------------------------------------|--------------------|
| Needle (`scythe`)      | a sickle, point first, all pale (the brief's "slim blade" read as a boat's hull; an ink spine made it the Undertow): a pearl blade curved on an arc (R 13, 110 degrees), 4.8 wide at the heel drawn to a keen point, a lighter ridge along the outer edge, a hairline of ink along the inner one, a pearl keel beneath | line (10), hovers at 6 | a band across the blade's heel and the handle trailing from it, both between ink seams | in the eye of the needle, a pearl loop at the handle's end |
| Tender (`halo`)        | a round flower, 23 across: six broad round petals (`roundPetal`: narrow at the root, a round lobe at the tip) cupped up, notched between their lobes, each pearl one with a lighter face and a short vein; its heart a cup of five small aqua-glass petals (`aquaGlass`) inside an ink ring. Never pointed petals (step 2, round 3: six narrow pointed petals read as a star, a sparkle, the Glint) and never a disc (petals that touched read as the Lens) | support (9), hovers at 7 | every other petal (three, each inside an ink seam: two opposite ones made a bar through the heart at 1x) and a band round the ink calyx beneath | the one aqua light (r 2.4, `aqua` 0x12b898 emissive x 1.0, a small aqua-white heart, two close aqua halos; in `vael-units.js`: x 1.25 of 0x18d8b4 with wide halos clipped to white), never violet: a mender, not a weapon |
| Conch (`monolith`)     | a spiral: a pearl shell of two and a half whorls, apex up, on an ink disc with a pearl rim; the mouth an ink aperture facing the bow (the muzzle) | heavy (15), hovers at 3 | a ridge coiling along the whorls' shoulder between two ink-seam coils, and the mouth's lip | deep in the mouth |
| Undertow (`umbra`)     | the one ink-dark Vael: a low leaf blade with a swept leading edge, matte black glass (`inkMatte`) on a thin pearl plate (`ring`, 0.6), so the rim is a line from above and the edge-on blade is ink (a thick plate read as a pale spindle, the Needle) | line (10) | the hilt on both faces and a slim grip round it, between ink seams; lurking, a team dot on the pommel | at the pommel (r 1.2 gliding, 0.7 lurking); gliding, a thin line of deeplight down the leading edge |
| Petrel (`shrike`)      | a gull: two pearl wings curved only at the root (the leading edge bowed forward, the trailing edge hollowed) and straight-swept outside it, on a pearl body 13 long riding above them with a head forward, ink beneath (a straight chevron read as a Harbour Kite; a crescent all along read as the Needle's sickle) | flyer (11), flies at 20, its shadow well offset | both wingtips behind a full ink seam across the wing, and a cap on the pod's back | at the tail |
| Argonaut (`sovereign`) | a long barge, length before all: a pearl hull 44 long and 17 wide, bow at +x, an ink underside, pearl shell ridges along both gunwales; a small coiled shell over the stern; a lantern at the bow | capital (18), hovers at 4 | the deck well, a low team dome with an ink hem; the shell's ridge; the lantern's foot ring | the lantern: a big deeplight (r 2) on a short post under a pearl hood, no cage (a cage read as a gun barrel) |

Shapes against each other: the Needle is a pale sickle, the Undertow a dark leaf (the PRD's one exception to the
pale-on-ink value order, kept legible by its pearl rim, its lights and its hard shadow); the Tender is a round six-petal
flower with an aqua heart where the Lens is a dark disc and the Glint a tailed drop carrying a cube of salt; the Conch is round where the Argonaut is long; the
Petrel is a gull (a body on swept wings), the only thing with its shadow apart from it.

States: the Undertow glides canted on its edge (frames 0-1, the face leaning to the south, hovering at 3, its edge and
tail lit) and lies flat on the ground when it lurks (frame 2: `UNIT_POSE.umbra`, shown while the snapshot's `cloaked`
is set: the same blade, kept dark). The Petrel has one frame (a glider, `UNIT_FPS` 0); the Argonaut four (a slow bob,
`UNIT_FPS` 4); the others two (a bob).

## Harbour infantry (`harbour-infantry.js`)

The sailor (`sailor`): an oilskin coat (tar, or `coat` given) with a flared skirt, an iron belt, a hood, sea boots;
two stride frames or kneeling. The Picket, the Harpooner and the Mender wear the family's round canvas hat (`hat`:
pale brim and crown, the team band round the crown between two ink rings, a dark line under the brim; brim 3.8-4.5,
crown 2.8-3.1 by kind); the Rigger a dark tar cap. Every kind has team canvas sleeves. Each owns an outline at 18 px,
and every figure stands upright (round 1's level harpoon gun made the Harpooner read as lying prone; round 2's
hand-barrow made the Rigger, the one low shape left, read the same). Step 2's whole-set test read the four as "the
same white hat on a team blob" and swapped them by size: since round 3 each carries one **signature bigger than its
hat**, never another white dot:

- **Rigger** (harvester, scale 0.95): the smallest figure, the one that **carries things**: a fat lumpy pale salt sack
  slung across the back over the left shoulder (a slant in every facing, its left end forward, held there by the left
  hand; its bunched ends draped down; two team cords between ink rings), the body leant forward under it; a short
  pick with a salt-pale head low in the right hand. A **dark tar cap** with a team band, no pale hat: the sack is its
  one pale mass. A team waistcoat back under the sack, a team apron. From above: a slanted pale bolster beside a small
  dark head. No cart.
- **Picket** (trooper, 1.08): a pale disc with a thin bar angled up ahead: the rifle's stock and muzzle wrapped in
  pale canvas round a thin dark barrel (r 0.62), a brass bead; a narrow team pack behind. Pale timber on the stock
  was seat 0's own hue and the rifle vanished in gold: a pale thing on a Harbour unit is canvas, not timber. The
  plain rifleman. Dug in (frames 2, 3; `UNIT_POSE`): kneeling, the rifle still thin and angled up, inside a **ring of
  pale sandbags** (`sandbagPale`, every third `sandbagShade`, each on an ink foot; R 8.4, eleven of twelve places,
  the gap behind; five round the front while settling) on a whole team groundsheet disc inside an ink rim. The ring
  is the state's signature: round 2's brown bags vanished on the seabed and the dug-in Picket read as a Mender or a
  Harpooner.
- **Harpooner** (lancer, 1.08): **the longest thing in the infantry**, past the body at both ends: the harpoon gun
  shouldered and angled up ahead (0.46 rad), a long butt wrapped in team canvas well behind the back with an iron
  heel, a team grip and breech wrap between ink rings, a thick tube (r 1.75) served with pale canvas, a fat **drum of
  pale line** (`ropePale`, five turns round the tube between ink discs) ahead of the hands, an iron muzzle ring, the
  harpoon's thick pale shaft (r 0.8) with a dark cork float and a big brass head with barbs (brass on the tip only).
  The shaft, float and head cast no shadow (`userData.noShadow`, read by `scene.js`). No hip coil (the line is on the
  gun). From above: a pale disc on a long thick pale bar with a knot in it and a barbed tip. Team: the sleeves, the
  hat band (2.7), the pack, the butt, the grip and the breech.
- **Mender** (medic, 1.08, unarmed): **the palest-bodied Harbour human**: an ash sailcloth coat (`ash` 0xaaa696)
  under a hat with a tall crown and a narrow brim, an ink belt, and on its back a big **cream satchel** (`satchel`
  0xe8e0c8, never team; 5 x 7 x 7.6) with a **dark ink cross** on its lid, its back and both ends (a cross shows in
  every facing), ink hems at its lid and foot; two team straps over the shoulders, a tall team hem round the skirt,
  and a small warm **lamp** (`lampSmall` r 1 with a `lampCore` heart, in a brass cage) carried low in the right hand
  at the hip. From above: a pale disc beside a pale square with a dark cross. Round 2's dark satchel with a team
  cross was too small to read at 18 px.

Cells (`main.js`): Rigger r 12 h 18, Picket r 17 h 20, Harpooner r 29 h 31 (round 3: the longer gun, its tip about
27 ahead and 26 up), Mender r 15 h 21. Team shares at facing 0 (round 3): Rigger 0.169, Picket 0.173 / 0.255 dug in,
Harpooner 0.199, Mender 0.188. The pack: `node tools/art/review.mjs <dir> --family=hinf`.

## Harbour machines (step 1, `harbour-machines.js`)

The three vehicles after the slice, on the Harbour rules above: boxes and hulls, a dark tarred body under a pale
canvas top, team paint as matte canvas between ink lines on at least a sixth of the footprint and never only on the
signature, timber and rope in small amounts, brass on a muzzle ring only, no lights. Each kind owns one cue a stranger
names at 20 px, and the three never differ by size alone: legs under a pointed hull, a long bar ahead of a box, round
wheels under a drum. Round 1's blind test passed (90%) but the judge failed the team colour: a canvas awning over the
whole deck inside a hairline team rim made the Breakwater "a pale egg on stilts" (a Rigger to one tester) and the rim
vanished in seat 6. Round 2's rules: the hull shows dark, bow and stern, in every facing; the canvas is a tarp over
midships only; team paint has a real area (a quarter), on the hull's sides and on cloth, inside ink; legs are dark iron
with team pads (pale shins read as a second pale mass in grey). The maker's rounds also taught: three bands across a
tarp (pale, team, pale, with hoops) read as stripes, an insect: a tarp is two-tone at most; team knee caps above the
gunwale read as antennae; a team deck alone on a carriage under a hood and a gun was 0.07 of the footprint.

| kind (key)                  | signature shape, from above                                                                                                                                                       | size (sim r)   | team paint                                                                                                   | the pale top                                     |
|-----------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------|--------------------------------------------------------------------------------------------------------------|--------------------------------------------------|
| Breakwater (`vanguard`)     | the boat hull on legs: a tarred hull 29 long with its stem ahead, plank seams and iron straps on its bare bow and stern decks, an iron gunwale, a canvas tarp humped over midships (two-tone: pale forward of an ink bar, team aft of it, a rope hoop and a ridge seam on the pale part, a dark worn hem), four dark iron legs standing under it, a short mortar on the stem | heavy (14), the hull 8 up on its legs (cell r 22: the spades and legs splay past 17) | the strake along both hull sides (3.4 tall) between ink lines, the aft half of the tarp, the aft deck inside an ink seam, the knee caps and the foot pads' tops | the forward half of the tarp                     |
| Anchor Gun (`siegeTank`)    | the long gun: a 21-unit tapered iron barrel on trunnion cheeks forward of a tarred carriage between iron-shod timber runners on six spoked wheels, a low canvas hood on rope hoops over the crew at the stern | heavy (14), the muzzle reaches 24 ahead, the dropped anchor about 29 astern (cell r 31) | the carriage's whole deck inside an ink hem, the hood's two end caps inside an ink rim, the six wheel discs inside their iron tyres, a band round the breech | the hood (r 4.6, 12 wide) |
| Netter (`interceptor`)      | the box with a net: a tarred box on four big cart wheels (pale timber discs in iron tyres), behind the cab the folded net on a reel, a fat drum of pale rope wider than the box between pale timber end discs with cork floats in two rows, its mesh hanging down the tail; on the cab roof a twin flak mount, two fat tubes well apart angled up 52 degrees on one cradle (short and steep, never the Anchor Gun's long level bar) | line-heavy (12; cell r 14, the reel 15.8 across) | the whole long sides of the box and the cab's roof, between ink lines; a strap over the mount's cradle    | the net reel and the wheels' discs               |

States, by pose frames as the Picket's (`UNIT_POSE` in look.js: `vanguard: { walk: 2, swap: 2, on: 3 }`, added for
the Breakwater; the Anchor Gun keeps `siegeTank`'s row): the Breakwater beached (frame 2 settling: the hull half down,
the legs folding, the spades swinging out; frame 3: the hull down on the sand, the legs crouched tight under it, four
spades out either side, each a timber shaft from the gunwale with a broad pale timber blade and an iron edge lying on
the ground); the Anchor Gun anchored (frame 2: the gun rising, the anchor swinging down off the stern on its hawser;
frame 3: the gun raised 26 degrees and an anchor dropped on the sand astern, a pale timber stock across its ring, a
pale hawser taut from the stern post). Travelling, the anchor is lashed on the hood. The Netter has two frames (the
wheels turn). A fixture on the ground, never a tint, as the sheet says.

## Harbour air (step 1, `harbour-air.js`)

The three flyers after the slice, on the Harbour rules above: triangles and sails, a tarred hull or frame under pale
canvas, team paint as matte canvas between ink lines on at least a sixth of the footprint and never only on the
signature. Every flyer casts its shadow well apart from it, as the Petrel does (the sun from the north-west lands the
shadow of a thing at height y about 0.4 y east and 0.3 y south of it). The frames on the sails (spines, yards, spars,
masts) are tarred dark (`oilskin`, `tar`), not timber: a timber triangle round a sail read as brass beside seat 0's
gold. Lights: one small stern lantern on the Windjammer (`white`, r 0.8), none on the others. One frame each: gliders
(`UNIT_FPS` 0; the client's slow swell moves them). Rounds 1 and 2 of the blind test read a small pale balloon, even
over a dark gondola, as a Rigger on the ground (a pale disc on a small unit is a hat or a head, and testers ignore
the shadow): a small flyer needs a silhouette that cannot be a figure, so the Spyglass is an airship.

| kind (key)             | signature shape, from above                                                                                                                                                                                                                              | size (sim r), height | team paint                                                                                                        |
|------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------|-------------------------------------------------------------------------------------------------------------------|
| Kite (`raider`)        | one filled triangle sail, point first (18 long, 19 across), nose up, in two panels folded up to the tips (one takes the sun, the other its shade; `sail()` `half`, dihedral 0.22), a dark spine down the keel and dark spars along the edges, the pale panel a band below pale canvas (`canvasShade`, so seat 6's white panel parts from it in grey), worn darker along its edges (`canvasDark`); a tarred pod 7 below on a bridle, hung forward so its dark bow shows under the apex, a lookout and a bolt-thrower at its bow; a kite's tail: a line trailing aft and down with three team bows on it (a dotted tail at phone size) | line (10), flies at 17 | the whole starboard panel behind an ink seam along the keel, the three bows on the tail, the pod's flanks between ink lines |
| Spyglass (`observer`)  | a small airship: a cigar-shaped canvas envelope (13 long, 6.6 across, nose at +x, a sphere laid along x) with three team stripes along its length (the top and both upper flanks, 1.5 wide) between ink seams and a rope girdle; three fins at the stern (two out to the sides in `canvasDark`, one up, dark); a tarred gondola (7.2 x 2.8) slung under it along its length on four struts, a lookout, a short thick dark telescope out of its bow angled down and to starboard (a dark stroke breaks the silhouette in every facing), a brass bead at the tip only. No sails, no hull on top; smaller than the Kite; its shadow a cigar far from it | scout (8), flies at 26 | the three stripes, a panel on the gondola's south flank |
| Windjammer (`bastion`) | a long tarred hull (44, bow at +x) with iron gunwales under three pale delta sails in a row, each pitched nose up from its yard on a tarred mast, the sun on its top (`canvasLit`, in `harbour-air.js`), clear dark deck between them; rigging from the mastheads to the bow and the stern, a pennant on the main mast; a team awning over the quarterdeck (an ink seam 0.4 proud all round it) and a team-topped forecastle block at the bow with the cannon on it (brass muzzle bead) | capital (18), flies at 24 | each sail's hem, the quarterdeck awning, the forecastle's top, the pennant: all between ink lines (no team along the gunwales: rails outlined the whole hull pale in seat 6) |

Shapes against each other: the Kite is one triangle, the Windjammer a dark boat under three; the Spyglass is a striped
cigar with fins over a hanging block. Against the Vael's Petrel (a body between two swept pearl wings, hollowed at the
root) the Kite is a filled straight-edged triangle with a dark frame on it and a tail of dots; the Spyglass against the
Glint (a pale drop with a tail, hovering low, its shadow beneath) is long, striped and finned, with a dark block under
it and its shadow far off.

Cells (`main.js`): the Kite r 19 h 18 (its tail reaches 17.5 aft), the Spyglass r 11 h 30, the Windjammer r 25 h 40.

## Vael buildings (step 1, `vael-buildings.js`)

The seven buildings after the Tidewell, on the Vael rules above: a three-lobed pearl plinth, an ink core, pearl
shells, a few small deeplights (r 1.4-2), team glaze between ink seams on at least a sixth of the footprint and
never only on the signature. Each roof is its own shape from above, and none is a ring of alternating glaze bands
(the Tidewell's three arcs read as a lifebuoy in some seats): team glaze here is a skirt round a drum, a sleeve, a
cap, a bar or one band, each between `inkSeam` edges. The camera (55 degrees, from the south) shows a face whose
normal points up or south; a plate leaning towards the camera shows only its edge, since its back faces down: so
the Sunpetal's petals splay a radian past vertical. Nothing is flat black: faces are violet glass with a sweep,
mouths and pools carry a sheen or a light. Helpers in the file: `plinth`, `skirt` (a glaze band round a drum
between seams), `hoop` (a flat glaze ring between seams), `upright` (an outline stood up in a group), `tentacle`
(capsule segments along a curve, some sleeved), `ribbon` (a flat band along a helix, the Gyre's rail). The family's
materials: `darkGlass` (the Glasshouse's panes), `petalGlass` (deep violet glass with a sheen, the Sunpetal's
faces), `mouth` (dark violet lit from within, the Anemone's),
`violetWater` (the Cradle's basin, deep violet, never black), `bud` (violet under a pearl sheen, the Cradle's bud).

Round 1's blind test swapped the Sunpetal and the Anemone (pointed petals read as the aggressive one, seven straight
lit tentacles as a flower), the Cradle (a raised lid read as a deck and a mast) and the Gyre (a widening coil read as
a hoop over a post), and saw three "dark discs in pale rims" (Tidewell, Siphon, Darkwater): hence round 2's shapes.
Round 2 swapped the Cradle and the Darkwater (tall curling arms over a pool read as an egg hatching, a dark pool
with a pale pod as dark water with a moon), read the Siphon's funnel head as a turret or a propeller and the
Sunpetal's wedge-shaped bars as a paw pad: hence round 3's Darkwater as the flat ink pool with thin arms leaning
out, the Cradle's violet basin with a big bud and ribs splaying from a flat hinge, the Siphon's plain lit head, and
the Sunpetal's pentagonal hub ring.

| kind (key)            | signature shape, from above                                                                 | team glaze                                                                 | the light(s)                             |
|-----------------------|---------------------------------------------------------------------------------------------|----------------------------------------------------------------------------|------------------------------------------|
| Sunpetal (`spire`, 2x2) | a flower: five broad rounded pearl petals (27 long, 21 wide, round tips) spaced evenly round an ink core, each splayed 1.0 rad past vertical so its inner face shows from above: violet glass (`petalGlass`) in a pearl rim; one petal north | a bar of even width across each petal's face just above the hub; a pentagonal hub ring (a five-sided torus, a corner to each petal) on the core's top; a skirt round the ink core | one, on the pistil at the heart (r 1.9) |
| Siphon (`siphon`, 2x2, on a mine shaft, drawing the last damp brine from the salt beds; the shaft's round 4, Opus, during the Fable limit) | something grown that has settled on the shaft's north rim and drinks from it: an irregular, asymmetric cluster of eight soft pearl lobes of different sizes (r 3.4 to 9.5, squashed to 0.7, more of them east) heaped over the collar's north beam and corners, a dark ink opening low on its south face, and out of it three thick soft feeding tubes (r 1.9 to 2.7) drooping over the beam and down into the black, pale over the rim, pearl in shade going down, then ink. No plinth or pad: the shaft's own sprite (drawn under every building) is its ground, so the black mouth stays largely open and the collar and dug earth show round it. No dome, lid, spiral or groove, nothing upright or pointed, nothing waving up. Round 1's upright straw read as the Lookout's gun or StarCraft's missile turret; round 2's whorl (a pearl dome with a spiral groove) as the Gyre and its small framed mouth as a door; round 3's clam over the hole as "a domed cap built on the shaft frame", the Excavator, 4 testers of 4 | ragged part-bands low on each lobe's flank inside ink seams (never a spot on a crown: toadstools), a sleeve at each tube's root between seams | one, in the ink opening (r 1.1) |
| Cradle (`kiln`, 3x3)  | a scallop with something growing in it: a fan-shaped basin of deep violet water (an arc of 237 degrees, r 30, closed to the north by a flat hinge bar 34 wide), nine pearl ribs splaying from the hinge across the floor to a pearl rim wall with ridges and a knob on each; one big bud standing in the water (r 8, 21 tall: violet under a pearl sheen, a pearl crown, a faint glow) | the hinge bar, a hoop along the rim wall's crest, a band round the wall's foot, caps on the straight edges, the bud's collar | one, at the bud's foot (r 1.5) |
| Glasshouse (`loom`, 2x2) | a dome of dark glass in pearl ribs (eight meridians and one hoop) on an ink drum, a pearl crown; three buttresses | a band round the dome's foot, a skirt round the drum, the three buttresses (glaze blocks under pearl caps) | one, on the crown (r 1.2) |
| Anemone (`ward`, 2x2) | an anemone that stings: five soft pearl tentacles (`tentacle`: six capsule segments, 2.6 tapering to 1.3) curling out, up and in from a pearl oral disc on a fat ink column, low (tips at y 42, so the shadows stay short), each ending in a blue-violet tip (`deeplight` with halos, no white heart); the mouth dark violet (`mouth`) with a faint pearl ring | a tall collar round the column, a hoop on the foot, the disc's rim, a sleeve on each tentacle's second and third segments | five violet tips (r 2) |
| Gyre (`zenith`, 3x3)  | a cone of coil: a flat pearl rail (`ribbon`, 9.5 tapering to 4.5 wide) winding two turns up and inward from a wide base turn (r 38) to a tight top turn (r 10, `lin`), both ends to the south, round a short ink core; open to the sky, its top end under a light | a stripe along the rail's outer edge (an ink seam inside it, the rail's edge outside), a skirt round the base drum | one, at the rail's top end (r 1.7) |
| Darkwater (`eclipse`, 2x2) | the dark pool: a flat, wide, still pool of ink (`poolDeep`, r 23.4, the darkest thing in it, a thin rim of pearl in shade) with four thin low pearl arms (r 2.2 tapering to 1.7, to y 23.5) rising at the rim on the diagonals and leaning outward, the pool open between them; nothing enclosed | a sleeve on each arm and its root block, a band round the basin | one, sunk at the centre, dim (r 1.2) |

Shapes against each other: the Sunpetal's petals are broad, rounded and five, the Anemone's tentacles thin, curling
and violet-tipped; the Glasshouse is a convex ribbed dome, the Darkwater a flat ink pool with thin arms leaning out, the Tidewell a
broad pearl ring on a tall drum with pylons leaning out; the Siphon is the one heap of soft lobes on a square black
hole's rim, its tubes drooping down into it (the Anemone's tentacles curl up); the Cradle the one violet fan with a bud; the Gyre the one coil. No turning head on the Anemone: `bldg_ward` is one sprite, as before.

Cells (`main.js`, unchanged): spire 82, siphon 50, kiln 42, loom 42, ward 50, zenith 72, eclipse 58. Team shares
(round 3; the Siphon in the shaft's round 4): Tidewell 0.226, Sunpetal 0.193, Siphon 0.205, Cradle 0.180, Glasshouse 0.179, Anemone 0.205, Gyre 0.234, Darkwater 0.173. The pack: `node tools/art/review.mjs <dir> --family=vbld`.

## Harbour buildings (`harbour-buildings.js`)

The seven after the Lighthouse (`harbour.js`, kept as it is), on its rules: a flagstone quay a little inside the
footprint (`oct` 27-30 on 2x2, 43 on 3x3, 20 under the Lookout), tarred sheds with iron plinth bands, timber on masts,
spars, ramps and props (pale timber, `timberPale`, only on the Workshop's derrick, so the boom reads at 18 px), canvas
pale on top, team canvas between ink hems on at least a sixth of what the camera sees and never on the ground (every
team sheet is a roof slope, an awning, a sail, a vane, a wrap or a tarp over crates with a shadow), mooring posts with
team tops along the quay's edge, crates under lashed tarps, casks, coils and salt sacks at human scale so a Picket
beside a building reads as a person. Each building owns a roof silhouette from above, and the team canvas takes a
different form on each (the PM's note at gate A: no two roofs alike). (Rounds 1 to 5 and step 2 judged the Pump, a pump
jack over a pool of brine, which the Excavator replaced; the history keeps its name.) Round 1's blind test (75%) swapped the Pump and
the Lookout (a dark beam on a four-legged frame read as a dome with a barrel; a nest at 36 on thin legs as a squat
tank), the Windmast and the Loft (a round pale lid read as a landing pad; a lattice tower as a derrick), the Loft and the
Crew Hall (pale roof hatches as lit windows); the Workshop was named only by elimination (a team roof over a crane that
did not read). Round 2's blind test (56%) swapped the Windmast and the Loft both ways for all four testers (the
Windmast's radial rotor read as propellers, so flyers; the Loft's mast with sails as "the mast" of the Windmast's
name), the Pump and the Lookout for two (the Pump's pale level beam as a gun barrel or a telescope, its round well as a
turret ring; the Lookout's nest as a ball on a tripod, its gun missing from the blind images), the Workshop and the
Slipway for one ("a derrick over a ramp"). Round 3 passed the blind test (16/16 for all four), but the Workshop,
the Loft and the Pump were named by elimination (the Pump and the Workshop "small, dark and cluttered" at 1x), and the
judge found the big roofs (the Loft's tent, the Slipway's hipped roof, the Crew Hall's slope) near-flat fills, the
brightest planes on screen in seat 6, and the Windmast's sails hiding the mast (a pagoda roof). Round 4 fixed those
(the judge passed it) but all four testers swapped the Pump and the Workshop: the Workshop's new long pale jib with its
hanging bale read as a pump jack or a well-sweep with a bucket, the Pump's big pale horse-head as a dial or a wheel.
Round 5 kept round 4's other six and took round 3's Pump and Workshop back, cleared at 1x; the Excavator (the mine
shaft round, Opus, during the Fable limit) replaced the Pump, and its row is new.
In step 2 (both peoples' lists) all four testers swapped the Crew Hall and the Slipway ("a long shed with ribbed bays
and a yard: a boathouse"; "a pitched-roof hall with a steeple"); the table has their step-2 fix: the Crew Hall a plain
roof over a drill yard with a flag, the Slipway a large sharp-bowed hull on a slip into water beside a low lean-to.

| kind (key)              | signature from above                                                                                              | the team canvas                                                                     |
|-------------------------|-------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------|
| Windmast (`depot`)      | a square tarred store (30 x 28) with a timber deck on top; out of it a tarred ship's mast (to 75, iron bands two over each sail) carrying three square sails one over another, narrowing upward (course 28-31 x 10.5, topsail 22-25 x 9.5, topgallant 16-19 x 8, heads at 35, 51.5, 67), hung on the mast's far side so the dark mast runs down their faces: each team canvas bellied away (`sailGeo`, a bent grid), leaning foot-south 0.12, framed all round in tar (the yard, tarred bolt-ropes down the leeches and along the foot) so it never shares the kites' wedge; the yards (r 1.2) reach 5.5 past the cloth each side with iron bands at their ends; braced 0.18; a small top over the course, a pennant. Nothing radial | the three sails, two canvas doors on the store's south face in ink frames, a lean-to over the casks south, the crate tarps, the pennant |
| Excavator (`extractor`) | a small mine head standing straight on the shaft, round 2's (8 of 8 testers) without its quay (round 4, Opus, during the Fable limit: no pad or plinth, the PM's call): the shaft's own boxed collar and dark mouth (ground.js `shaftCollar`, the free shaft's, centred, so the two line up) on the dug earth; a timber headframe, four legs (r 1.35) from the collar's corners leaning in to two cap beams at 44, tied once round, two back-stays down to the west; on top **the winch wheel**, the signature: a sheave (r 11, its centre at 46, 3 west of the mouth's centre) facing south to the camera, a team rim (tube 1.6) between ink rings, six spokes and a hub of lit timber (`spokeTimber` 0xa89c88, round 3's judge: the wheel reads as a lit disc and leads the gold lean-to), an iron axle with a brass cap; the pale rope over its top and straight down into the black, and from its west side down into a tarred winch house west of the collar (its drum inside, an iron fairlead on its north wall) under a lean-to of weathered team canvas (`paintWorn`, sagging, worn hems, a rope lashing); south of the collar a tub on short rails with a load of grey rock salt (`rockSalt` 0x6e6a63, no emissive). No beam, horse-head, pool, bucket or crane (a hanging load read as a well-sweep, round 4 of the buildings; a boom is the Workshop's) | the wheel's rim (never the only team), the winch house's lean-to, the tub's sides between ink hems |
| Crew Hall (`barracks`)  | soldiers live and drill here: a long tarred shed along x (80 x 26), plain walls, under one plain gable: the near (south) slope weathered team canvas (`paintWorn`) with one gentle sag, no battens or bays (step 2: the bays read as boat slips), worn ink hems all round, the far slope dark tar, a tarred ridge beam (2.6) raised over it, a stove pipe; two doors and small shuttered windows under a shallow shade along the south wall (`canvasDark`, on posts with a rail); in front the drill yard, a square of packed sand (`sandbag`, 46 x 22) in a timber kerb with eight straw cross-post dummies set a little unevenly (a post, a crossbar, a straw body and a sack head in straw-tan, 0x9c8658, no cast shadow: step 2's ranks of round pale heads read as a parked squad of infantry), the flagstaff (44) at its north-east corner; three round pale targets on posts east, a rifle rack, a bell | the near roof slope (84 x 17), the flag, a crate tarp: a long two-tone bar over a sand square with a flag |
| Workshop (`forge`)      | round 3's smithy (34 x 28) under a dark corrugated iron roof on timber posts, one slope down to the south, a louvred vent along the roof (three pale timber louvres, a pale timber gable cap with an iron strap: a pale ridge in grey), a square iron stack at its north-west corner; the forge out in the yard south of it: a slate hearth glowing orange-red (`hearth`, r 3.4; gold must not meet the forge glow) under a short flue, the anvil, five orange sparks over it, a quench tub; a short pale timber derrick west of the smithy (mast 50, boom r 2 with iron bands up to the south-east), the bale hung over the quay, never past the footprint (round 4's long jib read as a pump jack); no bench, bars or chain coil (clutter at 1x) | an awning along the open south side (39 x 13) on posts under the eave, the bale (team canvas, roped, between ink hems), a wrap round the stack, a crate tarp |
| Slipway (`factory`)     | a boat is built here: a stone slip (34 wide) inclined 10 down to the south off a stone head, running into a strip of dark water (`brine`) at the quay's edge with a pale line of foam, two pale timber ways (`timberPale`) on dark sleepers; on them, on keel blocks and shores, the largest shape: an open tarred hull (`hullGeo`: 56 long, half-beam 12, deep 8, a transom stern, a sharp bow pointing down the slip, the sheer rising forward), its pale gunwale outlining the boat, six pale ribs across its dark inside (`tarIn2`), a keel, a pale stem post, a team strake along each side under an ink seam; a capstan on the head with its line to the stern. East, the mould loft: a low open lean-to (28 x 46), one slope falling away from the slip (20 to 11) on posts, a tarred back wall and a dark high plate, planks stacked beneath. No sheer legs and no peaked roof (step 2: a steeple and a hall; and the Loft is a deck beside a peaked tent) | the lean-to's slope (weathered canvas sagging in three bays, worn ink hems), the strakes, crate tarps |
| Lookout (`turret`)      | a tall tripod of tarred poles (r 2.2) on a stone footing, lashed, braced three times, a ladder up the south leg; the crow's nest at y 48, a shallow tarred tub (r 10.2, 6 tall, open hoops: the camera sees into it) floored dark (`oilskin`, tarred seams: the gun shows on it, not a pale face), a canvas skirt hung beneath it, a pennant staff; a long shadow: a tower, not a drum | a screen lashed round the tripod's waist outside the legs (a cone, 0.38 to 0.54 of the way up, between ink hems), the skirt under the nest, the dodger over the tub's whole wall (an open tube, ink hems top and foot), crates under a tarp at the foot |
| its gun (`turret_head`) | a heavy iron swivel gun (36, r 2.7 to 2, angled up 0.2) on a pivot post and yoke in the nest, two pale canvas servings along the barrel so it reads far past the rim, a muzzle swell and a brass bead, a cascabel; no dome or hood (round 2's hood read as a ball); drawn over the base, no shadow | the breech wrapped between ink rings, a powder chest behind the gunner's place |
| Loft (`airfield`)       | where the Kites are kept and launched: a broad raised launch deck (44 x 40 at y 20) on tarred trestles with cross braces, planked, a rail on its west and north edges, a stair up from the quay; two Kites (`parkedKite`: a delta wider than long, 27 x 17 at k 1, cream nose (`kiteCloth`), a team band along the trailing edge behind an ink seam, timber leading edges, spine and cross spar, a keel pod, on chocks) parked on it nose east, turned apart, tethered to cleats; a small windsock (striped tubes) on a short staff at its north-east corner; east the hangar, a tent along z (28 x 40, ridge 24) with no walls: a tarred sod-cloth (`tar2`) at its foot, weathered canvas sagging 1.6 between rafter lines (ropes over it casting shadows), worn hems, a tarred ridge pole (r 1.4) raised on forked poles, a tarred back cloth, a dark floor, open south where a third Kite's nose shows; guy lines; a winch with a line up to the deck. No mast (round 2's mast read as the Windmast) | the tent's two slopes, the Kites' trailing bands, the windsock's stripes, crate tarps |

Roofs against each other: the Lighthouse a cone on a round tower and a striped hull; the Windmast a dark mast through a stack of
three framed trapezoids, yard ends out to the sides, over a dark store; the Excavator a team wheel on a short timber
tower over a black square, a rope down into it, a team lean-to beside; the Crew Hall a long two-tone gable over a shade and a sand drill yard with dummies and a flag; the Workshop a dark ribbed slope with a pale vent along it, a
team strip at its foot and a short pale boom; the Slipway a sharp-bowed open hull on a slip into water and a low lean-to; the Lookout a small open
tub on a tall tripod with a long gun; the Loft a planked deck carrying two pale deltas beside a tent. A 3x3 quay needs about 1250 square units of team to reach the sixth, so the
Crew Hall's slope, the Slipway's lean-to and the Loft's tent are large; their forms differ and none is its
building's signature.

What the blind tests taught: a radial star of vanes reads as propellers (flyers), a tall mast as "the Windmast"
whatever it carries; a pale level beam reads as a gun barrel or a telescope, and a round kerb as a turret ring; a pale
nest on a tripod reads as a ball; a triangle longer than wide reads as a pennant, one wider than long as a wing; sails hung in front of their mast hide
it and stack into a pagoda roof; small dark buildings with many props are named by elimination, but one big pale shape
added to each can become the other's signature (round 4: a long pale jib with a hanging load reads as a pump jack, a
big pale horse-head as a dial); patches in a row on a roof read as windows. So the Excavator's wheel is the one
wheel among the Harbour's buildings, on a short frame (not a mast: the Windmast's) and with no boom (the Workshop's).

Gotchas: `cyl` is capped, so a "ring" of it over an open thing is a lid (a hoop over the nest hid its deck for two
rounds): rings and dodgers are `tube` (open-ended, two-sided materials). A flag is a `plate` turned rotation.x -pi/2
(outline x along the fly, z up), so it faces the camera; the Lighthouse's pennant (rotation.z) stands edge-on.

Lights: none but the Workshop's hearth and sparks. Materials of the family (`bldgMats`): `brine` 0x3a4a50 rough 0.12
metal 0.35 (the Slipway's water), `saltPan` 0xd8d4c6 flat (the Slipway's foam), `rockSalt` and `spokeTimber` (the Excavator's, made in its builder),
`tarIn` (tar's map on the back faces, a hull's inside), `kiteCloth` 0xc6bc9e,
`canvas2` / `canvasDark2` / `paintCanvas2` / `inkLine2` (two-sided, for sails, vanes and dodgers seen from both
faces), `spark` (0xffb890, emissive 0xff6a28 x 3.2, not tone-mapped), `hearth` (0x3a0500, emissive 0xff2a08 x 1.5: orange-red, as
yellow merged with the gold seat), `paintWorn` (team canvas two-sided at 0.8 of the paint: the big roofs, so a white
seat's roof is a band below white and never the brightest plane on screen), `tar2` (tar two-sided: a tent's
sod-cloth). Cloth helpers: `sagQuad` (a patch over four corners sagging between supports, lifted off what it covers:
its sag must stay above the tarred roof under it, or the tar shows through as dark spots that read as portholes) and
`wornHem` (a dark hem of uneven thickness along an edge).

Cells (`main.js BUILDINGS`, the `h` of `bldgCell`): extractor 58, barracks 44, forge 72, airfield 58, factory 48 stay
the old ones; three are taller than the old models' because the new ones rise higher and touched the cell's top row:
depot 32 -> 42 (the Windmast's mast), turret 14 -> 36 (the Lookout's nest and pennant), its head 30 -> 62
(`TURRET_HEAD_H`: a north-facing muzzle stands about 74 above the anchor). The anchor stays the footprint's centre, so
the head still seats on the base. Every Harbour building and all 16 head frames have their top row clear (11 px or more
of room). Team shares at
facing 0 (step 2; the Excavator in the mine shaft round): Windmast 0.240, Excavator 0.196, Crew Hall 0.256, Workshop 0.171, Slipway 0.194, Lookout 0.194 (its gun
0.182), Loft 0.174. The pack: `node tools/art/review.mjs <dir> --family=hbld` (the phone sheet is a scene of each
building once, in seat 0 or 6, with a Windmast, a Lookout and an Excavator on a shaft again in seat 1, a salt field, the
Tidewell, Pickets and Riggers for scale; the blind images are 200 px wide; the battle stand-in is a Harbour base of
every building against the Tidewell). Lights and smoke (`look.js BLDG_LOOK`): the Workshop's glow on its hearth (3 px
west of the centre, 20 below), its smoke from its one stack (footprint px 23, -13); the Excavator has no light.
Round 4 polish (Opus, during the Fable limit; no silhouette changed): the Excavator's lean-to slopes down to the west
so its canvas catches the north-west light, its south gable a step darker (`paintShade`, 0.72 of the worn paint), one
shadow crease down its sag (`paintCrease`); the rope from the wheel to the winch house and the one down the shaft in
shade (`ropeShade` 0x6e6250), so the wheel is the only pale form up top; the tub's load one lit grey mound (`rockSalt`
0x55524d), two iron straps on its side; the Siphon's team moved off its lobes' crowns (round 4's testers and judge:
"toadstools") into ragged part-bands low on every lobe's flank, inside ink seams, and longer sleeves at the tubes'
roots. Team shares: Excavator 0.196, Siphon 0.205.
The Excavator's own pack: `node tools/art/review.mjs <dir> --family=shaft` (the shaft's frames, the Excavator in
seats 0, 1 and 6 with its mask, the Excavator and the Siphon each over a shaft; a Harbour base at a phone's size with
an Excavator on its shaft, a free and a dry shaft, a Siphon on a shaft, in grey, protan and deutan; the blind set: the
shaft, the Excavator, the Workshop, the Windmast and the Siphon; `base.png`, the real game's main, needing
`npm run build:wasm`).

## The ground and the scenery (step 1, `tools/art/terrain2.js`, `ground.js`, `scenery2.js`, `effects2.js`)

The seabed, the reef, the two resources, the scenery, construction and wrecks for both peoples, and two projectiles,
on the ground rules above: the ground stays the darkest thing on screen, salt carries no light, and nothing on the
ground is as pale as a unit's top (the PM's note at gate A: the salt fields were the brightest thing on the map; a
heap of shells rendered white in the maker's first round and would have passed for units' hats at phone size).

**The seabed** (`terrain2.js`; round 2 after the judge: round 1's marks were three stamps in one orientation and
scale, ink doodles on a flat sheet). Twenty tiles: eight bases (`ground_0..7`), each with its own faint pale salt veins
(a few lines of a crackle of polygons some 16 px across, a pixel wide, dim salt at most 0.3, its own patches of the net
picked by a low noise, faded at the tile's edge; eight bases so no one pattern comes back often enough to count), and
twelve marks, kelp drying in a dark patch (`ground_8..19`: two or three lobes, fibrous inside, a damp halo, never a
stroke), from a scrap to near a tile across, each its own centre, turn and mirror. `groundTile` lays them in clusters
(a low noise over the map sets a cell's chance of a mark: none over about half the map, up to 0.4) and never in the
water (in the shallows kelp read as fish or swimmers). The pale branching vein tangles, the crust plates and the shore
litter's pale pebble pairs are gone (doodles, cookies, pairs of dots). Variants draw their numbers through `sd`, a twice-hashed seed: `hash2` of neighbouring integers
is correlated, which is why round 1's marks all lay one way. `src/client/gl/ground.js groundTile` picks a cell's tile
(about 90% a base); the review pack picks the same.

**The reef** (`tile(m, v)`, m > 0): dead reef, a shade darker than round 1 (top [86,82,73] to [68,65,58]). A dark face
in the reef's layers on every edge: the tall south face (18 px) as before, and short north (5 px), west and east (4 px)
faces under the bleached lip, so the plateau reads as standing up from all sides (round 1's north edge was only a lip
and read as walkable high ground); a dark foot on the ground at the north and west edges. The top's noise is periodic and
shared by the variants (round 1 used a non-periodic noise: seams); its own marks are three to five ragged, drawn-out pits
(each its own turn and length, a broken edge, low contrast; round 2's round dark pits read as chocolate chips) and one
small bleached nub, at hashed places clear of the edge, no window. The plateau's inside has six variants (`rock_15_0..5`,
`gl/ground.js rockTile`), the edges three. The minimap draws it `#6b665a`.

**The salt works**. Stelian's call on the live game (2026-11-06): step 2's salt heaps on a cracked salt pan had "too
much detail and green"; the salt is back to #231's crystals, nudged whiter so they read as salt crystals.

*The outcrop* (round 5, Opus, during the Fable limit). The look-alike test on real base shots still named StarCraft:
seven separate patches, each the same sprite on its own shadow, set apart in an arc by the main building, "the visual
signature of a StarCraft mineral field" (the judge; two testers: "an arc or crescent of crystals"). Since PR #241 a
base's crystals lie in one clump to a flank of its Core; this round merges each clump into one outcrop:

- *The crust* (`src/client/gl/crust.js`, drawn by `gl/render.js` in its own layer `crust`, under the crystals, over the
  seabed and its shade). The client's, as the nodes' places are the map's: `saltClumps` links nodes within 3.2 tiles
  into clumps (a shortest spanning tree), `crustImage` draws one clump's bed: the union of soft blobs round its nodes
  (spread 0.42 tile), bridges along the tree's links and a broad blob at the clump's middle, so it is always one mass
  (a ring of crystals never leaves ground in its middle; any pocket left is filled), its outline wobbled by a noise fixed
  to the map. It is lit as a heightfield the way `scene.js` lights the sprites: a low rim rising to a gentle dome (some 4
  units), a grain of small ridges, the sun from the north-west and the cool rim from the south-east, so its north-west
  edge catches the light and its south-east falls into shade; halite's warm pale grey mottled pale and dim
  (`PALE` [0.545, 0.535, 0.505], `DIM` [0.46, 0.45, 0.425]: about sRGB 100-120, more than twice the ground, well under
  the units' paint, 171 in grey for seat 0's gold), damper towards its edge; the sprites' finish (the contrast curve,
  5-bit banding) and ink on its outline. Round it one shared footing: a contact shadow all round and the bed's shape
  cast 2.5 px south-east at the shadow's 0.5. One image per clump at a texel a world px (soft: a phone's memory), made
  the first time any of its nodes is explored and kept (a worked bed stays as the crystals go); never under the
  unexplored, so it shows nothing the crystals would not.
- *The crystals* (`ground.js saltField(stage, v)`, `shard_k` for variant 0 and `shard_k_v` for 1-3, `unitCell(28, 26)`,
  `GMATS`; `salt` 0x96928a with emissive 0x423e36 and `saltWet` 0x8a8780 / 0x34312b, as round 4's polish): no apron of
  their own, only a narrow dark footing at each cluster's foot and the cast shadows. Four variants (`SALT_VARIANTS`),
  each its own clusters, seed and turn about the vertical (the shapes turn, never the light; no mirrored sprites):
  0 one tall heap among eight (the portrait's), 1 a spread of medium clusters, 2 a low bed of small cubes, 3 two tall
  leaning columns and a few small ones; clusters 1.7 times round 4's girth, 1.25 its height, spread 1.4 times wider, so
  a node's crystals reach towards its neighbours'. `gl/crust.js crystalVariant` picks one per node from its tile, so a
  clump mixes big and small. The stages keep their meaning: 0 the variant's clusters of halite cubes, stacked and
  tilted, a few loose cubes; 1 its larger half, lower, wet slate dug through in two places; 2 no standing crystals,
  slabs of salt and crust over a patch of wet slate; 3 a small dark pit of wet slate (radius 10) with a film of brine
  (`brine` 0x1a2226) and a broken pale rim, two cubes left: on the crust it reads as a worked hole in the bed.
- The minimap keeps a pale dot per node.

The old apron (`apron` 0x4d4c49, radius 17) and the per-node slate chips are gone: the crust is the bed.

The salt's icon (the top bar's `.dot.shard` in `src/style.css`, 12x10; `icons.js` `gather`; the menu's shore in
`index.html`) is a cluster of three pointed crystals, the middle one tallest and the two beside it leaning out, white
on its lit face and pale grey (0xb9b4aa) on its shaded one; never teal.

**The mine shaft** (`mineShaft`, `vent_0..3`; Opus, during the Fable limit). As the sea fell it uncovered old beds of
rock salt under the seabed, deeper than the surface crystals; a shaft is an old entrance going down to them (Stelian:
"an entry to a mine, with less detail"; the brine spring before it had "too much detail and green"). A few big forms
that read at a phone's 64 px: a square dark mouth (24 across) in a heavy collar of squared timbers laid log-cabin
fashion, two courses, boxed: the beams stop at the box's corners (round 2's ends past each other read at 1x as ladder
rails or an empty frame; the shaft's round 3) (`SH.beam` 0x847d71 with the timber grain: old, weathered
grey-brown, a step over the ground so the shaft is found at 1x; the Harbour's `timber` finished orange on the ground),
the near edge's worn lip lit (`SH.rim` 0xa69c8a, the depth's first cue), two iron dogs at its corners; a low, shallow
apron of dry dug earth round it (`SH.spoil` 0x3e3b36, the ground's value or a touch over, radius 28, an uneven edge, a
low heap to the south-east, open over the mouth: round 1's darker spoil, 0x302f2c, read as a puddle or tar to all four
testers and the judge) and two big slate stones. The shaft is built as a real hole (`shaftCollar`): its far wall goes down below the ground
as deep as the camera sees through the mouth (1.43 times its width at 55 degrees; only that wall, as nothing else of
the shaft can be seen; `shaftPit`), a thin band of timber lining in shade (`SH.lining`, 1.6: round 1's band twice as
tall read as a sandbox's or a ladder frame's), then rock in shade (`SH.rock`), darker (`SH.deep`), and black
(`SH.mouth`, unlit), so at 1x the mouth is black; a slim ladder (`SH.ladder`) going down it from just over the collar: the
one thing darker than the ground, and a depth the eye reads as a hole to climb down. No liquid anywhere, no rope,
windlass or bucket (a well), no green, no plume, no rings, no light, nothing team: it is neutral ground. The four frames
are the same (it no longer bubbles); render.js draws a dry one at 0.6, and its mouth still reads darker than the ground.
Neither building on it has a pad of its own (the PM, round 4: a ring on a pad read as StarCraft's refinery): the
Excavator stands on the same `shaftCollar`, the free shaft's, so the two line up; the Siphon heaps on the north rim
and leaves the collar, the dug earth and most of the black showing round it. The tide pool (scenery) stays a dull grey-blue film, ~54 in grey, never ringed by white.

**The scenery** (`scenery2.js`, `SCENERY`; the names are the old props' so the client, the scatter and the tests stay
as they are): on the reef (solid), `boulders_*` a small heap of clams and whelks lying down with rounded grey-brown
pebbles (`pebble` 0x35312d; `shell` 0x5a4a3a, `shellDark` 0x3a3028: brown and dark, never white or grey-white, nothing angular and upright;
round 1's heap read as a cluster of Vael units, round 3's grey pieces and angular stones like the salt's crystals), `spire_*` pilings (weathered `drift` 0x6c6252, a tar line, a barnacle crust, split tops),
`ruin_*` a boat's ribs, `wreck_*` a tarred hull keel up. On the open ground (flat, walked over): `crater_0` an anchor in
the sand, `crater_1` a tide pool (a small film of dull grey-blue water, `pool` 0x131a22, ~54 in grey, never taken for brine: round 4's mint teal was brighter than the old seep's brine; in one lobed outline straight on the sand, its kelp brown-black,
stones half in it, kelp at its west end; no rim and no rings: round 1's dark disc in a pale rim read as a seep),
`debris_*` flotsam. The scenery's rope, sailcloth and cork are its own dull materials (`SMATS.rope`, `sail`, `cork`): the
Harbour's pale rope and canvas read as white rings and sheets on the ground.

**Construction and wrecks** (`ground.js`; `foundation_n`, `scaffold_n`, `rubble_n` in seat 0's gold as before):
the Harbour's foundation is a sill of timber beams with iron corner straps, pegs and a string line, flagstones laid at
one corner and a stack of planks; the scaffold timber poles lashed with rope, two ledgers, rope braces, pale canvas
hung on the north and east sides with an ink hem, a gold pennant (no shadow, as before); the rubble broken tarred
planks and timber, bent iron bands, a few scraps of torn sailcloth dirtied grey, flagstones, a coil of old rope (the
dead building's pale canvas and rope are greyed: `RM`, round 3; white squares read as confetti). The Vael's: `bud_n`, a closed pearl bud (five petals with ink seams between them over an ink core,
on a three-lobed ink plinth, one deeplight at the tip; h 8 + 7n), shown over the warp ghost once the site is planted,
fading as the building grows (render.js `BldgObj`, in the scaffold's place); `rubble_vael_n`, pearl shards greyed by the fall (`RM.pearlDull`
0x48464a, `pearlDark` 0x323134; fewer and larger since round 3: white chips were the brightest thing in the
construction sheet, a field of confetti) and chunks of ink glass round a small dim pool and broken domes, picked by the dead building's people (render.js `boom`, by the burst's seat) where `rubble_n` is picked
by its radius.

**The projectiles** (`effects2.js`): `harpoon` (36x10, its tip at the anchor: a dark iron shaft with a lit edge, a
brass barbed head, the pale line paying out behind with a sag) and `beam` (40x8: a lance of deeplight, a white heart in
a violet-blue sheath fading to the tail). `bolt`, `shell` and `missile` are as they were. The renderer picks a
shot's art by its shooter: `PROJ_FIELDS` carries `by`, the shooter's unit kind (fixed when fired; -1 for a building's),
and look.js `SHOT_LOOK` names the kinds with their own sprite (the Harpooner's `harpoon`, the Lens's `beam`); the rest
draw their projectile kind's.

**The shade layers and the minimap** (`src/client/gl/ground.js shadeLayers`, drawn by `gl/render.js renderTerrain`
and rendered the same by the review pack). A multiply: the land by 0.78-1 of the map's shade (it was 0.5-1, made for
the old pale dirt), the shallows by [150,230,222], deep water by [66,118,198]; on a map with water, an add: the water's
own light, [14,34,31] in the shallows, [2,8,22] in the deep, which lifts the shallows over the land (a multiply cannot:
round 1's shore was a hue fade at equal darkness, lost in grey and protan). The shore: the waterline is the 0.5 contour
of the tiles' wetness, rounded between tiles and wobbled a little; on its land side a wet line some 9 px wide darkening
to 0.5 at the water, on its water side the lap, a 2 px line of pale foam (added [26,30,28]). Where the shallows fall to deep
water, a crisp dark line some 2 px wide (multiply [34,60,104], round 3: round 2's soft blur lost the channel's edge),
then the deep. In grey: land, a dark wet line, a pale lap, the lighter shallows, a dark line, the dark deep. On a map with water the layers have up to 16 texels a tile (at
most 2048 a side), on a dry one one texel a tile as before. The minimap: land `hsl(36,10%,14-23%)`, reef `#6b665a`,
shallows `#467c80` (a notch up), deep `#1d3658`.

The grey check (round 4; the base shot adds a worker standing between two salt fields, its body's grey against the
ground's round it): the pack prints the median and 90th percentile, in the units sheet in grey, of the bare
ground, the kelp, each resource, the shaft's mouth, collar and spoil, the salt field's ring (since round 5 of the salt the crust is the client's and
`review-ground.mjs` draws neither it nor the variants: judge the salt on the real game's base shot), the reef top, the tide pool and the
units; the order to keep is units first, then the full salt, the kelp always under the ground, and the shaft's mouth
the darkest of all.

The pack: `node tools/art/review-ground.mjs <dir>` (the ground and units sheets at a phone's size and at 1:1 with the
game's shade layer over them, grey / protan / deutan, every prop at 1:1, construction and rubble of both peoples, the
projectiles at 1:1 and 4x, a Shore-like patch with the water tints and its minimap strip, and the base shot: a real
main from the sim's map at a phone's size). It renders only the family
and a few units for scale, never the whole atlas.
