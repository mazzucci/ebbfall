// The challenge's plumbing without a browser or Claude: the server (--mock), a scripted page (its event stream and
// the game's answers, by hand) and the MCP server over stdio, as Claude Code would drive it.
//   node --test claude/challenge/test/
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { deltaCode, codeError, lineCheck } from '../lib/common.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE = join(mkdtempSync(join(tmpdir(), 'ebbfall-challenge-test-')), 'server.json');
const env = { ...process.env, EBBFALL_CHALLENGE_STATE: STATE };
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

test('the MCP server lists exactly three tools', async () => {
  const r = await call('tools/list', {});
  assert.deepEqual(r.result.tools.map(t => t.name), ['set_plan', 'say', 'read_state']);
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
