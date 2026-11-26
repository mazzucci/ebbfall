// The docs' screenshots and gameplay clip, staged in the real game (the built dist/: run `npm run build` first) in
// headless Chromium (tools/chromium.mjs), like tools/og.mjs: a fixed map and seed, the AI off, units set out through the
// debug handle, the fog layer hidden, at the start zoom, 2x. Written as WebP at desktop and phone size into
// public/docs/img/shots/, and tools/docs/shots.json with each shot's size, words and the boxes the annotated ones mark
// (the top bar, the minimap, the command card, ...: tools/docs/pages.mjs puts the numbered notes beside them) and what
// the notes must not cover (`avoid`: the top bar, the sprites on the map). The clip
// (public/docs/media/trailer.mp4, with its poster, its middle frame) is a dozen seconds of the Expedition's Drones
// against a Kingdom Watchtower by its Castle, Archers and a Ballista coming to its help, stepped frame by frame in the
// game and encoded by ffmpeg (tools/trailer/record.mjs: FFMPEG, .tools/ffmpeg/ffmpeg or the PATH's); the docs home's
// alone (the game's trailer is the menu's, public/docs/media/ebbfall-trailer.mp4: not made here, and nothing here
// writes or removes it). Output is committed; run after the art or the HUD changes:
//   node tools/docs/shots.mjs [name ...]      (default: every shot and the clip; names: sieges, heroes, controls (or
//   one of its two shots: hud, phone), clip)
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../chromium.mjs';
import { freeze } from '../trailer/stage.mjs';
import { capture, FFMPEG } from '../trailer/record.mjs';
import { DEFAULT_MAP } from '../../src/client/maps.js';

const root = new URL('../../', import.meta.url);
const dist = fileURLToPath(new URL('dist/', root));
const OUT = new URL('public/docs/img/shots/', root), MEDIA = new URL('public/docs/media/', root);
const MANIFEST = new URL('tools/docs/shots.json', root);
const only = process.argv.slice(2);
if (!existsSync(join(dist, 'index.html'))) throw new Error('shots: dist/ is missing: run npm run build first');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.webp': 'image/webp' };
const server = createServer((req, res) => {
  let p = normalize(join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!p.startsWith(dist)) { res.writeHead(403); return res.end(); }
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}/`;

const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 };
const PHONE_LAND = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
/** What never shows in a docs shot: the toasts and tips; in a hero shot, the stage's buttons too. */
const QUIET = '#msg,#hint,#tut,#cmdInfo,.toast,#netWait{display:none!important}';
/** (`#top` too: the top bar lies over the map since it went edge to edge) */
const BARE = `${QUIET} #tools,#btnBox,#btnHome,#btnArmy,#hud,#top{display:none!important}`;
/** The camera's zoom on a desktop: closer than the game's start (all the way out), so the units read in a 1000 px column;
 *  a phone's shots keep its start. */
const ZOOM = 1.5;
/** The heroes' zoom: the base fills the width, a Knight or a Rover reads on a phone. */
const HERO_ZOOM = 1.6;
const SEED = 4242;
/** The stills' game: the menu's default map with our base at its first start (`?seed=` keeps which base is ours: without
 *  it each run drew a side, and a still framed for one base came out round the other, its army at the frame's edge). */
const STARTS = `?map=${DEFAULT_MAP}&seed=${SEED}`;

// ---- in the page: the scenes (plain functions, serialized; they read only `endfall`) ----
/** The scene's helpers on window.S: the player's seat and headquarters, the way to the map's middle, spawning and placing. */
function helpers() {
  const e = window.endfall, G = e.G, me = G.me, eng = e.engine;
  const hq = G.bldgs.find(b => b.team === me && eng.BUILDINGS[b.type].hq);
  const mid = { x: eng.MW * 16, y: eng.MH * 16 }, len = Math.hypot(mid.x - hq.x, mid.y - hq.y);
  const dir = { x: (mid.x - hq.x) / len, y: (mid.y - hq.y) / len }, side = { x: -dir.y, y: dir.x };
  /** A point `f` px toward the middle and `s` px across, from the headquarters. */
  const at = (f, s = 0) => ({ x: hq.x + dir.x * f + side.x * s, y: hq.y + dir.y * f + side.y * s });
  const spawn = (team, kind, p) => eng.debugSpawn(team, kind, p.x, p.y);
  const workers = () => G.units.filter(u => u.team === me && eng.UNITS[u.type].worker);
  /** Place a building of `type` on the first free spot from `near` outward, built by a worker of ours. */
  const place = (type, near) => {
    const d = eng.BUILDINGS[type], tx0 = Math.round(near.x / 32 - d.w / 2), ty0 = Math.round(near.y / 32 - d.h / 2);
    for (let r = 0; r < 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !eng.canPlace(type, tx0 + dx, ty0 + dy, me)) continue;
      const w = workers().find(u => u.task.t === 'idle') || workers()[0];
      try { eng.placeBuilding(me, type, tx0 + dx, ty0 + dy, w); return true; } catch { /* refused: the next spot */ }
    }
    return false;
  };
  const mine = () => { const m = e.map.nodes.filter(n => n.amount > 0).sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y))[0]; for (const w of workers()) if (w.task.t === 'idle') eng.startGather(w, m); return m; };
  window.S = { e, G, me, eng, hq, dir, side, at, spawn, place, mine, workers };
  eng.disableAi(); e.fog(false);
}

