// The trial's stills: the hud set's scene (tools/view-capture.mjs hudStage) with the projection off and on, the same
// instant (one state hash). The page's clock is held; each still is drawn with endfall.draw.
//   npx vite build && flock /tmp/claude-1000/ebbfall-lab.lock node tools/iso-capture.mjs [--out DIR] [--only desk,phone] [--iso 0,34,45] [--shots start,base,fight]
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { start, stop, browserContext, baseUrl, board } from '../test/e2e/harness.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = resolve(arg('--out', join(root, '../ebbfall-article/iso-trial/stills'))); mkdirSync(out, { recursive: true });
const DEVICES = { desk: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }, phone: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } };
const ISO = { 0: '', 34: '34,0.512', 45: '45,0.5' };
const src = readFileSync(join(root, 'tools/view-capture.mjs'), 'utf8'), i0 = src.indexOf('function hudStage(auto)'), hudStage = eval('(' + src.slice(i0, src.indexOf('\n}\n', i0) + 2) + ')');
const pick = (s, all) => (s ? s.split(',') : all), log = [];
await start();
try {
  for (const dev of pick(arg('--only'), ['desk', 'phone'])) for (const iso of pick(arg('--iso'), ['0', '34', '45'])) {
    const device = DEVICES[dev], ctx = await browserContext(device), page = await ctx.newPage(), errors = [];
    page.setDefaultTimeout(300000); page.on('pageerror', e => errors.push(e.message));
    if (device.hasTouch) await ctx.addInitScript(() => { Element.prototype.requestFullscreen = () => Promise.reject(new Error('(no full screen)')); });
    await page.clock.install();
    await page.goto(`${baseUrl()}?seed=4242${ISO[iso] ? '&iso=' + ISO[iso] : ''}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.endfall, null, { timeout: 120000 });
    const press = (sel) => device.hasTouch ? page.locator(sel).tap() : page.locator(sel).click();
    await press('#btnSolo'); await board(page).race(1, 'vael');
    await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1000);
    await press('#btnStart');
    await page.waitForFunction(() => window.endfall && endfall.G.units.length > 0, null, { polling: 100 });
    await page.evaluate(() => document.fonts.ready); await page.mouse.move(2, 300);
    const shot = async (name, at) => {
      const r = await page.evaluate(([at]) => {
        const e = endfall; if (at) { e.cam.zoom = at.zoom || e.startZoom; e.centerOn(at.x, at.y); } e.draw(); e.draw();
        for (const t of document.querySelectorAll('.toast')) t.remove();
        return { zoom: e.cam.zoom, limit: e.zoomMin, view: { w: e.view.w, h: e.view.h }, hash: e.engine.stateHash() >>> 0, sel: e.ui.sel.length };
      }, [at]);
      const file = `${name}-${dev}-iso${iso}.png`; await page.screenshot({ path: join(out, file), timeout: 300000 });
      console.log(file, JSON.stringify(r)); log.push({ file, ...r });
    };
    const shots = pick(arg('--shots'), ['start', 'base', 'fight', 'out']);
    if (shots.includes('start')) await shot('start');
    if (shots.some(s => s !== 'start')) {
      const s = await page.evaluate(hudStage); await page.evaluate(() => endfall.draw());
      if (device.hasTouch) await page.locator('#btnArmy').tap(); else await page.keyboard.press('q');
      await page.mouse.move(2, 300);
      if (shots.includes('base')) await shot('base', dev === 'desk' ? { x: s.hq.x - 20, y: s.hq.y } : s.hq);
      if (shots.includes('fight')) await shot('fight', { x: s.army.x, y: s.army.y });
      if (shots.includes('out')) await shot('out', { x: s.hq.x - 200, y: s.hq.y - 160, zoom: await page.evaluate(() => endfall.zoomMin) });
      if (shots.includes('fog')) { await page.evaluate(() => endfall.fog(false)); await shot('whole', { x: s.hq.x - 300, y: s.hq.y - 300, zoom: 0.5 }); }
      if (shots.includes('corner')) for (const [n, x, y] of [['left', 0, 2048], ['top', 0, 0], ['right', 2048, 0], ['bottom', 2048, 2048]]) await shot('corner-' + n, { x, y });
    }
    if (errors.length) console.log('ERRORS', errors);
    await ctx.close();
  }
} finally { await stop(); }
const f = join(out, 'shots.json'), old = existsSync(f) ? JSON.parse(readFileSync(f)) : [];
writeFileSync(f, JSON.stringify([...old.filter(o => !log.some(l => l.file === o.file)), ...log], null, 1));
