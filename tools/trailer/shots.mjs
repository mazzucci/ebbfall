// The trailer's shot list (the storyboard for the 30-second trailer, with the PM's notes over it), as data for
// tools/trailer/record.mjs. A segment is one staged game page: `as` the people this side plays (the sim takes orders
// and placements only for its own seat: stage.mjs `game`), `ai` the other seat's AI left on, `scene` run in the page
// (through the debug handle only: window.S from stage.mjs; it returns the anchors the camera frames, world px) and its
// `parts`, each a file of its own: `seconds` long, `cam(t, a, fmt)` the camera every frame (world center and zoom;
// `dx`/`dy` a nudge), `ticks` sim ticks a frame (a time-lapse above 1), `freeze` (the game stopped, its last frame
// held), `at` actions at their times (run in node, with the page), `overlay(t, fmt)` the overlays (overlay.mjs). Times
// are seconds from the part's start. tools/trailer/cut.mjs lays the parts on each version's timeline.
// Every shot is on Dust Quarter (the map a new player gets first): seat 0 starts top right, seat 1 bottom left.

// ---- easing and the camera's moves ----
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
const mix = (p, q, k) => ({ x: lerp(p.x, q.x, k), y: lerp(p.y, q.y, k) });
const tall = (fmt) => fmt === '9x16';
/** A fade in from `t0` over `d` seconds (0..1). */
const fadeIn = (t, t0, d = 0.2) => clamp01((t - t0) / d);
/** The flash's white at `t0` (full for two frames, then gone over 0.3 s) and the camera's nudge (±6 video px, dying
 *  over 9 frames). */
const flashAt = (t, t0) => (t < t0 - 1e-6 ? 0 : clamp01(1 - (t - t0 - 2 / 30) / 0.3));
const nudge = (t, t0, zoom) => {
  const k = Math.round((t - t0) * 30);
  if (k < 0 || k >= 9) return {};
  const a = 3 * (1 - k / 9) / zoom; // (6 video px at DPR 2: 3 CSS px)
  return { dx: (k % 2 ? -1 : 1) * a, dy: (k % 3 === 1 ? -1 : 1) * a * 0.7 };
};
/** A one-word beat (bottom center in 16:9, at 72% height in 9:16), in on the cut. */
const beat = (text, style) => (t, fmt) => ({ word: { text, alpha: fadeIn(t, 0, 0.1), style: style?.(fmt) } });
/** A still camera on anchor `k`, zoom `z` (16:9) or `zt` (9:16), `off` world px off it. */
const still = (k, z, zt, off = {}, offT = off) => (t, a, fmt) => ({ x: a[k].x + ((tall(fmt) ? offT : off).x || 0), y: a[k].y + ((tall(fmt) ? offT : off).y || 0), zoom: tall(fmt) ? zt : z });

// ---- in the page: the scenes (plain functions, serialized: no closures; they read only window.S) ----

/** Shots 1-3: the Kingdom's start as its own AI built it by about 4:10 (a Barracks, a Market, a Cottage, a dozen
 *  Villagers on the mine road; its AI then stops, its Villagers mine on), playing the Expedition, whose Data center will
 *  land in the grass east of the Castle (the nearest spot `canPlace` gives there). Four Villagers already stand in that
 *  grass, south-west of the spot: a seat's new units face the map's middle, north-east, so they face where it lands. */
