// The command card's keys in both controls schemes (src/client/controls.js), read from the real card (src/client/cards.js
// `cardItems`) on the WASM sim: every selection of each race's units (with and without their techs, each order armed,
// the Build pages, a building being placed) and every building of each race (finished, rising, training, researching,
// dark, several of a kind). In WASD every button has its slot's grid key: none of W A S D, no key twice on a card;
// a selection with workers keeps Build. The Siege Tank deploys by itself: no button, and an order to is refused.
// Skipped when src/engine/pkg/ has not been built (run `npm run build:wasm`); CI sets ENDFALL_REQUIRE_WASM=1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const pkg = new URL('../src/engine/pkg/', import.meta.url);
const built = existsSync(new URL('endfall_sim_bg.wasm', pkg));
if (!built && process.env.ENDFALL_REQUIRE_WASM) throw new Error('src/engine/pkg/ is missing: run npm run build:wasm');
const skip = !built && 'WASM not built';

const controls = await import('../src/client/controls.js');
const { GRID, PAN, keyed } = controls;
let E, C, ui;
if (built) {
  const sim = await import(new URL('endfall_sim.js', pkg));
  sim.initSync({ module: readFileSync(new URL('endfall_sim_bg.wasm', pkg)) }); // (src/engine/index.js's init then finds it ready)
  globalThis.addEventListener ??= () => {}; // (audio.js listens for a gesture: no window here)
  E = await import('../src/engine/core.js');
  C = await import('../src/client/cards.js');
  ({ ui } = await import('../src/client/ui.js'));
}

/** The keys that are not card commands in either scheme: Q (the whole army), P (pause). */
const GLOBAL = ['Q', 'P'];

test('the WASD grid: nine keys, one per slot of the three-column card, none of W A S D, Q or P', () => {
  assert.equal(GRID.length, 9);
  assert.equal(new Set(GRID).size, GRID.length, 'no key twice');
  for (const k of GRID) { assert.match(k, /^[A-Z]$/); assert.ok(!PAN.includes(k) && !GLOBAL.includes(k), `${k} is not a grid key`); }
});

test('keyed: CLASSIC keeps each item\'s letter; WASD gives a button its slot\'s key and a hidden item none', () => {
  const items = () => [{ id: 'attack', key: 'A', slot: 0 }, { id: 'hold', key: 'H', slot: 1 }, { id: 'deselect', key: 'Esc', slot: 5 }, { id: 'stop', key: 'S', slot: -1, hidden: true }];
  assert.deepEqual(keyed(items(), 'classic').map(i => i.key), ['A', 'H', 'Esc', 'S']);
  assert.deepEqual(keyed(items(), 'wasd').map(i => i.key), ['E', 'R', 'H', '']);
  assert.equal(controls.scheme(), 'classic', 'no fine pointer (Node): CLASSIC, whatever is stored');
});

