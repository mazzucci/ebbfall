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
green kelp doubled as the seep). The bases (`ground_0..7`, most of the map): sand with
slate showing through, soft ripples bent by noise (no direction may show at 2x), a low slate ridge as a contour, and
faint pale salt veins, each base its own; the marks (`ground_8..19`) a kelp patch each, every one its own size, turn
and mirror, lying in clusters with bare ground between and never in the water (step 1: "The ground and the scenery"
below). The renderer picks them through
`src/client/gl/ground.js`. All base noise is periodic over the 64 px tile (scale x period = 64) so tiles seam; what is a
variant's own (veins, marks) fades out at the tile's edge. The rock plateaus are dead reef (step 1): a bleached lip, a
pitted grey-brown top, a dark layered face on every edge.

The salt field (`shard_0..3`): halite grown in cubic clusters on a bed of wet slate under a crust. Salt is pale
by itself, a warm grey (`ground.js GMATS`: `salt` 0x7c776d rough 0.95, `saltWet` 0x6e6f68, flat shaded; it peaks near
200 sRGB, under the units' highlights: step 0's 0xe4e0d4 and round 2's 0xc2bdae both peaked at white) and carries no
light. The four
stages differ by shape: standing clusters, fewer and lower clusters, a flat broken crust, a bare dark pit with a pale rim.

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
| `sandbag`     | the dug-in state: wet grey-brown, mid value (dark bags vanish on the ground, tan ones merge with gold) | Standard 0x7a7264, map `burlapTex`, rough 1 |
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
keeps them), so seat 6's white parts from pale canvas.

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

