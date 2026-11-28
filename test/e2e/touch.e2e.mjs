// Touch navigation on a landscape phone: one-finger pan and glide, a finger held on the map then dragged for a box, SELECT
// + drag for a box, the minimap nudge; the group hint for a player who taps fighters one by one (grouphint.js).
// Gestures go through CDP touch events, like a finger on the glass.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { test, start, stop, newGame, PHONE, DESKTOP, CDP_TOUCH } from './harness.mjs';

before(start);
after(stop);

const cam = (d) => d.eval(() => ({ x: endfall.cam.x, y: endfall.cam.y }));
/**
 * One finger (or several, by id) from point to point in `steps` moves, `ms` apart. Events carry their own timestamps
 * (a finger's real timing), so slow software-rendered frames in the test browser cannot turn a flick into a stop.
 * `settle` (s) pauses before lifting ("stop here": no glide); held fingers (`hold`) lift `holdFor` s after the moving
 * one (CDP lifts the touch points a touchEnd lists).
 */
async function swipe(d, from, to, { steps = 8, ms = 16, hold = [], settle = 0, holdFor = 0.4 } = {}) {
  const cdp = await d.page.context().newCDPSession(d.page);
  try {
    let t = Date.now() / 1000;
    const send = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints, timestamp: t });
    const held = hold.map((h, i) => ({ x: h[0], y: h[1], id: 10 + i }));
    const pts = (x, y) => [...held, { x, y, id: 1 }];
    await send('touchStart', pts(...from));
    for (let i = 1; i <= steps; i++) {
      t += ms / 1000;
      await send('touchMove', pts(from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps));
      if (ms) await d.page.waitForTimeout(ms);
    }
    t += settle + 0.01;
    await send('touchEnd', [{ x: to[0], y: to[1], id: 1 }]);
    if (hold.length) { t += holdFor; await send('touchEnd', held); }
  } finally { await cdp.detach(); }
}
const canvasBox = (d) => d.page.locator('#game').boundingBox();

