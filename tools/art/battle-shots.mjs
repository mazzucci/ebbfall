// Battle shots of the whole set in the built game (step 2 of the new art's review): npm run build, then
//   node tools/art/battle-shots.mjs [outdir] [scene...]     (default target/art-review/step2/battle; scenes below)
// Each scene is a real single-player game started through the menu (your race and the AI's set on the board), the AI
// switched off, then set up through the debug handle (window.endfall): armies put down by engine.debugSpawn at a gold
// field and sent at each other (engine.attackMoveGroup), a base raised through the engine's own build orders
// (engine.placeBuilding with granted resources) and fast-forwarded (skip). The page's clock (Playwright's) is then held
// so the frame shot is the frame the game drew mid-fight. Your army is box-selected (a tap on a phone) through the UI,
// so the HUD shows a selection. Each scene at desktop size (1280x720) and a phone's landscape (844x390 at 2x):
//   <scene>-desktop.png, <scene>-phone.png
//   mixed      the Kingdom (sim race `humans`) against the Expedition (`vael`), a mixed army each of every kind they
//              train (Riders, Knights and Ballistas; Bruisers among them), at a gold field, held on an arrow and a
//              tracer in flight
//   mixed-close the same, zoomed in to 1.8 (each kind's art up close)
//   kingdom    a Kingdom mirror (seats 0 and 1)
//   expedition an Expedition mirror
//   base-kingdom, base-expedition   a base with every building of its people
//   home-kingdom, home-expedition   the same base with an army of every kind drawn up south of it, at zoom 1
//   air        the flyers (the Balloon; the Drones) with Archers and Mercenaries, held on a frame with an arrow and a
//              tracer in flight where one comes
//   shore      the mixed fight on the Shore map (Mirror Lake, chosen in the menu's map list), zoomed out to 0.75
// It prints, per shot, what was in flight (the projectiles by shooter) and the units on screen.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { start, stop, browserContext, baseUrl, board, DESKTOP, PHONE } from '../../test/e2e/harness.mjs';
import { MAPS } from '../../src/client/maps.js';

const [outArg, ...only] = process.argv.slice(2);
const outDir = outArg ?? fileURLToPath(new URL('../../target/art-review/step2/battle/', import.meta.url));
mkdirSync(outDir, { recursive: true });

const H_ARMY = { trooper: 4, lancer: 3, rider: 3, knight: 2, bastion: 1, siegeTank: 1, harvester: 1, observer: 1 };
const V_ARMY = { scythe: 2, prism: 3, bruiser: 3, umbra: 2, monolith: 1, lumen: 1, shrike: 2 };
const SCENES = {
  mixed: { races: ['humans', 'vael'], armies: [H_ARMY, V_ARMY], shots: ['lancer', 'prism'], skip: 1 },
  'mixed-close': { races: ['humans', 'vael'], armies: [H_ARMY, V_ARMY], shots: ['lancer', 'prism'], skip: 1, zoom: 1.8 },
  shore: { races: ['humans', 'vael'], armies: [H_ARMY, V_ARMY], map: 'Mirror Lake', zoom: 0.75 },
  kingdom: { races: ['humans', 'humans'], armies: [H_ARMY, { trooper: 5, lancer: 3, knight: 3, rider: 2, bastion: 1, siegeTank: 1 }] },
  expedition: { races: ['vael', 'vael'], armies: [V_ARMY, { scythe: 3, prism: 4, bruiser: 3, monolith: 2, umbra: 1 }] },
  'base-kingdom': { races: ['humans', 'vael'], base: true },
  'base-expedition': { races: ['vael', 'humans'], base: true },
  'home-kingdom': { races: ['humans', 'vael'], base: true, army: H_ARMY, zoom: 1 },                                      // (the art polish's in-game shots: a base with its buildings and an army standing before it, at zoom 1)
  'home-expedition': { races: ['vael', 'humans'], base: true, army: V_ARMY, zoom: 1 },
  air: { races: ['humans', 'vael'], armies: [{ observer: 2, bastion: 1, lancer: 4 }, { shrike: 4, prism: 4 }], shots: ['lancer', 'prism'], skip: 1.2 },
};

