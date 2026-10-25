# Endfall vs. StarCraft (1998): second whole-game playtest review

Reviewed 2026-10-26 on `origin/main` (worktree `/tmp/wt-review`, production build `/tmp/dist-review`), the day after the
holistic review's items landed. Played through the real UI in headless Chromium with the e2e harness: two Humans games
on the Playwright phone (844x390, touch) against the Vael on Medium, one Vael game on desktop against the Humans on
Hard, one Humans game on the phone against the Humans on Hard, plus the menu, How-to, FIRST GAME, pause and end
screens on both devices (screenshots were read, not just taken). Beside the browser: a scripted "competent" player on
the engine API against every level (`bot.mjs`), a native AI-vs-AI pacing run (12 games per race pairing on Medium and
Hard, 6 on Easy and Brutal, six map characters, both sides), and four exploit probes (Turret turtle, cloaked Wasp raid,
passive player, Stim re-cast). No console or page errors in any browser game.

## 1. Verdict

**What landed yesterday works and reads well in play.** The card now has Stim / Entrench / Blink / Overcharge / Cloak
in fixed slots that grey when locked and say which tech unlocks them; the Foundry/Loom card is two researches, Cancel,
and the techs below; the long-press detail is excellent (cost, requirement, "Not enough ether (needs 75)", strong/weak
portraits); the touch ghost appears green on a good spot with "Tap to place"; the guided first game's checklist is one
line with a portrait; the end screen's two-line chart tells the story of the game better than the numbers under it; the
map preview answers the menu's one open question; the top bar is three numbers and three buttons and the chips appear
only when they have something to offer. The Vael base reads as a different race (power rings, warp ghosts, shield bars,
planters that leave). Difficulty by skill is honest: a passive player now dies at 4:43-5:00 on Easy, 3:46-4:06 on
Medium, 4:08-4:31 on Hard, 3:28-3:48 on Brutal, and the Medium AI banks about 400 at the end of a game instead of
thousands. The sim, art and controls are as solid as the first review found.

**What the play says is wrong now.** Every one of my browser games as a casual player (build order by feel, a tap or
two every ten seconds, no ether micromanagement) ended the same way, at 7:11-8:59, as a defeat: *(1)* ether never got
past 66 for the first eight minutes because a new Rig/Siphon is crewed by one worker and nothing on screen says "put
two more on it", so the Foundry came late, there was no research at all in the first game and the army was Troopers
with a single Vanguard; *(2)* that army of 16 walked out at 6:00 and was wiped in under fifteen seconds by a Vael
army of about 26 supply (Prisms, Monoliths, Halos), 14 kills to 52 losses, and the game offered no word on why; *(3)*
during that fight four toasts stacked in the middle of the screen ("Your base is under attack!", "Foundry complete",
"Turret destroyed", "Supply Depot complete") on top of the action, the only part of the HUD that still behaves like a
dashboard; *(4)* after the Core and the last worker died the game ran on for a minute until the last Depot fell. The
AI-vs-AI data says the opponent has the same trouble closing: in 48 of 48 Medium and Hard games one side reached twice
the other's army with the other under 10 supply, and the game still took 5:03 (Medium) or 3:40 (Hard) more to end,
because a wave's required size grows by 2-3 units at every launch with no cap, so a winning AI sits at home waiting for
its 20th unit while the loser rebuilds. Three of twelve Medium Humans-vs-Vael games ran past twenty minutes.

**Against StarCraft.** The macro loop, the tech tree, the two-race asymmetry in the base, cloak/detection, abilities,
the difficulty ladder and the onboarding are now all present; that is the list from the first review, done. What
separates the two games today is no longer missing systems but the *loop of a fight*: in StarCraft you see the battle,
you learn from the loss (the score screen, the unit you kept dying to), and a decided game ends. In Endfall the casual
player loses the decisive fight without seeing it start, never finds out which unit beat them, and sits through the
long tail. The second gap is the economy on-ramp: StarCraft taught three on gas in the first mission; Endfall gives
one on ether and hides the fact. Fix those two and the depth added yesterday becomes reachable by the people the
phone build is for.