Shown on the sprite itself, by pose frames (`src/client/look.js UNIT_POSE`): the Picket dug in = kneeling behind a
crescent parapet of wet sandbags laid ahead (r 7.6, 200 degrees, two courses), the rifle resting on them, a team
groundsheet behind; frame 2 while going to ground (one course), frame 3 dug in. Cover is a wall in front, open behind:
a full ring read as a machine's body in the round-1 blind test. Beached / anchored (the machines, "Harbour machines" below): the same pattern, a pose
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
| `deeplight`            | a small light (r 1.3-1.6 on a unit, in an ink socket at the Glint's tip) | Standard 0x2a3290, emissive 0x7080ff x 1.9  |
| `deepCore`             | its white heart                 | Standard 0xc8d0ff, emissive 0xdde2ff x 1.1                                                 |
| `deepHalo1..3`         | its falloff                     | Basic 0x6a7cf0 / 0x5a68e0 / 0x4c58c8, additive, opacity 0.18 / 0.09 / 0.045                |
| `pool`, `poolDeep`     | a pool of deeplight             | Standard 0x0c1024 emissive 0x1a2260 x 0.3; 0x06081a emissive 0x121848 x 0.2 (dim, navy-ink, pearl ripple rings) |

Palette: pearl 0xd8cfbf, pearl in shade 0x9a9284, ink 0x0c0a12, deeplight 0x7080ff (its heart 0xdde2ff), pool
0x161c48, team glaze = the seat colour with a sheen.

### Value rules

A Vael unit is pale (0.8-0.9) with an ink core (0.05) showing beneath or inside. Deeplight stays small and blue-violet,
value about 0.5, so it never outshines the pearl or the salt. The pool is a dim surface (0.15), not a lamp.

### Team colour

Team glaze between `inkSeam` edges (a seam ring, a hem bar, an end cap), so seat 6's white and seat 3's lilac part from
the pearl and the deeplight. At least a sixth of the footprint, never only on the signature: the Glint's one smooth
dome on the back inside one ink seam plus the collar on its tail; the Lens's two rim arcs plus the three pods under
the rim; the Tidewell's three ring arcs plus the pylons' inner faces and caps.

### Shape language

- Workers: drops. The Glint is a fat pearl drop (`shellLight`, pale from above: its ink belly is tucked under the head, seen from the side only, since a belly showing from above made it a dark blob, the Undertow) with a blunt tail (7 long, a team sleeve on its aft half and a pearl knob at its end), one big deeplight at the tip with
  a pale heart; it hovers low with its shadow right beneath it. Round from above: a drop drawn to a point read as a
  flying dart. Its team glaze is one smooth dome on the back inside one ink seam, and a sleeve on the tail: never a
  band across the body (bands with seams read as palings or a blade at 18 px).
- Fighters: blades and discs. The Lens is an ink-glass disc (r 7.6, the glass big and dark: the one "eye") in a narrow pearl rim (r 7.9, tube 1), the light in the middle, a thin
  pearl ring etched in the glass: from above a dark hollow with a bright centre, never the Glint's solid pale drop.
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
| Tender (`halo`)        | a six-pointed flower, 23 across: six narrow pointed pearl petals with clear gaps between them (petals that touched made a disc, read as the Lens or the Glint), nearly flat, three lighter ones cupping the light; never a disc or a mote | support (9), hovers at 7 | two opposite outer petals (each inside an ink seam) and a band round the ink calyx beneath, so the light stays aqua in every seat | the one aqua light, big (r 2.2), held above the cup (`aqua` 0x18d8b4 emissive x 1.25, a small aqua-white heart, aqua halos; in `vael-units.js`), never violet: a mender, not a weapon |
| Conch (`monolith`)     | a spiral: a pearl shell of two and a half whorls, apex up, on an ink disc with a pearl rim; the mouth an ink aperture facing the bow (the muzzle) | heavy (15), hovers at 3 | a ridge coiling along the whorls' shoulder between two ink-seam coils, and the mouth's lip | deep in the mouth |
| Undertow (`umbra`)     | the one ink-dark Vael: a low leaf blade with a swept leading edge, matte black glass (`inkMatte`) on a thin pearl plate (`ring`, 0.6), so the rim is a line from above and the edge-on blade is ink (a thick plate read as a pale spindle, the Needle) | line (10) | the hilt on both faces and a slim grip round it, between ink seams; lurking, a team dot on the pommel | at the pommel (r 1.2 gliding, 0.7 lurking); gliding, a thin line of deeplight down the leading edge |
| Petrel (`shrike`)      | a gull: two pearl wings curved only at the root (the leading edge bowed forward, the trailing edge hollowed) and straight-swept outside it, on a pearl body 13 long riding above them with a head forward, ink beneath (a straight chevron read as a Harbour Kite; a crescent all along read as the Needle's sickle) | flyer (11), flies at 20, its shadow well offset | both wingtips behind a full ink seam across the wing, and a cap on the pod's back | at the tail |
| Argonaut (`sovereign`) | a long barge, length before all: a pearl hull 44 long and 17 wide, bow at +x, an ink underside, pearl shell ridges along both gunwales; a small coiled shell over the stern; a lantern at the bow | capital (18), hovers at 4 | the deck well, a low team dome with an ink hem; the shell's ridge; the lantern's foot ring | the lantern: a big deeplight (r 2) on a short post under a pearl hood, no cage (a cage read as a gun barrel) |

Shapes against each other: the Needle is a pale sickle, the Undertow a dark leaf (the PRD's one exception to the
pale-on-ink value order, kept legible by its pearl rim, its lights and its hard shadow); the Tender is a pointed six-petal
flower where the Lens is a dark disc and the Glint a tailed drop; the Conch is round where the Argonaut is long; the
Petrel is a gull (a body on swept wings), the only thing with its shadow apart from it.

States: the Undertow glides canted on its edge (frames 0-1, the face leaning to the south, hovering at 3, its edge and
tail lit) and lies flat on the ground when it lurks (frame 2: `UNIT_POSE.umbra`, shown while the snapshot's `cloaked`
is set: the same blade, kept dark). The Petrel has one frame (a glider, `UNIT_FPS` 0); the Argonaut four (a slow bob,
`UNIT_FPS` 4); the others two (a bob).

## Harbour infantry (`harbour-infantry.js`)

The sailor (`sailor`): an oilskin coat (tar, or `coat` given) with a flared skirt, an iron belt, a hood, sea boots;
two stride frames or kneeling. Every kind wears the family's round canvas hat (`hat`: pale brim and crown, the team
band round the crown between two ink rings, a dark line under the brim; brim 4.1-4.5, crown 2.9-3.1 by kind) except
the Rigger's cap, and every kind has team canvas sleeves. Each owns an outline at 18 px, and every figure stands
upright (round 1's level harpoon gun made the Harpooner read as lying prone; round 2's hand-barrow made the Rigger,
the one low shape left, read the same):

- **Rigger** (harvester, scale 0.95): the smallest figure, a small pale cap with a team band, a big pale canvas salt
  sack low on its back (its top under the cap in every facing) bunched up by the right shoulder, tied round the
  middle with a team band and at the neck with a team cord, a short pick with a salt-pale head held low in the left
  hand (never a shaft that could read as a rifle); team yoke and apron. From above: a small cap and a big pale lump
  below it on a dark body. No cart.
- **Picket** (trooper, 1.08): a pale disc with a thin bar angled up ahead: the rifle's stock and muzzle wrapped in
  pale canvas round a thin dark barrel (r 0.62), a brass bead; a narrow team pack behind. Pale timber on the stock
  was seat 0's own hue and the rifle vanished in gold: a pale thing on a Harbour unit is canvas, not timber. The
  plain rifleman. Dug in (frames 2, 3; `UNIT_POSE`): the rifle still thin and angled up, one course of separate
  sandbags with gaps between them round the front, one of them wetter and darker (`sandbagDark`) so the bags part,
  the groundsheet behind.
- **Harpooner** (lancer, 1.08): the harpoon gun shouldered and angled up ahead (0.52 rad): a timber butt, a tube r
  1.3 served with pale canvas, team canvas over its breech and grip between 0.8-wide ink rings, an iron muzzle ring,
  the harpoon's pale shaft out of it with a dark cork float on the line near the tip and a brass head with barbs
  (brass on the tip only). The shaft, float and head cast no shadow (`userData.noShadow`, read by `scene.js`), so the
  raised gun's shadow stays a third shorter. A small coil of tan rope with a dark eye hangs low at the right hip,
  smaller than the hat. From above: a pale disc, a pale shaft rising ahead with a dot and a barbed tip, a small ring
  at the hip. Team: the sleeves, the hat band (2.7), the pack, the grip and the breech.
- **Mender** (medic, 1.08, unarmed): **the palest-bodied Harbour human**: an ash sailcloth coat (`ash` 0xaaa696, a
  band below the hat, which stays the pale top; a cream coat put the white seat's straps and cross at the coat's own
  value) under a hat with a tall crown, an ink belt, a broad satchel of dark sailcloth (`sailDark` 0x6e6a60) high on
  the back with a **team cross** on its flap and its back face inside ink edges, two team straps over the shoulders,
  a team hem, and a small warm **lamp** (`lampSmall` r 1 with a `lampCore` heart, in a brass cage) carried low in the
  right hand at the hip. From above: a pale disc on an ash figure, a dark crossed square behind the hat, one warm
  dot low at its side. Never a sack on a dark body (that is the Rigger).

Cells (`main.js`): Rigger r 12 h 18, Picket r 17 h 20, Harpooner r 21 h 26 (the raised harpoon's tip), Mender r 15 h 21. Team shares at facing
0 (round 4): Rigger 0.173, Picket 0.173 / 0.214 dug in, Harpooner 0.216, Mender 0.238. The pack:
`node tools/art/review.mjs <dir> --family=hinf`.

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
(84% a base); the review pack picks the same.

**The reef** (`tile(m, v)`, m > 0): dead reef, a shade darker than round 1 (top [86,82,73] to [68,65,58]). A dark face
in the reef's layers on every edge: the tall south face (18 px) as before, and short north (5 px), west and east (4 px)
faces under the bleached lip, so the plateau reads as standing up from all sides (round 1's north edge was only a lip
and read as walkable high ground); a dark foot on the ground at the north and west edges. The top's noise is periodic and
shared by the variants (round 1 used a non-periodic noise: seams); its own marks are three to five ragged, drawn-out pits
(each its own turn and length, a broken edge, low contrast; round 2's round dark pits read as chocolate chips) and one
small bleached nub, at hashed places clear of the edge, no window. The plateau's inside has six variants (`rock_15_0..5`,
`gl/ground.js rockTile`), the edges three. The minimap draws it `#6b665a`.

**The salt field** (`ground.js saltField`, `shard_0..3`, GMATS as above): a field, not a clump (round 3's read as
rubble or rock heaps). A wide flat apron of pale grey-white crust (`apron` 0x4d4c49, radius 17 with an uneven edge,
`patch`; ~109 sRGB in grey in the review's units sheet), bigger than the crystals, under stages 0-2, so a field reads
as a pale patch at 1x; the cell is `unitCell(21, 24)`. 0: nine tall clusters of halite cubes on a darker crust heart
(`crust` 0x46433d), a spill of loose cubes; 1: four lower clusters, the crust dug through to the slate in places; 2: no
standing crystals, slabs of crust and salt over wet slate on the apron; 3: a bare dark pit of wet slate with a film of
brine and an uneven, broken pale rim, two cubes left. The crystals peak near 198 sRGB.

**The brine seep** (`brineSeep`, `vent_0..3`, round 4): the opposite of kelp. Brine a mid teal-green (`seep` 0x1c3a35,
~77 sRGB in grey, near the shallows' value and above the ground's ~40) welling up off centre (`seepDeep`), one small
still glint, in an uneven pool ringed by an irregular pale salt crust (`rim` 0x5a5852, ~135 in grey) with flakes lifted
at its edge, slate stones at no even spacing, three of them in a heap. No rings, no light (round 2's black disc and
rings read as a Vael unit; round 3's dark brine read as a hole, the kelp's twin). The frames: bubbles of brine (a
lighter teal, never foam-white) at five places, each swelling and slumping to a flat slick in turn. The renderer's
violet glow over it is gone (`gl/render.js NodeObj`).

**The scenery** (`scenery2.js`, `SCENERY`; the names are the old props' so the client, the scatter and the tests stay
as they are): on the reef (solid), `boulders_*` a small heap of clams and whelks lying down with rounded brown
pebbles (`shell` 0x5a4a3a, `shellDark` 0x3a3028: brown and dark, never white or grey-white, nothing angular and upright;
round 1's heap read as a cluster of Vael units, round 3's grey pieces and angular stones like the salt's crystals), `spire_*` pilings (weathered `drift` 0x6c6252, a tar line, a barnacle crust, split tops),
`ruin_*` a boat's ribs, `wreck_*` a tarred hull keel up. On the open ground (flat, walked over): `crater_0` an anchor in
the sand, `crater_1` a tide pool (a small film of dull grey-blue water, `pool` 0x131a22, ~54 in grey, under the seep's brine (~77) so it is never taken for one: round 4's mint teal was brighter than the brine; in one lobed outline straight on the sand, its kelp brown-black,
stones half in it, kelp at its west end; no rim and no rings: round 1's dark disc in a pale rim read as a brine seep),
`debris_*` flotsam. The scenery's rope, sailcloth and cork are its own dull materials (`SMATS.rope`, `sail`, `cork`): the
Harbour's pale rope and canvas read as white rings and sheets on the ground.

**Construction and wrecks** (`ground.js`; `foundation_n`, `scaffold_n`, `rubble_n` in seat 0's gold as before):
the Harbour's foundation is a sill of timber beams with iron corner straps, pegs and a string line, flagstones laid at
one corner and a stack of planks; the scaffold timber poles lashed with rope, two ledgers, rope braces, pale canvas
hung on the north and east sides with an ink hem, a gold pennant (no shadow, as before); the rubble broken tarred
planks and timber, bent iron bands, a few scraps of torn sailcloth dirtied grey, flagstones, a coil of old rope (the
dead building's pale canvas and rope are greyed: `RM`, round 3; white squares read as confetti). The Vael's are new
frames for the coder to wire: `bud_n`, a closed pearl bud (five petals with ink seams between them over an ink core,
on a three-lobed ink plinth, one deeplight at the tip; h 8 + 7n), to show in place of or over the warp ghost
(`BldgObj.warpIn`) while a Vael building grows; `rubble_vael_n`, pearl shards greyed by the fall (`RM.pearlDull`
0x48464a, `pearlDark` 0x323134; fewer and larger since round 3: white chips were the brightest thing in the
construction sheet, a field of confetti) and chunks of ink glass round a small dim pool and broken domes, to pick by the dead building's people where `rubble_n` is picked
by its radius.

**The projectiles** (`effects2.js`): `harpoon` (36x10, its tip at the anchor: a dark iron shaft with a lit edge, a
brass barbed head, the pale line paying out behind with a sag) and `beam` (40x8: a lance of deeplight, a white heart in
a violet-blue sheath fading to the tail). `bolt`, `shell` and `missile` are as they were. Both wait for the renderer to
pick a projectile's art by its shooter: today `PROJ_FIELDS` carries only the kind (bolt / shell / missile), which the
Picket, Harpooner, Lens, Kite, Lookout, Petrel, Argonaut and Anemone share, so either a `ProjKind::Harpoon` and
`::Beam` in the sim's data (the Harpooner's and the Lens's) or the shooter's kind in the snapshot and a `PROJ_LOOK`
table in look.js.

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

The grey check (round 4): the pack prints the median and 90th percentile, in the units sheet in grey, of the bare
ground, the kelp, each resource, the seep's brine and rim, the salt's apron, the reef top and the units; the order
to keep is units first, then the seep and the full salt, the kelp always under the ground.

The pack: `node tools/art/review-ground.mjs <dir>` (the ground and units sheets at a phone's size and at 1:1 with the
game's shade layer over them, grey / protan / deutan, every prop at 1:1, construction and rubble of both peoples, the
projectiles at 1:1 and 4x, a Shore-like patch with the water tints and its minimap strip). It renders only the family
and a few units for scale, never the whole atlas.