/** A single-player game through the menu: your race and the AI's on the board, START; the AI then switched off. */
async function newGame(device, races, mapName) {
  const ctx = await browserContext(device), page = await ctx.newPage(), touch = !!device.hasTouch, errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.install(); // (runs with real time until held: `freeze`)
  const map = mapName ? `&map=${MAPS.findIndex(m => m.name === mapName)}` : ''; // (by ?map=: the Lake is in no list since the 64x64 maps were hidden)
  await page.goto(`${baseUrl()}?seed=4242${map}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.endfall, null, { timeout: 60000 });
  const press = (sel) => (touch ? page.locator(sel).tap() : page.locator(sel).click());
  await press('#btnSolo');
  const b = board(page);
  if (races[0] !== 'humans') await b.race(0, races[0]);
  await b.race(1, races[1]);
  await press('#btnStart');
  await page.waitForFunction(() => window.endfall && endfall.G.units.length > 0);
  await page.evaluate(() => endfall.engine.disableAi());
  return { ctx, page, touch, errors };
}

/** Two armies spawned either side of the gold mine nearest the map's middle, each attack-moved at the other. Returns
 *  the field's point and your army's box. */
const fight = (page, armies) => page.evaluate((armies) => {
  const { G, map, engine } = endfall, T = engine.TILE, cores = G.bldgs.filter(b => b.team <= 1);
  const field = map.nodes.filter(n => n.type === 'mine').map(n => ({ n, d: Math.min(...cores.map(c => Math.hypot(c.x - n.x, c.y - n.y))) })).sort((a, b) => b.d - a.d)[0].n;
  const free = (x, y) => { const tx = Math.floor(x / T), ty = Math.floor(y / T); return engine.inMap(tx, ty) && !map.rock[engine.idx(tx, ty)] && !map.occ[engine.idx(tx, ty)]; };
  const groups = [[], []], box = [Infinity, Infinity, -Infinity, -Infinity];
  armies.forEach((army, seat) => {
    const dir = seat ? 1 : -1, kinds = Object.entries(army).flatMap(([k, n]) => Array(n).fill(k));
    let k = 0;
    for (let col = 0; k < kinds.length && col < 12; col++) for (let row = -3; row <= 3 && k < kinds.length; row++) {
      const x = field.x + dir * (3.5 + col * 1.1) * T, y = field.y + row * 1.1 * T + (col % 2) * 0.5 * T;
      if (!engine.UNITS[kinds[k]].air && !free(x, y)) continue;
      const id = engine.debugSpawn(seat, kinds[k++], x, y); if (id) groups[seat].push(id);
      if (!seat) { box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); }
    }
  });
  const of = (ids) => G.units.filter(u => ids.includes(u.id));
  engine.attackMoveGroup(of(groups[0]), field.x + 6 * T, field.y); engine.attackMoveGroup(of(groups[1]), field.x - 6 * T, field.y);
  return { x: field.x, y: field.y, box, spawned: groups.map(g => g.length) };
}, armies);

/** Every building of your people raised round your Core through the engine's build orders, a tier at a time, with
 *  resources granted and time skipped; each footprint kept a tile clear of the others. Returns the base's middle. */
const raiseBase = (page) => page.evaluate(() => {
  const { G, map, engine } = endfall, me = G.me, T = engine.TILE, f = engine.FACTIONS[G.factions[me]];
  const core = G.bldgs.find(b => b.team === me), todo = [...f.buildBasic, ...f.buildAdvanced].filter((k, i, a) => k !== f.hq && a.indexOf(k) === i);
  const rects = G.bldgs.filter(b => b.team === me).map(b => [b.tx, b.ty, b.w, b.h]);
  const clear = (tx, ty, w, h) => rects.every(([x, y, rw, rh]) => tx + w + 1 <= x || x + rw + 1 <= tx || ty + h + 1 <= y || y + rh + 1 <= ty);
  const why = {}, placed = [], spots = []; for (let r = 0; r <= 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) spots.push([core.tx + dx, core.ty + dy]);
  for (let round = 0; round < 6 && todo.length; round++) {
    engine.setResources(me, 99999, 99999);
    const workers = G.units.filter(u => u.team === me && engine.UNITS[u.type].worker);
    for (const k of todo.slice()) {
      if (!engine.hasReq(me, k)) continue;
      const d = engine.BUILDINGS[k], at = spots.find(([tx, ty]) => clear(tx, ty, d.w, d.h) && engine.canPlace(k, tx, ty, me));
      const err = at ? engine.placeBuilding(me, k, at[0], at[1], workers[placed.length % workers.length]) : 'no room';
      if (err) { why[k] = err; continue; }
      rects.push([at[0], at[1], d.w, d.h]); placed.push(k); todo.splice(todo.indexOf(k), 1);
    }
    for (let s = 0; s < 150; s++) { // (a builder walks to its site before the building appears)
      endfall.skip(1);
      if (placed.every(k => G.bldgs.some(b => b.team === me && b.type === k && b.done))) break;
    }
  }
  const mine = G.bldgs.filter(b => b.team === me), xs = mine.map(b => b.x), ys = mine.map(b => b.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, left: todo.map(k => `${k} (${why[k]})`), built: mine.map(b => b.type) };
});

/** An army of every kind drawn up in rows south of the base's middle (the art polish's in-game shots). */
const muster = (page, army, at) => page.evaluate(([army, at]) => {
  const { G, map, engine } = endfall, T = engine.TILE, me = G.me, kinds = Object.entries(army).flatMap(([k, n]) => Array(n).fill(k));
  const free = (x, y) => { const tx = Math.floor(x / T), ty = Math.floor(y / T); return engine.inMap(tx, ty) && !map.rock[engine.idx(tx, ty)] && !map.occ[engine.idx(tx, ty)]; };
  const south = Math.max(...G.bldgs.filter(b => b.team === me).map(b => b.y + b.h * T / 2)) + 1.5 * T;
  let k = 0; for (let row = 0; k < kinds.length && row < 4; row++) for (let col = -5; col <= 5 && k < kinds.length; col++) {
    const x = at.x + col * 1.3 * T, y = south + row * 1.3 * T;
    if (!engine.UNITS[kinds[k]].air && !free(x, y)) continue;
    engine.debugSpawn(me, kinds[k++], x, y);
  }
  return { x: at.x, y: (at.y + south + 2 * T) / 2 };
}, [army, at]);

/** Hold the page's clock (no frame, no tick until `frame`; far enough ahead that a loaded machine reaches it before the hold), and draw `ms` of frames. */
const freeze = async (page) => page.clock.pauseAt(await page.evaluate(() => Date.now()) + 15000);
const frame = (page, ms = 60) => page.clock.runFor(ms);

async function shoot(name, scene, device, label) {
  const g = await newGame(device, scene.races, scene.map), { page } = g, file = join(outDir, `${name}-${label}.png`);
  try {
    let at, note = '';
    if (scene.base) { const b = await raiseBase(page); at = b; note = `built ${b.built.join(' ')}${b.left.length ? `; NOT BUILT ${b.left.join(' ')}` : ''}`; if (scene.army) at = await muster(page, scene.army, b); }
    else { at = await fight(page, scene.armies); note = `spawned ${at.spawned.join(' and ')}; `; }
    await page.evaluate(([x, y, z]) => { endfall.cam.zoom = z; endfall.centerOn(x, y); }, [at.x, at.y, scene.zoom ?? (scene.base ? 0.75 : 1)]);
    await frame(page, 100);
    if (at.box) { // your army selected through the UI: a box drag, or a tap on one unit
      const canvas = await page.locator('#game').boundingBox(), c = await page.evaluate(() => ({ x: endfall.cam.x, y: endfall.cam.y, z: endfall.cam.zoom }));
      const sx = (wx) => canvas.x + (wx - c.x) * c.z, sy = (wy) => canvas.y + (wy - c.y) * c.z, [x0, y0, x1, y1] = at.box;
      if (g.touch) await page.touchscreen.tap(sx(x1), sy((y0 + y1) / 2));
      else { await page.mouse.move(sx(x0) - 20, sy(y0) - 20); await page.mouse.down(); await page.mouse.move(sx(x1) + 20, sy(y1) + 20, { steps: 6 }); await page.mouse.up(); await page.mouse.move(canvas.x + canvas.width * 0.8, canvas.y + canvas.height * 0.2); }
      await frame(page, 100);
    }
    if (!scene.base) await page.evaluate((s) => endfall.skip(s), scene.skip ?? 2.5);
    await freeze(page);
    await page.evaluate(([x, y]) => endfall.centerOn(x, y), [at.x, at.y]);
    // Frame by frame (a tick or so each) until the scene's shots are in flight on the frame drawn: all of them if they
    // come within 150 frames, else the last frame with any
    let k = 0;
    do await frame(page, 34);
    while (scene.shots && k++ < 150 && !(await page.evaluate((want) => want.every(w => endfall.G.projs.some(p => p.by === w)), scene.shots)));
    const seen = await page.evaluate(() => ({ projs: endfall.G.projs.map(p => p.by ?? p.type), units: endfall.G.units.length, sel: endfall.ui.sel?.length ?? 0 }));
    await page.screenshot({ path: file });
    console.log(`${file}: ${scene.base ? note : `${note}in flight (by shooter): ${seen.projs.join(' ') || 'none'}; ${seen.units} units, ${seen.sel} selected`}${g.errors.length ? `; page errors: ${g.errors.join(' | ')}` : ''}`);
  } finally { await g.ctx.close(); }
}

await start();
try {
  for (const [name, scene] of Object.entries(SCENES)) {
    if (only.length && !only.includes(name)) continue;
    await shoot(name, scene, DESKTOP, 'desktop');
    await shoot(name, scene, PHONE, 'phone');
  }
} finally { await stop(); }