/**
 * The clip's fight (the home's), in two beats. One: the Expedition's Drones come at a Kingdom Watchtower (ours, blue)
 * standing before a Castle on open steppe, from three sides in turn (`strike`: a few already on it, the rest flying in
 * from the left, then from the upper left, then from below), and bring its health down while it shoots back alone; it
 * smokes below half and burns below a quarter (render.js). Two (`defend`, at once): Archers and a Ballista, ordered in
 * from just past the bottom-right corner, cross the foreground to the tower's foot and shoot the Drones down. The sim takes
 * orders for our seat alone, and the Expedition's machines work only inside its coverage, so the Drones must come by
 * themselves: the scene stands inside the Data center's coverage on Sunken Court (`?map=9&seed=1`: the one map with
 * open ground enough for the frame by the Expedition's start, which lies south of it, well out of the frame with its
 * mine and Bots; the Kingdom's own start is far away), a second Castle of ours built there with the tower some twelve
 * tiles from the Data center; a Drone that appears within its sight of the tower takes it on as any idle unit does
 * (an armed tower comes before a Castle or a Villager), flies in and hovers at its range, four tiles out, and one
 * that appears within its range fires from where it is, over the tower. The tower starts hurt (`debugSetHp`) so its
 * fall in health reads and it still stands when the Drones are down. Health bars stay on. Returns the frame's center,
 * the Drones' waves (spawn points, seat and their frame) for `strike`, the defenders' ids and post for `defend`
 * (world px). `towerHp`: the tower's health as they come (`TOWER_HP`).
 */
function towerRaid(towerHp) {
  const { e, G, me, eng, spawn, workers } = window.S, foe = G.factions.findIndex((_, t) => t !== me);
  const T = 32, dc = G.bldgs.find(b => b.team === foe && eng.BUILDINGS[b.type].hq);
  const byId = (id) => G.units.find(u => u.id === id);
  const done = (b) => { for (let i = 0; i < 150 && !b.done; i++) e.skip(1); return b; };
  /** Place `type` for us at the free spot nearest `near` (center, world px), built by `builder`: the building. */
  const put = (type, near, builder) => {
    const d = eng.BUILDINGS[type], tx0 = Math.round(near.x / T - d.w / 2), ty0 = Math.round(near.y / T - d.h / 2);
    for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !eng.canPlace(type, tx0 + dx, ty0 + dy, me)) continue;
      const err = eng.placeBuilding(me, type, tx0 + dx, ty0 + dy, builder); if (err) continue;
      return G.bldgs.find(b => b.team === me && b.type === type && b.tx === tx0 + dx && b.ty === ty0 + dy);
    }
    throw new Error(`clip: no spot for a ${type} near ${Math.round(near.x / T)}, ${Math.round(near.y / T)}`);
  };
  e.setResources(me, 20000, 0);
  eng.revealAll(true); // (the other seat drawn wherever it is: the Drones from their first frame at the edge)
  // The tower needs a Barracks: one at home first.
  done(put('barracks', window.S.at(-140, 170), workers()[0]));
  // The tower's spot east of the Data center and a little north, the Castle's five tiles to its right: a Villager of
  // ours between them sees the ground first, builds both, and walks home, far out of the frame, before anyone comes.
  const want = { x: dc.x + 12 * T, y: dc.y - 5 * T };
  const mason = spawn(me, 'harvester', { x: want.x + 2.5 * T, y: want.y + 1.5 * T }); e.skip(0.3);
  const castle = done(put('core', { x: want.x + 5 * T, y: want.y + 0.3 * T }, byId(mason)));
  const tower = done(put('turret', want, byId(mason)));
  eng.moveTo(byId(mason), window.S.hq.x, window.S.hq.y); e.skip(5);
  eng.debugSetHp(tower, towerHp);
  const f = { x: tower.x + 2.5 * T, y: tower.y - 0.5 * T };
  // The defenders wait just past the frame's bottom-right corner (a short walk: they fire by about four seconds);
  // their post is at the tower's foot, toward the Castle.
  const gate = { x: f.x + 9.6 * T, y: f.y + 4.9 * T }, post = { x: tower.x + 2.6 * T, y: tower.y + 2.2 * T };
  const guard = [spawn(me, 'bastion', { x: gate.x - 0.4 * T, y: gate.y - 0.3 * T })];
  for (let i = 0; i < 4; i++) guard.push(spawn(me, 'lancer', { x: gate.x + (0.9 + Math.floor(i / 2) * 0.9) * T, y: gate.y + ((i % 2) - 0.5) * 0.9 * T }));
  // The Drones, in waves (tiles from the tower's center): on the first frame three over the tower, in its range, and
  // three past the frame's left edge; then two from its top-left corner; then one past its bottom edge: every one that
  // flies in within sight of the tower's edge (under six tiles), all inside the coverage.
  const at = (ps) => ps.map(([dx, dy]) => ({ x: tower.x + dx * T, y: tower.y + dy * T }));
  const waves = [
    { frame: 0, points: at([[-1.6, -1.0], [1.7, -1.9], [0.5, 1.9], [-6.9, -0.6], [-6.6, 0.7], [-6.7, 1.8]]) },
    { frame: 12, points: at([[-5.8, -4.2], [-4.6, -5.1]]) },
    { frame: 24, points: at([[2.5, 6.4]]) },
  ];
  return { f, post, guard, waves, foe };
}
/** Beat one: a wave of Drones appears and, idle, takes on the tower in its sight (or fires from where it is, in range). */
function strike([{ waves, foe }, wave]) {
  for (const p of waves[wave].points) window.S.spawn(foe, 'shrike', p);
}
/** Beat two: the defenders walk in to their post (a move: they turn on the Drones only once there), the Ballista on
 *  the Castle's side, the Archers two by two toward the tower. */
function defend({ post, guard }) {
  const { G, eng } = window.S, T = 32;
  guard.forEach((id, i) => {
    const u = G.units.find(u => u.id === id); if (!u) return;
    if (!i) eng.moveTo(u, post.x + 0.9 * T, post.y - 0.3 * T);
    else eng.moveTo(u, post.x - (0.4 + Math.floor((i - 1) / 2) * 0.9) * T, post.y + ((i % 2) - 0.5) * 0.9 * T);
  });
}
/** How near (px) the Ballista's first bolt is to landing, with a Drone still under it: the slow-motion beat's cue. */
function boltNear() {
  const { G } = window.S, p = G.projs.find(p => p.by === 'bastion');
  if (!p || !G.units.some(u => u.type === 'shrike' && Math.hypot(u.x - p.ax, u.y - p.ay) < 16)) return Infinity;
  return Math.hypot(p.ax - p.x, p.ay - p.y);
}

