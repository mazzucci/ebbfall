# Endfall tech-debt review 3: readiness for more units, abilities, balance passes and a third race

Scope: `/mnt/data/projects/endfall` on `main` (HEAD `e1aa70b`), read only. Line numbers are from that revision.

## 1. Readiness verdict

**Good bones, not yet ready for abilities.** The architecture choices that matter are already right and tested:
orders are values (`Command`, `World::apply`, logged and replayed: `world/command.rs:9-153`,
`tests/gameplay/random_play.rs:65-122`), kinds and snapshot records are declared once (`data/mod.rs:47-70`
`kinds!`, `snapshot.rs:9-18` `record!`), rules are per seat, the AI is a per-faction recipe (`AiScript`,
`data/mod.rs:214-229`), goldens pin behaviour, and random play plus invariants catch breakage. Adding units is
cheap today (a `UnitDef` row, a `kinds!` line, hotkey/desc/voice rows, art) and will stay cheap.

Abilities are a different matter. Four things would make them land as another layer of special cases rather than
as a system, and each is cheaper to fix before the first ability than after the third:

1. **There is no place for per-unit ability state.** `Unit` (`world/mod.rs:97-131`) already carries seven
   purpose-specific timers and scratch fields (`aggro_cd`, `stuck`, `anchor`, `no_build_until`, `heal_fx`,
   `healed_at`, and `cd` doubling as the repair-spark timer at `construction.rs:70-71`). Energy, cooldowns, a toggle
   mode and timed buffs would add four or five more, and every stat read (`speed`, `range`, `cd`) goes straight to
   `kind.def()` (`movement.rs:83,119,143`, `mod.rs:640-643`, `combat.rs:331-340`), so a Stim or Siege modifier
   has no single point to apply.
2. **The healer is the precedent, and it is the wrong one.** Medic/Halo are two `UnitDef` fields (`heal`, `mend`,
   `data/mod.rs:134-139`) plus a branch in `update_unit` (`mod.rs:650-652`), a 73-line `medic()`
   (`combat.rs:403-475`), a special case in `update_amove` (`combat.rs:587-592`), a hard-coded reach
   (`combat.rs:27-29`), an event flag (`Event::Heal.mend`), a client stat line (`hud.js:66`) and an effect colour
   (`render.js:327`). One passive ability cost nine touch points; five active ones at that rate is the grab-bag.
3. **New orders cost five edits in five files** (Command variant, `apply` arm, `lib.rs` wasm fn, `core.js`
   wrapper, `random_order_with` arm) and `apply` returns an error string for only three of them (`command.rs:123-135`).
   Abilities need errors ("Not enough energy", "On cooldown") to reach the player, and a group cast needs a
   command that names several units (today only `Formation` does, `command.rs:72-76`).
4. **The client's armed-order machinery is string-and-if-chain.** `ui.mode` takes eight string values checked in
   36 places across `hud.js`, `input.js` and `main.js`; `doCommand` (`hud.js:327-354`), `setHint`
   (`hud.js:359-363`), `leftAction` (`input.js:128-165`), `commandAt` (`input.js:109-126`) and the minimap
   (`input.js:277,287`) each enumerate the modes by hand. A targeted ability is a ninth mode with another branch in
   each; a second ability is a tenth. The command card's fixed-slot arithmetic (`hud.js:190,211`) has no notion of
   a row for abilities.

None of this is deep. The refactors in section 2 are each one small-to-medium PR, all but one leave the goldens
untouched, and together they turn an ability into: one `AbilityDef` row, one effect arm in the sim, one rule row for
the AI, and zero new client branches. Balancing (item 3) is already well served by `duel()`/`balance_matrix` and
the AI-vs-AI goldens; it mainly needs a micro hook in `duel_once` so abilities count. The third race is mostly
data once abilities are a table, with two faction-level grab-bag risks noted in section 4.

## 2. Refactors to do BEFORE abilities, in order

### R1. Declare `UnitDef`/`BldgDef` fields once; group the weapon; add an `abilities` list (data)