function arrivalScene() {
  const { e, G, eng, K, X, hqOf, mineOf, spawn, spot, until, byId } = window.S;
  const hq = hqOf(K), m = mineOf(K);
  e.setResources(X, 5000, 0);
  e.skip(250);
  eng.disableAi();
  for (const b of G.bldgs.filter(b => b.team === K && !b.done)) until(b); // (its builders finish what is under way)
  // Its two soldiers would fall on the Bot that builds the Data center: hired Sellswords take them out of the picture,
  // then walk home.
  // (and those its Barracks still had queued, as they come out)
  const soldiers = () => G.units.filter(u => u.team === K && !eng.UNITS[u.type].worker && u.type !== 'observer');
  const hired = [0, 1, 2, 3, 4, 5].map(i => spawn(X, 'prism', { x: hq.x + 200 + i * 14, y: hq.y - 200 }));
  for (let i = 0; i < 90; i++) { // (between soldiers they wait well away, or they would turn on the buildings)
    const g = soldiers()[0];
    for (const id of hired) if (byId(id)) { if (g) eng.attackEnt(byId(id), g); else eng.moveTo(byId(id), hq.x + 650, hq.y - 650); }
    e.skip(1);
  }
  for (const id of hired) if (byId(id)) eng.moveTo(byId(id), hq.x + 2000, hq.y - 2000);
  e.skip(25);
  e.bars(false); // (a Cottage scratched in that: no health bar in a quiet shot)
  spawn(K, 'observer', { x: hq.x + 8, y: hq.y - 40 });
  const want = { x: hq.x + 256, y: hq.y - 40 };
  const scout = spawn(X, 'lumen', want); e.skip(0.3); // (placing needs the ground seen: a Bot looks, then leaves)
  const s = spot(X, 'conflux', want), d = eng.BUILDINGS.conflux;
  eng.moveTo(byId(scout), want.x + 1500, want.y - 1500); e.skip(20);
  const dc = { x: (s[0] + d.w / 2) * 32, y: (s[1] + d.h / 2) * 32, tx: s[0], ty: s[1] };
  const u = { x: -Math.SQRT1_2, y: Math.SQRT1_2 }; // (south-west of it: they face north-east)
  const stare = [0, 1, 2, 3].map(i => { const f = 112 + (i % 2) * 24, w = (i - 1.5) * 26; return { x: dc.x + u.x * f - u.y * w, y: dc.y + u.y * f + u.x * w }; });
  for (const p of stare) spawn(K, 'harvester', p);
  e.skip(0.5);
  window.S.arrival = { dc };
  const sc = stare.reduce((p, q) => ({ x: p.x + q.x / 4, y: p.y + q.y / 4 }), { x: 0, y: 0 });
  return { hq: { x: hq.x, y: hq.y }, mine: { x: m.x, y: m.y }, dc, stare: sc, look: { x: (sc.x + dc.x) / 2, y: (sc.y + dc.y) / 2 } };
}
/** The arrival, between two frames: a Bot builds the Data center (its build time passes now) and walks off. */
function arrive() {
  const { e, G, eng, X, spawn, byId } = window.S, { dc } = window.S.arrival;
  const bot = spawn(X, 'lumen', { x: dc.x + 80, y: dc.y - 30 }); e.skip(0.2);
  const err = eng.placeBuilding(X, 'conflux', dc.tx, dc.ty, byId(bot));
  if (err) throw new Error(`the Data center: ${err}`);
  for (let i = 0; i < 120; i++) { e.skip(1); if (G.bldgs.some(b => b.type === 'conflux' && b.tx === dc.tx && b.ty === dc.ty && b.done)) break; }
  eng.moveTo(byId(bot), dc.x + 1400, dc.y - 1400);
  e.skip(8);
  return true;
}

/** Shot 4, MINE: the Kingdom at 2:30, twelve Villagers on its mine, their trips out of step. */
function mineScene() {
  const { e, G, K, hqOf, mineOf, spawn, gather } = window.S;
  const hq = hqOf(K), m = mineOf(K);
  for (let i = 0; i < 8; i++) spawn(K, 'harvester', { x: hq.x - 60 + i * 16, y: hq.y - 90 });
  for (const w of window.S.workers(K)) { gather(K, [w]); e.skip(0.6); } // (staggered: some always on the road)
  e.skip(150 - G.time);
  return { mine: { x: m.x, y: m.y } };
}

/** Shot 5, BUILD: an Expedition base rising beside its Data center (just out of frame), Bots at each site, placed so
 *  they finish during the shot's time-lapse (6 ticks a frame: 9.6 s of game in 1.6 s); a Buggy rolls out of the
 *  Factory. The bars over the sites are hidden (`endfall.bars`): the holograms say it. */
