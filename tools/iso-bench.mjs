// The trial's frame times: one scene and one camera path (world points), the projection off and on, on the phone profile (844x390
// DPR 2, touch) and at 1920x1080. The page's own loop is stopped; each frame is endfall.draw(),
// timed on the CPU (JS and GL calls queued), then a one-pixel readPixels (the frame finished: software GL's fill too).
//   flock /tmp/claude-1000/ebbfall-lab.lock node tools/iso-bench.mjs [runs] [?res=, 0.5 leaves little to fill] [frames]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { start, stop, browserContext, baseUrl, board } from '../test/e2e/harness.mjs';
const root = fileURLToPath(new URL('..', import.meta.url)), RUNS = +process.argv[2] || 5, RES = process.argv[3] || '', FRAMES = +process.argv[4] || 30, OUT = join(root, `../ebbfall-article/iso-trial/bench${RES && '-res' + RES}.json`);
const src = readFileSync(join(root, 'tools/view-capture.mjs'), 'utf8'), i0 = src.indexOf('function hudStage(auto)'), hudStage = eval('(' + src.slice(i0, src.indexOf('\n}\n', i0) + 2) + ')');
const DEV = { phone: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, desk: { viewport: { width: 1920, height: 1080 } } };
const ISO = { 0: '', 34: '34,0.512', 45: '45,0.5' }, rows = [];
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; }, p95 = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length * 0.95)]; };
await start();
try {
  for (let run = 0; run < RUNS; run++) for (const dev of Object.keys(DEV)) for (const iso of Object.keys(ISO)) {
    const ctx = await browserContext(DEV[dev]); await ctx.addInitScript(() => { const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (f) => window.__stop ? 0 : raf(f); Element.prototype.requestFullscreen = () => Promise.reject(new Error('no')); });
    const page = await ctx.newPage(); page.setDefaultTimeout(300000); page.on('pageerror', e => console.log('ERR', e.message));
    await page.goto(`${baseUrl()}?seed=4242${RES && '&res=' + RES}${ISO[iso] ? '&iso=' + ISO[iso] : ''}`, { waitUntil: 'networkidle' }); await page.waitForFunction(() => !!window.endfall);
    const press = (s) => DEV[dev].hasTouch ? page.locator(s).tap() : page.locator(s).click();
    await press('#btnSolo'); await board(page).race(1, 'vael'); await press('#btnStart'); await page.waitForFunction(() => { if (window.endfall?.G.units.length > 0) { window.__stop = true; return true; } });
    const s = await page.evaluate(hudStage);
    const measure = (crowd) => page.evaluate(([s, crowd, FRAMES]) => {
      const e = endfall, gl = document.getElementById('game').getContext('webgl2'), px = new Uint8Array(4), cpu = [], all = [];
      if (crowd) { for (let i = 0; i < 160; i++) e.engine.debugSpawn(i % 2, ['trooper', 'umbra', 'lancer', 'bruiser'][i % 4], s.field.x + ((i * 37) % 400) - 200, s.field.y + ((i * 53) % 300) - 150); e.skip(0.5); }
      e.cam.zoom = e.startZoom; const N = FRAMES;
      for (let i = -6; i < N; i++) {
        if (i % 2 === 0) e.skip(1 / 30);
        const f = Math.abs(((i + 6) % 24) / 12 - 1); e.centerOn(s.field.x + (s.hq.x - s.field.x) * f * 0.8, s.field.y + (s.hq.y - s.field.y) * f * 0.8);
        const t0 = performance.now(); e.draw(); const t1 = performance.now(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const t2 = performance.now();
        if (i >= 0) { cpu.push(t1 - t0); all.push(t2 - t0); }
      }
      return { cpu, all, units: e.G.units.length };
    }, [s, crowd, FRAMES]);
    for (const crowd of [false, true]) { const m = await measure(crowd); rows.push({ run, dev, iso, crowd, units: m.units, cpu: med(m.cpu), cpu95: p95(m.cpu), all: med(m.all), all95: p95(m.all) }); console.log(JSON.stringify(rows.at(-1))); }
    await ctx.close();
  }
} finally { await stop(); }
const sum = [];
for (const dev of Object.keys(DEV)) for (const crowd of [false, true]) for (const iso of Object.keys(ISO)) { const r = rows.filter(x => x.dev === dev && x.iso === iso && x.crowd === crowd), f = (k) => `${med(r.map(x => x[k])).toFixed(1)} (${Math.min(...r.map(x => x[k])).toFixed(1)}-${Math.max(...r.map(x => x[k])).toFixed(1)})`; sum.push({ dev, crowd, iso, cpu: f('cpu'), cpu95: f('cpu95'), all: f('all'), all95: f('all95') }); }
console.table(sum); writeFileSync(OUT, JSON.stringify({ rows, sum }, null, 1));
