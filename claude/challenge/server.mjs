#!/usr/bin/env node
// The challenge's local server: hosts the game (the local `npm run build` output, dist/: no live site, no drift) and
// the challenge page that embeds it with a side panel for Claude's lines (page/), and relays between them and Claude.
// Node's standard library only, 127.0.0.1 only, a random token on every API call.
//
//   node claude/challenge/server.mjs [--mode watch|play] [--dist DIR] [--port N] [--vs CODE] [--plan CODE]
//                                    [--player NAME] [--log DIR] [--mock]
//
// The page relays every message the game posts (claude/PROTOCOL.md) to POST /claude/api/game; the server keeps the
// latest digest and the game's state, logs everything, and prints each one as a JSON line on stdout (the mod reads
// them). The MCP server (mcp.mjs) calls POST /claude/api/tool; the server sends the matching message to the page over
// its event stream, and answers with the game's `ebbfall:applied`. Drivers (drive.mjs, the mod) read
// GET /claude/api/events (a long poll) and post to /claude/api/control (a rematch, Claude's status).
// The address is written to the state file (lib/common.mjs statePath) for the MCP server to find.
// Claude's notes on the player (--player, lib/notes.mjs: ~/.ebbfall-challenge/notes/<player>.md) are saved by the
// save_notes tool and ride on each game's `ready` event (`challenge.notes`), so the next game's first message carries them.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { join, extname, normalize, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statePath, codeError, deltaCode, lineCheck } from './lib/common.mjs';
import { NOTES_MAX, defaultPlayer, playerError, notesPath, notesCheck, readNotes, writeNotes } from './lib/notes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

function args(argv) {
  const o = { mode: 'watch', dist: join(REPO, 'dist'), port: 0, vs: '', plan: '1', log: '', mock: false, player: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => argv[++i];
    if (a === '--mode') o.mode = v();
    else if (a === '--dist') o.dist = resolve(v());
    else if (a === '--port') o.port = Number(v());
    else if (a === '--vs') o.vs = v();
    else if (a === '--plan') o.plan = v();
    else if (a === '--log') o.log = resolve(v());
    else if (a === '--mock') o.mock = true;
    else if (a === '--player') o.player = v();
    else throw new Error(`unknown argument ${a}`);
  }
  if (!['watch', 'play'].includes(o.mode)) throw new Error('--mode is watch or play');
  if (o.vs && !/^[0-9a-z.]{1,60}$/.test(o.vs)) throw new Error('--vs is a challenge code (letters, digits, dots)');
  if (codeError(o.plan)) throw new Error(`--plan: ${codeError(o.plan)}`);
  o.player ||= defaultPlayer(o.mode);
  if (playerError(o.player)) throw new Error(`--player: ${playerError(o.player)}`);
  return o;
}

const opt = args(process.argv.slice(2));
if (process.env.EBBFALL_CHALLENGE_MOCK === '1') opt.mock = true; // (the mod check's stand-in game)
const root = opt.mock ? join(HERE, 'test/mock-game') : opt.dist;
if (!existsSync(join(root, 'index.html'))) {
  console.error(`${root}/index.html is missing: run npm run build first`);
  process.exit(1);
}
const token = randomBytes(18).toString('hex');
if (opt.log) mkdirSync(opt.log, { recursive: true });

// ---------------------------------------------------------------- the state

const S = {
  seq: 0,
  /** The last 2000 things that happened: `{ seq, at, kind, data }` (kind: game, tool, line, control). */
  events: [],
  ready: null,
  start: null,
  digest: null,
  end: null,
  plan: opt.plan,
  game: 0,
  /** `playing` from start to end; `menu` before; `over` after. */
  status: 'menu',
  /** The page's event streams. */
  pages: new Set(),
  /** Tool calls waiting for the game's `ebbfall:applied`, in the order they were sent. */
  waiting: [],
  /** Long polls waiting for the next event. */
  polls: new Set(),
  lines: [],
};

