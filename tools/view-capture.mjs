// How the game looks on a desktop monitor against a landscape phone: one staged instant of one game, shot at several
// window sizes and start zooms, with a contact sheet. Copied from the span cap's capture (branch span-cap).
//   npm run build && node tools/view-capture.mjs [--out DIR] [--spans 1200,1000,900]
//   node tools/view-capture.mjs --set edge --tag today|edge [--out DIR]   (ENDFALL_DIST=... names the build to shoot)
//   node tools/view-capture.mjs --set edge --sheet [--out DIR]
//   node tools/view-capture.mjs --set hud --tag main|pr [--out DIR]      (ENDFALL_DIST=... names the build to shoot)
//   node tools/view-capture.mjs --set hud --sheet [--out DIR]             (main beside pr, a row per still: sheet.png)
// --out: where the shots, shots.json and sheet.png go (default ../ebbfall-article/desktop-start next to the repo, or
//        ../ebbfall-article/desktop-edge for the edge set).
// --spans: START_SPAN candidates (world px across a desktop window at the start); each size is shot at
//          max(clamp(view.w / span, 1, hi), zoomLimit) for hi 2.5, and for hi 2 too where that differs.
// --set edge: the map edge to edge or not: each size (and 3440x1440) and the phone shot as the build at hand plays it,
//          tagged (--tag): the start, the bottom-left and top-right corners all the way out (the camera pushed past
//          them: what shows past the map's edge), and the fight; --sheet then lays the two tags side by side.
// --set hud: the desktop HUD's stills (../ebbfall-article/hud-pr/<tag>/): another scene, a base at about four minutes
//          with a raid met beyond its ridge and the whole army of twelve selected through the UI (Q; ARMY on the phone):
//          1920x1080, 1440x900, 2560x1440-dpr2 (a 1280x720 window at DPR 2), phone-844x390 (DPR 2, touch), the melee
//          close up (closeup-1920, closeup-dpr2), and at 1440x900 one unit selected (a click) and the Barracks with a
//          queue (its buttons clicked). Every still at the start zoom of its window, the same world (one state hash).
// --set ground: the ground options' stills (../ebbfall-article/ground-options/<today|option-N>/): --ground N shoots the
//          build with ?ground=N (0, the default: today's ground). The hud set's scene on the 96x96 Dust Quarter
//          (?map=7&seed=1291: the random 96 map with the fixed map's seed, so the seat is fixed too), its fight in open
//          ground toward the middle. 1920x1080: the start, the fight (the army selected), the zoom-out limit, the whole
//          map (a tools-only zoom, the HUD hidden, a 1536x1536 window), the fog on, the minimap; the fight at 2560x1440
//          (DPR 2) and on the phone (DPR 2); the whole map of a second seed and of a 128x128 map. --only a,b: some
//          stills only (start fight out whole fog minimap retina phone seed2 big). --sheet: today beside each option.
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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { start, stop, browserContext, baseUrl, board } from '../test/e2e/harness.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const root = fileURLToPath(new URL('..', import.meta.url));
const SET = arg('--set', 'start'), TAG = arg('--tag', 'today');
const out = resolve(arg('--out', join(root, { edge: '../ebbfall-article/desktop-edge', hud: '../ebbfall-article/hud-pr', ground: '../ebbfall-article/ground-options' }[SET] || '../ebbfall-article/desktop-start')));
const SPANS = arg('--spans', '1200,1000,900').split(',').map(Number);
const SIZES = SET === 'edge' ? [[1440, 900], [1920, 1080], [2560, 1440], [3440, 1440]] : [[1440, 900], [1920, 1080], [2560, 1440]];
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
    cam.zoom = z ?? endfall.zoomMin;
    if (at) endfall.centerOn(at.x, at.y); // (a corner: a point far past it, the camera clamped there)
    else { // (render.js startOn, as main.js calls it)
      const core = G.bldgs.find(b => b.team === G.me); endfall.centerOn(core.x + 40, core.y);
      cam.x = Math.min(Math.max(cam.x, 0), Math.max(0, engine.WW - view.w / cam.zoom)); cam.y = Math.max(0, cam.y);
    }
    endfall.draw();
    const vw = view.w / cam.zoom, vh = view.h / cam.zoom, core = G.bldgs.find(b => b.team === G.me && b.d.hq);
    const knight = endfall.unitTop('knight') * cam.zoom, castle = { x: (core.x - cam.x) / vw, y: (core.y - cam.y) / vh };
    return { view: { w: view.w, h: view.h }, cam: { x: cam.x, y: cam.y }, map: [engine.WW, engine.WH], zoom: cam.zoom, zoomMin: endfall.zoomMin, startZoom: endfall.startZoom, seen: [vw, vh], knightPx: knight, knightShare: knight / view.h, knightWindow: knight / innerHeight, castle, castleSize: [core.w * 32 / vw, core.h * 32 / vh], tick: G.tick ?? G.time, hash: engine.stateHash() >>> 0, selected: endfall.ui.sel.length };
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

