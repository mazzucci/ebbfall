# Ebbfall: architecture

The map of the code for coding agents: how the game is built: what each file, module and test is for, and CI and the
deploy in full. How the game plays (seats, teams, maps, spawning, water, the tide and the Shore) is in GAMEPLAY.md.
CLAUDE.md holds the rules and the commands; read it first. Keep this file true when you add, move or remove a file.

## CI and the deploy

CI (`.github/workflows/ci.yml`) runs rustfmt, clippy and `cargo test` (the `rust` job), beside the WASM build, `npm test`
and `npm run build` (the `build` job, whose dist/ the browser tests use), then the browser tests (all in Chromium, split
over ten `e2e` jobs by measured time, summed up by `e2e: all`, red unless the build and every shard passed; the cross-engine subset in WebKit and Firefox, `engines`, on the same dist/ inside Playwright's container image (pinned
to playwright-core's exact version and digest: the browsers and their libraries come with it, no apt step; Firefox under
the image's xvfb), and the golden games on an ARM Mac, `arm`,
which hold neither a merge nor a deploy (`arm` since 2026-11-04, `engines` since 2026-11-07) and are read by hand: the
ruleset requires build, rust and `e2e: all`, and `relay` and `deploy` wait on the same) on every pull request, and publishes
`main` to https://ebbfall.com/, a Cloudflare Worker with static assets (site/; GitHub Pages until 2026-10-30;
Notion: Multiplayer design, Hosting: the deploy, analytics, the rollback). On `main` the relay goes first (the `relay` job,
then `deploy`): it is deployed when the live relay is not this commit's, by what is live rather than by what the push changed (a cancelled
run must not leave a relay change undeployed): the job hashes the bundle wrangler would upload (`deploy --dry-run`,
wrangler pinned) with wrangler.toml, reads the live build from `GET https://relay.ebbfall.com/version`
(`{proto, build}`, relay/version.js), and deploys with `--var RELAY_BUILD:<hash>` when they differ, when there is no
/version, or on a run started by hand; then waits for /version to say the new build. The `deploy` job (the site)
publishes only when the live relay's `proto` is relay/room.js's PROTO (src/net/net.js's, which a test keeps equal), so
the site never outruns the relay. Every file of the site but the docs' videos is served by Cloudflare's assets with no
Worker (the game's page at /, the docs, the other pages; site/wrangler.toml): a tripped Workers spending limit (error
1103 for every Worker request) leaves the game, the docs and single player up, and takes online play (the relay), a
room's and a challenge's card addresses (/r/CODE, /vs/CODE), the docs' feedback form's sending (it offers the address
to write to instead), the CSP's reports and the docs' videos (/docs/media/*.mp4, the Worker's for their byte ranges,
which the assets do not serve and Safari needs: their posters stay). The deploy's build step (site/build.mjs) writes dist/_headers and, from the repo
variable CF_ANALYTICS_TOKEN, the analytics beacon into every page. The **Devices** workflow (`devices.yml`, by hand and weekly) checks an
iPad, an iPhone and a Pixel (Notion: Multiplayer design, "Browsers and devices").


## Tests that guard gameplay

- `crates/endfall-sim/tests/gameplay/` (one test binary: `common.rs` helpers, then `orders`, `construction`, `economy`,
  `combat`, `leash`, `ai`, `styles`, `maps`, `mines`, `seats`, `paths`, `water`, `shore`, `tide`, `peoples`, `radio`,
  `expedition`, `summary`, `plans`, `random_play`, ...): the game summary (`summary`: the same seed and orders give the same
  summary byte for byte, it moves no state hash, a seat's view of its foe holds only what its sight showed (an enemy
  Factory and expansion out of sight left out until a Guard walks up), a person's units come near enemy buildings make
  an attack, a fifteen-minute game under 10 KB with every trainable unit type counted), plans for an AI seat (`plans`:
  a plan clamped and noted, for an AI seat before play only, playing Hard; plans and deltas refused in lockstep and a
  plan set before dropped; a planned game with deltas and orders replayed exactly, and the same plan and deltas the
  same game; an empty plan playing exactly as Hard and a field winning over the style; the dare holding and never taking
  the line unit; later waves gathering to `m`; the intents; a bad code changing nothing; check-ins moving no hash and
  showing only what the seat saw), the AI styles (`styles`: each AI seat's draw at its first turn, the same for the
  same seed, every level's styles over many games and never Easy's Pressure, nothing emitted, a forced style keeping
  the other draws, a lab plan played as it is, mirrored seats' stalled-game pushes apart, Pressure's sooner wave and
  later natural and Boom's later wave, Easy's Boom at most two top-tier units from 15:00 and its Timing none), the leash (`leash`: an idle Guard chasing a passer-by only `CHASE_LEASH` from its
  spot and walking back, an attack-move group never more than the leash off its line after a fleeing unit and all
  reaching its goal, an attack-move killing an Archer where its route bends far off the straight line (Standard seed 2,
  the Shore seed 1), Riders shelled from past their leash going for the gun, an attack order with none), the top units
  and siege (`balance`: an elite against four of its line and 1.2-1.7 times its gold of the other's, siege behind towers
  holding 2-2.5 times its gold of massed basics and falling to the other side's tech at no more, `entrenched`; the
  probes `top_unit_probe` and `entrenched_probe` print the curves), the end (`combat`: a side with nothing left to fight with and no gold
  to train more is out, a Barracks keeping it in only with the gold for a fighter, an AI with a Barracks out when it
  falls or at once when broke, each with its `OutWhy`),
  placement (`construction`: every refusal named, unexplored ground before what lies under it, the order's error in
  the same words, `can_place` exactly "no refusal" over the map, deep water, a headquarters `HQ_MINE_GAP` tiles of
  ground from every mine in its own words while every other building keeps one), gold
  mines (`mines`: workers at a mine that runs dry going on to the nearest mine with gold; one per field on every map kind and size, holding the field's gold; any two
  mines `MINE_APART` apart and every start's own mine `HQ_MINE_GAP` off its headquarters on every kind, size and start
  count, the Shore's basin fields too; every map symmetric mine for
  mine, each image holding the same gold and every start seeing the same mines at the same distances; a worker inside
  hidden, out of sight and reach, no healer tending it, coming out with its load; the cap and the rest waiting; a crowd of thirty never jamming; an empty
  mine taking nobody in; a mine fitting eight Villagers or five Bots and a saturated Bot mine paying about 83% of a Villager
  mine's (pinned), a main mine lasting over 20 minutes at its full rate for either people (mines last the game:
  scarcity from the rate, `CRYSTAL_GOLD`), a loaded worker walking slower (`economy`); each
  people's AI at every level gathering from mines and taking an expansion's, its headquarters `HQ_MINE_GAP` off every mine; an AI whose every base is dry taking
  another, a natural still going up counting as a base), the Market (one a
  Castle, it pays by itself), the Recruiting post (anywhere, any number, pays nothing), no map with a shaft; every building can be built and every unit
  trained (but the healers, kept in the tables and trained nowhere), each people's production lists, requirements (the
  Bruiser's Lab), no cloak, detection or shields, every ground unit walking (`peoples`), Brace and the Cannon's deploy (by itself whenever it stops),
  standing firm (`firm`: units rallied or sent to a point a firm friend covers arriving, Cannons in formation and on one
  target all setting up, a unit ringed by firm friends getting out, walking through two touching Cannons of its own but
  not an enemy's, one settling in pushed clear and never moved once settled),
  construction that stalls without a builder and resumes, a builder waiting idle beside what it finished, a new worker
  waiting at its headquarters for an order and a rally on a mine walking it there to wait beside it without mining, the
  AI sending its new workers and builders to a mine within its next turns (`economy`), workers hopping only to a mine
  no farther from their drop-off, supply and refunds, turrets, the AI finishing
  games (also four AIs free for all and two against two on 96x96, six and eight on 128x128, and three-, four-, six- and
  eight-seat games to their end through `Game::with_seats`; a seat that is out refused and inert; every AI thinking
  every 16 ticks on a tick of its own; the Kingdom's AI raising its Market early, one a Castle, and a lost one again; one
  headquarters by each mine, and another base once every base's mines run dry), maps of 2, 4 and 8 starts that are walkable and
  alike for every start (no vent by any main or expansion, one mine by each main), group paths (one search for a group's order, long searches budgeted,
  no shared route through rock), water (each unit's movement class, a walker's route around deep water and an
  amphibian's across it, wading, nothing firing from deep water, each people building on its own ground: a hand-built map), the Shore map (point-symmetric
  ground and fields, a walker reaching both coves, both basins and every field, short ways between a cove and the basin
  it faces, starts by people, a walker sent out to sea stopping on the shore, both AIs finishing from either start at
  every level, random play on it, and both again with the tide), the tide (its cycle alike for a seed and in the hash
  only when on, no walker ever on or routed through deep water as it moves, the warning and the retreat and its
  switch, the sweep and its stun, the flood destroying behind its switch, building by the tide, nothing firing from
  under high water, a worker inside a mine not swept and coming out on ground it may stand on: a hand-built map), coverage (`radio`, the arc: the combat machines need signal, Bots,
  people and the Kingdom never; x1.3 inside coverage, slower stranded outside and only back towards it; by exact
  distance from the source's center, just inside and just outside the edge, off tile centers; from the Data center and
  an Uplink (54 tiles on every map), none from a site or a Sentry mast, gone when the Uplink falls; an ally's
  counts; a machine ordered past the edge stopping at it and fighting what it reaches from there, its player told; a
  stranded one walking back; two overlapping sources' waist crossed, and a way that clips its notch rerouted inside
  (a move arrives, an attack fires; the edge scenes use a second Data center's 18 tiles, the Uplink's 54 covering most
  of a 64x64 map); the Expedition AI's push on 96x96: one forward Uplink whose coverage takes in the foe, then its
  machines, none of them leaving coverage; Expedition buildings placed only inside coverage, the Data center and the
  Uplink anywhere, a post and a turbine standing and working after their Uplink falls; a group sent past the edge told
  once, with the rim cue's spot), the Expedition's economy (`expedition`: energy and one grid, Nov 14: the
  grid from the Data center (22) and Substations (10) up to `GRID_MAX` 150, the Kingdom's population `POP_MAX` 120, only
  units drawing it (buildings none, a building placed whatever the grid); machines and
  mercenaries alike refused on a full grid and trained once a Substation stands; a mercenary's grid freed by its death,
  a lost Substation leaving the use over the cap; "Not enough energy" and the grid's refusals; Wind turbines paying
  `TURBINE_RATE`, five a Data center, as one Market at full Trade; Energy efficiency at the Lab, in place of Armor and
  Better drills, cutting what machines cost (paid and refunded at the price of the moment); no armor on its units,
  their hp carrying it; the Rover's heavy slow salvo; one Portal a seat, a second refused while one stands or goes up,
  drawing no grid; the Android's numbers, its grid and its training time; the Lab unlocking the Uplink (275 gold; no satellite since Nov
  13) whose standing unlocks the Portal, the Portal training (Androids and Rovers) only while an Uplink stands; Bots
  repairing buildings and no machine; melee Sellswords and Bruisers hitting only the ground up close,
  the Expedition AI at every level raising Substations, turbines (five a Data center at most) and posts, an Uplink, one Portal at most and training
  Androids there), and `random_play_never_breaks_the_world`: random orders (including stale and nonsense ids) through the same
  `Game` API the browser uses, across many seeds, checking world invariants (positions, no walker in deep water, hp, occupancy grid, each seat's
  places (`check_pools`: the use over the cap only as a lost building left it, never by growing; nothing over the
  maximum, `World::sup_max`; one Portal a seat at most),
  resources, miner counters, a worker inside a mine out of reach and out of its enemies' sight) after every tick. Add a
  scenario here for every rule you add or change.

## Layout

```
voice-lab.html        a page apart from the game for judging the announcer's voices (a second Vite entry;
                      src/client/voice-lab.js): each race's synth styles A, B, C and the device's voice D, one tap a phrase
selftest.html         the device check (a third entry): plays the golden games, says whether this device computes them
                      exactly (online play needs it); open it on a phone to check that phone
?bench                the device test (src/client/bench.js, in the game's own page): an 8-AI 128x128 game from 3:00, a
                      minute measured through main.js's loop (`probe`), the report POSTed to the relay for a PERF-XXXXXX code
index.html            page shell: top bar, canvas stage, HUD (minimap, selection panel, command card), overlays; its head is
                      what search engines and shared links show (title, description, canonical, og: and twitter: cards
                      with public/og.png, JSON-LD; test/site-preview.test.js); the help sheet (the ? in the top bar,
                      help.js); the text crawlers read is the docs' (tools/docs)
src/boot.js           entry: the menu first (menu.js, online.js's lobby, the sound and full screen (corner.js) wired at once,
                      no renderer in its graph), then loads the game (main.js) behind it; a start waits, its button LOADING…
                      (RELOAD if the game could not load; READY likewise, online.js); the service worker's registration
                      (an update reloads the menu at once, into the room or the challenge it was on); the first page's
                      trailer wired (trailer.js)
src/main.js           the game (boot.js loads it): wires the sim (via src/engine) to the client, fixed-step loop, start/end
                      screens (the end card's line says what ended the game from the sim's `G.outWhy`: a side's last
                      building fell, it had nothing left to fight with and no gold to train more, or it conceded), events; awaits the WASM (`engine.ready`) and, through gl/render.js, the art
src/style.css         all styling; design tokens at the top of :root; a desktop (a fine pointer, wider than 620 px) and a
                      tablet (a coarse pointer neither on its side at most 500 px tall nor at most 620 px wide: the
                      phones' blocks) have the canvas edge to edge, the top bar floating over it as the HUD does, what
                      sat in the stage kept in place (the safe area counted); phones keep the box;
                      the desktop HUD (a fine pointer, at least 1100 x 560 px; its last block): the same floating layout
                      at a monitor's size in units of --u (1 px at 1440 x 810, 0.9 to 1.1), every size from one table
                      of custom properties (three text sizes, 12, 14 and 17 units, none under 12 px; the icons; the
                      minimap's 190), the top bar as two corner clusters (gold and POP; the clock and the buttons, icons
                      only), 88 x 68 card slots whose blank ones are wells (quiet ones under an army's card: card.js
                      `army`); the menu's small text on a monitor (14 and 12 px)
src/engine/           the client's view of the Rust sim: index.js starts instantiating the WASM (`ready`: nothing calls
                      the sim before it has resolved), core.js mirrors it into the
                      G / map / entity-object shape the client reads and turns orders into calls by id (and keeps
                      the last few `mapPreview`s: the menu's thumbnail and the ground's starts ask for the same one).
                      constants.js reads the sim's tables (pkg/data.js, generated by build:wasm) and adds hotkeys
                      and descriptions;
                      util.js small helpers (and the menus' levels: `LEVELS`, Easy, Medium and Hard as the sim's 0, 1
                      and 2 since Nov 13, `levelOf` reading a stored 3 as 2, `DIFF_TIPS` each level's chip, Hard's
                      income bonus told); golden.js the golden games' table and runner (Node test, browsers in CI,
                      selftest.html). pkg/ is generated by build:wasm and not committed
claude/               play against Claude: PLAN_VOCAB.md (the plan vocabulary Claude writes from: every field, its range and
                      default, how the AI economy and its waves work, deltas and intents, reading the summary) and
                      PROTOCOL.md (the embed contract: the link's modes, the allowed origins, every message in and out)
crates/endfall-lab/   the balance lab (README.md): a binary on the sim as a library, all I/O, clocks and threads
                      here; batch.rs (the cells and seeds, one game played and recorded, threads in a fixed order),
                      report.rs (figures, Wilson intervals, target checks, key figures, Markdown and JSON), styles.rs
                      (each level's win rate by the style its seats drew, against itself and across the levels, and
                      the style parity checks; in report),
                      compare.rs, sheet.rs (the formula sheet, the sim's own absorb/hull_loss), json.rs, stats.rs,
                      plans.rs (random AI plans through World::set_ai_plans, the batch, the controls, the report),
                      turtle.rs (a never-attacking Medium against Medium; with --weak against Easy, the newcomer's
                      first hit: when, and that wave's units), waves.rs (every AI wave: its units and value, against
                      the defense on arrival, its result, where its units fell; in report and turtle), human.rs (a
                      human's opening: a plain scripted player alone, its bank, its waits for gold and its production's
                      busy share from 1:00 to 8:00; in report), trace.rs (one game of any seats and teams, each
                      seat's gold, workers, buildings, army and AI wave state at intervals: a stall from a grind; a
                      seat may follow a lab plan, `--plans`), duel.rs (play against Claude: `duel`, a written plan code
                      on Hard against an AI, with check-ins answered from a file, each answer landing `--delay`
                      game-seconds later; `plan-gate`, plain Hard against Hard with an empty plan, seed for seed), the `summary` command (main.rs: one game's summary JSON, src/summary/), bets.rs (rush, defense, tech: the 3x3, from Medium's tuning or `--level Hard`), tiers.rs
                      (attack now or invest further: a committer at each layer, basic, mid or top, against a teching
                      opponent, the bets' tech plan or the greedy human),
                      model.rs (logistic regression by IRLS, deterministic)
crates/endfall-sim/   THE GAME. Rust, no I/O, no clock, no HashMap iteration. Builds natively for cargo test.
  src/data/           the only source of game numbers: mod.rs (constants, kinds declared once by `kinds!`, the shape
                      of definitions and factions), humans.rs and vael.rs (each race's units, buildings and faction: the
                      Kingdom and the Expedition since the re-theme, their sim keys `humans` and `vael`), abilities.rs,
                      upgrades.rs (Energy efficiency, two levels at the Lab: machines cost `ENERGY_COST` of their price, `World::unit_cost`; Trade at the Market), diff.rs (AI tuning per difficulty: its tier by the clock, `tier_at`, Easy
                      to its mid tier only, Medium's and Hard's top tier from 8:00; Easy never retreats; Easy's clumsy waves
                      growing by one from `clumsy_until`; a people's own expansion time, `expand_at_of`: Medium's and
                      Hard's Kingdom at 7:00 on 96, 10:00 on bigger maps, Hard's Expedition at 7:00, read through `World::expand_time`),
                      plan.rs (a plan for an AI seat, play against Claude: the code's grammar, strict, each value
                      clamped and noted, `Plan::apply` over Hard as its drawn style plays it, deltas, intents;
                      claude/PLAN_VOCAB.md), style.rs (AI play styles, PRD: AI styles and the level ladder: Pressure, Timing, Boom, weighted
                      per level, `STYLE_WEIGHTS`, Easy never Pressure; `styled` turns a level's tuning into a style's
                      with a seat's six draws: a leaning unit, `Diff::focus`, its mix ratio at two thirds; Easy's army
                      cap, 8 to 14, its finishing time, 20:00 to 23:00, and mid tier, 10:00 to 13:00, and Boom's one or two top-tier units from 15:00,
                      `top_max`; every seat's stalled-game push from 13:00 to 17:00, Hard's from 10:00 to 13:00; drawn at each AI seat's first turn
                      from the world's RNG, `World::draw_style` in ai/mod.rs, kept in its brain and read through
                      `World::tuning`; a lab plan's seat plays its plan; `World::set_ai_styles` forces one, the lab's
                      only; never shown to the player),
                      tide.rs (the tide's cycle, levels, warning and sweep), radio.rs (coverage's numbers: which
                      machines need signal, what gives it and how far, the bonus inside and the stranded speed), export.rs (the tables as
                      JSON, one small writer). Places: the Kingdom's population, the Expedition's grid (`Faction::grid`):
                      a unit takes its `supply` (`World::takes`), a building gives its `supply` once finished and
                      takes none (only units take places, on both sides); capped by
                      the buildings and the maximum (`World::sup_max`: `POP_MAX`, `GRID_MAX`, the same on every
                      map; `room`). A building that `pays` earns its rate a second (the Market, the Wind turbine),
                      `per_hq` of them a finished headquarters. Each side's words: `Faction::money` (gold, energy)
                      and `ore` (gold, thorium). A `single` building (the Portal) is one a seat (`World::single_room`)
  src/jsmath.rs       JS-exact helpers: Math.round, Math.sign, ToInt32, V8's Math.hypot; libm for trig
  src/map.rs          the map's size (`MapSize`), terrain generation (2, 4 or 8 starts, one start's share and its
                      symmetric images: `max_starts`, `seat_starts`, `team_starts`), nodes (each base's crystals in an
                      uneven clump to one flank of its headquarters, `add_clump`; no map has a mine shaft since the re-theme's
                      economy: the generator still lays them, so the ground they shaped stays, and takes them up at the
                      end, `take_up_shafts`; then each field's crystals become one gold mine, `lay_mines`: 2x2
                      (`MINE_SIZE`), neutral, holding the field's gold, by orbit under the map's symmetry: the orbit's
                      first field finds a square where its crystals lay whose images all fit too (`mine_spot`: open
                      ground on its sides facing the nearest start or expansion, `HQ_MINE_GAP` off every start's
                      headquarters and a start's own exactly that far square to a side, `MINE_APART` from every other
                      mine and image, its own image under any element that maps the field onto itself, every start and
                      mine still in a walker's reach) and every image square gets a mine of the first's gold; the
                      expansions' sites keep their mines apart as they are drawn (`exp_mine_apart`, a field turned off
                      the far side where it must, `exp_outs`), the center's mines lie on a ring between neighboring
                      starts (`centre_ring`); the Kingdom's Market is built in its base, one a Castle),
                      occupancy grid, nearest_free;
                      heights and water (`height`, `ground`: land, shallows or deep at a water level; `Foot`, `passable`,
                      `nearest_passable`, `reach_from`: where a unit of a movement class may stand); the Shore map
                      (`generate_shore`: two starts, each a cove and a reef basin, `basins`; its own generator, so the
                      other kinds' maps never change)
  src/path.rs         A* + line-of-sight smoothing for a walker's `Foot` (f32 cost grid, fixed heap tie-breaks, a
                      look-ahead window)
  src/world/          the world: mod.rs (World, step, state_hash), types (entities, events), seats.rs (seats, teams,
                      starts, who is out and why, `beaten`, `OutWhy`: an AI's seat once its last building falls, a
                      person's once no worker is left either, or anyone's with no finished headquarters, worker, fighter
                      or factory with a unit in training or the gold to train a fighter; the last team standing), orders (placing:
                      `place_refusal`, the one placement check, a `Refusal` and its words (an Expedition building but the Data center and
                      the Uplink only with its center inside its side's coverage, `Refusal::Coverage`, data/radio.rs
                      `needs_coverage`: placing only, nothing goes offline), that `can_place`, the order,
                      the AI and the client's ghost read), spawn (a new worker waits where it stepped out, or walks
                      to its rally point, beside the mine for a rally on one: mining starts only on an order; the AI
                      orders its own, `ai/economy.rs`, from any mine on its side once those by home run dry), economy (gold mines: a worker walks
                      to a mine's side and goes in, `Phase::Mine`, `Unit::inside`: not drawn, not targeted or hit, out
                      of its enemies' sight, pushing nobody, safe from fleeing; up to its kind's `mine_cap` inside (eight
                      Villagers, five Bots: whoever is inside counts) for `MINE_TIME`, the rest waiting at its side,
                      and out with its kind's `mine_load` (a loaded worker walks at `LOADED_SPEED`); a main mine holds seven
                      `CRYSTAL_GOLD`, over 20 minutes at its full rate, so a normal game never runs it dry and expanding
                      is a choice for rate; an empty mine stays, takes nobody in, its workers to the nearest other), construction (a finished building's crew waits idle beside it),
                      wire.rs (commands as numbers for the network: encode, a total decode),
                      combat (the leash, `CHASE_LEASH` in data: a fight a unit picks up itself, idle, at a rally point,
                      on an attack-move or answering fire, follows its target only that far from where the fight began
                      (its spot, or the point of its route where the march turned: `Back`), the longer reach of the two
                      on top (a gun shelling it from afar can be gone for); let go there, it walks back to that point
                      (`Task::AMove`'s `rejoin`, picking no fight on the way) and only then marches on, so a fleeing
                      target cannot pull it along leash by leash; a shooter off the leash is not answered; idle guards answer a
                      shooter that hits a building in their idle look, `guards_answer`), movement, paths.rs (a group's one route shared by the units of one order, long
                      searches budgeted per seat per tick), fog, tide.rs (the water level's cycle, the warning and the
                      retreat, the sweep), radio.rs (coverage: the Expedition's combat machines work only within
                      a finished Data center's 18 tiles or an Uplink's 54 (on every map) of their side or an
                      ally, by exact distance from the building's center, moving x1.3 there; the sources listed again
                      when they change (checked each tick: derived, not hashed), and handed to the client as circles
                      (`radio_circles`, Game.radioCircles: x, y, reach per source of a side and its allies). A machine's
                      route keeps inside coverage (paths.rs `keep_covered`: a route that leaves it gives way to a
                      search over the covered tiles, path.rs `astar_within`, budgeted like any search). A move or
                      attack past the edge stops at it (fighting what it can reach from there; a player is told
                      "No signal there: an Uplink reaches further.", once a tick for a group, a group order judged by its first machine
                      inside coverage, with a `Signal` event at the spot for the client's rim cue); one left outside
                      (stranded: its Uplink fell) moves only towards coverage, slower, and walks back when idle; the
                      AI's push (one forward Uplink that covers its goal, its machines kept out of a wave until
                      coverage nears the goal), its wave's own Uplink and staging, and a wave left with only machines held quiet at the edge
                      ended, are in ai/army.rs); economy.rs keeps each seat's places (`World::supply`, `recalc_supply`)
  src/ai/             scripted opponent: mod.rs (its turn every 16 ticks, each brain on a tick of its own, phase by phase),
                      economy, build, research, produce, army, scouting. The Expedition's at the balance pass: its
                      mercenary line is held to its own share of the grid (`line_grid`, `line_max`); at that share
                      (`line_capped`) it raises its Factory sooner and adds Factories, not posts, as money piles up;
                      it keeps grid free for its Portal and an Android (`elite_reserve`), raises one Portal
                      (`tech2_due`, never a second), and trains the Android
                      there first when the grid is tight; its Wind turbines are its Market (five a Data center). Its crew is sized by income (`crew_of`: as much gold a trip as the
                      Kingdom's Villagers, so fewer Bots). Easy is clumsy (`Diff::wave_only`): its waves are just
                      their size (its first three or four units at 8:00, the rest at home), growing by one, and since
                      Nov 14 they never retreat (`retreat_below` 0, `give_up` 0: they fight to the last unit): until
                      12:00 and a wave of its has reached the foe (`clumsy_until`, `Ai::reached`) a wave that fell does
                      not grow the next, then each grows by one; its first wave leaves at 8:00 (no hit before it on any
                      map) and its army stops at the cap its style drew, 8 to 14 fighters (`army_max`, by units: its
                      gold banks) until it starts finishing (`finish_from`, 20:00 to 23:00, once a wave of its has reached the foe): then the cap lifts, its
                      waves take its whole army and its idle fighters at home join a wave out once a wave's count
                      (`reinforce_finishing`), so Easy against Easy ends. A Boom seat holds its natural's price from its other buildings while it is due
                      (`Diff::natural_first`). A level may cap a
                      race's towers (`tower_max`: one Sentry mast for Easy and Medium, one Watchtower for Easy). A wave
                      left with only machines held quiet at their coverage's edge is over, and so is any wave quiet for
                      90 s (`WAVE_QUIET`); the army it expects of the foe falls with the units of that sighting it sees
                      fall (`army_seen_ids`), and a wave short of its count goes when it crushes that (`crushing`). Its
                      push's and a wave's Uplink goes forward, at the first point of the walkers' way to the goal
                      whose 54 tiles take in the goal with 8 to spare (`relay_point`, `relay_spot`), so one covers the
                      push and stands as far back as that allows (its army answers an enemy at it as at any building),
                      and its price is held while a wave with machines is out (`relay_hold`); its Portal's Uplink stands
                      at home, on that way inside its coverage (`relay_home_point`), and is raised again when lost
                      (`tech2_due`: with none, the Portal stood idle for good). Against enemy siege
                      seen (`siege_seen`, the Cannon, the Rover) a level that adapts trains its dive unit (`AiScript::
                      dive`: the Knight, the Drone) one per line unit and holds its price (`dive_hold`); on contact
                      its wave's melee units and dive unit go for the nearest enemy siege gun it sees within 14 tiles
                      (`dive_at_siege`) and its Balloon flies over its wave, its sight past a Cannon's reach
                      (`escort_scout`), both on a level that adapts; a stalled game (`Diff::stall_from`, drawn per
                      seat between 13:00 and 17:00 for Medium, 10:00 and 13:00 for Hard and up: nothing razed by its side for 5 minutes, 3 on Hard,
                      `Diff::stall_window`, with some of the foe's army
                      it saw still standing) masses its next wave for
                      up to 3 minutes towards the cap (`STALL_HOLD`), never leaves while the foe is at its buildings,
                      and pushes without giving up (`Ai::push`); Hard's push takes everything (`Diff::push_all`: its
                      reserve goes too, and past the hold it goes with half its count or more), and from its stall time
                      a Hard seat behind the foe's army it last saw builds nothing but supply until it has caught up
                      (`Diff::army_first`); the home reserve alone never keeps a wave short of its count (two passive
                      Kingdoms each kept a quarter home and neither came: Nov 15); its Portal
                      holds the price of the elite it trains next (`gate_hold`, the Android first); its crew grows with
                      each base past the first up to four (army.rs, produce.rs, economy.rs)
  src/lib.rs          the wasm-bindgen surface: Game (orders, queries, flat snapshot arrays, events)
  src/lockstep.rs     a networked Game: orders out to the relay, everyone's back on their tick (Notion: Multiplayer design)
  src/snapshot.rs     the snapshot records, each declared once (writer + field names the client reads by name)
  src/summary/        the game summary (opt-in, `Game::recordSummary`; `summaryJson`, core.js `summary()`, null while
                      off; `npm run lab -- summary`): each seat's
                      economy and army by the minute (its units every 5 minutes), spending (workers, army, buildings,
                      expansions, towers, tech), production, research, attacks (an AI's waves, a person's units come
                      near enemy buildings: attacks.rs; why each wave went and ended, `World::ai_notes`, and its
                      strength against what it met at contact), trades by unit type in value, losses, what it saw of its
                      foes by its own sight (`World::seen`), an AI seat's drawn style, the main fights and the end,
                      places named after bases, as compact JSON (json.rs) for a reader between games; a planned seat's
                      "plan vs what happened" (plan.rs: each step's planned time against when it happened, with the AI's
                      own reasons for the wait); check-ins for a planned seat during play (checkin.rs, opt-in,
                      `Game::recordCheckIns`, `takeCheckIn`: every 2 game-minutes and on key events, a short digest of
                      its own state and what its sight showed); read-only, observed after each tick, no hash moves; no UI
                      shows it
src/client/           everything that touches the browser
  gl/render.js        PixiJS renderer: camera + zoom (a phone starts at 1, a desktop with 1050 px of the map across its window (never closer than ZOOM_MAX, 2.5), both on the map: nothing past its edges at the sides or the top; all the way out a window shows at most 1800 x 1012.5 world px² of the map in its own shape, `zoomLimit`, so a bigger monitor shows bigger units, not more map: a phone's limit stays ZOOM_MIN, 0.75; and never wider or taller than the map; a desktop's and a tablet's map edge to edge, `bleed`: the camera keeps to the map at the sides and past the top and the foot only as far as the floating top bar and panels cover (the foot's room up to the minimap's top, or SELECT's over it on a touch screen, read on each resize), where the apron, rock drawn APRON tiles past the map with its edge's fog, shows instead of the dark; a phone's box keeps its room past every edge), dual-grid terrain,
                      sprites (buildings, gold mines and walking units in one layer sorted by ground y: a mine by what
                      it has left, `mineStage`, mine_full/low/empty, a worker inside it not drawn; this side's units behind a
                      building as faint silhouettes, masked to the building's pixels), effects, lights, fog, minimap;
                      the selection marks (one thin whole ring, red for an enemy, round a unit's feet or a building's
                      footprint, `selRing`) and the health bars (4 px, lit along the top, a unit's at most 24 px wide,
                      34 for a large one, `slimBar`) in screen pixels at any zoom;
                      the range (the sim's circles round each Data center and Uplink, a soft tint at 7% faded as one
                      layer and the signal rim round their union, range.js: a 3.5 px dark halo at 50% under a 1.5 px
                      light line at 70%, and inside it a feathered band, 16 px of the rim's light from 18% to nothing,
                      in screen px at every zoom (`rimZoom`, a step of the zoom in the redraw's key);
                      above the fog, under the ghost, the bars and the selection box; shown while a machine, a Data
                      center or an Uplink of this side is selected or any Expedition building placed, drawn again only
                      when the sources or the zoom's step change; a machine sent past the edge (the sim's `signal`
                      event) brightens the rim's stretch nearest the spot, range.js `nearestRim`, fading over 0.6 s;
                      the no-signal sign over a stranded machine of ours, by exact distance as the sim; on the minimap
                      an Expedition seat's union outline always, over the fog (unexplored black too), drawn each frame
                      over the cached base, a 1.25 px line at 80% over a 2.5 px dark halo at 50% in CSS px (scaled by
                      the minimap's box); `rangeShown` for the tests); the minimap drawn in 168 units across its box
                      (its old fixed canvas: the same widths and dots as then) onto a backing of its CSS size times
                      the screen's pixels per CSS px (read each frame: another screen or the browser's zoom), times
                      its scale while enlarged under a finger (`#minimap.big`), at most 3 per CSS px of its box; the
                      ground scaled to that backing once a map and size; the placing hint (ui.js
                      `setHint`, `#hint.placing`) in 15 px type in its slot; a selected building's flat oval under it (look.js `selOval`; the placement ghost
                      stays square); the turning heads (aimed, spun or panned, look.js `headFrame`) and the Portal's
                      swirl, brighter each time a unit comes through (look.js `portalOpen`); a Cannon's muzzle smoke (`muzzleFx`), the
                      rifles' muzzle cone (`muzzleFlash`), a melee blow's glint of steel on its target and a heavy one's dust
                      (`meleeHit`), each shot's impact (`impactFx`, in steel's cool: look.js `HIT_STEEL`; up on the body of a flyer, `hitY`, look.js `HIT_LIFT`, or of a walker, `WALKER_HIT_LIFT`: main.js `struckWalker` finds whose), a hit's weight by how hard it hits (`tierHit`, `tierMuzzle`: look.js `hitTier`; main.js picks the tier from the shooter's weapon in the data, a tower's by its people, against what it struck, a flyer's air damage or the ground's; a muzzle flash by the shooter's target as far as the client knows, `shotTarget`), the shots in flight (look.js `SHOT_STYLE`: a Kingdom shaft scaled over a dark bar, an Expedition tracer tinted and lit, a heavy shot's stretched trail, `HEAVY_TRAIL`, its tier against the unit at its aim point), a fighter falling into dust and a machine exploding (`boom`), a building collapsing (`collapse`: a sinking ghost, dust or smoke, look.js `BLDG_DEATH`); a melee unit's strike poses in a fight (look.js `strikePose`);
                      construction you can read (construct.js): a Kingdom site raw (one shared color filter), its
                      slices measured on the art and capped at 7 of 8 so the roof waits, an Expedition site its body
                      rising in full color (64 rows, capped at 90%) under a faint cyan ghost in a printer gantry whose
                      head rides on the solid's top (`gantry_n`, `gantrybar_n`; nothing on the ground) up the front
                      masts, then back along the rails (construct.js `headAt`), its build bar in
                      the hp bar's place, the half-second done moment (`BldgObj.update`,
                      only for a site watched finish on screen), a builder's strikes (`UnitObj.work`); `sitesShown`
                      for the tests;
                      each unit kind's drawn height (`unitTop`, atlas.json `unitTops`); the HUD's portraits cut from the
                      atlas (`portrait`: the selection console, its queue, the guided first game; not the command card)
  gl/newart.js        the new look's switch (?art=new, off by default, remembered nowhere): loads the packs of
                      public/art/new/ (index.json: groups of sprite pages, each whole or not at all), whose frames
                      replace today's by name; without the switch nothing of it is fetched, and the packs are left out of
                      the offline install (tools/offline/plugin.mjs WEB_ONLY)
  gl/ground.js        the ground's picks, pure: which grass tile a dual-grid cell draws (`groundTile`: in a dry meadow
                      only dry-grass marks, in a lush one none), which overlay tile (`overlayTile`), each rock region's
                      kind, a forest or a rocky hill, picked once per region by a seeded flood fill (`rockKinds`,
                      `rockTile`, `regionAt`), and the shade layers at one texel a tile on a dry map (the land's shade,
                      the meadows' tone, the rock's tone; the water's tints and light) (test/ground.test.js)
  gl/groundplan.js    the ground broken up at large scale, pure: what goes where from the map alone (its rock, water,
                      gold mines and every start from `mapPreview`, seated or not) and its seed, the same for every
                      player whoever sits where, exact arithmetic only (`planGround`): dry and lush meadows 5 to 12
                      tiles across; worn dirt, a yard at every start and tracks (start to its mines, between the starts,
                      every other mine to the nearest track: the cheapest walk over a winding cost, joining trunks),
                      kept to open land and fading out over TRACK_FADE tiles where a pass, a gate or a ford cuts them,
                      no piece under TRACK_MIN tiles; each hill and forest toned warm or cool with a drift along it, off
                      its outer tiles and the map's edge; an upper tier (crags) inside the wide hills. render.js lays
                      the worn dirt and the crags as overlay tiles on the dual grid (`worn_*`, `crag_*` in the atlas:
                      tools/art/overlay3.js), never in a cell with rock or water, each cell as strong as its worn
                      corners; the tones in the shade layers; all of it faintly on the minimap; `endfall.ground()` what
                      it laid and its cost (test/groundplan.test.js, test/e2e/ground.e2e.mjs)
  gl/newland.js       the new look's land (`?art=new`, gl/newart.js), pure: where every tree, rock and low plant stands on a
                      map (`planLand`: a standing piece's base whole on blocked cells (a rock's base: the core of its
                      width, `baseWidth`; a clump of rock on every cell at a hill's border, bushes at a wood's), its top over walkable ground no
                      deeper than `LAND.cap` tiles, `allowance`; a piece a unit may stand behind marked `live`), the
                      ground's mix of grass, worn dirt, forest floor and scree as a small image (`groundMix`), fading out
                      past the blocked cells' rounded, wobbled outline (`MIX_RIM`), and the
                      art over the walkable cells for the test (`cover`); from the map's blocked cells, the ground plan
                      and the seed alone, exact arithmetic only (test/newland.test.js)
  gl/newland-pieces.js  the land pieces' measured numbers (size, base, profile), written by tools/newart/land/build.mjs
                      from pictures that are not in the repo: the placement's and its test's source of truth
  gl/newlandgl.js     the new land drawn: the ground as one quad with a shader of its own (the tiling grounds mixed by
                      the mix image, a soft contact shadow round blocked ground, darker to the south and east; the apron too; `MINIMAP`: the minimap's ground
                      colors and gold mines with the new land), the pieces nothing can stand behind laid in rows under the units,
                      the live ones among the units and buildings, sorted with them, only those on screen; gl/render.js
                      shows a unit behind them as a silhouette (ours in our color, another seat's in red)
  screen.js           full screen / landscape lock where the page's full screen works (`pageFullscreenWorks`: not on
                      iPad or iPhone); START, TUTORIAL, REMATCH and READY go full screen on a touch screen only (with a
                      mouse, a desktop has room enough: only the button goes in; BACK TO GAME restores it either way); the
                      player's choice to leave it, the page held still in a browser tab, the leave-game guard; in the
                      installed app (display fullscreen, the manifest's orientation `any`: the menu and the docs turn
                      with the phone) those same entries lock landscape with no page full screen (Chrome 124+; refused:
                      the page's full screen as in a tab), and the menu unlocks it (`releaseLandscape`)
  corner.js           sound and full screen always in reach: the top bar's pair in a game, the screen's corner (#corner)
                      over every menu page, the lobby and every card (the pause card: full screen only, as it pauses the
                      sound); one sound setting; on iPad/iPhone the full-screen button opens the Add to Home Screen card
                      (#homeTip)
  store.js            what this device remembers (localStorage, endfall.*; endfall.controls: the keyboard scheme); the
                      player's name, one key (endfall.name) and one sanitiser (`cleanName`: trimmed, 16 at most, as the
                      relay takes it) behind `playerName` get/set, shared by the lobby's NAME and OPTIONS' (test/store.test.js)
  controls.js         the desktop keyboard scheme: CLASSIC (letters; arrows, edge, minimap, middle drag) or WASD (W A S D
                      always pan; a command's key is its card slot's, GRID: E R T / F G H / C V B by key position),
                      `keyed`; shown where `(pointer: fine)`
  options.js          the OPTIONS card: a list of settings drawn by one helper, chips or a text field: NAME (every device,
                      the lobby's name, store.js `playerName`, kept on change or blur, empty allowed) and CONTROLS (where
                      `(pointer: fine)`); its button shown where any applies, so everywhere; opened from the menu's first
                      page and the pause card; opening it focuses a lit chip or BACK, never the field (no phone keyboard)
  help.js             the in-game help sheet: the ? in the top bar (between the clock and FULL SCREEN) or the pause card's
                      HOW TO PLAY opens it in the stage's top-right corner (over the pause card, below the corner's
                      pair): the controls in four lines (a mouse's or touch's, by the pointer), the goal in the
                      player's people's words, the docs' full guide in a new tab, and Send feedback (feedback.js); the
                      game runs on under it; Esc, its close button or the ? again close it
  feedback.js         the game's ways to the docs' feedback form: the first page's quiet second link beside Learn more
                      and the help sheet's, each to ./docs/feedback/ with `from` (menu or game), `v` and `c` (the sim's
                      build and the last game update's commit) and `touch`, in a new tab
  scenery.js          deterministic scatter of scenery props (doodads) from the map seed; visual only
  menu.js             start menu: a first page, one for everyone (SINGLE PLAYER and MULTIPLAYER big; TUTORIAL, the
                      guided game, OPTIONS and PLAY OFFLINE small under them;
                      the trailer's poster above them, trailer.js; the line under the name says what the game is (the
                      trailer tells the story); the record of games is kept but not shown;
                      a room's, a challenge's or a plan's link opens its own page; the footer line: Learn more, Send
                      feedback; the build stamp at
                      its foot, "Updated <date> · <hash>": the last game update, the newest commit under
                      vite.config.js `SHIPPED`, which also goes in <meta name="build"> for CI's deploy to read back
                      from the live site; a docs- or CI-only commit ships the same bytes), the single-player page
                      (the board: eight fixed spots, you and one to
                      seven AIs, a token per seat whose sheet sets its race, RANDOM too, an AI's level, and its side;
                      with no board saved: you against the other people on Easy;
                      + AI in the lowest empty spot; the map list, any offered map that seats them, with a preview, on
                      Dust Quarter (96x96, two players) by default, a saved hidden map opening the default; no FIRST
                      GAME there; `?seed=` plays the hidden 64x64 random slot, `?map=N` opens map N, hidden ones too:
                      the tests' ways to a 64x64 game),
                      the footer line under the buttons, Learn more (the docs home, in a new tab), the stamp's
                      tooltip and `data-build` the Version (the sim's build); the map list and preview the lobby
                      shares (a hidden map listed only while it is the one chosen: a challenge's or an old room's); a
                      challenge link (`?vs=`, challenge.js) opens the single-player page on its setup, its line
                      in the footer, the parameter dropped from the address, nothing saved until the player changes the
                      board or the map (then it is theirs: saved, and an ordinary game); a plan link (`?plan=`,
                      plan.js) sets the AI's plan for this visit's games, its line in the footer, nothing saved
  seats.js            the board's eight fixed spots (a seat keeps its spot, and its spot's color in the game, whatever
                      its side; adding fills the lowest empty spot; single player's REMOVE moves the players after it
                      up a spot and numbers the sides again without a gap, `removeAt`; the lobby's empties the spot): a
                      spot per entry (`{ race, team, diff }`, null when empty, you in spot 0) and how they become the
                      game's seats (`arrange` puts each side's seats side by side, your side first; `startSetup`, with
                      `spots`, each seat's spot), pure (test/seats.test.js: `arrange`, `startSetup`, `enemyLevel`,
                      `newAi`, `canRemove`, `removeAt`, `sideChoices`, ...); and the board's DOM pieces, the lobby's
                      too, built from a seat's view: `tokenEl` (color band, name, race, level pips, its side's tag; a host's crown, a
                      ready check, AWAY, an open seat's SIT HERE), `emptySpot` (+ AI, + SEAT, or a faint outline),
                      `chipRow` (a radio group), `seatSheet` (RACE, LEVEL, SIDE; footer buttons), `sheetDialog` (a
                      modal <dialog>)
  maps.js             the maps the menus offer, every one whatever the players (a map seats as many as its starts: 2
                      on 64x64, 4 on 96x96, 8 on 128x128; the chosen map decides the size; `fits`, `fitMap`: the
                      smallest offered that seats them when they outgrow it), named fixed maps and a random one per
                      size; the 64x64 maps (the duel's and the Lake's) hidden (`SIZES`' `hidden`, `offered`: in no
                      list, never a fallback; kept under their indices, which rooms and links name, and still played
                      when one is named; the guided first game plays Ashen Basin); `DEFAULT_MAP` (Dust Quarter: single
                      player's first visit and a new room); a map's label ("Iron Compass · up to 8"), the map an online setup plays, the team splits a saved
                      setup of the menu before the board names; pure (test/maps.test.js; the relay imports it too)
  challenge.js        SHARE's challenge link (on the site its card address, `/vs/CODE`, answered by the site's Worker
                      with the challenge's card, on to `/?vs=CODE`; elsewhere `?vs=CODE` itself): a single-player setup (the map, its seed and starts, each
                      spot's race, side and level) and the winner's time as a short versioned code of numbers and
                      enumerated values, `encode`/`decode` (strict: only exactly what encode makes), `fromSetup` (the
                      menu's game), and every word said of it (the link's card, SHARE's line, the menu's CHALLENGE line);
                      pure, no free text (test/challenge.test.js; site/preview.js imports it for the link's card)
  plan.js             a plan link (`?plan=CODE`, `&watch=1`; play against Claude, claude/PLAN_VOCAB.md): the plan
                      code's grammar, strict, canonical in the vocabulary's order (`decode`/`encode`); the sim reads
                      the same grammar and validates and clamps every value; pure, no free text (test/plan.test.js)
  claude.js           play against Claude in the game (claude/PROTOCOL.md): the plan applied to the first enemy AI seat
                      as a single-player game starts (watching: an AI-only duel, the plan on seat 0, no orders), and with
                      `?embed=1` in a frame, the message channel to an allowed parent (check-ins and the summary out;
                      plans, deltas and a line for the player in, the line shown as text)
  embed.js            the channel's checks: allowed origins (loopback, or exactly `embedder=`), each message field by
                      field, the player's line (capped, no control characters); pure (test/plan.test.js)
  share.js            the end card's SHARE after a victory against the AI (not online, not the guided game): the
                      challenge link through the share sheet, else copied (LINK COPIED in the button a moment); a
                      cancelled sheet says nothing
  grouphint.js        on touch, fighters tapped one by one (3 within 8 s) bring a hint, once: a finger held on the
                      ground then a box, SELECT, ARMY (the two buttons pulse); back after 3 more games (endfall.games, endfall.groupHint);
                      never in the guided first game (its checklist's step teaches it)
  ui.js               client UI state (ui.sel, ui.mode, ui.place), the armed-order table, hint (while placing over a red
                      spot, why, in red: `placeRefusal`, the sim's check), toasts, setSelection
  hud.js              top bar (the Kingdom's gold as coins and population, the Expedition's energy as a bolt and grid)
                      and selection panel (what a Market or a Wind turbine earns, in its side's money; the unit in
                      training shows the time it still needs on its slot, `timeLeft`)
  cards.js            what the command card holds for a selection: its buttons by slot and their keys (pure: read by
                      test/cards.test.js). Three columns; buttons of a type (units, researches, orders, abilities) pack
                      among themselves, actions never shift: on a building, its units in the top row in the order they
                      unlock (three at most), Rally in the second row's middle (slot 4), the queue's Cancel in the
                      corner (5), its researches from slot 3 (from 0 on one that trains nothing), each in a fixed
                      slot (a finished one stays there, grayed out with a check), a running one's Cancel in its place; a Build page keeps each building in the slot it was first shown in for
                      the game (per seat and page, forgotten when a new WASM game starts), so a newly opened one (the
                      Uplink too) takes the first free slot, and Back keeps the corner; `buildPages`: the sim's two
                      lists with every defense (the Watchtower, the Sentry mast) on the basic page, before Advanced
  card.js             the command card's buttons (cards.js holds them), long-press details, what a button does; a unit
                      or a building button (its item's `por`: [what, kind]) shows its symbol (icons.js `glyph`), the
                      others their icon; yellow (--ally2) when it can be used, gray when locked or short of gold
  stats.js            the long-press details' stat chips, and only there: two fixed rows from the sim's tables (Health,
                      Shields for a shielded race (none since the re-theme), Armor; damage, ground/air, tags), base
                      stats only (test/stats.test.js)
  tools.js            player helpers: select the army / an idle factory / same type, control groups, alerts (no
                      idle-worker key or counter: workers wait for orders by design)
  bench.js            the device test (?bench): the card, its game, the per-frame timings, the report and its code
  pause.js            the pause card: alone it pauses, online a menu over a game that goes on, with a pause for
                      everyone (the relay's) and its state on every side; full screen out/in
  clock.js            the top bar's game clock (#rClock, m:ss): the sim's time (G.time), so it stops when paused and
                      follows fast-forward; written only when its text changes; `clock`, the format the pause card uses
  icons.js            line icons (inline SVG; no imports: the menu draws them before the game has loaded), and a flat
                      two-tone symbol for every unit and building of both peoples (`glyph`: lines over a faint fill),
                      the command card's pictures. A unit shows who, an action a tool: a person is one solid bust
                      holding a big tool (`who`, `BUST`), a mount its horse or helm, a machine its machine;
                      test/cards.test.js: every button has its drawing, no two buttons a card shows together share
                      one, nor any two units or buildings, no unit is drawn like an action, every person has the bust
                      and nothing else does
  range.js            the range's circles, pure: `inRange` (the sim's rule, exact distance), `unionArcs` (the outline
                      of their union) and `nearestRim` (the outline's stretch nearest a point: the leash cue)
                      (test/range.test.js)
  construct.js        construction you can read, pure: the Kingdom's raw look (`RAW`, `rawStage`, `rawMatrix`), the
                      Expedition's rising body under its ghost in the gantry (`GHOST`, `GANTRY`, `solidRows`,
                      `ghostAlpha`), the gantry's frame, which the art is drawn from too (tools/render3d/country.js),
                      and its head's way through it (`GANTRY_FRAME`, `headPath`, `headAt`), the build bar, the done
                      moment's curves
                      (`DONE`, `doneAt`, `donePuffs`), a site's damage against its growing hp (`siteHurt`), a builder's
                      strikes (`WORK`, `strikeCount`, `strikeAt`, `atSite`), the cards' and the paused toast's words
                      (`builderLine`, `siteLine`, `pausedToast`, once a site a minute) (test/construct.test.js)
  look.js             per-kind presentation the sim does not know: building lights, chimney smoke (points measured on
                      the turned models; puffs only while the building trains or researches, `chimneyActive`) and
                      heads (a turret's aimed, a rotor's spun, the Uplink's dish panned: `headFrame`; the Portal's
                      swirl brightening each time a unit comes through, then settling, `portalOpen`),
                      a selected building's oval (`selOval`), muzzle smoke (`MUZZLE_SMOKE`) and flash (`MUZZLE_FLASH`), a melee
                      blow's dust and a fighter's fall (`MELEE_PUFF`, `HIT_DUST`, `DEATH_DUST`: the round `trail` earth-tinted, `DUST`), each shot's impact (`IMPACT`, `impactOf`), how hard a hit lands, one scale for every unit and tower by its weapon's damage per hit against what it struck (`hitTier`, `HIT_TIERS`: light, medium, heavy, siege; `HIT_LOOK`: light as before, medium a flash, heavy a bright blow with chips of steel, siege a blast, each with its muzzle flash and the impact sound's `weight`, audio.js `hit`; every hit in steel's cool, `HIT_STEEL`, the muzzle flashes warm; a shot on a walker up on its body, `WALKER_HIT_LIFT`), who falls as a machine (`MACHINES`), the melee units' strike poses (`STRIKE`, `strikePose`, `inReach`), each shot's
                      sprite by its shooter or people (`shotArt`) and how it is drawn to read on a phone (`SHOT_STYLE`, `SHOT_BAR`, `SHOT_GLOW`, `HEAVY_TRAIL`: the Kingdom's shafts larger on a dark bar and never lit, every Expedition shot but the rocket a cool lit tracer, a heavy shot's trail), unit poses and voices, the seat colors
                      and the spot each game seat plays in (`setSpots`, `colorOf`: a player keeps its board spot's color),
                      `UNIT_ART_SCALE` (units rendered larger than their sim size, shared with tools/render3d)
  input.js            mouse / touch / keyboard / minimap handling -> selection changes and sim commands (the keys' and the
                      mouse edge's pan at PAN_SPEED world px a second, the same time across the map at any zoom); a unit is hit
                      on a circle round its drawn body (half its drawn height above its feet), a gold mine on its
                      footprint and the rock just over it; a worker inside a mine is not picked or boxed; workers sent
                      to an empty mine are told so ("This mine is empty"; the sim sends them on to the nearest with gold);
                      touch: a finger held still on the map for HOLD_MS (350 ms, within the pan's 10 px; a ring fills
                      under it) arms a box there (a tick, SELECT lit amber, the map's edge aglow, the hint), dragged it
                      draws, lifted unmoved it does nothing; a move, a second finger, placing or an armed order means no
                      hold, and a late timer yields to the finger's own timestamps; a box that takes nothing keeps the
                      selection on touch (a mouse's empty box still clears it); SELECT: tap to toggle, or hold
  audio.js            Web Audio synthesized sfx; the context opens only in a gesture WebKit counts (a touch's end, a click,
                      a key) and nothing plays until it runs; `holdSound`: the pause card suspends it; a hidden tab
                      suspends it too; `gameSound`: the wind bed plays in a game only (main.js `begin`, the end card,
                      menu.js `showMenu`), the menu's clicks either way
  voice.js            the formant-synthesized announcer (audio.js `say`: under attack, research complete, not enough
                      gold, in each race's voice): STYLES, three a race, and each race's device style
  speech.js           the announcer in the device's own voice (Web Speech API): a voice per race picked from the device's
                      English voices, the synth where it has none; unlocked in a gesture, cut by the pause card and mute.
                      The announcer is OFF in the game (audio.js `audio.announcer = null`, 2026-10-28) until the owner
                      finds a voice they like in voice-lab.html; 'device' or 'synth' turns it back on
  fx.js               particles and markers (client-only, fed by sim events)
  trailer.js          the trailer on the menu's first page (index.html #menuTrailer and #trailerDlg; style.css): its
                      poster (public/menu/trailer.jpg, the King's card; in the offline cache), a still with a play
                      button, framed above the buttons, beside them on a phone on its side (a still, not a moving clip:
                      the field under the page shows the same armies); a tap opens a dialog and plays it there with its
                      sound and the browser's controls, its <video> made only then (none in the markup: nothing fetched
                      before, and Firefox no longer cancels a fetch of the backdrop on a reload under the service
                      worker; public/docs/media/ebbfall-trailer.mp4, the Worker's byte ranges, web-only); its sound its
                      own (a muted game does not mute it: the player chose it with a tap; no WebAudio); never autoplayed
                      or looped; paused for good on CLOSE or Esc, a hidden or left tab, a link followed, another menu
                      page; let go of when a game starts (any button, or over the socket); offline it says it needs a
                      connection; no frame if the poster never comes
  memory.js           enemy buildings as this side last saw them: in fog the field, the minimap and picking show the
                      remembered copy (a building never seen is not shown), forgotten when its ground is seen without it
  offline.js          PLAY OFFLINE on the first page and in the pause card: the install offer where there is one (the
                      browser's prompt, else the Home Screen card on iPad/iPhone); on the first page, once installed or where
                      nothing installs, it asks the service worker and says so until everything is saved
  online.js           Multiplayer: the lobby (open/join a room by code or link, a line on how; the room is single
                      player's board of eight spots: people, AIs and open seats as tokens, your race in your token's
                      sheet, READY a lit toggle; the host's sheets put anyone on any side, set an AI's race and level,
                      share or fill or remove an open seat (SHARE, COMPUTER, OPEN: short words, their meaning in the
                      hover titles; the host's sheet one size whatever the seat); + AI / + SEAT in the lowest empty
                      spot; the map list; a guest's board read-only, SIT HERE; the host's REMOVE in a person's sheet (a stranger who guessed
                      the code: the relay bars their address from the room); a name first, NEW ROOM and JOIN dimmed
                      without one; in a room the address is ?room=CODE, the link a reload or a friend opens) and the glue between
                      src/net and the game (relay URL: ?relay=, VITE_RELAY_URL, or the dev host's port 8788; a build
                      with VITE_RELAY_URL shows MULTIPLAYER in the HTML itself, vite.config.js)
src/net/net.js        the network client (Notion: Multiplayer design): hello/rejoin, lobby messages (seats by spot), its game seat
                      from `start`, sends this side's orders,
                      feeds the relay's turns to the lockstep Game, acks with checkpoint hashes, reconnects; no DOM
src/net/roomcode.js   room codes, one module for the relay, the lobby and the link's card: six letters of a vowel-free
                      alphabet (64 million), made from crypto random numbers, shown BCD-FGH, read in any case with or
                      without the hyphen or spaces (`parseCode`), the first format's four letters told apart (`oldCode`)
test/engine.test.js   the WASM sim through src/engine in Node: presentation of every kind, RNG/hypot, golden hashes, gameplay
test/scenery.test.js  the scenery scatter on real maps: deterministic, props where they belong, sprites in the atlas
test/range.test.js    the range's circles (src/client/range.js): in range by exact distance, the union's outline
test/art.test.js      the atlas against the game: every unit, building and turret frame has its team mask, a tint per seat,
                      a drawn height per unit kind; each people's construction, rubble, worn dirt and shots, the ground's
                      tiles in both rock kinds, every stage and variant of the gold outcrop (the link preview's), the
                      gold mine's three stages, neutral; and look.js's presentation: a selected building's oval, the
                      heads' frames (aimed, spun, panned), the Portal brightening as a unit comes through
test/strike.test.js   the melee units' strike poses (look.js `strikePose`): the strike just after a blow, the wind-up
                      in reach between blows (shoved or not), the walk out of reach; reach as the sim's; both frames in every facing with
                      their masks, out of the walk animation
test/construct.test.js construction you can read (construct.js): the designer's numbers, the 7-of-8 reveal, the raw
                      matrix (saturation, brightness kept, warm), the hologram's cap and shimmer, the done moment's
                      curves, a site's damage, a builder's strikes, the cards' and the toast's words, the knock
test/tiers.test.js    how hard a hit lands (look.js `hitTier`): every armed unit and tower pinned to its tier from the live
                      data, on the ground and against a flyer (the Ballista bolt heavy there), the lines, the looks and
                      sound weights, a tower told by its people; no camera shake from hits
test/shots.test.js    how each shot is drawn to read on a phone (look.js `SHOT_STYLE`, `SHOT_LIT`, `HIT_STEEL`): the
                      Kingdom's shafts on a dark bar and never lit, every Expedition shot but the rocket a cool lit tracer
                      (the Drone's the Sentry mast's), hits in steel's cool and muzzle flashes warm, the heavy trail
test/collapse.test.js a building's fall (look.js `BLDG_DEATH`, `bldgDeath`): no fire but the Data center's small boom, the
                      ghost's timing, the shake for a headquarters only, the Portal's power lost, the burning flash's chance
test/newart.test.js   the new look's loader (src/client/gl/newart.js): nothing fetched without the switch, a group whole or
                      not at all, no stale team mask; test/newart-tone.test.js its tone curve; test/e2e/newart.e2e.mjs
                      the switch in the game: the fallback, the same game with and without it
test/ground.test.js   the ground's picks (src/client/gl/ground.js): one kind per rock region, through corners and off the
                      map, fixed by the seed; the grass's patches capped, a meadow's marks; an overlay cell's variant
test/groundplan.test.js  the ground's plan (src/client/gl/groundplan.js): the same plan, grid for grid, whoever is seated
                      where (two to eight seated, any starts filled, on the 96 and 128 maps and the Lake), another for
                      another seed; worn ground only on open land, a track through a one-tile pass faded each side and
                      no small piece; the tones off the rock's edge, the water and the map's edge; the e2e map's plan
                      hash
test/audio.test.js    the sound engine on a stub Web Audio API: every recipe plays, every sound the sim names exists
test/e2e/             browser tests: harness.mjs (serves dist/ as Cloudflare does, test/cloudflare-assets.mjs: the pages
                      at their canonical addresses, the _headers the deploy writes and the site's CSP (site/cache.js; its
                      relay allowed too: `TEST_CSP`), and what is not a file by the site's Worker, the docs' videos
                      first (run_worker_first, with ASSETS faked as Cloudflare's: no byte ranges), or its 1103 when
                      `site.blocked`), drives mouse/keys/touch, stops workers through the UI for a
                      tap, `stopByUI`: a box and S; its `test` takes `engines: true`
                      for the cross-engine subset and `chromium: 'why'` for Chromium-only), shards.mjs and times.json
                      (ENDFALL_SHARD's split by measured time; tools/e2e-times.mjs), gameplay.e2e.mjs (scenarios),
                      construct.e2e.mjs (construction you can read: the unfinished looks, the cards' percentages, the
                      paused toast once a minute, the done moment),
                      touch.e2e.mjs (phone gestures: one-finger pan and glide, hold-then-drag box, SELECT box, minimap nudge),
                      online.e2e.mjs (two browsers through a local relay: room, join link, lockstep, leaving concedes,
                      the pause card's menu and a pause for everyone, the board (AIs, levels, sides, nothing moving, a
                      guest's view, an open seat's SHARE LINK), two people against two AIs, six with AI seats in their
                      spots' colors, eight seats on phones; a code typed as shown or not, the share line, an
                      out-of-date link, the host's REMOVE, the limits' line),
                      csp.e2e.mjs (no CSP violation, in any frame or worker, on the menu, the service worker and a
                      reload under it, a game, the help sheet, a room on the relay, the bench's report, the
                      challenge's embedded plan link, the device check, the voice lab, the docs and the clip: each
                      surface a test of its own, in a context of its own),
                      feedback.e2e.mjs (the docs' feedback form on a portrait phone and a desktop through the site's
                      Worker, the email binding faked by the harness (`site.mail`): the details from the game's link,
                      the counter, the email as it would go, the thank-you; a failed send and a blocked Worker (1103):
                      "Couldn't send" and its mailto link, a long text cut; JavaScript off: no SEND, a line to write;
                      the menu's and the help sheet's links with their details),
                      docs.e2e.mjs (the first page's footer line: Learn more, the docs home in a new tab, the old buttons
                      gone; the ? and its help sheet, the game running on, closed by Esc, its button or the ?, from the
                      pause card too; every docs page with JavaScript off at 360 px: whole, every unit and building
                      listed, no sideways scroll, finger-sized tabs and buttons, a slim bar in landscape; the
                      Kingdom's glance at most 700 px tall at 390x844, the top bar opaque on every page; How to play's
                      touch table: a row's ? opens its loop under the words and plays it, nothing of it fetched before
                      the tap, another row's ? closes the first, the ? again closes it; under reduced motion the
                      poster with controls instead; the ? hidden with JavaScript off; the docs' videos playing on past
                      their loop's end, where WebKit asks for a byte range, the Worker's 206),
                      field.e2e.mjs (the field under the first page: the right image per size class, under the buttons
                      (what the poster and they leave: a low band on most desktops, none where there is no room), the
                      buttons unmoved, the plain floor when the image does not come, no tide line and no drift, the
                      band under the other menu pages too, as tall as ever, no band on a screen too short),
                      menutrailer.e2e.mjs (the first page's trailer: its poster beside the buttons on a phone on its
                      side, both big buttons whole on screen and nothing scrolling at 844x390, 667x375, 568x320 and
                      844x340; framed above them upright and on a desktop; nothing of the video asked for before the
                      tap (reduced motion too); the tap plays it in the dialog with its sound, a muted game too, the
                      controls, no loop, from the Worker's byte ranges, the dialog whole on a phone on its side; paused
                      for good on CLOSE, a hidden tab, the credit's link; START GAME on screen, a game started lets go
                      of it; offline it says it needs a connection; no frame without the poster; the same page whether
                      `tall` or not, fitting with PLAY OFFLINE's answer),
                      hudsizes.e2e.mjs (the desktop HUD's size table at 1280x720, 1920x1080 and 2560x1440: --u never
                      over 1.1, no HUD text under 12 px and three sizes in all, the minimap, the portraits, the hint
                      over the minimap and the camera's room past the foot over a three-row card; a landscape phone's
                      HUD piece by piece as it was),
                      bench.e2e.mjs (?bench: a short run measured, its report sent through a local relay, read back by code;
                      no keys while it measures, a swapped game stops it, a relay that does not answer),
                      corner.e2e.mjs (sound and full screen on every screen and card, clear of their content; the wind
                      in a game only, a hidden tab silent; iPad and iPhone: no page full screen, the Home Screen card;
                      the player's choice to leave full screen wins),
                      clock.e2e.mjs (the top bar's clock on a desktop and a landscape phone: at the start, after a
                      fast-forward, still while paused, clear of POP and the buttons),
                      window.e2e.mjs (an iPad's and a phone's browser tab with its bars: the menus, the HUD and the cards
                      fit, no page scroll, the map fills the room and fits again when the bars collapse),
                      plan.e2e.mjs (a plan link: the AI seat plays it on Hard, watch plays it against Hard, a bad code
                      is the plain menu; an embedding page at a loopback origin gets a check-in, its delta applied and
                      its line shown as text, bad messages ignored), share.e2e.mjs (SHARE after a victory: the link copied or shared, a cancelled sheet, the end card on
                      small screens; the link opens the same setup and START plays the same start, nothing saved; a
                      change makes it the player's; a bad link opens the plain menu; none after the guided game),
                      selftest.e2e.mjs (the golden games in the engine under test), ground.e2e.mjs (the ground laid at
                      a game's start on a desktop and a phone, its plan bit for bit Node's in every engine, no page
                      error), offline.e2e.mjs (PLAY OFFLINE:
                      the install offer, and against the real service worker, the app icons), static.e2e.mjs (the Worker blocked, as a tripped spending limit
                      leaves it: the game's page, the docs and a single-player game from the files alone, the service
                      worker installed, no error, nothing reaching the Worker but the docs' videos, which fail), voice.e2e.mjs (the voice lab
                      loads and plays; every synth style rendered offline and measured: peak, loudness, length, no
                      rumble; ENDFALL_VOICE_OUT=dir writes WAVs to listen to)
test/offline.test.js  the service worker (tools/offline/sw.js) on a fake Cache Storage: PLAY OFFLINE's answer, a resumed
                      install, a page the host redirects stored as a response of its own at both addresses, Cloudflare's
                      analytics beacon and byte ranges (the docs' videos) left to the network; the manifest's app icons;
                      its scope, display and orientation (`any`) and the game's own landscape lock
test/net.test.js      two Net clients with WASM Games through the Node relay: same world every tick through a dropped socket,
                      a suspended page, a wake during a pending reconnect, orders given while offline; rooms of three,
                      four (two AIs at different levels) and eight with AI seats; a guest at spot 1 who plays game
                      seat 2 (the start arranges the sides); a flooding client (an ack flood keeps few hashes, a huge
                      or oversized order refused, a message flood closes its socket and it comes back by its token);
                      invite links through a relay that counts the limits (a typo or two, rooms nobody sat in, a scan);
                      a quiet room closed by the relay: the lobby Net shows why and does not reconnect
test/menu-art.test.js the menu's field images (public/menu/) have no alpha channel: their fade is baked into the floor's
                      color (Safari on iPad and iPhone drew their old alpha as opaque; Playwright's WebKit cannot show that)
test/menu-trailer.test.js the first page's trailer: the line under the name and the page's descriptions what the game is;
                      the poster a button with its play mark and words, in the offline cache; no video in the page,
                      the one trailer.js makes with controls, inline, preload none, no autoplay, mute or loop, its words
                      from the dialog's frame, the music's
                      credit word for word with its license linked; the script plays it on the tap only and pauses it
                      for good (CLOSE, hidden, a link), a game lets go of it; the file under the Worker's rule,
                      web-only, under 8 MB, faststart
test/memory.test.js   the last-seen memory of enemy buildings on the WASM sim: an enemy Market unseen until a unit
                      looks, remembered after it walks away and after it dies out of sight, own and allied ones live
test/stats.test.js    the preview card's stat rows for every unit and building kind (src/client/stats.js)
test/cards.test.js    every card of both races (units, buildings, Build pages, armed orders, placing) on the WASM sim:
                      a WASD key per button by slot, none twice on a card, never W A S D, Q or P; every building's
                      layout, and no button moved by a unit or a building unlocked mid-game
test/shards.test.js   the e2e shards (test/e2e/shards.mjs): every test in exactly one shard for n = 1 to 6, deterministic,
                      balanced, a test missing from the table placed by the median
test/seats.test.js    the board's rules: spots to seats, team ids and each seat's spot, a new AI's spot and side, the
                      sides a sheet offers, a saved board checked (and one from before the spots)
test/relay-bench.test.js the Node relay's HTTP side for the device test's reports (POST/GET, chunked oversize, limits);
                      the Worker's (codes, ORIGINS, limits per address and in all, expiry) are in relay-worker.test.js,
                      with the rooms' limits (opening per address and per IPv6 /48 a minute and an hour, everyone's
                      counted at a room's first seat, joins with a miss costing more, everyone's misses reported in
                      batches and a scan from rotating networks tripping them, on a fake clock; wrangler.toml's
                      bindings equal relay/limits.js's numbers), the first format's codes told to update, the host's
                      REMOVE barring an address, PROTO, a flooding connection closed (MSG_CLOSE); hibernation on a fake
                      runtime that keeps the sockets and their attachments and hibernates only with no timer pending
                      (a lobby with no clock; ready, race and seats through a hibernation, a game started, played and
                      over, then a rematch; a token back; a close while hibernated; holds and an over game's grace by
                      the alarm; a quiet lobby or over room closed, a game never; an over game's lost turns; eight
                      sockets; the message bucket and everyone's count after a wake); the spend ceiling (relay/limits.js
                      Ceiling: the 11th room at once refused with its words, joins to a room open never, a closed room's
                      slot freed, a crashed one's reclaimed when its lease runs out; the month's room-hours charged
                      ahead, spent refusing new rooms while a game goes on, kept through a restart, afresh on the 1st UTC;
                      the limits object down or erring: new rooms refused, joins still let in)
test/roomcode.test.js room codes (src/net/roomcode.js): made, read as typed or shown, shown BCD-FGH; the lobby uses them
test/site-worker.test.js the site as deployed: the files by Cloudflare's assets (test/cloudflare-assets.mjs: html_handling
                      auto-trailing-slash, the _headers file) and the Worker (site/worker.js) only for what is not a
                      file: the game's page for every link, the docs and the other pages served with no Worker and with
                      every security header, their other spellings sent on (307), the cache headers, the docs' videos
                      the Worker's (run_worker_first): whole with Accept-Ranges, a byte range 206, past the end 416,
                      HEAD, If-Range, If-None-Match, their posters the assets'; what is not a
                      file, www and http, a room's card address, a tripped limit (1103), the CSP's reports, the beacon
                      only with a token, _headers, wrangler.toml; with dist/ built, every file the service worker
                      stores and every page served by the assets, and the deploy's build step writing the beacon into
                      every page with a token and none without; a challenge's card address (/vs/CODE: its card, the
                      same script on to /?vs=, anything not exactly a code the game makes the game's page); POST
                      /api/feedback the Worker's, the feedback bindings in wrangler.toml (the email to one address, a
                      Rate Limiting namespace not the relay's, the budget object), the module exporting its handler and
                      that object's class
test/site-feedback.test.js the docs' feedback endpoint (site/feedback.js) through the Worker, its bindings faked: only a
                      same-origin JSON POST, the body and the message capped, the honeypot (answered as sent, nothing
                      sent), the time on the page, every field checked, header injection (CR, LF and every control
                      kept out of the subject and Reply-To; a bad Reply-To refused), the email (to contact@, from
                      feedback@, Reply-To, the subject's first eight words, plain text, the details at the bottom, never
                      the address it came from), the minute's binding, the hour per address and the day for everyone
                      (the budget's rule and object: a short hash of the address, counters only, fails closed), a
                      failed send (502, its code logged, never the message)
test/cloudflare-assets.mjs Cloudflare's static assets for the tests (no tests of its own): which file answers an address
                      (auto-trailing-slash), _headers parsed and matched
test/site-csp.test.js the CSP (site/cache.js): no unsafe-inline or unsafe-eval, every directive, the relay and the beacon
                      the code uses; no <style>, style="" or inline handler in the pages, every inline script hashed
                      (with dist/ built, every page of the build, the docs too, with and without the beacon; a room's
                      and a challenge's card page, one script for both; CI runs it after the build)
test/site-preview.test.js the link cards (site/preview.js): a room's code in its card address read as the relay's
                      (src/net/roomcode.js: hostile, overlong, four letters, lower case, a hyphen), its card and page
                      (the site's image fields as index.html's, one script on to the room), SHARE LINK's address on the
                      site and elsewhere; a challenge's code in its card address (/vs/CODE: exactly what the game
                      makes, nothing decoded), its card and page; the head, the JSON-LD, og.png's size,
                      robots.txt and the sitemap, and that the build's service worker leaves those out
test/docs.test.js     the docs (tools/docs) built into a temporary folder: every unit and building of each people on its
                      page in the Build list's order, each figure the data's (cost, population or grid, what it needs,
                      its description without the need), the healers on no page; How to play's figures and the
                      diagrams' the data's; every token known; the crops cut from today's art (each plate's alt
                      from the data: "Ebbfall's Guard, a Kingdom unit: ..."); each page's head and index.html's (own
                      title and description of search-result length, canonical, Open Graph and X cards that agree);
                      every JSON-LD block checked against schema.org's properties by a small built-in table
                      (VideoGame the same on / and /docs/, the clip's VideoObject, breadcrumbs inside) and links;
                      the clip's words and size; the controls videos (the loop at the top of How to play's phone
                      section, the one video that plays by itself, its poster fetched first; none on About;
                      the touch table's seven gestures on demand: a ? button each with its aria attributes and data,
                      nothing of a loop in the page); images with alt (empty only when decorative, aria-hidden), sizes,
                      WebP, lazy, a phone's own files; the sitemap with lastmod, llms.txt; no em dash, American
                      spelling, About's one quiet line naming Stelian; the glance's tiers (one per requirement in
                      Build-list order, each building in its tier, its units in order, a "needs" tag only where the
                      building's chain does not imply it); the feedback page (the form as site/feedback.js checks it,
                      the honeypot, the details, SEND only with scripts, the fallback and the thank-you) and About's
                      privacy line about it, checked against what the code sends
test/site-dns.test.js site/dns.mjs on a fake Cloudflare API: GitHub Pages' records of the apex and www picked out (never
                      relay.ebbfall.com or others), the summary, proxy/unproxy (one batch of PATCHes of `proxied`, nothing
                      the second time), a leftover custom domain dropped, a restore past a failure
test/build-stamp.test.js the build stamp: the commit and its date baked in, <meta name="build"> in the page's head
test/build-inputs.test.js every file the production build reads lies under vite.config.js `SHIPPED` (a path missing
                      there would ship a game update under an older stamp)
test/store.test.js    the player's name: `cleanName` (and that the relay names a hello the same), `playerName`'s one key
test/plan.test.js     a plan link's code (src/client/plan.js): round-trips, strict, the sim taking exactly the codes
                      the link takes (WASM), plans and deltas refused in lockstep; the embed channel's checks
                      (src/client/embed.js): every message shape, the player's line, allowed origins only
test/challenge.test.js a challenge's code (src/client/challenge.js): setups round-trip, the code canonical (sides as they
                      first appear, the side modulo starts x players), hostile, malformed and other versions refused (a
                      fuzz too), a won game's setup (a RANDOM race as drawn), the card's and SHARE's words, plain text;
                      the link: the card address on the site, `?vs=` anywhere else
test/maps.test.js     the menus' maps (src/client/maps.js): the players each map seats, the hidden 64x64 maps and the
                      default, maps that fit (the smallest offered that does when they outgrow one), labels, an online
                      setup's map at its own size, the team splits
relay/                the multiplayer relay (Notion: Multiplayer design): room.js, the rules as a pure state machine (seats on
                      the board's fixed spots (a seat keeps its spot in the lobby), AI seats and their levels, the
                      game's seats arranged by side only at the start (`setup.spots`), the room's map checked against
                      its seats (it imports src/client/maps.js; a new room on `DEFAULT_MAP`), lobby, the turn clock, the log, away and back,
                      desync checks, the host's remove: the address barred while the room lasts, in its record; the
                      caps: numbers per order and per turn, a seat's numbers per game, checkpoint hashes kept);
                      server.mjs, a Node WebSocket server for local play and the tests (`node relay/server.mjs`); worker.js, the same rules on Cloudflare (a
                      Worker and one Durable Object per room on the WebSocket Hibernation API: a turn clock only while
                      a game runs, an alarm for the rest, the room back from its record and the sockets' attachments
                      after a hibernation; a lobby or an over game quiet 30 minutes closed, room.js QUIET_MS;
                      wrangler.toml; CI deploys it when the live one is not this commit's build), its front door edge.js (codes, the Origin check, the limits, which object);
                      limits.js, the limits per address (and IPv6 /48) and in all (Notion: Multiplayer design, Security:
                      Workers Rate Limiting bindings for an address's minute, an object named `limits` for its hour,
                      everyone's rooms (counted once someone sits in one) and everyone's misses (a scan's brake), all
                      in memory in the Node relay but for this machine; and the spend ceiling, the Worker's only, in
                      that object's storage: at most MAX_ROOMS (10) rooms at once and ROOM_HOURS_PER_MONTH (6,000) a UTC
                      month, Durable Objects being outside the Workers spending limit; each room holds a lease from its
                      opening, renewed while it runs, charged ahead, given back when it closes, reclaimed when it runs
                      out; past either, a new room is told "Multiplayer is busy", and so is one while that object cannot
                      be asked: the ceiling fails closed, joins and renewals never ask first), the messages per connection (a token bucket,
                      both adapters) and the counter bench.js shares;
                      bench.js, the device test's reports over HTTP (POST /bench, GET
                      /bench/<CODE>), in both; version.js, GET /version (`{proto, build}`, what CI reads), in both
site/                 the site, https://ebbfall.com/ (Notion: Multiplayer design, Hosting): dist/ as a Worker's static assets
                      (wrangler.toml: ebbfall.com/* and www as zone routes; html_handling "auto-trailing-slash": / is
                      index.html, /docs/kingdom/ that folder's, /selftest selftest.html, the .html spellings sent on;
                      run_worker_first only for the docs' videos, /docs/media/*.mp4: every other file is served with no
                      Worker, so a tripped Workers spending limit leaves the game, the docs and single player up);
                      media.js (the docs' videos and the menu's trailer read from env.ASSETS and answered with byte
                      ranges: 206 and
                      Content-Range, 416, Accept-Ranges; the assets answer a Range with the whole file, 200, which
                      Safari refuses to play); worker.js (the videos, then only what is not a file: a room's
                      card address /r/CODE, the room's own link card then on to /?room=CODE; a challenge's, /vs/CODE,
                      the challenge's card ("Can you beat this?") then on to /?vs=CODE; the docs' feedback form, POST
                      /api/feedback: feedback.js; www and http to
                      https://ebbfall.com/; a page load that is not a file goes to /, a missing file is a 404; the
                      CSP's reports, POST /csp-report, logged short and answered 204), preview.js (pure: a room's card
                      and its page, `roomPage(code)`, CODE read as the relay's (src/net/roomcode.js, which also gives
                      SHARE LINK's address: `shareLink`); a challenge's, `challengePage(code)`, CODE exactly what
                      src/client/challenge.js makes (whose `link` gives the address on the site); both pages one
                      script, allowed by its hash; every link to the game's page, ?room= and ?vs= among them, shows
                      the site's card from index.html), feedback.js (POST /api/feedback, the docs' form mailed to
                      contact@ebbfall.com from feedback@ebbfall.com through Cloudflare Email Sending, the
                      `send_email` binding FEEDBACK_EMAIL, which may mail that one address only; Reply-To the
                      player's address when given and valid; plain text, no control character in a header; refused,
                      cheapest first: not a same-origin JSON POST, over 12 KB, a filled honeypot (answered as sent),
                      under 3 s on the page (the page's own count: a speed bump), a field of the wrong shape; then the
                      Rate Limiting binding FEEDBACK_LIMIT (2 a minute per address) and the Durable Object
                      FeedbackBudget (3 an hour per address, 200 a UTC day from everyone; one record of counters, an
                      address only as a short hash, nothing older than an hour; unreachable: nothing sent). Nothing
                      of a message is stored: the email is the record), cache.js (by served address: assets/ immutable; /, the
                      other pages, sw.js and the manifest no-cache; the security headers every response carries,
                      _headers' and the Worker's, the CSP among them (enforced), its sources directive by directive),
                      build.mjs (wrangler's build step, at deploy: dist/_headers from cache.js, and with
                      CF_ANALYTICS_TOKEN the analytics beacon into every page of dist/, beacon.js), dns.mjs (the two
                      hostnames' records: logged before a deploy, GitHub Pages' own proxied after it so the routes see
                      the traffic, DNS-only again for a rollback); CI's deploy job
tools/chromium.mjs    headless Chromium launcher with software WebGL, shared by the art generator and the e2e tests
tools/engines.mjs     the e2e tests' engine (ENDFALL_ENGINE: chromium, webkit, firefox) and its device profiles
tools/devices/        the device smoke (Devices workflow): devices.mjs (the iPad, iPhone, Pixel per backend), drivers.mjs
                      (BrowserStack, iOS Simulator through Appium, Android emulator, local Playwright, any WebDriver),
                      webdriver.mjs (a fetch-only W3C client), smoke.mjs (the steps, screenshots, summary.json); README.md
tools/offline/        the Vite plugin that writes dist/sw.js (plugin.mjs) from the service worker's template (sw.js): every
                      file of dist/ but source maps and WEB_ONLY
tools/icons.mjs       public/icon-*.png (the install prompt's PNG icons) from public/icon.svg; output committed
tools/docs/           the docs microsite at /docs/ (PRD "Docs microsite"; the Vite plugin in build.mjs writes it into dist/
                      with the game: dist/docs/<page>/index.html, dist/sitemap.xml with every page and its lastmod,
                      dist/llms.txt): data.mjs (each people's buildings in the Build list's order with the units each
                      trains, the facts strip, FIGURES: every number the copy names, from the data), copy/*.html (each
                      page's words: a head comment with its title and description, then HTML with tokens, pages.mjs:
                      {{roster}}, {{figure}}, {{diagram}}, {{n}} ...), pages.mjs (the tokens filled), diagrams.mjs
                      (the loop, the economy, the caps, the Expedition's signal, a people's tree (a row of columns; on a
                      portrait phone the "Ledger": tiers by what each building needs first) and research, the
                      home's tiles, About's network (a phone and a laptop on the same game, orders through the relay)
                      and strip: HTML and two SVGs from the data and the crops), html.mjs (the
                      shell: head, cards, structured data (the home: index.html's VideoGame as it is, build.mjs
                      `videoGame`, and the clip's VideoObject), the slim top bar, the footer; nothing
                      inline but the structured data (the CSP): one stylesheet, dist/docs/docs.css (docs.css, the
                      designer's "Field manual", the fonts, and each page's positions and sizes as classes, `styled`),
                      and one deferred script, docs.js (the tabs scrolled to the current one, the clip fetched once the
                      page has loaded and played in view, the touch table's gesture loops made and played on a row's ?);
                      two fonts preloaded, the page's first media (a screenshot or a clip's poster) fetched first, every
                      other image lazy), sprites.mjs and crops.mjs (the sprite crops: the
                      recipe, the list, cut in Chromium from public/art into public/docs/img/sprites/ as WebP at
                      desktop and phone size, committed; sprites.json what each was cut from, test/docs.test.js
                      fails when stale), shots.mjs (the screenshots and the gameplay clip, staged in the built game
                      in Chromium: the AI off, units spawned, the fog layer hidden (render.js `showFog`, endfall.fog),
                      committed in public/docs/img/shots/ and public/docs/media/ (trailer.mp4, the docs home's clip; the
                      game's trailer, the menu's, is ebbfall-trailer.mp4 beside it, not made here; the clip is Drones swarming a Watchtower by a Castle on Sunken Court, Archers and a
                      Ballista coming to its help, 11 s at 30 fps, one tick a frame (tools/trailer/stage.mjs `freeze`)
                      but for one slow-motion beat on the Ballista's first hit (a fraction of a tick a frame), from
                      DPR 2 frames in target/docs-clip/ encoded by ffmpeg under the home's budget, its end dissolving
                      into its first half second so it loops without a cut, its poster its middle frame); shots.json
                      their sizes, words and the boxes the annotated ones mark).
                      public/docs/fonts/: IBM Plex Sans (OFL); the game's two fonts are copied from src/fonts/. The
                      Worker serves the docs' folders (site/worker.js `folder`); not stored for offline play.
                      /docs/feedback/ (copy/feedback.html, pages.mjs {{feedback}}): the feedback form, linked from
                      About and from the game's menu and help sheet (src/client/feedback.js), not a tab; the kinds,
                      the text's limit and the endpoint site/feedback.js's; docs.js fills in the details (the game's
                      version from the link or the page's stamp, the browser and system in a few words, the screen,
                      touch or mouse, where it came from), counts the characters, sends it as JSON and shows the
                      thank-you, or, on any answer but `{ ok: true }` (error 1103 among them), "Couldn't send" with a
                      mailto link carrying the kind and the text; without scripts the form shows, SEND hidden, a line
                      to write instead
tools/trailer/        the trailer (the 30-second storyboard), recorded in the built game in Chromium; videos are not
                      committed (target/trailer/). shots.mjs: the shot list as data (each segment a staged page: the
                      people it plays, its scene through the debug handle, its parts with a camera per frame, ticks per
                      frame for a time-lapse, actions, overlays); stage.mjs: the page (the sim takes orders only for its
                      own seat, so a shot plays the people it orders: `endfall.paint` keeps the Kingdom blue and the
                      Expedition red-pink, `engine.revealAll` draws the other seat and the mines wherever they are (it and `endfall.fog(false)` are refused
                      in an online game: no console map hack), `endfall.bars`
                      hides the bars over the map) and the frame clock
                      (requestAnimationFrame and performance.now taken over: a frame is 1/30 s of game time);
                      overlay.mjs: captions, the flash, the grading and the end card in the game's fonts; record.mjs:
                      the frames at DPR 2 piped into ffmpeg per part, with the effects the game asked for (audio.js
                      `audio.record`); sound.mjs: those effects rendered offline through audio.js's recipes
                      (`renderSfx`); cut.mjs: the versions (openings A and B, 9:16, the YouTube hold) and contact
                      sheets, 720p web copies and 2 fps frames. ffmpeg: FFMPEG, .tools/ffmpeg/ffmpeg (a static build with libx264) or the PATH's
tools/controls/       the controls videos (the docs' touch and desktop tables, as films). The phone's: the real built game on a landscape phone
                      (844x390, DPR 2, touch) on the trailer's stage, one scene (beats.mjs `scene`: a small Kingdom base
                      on Gold Crown's first start, well inside the map so HOME and a pan never show past its edge; a
                      group of soldiers, a Knight apart) and six beats in the docs' order (select and move, a hold then a
                      box, a double-tap, ARMY and HOME, a drag and a pinch, Deselect and a button held). The fingers go
                      through the real touch input (touch.mjs: CDP Input.dispatchTouchEvent, stamped on the recorded
                      clock; the page's timers and CSS animations on that clock too (stage.mjs `freeze`'s `__tick`), so
                      the game's hold ring, SELECT lighting up, the selection and the card's details are its own) and
                      draw the indicator (overlay.mjs: a finger dot, a ring that fills as the game's does, a trail, a
                      ripple a tap, two dots for a pinch). record.mjs: the frames per beat into ffmpeg (target/controls/,
                      not committed), the captions rendered once as PNGs; cut.mjs: the deliverables, committed in
                      public/docs/media/controls/ (controls-phone.mp4 1688x780 captioned, controls-phone-9x16.mp4,
                      controls-loop.mp4 the essentials under 400 KB, touch-<gesture>.mp4 one each under 150 KB, a WebP
                      poster each, a punch-in on the held button's details; --review copies them with a contact sheet,
                      a still near the end of each caption; tools/docs/controls.json lists them for the docs' tokens).
                      How to play shows the loop at the start of its phone section (before the desktop's), About none
                      (pages.mjs {{clip name}}: the poster an image over the video until it plays, the video fetched only
                      when played, as the home's clip); the only videos that play by themselves. Seven touch rows have a
                      gesture's loop on demand (pages.mjs {{loop name}}: a ? button, 32 px in a 44 px target, and an
                      empty box under the row's words; docs.js makes the video and its poster there on a tap and plays
                      it, the ? again closes it, one open at a time, under reduced motion the poster with controls;
                      nothing of a loop is fetched before the tap, and the ? is hidden where scripts do not run). The
                      desktop's (record.mjs `--set desktop`, desktop.mjs): the same scene on a 1280x720 window at the
                      docs' desktop zoom, a mouse and a keyboard through CDP input events (mouse.mjs: the cursor's glides,
                      clicks, drags, double-clicks and keys stamped on the recorded clock; a drawn arrow cursor, a white
                      ring at a left click and a teal one at a right click, the keys as keycaps just above the minimap), seven
                      beats in the desktop tables' words (a box, a right-click, a double-click, A then a click, B then a
                      building, Ctrl+1 and 1, the arrow keys) and the WASD scheme's one (`--set desktop-wasd`: the
                      device's setting through stage.mjs `init`); cut.mjs `--set desktop`: desktop-loop.mp4 (1280x720,
                      ~16 s, captioned) and desk-<gesture>.mp4 (960x540, 2-3 s), each poster a frame after the answer.
                      How to play shows the loop at the start of its desktop section (lazy: the phone's loop is the
                      page's first media) and seven desktop rows have a gesture's loop on demand through the same ?
                      (the Mouse and Key tables take the touch table's class; the schemes table its ? alone).
tools/newart/         the new look's packs (public/art/new/, NOTICE.txt beside them): a builder per group
                      (bldg/build.mjs) that reads the pictures from EBBFALL_PICTURES (a local folder, not in the repo),
                      and tone.mjs, the one tone curve every picture gets when it is packed, never a team mask
tools/view-capture.mjs  how the game looks on a desktop monitor against a landscape phone (npm run build first; a
                      Chromium): one staged instant of seed 4242 under a held clock (the start's framing, then a fight
                      with 12 of ours box-selected through the UI), shot at 1440x900, 1920x1080 and 2560x1440 per START_SPAN
                      candidate (--spans) and on an 844x390 phone, a Knight's share of the canvas's height each, with a
                      contact sheet; output to ../ebbfall-article/desktop-start (--out), not committed. `--set edge --tag T`:
                      the build at hand (ENDFALL_DIST) at those sizes, 3440x1440 and the phone, the start, two corners all
                      the way out and the fight; `--set edge --sheet` lays tags today and edge side by side (desktop-edge). It draws through
                      `endfall.draw` (main.js: the HUD and one frame, tools only). `--set hud --tag T`: the desktop HUD's
                      stills (a base, a raid met, the army of 12 selected with Q) at 1920x1080, 1440x900, 2560x1440 at
                      DPR 2 and the phone, the melee close up, one unit and a queue (../ebbfall-article/hud-pr/T); `--set hud
                      --sheet` lays tags main and pr side by side. `--set tablet --tag T` / `--sheet`: the edge set on
                      tablets (1024x768, 1180x820, 1366x1024, 820x1180 upright, touch) and the phone, main beside pr
                      (../ebbfall-article/tablet-edge). `--set ground --tag T` / `--sheet`: the ground's stills (the
                      start, a fight, all the way out, the fog, the minimap, 2560x1440 at DPR 2, the phone, whole maps
                      of two 96 seeds, the 128 map and the Lake, `gates`: 1:1 pieces of the passes a track runs
                      through), main beside pr (../ebbfall-article/ground-pr).
tools/og.mjs          public/og.png, the link preview's image (1200x630): the icon, the wordmark and a battle of the game's
                      own sprites, composed in headless Chromium, reduced to 256 colors to stay small; output committed
tools/menu-art.mjs    public/menu/menu-<wide|desktop|landscape|portrait>.webp, the field under the menu's first page: og.png's
                      battle as a band (the Castle and the Data center with their armies), the game's 3D models rendered
                      through tools/render3d at twice the atlas's scale (render3d.mjs's `zoom`), the ground and the effects
                      from public/art, one image per size class with the night veil and the top fade into the floor's color baked in (opaque: Safari's
                      decoder drew these WebPs' alpha as opaque; test/menu-art.test.js), composed
                      and written as WebP in headless Chromium; output committed (run after changing the models or the scene)
public/               copied as is into dist/: the icons, the manifest, art/, menu/ (the first page's field and its trailer's poster); og.png, robots.txt and sitemap.xml are for
                      crawlers and link previews (tools/offline/plugin.mjs WEB_ONLY: not stored for offline play)
scripts/headless.js   scripted bot-vs-AI run for balance checks
scripts/build-wasm.mjs cargo build for wasm32 + wasm-bindgen into src/engine/pkg/
tools/newart/land/    the new look's land, built from a local folder of pictures (EBBFALL_PICTURES) into public/art/new/:
                      build.mjs (every tuned number in its CFG: the sheets' parts keyed and cut, lit by tone.mjs, their
                      shadows, the gold mine's three states, the page and the tiling grounds as WebP, the land's entry
                      in index.json, and gl/newland-pieces.js), decode.mjs (a JPEG's pixels through headless Chromium,
                      cached under target/), img.js (the pixel arithmetic), capture.mjs (stills of today's art beside
                      the new at one held instant, the canopy caps, a frame time and memory note)
tools/render3d/       3D models, materials, camera/lights and the sprite finish, run in headless Chromium (three.js). The
                      re-theme's set (retheme.js: `ATLAS_UNITS`, `ATLAS_BUILDINGS`, `ATLAS_HEADS` map today's kinds to
                      its models, `atlasSprites` renders them under today's names, the melee units' two strike poses besides their walk,
                      `STRIKE_POSES`, in a larger cell trimmed in the atlas; `BLDG_YAW` gives each building its
                      fixed angle about the vertical, fitted so its ground outline spills past the footprint no more
                      than the square model's, the round towers square): the kingdom (kingdom.js,
                      kingdom-units.js, kingdom-buildings.js; the hip-roof Cottage, the Cannon in the siege slot), the Expedition
                      (expedition*.js; since R2 of its rework the Wind turbine, tavern, warehouse, domed Lab, Sentry gun,
                      Uplink dish and black-hole Portal, their rotor, dish and swirl as heads; its Data center the server hall of
                      expedition-buildings.js, Stelian's pick of 2026-11-11, the block drawn beside it kept for the record only), the countryside's gold,
                      props, construction and rubble (country.js), the gold mine (mine.js), and the polished finish they
                      render in (polish.js, scene.js `shoot`'s `polish`: cast shadows at alpha 110 for buildings and
                      units alike, no baked chimney smoke) at the game's 40-degree camera and 420 sun. The older models
                      (models.js, buildings.js, harbour*.js, vael*.js, trimmed to what main.js still draws) stay only
                      for the two healers the sim keeps but trains nowhere (main.js `HEALERS`: medic, halo) and fitTints'
                      reference sprites, which set the atlas's seat tints
tools/art/            generator driver (generate.mjs), the painted ground (terrain3.js: grass, forest and hill tiles;
                      overlay3.js: the overlay grounds on the dual grid, the tracks' worn dirt and a hill's upper tier) and
                      effects (effects3.js: shots, explosions, smoke, the worn dirt under buildings; effects2.js for the
                      light blob, the rally flag and the heal sparkle), packer, PNG encoder, the pages' WebP (webp.mjs: lossless, libwebp in WASM through @jsquash/webp); the review pictures
                      (retheme-*.mjs, battle-shots.mjs (the brawl scenes: the melee kinds hand to hand); strike-sheet.mjs: each melee
                      unit's walk, wind-up and strike in every facing (or the facings asked for) at desktop and phone size; retheme-datacenter.mjs: the Data center's two options at their
                      angles beside today's, the Expedition base, and the depth pass's before/after sheet of every
                      building); see Notion: Ebbfall art
public/art/           generated atlas.json index + atlas-<n>.webp/json pages (PixiJS spritesheets, scale 2), committed
```