/** Every card the game can show for `race`, as [what, items] (the classic card; `keyed` gives the WASD one). */
function cards(race) {
  E.resetGame(4242, 1, 0, 0, race, race);
  E.disableAi(); E.setResources(E.G.me, 0, 0); // (poor: the buttons are there all the same, grayed)
  const f = E.FACTIONS[race], kinds = [...f.buildBasic, ...f.buildAdvanced];
  const unitKinds = [...new Set(kinds.flatMap(k => E.BUILDINGS[k].trains || []))];
  const hq = E.G.bldgs.find(b => b.team === E.G.me), out = [];
  const ids = Object.fromEntries(unitKinds.map((k, i) => [k, E.debugSpawn(E.G.me, k, hq.x + 80 + i * 20, hq.y + 80)]));
  const show = (what, sel, mode = null, place = null) => { ui.sel = sel; ui.mode = mode; ui.place = place; out.push([what, C.cardItems()]); };
  for (const tech of [false, true]) {
    if (tech) for (const k of Object.keys(E.UPGRADES)) E.debugResearch(E.G.me, k, 1);
    for (let mask = 1; mask < 1 << unitKinds.length; mask++) {
      const sel = unitKinds.filter((_, i) => mask & (1 << i)).map(k => E.G.units.find(u => u.id === ids[k])), what = sel.map(u => u.type).join('+') + (tech ? ' (techs)' : '');
      for (const mode of [null, 'attack', 'repair', 'gather', 'move']) show(`${what}, ${mode || 'nothing'} armed`, sel, mode);
      if (sel.some(u => u.d.worker)) {
        show(`${what}, Build`, sel, 'build'); show(`${what}, Build: Advanced`, sel, 'build2');
        show(`${what}, placing`, sel, 'place', { type: f.buildBasic[0], tx: -99, ty: -99 });
      }
    }
  }
  // Buildings: a stand-in for each of the race's kinds in each state the card draws (the card reads these fields).
  let id = 90000;
  const bldg = (k, o = {}) => ({ kind: 'bldg', id: id++, team: E.G.me, type: k, d: E.BUILDINGS[k], done: true, queue: [], research: null, prog: 0, ...o });
  for (const lv of [0, 1, 99]) { // (no techs, the first level of each, all: finished techs leave their slots)
    E.resetGame(4242, 1, 0, 0, race, race); E.disableAi();
    if (lv) for (const [k, u] of Object.entries(E.UPGRADES)) E.debugResearch(E.G.me, k, Math.min(lv, u.levels));
    for (const k of kinds) {
      const d = E.BUILDINGS[k], first = d.trains?.[0], states = [['finished', [bldg(k)]], ['rising', [bldg(k, { done: false })]], ['two finished', [bldg(k), bldg(k)]]];
      if (first) states.push(['training', [bldg(k, { queue: [first, first] })]]);
      for (const r of d.researches || []) states.push([`researching ${r}`, [bldg(k, { research: { type: r } })]], [`two, one researching ${r}`, [bldg(k, { research: { type: r } }), bldg(k)]]);
      for (const [state, sel] of states) for (const mode of [null, 'rally']) show(`${k} ${state}, techs ${lv}, ${mode || 'nothing'} armed`, sel, mode);
    }
  }
  ui.sel = []; ui.mode = null; ui.place = null;
  return out;
}

/** Build `k` for our seat with one of its workers and step until it stands (the requirement of a unit or a building). */
function raise(k) {
  const f = E.FACTIONS[E.G.factions[E.G.me]], hq = E.G.bldgs.find(b => b.team === E.G.me && b.type === f.hq);
  const worker = E.G.units.find(u => u.team === E.G.me && u.type === f.worker);
  E.setResources(E.G.me, 5000, 0);
  let spot = null;
  for (let r = 4; r < 16 && !spot; r++) for (let dx = -r; dx <= r && !spot; dx++) for (const dy of [-r, r]) {
    const tx = Math.floor(hq.x / 32) + dx, ty = Math.floor(hq.y / 32) + dy;
    if (!spot && E.canPlace(k, tx, ty, E.G.me)) spot = [tx, ty];
  }
  assert.ok(spot, `room for a ${k}`);
  assert.equal(E.placeBuilding(E.G.me, k, spot[0], spot[1], worker), null, `a ${k} placed`);
  const up = () => E.G.bldgs.some(b => b.team === E.G.me && b.type === k && b.done);
  for (let i = 0; i < 180 * 30 && !up(); i++) E.step();
  assert.ok(up(), `the ${k} stands`);
}

