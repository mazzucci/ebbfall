// HD experiment (branch hd-exp, never merged): the same instant of a real game drawn with today's frames and with the
// sample's 2x and 3x frames (endfall.hd, src/client/gl/render.js), shot at one viewport, DPR and zoom per run.
//   node tools/hd-capture.mjs <name> <width> <height> <dpr> <zoom>     -> target/hd/shots/<name>/<view>-<level>.png, shots.json
// One game (the Kingdom against the Expedition, seed 4242, the AI off, the fog off): a fight at the gold field farthest
// from both bases (Archers and Knights against Androids and Drones), a ring of Archers and Knights walking out in 16
// directions by the Castle, a ring of Androids and Drones by the Data center. The page's clock is then held: every level
// is the same frame (level 0 is shot again last and must match the first shot byte for byte).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { start, stop, browserContext, baseUrl, board } from '../test/e2e/harness.mjs';
import { decodeAny } from './hd-png.mjs';

const [name, W, H, DPR, ZOOM] = process.argv.slice(2), zoom = +ZOOM;
const out = join(fileURLToPath(new URL('../target/hd/shots/', import.meta.url)), name);
mkdirSync(out, { recursive: true });
const ARMIES = [{ lancer: 9, knight: 7 }, { umbra: 9, shrike: 7 }];

