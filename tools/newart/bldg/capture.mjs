// Stills of the new look's buildings beside today's, at the same held instants (the clock held, the state hash logged),
// as tools/view-capture.mjs does it: npm run build && node tools/newart/bldg/capture.mjs [--out DIR] [--only a,b]
// DIR (default ../ebbfall-article/new-art/bldg beside the main checkout) gets <still>-today.png and <still>-new.png.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { start, stop, browserContext, baseUrl, board } from '../../../test/e2e/harness.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = resolve(arg('--out', '/home/mazzucci/projects/ebbfall-article/new-art/bldg')), only = arg('--only', '').split(',').filter(Boolean);
const want = (n) => !only.length || only.includes(n);
mkdirSync(out, { recursive: true });
const D1 = { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }, D2 = { viewport: { width: 1728, height: 1000 }, deviceScaleFactor: 2 }, PH = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const SIZES = { 'd1': D1, 'd2': D2, 'phone': PH };
const log = [];

/** A game at its first instant, its clock held: `art` ('today' or 'new'), our people `race` against `foe`. */
async function game(art, device, { race = 'vael', foe = 'humans', fog = false, seed = 4242 } = {}) {
  const ctx = await browserContext({ ...device, serviceWorkers: 'block' }), page = await ctx.newPage();
  page.setDefaultTimeout(300000); page.on('pageerror', e => { log.push({ error: e.message }); console.log('ERROR', e.message); }); page.on('console', m => { if (m.type() === 'error' || /new art/.test(m.text())) console.log('[page]', m.text()); });
  if (device.hasTouch) await ctx.addInitScript(() => { Element.prototype.requestFullscreen = () => Promise.reject(new Error('no')); });
  await page.clock.install();
  await page.goto(`${baseUrl()}?seed=${seed}${art === 'new' ? '&art=new' : ''}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.endfall);
  const press = (s) => (device.hasTouch ? page.locator(s).tap() : page.locator(s).click());
  await press('#btnSolo'); await board(page).race(0, race); await board(page).race(1, foe);
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1000);
  await press('#btnStart'); await page.waitForFunction(() => endfall.G.units.length > 0, null, { polling: 100 });
  await page.evaluate((fog) => { const { engine: E, G } = endfall; E.disableAi(); endfall.setResources(G.me, 20000, 0); if (!fog) { E.revealAll(true); endfall.fog(false); } }, fog);
  await page.mouse.move(1, 1);
  // Helpers in the page: put(type, dx, dy[, until]) near our headquarters, its site built as far as `until` (0..1).
  await page.evaluate(() => {
    const { engine: E, G } = endfall, T = 32, hq = G.bldgs.find(b => b.team === G.me && b.d.hq); window.hq = { x: hq.x, y: hq.y, id: hq.id };
    window.scout = () => { for (const [x, y] of [[-700, 0], [-700, -600], [0, -700], [-350, -900], [-1000, -300]]) E.debugSpawn(G.me, 'observer', hq.x + x, hq.y + y); endfall.skip(0.3); };
    window.put = (type, dx, dy, until = 1, reach = 14) => {
      if (['kiln', 'spire'].includes(type) && !G.bldgs.some(b => b.type === 'siphon' && b.team === G.me)) put('siphon', -330, -40);
      if (E.BUILDINGS[type].hq) { scout(); reach = 40; }
      const d = E.BUILDINGS[type], x0 = Math.round((hq.x + dx) / T - d.w / 2), y0 = Math.round((hq.y + dy) / T - d.h / 2), w = G.units.filter(u => u.team === G.me && E.UNITS[u.type].worker);
      for (let r = 0; r < reach; r++) for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        if (Math.max(Math.abs(x), Math.abs(y)) !== r || !E.canPlace(type, x0 + x, y0 + y, G.me)) continue;
        for (const u of w) { const before = new Set(G.bldgs.map(b => b.id)); if ((window.why = E.placeBuilding(G.me, type, x0 + x, y0 + y, u))) continue;
          endfall.setResources(G.me, 20000, 0);
          for (let i = 0; i < 4000; i++) { endfall.skip(0.1); const b = G.bldgs.find(b => !before.has(b.id) && b.type === type); if (b && (until >= 1 ? b.done : b.progress >= until)) return b.id; }
          return null; }
      }
      console.error('[put]', type, window.why);
      return null;
    };
    window.clean = () => { for (const t of document.querySelectorAll('#msg .toast, #msg, #hint, #tut')) t.style.display = 'none'; };
  });
  return { ctx, page };
}
async function shoot(page, name, art, at, zoom, clip) {
  const s = await page.evaluate(([at, zoom]) => { if (zoom) endfall.cam.zoom = zoom === 'start' ? endfall.startZoom : zoom; if (at) endfall.centerOn(at.x, at.y); clean(); endfall.draw(); const { G, engine: E, cam } = endfall; return { hash: E.stateHash() >>> 0, time: G.time, zoom: cam.zoom, cam: [cam.x, cam.y] }; }, [at, zoom]);
  const file = `${name}-${art}.png`;
  await page.screenshot({ path: join(out, file), timeout: 300000, ...(clip ? { clip } : {}) });
  log.push({ file, ...s }); console.log(file, s.hash, s.zoom.toFixed(2));
}
/** A crop of `w` x `h` css px round world point (x, y), at `zoom`. */
async function crop(page, name, art, x, y, zoom, w, h) {
  const c = await page.evaluate(([x, y, zoom]) => { endfall.cam.zoom = zoom; endfall.centerOn(x, y); endfall.draw(); const r = document.getElementById('game').getBoundingClientRect(); return [r.left + (x - endfall.cam.x) * zoom, r.top + (y - endfall.cam.y) * zoom]; }, [x, y, zoom]);
  await shoot(page, name, art, null, null, { x: Math.max(0, Math.round(c[0] - w / 2)), y: Math.max(0, Math.round(c[1] - h / 2)), width: w, height: h });
}
const EX = [['substation', -220, -70], ['siphon', -330, 10], ['spire', -160, 40], ['spire', -240, 110], ['kiln', -130, 170], ['loom', 40, 200], ['ward', 110, 120], ['ward', -60, -150], ['uplink', 200, -60], ['eclipse', 190, 120], ['spire', -100, -180], ['kiln', 60, -190], ['substation', 150, -190], ['substation', 240, 220], ['spire', -320, -110], ['kiln', -320, 190], ['spire', -10, 310], ['substation', 130, 310]];
const KG = [['depot', -180, -100], ['depot', -250, -20], ['depot', -130, -170], ['barracks', -170, 90], ['forge', 130, -150], ['extractor', -230, 190], ['factory', -30, 200], ['airfield', 130, 180], ['turret', 160, 20], ['turret', 0, -180], ['depot', 240, -60], ['depot', 260, 60], ['barracks', 260, 240]];
const TYPES = { conflux: 'vael', kiln: 'vael', spire: 'vael', core: 'humans' };

await start();
try {
  for (const art of ['today', 'new']) {
    for (const race of ['vael', 'humans']) {
      const nm = race === 'vael' ? 'ex' : 'kg';
      for (const [sz, dev] of Object.entries(SIZES)) {
        if (want('start')) { const { ctx, page } = await game(art, dev, { race }); await shoot(page, `start-${nm}-${sz}`, art, { x: (await page.evaluate(() => hq.x)) + 40, y: await page.evaluate(() => hq.y) }, 'start'); await ctx.close(); }
        if (want('base')) {
          const { ctx, page } = await game(art, dev, { race });
          const ids = await page.evaluate((l) => l.map(([t, x, y]) => [t, put(t, x, y)]), race === 'vael' ? EX : KG);
          if (ids.some(i => !i[1])) console.log('not placed:', ids.filter(i => !i[1]).map(i => i[0]).join(' '));
          const p = await page.evaluate(() => ({ x: hq.x - 40, y: hq.y + 60 }));
          await shoot(page, `base-${nm}-${sz}`, art, p, 'start');
          if (sz === 'd2') await shoot(page, `base-${nm}-close-d2`, art, p, 2);
          await ctx.close();
        }
      }
    }
    if (want('build')) for (const [type, race] of Object.entries(TYPES)) {
      const { ctx, page } = await game(art, D2, { race });
      for (const pc of [10, 50, 90]) { const [id, x, y] = await page.evaluate(([t, u]) => { const { G } = endfall; let b = G.bldgs.find(b => b.type === t && !b.done); if (!b) { const id = put(t, -200, 120, u); b = G.bldgs.find(b => b.id === id); } for (let i = 0; i < 4000 && b.progress < u; i++) endfall.skip(0.1); return [b.id, b.x, b.y]; }, [type, pc / 100]); if (!id) continue; await crop(page, `build-${type}-${pc}`, art, x, y - 10, 2, 400, 400); }
      await ctx.close();
    }
    if (want('state')) for (const [type, race] of Object.entries(TYPES)) {
      const { ctx, page } = await game(art, { viewport: { width: 900, height: 620 }, deviceScaleFactor: 1 }, { race });
      const b = await page.evaluate((t) => { const { G } = endfall; let b = G.bldgs.find(b => b.team === G.me && b.type === t); if (!b) { const id = put(t, -200, 120); b = G.bldgs.find(b => b.id === id); } return { id: b.id, x: b.x, y: b.y, tx: b.tx, ty: b.ty, w: b.w, h: b.h }; }, type);
      const C = (n) => crop(page, `state-${type}-${n}`, art, b.x, b.y - 10, 2, 400, 400);
      await page.evaluate((id) => { const b = endfall.G.bldgs.find(b => b.id === id); endfall.ui.sel = [b]; }, b.id); await C('selected');
      await shoot(page, `state-${type}-hud`, art, b, 1.5);
      await page.evaluate(() => { endfall.ui.sel = []; });
      // our fighters north of it, behind its walls: their silhouettes
      await page.evaluate(([b, r]) => { const { engine: E, G } = endfall; for (let i = 0; i < 5; i++) E.debugSpawn(G.me, r === 'vael' ? 'umbra' : 'trooper', b.tx * 32 + 10 + i * (b.w * 32 - 20) / 4, b.ty * 32 - 14 - (i % 2) * 16); endfall.skip(0.1); }, [b, race]); await C('behind');
      // the placement ghost: allowed (beside it) and refused (over it)
      for (const [n, dx] of [['ghost-ok', 8], ['ghost-no', 1]]) { await page.evaluate(([t, b, dx]) => { const { engine: E, G, ui } = endfall; for (let d = dx; d < dx + 12; d++) if (dx === 1 || E.canPlace(t, b.tx - d, b.ty + 2, G.me)) { ui.place = { type: t, tx: b.tx - d, ty: b.ty + 2 }; break; } }, [type, b, dx]); const g = await page.evaluate(() => endfall.ui.place); if (g) await crop(page, `state-${type}-${n}`, art, (g.tx + b.w / 2) * 32, (g.ty + b.h / 2) * 32 - 10, 2, 400, 400); await page.evaluate(() => { endfall.ui.place = null; }); }
      // damaged (with the hit's flash), then falling: foes beside it
      await page.evaluate(([id]) => { const { engine: E, G } = endfall, b = G.bldgs.find(b => b.id === id); E.debugSetHp(id, b.maxhp * 0.2); endfall.skip(1 / 30); G.bldgs.find(b => b.id === id).flash = 0.1; }, [b.id]); await C('hit');
      await page.clock.runFor(600); await C('burning');
      const fell = await page.evaluate(([b]) => { const { engine: E, G } = endfall; E.debugSetHp(b.id, 1); const foe = [0, 1, 2, 3].find(t => t !== G.me); for (let i = 0; i < 4; i++) E.debugSpawn(foe, G.factions[foe] === 'vael' ? 'umbra' : 'lancer', b.x - 40 + i * 26, b.y + b.h * 16 + 40); return true; }, [b]);
      await page.evaluate((id) => { for (let i = 0; i < 400 && endfall.G.bldgs.some(b => b.id === id); i++) endfall.skip(1 / 30); }, b.id);
      await page.clock.runFor(150); await C('falling'); await page.clock.runFor(1600); await C('rubble');
      await ctx.close();
    }
    if (want('fog')) { // the enemy's Castle and Data center, seen and left: remembered in the fog
      for (const foe of ['humans', 'vael']) {
        const { ctx, page } = await game(art, D2, { race: 'humans', foe, fog: true });
        const p = await page.evaluate(() => { const { engine: E, G } = endfall, c = G.bldgs.find(b => b.team !== G.me && b.d.hq); endfall.fog(true); const id = E.debugSpawn(G.me, 'observer', c.x, c.y + 150); endfall.skip(0.5); endfall.draw(); const u = G.units.find(u => u.id === id); E.moveGroup?.([u], c.x - 100, c.y + 1400); endfall.skip(25); return { x: c.x, y: c.y }; });
        await crop(page, `fog-${foe === 'vael' ? 'conflux' : 'core'}`, art, p.x, p.y - 10, 2, 500, 400);
        await ctx.close();
      }
    }
  }
} finally { await stop(); }
writeFileSync(join(out, `shots-${only.join('-') || 'all'}.json`), JSON.stringify(log, null, 1));
const bad = [...new Set(log.filter(l => l.file?.endsWith('-today.png')).map(l => [l, log.find(m => m.file === l.file.replace('-today', '-new'))]).filter(([a, b]) => !b || a.hash !== b.hash).map(([a]) => a.file))];
console.log(bad.length ? `state hash differs: ${bad.join(' ')}` : 'same state in every pair');