for (const race of ['humans', 'vael']) {
  test(`every card the ${race} can show has a WASD key for each of its buttons, never W A S D, none twice`, { skip }, () => {
    const all = cards(race);
    assert.ok(all.length >= { humans: 3500, vael: 1800 }[race], `every card was read (${all.length}: 3576 and 1924 when written; 1840 for the Expedition's seven unit kinds)`);
    let most = 0;
    for (const [what, items] of all) {
      const wasd = keyed(items.map(i => ({ ...i })), 'wasd'), shown = wasd.filter(i => !i.hidden);
      assert.equal(new Set(shown.map(i => i.slot)).size, shown.length, `${what}: one button a slot`);
      for (const it of shown) {
        most = Math.max(most, it.slot);
        assert.equal(it.key, GRID[it.slot], `${what}: ${it.label} in slot ${it.slot} has the slot's key`);
        assert.ok(it.key && !PAN.includes(it.key) && !GLOBAL.includes(it.key), `${what}: ${it.label}'s key ${it.key}`);
      }
      assert.equal(new Set(shown.map(i => i.key)).size, shown.length, `${what}: no key twice (${shown.map(i => i.label + ' ' + i.key).join(', ')})`);
      assert.ok(wasd.filter(i => i.hidden).every(i => i.key === ''), `${what}: an item with no button has no key`);
      // A building's card and a Build page keep two rows (the Workshop's three units in the top row, Rally and Cancel in
      // the second; five buildings and Back), and their letters (CLASSIC) are each one button's.
      if (/, techs \d+, |, Build(: Advanced)?$/.test(what)) {
        assert.ok(Math.max(...shown.map(i => i.slot)) <= 5, `${what}: two rows at most (${shown.map(i => i.label + ' ' + i.slot).join(', ')})`);
        const letters = items.map(i => i.key).filter(k => k && k !== 'Esc');
        assert.equal(new Set(letters).size, letters.length, `${what}: no CLASSIC key twice (${items.map(i => i.label + ' ' + i.key).join(', ')})`);
      }
      // A selection with workers can always build, on touch and in WASD too (Mine and Repair give way first).
      if (/\b(harvester|lumen)\b/.test(what) && / armed$/.test(what)) assert.ok(shown.some(i => i.id === 'build'), `${what}: Build stays on a card with workers`);
      // No automatic ability (the Cannon's Set Up) has a button.
      assert.ok(!items.some(i => i.id.startsWith('a_') && E.ABILITIES[i.id.slice(2)].auto), `${what}: no button for an automatic ability`);
      // Attack-move keeps a key, the one of its slot; in CLASSIC it is A.
      const attack = items.find(i => i.id === 'attack');
      if (attack) { assert.equal(attack.key, 'A', `${what}: classic Attack`); assert.equal(wasd.find(i => i.id === 'attack').key, GRID[attack.slot]); }
    }
    assert.ok(most >= 5 && most < GRID.length, `the cards fill slots 0 to ${most}: within the grid`);
  });
}

test('every research and command the card can show has an icon, and every unit and building a symbol (a key with no drawing renders a blank button)', { skip }, async () => {
  const { hasIcon, hasGlyph } = await import('../src/client/icons.js');
  // Every research and every button ability of either people, shown or not yet: the button's icon is its key.
  const keys = [...Object.keys(E.UPGRADES), ...Object.keys(E.ABILITIES).filter(k => !E.ABILITIES[k].auto)];
  for (const k of keys) assert.ok(hasIcon(k), `${k} has an icon`);
  // Every unit and building of either people has a symbol (`glyph`), whether a card shows it yet or not.
  for (const f of Object.values(E.FACTIONS)) for (const k of E.kindsOf(f)) assert.ok(hasGlyph(k), `${k} has a symbol`);
  // And every button on every card the game draws: a unit or a building (`por`: [what, kind]) its symbol, anything else
  // its icon.
  let pictures = 0;
  for (const race of ['humans', 'vael']) for (const [what, items] of cards(race)) {
    for (const it of items.filter(i => !i.hidden)) {
      if (it.por) { pictures++; assert.ok(hasGlyph(it.por[1]), `${what}: ${it.label} (${it.por[1]}) has a symbol`); } else assert.ok(it.icon && hasIcon(it.icon), `${what}: ${it.label} (${it.icon}) has an icon`);
    }
  }
  assert.ok(pictures > 0, 'units and buildings were drawn');
});

test('no two buttons a card shows together share a drawing', { skip }, async () => {
  const { icon, glyph } = await import('../src/client/icons.js');
  // (a Cancel with a badge shows what it cancels, the unit queued or the research, in red: that one is meant)
  for (const race of ['humans', 'vael']) for (const [what, items] of cards(race)) {
    const shown = items.filter(i => !i.hidden && !i.badge), seen = new Map();
    for (const it of shown) {
      const d = it.por ? glyph(it.por[1]) : it.icon ? icon(it.icon).replace('class="ico"', 'class="ico gl"') : '';
      if (!d) continue;
      assert.ok(!seen.has(d), `${what}: ${it.label} looks like ${seen.get(d)}`);
      seen.set(d, it.label);
    }
  }
  // Nor any two units or buildings, of either people.
  const kinds = [...new Set(Object.values(E.FACTIONS).flatMap(f => [...E.kindsOf(f)]))];
  assert.equal(new Set(kinds.map(glyph)).size, kinds.length, 'one symbol a kind');
});

