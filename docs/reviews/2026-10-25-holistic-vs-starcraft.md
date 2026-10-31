# Endfall vs. StarCraft (1998): a holistic review and plan

Reviewed 2026-10-25 on `main`, build in `/tmp/dist-review`, played on the Playwright phone (844x390, touch) through the
real UI; scripts `play.mjs` / `perf.mjs`, log `log.txt`, screenshots `shots/`. Also read: README, CLAUDE.md, docs/PLAN.md,
the data tables, the AI, the client, and the two earlier phone playtests (`/tmp/playtest2`, `/tmp/playtest3`).

## 1. Verdict

**Where it already matches StarCraft.** The macro skeleton is the real thing, not a sketch: two resources with a
refinery on the second, supply buildings, production and tech buildings gating units, three-level weapon/armor
upgrades, rally points, attack-move, hold, control groups, fog of war with remembered buildings, point-symmetric maps
with a natural and a centre, saturation mining (one worker per patch, three per field), a second base, and an opponent
that scouts, remembers, expands, raids workers and retreats a broken wave. The two races are asymmetric in the right
Protoss/Terran way (shields that regenerate vs. repair, warp-in vs. a worker who babysits, power fields vs. none).
The phone controls are better than any port of a 1998 RTS: tap-to-command, the SELECT button, Army/Idle chips, the
three-column card with fixed slots, long-press details, a box that drops workers, warp-in that frees the thumb. The
sim is deterministic and fast (a 200-unit brawl steps in 1.3 ms a tick; sim cost is not a concern on any phone), the
art is coherent (pre-rendered 3D, 16 facings, lights, debris, scorch, shake), the sound is positional and race-specific,
and it installs and plays offline. The restraint (few numbers, no timers, Easy default) is right for a phone.

**Where it falls short.** StarCraft's depth did not come from its macro loop; it came from (1) units with abilities
that reward attention (Stim, Siege Mode, Burrow, cloak and detection, spells), (2) races that *play* differently
(larva, warp-in anywhere, add-ons, flying supply), (3) terrain with meaning (main on high ground behind a ramp, a
natural to defend, chokes, 128x128 travel time), (4) branching tech that makes scouting and timing attacks matter, and
(5) an AI that is a sparring partner rather than a wave timer. Endfall has none of (1): no unit has a button beyond
Attack/Hold; there is no cloak, no detection, no spellcaster, no transport. Its two rosters are a mirror (Scythe/Prism/
Monolith/Halo/Shrike = Trooper/Lancer/Vanguard/Medic/Raider with shields), so the second race is felt in the economy
but not in the army. Tech is a single corridor (Garrison -> Foundry -> Airfield) and games end at 30-50 of 200 supply in
6-12 minutes: there is no mid-game decision and no late game. The maps are generated noise with no ramp, cliff, or
designed choke, and the 64x64 size makes an attack a 35-second walk, so expansions are rarely worth the risk. The AI is
a scripted wave generator whose difficulty is an income multiplier (0.75 / 0.9 / 1.35): Hard has nine Troopers in a
passive player's base at 3:00 and the Core down at 3:29; Medium out-produced every phone player in three playtests;
Easy is now fair. It does not read the player's army, never attacks two places, and leaves its expansion naked.
Onboarding is a 1,800-character How-to card and one toast; feedback lacks an announcer, unit voices, a readable
"shields down" state, and a meaningful end screen; there is no music, no replay, no record of play.

In one line: Endfall is a very good *RTS macro toy* with the best phone controls in the genre; to stand next to
StarCraft it needs a micro layer (abilities), a map grammar (main/natural/choke), a real second race in the army, and
an opponent that plays rather than cheats.

### The game by numbers (for calibration)
- Shards: 8 per 2 s trip, a field saturates at 3 Harvesters (100/192/240 per min). Ether: 6 per 1.6 s. Start 50 shards,
  4 workers, 10 supply. Supply cap 200; the biggest army seen in any playtest was 25 units.
- First AI waves: Easy 240 s (5 units), Medium 170 s (7), Hard 120 s (9), scaled 0.6 for the Vael; waves grow by 2/2/4.
  Research from 600/420/300 s; the second base at never/420/330 s. AI income x0.75 / x0.9 / x1.35.
- Game length in six logged games: 5:45 to 17:39, median about 8:30. Half of them ended with 1,500-5,700 unspent shards.
- Sim: 1.30 ms per tick with 200 units fighting (`perf.mjs`). Client bundle about 47 kB gzipped plus PixiJS; one
  cross-origin request (Google Fonts) that the offline cache cannot keep.

