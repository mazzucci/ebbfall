// The storyboard's stills (two options for the 40-second trailer): the plates from tools/trailer/storyboard.mjs
// (target/storyboard/plates/) with the trailer's text over them as it will read on screen: the black card, the warp,
// the field log (Share Tech Mono, the game's own monospace) fully typed, the King's line, the end card. One 1920x1080
// PNG per beat, named <nn>-<timecode>-<name>.png, and a contact sheet per option.
//   node tools/trailer/storyboard-compose.mjs [--out dir] [--fonts]     (one headless Chromium; --fonts: the King's faces, compared)
// The King's face is not the game's (it has one display face for both peoples): candidates are read from
// target/storyboard/fonts/ (open-license files, e.g. `npm pack @fontsource/im-fell-english-sc`), not committed.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../chromium.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2), oi = args.indexOf('--out');
const OUT = oi >= 0 ? args[oi + 1] : join(root, 'target/storyboard/out');
const plates = join(root, 'target/storyboard/plates'), fontDir = join(root, 'target/storyboard/fonts');
const b64 = (p) => readFileSync(p).toString('base64');
const find = (dir, name) => { for (const f of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, f.name); if (f.isDirectory()) { const r = find(p, name); if (r) return r; } else if (f.name === name) return p; } return null; };
const face = (family, weight, file) => `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${b64(file)}) format('woff2')}`;
const KING_FACES = [['IM Fell English SC', 400, 'im-fell-english-sc-latin-400-normal.woff2'], ['Cinzel', 600, 'cinzel-latin-600-normal.woff2'], ['Pirata One', 400, 'pirata-one-latin-400-normal.woff2'], ['Cormorant SC', 600, 'cormorant-sc-latin-600-normal.woff2']];
const FONTS = [
  ...[500, 600, 700].map(w => face('Chakra Petch', w, join(root, `src/fonts/chakra-petch-${w}.woff2`))),
  face('Share Tech Mono', 400, join(root, 'src/fonts/share-tech-mono-400.woff2')),
  ...(existsSync(fontDir) ? KING_FACES.map(([f, w, file]) => { const p = find(fontDir, file); return p ? face(f, w, p) : ''; }) : []),
].join('');
const ICON = `data:image/svg+xml;base64,${b64(join(root, 'public/icon.svg'))}`;

/** Sizes are CSS px of a 960x540 page at DPR 2 (half the video's pixels), like tools/trailer/overlay.mjs. */
const CSS = `${FONTS}
html,body{margin:0;width:960px;height:540px;overflow:hidden;background:#000}
#f{position:absolute;inset:0;overflow:hidden;background:#000;color:#fff;font-family:'Chakra Petch',sans-serif}
#f div,#f img.bg{position:absolute}
img.bg{inset:0;width:100%;height:100%}
.fill{inset:0}
.vig{inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 45%,rgba(0,0,0,.55) 100%)}
.mono{font-family:'Share Tech Mono',monospace;color:#bff3f6;text-shadow:0 0 10px rgba(79,209,197,.55),0 1px 2px rgba(0,0,0,.9)}
.mono .dim{color:#5fb8bf} .mono .hot{color:#ffb454;text-shadow:0 0 10px rgba(245,165,36,.5),0 1px 2px rgba(0,0,0,.9)}
.cur{display:inline-block;width:.55em;height:1em;background:#bff3f6;vertical-align:-.12em;margin-left:.15em;box-shadow:0 0 10px rgba(79,209,197,.7)}
.king{color:#f4ead2;text-shadow:0 2px 4px rgba(0,0,0,.9),0 0 18px rgba(0,0,0,.75)}
.shadow{text-shadow:0 2px 3px rgba(0,0,0,.85),0 0 14px rgba(11,15,22,.9),0 0 3px rgba(11,15,22,.9)}
`;
const plate = (name, style = '') => `<img class="bg" style="${style}" src="data:image/png;base64,${b64(join(plates, `${name}.png`))}">`;
const graded = (name, g = 1) => plate(name, `filter:saturate(${1 - 0.5 * g}) brightness(${1 - 0.4 * g})`);