test('a unit symbol shows who, an action icon a tool: no unit is drawn like an action, and every person shares the bust', { skip }, async () => {
  const { glyphPaths, iconPaths, iconNames, BUST } = await import('../src/client/icons.js');
  const actions = iconNames().map(n => [n, iconPaths(n)]);
  for (const k of Object.keys(E.UNITS)) {
    const g = glyphPaths(k);
    assert.ok(g.line, `${k} has a symbol`);
    for (const [n, a] of actions) assert.ok(g.line !== a.line && !(g.fill && g.fill === a.fill), `${k} is drawn like the ${n} icon`);
  }
  // The people (a worker, foot soldiers, hired hands, healers) are one bust holding their tool: no tool alone.
  const people = ['harvester', 'trooper', 'lancer', 'medic', 'prism', 'bruiser', 'halo'];
  for (const k of people) assert.equal(glyphPaths(k).solid, BUST, `${k}: a person, the bust`);
  // And nothing else wears it: no machine, mount, building or action.
  const kinds = [...new Set(Object.values(E.FACTIONS).flatMap(f => [...E.kindsOf(f)]))];
  for (const k of kinds.filter(k => !people.includes(k))) assert.notEqual(glyphPaths(k).solid, BUST, `${k} is no person`);
  for (const [n, a] of actions) assert.equal(a.solid, '', `the ${n} icon is a tool, no bust`);
});

test('Mine shows each people\'s tool on gold: the Kingdom\'s pickaxe, the Expedition\'s drill, neither like Better drills or a unit', { skip }, async () => {
  const { iconPaths, glyphPaths } = await import('../src/client/icons.js');
  for (const [race, want] of [['humans', 'gather'], ['vael', 'gatherDrill']]) {
    E.resetGame(4242, 1, 0, 0, race, race); E.disableAi();
    const worker = E.G.units.find(u => u.team === E.G.me && u.type === E.FACTIONS[race].worker);
    ui.sel = [worker]; ui.mode = null; ui.place = null;
    assert.equal(C.cardItems().find(i => i.id === 'gather')?.icon, want, `${race}: the worker's Mine button`);
  }
  ui.sel = [];
  const drill = iconPaths('gatherDrill'), pick = iconPaths('gather'), bit = iconPaths('drills');
  assert.ok(drill.line && drill.line !== pick.line && drill.fill !== pick.fill, 'the drill on gold is not the pickaxe');
  assert.ok(drill.line !== bit.line && drill.fill !== bit.fill, 'the drill on gold is not Better drills\' bare bit');
  for (const k of Object.keys(E.UNITS)) {
    const g = glyphPaths(k);
    assert.ok(g.line !== drill.line && g.fill !== drill.fill, `${k} is not drawn like the drill on gold`);
  }
});

test('the Portal teleports: its lines say so, and only its queue reads Teleporting', { skip }, () => {
  const p = E.BUILDINGS.eclipse;
  assert.equal(p.what, 'Teleports Rovers, Androids');
  assert.match(p.desc, /^Teleports Rovers and Androids from the future/);
  assert.equal(p.training, 'Teleporting');
  for (const [k, d] of Object.entries(E.BUILDINGS)) if (k !== 'eclipse' && d.trains?.length) assert.equal(d.training, undefined, `${k} keeps Training`);
});

test('the Cannon deploys by itself: no Deploy on its card, an order to deploy is refused, and it sets up when it stops', { skip }, () => {
  E.resetGame(4242, 1, 0, 0, 'humans', 'humans'); E.disableAi();
  const hq = E.G.bldgs.find(b => b.team === E.G.me);
  const ids = [0, 1].map(i => E.debugSpawn(E.G.me, 'siegeTank', hq.x + 90 + i * 40, hq.y + 90));
  const unit = (id) => E.G.units.find(u => u.id === id);
  ui.sel = ids.map(unit); ui.mode = null; ui.place = null;
  const items = C.cardItems();
  assert.ok(!items.some(i => i.id === 'a_deploy'), `no Deploy: ${items.map(i => i.label).join(', ')}`);
  assert.ok(!items.some(i => i.key === 'D'), 'and nothing on D');
  assert.ok(E.castAbility(ids.map(unit), 'deploy'), 'an order to deploy is refused');
  for (let i = 0; i < 4 * 30; i++) E.step();
  assert.ok(ids.every(id => unit(id).mode === 'deploy'), 'standing, both set up by themselves');
  ui.sel = []; ui.mode = null;
});

