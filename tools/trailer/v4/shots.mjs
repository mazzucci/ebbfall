// Cut 4's shot list ("Day 675", 16:9 only), as data for tools/trailer/record.mjs `recordSegment` (see tools/trailer/shots.mjs
// for a segment's shape): each segment one staged game page, each part a file, a little longer than the cut needs
// (script.mjs CUT trims it). Every camera is locked (one eased pull-back, on the last shot). The scenes use the debug
// handle only (window.S, stage.mjs). Dust Quarter, but the Watchtower's two (Sunken Court, as the docs' clip).
import { FPS, TEXT, typed, GROW_T, WARP_T, lengthOf } from './script.mjs';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
const fadeIn = (t, t0, d = 0.2) => clamp01((t - t0) / d);
const blink = (t) => Math.floor(t * 2.5) % 2 === 0;
/** A part's length: the cut's, and `pad` seconds more. */
const secs = (part, pad = 0.2) => +(lengthOf(part) / FPS + pad).toFixed(3);
/** A locked camera on anchor `k`, `off` world px off it. */
const still = (k, zoom, off = {}) => (t, a) => ({ x: a[k].x + (off.x || 0), y: a[k].y + (off.y || 0), zoom });
/** Where a world point is in the 960x540 frame under camera `c`. */
const onScreen = (p, c) => ({ x: (p.x - c.x) * c.zoom + 480, y: (p.y - c.y) * c.zoom + 270 });

/** The diary at `t` of its part: the stamp from `dayAt`, the lines as typed, the cursor after the last one begun
 *  (steady while it types, blinking after). */
function diary(T, t) {
  if (t < T.dayAt - 0.15) return null;
  const lines = T.lines.map(l => typed(l.text, l.times, t)), at = Math.max(0, lines.findLastIndex(l => l.length));
  const typing = T.lines.some(l => t >= l.times[0] && t <= l.times.at(-1) + 0.08);
  return { day: t >= T.dayAt ? T.day : '', lines, at, cursor: typing || blink(t), alpha: fadeIn(t, T.dayAt - 0.15, 0.3) };
}

// ---- in the page: the scenes (plain functions, serialized: no closures; they read only window.S) ----

/** The landing: the Kingdom's start as its own AI built it by about 4:10 (cut 3's arrival: its AI then stops, its
 *  Villagers mine on), playing the Expedition, whose base will land in the grass east of the Castle, far enough that
 *  the Castle stands in the distance. Four Villagers stand south-west of the spot, facing it. */
