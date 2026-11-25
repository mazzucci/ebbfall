// The mouse's buttons (MOUSE on the OPTIONS card, src/client/controls.js): LEFT OR RIGHT CLICK, the default, where a left
// click orders the units selected as a right click does, and RIGHT CLICK ONLY, where it only selects and empty ground
// keeps the selection (with the right-click hint, src/client/groundhint.js). A finger's tap is the same in both.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { test, start, stop, newGame, DESKTOP, PHONE } from './harness.mjs';

before(start);
after(stop);

const HINT = 'Right-click to move or attack';
const ids = async (d) => (await d.selection()).map(e => e.id).sort((a, b) => a - b);
const tasks = async (d, list) => { const s = await d.state(); return list.map(id => s.units.find(u => u.id === id)?.task); };
const hints = async (d) => (await d.toasts()).filter(t => t === HINT).length;
const hintGone = (d) => d.page.waitForFunction((t) => ![...document.querySelectorAll('#msg .toast')].some(e => e.textContent === t), HINT, { timeout: 15000 });
const stored = (d, k) => d.eval((k) => localStorage.getItem('endfall.' + k), k);
/** Choose a MOUSE mode ('both', 'right') in OPTIONS, from the pause card. */
async function pickMouse(d, mode) {
  await d.key('p');
  await d.page.locator('#btnPauseOptions').click();
  await d.page.locator(`#options [data-k="mouse:${mode}"]`).click();
  await d.page.locator('#btnOptionsClose').click();
  await d.page.locator('#btnResume').click();
}
/** Hold Shift over `f`. */
async function shift(d, f) { await d.page.keyboard.down('Shift'); await f(); await d.page.keyboard.up('Shift'); }
/** Press at a world point, move `by` px, let go. */
async function dragBy(d, x, y, by) {
  const [sx, sy] = await d.screen(x, y);
  await d.page.mouse.move(sx, sy); await d.page.mouse.down();
  await d.page.mouse.move(sx + by, sy, { steps: 2 }); await d.page.mouse.up(); await d.page.waitForTimeout(60);
}
/** Select units by a click on the first and Shift-clicks on the rest. */
async function pickAll(d, list) {
  await d.key('Escape');
  for (const [i, id] of list.entries()) { await d.page.waitForTimeout(450); if (i) await shift(d, () => d.clickEntity(id)); else await d.clickEntity(id); } // (apart: no double-click)
  assert.deepEqual(await ids(d), list.slice().sort((a, b) => a - b), 'selected by clicks');
}

/** Select one unit by a click, nothing else selected (apart from any click before it: no double-click). */
async function pickOne(d, id) {
  await d.key('Escape'); await d.page.waitForTimeout(450); await d.clickEntity(id);
  assert.deepEqual(await ids(d), [id], 'selected by a click');
}
/** An enemy worker in the Castle's sight, on the far side of it from the Guards (they would attack one near). */
async function spawnFoe(d, core) {
  const foe = await d.eval(([x, y]) => endfall.engine.debugSpawn(1, 'harvester', x, y), [core.x, core.y - 190]);
  await d.skip(0.2);
  return foe;
}

/** Three Guards and two idle workers by the Castle (set up), their ids; the home mine; and a point of open ground away
 *  from everything, well inside the map and in clear view once the camera looks there. */
async function scene(d) {
  const core = (await d.state()).bldgs.find(b => b.team === 0 && b.type === 'core');
  const spawn = (type, n, dx, dy) => d.eval(([type, n, x, y]) => Array.from({ length: n }, (_, i) => endfall.engine.debugSpawn(0, type, x + i * 45, y)), [type, n, core.x + dx, core.y + dy]);
  const guards = await spawn('trooper', 3, -60, 150), workers = await spawn('harvester', 2, -40, 220);
  await d.skip(0.2);
  const s = await d.state(), W = await d.eval(() => [endfall.engine.WW, endfall.engine.WH]);
  const things = [...s.nodes, ...s.bldgs, ...s.units];
  const room = ([x, y]) => Math.min(...things.map(t => Math.hypot(t.x - x, t.y - y)));
  const spots = [];
  for (let a = 0; a < 24; a++) for (const r of [300, 360, 420]) spots.push([core.x + Math.cos(a / 24 * 6.283) * r, core.y + Math.sin(a / 24 * 6.283) * r]);
  const inside = spots.filter(([x, y]) => x > 250 && y > 250 && x < W[0] - 250 && y < W[1] - 250);
  const open = await d.eval((l) => l.map(([x, y]) => !endfall.engine.blockedAt?.(x, y)), inside);
  const spot = inside.filter((_, i) => open[i]).sort((a, b) => room(b) - room(a))[0];
  assert.ok(spot && room(spot) > 130, `open ground: ${spot && room(spot)} px from the nearest thing`);
  const [px, py] = await d.screen(...spot);
  assert.equal(await d.eval(([x, y]) => document.elementFromPoint(x, y)?.id, [px, py]), 'game', 'the ground in clear view');
  const mine = s.nodes.filter(n => n.type === 'mine').sort((a, b) => Math.hypot(a.x - core.x, a.y - core.y) - Math.hypot(b.x - core.x, b.y - core.y))[0];
  return { core, guards, workers, mine, spot };
}

