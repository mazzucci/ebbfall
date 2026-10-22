// End-to-end gameplay through the real UI in headless Chromium. Run: npm run build && npm run test:e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, newGame, until, DESKTOP, PHONE } from './harness.mjs';

before(start);
after(stop);

const mine = (s, type) => s.units.filter(u => u.team === 0 && u.type === type);
const myBldg = (s, type) => s.bldgs.filter(b => b.team === 0 && b.type === type);
const coreOf = (s) => myBldg(s, 'core')[0];

/** Build `type` through the UI next to the core and wait until it is finished. Returns the building. */
async function buildAndFinish(d, hotkey, type, harvesterIndex = 0) {
  let s = await d.state();
  const core = coreOf(s), spot = await d.findSpot(type, { tx: core.tx + 1, ty: core.ty + 1 });
  assert.ok(spot, `room for a ${type}`);
  const h = mine(s, 'harvester')[harvesterIndex];
  await d.buildWithUI(hotkey, type, spot.tx, spot.ty, h.id);
  s = await d.state();
  const b = s.bldgs.find(b => b.team === 0 && b.type === type && b.tx === spot.tx && b.ty === spot.ty);
  assert.ok(b, `${type} placed (toasts: ${(await d.toasts()).join(' | ')})`);
  await until(d, async () => (await d.state()).bldgs.find(x => x.id === b.id)?.done, { seconds: 120, what: `${type} to finish` });
  return b;
}

