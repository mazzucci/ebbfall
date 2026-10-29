// A synthesized voice, no recordings (the no-assets rule): a formant synthesizer. A buzz (the vocal cords: a
// sawtooth at the pitch) and a hiss (breath: filtered noise) go through three band-pass filters, the formants, whose
// frequencies glide from sound to sound; that glide is most of what makes speech legible. Phrases are written as
// phonemes. Each race has three styles of it (STYLES below), and the device's own voice (speech.js) besides; the
// announcer is off in the game for now (audio.js `audio.announcer`). voice-lab.html plays every phrase in every style.

// Phonemes: formants [F1, F2, F3] in Hz, their levels [A1, A2, A3], voicing, noise level and its band (Hz, Q), and
// a length in seconds. Consonants carry the formant positions vowels glide from and to (their loci).
const V = (f, dur, a = [1, 0.7, 0.25]) => ({ f, a, v: 1, n: 0, dur });
const P = {
  IY: V([270, 2290, 3010], 0.13), IH: V([390, 1990, 2550], 0.09), EH: V([530, 1840, 2480], 0.11),
  AE: V([660, 1720, 2410], 0.15), AH: V([640, 1190, 2390], 0.1), AX: V([500, 1400, 2400], 0.06),
  AA: V([730, 1090, 2440], 0.15), ER: V([490, 1350, 1690], 0.14), UW: V([300, 870, 2240], 0.13),
  EY: { ...V([480, 1800, 2520], 0.1), to: [300, 2200, 2900], toDur: 0.08 },
  L: { ...V([360, 1000, 2400], 0.08, [0.6, 0.3, 0.12]), son: true }, R: { ...V([420, 1300, 1600], 0.08, [0.7, 0.4, 0.15]), son: true },
  // (nasals: F1 above the radio's low cut, a little F2 so the murmur carries)
  M: { ...V([300, 1000, 2200], 0.07, [0.5, 0.15, 0.03]), son: true }, N: { ...V([300, 1600, 2600], 0.06, [0.5, 0.15, 0.04]), son: true },
  S: { f: [400, 1800, 2600], a: [0, 0, 0], v: 0, n: 0.4, nf: 4200, nq: 2, dur: 0.12 },
  SH: { f: [400, 1900, 2500], a: [0, 0, 0], v: 0, n: 0.45, nf: 2600, nq: 2.5, dur: 0.11 },
  // (weak fricatives: a broad, quiet hiss; Z is an S with the buzz under it)
  F: { f: [400, 1400, 2400], a: [0, 0, 0], v: 0, n: 0.22, nf: 1700, nq: 0.6, dur: 0.1 },
  TH: { f: [400, 1700, 2600], a: [0, 0, 0], v: 0, n: 0.16, nf: 3000, nq: 0.7, dur: 0.09 },
  Z: { f: [300, 1700, 2600], a: [0.3, 0.05, 0.02], v: 0.45, n: 0.3, nf: 4000, nq: 2, dur: 0.1 },
  // Stops: a closure (silence, a murmur if voiced), a burst of noise, then breath if unvoiced.
  B: { stop: true, f: [250, 800, 2200], voiced: true, nf: 900, nq: 0.8 },
  D: { stop: true, f: [250, 1800, 2600], voiced: true, nf: 3500, nq: 1 },
  P: { stop: true, f: [250, 800, 2200], nf: 900, nq: 0.8 },
  T: { stop: true, f: [300, 1800, 2700], nf: 3400, nq: 1.2 },
  K: { stop: true, f: [300, 2000, 2600], nf: 2200, nq: 1.5 },
};

// Phrases: [phoneme, length factor, stress] ('_' a short pause). Stress raises the pitch and lengthens.
export const PHRASES = {
  attack: { text: 'Base under attack', ph: [['B'], ['EY', 1.3, 1], ['S'], ['_', 0.5], ['AH', 1, 0.3], ['N'], ['D', 0.8], ['ER', 0.8], ['AX'], ['T'], ['AE', 1.2, 1], ['K']] },
  research: { text: 'Research complete', ph: [['R'], ['IY', 1.1, 1], ['S', 0.8], ['ER', 1.0, 0.4], ['T', 0.6], ['SH', 0.9], ['_', 0.4], ['K'], ['AX'], ['M'], ['P'], ['L'], ['IY', 1.4, 1], ['T']] },
  shards: { text: 'Not enough shards', ph: [['N'], ['AA', 1.1, 1], ['T', 0.7], ['_', 0.3], ['IH', 0.8], ['N'], ['AH', 1, 0.6], ['F'], ['_', 0.3], ['SH'], ['AA', 1.3, 1], ['R'], ['D', 0.7], ['Z']] },
  ether: { text: 'Not enough ether', ph: [['N'], ['AA', 1.1, 1], ['T', 0.7], ['_', 0.3], ['IH', 0.8], ['N'], ['AH', 1, 0.6], ['F'], ['_', 0.3], ['IY', 1.3, 1], ['TH'], ['ER', 1.2]] },
};

