// The field of tools/scene.mjs composed as a picture: the game's grass, worn earth and land pieces (public/art/new), the
// buildings from their pack built again at 4x (tools/docs/sprites.mjs BUILD, into target/bldg4: built when missing), the
// units from the sharp pictures in the local pictures folder (EBBFALL_PICTURES, leftovers/hires: never committed), the
// blasts painted by the game's own effects (src/client/gl/fx.js). Each walking or rolling unit stands on a dark contact
// shadow with its game frame's own cast shadow from its feet; a flyer's soft shadow lies on the ground below it.
// `field(browser, { W, H, P })`: the picture, W x H px at P px a world px, as a PNG buffer (drawn at twice the size,
// then halved).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SCENE } from './scene.mjs';
import { BUILD } from './docs/sprites.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url)), PIC = (process.env.EBBFALL_PICTURES || '/home/mazzucci/projects/ebbfall-article/nano-test') + '/leftovers/hires/';
const b64 = (f) => 'data:image/' + f.split('.').pop() + ';base64,' + readFileSync(f).toString('base64');
const sheet = (dir, names) => { const fr = {}; for (const p of names) { const j = JSON.parse(readFileSync(dir + p)); for (const [n, r] of Object.entries(j.frames)) fr[n] = { page: dir + j.meta.image, r, scale: +j.meta.scale }; } return fr; };
const KIND = { villager: 'harvester', guard: 'trooper', archer: 'lancer', rider: 'rider', knight: 'knight', ballista: 'bastion', cannon: 'siegeTank', balloon: 'observer', bot: 'lumen', buggy: 'scythe', sellsword: 'prism', bruiser: 'bruiser', android: 'umbra', rover: 'monolith', drone: 'shrike' };