if (SET === 'edge') { await edgeSet(); process.exit(0); }
if (SET === 'hud') { await hudSet(); process.exit(0); }
if (SET === 'ground') { await groundSet(); process.exit(0); }
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

/** The edge set: the build at hand (ENDFALL_DIST) at each size and on the phone, tagged; or --sheet: both tags. */
async function edgeSet() {
  const CORNERS = { 'corner-bl': { x: -1e5, y: 1e5 }, 'corner-tr': { x: 1e5, y: -1e5 } };
  if (process.argv.includes('--sheet')) return edgeSheet(CORNERS);
  await start();
  const log = { tag: TAG, dist: process.env.ENDFALL_DIST || 'dist', shots: [], setups: {}, errors: [] };
  try {
    const run = async (device, sizes, name) => {
      const { ctx, page, errors, first } = await staged(device);
      log.setups[name] = { first };
      const plan = [];
      for (const [w, h] of sizes) {
        if (!device.hasTouch) await sizeTo(page, w, h);
        const z = await page.evaluate(() => endfall.startZoom);
        plan.push([w, h, z]);
        log.shots.push({ kind: 'start', size: [w, h], ...(await shoot(page, `${TAG}-${w}x${h}-start.png`, z, null)) });
        for (const [k, at] of Object.entries(CORNERS)) log.shots.push({ kind: k, size: [w, h], ...(await shoot(page, `${TAG}-${w}x${h}-${k}.png`, null, at)) });
      }
      log.setups[name].fight = await fight(page, !!device.hasTouch);
      for (const [w, h, z] of plan) {
        if (!device.hasTouch) await sizeTo(page, w, h);
        log.shots.push({ kind: 'fight', size: [w, h], ...(await shoot(page, `${TAG}-${w}x${h}-fight.png`, z, AT)) });
      }
      log.errors.push(...errors.map(e => `${name}: ${e}`));
      await ctx.close();
    };
    await run({ viewport: { width: SIZES[0][0], height: SIZES[0][1] }, deviceScaleFactor: 1 }, SIZES, 'desktop');
    await run(PHONE, [[844, 390]], 'phone');
  } finally { await stop(); }
  writeFileSync(join(out, `shots-${TAG}.json`), JSON.stringify(log, null, 1));
  console.log(JSON.stringify({ setups: log.setups, errors: log.errors }));
}

