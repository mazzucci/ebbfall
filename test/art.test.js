// The atlas (public/art, made by tools/art/generate.mjs) against the game: every unit, building and turret head is drawn
// once in neutral paint with a team mask (`<name>_m`) that lines up with it pixel for pixel, and a tint for every seat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UNITS, BUILDINGS } from '../src/engine/constants.js';
import { BLDG_LOOK, SEAT_COLORS } from '../src/client/look.js';

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

test('every building and turret head has its team mask', () => {
  for (const type of Object.keys(BUILDINGS)) paired(`bldg_${type}`);
  for (const head of new Set(Object.values(BLDG_LOOK).map(l => l.head).filter(Boolean))) for (let d = 0; d < FACINGS; d++) paired(`${head}_${d}`);
});

test('one frame per kind, not one per seat, and a mask tint for every seat', () => {
  const perSeat = Object.keys(frames).filter(n => /^(bldg_[a-z]+|turret_head)_\d+$/.test(n) && !frames[`${n}_m`] || /^[a-z]+_\d+_\d+_\d+$/.test(n));
  assert.deepEqual(perSeat, [], 'no frames named by seat');
  assert.equal(index.tints?.length, SEAT_COLORS.length, 'atlas.json tints: one per seat colour');
  for (const t of index.tints) assert.ok(Number.isInteger(t) && t >= 0 && t <= 0xffffff);
});