function buildScene() {
  const { e, G, eng, X, hqOf, spawn, byId, spot, toward, until } = window.S;
  const hq = hqOf(X), mid = { x: eng.MW * 16, y: eng.MH * 16 };
  e.setResources(X, 9000, 0);
  const P = toward(X, mid, 300, 0), at = (dx, dy) => ({ x: P.x + dx, y: P.y + dy });
  const put = (type, p) => {
    const s = spot(X, type, p); if (!s) throw new Error(`build: no spot for ${type}`);
    const d = eng.BUILDINGS[type], c = { x: (s[0] + d.w / 2) * 32, y: (s[1] + d.h / 2) * 32 };
    const bot = spawn(X, 'lumen', { x: c.x + d.w * 16 + 8, y: c.y + 6 });
    const err = eng.placeBuilding(X, type, s[0], s[1], byId(bot)); if (err) throw new Error(`build: ${type}: ${err}`);
    return G.bldgs.find(b => b.type === type && b.tx === s[0] && b.ty === s[1]);
  };
  until(put('siphon', toward(X, mid, -80, 200)));
  const kiln = until(put('kiln', at(120, -40)));
  const sites = [['substation', at(-40, -80)], ['spire', at(-150, -10)], ['spire', at(-90, 60)], ['spire', at(-10, 40)]];
  const t0 = G.time + 26, plan = [[t0 - 25 + 2, 0], [t0 - 20 + 4, 1], [t0 - 20 + 6, 2], [t0 - 20 + 8, 3], [t0 - 24 + 4.5, 'queue']].sort((p, q) => p[0] - q[0]);
  for (const [t, what] of plan) {
    if (t > G.time) e.skip(t - G.time);
    if (what === 'queue') { eng.setRally(kiln, kiln.x + 30, kiln.y + 120); eng.queueUnit(kiln, 'scythe'); } else put(...sites[what]);
  }
  if (t0 > G.time) e.skip(t0 - G.time);
  e.bars(false);
  return { P, kiln: { x: kiln.x, y: kiln.y }, hq: { x: hq.x, y: hq.y } };
}

/** Shot 6, HOLD: the Kingdom at about 4:00, a Watchtower by its mine, twelve Villagers on it; three Buggies tear in
 *  (the other seat: idle units take what comes in reach), four Archers hold below and shoot; the Villagers scatter
 *  (`holdScatter`). Laid out per format: 16:9 the Buggies from the left, 9:16 from below. */
function holdScene({ fmt }) {
  const { e, G, eng, K, X, hqOf, mineOf, spawn, gather, place, until, workers } = window.S;
  const hq = hqOf(K), m = mineOf(K), T = fmt === '9x16', at = (dx, dy) => ({ x: m.x + dx, y: m.y + dy });
  e.setResources(K, 5000, 0);
  for (let i = 0; i < 8; i++) spawn(K, 'harvester', { x: hq.x - 60 + i * 16, y: hq.y - 90 });
  const ws = workers(K);
  until(place(K, 'barracks', { x: hq.x + 120, y: hq.y + 150 }, ws[0])); // (out of frame: the tower needs it)
  const tower = until(place(K, 'turret', at(-150, 30), ws[1]));
  for (const w of ws) { gather(K, [w]); e.skip(0.6); }
  e.skip(Math.max(0, 236 - G.time));
  for (let i = 0; i < 3; i++) spawn(X, 'scythe', T ? at(-150 + i * 28, 165 + (i % 2) * 24) : at(-215 + (i % 2) * 24, 120 + i * 28));
  e.skip(1.4);
  const archers = [0, 1, 2, 3, 4].map(i => spawn(K, 'lancer', T ? at(-120 + i * 24, 300) : at(-130 + i * 24, 225)));
  const goal = T ? at(-90, 250) : at(-100, 200);
  for (const id of archers) eng.attackMove(window.S.byId(id), goal.x, goal.y);
  e.skip(1.5);
  return { mine: { x: m.x, y: m.y }, tower: tower?.x ? { x: tower.x, y: tower.y } : null, look: T ? at(-70, 160) : at(-110, 110) };
}
/** The Villagers scatter: those out of the mine run for the Castle, away from the Buggies. */
function holdScatter() {
  const { G, eng, K, hqOf, byId } = window.S, hq = hqOf(K);
  G.units.filter(u => u.team === K && u.type === 'harvester' && !u.inside).forEach((u, i) => eng.moveTo(u, hq.x + 60 + (i % 3) * 30, hq.y - 40 + (i % 2) * 40));
}

/** Shot 7, PUSH: an Uplink out in the country (inside the Data center's coverage, so it may go up), a Bot stepping
 *  back from it; a column of Androids, a Rover and Buggies rolls past it toward the Kingdom, Drones ahead (16:9: down
 *  and to the left, the way to the Kingdom; 9:16: straight down the frame, so it stays in). */