function landingScene() {
  const { e, G, eng, K, X, hqOf, mineOf, spawn, spot, until, byId } = window.S;
  const hq = hqOf(K), m = mineOf(K);
  e.setResources(X, 5000, 0);
  e.skip(250);
  eng.disableAi();
  for (const b of G.bldgs.filter(b => b.team === K && !b.done)) until(b);
  // (its soldiers would fall on the Bot that builds the base: hired Sellswords take them out of the picture, then leave)
  const soldiers = () => G.units.filter(u => u.team === K && !eng.UNITS[u.type].worker && u.type !== 'observer');
  const hired = [0, 1, 2, 3, 4, 5].map(i => spawn(X, 'prism', { x: hq.x + 200 + i * 14, y: hq.y - 200 }));
  for (let i = 0; i < 90; i++) {
    const g = soldiers()[0];
    for (const id of hired) if (byId(id)) { if (g) eng.attackEnt(byId(id), g); else eng.moveTo(byId(id), hq.x + 650, hq.y - 650); }
    e.skip(1);
  }
  for (const id of hired) if (byId(id)) eng.moveTo(byId(id), hq.x + 2000, hq.y - 2000);
  e.skip(25);
  e.bars(false);
  const want = { x: hq.x + 352, y: hq.y + 48 };
  const scout = spawn(X, 'lumen', want); e.skip(0.3); // (placing needs the ground seen: a Bot looks, then leaves)
  const s = spot(X, 'conflux', want), d = eng.BUILDINGS.conflux;
  eng.moveTo(byId(scout), want.x + 1500, want.y - 1500); e.skip(20);
  const dc = { x: (s[0] + d.w / 2) * 32, y: (s[1] + d.h / 2) * 32, tx: s[0], ty: s[1] };
  const u = { x: -Math.SQRT1_2, y: Math.SQRT1_2 };
  const stare = [0, 1, 2, 3].map(i => { const f = 104 + (i % 2) * 24, w = (i - 1.5) * 26; return { x: dc.x + u.x * f - u.y * w, y: dc.y + u.y * f + u.x * w }; });
  for (const p of stare) spawn(K, 'harvester', p);
  e.skip(0.5);
  window.S.arrival = { dc };
  return { hq: { x: hq.x, y: hq.y }, mine: { x: m.x, y: m.y }, dc, look: { x: (hq.x + dc.x) / 2 + 10, y: (hq.y + dc.y) / 2 + 40 },
    info: { hq: [hq.x, hq.y], dc: [dc.x, dc.y], bldgs: G.bldgs.filter(b => b.team === K).map(b => [b.type, b.x - hq.x, b.y - hq.y]) } };
}
/** The landing itself, between two frames (under the white): a Bot builds the base (its build time passes now) and leaves. */
function land() {
  const { e, G, eng, X, spawn, byId } = window.S, { dc } = window.S.arrival;
  const bot = spawn(X, 'lumen', { x: dc.x + 80, y: dc.y - 30 }); e.skip(0.2);
  const err = eng.placeBuilding(X, 'conflux', dc.tx, dc.ty, byId(bot));
  if (err) throw new Error(`the base: ${err}`);
  for (let i = 0; i < 120; i++) { e.skip(1); if (G.bldgs.some(b => b.type === 'conflux' && b.tx === dc.tx && b.ty === dc.ty && b.done)) break; }
  eng.moveTo(byId(bot), dc.x + 1400, dc.y - 1400);
  e.skip(8);
  G.events.length = 0; // (the building's sounds: not heard; the warp has its own)
  return true;
}

/** DAY 2 and the raid: the Expedition's start as its own AI built it by about `until` seconds (its base, Bots on the
 *  thorium mine; its AI then stops, its Bots mine on), playing the Kingdom, so the Riders take orders. Wind turbines
 *  and the rest are the AI's own. */
function xbaseScene({ until: T = 170 }) {
  const { e, G, eng, X, hqOf, mineOf } = window.S;
  e.skip(T);
  eng.disableAi();
  e.bars(false);
  const hq = hqOf(X), m = mineOf(X), n = {};
  for (const u of G.units.filter(u => u.team === X)) n[u.type] = (n[u.type] || 0) + 1;
  return { hq: { x: hq.x, y: hq.y }, mine: { x: m.x, y: m.y }, mid: { x: (hq.x + m.x) / 2, y: (hq.y + m.y) / 2 },
    info: { hq: [hq.x, hq.y], mine: [m.x - hq.x, m.y - hq.y], units: n, bldgs: G.bldgs.filter(b => b.team === X).map(b => [b.type, b.x - hq.x, b.y - hq.y, b.done]) } };
}
/** The raid: six Riders (ours) from past the frame's edge, toward the Kingdom, ride at the mine road; `lead` seconds
 *  pass unseen, so they are at the frame's edge when the shot starts. */
function ride({ from, lead }) {
  const { e, G, eng, K, X, hqOf, mineOf, spawn, byId } = window.S;
  const hq = hqOf(X), m = mineOf(X), road = { x: m.x + (hq.x - m.x) * 0.45, y: m.y + (hq.y - m.y) * 0.45 };
  const ids = [0, 1, 2, 3, 4, 5].map(i => spawn(K, 'rider', { x: road.x + from.x + (i % 2) * 34, y: road.y + from.y + (i - 2.5) * 30 }));
  for (const id of ids) eng.attackMove(byId(id), road.x, road.y);
  e.skip(lead); e.bars(true); G.events.length = 0;
  return ids.map(id => { const u = byId(id); return u && [Math.round(u.x - road.x), Math.round(u.y - road.y)]; });
}

