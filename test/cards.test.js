// The command card's keys in both controls schemes (src/client/controls.js), read from the real card (src/client/cards.js
// `cardItems`) on the WASM sim: every selection of each race's units (with and without their techs, each order armed,
// the Build pages, a building being placed) and every building of each race (finished, rising, training, researching,
// dark, several of a kind). In WASD every button has its slot's grid key: none of W A S D, no key twice on a card;
// a selection with workers keeps Build. A toggle's button names its action: Deploy, then Undeploy.
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
      // A selection with workers can always build, on touch and in WASD too (Gather and Repair give way first).
      if (/\b(harvester|lumen)\b/.test(what) && / armed$/.test(what)) assert.ok(shown.some(i => i.id === 'build'), `${what}: Build stays on a card with workers`);
      // A toggle's button names its action, never lit (a timed ability is, while it runs); the retired Entrench is gone.
      assert.ok(!items.some(i => i.active && i.id.startsWith('a_') && E.ABILITIES[i.id.slice(2)].toggle), `${what}: no lit toggle`);
      assert.ok(!items.some(i => i.id === 'a_entrench' || i.id === 'r_entrenching'), `${what}: no Entrench`);
      // Attack-move keeps a key, the one of its slot; in CLASSIC it is A.
      const attack = items.find(i => i.id === 'attack');
      if (attack) { assert.equal(attack.key, 'A', `${what}: classic Attack`); assert.equal(wasd.find(i => i.id === 'attack').key, GRID[attack.slot]); }
    }
    assert.ok(most >= 5 && most < GRID.length, `the cards fill slots 0 to ${most}: within the grid`);
  });
}

test('a toggle names what a tap does: Deploy while any tank is on its tracks (for those), then Undeploy (for all)', { skip }, () => {
  E.resetGame(4242, 1, 0, 0, 'humans', 'humans'); E.disableAi();
  const hq = E.G.bldgs.find(b => b.team === E.G.me);
  const ids = [0, 1].map(i => E.debugSpawn(E.G.me, 'siegeTank', hq.x + 90 + i * 40, hq.y + 90));
  const van = E.debugSpawn(E.G.me, 'vanguard', hq.x + 90, hq.y + 140);
  const unit = (id) => E.G.units.find(u => u.id === id);
  const run = (secs) => { for (let i = 0; i < secs * 30; i++) E.step(); };
  const button = () => { ui.sel = [...ids, van].map(unit); ui.mode = null; ui.place = null; return C.cardItems().find(i => i.id === 'a_deploy'); };
  const targets = () => C.abilityTargets([...ids, van].map(unit), 'deploy').units.map(u => u.id).sort();
  assert.ok(!C.cardItems().some(i => i.id === 'a_entrench'), 'the Vanguard has no toggle (Entrench is retired)');
  let b = button();
  assert.deepEqual([b.label, b.icon, b.key, !!b.dis, !!b.active], ['Deploy', 'deploy', 'D', false, false], 'all on their tracks');
  assert.deepEqual(targets(), ids.slice().sort(), 'for both tanks (not the Vanguard)');
  // One deployed: still Deploy, for the other one only (the sim flips each tank it is sent).
  assert.equal(E.castAbility([unit(ids[0])], 'deploy'), null); run(3.5);
  b = button();
  assert.deepEqual([b.label, b.icon, !!b.dis, !!b.active], ['Deploy', 'deploy', false, false], 'one deployed, one on its tracks');
  assert.deepEqual(targets(), [ids[1]], 'for the one on its tracks');
  assert.equal(E.castAbility(targets().map(unit), 'deploy'), null);
  // All deployed or settling in: Undeploy, greyed while one still settles in (a tap would pack up only the other).
  b = button();
  assert.deepEqual([b.label, b.icon, b.key, !!b.dis, !!b.active], ['Undeploy', 'undeploy', 'D', true, false], 'one still settling in');
  run(3.5);
  b = button();
  assert.deepEqual([b.label, b.icon, !!b.dis, !!b.active], ['Undeploy', 'undeploy', false, false], 'both deployed');
  assert.match(b.tip, /Pack up/);
  assert.deepEqual(targets(), ids.slice().sort(), 'for both');
  assert.equal(E.castAbility(targets().map(unit), 'deploy'), null);
  assert.ok(ids.every(id => unit(id).mode === null && unit(id).swap > 0), 'both packing up');
  b = button();
  assert.deepEqual([b.label, !!b.dis], ['Deploy', true], 'packing up: Deploy, greyed until it can');
  // One packed up, one still packing up (a fresh tank on its tracks beside one that packs up later): greyed too.
  run(3.5);
  assert.equal(E.castAbility([unit(ids[0])], 'deploy'), null); run(3.5);
  assert.equal(E.castAbility([unit(ids[0])], 'deploy'), null);
  b = button();
  assert.deepEqual([b.label, !!b.dis], ['Deploy', true], 'one packing up: Deploy waits for it');
  run(3.5);
  assert.deepEqual([button().label, !!button().dis], ['Deploy', false], 'both on their tracks');
  ui.sel = []; ui.mode = null;
});
