// The challenge's plumbing without a browser or Claude: the server (--mock), a scripted page (its event stream and
// the game's answers, by hand) and the MCP server over stdio, as Claude Code would drive it.
//   node --test claude/challenge/test/
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { deltaCode, codeError, lineCheck } from '../lib/common.mjs';
import { NOTES_MAX, notesCheck, defaultPlayer, playerError } from '../lib/notes.mjs';
import { preGame } from '../lib/prompt.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TMP = mkdtempSync(join(tmpdir(), 'ebbfall-challenge-test-'));
const STATE = join(TMP, 'server.json');
const HOME = join(TMP, 'home'); // (the notes: never the person's own ~/.ebbfall-challenge)
const env = { ...process.env, EBBFALL_CHALLENGE_STATE: STATE, EBBFALL_CHALLENGE_HOME: HOME };
let server, base, token, mcp, stream;
const rpc = { id: 0, waiting: new Map() };

const api = (name, body) => fetch(`${base}/claude/api/${name}`, { method: body ? 'POST' : 'GET', headers: { 'x-challenge-token': token, 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then(r => r.json());
const call = (method, params) => new Promise(ok => { const id = ++rpc.id; rpc.waiting.set(id, ok); mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
const tool = async (name, args) => JSON.parse((await call('tools/call', { name, arguments: args })).result.content[0].text);

/** The scripted page: answers each `send` the way the game would. */
async function page() {
  const res = await fetch(`${base}/claude/api/stream?t=${token}`);
  const reader = res.body.getReader();
  let buf = '';
  let plan = '1';
  (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buf += new TextDecoder().decode(value);
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
        if (!chunk.startsWith('data: ')) continue;
        const m = JSON.parse(chunk.slice(6));
        if (m.send?.type === 'ebbfall:plan' || m.send?.type === 'ebbfall:delta') {
          const ok = !m.send.code.includes('zz');
          if (ok) plan = m.send.code.replace(/\.x\w+/g, '');
          await api('game', { msg: { type: 'ebbfall:applied', tick: 0, ok, adjusted: ok ? [] : [], plan, ...(ok ? {} : { error: 'not a field' }) } });
        }
      }
    }
  })();
  return reader;
}

before(async () => {
  server = spawn(process.execPath, [join(HERE, '../server.mjs'), '--mock', '--mode', 'watch'], { env, stdio: ['pipe', 'pipe', 'inherit'] });
  const ready = await new Promise(ok => createInterface({ input: server.stdout }).on('line', l => { const m = JSON.parse(l); if (m.ready) ok(m); }));
  base = `http://127.0.0.1:${ready.port}`; token = ready.token;
  mcp = spawn(process.execPath, [join(HERE, '../mcp.mjs')], { env, stdio: ['pipe', 'pipe', 'inherit'] });
  createInterface({ input: mcp.stdout }).on('line', l => { const m = JSON.parse(l); rpc.waiting.get(m.id)?.(m); });
  await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } });
  stream = await page();
});
after(() => { stream?.cancel().catch(() => {}); mcp?.kill(); server?.kill(); });

test('codes, deltas and lines are checked before they go to the game', () => {
  assert.equal(codeError('1.w14.f6m'), null);
  assert.ok(codeError('1.W14'));
  assert.ok(codeError('2.w14'));
  assert.ok(codeError('1..w14'));
  assert.deepEqual(deltaCode('1.m20', ['attack', 'mass next wave']), { code: '1.m20.xattack.xmass' });
  assert.deepEqual(deltaCode('', ['hold']), { code: '1.xhold' });
  assert.ok(deltaCode('1.m20', ['jump']).error);
  assert.ok(lineCheck('x'.repeat(141)).error);
  assert.ok(lineCheck('two\nlines').error);
  assert.equal(lineCheck('  Hello.  ').text, 'Hello.');
});

test('the MCP server lists exactly four tools', async () => {
  const r = await call('tools/list', {});
  assert.deepEqual(r.result.tools.map(t => t.name), ['set_plan', 'say', 'read_state', 'save_notes']);
});

