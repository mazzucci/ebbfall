// The docs' feedback form (/docs/feedback/, tools/docs/copy/feedback.html and docs.js) sends here: POST /api/feedback,
// answered by the site's Worker (site/worker.js: not a file, so Cloudflare's assets leave it to the Worker) and mailed to
// contact@ebbfall.com through Cloudflare Email Sending (the `send_email` binding FEEDBACK_EMAIL, wrangler.toml: it may
// mail that one address only). The email is the only record: nothing of a message is stored, only counters.
//
// What a request must pass, cheapest first, so that junk never wakes the counter or the mail: a POST from the site's own
// pages (Origin, JSON: a form on another site can send neither without the browser asking first), at most MAX_BODY bytes,
// a filled honeypot answered as a success and dropped, the page open MIN_MS at least (the client's own count since the
// page loaded: a speed bump for a script that posts at once, not a proof; the counters below are the guard), every field
// checked (the text 1 to MAX_TEXT characters, a kind of KINDS, an optional email, the page's details each short and of
// their shape); then the Workers Rate Limiting binding FEEDBACK_LIMIT (PER_MINUTE a minute per address, no storage),
// then one Durable Object, FeedbackBudget, for what a minute's binding cannot count (Rate Limiting periods are 10 or 60
// seconds): PER_HOUR an hour per address, and PER_DAY a UTC day from everyone, so a flood costs at most PER_DAY emails a
// day. It holds counters only: an address as a short hash of its key (an IPv4 address, an IPv6 /64), with the times of
// its sends of the last hour, and the day's count; nothing older than an hour per address. Pure but for the binding
// calls: test/site-feedback.test.js runs it with them faked.
import { addressKey } from '../relay/limits.js';

export const FEEDBACK_PATH = '/api/feedback';
/** Where it goes, and from whom (an address of ebbfall.com, the domain onboarded to Email Sending). */
export const TO = 'contact@ebbfall.com';
export const FROM = { email: 'feedback@ebbfall.com', name: 'Ebbfall feedback' };
export const KINDS = ['Bug', 'Idea', 'Other'];
/** The longest message (the form's maxlength, in UTF-16 code units, a line break one). */
export const MAX_TEXT = 2000;
/** The largest request body: the text at four bytes a character in JSON's escapes would not fit, but the text as typed
 *  (a few bytes a character at most, line breaks two) and the details do. */
export const MAX_BODY = 12 * 1024;
/** The least time the page must have been open, in ms. */
export const MIN_MS = 3000;
/** Sends per address: a minute's (the FEEDBACK_LIMIT binding) and an hour's (FeedbackBudget); everyone's in a UTC day. */
export const PER_MINUTE = 2, PER_HOUR = 3, PER_DAY = 200;
/** The words of the message the subject repeats. */
export const SUBJECT_WORDS = 8;

const HOUR = 3600 * 1000;
/** Characters that never reach the email: C0 and C1 controls (but a line break and a tab in the message), the line and
 *  paragraph separators, and bidirectional overrides (text that reads differently from what it is). */
const CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;
/** One line of text, for a header or a detail: every control and line break a space, runs of spaces one, trimmed. */
export const oneLine = (s) => String(s).replace(CONTROLS, ' ').replace(/[\t\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
/** The message as it goes in the body: line breaks as \n, no other control, no trailing spaces, at most two blank lines
 *  in a row, trimmed. */
export const cleanText = (s) => String(s).replace(/\r\n?/g, '\n').replace(CONTROLS, '').replace(/[ \t]+$/gm, '').replace(/\n{4,}/g, '\n\n\n').trim();

/** A reply address: one plain mailbox (no name, no spaces, no quotes or brackets, no second address), at most 254
 *  characters, a domain with a dot. Nothing in it can end a header. */
const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
export const validEmail = (s) => typeof s === 'string' && s.length <= 254 && EMAIL.test(s) && !s.includes('..');

/** The page's details (docs.js fills them in): each a short line of its shape, or left out. */
const DETAILS = {
  version: { max: 100, re: /^[\w .:()·+-]+$/ },
  browser: { max: 80, re: /^[\w .,:;()/+-]+$/ },
  screen: { max: 80, re: /^[\w .,:@/()+-]+$/ },
  input: { max: 5, re: /^(touch|mouse)$/ },
  from: { max: 120, re: /^(game|menu|\/[\w./-]*)$/ },
};
/** How each detail is named in the email, in order. */
const DETAIL_NAMES = [['version', 'Version'], ['browser', 'Browser'], ['screen', 'Screen'], ['input', 'Input'], ['from', 'From']];

/**
 * A request's fields checked: `{ fields }` (text, kind, email or '', details: only the good ones, the rest dropped), or
 * `{ error, status }`. `honeypot: true` when the hidden field was filled (a bot: answered as sent, nothing sent).
 */
export function check(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'bad request', status: 400 };
  if (typeof body.website === 'string' && body.website !== '') return { honeypot: true };
  if (typeof body.elapsed !== 'number' || !Number.isFinite(body.elapsed) || body.elapsed < MIN_MS) return { error: 'too fast', status: 400 };
  if (typeof body.text !== 'string') return { error: 'no message', status: 400 };
  const text = cleanText(body.text);
  if (!text) return { error: 'no message', status: 400 };
  if (body.text.replace(/\r\n/g, '\n').length > MAX_TEXT || text.length > MAX_TEXT) return { error: 'too long', status: 413 };
  if (!KINDS.includes(body.kind)) return { error: 'bad kind', status: 400 };
  const email = body.email === undefined || body.email === null ? '' : body.email;
  if (typeof email !== 'string') return { error: 'bad email', status: 400 };
  const mail = email.trim();
  if (mail && !validEmail(mail)) return { error: 'bad email', status: 400 };
  const details = {}, d = body.details && typeof body.details === 'object' && !Array.isArray(body.details) ? body.details : {};
  for (const [k, { max, re }] of Object.entries(DETAILS)) {
    if (typeof d[k] !== 'string') continue;
    const v = oneLine(d[k]);
    if (v && v.length <= max && re.test(v)) details[k] = v;
  }
  return { fields: { text, kind: body.kind, email: mail, details } };
}

/** The subject: "[Ebbfall feedback] Bug: the message's first SUBJECT_WORDS words…", one line. */
export function subject(kind, text) {
  const words = oneLine(text).split(' ');
  let head = words.slice(0, SUBJECT_WORDS).join(' ');
  const more = words.length > SUBJECT_WORDS || head.length > 80;
  if (head.length > 80) head = head.slice(0, 80).trim();
  return oneLine(`[Ebbfall feedback] ${kind}: ${head}${more ? '…' : ''}`);
}

/** The email for checked fields (`now`: a Date, for the line saying when): plain text, the details at the bottom, the
 *  player's address as Reply-To when given. The Email Sending binding's message (its `send()`). */
export function message({ text, kind, email, details }, now = new Date()) {
  const lines = [
    text, '', '-- ',
    `Kind: ${kind}`,
    `Reply to: ${email || 'none given'}`,
    ...DETAIL_NAMES.map(([k, name]) => `${name}: ${details[k] || 'unknown'}`),
    `Sent: ${now.toISOString().replace(/\.\d+Z$/, 'Z')}`,
  ];
  return {
    to: TO,
    from: { ...FROM },
    subject: subject(kind, text),
    text: lines.join('\n') + '\n',
    ...(email ? { replyTo: email } : {}),
  };
}

/** A short hash of an address's key (relay/limits.js addressKey: an IPv4 address, an IPv6 /64), the only form in which
 *  the counter sees it. */
export async function addressHash(ip) {
  const key = addressKey(ip) || 'unknown';
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ebbfall-feedback:${key}`));
  return [...new Uint8Array(d).slice(0, 8)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The counter's rule (FeedbackBudget's state, pure): may `key` send one at `now` (ms)? `state`: `{ day, count, hits:
 * { key: [times] } }` (or null: none yet). Returns `{ ok, why, state }`: why 'hour' (this address's PER_HOUR in the last
 * hour) or 'day' (everyone's PER_DAY this UTC day); the state with the send counted when ok, and every time older than an
 * hour forgotten either way.
 */
export function take(state, key, now) {
  const day = new Date(now).toISOString().slice(0, 10);
  const s = state && state.day === day ? { day, count: state.count | 0, hits: {} } : { day, count: 0, hits: {} };
  for (const [k, ts] of Object.entries(state?.hits || {})) {
    const kept = (Array.isArray(ts) ? ts : []).filter(t => typeof t === 'number' && t > now - HOUR && t <= now);
    if (kept.length) s.hits[k] = kept;
  }
  if ((s.hits[key] || []).length >= PER_HOUR) return { ok: false, why: 'hour', state: s };
  if (s.count >= PER_DAY) return { ok: false, why: 'day', state: s };
  s.count++;
  s.hits[key] = [...(s.hits[key] || []), now];
  return { ok: true, state: s };
}

/** The Durable Object counting the hour per address and the day for everyone (one, by the name `budget`): POST
 *  /take with the address's hash in X-Key answers `{ ok }` or `{ ok: false, why }`. Its storage holds `take`'s state,
 *  one record. */
export class FeedbackBudget {
  constructor(state) { this.storage = state.storage; }
  async fetch(req) {
    const key = req.headers.get('X-Key') || '';
    if (req.method !== 'POST' || !/^[0-9a-f]{16}$/.test(key)) return Response.json({ ok: false, why: 'bad' }, { status: 400 });
    const r = take(await this.storage.get('state'), key, Date.now());
    await this.storage.put('state', r.state);
    return Response.json(r.ok ? { ok: true } : { ok: false, why: r.why });
  }
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

/** The body, at most MAX_BODY bytes (null past that, whatever Content-Length says). */
async function readCapped(req) {
  const len = Number(req.headers.get('Content-Length'));
  if (Number.isFinite(len) && len > MAX_BODY) return null;
  if (!req.body) return '';
  const reader = req.body.getReader(), chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(all);
}

/** The binding's verdict for `key`: false only when it says no (none bound, or an error: yes; the budget still counts). */
async function withinMinute(binding, key) {
  if (!binding) return true;
  try { return (await binding.limit({ key })).success !== false; } catch { return true; }
}

/** The budget's verdict: { ok } or { ok: false, why }; null when it cannot be asked (then nothing is sent: it fails
 *  closed, the form offers the email address instead). */
async function askBudget(env, key) {
  try {
    const ns = env.FEEDBACK_BUDGET;
    const res = await ns.get(ns.idFromName('budget')).fetch(new Request('https://budget/take', { method: 'POST', headers: { 'X-Key': key } }));
    const r = await res.json();
    return typeof r?.ok === 'boolean' ? r : null;
  } catch { return null; }
}

/**
 * POST /api/feedback. Answers JSON, `{ ok: true }` when sent (or a honeypot's), else `{ ok: false, error }` with its
 * status: 405 not a POST, 403 not from the site's own pages, 415 not JSON, 413 too large or too long, 400 a field
 * refused or too fast, 429 a limit, 503 the counter unreachable or no binding, 502 the sending failed.
 */
export async function feedback(req, env = {}, url = new URL(req.url)) {
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'method' }), { status: 405, headers: { Allow: 'POST', 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (req.headers.get('Origin') !== url.origin) return json(403, { ok: false, error: 'origin' });
  if (!/^application\/json\s*(;|$)/i.test(req.headers.get('Content-Type') || '')) return json(415, { ok: false, error: 'type' });
  let raw;
  try { raw = await readCapped(req); } catch { return json(400, { ok: false, error: 'bad request' }); }
  if (raw === null) return json(413, { ok: false, error: 'too large' });
  let body;
  try { body = JSON.parse(raw); } catch { return json(400, { ok: false, error: 'bad request' }); }
  const c = check(body);
  if (c.honeypot) return json(200, { ok: true });
  if (c.error) return json(c.status, { ok: false, error: c.error });
  if (!env.FEEDBACK_EMAIL || !env.FEEDBACK_BUDGET) return json(503, { ok: false, error: 'unavailable' });
  const ip = req.headers.get('CF-Connecting-IP') || '';
  if (!(await withinMinute(env.FEEDBACK_LIMIT, addressKey(ip) || 'unknown'))) return json(429, { ok: false, error: 'limit' });
  const budget = await askBudget(env, await addressHash(ip));
  if (!budget) return json(503, { ok: false, error: 'unavailable' });
  if (!budget.ok) return json(429, { ok: false, error: budget.why === 'day' ? 'busy' : 'limit' });
  try {
    await env.FEEDBACK_EMAIL.send(message(c.fields));
  } catch (e) {
    console.log(`feedback: not sent (${String(e?.code || e?.name || 'error').slice(0, 40)})`); // (the error's code, never the message)
    return json(502, { ok: false, error: 'send' });
  }
  return json(200, { ok: true });
}
