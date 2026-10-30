// GET /version: what this relay is, as JSON `{proto, build}`: the protocol it speaks (relay/room.js PROTO) and the build
// CI deployed (a hash of the bundle and its config, passed at deploy as the RELAY_BUILD var; null where none was, as in
// a hand deploy or the Node relay by default). CI reads it to deploy the relay only when the live one is not this
// commit's, and to publish the site only when the live relay speaks the site's protocol. Public: nothing secret in it.
import { PROTO } from './room.js';

/** The answer to a /version request, or null for any other path. */
export function versionRequest(req, build) {
  if (new URL(req.url).pathname !== '/version') return null;
  const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('GET /version', { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
  return new Response(JSON.stringify({ proto: PROTO, build: build || null }), { headers: { ...headers, 'Content-Type': 'application/json' } });
}
