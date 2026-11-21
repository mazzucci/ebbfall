// How the game looks on a desktop monitor against a landscape phone: one staged instant of one game, shot at several
// window sizes and start zooms, with a contact sheet. Copied from the span cap's capture (branch span-cap).
//   npm run build && node tools/view-capture.mjs [--out DIR] [--spans 1200,1000,900] [--name start]
// --out: where the shots, shots.json and sheet.png go (default ../ebbfall-article/desktop-start next to the repo).
// --spans: START_SPAN candidates (world px across a desktop window at the start); each size is shot at
//          max(clamp(view.w / span, 1, hi), zoomLimit) for hi 2.5, and for hi 2 too where that differs.
// The scene (seed 4242, the Kingdom against the Expedition, the AI off, the fog off). The page's clock is held before
// the game starts, so the main loop never steps: the world moves only by `endfall.skip`, each shot is drawn with
// `endfall.draw` (the HUD, then the map). Two instants:
//   start: the game's first instant, the camera as main.js's newGame sets it (startOn over the Castle) at each zoom;
//   fight: a fight a few tiles west of our Castle, 12 of ours box-selected through the UI (a mouse drag; on the phone
//          SELECT then a finger's drag), the camera centered on it.
// Every page is staged the same way and its state hash must match. A Knight's drawn height (render.js unitTop, the
// art's top above its feet) times the zoom, over the canvas's height, is its share of the view.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { start, stop, browserContext, baseUrl, board } from '../test/e2e/harness.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const root = fileURLToPath(new URL('..', import.meta.url));
const out = resolve(arg('--out', join(root, '../ebbfall-article/desktop-start')));
const SPANS = arg('--spans', '1200,1000,900').split(',').map(Number);
const SIZES = [[1440, 900], [1920, 1080], [2560, 1440]];
const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const ZOOM_MAX = 2.5;
const ARMIES = [{ knight: 6, lancer: 6 }, { umbra: 7, scythe: 3, shrike: 4 }];
const AT = { x: 1300, y: 1610 }; // (world px: near the fight; our Castle sits at 1728, 1728 on this map)
mkdirSync(out, { recursive: true });

/** The start zoom for a canvas w wide: START_SPAN `span`, the upper clamp `hi`, never under the zoom-out limit. */
const startZoom = (w, limit, span, hi) => Math.min(ZOOM_MAX, Math.max(Math.min(hi, Math.max(1, w / span)), limit));

/** A page with the game at its first instant (its clock held), on `device`. */
async function staged(device) {
  const ctx = await browserContext(device), page = await ctx.newPage(), errors = [];
  page.setDefaultTimeout(300000); // (a busy machine: software GL is slow to draw a 2560 px window)
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.install();
  await page.goto(`${baseUrl()}?seed=4242`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.endfall, null, { timeout: 120000 });
  const press = (sel) => device.hasTouch ? page.locator(sel).tap() : page.locator(sel).click();
  await press('#btnSolo');
  await board(page).race(1, 'vael');
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1000); // (from here no frame runs unless drawn)
  await press('#btnStart');
  await page.waitForFunction(() => window.endfall && endfall.G.units.length > 0, null, { polling: 100 });
  const first = await page.evaluate(() => {
    const { engine } = endfall; engine.disableAi(); engine.revealAll(true); endfall.fog(false);
    for (const t of document.querySelectorAll('#msg .toast')) t.remove();
    return { tick: endfall.G.tick ?? endfall.G.time, hash: engine.stateHash() >>> 0, zoom: endfall.cam.zoom, startZoom: endfall.startZoom };
  });
  await page.mouse.move(1, 1);
  return { ctx, page, errors, first };
}