test('what is not open yet is hidden and its key does nothing: the Build list packs what is open, an ability waits in its slot', { skip }, () => {
  E.resetGame(4242, 1, 0, 0, 'vael', 'vael'); E.disableAi();
  const lumen = E.G.units.find(u => u.team === E.G.me && u.type === 'lumen');
  const slots = () => C.cardItems().filter(i => !i.hidden).map(i => `${i.id}@${i.slot}`);
  // The Build list: the basic page is all there from the start; no Advanced before the Recruiting post stands.
  ui.sel = [lumen]; ui.mode = 'build'; ui.place = null;
  assert.deepEqual(slots(), ['b_siphon@0', 'b_spire@1', 'b_conflux@2', 'b_ward@3', 'esc@5'], 'the Recruiting post first, the Sentry mast basic (the arc); no Advanced yet');
  assert.ok(!C.cardItems().some(i => i.id === 'b_loom' || i.id === 'b_kiln'), 'nor the advanced page\'s keys');
  // A Recruiting post up: Advanced comes right after the three open buildings (slot 3, the second row's left), Back stays
  // in the bottom-right slot, on both pages; the advanced page packs from slot 0.
  raise('siphon');
  ui.sel = [E.G.units.find(u => u.id === lumen.id)]; ui.mode = 'build';
  assert.deepEqual(slots(), ['b_siphon@0', 'b_spire@1', 'b_conflux@2', 'b_ward@3', 'build2@4', 'esc@5'], 'Advanced packed into slot 4, Back in the corner');
  ui.mode = 'build2';
  const adv = slots();
  assert.equal(adv.at(-1), 'build1@5', `Back in the corner on the advanced page too: ${adv}`);
  assert.deepEqual(adv.slice(0, -1).map(s => +s.split('@')[1]), adv.slice(0, -1).map((_, i) => i), `the advanced page packed from slot 0: ${adv}`);
  // A unit's ability waiting for its tech is left out, and its card keeps its shape (Deselect stays put): the Guard's
  // Brace waits for Shield Drill.
  E.resetGame(4242, 1, 0, 0, 'humans', 'humans'); E.disableAi();
  const core = E.G.bldgs.find(b => b.team === E.G.me);
  const guard = E.debugSpawn(E.G.me, 'trooper', core.x + 120, core.y + 90);
  const unit = (id) => E.G.units.find(u => u.id === id);
  ui.sel = [unit(guard)]; ui.mode = null;
  const plain = slots();
  assert.ok(!plain.some(s => s.startsWith('a_entrench')) && plain.includes('deselect@5'), `before: Brace hidden, Deselect in its place: ${plain}`);
  E.debugResearch(E.G.me, 'entrenching', 1);
  ui.sel = [unit(guard)];
  const lit = slots();
  assert.ok(lit.includes('a_entrench@2') && lit.includes('deselect@5'), `after: Brace in its slot, Deselect where it was: ${lit}`);
  ui.sel = []; ui.mode = null;
});

test('a research started moves no button: its own turns into Cancel in its place, the others keep their slots and keys', { skip }, () => {
  for (const race of ['humans', 'vael']) {
    E.resetGame(4242, 1, 0, 0, race, race); E.disableAi();
    const f = E.FACTIONS[race];
    let id = 95000;
    for (const k of [...f.buildBasic, ...f.buildAdvanced].filter(k => E.BUILDINGS[k].researches?.length)) {
      const bldg = (o = {}) => ({ kind: 'bldg', id: id++, team: E.G.me, type: k, d: E.BUILDINGS[k], done: true, queue: [], research: null, prog: 0, ...o });
      const card = (b) => { ui.sel = [b]; ui.mode = null; ui.place = null; return C.cardItems().filter(i => !i.hidden); };
      const idle = card(bldg());
      const slotOf = (items, itemId) => items.find(i => i.id === itemId)?.slot;
      for (const r of E.BUILDINGS[k].researches) {
        const busy = card(bldg({ research: { type: r } }));
        assert.equal(slotOf(busy, 'cancelr'), slotOf(idle, 'r_' + r), `${k} researching ${r}: its Cancel in its place`);
        for (const it of idle) if (it.id !== 'r_' + r) assert.equal(slotOf(busy, it.id), it.slot, `${k} researching ${r}: ${it.label} stays in slot ${it.slot}`);
      }
    }
  }
  ui.sel = []; ui.mode = null;
});

