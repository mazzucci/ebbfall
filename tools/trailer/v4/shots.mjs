// Cut 4's shot list ("Day 675", 16:9 only; cut 5 is the same with the landing at the Expedition's own start), as data for tools/trailer/record.mjs `recordSegment` (see tools/trailer/shots.mjs
// for a segment's shape): each segment one staged game page, each part a file, a little longer than the cut needs
// (script.mjs CUT trims it). Every camera is locked (one eased pull-back, on the last shot). The scenes use the debug
// handle only (window.S, stage.mjs). Dust Quarter, but the Watchtower's two (Sunken Court, as the docs' clip).
import { FPS, TEXT, typed, GROW_T, WARP_T, ROLL_AT, THORIUM_AT, DONE_AT, lengthOf } from './script.mjs';

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

/** Cut 6's opening ground: a field by a thorium mine far from both starts (`mine`: the node's place on Dust Quarter;
 *  the Expedition's own start, where the game puts its Data center, is 1,400 px east, the Kingdom's 2,600 px away):
 *  where the base will stand (`site`: the free spot nearest `off` px from the mine), on window.S.field. */
function fieldOf({ mine, off }) {
  const { e, eng, X, spawn, spot, byId } = window.S;
  const m = e.map.nodes.find(n => n.x === mine[0] && n.y === mine[1]); if (!m) throw new Error('field: no such mine');
  const want = { x: m.x + off[0], y: m.y + off[1] };
  const scout = spawn(X, 'lumen', want); e.skip(0.5); // (placing needs the ground seen)
  const s = spot(X, 'conflux', want), d = eng.BUILDINGS.conflux; if (!s) throw new Error('field: no spot for the base');
  eng.moveTo(byId(scout), want.x + 1800, want.y); e.skip(25); // (it goes home, far out of every frame)
  return (window.S.field = { m, tx: s[0], ty: s[1], site: { x: (s[0] + d.w / 2) * 32, y: (s[1] + d.h / 2) * 32 } });
}
/** DAY 1 (cut 6): the warp lands only a crew of six Bots on the empty field: no building in sight, the mine out of
 *  the frame. `scout` sends them out, each its own way. */
function landingScene(arg) {
  const { e, G, spawn } = window.S, { site } = (0, eval)(`(${arg.fieldOf})`)(arg);
  const spots = [[-52, -22], [8, -40], [58, 2], [-30, 34], [28, 50], [-84, 26]];
  const ids = spots.map(([dx, dy]) => spawn(window.S.X, 'lumen', { x: site.x + dx, y: site.y + dy }));
  e.skip(2); e.bars(false); G.events.length = 0;
  window.S.crew = { ids, site };
  return { dc: site, look: { x: site.x - 45, y: site.y + 60 }, info: { site: [site.x, site.y], near: window.S.census(site, 900) } }; // (at zoom 1.7 the frame stops short of the mines south-west and south-east of the field)
}
function scout() {
  const { eng, byId } = window.S, { ids, site } = window.S.crew;
  const to = [[-760, -160], [120, -700], [760, -60], [-640, 420], [640, 420], [-800, 120]];
  ids.forEach((id, i) => { const u = byId(id); if (u) eng.moveTo(u, site.x + to[i][0], site.y + to[i][1]); });
}

/** DAY 2 (cut 6): the Bots build the Data center on that field, the mine above it. `builders` Bots work on the site
 *  (every Bot at work adds its share: that is the game's rule, and the staging's only speed-up), `idle` more stand by;
 *  nothing overrides the build time: the shot starts with the site partly built (`siteReady`), so that at the game's
 *  own speed it stands `doneAt` seconds in, `leave` of the builders and the idle ones having gone to the mine at
 *  `leaveAt` (`toMine`). */
