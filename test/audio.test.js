// The sound engine (src/client/audio.js) against a stub Web Audio API: every recipe runs with and without a world
// position, envelopes never ramp to or from zero (exponential ramps cannot), and every sound the sim names exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const ramps = [], errors = [];
class Param { constructor(v = 0) { this.value = v; } setValueAtTime(v) { this.value = v; } exponentialRampToValueAtTime(v) { if (!(v > 0)) errors.push('ramp to ' + v); ramps.push(v); } setTargetAtTime() {} }
class Node { constructor() { this.gain = new Param(1); this.frequency = new Param(440); this.Q = new Param(1); this.pan = new Param(0); } connect(n) { return n; } start() {} stop() {} }
class Ctx {
  constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = new Node(); }
  resume() { return Promise.resolve(); }
  createDynamicsCompressor() { const n = new Node(); n.threshold = new Param(); n.ratio = new Param(); n.attack = new Param(); n.release = new Param(); return n; }
  createGain() { return new Node(); } createOscillator() { return new Node(); } createBiquadFilter() { return new Node(); }
  createStereoPanner() { return new Node(); } createBufferSource() { return new Node(); }
  createBuffer(_c, n) { return { getChannelData: () => new Float32Array(n) }; }
}
globalThis.window = { AudioContext: Ctx };
globalThis.addEventListener = () => {};

const { sfx, audio } = await import('../src/client/audio.js');
const src = readFileSync(new URL('../src/client/audio.js', import.meta.url), 'utf8');
const recipes = [...src.matchAll(/^ {2}([a-z]+): \(b, t/gm)].map(m => m[1]);

test('every recipe plays, placed or not, with sound envelopes', async () => {
  audio.view = () => ({ x: 0, y: 0, w: 800, h: 450 });
  let clock = 0; audio.now = () => clock;
  assert.ok(recipes.length >= 15, `recipes found: ${recipes}`);
  for (const name of recipes) for (const o of [{}, { x: 400, y: 200, unit: 'trooper', big: true, r: 40 }, { x: 1200, y: 200 }]) {
    ramps.length = 0;
    sfx(name, o);
    if (o.x !== 1200) assert.ok(ramps.length > 0, `${name} made a sound (a recipe that throws is swallowed by sfx)`);
    clock += 260; // past the longest repeat gap
  }
  assert.deepEqual(errors, []);
});

test('every sound the sim asks for has a recipe', () => {
  // Every Rust source of the sim (wherever a rule moves, its sounds are still found).
  const dir = new URL('../crates/endfall-sim/src/', import.meta.url);
  const sim = readdirSync(dir, { recursive: true }).filter(f => f.endsWith('.rs')).map(f => readFileSync(new URL(f, dir), 'utf8')).join('\n');
  const named = new Set([...sim.matchAll(/sfx\([^,()]+, "([a-z]+)"\)/g)].map(m => m[1])); // self.sfx(team, "name")
  assert.ok(named.size >= 2, 'the sim\'s sounds were found');
  // Each faction's shot sounds (Faction::sounds in crates/endfall-sim/src/data/).
  const weapons = new Set([...sim.matchAll(/sounds: \[([^\]]+)\]/g)].flatMap(m => [...m[1].matchAll(/"([a-z]+)"/g)].map(n => n[1])));
  assert.ok(weapons.has('bolt') && weapons.has('lance'), `every race's shot sounds were found: ${[...weapons]}`);
  for (const n of [...named, ...weapons]) assert.ok(recipes.includes(n), `the sim emits "${n}", the client has no recipe for it`);
});
