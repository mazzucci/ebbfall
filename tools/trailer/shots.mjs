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
/** The flash's white at `t0` (full, then gone over 8 frames) and the camera's nudge (±6 video px, dying over 9 frames). */
const flashAt = (t, t0) => (t < t0 - 1e-6 ? 0 : clamp01(1 - (t - t0) * 30 / 8));
const nudge = (t, t0, zoom) => {
  const k = Math.round((t - t0) * 30);
  if (k < 0 || k >= 9) return {};
  const a = 3 * (1 - k / 9) / zoom; // (6 video px at DPR 2: 3 CSS px)
  return { dx: (k % 2 ? -1 : 1) * a, dy: (k % 3 === 1 ? -1 : 1) * a * 0.7 };
};
/** A one-word beat (bottom center in 16:9, at 72% height in 9:16), in on the cut. */
const beat = (text) => (t) => ({ word: { text, alpha: fadeIn(t, 0, 0.1) } });
/** A still camera on anchor `k`, zoom `z` (16:9) or `zt` (9:16), `off` world px off it. */
const still = (k, z, zt, off = {}, offT = off) => (t, a, fmt) => ({ x: a[k].x + ((tall(fmt) ? offT : off).x || 0), y: a[k].y + ((tall(fmt) ? offT : off).y || 0), zoom: tall(fmt) ? zt : z });

// ---- in the page: the scenes (plain functions, serialized: no closures; they read only window.S) ----

/** Shots 1-3: the Kingdom's start (its AI mining, a Balloon over the Castle), playing the Expedition, whose Data center
 *  lands in the grass east of the Castle (the nearest spot `canPlace` gives there). */
function arrivalScene() {
  const { e, eng, K, X, hqOf, mineOf, spawn } = window.S;
  const hq = hqOf(K), m = mineOf(K);
  e.setResources(X, 5000, 0);
  e.skip(40);
  eng.disableAi(); // (its Villagers mine on; nothing else moves)
  spawn(K, 'observer', { x: hq.x + 8, y: hq.y - 40 });
  e.skip(0.5);
  const d = eng.BUILDINGS.conflux, at = { tx: hq.tx + 8, ty: hq.ty - 4 }; // (the open grass east and a little north: legal for a Data center)
  const dc = { x: (at.tx + d.w / 2) * 32, y: (at.ty + d.h / 2) * 32, ...at };
  // The Villagers' spots: between the Castle and the site, near the site, in a loose arc facing it.
  const dx = hq.x - dc.x, dy = hq.y - dc.y, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
  const stare = [0, 1, 2, 3].map(i => { const f = 100 + (i % 2) * 22, s = (i - 1.5) * 28; return { x: dc.x + ux * f - uy * s, y: dc.y + uy * f + ux * s }; });
  window.S.arrival = { dc, stare };
  return { hq: { x: hq.x, y: hq.y }, mine: { x: m.x, y: m.y }, dc, look: mix(stare.reduce((p, q) => ({ x: p.x + q.x / 4, y: p.y + q.y / 4 }), { x: 0, y: 0 }), dc, 0.5) };
  function mix(p, q, k) { return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k }; }
}
/** The arrival, between two frames: a Bot builds the Data center (its build time passes now) and walks off; the
 *  Kingdom's AI stops; four Villagers stand between the Castle and it, facing it (a seat's new units face the map's
 *  middle: the Data center is that way). */
function arrive() {
  const { e, G, eng, K, X, spawn, byId } = window.S, { dc, stare } = window.S.arrival;
  const bot = spawn(X, 'lumen', { x: dc.x + 70, y: dc.y + 40 }); e.skip(0.2);
  const err = eng.placeBuilding(X, 'conflux', dc.tx, dc.ty, byId(bot));
  if (err) throw new Error(`the Data center: ${err}`);
  for (let i = 0; i < 120; i++) { e.skip(1); if (G.bldgs.some(b => b.type === 'conflux' && b.tx === dc.tx && b.ty === dc.ty && b.done)) break; }
  eng.moveTo(byId(bot), dc.x + 1400, dc.y - 900);
  e.skip(6);
  for (const p of stare) spawn(K, 'harvester', p);
  e.skip(0.1);
  return true;
}