- **What.** (a) Make `data/export.rs` generate the per-kind JSON from the same field list that defines the struct
  (the `record!` idea from `snapshot.rs:9-18`, applied to defs), instead of hand-listing every field in `unit()`
  (`export.rs:76-102`) and `bldg()` (`export.rs:104-132`). (b) Pull the weapon out of `UnitDef`/`BldgDef` into one
  `Weapon { dmg, dmg_air, range, cd, proj, melee, splash, splash_r, up_dmg }` as `Option<Weapon>` so `armed()`,
  `damage_vs()`, `hits_of()` (`combat.rs:117-120`) and the two 8-tuple unpackings in `fire()` (`combat.rs:330-355`)
  collapse to one accessor `World::weapon_of(id) -> Option<(&Weapon, x, y, team)>`. (c) Add
  `energy: f64` and `abilities: &'static [AbilityKind]` (empty today) and a `data/abilities.rs` declared with
  `kinds!`.
- **Why.** The export already drifted: `splash`/`splash_r` are not exported (`export.rs:76-102`), so the client
  cannot show them. Every ability field added later would need the struct, the `UNIT` default (`data/mod.rs:245-272`)
  and the export edited in step. Grouping the weapon also removes the four overlapping predicates
  (`armed`, `threat`, `damage_vs`, `hits_of`) that every new unit role has to satisfy consistently.
- **Size.** Medium (one PR). **Golden risk: none** (data shape only; values unchanged). `test/engine.test.js:39`
  and `orders.rs:363` already assert table consistency; extend them to the new fields.
- **Files.** `data/mod.rs`, `data/humans.rs`, `data/vael.rs`, `data/export.rs`, `world/combat.rs` (weapon reads),
  `src/engine/constants.js`.

### R2. One accessor for live unit stats, and one `set_task` (sim)

- **What.** (a) Grow `Fighter` (`mod.rs:39-49`, built once per tick in `update_unit`) into the single source of a
  unit's effective `speed`, `range`, `cd`, `sight`, `hits`, and pass it to `step_path`/`approach`
  (`movement.rs:81-155`, which read `kind.def().speed` three times) and `fire`. Rename it `Stats` or `Live`.
  (b) Replace the repeated "set task, clear path, reset repath/stuck/anchor" blocks (`orders.rs:212-244, 263-277,
  309-331`, `movement.rs:200-204`, `economy.rs:344-346`) with one `set_task(uid, task)` that does the resets by
  task kind. (c) Make `resume_after` (`economy.rs:331-347`) the single "go back to what you were doing" entry and
  have it honour an optional `Back` (today `Back` is private to `Task::Attack`, `mod.rs:32-37,63-66`).
- **Why.** Stim (speed, fire rate), Siege (range, damage, immobile) and slows are *modifiers to stats*; without one
  read point they become `if u.mode == …` sprinkled through movement and combat. A targeted cast is a short task
  that must resume the previous one, exactly what `Back` does for Attack, but `Back` cannot be reused from a new
  task today. `set_task` also removes the bug class where a new order forgets `release_mine` or `stuck = 0`.
- **Size.** Medium. **Golden risk: low but real.** Pure moves if evaluation order is kept (e.g. `speed` must still be
  read at the same moment; `path_to` draws RNG at `movement.rs:74`, keep its call order). Run `cargo test` goldens
  after each step; nothing in the state should change.
- **Files.** `world/mod.rs`, `world/orders.rs`, `world/movement.rs`, `world/combat.rs`, `world/economy.rs`,
  `world/construction.rs`.

### R3. Commands: a `Target` type, multi-unit orders, errors from every order, JSON events via `Obj` (sim API)

- **What.** (a) Add `pub enum Target { None, Point { x, y }, Ent(Id) }` in `command.rs` and use it in the one new
  variant abilities need, `Command::Cast { units: Vec<Id>, ability: AbilityKind, target: Target }`. (b) Let
  `World::apply` return `Err` for every refusal that the player should hear, and make `Game::order`
  (`lib.rs:40-42`) return the string instead of discarding it, so `core.js` can `touch(err(...))` uniformly
  (`core.js:105-106,133-139`). (c) Replace the hand-formatted JSON in `drain_events` (`lib.rs:330-360`) with the
  existing `data::Obj` writer (`export.rs:7-32`), so a new event is one arm with no escaping to get wrong.
  (d) Give `Command` a stable small integer code (like `Task::code`) and a unit test that every variant is produced
  by `random_order_with` at least once in a long run (today a forgotten arm in `common.rs:376-427` silently removes
  coverage).
