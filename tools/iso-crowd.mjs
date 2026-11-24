// The trial's crowding: in the hud set's fight, how much of each fighter's body (its drawn box) is covered by others drawn over it, and by a
// building, the projection off and on; also the same with 60 fighters in a melee.  flock ... node tools/iso-crowd.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { start, stop, browserContext, baseUrl, board } from '../test/e2e/harness.mjs';
const root = fileURLToPath(new URL('..', import.meta.url)), src = readFileSync(join(root, 'tools/view-capture.mjs'), 'utf8'), i0 = src.indexOf('function hudStage(auto)'), hudStage = eval('(' + src.slice(i0, src.indexOf('\n}\n', i0) + 2) + ')');
await start();
try {
  for (const iso of ['', '34,0.512', '45,0.5']) {
    const ctx = await browserContext({ viewport: { width: 844, height: 390 } }), page = await ctx.newPage(); page.setDefaultTimeout(300000);
    await page.clock.install(); await page.goto(`${baseUrl()}?seed=4242${iso ? '&iso=' + iso : ''}`, { waitUntil: 'networkidle' }); await page.waitForFunction(() => !!window.endfall);
    await page.locator('#btnSolo').click(); await board(page).race(1, 'vael'); await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1000); await page.locator('#btnStart').click();
    await page.waitForFunction(() => window.endfall && endfall.G.units.length > 0, null, { polling: 100 });
    const s = await page.evaluate(hudStage);
    const measure = () => page.evaluate(() => {
      const e = endfall, z = e.cam.zoom, us = e.G.units.filter(u => !u.d.worker && !u.inside && !u.d.air && !u.dead).map(u => { const p = e.toScreen(u.x, u.y), w = u.r * 1.2 * 1.4; return { x0: p.x / z - w, x1: p.x / z + w, y0: p.y / z - e.unitTop(u.type), y1: p.y / z, z: p.y }; });
      const N = 10, cov = us.map(a => { let c = 0; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const x = a.x0 + (a.x1 - a.x0) * (i + 0.5) / N, y = a.y0 + (a.y1 - a.y0) * (j + 0.5) / N; if (us.some(b => b !== a && b.z > a.z && x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1)) c++; } return c / N / N; });
      return { n: us.length, mean: +(cov.reduce((s, v) => s + v, 0) / cov.length).toFixed(2), mostlyHidden: cov.filter(c => c > 0.6).length };
    });
    const a = await measure();
    await page.evaluate(([s]) => { const e = endfall, ids = [[], []]; for (let i = 0; i < 60; i++) { const t = i % 2; ids[t].push(e.engine.debugSpawn(t, t ? 'umbra' : 'trooper', s.field.x + (t ? -1 : 1) * (60 + (i % 5) * 26), s.field.y + (Math.floor(i / 10) - 3) * 34)); } ids.forEach((l, t) => l.forEach(id => { const u = e.G.units.find(u => u.id === id); if (u) e.engine.attackMove(u, s.field.x, s.field.y); })); e.skip(2.5); }, [s]);
    console.log(iso || 'off', JSON.stringify({ hud: a, melee: await measure() })); await ctx.close();
  }
} finally { await stop(); }
