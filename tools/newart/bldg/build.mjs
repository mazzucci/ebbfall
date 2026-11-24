// The new look's buildings (src/client/gl/newart.js, `?art=new`): from the pictures to the pack.
//   node tools/newart/bldg/build.mjs [--scale 2] [--lossless] [--out DIR] [--only core,kiln]
// Reads the pictures from EBBFALL_PICTURES (default ../ebbfall-article/nano-test beside the main checkout); writes
// bldg-<n>.webp/json and the `bldg` group of index.json into public/art/new/ (ignored by git: no picture is in the repo).
// Same pictures, same pack. All tuned numbers are in CFG. Needs a Chromium (decodes the JPEGs, renders the rotor).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../../chromium.mjs';
import { encodeWebP } from '../../art/webp.mjs';
import { keyGreen, takePaint, tone, fit, blur, bloom, cover, overShadow, bytes, box, crop, image } from './pixels.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const root = fileURLToPath(new URL('../../../', import.meta.url));
const PICTURES = process.env.EBBFALL_PICTURES || '/home/mazzucci/projects/ebbfall-article/nano-test';
const SCALE = +arg('--scale', 2), LOSSLESS = process.argv.includes('--lossless'), OUT = resolve(arg('--out', join(root, 'public/art/new'))), ONLY = arg('--only', '')?.split(',').filter(Boolean);

// ---- the numbers (picture points are px of the 2048 px picture; sizes are world px, TILE = 32) ----
const cyan = (r, g, b) => Math.max(0, Math.min(1, (Math.min(g, b) - 150) / 70)) * Math.max(0, Math.min(1, (Math.min(g, b) - r - 70) / 60));
const fire = (r, g, b) => Math.max(0, Math.min(1, (r - 190) / 40)) * Math.max(0, Math.min(1, (r - b - 110) / 60)) * Math.max(0, Math.min(1, (g - 60) / 40));
/** The two Expedition halls are one model in the picture: their ground outline (left, front, right, back corners, under
 *  the feet), height to the cornice and the shade of the paint round the corner. */
const HALL = { ground: [[64, 1430], [1325, 1868], [1993, 1440], [732, 1002]], h: 700, shade: [[1440, 0.8]] };
/** A round tower for the shadow: its ground circle (seen at half its width), its wall's height and its roof's point. */
const tower = (x, y, r, wall, tip) => [...ring(x, y, r, 0), ...ring(x, y, r, wall), [x, y, tip]];
const ring = (x, y, r, h) => Array.from({ length: 24 }, (_, i) => { const a = i / 24 * Math.PI * 2; return [x + r * Math.cos(a), y + r * 0.52 * Math.sin(a), h]; });
const block = (pts, h) => pts.flatMap(([x, y]) => [[x, y, 0], [x, y, h]]);
const CFG = {
  page: 1024, gap: 8,                                        // the page's width, the clear px between frames (mipmaps)
  shadow: { alpha: 110 / 255, dx: 0.24, dy: 0.18, soft: 0.5 }, // today's: 0.36 of the height (drawn 1.19 x), 4 east to 3 south; `soft` world px of feather (today's: none)
  contact: { alpha: 0.28, out: 2.5 },                          // a soft dark edge on the ground round the foot (world px)
  sharp: 0.35,
  webp: { lossless: 0, quality: 90, use_sharp_yuv: 1, alpha_quality: 100, method: 6, exact: 1 },
  bldg: {
    // `ground`: the outline on the ground; its middle stands on the footprint's, `dy` px south. `w`: the ground's width.
    conflux: { pic: 'set/ref-c1.jpg', n: 4, w: 150, dy: 8, ...HALL, solids: [block(HALL.ground, HALL.h)], tone: { gamma: 1.06, gain: 1, sat: 1.06 }, lit: cyan, bloom: [5, 0.5],
      look: { glow: { at: [1066, 615], tint: 0x20d8ff, size: 0.9 }, site: [1.17, 0.8, -12] } },
    core: { pic: 'kingdom/core-e1.jpg', n: 4, w: 146, dy: 8, ground: [[213, 1395], [1170, 1740], [1845, 1290], [888, 945]],
      solids: [block([[240, 1370], [1170, 1710], [1820, 1270], [890, 930]], 560), tower(292, 1395, 80, 700, 890), tower(1175, 1705, 102, 680, 900), tower(1765, 1272, 70, 640, 870), tower(995, 960, 120, 700, 870)],
      tone: { gamma: 0.9, gain: 1.0, sat: 1.0 }, lit: fire, bloom: [4, 0.7], look: { glow: { at: [712, 1186], tint: 0xff8a2a, size: 0.4 }, smoke: null, site: [1.22, 0.9, -8] } },
    kiln: { pic: 'set/kiln-1.jpg', n: 3, w: 114, dy: 6, ...HALL, solids: [block(HALL.ground, HALL.h)], tone: { gamma: 1.06, gain: 1, sat: 1.06 }, lit: cyan, bloom: [4, 0.2],
      look: { glow: { at: [1014, 576], tint: 0x20d8ff, size: 0.55 }, site: [1.2, 0.8, -9] } },
    spire: { pic: 'turbine/tower-bare.jpg', n: 2, scaleBy: [434, 1978, 78], anchor: [1030, 1890], dy: 4, ground: [[860, 1890], [1030, 1975], [1200, 1890], [1030, 1805]],
      solids: [ring(1030, 1890, 168, 0), [...ring(1030, 1890, 85, 0), ...ring(1030, 1890, 60, 1250)], [...ring(1030, 1890, 110, 1190), ...ring(1100, 1840, 110, 1260)]], low: 0.02, tone: { gamma: 1.0, gain: 1.0, sat: 1.0 },
      rotor: { plate: [915, 635], blade: 590, axis: [-0.503, -0.327, 0.8], n: 16, key: 0.72, hemi: 0.5 } },
  },
};