/** Stage the fight and box-select our 12 through the UI. */
async function fight(page, touch) {
  const setup = await page.evaluate(([armies, at]) => {
    const { G, map, engine } = endfall, T = engine.TILE;
    const free = (x, y) => { const tx = Math.floor(x / T), ty = Math.floor(y / T); return engine.inMap(tx, ty) && !map.rock[engine.idx(tx, ty)] && !map.occ[engine.idx(tx, ty)]; };
    const field = { x: at.x - 160, y: at.y + 10 }, groups = [[], []];
    armies.forEach((army, seat) => {
      const dir = seat ? -1 : 1, kinds = Object.entries(army).flatMap(([k, n]) => Array(n).fill(k)); let k = 0;
      for (let col = 0; k < kinds.length && col < 12; col++) for (let row = -3; row <= 3 && k < kinds.length; row++) {
        const x = field.x + dir * (3 + col * 1.1) * T, y = field.y + row * 1.1 * T + (col % 2) * 0.5 * T;
        if (!engine.UNITS[kinds[k]].air && !free(x, y)) continue;
        const id = engine.debugSpawn(seat, kinds[k++], x, y); if (id) groups[seat].push(id);
      }
    });
    const of = (ids) => G.units.filter(u => ids.includes(u.id));
    engine.attackMoveGroup(of(groups[0]), field.x - 6 * T, field.y); engine.attackMoveGroup(of(groups[1]), field.x + 6 * T, field.y);
    endfall.skip(1.6); // (the fronts have met)
    G.events.length = 0; // (no bursts or sounds queued for a frame that never runs)
    for (const t of document.querySelectorAll('#msg .toast')) t.remove();
    const ours = of(groups[0]).filter(u => !u.dead), xs = ours.map(u => u.x), ys = ours.map(u => u.y);
    return { field, ours: ours.map(u => u.id), box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], tick: G.tick ?? G.time, hash: engine.stateHash() >>> 0 };
  }, [ARMIES, AT]);
  // the box round them, through the UI, at zoom 1 centered on them (on screen whole on every page)
  const [x0, y0, x1, y1] = setup.box, m = 26;
  const p = await page.evaluate(([x0, y0, x1, y1, m]) => {
    const { cam } = endfall; cam.zoom = 1; endfall.centerOn((x0 + x1) / 2, (y0 + y1) / 2 - 10); endfall.draw();
    const r = document.getElementById('game').getBoundingClientRect(), s = (x, y) => [r.left + (x - cam.x) * cam.zoom, r.top + (y - cam.y) * cam.zoom];
    return [...s(x0 - m, y0 - m - 40), ...s(x1 + m, y1 + m)];
  }, [x0, y0, x1, y1, m]);
  if (touch) {
    await page.locator('#btnBox').tap();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p[0], y: p[1] }] });
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p[0] + (p[2] - p[0]) * i / 6, y: p[1] + (p[3] - p[1]) * i / 6 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(p[0], p[1]); await page.mouse.down(); await page.mouse.move(p[2], p[3], { steps: 8 }); await page.mouse.up();
    await page.mouse.move(1, 1);
  }
  setup.selected = await page.evaluate(() => endfall.ui.sel.length);
  return setup;
}

/** Resize the page's window and wait until the stage (and so render.js view) has its new size. */
async function sizeTo(page, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForFunction(([w, h]) => {
    const r = document.getElementById('stage').getBoundingClientRect(), v = endfall.view;
    return innerWidth === w && innerHeight === h && v.w === Math.max(200, r.width | 0) && v.h === Math.max(160, r.height | 0);
  }, [w, h], { polling: 100 });
}

/** Draw the held instant at `zoom`: `start` the start's framing (main.js: startOn over the Castle), else centered on
 *  `at`; and shoot it. */
async function shoot(page, file, zoom, at) {
  const s = await page.evaluate(([z, at]) => {
    const { cam, view, G, engine } = endfall;
    cam.zoom = z;
    if (at) endfall.centerOn(at.x, at.y);
    else { // (render.js startOn, as main.js calls it)
      const core = G.bldgs.find(b => b.team === G.me); endfall.centerOn(core.x + 40, core.y);
      cam.x = Math.min(Math.max(cam.x, 0), Math.max(0, engine.WW - view.w / cam.zoom)); cam.y = Math.max(0, cam.y);
    }
    endfall.draw();
    const vw = view.w / cam.zoom, vh = view.h / cam.zoom, core = G.bldgs.find(b => b.team === G.me && b.d.hq);
    const knight = endfall.unitTop('knight') * cam.zoom, castle = { x: (core.x - cam.x) / vw, y: (core.y - cam.y) / vh };
    return { view: { w: view.w, h: view.h }, zoom: cam.zoom, zoomMin: endfall.zoomMin, startZoom: endfall.startZoom, seen: [vw, vh], knightPx: knight, knightShare: knight / view.h, knightWindow: knight / innerHeight, castle, castleSize: [core.w * 32 / vw, core.h * 32 / vh], tick: G.tick ?? G.time, hash: engine.stateHash() >>> 0, selected: endfall.ui.sel.length };
  }, [zoom, at]);
  await page.screenshot({ path: join(out, file), timeout: 300000 });
  console.log(`${file}: view ${s.view.w}x${s.view.h}, zoom ${s.zoom.toFixed(3)} (limit ${s.zoomMin.toFixed(3)}), ${Math.round(s.seen[0])} x ${Math.round(s.seen[1])} world px, Knight ${s.knightPx.toFixed(1)} px = ${(s.knightShare * 100).toFixed(1)}% of the canvas, ${s.selected} selected`);
  return { file, ...s };
}

/** The zooms to shoot for a page: each span at hi 2.5, and at hi 2 where that differs. */
function variants(view, limit) {
  const v = [];
  for (const span of SPANS) for (const hi of [2.5, 2]) {
    const zoom = startZoom(view.w, limit, span, hi);
    if (hi === 2 && v.some(x => x.span === span && Math.abs(x.zoom - zoom) < 1e-9)) continue;
    v.push({ span, hi, zoom });
  }
  return v;
}

