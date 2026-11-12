// Browser test harness: serves dist/ on a local port, launches the browser (ENDFALL_ENGINE: chromium, the default,
// webkit or firefox; tools/engines.mjs), and gives tests helpers that drive the real UI (mouse, keyboard, touch). The
// window.endfall debug handle is used only to read positions, fast-forward time and grant resources; every game action
// goes through clicks, taps and keys.
import { test as nodeTest } from 'node:test';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINES, engineName, launchEngine, deviceFor } from '../../tools/engines.mjs';
import { loadTimes, assigner } from './shards.mjs';

export const ENGINE = engineName();
/** The engine's name as people write it: Chromium, WebKit, Firefox. */
export const ENGINE_NAME = ENGINES[ENGINE];

/**
 * node:test's `test`, aware of the engine. Two options of its own: `engines: true` puts a scenario in the cross-engine
 * subset (the one CI runs in WebKit and Firefox too), and `chromium: 'why'` keeps a scenario to Chromium (CDP touch,
 * Chromium's own APIs). In WebKit and Firefox only the subset runs, unless ENDFALL_ALL=1: then all but the
 * Chromium-only ones, each skipped with its reason.
 */
export function test(name, opts = {}, fn) {
  if (typeof opts === 'function') [opts, fn] = [{}, opts];
  if (!inShard(name)) return; // (another shard's: not registered at all)
  const { engines, chromium, ...rest } = opts;
  if (ENGINE !== 'chromium' && !rest.skip) {
    if (chromium) rest.skip = `Chromium only: ${chromium}`;
    else if (!engines && !process.env.ENDFALL_ALL) rest.skip = `not in the cross-engine subset (ENDFALL_ALL=1 runs it in ${ENGINE_NAME})`;
  }
  return nodeTest(name, rest, fn);
}
// ENDFALL_SHARD=i/n (1 <= i <= n): run only the i-th of n shards, balanced by each test's measured time (shards.mjs,
// times.json: longest first into the least-loaded shard; a test missing from the table weighs the median), so CI can
// split the suite over n jobs by test rather than by file (one file holds most of the time). The split is the same in
// every shard and every run, so every test lands in exactly one shard; a file run alone runs its tests of that shard.
const SHARD = (process.env.ENDFALL_SHARD || '').match(/^(\d+)\/(\d+)$/)?.slice(1).map(Number);
if (process.env.ENDFALL_SHARD && !(SHARD && SHARD[0] >= 1 && SHARD[0] <= SHARD[1])) throw new Error(`ENDFALL_SHARD must be i/n, not ${process.env.ENDFALL_SHARD}`);
const FILE = (process.argv[1] || '').split('/').pop();
// ENDFALL_E2E_LIST=1: register nothing and start nothing, only print each test's file and name, a line each after
// LISTED (tools/e2e-times.mjs reads them to match CI's log to the files and to print the shards).
export const LISTED = 'ENDFALL_E2E_TEST ';
const LIST = !!process.env.ENDFALL_E2E_LIST;
const shardOf = SHARD && assigner(loadTimes(), SHARD[1], FILE);
let kept = 0;
const inShard = (name) => {
  if (LIST) { process.stdout.write(LISTED + JSON.stringify([FILE, name]) + '\n'); return false; }
  const mine = !SHARD || shardOf(name) === SHARD[0] - 1;
  kept += mine ? 1 : 0;
  return mine;
};
/** Whether this shard runs any of this file's tests (all, unsharded): for a `before` hook that starts something that
 *  would keep the file running (a relay). Asked once the file has registered its tests (a hook may run before). */
export async function anyHere() {
  await new Promise(r => setImmediate(r));
  return !LIST && (!SHARD || kept > 0);
}
/** CDP touch: Chromium's `Input.dispatchTouchEvent`, for gestures (a drag, two fingers, a long press, a double tap). */
export const CDP_TOUCH = 'gestures through CDP (Input.dispatchTouchEvent); other engines tap only';
/** A test's `skip` in these engines, with the reason (`{ skip: notIn(['webkit'], IPHONE) }`); false elsewhere. */
export const notIn = (engines, why) => (engines.includes(ENGINE) ? `${ENGINE_NAME}: ${why}` : false);
/** Known differences, not faults of the game (ENDFALL_ALL=1 runs found them): */
export const IPHONE = 'its phone profile is an iPhone: no full screen for a page (the full-screen button opens the Add to Home Screen card)';