test('a building opened mid-game is appended to its Build page: the shown ones keep their slots for the game, Back its corner; a new game starts afresh', { skip }, () => {
  E.resetGame(4242, 1, 0, 0, 'vael', 'vael'); E.disableAi();
  const lumen = () => E.G.units.find(u => u.team === E.G.me && u.type === 'lumen');
  const page = (mode) => { ui.sel = [lumen()]; ui.mode = mode; ui.place = null; return C.cardItems().filter(i => !i.hidden).map(i => `${i.id}@${i.slot}`); };
  raise('siphon');
  assert.deepEqual(page('build'), ['b_siphon@0', 'b_spire@1', 'b_conflux@2', 'b_ward@3', 'build2@4', 'esc@5'], 'the basic page');
  // The Uplink opens with the Lab (one dish, no satellite: Stelian, Nov 13), appended after the shown ones.
  assert.deepEqual(page('build2'), ['b_kiln@0', 'b_loom@1', 'build1@5'], 'the advanced page before the Lab');
  raise('loom');
  assert.deepEqual(page('build2'), ['b_kiln@0', 'b_loom@1', 'b_uplink@2', 'build1@5'], 'the Uplink appended, the others where they were');
  raise('uplink');
  assert.deepEqual(page('build2'), ['b_kiln@0', 'b_loom@1', 'b_uplink@2', 'b_eclipse@3', 'build1@5'], 'then the Portal, appended');
  assert.deepEqual(page('build'), ['b_siphon@0', 'b_spire@1', 'b_conflux@2', 'b_ward@3', 'build2@4', 'esc@5'], 'the basic page unchanged');
  // A new game forgets them.
  E.resetGame(4242, 1, 0, 0, 'vael', 'vael'); E.disableAi();
  raise('siphon');
  assert.deepEqual(page('build2'), ['b_kiln@0', 'b_loom@1', 'build1@5'], 'a new game: its own slots');
  ui.sel = []; ui.mode = null;
});

test('the Kingdom\'s Build list: the Watchtower on the basic page, before Advanced (as the Sentry mast); the advanced page packed without it', { skip }, () => {
  E.resetGame(4242, 1, 0, 0, 'humans', 'humans'); E.disableAi();
  const villager = () => E.G.units.find(u => u.team === E.G.me && u.type === 'harvester');
  const page = (mode) => { ui.sel = [villager()]; ui.mode = mode; ui.place = null; return C.cardItems().filter(i => !i.hidden).map(i => `${i.id}@${i.slot}`); };
  assert.deepEqual(page('build'), ['b_barracks@0', 'b_depot@1', 'b_core@2', 'esc@5'], 'from the start: no Watchtower nor Advanced before a Barracks');
  raise('barracks');
  assert.deepEqual(page('build'), ['b_barracks@0', 'b_depot@1', 'b_core@2', 'b_turret@3', 'build2@4', 'esc@5'], 'a Barracks up: the Watchtower, then Advanced, Back in the corner');
  assert.deepEqual(page('build2'), ['b_forge@0', 'b_factory@1', 'b_extractor@2', 'build1@5'], 'the advanced page, no Watchtower');
  raise('forge');
  assert.deepEqual(page('build2'), ['b_forge@0', 'b_factory@1', 'b_extractor@2', 'b_airfield@3', 'build1@5'], 'the Stables appended');
  assert.deepEqual(page('build'), ['b_barracks@0', 'b_depot@1', 'b_core@2', 'b_turret@3', 'build2@4', 'esc@5'], 'the basic page unchanged');
  // Both peoples' pages: the defense on the basic one, and the basic page fits its two rows with Advanced and Back.
  for (const f of Object.values(E.FACTIONS)) {
    const { basic, advanced } = C.buildPages(f);
    assert.ok(basic.some(k => E.BUILDINGS[k].weapon) && !advanced.some(k => E.BUILDINGS[k].weapon && !E.BUILDINGS[k].trains?.length), `${f.name}: the defense on the basic page`);
    assert.ok(basic.length + 2 <= 6, `${f.name}: the basic page, Advanced and Back in two rows`);
    assert.deepEqual([...basic, ...advanced].sort(), [...f.buildBasic, ...f.buildAdvanced].sort(), `${f.name}: every building on one page`);
  }
  ui.sel = []; ui.mode = null;
});