// ---- the browser's part: the pictures' pixels, the rotor ----
const page = await openPage();
async function openPage() {
  const files = { '/': ['text/html', '<!doctype html><body></body>'] };
  const srv = createServer((q, r) => { const u = new URL(q.url, 'http://x').pathname; try { const [t, b] = files[u] || (u.startsWith('/pic/') ? ['image/jpeg', readFileSync(join(PICTURES, u.slice(5)))] : ['text/javascript', readFileSync(u === '/rotor.js' ? new URL('rotor.js', import.meta.url) : join(root, 'node_modules', u))]); r.writeHead(200, { 'content-type': t }); r.end(b); } catch { r.writeHead(404); r.end(); } });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const b = await launchChromium(), p = await b.newPage(); p.on('pageerror', e => { throw e; });
  await p.goto(`http://127.0.0.1:${srv.address().port}/`);
  return Object.assign(p, { done: async () => { await b.close(); srv.close(); } });
}
const B64 = (s) => Buffer.from(s, 'base64');
await page.evaluate(() => { window.b64 = (d) => { let s = ''; for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000)); return btoa(s); }; });
async function picture(name) {
  const r = await page.evaluate(async (u) => {
    const i = new Image(); await new Promise((y, n) => { i.onload = y; i.onerror = () => n(new Error('no picture ' + u)); i.src = '/pic/' + u; });
    const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(i, 0, 0);
    return { w: i.width, h: i.height, d: b64(g.getImageData(0, 0, i.width, i.height).data) };
  }, name);
  return { w: r.w, h: r.h, d: Float32Array.from(B64(r.d)) };
}
async function rotor(o) {
  const r = await page.evaluate(async (o) => { const T = await import('/three/build/three.module.js'), { rotorFrames } = await import('/rotor.js'); const r = rotorFrames(T, o); return { w: r.w, h: r.h, frames: r.frames.map(b64) }; }, o);
  return r.frames.map(f => ({ w: r.w, h: r.h, d: Float32Array.from(B64(f)) })); // (at 4x)
}

