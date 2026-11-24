// The trial's other stills at 1920x1080: the Expedition's range rim, a site being placed, a screen box on the ground, the
// whole map, the Lake's water, and a unit at each corner of the Castle (the draw order).  flock ... node tools/iso-extras.mjs [34,0.512]
import { join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { start, stop, browserContext, baseUrl, board } from '../test/e2e/harness.mjs';
const ISO = process.argv[2] || '34,0.512', tag = ISO === '0' ? 'iso0' : 'iso' + ISO.split(',')[0];
const out = resolve(join(fileURLToPath(new URL('..', import.meta.url)), '../ebbfall-article/iso-trial/stills')); mkdirSync(out, { recursive: true });
async function game(q, race) {
  const ctx = await browserContext({ viewport: { width: 1920, height: 1080 } }), page = await ctx.newPage(); page.setDefaultTimeout(300000); page.on('pageerror', e => console.log('ERR', e.message));
  await page.clock.install(); await page.goto(`${baseUrl()}?${q}${ISO === '0' ? '' : '&iso=' + ISO}`, { waitUntil: 'networkidle' }); await page.waitForFunction(() => !!window.endfall);
  await page.locator('#btnSolo').click(); if (race) await board(page).race(0, race).catch(e => console.log('race', e.message)); else await board(page).race(1, 'vael');
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1000); await page.locator('#btnStart').click();
  await page.waitForFunction(() => window.endfall && endfall.G.units.length > 0, null, { polling: 100 }); await page.evaluate(() => { endfall.engine.disableAi(); }); await page.mouse.move(2, 300);
  return { ctx, page, shot: async (n) => { await page.evaluate(() => { endfall.draw(); endfall.draw(); for (const t of document.querySelectorAll('.toast')) t.remove(); }); await page.screenshot({ path: join(out, `${n}-desk-${tag}.png`) }); console.log(n); } };
}
await start();
try {
  { // the draw order, a site, a box
    const g = await game('seed=4242');
    await g.page.evaluate(() => { const e = endfall, b = e.G.bldgs[0]; e.engine.revealAll(true); e.fog(false); e.setResources(0, 3000, 0);
      const x0 = b.tx * 32, y0 = b.ty * 32, w = b.w * 32; window.ring = [];
      for (const [x, y] of [[x0 - 12, y0 - 12], [x0 + w + 12, y0 - 12], [x0 + w + 12, y0 + w + 12], [x0 - 12, y0 + w + 12], [x0 + w / 2, y0 - 12], [x0 + w + 12, y0 + w / 2], [x0 + w / 2, y0 + w + 12], [x0 - 12, y0 + w / 2], [x0 + w + 12, y0 + 10], [x0 - 12, y0 + w - 10]]) ring.push(e.engine.debugSpawn(0, 'trooper', x, y));
      e.skip(0.1); e.ui.sel.splice(0, 99, ...e.G.units.filter(u => ring.includes(u.id)), ); e.centerOn(b.x, b.y); });
    await g.shot('order');
    await g.page.evaluate(() => { const e = endfall, b = e.G.bldgs[0], w = e.G.units.find(u => u.d.worker); e.ui.sel.splice(0, 99, w); let n = 0; for (let r = 4; r < 9 && !n; r++) for (let d = -r; d <= r && !n; d++) if (e.engine.canPlace('barracks', b.tx + d, b.ty - r, 0)) { e.ui.place = { type: 'barracks', tx: b.tx + d, ty: b.ty - r }; n = 1; } e.centerOn(b.x, b.y - 100); });
    await g.shot('place');
    await g.page.evaluate(() => { endfall.ui.place = null; endfall.draw(); endfall.ui.sel.length = 0; endfall.cam.zoom = 0.62; endfall.centerOn(1024, 1024); }); await g.shot('whole');
    await g.ctx.close();
  }
  { // the Expedition: its range rim, with a machine selected and another building
    const g = await game('seed=4242', 'vael');
    await g.page.evaluate(() => { const e = endfall, b = e.G.bldgs[0]; e.ui.sel.splice(0, 9, b); e.skip(0.2); e.engine.revealAll(true); e.centerOn(b.x, b.y); });
    await g.shot('range'); console.log(JSON.stringify(await g.page.evaluate(() => [endfall.G.factions, endfall.rangeShown().shown])));
    await g.page.evaluate(() => { const e = endfall; e.fog(false); e.cam.zoom = 0.8; e.centerOn(1400, 1400); }); await g.shot('range-out'); await g.ctx.close();
  }
  {
    const g = await game('map=13'); await g.page.evaluate(() => { const e = endfall; e.engine.revealAll(true); e.fog(false); e.centerOn(e.map.nodes.length ? 1024 : 1024, 1024); }); await g.shot('lake');
    console.log(await g.page.evaluate(() => endfall.G.mapKind)); await g.ctx.close();
  }
} finally { await stop(); }
