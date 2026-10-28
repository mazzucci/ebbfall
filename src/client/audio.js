// Synthesized sound: no asset files. Each effect is a short recipe of tones (oscillators with pitch slides) and
// noise bursts (filtered white noise) through a master compressor. Effects with a world position are panned and
// faded by where they happen relative to the camera, so a fight off screen is a distant rumble. A quiet wind bed
// plays under the game. Units answer orders with short radio chirps, pitched by unit type.
import { UNIT_VOICE } from './look.js';
import { speak } from './voice.js';
import { canSpeak, speakLine, stopSpeech, unlockSpeech } from './speech.js';

let actx = null, master = null, noiseBuf = null, wind = null;
export const audio = {
  muted: false,
  voice: 'humans', // the announcer's race: this side's faction key
  // The announcer (`say`): off until it has a voice we like (the owner, 2026-10-28); the toasts it goes with stay.
  // 'device': the device's own voice (speech.js), each race's synth style A where the device has none; 'synth': each
  // race's synth style A (voice.js STYLES[race]); null: silent. voice-lab.html plays them all.
  announcer: null,
  quiet: false, // the announcer holds its tongue (a replay shows the game, not its news)
  /** Set by main.js: the camera's view in world px ({ x, y, w, h }), for panning and distance. */
  view: () => null,
  /** The clock the repeat gaps are measured on (ms); tests step it instead of waiting. */
  now: () => performance.now(),
};
/** The audio context's state for the debug handle: 'none' until a gesture first opened it, then 'suspended' (not yet
 *  allowed, or the pause card's `holdSound`), 'running', 'interrupted' (iOS: a call, another app), ... */
export const audioState = () => (actx ? actx.state : 'none');
const last = {};

// When sound may start. Browsers let a page's audio start only inside a gesture they count as the user's: on iPad and
// iPhone (WebKit) that is a touch's end, a click or a key, NOT a finger going down (pointerdown, touchstart), and older
// WebKit also wants a sound actually started inside that gesture. So the context is made, resumed and fed a silent
// one-sample buffer only there (`wake`), on every such gesture until it is seen running after one (`unlocked`), and
// again whenever it has stopped since: iOS's 'interrupted' (a call, the app sent to the background) comes back on the
// next gesture, or on the page coming back into view where the browser allows it. Nothing else makes the context, and
// nothing plays into one that is not running (`live`): sounds asked for before would otherwise all come at once.
// The audio session is 'ambient' (Safari 17+): a game's effects, mixed with the player's music and silenced by Silent
// Mode. Silent Mode (the ringer switch, or Control Center's bell on iPad) silences web audio on iOS by design: a
// silent iPad is first of all worth that check. Not 'playback', which would cut other apps' audio and ignore the switch.
let unlocked = false;
/** The pause card: the output suspended (`holdSound`), the player's sound setting untouched. */
let held = false;
/** Until when (audio.now()) a context woken by this very gesture takes sounds before it says 'running' (the gesture's
 *  own click, say; a context made in a click starts 'suspended' and runs a moment later). */
let grace = 0;
const GRACE_MS = 300;

function make() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch { /* not this browser */ }
  actx = new (window.AudioContext || window.webkitAudioContext)();
  const comp = actx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.15;
  master = actx.createGain(); master.gain.value = 0.9;
  master.connect(comp).connect(actx.destination);
  noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

/** A gesture the browser counts (or the sound switched on, or the pause card closed by one): open the context, or bring
 *  it back, until it runs. */
