#!/usr/bin/env node
// The challenge's MCP server (stdio, newline-delimited JSON-RPC): Claude's three tools for steering its Ebbfall seat.
// It holds no game state: each call goes to the local challenge server (server.mjs), found through the state file
// (lib/common.mjs statePath; EBBFALL_CHALLENGE_STATE names another). Node's standard library only.
//
//   set_plan    the start plan before a game, or during one a delta (fields to change) and intents, and a line
//   say         one line to the player (140 characters at most)
//   read_state  the latest check-in digest and the game's state
import { createInterface } from 'node:readline';
import { readState, INTENTS, LINE_MAX, CODE_MAX } from './lib/common.mjs';

const TOOLS = [
  {
    name: 'set_plan',
    description:
      'Steer your Ebbfall seat. Before a game: `plan`, the full start plan as a code (e.g. "1.w14.f6m.s12.e5m"). ' +
      'During a game: `delta`, only the fields to change (e.g. "1.m20.g1m30"), and/or `intents` for an immediate order: ' +
      'attack (the next wave goes now with what it has), hold (no wave leaves for 2 minutes), pull (the wave out comes ' +
      'home), mass (the next wave waits for half again its count). Optional `say`: one line shown to the player with it. ' +
      'The game clamps values to their ranges and answers with what it adjusted and the plan now in force. ' +
      'The game never pauses: a delta takes effect on the tick it arrives.',
    inputSchema: {
      type: 'object',
      properties: {
        plan: { type: 'string', maxLength: CODE_MAX, description: 'A full plan code (before a game starts; during one it is merged like a delta).' },
        delta: { type: 'string', maxLength: CODE_MAX, description: 'During a game: a code with only the fields to change, e.g. "1.m24.pknight".' },
        intents: { type: 'array', items: { type: 'string', enum: INTENTS }, description: 'During a game: immediate orders.' },
        say: { type: 'string', maxLength: LINE_MAX, description: `One line for the player, at most ${LINE_MAX} characters.` },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'say',
    description: `Say one line to the player (shown beside the game and as a short toast in it): at most ${LINE_MAX} characters, one line. The game shows at most one every 5 seconds.`,
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', maxLength: LINE_MAX } },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_state',
    description: 'Read the latest check-in digest (what your seat knows: its economy, army, wave, what it has seen of the enemy, what happened since the last one), the plan in force and the game status. With summary: true after a game, the full game summary.',
    inputSchema: {
      type: 'object',
      properties: { summary: { type: 'boolean' } },
      additionalProperties: false,
    },
  },
];

async function call(body) {
  const s = readState();
  if (!s) return { ok: false, error: 'The Ebbfall challenge server is not running (start it with /ebbfall, or claude/challenge/server.mjs).' };
  try {
    const res = await fetch(`http://127.0.0.1:${s.port}/claude/api/tool`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-challenge-token': s.token },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: `The challenge server did not answer: ${e.message}` };
  }
}

const out = (m) => process.stdout.write(JSON.stringify(m) + '\n');
const reply = (id, result) => out({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => out({ jsonrpc: '2.0', id, error: { code, message } });

async function handle(m) {
  const { id, method, params } = m;
  if (method === 'initialize') {
    return reply(id, {
      protocolVersion: params?.protocolVersion || '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'ebbfall', version: '0.1.0' },
      instructions: 'Tools for playing an Ebbfall seat: set_plan steers it, say talks to the player, read_state reads the latest digest.',
    });
  }
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/list') return reply(id, { tools: TOOLS });
  if (method === 'tools/call') {
    const name = params?.name;
    const a = params?.arguments || {};
    if (!TOOLS.some(t => t.name === name)) return fail(id, -32602, `unknown tool ${name}`);
    const r = await call({ tool: name, ...a });
    return reply(id, { content: [{ type: 'text', text: JSON.stringify(r) }], isError: !r.ok });
  }
  if (id !== undefined) return fail(id, -32601, `no method ${method}`);
}

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let m;
  try { m = JSON.parse(line); } catch { return fail(null, -32700, 'parse error'); }
  handle(m).catch(e => m.id !== undefined && fail(m.id, -32603, String(e.message || e)));
});
rl.on('close', () => process.exit(0));