### The game by numbers (for calibration)
- Phone, Humans vs Vael, Medium, two games (seed 4242): first enemy at the base 3:39 / 4:00 (two or three Vael units),
  the first wave at the base 5:06 / 5:16, the player's attack with 16 units at 8:03 / 5:57 wiped out within 15-45 s,
  Core down 8:59 / about 7:30, game over at 8:59 (Core; buildings left) / 8:33. Ether on the top bar: 0-66 for the
  first eight minutes with one Rig worker; shards banked 5,088 / 3,141. Research started in game 1: none; game 2:
  Weapons I (finished at 8:17, after the Core).
- Phone, Humans vs Humans, Hard (seed 2077): first wave 3:52, eight Troopers, held by nine Troopers, a Turret and
  Stim; the second wave at about 5:30 (three Vanguards, Troopers, Medics) killed 11 Troopers and 15 of 16 Harvesters
  in under a minute; defeat 7:11, 14 kills to 48 losses. Ether 10-128 with three on the Rig (the script crewed it).
- Desktop, Vael vs Humans, Hard (seed 1998): poke of 3 Troopers 3:44, a wave of 10 (Troopers, Medics, Vanguards)
  at about 5:40 killed 14 of 17 Lumens, 28 enemy units in the base at 7:59, defeat 8:23, 21 kills to 57 losses.
- Scripted player on the engine API (19 workers, three on ether, up to 4 factories, spends everything, attacks at 24-30
  supply, retreats at 40%): Easy wins 3/3 by 8-10 min (the Easy AI peaks at 12-18 supply); Medium vs Vael 1 win
  (14:52) and two games undecided at 13:48 and 16:56 (11-17 fights, 11-17 lead changes); Hard vs Vael 1 win (14:15),
  two losing at 13 min (AI 46-52 supply vs 8-15) but not finished; Brutal: Core gone by 7:31-10:56 while the AI banked
  2,600-3,235. As the Vael against the Human AI: Medium 1 win of 3, Hard 0 of 3.
- AI-vs-AI, Medium, 12 games per pairing: mean length 566 s (VvV), 766 s (HvV), 821 s (HvH); first deaths at about
  3:05; 7-11 thirty-second windows with four or more deaths per game; 400-450 banked at the end. Hard: 602-629 s,
  fewer lead changes (3.4-6.2). Brutal: 490 s and 1,288 banked (it floats). Easy vs Easy: 782-1194 s, 3 of 6
  Human mirrors still running at 25 minutes (the Easy script does not finish an Easy script; irrelevant to players).