test('phone: one finger pans the map without selecting; a flick glides and a tap stops it', { chromium: CDP_TOUCH }, async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    const box = await canvasBox(d), y = box.y + box.height * 0.45;
    // Slow drag: the camera follows the finger, nothing is selected or ordered.
    const c0 = await cam(d);
    await swipe(d, [box.x + box.width * 0.6, y], [box.x + box.width * 0.4, y], { steps: 10, ms: 40, settle: 0.25 });
    await d.page.waitForTimeout(300);
    const c1 = await cam(d), z = await d.eval(() => endfall.cam.zoom), moved = c1.x - c0.x;
    assert.ok(Math.abs(moved - box.width * 0.2 / z) < 25, `the view follows the finger: moved ${moved.toFixed(0)}, expected ${(box.width * 0.2 / z).toFixed(0)}`);
    assert.equal((await d.selection()).length, 0, 'a pan selects nothing');
    // Fast flick towards the middle of the map (away from the edge it could stop against): the camera keeps going.
    const W = await d.eval(() => endfall.engine.WW), zoom = await d.eval(() => endfall.cam.zoom), c = await cam(d);
    const right = c.x + box.width / zoom / 2 < W / 2; // the camera should travel right
    const [f0, f1] = right ? [0.65, 0.35] : [0.35, 0.65];
    await swipe(d, [box.x + box.width * f0, y], [box.x + box.width * f1, y], { steps: 4, ms: 8 });
    const a = await cam(d); let b = a;
    const glided = () => right ? b.x > a.x + 5 : b.x < a.x - 5;
    for (let i = 0; i < 15 && !glided(); i++) { await d.page.waitForTimeout(100); b = await cam(d); } // frames are slow here
    assert.ok(glided(), `the camera glides on: ${a.x.toFixed(0)} -> ${b.x.toFixed(0)}`);
    // A tap stops the glide and does nothing else: a selected harvester keeps mining.
    const h = (await d.state()).units.find(u => u.team === 0 && u.type === 'harvester');
    await d.eval((id) => { endfall.ui.sel = [endfall.G.units.find(u => u.id === id)]; }, h.id);
    await swipe(d, [box.x + box.width * 0.65, y], [box.x + box.width * 0.35, y], { steps: 4, ms: 8 });
    const task = await d.eval((id) => endfall.G.units.find(u => u.id === id).task.t, h.id);
    await d.tapAt(box.x + box.width / 2, y);
    const s0 = await cam(d); await d.page.waitForTimeout(250); const s1 = await cam(d);
    assert.ok(Math.abs(s1.x - s0.x) < 2, 'a tap stops it');
    assert.equal(await d.eval((id) => endfall.G.units.find(u => u.id === id).task.t, h.id), task, 'the stopping tap gives no order');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: SELECT then drag draws a box (tap to arm once, or hold it with the other hand)', { chromium: CDP_TOUCH }, async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    // (the harvesters stopped where they stand once all are out of their gold mine, where none can be boxed)
    await d.stopByUI((await d.state()).units.filter(u => u.team === 0 && u.type === 'harvester').map(u => u.id));
    await d.key('Escape');
    const s = await d.state(), hs = s.units.filter(u => u.team === 0 && u.type === 'harvester');
    assert.ok(hs.length === 4 && (await d.eval(() => endfall.G.units.filter(u => u.team === 0).every(u => u.task.t === 'idle'))), 'all four stopped');
    const xs = hs.map(u => u.x), ys = hs.map(u => u.y);
    const m = 90;
    const [x0, y0] = await d.screen(Math.min(...xs) - m, Math.min(...ys) - m);
    const z = await d.eval(() => endfall.cam.zoom), w = (Math.max(...xs) - Math.min(...xs) + 2 * m) * z, h = (Math.max(...ys) - Math.min(...ys) + 2 * m) * z;
    const sel = d.page.locator('#btnBox');
    assert.ok(await sel.isVisible(), 'SELECT shows on touch screens');
    assert.equal(await sel.innerText(), 'SELECT', 'its word');
    assert.equal(await d.page.locator('#btnBox svg .fig').count(), 1, 'its icon: figures in a dashed box (not full screen\'s corners)');
    // Tap: armed for one box.
    await sel.tap();
    assert.match(await d.page.locator('#hint').textContent(), /Drag a box around your units/);
    // Lit: amber, the map's edge glowing; a second tap disarms it (a toggle), a third arms it again.
    assert.match(await sel.getAttribute('class'), /\bon\b/);
    assert.equal(await sel.evaluate(b => getComputedStyle(b).backgroundColor), 'rgb(245, 165, 36)', 'SELECT lit amber');
    assert.ok(await d.eval(() => document.getElementById('stage').classList.contains('boxing')), 'the map edge glows');
    await sel.tap();
    assert.ok(!(await sel.getAttribute('class')).includes('on') && !(await d.eval(() => document.getElementById('stage').classList.contains('boxing'))), 'tapped again: off');
    await sel.tap();
    assert.match(await sel.getAttribute('class'), /\bon\b/, 'and on again');
    const camBefore = await cam(d);
    await swipe(d, [x0, y0], [x0 + w, y0 + h], { steps: 6, ms: 16 });
    assert.equal((await d.selection()).filter(u => u.type === 'harvester').length, hs.length, 'the box selects the harvesters');
    assert.deepEqual(await cam(d), camBefore, 'drawing the box does not pan');
    assert.ok(!(await sel.getAttribute('class')).includes('on'), 'one box, then SELECT is off again');
    // Hold: the left thumb on SELECT while the right finger drags.
    await d.key('Escape');
    const b = await sel.boundingBox();
    await swipe(d, [x0, y0], [x0 + w, y0 + h], { steps: 6, ms: 16, hold: [[b.x + b.width / 2, b.y + b.height / 2]] });
    assert.equal((await d.selection()).filter(u => u.type === 'harvester').length, hs.length, 'held SELECT boxes too');
    assert.ok(!(await sel.getAttribute('class')).includes('on'), 'released, SELECT is off');
    // A quick hold-and-box (released within the tap time) does not leave SELECT armed either.
    await d.key('Escape');
    await swipe(d, [x0, y0], [x0 + w, y0 + h], { steps: 3, ms: 16, hold: [[b.x + b.width / 2, b.y + b.height / 2]], holdFor: 0.05 });
    assert.ok(!(await sel.getAttribute('class')).includes('on'), 'a quick hold-and-box leaves SELECT off');
    // Esc disarms it.
    await sel.tap(); await d.key('Escape');
    assert.ok(!(await sel.getAttribute('class')).includes('on'), 'Esc disarms SELECT');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

/** One finger by CDP with its own timestamps: down at `from`, held still (2 px of tremor) for `restMs` of real time (the
 *  hold's timer runs on the page's clock), then moved to `to` in a few steps and lifted. `waitArmed`: wait (up to 10 s)
 *  until the page has armed the box before moving on (a slow test machine). */
async function holdDrag(d, from, to, { restMs = 500, waitArmed = true, lift = true } = {}) {
  const cdp = await d.page.context().newCDPSession(d.page);
  let open = false;
  try {
    let t = Date.now() / 1000;
    const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts, timestamp: t });
    await send('touchStart', [{ x: from[0], y: from[1], id: 1 }]);
    await d.page.waitForTimeout(restMs); t += restMs / 1000;
    await send('touchMove', [{ x: from[0] + 2, y: from[1] + 1, id: 1 }]);
    if (waitArmed) await d.page.waitForFunction(() => endfall.ui.box === 'map', null, { timeout: 10000 });
    if (to) for (let i = 1; i <= 6; i++) { t += 0.03; await send('touchMove', [{ x: from[0] + (to[0] - from[0]) * i / 6, y: from[1] + (to[1] - from[1]) * i / 6, id: 1 }]); await d.page.waitForTimeout(16); }
    t += 0.02;
    const end = async () => { t = Math.max(t, Date.now() / 1000); await send('touchEnd', [{ x: (to || from)[0], y: (to || from)[1], id: 1 }]); await d.page.waitForTimeout(60); await cdp.detach(); };
    if (lift) { await end(); return null; }
    open = true; return end; // (`lift: false`: the caller lifts the finger)
  } finally { if (!open) await cdp.detach().catch(() => {}); }
}
const lit = (d) => d.eval(() => ({ on: document.getElementById('btnBox').classList.contains('on'), edge: document.getElementById('stage').classList.contains('boxing'), hint: document.getElementById('hint').textContent, ring: document.getElementById('holdRing')?.className ?? null }));