/** The Kingdom (ours) storms the Expedition's Data center: knights and guards at its walls, cannons and archers behind. */
function siege() {
  const { G, me, eng, spawn } = window.S, foe = G.factions.findIndex((_, t) => t !== me);
  const hq = G.bldgs.find(b => b.team === foe && eng.BUILDINGS[b.type].hq);
  const mid = { x: eng.MW * 16, y: eng.MH * 16 }, len = Math.hypot(mid.x - hq.x, mid.y - hq.y);
  const d = { x: (mid.x - hq.x) / len, y: (mid.y - hq.y) / len }, s = { x: -d.y, y: d.x };
  const at = (f, w) => ({ x: hq.x + d.x * f + s.x * w, y: hq.y + d.y * f + s.y * w });
  ['knight', 'knight', 'knight', 'trooper', 'trooper', 'trooper', 'trooper'].forEach((k, i) => spawn(me, k, at(120 + (i % 2) * 30, (i - 3) * 34)));
  ['lancer', 'lancer', 'lancer', 'bastion'].forEach((k, i) => spawn(me, k, at(250, (i - 1.5) * 40)));
  spawn(me, 'siegeTank', at(360, -70)); spawn(me, 'siegeTank', at(370, 60));
  ['prism', 'prism', 'bruiser'].forEach((k, i) => spawn(foe, k, at(60, (i - 1) * 50)));
  for (const u of G.units) if (u.team === me && !eng.UNITS[u.type].worker && u.type !== 'siegeTank') eng.attackEnt(u, hq);
  window.endfall.skip(4);
  return at(170, 0);
}

/** A base at about 3:00: workers mining, a few buildings up, a guard at the gate. Laid out toward the map's middle
 *  (`at`) for the controls shots; for a hero (`hero`, the PM's brief for the docs refresh), in a band level with the
 *  headquarters and its mine (`band`), so that a 2:1 frame holds it all close (Dust Quarter's starts sit in corners
 *  with the mine against the map's edge beyond the headquarters): the Kingdom's Castle with a Barracks, Stables and a
 *  Watchtower, Villagers to and from the mine, and its army (Guards, Archers, two Knights, a Cannon) marching out
 *  toward the middle; the Expedition's Data center with an Uplink, the Portal, Wind turbines and a Sentry mast, Bots
 *  hauling, and Rovers, Androids, a Buggy and Drones in front. Returns the scene's box (`sceneBox`, world px). */
function base([race, hero]) {
  const { S } = window, { at, place, mine, spawn, me, e, eng, hq } = S;
  // (`band`: dx px toward the map's middle across, dy px toward it up or down: the mine is on the far side)
  const hx = Math.sign(eng.MW * 16 - hq.x) || 1, hy = Math.sign(eng.MH * 16 - hq.y) || 1;
  const band = (dx, dy) => ({ x: hq.x + hx * dx, y: hq.y + hy * dy });
  S.mine();
  e.setResources(me, 5000, 0);
  if (hero) return window.heroBase(race, band);
  for (let i = 0; i < 4; i++) spawn(me, race === 'humans' ? 'harvester' : 'lumen', at(-60, (i - 1.5) * 30));
  if (race === 'humans') {
    place('depot', at(-150, -160)); place('depot', at(-150, 150)); place('barracks', at(170, -170));
    e.skip(70); place('forge', at(-60, 240)); e.skip(70); mine();
  } else {
    place('siphon', at(170, -170)); place('substation', at(-150, 160)); place('ward', at(220, 120));
    e.skip(60); for (const s of [[-200, -60], [-230, 40], [-180, 140]]) place('spire', at(...s)); place('loom', at(-120, -220));
    e.skip(70); place('uplink', at(240, 260)); e.skip(80); mine();
  }
  const units = race === 'humans' ? ['trooper', 'trooper', 'trooper', 'trooper', 'lancer', 'lancer', 'lancer', 'knight', 'knight'] : ['scythe', 'scythe', 'prism', 'prism', 'prism', 'bruiser'];
  units.forEach((k, i) => spawn(me, k, at(260 + (i % 3) * 34, (Math.floor(i / 3) - 1) * 40)));
  spawn(me, race === 'humans' ? 'observer' : 'shrike', at(40, -70)); if (race !== 'humans') spawn(me, 'shrike', at(70, 40));
  const t = 180 - e.G.time; if (t > 0) e.skip(t);
  e.setResources(me, 470, 0);
  S.mine();
  return window.sceneBox(S);
}
/** A hero's base (`base`): its buildings round the headquarters in the band, its workers at the mine, its army. */
function heroBase(race, band) {
  const { S } = window, { place, mine, spawn, me, e, eng, G } = S;
  const kg = race === 'humans';
  for (let i = 0; i < 4; i++) spawn(me, kg ? 'harvester' : 'lumen', band(60, -40 + i * 20));
  if (kg) {
    place('depot', band(-170, -170)); place('barracks', band(230, 30)); e.skip(70);
    place('forge', band(210, -170)); e.skip(70); place('airfield', band(-200, 60)); place('turret', band(130, 140)); e.skip(80);
  } else {
    place('siphon', band(240, 40)); place('substation', band(170, -170)); e.skip(60);
    for (const dy of [-80, 10]) place('spire', band(-195, dy)); place('loom', band(-180, 130)); place('ward', band(130, 150)); e.skip(70);
    place('uplink', band(330, -110)); e.skip(80); place('eclipse', band(360, 90)); e.skip(80);
  }
  for (let i = 0; i < 60 && G.bldgs.some(b => b.team === me && !b.done); i++) e.skip(5); // (every building up)
  mine(); e.setResources(me, 5000, 0);
  for (let i = 0; i < 3; i++) spawn(me, kg ? 'harvester' : 'lumen', band(20 + i * 30, 60)); // (more at the mine: some come, some go)
  const t = 180 - G.time; if (t > 0) e.skip(t);
  mine(); e.skip(6); // (the new ones on their first trips)
  // The army: in a block at the gate, then ordered out toward the map's middle and caught on the way.
  const army = kg ? ['trooper', 'trooper', 'trooper', 'lancer', 'lancer', 'lancer', 'knight', 'knight', 'siegeTank'] : ['monolith', 'monolith', 'umbra', 'umbra', 'scythe', 'shrike', 'shrike', 'shrike'];
  // A column on the worn track that leaves the base for the middle (Dust Quarter, seed 4242: `PHONE_TRACK`'s), the
  // first a little way out, each marching for its own point further along it, so the column keeps its spacing; the
  // flyers (`air`) beside it, apart.
  const ground = army.filter(k => !eng.UNITS[k].air), air = army.filter(k => eng.UNITS[k].air);
  // (the track runs south from the headquarters' gate: world px from its middle, the head of the column furthest out)
  const H0 = S.hq, line = (d) => ({ x: H0.x - 28 - d * 0.08, y: H0.y + 70 + d });
  const gap = kg ? 30 : 50; // (the machines are wider)
  ground.forEach((k, i) => { const p = line((kg ? 200 : 150) - i * gap), id = spawn(me, k, p), q = line(520 - i * gap); eng.moveTo(G.units.find(u => u.id === id), q.x, q.y); });
  air.forEach((k, i) => { const p = { x: H0.x + 90 + (i % 2) * 50, y: H0.y + 60 + i * 50 }, id = spawn(me, k, p); eng.moveTo(G.units.find(u => u.id === id), p.x - 40, p.y + 300); });
  e.skip(kg ? 0.8 : 0.2); // (the machines run fast inside coverage: caught at once)
  window.S.heroAt = { x: H0.x - 40, y: H0.y + 95 }; // (the frame's middle: the base above, the column below)
  e.setResources(me, 470, 0);
  return window.sceneBox(S);
}
/** In the page: the drawn extent (world px, roughly: footprints and heights, as `measure` reckons them) of our
 *  buildings, the mine nearest our headquarters, our soldiers, and `extra` boxes: { x0, y0, x1, y1 }. */
