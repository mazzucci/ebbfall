// A plan link (`?plan=`, src/client/plan.js) and the embed channel's checks (src/client/claude.js): the code's grammar is
// strict and round-trips; the sim (crates/endfall-sim/src/data/plan.rs) reads the same grammar, so every code the link
// takes the sim takes (but for unit words it does not know), and every code the link refuses the sim refuses; messages
// from a page are checked field by field, and only loopback or the named embedder may talk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { decode, encode, canonical, fromSearch, gameSeed, MAX_LEN } from '../src/client/plan.js';

const GOOD = [
  '1', '1.w14', '1.w14.f6m.s12.e7m30.b2.t2m.k8m.o2m30.o5m.r0.parcher.ncannon.nknight.m20.g1m30', '1.eno.tno.kno.ono',
  '1.m20.w14.o5m.o2m', '1.w40.f1m.s2', '1.pdrone.nbuggy.nsellsword',
];
const BAD = [
  '', '2.w14', '1.w14.w15', '1.W14', '1.w', '1.z3', '1.f6', '1.f6m5', '1.f6m75', '1.r2', '1.o5m.ono', '1..w14', '1.w14.',
  '1.w1000', '1.w 14', '1.xattack', '1.<b>', '1.p', '1.w14&x=1', `1.${'w14.'.repeat(60)}w1`, 1, null, {},
];

test('a plan code round-trips in the vocabulary\'s order, and anything else is no plan', () => {
  for (const c of GOOD) {
    const p = decode(c);
    assert.ok(p, c);
    assert.deepEqual(decode(encode(p)), p, c);
  }
  assert.equal(canonical('1.m20.w14.o5m.o2m'), '1.w14.o2m.o5m.m20');
  assert.equal(canonical('1.f6m00'), '1.f6m', 'whole minutes written short');
  for (const c of BAD) assert.equal(decode(c), null, String(c));
  assert.ok(decode('1.xattack.xmass', { delta: true }), 'intents in a delta');
  assert.equal(decode('1.xjump', { delta: true }), null);
  assert.ok(MAX_LEN >= 100);
});

test('the address gives the plan and watch, and nothing for a bad code', () => {
  assert.deepEqual(fromSearch('?plan=1.m20.w14&watch=1'), { code: '1.w14.m20', watch: true, seed: null });
  assert.deepEqual(fromSearch('?plan=1.w14'), { code: '1.w14', watch: false, seed: null });
  assert.deepEqual(fromSearch('?plan=1.w14&seed=4242'), { code: '1.w14', watch: false, seed: 4242 }, 'a game seed');
  assert.equal(fromSearch('?plan=1.w14&seed=01').seed, null, 'a seed that is not one: a fresh one each game');
  for (const bad of ['-1', '4294967296', '1e3', '0x10', ' 5', '']) assert.equal(gameSeed(bad), null, bad);
  assert.equal(gameSeed('4294967295'), 4294967295);
  assert.equal(gameSeed(7), 7);
  assert.equal(fromSearch('?plan=1.w14.w14'), null);
  assert.equal(fromSearch('?vs=1.0.0.5.h00v02'), null);
});

const pkg = new URL('../src/engine/pkg/', import.meta.url);
const built = existsSync(new URL('endfall_sim_bg.wasm', pkg));
if (!built && process.env.ENDFALL_REQUIRE_WASM) throw new Error('src/engine/pkg/ is missing: run npm run build:wasm');