/** Shot 4, MINE: the Kingdom at 2:30, eight Villagers on its mine. */
function mineScene() {
  const { e, G, K, hqOf, mineOf, spawn, gather } = window.S;
  const hq = hqOf(K), m = mineOf(K);
  for (let i = 0; i < 8; i++) spawn(K, 'harvester', { x: hq.x - 60 + i * 16, y: hq.y - 90 });
  for (const w of window.S.workers(K)) { gather(K, [w]); e.skip(0.9); } // (staggered: the trips out of step, some always on the road)
  e.skip(150 - G.time);
  return { mid: { x: (hq.x + m.x) / 2 + 60, y: (hq.y + m.y) / 2 - 10 } };
}

/** Shot 5, BUILD: an Expedition base rising beside its Data center, Bots at each site (placed so they finish during the
 *  shot's time-lapse); a Buggy rolls out of the Factory. */
function buildScene() {
  const { e, G, eng, X, hqOf, spawn, byId, spot, toward } = window.S;
  const hq = hqOf(X), mid = { x: eng.MW * 16, y: eng.MH * 16 };
  e.setResources(X, 9000, 0);
  const at = (f, s) => toward(X, mid, f, s);
  const put = (type, p) => {
    const s = spot(X, type, p); if (!s) throw new Error(`build: no spot for ${type}`);
    const d = eng.BUILDINGS[type], c = { x: (s[0] + d.w / 2) * 32, y: (s[1] + d.h / 2) * 32 };
    const bot = spawn(X, 'lumen', { x: c.x + d.w * 16 + 8, y: c.y + 6 });
    const err = eng.placeBuilding(X, type, s[0], s[1], byId(bot)); if (err) throw new Error(`build: ${type}: ${err}`);
    return G.bldgs.find(b => b.type === type && b.tx === s[0] && b.ty === s[1]);
  };
  const until = (b) => { for (let i = 0; i < 120 && !b.done; i++) e.skip(1); };
  until(put('siphon', at(-60, 190)));
  const kiln = put('kiln', at(170, -150)); until(kiln);
  const sites = [['substation', at(240, 40)], ['spire', at(150, 120)], ['spire', at(110, 175)], ['spire', at(190, 175)]];
  const t0 = G.time + 24, plan = [[t0 - 25 + 4, 0], [t0 - 20 + 6, 1], [t0 - 20 + 9, 2], [t0 - 20 + 12, 3], [t0 - 24 + 12.5, 'queue']].sort((p, q) => p[0] - q[0]);
  const kc = { x: kiln.x, y: kiln.y };
  for (const [t, what] of plan) {
    if (t > G.time) e.skip(t - G.time);
    if (what === 'queue') { eng.setRally(kiln, kc.x + 40, kc.y + 150); eng.queueUnit(kiln, 'scythe'); } else put(...sites[what]);
  }
  if (t0 > G.time) e.skip(t0 - G.time);
  const c = sites.map(s => s[1]).concat([kc]).reduce((p, q) => ({ x: p.x + q.x / 5, y: p.y + q.y / 5 }), { x: 0, y: 0 });
  return { sites: c, hq: { x: hq.x, y: hq.y } };
}

/** Shot 6, HOLD: the Kingdom at about 4:00 (a Barracks, a Watchtower by the mine, Villagers mining); three Buggies
 *  tear into the mine's Villagers (the other seat: on their own, as an idle unit takes what comes in reach). Four
 *  Archers run in from the Castle (`holdArchers`). */
function holdScene() {
  const { e, G, eng, K, X, hqOf, mineOf, spawn, gather, place, until, workers } = window.S;
  const hq = hqOf(K), m = mineOf(K);
  e.setResources(K, 5000, 0);
  for (let i = 0; i < 4; i++) spawn(K, 'harvester', { x: hq.x - 40 + i * 20, y: hq.y - 90 });
  const ws = workers(K);
  until(place(K, 'barracks', { x: hq.x - 260, y: hq.y + 20 }, ws[0]));
  const tower = until(place(K, 'turret', { x: m.x - 110, y: m.y + 40 }, ws[1]));
  for (const w of ws) { gather(K, [w]); e.skip(1.3); }
  e.skip(Math.max(0, 230 - G.time));
  for (let i = 0; i < 3; i++) spawn(X, 'scythe', { x: m.x - 230 + i * 26, y: m.y + 120 + (i % 2) * 26 });
  e.skip(2.2);
  const archers = [0, 1, 2, 3].map(i => spawn(K, 'lancer', { x: hq.x - 120 + i * 22, y: hq.y - 110 }));
  window.S.hold = { archers, m: { x: m.x, y: m.y } };
  return { mine: { x: m.x, y: m.y }, tower: tower?.x ? { x: tower.x, y: tower.y } : null, mid: { x: m.x - 90, y: m.y + 110 } };
}
function holdArchers() {
  const { eng, byId } = window.S, { archers, m } = window.S.hold;
  for (const id of archers) eng.attackMove(byId(id), m.x - 160, m.y + 110);
}