- Decisive lead (one side at twice the other's army with the other at 10 supply or less, after 4:00) to the end of the
  game: 303 s on Medium, 220 s on Hard, in 24 of 24 games each.
- Turret turtle (a Garrison, 4 Turrets and 8 Troopers on hold, replaced when they die, nothing else) vs Medium:
  Turrets gone by 6-7 min, Core down 8:07-8:24 in three seeds. Not farmable.
- Cloaked Wasp raid vs the Medium Human AI (4 Wasps with Cloaking Field at the mineral line at 4:00): 8-9 workers killed
  in the 12-second cloak, then all four Wasps died to the home army in the 40-second cooldown. The AI built no detector
  (`crates/endfall-sim/src/ai/` has none); the cooldown, not the AI, keeps the raid honest.
- Stim: a second tap two seconds after the first is accepted and costs another 10 hull (cooldown 1 s).
- A main's shard field is 7 crystals x 1,500 = 10,500 shards, dry around minute 10-12 with 16 workers; the natural has
  a vent. Expansions now matter in a long game (none of my games lasted long enough).
- Bundle: 149 kB JS (53 kB gzipped) + 497 kB wasm + 4.3 MB of art pages; PixiJS chunks beside it.

## 2. Prioritised improvements

Size: S = an afternoon, M = a few days / one PR with tests, L = a week or more. "Owner" = needs the owner's decision
(taste, or a change to a standing decision); "Auto" = within the standing decisions. Files by the layout in CLAUDE.md.

### Tier 1: what the play says is wrong now

**1. The ether on-ramp: show the crew and let one tap add a worker.** Why: with one worker per new refinery (the
owner's call, 2026-10-25) a casual player's ether read 0-66 for eight minutes in both phone games and 1-91 in the Vael
game; the Foundry came at 3:39, Vanguards (75 ether) and Prisms (35) were one-offs, research started once in three
games, and the "Not enough ether" toast fired on most taps. The scripted bot with three on ether had 165-782 ether to
spare at the same point: the rule is fine, the information is missing. StarCraft put three on gas in mission one and the
Refinery showed its workers. Proposal: keep the rule; when a finished Rig/Siphon is selected the console's module shows
"crew 1 of 3" (worker portraits) and the card offers **+ Worker** (sends the nearest shard worker; greyed at three);
the same button on the vent itself; the guided first game gets a seventh step ("Build an Ether Rig, then crew it")
between the factory and the soldiers. Size S. Owner (light: it adds a button to the owner's rule, it does not reverse
it). Files: `src/client/hud.js` (`renderSelection` node/extractor module), `src/client/card.js` (`cardItems`,
`doCommand`), `crates/endfall-sim/src/world/economy.rs` or `orders.rs` (a `Command::Crew` that picks the worker in the
sim, so it replays), `src/client/tutorial.js`, `test/e2e/gameplay.e2e.mjs`.

**2. Toast diet: nothing pops up over a fight.** Why: this is the one place the screen still acts like a dashboard, on
phone and desktop. Screenshots at 4:00, 6:47 and 8:51 show three and four toasts stacked at top-centre of the stage, on
top of the fight ("Your base is under attack!" + "Foundry complete" + "Turret destroyed" + "Supply Depot complete";
later "Your units are under attack!" + "No army left" + "Garrison destroyed" + "Your base is under attack!"); on
desktop "Supply blocked. Build a Spire." + "Loom complete" + "Not enough ether". `ui.js` allows four at once, every
finished building toasts (`construction.rs:226`) although it also pings the minimap, and every refused tap toasts.
StarCraft said "under attack" once in the corner and let the minimap do the rest. Proposal: (a) no toast for a finished
building or unit (ping + the existing chime; the research-done toast stays, it is a decision point); (b) "Not enough
shards/ether" and "Supply blocked" become the button's own feedback (the button shakes and its cost dot flashes, the
error sound stays; the supply counter already pulses); (c) at most two toasts, bottom-left of the stage above SELECT on
phones and above the console on desktop, never centred; (d) "destroyed" only for the HQ, factories and tech buildings.
Size S. Auto (it is the owner's rule applied). Files: `src/client/ui.js` (`toast`), `src/style.css` (`#msg`),
`src/main.js` (`drainEvents`), `src/client/card.js` (`doCommand` error path), `crates/endfall-sim/src/world/construction.rs`,
`combat.rs:315`, `test/e2e/gameplay.e2e.mjs` (the scenarios that assert toasts).

**3. An opponent that finishes the game.** Why: `ai_launch_wave` raises `ai.wave` by `wave_grow` (2/3/4) at every
launch with no ceiling and waits until the army is that big: on Hard the fifth wave needs 20 units, the sixth 23. In the
pacing run every Medium and Hard game had a moment where one side held twice the other's army with the other under 10
supply, and the end still came 303 s (Medium) / 220 s (Hard) later; three of twelve Medium Humans-vs-Vael games passed
twenty minutes, one was undecided at 25; the scripted player at 8-15 supply against the Hard AI's 46-52 was still
alive at 13 minutes. For a player who is losing this is a long, hopeless tail; for one who is winning it is an opponent
that never comes to die. Proposal: cap the required wave at twice the first (`d.wave * 2`), and add a finishing rule:
when the AI's army is at least twice the enemy army it has seen (it already counts infantry and heavies for 90 s) and
it has nothing to save for, it launches at once and keeps `attacking` until its army is below half, not 40% of the wave.
Also let a wave that finds no army at the goal walk to the next known building instead of idling (it does; keep it).
Size M (sim rule + `tests/gameplay/ai.rs` + golden update). Auto. Files: `crates/endfall-sim/src/ai/army.rs`
(`ai_launch_wave`, `ai_steer_wave`), `ai/mod.rs` (Brain: seen army), `data/diff.rs`.

**4. Defeat when nothing can act (the long tail, part two).** Why: Concede exists on the pause card, but a beaten phone
player does not know to look there. In both phone games the Core and the last worker were dead for 60-80 s before the
last Depot fell (game 2: workers 0 and supply 0/32 at 8:17, over at 8:33; the Vael game: workers 0 at 7:59, over at
8:23); during that minute the screen showed debris and toasts. StarCraft's rule (lose when every building is gone) is
the standing decision and fine when the player can still rebuild; the case to add is "cannot": no headquarters, no
worker, no building that trains or warps a worker, and no fighting unit. Proposal: the sim declares that seat's defeat
(a `World` rule, not a client guess, so it holds in multiplayer); the end card's line says "Nothing left to fight
with." Size S. Auto. Files: `crates/endfall-sim/src/world/combat.rs` (beside the all-buildings-gone check at 328-346),
`tests/gameplay/combat.rs`, `src/main.js` (`endGame` text), `tests/golden.rs` if a hash moves.

**5. The end screen says what beat you.** Why: the casual player lost 52 units for 14 kills and the card said "Units
lost 52". StarCraft's score screen and (later) SC2's "units lost / killed by type" are where players learnt counters;
Endfall already has "Strong against / Weak against" in the long-press detail, but nobody looks it up after a loss.
Proposal: one line under the stats, from per-kind counters the sim already nearly has (`Stats` plus a `lost_to[kind]`
table): "Most of your losses: to Monoliths (31) and Prisms (14)", with the two portraits, and the counter for the top
one ("Vanguards beat Prisms"). No new always-on element; it is detail on demand on the one screen built for it. Size S.
Auto. Files: `crates/endfall-sim/src/world/types.rs` (Stats), `combat.rs` (on death), `snapshot.rs` / `lib.rs`,
`src/main.js` (`endGame`), `src/engine/constants.js` (`strong`/`weak`).

**6. Hold a unit button to queue more (macro for a thumb).** Why: both scripted phone players floated 2,800-5,100
shards by minute seven with three Garrisons, and the first review's logs showed the same for people; the AI banks
400 and wins by weight (its 26 supply against 16 units). The x5 action was left undone because the detail panel is
not interactive. Proposal: a long-press on a unit button that is *affordable* starts repeating (one unit every 250 ms
up to five, haptics-free, the queue tiles filling as they go) instead of showing the detail; the detail still shows on a
long-press when the button is greyed (as today) or on a two-finger tap. On desktop Shift+click queues five as it did
in 1998. Size S. Auto. Files: `src/client/card.js` (`press` timers, `showDetail`), `test/e2e/gameplay.e2e.mjs`.

### Tier 2: the opponent and the information war

**7. The AI answers cloak with a detector.** Why: PLAN lists it as the next step and the probe shows the gap: four
cloaked Wasps killed 8-9 of the Medium AI's 12 workers in one 12-second cloak and it never built a Turret at the line;
only the 40-second cooldown saved it. A player who times two Wasp cloaks on the AI's mineral line farms it; the AI
cannot do the same back (its raiders cloak, the player has Turrets if they built them). StarCraft's AI put Turrets at
every mineral line once a Wraith showed. Proposal: when a seat loses a unit to something it could not see (the sim knows:
the shooter was `cloaked_from` it), the AI queues its tower at that mineral line (it has `find_spot` and `seen_air_until`
as templates) and, for the Humans, an Observer once an Airfield stands. Size S-M. Auto. Files:
`crates/endfall-sim/src/ai/build.rs`, `ai/scouting.rs`, `ai/mod.rs` (Brain: `hit_by_unseen_at`), `tests/gameplay/cloak.rs`.

**8. Workers that run.** Why: the Hard wave of 10 at 5:40 killed 14 of 17 Lumens, and the Hard Human AI's second
wave (three Vanguards whose shells splash) killed 15 of 16 Harvesters at the shard line in under a minute; a phone
player cannot pull workers with a thumb while also fighting. In the first phone game the counter-wave took 11 of 16. StarCraft left
this to the player's hands, which is exactly the APM tax the first review said not to copy. Proposal: a worker that is
hit, or sees an armed enemy within 3 tiles, with no friendly fighter within 6, drops its gather and walks to the far
side of its HQ (then returns to its node when nothing armed is in sight for 8 s); a worker ordered to build or repair
stays. One rule in the sim with a test; the AI benefits too. Size M. Owner (it changes what a worker does on its own;
some will call it hand-holding). Files: `crates/endfall-sim/src/world/economy.rs` or `orders.rs`, `combat.rs` (hit
hook), `tests/gameplay/economy.rs`, goldens.

**9. A scouting report on demand.** Why: the casual player meets the enemy composition for the first time in the fight
that decides the game; the Vael probe at 3:39 was two Scythes, the army at 6:00 was Prisms and Monoliths. The "first
flyer seen" toast is the only intelligence the HUD offers. The pause card is already the place for the clock. Proposal:
the pause card gains one line, "Seen: 6 Scythes, 4 Prisms, 1 Monolith (last 90 s)", from the per-seat memory the AI
already keeps for itself (`seen` counts), portraits not words where possible; the same line on the end screen for the
whole game. Nothing new while playing. Size S. Auto. Files: `crates/endfall-sim/src/ai/scouting.rs` (make the memory a
`World` per-seat thing), `snapshot.rs`, `src/client/tools.js` (`togglePause`), `index.html` (`#pauseTime`).

**10. Brutal floats; the Human AI's builder tax.** Why: in the scripted games the Brutal AI banked 2,600-3,235 while
winning; PLAN already notes the Vael win 60 of 72 on Brutal and that a Human builder stops mining. Not urgent (Brutal is
for people who want to lose), but a cheating AI that cannot spend is the first review's complaint in a new coat.
Proposal: on Brutal, `extra_rax` without the "never while saving" clause and a sixth factory; measure again. Size S.
Auto. Files: `crates/endfall-sim/src/data/diff.rs`, `ai/build.rs` (`extra_rax`).

### Tier 3: readability and the screen (phone and desktop)

**11. The desktop HUD band is a dashboard-shaped hole.** Why: on 1280x720 the footer is a fixed 168 px (23% of the
height) across the whole width; with five Scythes selected it holds "5 units 5 Scythe", five tiles and 600 px of empty
panel (see `vd-panel-army.png`); with the Kiln selected, a name, a bar and a queue in the left fifth. The phone's floating
console at content width is the better design and already exists. Proposal: desktop uses the same floating console
(content-width, bottom-centre, over the map) and the card at bottom-right, minimap 140 px bottom-left; the stage gets
the 168 px back. Size M (CSS and the resize math in `render.js`; the e2e layout assertions). Owner (a visible change to
the desktop look). Files: `src/style.css` (`#hud`, `#info`, the phone media query becomes the rule), `src/client/gl/render.js`
(`resize`), `index.html`, `test/e2e/gameplay.e2e.mjs`.

**12. Labels that fit, and a tell for an active ability.** Why: the phone tech card reads "Cloaking Fi..." and the
desktop Loom card "Overchar..."; abilities with a timer (Stim 10 s, Cloak 12 s, Overcharge 6 s) show only a body tint,
and a second Stim tap two seconds later is accepted for another 10 hull (cooldown 1 s), so a thumb that taps twice
pays twice. Proposal: `short` names for the long techs ("Cloak Field", "Veil Weave" fits, "Overcharge", "Entrench");
a cast on a unit whose boost has more than half its time left is refused by the sim (no stacking, no double cost) and
the button shows the active state (a filled frame, no countdown, within the no-timers rule) while any selected unit is
under it. Size S. Auto. Files: `crates/endfall-sim/src/data/upgrades.rs` (short), `src/engine/constants.js`,
`crates/endfall-sim/src/world/abilities.rs` (`cast`), `src/client/card.js` (`abilityItems` active state), `src/style.css`.

**13. The first view.** Why: the standing choice is to start fully zoomed out; with the main now in a rock pocket the
desktop start shows the base in the top-right ninth of a mostly black screen (`desktop-firstgame-20s.png`) and the phone
start has the base in the top-left with half the screen black. Proposal (keeps the zoom): centre the start view a third
of the way from the base towards the map centre, so the pocket's ramp and the natural are in the frame and the black is
the edge of the world rather than the middle of it; the FIRST GAME's first step still names the Core. Size S.
Owner (it touches the start-view decision). Files: `src/main.js` (`newGame` camera), `src/client/gl/render.js`.

**14. The phone console under a fight.** Why: on 390 px of height the console (64 px) plus a two-row card (about 120
px) take the bottom third whenever a group is selected, which is exactly when a fight is on; the Deselect slot and the
Hold slot sit in the card for every selection. It is within the owner's design (details on demand) but the fight is
behind it. Proposal: while the selection is only fighters and any of them is in combat, the console collapses to its
first line (name and count; the tiles return on a tap of the line) and the card keeps only Attack, Hold, the abilities
and Deselect (a tap on the ground moves units on a phone, so Deselect must stay). Size S. Owner (hides tiles during a
fight). Files: `src/client/hud.js` (`renderSelection`), `src/style.css`.

### Tier 4: polish toward StarCraft

**15. Replays from the command log.** Why: unchanged from the first review (item 21) and now the cheapest way to see
why the 16-unit army died in fifteen seconds, both for the player ("WATCH" on the end card at 4x) and for balance work
on items 3, 7 and 8. Size M. Auto. Files: `crates/endfall-sim/src/lib.rs` (export/import `Logged`), `src/main.js`,
`src/client/menu.js`, `test/engine.test.js`.

**16. Ship three announcer lines.** Why: the voice lab exists and the game still has the siren and chirps; "Your base
is under attack", "Research complete" and "Not enough ether" (the three most frequent events in my logs) are the whole
of what StarCraft's adjutant said that players remember, and each replaces a toast from item 2. Owner (judge the voice
on `voice-lab.html` first, as planned). Size S once judged. Files: `src/client/voice.js`, `src/main.js` (`drainEvents`),
`src/client/tools.js` (`onAttacked`).

**17. Easy that stays interesting after the first hold.** Why: the Easy AI peaks at 12-18 supply and the scripted
player's three Easy games ended 8:01-10:14 with the AI's army at 0 from minute six; a new player who survives the first
wave then walks over. StarCraft's easiest AI still massed late. Proposal: Easy's `wave_grow` goes to 3 after 6:00 and it
takes the natural at 8:00 (no research, no air, no raids); check that a passive player still dies at about 4:45. Size S.
Auto. Files: `crates/endfall-sim/src/data/diff.rs`, `ai/build.rs` (`ai_expand`), `tests/gameplay/ai.rs`.

## 3. Rule checks and bugs

- **Minimal HUD.** The top bar, chips and card respect the rule; the toast column does not (item 2); the desktop footer
  is the biggest always-on element on any screen and earns a fifth of its space (item 11). Nothing new added yesterday
  breaks it: the tech slots, ability buttons and the checklist are on demand or one line.
- **Mobile.** Every flow I drove worked by tap: train, build (basic and Advanced pages), ghost placement, research,
  Stim/Blink, Army chip + Attack + tap, long-press details, Concede. The one thumb trap found is the Stim double tap
  (item 12). Items 1, 6 and 14 are the mobile-specific gains.
- **Bugs.** None hard. Observed and reproducible: (a) Stim re-cast while active is accepted (`node exploit.mjs stimspam`:
  cast, 2 s, cast again: hull 48 -> 38 -> 28, boost still "stim"); (b) a seat with no HQ, no workers and no army stays
  in the game until its last Depot falls (both phone games); (c) "Weapons I researched" toasted at 8:17 over a dead base
  (item 2 covers it); (d) the "Cloaking Fi..." / "Overchar..." truncation. The e2e suite's assumptions held: no page
  errors in four games, the game-over flow, record and Rematch all fired.
- **Yesterday's work that feels off in play.** Difficulty by skill: Medium is a real fight and now the gap from Easy
  (AI peak 12-18 supply) to Medium (26-50 at 6-10 minutes) is wide; a player who beats FIRST GAME and Easy will lose
  their first four Medium games (item 17 narrows it from below, item 1 from above). Cloak: 12 s on / 40 s off makes it
  a burst, and the card gives no tell while it runs (item 12). Branching tech: the techs look exactly like the levels on
  the card (same style); a different frame for one-level techs would help, low priority. Capital units: none appeared in
  any game under ten minutes, which is every game I played; they are a late-game reward that most games never reach
  until item 3 lands and games either end sooner or go longer for a reason.

## 4. The three things that would most raise the game toward StarCraft

1. **Make the decisive fight legible and let the game end** (items 2, 3, 4, 5): no toast over a battle, an opponent that
   commits when it is ahead, defeat when nothing can act, and one line on the end card naming what beat you. Together
   they turn "I lost at 8:30 and do not know why" into StarCraft's loop of fight, lesson, rematch.
2. **The economy on-ramp for a thumb** (items 1 and 6): crew the refinery with a tap and queue with a hold. Yesterday's
   tech, heavies, abilities and capital units exist; a casual player on a phone cannot currently afford them before the
   game is over.
3. **An opponent that plays the information war both ways** (items 7, 8, 9): detection in answer to cloak, workers that
   do not stand still under fire, and a scouting line on the pause and end cards. StarCraft's mid game was built on
   knowing and hiding; the pieces are in the sim now, the player and the AI just cannot see them.
