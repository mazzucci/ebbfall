// Renders the Vael concept models with the game's real pipeline and composes three contact sheets:
//   units.png, buildings.png (2x, the atlas resolution) and phone.png (an 844x390 phone screen at zoom 1.75,
//   Vael next to the current human units and buildings). Usage: node render_alien.mjs [out dir]
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './tools/chromium.mjs';
import { encodePNG } from './tools/art/png.js';
import { tile } from './tools/art/terrain2.js';

const root = fileURLToPath(new URL('./', import.meta.url));
const outDir = process.argv[2] || root;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };

const VUNITS = ['lumen', 'scythe', 'prism', 'monolith', 'shrike', 'halo'];
const VBLDGS = ['conflux', 'spire', 'siphon', 'kiln', 'loom', 'ward', 'zenith'];
const HUNITS = ['harvester', 'trooper', 'lancer', 'medic', 'vanguard', 'wasp', 'observer'];
const HBLDGS = ['core', 'depot', 'extractor', 'barracks', 'forge', 'turret', 'airfield'];
const DIRS = [0, 2, 4, 6, 8, 10, 12, 14];

const plan = [];
for (const key of VUNITS) for (const team of [0, 1]) for (const dir of DIRS) for (const frame of [0, 1]) plan.push({ name: `v_${key}_${team}_${dir}_${frame}`, kind: 'vunit', key, team, dir, frame });
for (const key of VBLDGS) for (const team of [0, 1]) plan.push({ name: `vb_${key}_${team}`, kind: 'vbldg', key, team });
for (const key of HUNITS) for (const team of [0, 1]) for (const dir of [0, 4, 12]) plan.push({ name: `h_${key}_${team}_${dir}_0`, kind: 'hunit', key, team, dir, frame: 0 });
for (const key of HBLDGS) for (const team of [0, 1]) plan.push({ name: `hb_${key}_${team}`, kind: 'hbldg', key, team, dir: 4 });

async function render(plan) {
  const browser = await launchChromium();
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('http://art.local/**', (route) => {
    const p = join(root, new URL(route.request().url()).pathname);
    if (!existsSync(p)) return route.fulfill({ status: 404, body: 'not found' });
    route.fulfill({ status: 200, contentType: TYPES[extname(p)] || 'application/octet-stream', body: readFileSync(p) });
  });
  await page.goto('http://art.local/tools/render3d/index_alien.html');
  await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 }).catch(() => { throw new Error('renderer page failed: ' + errors.join('; ')); });
  const list = await page.evaluate((p) => window.render(p), plan);
  await browser.close();
  if (errors.length) console.warn('renderer warnings:', errors.slice(0, 8).join('; '));
  const by = {};
  for (const s of list) by[s.name] = { w: s.w, h: s.h, data: new Uint8ClampedArray(Buffer.from(s.data, 'base64')), anchor: s.anchor };
  return by;
}

