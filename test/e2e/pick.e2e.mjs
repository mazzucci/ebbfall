// What a click or a tap takes where a unit stands over a building (src/client/input.js `pick`): over one of our own, our
// own walker on its lower part (28 px from its feet) alone, above that the building; an enemy by its whole body; on open
// ground any unit by its whole body.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { test, start, stop, newGame, DESKTOP, PHONE } from './harness.mjs';

before(start);
after(stop);

const ids = async (d) => (await d.selection()).map(e => e.id).sort((a, b) => a - b);
const unit = async (d, id) => (await d.state()).units.find(u => u.id === id);
/** Click (or tap) `up` px above unit `id`'s feet, apart from any click before it (no double-click). */
async function at(d, id, up, opts) { const u = await unit(d, id); await d.page.waitForTimeout(450); await d.clickWorld(u.x, u.y - up, opts); }
async function shift(d, f) { await d.page.keyboard.down('Shift'); await f(); await d.page.keyboard.up('Shift'); }
/** Nothing selected. */
async function none(d) { await d.key('Escape'); await d.key('Escape'); assert.deepEqual(await ids(d), []); }

/** A finished Cottage of ours in open ground (set up), and a Villager idle just south of it: its feet past the
 *  footprint's foot by a few px or on it, its hat over the footprint. Another Villager far from any building. */
async function scene(d) {
  const core = (await d.state()).bldgs.find(b => b.team === 0 && b.type === 'core');
  await d.grant(1000, 0);
  const id = await d.eval(([cx, cy]) => {
    const { G, engine: E } = endfall, w = G.units.find(u => u.team === 0 && u.d.worker && !u.inside);
    for (let r = 5; r < 10; r++) for (let dx = -r; dx <= r; dx++) for (const dy of [r, -r]) {
      const tx = Math.floor(cx / 32) + dx, ty = Math.floor(cy / 32) + dy;
      // (the tiles round it free too, so nothing else is under the clicks)
      if (![[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2], [0, 3]].every(([x, y]) => E.canPlace('depot', tx + x, ty + y, 0))) continue;
      if (E.placeBuilding(0, 'depot', tx, ty, w) !== null) continue;
      const b = () => G.bldgs.find(b => b.team === 0 && b.type === 'depot');
      for (let t = 0; t < 120 && !b().done; t++) endfall.skip(1);
      E.moveTo(G.units.find(u => u.id === w.id), cx, cy + 10); endfall.skip(8); // (its builder away)
      return b().done ? b().id : null;
    }
    return null;
  }, [core.x, core.y]);
  assert.ok(id, 'a Cottage in open ground');
  const b = (await d.state()).bldgs.find(x => x.id === id), foot = (b.ty + b.h) * 32;
  const spawn = (type, x, y, team = 0) => d.eval(([t, type, x, y]) => endfall.engine.debugSpawn(t, type, x, y), [team, type, x, y]);
  const w = await spawn('harvester', b.x, foot + 4);
  await d.skip(0.3);
  const u = await unit(d, w);
  assert.ok(u.y - 8 < foot && u.y - 30 > b.ty * 32 && u.x > b.tx * 32 + 4 && u.x < (b.tx + b.w) * 32 - 4, `the Villager before the Cottage: ${JSON.stringify([u, b])}`);
  return { core, b, w, foot, spawn };
}

/** A point of open ground by the Castle: clear of every building's art, the mines and the units, well inside the map. */
async function openSpot(d, core) {
  const s = await d.state(), W = await d.eval(() => [endfall.engine.WW, endfall.engine.WH]), blocked = (l) => d.eval((l) => l.map(([x, y]) => [[0, 0], [20, 0], [-20, 0], [0, -20], [0, 20]].some(([a, b]) => endfall.engine.blocked(Math.floor((x + a) / 32), Math.floor((y + b) / 32)))), l);
  const spots = [];
  for (let a = 0; a < 24; a++) for (const r of [200, 250, 300]) spots.push([core.x + Math.cos(a / 24 * 6.283) * r, core.y + Math.sin(a / 24 * 6.283) * r]);
  const bad = await blocked(spots);
  const spot = spots.find(([x, y], i) => !bad[i] && x > 250 && y > 250 && x < W[0] - 250 && y < W[1] - 250
    && s.bldgs.every(q => x < q.tx * 32 - 30 || x > (q.tx + q.w) * 32 + 30 || y - 45 > (q.ty + q.h) * 32 || y < q.ty * 32 - 160)
    && [...s.nodes, ...s.units].every(t => Math.hypot(t.x - x, t.y - y) > 100));
  assert.ok(spot, 'open ground');
  return spot;
}

