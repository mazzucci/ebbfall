// The atlas (public/art, made by tools/art/generate.mjs) against the game: every unit, building and turret head is drawn
// once in neutral paint with a team mask (`<name>_m`) that lines up with it pixel for pixel, and a tint for every seat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UNITS, BUILDINGS } from '../src/engine/constants.js';
import { BLDG_LOOK, chimneyActive, SEAT_COLORS, SHOT_LOOK, PEOPLE_SHOT, TOWER_SHOT, SHOT_TRAIL } from '../src/client/look.js';
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

test('the gold outcrop: four stages, each in every variant the renderer picks per tile (gl/crust.js crystalVariant)', () => {
  for (let k = 0; k < 4; k++) for (let v = 0; v < 4; v++) { const n = v ? `shard_${k}_${v}` : `shard_${k}`; assert.ok(frames[n], n); }
});