/** The King's card: the Kingdom at 2:30, its Villagers on the mine road, the Castle and its banner. */
function castleScene() {
  const { e, G, K, hqOf, mineOf, spawn, gather } = window.S;
  const hq = hqOf(K), m = mineOf(K);
  for (let i = 0; i < 8; i++) spawn(K, 'harvester', { x: hq.x - 60 + i * 16, y: hq.y - 90 });
  for (const w of window.S.workers(K)) { gather(K, [w]); e.skip(0.6); }
  e.skip(150 - G.time); e.bars(false);
  return { hq: { x: hq.x, y: hq.y }, mine: { x: m.x, y: m.y } };
}

/** The muster (the storyboard's): a Barracks, a Blacksmith and Cottages by the Castle, an army drawn up in ranks in
 *  front (Guards, Archers behind, Knights on a flank, a Cannon); `march` sends it off. */
function musterScene() {
  const { e, G, eng, K, hqOf, spawn, place, gather, toward } = window.S;
  const hq = hqOf(K), mid = { x: eng.MW * 16, y: eng.MH * 16 }, at = (f, s) => toward(K, mid, f, s);
  gather(K); e.setResources(K, 9000, 0);
  for (let i = 0; i < 4; i++) spawn(K, 'harvester', at(-60, (i - 1.5) * 30));
  place(K, 'depot', at(-150, -160)); place(K, 'depot', at(-150, 150)); place(K, 'barracks', at(150, -230));
  e.skip(70); place(K, 'forge', at(150, 250)); e.skip(70); gather(K);
  const ids = [];
  for (let i = 0; i < 10; i++) ids.push(spawn(K, 'trooper', at(330 + Math.floor(i / 5) * 34, (i % 5 - 2) * 34)));
  for (let i = 0; i < 6; i++) ids.push(spawn(K, 'lancer', at(270 - Math.floor(i / 3) * 30, (i % 3 - 1) * 40)));
  for (let i = 0; i < 4; i++) ids.push(spawn(K, 'knight', at(340 - (i % 2) * 40, 130 + Math.floor(i / 2) * 40)));
  ids.push(spawn(K, 'siegeTank', at(215, -120)));
  if (200 > G.time) e.skip(200 - G.time);
  e.bars(false);
  window.S.muster = { ids, goal: at(1500, 0) };
  return { hq: { x: hq.x, y: hq.y }, look: at(190, 0) };
}
function march() { const { eng, byId } = window.S, { ids, goal } = window.S.muster; for (const id of ids) if (byId(id)) eng.moveTo(byId(id), goal.x, goal.y); }

/** The armies meet in open country (cut 3's, `k` times the numbers for the last shot: the war): the Kingdom's line
 *  (Guards, Archers, Knights on the flank, Cannons set up behind, Ballistas and a Balloon in the large one)
 *  attack-moves into the Expedition's (Sellswords and Bruisers in front, Androids and Rovers behind, Buggies on a wing,
 *  Drones over), which holds; `lead` seconds pass unseen. */
