// The controls video's cut: the recorded beats (record.mjs: target/controls/<beat>.mkv, 1688x780, no captions) laid
// on each version's timeline, the captions (target/controls/captions/*.png, overlay.mjs) laid over them where they
// fall, the tall version framed in its canvas (tall-bg.png), each encoded as H.264 (yuv420p, faststart, no sound)
// with a WebP poster, into public/docs/media/controls/ (committed web copies):
//   controls-phone.mp4        the whole, landscape 1688x780 (~42 s), captioned
//   controls-phone-9x16.mp4   the same framed 1080x1920, the captions under the phone
//   controls-loop.mp4         the essentials (select, hold then box, double-tap, ARMY and HOME), 844x390, under 400 KB
//   touch-<gesture>.mp4       one gesture each, 2-4 s, 844x390, no captions, under 150 KB
// The size-bound ones are encoded in two passes at the bitrate their budget allows.
//   node tools/controls/cut.mjs [--review DIR] [name ...]   (--review: copies and a contact sheet there too)
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FFMPEG } from '../trailer/record.mjs';
import { openStage } from '../trailer/stage.mjs';
import { sheet } from '../trailer/cut.mjs';
import { CAP_TOP, TALL_PHONE } from './overlay.mjs';

const root = new URL('../../', import.meta.url);
const SRC = fileURLToPath(new URL('target/controls', root)), DST = fileURLToPath(new URL('public/docs/media/controls', root));
const argv = process.argv.slice(2), ri = argv.indexOf('--review');
const review = ri >= 0 ? argv[ri + 1] : null;
const names = argv.filter((x, i) => !x.startsWith('--') && argv[i - 1] !== '--review');
const meta = JSON.parse(readFileSync(`${SRC}/beats.json`, 'utf8'));
const FADE = 0.25, KB = 1024;

/** The versions: the clips [beat, from, to] (seconds of the beat), the framing, the output width, the byte budget,
 *  and where the poster is taken (seconds of the version). */
export const VERSIONS = {
  'controls-phone': { kind: 'land', caps: true, w: 1688, crf: 22, clips: meta.beats.map(b => [b.id, 0, b.seconds]), poster: 10.0 },
  'controls-phone-9x16': { kind: 'tall', caps: true, crf: 22, clips: meta.beats.map(b => [b.id, 0, b.seconds]), poster: 10.0 },
  'controls-loop': { kind: 'land', caps: true, w: 844, budget: 400 * KB, clips: [['select', 0.6, 6.0], ['group', 0.5, 4.6], ['type', 0.7, 3.4], ['army', 0.7, 6.6]], poster: 7.2 },
  'touch-select': { kind: 'land', w: 844, budget: 150 * KB, clips: [['select', 1.0, 2.2], ['select', 3.6, 5.2]], poster: 1.9 },
  'touch-group': { kind: 'land', w: 844, budget: 150 * KB, clips: [['group', 0.9, 3.9]], poster: 2.0 },
  'touch-type': { kind: 'land', w: 844, budget: 150 * KB, clips: [['type', 1.0, 3.2]], poster: 1.2 },
  'touch-army': { kind: 'land', w: 844, budget: 150 * KB, clips: [['army', 1.0, 2.8], ['army', 5.0, 6.3]], poster: 1.4 },
  'touch-look': { kind: 'land', w: 844, budget: 150 * KB, clips: [['look', 0.85, 2.5], ['look', 4.25, 5.85]], poster: 2.6 },
  'touch-letgo': { kind: 'land', w: 844, budget: 150 * KB, clips: [['letgo', 0.9, 1.9], ['letgo', 3.2, 3.8], ['letgo', 4.4, 6.5]], poster: 2.6 },
};

