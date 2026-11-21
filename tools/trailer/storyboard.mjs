// The storyboard's plates (the 40-second trailer's stills, before any recording): each candidate scene staged in the real
// game like the recorder does (stage.mjs, the shot list's scenes in shots.mjs and a few new ones here), its frames
// stepped by hand to the chosen times, and a 1920x1080 PNG taken there with no overlay: target/storyboard/plates/<name>.png.
// tools/trailer/storyboard-compose.mjs lays the cards, the field log, the King's line and the end card over them.
//   node tools/trailer/storyboard.mjs [plate set ...]      (npm run build first; one headless Chromium)
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openStage, game, freeze } from './stage.mjs';
import { capture } from './record.mjs';
import { SEGMENTS } from './shots.mjs';

const out = fileURLToPath(new URL('../../target/storyboard/plates/', import.meta.url));
const VIEW = { width: 960, height: 540 }, FPS = 30, fmt = '16x9';
const seg = (id) => SEGMENTS.find(s => s.id === id);
const still = (k, zoom, dx = 0, dy = 0) => (t, a) => ({ x: a[k].x + dx, y: a[k].y + dy, zoom });

// ---- new scenes (in the page: they read only window.S) ----

/** The Expedition at about 2:30: its Data center, twelve Bots on the thorium mine, their trips out of step. */
function xmineScene() {
  const { e, G, X, hqOf, mineOf, spawn, gather, workers } = window.S;
  const hq = hqOf(X), m = mineOf(X);
  for (let i = 0; i < 8; i++) spawn(X, 'lumen', { x: hq.x - 60 + i * 16, y: hq.y + 90 });
  for (const w of workers(X)) { gather(X, [w]); e.skip(0.6); }
  e.skip(150 - G.time);
  e.bars(false);
  return { hq: { x: hq.x, y: hq.y }, mine: { x: m.x, y: m.y }, mid: { x: (hq.x + m.x) / 2, y: (hq.y + m.y) / 2 } };
}
/** The Kingdom notices: the same, a Kingdom Balloon (unarmed, it only looks) hanging over the mine road. */
function watchScene() {
  const { e, G, eng, X, K, hqOf, mineOf, spawn, gather, workers } = window.S;
  const hq = hqOf(X), m = mineOf(X);
  for (let i = 0; i < 8; i++) spawn(X, 'lumen', { x: hq.x - 60 + i * 16, y: hq.y + 90 });
  for (const w of workers(X)) { gather(X, [w]); e.skip(0.6); }
  e.skip(150 - G.time);
  const mid = { x: (hq.x + m.x) / 2, y: (hq.y + m.y) / 2 }, foe = hqOf(K);
  const len = Math.hypot(foe.x - mid.x, foe.y - mid.y), d = { x: (foe.x - mid.x) / len, y: (foe.y - mid.y) / len };
  const at = { x: m.x + d.x * 170, y: m.y + d.y * 170 };
  spawn(K, 'observer', at);
  e.skip(0.5); e.bars(false);
  return { hq: { x: hq.x, y: hq.y }, mine: { x: m.x, y: m.y }, mid, balloon: at, look: { x: (m.x + at.x) / 2, y: (m.y + at.y) / 2 } };
}
/** The Kingdom's raid: Riders fall on the Bots at the mine (idle, they take what is in reach), two Buggies answer. */
function xraidScene() {
  const { e, G, X, K, hqOf, mineOf, spawn, gather, workers } = window.S;
  const hq = hqOf(X), m = mineOf(X);
  for (let i = 0; i < 8; i++) spawn(X, 'lumen', { x: hq.x - 60 + i * 16, y: hq.y + 90 });
  for (const w of workers(X)) { gather(X, [w]); e.skip(0.6); }
  e.skip(150 - G.time);
  const mid = { x: (hq.x + m.x) / 2, y: (hq.y + m.y) / 2 }, foe = hqOf(K);
  const len = Math.hypot(foe.x - mid.x, foe.y - mid.y), d = { x: (foe.x - mid.x) / len, y: (foe.y - mid.y) / len }, s = { x: -d.y, y: d.x };
  for (let i = 0; i < 6; i++) spawn(K, 'rider', { x: mid.x + d.x * (120 + (i % 2) * 30) + s.x * (i - 2.5) * 30, y: mid.y + d.y * (120 + (i % 2) * 30) + s.y * (i - 2.5) * 30 });
  for (let i = 0; i < 2; i++) spawn(X, 'scythe', { x: hq.x - 90 - i * 30, y: hq.y - 40 + i * 50 });
  e.skip(0.4);
  return { hq: { x: hq.x, y: hq.y }, mine: { x: m.x, y: m.y }, mid };
}
/** The Kingdom arms: a Barracks, a Blacksmith and Cottages by the Castle, Villagers on the mine, and an army drawn up
 *  in ranks in front (Guards, Archers behind, Knights on a flank, two Cannons); `musterMarch` sends it off. */