for (const [label, device] of [['desktop click', DESKTOP], ['phone tap', PHONE]]) {
  test(`${label}: over a Cottage of ours a Villager before it is taken by its lower part, the Cottage above that; an enemy there by its whole body; on open ground the Villager by its hat`, { engines: true }, async () => {
    const d = await newGame(device, 1, 4242, { ai: false });
    try {
      const { core, b, w, spawn } = await scene(d);
      const top = await d.eval(() => endfall.unitTop('harvester'));
      assert.ok(top > 30, `a Villager stands taller than its lower part: ${top} px`);
      for (const up of [8, 16, 24]) { await at(d, w, up); assert.deepEqual(await ids(d), [w], `${up} px over its feet: the Villager`); await none(d); }
      await at(d, w, 31);
      assert.deepEqual(await ids(d), [b.id], 'its hat, over the middle of the Cottage: the Cottage');
      await none(d);
      const u = await unit(d, w); await d.page.waitForTimeout(450); await d.clickWorld(u.x, b.y);
      assert.deepEqual(await ids(d), [b.id], 'the middle of the Cottage: the Cottage');
      await none(d);
      // On open ground, its hat: the Villager. (An enemy's unit takes its place before the Cottage.)
      const open = await spawn('harvester', ...await openSpot(d, core));
      await d.skip(0.1); await at(d, open, 31);
      assert.deepEqual(await ids(d), [open], 'on open ground its hat is the Villager');
      await none(d);
      const foe = await spawn('harvester', u.x + 12, u.y, 1);
      await d.skip(0.2);
      await at(d, foe, 30);
      assert.deepEqual(await ids(d), [foe], 'an enemy before the Cottage: by its hat too');
      await none(d);
      // Attack orders keep the whole body: a Guard sent at the enemy's hat.
      const guard = await spawn('trooper', core.x - 40, core.y + 130); // (far: it does not attack by itself)
      await d.skip(0.1);
      if (d.touch) await d.page.locator('#btnArmy').tap(); else await d.key('q');
      assert.deepEqual(await ids(d), [guard]);
      await at(d, foe, 30);
      const task = await d.eval((id) => { const t = endfall.G.units.find(u => u.id === id).task; return t.t; }, guard);
      assert.equal(task, 'attack', 'attacked by its hat');
      assert.deepEqual(d.errors, []);
    } finally { await d.close(); }
  });
}

test('desktop, over a Cottage of ours: a box takes a Villager by its whole body, a double-click its type, Shift adds it, and with a worker selected a damaged Cottage is selected by a left click over a hat, repaired by a right click there', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    const { b, w, core, spawn } = await scene(d);
    const u = await unit(d, w);
    await d.boxSelect(u.x - 8, u.y - 40, u.x + 8, u.y - 29);
    assert.deepEqual(await ids(d), [w], 'a box round its hat: the Villager');
    await none(d); await d.page.waitForTimeout(450);
    const mate = await spawn('harvester', u.x + 80, u.y + 30); await d.skip(0.1);
    // A double-click: the second on its hat counts on it still.
    const [sx, sy] = await d.screen(u.x, u.y - 14), z = await d.eval(() => endfall.cam.zoom);
    for (const up of [14, 31]) await d.page.mouse.click(sx, sy - (up - 14) * z);
    await d.page.waitForTimeout(60);
    const sel = await d.selection();
    assert.ok([w, mate].every(id => sel.some(e => e.id === id)) && sel.every(e => e.type === 'harvester'), `every Villager on screen: ${JSON.stringify(sel)}`);
    // Shift adds it by its lower part.
    const guard = await spawn('trooper', core.x - 40, core.y + 130);
    await d.skip(0.1); await d.key('q');
    assert.deepEqual(await ids(d), [guard]);
    await shift(d, () => at(d, w, 14));
    assert.deepEqual(await ids(d), [guard, w].sort((p, q) => p - q), 'Shift adds the Villager');
    // A worker selected, the Cottage damaged: a left click on it where another's hat is selects it, a right click repairs it.
    const other = await spawn('harvester', b.x + 90, b.y + 60);
    await d.eval((id) => endfall.engine.debugSetHp(id, 60), b.id); await d.skip(0.2);
    await none(d); await at(d, other, 14);
    assert.deepEqual(await ids(d), [other]);
    await at(d, w, 31);
    assert.deepEqual([await ids(d), (await unit(d, other)).task], [[b.id], 'idle'], 'a left click: the Cottage behind the hat, nothing ordered');
    await none(d); await at(d, other, 14);
    const hat = await unit(d, w); await d.rightClickWorld(hat.x, hat.y - 31);
    assert.deepEqual([await ids(d), (await unit(d, other)).task], [[other], 'repair'], 'a right click: the order, to repair the Cottage behind the hat');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});