function wake() {
  if (audio.muted || held) return;
  if (audio.announcer === 'device') unlockSpeech(); // (iPhone and iPad: speech too starts only in a gesture)
  try {
    if (!actx) make();
    if (unlocked && actx.state === 'running') return;
    if (actx.state === 'suspended') grace = audio.now() + GRACE_MS; // (not 'interrupted': iOS gives it back when it will)
    const s = actx.createBufferSource(); s.buffer = actx.createBuffer(1, 1, actx.sampleRate); s.connect(actx.destination); s.start(0);
    const c = actx;
    // (a resume that did not take shuts the window: no sounds queued for a context that will not run)
    Promise.resolve(c.resume()).then(() => { if (c.state === 'running') unlocked = true; else grace = 0; }, () => { grace = 0; });
  } catch { /* no audio available */ }
}
for (const t of ['touchend', 'click', 'keydown']) addEventListener(t, wake, { capture: true, passive: true });
// Back into view (iOS: back from another app or a call): try at once; if the browser wants a gesture, the next one does it.
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !actx || held || audio.muted || actx.state === 'running') return;
  try { actx.resume().catch(() => {}); } catch { /* no audio available */ }
});

/** Whether a sound may be scheduled now: sound on, not held, a context running (or just woken by this gesture). A page
 *  the user has already acted on (a reload by script, an online rejoin: Chrome remembers the activation) makes its
 *  context on the first sound instead of waiting for the next gesture. */
function live() {
  if (!actx && !held && !audio.muted && globalThis.navigator?.userActivation?.hasBeenActive) wake();
  return !!actx && !held && !audio.muted && (actx.state === 'running' || audio.now() < grace);
}

/** The pause card up (`on`) or closed: the game's sound (effects, the wind, the voice) stops where it is and goes on
 *  after. The sound setting is not touched. Closed by a gesture (BACK TO GAME, P), the context resumes inside it. */
export function holdSound(on) {
  if (held === on) return;
  held = on;
  if (on) { grace = 0; stopSpeech(); try { actx?.suspend().catch(() => {}); } catch { /* no audio available */ } } else wake();
}

/** Where a sound sits: [gain 0..1, pan -1..1] from its world position (none = in the player's ear). */
function place(at) {
  const v = at && audio.view();
  if (!v) return [1, 0];
  const cx = v.x + v.w / 2, cy = v.y + v.h / 2, dx = at.x - cx, dy = at.y - cy;
  const out = Math.max(0, Math.hypot(dx / (v.w * 0.6), dy / (v.h * 0.6)) - 1); // 0 on screen, grows off it
  return [Math.max(0, 1 / (1 + out * 2.5) - 0.06), Math.max(-0.8, Math.min(0.8, dx / (v.w * 0.7)))]; // never all in one ear
}

/** One voice: a tone or a noise burst, enveloped, into a bus. */
function tone(bus, t, { f = 440, to, dur = 0.1, type = 'sine', vol = 0.1, att = 0.004, delay = 0 }) {
  const o = actx.createOscillator(), g = actx.createGain(), s = t + delay;
  o.type = type; o.frequency.setValueAtTime(f, s); if (to) o.frequency.exponentialRampToValueAtTime(to, s + dur);
  g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(vol, s + att); g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
  o.connect(g).connect(bus); o.start(s); o.stop(s + dur + 0.02);
}
function noise(bus, t, { dur = 0.1, vol = 0.1, filter = 'lowpass', f = 1200, to, q = 0.8, att = 0.003, delay = 0 }) {
  const n = actx.createBufferSource(), fl = actx.createBiquadFilter(), g = actx.createGain(), s = t + delay;
  n.buffer = noiseBuf; n.loop = true; fl.type = filter; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, s); if (to) fl.frequency.exponentialRampToValueAtTime(to, s + dur);
  g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(vol, s + att); g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
  n.connect(fl).connect(g).connect(bus); n.start(s, Math.random() * 0.5); n.stop(s + dur + 0.02);
}

/** Radio chirp pitch by unit type (src/client/look.js). */
const VOICE = UNIT_VOICE;

