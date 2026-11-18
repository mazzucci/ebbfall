// The docs' screenshots and gameplay clip, staged in the real game (the built dist/: run `npm run build` first) in
// headless Chromium (tools/chromium.mjs), like tools/og.mjs: a fixed map and seed, the AI off, units set out through the
// debug handle, the fog layer hidden, at the start zoom, 2x. Written as WebP at desktop and phone size into
// public/docs/img/shots/, and tools/docs/shots.json with each shot's size, words and the boxes the annotated ones mark
// (the top bar, the minimap, the command card, ...: tools/docs/pages.mjs puts the numbered notes beside them) and what
// the notes must not cover (`avoid`: the top bar, the sprites on the map). The clip
// (public/docs/media/trailer.*, with its poster, its middle frame) is a few seconds of Archers against Drones, stepped
// frame by frame in the game: the trailer replaces it by taking its file name. Output is committed; run after the art or the HUD changes:
//   node tools/docs/shots.mjs [name ...]      (default: every shot and the clip; `clip` names the clip)
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../chromium.mjs';

const root = new URL('../../', import.meta.url);
const dist = fileURLToPath(new URL('dist/', root));
const OUT = new URL('public/docs/img/shots/', root), MEDIA = new URL('public/docs/media/', root);
const MANIFEST = new URL('tools/docs/shots.json', root);
const only = process.argv.slice(2);
if (!existsSync(join(dist, 'index.html'))) throw new Error('shots: dist/ is missing: run npm run build first');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.webp': 'image/webp' };
const server = createServer((req, res) => {
  let p = normalize(join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!p.startsWith(dist)) { res.writeHead(403); return res.end(); }
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}/`;

const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 };
const PHONE_LAND = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
/** What never shows in a docs shot: the toasts and tips; in a hero shot, the stage's buttons too. */
const QUIET = '#msg,#hint,#tut,#cmdInfo,.toast,#netWait{display:none!important}';
const BARE = `${QUIET} #tools,#btnBox,#btnHome,#btnArmy,#hud{display:none!important}`;
/** The camera's zoom on a desktop: closer than the game's start (all the way out), so the units read in a 1000 px column;
 *  a phone's shots keep its start. */
const ZOOM = 1.5;
const SEED = 4242;

// ---- in the page: the scenes (plain functions, serialized; they read only `endfall`) ----
/** The scene's helpers on window.S: the player's seat and headquarters, the way to the map's middle, spawning and placing. */
function helpers() {
  const e = window.endfall, G = e.G, me = G.me, eng = e.engine;
  const hq = G.bldgs.find(b => b.team === me && eng.BUILDINGS[b.type].hq);
  const mid = { x: eng.MW * 16, y: eng.MH * 16 }, len = Math.hypot(mid.x - hq.x, mid.y - hq.y);
  const dir = { x: (mid.x - hq.x) / len, y: (mid.y - hq.y) / len }, side = { x: -dir.y, y: dir.x };
  /** A point `f` px toward the middle and `s` px across, from the headquarters. */
  const at = (f, s = 0) => ({ x: hq.x + dir.x * f + side.x * s, y: hq.y + dir.y * f + side.y * s });
  const spawn = (team, kind, p) => eng.debugSpawn(team, kind, p.x, p.y);
  const workers = () => G.units.filter(u => u.team === me && eng.UNITS[u.type].worker);
  /** Place a building of `type` on the first free spot from `near` outward, built by a worker of ours. */
  const place = (type, near) => {
    const d = eng.BUILDINGS[type], tx0 = Math.round(near.x / 32 - d.w / 2), ty0 = Math.round(near.y / 32 - d.h / 2);
    for (let r = 0; r < 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !eng.canPlace(type, tx0 + dx, ty0 + dy, me)) continue;
      const w = workers().find(u => u.task.t === 'idle') || workers()[0];
      try { eng.placeBuilding(me, type, tx0 + dx, ty0 + dy, w); return true; } catch { /* refused: the next spot */ }
    }
    return false;
  };
  const mine = () => { const m = e.map.nodes.filter(n => n.amount > 0).sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y))[0]; for (const w of workers()) if (w.task.t === 'idle') eng.startGather(w, m); return m; };
  window.S = { e, G, me, eng, hq, dir, side, at, spawn, place, mine, workers };
  eng.disableAi(); e.fog(false);
}