// ---- the pieces ----
/** The black card. */
const card = (text) => `<div class="fill mono" style="display:flex;align-items:center;justify-content:center;font-size:54px;letter-spacing:.08em">${text}</div>`;
/** The warp, mid-way (it lands at x, y: CSS px): the white core, a cyan ring, a streak across, the frame bleached. */
const warp = (x, y, k = 1) => `
  <div class="fill" style="background:rgba(235,252,255,${0.34 * k})"></div>
  <div class="fill" style="background:radial-gradient(circle at ${x}px ${y}px,rgba(255,255,255,1) 0,rgba(255,255,255,.96) ${50 * k}px,rgba(160,240,250,.75) ${105 * k}px,rgba(79,209,197,.0) ${250 * k}px)"></div>
  <div style="left:${x - 185 * k}px;top:${y - 185 * k}px;width:${370 * k}px;height:${370 * k}px;border-radius:50%;border:3px solid rgba(215,252,255,.9);box-shadow:0 0 34px 8px rgba(79,209,197,.75),inset 0 0 34px 8px rgba(79,209,197,.55)"></div>
  <div style="left:${x - 290 * k}px;top:${y - 290 * k}px;width:${580 * k}px;height:${580 * k}px;border-radius:50%;border:1.5px solid rgba(200,250,255,.5);box-shadow:0 0 22px 3px rgba(79,209,197,.4)"></div>
  <div style="left:0;right:0;top:${y - 2}px;height:4px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.95) ${x / 9.6 - 22}%,#fff ${x / 9.6}%,rgba(255,255,255,.95) ${x / 9.6 + 22}%,rgba(255,255,255,0));box-shadow:0 0 22px 5px rgba(140,235,245,.8)"></div>
  <div style="top:0;bottom:0;left:${x - 1}px;width:2px;background:linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,.8) 35%,#fff ${y / 5.4}%,rgba(255,255,255,.8) 75%,rgba(255,255,255,0));box-shadow:0 0 16px 4px rgba(140,235,245,.6)"></div>`;
/** A field-log screen: a dark side for the type (`side`: left|bottom), the head line and the typed lines, the cursor
 *  after the last. */
const log = ({ head, lines, side = 'left', size = 24, x = 54, y = 150, w = 560 }) => `
  <div class="fill" style="background:${side === 'left' ? 'linear-gradient(90deg,rgba(4,9,14,.93) 0,rgba(4,9,14,.86) 46%,rgba(4,9,14,.25) 78%,rgba(4,9,14,.1) 100%)' : 'linear-gradient(0deg,rgba(4,9,14,.93) 0,rgba(4,9,14,.8) 28%,rgba(4,9,14,0) 52%)'}"></div>
  <div class="mono" style="left:${x}px;${side === 'left' ? `top:${y}px` : `bottom:${y}px`};width:${w}px;font-size:${size}px;line-height:1.5">
    ${head ? `<div style="position:static" class="dim"><span style="font-size:${Math.round(size * 0.62)}px;letter-spacing:.16em">${head}</span></div><div style="position:static;height:${Math.round(size * 0.45)}px"></div>` : ''}
    ${lines.map((l, i) => `<div style="position:static">${l}${i === lines.length - 1 ? '<span class="cur"></span>' : ''}</div>`).join('')}
  </div>`;
/** The King's line: the shade on its side, the line in the King's face, a short gold rule and his name under it. */
const king = ({ lines, font, size = 44, x = 60, y = 150, w = 520, ls = '.02em', lh = 1.22, weight = 400, tag = 'THE KING' }) => `
  <div class="fill" style="background:linear-gradient(90deg,rgba(8,7,4,.82) 0,rgba(8,7,4,.62) 42%,rgba(8,7,4,0) 72%)"></div>
  <div class="king" style="left:${x}px;top:${y}px;width:${w}px;font-family:'${font}',serif;font-weight:${weight};font-size:${size}px;line-height:${lh};letter-spacing:${ls}">
    ${lines.map(l => `<div style="position:static">${l}</div>`).join('')}
    <div style="position:static;width:86px;height:2px;background:#d9a441;margin:22px 0 12px;box-shadow:0 0 8px rgba(217,164,65,.5)"></div>
    <div style="position:static;font-size:${Math.round(size * 0.42)}px;letter-spacing:.2em;color:#d9a441">${tag}</div>
  </div>`;