function fightScene({ k = 1, lead = 0.7, gap = 0 }) {
  const { e, G, eng, K, X, spawn, byId } = window.S;
  const meet = { x: 2140, y: 1970 }, p = (f, s) => ({ x: meet.x + f + Math.sign(f) * gap, y: meet.y + s });
  const n = (c) => Math.round(c * k), rows = (c, per) => Math.ceil(n(c) / per), ids = [];
  const block = (team, kind, c, per, f0, df, ds, s0 = 0) => { const out = []; for (let i = 0; i < n(c); i++) { const r = Math.floor(i / per), j = i % per, w = Math.min(per, n(c) - r * per); out.push(spawn(team, kind, p(f0 + r * df, s0 + (j - (w - 1) / 2) * ds + (r % 2) * 8))); } return out; };
  const big = k > 1.5;
  ids.push(...block(K, 'trooper', 8, big ? 10 : 4, -120, -28, 34));
  ids.push(...block(K, 'lancer', 6, big ? 8 : 3, -120 - rows(8, big ? 10 : 4) * 28 - 20, -26, 40));
  ids.push(...block(K, 'knight', 4, 2, -140, -30, 32, big ? 250 : 140));
  if (big) ids.push(...block(K, 'knight', 2, 2, -140, -30, 32, -250));
  const back = -120 - (rows(8, big ? 10 : 4) + rows(6, big ? 8 : 3)) * 28 - 50;
  const cannons = block(K, 'siegeTank', 2, 4, back, 0, big ? 120 : 110);
  if (big) { ids.push(...block(K, 'bastion', 1, 2, back + 40, 0, 330)); spawn(K, 'observer', p(-170, -60)); }
  block(X, 'prism', 6, big ? 8 : 3, 100, 26, 42);
  block(X, 'bruiser', 3, big ? 4 : 3, 100, 30, 40, big ? 230 : 120);
  block(X, 'umbra', 2, big ? 6 : 2, 100 + rows(6, big ? 8 : 3) * 26 + 40, 30, 60);
  block(X, 'monolith', 1, 3, 100 + rows(6, big ? 8 : 3) * 26 + 110, 0, 130);
  block(X, 'scythe', 3, big ? 4 : 3, 140, 30, 36, big ? -250 : -150);
  block(X, 'shrike', 4, big ? 6 : 4, 60, 44, 56);
  eng.castAbility(cannons.map(byId), 'deploy'); e.skip(3);
  const goal = p(420, 0);
  for (const id of ids) if (byId(id)) eng.attackMove(byId(id), goal.x, goal.y);
  e.skip(lead); G.events.length = 0;
  return { meet, look: p(10, 0) };
}

/** Drones against a Watchtower by a Castle (the docs' clip's staging, tools/docs/shots.mjs `towerRaid`, on Sunken
 *  Court inside the Data center's coverage: a second Castle of ours with the tower some twelve tiles from the Data
 *  center), run `lead` seconds unseen: the Drones on the tower from three sides, Archers and a Ballista walking in from
 *  the bottom right to shoot them down. `late` (DAY 675): the same ground grown into a front: a second Watchtower,
 *  Knights, Archers, Ballistas, a Cannon and a Balloon of ours against Drones in numbers, Rovers, Androids and Buggies
 *  from the Data center's side. */
