# The Vael: Endfall's second race

A design for an alien faction in the spirit of "fewer, pricier, stronger, shielded, high-tech", with its own names,
look and rules. It is written against the sim as it stands (30 Hz deterministic, units with hp / armor / dmg vs
ground and air / range / cooldown / projectiles / splash; buildings with hp, supply, requirements, turrets) and
against the human tables in `src/engine/constants.js` and `crates/endfall-sim/src/data.rs`. Concept renders made
with the real pipeline: `units.png`, `buildings.png`, `phone.png`, `phone_core.png` next to this file; models in
`models_alien.js`.

## 1. Fantasy and theme

**Who.** The Vael laid this world's ether lattice long before anyone else arrived: the ether vents are the breathing
holes of a buried web they grew and then abandoned. They are not bodies but knots of ether that grow a ceramic
shell around themselves; what you see on the field is the shell, lit from inside. "Endfall" is the ebb of the
world's ether tide, and the Vael have come back to draw the last of it off before the lattice goes dark. The human
rigs are squatting on their wells.

**How they relate to ether.** Ether is their blood and their power grid. Their shields are an ether skin that
re-knits itself (shield regeneration); the ceramic underneath does not heal (no repair). Their structures are not
built, they are *grown*: a worker plants a seed crystal and the lattice does the rest (warp-in). Spires are taps
into the lattice and lift everything around them (power fields). Their Siphon sits on a vent and needs no power:
it *is* the lattice.

**Look.** Everything hovers; nothing has legs, wheels or tracks (the cast shadow sits a little apart from the body,
which already reads as "alien" at phone size). Shapes are tapered spindles, crescents, floating rings, leaning slabs
and three-fold symmetry, against the humans' boxy four-square plating.

| | Humans | Vael (v3) |
| --- | --- | --- |
| Hull | warm grey steel `0x7c838e`, khaki `0x8e8664`, iron `0x3d3835`; panel seams, rivets, rust | pearl ceramic: `MeshPhysicalMaterial` with a clearcoat (0.5) and a faint lavender sheen over bone `0xcbc2b1` (reads about `0xd8cfbf` after the sheen; never pure white), lighter top plates `0xdad2c2`, darker undersides `0xa39a8b` and crevices `0x7e766c` for an ambient-occlusion feel; a clean map of hairline curved panel seams with a chipped light edge, engraved channels with inlaid lavender light lines, faint pearly mottling; no grime, rivets or runes |
| Dark parts | gunmetal, rubber | black glass `0x17121f` with a full clearcoat (rings, discs, moats, blades, cradles) |
| Light | team-coloured lamps, cyan glass, orange fire, violet ether at the rig | small faceted violet gems (`0x2a2254`, emissive `0x7260cc` at 0.55) with a bright core and three translucent additive halo shells (0.16 / 0.09 / 0.045) so the glow falls off; ether lines at 0.95; every emissive stays under 1.0 so ACES never clips it to white |
| Team colour | painted plates, big panels | full-saturation glaze with a clearcoat and a faint iridescence (0.35), kept to bands, ring arcs, wingtips, petal caps, chest and pauldron plates |
| Ground | concrete slabs | three-lobed pearl plinths (dark base, pearl step, glass ring) with a soft violet pad and its halo |

