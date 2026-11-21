// detail-exp (never merged; after tools/hd-capture.mjs): one busy fight at the Expedition's Data center, the same
// instant drawn with today's art as shipped and with the detail level (endfall.hd(2): public/art/hd2, the detailed
// Knight and Data center at 2x beside the earlier experiment's 2x Archer, Drone, Android and Castle), at one window
// and pixel ratio, at the game's start zoom and zoomed all the way in.
//   node tools/detail-capture.mjs <name> <width> <height> <dpr> [zooms=start,max] [fight seconds=3.4]
//   -> target/detail/shots/<name>/<view>-<today|detail|check>.png, shots.json
// One game (the Kingdom, seat 0, against the Expedition, seed 4242, the AI off, the fog off): seven Knights, six
// Archers, five Guards and a Cannon ride in on the Data center from the west round to the south-east; seven Androids,
// five Drones, four Mercenaries and three Bots stand before it. The page's clock is then held: both levels are the same
// frame (today's is shot again last and must match the first shot inside the canvas).
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { start, stop, browserContext, baseUrl, board } from '../test/e2e/harness.mjs';
import { decodeAny } from './hd-png.mjs';

const [name, W, H, DPR, ZOOMS = 'start,max', SECS = '3.4'] = process.argv.slice(2);
const out = join(fileURLToPath(new URL('../target/detail/shots/', import.meta.url)), name);
mkdirSync(out, { recursive: true });