/** Today next to edge to edge, a row per size and shot. */
async function edgeSheet(CORNERS) {
  const logs = Object.fromEntries(['today', 'edge'].map(t => [t, JSON.parse(readFileSync(join(out, `shots-${t}.json`), 'utf8'))]));
  await start();
  try {
    const ctx = await browserContext({ viewport: { width: 2000, height: 1000 }, deviceScaleFactor: 1 }), page = await ctx.newPage();
    const img = (f) => f; // (beside sheet.html: 40 inline PNGs crashed the page)
    const past = (s) => { const l = -s.cam.x, t = -s.cam.y, r = s.cam.x + s.seen[0] - s.map[0], b = s.cam.y + s.seen[1] - s.map[1]; return [['left', l], ['top', t], ['right', r], ['bottom', b]].filter(([, v]) => v > 0.5).map(([k, v]) => `${k} ${Math.round(v * s.zoom)} px`).join(', ') || 'none'; };
    const fig = (s, head) => s ? `<figure><img src="${img(s.file)}"><figcaption><b>${head}</b> · zoom ${s.zoom.toFixed(2)} · canvas ${s.view.w} × ${s.view.h} · ${Math.round(s.seen[0])} × ${Math.round(s.seen[1])} world px · past the map: ${past(s)}</figcaption></figure>` : '<figure></figure>';
    const kinds = ['start', ...Object.keys(CORNERS), 'fight'], label = { start: 'the start', 'corner-bl': 'bottom-left corner, all the way out', 'corner-tr': 'top-right corner, all the way out', fight: 'the fight, 12 selected' };
    const sizes = [...SIZES, [844, 390]];
    const rows = sizes.map(([w, h]) => `<h2>${w === 844 ? 'Landscape phone ' : ''}${w} × ${h}</h2>` + kinds.map(k => {
      const at = (t) => logs[t].shots.find(s => s.kind === k && s.size[0] === w && s.size[1] === h);
      return `<div class="row">${fig(at('today'), `today · ${label[k]}`)}${fig(at('edge'), `edge to edge · ${label[k]}`)}</div>`;
    }).join('')).join('');
    writeFileSync(join(out, 'sheet.html'), `<!doctype html><meta charset="utf-8"><style>
      body { margin: 0; padding: 24px; background: #0b0f16; color: #e8e2d4; font: 15px/1.4 system-ui, sans-serif; width: 1952px; }
      h1 { font-size: 24px; margin: 0 0 4px; } p { margin: 0 0 16px; color: #b9b2a3; max-width: 1700px; } h2 { font-size: 18px; margin: 28px 0 6px; }
      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; margin-bottom: 10px; } figure { margin: 0; } img { max-width: 100%; display: block; outline: 1px solid #444; }
      figcaption { margin-top: 4px; color: #cfc7b6; font-size: 13px; }</style>
      <h1>Edge to edge on a desktop: today (left) and this PR (right)</h1>
      <p>One staged game (seed 4242, the fog off), the clock held. Each window: the start as the game frames it; the camera pushed past the bottom-left and the top-right corners all the way out (the most it shows past the map's edge); the fight with 12 selected through the UI. "Past the map" is how far the canvas shows beyond the map's edge, in screen px (today: the dark; edge to edge: the rock apron, only at the top under the bar and at the foot behind the panels).</p>${rows}`);
    await page.goto(pathToFileURL(join(out, 'sheet.html')).href);
    await page.waitForFunction(() => [...document.images].every(i => i.complete));
    await page.screenshot({ path: join(out, 'sheet.png'), fullPage: true, type: 'png' });
    console.log('sheet.png');
    await ctx.close();
  } finally { await stop(); }
}

/** In the page (the hud set): a base at about four minutes, a raid met beyond its ridge, the fight a few seconds in.
 *  Returns the world points the stills are framed on. */
