# Ebbfall's look: the style sheet

The sea has ebbed and left a country of salt; two peoples fight over it. Every sprite is a lit 3D model (three.js,
`tools/render3d`) shot by `scene.js` at 4x, finished (hard cast shadow, ink on silhouettes and sharp edges, a contrast
S-curve, 5-bit banding) and packed at 2x the game's units. The banding and the ink are the retro part; the materials
are the "not drawings" part. Nothing here is a flat fill, a cartoon outline or a brush stroke: form shows by light on
material, wear sits on edges, and every unit casts a real shadow.

Step 0 (the slice) set this sheet with six models: the Rigger, Picket and Lighthouse (`harbour.js`), the Glint, Lens
and Tidewell (`vael2.js`), plus the seabed (`tools/art/terrain2.js`) and the salt field (`buildings.js shardField`).
Later makers build from it; where a later model needs a material that is not here, add it to `materials.js` /
`vael.js makeVaelMats` and to this sheet in the same change.

## The ground

The drained seabed: wet sand and slate, salt crust in thin veins, flat dark strands of drying kelp. It is the darkest thing
on screen: mean value about 0.18 (sRGB 45-55), nothing on it brighter than the dim salt (sRGB ~140) and that only in
thin veins. Palette (`terrain2.js`): sand `[58,54,47]`, wet sand `[44,42,38]`, slate `[40,44,50]`, salt `[142,140,130]`,
dim salt `[96,95,88]`, kelp `[26,32,27]`, dark kelp `[18,22,19]`. The base tile (`ground_0`, most of the map) is calm:
sand with slate showing through, soft ripples bent by noise (no direction may show at 2x), a low slate ridge as a
contour; nothing that repeats visibly. The variants (`ground_1..5`) carry the marks, faded out at the tile's edge: thin
branching low-contrast salt veins on smooth curves (never zigzags), two or three flat dark kelp strands, a cracked plate
of crust, shells and pebbles clustered by noise at 0.6-1.4x, a piece of driftwood with a lit edge and a shadow.
All base noise is periodic over the 64 px tile (scale x period = 64) so tiles seam. The rock plateaus keep the old
blue-grey slate for now.

The salt field (`shard_0..3`): halite grown in cubic clusters on a bed of wet slate under a pale crust. Salt is pale
by itself (`salt` 0xe4e0d4 rough 0.42, `saltWet` 0xc4c8c8 rough 0.25, flat shaded) and carries no light. Stage 3 is
nearly mined out: fewer, lower clusters, the crust dug through to the slate.

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
| Breakwater (`vanguard`)     | the boat hull on legs: a tarred hull 29 long with its stem ahead, plank seams and iron straps on its bare bow and stern decks, an iron gunwale, a canvas tarp humped over midships (two-tone: pale forward of an ink bar, team aft of it, a rope hoop and a ridge seam on the pale part, a dark worn hem), four dark iron legs standing under it, a short mortar on the stem | heavy (14), the hull 8 up on its legs | the strake along both hull sides (3.4 tall) between ink lines, the aft half of the tarp, the aft deck inside an ink seam, the knee caps and the foot pads' tops | the forward half of the tarp                     |
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
