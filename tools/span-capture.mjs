// The span cap (branch span-cap, an experiment, no PR): how much map a window shows at its zoom-out limit, today
// (ZOOM_MIN) and with the cap, at desktop sizes and a landscape phone; and the game's box on very large windows.
//   npm run build && node tools/span-capture.mjs [--out DIR] [--art DIR] [--spans 1600,1800] [--boxes 1440,1800]
// --out: where the shots, shots.json and the contact sheets go (default ../ebbfall-article/span-cap next to the repo).
// --art: a folder laid out like public/art/ (atlas.json and its pages) served in place of the built game's art, to
//        shoot the same instant with another atlas; files it lacks come from dist/art/.
// The rules (the prototype in src/client/gl/render.js and src/client/box.js, both off unless the URL asks):
//   ?span=S   the zoom-out limit max(ZOOM_MIN, view.w / S, view.h / (S * 9 / 16)); the start max(startZoom, limit)
//   ?box=WxH  the game's box: the window's aspect capped at 2.4, no taller than H (W x H is its 16:9 size), centered
// Set A (no box): each size at ZOOM_MIN (today) and at each span's limit, the zoom set here by the same formula.
// Set B (?box and ?span from the URL, a page per pair): each very large window at the page's own limit.
// The scene (seed 4242, the Kingdom against the Expedition, the AI off, the fog off): a fight a few tiles west of our
// Castle, the camera centered on one world point, one of our Knights selected (the command card shows). The page's
// clock is held before the game starts, so the main loop never steps: the world moves only by `endfall.skip`, each shot
// is drawn with `endfall.draw` (the HUD, then the map). Every page is staged the same way and its state hash must match.
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { start, stop, browserContext, baseUrl, board } from '../test/e2e/harness.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const root = fileURLToPath(new URL('..', import.meta.url));
const out = resolve(arg('--out', join(root, '../ebbfall-article/span-cap')));
const art = arg('--art', null) && resolve(arg('--art'));
const SPANS = arg('--spans', '1600,1800').split(',').map(Number);
const BOXES = arg('--boxes', '1440,1800').split(',').map(h => [Math.round(+h * 16 / 9), +h]);
const SET_A = [[1440, 900], [1920, 1080], [2560, 1440], [3440, 1440]];
const SET_B = [[3840, 2160], [5120, 1440], [3440, 1440]];
const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const ZOOM_MIN = 0.75, START_SPAN = 1200;
const ARMIES = [{ lancer: 8, knight: 8 }, { umbra: 7, scythe: 3, shrike: 4 }];
const AT = { x: 1300, y: 1610 }; // (world px: the camera's center; our Castle sits at 1728, 1728 on this map)
mkdirSync(out, { recursive: true });

/** The rule: the zoom-out limit and the start for a canvas of w x h (CSS px); span 0: today's. */
function rule(w, h, span, coarse = false) {
  const limit = span ? Math.max(ZOOM_MIN, w / span, h / (span * 9 / 16)) : ZOOM_MIN;
  const today = coarse ? 1 : Math.min(2, Math.max(1, w / START_SPAN));
  return { limit, start: Math.max(today, limit), startToday: today };
}