function hudStage(auto) {
  const e = window.endfall, { G, engine: eng } = e, me = G.me, T = eng.TILE;
  const foe = G.factions.findIndex((_, t) => t !== me);
  const hq = G.bldgs.find(b => b.team === me && eng.BUILDINGS[b.type].hq);
  const mid = { x: eng.MW * 16, y: eng.MH * 16 }, len = Math.hypot(mid.x - hq.x, mid.y - hq.y);
  const dir = { x: (mid.x - hq.x) / len, y: (mid.y - hq.y) / len }, side = { x: -dir.y, y: dir.x };
  const at = (f, s = 0) => ({ x: hq.x + dir.x * f + side.x * s, y: hq.y + dir.y * f + side.y * s });
  const spawn = (team, kind, p) => eng.debugSpawn(team, kind, p.x, p.y);
  const workers = () => G.units.filter(u => u.team === me && eng.UNITS[u.type].worker);
  const place = (type, near) => {
    const d = eng.BUILDINGS[type], tx0 = Math.round(near.x / T - d.w / 2), ty0 = Math.round(near.y / T - d.h / 2);
    for (let r = 0; r < 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !eng.canPlace(type, tx0 + dx, ty0 + dy, me)) continue;
      const w = workers().find(u => u.task.t === 'idle') || workers()[0];
      try { eng.placeBuilding(me, type, tx0 + dx, ty0 + dy, w); return true; } catch { /* refused: the next spot */ }
    }
    return false;
  };
  const mine = () => { const m = e.map.nodes.filter(n => n.amount > 0).sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y))[0]; for (const w of workers()) if (w.task.t === 'idle') eng.startGather(w, m); return m; };
  eng.disableAi();
  mine(); e.setResources(me, 5000, 0);
  for (let i = 0; i < 5; i++) spawn(me, 'harvester', at(-60, (i - 2) * 30));
  // (scouts: Villagers set down round the base walk home to the mine, so the minimap has seen ground round it)
  const open = (p, rx = 0, ry = 0) => { for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) { const tx = Math.floor(p.x / T) + x, ty = Math.floor(p.y / T) + y; if (!eng.inMap(tx, ty) || e.map.rock[eng.idx(tx, ty)] || e.map.occ[eng.idx(tx, ty)]) return false; } return true; };
  if (auto) { for (const [f, s] of [[900, 200], [800, 700], [300, 950], [1100, -150], [600, 400], [150, 600], [1000, 500], [500, -200]]) if (open(at(f, s))) spawn(me, 'harvester', at(f, s)); }
  else for (const [dx, dy] of [[-900, -200], [-800, -700], [-300, -950], [-1100, 150], [-600, -400], [-150, -600], [-1000, -500], [-500, 200]]) spawn(me, 'harvester', { x: hq.x + dx, y: hq.y + dy });
  place('depot', at(-150, -170)); place('depot', at(-170, 150)); place('barracks', at(190, -190));
  e.skip(70); place('forge', at(-70, 250)); place('depot', at(-230, -40)); place('airfield', at(170, 230));
  e.skip(75); place('turret', at(330, 40)); place('depot', at(-240, 70)); place('depot', at(-60, -260));
  e.skip(75); mine();
  let field = { x: hq.x - 400, y: hq.y - 350 }; // (open grass beyond the ridge, up and left of the Castle)
  if (auto) { // (the ground set: the open ground nearest the line to the map's middle, some 500 px out)
    const spots = []; for (const f of [520, 440, 600, 680]) for (const s of [0, 120, -120, 240, -240, 360, -360, 480, -480]) spots.push([Math.abs(s) + Math.abs(f - 520) / 2, at(f, s)]);
    field = (spots.sort((a, b) => a[0] - b[0]).find(([, p]) => open(p, 9, 5)) || spots[0])[1];
  }
  const rows = (kinds, team, sign) => kinds.map((k, i) => {
    const col = Math.floor(i / 4), row = (i % 4) - 1.5, x = field.x + sign * (48 + col * 50), y = field.y + row * 62 + (col % 2) * 22;
    return { id: spawn(team, k, { x, y }), y };
  });
  const ours = rows(['knight', 'knight', 'knight', 'knight', 'trooper', 'trooper', 'trooper', 'trooper', 'lancer', 'lancer', 'lancer', 'lancer'], me, 1);
  const theirs = rows(['umbra', 'umbra', 'umbra', 'prism', 'prism', 'prism', 'prism', 'bruiser', 'scythe', 'scythe', 'shrike', 'shrike'], foe, -1);
  const unit = (id) => G.units.find(u => u.id === id);
  for (const o of ours) eng.attackMove(unit(o.id), field.x - 260, o.y);
  for (const o of theirs) eng.attackMove(unit(o.id), field.x + 260, o.y);
  const of = (ids) => G.units.filter(u => ids.includes(u.id));
  e.skip(3.4); // (the fronts have met: some hurt, none of ours dead)
  e.setResources(me, 385, 0);
  G.events.length = 0; // (no bursts or sounds queued for a frame that never runs)
  for (const el of document.querySelectorAll('#msg .toast')) el.remove();
  const alive = of(ours.map(o => o.id)).filter(u => !u.dead), cx = alive.reduce((s, u) => s + u.x, 0) / alive.length, cy = alive.reduce((s, u) => s + u.y, 0) / alive.length;
  const own = (type) => { const k = G.bldgs.find(x => x.team === me && x.type === type); return k && { x: k.x, y: k.y, done: k.done }; };
  return { hq: { x: hq.x, y: hq.y }, field, army: { x: cx, y: cy }, alive: [alive.length, of(theirs.map(o => o.id)).filter(u => !u.dead).length], time: G.time, hash: eng.stateHash() >>> 0, barracks: own('barracks') };
}

