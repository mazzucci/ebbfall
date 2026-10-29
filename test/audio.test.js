// The sound engine (src/client/audio.js) against a stub Web Audio API: the sound opens only in a gesture WebKit counts
// and is retried until it runs, the pause card holds it; every recipe runs with and without a world position,
// envelopes never ramp to or from zero (exponential ramps cannot), and every sound the sim names exists.
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
  static made = 0; static last = null;
  /** Whether resume() is allowed to start the context (a browser that does not count the gesture: false). */
  static allow = true;
  constructor() { this.state = 'suspended'; this.sampleRate = 8000; this.destination = new Node(); this.resumes = 0; Ctx.made++; Ctx.last = this; }
  get currentTime() { return Ctx.now; }
  /** `lag`: resume() starts the context only a moment later (as browsers do), not at once. */
  static lag = false;
  resume() {
    this.resumes++;
    if (!Ctx.allow) return Promise.resolve();
    if (Ctx.lag) return new Promise(r => setTimeout(() => { this.state = 'running'; r(); }, 20));
    this.state = 'running'; return Promise.resolve();
  }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  createDynamicsCompressor() { const n = new Node(); n.threshold = new Param(); n.ratio = new Param(); n.attack = new Param(); n.release = new Param(); return n; }
  createGain() { return new Node(); } createOscillator() { return new Node(); } createBiquadFilter() { return new Node(); }
  createStereoPanner() { return new Node(); } createBufferSource() { const n = new Node(), start = n.start.bind(n); n.start = (t) => { if (t === 0 && n.buffer?.length === 1) silentStarts++; start(t); }; return n; }
  createWaveShaper() { return new Node(); } createDelay() { const n = new Node(); n.delayTime = new Param(); return n; }
  createBuffer(_c, n) { return { length: n, getChannelData: () => new Float32Array(n) }; }
}
globalThis.window = { AudioContext: Ctx };
const listeners = {}; // (the module's gesture listeners, by event type)
globalThis.addEventListener = (t, fn) => { (listeners[t] ||= []).push(fn); };
const docListeners = {};
globalThis.document = { visibilityState: 'visible', addEventListener: (t, fn) => { (docListeners[t] ||= []).push(fn); } };
const fire = (t) => (t === 'visibilitychange' ? docListeners : listeners)[t]?.forEach(f => f());
const settle = () => new Promise(r => setTimeout(r, 0)); // (resume()'s promise)
const lagged = () => new Promise(r => setTimeout(r, 40)); // (a lagging resume() done)

const { sfx, say, audio, audioState, holdSound, soundToggled } = await import('../src/client/audio.js');
const { PHRASES, STYLES } = await import('../src/client/voice.js');
const src = readFileSync(new URL('../src/client/audio.js', import.meta.url), 'utf8');
const recipes = [...src.matchAll(/^ {2}([a-z]+): \(b, t/gm)].map(m => m[1]);

/** A stub speechSynthesis (installed until `remove()`): the lines spoken and the cancels. */
function speechStub(voices) {
  const sp = { voices: [...voices], spoken: [], cancels: 0, speaking: false, pending: false,
    getVoices() { return this.voices; }, speak(u) { this.spoken.push(u); }, cancel() { this.cancels++; this.speaking = false; }, addEventListener() {},
    remove() { delete globalThis.speechSynthesis; delete globalThis.SpeechSynthesisUtterance; } };
  globalThis.speechSynthesis = sp;
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; this.volume = 1; } };
  return sp;
}
const VOICES = {
  daniel: { name: 'Daniel', lang: 'en-GB', localService: true, voiceURI: 'd' },
  samantha: { name: 'Samantha', lang: 'en-US', localService: true, voiceURI: 's' },
  google: { name: 'Google US English', lang: 'en-US', localService: false, voiceURI: 'g' },
  thomas: { name: 'Thomas', lang: 'fr-FR', localService: true, voiceURI: 't' },
};

let clock0 = 0; audio.now = () => clock0;
/** A sound asked for now: whether it was scheduled (past the repeat gap of the last one). */
const heard = (name = 'select') => { clock0 += 1000; ramps.length = 0; sfx(name); return ramps.length > 0; };