## 2. Prioritised improvements

Size: S = an afternoon, M = a few days / one PR with tests, L = a week or more, several PRs. "Owner" = needs the
owner's decision (a new big feature or a reversal of a standing decision); "Auto" = can be done autonomously within the
standing decisions. Files are where the change lands, by the layout in CLAUDE.md.

### Tier 1: what StarCraft has and Endfall lacks outright

**1. One tap-ability per combat unit (the micro layer).** Why: with only Attack and Hold, a fight is decided when the
armies are built; nothing rewards the player for looking at it. Start with four self-cast or toggle abilities that need
no target (one tap on the card, so they work on a phone): Trooper **Stim** (10 s of +50% fire rate for 10 hp, no
Medic needed), Vanguard **Entrench** (siege: range 6 -> 9, splash x1.5, cannot move; 2 s in and out), Scythe
**Blink** (hop 4 tiles towards its target, 20 s cooldown), Monolith **Overcharge** (next three shells at double rate,
drains shields). Each is one `Command`, one button, one sim rule with a test and a golden update; the AI uses them in
`ai_defend` and `ai_steer_wave` (Stim when engaging, Entrench when a wave stops). StarCraft: Stim Pack, Siege Mode,
Burrow; Blink is SC2's but the Dragoon/Zealot speed research played the same role. Size L. Owner (new big feature;
confirm the four picks). Files: `data/mod.rs` (UnitDef ability + cooldown), `data/humans.rs`, `data/vael.rs`,
`world/command.rs`, `world/orders.rs`, `world/combat.rs`, `lib.rs`, `snapshot.rs`, `src/engine/core.js`,
`src/engine/constants.js`, `src/client/hud.js` (card slot + cooldown ring), `src/client/gl/render.js` (state glow),
`ai/army.rs`, `tests/gameplay/combat.rs`, `tests/golden.rs`, `test/e2e/gameplay.e2e.mjs`.

**2. A map grammar: main, ramp, natural, chokes (hand-authored layer over the generator).** Why: every StarCraft
strategy (wall-in, contain, timing push at the natural, drop in the main) is a response to the map's shape; Endfall's
noise terrain has no shape to respond to, and a 35-second walk between bases makes "map control" meaningless. Give the
generator a template: the main in a pocket with one 3-tile entrance, the natural's field just outside it, two more
expansions, an open centre with a field; keep point symmetry. Store templates as a tiny JSON (PLAN M2 already wants a
map format) so the three named maps become authored, and let Random draw a template plus noise. 64x64 can stay if the
pocket adds walking distance; otherwise this is the moment to do the 128x128 estimate in PLAN (one M PR). High ground
as *vision only* (no miss chance) is a cheap second step: cliffs block sight upward. StarCraft: Lost Temple's main/ramp/
natural, Python. Size L. Owner (map format and whether to resize). Files: `map.rs` (templates, `place_fields`),
`data/mod.rs` (BASES), `ai/build.rs` (`expansion_spot`), `ai/scouting.rs` (sweep points), `src/client/scenery.js`,
`src/client/menu.js` (MAPS), `tests/gameplay/maps.rs`, `test/scenery.test.js`.

**3. Make the Vael *army* different, not just shielded: warp units in at any power field.** Why: the playtests said it
plainly: "the Kiln card is Scythe/Prism/Monolith, i.e. Trooper/Lancer/Vanguard with shields." The race's one original
idea (warp-in, power fields) stops at buildings. Let a Kiln's unit appear at the power field nearest its rally point
(a Spire forward is now a forward production point and a target worth killing), with a 5 s warp-in during which the unit
is helpless; the Kiln's own ring is the default. Humans keep the slower, safer Garrison but gain a **Reinforce** queue
(queue five with one long-press) to make their macro feel industrial rather than identical. StarCraft: Protoss
Gateways and Pylons (SC2 Warp Gate made it literal); Terran add-ons. Size M. Owner (new mechanic). Files:
`world/spawn.rs`, `world/orders.rs` (rally semantics), `world/construction.rs` (power lookup), `ai/army.rs` (forward
Spire rally), `src/client/gl/render.js` (warp-in effect), `hud.js`, `tests/gameplay/economy.rs`.