/** The hud set: the build at hand (ENDFALL_DIST) at each size, the phone, the close-ups and two states, into <out>/<tag>. */
async function hudSet() {
  if (process.argv.includes('--sheet')) return hudSheet();
  const dir = join(out, TAG); mkdirSync(dir, { recursive: true });
  const desk = (w, h, dpr = 1) => ({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const PHONE2 = { ...PHONE, deviceScaleFactor: 2 };
  const log = { tag: TAG, dist: process.env.ENDFALL_DIST || 'dist', setups: {}, shots: [], errors: [] };
  const page0 = async (device) => {
    const ctx = await browserContext(device), page = await ctx.newPage(), errors = [];
    page.setDefaultTimeout(300000);
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
    await page.evaluate(() => document.fonts.ready);
    const setup = await page.evaluate(hudStage);
    await page.evaluate(() => endfall.draw());
    if (device.hasTouch) await page.locator('#btnArmy').tap(); else await page.keyboard.press('q');
    await page.mouse.move(2, 300); // (the pointer off the panels)
    setup.selected = await page.evaluate(() => endfall.ui.sel.length);
    return { ctx, page, errors, setup };
  };
  // the fight, pulled a little toward the base so both show
  const aim = (s) => ({ x: s.field.x * 0.66 + s.hq.x * 0.34, y: s.field.y * 0.76 + s.hq.y * 0.24 });
  const still = async (page, file, at) => {
    const s = await page.evaluate(([at]) => {
      const { cam, view } = endfall; cam.zoom = endfall.startZoom; endfall.centerOn(at.x, at.y); endfall.draw(); endfall.draw();
      for (const t of document.querySelectorAll('.toast')) t.style.animation = 'none'; // (a toast fades by the wall clock: whole in every still)
      return { view: { w: view.w, h: view.h }, zoom: cam.zoom, hash: endfall.engine.stateHash() >>> 0, selected: endfall.ui.sel.length };
    }, [at]);
    await page.screenshot({ path: join(dir, file), timeout: 300000 });
    console.log(`${TAG}/${file}: view ${s.view.w}x${s.view.h}, zoom ${s.zoom.toFixed(2)}, ${s.selected} selected`);
    log.shots.push({ file, ...s });
  };
  const closeup = async (page, file, s, w, h) => {
    const r = await page.evaluate(([p]) => {
      const { cam } = endfall; cam.zoom = endfall.startZoom; endfall.centerOn(p.x, p.y - 20); endfall.draw(); endfall.draw();
      return { x: (p.x - cam.x) * cam.zoom, y: (p.y - 20 - cam.y) * cam.zoom };
    }, [s.army]);
    await page.screenshot({ path: join(dir, file), clip: { x: Math.round(r.x - w / 2), y: Math.round(r.y - h / 2), width: w, height: h }, timeout: 300000 });
    console.log(`${TAG}/${file}`);
  };
  const toScreen = (page, p) => page.evaluate(([p]) => { const { cam } = endfall; return { x: (p.x - cam.x) * cam.zoom, y: (p.y - cam.y) * cam.zoom }; }, [p]);
  await start();
  try {
    {
      const { ctx, page, errors, setup } = await page0(desk(1920, 1080));
      log.setups.desk = setup; const at = aim(setup);
      for (const [w, h] of [[1920, 1080], [1440, 900]]) { await sizeTo(page, w, h); await still(page, `${w}x${h}.png`, at); }
      await sizeTo(page, 1920, 1080); await closeup(page, 'closeup-1920.png', setup, 960, 600);
      await sizeTo(page, 1440, 900);
      // one unit: a click on the Knight nearest the base (the least crowded)
      const knight = await page.evaluate(([hq]) => { const { G } = endfall, k = G.units.filter(u => u.team === G.me && u.type === 'knight' && !u.dead).sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y))[0]; return { x: k.x, y: k.y - endfall.unitTop('knight') / 3 }; }, [setup.hq]);
      await page.evaluate(([at]) => { endfall.cam.zoom = endfall.startZoom; endfall.centerOn(at.x, at.y); endfall.draw(); }, [at]);
      const k = await toScreen(page, knight); await page.mouse.click(k.x, k.y); await page.mouse.move(2, 300);
      await still(page, '1440x900--one-unit.png', at);
      // a building with a queue: the Barracks, its first button three times and its second once
      const base = { x: setup.hq.x * 0.5 + setup.barracks.x * 0.5, y: setup.hq.y * 0.5 + setup.barracks.y * 0.5 + 40 };
      await page.evaluate(([at]) => { endfall.setResources(endfall.G.me, 2000, 0); endfall.centerOn(at.x, at.y); endfall.draw(); }, [base]);
      const b = await toScreen(page, setup.barracks); await page.mouse.click(b.x, b.y); await page.evaluate(() => endfall.draw());
      const train = page.locator('#cmd .cb:not(.gap):not(.cancel)');
      await train.nth(0).click(); await train.nth(0).click(); await page.evaluate(() => endfall.draw()); await train.nth(1).click(); await train.nth(0).click();
      await page.evaluate(() => { endfall.skip(6); endfall.G.events.length = 0; for (const el of document.querySelectorAll('#msg .toast')) el.remove(); });
      await page.mouse.move(2, 300);
      await still(page, '1440x900--queue.png', base);
      log.errors.push(...errors.map(e => `desk: ${e}`)); await ctx.close();
    }
    {
      const { ctx, page, errors, setup } = await page0(desk(1280, 720, 2));
      log.setups.retina = setup;
      await still(page, '2560x1440-dpr2.png', aim(setup));
      await closeup(page, 'closeup-dpr2.png', setup, 640, 400);
      log.errors.push(...errors.map(e => `retina: ${e}`)); await ctx.close();
    }
    {
      const { ctx, page, errors, setup } = await page0(PHONE2);
      log.setups.phone = setup;
      await still(page, 'phone-844x390.png', { x: setup.army.x, y: setup.army.y + 10 });
      log.errors.push(...errors.map(e => `phone: ${e}`)); await ctx.close();
    }
  } finally { await stop(); }
  const hashes = Object.values(log.setups).map(s => `${s.time}:${s.hash}`);
  log.sameWorld = hashes.every(h => h === hashes[0]);
  writeFileSync(join(dir, 'shots.json'), JSON.stringify(log, null, 1));
  console.log(JSON.stringify({ setups: log.setups, sameWorld: log.sameWorld, errors: log.errors }));
}