function pushScene({ fmt }) {
  const { e, G, eng, X, K, hqOf, spawn, byId, spot, toward } = window.S;
  const foe = hqOf(K), T = fmt === '9x16';
  e.setResources(X, 9000, 0);
  const at = (f, s) => toward(X, foe, f, s);
  const put = (type, p) => {
    const s = spot(X, type, p); if (!s) throw new Error(`push: no spot for ${type}`);
    const d = eng.BUILDINGS[type], c = { x: (s[0] + d.w / 2) * 32, y: (s[1] + d.h / 2) * 32 };
    const bot = spawn(X, 'lumen', { x: c.x + d.w * 16 + 10, y: c.y + 10 });
    const err = eng.placeBuilding(X, type, s[0], s[1], byId(bot)); if (err) throw new Error(`push: ${type}: ${err}`);
    const b = G.bldgs.find(b => b.type === type && b.tx === s[0] && b.ty === s[1]);
    for (let i = 0; i < 120 && !b.done; i++) e.skip(1);
    return { b, bot };
  };
  put('siphon', at(-40, 200)); put('loom', at(-40, -200));
  for (let i = 0; i < 2; i++) put('substation', at(-200, (i - 0.5) * 90)); // (the grid for the column)
  const { b: up, bot } = put('uplink', at(540, 0));
  const dir = T ? { x: 0, y: 1 } : (() => { const v = { x: foe.x - up.x, y: foe.y - up.y }, l = Math.hypot(v.x, v.y); return { x: v.x / l, y: v.y / l }; })();
  const s = { x: -dir.y, y: dir.x }, p = (f, w) => ({ x: up.x + dir.x * f + s.x * w, y: up.y + dir.y * f + s.y * w });
  eng.moveTo(byId(bot), up.x + 70, up.y - 50);
  // (spread back along the road by speed: at mid-shot the Androids pass the dish, the Buggies and the Drones ahead; all
  // a little to one side of the dish, the Drones the farthest)
  const side = T ? -1 : 1;
  const col = [['umbra', -120, 70], ['umbra', -160, 100], ['monolith', -50, 110], ['scythe', -240, 80], ['scythe', -280, 115], ['shrike', -260, 160], ['shrike', -300, 140], ['shrike', -290, 185]];
  const ids = col.map(([k, f, w]) => spawn(X, k, p(f, w * side)));
  const goal = p(1400, 100 * side);
  for (const id of ids) eng.moveTo(byId(id), goal.x, goal.y);
  e.skip(0.2);
  return { up: { x: up.x, y: up.y }, look: p(70, 70 * side) };
}

/** Shot 8, the Drone raid: the Kingdom's base as its own AI built it by 7:30 (three Cottages, Barracks, a Market; our
 *  Data center held by Androids and Rovers, so its first waves die there; its AI then stops), playing the Expedition:
 *  two Uplinks reach the Kingdom (so the Drones are in coverage), eight Drones sweep in from the north over its
 *  Cottages, a Ballista among them answers. */
function raidScene({ fmt }) {
  const { e, G, eng, X, K, hqOf, spawn, byId, spot, toward } = window.S;
  const foe = hqOf(K);
  e.setResources(X, 30000, 0);
  const at = (f, s) => toward(X, foe, f, s);
  const put = (type, p, wait = true) => {
    const bot = spawn(X, 'lumen', { x: p.x + 50, y: p.y + 10 }); e.skip(0.3); // (it sees the ground first: placing needs it explored)
    const s = spot(X, type, p); if (!s) throw new Error(`raid: no spot for ${type}`);
    const err = eng.placeBuilding(X, type, s[0], s[1], byId(bot)); if (err) throw new Error(`raid: ${type}: ${err}`);
    const b = G.bldgs.find(b => b.type === type && b.tx === s[0] && b.ty === s[1]);
    for (let i = 0; i < 120 && wait && !b.done; i++) e.skip(1);
    return b;
  };
  for (let i = 0; i < 5; i++) put('substation', at(-200, (i - 2) * 90), false); // (the grid for the guard)
  e.skip(60);
  for (let i = 0; i < 12; i++) spawn(X, i < 9 ? 'umbra' : 'monolith', at(130 + (i % 3) * 40, (i - 5.5) * 35));
  e.skip(Math.max(0, 450 - G.time));
  eng.disableAi(); // (its base as it stands; its Villagers mine on)
  put('siphon', at(-40, 200)); put('loom', at(-40, -200));
  put('uplink', at(540, 0)); put('uplink', at(2300, 0));
  const cottages = G.bldgs.filter(b => b.team === K && b.type === 'depot');
  // The frame: the Cottages west of the Castle (the most of them), the Drones over them from the north.
  const west = cottages.filter(b => b.x <= foe.x + 40), cs = west.length >= 2 ? west : cottages;
  const c = cs.reduce((p, q) => ({ x: p.x + q.x / cs.length, y: p.y + q.y / cs.length }), { x: 0, y: 0 });
  spawn(K, 'bastion', { x: c.x + 50, y: c.y + 70 });
  // (each Drone onto a Cottage: an attack-move would turn them on the Kingdom's army, north-east of its base)
  const targets = [...cs].sort((a, b) => a.x - b.x);
  for (let i = 0; i < 8; i++) { const id = spawn(X, 'shrike', { x: Math.max(48, c.x - 240 - (i % 2) * 28), y: c.y - 80 + i * 22 }); /* (inside the map's edge) */ eng.attackEnt(byId(id), targets[i % targets.length]); }
  e.skip(0.9);
  return { c, n: cottages.length, over: G.over };
}