test('the sim takes every code the link takes and refuses every code it refuses', { skip: !built && 'WASM not built' }, async () => {
  const sim = await import(new URL('endfall_sim.js', pkg));
  sim.initSync({ module: readFileSync(new URL('endfall_sim_bg.wasm', pkg)) });
  for (const c of [...GOOD, ...BAD.filter(c => typeof c === 'string')]) {
    const g = sim.Game.withSize(3, 1, 0, 0, 0, 0, 64);
    const refusal = g.setPlan(1, c);
    assert.equal(refusal === '', decode(c) !== null, `${c}: ${refusal}`);
    g.free();
  }
  // a delta on a planned seat: refused in lockstep, applied otherwise, its canonical plan back
  const g = sim.Game.withSize(3, 1, 0, 0, 0, 0, 64);
  assert.equal(g.setPlan(1, '1.w14'), '');
  g.step();
  assert.equal(g.planDelta(1, '1.m20.xattack'), '');
  assert.equal(g.planCode(1), '1.w14.m20');
  assert.match(g.setPlan(1, '1.w12'), /before the game starts/);
  const online = sim.Game.withSize(3, 1, 0, 0, 0, 0, 64);
  online.startLockstep();
  assert.notEqual(online.setPlan(1, '1.w14'), '');
  assert.notEqual(online.planDelta(1, '1.xattack'), '');
});

test('the channel takes only the messages the protocol names, from allowed origins', async () => {
  const { readMessage, allowedOrigin, sayLine, SAY_MAX } = await import('../src/client/embed.js');
  assert.deepEqual(readMessage({ type: 'ebbfall:hello', v: 1 }), { type: 'hello' });
  assert.deepEqual(readMessage({ type: 'ebbfall:delta', v: 1, code: '1.m20.xmass', say: ' Massing. ' }), { type: 'delta', code: '1.m20.xmass', say: 'Massing.' });
  assert.deepEqual(readMessage({ type: 'ebbfall:plan', v: 1, code: '1.w14' }), { type: 'plan', code: '1.w14', seed: null });
  assert.deepEqual(readMessage({ type: 'ebbfall:plan', v: 1, code: '1.w14', seed: 9 }), { type: 'plan', code: '1.w14', seed: 9 });
  // well formed, but the code or the line does not pass: answered ok:false with the reason (claude.js)
  for (const m of [{ type: 'ebbfall:plan', v: 1, code: '1.xattack' }, { type: 'ebbfall:plan', v: 1, code: '1.w14', seed: -1 },
    { type: 'ebbfall:delta', v: 1, code: '1.w14.w14' }, { type: 'ebbfall:delta', v: 1, code: 5 },
    { type: 'ebbfall:delta', v: 1, code: '1.w14', say: 'x'.repeat(SAY_MAX + 1) }, { type: 'ebbfall:delta', v: 1, code: '1.w14', say: 'a\nb' }]) {
    const r = readMessage(m);
    assert.ok(r && typeof r.bad === 'string' && r.type === m.type.slice(8), JSON.stringify(m));
  }
  assert.deepEqual(readMessage({ type: 'ebbfall:say', v: 1, text: 'gg' }), { type: 'say', say: 'gg' });
  for (const m of [
    null, 'ebbfall:hello', [], { type: 'ebbfall:hello' }, { type: 'ebbfall:hello', v: 2 }, { type: 'ebbfall:hello', v: 1, extra: 1 },
    { type: 'ebbfall:delta', v: 1, code: '1.w14', extra: 1 }, { type: 'ebbfall:plan', v: 2, code: '1.w14' },
    { type: 'ebbfall:say', v: 1, text: '' }, { type: 'ebbfall:say', v: 1, text: 5 }, { type: 'ebbfall:eval', v: 1, code: '1' },
  ]) assert.equal(readMessage(m), null, JSON.stringify(m));
  assert.equal(sayLine('<b>hi</b>'), '<b>hi</b>', 'shown as text, never as HTML: not altered, not refused');
  for (const o of ['http://localhost:5173', 'http://127.0.0.1:8123', 'http://localhost']) assert.ok(allowedOrigin(o), o);
  for (const o of ['https://evil.example', 'http://localhost.evil.example', 'http://127.0.0.1.evil:80', 'null', undefined]) assert.ok(!allowedOrigin(o), o);
  assert.ok(allowedOrigin('https://host.example:8443', 'https://host.example:8443'));
  assert.ok(!allowedOrigin('https://other.example', 'https://host.example'));
  assert.ok(!allowedOrigin('https://host.example/path', 'https://host.example/path'), 'an origin, never a path');
});
