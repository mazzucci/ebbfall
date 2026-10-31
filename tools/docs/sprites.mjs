// The docs' sprites (tools/docs/build.mjs): each unit's and building's default frame cut from the game's atlas
// (public/art/, made by tools/art/generate.mjs) at build time, its team mask painted in seat 0's gold as the renderer
// paints it (render.js `artIcon`: the mask multiplied by the seat's tint, over the neutral art), a turret's head on its
// base, trimmed to what is drawn, written as a small PNG. Nothing here is committed: the art is the one source.
import { readFileSync } from 'node:fs';
import { decodePNG, encodePNG } from '../art/png.js';
import { BLDG_LOOK } from '../../src/client/look.js';

const ART = new URL('../../public/art/', import.meta.url);
/** The frame a unit stands in on the docs (facing 2 of 16: towards the viewer, a little to the right; its first pose),
 *  and a building's (the HUD's portraits use the same). */
export const unitFrame = (k) => `${k}_2_0`;
export const bldgFrame = (k) => `bldg_${k}`;

/** The atlas: every frame's page and rectangle (atlas.json's pages), and the seat tints it was fitted with. */
function atlas() {
  const index = JSON.parse(readFileSync(new URL('atlas.json', ART), 'utf8')), frames = {};
  index.pages.forEach((p, page) => {
    const sheet = JSON.parse(readFileSync(new URL(p, ART), 'utf8'));
    for (const [name, f] of Object.entries(sheet.frames)) frames[name] = { page, image: sheet.meta.image, ...f };
  });
  return { index, frames };
}

/**
 * Each kind's sprite as PNG bytes, by key: `units` and `buildings` are the kind keys. The layers of a kind (its art, a
 * turret's head) are placed by their anchors, each with its mask in `tint` (seat 0's, atlas.json `tints[0]`).
 */
export function sprites(units, buildings) {
  const { index, frames } = atlas(), pages = new Map();
  const page = (image) => { if (!pages.has(image)) pages.set(image, decodePNG(readFileSync(new URL(image, ART)))); return pages.get(image); };
  const tint = index.tints[0], tr = (tint >> 16) & 255, tg = (tint >> 8) & 255, tb = tint & 255;
  const out = {};
  const want = [...units.map(k => [k, [unitFrame(k)]]), ...buildings.map(k => [k, [bldgFrame(k), ...(BLDG_LOOK[k]?.head ? [`${BLDG_LOOK[k].head}_2`] : [])]])];
  for (const [key, names] of want) {
    const layers = names.flatMap(n => [frames[n], frames[n + '_m']].map((f, i) => f && { f, mask: i === 1, base: frames[n] }));
    if (!frames[names[0]]) throw new Error(`docs sprites: no frame ${names[0]} in public/art (run node tools/art/generate.mjs)`);
    // Every layer in one canvas, its anchor at the origin: a frame's anchor is a share of its full (untrimmed) size.
    const box = layers.filter(Boolean).map(({ f, base }) => {
      const ax = base.anchor.x * base.sourceSize.w, ay = base.anchor.y * base.sourceSize.h, at = f.spriteSourceSize || { x: 0, y: 0 };
      return { f, x0: Math.round(at.x - ax), y0: Math.round(at.y - ay) };
    });
    const minX = Math.min(...box.map(b => b.x0)), minY = Math.min(...box.map(b => b.y0));
    const W = Math.max(...box.map(b => b.x0 + b.f.frame.w)) - minX, H = Math.max(...box.map(b => b.y0 + b.f.frame.h)) - minY;
    const px = new Float32Array(W * H * 4); // premultiplied, 0..1
    layers.forEach((l, i) => {
      if (!l) return;
      const { f, x0, y0 } = box.find(b => b.f === l.f), src = page(f.image), { x, y, w, h } = f.frame;
      for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) {
        const s = ((y + j) * src.w + x + k) * 4, a = src.data[s + 3] / 255;
        if (!a) continue;
        let r = src.data[s] / 255, g = src.data[s + 1] / 255, b = src.data[s + 2] / 255;
        if (l.mask) { r *= tr / 255; g *= tg / 255; b *= tb / 255; }
        const d = ((y0 - minY + j) * W + x0 - minX + k) * 4, keep = 1 - a;
        px[d] = r * a + px[d] * keep; px[d + 1] = g * a + px[d + 1] * keep; px[d + 2] = b * a + px[d + 2] * keep; px[d + 3] = a + px[d + 3] * keep;
      }
      void i;
    });
    // Trimmed to what is drawn (a frame leaves room for its shadow and its turn).
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let j = 0; j < H; j++) for (let k = 0; k < W; k++) if (px[(j * W + k) * 4 + 3] > 0.02) { x0 = Math.min(x0, k); x1 = Math.max(x1, k); y0 = Math.min(y0, j); y1 = Math.max(y1, j); }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, data = new Uint8Array(w * h * 4);
    for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) {
      const s = ((y0 + j) * W + x0 + k) * 4, d = (j * w + k) * 4, a = px[s + 3];
      if (a <= 0) continue;
      for (let c = 0; c < 3; c++) data[d + c] = Math.round(Math.min(1, px[s + c] / a) * 255);
      data[d + 3] = Math.round(a * 255);
    }
    out[key] = { png: encodePNG({ w, h, data }), w, h };
  }
  return out;
}