- **Why.** Abilities are the first orders that routinely fail for a reason the player must see and that apply to a
  group (smart-cast picks one caster from the selection; Stim applies to all). Doing (a)-(d) once means every
  ability shares the same wire shape, the same validation closure (`command.rs:93-95`) and the same test coverage.
- **Size.** Small. **Golden risk: none.** The replay test (`random_play.rs:65`) guards the log.
- **Files.** `world/command.rs`, `lib.rs`, `src/engine/core.js`, `tests/gameplay/common.rs`.

### R4. Client: table-driven armed orders and a `setSelection` helper (hud.js, input.js)

- **What.** (a) Replace the `ui.mode` strings with a descriptor table `ORDERS = { attack: { hint, accepts(hit),
  fire(units, wx, wy, hit), minimap: true }, gather: …, repair: …, rally: …, move: … }` and let `ui.mode` hold a
  descriptor (or its id). `leftAction` (`input.js:128-165`), `touchTap`'s `if (ui.place || ui.mode)`
  (`input.js:170`), `mmAt` (`input.js:277,287`), `setHint` (`hud.js:359-363`) and `ARMED_BY` (`hud.js:185`)
  then have one generic path each. The context-sensitive `commandAt` stays as the right-click/ground-tap default.
  (b) Collapse the nine copies of "clear selection/mode/place, setHint, updateHud" (`hud.js:329,331`,
  `input.js:67,105,138,144,164,188`, `tools.js:151`) into `setSelection(list)` / `clearMode()` in `hud.js`.
  (c) Build the card by rows (`orders`, `work`, `abilities`, `pages`) with a `row(items)` helper rather than slot
  arithmetic (`hud.js:190,208-211`); keep "three a column, Deselect last, armed button becomes Cancel".
  (d) Split `hud.js` into `hud.js` (top bar, panel), `card.js` (cardItems/buildCard/doCommand/long-press) and
  `ui.js` (the `ui` object, `toast`, `setHint`, `setSelection`), so `input.js` imports state without the DOM
  builders.
- **Why.** A targeted ability on a phone is exactly today's Repair flow (press the button, it lights as Cancel, tap
  the target, the worker is released: `input.js:154-159`, `hud.js:241-246`) and must also work with a mouse
  (press, click) and the minimap for point casts. With a table, an ability's row is generated from
  `UNITS[k].abilities` and nothing else changes. Without it each ability adds branches in five functions and the
  e2e suite grows per branch. Also the fixed slots assume at most five Build entries per page (`hud.js:201-202`,
  slots 4 and 5 are Advanced/Back): more buildings or a third race will overflow silently.
- **Size.** Medium-large (hud.js 375 + input.js 363 lines; ~36 `ui.mode` sites). **Sim risk: none.** The e2e
  scenarios for Repair, Rally, Build pages, armed-Cancel and touch release (`gameplay.e2e.mjs:280,352,581,740`)
  are the regression net; run them before and after.
- **Files.** `src/client/hud.js`, `src/client/input.js`, `src/client/tools.js`, `src/main.js`.

### R5. Tests: split `common.rs`, add a micro hook to `duel_once`, invariants ready for new state

- **What.** (a) Split `tests/gameplay/common.rs` (819 lines, 8 concerns) into `scenes.rs` (worlds, arenas,
  `build`, `spot`), `invariants.rs` (`check_invariants`, 199 lines: break it into per-entity helpers),
  `random.rs` (`random_order_with`), `duel.rs` (`duel_once`, `duel`, `raid`, `unit_value`). (b) Give
  `duel_once` (`common.rs:588-657`) a `micro: &dyn Fn(&mut World, &[Id], &[Id])` parameter called where it already
  re-issues attack-moves once a second (`common.rs:627-650`), with `no_micro` for today's callers, so a fight with
  Stim or Siege can be scored by the same `balance_matrix`/`the_counters_hold…` machinery. (c) Make the ring
  search for a free spot one helper: it exists five times (`common.rs:38-51`, `golden.rs:31-45`, `lib.rs:479-493`,
  `scripts/headless.js:17-24`, `harness.mjs` `findSpot`).
