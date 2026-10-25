// End-to-end gameplay through the real UI in headless Chromium. Run: npm run build && npm run test:e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, newGame, until, browserContext, baseUrl, DESKTOP, PHONE } from './harness.mjs';

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
    const rax = await buildAndFinish(d, 'g', 'barracks', 0);
    const forge = await buildAndFinish(d, 'f', 'forge', 1);
    await buildAndFinish(d, 't', 'turret', 2);
    const airfield = await buildAndFinish(d, 'a', 'airfield', 3);
    for (const [b, label, unit] of [[coreOf(await d.state()), 'Harvester', 'harvester'], [rax, 'Trooper', 'trooper'], [rax, 'Lancer', 'lancer'], [rax, 'Medic', 'medic'], [rax, 'Vanguard', 'vanguard'], [airfield, 'Wasp', 'wasp'], [airfield, 'Observer', 'observer']]) {
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
    const rax = await buildAndFinish(d, 'g', 'barracks', 0);
    await d.clickEntity(rax.id);
    const card = await d.card();
    assert.ok(card.some(c => c.label === 'Lancer' && c.enabled), 'Lancer available');
    assert.ok(card.some(c => c.label === 'Medic' && !c.enabled), `Medic needs a Forge: ${JSON.stringify(card)}`);
    await d.pressCard('Medic'); // locked, but a tap says why
    assert.match((await d.toasts()).join(' '), /Requires Foundry/);
    assert.equal((await d.state()).bldgs.find(b => b.id === rax.id).queue.length, 0, 'nothing queued');
    await buildAndFinish(d, 'f', 'forge', 1);
    const airfield = await buildAndFinish(d, 'a', 'airfield', 2);
    await d.clickEntity(airfield.id);
    await d.pressCard('Wasp');
    const wasp = await until(d, async () => mine(await d.state(), 'wasp')[0], { seconds: 40, what: 'a wasp' });
    // Fly it to the far side of the map: a flyer goes straight, so it covers ~1300 px in under 12 s.
    await d.clickEntity(wasp.id);
    // Straight across the map (through the centre, wherever the bases are), over whatever rock lies between.
    const W = await d.eval(() => endfall.engine.WW), H = await d.eval(() => endfall.engine.WH);
    const dx = W / 2 - wasp.x, dy = H / 2 - wasp.y, len = Math.hypot(dx, dy) || 1; // 1300 px towards (and past) the centre
    const target = { x: Math.round(wasp.x + dx / len * 1300), y: Math.round(wasp.y + dy / len * 1300) };
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
    assert.match(await d.hudText('#selSub', /Paused/), /Paused/, 'the panel says construction is paused');
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
    await d.buildWithUI('g', 'barracks', spot.tx, spot.ty, mine(s, 'harvester')[0].id);
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
    assert.match(await d.hudText('#selSub', /^Training$/), /Training/);
    assert.equal(await d.page.locator('#queue .qi').count(), 2);
    const w0 = await d.page.locator('#queue .prod i').evaluate(e => parseFloat(e.style.width));
    await d.skip(3); // (the panel redraws on the next frame: wait for it)
    await d.page.waitForFunction((w) => parseFloat(document.querySelector('#queue .prod i').style.width) > w, w0, { timeout: 10000 });
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
    assert.equal(await d.hudText('#selName', /^Harvester$/), 'Harvester');
    const [mm, info, cmd] = await Promise.all(['#minimap', '#info', '#cmd'].map(q => d.page.locator(q).boundingBox()));
    assert.ok(info.x >= mm.x + mm.width && info.x + info.width <= cmd.x, 'the console sits between the minimap and the command card');
    assert.ok(info.height <= 70 && info.y + info.height <= 390, 'low, at the bottom of the screen');
    assert.deepEqual((await d.card()).map(c => c.label), ['Build', 'Gather', 'Repair', 'Attack', 'Hold', 'Deselect'], 'a Harvester card: three a row, leading with Build, Deselect last');
    await d.pressCard('Build');
    const depot = d.page.locator('#cmd button', { hasText: 'Depot' });
    assert.ok(await depot.locator('.c').isVisible(), 'costs show on the phone');
    assert.equal(await depot.locator('.c .s').textContent(), '100');
    assert.ok(await depot.locator('img.por').count(), 'the Depot button has a portrait');
    await d.pressCard('Back');
    await d.clickEntity(coreOf(s).id);
    await d.pressCard('Harvester');
    await d.skip(2);
    const mini = await d.hudText('#selSub', /Training/);
    const diag = mini.includes('Training') ? '' : JSON.stringify({ core: (await d.state()).bldgs.find(b => b.type === 'core' && b.team === 0), card: await d.card(), sel: await d.selection(), toasts: await d.toasts(), res: (await d.state()).res });
    assert.match(mini, /Training/, diag);
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
    assert.match(await d.page.locator('#endMap').textContent(), /balanced fields/, 'the end screen tells the map story');
    await d.page.locator('#btnAgain').click();
    assert.ok(await d.page.locator('#start').isVisible(), 'Play again goes back to the menu');
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
    await d.page.waitForFunction(() => endfall.G.time > 1);
    await d.key('p');
    assert.ok(await d.page.locator('#pause').isVisible());
    const t0 = await d.eval(() => endfall.G.time);
    await d.page.waitForTimeout(1200);
    assert.equal(await d.eval(() => endfall.G.time), t0, 'no game time passes while paused');
    await d.key('p');
    assert.ok(!(await d.page.locator('#pause').isVisible()), 'P resumes');
    await d.page.waitForFunction((t0) => endfall.G.time > t0, t0, { timeout: 5000 }); // (throws if time stays still)
    await d.page.locator('#btnPause').click();
    await d.page.locator('#btnRestart').click();
    await d.page.waitForFunction(() => endfall.G.time < 1, null, { timeout: 5000 }); // a new game started
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
    const rax = await buildAndFinish(d, 'g', 'barracks', 0);
    const forge = await buildAndFinish(d, 'f', 'forge', 1);
    // The Garrison trains all four infantry and walkers once the Foundry stands; the Foundry only researches.
    await d.clickEntity(rax.id);
    await d.pressCard('Vanguard');
    let slots = await d.page.$$eval('#cmd > *', els => els.map(e => e.querySelector('.l')?.textContent || ''));
    assert.deepEqual(slots, ['Trooper', 'Lancer', 'Medic', 'Vanguard', 'Rally', 'Cancel'], 'the Garrison card');
    await d.page.locator('#cmd > :nth-child(6)').click(); // cancel the Vanguard
    assert.equal((await d.state()).bldgs.find(b => b.id === rax.id).queue.length, 0);
    await d.clickEntity(forge.id);
    assert.ok((await d.card()).some(c => c.label === 'Weapons I' && c.enabled), 'Weapons I offered');
    await d.pressCard('Weapons I');
    assert.match(await d.hudText('#mod', /Weapons I/), /Weapons I/);
    assert.ok(await d.page.locator('#mod .rs').isVisible(), 'the console shows the research with its bar');
    const r0 = await d.page.locator('#mod .res i').evaluate(e => parseFloat(e.style.width));
    await d.skip(4);
    await d.page.waitForFunction((w) => parseFloat(document.querySelector('#mod .res i').style.width) > w, r0, { timeout: 10000 }); // the bar moves
    assert.ok(await d.page.locator('#upg .up.on .ring').isVisible(), 'and the top bar shows it, whatever is selected');
    assert.ok((await d.card()).some(c => c.label === 'Armor I' && !c.enabled), 'one research at a time per forge');
    slots = await d.page.$$eval('#cmd > *', els => els.map(e => e.querySelector('.l')?.textContent || ''));
    assert.deepEqual(slots, ['Weapons I', 'Armor I', 'Cancel'], 'the Forge card: research and its cancel');
    const before = (await d.state()).res;
    await d.page.locator('#cmd > :nth-child(3)').click(); // cancel the research
    const after = (await d.state()).res;
    assert.ok(after[0] - before[0] >= 100 && after[1] - before[1] === 100, 'cancel refunds in full');
    await d.pressCard('Weapons I');
    await until(d, async () => (await d.eval(() => endfall.G.upgrades[0].weapons)) === 1, { seconds: 70, what: 'Weapons I' });
    await d.clickEntity(forge.id);
    assert.ok((await d.card()).some(c => c.label === 'Weapons II'), 'next level offered');
    const id = await d.eval(([x, y]) => endfall.engine.debugSpawn(0, 'trooper', x, y), [forge.x, forge.y + 90]);
    await d.clickEntity(id);
    assert.match(await d.hudText('#mod', /7\+1/), /7\+1/, 'trooper damage shows the bonus');
    assert.equal(await d.page.locator('#mod .st').count(), 3, 'a few figures: ground, air, armor');
    assert.match(await d.page.locator('#upg').textContent(), /I/, 'the top bar keeps the level once researched');
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
      if (d.touch) assert.deepEqual(await d.selection(), [], 'phone: after placing, the worker is let go');
      const max = await d.eval((id) => endfall.G.bldgs.find(b => b.id === id).maxhp, depot.id);
      await d.eval((id) => endfall.engine.debugSetHp(id, 60), depot.id); // set-up: knock it down
      // A mining harvester moves; a tap may miss it or pick a neighbour: retry, then follow the one selected.
      await d.key('Escape'); await d.key('Escape');
      let h = null;
      for (let i = 0; i < 4 && !h; i++) {
        await d.clickEntity(mine(await d.state(), 'harvester')[1 + i % 3].id);
        const sel = await d.selection();
        if (sel[0]?.type === 'harvester') h = sel[0];
      }
      assert.equal(h?.type, 'harvester');
      if (d.touch) { await d.pressCard('Repair'); await d.clickWorld(depot.x, depot.y); } else await d.rightClickWorld(depot.x, depot.y);
      assert.equal((await d.state()).units.find(u => u.id === h.id).task, 'repair', `${d.touch ? 'phone' : 'desktop'}: the harvester goes to repair`);
      if (d.touch) {
        // On a phone the harvester is let go once it has the job, so a tap on the map does not pull it off it.
        assert.equal((await d.selection()).length, 0, 'phone: released after the order');
        const st = await d.state();
        const [gx, gy] = [[220, 160], [-200, 180], [240, -160], [0, 260]].map(([dx, dy]) => [depot.x + dx, depot.y + dy])
          .find(([x, y]) => st.nodes.every(n => Math.hypot(n.x - x, n.y - y) > 80) && st.units.every(u => Math.hypot(u.x - x, u.y - y) > 60) && st.bldgs.every(b => Math.hypot(b.x - x, b.y - y) > 100));
        await d.clickWorld(gx, gy); // open ground
        assert.equal((await d.state()).units.find(u => u.id === h.id).task, 'repair', 'phone: a later tap does not redirect it');
      } else assert.equal((await d.selection())[0]?.id, h.id, 'desktop: the selection stays');
      const shards = (await d.state()).res[0];
      await d.skip(4);
      await d.clickEntity(depot.id);
      assert.match(await d.hudText('#selSub', /Repairing/), /Repairing/, 'the building shows it is being repaired');
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
      assert.match(await d.hudText('#selSub', /left/), new RegExp(`^${left} (shards )?left`), 'shows what is left');
      assert.equal((await d.card()).length, 0, 'nothing to command on a field');
      assert.match(await d.hudText('#selName', /Shard field/), /Shard field/);
      // Ether vents too (the player's own: in sight).
      const vent = s.nodes.filter(n => n.type === 'ether').sort((a, b) => Math.hypot(a.x - core.x, a.y - core.y) - Math.hypot(b.x - core.x, b.y - core.y))[0];
      await d.clickWorld(vent.x, vent.y);
      assert.deepEqual((await d.selection()).map(e => e.kind), ['node'], 'the vent is selected');
      assert.match(await d.hudText('#selName', /Ether vent/), /Ether vent/);
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

test('the menu: three fixed maps and a random one, the opponent and sound; the choices start the game', async () => {
  for (const device of [DESKTOP, PHONE]) {
    const ctx = await browserContext(device);
    const page = await ctx.newPage();
    try {
      await page.goto(baseUrl(), { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.endfall);
      const touch = !!device.hasTouch, press = (sel) => touch ? page.locator(sel).tap() : page.locator(sel).click();
      if (touch) {
        assert.ok(await page.locator('#btnPlay').isVisible(), 'phone: a tap-to-play screen first');
        await press('#btnPlay');
      }
      assert.deepEqual(await page.$$eval('#maps .map', bs => bs.map(b => b.textContent)), ['ASHEN BASIN', 'GLASS REACH', 'CINDER DIVIDE', 'RANDOM'], 'named maps, nothing given away');
      assert.equal(await page.locator('#maps .map.on').textContent(), 'ASHEN BASIN', 'the standard map is the default');
      assert.equal(await page.locator('#diff .ib.on').textContent(), 'EASY', 'new players start on Easy');
      assert.deepEqual(await page.$$eval('#diff .ib', bs => bs.map(b => b.textContent)), ['EASY', 'MEDIUM', 'HARD']);
      await press('#maps .map:nth-child(2)');
      await press('#diff [data-d="2"]');
      await press('#btnMenuSound');
      assert.equal(await page.locator('#btnMenuSound').textContent(), 'OFF');
      await press('#btnStart');
      await page.waitForFunction(() => endfall.G.units.length > 0);
      assert.deepEqual(await page.evaluate(() => [endfall.G.seed, endfall.G.diff, endfall.G.mapKind]), [1998, 2, 1], 'the chosen map (always the same layout, its hidden character) and opponent');
      assert.equal(await page.locator('#btnSound').getAttribute('aria-pressed'), 'false', 'sound off in the game too');
      // How to play is in the pause menu (no Help button in the top bar); the game waits; back to the pause menu.
      assert.equal(await page.locator('#btnHelp').count(), 0, 'no Help button in the top bar');
      await press('#btnPause'); await press('#btnPauseHelp');
      assert.ok(await page.locator('#help').isVisible(), 'How to play opens');
      const t0 = await page.evaluate(() => endfall.G.time); await page.waitForTimeout(600);
      assert.equal(await page.evaluate(() => endfall.G.time), t0, 'the game waits while help is open');
      await press('#btnHelpClose');
      assert.ok(await page.locator('#help').isHidden() && await page.locator('#pause').isVisible(), 'back to the pause menu');
      await press('#btnResume');
      // The choices are remembered.
      await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => !!window.endfall);
      if (touch) await press('#btnPlay');
      assert.equal(await page.locator('#diff .ib.on').getAttribute('data-d'), '2', 'opponent remembered');
      assert.equal(await page.locator('#btnMenuSound').textContent(), 'OFF', 'sound choice remembered');
      // The random map is a new one each game.
      await press('#maps .map:nth-child(4)'); await press('#btnStart');
      await page.waitForFunction(() => endfall.G.units.length > 0);
      assert.ok(![4242, 1998, 2077].includes(await page.evaluate(() => endfall.G.seed)), 'a freshly generated map');
    } finally { await ctx.close(); }
  }
});

test('a queued unit is cancelled with a click or tap on it, for a full refund', async () => {
  for (const device of [DESKTOP, PHONE]) {
    const d = await newGame(device, 1, 4242, { ai: false });
    try {
      await d.grant(1000, 0);
      const core = coreOf(await d.state());
      await d.clickEntity(core.id);
      await d.pressCard('Harvester'); await d.pressCard('Harvester'); await d.pressCard('Harvester');
      assert.equal((await d.state()).bldgs.find(b => b.id === core.id).queue.length, 3);
      const shards = (await d.state()).res[0];
      const box = '#queue';
      assert.equal(await d.page.locator(`${box} .qi`).count(), 3, `${d.touch ? 'phone' : 'desktop'}: the queue shows`);
      const second = d.page.locator(`${box} .qi[data-i="1"]`);
      await (d.touch ? second.tap() : second.click());
      const after = await d.state();
      assert.equal(after.bldgs.find(b => b.id === core.id).queue.length, 2, 'one unit cancelled');
      assert.ok(after.res[0] >= shards + 50, 'refunded');
      assert.equal(await d.page.locator(`${box} .qi`).count(), 2, 'the queue updates');
      assert.deepEqual(d.errors, []);
    } finally { await d.close(); }
  }
});

test('phone: a long-press on a command button shows what it is and costs, without pressing it', async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    const h = mine(await d.state(), 'harvester')[0];
    await d.clickEntity(h.id);
    await d.pressCard('Build'); await d.pressCard('Advanced'); // the Foundry is on the advanced page
    const forge = d.page.locator('#cmd button', { hasText: 'Foundry' });
    const b = await forge.boundingBox();
    const cdp = await d.page.context().newCDPSession(d.page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }] });
    await d.page.waitForTimeout(700);
    const info = d.page.locator('#cmdInfo');
    assert.ok(await info.isVisible(), 'details show while held');
    const text = await info.textContent();
    assert.match(text, /Foundry/); assert.match(text, /150/); assert.match(text, /Requires Garrison/);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await d.page.waitForTimeout(150);
    assert.equal(await d.eval(() => endfall.ui.place), null, 'the long-press did not start placing a Forge');
    await info.waitFor({ state: 'hidden', timeout: 5000 }); // the details go a moment after the finger lifts
    // Hold a greyed-out button while the money arrives (the card is rebuilt under the finger): no error, no press.
    await d.grant(0, 0);
    await d.pressCard('Back'); // to the basic page
    const depot = await d.page.locator('#cmd button', { hasText: 'Depot' }).boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: depot.x + depot.width / 2, y: depot.y + depot.height / 2 }] });
    await d.page.waitForTimeout(200); await d.grant(5000, 5000); await d.page.waitForTimeout(500);
    assert.ok(await info.isVisible(), 'details still show after the rebuild');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await info.waitFor({ state: 'hidden', timeout: 5000 }); // and go after the lift
    assert.equal(await d.eval(() => endfall.ui.place), null, 'no Depot placement started');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

