// The trailer's stage (tools/trailer/record.mjs): the built game (dist/: run `npm run build` first) served locally and
// opened in headless Chromium (tools/chromium.mjs, software WebGL), like the docs' clip (tools/docs/shots.mjs `clip`):
// a fixed map and seed, seat 0 the Kingdom, seat 1 the Expedition, the AI off, the fog layer hidden. Once a scene is set
// out, `freeze` takes the page's clock: requestAnimationFrame and performance.now answer to the recorder, so each frame
// is exactly the game time it says (the renderer's effects, the camera's quake, the sounds' repeat gaps), however long
// software WebGL takes to draw it.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../chromium.mjs';

const root = new URL('../../', import.meta.url);
const dist = fileURLToPath(new URL('dist/', root));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.webp': 'image/webp', '.txt': 'text/plain' };

/** The game's maps the trailer plays on (src/client/maps.js indices; `?seed=` keeps the sides fixed: seat 0 at start 0). */
export const MAPS = { basin: 0, quarter: 4 };
/** What never shows in a trailer frame: toasts, tips, the stage's buttons; `bare` also the top bar and the HUD. */
const QUIET = '#msg,#hint,#tut,#cmdInfo,.toast,#netWait,#homeTip,#end{display:none!important}';
const BARE = `${QUIET} #tools,#btnBox,#btnHome,#btnArmy,#btnAlert,#hud,#top,.ib{display:none!important} #app{padding:0!important;gap:0!important} #stage{border:0!important;border-radius:0!important}`;