- **Why.** Balancing (item 3) will be done through `duel()` and AI-vs-AI goldens; abilities that never fire in a
  duel cannot be balanced there. `check_invariants` is where energy bounds, cooldown signs and "mode only on a kind
  that has it" belong, and it is already the longest function in the repo.
- **Size.** Small-medium. **Golden risk: none** (tests only). Note `golden.rs:31-45` must keep its exact placement
  order or the scripted goldens move; share the helper by copying its loop bounds, not by changing them.
- **Files.** `tests/gameplay/common.rs` (split), `tests/golden.rs`, `tests/gameplay/combat.rs`.

### R6. AI: own its state, stop cloning the brain, reserve a phase for abilities

- **What.** (a) Move `struct Ai` (`world/mod.rs:274-305`) to `ai/mod.rs`; the world only needs `[Option<Ai>; 2]`.
  (b) Stop `brain.clone()` at the top of every phase (`army.rs:306-308,381-390,451-459,524-530`, `build.rs:172-184,
  279-287`, `economy.rs:28,183`): phases take the fields they read by reference or destructure `&mut Brain`.
  (c) Add an empty `ai_abilities(&mut Brain)` phase slot after `ai_army` in `ai_turn_of_seat` (`ai/mod.rs:181-189`)
  so that when abilities arrive they do not reorder existing RNG draws. (d) Split `ai_build` (105 lines,
  `build.rs:171-275`: wanted-building decision vs site choice vs placement) and `ai_turn_of_seat` (98 lines: the
  census into a `Brain::census(&World, seat)` constructor).
- **Why.** AI ability use needs a scan over own units each half-second turn with fog (`ai_sees`,
  `scouting.rs:7-10`); it should be a phase, not code inside `ai_steer_wave`. Cloning `Vec<Id>`s eight times a
  turn is harmless now and a trap for a third AI phase that mutates `my_b` (as `ai_expand` already must re-filter,
  `build.rs:312-317`).
- **Size.** Small. **Golden risk: none if the phase order and RNG calls are unchanged** (the Vael-vs-Human AI
  golden, `golden.rs:161`, pins exactly this).
- **Files.** `world/mod.rs`, `ai/mod.rs`, `ai/army.rs`, `ai/build.rs`, `ai/economy.rs`.

### R7. Long functions and files to split while you are there

Functions over ~80 lines (measured by brace matching): `check_invariants` 199 (`tests/gameplay/common.rs:163`),
`astar` 114 (`path.rs:97`, leave it), `ai_build` 105 (`ai/build.rs:171`), `Map::generate` 99 (`map.rs:152`),
`ai_turn_of_seat` 98 (`ai/mod.rs:93`), `raid` 85 (`common.rs:671`). Just under: `render()` 79
(`render.js:375`), `update_building` 79 (`construction.rs:94`: power gate, turret, queue, research are four
functions), `medic` 73 (`combat.rs:403`), `ai_watch` 73 (`army.rs:81`), `spawn_from` 72 (`spawn.rs:127`),
`reset` 72 (`mod.rs:480`), `fire` 71 (`combat.rs:328`, fixed by R1b), `ai_produce` 71 (`army.rs:226`),
`bindCanvas` 71 (`input.js:200`), `apply` 69, `cardItems` 68 (`hud.js:186`, fixed by R4c).

Files over ~600 lines: `tests/gameplay/combat.rs` 1017 (split `balance.rs` out: `balance_matrix`,
`the_counters…`, `the_vael_counters…`, `raid_matrix`), `tests/gameplay/ai.rs` 847, `common.rs` 819 (R5),
`world/mod.rs` 753 (move `Ai` out (R6), `Event` to `world/event.rs`, `Geo` to `world/geo.rs`), `world/combat.rs`
682 (targeting vs damage/death vs healer: `combat.rs:46-120`, `152-318`, `403-475`).

## 3. Design sketch for the ability system

Kept to the patterns already in the code: a `kinds!` table, a `Task` variant with `Back`, a `Command` with the
seat check, `record!` fields, `Obj` JSON, an AI phase, a scenario file plus a `random_order` arm, one e2e flow.

### Data (`data/abilities.rs`, declared once)

