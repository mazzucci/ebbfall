// What the device remembers (src/client/store.js): the player's name, one sanitiser and one key for the lobby's NAME
// and OPTIONS' NAME, which takes a name exactly as the relay does (relay/room.js: trimmed, 16 at most).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { store, cleanName, playerName, MAX_NAME } from '../src/client/store.js';
import { Room, PROTO } from '../relay/room.js';

/** A localStorage stand-in for the test (`fail`: every call throws, as in a private window that refuses storage). */
function fakeStorage(fail = false) {
  const m = new Map();
  const no = () => { throw new Error('QuotaExceededError'); };
  globalThis.localStorage = fail ? { getItem: no, setItem: no } : { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  return m;
}

const CASES = ['Ann', '  Ann  ', '', '   ', 'Bartholomew the Bold', '  Bartholomew the Bold', '0123456789abcdef', '0123456789abcdefg',
  'fifteen chars  x', 'Zoë 🐙', 'W A S D', '<b>bo</b>', 'tab\there', 'Ann\n'];

test('cleanName: trimmed, cut to 16 and trimmed again; any characters; nothing but a string is a name', () => {
  assert.equal(MAX_NAME, 16);
  assert.equal(cleanName('  Ann  '), 'Ann');
  assert.equal(cleanName('Bartholomew the Bold'), 'Bartholomew the', 'cut to 16, then the space at the cut trimmed');
  assert.equal(cleanName('0123456789abcdefg'), '0123456789abcdef');
  assert.equal(cleanName('Zoë 🐙'), 'Zoë 🐙', 'any characters');
  assert.equal(cleanName('<b>bo</b>'), '<b>bo</b>', 'kept as typed (shown as text, never as markup)');
  for (const v of ['', '   ', '\n\t', null, undefined, 42, {}, ['Ann']]) assert.equal(cleanName(v), '', `${JSON.stringify(v)}: no name`);
  for (const v of CASES) { const n = cleanName(v); assert.ok(n.length <= MAX_NAME && n === n.trim(), JSON.stringify(v)); assert.equal(cleanName(n), n, `${JSON.stringify(v)}: cleaning twice changes nothing`); }
});

test('cleanName names a player as the relay does: the name the room shows for a hello is the cleaned one', () => {
  for (const name of CASES.filter(v => cleanName(v))) {
    const inbox = [], r = new Room({ code: 'ABCD', seats: 2, seed: 7, send: (_, m) => inbox.push(m), kick: () => {} });
    assert.equal(r.connect({}, { proto: PROTO, name }), 0, JSON.stringify(name));
    assert.equal(inbox.filter(m => m.t === 'lobby').at(-1).seats[0].name, cleanName(name), JSON.stringify(name));
  }
});

test('playerName: one key (endfall.name), stored cleaned, an empty name too; nothing stored reads as none; private mode is no error', () => {
  const m = fakeStorage();
  assert.equal(playerName.get(), '', 'nothing stored yet');
  assert.equal(playerName.set('  Bartholomew the Bold '), 'Bartholomew the');
  assert.equal(m.get('endfall.name'), 'Bartholomew the', 'the key the lobby has always used');
  assert.equal(store.get('name'), 'Bartholomew the');
  assert.equal(playerName.get(), 'Bartholomew the');
  m.set('endfall.name', '   Ann   '); // (an older build's, or a hand-edited value)
  assert.equal(playerName.get(), 'Ann', 'read cleaned');
  assert.equal(playerName.set('   '), '');
  assert.equal(m.get('endfall.name'), '', 'emptied: no name');
  fakeStorage(true);
  assert.equal(playerName.set('Bo'), 'Bo');
  assert.equal(playerName.get(), '');
  delete globalThis.localStorage;
});