const MIME = { '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg' };
/** A page with the game at the staged instant (its clock held), on `device`, the URL's query `q`. */
async function staged(device, q = '') {
  const ctx = await browserContext(device), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (art) await page.route(/\/art\//, (route) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname.replace(/^.*?\/art\//, '')), f = join(art, rel);
    return existsSync(f) ? route.fulfill({ body: readFileSync(f), contentType: MIME[extname(f)] || 'application/octet-stream' }) : route.continue();
  });
  await page.clock.install();
  await page.goto(`${baseUrl()}?seed=4242${q}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.endfall, null, { timeout: 120000 });
  const press = (sel) => device.hasTouch ? page.locator(sel).tap() : page.locator(sel).click();
  await press('#btnSolo');
  await board(page).race(1, 'vael');
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1000); // (from here no frame runs unless drawn)
  await press('#btnStart');
  await page.waitForFunction(() => window.endfall && endfall.G.units.length > 0, null, { polling: 100 });
  const startCam = await page.evaluate(() => ({ zoom: endfall.cam.zoom, startZoom: endfall.startZoom, zoomMin: endfall.zoomMin, view: { ...endfall.view } }));
  const setup = await page.evaluate(([armies, at]) => {
    const { G, map, engine } = endfall, T = engine.TILE;
    engine.disableAi(); engine.revealAll(true); endfall.fog(false);
    const free = (x, y) => { const tx = Math.floor(x / T), ty = Math.floor(y / T); return engine.inMap(tx, ty) && !map.rock[engine.idx(tx, ty)] && !map.occ[engine.idx(tx, ty)]; };
    const field = { x: at.x - 260, y: at.y + 10 }, groups = [[], []]; // (the fight: west of the camera's center)
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
    endfall.skip(2.4); // (the fronts have met)
    G.events.length = 0; // (no bursts or sounds queued for a frame that never runs)
    for (const t of document.querySelectorAll('#msg .toast')) t.remove();
    // the Knight to select: ours, alive, the farthest from the front (the least crowded)
    const knight = of(groups[0]).filter(u => u.type === 'knight' && !u.dead).sort((a, b) => b.x - a.x || a.id - b.id)[0];
    return { field, spawned: groups.map(g => g.length), alive: groups.map(g => of(g).filter(u => !u.dead).length), knight: knight?.id, tick: G.tick ?? G.time, hash: engine.stateHash() >>> 0, map: [engine.WW, engine.WH] };
  }, [ARMIES, AT]);
  // select the Knight with a click (a tap on the phone) on it, as a player would
  const p = await page.evaluate((id) => {
    const { G, cam } = endfall, u = G.units.find(u => u.id === id); cam.zoom = 1.5; endfall.centerOn(u.x, u.y); endfall.draw();
    const r = document.getElementById('game').getBoundingClientRect();
    return { x: r.left + (u.x - cam.x) * cam.zoom, y: r.top + (u.y - endfall.unitTop(u.type) / 3 - cam.y) * cam.zoom };
  }, setup.knight);
  if (device.hasTouch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
  setup.selected = await page.evaluate(() => endfall.ui.sel.map(e => `${e.type}#${e.id}`));
  await page.mouse.move(1, 1); // (the pointer off the map)
  return { ctx, page, errors, setup, startCam };
}

/** Resize the page's window and wait until the stage (and so render.js view) has its new size. */
async function sizeTo(page, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForFunction(([w, h]) => {
    const r = document.getElementById('stage').getBoundingClientRect(), v = endfall.view, boxed = document.documentElement.classList.contains('boxed');
    return innerWidth === w && innerHeight === h && v.w === Math.max(200, r.width | 0) && v.h === Math.max(160, r.height | 0) && (boxed || r.width > w - 40);
  }, [w, h], { polling: 100 });
}

/** Draw the held instant at `zoom` (null: the page's own limit), centered on AT, and shoot it. */
async function shoot(page, file, zoom) {
  const s = await page.evaluate(([z, at]) => {
    const { cam, view } = endfall; cam.zoom = z ?? endfall.zoomMin; endfall.centerOn(at.x, at.y); endfall.draw();
    const vw = view.w / cam.zoom, vh = view.h / cam.zoom, app = document.getElementById('app').getBoundingClientRect();
    return { view: { w: view.w, h: view.h }, box: [Math.round(app.width), Math.round(app.height)], zoom: cam.zoom, zoomMin: endfall.zoomMin, startZoom: endfall.startZoom, cam: { x: cam.x, y: cam.y }, seen: [vw, vh], center: [cam.x + vw / 2, cam.y + vh / 2], tick: endfall.G.tick ?? endfall.G.time, hash: endfall.engine.stateHash() >>> 0, selected: endfall.ui.sel.length };
  }, [zoom, AT]);
  const b = await page.locator('#game').boundingBox(), clip = await page.screenshot({ clip: { x: b.x + 48, y: b.y + 48, width: b.width - 96, height: b.height - 96 } });
  if (file) {
    await page.screenshot({ path: join(out, file), timeout: 300000 });
    console.log(`${file}: box ${s.box.join('x')}, view ${s.view.w}x${s.view.h}, zoom ${s.zoom.toFixed(3)} (page's limit ${s.zoomMin.toFixed(3)}, start ${s.startZoom.toFixed(3)}), ${Math.round(s.seen[0])} x ${Math.round(s.seen[1])} world px, center ${s.center.map(Math.round)}`);
  }
  return { file, ...s, clip };
}
const keep = (s) => { delete s.clip; return s; };