function sceneBox(S, extra = []) {
  const { G, me, eng, e } = S, m = e.map.nodes.filter(n => n.amount > 0).sort((a, b) => Math.hypot(a.x - S.hq.x, a.y - S.hq.y) - Math.hypot(b.x - S.hq.x, b.y - S.hq.y))[0];
  const bs = [...extra];
  for (const b of G.bldgs) if (b.team === me) { const w = b.w * 32, h = b.h * 32; bs.push([b.x - w * 0.55, b.y - h * 1.15, b.x + w * 0.55, b.y + h * 0.55]); }
  if (m) { const w = m.w * 32; bs.push([m.x - w * 0.6, m.y - w * 0.8, m.x + w * 0.6, m.y + w * 0.6]); }
  for (const u of G.units) if (u.team === me && !eng.UNITS[u.type].worker) { const h = e.unitTop(u.type) + 6; bs.push([u.x - 16, u.y - h, u.x + 16, u.y + 8]); }
  return { x0: Math.min(...bs.map(b => b[0])), y0: Math.min(...bs.map(b => b[1])), x1: Math.max(...bs.map(b => b[2])), y1: Math.max(...bs.map(b => b[3])) };
}

// ---- the shots ----
const browser = await launchChromium();
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
mkdirSync(OUT, { recursive: true }); mkdirSync(MEDIA, { recursive: true });

/** A game page at its start, `race` playing seat 0 against the other people (the menu's board, as remembered); `query`:
 *  the page's URL query (`?map=0&seed=N` keeps the map and the starts fixed, src/client/menu.js). */
async function game(device, race, css, query = '') {
  const ctx = await browser.newContext(device);
  await ctx.addInitScript(([race]) => {
    localStorage.setItem('endfall.seats', JSON.stringify([{ race, team: 0 }, { race: race === 'humans' ? 'vael' : 'humans', team: 1, diff: 1 }]));
  }, [race]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(origin + query, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.endfall, null, { timeout: 90000 });
  await page.locator('#btnSolo').click(); await page.locator('#btnStart').click();
  await page.waitForFunction(() => window.endfall && endfall.G.units.length > 0, null, { timeout: 60000 });
  await page.addStyleTag({ content: css });
  await page.evaluate(helpers);
  await page.addScriptTag({ content: `window.sceneBox = ${sceneBox}; window.heroBase = ${heroBase};` }); // (the scenes' shared helpers)
  return { ctx, page };
}
/** The camera on `p` at the shots' zoom, kept inside the map (no ground past its edge in the frame). Returns where `p`
 *  stands in the canvas (CSS px): off its middle where the map's edge held the camera back. */
const look = (page, p, zoom = ZOOM) => page.evaluate(([{ x, y }, z]) => {
  const e = window.endfall, c = e.cam, W = e.engine.MW * 32, H = e.engine.MH * 32;
  c.zoom = matchMedia('(pointer: coarse)').matches ? e.startZoom : z; e.centerOn(x, y);
  const vw = e.view.w / c.zoom, vh = e.view.h / c.zoom;
  c.x = Math.min(Math.max(0, c.x), Math.max(0, W - vw)); c.y = Math.min(Math.max(0, c.y), Math.max(0, H - vh));
  return { x: (x - c.x) * c.zoom, y: (y - c.y) * c.zoom };
}, [p, zoom]);
const settle = (page) => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 400)))));

/** Encode a PNG screenshot as WebP crops in a blank page: `crops` [{ name, x, y, w, h (of the PNG), W (output width) }]. */
async function encode(png, crops) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(async ({ b64, crops }) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      return crops.map(c => {
        const W = Math.min(c.W, c.w), H = Math.round(c.h * W / c.w), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, c.x, c.y, c.w, c.h, 0, 0, W, H);
        return { name: c.name, w: W, h: H, data: cv.toDataURL('image/webp', 0.82).split(',')[1] };
      });
    }, { b64: png.toString('base64'), crops });
  } finally { await page.close(); }
}

/**
 * A hero (the stage, no HUD): a 2:1 crop of the stage for the desktop (2000 wide) and a 16:9 one for a phone (720 wide),
 * each round `at` (where `look` put the scene's point: the stage's middle, unless the map's edge held the camera back;
 * the stage is the whole window since the map went edge to edge, so the 2:1 band leaves out more of it than the box did).
 * `fit` (CSS px, optional): the size the scene takes on screen; the phone's crop grows to hold it (up to the stage).
 */