function record(kind, data) {
  const e = { seq: ++S.seq, at: Date.now(), kind, data };
  S.events.push(e);
  if (S.events.length > 2000) S.events.shift();
  if (opt.log) appendFileSync(join(opt.log, 'server.jsonl'), JSON.stringify(e) + '\n');
  process.stdout.write(JSON.stringify({ event: e }) + '\n');
  for (const p of S.polls) p();
  return e;
}

function toPage(m) {
  const line = `data: ${JSON.stringify(m)}\n\n`;
  for (const res of S.pages) res.write(line);
  return S.pages.size;
}

/** A message the game posted, relayed by the page. */
function fromGame(m) {
  if (!m || typeof m.type !== 'string' || !m.type.startsWith('ebbfall:')) return;
  const type = m.type.slice('ebbfall:'.length);
  if (type === 'ready') {
    // The game's hello, with the player's notes for the moment that sets the start plan (read now: a file deleted
    // between games is a reset).
    m = { ...m, challenge: notesView(true) };
    S.ready = m;
  }
  else if (type === 'start') {
    S.start = m; S.digest = null; S.end = null; S.status = 'playing'; S.game++;
    if (typeof m.plan === 'string') S.plan = m.plan;
  } else if (type === 'checkin' || type === 'event') S.digest = { type, tick: m.tick, digest: m.digest };
  else if (type === 'end') { S.end = m; S.status = 'over'; }
  else if (type === 'applied') {
    if (m.ok && typeof m.plan === 'string') S.plan = m.plan;
    S.waiting.shift()?.(m);
  }
  record('game', m);
}

// ---------------------------------------------------------------- the tools (from mcp.mjs)

const APPLIED_WAIT = 8000;

function sendAndWait(msg) {
  if (!S.pages.size) return Promise.resolve({ ok: false, error: 'The challenge page is not open: nothing reached the game.' });
  return new Promise(res => {
    const done = (m) => { clearTimeout(timer); res(m); };
    const timer = setTimeout(() => {
      const i = S.waiting.indexOf(done);
      if (i >= 0) S.waiting.splice(i, 1);
      res({ ok: false, error: 'Sent, but the game did not answer within 8 s (is a game open on the page?).' });
    }, APPLIED_WAIT);
    S.waiting.push(done);
    toPage({ send: msg });
  });
}

function showLine(text, via) {
  const l = { text, via, game: S.game, at: S.digest?.digest?.at ?? null };
  S.lines.push(l);
  toPage({ line: l });
  record('line', l);
}

/** The player's notes: who, where, how long, and the text when asked. */
function notesView(withText) {
  const text = readNotes(opt.player);
  return { player: opt.player, path: notesPath(opt.player), chars: text.length, max: NOTES_MAX, ...(withText ? { notes: text } : {}) };
}

function saveNotes(text) {
  const n = notesCheck(text);
  if (n.error) {
    record('control', { notes: 'refused', player: opt.player, chars: typeof text === 'string' ? text.length : null });
    return { ok: false, error: n.error };
  }
  const path = writeNotes(opt.player, n.text);
  record('notes', { player: opt.player, chars: n.text.length, path, text: n.text });
  return { ok: true, player: opt.player, chars: n.text.length, path, note: 'Saved. The next game against this player starts with these notes, also after /clear or in a new session.' };
}

