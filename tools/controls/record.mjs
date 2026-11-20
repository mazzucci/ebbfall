// The controls videos' recorder: the real built game (dist/: run `npm run build` first) in headless Chromium, on the
// trailer's stage (tools/trailer/stage.mjs: Gold Crown, its first start well inside the map, a fixed seed, the AI off,
// the fog layer hidden, the frame clock), the scene staged through the debug handle, then each beat's input played into
// the game frame by frame at 30 fps and the game's own responses recorded, with a drawn indicator over them. Two sets
// (`--set`): `phone` (beats.mjs, touch.mjs: a landscape phone, 844x390 at DPR 2, fingers through CDP touch events; the
// indicator of overlay.mjs) and `desktop` (desktop.mjs, mouse.mjs: a 1280x720 window at DPR 2, a mouse and a keyboard
// through CDP input events; a drawn cursor, click rings and keycaps), plus `desktop-wasd` (the same scene in the WASD
// scheme, its one beat). The frames go into ffmpeg (tools/trailer/record.mjs `encoder`), one near-lossless file per
// beat: target/controls/<set>/<beat>.mkv, no captions; those are rendered once each as PNGs
// (target/controls/<set>/captions/) and laid on by tools/controls/cut.mjs, which cuts the deliverables.
//   node tools/controls/record.mjs [--set phone|desktop|desktop-wasd] [--fps N] [--stills | --captions] [beat ...]
//     (default: the phone set, every beat at 30 fps; --fps 10 for a quick look; --stills: no video, one PNG a moment
//     after each caption and each input into target/controls/<set>/stills/, to judge the scene; --captions: only the
//     caption PNGs again, for a reworded caption over a recording that stands; beats by id; the beats before a named
//     one are still played, unrecorded, so the game is where it should be)
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openStage, game, freeze } from '../trailer/stage.mjs';
import { encoder } from '../trailer/record.mjs';
import { clock, resolver, player as fingers } from './touch.mjs';
import { player as mouse, drawCursor, CURSOR_CSS } from './mouse.mjs';
import { installIndicator, drawIndicator, renderCaptions } from './overlay.mjs';
import * as phone from './beats.mjs';
import * as desktop from './desktop.mjs';

const root = new URL('../../', import.meta.url);
export const OUT = fileURLToPath(new URL('target/controls', root));
/** The landscape phone of the docs' shots (iPhone 12-14 sideways), at DPR 2, touch. */
const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
/** A desktop window, 1280x720 at DPR 2 (the cut scales it to 1280x720), a mouse. */
const DESKTOP = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 };
/** The sets: the device, the scene and beats, how the input is played and the indicator drawn, the device's settings. */
export const SETS = {
  phone: { device: PHONE, scene: phone.scene, beats: phone.BEATS, player: fingers, kind: 'land', touch: true },
  desktop: { device: DESKTOP, scene: desktop.scene, beats: desktop.BEATS, player: mouse, kind: 'desk' },
  'desktop-wasd': { device: DESKTOP, scene: desktop.scene, beats: desktop.WASD_BEATS, player: mouse, kind: 'desk', init: { controls: 'wasd' } },
};
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