// ---------------- compositing ----------------
const canvas = (w, h) => ({ w, h, data: new Uint8ClampedArray(w * h * 4) });
/** Fill with terrain tiles (the game's painted ground) scaled by s. */
function ground(c, s = 1) {
  const T = 64, tiles = [0, 1, 2, 3, 4, 5].map(v => tile(0, v));
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const wx = x / s, wy = y / s, tx = Math.floor(wx / T), ty = Math.floor(wy / T);
    const t = tiles[(((tx * 7 + ty * 13) % 11) + 11) % 11 > 7 ? 1 + (tx + ty + 6) % 5 : 0];
    const sx = Math.floor(wx - tx * T), sy = Math.floor(wy - ty * T), si = (sy * T + sx) * 4, di = (y * c.w + x) * 4;
    c.data[di] = t.data[si]; c.data[di + 1] = t.data[si + 1]; c.data[di + 2] = t.data[si + 2]; c.data[di + 3] = 255;
  }
}
/** Alpha-blit `spr` scaled by s so its anchor (ground point) lands on (gx, gy); bilinear when scaling down. */
function blit(c, spr, gx, gy, s = 1) {
  const W = Math.round(spr.w * s), H = Math.round(spr.h * s);
  const x0 = Math.round(gx - spr.anchor.x * spr.w * s), y0 = Math.round(gy - spr.anchor.y * spr.h * s);
  const sample = (fx, fy, ch) => { // bilinear
    const x = Math.min(spr.w - 1, Math.max(0, fx)), y = Math.min(spr.h - 1, Math.max(0, fy));
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, xj = Math.min(spr.w - 1, xi + 1), yj = Math.min(spr.h - 1, yi + 1);
    const p = (xx, yy) => spr.data[(yy * spr.w + xx) * 4 + ch];
    return (p(xi, yi) * (1 - xf) + p(xj, yi) * xf) * (1 - yf) + (p(xi, yj) * (1 - xf) + p(xj, yj) * xf) * yf;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x0 + x, dy = y0 + y; if (dx < 0 || dy < 0 || dx >= c.w || dy >= c.h) continue;
    const fx = (x + 0.5) / s - 0.5, fy = (y + 0.5) / s - 0.5;
    const a = (s === 1 ? spr.data[(y * spr.w + x) * 4 + 3] : sample(fx, fy, 3)) / 255; if (a <= 0.01) continue;
    const di = (dy * c.w + dx) * 4;
    for (let ch = 0; ch < 3; ch++) { const v = s === 1 ? spr.data[(y * spr.w + x) * 4 + ch] : sample(fx, fy, ch); c.data[di + ch] = c.data[di + ch] * (1 - a) + v * a; }
  }
}
// A tiny 5x7 pixel font for labels (uppercase, digits, space, few marks)
const FONT = { A: '0E,11,11,1F,11,11,11', B: '1E,11,11,1E,11,11,1E', C: '0E,11,10,10,10,11,0E', D: '1E,11,11,11,11,11,1E', E: '1F,10,10,1E,10,10,1F', F: '1F,10,10,1E,10,10,10', G: '0E,11,10,17,11,11,0F', H: '11,11,11,1F,11,11,11', I: '0E,04,04,04,04,04,0E', J: '07,02,02,02,02,12,0C', K: '11,12,14,18,14,12,11', L: '10,10,10,10,10,10,1F', M: '11,1B,15,15,11,11,11', N: '11,19,15,13,11,11,11', O: '0E,11,11,11,11,11,0E', P: '1E,11,11,1E,10,10,10', Q: '0E,11,11,11,15,12,0D', R: '1E,11,11,1E,14,12,11', S: '0F,10,10,0E,01,01,1E', T: '1F,04,04,04,04,04,04', U: '11,11,11,11,11,11,0E', V: '11,11,11,11,11,0A,04', W: '11,11,11,15,15,15,0A', X: '11,11,0A,04,0A,11,11', Y: '11,11,0A,04,04,04,04', Z: '1F,01,02,04,08,10,1F', ' ': '00,00,00,00,00,00,00', '0': '0E,11,13,15,19,11,0E', '1': '04,0C,04,04,04,04,0E', '2': '0E,11,01,02,04,08,1F', '3': '1F,02,04,02,01,11,0E', '4': '02,06,0A,12,1F,02,02', '5': '1F,10,1E,01,01,11,0E', '6': '06,08,10,1E,11,11,0E', '7': '1F,01,02,04,08,08,08', '8': '0E,11,11,0E,11,11,0E', '9': '0E,11,11,0F,01,02,0C', '.': '00,00,00,00,00,0C,0C', ':': '00,0C,0C,00,0C,0C,00', '/': '01,01,02,04,08,10,10', '-': '00,00,00,1F,00,00,00', '+': '00,04,04,1F,04,04,00', '(': '02,04,08,08,08,04,02', ')': '08,04,02,02,02,04,08' };
function text(c, s, x, y, scale = 2, rgb = [255, 255, 255]) {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const rows = (FONT[ch] || FONT[' ']).split(',').map(h => parseInt(h, 16));
    rows.forEach((bits, ry) => { for (let rx = 0; rx < 5; rx++) if (bits & (16 >> rx)) for (let yy = 0; yy < scale; yy++) for (let xx = 0; xx < scale; xx++) {
      const px = cx + rx * scale + xx, py = y + ry * scale + yy; if (px < 0 || py < 0 || px >= c.w || py >= c.h) continue;
      const di = (py * c.w + px) * 4; c.data[di] = rgb[0]; c.data[di + 1] = rgb[1]; c.data[di + 2] = rgb[2]; c.data[di + 3] = 255;
    } });
    cx += 6 * scale;
  }
}
function shade(c, x, y, w, h, k = 0.55) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { if (xx < 0 || yy < 0 || xx >= c.w || yy >= c.h) continue; const di = (yy * c.w + xx) * 4; c.data[di] *= k; c.data[di + 1] *= k; c.data[di + 2] *= k; } }
const save = (c, name) => { writeFileSync(join(outDir, name), encodePNG(c)); console.log('->', join(outDir, name)); };