async function tool(body) {
  const name = body?.tool;
  if (name === 'read_state') return { ok: true, state: stateView(body.summary === true) };
  if (name === 'save_notes') return saveNotes(body.text);
  if (name === 'say') {
    const l = lineCheck(body.text);
    if (l.error) return { ok: false, error: l.error };
    showLine(l.text, 'say');
    if (S.status === 'playing') toPage({ send: { type: 'ebbfall:say', text: l.text } });
    return { ok: true, shown: l.text, note: S.status === 'playing' ? 'Shown on the side panel and in the game.' : 'Shown on the side panel (no game running, so not in the game).' };
  }
  if (name !== 'set_plan') return { ok: false, error: `unknown tool ${name}` };
  let say = null;
  if (body.say !== undefined && body.say !== null && body.say !== '') {
    const l = lineCheck(body.say);
    if (l.error) return { ok: false, error: `say: ${l.error}` };
    say = l.text;
  }
  const intents = Array.isArray(body.intents) ? body.intents : [];
  const fields = body.plan || body.delta || '';
  if (body.plan && body.delta) return { ok: false, error: 'give either plan (a full plan) or delta (fields to change), not both' };
  let msg, kind;
  if (S.status !== 'playing') {
    // Before a game: the start plan (a delta's fields are a plan too; intents wait for the game).
    const code = fields || '1';
    const bad = codeError(code);
    if (bad) return { ok: false, error: bad };
    if (/(^|\.)x/.test(code) || intents.length) return { ok: false, error: 'no game is running yet: intents (x...) are for during the game; send the start plan without them' };
    msg = { type: 'ebbfall:plan', code }; kind = 'plan';
  } else {
    if (!fields && !intents.length && !say) return { ok: false, error: 'a delta needs a field, an intent or a line' };
    if (!fields && !intents.length) return tool({ tool: 'say', text: say });
    const d = deltaCode(fields, intents);
    if (d.error) return { ok: false, error: d.error };
    msg = { type: 'ebbfall:delta', code: d.code, ...(say ? { say } : {}) }; kind = 'delta';
  }
  record('tool', { tool: 'set_plan', kind, msg });
  const applied = await sendAndWait(msg);
  if (say && applied.ok) showLine(say, 'set_plan');
  return {
    ok: !!applied.ok,
    kind,
    sent: msg.code,
    ...(applied.ok ? {} : { error: applied.error || 'refused' }),
    adjusted: applied.adjusted || [],
    plan_now: applied.plan ?? S.plan,
    at: S.digest?.digest?.at ?? null,
  };
}

function stateView(withSummary) {
  return {
    mode: opt.mode,
    status: S.status,
    game: S.game,
    plan: S.plan,
    start: S.start ? { seat: S.start.seat, me: S.start.me, peoples: S.start.peoples, map: S.start.map, adjusted: S.start.adjusted } : null,
    digest: S.digest?.digest ?? null,
    end: S.end ? { result: S.end.result, ...(withSummary ? { summary: S.end.summary } : {}) } : null,
    page_open: S.pages.size > 0,
    // (the text only between games: during one it is already in the conversation, and check-ins stay small)
    notes: notesView(S.status !== 'playing'),
  };
}

// ---------------------------------------------------------------- HTTP

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.webp': 'image/webp', '.txt': 'text/plain', '.xml': 'application/xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };

function serveFile(res, base, path) {
  let p = normalize(join(base, path));
  if (!p.startsWith(base)) { res.writeHead(403); return res.end(); }
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(readFileSync(p));
}