/** Shot 9, the phone: the docs' Kingdom base at about 3:00 (tools/docs/shots.mjs `base`), the real HUD, the camera
 *  on the army. */
function phoneScene() {
  const { e, G, eng, K, hqOf, spawn, place, gather, toward } = window.S;
  const hq = hqOf(K), mid = { x: eng.MW * 16, y: eng.MH * 16 }, at = (f, s) => toward(K, mid, f, s);
  gather(K); e.setResources(K, 5000, 0);
  for (let i = 0; i < 4; i++) spawn(K, 'harvester', at(-60, (i - 1.5) * 30));
  place(K, 'depot', at(-150, -160)); place(K, 'depot', at(-150, 150)); place(K, 'barracks', at(170, -170));
  e.skip(70); place(K, 'forge', at(-60, 240)); e.skip(70); gather(K);
  const army = ['trooper', 'trooper', 'trooper', 'trooper', 'lancer', 'lancer', 'lancer', 'knight', 'knight'].map((k, i) => at(260 + (i % 3) * 34, (Math.floor(i / 3) - 1) * 40));
  army.forEach((p, i) => spawn(K, ['trooper', 'trooper', 'trooper', 'trooper', 'lancer', 'lancer', 'lancer', 'knight', 'knight'][i], p));
  spawn(K, 'observer', at(40, -70));
  if (180 > G.time) e.skip(180 - G.time);
  e.setResources(K, 470, 0);
  const c = army.reduce((p, q) => ({ x: p.x + q.x / army.length, y: p.y + q.y / army.length }), { x: 0, y: 0 });
  return { look: { x: c.x + 60, y: c.y + 25 } }; // (the army a little left of the middle and above it: the panels are below)
}

/** Shot 10: the armies meet in open country: the Kingdom (Guards and Archers in a line, Knights on the flank, Cannons
 *  set up behind, close enough to fire from the first frame) attack-moves into the Expedition's line (Sellswords and
 *  Bruisers in front, Androids and a Rover behind, Buggies on a wing, Drones over), which holds and takes what comes
 *  (the other seat). 16:9 runs west (the Kingdom) to east, 9:16 south (the Kingdom) to north, on open ground. */
function fightScene({ fmt }) {
  const { e, eng, K, X, spawn, byId } = window.S;
  const T = fmt === '9x16', meet = T ? { x: 1950, y: 2040 } : { x: 2140, y: 1970 };
  // `f` along the fight's axis (the Kingdom's side negative), `s` across it
  const p = (f, s) => (T ? { x: meet.x + s, y: meet.y - f } : { x: meet.x + f, y: meet.y + s });
  const k = [];
  for (let i = 0; i < 8; i++) k.push(spawn(K, 'trooper', p(-120 - (i % 2) * 26, (Math.floor(i / 2) - 1.5) * 36 + (i % 2) * 14)));
  for (let i = 0; i < 6; i++) k.push(spawn(K, 'lancer', p(-190 - (i % 2) * 24, (Math.floor(i / 2) - 1) * 42)));
  for (let i = 0; i < 4; i++) k.push(spawn(K, 'knight', p(-140 - (i % 2) * 28, 125 + Math.floor(i / 2) * 32)));
  const cannons = [spawn(K, 'siegeTank', p(-235, -55)), spawn(K, 'siegeTank', p(-235, 55))];
  for (let i = 0; i < 6; i++) spawn(X, 'prism', p(100 + (i % 2) * 24, (Math.floor(i / 2) - 1) * 44));
  for (let i = 0; i < 3; i++) spawn(X, 'bruiser', p(115, 80 + i * 40));
  spawn(X, 'umbra', p(175, -40)); spawn(X, 'umbra', p(175, 40)); spawn(X, 'monolith', p(225, 0));
  for (let i = 0; i < 3; i++) spawn(X, 'scythe', p(130 + i * 26, -140 - (i % 2) * 20));
  for (let i = 0; i < 4; i++) spawn(X, 'shrike', p(60 + (i % 2) * 40, (i - 1.5) * 55));
  eng.castAbility(cannons.map(byId), 'deploy'); e.skip(3);
  const goal = p(420, 0);
  for (const id of k) if (byId(id)) eng.attackMove(byId(id), goal.x, goal.y);
  e.skip(0.7);
  return { meet, look: p(10, 0) };
}

