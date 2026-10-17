// Synthesized sound effects via Web Audio. No asset files; each effect is one oscillator with an envelope.
let actx = null;
export const audio = { muted: false };
const last = {};
const SFX = {
  select: [880, 0.05, 'square', 0.05], move: [520, 0.06, 'triangle', 0.06], attack: [240, 0.1, 'sawtooth', 0.07],
  bolt: [1100, 0.05, 'square', 0.025, 300], shell: [140, 0.16, 'sawtooth', 0.07, 60], coin: [1400, 0.04, 'sine', 0.05],
  done: [660, 0.12, 'triangle', 0.08, 990], kill: [320, 0.16, 'sawtooth', 0.06, 60], lost: [220, 0.22, 'triangle', 0.08, 110],
  boom: [70, 0.45, 'sawtooth', 0.14, 25], error: [170, 0.12, 'square', 0.07], build: [400, 0.08, 'triangle', 0.06, 600],
};

export function sfx(name) {
  if (audio.muted) return;
  const s = SFX[name]; if (!s) return;
  const now = performance.now(); if (last[name] && now - last[name] < 60) return; last[name] = now;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
    o.type = s[2]; o.frequency.setValueAtTime(s[0], t); if (s[4]) o.frequency.exponentialRampToValueAtTime(s[4], t + s[1]);
    g.gain.setValueAtTime(s[3], t); g.gain.exponentialRampToValueAtTime(0.0001, t + s[1]);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + s[1] + 0.02);
  } catch (e) { /* no audio available */ }
}