Three passes were rendered and all are kept for comparison: v1 (un-prefixed PNGs: near-white, flat, read as vector
art), v2 (`v2_*`: weathered bone, bronze, soot and greebles; realistic but too close to the humans) and v3 (`v3_*`:
v1's shapes and palette with physical materials, clean seams, layered plates and glow falloff). v3 is the direction
to build from; `models_alien.js` is v3, `models_alien_v2.js` is v2, `v1src/models_alien_v1.js` is v1.

Both team colours (amber `0xd98a1f`, crimson `0xc22a5a`) sit well on pearl, and pearl against the dark painted
ground is the strongest contrast in the game, so the Vael pop at phone zoom even when the team colour is a sliver.
The violet is far enough from the crimson team colour not to be mistaken for it (checked on `v3_phone.png`).

Each unit has a different top-down glyph, which is what a phone player actually sees: Lumen = droplet, Scythe = tall
spindle with two black blades, Prism = ring around a dark gem, Monolith = black disc under a white slab, Shrike =
white crescent, Halo = thin team ring with a white heart.

## 2. Names

Race: **the Vael** (noun and adjective: "a Vael Kiln", "the Vael"). Words from light, glass and geometry; nothing
religious or arcane, nothing from StarCraft.

| Buildings (chars) | Units (chars) |
| --- | --- |
| Conflux (7): command core | Lumen (5): worker |
| Spire (5): supply + power | Scythe (6): melee |
| Siphon (6): ether, on a vent | Prism (5): ranged, ground and air |
| Kiln (4): trains ground units | Monolith (8): siege, splash |
| Loom (4): tech and research | Shrike (6): fast flyer |
| Ward (4): static defence | Halo (4): shield mender (phase 2) |
| Zenith (6): trains flyers | Eclipse (7): capital flyer (phase 3) |

Keys for the tables: `conflux, spire, siphon, kiln, loom, ward, zenith`; `lumen, scythe, prism, monolith, shrike,
halo, eclipse`. Hotkeys (no clash inside a race's card): Spire S, Siphon E, Kiln K, Loom L, Ward W, Zenith Z,
Conflux C; Lumen L, Scythe S, Prism P, Monolith M, Shrike H, Halo A, Eclipse E.

## 3. Economy

**Worker.** The Lumen mines exactly like the Harvester: same `MINE_SLOTS`, `SHARD_MINE_TIME`, `ETHER_MINE_TIME`,
loads and drop-off at the Conflux. This keeps the income curves, the saturation numbers (100/192/240 per minute on a
field) and the AI's harvester counts valid for both races, so the economy needs no re-tuning. Differences: 20 hull +
20 shields instead of 40 hp (a Shrike or Wasp that is chased off leaves a mineral line that heals itself), it hovers
(still a ground unit for pathing and fog), and it cannot repair.

**Warp-in.** A Lumen receiving a `build` order walks to the site, plants the seed (the building appears as a
`foundation`-like seed sprite at 0% progress) and is free at once. Construction then progresses on its own at the
building's `build` time, never stalls for lack of a builder, and cancels and refunds as today. In the sim this is a
`warp: true` flag on the race's building defs: the construction tick skips the "builder present" check and the order
handler releases the worker after `place`. Cost: the Lumen is back on shards about one build time earlier than a
Harvester would be, worth roughly one extra worker in the first five minutes; the price is paid in the power rule.

**Supply and power.** The Conflux gives 10 supply and a power field of 7 tiles; the Spire gives 8 supply and a field
of 6.5 tiles (centre to building centre). Kiln, Loom, Ward and Zenith must be *placed* inside a field and go **dark**
when no finished Spire or Conflux covers them: a dark building does not train, research or fire, and its queue
pauses with a toast ("Kiln unpowered"). Spire, Siphon and Conflux never need power. Because the Spire is both the
supply building and the power source, the Vael player naturally scatters them through the base; the counterplay is
to snipe the Spire behind a Ward line or a production cluster, which is why a Spire has only 200 hull + 200 shields.

**Shards and ether.** Same two resources, same gather rates. The Vael spend ether earlier and on more things: the
Prism (their second unit) already costs 50 ether, the Loom 100, Shrikes 75, so a Siphon in the first two minutes is
mandatory where a human can delay the Ether Rig. The dry-vent trickle applies to the Siphon too.

## 4. Mechanics

Kept deliberately small: three rules for phase 1 that touch the existing systems in known places, one support unit
for phase 2, one signature unit for phase 3. No new order types until phase 3.

| Mechanic | Phase | Rule | Where it lives in the sim |
| --- | --- | --- | --- |
| **Shields over hull** | 1 | Every Vael unit and building has `sh / maxsh`. Damage goes to shields first at full value (armor ignored), the rest to hull minus armor exactly as today. After `SHIELD_DELAY = 6 s` without taking damage shields regenerate at `SHIELD_REGEN = 3/s` (units) or `2/s` (buildings); hull never regenerates. Damage events carry `shield: true` while shields absorb, so the client flashes a pale ring instead of sparks. | `apply_damage` (one branch), a `last_hit` tick per entity, a per-tick regen pass (f64 `3 * DT`, through `jsmath`), `state_hash` includes `sh`, the snapshot arrays gain `sh/maxsh`, the HUD draws a second pale bar over the health bar. |
| **No repair** | 1 | Lumens have no repair order; damaged Vael hull stays damaged. Shield regen is the repair. The AI's repair routine is skipped for the race. | Gate the repair order on race; one line in `ai.rs`. |
| **Warp-in** | 1 | See Economy. The seed is unarmed and has shields from the start, so a harassed site is not an instant loss. | `warp` flag on `BldgDef`, construction tick, order handler. |
| **Power fields** | 1 (placement + dark state) | Buildings with `needs_power` are placeable only inside a field and go dark when uncovered. Recomputed every tick: O(buildings x sources), under 2000 checks a tick. | `can_place`, a `powered` flag refreshed in the per-tick building pass, gates on `train/research/turret fire`; client draws the field ring while placing. |
| **Splash (Monolith)** | 1 | Reuses the Vanguard's shell splash code with its own constants (50% within 40 px, walking units of the target's side). | `SHELL_SPLASH*` generalised to per-unit fields `splash_r, splash`. |
| **Shield mending (Halo)** | 2 | The Medic rule applied to shields: 10 shields/s into the nearest damaged Vael unit within 3 tiles, one Halo per patient, works in combat (the only thing that restores shields under fire). | The `heal` path with a target filter on race + a `mend` field. |
| **Shields research** | 2 | The Loom's second research replaces Armor: +1 damage reduction on shields per level (min 1 damage, like armor). Weapons is unchanged. | A per-team `sh_armor`, mirrored from `Upgrade::Armor` by race. |
| **Signature (Eclipse "Umbra")** | 3 | A passive aura: allied Vael units within 4 tiles of an Eclipse regenerate shields in combat at 2/s (no delay). No new orders, no targeting. | A per-tick flag on units under an Eclipse. |

What is left out on purpose: cloaking and detection (the humans have no detector; it would need a new system on
both sides), blink/teleports (new order type, pathing edge cases), warp-gate-style remote reinforcement (fog and
pathing complications), and a shield battery building (the Halo does it and moves with the army).

## 5. Roster

Stats are in the terms of the current tables: cost [shards, ether], supply, hull (`hp`), shields, armor, speed px/s,
range in tiles, damage vs ground / air per shot, cooldown s, build s. "Value" is the duel harness's
`shards + 2 x ether`. Numbers are starting points to be measured with `duel` (section 8), not promises.

### Units

| Unit | Cost | Sup | Hull | Sh | Arm | Spd | Rng | Dmg g/a | Cd | Build | Sight | r | From / requires | Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Lumen | 50/0 | 1 | 20 | 20 | 0 | 100 | 0.6 melee | 4/0 | 1.0 | 12 | 7 | 9 | Conflux | Mines, plants structures, free at once. No repair. |
| Scythe | 100/0 | 2 | 80 | 60 | 1 | 105 | 0.9 melee | 16/0 | 0.9 | 22 | 8 | 10 | Kiln | Fast hover-knight. Closes on infantry, 18 dps, no anti-air. The front line. |
| Prism | 125/50 | 2 | 70 | 80 | 1 | 85 | 5.5 | 14/14 | 1.0 | 30 | 9 | 11 | Kiln | The generalist: shoots ground and air with a lavender beam (`lance` projectile; phase 1 can reuse `bolt`). |
| Monolith | 200/125 | 4 | 160 | 140 | 2 | 55 | 7 | 45/0, splash 50% in 40 px | 2.2 | 40 | 9 | 15 | Kiln, needs Loom | Siege slab. Outranges Vanguards and matches Turrets; cannot shoot up. |
| Shrike | 125/75 | 2 | 90 | 60 | 0 | 165 | 3.5 | 12/8 | 0.7 | 28 | 9 | 11 | Zenith | Fast flyer. Raids workers, hunts Wasps (which cannot shoot air), dies to Lancers. |
| Halo | 75/50 | 1 | 40 | 40 | 0 | 110 | 0 | 0 | mends 10 sh/s | 20 | 10 | 8 | Kiln, needs Loom | Phase 2. Unarmed hovering ring; the army's medic and its best scout on the ground (sight 10). |
| Eclipse | 300/200 | 6 | 200 | 200 | 2 | 90 air | 6 | 24/24 | 0.8 | 60 | 10 | 16 | Zenith, needs Loom | Phase 3. Capital flyer; Umbra aura. |

Value per unit: Lumen 50, Scythe 100, Prism 225, Monolith 450, Shrike 275, Halo 175, Eclipse 700. Compared with the
humans (Trooper 50, Lancer 125, Vanguard 275, Wasp 220, Medic 80) the Vael pay about the same per point of hp + dps
in a single fight, get fewer units per supply (a Scythe is 2 supply for 140 total hp), and win back the difference
between fights through regeneration. Armor sits on the hull only, which makes the Vael weaker against big hits
(Vanguard shells go straight through shields) and stronger against many small ones once shields are down.

### Buildings

| Building | Cost | Size | Hull | Sh | Arm | Supply | Build | Sight | Requires | Power | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Conflux | 400/0 | 4x4 | 1000 | 400 | 2 | 10 | 80 | 10 | – | source, 7 tiles | Trains Lumens, drop-off. |
| Spire | 100/0 | 2x2 | 200 | 200 | 1 | 8 | 25 | 6 | – | source, 6.5 tiles | The base's skeleton; cheap to snipe. |
| Siphon | 75/0 | 2x2 | 300 | 150 | 1 | – | 25 | 5 | – (on a vent) | none needed | Lumens mine ether from it. |
| Kiln | 150/0 | 3x3 | 500 | 300 | 1 | – | 45 | 7 | – | needs | Trains Scythe, Prism; Halo and Monolith with a Loom. |
| Loom | 150/100 | 2x2 | 500 | 300 | 1 | – | 45 | 7 | Kiln | needs | Researches Weapons and Shields; unlocks Monolith, Halo, Zenith. |
| Ward | 125/0 | 2x2 | 200 | 220 | 1 | – | 25 | 9 | Kiln | needs | Range 7, 20 ground / 28 air, cd 1.2, `lance`. A Turret that heals itself and goes dark without a Spire. |
| Zenith | 175/125 | 3x3 | 500 | 300 | 1 | – | 55 | 8 | Loom | needs | Trains Shrike; Eclipse in phase 3. |

Totals run 10 to 30 percent above the human equivalents (Ward 420 vs Turret 320, Spire 400 vs Depot 360) to pay
for the power rule and the regen delay; a Vael base that is being hit does not regenerate.

### Counters

Read as "row versus column at equal value on open ground" from the row's point of view: `>>` hard win, `>` win, `=`
within +/-0.3 in `duel`, `<` loss, `<<` hard loss, `-` cannot interact. The second table is the same fights seen
from the human side, so both races' players can read their own.

| Vael vs | Harvester | Trooper | Lancer | Medic+Trp | Vanguard | Wasp | Observer | Turret |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Lumen | = | << | < | << | << | << | - | << |
| Scythe | >> | = (wins small fights, loses to a massed line) | >> | < | = (closes fast; splash punishes the clump) | << cannot hit | - | < (needs numbers) |
| Prism | >> | = | > | = | < outranged, shells ignore shields | > outranges and shoots up | > | = range 5.5 vs 7 |
| Monolith | >> | = (splash) | >> | > | > outranges | << cannot hit | - | = equal range, 45 vs 320 |
| Shrike | >> raids | < | << | < | >> | > (Wasps cannot shoot air) | > | < |
| Halo | - | - | - | - | - | - | - | - |
| Scythe+Prism | >> | = | > | = | = | > | > | < |
| Prism+Monolith | >> | > | >> | > | > | < | > | > |

| Human vs | Lumen | Scythe | Prism | Monolith | Shrike | Ward |
| --- | --- | --- | --- | --- | --- | --- |
| Trooper | >> | = | = | = | > | < |
| Lancer | > | << | < | << | >> | < |
| Vanguard | >> | = | > | < | << cannot hit | > outranged by 0, but 170 hull and splash |
| Wasp | >> raids | >> | < | >> | < | < |
| Medic+Trooper | >> | > | = | < | > | < |
| Turret | >> | > | = | < | > | - |

The loop to protect: **Scythes beat Lancers and workers; Troopers hold Scythes; Prisms beat Wasps and Lancers;
Vanguards beat Prisms; Monoliths beat Vanguards and Turrets; Wasps and Shrikes beat Monoliths; Lancers and Troopers
beat Shrikes; Shrikes beat Wasps and Vanguards.** Every human unit has a Vael answer and vice versa, and the Vael
answer to air is always the Prism (plus Wards), which keeps their composition decisions simple on a phone.

## 6. Tech tree

```
Conflux (400/0, supply 10, power 7)  ── trains ──>  Lumen
   │
   ├── Spire   (100/0, supply 8, power 6.5)          no requirement, no power needed
   ├── Siphon  (75/0, on a vent)                     no requirement, no power needed
   └── Kiln    (150/0, needs power)  ── trains ──>  Scythe, Prism
         │                                           (+ Monolith, Halo once a Loom stands)
         ├── Ward  (125/0, needs Kiln, power)        static defence, ground and air
         └── Loom  (150/100, needs Kiln, power)      Weapons 1-3, Shields 1-3
               │                                     unlocks Monolith and Halo at the Kiln
               └── Zenith (175/125, needs Loom, power) ── trains ──> Shrike
                                                         (+ Eclipse, phase 3)
```

Depth matches the humans (Garrison -> Foundry -> Airfield) so the AI's timings transfer: the Vael reach their first
flyer at about the same minute, pay more for it, and get a better one.

## 7. AI notes

The scripted opponent (`ai.rs`) keeps its difficulty table (`harv`, `rax`, `first`, `gap`); only the build and the
wave recipes change by race. Wave sizes count value, not units: a Vael wave has about 60 percent of the human wave's
unit count (`wave 4 / grow 2` on Medium against `7 / 3`).

**Opening (Medium).**
1. Four Lumens on shards; the Conflux trains Lumens to 13 (16 on Hard) without a gap.
2. At 8/10 supply: Spire 1, inside the Conflux's field and towards the natural choke, so the Kiln can go between.
3. 150 shards: Kiln 1 inside Spire 1's field. The Lumen returns to mining as soon as the seed is planted.
4. 75 shards: Siphon on the near vent; three Lumens to ether when it finishes.
5. Kiln done: Scythe, Scythe, then alternate Prism / Scythe. Rally at Spire 1.
6. 16/18 supply: Spire 2, placed so that Kiln 1 sits in *two* fields (losing one Spire never darkens production).
7. 150/100: Loom, then Kiln 2 (`rax` per difficulty), Weapons 1 when the Loom finishes.
8. Every fourth unit after the Loom is a Monolith; Zenith after Spire 3; Shrikes in pairs.
9. Expansion as the human AI (Medium and Hard): a Conflux at the natural, Spire first, Siphon on its vent.

**Using the units.**
- Attack-move in one block with Scythes in front (they are faster, so they arrive first anyway; the AI should
  spawn-order them last in the wave so they lead by only a little), Prisms behind, Monoliths last; Halos (phase 2)
  with the Prisms.
- Answer seen flyers with Prisms, not a new unit: keep two Prisms at home once a Wasp has been seen, and plant a
  Ward at the shard line (the same trigger that makes the human AI build Lancers and a Turret).
- Shrikes raid the enemy mineral line in pairs, retreat when hull drops under half, wait out the regen delay
  behind the Zenith and go again. Against a Turret they switch to hunting Vanguards in the field.
- Pull a beaten wave back exactly as today, but a Vael wave that retreats waits until shields are full before the
  next push: this is where the race gets its value and the AI should visibly use it.
- Spire discipline: never place a production building covered by a single Spire; rebuild a lost Spire before
  anything else (a dark Kiln is the first thing the AI should notice).

**The human AI against the Vael** (phase 2): target priority already prefers shooters; add "a Spire covering a
dark-able building" as a plain-building bonus so Wasp raids go for Spires, and prefer Vanguards once Prisms are seen.

## 8. Balance targets (duel harness)

`crates/endfall-sim/tests/gameplay.rs` `duel(a, b, budget)` is generic over `UnitKind`, so it takes the new kinds
as soon as `unit_value` knows their costs. Targets at budgets 1100 and 2200, median of three offsets as today:

| Fight | Target | Why |
| --- | --- | --- |
| Scythe vs Trooper | -0.2 .. +0.3 | Melee must be even with the cheapest ranged unit or the race has no opening. |
| Scythe vs Lancer | > 0.5 | Lancers are the air answer, not a ground one. |
| Scythe vs Vanguard | -0.4 .. +0.4 | Speed against splash; measure before tuning. |
| Wasp vs Scythe | > 0.9 | Cannot interact; must be true by construction. |
| Prism vs Wasp | > 0.4 | The Vael anti-air works. |
| Prism vs Lancer | > 0.5 | |
| Prism vs Trooper | -0.3 .. +0.2 | The generalist is not a Trooper upgrade. |
| Vanguard vs Prism | > 0.3 | Siege beats the generalist. |
| Monolith vs Vanguard | > 0.0 | Range 7 vs 6 and 300 total hp earn a narrow win. |
| Monolith vs Trooper | > -0.3 | Splash keeps it honest against spam. |
| Wasp vs Monolith | > 0.9 | By construction. |
| Shrike vs Wasp | > 0.6 | Wasps cannot shoot air; the Shrike is the air-superiority answer. |
| Lancer vs Shrike | > 0.6; Trooper vs Shrike > 0.3 | Same answers as against Wasps. |
| Shrike vs Vanguard | > 0.6 | |
| Scythe+Prism vs Trooper+Vanguard | -0.3 .. +0.3 | The two standard mid-game armies. |
| Scythe+Prism vs Trooper+Lancer | > 0.2 | |
| Prism+Monolith vs Trooper+Vanguard | > 0.0, but vs Wasp < 0.0 | Siege compositions need anti-air escort. |
| Raid: 2 Shrikes vs undefended Harvesters | 8/8 lost | Same as 2 Wasps. |
| Raid: 2 Shrikes vs 1 Turret or 4 Troopers | both Shrikes die, <= 4 lost | Same bar as Wasps. |
| Raid: 2 Wasps vs 1 Ward | both Wasps die, <= 4 Lumens lost | The Ward is at least a Turret. |
| Regen: a Scythe at 0 shields, untouched | full shields in <= 30 s (6 + 60/3 = 26) | Guards the constants. |
| Dark Kiln: kill the only Spire covering it | training pauses, resumes when a Spire finishes | Rule test. |
| Warp-in: Lumen plants a Kiln and is ordered away at once | the Kiln still finishes at 45 s | Rule test. |
| AI vs AI on Medium, 20 seeds | the Vael AI wins 35 to 65 percent, every game ends inside 15 minutes | `the_ai_finishes_games` extended across races. |

Also keep `random_play_never_breaks_the_world` green with the Vael tables (invariants: `0 <= sh <= maxsh`, dark
buildings keep valid queues, power fields do not leak across teams).

## 9. Phased implementation plan

**Phase 0: race plumbing (one PR, no new gameplay).** A `Race { Human, Vael }` on each team (`World.race[team]`,
chosen in the start menu for the player and the opponent; `Game::new` takes it). `race` on `UnitDef` and `BldgDef`;
`UNIT_KINDS` / `BLDG_KINDS` append the Vael entries (the enums are append-only); `BUILD_ORDER` and the Build card
filter by race; `constants.js` mirrors the tables and `test/engine.test.js` keeps checking them. Sprite names derive
from unit keys, so the renderer needs nothing but the frames: `tools/render3d` gains `models_alien.js` (the file
next to this document, with its materials) and `generate.mjs` lists the new unit frame counts (2 each).

**Phase 1: playable Vael.** Units Lumen, Scythe, Prism, Monolith, Shrike; buildings Conflux, Spire, Siphon, Kiln,
Loom (unlock and Weapons only), Ward, Zenith. Rules: shields and regen, no repair, warp-in, power fields (placement
and the dark state), Monolith splash. Client: shield bar over the health bar, pale shield-hit flash, the power ring
while placing, "unpowered" toast, race-neutral `seed_<n>` construction sprite in place of the scaffold, a `lance`
projectile frame (or a tinted `bolt`). AI: the Vael build and waves above. Tests: one scenario per rule, the duel
targets, the AI games. Exit: a Medium game against the Vael AI is winnable and losable on a phone, and a Vael
player can beat the human AI on Easy.

**Phase 2: depth and feel.** Halo and shield mending; Shields research; Vael sounds (glassy, choral; the audio
engine is synthesised, so this is recipes, not assets); race-specific portraits and descriptions on the phone
console; the human AI's Spire targeting; the balance matrix across both races with thresholds in
`the_counters_hold_in_cost_equal_fights`; Siphon trickle parity; a second look at the Scythe (the melee unit is the
one most likely to need a number change after real games).

**Phase 3: signature and symmetry.** Eclipse with the Umbra aura; Vael vs Vael mirror (Ward and Spire sniping,
Shrike vs Prism); race choice in the multiplayer lobby once lockstep exists; optional later: a Lumen "probe" cheaper
scout once mirrors show the Vael need one, and hand-authored maps with vent placement that suits both races.

## 10. Readability notes from the renders

- At phone zoom (`phone.png`, 844x390, 1.75 screen px per world px) the ivory-against-dark-ground read separates
  the races before any shape is recognised; the humans are the dark cluster, the Vael the bright one.
- Team colour reads on every Vael unit except the Lumen, where it is a fin (fine for a worker: the humans' Harvester
  is identified by its cab in the same way).
- The Spire is the tallest thing in either base (needle 76 units; the human Foundry's chimneys are 72), which is
  right: it is the structure the enemy should find.
- The Monolith's black disc makes it the heaviest-looking Vael unit from above, and it is still smaller than a
  Vanguard's footprint (`r` 15 vs 14 in the sim; 22 vs 26 in the sprite cell).
- Watch on the lighter map kinds (Glass Reach): ivory on pale ground loses contrast; the black glass undersides and
  the hard shadow of the finish carry the silhouette there.
- Pipeline lessons for whoever models the rest: the ACES tone mapping clips any emissive above about 1.5 intensity
  to white and flattens near-white albedo into shadeless shapes (keep hulls mid-tone, `0x85..0xb6`, and emissives
  under 1.0); a crystal "inside" black glass never shows, so crystals are one self-lit `gem` mesh; and a smooth
  primitive has nothing for the ink pass to draw, so plates, seams, studs and collars are what make a model look
  rendered rather than drawn. With
  the camera due south at 55 degrees, never put a tall part on the south side of a centre piece: the Conflux petals,
  Ward claws, Siphon petals and Zenith towers all sit at north / east-south-east / west-south-west or east / west.
- Files: `models_alien.js` (v3 models, textures and `makeVaelMats`; `models_alien_v2.js` and
  `v1src/models_alien_v1.js` are the earlier passes), `tools/render3d/main_alien.js` + `index_alien.html` (the
  renderer page), `render_alien.mjs` (plan, compositing, the sheets). `node render_alien.mjs /tmp/racedesign v3_`
  regenerates the four v3 PNGs in about 30 s.
- Realism without the human vocabulary (v3 lesson): what made v2 look human was bronze, verdigris, soot, rust and
  studs, not the realism itself. Shading on a light hull comes from keeping the albedo around `0xcb..0xda` under the
  clearcoat (a `0xde+` albedo clips to flat white under ACES), from a darker underside and crevice tone on every
  layered plate, and from seams drawn dark enough (1.8 px at 0.8 alpha on the 256 px map) to survive the 2x
  downsample; glow needs emissives under 1.0 plus translucent halo shells for falloff.