test('phone: a finger held still on the map, then dragged, draws a box (ring, SELECT lit, the hint); one that moves at once pans; an empty box keeps the selection', { chromium: CDP_TOUCH }, async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    await d.stopByUI((await d.state()).units.filter(u => u.team === 0 && u.type === 'harvester').map(u => u.id));
    await d.key('Escape');
    const hs = (await d.state()).units.filter(u => u.team === 0 && u.type === 'harvester');
    const xs = hs.map(u => u.x), ys = hs.map(u => u.y), m = 90;
    const [x0, y0] = await d.screen(Math.min(...xs) - m, Math.min(...ys) - m);
    const z = await d.eval(() => endfall.cam.zoom), w = (Math.max(...xs) - Math.min(...xs) + 2 * m) * z, h = (Math.max(...ys) - Math.min(...ys) + 2 * m) * z;
    const camBefore = await cam(d);
    // Held still: the box is armed where the finger rests (no lift yet: look at it).
    const liftIt = await holdDrag(d, [x0, y0], null, { lift: false });
    const armed = await lit(d);
    assert.deepEqual([armed.on, armed.edge, armed.hint, armed.ring], [true, true, 'Drag a box around your units', 'done'], `armed: ${JSON.stringify(armed)}`);
    assert.equal((await d.selection()).length, 0, 'nothing selected yet');
    // Lifted where it rested: nothing. Then the whole gesture: held, dragged over the harvesters, lifted.
    await liftIt();
    assert.equal((await d.selection()).length, 0, 'a hold lifted where it rested selects nothing');
    assert.equal((await lit(d)).on, false, 'and SELECT goes dark');
    assert.ok(await d.eval(() => endfall.G.units.filter(u => u.team === 0).every(u => u.task.t === 'idle')), 'nor orders anything');
    await holdDrag(d, [x0, y0], [x0 + w, y0 + h]);
    assert.equal((await d.selection()).filter(u => u.type === 'harvester').length, hs.length, 'the box selects the harvesters');
    assert.deepEqual(await cam(d), camBefore, 'holding and drawing do not pan');
    const after = await lit(d);
    assert.deepEqual([after.on, after.edge, after.hint], [false, false, ''], 'drawn: SELECT dark, the edge and the hint gone');
    // An empty box (held on bare ground, dragged over nothing) keeps the selection.
    const [gx, gy] = await d.screen(Math.max(...xs) + 400, Math.min(...ys) - 300);
    await holdDrag(d, [gx, gy], [gx + 60, gy + 50]);
    assert.equal((await d.selection()).filter(u => u.type === 'harvester').length, hs.length, 'an empty box keeps the selection');
    // A finger that moves at once pans, with no box and no change to the selection (from the harvesters, clear of the
    // map's edge).
    await d.centerOn((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2);
    const c0 = await cam(d), box = await d.page.locator('#game').boundingBox(), y = box.y + box.height * 0.45;
    await swipe(d, [box.x + box.width * 0.6, y], [box.x + box.width * 0.4, y], { steps: 10, ms: 30, settle: 0.25 });
    await d.page.waitForTimeout(500); // (past the hold: nothing armed late)
    assert.ok(Math.abs((await cam(d)).x - c0.x) > 20, 'it pans');
    assert.equal((await lit(d)).on, false, 'no box armed');
    assert.equal((await d.selection()).filter(u => u.type === 'harvester').length, hs.length, 'the selection stays');
    // A second finger within the hold cancels it (a pinch).
    const cdp2 = await d.page.context().newCDPSession(d.page);
    const t = Date.now() / 1000, mid = [box.x + box.width / 2, y];
    await cdp2.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: mid[0], y: mid[1], id: 1 }], timestamp: t });
    await cdp2.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: mid[0], y: mid[1], id: 1 }, { x: mid[0] + 80, y: mid[1], id: 2 }], timestamp: t + 0.1 });
    await d.page.waitForTimeout(600);
    assert.equal((await lit(d)).on, false, 'two fingers: no box');
    await cdp2.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t + 0.8 }); await cdp2.detach();
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: dragging the minimap nudges the view from where the finger lands; a tap jumps', { chromium: CDP_TOUCH }, async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    const mm = await d.page.locator('#minimap').boundingBox(), WW = await d.eval(() => endfall.engine.WW);
    // Start far from the view box (top-right of the minimap) and drag 20 px to the left.
    const c0 = await cam(d);
    await swipe(d, [mm.x + mm.width * 0.85, mm.y + mm.height * 0.2], [mm.x + mm.width * 0.85 - 20, mm.y + mm.height * 0.2], { steps: 5, ms: 20 });
    const c1 = await cam(d), dx = c1.x - c0.x;
    // The minimap doubles in size while held, so 20 px of travel is 10 minimap px.
    assert.ok(dx < 0 && Math.abs(Math.abs(dx) - 20 / (mm.width * 2) * WW) < 40, `relative nudge, not a jump: moved ${dx.toFixed(0)}`);
    assert.ok(!(await d.page.locator('#minimap').getAttribute('class') || '').includes('big'), 'the minimap shrinks back');
    // A tap jumps the view there.
    await d.tapAt(mm.x + mm.width * 0.8, mm.y + mm.height * 0.2);
    const v = await d.eval(() => { const c = endfall.cam, r = document.getElementById('game').getBoundingClientRect(); return { cx: c.x + r.width / 2 / c.zoom, cy: c.y + r.height / 2 / c.zoom }; });
    assert.ok(Math.abs(v.cx - 0.8 * WW) < 200, `tap centers the view: ${v.cx.toFixed(0)} vs ${(0.8 * WW).toFixed(0)}`);
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: the minimap, enlarged under the finger, is drawn in front of the selection console', { chromium: CDP_TOUCH }, async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    await d.eval(() => { endfall.ui.sel = [endfall.G.units.find(u => u.team === 0)]; }); // a selection: the console shows
    await d.page.locator('#info').waitFor();
    const mm = await d.page.locator('#minimap').boundingBox(), info = await d.page.locator('#info').boundingBox();
    assert.ok(info.x > mm.x + mm.width, 'the console sits right of the minimap');
    const cdp = await d.page.context().newCDPSession(d.page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: mm.x + mm.width * 0.3, y: mm.y + mm.height * 0.7 }] });
    await d.page.waitForTimeout(250);
    // A point over the console, inside the enlarged minimap (it doubles from its bottom-left corner).
    const top = await d.page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id, [info.x + 10, info.y + info.height / 2]);
    // Drawn at its enlarged size: the backing twice the screen's pixels across its box while held (at most 3 per CSS px).
    const held = await d.page.evaluate(() => new Promise(r => requestAnimationFrame(() => { const m = document.getElementById('minimap'); r(m.width / m.clientWidth / Math.min(2 * devicePixelRatio, 3)); })));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal(top, 'minimap', 'the enlarged minimap covers the console, not the other way round');
    assert.ok(Math.abs(held - 1) < 0.02, `the enlarged minimap's backing: ${held.toFixed(3)} of its enlarged size`);
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