/** Shot 7, PUSH: an Uplink out in the country (inside the Data center's coverage, so it may go up), a Bot stepping
 *  back from it; a column of Androids, a Rover and Buggies rolls past toward the Kingdom, Drones ahead. */
function pushScene() {
  const { e, G, eng, X, K, hqOf, spawn, byId, spot, toward } = window.S;
  const hq = hqOf(X), foe = hqOf(K);
  e.setResources(X, 9000, 0);
  const at = (f, s) => toward(X, foe, f, s);
  const put = (type, p, keep) => {
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
  const dir = { x: foe.x - up.x, y: foe.y - up.y }, len = Math.hypot(dir.x, dir.y), d = { x: dir.x / len, y: dir.y / len }, s = { x: -d.y, y: d.x };
  const p = (f, w) => ({ x: up.x + d.x * f + s.x * w, y: up.y + d.y * f + s.y * w });
  eng.moveTo(byId(bot), up.x + 60, up.y - 40);
  // (spread back along the road by speed: at mid-shot the Androids pass the dish, the Buggies and the Drones ahead)
  const col = [['umbra', -110, -60], ['umbra', -150, -35], ['monolith', -60, -95], ['scythe', -230, -70], ['scythe', -270, -105], ['shrike', -260, -20], ['shrike', -300, -60], ['shrike', -280, -100]];
  const ids = col.map(([k, f, w]) => spawn(X, k, p(f, w)));
  const goal = p(1400, -70);
  for (const id of ids) eng.moveTo(byId(id), goal.x, goal.y);
  e.skip(0.2);
  return { up: { x: up.x, y: up.y }, path: p(150, -60) };
}

/** Shot 8, the Drone raid: the Kingdom's base as its own AI built it by about 4:45 (its AI then stops), playing the
 *  Expedition: two Uplinks reach the Kingdom (so the Drones are in coverage), eight Drones sweep over its Cottages, a
 *  Ballista by the Barracks answers. */
function raidScene() {
  const { e, G, eng, X, K, hqOf, spawn, byId, spot, toward } = window.S;
  const hq = hqOf(X), foe = hqOf(K);
  e.setResources(X, 9000, 0);
  const at = (f, s) => toward(X, foe, f, s);
  const put = (type, p) => {
    const bot = spawn(X, 'lumen', { x: p.x + 50, y: p.y + 10 }); e.skip(0.3); // (it sees the ground first: placing needs it explored)
    const s = spot(X, type, p); if (!s) throw new Error(`raid: no spot for ${type}`);
    const err = eng.placeBuilding(X, type, s[0], s[1], byId(bot)); if (err) throw new Error(`raid: ${type}: ${err}`);
    const b = G.bldgs.find(b => b.type === type && b.tx === s[0] && b.ty === s[1]);
    for (let i = 0; i < 120 && !b.done; i++) e.skip(1);
    return b;
  };
  e.skip(Math.max(0, 285 - G.time)); // (before its first wave reaches our undefended Data center, about 5:20)
  eng.disableAi(); // (its base as it stands; its Villagers mine on)
  for (let i = 0; i < 5; i++) put('substation', at(-200, (i - 2) * 90)); // (the grid for what comes)
  // Its first wave is already on the road to our Data center (an order it keeps): Androids and Rovers wait for it there,
  // far from the shot.
  for (let i = 0; i < 8; i++) spawn(X, i < 6 ? 'umbra' : 'monolith', at(130 + (i % 2) * 40, (i - 3.5) * 40));
  e.skip(80);
  put('siphon', at(-40, 200)); put('loom', at(-40, -200));
  put('uplink', at(540, 0)); put('uplink', at(2300, 0));
  const cottages = G.bldgs.filter(b => b.team === K && b.type === 'depot');
  const barracks = G.bldgs.find(b => b.team === K && b.type === 'barracks') || foe;
  const c = cottages.length ? cottages.reduce((p, q) => ({ x: p.x + q.x / cottages.length, y: p.y + q.y / cottages.length }), { x: 0, y: 0 }) : { x: foe.x, y: foe.y };
  spawn(K, 'bastion', { x: barracks.x + 60, y: barracks.y + 50 });
  const d = { x: foe.x - hq.x, y: foe.y - hq.y }, len = Math.hypot(d.x, d.y), u = { x: d.x / len, y: d.y / len };
  const ids = [];
  for (let i = 0; i < 8; i++) ids.push(spawn(X, 'shrike', { x: c.x - u.x * (300 + (i % 3) * 30) + (i - 3.5) * 26 * -u.y, y: c.y - u.y * (300 + (i % 3) * 30) + (i - 3.5) * 26 * u.x }));
  for (const id of ids) eng.attackMove(byId(id), c.x + u.x * 500, c.y + u.y * 500);
  e.skip(0.3);
  return { c, foe: { x: foe.x, y: foe.y }, u, over: G.over, n: cottages.length, radio: G.radio.length };
}

/** Shot 9, the phone: the docs' Kingdom base at about 3:00 (tools/docs/shots.mjs `base`), the real HUD. */
function phoneScene() {
  const { e, G, eng, K, hqOf, spawn, place, gather, toward } = window.S;
  const hq = hqOf(K), mid = { x: eng.MW * 16, y: eng.MH * 16 }, at = (f, s) => toward(K, mid, f, s);
  gather(K); e.setResources(K, 5000, 0);
  for (let i = 0; i < 4; i++) spawn(K, 'harvester', at(-60, (i - 1.5) * 30));
  place(K, 'depot', at(-150, -160)); place(K, 'depot', at(-150, 150)); place(K, 'barracks', at(170, -170));
  e.skip(70); place(K, 'forge', at(-60, 240)); e.skip(70); gather(K);
  ['trooper', 'trooper', 'trooper', 'trooper', 'lancer', 'lancer', 'lancer', 'knight', 'knight'].forEach((k, i) => spawn(K, k, at(260 + (i % 3) * 34, (Math.floor(i / 3) - 1) * 40)));
  spawn(K, 'observer', at(40, -70));
  if (180 > G.time) e.skip(180 - G.time);
  e.setResources(K, 470, 0);
  return { look: at(330, 10) };
}

/** Shots 10-11: the armies meet in open country: the Kingdom (Guards and Archers in a line, Knights on the flank,
 *  Cannons set up behind) attack-moves into the Expedition's line (Sellswords and Bruisers in front, Androids and a Rover
 *  behind, Buggies on a wing, Drones over), which holds and takes what comes (the other seat). 16:9 runs west-east,
 *  9:16 north-south. */
function fightScene({ fmt }) {
  const { e, G, eng, K, X, spawn, byId } = window.S;
  const meet = { x: 2140, y: 1970 }, T = fmt === '9x16';
  // `f` along the fight's axis (the Kingdom's side negative), `s` across it
  const p = (f, s) => (T ? { x: meet.x + s, y: meet.y - f } : { x: meet.x + f, y: meet.y + s });
  const k = [];
  for (let i = 0; i < 8; i++) k.push(spawn(K, 'trooper', p(-150 - (i % 2) * 26, (Math.floor(i / 2) - 1.5) * 36 + (i % 2) * 14)));
  for (let i = 0; i < 6; i++) k.push(spawn(K, 'lancer', p(-235 - (i % 2) * 24, (Math.floor(i / 2) - 1) * 42)));
  for (let i = 0; i < 4; i++) k.push(spawn(K, 'knight', p(-170 - (i % 2) * 28, 150 + Math.floor(i / 2) * 34)));
  const cannons = [spawn(K, 'siegeTank', p(-330, -60)), spawn(K, 'siegeTank', p(-330, 60))];
  spawn(K, 'observer', p(-280, -120));
  const xs = [];
  for (let i = 0; i < 6; i++) xs.push(spawn(X, 'prism', p(120 + (i % 2) * 24, (Math.floor(i / 2) - 1) * 44)));
  for (let i = 0; i < 3; i++) xs.push(spawn(X, 'bruiser', p(150, 120 + i * 40 - 40)));
  xs.push(spawn(X, 'umbra', p(250, -50)), spawn(X, 'umbra', p(250, 50)), spawn(X, 'monolith', p(310, 0)));
  for (let i = 0; i < 3; i++) xs.push(spawn(X, 'scythe', p(160 + i * 26, -170 - (i % 2) * 20)));
  for (let i = 0; i < 4; i++) xs.push(spawn(X, 'shrike', p(60 + (i % 2) * 40, (i - 1.5) * 60)));
  eng.castAbility(cannons.map(byId), 'deploy'); e.skip(3);
  const goal = p(420, 0);
  for (const id of k) if (!cannons.includes(id)) eng.attackMove(byId(id), goal.x, goal.y);
  window.S.fight = { knights: k.slice(14, 18) };
  e.skip(1.2);
  return { meet, flank: p(30, 120) };
}
/** Shot 11's subject: where the Knights are now (their middle). */
function knightsAt() {
  const { byId } = window.S, us = window.S.fight.knights.map(byId).filter(Boolean);
  if (!us.length) return null;
  return { x: us.reduce((s, u) => s + u.x, 0) / us.length, y: us.reduce((s, u) => s + u.y, 0) / us.length };
}

/** Shot 12: the Kingdom storms the Expedition's Data center (the docs' `siege`): Knights and Guards at its walls,
 *  Cannons set up behind, its hp lowered so it falls in the shot. */
function siegeScene({ fmt }) {
  const { e, G, eng, K, X, spawn, byId, hqOf } = window.S;
  const hq = hqOf(X), mid = { x: eng.MW * 16, y: eng.MH * 16 }, len = Math.hypot(mid.x - hq.x, mid.y - hq.y);
  const d = { x: (mid.x - hq.x) / len, y: (mid.y - hq.y) / len }, s = { x: -d.y, y: d.x };
  const at = (f, w) => ({ x: hq.x + d.x * f + s.x * w, y: hq.y + d.y * f + s.y * w });
  const ids = [];
  ['knight', 'knight', 'knight', 'trooper', 'trooper', 'trooper', 'trooper'].forEach((k, i) => ids.push(spawn(K, k, at(120 + (i % 2) * 30, (i - 3) * 34))));
  ['lancer', 'lancer', 'lancer', 'bastion'].forEach((k, i) => ids.push(spawn(K, k, at(250, (i - 1.5) * 40))));
  const cannons = [spawn(K, 'siegeTank', at(330, -70)), spawn(K, 'siegeTank', at(340, 60))];
  ['prism', 'prism', 'bruiser'].forEach((k, i) => spawn(X, k, at(60, (i - 1) * 50)));
  eng.castAbility(cannons.map(byId), 'deploy');
  for (const id of [...ids, ...cannons]) eng.attackEnt(byId(id), hq);
  e.skip(4);
  eng.debugSetHp(hq, 320);
  return { hq: { x: hq.x, y: hq.y }, look: at(80, 0), id: hq.id };
}

// ---- the segments ----
export const SEGMENTS = [
  {
    id: 'arrival', as: 'vael', ai: true, scene: arrivalScene,
    parts: [
      // Opening B's head: the black card (Stelian's line), the field held behind it.
      { name: 'black', seconds: 1.3, freeze: true, cam: (t, a, f) => arrivalCam(0, a, f),
        overlay: (t) => ({ black: { alpha: 1, text: `<span style="opacity:${fadeIn(t, 0.1, 0.3)}">Time travel was discovered.</span>` } }) },
      // Shots 1-3 (opening A from 0; B cuts in at 0.8): the field, the flash at 1.4, the Data center, the line.
      { name: 'arrival', seconds: 5.0, cam: arrivalCam,
        at: [{ t: 1.4, run: (page) => page.evaluate(arrive) }],
        overlay: (t, f) => ({ flash: flashAt(t, 1.4), cap: t >= 2.0 ? { alpha: fadeIn(t, 2.0, 0.15), ...arrivalLine(f) } : null }) },
    ],
  },
  { id: 'mine', as: 'humans', scene: mineScene, parts: [{ name: 'mine', seconds: 1.6, cam: still('mid', 2.0, 2.3), overlay: beat('MINE') }] },
  { id: 'build', as: 'vael', scene: buildScene, parts: [{ name: 'build', seconds: 1.6, ticks: 10, cam: still('sites', 1.6, 1.9, { x: -10, y: -30 }, { x: 0, y: -10 }), overlay: beat('BUILD') }] },
  {
    id: 'hold', as: 'humans', scene: holdScene,
    parts: [{ name: 'hold', seconds: 1.8, cam: still('mid', 2.15, 2.4, {}, { x: -50, y: 0 }), at: [{ t: 0, run: (page) => page.evaluate(holdArchers) }], overlay: beat('HOLD') }],
  },
  { id: 'push', as: 'vael', scene: pushScene, parts: [{ name: 'push', seconds: 1.8, cam: (t, a, f) => ({ ...mix(a.up, a.path, 0.5), zoom: tall(f) ? 1.9 : 1.6 }), overlay: beat('PUSH') }] },
  { id: 'raid', as: 'vael', ai: true, scene: raidScene, parts: [{ name: 'raid', seconds: 1.6, cam: (t, a, f) => ({ x: a.c.x - a.u.x * (tall(f) ? 150 : 210) + a.u.x * 30 * t, y: a.c.y - a.u.y * (tall(f) ? 150 : 210) + a.u.y * 30 * t, zoom: tall(f) ? 1.8 : 1.65 }) }] },
  {
    id: 'phone', as: 'humans', phone: { box: phoneBox }, scene: phoneScene,
    parts: [{
      name: 'phone', seconds: 1.8, cam: still('look', 1.75, 1.75),
      at: [{ t: 0.25, run: tapArmy }, { t: 0.95, run: tapGround }],
      overlay: (t, f, st) => ({ cap: { text: 'On your phone too', alpha: 1, style: tall(f) ? 'left:0;right:0;top:15%;font-size:30px;text-align:center' : 'left:0;right:0;top:2.2%;font-size:28px;text-align:center' }, tap: tapRing(t, f, st) }),
    }],
  },
  {
    id: 'fight', as: 'humans', scene: fightScene,
    parts: [
      { name: 'wide', seconds: 2.6, cam: still('meet', 1.3, 1.7, { x: -90, y: 30 }, { x: 40, y: -70 }) },
      // (the camera drifts with the Knights: their middle, eased toward each frame)
      { name: 'close', seconds: 2.2, follow: knightsAt, cam: (t, a, f, st) => {
        const p = st.follow || a.flank; st.c = st.c ? mix(st.c, p, 0.08) : { ...p };
        return { x: st.c.x, y: st.c.y - 10, zoom: 2.5 };
      } },
    ],
  },
  {
    id: 'siege', as: 'humans', scene: siegeScene,
    parts: [
      { name: 'siege', seconds: 3.4, cam: still('look', 1.6, 1.9, { x: 30, y: -20 }, { x: 0, y: 40 }) },
      // Shot 13: the freeze, graded down, the name in.
      { name: 'freeze', seconds: 2.0, freeze: true, overlay: (t) => ({ grade: ease(t / 0.4), logo: { alpha: fadeIn(t, 0.25, 0.4), scale: lerp(1.06, 1, ease((t - 0.25) / 0.6)) } }) },
      // Shot 14: the end card (the lines on the beats), and the YouTube layout (the column in the left half).
      { name: 'card', seconds: 5.0, freeze: true, overlay: (t) => card(t, false) },
      { name: 'cardyt', seconds: 3.5, freeze: true, overlay: (t) => card(t, true) },
    ],
  },
];

/** Shots 1-3's camera: before the flash a slow drift toward the grass where the Data center lands; after it a push-in. */
function arrivalCam(t, a, fmt) {
  const { hq, dc, look } = a, T = tall(fmt);
  if (t < 1.4) {
    const z = T ? 2.2 : 1.8, c0 = T ? { x: lerp(hq.x, dc.x, 0.22), y: lerp(hq.y, dc.y, 0.35) + 50 } : { x: hq.x + 150, y: lerp(hq.y, dc.y, 0.5) + 70 };
    return { x: c0.x + 5.6 * t, y: c0.y - 1.5 * t, zoom: z };
  }
  const k = ease((t - 1.7) / 2.9), z = T ? lerp(2.2, 2.45, k) : lerp(1.8, 2.1, k);
  const c = T ? { x: look.x, y: look.y - 15 } : { x: look.x - 10, y: look.y - 45 };
  return { ...c, zoom: z, ...nudge(t, 1.4, z) };
}
/** The line: two lines high in the 16:9 frame, four in the 9:16 band under the platforms' header. */
const arrivalLine = (fmt) => tall(fmt)
  ? { text: 'Naturally,<br>the first thing<br>we built was<br>a data center.', style: 'left:45px;top:14%;font-size:34px;text-align:left' }
  : { text: 'Naturally, the first thing<br>we built was a data center.', style: 'left:30px;top:6%;font-size:32px;text-align:left' };

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
  const p = { x: 770, y: 95 };
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
