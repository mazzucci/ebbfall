// A check for cut 5's rule (nothing of the Kingdom before the King's card): every frame of a video from `from` to `to`
// seconds, at 480x270, counted for pixels of the Kingdom's seat blue (blue well over red and green; the diary's cyan
// and the base's teal are not). Prints the frames that have any, and the most in any frame; the King's card itself
// (run it over 14.4 to 18.6) is the calibration: its banner and trim count in the hundreds.
//   node tools/trailer/v4/bluecheck.mjs <video> <from> <to>
import { spawnSync } from 'node:child_process';
import { FFMPEG } from '../record.mjs';
const [file, from, to] = process.argv.slice(2), W = 480, H = 270;
const raw = spawnSync(FFMPEG, ['-v', 'error', '-ss', from, '-to', to, '-i', file, '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 30 }).stdout;
const n = raw.length / (W * H * 3), hits = []; let most = 0;
for (let f = 0; f < n; f++) {
  let c = 0; const o = f * W * H * 3;
  for (let i = 0; i < W * H * 3; i += 3) { const r = raw[o + i], g = raw[o + i + 1], b = raw[o + i + 2]; if (b > 140 && b > 1.6 * r && b > 1.25 * g) c++; }
  if (c) hits.push([(+from + f / 30).toFixed(2), c]); most = Math.max(most, c);
}
console.log(`${n} frames from ${from} to ${to} s: ${hits.length} with Kingdom-blue pixels, the most in one frame ${most}`);
if (hits.length) console.log(hits.slice(0, 12).map(([t, c]) => `${t}s:${c}`).join(' '), hits.length > 12 ? '...' : '');