**4. Cloak and detection: a cloaked Observer, detecting Turrets/Wards, one cloaked raider per race.** Why: the
scout/detector tension is half of StarCraft's mid game and it is wholly missing; the Observer is just a fast kite.
Make the Observer cloaked (visible only inside a Turret/Ward/Observer-detector radius), the Turret and Ward detectors,
and give each race one cloak-capable unit later (Raider cloak toggle that drains a small energy bar; a Vael "Veil" Scythe
variant from the Loom). The AI answers with a Turret at the mineral line once it has seen a cloaked unit (it already
has `seen_air_until` as a template). StarCraft: Observer, Wraith, Ghost, Dark Templar, Missile Turret. Size L. Owner.
Files: `data/*.rs`, `world/fog.rs` (per-seat detection grid), `world/combat.rs` (targeting filter), `render.js`
(shimmer for own, nothing for the enemy), `ai/army.rs`, `tests/gameplay/combat.rs`.

**5. A guided first game instead of the How-to card.** Why: StarCraft taught by mission (Boot Camp, Rebel Yell 1-2);
Endfall's onboarding is a text card nobody on a phone reads, then an attack at 4:00. Add a "FIRST GAME" entry on the
menu (Easy, Ashen Basin, Humans) with a six-step checklist overlay driven by sim state: train two Harvesters, build a
Depot, a Garrison, six Troopers, survive the wave (the Easy first wave waits until step 4 is done or 5:00), Army +
Attack the enemy Core. Each step: one line, one portrait, a pulse on the button it wants. No timers, no numbers beyond
"6". Size M. Auto (Easy is the default; this is how a new player meets Easy). Files: new `src/client/tutorial.js`,
`src/main.js`, `src/client/menu.js`, `index.html`, `src/style.css`, `lib.rs` (a `holdFirstWaveUntil` knob),
`test/e2e/gameplay.e2e.mjs`.

### Tier 2: the opponent

**6. Difficulty by skill, not income; four tiers.** Why: Hard = x1.35 income puts nine Troopers in the base at 3:00
(`log.txt`); Medium at x0.9 still out-produced every phone player; a cheating AI feels unanswerable rather than hard,
and StarCraft's melee AI did not cheat. Proposal: Easy = x1.0 income but a deliberately slow script (10 workers, one
Garrison, first wave 4:00, no research, no raids, no expansion); Medium = the full script at x1.0; Hard = full script,
multi-prong (item 7), early research, Observer scouting; "Brutal" = Hard at x1.3 for people who want it. Retune
`first/gap/wave` per tier against the playtest numbers (a phone player holds 5 at 3:10, not 7 at 3:10). Size M. Owner
(it changes what the three words mean; Easy stays the default). Files: `data/diff.rs`, `world/economy.rs`
(income), `ai/build.rs`, `ai/army.rs`, `index.html` (titles), `tests/gameplay/ai.rs`, `scripts/headless.js`.

**7. AI that reads the player and attacks in two places.** Why: today the only reaction is Lancers for flyers; waves
walk one line to `known.first`, the expansion is left empty, raids are 2-4 Raiders. Add: (a) composition answer
(Vanguards/Monoliths when it has seen 8+ infantry, Troopers/Scythes when it sees Prisms/Vanguards, a Turret/Ward at
the mineral line after a raid); (b) a second group of a third of the wave sent at the player's expansion or mineral line
while the main wave engages; (c) three units and a tower kept at its own expansion; (d) drop the "decoy" exploit where
one forward Depot/Spire diverts whole waves (`attack_target` should prefer production buildings and the HQ over the
nearest known building). StarCraft: BW's AI scripts attacked expansions and the main in turn; the "attack the nearest
building" decoy is a famous BW AI weakness, no need to inherit it. Size M. Auto. Files: `ai/army.rs`, `ai/mod.rs`
(Brain fields), `ai/scouting.rs` (remember unit kinds seen), `tests/gameplay/ai.rs`.

**8. Close the AI's exploitable habits.** Why: a careful player can farm it. (a) It saves for research/expansion for
up to 45 s with production idle at 5:00/7:00/10:00: a timing attack then meets no reinforcements; cap saving at 20 s
and never while a wave is out. (b) A wave retreats at 40% losses and will not come back for `gap`; two Turrets and
kiting farm it, so let a retreating wave regroup with the next batch and return in half the gap. (c) Dry-vent and
`tend_sites` cancel loops are fine; but `find_spot` places Turrets only near the HQ: put the second Turret/Ward at the
mineral line facing the enemy. (d) The Hard AI's first wave of pure Troopers (18 by 3:29) is beaten by two Vanguards
and a Turret because it mixes nothing before the Foundry: give Hard a Medic/Halo in the first wave. Size S each. Auto.
Files: `ai/army.rs` (`ai_research`, `ai_steer_wave`, `ai_launch_wave`), `ai/build.rs` (`find_spot`), `tests/gameplay/ai.rs`.

