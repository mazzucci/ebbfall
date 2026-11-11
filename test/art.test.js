// The atlas (public/art, made by tools/art/generate.mjs) against the game: every unit, building and turret head is drawn
// once in neutral paint with a team mask (`<name>_m`) that lines up with it pixel for pixel, and a tint for every seat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UNITS, BUILDINGS } from '../src/engine/constants.js';
import { BLDG_LOOK, chimneyActive, selOval, headFrame, portalOpen, PORTAL, SEAT_COLORS, SHOT_LOOK, PEOPLE_SHOT, TOWER_SHOT, SHOT_TRAIL } from '../src/client/look.js';
import { GROUND_BASES, GROUND_MARKS, rockTile } from '../src/client/gl/ground.js';

const art = new URL('../public/art/', import.meta.url), index = JSON.parse(readFileSync(new URL('atlas.json', art))), frames = {};
for (const p of index.pages) Object.assign(frames, JSON.parse(readFileSync(new URL(p, art))).frames);
const FACINGS = index.facings;

/** `name` and its mask: the same full size and anchor, the mask's trimmed rect inside it. */
function paired(name) {
  const b = frames[name], m = frames[`${name}_m`];
  assert.ok(b, `${name} is in the atlas`); assert.ok(m, `${name}_m (its team mask) is in the atlas`);
  assert.deepEqual(m.sourceSize, { w: b.frame.w, h: b.frame.h }, `${name}_m has ${name}'s size`);
  assert.deepEqual(m.anchor, b.anchor, `${name}_m has ${name}'s anchor`);
  const r = m.spriteSourceSize;
  assert.ok(m.trimmed && r.w === m.frame.w && r.h === m.frame.h && r.x >= 0 && r.y >= 0 && r.x + r.w <= b.frame.w && r.y + r.h <= b.frame.h, `${name}_m's trimmed rect lies inside ${name}`);
}

test('every unit facing and frame has its team mask', () => {
  for (const kind of Object.keys(UNITS)) for (let d = 0; d < FACINGS; d++) {
    const seq = index.animations[`${kind}_${d}`];
    assert.ok(seq?.length >= 1, `${kind}_${d} animation`);
    seq.forEach((name, f) => { assert.equal(name, `${kind}_${d}_${f}`); paired(name); });
  }
});

test('the atlas holds no unit or building the sim no longer has (the retired kinds\' art is dropped)', () => {
  const units = Object.keys(index.animations).filter(a => /^[a-zA-Z]+_\d+$/.test(a) && frames[`${a}_0`] && frames[`${a}_0_m`]).map(a => a.replace(/_\d+$/, ''));
  assert.deepEqual([...new Set(units)].filter(k => !UNITS[k]), [], 'unit art without a kind');
  const bldgs = Object.keys(frames).filter(n => /^bldg_[a-zA-Z]+$/.test(n)).map(n => n.slice(5));
  assert.deepEqual(bldgs.filter(t => !BUILDINGS[t]), [], 'building art without a type');
  assert.deepEqual(Object.keys(frames).filter(n => /^vent_/.test(n)), [], 'no mine shaft');
});

test('every building and turret head has its team mask', () => {
  for (const type of Object.keys(BUILDINGS)) paired(`bldg_${type}`);
  for (const head of new Set(Object.values(BLDG_LOOK).map(l => l.head).filter(Boolean))) for (let d = 0; d < FACINGS; d++) paired(`${head}_${d}`);
});

test('chimney smoke: the Castle, Barracks and Blacksmith have smoke points, the Cottage none, and a chimney is active only while its building works', () => {
  for (const k of ['core', 'barracks', 'forge']) assert.ok(BLDG_LOOK[k].smoke?.length, `${k} has smoke points`);
  assert.equal(BLDG_LOOK.depot?.smoke, undefined, 'the Cottage: no smoke (nobody works there)');
  const idle = { done: true, queue: [], research: null };
  assert.equal(chimneyActive(idle), false, 'idle: cold');
  assert.equal(chimneyActive({ ...idle, queue: ['trooper'] }), true, 'training: smokes');
  assert.equal(chimneyActive({ ...idle, research: { type: 'weapons1', prog: 0 } }), true, 'researching: smokes');
  assert.equal(chimneyActive({ ...idle, done: false, queue: ['trooper'] }), false, 'not yet built: cold');
});