async function hero(name, page, words, at, fit = null) {
  const box = await page.locator('#stage').boundingBox(), dpr = 2;
  const png = await page.screenshot({ clip: box, animations: 'disabled', timeout: 240000 });
  const W = Math.round(box.width * dpr), H = Math.round(box.height * dpr);
  const dh = Math.min(H, Math.round(W / 2));
  let pw = Math.min(W, Math.round(H * 16 / 9 * 0.62));
  if (fit) pw = Math.min(W, Math.round(H * 16 / 9), Math.max(pw, Math.round((fit.w + 32) * dpr), Math.round((fit.h + 32) * dpr * 16 / 9)));
  const ph = Math.round(pw * 9 / 16);
  const round = (c, size, all) => Math.round(Math.min(Math.max(0, c * dpr - size / 2), all - size)); // (a crop's start, centered on c, inside the shot)
  const out = await encode(png, [
    { name: 'desktop', x: 0, y: round(at.y, dh, H), w: W, h: dh, W: 2000 },
    { name: 'phone', x: round(at.x, pw, W), y: round(at.y, ph, H), w: pw, h: ph, W: 720 },
  ]);
  save(name, out, words, {});
}

/** An annotated shot (the whole page, HUD and all): the boxes of `marks` ({ key: selectors }) in shares of the page. */
async function annotated(name, page, words, marks, W) {
  const { boxes, avoid: avoidF } = await measure(page, marks), vp = page.viewportSize();
  const png = await page.screenshot({ animations: 'disabled', timeout: 240000 });
  const out = await encode(png, [{ name: 'desktop', x: 0, y: 0, w: vp.width * 2, h: vp.height * 2, W }, { name: 'phone', x: 0, y: 0, w: vp.width * 2, h: vp.height * 2, W: 720 }]);
  save(name, out, words, boxes, avoidF);
}
/** Whether every note of an annotated shot finds a free spot as the page stands (tools/docs/pages.mjs `placeNotes`, as
 *  the docs place them): the boxes of `marks` and what the notes must not cover, measured now. */
async function notesFit(page, marks) {
  const { placeNotes } = await import('./pages.mjs'), vp = page.viewportSize(), m = await measure(page, marks);
  try { placeNotes({ w: vp.width, h: vp.height, ...m }, Object.keys(m.boxes)); return true; } catch { return false; }
}
/** The boxes of `marks` ({ key: selectors }) and what the notes must not cover, in shares of the page. */
async function measure(page, marks) {
  const vp = page.viewportSize();
  const boxes = {};
  for (const [k, sels] of Object.entries(marks)) {
    const bs = (await Promise.all(sels.map(s => page.locator(s).first().boundingBox()))).filter(Boolean);
    if (!bs.length) throw new Error(`shots: ${name}: nothing shown for ${k} (${sels})`);
    const x0 = Math.min(...bs.map(b => b.x)), y0 = Math.min(...bs.map(b => b.y)), x1 = Math.max(...bs.map(b => b.x + b.width)), y1 = Math.max(...bs.map(b => b.y + b.height));
    boxes[k] = [x0 / vp.width, y0 / vp.height, (x1 - x0) / vp.width, (y1 - y0) / vp.height].map(v => +v.toFixed(4));
  }
  // What the notes must not cover besides their targets: the top bar, and every sprite on the map in view (buildings,
  // units, gold mines: their drawn extent, roughly, from their footprint and height on screen).
  const avoid = await page.evaluate(() => {
    const e = window.endfall, { G, cam } = e, z = cam.zoom, cv = document.getElementById('game').getBoundingClientRect();
    const sx = (x) => cv.left + (x - cam.x) * z, sy = (y) => cv.top + (y - cam.y) * z, out = [];
    const top = document.getElementById('top').getBoundingClientRect(); out.push([top.left, top.top, top.width, top.height]);
    for (const b of G.bldgs) { const w = b.w * 32 * z, h = b.h * 32 * z; out.push([sx(b.x) - w * 0.6, sy(b.y) - h * 1.3, w * 1.2, h * 1.9]); }
    for (const n of e.map.nodes) { const w = n.w * 32 * z; out.push([sx(n.x) - w * 0.6, sy(n.y) - w * 0.9, w * 1.2, w * 1.5]); }
    for (const u of G.units) { const h = (e.unitTop(u.type) + 6) * z, w = Math.max(28 * z, h * 0.6); out.push([sx(u.x) - w / 2, sy(u.y) - h, w, h + 6 * z]); }
    return out.filter(([x, y, w, h]) => x + w > cv.left && x < cv.right && y + h > cv.top && y < cv.bottom || y < cv.top);
  });
  const shot = [0, 0, vp.width, vp.height];
  const clipTo = ([x, y, w, h]) => { const x0 = Math.max(x, shot[0]), y0 = Math.max(y, shot[1]), x1 = Math.min(x + w, shot[2]), y1 = Math.min(y + h, shot[3]); return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null; };
  return { boxes, avoid: avoid.map(clipTo).filter(Boolean).map(([x, y, w, h]) => [x / vp.width, y / vp.height, w / vp.width, h / vp.height].map(v => +v.toFixed(4))) };
}

function save(name, out, words, boxes, avoid = []) {
  for (const f of readdirSync(OUT)) if (f.startsWith(`${name}-`)) rmSync(new URL(f, OUT));
  const files = {};
  for (const o of out) { files[o.name] = `${name}-${o.w}.webp`; writeFileSync(new URL(files[o.name], OUT), Buffer.from(o.data, 'base64')); }
  const d = out.find(o => o.name === 'desktop'), p = out.find(o => o.name === 'phone');
  manifest[name] = { ...words, w: Math.round(d.w / 2), h: Math.round(d.h / 2), phoneW: Math.round(p.w / 2), phoneH: Math.round(p.h / 2), files, boxes, avoid };
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + '\n');
  console.log(`shots: ${name} (${Object.values(files).join(', ')})`);
}

