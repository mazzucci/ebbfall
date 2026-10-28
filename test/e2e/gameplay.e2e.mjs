// End-to-end gameplay through the real UI in a headless browser (Chromium; ENDFALL_ENGINE=webkit or firefox runs the
// scenarios marked `engines: true` there). Run: npm run build && npm run test:e2e
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { test, start, stop, newGame, until, browserContext, baseUrl, board, DESKTOP, PHONE, CDP_TOUCH, ENGINE, notIn, ESC_LEAVES_FULL_SCREEN, IPHONE } from './harness.mjs';

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

/** The 128x128 maps the menus offer (src/client/maps.js), as their buttons read. */
const MAPS_128 = ['IRON COMPASS', 'SUNKEN COURT', 'GREY WARRENS', 'RANDOM'];

test('a depot built through the UI finishes and raises supply', { engines: true }, async () => {
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

test('phone: tap selects, the command card works, the HUD shows status, back asks before leaving', { engines: true }, async () => {
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
    const vh = await d.eval(() => innerHeight); // (390, or more where full screen takes the whole display: Firefox)
    assert.ok(info.height <= 70 && info.y + info.height <= vh && info.y >= vh - 80, `low, at the bottom of the screen: ${JSON.stringify(info)} in ${vh}`);
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

test('a whole game against the AI runs to the end without errors', { engines: true }, async () => {
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
    // A second attack far from the first: Space looks at it, then back at the first.
    const core = coreOf(s), far = { x: core.x > 1000 ? core.x - 640 : core.x + 640, y: core.y };
    await d.eval(([x, y]) => { endfall.engine.debugSpawn(0, 'trooper', x, y); endfall.engine.debugSpawn(1, 'trooper', x + 50, y); }, [far.x, far.y]);
    await d.centerOn(1800, 1800);
    await until(d, async () => d.eval((fx) => endfall.G.units.some(u => u.team === 0 && Math.abs(u.x - fx) < 200 && u.hp < u.maxhp), far.x), { seconds: 10, step: 1, what: 'the second attack' });
    await d.page.waitForTimeout(600); // (a frame or two: its alert reaches the client)
    // In view (the camera stops at the map's edge, so not necessarily centred).
    const inView = (p) => d.eval((p) => { const c = endfall.cam, v = endfall.view; return p.x > c.x && p.x < c.x + v.w / c.zoom && p.y > c.y && p.y < c.y + v.h / c.zoom; }, p);
    await d.key(' ');
    assert.ok(await inView(far) && !(await inView(spot)), 'the newest attack first');
    await d.key(' ');
    assert.ok(await inView(spot), 'then the one before');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('the army chip, the idle-harvester key, and double-click selects all of a type on screen', { skip: notIn(['webkit', 'firefox'], ESC_LEAVES_FULL_SCREEN) }, async () => {
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
    await d.key('.'); // (no chip on screen: the key, or select one on the map)
    const picked = await d.eval(() => endfall.ui.sel.map(u => ({ type: u.type, task: u.task.t })));
    assert.deepEqual(picked, [{ type: 'harvester', task: 'idle' }], 'the . key selects an idle harvester');
    // Double-click one trooper (two clicks on one precomputed point, back to back): all three are selected.
    await d.key('Escape');
    const [px, py] = await d.screen((await d.state()).units.find(u => u.id === ids[0]).x, (await d.state()).units.find(u => u.id === ids[0]).y);
    await d.page.mouse.click(px, py); await d.page.mouse.click(px, py);
    assert.equal((await d.selection()).filter(u => u.type === 'trooper').length, 3, 'double-click selects all troopers on screen');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('pause stops the game, BACK TO GAME (or P) goes on, and restart begins a new one', async () => {
  const d = await newGame(DESKTOP);
  try {
    await d.page.waitForFunction(() => endfall.G.time > 1);
    await d.key('p');
    assert.ok(await d.page.locator('#pause').isVisible());
    assert.deepEqual([await d.page.locator('#pause h2').textContent(), await d.page.locator('#btnResume').textContent()], ['Paused', 'BACK TO GAME']);
    const t0 = await d.eval(() => endfall.G.time);
    await d.page.waitForTimeout(1200);
    assert.equal(await d.eval(() => endfall.G.time), t0, 'no game time passes while paused');
    await d.key('p');
    assert.ok(!(await d.page.locator('#pause').isVisible()), 'P resumes');
    await d.page.waitForFunction((t0) => endfall.G.time > t0, t0, { timeout: 5000 }); // (throws if time stays still)
    await d.page.locator('#btnPause').click();
    const t1 = await d.eval(() => endfall.G.time);
    await d.page.locator('#btnResume').click();
    assert.ok(await d.page.locator('#pause').isHidden(), 'BACK TO GAME closes the card');
    await d.page.waitForFunction((t1) => endfall.G.time > t1, t1, { timeout: 5000 });
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
    assert.ok((await d.card()).some(c => c.label === 'Armor I' && !c.enabled), 'one research at a time per forge');
    slots = await d.page.$$eval('#cmd > *', els => els.map(e => e.querySelector('.l')?.textContent || ''));
    assert.deepEqual(slots.filter(Boolean), ['Weapons I', 'Armor I', 'Cancel', 'Entrench', 'Cloak Field', 'Rapid Build'], 'the Forge card: research and its cancel, the techs below');
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
    // A Trooper's Stim is there from the start; a Vanguard's Entrench waits for Entrenching, researched at the Foundry.
    assert.ok((await d.card()).some(c => c.label === 'Stim' && c.enabled), 'Stim from the start');
    const v = await d.eval(([x, y]) => endfall.engine.debugSpawn(0, 'vanguard', x, y), [forge.x + 60, forge.y + 90]);
    await d.clickEntity(v);
    assert.ok((await d.card()).some(c => c.label === 'Entrench' && !c.enabled), 'Entrench locked');
    await d.pressCard('Entrench');
    assert.ok((await d.toasts()).some(t => /Research Entrenching first/.test(t)), 'it says which tech');
    await d.grant(500, 500);
    await d.clickEntity(forge.id);
    await d.pressCard('Entrench'); // (the tech's short label on the Foundry)
    await until(d, async () => (await d.eval(() => endfall.G.upgrades[0].entrenching)) === 1, { seconds: 90, what: 'Entrenching' });
    await d.clickEntity(forge.id);
    assert.ok(!(await d.card()).some(c => c.label === 'Entrench'), 'a finished tech leaves the card');
    await d.clickEntity(v);
    assert.ok((await d.card()).some(c => c.label === 'Entrench' && c.enabled), 'Entrench unlocked');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: Rapid Construction researched at the Foundry, then buildings go up faster', { chromium: CDP_TOUCH }, async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    await d.grant(5000, 5000);
    await buildAndFinish(d, 'g', 'barracks', 0);
    const forge = await buildAndFinish(d, 'f', 'forge', 1);
    const core = coreOf(await d.state()), rate = await d.eval(() => endfall.engine.TECH_BUILD);
    const pct = Math.round((rate - 1) * 100);
    await d.clickEntity(forge.id);
    // The Foundry's card keeps its fixed slots on a phone: two levels, Cancel's place, then its three techs.
    const slots = await d.page.$$eval('#cmd > *', els => els.map(e => e.querySelector('.l')?.textContent || ''));
    assert.deepEqual(slots, ['Weapons I', 'Armor I', '', 'Entrench', 'Cloak Field', 'Rapid Build'], 'the Foundry card');
    const vp = d.page.viewportSize(), box = await d.page.locator('#cmd button', { hasText: 'Rapid Build' }).boundingBox();
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width && box.y + box.height <= vp.height, 'it fits on the screen');
    // A long-press says what it does and costs, without researching it.
    const cdp = await d.page.context().newCDPSession(d.page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    await d.page.waitForTimeout(700);
    const text = await d.page.locator('#cmdInfo').textContent();
    assert.match(text, /Rapid Build/); assert.match(text, new RegExp(`Buildings go up ${pct}% faster`)); assert.match(text, /100/); assert.match(text, /60 s/);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await d.page.waitForTimeout(150);
    assert.equal(await d.eval((id) => !!endfall.G.bldgs.find(b => b.id === id).research, forge.id), false, 'the long-press did not research it');
    // A tap researches it: paid for, the console shows it with its bar, Cancel in its row.
    const res = (await d.state()).res;
    await d.pressCard('Rapid Build');
    const paid = (await d.state()).res;
    assert.ok(paid[1] === res[1] - 100 && paid[0] <= res[0] - 100 + 40, `it costs 100 shards and 100 ether (${res} -> ${paid}; shards still come in)`);
    assert.match(await d.hudText('#mod', /Rapid Construction/), /Rapid Construction/);
    assert.ok(await d.page.locator('#mod .rs').isVisible(), 'the console shows the research with its bar');
    const r0 = await d.page.locator('#mod .res i').evaluate(e => parseFloat(e.style.width));
    await d.skip(4);
    await d.page.waitForFunction((w) => parseFloat(document.querySelector('#mod .res i').style.width) > w, r0, { timeout: 10000 }); // the bar moves
    const busy = await d.page.$$eval('#cmd > *', els => els.map(e => e.querySelector('.l')?.textContent || ''));
    assert.deepEqual(busy, ['Weapons I', 'Armor I', 'Cancel', 'Entrench', 'Cloak Field', 'Rapid Build'], 'the card keeps its shape');
    assert.ok((await d.card()).some(c => c.label === 'Weapons I' && !c.enabled), 'one research at a time');
    await until(d, async () => (await d.eval(() => endfall.G.upgrades[0].rapidConstruction)) === 1, { seconds: 70, what: 'Rapid Construction' });
    await d.clickEntity(forge.id);
    assert.ok(!(await d.card()).some(c => c.label === 'Rapid Build'), 'a finished tech leaves the card');
    // A Depot (22 s) now goes up faster: a tick of work is rate / 22 of a second's worth (read tick by tick in one go).
    const s = await d.state();
    const spot = await d.findSpot('depot', { tx: core.tx + 1, ty: core.ty + 1 });
    await d.buildWithUI('d', 'depot', spot.tx, spot.ty, mine(s, 'harvester')[2].id);
    const site = () => d.state().then(s => s.bldgs.find(b => b.type === 'depot' && b.tx === spot.tx && b.ty === spot.ty));
    await until(d, async () => (await site())?.progress > 0, { seconds: 30, step: 1, what: 'the builder at work' });
    const steps = await d.eval(([tx, ty]) => {
      const p = () => endfall.G.bldgs.find(b => b.type === 'depot' && b.tx === tx && b.ty === ty).progress, out = [];
      for (let i = 0; i < 30; i++) { const p0 = p(); endfall.skip(1 / 30); out.push(p() - p0); }
      return out;
    }, [spot.tx, spot.ty]);
    const step = Math.max(...steps);
    assert.ok(Math.abs(step - rate / 30 / 22) < 1e-9, `a tick of work: ${step} (${1 / 30 / 22} without the tech)`);
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

test('harvesters repair a damaged building (right-click on desktop, the Repair button on a phone)', { chromium: CDP_TOUCH }, async () => {
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

test('control groups: Ctrl+number saves the selection, the number recalls it, a tab shows the saved group', { skip: notIn(['webkit', 'firefox'], ESC_LEAVES_FULL_SCREEN) }, async () => {
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

test('the menu: three fixed maps and a random one, the opponent and sound; the choices start the game', { engines: true }, async () => {
  for (const device of [DESKTOP, PHONE]) {
    const ctx = await browserContext(device);
    const page = await ctx.newPage();
    try {
      await page.goto(baseUrl(), { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.endfall);
      const touch = !!device.hasTouch, press = (sel) => touch ? page.locator(sel).tap() : page.locator(sel).click();
      assert.ok(await page.locator('#start').isVisible(), 'straight to the menu (no tap-to-play screen)');
      await press('#btnSolo');
      assert.deepEqual(await page.$$eval('#maps .map', bs => bs.map(b => b.textContent)), ['ASHEN BASIN', 'GLASS REACH', 'CINDER DIVIDE', 'RANDOM'], 'named maps, nothing given away');
      assert.equal(await page.locator('#maps .map.on').textContent(), 'ASHEN BASIN', 'the standard map is the default');
      // The opponent's difficulty: in its token's sheet (PLAYS), with what the level means under it.
      await board(page).open(1);
      assert.deepEqual(await page.$$eval('#soloSheet [data-k^="diff:"]', bs => bs.map(b => b.textContent)), ['EASY', 'MEDIUM', 'HARD', 'BRUTAL']);
      assert.equal(await page.locator('#soloSheet [data-k^="diff:"].on').textContent(), 'EASY', 'new players start on Easy');
      const level = touch ? 3 : 2; // (Hard on the desktop, Brutal on the phone)
      await press(`#soloSheet [data-k="diff:${level}"]`);
      assert.match(await page.locator('#soloSheet .hint').textContent(), touch ? /30% more/ : /whole game/, 'the level in a line');
      await press('#soloSheet [data-k="done"]');
      assert.ok(await page.locator('#soloSheet').isHidden(), 'DONE closes the sheet');
      await press('#maps .map:nth-child(2)');
      await press('#btnMenuSound'); // (the speaker in the corner)
      assert.equal(await page.locator('#btnMenuSound').getAttribute('aria-pressed'), 'false');
      await press('#btnStart');
      await page.waitForFunction(() => endfall.G.units.length > 0);
      assert.deepEqual(await page.evaluate(() => [endfall.G.seed, endfall.G.diff, endfall.G.mapKind]), [1998, level, 1], 'the chosen map (always the same layout, its hidden character) and opponent');
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
      assert.ok(await page.locator('#menuHome').isVisible() && await page.locator('#menuSolo').isHidden(), 'the menu opens on its first page');
      await press('#btnSolo');
      assert.match(await page.locator('#soloBoard [data-k="tok1"]').getAttribute('aria-label'), touch ? /Brutal/ : /Hard/, 'opponent remembered');
      assert.equal(await page.locator('#soloBoard [data-k="tok1"] .lvl i.on').count(), level + 1, 'its level as pips');
      assert.equal(await page.locator('#btnMenuSound').getAttribute('aria-pressed'), 'false', 'sound choice remembered');
      // The random map is a new one each game.
      await press('#maps .map:nth-child(4)'); await press('#btnStart');
      await page.waitForFunction(() => endfall.G.units.length > 0);
      assert.ok(![4242, 1998, 2077].includes(await page.evaluate(() => endfall.G.seed)), 'a freshly generated map');
    } finally { await ctx.close(); }
  }
});

test('the menu opens on two modes; each opens its page, BACK returns; the sound icon on every page; YOU can be RANDOM', { engines: true, skip: notIn(['webkit'], 'it checks where the focus goes, and a headless WebKit page moves it only while it has the window\'s focus (now and then)') }, async () => {
  for (const device of [DESKTOP, PHONE]) {
    const ctx = await browserContext(device), page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    try {
      await page.goto(baseUrl(), { waitUntil: 'networkidle' }); // (on this machine the dev relay's address is known)
      await page.waitForFunction(() => !!window.endfall);
      const press = (sel) => device.hasTouch ? page.locator(sel).tap() : page.locator(sel).click();
      const shown = (sel) => page.locator(sel).isVisible();
      assert.ok(await shown('#menuHome') && await page.locator('#menuSolo').isHidden(), 'the first page');
      assert.deepEqual(await page.$$eval('#menuHome .mode', bs => bs.map(b => b.textContent)), ['SINGLE PLAYER', 'MULTIPLAYER'], 'two modes');
      assert.ok(await shown('#btnHowTo') && !(await shown('#btnStart')) && !(await shown('#soloBoard')), 'How to play there; the game\'s choices are not');
      assert.ok(await shown('#btnMenuSound'), 'the sound icon on the first page');
      assert.deepEqual(await page.$$eval('#menuHome .row .ib:not([hidden])', bs => bs.map(b => b.textContent)), ['FIRST GAME', 'HOW TO PLAY', 'ABOUT'], 'a newcomer: FIRST GAME there too');
      // ABOUT: a page of a few lines, the source and the device check, the version; BACK.
      await press('#btnAbout');
      assert.ok(await shown('#menuAbout') && await page.locator('#menuHome').isHidden() && await shown('#btnMenuSound'), 'About opens, the sound icon still there');
      assert.equal(await page.locator('#menuAbout h2').textContent(), 'ABOUT');
      const src = page.locator('#srcLink');
      assert.deepEqual([await src.textContent(), await src.getAttribute('href'), await src.getAttribute('target'), await src.getAttribute('rel')], ['Source code on GitHub', 'https://github.com/mazzucci/ebbfall', '_blank', 'noopener']);
      assert.equal(await page.locator('#checkLink').getAttribute('href'), './selftest.html');
      assert.match(await page.locator('#buildId').textContent(), /^[0-9a-f]{12}$/, 'the version: the build online play compares');
      await press('#btnAboutBack');
      assert.ok(await shown('#menuHome') && await page.locator('#menuAbout').isHidden(), 'BACK: the first page');
      // SINGLE PLAYER: its page, the sides board (YOU on your side, AI 1 the enemy), no SOUND row; BACK.
      await press('#btnSolo');
      assert.ok(await shown('#menuSolo') && await page.locator('#menuHome').isHidden(), 'single player opens its page');
      assert.deepEqual(await board(page).sides(), [['YOU'], ['AI 1']]);
      assert.deepEqual(await page.$$eval('#soloBoard .side .hd span', hs => hs.map(h => h.textContent)), ['YOUR SIDE', 'ENEMIES']);
      assert.deepEqual(await page.$$eval('#soloBoard .tok', ts => ts.map(t => [t.getAttribute('aria-label'), t.querySelector('.race').textContent])),
        device.hasTouch ? [['YOU HUM, Humans, Your side: edit', 'HUM'], ['AI 1 HUM, Humans, Easy, Enemies: edit', 'HUM']] : [['YOU HUMANS, Your side: edit', 'HUMANS'], ['AI 1 HUMANS, Easy, Enemies: edit', 'HUMANS']],
        'each token says what it shows first, then the rest; a phone\'s short race');
      assert.equal(await page.locator('#soloBoard .tok b').first().evaluate(b => getComputedStyle(b).fontSize), device.hasTouch ? '16px' : '12px', 'a phone reads 16 px');
      // YOUR sheet: the race only (RANDOM too), a dialog; Escape closes it and gives the focus back to the token.
      await page.locator('#soloBoard [data-k="tok0"]').focus(); await page.keyboard.press('Enter');
      assert.ok(await page.locator('#soloSheet').evaluate(d => d.open && d.matches(':modal') && d.getAttribute('aria-labelledby') === 'sheetTitle'), 'a modal dialog, named by its title');
      assert.deepEqual(await page.$$eval('#soloSheet [role="radiogroup"]', gs => gs.map(g => g.getAttribute('aria-label'))), ['Race'], 'your seat: its race only');
      assert.deepEqual(await page.$$eval('#soloSheet [data-k^="race:"]', bs => bs.map(b => b.textContent)), ['HUMANS', 'VAEL', 'RANDOM']);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.k), 'race:humans', 'the focus on the lit chip');
      for (const key of ['Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
        await page.keyboard.press(key);
        assert.ok(await page.evaluate(() => !document.activeElement.closest('#soloBoard, .row, #maps')), `${key}: nothing behind the sheet takes the focus`);
      }
      await page.locator('#sheetTitle').click(); // (a click on the sheet's own words: Escape still closes it)
      await page.keyboard.press('Escape');
      assert.ok(await page.locator('#soloSheet').isHidden());
      assert.equal(await page.evaluate(() => document.activeElement.dataset.k), 'tok0', 'Escape: the focus back on the token');
      assert.equal(await page.locator('#lblSound').count(), 0, 'no SOUND row');
      assert.ok(await shown('#btnFirst') && await shown('#btnStart') && await shown('#btnMenuSound'), 'FIRST GAME, START GAME, the sound icon');
      await press('#btnSoloBack');
      assert.ok(await shown('#menuHome') && await page.locator('#menuSolo').isHidden(), 'BACK: the first page');
      // MULTIPLAYER: the lobby's join form, its own sound icon (the same setting); BACK.
      await press('#btnOnline');
      assert.ok(await shown('#onlineJoin') && await page.locator('#start').isHidden(), 'multiplayer: the join form');
      assert.equal(await page.locator('#onlineJoin h2').textContent(), 'MULTIPLAYER', 'its title: the button\'s');
      const v = page.viewportSize(), b = await page.locator('#btnLobbySound').boundingBox();
      assert.ok(b.x + b.width > v.width - 70 && b.y < 70 && b.width >= 44 && b.height >= 44, `the sound icon top right, a finger wide: ${JSON.stringify(b)}`);
      await press('#btnLobbySound');
      assert.equal(await page.locator('#btnLobbySound').getAttribute('aria-pressed'), 'false', 'sound off from the lobby');
      await press('#btnOnlineBack');
      assert.ok(await shown('#menuHome'), 'BACK: the first page');
      assert.equal(await page.locator('#btnMenuSound').getAttribute('aria-pressed'), 'false', 'one setting: the menu\'s icon says off too');
      // YOU = RANDOM: each START draws a race (drawn with Math.random: pinned here to see both).
      await press('#btnSolo'); await board(page).race(0, 'random');
      const startAs = async (r) => {
        await page.evaluate((r) => { Math.random = () => r; }, r);
        await press('#btnStart'); await page.waitForFunction(() => endfall.G.units.length > 0 && document.getElementById('start').hidden);
        return page.evaluate(() => endfall.G.factions[endfall.G.me]);
      };
      assert.equal(await startAs(0.9), 'vael', 'RANDOM drew the Vael');
      assert.equal(await page.locator('#btnSound').getAttribute('aria-pressed'), 'false', 'the game\'s sound follows the menu\'s');
      await press('#btnSound'); // (on again, from the game's top bar)
      await press('#btnPause'); await press('#btnQuit');
      assert.ok(await shown('#menuSolo'), 'leaving a game against the AI: the single player page, one tap from the next');
      await press('#btnSoloBack'); assert.ok(await shown('#menuHome'));
      assert.equal(await page.locator('#btnMenuSound').getAttribute('aria-pressed'), 'true', 'the top bar\'s setting on the menu');
      await press('#btnSolo');
      assert.match(await page.locator('#soloBoard [data-k="tok0"]').getAttribute('aria-label'), /^YOU (RND, Random|RANDOM),/, 'RANDOM still chosen');
      assert.equal(await startAs(0.1), 'humans', 'and the next game the Humans');
      await press('#btnPause'); await press('#btnQuit'); await press('#btnSoloBack');
      assert.match(await page.locator('#record').textContent(), /^Easy: 0 won · 2 lost$/, 'RANDOM\'s record: both races\' games');
      assert.ok(await page.locator('#btnFirstHome').isHidden(), 'games on the record: FIRST GAME off the first page');
      await press('#btnSolo'); assert.ok(await shown('#btnFirst'), 'still in single player');
      await board(page).race(0, 'vael'); await press('#btnSoloBack');
      assert.match(await page.locator('#record').textContent(), /^Easy: 0 won · 1 lost$/, 'the Vael\'s alone');
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  }
});

test('a newcomer\'s FIRST GAME on the first page; once the guided game is over, only in single player', async () => {
  const ctx = await browserContext(DESKTOP), page = await ctx.newPage();
  try {
    await page.goto(baseUrl() + '?seed=4242', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall);
    await page.locator('#btnFirstHome').click();
    await page.waitForFunction(() => endfall.G.units.length > 0 && document.getElementById('start').hidden);
    assert.match(await page.locator('#tut').textContent(), /1\/6/, 'the guided game');
    await page.evaluate(() => endfall.engine.concede()); // (set-up: the game's end is what matters)
    await page.locator('#end').waitFor({ state: 'visible' });
    await page.locator('#btnAgain').click();
    assert.ok(await page.locator('#menuHome').isVisible() && await page.locator('#btnFirstHome').isHidden(), 'no FIRST GAME on the first page any more');
    assert.equal(await page.locator('#record').textContent(), '', 'a guided game is not on the record');
    await page.locator('#btnSolo').click();
    assert.ok(await page.locator('#btnFirst').isVisible(), 'FIRST GAME in single player');
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => !!window.endfall);
    assert.ok(await page.locator('#btnFirstHome').isHidden(), 'remembered on this device');
  } finally { await ctx.close(); }
});

test('MULTIPLAYER only where a relay is known: none from a strange host, unless the build has the published relay', async () => {
  const ctx = await browserContext(DESKTOP), page = await ctx.newPage();
  try {
    // The game from a host that is not this machine's or a LAN's (the dev relay's address is not guessed there).
    await page.route('http://ebbfall.test/**', async (r) => { const u = new URL(r.request().url()); r.fulfill({ response: await r.fetch({ url: baseUrl() + u.pathname.slice(1) + u.search }) }); });
    await page.goto('http://ebbfall.test/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    assert.ok(await page.locator('#btnSolo').isVisible(), 'SINGLE PLAYER');
    // (CI builds the published game, VITE_RELAY_URL set: there it must offer MULTIPLAYER from any host)
    const baked = await page.evaluate(() => endfall.online.baked);
    if (baked) assert.ok(await page.locator('#btnOnline').isVisible(), `the published relay (${baked}): MULTIPLAYER`);
    else assert.ok(await page.locator('#btnOnline').isHidden(), 'no MULTIPLAYER');
  } finally { await ctx.close(); }
});

test('the menu works before the game has loaded: MULTIPLAYER at first paint, SINGLE PLAYER, START GAME waits saying so', async () => {
  // First paint: the page's HTML alone, no scripts run (a build with the published relay shows MULTIPLAYER there).
  const bare = await browserContext({ ...DESKTOP, javaScriptEnabled: false }), still = await bare.newPage();
  let painted;
  try { await still.goto(baseUrl()); painted = await still.locator('#btnOnline').isVisible(); } finally { await bare.close(); }
  const ctx = await browserContext(DESKTOP), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let release = () => {};
  try {
    // The sim's WASM and the art held back: the game cannot load until they are let through.
    const held = new Promise(r => { release = r; });
    await page.route(/\.wasm$|\/art\//, async (r) => { await held; await r.continue().catch(() => {}); });
    await page.goto(baseUrl(), { waitUntil: 'domcontentloaded' });
    await page.locator('#btnOnline').waitFor({ timeout: 10000 }); // (this machine: the dev relay's address, from online.js)
    await page.locator('#btnSolo').click();
    await page.locator('#menuSolo').waitFor({ timeout: 5000 });
    assert.ok(await page.evaluate(() => !window.endfall), 'the single-player page opened before the game loaded');
    await page.locator('#btnStart').click();
    assert.equal(await page.locator('#btnStart').textContent(), 'LOADING…', 'START GAME says it waits');
    assert.ok(await page.locator('#btnStart').isDisabled(), 'and takes no second tap');
    assert.ok(await page.locator('#start').isVisible(), 'the menu stays meanwhile');
    assert.ok(await page.locator('#btnSoloBack').isEnabled(), 'and BACK still works (it would call the start off)');
    release();
    await page.waitForFunction(() => window.endfall && endfall.G.units.length > 0 && document.getElementById('start').hidden, null, { timeout: 60000 });
    assert.equal(await page.locator('#btnStart').textContent(), 'START GAME', 'the button is itself again');
    const baked = await page.evaluate(() => endfall.online.baked);
    assert.equal(painted, !!baked, baked ? 'the published relay: MULTIPLAYER at first paint' : 'no relay in the build: MULTIPLAYER hidden in the HTML');
    assert.deepEqual(errors, []);
  } finally { release(); await ctx.close(); }
});

test('a game that never finishes loading: START GAME waits, BACK calls it off, and the menu goes on working', async () => {
  const ctx = await browserContext(DESKTOP), page = await ctx.newPage();
  let release = () => {};
  try {
    const held = new Promise(r => { release = r; });
    await page.route(/assets\/main-[^/]*\.js$/, async (r) => { await held; await r.continue().catch(() => {}); }); // (the game's chunk: stalled)
    await page.goto(baseUrl(), { waitUntil: 'domcontentloaded' });
    await page.locator('#btnSolo').click(); await page.locator('#menuSolo').waitFor();
    await page.locator('#btnStart').click();
    assert.equal(await page.locator('#btnStart').textContent(), 'LOADING…');
    await page.locator('#btnSoloBack').click();
    assert.ok(await page.locator('#menuHome').isVisible(), 'BACK works while the game loads');
    await page.locator('#btnAbout').click(); await page.locator('#menuAbout').waitFor();
    await page.locator('#btnOffline').click(); // (the service worker is registered once the game's load is over: not yet)
    await page.waitForFunction(() => /^Not yet\. Stay online/.test(document.getElementById('offlineMsg').textContent), null, { timeout: 10000 });
    await page.locator('#btnAboutBack').click();
    await page.locator('#btnSolo').click();
    assert.equal(await page.locator('#btnStart').textContent(), 'START GAME', 'the start was called off: the button is itself again');
    assert.ok(await page.locator('#btnStart').isEnabled());
    release(); // (now it loads: nothing starts by itself)
    await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    await page.waitForTimeout(300);
    assert.ok(await page.locator('#start').isVisible() && await page.evaluate(() => endfall.G.units.length === 0), 'no game started behind the menu');
    await page.locator('#btnStart').click();
    await page.waitForFunction(() => endfall.G.units.length > 0 && document.getElementById('start').hidden, null, { timeout: 30000 });
  } finally { release(); await ctx.close(); }
});

test('a game that could not load says so on the menu: START GAME and FIRST GAME read RELOAD, and reload', async () => {
  const ctx = await browserContext({ ...DESKTOP, serviceWorkers: 'block' }), page = await ctx.newPage(); // (the service worker, registered all the same, would fetch the game past the route)
  try {
    let tries = 0;
    await page.route(/assets\/main-[^/]*\.js$/, (r) => { tries++; return r.abort(); });
    await page.goto(baseUrl(), { waitUntil: 'domcontentloaded' });
    await page.locator('#loadFailed').waitFor({ timeout: 10000 });
    assert.match(await page.locator('#loadFailed').textContent(), /could not load/);
    const top = await page.evaluate(() => { const b = document.getElementById('loadFailed').getBoundingClientRect(); return document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest('#loadFailed') !== null; });
    assert.ok(top, 'the line is on the menu, not under it');
    await page.locator('#btnSolo').click();
    assert.equal(await page.locator('#btnStart').textContent(), 'RELOAD'); assert.equal(await page.locator('#btnFirst').textContent(), 'RELOAD');
    const before = tries;
    await Promise.all([page.waitForEvent('load'), page.locator('#btnStart').click()]);
    await page.waitForFunction(() => !!document.getElementById('loadFailed'), null, { timeout: 10000 });
    assert.ok(tries > before, 'RELOAD loaded the page again (and the game with it)');
  } finally { await ctx.close(); }
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

test('phone: a long-press on a command button shows what it is and costs, without pressing it', { chromium: CDP_TOUCH }, async () => {
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

test('phone: a site that loses its builder says so once; no keyboard letters; group tiles by type', { chromium: CDP_TOUCH }, async () => {
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
    await page.locator('#btnSolo').click(); await page.locator('#btnStart').click();
    await page.waitForFunction(() => endfall.G.units.length > 0);
    assert.ok(await page.evaluate(() => endfall.G.bldgs.some(b => b.team === 0 && b.type === 'core')), 'a game started offline');
    // The typefaces come with the game, so they load offline too (and online, no font service is asked).
    assert.ok(await page.evaluate(async () => { await document.fonts.ready; return ['Chakra Petch', 'Share Tech Mono'].every(fam => [...document.fonts].some(f => f.family.replace(/"/g, '') === fam && f.status === 'loaded')); }), 'fonts loaded offline');
  } finally { await ctx.close(); }
});

test('phone held upright: no card asks to turn it, and the game runs on', async () => {
  const d = await newGame({ ...PHONE, viewport: { width: 390, height: 844 } }, 1, 4242, { ai: false }); // held upright
  try {
    const t0 = await d.eval(() => endfall.G.time);
    await d.page.waitForFunction((t0) => endfall.G.time > t0 + 0.5, t0, { timeout: 5000 });
    assert.equal(await d.page.locator('#rotate').count(), 0, 'no turn-your-phone card');
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
    await page.locator('#btnSolo').click();
    await board(page).race(0, 'vael');
    assert.match(await page.locator('#soloBoard [data-k="tok1"]').getAttribute('aria-label'), /^AI 1 HUMANS,/, 'the opponent is human unless chosen');
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

test('phone: as the Vael, a Lumen plants a Spire and is free at once; the seed grows by itself', { chromium: CDP_TOUCH }, async () => {
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
    await page.locator('#btnSolo').click();
    await board(page).race(1, 'vael');
    await page.locator('#btnStart').click();
    await page.waitForFunction(() => endfall.G.units.length > 0);
    assert.deepEqual(await page.evaluate(() => endfall.G.factions), ['humans', 'vael']);
    assert.deepEqual(await page.evaluate(() => endfall.G.bldgs.filter(b => b.team === 1).map(b => b.type)), ['conflux'], 'the enemy starts with a Conflux');
  } finally { await ctx.close(); }
});

test('phone: placing a building lets the worker go; a tap on a blocked spot says why and keeps placing', { chromium: CDP_TOUCH }, async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    await d.grant(5000, 5000);
    let s = await d.state();
    const core = coreOf(s), h = mine(s, 'harvester')[0];
    // A tap on the Core (blocked) while placing a Depot: told why, still placing (Cancel on the card stops it).
    await d.clickEntity(h.id);
    await d.pressCard('Build'); await d.pressCard('Depot');
    await d.clickWorld(core.x, core.y);
    assert.ok(await d.eval(() => !!endfall.ui.place), 'a blocked tap keeps placing');
    assert.match((await d.toasts()).join(' | '), /Cannot build there/);
    assert.deepEqual((await d.selection()).map(e => e.id), [h.id], 'the worker is still selected');
    assert.ok((await d.card()).some(c => c.label === 'Cancel'), 'its Build button is a Cancel');
    await d.pressCard('Cancel');
    assert.equal(await d.eval(() => endfall.ui.place), null, 'Cancel stops placing');
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
    // The Vanguard: Entrench (set up: Entrenching researched) is a toggle, lit while on; a second tap packs it up.
    await d.eval(() => endfall.engine.debugResearch(0, 'entrenching'));
    await d.clickEntity(v);
    await d.readyCard('Entrench');
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

test('the end screen charts both armies, counts the result on the menu, and Rematch replays the same map', async () => {
  const d = await newGame(DESKTOP, 0, 4242);
  try {
    await d.eval(() => localStorage.removeItem('endfall.record'));
    const setup = () => d.eval(() => { const c = endfall.G.bldgs.find(b => b.team === endfall.G.me && b.d.hq); return JSON.stringify([endfall.G.seed, endfall.G.factions, c.tx, c.ty]); });
    const before = await setup();
    // A few Troopers, then a short game: the enemy's Core nearly down, and our Troopers beside it.
    await d.skip(25);
    const s = await d.state(), foeCore = s.bldgs.find(b => b.team !== 0 && b.type === 'core');
    await d.eval(([id, x, y]) => { endfall.engine.debugSetHp(id, 5); for (let i = 0; i < 4; i++) endfall.engine.debugSpawn(0, 'trooper', x + i * 20, y + 90); }, [foeCore.id, foeCore.x, foeCore.y]);
    await until(d, async () => (await d.state()).over, { seconds: 60, step: 1, what: 'the game to end' });
    await d.page.locator('#end').waitFor({ state: 'visible' });
    assert.equal(await d.page.locator('#result').textContent(), 'VICTORY');
    assert.equal(await d.page.locator('#endChart polyline').count(), 2, 'two lines: ours and theirs');
    assert.equal(await d.page.locator('#endChart text').count(), 0, 'no numbers on the chart');
    await d.page.locator('#btnRematch').click();
    await until(d, async () => !(await d.state()).over, { seconds: 10, step: 0.5, what: 'the rematch' });
    assert.ok(await d.page.locator('#end').isHidden(), 'Rematch starts at once');
    assert.equal(await setup(), before, 'the same map, races and starting base');
    assert.ok(await d.eval(() => endfall.G.time < 5), 'from the start');
    // Back on the menu: the record for this race and difficulty.
    await d.page.locator('#btnPause').click();
    await d.page.locator('#btnQuit').click();
    assert.match(await d.page.locator('#record').textContent(), /1 won · 1 lost/); // (the win, and the rematch left: leaving gives a game up)
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: as the Vael, a Kiln whose rally point is in a power field warps its unit in there', { chromium: CDP_TOUCH }, async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false, race: 'vael' });
  try {
    await d.grant(2000, 500);
    const s = await d.state(), hq = s.bldgs.find(b => b.team === 0 && b.type === 'conflux');
    const lumen = s.units.find(u => u.team === 0 && u.type === 'lumen');
    const spot = await d.findSpot('kiln', { tx: hq.tx + 1, ty: hq.ty + 1 });
    await d.buildWithUI('k', 'kiln', spot.tx, spot.ty, lumen.id);
    const kiln = () => d.state().then(st => st.bldgs.find(b => b.team === 0 && b.type === 'kiln'));
    await until(d, async () => (await kiln())?.done, { seconds: 90, what: 'the Kiln to finish' });
    // A rally point in the Conflux's power field (within 6 of its 7 tiles), on open ground away from the Kiln.
    const k = await kiln(), st = await d.state();
    const at = [[-150, -120], [150, -150], [-170, 100], [120, 170], [0, -190], [-190, 0]].map(([dx, dy]) => [hq.x + dx, hq.y + dy])
      .find(([x, y]) => Math.hypot(x - k.x, y - k.y) > 140 && st.nodes.every(n => Math.hypot(n.x - x, n.y - y) > 60) && st.bldgs.every(b => Math.hypot(b.x - x, b.y - y) > 90));
    assert.ok(at, 'an open spot in the power field');
    await d.clickEntity(k.id);
    await d.pressCard('Rally');
    await d.clickWorld(at[0], at[1]);
    await d.clickEntity(k.id);
    await d.pressCard('Scythe');
    const scythe = () => d.state().then(st => st.units.find(u => u.team === 0 && u.type === 'scythe'));
    await until(d, async () => !!(await scythe()), { seconds: 40, step: 0.25, what: 'the Scythe' });
    const u = await scythe();
    assert.ok(Math.hypot(u.x - at[0], u.y - at[1]) < 64, `it warps in at the rally point: ${u.x},${u.y} vs ${at}`);
    assert.ok(await d.eval((id) => endfall.G.units.find(x => x.id === id).warp > 0, u.id), 'still warping in');
    await d.clickEntity(u.id);
    assert.match(await d.hudText('#selSub', /Warping in/), /Warping in/);
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('a double-click on a factory selects all of them and they train as one; the idle-factory chip finds the idle ones', async () => {
  const d = await newGame(DESKTOP, 0, 4242, { ai: false });
  try {
    await d.grant(3000, 500);
    const s = await d.state(), core = coreOf(s), hs = mine(s, 'harvester');
    assert.ok(await d.page.locator('#btnProd').isHidden(), 'no chip before the first factory');
    const a = await d.findSpot('barracks', { tx: core.tx + 6, ty: core.ty });
    await d.buildWithUI('g', 'barracks', a.tx, a.ty, hs[0].id);
    const b = await d.findSpot('barracks', { tx: a.tx + 4, ty: a.ty });
    await d.buildWithUI('g', 'barracks', b.tx, b.ty, hs[1].id);
    const rax = () => d.state().then(st => st.bldgs.filter(x => x.team === 0 && x.type === 'barracks'));
    await until(d, async () => (await rax()).filter(x => x.done).length === 2, { seconds: 120, what: 'two Garrisons' });
    await d.key('Escape');
    await d.page.locator('#btnProd').waitFor({ state: 'visible' }); // an idle factory: the chip appears
    // The chip selects one, then the next.
    await d.page.locator('#btnProd').click();
    const first = (await d.selection())[0];
    await d.page.locator('#btnProd').click();
    const second = (await d.selection())[0];
    assert.ok(first.type === 'barracks' && second.type === 'barracks' && first.id !== second.id, 'it cycles through them');
    // Double-click one: both are selected; two Troopers go one to each.
    const [g0, g1] = await rax();
    await d.centerOn((g0.x + g1.x) / 2, (g0.y + g1.y) / 2);
    const [px, py] = await d.screen(g0.x, g0.y, false); // (both in view)
    await d.page.mouse.click(px, py); await d.page.mouse.click(px, py);
    assert.equal((await d.selection()).filter(e => e.type === 'barracks').length, 2, 'double-click selects both Garrisons');
    await d.pressCard('Trooper'); await d.pressCard('Trooper');
    assert.deepEqual((await rax()).map(x => x.queue.length), [1, 1], 'one Trooper in each queue');
    await d.page.locator('#btnProd').waitFor({ state: 'hidden' }); // none idle now: it goes
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: a double-tap on a factory selects all of them, the console shows them, and they train as one', { chromium: CDP_TOUCH }, async () => {
  const d = await newGame(PHONE, 0, 4242, { ai: false });
  try {
    await d.grant(3000, 500);
    const s = await d.state(), core = coreOf(s), hs = mine(s, 'harvester');
    const a = await d.findSpot('barracks', { tx: core.tx + 6, ty: core.ty });
    await d.buildWithUI('g', 'barracks', a.tx, a.ty, hs[0].id);
    const b = await d.findSpot('barracks', { tx: a.tx + 4, ty: a.ty });
    await d.buildWithUI('g', 'barracks', b.tx, b.ty, hs[1].id);
    const rax = () => d.state().then(st => st.bldgs.filter(x => x.team === 0 && x.type === 'barracks'));
    await until(d, async () => (await rax()).filter(x => x.done).length === 2, { seconds: 120, what: 'two Garrisons' });
    const [g0, g1] = await rax();
    await d.centerOn((g0.x + g1.x) / 2, (g0.y + g1.y) / 2);
    const top = g0.y < g1.y ? g0 : g1; // (the upper one: the console that the first tap brings up covers the bottom)
    const [px, py] = await d.screen(top.x, top.y, false);
    await d.doubleTapAt(px, py);
    assert.equal((await d.selection()).filter(e => e.type === 'barracks').length, 2, 'both Garrisons');
    await d.hudText('#selName', /2 buildings/);
    const t0 = await d.eval(() => endfall.G.time);
    await d.pressCard('Trooper'); await d.pressCard('Trooper');
    assert.deepEqual((await rax()).map(x => x.queue.length), [1, 1], 'one Trooper in each queue');
    await d.page.waitForTimeout(600);
    assert.ok(await d.eval(() => endfall.G.time) > t0, 'the game runs on');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: a long-press on a unit to train shows what it beats and what beats it', { chromium: CDP_TOUCH }, async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    await d.grant(1000, 0);
    const s = await d.state(), core = coreOf(s), h = mine(s, 'harvester')[0];
    const spot = await d.findSpot('barracks', { tx: core.tx + 6, ty: core.ty });
    await d.buildWithUI('g', 'barracks', spot.tx, spot.ty, h.id);
    const rax = () => d.state().then(st => st.bldgs.find(b => b.team === 0 && b.type === 'barracks'));
    await until(d, async () => (await rax())?.done, { seconds: 90, what: 'the Garrison' });
    await d.clickEntity((await rax()).id);
    const b = await d.page.locator('#cmd button', { hasText: 'Trooper' }).boundingBox();
    const cdp = await d.page.context().newCDPSession(d.page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }] });
    await d.page.waitForTimeout(700);
    const info = d.page.locator('#cmdInfo');
    assert.match(await info.textContent(), /Strong against.*Weak against/);
    assert.equal(await info.locator('.vs img').count(), 4, 'portraits: Scythe and Wasp; Vanguard and Sovereign');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: Home looks at the base (beside SELECT, no wider than the minimap together); the Army chip appears with an army and a second tap looks at it', { chromium: CDP_TOUCH }, async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    const core = coreOf(await d.state());
    const view = () => d.eval(() => { const c = endfall.cam, v = endfall.view; return { x: c.x + v.w / c.zoom / 2, y: c.y + v.h / c.zoom / 2 }; });
    const span = await d.eval(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(); return [r('btnBox').left, r('btnHome').right, r('minimap').left, r('minimap').right]; });
    assert.ok(span[0] >= span[2] - 1 && span[1] <= span[3] + 1, `SELECT and Home within the minimap's width: ${span}`);
    await d.centerOn(core.x > 1000 ? 300 : 1700, core.y > 1000 ? 300 : 1700);
    await d.page.locator('#btnHome').tap();
    const v = await view();
    assert.ok(Math.hypot(v.x - core.x, v.y - core.y) < 64, `Home centres on the Core: ${JSON.stringify(v)}`);
    assert.ok(await d.page.locator('#btnArmy').isHidden(), 'no army, no chip');
    // An army somewhere else: the first tap selects it, the second also looks at it.
    const [ax, ay] = [core.x > 1000 ? core.x - 500 : core.x + 500, core.y];
    await d.eval(([x, y]) => [0, 1, 2].forEach(i => endfall.engine.debugSpawn(0, 'trooper', x + i * 24, y)), [ax, ay]);
    await d.page.waitForTimeout(400); // (the chip counts them)
    const chip = await d.page.locator('#btnArmy').boundingBox();
    await d.doubleTapAt(chip.x + chip.width / 2, chip.y + chip.height / 2); // (two taps within the second)
    assert.equal((await d.selection()).length, 3);
    const w = await view();
    assert.ok(Math.hypot(w.x - (ax + 24), w.y - ay) < 64, `the second tap looks at the army: ${JSON.stringify(w)}`);
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: the pause card has four equal buttons and fits a small phone; PAUSE leaves full screen, BACK TO GAME goes back into it; Leave game goes back to the menu and counts as a defeat', { skip: notIn(['webkit'], IPHONE) }, async () => {
  const d = await newGame({ ...PHONE, viewport: { width: 667, height: 375 } }, 1, 4242);
  try {
    // Full screen (stood in for: headless browsers have none, or a real one START may have entered).
    await d.eval(() => {
      for (const k of ['fullscreenElement', 'webkitFullscreenElement']) Object.defineProperty(document, k, { configurable: true, get: () => (window.fs ? document.documentElement : null) });
      document.exitFullscreen = async () => { window.fs = false; window.fsOut = (window.fsOut || 0) + 1; document.dispatchEvent(new Event('fullscreenchange')); };
      document.documentElement.requestFullscreen = async () => { window.fs = true; window.fsIn = (window.fsIn || 0) + 1; document.dispatchEvent(new Event('fullscreenchange')); };
      window.fs = true; document.dispatchEvent(new Event('fullscreenchange'));
    });
    const fs = () => d.eval(() => [!!window.fs, window.fsOut || 0, window.fsIn || 0]);
    await d.page.locator('#btnPause').tap();
    assert.deepEqual(await fs(), [false, 1, 0], 'PAUSE leaves full screen');
    const boxes = await d.page.$$eval('#pause .pausegrid button', bs => bs.filter(b => !b.hidden).map(b => { const r = b.getBoundingClientRect(); return [b.textContent, Math.round(r.width), Math.round(r.height)]; }));
    assert.deepEqual(boxes.map(b => b[0]), ['BACK TO GAME', 'HOW TO PLAY', 'RESTART', 'LEAVE GAME']);
    assert.ok(boxes.every(b => b[1] === boxes[0][1] && b[2] === boxes[0][2] && b[2] >= 44), `one size, big enough: ${JSON.stringify(boxes)}`);
    const sc = await d.page.locator('#pause .card').evaluate(e => [e.scrollHeight, e.clientHeight]);
    assert.ok(sc[0] <= sc[1] + 1, `fits without scrolling: ${sc}`);
    assert.equal(await d.page.locator('#btnConcede').count(), 0, 'no Concede (leaving is giving up)');
    await d.page.locator('#btnResume').tap();
    assert.deepEqual(await fs(), [true, 1, 1], 'BACK TO GAME: full screen again');
    // Out of full screen when paused: BACK TO GAME leaves it so.
    await d.eval(() => document.exitFullscreen());
    await d.page.locator('#btnPause').tap(); await d.page.locator('#btnResume').tap();
    assert.deepEqual(await fs(), [false, 2, 1], 'not full screen before: not after either');
    await d.page.locator('#btnPause').tap();
    await d.page.locator('#btnQuit').tap();
    await d.page.locator('#start').waitFor({ state: 'visible' });
    assert.match(await d.page.locator('#record').textContent(), /1 lost/, 'counted as a defeat');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('the first enemy capital unit seen is announced, once', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    const core = coreOf(await d.state());
    const x = core.x > 1000 ? core.x - 200 : core.x + 200;
    await d.eval(([x, y]) => { endfall.engine.debugSpawn(1, 'sovereign', x, y); endfall.engine.debugSpawn(1, 'sovereign', x + 60, y); }, [x, core.y]);
    await d.page.waitForFunction(() => [...document.querySelectorAll('#msg .toast')].some(t => /Enemy Sovereign sighted/.test(t.textContent)), null, { timeout: 5000 });
    await d.page.waitForTimeout(600);
    assert.equal((await d.toasts()).filter(t => /Sovereign sighted/.test(t)).length, 1, 'once for the kind');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: a tap on a type tile keeps only that type, a long-press drops it', { chromium: CDP_TOUCH }, async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    const core = coreOf(await d.state());
    await d.eval(([x, y]) => { for (let i = 0; i < 3; i++) endfall.engine.debugSpawn(0, 'trooper', x + i * 24, y); endfall.engine.debugSpawn(0, 'medic', x, y + 30); }, [core.x + 160, core.y + 100]);
    await d.page.waitForTimeout(300);
    const types = async () => (await d.selection()).map(e => e.type).sort();
    await d.page.locator('#btnArmy').tap();
    assert.deepEqual(await types(), ['medic', 'trooper', 'trooper', 'trooper']);
    await d.page.locator('#group .gi[data-t="trooper"]').tap();
    assert.deepEqual(await types(), ['trooper', 'trooper', 'trooper'], 'tap: only the Troopers');
    await d.page.locator('#btnArmy').tap();
    const tile = await d.page.locator('#group .gi[data-t="trooper"]').boundingBox();
    const cdp = await d.page.context().newCDPSession(d.page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tile.x + tile.width / 2, y: tile.y + tile.height / 2 }] });
    await d.page.waitForTimeout(700);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await d.page.waitForTimeout(200);
    assert.deepEqual(await types(), ['medic'], 'long-press: the Troopers dropped');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('a click on a unit tile selects that unit alone, Shift+click drops it', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    const core = coreOf(await d.state());
    const ids = await d.eval(([x, y]) => [0, 1, 2].map(i => endfall.engine.debugSpawn(0, 'trooper', x + i * 24, y)), [core.x + 160, core.y + 100]);
    await d.page.waitForTimeout(300);
    await d.page.locator('#btnArmy').click();
    assert.equal((await d.selection()).length, 3);
    await d.page.locator(`#group .gi[data-id="${ids[1]}"]`).click({ modifiers: ['Shift'] });
    assert.deepEqual((await d.selection()).map(e => e.id).sort(), [ids[0], ids[2]].sort(), 'Shift+click drops it');
    await d.page.locator(`#group .gi[data-id="${ids[2]}"]`).click();
    assert.deepEqual((await d.selection()).map(e => e.id), [ids[2]], 'a click keeps it alone');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: the first game guides step by step, pulsing the button it wants, and holds the first wave', { chromium: CDP_TOUCH }, async () => {
  const d = await newGame(PHONE, 0, 4242, { first: true });
  try {
    assert.equal(await d.eval(() => endfall.G.diff), 0, 'Easy');
    await d.hudText('#tut', /1\/6/);
    assert.match(await d.page.locator('#tut').textContent(), /train two Harvesters/);
    // Step 1: the Core, then Harvester twice (the button pulses).
    await d.grant(1000, 0);
    const s = await d.state(), core = coreOf(s);
    await d.clickEntity(core.id);
    await d.page.waitForTimeout(300);
    assert.equal(await d.page.locator('#cmd button.pulse').getAttribute('data-id'), 't_harvester', 'the Harvester button pulses');
    await d.pressCard('Harvester'); await d.pressCard('Harvester');
    await d.skip(30);
    await d.hudText('#tut', /2\/6/);
    // Step 2: a Harvester, Build: the Build button pulses; a Depot finishes the step.
    // A Harvester standing at its field (one on the move can slip from under the tap).
    for (let i = 0; i < 8 && !(await d.selection()).some(e => e.type === 'harvester'); i++) {
      const id = await d.eval(() => (endfall.G.units.find(u => u.team === 0 && u.d.worker && u.task.t === 'gather' && u.task.phase === 'mine') || endfall.G.units.find(u => u.team === 0 && u.d.worker)).id);
      await d.clickEntity(id);
    }
    assert.ok((await d.selection()).some(e => e.type === 'harvester'), 'a Harvester selected');
    const h = (await d.selection()).find(e => e.type === 'harvester');
    await d.page.waitForTimeout(300);
    assert.equal(await d.page.locator('#cmd button.pulse').first().getAttribute('data-id'), 'build');
    const spot = await d.findSpot('depot', { tx: core.tx + 5, ty: core.ty });
    await d.buildWithUI('d', 'depot', spot.tx, spot.ty, h.id);
    await until(d, async () => (await d.state()).bldgs.some(b => b.team === 0 && b.type === 'depot' && b.done), { seconds: 60, what: 'the Depot' });
    await d.hudText('#tut', /3\/6/);
    // The opponent waits: by 5:30, with the army not ready, none of its fighters has crossed to our half.
    await d.skip(Math.max(0, 330 - await d.eval(() => endfall.G.time)));
    assert.equal(await d.eval(() => { const me = endfall.G.bldgs.find(b => b.team === 0 && b.d.hq), foe = endfall.G.bldgs.find(b => b.team === 1 && b.d.hq); return endfall.G.units.filter(u => u.team === 1 && !u.d.worker && Math.hypot(u.x - me.x, u.y - me.y) < Math.hypot(u.x - foe.x, u.y - foe.y)).length; }), 0, 'no attack yet');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('the HUD tells the first enemy flyer seen, and an army wiped out', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    const core = coreOf(await d.state());
    const x = core.x > 1000 ? core.x - 220 : core.x + 220;
    await d.eval(([x, y]) => endfall.engine.debugSpawn(0, 'trooper', x, y), [x, core.y]);
    await d.page.waitForTimeout(400); // (the HUD counts it)
    await d.eval(([x, y]) => { endfall.engine.debugSpawn(1, 'wasp', x + 60, y - 40); endfall.engine.debugSpawn(1, 'vanguard', x + 40, y); }, [x, core.y]);
    await d.page.waitForFunction(() => [...document.querySelectorAll('#msg .toast')].some(t => /Enemy flyers spotted/.test(t.textContent)), null, { timeout: 5000 });
    await until(d, async () => (await d.state()).units.every(u => u.team !== 0 || u.type !== 'trooper'), { seconds: 20, step: 1, what: 'the Trooper to fall' });
    await d.page.waitForFunction(() => [...document.querySelectorAll('#msg .toast')].some(t => /No army left/.test(t.textContent)), null, { timeout: 5000 });
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('the screen is lean: resources, supply, full screen, sound and pause on top, no empty panel; the clock lives in the pause card', async () => {
  for (const dev of [DESKTOP, PHONE]) {
    const d = await newGame(dev, 1, 4242, { ai: false });
    try {
      const shown = await d.eval(() => [...document.querySelectorAll('#top > *')].filter(e => e.offsetParent !== null && getComputedStyle(e).display !== 'none' && !e.classList.contains('spacer')).map(e => e.id || e.className));
      const want = ['resShard', 'resEther', 'resSup', ...(await d.eval(() => !document.getElementById('btnFull').hidden) ? ['btnFull'] : []), 'btnSound', 'btnPause'];
      assert.deepEqual(shown, want, 'the top bar at the start: ' + shown.join(' '));
      assert.ok(await d.page.locator('#info').isHidden(), 'nothing selected: no panel');
      await d.skip(30);
      await (d.touch ? d.page.locator('#btnPause').tap() : d.page.locator('#btnPause').click());
      assert.match(await d.page.locator('#pauseTime').textContent(), /0:3\d into the game/, 'the clock, on demand');
      assert.deepEqual(d.errors, []);
    } finally { await d.close(); }
  }
});


test('iPad full screen: the top bar starts after the system\'s ✕ (top left), and only there', { skip: notIn(['webkit', 'firefox'], 'it asks for full screen from a script, outside a gesture, which only Chromium under test allows') }, async () => {
  // iPadOS draws its own leave-full-screen ✕ over the page's top-left corner, in Safari (a Macintosh with touch) and in
  // every other iPad browser.
  const IPAD = { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 26_6_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/151.0.7922.57 Mobile/15E148 Safari/604.1' };
  for (const dev of [IPAD, PHONE]) {
    const d = await newGame(dev, 1, 4242, { ai: false });
    try {
      const left = () => d.eval(() => document.getElementById('resShard').getBoundingClientRect().left);
      // (START went full screen already where the browser allows it: from out of full screen, settled)
      await d.page.waitForTimeout(300);
      await d.eval(() => document.fullscreenElement && document.exitFullscreen());
      await d.page.waitForFunction(() => !document.fullscreenElement && !document.documentElement.classList.contains('sysx'));
      await d.page.waitForTimeout(300);
      const before = await left();
      await d.eval(() => document.documentElement.requestFullscreen());
      await d.page.waitForFunction(() => !!document.fullscreenElement);
      if (dev === IPAD) await d.page.waitForFunction(() => document.getElementById('resShard').getBoundingClientRect().left >= 60, null, { timeout: 3000 }).catch(() => {});
      else await d.page.waitForTimeout(300); // (the fullscreenchange event comes after fullscreenElement is set)
      const full = await left();
      if (dev === IPAD) assert.ok(full >= 60, `the shards clear the ✕: ${before} -> ${full}`);
      else assert.ok(Math.abs(full - before) < 2, `a phone keeps its top bar: ${before} -> ${full}`);
      await d.eval(() => document.exitFullscreen());
      await d.page.waitForFunction(() => !document.fullscreenElement && !document.documentElement.classList.contains('sysx'));
      await d.page.waitForFunction((b) => Math.abs(document.getElementById('resShard').getBoundingClientRect().left - b) < 2, before, { timeout: 3000 })
        .catch(async () => assert.fail(`back in place out of full screen: ${before} -> ${await left()}`));
      assert.deepEqual(d.errors, []);
    } finally { await d.close(); }
  }
});

test('the top bar keeps still when SOUND ON turns to SOUND OFF (a wide screen shows the words)', async () => {
  const d = await newGame({ viewport: { width: 1180, height: 820 } }, 1, 4242, { ai: false });
  try {
    const boxes = () => d.eval(() => ['btnFull', 'btnSound', 'btnPause'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.width)]; }));
    assert.ok(await d.page.locator('#btnSound .t').isVisible(), 'the words show at this width');
    const on = await boxes();
    await d.page.locator('#btnSound').click();
    assert.match(await d.page.locator('#btnSound .t > span:first-child').textContent(), /SOUND OFF/);
    assert.deepEqual(await boxes(), on, 'nothing moved');
    await d.page.locator('#btnSound').click();
    assert.deepEqual(await boxes(), on, 'nor back');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('the menu shows a thumbnail of the chosen map, and a question mark for a random one', async () => {
  const ctx = await browserContext(DESKTOP), page = await ctx.newPage();
  try {
    await page.goto(baseUrl(), { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    const pixels = () => page.evaluate(() => { const c = document.getElementById('mapPreview'); return Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data).join(','); });
    await page.locator('#btnSolo').click();
    const first = await pixels();
    await page.locator('#maps .ib', { hasText: 'GLASS REACH' }).click();
    const second = await pixels();
    assert.notEqual(first, second, 'another map, another thumbnail');
    assert.ok(new Set(second.split(',')).size > 8, 'rock, fields and starts in it');
    await page.locator('#maps .ib.random').click();
    assert.equal(await page.locator('#mapPreview').getAttribute('title'), 'A new map every time');
  } finally { await ctx.close(); }
});

// Single player's sides board (src/client/seats.js, menu.js): sides of tokens, + ALLY / + AI / + SIDE, a seat's sheet.
/** In the page: the board's words cut (by as little as a pixel's fraction: the text is wider than its box, scrolls,
 *  or ends in an ellipsis) and anything of a token past its edge; installed on every page by `cutCheck`. */
const cutCheck = (page) => page.addInitScript(() => {
  window.cutWords = () => {
    const words = [...document.querySelectorAll('#soloBoard .tok > *, #soloBoard .add, #soloBoard .newside .t, #soloBoard .side .hd > *')].filter(e => e.textContent.trim());
    const cut = words.filter(e => {
      const r = document.createRange(); r.selectNodeContents(e);
      return r.getBoundingClientRect().width > e.getBoundingClientRect().width + 0.01 || e.scrollWidth > e.clientWidth || (getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth);
    }).map(e => e.textContent);
    const out = [...document.querySelectorAll('#soloBoard .tok')].filter(t => [...t.children].some(c => c.getBoundingClientRect().right > t.getBoundingClientRect().right + 0.5)).map(t => t.dataset.k + ' past its edge');
    return [...cut, ...out];
  };
});
/** The open sheet is on the screen, top to bottom, and needs no scrolling. */
const sheetFits = (page) => page.locator('#soloSheet .sheet').evaluate(e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 0.5 && e.scrollHeight <= e.clientHeight + 1; });
const fitsPage = async (page, what) => {
  const [sh, ch, sw, cw] = await page.locator('#start .card.menu').evaluate(e => [e.scrollHeight, e.clientHeight, e.scrollWidth, e.clientWidth]);
  assert.ok(sh <= ch + 1 && sw <= cw + 1, `${what}: fits (${sh} > ${ch} or ${sw} > ${cw})`);
};

test('single player: the sides board decides the players and the maps (a badge when a start stays free); sides through the sheet; four start on 96x96, two as before; a small phone holds it all', async () => {
  const ctx = await browserContext({ ...PHONE, viewport: { width: 667, height: 375 } }), page = await ctx.newPage();
  try {
    await page.goto(baseUrl(), { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    const maps = () => page.$$eval('#maps .map', bs => bs.map(b => b.firstChild.textContent));
    const badges = () => page.$$eval('#maps .map .up', bs => bs.map(b => b.textContent));
    const seats = board(page), label = (i) => page.locator(`#soloBoard [data-k="tok${i}"]`).getAttribute('aria-label');
    await page.locator('#btnSolo').tap();
    assert.deepEqual(await seats.sides(), [['YOU'], ['AI 1']], 'a duel by default');
    assert.deepEqual(await maps(), ['ASHEN BASIN', 'GLASS REACH', 'CINDER DIVIDE', 'RANDOM'], 'two players: the maps as before');
    assert.deepEqual(await badges(), [], 'no badges');
    await seats.open(1);
    assert.equal(await page.locator('#soloSheet [data-k="remove"]').count(), 0, 'the last enemy stays');
    assert.deepEqual(await page.$$eval('#soloSheet [data-k^="side:"]', bs => bs.map(b => b.textContent)), ['YOURS', 'SIDE 2'], 'alone on its side: no new side');
    await page.locator('#soloSheet [data-k="diff:2"]').tap(); // (HARD's line, the longest)
    assert.ok(await sheetFits(page), 'the sheet fits the screen');
    await page.locator('#soloSheet [data-k="diff:0"]').tap(); await page.locator('#soloSheet [data-k="close"]').tap();
    await seats.diff(1, 1); await seats.race(1, 'vael');
    await seats.add(1);
    assert.deepEqual(await seats.sides(), [['YOU'], ['AI 1', 'AI 2']]);
    assert.equal(await label(2), 'AI 2 VAEL, Medium, Enemies: edit', 'a new AI: as its side\'s last');
    assert.deepEqual(await maps(), ['DUST QUARTER', 'SHARD CROWN', 'LONG STEPPE', 'RANDOM'], 'three: the 96x96 maps, names of their own');
    assert.deepEqual(await badges(), ['up to 4', 'up to 4', 'up to 4', 'up to 4'], 'each seats four: a start stays free');
    assert.equal(await page.locator('#mapPreview').evaluate(c => c.width), 96, 'the preview at the map\'s size');
    await fitsPage(page, 'three players');
    await seats.add(1);
    assert.deepEqual(await badges(), [], 'four on four starts: no badge');
    assert.deepEqual(await page.$$eval('#soloBoard .side .hd', hs => hs.map(h => h.textContent)), ['YOUR SIDE', 'ENEMIES· 3'], 'a side\'s count');
    // Each token's band is its seat's colour in the game: AI 2 on your side takes the second seat.
    const bands = await seats.bands();
    await seats.side(2, 0);
    assert.deepEqual(await seats.sides(), [['YOU', 'AI 2'], ['AI 1', 'AI 3']]);
    assert.deepEqual(await seats.bands(), [bands[0], bands[2], bands[1], bands[3]], 'the bands follow the seats the sides give');
    // Everyone on one side: START GAME waits, and says why.
    await seats.side(1, 0); await seats.side(3, 0);
    assert.deepEqual(await seats.sides(), [['YOU', 'AI 1', 'AI 2', 'AI 3']]);
    assert.ok(await page.locator('#btnStart').isDisabled());
    assert.equal(await page.locator('#soloNote').textContent(), 'Everyone is on one side');
    // Two against two: AI 1 to a new side, AI 3 joins it.
    await seats.side(1, 'new'); await seats.side(3, 1);
    assert.deepEqual(await seats.sides(), [['YOU', 'AI 2'], ['AI 1', 'AI 3']]);
    assert.ok(await page.locator('#btnStart').isEnabled()); assert.equal(await page.locator('#soloNote').textContent(), '');
    await fitsPage(page, 'four players, two against two');
    await page.locator('#btnStart').tap();
    await page.waitForFunction(() => endfall.G.units.length > 0);
    assert.deepEqual(await page.evaluate(() => [endfall.G.teams, endfall.engine.MW, endfall.G.me, endfall.engine.foes(), endfall.G.factions]), [[0, 0, 1, 1], 96, 0, [2, 3], ['humans', 'vael', 'vael', 'vael']]);
    // Back to the menu (leaving counts as a defeat): the sides remembered; free for all.
    await page.evaluate(() => { endfall.ui.watching = 0; document.getElementById('btnPause').click(); });
    await page.locator('#btnQuit').tap();
    await page.locator('#menuSolo').waitFor({ state: 'visible' });
    assert.deepEqual(await seats.sides(), [['YOU', 'AI 2'], ['AI 1', 'AI 3']], 'the sides remembered');
    await seats.side(2, 'new'); await seats.side(3, 'new');
    assert.deepEqual(await seats.sides(), [['YOU'], ['AI 1'], ['AI 2'], ['AI 3']]);
    assert.deepEqual(await page.$$eval('#soloBoard .side .hd span', hs => hs.map(h => h.textContent)), ['YOUR SIDE', 'SIDE 2', 'SIDE 3', 'SIDE 4']);
    await page.locator('#btnStart').tap();
    await page.waitForFunction(() => endfall.G.units.length > 0 && endfall.G.teams.length === 4 && endfall.G.teams[1] === 1);
    const four = await page.evaluate(() => [endfall.G.teams, endfall.engine.MW, endfall.G.factions.length, [0, 1, 2, 3].map(t => endfall.G.bldgs.filter(b => b.team === t && b.d.hq).length)]);
    assert.deepEqual(four, [[0, 1, 2, 3], 96, 4, [1, 1, 1, 1]], 'four seats, each its own, a base each, on 96x96');
    await page.evaluate(() => endfall.skip(20));
    assert.ok(await page.evaluate(() => [1, 2, 3].every(t => endfall.G.stats[t].built > 0)), 'three AIs at work');
    // Two again (REMOVE in two sheets): the duel as it always was; the focus on the seat before.
    await page.evaluate(() => { document.getElementById('btnPause').click(); });
    await page.locator('#btnQuit').tap();
    await seats.remove(3);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.k), 'tok2', 'REMOVE: the focus on the seat before');
    await seats.remove(1);
    assert.deepEqual(await seats.sides(), [['YOU'], ['AI 2']], 'AI 2 keeps its name with AI 1 and AI 3 gone');
    assert.equal(await page.locator('#maps .map.on').textContent(), 'ASHEN BASIN', 'back to a duel\'s map');
    await page.locator('#btnStart').tap();
    await page.waitForFunction(() => endfall.G.units.length > 0 && endfall.G.teams.length === 2);
    assert.deepEqual(await page.evaluate(() => [endfall.G.seed, endfall.engine.MW, endfall.G.teams]), [4242, 64, [0, 1]]);
  } finally { await ctx.close(); }
});

test('single player, you alone against three AIs teamed up (+ AI twice) at mixed difficulties: they are allies, each at its own level', async () => {
  const ctx = await browserContext(PHONE), page = await ctx.newPage();
  try {
    await page.goto(baseUrl(), { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    const seats = board(page);
    await page.locator('#btnSolo').tap();
    await seats.add(1); await seats.add(1); // (+ AI twice in ENEMIES: 1v3)
    assert.deepEqual(await seats.sides(), [['YOU'], ['AI 1', 'AI 2', 'AI 3']]);
    await seats.diff(2, 2); await seats.diff(3, 3);
    assert.deepEqual(await page.$$eval('#soloBoard .tok', ts => ts.map(t => t.querySelectorAll('.lvl i.on').length)), [0, 1, 3, 4], 'the levels as pips');
    await fitsPage(page, 'one against three');
    await page.locator('#btnStart').tap();
    await page.waitForFunction(() => endfall.G.units.length > 0);
    const game = await page.evaluate(() => [endfall.G.teams, endfall.G.me, endfall.engine.foes(), [1, 2, 3].map(s => endfall.engine.diffOf(s)), endfall.G.diff, endfall.engine.MW, [0, 1, 2, 3].map(t => endfall.G.bldgs.filter(b => b.team === t && b.d.hq).length)]);
    assert.deepEqual(game, [[0, 1, 1, 1], 0, [1, 2, 3], [0, 2, 3], 3, 96, [1, 1, 1, 1]], 'seat 0 alone, seats 1 to 3 one team at Easy, Hard and Brutal (the game counted at Brutal)');
    await page.evaluate(() => endfall.skip(20));
    assert.ok(await page.evaluate(() => [1, 2, 3].every(t => endfall.G.stats[t].built > 0) && !endfall.G.over), 'three allied AIs at work');
  } finally { await ctx.close(); }
});

test('single player, five to eight (M4 2e): the 128x128 maps; eight sides, four pairs and four against four fit a small phone; eight start on 128x128', async () => {
  const ctx = await browserContext({ ...PHONE, viewport: { width: 667, height: 375 } }), page = await ctx.newPage();
  try {
    await page.goto(baseUrl(), { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    const maps = () => page.$$eval('#maps .map', bs => bs.map(b => b.firstChild.textContent));
    const badges = () => page.$$eval('#maps .map .up', bs => bs.map(b => b.textContent));
    const seats = board(page);
    await page.locator('#btnSolo').tap();
    for (let n = 3; n <= 8; n++) {
      await seats.newSide(); // (+ SIDE: free for all)
      if (n < 5) continue;
      assert.deepEqual(await maps(), MAPS_128, `${n}: the 128x128 maps`);
      assert.deepEqual(await badges(), n === 8 ? [] : Array(4).fill('up to 8'), `${n}: a badge while a start stays free`);
      await fitsPage(page, `${n} players, each alone`);
    }
    assert.equal(await page.locator('#soloBoard .add, #soloBoard .newside').count(), 0, 'eight: no room for another');
    assert.equal((await seats.sides()).length, 8, 'eight sides');
    assert.equal(await page.locator('#mapPreview').evaluate(c => c.width), 128, 'the preview at the map\'s size');
    for (const i of [1, 3, 5, 7]) await seats.side(i, i >> 1); // (four pairs)
    assert.deepEqual(await seats.sides(), [['YOU', 'AI 1'], ['AI 2', 'AI 3'], ['AI 4', 'AI 5'], ['AI 6', 'AI 7']]);
    await fitsPage(page, 'four pairs');
    for (const [i, t] of [[2, 0], [3, 0], [6, 1], [7, 1]]) await seats.side(i, t);
    assert.deepEqual(await seats.sides(), [['YOU', 'AI 1', 'AI 2', 'AI 3'], ['AI 4', 'AI 5', 'AI 6', 'AI 7']]);
    await fitsPage(page, 'four against four');
    await page.locator('#btnStart').tap();
    await page.waitForFunction(() => endfall.G.units.length > 0);
    const eight = await page.evaluate(() => [endfall.G.teams, endfall.engine.MW, endfall.G.me, endfall.engine.foes(), [0, 1, 2, 3, 4, 5, 6, 7].map(t => endfall.G.bldgs.filter(b => b.team === t && b.d.hq).length)]);
    assert.deepEqual(eight, [[0, 0, 0, 0, 1, 1, 1, 1], 128, 0, [4, 5, 6, 7], [1, 1, 1, 1, 1, 1, 1, 1]], 'four against four, a base each, on 128x128');
    await page.evaluate(() => endfall.skip(20));
    assert.ok(await page.evaluate(() => [1, 2, 3, 4, 5, 6, 7].every(t => endfall.G.stats[t].built > 0)), 'seven AIs at work');
    // Six, three against three: you and two AIs.
    // (Out, and the page loaded again: eight armies drawn behind the menu in software WebGL leave it a frame a second.)
    await page.evaluate(() => { endfall.ui.watching = 0; document.getElementById('btnPause').click(); document.getElementById('btnQuit').click(); });
    await page.locator('#menuSolo').waitFor({ state: 'visible' });
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    await page.locator('#btnSolo').tap();
    assert.deepEqual(await seats.sides(), [['YOU', 'AI 1', 'AI 2', 'AI 3'], ['AI 4', 'AI 5', 'AI 6', 'AI 7']], 'the sides remembered');
    await seats.remove(7); await seats.remove(6); await seats.side(3, 1);
    assert.deepEqual(await seats.sides(), [['YOU', 'AI 1', 'AI 2'], ['AI 3', 'AI 4', 'AI 5']]);
    await page.locator('#btnStart').tap();
    await page.waitForFunction(() => endfall.G.units.length > 0 && endfall.G.teams.length === 6);
    assert.deepEqual(await page.evaluate(() => [endfall.G.teams, endfall.engine.MW]), [[0, 0, 0, 1, 1, 1], 128]);
  } finally { await ctx.close(); }
});

test('single player: the board and an open sheet fit every phone (667x375, 844x390, 412x915), eight seats included', async () => {
  const setups = {
    '1v1': [{ race: 'humans', team: 0 }, { race: 'humans', team: 1, diff: 0 }],
    '4v4': Array.from({ length: 8 }, (_, i) => (i ? { race: 'vael', team: i >> 2, diff: i % 4 } : { race: 'humans', team: 0 })),
    '2v2v2v2': Array.from({ length: 8 }, (_, i) => (i ? { race: 'random', team: i >> 1, diff: i % 4 } : { race: 'humans', team: 0 })),
    ffa8: Array.from({ length: 8 }, (_, i) => (i ? { race: 'vael', team: i, diff: i % 4 } : { race: 'humans', team: 0 })),
  };
  for (const [width, height] of [[667, 375], [844, 390], [412, 915]]) {
    for (const [name, rows] of Object.entries(setups)) {
      const ctx = await browserContext({ ...PHONE, viewport: { width, height } }), page = await ctx.newPage(); await cutCheck(page);
      try {
        await page.addInitScript((r) => localStorage.setItem('endfall.seats', JSON.stringify(r)), rows);
        await page.goto(baseUrl(), { waitUntil: 'networkidle' });
        await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
        await page.locator('#btnSolo').tap();
        await fitsPage(page, `${name} on ${width}x${height}`);
        assert.deepEqual(await page.evaluate(() => cutWords()), [], `${name} on ${width}x${height}: no word cut`);
        await board(page).open(rows.length - 1); await page.locator('#soloSheet [data-k="diff:2"]').tap(); // (HARD's line, the longest)
        assert.ok(await sheetFits(page), `${name} on ${width}x${height}: the sheet fits the screen`);
      } finally { await ctx.close(); }
    }
  }
});

test('single player, the sheet: a modal one; a double click changes nothing, a scrim tap closes it (one that began there), the arrow keys move along a row; a bad saved setup', async () => {
  const ctx = await browserContext(DESKTOP), page = await ctx.newPage();
  try {
    await page.addInitScript(() => { if (!sessionStorage.getItem('once')) { sessionStorage.setItem('once', '1'); localStorage.setItem('endfall.seats', '[{"race":"orcs"'); } });
    await page.goto(baseUrl(), { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    await page.locator('#btnSolo').click();
    assert.deepEqual(await board(page).sides(), [['YOU'], ['AI 1']], 'a saved setup that is not one: you and an AI');
    const saved = () => page.evaluate(() => localStorage.getItem('endfall.seats'));
    await board(page).add(1); const before = await saved();
    // A double click on a token opens its sheet and changes nothing (its second click lands on a chip).
    const tok = await page.locator('#soloBoard [data-k="tok1"]').boundingBox();
    await page.mouse.dblclick(tok.x + tok.width / 2, tok.y + tok.height / 2);
    assert.ok(await page.locator('#soloSheet').evaluate(d => d.open), 'open');
    assert.equal(await saved(), before, 'nothing changed');
    // The arrow keys: along RACE, each step a choice; + NEW SIDE is not one of SIDE's (a button of its own).
    assert.equal(await page.evaluate(() => document.activeElement.dataset.k), 'race:humans');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.k), 'race:vael');
    assert.match(await page.locator('#soloBoard [data-k="tok1"]').getAttribute('aria-label'), /^AI 1 VAEL,/);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await saved(), before, 'and back');
    assert.deepEqual(await page.$$eval('#soloSheet [role="radiogroup"][aria-label="Side"] [role="radio"]', bs => bs.map(b => b.textContent)), ['YOURS', 'SIDE 2']);
    assert.equal(await page.locator('#soloSheet [data-k="side:new"]').evaluate(b => !b.closest('[role="radiogroup"]')), true);
    // A press on the sheet let go on the scrim: still open. A click on the scrim: closed, the focus back on the token.
    const sh = await page.locator('#soloSheet .sheet').boundingBox();
    await page.mouse.move(sh.x + 30, sh.y + 15); await page.mouse.down(); await page.mouse.move(5, 5); await page.mouse.up();
    assert.ok(await page.locator('#soloSheet').evaluate(d => d.open), 'a drag out of the sheet does not close it');
    await page.waitForTimeout(400); await page.mouse.click(5, 5);
    assert.ok(await page.locator('#soloSheet').isHidden(), 'a click on the scrim closes it');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.k), 'tok1');
  } finally { await ctx.close(); }
  // A phone: a double tap on a token leaves its sheet open.
  const phone = await browserContext(PHONE), p2 = await phone.newPage();
  try {
    await p2.goto(baseUrl(), { waitUntil: 'networkidle' });
    await p2.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    await p2.locator('#btnSolo').tap();
    await p2.locator('#soloBoard [data-k="tok1"]').tap(); await p2.waitForTimeout(80); await p2.touchscreen.tap(...await p2.locator('#soloBoard [data-k="tok1"]').boundingBox().then(b => [b.x + b.width / 2, b.y + b.height / 2]));
    assert.ok(await p2.locator('#soloSheet').evaluate(d => d.open), 'a double tap: the sheet stays open');
    // Later, a chip and DONE tapped quickly one after the other (the browser may count them as a double tap): both count.
    await p2.waitForTimeout(700);
    const mid = (k) => p2.locator(`#soloSheet [data-k="${k}"]`).boundingBox().then(b => [b.x + b.width / 2, b.y + b.height / 2]);
    const [chip, done] = [await mid('race:vael'), await mid('done')];
    await p2.touchscreen.tap(...chip); await p2.waitForTimeout(150); await p2.touchscreen.tap(...done);
    await p2.waitForFunction(() => !document.getElementById('soloSheet').open, null, { timeout: 3000 });
    assert.match(await p2.locator('#soloBoard [data-k="tok1"]').getAttribute('aria-label'), /VAEL/);
  } finally { await phone.close(); }
});

test('single player: the record counts a game at its enemies\' level (a Brutal ally against an Easy enemy is an Easy game)', async () => {
  const ctx = await browserContext(DESKTOP), page = await ctx.newPage();
  try {
    await page.goto(`${baseUrl()}?seed=4242`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    await page.locator('#btnSolo').click();
    const seats = board(page);
    await seats.add(0); await seats.diff(2, 3); // (+ ALLY: AI 2 on your side, Brutal; AI 1 the enemy, Easy)
    assert.deepEqual(await seats.sides(), [['YOU', 'AI 2'], ['AI 1']]);
    await page.locator('#btnStart').click();
    await page.waitForFunction(() => endfall.G.units.length > 0);
    assert.deepEqual(await page.evaluate(() => [endfall.G.diff, endfall.engine.diffOf(1), endfall.engine.diffOf(2)]), [0, 3, 0], 'the game\'s level Easy, the ally Brutal');
    await page.evaluate(() => { endfall.ui.watching = 0; document.getElementById('btnPause').click(); });
    await page.locator('#btnQuit').click(); await page.locator('#btnSoloBack').click();
    assert.equal(await page.locator('#record').textContent(), 'Easy: 0 won · 1 lost', 'counted at Easy');
  } finally { await ctx.close(); }
});

test('single player: every split of five to eight fits 667x375, 844x390 and 412x915: no scrolling, no word cut, no heading wrapped', async () => {
  const parts = (n, max = n) => (n === 0 ? [[]] : Array.from({ length: Math.min(n, max) }, (_, j) => Math.min(n, max) - j).flatMap(k => parts(n - k, k).map(p => [k, ...p])));
  const splits = [5, 6, 7, 8].flatMap(n => Array.from({ length: n - 1 }, (_, m) => m + 1).flatMap(mine => parts(n - mine).map(p => [mine, ...p])));
  const rowsOf = (s) => s.flatMap((k, t) => Array.from({ length: k }, () => t)).map((team, i) => (i ? { race: 'vael', team, diff: 2, n: i } : { race: 'humans', team }));
  assert.equal(splits.length, 102);
  for (const [width, height] of [[667, 375], [844, 390], [412, 915]]) {
    const ctx = await browserContext({ ...PHONE, viewport: { width, height } }), page = await ctx.newPage(); await cutCheck(page);
    try {
      await page.goto(baseUrl(), { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
      const bad = [];
      for (const s of splits) {
        await page.evaluate((r) => localStorage.setItem('endfall.seats', JSON.stringify(r)), rowsOf(s));
        await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => !!window.endfall);
        await page.evaluate(() => document.getElementById('btnSolo').click());
        const r = await page.evaluate(() => {
          const c = document.querySelector('#start .card.menu');
          const cut = cutWords();
          const wrapped = [...document.querySelectorAll('#soloBoard .side .hd')].filter(e => e.getBoundingClientRect().height > 30).map(e => e.textContent);
          return { over: c.scrollHeight - c.clientHeight, overW: c.scrollWidth - c.clientWidth, cut, wrapped };
        });
        if (r.over > 1 || r.overW > 1 || r.cut.length || r.wrapped.length) bad.push(`${s.join('v')}: ${JSON.stringify(r)}`);
      }
      assert.deepEqual(bad, [], `${width}x${height}`);
    } finally { await ctx.close(); }
  }
});

test('two against two: out while the ally fights on (orders refused, told once), then the end card speaks for the team', async () => {
  const ctx = await browserContext(DESKTOP), page = await ctx.newPage();
  try {
    await page.goto(`${baseUrl()}?seed=7`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    await page.locator('#btnSolo').click();
    await board(page).diff(1, 2); await board(page).add(0); await board(page).add(1); // (you and an AI against two, all Hard)
    await page.locator('#btnStart').click();
    await page.waitForFunction(() => endfall.G.units.length > 0);
    assert.deepEqual(await page.evaluate(() => endfall.G.teams), [0, 0, 1, 1]);
    // An ally's trooper by our Core, clicked: an ally's, not an enemy's.
    const ally = await page.evaluate(() => { const b = endfall.G.bldgs.find(x => x.team === 0 && x.d.hq); const id = endfall.engine.debugSpawn(1, 'trooper', b.x + 100, b.y); const u = endfall.G.units.find(x => x.id === id); endfall.centerOn(u.x, u.y); return [u.x, u.y]; });
    const canvas = await page.locator('#game').boundingBox(), cam = await page.evaluate(() => ({ x: endfall.cam.x, y: endfall.cam.y, z: endfall.cam.zoom }));
    await page.mouse.click(canvas.x + (ally[0] - cam.x) * cam.z, canvas.y + (ally[1] - cam.y) * cam.z);
    await page.waitForFunction(() => endfall.ui.sel.length === 1 && endfall.ui.sel[0].team === 1);
    assert.equal(await page.locator('#selSub').textContent(), 'Ally', 'an ally, not an enemy');
    // This player gives no order: the enemies (Hard) take its base while its ally (Hard too) fights on.
    const toasts = new Set();
    await page.exposeFunction('sawToast', (t) => toasts.add(t));
    await page.evaluate(() => new MutationObserver(() => { for (const t of document.querySelectorAll('#msg .toast')) window.sawToast(t.textContent); }).observe(document.getElementById('msg'), { childList: true }));
    let out = false;
    for (let i = 0; i < 100 && !(await page.evaluate(() => endfall.G.over)); i++) {
      await page.evaluate(() => endfall.skip(30));
      await page.waitForTimeout(150); // (a frame or two: the loop notices)
      if (!out && await page.evaluate(() => endfall.G.out[0] && !endfall.G.over)) {
        out = true;
        // Out: an order from this seat changes nothing.
        const task = await page.evaluate(() => { const u = endfall.G.units.find(x => x.team === 0); if (!u) return 'idle'; endfall.engine.moveTo(u, 100, 100); endfall.skip(1); return u.dead ? 'idle' : u.task.t; });
        assert.equal(task, 'idle', 'a seat that is out gives no orders: its units stay idle');
        await page.waitForTimeout(300);
      }
    }
    assert.ok(await page.evaluate(() => endfall.G.over), 'the game ended');
    await page.locator('#end').waitFor({ state: 'visible' });
    const won = await page.evaluate(() => endfall.G.winner === endfall.G.teams[0]);
    assert.equal(await page.locator('#result').textContent(), won ? 'VICTORY' : 'DEFEAT');
    assert.match(await page.locator('#endSub').textContent(), won ? /^Your team wins after \d\d:\d\d\.$/ : /^Your team lost after \d\d:\d\d\.$/);
    assert.equal(await page.locator('#endKey .foe').textContent(), 'Enemy armies', 'the chart sums the enemies');
    assert.ok(out, "this seat was out before the end (seed 7: deterministic)");
    assert.ok([...toasts].some(t => /You are out: your team fights on/.test(t)), `told once out: ${[...toasts]}`);
  } finally { await ctx.close(); }
});

test('two against two: allies share vision: the AI ally\'s base and army are in our sight, on the field and on the minimap (framed)', async () => {
  const ctx = await browserContext(DESKTOP), page = await ctx.newPage();
  try {
    await page.goto(`${baseUrl()}?seed=7`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    await page.locator('#btnSolo').click();
    await board(page).add(0); await board(page).add(1); // (+ ALLY, + AI: you and an AI against two)
    await page.locator('#btnStart').click();
    await page.waitForFunction(() => endfall.G.units.length > 0);
    assert.deepEqual(await page.evaluate(() => endfall.G.teams), [0, 0, 1, 1]);
    await page.evaluate(() => endfall.skip(150)); // (the ally builds and trains; this player gives no order)
    await page.waitForTimeout(400); // (a frame or two: the minimap redrawn)
    const seen = await page.evaluate(() => {
      const { G, engine: E } = endfall, I = (x, y) => E.idx(Math.floor(x / E.TILE), Math.floor(y / E.TILE));
      const hq = G.bldgs.find(b => b.team === 1 && b.d.hq), mine = G.bldgs.find(b => b.team === 0 && b.d.hq);
      const army = G.units.filter(u => u.team === 1 && !u.d.worker), all = G.units.filter(u => u.team === 1);
      const mm = document.getElementById('minimap'), c = mm.getContext('2d'), k = mm.width / E.WW;
      const px = (x, y) => Array.from(c.getImageData(Math.floor(x * k), Math.floor(y * k), 1, 1).data.slice(0, 3));
      return {
        far: Math.hypot(hq.x - mine.x, hq.y - mine.y) / E.TILE,
        hqVis: G.vis[I(hq.x, hq.y)], hqSeen: E.visibleEnt(hq), army: army.length,
        allSeen: all.every(u => G.vis[I(u.x, u.y)] && E.visibleEnt(u)),
        hqPixel: px(hq.x, hq.y), frame: [hq.ty, hq.ty + 1, hq.ty + 2, hq.ty + 3].flatMap(ty => [1, 2].map(d => Array.from(c.getImageData(Math.floor(hq.tx * E.TILE * k) - d, Math.floor((ty + 0.5) * E.TILE * k), 1, 1).data.slice(0, 3)))), // (down its left side: a unit may stand on part of it)
        enemyHq: G.bldgs.filter(b => b.team >= 2 && b.d.hq).map(b => G.vis[I(b.x, b.y)]),
      };
    });
    assert.ok(seen.far > 20, `the ally's base is beyond our own sight (${seen.far} tiles)`);
    assert.ok(seen.hqVis && seen.hqSeen, 'the ally\'s base is in our fog-free area');
    assert.ok(seen.army > 0 && seen.allSeen, `the ally's units (${seen.army} fighters) are all in our sight`);
    const near = (p, q) => p.every((v, i) => Math.abs(v - q[i]) <= 24);
    assert.ok(near(seen.hqPixel, [0xc2, 0x2a, 0x5a]), `the ally's Core on the minimap in its seat's colour, clear of fog: ${seen.hqPixel}`);
    assert.ok(seen.frame.some(p => p.every(v => v >= 200)), `framed in white, an ally's: ${seen.frame.join(' ')}`);
    assert.deepEqual(seen.enemyHq, [0, 0], 'the enemies\' bases still in the fog');
  } finally { await ctx.close(); }
});

test('phone: picking a building shows no ghost until the finger is down; lifted on red it keeps placing, on green it builds', async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    await d.grant(500, 0);
    const s = await d.state(), core = coreOf(s), h = mine(s, 'harvester')[0];
    await d.clickEntity(h.id);
    await d.pressCard('Build'); await d.pressCard('Depot');
    assert.equal(await d.eval(() => endfall.ui.place.tx), -99, 'no ghost proposed');
    assert.match(await d.page.locator('#hint').textContent(), /Pick a location/);
    // On the Core: red. The order stays armed, with the reason.
    let [x, y] = await d.screen(core.x, core.y, false);
    await d.tapAt(x, y);
    assert.ok(await d.eval(() => !!endfall.ui.place), 'still placing after a red spot');
    assert.ok(!(await d.state()).bldgs.some(b => b.team === 0 && b.type === 'depot'), 'nothing built there');
    // A good spot: built there, and the order is done.
    const spot = await d.findSpot('depot', { tx: core.tx + 1, ty: core.ty + 1 });
    [x, y] = await d.screen((spot.tx + 1) * 32, (spot.ty + 1) * 32, false);
    await d.tapAt(x, y);
    await until(d, async () => (await d.state()).bldgs.some(b => b.team === 0 && b.type === 'depot' && b.tx === spot.tx && b.ty === spot.ty), { seconds: 5, step: 0.5, what: 'the Depot where the finger lifted' });
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('an enemy Observer is invisible and cannot be picked until something of ours detects it', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    const core = coreOf(await d.state()), at = { x: core.x + 200, y: core.y + 40 };
    const obs = await d.eval(([x, y]) => endfall.engine.debugSpawn(1, 'observer', x, y), [at.x, at.y]);
    await d.page.waitForTimeout(300);
    assert.equal(await d.eval((id) => endfall.engine.visibleEnt(endfall.G.units.find(u => u.id === id)), obs), false, 'not seen');
    await d.clickEntity(obs);
    assert.ok(!(await d.selection()).some(e => e.id === obs), 'a click there picks nothing of it');
    // Our own Observer beside it detects it: seen, and it can be picked.
    await d.eval(([x, y]) => endfall.engine.debugSpawn(0, 'observer', x, y), [at.x - 60, at.y]);
    await until(d, () => d.eval((id) => endfall.engine.visibleEnt(endfall.G.units.find(u => u.id === id)), obs), { seconds: 3, step: 0.5, what: 'detected' });
    await d.clickEntity(obs);
    assert.ok((await d.selection()).some(e => e.id === obs), 'picked once detected');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: a Wasp cloaks from its card once Cloaking Field is researched', async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    const core = coreOf(await d.state());
    const wasp = await d.eval(([x, y]) => endfall.engine.debugSpawn(0, 'wasp', x, y), [core.x + 160, core.y + 60]);
    await d.clickEntity(wasp);
    assert.ok((await d.card()).some(c => c.label === 'Cloak' && !c.enabled), 'locked before the tech');
    await d.eval(() => endfall.engine.debugResearch(0, 'cloakingField')); // (set-up: researched)
    await d.readyCard('Cloak'); // (the card is drawn again on a later frame: not the locked button it showed)
    await d.pressCard('Cloak');
    assert.equal(await d.eval((id) => endfall.G.units.find(u => u.id === id).boost, wasp), 'cloak', 'cloaked');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: a unit it cannot pay for shakes its button, with no toast over the game', async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    await d.page.waitForTimeout(3600); // (the opening hint fades)
    await d.eval(() => endfall.setResources(0, 0, 0));
    const core = coreOf(await d.state());
    await d.clickEntity(core.id);
    // (the shake lasts 0.35 s: watch for it rather than look afterwards)
    await d.page.evaluate(() => { window.__refused = false; new MutationObserver(() => { if (document.querySelector('#cmd .cb.refused')) window.__refused = true; }).observe(document.getElementById('cmd'), { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] }); });
    await d.pressCard('Harvester');
    assert.ok(await d.page.evaluate(() => window.__refused), 'the button shakes');
    assert.deepEqual(await d.toasts(), [], 'no toast');
    assert.equal((await d.state()).bldgs.find(b => b.id === core.id).queue.length, 0, 'nothing queued');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('the pause card reports what of theirs was seen lately; nothing in the fog counts', async () => {
  for (const dev of [DESKTOP, PHONE]) {
    const d = await newGame(dev, 1, 4242, { ai: false });
    try {
      const pause = async () => { await (d.touch ? d.page.locator('#btnPause').tap() : d.page.locator('#btnPause').click()); return d.page.locator('#pauseSeen'); };
      assert.equal(await (await pause()).textContent(), 'Nothing of theirs seen lately.');
      await (d.touch ? d.page.locator('#btnResume').tap() : d.page.locator('#btnResume').click());
      const core = coreOf(await d.state()), at = { x: core.x + 200, y: core.y + 40 };
      await d.eval(([x, y]) => {
        for (let i = 0; i < 3; i++) endfall.engine.debugSpawn(1, 'trooper', x + i * 20, y);
        endfall.engine.debugSpawn(1, 'vanguard', endfall.G.units.find(u => u.team === 1).x, endfall.G.units.find(u => u.team === 1).y); // (by the enemy's base: fogged)
      }, [at.x, at.y]);
      await d.skip(1);
      const seen = await pause();
      assert.match(await seen.textContent(), /^Seen lately: 3$/, await seen.textContent());
      assert.deepEqual(await d.page.$$eval('#pauseSeen .seen', s => s.map(e => e.title)), ['3 Trooper'], 'portraits and counts, not the one in the fog');
      assert.ok((await seen.boundingBox()).height < 40, 'one line (for a few kinds)');
      // Once they are destroyed they are no longer "out there".
      await (d.touch ? d.page.locator('#btnResume').tap() : d.page.locator('#btnResume').click());
      await d.eval(([x, y]) => { for (let i = 0; i < 4; i++) endfall.engine.debugSpawn(0, 'vanguard', x + i * 20, y + 40); }, [at.x, at.y]);
      await until(d, () => d.eval(() => !endfall.G.units.some(u => u.team !== endfall.G.me && u.type === 'trooper')), { seconds: 30, step: 1, what: 'the Troopers to fall' });
      assert.equal(await (await pause()).textContent(), 'Nothing of theirs seen lately.', 'the dead do not count');
      assert.deepEqual(d.errors, []);
    } finally { await d.close(); }
  }
});

test('the end card says what killed most of your units, and what beats it', async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    const core = coreOf(await d.state()), at = { x: core.x + 220, y: core.y + 60 };
    await d.eval(([x, y]) => { endfall.engine.debugSpawn(0, 'trooper', x, y); endfall.engine.debugSpawn(0, 'trooper', x + 20, y); endfall.engine.debugSpawn(1, 'monolith', x + 60, y); }, [at.x, at.y]);
    await until(d, () => d.eval(() => endfall.G.units.filter(u => u.team === 0 && u.type === 'trooper').length === 0), { seconds: 30, step: 2, what: 'the Troopers to fall' });
    await d.eval(() => endfall.engine.concede()); // (set-up: the game ends; the end card is what is tested)
    await d.page.locator('#end').waitFor({ state: 'visible' });
    const why = await d.page.locator('#endWhy').textContent();
    assert.match(why, /Most of your losses: to Monoliths \(2\)/, why);
    assert.match(await d.page.locator('#endSeen').textContent(), /^You saw: 1$/, 'what was scouted of their army, the whole game');
    assert.equal(await d.page.locator('#endSeen .seen').getAttribute('title'), '1 Monolith');
    assert.match(why, /beat Monoliths/, 'and what beats them');
    assert.ok((await d.page.locator('#endWhy').boundingBox()).height < 50, 'one or two lines, portraits inline');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('desktop: Shift+click on a unit queues five', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    await d.grant(2000, 0);
    const core = coreOf(await d.state());
    await d.clickEntity(core.id);
    await d.page.locator('#cmd button', { hasText: 'Harvester' }).click({ modifiers: ['Shift'] });
    assert.equal((await d.state()).bldgs.find(b => b.id === core.id).queue.length, 5, 'five Harvesters queued');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('the menu is a page of its own; a corner button beside the sound\'s goes full screen and leaves it', { engines: true }, async () => {
  for (const device of [DESKTOP, PHONE]) {
    const ctx = await browserContext(device), page = await ctx.newPage();
    try {
      await page.goto(baseUrl(), { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.endfall);
      const r = await page.locator('#start .card.menu').boundingBox(), v = page.viewportSize();
      assert.ok(r.width >= v.width - 1 && r.height >= v.height - 1, `the whole screen: ${JSON.stringify(r)}`);
      if (!await page.evaluate(() => endfall.status().fullscreenEnabled)) {
        // No full-screen API for a page (WebKit as an iPhone, like iPhone Safari): no button for it.
        assert.ok(await page.locator('#btnUnfull').isHidden(), 'no full-screen button where the page cannot have it');
        continue;
      }
      // Full screen is stood in for (a headless browser's real one resizes the page under the test).
      await page.evaluate(() => {
        Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => (window.fs ? document.documentElement : null) });
        document.documentElement.requestFullscreen = async () => { window.fs = true; window.went = true; document.dispatchEvent(new Event('fullscreenchange')); };
        document.exitFullscreen = async () => { window.fs = false; window.left = true; document.dispatchEvent(new Event('fullscreenchange')); };
      });
      const btn = page.locator('#btnUnfull'), tap = () => (device.hasTouch ? btn.tap() : btn.click());
      assert.ok(await btn.isVisible(), 'out of full screen: the button to go in');
      assert.equal(await btn.getAttribute('aria-label'), 'Full screen');
      const b = await btn.boundingBox();
      assert.ok(b && b.x + b.width > v.width - 140 && b.y < 70, `top right, by the sound: ${JSON.stringify(b)}`);
      await tap();
      assert.ok(await page.evaluate(() => window.went), 'went full screen');
      assert.equal(await btn.getAttribute('aria-label'), 'Leave full screen', 'now it leaves');
      await tap();
      assert.ok(await page.evaluate(() => window.left), 'left full screen');
      assert.equal(await btn.getAttribute('aria-label'), 'Full screen', 'and offers it again');
      const sc = await page.locator('#start .card.menu').evaluate(e => [e.scrollHeight, e.clientHeight]);
      assert.ok(sc[0] <= sc[1] + 1, `fits without scrolling: ${sc}`);
    } finally { await ctx.close(); }
  }
});

test('a game\'s sound and full-screen buttons, for real: sound is on after START, goes off and on; full screen goes out and back in where the browser has it', { engines: true }, async () => {
  for (const device of [DESKTOP, PHONE]) {
    const d = await newGame(device, 1, 4242, { ai: false });
    try {
      const status = () => d.eval(() => endfall.status());
      const press = (sel) => (d.touch ? d.page.locator(sel).tap() : d.page.locator(sel).click());
      const full = (want) => d.page.waitForFunction((w) => endfall.status().fullscreen === w, want, { timeout: 10000 });
      // START was a tap, so the sound engine is up. Chromium's headless audio runs; WebKit and Firefox find no audio
      // device on a server, so there the context stays suspended (a phone or a desktop plays it: tools/devices checks).
      await d.page.waitForFunction((running) => (running ? endfall.status().audio === 'running' : endfall.status().audio !== 'none'), ENGINE === 'chromium', { timeout: 10000 });
      assert.equal((await status()).muted, false, 'sound on by default');
      await press('#btnSound');
      assert.equal(await d.page.locator('#btnSound').getAttribute('aria-pressed'), 'false');
      assert.equal((await status()).muted, true, 'the sound button mutes');
      await press('#btnSound');
      assert.equal((await status()).muted, false, 'and unmutes');
      if ((await status()).fullscreenEnabled) { // (the browser's word on whether a page may go full screen: not iPhone Safari)
        await full(true); // (START asked for it; the change can land a few frames later)
        await press('#btnFull'); await full(false);
        await press('#btnFull'); await full(true);
      } else assert.equal((await status()).fullscreen, false, 'never full screen where the page cannot have it (iPhone Safari)');
      assert.deepEqual((await status()).errors, [], 'no page errors');
      assert.deepEqual(d.errors, []);
    } finally { await d.close(); }
  }
});

test('phone: while placing, the ghost appears under the finger and follows it; lifted over the HUD it builds nothing', { chromium: CDP_TOUCH }, async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    await d.grant(500, 0);
    const s = await d.state(), core = coreOf(s), h = mine(s, 'harvester')[0];
    await d.clickEntity(h.id);
    await d.pressCard('Build'); await d.pressCard('Depot');
    const spot = await d.findSpot('depot', { tx: core.tx + 1, ty: core.ty + 1 });
    const [x, y] = await d.screen((spot.tx + 1) * 32, (spot.ty + 1) * 32, false);
    await d.touchDown(x + 60, y);
    assert.notEqual(await d.eval(() => endfall.ui.place.tx), -99, 'a ghost under the finger');
    // Slid onto the Cancel button and lifted there: nothing built, still placing.
    const c = await d.page.locator('#cmd button', { hasText: 'Cancel' }).boundingBox();
    await d.touchMove(c.x + c.width / 2, c.y + c.height / 2);
    assert.equal(await d.eval(() => endfall.ui.place.tx), -99, 'no ghost while over the HUD');
    await d.touchUp();
    assert.ok(await d.eval(() => !!endfall.ui.place), 'still placing');
    assert.ok(!(await d.state()).bldgs.some(b => b.team === 0 && b.type === 'depot'), 'nothing built under the button');
    // Down elsewhere, slid onto the spot, lifted: built where it lifted.
    await d.touchDown(x + 60, y); await d.touchMove(x + 30, y); await d.touchMove(x, y); await d.touchUp();
    await until(d, async () => (await d.state()).bldgs.some(b => b.team === 0 && b.type === 'depot' && b.tx === spot.tx && b.ty === spot.ty), { seconds: 5, step: 0.5, what: 'the Depot where the finger lifted' });
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('the menu fits a small phone on every page (the first with the iPhone tip shown), each heading in view', async () => {
  const ctx = await browserContext({ ...PHONE, viewport: { width: 667, height: 375 } }), page = await ctx.newPage();
  try {
    await page.goto(baseUrl(), { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall);
    await page.evaluate(() => { document.getElementById('iosTip').hidden = false; });
    const fits = async (card, heading, what) => {
      const sc = await page.locator(card).evaluate(e => [e.scrollHeight, e.clientHeight]), top = (await page.locator(heading).boundingBox()).y;
      assert.ok(top >= 0, `${what}: the heading in view: ${top}`);
      assert.ok(sc[0] <= sc[1] + 1, `${what}: fits without scrolling: ${sc}`);
    };
    assert.ok(await page.locator('#btnFirstHome').isVisible(), 'with FIRST GAME (a newcomer)');
    await fits('#start .card.menu', '#menuHome h1', 'the first page');
    await page.locator('#btnAbout').tap();
    await fits('#start .card.menu', '#menuAbout h2', 'about');
    const b = await page.locator('#btnAboutBack').boundingBox();
    assert.ok(b.y + b.height <= 375, `About's BACK in view: ${JSON.stringify(b)}`);
    await page.locator('#btnAboutBack').tap();
    await page.locator('#btnSolo').tap();
    await fits('#start .card.menu', '#menuSolo h2', 'single player');
    await page.locator('#btnSoloBack').tap(); await page.locator('#btnOnline').tap();
    await fits('#online .card.menu', '#onlineJoin h2', 'multiplayer');
  } finally { await ctx.close(); }
});

test('the first page: the name in title case over the shore, whose tide lines keep below the content (the iPhone tip too), go with the page and stand still under reduced motion', { skip: notIn(['webkit'], IPHONE) }, async () => {
  for (const [w, h, reducedMotion, tip] of [[844, 390, 'no-preference', false], [667, 375, 'no-preference', false], [412, 915, 'reduce', false], [932, 430, 'no-preference', true], [568, 320, 'no-preference', true]]) {
    const ctx = await browserContext({ ...PHONE, viewport: { width: w, height: h }, reducedMotion }), page = await ctx.newPage();
    try {
      await page.goto(baseUrl(), { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.endfall);
      if (tip) await page.evaluate(() => { document.getElementById('iosTip').hidden = false; document.getElementById('record').textContent = 'RECORD 3 WINS - 1 LOSS'; });
      assert.equal(await page.locator('#menuHome h1').textContent(), 'Ebbfall', 'the title');
      const ebbs = () => page.evaluate(() => document.getAnimations().filter(a => a.animationName === 'ebb').length);
      const shore = page.locator('#menuHome .shore');
      assert.ok(await shore.isVisible(), `${w}x${h}: the shore under the first page`);
      // At both extremes of the drift (the animations paused and seeked, their negative delays dropped), every tide line shown keeps under the page's lowest content with room, and no drifting svg shows an edge inside the screen.
      for (const at of [0, 1]) {
        const got = await page.evaluate((at) => {
          for (const a of document.getAnimations()) if (a.animationName === 'ebb') { a.effect.updateTiming({ delay: 0 }); a.pause(); a.currentTime = at * a.effect.getTiming().duration; }
          const r = (e) => e.getBoundingClientRect(), shown = (e) => r(e).height > 0;
          return { content: Math.max(...[...document.querySelectorAll('#menuHome > :not(.shore)')].filter(e => !e.hidden).map(e => r(e).bottom)),
            lines: [...document.querySelectorAll('#menuHome .shore .tide path')].filter(shown).map(e => r(e).top), boxes: [...document.querySelectorAll('#menuHome .shore .tide')].filter(shown).map(e => { const b = r(e); return [b.left, b.right, b.bottom]; }) };
        }, at);
        assert.ok(got.lines.length > 0 && got.lines.every(top => top >= got.content + 12), `${w}x${h} at ${at}: the tide lines clear the content: ${got.lines.map(Math.round)} vs ${Math.round(got.content)}`);
        assert.ok(got.boxes.every(([l, r, b]) => l <= 0 && r >= w && b >= h), `${w}x${h} at ${at}: no edge of a drifting line in view: ${JSON.stringify(got.boxes)}`);
      }
      await page.evaluate(() => { for (const a of document.getAnimations()) a.play(); });
      assert.equal(await page.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight - 4).closest('.shore')), null, 'the shore takes no pointer');
      assert.equal(await ebbs(), reducedMotion === 'reduce' ? 0 : tip ? 1 : 3, `${w}x${h}: the lines shown drift (none under reduced motion)`);
      await page.locator('#btnAbout').tap();
      assert.ok(await shore.isHidden() && await page.locator('#menuAbout').isVisible(), 'About: no shore');
      assert.equal(await ebbs(), 0, 'the lines stop with the page');
    } finally { await ctx.close(); }
  }
  // In a game (the menu hidden), nothing of it runs either.
  const d = await newGame(PHONE, 0, 4242, { ai: false });
  try {
    assert.ok(await d.page.locator('#start').isHidden() && await d.page.locator('#menuHome .shore').isHidden());
    assert.equal(await d.eval(() => document.getAnimations().filter(a => a.animationName === 'ebb').length), 0, 'no drift in a game');
  } finally { await d.close(); }
});


test('the end card can WATCH the game again: from the start, faster, both sides in view, no orders, back to the card', async () => {
  for (const dev of [DESKTOP, PHONE]) {
    const d = await newGame(dev, 0, 4242);
    const tap = (sel) => d.touch ? d.page.locator(sel).tap() : d.page.locator(sel).click();
    try {
      // A short game with a few orders in it (set-up: the action under test is WATCH).
      await d.eval(() => { const h = endfall.G.units.filter(u => u.team === endfall.G.me && u.d.worker); endfall.engine.moveTo(h[0], h[0].x + 120, h[0].y + 40); endfall.engine.moveTo(h[1], h[1].x - 80, h[1].y + 60); });
      await d.skip(20);
      await d.eval(() => endfall.engine.concede());
      const played = await d.eval(() => endfall.G.tick); // (after: the game runs on between calls until it is over)
      await d.page.locator('#end').waitFor({ state: 'visible' });
      const record = await d.eval(() => localStorage.getItem('endfall.record'));
      assert.ok(await d.page.locator('#btnWatch').isVisible(), 'WATCH on the end card');
      await tap('#btnWatch');
      assert.ok(await d.page.locator('#end').isHidden() && await d.page.locator('#replayBar').isVisible(), 'the replay plays, with its bar');
      assert.ok(await d.eval(() => endfall.G.tick) < played / 2, 'from the first tick');
      assert.equal(await d.page.locator('#btnSpeed').textContent(), '4×');
      assert.ok(await d.page.locator('#cmd').evaluate(e => getComputedStyle(e).visibility === 'hidden'), 'no command card');
      // Both sides in view: the enemy's base is not fogged.
      assert.ok(await d.eval(() => endfall.G.bldgs.filter(b => b.team !== endfall.G.me).every(b => endfall.engine.visibleEnt(b))), 'both sides in view');
      // PAUSE in a replay: the replay waits; BACK TO REPLAY, or DONE (no restarting, nothing given up).
      await tap('#btnPause');
      const shown = await d.page.$$eval('#pause .pausegrid button', bs => bs.filter(b => !b.hidden).map(b => b.textContent));
      assert.deepEqual(shown, ['BACK TO REPLAY', 'DONE'], 'the replay\'s pause card');
      assert.match(await d.page.locator('#pauseTime').textContent(), /^\d+:\d\d into the replay\.$/);
      const t0 = await d.eval(() => endfall.G.tick); await d.page.waitForTimeout(500);
      assert.equal(await d.eval(() => endfall.G.tick), t0, 'the replay waits');
      await tap('#btnResume');
      await d.page.waitForFunction((t0) => endfall.G.tick > t0, t0, { timeout: 5000 });
      await tap('#btnSpeed');
      assert.equal(await d.page.locator('#btnSpeed').textContent(), '8×', 'faster');
      // It ends where the game ended, back on the end card, the record unchanged.
      await d.page.locator('#end').waitFor({ state: 'visible', timeout: 60000 });
      assert.ok(await d.page.locator('#replayBar').isHidden());
      const at = await d.eval(() => [endfall.G.tick, endfall.G.over, endfall.engine.replayEnd()]);
      assert.ok(at[1] && Math.abs(at[0] - played) <= 1, `it ran to where the game ended, and it is over: ${at} vs ${played}`);
      assert.equal(await d.eval(() => localStorage.getItem('endfall.record')), record, 'not counted again');
      // Watch again and leave early with DONE (the bar's, then the pause card's); then once more to the end: still
      // counted once.
      await tap('#btnWatch');
      await tap('#btnReplayDone');
      assert.ok(await d.page.locator('#end').isVisible() && await d.page.locator('#replayBar').isHidden(), 'DONE: back to the card');
      await tap('#btnWatch');
      await tap('#btnPause'); await tap('#btnPauseDone');
      assert.ok(await d.page.locator('#end').isVisible() && await d.page.locator('#replayBar').isHidden() && await d.page.locator('#pause').isHidden(), 'the pause card\'s DONE: back to the card');
      await tap('#btnWatch');
      await tap('#btnSpeed'); // (8×)
      await d.page.locator('#end').waitFor({ state: 'visible', timeout: 60000 });
      await d.page.waitForTimeout(500); // (a few frames after the end: nothing may count the game again)
      assert.equal(await d.eval(() => localStorage.getItem('endfall.record')), record, 'watched to the end twice, counted once');
      await tap('#btnRematch');
      await d.page.waitForFunction(() => endfall.G.time < 2 && !endfall.G.over, null, { timeout: 5000 });
      assert.ok(!await d.eval(() => document.body.classList.contains('replay')), 'a new game has its card back (empty until something is selected)');
      assert.deepEqual(d.errors, []);
    } finally { await d.close(); }
  }
});

test('an attack by something unseen says so, even on screen, and names what detects it', async () => {
  for (const [dev, race, finds] of [[DESKTOP, 'humans', /^Unseen attacker: Turrets and Observers detect$/], [PHONE, 'vael', /^Unseen attacker: Wards detect$/]]) {
    const d = await newGame(dev, 1, 4242, { ai: false, race });
    try {
      await d.page.waitForTimeout(3600); // (the opening hint fades)
      const core = await d.eval(() => { const b = endfall.G.bldgs.find(b => b.team === endfall.G.me && b.d.hq); return { x: b.x, y: b.y }; }); // (either race's headquarters)
      await d.eval(([x, y]) => endfall.centerOn(x, y), [core.x, core.y]); // (the attack is on screen)
      // (set-up: the sim's alert for a hit by a cloaked attacker, as tests/gameplay/cloak.rs has it emit)
      await d.eval(([x, y]) => endfall.G.events.push({ t: 'attacked', x, y, building: true, unseen: true }), [core.x, core.y]);
      await d.page.waitForFunction(() => [...document.querySelectorAll('#msg .toast')].some(t => /Unseen attacker/.test(t.textContent)), null, { timeout: 10000 }); // (the next frame drains it)
      const t = (await d.toasts()).find(x => /Unseen attacker/.test(x));
      assert.match(t, finds, t);
      assert.ok(await d.page.$$eval('#msg .toast', ts => ts.every(t => t.getBoundingClientRect().height < 30)), 'one line');
      // An ordinary attack on screen still makes no toast.
      await d.eval(([x, y]) => endfall.G.events.push({ t: 'attacked', x: x + 40, y, building: true, unseen: false }), [core.x, core.y]);
      await d.page.waitForFunction(() => endfall.G.events.length === 0, null, { timeout: 10000 }); // (drained by a frame)
      assert.equal((await d.toasts()).filter(x => /under attack/.test(x)).length, 0, 'no siren for a fight in view');
      assert.deepEqual(d.errors, []);
    } finally { await d.close(); }
  }
});

test('desktop: the HUD floats over the map: no band across the bottom, the console between the minimap and the card', { skip: notIn(['webkit', 'firefox'], ESC_LEAVES_FULL_SCREEN) }, async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    const h = (await d.state()).units.find(u => u.team === 0 && u.type === 'harvester');
    await d.clickEntity(h.id);
    await d.hudText('#selName', /^Harvester$/);
    const vp = d.page.viewportSize();
    const [stage, mm, info, cmd] = await Promise.all(['#stage', '#minimap', '#info', '#cmd'].map(q => d.page.locator(q).boundingBox()));
    assert.ok(stage.y + stage.height >= vp.height - 12, `the map reaches the bottom of the window: ${JSON.stringify(stage)}`);
    for (const [n, b] of [['minimap', mm], ['console', info], ['card', cmd]]) assert.ok(b.y >= stage.y && b.y + b.height <= stage.y + stage.height, `the ${n} sits over the map`);
    assert.ok(mm.x < info.x && info.x + info.width < cmd.x, 'minimap left, console in the middle, card right');
    const mid = (mm.x + mm.width + cmd.x) / 2;
    assert.ok(Math.abs(info.x + info.width / 2 - mid) < 4, 'the console is centred between the minimap and the card');
    // The hint and the toasts stay clear of the minimap.
    await d.grant(500, 0);
    await d.pressCard('Build'); await d.pressCard('Depot');
    const hint = await d.page.locator('#hint').boundingBox();
    assert.ok(hint, 'placing a building shows the hint');
    assert.ok(hint.y + hint.height <= mm.y + 1, 'the hint is above the minimap');
    await d.key('Escape');
    await d.pressCard('Build'); await d.pressCard('Turret'); // (it needs a Garrison first: a "Requires" refusal is a toast; a cost one only shakes the button)
    await d.page.locator('#msg .toast', { hasText: /^Requires/ }).waitFor({ timeout: 5000 });
    const toast = await d.page.locator('#msg .toast', { hasText: /^Requires/ }).boundingBox();
    assert.ok(toast.y + toast.height <= mm.y + 1, 'toasts are above the minimap');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('every unit and building is drawn twice: its art, then its team mask in its seat\'s colour', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    const core = coreOf(await d.state());
    const ids = await d.eval(([x, y]) => [endfall.engine.debugSpawn(0, 'vanguard', x, y), endfall.engine.debugSpawn(1, 'scythe', x + 40, y)], [core.x - 60, core.y + 90]);
    await d.centerOn(core.x - 40, core.y + 60);
    const read = () => d.eval(() => ({ layers: endfall.teamLayers().filter(l => l.shown), tints: [0, 1].map(endfall.seatTint),
      teams: Object.fromEntries([...endfall.G.units, ...endfall.G.bldgs].map(e => [e.id, e.team])) }));
    await d.page.waitForFunction((ids) => ids.every(id => endfall.teamLayers().some(l => l.id === id && l.shown)), ids, { timeout: 15000 }); // (real time: no fight yet)
    const { layers, teams, tints } = await read();
    assert.notEqual(tints[0], tints[1]);
    assert.ok(layers.some(l => teams[l.id] === 1) && layers.some(l => l.base.startsWith('bldg_')), 'units of both seats and a building');
    for (const l of layers) {
      assert.equal(l.mask, `${l.base}_m`, `${l.base}: its mask`);
      assert.ok(l.maskOver, `${l.base}: the mask above the art`);
      assert.equal(l.seat, tints[teams[l.id]], `${l.base}: its seat's colour`);
      assert.equal(l.tint, l.seat, `${l.base}: the mask tinted with it (no effect on)`);
    }
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});
