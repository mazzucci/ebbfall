// The docs' feedback form's endpoint (site/feedback.js: POST /api/feedback on the site's Worker), with its bindings faked:
// the Email Sending binding (what it is asked to send), the Rate Limiting binding and the budget object (FeedbackBudget,
// over a storage in memory). Only from the site's pages (Origin, JSON), size caps, the honeypot, the time on the page,
// every field checked, the limits (a minute's by the binding, an hour's per address and the day's for everyone by the
// object, which fails closed), the email (to us, from feedback@, Reply-To the player's checked address, the subject, the
// plain text with the details at the bottom, nothing that could end a header), a failed send, and what the counter keeps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../site/worker.js';
import { FeedbackBudget, FEEDBACK_PATH, MAX_BODY, MAX_TEXT, MIN_MS, PER_DAY, PER_HOUR, check, message, subject, take, validEmail, oneLine, cleanText, addressHash } from '../site/feedback.js';

const ORIGIN = 'https://ebbfall.com';
const GOOD = { kind: 'Bug', text: 'The Ballista would not fire at the Drones over the water near my base', email: '', website: '', elapsed: 9000,
  details: { version: 'Version 0123456789ab (last game update abcdef1)', browser: 'Chrome 131 on Android 14', screen: '412x915, window 412x839, 2.63x', input: 'touch', from: 'game' } };

/** A storage in memory, as a Durable Object's (get and put, values copied as structured clone would). */
function memoryStorage() {
  const m = new Map();
  return { m, async get(k) { return m.has(k) ? structuredClone(m.get(k)) : undefined; }, async put(k, v) { m.set(k, structuredClone(v)); } };
}

/** The bindings, faked: `sent` what the email binding was given; `fail` makes it throw; `minute` the binding's verdict;
 *  `down` the budget object unreachable. */
function fakeEnv({ fail = null, minute = true, down = false } = {}) {
  const sent = [], keys = [], storage = memoryStorage();
  const budget = new FeedbackBudget({ storage });
  const env = {
    FEEDBACK_EMAIL: { async send(m) { if (fail) { const e = new Error('nope'); e.code = fail; throw e; } sent.push(m); return { messageId: 'x' }; } },
    FEEDBACK_LIMIT: { async limit({ key }) { keys.push(key); return { success: typeof minute === 'function' ? minute(key) : minute }; } },
    FEEDBACK_BUDGET: { idFromName: (n) => n, get: () => ({ fetch: async (req) => { if (down) throw new Error('down'); return budget.fetch(req); } }) },
  };
  return { env, sent, keys, storage };
}

/** A POST to the endpoint through the Worker (its security headers and routing too). */
function post(body, { env = fakeEnv().env, origin = ORIGIN, type = 'application/json', ip = '203.0.113.7', raw = null, method = 'POST', headers = {} } = {}) {
  const h = { ...(origin ? { Origin: origin } : {}), ...(type ? { 'Content-Type': type } : {}), ...(ip ? { 'CF-Connecting-IP': ip } : {}), ...headers };
  const init = { method, headers: h };
  if (method !== 'GET' && method !== 'HEAD') init.body = raw ?? JSON.stringify(body);
  return worker.fetch(new Request(`${ORIGIN}${FEEDBACK_PATH}`, init), env);
}
const answer = async (res) => ({ status: res.status, body: await res.json() });

test('a good message: sent once, answered { ok: true }, as JSON that is never cached', async () => {
  const f = fakeEnv(), res = await post(GOOD, { env: f.env });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.match(res.headers.get('Content-Type'), /^application\/json/);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.ok(res.headers.get('Content-Security-Policy'), "the Worker's security headers");
  assert.equal(f.sent.length, 1);
});

