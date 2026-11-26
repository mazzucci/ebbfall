// Cut 4's cut: the recorded parts (record.mjs: target/trailer4/16x9/<part>.mkv) laid on the timeline (script.mjs CUT),
// the sound made (the game's own effects as the recorder logged them, its wind bed, a key tick of the game's for every
// typed character, a synthesized warp; then the music, "Strength of the Titans", from the King's card to its last chord
// on the end card, the game's sound under it), mixed to -16 LUFS with the true peak under -1 dBTP, and the deliverables
// written to the out folder: the master, the 720p web copy and its poster, a frame strip, the sound alone, credit.txt.
//   node tools/trailer/v4/cut.mjs <music.mp3> [outDir]     (default ../ebbfall-article/trailer-v4; FFMPEG as in record.mjs)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { FFMPEG } from '../record.mjs';
import { openStage } from '../stage.mjs';
import { timeline, render } from '../sound.mjs';
import { CUT, END, FPS, KING_AT, MUSIC, WARP_T, GROW_T, at, lengthOf, ticks } from './script.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const [music, outArg] = process.argv.slice(2);
if (!music) throw new Error('cut: the music file is the first argument');
const out = resolve(outArg || `${root}../ebbfall-article/trailer-v4`), work = `${root}target/trailer6/cut`;
// (cut 5: a part re-recorded for it is in target/trailer5/16x9/, the others are cut 4's)
const dirOf = (part) => [7, 6, 5, 4].map(n => `${root}target/trailer${n}/16x9`).find(d => existsSync(`${d}/${part}.mkv`)); // (the newest recording of a part: cut 6's opening, cut 5's DAY 675 and end card, cut 4's middle)
mkdirSync(out, { recursive: true }); mkdirSync(work, { recursive: true });
const ff = (args, capture = false) => { const r = spawnSync(FFMPEG, ['-y', '-hide_banner', '-nostats', '-loglevel', capture ? 'info' : 'error', ...args], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: capture ? 'pipe' : ['ignore', 'inherit', 'inherit'] }); if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}\n${r.stderr || ''}`); return r.stderr; };
const TOTAL = END / FPS, CARD_AT = at('card') / FPS;
const GAME_UNDER_DB = -7; // the game's sound under the music, once it enters
const QUIET_UP_DB = 14;   // the opening's quiet bed, lifted

/** The warp, in the page (an OfflineAudioContext): a whine rising from `grow` to `hit` (two oscillators and a band of
 *  noise sweeping up), cut dead by a low thump with air after it. */
function warpSynth(ctx, { grow, hit }) {
  const outG = ctx.createGain(); outG.gain.value = 1; outG.connect(ctx.destination);
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const env = (peak, t0, t1, shape = 'exp') => { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); if (shape === 'exp') g.gain.exponentialRampToValueAtTime(peak, t1); else g.gain.linearRampToValueAtTime(peak, t1); g.gain.setValueAtTime(peak, t1); g.gain.linearRampToValueAtTime(0, t1 + 0.012); g.connect(outG); return g; };
  const osc = (type, f0, f1, peak) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, grow); o.frequency.exponentialRampToValueAtTime(f1, hit); o.connect(env(peak, grow, hit)); o.start(grow); o.stop(hit + 0.02); };
  osc('sine', 160, 2200, 0.16); osc('triangle', 80, 1100, 0.09); osc('sine', 243, 3320, 0.05);
  const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(); n.buffer = noiseBuf; n.loop = true; bp.type = 'bandpass'; bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(300, grow); bp.frequency.exponentialRampToValueAtTime(6000, hit); n.connect(bp).connect(env(0.22, grow, hit)); n.start(grow); n.stop(hit + 0.02);
  // the thump
  const t = hit, sub = ctx.createOscillator(), sg = ctx.createGain(); sub.type = 'sine'; sub.frequency.setValueAtTime(82, t); sub.frequency.exponentialRampToValueAtTime(27, t + 0.9);
  sg.gain.setValueAtTime(0.0001, t); sg.gain.linearRampToValueAtTime(0.7, t + 0.012); sg.gain.exponentialRampToValueAtTime(0.0005, t + 1.5); sub.connect(sg).connect(outG); sub.start(t); sub.stop(t + 1.6);
  const burst = (type, f, peak, dur) => { const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuf; s.loop = true; fl.type = type; fl.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0004, t + dur); s.connect(fl).connect(g).connect(outG); s.start(t); s.stop(t + dur + 0.05); };
  burst('lowpass', 420, 0.5, 0.7); burst('highpass', 2600, 0.07, 1.9);
}

/** Loudness by loudnorm's analysis pass. */
function loudness(file, tp = -1.5) {
  const err = ff(['-i', file, '-af', `loudnorm=I=-16:TP=${tp}:LRA=50:print_format=json`, '-f', 'null', '-'], true);
  return JSON.parse(err.slice(err.lastIndexOf('{'), err.lastIndexOf('}') + 1));
}

// ---- the sound ----
const clips = CUT.map(([part, f0]) => ({ part, dir: dirOf(part), from: 0, to: lengthOf(part) / FPS, at: f0 / FPS })).filter(c => c.part !== 'card');
const events = [...timeline(clips), ...ticks().map(t => ({ t, name: 'tick', gain: 0.55, pan: -0.25 }))].sort((a, b) => a.t - b.t);
const gameWav = `${work}/game.wav`, stage = await openStage();
try { await render(stage, events, TOTAL, { from: 0, to: CARD_AT }, gameWav, warpSynth, { grow: GROW_T, hit: WARP_T }); } finally { await stage.close(); }
// The game's sound alone before the King's card (brought to about -22 LUFS there: quiet under what follows, the warp
// its loudest moment), then under the music; it stops with the picture, on the end card.
const pre = loudness(gameWav), gameGain = 2.64; // (cut 4's measured gain, -22 LUFS less its game track's loudness: kept, so the levels are cut 4's)
const bed = `${work}/music.wav`;
ff(['-i', music, '-filter_complex', `[0:a]atrim=start=${MUSIC.in}:end=${MUSIC.in + (TOTAL - KING_AT)},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,afade=t=in:st=0:d=0.008,adelay=delays=${Math.round(KING_AT * 1000)}:all=1[m];anullsrc=r=48000:cl=stereo,atrim=0:${TOTAL}[z];[z][m]amix=inputs=2:normalize=0:dropout_transition=0,apad,atrim=0:${TOTAL}[bed]`, '-map', '[bed]', '-c:a', 'pcm_s24le', '-ar', '48000', bed]);
const bedGain = -15 - +loudness(bed).input_i;
// The game's level over time: the quiet opening (the wind, the key ticks, the picks) lifted by QUIET_UP_DB, but not the
// warp (its whine and thump are loud as made: the lift eases off before it grows and back after the thump's tail), then
// under the music from the King's card.
const H = (10 ** (QUIET_UP_DB / 20)).toFixed(4), U = (10 ** (GAME_UNDER_DB / 20)).toFixed(4), A = GROW_T - 0.25, B = WARP_T + 1.5;
const ride = `if(lt(t,${A}),${H},if(lt(t,${A + 0.2}),${H}+(1-${H})*(t-${A})/0.2,if(lt(t,${B}),1,if(lt(t,${B + 0.6}),1+(${H}-1)*(t-${B})/0.6,if(lt(t,${KING_AT}),${H},${U})))))`.replace(/,/g, '\\,');
const sum = `${work}/sum.wav`;
ff(['-i', bed, '-i', gameWav, '-filter_complex',
  `[0:a]volume=${bedGain.toFixed(2)}dB[m];[1:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${gameGain.toFixed(2)}dB,volume='${ride}':eval=frame,afade=t=out:st=${(CARD_AT - 0.03).toFixed(3)}:d=0.03[g];[m][g]amix=inputs=2:normalize=0:duration=first[s]`,
  '-map', '[s]', '-c:a', 'pcm_s24le', sum]);
// To -16 LUFS by a plain gain (loudnorm's dynamic mode would flatten the quiet opening against the music), a limiter
// (4x oversampled) only where that gain pushes a peak over, then loudnorm's linear pass for the last fraction.
const m1 = loudness(sum), lim = `${work}/lim.wav`, wavOut = `${out}/trailer.wav`;
ff(['-i', sum, '-af', `volume=${(-16 - +m1.input_i).toFixed(2)}dB,aresample=192000,alimiter=limit=0.79:attack=2:release=60:level=disabled,aresample=48000`, '-c:a', 'pcm_s24le', lim]);
const m2 = loudness(lim, -1.2);
ff(['-i', lim, '-af', `loudnorm=I=-16:TP=-1.2:LRA=50:measured_I=${m2.input_i}:measured_TP=${m2.input_tp}:measured_LRA=${m2.input_lra}:measured_thresh=${m2.input_thresh}:offset=${m2.target_offset}:linear=true,aresample=48000`, '-c:a', 'pcm_s16le', wavOut]);

// ---- the picture ----
const inputs = CUT.flatMap(([part]) => ['-i', `${dirOf(part)}/${part}.mkv`]);
const chains = CUT.map(([part], i) => `[${i}:v]trim=start_frame=0:end_frame=${lengthOf(part)},setpts=PTS-STARTPTS,fps=${FPS}[v${i}]`);
const master = `${out}/trailer-16x9.mp4`;
ff([...inputs, '-i', wavOut, '-filter_complex', `${chains.join(';')};${CUT.map((_, i) => `[v${i}]`).join('')}concat=n=${CUT.length}:v=1:a=0,scale=1920:1080:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p[v]`,
  '-map', '[v]', '-map', `${CUT.length}:a`, '-r', String(FPS), '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-b:v', '22M', '-minrate', '16M', '-maxrate', '30M', '-bufsize', '44M',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', TOTAL.toFixed(3), '-movflags', '+faststart', master]);
// The web copy: 720p, two passes at a rate that lands under 6 MB with its sound.
const web = `${out}/trailer-16x9-720p.mp4`, kbps = Math.floor((5.7 * 8e3) / TOTAL) - 132, vf = 'scale=1280:720:flags=lanczos';
const x = ['-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.6)}k`, '-bufsize', `${kbps * 2}k`, '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-passlogfile', `${work}/web`];
ff(['-i', master, '-vf', vf, ...x, '-pass', '1', '-an', '-f', 'null', '-']);
ff(['-i', master, '-vf', vf, ...x, '-pass', '2', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', web]);
// The poster (the King's card, its last line and the name on: the film's own first statement, and it reads small) and a
// second one of the end card; the strip: a frame a second with its timecode.
const still = (t, file, w = 1280) => ff(['-ss', String(t), '-i', master, '-frames:v', '1', '-vf', `scale=${w}:-2:flags=lanczos`, '-q:v', '3', file]);
still(KING_AT + 3.6, `${out}/poster.jpg`); still(TOTAL - 0.5, `${out}/poster-endcard.jpg`);
console.log('cut: parts from', JSON.stringify(Object.fromEntries(CUT.map(([p]) => [p, +dirOf(p).match(/target\/trailer(\d)/)[1]]))));
// (this ffmpeg has no drawtext: the strip is laid out in a page)
{
  const n = Math.floor(TOTAL), stage = await openStage();
  try {
    ff(['-i', master, '-vf', 'fps=1,scale=480:270:flags=lanczos', '-q:v', '3', `${work}/strip-%03d.jpg`]); // (frame k: second k - 1)
    const page = await stage.browser.newPage({ viewport: { width: 8 * 486 + 6, height: 400 } });
    const cells = Array.from({ length: n }, (_, k) => `<figure><img src="data:image/jpeg;base64,${readFileSync(`${work}/strip-${String(k + 1).padStart(3, '0')}.jpg`).toString('base64')}"><figcaption>0:${String(k).padStart(2, '0')}</figcaption></figure>`).join('');
    await page.setContent(`<!doctype html><body style="margin:0;padding:6px;background:#0b0f16;display:grid;grid-template-columns:repeat(8,480px);gap:6px"><style>figure{margin:0;position:relative}img{display:block;width:480px;height:270px}figcaption{position:absolute;left:6px;top:6px;font:700 20px monospace;color:#fff;background:rgba(0,0,0,.65);padding:2px 7px}</style>${cells}</body>`);
    await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
    writeFileSync(`${out}/strip-1fps.png`, await page.screenshot({ fullPage: true }));
  } finally { await stage.close(); }
}
writeFileSync(`${out}/credit.txt`, 'Strength of the Titans Kevin MacLeod (incompetech.com) / Licensed under Creative Commons: By Attribution 4.0 / https://creativecommons.org/licenses/by/4.0/ (edited)\n');
const fin = loudness(master, -1), size = (f) => `${(statSync(f).size / 1e6).toFixed(2)} MB`;
const report = { seconds: TOTAL, music: { in: KING_AT, chord: CARD_AT, source: MUSIC }, gameGainDb: +gameGain.toFixed(2), gameUnderMusicDb: GAME_UNDER_DB, quietOpeningLiftDb: QUIET_UP_DB, gameAloneLufs: +pre.input_i,
  loudness: { integrated: +fin.input_i, truePeak: +fin.input_tp, range: +fin.input_lra }, wav: (({ input_i, input_tp }) => ({ integrated: +input_i, truePeak: +input_tp }))(loudness(wavOut, -1)),
  sizes: { master: size(master), web: size(web), wav: size(wavOut) }, webKbps: kbps };
writeFileSync(`${work}/report.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
for (const f of ['sum.wav', 'lim.wav']) rmSync(`${work}/${f}`, { force: true });
