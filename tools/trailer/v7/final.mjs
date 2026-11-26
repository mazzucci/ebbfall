// Cut 7: the painted opening (27.33 s, from Gemini: ../ebbfall-article/nano-test/trailer/opening.mp4, not in the repo)
// with the diary's cards typed over it, then cut 6's game half re-recorded on the new look (tools/trailer/v4/cut.mjs's
// master, from the King's card on, where the music enters). 1280x720 throughout (the opening is 720p: nothing is scaled up).
//   node tools/trailer/v4/cut.mjs <music.mp3> target/trailer7/game     (the game half, cut 6's edit)
//   node tools/trailer/v7/final.mjs <opening.mp4> target/trailer7/game/trailer-16x9.mp4 <outDir>
// Writes <outDir>/ebbfall-trailer-720p.mp4 (YouTube: high rate), ebbfall-trailer.mp4 (the site: under 8 MB), poster.jpg.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { FFMPEG } from '../record.mjs';
import { openStage } from '../stage.mjs';
import { render } from '../sound.mjs';
import { typeTimes, typed } from '../v4/script.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const [openingArg, gameArg, outArg] = process.argv.slice(2);
if (!openingArg || !gameArg || !outArg) throw new Error('final: <opening.mp4> <game master> <outDir>');
const opening = resolve(openingArg), game = resolve(gameArg), out = resolve(outArg), work = `${root}target/trailer7/final`;
rmSync(`${work}/cards`, { recursive: true, force: true }); mkdirSync(`${work}/cards`, { recursive: true }); mkdirSync(out, { recursive: true });
const ff = (args, capture = false) => { const r = spawnSync(FFMPEG, ['-y', '-hide_banner', '-nostats', '-loglevel', capture ? 'info' : 'error', ...args], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: capture ? 'pipe' : ['ignore', 'inherit', 'inherit'] }); if (r.status) throw new Error(`ffmpeg failed: ${args.join(' ')}`); return r.stderr; };
const loud = (file) => { const e = ff(['-i', file, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=50:print_format=json', '-f', 'null', '-'], true); return JSON.parse(e.slice(e.lastIndexOf('{'), e.lastIndexOf('}') + 1)); };

const FPS = 24, OPEN = 27.333; // the opening's shots: lab 0-4.0, arrival -8.8, DAY 1 -11.8, DAY 12 -17.8, the castle -22.8, the King -27.33
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const fade = (t, a, b, d = 0.25) => clamp01((t - a) / d) * clamp01((b - t) / d);
const line = (text, t0, cps = 22) => ({ text, times: typeTimes(text, t0, cps) });
const after = (l, gap = 0.3) => l.times.at(-1) + gap;
const y2047 = line('2047.', 0.6, 5.5);
const d1a = line('The time jump worked.', 5.6), d1b = line('Sending out scouts.', 8.9);
const d12a = line('This is 1447. No way home.', 12.2, 20), d12b = line('We found thorium. The lights stay on.', after(d12a, 0.4), 22);
const DIARY = [
  { day: '', dayAt: 0, lines: [y2047], from: 0.4, to: 3.75 },
  { day: 'DAY 1', dayAt: 4.9, lines: [d1a, d1b], from: 4.85, to: 11.6 },
  { day: 'DAY 12', dayAt: 11.95, lines: [d12a, d12b], from: 11.9, to: 17.55 },
];
if (d12b.times.at(-1) > 17.0) throw new Error('final: DAY 12 does not finish typing before its shot ends');
const CARD = { text: "The King wasn't expecting company.", from: 18.1, to: 22.5 };
/** The overlay's state at `t` (seconds of the opening). */
function state(t) {
  const d = DIARY.find(x => t >= x.from - 0.3 && t <= x.to + 0.3);
  let diary = null;
  if (d) {
    const shown = d.lines.map(l => typed(l.text, l.times, t)), at = Math.max(0, shown.findLastIndex(s => s.length > 0));
    diary = { alpha: fade(t, d.from, d.to), day: t >= d.dayAt ? d.day : '', lines: shown, at, cursor: Math.floor(t * 2.5) % 2 === 0 || shown[at].length < d.lines[at].text.length };
  }
  return { diary, card: fade(t, CARD.from, CARD.to, 0.35) };
}
/** Every typed character's time (the key ticks; spaces make none). */
const ticks = DIARY.flatMap(d => d.lines.flatMap(l => [...l.text].map((ch, i) => (ch === ' ' ? null : l.times[i])).filter(x => x !== null)));

// ---- the cards, as transparent frames ----
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
    </style><div id="shade"></div><div id="diary" class="mono"></div><div id="cshade"></div><div id="card">${CARD.text}</div>`);
  await page.evaluate(async () => { await Promise.all([document.fonts.load('40px "Share Tech Mono"'), document.fonts.load('40px "IM Fell English SC"')]); await document.fonts.ready;
    if (!document.fonts.check('40px "Share Tech Mono"') || !document.fonts.check('40px "IM Fell English SC"')) throw new Error('final: a face did not load'); });
  const n = Math.round(OPEN * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate((s) => {
      const $ = (id) => document.getElementById(id), d = s.diary, cur = (on) => `<span class="cur" style="opacity:${on ? 1 : 0}"></span>`;
      $('shade').style.opacity = d ? d.alpha : 0; $('diary').style.opacity = d ? d.alpha : 0;
      if (d) $('diary').innerHTML = `<div class="day dim" style="opacity:${d.day ? 1 : 0}">${d.day || '&nbsp;'}</div>${d.lines.map((l, k) => `<div>${l}${k === d.at ? cur(d.cursor) : ''}</div>`).join('')}`;
      $('cshade').style.opacity = s.card; $('card').style.opacity = s.card;
    }, state(i / FPS));
    await page.screenshot({ path: `${work}/cards/${String(i).padStart(4, '0')}.png`, omitBackground: true });
  }
  // the key ticks, in the game's own sound (sound.mjs: the same tick as the game half's DAY 675)
  await render(stage, ticks.map(t => ({ t, name: 'tick', gain: 0.55, pan: -0.25 })), OPEN, { from: 0, to: 0 }, `${work}/ticks.wav`);
} finally { await stage.close(); }

// ---- the sound: the opening's own (Gemini's) quiet, the ticks over it, then the game half from the King's card ----
const openWav = `${work}/open.wav`;
ff(['-i', opening, '-i', `${work}/ticks.wav`, '-filter_complex', `[0:a]aformat=sample_rates=48000:channel_layouts=stereo[a];[1:a]aformat=sample_rates=48000:channel_layouts=stereo[b];[a][b]amix=inputs=2:normalize=0:duration=first[s]`, '-map', '[s]', '-t', String(OPEN), '-c:a', 'pcm_s24le', openWav]);
const openGain = -23 - +loud(openWav).input_i; // under the music (-16) by 7 dB: the opening is the quiet before it
// The game half, shortened: the King's card (beats 0-6), the raid (10-14, on the track's biggest hit), then the
// Watchtower to the end card (18 on); the muster and the close fight (their walking) are out. Cuts on whole bars, so the
// music skips a bar twice; each join has a 15 ms fade. Frames of the game master (30 fps; v4/script.mjs CUT).
const SEGS = [[441, 568], [652, 736], [821, null]], gameShort = `${work}/game-short.mkv`;
{
  const v = SEGS.map(([a, b], i) => `[0:v]trim=start_frame=${a}${b ? `:end_frame=${b}` : ''},setpts=PTS-STARTPTS[v${i}]`);
  const au = SEGS.map(([a, b], i) => `[0:a]atrim=start=${(a / 30).toFixed(4)}${b ? `:end=${(b / 30).toFixed(4)}` : ''},asetpts=PTS-STARTPTS,afade=t=in:d=0.015${b ? `,afade=t=out:st=${((b - a) / 30 - 0.015).toFixed(4)}:d=0.015` : ''}[a${i}]`);
  ff(['-i', game, '-filter_complex', `${[...v, ...au].join(';')};${SEGS.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${SEGS.length}:v=1:a=1[v][a]`, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '10', '-preset', 'fast', '-c:a', 'pcm_s24le', gameShort]);
}
const gameWav = `${work}/game.wav`;
ff(['-i', gameShort, '-vn', '-c:a', 'pcm_s24le', '-ar', '48000', gameWav]);
const sum = `${work}/sum.wav`;
ff(['-i', openWav, '-i', gameWav, '-filter_complex', `[0:a]volume=${openGain.toFixed(2)}dB,afade=t=out:st=${OPEN - 0.12}:d=0.12[a];[a][1:a]concat=n=2:v=0:a=1[s]`, '-map', '[s]', '-c:a', 'pcm_s24le', sum]);
const m = loud(sum), wav = `${work}/trailer.wav`;
ff(['-i', sum, '-af', `loudnorm=I=-16:TP=-1.2:LRA=50:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`, '-c:a', 'pcm_s16le', wav]);

// ---- the picture: the opening under its cards, then the game half (1080p master) brought to 720p ----
const master = `${out}/ebbfall-trailer-720p.mp4`;
const vx = ['-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
ff(['-i', opening, '-framerate', String(FPS), '-i', `${work}/cards/%04d.png`, '-i', gameShort, '-i', wav, '-filter_complex',
  `[0:v]fps=30,setpts=PTS-STARTPTS[o];[1:v]fps=30,format=rgba[c];[o][c]overlay=0:0:shortest=1,trim=duration=${OPEN},setpts=PTS-STARTPTS,format=yuv420p[a];` +
  `[2:v]scale=1280:720:flags=lanczos:out_color_matrix=bt709:out_range=tv,fps=30,setpts=PTS-STARTPTS,format=yuv420p[b];[a][b]concat=n=2:v=1:a=0[v]`,
  '-map', '[v]', '-map', '3:a', '-r', '30', ...vx, '-crf', '14', '-maxrate', '14M', '-bufsize', '28M', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', master]);
const total = +ff(['-i', master, '-f', 'null', '-'], true).match(/time=(\d+):(\d+):([\d.]+)/g).at(-1).slice(5).split(':').reduce((a, x) => a * 60 + +x, 0);
// the site's copy: two passes to land under 7.5 MB (the Worker serves it whole under 8 MB: site/media.js)
const site = `${out}/ebbfall-trailer.mp4`, kbps = Math.floor((7.2 * 8e3) / total) - 132;
ff(['-i', master, ...vx, '-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.6)}k`, '-bufsize', `${kbps * 2}k`, '-pass', '1', '-passlogfile', `${work}/x264`, '-an', '-f', 'null', '-']);
ff(['-i', master, ...vx, '-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.6)}k`, '-bufsize', `${kbps * 2}k`, '-pass', '2', '-passlogfile', `${work}/x264`, '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', site]);
ff(['-ss', String(OPEN + 3.6), '-i', master, '-frames:v', '1', '-q:v', '3', `${out}/poster.jpg`]);
writeFileSync(`${out}/credit.txt`, 'Strength of the Titans Kevin MacLeod (incompetech.com) / Licensed under Creative Commons: By Attribution 4.0 / https://creativecommons.org/licenses/by/4.0/ (edited)\n');
const fin = loud(master), size = (f) => `${(statSync(f).size / 1e6).toFixed(2)} MB`;
console.log(JSON.stringify({ seconds: +total.toFixed(2), loudness: { i: +fin.input_i, tp: +fin.input_tp }, master: size(master), site: size(site), siteKbps: kbps }, null, 1));