test('desktop, LEFT OR RIGHT CLICK (the default): a left click orders the units selected (ground, enemy), as a right click does; a tiny drag is a click, a real one a box; Esc and Deselect let go', { engines: true }, async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    const { core, guards, spot: [x, y] } = await scene(d);
    const idle = async () => { await d.key('s'); await d.skip(0.1); assert.deepEqual(await tasks(d, guards), ['idle', 'idle', 'idle']); };
    await d.clickWorld(x, y);
    assert.deepEqual(await ids(d), [], 'nothing selected: a click on the ground does nothing');
    await d.key('q');
    assert.deepEqual(await ids(d), guards);
    for (const click of [d.clickWorld, d.rightClickWorld]) {
      await click(x, y);
      assert.deepEqual([await ids(d), await tasks(d, guards)], [guards, ['move', 'move', 'move']], 'the ground: they walk there, still selected');
      await idle();
    }
    // Shift: nothing on the ground. A press that moves less than the box's threshold is a click; one past it a box
    // (that takes nothing here: the selection kept, nothing ordered).
    await shift(d, () => d.clickWorld(x, y));
    assert.deepEqual([await ids(d), await tasks(d, guards)], [guards, ['idle', 'idle', 'idle']], 'Shift: no order');
    await dragBy(d, x, y, 3);
    assert.deepEqual(await tasks(d, guards), ['move', 'move', 'move'], 'a 3 px drag is a click');
    await idle();
    await dragBy(d, x, y, 9);
    assert.deepEqual([await ids(d), await tasks(d, guards)], [guards, ['idle', 'idle', 'idle']], 'a 9 px drag is a box: no order, the selection kept');
    await d.boxSelect(x - 60, y - 40, x + 60, y + 40);
    assert.deepEqual([await ids(d), await tasks(d, guards)], [guards, ['idle', 'idle', 'idle']], 'an empty box too');
    // One of ours is selected; Shift adds; a double-click takes the type; a box selects; our Castle is selected.
    await pickAll(d, [guards[0], guards[2]]);
    const g = (await d.state()).units.find(u => u.id === guards[1]);
    const up = await d.eval(() => endfall.unitTop('trooper') / 2);
    const [px, py] = await d.screen(g.x, g.y - up);
    await d.page.waitForTimeout(450);
    await d.page.mouse.click(px, py); await d.page.mouse.click(px, py); await d.page.waitForTimeout(60);
    assert.deepEqual(await ids(d), guards, 'a double-click: all three');
    assert.deepEqual(await tasks(d, guards), ['idle', 'idle', 'idle'], 'and no order');
    await d.clickEntity(core.id);
    assert.deepEqual(await ids(d), [core.id], 'the Castle (finished, undamaged): selected');
    await d.key('Escape');
    assert.deepEqual(await ids(d), [], 'Esc lets go');
    const us = (await d.state()).units.filter(u => guards.includes(u.id));
    await d.boxSelect(Math.min(...us.map(u => u.x)) - 25, us[0].y - 35, Math.max(...us.map(u => u.x)) + 25, us[0].y + 15);
    assert.deepEqual(await ids(d), guards, 'a box selects');
    await d.pressCard('Deselect');
    assert.deepEqual(await ids(d), [], 'Deselect lets go');
    // An enemy: attacked; with nothing of ours selected, looked at, and the ground lets go of it.
    const foe = await spawnFoe(d, core);
    await d.clickEntity(foe);
    assert.deepEqual(await ids(d), [foe], 'looked at');
    await d.clickWorld(x, y);
    assert.deepEqual(await ids(d), [], 'the ground lets go of an enemy looked at');
    await d.key('q'); await idle();
    await d.clickEntity(foe);
    assert.deepEqual([await ids(d), await tasks(d, guards)], [guards, ['attack', 'attack', 'attack']], 'attacked');
    assert.equal(await hints(d), 0, 'no hint in this mode');
    assert.equal(await stored(d, 'groundHint'), null);
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('desktop, the default: workers given a job by a left click (a mine, a site, a damaged building) are let go, by a right click they stay selected; an open Build page only closes', { engines: true }, async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    const { core, workers, mine, spot: [x, y] } = await scene(d);
    const [w, w2] = workers;
    const site = await d.findSpot('depot', { tx: core.tx + 1, ty: core.ty + 1 });
    const job = async (what, go, task) => {
      for (const left of [true, false]) {
        await pickOne(d, w);
        await d.key('s'); await d.skip(0.1);
        await go(left);
        assert.deepEqual([await ids(d), await tasks(d, [w])], [left ? [] : [w], [task]], `${what}, ${left ? 'left: the job, the worker let go' : 'right: the job, the worker still selected'}`);
        await pickOne(d, w); await d.key('s'); await d.skip(0.1);
        assert.deepEqual(await tasks(d, [w]), ['idle'], `${what}: stopped again`);
      }
    };
    const at = (p) => (left) => (left ? d.clickWorld(p.x, p.y) : d.rightClickWorld(p.x, p.y));
    await job('the mine', at(mine), 'gather');
    // A damaged building of ours.
    await d.eval((id) => endfall.engine.debugSetHp(id, 300), core.id);
    await d.skip(0.1);
    await job('the damaged Castle', at(core), 'repair');
    // Fighters alone: a damaged building is selected, as ever.
    await d.key('q'); await d.clickWorld(core.x, core.y);
    assert.deepEqual(await ids(d), [core.id], 'no worker selected: the damaged Castle selected');
    // A site: placed by the other worker, which then stops.
    await d.grant(1000, 0);
    await pickOne(d, w2);
    await d.key('b'); await d.clickWorld(x, y);
    assert.deepEqual([await ids(d), await d.eval(() => endfall.ui.mode), await tasks(d, [w2])], [[w2], null, ['idle']], 'the Build page closes, nothing ordered');
    await d.key('b'); await d.key('w');
    const at2 = { x: (site.tx + 1) * 32, y: (site.ty + 1) * 32 };
    { const [sx, sy] = await d.screen(at2.x, at2.y); await d.page.mouse.move(sx, sy); await d.page.mouse.click(sx, sy); await d.page.waitForTimeout(80); }
    const b = (await d.state()).bldgs.find(b => b.type === 'depot' && b.team === 0);
    assert.ok(b && !b.done, `the site (toasts: ${(await d.toasts()).join(' | ')})`);
    assert.deepEqual(await ids(d), [w2], 'placing is as it was: its builder still selected');
    await d.key('s'); await d.skip(0.1);
    await job('the site', at(b), 'build');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('desktop, the default: a building selected stays with a left click on the ground or an empty box (no rally: the right click\'s); Esc lets go', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    const { core, guards, mine, spot: [x, y] } = await scene(d);
    const rally = () => d.eval((id) => !!endfall.G.bldgs.find(b => b.id === id).rally, core.id);
    await d.clickEntity(core.id);
    await d.clickWorld(x, y);
    await d.boxSelect(x - 40, y - 30, x + 40, y + 30);
    assert.deepEqual([await ids(d), await rally()], [[core.id], false], 'the Castle stays selected, no rally point');
    assert.ok(await d.page.locator('#cmd button[data-id="t_harvester"]').isVisible(), 'its card too');
    await d.rightClickWorld(x, y);
    assert.deepEqual([await ids(d), await rally()], [[core.id], true], 'the right click sets it');
    assert.equal(await hints(d), 0);
    await d.clickWorld(mine.x, mine.y);
    assert.equal((await d.selection())[0]?.kind, 'node', 'a mine is looked at');
    await d.clickEntity(core.id); await d.key('Escape');
    assert.deepEqual(await ids(d), [], 'Esc lets go');
    await d.clickEntity(core.id); await d.clickEntity(guards[1]);
    assert.deepEqual(await ids(d), [guards[1]], 'a Guard clicked: it, not the Castle');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('desktop, RIGHT CLICK ONLY: a left click only selects, the ground and an empty box keep the selection; the right click orders, its workers still selected; remembered across a reload', { engines: true }, async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    let { core, guards, workers: [w], mine, spot: [x, y] } = await scene(d);
    await pickMouse(d, 'right');
    assert.equal(await stored(d, 'mouse'), 'right');
    const keeps = async () => {
      await d.key('q');
      await d.clickWorld(x, y); await dragBy(d, x, y, 3); await d.boxSelect(x - 40, y - 30, x + 40, y + 30);
      await shift(d, () => d.clickWorld(x, y));
      assert.deepEqual([await ids(d), await tasks(d, guards)], [guards, ['idle', 'idle', 'idle']], 'kept, nothing ordered');
    };
    await keeps();
    // Control groups, the minimap: kept too.
    await d.page.keyboard.press('Control+1'); await d.key('Escape');
    assert.deepEqual(await ids(d), [], 'Esc lets go');
    await d.key('1'); await d.clickWorld(x, y);
    const mm = await d.page.locator('#minimap').boundingBox();
    await d.page.mouse.click(mm.x + mm.width / 2, mm.y + mm.height / 2);
    assert.deepEqual(await ids(d), guards, 'a group recalled is kept; the minimap keeps it');
    await d.pressCard('Deselect');
    assert.deepEqual(await ids(d), [], 'Deselect lets go');
    // A mine is looked at; a worker's Build page stays open.
    await pickOne(d, w); await d.clickWorld(mine.x, mine.y);
    assert.equal((await d.selection())[0]?.kind, 'node', 'a mine: looked at');
    assert.deepEqual(await tasks(d, [w]), ['idle'], 'no order');
    await pickOne(d, w); await d.pressCard('Build'); await d.clickWorld(x, y);
    assert.deepEqual([await ids(d), await d.eval(() => endfall.ui.mode)], [[w], 'build'], 'the Build page stays');
    await d.key('Escape');
    assert.deepEqual([await ids(d), await d.eval(() => endfall.ui.mode)], [[w], null], 'Esc: the page first');
    // The right click (a mouse's or a trackpad's two-finger one: the browser sends the same event) orders.
    await d.rightClickWorld(mine.x, mine.y);
    assert.deepEqual([await ids(d), await tasks(d, [w])], [[w], ['gather']], 'the job, the worker still selected');
    await d.key('q'); await d.rightClickWorld(x, y);
    assert.deepEqual([await ids(d), await tasks(d, guards)], [guards, ['move', 'move', 'move']]);
    // An armed order is a left click's, as ever.
    await d.key('a'); await d.clickWorld(x, y);
    assert.deepEqual([await ids(d), await tasks(d, guards)], [guards, ['amove', 'amove', 'amove']]);
    const foe = await spawnFoe(d, core);
    await d.clickEntity(foe);
    assert.deepEqual(await ids(d), [foe], 'an enemy: looked at');
    // The help sheet says it; a reload remembers it.
    const said = async () => { await d.page.locator('#btnHelp').click(); const t = await d.page.locator('#helpSheet .lines.desk li').first().innerText(); await d.page.locator('#btnHelpClose').click(); return t; };
    assert.match(await said(), /then right-click to move, attack or mine; Esc lets go/);
    await d.page.reload({ waitUntil: 'networkidle' });
    await d.page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    await d.page.locator('#btnOptions').click();
    assert.equal(await d.page.locator('#options [data-k^="mouse:"][aria-checked="true"]').textContent(), 'RIGHT CLICK ONLY', 'remembered');
    await d.page.locator('#btnOptionsClose').click();
    await d.page.locator('#btnSolo').click(); await d.page.locator('#btnStart').click();
    await d.page.waitForFunction(() => endfall.G.units.length > 0);
    await d.eval(() => { endfall.engine.disableAi(); endfall.cam.zoom = 2; });
    ({ core, guards, workers: [w], mine, spot: [x, y] } = await scene(d));
    await keeps();
    // Back to the default, in the game: at once.
    await pickMouse(d, 'both');
    await d.clickWorld(x, y);
    assert.deepEqual(await tasks(d, guards), ['move', 'move', 'move']);
    assert.match(await said(), /then click or right-click to move, attack or mine; Esc lets go/);
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('desktop, RIGHT CLICK ONLY: the right-click hint shows on an empty click with units selected, three times on this device at most, across a reload', { engines: true }, async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false, init: () => { try { localStorage.setItem('endfall.mouse', 'right'); } catch { /* none */ } } });
  try {
    let { core, spot: [x, y] } = await scene(d);
    await d.clickWorld(x, y); await d.clickEntity(core.id); await d.clickWorld(x, y);
    assert.equal(await hints(d), 0, 'nothing, or a building, selected: no hint');
    await d.key('q');
    await shift(d, () => d.clickWorld(x, y));
    assert.deepEqual([await hints(d), await stored(d, 'groundHint')], [0, null], 'Shift: no hint');
    await d.clickWorld(x, y);
    assert.deepEqual([await hints(d), await stored(d, 'groundHint')], [1, '1'], 'the first');
    await d.clickWorld(x, y);
    assert.equal(await hints(d), 1);
    await hintGone(d);
    if (await stored(d, 'groundHint') === '1') { await d.page.waitForTimeout(300); await d.clickWorld(x, y); } // (a slow page: that click came after it)
    assert.equal(await stored(d, 'groundHint'), '2', 'the second');
    // Reloaded: one more, then never.
    await d.page.reload({ waitUntil: 'networkidle' });
    await d.page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    await d.page.locator('#btnSolo').click(); await d.page.locator('#btnStart').click();
    await d.page.waitForFunction(() => endfall.G.units.length > 0);
    await d.eval(() => { endfall.engine.disableAi(); endfall.cam.zoom = 2; });
    ({ spot: [x, y] } = await scene(d));
    await d.key('q'); await d.clickWorld(x, y);
    assert.deepEqual([await hints(d), await stored(d, 'groundHint')], [1, '3'], 'the third');
    await hintGone(d); await d.page.waitForTimeout(300);
    await d.clickWorld(x, y);
    assert.deepEqual([await hints(d), await stored(d, 'groundHint')], [0, '3'], 'never a fourth');
    assert.equal((await d.selection()).length, 3, 'the Guards still selected');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('desktop: where nothing can be stored the default holds, the option still works for the visit, and the hint stops at three', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false, init: () => {
    const refuse = () => { throw new Error('no storage'); };
    Storage.prototype.setItem = refuse; Storage.prototype.getItem = refuse;
  } });
  try {
    const { guards, spot: [x, y] } = await scene(d);
    await d.key('q'); await d.clickWorld(x, y);
    assert.deepEqual(await tasks(d, guards), ['move', 'move', 'move'], 'the default: an order');
    await d.key('s'); await pickMouse(d, 'right');
    for (let i = 1; i <= 4; i++) {
      await d.clickWorld(x, y);
      assert.equal(await hints(d), i <= 3 ? 1 : 0, `click ${i}`);
      await hintGone(d); await d.page.waitForTimeout(300);
    }
    assert.deepEqual([await ids(d), await tasks(d, guards)], [guards, ['idle', 'idle', 'idle']]);
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('desktop: the tutorial\'s second step says how a mouse orders, and how to let go', async () => {
  const d = await newGame(DESKTOP, 0, 4242, { tutorial: true });
  try {
    await d.hudText('#tut', /1\/8/);
    await d.grant(1000, 0);
    const core = (await d.state()).bldgs.find(b => b.team === 0 && b.type === 'core');
    await d.clickEntity(core.id);
    await d.pressCard('Villager'); await d.pressCard('Villager');
    await d.skip(40);
    await d.hudText('#tut', /New Villagers wait by the Castle: select them, click the gold mine \(Esc or Deselect lets go\).*2\/8/);
    await pickMouse(d, 'right');
    await d.hudText('#tut', /select them, right-click the gold mine \(Esc or Deselect lets go\)/);
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: a tap is as it was, whatever is stored: units walk, a building and a worker\'s open Build page are let go, no MOUSE option, no hint', async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false, init: () => { try { localStorage.setItem('endfall.mouse', 'right'); } catch { /* none */ } } });
  try {
    const { core, guards, workers: [w], spot: [x, y] } = await scene(d);
    await d.clickEntity(core.id);
    await d.clickWorld(x, y);
    assert.deepEqual(await ids(d), [], 'the Castle let go');
    await d.clickEntity(w);
    assert.deepEqual(await ids(d), [w]);
    await d.pressCard('Build');
    await d.clickWorld(x, y);
    assert.deepEqual(await ids(d), [], 'the worker let go');
    await d.page.locator('#btnArmy').tap();
    await d.clickWorld(x, y);
    assert.deepEqual([await ids(d), await tasks(d, guards)], [guards, ['move', 'move', 'move']], 'the Guards walk there');
    assert.deepEqual([await hints(d), await stored(d, 'groundHint')], [0, null], 'no hint');
    await d.page.locator('#btnPause').tap(); await d.page.locator('#btnPauseOptions').tap();
    assert.equal(await d.page.locator('#options [data-k^="mouse:"]').count(), 0, 'no MOUSE option');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});