/**
 * The clip's fight (the home's): Kingdom Archers (ours, blue) against the Expedition's Drones, bows against flying
 * machines, in front of the Expedition's Data center (inside its coverage, where the Drones work): the Archers and a few
 * Guards hold their ground and the Drones, a Buggy beside them, fly in from across the field. Staged so the fight lasts
 * the clip (most of the Drones fall, a few Archers too). Returns the camera's point, the middle of the two sides.
 */
function archersDrones() {
  const { G, me, eng, spawn } = window.S, foe = G.factions.findIndex((_, t) => t !== me);
  const hq = G.bldgs.find(b => b.team === foe && eng.BUILDINGS[b.type].hq);
  const mid = { x: eng.MW * 16, y: eng.MH * 16 }, len = Math.hypot(mid.x - hq.x, mid.y - hq.y);
  const d = { x: (mid.x - hq.x) / len, y: (mid.y - hq.y) / len }, s = { x: -d.y, y: d.x };
  /** `f` px from the Data center toward the map's middle, `w` px across. */
  const at = (f, w) => ({ x: hq.x + d.x * f + s.x * w, y: hq.y + d.y * f + s.y * w });
  eng.revealAll(true); window.endfall.bars(false); // (the other seat drawn wherever it is; no health bars over the fight)
  for (let i = 0; i < 8; i++) spawn(me, 'lancer', at(470 + (i % 2) * 26, (Math.floor(i / 2) - 1.5) * 34 + (i % 2) * 12));
  for (let i = 0; i < 3; i++) spawn(me, 'trooper', at(430, (i - 1) * 40));
  for (let i = 0; i < 10; i++) spawn(foe, 'shrike', at(250 + (i % 2) * 30, (Math.floor(i / 2) - 2) * 46));
  spawn(foe, 'scythe', at(230, 130));
  for (const u of G.units) if (u.team === me && !eng.UNITS[u.type].worker) eng.holdUnit(u);
  window.endfall.skip(0.2);
  // (the camera on the middle of the two sides: the Archers and Guards, the Drones)
  const us = G.units.filter(u => (u.team === me && !eng.UNITS[u.type].worker) || u.type === 'shrike');
  return { x: us.reduce((a, u) => a + u.x, 0) / us.length, y: us.reduce((a, u) => a + u.y, 0) / us.length };
}

/** The Kingdom (ours) storms the Expedition's Data center: knights and guards at its walls, cannons and archers behind. */
function siege() {
  const { G, me, eng, spawn } = window.S, foe = G.factions.findIndex((_, t) => t !== me);
  const hq = G.bldgs.find(b => b.team === foe && eng.BUILDINGS[b.type].hq);
  const mid = { x: eng.MW * 16, y: eng.MH * 16 }, len = Math.hypot(mid.x - hq.x, mid.y - hq.y);
  const d = { x: (mid.x - hq.x) / len, y: (mid.y - hq.y) / len }, s = { x: -d.y, y: d.x };
  const at = (f, w) => ({ x: hq.x + d.x * f + s.x * w, y: hq.y + d.y * f + s.y * w });
  ['knight', 'knight', 'knight', 'trooper', 'trooper', 'trooper', 'trooper'].forEach((k, i) => spawn(me, k, at(120 + (i % 2) * 30, (i - 3) * 34)));
  ['lancer', 'lancer', 'lancer', 'bastion'].forEach((k, i) => spawn(me, k, at(250, (i - 1.5) * 40)));
  spawn(me, 'siegeTank', at(360, -70)); spawn(me, 'siegeTank', at(370, 60));
  ['prism', 'prism', 'bruiser'].forEach((k, i) => spawn(foe, k, at(60, (i - 1) * 50)));
  for (const u of G.units) if (u.team === me && !eng.UNITS[u.type].worker && u.type !== 'siegeTank') eng.attackEnt(u, hq);
  window.endfall.skip(4);
  return at(170, 0);
}