/** Three Guards by the Castle (set up), their ids. */
const threeGuards = (d) => d.eval(() => {
  const c = endfall.G.bldgs.find(b => b.team === 0 && b.d.hq);
  for (let i = 0; i < 3; i++) endfall.engine.debugSpawn(0, 'trooper', c.x - 120 + i * 80, c.y + 140);
  return endfall.G.units.filter(u => u.team === 0 && u.type === 'trooper').map(u => u.id);
});
/** Tap each unit on its own, quickly, as a player who does not know the group gestures (the view centered on them
 *  once, then each tapped on its body's middle: a slow software-rendered frame must not stretch three taps past the
 *  hint's window). */
async function tapEach(d, ids) {
  const canvas = await d.page.locator('#game').boundingBox();
  if (!d.touch) await d.page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  const pts = await d.eval((ids) => {
    const us = ids.map(id => endfall.G.units.find(u => u.id === id));
    endfall.centerOn(us.reduce((a, u) => a + u.x, 0) / us.length, us.reduce((a, u) => a + u.y, 0) / us.length);
    const c = endfall.cam; return us.map(u => ({ x: (u.x - c.x) * c.zoom, y: (u.y - endfall.unitTop(u.type) / 2 - c.y) * c.zoom }));
  }, ids);
  for (const p of pts) {
    if (d.touch) await d.tapAt(canvas.x + p.x, canvas.y + p.y);
    else { await d.page.mouse.click(canvas.x + p.x, canvas.y + p.y); await d.page.waitForTimeout(450); } // (apart: no double-click)
  }
}
const HINT = /^Many units\? Hold a finger on the ground, then drag a box · or tap SELECT · ARMY selects every fighter$/;
const hinted = async (d) => (await d.toasts()).some(t => HINT.test(t));
const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('phone: fighters tapped one by one bring the group hint once, clear of SELECT and ARMY (which pulse); not again until three more games', async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  const press = (sel) => d.page.locator(sel).tap();
  try {
    let ids = await threeGuards(d);
    assert.equal(ids.length, 3);
    await tapEach(d, ids.slice(0, 2));
    assert.ok(!(await hinted(d)), 'two single taps: no hint yet');
    await tapEach(d, ids.slice(2));
    assert.equal((await d.selection()).length, 1, 'one Guard at a time');
    assert.ok(await hinted(d), `the third single tap shows the hint: ${JSON.stringify(await d.toasts())}`);
    const tip = await d.page.locator('#msg .toast.tip').boundingBox(), vp = d.page.viewportSize();
    for (const id of ['#btnBox', '#btnArmy', '#btnHome']) {
      const b = await d.page.locator(id).boundingBox();
      assert.ok(!overlap(tip, b), `the hint is clear of ${id}: ${JSON.stringify({ tip, b })}`);
    }
    assert.ok(tip.x >= 0 && tip.y >= 0 && tip.x + tip.width <= vp.width, 'on screen');
    for (const id of ['#btnBox', '#btnArmy']) assert.match(await d.page.locator(id).getAttribute('class'), /\bnudge\b/, `${id} pulses while it shows`);
    // Gone, then another burst of single taps: once is enough.
    await d.page.locator('#msg .toast.tip').waitFor({ state: 'detached', timeout: 15000 });
    await tapEach(d, ids);
    await d.page.waitForTimeout(300);
    assert.ok(!(await hinted(d)), 'not twice in a game');
    assert.deepEqual(await d.eval(() => [localStorage.getItem('endfall.games'), localStorage.getItem('endfall.groupHint')]), ['1', '1'], 'shown in the first game');
    // Two more games (RESTART): still not; the third: again.
    for (let game = 2; game <= 4; game++) {
      await press('#btnPause'); await press('#btnRestart');
      await d.page.waitForFunction(() => endfall.G.time < 1 && document.getElementById('pause').hidden, null, { timeout: 5000 });
      await d.eval(() => endfall.engine.disableAi());
      ids = await threeGuards(d);
      await tapEach(d, ids);
      await d.page.waitForTimeout(300);
      assert.equal(await hinted(d), game === 4, `game ${game}: ${game === 4 ? 'the hint again' : 'no hint'}`);
    }
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: in the tutorial, fighters tapped one by one bring no hint (its own step teaches SELECT and ARMY)', async () => {
  const d = await newGame(PHONE, 0, 4242, { tutorial: true });
  try {
    assert.match(await d.page.locator('#tut').textContent(), /1\/8/, 'the guided game');
    const ids = await threeGuards(d);
    await tapEach(d, ids); await tapEach(d, ids);
    await d.page.waitForTimeout(300);
    assert.ok(!(await hinted(d)), 'no group hint in the guided game');
    assert.equal(await d.eval(() => localStorage.getItem('endfall.groupHint')), null, 'its one showing is not spent');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('a desktop: units clicked one by one bring no hint', async () => {
  const d = await newGame(DESKTOP, 1, 4242, { ai: false });
  try {
    const ids = await threeGuards(d);
    await tapEach(d, ids); await tapEach(d, ids);
    await d.page.waitForTimeout(300);
    assert.ok(!(await hinted(d)), 'no group hint with a mouse');
    assert.equal(await d.eval(() => localStorage.getItem('endfall.groupHint')), null);
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});