const SFX = {
  // interface
  select: (b, t, o) => { const p = VOICE[o.unit] || 600; tone(b, t, { f: p, to: p * 1.25, dur: 0.05, type: 'square', vol: 0.06 }); tone(b, t, { f: p * 1.5, dur: 0.05, type: 'square', vol: 0.05, delay: 0.055 }); },
  move: (b, t, o) => { const p = VOICE[o.unit] || 520; tone(b, t, { f: p * 1.2, to: p, dur: 0.07, type: 'triangle', vol: 0.09 }); noise(b, t, { dur: 0.05, vol: 0.02, filter: 'bandpass', f: 2500, q: 2 }); },
  attack: (b, t, o) => { const p = (VOICE[o.unit] || 480) * 0.8; tone(b, t, { f: p, to: p * 0.6, dur: 0.1, type: 'sawtooth', vol: 0.07 }); tone(b, t, { f: p * 0.6, dur: 0.08, type: 'sawtooth', vol: 0.06, delay: 0.09 }); },
  build: (b, t) => { tone(b, t, { f: 400, to: 600, dur: 0.08, type: 'triangle', vol: 0.06 }); noise(b, t, { dur: 0.06, vol: 0.03, filter: 'highpass', f: 3000, delay: 0.03 }); },
  error: (b, t) => { tone(b, t, { f: 170, dur: 0.09, type: 'square', vol: 0.05 }); tone(b, t, { f: 150, dur: 0.11, type: 'square', vol: 0.05, delay: 0.11 }); },
  alert: (b, t) => { for (let k = 0; k < 2; k++) { tone(b, t, { f: 620, to: 940, dur: 0.16, type: 'square', vol: 0.05, delay: k * 0.34 }); tone(b, t, { f: 940, to: 620, dur: 0.16, type: 'square', vol: 0.05, delay: k * 0.34 + 0.17 }); } },
  // news
  done: (b, t) => [523, 659, 784].forEach((f, k) => tone(b, t, { f, dur: 0.22, type: 'triangle', vol: 0.07, delay: k * 0.09 })),
  researched: (b, t) => { SFX.done(b, t); say('research', 0.35); }, // (after the chime)
  ready: (b, t) => { tone(b, t, { f: 440, dur: 0.08, type: 'triangle', vol: 0.05 }); tone(b, t, { f: 660, dur: 0.12, type: 'triangle', vol: 0.05, delay: 0.08 }); },
  coin: (b, t) => tone(b, t, { f: 1500, to: 1900, dur: 0.035, type: 'sine', vol: 0.018 }),
  // a unit of ours lost (heard wherever it falls), an enemy killed
  lost: (b, t) => { tone(b, t, { f: 330, to: 165, dur: 0.24, type: 'triangle', vol: 0.06 }); tone(b, t, { f: 247, to: 124, dur: 0.24, type: 'triangle', vol: 0.04, delay: 0.05 }); },
  kill: (b, t) => tone(b, t, { f: 220, to: 110, dur: 0.1, type: 'square', vol: 0.025 }),
  // weapons
  bolt: (b, t) => { tone(b, t, { f: 1700, to: 420, dur: 0.07, type: 'square', vol: 0.03 }); noise(b, t, { dur: 0.04, vol: 0.015, filter: 'highpass', f: 4000 }); },
  shell: (b, t) => { tone(b, t, { f: 110, to: 40, dur: 0.22, type: 'sine', vol: 0.14 }); noise(b, t, { dur: 0.18, vol: 0.08, filter: 'lowpass', f: 900, to: 200 }); },
  missile: (b, t) => { noise(b, t, { dur: 0.32, vol: 0.06, filter: 'bandpass', f: 900, to: 3200, q: 1.6, att: 0.04 }); tone(b, t, { f: 300, to: 900, dur: 0.18, type: 'sawtooth', vol: 0.02 }); },
  melee: (b, t) => noise(b, t, { dur: 0.05, vol: 0.04, filter: 'bandpass', f: 1800, q: 3 }),
  // Abilities (the cast event names them).
  stim: (b, t) => { tone(b, t, { f: 300, to: 900, dur: 0.18, type: 'sawtooth', vol: 0.03 }); noise(b, t, { dur: 0.12, vol: 0.02, filter: 'highpass', f: 2500 }); },
  entrench: (b, t) => { noise(b, t, { dur: 0.16, vol: 0.06, filter: 'lowpass', f: 600, to: 200 }); tone(b, t + 0.05, { f: 140, to: 90, dur: 0.18, type: 'square', vol: 0.03 }); },
  blink: (b, t) => { tone(b, t, { f: 1800, to: 400, dur: 0.14, type: 'sine', vol: 0.04 }); noise(b, t, { dur: 0.1, vol: 0.02, filter: 'bandpass', f: 3000, q: 2 }); },
  overcharge: (b, t) => { tone(b, t, { f: 220, to: 880, dur: 0.3, type: 'triangle', vol: 0.04 }); tone(b, t + 0.1, { f: 440, to: 1320, dur: 0.22, type: 'sine', vol: 0.02 }); },
  cloak: (b, t) => { noise(b, t, { dur: 0.35, vol: 0.03, filter: 'bandpass', f: 3500, to: 600, q: 3 }); tone(b, t, { f: 900, to: 300, dur: 0.3, type: 'sine', vol: 0.02 }); },
  veil: (b, t) => { tone(b, t, { f: 1320, to: 440, dur: 0.4, type: 'sine', vol: 0.025 }); tone(b, t + 0.05, { f: 1980, to: 660, dur: 0.35, type: 'sine', vol: 0.015 }); },
  // The Vael: glass and ceramic instead of powder and steel.
  lance: (b, t) => { tone(b, t, { f: 2400, to: 1300, dur: 0.12, type: 'sine', vol: 0.035 }); tone(b, t, { f: 3600, to: 1950, dur: 0.09, type: 'triangle', vol: 0.015 }); },
  slam: (b, t) => { tone(b, t, { f: 90, to: 55, dur: 0.35, type: 'sine', vol: 0.13 }); tone(b, t + 0.01, { f: 660, to: 520, dur: 0.3, type: 'triangle', vol: 0.025 }); noise(b, t, { dur: 0.12, vol: 0.04, filter: 'lowpass', f: 700 }); },
  blade: (b, t) => { noise(b, t, { dur: 0.07, vol: 0.035, filter: 'bandpass', f: 3200, to: 1400, q: 4 }); tone(b, t + 0.02, { f: 1500, to: 1100, dur: 0.06, type: 'sine', vol: 0.015 }); },
  // impacts and deaths
  hit: (b, t, o) => o.big ? noise(b, t, { dur: 0.16, vol: 0.09, filter: 'lowpass', f: 700, to: 150 }) : noise(b, t, { dur: 0.04, vol: 0.03, filter: 'bandpass', f: 2200, q: 1.5 }),
  boom: (b, t, o) => {
    const big = (o.r || 20) > 30;
    noise(b, t, { dur: big ? 0.9 : 0.45, vol: big ? 0.22 : 0.13, filter: 'lowpass', f: big ? 1400 : 1800, to: 120, att: 0.006 });
    tone(b, t, { f: big ? 70 : 95, to: 28, dur: big ? 0.8 : 0.4, type: 'sine', vol: big ? 0.2 : 0.1 });
    if (big) noise(b, t, { dur: 0.5, vol: 0.05, filter: 'highpass', f: 2500, delay: 0.12 }); // debris
  },
};