test('a finger going down neither opens nor unlocks the sound (WebKit does not count it); muted, no gesture does', () => {
  assert.ok(!listeners.pointerdown?.length && !listeners.touchstart?.length, 'no listener for a finger going down');
  for (const t of ['touchend', 'click', 'keydown']) assert.ok(listeners[t]?.length, `listens for ${t}`);
  fire('pointerdown'); fire('touchstart');
  assert.deepEqual([Ctx.made, silentStarts, audioState()], [0, 0, 'none'], 'nothing opened before a touch\'s end');
  assert.equal(heard(), false, 'a game sound before any gesture: nothing, and no context made for it');
  say('attack'); assert.equal(Ctx.made, 0, 'nor for the announcer');
  audio.muted = true; fire('touchend'); fire('click'); fire('keydown');
  assert.deepEqual([Ctx.made, silentStarts], [0, 0], 'muted: nothing opened');
  audio.muted = false;
});

test('a touch\'s end opens the context, resumes it and plays the silent sample; a context still suspended is retried on the next gesture until it runs', async () => {
  Ctx.allow = false; // (the browser did not count it)
  fire('touchend');
  assert.deepEqual([Ctx.made, Ctx.last.resumes, silentStarts], [1, 1, 1], 'made, resumed, the silent sample');
  await settle();
  assert.equal(audioState(), 'suspended');
  assert.equal(heard(), false, 'past the gesture, nothing plays into a suspended context (it would all come at once later)');
  fire('click');
  assert.deepEqual([Ctx.made, Ctx.last.resumes, silentStarts], [1, 2, 2], 'the next gesture tries again: one context, resumed, another silent sample');
  Ctx.allow = true;
  fire('keydown'); await settle();
  assert.deepEqual([Ctx.last.resumes, silentStarts, audioState()], [3, 3, 'running'], 'running now');
  fire('touchend'); fire('click');
  assert.deepEqual([Ctx.last.resumes, silentStarts], [3, 3], 'once running, a gesture leaves it be');
  assert.equal(heard(), true, 'and sounds play');
});

test('iOS\'s interruption (a call, another app): silent until the page is back in view or the next gesture brings it back', async () => {
  const c = Ctx.last;
  c.state = 'interrupted';
  assert.equal(heard(), false, 'nothing into an interrupted context');
  fire('visibilitychange'); await settle();
  assert.equal(audioState(), 'running', 'back in view: resumed');
  c.state = 'interrupted'; Ctx.allow = false;
  fire('visibilitychange'); await settle();
  assert.equal(audioState(), 'interrupted', '(the browser wants a gesture)');
  Ctx.allow = true; fire('touchend'); await settle();
  assert.equal(audioState(), 'running', 'the next gesture brings it back');
  assert.equal(heard(), true);
});

test('the pause card holds the sound: suspended, nothing plays, no gesture resumes it; closed, it runs again; the setting is untouched', async () => {
  holdSound(true); await settle();
  assert.equal(audioState(), 'suspended');
  assert.equal(heard(), false, 'no effects while held');
  fire('click'); fire('touchend'); await settle();
  assert.equal(audioState(), 'suspended', 'a gesture on the card does not bring the sound back');
  assert.equal(audio.muted, false, 'the sound setting stays on');
  holdSound(false); await settle();
  assert.equal(audioState(), 'running', 'closed: running again');
  assert.equal(heard(), true);
  // Muted when the card closes: still muted after, and switched on (a click) the context wakes.
  audio.muted = true; holdSound(true); holdSound(false); await settle();
  assert.deepEqual([audio.muted, audioState()], [true, 'suspended'], 'muted: the card does not switch the sound on');
  assert.equal(heard(), false, 'muted: nothing');
  audio.muted = false; soundToggled(); await settle();
  assert.equal(audioState(), 'running', 'switched on: running');
  assert.equal(heard(), true);
});

/** A sound asked for `ms` later on the page's clock: whether it was scheduled. */
const heardIn = (ms, name) => { clock0 += ms; ramps.length = 0; sfx(name); return ramps.length > 0; };