/** A base at about 3:00: workers mining, a few buildings up, a guard at the gate. */
function base(race) {
  const { S } = window, { at, place, mine, spawn, me, e, eng } = S;
  S.mine();
  e.setResources(me, 5000, 0);
  for (let i = 0; i < 4; i++) spawn(me, race === 'humans' ? 'harvester' : 'lumen', at(-60, (i - 1.5) * 30));
  if (race === 'humans') {
    place('depot', at(-150, -160)); place('depot', at(-150, 150)); place('barracks', at(170, -170));
    e.skip(70); place('forge', at(-60, 240)); e.skip(70); mine();
  } else {
    place('siphon', at(170, -170)); place('substation', at(-150, 160)); place('ward', at(220, 120));
    e.skip(60); for (const s of [[-200, -60], [-230, 40], [-180, 140]]) place('spire', at(...s)); place('loom', at(-120, -220));
    e.skip(70); place('uplink', at(240, 260)); e.skip(80); mine();
  }
  const units = race === 'humans' ? ['trooper', 'trooper', 'trooper', 'trooper', 'lancer', 'lancer', 'lancer', 'knight', 'knight'] : ['scythe', 'scythe', 'prism', 'prism', 'prism', 'bruiser'];
  units.forEach((k, i) => spawn(me, k, at(260 + (i % 3) * 34, (Math.floor(i / 3) - 1) * 40)));
  spawn(me, race === 'humans' ? 'observer' : 'shrike', at(40, -70)); if (race !== 'humans') spawn(me, 'shrike', at(70, 40));
  const t = 180 - e.G.time; if (t > 0) e.skip(t);
  e.setResources(me, 470, 0);
  // The camera between the headquarters, its mine and the soldiers at the gate.
  const m = S.mine(), g = at(280, 0);
  return { x: (S.hq.x + m.x + g.x) / 3, y: (S.hq.y + m.y + g.y) / 3 };
}

// ---- the shots ----
const browser = await launchChromium();
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
mkdirSync(OUT, { recursive: true }); mkdirSync(MEDIA, { recursive: true });

/** A game page at its start, `race` playing seat 0 against the other people (the menu's board, as remembered); `query`:
 *  the page's URL query (`?map=0&seed=N` keeps the map and the starts fixed, src/client/menu.js). */
async function game(device, race, css, query = '') {
  const ctx = await browser.newContext(device);
  await ctx.addInitScript(([race]) => {
    localStorage.setItem('endfall.seats', JSON.stringify([{ race, team: 0 }, { race: race === 'humans' ? 'vael' : 'humans', team: 1, diff: 1 }]));
    localStorage.setItem('endfall.guided', '1');
  }, [race]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(origin + query, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.endfall, null, { timeout: 90000 });
  await page.locator('#btnSolo').click(); await page.locator('#btnStart').click();
  await page.waitForFunction(() => window.endfall && endfall.G.units.length > 0, null, { timeout: 60000 });
  await page.addStyleTag({ content: css });
  await page.evaluate(helpers);
  return { ctx, page };
}
/** The camera on `p` at the shots' zoom, kept inside the map (no ground past its edge in the frame). */
const look = (page, p, zoom = ZOOM) => page.evaluate(([{ x, y }, z]) => {
  const e = window.endfall, c = e.cam, W = e.engine.MW * 32, H = e.engine.MH * 32;
  c.zoom = matchMedia('(pointer: coarse)').matches ? e.startZoom : z; e.centerOn(x, y);
  const vw = e.view.w / c.zoom, vh = e.view.h / c.zoom;
  c.x = Math.min(Math.max(0, c.x), Math.max(0, W - vw)); c.y = Math.min(Math.max(0, c.y), Math.max(0, H - vh));
}, [p, zoom]);
const settle = (page) => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 400)))));