### Tier 3: economy, pacing and tech

**9. Branching tech and a key upgrade per unit.** Why: Garrison -> Foundry -> Airfield is one corridor; StarCraft's
timing windows exist because U-238 shells, Stim, Leg Enhancements and Singularity Charge are researched choices the
other side must scout. Add per-race choices at the Foundry/Loom: Trooper range +1, Vanguard Entrench (from item 1),
Raider speed, Scythe Blink, Prism range, Shrike speed; two at a time researchable, 60-90 s each, visible as a pip in the
long-press detail. Split the Airfield/Zenith off the Foundry/Loom so Air and Ground are a real branch. Size M. Owner
(light: confirm the list). Files: `data/upgrades.rs` (Effect variants), `data/humans.rs`, `data/vael.rs` (`req`),
`world/combat.rs`, `ai/army.rs` (research order), `hud.js`, `tests/gameplay/economy.rs`.

**10. One late-game unit per race and a reason to reach 100 supply.** Why: the 200 cap is decorative; nothing
happens after minute eight except more of the same. Humans: a slow armoured **Bastion** gunship (Airfield + Weapons II,
250/200, 4 supply, hits ground and air, splash) ; Vael: a **Colossus-sized walker** or a **Carrier-like Ark** from the
Zenith with a Loom. One each, expensive, visible from far, with a toast and a sound when the first one appears.
StarCraft: Battlecruiser, Carrier, Ultralisk. Size L. Owner. Files: data tables, `tools/render3d/*.js` and the atlas,
`look.js`, `audio.js`, `ai/army.rs`, tests.

**11. Expansions that matter.** Why: with mains of 5,000-shard fields and 8-minute games, nobody must expand; in
StarCraft a main mines out around minute 12-15 and the natural is the first fight. After item 2: main fields smaller
(so the main thins around 8-9 min), the natural's field richer and closer, a toast "Your shard field is running low" at
20% (one, not repeated), and the AI contesting the player's natural (item 7). Size S once item 2 exists. Auto.
Files: `map.rs` (`place_fields` amounts per `MapKind`), `world/economy.rs` (low-field toast), `menu.js` map stories.

**12. Macro help for a thumb: queue five, a production-idle chip, HQ rally on the shard field by default.** Why:
every logged game floated 1,500-5,700 shards; StarCraft covered this with hotkeys and APM, which a phone does not have.
Long-press a unit button: the detail panel grows a "x5" action; a third chip in the landscape top bar shows idle
production buildings (portrait + count, like Idle, none in portrait per the standing decision); a new HQ rallies to its
nearest field so trained workers mine without a tap. Size S-M. Auto. Files: `hud.js` (`showDetail`, `doCommand`),
`tools.js` (chip), `index.html`, `world/spawn.rs` or `orders.rs` (default rally), `test/e2e`.

### Tier 4: controls, feedback, readability

**13. Camera: a Home button on touch, Army chip centres, alert chip cycles.** Why: getting back to base after a push is
a tap on a 100 px minimap; the Army chip selects but does not show the army; StarCraft had F2-F4, Space, and the
minimap at a quarter of the screen. Home next to SELECT; Army tap selects, second tap within a second centres; the
ATTACK chip cycles through the last three alerts. Size S. Auto. Files: `tools.js`, `index.html`, `style.css`, `input.js`.

**14. Subgroup from the tile strip.** Why: on a phone the box is the only selection tool, so Medics cannot be split
from Troopers; StarCraft's 12-cap taught players to pre-sort with groups, which a thumb cannot do. Tap a type tile:
keep only that type; long-press it: drop that type. Size S. Auto. Files: `hud.js` (`renderSelection`), `style.css`,
`test/e2e/touch.e2e.mjs`.

**15. Group attack-move at the slowest unit's pace with support behind.** Why: Medics outran the Troopers and died
first (playtest 3), and a phone player cannot micro the fix. For a multi-unit attack-move: cap speed to the slowest
member, place `heal`-only units 1.5 tiles behind the centroid, and let them break formation once in a fight.
StarCraft did not have this (and that was part of its skill), but SC2 proved group-speed moves cost nothing in depth.
Size M (sim rule + tests + golden). Auto. Files: `world/orders.rs` (`attack_move` for groups), `world/movement.rs`,
`world/command.rs`, `src/engine/core.js`, `tests/gameplay/orders.rs`.