await start();
const log = { name, viewport: [+W, +H], dpr: +DPR, views: {}, errors: [] };
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
  log.setup = await page.evaluate((secs) => {
    const { G, map, engine } = endfall, T = engine.TILE;
    engine.disableAi(); engine.revealAll(true); endfall.fog(false);
    const free = (x, y) => { const tx = Math.floor(x / T), ty = Math.floor(y / T); return engine.inMap(tx, ty) && !map.rock[engine.idx(tx, ty)] && !map.occ[engine.idx(tx, ty)]; };
    const hall = G.bldgs.find(b => b.team === 1 && b.type === 'conflux');
    const spawn = (seat, kind, a, d) => { // `a` radians round the hall (0 east, a quarter turn south), `d` tiles out; the nearest free spot outward
      for (let k = 0; k < 6; k++) { const x = hall.x + Math.cos(a) * (d + k * 0.6) * T, y = hall.y + Math.sin(a) * (d + k * 0.6) * T * 0.9; if (engine.UNITS[kind].air || free(x, y)) return engine.debugSpawn(seat, kind, x, y); }
      return 0;
    };
    const deg = (v) => v * Math.PI / 180, ids = [[], []];
    // the Kingdom, in an arc from the west round the south to the east: the Knights in front, each from its own bearing
    [[200, 7.2], [172, 7.6], [148, 7.4], [120, 7.0], [92, 7.2], [62, 7.4], [30, 7.6]].forEach(([a, d]) => ids[0].push(spawn(0, 'knight', deg(a), d)));
    [[188, 9.6], [160, 10], [134, 9.8], [106, 10], [78, 9.8], [48, 10]].forEach(([a, d]) => ids[0].push(spawn(0, 'lancer', deg(a), d)));
    [[178, 8.6], [142, 8.8], [112, 8.6], [84, 8.8], [54, 8.6]].forEach(([a, d]) => ids[0].push(spawn(0, 'trooper', deg(a), d)));
    ids[0].push(spawn(0, 'siegeTank', deg(124), 11.4));
    // the Expedition, before the hall: Androids in a line, Mercenaries behind them, Drones over them, Bots at work
    [[195, 4.6], [165, 4.8], [140, 4.6], [115, 4.4], [90, 4.4], [62, 4.6], [35, 4.8]].forEach(([a, d]) => ids[1].push(spawn(1, 'umbra', deg(a), d)));
    [[180, 3.6], [128, 3.5], [100, 3.4], [50, 3.6]].forEach(([a, d]) => ids[1].push(spawn(1, 'prism', deg(a), d)));
    [[205, 5.6], [152, 5.6], [104, 5.4], [74, 5.6], [20, 5.6]].forEach(([a, d]) => ids[1].push(spawn(1, 'shrike', deg(a), d)));
    [[-20, 3.6], [-60, 3.4], [230, 3.6]].forEach(([a, d]) => ids[1].push(spawn(1, 'lumen', deg(a), d)));
    const of = (seat) => G.units.filter(u => ids[seat].includes(u.id));
    engine.attackMoveGroup(of(0), hall.x, hall.y + T); engine.attackMoveGroup(of(1).filter(u => u.type !== 'lumen'), hall.x, hall.y + 5 * T);
    endfall.skip(secs);
    G.events.length = 0;
    // the Knight for the crops: alive, nearest an enemy unit, and before the hall (south of its middle, so nothing hides it)
    const foes = G.units.filter(u => u.team === 1 && !u.dead), near = (u) => Math.min(...foes.map(v => Math.hypot(v.x - u.x, v.y - u.y)));
    const knights = G.units.filter(u => u.type === 'knight' && u.team === 0 && !u.dead).map(u => ({ id: u.id, x: u.x, y: u.y, near: near(u), state: u.state ?? null, dir: u.dir ?? u.face ?? null }));
    const pick = knights.filter(k => k.y > hall.y + T).sort((a, b) => a.near - b.near)[0] || knights.sort((a, b) => a.near - b.near)[0];
    return { hall: { x: hall.x, y: hall.y, hp: hall.hp }, knights, pick, alive: [of(0).length, of(1).length], counts: G.units.reduce((m, u) => (m[u.type] = (m[u.type] || 0) + 1, m), {}), hd: [endfall.hd(2), endfall.hd(0)], startZoom: endfall.startZoom };
  }, +SECS);
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 15000);
  await page.clock.runFor(100);
  await page.mouse.move(+W - 5, 5); // (the pointer off the map)
  const box = await page.locator('#game').boundingBox(); log.canvasBox = box;
  const { hall, pick, startZoom } = log.setup, views = {};
  // at the start zoom one view holds the hall and the fight before it; zoomed all the way in, the hall and the Knight each get one
  if (ZOOMS.includes('start')) views.fight = { zoom: startZoom, x: hall.x, y: hall.y + 40 };
  if (ZOOMS.includes('max')) { views['max-datacenter'] = { zoom: 2.5, x: hall.x + 8, y: hall.y - 6 }; views['max-knight'] = { zoom: 2.5, x: pick.x, y: pick.y - 10 }; }
  for (const [view, at] of Object.entries(views)) {
    await page.evaluate(([x, y, z]) => { endfall.cam.zoom = z; endfall.centerOn(x, y); }, [at.x, at.y, at.zoom]);
    const files = [];
    for (const [level, label] of [[0, 'today'], [2, 'detail'], [0, 'check']]) {
      const got = await page.evaluate((l) => { const r = endfall.hd(l); return { ...r, cam: { ...endfall.cam }, tick: endfall.G.tick ?? endfall.G.time }; }, level);
      const file = join(out, `${view}-${label}.png`);
      await page.screenshot({ path: file, timeout: 300000 }); // (a level's pages are uploaded, mipmaps and all, the first time they are drawn: slow on software GL)
      files.push({ file, ...got });
    }
    const A = decodeAny(readFileSync(files[0].file)), B = decodeAny(readFileSync(files[2].file)), d = +DPR, m = 48 * d; let moved = 0;
    for (let y = Math.round(box.y * d + m); y < (box.y + box.height) * d - m; y++) for (let x = Math.round(box.x * d + m); x < (box.x + box.width) * d - m; x++) { const i = (y * A.w + x) * 4; if (A.data[i] !== B.data[i] || A.data[i + 1] !== B.data[i + 1] || A.data[i + 2] !== B.data[i + 2]) moved++; }
    log.views[view] = { at, zoom: at.zoom, cam: files[0].cam, tick: files.map(f => f.tick), frames: files.map(f => f.frames), heldStill: moved === 0, moved };
    console.log(`${name} ${view}: zoom ${at.zoom}, frames ${files.map(f => f.frames).join(' ')}, held still: ${moved === 0}`);
  }
  log.status = await page.evaluate(() => ({ dpr: devicePixelRatio, canvas: [document.getElementById('game').width, document.getElementById('game').height], view: { ...endfall.view } }));
  await ctx.close();
} finally { await stop(); }
writeFileSync(join(out, 'shots.json'), JSON.stringify(log, null, 1));
console.log(JSON.stringify({ setup: log.setup, status: log.status, errors: log.errors }));