/** Minimum gap between two of the same effect (ms): busy fights stay readable. */
const GAP = { bolt: 45, melee: 70, hit: 40, coin: 120, missile: 90, shell: 70, lost: 250, kill: 120, lance: 45, slam: 80, blade: 70 };
const lastGain = {};

/** The announcer (`audio.announcer`: off, the device's voice or the synth) in this side's race's voice (`audio.voice`,
 *  a faction key): a phrase, at most once per its gap (an attack every 20 s), muted and held with the rest. */
const SAY_GAP = { attack: 20000, research: 3000, shards: 2500, ether: 2500 }, said = {};
let voiceBus = null, busyUntil = 0;
/** `after`: seconds to wait first (to follow the chime or siren it goes with instead of talking over it). One phrase
 *  at a time: a new one while another plays is dropped. Not while the audio is suspended (an iOS interruption), or
 *  the phrases would all come at once later. */
export function say(key, after = 0) {
  if (!audio.announcer || audio.muted || audio.quiet) return;
  const now = audio.now();
  if (said[key] !== undefined && now - said[key] < (SAY_GAP[key] ?? 3000)) return;
  if (!live()) return;
  if (audio.announcer === 'device' && deviceSay(key, after)) { said[key] = now; return; }
  try {
    if (actx.currentTime < busyUntil) return;
    said[key] = now;
    if (!voiceBus) { voiceBus = actx.createGain(); voiceBus.connect(master); }
    voiceBus.gain.cancelScheduledValues(actx.currentTime); voiceBus.gain.setValueAtTime(1, actx.currentTime);
    const at = actx.currentTime + 0.05 + after;
    busyUntil = at + speak(actx, voiceBus, key, audio.voice, at);
  } catch { /* no audio available */ }
}

