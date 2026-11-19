// The phone controls video's recorder: the real built game (dist/: run `npm run build` first) on a landscape phone
// (844x390, DPR 2, touch) in headless Chromium, on the trailer's stage (tools/trailer/stage.mjs: the fixed map and
// seed, the AI off, the fog layer hidden, the frame clock), the scene staged through the debug handle (beats.mjs
// `scene`), then each beat's fingers played into the game through CDP touch events (touch.mjs) frame by frame at
// 30 fps, the game's own responses recorded (the hold ring, SELECT lit, the selection, the card's details), the drawn
// touch indicator over them (overlay.mjs). The frames go into ffmpeg (tools/trailer/record.mjs `encoder`), one
// near-lossless file per beat: target/controls/<beat>.mkv (1688x780), no captions; those are rendered once each as
// PNGs (target/controls/captions/) and laid on by tools/controls/cut.mjs, which cuts the deliverables.
//   node tools/controls/record.mjs [--fps N] [--stills | --captions] [beat ...]
//     (default: every beat at 30 fps; --fps 10 for a quick look; --stills: no video, one PNG a moment after each
//     caption and each finger into target/controls/stills/, to judge the scene; --captions: only the caption PNGs
//     again, for a reworded caption over a recording that stands; beats by id: select group type army look letgo;
//     the beats before a named one are still played, unrecorded, so the game is where it should be)
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openStage, game, freeze } from '../trailer/stage.mjs';
import { encoder } from '../trailer/record.mjs';
import { clock, resolver, player } from './touch.mjs';
import { installIndicator, drawIndicator, renderCaptions } from './overlay.mjs';
import { scene, BEATS } from './beats.mjs';

const root = new URL('../../', import.meta.url);
export const OUT = fileURLToPath(new URL('target/controls', root));
/** The landscape phone of the docs' shots (iPhone 12-14 sideways), at DPR 2, touch. */
const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
/** What never shows: toasts, the tutorial, the hint pill (the captions say it); the card's details stay (a beat). */
const QUIET = '#msg,#tut,.toast,#netWait,#homeTip,#end,#hint{display:none!important}';
const TRAIL_S = 0.4;

/** The phone page's pixels, drawn and presented (software WebGL under load may hand back the last surface: taken again). */
async function shoot(page, last) {
  let png;
  for (let k = 0; k < 5; k++) {
    await page.evaluate(() => new Promise(r => window.__raf(() => window.__raf(r))));
    png = await page.screenshot({ type: 'png', timeout: 240000 });
    if (!last || !png.equals(last)) break;
  }
  return png;
}

export async function record({ fps = 30, stills = false, captions = false, only = [] } = {}) {
  mkdirSync(OUT, { recursive: true }); mkdirSync(`${OUT}/captions`, { recursive: true });
  const stage = await openStage();
  try {
    const { ctx, page } = await game(stage, PHONE, { as: 'humans', hud: true, css: QUIET });
    try {
      const sheets = await page.evaluate(() => [...document.styleSheets].map(s => s.href).filter(Boolean));
      if (captions) { await writeCaptions(stage, sheets, fps); return; }
      await page.mouse.move(420, 16); // (the menu's clicks left the mouse mid-page: over a card button it would show that button's details)
      const a = await page.evaluate(scene);
      await page.evaluate((p) => { const e = window.endfall; e.cam.zoom = e.startZoom; e.centerOn(p.x, p.y); }, a.look);
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 600)))));
      await installIndicator(page); await resolver(page);
      await freeze(page); await clock(page);
      const cdp = await ctx.newCDPSession(page);
      const epoch = Date.now() / 1000;
      let at = 0;
      for (const beat of BEATS) {
        const skip = only.length && !only.includes(beat.id);
        const n = Math.round(beat.seconds * fps), strokes = beat.strokes(a), pl = player(page, cdp, strokes, epoch + at);
        const enc = skip || stills ? null : encoder(`${OUT}/${beat.id}.mkv`, fps);
        const trails = {}; let last = null; const t1 = Date.now();
        console.log(`controls: ${beat.id} (${beat.seconds} s${skip ? ', played, not recorded' : ''})`);
        for (let i = 0; i < n; i++) {
          const t = i / fps;
          const st = await pl.step(t);
          for (const f of st.fingers) { (trails[f.id] ||= []).push({ x: f.x, y: f.y, t }); }
          for (const k of Object.keys(trails)) { trails[k] = trails[k].filter(q => t - q.t <= TRAIL_S); if (!st.fingers.some(f => String(f.id) === k)) delete trails[k]; }
          await page.evaluate((ms) => window.__frame(ms, 1), 1000 / fps + 0.0005);
          if (skip) continue;
          await drawIndicator(page, t, { fingers: st.fingers, taps: st.taps, holds: st.holds, trails });
          if (stills) {
            const want = beat.caps.some(c => Math.abs(c.at + 1.1 - t) < 0.5 / fps) || i === n - 1 || strokes.some(s => Math.abs(s.t0 + 0.5 - t) < 0.5 / fps || Math.abs(s.t1 + 0.4 - t) < 0.5 / fps);
            if (!want) continue;
            mkdirSync(`${OUT}/stills`, { recursive: true });
            writeFileSync(`${OUT}/stills/${beat.id}-${t.toFixed(2)}.png`, await shoot(page, null));
            continue;
          }
          const png = await shoot(page, last); last = png;
          await enc.write(png);
          if (i % 30 === 29) process.stdout.write(`\r  ${beat.id}: ${i + 1}/${n} frames (${((Date.now() - t1) / (i + 1) / 1000).toFixed(2)} s each)   `);
        }
        if (enc) { await enc.end(); console.log(`\r  ${beat.id}: ${n} frames, ${((Date.now() - t1) / 1000).toFixed(0)} s                      `); }
        at += beat.seconds;
      }
      await writeCaptions(stage, sheets, fps);
    } finally { await ctx.close(); }
  } finally { await stage.close(); }
}

/** The caption PNGs and beats.json (the beats' lengths and captions, for cut.mjs). */
async function writeCaptions(stage, sheets, fps) {
  const sizes = await renderCaptions(stage, sheets, BEATS, `${OUT}/captions`);
  writeFileSync(`${OUT}/beats.json`, JSON.stringify({ fps, beats: BEATS.map(b => ({ id: b.id, seconds: b.seconds, caps: b.caps })), captions: sizes }, null, 1));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), fi = args.indexOf('--fps');
  await record({ fps: fi >= 0 ? +args[fi + 1] : 30, stills: args.includes('--stills'), captions: args.includes('--captions'), only: args.filter((x, i) => !x.startsWith('--') && args[i - 1] !== '--fps') });
}