/** A one-line log caption over a gameplay scene (option B): bottom left, on a low shade. */
const caption = (day, text) => `
  <div class="fill" style="background:linear-gradient(0deg,rgba(4,9,14,.88) 0,rgba(4,9,14,.6) 16%,rgba(4,9,14,0) 34%)"></div>
  <div class="mono" style="left:44px;bottom:34px;font-size:25px;white-space:nowrap"><span class="dim" style="font-size:16px;letter-spacing:.16em;margin-right:16px">${day}</span>${text}<span class="cur"></span></div>`;
/** The end card over the frozen, graded last frame: the logo, the line, the address. */
const endCard = (name) => `${graded(name)}<div class="fill" style="background:#0b0f16;opacity:.63"></div><div class="vig"></div>
  <div class="shadow" style="left:0;right:0;top:112px;display:flex;justify-content:center;align-items:center;gap:18px"><img src="${ICON}" width="92" height="92" style="border-radius:50%;background:#0b0f16;box-shadow:0 0 18px rgba(0,0,0,.6)"><b style="font-size:110px;line-height:1;letter-spacing:.005em">Ebbfall</b></div>
  <div class="shadow" style="left:0;right:0;top:268px;text-align:center;font-weight:600;font-size:31px;line-height:1.3">A classic real-time strategy game,<br>free in your browser, on a phone or a desktop.</div>
  <div class="shadow" style="left:0;right:0;top:402px;text-align:center;font-weight:700;font-size:60px;color:#4fd1c5">ebbfall.com</div>`;
const logoOnly = (name) => `${graded(name)}<div class="vig"></div>
  <div class="shadow" style="left:0;right:0;top:206px;display:flex;justify-content:center;align-items:center;gap:20px"><img src="${ICON}" width="104" height="104" style="border-radius:50%;background:#0b0f16;box-shadow:0 0 18px rgba(0,0,0,.6)"><b style="font-size:124px;line-height:1;letter-spacing:.005em">Ebbfall</b></div>`;

// ---- the two options: [timecode, name, html] ----
const A_KING = { font: 'IM Fell English SC', size: 46 }, B_KING = { font: 'IM Fell English SC', size: 46 };
const OPTIONS = {
  'option-A': [
    ['00.0', 'card', card('2047.')],
    ['01.4', 'field', plate('field-wide')],
    ['02.6', 'warp', plate('arrived-wide') + warp(785, 96)],
    ['03.4', 'log', plate('arrived-wide') + log({ head: 'EXPEDITION FIELD LOG &nbsp;//&nbsp; ENTRY 001', y: 138, size: 25, lines: ['&gt; JUMP COMPLETE.', '&gt; SIX CENTURIES BACK.', '&gt; DATA CENTER ONLINE.', '&gt; THORIUM REACTOR: STABLE.', '&gt; ENERGY RESERVE: <span class="hot">4%</span>', '&gt; DIRECTIVE: OPEN THE MINES.'] })],
    ['10.0', 'king', plate('castle') + king({ ...A_KING, lines: ['Strangers dig', 'in my earth.', 'This I will not suffer.'] })],
    ['14.5', 'mine', plate('xmine')],
    ['17.5', 'noticed', plate('watch')],
    ['20.0', 'muster', plate('muster-march')],
    ['23.0', 'raid', plate('xraid-2')],
    ['25.5', 'push', plate('push')],
    ['27.5', 'armies', plate('fight-1')],
    ['30.5', 'close', plate('duel-2')],
    ['32.5', 'siege', plate('siege-1')],
    ['34.8', 'fall', plate('siege-3')],
    ['35.5', 'logo', logoOnly('siege-3')],
    ['36.5', 'endcard', endCard('siege-3')],
  ],
  'option-B': [
    ['00.0', 'kingdom', plate('kingdom')],
    ['02.6', 'warp', plate('kingdom') + warp(480, 250, 1.25)],
    ['03.4', 'log-1', plate('xmine') + log({ side: 'bottom', y: 40, w: 860, size: 27, head: 'FIELD LOG &nbsp;·&nbsp; DAY 1', lines: ['We jumped six centuries back.', 'All of us made it.'] })],
    ['07.6', 'log-2', plate('xmine-close') + log({ side: 'bottom', y: 40, w: 860, size: 27, head: 'FIELD LOG &nbsp;·&nbsp; DAY 3', lines: ['The base runs on thorium. It eats all we dig.', 'We need more energy. We need the mines.'] })],
    ['12.4', 'king', plate('castle') + king({ ...B_KING, lines: ['No lord gave them leave', 'to break my ground.', 'I will not abide it.'] })],
    ['16.8', 'muster', plate('muster')],
    ['19.8', 'raid', plate('xraid-2') + caption('DAY 9', 'They found the mine.')],
    ['23.0', 'build', plate('build-2') + caption('DAY 10', 'So we build.')],
    ['26.0', 'push', plate('push') + caption('DAY 14', 'We go to them.')],
    ['29.0', 'armies', plate('fight-1')],
    ['32.2', 'close', plate('duel-2')],
    ['34.6', 'freeze', graded('fight-2', 0.8) + '<div class="vig"></div>' + caption('DAY 15', 'We are not leaving.')],
    ['36.4', 'endcard', endCard('fight-2')],
  ],
};