function towerScene({ late = false, lead = 3, towerHp = 340 }) {
  const { e, G, eng, K, X, hqOf, spawn, toward, workers, byId } = window.S;
  const T = 32, dc = hqOf(X), mid = { x: eng.MW * 16, y: eng.MH * 16 };
  const done = (b) => { for (let i = 0; i < 150 && !b.done; i++) e.skip(1); return b; };
  const put = (type, near, builder) => {
    const d = eng.BUILDINGS[type], tx0 = Math.round(near.x / T - d.w / 2), ty0 = Math.round(near.y / T - d.h / 2);
    for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !eng.canPlace(type, tx0 + dx, ty0 + dy, K)) continue;
      const err = eng.placeBuilding(K, type, tx0 + dx, ty0 + dy, builder); if (err) continue;
      return G.bldgs.find(b => b.team === K && b.type === type && b.tx === tx0 + dx && b.ty === ty0 + dy);
    }
    throw new Error(`tower: no spot for a ${type}`);
  };
  e.setResources(K, 20000, 0);
  done(put('barracks', toward(K, mid, -140, 170), workers(K)[0])); // (the tower needs a Barracks: one at home)
  const want = { x: dc.x + 12 * T, y: dc.y - 5 * T };
  const mason = spawn(K, 'harvester', { x: want.x + 2.5 * T, y: want.y + 1.5 * T }); e.skip(0.3);
  done(put('core', { x: want.x + 5 * T, y: want.y + 0.3 * T }, byId(mason)));
  const tower = done(put('turret', want, byId(mason)));
  const tower2 = late ? done(put('turret', { x: want.x + 0.5 * T, y: want.y + 5.5 * T }, byId(mason))) : null;
  eng.moveTo(byId(mason), hqOf(K).x, hqOf(K).y); e.skip(5);
  const at = (dx, dy) => ({ x: tower.x + dx * T, y: tower.y + dy * T });
  const f = at(2.5, -0.5);
  if (!late) {
    eng.debugSetHp(tower, towerHp);
    const gate = { x: f.x + 9.6 * T, y: f.y + 4.9 * T }, post = at(2.6, 2.2);
    const guard = [spawn(K, 'bastion', { x: gate.x - 0.4 * T, y: gate.y - 0.3 * T })];
    for (let i = 0; i < 4; i++) guard.push(spawn(K, 'lancer', { x: gate.x + (0.9 + Math.floor(i / 2) * 0.9) * T, y: gate.y + ((i % 2) - 0.5) * 0.9 * T }));
    const wave = (ps) => { for (const [dx, dy] of ps) spawn(X, 'shrike', at(dx, dy)); };
    wave([[-1.6, -1.0], [1.7, -1.9], [0.5, 1.9], [-6.9, -0.6], [-6.6, 0.7], [-6.7, 1.8]]);
    guard.forEach((id, i) => {
      if (!i) eng.moveTo(byId(id), post.x + 0.9 * T, post.y - 0.3 * T);
      else eng.moveTo(byId(id), post.x - (0.4 + Math.floor((i - 1) / 2) * 0.9) * T, post.y + ((i % 2) - 0.5) * 0.9 * T);
    });
    e.skip(0.4); wave([[-5.8, -4.2], [-4.6, -5.1]]); e.skip(0.4); wave([[2.5, 6.4]]);
    e.skip(Math.max(0, lead - 0.8));
  } else {
    const ours = [];
    for (let i = 0; i < 6; i++) ours.push(spawn(K, 'knight', at(1.5 + (i % 2) * 1.1, 1.2 + Math.floor(i / 2) * 1.1)));
    for (let i = 0; i < 8; i++) ours.push(spawn(K, 'lancer', at(3.2 + (i % 2) * 0.9, -1.5 + Math.floor(i / 2) * 0.9)));
    const still = [spawn(K, 'bastion', at(2.6, 3.4)), spawn(K, 'bastion', at(2.2, 7.4))];
    const cannon = spawn(K, 'siegeTank', at(4.4, 4.6));
    spawn(K, 'observer', at(1.2, -2.6));
    eng.castAbility([byId(cannon)], 'deploy'); e.skip(3);
    for (let i = 0; i < 12; i++) spawn(X, 'shrike', at(-3.4 - (i % 3) * 1.3, -3.6 + Math.floor(i / 3) * 2.2 + (i % 2) * 0.5));
    for (let i = 0; i < 6; i++) spawn(X, 'umbra', at(-7.2 - (i % 2) * 1.1, -1.2 + Math.floor(i / 2) * 2.0));
    for (let i = 0; i < 3; i++) spawn(X, 'monolith', at(-10.2, -1.4 + i * 3.0));
    for (let i = 0; i < 4; i++) spawn(X, 'scythe', at(-6.2 - (i % 2) * 1.2, 5.4 + Math.floor(i / 2) * 1.2));
    for (const id of ours) eng.attackMove(byId(id), at(-7, 2).x, at(-7, 2).y);
    void still;
    e.skip(lead);
  }
  G.events.length = 0;
  return { f, tower: { x: tower.x, y: tower.y }, tower2: tower2 && { x: tower2.x, y: tower2.y }, front: at(-2.2, 2.4), info: { dc: [dc.x, dc.y], tower: [tower.x, tower.y], drones: G.units.filter(u => u.type === 'shrike').length } };
}

/** DAY 675, the base: the Expedition's start built up (played as the Expedition): Recruiting post, Factory, Lab,
 *  Uplink, Portal, Wind turbines, Substations, Sentry masts, each where `LAYOUT` says (px from the Data center, toward
 *  the map's middle and across), Bots on the mine; then Rovers, Androids and Buggies roll out toward the middle, Drones
 *  over them (`lead` seconds unseen). */
