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
  const s = await p.page.evaluate(([z, at, hud]) => {
    const { cam, engine } = endfall;
    for (const el of document.querySelectorAll('#hud, #top, #msg')) el.style.visibility = hud ? '' : 'hidden';
    cam.zoom = z === 'start' ? endfall.startZoom : z === 'min' ? endfall.zoomMin : z;
    endfall.centerOn(at.x, at.y); endfall.draw(); endfall.draw();
    for (const t of document.querySelectorAll('.toast')) t.style.animation = 'none';
    return { zoom: cam.zoom, cam: [Math.round(cam.x), Math.round(cam.y)], hash: engine.stateHash() >>> 0, tick: endfall.G.tick, land: endfall.ground?.()?.land ?? null };
  }, [zoom, at, hud]);
  await p.page.screenshot({ path: join(OUT, file), timeout: 300000, ...(clip ? { clip } : {}) });
  console.log(`${file}: zoom ${s.zoom.toFixed(2)}, hash ${s.hash}${p.errors.length ? `, ${p.errors.length} page messages` : ''}`);
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
