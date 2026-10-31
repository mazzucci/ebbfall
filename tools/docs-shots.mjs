// The docs' in-game screenshots (tools/docs/shots.mjs says what each shows): set up through the game's test hooks on
// the built game (dist/, `npm run build` first) in headless Chromium, captured, encoded as WebP by the browser itself
// (under 100 KB each: the quality steps down until it fits) into public/docs-img/shots/, which is committed. Run by
// hand when the game's look changes (not in CI): `node tools/docs-shots.mjs [key ...]` (all, or the keys named), then
// `npm run build` to see them in the docs. The scenes are set up as the e2e tests do (test/e2e/harness.mjs): a game
// with the computer switched off, units put on the map (`engine.debugSpawn`), orders and time skipped through the
// debug handle; the multiplayer room through a local relay (relay/server.mjs) and a friend in a second browser.
import { mkdirSync, writeFileSync } from 'node:fs';
import { start, stop, browserContext, baseUrl, board, DESKTOP, PHONE } from '../test/e2e/harness.mjs';
import { startRelay } from '../relay/server.mjs';
import { SHOTS, shotFile } from './docs/shots.mjs';

const OUT = new URL('../public/docs-img/shots/', import.meta.url);
const BUDGET = 100 * 1024;
const PORTRAIT = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const LANDSCAPE = { ...PHONE };
const WIDE = { ...DESKTOP, viewport: { width: 1280, height: 720 } };

/** A screenshot of `page` as WebP under BUDGET (the browser's own encoder; the quality steps down until it fits). */
async function webp(page, key) {
  await frames(page, 4); // (the HUD and the map drawn as the world is now: a software-rendered frame can take a while)
  const png = await page.screenshot({ type: 'png', timeout: 180000 });
  const bytes = await page.evaluate(async ([b64, budget]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
    for (let q = 0.82; ; q -= 0.06) {
      const blob = await new Promise(r => c.toBlob(r, 'image/webp', q));
      if (blob.size <= budget || q < 0.3) return [...new Uint8Array(await blob.arrayBuffer())];
    }
  }, [png.toString('base64'), BUDGET]);
  const buf = Buffer.from(bytes);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(new URL(shotFile(key), OUT), buf);
  console.log(`docs-shots: ${shotFile(key)} ${Math.round(buf.length / 1024)} KB`);
}

/** A single-player game set up through the menu (your race, the computer's), the computer switched off, the camera at
 *  `zoom`. Returns { ctx, page, ev }. */