/** The hud set's sheet: main (left) beside the PR (right), a row per still, as sheet.html beside the folders and sheet.png. */
async function hudSheet() {
  const files = ['1920x1080.png', '1440x900.png', '2560x1440-dpr2.png', 'phone-844x390.png', 'closeup-1920.png', 'closeup-dpr2.png', '1440x900--one-unit.png', '1440x900--queue.png'];
  const rows = files.map(f => `<h2>${f.replace('.png', '')}</h2><div class="row"><figure><img src="main/${f}"><figcaption>main</figcaption></figure><figure><img src="pr/${f}"><figcaption>this PR</figcaption></figure></div>`).join('');
  writeFileSync(join(out, 'sheet.html'), `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 24px; background: #0b0f16; color: #e8e2d4; font: 15px/1.4 system-ui, sans-serif; width: 2352px; }
    h1 { font-size: 24px; margin: 0 0 4px; } p { margin: 0 0 16px; color: #b9b2a3; } h2 { font-size: 18px; margin: 26px 0 6px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; } figure { margin: 0; } img { width: 100%; display: block; outline: 1px solid #444; }
    figcaption { margin-top: 4px; color: #cfc7b6; font-size: 13px; }</style>
    <h1>The desktop HUD: main (left) and this PR (right)</h1>
    <p>One staged instant (seed 4242, 3:43, the AI off), the army of 12 selected with Q (ARMY on the phone); every still at its window's start zoom.</p>${rows}`);
  await start();
  try {
    const ctx = await browserContext({ viewport: { width: 2400, height: 1000 }, deviceScaleFactor: 1 }), page = await ctx.newPage();
    await page.goto(pathToFileURL(join(out, 'sheet.html')).href);
    await page.waitForFunction(() => [...document.images].every(i => i.complete));
    await page.screenshot({ path: join(out, 'sheet.png'), fullPage: true, type: 'png' });
    console.log('sheet.png');
    await ctx.close();
  } finally { await stop(); }
}

