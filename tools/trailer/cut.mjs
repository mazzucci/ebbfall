// The trailer's cut: the recorded parts (record.mjs: target/trailer/<format>/<part>.mkv) laid on each version's
// timeline (the storyboard's shot table, 30.0 s; opening B: the black card head; the YouTube version: the end card
// held to 0:40), the game's sound under them (sound.mjs), encoded for upload: H.264 High at 30 fps, 22 Mb/s (16 at the least:
// the platforms re-encode from a clean source), AAC 192 kb/s, BT.709. Then a contact sheet per format, one still per shot.
//   node tools/trailer/cut.mjs [outDir]      (default target/trailer/cut/; FFMPEG as in record.mjs)
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FFMPEG } from './record.mjs';
import { openStage } from './stage.mjs';
import { timeline, render } from './sound.mjs';

const root = new URL('../../', import.meta.url);
const out = process.argv[2] || fileURLToPath(new URL('target/trailer/cut', root));
const dirOf = (fmt) => fileURLToPath(new URL(`target/trailer/${fmt}`, root));

/** Opening A and the body after it: [part, in, out] (seconds of the part). */
const A_HEAD = [['arrival', 0, 4.6]];
const B_HEAD = [['black', 0, 1.3], ['arrival', 0.8, 4.9]]; // (the field 0.6 s, the flash at 1.9, the line at 2.5)
const body = (closeTo = 2.2) => [['mine', 0, 1.6], ['build', 0, 1.6], ['hold', 0, 1.8], ['push', 0, 1.8], ['raid', 0, 1.6],
  ['phone', 0, 1.8], ['wide', 0, 2.6], ['close', 0, closeTo], ['siege', 0, 3.4], ['freeze', 0, 2.0]];
export const VERSIONS = {
  'trailer-16x9-A': { fmt: '16x9', clips: [...A_HEAD, ...body(), ['card', 0, 5.0]] },
  'trailer-16x9-B': { fmt: '16x9', clips: [...B_HEAD, ...body(1.4), ['card', 0, 5.0]] }, // (shot 11 gives B its 0.8 s)
  'trailer-9x16': { fmt: '9x16', clips: [...A_HEAD, ...body(), ['card', 0, 5.0]] },
  'trailer-youtube-hold': { fmt: '16x9', clips: [...A_HEAD, ...body(), ['cardyt', 0, 3.5, 15.0]] }, // (held to 0:40)
};
/** Sounds of the game's that the recording cannot log: the flash's thud, the game's big boom (audio.js). */
const EXTRA = { arrival: [{ t: 1.4, name: 'boom', r: 40, gain: 1, pan: 0 }] };

const run = (args) => { const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' }); if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`); };
const probe = (file) => +spawnSync(FFMPEG.replace(/ffmpeg$/, 'ffprobe'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).stdout.toString().trim();

/** Lay out a version: each clip's place on the timeline. */
function layout(v) {
  let at = 0;
  return v.clips.map(([part, from, to, len]) => { const c = { part, dir: dirOf(v.fmt), from, to, at, len: len ?? to - from }; at += c.len; return c; });
}

async function cut(stage, name, v) {
  const clips = layout(v), total = clips.reduce((s, c) => s + c.len, 0);
  // The sound: the wind from the first frame of the field to the freeze; the effects where they fall.
  const field = clips.find(c => c.part !== 'black'), freeze = clips.find(c => c.part === 'freeze');
  const wavFile = `${out}/${name}.wav`;
  await render(stage, timeline(clips, EXTRA), total, { from: field.at, to: freeze.at }, wavFile);
  const inputs = clips.flatMap(c => ['-i', `${c.dir}/${c.part}.mkv`]);
  const chains = clips.map((c, i) => `[${i}:v]trim=start=${c.from}:end=${c.to},setpts=PTS-STARTPTS,fps=30${c.len > c.to - c.from + 1e-6 ? `,tpad=stop_mode=clone:stop_duration=${(c.len - (c.to - c.from)).toFixed(3)}` : ''}[v${i}]`);
  const filter = `${chains.join(';')};${clips.map((_, i) => `[v${i}]`).join('')}concat=n=${clips.length}:v=1:a=0,format=yuv420p[v];[${clips.length}:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]`;
  const file = `${out}/${name}.mp4`;
  run([...inputs, '-i', wavFile, '-filter_complex', filter, '-map', '[v]', '-map', '[a]', '-r', '30',
    '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-b:v', '22M', '-minrate', '16M', '-maxrate', '30M', '-bufsize', '44M',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '192k', '-t', total.toFixed(3), '-movflags', '+faststart', file]);
  console.log(`cut: ${name}.mp4 (${probe(file).toFixed(2)} s, ${(statSync(file).size / 1e6).toFixed(1)} MB)`);
  return { file, clips };
}

/** The storyboard's shots and where each one's still is taken on the A timeline (seconds). */
const SHOTS = [['1 the field', 0.7], ['2 the flash', 1.48], ['3 the line', 3.6], ['4 MINE', 5.4], ['5 BUILD', 7.3], ['6 HOLD', 8.7],
  ['7 PUSH', 10.5], ['8 the raid', 12.2], ['9 the phone', 14.3], ['10 the armies meet', 16.1], ['11 close', 18.5],
  ['12 the siege', 22.6], ['13 the freeze', 24.6], ['14 the end card', 29.7]];

/** A contact sheet: one still per shot (and `more`: [label, file, time]), labeled, in a grid. */
async function sheet(stage, file, video, fmt, more = []) {
  const shots = [...SHOTS.map(([l, t]) => [l, video, t]), ...more];
  const imgs = shots.map(([label, src, t], i) => {
    const png = fileURLToPath(new URL(`target/trailer/still-${i}.png`, root));
    run(['-ss', String(t), '-i', src, '-frames:v', '1', '-vf', `scale=${fmt === '16x9' ? 640 : 300}:-1`, png]);
    return { label, data: readFileSync(png).toString('base64') };
  });
  const cols = fmt === '16x9' ? 4 : 8, w = fmt === '16x9' ? 640 : 300;
  const page = await stage.browser.newPage({ viewport: { width: cols * (w + 12) + 12, height: 400 } });
  try {
    await page.setContent(`<!doctype html><body style="margin:0;padding:12px;background:#0b0f16;font:600 15px system-ui,sans-serif;color:#dde5ee;display:grid;grid-template-columns:repeat(${cols},${w}px);gap:12px">
      ${imgs.map(m => `<figure style="margin:0"><img style="display:block;width:${w}px" src="data:image/png;base64,${m.data}"><figcaption style="padding:4px 2px">${m.label}</figcaption></figure>`).join('')}</body>`);
    await page.waitForLoadState('load');
    writeFileSync(file, await page.screenshot({ fullPage: true }));
  } finally { await page.close(); }
  console.log(`cut: ${file}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(out, { recursive: true });
  const stage = await openStage();
  try {
    const done = {};
    for (const [name, v] of Object.entries(VERSIONS)) done[name] = await cut(stage, name, v);
    await sheet(stage, `${out}/contact-16x9.png`, done['trailer-16x9-A'].file, '16x9', [['B: the black card', done['trailer-16x9-B'].file, 0.6], ['B: the flash', done['trailer-16x9-B'].file, 1.95], ['YouTube: the hold', done['trailer-youtube-hold'].file, 39.0]]);
    await sheet(stage, `${out}/contact-9x16.png`, done['trailer-9x16'].file, '9x16');
  } finally { await stage.close(); }
}
