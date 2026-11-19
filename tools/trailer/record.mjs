// The trailer's recorder (grown from the docs' clip, tools/docs/shots.mjs `clip`): each segment of the shot list
// (tools/trailer/shots.mjs) is staged in the real game (the built dist/: run `npm run build` first) through the debug
// handle, then its frames are stepped by hand at 30 fps (stage.mjs `freeze`: each frame is exactly 1/30 s of game time,
// or several ticks for a time-lapse), the camera set every frame (an eased push-in, a drift, a nudge), the overlays too
// (overlay.mjs: captions in the game's fonts, the flash, the grading, the end card), each frame screenshot at DPR 2 and
// piped into ffmpeg. One file per part (target/trailer/<format>/<part>.mkv, near-lossless) with the effects the game
// asked for in it (<part>.sfx.json, for tools/trailer/sound.mjs); tools/trailer/cut.mjs cuts the versions from them.
//   node tools/trailer/record.mjs [--format 16x9|9x16|both] [--preview] [segment ...]
//     (default: both formats, every segment; --preview: DPR 1 at 10 fps, for staging, into target/trailer/preview-<format>/)
// ffmpeg: FFMPEG, else .tools/ffmpeg/ffmpeg (a static build with libx264, e.g. johnvansickle.com/ffmpeg), else the PATH's.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openStage, game, freeze } from './stage.mjs';
import { install, apply } from './overlay.mjs';
import { SEGMENTS } from './shots.mjs';

const root = new URL('../../', import.meta.url);
export const FFMPEG = process.env.FFMPEG || (existsSync(fileURLToPath(new URL('.tools/ffmpeg/ffmpeg', root))) ? fileURLToPath(new URL('.tools/ffmpeg/ffmpeg', root)) : 'ffmpeg');
export const FPS = 30;
const VIEW = { '16x9': { width: 960, height: 540 }, '9x16': { width: 540, height: 960 } };
/** The landscape phone of the docs' shots (iPhone 12-14 sideways), at its own DPR 3, touch. */
const PHONE_LAND = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

/** An ffmpeg reading PNG frames on stdin into a near-lossless intermediate. */
export function encoder(file, fps) {
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv444p', '-c:v', 'libx264', '-preset', 'fast', '-crf', '8',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((ok, no) => ff.on('close', (c) => (c === 0 ? ok() : no(new Error(`ffmpeg exited ${c} for ${file}`)))));
  return {
    write: (buf) => new Promise(ok => (ff.stdin.write(buf) ? ok() : ff.stdin.once('drain', ok))),
    end: () => { ff.stdin.end(); return done; },
  };
}

/** One frame in the page: the camera (world center and zoom, plus a nudge in world px), then the frame itself (unless frozen). */
const frame = (page, cam, ms, ticks) => page.evaluate(([c, ms, ticks]) => {
  const e = window.endfall;
  if (c) { e.cam.zoom = c.zoom; e.centerOn(c.x, c.y); e.cam.x += c.dx || 0; e.cam.y += c.dy || 0; }
  if (ms > 0) window.__frame(ms, ticks);
}, [cam, ms, ticks]);

/** The page's pixels at its DPR (CDP's capture is in CSS pixels unless clipped at that scale). */
export async function capture(cdp, view, dpr) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, clip: { x: 0, y: 0, width: view.width, height: view.height, scale: dpr } });
  return Buffer.from(data, 'base64');
}

/** The compose page for a phone segment: the landscape phone's frames inside the video's frame, with the overlays. */
async function composer(stage, fmt, dpr, sheets) {
  const page = await stage.browser.newPage({ viewport: VIEW[fmt], deviceScaleFactor: dpr });
  await page.goto(`${stage.origin}robots.txt`);
  await page.setContent(`<!doctype html><html><head>${sheets.map(h => `<link rel="stylesheet" href="${h}">`).join('')}<style>
    html,body{margin:0;width:100%;height:100%;background:#0b0f16;overflow:hidden} #app,#start,#top,#hud,#stage{display:none!important}
    #ph{position:absolute;box-sizing:content-box;background:#000}
    #ph img{display:block;width:100%;height:100%}
    canvas#game{display:none}
  </style></head><body><canvas id="game"></canvas><div id="ph"><img></div></body></html>`);
  await install(page, fmt);
  const cdp = await page.context().newCDPSession(page);
  return { page, cdp };
}

