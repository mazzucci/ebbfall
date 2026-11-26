// Cut 8, the teaser: the painted shots (Gemini: ../ebbfall-article/nano-test/trailer/, not in the repo) at nearly their
// full length with the diary typed over them, the King's three lines over his own painted shot as the music enters, then the
// next dawn's conflict (DAY 13), then the end card on the music's last chord. No gameplay. 1280x720 throughout (nothing scaled up).
//   node tools/trailer/v4/cut.mjs <music.mp3> target/trailer7/game     (cut 6's game master: its music and its end card)
//   node tools/trailer/v7/teaser.mjs <shots dir> target/trailer7/game/trailer-16x9.mp4 <outDir> <music.mp3>
// Writes <outDir>/ebbfall-trailer-720p.mp4 (YouTube: high rate), ebbfall-trailer.mp4 (the site: under 8 MB), poster.jpg.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { FFMPEG } from '../record.mjs';
import { openStage } from '../stage.mjs';
import { render } from '../sound.mjs';
import { typeTimes, typed, KING_AT, MUSIC, KING, at, FPS as GFPS, END } from '../v4/script.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const [shotsArg, gameArg, outArg, TRACK] = process.argv.slice(2);
if (!shotsArg || !gameArg || !outArg || !TRACK) throw new Error('teaser: <shots dir> <game master> <outDir> <music.mp3>');
const shots = resolve(shotsArg), game = resolve(gameArg), out = resolve(outArg), work = `${root}target/trailer7/teaser`;
rmSync(`${work}/cards`, { recursive: true, force: true }); mkdirSync(`${work}/cards`, { recursive: true }); mkdirSync(out, { recursive: true });
const ff = (args, capture = false) => { const r = spawnSync(FFMPEG, ['-y', '-hide_banner', '-nostats', '-loglevel', capture ? 'info' : 'error', ...args], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: capture ? 'pipe' : ['ignore', 'inherit', 'inherit'] }); if (r.status) throw new Error(`ffmpeg failed: ${args.join(' ')}`); return r.stderr; };
const loud = (file) => { const e = ff(['-i', file, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=50:print_format=json', '-f', 'null', '-'], true); return JSON.parse(e.slice(e.lastIndexOf('{'), e.lastIndexOf('}') + 1)); };

// ---- the shots: [file, from, to] (the arrival keeps its 5.8 s out: its last frame is DAY 1's first) ----
// The King's shot is held on its last frame to reach the conflict's cut, eight beats after his first line; the conflict
// (DAY 13: the King's small band rides at the Data center at dawn) runs eight beats more, then the card on the chord.
const BAR8 = 8 * MUSIC.beat;
// `--no-fight` (cut 9): no conflict: the King's lines, then the end card on the chord.
const NOFIGHT = process.argv.includes('--no-fight');
const SHOTS = [['lab-bots', 0, 6.0], ['arrival-b1', 0, 5.8], ['day1-bots', 0, 6.0], ['day2-m', 0.3, 7.0], ['castle-zoom', 0, 6.0], ['king-far', 0, 6.0], ...(NOFIGHT ? [] : [['conflict-e2', 0.2, 0.2 + BAR8]])];
const FPS = 24, starts = []; let acc = 0; for (const [, a, b] of SHOTS) { starts.push(acc); acc += b - a; }
const KING_SHOT = starts[5], QUIET = 1.2, K = KING_SHOT + QUIET;           // the music's downbeat: the King's first line
const HOLD = K + BAR8 - (KING_SHOT + SHOTS[5][2] - SHOTS[5][1]);                                           // the King's last frame held to the conflict
for (let i = 6; i < starts.length; i++) starts[i] += HOLD;
const FIGHT = K + BAR8, CARD0 = NOFIGHT ? FIGHT : K + 2 * BAR8;
// `--music-at <s>` (cut 9: 6, the arrival's first frame): the music from there, one piece to the chord on the card (faded
// in under the rift's thunder), the shots' own sound under it; without, from the King's first line.
const MSTART = process.argv.includes('--music-at') ? +process.argv[process.argv.indexOf('--music-at') + 1] : K;
const CARD_AT = at('card') / GFPS, CARD_LEN = END / GFPS - CARD_AT, TOTAL = CARD0 + CARD_LEN;
if (HOLD < 0 || HOLD > 1.5) throw new Error(`teaser: the King's hold is ${HOLD.toFixed(2)} s`);

// ---- the cards ----
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const fade = (t, a, b, d = 0.25) => clamp01((t - a) / d) * clamp01((b - t) / d);
const fadeIn = (t, a, d) => clamp01((t - a) / d);
const line = (text, t0, cps = 22) => ({ text, times: typeTimes(text, t0, cps) });
const after = (l, gap = 0.3) => l.times.at(-1) + gap;
const [, ARR, D1, D12, CASTLE] = starts;
const y2047 = line('2047.', 0.8, 5.5);
const d1a = line('The time jump worked.', ARR + 2.3), d1b = line('Sending out scouts.', D1 + 0.1);
const d13 = line('They came at dawn.', FIGHT + 0.6, 16);
const d12a = line('This is 1447. No way home.', D12 + 0.5, 20), d12b = line('We found thorium. The lights stay on.', after(d12a, 0.45), 20);
const DIARY = [
  { day: '', dayAt: 0, lines: [y2047], from: 0.5, to: ARR - 0.45 },
  { day: 'DAY 1', dayAt: ARR + 1.6, lines: [d1a, d1b], from: ARR + 1.55, to: D12 - 0.3 },
  { day: 'DAY 12', dayAt: D12 + 0.2, lines: [d12a, d12b], from: D12 + 0.15, to: CASTLE - 0.3 },
  ...(NOFIGHT ? [] : [{ day: 'DAY 13', dayAt: FIGHT + 0.25, lines: [d13], from: FIGHT + 0.2, to: CARD0 - 0.25 }]),
];
if (d12b.times.at(-1) > CASTLE - 1.0) throw new Error('teaser: DAY 12 does not finish typing a second before its shot ends');
const CARD = { text: "The King wasn't expecting company.", from: CASTLE + 0.5, to: KING_SHOT - 0.35 };
function state(t) {
  const d = DIARY.find(x => t >= x.from - 0.3 && t <= x.to + 0.3);
  let diary = null;
  if (d) {
    const shown = d.lines.map(l => typed(l.text, l.times, t)), i = Math.max(0, shown.findLastIndex(s => s.length > 0));
    diary = { alpha: fade(t, d.from, d.to), day: t >= d.dayAt ? d.day : '', lines: shown, at: i, cursor: Math.floor(t * 2.5) % 2 === 0 || shown[i].length < d.lines[i].text.length };
  }
  // the King's lines as in cut 6 (v4/shots.mjs `king`): the first two on the downbeat, the third on the fourth beat, the name on the fifth
  const k = t < K - 0.5 || t >= FIGHT ? null : { shade: fadeIn(t, K - 0.5, 0.5), lines: [fadeIn(t, K, 0.2), fadeIn(t, K + 0.1, 0.25), fadeIn(t, K + 3 * MUSIC.beat, 0.25)], tag: fadeIn(t, K + 4 * MUSIC.beat, 0.3) };
  return { diary, card: fade(t, CARD.from, CARD.to, 0.35), king: k };
}
const ticks = DIARY.flatMap(d => d.lines.flatMap(l => [...l.text].map((ch, i) => (ch === ' ' ? null : l.times[i])).filter(x => x !== null)));

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
    .mono{font-family:'Share Tech Mono',monospace;color:#bff3f6;text-shadow:0 0 10px rgba(79,209,197,.55),0 1px 2px rgba(0,0,0,.9)}
    .dim{color:#6fc6cd}
    .cur{display:inline-block;width:.55em;height:1em;background:#bff3f6;vertical-align:-.12em;margin-left:.15em;box-shadow:0 0 10px rgba(79,209,197,.7)}
    #shade{inset:0;background:linear-gradient(0deg,rgba(4,9,14,.93) 0,rgba(4,9,14,.82) 30%,rgba(4,9,14,0) 56%);-webkit-mask-image:linear-gradient(90deg,#000 0,#000 66%,rgba(0,0,0,.3) 100%)}
    #diary{left:54px;bottom:36px;width:860px;font-size:33px;line-height:1.5}
    #diary div{position:static;min-height:1.5em}
    #diary .day{font-size:27px;letter-spacing:.16em;min-height:0;margin-bottom:10px}
    #cshade{inset:0;background:linear-gradient(0deg,rgba(8,7,4,.8) 0,rgba(8,7,4,.55) 22%,rgba(8,7,4,0) 45%)}
    #card{left:0;right:0;bottom:46px;text-align:center;font-family:'IM Fell English SC',serif;font-size:44px;letter-spacing:.02em;color:#f4ead2;text-shadow:0 2px 4px rgba(0,0,0,.9),0 0 18px rgba(0,0,0,.75)}
    #kshade{inset:0;background:linear-gradient(270deg,rgba(8,7,4,.8) 0,rgba(8,7,4,.55) 38%,rgba(8,7,4,0) 62%)}
    #king{right:36px;top:112px;width:540px;font-family:'IM Fell English SC',serif;font-size:37px;line-height:1.22;letter-spacing:.02em;color:#f4ead2;text-shadow:0 2px 4px rgba(0,0,0,.9),0 0 18px rgba(0,0,0,.75)}
    #king div{position:static}
    #king .rule{width:86px;height:2px;background:#d9a441;margin:20px 0 12px;box-shadow:0 0 8px rgba(217,164,65,.5)}
    #king .tag{font-size:20px;letter-spacing:.2em;color:#d9a441}
    </style><div id="shade"></div><div id="diary" class="mono"></div><div id="cshade"></div><div id="card">${CARD.text}</div>
    <div id="kshade"></div><div id="king">${KING.lines.map(l => `<div class="l">${l}</div>`).join('')}<div class="rule"></div><div class="tag">${KING.tag}</div></div>`);
  await page.evaluate(async () => { await Promise.all([document.fonts.load('40px "Share Tech Mono"'), document.fonts.load('40px "IM Fell English SC"')]); await document.fonts.ready;
    if (!document.fonts.check('40px "Share Tech Mono"') || !document.fonts.check('40px "IM Fell English SC"')) throw new Error('teaser: a face did not load'); });
  const n = Math.round(CARD0 * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate((s) => {
      const $ = (id) => document.getElementById(id), d = s.diary, cur = (on) => `<span class="cur" style="opacity:${on ? 1 : 0}"></span>`;
      $('shade').style.opacity = d ? d.alpha : 0; $('diary').style.opacity = d ? d.alpha : 0;
      if (d) $('diary').innerHTML = `<div class="day dim" style="opacity:${d.day ? 1 : 0}">${d.day || '&nbsp;'}</div>${d.lines.map((l, k) => `<div>${l}${k === d.at ? cur(d.cursor) : ''}</div>`).join('')}`;
      $('cshade').style.opacity = s.card; $('card').style.opacity = s.card;
      const k = s.king; $('kshade').style.opacity = k ? k.shade : 0; $('king').style.opacity = k ? 1 : 0;
      if (k) { [...$('king').querySelectorAll('.l')].forEach((el, j) => { el.style.opacity = k.lines[j]; }); for (const q of ['.rule', '.tag']) $('king').querySelector(q).style.opacity = k.tag; }
    }, state(i / FPS));
    await page.screenshot({ path: `${work}/cards/${String(i).padStart(4, '0')}.png`, omitBackground: true });
  }
  await render(stage, ticks.map(t => ({ t, name: 'tick', gain: 0.55, pan: -0.25 })), CARD0, { from: 0, to: 0 }, `${work}/ticks.wav`);
} finally { await stage.close(); }

// ---- the picture: the painted shots joined, the King's last frame held, the cards over them; then the end card ----
const ins = SHOTS.flatMap(([f]) => ['-i', `${shots}/${f}.mp4`]);
const vch = SHOTS.map(([, a, b], i) => `[${i}:v]trim=${a}:${b},setpts=PTS-STARTPTS,fps=${FPS},scale=1280:720,setsar=1,format=yuv420p${i === 5 ? `,tpad=stop_mode=clone:stop_duration=${HOLD.toFixed(3)}` : ''}[v${i}]`);
const ach = SHOTS.map(([, a, b], i) => `[${i}:a]atrim=${a}:${b},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,afade=t=in:d=0.15,afade=t=out:st=${(b - a - 0.2).toFixed(3)}:d=0.2${i === 5 ? `,apad=pad_dur=${HOLD.toFixed(3)}` : ''}[a${i}]`);
const painted = `${work}/painted.mkv`;
ff([...ins, '-filter_complex', `${[...vch, ...ach].join(';')};${SHOTS.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${SHOTS.length}:v=1:a=1[v][a]`,
  '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '10', '-preset', 'fast', '-c:a', 'pcm_s24le', painted]);

// ---- the sound: the shots' own (Gemini's) quiet with the key ticks, out under the King's downbeat; the music (cut 6's
// master: the King's card, eight beats from its downbeat) from K; the end card's chord and tail from the master ----
const quiet = `${work}/quiet.wav`;
ff(['-i', painted, '-i', `${work}/ticks.wav`, '-filter_complex', `[0:a]aformat=sample_rates=48000:channel_layouts=stereo[a];[1:a]aformat=sample_rates=48000:channel_layouts=stereo[b];[a][b]amix=inputs=2:normalize=0:duration=first[s]`, '-map', '[s]', '-t', CARD0.toFixed(3), '-c:a', 'pcm_s24le', quiet]);
const qGain = -23 - +loud(quiet).input_i;
// The music: sixteen beats of the track from the King's downbeat, at the level it has in cut 6's master (matched on the
// King's eight beats there, where the game is all but silent).
const music = `${work}/music.wav`, card = `${work}/card.wav`, ref = `${work}/ref.wav`, raw8 = `${work}/raw8.wav`;
ff(['-ss', String(KING_AT), '-t', BAR8.toFixed(4), '-i', game, '-vn', '-c:a', 'pcm_s24le', ref]);
ff(['-ss', String(MUSIC.in), '-t', BAR8.toFixed(4), '-i', TRACK, '-vn', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', raw8]);
const mGain = +loud(ref).input_i - +loud(raw8).input_i;
const MLEN = CARD0 - MSTART, MFROM = MSTART === K ? MUSIC.in : MUSIC.chord - MLEN, MFADE = MSTART === K ? 0.008 : 1.5;
ff(['-ss', MFROM.toFixed(4), '-t', MLEN.toFixed(4), '-i', TRACK, '-vn', '-af', `aformat=sample_rates=48000:channel_layouts=stereo,volume=${mGain.toFixed(2)}dB,afade=t=in:d=${MFADE},afade=t=out:st=${(MLEN - 0.03).toFixed(4)}:d=0.03`, '-c:a', 'pcm_s24le', music]);
ff(['-ss', CARD_AT.toFixed(4), '-i', game, '-vn', '-af', 'aformat=sample_rates=48000:channel_layouts=stereo,afade=t=in:d=0.01', '-c:a', 'pcm_s24le', card]);
const sum = `${work}/sum.wav`;
ff(['-i', quiet, '-i', music, '-i', card, '-filter_complex',
  `[0:a]volume=${qGain.toFixed(2)}dB,volume='${MSTART === K ? `if(lt(t,${(K - 0.1).toFixed(3)}),1,if(lt(t,${FIGHT.toFixed(3)}),max(0,1-(t-${(K - 0.1).toFixed(3)})/0.6),0.6))` : `if(lt(t,${MSTART.toFixed(3)}),1,max(0.4,1-(t-${MSTART.toFixed(3)})/1.5*0.6))`}':eval=frame[q];[1:a]adelay=delays=${Math.round(MSTART * 1000)}:all=1[m];[q][m]amix=inputs=2:normalize=0:duration=longest,atrim=0:${CARD0.toFixed(4)}[h];[h][2:a]concat=n=2:v=0:a=1[s]`,
  '-map', '[s]', '-c:a', 'pcm_s24le', sum]);
const m = loud(sum), wav = `${work}/trailer.wav`;
ff(['-i', sum, '-af', `loudnorm=I=-16:TP=-1.2:LRA=50:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`, '-c:a', 'pcm_s16le', wav]);

const master = `${out}/ebbfall-trailer-720p.mp4`;
const vx = ['-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
ff(['-i', painted, '-framerate', String(FPS), '-i', `${work}/cards/%04d.png`, '-ss', CARD_AT.toFixed(4), '-i', game, '-i', wav, '-filter_complex',
  `[0:v]fps=30,setpts=PTS-STARTPTS[o];[1:v]fps=30,format=rgba[c];[o][c]overlay=0:0:eof_action=pass,trim=duration=${CARD0.toFixed(4)},setpts=PTS-STARTPTS,format=yuv420p[a];` +
  `[2:v]scale=1280:720:flags=lanczos:out_color_matrix=bt709:out_range=tv,fps=30,setpts=PTS-STARTPTS,format=yuv420p[b];[a][b]concat=n=2:v=1:a=0[v]`,
  '-map', '[v]', '-map', '3:a', '-r', '30', ...vx, '-crf', '14', '-maxrate', '14M', '-bufsize', '28M', '-c:a', 'aac', '-b:a', '256k', '-t', TOTAL.toFixed(3), '-movflags', '+faststart', master]);
const site = `${out}/ebbfall-trailer.mp4`, kbps = Math.floor((7.2 * 8e3) / TOTAL) - 132;
ff(['-i', master, ...vx, '-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.6)}k`, '-bufsize', `${kbps * 2}k`, '-pass', '1', '-passlogfile', `${work}/x264`, '-an', '-f', 'null', '-']);
ff(['-i', master, ...vx, '-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.6)}k`, '-bufsize', `${kbps * 2}k`, '-pass', '2', '-passlogfile', `${work}/x264`, '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', site]);
ff(['-ss', (K + 4 * MUSIC.beat + 0.6).toFixed(3), '-i', master, '-frames:v', '1', '-q:v', '3', `${out}/poster.jpg`]);
writeFileSync(`${out}/credit.txt`, 'Strength of the Titans Kevin MacLeod (incompetech.com) / Licensed under Creative Commons: By Attribution 4.0 / https://creativecommons.org/licenses/by/4.0/ (edited)\n');
const fin = loud(master), size = (f) => `${(statSync(f).size / 1e6).toFixed(2)} MB`;
console.log(JSON.stringify({ seconds: +TOTAL.toFixed(2), starts, K: +K.toFixed(2), hold: +HOLD.toFixed(2), card: +CARD0.toFixed(2), loudness: { i: +fin.input_i, tp: +fin.input_tp }, master: size(master), site: size(site), siteKbps: kbps }, null, 1));