test('a start plan reaches the game before it starts; intents wait for the game', async () => {
  const r = await tool('set_plan', { plan: '1.w14.f6m' });
  assert.equal(r.ok, true); assert.equal(r.kind, 'plan'); assert.equal(r.plan_now, '1.w14.f6m');
  assert.equal((await tool('set_plan', { plan: '1.w14', intents: ['attack'] })).ok, false);
});

test('during a game a delta with intents and a line is applied, and read_state shows the digest', async () => {
  await api('game', { msg: { type: 'ebbfall:start', seat: 0, me: null, peoples: ['Kingdom', 'Kingdom'], map: { name: 'Dust Quarter', size: 96 }, plan: '1.w14.f6m', adjusted: [] } });
  await api('game', { msg: { type: 'ebbfall:checkin', tick: 3600, digest: { n: 1, at: '2:00', why: 'every 2 minutes' } } });
  const r = await tool('set_plan', { delta: '1.m20', intents: ['mass'], say: 'Gathering for one big push.' });
  assert.equal(r.ok, true); assert.equal(r.kind, 'delta'); assert.equal(r.sent, '1.m20.xmass');
  const bad = await tool('set_plan', { delta: '1.zz3' });
  assert.equal(bad.ok, false); assert.match(bad.error, /not a field/);
  const s = await tool('read_state', {});
  assert.equal(s.state.status, 'playing'); assert.equal(s.state.digest.at, '2:00');
  const ev = await api('events?after=0');
  assert.ok(ev.events.some(e => e.kind === 'line' && e.data.text === 'Gathering for one big push.'));
});

test('say is capped, and the API refuses a wrong token', async () => {
  assert.equal((await tool('say', { text: 'y'.repeat(200) })).ok, false);
  assert.equal((await tool('say', { text: 'Nice wall.' })).ok, true);
  const r = await fetch(`${base}/claude/api/state`, { headers: { 'x-challenge-token': 'nope' } });
  assert.equal(r.status, 403);
});

// ---------------------------------------------------------------- the notes

