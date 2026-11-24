// Stills and numbers of the new look's land (`?art=new`) from a built game (npm run build, with public/art/new built:
// ENDFALL_DIST names another build), in headless Chromium, service workers blocked. Nothing is written under the repo:
// --out names the folder (default ../ebbfall-article/new-art/land beside the repo). The game is staged as
// tools/view-capture.mjs stages it: the page's clock held before the game starts, the world moved only by
// `endfall.skip`, each shot drawn by `endfall.draw`; the state hash is logged with every shot, so a still of today's
// art and one of the new are the same instant.
//   node tools/newart/land/capture.mjs look --art new --map 7 --seed 1291 --at 1500,900 [--zoom 1.5] [--size 1920x1080]
//        [--dpr 1] [--cap 1] [--fog] [--name x] [--shots "name:x,y:zoom;..."]   stills of a spot (or of several)
//   node tools/newart/land/capture.mjs set                           the delivery's stills (shots.json beside them)
//   node tools/newart/land/capture.mjs perf                          frame, load and memory numbers (perf.json)
// Run it under the machine's Chrome lock: flock /tmp/claude-1000/ebbfall-lab.lock node tools/newart/land/capture.mjs ...
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { start, stop, browserContext, baseUrl, board } from '../../../test/e2e/harness.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);
const root = fileURLToPath(new URL('../../../', import.meta.url));
const OUT = resolve(arg('--out', join(root, '../ebbfall-article/new-art/land')));
const MODE = process.argv[2] || 'set';
mkdirSync(OUT, { recursive: true });