**16. Readability of state: shields, team colour, cooldowns.** Why: the whole Vael race is about shields and the
console shows one merged number (Scythe reads "120/120"); enemy Vael are red tints on white and mirror matches blur;
after item 1 cooldowns need a place. Two numbers or a split bar in the console ("80 + 40"), a brief blue flash on a
unit whose shields just broke, a stronger team-colour area on Vael models (tools/render3d), group tiles with a shield
sliver, and a cooldown arc on ability buttons. Size S-M. Auto (within "few numbers": the shield figure is the one
number the race needs). Files: `hud.js`, `render.js` (`hpBar`), `tools/render3d/vael.js` + regenerate `public/art`,
`style.css`.

**17. An announcer and unit voices, synthesized.** Why: "Your base is under attack", "Nuclear launch detected" and
every unit quote are what people remember of StarCraft; Endfall has toasts and chirps. Keep the no-assets rule: a
formant-synth "radio" voice with 6-8 phrases (under attack, research complete, unit lost, not enough shards), two or
three acknowledgement babbles per unit type pitched by `UNIT_VOICE`, a distinct death sound per race, and a quiet
generative music bed (two chords, slow) under the menu and the late game. Size M. Owner (taste: synthesized voices
can sound cheap; prototype two phrases first). Files: `audio.js`, `look.js`, `main.js` (`drainEvents`), `test/audio.test.js`.

**18. Feedback events the sim should emit.** Why: StarCraft pinged the minimap for every event that mattered and the
screen for none. Add minimap pings (no toast) for unit complete, research complete, worker idle for 10 s, a building
done; a toast + ping for "field running low" and "first enemy flyer seen" (so Lancers/Prisms become a decision); the
"Army" chip should read "No army left" after a wipe. Size S. Auto. Files: `world/*.rs` (events), `lib.rs`
(`drain_events`), `main.js`, `tools.js`, `render.js` (`ping`).

### Tier 5: replayability, onboarding of maps, polish

**19. End screen worth reading: one army-strength timeline and a Rematch button; a local record.** Why: StarCraft's
score screen closed the loop; SC2's graphs made players better. Sample both seats' army value every 10 s in `Stats`,
draw one two-line chart (no axis numbers) on the end card with the enemy's line revealed, add "REMATCH" (same map,
seed, races) beside PLAY AGAIN, and keep wins/losses per race and difficulty in localStorage shown on the menu as small
tallies. Size S-M. Auto ("few numbers": a chart has none). Files: `world/mod.rs` (Stats), `snapshot.rs`, `lib.rs`,
`main.js` (`endGame`), `menu.js`, `index.html`, `style.css`.

**20. Map preview and the map's character on the menu.** Why: StarCraft's lobby showed the map; Endfall hides the
character until the end screen, which is charming once and confusing after. A 64x64 thumbnail of rock and fields
beside the map buttons (the sim can export the grid for a seed and kind without starting a game) and the one-line
story under it; Random shows "?" and its name. Size S-M. Auto. Files: `lib.rs` (`preview(seed, kind)`),
`src/engine/core.js`, `menu.js`, `style.css`.

**21. Replays from the command log.** Why: PLAN lists it; the sim already logs commands per seat. A "WATCH REPLAY"
button on the end screen replaying seed + log at 1x/4x with the fog of the player's seat (or none) is the cheapest
"wow" the determinism buys, and the testing tool that will find the next ten balance bugs. Size M. Auto. Files:
`lib.rs` (export/import log), `world/command.rs`, `main.js`, `menu.js`, `test/engine.test.js`.

