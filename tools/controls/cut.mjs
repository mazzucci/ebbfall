// The controls video's cut: the recorded beats (record.mjs: target/controls/<beat>.mkv, 1688x780, no captions) laid
// on each version's timeline, the captions (target/controls/captions/*.png, overlay.mjs) laid over them where they
// fall, the tall version framed in its canvas (tall-bg.png), each encoded as H.264 (yuv420p, faststart, no sound)
// with a WebP poster, into public/docs/media/controls/ (committed web copies):
//   controls-phone.mp4        the whole, landscape 1688x780 (~42 s), captioned
//   controls-phone-9x16.mp4   the same framed 1080x1920, the captions under the phone
//   controls-loop.mp4         the essentials (select, hold then box, double-tap, ARMY and HOME), 844x390, under 400 KB
//   touch-<gesture>.mp4       one gesture each, 2-4 s, 844x390, no captions, under 150 KB
// The size-bound ones are encoded in two passes at the bitrate their budget allows. A clip may punch in (`punch`:
// an eased zoom toward a point, held to the clip's end): the held button's details panel, readable at phone size.
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

/** The punch-in on the held button's details (the letgo beat): toward the panel and the card, from 0.5 s after the
 *  finger lands, over 0.5 s, as far as keeps the panel's top and the card's bottom row in (px of the 1688x780 frame;
 *  seconds of the beat); the caption goes as it starts (beats.mjs `until`). */
const DETAILS = { at: 4.7, d: 0.5, cx: 1023, cy: 457, z: 1.27 };
const whole = meta.beats.map(b => [b.id, 0, b.id === 'letgo' ? 8.4 : b.seconds, b.id === 'letgo' ? DETAILS : undefined]);
/** The versions: the clips [beat, from, to, punch?] (seconds of the beat), the framing, the output width, the byte
 *  budget, and where the poster is taken (seconds of the version). */
export const VERSIONS = {
  'controls-phone': { kind: 'land', caps: true, w: 1688, crf: 22, clips: whole, poster: 7.7 },
  'controls-phone-9x16': { kind: 'tall', caps: true, crf: 22, clips: whole, poster: 7.7 },
  'controls-loop': { kind: 'land', caps: true, w: 844, budget: 400 * KB, clips: [['select', 0.4, 5.6], ['group', 0.4, 4.3], ['type', 0.5, 3.2], ['army', 0.4, 6.4]], poster: 6.5 },
  'touch-select': { kind: 'land', w: 844, budget: 150 * KB, clips: [['select', 0.7, 1.9], ['select', 3.2, 5.0]], poster: 1.6 },
  'touch-group': { kind: 'land', w: 844, budget: 150 * KB, clips: [['group', 0.7, 3.7]], poster: 1.0 },
  'touch-type': { kind: 'land', w: 844, budget: 150 * KB, clips: [['type', 0.7, 2.9]], poster: 1.2 },
  'touch-army': { kind: 'land', w: 844, budget: 150 * KB, clips: [['army', 0.7, 2.5], ['army', 4.5, 5.9]], poster: 1.5 },
  'touch-look': { kind: 'land', w: 844, budget: 150 * KB, clips: [['look', 0.75, 2.4], ['look', 3.85, 5.5]], poster: 2.6 },
  'touch-letgo': { kind: 'land', w: 844, budget: 150 * KB, clips: [['letgo', 0.8, 1.8], ['letgo', 2.9, 3.5], ['letgo', 4.0, 6.8, DETAILS]], poster: 3.4 },
};
/** The review sheet's extra stills besides one near the end of each caption: the moments themselves (seconds of the beat). */
const MOMENTS = [['group', 1.3, 'the ring fills'], ['letgo', 1.2, 'Deselect tapped']];