async function game(device, { race = 'humans', enemy = 'vael', seed = 4242, zoom = 1.6 } = {}) {
  const ctx = await browserContext(device), page = await ctx.newPage();
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto(`${baseUrl()}?seed=${seed}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
  const tap = (sel) => (device.hasTouch ? page.locator(sel).tap() : page.locator(sel).click());
  await tap('#btnSolo');
  if (race !== 'humans') await board(page).race(0, race);
  if (enemy !== 'humans') await board(page).race(1, enemy);
  await tap('#btnStart');
  await page.waitForFunction(() => window.endfall && endfall.G.units.length > 0, null, { timeout: 60000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await ev(() => endfall.engine.disableAi());
  await ev((z) => { endfall.cam.zoom = z; }, zoom);
  return { ctx, page, ev, tap };
}
/** Buildings put up near your headquarters through the game's own order (a worker put on the map for each: it plants
 *  or builds), the resources granted; `rigs`: Ether Rigs (the race's) on the base's two vents too. Then time skipped
 *  until they stand. */
async function build(ev, plan, rigs = false) {
  await ev(([plan, rigs]) => {
    const E = endfall.engine, G = endfall.G, f = E.FACTIONS[G.factions[0]], hq = G.bldgs.find(b => b.team === 0 && b.type === f.hq);
    endfall.setResources(0, 5000, 5000);
    const at = { tx: Math.floor(hq.x / 32), ty: Math.floor(hq.y / 32) };
    const spot = (type) => { for (let r = 4; r < 18; r++) for (let a = 0; a < 40; a++) { const tx = Math.round(at.tx + Math.cos(a / 40 * 6.283) * r), ty = Math.round(at.ty + Math.sin(a / 40 * 6.283) * r); if (E.canPlace(type, tx, ty, 0)) return { tx, ty }; } return null; };
    const worker = () => { const id = E.debugSpawn(0, f.worker, hq.x + 70, hq.y + 70); return G.units.find(u => u.id === id); };
    for (const type of plan) { const s = spot(type); if (s) E.placeBuilding(0, type, s.tx, s.ty, worker()); }
    if (rigs) {
      const vents = endfall.map.nodes.filter(n => n.type === 'ether').sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y)).slice(0, 2);
      for (const v of vents) E.placeBuilding(0, f.ether, v.tx, v.ty, worker());
    }
  }, [plan, rigs]);
  await ev(() => endfall.skip(60));
}
/** Room for an army: supply buildings first (so the top bar reads like a game's), and plausible resources. */
async function supply(ev, n = 4) {
  await ev((n) => { const f = endfall.engine.FACTIONS[endfall.G.factions[0]]; window.__plan = Array(n).fill(f.supply); }, n);
  const plan = await ev(() => window.__plan);
  await build(ev, plan);
  await ev(() => endfall.setResources(0, 640, 315));
}
/** `n` frames drawn (each one the game's loop: the world, the HUD). */
const frames = (page, n) => page.evaluate((n) => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
/** Let the game run `ms` of real time (its frames: the effects, the shells in flight). */
const run = (page, ms) => page.waitForTimeout(ms);

/** Put armies on the map: [team, kind, x, y] each; returns their ids. */
const spawn = (ev, list) => ev((list) => list.map(([t, k, x, y]) => endfall.engine.debugSpawn(t, k, x, y)), list);
/** Every unit of `ids` attack-moves to (x, y). */
const attack = (ev, ids, x, y) => ev(([ids, x, y]) => { for (const id of ids) { const u = endfall.G.units.find(u => u.id === id); if (u) endfall.engine.attackMove(u, x, y); } }, [ids, x, y]);
/** A row of `n` of `kind` for `team` from (x, y), `dx` apart (and `dy`). */
const row = (team, kind, n, x, y, dx = 22, dy = 0) => Array.from({ length: n }, (_, i) => [team, kind, x + i * dx, y + i * dy]);
/** The middle of the map (world px). */
const middle = (ev) => ev(() => ({ x: endfall.engine.MW * 16, y: endfall.engine.MH * 16 }));

const SCENES = {
  /** A clash in the open, on a phone on its side: Troopers, Lancers and a Vanguard against Scythes and Prisms. */
  async battle() {
    const { ctx, page, ev, tap } = await game(LANDSCAPE, { zoom: 1.9 });
    try {
      await supply(ev);
      const m = await middle(ev), x = m.x, y = m.y;
      const ours = await spawn(ev, [...row(0, 'trooper', 6, x - 150, y - 40, 0, 22), ...row(0, 'lancer', 2, x - 175, y - 10, 0, 26), [0, 'vanguard', x - 190, y + 30]]);
      const theirs = await spawn(ev, [...row(1, 'scythe', 5, x + 120, y - 50, 0, 26), ...row(1, 'prism', 3, x + 165, y - 30, 0, 30)]);
      await attack(ev, ours, x + 200, y); await attack(ev, theirs, x - 200, y);
      await ev(([x, y]) => endfall.centerOn(x, y), [x, y]);
      await tap('#btnArmy').catch(() => {});
      await ev(([x, y]) => endfall.centerOn(x, y), [x - 10, y + 10]);
      await page.waitForFunction(() => endfall.G.units.some(u => u.team === 1 && u.hp < u.d.hp), null, { timeout: 30000 }).catch(() => {});
      await run(page, 1200);
      await webp(page, 'battle');
    } finally { await ctx.close(); }
  },
  /** Siege Tanks deployed behind a line, shelling a Vael force coming on. */
  async siege() {
    const { ctx, page, ev } = await game(WIDE, { zoom: 1.6 });
    try {
      await supply(ev);
      const m = await middle(ev), x = m.x - 120, y = m.y;
      const tanks = await spawn(ev, row(0, 'siegeTank', 4, x - 120, y - 96, 0, 64));
      await ev((ids) => endfall.engine.castAbility(ids.map(id => endfall.G.units.find(u => u.id === id)), 'deploy'), tanks);
      await spawn(ev, [...row(0, 'trooper', 5, x + 20, y - 80, 0, 36), [0, 'vanguard', x + 50, y - 20], [0, 'vanguard', x + 50, y + 40], [0, 'observer', x + 160, y - 30]]);
      const theirs = await spawn(ev, [...row(1, 'scythe', 6, x + 300, y - 90, 0, 34), ...row(1, 'monolith', 2, x + 360, y - 40, 0, 70)]);
      await run(page, 3500); // (deploying: 3 s)
      await attack(ev, theirs, x - 200, y);
      await ev(([x, y]) => endfall.centerOn(x, y), [x + 100, y - 10]);
      // (until the tanks' shells land: an enemy inside their range)
      await page.waitForFunction((ids) => endfall.G.units.some(u => u.team === 1 && ids.some(id => { const t = endfall.G.units.find(v => v.id === id); return t && Math.hypot(t.x - u.x, t.y - u.y) < 10 * 32; })), tanks, { timeout: 60000 }).catch(() => {});
      await run(page, 1500);
      await webp(page, 'siege');
    } finally { await ctx.close(); }
  },
  /** Vael Umbras (always cloaked: their own side sees them shimmer) cutting into a Human line, Scythes and Prisms behind. */
  async umbra() {
    const { ctx, page, ev } = await game(WIDE, { race: 'vael', enemy: 'humans', zoom: 2 });
    try {
      await supply(ev);
      const m = await middle(ev), x = m.x, y = m.y;
      const ours = await spawn(ev, [...row(0, 'umbra', 4, x - 60, y - 60, 0, 40), ...row(0, 'scythe', 3, x - 160, y - 40, 0, 40), ...row(0, 'prism', 2, x - 200, y - 20, 0, 50)]);
      const theirs = await spawn(ev, [...row(1, 'trooper', 6, x + 110, y - 80, 0, 30), [1, 'siegeTank', x + 200, y - 40], [1, 'siegeTank', x + 200, y + 40]]);
      await attack(ev, ours, x + 260, y); await attack(ev, theirs, x - 260, y);
      await page.waitForFunction(() => endfall.G.units.some(u => u.team === 1 && u.hp < u.d.hp), null, { timeout: 30000 }).catch(() => {});
      await ev((ids) => { const us = endfall.G.units.filter(u => ids.includes(u.id)); endfall.centerOn(us.reduce((a, u) => a + u.x, 0) / us.length + 60, us.reduce((a, u) => a + u.y, 0) / us.length); }, ours.slice(0, 4));
      await run(page, 1000);
      await webp(page, 'umbra');
    } finally { await ctx.close(); }
  },
  /** A Human base a few minutes in: placed and built through the game's own orders, time skipped. */
  async base() {
    const { ctx, page, ev } = await game(WIDE, { zoom: 1.45, enemy: 'humans' });
    try {
      await build(ev, ['depot', 'barracks', 'depot'], true);
      await build(ev, ['forge', 'factory', 'turret', 'airfield', 'depot']); // (they need the Garrison standing)
      await ev(() => endfall.skip(75));
      await ev(() => { const E = endfall.engine, G = endfall.G; for (const [t, k] of [['barracks', 'trooper'], ['factory', 'siegeTank'], ['airfield', 'raider']]) { const b = G.bldgs.find(b => b.team === 0 && b.type === t && b.done); if (b) { E.queueUnit(b, k); E.queueUnit(b, k); } } });
      await ev(() => endfall.skip(40));
      await ev(() => endfall.setResources(0, 1240, 615));
      await ev(() => { const c = endfall.G.bldgs.find(b => b.team === 0 && b.type === 'core'); endfall.centerOn(c.x + 30, c.y + 10); });
      await run(page, 1200);
      await webp(page, 'base');
    } finally { await ctx.close(); }
  },
  /** The multiplayer room on a phone held upright: Ann's room, Bo joined from a laptop, a computer in the third seat. */
  async lobby() {
    const relay = startRelay({ port: 0 }); await relay.ready;
    const relayQ = `relay=${encodeURIComponent(`ws://localhost:${relay.port}/`)}`;
    const open = async (device, q) => {
      const ctx = await browserContext(device), p = await ctx.newPage();
      await p.goto(`${baseUrl()}?${q}`, { waitUntil: 'networkidle' }); await p.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
      return { ctx, p, tap: (sel) => (device.hasTouch ? p.locator(sel).tap() : p.locator(sel).click()) };
    };
    const a = await open(PORTRAIT, relayQ);
    let b = null;
    try {
      await a.tap('#btnOnline'); await a.p.locator('#onlineName').fill('Ann'); await a.tap('#btnNewRoom');
      await a.p.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('roomShow').textContent));
      const code = await a.p.locator('#roomShow').textContent();
      b = await open(DESKTOP, `${relayQ}&room=${code}`);
      await b.p.locator('#onlineName').fill('Bo'); await b.tap('#btnJoinRoom');
      await a.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .tok').length === 2 && !/OPEN SEAT/.test(document.getElementById('onlineBoard').textContent), null, { timeout: 30000 });
      await a.tap('#onlineBoard [data-k="addai"]'); // (a computer in the next seat)
      await a.p.waitForFunction(() => document.querySelectorAll('#onlineBoard .tok').length === 3, null, { timeout: 30000 });
      await b.tap('#btnOnlineReady');
      await a.p.waitForTimeout(800);
      await webp(a.p, 'lobby');
    } finally { await a.ctx.close(); await b?.ctx.close(); await relay.close(); }
  },
  /** The menu's first page on a phone held upright. */
  async menu() {
    const ctx = await browserContext(PORTRAIT), page = await ctx.newPage();
    try {
      await page.goto(baseUrl(), { waitUntil: 'networkidle' }); await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
      await page.evaluate(() => { for (const a of document.getAnimations()) a.pause(); });
      await webp(page, 'menu');
    } finally { await ctx.close(); }
  },
};

const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENES);
for (const k of want) if (!SCENES[k] || !SHOTS[k]) throw new Error(`docs-shots: no scene ${k} (${Object.keys(SCENES).join(', ')})`);
await start();
try { for (const k of want) await SCENES[k](); } finally { await stop(); }