function siteScene(arg) {
  const { e, G, eng, X, spawn, byId } = window.S, { m, tx, ty, site } = (0, eval)(`(${arg.fieldOf})`)(arg);
  const { builders, idle, leave, leaveAt, doneAt } = arg;
  e.setResources(X, 2000, 0);
  const bs = Array.from({ length: builders }, (_, i) => spawn(X, 'lumen', i % 2 ? { x: site.x - 50 + i * 24, y: site.y + 94 } : { x: site.x - 96, y: site.y - 56 + i * 26 }));
  const waiting = Array.from({ length: idle }, (_, i) => spawn(X, 'lumen', { x: site.x - 160 - i * 30, y: site.y - 70 + i * 34 }));
  e.skip(0.4);
  const err = eng.placeBuilding(X, 'conflux', tx, ty, byId(bs[0])); if (err) throw new Error(`site: ${err}`);
  const b = G.bldgs.find(b => b.type === 'conflux' && b.tx === tx && b.ty === ty);
  for (const id of bs.slice(1)) eng.startBuild(byId(id), b);
  // on to 45% with everyone at work, measuring a tick's progress; `siteReady` (once the recorder holds the clock, so
  // not a tick passes unseen after it) runs it on to where the shot must start
  let rate = 0, prev = b.progress;
  for (let t = 0; t < 9000 && b.progress < 0.45; t++) { e.skip(1 / 30); rate = Math.max(rate, b.progress - prev); prev = b.progress; }
  e.bars(false);
  window.S.siteCrew = { m, b, rate, gone: [...bs.slice(builders - leave), ...waiting], arg };
  return { site, mine: { x: m.x, y: m.y }, info: { site: [site.x, site.y], mine: [m.x - site.x, m.y - site.y], rate30: +(rate * 30).toFixed(4), near: window.S.census(site, 900) } };
}
/** Run the site on, unseen, until what is left of it is what the shot will build: every builder's share until `leaveAt`,
 *  the remaining ones' until `doneAt`, at the game's own rate. Returns the progress the shot starts at. */
function siteReady() {
  const { e, G } = window.S, { b, rate, arg: { builders, leave, leaveAt, doneAt } } = window.S.siteCrew;
  const left = rate * 30 * (leaveAt * builders + (doneAt - leaveAt) * (builders - leave)) / builders;
  for (let t = 0; t < 3000 && b.progress < 1 - left; t++) e.skip(1 / 30);
  G.events.length = 0;
  return +b.progress.toFixed(4);
}
function toMine() { const { eng, byId } = window.S, { m, gone } = window.S.siteCrew; for (const id of gone) if (byId(id)) eng.startGather(byId(id), m); }
/** Each Data center: whether it stands, and how far along it is (the record's log). */
function siteState() { return window.S.G.bldgs.filter(b => b.type === 'conflux').map(b => [b.done, +b.progress.toFixed(3)]); }

/** DAY 2 and the raid: the Expedition's start a day in (played as the Expedition): the base, a Recruiting post out of
 *  frame (the turbines need it), two Wind turbines west of the mine road (`turbines`: px from the base), Bots on the
 *  thorium mine, their trips out of step, two Androids standing by the mine. */
function xbaseScene({ turbines, androids = true }) {
  const { e, G, eng, X, hqOf, mineOf, spawn, spot, byId, gather, workers } = window.S;
  const hq = hqOf(X), m = mineOf(X);
  e.setResources(X, 5000, 0);
  const put = (type, dx, dy) => {
    const p = { x: hq.x + dx, y: hq.y + dy }, bot = spawn(X, 'lumen', { x: p.x + 46, y: p.y + 30 }); e.skip(0.3);
    const sp = spot(X, type, p, 6); if (!sp) throw new Error(`xbase: no spot for ${type}`);
    const err = eng.placeBuilding(X, type, sp[0], sp[1], byId(bot)); if (err) throw new Error(`xbase: ${type}: ${err}`);
    const b = G.bldgs.find(b => b.type === type && b.tx === sp[0] && b.ty === sp[1]);
    for (let i = 0; i < 200 && !b.done; i++) e.skip(1);
    return [type, b.x - hq.x, b.y - hq.y];
  };
  const placed = [put('siphon', 260, 30), ...turbines.map(([dx, dy]) => put('spire', dx, dy))];
  for (let i = 0; i < 4; i++) spawn(X, 'lumen', { x: hq.x - 90 + i * 16, y: hq.y - 100 });
  for (const w of workers(X)) { gather(X, [w]); e.skip(0.6); }
  if (androids) { spawn(X, 'umbra', { x: m.x - 96, y: m.y + 34 }); spawn(X, 'umbra', { x: m.x - 132, y: m.y + 74 }); } // (cut 4; cut 5 has only Bots before the King's card)
  e.skip(40); e.bars(false); G.events.length = 0;
  return { hq: { x: hq.x, y: hq.y }, mine: { x: m.x, y: m.y }, info: { hq: [hq.x, hq.y], mine: [m.x - hq.x, m.y - hq.y], placed, near: window.S.census(hq, 900) } };
}
/** The raid: six Riders of the Kingdom's appear `from` (px from the base) and, idle, fall on the Bots in their sight
 *  (the sim takes no orders for the other seat); `lead` seconds pass unseen, so they are riding when the shot starts. */