// ---- a building ----
async function building(type, c) {
  const S = SCALE, pic = await picture(c.pic);
  keyGreen(pic, { low: c.low }); const mask = takePaint(pic, { shade: c.shade }); tone(pic, c.tone);
  const g = c.ground, xs = g.map(p => p[0]), ys = g.map(p => p[1]);
  const k = c.scaleBy ? c.scaleBy[2] / (c.scaleBy[1] - c.scaleBy[0]) : c.w / (Math.max(...xs) - Math.min(...xs)); // world px a picture px
  const mid = c.anchor || [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const at = (x, y) => [(x - mid[0]) * k * S, ((y - mid[1]) * k + c.dy) * S]; // (picture point -> frame px about the anchor)
  // A frame with room for everything, cut to it at the end; the anchor on a whole px.
  const R = Math.ceil((c.n * 32 + 100) * S), ax = R, ay = Math.ceil(R * 1.4), W = 2 * R, H = ay + R;
  const put = (im, sharp) => fit(im, k * S, mid[0], mid[1], ax, ay + c.dy * S, W, H, sharp);
  let body = put(pic, CFG.sharp); const m = put(mask, 0);
  if (c.lit) bloom(body, c.lit, Math.max(1, Math.round(c.bloom[0] * S / 2)), c.bloom[1]);
  const sh = CFG.shadow, pt = (h) => ([x, y, z = 0]) => { const [X, Y] = at(x, y), q = z * k * S * h; return [ax + X + q * sh.dx, ay + Y + q * sh.dy]; };
  const cast = blur(cover(c.solids.map(s => s.map(pt(1))), W, H), W, H, Math.max(1, Math.round(sh.soft * S)), 1);
  const foot = blur(cover([c.ground.map(pt(0))], W, H), W, H, Math.round(CFG.contact.out * S / 2), 2);
  body = overShadow(body, cast.map((v, i) => Math.min(sh.alpha, Math.max(v * sh.alpha, foot[i] * CFG.contact.alpha))));
  const frames = [], cut = (name, im, b) => frames.push({ name, im: bytes(crop(im, b)), anchor: { x: (ax - b[0]) / (b[2] - b[0] + 1), y: (ay - b[1]) / (b[3] - b[1] + 1) } });
  const pad = ([x0, y0, x1, y1]) => [x0 - 2, y0 - 2, x1 + 2, y1 + 2];
  const bb = pad(box(body));
  cut(`bldg_${type}`, body, bb); cut(`bldg_${type}_m`, m, bb); // (untrimmed, body and mask in one box: artIcon)
  if (c.rotor) {
    const o = c.rotor, [hx, hy] = at(...o.plate), L = o.blade * k * S, q = Math.ceil(L * 1.3);
    const heads = (await rotor({ w: 2 * q, h: 2 * q, ox: q, oy: q, L, axis: o.axis, n: o.n, key: o.key, hemi: o.hemi })).map(f => fit(f, 2 * q / f.w, 0, 0, ax + hx - q, ay + hy - q, W, H));
    const hb = heads.map(h => box(h)), un = pad([Math.min(...hb.map(b => b[0])), Math.min(...hb.map(b => b[1])), Math.max(...hb.map(b => b[2])), Math.max(...hb.map(b => b[3]))]);
    heads.forEach((h, i) => cut(`${type}_head_${i}`, h, un));
  }
  // Where it sorts among the units: the line through its left and right ground corners, px south of its middle.
  const by = (f) => g.reduce((a, b) => (f(b[0], a[0]) ? b : a)), look = { z: +((at(...by((p, q) => p < q))[1] + at(...by((p, q) => p > q))[1]) / 2 / S).toFixed(1) };
  if (c.look?.glow) { const G = c.look.glow, [x, y] = at(...G.at); look.glow = [G.tint, G.size, 0.3, +(-y / S).toFixed(1), !!G.flicker, +(x / S).toFixed(1)]; }
  for (const key of ['smoke', 'site']) if (key in (c.look ?? {})) look[key] = c.look[key]; // (`site`: today's scaffold or gantry stretched round it: east, south, its shift south)
  return { frames, look };
}

// ---- the pages ----
/** Shelves, tallest first: [{ name, x, y }...] and the height used. */
function pack(frames, width, gap) {
  let x = 0, y = 0, row = 0;
  for (const f of [...frames].sort((a, b) => b.im.h - a.im.h || (a.name < b.name ? -1 : 1))) {
    if (x + f.im.w > width) { x = 0; y += row + gap; row = 0; }
    f.x = x; f.y = y; x += f.im.w + gap; row = Math.max(row, f.im.h);
  }
  return y + row;
}
async function writePage(n, frames, options) {
  const w = CFG.page * Math.max(1, SCALE / 2), h = Math.ceil(pack(frames, w, CFG.gap * Math.max(1, SCALE / 2)) / 4) * 4, data = new Uint8Array(w * h * 4);
  for (const f of frames) for (let y = 0; y < f.im.h; y++) data.set(f.im.data.subarray(y * f.im.w * 4, (y + 1) * f.im.w * 4), ((f.y + y) * w + f.x) * 4);
  const webp = await encodeWebP({ w, h, data }, options);
  const json = { frames: Object.fromEntries(frames.map(f => [f.name, { frame: { x: f.x, y: f.y, w: f.im.w, h: f.im.h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: f.im.w, h: f.im.h }, sourceSize: { w: f.im.w, h: f.im.h }, anchor: f.anchor }])), meta: { app: 'endfall tools/newart/bldg', image: `bldg-${n}.webp`, format: 'RGBA8888', size: { w, h }, scale: String(SCALE) } };
  writeFileSync(join(OUT, `bldg-${n}.webp`), webp); writeFileSync(join(OUT, `bldg-${n}.json`), JSON.stringify(json));
  console.log(`bldg-${n}: ${w}x${h}, ${frames.length} frames, ${webp.length} B, ${(w * h * 4 * 4 / 3 / 1e6).toFixed(1)} MB of GPU with mipmaps`);
  return `bldg-${n}.json`;
}

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (/^bldg-\d+\.(webp|json)$/.test(f)) rmSync(join(OUT, f));
const all = [], looks = {};
for (const [type, c] of Object.entries(CFG.bldg)) { if (ONLY.length && !ONLY.includes(type)) continue; const r = await building(type, c); all.push(...r.frames); looks[type] = r.look; console.log(type, r.frames.map(f => `${f.name} ${f.im.w}x${f.im.h}`).slice(0, 3).join(', '), JSON.stringify(r.look)); }
await page.done();
const masks = all.filter(f => f.name.endsWith('_m')), bodies = all.filter(f => !f.name.endsWith('_m'));
const opt = LOSSLESS ? {} : CFG.webp, pages = [await writePage(0, bodies, opt), await writePage(1, masks, {})]; // (the masks lossless always: their edges are the paint's)
const file = join(OUT, 'index.json'); let ix = { groups: {} }; try { ix = JSON.parse(readFileSync(file, 'utf8')); } catch { /* (the first group) */ }
ix.groups ||= {}; ix.groups.bldg = { pages, looks };
writeFileSync(file, JSON.stringify(ix, null, 1));
