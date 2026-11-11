// End-to-end gameplay through the real UI in a headless browser (Chromium; ENDFALL_ENGINE=webkit or firefox runs the
// scenarios marked `engines: true` there). Run: npm run build && npm run test:e2e
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SEAT_COLORS } from '../../src/client/look.js';
import { test, start, stop, newGame, until, browserContext, baseUrl, board, DESKTOP, PHONE, CDP_TOUCH, ENGINE, notIn, IPHONE } from './harness.mjs';

before(start);
after(stop);

const mine = (s, type) => s.units.filter(u => u.team === 0 && u.type === type);
const myBldg = (s, type) => s.bldgs.filter(b => b.team === 0 && b.type === type);
const coreOf = (s) => myBldg(s, 'core')[0];
/** The player's record on this device as stored (menu.js: [won, lost] per race and difficulty), not shown any more. */
const storedRecord = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('endfall.record')) || {}; } catch { return {}; } });

/** Build `type` through the UI next to the headquarters and wait until it is finished. Returns the building. (The
 *  Expedition: `{ hq: 'conflux', worker: 'lumen' }`.) */
async function buildAndFinish(d, hotkey, type, harvesterIndex = 0, { hq = 'core', worker = 'harvester' } = {}) {
  let s = await d.state();
  const core = myBldg(s, hq)[0], spot = await d.findSpot(type, { tx: core.tx + 1, ty: core.ty + 1 });
  assert.ok(spot, `room for a ${type}`);
  const h = mine(s, worker)[harvesterIndex];
  await d.buildWithUI(hotkey, type, spot.tx, spot.ty, h.id);
  s = await d.state();
  const b = s.bldgs.find(b => b.team === 0 && b.type === type && b.tx === spot.tx && b.ty === spot.ty);
  assert.ok(b, `${type} placed (toasts: ${(await d.toasts()).join(' | ')})`);
  assert.ok(await d.skipUntil((id) => endfall.G.bldgs.find(x => x.id === id)?.done, b.id, { seconds: 120 }), `${type} to finish within 120 s of game time (toasts: ${(await d.toasts()).join(' | ')})`);
  return b;
}

/** The 128x128 maps the menus offer (src/client/maps.js), as their buttons read. */

