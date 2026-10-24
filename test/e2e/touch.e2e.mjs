// Touch navigation on a landscape phone: one-finger pan and glide, SELECT + drag for a box, the minimap nudge.
// Gestures go through CDP touch events, like a finger on the glass.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, newGame, PHONE } from './harness.mjs';

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

test('phone: one finger pans the map without selecting; a flick glides and a tap stops it', async () => {
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

test('phone: SELECT then drag draws a box (tap to arm once, or hold it with the other hand)', async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    const s = await d.state(), hs = s.units.filter(u => u.team === 0 && u.type === 'harvester');
    const xs = hs.map(u => u.x), ys = hs.map(u => u.y);
    const m = 90; // harvesters keep mining while the box is drawn
    const [x0, y0] = await d.screen(Math.min(...xs) - m, Math.min(...ys) - m);
    const z = await d.eval(() => endfall.cam.zoom), w = (Math.max(...xs) - Math.min(...xs) + 2 * m) * z, h = (Math.max(...ys) - Math.min(...ys) + 2 * m) * z;
    const sel = d.page.locator('#btnBox');
    assert.ok(await sel.isVisible(), 'SELECT shows on touch screens');
    // Tap: armed for one box.
    await sel.tap();
    assert.match(await d.page.locator('#hint').textContent(), /Drag to select/);
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

test('phone: dragging the minimap nudges the view from where the finger lands; a tap jumps', async () => {
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
    assert.ok(Math.abs(v.cx - 0.8 * WW) < 200, `tap centres the view: ${v.cx.toFixed(0)} vs ${(0.8 * WW).toFixed(0)}`);
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});

test('phone: the minimap, enlarged under the finger, is drawn in front of the selection console', async () => {
  const d = await newGame(PHONE, 1, 4242, { ai: false });
  try {
    const mm = await d.page.locator('#minimap').boundingBox(), info = await d.page.locator('#info').boundingBox();
    assert.ok(info.x > mm.x + mm.width, 'the console sits right of the minimap');
    const cdp = await d.page.context().newCDPSession(d.page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: mm.x + mm.width * 0.3, y: mm.y + mm.height * 0.7 }] });
    await d.page.waitForTimeout(250);
    // A point over the console, inside the enlarged minimap (it doubles from its bottom-left corner).
    const top = await d.page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id, [info.x + 10, info.y + info.height / 2]);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal(top, 'minimap', 'the enlarged minimap covers the console, not the other way round');
    assert.deepEqual(d.errors, []);
  } finally { await d.close(); }
});