/** Every box inside the selection console lies within it (nothing spills out or is cut off). */
async function insideConsole(d, sel) {
  const box = await d.page.locator('#info').boundingBox();
  for (const b of await d.page.locator(sel).evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, c: e.className || e.id }; }).filter(b => b.w > 0))) // (hidden ones are fine)
    assert.ok(b.x >= box.x - 1 && b.y >= box.y - 1 && b.x + b.w <= box.x + box.width + 1 && b.y + b.h <= box.y + box.height + 1, `${b.c} inside the console: ${JSON.stringify(b)} vs ${JSON.stringify(box)}`);
}

for (const [label, device] of [['phone', PHONE], ['small phone', { ...PHONE, viewport: { width: 667, height: 375 } }]]) {
  test(`${label}: the console fits a full queue, a turret's figures and long names`, async () => {
    const d = await newGame(device, 1, 4242, { ai: false });
    try {
      await d.grant(5000, 5000);
      const core = coreOf(await d.state());
      await d.clickEntity(core.id);
      for (let i = 0; i < 5; i++) await d.pressCard('Harvester');
      assert.equal(await d.page.locator('#queue .qi').count(), 5);
      await insideConsole(d, '#queue .qi, #queue .prod, #selPor, #hpNum');
      const id = await d.eval(([x, y]) => endfall.engine.debugSpawn(0, 'trooper', x, y), [core.x + 140, core.y + 140]);
      await d.clickEntity(id);
      await insideConsole(d, '#mod .st, #hpNum, #selName');
      assert.deepEqual(d.errors, []);
    } finally { await d.close(); }
  });
}