```rust
kinds! { AbilityKind: AbilityDef, ABILITIES { Stim => STIM, Siege => SIEGE, Storm => STORM, Blink => BLINK, MendBurst => MEND } }

pub struct AbilityDef {
    pub key: &'static str, pub name: &'static str,
    pub cast: Cast,            // SelfCast | Toggle | Point { range } | Unit { range, allies, enemies }
    pub energy: f64,           // 0 = free
    pub cooldown: f64,         // s per slot; 0 = none
    pub effect: Effect,        // what it does (below)
    pub req: Option<Upgrade>,  // research gate later; None today
    pub ai: AiCast,            // when the scripted opponent uses it (below)
}
pub enum Effect {
    Buff { speed: f64, fire_rate: f64, hp_cost: f64, secs: f64 },   // Stim
    Mode { range_add: f64, dmg_mul: f64, immobile: bool, swap_s: f64 }, // Siege (toggle)
    Zone { dps: f64, r: f64, secs: f64 },                            // Storm
    Teleport { max: f64 },                                           // Blink
    Heal { amount: f64, r: f64, shields: bool },                      // Mend burst
}
```

`UnitDef` gains `energy: f64` (max; 0 = none) and `abilities: &'static [AbilityKind]` (at most `ABILITY_SLOTS = 3`,
a const like `QUEUE_SLOTS`). `ENERGY_REGEN` and `ENERGY_START` are constants beside the shield constants
(`data/mod.rs:280-283`). The existing passive Medic/Halo heal can later become `Effect::Aura` rows, but that is a
rule change (goldens) and not a prerequisite. `export.rs` emits `abilities` and `units[k].abilities` through the
R1 field lists; `constants.js` merges `ABILITY_TEXT` (hotkey, description) the way it does for units.

### Sim state

- `Unit` gains: `energy: f64`, `mode: Option<AbilityKind>` (the active toggle), `cds: [f64; ABILITY_SLOTS]`
  (remaining cooldown per slot, in `def().abilities` order), `buffs: Vec<(AbilityKind, f64 /* ends at */)>` kept
  sorted by kind index (iterate arrays, never maps). Initialised in `make_unit` (`spawn.rs:20-53`).
- `World` gains `zones: Vec<Zone { x, y, r, dps, ends, team, by: AbilityKind }>` for persistent areas (a
  Storm), stepped where `update_projs` runs (`mod.rs:684`), damage applied in `self.units` id order with `damage()`
  so answer-fire and alerts behave as for shots. Zones are the one new entity record in the snapshot.
- `Task::Cast { ability: AbilityKind, target: Target, back: Option<Back> }` (code 8; add to `TASKS`,
  `snapshot.rs:566`). `update_cast`: approach to `def.range` with the R2 accessor (flyers straight), then
  `perform_cast`, then resume through `back` exactly as `update_attack` does on a lost target
  (`combat.rs:617-624`). Toggles and self-casts never become a task: they apply inside `cast()`.
- `world/abilities.rs` owns: `can_cast(uid, ability, target) -> Result<(), String>` (has the slot, energy,
  cooldown, target kind and ownership, range for instant casts), `cast(...)` (spend energy, start the cooldown,
  set mode/buff/task), `tick_abilities(dt)` (energy regen, cooldowns down, buffs expire, zones tick) called once per
  tick after the unit loop, and `apply_effect`. Stat modifiers are read only through the R2 accessor
  (`mode` and `buffs` feed `speed`, `range`, `cd`, `immobile`). Blink clamps with `clamp_x/clamp_y` and
  `nearest_free` (`map.rs`), then lets `separate()` resolve overlaps as `make_building` does (`spawn.rs:102-119`).
- No RNG in casts or effects: keep the draw order untouched.
- `state_hash` mixes `energy * 16`, the mode code, and the task code already covers `Cast`
  (`mod.rs:711-720`). Goldens move once, on the PR that adds the first ability, on purpose.
- Smart cast is a rule of the sim, not the client: for a `Point`/`Unit` cast with several `units`, the caster is
  the nearest able unit (distance, then id); for `SelfCast`/`Toggle` every able unit casts. One rule, replayable.

### Commands and API

- `Command::Cast { units: Vec<Id>, ability: AbilityKind, target: Target }`; `apply` filters `units` to the seat's,
  returns the first refusal as `Err` if nobody cast (so the client toasts "Not enough energy").
