// A check picture for the unit packs: today's Guard, today's other units and a building beside the Guard of one or more
// packs build.mjs made, as the game draws them (units at render.js UNIT_SCALE, 1.2; seat 0's paint) on plain grass, at
// 2 screen px a game px and again at 1.
//   node tools/newart/unit/compare.mjs --packs "30.8=target/newart/a,40 square=target/newart/b" --out FILE.png
// The picture holds generated art: write it outside the repo's tracked files (target/ or the article folder).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../../chromium.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const packs = arg('--packs', '').split(',').filter(Boolean).map(s => s.split('=')), out = resolve(arg('--out', 'target/newart/compare.png'));
const OTHERS = (arg('--others', 'harvester,lancer,knight,scythe,umbra')).split(','), BLDG = arg('--bldg', 'bldg_barracks');
const uri = (f) => `data:image/webp;base64,${readFileSync(f).toString('base64')}`;
/** A pack's pages: [{ frames, image }] (its index's `key` group, or atlas.json's pages). */
const pages = (dir, list) => list.map(p => { const j = JSON.parse(readFileSync(join(dir, p), 'utf8')); return { frames: j.frames, scale: +j.meta.scale, image: uri(join(dir, j.meta.image)) }; });
const today = JSON.parse(readFileSync(join(REPO, 'public/art/atlas.json'), 'utf8'));
const sets = [{ label: 'today', pages: pages(join(REPO, 'public/art'), today.pages), frame0: (k) => `trooper_${k}_0`, walk: (k) => `trooper_${k}_1` }];
for (const [label, dir] of packs) { const ix = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')).groups.unit; sets.push({ label, pages: pages(resolve(dir), ix.pages), frame0: (k) => `trooper_${k}_0`, walk: (k) => ix.animations[`trooper_${k}`][1] }); }
const rows = sets.map((s, i) => ({ label: s.label, set: i, names: [...[0, 2, 4, 6, 8, 10, 12, 14].map(s.frame0), ...[1, 5, 9, 13].map(s.walk), `trooper_3_wind`, `trooper_3_strike`, `trooper_12_strike`] }));
const extra = { set: 0, names: [...OTHERS.map(k => `${k}_3_0`), BLDG] };

const browser = await launchChromium(), page = await browser.newPage();
const png = await page.evaluate(async ({ sets, rows, extra, tint }) => {
  const F = [];
  for (const s of sets) { const m = {}; for (const p of s.pages) { const im = new Image(); im.src = p.image; await im.decode(); for (const [n, f] of Object.entries(p.frames)) m[n] = { im, f, scale: p.scale }; } F.push(m); }
  const CW = 58, RH = 78, X0 = 64, XE = X0 + 15 * CW + 50, W = XE + extra.names.length * 46 + 110, H = rows.length * RH, K = [2, 1], total = K.reduce((s, k) => s + H * k + 8, 0);
  const c = document.createElement('canvas'); c.width = W * 2; c.height = total; const g = c.getContext('2d'); g.fillStyle = '#3f5a2a'; g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = 'high';
  /** Frame `name` of set `si` with its ground point at (x, y), `k` screen px a game px, a unit at 1.2. */
  const put = (si, name, x, y, k) => {
    const e = F[si][name]; if (!e) return; const { im, f, scale } = e, u = (/^bldg_/.test(name) ? 1 : 1.2) * k / scale;
    const sw = f.sourceSize.w, sh = f.sourceSize.h, ox = x - sw * f.anchor.x * u, oy = y - sh * f.anchor.y * u;
    g.drawImage(im, f.frame.x, f.frame.y, f.frame.w, f.frame.h, ox + f.spriteSourceSize.x * u, oy + f.spriteSourceSize.y * u, f.frame.w * u, f.frame.h * u);
    const m = F[si][name + '_m']; if (!m) return;
    const t = document.createElement('canvas'); t.width = Math.ceil(m.f.frame.w * u) + 2; t.height = Math.ceil(m.f.frame.h * u) + 2; const tg = t.getContext('2d'); tg.imageSmoothingQuality = 'high';
    const mask = () => tg.drawImage(m.im, m.f.frame.x, m.f.frame.y, m.f.frame.w, m.f.frame.h, 0, 0, m.f.frame.w * u, m.f.frame.h * u);
    mask(); tg.globalCompositeOperation = 'multiply'; tg.fillStyle = tint; tg.fillRect(0, 0, t.width, t.height); tg.globalCompositeOperation = 'destination-in'; mask();
    g.drawImage(t, ox + m.f.spriteSourceSize.x * u, oy + m.f.spriteSourceSize.y * u);
  };
  let y0 = 0;
  for (const k of K) {
    rows.forEach((r, i) => {
      const y = y0 + (i * RH + RH - 18) * k;
      r.names.forEach((n, j) => put(r.set, n, (X0 + j * CW + CW / 2 + (j >= 12 ? (j - 12) * 14 + 10 : 0)) * k, y, k));
      // today's other units and a building, the same in every row: each Guard beside them (the last of the Guards stands by the first of them)
      extra.names.forEach((n, j) => put(extra.set, n, (XE + j * 46 + (/^bldg_/.test(n) ? 40 : 0)) * k, y - (/^bldg_/.test(n) ? 14 * k : 0), k));
      put(r.set, r.names[2], (XE + extra.names.length * 46 - 22) * k, y + 8 * k, k);
      g.fillStyle = '#fff'; g.font = `${9 * k}px sans-serif`; g.fillText(r.label, 3 * k, y0 + (i * RH + 12) * k);
    });
    y0 += H * k + 8;
  }
  return c.toDataURL('image/png');
}, { sets: sets.map(s => ({ pages: s.pages })), rows, extra, tint: '#' + today.tints[0].toString(16).padStart(6, '0') });
await browser.close();
mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, Buffer.from(png.split(',')[1], 'base64')); console.log(out);
