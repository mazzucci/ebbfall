// Browser test harness: serves dist/ on a local port, launches headless Chromium, and gives tests helpers that
// drive the real UI (mouse, keyboard, touch). The window.endfall debug handle is used only to read positions,
// fast-forward time and grant resources; every game action goes through clicks, taps and keys.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../../tools/chromium.mjs';

const dist = process.env.ENDFALL_DIST ? join(process.env.ENDFALL_DIST, '/') : fileURLToPath(new URL('../../dist/', import.meta.url)); // ENDFALL_DIST: test another build
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

let server, browser, base;
export async function start() {
  if (!existsSync(join(dist, 'index.html'))) throw new Error('dist/ is missing: run npm run build first');
  server = createServer((req, res) => {
    let p = normalize(join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!p.startsWith(dist)) { res.writeHead(403); return res.end(); }
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
    if (!existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await launchChromium();
}
export async function stop() { await browser?.close(); server?.close(); }
/** A bare browser context and the URL the game is served at (for tests of the menu itself). */
export const browserContext = (device) => browser.newContext(device);
export const baseUrl = () => base;

export const DESKTOP = { viewport: { width: 1280, height: 720 } };
export const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

/** Single player's sides board through its UI: a side's + ALLY / + AI (`k`: the side, 0 yours), + SIDE, and a seat's
 *  sheet (its token, chips, DONE): a race, a difficulty, a side (its team number, the side's place; 'new'), REMOVE. */
export function board(page) {
  let touch = null; // (a phone's context taps)
  const press = async (sel) => { touch ??= await page.evaluate(() => navigator.maxTouchPoints > 0); await (touch ? page.locator(sel).tap() : page.locator(sel).click()); };
  const open = async (i) => { await press(`#soloBoard [data-k="tok${i}"]`); await page.waitForTimeout(400); }; // (a tap within 350 ms of opening is the double tap's second)
  const sheet = async (i, ...keys) => { await open(i); for (const k of keys) await press(`#soloSheet [data-k="${k}"]`); await press('#soloSheet [data-k="done"]'); };
  return {
    /** Each side's seats, by name, yours first. */
    sides: () => page.$$eval('#soloBoard .side', ss => ss.map(s => [...s.querySelectorAll('.tok b')].map(b => b.textContent))),
    /** Each seat's band colour, in row order (YOU, AI 1, ...). */
    bands: () => page.$$eval('#soloBoard .tok', ts => ts.sort((a, b) => +a.dataset.k.slice(3) - +b.dataset.k.slice(3)).map(t => t.querySelector('.band').style.background)),
    add: (k = 1) => press(`#soloBoard [data-k="add${k}"]`),
    newSide: () => press('#soloBoard [data-k="newside"]'),
    race: (i, r) => sheet(i, `race:${r}`), diff: (i, d) => sheet(i, `diff:${d}`), side: (i, t) => sheet(i, `side:${t}`),
    remove: async (i) => { await open(i); await press('#soloSheet [data-k="remove"]'); },
    /** Open seat `i`'s sheet (and wait past the double tap's guard). */
    open,
  };
}

/** A fresh game in a new page. Returns a driver with helpers bound to it. */
/** `ai: false` switches the opponent off, for tests of what the player can do that must not race its attacks. */
export async function newGame(device = DESKTOP, diff = 1, seed = 4242, { ai = true, race = 'humans', first = false } = {}) {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}?seed=${seed}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 }); // set once the game has fully loaded
  const touch = !!device.hasTouch;
  await (touch ? page.locator('#btnSolo').tap() : page.locator('#btnSolo').click()); // the menu's first page: SINGLE PLAYER
  if (first) await (touch ? page.locator('#btnFirst').tap() : page.locator('#btnFirst').click()); // the guided first game
  else if (race !== 'humans') await board(page).race(0, race); // (the sides board: your race, the AI's difficulty)
  if (!first && diff !== 0) await board(page).diff(1, diff);
  if (!first) await (touch ? page.locator('#btnStart').tap() : page.locator('#btnStart').click());
  await page.waitForFunction(() => window.endfall && endfall.G.units.length > 0);
  if (!ai) await page.evaluate(() => endfall.engine.disableAi());
  // Games start fully zoomed out; the scenarios play closer in (as players do, and software WebGL draws the wide
  // view slowly enough to stretch a double-click past its window).
  const startZoom = await page.evaluate(() => endfall.cam.zoom);
  await page.evaluate((z) => { const c = endfall.G.bldgs.find(b => b.team === 0); endfall.cam.zoom = z; endfall.centerOn(c.x + 40, c.y); }, touch ? 1.75 : 2);
  const cdp = touch ? await ctx.newCDPSession(page) : null;
  const ev = (fn, arg) => page.evaluate(fn, arg);

  const d = {
    page, errors, touch, startZoom,
    close: () => ctx.close(),
    eval: ev,
    /** Read world state (plain data). */
    state: () => ev(() => ({
      res: endfall.G.res[0].slice(), sup: endfall.G.sup[0].slice(), over: endfall.G.over, winner: endfall.G.winner,
      units: endfall.G.units.map(u => ({ id: u.id, type: u.type, team: u.team, x: u.x, y: u.y, task: u.task.t })),
      bldgs: endfall.G.bldgs.map(b => ({ id: b.id, type: b.type, team: b.team, tx: b.tx, ty: b.ty, x: b.x, y: b.y, w: b.w, h: b.h, done: b.done, progress: b.progress, planted: b.planted, powered: b.powered, queue: b.queue.slice() })),
      nodes: endfall.map.nodes.map(n => ({ id: n.id, type: n.type, tx: n.tx, ty: n.ty, x: n.x, y: n.y, r: n.r })),
    })),
    // Skip game time, then let the frame loop run twice (or 250 ms at most): what the skipped ticks raised (toasts,
    // alerts, effects) reaches the page as a player would see it, not on whichever frame comes next.
    skip: (s) => ev((s) => { endfall.skip(s); return new Promise(r => { const t = setTimeout(r, 250); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); r(); })); }); }, s),
    grant: (shards, ether) => ev(([a, b]) => endfall.setResources(0, a, b), [shards, ether]),
    centerOn: (x, y) => ev(([x, y]) => endfall.centerOn(x, y), [x, y]),
    /** World point → page pixel (after centring the camera there, so it is on screen). */
    async screen(wx, wy, center = true) {
      // Fresh layout every time (full screen and rotation resize the canvas), and park the mouse mid-canvas so
      // edge scrolling cannot move the camera between measuring and clicking.
      const canvas = await page.locator('#game').boundingBox();
      if (!touch) await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
      if (center) await d.centerOn(wx, wy);
      const c = await ev(() => ({ x: endfall.cam.x, y: endfall.cam.y, z: endfall.cam.zoom }));
      return [canvas.x + (wx - c.x) * c.z, canvas.y + (wy - c.y) * c.z];
    },
    async tapAt(x, y) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(60);
    },
    /** Two quick taps (sent together: the software-rendered phone handles each tap late, so taps sent one after the
     *  other land outside the double-tap window). */
    async doubleTapAt(x, y) {
      const p = [{ x, y }];
      await Promise.all([['touchStart', p], ['touchEnd', []], ['touchStart', p], ['touchEnd', []]].map(([type, touchPoints]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints })));
      await page.waitForTimeout(120);
    },
    /** Left click (or tap) on a world point. */
    async clickWorld(wx, wy, opts = {}) { const [x, y] = await d.screen(wx, wy); if (touch) return d.tapAt(x, y); await page.mouse.click(x, y, opts); await page.waitForTimeout(60); },
    async rightClickWorld(wx, wy) { const [x, y] = await d.screen(wx, wy); await page.mouse.click(x, y, { button: 'right' }); await page.waitForTimeout(60); },
    /** Click on an entity by id, reading its position right before clicking. */
    async clickEntity(id) {
      // Units move ~3 px per frame: centre on the live position and get its screen point in one round trip,
      // then click right away.
      const canvas = await page.locator('#game').boundingBox();
      if (!touch) await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
      const p = await ev((id) => {
        const e = endfall.G.units.find(u => u.id === id) || endfall.G.bldgs.find(b => b.id === id); if (!e) return null;
        endfall.centerOn(e.x, e.y); const c = endfall.cam; return { x: (e.x - c.x) * c.zoom, y: (e.y - c.y) * c.zoom };
      }, id);
      if (!p) throw new Error('no entity ' + id);
      const [x, y] = [canvas.x + p.x, canvas.y + p.y];
      if (touch) return d.tapAt(x, y);
      await page.mouse.click(x, y); await page.waitForTimeout(60);
    },
    /** Drag a selection box (mouse) around a world rectangle. */
    async boxSelect(x0, y0, x1, y1) {
      const canvas = await page.locator('#game').boundingBox();
      const [sx, sy] = await d.screen((x0 + x1) / 2, (y0 + y1) / 2);
      const z = await ev(() => endfall.cam.zoom), hw = (x1 - x0) / 2 * z, hh = (y1 - y0) / 2 * z;
      await page.mouse.move(sx - hw, sy - hh); await page.mouse.down(); await page.mouse.move(sx + hw, sy + hh, { steps: 6 }); await page.mouse.up();
      await page.waitForTimeout(60);
    },
    key: (k) => page.keyboard.press(k),
    selection: () => ev(() => endfall.ui.sel.map(e => ({ id: e.id, type: e.type, kind: e.kind }))),
    /** Labels of the command card buttons as the player sees them, with their enabled state. */
    card: () => page.$$eval('#cmd button', bs => bs.map(b => ({ label: b.querySelector('.l').textContent, enabled: !b.disabled && b.getAttribute('aria-disabled') !== 'true' }))),
    /** Wait until the card shows `label` usable (not locked): after a set-up changed what it offers (a tech
     *  researched by the debug handle), the card is drawn again on a later frame. */
    readyCard: (label) => page.locator('#cmd button:not([disabled]):not(.locked)', { hasText: label }).first().waitFor({ timeout: 5000 }),
    async pressCard(label) {
      const b = page.locator('#cmd button:not([disabled])', { hasText: label }).first();
      await b.waitFor({ timeout: 5000 });
      // A locked button (aria-disabled) is still tappable in a browser; Playwright needs to be told.
      const force = (await b.getAttribute('aria-disabled')) === 'true';
      await (touch ? b.tap({ force }) : b.click({ force })); await page.waitForTimeout(120);
    },
    /** A free spot for a building type near (x, y) in tiles, found with the game's own placement rule. */
    findSpot: (type, near) => ev(([type, near]) => {
      for (let r = 2; r < 14; r++) for (let a = 0; a < 24; a++) {
        const tx = Math.round(near.tx + Math.cos(a / 24 * 6.283) * r), ty = Math.round(near.ty + Math.sin(a / 24 * 6.283) * r);
        if (endfall.engine.canPlace(type, tx, ty, 0)) return { tx, ty };
      }
      return null;
    }, [type, near]),
    /** Select a harvester by clicking it, then place `type` (by its hotkey) at tile (tx, ty) by clicking. */
    async buildWithUI(hotkey, type, tx, ty, harvesterId) {
      // A mining harvester moves, and while it unloads it is under the Core: a tap may miss it (or let go of it); try
      // again, a little later each time, until it is the selection (a slow machine needs more than a few tries).
      let picked = false;
      for (let i = 0; i < 16 && !picked; i++) {
        if (i) await page.waitForTimeout(150 + 50 * i);
        await d.clickEntity(harvesterId);
        picked = (await d.selection()).some(e => e.id === harvesterId);
      }
      if (!picked) throw new Error(`could not select harvester ${harvesterId} to build a ${type}`);
      if (touch) {
        // The button as the card shows it, on the page of the Build menu its race lists it on.
        const { advanced, label } = await ev((t) => {
          const d = endfall.engine.BUILDINGS[t];
          return { advanced: Object.values(endfall.engine.FACTIONS).some(f => f.buildAdvanced.includes(t)), label: d.short || d.name.split(' ').pop() };
        }, type);
        await d.pressCard('Build'); if (advanced) await d.pressCard('Advanced'); await d.pressCard(label);
      }
      else { await d.key('b'); await d.key(hotkey); }
      const w = await ev((t) => endfall.engine.BUILDINGS[t], type);
      const [x, y] = await d.screen((tx + w.w / 2) * 32, (ty + w.h / 2) * 32);
      // Touch: the ghost appears under the finger and follows it; drag it onto this exact spot and let go, as a
      // player would.
      if (touch) await d.dragTo(x + 48, y, x, y); else { await page.mouse.move(x, y); await page.mouse.click(x, y); }
      await page.waitForTimeout(80);
    },
    /** One finger from (x0, y0) to (x1, y1) in a few steps, then lifted. */
    /** One finger down, moved, lifted: separately, to look between. */
    async touchDown(x, y) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await page.waitForTimeout(60); },
    async touchMove(x, y) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] }); await page.waitForTimeout(60); },
    async touchUp() { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(60); },
    async dragTo(x0, y0, x1, y1) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
      for (let i = 1; i <= 4; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / 4, y: y0 + (y1 - y0) * i / 4 }] });
      await page.waitForTimeout(30); // (a pause before lifting: no glide)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },
    /** Wait (up to 5 s of real time) until a HUD element's text matches. Returns the text; throws with what it read. */
    async hudText(selector, re) {
      const loc = page.locator(selector);
      try { await loc.filter({ hasText: re }).waitFor({ timeout: 5000 }); }
      catch { throw new Error(`${selector} never matched ${re}: it reads "${await loc.textContent({ timeout: 1000 }).catch(() => "(nothing)")}"`); }
      return loc.textContent();
    },
    toasts: () => page.$$eval('#msg .toast', ts => ts.map(t => t.textContent)),
  };
  return d;
}

/** Poll until fn() is truthy (fn runs in Node; use d.state() inside), fast-forwarding the game between checks. */
export async function until(d, fn, { seconds = 120, step = 2, what = 'condition' } = {}) {
  for (let t = 0; t <= seconds; t += step) { const v = await fn(); if (v) return v; await d.skip(step); }
  throw new Error(`timed out after ${seconds}s of game time waiting for ${what}`);
}