/** Shot 11: a Knight meets an Android in the clear (a Bruiser beside it, a second Knight behind): the Android fires as
 *  they come, the Knight's lance lands. The Knights come from the north-east (a seat's new units face the map's
 *  middle: the Kingdom's south-west, toward the Android; the Expedition's north-east, toward the Knights). */
function duelScene() {
  const { e, eng, K, X, spawn, byId } = window.S;
  const P = { x: 2140, y: 1970 }, at = (dx, dy) => ({ x: P.x + dx, y: P.y + dy });
  const android = spawn(X, 'umbra', P); spawn(X, 'bruiser', at(-55, 30));
  const kn = [spawn(K, 'knight', at(190, -130)), spawn(K, 'knight', at(250, -150))];
  eng.attackEnt(byId(kn[0]), byId(android)); eng.attackEnt(byId(kn[1]), byId(android));
  e.skip(0.3);
  window.S.duel = { kn };
  return { P, look: at(70, -55) };
}
/** Shot 11's subject: the lead Knight, while it lives (else null). */
function leadKnight() { const u = window.S.byId(window.S.duel.kn[0]); return u ? { x: u.x, y: u.y } : null; }

/** Shot 12: the Kingdom storms the Expedition's Data center: Knights and Guards at its walls, a Cannon set up in frame
 *  and firing on it, its hp lowered so it falls two thirds into the shot (the client's quake as it does). */
function siegeScene({ fmt }) {
  const { e, eng, K, X, spawn, byId, hqOf } = window.S;
  e.skip(90); eng.disableAi(); // (its AI's first buildings: the Data center is not its last, so the game goes on after it)
  const hq = hqOf(X), mid = { x: eng.MW * 16, y: eng.MH * 16 }, len = Math.hypot(mid.x - hq.x, mid.y - hq.y);
  const d = { x: (mid.x - hq.x) / len, y: (mid.y - hq.y) / len }, s = { x: -d.y, y: d.x };
  const at = (f, w) => ({ x: hq.x + d.x * f + s.x * w, y: hq.y + d.y * f + s.y * w });
  const ids = [];
  ['knight', 'trooper', 'knight', 'trooper', 'knight', 'trooper'].forEach((k, i) => ids.push(spawn(K, k, at(88 + (i % 2) * 22, (i - 2.5) * 30))));
  const cannon = spawn(K, 'siegeTank', { x: hq.x + 230, y: hq.y - 20 });
  eng.castAbility([byId(cannon)], 'deploy');
  for (const id of [...ids, cannon]) if (byId(id)) eng.attackEnt(byId(id), hq);
  e.skip(3.2);
  eng.debugSetHp(hq, Math.max(1, window.S.siegeHp ?? 400));
  return { hq: { x: hq.x, y: hq.y }, id: hq.id };
}