/** How to win: the enemy's headquarters under attack. */
async function sieges() {
  const { ctx, page } = await game(DESKTOP, 'humans', BARE, STARTS);
  try {
    const p = await page.evaluate(siege);
    const at = await look(page, p); await settle(page);
    await hero('shot-battle', page, { alt: 'Ebbfall gameplay: the blue Kingdom\'s knights and guards storm the Expedition\'s Data center while cannons and archers fire from behind', caption: 'Knights and Guards at the Data center\'s walls, Cannons firing from behind: bring down the base.' }, at);
  } finally { await ctx.close(); }
}

/** The heroes' frame on a scene's box (world px, `sceneBox`): the zoom that holds it all in the 2:1 band with a margin
 *  (the shots' zoom at most), the camera on its middle. Returns where the middle stands and the box's size on screen. */
async function frameBox(page, b) {
  const vp = page.viewportSize(), M = 28, bw = b.x1 - b.x0, bh = b.y1 - b.y0;
  const z = Math.min(ZOOM, (vp.width - 2 * M) / bw, (Math.min(vp.height, vp.width / 2) - 2 * M) / bh);
  const at = await look(page, { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }, z);
  console.log(`  frame: ${Math.round(bw)} x ${Math.round(bh)} world px at zoom ${z.toFixed(2)}`);
  return { at, fit: { w: bw * z, h: bh * z } };
}

async function heroes() {
  for (const race of ['humans', 'vael']) {
    const { ctx, page } = await game(DESKTOP, race, BARE, STARTS);
    try {
      const b = await page.evaluate(base, [race, true]);
      // (zoom 1.6, framed on the base: it fills the width, a Knight or a Rover reads on a phone)
      const at = await look(page, await page.evaluate(() => window.S.heroAt), HERO_ZOOM), fit = null; await settle(page);
      await hero(race === 'humans' ? 'hero-kingdom' : 'hero-expedition', page, race === 'humans'
        ? { alt: 'Ebbfall gameplay: a blue Kingdom base, the Castle by its gold mine with a Barracks, Stables and a Watchtower, Villagers mining, an army of guards, archers, knights and a cannon marching out', caption: 'A Kingdom base at 3:00: Villagers at the mine, the army marching out.' }
        : { alt: 'Ebbfall gameplay: a blue Expedition base, the Data center by its mine with an Uplink dish, the Portal, wind turbines and a sentry mast, bots hauling ore, rovers, androids, a buggy and drones heading out', caption: 'An Expedition base at 3:00: Bots hauling ore, Rovers, Androids and Drones heading out.' }, at, fit);
    } finally { await ctx.close(); }
  }
}

/** The two annotated controls shots: a Kingdom base with a group selected on a desktop (`hud`), and its army out on a
 *  worn track on a phone held sideways (`phone`). */
async function controls() { await hud(); await phone(); }
async function hud() {
  const { ctx, page } = await game(DESKTOP, 'humans', QUIET, STARTS);
  try {
    await page.evaluate(base, ['humans', false]);
    await look(page, await page.evaluate(() => window.S.at(180, 0))); await settle(page);
    // The group: a box dragged round the soldiers at the gate (the UI's own selection), saved as group 1.
    const r = await page.evaluate(() => {
      const { G, me, eng, e } = window.S, cv = document.getElementById('game').getBoundingClientRect();
      const us = G.units.filter(u => u.team === me && !eng.UNITS[u.type].worker && !eng.UNITS[u.type].air);
      const sx = (x) => cv.left + (x - e.cam.x) * e.cam.zoom, sy = (y) => cv.top + (y - e.cam.y) * e.cam.zoom;
      return { x0: Math.min(...us.map(u => sx(u.x))) - 14, y0: Math.min(...us.map(u => sy(u.y))) - 24, x1: Math.max(...us.map(u => sx(u.x))) + 14, y1: Math.max(...us.map(u => sy(u.y))) + 10 };
    });
    await page.mouse.move(r.x0, r.y0); await page.mouse.down(); await page.mouse.move(r.x1, r.y1, { steps: 8 }); await page.mouse.up();
    await page.keyboard.press('Control+1');
    // (the pointer parked on the minimap: off the map's sprites, and off the window's edge, which pans the map now
    // that the canvas reaches it; 790 px down did, the army pushed up under the top bar)
    const mm = await page.locator('#minimap').boundingBox();
    await page.mouse.move(mm.x + mm.width / 2, mm.y + mm.height / 2); await settle(page);
    const marks = { res: ['#resShard', '#resSup'], bar: ['#resClock', '#btnHelp', '#btnFull', '#btnSound', '#btnPause'], minimap: ['#minimap'], army: ['#btnBox', '#btnHome', '#btnArmy'], info: ['#info'], cmd: ['#cmd'], groups: ['#groups'] };
    // The frame: the first, from the gate toward the Castle, where every note finds a free spot (a building under a
    // corner's buttons leaves its note none: the base by the map's edge, the camera held back there)
    for (const f of [180, 150, 120, 90]) {
      await look(page, await page.evaluate((f) => window.S.at(f, 0), f)); await settle(page);
      if (await notesFit(page, marks)) break;
      if (f === 90) throw new Error('shots: shot-desktop-hud: no frame leaves every note a free spot');
    }
    await annotated('shot-desktop-hud', page, { alt: 'Ebbfall on a desktop: the top bar, the map with a group of soldiers selected, the minimap, the selection panel and the command card', caption: 'A Kingdom base at 3:00, a group of Guards, Archers and Knights selected.' }, marks, 2000);
  } finally { await ctx.close(); }
}

/** Where the phone's army stands (`at`: px toward the map's middle, px across): on the worn track that leaves the
 *  base for the middle (Dust Quarter, seed 4242), past the Barracks, in open ground; `PHONE_VIEW`: the frame's middle
 *  from the army (world px right, down): the army a little right of the middle and above the panels at the bottom, the
 *  Barracks above the frame and the gold mine down the track below it (`cutSprites` checks). */
const PHONE_TRACK = [567, -98], PHONE_VIEW = [-40, 25];
/** In the page: the army (every fighter of ours, the Balloon too) marches out to `at(f, s)` in the game's formation
 *  (an order, as a tap on the ground gives) and stands; returns the spot. */