- `lib.rs`: `cast(units: &[u32], ability: &str, target_kind: u32, x: f64, y: f64, id: u32) -> String`
  (`0 none, 1 point, 2 entity`), parsing the key with `AbilityKind::parse`; `core.js`: `castSelf(us, key)`,
  `castAt(us, key, x, y)`, `castOn(us, key, ent)` taking objects like the other orders (`core.js:123-143`).
- Events: `Event::Cast { x, y, ability, seen: [bool; 2] }` for sound and a flash (filtered like `Fire`,
  `lib.rs:338`), written with `Obj` (R3c).

### Snapshot and client mirror

- `UNIT_FIELDS` += `energy, maxenergy, mode, cd0, cd1, cd2, buffs` (`buffs` a bitmask over `ABILITIES`), and
  `task`'s `target` already carries the entity for `Cast`; add `target_x, target_y` to the unit record (today
  `Move`'s point is not sent either; a cast ghost and a range ring want it).
- New `ZONE_FIELDS` record and `Game::zones()`, mirrored into `S.zones` like projectiles (`core.js:99-100`).
- `schema_json` adds `abilities` keys and `abilitySlots`; `core.js` exposes `u.energy`, `u.maxEnergy`, `u.mode`,
  `u.cds` (by ability key), `u.buffs` (set of keys).

### Client: card and targeting

- With R4 in place: the card's `abilities` row is the union of `UNITS[u.type].abilities` over the selected units,
  in `ABILITIES` order, each `{ id: 'a_' + key, key: hot, por/icon, badge: energy cost or the shortest remaining
  cooldown, dis: no selected unit can cast now, tip: desc }`; a toggle shows `active` when every able unit is in
  that mode. `doCommand('a_x')`: `SelfCast`/`Toggle` call `castSelf` at once (toast the returned error); `Point`/
  `Unit` arm the descriptor `{ hint: 'Tap where to cast Storm', accepts: hit => …, fire: (units, wx, wy, hit) =>
  castAt/castOn, minimap: cast.point }`. The armed button turns into Cancel through the same `ARMED_BY` rule, touch
  releases nothing (casters stay selected, unlike workers), and `render.js` draws the casters' range as it draws power
  fields when the Build list is open (`render.js:432-440`), so a thumb sees where a tap counts.
- Panel: a third bar (energy, blue) under hull and shields in `life()` (`hud.js:85-91`) and in `hpBar`
  (`render.js:353`); `taskName` gets `cast`; a sieged unit reads "Sieged" from `u.mode`.
- Hotkeys: extend `test/engine.test.js:39-50` to assert that an ability hotkey collides with neither the unit
  card's fixed keys (A H B G R M S V) nor another ability of the same race.

### AI hooks

- `AbilityDef.ai: AiCast { when: Never | OnEngage | AlliesHurt { frac } | EnemiesWithin { n, r } | ArmyStopped,
  min_energy: f64 }`, evaluated in the R6 `ai_abilities` phase over the army ids in order, using `ai_sees` for
  targets and `self.cast(...)` (the same validation path as a player). Siege: `ArmyStopped` sieges when the unit
  is idle with enemies in range and unsieges to move. New unit roles enter the army through `AiScript.mix`
  (`data/mod.rs:223-224`), which already handles requirements and ratios; a caster-only unit is a mix row like the
  Medic (`humans.rs:30`).
- Make the rule evaluator a `pub fn auto_cast(&mut self, team)` so `duel_once`'s micro hook (R5b) and headless
  balance probes can give both sides the same ability use.

### Tests

- `tests/gameplay/abilities.rs`: per ability, the rule (cost, cooldown, effect numbers, expiry, a toggle's
  immobility, Blink never lands on rock or in a building, a Storm hurts both sides and ends), the refusals
  (energy, cooldown, wrong target, other seat), and smart cast choosing the nearest caster.
- `random_order_with` arms for `castSelf/castAt/castOn` with random ability keys including `"nonsense"`;
  `check_invariants`: `0 <= energy <= maxenergy`, `cds >= 0`, `mode` only on a kind listing that toggle, zones
  finite and expiring, `buffs` sorted.