/**
 * The announcer's styles, three of this synthesizer and the device's voice per race (A, B, C, D in voice-lab.html).
 * The game's synth voice is STYLES[faction key] (audio.js `say`; `audio.announcer` switches it on): the lines naming
 * each race's below are the ones to change to swap it. A `device` style is the device's own voice (speech.js: the
 * Web Speech API), its `fallback` the synth style where the device has none; the rest are this synthesizer:
 * - `pitch` (Hz) and `rate` (1: the phonemes' own lengths), `vib`: vibrato depth (Hz, at 5.2 Hz);
 * - `tone`: a low-pass on the buzz alone (Hz: lower is rounder; the breath keeps its s), `fa`: the formants' levels;
 * - `voices`: copies of the voice, each { mul: pitch ratio, vol, delay (s), breath } (a unison double: a few cents
 *   apart, a few ms late); none: one voice;
 * - `radio`: a field radio ({ lo, hi } its band in Hz, `drive` its clipping (0: none), `squelch` [key down, key up]
 *   levels, `bed` its hiss); otherwise `hp` (Hz: no rumble under the voice), `shimmer` ({ f, level }: a quiet
 *   high-passed copy, the crystal in a Vael voice) and `room` ([[delay s, level]]: a few short reflections, no
 *   feedback, so no long tail);
 * - `gain`: the level out, set so every style is about as loud as the others (test/e2e/voice.e2e.mjs measures it).
 */
const HUMANS = {
  // A, clean radio: a wider band than the original's, no clipping, a faint click at key up.
  radio: { pitch: 104, rate: 1.05, vib: 1.0, radio: { lo: 300, hi: 5200, drive: 0, squelch: [0, 0.04], bed: 0 }, gain: 2.0 },
  // B, clear: no radio, a warm, clear voice in a small room.
  clear: { pitch: 110, rate: 1.0, vib: 0.8, tone: 3400, fa: [1.1, 1, 0.8], hp: 190, room: [[0.017, 0.08], [0.029, 0.05]], gain: 1.32 },
  // C, the original (in the game until 2026-10-28): a narrow band, a little clipping, squelch at both ends, a hiss.
  original: { pitch: 104, rate: 1.05, radio: { lo: 380, hi: 3900, drive: 2.5, squelch: [0.12, 0.16], bed: 0.012 }, gain: 0.9 },
  // D, the device's own voice: a natural voice at its normal pitch, a touch crisp.
  device: { device: { race: 'humans', pitch: 1, rate: 1.03 }, fallback: 'humans' },
};
const VAEL = {
  // A, clear: one clear voice a little above the operator's, bright but soft, a faint crystal shimmer, a short light room.
  clear: { pitch: 128, rate: 1.0, vib: 0.5, tone: 5200, fa: [1, 1, 0.9], hp: 220, shimmer: { f: 3000, level: 0.35 }, room: [[0.019, 0.1], [0.031, 0.07], [0.047, 0.04]], gain: 1.3 },
  // B, warm: softer and rounder, a little lower, calm; the lower formants a touch forward, almost dry.
  warm: { pitch: 118, rate: 0.95, vib: 0.4, tone: 2600, fa: [1.2, 1, 0.65], hp: 200, room: [[0.021, 0.05]], gain: 1.18 },
  // C, airy: a unison double (6 cents apart, 5 ms late, the breath on the first only), a light shimmer, short and dry.
  airy: { pitch: 124, rate: 1.0, vib: 0.4, tone: 4800, hp: 220, voices: [{ vol: 0.7 }, { mul: 2 ** (6 / 1200), vol: 0.6, delay: 0.005, breath: 0 }], shimmer: { f: 3200, level: 0.25 }, room: [[0.023, 0.05]], gain: 1.4 },
  // D, the device's own voice: another voice than the Humans' where there is one, higher and a little slower.
  device: { device: { race: 'vael', pitch: 1.2, rate: 0.95 }, fallback: 'vael' },
};
export const STYLES = {
  humansRadio: HUMANS.radio, humansClear: HUMANS.clear, humansOriginal: HUMANS.original, humansDevice: HUMANS.device,
  vaelClear: VAEL.clear, vaelWarm: VAEL.warm, vaelAiry: VAEL.airy, vaelDevice: VAEL.device,
  // Each race's synth voice in the game (audio.js `say`, when the announcer is on), the device voice's fallback too.
  humans: HUMANS.radio,
  vael: VAEL.clear,
};
/** The synth style a style speaks in here (a device style's fallback). */
export const synthStyle = (name) => { const s = STYLES[name] || STYLES.humans; return s.device ? STYLES[s.fallback] : s; };