function march([f, s]) {
  const { G, me, eng, e, at } = window.S, spot = at(f, s);
  const army = () => G.units.filter(u => u.team === me && !eng.UNITS[u.type].worker);
  eng.formation(army(), spot.x, spot.y);
  for (let t = 0; t < 40 && army().some(u => u.task.t !== 'idle'); t++) e.skip(1);
  e.skip(1);
  return spot;
}
/** In the page: the buildings and gold mines in view that are cut by the screen's edge or lie under a panel of the HUD
 *  (their drawn extent, roughly, as `measure` reckons it): a building shows whole and clear, or not at all. */
function cutSprites() {
  const e = window.endfall, { G, cam } = e, z = cam.zoom, cv = document.getElementById('game').getBoundingClientRect();
  const sx = (x) => cv.left + (x - cam.x) * z, sy = (y) => cv.top + (y - cam.y) * z;
  const panels = ['#top', '#minimap', '#info', '#cmd', '#btnBox', '#btnHome', '#btnArmy', '#tools']
    .map(s => document.querySelector(s)).filter(el => el && el.checkVisibility()).map(el => el.getBoundingClientRect()).filter(r => r.width && r.height);
  const out = [];
  const check = (what, x, y, w, h) => {
    if (x + w <= cv.left || y + h <= cv.top || x >= cv.right || y >= cv.bottom) return; // (out of the frame: the map's canvas)
    const cut = x < cv.left || y < cv.top || x + w > cv.right || y + h > cv.bottom;
    const under = panels.some(r => x < r.right && x + w > r.left && y < r.bottom && y + h > r.top);
    if (cut || under) out.push(`${what} ${cut ? 'cut by the screen' : 'under a panel'}`);
  };
  for (const b of G.bldgs) { const w = b.w * 32 * z, h = b.h * 32 * z; check(b.type, sx(b.x) - w * 0.6, sy(b.y) - h * 1.3, w * 1.2, h * 1.9); }
  for (const n of e.map.nodes) { const w = n.w * 32 * z; check('a gold mine', sx(n.x) - w * 0.6, sy(n.y) - w * 0.9, w * 1.2, w * 1.5); }
  return out;
}

/** The landscape phone's shot: the army out of the base on a worn track, selected with ARMY; no building in the frame
 *  unless whole and clear of the panels. */
async function phone() {
  const { ctx, page } = await game(PHONE_LAND, 'humans', QUIET, STARTS);
  try {
    await page.evaluate(base, ['humans', false]);
    const spot = await page.evaluate(march, PHONE_TRACK);
    await look(page, { x: spot.x + PHONE_VIEW[0], y: spot.y + PHONE_VIEW[1] }); await settle(page);
    await page.locator('#btnArmy').tap();
    // (the pointer parked on the minimap: no button left lit as under the mouse, ARMY's after the tap or the command
    // card's under where START GAME was)
    const mm = await page.locator('#minimap').boundingBox();
    await page.mouse.move(mm.x + mm.width / 2, mm.y + mm.height / 2); await settle(page);
    const cut = await page.evaluate(cutSprites);
    if (cut.length) throw new Error(`shots: shot-phone-land: ${cut.join(', ')}`);
    await annotated('shot-phone-land', page, { alt: 'Ebbfall on a phone held sideways: SELECT, HOME and ARMY at the left, the minimap and the command card', caption: 'The same game on a phone held sideways: the army out on a track, selected.' }, {
      select: ['#btnBox'], homearmy: ['#btnHome', '#btnArmy'], minimap: ['#minimap'], cmd: ['#cmd'],
    }, 1688);
  } finally { await ctx.close(); }
}

/**
 * The clip: Drones against a Watchtower (`towerRaid`; the Drones' waves by `strike` at their frames, `defend` at
 * `DEFEND_AT` seconds), the stage alone (no HUD), `CLIP_S` seconds at `FPS`, muted, looped by the page. The game's
 * frames are stepped by hand (tools/trailer/stage.mjs `freeze`: its requestAnimationFrame and performance.now taken
 * over, each frame exactly one 30 Hz tick of game time later; at another rate the ticks per frame would be uneven,
 * 1, 1, 1, 2 at 24 fps, and everything that moves would hitch) and captured one by one at DPR 2 (software WebGL
 * cannot draw in real time) into target/docs-clip/ as PNG (kept there for a review), then encoded by ffmpeg
 * (tools/trailer/record.mjs `FFMPEG`) into H.264 at the clip's size, at the first quality under the home's budget
 * (`CLIP_KB`, test/docs.test.js). One slow-motion beat (`SLOW`: about a third speed, eased in and out, `boltNear` its
 * cue): the Ballista's first bolt landing on a Drone, the sim and the effects slowed together. It loops without a
 * cut: `LOOP_S` more seconds are recorded, and the end dissolves into those first seconds, which the clip then starts
 * after (the last Drone down fades back into the first ones coming). Its poster is its middle frame (`hero-home`, the
 * home's hero still: desktop at full DPR 2, phone at 720 wide). `CLIP_PREVIEW=1` captures one frame a second at DPR 1
 * and encodes nothing (a look at the staging).
 */