test('a depot built through the UI finishes and raises supply', { engines: true }, async () => {
  const d = await newGame(DESKTOP);
  try {
    await d.grant(500, 0);
    await buildAndFinish(d, 'w', 'depot');
    assert.deepEqual((await d.state()).sup[1], 28); // (the Castle's 20 and the Cottage's 8)
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('every finished production building offers its unit, and pressing it trains one', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    await d.grant(5000, 5000);
    await buildAndFinish(d, 'w', 'depot', 0); // supply for one of each
    const rax = await buildAndFinish(d, 'c', 'barracks', 0);
    const forge = await buildAndFinish(d, 'k', 'forge', 1);
    await buildAndFinish(d, 'o', 'turret', 2);
    await buildAndFinish(d, 'x', 'extractor', 3); // (the Stables need a Market)
    const airfield = await buildAndFinish(d, 'f', 'airfield', 3);
    const factory = await buildAndFinish(d, 's', 'factory', 0);
    // (the Kingdom's lists: Barracks, Blacksmith, Stables)
    for (const [b, label, unit] of [[coreOf(await d.state()), 'Villager', 'harvester'], [rax, 'Guard', 'trooper'], [rax, 'Archer', 'lancer'], [factory, 'Ballista', 'bastion'], [factory, 'Trebuchet', 'siegeTank'], [factory, 'Balloon', 'observer'], [airfield, 'Rider', 'rider'], [airfield, 'Knight', 'knight']]) {
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

test('knights appear once a forge stands, and a balloon floats straight across the map', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    await d.grant(5000, 5000);
    await buildAndFinish(d, 'c', 'barracks', 0);
    await buildAndFinish(d, 'x', 'extractor', 1); // (the Stables need a Market)
    const airfield = await buildAndFinish(d, 'f', 'airfield', 1);
    await d.clickEntity(airfield.id);
    const card = await d.card();
    assert.ok(card.some(c => c.label === 'Rider' && c.enabled), 'Rider available');
    assert.ok(!card.some(c => c.label === 'Knight'), `no Knight before a Blacksmith stands: ${JSON.stringify(card)}`);
    await d.key('n'); // (its key does nothing while it is hidden)
    assert.equal((await d.state()).bldgs.find(b => b.id === airfield.id).queue.length, 0, 'nothing queued');
    await buildAndFinish(d, 'k', 'forge', 2);
    await d.clickEntity(airfield.id);
    await d.readyCard('Knight'); // (there once the Blacksmith stands)
    const factory = await buildAndFinish(d, 's', 'factory', 3);
    await d.clickEntity(factory.id);
    await d.pressCard('Balloon');
    const raider = await until(d, async () => mine(await d.state(), 'observer')[0], { seconds: 40, what: 'a balloon' });
    // Float it to the far side of the map: a flyer goes straight, so it covers ~1300 px in under 20 s at its slow pace.
    // (it may still be by the Blacksmith: a click there can take the building, so until it is the selection)
    for (let i = 0; i < 8 && !(await d.selection()).some(e => e.id === raider.id); i++) { await d.skip(1); await d.clickEntity(raider.id); }
    assert.ok((await d.selection()).some(e => e.id === raider.id), 'the balloon selected');
    // Straight across the map (through the centre, wherever the bases are), over whatever rock lies between.
    const W = await d.eval(() => endfall.engine.WW), H = await d.eval(() => endfall.engine.WH);
    const dx = W / 2 - raider.x, dy = H / 2 - raider.y, len = Math.hypot(dx, dy) || 1; // 1300 px towards (and past) the centre
    const target = { x: Math.round(raider.x + dx / len * 1300), y: Math.round(raider.y + dy / len * 1300) };
    await d.rightClickWorld(target.x, target.y);
    await d.skip(21);
    const now = (await d.state()).units.find(u => u.id === raider.id);
    assert.ok(Math.hypot(now.x - target.x, now.y - target.y) < 60, `balloon at ${Math.round(now.x)},${Math.round(now.y)}, target ${target.x},${target.y}`);
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
    await d.buildWithUI('w', 'depot', spot.tx, spot.ty, h.id);
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
    await d.buildWithUI('c', 'barracks', spot.tx, spot.ty, mine(s, 'harvester')[0].id);
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
    await d.pressCard('Villager'); await d.pressCard('Villager');
    await d.skip(3);
    assert.match(await d.hudText('#selSub', /^Training$/), /Training/);
    assert.equal(await d.page.locator('#queue .qi').count(), 2);
    const w0 = await d.page.locator('#queue .prod i').evaluate(e => parseFloat(e.style.width));
    await d.skip(3); // (the panel redraws on the next frame: wait for it)
    await d.page.waitForFunction((w) => parseFloat(document.querySelector('#queue .prod i').style.width) > w, w0, { timeout: 10000 });
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('a Market built in the base earns gold by itself; one per Castle', async () => {
  const d = await newGame(DESKTOP);
  try {
    await d.grant(1000, 0);
    // (the Market needs the Barracks; it goes up in the base, no shaft)
    await buildAndFinish(d, 'c', 'barracks', 3);
    const ext = await buildAndFinish(d, 'x', 'extractor', 0);
    await d.clickEntity(ext.id);
    assert.match(await d.hudText('#selSub', /Earning/), /Earning gold/, 'the panel says it earns');
    // A second one: refused while one Castle stands.
    const s = await d.state(), core = coreOf(s), h = mine(s, 'harvester')[1];
    const spot = await d.findSpot('extractor', { tx: core.tx + 1, ty: core.ty + 1 });
    await d.buildWithUI('x', 'extractor', spot.tx, spot.ty, h.id);
    await d.page.locator('#msg .toast', { hasText: /One Market per Castle/ }).waitFor({ timeout: 5000 });
    assert.equal(myBldg(await d.state(), 'extractor').length, 1, 'still one');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: tap selects, the command card works, the HUD shows status, back asks before leaving', { engines: true }, async () => {
  const d = await newGame(PHONE);
  try {
    await d.grant(1000, 0);
    // A Villager standing still at its crystal: a walking one can leave the tap's point on a slow engine (Firefox).
    const miner = () => d.eval(() => endfall.G.units.find(u => u.team === 0 && u.task.t === 'gather' && u.task.phase === 'mine')?.id);
    const hId = await until(d, miner, { seconds: 20, step: 0.2, what: 'a Villager mining' });
    const s = await d.state();
    await d.clickEntity(hId);
    assert.equal((await d.selection())[0]?.type, 'harvester', 'tapping a harvester selects it');
    assert.equal(await d.hudText('#selName', /^Villager$/), 'Villager');
    const [mm, info, cmd] = await Promise.all(['#minimap', '#info', '#cmd'].map(q => d.page.locator(q).boundingBox()));
    assert.ok(info.x >= mm.x + mm.width && info.x + info.width <= cmd.x, 'the console sits between the minimap and the command card');
    const vh = await d.eval(() => innerHeight); // (390, or more where full screen takes the whole display: Firefox)
    assert.ok(info.height <= 70 && info.y + info.height <= vh && info.y >= vh - 80, `low, at the bottom of the screen: ${JSON.stringify(info)} in ${vh}`);
    assert.deepEqual((await d.card()).map(c => c.label), ['Build', 'Gather', 'Repair', 'Attack', 'Hold', 'Deselect'], 'a Villager card: three a row, leading with Build, Deselect last');
    await d.pressCard('Build');
    const depot = d.page.locator('#cmd button', { hasText: 'Cottage' });
    assert.ok(await depot.locator('.c').isVisible(), 'costs show on the phone');
    assert.equal(await depot.locator('.c .s').textContent(), '100');
    assert.ok(await depot.locator('img.por').count(), 'the Cottage button has a portrait');
    await d.pressCard('Back');
    await d.clickEntity(coreOf(s).id);
    await d.pressCard('Villager');
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

test('Q selects the army, the idle-harvester key, and double-click selects all of a type on screen', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    const s = await d.state(), core = coreOf(s);
    const ids = await d.eval(([x, y]) => [0, 1, 2].map(i => endfall.engine.debugSpawn(0, 'trooper', x + i * 24, y)), [core.x + 140, core.y - 40]);
    assert.ok(!(await d.page.locator('#btnArmy').isVisible()), 'no ARMY button with a keyboard (the touch screens\' one goes with SELECT): Q');
    await d.key('q');
    assert.deepEqual((await d.selection()).map(u => u.id).sort(), ids.slice().sort(), 'Q selects every combat unit');
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
    await d.page.waitForFunction((t0) => endfall.G.time > t0, t0, { timeout: 15000 }); // (throws if time stays still; generous: a busy machine may give the page a frame a second)
    await d.page.locator('#btnPause').click();
    const t1 = await d.eval(() => endfall.G.time);
    await d.page.locator('#btnResume').click();
    assert.ok(await d.page.locator('#pause').isHidden(), 'BACK TO GAME closes the card');
    await d.page.waitForFunction((t1) => endfall.G.time > t1, t1, { timeout: 15000 });
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
    const rax = await buildAndFinish(d, 'c', 'barracks', 0);
    const forge = await buildAndFinish(d, 'k', 'forge', 1);
    // The Barracks trains the infantry (the machines come from the Workshop, the cavalry from the Stables); the Forge
    // only researches.
    await d.clickEntity(rax.id);
    await d.pressCard('Archer');
    let slots = await d.page.$$eval('#cmd > *', els => els.map(e => e.querySelector('.l')?.textContent || ''));
    assert.deepEqual(slots, ['Guard', 'Archer', 'Rally', '', '', 'Cancel'], 'the Barracks card');
    await d.page.locator('#cmd > :nth-child(6)').click(); // cancel the Archer
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
    assert.deepEqual(slots.filter(Boolean), ['Weapons I', 'Armor I', 'Cancel', 'Shield Drill', 'Master Builders'], 'the Blacksmith card: research and its cancel, the techs below');
    const before = (await d.state()).res;
    await d.page.locator('#cmd > :nth-child(3)').click(); // cancel the research
    const after = (await d.state()).res;
    assert.ok(after[0] - before[0] >= 100 && after[1] === before[1], 'cancel refunds in full (gold; no ether)');
    await d.pressCard('Weapons I');
    await until(d, async () => (await d.eval(() => endfall.G.upgrades[0].weapons)) === 1, { seconds: 70, what: 'Weapons I' });
    await d.clickEntity(forge.id);
    assert.ok((await d.card()).some(c => c.label === 'Weapons II'), 'next level offered');
    const id = await d.eval(([x, y]) => endfall.engine.debugSpawn(0, 'trooper', x, y), [forge.x, forge.y + 90]);
    await d.clickEntity(id);
    assert.match(await d.hudText('#mod', /7\+1/), /7\+1/, 'Guard damage shows the bonus');
    assert.equal(await d.page.locator('#mod .st').count(), 2, 'a few figures: ground, armor (a Guard hits no flyers)');
    // A Guard's Brace waits for Shield Drill, researched at the Forge.
    assert.ok(!(await d.card()).some(c => c.label === 'Brace'), 'no Brace before Shield Drill');
    await d.grant(500, 500);
    await d.clickEntity(forge.id);
    await d.pressCard('Shield Drill');
    await until(d, async () => (await d.eval(() => endfall.G.upgrades[0].entrenching)) === 1, { seconds: 120, what: 'Shield Drill' });
    await d.clickEntity(forge.id);
    assert.ok(!(await d.card()).some(c => c.label === 'Shield Drill'), 'a finished tech leaves the card');
    await d.clickEntity(id);
    assert.ok((await d.card()).some(c => c.label === 'Brace' && c.enabled), 'Brace once researched');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: Master Builders researched at the Blacksmith, then buildings go up faster', { chromium: CDP_TOUCH }, async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    await d.grant(5000, 5000);
    await buildAndFinish(d, 'c', 'barracks', 0);
    const forge = await buildAndFinish(d, 'k', 'forge', 1);
    const core = coreOf(await d.state()), rate = await d.eval(() => endfall.engine.TECH_BUILD);
    const pct = Math.round((rate - 1) * 100);
    await d.clickEntity(forge.id);
    // The Blacksmith's card keeps its fixed slots on a phone: two levels, Cancel's place, then its two techs.
    const slots = await d.page.$$eval('#cmd > *', els => els.map(e => e.querySelector('.l')?.textContent || ''));
    assert.deepEqual(slots, ['Weapons I', 'Armor I', '', 'Shield Drill', 'Master Builders'], 'the Blacksmith card');
    const vp = d.page.viewportSize(), box = await d.page.locator('#cmd button', { hasText: 'Master Builders' }).boundingBox();
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width && box.y + box.height <= vp.height, 'it fits on the screen');
    // A long-press says what it does and costs, without researching it.
    const cdp = await d.page.context().newCDPSession(d.page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    await d.page.waitForTimeout(700);
    const text = await d.page.locator('#cmdInfo').textContent();
    assert.match(text, /Master Builders/); assert.match(text, new RegExp(`Buildings go up ${pct}% faster`)); assert.match(text, /100/); assert.match(text, /60 s/);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await d.page.waitForTimeout(150);
    assert.equal(await d.eval((id) => !!endfall.G.bldgs.find(b => b.id === id).research, forge.id), false, 'the long-press did not research it');
    // A tap researches it: paid for, the console shows it with its bar, Cancel in its row.
    const res = (await d.state()).res;
    await d.pressCard('Master Builders');
    const paid = (await d.state()).res;
    assert.ok(paid[1] === res[1] && paid[0] <= res[0] - 100 + 40, `it costs 100 gold (${res} -> ${paid}; gold still comes in)`);
    assert.match(await d.hudText('#mod', /Master Builders/), /Master Builders/);
    assert.ok(await d.page.locator('#mod .rs').isVisible(), 'the console shows the research with its bar');
    const r0 = await d.page.locator('#mod .res i').evaluate(e => parseFloat(e.style.width));
    await d.skip(4);
    await d.page.waitForFunction((w) => parseFloat(document.querySelector('#mod .res i').style.width) > w, r0, { timeout: 10000 }); // the bar moves
    const busy = await d.page.$$eval('#cmd > *', els => els.map(e => e.querySelector('.l')?.textContent || ''));
    assert.deepEqual(busy, ['Weapons I', 'Armor I', 'Cancel', 'Shield Drill', 'Master Builders'], 'the card keeps its shape');
    assert.ok((await d.card()).some(c => c.label === 'Weapons I' && !c.enabled), 'one research at a time');
    await until(d, async () => (await d.eval(() => endfall.G.upgrades[0].rapidConstruction)) === 1, { seconds: 70, what: 'Master Builders' });
    await d.clickEntity(forge.id);
    assert.ok(!(await d.card()).some(c => c.label === 'Master Builders'), 'a finished tech leaves the card');
    // A Cottage (22 s) now goes up faster: a tick of work is rate / 22 of a second's worth (read tick by tick in one go).
    const s = await d.state();
    const spot = await d.findSpot('depot', { tx: core.tx + 1, ty: core.ty + 1 });
    await d.buildWithUI('w', 'depot', spot.tx, spot.ty, mine(s, 'harvester')[2].id);
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

test('a game starts over the base: fully zoomed out with a mouse, at 1 on a phone', async () => {
  for (const device of [DESKTOP, PHONE]) {
    const d = await newGame(device, 1, 4242, { ai: false });
    try {
      assert.equal(d.startZoom, d.touch ? 1 : await d.eval(() => endfall.zoomMin), d.touch ? 'phone' : 'desktop');
      assert.deepEqual(d.errors, []);
    } finally { await d.close(); }
  }
});

test('a click or a tap on a unit\'s body, well above its feet, selects it (desktop and phone)', async () => {
  for (const device of [DESKTOP, PHONE]) {
    const d = await newGame(device, 1, 4242, { ai: false });
    try {
      const core = coreOf(await d.state());
      const id = await d.eval(([x, y]) => endfall.engine.debugSpawn(0, 'trooper', x, y), [core.x + 200, core.y + 40]);
      const u = (await d.state()).units.find(u => u.id === id);
      const { top, r } = await d.eval((id) => { const u = endfall.G.units.find(u => u.id === id); return { top: endfall.unitTop(u.type), r: u.r }; }, id);
      // Three quarters of the way up its art: past the old circle round its feet (its radius at 1.2, and a finger's reach).
      const up = top * 0.75;
      assert.ok(up > r * 1.2 + 16, `the point is on its body, not its feet: ${up} px up, radius ${r}`);
      await d.clickWorld(u.x, u.y - up);
      assert.deepEqual((await d.selection()).map(e => e.id), [id], `${d.touch ? 'phone' : 'desktop'}: the trooper selected`);
      assert.deepEqual(d.errors, []);
    } finally { await d.close(); }
  }
});

test('a click or a tap on a building\'s drawn roof, above its footprint, selects it (desktop and phone)', async () => {
  for (const device of [DESKTOP, PHONE]) {
    const d = await newGame(device, 1, 4242, { ai: false });
    try {
      const core = coreOf(await d.state());
      const top = await d.eval((id) => endfall.bldgArtTop(id), core.id);
      // Halfway between the art's top and the footprint's north edge: on the roof, off the footprint.
      const y = (top + core.ty * 32) / 2;
      assert.ok(core.ty * 32 - y > 24, `the point is well above the footprint: ${core.ty * 32 - y} px`);
      await d.clickWorld(core.x, y);
      assert.deepEqual((await d.selection()).map(e => e.id), [core.id], `${d.touch ? 'phone' : 'desktop'}: the Castle selected`);
      assert.deepEqual(d.errors, []);
    } finally { await d.close(); }
  }
});

test('a unit north of a tall building is drawn behind it, our own as a silhouette through it; one south of it in front', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    const core = coreOf(await d.state()), T = 32;
    // Just north of the Castle (its tower rises over them at the 40-degree camera), and just south of it.
    const [behind, foe, front] = await d.eval(([c, T]) => [
      endfall.engine.debugSpawn(0, 'trooper', c.x + 0.5 * T, c.ty * T - 6), endfall.engine.debugSpawn(1, 'trooper', c.x - 0.5 * T, c.ty * T - 6),
      endfall.engine.debugSpawn(0, 'trooper', c.x, (c.ty + c.h) * T + 8)], [core, T]);
    const s = await d.state(), at = (id) => s.units.find(u => u.id === id);
    assert.ok(at(behind).y < core.ty * T + core.h * T && at(front).y >= (core.ty + core.h) * T, `placed north and south: ${at(behind).y}, ${at(front).y}`);
    await d.centerOn(core.x, core.y); await d.skip(0.1);
    const order = await d.eval(() => endfall.drawOrder()), of = (id) => order.find(o => o.id === id);
    const b = of(core.id), u = of(behind), e = of(foe), f = of(front);
    assert.ok(b && u && e && f && b.shown && u.shown && f.shown, `all drawn: ${JSON.stringify([b, u, e, f])}`);
    assert.ok(u.i < b.i && e.i < b.i, `the units north are drawn before (under) the Castle: ${u.i}, ${e.i} < ${b.i}`);
    assert.ok(f.i > b.i, `the unit south is drawn after (over) it: ${f.i} > ${b.i}`);
    assert.equal(u.silhouette, true, 'our own unit behind it shows its silhouette');
    assert.equal(f.silhouette, false, 'the one in front shows none');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('harvesters repair a damaged building (right-click on desktop, the Repair button on a phone)', { chromium: CDP_TOUCH }, async () => {
  for (const device of [DESKTOP, PHONE]) {
    const d = await newGame(device, 1, 4242, { ai: false });
    try {
      await d.grant(1000, 0);
      const depot = await buildAndFinish(d, 'w', 'depot', 0);
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
      assert.match(await d.hudText('#selSub', /left/), new RegExp(`^${left} (gold )?left`), 'shows what is left');
      assert.equal((await d.card()).length, 0, 'nothing to command on a field');
      assert.match(await d.hudText('#selName', /Gold field/), /Gold field/);
      assert.equal(s.nodes.filter(n => n.type === 'ether').length, 0, 'no mine shaft on the map');
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

test('the Shore map: chosen from the list, its line said; each people starts in its cove (every ground unit walks since the re-theme), water drawn', { engines: true }, async () => {
  const ctx = await browserContext(DESKTOP);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(baseUrl(), { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall);
    await page.locator('#btnSolo').click();
    await board(page).race(1, 'vael');
    const shore = await page.$$eval('#mapSel option', os => os.findIndex(o => o.textContent.startsWith('Mirror Lake')));
    assert.ok(shore >= 0, 'the Shore map in the list');
    await page.locator('#mapSel').selectOption(String(shore));
    await page.waitForFunction(() => /A shore and a reef: each side holds a cove, the reef in the shallows between\./.test(document.getElementById('soloNote').textContent));
    await page.locator('#btnStart').click();
    await page.waitForFunction(() => endfall.G.units.length > 0);
    const got = await page.evaluate(() => {
      const { G, map, engine } = endfall;
      const hq = (t) => G.bldgs.find(b => b.team === t && b.d.hq);
      const at = (b) => engine.ground(b.tx + 1, b.ty + 1);
      return { kind: G.mapKind, me: at(hq(0)), foe: at(hq(1)), deep: Array.from(map.height).filter(h => h <= -2).length };
    });
    assert.deepEqual([got.kind, got.me, got.foe], [6, 'land', 'land'], 'the Shore map, both peoples on land');
    assert.ok(got.deep > 50, `deep water on the map: ${got.deep} tiles`);
    await page.evaluate(() => endfall.skip(20));
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('the menu: every map in one list (the duel\'s three and a random one first), the opponent and sound; the choices start the game', { engines: true }, async () => {
  for (const device of [DESKTOP, PHONE]) {
    const ctx = await browserContext(device);
    const page = await ctx.newPage();
    try {
      await page.goto(baseUrl(), { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.endfall);
      const touch = !!device.hasTouch, press = (sel) => touch ? page.locator(sel).tap() : page.locator(sel).click();
      assert.ok(await page.locator('#start').isVisible(), 'straight to the menu (no tap-to-play screen)');
      await press('#btnSolo');
      assert.deepEqual((await page.$$eval('#mapSel option', os => os.map(o => o.textContent))).slice(0, 4), ['Ashen Basin · up to 2', 'Glass Reach · up to 2', 'Cinder Divide · up to 2', 'Random · up to 2'], 'named maps, nothing given away');
      assert.equal(await page.locator('#mapSel option').count(), 14, 'every map of every size (the Shore\'s two last)');
      assert.equal(await page.locator('#mapSel').inputValue(), '0', 'the standard map is the default');
      // The opponent's level: in its token's sheet (LEVEL), its name only.
      await board(page).open(1);
      assert.deepEqual(await page.$$eval('#soloSheet [data-k^="diff:"]', bs => bs.map(b => b.textContent)), ['EASY', 'MEDIUM', 'HARD', 'BRUTAL']);
      assert.equal(await page.locator('#soloSheet [data-k^="diff:"].on').textContent(), 'EASY', 'new players start on Easy');
      const level = touch ? 3 : 2; // (Hard on the desktop, Brutal on the phone)
      await press(`#soloSheet [data-k="diff:${level}"]`);
      assert.deepEqual(await page.$$eval('#soloSheet .opt .lbl', ls => ls.map(l => l.textContent)), ['RACE', 'LEVEL', 'SIDE']);
      assert.equal(await page.locator('#soloSheet .hint, #soloSheet [aria-describedby]').count(), 0, 'no line on what a level means');
      await press('#soloSheet [data-k="done"]');
      assert.ok(await page.locator('#soloSheet').isHidden(), 'DONE closes the sheet');
      await page.locator('#mapSel').selectOption('1');
      await press('#cornerSound'); // (the speaker in the corner)
      assert.equal(await page.locator('#cornerSound').getAttribute('aria-pressed'), 'false');
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
      assert.equal(await page.locator('#cornerSound').getAttribute('aria-pressed'), 'false', 'sound choice remembered');
      // The random map is a new one each game.
      assert.equal(await page.locator('#mapSel').inputValue(), '1', 'the map remembered');
      await page.locator('#mapSel').selectOption('3'); await press('#btnStart');
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
      assert.ok(await shown('#cornerSound'), 'the sound icon on the first page');
      assert.deepEqual(await page.$$eval('#menuHome .row .ib:not([hidden])', bs => bs.map(b => b.textContent)), ['FIRST GAME', 'HOW TO PLAY', 'ABOUT', 'OPTIONS', 'PLAY OFFLINE'], 'a newcomer: FIRST GAME there too; OPTIONS (NAME, on every device); PLAY OFFLINE (nothing to install here)');
      // ABOUT: a page of a few lines, the source and the device check, the version; BACK.
      await press('#btnAbout');
      assert.ok(await shown('#menuAbout') && await page.locator('#menuHome').isHidden() && await shown('#cornerSound'), 'About opens, the sound icon still there');
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
      assert.deepEqual(await board(page).sides(), [['YOU'], ['COMPUTER 1']]);
      assert.deepEqual(await board(page).spots(), ['YOU', 'COMPUTER 1', '+', '', '', '', '', ''], 'eight spots: you, an AI, + SEAT in the next');
      assert.deepEqual(await page.$$eval('#soloBoard .tok', ts => ts.map(t => [t.getAttribute('aria-label'), t.querySelector('.race').textContent])),
        device.hasTouch ? [['YOU KING, Kingdom, Side 1: edit', 'KING'], ['COMPUTER 1 KING, Kingdom, Easy, Side 2: edit', 'KING']] : [['YOU KINGDOM, Side 1: edit', 'KINGDOM'], ['COMPUTER 1 KINGDOM, Easy, Side 2: edit', 'KINGDOM']],
        'each token says what it shows first, then the rest; a phone\'s short race');
      assert.equal(await page.locator('#soloBoard .tok b').first().evaluate(b => getComputedStyle(b).fontSize), device.hasTouch ? '16px' : '12px', 'a phone reads 16 px');
      // YOUR sheet: the race (RANDOM too) and the side, a dialog; Escape closes it and gives the focus back to the token.
      await page.locator('#soloBoard [data-k="tok0"]').focus(); await page.keyboard.press('Enter');
      assert.ok(await page.locator('#soloSheet').evaluate(d => d.open && d.matches(':modal') && d.getAttribute('aria-labelledby') === 'sheetTitle'), 'a modal dialog, named by its title');
      assert.deepEqual(await page.$$eval('#soloSheet [role="radiogroup"]', gs => gs.map(g => g.getAttribute('aria-label'))), ['Race', 'Side'], 'your seat: its race and side, no level');
      assert.deepEqual(await page.$$eval('#soloSheet [data-k^="race:"]', bs => bs.map(b => b.textContent)), ['KINGDOM', 'EXPEDITION', 'RANDOM']);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.k), 'race:humans', 'the focus on the lit chip');
      for (const key of ['Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
        await page.keyboard.press(key);
        assert.ok(await page.evaluate(() => !document.activeElement.closest('#soloBoard, .row, .maprow')), `${key}: nothing behind the sheet takes the focus`);
      }
      await page.locator('#sheetTitle').click(); // (a click on the sheet's own words: Escape still closes it)
      await page.keyboard.press('Escape');
      assert.ok(await page.locator('#soloSheet').isHidden());
      assert.equal(await page.evaluate(() => document.activeElement.dataset.k), 'tok0', 'Escape: the focus back on the token');
      assert.equal(await page.locator('#lblSound').count(), 0, 'no SOUND row');
      assert.ok(await shown('#btnStart') && await shown('#cornerSound') && !(await page.locator('#btnFirst').count()), 'START GAME and the sound icon (no FIRST GAME here: it is on the first page)');
      await press('#btnSoloBack');
      assert.ok(await shown('#menuHome') && await page.locator('#menuSolo').isHidden(), 'BACK: the first page');
      // MULTIPLAYER: the lobby's join form, the same sound icon in the corner; BACK.
      await press('#btnOnline');
      assert.ok(await shown('#onlineJoin') && await page.locator('#start').isHidden(), 'multiplayer: the join form');
      assert.equal(await page.locator('#onlineJoin h2').textContent(), 'MULTIPLAYER', 'its title: the button\'s');
      assert.equal(await page.locator('#onlineHow').textContent(), 'Play friends online. NEW ROOM gives you a link to send. Got a link? Open it. A code? Type it, tap JOIN.', 'how it works, in a line or two');
      assert.ok(await shown('#onlineHow'));
      const v = page.viewportSize(), b = await page.locator('#cornerSound').boundingBox();
      assert.ok(b.x + b.width > v.width - 70 && b.y < 70 && b.width >= 44 && b.height >= 44, `the sound icon top right, a finger wide: ${JSON.stringify(b)}`);
      await press('#cornerSound');
      assert.equal(await page.locator('#cornerSound').getAttribute('aria-pressed'), 'false', 'sound off from the lobby');
      await press('#btnOnlineBack');
      assert.ok(await shown('#menuHome'), 'BACK: the first page');
      assert.equal(await page.locator('#cornerSound').getAttribute('aria-pressed'), 'false', 'one setting: the menu\'s icon says off too');
      // YOU = RANDOM: each START draws a race (drawn with Math.random: pinned here to see both).
      await press('#btnSolo'); await board(page).race(0, 'random');
      const startAs = async (r) => {
        await page.evaluate((r) => { Math.random = () => r; }, r);
        await press('#btnStart'); await page.waitForFunction(() => endfall.G.units.length > 0 && document.getElementById('start').hidden);
        return page.evaluate(() => endfall.G.factions[endfall.G.me]);
      };
      assert.equal(await startAs(0.9), 'vael', 'RANDOM drew the Expedition');
      assert.equal(await page.locator('#btnSound').getAttribute('aria-pressed'), 'false', 'the game\'s sound follows the menu\'s');
      await press('#btnSound'); // (on again, from the game's top bar)
      await press('#btnPause'); await press('#btnQuit');
      assert.ok(await shown('#menuSolo'), 'leaving a game against the AI: the single player page, one tap from the next');
      await press('#btnSoloBack'); assert.ok(await shown('#menuHome'));
      assert.equal(await page.locator('#cornerSound').getAttribute('aria-pressed'), 'true', 'the top bar\'s setting on the menu');
      await press('#btnSolo');
      assert.match(await page.locator('#soloBoard [data-k="tok0"]').getAttribute('aria-label'), /^YOU (RND, Random|RANDOM),/, 'RANDOM still chosen');
      assert.equal(await startAs(0.1), 'humans', 'and the next game the Humans');
      await press('#btnPause'); await press('#btnQuit'); await press('#btnSoloBack');
      assert.deepEqual(await storedRecord(page), { 'vael:0': [0, 1], 'humans:0': [0, 1] }, 'RANDOM\'s games on the record of the race each drew');
      assert.ok(await page.locator('#btnFirstHome').isHidden(), 'games on the record: FIRST GAME off the first page');
      assert.equal(await page.locator('#record').count(), 0, 'no record on the first page');
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  }
});

test('a newcomer\'s FIRST GAME on the first page, and only there; once the guided game is over, not offered any more', async () => {
  const ctx = await browserContext(DESKTOP), page = await ctx.newPage();
  try {
    await page.goto(baseUrl() + '?seed=4242', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall);
    await page.locator('#btnFirstHome').click();
    await page.waitForFunction(() => endfall.G.units.length > 0 && document.getElementById('start').hidden);
    assert.match(await page.locator('#tut').textContent(), /1\/7/, 'the guided game');
    await page.evaluate(() => endfall.engine.concede()); // (set-up: the game's end is what matters)
    await page.locator('#end').waitFor({ state: 'visible' });
    await page.locator('#btnAgain').click();
    assert.ok(await page.locator('#menuHome').isVisible() && await page.locator('#btnFirstHome').isHidden(), 'no FIRST GAME on the first page any more');
    assert.deepEqual(await storedRecord(page), {}, 'a guided game is not on the record');
    await page.locator('#btnSolo').click();
    assert.equal(await page.locator('#btnFirst').count(), 0, 'nor in single player');
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
    await page.waitForFunction(() => /^Saving for offline…/.test(document.getElementById('offlineMsg').textContent), null, { timeout: 10000 });
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

test('a game that could not load says so on the menu: START GAME reads RELOAD, and reloads', async () => {
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
    assert.equal(await page.locator('#btnStart').textContent(), 'RELOAD');
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
      await d.pressCard('Villager'); await d.pressCard('Villager'); await d.pressCard('Villager');
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
    await d.grant(2000, 0);
    await buildAndFinish(d, 'c', 'barracks', 1); // (the advanced page opens with a Barracks)
    const h = mine(await d.state(), 'harvester')[0];
    for (let i = 0; i < 16 && !(await d.selection()).some(e => e.id === h.id); i++) { if (i) await d.page.waitForTimeout(150 + 50 * i); await d.clickEntity(h.id); } // (a miner moves: again until it is picked)
    await d.pressCard('Build'); await d.readyCard('Advanced'); await d.pressCard('Advanced'); // the Blacksmith is on the advanced page
    const forge = d.page.locator('#cmd button', { hasText: 'Blacksmith' });
    const b = await forge.boundingBox();
    const cdp = await d.page.context().newCDPSession(d.page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }] });
    await d.page.waitForTimeout(700);
    const info = d.page.locator('#cmdInfo');
    assert.ok(await info.isVisible(), 'details show while held');
    const text = await info.textContent();
    assert.match(text, /Blacksmith/); assert.match(text, /150/); assert.match(text, /Needs a Barracks/);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await d.page.waitForTimeout(150);
    assert.equal(await d.eval(() => endfall.ui.place), null, 'the long-press did not start placing a Blacksmith');
    await info.waitFor({ state: 'hidden', timeout: 5000 }); // the details go a moment after the finger lifts
    // Hold a greyed-out button while the money arrives (the card is rebuilt under the finger): no error, no press.
    await d.grant(0, 0);
    await d.pressCard('Back'); // to the basic page
    const depot = await d.page.locator('#cmd button', { hasText: 'Cottage' }).boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: depot.x + depot.width / 2, y: depot.y + depot.height / 2 }] });
    await d.page.waitForTimeout(200); await d.grant(5000, 5000); await d.page.waitForTimeout(500);
    assert.ok(await info.isVisible(), 'details still show after the rebuild');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await info.waitFor({ state: 'hidden', timeout: 5000 }); // and go after the lift
    assert.equal(await d.eval(() => endfall.ui.place), null, 'no Cottage placement started');
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
      for (let i = 0; i < 5; i++) await d.pressCard('Villager');
      assert.equal(await d.page.locator('#queue .qi').count(), 5);
      await insideConsole(d, '#queue .qi, #queue .prod, #selPor, #hpNum');
      const id = await d.eval(([x, y]) => endfall.engine.debugSpawn(0, 'trooper', x, y), [core.x + 140, core.y + 140]);
      await d.clickEntity(id);
      await insideConsole(d, '#mod .st, #hpNum, #selName');
      assert.deepEqual(d.errors, []);
    } finally { await d.close(); }
  });
}

/** The console's who side (portrait, name, health) and its production queue: the boxes, each unit's x, every slot. */
const queueLayout = (d) => d.page.evaluate(() => {
  const box = (e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }, q = document.querySelector('#queue');
  return {
    who: Object.fromEntries(['selPor', 'selName', 'life'].map(id => [id, box(document.getElementById(id))])),
    queue: box(q), units: [...q.querySelectorAll('.qi')].map(e => box(e)[0]), slots: [...q.querySelectorAll('.qi, .qe')].map(box),
  };
});

// The production queue fills from the left, the unit in training first, in a fixed row of slots (the free ones empty
// outlines): the portrait, the name and the health stay where they are from an empty queue to a full one and as units
// finish, on a desktop and on a phone, for both races.
for (const [race, R] of [['humans', { hq: 'core', worker: 'harvester', factory: ['c', 'barracks'], unit: 'Guard' }],
  ['vael', { hq: 'conflux', worker: 'lumen', supply: ['s', 'spire'], factory: ['i', 'siphon'], unit: 'Sellsword' }]]) {
  test(`the production queue fills from the left and nothing in the console moves (${race})`, { chromium: CDP_TOUCH }, async () => {
    for (const device of [DESKTOP, PHONE]) {
      const d = await newGame(device, 1, 4242, { ai: false, race });
      const where = `${race}, ${d.touch ? 'phone' : 'desktop'}`;
      try {
        await d.grant(5000, 5000);
        if (R.supply) await buildAndFinish(d, ...R.supply, 0, R); // (room for five 2-supply Sellswords)
        const f = await buildAndFinish(d, ...R.factory, 1, R);
        await d.clickEntity(f.id);
        const queued = async () => (await d.state()).bldgs.find(b => b.id === f.id).queue.length;
        const shown = (n) => d.page.waitForFunction((n) => document.querySelectorAll('#queue .qi').length === n, n, { timeout: 5000 });
        await shown(0);
        const max = await d.eval(() => endfall.engine.QUEUE_MAX);
        assert.equal(max, 5, 'the queue holds five');
        const empty = await queueLayout(d);
        assert.equal(empty.slots.length, max, `${where}: every slot is drawn with nothing queued`);
        const check = async (n, what) => {
          await shown(n);
          const l = await queueLayout(d);
          assert.equal(l.units.length, n, `${where}, ${what}: ${n} queued`);
          assert.ok(l.units.every((x, i) => !i || x > l.units[i - 1]), `${where}, ${what}: left to right ${l.units}`);
          if (n) assert.ok(Math.abs(l.units[0] - l.queue[0]) < 0.5, `${where}, ${what}: the first at the queue's left edge (${l.units[0]} vs ${l.queue[0]})`);
          assert.deepEqual(l.who, empty.who, `${where}, ${what}: the portrait, name and health stay put`);
          assert.deepEqual([l.queue, l.slots], [empty.queue, empty.slots], `${where}, ${what}: the queue keeps its place and its slots`);
        };
        for (let n = 1; n <= max; n++) {
          await d.pressCard(R.unit);
          assert.equal(await queued(), n, `${where}: ${n} queued (toasts: ${(await d.toasts()).join(' | ')})`);
          if (n === 1 || n === 3 || n === max) await check(n, `${n} queued`);
        }
        await d.pressCard(R.unit); // one more than it holds
        assert.equal(await queued(), max, `${where}: a full queue takes no more`);
        await until(d, async () => (await queued()) === max - 1, { seconds: 60, step: 1, what: `the first ${R.unit} to finish` });
        await check(max - 1, 'the first one finished');
        assert.deepEqual(d.errors, []);
      } finally { await d.close(); }
    }
  });
}

// A factory that also researches (the Kingdom's Stables; no Expedition factory does) shows its research beside its queue (over it on small phones): the queued units stay in their slots, the
// research shows with its own bar, and nothing in the console moves when the research starts or ends; a queued unit is
// still cancelled with a tap. All four screens.
const SMALL_PHONE = { ...PHONE, viewport: { width: 667, height: 375 } }, UPRIGHT = { ...PHONE, viewport: { width: 412, height: 915 } };
for (const [race, R] of [['humans', { hq: 'core', worker: 'harvester', steps: [['c', 'barracks'], ['x', 'extractor'], ['f', 'airfield']], unit: 'Rider', tech: 'Horseshoes', name: 'Horseshoes', devices: [DESKTOP, SMALL_PHONE, PHONE, UPRIGHT] }]]) {
  test(`a factory's research shows beside its queue, and nothing in the console moves as it starts and ends (${race})`, async () => {
    for (const device of R.devices) {
      const d = await newGame(device, 1, 4242, { ai: false, race });
      const where = `${race}, ${device.viewport.width}x${device.viewport.height}`;
      try {
        await d.grant(5000, 5000);
        let f; for (const [i, [hot, type]] of R.steps.entries()) f = await buildAndFinish(d, hot, type, i, R);
        await d.clickEntity(f.id);
        const layout = () => d.page.evaluate(() => {
          const box = (e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }, q = document.querySelector('#queue'), r = document.querySelector('#qres');
          return {
            who: Object.fromEntries(['selPor', 'selName', 'life'].map(id => [id, box(document.getElementById(id))])),
            queue: box(q), slots: [...q.querySelectorAll('.qi, .qe')].map(box), units: [...q.querySelectorAll('.qi')].map(e => box(e)[0]),
            res: r && box(r), researching: !!r && !r.classList.contains('idle') && getComputedStyle(r).visibility === 'visible', title: r?.title,
          };
        });
        const shown = (n) => d.page.waitForFunction((n) => document.querySelectorAll('#queue .qi').length === n, n, { timeout: 5000 });
        await shown(0);
        const idle = await layout();
        assert.ok(idle.res, `${where}: the research has its room beside the queue`);
        assert.equal(idle.researching, false, `${where}: nothing researching, nothing shown`);
        await d.pressCard(R.unit); await d.pressCard(R.unit);
        await shown(2);
        const queued = await layout();
        assert.deepEqual([queued.who, queued.queue, queued.slots, queued.res], [idle.who, idle.queue, idle.slots, idle.res], `${where}: two queued, nothing moved`);
        // The research, started from the card.
        await d.pressCard(R.tech);
        assert.ok(await d.eval((id) => !!endfall.G.bldgs.find(b => b.id === id).research, f.id), `${where}: researching (toasts: ${(await d.toasts()).join(' | ')})`);
        await d.page.waitForFunction(() => document.querySelector('#qres:not(.idle)'), null, { timeout: 5000 });
        const both = await layout();
        assert.ok(both.researching, `${where}: the research shows`);
        assert.equal(both.title, 'Researching ' + R.name, `${where}: it says which`);
        assert.equal(both.units.length, 2, `${where}: the queued units still show`);
        assert.deepEqual(both.units, queued.units, `${where}: in their slots`);
        assert.deepEqual([both.who, both.queue, both.slots, both.res], [idle.who, idle.queue, idle.slots, idle.res], `${where}: the research started, nothing moved`);
        await insideConsole(d, '#queue .qi, #queue .qe, #queue .prod, #qres, #selPor, #hpNum');
        const [num, life] = await d.page.evaluate(() => ['hpNum', 'life'].map(id => document.getElementById(id).getBoundingClientRect().right));
        assert.ok(num <= life + 0.5, `${where}: the health figure whole (${num} vs ${life})`);
        await d.page.screenshot({ path: `/tmp/qres-shots/${race}-${device.viewport.width}x${device.viewport.height}.png` }).catch(() => {});
        // A tap on the second unit still cancels it; the research goes on.
        const second = d.page.locator('#queue .qi[data-i="1"]');
        await (d.touch ? second.tap() : second.click());
        const now = (await d.state()).bldgs.find(b => b.id === f.id);
        assert.equal(now.queue.length, 1, `${where}: the tapped unit cancelled`);
        assert.ok(await d.eval((id) => !!endfall.G.bldgs.find(b => b.id === id).research, f.id), `${where}: the research goes on`);
        // The research ends: its tile goes, its room stays.
        await until(d, async () => !(await d.eval((id) => endfall.G.bldgs.find(b => b.id === id).research, f.id)), { seconds: 90, step: 5, what: `${R.name} to finish` });
        await d.page.waitForFunction(() => document.querySelector('#qres.idle'), null, { timeout: 5000 });
        const done = await layout();
        assert.equal(done.researching, false, `${where}: done, the research tile goes`);
        assert.deepEqual([done.who, done.queue, done.slots, done.res], [idle.who, idle.queue, idle.slots, idle.res], `${where}: the research ended, nothing moved`);
        assert.deepEqual(d.errors, []);
      } finally { await d.close(); }
    }
  });
}

// The console fits every phone, fluidly: the Stables with a full queue and a research (the Expedition's Factory: its
// queue alone, as it researches nothing), at every landscape
// width from 640 to 900 (360 and 390 high) and upright from 360 to 430 wide: the name and the health figure whole,
// everything inside the console (and its module), clear of the command card and the minimap. Every unit's and
// building's name of both races is tried in that console too (the widest module there is), and every unit's name in a
// capital unit's (the most figures): whole, on one line or two, inside the console.
for (const [race, R] of [['humans', { hq: 'core', worker: 'harvester', steps: [['w', 'depot'], ['c', 'barracks'], ['x', 'extractor'], ['f', 'airfield']], unit: 'Rider', tech: 'Horseshoes', capital: 'knight' }],
  ['vael', { hq: 'conflux', worker: 'lumen', steps: [['s', 'spire'], ['i', 'siphon'], ['c', 'kiln']], unit: 'Drone', tech: null, capital: 'bruiser' }]]) {
  test(`the console fits every phone width with a full queue and a research (${race})`, async () => {
    const d = await newGame(PHONE, 1, 4242, { ai: false, race });
    try {
      await d.grant(5000, 5000);
      let f; for (const [i, [hot, type]] of R.steps.entries()) f = await buildAndFinish(d, hot, type, i, R);
      await d.clickEntity(f.id);
      const queued = async () => (await d.state()).bldgs.find(b => b.id === f.id).queue.length;
      for (let i = 0; i < 5; i++) await d.pressCard(R.unit);
      assert.equal(await queued(), 5, `a full queue (toasts: ${(await d.toasts()).join(' | ')})`);
      if (R.tech) {
        await d.pressCard(R.tech);
        await d.page.waitForFunction(() => document.querySelector('#qres:not(.idle)'), null, { timeout: 5000 });
      }
      await d.page.evaluate(() => document.fullscreenElement && document.exitFullscreen()); // (a page in full screen keeps its size)
      await d.page.waitForFunction(() => !document.fullscreenElement);
      /** Each name of both races in the console as it stands (set in one go, measured and put back before a frame
       *  can draw it again): the ones cut off or spilling out of the console. */
      const names = (kinds) => d.page.evaluate((kinds) => {
        const E = endfall.engine, h = document.getElementById('selName'), was = h.textContent, bad = [];
        const box = (id) => document.getElementById(id).getBoundingClientRect(), info = box('info');
        for (const k of kinds) for (const { name } of Object.values(E[k])) {
          h.textContent = name;
          const cut = h.scrollWidth > h.clientWidth || h.scrollHeight > h.clientHeight + 1; // (a third line, clamped)
          const out = ['selName', 'life', 'hpNum'].some(id => { const b = box(id); return b.top < info.top - 0.5 || b.bottom > info.bottom + 0.5 || b.left < info.left - 0.5 || b.right > info.right + 0.5; });
          if (cut || out || box('hpNum').right > box('life').right + 0.5) bad.push(name + (cut ? ' cut' : ' outside'));
        }
        h.textContent = was;
        return bad;
      }, kinds);
      const sizes = [];
      for (const h of [360, 390]) for (let w = 640; w <= 900; w += 20) sizes.push([w, h]);
      for (let w = 360; w <= 430; w += 10) sizes.push([w, 860]);
      for (const [w, h] of sizes) {
        const where = `${race}, ${w}x${h}`;
        await d.page.setViewportSize({ width: w, height: h });
        while (await queued() < 5) await d.pressCard(R.unit); // (keep it full: units finish meanwhile)
        await d.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        const m = await d.page.evaluate(() => {
          const r = (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, r: b.right, b: b.bottom, c: e.id || e.className.baseVal || e.className }; }, $ = (id) => document.getElementById(id);
          const name = $('selName'), num = $('hpNum');
          return {
            info: r($('info')), mod: r($('mod')), life: r($('life')), num: r(num), cmd: r($('cmd')), minimap: r($('minimap')),
            parts: [...document.querySelectorAll('#queue .qi, #queue .qe, #queue .prod, #qres, #qres > *, #selPor, #selName, #life, #hpNum')].map(r),
            slots: [...document.querySelectorAll('#queue .qi, #queue .qe, #queue .prod, #qres, #qres > *')].map(r),
            units: document.querySelectorAll('#queue .qi').length, researching: !!document.querySelector('#qres:not(.idle)'),
            nameCut: name.scrollWidth > name.clientWidth, numCut: num.scrollWidth > num.clientWidth,
          };
        });
        const inside = (a, o) => a.x >= o.x - 0.5 && a.y >= o.y - 0.5 && a.r <= o.r + 0.5 && a.b <= o.b + 0.5;
        const apart = (a, o) => a.r <= o.x + 0.5 || o.r <= a.x + 0.5 || a.b <= o.y + 0.5 || o.b <= a.y + 0.5;
        assert.equal(m.units, 5, `${where}: the full queue shows`);
        assert.equal(m.researching, !!R.tech, `${where}: the research shows (if any)`);
        assert.ok(!m.nameCut, `${where}: the name whole`);
        assert.ok(!m.numCut && m.num.r <= m.life.r + 0.5, `${where}: the health figure whole (${m.num.r} vs ${m.life.r})`);
        for (const p of m.parts) assert.ok(inside(p, m.info), `${where}: ${p.c} inside the console ${JSON.stringify([p, m.info])}`);
        for (const p of m.slots) assert.ok(inside(p, m.mod), `${where}: ${p.c} inside its module ${JSON.stringify([p, m.mod])}`);
        assert.ok(apart(m.info, m.cmd), `${where}: clear of the command card ${JSON.stringify([m.info, m.cmd])}`);
        assert.ok(apart(m.info, m.minimap), `${where}: clear of the minimap ${JSON.stringify([m.info, m.minimap])}`);
        assert.deepEqual(await names(['UNITS', 'BUILDINGS']), [], `${where}: every name whole and inside the console`);
        if ([640, 740, 760, 780, 360, 430].includes(w) && h !== 390) await d.page.screenshot({ path: `/tmp/qres-shots/fit-${race}-${w}x${h}.png` }).catch(() => {});
      }
      // A capital unit (its figures the most a unit shows): every unit's name in its console, at the narrowest sizes.
      const f0 = await d.eval((id) => endfall.G.bldgs.find(b => b.id === id), f.id);
      const cap = await d.eval(([k, x, y]) => endfall.engine.debugSpawn(0, k, x, y), [R.capital, f0.x - 260, f0.y - 200]); // (clear of the new flyers)
      assert.ok(cap, `a ${R.capital}`);
      for (const [w, h] of [[640, 360], [720, 360], [740, 360], [360, 860], [430, 860]]) {
        await d.page.setViewportSize({ width: w, height: h });
        for (let i = 0; i < 5 && !(await d.selection()).some(e => e.id === cap); i++) await d.clickEntity(cap);
        assert.deepEqual((await d.selection()).map(e => e.id), [cap], `${race}, ${w}x${h}: the ${R.capital} selected`);
        await d.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        assert.deepEqual(await names(['UNITS']), [], `${race}, ${w}x${h}, a ${R.capital}'s console: every unit's name whole and inside`);
      }
      assert.deepEqual(d.errors, []);
    } finally { await d.close(); }
  });
}

test('a box over units and buildings selects only the units, and only the fighters among them', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    await d.skip(5);
    const s = await d.state(), core = coreOf(s), hs = mine(s, 'harvester');
    // A box round the Core and its harvesters, wherever the gold lies (a clump to one flank).
    const xs = [core.x, ...hs.map(h => h.x)], ys = [core.y, ...hs.map(h => h.y)];
    const box = [Math.min(...xs) - 30, Math.min(...ys) - 30, Math.max(...xs) + 30, Math.max(...ys) + 30];
    await d.boxSelect(...box); // the Core and the harvesters beside it
    const sel = await d.selection();
    assert.ok(sel.length >= 1 && sel.every(e => e.kind === 'unit'), `units only: ${JSON.stringify(sel)}`);
    await d.boxSelect(core.x - 20, core.y - 20, core.x + 20, core.y + 20); // the Core alone
    assert.deepEqual((await d.selection()).map(e => e.type), ['core'], 'a box with no units selects the building');
    // A soldier among the workers: the box takes the soldier only.
    const id = await d.eval(([x, y]) => endfall.engine.debugSpawn(0, 'trooper', x, y), [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]);
    await d.boxSelect(...box);
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
    assert.deepEqual((await d.card()).map(c => c.label), ['Barracks', 'Cottage', 'Castle', 'Back'], 'the basic page: the Barracks first; all it holds is there from the start; no Advanced (nor the Market) before a Barracks');
    await d.pressCard('Cottage');
    assert.equal((await d.card())[0].label, 'Cancel', 'placing: the Build button is Cancel');
    await d.pressCard('Cancel');
    assert.equal(await d.eval(() => endfall.ui.place), null, 'and it stops the placing');
    await buildAndFinish(d, 'c', 'barracks', 1);
    for (let i = 0; i < 16 && !(await d.selection()).some(e => e.id === h.id); i++) { if (i) await d.page.waitForTimeout(150 + 50 * i); await d.clickEntity(h.id); } // (a miner moves: again until it is picked)
    await d.pressCard('Build');
    await d.readyCard('Advanced'); // (once the Barracks stands)
    await d.pressCard('Advanced');
    assert.deepEqual((await d.card()).map(c => c.label), ['Blacksmith', 'Watchtower', 'Workshop', 'Market', 'Back'], 'the advanced page (the Market: it needs the Barracks; no Stables before a Market stands)');
    await d.pressCard('Back');
    assert.ok((await d.card()).some(c => c.label === 'Cottage'), 'back to the basic page');
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
    await d.buildWithUI('w', 'depot', spot.tx, spot.ty, h.id);
    await d.skip(2);
    // Pull the builder off: select it and send it to a shard field.
    const node = (await d.state()).nodes.filter(n => n.type === 'shard').sort((a, b) => Math.hypot(a.x - core.x, a.y - core.y) - Math.hypot(b.x - core.x, b.y - core.y))[0];
    // (the builder stands on its site: a tap can take the site instead, so tap until the builder is the selection)
    for (let i = 0; i < 8; i++) { await d.clickEntity(h.id); if ((await d.selection()).some(e => e.id === h.id)) break; await d.page.waitForTimeout(200); }
    assert.ok((await d.selection()).some(e => e.id === h.id), 'the builder selected');
    await d.clickWorld(node.x, node.y);
    await until(d, async () => (await d.toasts()).some(t => /paused: no builder/.test(t)), { seconds: 10, what: 'the paused-site toast' });
    await d.skip(3);
    assert.ok((await d.toasts()).filter(t => /paused: no builder/.test(t)).length <= 1, 'never stacked');
    assert.equal(await d.page.locator('#cmd .cb .k').first().isVisible().catch(() => false), false, 'no keyboard letters on touch');
    // A mixed army: one tile per type with its count, inside the console.
    await d.eval(([x, y]) => { for (let i = 0; i < 10; i++) endfall.engine.debugSpawn(0, 'trooper', x + (i % 5) * 22, y + Math.floor(i / 5) * 22); for (let i = 0; i < 2; i++) endfall.engine.debugSpawn(0, 'lancer', x + i * 22, y + 50); }, [core.x + 160, core.y + 150]);
    await d.boxSelect(core.x + 140, core.y + 130, core.x + 270, core.y + 215); // (a box over them)
    await d.page.waitForTimeout(400);
    assert.deepEqual(await d.page.$$eval('#group .gt b', bs => bs.map(b => b.textContent)), ['10', '2'], 'Guards x10, Archers x2');
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
    await d.page.waitForFunction((t0) => endfall.G.time > t0 + 0.5, t0, { timeout: 15000 });
    assert.equal(await d.page.locator('#rotate').count(), 0, 'no turn-your-phone card');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('the menu offers the Expedition: their base, workers and Build list', async () => {
  const ctx = await browserContext(DESKTOP);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(baseUrl() + '?seed=4242', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall);
    await page.locator('#btnSolo').click();
    await board(page).race(0, 'vael');
    assert.match(await page.locator('#soloBoard [data-k="tok1"]').getAttribute('aria-label'), /^COMPUTER 1 KINGDOM,/, 'the opponent is human unless chosen');
    await page.locator('#btnStart').click();
    await page.waitForFunction(() => endfall.G.units.length > 0);
    const mine = await page.evaluate(() => ({ b: endfall.G.bldgs.filter(b => b.team === 0).map(b => b.type), u: [...new Set(endfall.G.units.filter(u => u.team === 0).map(u => u.type))], f: endfall.G.factions }));
    assert.deepEqual(mine.b, ['conflux']); assert.deepEqual(mine.u, ['lumen']); assert.deepEqual(mine.f, ['vael', 'humans'], 'the AI plays the humans');
    await page.evaluate(() => { endfall.ui.sel = endfall.G.units.filter(u => u.team === 0).slice(0, 1); endfall.ui.mode = 'build'; });
    await page.waitForFunction(() => [...document.querySelectorAll('#cmd button .l')].some(l => l.textContent === 'Cabin'), null, { timeout: 10000 }); // (the card redraws on the next frame)
    const labels = await page.$$eval('#cmd button .l', ls => ls.map(l => l.textContent));
    assert.deepEqual(labels, ['Recruiting', 'Cabin', 'Data center', 'Back'], 'the Expedition\'s Build list (Advanced once its Recruiting post stands)');
    await page.evaluate(() => { endfall.ui.mode = null; });
    await page.waitForFunction(() => ![...document.querySelectorAll('#cmd button .l')].some(l => l.textContent === 'Cabin'), null, { timeout: 10000 });
    assert.ok(!(await page.locator('#shBar').isVisible()), 'a Bot has no shields to show (none since the re-theme)');
    const card = await page.$$eval('#cmd button .l', ls => ls.map(l => l.textContent));
    assert.ok(!card.includes('Repair'), `the Expedition do not repair: ${card}`);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('phone: as the Expedition, a Bot stays at its Cabin; pulled away, the site pauses and Resume sends one back', { chromium: CDP_TOUCH }, async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false, race: 'vael' });
  try {
    await d.grant(1000, 0);
    const s = await d.state(), hq = s.bldgs.find(b => b.team === 0 && b.type === 'conflux');
    const lumen = s.units.find(u => u.team === 0 && u.type === 'lumen');
    const spot = await d.findSpot('spire', { tx: hq.tx + 1, ty: hq.ty + 1 });
    await d.buildWithUI('s', 'spire', spot.tx, spot.ty, lumen.id);
    const spire = () => d.state().then(st => st.bldgs.find(b => b.team === 0 && b.type === 'spire'));
    await until(d, async () => (await spire())?.progress > 0.2, { seconds: 30, what: 'the Cabin to rise' });
    const task = async () => (await d.state()).units.find(u => u.id === lumen.id).task;
    assert.equal(await task(), 'build', 'the Bot stays on its site');
    // Pull the Bot off (tap until it, not the site it stands on, is the selection) and send it to the gold.
    const node = (await d.state()).nodes.filter(n => n.type === 'shard').sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y))[0];
    for (let i = 0; i < 8; i++) { await d.clickEntity(lumen.id); if ((await d.selection()).some(e => e.id === lumen.id)) break; await d.page.waitForTimeout(200); }
    assert.ok((await d.selection()).some(e => e.id === lumen.id), 'the Bot selected');
    await d.clickWorld(node.x, node.y);
    await until(d, async () => (await d.toasts()).some(t => /Cabin paused: no builder \(select it and tap Resume\)/.test(t)), { seconds: 10, what: 'the paused-site toast' });
    const p = (await spire()).progress;
    await d.skip(4);
    assert.equal((await spire()).progress, p, 'no Bot, no progress');
    await d.clickEntity((await spire()).id);
    assert.match(await d.hudText('#selSub', /Paused/), /Paused: no builder/, 'the panel says so');
    const labels = (await d.card()).map(c => c.label);
    assert.ok(labels.includes('Resume') && !labels.includes('Plant'), `Resume on the card: ${labels}`);
    await d.pressCard('Resume');
    await until(d, async () => (await spire())?.done, { seconds: 60, what: 'the resumed Cabin to finish' });
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('the menu can pit you against an Expedition opponent', async () => {
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
    assert.deepEqual(await page.evaluate(() => endfall.G.bldgs.filter(b => b.team === 1).map(b => b.type)), ['conflux'], 'the enemy starts with a Data center');
  } finally { await ctx.close(); }
});

test('phone: placing a building lets the worker go; a tap on a blocked spot says why and keeps placing', { chromium: CDP_TOUCH }, async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    await d.grant(5000, 5000);
    let s = await d.state();
    const core = coreOf(s), h = mine(s, 'harvester')[0];
    // A tap on the Core (blocked) while placing a Cottage: told why, still placing (Cancel on the card stops it).
    await d.clickEntity(h.id);
    await d.pressCard('Build'); await d.pressCard('Cottage');
    await d.clickWorld(core.x, core.y);
    assert.ok(await d.eval(() => !!endfall.ui.place), 'a blocked tap keeps placing');
    assert.match((await d.toasts()).join(' | '), /Cannot build there/);
    assert.deepEqual((await d.selection()).map(e => e.id), [h.id], 'the worker is still selected');
    assert.ok((await d.card()).some(c => c.label === 'Cancel'), 'its Build button is a Cancel');
    await d.pressCard('Cancel');
    assert.equal(await d.eval(() => endfall.ui.place), null, 'Cancel stops placing');
    // A good spot: the site is placed and the worker let go, so it is clear the order took.
    const spot = await d.findSpot('depot', { tx: core.tx + 1, ty: core.ty + 1 });
    await d.buildWithUI('w', 'depot', spot.tx, spot.ty, h.id);
    s = await d.state();
    assert.ok(myBldg(s, 'depot').some(b => b.tx === spot.tx && b.ty === spot.ty), 'the Cottage site is placed');
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
    assert.deepEqual(card.map(c => c.label), ['Villager', 'Rally', 'Cancel'], 'Cancel is there before anything is queued');
    assert.equal(card[2].enabled, false, 'greyed out');
    const slot = () => d.eval(() => endfall.cardItems().find(i => i.id === 'cancelq')?.slot);
    const before = await slot();
    await d.pressCard('Villager');
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
    const h = s.units.filter(u => u.team === 0 && u.type === 'harvester' && u.id !== miner.id).sort((a, b) => Math.hypot(b.x - node.x, b.y - node.y) - Math.hypot(a.x - node.x, a.y - node.y))[0]; // (the farthest: its body well out of the tap's reach)
    const hk = Math.hypot(h.x - node.x, h.y - node.y) || 1; // (sent straight away from the field, never past it)
    await d.eval(([id, x, y]) => endfall.engine.moveTo(endfall.G.units.find(u => u.id === id), x, y), [h.id, h.x + (h.x - node.x) / hk * 200, h.y + (h.y - node.y) / hk * 200]); // (set-up)
    // (on its way, clear of the others: a tap on one of a clump of workers may pick any of them, the bodies overlap)
    assert.ok(await d.skipUntil((id) => { const u = endfall.G.units.find(u => u.id === id); return endfall.G.units.every(v => v === u || Math.hypot(v.x - u.x, v.y - u.y) > 48); }, h.id, { seconds: 8, step: 0.1 }), 'the worker clear of the others');
    await d.clickEntity(h.id);
    assert.deepEqual((await d.selection()).map(e => e.id), [h.id]);
    // Tap inside the field's edge (a field is picked within 6 px of its radius), towards the miner's body (drawn half its
    // height above its feet), close enough that a plain pick would take the miner: the field wins.
    const m = (await d.state()).units.find(u => u.id === miner.id), my = m.y - await d.eval(() => endfall.unitTop('harvester')) / 2;
    const k = Math.hypot(m.x - node.x, my - node.y), tap = [node.x + (m.x - node.x) / k * (node.r + 5), node.y + (my - node.y) / k * (node.r + 5)];
    const reach = await d.eval(([x, y, mx, my]) => Math.hypot(x - mx, y - my) - Math.max(endfall.engine.UNITS.harvester.r * 1.2 * 1.4, endfall.unitTop('harvester') / 2) - Math.max(16, 28 / endfall.cam.zoom), [...tap, m.x, my]);
    assert.ok(reach <= 0, `the tap is within a finger's reach of the miner's body (${reach.toFixed(1)} px)`);
    await d.clickWorld(...tap);
    s = await d.state();
    assert.equal(s.units.find(u => u.id === h.id).task, 'gather', `the selected worker goes to gather (the tap ${tap.map(Math.round)}, the field ${[node.x, node.y]}: ${JSON.stringify(s.units.filter(u => Math.hypot(u.x - tap[0], u.y - tap[1]) < 90).map(u => [u.id, Math.round(u.x), Math.round(u.y), u.task]))}, h ${h.id})`);
    assert.ok(!(await d.selection()).some(e => e.id === miner.id), 'the miner was not selected instead');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('an Expedition unit\'s health figure is its hull (no shields since the re-theme)', async () => {
  const d = await newGame(DESKTOP, 0, 4242, { ai: false, race: 'vael' });
  try {
    const hq = (await d.state()).bldgs.find(b => b.team === 0);
    const id = await d.eval(([x, y]) => endfall.engine.debugSpawn(0, 'scythe', x, y), [hq.x + 150, hq.y + 110]);
    await d.clickEntity(id);
    const total = await d.eval(() => endfall.engine.UNITS.scythe.hp);
    assert.equal(await d.eval(() => endfall.engine.UNITS.scythe.shields), 0);
    assert.equal(await d.hudText('#hpNum', new RegExp(`^${total}/${total}$`)), `${total}/${total}`, 'its hull, over its maximum');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: one tap on the card uses an ability for the selection (Brace); Trebuchets anchor by themselves (no button)', async () => {
  const d = await newGame(PHONE, 0, 4242, { ai: false });
  try {
    const core = coreOf(await d.state());
    const ids = await d.eval(([x, y]) => [0, 1, 2].map(i => endfall.engine.debugSpawn(0, 'trooper', x + i * 26, y)), [core.x + 180, core.y + 120]);
    const tanks = await d.eval(([x, y]) => [0, 1].map(i => endfall.engine.debugSpawn(0, 'siegeTank', x + i * 40, y)), [core.x + 180, core.y + 210]);
    await d.boxSelect(core.x + 150, core.y + 90, core.x + 260, core.y + 150); // (the troopers only)
    const units = () => d.eval((ids) => endfall.G.units.filter(u => ids.includes(u.id)).map(u => ({ hp: u.hp, mode: u.mode, swap: u.swap })), [...ids, ...tanks]);
    assert.deepEqual((await d.selection()).map(e => e.id).sort(), ids.slice().sort());
    await d.eval(() => endfall.engine.debugResearch(0, 'entrenching')); // (set-up: Shield Drill researched)
    await d.skip(0.1);
    await d.pressCard('Brace');
    await d.skip(2.5);
    const after = await units();
    assert.ok(after.slice(0, 3).every(u => u.mode === 'entrench'), `all three braced: ${JSON.stringify(after)}`);
    // Two Trebuchets standing: they set up by themselves, and their card has no Deploy or Undeploy.
    await d.skip(3.5);
    await d.boxSelect(core.x + 150, core.y + 180, core.x + 260, core.y + 240);
    assert.deepEqual((await d.selection()).map(e => e.id).sort(), tanks.slice().sort());
    const labels = (await d.card()).map(c => c.label);
    assert.ok(!labels.includes('Set Up') && !labels.includes('Undeploy'), `no Deploy button: ${labels}`);
    const [a, b] = (await units()).slice(3);
    assert.ok(a.mode === 'deploy' && b.mode === 'deploy', `both set up by themselves: ${JSON.stringify([a, b])}`);
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('a Trebuchet deploys by itself where it stands (no button, D does nothing), shells what is in reach but not inside its blind ring, and a move packs it up', async () => {
  const d = await newGame(DESKTOP, 0, 4242, { ai: false });
  try {
    const core = coreOf(await d.state()), T = 32; // (a tile, px)
    const tank = await d.eval(([x, y]) => endfall.engine.debugSpawn(0, 'siegeTank', x, y), [core.x + 180, core.y + 200]);
    const me = () => d.eval((id) => { const u = endfall.G.units.find(u => u.id === id); return u && { x: u.x, y: u.y, mode: u.mode, swap: u.swap, task: u.task.t }; }, tank);
    await d.clickEntity(tank);
    assert.ok(!(await d.card()).some(c => c.label === 'Set Up' || c.label === 'Undeploy'), `no Deploy on the card: ${JSON.stringify(await d.card())}`);
    assert.equal((await me()).mode, 'deploy', 'standing, it sets up by itself');
    assert.match(await d.hudText('#selSub', /Deploying/), /Deploying/, 'the console says it is deploying');
    await d.skip(3.5);
    assert.match(await d.hudText('#selSub', /Deployed/), /Deployed/);
    await d.page.keyboard.press('d');
    assert.equal((await me()).mode, 'deploy', 'D does nothing: it stays deployed');
    // An enemy 7 tiles off is shelled; one inside the blind ring (1.5 tiles) is not.
    const at = await me();
    const [far, near] = await d.eval(([x, y, T]) => [endfall.engine.debugSpawn(1, 'medic', x + 7 * T, y), endfall.engine.debugSpawn(1, 'medic', x - 1.5 * T, y)], [at.x, at.y, T]);
    const hp = (id) => d.eval((id) => endfall.G.units.find(u => u.id === id)?.hp ?? 0, id);
    const full = await hp(near);
    await until(d, async () => (await hp(far)) === 0, { seconds: 20, what: 'the far Healer to fall' });
    assert.equal(await hp(near), full, 'nothing inside its blind ring is hit');
    // A move order packs it up first, then it drives.
    await d.rightClickWorld(at.x, at.y - 6 * T);
    const packing = await me();
    assert.ok(packing.mode === null && packing.swap > 0, `packing up: ${JSON.stringify(packing)}`);
    await d.skip(5);
    const moved = await me();
    assert.ok(at.y - moved.y > T, `on its way once packed up: ${JSON.stringify(moved)}`);
    await until(d, async () => (await me()).mode === 'deploy', { seconds: 20, what: 'the tank to set up again where it stopped' });
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('the end screen counts the result on the menu, and Rematch replays the same map', async () => {
  const d = await newGame(DESKTOP, 0, 4242);
  try {
    await d.eval(() => localStorage.removeItem('endfall.record'));
    const setup = () => d.eval(() => { const c = endfall.G.bldgs.find(b => b.team === endfall.G.me && b.d.hq); return JSON.stringify([endfall.G.seed, endfall.G.factions, c.tx, c.ty]); });
    const before = await setup();
    // A few Guards, then a short game: the enemy's Core nearly down, and our Archers beside it.
    await d.skip(25);
    const s = await d.state(), foeCore = s.bldgs.find(b => b.team !== 0 && b.type === 'core');
    await d.eval(([id, x, y]) => { endfall.engine.debugSetHp(id, 5); for (let i = 0; i < 4; i++) endfall.engine.debugSpawn(0, 'lancer', x + i * 20, y + 90); }, [foeCore.id, foeCore.x, foeCore.y]);
    await until(d, async () => (await d.state()).over, { seconds: 60, step: 1, what: 'the game to end' });
    await d.page.locator('#end').waitFor({ state: 'visible' });
    assert.equal(await d.page.locator('#result').textContent(), 'VICTORY');
    await d.page.locator('#btnRematch').click();
    await until(d, async () => !(await d.state()).over, { seconds: 10, step: 0.5, what: 'the rematch' });
    assert.ok(await d.page.locator('#end').isHidden(), 'Rematch starts at once');
    assert.equal(await setup(), before, 'the same map, races and starting base');
    assert.ok(await d.eval(() => endfall.G.time < 5), 'from the start');
    // Back on the menu: on the record for this race and difficulty.
    await d.page.locator('#btnPause').click();
    await d.page.locator('#btnQuit').click();
    assert.deepEqual(Object.values(await storedRecord(d.page)), [[1, 1]]); // (the win, and the rematch left: leaving gives a game up)
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('a double-click on a factory selects all of them and they train as one; the idle-factory key (,) finds the idle ones', async () => {
  const d = await newGame(DESKTOP, 0, 4242, { ai: false });
  try {
    await d.grant(3000, 500);
    const s = await d.state(), core = coreOf(s), hs = mine(s, 'harvester');
    assert.equal(await d.page.locator('#btnProd').count(), 0, 'no idle-factory chip in the top bar');
    const a = await d.findSpot('barracks', { tx: core.tx + 6, ty: core.ty });
    await d.buildWithUI('c', 'barracks', a.tx, a.ty, hs[0].id);
    const b = await d.findSpot('barracks', { tx: a.tx + 4, ty: a.ty });
    await d.buildWithUI('c', 'barracks', b.tx, b.ty, hs[1].id);
    const rax = () => d.state().then(st => st.bldgs.filter(x => x.team === 0 && x.type === 'barracks'));
    await until(d, async () => (await rax()).filter(x => x.done).length === 2, { seconds: 120, what: 'two Crew Halls' });
    await d.key('Escape');
    // The key selects one, then the next.
    await d.key(',');
    const first = (await d.selection())[0];
    await d.key(',');
    const second = (await d.selection())[0];
    assert.ok(first.type === 'barracks' && second.type === 'barracks' && first.id !== second.id, 'it cycles through them');
    // Double-click one: both are selected; two Guards go one to each.
    const [g0, g1] = await rax();
    await d.centerOn((g0.x + g1.x) / 2, (g0.y + g1.y) / 2);
    const [px, py] = await d.screen(g0.x, g0.y, false); // (both in view)
    await d.page.mouse.click(px, py); await d.page.mouse.click(px, py);
    assert.equal((await d.selection()).filter(e => e.type === 'barracks').length, 2, 'double-click selects both Crew Halls');
    await d.pressCard('Guard'); await d.pressCard('Guard');
    assert.deepEqual((await rax()).map(x => x.queue.length), [1, 1], 'one Guard in each queue');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: a double-tap on a factory selects all of them, the console shows them, and they train as one', { chromium: CDP_TOUCH }, async () => {
  const d = await newGame(PHONE, 0, 4242, { ai: false });
  try {
    await d.grant(3000, 500);
    const s = await d.state(), core = coreOf(s), hs = mine(s, 'harvester');
    const a = await d.findSpot('barracks', { tx: core.tx + 6, ty: core.ty });
    await d.buildWithUI('c', 'barracks', a.tx, a.ty, hs[0].id);
    const b = await d.findSpot('barracks', { tx: a.tx + 4, ty: a.ty });
    await d.buildWithUI('c', 'barracks', b.tx, b.ty, hs[1].id);
    const rax = () => d.state().then(st => st.bldgs.filter(x => x.team === 0 && x.type === 'barracks'));
    await until(d, async () => (await rax()).filter(x => x.done).length === 2, { seconds: 120, what: 'two Crew Halls' });
    const [g0, g1] = await rax();
    await d.centerOn((g0.x + g1.x) / 2, (g0.y + g1.y) / 2);
    const top = g0.y < g1.y ? g0 : g1; // (the upper one: the console that the first tap brings up covers the bottom)
    const [px, py] = await d.screen(top.x, top.y, false);
    await d.doubleTapAt(px, py);
    assert.equal((await d.selection()).filter(e => e.type === 'barracks').length, 2, 'both Crew Halls');
    await d.hudText('#selName', /2 buildings/);
    const t0 = await d.eval(() => endfall.G.time);
    await d.pressCard('Guard'); await d.pressCard('Guard');
    assert.deepEqual((await rax()).map(x => x.queue.length), [1, 1], 'one Guard in each queue');
    await d.page.waitForFunction((t0) => endfall.G.time > t0, t0, { timeout: 15000 }).catch(() => assert.fail('the game runs on')); // (waited for: a busy machine may give the page a frame a second)
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: a long-press on a unit to train shows what it is and costs, its base stats in two rows, and what it fights best beside and what beats it', { chromium: CDP_TOUCH }, async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    await d.grant(1000, 0);
    const s = await d.state(), core = coreOf(s), h = mine(s, 'harvester')[0];
    const spot = await d.findSpot('barracks', { tx: core.tx + 6, ty: core.ty });
    await d.buildWithUI('c', 'barracks', spot.tx, spot.ty, h.id);
    const rax = () => d.state().then(st => st.bldgs.find(b => b.team === 0 && b.type === 'barracks'));
    await until(d, async () => (await rax())?.done, { seconds: 90, what: 'the Barracks' });
    await d.clickEntity((await rax()).id);
    await d.readyCard('Guard');
    const cdp = await d.page.context().newCDPSession(d.page);
    const info = d.page.locator('#cmdInfo');
    // Held on a unit's button: its card, and its stat chips by row (each chip's label and its offset in the card).
    const hold = async (label) => {
      const b = await d.page.locator('#cmd button', { hasText: label }).boundingBox();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }] });
      await d.page.waitForTimeout(700);
      const card = await info.evaluate(box => {
        const r = box.getBoundingClientRect();
        return { box: [r.left, r.top, r.right, r.bottom], vw: innerWidth, vh: innerHeight, rows: [...box.querySelectorAll('.sr')].map(row => ({
          one: row.getBoundingClientRect().height < 26, chips: [...row.children].map(c => ({ label: c.getAttribute('aria-label'), text: c.textContent, x: Math.round(c.getBoundingClientRect().left - r.left) })) })) };
      });
      return { text: await info.textContent(), ...card };
    };
    const release = async () => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await info.waitFor({ state: 'hidden', timeout: 5000 }); };
    const T = await d.eval(() => endfall.engine.UNITS.trooper), M = await d.eval(() => endfall.engine.UNITS.observer);
    const trooper = await hold('Guard');
    assert.match(trooper.text, /^Guard\s*50/, 'its name and cost first');
    assert.match(trooper.text, /Spear infantry, cheap and steady\./, 'and what it does');
    assert.match(trooper.text, /Best with Archers\. Beaten by Rovers\./, 'its partner and its killer, one line');
    assert.equal(await info.locator('img').count(), 0, 'no portraits of other units');
    assert.doesNotMatch(await d.page.locator('#cmd button', { hasText: 'Guard' }).getAttribute('title'), /against|Health|Damage/i, 'nor counters or stats in the tooltip');
    // Its base stats, from the sim's tables: toughness (no Shields slot for the Humans), then attack.
    assert.deepEqual(trooper.rows.map(r => r.chips.map(c => c.label)), [[`Health ${T.hp}`, `Armour ${T.armor}`], [`Damage ${T.weapon.dmg}`, 'Hits ground']]); // (the Guard strikes the ground only)
    assert.ok(trooper.rows.every(r => r.one), 'each row on one line');
    assert.ok(trooper.box[0] >= 0 && trooper.box[1] >= 0 && trooper.box[2] <= trooper.vw && trooper.box[3] <= trooper.vh, `the card fits the screen: ${trooper.box}`);
    await release();
    // An unarmed unit (the Balloon, at the Blacksmith): a dash, then its tags, every slot where the Guard's is.
    await d.grant(1000, 500);
    const factory = await buildAndFinish(d, 's', 'factory', 1);
    await d.clickEntity(factory.id);
    await d.readyCard('Balloon');
    const medic = await hold('Balloon');
    assert.deepEqual(medic.rows.map(r => r.chips.map(c => c.text)), [[String(M.hp), String(M.armor)], ['—', 'Flying']]);
    assert.deepEqual(medic.rows.map(r => r.chips.map(c => c.x)), trooper.rows.map(r => r.chips.map(c => c.x)), 'the same positions as the Guard\'s');
    await release();
    assert.equal(await d.eval(() => endfall.G.bldgs.filter(b => b.team === 0).reduce((n, b) => n + b.queue.length, 0)), 0, 'the long-presses trained nothing');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: SELECT, HOME and ARMY one row of three alike above the minimap; Home looks at the base, Army selects the whole army and a second tap looks at it', { chromium: CDP_TOUCH }, async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    const core = coreOf(await d.state());
    const view = () => d.eval(() => { const c = endfall.cam, v = endfall.view; return { x: c.x + v.w / c.zoom / 2, y: c.y + v.h / c.zoom / 2 }; });
    const box = await d.eval(() => Object.fromEntries(['btnBox', 'btnHome', 'btnArmy', 'minimap', 'msg'].map(id => { const b = document.getElementById(id).getBoundingClientRect(); return [id, { l: b.left, r: b.right, t: b.top, b: b.bottom }]; })));
    const [s, h, a] = [box.btnBox, box.btnHome, box.btnArmy], size = (b) => [Math.round(b.r - b.l), Math.round(b.b - b.t)];
    assert.ok(size(s)[0] >= 40 && size(s)[1] >= 44 && [h, a].every(b => size(b).join() === size(s).join() && Math.abs(b.t - s.t) < 1), `three alike, a finger each, in one row: ${JSON.stringify(box)}`);
    assert.ok(s.r < h.l && h.r < a.l && s.b <= box.minimap.t && box.msg.b <= s.t + 0.5, `SELECT, HOME, ARMY left to right above the minimap, the toasts above them: ${JSON.stringify(box)}`);
    assert.ok(Math.abs(s.l - box.minimap.l) <= 1.5 && Math.abs(a.r - box.minimap.r) <= 1.5, `the row as wide as the minimap: ${JSON.stringify(box)}`);
    assert.deepEqual(await d.eval(() => ['btnBox', 'btnHome', 'btnArmy'].map(id => document.getElementById(id).innerText.trim())), ['SELECT', 'HOME', 'ARMY'], 'an icon and its word each');
    await d.centerOn(core.x > 1000 ? 300 : 1700, core.y > 1000 ? 300 : 1700);
    await d.page.locator('#btnHome').tap();
    const v = await view();
    assert.ok(Math.hypot(v.x - core.x, v.y - core.y) < 64, `Home centres on the Core: ${JSON.stringify(v)}`);
    // Army: every combat unit, wherever it is (not the harvesters); a second tap looks at them.
    const far = { x: core.x > 1000 ? 700 : 1350, y: core.y > 1000 ? 700 : 1350 }; // (clear of the map's edge: the view can centre there)
    const ids = await d.eval(([x, y]) => [0, 1, 2].map(i => endfall.engine.debugSpawn(0, 'trooper', x + i * 24, y)), [far.x, far.y]);
    await d.page.locator('#btnArmy').tap();
    assert.deepEqual(await d.eval(() => endfall.ui.sel.map(e => e.id).sort((a, b) => a - b)), [...ids].sort((a, b) => a - b), 'Army: the three Guards, no harvester');
    assert.ok(Math.hypot((await view()).x - core.x, (await view()).y - core.y) < 64, 'one tap: the view stays home');
    await d.eval(() => { const b = document.getElementById('btnArmy'); b.click(); b.click(); }); // (two presses within the second: a busy machine's taps may not be)
    const w = await view();
    assert.ok(Math.hypot(w.x - far.x - 24, w.y - far.y) < 64, `a second tap looks at the army: ${JSON.stringify(w)}`);
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: the pause card has five buttons (BACK TO GAME across, four equal below) and fits a small phone; PAUSE leaves full screen, BACK TO GAME goes back into it; Leave game goes back to the menu and counts as a defeat', { skip: notIn(['webkit'], IPHONE) }, async () => {
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
    assert.deepEqual(boxes.map(b => b[0]), ['BACK TO GAME', 'HOW TO PLAY', 'OPTIONS', 'RESTART', 'LEAVE GAME']);
    assert.ok(boxes.every(b => b[2] === boxes[0][2] && b[2] >= 44), `one height, big enough: ${JSON.stringify(boxes)}`);
    assert.ok(boxes.slice(1).every(b => b[1] === boxes[1][1]) && boxes[0][1] > 2 * boxes[1][1], `four of one width, BACK TO GAME across: ${JSON.stringify(boxes)}`);
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
    assert.ok(Object.values(await storedRecord(d.page)).some(([, l]) => l === 1), 'counted as a defeat');
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
    const all = () => d.boxSelect(core.x + 140, core.y + 80, core.x + 230, core.y + 150);
    await all();
    assert.deepEqual(await types(), ['medic', 'trooper', 'trooper', 'trooper']);
    await d.page.locator('#group .gi[data-t="trooper"]').tap();
    assert.deepEqual(await types(), ['trooper', 'trooper', 'trooper'], 'tap: only the Guards');
    await all();
    const tile = await d.page.locator('#group .gi[data-t="trooper"]').boundingBox();
    const cdp = await d.page.context().newCDPSession(d.page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tile.x + tile.width / 2, y: tile.y + tile.height / 2 }] });
    await d.page.waitForTimeout(700);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await d.page.waitForTimeout(200);
    assert.deepEqual(await types(), ['medic'], 'long-press: the Guards dropped');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('a click on a unit tile selects that unit alone, Shift+click drops it', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    const core = coreOf(await d.state());
    const ids = await d.eval(([x, y]) => [0, 1, 2].map(i => endfall.engine.debugSpawn(0, 'trooper', x + i * 24, y)), [core.x + 160, core.y + 100]);
    await d.page.waitForTimeout(300);
    await d.key('q');
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
    await d.hudText('#tut', /1\/7/);
    assert.match(await d.page.locator('#tut').textContent(), /train a Villager, and another once you have 50 gold again/);
    // Step 1: the Core, then Villager twice (the button pulses).
    await d.grant(1000, 0);
    const s = await d.state(), core = coreOf(s);
    await d.clickEntity(core.id);
    await d.page.waitForTimeout(300);
    assert.equal(await d.page.locator('#cmd button.pulse').getAttribute('data-id'), 't_harvester', 'the Villager button pulses');
    await d.pressCard('Villager'); await d.pressCard('Villager');
    await d.skip(30);
    await d.hudText('#tut', /2\/7/);
    // Step 2: a Villager, Build: the Build button pulses; a Barracks finishes the step.
    // A Villager standing at its field (one on the move can slip from under the tap).
    for (let i = 0; i < 8 && !(await d.selection()).some(e => e.type === 'harvester'); i++) {
      const id = await d.eval(() => (endfall.G.units.find(u => u.team === 0 && u.d.worker && u.task.t === 'gather' && u.task.phase === 'mine') || endfall.G.units.find(u => u.team === 0 && u.d.worker)).id);
      await d.clickEntity(id);
    }
    assert.ok((await d.selection()).some(e => e.type === 'harvester'), 'a Villager selected');
    const h = (await d.selection()).find(e => e.type === 'harvester');
    await d.page.waitForTimeout(300);
    assert.equal(await d.page.locator('#cmd button.pulse').first().getAttribute('data-id'), 'build');
    const spot = await d.findSpot('barracks', { tx: core.tx + 5, ty: core.ty });
    await d.buildWithUI('c', 'barracks', spot.tx, spot.ty, h.id);
    await until(d, async () => (await d.state()).bldgs.some(b => b.team === 0 && b.type === 'barracks' && b.done), { seconds: 90, what: 'the Barracks' });
    await d.hudText('#tut', /3\/7/);
    assert.match(await d.page.locator('#tut').textContent(), /Train 6 Guards and 2 Archers at the Barracks/, 'then the army');
    // Step 3: the army (spawned: the training is another test's), out of the way mid-map.
    await d.eval(() => { const c = 32 * 32; for (let i = 0; i < 6; i++) endfall.engine.debugSpawn(0, 'trooper', c, c); for (let i = 0; i < 2; i++) endfall.engine.debugSpawn(0, 'lancer', c, c); });
    await d.hudText('#tut', /4\/7/);
    assert.match(await d.page.locator('#tut').textContent(), /Build a Market in your base: it earns gold by itself/, 'then a Market (it needs the Barracks)');
    // The opponent waits: by 5:30, with the Market not built, none of its fighters has crossed to our half.
    await d.skip(Math.max(0, 330 - await d.eval(() => endfall.G.time)));
    assert.equal(await d.eval(() => { const me = endfall.G.bldgs.find(b => b.team === 0 && b.d.hq), foe = endfall.G.bldgs.find(b => b.team === 1 && b.d.hq); return endfall.G.units.filter(u => u.team === 1 && !u.d.worker && Math.hypot(u.x - me.x, u.y - me.y) < Math.hypot(u.x - foe.x, u.y - foe.y)).length; }), 0, 'no attack yet');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('the first game\'s "hold your base" lasts while an enemy army is at the base, past its 150 s, and ends once it is gone; then train more and attack', async () => {
  const d = await newGame(DESKTOP, 0, 4242, { first: true, ai: false });
  // (the checklist moves on in the HUD's tick, in real time: a slow software-WebGL frame may hold it a while)
  const step = (n) => d.page.locator('#tut').filter({ hasText: new RegExp(`${n}/7`) }).waitFor({ timeout: 30000 });
  try {
    await step(1);
    await d.grant(3000, 0);
    let s = await d.state();
    const core = coreOf(s);
    // The scene up to the step: two workers spawned, the Barracks through the UI, the army spawned, the Market
    // through the UI.
    await d.eval(([x, y]) => { endfall.engine.debugSpawn(0, 'harvester', x, y); endfall.engine.debugSpawn(0, 'harvester', x, y); }, [core.x, core.y + 80]);
    await d.skip(1);
    await step(2);
    await buildAndFinish(d, 'c', 'barracks', 2);
    await step(3);
    // The guide's army, spawned out of the way (mid-map: it must not meet the enemy below), makes the step.
    await d.eval(() => { const c = 32 * 32; for (let i = 0; i < 6; i++) endfall.engine.debugSpawn(0, 'trooper', c, c); for (let i = 0; i < 2; i++) endfall.engine.debugSpawn(0, 'lancer', c, c); });
    await step(4);
    await buildAndFinish(d, 'x', 'extractor', 1);
    await step(5);
    assert.match(await d.page.locator('#tut').textContent(), /hold your base.*5\/7/);
    // Three enemy Guards at the base (within 12 tiles of a building of ours) but beyond what they or we would pick a
    // fight with: they stand there.
    const at = await d.eval(() => {
      const G = endfall.G, mineB = G.bldgs.filter(b => b.team === 0), core = mineB.find(b => b.d.hq);
      const near = (x, y, xs) => Math.min(...xs.map(e => Math.hypot(e.x - x, e.y - y))) / 32;
      const others = [...G.units.filter(u => u.team === 0 && u.d.worker), ...endfall.map.nodes];
      let best = null;
      for (let r = 6; r <= 14; r += 0.5) for (let a = 0; a < 48; a++) {
        const x = core.x + Math.cos(a / 48 * 6.283) * r * 32, y = core.y + Math.sin(a / 48 * 6.283) * r * 32;
        const tx = Math.floor(x / 32), ty = Math.floor(y / 32), b = near(x, y, mineB), o = near(x, y, others);
        const open = [-1, 0, 1].every(dy => [-1, 0, 1].every(dx => { const i = (ty + dy) * endfall.engine.MW + tx + dx; return !endfall.map.rock[i] && !endfall.map.occ[i]; }));
        if (b < 9.5 || b > 11 || !open) continue;
        if (!best || o > best.o) best = { x, y, o };
      }
      for (let i = 0; i < 3; i++) endfall.engine.debugSpawn(1, 'trooper', best.x, best.y);
      return best;
    });
    assert.ok(at && at.o > 9, `a spot at the base out of everyone's way (${JSON.stringify(at)})`);
    const foesAtBase = () => endfall.G.units.filter(u => u.team === 1 && !u.d.worker && endfall.G.bldgs.some(b => b.team === 0 && Math.hypot(u.x - b.x, u.y - b.y) < 12 * 32)).length;
    await d.skip(160);
    await d.page.waitForTimeout(1500); // (a few of the HUD's ticks: the checklist has looked)
    assert.equal(await d.eval(foesAtBase), 3, 'they are still at the base');
    assert.match(await d.page.locator('#tut').textContent(), /5\/7/, 'the step goes on past its 150 s while they are there');
    // Gone (a strike force spawned on them), the step ends.
    await d.eval(([x, y]) => { for (let i = 0; i < 10; i++) endfall.engine.debugSpawn(0, 'trooper', x, y); }, [at.x, at.y]);
    assert.ok(await d.skipUntil((src) => (0, eval)(`(${src})`)() === 0, foesAtBase.toString(), { seconds: 60 }), 'the enemy at the base destroyed');
    await d.skip(1);
    // Then population, where it runs out: the Castle's 20 hold the guide's six workers and eight soldiers, not the
    // army of 15 the last step asks for.
    await step(6);
    assert.match(await d.page.locator('#tut').textContent(), /The army of 15 needs more population: select a Villager and Build a Cottage/);
    await buildAndFinish(d, 'w', 'depot');
    await step(7);
    assert.match(await d.page.locator('#tut').textContent(), /Spend your gold on Guards \(an army of 15\), then select it \(ARMY or Q\) and Attack their base/);
    // Eighteen strong already (the guide's eight and the strike force): with the army selected, Attack pulses.
    await d.key('q');
    await d.page.locator('#cmd button.pulse[data-id="attack"]').waitFor({ timeout: 10000 });
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
    await d.eval(([x, y]) => { endfall.engine.debugSpawn(1, 'shrike', x + 60, y - 40); endfall.engine.debugSpawn(1, 'knight', x + 40, y); }, [x, core.y]);
    await d.page.waitForFunction(() => [...document.querySelectorAll('#msg .toast')].some(t => /Enemy flyers spotted/.test(t.textContent)), null, { timeout: 5000 });
    await until(d, async () => (await d.state()).units.every(u => u.team !== 0 || u.type !== 'trooper'), { seconds: 20, step: 1, what: 'the Guard to fall' });
    await d.page.waitForFunction(() => [...document.querySelectorAll('#msg .toast')].some(t => /No army left/.test(t.textContent)), null, { timeout: 5000 });
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('the screen is lean: resources, supply, full screen, sound and pause on top, no empty panel; the clock lives in the pause card', async () => {
  for (const dev of [DESKTOP, PHONE]) {
    const d = await newGame(dev, 1, 4242, { ai: false });
    try {
      const shown = await d.eval(() => [...document.querySelectorAll('#top > *')].filter(e => e.offsetParent !== null && getComputedStyle(e).display !== 'none' && !e.classList.contains('spacer')).map(e => e.id || e.className));
      const want = ['resShard', 'resSup', ...(await d.eval(() => !document.getElementById('btnFull').hidden) ? ['btnFull'] : []), 'btnSound', 'btnPause'];
      assert.deepEqual(shown, want, 'the top bar at the start: ' + shown.join(' '));
      assert.ok(await d.page.locator('#info').isHidden(), 'nothing selected: no panel');
      await d.skip(30);
      await (d.touch ? d.page.locator('#btnPause').tap() : d.page.locator('#btnPause').click());
      assert.match(await d.page.locator('#pauseTime').textContent(), /0:3\d into the game/, 'the clock, on demand');
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
    await page.locator('#mapSel').selectOption({ label: 'Glass Reach · up to 2' });
    const second = await pixels();
    assert.notEqual(first, second, 'another map, another thumbnail');
    assert.ok(new Set(second.split(',')).size > 8, 'rock, fields and starts in it');
    await page.locator('#mapSel').selectOption({ label: 'Random · up to 2' });
    assert.equal(await page.locator('#mapPreview').getAttribute('title'), 'A new map every time');
  } finally { await ctx.close(); }
});

// Single player's board (src/client/seats.js, menu.js): eight fixed spots, + SEAT in the lowest empty one, a seat's sheet
// (race, level, side), the map list.
/** In the page: the board's words cut (by as little as a pixel's fraction: the text is wider than its box, scrolls,
 *  or ends in an ellipsis) and anything of a token past its edge; installed on every page by `cutCheck`. */
const cutCheck = (page) => page.addInitScript(() => {
  window.cutWords = () => {
    const words = [...document.querySelectorAll('#soloBoard .tok > *, #soloBoard .add, #mapSel')].filter(e => e.textContent.trim());
    const cut = words.filter(e => {
      if (e.tagName === 'SELECT') { const o = e.selectedOptions[0], c = document.createElement('canvas').getContext('2d'), st = getComputedStyle(e); c.font = `${st.fontWeight} ${st.fontSize} ${st.fontFamily}`; return c.measureText(o.textContent).width + (o.textContent.length * parseFloat(st.letterSpacing || 0) || 0) > e.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight) + 0.5; }
      const r = document.createRange(); r.selectNodeContents(e);
      return r.getBoundingClientRect().width > e.getBoundingClientRect().width + 0.01 || e.scrollWidth > e.clientWidth || (getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth);
    }).map(e => e.textContent);
    const out = [...document.querySelectorAll('#soloBoard .tok')].filter(t => [...t.children].some(c => c.getBoundingClientRect().right > t.getBoundingClientRect().right + 0.5 || c.getBoundingClientRect().bottom > t.getBoundingClientRect().bottom + 0.5)).map(t => t.dataset.k + ' past its edge');
    return [...cut, ...out];
  };
});
/** The open sheet is on the screen, top to bottom, and needs no scrolling. */
const sheetFits = (page) => page.locator('#soloSheet .sheet').evaluate(e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 0.5 && e.scrollHeight <= e.clientHeight + 1; });
const fitsPage = async (page, what) => {
  const [sh, ch, sw, cw] = await page.locator('#start .card.menu').evaluate(e => [e.scrollHeight, e.clientHeight, e.scrollWidth, e.clientWidth]);
  assert.ok(sh <= ch + 1 && sw <= cw + 1, `${what}: fits (${sh} > ${ch} or ${sw} > ${cw})`);
};
/** A board as saved: a side number per spot (null: empty), you in spot 0, the AIs Expedition on Hard. */
const saved = (...teams) => Array.from({ length: 8 }, (_, i) => (teams[i] == null ? null : i ? { race: 'vael', team: teams[i], diff: 2 } : { race: 'humans', team: teams[i] }));
/** Each seat's Core (tile centre), by seat. */
const cores = (page) => page.evaluate(() => endfall.G.teams.map((_, s) => { const b = endfall.G.bldgs.find(x => x.team === s && x.d.hq); return [b.tx + 2, b.ty + 2]; }));
const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('single player: eight fixed spots; + SEAT fills the lowest empty one on a side of its own; sides, levels and REMOVE in the sheet; the map list (any map that seats them, the smallest that does when they outgrow it, said); a duel on an eight-start map', async () => {
  const ctx = await browserContext({ ...PHONE, viewport: { width: 667, height: 375 } }), page = await ctx.newPage();
  try {
    await page.goto(baseUrl(), { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    const seats = board(page), label = (i) => page.locator(`#soloBoard [data-k="tok${i}"]`).getAttribute('aria-label');
    const usable = () => page.$$eval('#mapSel option', os => os.filter(o => !o.disabled).map(o => o.textContent));
    await page.locator('#btnSolo').tap();
    assert.deepEqual(await seats.spots(), ['YOU', 'COMPUTER 1', '+', '', '', '', '', ''], 'a duel by default; + SEAT in the next spot');
    assert.equal((await usable()).length, 14, 'two players: every map (the Shore\'s two included)');
    await seats.open(1);
    assert.equal(await page.locator('#soloSheet [data-k="remove"]').count(), 0, 'the last enemy stays');
    assert.deepEqual(await page.$$eval('#soloSheet [data-k^="side:"]', bs => bs.map(b => b.textContent)), ['SIDE 1', 'SIDE 2'], 'as many sides as players');
    assert.ok(await sheetFits(page), 'the sheet fits the screen');
    await page.locator('#soloSheet [data-k="close"]').tap();
    await seats.diff(1, 1); await seats.race(1, 'vael');
    // + AI: AI 2 in spot 2, on a side of its own, like the last AI. Three players: the duel's map gives way, and says so.
    await seats.add();
    assert.deepEqual(await seats.spots(), ['YOU', 'COMPUTER 1', 'COMPUTER 2', '+', '', '', '', '']);
    assert.equal(await label(2), 'COMPUTER 2 EXPEDITION, Medium, Side 3: edit', 'a new AI: a side of its own, like the last AI');
    assert.equal(await page.locator('#mapSel option:checked').textContent(), 'Dust Quarter · up to 4', 'the smallest map that seats three');
    assert.equal(await page.locator('#soloNote').textContent(), 'Map: Dust Quarter (up to 4)', 'said a moment');
    assert.deepEqual(await page.$$eval('#mapSel option:disabled', os => os.map(o => o.textContent)), ['Ashen Basin · up to 2', 'Glass Reach · up to 2', 'Cinder Divide · up to 2', 'Random · up to 2', 'Mirror Lake · up to 2', 'Random Lake · up to 2'], 'the duel\'s maps not for three (the Shore\'s too)');
    assert.equal(await page.locator('#mapPreview').evaluate(c => c.width), 96, 'the preview at the map\'s size');
    await page.waitForFunction(() => document.getElementById('soloNote').textContent === '', null, { timeout: 6000 });
    await seats.add();
    // Sides through the sheet: two against two, each token's tag; nothing on the board moved.
    const bands = await seats.bands();
    await seats.side(2, 0); await seats.side(3, 1);
    assert.deepEqual(await seats.sides(), [['YOU', 'COMPUTER 2'], ['COMPUTER 1', 'COMPUTER 3']]);
    assert.deepEqual(await page.$$eval('#soloBoard .tok .stag', ts => ts.map(t => t.innerText)), ['S1', 'S2', 'S1', 'S2'], 'a side tag on each (short on a narrow token)');
    assert.deepEqual(await seats.bands(), bands, 'every player keeps its colour');
    assert.deepEqual(await seats.spots(), ['YOU', 'COMPUTER 1', 'COMPUTER 2', 'COMPUTER 3', '+', '', '', '']);
    // Everyone on one side: START GAME waits, and says why.
    await seats.side(1, 0); await seats.side(3, 0);
    assert.ok(await page.locator('#btnStart').isDisabled());
    assert.equal(await page.locator('#soloNote').textContent(), 'Everyone is on one side');
    await seats.side(1, 1); await seats.side(3, 1);
    assert.ok(await page.locator('#btnStart').isEnabled()); assert.equal(await page.locator('#soloNote').textContent(), '');
    await fitsPage(page, 'four players, two against two');
    await page.locator('#btnStart').tap();
    await page.waitForFunction(() => endfall.G.units.length > 0);
    assert.deepEqual(await page.evaluate(() => [endfall.G.teams, endfall.engine.MW, endfall.G.me, endfall.engine.foes(), endfall.G.factions]), [[0, 0, 1, 1], 96, 0, [2, 3], ['humans', 'vael', 'vael', 'vael']]);
    // Back to the menu (leaving counts as a defeat): the board remembered. REMOVE empties a spot; + AI fills it again.
    await page.evaluate(() => { document.getElementById('btnPause').click(); });
    await page.locator('#btnQuit').tap();
    await page.locator('#menuSolo').waitFor({ state: 'visible' });
    assert.deepEqual(await seats.sides(), [['YOU', 'COMPUTER 2'], ['COMPUTER 1', 'COMPUTER 3']], 'the sides remembered');
    await seats.remove(2);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.k), 'add', 'REMOVE: the focus on + SEAT, in the spot it left');
    assert.deepEqual(await seats.spots(), ['YOU', 'COMPUTER 1', '+', 'COMPUTER 3', '', '', '', '']);
    await seats.remove(3);
    assert.deepEqual(await seats.spots(), ['YOU', 'COMPUTER 1', '+', '', '', '', '', '']);
    assert.equal(await page.locator('#mapSel option:checked').textContent(), 'Dust Quarter · up to 4', 'fewer players: the map stays');
    // A duel on an eight-start map: the map as previewed, the two far apart.
    await page.locator('#mapSel').selectOption({ label: 'Iron Compass · up to 8' });
    assert.equal(await page.locator('#mapPreview').evaluate(c => c.width), 128);
    await page.locator('#btnStart').tap();
    await page.waitForFunction(() => endfall.G.units.length > 0 && endfall.G.teams.length === 2 && endfall.engine.MW === 128);
    const [a, b] = await cores(page);
    assert.ok(apart(a, b) > 70, `two seats on opposite starts (${Math.round(apart(a, b))} tiles apart)`);
    assert.deepEqual(await page.evaluate(() => [endfall.G.seed, endfall.G.bldgs.filter(x => x.d.hq).length]), [5, 2], 'Iron Compass, a Core each, six starts free');
  } finally { await ctx.close(); }
});

test('single player: nothing on the board moves (upright and on its side) when a player comes, goes or changes side', async () => {
  for (const viewport of [{ width: 412, height: 915 }, { width: 844, height: 390 }]) {
    const ctx = await browserContext({ ...PHONE, viewport }), page = await ctx.newPage();
    try {
      await page.goto(baseUrl(), { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
      const seats = board(page), at = `${viewport.width}x${viewport.height}`;
      await page.locator('#btnSolo').tap();
      const first = await seats.boxes();
      assert.equal(first.length, 8, `${at}: eight spots`);
      assert.equal(new Set(first.map(b => `${b[2]}x${b[3]}`)).size, 1, `${at}: all one size`);
      assert.ok(first.every(b => b[2] > 0 && b[3] > 0), `${at}: laid out: ${JSON.stringify(first)}`);
      assert.equal(new Set(first.map(b => b[0])).size, viewport.width > viewport.height ? 4 : 2, `${at}: four abreast on its side, two upright`);
      const same = async (what) => assert.deepEqual(await seats.boxes(), first, `${at}, ${what}: every spot where it was`);
      await seats.add(); await same('an AI added');
      await seats.add(); await same('another (a side of its own)');
      await seats.side(2, 0); await same('an AI to your side');
      await seats.side(3, 1); await same('another to the enemies');
      await seats.remove(2); await same('an AI removed');
      await seats.add(); await same('the spot filled again');
      assert.deepEqual(await seats.spots(), ['YOU', 'COMPUTER 1', 'COMPUTER 2', 'COMPUTER 3', '+', '', '', '']);
      await fitsPage(page, at);
    } finally { await ctx.close(); }
  }
});

test('single player: each player plays in its spot\'s colour whatever its side; two against two and one against three start with the allies side by side', async () => {
  const ctx = await browserContext(DESKTOP), page = await ctx.newPage();
  try {
    // Two against two across the spots: you and AI 2 against AI 1 and AI 3 (the game seats you and AI 2 first).
    await page.addInitScript((r) => { if (!sessionStorage.getItem('once')) { sessionStorage.setItem('once', '1'); localStorage.setItem('endfall.seats', JSON.stringify(r)); localStorage.setItem('endfall.map', '4'); } }, saved(0, 1, 0, 1));
    await page.goto(baseUrl(), { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    await page.locator('#btnSolo').click();
    const bands = await board(page).bands();
    await page.locator('#btnStart').click();
    await page.waitForFunction(() => endfall.G.units.length > 0);
    assert.deepEqual(await page.evaluate(() => [endfall.G.teams, endfall.engine.MW]), [[0, 0, 1, 1], 96]);
    const spots = [0, 2, 1, 3]; // (seat by seat, the spot each came from)
    assert.deepEqual(await page.evaluate((sp) => endfall.G.teams.map((_, s) => endfall.seatTint(s) === endfall.spotTint(sp[s])), spots), [true, true, true, true], 'each seat in its spot\'s paint');
    assert.deepEqual(await page.evaluate(() => [1, 2].map(s => endfall.seatTint(s) === endfall.spotTint(s))), [false, false], 'not its seat number\'s');
    assert.equal(new Set(bands).size, 4, 'four colours on the board');
    let c = await cores(page);
    const diag = Math.max(...[1, 2, 3].map(s => apart(c[0], c[s])));
    assert.ok(apart(c[0], c[1]) < diag - 10 && apart(c[2], c[3]) < diag - 10, `allies on neighbouring starts: ${JSON.stringify(c)}`);
    // One against three on an eight-start map: the three side by side.
    await page.evaluate(() => { document.getElementById('btnPause').click(); document.getElementById('btnQuit').click(); });
    await page.locator('#menuSolo').waitFor({ state: 'visible' });
    await board(page).side(2, 1);
    await page.locator('#mapSel').selectOption({ label: 'Sunken Court · up to 8' });
    await page.locator('#btnStart').click();
    await page.waitForFunction(() => endfall.G.units.length > 0 && endfall.engine.MW === 128);
    assert.deepEqual(await page.evaluate(() => endfall.G.teams), [0, 1, 1, 1]);
    c = await cores(page);
    const near = (s, others) => Math.min(...others.filter(o => o !== s).map(o => apart(c[s], c[o])));
    assert.ok([1, 2, 3].every(s => near(s, [1, 2, 3]) < 50), `each of the three beside another: ${JSON.stringify(c)}`);
    assert.ok(near(0, [0, 1, 2, 3]) > 50, 'a free start between you and them');
  } finally { await ctx.close(); }
});

test('single player, you alone against three AIs teamed up at mixed difficulties: they are allies, each at its own level', async () => {
  const ctx = await browserContext(PHONE), page = await ctx.newPage();
  try {
    await page.goto(baseUrl(), { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    const seats = board(page);
    await page.locator('#btnSolo').tap();
    await seats.add(); await seats.add(); await seats.side(2, 1); await seats.side(3, 1); // (1v3)
    assert.deepEqual(await seats.sides(), [['YOU'], ['COMPUTER 1', 'COMPUTER 2', 'COMPUTER 3']]);
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

test('single player, five to eight (M4 2e): the 128x128 maps; free for all, four pairs and four against four fit a small phone; eight start on 128x128', async () => {
  const ctx = await browserContext({ ...PHONE, viewport: { width: 667, height: 375 } }), page = await ctx.newPage();
  try {
    await page.goto(baseUrl(), { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    const seats = board(page);
    await page.locator('#btnSolo').tap();
    for (let n = 3; n <= 8; n++) {
      await seats.add(); // (each on a side of its own: free for all)
      if (n < 5) continue;
      assert.deepEqual(await page.$$eval('#mapSel option:not(:disabled)', os => os.map(o => o.textContent)), ['Iron Compass · up to 8', 'Sunken Court · up to 8', 'Grey Warrens · up to 8', 'Random · up to 8'], `${n}: the 128x128 maps`);
      await fitsPage(page, `${n} players, each alone`);
    }
    assert.equal(await page.locator('#soloBoard .add').count(), 0, 'eight: no room for another');
    assert.equal((await seats.sides()).length, 8, 'eight sides');
    assert.equal(await page.locator('#mapPreview').evaluate(c => c.width), 128, 'the preview at the map\'s size');
    for (const i of [1, 3, 5, 7]) await seats.side(i, i - 1); // (four pairs)
    assert.deepEqual(await seats.sides(), [['YOU', 'COMPUTER 1'], ['COMPUTER 2', 'COMPUTER 3'], ['COMPUTER 4', 'COMPUTER 5'], ['COMPUTER 6', 'COMPUTER 7']]);
    await fitsPage(page, 'four pairs');
    for (const [i, t] of [[2, 0], [3, 0], [5, 4], [6, 4], [7, 4]]) await seats.side(i, t);
    assert.deepEqual(await seats.sides(), [['YOU', 'COMPUTER 1', 'COMPUTER 2', 'COMPUTER 3'], ['COMPUTER 4', 'COMPUTER 5', 'COMPUTER 6', 'COMPUTER 7']]);
    await fitsPage(page, 'four against four');
    await page.locator('#btnStart').tap();
    await page.waitForFunction(() => endfall.G.units.length > 0);
    const eight = await page.evaluate(() => [endfall.G.teams, endfall.engine.MW, endfall.G.me, endfall.engine.foes(), [0, 1, 2, 3, 4, 5, 6, 7].map(t => endfall.G.bldgs.filter(b => b.team === t && b.d.hq).length)]);
    assert.deepEqual(eight, [[0, 0, 0, 0, 1, 1, 1, 1], 128, 0, [4, 5, 6, 7], [1, 1, 1, 1, 1, 1, 1, 1]], 'four against four, a base each, on 128x128');
    await page.evaluate(() => endfall.skip(20));
    assert.ok(await page.evaluate(() => [1, 2, 3, 4, 5, 6, 7].every(t => endfall.G.stats[t].built > 0)), 'seven AIs at work');
  } finally { await ctx.close(); }
});

test('single player: the board and an open sheet fit every phone (667x375, 844x390, 412x915), eight seats included', async () => {
  const setups = { '1v1': saved(0, 1), '4v4': saved(0, 0, 0, 0, 1, 1, 1, 1), '2v2v2v2': saved(0, 0, 1, 1, 2, 2, 3, 3), ffa8: saved(0, 1, 2, 3, 4, 5, 6, 7), 'spread': saved(0, null, 1, null, 2, null, null, 1) };
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
        await board(page).open(rows.findLastIndex(Boolean)); await page.locator('#soloSheet [data-k="diff:2"]').tap();
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
    assert.deepEqual(await board(page).sides(), [['YOU'], ['COMPUTER 1']], 'a saved setup that is not one: you and an AI');
    const stored = () => page.evaluate(() => localStorage.getItem('endfall.seats'));
    await board(page).add(); const before = await stored();
    // A double click on a token opens its sheet and changes nothing (its second click lands on a chip).
    const tok = await page.locator('#soloBoard [data-k="tok1"]').boundingBox();
    await page.mouse.dblclick(tok.x + tok.width / 2, tok.y + tok.height / 2);
    assert.ok(await page.locator('#soloSheet').evaluate(d => d.open), 'open');
    assert.equal(await stored(), before, 'nothing changed');
    // The arrow keys: along RACE, each step a choice.
    assert.equal(await page.evaluate(() => document.activeElement.dataset.k), 'race:humans');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.k), 'race:vael');
    assert.match(await page.locator('#soloBoard [data-k="tok1"]').getAttribute('aria-label'), /^COMPUTER 1 EXPEDITION,/);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await stored(), before, 'and back');
    assert.deepEqual(await page.$$eval('#soloSheet [role="radiogroup"][aria-label="Side"] [role="radio"]', bs => bs.map(b => b.textContent)), ['SIDE 1', 'SIDE 2', 'SIDE 3'], 'three players: up to three sides');
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
    assert.match(await p2.locator('#soloBoard [data-k="tok1"]').getAttribute('aria-label'), /EXPEDITION/);
  } finally { await phone.close(); }
});

test('single player: the record counts a game at its enemies\' level (a Brutal ally against an Easy enemy is an Easy game)', async () => {
  const ctx = await browserContext(DESKTOP), page = await ctx.newPage();
  try {
    await page.goto(`${baseUrl()}?seed=4242`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
    await page.locator('#btnSolo').click();
    const seats = board(page);
    await seats.add(); await seats.side(2, 0); await seats.diff(2, 3); // (AI 2 on your side, Brutal; AI 1 the enemy, Easy)
    assert.deepEqual(await seats.sides(), [['YOU', 'COMPUTER 2'], ['COMPUTER 1']]);
    await page.locator('#btnStart').click();
    await page.waitForFunction(() => endfall.G.units.length > 0);
    assert.deepEqual(await page.evaluate(() => [endfall.G.diff, endfall.engine.diffOf(1), endfall.engine.diffOf(2)]), [0, 3, 0], 'the game\'s level Easy, the ally Brutal');
    await page.evaluate(() => { document.getElementById('btnPause').click(); });
    await page.locator('#btnQuit').click(); await page.locator('#btnSoloBack').click();
    const r = await storedRecord(page);
    assert.deepEqual(Object.values(r), [[0, 1]], 'one game lost');
    assert.ok(Object.keys(r).every(k => k.endsWith(':0')), `counted at Easy: ${JSON.stringify(r)}`);
  } finally { await ctx.close(); }
});

test('single player: every split of five to eight, over any spots, fits 667x375, 844x390 and 412x915: no scrolling, no word cut', async () => {
  const parts = (n, max = n) => (n === 0 ? [[]] : Array.from({ length: Math.min(n, max) }, (_, j) => Math.min(n, max) - j).flatMap(k => parts(n - k, k).map(p => [k, ...p])));
  const splits = [5, 6, 7, 8].flatMap(n => Array.from({ length: n - 1 }, (_, m) => m + 1).flatMap(mine => parts(n - mine).map(p => [mine, ...p])));
  // (the players spread over the spots, an empty one between where there is room, the sides taken in turn)
  const rowsOf = (s, k) => {
    const teams = s.flatMap((c, t) => Array.from({ length: c }, () => t)), r = Array(8).fill(null);
    let gaps = 8 - teams.length, at = 0;
    teams.forEach((team, i) => { r[at++] = i ? { race: 'vael', team, diff: 2 } : { race: 'humans', team }; if (gaps && (k + i) % 2) { at++; gaps--; } });
    return r;
  };
  assert.equal(splits.length, 102);
  for (const [width, height] of [[667, 375], [844, 390], [412, 915]]) {
    const ctx = await browserContext({ ...PHONE, viewport: { width, height } }), page = await ctx.newPage(); await cutCheck(page);
    try {
      await page.goto(baseUrl(), { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
      const bad = [];
      for (const [k, s] of splits.entries()) {
        await page.evaluate((r) => localStorage.setItem('endfall.seats', JSON.stringify(r)), rowsOf(s, k));
        await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => !!window.endfall);
        await page.evaluate(() => document.getElementById('btnSolo').click());
        const r = await page.evaluate(() => {
          const c = document.querySelector('#start .card.menu');
          return { over: c.scrollHeight - c.clientHeight, overW: c.scrollWidth - c.clientWidth, cut: cutWords(), spots: document.querySelectorAll('#soloBoard > *').length, players: document.querySelectorAll('#soloBoard .tok').length };
        });
        if (r.over > 1 || r.overW > 1 || r.cut.length || r.spots !== 8 || r.players !== s.reduce((a, b) => a + b)) bad.push(`${s.join('v')}: ${JSON.stringify(r)}`);
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
    const seats = board(page); await seats.diff(1, 2); await seats.add(); await seats.side(2, 0); await seats.add(); await seats.side(3, 1); // (you and an AI against two, all Hard)
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
    const seats = board(page); await seats.add(); await seats.side(2, 0); await seats.add(); await seats.side(3, 1); // (you and an AI against two)
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
    assert.ok(near(seen.hqPixel, [16, 8, 0].map(b => SEAT_COLORS[2] >> b & 255)), `the ally's Core on the minimap in its spot's colour (COMPUTER 2's teal, though it plays seat 1), clear of fog: ${seen.hqPixel}`);
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
    await d.pressCard('Build'); await d.pressCard('Cottage');
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
    await until(d, async () => (await d.state()).bldgs.some(b => b.team === 0 && b.type === 'depot' && b.tx === spot.tx && b.ty === spot.ty), { seconds: 5, step: 0.5, what: 'the Cottage where the finger lifted' });
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('an enemy Marine is seen and picked however long it stands still (nothing hides since the re-theme)', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    // (set-up: an enemy Marine out on the field, held, and our Balloon watching it from out of its reach)
    const at = await d.eval(() => { const b = endfall.G.bldgs.find(b => b.team === 0 && b.d.hq); const dx = b.x < 1000 ? 1 : -1; return { x: b.x + dx * 640, y: b.y, dx }; });
    const marine = await d.eval(([x, y]) => endfall.engine.debugSpawn(1, 'umbra', x, y), [at.x, at.y]);
    const spy = await d.eval(([x, y]) => endfall.engine.debugSpawn(0, 'observer', x, y), [at.x - at.dx * 300, at.y]);
    await d.eval((ids) => ids.forEach(id => endfall.engine.holdUnit(endfall.G.units.find(u => u.id === id))), [spy, marine]);
    const seen = () => d.eval((id) => endfall.engine.visibleEnt(endfall.G.units.find(u => u.id === id)), marine);
    await d.skip(5);
    assert.equal(await seen(), true, 'still seen after standing still for 5 s');
    const u = await d.eval((id) => { const u = endfall.G.units.find(u => u.id === id); return { x: u.x, y: u.y }; }, marine);
    await d.centerOn(u.x, u.y);
    await d.clickEntity(marine);
    assert.ok((await d.selection()).some(e => e.id === marine), 'a click picks it');
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
    await d.pressCard('Villager');
    assert.ok(await d.page.evaluate(() => window.__refused), 'the button shakes');
    assert.deepEqual(await d.toasts(), [], 'no toast');
    assert.equal((await d.state()).bldgs.find(b => b.id === core.id).queue.length, 0, 'nothing queued');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('the end card keeps to the result on a phone: DEFEAT, its line, the map\'s, NEW GAME and REMATCH; no stats, no chart', async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    await d.skip(20);
    await d.eval(() => endfall.engine.concede()); // (set-up: the game ends; the end card is what is tested)
    await d.page.locator('#end').waitFor({ state: 'visible' });
    assert.equal(await d.page.locator('#result').textContent(), 'DEFEAT');
    assert.match(await d.page.locator('#endSub').textContent(), /^You conceded after \d\d:\d\d\.$/);
    assert.ok((await d.page.locator('#endMap').textContent()).length > 10, 'the map\'s line');
    const text = await d.page.locator('#end .card').innerText();
    assert.doesNotMatch(text, /trained|lost|killed|razed|losses|army/i, text);
    assert.equal(await d.page.locator('#end svg').count(), 0, 'no chart');
    assert.deepEqual(await d.page.locator('#end button:visible').allTextContents(), ['NEW GAME', 'REMATCH']);
    const box = await d.page.locator('#end .card').boundingBox(), v = d.page.viewportSize();
    assert.ok(box.y >= 0 && box.y + box.height <= v.height, `the card fits the screen: ${JSON.stringify(box)} in ${JSON.stringify(v)}`);
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('desktop: Shift+click on a unit queues five', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    await d.grant(2000, 0);
    const core = coreOf(await d.state());
    await d.clickEntity(core.id);
    await d.page.locator('#cmd button', { hasText: 'Villager' }).click({ modifiers: ['Shift'] });
    assert.equal((await d.state()).bldgs.find(b => b.id === core.id).queue.length, 5, 'five Villagers queued');
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
      if (!await page.evaluate(() => endfall.status().pageFullscreen)) {
        // No full screen for the page: on iPad and iPhone the button says how to get it (the Home Screen card); a
        // browser with no full-screen API and no Home Screen to add to (WebKit's phone profile here) has no button.
        if (!await page.locator('#cornerFull').isVisible()) { assert.equal(await page.evaluate(() => endfall.status().fullscreenEnabled), false, 'no button only where there is no full screen at all'); continue; }
        await (device.hasTouch ? page.locator('#cornerFull').tap() : page.locator('#cornerFull').click());
        assert.ok(await page.locator('#homeTip').isVisible(), 'the Add to Home Screen card where the page cannot go full screen');
        continue;
      }
      // Full screen is stood in for (a headless browser's real one resizes the page under the test).
      await page.evaluate(() => {
        Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => (window.fs ? document.documentElement : null) });
        document.documentElement.requestFullscreen = async () => { window.fs = true; window.went = true; document.dispatchEvent(new Event('fullscreenchange')); };
        document.exitFullscreen = async () => { window.fs = false; window.left = true; document.dispatchEvent(new Event('fullscreenchange')); };
      });
      const btn = page.locator('#cornerFull'), tap = () => (device.hasTouch ? btn.tap() : btn.click());
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

test('a game\'s sound and full-screen buttons, for real: sound is on after START, goes off and on; START goes full screen on a touch screen, not with a mouse; the button goes out and back in where the browser has it', { engines: true }, async () => {
  for (const device of [DESKTOP, PHONE]) {
    // (the asks for full screen counted, the browser's own still answering them)
    const count = () => { for (const k of ['requestFullscreen', 'webkitRequestFullscreen']) { const f = Element.prototype[k]; if (f) Element.prototype[k] = function (...a) { window.fsAsked = (window.fsAsked || 0) + 1; return f.apply(this, a); }; } };
    const d = await newGame(device, 1, 4242, { ai: false, init: count });
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
      if ((await status()).pageFullscreen) { // (the game's word on whether the page goes full screen: not iPhone or iPad)
        if (device.hasTouch) await full(true); // (START asked for it; the change can land a few frames later)
        else { // (a mouse: room enough, START asks for none; the button goes in)
          assert.equal(await d.eval(() => window.fsAsked || 0), 0, 'START asks for no full screen with a mouse');
          assert.equal((await status()).fullscreen, false);
          await press('#btnFull'); await full(true);
        }
        await press('#btnFull'); await full(false);
        await press('#btnFull'); await full(true);
      } else {
        assert.equal((await status()).fullscreen, false, 'never full screen where the page does not go there (iPhone, iPad)');
        if (await d.page.locator('#btnFull').isVisible()) { // (iPad, iPhone: the Home Screen card; no full-screen API at all and no Home Screen to add to: no button)
          await press('#btnFull');
          assert.ok(await d.page.locator('#homeTip').isVisible(), 'the button: the Add to Home Screen card');
          await press('#btnHomeTipOk');
        } else assert.equal((await status()).fullscreenEnabled, false, 'no button only where there is no full screen at all');
      }
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
    await d.pressCard('Build'); await d.pressCard('Cottage');
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
    await until(d, async () => (await d.state()).bldgs.some(b => b.team === 0 && b.type === 'depot' && b.tx === spot.tx && b.ty === spot.ty), { seconds: 5, step: 0.5, what: 'the Cottage where the finger lifted' });
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('the menu fits a small phone on every page (the first with its stamp and PLAY OFFLINE\'s answer), each heading in view', async () => {
  const ctx = await browserContext({ ...PHONE, viewport: { width: 667, height: 375 } }), page = await ctx.newPage();
  try {
    await page.goto(baseUrl(), { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall);
    await page.evaluate(() => { document.getElementById('homeOfflineMsg').textContent = 'Ready to play offline: everything is saved on this device ✓'; });
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

test('the first page: the name in title case over the shore, whose tide lines keep below the content (the stamp and PLAY OFFLINE\'s answer too), go with the page and stand still under reduced motion', async () => {
  for (const [w, h, reducedMotion, tip] of [[844, 390, 'no-preference', false], [667, 375, 'no-preference', false], [412, 915, 'reduce', false], [932, 430, 'no-preference', true], [568, 320, 'no-preference', true]]) {
    const ctx = await browserContext({ ...PHONE, viewport: { width: w, height: h }, reducedMotion }), page = await ctx.newPage();
    try {
      await page.goto(baseUrl(), { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.endfall);
      if (tip) await page.evaluate(() => { document.getElementById('homeOfflineMsg').textContent = 'Ready to play offline: everything is saved on this device ✓'; });
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
      assert.ok(await shore.isHidden() && await page.locator('#menuAbout').isVisible(), 'About: the first page\'s shore goes with it');
      assert.ok(await page.locator('#menuAbout .shore').isVisible(), 'About: a shore of its own (as Single player and Multiplayer)');
      assert.equal(await page.evaluate(() => document.getAnimations().filter(a => a.animationName === 'ebb' && a.effect.target.closest('#menuHome')).length), 0, 'the first page\'s lines stop with the page');
    } finally { await ctx.close(); }
  }
  // In a game (the menu hidden), nothing of it runs either.
  const d = await newGame(PHONE, 0, 4242, { ai: false });
  try {
    assert.ok(await d.page.locator('#start').isHidden() && await d.page.locator('#menuHome .shore').isHidden());
    assert.equal(await d.eval(() => document.getAnimations().filter(a => a.animationName === 'ebb').length), 0, 'no drift in a game');
  } finally { await d.close(); }
});


test('desktop: the HUD floats over the map: no band across the bottom, the console between the minimap and the card', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    const h = (await d.state()).units.find(u => u.team === 0 && u.type === 'harvester');
    await d.clickEntity(h.id);
    await d.hudText('#selName', /^Villager$/);
    const vp = d.page.viewportSize();
    const [stage, mm, info, cmd] = await Promise.all(['#stage', '#minimap', '#info', '#cmd'].map(q => d.page.locator(q).boundingBox()));
    assert.ok(stage.y + stage.height >= vp.height - 12, `the map reaches the bottom of the window: ${JSON.stringify(stage)}`);
    for (const [n, b] of [['minimap', mm], ['console', info], ['card', cmd]]) assert.ok(b.y >= stage.y && b.y + b.height <= stage.y + stage.height, `the ${n} sits over the map`);
    assert.ok(mm.x < info.x && info.x + info.width < cmd.x, 'minimap left, console in the middle, card right');
    const mid = (mm.x + mm.width + cmd.x) / 2;
    assert.ok(Math.abs(info.x + info.width / 2 - mid) < 4, 'the console is centred between the minimap and the card');
    // The hint and the toasts stay clear of the minimap.
    await d.grant(500, 0);
    await d.pressCard('Build'); await d.pressCard('Cottage');
    const hint = await d.page.locator('#hint').boundingBox();
    assert.ok(hint, 'placing a building shows the hint');
    assert.ok(hint.y + hint.height <= mm.y + 1, 'the hint is above the minimap');
    await d.key('Escape');
    await d.pressCard('Build'); await d.pressCard('Cottage'); // (a Cottage on the Core: a refused spot is a toast)
    const core = coreOf(await d.state());
    await d.clickWorld(core.x, core.y);
    await d.page.locator('#msg .toast', { hasText: /Cannot build there/ }).waitFor({ timeout: 5000 });
    await d.key('Escape');
    const toast = await d.page.locator('#msg .toast', { hasText: /Cannot build there/ }).boundingBox();
    assert.ok(toast.y + toast.height <= mm.y + 1, 'toasts are above the minimap');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('every unit and building is drawn twice: its art, then its team mask in its seat\'s colour', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    const core = coreOf(await d.state());
    const ids = await d.eval(([x, y]) => [endfall.engine.debugSpawn(0, 'knight', x, y), endfall.engine.debugSpawn(1, 'scythe', x + 40, y)], [core.x - 60, core.y + 90]);
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

// ---- Controls (src/client/controls.js, the OPTIONS card: options.js): CLASSIC or WASD, the middle button's pan ----

/** Hold `key` for `ms`, and on until a frame has moved the camera (a software-rendered page draws few frames a second;
 *  3 s at most), and return how far the camera went (world px). */
async function holdKey(d, key, ms = 300) {
  const at = () => d.eval(() => ({ x: endfall.cam.x, y: endfall.cam.y }));
  const a = await at();
  await d.page.keyboard.down(key); await d.page.waitForTimeout(ms);
  await d.page.waitForFunction((a) => endfall.cam.x !== a.x || endfall.cam.y !== a.y, a, { timeout: 3000 }).catch(() => {});
  await d.page.keyboard.up(key);
  const b = await at();
  return { dx: b.x - a.x, dy: b.y - a.y };
}
/** The command card's buttons as [slot, key shown, label] (gaps keep their slots). */
const cardKeys = (d) => d.page.$$eval('#cmd > *', cs => cs.map((c, i) => c.matches('button') && [i, c.querySelector('.k')?.textContent ?? '', c.querySelector('.l').textContent]).filter(Boolean));
/** Open OPTIONS from the pause card (P), choose `scheme` ('classic' or 'wasd'), BACK to the pause card, BACK TO GAME. */
async function pickControls(d, scheme) {
  await d.key('p');
  await d.page.locator('#btnPauseOptions').click();
  await d.page.locator(`#options [data-k="controls:${scheme}"]`).click();
  await d.page.locator('#btnOptionsClose').click();
  await d.page.locator('#btnResume').click();
}
/** A Guard of ours beside the Core, selected with a click. Returns its id. */
async function selectedTrooper(d) {
  const core = coreOf(await d.state());
  const id = await d.eval(([x, y]) => endfall.engine.debugSpawn(0, 'trooper', x, y), [core.x + 120, core.y + 70]);
  await d.eval(() => endfall.engine.debugResearch(0, 'entrenching')); // (Shield Drill: its Brace on the card)
  await d.skip(0.1);
  await d.clickEntity(id);
  assert.deepEqual((await d.selection()).map(e => e.id), [id], 'the Guard is selected');
  return id;
}
/** Centre the camera on the map's middle (room to move every way). */
const toMiddle = (d) => d.eval(() => endfall.centerOn(endfall.engine.WW / 2, endfall.engine.WH / 2));

test('desktop, CLASSIC controls (the default): with a unit selected A arms attack-move, the arrow keys move the map and W does not', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    await selectedTrooper(d);
    assert.deepEqual((await cardKeys(d)).map(([, k, l]) => `${l} ${k}`), ['Attack A', 'Hold H', 'Brace D', 'Deselect Esc'], 'each button its own letter');
    await d.key('a');
    assert.equal(await d.eval(() => endfall.ui.mode), 'attack', 'A arms attack-move');
    await d.key('Escape');
    await toMiddle(d);
    const right = await holdKey(d, 'ArrowRight'), up = await holdKey(d, 'ArrowUp');
    assert.ok(right.dx > 5 && Math.abs(right.dy) < 1 && up.dy < -5, `the arrows move the map: ${JSON.stringify([right, up])}`);
    assert.deepEqual(await holdKey(d, 'w'), { dx: 0, dy: 0 }, 'W leaves the map be while a unit is selected');
    assert.equal(await d.eval(() => localStorage.getItem('endfall.controls')), null, 'nothing chosen, nothing stored');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('desktop, WASD controls: chosen in OPTIONS from the pause card (still paused), W A S D move the map whatever is selected and give no order; the buttons show their grid keys, which train and build', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  const { GRID } = await import('../../src/client/controls.js');
  try {
    const { page } = d;
    await d.grant(2000, 0);
    await buildAndFinish(d, 'c', 'barracks', 1); // (the Build list's Advanced page opens with a Barracks; built while CLASSIC)
    await d.key('p');
    assert.ok(await page.locator('#btnPauseOptions').isVisible(), 'OPTIONS on the pause card');
    assert.ok(await page.$eval('#pause .card', c => c.scrollHeight <= c.clientHeight + 1), 'the pause card fits with OPTIONS');
    await page.locator('#btnPauseOptions').click();
    const opts = page.locator('#options');
    assert.ok(await opts.isVisible(), 'OPTIONS opens');
    assert.ok(await page.locator('#pause').isVisible(), 'over the pause card');
    assert.ok(await page.locator('#cornerFull').isVisible() && await page.locator('#cornerSound').isHidden(), 'the corner keeps the pause card\'s rule: full screen, no sound button');
    assert.equal(await opts.locator('[aria-checked="true"]').textContent(), 'CLASSIC', 'CLASSIC by default');
    assert.match(await opts.locator('.setting:has([data-k^="controls:"]) .line').textContent(), /^Arrows/);
    await opts.locator('[data-k="controls:wasd"]').click();
    assert.equal(await opts.locator('[aria-checked="true"]').textContent(), 'WASD');
    assert.match(await opts.locator('.setting:has([data-k^="controls:"]) .line').textContent(), /^WASD moves the map/);
    assert.ok(await page.$eval('#options .card', c => c.scrollHeight <= c.clientHeight + 1), 'the OPTIONS card fits');
    const t0 = await d.eval(() => endfall.G.time);
    await page.locator('#btnOptionsClose').click();
    assert.ok(await opts.isHidden() && await page.locator('#pause').isVisible(), 'BACK: the pause card again');
    assert.equal(await d.eval(() => endfall.G.time), t0, 'still paused');
    await page.locator('#btnResume').click();
    assert.equal(await d.eval(() => localStorage.getItem('endfall.controls')), 'wasd', 'remembered on the device');

    // A unit selected and on the move: W A S D move the map, nothing else (A arms no attack, S stops nothing).
    const id = await selectedTrooper(d);
    const shown = await cardKeys(d);
    assert.deepEqual(shown.map(([, k, l]) => `${l} ${k}`), ['Attack E', 'Hold R', 'Brace T', 'Deselect H'], 'each button its slot\'s key');
    for (const [slot, k] of shown) assert.equal(k, GRID[slot]);
    const W = await d.eval(() => [endfall.engine.WW, endfall.engine.WH]);
    await d.rightClickWorld(W[0] / 2, W[1] / 2); // (the camera is centred there too)
    assert.equal((await d.state()).units.find(u => u.id === id).task, 'move');
    const moves = {};
    for (const k of ['w', 'a', 's', 'd']) moves[k] = await holdKey(d, k);
    assert.ok(moves.w.dy < -5 && moves.s.dy > 5 && moves.a.dx < -5 && moves.d.dx > 5, `W A S D move the map: ${JSON.stringify(moves)}`);
    assert.equal(await d.eval(() => endfall.ui.mode), null, 'no order armed');
    assert.deepEqual((await d.selection()).map(e => e.id), [id], 'the Guard still selected');
    assert.equal((await d.state()).units.find(u => u.id === id).task, 'move', 'S did not stop it');
    await d.key('e');
    assert.equal(await d.eval(() => endfall.ui.mode), 'attack', 'E (Attack\'s slot) arms attack-move');
    assert.equal(await page.locator('#cmd [data-id="esc"] .k').textContent(), 'E', 'its Cancel keeps the key');
    await d.key('e');
    assert.equal(await d.eval(() => endfall.ui.mode), null, 'and E again cancels it');

    // A grid key trains: the Core's first button (Villager) is E.
    await d.grant(2000, 0);
    const core = coreOf(await d.state());
    await d.clickEntity(core.id);
    assert.deepEqual((await cardKeys(d))[0].slice(1), ['E', 'Villager']);
    await d.key('e');
    assert.equal((await d.state()).bldgs.find(b => b.id === core.id).queue[0], 'harvester', 'E trains a Villager');

    // The Build menu: E (Build), then the page's keys by slot; R builds a Cottage (the Barracks first, on E).
    const h = mine(await d.state(), 'harvester')[0], spot = await d.findSpot('depot', { tx: core.tx + 1, ty: core.ty + 1 });
    for (let i = 0; i < 16 && !(await d.selection()).some(e => e.id === h.id); i++) { if (i) await page.waitForTimeout(150 + 50 * i); await d.clickEntity(h.id); } // (a miner moves: again until it is picked)
    await d.key('e');
    await page.locator('#cmd [data-id="b_depot"]').waitFor({ timeout: 5000 }); // (drawn on the next HUD tick)
    const page1 = await cardKeys(d);
    assert.deepEqual(page1.map(([, k, l]) => `${l} ${k}`).slice(0, 2), ['Barracks E', 'Cottage R'], 'the Build page\'s keys');
    for (const [slot, k] of page1) assert.equal(k, GRID[slot]);
    await d.key('g'); // Advanced (slot 4)
    await page.locator('#cmd [data-id="build1"]').waitFor({ timeout: 5000 });
    for (const [slot, k] of await cardKeys(d)) assert.equal(k, GRID[slot], 'the Advanced page\'s keys');
    await d.key('Escape'); await d.key('Escape');
    await d.buildWithUI(['e', 'r'], 'depot', spot.tx, spot.ty, h.id);
    assert.ok((await d.state()).bldgs.some(b => b.team === 0 && b.type === 'depot' && b.tx === spot.tx && b.ty === spot.ty), `E then R placed a Cottage (toasts: ${(await d.toasts()).join(' | ')})`);
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('desktop, as the Expedition: the Recruiting post trains a Bruiser once a Lab stands (B, or its slot\'s key in WASD), the Factory keeps the Rover\'s slot, the Portal trains Marines', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false, race: 'vael' });
  const { GRID } = await import('../../src/client/controls.js');
  const V = { hq: 'conflux', worker: 'lumen' };
  try {
    await d.grant(4000, 3000);
    await buildAndFinish(d, 's', 'spire', 0, V);
    const post = await buildAndFinish(d, 'i', 'siphon', 1, V);
    await d.clickEntity(post.id);
    await d.readyCard('Sellsword');
    assert.deepEqual((await cardKeys(d)).map(([at, , l]) => `${l} ${at}`), ['Sellsword 0', 'Rally 2', 'Cancel 5'], 'the Recruiting post before a Lab: the Bruiser\'s slot empty, Rally and Cancel in place');
    const kiln = await buildAndFinish(d, 'c', 'kiln', 2, V);
    await d.clickEntity(kiln.id);
    await d.readyCard('Buggy');
    assert.deepEqual((await cardKeys(d)).map(([at, , l]) => `${l} ${at}`), ['Buggy 0', 'Drone 2', 'Rally 3', 'Cancel 5'], 'the Factory before a Lab: the Rover\'s slot empty');
    await buildAndFinish(d, 'g', 'loom', 3, V);
    await d.clickEntity(post.id);
    await d.readyCard('Bruiser');
    assert.deepEqual((await cardKeys(d)).map(([at, , l]) => `${l} ${at}`), ['Sellsword 0', 'Bruiser 1', 'Rally 2', 'Cancel 5'], 'with a Lab: the Bruiser in its slot');
    const queue = async (b) => (await d.state()).bldgs.find(x => x.id === b.id).queue;
    await d.key('b');
    assert.deepEqual(await queue(post), ['bruiser'], `B trains a Bruiser (toasts: ${(await d.toasts()).join(' | ')})`);
    // In WASD its key is its slot's.
    await pickControls(d, 'wasd');
    await d.clickEntity(post.id);
    const [at, key] = (await cardKeys(d)).find(([, , l]) => l === 'Bruiser');
    assert.equal(key, GRID[at], 'its grid key shown');
    await d.key(key.toLowerCase());
    assert.deepEqual(await queue(post), ['bruiser', 'bruiser'], `${key} trains another`);
    await pickControls(d, 'classic');
    const portal = await buildAndFinish(d, 'd', 'eclipse', 0, V); // (B then D: the Advanced page's key)
    await d.clickEntity(portal.id);
    await d.readyCard('Marine');
    assert.deepEqual((await cardKeys(d)).map(([at, , l]) => `${l} ${at}`), ['Marine 0', 'Rally 1', 'Cancel 5'], 'the Portal: Marines');
    await d.key('u');
    assert.deepEqual(await queue(portal), ['umbra'], `U trains a Marine (toasts: ${(await d.toasts()).join(' | ')})`);
    await until(d, async () => mine(await d.state(), 'bruiser').length > 0, { seconds: 60, step: 0.5, what: 'the Bruiser' });
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('desktop: the Blacksmith trains a Ballista once a Forge stands (B, or its slot\'s key in WASD); it shoots flyers down and hits the ground too', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  const { GRID } = await import('../../src/client/controls.js');
  try {
    await d.grant(3000, 2000);
    await buildAndFinish(d, 'w', 'depot', 0);
    await buildAndFinish(d, 'c', 'barracks', 1);
    const factory = await buildAndFinish(d, 's', 'factory', 2);
    await d.clickEntity(factory.id);
    await d.readyCard('Balloon');
    assert.deepEqual((await cardKeys(d)).map(([at, , l]) => `${l} ${at}`), ['Balloon 2', 'Rally 3', 'Cancel 5'], 'before a Forge stands: the Balloon only, the machines\' slots empty, Rally and Cancel in place');
    await buildAndFinish(d, 'k', 'forge', 3);
    await d.clickEntity(factory.id);
    await d.readyCard('Ballista');
    assert.deepEqual((await cardKeys(d)).map(([, , l]) => l), ['Ballista', 'Trebuchet', 'Balloon', 'Rally', 'Cancel'], 'the Ballista, the Trebuchet and the Balloon, Rally after them, the queue\'s Cancel in its place');
    const queue = async () => (await d.state()).bldgs.find(b => b.id === factory.id).queue;
    await d.key('b');
    assert.deepEqual(await queue(), ['bastion'], `B trains a Ballista (toasts: ${(await d.toasts()).join(' | ')})`);
    await pickControls(d, 'wasd');
    await d.clickEntity(factory.id);
    const [at, key] = (await cardKeys(d)).find(([, , l]) => l === 'Ballista');
    assert.equal(key, GRID[at], 'its grid key shown');
    await d.key(key.toLowerCase());
    assert.deepEqual(await queue(), ['bastion', 'bastion'], `${key} trains another`);
    await until(d, async () => mine(await d.state(), 'bastion').length > 0, { seconds: 60, step: 0.5, what: 'the Ballista' });
    // An enemy Drone held in its reach and out of the Drone's own: it comes down. Then an enemy Guard, held in its
    // reach: it is hit too (its ground attack). (Each put where the Ballista stands then, held as well.)
    const near = (k, dx, dy) => d.eval(([k, dx, dy]) => {
      const b = endfall.G.units.find(o => o.team === 0 && o.type === 'bastion'); endfall.engine.holdUnit(b);
      const id = endfall.engine.debugSpawn(1, k, b.x + dx, b.y + dy); endfall.engine.holdUnit(endfall.G.units.find(u => u.id === id)); return id;
    }, [k, dx, dy]);
    const drone = await near('shrike', 190, 0);
    await until(d, async () => !(await d.state()).units.some(o => o.id === drone), { seconds: 20, step: 0.5, what: 'the Drone shot down' });
    const trooper = await near('trooper', 0, 160);
    await until(d, () => d.eval((id) => { const o = endfall.G.units.find(u => u.id === id); return !o || o.hp < o.maxhp; }, trooper), { seconds: 20, step: 0.5, what: 'the Guard hit' });
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('desktop, WASD controls: a held key is let go when the page loses the keyboard or its keyup has another letter; Esc closes OPTIONS, then the pause card; Shift+key trains five; Ctrl+number keeps a group; a middle drag let go off the map, or under a card, ends; Tab skips what is under OPTIONS', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false, init: () => localStorage.setItem('endfall.controls', 'wasd') });
  try {
    const { page } = d;
    const camX = () => d.eval(() => endfall.cam.x);
    const still = async (what) => { const a = await camX(); await page.waitForTimeout(600); assert.equal(await camX(), a, what); };
    // A held D, then the window loses the keyboard (no keyup comes): the camera stops.
    await toMiddle(d);
    await page.keyboard.down('d');
    await page.waitForFunction((x) => endfall.cam.x > x, await camX(), { timeout: 5000 });
    await d.eval(() => window.dispatchEvent(new Event('blur')));
    await still('the camera stops when the window loses the keyboard');
    await page.keyboard.up('d');
    // Held D let go as another letter (Option+D on a Mac is '∂'): the same key (KeyD), so the camera stops.
    await page.keyboard.down('d');
    await page.waitForFunction((x) => endfall.cam.x > x, await camX(), { timeout: 5000 });
    await d.eval(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: '∂', code: 'KeyD', altKey: true })));
    await still('a keyup of another letter, the same key, lets it go');
    await page.keyboard.up('d');

    // OPTIONS over the pause card: Tab never reaches what is under it (inert); Esc closes it, then the card.
    await d.key('p'); await page.locator('#btnPauseOptions').click();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      const at = await page.evaluate(() => { const e = document.activeElement; return e?.closest('#app, #pause, #help, #end') ? e.id || e.tagName : ''; });
      assert.equal(at, '', `Tab ${i + 1}: nothing under OPTIONS takes the focus`);
    }
    await d.key('Escape');
    assert.ok(await page.locator('#options').isHidden() && await page.locator('#pause').isVisible(), 'Esc: OPTIONS goes, the pause card stays');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'btnPauseOptions', 'the focus back on OPTIONS');
    await d.key('Escape');
    assert.ok(await page.locator('#pause').isHidden(), 'Esc again: back to the game');

    // Shift with a grid key trains five; Ctrl+1 keeps a group, 1 brings it back.
    await d.grant(5000, 0);
    const core = coreOf(await d.state());
    await d.clickEntity(core.id);
    await page.keyboard.press('Shift+E');
    assert.equal((await d.state()).bldgs.find(b => b.id === core.id).queue.length, 5, 'Shift+E: five Villagers');
    const id = await selectedTrooper(d);
    await page.keyboard.press('Control+1'); await d.key('Escape');
    assert.deepEqual(await d.selection(), [], 'let go');
    await d.key('1');
    assert.deepEqual((await d.selection()).map(e => e.id), [id], '1: the group again');

    // A middle drag let go over the minimap: it ends there (moving the mouse over the map after moves nothing).
    await toMiddle(d);
    const box = await page.locator('#game').boundingBox(), mm = await page.locator('#minimap').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3); await page.mouse.down({ button: 'middle' });
    await page.mouse.move(mm.x + mm.width / 2, mm.y + mm.height / 2, { steps: 5 }); await page.mouse.up({ button: 'middle' });
    const after = await d.eval(() => [endfall.cam.x, endfall.cam.y]);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 }); await page.waitForTimeout(200);
    assert.deepEqual(await d.eval(() => [endfall.cam.x, endfall.cam.y]), after, 'the drag is over');
    assert.deepEqual((await d.selection()).map(e => e.id), [id], 'and selected nothing');
    // A middle drag when a card comes up (P) ends there too: nothing moves under the pause card.
    await page.mouse.down({ button: 'middle' }); await d.key('p');
    const under = await d.eval(() => [endfall.cam.x, endfall.cam.y]);
    await page.mouse.move(box.x + 100, box.y + 100, { steps: 5 });
    assert.deepEqual(await d.eval(() => [endfall.cam.x, endfall.cam.y]), under, 'no pan under the pause card');
    await page.mouse.up({ button: 'middle' });
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('desktop, WASD stored: the lobby\'s name field and OPTIONS\' take W A S D as letters', async () => {
  const ctx = await browserContext(DESKTOP), page = await ctx.newPage();
  try {
    await ctx.addInitScript(() => localStorage.setItem('endfall.controls', 'wasd'));
    await page.goto(baseUrl(), { waitUntil: 'networkidle' });
    await page.locator('#btnOnline').click();
    await page.locator('#onlineName').fill('');
    await page.locator('#onlineName').pressSequentially('Wasd sad');
    assert.equal(await page.locator('#onlineName').inputValue(), 'Wasd sad');
    await page.locator('#btnOnlineBack').click();
    await page.locator('#btnOptions').click();
    const f = page.locator('#options input');
    assert.equal(await f.inputValue(), 'Wasd sad', 'the lobby\'s name, kept on the way out');
    await f.fill(''); await f.pressSequentially('Dew saw');
    assert.equal(await f.inputValue(), 'Dew saw');
  } finally { await ctx.close(); }
});

test('desktop, WASD stored, a game paused under OPTIONS: W A S D and the grid keys typed in its NAME are letters, never a pan or an order', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false, init: () => localStorage.setItem('endfall.controls', 'wasd') });
  try {
    const { page } = d;
    await toMiddle(d);
    const id = await selectedTrooper(d);
    const cam = () => d.eval(() => [endfall.cam.x, endfall.cam.y]), c0 = await cam(), task = (await d.state()).units.find(u => u.id === id).task;
    await d.key('p'); await page.locator('#btnPauseOptions').click();
    const f = page.locator('#options input');
    assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), 'INPUT', 'opening the card focuses no field');
    await f.click(); await f.fill('');
    await f.pressSequentially('Dew saw'); // (E: Attack's key in WASD)
    for (const k of ['d', 'w']) { await page.keyboard.down(k); await page.waitForTimeout(400); await page.keyboard.up(k); } // (held, as a pan would be)
    assert.equal(await f.inputValue(), 'Dew sawdw', 'typed as letters');
    assert.deepEqual(await cam(), c0, 'the camera stayed');
    assert.equal(await d.eval(() => endfall.ui.mode), null, 'no order armed');
    await page.locator('#btnOptionsClose').click(); await page.locator('#btnResume').click();
    await page.waitForTimeout(500);
    assert.deepEqual(await cam(), c0, 'nor did it move once the game went on (no key left held)');
    assert.deepEqual((await d.selection()).map(e => e.id), [id], 'the Guard still selected');
    assert.equal((await d.state()).units.find(u => u.id === id).task, task, 'and given no order');
    assert.equal(await d.eval(() => localStorage.getItem('endfall.name')), 'Dew sawdw', 'the name kept');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('desktop: OPTIONS on the menu\'s first page; the choice is remembered across a reload and shown there; How to play tells of both schemes', { engines: true }, async () => {
  const ctx = await browserContext(DESKTOP), page = await ctx.newPage();
  try {
    await page.goto(baseUrl(), { waitUntil: 'networkidle' });
    await page.locator('#btnOptions').click();
    assert.ok(await page.locator('#options').isVisible() && await page.locator('#cornerSound').isVisible(), 'OPTIONS over the menu, the corner whole');
    await page.locator('#options [data-k="controls:wasd"]').click();
    await page.locator('#btnOptionsClose').click();
    assert.ok(await page.locator('#options').isHidden() && await page.locator('#menuHome').isVisible(), 'BACK: the menu again');
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#btnOptions').click();
    assert.equal(await page.locator('#options [aria-checked="true"]').textContent(), 'WASD', 'remembered');
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('#options').isHidden(), 'Esc closes it');
    await page.locator('#btnHowTo').click();
    const help = await page.locator('#help').textContent();
    assert.match(help, /Classic:.*WASD:.*OPTIONS|OPTIONS.*Classic:.*WASD:/s);
    assert.match(help, /middle button/);
    // A small desktop window: the first page's row of buttons and the card still fit.
    await page.locator('#btnHelpClose').click();
    await page.setViewportSize({ width: 844, height: 390 });
    const row = await page.$eval('#btnOptions', b => { const r = b.getBoundingClientRect(); return [r.right <= innerWidth, r.bottom <= innerHeight]; });
    assert.deepEqual(row, [true, true], 'OPTIONS in view at 844x390');
    await page.locator('#btnOptions').click();
    assert.ok(await page.$eval('#options .card', c => c.scrollHeight <= c.clientHeight + 1 && c.getBoundingClientRect().bottom <= innerHeight), 'the OPTIONS card fits 844x390');
  } finally { await ctx.close(); }
});

test('desktop: the middle button dragged moves the map in both schemes, selecting nothing and ordering nothing', { engines: true }, async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    const { page } = d;
    let sx = -1, sy = -1; // (the mouse's way: the map's middle comes into view, no edge stops the camera)
    const drag = async () => {
      const box = await page.locator('#game').boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
      const c0 = await d.eval(() => ({ x: endfall.cam.x, y: endfall.cam.y }));
      await page.mouse.move(x, y); await page.mouse.down({ button: 'middle' });
      await page.mouse.move(x + 120 * sx, y + 80 * sy, { steps: 6 }); await page.mouse.up({ button: 'middle' });
      await page.waitForTimeout(80);
      const c1 = await d.eval(() => ({ x: endfall.cam.x, y: endfall.cam.y }));
      return { dx: c1.x - c0.x, dy: c1.y - c0.y };
    };
    for (const scheme of ['classic', 'wasd']) {
      if (scheme === 'wasd') await pickControls(d, 'wasd');
      const id = await selectedTrooper(d);
      const task = (await d.state()).units.find(u => u.id === id).task;
      const u = (await d.state()).units.find(u => u.id === id), W = await d.eval(() => [endfall.engine.WW, endfall.engine.WH]);
      sx = u.x < W[0] / 2 ? -1 : 1; sy = u.y < W[1] / 2 ? -1 : 1;
      await d.centerOn(u.x, u.y); // (the drag starts over the Guard and its base)
      const z = await d.eval(() => endfall.cam.zoom), moved = await drag();
      assert.ok(Math.abs(moved.dx + 120 * sx / z) < 2 && Math.abs(moved.dy + 80 * sy / z) < 2, `${scheme}: the map follows the drag: ${JSON.stringify(moved)}`);
      assert.deepEqual((await d.selection()).map(e => e.id), [id], `${scheme}: the selection stays`);
      assert.equal(await d.eval(() => endfall.ui.mode), null, `${scheme}: no order armed`);
      assert.equal((await d.state()).units.find(u => u.id === id).task, task, `${scheme}: no order given`);
      await d.key('Escape'); // nothing selected: a drag selects nothing either
      await d.centerOn(u.x, u.y); await drag();
      assert.deepEqual(await d.selection(), [], `${scheme}: a drag over the base selects nothing`);
    }
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: OPTIONS on the menu and the pause card, NAME only (no CONTROLS); the keyboard comes only with a tap on the field, whose type is 16 px; the page held still meanwhile does not fight it', async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    const { page } = d;
    assert.equal(await d.eval(() => matchMedia('(pointer: fine)').matches), false);
    assert.equal(await d.eval(() => document.getElementById('btnOptions').hidden), false, 'OPTIONS on the menu');
    await page.locator('#btnPause').tap();
    assert.ok(await page.locator('#pause').isVisible() && await page.locator('#btnPauseOptions').isVisible(), 'OPTIONS on the pause card');
    assert.ok(await page.$eval('#pause .card', c => c.scrollHeight <= c.clientHeight + 1 && c.getBoundingClientRect().bottom <= innerHeight), 'the pause card fits with it');
    await page.locator('#btnPauseOptions').tap();
    assert.deepEqual(await page.$$eval('#options .setting .lbl', ls => ls.map(l => l.textContent)), ['NAME'], 'NAME, no CONTROLS on a touch screen');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'btnOptionsClose', 'opened: BACK has the focus, not the field (no keyboard)');
    const f = page.locator('#options input');
    assert.equal(await f.evaluate(e => getComputedStyle(e).fontSize), '16px', 'no zoom on iOS');
    assert.equal(await f.getAttribute('maxlength'), '16');
    assert.ok(await page.$eval('#options .card', c => c.scrollHeight <= c.clientHeight + 1 && c.getBoundingClientRect().bottom <= innerHeight), 'the card fits');
    await f.tap();
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'INPUT', 'a tap: the field');
    // The keyboard scrolls the page to the field: the page's hold (screen.js `settle`) lets it be while the field has the
    // focus, and puts the page back once it goes.
    await page.evaluate(() => { const s = document.createElement('div'); s.id = 'tall'; s.style.cssText = 'position:absolute;top:0;left:0;height:3000px;width:1px'; document.documentElement.appendChild(s); scrollTo(0, 120); visualViewport.dispatchEvent(new Event('resize')); dispatchEvent(new Event('resize')); });
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => scrollY), 120, 'left where the keyboard put it');
    await f.fill('Pip');
    await f.press('Enter');
    assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), 'INPUT', 'Enter: the keyboard away');
    await page.waitForFunction(() => scrollY === 0, null, { timeout: 2000 });
    await page.evaluate(() => document.getElementById('tall').remove());
    assert.equal(await d.eval(() => localStorage.getItem('endfall.name')), 'Pip', 'kept');
    await page.locator('#btnOptionsClose').tap();
    assert.ok(await page.locator('#options').isHidden() && await page.locator('#pause').isVisible(), 'BACK: the pause card');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

for (const [label, device] of [['desktop', DESKTOP], ['phone', PHONE]]) {
  test(`${label}: the name typed in OPTIONS (from the menu) is the lobby's, and the lobby's is OPTIONS': one name`, async () => {
    const ctx = await browserContext(device), page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const press = (sel) => device.hasTouch ? page.locator(sel).tap() : page.locator(sel).click();
    try {
      await page.goto(baseUrl(), { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.endfall);
      await press('#btnOptions');
      const f = page.locator('#options input');
      assert.equal(await f.inputValue(), '', 'no name yet');
      assert.equal(await page.locator('#options .note, #options [role="alert"]').count(), 0, 'and no nagging for one here');
      await press('#options input'); await f.fill('  Rook  ');
      await press('#btnOptionsClose');
      assert.equal(await page.evaluate(() => localStorage.getItem('endfall.name')), 'Rook', 'kept, trimmed');
      await press('#btnOnline');
      assert.equal(await page.locator('#onlineName').inputValue(), 'Rook', 'the lobby shows it');
      assert.equal(await page.locator('#btnNewRoom').getAttribute('aria-disabled'), null, 'and NEW ROOM is ready');
      await press('#onlineName'); await page.locator('#onlineName').fill('Bishop');
      await press('#btnOnlineBack');
      await press('#btnOptions');
      assert.equal(await f.inputValue(), 'Bishop', 'OPTIONS shows the lobby\'s');
      // Emptied in OPTIONS: allowed there; the lobby has no name either and asks for one before NEW ROOM.
      await press('#options input'); await f.fill('');
      await page.keyboard.press('Escape');
      assert.ok(await page.locator('#options').isHidden(), 'Esc closes it');
      await press('#btnOnline');
      assert.equal(await page.locator('#onlineName').inputValue(), '');
      assert.equal(await page.locator('#btnNewRoom').getAttribute('aria-disabled'), 'true', 'NEW ROOM wants a name');
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}

test('phones: the first page\'s row (FIRST GAME, HOW TO PLAY, ABOUT, OPTIONS, PLAY OFFLINE) fits at 667x375, 844x390, 412x915 and 568x320: one line on its side, upright two centred lines; no scrolling', async () => {
  for (const [w, h] of [[667, 375], [844, 390], [412, 915], [568, 320]]) {
    const ctx = await browserContext({ ...PHONE, viewport: { width: w, height: h } }), page = await ctx.newPage();
    try {
      await page.goto(baseUrl(), { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.endfall);
      const got = await page.evaluate(() => {
        const bs = [...document.querySelectorAll('#menuHome .row .ib')].filter(b => !b.hidden).map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent, l: r.left, r: r.right, top: Math.round(r.top), b: r.bottom }; });
        const c = document.querySelector('#start .card.menu');
        return { bs, sc: [c.scrollHeight, c.clientHeight] };
      });
      assert.deepEqual(got.bs.map(b => b.t), ['FIRST GAME', 'HOW TO PLAY', 'ABOUT', 'OPTIONS', 'PLAY OFFLINE'], `${w}x${h}`);
      assert.ok(got.bs.every(b => b.l >= 0 && b.r <= w && b.b <= h), `${w}x${h}: every button in view: ${JSON.stringify(got.bs)}`);
      assert.ok(got.sc[0] <= got.sc[1] + 1, `${w}x${h}: no scrolling: ${got.sc}`);
      const lines = [...new Set(got.bs.map(b => b.top))];
      assert.equal(lines.length, w > h ? 1 : 2, `${w}x${h}: ${w > h ? 'one line' : 'two lines'}: ${lines}`);
      for (const top of lines) { const row = got.bs.filter(b => b.top === top), l = Math.min(...row.map(b => b.l)), r = Math.max(...row.map(b => b.r)); assert.ok(Math.abs(l - (w - r)) <= 2, `${w}x${h}: the line at ${top} centred: ${l} | ${w - r}`); }
    } finally { await ctx.close(); }
  }
});

test('the menu pages: every button a finger high, BACK the same size in the same place, titles in one place, How to play from its top', async () => {
  for (const device of [PHONE, DESKTOP]) {
    const ctx = await browserContext(device), page = await ctx.newPage();
    try {
      await page.goto(baseUrl() + '?seed=4242', { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.endfall);
      const click = (sel) => device.hasTouch ? page.locator(sel).tap() : page.locator(sel).click();
      // Every visible button of the menu's pages and cards (not the game's top bar or card), measured.
      const buttons = () => page.evaluate(() => [...document.querySelectorAll('.screen:not([hidden]) button')].filter(b => {
        const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !b.closest('.board, dialog, .chips');
      }).map(b => { const r = b.getBoundingClientRect(); return { id: b.id, text: b.textContent.trim(), x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) }; }));
      const title = (sel) => page.evaluate((sel) => Math.round(document.querySelector(sel).getBoundingClientRect().y), sel);
      const pages = [];
      for (const [open, close, h2] of [['#btnSolo', '#btnSoloBack', '#menuSolo h2'], ['#btnOnline', '#btnOnlineBack', '#onlineJoin h2'], ['#btnAbout', '#btnAboutBack', '#menuAbout h2']]) {
        await click(open);
        await page.locator(close).waitFor();
        pages.push({ open, back: (await buttons()).find(b => b.id === close.slice(1)), title: await title(h2), all: await buttons() });
        await click(close);
        await page.locator('#menuHome').waitFor();
      }
      const home = await buttons();
      for (const b of [...home, ...pages.flatMap(p => p.all)]) assert.ok(b.h >= 44, `${device.hasTouch ? 'phone' : 'desktop'}: ${b.id || b.text} is ${b.h} px high`);
      const backs = pages.map(p => p.back);
      assert.ok(backs.every(b => b.w === backs[0].w && b.h === backs[0].h && b.x === backs[0].x), `BACK the same size, at the same place: ${JSON.stringify(backs)}`);
      assert.ok(pages.every(p => p.title === pages[0].title), `the titles at one height: ${pages.map(p => p.title)}`);
      assert.equal(await page.locator('#btnFirst').count(), 0, 'no FIRST GAME in single player');
      // How to play opens at its top, its BACK as every other BACK.
      await click('#btnHowTo');
      await page.locator('#help').waitFor();
      assert.equal(await page.evaluate(() => document.querySelector('#help .card').scrollTop), 0, 'How to play from its top');
      const help = (await buttons()).find(b => b.id === 'btnHelpClose');
      assert.ok(help.w === backs[0].w && help.h === backs[0].h, `its BACK the same size: ${JSON.stringify(help)}`);
    } finally { await ctx.close(); }
  }
});

test('the first page\'s build stamp: the last game update and its date, small at the foot, one line on a phone; About has it beside the Version', async () => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 667, height: 375 }, { width: 412, height: 915 }]) {
    const ctx = await browserContext({ ...(viewport.width > 900 ? DESKTOP : PHONE), viewport }), page = await ctx.newPage();
    try {
      await page.goto(baseUrl(), { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.endfall);
      const stamp = page.locator('#buildStamp');
      assert.ok(await stamp.isVisible(), `${viewport.width}x${viewport.height}: the stamp on the first page`);
      const text = await stamp.textContent();
      assert.match(text, /^(Updated .+ · [0-9a-f]{7,}|dev)$/, `the stamp: ${text}`);
      const [h, line] = await stamp.evaluate(e => [e.getBoundingClientRect().height, parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.3]);
      assert.ok(h <= line * 1.5, `one line: ${h} px for a ${line} px line`);
      await fitsPage(page, `${viewport.width}x${viewport.height}: the first page with its stamp`);
      const short = text === 'dev' ? 'dev' : text.split(' · ')[1];
      assert.equal(await page.locator('#buildCommit').textContent(), short, 'About: the same commit beside the Version');
      assert.match(await page.locator('#menuAbout .fine').textContent(), /Version \S+ \(last game update \S+\)/, 'Version, then the last game update');
      if (text !== 'dev') assert.match(await stamp.getAttribute('title'), /^The last game update: .+, commit [0-9a-f]{7,}$/, 'its tooltip says what it is');
    } finally { await ctx.close(); }
  }
});
