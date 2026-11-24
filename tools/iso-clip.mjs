// The trial's clip: 20 s at 15 frames a second, 1280x720, the clock held and run a frame at a time (JPEGs under target/iso/frames, then
// an mp4 beside the report).  flock ... node tools/iso-clip.mjs [34,0.512]
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { start, stop, browserContext, baseUrl, board } from '../test/e2e/harness.mjs';
const root = fileURLToPath(new URL('..', import.meta.url)), ISO = process.argv[2] || '34,0.512', FPS = 15, dir = join(root, 'target/iso/frames');
rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
const src = readFileSync(join(root, 'tools/view-capture.mjs'), 'utf8'), i0 = src.indexOf('function hudStage(auto)'), hudStage = eval('(' + src.slice(i0, src.indexOf('\n}\n', i0) + 2) + ')');
await start();
try {
  const ctx = await browserContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage(); page.setDefaultTimeout(300000); page.on('pageerror', e => console.log('ERR', e.message));
  await page.clock.install(); await page.goto(`${baseUrl()}?seed=4242&iso=${ISO}`, { waitUntil: 'networkidle' }); await page.waitForFunction(() => !!window.endfall);
  await page.locator('#btnSolo').click(); await board(page).race(1, 'vael'); await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1000); await page.locator('#btnStart').click();
  await page.waitForFunction(() => window.endfall && endfall.G.units.length > 0, null, { polling: 100 });
  await page.evaluate((ms) => { window.requestAnimationFrame = (f) => setTimeout(() => f(performance.now()), ms); }, 1000 / FPS - 1); // (one draw a frame)
  const s = await page.evaluate(hudStage); await page.mouse.move(640, 300);
  let n = 0; const frame = async (k = 1, each) => { for (let i = 0; i < k; i++) { if (each) await each(i / k); await page.clock.runFor(1000 / FPS); await page.screenshot({ path: join(dir, `f${String(n++).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 }); } };
  const look = (x, y) => page.evaluate(([x, y]) => endfall.centerOn(x, y), [x, y]), at = (x, y) => page.evaluate(([x, y]) => { const p = endfall.toScreen(x, y), r = document.getElementById('game').getBoundingClientRect(); return { x: p.x + r.left, y: p.y + r.top }; }, [x, y]);
  const ease = (t) => t * t * (3 - 2 * t);
  await look(s.hq.x, s.hq.y); await frame(45); // the base at work
  await frame(45, (t) => look(s.hq.x + (s.army.x - s.hq.x) * ease(t), s.hq.y + (s.army.y - s.hq.y) * ease(t))); // a pan to the fight
  await page.evaluate(([p]) => { for (let i = 0; i < 10; i++) endfall.engine.debugSpawn(0, i % 2 ? 'trooper' : 'knight', p.x + 90 + (i % 5) * 30, p.y - 60 + Math.floor(i / 5) * 40); }, [s.army]); // (a reserve behind the line)
  await frame(30); // the fight
  const box = await page.evaluate(() => { const a = endfall.G.units.filter(u => u.team === 0 && !u.d.worker && !u.dead).map(u => endfall.toScreen(u.x, u.y)); return [Math.min(...a.map(p => p.x)) - 30, Math.min(...a.map(p => p.y)) - 60, Math.max(...a.map(p => p.x)) + 30, Math.max(...a.map(p => p.y)) + 20]; });
  const B = [Math.max(250, box[0]), Math.max(60, box[1]), Math.min(1000, box[2]), Math.min(590, box[3])]; // (clear of the panels)
  await page.mouse.move(B[0], B[1]); await page.mouse.down();
  for (let i = 1; i <= 15; i++) { await page.mouse.move(B[0] + (B[2] - B[0]) * i / 15, B[1] + (B[3] - B[1]) * i / 15); await frame(); }
  await page.mouse.up(); await frame(8);
  for (const [dx, dy] of [[-260, -120], [200, 60], [-80, 220]]) { const p = await at(s.army.x + dx, s.army.y + dy); await page.mouse.click(Math.min(1000, Math.max(250, p.x)), Math.min(590, Math.max(70, p.y)), { button: 'right' }); await frame(32); } // three moves, across the screen's diagonals
  await frame(24, async () => { await page.mouse.move(640, 320); await page.keyboard.down('Control'); await page.mouse.wheel(0, 2); await page.keyboard.up('Control'); }); // zooming out
  await frame(40, (t) => look(s.army.x + (s.hq.x - s.army.x) * ease(t), s.army.y + (s.hq.y - s.army.y) * ease(t)));
  console.log(n, 'frames', JSON.stringify(await page.evaluate(() => [endfall.ui.sel.length, endfall.cam.zoom]))); await ctx.close();
} finally { await stop(); }
execFileSync('/home/mazzucci/projects/ebbfall-trailer3/.tools/ffmpeg/ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, 'f%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', join(root, '../ebbfall-article/iso-trial', `clip-iso${ISO.split(',')[0]}.mp4`)]);