const FPS = 30, CLIP_S = 11, DEFEND_AT = 0, LOOP_S = 0.5, CLIP_W = 1000, CLIP_H = 500, CLIP_ZOOM = 1.7, CLIP_KB = 290;
/** The tower's health as the Drones come (of 380): its fall reads, and it still stands at the end. */
const TOWER_HP = 340;
/** The slow-motion beat's speed frame by frame: eased down to a third over six frames, held, eased back. */
const SLOW = (() => { const lo = 0.37, ease = (k) => k * k * (3 - 2 * k), v = []; for (let i = 1; i <= 6; i++) v.push(1 - (1 - lo) * ease(i / 6)); for (let i = 0; i < 15; i++) v.push(lo); for (let i = 5; i >= 0; i--) v.push(1 - (1 - lo) * ease(i / 6)); return v; })();
const CLIP_WORDS = {
  alt: 'Ebbfall gameplay: the Expedition\'s drones swarm a blue Kingdom watchtower by its castle until archers and a ballista arrive and shoot them down',
  caption: 'Drones strike a Watchtower by the Castle; Archers and a Ballista shoot them down.',
  title: 'Ebbfall gameplay: Drones against a Watchtower',
};
const CLIP_DIR = fileURLToPath(new URL('target/docs-clip/', root));
async function clip() {
  const preview = !!process.env.CLIP_PREVIEW, dpr = preview ? 1 : 2;
  const { ctx, page } = await game({ viewport: { width: CLIP_W, height: CLIP_H }, deviceScaleFactor: dpr }, 'humans', `${BARE} #top,#hud{display:none!important} #app{padding:0!important;gap:0!important} #stage{border:0!important;border-radius:0!important}`, '?map=9&seed=1');
  rmSync(CLIP_DIR, { recursive: true, force: true }); mkdirSync(CLIP_DIR, { recursive: true });
  const n = Math.round(FPS * (CLIP_S + LOOP_S)), loop = Math.round(FPS * LOOP_S), file = (i) => join(CLIP_DIR, `f${String(i).padStart(4, '0')}.png`);
  try {
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    const scene = await page.evaluate(towerRaid, TOWER_HP);
    await look(page, scene.f, CLIP_ZOOM); await settle(page);
    await freeze(page);
    const cdp = await ctx.newCDPSession(page);
    let last = null, slow = null;
    const t1 = Date.now();
    for (let i = 0; i < n; i++) {
      for (const [w, wave] of scene.waves.entries()) if (i === wave.frame) await page.evaluate(strike, [scene, w]);
      if (i === Math.round(FPS * (LOOP_S + DEFEND_AT))) await page.evaluate(defend, scene);
      if (!slow && i > FPS * (LOOP_S + DEFEND_AT + 3) && await page.evaluate(boltNear) < 80) { slow = SLOW.slice(); console.log(`\r  clip: slow motion from frame ${i}                 `); }
      const speed = slow?.length ? slow.shift() : 1;
      await page.evaluate(([ms, ticks]) => window.__frame(ms, ticks), [(1000 / FPS) * speed + 0.0005, speed]);
      if (preview && i % FPS) continue;
      // (the drawn frame presented first: two real frames; a capture identical to the last one is a stale surface
      // (software WebGL under load): taken again)
      let png;
      for (let k = 0; k < 6; k++) {
        await page.evaluate(() => new Promise(r => window.__raf(() => window.__raf(r))));
        png = await capture(cdp, { width: CLIP_W, height: CLIP_H }, dpr);
        if (!last || !png.equals(last)) break;
      }
      last = png; writeFileSync(file(i), png);
      if (i % FPS === FPS - 1) process.stdout.write(`\r  clip: ${i + 1}/${n} frames (${((Date.now() - t1) / (i + 1) / 1000).toFixed(2)} s each)   `);
    }
    console.log(`\r  clip: ${n} frames in ${((Date.now() - t1) / 1000).toFixed(0)} s                `);
  } finally { await ctx.close(); }
  if (preview) return;
  const pw = await encode(readFileSync(file(loop + Math.floor((n - loop) / 2))), [{ name: 'desktop', x: 0, y: 0, w: CLIP_W * 2, h: CLIP_H * 2, W: CLIP_W * 2 }, { name: 'phone', x: 0, y: 0, w: CLIP_W * 2, h: CLIP_H * 2, W: 720 }]);
  save('hero-home', pw, { alt: CLIP_WORDS.alt, caption: CLIP_WORDS.caption }, {});
  // The video: the frames from `loop` on, the last `LOOP_S` seconds dissolving into the first `loop` frames (xfade),
  // scaled to the clip's size; H.264 at the first CRF that fits the budget.
  const out = fileURLToPath(new URL('trailer.mp4', MEDIA));
  const pic = 'scale=' + CLIP_W + ':' + CLIP_H + ':flags=lanczos,format=yuv420p,setsar=1';
  let crf = 26, bytes;
  for (;;) {
    await ffmpeg(['-framerate', String(FPS), '-start_number', String(loop), '-i', join(CLIP_DIR, 'f%04d.png'),
      '-framerate', String(FPS), '-start_number', '0', '-t', String(LOOP_S), '-i', join(CLIP_DIR, 'f%04d.png'),
      '-filter_complex', `[0:v]${pic}[a];[1:v]${pic}[b];[a][b]xfade=transition=fade:duration=${LOOP_S}:offset=${((n - loop) / FPS - LOOP_S).toFixed(4)}`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out]);
    bytes = statSync(out).size;
    if (bytes <= CLIP_KB * 1024 || crf >= 40) break;
    crf += 2;
  }
  for (const f of readdirSync(MEDIA)) if (f.startsWith('trailer.') && f !== 'trailer.mp4') rmSync(new URL(f, MEDIA));
  manifest.trailer = { file: 'trailer.mp4', type: 'video/mp4', poster: 'hero-home', w: CLIP_W, h: CLIP_H, seconds: CLIP_S, uploaded: new Date().toISOString().slice(0, 10), alt: CLIP_WORDS.alt, title: CLIP_WORDS.title };
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + '\n');
  console.log(`shots: clip (trailer.mp4, ${Math.round(bytes / 1024)} KB at CRF ${crf}, ${CLIP_S} s)`);
}
/** Run ffmpeg (tools/trailer/record.mjs `FFMPEG`) with `args`, quietly; throws if it fails. */
function ffmpeg(args) {
  return new Promise((ok, no) => {
    const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
    ff.on('error', no); ff.on('close', (c) => (c === 0 ? ok() : no(new Error(`ffmpeg exited ${c}`))));
  });
}

const JOBS = { sieges, heroes, controls, clip };
/** One of the controls shots alone, by name: `hud` (the desktop's) or `phone` (the landscape phone's). */
const PARTS = { hud, phone };
try {
  for (const [k, f] of Object.entries(JOBS)) if (!only.length || only.includes(k)) await f();
  for (const [k, f] of Object.entries(PARTS)) if (only.includes(k) && !only.includes('controls')) await f();
} finally { await browser.close(); server.close(); }
