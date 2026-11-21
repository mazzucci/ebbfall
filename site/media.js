// The docs' videos (public/docs/media/: the home's trailer, How to play's two loops and its gestures' loops), answered
// by the Worker so that a byte range is answered as one. Safari plays a video only from a server that answers its
// `Range: bytes=0-1` with 206 Partial Content, and Cloudflare's static assets do not: they answer every Range with the
// whole file, 200, and no Accept-Ranges (the asset server has no byte serving; checked live on ebbfall.com, every file
// type alike). So wrangler.toml runs the Worker first for the videos (MEDIA_RULE, run_worker_first), and the Worker
// reads the file from the assets (env.ASSETS, a few hundred KB at most) and slices it. A tripped Workers spending limit
// takes the videos with it (each shows its poster, a file served without the Worker like every other file).

/** The folder the videos are served under, and wrangler.toml's run_worker_first rule for them (their .webp posters
 *  beside them stay the assets'). */
export const MEDIA_PATH = '/docs/media/';
export const MEDIA_RULE = `${MEDIA_PATH}*.mp4`;

/** Cloudflare's own Cache-Control for an asset (site/cache.js CACHE gives the docs none): revalidated, with its ETag. */
const ASSET_CACHE = 'public, max-age=0, must-revalidate';

/**
 * A Range header against a file of `size` bytes, as Cloudflare's cache answers one
 * (developers.cloudflare.com/cache/reference/range-requests/): one range, `bytes=a-b`, `bytes=a-` or `bytes=-n`, gives
 * `{ start, end }` (inclusive, the end clamped to the file's); one that cannot be satisfied (starting at or past the
 * end, inverted, a zero suffix, an empty file) gives 'unsatisfiable' (416); anything else (no header, another unit,
 * several ranges, not a number) gives null: the whole file, 200.
 */
export function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header || '').trim());
  if (!m || (m[1] === '' && m[2] === '') || m[1].length > 15 || m[2].length > 15) return null;
  if (m[1] === '') { // the last n bytes
    const n = Number(m[2]);
    return n === 0 || size === 0 ? 'unsatisfiable' : { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(m[1]), end = m[2] === '' ? size - 1 : Number(m[2]);
  if (start >= size || end < start) return 'unsatisfiable';
  return { start, end: Math.min(end, size - 1) };
}

/**
 * A video's answer, for a GET or HEAD under MEDIA_PATH: the file from the assets, whole (200) or the range asked for
 * (206, with Content-Range), always with Accept-Ranges: bytes; 416 for a range past its end. An If-Range that is not
 * the file's ETag gets the whole file (it changed since the first part). What the assets answer otherwise (304 for a
 * matching If-None-Match, 404 for no such file) is passed on. The security headers are added by worker.js.
 */
export async function media(req, env) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' } });
  const headers = new Headers(req.headers);
  headers.delete('Range');
  headers.delete('If-Range');
  const asset = await env.ASSETS.fetch(new Request(req.url, { method: 'GET', headers }));
  if (asset.status !== 200) return asset;
  const body = await asset.arrayBuffer(), size = body.byteLength;
  const etag = asset.headers.get('ETag');
  const out = new Headers({ 'Content-Type': asset.headers.get('Content-Type') || 'application/octet-stream', 'Cache-Control': asset.headers.get('Cache-Control') || ASSET_CACHE, 'Accept-Ranges': 'bytes' });
  if (etag) out.set('ETag', etag);
  const ifRange = req.headers.get('If-Range');
  const range = ifRange && ifRange !== etag ? null : parseRange(req.headers.get('Range'), size);
  if (range === 'unsatisfiable') {
    out.set('Content-Range', `bytes */${size}`);
    out.set('Content-Length', '0');
    return new Response(null, { status: 416, headers: out });
  }
  const part = range ? body.slice(range.start, range.end + 1) : body;
  if (range) out.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
  out.set('Content-Length', String(part.byteLength));
  return new Response(req.method === 'HEAD' ? null : part, { status: range ? 206 : 200, headers: out });
}