for (const f of ['5120x1440-zoommin.png', '5120x1440-span1600.png', '5120x1440-span1800.png', '_check.png']) rmSync(join(out, f), { force: true }); // (superseded: the zoom-in rule that let 5120 pass 2.5)
await start();
const log = { at: AT, armies: ARMIES, art, shots: [], setups: {}, errors: [] };
try {
  // Set A: one page, resized
  {
    const first = { viewport: { width: SET_A[0][0], height: SET_A[0][1] }, deviceScaleFactor: 1 };
    const { ctx, page, errors, setup } = await staged(first);
    log.setups.desktop = setup;
    let firstClip = null; // (the map inside the canvas, 48 px in from its edges: the page's CSS animations round it run on)
    for (const [w, h] of SET_A) {
      await sizeTo(page, w, h);
      const v = await page.evaluate(() => ({ ...endfall.view }));
      const before = await shoot(page, `${w}x${h}-zoommin.png`, ZOOM_MIN);
      firstClip ??= before.clip;
      log.shots.push({ set: 'A', size: [w, h], span: 0, ...keep(before), rule: rule(v.w, v.h, 0) });
      for (const span of SPANS) log.shots.push({ set: 'A', size: [w, h], span, ...keep(await shoot(page, `${w}x${h}-span${span}.png`, rule(v.w, v.h, span).limit)), rule: rule(v.w, v.h, span) });
    }
    await sizeTo(page, ...SET_A[0]); // (the held instant: the first shot again must be the same frame)
    const again = await shoot(page, null, ZOOM_MIN);
    log.heldStill = { sameMap: firstClip.equals(again.clip), tick: [setup.tick, again.tick], hash: [setup.hash, again.hash] };
    log.errors.push(...errors.map(e => `desktop: ${e}`));
    await ctx.close();
  }
  // the phone: its own page
  {
    const { ctx, page, errors, setup, startCam } = await staged(PHONE, `&span=${SPANS[0]}`);
    log.setups.phone = setup;
    const v = await page.evaluate(() => ({ ...endfall.view })), r = rule(v.w, v.h, SPANS[0], true);
    log.shots.push({ set: 'phone', size: [844, 390], span: SPANS[0], ...keep(await shoot(page, 'phone-844x390-limit.png', null)), rule: r, startCam });
    log.errors.push(...errors.map(e => `phone: ${e}`));
    await ctx.close();
  }
  // Set B: a page per box and span, resized
  for (const [bw, bh] of BOXES) for (const span of SPANS) {
    const [w0, h0] = SET_B[0];
    const { ctx, page, errors, setup, startCam } = await staged({ viewport: { width: w0, height: h0 }, deviceScaleFactor: 1 }, `&span=${span}&box=${bw}x${bh}`);
    log.setups[`box${bw}x${bh}-span${span}`] = { ...setup, startCam };
    for (const [w, h] of SET_B) {
      await sizeTo(page, w, h);
      const v = await page.evaluate(() => ({ ...endfall.view }));
      log.shots.push({ set: 'B', size: [w, h], span, maxBox: [bw, bh], ...keep(await shoot(page, `${w}x${h}-span${span}-box${bw}x${bh}.png`, null)), rule: rule(v.w, v.h, span) });
    }
    log.errors.push(...errors.map(e => `box ${bw}x${bh} span ${span}: ${e}`));
    await ctx.close();
  }
  const hashes = Object.values(log.setups).map(s => `${s.tick}:${s.hash}`);
  log.sameWorld = hashes.every(h => h === hashes[0]);

  // contact sheets, one per span
  const ctx = await browserContext({ viewport: { width: 1900, height: 1000 }, deviceScaleFactor: 1 }), page = await ctx.newPage();
  const img = (f) => `data:image/png;base64,${readFileSync(join(out, f)).toString('base64')}`;
  const cap = (s) => `zoom ${s.zoom.toFixed(2)} · ${Math.round(s.seen[0])} × ${Math.round(s.seen[1])} world px`;
  const fig = (s, head) => `<figure><img src="${img(s.file)}"><figcaption><b>${head}</b> · ${cap(s)}${s.set === 'B' ? ` · box ${s.box.join(' × ')}` : ''}${s.span ? ` · start ${s.startZoom.toFixed(2)}` : ''}</figcaption></figure>`;
  const phone = log.shots.find(s => s.set === 'phone');
  for (const span of SPANS) {
    const a = SET_A.map(([w, h]) => {
      const before = log.shots.find(s => s.set === 'A' && s.file === `${w}x${h}-zoommin.png`), after = log.shots.find(s => s.set === 'A' && s.file === `${w}x${h}-span${span}.png`);
      return `<h2>${w} × ${h}</h2><div class="row">${fig(before, 'today, ZOOM_MIN')}${fig(after, `MAX_SPAN ${span}`)}</div>`;
    }).join('');
    const b = SET_B.map(([w, h]) => `<h2>${w} × ${h} window</h2><div class="row">${BOXES.map(([bw, bh]) => fig(log.shots.find(s => s.set === 'B' && s.file === `${w}x${h}-span${span}-box${bw}x${bh}.png`), `max box ${bw} × ${bh}`)).join('')}</div>`).join('');
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body { margin: 0; padding: 24px; background: #0b0f16; color: #e8e2d4; font: 15px/1.4 system-ui, sans-serif; width: 1852px; }
      h1 { font-size: 24px; margin: 0 0 4px; } p { margin: 0 0 16px; color: #b9b2a3; max-width: 1500px; } h2 { font-size: 17px; margin: 22px 0 6px; }
      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; } figure { margin: 0; } img { width: 100%; display: block; outline: 1px solid #444; }
      figcaption { margin-top: 4px; color: #cfc7b6; } .phone img { width: 844px; } hr { border: 0; border-top: 1px solid #333; margin: 32px 0 8px; }</style>
      <h1>Zoom-out limit: today vs MAX_SPAN ${span}</h1>
      <p>Every shot is the same instant of one staged game, centered on world (${AT.x}, ${AT.y}) through the game's own centerOn (clamped at the map's edges), a Knight selected. DPR 1, map 2048 × 2048 world px. Left: today's ZOOM_MIN 0.75. Right: max(0.75, view.w / ${span}, view.h / ${+(span * 9 / 16).toFixed(1)}).</p>
      <h2>Landscape phone 844 × 390 (reference: its own limit, ZOOM_MIN 0.75 with or without the cap)</h2>
      <figure class="phone"><img src="${img(phone.file)}"><figcaption>${cap(phone)}</figcaption></figure>${a}
      <hr><h1>Very large windows: the game's box (MAX_SPAN ${span})</h1>
      <p>The box: the window's aspect capped at 2.4 (a 3440 × 1440 "21:9" monitor is 2.39), no taller than the max box's height, centered on the menu's floor with a thin frame; the HUD, the minimap and the corner inside it. The zoom: the page's own limit for the box.</p>${b}`);
    await page.waitForFunction(() => [...document.images].every(i => i.complete));
    await page.screenshot({ path: join(out, `sheet-span${span}.png`), fullPage: true, type: 'png' });
    console.log(`sheet-span${span}.png`);
  }
  await ctx.close();
} finally { await stop(); }
writeFileSync(join(out, 'shots.json'), JSON.stringify(log, null, 1));
console.log(JSON.stringify({ setups: log.setups, heldStill: log.heldStill, sameWorld: log.sameWorld, errors: log.errors }));