export async function field(browser, { W, H, P, SS = 2 }) {
  const gone = SCENE.filter(s => s[0] === 'unit').map(s => PIC + `${s[1]}_${s[2]}.png`).filter(f => !existsSync(f));
  if (gone.length) throw new Error(`field: ${gone.length} sharp pictures are not there (the first: ${gone[0]}): they are local, never in the repo; set EBBFALL_PICTURES`);
  if (!existsSync(ROOT + 'target/bldg4/index.json')) execFileSync(process.execPath, BUILD, { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  const B = sheet(ROOT + 'target/bldg4/', ['bldg-0.json', 'bldg-1.json', 'bldg-2.json']), L = sheet(ROOT + 'public/art/new/', ['land-0.json']);
  const UP = sheet(ROOT + 'public/art/new/', JSON.parse(readFileSync(ROOT + 'public/art/new/index.json')).groups.unit.pages);
  const FX = readFileSync(ROOT + 'src/client/gl/fx.js', 'utf8');
  const imgs = new Set();
for (const s of SCENE) { if (s[0] === 'unit') { imgs.add(PIC + `${s[1]}_${s[2]}.png`); imgs.add(PIC + `${s[1]}_${s[2]}_m.png`); imgs.add(PIC + `${s[1]}_${String(s[2]).split('_').pop()}.png`); } }
for (const f of [...Object.values(B), ...Object.values(L), ...Object.values(UP)]) imgs.add(f.page);
for (const f of ['land-grass.webp', 'land-calm.webp', 'land-dirt.webp', 'land-floor.webp']) imgs.add(ROOT + 'public/art/new/' + f);
// a unit's world height: its pack frame's (facing 2, standing), solid px over the pack's scale
const tops = JSON.parse(readFileSync(ROOT + 'public/art/new/index.json')).groups.unit.unitTops;
const page = await browser.newPage();
  try {
  await page.setContent('<!doctype html><body></body>');
const png = await page.evaluate(async ({ srcs, SCENE, B, L, UP, W, H, SS, P, PIC, tops, KIND, FX }) => {
  const fxm = await import(URL.createObjectURL(new Blob([FX], { type: 'text/javascript' }))), fx = fxm.paintFx(document);
  const I = {}; await Promise.all(Object.entries(srcs).map(async ([k, s]) => { const i = new Image(); i.src = s; await i.decode(); I[k] = i; }));
  const c = document.createElement('canvas'); c.width = W * SS; c.height = H * SS; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
  const k = P * SS, X = (x) => x * W * SS, Y = (y) => y * H * SS;
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  const tile = (img, scale) => { const p = g.createPattern(I[img], 'repeat'); p.setTransform(new DOMMatrix().scale(scale)); return p; };
  // the grass, then the earth's soft patches and a track
  {
    const layer = (img, scale, rot = 0, off = [0, 0]) => { const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; const q = t.getContext('2d'); const p = q.createPattern(I[img], 'repeat'); p.setTransform(new DOMMatrix().translate(...off).rotate(rot).scale(scale)); q.fillStyle = p; q.fillRect(0, 0, t.width, t.height); return q.getImageData(0, 0, t.width, t.height).data; };
    const calm = layer('ROOT_land-calm.webp', k * 803 / 256), g1 = layer('ROOT_land-grass.webp', k * 310 / 1024), g2 = layer('ROOT_land-grass.webp', k * 437 / 1024, 37, [151, 233]);
    const out = g.createImageData(c.width, c.height), d = out.data, W2 = c.width;
    for (let i = 0; i < d.length; i += 4) {
      let gr = [0, 1, 2].map(j => (g1[i + j] + g2[i + j]) / 2);
      // a fallen leaf or a bare blotch (warmer than green, or dark and dull): the calm green in its place
      const warm = gr[0] > gr[1] * 0.92, dull = gr[1] < 70 && gr[1] - gr[2] < 18;
      if (warm || dull) gr = [calm[i], calm[i + 1], calm[i + 2]];
      let v = [0, 1, 2].map(j => calm[i + j] * 0.4 + gr[j] * 0.6); // (the grass's own texture at 60%)
      v = v.map((x, j) => x * (1 - 0.2) + [24, 44, 16][j] * 0.2); // (the game's dark tone over it)
      const l = 0.3 * v[0] + 0.59 * v[1] + 0.11 * v[2]; v = v.map(x => l + (x - l) * 0.82); // (a step less saturated)
      d[i] = v[0]; d[i + 1] = v[1]; d[i + 2] = v[2]; d[i + 3] = 255;
    }
    g.putImageData(out, 0, 0);
  }
  const soft = (x, y, rx, ry, img, a) => { const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; const q = t.getContext('2d'); q.fillStyle = tile('ROOT_' + img, k / 4); q.fillRect(0, 0, t.width, t.height); q.globalCompositeOperation = 'destination-in'; const gr = q.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.6, `rgba(0,0,0,${a * 0.85})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); q.setTransform(rx, 0, 0, ry, x, y); q.fillStyle = gr; q.fillRect(-1, -1, 2, 2); g.drawImage(t, 0, 0); };
  // sprites
  const frameDraw = (F, name, x, y, s, tint) => {
    const f = F[name]; if (!f) throw new Error('no frame ' + name); const r = f.r.frame, a = f.r.anchor, z = s * k / f.scale;
    g.drawImage(I[f.page], r.x, r.y, r.w, r.h, x - a.x * r.w * z, y - a.y * r.h * z, r.w * z, r.h * z);
    const m = F[name + '_m']; if (m && tint != null) { const mr = m.r.frame, ss = m.r.spriteSourceSize || { x: 0, y: 0 }, t = document.createElement('canvas'); t.width = mr.w; t.height = mr.h; const q = t.getContext('2d'); q.drawImage(I[m.page], mr.x, mr.y, mr.w, mr.h, 0, 0, mr.w, mr.h); q.globalCompositeOperation = 'multiply'; q.fillStyle = hex(tint); q.fillRect(0, 0, mr.w, mr.h); q.globalCompositeOperation = 'destination-in'; q.drawImage(I[m.page], mr.x, mr.y, mr.w, mr.h, 0, 0, mr.w, mr.h); g.drawImage(t, x - a.x * r.w * z + ss.x * z, y - a.y * r.h * z + ss.y * z, mr.w * z, mr.h * z); }
  };
  const solidBox = (img) => { const t = document.createElement('canvas'); t.width = img.width; t.height = img.height; const q = t.getContext('2d'); q.drawImage(img, 0, 0); const d = q.getImageData(0, 0, t.width, t.height).data; let x0 = 1e9, y0 = 1e9, x1 = 0, y1 = 0; for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) if (d[(y * t.width + x) * 4 + 3] > 200) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { x0, y0, x1: x1 + 1, y1: y1 + 1 }; };
  // A pack frame's shadow alone (tools/docs/crops.mjs shadowOf): its pixels no more solid than a shadow, the body's
  // soft edge opened away, spread a little under the body; and the frame's solid box (alpha past 200).
  const shadowOf = (F) => {
    const fr = F.r.frame, w = fr.w, h = fr.h, t = document.createElement('canvas'); t.width = w; t.height = h;
    const tc = t.getContext('2d'); tc.drawImage(I[F.page], fr.x, fr.y, w, h, 0, 0, w, h);
    const id = tc.getImageData(0, 0, w, h), d = id.data, most = 112;
    const body = new Uint8Array(w * h); let a = new Uint8Array(w * h); let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let i = 0; i < w * h; i++) { const al = d[i * 4 + 3]; body[i] = al > most; a[i] = body[i] ? 0 : al; if (al > 200) { const X = i % w, Y = (i / w) | 0; x0 = Math.min(x0, X); x1 = Math.max(x1, X + 1); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y + 1); } }
    const pass = (src, pick, on) => src.map((v, i) => { if (on && !on[i]) return v; let o = v; const x = i % w, y = (i / w) | 0; for (let Y = Math.max(0, y - 1); Y <= Math.min(h - 1, y + 1); Y++) for (let X = Math.max(0, x - 1); X <= Math.min(w - 1, x + 1); X++) o = pick(o, src[Y * w + X]); return o; });
    const open = pass(pass(a, Math.min), Math.max); a = a.map((v, i) => Math.min(v, open[i]));
    for (let i = 0; i < 3; i++) a = pass(a, Math.max, body);
    for (let i = 0; i < w * h; i++) { d[i * 4] = 12; d[i * 4 + 1] = 26; d[i * 4 + 2] = 42; d[i * 4 + 3] = a[i]; }
    tc.putImageData(id, 0, 0); return { c: t, b: { x0, y0, x1, y1 } };
  };
  // The width of what stands on the ground: the solid pixels in the figure's lowest eighth.
  const footWidth = (im, bx) => {
    const t = document.createElement('canvas'); t.width = im.width; t.height = im.height; const q = t.getContext('2d'); q.drawImage(im, 0, 0);
    const y0 = Math.round(bx.y1 - (bx.y1 - bx.y0) / 8), d = q.getImageData(0, y0, im.width, bx.y1 - y0).data; let a = im.width, b = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { const X = (i / 4) % im.width; a = Math.min(a, X); b = Math.max(b, X); }
    return Math.max(b - a, (bx.x1 - bx.x0) * 0.35);
  };
  const unit = (name, f, x, y, tint, s = 1) => {
    const im = I[PIC + `${name}_${f}.png`], mk = I[PIC + `${name}_${f}_m.png`], bx = solidBox(im), air = name === 'drone' || name === 'balloon';
    const ref = solidBox(I[PIC + `${name}_${String(f).split('_').pop()}.png`]); // (a pose is sized by the standing picture at its facing: a raised hammer does not shrink it)
    const h = tops[KIND[name]] * (air ? 0.55 : 1), z = s * h * k / (ref.y1 - ref.y0); // (a flyer's top counts its height in the air: its body is about half)
    const t = document.createElement('canvas'); t.width = im.width; t.height = im.height; const q = t.getContext('2d'); q.drawImage(im, 0, 0);
    const m = document.createElement('canvas'); m.width = im.width; m.height = im.height; const mq = m.getContext('2d'); mq.drawImage(mk, 0, 0); mq.globalCompositeOperation = 'multiply'; mq.fillStyle = hex(tint); mq.fillRect(0, 0, m.width, m.height); mq.globalCompositeOperation = 'destination-in'; mq.drawImage(mk, 0, 0); q.drawImage(m, 0, 0);
    const lift = air ? (name === 'drone' ? 36 : 60) * k : 0, ox = x - (bx.x0 + bx.x1) / 2 * z, oy = y - lift - bx.y1 * z;
    if (air) { // a flyer: its silhouette flattened on the ground below it, soft, apart from it
      const sh = document.createElement('canvas'); sh.width = im.width; sh.height = im.height; const sq = sh.getContext('2d'); sq.drawImage(im, 0, 0); sq.globalCompositeOperation = 'source-in'; sq.fillStyle = '#0c1a2a'; sq.fillRect(0, 0, sh.width, sh.height);
      g.save(); g.globalAlpha = 0.32; g.filter = `blur(${(2 * SS).toFixed(1)}px)`;
      g.setTransform(z * 0.9, 0, 0, z * 0.32, x - (bx.x0 + bx.x1) / 2 * z * 0.9 + 6 * k, y - bx.y1 * z * 0.32 + 3 * k); g.drawImage(sh, 0, 0); g.restore();
    } else {
      // the cast shadow: the game frame's own (its shadow pixels only), scaled to the figure, from its feet
      const fc = String(f).split('_').pop(), fr = UP[`${KIND[name]}_${fc}_0`]; if (!fr) throw new Error('no pack frame ' + KIND[name] + '_' + fc + '_0'); // (a pose's shadow: the standing frame's at its facing)
      const sd = shadowOf(fr), q2 = (ref.y1 - ref.y0) * z / (sd.b.y1 - sd.b.y0);
      g.save(); g.filter = `blur(${(0.6 * q2).toFixed(1)}px)`;
      g.drawImage(sd.c, x - (sd.b.x0 + sd.b.x1) / 2 * q2, y - sd.b.y1 * q2, sd.c.width * q2, sd.c.height * q2); g.restore();
      // the contact shadow: a dark flattened ellipse under the feet or wheels, about the body's width
      const fw = footWidth(im, bx) * z, cy = y - 0.01 * fw;
      g.save(); const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, 'rgba(8,16,24,0.58)'); gr.addColorStop(0.55, 'rgba(8,16,24,0.42)'); gr.addColorStop(1, 'rgba(8,16,24,0)');
      g.setTransform(fw * 0.62, 0, 0, fw * 0.2, x + fw * 0.04, cy); g.fillStyle = gr; g.fillRect(-1, -1, 2, 2); g.restore();
    }
    g.drawImage(t, ox, oy, im.width * z, im.height * z);
  };
  const ROOT = null; // (paths are keys)
  // draw in order: marks, then by ground y, flyers last
  const marks = SCENE.filter(s => s[0] === 'earth' || s[0] === 'track'), rest = SCENE.filter(s => !marks.includes(s));
  for (const s of marks) if (s[0] === 'earth') soft(X(s[1]), Y(s[2]), s[3] * k, s[3] * k * 0.52, 'land-dirt.webp', 0.9); else { for (let i = 0; i <= 60; i++) { const u = i / 60; soft(X(u), Y(s[2] + (s[4] - s[2]) * u + 0.025 * Math.sin(u * 6)), 30 * k, 12 * k, 'land-dirt.webp', 0.5); } }
  const ys = (s) => (s[0] === 'unit' && (s[1] === 'drone' || s[1] === 'balloon')) ? 9 : s[0] === 'unit' ? s[4] : s[0] === 'mine' ? s[2] : s[3];
  for (const s of rest.sort((a, b) => ys(a) - ys(b))) {
    if (s[0] === 'land') frameDraw(L, s[1], X(s[2]), Y(s[3]), 1);
    else if (s[0] === 'mine') frameDraw(L, 'mine_full', X(s[1]), Y(s[2]), 1);
    else if (s[0] === 'boom') { const f = fx.frames[s[1]], q = (s[4] ?? 1) * k, KX = fxm.FX_K; if (!f) throw new Error('no fx frame ' + s[1]); g.drawImage(fx.canvas, f.x * KX, f.y * KX, f.w * KX, f.h * KX, X(s[2]) - f.ax * f.w * q, Y(s[3]) - f.ay * f.h * q, f.w * q, f.h * q); }
    else if (s[0] === 'bldg') { frameDraw(B, 'bldg_' + s[1], X(s[2]), Y(s[3]), 1, s[4]); if (s[5]) frameDraw(B, s[5], X(s[2]), Y(s[3]), 1, s[4]); }
    else unit(s[1], s[2], X(s[3]), Y(s[4]), s[5], s[6]);
  }
  const o = document.createElement('canvas'); o.width = W; o.height = H; const og = o.getContext('2d'); og.imageSmoothingQuality = 'high'; og.drawImage(c, 0, 0, W, H);
  return o.toDataURL('image/png');
}, { srcs: Object.fromEntries([...imgs].map(f => [f.replace(ROOT + 'public/art/new/', 'ROOT_'), b64(f)])), SCENE, B: rel(B), L: rel(L), UP: rel(UP), W, H, SS, P, PIC, tops, KIND, FX });
  return Buffer.from(png.split(',')[1], 'base64');
  } finally { await page.close(); }
  function rel(F) { return Object.fromEntries(Object.entries(F).map(([n, f]) => [n, { ...f, page: f.page.replace(ROOT + 'public/art/new/', 'ROOT_') }])); }
}