test('a building\'s card: its units in the top row, Rally in the middle of the second, the queue\'s Cancel in the corner, its researches packed among themselves; a unit unlocked moves no button', { skip }, () => {
  // Every building of both peoples that has a card, before and after the buildings its units need stand.
  const want = {
    humans: {
      before: {
        core: ['t_harvester@0', 'rally@4', 'cancelq@5'],
        barracks: ['t_trooper@0', 't_lancer@1', 'rally@4', 'cancelq@5'],
        factory: ['t_observer@0', 'rally@4', 'cancelq@5'],
        airfield: ['t_rider@0', 'r_afterburners@3', 'rally@4', 'cancelq@5'],
        forge: ['r_weapons@0', 'r_armor@1', 'r_entrenching@2', 'r_rapidConstruction@3'],
      },
      raise: ['barracks', 'forge'],
      after: {
        factory: ['t_observer@0', 't_bastion@1', 't_siegeTank@2', 'rally@4', 'cancelq@5'],
        airfield: ['t_rider@0', 't_knight@1', 'r_afterburners@3', 'rally@4', 'cancelq@5'],
      },
    },
    vael: {
      before: {
        conflux: ['t_lumen@0', 'rally@4', 'cancelq@5'],
        siphon: ['t_prism@0', 'rally@4', 'cancelq@5'],
        kiln: ['t_scythe@0', 'rally@4', 'cancelq@5'],
        loom: ['r_weapons@0', 'r_armor@1', 'r_slipstream@2', 'r_drills@3'],
        eclipse: ['t_umbra@0', 't_monolith@1', 'rally@4', 'cancelq@5'],
      },
      raise: ['siphon', 'loom'],
      after: {
        siphon: ['t_prism@0', 't_bruiser@1', 'rally@4', 'cancelq@5'],
        kiln: ['t_scythe@0', 't_shrike@1', 'rally@4', 'cancelq@5'],
      },
    },
  };
  let id = 97000;
  for (const [race, w] of Object.entries(want)) {
    E.resetGame(4242, 1, 0, 0, race, race); E.disableAi();
    const f = E.FACTIONS[race];
    const card = (k, o = {}) => {
      ui.sel = [{ kind: 'bldg', id: id++, team: E.G.me, type: k, d: E.BUILDINGS[k], done: true, queue: [], research: null, prog: 0, ...o }]; ui.mode = null; ui.place = null;
      return C.cardItems().filter(i => !i.hidden).map(i => `${i.id}@${i.slot}`);
    };
    const withCard = [...f.buildBasic, ...f.buildAdvanced].filter(k => E.BUILDINGS[k].trains?.length || E.BUILDINGS[k].researches?.length);
    assert.deepEqual(withCard.slice().sort(), Object.keys(w.before).sort(), `${race}: every building with a card is listed`);
    for (const k of withCard) assert.deepEqual(card(k), w.before[k], `${race}: the ${k}'s card`);
    // Rally armed: its own button is the Cancel, in its slot; a unit queued: the queue's Cancel stays in the corner.
    for (const k of withCard.filter(k => E.BUILDINGS[k].trains?.length)) {
      ui.sel = [{ kind: 'bldg', id: id++, team: E.G.me, type: k, d: E.BUILDINGS[k], done: true, queue: [E.BUILDINGS[k].trains[0]], research: null, prog: 0 }]; ui.mode = 'rally';
      const items = C.cardItems();
      assert.equal(items.find(i => i.active)?.slot, 4, `${race}: the ${k}'s Rally armed, its Cancel in Rally's slot`);
      assert.equal(items.find(i => i.id === 'cancelq')?.slot, 5, `${race}: the ${k}'s queue Cancel in the corner`);
    }
    w.raise.forEach(raise);
    for (const k of withCard) {
      const after = card(k);
      assert.deepEqual(after, w.after[k] || w.before[k], `${race}: the ${k}'s card once ${w.raise.join(' and ')} stand`);
      for (const it of w.before[k]) assert.ok(after.includes(it), `${race}: the ${k}'s ${it} did not move`);
    }
  }
  ui.sel = []; ui.mode = null;
});