const run = (args) => { const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' }); if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`); };
const probe = (file) => +spawnSync(FFMPEG.replace(/ffmpeg$/, 'ffprobe'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).stdout.toString().trim();

/** The clips on the version's timeline, and the captions that show during them: [{ file, tall, at, until, fade }]. */
function layout(v) {
  let at = 0; const clips = [], caps = [];
  for (const [id, from, to] of v.clips) {
    const b = meta.beats.find(b => b.id === id), len = to - from;
    clips.push({ id, from, to, at, len });
    if (v.caps) b.caps.forEach((c, i) => {
      const next = b.caps[i + 1]?.at ?? b.seconds, s = Math.max(c.at, from), e = Math.min(next, to);
      if (e > s) caps.push({ file: `${SRC}/captions/${id}-${i}${v.kind === 'tall' ? '-tall' : ''}.png`, at: at + s - from, until: at + e - from, fade: c.at >= from });
    });
    at += len;
  }
  return { clips, caps, total: at };
}

/** The ffmpeg inputs and filter graph of a version: the clips trimmed and joined, framed, the captions over them. */
function graph(v) {
  const { clips, caps, total } = layout(v);
  const inputs = clips.flatMap(c => ['-i', `${SRC}/${c.id}.mkv`]);
  const chains = clips.map((c, i) => `[${i}:v]trim=start=${c.from}:end=${c.to},setpts=PTS-STARTPTS,fps=${meta.fps}[c${i}]`);
  let n = clips.length, last = 'v0';
  chains.push(`${clips.map((_, i) => `[c${i}]`).join('')}concat=n=${clips.length}:v=1:a=0[${v.kind === 'tall' ? 'ph' : last}]`);
  if (v.kind === 'tall') { // (the phone's picture inside the outline drawn on the background)
    inputs.push('-loop', '1', '-t', total.toFixed(3), '-i', `${SRC}/captions/tall-bg.png`);
    chains.push(`[ph]scale=${TALL_PHONE.width * 2}:${TALL_PHONE.height * 2}[phs]`, `[${n}:v][phs]overlay=x=${(TALL_PHONE.left + TALL_PHONE.border) * 2}:y=${(TALL_PHONE.top + TALL_PHONE.border) * 2}[${last}]`);
    n++;
  }
  const capY = CAP_TOP[v.kind] * 2;
  caps.forEach((c, i) => {
    inputs.push('-loop', '1', '-t', total.toFixed(3), '-i', c.file);
    const fade = c.fade ? `,fade=t=in:st=${c.at.toFixed(3)}:d=${FADE}:alpha=1` : '';
    chains.push(`[${n}:v]format=rgba${fade}[k${i}]`, `[${last}][k${i}]overlay=x=(W-w)/2:y=${capY}:enable='between(t,${c.at.toFixed(3)},${c.until.toFixed(3)})'[v${i + 1}]`);
    last = `v${i + 1}`; n++;
  });
  const scale = v.w && v.w !== 1688 ? `scale=${v.w}:-2,` : '';
  chains.push(`[${last}]${scale}format=yuv420p[out]`);
  return { inputs, filter: chains.join(';'), total };
}

const COMMON = ['-r', String(meta.fps), '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-an', '-movflags', '+faststart'];

function cut(name, v) {
  const { inputs, filter, total } = graph(v), file = `${DST}/${name}.mp4`;
  const base = [...inputs, '-filter_complex', filter, '-map', '[out]', '-t', total.toFixed(3), ...COMMON];
  if (!v.budget) run([...base, '-crf', String(v.crf), file]);
  else { // (two passes at the bitrate the budget allows; a little lower again while the file is over)
    let kbps = Math.floor((v.budget * 8 / 1000) / total * 0.94);
    for (let k = 0; k < 4; k++) {
      const log = `${SRC}/pass-${name}`;
      run([...base, '-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.5)}k`, '-bufsize', `${kbps * 3}k`, '-pass', '1', '-passlogfile', log, '-f', 'null', '/dev/null']);
      run([...base, '-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.5)}k`, '-bufsize', `${kbps * 3}k`, '-pass', '2', '-passlogfile', log, file]);
      if (statSync(file).size <= v.budget) break;
      kbps = Math.floor(kbps * (v.budget / statSync(file).size) * 0.96);
    }
  }
  const poster = `${DST}/${name}.webp`;
  run(['-ss', String(v.poster), '-i', file, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '82', poster]);
  console.log(`cut: ${name}.mp4 (${probe(file).toFixed(2)} s, ${(statSync(file).size / KB).toFixed(0)} KB; poster ${(statSync(poster).size / KB).toFixed(0)} KB)`);
  return { file, poster, total };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(DST, { recursive: true });
  const done = {};
  for (const [name, v] of Object.entries(VERSIONS)) if (!names.length || names.includes(name)) done[name] = cut(name, v);
  if (review) {
    mkdirSync(review, { recursive: true });
    for (const d of Object.values(done)) for (const f of [d.file, d.poster]) copyFileSync(f, `${review}/${f.split('/').pop()}`);
    if (done['controls-phone']) { // (a still a moment after each caption)
      const stage = await openStage();
      try {
        let at = 0; const shots = [];
        for (const b of meta.beats) { for (const c of b.caps) shots.push([`${b.id}: ${c.html.replace(/<[^>]+>/g, '')} (${(at + c.at + 1.3).toFixed(1)} s)`, done['controls-phone'].file, at + c.at + 1.3]); at += b.seconds; }
        await sheet(stage, `${review}/contact-sheet.png`, shots, { cols: 3, w: 560 });
      } finally { await stage.close(); }
    }
  }
}