test('a depot built through the UI finishes and raises supply', async () => {
  const d = await newGame(DESKTOP);
  try {
    await d.grant(500, 0);
    await buildAndFinish(d, 'd', 'depot');
    assert.deepEqual((await d.state()).sup[1], 18);
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('every finished production building offers its unit, and pressing it trains one', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    await d.grant(5000, 5000);
    await buildAndFinish(d, 'd', 'depot', 0); // supply for six units
    const rax = await buildAndFinish(d, 'b', 'barracks', 0);
    const forge = await buildAndFinish(d, 'f', 'forge', 1);
    await buildAndFinish(d, 'r', 'turret', 2);
    const airfield = await buildAndFinish(d, 'a', 'airfield', 3);
    for (const [b, label, unit] of [[coreOf(await d.state()), 'Harvester', 'harvester'], [rax, 'Trooper', 'trooper'], [rax, 'Lancer', 'lancer'], [rax, 'Medic', 'medic'], [forge, 'Vanguard', 'vanguard'], [airfield, 'Wasp', 'wasp']]) {
      await d.clickEntity(b.id);
      const card = await d.card();
      const why = async () => JSON.stringify({ card, sel: await d.selection(), ui: await d.eval(() => [endfall.ui.mode, endfall.ui.place]), at: b, near: (await d.state()).units.filter(u => Math.hypot(u.x - b.x, u.y - b.y) < 70).map(u => [u.type, Math.round(u.x - b.x), Math.round(u.y - b.y)]) });
      assert.ok(card.some(c => c.label === label && c.enabled), `${b.type} offers ${label}: ${card.some(c => c.label === label) ? '' : await why()}`);
      const before = mine(await d.state(), unit).length;
      await d.pressCard(label);
      assert.equal((await d.state()).bldgs.find(x => x.id === b.id).queue[0], unit, `${label} queued`);
      await until(d, async () => mine(await d.state(), unit).length > before, { seconds: 40, what: `${label} to be trained` });
    }
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('medics wait for a forge, and a wasp flies straight across the map', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    await d.grant(5000, 5000);
    const rax = await buildAndFinish(d, 'b', 'barracks', 0);
    await d.clickEntity(rax.id);
    const card = await d.card();
    assert.ok(card.some(c => c.label === 'Lancer' && c.enabled), 'Lancer available');
    assert.ok(card.some(c => c.label === 'Medic' && !c.enabled), `Medic needs a Forge: ${JSON.stringify(card)}`);
    await d.pressCard('Medic'); // locked, but a tap says why
    assert.match((await d.toasts()).join(' '), /Requires War Forge/);
    assert.equal((await d.state()).bldgs.find(b => b.id === rax.id).queue.length, 0, 'nothing queued');
    await buildAndFinish(d, 'f', 'forge', 1);
    const airfield = await buildAndFinish(d, 'a', 'airfield', 2);
    await d.clickEntity(airfield.id);
    await d.pressCard('Wasp');
    const wasp = await until(d, async () => mine(await d.state(), 'wasp')[0], { seconds: 40, what: 'a wasp' });
    // Fly it to the far side of the map: a flyer goes straight, so it covers ~1300 px in under 12 s.
    await d.clickEntity(wasp.id);
    const target = { x: wasp.x + 900, y: wasp.y - 900 };
    await d.rightClickWorld(target.x, target.y);
    await d.skip(10);
    const now = (await d.state()).units.find(u => u.id === wasp.id);
    assert.ok(Math.hypot(now.x - target.x, now.y - target.y) < 60, `wasp at ${Math.round(now.x)},${Math.round(now.y)}, target ${target.x},${target.y}`);
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('a building under construction shows its progress, and a stalled one can be resumed', async () => {
  const d = await newGame(DESKTOP);
  try {
    await d.grant(1000, 0);
    let s = await d.state();
    const core = coreOf(s), spot = await d.findSpot('depot', { tx: core.tx + 1, ty: core.ty + 1 });
    const h = mine(s, 'harvester')[0];
    await d.buildWithUI('d', 'depot', spot.tx, spot.ty, h.id);
    await d.skip(10);
    assert.ok(myBldg(await d.state(), 'depot')[0]?.progress > 0, 'construction started before we pull the builder away');
    // Pull the builder away: construction must stop and say so.
    await d.clickEntity(h.id);
    await d.rightClickWorld(core.x - 120, core.y - 120);
    s = await d.state();
    const depot = myBldg(s, 'depot')[0];
    await d.skip(8);
    const stalled = (await d.state()).bldgs.find(b => b.id === depot.id);
    assert.ok(!stalled.done && Math.abs(stalled.progress - depot.progress) < 1e-9, 'no builder, no progress');
    await d.clickEntity(depot.id);
    assert.match(await d.hudText('#selSub', /paused/), /paused/, 'the panel says construction is paused');
    assert.ok((await d.card()).some(c => c.label === 'Resume'), 'a Resume button is offered');
    await d.pressCard('Resume');
    await until(d, async () => (await d.state()).bldgs.find(b => b.id === depot.id)?.done, { seconds: 60, what: 'the resumed depot to finish' });
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('an unfinished building can be cancelled for a 75% refund', async () => {
  const d = await newGame(DESKTOP);
  try {
    await d.grant(1000, 0);
    const s = await d.state(), core = coreOf(s), spot = await d.findSpot('barracks', { tx: core.tx + 1, ty: core.ty + 1 });
    await d.buildWithUI('b', 'barracks', spot.tx, spot.ty, mine(s, 'harvester')[0].id);
    const rax = myBldg(await d.state(), 'barracks')[0];
    assert.ok(rax && !rax.done, 'barracks under construction');
    const before = (await d.state()).res[0];
    await d.clickEntity(rax.id);
    await d.pressCard('Cancel');
    const after = await d.state();
    assert.ok(!after.bldgs.some(b => b.id === rax.id), 'the site is gone');
    assert.ok(after.res[0] - before >= 112 && after.res[0] - before < 130, `refund ${after.res[0] - before} (75% of 150, plus any mining)`);
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('training shows progress and the queue in the panel', async () => {
  const d = await newGame(DESKTOP);
  try {
    await d.grant(1000, 0);
    const core = coreOf(await d.state());
    await d.clickEntity(core.id);
    await d.pressCard('Harvester'); await d.pressCard('Harvester');
    await d.skip(3);
    assert.match(await d.hudText('#selSub', /Training Harvester \d+% \+1/), /Training Harvester \d+% \+1/);
    assert.equal(await d.page.locator('#queue .qi').count(), 2);
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('harvesters mine ether once an extractor stands on the vent', async () => {
  const d = await newGame(DESKTOP);
  try {
    await d.grant(1000, 0);
    let s = await d.state();
    const core = coreOf(s);
    const vent = s.nodes.filter(n => n.type === 'ether').sort((a, b) => Math.hypot(a.x - core.x, a.y - core.y) - Math.hypot(b.x - core.x, b.y - core.y))[0];
    const h = mine(s, 'harvester');
    // Click a little off the vent: placement snaps onto it.
    await d.clickEntity(h[0].id); await d.key('b'); await d.key('e');
    const [x, y] = await d.screen(vent.x + 14, vent.y + 10); await d.page.mouse.move(x, y); await d.page.mouse.click(x, y);
    s = await d.state();
    const ext = myBldg(s, 'extractor')[0];
    assert.ok(ext, `extractor placed (${(await d.toasts()).join(' | ')})`);
    await until(d, async () => (await d.state()).bldgs.find(b => b.id === ext.id)?.done, { seconds: 90, what: 'the extractor' });
    for (const u of h.slice(1, 4)) { await d.clickEntity(u.id); await d.rightClickWorld(ext.x, ext.y); }
    await until(d, async () => (await d.state()).res[1] > 0, { seconds: 60, what: 'ether income' });
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: tap selects, the command card works, the HUD shows status, back asks before leaving', async () => {
  const d = await newGame(PHONE);
  try {
    await d.grant(1000, 0);
    const s = await d.state();
    const h = mine(s, 'harvester')[0];
    await d.clickEntity(h.id);
    assert.equal((await d.selection())[0]?.type, 'harvester', 'tapping a harvester selects it');
    assert.equal(await d.hudText('#selMiniName', /^Harvester$/), 'Harvester');
    assert.deepEqual((await d.card()).map(c => c.label), ['Build', 'Gather', 'Repair', 'Move', 'Stop', 'Attack', 'Hold', 'Deselect'], 'a Harvester card leads with Build');
    await d.pressCard('Build');
    const depot = d.page.locator('#cmd button', { hasText: 'Depot' });
    assert.ok(await depot.locator('.c').isVisible(), 'costs show on the phone');
    assert.equal(await depot.locator('.c .s').textContent(), '100');
    assert.ok(await depot.locator('img.por').count(), 'the Depot button has a portrait');
    await d.pressCard('Back');
    await d.clickEntity(coreOf(s).id);
    await d.pressCard('Harvester');
    await d.skip(2);
    const mini = await d.hudText('#selMiniHp', /Training Harvester/);
    const diag = mini.includes('Training') ? '' : JSON.stringify({ core: (await d.state()).bldgs.find(b => b.type === 'core' && b.team === 0), card: await d.card(), sel: await d.selection(), toasts: await d.toasts(), res: (await d.state()).res });
    assert.match(mini, /Training Harvester/, diag);
    await d.page.goBack(); await d.page.waitForTimeout(300);
    assert.ok(await d.page.locator('#leave').isVisible(), 'the leave dialog opens instead of leaving');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('a whole game against the AI runs to the end without errors', async () => {
  const d = await newGame(DESKTOP, 2);
  try {
    await until(d, async () => (await d.state()).over, { seconds: 1500, step: 30, what: 'the game to end' });
    await d.page.waitForTimeout(400);
    assert.ok(await d.page.locator('#end').isVisible(), 'the end screen shows');
    assert.equal(await d.page.locator('#result').textContent(), 'DEFEAT');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

// ---------------- battle awareness and control ----------------

test('an attack raises an alert, and Space jumps to it', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    const s = await d.state(), h = mine(s, 'harvester')[0];
    const spot = { x: h.x + 60, y: h.y };
    await d.centerOn(1800, 200); await d.page.mouse.move(640, 300); // look away: a fight on screen gets no siren
    await d.eval(([x, y]) => endfall.engine.debugSpawn(1, 'trooper', x, y), [spot.x, spot.y]);
    await until(d, async () => (await d.toasts()).some(t => /under attack/.test(t)), { seconds: 10, step: 1, what: 'the attack alert' });
    assert.ok(await d.page.locator('#btnAlert').isVisible(), 'the ⚠ chip shows');
    await d.key(' ');
    const view = await d.eval(() => { const c = endfall.cam; return { x0: c.x, y0: c.y, x1: c.x + 1280 / c.zoom, y1: c.y + 480 / c.zoom }; });
    assert.ok(spot.x > view.x0 && spot.x < view.x1 && spot.y > view.y0 && spot.y < view.y1, `camera shows the fight: ${JSON.stringify(view)}`);
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('idle and army buttons, and double-click selects all of a type on screen', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    const s = await d.state(), core = coreOf(s);
    const ids = await d.eval(([x, y]) => [0, 1, 2].map(i => endfall.engine.debugSpawn(0, 'trooper', x + i * 24, y)), [core.x + 140, core.y - 40]);
    await d.page.locator('#btnArmy').click();
    assert.deepEqual((await d.selection()).map(u => u.id).sort(), ids.slice().sort(), 'ARMY selects every combat unit');
    // Make a harvester idle, then find it with the IDLE button.
    const h = mine(s, 'harvester')[0];
    await d.clickEntity(h.id); await d.key('s');
    await d.key('Escape');
    assert.equal((await d.selection()).length, 0);
    await d.page.locator('#btnIdle').click();
    const picked = await d.eval(() => endfall.ui.sel.map(u => ({ type: u.type, task: u.task.t })));
    assert.deepEqual(picked, [{ type: 'harvester', task: 'idle' }], 'IDLE selects an idle harvester');
    // Double-click one trooper (two clicks on one precomputed point, back to back): all three are selected.
    await d.key('Escape');
    const [px, py] = await d.screen((await d.state()).units.find(u => u.id === ids[0]).x, (await d.state()).units.find(u => u.id === ids[0]).y);
    await d.page.mouse.click(px, py); await d.page.mouse.click(px, py);
    assert.equal((await d.selection()).filter(u => u.type === 'trooper').length, 3, 'double-click selects all troopers on screen');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('pause stops the game and restart begins a new one', async () => {
  const d = await newGame(DESKTOP);
  try {
    await d.page.waitForTimeout(1500);
    await d.key('p');
    assert.ok(await d.page.locator('#pause').isVisible());
    const t0 = await d.eval(() => endfall.G.time);
    await d.page.waitForTimeout(1200);
    assert.equal(await d.eval(() => endfall.G.time), t0, 'no game time passes while paused');
    await d.key('p');
    assert.ok(!(await d.page.locator('#pause').isVisible()), 'P resumes');
    await d.page.waitForTimeout(1200);
    assert.ok(await d.eval(() => endfall.G.time) > t0, 'time runs again');
    await d.page.locator('#btnPause').click();
    await d.page.locator('#btnRestart').click();
    await d.page.waitForTimeout(300);
    assert.ok(await d.eval(() => endfall.G.time) < 1, 'a new game started');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: no group tabs; a tap on the ground lets go of a building, the Rally button sets its rally point', async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    assert.equal(await d.page.locator('#groups button').count(), 0, 'no control-group tabs on a phone');
    const s = await d.state(), core = coreOf(s);
    // Open ground: clear of resource fields (now selectable) and units.
    const [gx, gy] = [[260, -120], [200, 160], [-160, -200], [300, 60], [0, -260]].map(([dx, dy]) => [core.x + dx, core.y + dy])
      .find(([x, y]) => s.nodes.every(n => Math.hypot(n.x - x, n.y - y) > 80) && s.units.every(u => Math.hypot(u.x - x, u.y - y) > 60));
    await d.clickEntity(core.id);
    assert.equal((await d.selection())[0]?.type, 'core');
    await d.clickWorld(gx, gy);
    assert.equal((await d.selection()).length, 0, 'tapping the ground deselects the building');
    assert.equal(await d.eval((id) => !!endfall.G.bldgs.find(b => b.id === id).rally, core.id), false, 'no rally point set by accident');
    await d.clickEntity(core.id);
    await d.pressCard('Rally');
    await d.clickWorld(gx, gy);
    const rally = await d.eval((id) => endfall.G.bldgs.find(b => b.id === id).rally, core.id);
    assert.ok(rally && Math.abs(rally.x - gx) < 20, 'Rally, then a tap, sets the rally point');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('the forge researches weapons upgrades, and unit stats show the bonus', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    await d.grant(5000, 5000);
    await buildAndFinish(d, 'b', 'barracks', 0);
    const forge = await buildAndFinish(d, 'f', 'forge', 1);
    await d.clickEntity(forge.id);
    assert.ok((await d.card()).some(c => c.label === 'Weapons I' && c.enabled), 'Weapons I offered');
    await d.pressCard('Weapons I');
    assert.match(await d.hudText('#selSub', /Researching Weapons I/), /Researching Weapons I/);
    assert.ok((await d.card()).some(c => c.label === 'Armor I' && !c.enabled), 'one research at a time per forge');
    // Researching and training at once: two cancels, and Deselect still in the bottom-right slot.
    await d.pressCard('Vanguard');
    const slots = await d.page.$$eval('#cmd > *', els => els.map(e => e.querySelector('.l')?.textContent || ''));
    assert.deepEqual(slots, ['Vanguard', 'Weapons I', 'Armor I', '', 'Rally', 'Cancel', 'Cancel', 'Deselect'], 'the forge card keeps its layout');
    await d.page.locator('#cmd > :nth-child(7)').click(); // cancel the Vanguard
    const before = (await d.state()).res;
    await d.page.locator('#cmd > :nth-child(6)').click(); // cancel the research
    const after = (await d.state()).res;
    assert.ok(after[0] - before[0] >= 100 && after[1] - before[1] === 100, 'cancel refunds in full');
    await d.pressCard('Weapons I');
    await until(d, async () => (await d.eval(() => endfall.G.upgrades[0].weapons)) === 1, { seconds: 70, what: 'Weapons I' });
    await d.clickEntity(forge.id);
    assert.ok((await d.card()).some(c => c.label === 'Weapons II'), 'next level offered');
    const id = await d.eval(([x, y]) => endfall.engine.debugSpawn(0, 'trooper', x, y), [forge.x, forge.y + 90]);
    await d.clickEntity(id);
    assert.match(await d.hudText('#stats', /7\+1/), /Damage 7\+1/, 'trooper damage shows the bonus');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('a game starts fully zoomed out over the base', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    assert.equal(d.startZoom, await d.eval(() => endfall.zoomMin));
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('harvesters repair a damaged building (right-click on desktop, the Repair button on a phone)', async () => {
  for (const device of [DESKTOP, PHONE]) {
    const d = await newGame(device, 1, 4242, { ai: false });
    try {
      await d.grant(1000, 0);
      const depot = await buildAndFinish(d, 'd', 'depot', 0);
      const max = await d.eval((id) => endfall.G.bldgs.find(b => b.id === id).maxhp, depot.id);
      await d.eval((id) => endfall.engine.debugSetHp(id, 60), depot.id); // set-up: knock it down
      // A mining harvester moves; a tap may miss it or pick a neighbour: retry, then follow the one selected.
      for (let i = 0; i < 4 && (await d.selection())[0]?.type !== 'harvester'; i++) await d.clickEntity(mine(await d.state(), 'harvester')[1 + i % 3].id);
      const h = (await d.selection())[0];
      assert.equal(h?.type, 'harvester');
      if (d.touch) { await d.pressCard('Repair'); await d.clickWorld(depot.x, depot.y); } else await d.rightClickWorld(depot.x, depot.y);
      assert.equal((await d.state()).units.find(u => u.id === h.id).task, 'repair', `${d.touch ? 'phone' : 'desktop'}: the harvester goes to repair`);
      if (d.touch) {
        // On a phone the harvester is let go once it has the job, so a tap on the map does not pull it off it.
        assert.equal((await d.selection()).length, 0, 'phone: released after the order');
        await d.clickWorld(depot.x + 220, depot.y + 160);
        assert.equal((await d.state()).units.find(u => u.id === h.id).task, 'repair', 'phone: a later tap does not redirect it');
      } else assert.equal((await d.selection())[0]?.id, h.id, 'desktop: the selection stays');
      const shards = (await d.state()).res[0];
      await d.skip(4);
      await d.clickEntity(depot.id);
      assert.match(await d.hudText(d.touch ? '#selMiniHp' : '#selSub', /Repairing/), /Repairing/, 'the building shows it is being repaired');
      await until(d, async () => (await d.eval((id) => endfall.G.bldgs.find(b => b.id === id).hp, depot.id)) >= max, { seconds: 60, what: 'the repair' });
      assert.ok((await d.state()).res[0] < shards + 200, 'repairs cost shards'); // (mining income runs meanwhile)
      assert.deepEqual(d.errors, []);
    } finally { await d.close(); }
  }
});

test('a resource field can be selected to see what is left (desktop click, phone tap)', async () => {
  for (const device of [DESKTOP, PHONE]) {
    const d = await newGame(device, 1, 4242, { ai: false });
    try {
      const s = await d.state(), core = coreOf(s);
      // The nearest shard field with no harvester over it (a tap prefers a unit within reach).
      const node = s.nodes.filter(n => n.type === 'shard' && s.units.every(u => Math.hypot(u.x - n.x, u.y - n.y) > 48))
        .sort((a, b) => Math.hypot(a.x - core.x, a.y - core.y) - Math.hypot(b.x - core.x, b.y - core.y))[0];
      await d.clickWorld(node.x, node.y);
      const sel = await d.selection();
      assert.deepEqual(sel.map(e => e.kind), ['node'], `${d.touch ? 'phone' : 'desktop'}: the field is selected`);
      const left = await d.eval((id) => endfall.map.nodes.find(n => n.id === id).amount, node.id);
      assert.match(await d.hudText(d.touch ? '#selMiniHp' : '#selSub', /left/), new RegExp(`^${left} (shards )?left`), 'shows what is left');
      assert.ok((await d.card()).some(c => c.label === 'Deselect'), 'a Deselect button for the field');
      if (!d.touch) assert.match(await d.hudText('#selName', /Shard field/), /Shard field/);
      // Ether vents too.
      const vent = s.nodes.find(n => n.type === 'ether');
      await d.clickWorld(vent.x, vent.y);
      assert.deepEqual((await d.selection()).map(e => e.kind), ['node'], 'the vent is selected');
      assert.match(await d.hudText(d.touch ? '#selMiniName' : '#selName', /Ether vent/), /Ether vent/);
      assert.deepEqual(d.errors, []);
    } finally { await d.close(); }
  }
});

test('control groups: Ctrl+number saves the selection, the number recalls it, a tab shows the saved group', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    const h = mine(await d.state(), 'harvester')[0];
    await d.clickEntity(h.id);
    await d.page.keyboard.press('Control+1');
    assert.match((await d.toasts()).join(' '), /Group 1 saved/);
    assert.equal(await d.page.locator('#groups button[data-k="1"]').count(), 1, 'a tab for the saved group');
    await d.key('Escape');
    assert.equal((await d.selection()).length, 0);
    await d.key('1');
    assert.equal((await d.selection())[0]?.id, h.id, 'the number key recalls the group');
    await d.key('Escape');
    await d.page.locator('#groups button[data-k="1"]').click();
    assert.equal((await d.selection())[0]?.id, h.id, 'so does its tab');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});