// ---- the segments ----
export const SEGMENTS = [
  {
    id: 'arrival', as: 'vael', ai: true, scene: arrivalScene,
    parts: [
      // Opening B's head: the black card (the game's own line), the field held behind it.
      { name: 'black', seconds: 1.3, freeze: true, cam: (t, a, f) => arrivalCam(0, a, f),
        overlay: (t) => ({ black: { alpha: 1, text: `<span style="opacity:${fadeIn(t, 0.1, 0.3)}">In 2047, time travel<br>was first attempted.</span>` } }) },
      // Shots 1-3 (opening A from 0; B cuts in at 0.8): the field, the flash at 1.4, the Data center, the premise.
      { name: 'arrival', seconds: 5.0, cam: arrivalCam,
        at: [{ t: 1.4, run: (page) => page.evaluate(arrive) }],
        overlay: (t, f) => ({ flash: flashAt(t, 1.4), cap: t >= 2.0 ? { alpha: fadeIn(t, 2.0, 0.15), ...arrivalLine(f) } : null }) },
    ],
  },
  { id: 'mine', as: 'humans', scene: mineScene, parts: [{ name: 'mine', seconds: 1.6, cam: still('mine', 2.0, 2.3, { x: -50, y: 62 }, { x: -45, y: 150 }), overlay: beat('MINE') }] },
  {
    id: 'build', as: 'vael', scene: buildScene,
    parts: [{ name: 'build', seconds: 1.6, ticks: 6, cam: still('P', 1.6, 1.85, { x: 0, y: -10 }, { x: -55, y: 20 }), overlay: beat('BUILD', (f) => (tall(f) ? null : 'left:0;right:auto;width:33%')) }],
  },
  {
    id: 'hold', as: 'humans', scene: holdScene,
    parts: [{ name: 'hold', seconds: 1.8, cam: still('look', 2.0, 2.2), at: [{ t: 0.25, run: (page) => page.evaluate(holdScatter) }], overlay: beat('HOLD', (f) => (tall(f) ? 'top:21%' : 'left:0;right:auto;width:33%')) }],
  },
  { id: 'push', as: 'vael', scene: pushScene, parts: [{ name: 'push', seconds: 1.8, cam: still('look', 1.6, 1.8), overlay: beat('PUSH') }] },
  { id: 'raid', as: 'vael', ai: true, scene: raidScene, parts: [{ name: 'raid', seconds: 1.6, cam: (t, a, f) => { const z = tall(f) ? 1.9 : 1.7, half = (tall(f) ? 270 : 480) / z + 16; // (never past the map's west edge)
      return { x: Math.max(half, a.c.x - (tall(f) ? 40 : 70)) + 20 * t, y: a.c.y + (tall(f) ? -50 : 0), zoom: z }; } }] },
  {
    id: 'phone', as: 'humans', phone: { box: phoneBox }, scene: phoneScene,
    parts: [{
      name: 'phone', seconds: 1.8, cam: still('look', 1.75, 1.75),
      at: [{ t: 0.25, run: tapArmy }, { t: 0.95, run: tapGround }],
      overlay: (t, f, st) => ({ cap: { text: 'On your phone too', alpha: 1, style: tall(f) ? 'left:0;right:0;top:15%;font-size:30px;text-align:center' : 'left:0;right:0;top:2.2%;font-size:28px;text-align:center' }, tap: tapRing(t, f, st) }),
    }],
  },
  { id: 'fight', as: 'humans', scene: fightScene, parts: [{ name: 'wide', seconds: 2.6, cam: still('look', 1.3, 1.6, {}, { x: 55, y: 0 }) }] },
  {
    id: 'duel', as: 'humans', scene: duelScene,
    // (the camera drifts a little with the lead Knight, eased toward it each frame)
    parts: [{ name: 'close', seconds: 2.7, follow: leadKnight, cam: (t, a, f, st) => {
      const p = st.follow ? mix(st.follow, a.P, 0.5) : st.c || a.look; st.c = st.c ? mix(st.c, p, 0.06) : { ...a.look };
      return { x: st.c.x, y: st.c.y - (tall(f) ? -60 : 10), zoom: 2.5 };
    } }],
  },
  {
    id: 'siege', as: 'humans', ai: true, scene: siegeScene,
    parts: [
      { name: 'siege', seconds: 2.9, cam: still('hq', 2.0, 2.1, { x: 70, y: -55 }, { x: 40, y: -115 }) },
      // Shot 13: the freeze, graded down, the name in.
      { name: 'freeze', seconds: 2.0, freeze: true, overlay: (t) => ({ grade: ease(t / 0.4), logo: { alpha: fadeIn(t, 0.25, 0.4), scale: lerp(1.06, 1, ease((t - 0.25) / 0.6)) } }) },
      // Shot 14: the end card (the lines on the beats), and the YouTube layout (the column in the left half).
      { name: 'card', seconds: 5.0, freeze: true, overlay: (t) => card(t, false) },
      { name: 'cardyt', seconds: 3.5, freeze: true, overlay: (t) => card(t, true) },
    ],
  },
];

