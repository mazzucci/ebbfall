// The new look's loader (src/client/gl/newart.js): a group comes whole or not at all, and a replaced body never keeps
// another picture's team mask.
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.location ??= { search: '' };
const { artNew, newArtIndex, loadGroups, staleMasks, UNIT_SIZE, UNIT_SIZE_REST, unitSize, WORK_LOOK, workLook } = await import('../src/client/gl/newart.js');
const { UNITS } = await import('../src/engine/constants.js');

test('without the switch nothing is fetched', async () => {
  const before = globalThis.fetch; let asked = 0; globalThis.fetch = () => { asked++; };
  try { assert.equal(artNew, false); assert.equal(await newArtIndex('art/'), null); assert.equal(asked, 0); } finally { globalThis.fetch = before; }
});
test('a group with a page that fails, or with no pages, is left out; the others load, in order', async () => {
  const warn = console.warn; console.warn = () => {};
  try {
    const g = await loadGroups({ groups: { a: { pages: ['a-0.json', 'a-1.json'] }, b: { pages: ['bad.json'] }, c: {}, d: null, e: { pages: ['e-0.json'], x: 1 } } }, async (p) => { if (/bad/.test(p)) throw new Error('404'); return { p }; });
    assert.deepEqual(g.map(o => [o.name, o.pages.map(([p]) => p)]), [['a', ['new/a-0.json', 'new/a-1.json']], ['e', ['new/e-0.json']]]);
    assert.deepEqual(await loadGroups(null, async () => ({})), []);
  } finally { console.warn = warn; }
});
test('a replaced frame without a mask of its own drops today\'s mask; one with a mask, a new frame or a mask alone does not', () => {
  const today = new Set(['bldg_core', 'bldg_core_m', 'bldg_x', 'trooper_0_0', 'trooper_0_0_m']);
  assert.deepEqual(staleMasks(new Set(['bldg_core', 'trooper_0_0', 'trooper_0_0_m', 'bldg_new', 'bldg_x']), today), ['bldg_core_m']);
});
test('the new look\'s unit sizes: every kind drawn as its frames are packed, a row only for a real kind, and today\'s frames untouched', () => {
  assert.deepEqual(UNIT_SIZE, {}); assert.equal(UNIT_SIZE_REST, 1); // (the second pack's frames come at their final sizes)
  for (const kind of Object.keys(UNIT_SIZE)) assert.ok(UNITS[kind], `${kind} is a unit kind`);
  for (const kind of Object.keys(UNITS)) {
    assert.equal(unitSize(kind, true), UNIT_SIZE[kind] ?? UNIT_SIZE_REST, kind);
    assert.equal(unitSize(kind, false), 1, `${kind} with today's frames`);
    assert.ok(unitSize(kind, true) > 0.5 && unitSize(kind, true) <= 1, `${kind}: a size a unit can be read at`);
  }
});
test('how a builder with its own work frames works: the Bot stands still and turns its arm, the rest lean and flash, and today\'s frames are untouched', () => {
  assert.deepEqual(WORK_LOOK, { lumen: { nudge: false, turns: true } });
  for (const kind of Object.keys(WORK_LOOK)) assert.ok(UNITS[kind]?.worker, `${kind} is a worker`);
  for (const kind of Object.keys(UNITS)) {
    assert.deepEqual(workLook(kind, true), WORK_LOOK[kind] ?? { nudge: true, turns: false }, kind);
    assert.deepEqual(workLook(kind, false), { nudge: true, turns: false }, `${kind} with today's frames`);
  }
});
