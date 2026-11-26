// Cut 10: the painted opening with three short lines ("2047.", "1447. The expedition begins.", the King's "I wasn't
// expecting company."), the music from the castle's first frame (the track's own opening hit), then the game half from
// the raid (the track's biggest hit) to the end card, without the muster, the close fight or any caption. 1280x720.
//   TRAILER_NOCAP=1 node tools/trailer/v4/record.mjs --cut 10 late1 late2 late3      (the late shots without their caption)
//   TRAILER_NOCAP=1 node tools/trailer/v4/cut.mjs <music.mp3> target/trailer10/game  (the game master)
//   node tools/trailer/v7/cut10.mjs <shots dir> target/trailer10/game/trailer-16x9.mp4 <outDir> <music.mp3>
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { FFMPEG } from '../record.mjs';
import { openStage } from '../stage.mjs';
import { render } from '../sound.mjs';
import { typeTimes, typed, KING_AT, MUSIC } from '../v4/script.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const [shotsArg, gameArg, outArg, TRACK] = process.argv.slice(2);
if (!shotsArg || !gameArg || !outArg || !TRACK) throw new Error('cut10: <shots dir> <game master> <outDir> <music.mp3>');
const shots = resolve(shotsArg), game = resolve(gameArg), out = resolve(outArg), work = `${root}target/trailer10/final`;
rmSync(`${work}/cards`, { recursive: true, force: true }); mkdirSync(`${work}/cards`, { recursive: true }); mkdirSync(out, { recursive: true });
const ff = (args, capture = false) => { const r = spawnSync(FFMPEG, ['-y', '-hide_banner', '-nostats', '-loglevel', capture ? 'info' : 'error', ...args], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: capture ? 'pipe' : ['ignore', 'inherit', 'inherit'] }); if (r.status) throw new Error(`ffmpeg failed: ${args.join(' ')}`); return r.stderr; };
const loud = (file) => { const e = ff(['-i', file, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=50:print_format=json', '-f', 'null', '-'], true); return JSON.parse(e.slice(e.lastIndexOf('{'), e.lastIndexOf('}') + 1)); };

// ---- the timeline ----
// The track's beat grid (tools/trailer/music-grid.mjs): a beat every 0.7036 s from 0.005 s; its opening hit is beat 1.
// From the castle's first frame the track plays twelve beats from that hit, through the King; the cut into the game is
// the raid's first frame, on beat 57 of the track (cut 6's: its biggest hit), the same place in the bar as beat 1 + 12.
const BEAT = MUSIC.beat, HIT = 0.005 + BEAT, PRE = 12 * BEAT;
const CASTLE_LEN = 4.0, KING_LEN = PRE - CASTLE_LEN;
const SHOTS = [['lab-bots', 2.0, 6.0], ['arrival-b1', 1.0, 5.8], ['day1-bots', 0, 3.0], ['day2-m', 2.5, 7.0], ['castle-zoom', 0.5, 0.5 + CASTLE_LEN], ['king-far', 1.0, 1.0 + KING_LEN]];
const FPS = 24, starts = []; let acc = 0; for (const [, a, b] of SHOTS) { starts.push(acc); acc += b - a; }
const P = acc, M0 = starts[4], KS = starts[5];                  // the painted half's length; the music's start; the King's shot
// The game half: cut 6's master frames (30 fps; v4/script.mjs CUT): the raid, then the Watchtower to the end card.
const SEGS = [[652, 736], [821, null]];

// ---- the text ----
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const fade = (t, a, b, d = 0.25) => clamp01((t - a) / d) * clamp01((b - t) / d);
const line = (text, t0, cps = 20) => ({ text, times: typeTimes(text, t0, cps) });
const y2047 = line('2047.', 0.6, 5.5), y1447 = line('1447. The expedition begins.', starts[1] + 1.4, 20);
const CAPS = [{ l: y2047, from: 0.4, to: starts[1] - 0.25 }, { l: y1447, from: starts[1] + 1.3, to: starts[3] - 0.3 }];
const KING = { text: "I wasn't expecting company.", tag: 'THE KING', at: KS + 0.8 };
function state(t) {
  const c = CAPS.find(x => t >= x.from - 0.3 && t <= x.to + 0.3);
  const cap = c ? { alpha: fade(t, c.from, c.to), text: typed(c.l.text, c.l.times, t), cursor: Math.floor(t * 2.5) % 2 === 0 || t <= c.l.times.at(-1) + 0.08 } : null;
  return { cap, king: t < KING.at - 0.5 ? null : { shade: clamp01((t - KING.at + 0.5) / 0.5), line: clamp01((t - KING.at) / 0.3), tag: clamp01((t - KING.at - 0.7) / 0.3) } };
}
const ticks = CAPS.flatMap(c => [...c.l.text].map((ch, i) => (ch === ' ' ? null : c.l.times[i])).filter(x => x !== null));

const css = readFileSync(readdirSync(`${root}dist/assets`).filter(f => /^index-.*\.css$/.test(f)).map(f => `${root}dist/assets/${f}`)[0], 'utf8');
const faces = (css.match(/@font-face\{[^}]*\}/g) || []).filter(f => /Share Tech Mono|Chakra Petch/.test(f));
const fell = readFileSync(`${root}target/trailer4/fonts/IMFeENsc28P.ttf`).toString('base64');
const stage = await openStage();
try {
  const page = await stage.browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 4 / 3 });
  await page.route(`${stage.origin}blank.html`, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>' }));
  await page.goto(`${stage.origin}blank.html`);
  await page.setContent(`<!doctype html><style>${faces.join('').replace(/url\(\.\//g, `url(${stage.origin}assets/`)}
    @font-face{font-family:'IM Fell English SC';src:url(data:font/ttf;base64,${fell}) format('truetype')}
    html,body{margin:0;background:transparent;width:960px;height:540px;overflow:hidden}
    div{position:absolute}
    #shade{inset:0;background:linear-gradient(0deg,rgba(4,9,14,.78) 0,rgba(4,9,14,.45) 9%,rgba(4,9,14,0) 19%)}
    #cap{left:40px;bottom:24px;font-family:'Share Tech Mono',monospace;font-size:24px;white-space:nowrap;color:#bff3f6;text-shadow:0 0 8px rgba(79,209,197,.5),0 1px 2px rgba(0,0,0,.9)}
    .cur{display:inline-block;width:.55em;height:1em;background:#bff3f6;vertical-align:-.12em;margin-left:.15em;box-shadow:0 0 8px rgba(79,209,197,.7)}
    #kshade{inset:0;background:linear-gradient(270deg,rgba(8,7,4,.62) 0,rgba(8,7,4,.35) 34%,rgba(8,7,4,0) 56%)}
    #king{right:40px;top:120px;width:520px;font-family:'IM Fell English SC',serif;font-size:34px;letter-spacing:.02em;color:#f4ead2;text-shadow:0 2px 4px rgba(0,0,0,.9),0 0 18px rgba(0,0,0,.75)}
    #king div{position:static}
    #king .rule{width:76px;height:2px;background:#d9a441;margin:16px 0 10px;box-shadow:0 0 8px rgba(217,164,65,.5)}
    #king .tag{font-size:18px;letter-spacing:.2em;color:#d9a441}
    </style><div id="shade"></div><div id="cap"></div><div id="kshade"></div>
    <div id="king"><div class="l">${KING.text}</div><div class="rule"></div><div class="tag">${KING.tag}</div></div>`);
  await page.evaluate(async () => { await Promise.all([document.fonts.load('40px "Share Tech Mono"'), document.fonts.load('40px "IM Fell English SC"')]); await document.fonts.ready;
    if (!document.fonts.check('40px "Share Tech Mono"') || !document.fonts.check('40px "IM Fell English SC"')) throw new Error('cut10: a face did not load'); });
  const n = Math.round(P * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate((s) => {
      const $ = (id) => document.getElementById(id), c = s.cap, k = s.king;
      $('shade').style.opacity = c ? c.alpha : 0; $('cap').style.opacity = c ? c.alpha : 0;
      if (c) $('cap').innerHTML = `${c.text}<span class="cur" style="opacity:${c.cursor ? 1 : 0}"></span>`;
      $('kshade').style.opacity = k ? k.shade : 0; $('king').style.opacity = k ? 1 : 0;
      if (k) { $('king').querySelector('.l').style.opacity = k.line; for (const q of ['.rule', '.tag']) $('king').querySelector(q).style.opacity = k.tag; }
    }, state(i / FPS));
    await page.screenshot({ path: `${work}/cards/${String(i).padStart(4, '0')}.png`, omitBackground: true });
  }
  await render(stage, ticks.map(t => ({ t, name: 'tick', gain: 0.55, pan: -0.25 })), P, { from: 0, to: 0 }, `${work}/ticks.wav`);
} finally { await stage.close(); }

// ---- the painted half: the shots joined ----
const ins = SHOTS.flatMap(([f]) => ['-i', `${shots}/${f}.mp4`]);
const vch = SHOTS.map(([, a, b], i) => `[${i}:v]trim=${a}:${b},setpts=PTS-STARTPTS,fps=${FPS},scale=1280:720,setsar=1,format=yuv420p[v${i}]`);
const ach = SHOTS.map(([, a, b], i) => `[${i}:a]atrim=${a}:${b},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,afade=t=in:d=0.15,afade=t=out:st=${(b - a - 0.2).toFixed(3)}:d=0.2[a${i}]`);
const painted = `${work}/painted.mkv`;
ff([...ins, '-filter_complex', `${[...vch, ...ach].join(';')};${SHOTS.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${SHOTS.length}:v=1:a=1[v][a]`,
  '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '10', '-preset', 'fast', '-c:a', 'pcm_s24le', painted]);

// ---- the game half: the raid, then the Watchtower to the end card (a bar skipped between, 15 ms fades at the join) ----
const gameShort = `${work}/game-short.mkv`;
{
  const v = SEGS.map(([a, b], i) => `[0:v]trim=start_frame=${a}${b ? `:end_frame=${b}` : ''},setpts=PTS-STARTPTS[v${i}]`);
  const au = SEGS.map(([a, b], i) => `[0:a]atrim=start=${(a / 30).toFixed(4)}${b ? `:end=${(b / 30).toFixed(4)}` : ''},asetpts=PTS-STARTPTS,afade=t=in:d=0.015${b ? `,afade=t=out:st=${((b - a) / 30 - 0.015).toFixed(4)}:d=0.015` : ''}[a${i}]`);
  ff(['-i', game, '-filter_complex', `${[...v, ...au].join(';')};${SEGS.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${SEGS.length}:v=1:a=1[v][a]`, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '10', '-preset', 'fast', '-c:a', 'pcm_s24le', gameShort]);
}

// ---- the sound ----
// The shots' own sound (Gemini's) with the key ticks, quiet (-23 LUFS), and under the music from the castle on; the
// track from its opening hit, at the level it has in the master (matched on the master's King card, where the game is
// all but silent), placed so the hit lands on the castle's first frame; then the game half's own mix.
const quiet = `${work}/quiet.wav`;
ff(['-i', painted, '-i', `${work}/ticks.wav`, '-filter_complex', `[0:a]aformat=sample_rates=48000:channel_layouts=stereo[a];[1:a]aformat=sample_rates=48000:channel_layouts=stereo[b];[a][b]amix=inputs=2:normalize=0:duration=first[s]`, '-map', '[s]', '-t', P.toFixed(3), '-c:a', 'pcm_s24le', quiet]);
const qGain = -23 - +loud(quiet).input_i;
const ref = `${work}/ref.wav`, raw8 = `${work}/raw8.wav`, music = `${work}/music.wav`, PADS = 0.02;
ff(['-ss', String(KING_AT), '-t', (8 * BEAT).toFixed(4), '-i', game, '-vn', '-c:a', 'pcm_s24le', ref]);
ff(['-ss', String(MUSIC.in), '-t', (8 * BEAT).toFixed(4), '-i', TRACK, '-vn', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', raw8]);
const mGain = +loud(ref).input_i - +loud(raw8).input_i;
ff(['-ss', (HIT - PADS).toFixed(4), '-t', (PRE + PADS).toFixed(4), '-i', TRACK, '-vn', '-af', `aformat=sample_rates=48000:channel_layouts=stereo,volume=${mGain.toFixed(2)}dB,afade=t=in:d=0.005,afade=t=out:st=${(PRE + PADS - 0.015).toFixed(4)}:d=0.015`, '-c:a', 'pcm_s24le', music]);
const head = `${work}/head.wav`, sum = `${work}/sum.wav`;
ff(['-i', quiet, '-i', music, '-filter_complex',
  `[0:a]volume=${qGain.toFixed(2)}dB,volume='if(lt(t,${M0.toFixed(3)}),1,0.35)':eval=frame[q];[1:a]adelay=delays=${Math.round((M0 - PADS) * 1000)}:all=1[m];[q][m]amix=inputs=2:normalize=0:duration=longest,atrim=0:${P.toFixed(4)}[h]`,
  '-map', '[h]', '-c:a', 'pcm_s24le', head]);
ff(['-i', head, '-i', gameShort, '-filter_complex', `[1:a]aformat=sample_rates=48000:channel_layouts=stereo[g];[0:a][g]concat=n=2:v=0:a=1[s]`, '-map', '[s]', '-c:a', 'pcm_s24le', sum]);
const m = loud(sum), wav = `${work}/trailer.wav`;
ff(['-i', sum, '-af', `loudnorm=I=-16:TP=-1.2:LRA=50:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`, '-c:a', 'pcm_s16le', wav]);

// ---- the picture ----
const master = `${out}/ebbfall-trailer-720p.mp4`;
const vx = ['-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
ff(['-i', painted, '-framerate', String(FPS), '-i', `${work}/cards/%04d.png`, '-i', gameShort, '-i', wav, '-filter_complex',
  `[0:v]fps=30,setpts=PTS-STARTPTS[o];[1:v]fps=30,format=rgba[c];[o][c]overlay=0:0:eof_action=pass,trim=duration=${P.toFixed(4)},setpts=PTS-STARTPTS,format=yuv420p[a];` +
  `[2:v]scale=1280:720:flags=lanczos:out_color_matrix=bt709:out_range=tv,fps=30,setpts=PTS-STARTPTS,format=yuv420p[b];[a][b]concat=n=2:v=1:a=0[v]`,
  '-map', '[v]', '-map', '3:a', '-r', '30', ...vx, '-crf', '14', '-maxrate', '14M', '-bufsize', '28M', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', master]);
const total = +ff(['-i', master, '-f', 'null', '-'], true).match(/time=(\d+):(\d+):([\d.]+)/g).at(-1).slice(5).split(':').reduce((a, x) => a * 60 + +x, 0);
const site = `${out}/ebbfall-trailer.mp4`, kbps = Math.floor((7.2 * 8e3) / total) - 132;
ff(['-i', master, ...vx, '-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.6)}k`, '-bufsize', `${kbps * 2}k`, '-pass', '1', '-passlogfile', `${work}/x264`, '-an', '-f', 'null', '-']);
ff(['-i', master, ...vx, '-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.6)}k`, '-bufsize', `${kbps * 2}k`, '-pass', '2', '-passlogfile', `${work}/x264`, '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', site]);
ff(['-ss', (KING.at + 1.4).toFixed(3), '-i', master, '-frames:v', '1', '-q:v', '3', `${out}/poster.jpg`]);
writeFileSync(`${out}/credit.txt`, 'Strength of the Titans Kevin MacLeod (incompetech.com) / Licensed under Creative Commons: By Attribution 4.0 / https://creativecommons.org/licenses/by/4.0/ (edited)\n');
const fin = loud(master), size = (f) => `${(statSync(f).size / 1e6).toFixed(2)} MB`;
console.log(JSON.stringify({ seconds: +total.toFixed(2), starts, musicAt: +M0.toFixed(2), gameAt: +P.toFixed(2), loudness: { i: +fin.input_i, tp: +fin.input_tp }, master: size(master), site: size(site), siteKbps: kbps }, null, 1));