/** Another server on its own state file (the MCP server keeps talking to the first): `{ proc, api, ready }`. */
async function extraServer(args, i) {
  const e = { ...env, EBBFALL_CHALLENGE_STATE: join(TMP, `server-${i}.json`) };
  const proc = spawn(process.execPath, [join(HERE, '../server.mjs'), '--mock', ...args], { env: e, stdio: ['pipe', 'pipe', 'inherit'] });
  const ready = await new Promise(ok => createInterface({ input: proc.stdout }).on('line', l => { const m = JSON.parse(l); if (m.ready) ok(m); }));
  const b = `http://127.0.0.1:${ready.port}`;
  const api = (name, body) => fetch(`${b}/claude/api/${name}`, { method: body ? 'POST' : 'GET', headers: { 'x-challenge-token': ready.token, 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then(r => r.json());
  return { proc, api, ready };
}
const stopped = (proc) => new Promise(ok => { proc.on('exit', ok); proc.kill('SIGTERM'); });

test('notes over the cap are refused with how long they are, and nothing is saved', async () => {
  const before = (await tool('read_state', {})).state.notes;
  assert.equal(before.player, 'hard'); // (watch mode's default)
  assert.equal(before.path, join(HOME, 'notes', 'hard.md'));
  const long = await tool('save_notes', { text: 'n'.repeat(NOTES_MAX + 1) });
  assert.equal(long.ok, false);
  assert.match(long.error, new RegExp(`${NOTES_MAX + 1} characters; the most is ${NOTES_MAX}.*rewrite them shorter`));
  assert.equal(existsSync(before.path), false);
  assert.equal((await tool('save_notes', { text: '   ' })).ok, false);
  const exact = 'Next try: 1.w12.parcher. ' + 'm'.repeat(NOTES_MAX - 25);
  const ok = await tool('save_notes', { text: exact });
  assert.equal(ok.ok, true); assert.equal(ok.chars, NOTES_MAX);
  assert.equal(readFileSync(before.path, 'utf8').trim(), exact);
  assert.ok(notesCheck('a\nb\tc').text);
  assert.ok(notesCheck('bell\u0007').error);
});

test('the next game\'s ready carries the notes, and read_state shows them between games', async () => {
  await tool('save_notes', { text: 'Next try: 1.w12.parcher. Hard pushed at 6:00.' });
  await api('control', { action: 'rematch' });
  const last = (await api('events?after=0')).seq;
  await api('game', { msg: { type: 'ebbfall:ready', v: 1 } });
  const ev = await api(`events?after=${last}`);
  const ready = ev.events.find(e => e.kind === 'game' && e.data.type === 'ebbfall:ready');
  assert.equal(ready.data.challenge.player, 'hard');
  assert.equal(ready.data.challenge.notes, 'Next try: 1.w12.parcher. Hard pushed at 6:00.');
  assert.equal((await tool('read_state', {})).state.notes.notes, 'Next try: 1.w12.parcher. Hard pushed at 6:00.');
  // (the driver's first message, from the same notes)
  assert.match(preGame({ game: 2, mode: 'watch', peoples: 'Kingdom vs Kingdom', map: 'Dust Quarter', record: 'game 1 lost', notes: ready.data.challenge.notes }), /Your notes from the earlier games[^\n]*\nNext try: 1\.w12\.parcher/);
});

test('notes persist per player across a server restart, and two players stay separate', async () => {
  const a1 = await extraServer(['--mode', 'play', '--player', 'alice'], 1);
  assert.equal(a1.ready.player, 'alice'); assert.equal(a1.ready.notes_chars, 0);
  assert.equal((await a1.api('tool', { tool: 'save_notes', text: 'Alice walls early; try 1.f3m.s6.' })).ok, true);
  await stopped(a1.proc);

  const b = await extraServer(['--mode', 'play', '--player', 'bob'], 2);
  assert.equal((await b.api('state')).state.notes.notes, '');
  assert.equal((await b.api('tool', { tool: 'save_notes', text: 'Bob rushes Riders.' })).ok, true);
  await stopped(b.proc);

  const a2 = await extraServer(['--mode', 'play', '--player', 'alice'], 3);
  assert.equal(a2.ready.notes_chars, 'Alice walls early; try 1.f3m.s6.'.length);
  assert.equal((await a2.api('state')).state.notes.notes, 'Alice walls early; try 1.f3m.s6.');
  await a2.api('game', { msg: { type: 'ebbfall:ready', v: 1 } });
  const ready = (await a2.api('events?after=0')).events.find(e => e.kind === 'game' && e.data.type === 'ebbfall:ready');
  assert.equal(ready.data.challenge.notes, 'Alice walls early; try 1.f3m.s6.');
  await stopped(a2.proc);

  assert.equal(readFileSync(join(HOME, 'notes', 'bob.md'), 'utf8').trim(), 'Bob rushes Riders.');
  assert.equal(readFileSync(join(HOME, 'notes', 'alice.md'), 'utf8').trim(), 'Alice walls early; try 1.f3m.s6.');
});

test('player names are checked, with a default per mode', async () => {
  assert.equal(defaultPlayer('watch'), 'hard');
  assert.equal(defaultPlayer('play', { USER: 'Sam.Smith' }), 'samsmith');
  assert.equal(defaultPlayer('play', { USER: '...' }), 'player');
  assert.equal(playerError('sam_2'), null);
  for (const bad of ['../x', 'Sam', '', 'a'.repeat(33), '-x']) assert.ok(playerError(bad), bad);
  const proc = spawn(process.execPath, [join(HERE, '../server.mjs'), '--mock', '--player', '../etc'], { env: { ...env, EBBFALL_CHALLENGE_STATE: join(TMP, 'server-bad.json') }, stdio: 'ignore' });
  assert.notEqual(await new Promise(ok => proc.on('exit', ok)), 0);
});