/** The ground set: the build at hand (ENDFALL_DIST) with ?ground=N, into <out>/<today|option-N>. */
async function groundSet() {
  if (process.argv.includes('--sheet')) return groundSheet();
  const N = +arg('--ground', 0), name = N ? `option-${N}` : 'today', dir = join(out, name); mkdirSync(dir, { recursive: true });
  const only = arg('--only', '').split(',').filter(Boolean), want = (...k) => !only.length || k.some(x => only.includes(x));
  const desk = (w, h, dpr = 1) => ({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const log = { ground: N, dist: process.env.ENDFALL_DIST || 'dist', setups: {}, shots: [], errors: [], paint: {} };
  const page0 = async (device, tag, { map = 7, seed = 1291, stage = true } = {}) => {
    const ctx = await browserContext(device), page = await ctx.newPage(), errors = [];
    page.setDefaultTimeout(300000);
    page.on('pageerror', e => errors.push(e.message));
    await page.clock.install();
    await page.goto(`${baseUrl()}?map=${map}&seed=${seed}${N ? `&ground=${N}` : ''}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall, null, { timeout: 120000 });
    const press = (sel) => device.hasTouch ? page.locator(sel).tap() : page.locator(sel).click();
    await press('#btnSolo');
    await board(page).race(1, 'vael');
    await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1000); // (from here no frame runs unless drawn)
    await press('#btnStart');
    await page.waitForFunction(() => window.endfall && endfall.G.units.length > 0, null, { polling: 100 });
    await page.evaluate(() => document.fonts.ready);
    const first = await page.evaluate(() => {
      const { engine } = endfall; engine.disableAi(); engine.revealAll(true); endfall.fog(false);
      for (const t of document.querySelectorAll('#msg .toast')) t.remove();
      return { seed: endfall.G.seed, size: [engine.MW, engine.MH], hash: engine.stateHash() >>> 0, paint: window.endfallGround ?? null, terrainMs: window.endfallTerrainMs ?? null };
    });
    log.paint[tag] = first.paint; log.setups[tag] = { first };
    await page.mouse.move(2, 300);
    const stageIt = async () => {
      const setup = await page.evaluate(hudStage, true);
      await page.evaluate(() => endfall.draw());
      if (device.hasTouch) await page.locator('#btnArmy').tap(); else await page.keyboard.press('q');
      await page.mouse.move(2, 300);
      setup.selected = await page.evaluate(() => endfall.ui.sel.length);
      log.setups[tag].fight = setup;
      return setup;
    };
    return { ctx, page, errors, tag, stageIt, done: async () => { log.errors.push(...errors.map(e => `${tag}: ${e}`)); await ctx.close(); } };
  };
  /** A still: zoom `z` ('start', 'min' or a number), centered on `at` (null: the start's framing). */
  const still = async (page, file, z, at, crop = false) => {
    const s = await page.evaluate(([z, at]) => {
      const { cam, view, G, engine } = endfall;
      cam.zoom = z === 'start' ? endfall.startZoom : z === 'min' ? endfall.zoomMin : z;
      if (at) endfall.centerOn(at.x, at.y);
      else { const core = G.bldgs.find(b => b.team === G.me); endfall.centerOn(core.x + 40, core.y); cam.x = Math.min(Math.max(cam.x, 0), Math.max(0, engine.WW - view.w / cam.zoom)); cam.y = Math.max(0, cam.y); }
      endfall.draw(); endfall.draw();
      for (const t of document.querySelectorAll('.toast')) t.style.animation = 'none';
      return { view: { w: view.w, h: view.h }, zoom: cam.zoom, hash: engine.stateHash() >>> 0, selected: endfall.ui.sel.length };
    }, [z, at]);
    await page.screenshot({ path: join(dir, file), timeout: 300000 });
    // (a piece of it at 1:1, as a player's eye meets it: the middle, or --crop x,y,w,h in CSS px)
    const cr = arg('--crop', '') ? arg('--crop').split(',').map(Number) : [Math.round(s.view.w * 0.22), Math.round(s.view.h * 0.2), Math.round(s.view.w * 0.5), Math.round(s.view.h * 0.5)];
    if (crop) await page.screenshot({ path: join(dir, file.replace('.png', '--crop.png')), clip: { x: cr[0], y: cr[1], width: cr[2], height: cr[3] }, timeout: 300000 });
    console.log(`${name}/${file}: view ${s.view.w}x${s.view.h}, zoom ${s.zoom.toFixed(3)}, ${s.selected} selected`);
    log.shots.push({ file, ...s });
  };
  /** The whole map: the HUD hidden, a square window, a zoom under the game's limit (tools only: the camera set by hand). */
  const whole = async (page, file, px = 1536) => {
    await page.evaluate(() => { for (const el of document.querySelectorAll('#hud, #top, #msg')) el.style.visibility = 'hidden'; }); // (the CSSOM: the page's CSP allows no inline style sheet)
    await sizeTo(page, px, px);
    const s = await page.evaluate(() => {
      const { cam, view, engine } = endfall; cam.zoom = Math.min(view.w / engine.WW, view.h / engine.WH); cam.x = (engine.WW - view.w / cam.zoom) / 2; cam.y = (engine.WH - view.h / cam.zoom) / 2;
      endfall.draw(); const got = { zoom: cam.zoom, x: cam.x, y: cam.y }; endfall.draw();
      return { view: { w: view.w, h: view.h }, ...got, after: { zoom: cam.zoom, x: cam.x, y: cam.y } };
    });
    await page.locator('#game').screenshot({ path: join(dir, file), timeout: 300000 });
    console.log(`${name}/${file}: zoom ${s.zoom.toFixed(3)} (after the draw ${s.after.zoom.toFixed(3)}, camera ${Math.round(s.after.x)}, ${Math.round(s.after.y)})`);
    log.shots.push({ file, ...s });
  };
  const aim = (s) => ({ x: s.field.x * 0.66 + s.hq.x * 0.34, y: s.field.y * 0.76 + s.hq.y * 0.24 });
  await start();
  try {
    if (want('start', 'fight', 'out', 'whole', 'fog', 'minimap', 'probe')) {
      const p = await page0(desk(1920, 1080), 'desk');
      if (want('start') && !only.includes('probe')) await still(p.page, '1-start-1920x1080.png', 'start', null, true);
      if (only.includes('probe')) { const [x, y] = arg('--at', '1500,1500').split(',').map(Number); await still(p.page, `probe-${x}-${y}.png`, 'start', { x, y }); } // (a look at one spot, unstaged)
      else if (only.length && !want('fight', 'out', 'fog', 'minimap')) { if (want('whole')) await whole(p.page, '6-whole-map.png'); } // (a quick look: unstaged)
      else {
        const setup = await p.stageIt(), at = aim(setup);
        if (want('fight')) await still(p.page, '2-fight-1920x1080.png', 'start', at, true);
        if (want('out')) await still(p.page, '5-zoomed-out-1920x1080.png', 'min', at);
        if (want('minimap')) { await p.page.evaluate(() => endfall.draw()); await p.page.locator('#minimap').screenshot({ path: join(dir, '8-minimap.png') }); }
        if (want('fog')) {
          await p.page.evaluate(() => { endfall.engine.revealAll(false); endfall.fog(true); });
          await still(p.page, '7-fog-1920x1080.png', 'start', { x: setup.hq.x * 0.5 + setup.field.x * 0.5, y: setup.hq.y * 0.5 + setup.field.y * 0.5 });
          await p.page.locator('#minimap').screenshot({ path: join(dir, '8-minimap-fog.png') });
          await p.page.evaluate(() => { endfall.engine.revealAll(true); endfall.fog(false); });
        }
        if (want('whole')) await whole(p.page, '6-whole-map.png');
      }
      await p.done();
    }
    if (want('retina')) { const p = await page0(desk(1280, 720, 2), 'retina'); await still(p.page, '3-fight-2560x1440-dpr2.png', 'start', aim(await p.stageIt())); await p.done(); }
    if (want('phone')) { const p = await page0({ ...PHONE, deviceScaleFactor: 2 }, 'phone'); const s = await p.stageIt(); await still(p.page, '4-fight-phone-844x390.png', 'start', { x: s.army.x, y: s.army.y + 10 }); await p.done(); }
    if (want('seed2')) { const p = await page0(desk(1536, 1536), 'seed2', { seed: 2026 }); await whole(p.page, '9-seed-2026-whole-map.png'); await p.done(); }
    if (want('big')) { const p = await page0(desk(1536, 1536), 'big', { map: 11, seed: 5 }); await whole(p.page, '10-map-128-whole-map.png'); await p.done(); }
  } finally { await stop(); }
  const prev = (() => { try { return JSON.parse(readFileSync(join(dir, 'shots.json'), 'utf8')); } catch { return null; } })();
  if (prev && only.length) { log.shots = [...prev.shots.filter(s => !log.shots.some(t => t.file === s.file)), ...log.shots]; log.setups = { ...prev.setups, ...log.setups }; log.paint = { ...prev.paint, ...log.paint }; }
  writeFileSync(join(dir, 'shots.json'), JSON.stringify(log, null, 1));
  console.log(JSON.stringify({ setups: log.setups, paint: log.paint, errors: log.errors }));
}