const page960 = (html) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div id="f">${html}</div></body></html>`;
const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 });
  const shoot = async (html, file) => { await page.setContent(page960(html)); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(80); await page.screenshot({ path: file, type: 'png' }); };
  if (args.includes('--fonts')) {
    mkdirSync(OUT, { recursive: true });
    for (const [f, w] of KING_FACES) await shoot(plate('castle') + king({ font: f, weight: w, size: f === 'Pirata One' ? 52 : 44, lines: ['Strangers dig', 'in my earth.', 'This I will not suffer.'] }), join(OUT, `king-${f.replace(/ /g, '-')}.png`));
  } else {
    for (const [opt, beats] of Object.entries(OPTIONS)) {
      const dir = join(OUT, opt); mkdirSync(dir, { recursive: true });
      const files = [];
      for (const [i, [tc, name, html]] of beats.entries()) {
        const file = `${String(i + 1).padStart(2, '0')}-${tc}-${name}.png`;
        try { await shoot(html, join(dir, file)); files.push([file, tc, name]); console.log(`${opt}/${file}`); } catch (e) { console.error(`${opt}/${file}: ${e.message}`); }
      }
      // The contact sheet: four across, each still at 640x360 with its number, timecode and name.
      const sheet = await browser.newPage({ viewport: { width: 4 * 656 + 16, height: 100 }, deviceScaleFactor: 1 });
      await sheet.setContent(`<!doctype html><html><head><style>${FONTS}body{margin:0;background:#0b0f16;color:#dde5ee;font:600 15px 'Chakra Petch',sans-serif;padding:16px 0 4px 16px}h1{font-size:22px;margin:0 0 12px}
        .g{display:flex;flex-wrap:wrap;gap:0}.c{width:640px;margin:0 16px 14px 0}.c img{display:block;width:640px;height:360px}.c p{margin:6px 0 0;font:15px 'Share Tech Mono',monospace;color:#9fb0c4}</style></head><body>
        <h1>Ebbfall trailer storyboard: ${opt}</h1><div class="g">${files.map(([f, tc, name]) => `<div class="c"><img src="data:image/png;base64,${b64(join(dir, f))}"><p>${f.slice(0, 2)} &nbsp; 0:${tc.padStart(4, '0')} &nbsp; ${name}</p></div>`).join('')}</div></body></html>`);
      await sheet.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode())); });
      await sheet.screenshot({ path: join(dir, 'contact-sheet.png'), fullPage: true });
      await sheet.close();
    }
  }
} finally { await browser.close(); }