const DESK = (w, h, dpr = 1) => ({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
/** The three windows of every pair of stills. */
const VIEWS = { 'desk-1920x1080': DESK(1920, 1080), 'retina-1728x1000-dpr2': DESK(1728, 1000, 2), 'phone-844x390-dpr2': PHONE };

/** A page with a game at its first instant, its clock held: `art` 'new' or 'today', `map` the menu's map index,
 *  `seed`, `cap` the land's cap (tiles) or null. */
async function staged(device, { art = 'new', map = 7, seed = 1291, cap = null } = {}) {
  const ctx = await browserContext({ ...device, serviceWorkers: 'block' }), page = await ctx.newPage(), errors = [];
  if (device.hasTouch) await ctx.addInitScript(() => { Element.prototype.requestFullscreen = () => Promise.reject(new Error('(no full screen)')); });
  page.setDefaultTimeout(300000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') errors.push(`${m.type()}: ${m.text()}`); });
  await page.clock.install();
  const t0 = Date.now();
  await page.goto(`${baseUrl()}?map=${map}&seed=${seed}${art === 'new' ? '&art=new' : ''}${cap ? `&landcap=${cap}` : ''}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.endfall, null, { timeout: 120000 });
  const loaded = Date.now() - t0;
  const press = (sel) => device.hasTouch ? page.locator(sel).tap() : page.locator(sel).click();
  await press('#btnSolo');
  await board(page).race(1, 'vael');
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1000);
  await press('#btnStart');
  await page.waitForFunction(() => window.endfall && endfall.G.units.length > 0, null, { polling: 100 });
  await page.evaluate(() => document.fonts.ready);
  const first = await page.evaluate(() => {
    const { engine } = endfall; engine.disableAi(); engine.revealAll(true); endfall.fog(false);
    for (const t of document.querySelectorAll('#msg .toast')) t.remove();
    return { seed: endfall.G.seed, size: [engine.MW, engine.MH], hash: engine.stateHash() >>> 0, ground: endfall.ground?.() ?? null };
  });
  await page.mouse.move(2, 300);
  return { ctx, page, errors, first, loaded, touch: !!device.hasTouch };
}

/** Draw the held instant at `zoom` ('start', 'min' or a number) centered on `at` (world px), and shoot it. */
async function still(p, file, zoom, at, { hud = true, clip = null } = {}) {
  const s = await p.page.evaluate(([z, at, hud, probe]) => {
    const { cam, engine } = endfall;
    for (const el of document.querySelectorAll('#hud, #top, #msg')) el.style.visibility = hud ? '' : 'hidden';
    cam.zoom = z === 'start' ? endfall.startZoom : z === 'min' ? endfall.zoomMin : z;
    endfall.centerOn(at.x, at.y); endfall.draw(); endfall.draw();
    for (const t of document.querySelectorAll('.toast')) t.style.animation = 'none';
    // (--probe x,y,w,h: the mean color of that piece of the map's canvas, CSS px, read in the frame's own task)
    let mean = null;
    if (probe) { const cv = document.getElementById('game'), k = cv.width / cv.clientWidth, c = new OffscreenCanvas(probe[2] * k, probe[3] * k).getContext('2d'); c.drawImage(cv, -probe[0] * k, -probe[1] * k); const d = c.getImageData(0, 0, probe[2] * k, probe[3] * k).data; mean = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) for (let q = 0; q < 3; q++) mean[q] += d[i + q] / (d.length / 4); mean = mean.map(Math.round); }
    return { zoom: cam.zoom, cam: [Math.round(cam.x), Math.round(cam.y)], hash: engine.stateHash() >>> 0, tick: endfall.G.tick, mean, land: endfall.ground?.()?.land ?? null };
  }, [zoom, at, hud, has('--probe') ? arg('--probe').split(',').map(Number) : null]);
  await p.page.screenshot({ path: join(OUT, file), timeout: 300000, ...(clip ? { clip } : {}) });
  console.log(`${file}: zoom ${s.zoom.toFixed(2)}, hash ${s.hash}${s.mean ? `, mean ${s.mean}` : ''}${p.errors.length ? `, ${p.errors.length} page messages` : ''}`);
  return { file, ...s };
}

if (MODE === 'look') {
  const [w, h] = arg('--size', '1920x1080').split('x').map(Number), [x, y] = arg('--at', '1500,1500').split(',').map(Number);
  const device = has('--phone') ? PHONE : DESK(w, h, +arg('--dpr', 1)), z = arg('--zoom', 'start');
  await start();
  try {
    const p = await staged(device, { art: arg('--art', 'new'), map: +arg('--map', 7), seed: +arg('--seed', 1291), cap: arg('--cap', null) });
    if (has('--fog')) await p.page.evaluate(() => { endfall.engine.revealAll(false); endfall.fog(true); });
    // (--shots "name:x,y:zoom;...": several stills of the one page)
    const shots = has('--shots') ? arg('--shots').split(';').map(t => t.split(':')).map(([n, at, zz]) => [n, at.split(',').map(Number), zz ?? z]) : [[arg('--name', 'look'), [x, y], z]];
    const done = [];
    for (const [n, [sx, sy], zz] of shots) done.push(await still(p, `${n}.png`, isNaN(+zz) ? zz : +zz, { x: sx, y: sy }, { hud: !has('--nohud'), clip: has('--clip') ? (([x, y, width, height]) => ({ x, y, width, height }))(arg('--clip').split(',').map(Number)) : null }));
    console.log(JSON.stringify({ first: { ...p.first, ground: undefined }, loaded: p.loaded, land: done[0].land, errors: p.errors }));
  } finally { await stop(); }
}

// ---- the delivery's stills ----
// The scene (the 96x96 map of seed 1291, the Kingdom against the Expedition, the AI off, the fog off): `start`, the
// game's first instant over our Castle; `edge`, a fight on the open cells along a forest's north side (ours and theirs
// spawned there, 1.2 s played, ours selected through the UI: Q, ARMY on the phone), a Cottage's ghost held beside the
// trees. Every page is staged the same way: the hashes in shots.json must match between today's art and the new.
const EDGE = { at: { x: 1424, y: 2070 }, row: 65, cols: [40, 47], ghost: { type: 'depot', tx: 47, ty: 63 } };
async function edge(p) {
  const setup = await p.page.evaluate((E) => {
    const { G, map, engine } = endfall, T = engine.TILE, me = G.me, foe = G.factions.findIndex((_, s) => s !== me);
    const free = (tx, ty) => engine.inMap(tx, ty) && !map.rock[engine.idx(tx, ty)] && !map.occ[engine.idx(tx, ty)];
    const ours = [], theirs = [];
    // (ours along the forest's edge, on the cells' south halves, where a crown may reach; theirs a little north and west)
    for (let tx = E.cols[0]; tx <= E.cols[1]; tx++) for (let ty = E.row + 1; ty >= E.row - 1; ty--) if (free(tx, ty) && !free(tx, ty + 1)) { const id = engine.debugSpawn(me, tx % 3 ? 'trooper' : 'knight', (tx + 0.5) * T, (ty + 0.8) * T); if (id) ours.push(id); break; }
    for (let k = 0; k < 6; k++) { const tx = E.cols[0] + 1 + k, ty = E.row - 2 + (k % 2); if (free(tx, ty)) { const id = engine.debugSpawn(foe, k % 2 ? 'umbra' : 'scythe', (tx + 0.5) * T, (ty + 0.4) * T); if (id) theirs.push(id); } }
    for (const [dx, dy] of [[2, 1], [5, 1]]) { const id = engine.debugSpawn(foe, 'umbra', (E.cols[0] + dx + 0.5) * T, (E.row + dy - 0.3) * T); if (id) theirs.push(id); } // (two of theirs at the trees too)
    endfall.skip(1.2); G.events.length = 0;
    for (const t of document.querySelectorAll('#msg .toast')) t.remove();
    return { ours: ours.length, theirs: theirs.length, tick: G.tick, hash: engine.stateHash() >>> 0 };
  }, EDGE);
  await p.page.evaluate(() => endfall.draw());
  if (p.touch) await p.page.locator('#btnArmy').tap(); else await p.page.keyboard.press('q');
  await p.page.mouse.move(2, 300);
  setup.selected = await p.page.evaluate((g) => { endfall.ui.place = g; return endfall.ui.sel.length; }, EDGE.ghost);
  return setup;
}
const castle = (p) => p.page.evaluate(() => { const b = endfall.G.bldgs.find(b => b.team === endfall.G.me && b.d.hq); return { x: b.x + 40, y: b.y }; });

if (MODE === 'set') {
  const only = arg('--only', '').split(',').filter(Boolean), want = (k) => !only.length || only.includes(k);
  const log = { shots: [], setups: {}, errors: [] };
  const done = async (p, tag) => { log.errors.push(...p.errors.filter(e => !/Service Worker|already has key/.test(e)).map(e => `${tag}: ${e}`)); await p.ctx.close(); };
  await start();
  try {
    if (want('pairs')) for (const [view, device] of Object.entries(VIEWS)) for (const art of ['today', 'new']) { // today beside new, the same instants
      const p = await staged(device, { art }), tag = `${view}-${art}`;
      log.shots.push(await still(p, `start-${tag}.png`, 'start', await castle(p)));
      log.setups[tag] = { first: p.first.hash, edge: await edge(p) };
      log.shots.push(await still(p, `edge-${tag}.png`, 'start', EDGE.at));
      if (view.startsWith('phone')) log.shots.push(await still(p, `edge-zoom075-${tag}.png`, 0.75, EDGE.at));
      await done(p, tag);
    }
    if (want('caps')) for (const cap of [0.5, 1, 2]) for (const [view, device] of [['desk-1920x1080', VIEWS['desk-1920x1080']], ['phone-844x390-dpr2', PHONE]]) { // the canopy's cap: the PM's choice
      const p = await staged(device, { cap }), tag = `cap${cap}-${view}`;
      log.setups[tag] = { edge: await edge(p) };
      log.shots.push(await still(p, `${tag}.png`, view.startsWith('phone') ? 1 : 'start', EDGE.at));
      await done(p, tag);
    }
    if (want('more')) {
      let p = await staged(VIEWS['desk-1920x1080']); // the fog on; the hill; the zoom-out limit
      log.setups.fog = { edge: await edge(p) };
      await p.page.evaluate(() => { endfall.engine.revealAll(false); endfall.fog(true); });
      log.shots.push(await still(p, 'fog-desk-1920x1080-new.png', 'start', await castle(p)));
      await p.page.evaluate(() => { endfall.engine.revealAll(true); endfall.fog(false); endfall.ui.place = null; });
      log.shots.push(await still(p, 'hill-desk-1920x1080-new.png', 'start', { x: 1560, y: 860 }));
      log.shots.push(await still(p, 'out-desk-1920x1080-new.png', 'min', { x: 1500, y: 1500 }));
      await done(p, 'more');
      for (const [name, map, seed, at] of [['seed2026', 7, 2026, { x: 1500, y: 1500 }], ['map128-warrens', 10, 2, { x: 2000, y: 2000 }], ['lake', 13, 1, { x: 1000, y: 1000 }]]) for (const art of ['today', 'new']) { // other maps and seeds
        p = await staged(VIEWS['desk-1920x1080'], { art, map, seed });
        log.shots.push(await still(p, `${name}-desk-1920x1080-${art}.png`, 'min', at));
        if (art === 'new' && name === 'lake') log.shots.push(await still(p, `${name}-shore-desk-1920x1080-new.png`, 'start', { x: 1000, y: 1200 }));
        await done(p, `${name}-${art}`);
      }
    }
  } finally { await stop(); }
  const file = join(OUT, 'shots.json'), prev = existsSync(file) && only.length ? JSON.parse(readFileSync(file, 'utf8')) : null;
  if (prev) { log.shots = [...prev.shots.filter(s => !log.shots.some(t => t.file === s.file)), ...log.shots]; log.setups = { ...prev.setups, ...log.setups }; log.errors = [...prev.errors, ...log.errors]; }
  writeFileSync(file, JSON.stringify(log, null, 1));
  console.log(JSON.stringify({ setups: log.setups, errors: log.errors }));
}

// ---- one frame time and memory note each ----
// The clock runs here (no staging): a game started, the camera over our base and then over the forest's edge with the
// fight's units, the frames of three seconds timed by requestAnimationFrame. Headless Chromium draws with SwiftShader
// (a CPU): the numbers say how today's art and the new compare on this machine, not what a phone's GPU does.
if (MODE === 'perf') {
  const out = {};
  await start();
  try {
    for (const [view, device] of [['desk-1920x1080', VIEWS['desk-1920x1080']], ['phone-844x390-dpr2', PHONE]]) for (const art of ['today', 'new']) {
      const ctx = await browserContext({ ...device, serviceWorkers: 'block' }), page = await ctx.newPage();
      if (device.hasTouch) await ctx.addInitScript(() => { Element.prototype.requestFullscreen = () => Promise.reject(new Error('(no full screen)')); });
      page.setDefaultTimeout(300000);
      await page.goto(`${baseUrl()}?map=11&seed=5${art === 'new' ? '&art=new' : ''}`, { waitUntil: 'networkidle' }); // (a 128x128 map: the largest)
      await page.waitForFunction(() => !!window.endfall, null, { timeout: 120000 });
      const press = (sel) => device.hasTouch ? page.locator(sel).tap() : page.locator(sel).click();
      await press('#btnSolo'); await press('#btnStart');
      await page.waitForFunction(() => window.endfall && endfall.G.units.length > 0, null, { polling: 100 });
      const r = await page.evaluate(async () => {
        const { engine } = endfall; engine.disableAi(); engine.revealAll(true); endfall.fog(false);
        const frames = async (ms) => { const t = []; await new Promise(res => { const f = (now) => { t.push(now); if (now - t[0] < ms) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); const d = t.slice(1).map((v, i) => v - t[i]).sort((a, b) => a - b); return { n: d.length, median: +d[d.length >> 1].toFixed(1), p90: +d[Math.floor(d.length * 0.9)].toFixed(1) }; };
        const base = await frames(3000);
        // (the most land on a screen: a point the camera finds by the most blocked cells round it)
        const { map } = endfall, W = engine.MW, H = engine.MH; let best = null;
        for (let y = 12; y < H - 12; y += 4) for (let x = 20; x < W - 20; x += 4) { let k = 0, o = 0; for (let dy = -8; dy <= 8; dy++) for (let dx = -14; dx <= 14; dx++) { if (map.rock[(y + dy) * W + x + dx]) k++; else o++; } const s = Math.min(k, o); if (!best || s > best.s) best = { s, x, y, k }; }
        endfall.centerOn(best.x * 32, best.y * 32);
        const me = endfall.G.me; let n = 0;
        for (let dy = -6; dy <= 6 && n < 40; dy++) for (let dx = -10; dx <= 10 && n < 40; dx++) { const tx = best.x + dx, ty = best.y + dy; if (!map.rock[ty * W + tx] && map.rock[(ty + 1) * W + tx] && !map.occ[ty * W + tx]) { if (engine.debugSpawn(me, 'trooper', (tx + 0.5) * 32, (ty + 0.8) * 32)) n++; } }
        await frames(500);
        const land = await frames(3000);
        return { base, land, units: n, rockOnScreen: best.k, ground: endfall.ground(), heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, zoom: endfall.cam.zoom };
      });
      out[`${view}-${art}`] = r; console.log(`${view} ${art}: ${JSON.stringify(r)}`);
      await ctx.close();
    }
  } finally { await stop(); }
  writeFileSync(join(OUT, 'perf.json'), JSON.stringify(out, null, 1));
}

// ---- fix batch 1: the foot line, the minimap's ground, the mine's square ----
//   node tools/newart/land/capture.mjs fix1 [--out DIR]     today beside new: the hill with its one-cell rocks and a
//   mine, the start by the map's edge, the minimap; on the phone the hill at zoom 1 and 0.75, and the fog on.
if (MODE === 'fix1') {
  const log = { shots: [], errors: [] }, HILL = { x: 1560, y: 860 };
  await start();
  try {
    for (const art of ['today', 'new']) {
      let p = await staged(VIEWS['desk-1920x1080'], { art });
      log.shots.push(await still(p, `hill-desk-1920x1080-${art}.png`, 'start', HILL));
      log.shots.push(await still(p, `edge-desk-1920x1080-${art}.png`, 'start', await castle(p)));
      await p.page.locator('#minimap').screenshot({ path: join(OUT, `minimap-desk-${art}.png`) });
      log.errors.push(...p.errors.filter(e => !/Service Worker|already has key/.test(e)).map(e => `desk ${art}: ${e}`)); await p.ctx.close();
      p = await staged(PHONE, { art });
      log.shots.push(await still(p, `hill-phone-844x390-dpr2-${art}.png`, 1, HILL));
      log.shots.push(await still(p, `hill-zoom075-phone-844x390-dpr2-${art}.png`, 0.75, HILL));
      await p.page.locator('#minimap').screenshot({ path: join(OUT, `minimap-phone-${art}.png`) });
      await p.page.evaluate(() => { endfall.engine.revealAll(false); endfall.fog(true); });
      log.shots.push(await still(p, `fog-zoom075-phone-844x390-dpr2-${art}.png`, 0.75, await castle(p)));
      log.errors.push(...p.errors.filter(e => !/Service Worker|already has key/.test(e)).map(e => `phone ${art}: ${e}`)); await p.ctx.close();
    }
  } finally { await stop(); }
  writeFileSync(join(OUT, 'shots.json'), JSON.stringify(log, null, 1));
  console.log(JSON.stringify(log.errors));
}
