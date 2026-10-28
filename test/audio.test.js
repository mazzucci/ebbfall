// The sound engine (src/client/audio.js) against a stub Web Audio API: every recipe runs with and without a world
// position, envelopes never ramp to or from zero (exponential ramps cannot), and every sound the sim names exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const ramps = [], errors = [];
// (times must be non-negative and, per parameter, never go back: a real AudioParam throws or misbehaves)
const when = (p, t, what) => { if (t === undefined) return; if (!(t >= 0)) errors.push(`${what} at ${t}`); if (t < (p.last ?? 0)) errors.push(`${what} back in time: ${t} < ${p.last}`); p.last = t; };
class Param { constructor(v = 0) { this.value = v; } cancelScheduledValues() {} setValueAtTime(v, t) { when(this, t, 'set'); this.value = v; } exponentialRampToValueAtTime(v, t) { when(this, t, 'ramp'); if (!(v > 0)) errors.push('ramp to ' + v); ramps.push(v); } linearRampToValueAtTime(v, t) { when(this, t, 'linear ramp'); if (!Number.isFinite(v)) errors.push(`linear ramp to ${v}`); ramps.push(v); } setTargetAtTime() {} }
let silentStarts = 0;
class Node { constructor() { this.gain = new Param(1); this.frequency = new Param(440); this.Q = new Param(1); this.pan = new Param(0); } connect(n) { return n; } start(t) { if (t !== undefined && !(t >= 0)) errors.push(`start at ${t}`); } stop() {} }
class Ctx {
  static now = 0;
  constructor() { this.state = 'running'; this.sampleRate = 8000; this.destination = new Node(); }
  get currentTime() { return Ctx.now; }
  resume() { return Promise.resolve(); }
  createDynamicsCompressor() { const n = new Node(); n.threshold = new Param(); n.ratio = new Param(); n.attack = new Param(); n.release = new Param(); return n; }
  createGain() { return new Node(); } createOscillator() { return new Node(); } createBiquadFilter() { return new Node(); }
  createStereoPanner() { return new Node(); } createBufferSource() { const n = new Node(), start = n.start.bind(n); n.start = (t) => { if (t === 0 && n.buffer?.length === 1) silentStarts++; start(t); }; return n; }
  createWaveShaper() { return new Node(); } createDelay() { const n = new Node(); n.delayTime = new Param(); return n; }
  createBuffer(_c, n) { return { length: n, getChannelData: () => new Float32Array(n) }; }
}
globalThis.window = { AudioContext: Ctx };
const listeners = {}; // (the module's gesture listeners, by event type)
globalThis.addEventListener = (t, fn) => { (listeners[t] ||= []).push(fn); };

const { sfx, say, audio } = await import('../src/client/audio.js');
const { PHRASES, STYLES } = await import('../src/client/voice.js');
const src = readFileSync(new URL('../src/client/audio.js', import.meta.url), 'utf8');
const recipes = [...src.matchAll(/^ {2}([a-z]+): \(b, t/gm)].map(m => m[1]);

test('a touch\'s end, a click or a key wakes the sound (WebKit counts those, not a finger going down); once unlocked, a silent sample is not played again; muted, nothing', () => {
  for (const t of ['touchend', 'click', 'keydown', 'pointerdown']) assert.ok(listeners[t]?.length, `listens for ${t}`);
  audio.muted = true; listeners.touchend.forEach(f => f()); assert.equal(silentStarts, 0, 'muted: no sound opened');
  audio.muted = false; listeners.touchend.forEach(f => f()); assert.equal(silentStarts, 1, 'the first gesture plays the silent sample');
  listeners.click.forEach(f => f()); listeners.keydown.forEach(f => f()); assert.equal(silentStarts, 1, 'once');
});

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

test('the announcer says every phrase in every race\'s voice, one at a time, not again within its gap, not when muted or quiet', async () => {
  const { FACTIONS } = await import('../src/engine/pkg/data.js').catch(() => ({ FACTIONS: null }));
  let clock = 100000; audio.now = () => clock;
  const actx = new window.AudioContext(); // (the module's context is made on first use; time is read from it)
  Ctx.now += 100; // (past anything an earlier test said)
  const keys = Object.keys(PHRASES);
  for (const voice of Object.keys(STYLES)) for (const key of keys) {
    audio.voice = voice; ramps.length = 0; errors.length = 0;
    say(key);
    assert.ok(ramps.length > 0, `${voice} said ${key}`);
    ramps.length = 0; say(key);
    assert.equal(ramps.length, 0, `${key} not repeated at once`);
    clock += 30000; Ctx.now += 10; // (past the gap, and past the phrase on the audio clock)
  }
  assert.deepEqual(errors, []);
  // One at a time: another phrase while one plays is dropped.
  say('shards'); ramps.length = 0; say('ether');
  assert.equal(ramps.length, 0, 'not over another phrase');
  Ctx.now += 10; clock += 30000;
  audio.muted = true; ramps.length = 0; say('ether'); assert.equal(ramps.length, 0, 'muted'); audio.muted = false;
  audio.quiet = true; ramps.length = 0; say('ether'); assert.equal(ramps.length, 0, 'quiet (a replay)'); audio.quiet = false;
  // The research sound speaks: more than the chime alone.
  Ctx.now += 10; clock += 30000;
  ramps.length = 0; sfx('done'); const chime = ramps.length;
  clock += 30000; ramps.length = 0; sfx('researched');
  assert.ok(ramps.length > chime, 'researched says research complete');
  if (FACTIONS) assert.deepEqual(Object.keys(STYLES).sort(), Object.keys(FACTIONS).sort(), 'a voice per faction');
  void actx;
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
  // Each ability's key is the sound its cast event plays (data/abilities.rs).
  const abilities = new Set([...sim.matchAll(/key: "([a-z]+)",\n    name: "[^"]+",\n    toggle:/g)].map(m => m[1]));
  assert.ok(abilities.has('stim'), `the abilities were found: ${[...abilities]}`);
  for (const n of [...named, ...weapons, ...abilities]) assert.ok(recipes.includes(n), `the sim emits "${n}", the client has no recipe for it`);
});

test('the voice prototype speaks every phrase in every style', async () => {
  const { speak, PHRASES, STYLES } = await import('../src/client/voice.js');
  for (const key of Object.keys(PHRASES)) for (const style of Object.keys(STYLES)) {
    ramps.length = 0;
    const len = speak(new Ctx(), new Node(), key, style, 0);
    assert.ok(len > 0.5 && len < 3, `${key} ${style}: ${len}s`);
    assert.ok(ramps.length > 50, `${key} ${style} moved its formants`);
  }
  assert.deepEqual(errors, []);
});
