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
import { decodePNG } from '../../art/png.js';
import { encodeWebP, decodeWebP } from '../../art/webp.mjs';
import { tone, SHADOW } from '../tone.mjs';
import { stamp } from '../bytes.mjs';
import { keyGreen, takePaint, fit, silhouette, blur, bloom, cover, overShadow, bytes, box, crop, image, enlarge } from './pixels.js';

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
/** A ground outline from its left, front and right corners (the fourth is theirs), and a round one. */
const quad = (L, F, R) => [L, F, R, [L[0] + R[0] - F[0], L[1] + R[1] - F[1]]];
const disc = (x, y, r, ry) => [[x - r, y], [x, y + ry], [x + r, y], [x, y - ry]];
const CFG = {
  page: 1536, gap: 8,                                        // the page's width, the clear px between frames (mipmaps)
  shadow: { alpha: SHADOW.alpha, dx: 0.28, dy: 0.16 },       // a third of the drawn height (tone.mjs SHADOW), to the lower right, crisp
  contact: { alpha: 0.22, out: 2 },                          // a soft dark edge on the ground round the foot (world px)
  sharp: 0.35,
  webp: { lossless: 0, quality: 90, use_sharp_yuv: 1, alpha_quality: 100, method: 6, exact: 1 },
  tone: { kg: {}, ex: { lift: 1.35, top: 0.95 } },           // tone.mjs, by people: the Expedition's white panels keep their seams
  ex: new Set(['conflux', 'kiln', 'spire', 'siphon', 'loom', 'substation', 'ward', 'uplink', 'eclipse']), // (the Expedition's; the rest are the Kingdom's: a page each)
  bldg: {
    // `ground`: the outline on the ground; its middle stands on the footprint's, `dy` px south. `w`: the ground's width
    // (world px); `n`: the footprint (tiles); `h`: the walls' height for the shadow (picture px).
    conflux: { pic: 'set/ref-c1.jpg', n: 4, w: 150, dy: 8, ...HALL, lit: cyan, bloom: [5, 0.5], look: { glow: { at: [1066, 615], tint: 0x20d8ff, size: 0.9 } } },
    core: { pic: 'kingdom/core-e1.jpg', n: 4, w: 146, dy: 8, ground: [[213, 1395], [1170, 1740], [1845, 1290], [888, 945]],
      solids: [block([[240, 1370], [1170, 1710], [1820, 1270], [890, 930]], 560), tower(292, 1395, 80, 700, 890), tower(1175, 1705, 102, 680, 900), tower(1765, 1272, 70, 640, 870), tower(995, 960, 120, 700, 870)],
      lit: fire, bloom: [4, 0.7], look: { glow: { at: [712, 1186], tint: 0xff8a2a, size: 0.4 }, smoke: null } },
    kiln: { pic: 'set/kiln-1.jpg', n: 3, w: 114, dy: 6, ...HALL, lit: cyan, bloom: [4, 0.2], look: { glow: { at: [1014, 576], tint: 0x20d8ff, size: 0.55 } } },
    spire: { pic: 'turbine/tower-bare.jpg', n: 2, scaleBy: [434, 1978, 78], anchor: [1030, 1890], dy: 4, round: [1030, 1890, 170], ground: disc(1030, 1890, 170, 85),
      solids: [ring(1030, 1890, 168, 0), [...ring(1030, 1890, 85, 0), ...ring(1030, 1890, 60, 1250)], [...ring(1030, 1890, 110, 1190), ...ring(1100, 1840, 110, 1260)]], low: 0.02,
      rotor: { plate: [915, 635], blade: 590, axis: [-0.503, -0.327, 0.8], n: 16, key: 0.72, hemi: 0.5 } },
    // the Kingdom
    depot: { pic: 'kingdom/depot-e1.jpg', n: 2, w: 69, dy: 4, ground: quad([290, 1470], [1110, 1876], [1800, 1395]), h: 560, lit: fire, bloom: [3, 0.5] },
    barracks: { pic: 'kingdom/barracks-e1.jpg', n: 3, w: 106, dy: 6, ground: quad([150, 1265], [1500, 1862], [1880, 1590]), h: 480, lit: fire, bloom: [3, 0.5], look: { smoke: null } },
    forge: { pic: 'kingdom/forge-e1.jpg', n: 2, w: 70, dy: 4, ground: quad([190, 1430], [1298, 1892], [1840, 1500]), h: 520, lit: fire, bloom: [3, 0.6], look: { glow: { at: [526, 1260], tint: 0xff5a1e, size: 0.5, flicker: true }, smoke: { at: [[653, 170]] } } },
    extractor: { pic: 'kingdom/extractor-e1.jpg', n: 2, w: 72, dy: 4, ground: quad([170, 1350], [1010, 1760], [1880, 1320]), h: 500, lit: fire, bloom: [3, 0.5] },
    factory: { pic: 'kingdom/factory-e1.jpg', n: 3, w: 94, dy: 6, ground: quad([390, 1420], [1120, 1775], [1740, 1415]), h: 560, lit: fire, bloom: [3, 0.5] },
    airfield: { pic: 'kingdom/airfield-e1.jpg', n: 3, w: 106, dy: 6, ground: quad([180, 1165], [1490, 1795], [1890, 1470]), h: 480, lit: fire, bloom: [3, 0.5] },
    turret: { pic: 'kingdom/turret-e1.jpg', n: 2, w: 46, dy: 6, round: [1020, 1660, 400], ground: disc(1020, 1660, 400, 225), solids: [[...ring(1020, 1660, 395, 0), ...ring(1020, 1660, 340, 1100)], [...ring(1020, 1660, 480, 1120), ...ring(1020, 1660, 480, 1290)]], lit: fire, bloom: [3, 0.5],
      heads: { today: 'turret_head', pivot: [0, -68], at: [1013, 405], n: 16 } },
    // the Expedition
    siphon: { pic: 'kingdom/siphon-e1.jpg', n: 2, w: 76, dy: 4, ground: quad([105, 1480], [1000, 1905], [1905, 1360]), h: 500, lit: cyan, bloom: [3, 0.4], look: { glow: { at: [797, 878], tint: 0x3fe0ff, size: 0.35 } } },
    loom: { pic: 'set/loom-1.jpg', n: 2, w: 76, dy: 4, ground: quad([64, 1430], [1325, 1860], [1993, 1440]), h: 640, shade: [[1440, 0.8]], lit: cyan, bloom: [3, 0.35], look: { glow: { at: [1040, 720], tint: 0x3fe0ff, size: 0.6 } } },
    substation: { pic: 'set/substation-1.jpg', n: 2, w: 76, dy: 4, ground: quad([64, 1310], [1325, 1850], [1993, 1400]), h: 230, shade: [[1440, 0.8]], lit: cyan, bloom: [3, 0.35], look: { glow: { at: [1136, 490], tint: 0x3fe0ff, size: 0.5 } } },
    ward: { pic: 'set/ward-2.jpg', n: 2, w: 56, dy: 6, round: [1022, 1450, 860], ground: disc(1022, 1450, 860, 412), solids: [[...ring(1022, 1450, 850, 0), ...ring(1022, 1450, 850, 800)]], lit: cyan, bloom: [3, 0.3],
      heads: { today: 'ward_head', pivot: [0, -20], at: [1026, 650], n: 16 } },
    uplink: { pic: 'turbine/uplink-base.jpg', n: 3, w: 92, dy: 6, round: [1008, 1400, 950], ground: disc(1008, 1400, 960, 455), solids: [block([[80, 1480], [920, 1855], [1400, 1815], [1940, 1440], [1000, 960]], 620)], lit: cyan, bloom: [3, 0.3],
      heads: { png: 'turbine/uplink_head_', pivot: [104.4, 219.7], at: [1012, 600], list: [13, 14, 15, 0, 1, 2, 3], of: 1928 / 150 } },
    eclipse: { pic: 'set/eclipse-2.jpg', n: 2, w: 76, dy: 4, ground: quad([64, 1600], [1325, 2000], [1993, 1590]), h: 400, lit: cyan, bloom: [3, 0.4],
      swirl: { at: [936, 812], u: [446, 117], v: [0, 456], n: 16 }, look: { glow: { at: [936, 812], tint: 0x3fe0ff, size: 0.9, k: 0.55 } } },
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

// ---- the heads that turn ----
/** Today's heads (`today`: a name in public/art, its masks with it, the new light on it) or ready-made ones (`png`, drawn
 *  for a base `of` picture px a frame px), their `pivot` (world px about today's anchor; px in the PNG) on the picture's
 *  point `at`. */
async function placed(o, k, at, ax, ay, W, H, light) {
  const out = [], [X, Y] = at(...o.at), up = (im, s, px, py) => fit(enlarge(im, 3), s / 3, px * 3, py * 3, ax + X, ay + Y, W, H);
  for (const i of o.list || Array.from({ length: o.n }, (_, i) => i)) {
    if (o.png) { const p = decodePNG(readFileSync(join(PICTURES, `${o.png}${i}.png`))), im = up({ w: p.w, h: p.h, d: Float32Array.from(p.data) }, k * o.of, ...o.pivot); tone(im.d, light); out.push({ i, im }); continue; }
    const one = async (name) => { const f = await today(name); return f && up(f.im, SCALE / 2, f.ax + o.pivot[0] * 2, f.ay + o.pivot[1] * 2); };
    const im = await one(`${o.today}_${i}`), mask = await one(`${o.today}_${i}_m`); tone(im.d, light); out.push({ i, im, mask });
  }
  return out;
}
const ART = join(root, 'public/art'), sheets = new Map();
/** A frame of today's atlas, untrimmed, with its anchor in px. */
async function today(name) {
  for (const p of JSON.parse(readFileSync(join(ART, 'atlas.json'))).pages) {
    if (!sheets.has(p)) sheets.set(p, { d: JSON.parse(readFileSync(join(ART, p))) });
    const s = sheets.get(p), f = s.d.frames[name]; if (!f) continue;
    s.im ||= await decodeWebP(readFileSync(join(ART, s.d.meta.image)));
    const { w, h } = f.sourceSize, im = image(w, h), t = f.spriteSourceSize, r = f.frame;
    for (let y = 0; y < r.h; y++) im.d.set(s.im.data.subarray(((r.y + y) * s.im.w + r.x) * 4, ((r.y + y) * s.im.w + r.x + r.w) * 4), ((t.y + y) * w + t.x) * 4);
    return { im, ax: f.anchor.x * w, ay: f.anchor.y * h };
  }
  return null;
}
/** The Portal's swirl: `n` frames of a third of a turn of three arms of light, in the ring's opening (its middle `at`, its
 *  half axes `u`, `v`: picture px). */
function swirl({ at, u, v, n }, to, W, H) {
  const c = to(...at), U = to(at[0] + u[0], at[1] + u[1]).map((x, i) => x - c[i]), V = to(at[0] + v[0], at[1] + v[1]).map((x, i) => x - c[i]), det = U[0] * V[1] - U[1] * V[0];
  return Array.from({ length: n }, (_, i) => {
    const im = image(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - c[0], dy = y + 0.5 - c[1], a = (dx * V[1] - dy * V[0]) / det, b = (U[0] * dy - U[1] * dx) / det, r = Math.hypot(a, b); if (r > 1) continue;
      const arm = 0.5 + 0.5 * Math.cos(3 * (Math.atan2(b, a) - 2.2 * Math.log(r + 0.12)) - i / n * 2 * Math.PI), k = Math.min(1, arm * arm * (0.35 + 0.65 * r) + Math.max(0, 1 - r * 3.2)), q = (y * W + x) * 4;
      im.d[q] = 12 + 190 * k * k; im.d[q + 1] = 105 + 140 * k; im.d[q + 2] = 185 + 70 * k; im.d[q + 3] = 255 * Math.min(1, (1 - r) * 12) * 0.92;
    }
    return { i, im };
  });
}

// ---- a building ----
async function building(type, c) {
  const S = SCALE, pic = await picture(c.pic);
  keyGreen(pic, { low: c.low }); const mask = takePaint(pic, { shade: c.shade });
  const g = c.ground, xs = g.map(p => p[0]), ys = g.map(p => p[1]);
  const k = c.scaleBy ? c.scaleBy[2] / (c.scaleBy[1] - c.scaleBy[0]) : c.w / (Math.max(...xs) - Math.min(...xs)); // world px a picture px
  const mid = c.anchor || [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const at = (x, y) => [(x - mid[0]) * k * S, ((y - mid[1]) * k + c.dy) * S]; // (picture point -> frame px about the anchor)
  // A frame with room for everything, cut to it at the end; the anchor on a whole px.
  const R = Math.ceil((c.n * 32 + 100) * S), ax = R, ay = Math.ceil(R * 1.4), W = 2 * R, H = ay + R;
  const put = (im, sharp) => fit(im, k * S, mid[0], mid[1], ax, ay + c.dy * S, W, H, sharp);
  let body = put(pic, CFG.sharp); const m = put(mask, 0);
  if (c.lit) bloom(body, c.lit, Math.max(1, Math.round(c.bloom[0] * S / 2)), c.bloom[1]);
  const light = CFG.tone[CFG.ex.has(type) ? 'ex' : 'kg'];
  tone(body.d, light); // (the light of the new look: the picture only, never the mask nor the shadow)
  const sh = CFG.shadow, pt = (h) => ([x, y, z = 0]) => { const [X, Y] = at(x, y), q = z * k * S * h; return [ax + X + q * sh.dx, ay + Y + q * sh.dy]; };
  // Where it sorts among the units: the line through its left and right ground corners, px south of its middle.
  const by = (f) => g.reduce((a, b) => (f(b[0], a[0]) ? b : a)), look = { z: +((at(...by((p, q) => p < q))[1] + at(...by((p, q) => p > q))[1]) / 2 / S).toFixed(1) };
  // The shadow: its silhouette laid over on the ground from the line through its side corners (towers, battlements, the
  // flag), joined by its walls' own (what the silhouette hides: the near wall's and the near corner's).
  const [l, r] = [(p, q) => p < q, (p, q) => p > q].map(f => at(...by(f))), slope = (r[1] - l[1]) / (r[0] - l[0]);
  const cast = silhouette(body, ay + l[1] - slope * (ax + l[0]), slope, sh.dx, sh.dy), walls = cover((c.solids || [block(c.ground, c.h)]).map(s => s.map(pt(1))), W, H);
  for (let q = 0; q < cast.length; q++) cast[q] = Math.max(cast[q], walls[q]);
  const foot = blur(cover([c.ground.map(pt(0))], W, H), W, H, Math.round(CFG.contact.out * S / 2), 2);
  body = overShadow(body, cast.map((v, i) => Math.min(sh.alpha, Math.max(v * sh.alpha, foot[i] * CFG.contact.alpha))), SHADOW.color);
  const frames = [], cut = (name, im, b) => frames.push({ name, type, im: bytes(crop(im, b)), anchor: { x: (ax - b[0]) / (b[2] - b[0] + 1), y: (ay - b[1]) / (b[3] - b[1] + 1) } });
  const pad = ([x0, y0, x1, y1]) => [x0 - 2, y0 - 2, x1 + 2, y1 + 2];
  const bb = pad(box(body));
  cut(`bldg_${type}`, body, bb); cut(`bldg_${type}_m`, m, bb); // (untrimmed, body and mask in one box: artIcon)
  if (c.rotor) {
    const o = c.rotor, [hx, hy] = at(...o.plate), L = o.blade * k * S, q = Math.ceil(L * 1.3);
    const heads = (await rotor({ w: 2 * q, h: 2 * q, ox: q, oy: q, L, axis: o.axis, n: o.n, key: o.key, hemi: o.hemi })).map(f => fit(f, 2 * q / f.w, 0, 0, ax + hx - q, ay + hy - q, W, H));
    heads.forEach(h => tone(h.d, light));
    const hb = heads.map(h => box(h)), un = pad([Math.min(...hb.map(b => b[0])), Math.min(...hb.map(b => b[1])), Math.max(...hb.map(b => b[2])), Math.max(...hb.map(b => b[3]))]);
    heads.forEach((h, i) => cut(`${type}_head_${i}`, h, un));
  }
  if (c.heads || c.swirl) {
    const heads = c.swirl ? swirl(c.swirl, (x, y) => { const [X, Y] = at(x, y); return [ax + X, ay + Y]; }, W, H) : await placed(c.heads, k * S, at, ax, ay, W, H, light);
    const hb = heads.flatMap(h => [h.im, h.mask]).map(h => h && box(h)).filter(Boolean), un = pad([0, 1].map(i => Math.min(...hb.map(b => b[i]))).concat([2, 3].map(i => Math.max(...hb.map(b => b[i])))));
    for (const h of heads) { cut(`${type}_head_${h.i}`, h.im, un); if (h.mask) cut(`${type}_head_${h.i}_m`, h.mask, un); }
  }
  if (c.look?.glow) { const G = c.look.glow, [x, y] = at(...G.at); look.glow = [G.tint, G.size, G.k ?? 0.3, +(-y / S).toFixed(1), !!G.flicker, +(x / S).toFixed(1)]; }
  if ('smoke' in (c.look ?? {})) look.smoke = c.look.smoke && c.look.smoke.at.map(p => at(...p).map(v => Math.round(v / S + c.n * 16)));
  look.base = (c.round ? ring(...c.round, 0) : g).map(p => at(p[0], p[1]).map(v => +(v / S).toFixed(1))); // (its outline on the ground: the site's frame)
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
const masks = all.filter(f => f.name.endsWith('_m')), ex = (f) => CFG.ex.has(f.type), bodies = all.filter(f => !f.name.endsWith('_m'));
const opt = LOSSLESS ? {} : CFG.webp, pages = [await writePage(0, bodies.filter(f => !ex(f)), opt), await writePage(1, masks, {}), await writePage(2, bodies.filter(ex), opt)]; // (a page a people, so one can change without the other; the masks lossless always: their edges are the paint's)
const file = join(OUT, 'index.json'); let ix = { groups: {} }; try { ix = JSON.parse(readFileSync(file, 'utf8')); } catch { /* (the first group) */ }
ix.groups ||= {}; ix.groups.bldg = { pages, looks };
writeFileSync(file, JSON.stringify(ix, null, 1)); stamp(OUT);