test('a selected building\'s mark is a flat oval under it, sized to its footprint', () => {
  for (const [w, h] of [[2, 2], [3, 3], [4, 4]]) {
    const b = { x: 500, y: 300, w, h }, o = selOval(b);
    assert.ok(Math.abs(o.x - b.x) < 1 && Math.abs(o.y - b.y) <= h * 32 * 0.1, `${w}x${h}: centred on the footprint`);
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

test('every unit kind has its drawn height (atlas.json unitTops: the hit test and health bars go by it), taller than its radius', () => {
  for (const [kind, d] of Object.entries(UNITS)) {
    const top = index.unitTops?.[kind];
    assert.ok(Number.isFinite(top) && top > d.r && top < 120, `${kind}: drawn ${top} game px above its feet, radius ${d.r}`);
  }
});

test('one frame per kind, not one per seat, and a mask tint for every seat', () => {
  const perSeat = Object.keys(frames).filter(n => /^(bldg_[a-z]+|turret_head)_\d+$/.test(n) && !frames[`${n}_m`] || /^[a-z]+_\d+_\d+_\d+$/.test(n));
  assert.deepEqual(perSeat, [], 'no frames named by seat');
  assert.equal(index.tints?.length, SEAT_COLORS.length, 'atlas.json tints: one per seat colour');
  for (const t of index.tints) assert.ok(Number.isInteger(t) && t >= 0 && t <= 0xffffff);
});

test('the frames the client draws for each people\'s construction, rubble, worn dirt and shots are in the atlas', () => {
  for (const n of [2, 3, 4]) for (const k of ['foundation', 'scaffold', 'rubble', 'bud', 'rubble_vael', 'worn']) assert.ok(frames[`${k}_${n}`], `${k}_${n}`);
  for (const n of [2, 3, 4]) for (const k of ['scaffold', 'bud']) paired(`${k}_${n}`); // (a scaffold's cloth and flags in the seat's colour)
  const shots = new Set([...Object.values(SHOT_LOOK), ...Object.values(PEOPLE_SHOT).flatMap(Object.values), ...Object.values(TOWER_SHOT)]);
  for (const k of shots) assert.ok(frames[k], `the shot ${k}`);
  for (const k of Object.values(SHOT_TRAIL)) assert.ok(index.animations[k]?.every(n => frames[n]), `the trail ${k}`);
  for (const k of ['boom_big', 'boom_small', 'puff', 'flash', 'spark']) assert.ok(index.animations[k]?.length && index.animations[k].every(n => frames[n]), `the animation ${k}`);
});

test('the ground: every grass tile, and every rock mask in its hill and forest variants (gl/ground.js rockTile)', () => {
  for (let v = 0; v < GROUND_BASES + GROUND_MARKS; v++) assert.ok(frames[`ground_${v}`], `ground_${v}`);
  for (let m = 1; m < 16; m++) for (const kind of ['hill', 'forest']) for (const r of [0, 0.5, 0.999]) { const n = rockTile(m, r, kind); assert.ok(frames[n], n); }
});

test('the gold outcrop (the link preview\'s, tools/og.mjs): four stages in four variants', () => {
  for (let k = 0; k < 4; k++) for (let v = 0; v < 4; v++) { const n = v ? `shard_${k}_${v}` : `shard_${k}`; assert.ok(frames[n], n); }
});

test('the gold mine: a frame for each stage the renderer draws (gl/render.js mineStage), neutral, a 2x2 footprint', () => {
  for (const st of ['full', 'low', 'empty']) {
    const f = frames[`mine_${st}`];
    assert.ok(f, `mine_${st}`); assert.ok(!frames[`mine_${st}_m`], `mine_${st} has no team mask: it is nobody's`);
    assert.ok(f.anchor, `mine_${st} has its ground point`);
    // (drawn to its footprint as a 2x2 building is: about two tiles wide, its rock and shadow past them; scale 2)
    assert.ok(f.frame.w >= 2 * 32 * 2 * 0.9 && f.frame.w <= 2 * 32 * 2 * 2, `mine_${st}: ${f.frame.w} px wide at scale 2`);
  }
});
