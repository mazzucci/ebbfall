// The music's beat grid (for laying the trailer's cuts on its bars): the onset envelope of an audio file (energy rise
// per 5 ms hop, low band and full band), the beat period and phase that fit it best, and how strong each beat of the
// grid is (so the bar's length and its downbeat show: the beat class with the most low-band weight).
//   node tools/trailer/music-grid.mjs <ffmpeg> <audio file> [minPeriod maxPeriod]
import { spawnSync } from 'node:child_process';
const [ff, file, pMin = '0.6', pMax = '0.8'] = process.argv.slice(2);
const SR = 22050, HOP = 110;
const raw = spawnSync(ff, ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 }).stdout;
const x = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
// a one-pole low-pass at about 150 Hz for the low band
const lowp = new Float32Array(x.length); { let y = 0; const a = 1 - Math.exp(-2 * Math.PI * 150 / SR); for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); lowp[i] = y; } }
const n = Math.floor(x.length / HOP), fps = SR / HOP;
const env = (s) => { const e = new Float64Array(n); for (let i = 0; i < n; i++) { let v = 0; for (let k = i * HOP; k < (i + 1) * HOP; k++) v += s[k] * s[k]; e[i] = Math.log10(v / HOP + 1e-9); } const o = new Float64Array(n); for (let i = 4; i < n; i++) o[i] = Math.max(0, e[i] - Math.max(e[i - 2], e[i - 3], e[i - 4])); return o; };
const full = env(x), low = env(lowp);
const at = (o, t) => { const i = Math.round(t * fps); let m = 0; for (let k = i - 5; k <= i + 5; k++) if (k >= 0 && k < n) m = Math.max(m, o[k]); return m; };
const end = 55; // (the last chord rings from about 54 s)
let best = { s: -1 };
for (let p = +pMin; p <= +pMax; p += 0.0002) for (let ph = 0; ph < p; ph += 0.005) {
  let s = 0, c = 0; for (let t = ph; t < end; t += p) { s += at(full, t) + at(low, t); c++; }
  if (s / c > best.s) best = { s: s / c, p, ph };
}
console.log(`period ${best.p.toFixed(4)} s (${(60 / best.p).toFixed(2)} bpm), phase ${best.ph.toFixed(3)} s, score ${best.s.toFixed(3)}`);
const beats = []; for (let t = best.ph, i = 0; t < end + 1; t += best.p, i++) beats.push({ i, t, f: at(full, t), l: at(low, t) });
for (const m of [2, 3, 4, 6, 8]) { const cls = Array.from({ length: m }, () => 0); for (const b of beats) cls[b.i % m] += b.l + b.f; console.log(`mod ${m}: ${cls.map(v => v.toFixed(1)).join(' ')}`); }
console.log(beats.map(b => `${b.i}:${b.t.toFixed(2)} ${'#'.repeat(Math.round(b.f * 8))}|${'='.repeat(Math.round(b.l * 8))}`).join('\n'));