const run = (args) => { const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' }); if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`); };
const probe = (file) => +spawnSync(FFMPEG.replace(/ffmpeg$/, 'ffprobe'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).stdout.toString().trim();

/** The clips on the version's timeline, and the captions that show during them: [{ file, at, until, fade, out }]
 *  (`fade`: it comes in here; `out`: it goes before the clip's end). */
function layout(v) {
  let at = 0; const clips = [], caps = [];
  for (const [id, from, to, punch] of v.clips) {
    const b = meta.beats.find(b => b.id === id), len = to - from;
    clips.push({ id, from, to, at, len, punch });
    if (v.caps) b.caps.forEach((c, i) => {
      // (`until` is the landscape cut's: its caption goes as the punch-in takes the screen; the tall cut's caption sits under the phone and stays)
      const next = Math.min(b.caps[i + 1]?.at ?? b.seconds, v.kind === 'tall' ? Infinity : c.until ?? Infinity), s = Math.max(c.at, from), e = Math.min(next, to);
      if (e > s) caps.push({ file: `${SRC}/captions/${id}-${i}${v.kind === 'tall' ? '-tall' : ''}.png`, at: at + s - from, until: at + e - from, fade: c.at >= from, out: v.kind !== 'tall' && c.until != null && c.until <= to });
    });
    at += len;
  }
  return { clips, caps, total: at };
}

/** The ffmpeg inputs and filter graph of a version: the clips trimmed and joined, framed, the captions over them. */
function graph(v) {
  const { clips, caps, total } = layout(v);
  const inputs = clips.flatMap(c => ['-i', `${SRC}/${c.id}.mkv`]);
  const chains = clips.map((c, i) => `[${i}:v]trim=start=${c.from}:end=${c.to},setpts=PTS-STARTPTS,fps=${meta.fps}${c.punch ? punch(c) : ''}[c${i}]`);
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
    const fade = (c.fade ? `,fade=t=in:st=${c.at.toFixed(3)}:d=${FADE}:alpha=1` : '') + (c.out ? `,fade=t=out:st=${(c.until - FADE).toFixed(3)}:d=${FADE}:alpha=1` : '');
    chains.push(`[${n}:v]format=rgba${fade}[k${i}]`, `[${last}][k${i}]overlay=x=(W-w)/2:y=${capY}:enable='between(t,${c.at.toFixed(3)},${c.until.toFixed(3)})'[v${i + 1}]`);
    last = `v${i + 1}`; n++;
  });
  const scale = v.w && v.w !== 1688 ? `scale=${v.w}:-2,` : '';
  chains.push(`[${last}]${scale}format=yuv420p[out]`);
  return { inputs, filter: chains.join(';'), total };
}

/** The zoompan of a clip's punch-in (an eased zoom toward its point, from its start, held). */
function punch({ punch: p, from }) {
  const k = `min(max((in/${meta.fps}-${(p.at - from).toFixed(3)})/${p.d},0),1)`;
  return `,zoompan=z='st(0,${k});1+${(p.z - 1).toFixed(3)}*ld(0)*ld(0)*(3-2*ld(0))':x='min(max(${p.cx}-iw/zoom/2,0),iw-iw/zoom)':y='min(max(${p.cy}-ih/zoom/2,0),ih-ih/zoom)':d=1:s=1688x780:fps=${meta.fps}`;
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
    if (done['controls-phone']) { // (a still near the end of each caption, the game's answer under it; and the moments)
      const stage = await openStage();
      try {
        let at = 0; const shots = [], file = done['controls-phone'].file, text = (h) => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
        for (const b of meta.beats) {
          b.caps.forEach((c, i) => { const t = at + (c.still ?? (b.caps[i + 1]?.at ?? b.seconds) - 0.4); shots.push([`${b.id}: ${text(c.html)} (${t.toFixed(1)} s)`, file, t]); });
          for (const [id, m, label] of MOMENTS) if (id === b.id) shots.push([`${b.id}: ${label} (${(at + m).toFixed(1)} s)`, file, at + m]);
          at += b.seconds;
        }
        shots.sort((a, b) => a[2] - b[2]);
        await sheet(stage, `${review}/contact-sheet.png`, shots, { cols: 3, w: 560 });
      } finally { await stage.close(); }
    }
  }
}