let noiseBuf = null;
function noiseSource(ctx) {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); let s = 12345;
    for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) >>> 0; d[i] = s / 2 ** 31 - 1; } // (repeatable)
  }
  const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; return n;
}

/** The keyframes of a phrase: every parameter's value over time (straight lines between them). */
function frames(phrase, style) {
  const out = [], k = (t, s, f0) => out.push({ t, f: s.f, a: s.a, v: s.v, n: s.n, nf: s.nf || 1000, nq: s.nq || 1, f0 });
  const r = 1 / style.rate, words = phrase.ph, total = words.length;
  let t = 0.05, prev = P.AX;
  k(0, { ...prev, v: 0, n: 0 }, style.pitch); // (silent until the first sound)
  words.forEach(([name, len = 1, stress = 0], i) => {
    const decl = 1 - 0.15 * i / total, final = i >= total - 3 ? 0.9 : 1; // the pitch falls through the phrase
    const f0 = style.pitch * decl * final * (1 + 0.22 * stress);
    if (name === '_') { k(t + 0.01, { ...prev, v: 0, n: 0 }, f0); t += 0.08 * len * r; k(t, { ...prev, v: 0, n: 0 }, f0); return; }
    const p = P[name];
    if (p.stop) {
      const closure = { f: p.f, a: [0.25, 0.02, 0.01], v: p.voiced ? 0.25 : 0, n: 0 };
      k(t + 0.012, closure, f0); t += 0.055 * len * r; k(t, closure, f0);
      const burst = { f: p.f, a: [0, 0, 0], v: 0, n: 0.9, nf: p.nf, nq: p.nq };
      k(t + 0.004, burst, f0); t += 0.014; k(t, burst, f0);
      if (!p.voiced) { const asp = { f: p.f, a: [0, 0, 0], v: 0, n: 0.35, nf: 1800, nq: 0.7 }; k(t + 0.006, asp, f0); t += 0.035 * r; k(t, asp, f0); }
      prev = { ...closure, v: 0, stop: true }; return;
    }
    // The glide into a sound carries the consonant: slower out of a stop, slower still into or out of L, R, M, N.
    const trans = !p.v ? 0.02 : p.son || prev.son ? 0.07 : prev.stop ? 0.055 : 0.035;
    const dur = Math.max(trans + 0.015, p.dur * len * r * (1 + 0.25 * stress)); // (the glide is part of it)
    k(t + trans, p, f0);
    if (p.to) { t += dur; k(t, p, f0); t += p.toDur * r; k(t, { ...p, f: p.to }, f0 * 0.95); }
    else { t += dur; k(t, p, f0 * (stress ? 0.93 : 0.99)); }
    prev = p;
  });
  return { frames: out, end: t + 0.05 };
}

/** Speak a phrase into `dest` from time `at` (an AudioContext or OfflineAudioContext). Returns its length (s). */
export function speak(ctx, dest, key, styleName = 'humans', at = ctx.currentTime + 0.05) {
  const style = synthStyle(styleName), phrase = PHRASES[key];
  const { frames: fr, end } = frames(phrase, style);
  const out = ctx.createGain(); out.gain.value = style.gain ?? 0.9;
  if (style.radio) radio(ctx, out, dest, at, end, style.radio); else clean(ctx, out, dest, style);
  for (const v of style.voices || [{}]) oneVoice(ctx, out, fr, at, end, style, v);
  return end;
}

