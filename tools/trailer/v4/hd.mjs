// Cut 4's 2x atlas, for the recording only: every model rendered at twice today's resolution (tools/art/hd-render.mjs,
// about ten minutes of software GL), packed into 4096 px pages (tools/art/hd-pack.mjs) under target/hd/atlas/2x/, and
// copied into the built game as dist/art/hd2/, where the client's throwaway switch finds it (src/client/gl/render.js).
// Never under public/, never committed, never shipped: `npm run build` empties dist/ again.
//   npm run build && node tools/trailer/v4/hd.mjs [--copy]     (--copy: the atlas is already in target/: only copy it)
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url)), at = (p) => `${root}${p}`;
const run = (...a) => execFileSync(process.execPath, a, { cwd: root, stdio: 'inherit' });
if (!existsSync(at('dist/index.html'))) throw new Error('hd: dist/ is missing: run npm run build first');
if (!process.argv.includes('--copy')) { run('tools/art/hd-render.mjs', '2', 'all'); run('tools/art/hd-pack.mjs', '2x', '4096', 'nostats'); }
rmSync(at('dist/art/hd2'), { recursive: true, force: true });
cpSync(at('target/hd/atlas/2x'), at('dist/art/hd2'), { recursive: true, filter: (f) => !/stats\.json$/.test(f) });
console.log('hd: dist/art/hd2/ is the 2x atlas');
