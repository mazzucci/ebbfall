// A review sheet for the app icon: public/icon.svg at 16, 32, 48, 180 and 512 pixels on a dark and on a light ground, the
// inline favicon from index.html, a mock browser tab (light and dark) and a mock phone home screen row (the generated PNGs
// masked as iOS and Android launchers do) next to generic app squares, screenshot at 1x so it is judged at actual size.
// Run after tools/icons.mjs (it shows public/icon-*.png):
//   node tools/icon-review.mjs [round]     (writes target/icon-review/sheet.png and, with a round, sheet-<round>.png)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { launchChromium } from './chromium.mjs';

const root = new URL('../', import.meta.url), pub = new URL('public/', root), out = new URL('target/icon-review/', root);
mkdirSync(out, { recursive: true });
const svg = readFileSync(new URL('icon.svg', pub), 'utf8');
const favicon = readFileSync(new URL('index.html', root), 'utf8').match(/<link rel="icon" href="([^"]+)"/)?.[1] ?? '';
const uri = (s) => 'data:image/svg+xml;base64,' + Buffer.from(s).toString('base64');
const png = (f) => 'data:image/png;base64,' + readFileSync(new URL(f, pub)).toString('base64');

const SIZES = [16, 32, 48, 180, 512];
const row = (bg, fg) => `<div class="band" style="background:${bg};color:${fg}">
  <figure><img src="${favicon}" width="16" height="16"><figcaption>favicon</figcaption></figure>${SIZES.map(s =>
  `<figure><img src="${uri(svg)}" width="${s}" height="${s}"><figcaption>${s}</figcaption></figure>`).join('')}</div>`;
const tab = (dark) => `<div class="tabbar ${dark ? 'dark' : ''}"><div class="tab"><img src="${favicon}" width="16" height="16"><span>Ebbfall</span><b>x</b></div>
  <div class="tab off"><span class="dot"></span><span>New tab</span></div><div class="tab off"><span class="dot g"></span><span>GitHub</span></div></div>`;
const generic = (c, shape) => `<div class="app ${shape}" style="background:${c}"></div>`;
const html = `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;width:1040px;font:12px system-ui,sans-serif;background:#888}
  .band{display:flex;align-items:flex-end;gap:28px;padding:18px 24px}
  figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:6px}
  figcaption{opacity:.7}
  .tabbar{display:flex;gap:4px;padding:8px 10px 0;background:#dee1e6}
  .tabbar.dark{background:#202124}
  .tab{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fff;border-radius:8px 8px 0 0;color:#202124;min-width:140px}
  .tab b{margin-left:auto;font-weight:400;opacity:.6}
  .tab.off{background:transparent;opacity:.75}
  .dark .tab{background:#35363a;color:#e8eaed}
  .dot{width:16px;height:16px;border-radius:50%;background:#4285f4;display:inline-block}
  .dot.g{background:#24292f}
  .home{display:flex;gap:22px;padding:22px 26px;align-items:flex-start}
  .home figure{color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.6)}
  .app{width:60px;height:60px;border-radius:14px}
  .app.round{border-radius:50%}
  .ios{background:linear-gradient(160deg,#5b7bb4,#2c3f6e)}
  .android{background:linear-gradient(160deg,#2d3a2f,#0f1b14)}
</style>
<div class="hdr" style="padding:10px 24px;background:#333;color:#ccc">Ebbfall icon review, public/icon.svg</div>
${row('#15171a', '#ccc')}
${row('#f6f7f9', '#333')}
${row('#ffffff', '#333')}
${tab(false)}
<div style="height:6px;background:#fff"></div>
${tab(true)}
<div style="height:6px;background:#35363a"></div>
<div class="home ios">
  <figure>${generic('#3bb04a')}<figcaption>Messages</figcaption></figure>
  <figure>${generic('#1a73e8')}<figcaption>Mail</figcaption></figure>
  <figure><img class="app" src="${png('apple-touch-icon.png')}"><figcaption>Ebbfall</figcaption></figure>
  <figure>${generic('#f5a623')}<figcaption>Notes</figcaption></figure>
  <figure>${generic('linear-gradient(135deg,#ff5f6d,#ffc371)')}<figcaption>Photos</figcaption></figure>
  <figure>${generic('#111')}<figcaption>Camera</figcaption></figure>
</div>
<div class="home android">
  <figure>${generic('#34a853', 'round')}<figcaption>Phone</figcaption></figure>
  <figure>${generic('#4285f4', 'round')}<figcaption>Chrome</figcaption></figure>
  <figure><img class="app round" src="${png('icon-maskable-512.png')}"><figcaption>Ebbfall</figcaption></figure>
  <figure>${generic('#ea4335', 'round')}<figcaption>Gmail</figcaption></figure>
  <figure>${generic('#fbbc04', 'round')}<figcaption>Keep</figcaption></figure>
  <figure><img class="app" src="${png('icon-192.png')}"><figcaption>Ebbfall (any)</figcaption></figure>
</div>`;

const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: 1040, height: 10 }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
  const shot = await page.screenshot({ fullPage: true });
  writeFileSync(new URL('sheet.png', out), shot);
  const round = process.argv[2]; if (round) writeFileSync(new URL(`sheet-${round}.png`, out), shot);
  console.log(`icon-review: wrote target/icon-review/sheet.png${round ? ` and sheet-${round}.png` : ''}`);
} finally { await browser.close(); }