/** Encode a PNG screenshot as WebP crops in a blank page: `crops` [{ name, x, y, w, h (of the PNG), W (output width) }]. */
async function encode(png, crops) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(async ({ b64, crops }) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      return crops.map(c => {
        const W = Math.min(c.W, c.w), H = Math.round(c.h * W / c.w), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, c.x, c.y, c.w, c.h, 0, 0, W, H);
        return { name: c.name, w: W, h: H, data: cv.toDataURL('image/webp', 0.82).split(',')[1] };
      });
    }, { b64: png.toString('base64'), crops });
  } finally { await page.close(); }
}

/**
 * A hero (the stage, no HUD): a 2:1 crop of the stage for the desktop (2000 wide) and a 16:9 one round its middle for a
 * phone (720 wide).
 */
async function hero(name, page, words) {
  const box = await page.locator('#stage').boundingBox(), dpr = 2;
  const png = await page.screenshot({ clip: box, animations: 'disabled', timeout: 240000 });
  const W = Math.round(box.width * dpr), H = Math.round(box.height * dpr);
  const dh = Math.min(H, Math.round(W / 2)), pw = Math.min(W, Math.round(H * 16 / 9 * 0.62)), ph = Math.round(pw * 9 / 16);
  const out = await encode(png, [
    { name: 'desktop', x: 0, y: Math.round((H - dh) / 2), w: W, h: dh, W: 2000 },
    { name: 'phone', x: Math.round((W - pw) / 2), y: Math.round((H - ph) / 2), w: pw, h: ph, W: 720 },
  ]);
  save(name, out, words, {});
}

/** An annotated shot (the whole page, HUD and all): the boxes of `marks` ({ key: selectors }) in shares of the page. */
async function annotated(name, page, words, marks, W) {
  const vp = page.viewportSize();
  const boxes = {};
  for (const [k, sels] of Object.entries(marks)) {
    const bs = (await Promise.all(sels.map(s => page.locator(s).first().boundingBox()))).filter(Boolean);
    if (!bs.length) throw new Error(`shots: ${name}: nothing shown for ${k} (${sels})`);
    const x0 = Math.min(...bs.map(b => b.x)), y0 = Math.min(...bs.map(b => b.y)), x1 = Math.max(...bs.map(b => b.x + b.width)), y1 = Math.max(...bs.map(b => b.y + b.height));
    boxes[k] = [x0 / vp.width, y0 / vp.height, (x1 - x0) / vp.width, (y1 - y0) / vp.height].map(v => +v.toFixed(4));
  }
  // What the notes must not cover besides their targets: the top bar, and every sprite on the map in view (buildings,
  // units, gold mines: their drawn extent, roughly, from their footprint and height on screen).
  const avoid = await page.evaluate(() => {
    const e = window.endfall, { G, cam } = e, z = cam.zoom, cv = document.getElementById('game').getBoundingClientRect();
    const sx = (x) => cv.left + (x - cam.x) * z, sy = (y) => cv.top + (y - cam.y) * z, out = [];
    const top = document.getElementById('top').getBoundingClientRect(); out.push([top.left, top.top, top.width, top.height]);
    for (const b of G.bldgs) { const w = b.w * 32 * z, h = b.h * 32 * z; out.push([sx(b.x) - w * 0.6, sy(b.y) - h * 1.3, w * 1.2, h * 1.9]); }
    for (const n of e.map.nodes) { const w = n.w * 32 * z; out.push([sx(n.x) - w * 0.6, sy(n.y) - w * 0.9, w * 1.2, w * 1.5]); }
    for (const u of G.units) { const h = (e.unitTop(u.type) + 6) * z, w = Math.max(28 * z, h * 0.6); out.push([sx(u.x) - w / 2, sy(u.y) - h, w, h + 6 * z]); }
    return out.filter(([x, y, w, h]) => x + w > cv.left && x < cv.right && y + h > cv.top && y < cv.bottom || y < cv.top);
  });
  const shot = [0, 0, vp.width, vp.height];
  const clipTo = ([x, y, w, h]) => { const x0 = Math.max(x, shot[0]), y0 = Math.max(y, shot[1]), x1 = Math.min(x + w, shot[2]), y1 = Math.min(y + h, shot[3]); return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null; };
  const avoidF = avoid.map(clipTo).filter(Boolean).map(([x, y, w, h]) => [x / vp.width, y / vp.height, w / vp.width, h / vp.height].map(v => +v.toFixed(4)));
  const png = await page.screenshot({ animations: 'disabled', timeout: 240000 });
  const out = await encode(png, [{ name: 'desktop', x: 0, y: 0, w: vp.width * 2, h: vp.height * 2, W }, { name: 'phone', x: 0, y: 0, w: vp.width * 2, h: vp.height * 2, W: 720 }]);
  save(name, out, words, boxes, avoidF);
}