await start();
const log = { name, viewport: [+W, +H], dpr: +DPR, zoom, views: {}, errors: [] };
try {
  const ctx = await browserContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: +DPR }), page = await ctx.newPage();
  page.on('pageerror', e => log.errors.push(e.message));
  await page.clock.install();
  await page.goto(`${baseUrl()}?seed=4242`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.endfall, null, { timeout: 120000 });
  await page.locator('#btnSolo').click();
  await board(page).race(1, 'vael');
  await page.locator('#btnStart').click();
  await page.waitForFunction(() => window.endfall && endfall.G.units.length > 0);
  log.setup = await page.evaluate((armies) => {
    const { G, map, engine } = endfall, T = engine.TILE;
    engine.disableAi(); engine.revealAll(true); endfall.fog(false);
    const free = (x, y) => { const tx = Math.floor(x / T), ty = Math.floor(y / T); return engine.inMap(tx, ty) && !map.rock[engine.idx(tx, ty)] && !map.occ[engine.idx(tx, ty)]; };
    // the fight (tools/art/battle-shots.mjs `fight`): two armies either side of the gold field farthest from the bases
    const cores = G.bldgs.filter(b => b.team <= 1);
    const field = map.nodes.filter(n => n.type === 'mine').map(n => ({ n, d: Math.min(...cores.map(c => Math.hypot(c.x - n.x, c.y - n.y))) })).sort((a, b) => b.d - a.d)[0].n;
    const groups = [[], []];
    armies.forEach((army, seat) => {
      const dir = seat ? 1 : -1, kinds = Object.entries(army).flatMap(([k, n]) => Array(n).fill(k)); let k = 0;
      for (let col = 0; k < kinds.length && col < 12; col++) for (let row = -3; row <= 3 && k < kinds.length; row++) {
        const x = field.x + dir * (3.5 + col * 1.1) * T, y = field.y + row * 1.1 * T + (col % 2) * 0.5 * T;
        if (!engine.UNITS[kinds[k]].air && !free(x, y)) continue;
        const id = engine.debugSpawn(seat, kinds[k++], x, y); if (id) groups[seat].push(id);
      }
    });
    const of = (ids) => G.units.filter(u => ids.includes(u.id));
    engine.attackMoveGroup(of(groups[0]), field.x + 6 * T, field.y); engine.attackMoveGroup(of(groups[1]), field.x - 6 * T, field.y);
    endfall.skip(3.2);
    // the rings: two kinds by turns round a point south-east of each seat's main building, each walking straight out
    const rings = cores.map((core, seat) => {
      const kinds = seat ? ['umbra', 'shrike'] : ['lancer', 'knight'], f = engine.BUILDINGS[core.type], w = (core.w ?? f.w) * T;
      let at = null;
      // (the first spot round the building with room for the ring: east first, then round by eighths, nearest first)
      const mid0 = Math.atan2(engine.WH / 2 - core.y, engine.WW / 2 - core.x); // (toward the map's middle first: room to walk out)
      for (const far of [5.2, 6.5, 8]) for (const q of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2.5, -2.5, 3.5, -3.5]) {
        if (at) break;
        const a0 = mid0 + q / 8 * Math.PI * 2, c = { x: core.x + Math.cos(a0) * (w / 2 + far * T), y: core.y + Math.sin(a0) * (w / 2 + far * T) * 0.8 }; let ok = true;
        for (let d = 0; d < 16 && ok; d++) for (const r of [2.4, 3.4, 4.6]) { const a = d / 16 * Math.PI * 2; if (!free(c.x + Math.cos(a) * r * T, c.y + Math.sin(a) * r * T)) ok = false; }
        if (ok) at = c;
      }
      if (!at) return null;
      const ids = [];
      for (let d = 0; d < 16; d++) {
        const a = d / 16 * Math.PI * 2, x = at.x + Math.cos(a) * 2.4 * T, y = at.y + Math.sin(a) * 2.4 * T, id = engine.debugSpawn(seat, kinds[d % 2], x, y);
        if (id) ids.push([id, at.x + Math.cos(a) * 12 * T, at.y + Math.sin(a) * 12 * T]);
      }
      for (const [id, x, y] of ids) { const u = G.units.find(u => u.id === id); if (u) engine.moveTo(u, x, y); }
      // (three of our Drones over the Castle's near side, for the trailer's question: a Castle, Knights and a Drone in one frame)
      const extra = seat ? [] : [[0.62, 0.1], [0.74, 0.55], [0.5, 0.8]].map(([t, dy]) => engine.debugSpawn(0, 'shrike', core.x + (at.x - core.x) * t, core.y + (at.y - core.y) * t - 60 + dy * 70));
      return { at, core: { x: core.x, y: core.y, type: core.type }, n: ids.length, ids: ids.map(i => i[0]), extra };
    });
    endfall.skip(0.55);
    G.events.length = 0;
    const alive = (seat) => G.units.filter(u => groups[seat].includes(u.id) && !u.dead).length;
    // points of interest (world px) for the detail crops: a building's upper and lower halves, four of a ring's units,
    // and in the fight the middle of the two fronts and each kind's unit nearest an enemy
    const unit = (id) => G.units.find(u => u.id === id), top = (u) => ({ label: u.type, x: u.x, y: u.y - endfall.unitTop(u.type) / 2 });
    const ringPoi = (r) => [2, 5, 10, 13].map(d => unit(r.ids[d])).filter(Boolean).map(top);
    const bldgPoi = (r, name) => [{ label: `${name}-top`, x: r.core.x, y: r.core.y - 70 }, { label: `${name}-base`, x: r.core.x, y: r.core.y + 10 }];
    const fighters = G.units.filter(u => (groups[0].includes(u.id) || groups[1].includes(u.id)) && !u.dead), foes = (u) => fighters.filter(v => v.team !== u.team);
    const near = (u) => Math.min(...foes(u).map(v => Math.hypot(v.x - u.x, v.y - u.y)));
    const front = ['knight', 'lancer', 'umbra', 'shrike'].map(k => fighters.filter(u => u.type === k).sort((a, b) => near(a) - near(b))[0]).filter(Boolean);
    const mean = (us) => ({ x: us.reduce((a, u) => a + u.x, 0) / us.length, y: us.reduce((a, u) => a + u.y, 0) / us.length });
    const centre = fighters.length ? mean(fighters) : { x: field.x, y: field.y };
    const poi = { castle: bldgPoi(rings[0], 'castle'), 'kingdom-units': [...ringPoi(rings[0]), ...rings[0].extra.slice(0, 1).map(unit).filter(Boolean).map(top)], datacenter: bldgPoi(rings[1], 'datacenter'), 'expedition-units': ringPoi(rings[1]),
      fight: [{ label: 'middle', ...centre }, ...front.map(top)] };
    return { field: { x: field.x, y: field.y }, centre, rings, poi, fight: [alive(0), alive(1)], poses: fighters.filter(u => u.type === 'knight').map(u => u.id), hd: [endfall.hd(2), endfall.hd(3), endfall.hd(0)] };
  }, ARMIES);
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 15000);
  await page.clock.runFor(100);
  await page.mouse.move(+W - 5, 5); // (the pointer off the map)
  const box = await page.locator('#game').boundingBox(); log.canvasBox = box;
  const [k, e] = log.setup.rings, mid = (a, b, t = 0.5) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  // at the default zoom one view holds a building and its ring; zoomed all the way in, one each
  const P = log.setup.poi;
  const views = zoom < 2 ? { fight: log.setup.centre, kingdom: mid(k.core, k.at, 0.55), expedition: mid(e.core, e.at, 0.55) }
    : { fight: log.setup.centre, castle: { x: k.core.x, y: k.core.y - 20 }, 'kingdom-units': k.at, datacenter: { x: e.core.x, y: e.core.y - 20 }, 'expedition-units': e.at };
  const pois = zoom < 2 ? { fight: P.fight, kingdom: [...P.castle, ...P['kingdom-units']], expedition: [...P.datacenter, ...P['expedition-units']] } : P;
  for (const [view, at] of Object.entries(views)) {
    if (name.startsWith('t') && view !== 'kingdom') continue; // (the trailer's question: the Castle, Knights and a Drone only)
    await page.evaluate(([x, y, z]) => { endfall.cam.zoom = z; endfall.centerOn(x, y); }, [at.x, at.y, zoom]);
    const files = [], done = ['1x', '2x', '3x', 'check'].every(l => existsSync(join(out, `${view}-${l}.png`))); // (a view shot by a run that was cut short: its files stand, the camera is read again)
    for (const level of [0, 2, 3, 0]) {
      const got = await page.evaluate((l) => { const r = endfall.hd(l); return { ...r, cam: { ...endfall.cam }, tick: endfall.G.tick ?? endfall.G.time }; }, level);
      const file = join(out, `${view}-${files.length === 3 ? 'check' : `${level || 1}x`}.png`);
      if (!done) await page.screenshot({ path: file, timeout: 300000 }); // (a level's pages are uploaded, mipmaps and all, the first time they are drawn: slow on software GL)
      files.push({ file, ...got });
    }
    // (the map held still: the first and the last shot, both today's frames, the same inside the canvas, 48 CSS px in
    // from its edges; the page's own CSS animations round it run on)
    const A = decodeAny(readFileSync(files[0].file)), B = decodeAny(readFileSync(files[3].file)), d = +DPR, m = 48 * d; let moved = 0;
    for (let y = Math.round(box.y * d + m); y < (box.y + box.height) * d - m; y++) for (let x = Math.round(box.x * d + m); x < (box.x + box.width) * d - m; x++) { const i = (y * A.w + x) * 4; if (A.data[i] !== B.data[i] || A.data[i + 1] !== B.data[i + 1] || A.data[i + 2] !== B.data[i + 2]) moved++; }
    const same = moved === 0;
    log.views[view] = { at, poi: pois[view], cam: files[0].cam, tick: files.map(f => f.tick), frames: files.map(f => f.frames), heldStill: same, moved };
    console.log(`${name} ${view}: levels ${files.map(f => f.level).join(' ')}, held still: ${same}`);
  }
  log.status = await page.evaluate(() => ({ dpr: devicePixelRatio, canvas: [document.getElementById('game').width, document.getElementById('game').height], view: { ...endfall.view }, gl: (() => { const c = document.createElement('canvas').getContext('webgl2'); return { maxTexture: c.getParameter(c.MAX_TEXTURE_SIZE), renderer: c.getParameter(c.RENDERER) }; })() }));
  await ctx.close();
} finally { await stop(); }
writeFileSync(join(out, 'shots.json'), JSON.stringify(log, null, 1));
console.log(JSON.stringify({ setup: log.setup, status: log.status, errors: log.errors }));
