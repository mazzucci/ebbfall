// PROTOTYPE ONLY (branch hud-options): the contact sheets of the HUD options, one image per option: each of the
// option's stills beside today's (tools/hud-capture.mjs made them).
//   flock /tmp/claude-1000/ebbfall-lab.lock node tools/hud-sheets.mjs [--out DIR]
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchEngine } from './engines.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const root = fileURLToPath(new URL('..', import.meta.url));
const out = resolve(arg('--out', join(root, '../ebbfall-article/hud-options')));
const tmp = join(root, 'target/hud'); mkdirSync(tmp, { recursive: true });
const OPTIONS = [
  ['option-1', 'Option 1: the Console', 'One docked band across the bottom: minimap, selection, command card, joined. Gold, POP, the clock and the buttons sit on the band\'s shoulders; there is no top bar. The map ends above the band. Marks: a thin whole ring; a slim bar lit along its top, never wider than 24 or 34 px.'],
  ['option-2', 'Option 2: the Corners', 'Today\'s floating panels, scaled with the window and given one frame; blank card slots become wells; the top bar becomes two corner clusters. The map stays edge to edge under them. Marks: a soft disc of light with a bright front edge; a bar cut into segments.'],
  ['option-3', 'Option 3: the Sidebar', 'One column down the right edge: buttons, gold and POP, a large minimap, selection, command card. Nothing floats over the map, which keeps its full height. Marks: the front of the ring is the health bar; no bar over a selected unit of ours.'],
  ['recommended', 'Recommended: the Corners\' layout with the Console\'s marks', 'Option 2\'s layout (?hud=2) with option 1\'s thin ring and slim bar (&marks=1).'],
];
const ROWS = [
  ['1920x1080.png', '1920 × 1080, DPR 1'], ['1440x900.png', '1440 × 900, DPR 1'], ['2560x1440-dpr2.png', '2560 × 1440 at DPR 2 (a 1280 × 720 window)'],
  ['phone-844x390.png', 'Landscape phone, 844 × 390 (DPR 2, touch): the layout is today\'s; only the ring and the bar change'],
  ['closeup-1920.png', 'The melee at 1920 × 1080, start zoom, actual pixels'], ['closeup-dpr2.png', 'The melee at 2560 × 1440 DPR 2, start zoom, actual pixels'],
  ['1440x900--one-unit.png', 'One unit selected, 1440 × 900'], ['1440x900--queue.png', 'A building with a production queue, 1440 × 900'],
];
const { browser } = await (async () => { const b = await launchEngine(); return { browser: b }; })();
const ctx = await browser.newContext({ viewport: { width: 2440, height: 1200 }, deviceScaleFactor: 1 }), page = await ctx.newPage();
for (const [dir, title, text] of OPTIONS) {
  const src = (d, f) => pathToFileURL(join(out, d, f)).href;
  const rows = ROWS.filter(([f]) => existsSync(join(out, dir, f)) && existsSync(join(out, 'today', f))).map(([f, cap]) =>
    `<h2>${cap}</h2><div class="row${f.startsWith('phone') ? ' phone' : ''}"><figure><img src="${src('today', f)}"><figcaption>today (main as shipped)</figcaption></figure><figure><img src="${src(dir, f)}"><figcaption>${title.split(':')[0].toLowerCase()}</figcaption></figure></div>`).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 28px; background: #0b0f16; color: #e8e2d4; font: 17px/1.45 system-ui, sans-serif; width: 2384px; }
    h1 { font-size: 30px; margin: 0 0 6px; } p { margin: 0 0 8px; color: #b9b2a3; max-width: 1900px; } h2 { font-size: 19px; margin: 26px 0 8px; color: #ffd27a; font-weight: 600; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; } figure { margin: 0; } img { width: 100%; display: block; outline: 1px solid #3a4658; }
    figcaption { margin-top: 5px; color: #9aa6b5; font-size: 15px; }</style>
    <h1>${title}</h1><p>${text}</p><p>Left: today. Right: the option. Every still is the same held instant of one staged game (seed 4242, 3:43), the whole army selected with Q (ARMY on the phone), at main's start zoom for the window.</p>${rows}`;
  const file = join(tmp, `sheet-${dir}.html`); writeFileSync(file, html);
  await page.goto(pathToFileURL(file).href); await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0));
  await page.screenshot({ path: join(out, `sheet-${dir}.png`), fullPage: true, type: 'png' });
  console.log(`sheet-${dir}.png`);
}
await browser.close();
