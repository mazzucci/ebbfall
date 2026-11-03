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
  E.disableAi(); E.setResources(E.G.me, 0, 0); // (poor: the buttons are there all the same, greyed)
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
  const bldg = (k, o = {}) => ({ kind: 'bldg', id: id++, team: E.G.me, type: k, d: E.BUILDINGS[k], done: true, planted: false, powered: true, queue: [], research: null, prog: 0, ...o });
  for (const lv of [0, 1, 99]) { // (no techs, the first level of each, all: finished techs leave their slots)
    E.resetGame(4242, 1, 0, 0, race, race); E.disableAi();
    if (lv) for (const [k, u] of Object.entries(E.UPGRADES)) E.debugResearch(E.G.me, k, Math.min(lv, u.levels));
    for (const k of kinds) {
      const d = E.BUILDINGS[k], first = d.trains?.[0], states = [['finished', [bldg(k)]], ['rising', [bldg(k, { done: false })]], ['planted', [bldg(k, { done: false, planted: true })]], ['two finished', [bldg(k), bldg(k)]]];
      if (first) states.push(['training', [bldg(k, { queue: [first, first] })]]);
      if (d.needsPower) states.push(['dark', [bldg(k, { powered: false })]]);
      for (const r of d.researches || []) states.push([`researching ${r}`, [bldg(k, { research: { type: r } })]], [`two, one researching ${r}`, [bldg(k, { research: { type: r } }), bldg(k)]]);
      for (const [state, sel] of states) for (const mode of [null, 'rally']) show(`${k} ${state}, techs ${lv}, ${mode || 'nothing'} armed`, sel, mode);
    }
  }
  ui.sel = []; ui.mode = null; ui.place = null;
  return out;
}

for (const race of ['humans', 'vael']) {
  test(`every card the ${race} can show has a WASD key for each of its buttons, never W A S D, none twice`, { skip }, () => {
    const all = cards(race);
    assert.ok(all.length >= { humans: 3500, vael: 1900 }[race], `every card was read (${all.length}: 3576 and 1924 when written)`);
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
      // A building's card and a Build page keep two rows (the Kiln's four units, Rally and Cancel; the Zenith's three),
      // and their letters (CLASSIC) are each one button's.
      if (/, techs \d+, |, Build(: Advanced)?$/.test(what)) {
        assert.ok(Math.max(...shown.map(i => i.slot)) <= 5, `${what}: two rows at most (${shown.map(i => i.label + ' ' + i.slot).join(', ')})`);
        const letters = items.map(i => i.key).filter(k => k && k !== 'Esc');
        assert.equal(new Set(letters).size, letters.length, `${what}: no CLASSIC key twice (${items.map(i => i.label + ' ' + i.key).join(', ')})`);
      }
      // A selection with workers can always build, on touch and in WASD too (Gather and Repair give way first).
      if (/\b(harvester|lumen)\b/.test(what) && / armed$/.test(what)) assert.ok(shown.some(i => i.id === 'build'), `${what}: Build stays on a card with workers`);
      // No automatic ability (the Siege Tank's Deploy) has a button; the retired Entrench is gone.
      assert.ok(!items.some(i => i.id.startsWith('a_') && E.ABILITIES[i.id.slice(2)].auto), `${what}: no button for an automatic ability`);
      assert.ok(!items.some(i => i.id === 'a_entrench' || i.id === 'r_entrenching'), `${what}: no Entrench`);
      // Attack-move keeps a key, the one of its slot; in CLASSIC it is A.
      const attack = items.find(i => i.id === 'attack');
      if (attack) { assert.equal(attack.key, 'A', `${what}: classic Attack`); assert.equal(wasd.find(i => i.id === 'attack').key, GRID[attack.slot]); }
    }
    assert.ok(most >= 5 && most < GRID.length, `the cards fill slots 0 to ${most}: within the grid`);
  });
}

test('the Siege Tank deploys by itself: no Deploy on its card, an order to deploy is refused, and it sets up when it stops', { skip }, () => {
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

test('what is not open yet is hidden in place: its slot stays empty, nothing else moves, its key does nothing', { skip }, () => {
  E.resetGame(4242, 1, 0, 0, 'vael', 'vael'); E.disableAi();
  const hq = E.G.bldgs.find(b => b.team === E.G.me);
  const lumen = E.G.units.find(u => u.team === E.G.me && u.type === 'lumen');
  const slots = () => C.cardItems().filter(i => !i.hidden).map(i => `${i.id}@${i.slot}`);
  // The Build list: the basic page is all there from the start; no Advanced before a Kiln stands.
  ui.sel = [lumen]; ui.mode = 'build'; ui.place = null;
  assert.deepEqual(slots(), ['b_spire@0', 'b_kiln@1', 'b_siphon@2', 'b_conflux@3', 'esc@5'], 'no Advanced yet');
  assert.ok(!C.cardItems().some(i => i.id === 'b_loom'), 'nor the advanced page\'s keys');
  // A unit's abilities: one waiting for its tech is left out, the others keep their places.
  const scythe = E.debugSpawn(E.G.me, 'scythe', hq.x + 90, hq.y + 90), mono = E.debugSpawn(E.G.me, 'monolith', hq.x + 120, hq.y + 90);
  const unit = (id) => E.G.units.find(u => u.id === id);
  ui.sel = [unit(scythe), unit(mono)]; ui.mode = null;
  const before = slots();
  assert.ok(before.includes('a_blink@2') && !before.some(s => s.startsWith('a_overcharge')), `Blink in place, Overcharge hidden: ${before}`);
  E.debugResearch(E.G.me, 'overchargeCore', 1);
  ui.sel = [unit(scythe), unit(mono)];
  const after = slots();
  assert.ok(after.includes('a_blink@2') && after.includes('a_overcharge@3'), `researched, Overcharge in its own place: ${after}`);
  // A Monolith alone: its card keeps its shape whether Overcharge is researched or not (Deselect stays put).
  E.resetGame(4242, 1, 0, 0, 'vael', 'vael'); E.disableAi();
  const m2 = E.debugSpawn(E.G.me, 'monolith', hq.x + 120, hq.y + 90);
  ui.sel = [unit(m2)];
  const plain = slots();
  assert.ok(!plain.some(s => s.startsWith('a_overcharge')) && plain.includes('deselect@5'), `before: Overcharge hidden, Deselect in its place: ${plain}`);
  E.debugResearch(E.G.me, 'overchargeCore', 1);
  ui.sel = [unit(m2)];
  const lit = slots();
  assert.ok(lit.includes('a_overcharge@2') && lit.includes('deselect@5'), `after: Overcharge in its slot, Deselect where it was: ${lit}`);
  ui.sel = []; ui.mode = null;
});
