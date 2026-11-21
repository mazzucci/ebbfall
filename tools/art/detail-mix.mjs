// detail-exp: one raw set out of several (target/hd/raw/<tag>): node tools/art/detail-mix.mjs <out tag> <tag>[:regex] ...
// Later tags win a name; `:regex` takes only the matching sprites of a tag. Files are hard-linked, not copied.
import { readFileSync, writeFileSync, mkdirSync, linkSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const [outTag, ...parts] = process.argv.slice(2), raw = join(fileURLToPath(new URL('../../', import.meta.url)), 'target/hd/raw'), out = join(raw, outTag);
if (existsSync(out)) rmSync(out, { recursive: true }); mkdirSync(out, { recursive: true });
const all = new Map(); let hd = 0, seconds = 0;
for (const part of parts) {
  const [tag, re] = part.split(':'), ix = JSON.parse(readFileSync(join(raw, tag, 'index.json'), 'utf8')), rx = re ? new RegExp(re) : null;
  hd ||= ix.hd; if (ix.hd !== hd) throw new Error(`${tag} is at ${ix.hd}x, the set at ${hd}x`); seconds += ix.seconds || 0;
  for (const s of ix.sprites) if (!rx || rx.test(s.name)) all.set(s.name, { s, tag });
}
for (const [name, { tag }] of all) linkSync(join(raw, tag, `${name}.rgba`), join(out, `${name}.rgba`));
writeFileSync(join(out, 'index.json'), JSON.stringify({ hd, seconds, from: parts, sprites: [...all.values()].map(v => v.s) }));
console.log(`${outTag}: ${all.size} sprites from ${parts.join(', ')}`);