function lateBaseScene({ layout, column, lead }) {
  const { e, G, eng, X, hqOf, mineOf, spawn, byId, spot, toward, gather } = window.S;
  const hq = hqOf(X), m = mineOf(X), mid = { x: eng.MW * 16, y: eng.MH * 16 }, at = (f, s) => toward(X, mid, f, s);
  e.setResources(X, 90000, 0);
  for (let i = 0; i < 8; i++) spawn(X, 'lumen', { x: hq.x + (m.x - hq.x) * 0.4 + i * 10, y: hq.y + (m.y - hq.y) * 0.4 });
  gather(X);
  const placed = [];
  for (const [type, f, s] of layout) {
    const p = at(f, s), bot = spawn(X, 'lumen', { x: p.x + 46, y: p.y + 30 }); e.skip(0.3);
    const sp = spot(X, type, p, 6); if (!sp) { placed.push([type, 'no spot']); continue; }
    const err = eng.placeBuilding(X, type, sp[0], sp[1], byId(bot)); if (err) { placed.push([type, err]); continue; }
    const b = G.bldgs.find(b => b.type === type && b.tx === sp[0] && b.ty === sp[1]);
    for (let i = 0; i < 200 && !b.done; i++) e.skip(1);
    eng.startGather(byId(bot), m);
    placed.push([type, Math.round(b.x - hq.x), Math.round(b.y - hq.y)]);
  }
  e.skip(20); e.bars(false);
  const ids = column.map(([kind, f, s]) => spawn(X, kind, at(f, s)));
  const goal = at(1500, 0);
  for (const id of ids) eng.moveTo(byId(id), goal.x, goal.y);
  e.skip(lead); G.events.length = 0;
  return { hq: { x: hq.x, y: hq.y }, look: at(150, 0), info: { hq: [hq.x, hq.y], mine: [m.x - hq.x, m.y - hq.y], placed } };
}

// ---- the overlays' pieces ----
const LANDING_CAM = still('look', 1.5);
/** Where the warp opens: over the base (a little above its ground point: the building's middle). */
const warpAt = (a) => { const p = onScreen(a.dc, LANDING_CAM(0, a)); return { x: p.x, y: p.y - 34 }; };
function openOverlay(t, f, st) {
  const Y = TEXT.year.lines[0], w = warpAt(st.a), o = {};
  if (t < WARP_T) {
    const k = ease((t - GROW_T) / (WARP_T - GROW_T));
    o.black = { alpha: 1, text: typed(Y.text, Y.times, t), cursor: t < GROW_T && (t < Y.times.at(-1) + 0.1 ? t > 0.15 : blink(t)), textAlpha: 1 - ease((t - GROW_T) / 0.5) };
    if (t >= GROW_T) o.warp = { ...w, k: 0.04 + 1.5 * k * k, alpha: 1 };
    o.white = clamp01((t - (WARP_T - 0.2)) / 0.17);
  } else {
    const u = t - WARP_T;
    o.white = u < 3 / 30 ? 1 : 1 - ease((u - 0.1) / 0.75);
    if (u < 1.3) o.ring = { ...w, r: 60 + 620 * (1 - (1 - u / 1.3) ** 2), alpha: (1 - u / 1.3) ** 1.5 };
    o.diary = diary(TEXT.day1, t);
  }
  return o;
}
/** The late-game caption: typed over the first cut, there to the last frame (`t0`: this part's start, seconds after the first cut's). */
const lateCap = (t0) => (t) => { const T = TEXT.day675, l = T.lines[0], u = t + t0; return { cap: { day: u >= T.dayAt ? T.day : '', text: typed(l.text, l.times, u), cursor: u <= l.times.at(-1) + 0.08 || blink(u), alpha: 1 } }; };
const LATE2_AT = lengthOf('late1') / FPS, LATE3_AT = LATE2_AT + lengthOf('late2') / FPS;

/** The late base's plan: [type, toward the middle, across] px from the Data center, in building order (each needs the
 *  ones before it), and the column that rolls out: [kind, toward, across]. */