const spr = await render(plan);
const NAMES = { lumen: 'Lumen', scythe: 'Scythe', prism: 'Prism', monolith: 'Monolith', shrike: 'Shrike', halo: 'Halo', conflux: 'Conflux', spire: 'Spire', siphon: 'Siphon', kiln: 'Kiln', loom: 'Loom', ward: 'Ward', zenith: 'Zenith',
  harvester: 'Harvester', trooper: 'Trooper', lancer: 'Lancer', medic: 'Medic', vanguard: 'Vanguard', wasp: 'Wasp', observer: 'Observer', core: 'Cmd Core', depot: 'Depot', extractor: 'Ether Rig', barracks: 'Garrison', forge: 'Foundry', turret: 'Turret', airfield: 'Airfield' };

// units.png: one row per Vael unit; team 0 at 8 facings (frame 0) + frame 1 at dir 4, then team 1 at 4 facings. 2x.
{
  const CW = 100, CH = 112, LAB = 150, cols = DIRS.length + 1 + 4;
  const c = canvas(LAB + cols * CW, 40 + VUNITS.length * CH); ground(c, 1);
  shade(c, 0, 0, c.w, 40, 0.4); text(c, 'VAEL UNITS AT 2X (ATLAS SCALE)   TEAM 0: 8 FACINGS + WALK FRAME 1   TEAM 1: 4 FACINGS', 10, 14, 2);
  VUNITS.forEach((key, row) => {
    const y = 40 + row * CH; shade(c, 0, y, LAB, CH, 0.45); text(c, NAMES[key], 10, y + 48, 2);
    const cells = [...DIRS.map(d => [0, d, 0]), [0, 4, 1], ...[0, 4, 8, 12].map(d => [1, d, 0])];
    cells.forEach(([team, dir, frame], i) => blit(c, spr[`v_${key}_${team}_${dir}_${frame}`], LAB + i * CW + CW / 2, y + CH - 34, 1));
  });
  save(c, 'units.png');
}
// buildings.png: a column per Vael building, team 0 and team 1 rows. 2x.
{
  const CW = 300, CH = 310, LAB = 40;
  const c = canvas(VBLDGS.length * CW, LAB + 2 * CH); ground(c, 1);
  shade(c, 0, 0, c.w, LAB, 0.4); text(c, 'VAEL BUILDINGS AT 2X   TOP: TEAM 0 (AMBER)   BOTTOM: TEAM 1 (CRIMSON)', 10, 14, 2);
  VBLDGS.forEach((key, col) => {
    for (const team of [0, 1]) {
      const y = LAB + team * CH, s = spr[`vb_${key}_${team}`], n = { conflux: 4, kiln: 3, zenith: 3 }[key] || 2;
      blit(c, s, col * CW + CW / 2, y + CH - 60 - (n * 32), 1);
    }
    shade(c, col * CW, LAB, 110, 22, 0.45); text(c, `${NAMES[key]} ${({ conflux: 4, kiln: 3, zenith: 3 }[key] || 2)}X${({ conflux: 4, kiln: 3, zenith: 3 }[key] || 2)}`, col * CW + 6, LAB + 4, 2);
  });
  save(c, 'buildings.png');
}
// phone.png: an 844x390 landscape phone screen at the game's touch zoom (1.75 screen px per world px, 2x art).
{
  const Z = 1.75 / 2, c = canvas(844, 390); ground(c, Z);
  shade(c, 0, 0, c.w, 16, 0.4); text(c, 'PHONE 844X390 AT ZOOM 1.75: HUMANS (LEFT) VS VAEL (RIGHT), BOTH TEAM COLOURS', 6, 4, 1);
  const uy = [60, 118]; // unit rows: team 0, team 1
  HUNITS.forEach((key, i) => { for (const t of [0, 1]) blit(c, spr[`h_${key}_${t}_4_0`], 28 + i * 44, uy[t], Z); });
  VUNITS.forEach((key, i) => { for (const t of [0, 1]) blit(c, spr[`v_${key}_${t}_4_0`], 480 + i * 56, uy[t] + 4, Z); });
  text(c, 'HUMANS', 10, 22, 1); text(c, 'VAEL', 462, 22, 1);
  // buildings: 3 each side, team 0; team 1 of the two production buildings in the middle
  const by = 376;
  blit(c, spr['hb_depot_0'], 46, by - 70, Z); blit(c, spr['hb_barracks_0'], 170, by - 50, Z); blit(c, spr['hb_turret_0'], 290, by - 70, Z);
  blit(c, spr['hb_barracks_1'], 390, by - 170, Z);
  blit(c, spr['vb_kiln_1'], 390, by - 20, Z);
  blit(c, spr['vb_spire_0'], 500, by - 70, Z); blit(c, spr['vb_kiln_0'], 630, by - 50, Z); blit(c, spr['vb_ward_0'], 760, by - 70, Z);
  save(c, 'phone.png');
}
// phone_core.png: the two cores and the air units as the phone shows them, plus a mixed skirmish line.
{
  const Z = 1.75 / 2, c = canvas(844, 390); ground(c, Z);
  shade(c, 0, 0, c.w, 16, 0.4); text(c, 'PHONE: CORES, ETHER BUILDINGS, AND A MIXED LINE (WHO IS WHO AT A GLANCE)', 6, 4, 1);
  blit(c, spr['hb_core_0'], 120, 200, Z); blit(c, spr['vb_conflux_1'], 400, 200, Z);
  blit(c, spr['hb_extractor_1'], 560, 190, Z); blit(c, spr['vb_siphon_0'], 680, 190, Z);
  blit(c, spr['hb_forge_0'], 560, 330, Z); blit(c, spr['vb_loom_1'], 680, 330, Z); blit(c, spr['vb_zenith_0'], 790, 300, Z);
  const line = [['h', 'trooper', 0, 0], ['v', 'scythe', 1, 8], ['h', 'vanguard', 0, 0], ['v', 'prism', 1, 8], ['h', 'lancer', 0, 0], ['v', 'monolith', 1, 8], ['h', 'wasp', 0, 0], ['v', 'shrike', 1, 8], ['h', 'harvester', 0, 0], ['v', 'lumen', 1, 8], ['h', 'medic', 0, 0], ['v', 'halo', 1, 8], ['h', 'observer', 0, 0]];
  line.forEach(([r, key, t, d], i) => blit(c, spr[`${r}_${key}_${t}_${d}_0`], 30 + i * 48, 300 + (i % 2) * 26, Z));
  save(c, 'phone_core.png');
}