- `balance_matrix`/`the_counters…` with `auto_cast` on both sides; the replay test and the goldens cover
  determinism; `test/engine.test.js:192` (every schema field read by the client) covers the mirror.
- e2e: one desktop + phone scenario (select Troopers, press the ability key / card button, the energy bar drops;
  press a targeted ability, the button reads Cancel, tap the ground, the cast lands) following the Repair test's
  shape (`gameplay.e2e.mjs:352-390`).

## 4. Smaller debt to fix opportunistically

- **Naming drift in the sim.** `Unit.cd` is the weapon cooldown and the repair-spark timer
  (`construction.rs:70-71`); `aggro_cd` is a target-scan throttle, not aggression; `heal_fx` is an event throttle;
  `Fighter.combat` means `threat()`; `Bldg.prog` (training) vs `progress` (construction); `unit_tier`
  (`mod.rs:411`) vs `threat_tier` (`combat.rs:93`); `bm()` returns `Option` while `um()` panics
  (`mod.rs:593-606`); `BldgKind::Forge`/`Barracks` keys vs "Foundry"/"Garrison" names. Rename when touching.
- **`heal_reach` hard-codes 2.5/3 tiles** (`combat.rs:27-29`) while healers have `range: 0`; move the reach into
  the def (same numbers, so goldens hold if the arithmetic is identical).
- **`Event::Hit` reused for welding sparks** (`construction.rs:74-78`); when `Event::Cast` arrives, give sparks
  their own event rather than a third meaning.
- **Faction-level bools are the next grab-bag.** `repairs`, `warp`, `power` (`data/mod.rs:200-207`) and
  `sounds: [&str; 4]` indexed by projectile position (`combat.rs:384-393`; a fourth `ProjKind` silently misindexes).
  For the third race prefer: sounds keyed by `ProjKind` through a small fn, and new mechanics as abilities or
  `BldgDef` fields, not new faction flags.
- **`Event::Fire.seen: [bool; 2]`, `FACTIONS: [&Faction; 2]`, `World.factions: [&Faction; 2]`** are 1v1-sized;
  fine for M3, but the third race makes `FACTIONS` a slice.
- **Requirement scan duplicated**: `has_req` (`orders.rs:60-67`) vs the inline scan in `queue_unit`
  (`orders.rs:97-103`); the client repeats it in `cardItems` (`hud.js:219`) and `doCommand` (`hud.js:339`).
- **Client duplicates between `commandAt` and `leftAction`**: the attack branch (`input.js:114` vs `151`) and the
  repair branch (`122` vs `156`); R4 removes them.
- **`hud.js:233` hard-codes "Spire"** in a tip (the kind-name guard `test/engine.test.js:227` only catches
  `=== 'key'`); use `FACTIONS[...].power` like `bldgStatus` does at `hud.js:37`. `hud.js:3-4` defines a const
  between two imports.
- **`main.js:95,110` call `step(DT)`** though `step()` takes no dt (`core.js:119`); drop the argument to match the
  "never pass a dt" rule.
- **`Task::code`, `TASKS` and `task_parts`** (`mod.rs:83-94`, `snapshot.rs:21-28,38-40`) are three lists kept in
  step by hand; a unit test that `TASKS.len()` equals the variant count (or a `Task::NAMES` next to `code`) is
  cheap.
- **`docs/PLAN.md`** still names `commands.js` in the boundary row (table, "Sim/client boundary") and lists
  fixed-point and ids-not-objects under "Next steps" though both are done/retired above; mark the roadmap items 1-4
  of this review there.
- **`sync()` in `core.js:40-103`** rebuilds every entity array each step; fine at a few hundred records, but a
  `zones` list and energy fields add to the per-frame cost on phones. Not a blocker; measure before the balance
  passes if frame time on a phone matters.
- **Test helper `rich()`/`rich_vael()`/`arena()`/`flat_arena()`** differ by one line each (`common.rs:91-124,
  557-561`); one `scene(seed, factions, flat: bool)` would do.
- **`Game::set_resources`/`debug_*`** accept any team through `& 1` masking (`lib.rs:260`) while the orders validate;
  harmless, but the random-play test passes `r.below(3)` teams (`common.rs:404`) expecting refusal semantics.