/** Shots 1-3's camera, one move through the flash: a slow drift over the field (the Castle, its Cottage, the mine road
 *  and the grass where the Data center lands), held still from the flash, then from 1.7 an eased push-in on the
 *  Villagers and the Data center. */
function arrivalCam(t, a, fmt) {
  const { hq, dc, look } = a, T = tall(fmt);
  const z0 = T ? 2.0 : 1.6, z1 = T ? 2.25 : 1.95;
  const c0 = T ? { x: lerp(hq.x, dc.x, 0.72), y: hq.y + 40 } : { x: lerp(hq.x, dc.x, 0.5) - 10, y: hq.y + 10 };
  const drift = (s) => ({ x: c0.x + 14 * s, y: c0.y - 5 * s }), held = drift(Math.min(t, 1.4));
  const c1 = T ? { x: look.x + 15, y: look.y + 20 } : { x: look.x - 20, y: look.y - 5 };
  const k = ease((t - 1.7) / 2.9);
  return { x: lerp(held.x, c1.x, k), y: lerp(held.y, c1.y, k), zoom: lerp(z0, z1, k), ...nudge(t, 1.4, lerp(z0, z1, k)) };
}
/** The premise (shot 3's caption): two lines at the bottom right in 16:9, four at the right in 9:16, clear of the
 *  Villagers and the Data center. */
const arrivalLine = (fmt) => tall(fmt)
  ? { text: 'In 2047,<br>an expedition<br>jumped six<br>centuries back.', style: 'right:95px;top:61%;font-size:31px;text-align:right' }
  : { text: 'In 2047, an expedition<br>jumped six centuries back.', style: 'right:30px;bottom:7%;font-size:32px;text-align:right' };

/** The end card at `t` (from 25.0): the logo up, the veil, the lines on the beats (0.7 s apart), the URL last. */
function card(t, yt) {
  const lines = [0, 0.7, 1.4, 2.1, 2.8].map(t0 => ease((t - t0) / 0.25));
  return { grade: 1, veil: ease(t / 0.4), logo: { alpha: 1, scale: 1, yt: yt ? ease(t / 0.45) : 0 }, lines, yt };
}

// ---- the phone shot (9): the landscape phone in the frame, its taps ----
/** Where the phone's picture goes in the frame (CSS px of the recorded viewport): 92% of the width in 16:9; in 9:16
 *  across the middle band in a drawn phone outline. */
function phoneBox(fmt) {
  if (fmt === '9x16') { const w = 500, h = Math.round(w * 390 / 844); return { left: `${(540 - w) / 2}px`, top: `${480 - h / 2}px`, width: `${w}px`, height: `${h}px`, border: '10px solid #1b2230', borderRadius: '22px', boxShadow: '0 0 0 2px #3a4659, 0 18px 40px rgba(0,0,0,.6)' }; }
  const w = Math.round(960 * 0.86), h = Math.round(w * 390 / 844);
  return { left: `${(960 - w) / 2 - 8}px`, top: `${(540 - h) / 2 + 24 - 8}px`, width: `${w}px`, height: `${h}px`, border: '8px solid #1b2230', borderRadius: '20px', boxShadow: '0 0 0 2px #3a4659, 0 14px 34px rgba(0,0,0,.6)' };
}
async function tapArmy(page, st) {
  const b = await page.locator('#btnArmy').boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2; st.taps.push({ x, y, t: 0.25 });
  await page.touchscreen.tap(x, y);
}
/** The tap on the ground: open grass in the upper right of the phone's map, clear of the army and the HUD. */
async function tapGround(page, st) {
  const p = { x: 450, y: 215 };
  st.taps.push({ ...p, t: 0.95 });
  await page.touchscreen.tap(p.x, p.y);
}
/** The white ring at the last tap, growing and fading over 0.45 s, in the frame's coordinates. */
function tapRing(t, fmt, st) {
  const tap = [...st.taps].reverse().find(p => t >= p.t && t < p.t + 0.45);
  if (!tap) return null;
  const box = phoneBox(fmt), k = (t - tap.t) / 0.45, sc = parseFloat(box.width) / 844, bw = parseFloat(box.border);
  return { x: parseFloat(box.left) + bw + tap.x * sc, y: parseFloat(box.top) + bw + tap.y * sc, r: 10 + 16 * k, alpha: 1 - k };
}