const dist = process.env.ENDFALL_DIST ? join(process.env.ENDFALL_DIST, '/') : fileURLToPath(new URL('../../dist/', import.meta.url)); // ENDFALL_DIST: test another build
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

let server, browser, base;
export async function start() {
  if (LIST) return;
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
  // Sharded, the browser starts with the first test that asks for a page (`context`): a file none of whose tests are in
  // this shard launches none, and ends (a browser with no test to close it would keep it running for good: node:test
  // runs `after` only when a test ran). The server alone keeps nothing alive.
  if (SHARD) server.unref();
  else browser = await launchEngine(ENGINE);
}
export async function stop() { await browser?.close(); server?.close(); }
// ENDFALL_CPU_THROTTLE=n (n > 1): every page's CPU slowed n times (CDP, so Chromium only), to shake out tests that
// time what they should wait for (a busy machine gives a page few frames).
const THROTTLE = Number(process.env.ENDFALL_CPU_THROTTLE) || 0;
async function context(device) {
  browser ??= await launchEngine(ENGINE);
  const ctx = await browser.newContext(deviceFor(ENGINE, device));
  if (THROTTLE > 1 && ENGINE === 'chromium') ctx.on('page', (p) => ctx.newCDPSession(p).then(s => s.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })).catch(() => {}));
  return ctx;
}
/** A bare browser context and the URL the game is served at (for tests of the menu itself). */
export const browserContext = (device) => context(device);
export const baseUrl = () => base;

export const DESKTOP = { viewport: { width: 1280, height: 720 } };
export const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

/** Single player's board through its UI (eight spots): + SEAT (the lowest empty spot, a side of its own), and a seat's
 *  sheet (its token, chips, DONE): a race, a level, a side (its number from 0: SIDE 1 is 0), REMOVE. `scope`: the
 *  board's and the sheet's ids (the lobby's: board(page, 'online')). */
export function board(page, scope = 'solo') {
  let touch = null; // (a phone's context taps)
  const B = `#${scope}Board`, S = `#${scope}Sheet`;
  const press = async (sel) => { touch ??= await page.evaluate(() => navigator.maxTouchPoints > 0); await (touch ? page.locator(sel).tap() : page.locator(sel).click()); };
  const open = async (i) => { await press(`${B} [data-k="tok${i}"]`); await page.waitForTimeout(400); }; // (a tap within 350 ms of opening is the double tap's second)
  const sheet = async (i, ...keys) => { await open(i); for (const k of keys) await press(`${S} [data-k="${k}"]`); await press(`${S} [data-k="done"]`); };
  return {
    /** Each side's players, by name, the sides as the game seats them (yours first, then as their first spots come). */
    sides: () => page.$$eval(`${B} .tok`, (ts) => {
      const by = new Map();
      for (const t of ts) { const side = +t.querySelector('.stag').textContent.replace(/\D/g, ''), name = t.querySelector('b').firstChild?.textContent ?? ''; by.set(side, [...(by.get(side) || []), name || 'OPEN']); }
      return [...by.values()];
    }),
    /** Each spot: a token's name, '+' for the add cell, '' for an empty spot. */
    spots: () => page.$$eval(`${B} > *`, cs => cs.map(c => (c.matches('.add, .split') ? '+' : c.querySelector('b')?.firstChild?.textContent ?? (c.matches('.tok') ? 'OPEN' : '')))),
    /** Each player's band color, in spot order. */
    bands: () => page.$$eval(`${B} .tok`, ts => ts.map(t => t.querySelector('.band').style.background)),
    /** Every cell's box, by spot (to see that nothing moved), once the board is laid out: shown, eight cells each with
     *  a size, the same on two reads a frame apart (read in one go in the page: a lobby redrawing the board between a
     *  query and its read would give a detached cell's zeros). After 10 s, whatever it is (the assertion says why). */
    boxes: async () => {
      const read = () => page.evaluate((B) => new Promise(r => requestAnimationFrame(() => r([...document.querySelectorAll(`${B} > *`)].map(c => { const b = c.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map(Math.round); })))), B);
      let last = await read();
      for (const end = Date.now() + 10000; Date.now() < end; ) {
        const now = await read();
        if (now.length === 8 && now.every(b => b[2] > 0 && b[3] > 0) && JSON.stringify(now) === JSON.stringify(last)) return now;
        last = now; await new Promise(r => setTimeout(r, 50));
      }
      return last;
    },
    add: () => press(`${B} [data-k="add"]`),
    race: (i, r) => sheet(i, `race:${r}`), diff: (i, d) => sheet(i, `diff:${d}`), side: (i, t) => sheet(i, `side:${t}`),
    remove: async (i) => { await open(i); await press(`${S} [data-k="remove"]`); },
    /** Open seat `i`'s sheet (and wait past the double tap's guard). */
    open,
  };
}

