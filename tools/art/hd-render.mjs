// HD experiment (branch hd-exp, never merged): the sample's sprites rendered at `hd` times today's resolution, a few
// frames per call to the page so no single transfer is large, written raw under target/hd/raw/<tag>/ (one .rgba per
// sprite and an index.json). Usage: node tools/art/hd-render.mjs <hd> [fin=px]
//   <hd>     1, 2 or 3: tools/render3d/scene.js `S = 2 * hd` (through the page's ?hd=)
//   fin=px   the polish finish's kernels left in output pixels (tag `<hd>x-px`); by default they scale with hd
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../chromium.mjs';

const args = process.argv.slice(3), arg = (k) => args.find(a => a.startsWith(k + '='))?.slice(k.length + 1);
// (detail-exp) `detail`: the desktop detail variant of the Knight and the Data center (tools/render3d/detail.js, the
// page's ?detail=1; tag `<hd>x-detail`); `only=knight,conflux`: those kinds alone; `re=<regex>`: one filter of your own
// (a quick look at a few frames; tag suffix `-look`).
const hd = +process.argv[2] || 1, px = args.includes('fin=px'), detail = args.includes('detail'), only = arg('only')?.split(','), re = arg('re');
const tag = `${hd}x${px ? '-px' : ''}${detail ? '-detail' : ''}${re ? '-look' : ''}`;
const root = fileURLToPath(new URL('../../', import.meta.url)), out = join(root, 'target/hd/raw', tag);
mkdirSync(out, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const UNITS = ['lancer', 'knight', 'shrike', 'umbra'], BLDGS = ['core', 'conflux'];
const keep = (k) => !only || only.includes(k);
const filters = re ? [re] : [...(only?.includes('mine') ? ['^mine_'] : []), ...BLDGS.filter(keep).map(b => `^bldg_${b}$`), ...UNITS.filter(keep).flatMap(u => Array.from({ length: 16 }, (_, d) => `^${u}_${d}_`))];

const browser = await launchChromium();
const index = [], t0 = Date.now();
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('http://art.local/**', (route) => {
    const p = join(root, new URL(route.request().url()).pathname);
    if (!existsSync(p)) return route.fulfill({ status: 404, body: 'not found' });
    route.fulfill({ status: 200, contentType: TYPES[extname(p)] || 'application/octet-stream', body: readFileSync(p) });
  });
  await page.goto(`http://art.local/tools/render3d/index.html?hd=${hd}${px ? '&fin=px' : ''}${detail ? '&detail=1' : ''}`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 }).catch(() => { throw new Error('renderer page failed: ' + errors.join('; ')); });
  for (const f of filters) {
    const { sprites } = await page.evaluate((f) => window.render(f, { noTints: true }), f);
    for (const { data, w, h, ...s } of sprites) {
      writeFileSync(join(out, `${s.name}.rgba`), Buffer.from(data, 'base64'));
      index.push({ ...s, w, h });
    }
    process.stdout.write(`\r${tag}: ${index.length} sprites, ${((Date.now() - t0) / 1000).toFixed(0)} s   `);
  }
  if (errors.length) console.warn('\nrenderer warnings:', errors.slice(0, 5).join('; '));
} finally { await browser.close(); }
writeFileSync(join(out, 'index.json'), JSON.stringify({ hd, detail, fin: px ? 'px' : 'scaled', seconds: (Date.now() - t0) / 1000, sprites: index }));
console.log(`\n${tag}: ${index.length} sprites in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${out}`);
