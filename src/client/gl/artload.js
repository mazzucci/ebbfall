// The game's art on its way in: every file of public/art/new/ (index.json names them, with their sizes: tools/newart/bytes.mjs),
// asked for at once, as early as the page's first script (src/boot.js), and kept ready for the renderer (gl/render.js
// waits for `loadArt`). Nothing else is fetched: the older atlas's pages never are. `art` says how far it has come, for
// the menu's loading line (boot.js). A file that fails, or stalls, is tried again a few times; then everything waits for
// RETRY (`retryArt`): the files already in are kept, and there is no other art to play with. No PixiJS here (the menu's
// graph).
export const art = { done: 0, total: 0, failed: false, ready: false };
const subs = new Set(), waiting = [];
let told = 0, timer = 0;
/** Call `fn(art)` now and whenever it changes (at most ten times a second). */
export function onArt(fn) { subs.add(fn); fn(art); }
function tell(now = false) {
  clearTimeout(timer);
  const ms = now ? 0 : Math.max(0, 100 - (performance.now() - told));
  if (ms > 0) { timer = setTimeout(tell, ms, true); return; }
  told = performance.now(); for (const fn of subs) fn(art);
}
/** Try what failed again. */
export function retryArt() { if (!art.failed) return; art.failed = false; tell(true); for (const go of waiting.splice(0)) go(); }

/** Tries before asking the player; the wait before each but the first (ms); no byte for this long is a failure (ms). */
export const TRIES = 4, WAITS = [400, 1200, 3000], STALL = 20000;

/** One try at `url`: its whole body as a Blob, `got(n)` called with each piece's bytes. */
async function body(url, priority, got) {
  const stop = new AbortController(); let t = 0;
  const alive = () => { clearTimeout(t); t = setTimeout(() => stop.abort(), STALL); };
  alive();
  try {
    const r = await fetch(url, { priority, signal: stop.signal });
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    const type = r.headers.get('content-type') || '', parts = [], reader = r.body.getReader();
    for (;;) { const { done, value } = await reader.read(); if (done) break; alive(); parts.push(value); got(value.length); }
    return new Blob(parts, { type });
  } finally { clearTimeout(t); }
}
/** The file at `url` made into something by `make(blob)`; `size`: its bytes in the total (0: not counted). Tried until it
 *  is in, however often the player has to ask. `wait(ms)`: the pause between tries. */
export async function file(url, size, priority, make, wait = (ms) => new Promise(r => setTimeout(r, ms))) {
  for (;;) {
    for (let k = 0; k < TRIES; k++) {
      if (k) await wait(WAITS[k - 1]);
      let n = 0; // (what of it is counted: never more than its size)
      const got = (bytes) => { const m = Math.min(size, n + bytes); art.done += m - n; n = m; tell(); };
      try { const v = await make(await body(url, priority, got)); got(size); return v; }
      catch (e) { art.done -= n; tell(); console.warn(`art: ${e?.message ?? e}`); }
    }
    art.failed = true; tell(true);
    await new Promise(r => waiting.push(r));
  }
}

const json = async (blob) => JSON.parse(await blob.text()), picture = (blob) => createImageBitmap(blob);
let begun = null;
/** The art under `base` (the address of art/): { groups: { <name>: { ...its entry in the index, sheets: [{ page, data,
 *  bitmap }], ground: { <name>: bitmap } } } }. Asked for once, whoever calls first. */
export const loadArt = (base) => (begun ||= load(base + 'new/'));
async function load(dir) {
  const ix = await file(dir + 'index.json', 0, 'auto', json), bytes = ix.bytes || {}, names = Object.keys(ix.groups);
  art.total = Object.values(bytes).reduce((a, b) => a + b, 0); tell(true);
  const get = (f, priority, make) => file(dir + f, bytes[f] || 0, priority, make);
  const groups = {};
  // (all in parallel; the first two groups, small and on screen first, ahead of the rest where the browser ranks them,
  // and the rest behind the page's own scripts and pictures)
  await Promise.all(names.map(async (name, i) => {
    const g = ix.groups[name], priority = i < 2 ? 'auto' : 'low', ground = {};
    const sheets = await Promise.all(g.pages.map(async (page) => {
      const webp = page.replace(/\.json$/, '.webp');
      const [data, bitmap] = await Promise.all([get(page, priority, json), get(webp, priority, picture)]);
      return { page, data, bitmap };
    }));
    await Promise.all(Object.entries(g.ground || {}).map(async ([n, f]) => { ground[n] = await get(f, priority, picture); }));
    groups[name] = { ...g, sheets, ground };
  }));
  art.ready = true; art.done = art.total; tell(true);
  return { groups };
}
