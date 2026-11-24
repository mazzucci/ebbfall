// The new look's loader (src/client/gl/newart.js): a group comes whole or not at all, and a replaced body never keeps
// another picture's team mask.
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.location ??= { search: '' };
const { artNew, newArtIndex, loadGroups, staleMasks } = await import('../src/client/gl/newart.js');

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