function musterScene() {
  const { e, G, eng, K, hqOf, spawn, place, gather, toward, until } = window.S;
  const hq = hqOf(K), mid = { x: eng.MW * 16, y: eng.MH * 16 }, at = (f, s) => toward(K, mid, f, s);
  gather(K); e.setResources(K, 9000, 0);
  for (let i = 0; i < 4; i++) spawn(K, 'harvester', at(-60, (i - 1.5) * 30));
  place(K, 'depot', at(-150, -160)); place(K, 'depot', at(-150, 150)); const bar = place(K, 'barracks', at(150, -230));
  e.skip(70); place(K, 'forge', at(150, 250)); e.skip(70); gather(K);
  const ids = [];
  for (let i = 0; i < 10; i++) ids.push(spawn(K, 'trooper', at(330 + Math.floor(i / 5) * 34, (i % 5 - 2) * 34)));
  for (let i = 0; i < 6; i++) ids.push(spawn(K, 'lancer', at(270 - Math.floor(i / 3) * 30, (i % 3 - 1) * 40)));
  for (let i = 0; i < 4; i++) ids.push(spawn(K, 'knight', at(340 - (i % 2) * 40, 130 + Math.floor(i / 2) * 40)));
  ids.push(spawn(K, 'siegeTank', at(215, -120)));
  if (200 > G.time) e.skip(200 - G.time);
  e.bars(false);
  window.S.muster = { ids, goal: at(1500, 0) };
  return { hq: { x: hq.x, y: hq.y }, army: at(290, 20), look: at(190, 0), bar: bar?.x ? { x: bar.x, y: bar.y } : null };
}
function musterMarch() { const { eng, byId } = window.S, { ids, goal } = window.S.muster; for (const id of ids) if (byId(id)) eng.moveTo(byId(id), goal.x, goal.y); }

// ---- the plate sets: one staged page each; `shots`: stills at their times (seconds from the part's start), each with
// its own camera (else the part's) ----
const part = (id, i = 0) => seg(id).parts[i];
const SETS = [
  { id: 'arrival', seg: seg('arrival'), part: part('arrival', 1), shots: [
    { t: 1.0, name: 'field' }, { t: 1.2, name: 'field-wide', cam: (t, a) => ({ x: (a.hq.x + a.dc.x) / 2, y: a.hq.y + 10, zoom: 1.3 }) },
    { t: 1.6, name: 'arrived-wide', cam: (t, a) => ({ x: (a.hq.x + a.dc.x) / 2, y: a.hq.y + 10, zoom: 1.3 }) },
    { t: 2.6, name: 'arrived' }, { t: 4.8, name: 'stare' },
    { t: 4.9, name: 'dc', cam: (t, a) => ({ x: a.dc.x - 150, y: a.dc.y + 10, zoom: 2.0 }) }] },
  { id: 'mine', seg: seg('mine'), part: part('mine'), shots: [
    { t: 0.6, name: 'kmine' },
    { t: 0.8, name: 'castle', cam: (t, a) => ({ x: a.hq.x - 150, y: a.hq.y - 20, zoom: 2.3 }) },
    { t: 0.9, name: 'castle-right', cam: (t, a) => ({ x: a.hq.x + 150, y: a.hq.y - 20, zoom: 2.3 }) },
    { t: 1.0, name: 'castle-low', cam: (t, a) => ({ x: a.hq.x, y: a.hq.y - 90, zoom: 2.3 }) },
    { t: 1.1, name: 'kingdom', cam: (t, a) => ({ x: (a.hq.x + a.mine.x) / 2, y: (a.hq.y + a.mine.y) / 2, zoom: 1.4 }) }],
    scene: function () { const a = (0, eval)('(' + window.__mine + ')')(); const hq = window.S.hqOf(window.S.K); return { ...a, hq: { x: hq.x, y: hq.y } }; }, inject: { __mine: seg('mine').scene.toString() } },
  { id: 'xmine', as: 'vael', scene: xmineScene, part: { seconds: 1.2, cam: still('mid', 1.7) }, shots: [{ t: 1.0, name: 'xmine' }, { t: 1.1, name: 'xmine-close', cam: still('mine', 2.1, -40, 40) }] },
  { id: 'watch', as: 'vael', scene: watchScene, part: { seconds: 1.2, cam: still('look', 1.9) }, shots: [{ t: 1.0, name: 'watch' }, { t: 1.1, name: 'watch-wide', cam: still('mid', 1.5) }] },
  { id: 'xraid', as: 'vael', scene: xraidScene, part: { seconds: 2.2, cam: still('mid', 1.8) }, shots: [{ t: 0.5, name: 'xraid-1' }, { t: 1.3, name: 'xraid-2' }, { t: 2.1, name: 'xraid-3' }] },
  { id: 'muster', as: 'humans', scene: musterScene, part: { seconds: 2.4, cam: still('look', 1.45), at: [{ t: 0.6, run: (page) => page.evaluate(musterMarch) }] }, shots: [{ t: 0.4, name: 'muster' }, { t: 1.6, name: 'muster-march' }, { t: 2.3, name: 'muster-march2' }] },
  { id: 'build', seg: seg('build'), part: part('build'), shots: [{ t: 0.7, name: 'build-1' }, { t: 1.4, name: 'build-2' }] },
  { id: 'hold', seg: seg('hold'), part: part('hold'), shots: [{ t: 0.9, name: 'hold-1' }, { t: 1.6, name: 'hold-2' }] },
  { id: 'push', seg: seg('push'), part: part('push'), shots: [{ t: 0.9, name: 'push' }] },
  { id: 'raid', seg: seg('raid'), part: part('raid'), shots: [{ t: 0.8, name: 'raid-1' }, { t: 1.4, name: 'raid-2' }] },
  { id: 'fight', seg: seg('fight'), part: part('fight'), shots: [{ t: 0.3, name: 'fight-0' }, { t: 1.2, name: 'fight-1' }, { t: 2.2, name: 'fight-2' }] },
  { id: 'duel', seg: seg('duel'), part: part('duel'), shots: [{ t: 1.5, name: 'duel-1' }, { t: 2.3, name: 'duel-2' }] },
  { id: 'siege', seg: seg('siege'), part: part('siege'), shots: [{ t: 1.2, name: 'siege-1' }, { t: 2.2, name: 'siege-2' }, { t: 2.8, name: 'siege-3' }] },
];