function oneVoice(ctx, out, fr, at, end, style, { mul = 1, vol = 1, delay = 0, breath = 1 }) {
  let into = out;
  if (delay) { const d = ctx.createDelay(0.05); d.delayTime.value = delay; d.connect(out); into = d; }
  const buzz = ctx.createOscillator(); buzz.type = 'sawtooth';
  const vib = ctx.createOscillator(), vibG = ctx.createGain(); vib.frequency.value = 5.2; vibG.gain.value = (style.vib ?? 1.2) * mul;
  vib.connect(vibG).connect(buzz.frequency);
  const vg = ctx.createGain(), hiss = noiseSource(ctx), hf = ctx.createBiquadFilter(), ng = ctx.createGain();
  hf.type = 'bandpass';
  const bands = [0, 1, 2].map(() => { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; const g = ctx.createGain(); b.connect(g).connect(into); return [b, g]; });
  if (style.tone) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = style.tone; lp.Q.value = 0.5; buzz.connect(lp).connect(vg); } else buzz.connect(vg);
  for (const [b] of bands) vg.connect(b);
  // Breath also passes the formants a little (aspiration), and straight out (fricatives).
  hiss.connect(hf).connect(ng).connect(into);
  const set = (param, v, t, first) => first ? param.setValueAtTime(v, t) : param.linearRampToValueAtTime(v, t);
  const BW = [90, 110, 170], level = vol * 0.5, fa = style.fa || [1, 1, 1];
  fr.forEach((f, i) => {
    const t = at + f.t, first = i === 0;
    set(buzz.frequency, f.f0 * mul, t, first);
    set(vg.gain, f.v * level, t, first);
    set(ng.gain, f.n * level * 0.6 * breath, t, first);
    set(hf.frequency, f.nf, t, first); set(hf.Q, f.nq, t, first);
    bands.forEach(([b, g], j) => { set(b.frequency, f.f[j], t, first); set(b.Q, f.f[j] / BW[j], t, first); set(g.gain, f.a[j] * fa[j] * [1, -2.0, 2.4][j], t, first); }); // (F2 inverted: parallel formants alternate sign)
  });
  for (const s of [buzz, vib, hiss]) { s.start(at); s.stop(at + end + 0.1); }
}

/** A field radio: a band, maybe a little clipping and a hiss under it, squelch at the ends. */
function radio(ctx, inp, dest, at, end, { lo, hi, drive, squelch: [down, up], bed }) {
  const hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  hp.type = 'highpass'; hp.frequency.value = lo; lp.type = 'lowpass'; lp.frequency.value = hi; // (high enough for an s)
  g.gain.value = 0.8;
  let chain = inp.connect(hp).connect(lp);
  if (drive) {
    const clip = ctx.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(drive * x) / Math.tanh(drive); }
    clip.curve = curve; chain = chain.connect(clip);
  }
  chain.connect(g).connect(dest);
  const burst = (t, dur, vol) => {
    const n = noiseSource(ctx), f = ctx.createBiquadFilter(), ng = ctx.createGain(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.6;
    ng.gain.setValueAtTime(vol, t); ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(f).connect(ng).connect(dest); n.start(t); n.stop(t + dur + 0.02);
  };
  if (down) burst(Math.max(0, at - 0.04), 0.05, down); // key down
  if (up) burst(at + end, 0.12, up); // key up
  if (!bed) return;
  const hiss = noiseSource(ctx), bf = ctx.createBiquadFilter(), bg = ctx.createGain(); bf.type = 'bandpass'; bf.frequency.value = 1800; bf.Q.value = 0.5;
  bg.gain.setValueAtTime(bed, at); bg.gain.setValueAtTime(0, at + end);
  hiss.connect(bf).connect(bg).connect(dest); hiss.start(at); hiss.stop(at + end + 0.02);
}

/** No radio: the rumble cut, then a shimmer (a quiet high-passed copy) and a few short reflections, if the style has
 *  them. Nothing feeds back, so it all goes quiet with the voice. */
function clean(ctx, inp, dest, { hp = 150, shimmer, room }) {
  const filter = (type, f, from) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = 0.7; from.connect(b); return b; };
  const dry = filter('highpass', hp, filter('highpass', hp, inp)); // (24 dB an octave below `hp`)
  dry.connect(dest);
  if (shimmer) { const g = ctx.createGain(); g.gain.value = shimmer.level; filter('highpass', shimmer.f, filter('highpass', shimmer.f, dry)).connect(g).connect(dest); }
  if (room) {
    const lit = filter('lowpass', 7000, filter('highpass', 300, dry)); // (light: no low end, not dark either)
    for (const [t, level] of room) { const d = ctx.createDelay(0.1), g = ctx.createGain(); d.delayTime.value = t; g.gain.value = level; lit.connect(d).connect(g).connect(dest); }
  }
}