test('the window after a gesture: a sound in it is scheduled while the context starts, one after it is not; a resume that does not take, an interruption or the pause card shuts it', async () => {
  const c = Ctx.last;
  c.state = 'suspended'; Ctx.lag = true; // (the browser suspended it; resume() runs it a moment later)
  fire('touchend');
  assert.equal(c.state, 'suspended', '(still starting)');
  assert.equal(heardIn(100, 'select'), true, 'inside the window: scheduled (the gesture\'s own click)');
  assert.equal(heardIn(300, 'build'), false, 'after the window, still not running: not scheduled');
  await lagged(); assert.equal(audioState(), 'running');
  // A resume that does not take closes the window at once.
  c.state = 'suspended'; Ctx.lag = false; Ctx.allow = false;
  fire('click'); await settle();
  assert.equal(heardIn(10, 'select'), false, 'the resume failed: no window');
  Ctx.allow = true;
  // Interrupted (iOS): no window, the sound waits for the context to run.
  c.state = 'interrupted'; Ctx.lag = true;
  fire('touchend');
  assert.equal(heardIn(10, 'build'), false, 'interrupted: no window');
  await lagged(); assert.equal(audioState(), 'running');
  // The pause card shuts it.
  c.state = 'suspended';
  fire('touchend'); holdSound(true);
  audio.muted = true; holdSound(false); audio.muted = false; // (released without a wake: the window is what is left)
  assert.equal(heardIn(10, 'select'), false, 'holdSound(true) closed the window');
  await lagged(); Ctx.lag = false;
  // A held context does not come back on visibilitychange.
  fire('touchend'); await settle(); assert.equal(audioState(), 'running');
  holdSound(true); await settle();
  const n = c.resumes;
  fire('visibilitychange'); await settle();
  assert.deepEqual([audioState(), c.resumes], ['suspended', n], 'held: back in view, still suspended');
  holdSound(false); await settle();
  assert.equal(audioState(), 'running');
});

test('every recipe plays, placed or not, with sound envelopes', async () => {
  audio.view = () => ({ x: 0, y: 0, w: 800, h: 450 });
  let clock = 1e6; audio.now = () => clock; // (past the sounds the gesture tests played)
  assert.ok(recipes.length >= 15, `recipes found: ${recipes}`);
  for (const name of recipes) for (const o of [{}, { x: 400, y: 200, unit: 'trooper', big: true, r: 40 }, { x: 1200, y: 200 }]) {
    ramps.length = 0;
    sfx(name, o);
    if (o.x !== 1200) assert.ok(ramps.length > 0, `${name} made a sound (a recipe that throws is swallowed by sfx)`);
    clock += 260; // past the longest repeat gap
  }
  assert.deepEqual(errors, []);
});

test('the announcer is off in the game: say() makes no sound and no speech, gestures do not unlock speech', async () => {
  let clock = 9e7; audio.now = () => clock;
  assert.equal(audio.announcer, null, 'off until a voice is chosen');
  const sp = speechStub([VOICES.daniel]);
  try {
    fire('touchend'); fire('click');
    for (const voice of ['humans', 'vael']) for (const key of Object.keys(PHRASES)) {
      audio.voice = voice; ramps.length = 0; say(key);
      assert.equal(ramps.length, 0, `${voice} ${key}: no sound`);
      clock += 30000;
    }
    ramps.length = 0; sfx('researched');
    assert.ok(ramps.length > 0, 'the research chime still plays');
    holdSound(true); holdSound(false); await settle();
    assert.deepEqual([sp.spoken.length, sp.cancels], [0, 0], 'speechSynthesis untouched');
  } finally { sp.remove(); }
});

test('the synth announcer says every phrase in every race\'s voice, one at a time, not again within its gap, not when muted or quiet', async () => {
  const { FACTIONS } = await import('../src/engine/pkg/data.js').catch(() => ({ FACTIONS: null }));
  let clock = 1e8; audio.now = () => clock; // (past every sound the earlier tests played)
  const actx = new window.AudioContext(); // (the module's context is made on first use; time is read from it)
  Ctx.now += 100; // (past anything an earlier test said)
  audio.announcer = 'synth';
  const keys = Object.keys(PHRASES);
  // (the device announcer without speechSynthesis speaks in the synth too)
  for (const announcer of ['synth', 'device']) for (const voice of ['humans', 'vael']) for (const key of keys) {
    audio.announcer = announcer; audio.voice = voice; ramps.length = 0; errors.length = 0;
    say(key);
    assert.ok(ramps.length > 0, `${announcer} ${voice} said ${key}`);
    ramps.length = 0; say(key);
    assert.equal(ramps.length, 0, `${key} not repeated at once`);
    clock += 30000; Ctx.now += 10; // (past the gap, and past the phrase on the audio clock)
  }
  assert.deepEqual(errors, []);
  audio.announcer = 'synth';
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
  if (FACTIONS) for (const f of Object.keys(FACTIONS)) assert.ok(STYLES[f] && STYLES[`${f}Device`], `a synth and a device voice for ${f}`);
  audio.announcer = null; Ctx.now += 10;
  void actx;
});

