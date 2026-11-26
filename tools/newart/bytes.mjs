// The sizes of the art's files, stamped into public/art/new/index.json (`bytes`: a file's name -> its bytes), so the
// loading progress (src/client/gl/artload.js) knows its total from the first byte. Every builder calls `stamp` last;
// test/newart.test.js fails while a size is stale:
//   node tools/newart/bytes.mjs
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Every file the index names, in the order the client asks for them: each group's pages (a page's picture just after
 *  it), then the grounds. `sheetOf(page)`: the page's parsed JSON. */
export function artFiles(ix, sheetOf) {
  const out = [];
  for (const g of Object.values(ix.groups)) for (const p of g.pages) out.push(p, sheetOf(p).meta.image);
  for (const g of Object.values(ix.groups)) out.push(...Object.values(g.ground || {}));
  return out;
}
export function stamp(dir) {
  const file = join(dir, 'index.json'); if (!existsSync(file)) return;
  const ix = JSON.parse(readFileSync(file, 'utf8')), sheetOf = (p) => JSON.parse(readFileSync(join(dir, p), 'utf8'));
  ix.bytes = Object.fromEntries(artFiles(ix, sheetOf).map(f => [f, statSync(join(dir, f)).size]));
  writeFileSync(file, JSON.stringify(ix, null, 1));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) stamp(fileURLToPath(new URL('../../public/art/new/', import.meta.url)));