test('the email: to us, from feedback@ebbfall.com, the subject with the kind and the first words, plain text with the details at the bottom', async () => {
  const f = fakeEnv();
  await post({ ...GOOD, email: '  player@example.org ' }, { env: f.env });
  const m = f.sent[0];
  assert.equal(m.to, 'contact@ebbfall.com');
  assert.deepEqual(m.from, { email: 'feedback@ebbfall.com', name: 'Ebbfall feedback' });
  assert.equal(m.replyTo, 'player@example.org', 'Reply-To: the address given, trimmed');
  assert.equal(m.subject, '[Ebbfall feedback] Bug: The Ballista would not fire at the Drones…');
  assert.ok(!('html' in m), 'no HTML');
  const lines = m.text.split('\n');
  assert.equal(lines[0], GOOD.text, 'the message first');
  const at = lines.indexOf('-- ');
  assert.ok(at > 0, 'then the signature line');
  assert.deepEqual(lines.slice(at + 1, at + 8), ['Kind: Bug', 'Reply to: player@example.org', `Version: ${GOOD.details.version}`, `Browser: ${GOOD.details.browser}`, `Screen: ${GOOD.details.screen}`, 'Input: touch', 'From: game']);
  assert.match(lines[at + 8], /^Sent: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.doesNotMatch(m.text, /203\.0\.113\.7/, 'never the address it came from');
  // No email given: no Reply-To at all.
  const g = fakeEnv();
  await post(GOOD, { env: g.env });
  assert.ok(!('replyTo' in g.sent[0]));
  assert.match(g.sent[0].text, /^Reply to: none given$/m);
  for (const kind of ['Idea', 'Other']) assert.match(message({ text: 'x', kind, email: '', details: {} }).subject, new RegExp(`^\\[Ebbfall feedback\\] ${kind}: x$`));
});

test('the subject: one line of at most eight words, nothing that could end a header', () => {
  assert.equal(subject('Idea', 'short'), '[Ebbfall feedback] Idea: short');
  assert.equal(subject('Bug', 'one two three four five six seven eight'), '[Ebbfall feedback] Bug: one two three four five six seven eight');
  assert.equal(subject('Bug', 'one two three four five six seven eight nine'), '[Ebbfall feedback] Bug: one two three four five six seven eight…');
  assert.equal(subject('Bug', 'line one\r\nBcc: victim@example.com\nline'), '[Ebbfall feedback] Bug: line one Bcc: victim@example.com line');
  assert.equal(subject('Bug', 'x'.repeat(500)).length, '[Ebbfall feedback] Bug: '.length + 81);
  for (const text of ['a\rb', 'a\nb', 'a\u2028b', 'a\u0085b', 'a\u0000b', 'a\u202eb', '\n\n\nSubject: x']) assert.doesNotMatch(subject('Bug', text), /[\r\n\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e]/, JSON.stringify(text));
});

test('header injection: CR, LF and other controls never reach a header; the body keeps its line breaks only', async () => {
  const f = fakeEnv();
  await post({ ...GOOD, text: 'Hello\r\nBcc: victim@example.com\r\n\r\nbody\u0000\u0007\u001b[31m\u202eevil' }, { env: f.env });
  const m = f.sent[0];
  for (const h of [m.to, m.from.email, m.from.name, m.subject]) assert.doesNotMatch(h, /[\r\n]/);
  assert.equal(m.text.split('\n\n-- \n')[0], 'Hello\nBcc: victim@example.com\n\nbody[31mevil', 'line breaks as \\n, every other control gone');
  // A Reply-To with a line break, a second address or a name in it is refused, never sent.
  for (const email of ['a@b.co\r\nBcc: c@d.co', 'a@b.co\nx', 'a@b.co, c@d.co', 'Name <a@b.co>', 'a b@c.co', '"a"@b.co', 'a@b', 'a@b..co', 'a@-b.co', `${'a'.repeat(65)}@b.co`, `a@${'b'.repeat(250)}.co`, '@b.co', 'a@', 'a@b.co\u0000']) {
    const g = fakeEnv(), r = await answer(await post({ ...GOOD, email }, { env: g.env }));
    assert.deepEqual(r, { status: 400, body: { ok: false, error: 'bad email' } }, JSON.stringify(email));
    assert.equal(g.sent.length, 0);
  }
  for (const ok of ['a@b.co', 'first.last+tag@sub.example.org', "o'hara@example.ie", 'X_Y-z@EXAMPLE.COM']) assert.ok(validEmail(ok), ok);
  // The details are single lines of their shape: anything else dropped, never sent.
  const d = check({ ...GOOD, details: { version: 'v1\r\nBcc: x@y.z', browser: '<script>', screen: 'x'.repeat(200), input: 'pen', from: 'https://evil.example/' } });
  assert.deepEqual(d.fields.details, {});
  assert.equal(oneLine(' a \r\n b\t\u2029c '), 'a b c');
  assert.equal(cleanText('a\r\nb\rc\n\n\n\n\nd  \n'), 'a\nb\nc\n\n\nd');
});

test('only from the site\'s own pages: a POST, of JSON, with its Origin', async () => {
  const f = fakeEnv();
  assert.deepEqual(await answer(await post(GOOD, { env: f.env, origin: 'https://evil.example' })), { status: 403, body: { ok: false, error: 'origin' } });
  assert.deepEqual(await answer(await post(GOOD, { env: f.env, origin: null })), { status: 403, body: { ok: false, error: 'origin' } });
  assert.deepEqual(await answer(await post(GOOD, { env: f.env, type: 'application/x-www-form-urlencoded', raw: 'text=hi' })), { status: 415, body: { ok: false, error: 'type' } });
  assert.deepEqual(await answer(await post(GOOD, { env: f.env, type: 'text/plain' })), { status: 415, body: { ok: false, error: 'type' } });
  const get = await post(null, { env: f.env, method: 'GET' });
  assert.equal(get.status, 405); assert.equal(get.headers.get('Allow'), 'POST');
  assert.equal((await post(GOOD, { env: f.env, type: 'application/json; charset=utf-8' })).status, 200, 'a charset is fine');
  assert.equal(f.sent.length, 1);
});

test('size caps: the body (whatever Content-Length says) and the message', async () => {
  const f = fakeEnv();
  assert.deepEqual(await answer(await post(null, { env: f.env, raw: JSON.stringify({ ...GOOD, text: 'x'.repeat(MAX_BODY) }) })), { status: 413, body: { ok: false, error: 'too large' } });
  assert.deepEqual(await answer(await post(null, { env: f.env, raw: '{}', headers: { 'Content-Length': String(MAX_BODY + 1) } })), { status: 413, body: { ok: false, error: 'too large' } });
  assert.deepEqual(await answer(await post({ ...GOOD, text: 'x'.repeat(MAX_TEXT + 1) }, { env: f.env })), { status: 413, body: { ok: false, error: 'too long' } });
  assert.equal((await post({ ...GOOD, text: 'x'.repeat(MAX_TEXT) }, { env: f.env })).status, 200, 'the most the form takes');
  assert.equal((await post({ ...GOOD, text: 'line\r\n'.repeat(MAX_TEXT / 5) }, { env: f.env })).status, 200, "a line break counts one, as the form's maxlength counts it");
  assert.deepEqual(await answer(await post(null, { env: f.env, raw: '{"text":' })), { status: 400, body: { ok: false, error: 'bad request' } });
  assert.deepEqual(await answer(await post(null, { env: f.env, raw: '[1]' })), { status: 400, body: { ok: false, error: 'bad request' } });
  assert.equal(f.sent.length, 2);
});

test('every field checked: a message, one of the kinds, the time on the page', async () => {
  const cases = [
    [{ ...GOOD, text: '' }, 'no message'], [{ ...GOOD, text: ' \n\t ' }, 'no message'], [{ ...GOOD, text: 42 }, 'no message'], [{ ...GOOD, text: '\u0000\u0001' }, 'no message'],
    [{ ...GOOD, kind: 'bug' }, 'bad kind'], [{ ...GOOD, kind: 'Spam' }, 'bad kind'], [{ ...GOOD, kind: undefined }, 'bad kind'],
    [{ ...GOOD, email: 7 }, 'bad email'],
    [{ ...GOOD, elapsed: MIN_MS - 1 }, 'too fast'], [{ ...GOOD, elapsed: 0 }, 'too fast'], [{ ...GOOD, elapsed: '9000' }, 'too fast'], [{ ...GOOD, elapsed: undefined }, 'too fast'], [{ ...GOOD, elapsed: NaN }, 'too fast'],
  ];
  for (const [body, error] of cases) {
    const f = fakeEnv(), r = await answer(await post(body, { env: f.env }));
    assert.deepEqual(r, { status: 400, body: { ok: false, error } }, JSON.stringify(body).slice(0, 80));
    assert.equal(f.sent.length + f.keys.length + f.storage.m.size, 0, 'refused before any limit is counted or anything sent');
  }
  const f = fakeEnv();
  assert.equal((await post({ ...GOOD, elapsed: MIN_MS }, { env: f.env })).status, 200, 'three seconds: in time');
  assert.equal((await post({ kind: 'Idea', text: 'More maps', elapsed: 5000 }, { env: f.env })).status, 200, 'no email, no details: fine');
  assert.match(f.sent[1].text, /^Version: unknown$/m);
});

test('the honeypot: filled, answered as sent, nothing sent or counted', async () => {
  const f = fakeEnv();
  assert.deepEqual(await answer(await post({ ...GOOD, website: 'http://spam.example' }, { env: f.env })), { status: 200, body: { ok: true } });
  assert.equal(f.sent.length + f.keys.length + f.storage.m.size, 0);
});

test("the limits: the binding's minute per address, then the budget's hour per address and day for everyone", async () => {
  // The minute's binding says no: refused, the budget never woken.
  const a = fakeEnv({ minute: false });
  assert.deepEqual(await answer(await post(GOOD, { env: a.env })), { status: 429, body: { ok: false, error: 'limit' } });
  assert.equal(a.sent.length + a.storage.m.size, 0);
  assert.deepEqual(a.keys, ['203.0.113.7'], 'keyed by the address');
  const v6 = fakeEnv();
  await post(GOOD, { env: v6.env, ip: '2001:db8:1:2:aaaa::1' });
  assert.deepEqual(v6.keys, ['2001:db8:1:2'], 'an IPv6 address by its /64');
  // An address's hour: PER_HOUR, then refused; another address goes on.
  const f = fakeEnv();
  for (let i = 0; i < PER_HOUR; i++) assert.equal((await post(GOOD, { env: f.env })).status, 200, `send ${i + 1}`);
  assert.deepEqual(await answer(await post(GOOD, { env: f.env })), { status: 429, body: { ok: false, error: 'limit' } });
  assert.equal((await post(GOOD, { env: f.env, ip: '198.51.100.9' })).status, 200, 'another address');
  assert.equal(f.sent.length, PER_HOUR + 1);
  // The binding failing: the budget still counts (an error is not a no).
  const g = fakeEnv();
  g.env.FEEDBACK_LIMIT.limit = async () => { throw new Error('x'); };
  assert.equal((await post(GOOD, { env: g.env })).status, 200);
});

test('the day for everyone: PER_DAY sends, then "busy" for every address until the next UTC day', async () => {
  const f = fakeEnv();
  const day = new Date().toISOString().slice(0, 10);
  f.storage.m.set('state', { day, count: PER_DAY - 1, hits: {} });
  assert.equal((await post(GOOD, { env: f.env })).status, 200, 'the last of the day');
  assert.deepEqual(await answer(await post(GOOD, { env: f.env, ip: '198.51.100.20' })), { status: 429, body: { ok: false, error: 'busy' } });
  assert.equal(f.sent.length, 1);
  f.storage.m.set('state', { day: '2000-01-01', count: PER_DAY, hits: {} });
  assert.equal((await post(GOOD, { env: f.env })).status, 200, 'a new day');
});

test("the budget's rule: an hour per address, a UTC day for everyone, nothing older than an hour kept", () => {
  const t0 = Date.UTC(2026, 10, 20, 12), H = 3600e3;
  let s = null;
  for (let i = 0; i < PER_HOUR; i++) { const r = take(s, 'aaaa', t0 + i * 1000); assert.ok(r.ok); s = r.state; }
  assert.deepEqual(take(s, 'aaaa', t0 + 5000), { ok: false, why: 'hour', state: s });
  assert.ok(take(s, 'aaaa', t0 + H + 1).ok, 'an hour after the first: one more');
  const later = take(s, 'bbbb', t0 + 2 * H);
  assert.deepEqual(Object.keys(later.state.hits), ['bbbb'], 'times older than an hour forgotten');
  assert.equal(later.state.count, PER_HOUR + 1, "the day's count kept");
  const tomorrow = take(later.state, 'cccc', Date.UTC(2026, 10, 21, 0, 0, 1));
  assert.equal(tomorrow.state.day, '2026-11-21'); assert.equal(tomorrow.state.count, 1);
  let full = { day: '2026-11-20', count: PER_DAY, hits: {} };
  assert.equal(take(full, 'dddd', t0).why, 'day');
  full = { day: '2026-11-20', count: 0, hits: { eeee: 'junk', ffff: [t0 + H, 'x'] } };
  assert.deepEqual(take(full, 'gggg', t0).state.hits, { gggg: [t0] }, 'a malformed or future record ignored');
});

test('the budget object: a short hash of the address only, and it fails closed', async () => {
  const f = fakeEnv();
  await post(GOOD, { env: f.env });
  const state = f.storage.m.get('state');
  const [key] = Object.keys(state.hits);
  assert.match(key, /^[0-9a-f]{16}$/);
  assert.equal(key, await addressHash('203.0.113.7'));
  assert.doesNotMatch(JSON.stringify(state), /203\.0\.113|Ballista|example/, 'no address, no message: counters only');
  assert.equal((await new FeedbackBudget({ storage: memoryStorage() }).fetch(new Request('https://budget/take', { method: 'POST', headers: { 'X-Key': '203.0.113.7' } }))).status, 400, 'a key that is not a hash refused');
  // Unreachable: nothing sent (the form offers the address to write to).
  const d = fakeEnv({ down: true });
  assert.deepEqual(await answer(await post(GOOD, { env: d.env })), { status: 503, body: { ok: false, error: 'unavailable' } });
  assert.equal(d.sent.length, 0);
  // No bindings at all (a Worker deployed without them): unavailable, never a crash.
  assert.deepEqual(await answer(await post(GOOD, { env: {} })), { status: 503, body: { ok: false, error: 'unavailable' } });
});

test('sending fails: 502, the form shows the address to write to; only the error code is logged, never the message', async () => {
  const f = fakeEnv({ fail: 'E_DELIVERY_FAILED' }), logs = [], log = console.log;
  console.log = (s) => logs.push(String(s));
  try {
    assert.deepEqual(await answer(await post(GOOD, { env: f.env })), { status: 502, body: { ok: false, error: 'send' } });
  } finally { console.log = log; }
  assert.deepEqual(logs, ['feedback: not sent (E_DELIVERY_FAILED)']);
});

test('the endpoint is the Worker\'s alone: a tripped limit (1103) leaves the form to its fallback', async () => {
  const res = await worker.fetch(new Request(`${ORIGIN}/api/feedback/`, { method: 'POST', headers: { Origin: ORIGIN } }), {});
  assert.notEqual(res.status, 200, 'only the exact path');
});