/** A fresh game in a new page. Returns a driver with helpers bound to it. */
/** `ai: false` switches the opponent off, for tests of what the player can do that must not race its attacks; `init`, a
 *  function run in the page before the game loads. */
export async function newGame(device = DESKTOP, diff = 1, seed = 4242, { ai = true, race = 'humans', first = false, init = null } = {}) {
  const ctx = await browserContext(device);
  if (init) await ctx.addInitScript(init); // (a script run before the page's own, e.g. a stand-in for full screen)
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}?seed=${seed}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 }); // set once the game has fully loaded
  const touch = !!device.hasTouch;
  // The menu's first page: FIRST GAME (the guided game, offered there to a newcomer) or SINGLE PLAYER.
  await (touch ? page.locator(first ? '#btnFirstHome' : '#btnSolo').tap() : page.locator(first ? '#btnFirstHome' : '#btnSolo').click());
  if (!first && race !== 'humans') await board(page).race(0, race); // (the sides board: your race, the AI's difficulty)
  if (!first && diff !== 0) await board(page).diff(1, diff);
  if (!first) await (touch ? page.locator('#btnStart').tap() : page.locator('#btnStart').click());
  await page.waitForFunction(() => window.endfall && endfall.G.units.length > 0);
  if (!ai) await page.evaluate(() => endfall.engine.disableAi());
  // Games start fully zoomed out; the scenarios play closer in (as players do, and software WebGL draws the wide
  // view slowly enough to stretch a double-click past its window).
  const startZoom = await page.evaluate(() => endfall.cam.zoom);
  await page.evaluate((z) => { const c = endfall.G.bldgs.find(b => b.team === 0); endfall.cam.zoom = z; endfall.centerOn(c.x + 40, c.y); }, touch ? 1.75 : 2);
  // Touch: CDP in Chromium (taps and gestures); elsewhere Playwright's touchscreen, which can only tap.
  const cdp = touch && ENGINE === 'chromium' ? await ctx.newCDPSession(page) : null;
  const gesture = () => { if (!cdp) throw new Error(`a touch gesture in ${ENGINE_NAME}: ${CDP_TOUCH} (mark the test { chromium: CDP_TOUCH })`); };
  const ev = (fn, arg) => page.evaluate(fn, arg);

  const d = {
    page, errors, touch, startZoom,
    close: () => ctx.close(),
    eval: ev,
    /** Read world state (plain data). */
    state: () => ev(() => ({
      res: endfall.G.res[0].slice(), sup: endfall.G.sup[0].slice(), over: endfall.G.over, winner: endfall.G.winner,
      units: endfall.G.units.map(u => ({ id: u.id, type: u.type, team: u.team, x: u.x, y: u.y, task: u.task.t })),
      bldgs: endfall.G.bldgs.map(b => ({ id: b.id, type: b.type, team: b.team, tx: b.tx, ty: b.ty, x: b.x, y: b.y, w: b.w, h: b.h, done: b.done, progress: b.progress, queue: b.queue.slice() })),
      nodes: endfall.map.nodes.map(n => ({ id: n.id, type: n.type, tx: n.tx, ty: n.ty, x: n.x, y: n.y, r: n.r, w: n.w, h: n.h, amount: n.amount })),
    })),
    // Skip game time, then let the frame loop run twice (or 250 ms at most): what the skipped ticks raised (toasts,
    // alerts, effects) reaches the page as a player would see it, not on whichever frame comes next.
    skip: (s) => ev((s) => { endfall.skip(s); return new Promise(r => { const t = setTimeout(r, 250); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); r(); })); }); }, s),
    /** Fast-forward until `cond(arg)` holds in the page (checked every `step` s of game time, up to `seconds`), in one
     *  call into the page, then let two frames run as `skip` does. Returns whether it held. `cond` runs in the page:
     *  it may read only `endfall` and its argument. Faster than `until` for a plain wait (no round trip a step). */
    skipUntil: async (cond, arg, { seconds = 120, step = 0.5 } = {}) => {
      const ok = await ev(([src, arg, seconds, step]) => {
        const f = (0, eval)(`(${src})`);
        for (let t = 0; t < seconds; t += step) { if (f(arg)) return true; endfall.skip(step); }
        return !!f(arg);
      }, [cond.toString(), arg, seconds, step]);
      await d.skip(0);
      return ok;
    },
    grant: (gold, other) => ev(([a, b]) => endfall.setResources(0, a, b), [gold, other]),
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
      if (!cdp) { await page.touchscreen.tap(x, y); await page.waitForTimeout(60); return; }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(60);
    },
    /** Two quick taps (sent together: the software-rendered phone handles each tap late, so taps sent one after the
     *  other land outside the double-tap window). */
    async doubleTapAt(x, y) {
      gesture();
      const p = [{ x, y }];
      await Promise.all([['touchStart', p], ['touchEnd', []], ['touchStart', p], ['touchEnd', []]].map(([type, touchPoints]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints })));
      await page.waitForTimeout(120);
    },
    /** Left click (or tap) on a world point. */
    async clickWorld(wx, wy, opts = {}) { const [x, y] = await d.screen(wx, wy); if (touch) return d.tapAt(x, y); await page.mouse.click(x, y, opts); await page.waitForTimeout(60); },
    async rightClickWorld(wx, wy) { const [x, y] = await d.screen(wx, wy); await page.mouse.click(x, y, { button: 'right' }); await page.waitForTimeout(60); },
    /** Click on an entity by id, reading its position right before clicking (a worker inside a gold mine, which nobody
     *  can pick, is waited for: fast-forward until it comes out). */
    async clickEntity(id) {
      await d.skipUntil((id) => !endfall.G.units.find(u => u.id === id)?.inside, id, { seconds: 10, step: 1 / 30 });
      // Units move ~3 px per frame: center on the live position and get its screen point in one round trip,
      // then click right away.
      const canvas = await page.locator('#game').boundingBox();
      if (!touch) await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
      // (a unit on its body's middle, half its drawn height above its feet, where a player taps it; a building on its
      // footprint's center)
      const p = await ev((id) => {
        const u = endfall.G.units.find(u => u.id === id), e = u || endfall.G.bldgs.find(b => b.id === id); if (!e) return null;
        const y = u ? u.y - endfall.unitTop(u.type) / 2 : e.y;
        endfall.centerOn(e.x, y); const c = endfall.cam; return { x: (e.x - c.x) * c.zoom, y: (y - c.y) * c.zoom };
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
    /** Stop these units through the UI, so they stand still for a tap (a mining worker never does: it walks to its gold
     *  mine and back, and inside it cannot be tapped). One at a time, once it is on its way home from the mine (it will
     *  not go in for a while): a box round it (`margin` world px each way: room for its walk meanwhile, and on screen
     *  clear of the top bar and the console at any zoom), then S (Stop; on a phone too, the key
     *  works where the card has no button). The box takes any of ours in it, and fighters before workers: use it where
     *  no fighter stands near. */
    /** Stops these workers through the UI: a box round each on its way home from the mine, then S. `must: false` (a
     *  set-up that only wants them standing for a tap) logs instead of failing when one keeps gathering. */
    async stopByUI(ids, margin = 48, { must = true } = {}) {
      const away = (id) => { const u = endfall.G.units.find(u => u.id === id); return !u || u.task.t !== 'gather' || u.task.phase === 'return'; };
      for (const id of ids) {
        let t = null, boxed = [];
        for (let k = 0; k < 4 && t !== 'idle'; k++) { // (a box drawn on a slow frame can miss it: again, on its next trip)
          await d.skipUntil(away, id, { seconds: 20, step: 1 / 30 });
          if (await ev((id) => endfall.G.units.find(u => u.id === id)?.task.t !== 'gather', id)) { t = 'idle'; break; } // (stopped, or on another job)
          const [x, y] = await ev((id) => { const u = endfall.G.units.find(u => u.id === id); endfall.centerOn(u.x, u.y); return [u.x, u.y]; }, id);
          await d.key('Escape');
          await d.boxSelect(x - margin, y - margin, x + margin, y + margin);
          boxed = await d.selection();
          await d.key('s');
          await d.skip(0.1);
          t = await ev((id) => endfall.G.units.find(u => u.id === id)?.task.t, id);
        }
        if (t !== 'idle') {
          const why = await ev((id) => { const u = endfall.G.units.find(u => u.id === id); return { task: u?.task, sel: endfall.ui.sel.map(e => e.id), controls: localStorage.getItem('endfall.controls'), focus: document.activeElement?.id || document.activeElement?.tagName }; }, id);
          const msg = `stopByUI: unit ${id} still ${t} (boxed ${JSON.stringify(boxed)}; then ${JSON.stringify(why)})`;
          if (must) throw new Error(msg);
          console.warn(msg);
        }
      }
    },
    selection: () => ev(() => endfall.ui.sel.map(e => ({ id: e.id, type: e.type, kind: e.kind }))),
    /** Labels of the command card buttons as the player sees them, with their enabled state. */
    card: () => page.$$eval('#cmd button', bs => bs.map(b => ({ label: b.querySelector('.l').textContent, enabled: !b.disabled && b.getAttribute('aria-disabled') !== 'true' }))),
    /** Wait until the card shows `label` usable: after a set-up changed what it offers (a tech
     *  researched by the debug handle), the card is drawn again on a later frame. */
    readyCard: (label) => page.locator('#cmd button:not([disabled])', { hasText: label }).first().waitFor({ timeout: 5000 }),
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
    /** Select a harvester by clicking it, then place `type` (by its hotkey: B then it; or `hotkey` the keys to press,
     *  ['e', 'e'] in the WASD scheme) at tile (tx, ty) by clicking. */
    async buildWithUI(hotkey, type, tx, ty, harvesterId) {
      // A mining harvester moves (in and out of its gold mine, never standing still at it), and while it unloads it is
      // under the Core: a tap may miss it (or let go of it). So it is stopped first (`stopByUI`), then tapped, again a
      // little later each time, until it is the selection (a slow machine needs more than a few tries).
      await d.stopByUI([harvesterId], 48, { must: false }); // (only so it stands for the tap: the taps below retry)
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
      else for (const k of Array.isArray(hotkey) ? hotkey : ['b', hotkey]) await d.key(k);
      const w = await ev((t) => endfall.engine.BUILDINGS[t], type);
      const [x, y] = await d.screen((tx + w.w / 2) * 32, (ty + w.h / 2) * 32);
      // Touch: the ghost appears under the finger and follows it; drag it onto this exact spot and let go, as a
      // player would.
      if (touch) await d.dragTo(x + 48, y, x, y); else { await page.mouse.move(x, y); await page.mouse.click(x, y); }
      await page.waitForTimeout(80);
    },
    /** One finger from (x0, y0) to (x1, y1) in a few steps, then lifted. */
    /** One finger down, moved, lifted: separately, to look between. */
    async touchDown(x, y) { gesture(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await page.waitForTimeout(60); },
    async touchMove(x, y) { gesture(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] }); await page.waitForTimeout(60); },
    async touchUp() { gesture(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(60); },
    async dragTo(x0, y0, x1, y1) {
      gesture();
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