export async function openStage() {
  if (!existsSync(join(dist, 'index.html'))) throw new Error('trailer: dist/ is missing: run npm run build first');
  const server = createServer((req, res) => {
    let p = normalize(join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!p.startsWith(dist)) { res.writeHead(403); return res.end(); }
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
    if (!existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}/`;
  const browser = await launchChromium();
  return { browser, origin, close: async () => { await browser.close(); server.close(); } };
}

/**
 * A game page at its start on `map` (a MAPS key): the Kingdom against the Expedition, the stage alone (`hud`: the real
 * HUD too, the phone shot's). The sim takes orders and placements only for this side's seat (seat 0), so a shot plays
 * the people it orders (`as`); playing the Expedition, the seats' colors are swapped (`endfall.paint`), so the Kingdom
 * is always in blue and the Expedition in red-pink. `ai`: the other seat's AI left on (else off). The scene helpers are on
 * window.S (`helpers`).
 */
export async function game(stage, device, { map = 'quarter', as = 'humans', hud = false, ai = false } = {}) {
  const ctx = await stage.browser.newContext(device);
  await ctx.addInitScript((as) => {
    localStorage.setItem('endfall.seats', JSON.stringify([{ race: as, team: 0 }, { race: as === 'humans' ? 'vael' : 'humans', team: 1, diff: 1 }]));
    localStorage.setItem('endfall.guided', '1');
  }, as);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`${stage.origin}?map=${MAPS[map]}&seed=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.endfall, null, { timeout: 90000 });
  await page.locator('#btnSolo').click(); await page.locator('#btnStart').click();
  await page.waitForFunction(() => window.endfall && endfall.G.units.length > 0, null, { timeout: 60000 });
  await page.addStyleTag({ content: hud ? QUIET : BARE });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.evaluate(helpers, { as, ai });
  return { ctx, page };
}

/** In the page: the scene's helpers on window.S (K and X: the Kingdom's seat and the Expedition's), the other seat's AI
 *  off (unless `ai`), every seat drawn (the fog layer hidden, the enemy shown wherever it is). */
function helpers({ as, ai }) {
  const e = window.endfall, G = e.G, eng = e.engine;
  const K = as === 'humans' ? 0 : 1, X = 1 - K;
  if (as !== 'humans') e.paint([1, 0]);
  const hqOf = (seat) => G.bldgs.find(b => b.team === seat && eng.BUILDINGS[b.type].hq);
  const spawn = (team, kind, p) => eng.debugSpawn(team, kind, p.x, p.y);
  const byId = (id) => G.units.find(u => u.id === id) || G.bldgs.find(b => b.id === id);
  const workers = (seat) => G.units.filter(u => u.team === seat && eng.UNITS[u.type].worker);
  const mineOf = (seat) => { const hq = hqOf(seat); return e.map.nodes.filter(n => n.amount > 0).sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y))[0]; };
  /** A point `f` px from seat's headquarters toward `to` and `s` px across. */
  const toward = (seat, to, f, s = 0) => {
    const hq = hqOf(seat), len = Math.hypot(to.x - hq.x, to.y - hq.y) || 1, d = { x: (to.x - hq.x) / len, y: (to.y - hq.y) / len };
    return { x: hq.x + d.x * f - d.y * s, y: hq.y + d.y * f + d.x * s };
  };
  /** The free spot for `type` nearest `near` (world px), for `seat`: [tx, ty] or null. */
  const spot = (seat, type, near, reach = 16) => {
    const d = eng.BUILDINGS[type], tx0 = Math.round(near.x / 32 - d.w / 2), ty0 = Math.round(near.y / 32 - d.h / 2);
    for (let r = 0; r < reach; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === r && eng.canPlace(type, tx0 + dx, ty0 + dy, seat)) return [tx0 + dx, ty0 + dy];
    }
    return null;
  };
  /** Place `type` for `seat` at the free spot nearest `near`, built by `worker` (or an idle worker of the seat). */
  const place = (seat, type, near, worker) => {
    const s = spot(seat, type, near); if (!s) return null;
    const w = worker || workers(seat).find(u => u.task.t === 'idle') || workers(seat)[0];
    const err = eng.placeBuilding(seat, type, s[0], s[1], w);
    return err ? null : G.bldgs.find(b => b.team === seat && b.type === type && b.tx === s[0] && b.ty === s[1]) || true;
  };
  const gather = (seat, ws = workers(seat)) => { const m = mineOf(seat); for (const w of ws) eng.startGather(w, m); return m; };
  /** Skip until building `b` is up (two minutes at most). */
  const until = (b) => { for (let i = 0; i < 120 && b && b !== true && !b.done; i++) e.skip(1); return b; };
  window.S = { e, G, eng, K, X, hqOf, spawn, byId, workers, mineOf, toward, spot, place, gather, until };
  if (!ai) eng.disableAi();
  e.fog(false); eng.revealAll(true);
  window.__sfx = [];
}

/**
 * Take the page's clock (after the scene is set out): requestAnimationFrame queues, performance.now reads the
 * recorder's time, and `__frame(ms, ticks)` runs one frame `ms` later with `ticks` sim ticks in it (1: real time; 4: a
 * time-lapse). The effects the game asks for from then on are logged in `__sfx` at that clock (audio.js `record`).
 */
export const freeze = (page) => page.evaluate(() => {
  const q = [], real = performance.now.bind(performance); let t = real();
  window.requestAnimationFrame = (f) => { q.push(f); return q.length; };
  performance.now = () => t;
  const e = window.endfall, t0 = t;
  e.G.events.length = 0; // (the staging's events: not heard)
  e.sound.record = (s) => window.__sfx.push({ ...s, at: (s.at - t0) / 1000 });
  // The loop's own clock (requestAnimationFrame's argument) moves one tick and a hair a frame, so the loop runs
  // exactly one tick; the rest of a time-lapse's ticks run here first. performance.now moves the frame's real length.
  let tl = t;
  window.__frame = (ms, ticks = 1) => {
    if (ticks > 1) e.skip((ticks - 1.5) / 30); // (ticks - 1 steps)
    t += ms; tl += 1000 / 30 + 0.0005; const fs = q.splice(0); for (const f of fs) f(tl);
  };
  window.__t0 = t0;
});