function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((ok, no) => {
    let s = '';
    req.on('data', d => { s += d; if (s.length > 4_000_000) { no(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { no(e); } });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const port = server.address().port;
  // Only this machine's names for this server (no DNS rebinding).
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) { res.writeHead(421); return res.end(); }
  const path = decodeURIComponent(url.pathname);
  if (path.startsWith('/claude/api/')) {
    const given = req.headers['x-challenge-token'] || url.searchParams.get('t');
    if (given !== token) return json(res, 403, { ok: false, error: 'bad token' });
    try {
      return await api(req, res, path.slice('/claude/api/'.length), url);
    } catch (e) {
      return json(res, 400, { ok: false, error: String(e.message || e) });
    }
  }
  if (path === '/claude') { res.writeHead(302, { location: '/claude/' }); return res.end(); }
  if (path.startsWith('/claude/')) return serveFile(res, join(HERE, 'page'), path.slice('/claude/'.length) || 'index.html');
  // No service worker on this origin: the game is always this build, fresh.
  if (path === '/sw.js') { res.writeHead(404); return res.end(); }
  return serveFile(res, root, path);
});

async function api(req, res, name, url) {
  if (name === 'config' && req.method === 'GET') {
    return json(res, 200, { mode: opt.mode, vs: opt.vs, plan: S.plan, mock: opt.mock, player: opt.player, lines: S.lines.filter(l => l.game === S.game), status: S.status });
  }
  if (name === 'stream' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write(': open\n\n');
    S.pages.add(res);
    record('control', { page: 'open', pages: S.pages.size });
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clearInterval(ping); S.pages.delete(res); record('control', { page: 'closed', pages: S.pages.size }); });
    return;
  }
  if (req.method !== 'POST' && name !== 'events' && name !== 'state') return json(res, 405, { ok: false });
  if (name === 'state') return json(res, 200, { ok: true, state: stateView(url.searchParams.get('summary') === '1') });
  if (name === 'events') {
    const after = Number(url.searchParams.get('after') || 0);
    const wait = Math.min(60, Number(url.searchParams.get('wait') || 0)) * 1000;
    const pick = () => S.events.filter(e => e.seq > after);
    if (pick().length || !wait) return json(res, 200, { ok: true, seq: S.seq, events: pick() });
    let finish;
    const timer = setTimeout(() => finish(), wait);
    finish = () => { clearTimeout(timer); S.polls.delete(finish); json(res, 200, { ok: true, seq: S.seq, events: pick() }); };
    S.polls.add(finish);
    req.on('close', () => { clearTimeout(timer); S.polls.delete(finish); });
    return;
  }
  const body = await readBody(req);
  if (name === 'game') { fromGame(body.msg); return json(res, 200, { ok: true }); }
  if (name === 'tool') return json(res, 200, await tool(body));
  if (name === 'control') {
    if (body.action === 'rematch') {
      S.status = 'menu'; S.start = null; S.digest = null;
      const seed = Number.isInteger(body.seed) && body.seed >= 0 && body.seed <= 0xffffffff ? body.seed : null;
      record('control', { action: 'rematch', seed });
      return json(res, 200, { ok: true, pages: toPage({ reload: true, seed }) });
    }
    if (body.action === 'status' && typeof body.status === 'string') {
      toPage({ status: body.status.slice(0, 60) });
      return json(res, 200, { ok: true });
    }
    if (body.action === 'note' && typeof body.text === 'string') {
      record('control', { note: body.text.slice(0, 500) });
      toPage({ note: body.text.slice(0, 200) });
      return json(res, 200, { ok: true });
    }
    if (body.action === 'stop') {
      json(res, 200, { ok: true });
      return stop();
    }
    return json(res, 400, { ok: false, error: 'unknown action' });
  }
  return json(res, 404, { ok: false, error: 'no such call' });
}

const state = statePath();
function stop() {
  try {
    const s = JSON.parse(readFileSync(state, 'utf8'));
    if (s.pid === process.pid) rmSync(state);
  } catch { /* gone already */ }
  for (const res of S.pages) res.end();
  server.close();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
// The mod's child: when the session that started it goes, so does it.
process.stdin.on('end', () => { if (process.env.EBBFALL_CHALLENGE_STDIN_EXIT === '1') stop(); });
process.stdin.resume();

server.listen(opt.port, '127.0.0.1', () => {
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/claude/#t=${token}`;
  mkdirSync(dirname(state), { recursive: true, mode: 0o700 });
  writeFileSync(state, JSON.stringify({ port, token, pid: process.pid, mode: opt.mode, url }), { mode: 0o600 });
  const notes = notesView(false);
  process.stdout.write(JSON.stringify({ ready: true, port, token, url, mode: opt.mode, state, player: opt.player, notes_path: notes.path, notes_chars: notes.chars }) + '\n');
});

