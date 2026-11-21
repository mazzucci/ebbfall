// Cut 4's recorder: tools/trailer/record.mjs's `recordSegment` over this cut's shot list and overlays (16:9 only), into
// target/trailer4/16x9/<part>.mkv (+ .sfx.json), or target/trailer4/preview/ (--preview: DPR 1 at 10 fps, today's atlas).
//   npm run build && node tools/trailer/v4/hd.mjs && node tools/trailer/v4/record.mjs [--preview] [segment ...]
// Run it under the machine's lock (one headless Chromium at a time): flock /tmp/claude-1000/ebbfall-lab.lock node ...
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openStage } from '../stage.mjs';
import { recordSegment } from '../record.mjs';
import * as overlay from './overlay.mjs';
import { SEGMENTS } from './shots.mjs';

const args = process.argv.slice(2), preview = args.includes('--preview'), names = args.filter(x => !x.startsWith('--'));
const out = fileURLToPath(new URL(`../../../target/trailer4/${preview ? 'preview' : '16x9'}`, import.meta.url));
mkdirSync(out, { recursive: true });
const stage = await openStage();
try {
  for (const seg of SEGMENTS) if (!names.length || names.includes(seg.id)) {
    console.log(`trailer 4: ${seg.id}`);
    try { await recordSegment(stage, seg, '16x9', { preview, out, overlay, query: preview || args.includes('--1x') ? '&hd=0' : '' }); }
    catch (e) { console.error(`  ${seg.id} failed: ${e.message}`); if (!preview) throw e; }
  }
} finally { await stage.close(); }