/** The device's voice, if it has one for this race (false: the synth speaks instead). An attack cuts a line still
 *  speaking; any other line is dropped while one speaks. */
function deviceSay(key, after) {
  const style = `${audio.voice}Device`;
  if (!canSpeak(style)) return false;
  const go = () => { if (!audio.muted && !audio.quiet && !held) speakLine(key, style, { urgent: key === 'attack' }); };
  if (after > 0) setTimeout(go, after * 1000); else go();
  return true;
}

/**
 * Play an effect. `o` may carry a world position ({ x, y }: panned and faded by the camera), a unit type
 * ({ unit }: the radio voice), `big` (impacts) or `r` (explosion size).
 */
export function sfx(name, o = {}) {
  if (audio.muted) return;
  const recipe = SFX[name]; if (!recipe || !live()) return;
  const now = audio.now();
  try {
    const [g, pan] = place(o.x === undefined ? null : o);
    if (g <= 0.01) return; // too far to hear
    // One of a kind per short gap, unless this one is louder (an on-screen shot beats a distant one).
    if (last[name] && now - last[name] < (GAP[name] ?? 60) && g <= lastGain[name]) return;
    last[name] = now; lastGain[name] = g;
    const bus = actx.createGain(); bus.gain.value = g;
    if (pan && actx.createStereoPanner) { const p = actx.createStereoPanner(); p.pan.value = pan; bus.connect(p).connect(master); } else bus.connect(master);
    recipe(bus, actx.currentTime, o);
    startWind();
  } catch { /* no audio available */ }
}

/** The wind: filtered noise, its colour drifting slowly; very quiet, under everything. */
function startWind() {
  if (wind || audio.muted || !actx) return;
  const n = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain(), lfo = actx.createOscillator(), depth = actx.createGain();
  n.buffer = noiseBuf; n.loop = true; f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.7;
  lfo.frequency.value = 0.07; depth.gain.value = 180; lfo.connect(depth).connect(f.frequency);
  g.gain.setValueAtTime(0.0001, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.03, actx.currentTime + 3);
  n.connect(f).connect(g).connect(master); n.start(); lfo.start();
  wind = { n, lfo, g };
}
/** Sound switched on or off: the wind follows; switched on (a click), the context wakes. */
export function soundToggled() {
  if (!audio.muted) wake(); else stopSpeech();
  if (audio.muted && voiceBus) { try { voiceBus.gain.setTargetAtTime(0, actx.currentTime, 0.03); busyUntil = 0; } catch { /* no audio */ } } // (a phrase stops mid-word)
  if (audio.muted && wind) { try { wind.g.gain.setTargetAtTime(0.0001, actx.currentTime, 0.2); wind.n.stop(actx.currentTime + 1); wind.lfo.stop(actx.currentTime + 1); } catch { /* already stopped */ } wind = null; }
}