function ride({ from, lead }) {
  const { e, G, eng, K, X, hqOf, spawn, byId } = window.S, hq = hqOf(X);
  // (the Androids would be the nearest thing to ride at, and the raid is on the mine: they are sent off first)
  for (const u of G.units.filter(u => u.team === X && u.type === 'umbra')) eng.moveTo(u, hq.x + 420, hq.y + 260);
  e.skip(6);
  const ids = [0, 1, 2, 3, 4, 5].map(i => spawn(K, 'rider', { x: hq.x + from.x - (i % 2) * 34, y: hq.y + from.y + (i - 2.5) * 30 }));
  e.skip(lead); e.bars(true); G.events.length = 0;
  return ids.map(id => { const u = byId(id); return u && [Math.round(u.x - hq.x), Math.round(u.y - hq.y)]; });
}

/** The King's card: the Kingdom at 2:30, its Villagers on the mine road, the Castle and its banner. */
function castleScene() {
  const { e, G, eng, K, hqOf, mineOf, workers } = window.S;
  const hq = hqOf(K), m = mineOf(K);
  // (the mine road runs behind the banner in this frame: the Villagers wait west of it, out of the frame)
  workers(K).forEach((w, i) => eng.moveTo(w, hq.x - 520 - (i % 3) * 30, hq.y + 60 + Math.floor(i / 3) * 30));
  e.skip(20); e.bars(false);
  // (four Guards on their round pass under the gate, right to left: the card is not a still)
  const guards = [0, 1, 2, 3].map(i => window.S.spawn(K, 'trooper', { x: hq.x + 96 + i * 30, y: hq.y + 90 }));
  for (const id of guards) eng.moveTo(window.S.byId(id), hq.x - 600, hq.y + 90);
  e.skip(0.3); G.events.length = 0;
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
function fightScene({ k = 1, kx = k, lead = 0.7, spread = 1 }) {
  const { e, G, eng, K, X, spawn, byId } = window.S;
  const meet = { x: 2140, y: 1970 }, p = (f, s) => ({ x: meet.x + f, y: meet.y + s * spread });
  const big = k > 1.5, ids = [];
  const block = (team, kind, c, per, f0, df, ds, s0 = 0) => { const n = Math.round(c * (team === K ? k : kx)), out = []; for (let i = 0; i < n; i++) { const r = Math.floor(i / per), j = i % per, w = Math.min(per, n - r * per); out.push(spawn(team, kind, p(f0 + r * df, s0 + (j - (w - 1) / 2) * ds + (r % 2) * 8))); } return out; };
  // (the Cannons first: they set up for three seconds, and the lines must not meet meanwhile)
  const cannons = block(K, 'siegeTank', 2, 5, big ? -330 : -235, 0, big ? 84 : 110);
  eng.castAbility(cannons.map(byId), 'deploy'); e.skip(3);
  ids.push(...block(K, 'trooper', 8, big ? 8 : 4, -120, -30, 36));
  ids.push(...block(K, 'lancer', 6, big ? 7 : 3, big ? -215 : -190, -28, 40));
  ids.push(...block(K, 'knight', 4, 2, -140, -32, 32, big ? 185 : 135));
  if (big) { ids.push(...block(K, 'knight', 2, 2, -140, -32, 32, -185)); ids.push(...block(K, 'bastion', 1, 2, -290, 0, 300)); spawn(K, 'observer', p(-200, -70)); }
  block(X, 'prism', 6, big ? 8 : 3, 100, 28, 40);
  block(X, 'bruiser', 3, big ? 4 : 3, 110, 32, 40, big ? 185 : 120);
  block(X, 'umbra', 2, big ? 6 : 2, big ? 215 : 175, 34, 56);
  block(X, 'monolith', 1, 3, big ? 320 : 225, 0, 120);
  block(X, 'scythe', 3, big ? 4 : 3, 150, 34, 38, big ? -185 : -150);
  block(X, 'shrike', 4, big ? 6 : 4, 60, 46, 54);
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
    spawn(K, 'observer', at(1.4, -1.5));
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
 *  Uplink, Portal, Wind turbines, Substations, Sentry masts, each where `LAYOUT` says (px from the Data center), Bots on the mine; then Rovers, Androids and Buggies roll out toward the middle, Drones
 *  over them (`lead` seconds unseen). */
function lateBaseScene({ layout, column, lead }) {
  const { e, G, eng, X, hqOf, mineOf, spawn, byId, spot, toward, gather } = window.S;
  const hq = hqOf(X), m = mineOf(X), at = (dx, dy) => ({ x: hq.x + dx, y: hq.y + dy });
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
  const goal = at(-1400, 620);
  for (const id of ids) eng.moveTo(byId(id), goal.x, goal.y);
  e.skip(lead); G.events.length = 0;
  return { hq: { x: hq.x, y: hq.y }, look: at(-90, 70), info: { hq: [hq.x, hq.y], mine: [m.x - hq.x, m.y - hq.y], placed } };
}

// ---- the overlays' pieces ----
const LANDING_CAM = still('look', 1.7);
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

/** The late base's plan: [type, dx, dy] px from the Data center (the Expedition's start on Dust Quarter: the mine
 *  north of it, forest from some 400 px west), in building order (each needs the ones before it), and the column that
 *  rolls out south-west: [kind, dx, dy]. */
const LAYOUT = [
  ['siphon', 140, 100], ['substation', 60, 190], ['kiln', -170, 90], ['loom', -170, -90], ['uplink', -330, 110], ['eclipse', -300, -40],
  ['spire', 130, -70], ['spire', 200, 10], ['spire', -60, 170], ['spire', -250, -130], ['spire', -140, -150],
  ['ward', -250, 200], ['ward', 220, 130], ['substation', -350, -130],
];
const COLUMN = [['monolith', -230, 170], ['monolith', -300, 190], ['umbra', -300, 30], ['umbra', -345, 55], ['umbra', -262, 48], ['umbra', -385, 85],
  ['scythe', 20, 120], ['scythe', 85, 150], ['shrike', -60, -60], ['shrike', -20, -20], ['shrike', 40, -90], ['shrike', -120, -110], ['shrike', 100, -40]];

/** Cut 6's field: the mine north of the map's middle, the base's spot south of it. */
const FIELD = { mine: [1376, 320], off: [70, 226], fieldOf: fieldOf.toString() };

const SITE_OFF = [240, 40];

// ---- the segments ----
export const SEGMENTS = [
  { id: 'landing', as: 'vael', scene: landingScene, args: FIELD, parts: [
    { name: 'open', seconds: secs('open'), cam: LANDING_CAM, at: [{ t: ROLL_AT, run: (page) => page.evaluate(scout) }], overlay: openOverlay },
  ] },
  // (the site east of the mine, level with it, so the whole Data center, gantry and flags, stands above the diary's band)
  { id: 'site', as: 'vael', scene: siteScene, args: { ...FIELD, off: SITE_OFF, builders: 6, idle: 2, leave: 2, leaveAt: THORIUM_AT, doneAt: DONE_AT }, parts: [
    { name: 'day2', seconds: secs('day2'), cam: still('site', 1.4, { x: -157, y: 36 }), pre: (page) => page.evaluate(siteReady),
      at: [{ t: THORIUM_AT, run: (page) => page.evaluate(toMine) }, ...[3.5, 3.8, 4.1].map(t => ({ t, run: async (page) => console.log(`\n  site at ${t}: ${JSON.stringify(await page.evaluate(siteState))}`) }))],
      overlay: (t) => ({ diary: diary(TEXT.day2, t) }) },
  ] },
  { id: 'xbase', as: 'vael', scene: xbaseScene, args: { turbines: [[-330, -150], [-410, -60]], androids: false }, parts: [
    { name: 'day2v5', seconds: secs('day2'), cam: still('hq', 1.5, { x: -230, y: -110 }), overlay: (t) => ({ diary: diary(TEXT.day2, t) }) }, // (cuts 4 and 5's DAY 2; cut 6's is `site`)
    { name: 'raid', seconds: secs('raid'), cam: still('hq', 1.5, { x: -230, y: -110 }), pre: (page) => page.evaluate(ride, { from: { x: -215, y: -150 }, lead: 0.3 }) },
  ] },
  { id: 'king', as: 'humans', scene: castleScene, parts: [
    // (the first two lines are there with the music's first beat; "I will not abide it." on its fourth, the name on its fifth)
    { name: 'king', seconds: secs('king'), cam: still('hq', 2.15, { x: -118, y: -22 }),
      overlay: (t) => ({ king: { shade: 1, lines: [fadeIn(t, 0, 0.2), fadeIn(t, 0.1, 0.25), fadeIn(t, 2.11, 0.25)], tag: fadeIn(t, 2.81, 0.3) } }) },
  ] },
  { id: 'muster', as: 'humans', scene: musterScene, parts: [{ name: 'muster', seconds: secs('muster'), cam: still('look', 1.45), at: [{ t: 1.2, run: (page) => page.evaluate(march) }] }] },
  { id: 'fight', as: 'humans', scene: fightScene, args: { k: 1, lead: 0.5 }, parts: [{ name: 'fight', seconds: secs('fight'), cam: still('look', 1.3) }] },
  { id: 'tower', as: 'humans', map: 'court', scene: towerScene, args: { lead: 3.2 }, parts: [{ name: 'tower', seconds: secs('tower'), cam: still('f', 1.6, { x: -50, y: 0 }) }] },
  { id: 'late1', as: 'vael', scene: lateBaseScene, args: { layout: LAYOUT, column: COLUMN, lead: 0.15 }, parts: [{ name: 'late1', seconds: secs('late1'), cam: still('look', 1.35), overlay: lateCap(0) }] },
  { id: 'late2', as: 'humans', map: 'court', scene: towerScene, args: { late: true, lead: 1.6 }, parts: [{ name: 'late2', seconds: secs('late2'), cam: still('front', 1.3), overlay: lateCap(LATE2_AT) }] },
  { id: 'late3', as: 'humans', scene: fightScene, args: { k: 2.2, kx: 2.6, lead: 1.4, spread: 1.05 }, parts: [
    // (a short pull-back, eased, inside the game's own range; it stops mid-battle)
    { name: 'late3', seconds: secs('late3', 0), cam: (t, a) => ({ x: a.look.x, y: a.look.y, zoom: lerp(1.22, 1.02, ease(t / 2.4)) }), overlay: lateCap(LATE3_AT) },
    // The end card, a hard cut: the last frame held, graded and veiled at once; the logo on the chord, the line and the address after.
    { name: 'card', seconds: secs('card', 0), freeze: true, overlay: (t) => ({ grade: 1, veil: 1, card: { logo: fadeIn(t, 0, 0.12), line: fadeIn(t, 0.7, 0.3), url: fadeIn(t, 1.4, 0.3) } }) },
  ] },
];