function save(name, out, words, boxes, avoid = []) {
  for (const f of readdirSync(OUT)) if (f.startsWith(`${name}-`)) rmSync(new URL(f, OUT));
  const files = {};
  for (const o of out) { files[o.name] = `${name}-${o.w}.webp`; writeFileSync(new URL(files[o.name], OUT), Buffer.from(o.data, 'base64')); }
  const d = out.find(o => o.name === 'desktop'), p = out.find(o => o.name === 'phone');
  manifest[name] = { ...words, w: Math.round(d.w / 2), h: Math.round(d.h / 2), phoneW: Math.round(p.w / 2), phoneH: Math.round(p.h / 2), files, boxes, avoid };
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + '\n');
  console.log(`shots: ${name} (${Object.values(files).join(', ')})`);
}

/** How to win: the enemy's headquarters under attack. */
async function sieges() {
  const { ctx, page } = await game(DESKTOP, 'humans', BARE);
  try {
    const p = await page.evaluate(siege);
    await look(page, p); await settle(page);
    await hero('shot-battle', page, { alt: 'Ebbfall gameplay: the blue Kingdom\'s knights and guards storm the Expedition\'s Data center while cannons and archers fire from behind', caption: 'Knights and Guards at the Data center\'s walls, Cannons firing from behind: bring down the base. Your side plays in blue.' });
  } finally { await ctx.close(); }
}

async function heroes() {
  for (const race of ['humans', 'vael']) {
    const { ctx, page } = await game(DESKTOP, race, BARE);
    try {
      const p = await page.evaluate(base, race);
      await look(page, p); await settle(page);
      await hero(race === 'humans' ? 'hero-kingdom' : 'hero-expedition', page, race === 'humans'
        ? { alt: 'Ebbfall gameplay: a blue Kingdom base, the Castle by its gold mine, Cottages, a Barracks and a Blacksmith, soldiers at the gate', caption: 'A Kingdom base at 3:00: the Castle by its gold mine, with Guards, Archers and Knights at the gate. Your side plays in blue.' }
        : { alt: 'Ebbfall gameplay: a blue Expedition base, the Data center by its mine, wind turbines, a lab and an uplink dish, buggies and sellswords out front', caption: 'An Expedition base at 3:00: the Data center by its mine, Wind turbines behind, an Uplink at the edge. Your side plays in blue.' });
    } finally { await ctx.close(); }
  }
}

