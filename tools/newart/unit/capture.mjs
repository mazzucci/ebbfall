// The Guard's check stills: one staged instant of one game, shot as today's art and as the new look's (`?art=new`), on a
// desktop (1920x1080, DPR 1), a retina laptop (1728x1000, DPR 2) and a landscape phone (844x390, DPR 2), then laid
// side by side. Staged as tools/view-capture.mjs stages its scenes (the clock held, the world moved only by
// `endfall.skip`, every still drawn with `endfall.draw`, service workers blocked); the state hash of every still is
// logged, and the two looks' must be the same.
//   npm run build && node tools/newart/unit/capture.mjs --tag today|new [--out DIR] [--only d1,d2,ph]
//   node tools/newart/unit/capture.mjs --sheet [--out DIR]      today beside new, a picture per still, and 1:1 crops
//   node tools/newart/unit/capture.mjs --bench                   the frame time with 100 Guards on screen, both looks
// The stills hold the new look's pictures: --out is outside the repo (default: the article folder's new-art/unit).
// The scene (seed 4242, the Kingdom against the Expedition, the AI and the fog off): a Barracks built by a Villager;
// then, at one instant: `fight` 12 Guards against 7 Sellswords and 3 Buggies, ours box-selected through the UI;
// `walk` 16 Guards marching out from a point, one along each facing; `strike` 16 Guards each on a Sellsword of its
// own, one along each facing; `behind` three Guards behind the Barracks (their silhouettes) and one beside it, clicked;
// `card` the Barracks clicked and its Guard button under the mouse (its tooltip; a mouse only); `lineup` one of every
// kind of unit standing in a row and a second row of them marching down the screen.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { start, stop, browserContext, baseUrl, board } from '../../../test/e2e/harness.mjs';
import { decodePNG, encodePNG } from '../../art/png.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; }, flag = (k) => process.argv.includes(k);
const OUT = resolve(arg('--out', '/home/mazzucci/projects/ebbfall-article/new-art/unit/stills')), TAG = arg('--tag', 'today');
const DEVICES = {
  d1: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  d2: { viewport: { width: 1728, height: 1000 }, deviceScaleFactor: 2 },
  ph: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const ONLY = arg('--only', Object.keys(DEVICES).join(',')).split(',');
const ARMIES = [{ trooper: 12 }, { prism: 7, scythe: 3 }];
const AT = { x: 1300, y: 1610 }; // (world px: the fight, a few tiles west of our Castle at 1728, 1728)

/** A page with the game at its first instant (its clock held), as `tag`'s look. */
async function staged(device, tag, held = true) {
  const ctx = await browserContext({ ...device, serviceWorkers: 'block' }), page = await ctx.newPage(), errors = [], warns = [];
  if (device.hasTouch) await ctx.addInitScript(() => { Element.prototype.requestFullscreen = () => Promise.reject(new Error('(no full screen)')); });
  page.setDefaultTimeout(300000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'warning' && /new art/.test(m.text())) warns.push(m.text()); });
  if (held) await page.clock.install();
  await page.goto(`${baseUrl()}?seed=4242${tag === 'new' ? '&art=new' : ''}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.endfall, null, { timeout: 120000 });
  const press = (sel) => device.hasTouch ? page.locator(sel).tap() : page.locator(sel).click();
  await press('#btnSolo');
  await board(page).race(1, 'vael');
  if (held) await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1000); // (from here no frame runs unless drawn)
  await press('#btnStart');
  await page.waitForFunction(() => window.endfall && endfall.G.units.length > 0, null, { polling: 100 });
  await page.evaluate(() => {
    const { engine } = endfall; engine.disableAi(); engine.revealAll(true); endfall.fog(false);
    for (const t of document.querySelectorAll('#msg .toast')) t.remove();
    // the renderer's clock, moved by hand: `tick(ms)` a frame later (a walk's stride, a stopped unit settling)
    const now = performance.now.bind(performance); let off = 0; performance.now = () => now() + off;
    window.tick = (ms) => { off += ms; endfall.draw(); };
  });
  await page.mouse.move(1, 1);
  return { ctx, page, errors, warns };
}

/** The whole scene, staged in the page: the same orders at the same ticks for both looks. */
const scene = (page) => page.evaluate(([armies, at]) => {
  const { G, map, engine } = endfall, T = engine.TILE, me = G.me;
  const free = (x, y) => { const tx = Math.floor(x / T), ty = Math.floor(y / T); return engine.inMap(tx, ty) && !map.rock[engine.idx(tx, ty)] && !map.occ[engine.idx(tx, ty)]; };
  const of = (ids) => G.units.filter(u => ids.includes(u.id));
  /** The nearest point to (x, y), `far` px or more from each of `from`, with free ground `r` px round it. */
  const open = (x, y, r, from, far) => {
    let best = null; if (r < 96) throw new Error('no open ground for a scene');
    for (let ty = 3; ty < engine.MH - 3; ty++) for (let tx = 3; tx < engine.MW - 3; tx++) {
      const cx = tx * T + 16, cy = ty * T + 16; if (from.some(p => Math.hypot(p.x - cx, p.y - cy) < far)) continue;
      let ok = true; for (let dy = -r; dy <= r && ok; dy += T) for (let dx = -r; dx <= r && ok; dx += T) if (dx * dx + dy * dy <= r * r && !free(cx + dx, cy + dy)) ok = false;
      const d = Math.hypot(cx - x, cy - y); if (ok && (!best || d < best.d)) best = { x: cx, y: cy, d };
    }
    return best || open(x, y, r - 32, from, far);
  };
  // the Barracks: a Villager builds it south of the Castle
  const core = G.bldgs.find(b => b.team === me && b.d.hq), worker = G.units.find(u => u.team === me && u.d.worker);
  engine.setResources(me, 5000, 0);
  let spot = null;
  for (let r = 4; r < 12 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) { const tx = core.tx + dx, ty = core.ty + dy; if (Math.max(Math.abs(dx), Math.abs(dy)) === r && dy > 2 && engine.canPlace('barracks', tx, ty, me)) spot = [tx, ty]; }
  engine.placeBuilding(me, 'barracks', spot[0], spot[1], worker);
  for (let i = 0; i < 120 && !G.bldgs.some(b => b.type === 'barracks' && b.done); i++) endfall.skip(1);
  const barracks = G.bldgs.find(b => b.type === 'barracks' && b.done);
  // the fight (tools/view-capture.mjs's, its armies ours)
  const field = { x: at.x - 160, y: at.y + 10 }, groups = [[], []];
  armies.forEach((army, seat) => {
    const dir = seat ? -1 : 1, kinds = Object.entries(army).flatMap(([k, n]) => Array(n).fill(k)); let k = 0;
    for (let col = 0; k < kinds.length && col < 12; col++) for (let row = -3; row <= 3 && k < kinds.length; row++) {
      const x = field.x + dir * (3 + col * 1.1) * T, y = field.y + row * 1.1 * T + (col % 2) * 0.5 * T;
      if (!free(x, y)) continue;
      const id = engine.debugSpawn(seat, kinds[k++], x, y); if (id) groups[seat].push(id);
    }
  });
  engine.attackMoveGroup(of(groups[0]), field.x - 6 * T, field.y); engine.attackMoveGroup(of(groups[1]), field.x + 6 * T, field.y);
  // the strikes: 16 Guards round a point, each with a Sellsword of its own just outside, along its facing
  const taken = [field, core, barracks], sc = open(field.x, field.y - 500, 230, taken, 480); taken.push(sc);
  const strikers = [];
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2, R = 170, g = engine.debugSpawn(me, 'trooper', sc.x + Math.cos(a) * R, sc.y + Math.sin(a) * R), e = engine.debugSpawn(1, 'prism', sc.x + Math.cos(a) * (R + 30), sc.y + Math.sin(a) * (R + 30));
    strikers.push(g); const gu = of([g])[0], eu = of([e])[0]; engine.attackEnt(gu, eu); engine.holdUnit(eu);
  }
  // behind the Barracks: three hidden by it, one beside it in the open
  const bx = barracks.tx * T, by = barracks.ty * T, hidden = [0, 1, 2].map(i => engine.debugSpawn(me, 'trooper', bx + 20 + i * 28, by - 4));
  const beside = engine.debugSpawn(me, 'trooper', bx - 34, by + barracks.h * T - 20);
  endfall.skip(1.9); // (the fronts have met)
  // the march: 16 Guards from a point, each out along its facing
  const wc = open(sc.x, sc.y, 230, taken, 480), walkers = [];
  for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, id = engine.debugSpawn(me, 'trooper', wc.x + Math.cos(a) * 46, wc.y + Math.sin(a) * 46); walkers.push(id); }
  // the lineup: one of every kind standing in a row (ours), and a second row of them marching down the screen
  const kinds = ['harvester', 'trooper', 'lancer', 'rider', 'knight', 'bastion', 'siegeTank', 'observer', 'lumen', 'scythe', 'prism', 'bruiser', 'umbra', 'monolith', 'shrike'];
  const lc = open(wc.x, wc.y, 200, [...taken, wc], 520), row = (dy) => kinds.map((k, i) => engine.debugSpawn(me, k, lc.x + (i - 7) * 52, lc.y + dy)).filter(Boolean);
  row(-60); const marching = row(30);
  endfall.draw();
  of(marching).forEach((u) => engine.moveTo(u, u.x, u.y + 300));
  of(walkers).forEach((u, k) => { const a = k / 16 * Math.PI * 2; engine.moveTo(u, wc.x + Math.cos(a) * 420, wc.y + Math.sin(a) * 420); });
  endfall.skip(0.5);
  // on to the tick most of the strikers' blows land (look.js strikePose: the strike shows 0.15 s)
  const striking = () => of(strikers).filter(u => u.d.weapon && u.cd > u.d.weapon.cd - 0.15).length;
  let n = 0; for (let i = 0; i < 60 && (n = striking()) < 9; i++) endfall.skip(1 / 30);
  G.events.length = 0;
  for (const t of document.querySelectorAll('#msg .toast')) t.remove();
  for (let i = 0; i < 4; i++) window.tick(100); // (who stopped stands: the renderer holds a stride a quarter second)
  const ours = of(groups[0]).filter(u => !u.dead), xs = ours.map(u => u.x), ys = ours.map(u => u.y);
  return { field, sc, wc, lc, striking: n, barracks: { x: barracks.x, y: barracks.y, id: barracks.id }, beside, hidden, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], tick: G.tick ?? G.time, hash: engine.stateHash() >>> 0 };
}, [ARMIES, AT]);

/** Where world point (x, y) is on the page now. */
const onPage = (page, x, y) => page.evaluate(([x, y]) => { const { cam } = endfall, r = document.getElementById('game').getBoundingClientRect(); return [r.left + (x - cam.x) * cam.zoom, r.top + (y - cam.y) * cam.zoom]; }, [x, y]);
/** Center the camera on `at` at `zoom` (the page's start zoom by default) and draw. */
const look = (page, at, zoom) => page.evaluate(([at, z]) => { endfall.cam.zoom = z ?? endfall.startZoom; endfall.centerOn(at.x, at.y); endfall.draw(); return endfall.cam.zoom; }, [at, zoom]);
const log = { tag: TAG, shots: [], errors: [], warns: [] };
async function shoot(page, dev, name, extra = {}) {
  const s = await page.evaluate(() => { endfall.draw(); const { cam, view, G, engine } = endfall; return { zoom: cam.zoom, cam: { x: cam.x, y: cam.y }, view: { w: view.w, h: view.h, dpr: view.dpr }, tick: G.tick ?? G.time, hash: engine.stateHash() >>> 0, selected: endfall.ui.sel.length, top: endfall.unitTop('trooper') }; });
  const file = `${dev}-${name}.png`; await page.screenshot({ path: join(OUT, TAG, file), timeout: 300000, omitBackground: true }); // (with an alpha channel: tools/art/png.js reads RGBA only)
  console.log(`${TAG} ${file}: zoom ${s.zoom.toFixed(3)}, tick ${s.tick}, hash ${s.hash}, ${s.selected} selected`);
  log.shots.push({ dev, name, file, ...s, ...extra });
}

async function stills() {
  mkdirSync(join(OUT, TAG), { recursive: true });
  for (const dev of ONLY) {
    const device = DEVICES[dev], touch = !!device.hasTouch, { ctx, page, errors, warns } = await staged(device, TAG);
    const S = await scene(page); log[dev] = S;
    const tap = (x, y) => touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y);
    // the fight: ours box-selected through the UI at zoom 1, shot at the start zoom (and at zoom 1 on the phone)
    const [x0, y0, x1, y1] = S.box, m = 26, mid = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 - 10 };
    await look(page, mid, 1);
    const a = await onPage(page, x0 - m, y0 - m - 40), b = await onPage(page, x1 + m, y1 + m);
    if (touch) {
      await page.locator('#btnBox').tap();
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a[0], y: a[1] }] });
      for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a[0] + (b[0] - a[0]) * i / 6, y: a[1] + (b[1] - a[1]) * i / 6 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else { await page.mouse.move(a[0], a[1]); await page.mouse.down(); await page.mouse.move(b[0], b[1], { steps: 8 }); await page.mouse.up(); await page.mouse.move(1, 1); }
    await look(page, mid); await shoot(page, dev, 'fight', { at: mid });
    if (touch) { await look(page, mid, 1); await shoot(page, dev, 'fight-zoom1', { at: mid }); }
    else { await look(page, mid, 2.5); await shoot(page, dev, 'fight-close', { at: mid }); }
    // the strikes and the march, each way
    await look(page, S.sc); await shoot(page, dev, 'strike', { at: S.sc });
    await look(page, S.wc); await shoot(page, dev, 'walk', { at: S.wc });
    await look(page, S.lc); await shoot(page, dev, 'lineup', { at: S.lc });
    if (touch) { await look(page, S.sc, 1); await shoot(page, dev, 'strike-zoom1', { at: S.sc }); await look(page, S.wc, 1); await shoot(page, dev, 'walk-zoom1', { at: S.wc }); }
    // behind the Barracks, and the one beside it clicked (its portrait, its bar)
    const at = { x: S.barracks.x, y: S.barracks.y - 20 }; await look(page, at);
    const g = await page.evaluate((id) => { const u = endfall.G.units.find(u => u.id === id); return { x: u.x, y: u.y - endfall.unitTop('trooper') / 2 }; }, S.beside);
    await tap(...await onPage(page, g.x, g.y)); await shoot(page, dev, 'behind', { at });
    // the Barracks clicked: its card, and the Guard's button under the mouse
    await tap(...await onPage(page, S.barracks.x, S.barracks.y));
    await page.evaluate(() => endfall.draw());
    if (!touch) { const btn = page.locator('#cmd [data-id="t_trooper"]'); if (await btn.count()) await btn.hover(); }
    await shoot(page, dev, 'card', { at });
    log.errors.push(...errors.map(e => `${dev}: ${e}`)); log.warns.push(...warns.map(e => `${dev}: ${e}`));
    await ctx.close();
  }
  writeFileSync(join(OUT, TAG, 'shots.json'), JSON.stringify(log, null, 1));
  if (log.errors.length) { console.error(log.errors.join('\n')); process.exitCode = 1; }
  if (log.warns.length) console.warn(log.warns.join('\n'));
}

/** Today beside new: each still's pair, and 1:1 crops round each scene's middle. */
function sheet() {
  const T = JSON.parse(readFileSync(join(OUT, 'today/shots.json'), 'utf8')), N = JSON.parse(readFileSync(join(OUT, 'new/shots.json'), 'utf8'));
  mkdirSync(join(OUT, 'pairs'), { recursive: true });
  const beside = (a, b, gap = 8) => { const w = a.w + gap + b.w, h = Math.max(a.h, b.h), data = new Uint8ClampedArray(w * h * 4).fill(255); for (const [im, ox] of [[a, 0], [b, a.w + gap]]) for (let y = 0; y < im.h; y++) data.set(im.data.subarray(y * im.w * 4, (y + 1) * im.w * 4), (y * w + ox) * 4); return { w, h, data }; };
  const cut = (im, cx, cy, w, h) => { const x0 = Math.max(0, Math.min(im.w - w, Math.round(cx - w / 2))), y0 = Math.max(0, Math.min(im.h - h, Math.round(cy - h / 2))), cw = Math.min(w, im.w), ch = Math.min(h, im.h), data = new Uint8ClampedArray(cw * ch * 4); for (let y = 0; y < ch; y++) data.set(im.data.subarray(((y0 + y) * im.w + x0) * 4, ((y0 + y) * im.w + x0 + cw) * 4), y * cw * 4); return { w: cw, h: ch, data }; };
  let same = 0, differ = 0;
  for (const t of T.shots) {
    const n = N.shots.find(s => s.file === t.file); if (!n) continue;
    if (t.hash === n.hash && t.tick === n.tick) same++; else { differ++; console.warn(`${t.file}: the two looks are not the same instant (hash ${t.hash} tick ${t.tick} against ${n.hash} tick ${n.tick})`); }
    const a = decodePNG(readFileSync(join(OUT, 'today', t.file))), b = decodePNG(readFileSync(join(OUT, 'new', t.file)));
    // the scene's middle on the page (the canvas starts at the page's top left on every layout here), in device px
    const d = t.view.dpr, cx = (t.at.x - t.cam.x) * t.zoom * d, cy = (t.at.y - t.cam.y) * t.zoom * d, w = Math.min(a.w, 960), h = Math.min(a.h, 760);
    writeFileSync(join(OUT, 'pairs', t.file.replace('.png', '-crop.png')), encodePNG(beside(cut(a, cx, cy, w, h), cut(b, cx, cy, w, h))));
    if (/card|behind/.test(t.name)) writeFileSync(join(OUT, 'pairs', t.file.replace('.png', '-hud.png')), encodePNG(beside(cut(a, a.w / 2, a.h, Math.min(a.w, 1400), Math.min(a.h, 460)), cut(b, b.w / 2, b.h, Math.min(b.w, 1400), Math.min(b.h, 460)))));
  }
  console.log(`pairs: ${same} stills at the same instant in both looks, ${differ} not`);
}

/** The frame time with 100 Guards on screen: `endfall.draw()` 300 times in a row, the GPU made to finish, both looks. */
async function bench() {
  const res = {};
  for (const tag of ['today', 'new', 'today', 'new']) {
    const { ctx, page } = await staged(DEVICES.d1, tag);
    const r = await page.evaluate(([at]) => {
      const { G, engine } = endfall, ids = [];
      for (let i = 0; i < 100; i++) { const id = engine.debugSpawn(G.me, 'trooper', at.x - 300 + (i % 10) * 40, at.y - 200 + Math.floor(i / 10) * 36); if (id) ids.push(id); }
      const us = G.units.filter(u => ids.includes(u.id)); us.forEach((u, i) => engine.moveTo(u, u.x + Math.cos(i) * 300, u.y + Math.sin(i) * 300));
      endfall.cam.zoom = endfall.startZoom; endfall.centerOn(at.x - 120, at.y - 40);
      const gl = document.getElementById('game').getContext('webgl2') || document.getElementById('game').getContext('webgl'), px = new Uint8Array(4);
      const run = (n) => { const t0 = Date.now(); for (let i = 0; i < n; i++) { endfall.skip(1 / 30); window.tick(33); } gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return (Date.now() - t0) / n; };
      run(30); const shown = us.filter(u => { const c = endfall.cam, v = endfall.view; return u.x > c.x && u.x < c.x + v.w / c.zoom && u.y > c.y && u.y < c.y + v.h / c.zoom; }).length;
      return { ms: run(300), shown, renderer: gl.getParameter(gl.RENDERER) };
    }, [AT]);
    (res[tag] ||= []).push(r); console.log(tag, JSON.stringify(r));
    await ctx.close();
  }
  mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, 'bench.json'), JSON.stringify(res, null, 1));
}

if (flag('--sheet')) sheet();
else { await start(); try { if (flag('--bench')) await bench(); else await stills(); } finally { await stop(); } }
