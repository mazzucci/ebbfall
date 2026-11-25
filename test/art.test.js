// The art (public/art/new) against the game: every unit, building and head is drawn once in neutral paint with a team mask
// (`<name>_m`) on the same ground point, and there is a tint for every seat. (The files themselves: newart.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UNITS, BUILDINGS } from '../src/engine/constants.js';
import { BLDG_LOOK, chimneyActive, selOval, headFrame, portalOpen, PORTAL, SEAT_COLORS, SEAT_TINTS } from '../src/client/look.js';

const art = new URL('../public/art/new/', import.meta.url), index = JSON.parse(readFileSync(new URL('index.json', art))), { bldg, unit } = index.groups, frames = {};
for (const g of Object.values(index.groups)) for (const p of g.pages) Object.assign(frames, JSON.parse(readFileSync(new URL(p, art))).frames);
/** The kinds a player can have: what a building trains (the two healers are trained nowhere and have no art). */
const TRAINED = [...new Set(Object.values(BUILDINGS).flatMap(b => b.trains || []))];

/** Frame `name` and its mask `name`_m, on the same ground point. */
function paired(name) {
  const b = frames[name], m = frames[`${name}_m`];
  assert.ok(b, `${name} is in the art`); assert.ok(m, `${name}_m (its team mask) is in the art`);
  const at = (f) => ['x', 'y'].map((k, i) => f.anchor[k] * f.sourceSize[i ? 'h' : 'w'] - f.spriteSourceSize[k]);
  if (b.sourceSize.w === m.sourceSize.w && b.sourceSize.h === m.sourceSize.h) assert.deepEqual(m.anchor, b.anchor, `${name}_m has ${name}'s anchor`);
  else assert.ok(at(m).every(Number.isFinite), `${name}_m has a ground point`);
}

test('every trained unit has its walk and its masks in all facings, and its drawn height, taller than its radius', () => {
  assert.equal(TRAINED.length, 15);
  assert.deepEqual(Object.keys(unit.unitTops).sort(), TRAINED.slice().sort(), 'no art without a kind, no kind without');
  for (const kind of TRAINED) {
    const top = unit.unitTops[kind];
    assert.ok(top > UNITS[kind].r && top < 120, `${kind}: drawn ${top} game px above its feet, radius ${UNITS[kind].r}`);
    for (let d = 0; d < 16; d++) { const seq = unit.animations[`${kind}_${d}`]; assert.ok(seq?.length >= 1, `${kind}_${d}`); for (const n of seq) paired(n); }
  }
});

test('every building has its mask and its look, and none is art without a type', () => {
  for (const type of Object.keys(BUILDINGS)) paired(`bldg_${type}`);
  assert.deepEqual(Object.keys(bldg.looks).sort(), Object.keys(BUILDINGS).sort());
  assert.deepEqual(Object.keys(frames).filter(n => /^bldg_[a-zA-Z]+$/.test(n)).map(n => n.slice(5)).sort(), Object.keys(BUILDINGS).sort());
  for (let d = 0; d < 16; d++) paired(`turret_head_${d}`); // (the Watchtower's archer wears the seat's hood; the other heads carry no paint)
});

test('chimney smoke: the Blacksmith has smoke points, the Cottage none, and a chimney is active only while its building works', () => {
  assert.ok(bldg.looks.forge.smoke?.length, 'the Blacksmith smokes');
  assert.ok(!bldg.looks.depot.smoke, 'the Cottage: no smoke (nobody works there)');
  const idle = { done: true, queue: [], research: null };
  assert.equal(chimneyActive(idle), false, 'idle: cold');
  assert.equal(chimneyActive({ ...idle, queue: ['trooper'] }), true, 'training: smokes');
  assert.equal(chimneyActive({ ...idle, research: { type: 'weapons1', prog: 0 } }), true, 'researching: smokes');
  assert.equal(chimneyActive({ ...idle, done: false, queue: ['trooper'] }), false, 'not yet built: cold');
});