/** The two annotated controls shots: a Kingdom base with a group selected, on a desktop and on a phone held sideways. */
async function controls() {
  {
    const { ctx, page } = await game(DESKTOP, 'humans', QUIET);
    try {
      await page.evaluate(base, 'humans');
      await look(page, await page.evaluate(() => window.S.at(180, 0))); await settle(page);
      // The group: a box dragged round the soldiers at the gate (the UI's own selection), saved as group 1.
      const r = await page.evaluate(() => {
        const { G, me, eng, e } = window.S, cv = document.getElementById('game').getBoundingClientRect();
        const us = G.units.filter(u => u.team === me && !eng.UNITS[u.type].worker && !eng.UNITS[u.type].air);
        const sx = (x) => cv.left + (x - e.cam.x) * e.cam.zoom, sy = (y) => cv.top + (y - e.cam.y) * e.cam.zoom;
        return { x0: Math.min(...us.map(u => sx(u.x))) - 14, y0: Math.min(...us.map(u => sy(u.y))) - 24, x1: Math.max(...us.map(u => sx(u.x))) + 14, y1: Math.max(...us.map(u => sy(u.y))) + 10 };
      });
      await page.mouse.move(r.x0, r.y0); await page.mouse.down(); await page.mouse.move(r.x1, r.y1, { steps: 8 }); await page.mouse.up();
      await page.keyboard.press('Control+1');
      await page.mouse.move(640, 790); await settle(page);
      await annotated('shot-desktop-hud', page, { alt: 'Ebbfall on a desktop: the top bar, the map with a group of soldiers selected, the minimap, the selection panel and the command card', caption: 'A Kingdom base at 3:00, a group of Guards, Archers and Knights selected. Your side plays in blue.' }, {
        res: ['#resShard', '#resSup'], bar: ['#resClock', '#btnHelp', '#btnFull', '#btnSound', '#btnPause'], minimap: ['#minimap'], info: ['#info'], cmd: ['#cmd'], groups: ['#groups'],
      }, 2000);
    } finally { await ctx.close(); }
  }
  {
    const { ctx, page } = await game(PHONE_LAND, 'humans', QUIET);
    try {
      await page.evaluate(base, 'humans');
      await look(page, await page.evaluate(() => window.S.at(230, 0))); await settle(page);
      await page.locator('#btnArmy').tap(); await settle(page);
      await annotated('shot-phone-land', page, { alt: 'Ebbfall on a phone held sideways: SELECT, HOME and ARMY at the left, the minimap and the command card', caption: 'The same base on a phone held sideways, the army selected.' }, {
        select: ['#btnBox'], homearmy: ['#btnHome', '#btnArmy'], minimap: ['#minimap'], cmd: ['#cmd'],
      }, 1688);
    } finally { await ctx.close(); }
  }
}

/**
 * The clip: Archers against Drones (`archersDrones`), the stage alone (no HUD), `CLIP_S` seconds at `FPS`, muted, looped
 * by the page. The game's frames are stepped by hand (its requestAnimationFrame and performance.now taken over, each
 * frame exactly one 30 Hz tick of game time later, as the trailer's recorder does: at another rate the ticks per frame
 * would be uneven, 1, 1, 1, 2 at 24 fps, and everything that moves would hitch) and screenshot one by one at DPR 2, as
 * software WebGL cannot draw in real time; then played back at their pace, scaled to the clip's size, into a
 * MediaRecorder in a blank page: MP4 (H.264) where the browser records it, else WebM. Its poster is its middle frame
 * (`hero-home`, the home's hero still: desktop at full DPR 2, phone at 720 wide). `CLIP_FRAMES=<dir>` also writes a few
 * frames there as PNG (for a review).
 */
