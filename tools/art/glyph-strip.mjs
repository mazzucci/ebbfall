// A before/after strip of command-card glyphs (src/client/icons.js `glyph`), drawn as the card draws them (the
// button's colors and sizes from src/style.css: 26 px, available in the card's amber and unavailable in the muted
// blue-gray at 0.38) and again at 3x, for the PM's look:
//   node tools/art/glyph-strip.mjs <old icons.js> <out.png> kind...
// `old icons.js` is a copy of the module before the change (git show <ref>:src/client/icons.js > file).
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { launchChromium } from '../chromium.mjs';

const [oldPath, out, ...kinds] = process.argv.slice(2);
if (!oldPath || !out || !kinds.length) throw new Error('usage: node tools/art/glyph-strip.mjs <old icons.js> <out.png> kind...');
const OLD = await import(pathToFileURL(oldPath).href), NEW = await import('../../src/client/icons.js');
const css = `body{margin:0;background:#0b0f16;color:#eee;font:600 11px/1.2 system-ui} table{border-collapse:collapse} td,th{padding:4px 6px;text-align:center;white-space:nowrap}
.cb{display:inline-flex;align-items:center;justify-content:center;background:#182333;border:1px solid #2a3a50;border-radius:4px;width:34px;height:34px;color:#ffd27a}
.cb.off{opacity:.38;color:#8294aa} .ico{width:26px;height:26px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.ico .f{fill:currentColor;fill-opacity:.3;stroke:none} .x3 .cb{width:102px;height:102px} .x3 .ico{width:78px;height:78px}`;
const cell = (svg, off) => `<td><span class="cb${off ? ' off' : ''}">${svg}</span></td>`;
const row = (label, scale) => `<tr class="${scale}"><th>${label}</th>${kinds.map(k => cell(OLD.glyph(k), false) + cell(OLD.glyph(k), true) + cell(NEW.glyph(k), false) + cell(NEW.glyph(k), true)).join('')}</tr>`;
const html = `<!doctype html><meta charset="utf-8"><style>${css}</style><table><tr><th></th>${kinds.map(k => `<th colspan="4">${k}: before (on, off) | after (on, off)</th>`).join('')}</tr>${row('26 px', 'x1')}${row('3x', 'x3')}</table>`;
const browser = await launchChromium(), page = await browser.newPage();
await page.setViewportSize({ width: 3000, height: 400 }); await page.setContent(html);
const box = await page.locator('table').boundingBox();
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: Math.ceil(box.width) + 8, height: Math.ceil(box.height) + 8 } });
await browser.close();
writeFileSync(out.replace(/\.png$/, '.html'), html);
console.log('glyph strip ->', out);