test('a box over units and buildings selects only the units, and only the fighters among them', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    await d.skip(5);
    const core = coreOf(await d.state());
    await d.boxSelect(core.x - 30, core.y - 30, core.x + 150, core.y + 90); // the Core and the harvesters beside it
    const sel = await d.selection();
    assert.ok(sel.length >= 1 && sel.every(e => e.kind === 'unit'), `units only: ${JSON.stringify(sel)}`);
    await d.boxSelect(core.x - 20, core.y - 20, core.x + 20, core.y + 20); // the Core alone
    assert.deepEqual((await d.selection()).map(e => e.type), ['core'], 'a box with no units selects the building');
    // A soldier among the workers: the box takes the soldier only.
    const id = await d.eval(([x, y]) => endfall.engine.debugSpawn(0, 'trooper', x, y), [core.x + 100, core.y + 40]);
    await d.boxSelect(core.x - 30, core.y - 30, core.x + 150, core.y + 90);
    assert.deepEqual((await d.selection()).map(e => e.id), [id], 'fighters in the box: the workers are left out');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: three buttons a row; the Build list has a basic and an advanced page; an armed order turns into Cancel', async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    await d.grant(5000, 5000);
    assert.ok(await d.page.locator('#info').isHidden(), 'no console with nothing selected');
    const h = mine(await d.state(), 'harvester')[0];
    await d.clickEntity(h.id);
    await d.pressCard('Build');
    assert.deepEqual((await d.card()).map(c => c.label), ['Depot', 'Garrison', 'Ether Rig', 'Turret', 'Advanced', 'Back'], 'the basic page');
    await d.pressCard('Depot');
    assert.equal((await d.card())[0].label, 'Cancel', 'placing: the Build button is Cancel');
    await d.pressCard('Cancel');
    assert.equal(await d.eval(() => endfall.ui.place), null, 'and it stops the placing');
    await d.pressCard('Build');
    await d.pressCard('Advanced');
    assert.deepEqual((await d.card()).map(c => c.label), ['Foundry', 'Airfield', 'Core', 'Back'], 'the advanced page');
    await d.pressCard('Back');
    assert.ok((await d.card()).some(c => c.label === 'Depot'), 'back to the basic page');
    await d.pressCard('Back');
    const cols = await d.page.$$eval('#cmd > *', els => new Set(els.map(e => Math.round(e.getBoundingClientRect().x))).size);
    assert.equal(cols, 3, 'three columns');
    await d.pressCard('Gather');
    let card = await d.card();
    assert.deepEqual(card.map(c => c.label), ['Build', 'Cancel', 'Repair', 'Attack', 'Hold', 'Deselect'], 'Gather armed: its button is Cancel, in place');
    await d.pressCard('Cancel');
    assert.equal(await d.eval(() => endfall.ui.mode), null, 'Cancel disarms');
    await d.pressCard('Deselect');
    assert.deepEqual(await d.selection(), [], 'Deselect lets go of the harvester');
    assert.ok(await d.page.locator('#info').isHidden(), 'and the console goes');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: a site that loses its builder says so once; no keyboard letters; group tiles by type', async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    await d.grant(2000, 0);
    const s = await d.state(), core = coreOf(s), h = mine(s, 'harvester')[0];
    const spot = await d.findSpot('depot', { tx: core.tx + 1, ty: core.ty + 1 });
    await d.buildWithUI('d', 'depot', spot.tx, spot.ty, h.id);
    await d.skip(2);
    // Pull the builder off: select it and send it to a shard field.
    const node = (await d.state()).nodes.filter(n => n.type === 'shard').sort((a, b) => Math.hypot(a.x - core.x, a.y - core.y) - Math.hypot(b.x - core.x, b.y - core.y))[0];
    await d.clickEntity(h.id); await d.clickWorld(node.x, node.y);
    await until(d, async () => (await d.toasts()).some(t => /paused: no builder/.test(t)), { seconds: 6, what: 'the paused-site toast' });
    await d.skip(3);
    assert.ok((await d.toasts()).filter(t => /paused: no builder/.test(t)).length <= 1, 'never stacked');
    assert.equal(await d.page.locator('#cmd .cb .k').first().isVisible().catch(() => false), false, 'no keyboard letters on touch');
    // A mixed army: one tile per type with its count, inside the console.
    await d.eval(([x, y]) => { for (let i = 0; i < 10; i++) endfall.engine.debugSpawn(0, 'trooper', x + (i % 5) * 22, y + Math.floor(i / 5) * 22); for (let i = 0; i < 2; i++) endfall.engine.debugSpawn(0, 'lancer', x + i * 22, y + 50); }, [core.x + 160, core.y + 150]);
    await d.page.locator('#btnArmy').tap();
    await d.page.waitForTimeout(400);
    assert.deepEqual(await d.page.$$eval('#group .gt b', bs => bs.map(b => b.textContent)), ['10', '2'], 'Troopers x10, Lancers x2');
    await insideConsole(d, '#group .gt');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('offline: once loaded, the game opens and plays with no connection', async () => {
  const ctx = await browserContext(DESKTOP);
  const page = await ctx.newPage();
  try {
    await page.goto(baseUrl() + '?seed=4242', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
    await page.waitForFunction(async () => (await caches.keys()).some(k => k.startsWith('endfall-')), null, { timeout: 30000 });
    await ctx.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    await page.locator('#btnStart').click();
    await page.waitForFunction(() => endfall.G.units.length > 0);
    assert.ok(await page.evaluate(() => endfall.G.bldgs.some(b => b.team === 0 && b.type === 'core')), 'a game started offline');
  } finally { await ctx.close(); }
});

test('phone held upright: a card asks to turn it, the game pauses, and turning back shows Resume', async () => {
  const d = await newGame(PHONE, 0, 4242, { ai: false });
  try {
    assert.ok(await d.page.locator('#rotate').isHidden(), 'no card in landscape');
    await d.page.evaluate(() => document.fullscreenElement && document.exitFullscreen()); // (a full-screen window cannot be resized)
    await d.page.setViewportSize({ width: 390, height: 844 }); // turned upright
    await d.page.locator('#rotate').waitFor({ state: 'visible', timeout: 5000 });
    await d.page.locator('#pause').waitFor({ state: 'visible', timeout: 5000 }); // the game paused (the media-query change may land a frame later)
    const t0 = await d.eval(() => endfall.G.time);
    await d.page.waitForTimeout(600);
    assert.equal(await d.eval(() => endfall.G.time), t0, 'no game time passes while upright');
    await d.page.setViewportSize({ width: 844, height: 390 }); // back to landscape
    await d.page.locator('#rotate').waitFor({ state: 'hidden', timeout: 5000 });
    await d.page.locator('#btnResume').tap();
    await d.page.waitForFunction((t0) => endfall.G.time > t0, t0, { timeout: 5000 }); // (throws if time stays still)
    // Rotation locked: the card offers to play upright anyway.
    await d.page.setViewportSize({ width: 390, height: 844 });
    await d.page.locator('#btnUpright').tap();
    assert.ok(await d.page.locator('#rotate').isHidden(), 'the card goes');
    assert.ok(await d.page.locator('#pause').isHidden(), 'and the game the turn paused resumes (one tap)');
    const t1 = await d.eval(() => endfall.G.time);
    await d.page.waitForFunction((t1) => endfall.G.time > t1, t1, { timeout: 5000 }); // the game runs upright
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('the menu offers the Vael: their base, workers and Build list', async () => {
  const ctx = await browserContext(DESKTOP);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(baseUrl() + '?seed=4242', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall);
    await page.locator('#race [data-race="vael"]').click();
    assert.equal(await page.locator('#enemy .ib.on').textContent(), 'HUMANS', 'the opponent is human unless chosen');
    await page.locator('#btnStart').click();
    await page.waitForFunction(() => endfall.G.units.length > 0);
    const mine = await page.evaluate(() => ({ b: endfall.G.bldgs.filter(b => b.team === 0).map(b => b.type), u: [...new Set(endfall.G.units.filter(u => u.team === 0).map(u => u.type))], f: endfall.G.factions }));
    assert.deepEqual(mine.b, ['conflux']); assert.deepEqual(mine.u, ['lumen']); assert.deepEqual(mine.f, ['vael', 'humans'], 'the AI plays the humans');
    await page.evaluate(() => { endfall.ui.sel = endfall.G.units.filter(u => u.team === 0).slice(0, 1); endfall.ui.mode = 'build'; });
    await page.waitForFunction(() => [...document.querySelectorAll('#cmd button .l')].some(l => l.textContent === 'Spire'), null, { timeout: 10000 }); // (the card redraws on the next frame)
    const labels = await page.$$eval('#cmd button .l', ls => ls.map(l => l.textContent));
    assert.deepEqual(labels, ['Spire', 'Kiln', 'Siphon', 'Ward', 'Advanced', 'Back'], 'the Vael Build list');
    await page.evaluate(() => { endfall.ui.mode = null; });
    await page.waitForFunction(() => ![...document.querySelectorAll('#cmd button .l')].some(l => l.textContent === 'Spire'), null, { timeout: 10000 });
    assert.ok(await page.locator('#shBar').isVisible(), 'a Lumen shows its shields over its hull');
    const card = await page.$$eval('#cmd button .l', ls => ls.map(l => l.textContent));
    assert.ok(!card.includes('Repair'), `the Vael do not repair: ${card}`);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('phone: as the Vael, a Lumen plants a Spire and is free at once; the seed grows by itself', async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false, race: 'vael' });
  try {
    await d.grant(1000, 0);
    const s = await d.state(), hq = s.bldgs.find(b => b.team === 0 && b.type === 'conflux');
    const lumen = s.units.find(u => u.team === 0 && u.type === 'lumen');
    const spot = await d.findSpot('spire', { tx: hq.tx + 1, ty: hq.ty + 1 });
    await d.buildWithUI('s', 'spire', spot.tx, spot.ty, lumen.id);
    const spire = () => d.state().then(st => st.bldgs.find(b => b.team === 0 && b.type === 'spire'));
    await until(d, async () => (await spire())?.planted, { seconds: 20, what: 'the Spire to be planted' });
    assert.notEqual((await d.state()).units.find(u => u.id === lumen.id).task.t, 'build', 'the Lumen went back to work');
    await d.clickEntity((await spire()).id);
    assert.match(await d.hudText('#selSub', /Growing/), /Growing/, 'the seed grows by itself');
    await until(d, async () => (await spire())?.done, { seconds: 40, what: 'the Spire to finish' });
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('the menu can pit you against a Vael opponent', async () => {
  const ctx = await browserContext(DESKTOP);
  const page = await ctx.newPage();
  try {
    await page.goto(baseUrl() + '?seed=4242', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall);
    await page.locator('#enemy [data-race="vael"]').click();
    await page.locator('#btnStart').click();
    await page.waitForFunction(() => endfall.G.units.length > 0);
    assert.deepEqual(await page.evaluate(() => endfall.G.factions), ['humans', 'vael']);
    assert.deepEqual(await page.evaluate(() => endfall.G.bldgs.filter(b => b.team === 1).map(b => b.type)), ['conflux'], 'the enemy starts with a Conflux');
  } finally { await ctx.close(); }
});

test('phone: placing a building lets the worker go; a tap on a blocked spot gives up placing', async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    await d.grant(5000, 5000);
    let s = await d.state();
    const core = coreOf(s), h = mine(s, 'harvester')[0];
    // A tap on the Core (blocked) while placing a Depot: told why, placing stops, the worker stays selected.
    await d.clickEntity(h.id);
    await d.pressCard('Build'); await d.pressCard('Depot');
    await d.clickWorld(core.x, core.y);
    assert.equal(await d.eval(() => endfall.ui.place), null, 'a blocked tap gives up placing');
    assert.match((await d.toasts()).join(' | '), /Cannot build there/);
    assert.deepEqual((await d.selection()).map(e => e.id), [h.id], 'the worker is still selected');
    // A good spot: the site is placed and the worker let go, so it is clear the order took.
    const spot = await d.findSpot('depot', { tx: core.tx + 1, ty: core.ty + 1 });
    await d.buildWithUI('d', 'depot', spot.tx, spot.ty, h.id);
    s = await d.state();
    assert.ok(myBldg(s, 'depot').some(b => b.tx === spot.tx && b.ty === spot.ty), 'the Depot site is placed');
    assert.deepEqual(await d.selection(), [], 'the worker is let go after placing');
    assert.equal(s.units.find(u => u.id === h.id).task, 'build', 'and it goes to build');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: a building that trains keeps its Cancel in one place, greyed out with nothing queued', async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    await d.grant(5000, 5000);
    await d.clickEntity(coreOf(await d.state()).id);
    let card = await d.card();
    assert.deepEqual(card.map(c => c.label), ['Harvester', 'Rally', 'Cancel'], 'Cancel is there before anything is queued');
    assert.equal(card[2].enabled, false, 'greyed out');
    const slot = () => d.eval(() => endfall.cardItems().find(i => i.id === 'cancelq')?.slot);
    const before = await slot();
    await d.pressCard('Harvester');
    card = await d.card();
    assert.equal(card.find(c => c.label === 'Cancel').enabled, true, 'it lights up with a unit queued');
    assert.equal(await slot(), before, 'in the same place');
    await d.pressCard('Rally');
    assert.equal(await slot(), before, 'and while Rally is armed (greyed out, the card keeps its shape)');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: with a worker selected, a tap on a field where another worker stands sends it to gather there', async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    // A worker in the middle of mining: it stands at its field's edge.
    const busy = () => d.eval(() => endfall.G.units.find(u => u.team === 0 && u.task.t === 'gather' && u.task.phase === 'mine')?.id);
    const minerId = await until(d, busy, { seconds: 20, step: 0.2, what: 'a worker mining' });
    let s = await d.state();
    const miner = s.units.find(u => u.id === minerId);
    const nodeId = await d.eval((id) => endfall.G.units.find(u => u.id === id).task.node.id, minerId);
    const node = s.nodes.find(n => n.id === nodeId);
    // A worker sent off to the other side, so it is not mining that field already.
    const h = s.units.find(u => u.team === 0 && u.type === 'harvester' && u.id !== miner.id);
    await d.eval(([id, x, y]) => endfall.engine.moveTo(endfall.G.units.find(u => u.id === id), x, y), [h.id, node.x - 260, node.y]); // (set-up)
    await d.clickEntity(h.id);
    assert.deepEqual((await d.selection()).map(e => e.id), [h.id]);
    // Tap inside the field's edge, beside the miner (close enough that a plain pick would take the miner): the field
    // wins.
    const m = (await d.state()).units.find(u => u.id === miner.id), k = Math.hypot(m.x - node.x, m.y - node.y);
    await d.clickWorld(node.x + (m.x - node.x) / k * node.r, node.y + (m.y - node.y) / k * node.r);
    s = await d.state();
    assert.equal(s.units.find(u => u.id === h.id).task, 'gather', 'the selected worker goes to gather');
    assert.ok(!(await d.selection()).some(e => e.id === miner.id), 'the miner was not selected instead');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('a Vael unit\'s health figure counts hull and shields together', async () => {
  const d = await newGame(DESKTOP, 0, 4242, { ai: false, race: 'vael' });
  try {
    const hq = (await d.state()).bldgs.find(b => b.team === 0);
    const id = await d.eval(([x, y]) => endfall.engine.debugSpawn(0, 'scythe', x, y), [hq.x + 150, hq.y + 110]);
    await d.clickEntity(id);
    const total = await d.eval(() => endfall.engine.UNITS.scythe.hp + endfall.engine.UNITS.scythe.shields);
    assert.equal(await d.hudText('#hpNum', new RegExp(`^${total}/${total}$`)), `${total}/${total}`, 'hull + shields, over both maxima');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: one tap on the card uses an ability for the selection (Stim, then Entrench as a toggle)', async () => {
  const d = await newGame(PHONE, 0, 4242, { ai: false });
  try {
    const core = coreOf(await d.state());
    const ids = await d.eval(([x, y]) => [0, 1, 2].map(i => endfall.engine.debugSpawn(0, 'trooper', x + i * 26, y)), [core.x + 180, core.y + 120]);
    const v = await d.eval(([x, y]) => endfall.engine.debugSpawn(0, 'vanguard', x, y), [core.x + 180, core.y + 200]);
    await d.boxSelect(core.x + 150, core.y + 90, core.x + 260, core.y + 150); // (the troopers only)
    const units = () => d.eval((ids) => endfall.G.units.filter(u => ids.includes(u.id)).map(u => ({ hp: u.hp, boost: u.boost, mode: u.mode })), [...ids, v]);
    assert.deepEqual((await d.selection()).map(e => e.id).sort(), ids.slice().sort());
    await d.pressCard('Stim');
    const after = await units();
    assert.ok(after.slice(0, 3).every(u => u.boost === 'stim' && u.hp === 38), `all three stimmed for 10 health: ${JSON.stringify(after)}`);
    // The Vanguard: Entrench is a toggle, lit while on; a second tap packs it up.
    await d.clickEntity(v);
    await d.pressCard('Entrench');
    assert.equal((await units())[3].mode, 'entrench');
    await d.skip(3);
    assert.ok((await d.card()).some(c => c.label === 'Entrench'), 'the button stays');
    assert.ok(await d.page.locator('#cmd button.active', { hasText: 'Entrench' }).count(), 'lit while entrenched');
    await d.pressCard('Entrench');
    assert.equal((await units())[3].mode, null, 'packed up');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});