await start();
const log = { at: AT, armies: ARMIES, shots: [], setups: {}, errors: [] };
try {
  {
    const { ctx, page, errors, first } = await staged({ viewport: { width: SIZES[0][0], height: SIZES[0][1] }, deviceScaleFactor: 1 });
    log.setups.desktop = { first };
    const plan = [];
    for (const [w, h] of SIZES) {
      await sizeTo(page, w, h);
      const v = await page.evaluate(() => ({ view: { ...endfall.view }, limit: endfall.zoomMin }));
      for (const x of variants(v.view, v.limit)) {
        const tag = `${w}x${h}-span${x.span}${x.hi === 2 ? '-clamp2' : ''}`;
        plan.push({ w, h, tag, ...x });
        log.shots.push({ kind: 'start', size: [w, h], ...x, ...(await shoot(page, `${tag}-start.png`, x.zoom, null)) });
      }
    }
    const f = await fight(page, false);
    log.setups.desktop.fight = f;
    for (const p of plan) {
      await sizeTo(page, p.w, p.h);
      log.shots.push({ kind: 'fight', size: [p.w, p.h], span: p.span, hi: p.hi, ...(await shoot(page, `${p.tag}-fight.png`, p.zoom, AT)) });
    }
    log.errors.push(...errors.map(e => `desktop: ${e}`));
    await ctx.close();
  }
  {
    const { ctx, page, errors, first } = await staged(PHONE);
    log.setups.phone = { first };
    log.shots.push({ kind: 'start', size: [844, 390], span: 0, phone: true, ...(await shoot(page, 'phone-844x390-start.png', 1, null)) });
    log.setups.phone.fight = await fight(page, true);
    log.shots.push({ kind: 'fight', size: [844, 390], span: 0, phone: true, ...(await shoot(page, 'phone-844x390-fight.png', 1, AT)) });
    log.errors.push(...errors.map(e => `phone: ${e}`));
    await ctx.close();
  }
  const same = (k) => Object.values(log.setups).map(s => `${s[k].tick}:${s[k].hash}`);
  log.sameWorld = { start: new Set(same('first')).size === 1, fight: new Set(same('fight')).size === 1 };

  // the contact sheet: a row per size, a column per variant; start above fight
  const ctx = await browserContext({ viewport: { width: 2400, height: 1000 }, deviceScaleFactor: 1 }), page = await ctx.newPage();
  const img = (f) => `data:image/png;base64,${readFileSync(join(out, f)).toString('base64')}`;
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const cap = (s) => `zoom ${s.zoom.toFixed(2)} · ${Math.round(s.seen[0])} × ${Math.round(s.seen[1])} world px · Knight ${pct(s.knightShare)} of the canvas`;
  const fig = (s, head) => `<figure><img src="${img(s.file)}"><figcaption><b>${head}</b> · ${cap(s)}</figcaption></figure>`;
  const phone = (k) => log.shots.find(s => s.phone && s.kind === k);
  const rows = SIZES.map(([w, h]) => {
    const own = log.shots.filter(s => !s.phone && s.size[0] === w && s.kind === 'start');
    const cells = (k) => own.map(s => fig(log.shots.find(t => t.kind === k && t.size[0] === w && t.span === s.span && t.hi === s.hi), `START_SPAN ${s.span}${s.hi === 2 ? ', clamp 2' : s.zoom > 2 ? ', clamp 2.5' : ''}`)).join('');
    return `<h2>${w} × ${h}</h2><div class="row" style="grid-template-columns:repeat(${own.length},1fr)">${cells('start')}</div><div class="row" style="grid-template-columns:repeat(${own.length},1fr)">${cells('fight')}</div>`;
  }).join('');
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 24px; background: #0b0f16; color: #e8e2d4; font: 15px/1.4 system-ui, sans-serif; width: 2352px; }
    h1 { font-size: 24px; margin: 0 0 4px; } p { margin: 0 0 16px; color: #b9b2a3; max-width: 1800px; } h2 { font-size: 18px; margin: 26px 0 6px; }
    .row { display: grid; gap: 12px; align-items: start; margin-bottom: 10px; } figure { margin: 0; } img { width: 100%; display: block; outline: 1px solid #444; }
    figcaption { margin-top: 4px; color: #cfc7b6; font-size: 13px; } .phone { display: grid; grid-template-columns: 844px 844px; gap: 16px; }</style>
    <h1>The desktop's start zoom: START_SPAN ${SPANS.join(', ')}</h1>
    <p>One staged game (seed 4242), the clock held. Top of each size: the game's first instant, framed as a game starts (startOn over the Castle). Below: a fight west of the Castle, 12 of ours box-selected through the UI, centered on world (${AT.x}, ${AT.y}). Zoom: max(clamp(view.w / START_SPAN, 1, hi), zoomLimit). DPR 1. A Knight's share: its drawn height (unitTop × zoom) over the canvas's height.</p>
    <h2>Landscape phone 844 × 390 (the reference: zoom 1)</h2>
    <div class="phone">${fig(phone('start'), 'start')}${fig(phone('fight'), 'fight')}</div>${rows}`);
  await page.waitForFunction(() => [...document.images].every(i => i.complete));
  await page.screenshot({ path: join(out, 'sheet.png'), fullPage: true, type: 'png' });
  console.log('sheet.png');
  await ctx.close();
} finally { await stop(); }
for (const s of log.shots) delete s.clip;
writeFileSync(join(out, 'shots.json'), JSON.stringify(log, null, 1));
console.log(JSON.stringify({ setups: log.setups, sameWorld: log.sameWorld, errors: log.errors }));