**22. Concede, and a kinder long tail.** Why: "lose only when everything is destroyed" is the standing decision and
right (StarCraft's rule too), but a beaten player with one Harvester hiding has no exit except Quit, which reads as
abandoning. Add CONCEDE to the pause card (confirm; counts as a defeat with the end screen). Size S. Auto. Files:
`tools.js`, `index.html`, `main.js`.

**23. Counters in the long-press detail.** Why: StarCraft shipped a manual; a phone has the detail panel. Add "Strong
against / Weak against" (two portraits each) to every unit's detail from a small table in `constants.js`, kept in step
with the balance matrix tests. Size S. Auto. Files: `src/engine/constants.js`, `hud.js` (`showDetail`).

**24. Offline and startup polish.** Why: the PWA promises offline, but `index.html` loads Chakra Petch and Share Tech
Mono from Google Fonts, so an offline start renders in fallback fonts and an online start makes a third-party request
before the first frame. Self-host the two fonts (woff2 in `public/fonts`, `font-display: swap`) so the service worker
caches them. Also: the first game starts fully zoomed out (0.75) where taps on moving workers miss; start at 1.0 over
the Core on phones. Size S. Auto. Files: `index.html`, `src/style.css`, `public/fonts/`, `tools/offline/plugin.mjs`,
`main.js` (`newGame` zoom).

**25. Placement ghost on arming (a compromise with "tap to place").** Why: on touch there is no hover, so the first
sight of a footprint is a failed red tap. Show the ghost at the screen centre (with power rings) the moment a
building is armed; a tap moves it there and places if valid, as today. This keeps tap-to-place and defers drag; the
owner should say whether a visible ghost before the tap is in the spirit of the decision. Size S. Owner. Files:
`hud.js` (`doCommand` arms `ui.place` at the view centre), `render.js`, `input.js`.

## 3. What NOT to copy from StarCraft for a phone game

- **The 12-unit selection cap, single-building selection and no multi-queue.** They were engine limits that became
  skill tests; a thumb cannot pay that tax. Keep unlimited selection, the Army chip and the type tiles.
- **APM as the skill axis.** Mutalisk stacking, moving shot, worker split, hotkey cycling: StarCraft rewarded hands.
  Endfall should reward *attention* (abilities you tap once, the right fight in the right place) and never make the
  camera the enemy. One-tap abilities (self-cast, toggles) rather than targeted spells (Psi Storm, Lockdown).
- **Targeted spellcasters with energy management.** Casting a storm on a moving blob with a finger is misery. If a
  caster ever exists, its spell should be an aura or a self-buff.
- **128x128 maps and 20-30 minute games.** A phone session is 8-15 minutes; keep travel short, make the map's shape
  (item 2) carry the strategy rather than its size.
- **High-ground miss chance.** A hidden 53% roll reads as a bug on a phone where nobody sees the cliff; use vision-only
  high ground if any.
- **Punishing supply blocks and idle workers without help.** StarCraft said "additional supply depots required" and
  left you to it. Keep the nudges (supply pulse, Idle chip, item 12); the owner's "few numbers" is right, and the game
  should fix the mistake's cost, not shout about it.
- **Pathfinding jank as character.** Dragoon dances and Goliath traffic jams were lovable in 1998; here a unit that
  will not go where tapped is a lost tap and a lost phone. Keep the current smoothing and formation; add the group
  pace (item 15).
- **Nine-button command cards and 8 px targets.** Three columns of thumb-sized buttons with fixed slots are correct;
  do not grow the card to fit abilities, replace Deselect's slot or add a second page as the Build list does.
- **Cheese as a valid AI opening on Easy/Medium** (worker rushes, cannon rushes, early tower pushes). Fine for Hard or
  Brutal once the player can be told why they lost; a new player on a phone cannot answer a 2:00 rush.
- **Resource and time counters everywhere.** No APM meter, no game clock in the player's face beyond the one in the
  top bar, no unit kill counts in the console. The owner's no-timers rule serves readability.
- **Three races.** StarCraft's third race tripled the balance work; two races with real asymmetry (items 1, 3, 4, 10)
  beat three mirrors. Multiplayer first, a third race never or last.
- **Chat and taunts** until multiplayer; and when it comes, pings over typing.

## Appendix: what this session's play found (not new bugs, but worth knowing)

- Easy, Humans vs Vael, passive after five Troopers and one Garrison: the Core fell at 5:06 to the first wave plus two
  Vanguards. A *passive* player is meant to lose, but five Troopers losing the Core on Easy means Easy's first wave is
  tuned for a player who built a Turret; the guided first game (item 5) should make sure they did.
- Hard, passive: nine Troopers at the Core at 3:00, Core down at 3:29, eighteen Troopers by then. That is the x1.35
  income, not cleverness (item 6).
- The scripted bot in `scripts/headless.js` loses on every difficulty while floating 4,000 shards; it is not a balance
  oracle any more and should be retired or taught to spend.
- No console or page errors in any game; the HUD and card behaved as the playtest 3 report describes; the sim steps
  a 200-unit fight in 1.3 ms.