const LAYOUT = [
  ['siphon', 40, -230], ['substation', -90, -190], ['substation', -150, -110],
  ['kiln', 250, -190], ['loom', 150, -290], ['uplink', 120, 250], ['eclipse', 290, 170],
  ['spire', -40, 200], ['spire', 30, 150], ['spire', -110, 140], ['spire', 190, 110], ['spire', 380, -80],
  ['ward', 400, 60], ['ward', 330, -300], ['substation', 240, 300],
];
const COLUMN = [['monolith', 330, -10], ['monolith', 250, 20], ['umbra', 190, -30], ['umbra', 180, 30], ['umbra', 130, 0], ['umbra', 120, 55],
  ['scythe', 420, 30], ['scythe', 460, -30], ['shrike', 380, -70], ['shrike', 420, 80], ['shrike', 340, 70], ['shrike', 300, -80], ['shrike', 460, 10]];

// ---- the segments ----
export const SEGMENTS = [
  { id: 'landing', as: 'vael', ai: true, scene: landingScene, parts: [
    { name: 'open', seconds: secs('open'), cam: LANDING_CAM, ticks: (t) => (t < WARP_T ? 1 : 1), at: [{ t: WARP_T, run: (page) => page.evaluate(land) }], overlay: openOverlay },
  ] },
  { id: 'xbase', as: 'humans', ai: true, scene: xbaseScene, args: { until: 170 }, parts: [
    { name: 'day2', seconds: secs('day2'), cam: still('mid', 1.7), overlay: (t) => ({ diary: diary(TEXT.day2, t) }) },
    { name: 'raid', seconds: secs('raid'), cam: still('mid', 1.6), pre: (page) => page.evaluate(ride, { from: { x: -430, y: 0 }, lead: 1.0 }) },
  ] },
  { id: 'king', as: 'humans', scene: castleScene, parts: [
    // (the first two lines are there with the music's first beat; "I will not abide it." on its fourth, the name on its fifth)
    { name: 'king', seconds: secs('king'), cam: still('hq', 2.15, { x: -118, y: -22 }),
      overlay: (t) => ({ king: { shade: 1, lines: [fadeIn(t, 0, 0.2), fadeIn(t, 0.1, 0.25), fadeIn(t, 2.11, 0.25)], tag: fadeIn(t, 2.81, 0.3) } }) },
  ] },
  { id: 'muster', as: 'humans', scene: musterScene, parts: [{ name: 'muster', seconds: secs('muster'), cam: still('look', 1.45), at: [{ t: 0.9, run: (page) => page.evaluate(march) }] }] },
  { id: 'fight', as: 'humans', scene: fightScene, args: { k: 1, lead: 0.9 }, parts: [{ name: 'fight', seconds: secs('fight'), cam: still('look', 1.3) }] },
  { id: 'tower', as: 'humans', map: 'court', scene: towerScene, args: { lead: 3.2 }, parts: [{ name: 'tower', seconds: secs('tower'), cam: still('f', 1.7) }] },
  { id: 'late1', as: 'vael', scene: lateBaseScene, args: { layout: LAYOUT, column: COLUMN, lead: 0.6 }, parts: [{ name: 'late1', seconds: secs('late1'), cam: still('look', 1.2), overlay: lateCap(0) }] },
  { id: 'late2', as: 'humans', map: 'court', scene: towerScene, args: { late: true, lead: 1.6 }, parts: [{ name: 'late2', seconds: secs('late2'), cam: still('front', 1.3), overlay: lateCap(LATE2_AT) }] },
  { id: 'late3', as: 'humans', scene: fightScene, args: { k: 2.4, lead: 2.2, gap: 30 }, parts: [
    // (a short pull-back, eased, inside the game's own range; it stops mid-battle)
    { name: 'late3', seconds: secs('late3', 0), cam: (t, a) => ({ x: a.look.x, y: a.look.y, zoom: lerp(1.22, 1.02, ease(t / 2.4)) }), overlay: lateCap(LATE3_AT) },
    // The end card, a hard cut: the last frame held, graded and veiled at once; the logo on the chord, the line and the address after.
    { name: 'card', seconds: secs('card', 0), freeze: true, overlay: (t) => ({ grade: 1, veil: 1, card: { logo: fadeIn(t, 0, 0.12), line: fadeIn(t, 0.7, 0.3), url: fadeIn(t, 1.4, 0.3) } }) },
  ] },
];