test('the device\'s voice: each race its own voice, pitch and rate, the phrase\'s text; one line at a time, an attack cuts in; silent muted; cancelled by the pause card and the sound switched off', async () => {
  let clock = 2e8; audio.now = () => clock;
  const sp = speechStub([VOICES.thomas, VOICES.google, VOICES.samantha, VOICES.daniel]);
  audio.announcer = 'device';
  try {
    fire('touchend');
    assert.deepEqual(sp.spoken.map(u => [u.text, u.volume]), [['', 0]], 'a gesture unlocks speech (iPhone, iPad): an empty line, inside it');
    fire('click'); assert.equal(sp.spoken.length, 1, 'once');
    sp.spoken.length = 0; ramps.length = 0;
    audio.voice = 'humans'; say('attack');
    audio.voice = 'vael'; clock += 30000; say('research');
    assert.equal(ramps.length, 0, 'no synth');
    assert.deepEqual(sp.spoken.map(u => [u.text, u.voice.name, u.lang, u.pitch, u.rate]), [
      ['Base under attack', 'Daniel', 'en-GB', 1, 1.03], ['Research complete', 'Samantha', 'en-US', 1.2, 0.95]]);
    // The repeat gap holds; a line speaking drops a new one, an attack cuts it.
    sp.spoken.length = 0; clock += 1000; say('research'); assert.equal(sp.spoken.length, 0, 'not again within its gap');
    sp.speaking = true; clock += 30000; say('shards');
    assert.equal(sp.spoken.length, 0, 'not over a line still speaking');
    say('attack');
    assert.deepEqual([sp.cancels, sp.spoken.map(u => u.text)], [1, ['Base under attack']], 'an attack cuts in');
    // Muted: nothing; switched off mid-line: cut; the pause card: cut, and nothing while it is up.
    sp.spoken.length = 0; clock += 30000;
    audio.muted = true; say('ether'); assert.equal(sp.spoken.length, 0, 'muted');
    soundToggled(); assert.equal(sp.cancels, 2, 'switched off: the line is cut');
    audio.muted = false; soundToggled(); await settle();
    holdSound(true); assert.equal(sp.cancels, 3, 'the pause card cuts the line');
    say('ether'); assert.equal(sp.spoken.length, 0, 'nothing while it is up');
    holdSound(false); await settle();
    sp.speaking = false; say('ether'); assert.equal(sp.spoken.length, 1, 'and speaks after');
    // `after`: the line waits (for the chime or the siren it goes with), and not if the sound went off meanwhile.
    sp.spoken.length = 0; clock += 30000; say('shards', 0.02); assert.equal(sp.spoken.length, 0, 'not yet');
    await new Promise(r => setTimeout(r, 40)); assert.equal(sp.spoken.length, 1, 'after its wait');
    clock += 30000; say('research', 0.02); audio.muted = true;
    await new Promise(r => setTimeout(r, 40)); assert.equal(sp.spoken.length, 1, 'muted during the wait: not said');
    audio.muted = false; soundToggled(); await settle();
  } finally { sp.remove(); audio.announcer = null; }
});

test('the device\'s voice falls back to the synth: no speechSynthesis, no English voice, or online voices only', async () => {
  let clock = 3e8; audio.now = () => clock;
  audio.announcer = 'device'; audio.voice = 'vael';
  try {
    for (const voices of [null, [], [VOICES.thomas], [VOICES.google]]) {
      const sp = voices && speechStub(voices);
      try {
        ramps.length = 0; Ctx.now += 10; clock += 30000; say('attack');
        assert.ok(ramps.length > 0, `the synth speaks (${voices ? voices.map(v => v.name) : 'no speechSynthesis'})`);
        assert.equal(sp?.spoken.length ?? 0, 0, 'and the device does not');
      } finally { sp?.remove(); }
    }
  } finally { audio.announcer = null; Ctx.now += 10; }
});

