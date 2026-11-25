// The docs' sprite crops (tools/docs/sprites.mjs has the recipe and the list): every unit and building the docs list,
// and a few more for the diagrams, cut from the game's art (public/art/new) in headless Chromium (tools/chromium.mjs),
// the team mask tinted as the client tints it, written as WebP (2x) into public/docs/img/sprites/, and
// tools/docs/sprites.json with what each was cut from. Output is committed; run after the art changes (test/docs.test.js says when):
//   node tools/docs/crops.mjs
import { mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { launchChromium } from '../chromium.mjs';
import { ART, RECIPE, SPRITE_DIR, MANIFEST, atlasFrames, framesOf, crops, sourceHash } from './sprites.mjs';

const want = crops();
const frames = atlasFrames();
const used = {}, pages = {};
for (const { key, kind } of want) for (const n of framesOf(key, kind).filter(Boolean)) {
  for (const m of [n, `${n}_m`]) if (frames[m]) { used[m] = [frames[m].page, frames[m].rec]; pages[frames[m].page] ||= `data:image/${frames[m].page.split('.').pop()};base64,` + readFileSync(new URL(frames[m].page, ART)).toString('base64'); }
  if (!frames[n]) throw new Error(`crops: no frame ${n} in public/art/new`);
}

const browser = await launchChromium([]);
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><body></body>');
  await page.evaluate(async ({ pages, used }) => {
    window.IMG = {}; window.FR = used;
    for (const [k, src] of Object.entries(pages)) { const im = new Image(); im.src = src; await im.decode(); window.IMG[k] = im; }
  }, { pages, used });
  mkdirSync(SPRITE_DIR, { recursive: true });
  for (const f of readdirSync(SPRITE_DIR)) if (f.endsWith('.webp')) rmSync(new URL(f, SPRITE_DIR));
  const out = {};
  for (const c of want) {
    const [base, head] = framesOf(c.key, c.kind);
    for (const [file, px] of Object.values(c.files)) {
      const url = await page.evaluate(cut, { base, head, n: px * 2, tint: c.tint, fill: c.fill, solid: RECIPE.solid, fade: RECIPE.fade, enlarge: RECIPE.enlarge });
      writeFileSync(new URL(file, SPRITE_DIR), Buffer.from(url.split(',')[1], 'base64'));
    }
    out[c.name] = sourceHash(c);
  }
  writeFileSync(MANIFEST, JSON.stringify(out, null, 1) + '\n');
  console.log(`crops: ${want.length} crops into ${SPRITE_DIR.pathname}`);
} finally { await browser.close(); }

/**
 * One crop, in the page: the solid art's bounds (alpha over `solid`, the head's too) centered and fit to `fill` of an
 * `n`-pixel square (at most `enlarge` times its own pixels); the frame drawn, its team mask multiplied by `tint`; whatever runs past the round plate (the long
 * shadow) faded out from `fade` of its size. Returns a WebP data URL.
 */
function cut({ base, head, n, tint, fill, solid, fade, enlarge }) {
  const rec = (nm) => FR[nm][1], img = (nm) => IMG[FR[nm][0]];
  const bounds = (nm) => {
    const f = rec(nm).frame, t = document.createElement('canvas'); t.width = f.w; t.height = f.h;
    const tc = t.getContext('2d'); tc.drawImage(img(nm), f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    const d = tc.getImageData(0, 0, f.w, f.h).data; let x0 = f.w, y0 = f.h, x1 = 0, y1 = 0;
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (d[(y * f.w + x) * 4 + 3] > solid) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
  };
  const paint = (ctx, nm, ox, oy, k) => {
    const f = rec(nm).frame; ctx.drawImage(img(nm), f.x, f.y, f.w, f.h, ox, oy, f.w * k, f.h * k);
    const m = FR[`${nm}_m`]; if (!m || !tint) return;
    const mf = m[1].frame, at = m[1].spriteSourceSize, t = document.createElement('canvas'); t.width = t.height = n;
    const tc = t.getContext('2d'); tc.imageSmoothingQuality = 'high';
    const mask = () => tc.drawImage(IMG[m[0]], mf.x, mf.y, mf.w, mf.h, ox + at.x * k, oy + at.y * k, mf.w * k, mf.h * k);
    mask(); tc.globalCompositeOperation = 'multiply'; tc.fillStyle = tint; tc.fillRect(0, 0, n, n);
    tc.globalCompositeOperation = 'destination-in'; mask(); ctx.drawImage(t, 0, 0);
  };
  const fr = rec(base), a = fr.anchor, f = fr.frame, b = bounds(base);
  let { x0, y0, x1, y1 } = b, hoff = null;
  if (head && FR[head]) { // the head on the base's ground point (both frames' anchors)
    const hf = rec(head), hb = bounds(head);
    hoff = { x: f.w * a.x - hf.frame.w * hf.anchor.x, y: f.h * a.y - hf.frame.h * hf.anchor.y };
    x0 = Math.min(x0, hoff.x + hb.x0); y0 = Math.min(y0, hoff.y + hb.y0); x1 = Math.max(x1, hoff.x + hb.x1); y1 = Math.max(y1, hoff.y + hb.y1);
  }
  const bw = x1 - x0, bh = y1 - y0, k = Math.min(n * fill / bw, n * fill / bh, enlarge);
  const ox = n / 2 - (x0 + bw / 2) * k, oy = n / 2 - (y0 + bh / 2) * k;
  const c = document.createElement('canvas'); c.width = c.height = n;
  const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  paint(ctx, base, ox, oy, k);
  if (hoff) paint(ctx, head, ox + hoff.x * k, oy + hoff.y * k, k);
  const g = ctx.createRadialGradient(n / 2, n / 2, n * fade, n / 2, n / 2, n * 0.5);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = g; ctx.fillRect(0, 0, n, n);
  return c.toDataURL('image/webp', 0.86);
}