export async function recordSegment(stage, seg, fmt, { preview = false, out }) {
  const fps = preview ? 10 : FPS, dpr = preview ? 1 : 2;
  const device = seg.phone ? { ...PHONE_LAND, deviceScaleFactor: preview ? 1 : 3 } : { viewport: VIEW[fmt], deviceScaleFactor: dpr };
  const { ctx, page } = await game(stage, device, { as: seg.as, ai: !!seg.ai, hud: !!seg.phone });
  const comp = seg.phone ? await composer(stage, fmt, dpr, await page.evaluate(() => [...document.styleSheets].map(s => s.href).filter(Boolean))) : null;
  try {
    const a = await page.evaluate(seg.scene, { fmt });
    if (!seg.phone) await install(page, fmt);
    const first = seg.parts[0].cam?.(0, a, fmt, {});
    await frame(page, first, 0, 1);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 600)))));
    await freeze(page);
    const cdp = await ctx.newCDPSession(page);
    const state = { a, fmt, taps: [] };
    for (const part of seg.parts) {
      const file = `${out}/${part.name}.mkv`, enc = encoder(file, fps), n = Math.round(part.seconds * fps), t0 = await page.evaluate(() => performance.now());
      const actions = [...(part.at || [])].sort((x, y) => x.t - y.t);
      const t1 = Date.now(); let last = null, stale = 0;
      for (let i = 0; i < n; i++) {
        const t = i / fps;
        while (actions.length && actions[0].t <= t + 1e-6) await actions.shift().run(page, state, t);
        if (part.follow) state.follow = await page.evaluate(part.follow);
        const cam = part.cam ? part.cam(t, a, fmt, state) : null, ticks = typeof part.ticks === 'function' ? part.ticks(t) : (part.ticks ?? 1);
        await frame(page, cam, part.freeze ? 0 : 1000 / fps + 0.0005, ticks * (FPS / fps));
        const ov = part.overlay ? part.overlay(t, fmt, state) : {};
        if (comp) {
          const jpg = await page.screenshot({ type: 'jpeg', quality: 92, timeout: 240000 }); // (CDP's capture sees the window, not a phone's emulated screen)
          await comp.page.evaluate(async ([b64, box]) => {
            const ph = document.getElementById('ph'), img = ph.querySelector('img');
            Object.assign(ph.style, box); img.src = `data:image/jpeg;base64,${b64}`; await img.decode();
          }, [jpg.toString('base64'), seg.phone.box(fmt)]);
          await apply(comp.page, ov, fmt);
          await enc.write(await capture(comp.cdp, VIEW[fmt], dpr));
        } else {
          await apply(page, ov, fmt);
          // (the drawn frame presented first: two real frames; and a capture identical to the last one while the game
          // runs is a stale surface (software WebGL under load): taken again)
          let png;
          for (let k = 0; k < 6; k++) {
            await page.evaluate(() => new Promise(r => window.__raf(() => window.__raf(r))));
            png = await capture(cdp, VIEW[fmt], dpr);
            if (part.freeze || !last || !png.equals(last)) break;
          }
          if (!part.freeze && last && png.equals(last)) stale++;
          last = png;
          await enc.write(png);
        }
        if (i % 30 === 29) process.stdout.write(`\r  ${fmt} ${part.name}: ${i + 1}/${n} frames (${((Date.now() - t1) / (i + 1) / 1000).toFixed(2)} s each)   `);
      }
      await enc.end();
      const sfx = await page.evaluate((t0) => { const s = window.__sfx.splice(0), base = (t0 - window.__t0) / 1000; return s.map(e => ({ ...e, t: +(e.at - base).toFixed(4) })); }, t0);
      writeFileSync(`${out}/${part.name}.sfx.json`, JSON.stringify(sfx));
      console.log(`\r  ${fmt} ${part.name}: ${n} frames, ${sfx.length} sounds, ${((Date.now() - t1) / 1000).toFixed(0)} s${stale ? `, ${stale} frames still the same as the one before` : ''}                `);
    }
  } finally { await ctx.close(); if (comp) await comp.page.close(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), preview = args.includes('--preview');
  const fi = args.indexOf('--format'), fmtArg = fi >= 0 ? args[fi + 1] : 'both';
  const names = args.filter((x, i) => !x.startsWith('--') && args[i - 1] !== '--format');
  const formats = fmtArg === 'both' ? ['16x9', '9x16'] : [fmtArg];
  const stage = await openStage();
  try {
    for (const fmt of formats) {
      const out = fileURLToPath(new URL(`target/trailer/${preview ? 'preview-' : ''}${fmt}`, root)); mkdirSync(out, { recursive: true });
      for (const seg of SEGMENTS) if (!names.length || names.includes(seg.id)) {
        console.log(`trailer: ${seg.id} (${fmt})`);
        await recordSegment(stage, seg, fmt, { preview, out });
      }
    }
  } finally { await stage.close(); }
}