test('the device\'s voice picker: the Humans a known name or a US voice, the Vael another; one voice: both, apart by pitch; a pick by hand wins', async () => {
  const { voiceFor, picked, canSpeak, speakLine } = await import('../src/client/speech.js');
  const pick = (voices) => { const sp = speechStub(voices); try { return [voiceFor('humans')?.name, voiceFor('vael')?.name]; } finally { sp.remove(); } };
  assert.deepEqual(pick([VOICES.samantha, VOICES.daniel, VOICES.google]), ['Daniel', 'Samantha'], 'Apple');
  const android = [{ name: 'English United Kingdom', lang: 'en_GB', localService: true, voiceURI: 'gb' }, { name: 'English United States', lang: 'en-US', localService: true, voiceURI: 'us' }, { name: 'English India', lang: 'en-IN', localService: true, voiceURI: 'in' }];
  assert.deepEqual(pick(android), ['English United States', 'English United Kingdom'], 'Android: by accent');
  assert.deepEqual(pick([VOICES.samantha]), ['Samantha', 'Samantha'], 'one voice: both');
  const sp = speechStub([VOICES.samantha, VOICES.google]);
  try {
    speakLine('attack', 'humansDevice'); speakLine('attack', 'vaelDevice', { urgent: true });
    assert.deepEqual(sp.spoken.map(u => [u.voice.name, u.pitch, u.rate]), [['Samantha', 1, 1.03], ['Samantha', 1.2, 0.95]], 'one voice on the device (Google\'s is online): apart by pitch and rate');
    picked.vael = 'g';
    assert.equal(voiceFor('vael').name, 'Google US English', 'picked by hand (online too)');
    sp.voices.length = 0; sp.voices.push(VOICES.samantha);
    assert.equal(voiceFor('vael').name, 'Samantha', 'a pick the device no longer has: the automatic one');
    assert.equal(canSpeak('vaelClear'), false, 'a synth style is not the device\'s');
  } finally { delete picked.vael; sp.remove(); }
});

test('the Vael styles are friendly by construction: unison copies only (no fifths or fourths), no long echo, little vibrato, no growl; pitched as asked', () => {
  const vael = Object.entries(STYLES).filter(([k, s]) => k.startsWith('vael') && !s.device);
  assert.deepEqual(vael.map(([k]) => k), ['vaelClear', 'vaelWarm', 'vaelAiry', 'vael']);
  for (const [k, s] of vael) {
    for (const v of s.voices || []) assert.ok(Math.abs(Math.log2(v.mul ?? 1) * 1200) <= 10 && (v.delay ?? 0) <= 0.01, `${k}: a copy within 10 cents and 10 ms`);
    for (const [t, level] of s.room || []) assert.ok(t < 0.06 && level <= 0.1, `${k}: a short, quiet reflection`);
    assert.ok(!s.radio && (s.vib ?? 1.2) <= 0.6 && s.pitch >= 110 && s.hp >= 150, `${k}: no radio, little vibrato, no low growl`);
  }
  assert.ok(STYLES.vaelClear.pitch > STYLES.humansRadio.pitch && STYLES.vaelWarm.pitch < STYLES.vaelClear.pitch, 'A above the operator, B below A');
  assert.equal(STYLES.vael, STYLES.vaelClear, 'the Vael\'s synth voice is A');
  assert.equal(STYLES.humans, STYLES.humansRadio, 'the Humans\' is A');
  assert.equal(STYLES.humansRadio.radio.drive, 0, 'the clean radio does not clip');
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

test('a page the user has already acted on (a reload by script, an online rejoin) makes its context on the first sound; one not acted on waits for a gesture', async () => {
  const fresh = await import('../src/client/audio.js?fresh'); // (a new module: no context yet)
  fresh.audio.now = () => 5e8;
  const active = { hasBeenActive: false };
  Object.defineProperty(globalThis.navigator, 'userActivation', { configurable: true, get: () => active });
  try {
    const made = Ctx.made;
    ramps.length = 0; fresh.sfx('select');
    assert.deepEqual([Ctx.made - made, ramps.length, fresh.audioState()], [0, 0, 'none'], 'not acted on: no context, no sound');
    active.hasBeenActive = true;
    ramps.length = 0; fresh.sfx('build');
    assert.equal(Ctx.made - made, 1, 'acted on: a context on the first sound');
    assert.equal(Ctx.last.resumes, 1, 'resumed');
    assert.ok(ramps.length > 0, 'and the sound played');
  } finally { delete globalThis.navigator.userActivation; }
});