async function plates(stage, set) {
  const s = set.seg || set, as = s.as || 'humans';
  const { ctx, page } = await game(stage, { viewport: VIEW, deviceScaleFactor: 2 }, { as, ai: !!s.ai });
  try {
    if (set.inject) await page.evaluate((o) => Object.assign(window, o), set.inject);
    const a = await page.evaluate(set.scene || s.scene, { fmt });
    const p = set.part, state = { a, fmt, taps: [] };
    const frame = (cam, ms) => page.evaluate(([c, ms]) => {
      const e = window.endfall;
      if (c) { e.cam.zoom = c.zoom; e.centerOn(c.x, c.y); e.cam.x += c.dx || 0; e.cam.y += c.dy || 0; }
      if (ms > 0) window.__frame(ms, 1);
    }, [cam, ms]);
    await frame(p.cam?.(0, a, fmt, state), 0);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 600)))));
    await freeze(page);
    const cdp = await ctx.newCDPSession(page);
    const actions = [...(p.at || [])].sort((x, y) => x.t - y.t), shots = [...set.shots].sort((x, y) => x.t - y.t);
    const n = Math.round(Math.max(p.seconds, shots.at(-1).t + 0.1) * FPS);
    for (let i = 0; i < n && shots.length; i++) {
      const t = i / FPS;
      while (actions.length && actions[0].t <= t + 1e-6) await actions.shift().run(page, state, t);
      if (p.follow) state.follow = await page.evaluate(p.follow);
      const due = shots[0].t <= t + 1e-6 ? shots.shift() : null;
      const base = p.cam ? p.cam(t, a, fmt, state) : null, cam = due?.cam ? due.cam(t, a, fmt, state) : base && { ...base, dx: 0, dy: 0 };
      await frame(cam, 1000 / FPS + 0.0005);
      if (due) {
        let png, last = null;
        for (let k = 0; k < 4; k++) { // (the drawn frame presented: taken until two captures agree)
          await page.evaluate(() => new Promise(r => window.__raf(() => window.__raf(r))));
          png = await capture(cdp, VIEW, 2);
          if (last && png.equals(last)) break;
          last = png;
        }
        writeFileSync(`${out}${due.name}.png`, png);
        console.log(`  ${due.name}.png (t ${t.toFixed(2)})`);
      }
    }
  } finally { await ctx.close(); }
}

const names = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const stage = await openStage();
try {
  for (const set of SETS) if (!names.length || names.includes(set.id)) {
    console.log(`storyboard: ${set.id}`);
    try { await plates(stage, set); } catch (e) { console.error(`  ${set.id} failed: ${e.message}`); }
  }
} finally { await stage.close(); }