export async function record({ set = 'phone', fps = 30, stills = false, captions = false, only = [] } = {}) {
  const S = SETS[set]; if (!S) throw new Error(`controls: no set ${set} (${Object.keys(SETS).join(', ')})`);
  const out = `${OUT}/${set}`, BEATS = S.beats;
  mkdirSync(out, { recursive: true }); mkdirSync(`${out}/captions`, { recursive: true });
  const stage = await openStage();
  try {
    const { ctx, page } = await game(stage, S.device, { map: 'crown', as: 'humans', hud: true, css: QUIET, init: S.init || {} });
    try {
      const sheets = await page.evaluate(() => [...document.styleSheets].map(s => s.href).filter(Boolean));
      if (captions) { await writeCaptions(stage, sheets, out, S, fps); return; }
      await page.mouse.move(S.device.viewport.width / 2, 16); // (the menu's clicks left the mouse mid-page: over a card button it would show that button's details)
      const a = await page.evaluate(S.scene);
      await page.evaluate(([p, z]) => { const e = window.endfall; e.cam.zoom = z === 'start' ? e.startZoom : z; e.centerOn(p.x, p.y); }, [a.look, a.zoom ?? 'start']);
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 600)))));
      await installIndicator(page, S.touch ? '' : CURSOR_CSS); await resolver(page);
      await freeze(page); await clock(page);
      const cdp = await ctx.newCDPSession(page);
      const epoch = Date.now() / 1000;
      let at = 0;
      for (const beat of BEATS) {
        const skip = only.length && !only.includes(beat.id);
        const n = Math.round(beat.seconds * fps), strokes = beat.strokes(a), pl = S.player(page, cdp, strokes, epoch + at, a.cursor);
        const enc = skip || stills ? null : encoder(`${out}/${beat.id}.mkv`, fps);
        const trails = {}; let last = null; const t1 = Date.now();
        console.log(`controls: ${beat.id} (${beat.seconds} s${skip ? ', played, not recorded' : ''})`);
        for (let i = 0; i < n; i++) {
          const t = i / fps;
          const st = await pl.step(t);
          if (S.touch) {
            for (const f of st.fingers) { (trails[f.id] ||= []).push({ x: f.x, y: f.y, t }); }
            for (const k of Object.keys(trails)) { trails[k] = trails[k].filter(q => t - q.t <= TRAIL_S); if (!st.fingers.some(f => String(f.id) === k)) delete trails[k]; }
          }
          await page.evaluate((ms) => window.__frame(ms, 1), 1000 / fps + 0.0005);
          if (skip) continue;
          if (S.touch) await drawIndicator(page, t, { fingers: st.fingers, taps: st.taps, holds: st.holds, trails }); else await drawCursor(page, t, st);
          if (stills) {
            const want = beat.caps.some(c => Math.abs(c.at + 1.1 - t) < 0.5 / fps) || i === n - 1 || strokes.some(s => Math.abs(s.t0 + 0.5 - t) < 0.5 / fps || Math.abs(s.t1 + 0.4 - t) < 0.5 / fps);
            if (!want) continue;
            mkdirSync(`${out}/stills`, { recursive: true });
            writeFileSync(`${out}/stills/${beat.id}-${t.toFixed(2)}.png`, await shoot(page, null));
            continue;
          }
          const png = await shoot(page, last); last = png;
          await enc.write(png);
          if (i % 30 === 29) process.stdout.write(`\r  ${beat.id}: ${i + 1}/${n} frames (${((Date.now() - t1) / (i + 1) / 1000).toFixed(2)} s each)   `);
        }
        if (enc) { await enc.end(); console.log(`\r  ${beat.id}: ${n} frames, ${((Date.now() - t1) / 1000).toFixed(0)} s                      `); }
        at += beat.seconds;
      }
      await writeCaptions(stage, sheets, out, S, fps);
    } finally { await ctx.close(); }
  } finally { await stage.close(); }
}

/** The caption PNGs and beats.json (the beats' lengths and captions, for cut.mjs). */
async function writeCaptions(stage, sheets, out, S, fps) {
  const sizes = await renderCaptions(stage, sheets, S.beats, `${out}/captions`, S.kind);
  writeFileSync(`${out}/beats.json`, JSON.stringify({ fps, kind: S.kind, beats: S.beats.map(b => ({ id: b.id, seconds: b.seconds, caps: b.caps })), captions: sizes }, null, 1));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), fi = args.indexOf('--fps'), si = args.indexOf('--set');
  await record({ set: si >= 0 ? args[si + 1] : 'phone', fps: fi >= 0 ? +args[fi + 1] : 30, stills: args.includes('--stills'), captions: args.includes('--captions'), only: args.filter((x, i) => !x.startsWith('--') && args[i - 1] !== '--fps' && args[i - 1] !== '--set') });
}