test('a selected building\'s mark is a flat oval under it, sized to its footprint', () => {
  for (const [w, h] of [[2, 2], [3, 3], [4, 4]]) {
    const b = { x: 500, y: 300, w, h }, o = selOval(b);
    assert.ok(Math.abs(o.x - b.x) < 1 && Math.abs(o.y - b.y) <= h * 32 * 0.1, `${w}x${h}: centered on the footprint`);
    assert.ok(o.rx > w * 16 && o.rx < w * 32 * 0.75, `${w}x${h}: a little wider than the footprint (${o.rx})`);
    assert.ok(o.ry < o.rx && o.ry >= h * 16 * 0.9, `${w}x${h}: flat, lying on the ground (${o.ry} under ${o.rx})`);
  }
  assert.ok(selOval({ x: 0, y: 0, w: 4, h: 4 }).rx > selOval({ x: 0, y: 0, w: 2, h: 2 }).rx, 'a bigger building, a bigger oval');
});

test('the heads: a turret aims, a rotor spins on the clock, a dish pans to and fro about its first frame', () => {
  assert.equal(headFrame({ head: 'ward_head' }, Math.PI / 2, 5), 4, 'aimed a quarter turn: frame 4');
  const rotor = BLDG_LOOK.spire, frames = new Set(Array.from({ length: 40 }, (_, i) => headFrame(rotor, 0, i * 0.05)));
  assert.ok(rotor.spin > 0 && frames.size >= 12, `the turbine's rotor goes through its frames (${frames.size} in 2 s)`);
  const dish = BLDG_LOOK.uplink, seen = Array.from({ length: 200 }, (_, i) => headFrame(dish, 0, i * 0.1));
  const amp = dish.pan[0], allowed = new Set(Array.from({ length: 2 * amp + 1 }, (_, i) => (i - amp + 16) % 16));
  assert.ok(seen.every(f => allowed.has(f)) && seen.includes(amp) && seen.includes(16 - amp), `the Uplink's dish sweeps ${amp} frames either way and no further`);
  for (const k of ['spire', 'uplink', 'eclipse', 'ward']) assert.ok(BLDG_LOOK[k].head, `${k} has its head`);
});

test('the Portal brightens each time a unit comes through: settled while idle, bright as a unit nears its end and steps out, then settled again', () => {
  const st = {}, b = (queue, prog) => ({ done: true, queue, prog });
  assert.equal(portalOpen(st, b([], 0), 0), 0, 'idle: closed');
  assert.equal(portalOpen(st, b(['umbra'], 0.5), 1), 0, 'training, far from done: still closed');
  assert.ok(portalOpen(st, b(['umbra'], 0.95), 2) > 0.5, 'near the end: opening');
  assert.equal(portalOpen(st, b([], 0), 3), 1, 'the Android steps out: open');
  assert.equal(portalOpen(st, b([], 0), 3 + PORTAL.hold / 2), 1, 'held open a moment');
  const mid = portalOpen(st, b([], 0), 3 + PORTAL.hold + PORTAL.fade / 2);
  assert.ok(mid > 0 && mid < 1, `fading (${mid})`);
  assert.equal(portalOpen(st, b([], 0), 3 + PORTAL.hold + PORTAL.fade + 0.1), 0, 'and closed again');
  const drop = { outAt: 10 }; // (a one-shot drop plays the same hold and fade)
  assert.equal(portalOpen(drop, b([], 0), 10.1), 1);
});

test('one frame per kind, not one per seat, and a mask tint for every seat', () => {
  assert.deepEqual(Object.keys(frames).filter(n => /^bldg_[a-z]+_\d+$/.test(n)), [], 'no frames named by seat');
  assert.equal(SEAT_TINTS.length, SEAT_COLORS.length, 'one tint per seat color');
  for (const t of SEAT_TINTS) assert.ok(Number.isInteger(t) && t >= 0 && t <= 0xffffff);
});

test('the gold mine: a frame for each stage the renderer draws (gl/render.js mineStage), neutral, a 2x2 footprint', () => {
  for (const st of ['full', 'low', 'empty']) {
    const f = frames[`mine_${st}`];
    assert.ok(f, `mine_${st}`); assert.ok(!frames[`mine_${st}_m`], `mine_${st} has no team mask: it is nobody's`);
    assert.ok(f.anchor, `mine_${st} has its ground point`);
  }
});