const FPS = 30, CLIP_S = 6, CLIP_W = 1000, CLIP_H = 500, CLIP_ZOOM = 1.6, CLIP_BPS = 260_000;
const CLIP_WORDS = {
  alt: 'Ebbfall gameplay: the blue Kingdom\'s archers and guards hold their ground as the Expedition\'s attack drones fly in',
  caption: 'Archers against Drones. Your side plays in blue.',
};
async function clip() {
  const { ctx, page } = await game({ viewport: { width: CLIP_W, height: CLIP_H }, deviceScaleFactor: 2 }, 'humans', `${BARE} #top,#hud{display:none!important} #app{padding:0!important;gap:0!important} #stage{border:0!important;border-radius:0!important}`, `?map=0&seed=${SEED}`);
  const frames = [], review = process.env.CLIP_FRAMES;
  try {
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    const p = await page.evaluate(archersDrones);
    await look(page, p, CLIP_ZOOM); await settle(page);
    await page.evaluate(async () => {
      const q = [];
      window.requestAnimationFrame = (f) => { q.push(f); return q.length; };
      await new Promise(r => { const check = () => (q.length ? r() : setTimeout(check, 5)); check(); }); // (the last real frame's callback)
      let t = performance.now(), tl = t;
      performance.now = () => t;
      window.stepFrame = (ms) => { t += ms; tl += 1000 / 30 + 0.0005; const fs = q.splice(0); for (const f of fs) f(tl); return fs.length; };
    });
    for (let i = 0; i < FPS * CLIP_S; i++) {
      await page.evaluate((ms) => window.stepFrame(ms), 1000 / FPS);
      frames.push(await page.screenshot({ timeout: 240000 }));
    }
  } finally { await ctx.close(); }
  const middle = frames[Math.floor(frames.length / 2)];
  const pw = await encode(middle, [{ name: 'desktop', x: 0, y: 0, w: CLIP_W * 2, h: CLIP_H * 2, W: CLIP_W * 2 }, { name: 'phone', x: 0, y: 0, w: CLIP_W * 2, h: CLIP_H * 2, W: 720 }]);
  save('hero-home', pw, CLIP_WORDS, {});
  if (review) {
    mkdirSync(review, { recursive: true });
    for (const i of [0, 45, 90, 135, frames.length - 1]) writeFileSync(join(review, `clip-frame-${String(i).padStart(3, '0')}.png`), frames[i]);
  }
  const rec = await browser.newPage();
  try {
    await rec.setContent('<canvas></canvas>');
    await rec.evaluate(([w, h, bps]) => {
      const c = document.querySelector('canvas'); c.width = w; c.height = h;
      const types = ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9', 'video/webm'];
      const type = types.find(t => MediaRecorder.isTypeSupported(t)), stream = c.captureStream(0), track = stream.getVideoTracks()[0], parts = [];
      const r = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: bps });
      r.ondataavailable = (e) => parts.push(e.data);
      window.rec = { c, g: c.getContext('2d'), track, r, parts, type, bitmaps: [], done: new Promise(ok => { r.onstop = ok; }) };
    }, [CLIP_W, CLIP_H, CLIP_BPS]);
    // Each frame decoded ahead at the clip's size (from DPR 2: sharper than drawn at 1), then drawn on its beat.
    for (const f of frames) await rec.evaluate(async ([b64, w, h]) => { const blob = await (await fetch('data:image/png;base64,' + b64)).blob(); window.rec.bitmaps.push(await createImageBitmap(blob, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' })); }, [f.toString('base64'), CLIP_W, CLIP_H]);
    frames.length = 0;
    const out = await rec.evaluate(async (fps) => {
      const { g, track, r, parts, type, bitmaps } = window.rec;
      g.drawImage(bitmaps[0], 0, 0); r.start();
      const t0 = performance.now();
      for (let i = 0; i < bitmaps.length; i++) {
        g.drawImage(bitmaps[i], 0, 0); track.requestFrame();
        const wait = t0 + (i + 1) * 1000 / fps - performance.now(); if (wait > 0) await new Promise(ok => setTimeout(ok, wait));
      }
      r.stop(); await window.rec.done;
      const buf = new Uint8Array(await new Blob(parts, { type }).arrayBuffer());
      let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return { type, data: btoa(s) };
    }, FPS);
    const ext = out.type.startsWith('video/mp4') ? 'mp4' : 'webm', bytes = Buffer.from(out.data, 'base64');
    for (const f of readdirSync(MEDIA)) if (f.startsWith('trailer.')) rmSync(new URL(f, MEDIA));
    writeFileSync(new URL(`trailer.${ext}`, MEDIA), bytes);
    manifest.trailer = { file: `trailer.${ext}`, type: out.type.split(';')[0], poster: 'hero-home', w: CLIP_W, h: CLIP_H, seconds: CLIP_S, uploaded: new Date().toISOString().slice(0, 10), alt: CLIP_WORDS.alt, title: 'Ebbfall gameplay: Archers against Drones' };
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + '\n');
    console.log(`shots: clip (trailer.${ext}, ${Math.round(bytes.length / 1024)} KB)`);
  } finally { await rec.close(); }
}

const JOBS = { sieges, heroes, controls, clip };
try {
  for (const [k, f] of Object.entries(JOBS)) if (!only.length || only.includes(k)) await f();
} finally { await browser.close(); server.close(); }
