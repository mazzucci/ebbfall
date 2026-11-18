#!/usr/bin/env node
// The headless driver: real Claude plays its seat in the real game page, watch mode (Claude's plan seat vs the
// built-in Hard), no person needed. It starts the challenge server (server.mjs) on the local build, opens the page in
// headless Chromium (Playwright), and at each start, check-in, event and end sends the moment to
// `claude -p --resume <session> --output-format json` with only the challenge's MCP server attached and only its four
// tools allowed. Claude answers through the tools; the page applies them while the game keeps running. A fresh session
// for each game: what carries over to a rematch is Claude's own notes (at most NOTES_MAX characters), saved with the
// save_notes tool at the end of each game, exactly as in /ebbfall: the server keeps them per player
// (lib/notes.mjs: ~/.ebbfall-challenge/notes/<player>.md) and the next game's ready carries them into its first message
// (a copy in notes.md in the log).
//
//   node claude/challenge/drive.mjs [--games 5] [--name s1] [--ceiling 150000] [--speed 1] [--vs CODE]
//                                   [--cap M] [--model M] [--seeds 11,22,..] [--player NAME] [--fresh]
//                                   [--mock] [--stub] [--headed] [--check]
//
// --player: whose notes (default hard, the mod's watch default, so both paths share them; --stub: stub).
// --fresh: the first game starts without the saved notes (its own notes then replace them).
//
// --check runs only the tool-limits check (one tiny call, nothing saved) and prints what Claude could use.
// Logs: target/challenge/logs/<name>-<time>/ (driver.jsonl: every digest, Claude call, tool call, line, result and
// the tokens; transcript.md: the same, readable; series.json: the results and tokens per game).
//
// Never a permission bypass: the limits are the flags in CLAUDE_FLAGS, and the check below refuses to play when Claude
// could reach any tool but the four.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, appendFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { SYSTEM, preGame, moment, postGame } from './lib/prompt.mjs';
import { NOTES_MAX, playerError } from './lib/notes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
/** Kingdom mirror on Dust Quarter (the Standard map kind, 96x96), the plan seat vs Hard (src/client/challenge.js). */
const KINGDOM_MIRROR_96 = '1.4.0.1o.h00h12';
export const TOOLS = ['mcp__ebbfall__set_plan', 'mcp__ebbfall__say', 'mcp__ebbfall__read_state', 'mcp__ebbfall__save_notes'];

function args(argv) {
  const o = { games: 5, name: 's', ceiling: 150_000, speed: 1, vs: KINGDOM_MIRROR_96, cap: 0, model: '', seeds: [], mock: false, stub: false, headed: false, check: false, callTimeout: 150, player: '', fresh: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => argv[++i];
    if (a === '--games') o.games = Number(v());
    else if (a === '--name') o.name = v();
    else if (a === '--ceiling') o.ceiling = Number(v());
    else if (a === '--speed') o.speed = Number(v());
    else if (a === '--vs') o.vs = v();
    else if (a === '--cap') o.cap = Number(v());
    else if (a === '--model') o.model = v();
    else if (a === '--seeds') o.seeds = v().split(',').map(Number).filter(Number.isInteger);
    else if (a === '--mock') o.mock = true;
    else if (a === '--headed') o.headed = true;
    else if (a === '--stub') o.stub = true;
    else if (a === '--check') o.check = true;
    else if (a === '--player') o.player = v();
    else if (a === '--fresh') o.fresh = true;
    else throw new Error(`unknown argument ${a}`);
  }
  o.player ||= o.stub ? 'stub' : 'hard';
  if (playerError(o.player)) throw new Error(`--player: ${playerError(o.player)}`);
  return o;
}

const opt = args(process.argv.slice(2));
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const LOG = join(REPO, 'target/challenge/logs', `${opt.name}-${stamp}`);
const CWD = join(REPO, 'target/challenge/cwd'); // (empty: no project CLAUDE.md, no project settings)
mkdirSync(LOG, { recursive: true });
mkdirSync(CWD, { recursive: true });
const STATE = join(LOG, 'server.json');
const MCP_CONFIG = join(LOG, 'mcp.json');
writeFileSync(MCP_CONFIG, JSON.stringify({
  mcpServers: { ebbfall: { type: 'stdio', command: process.execPath, args: [join(HERE, 'mcp.mjs')], env: { EBBFALL_CHALLENGE_STATE: STATE } } },
}, null, 2));

/** The limits, verbatim: only our MCP server, no built-in tool, only our four tools, anything else denied unasked. */
export const CLAUDE_FLAGS = [
  '--mcp-config', MCP_CONFIG,
  '--strict-mcp-config',
  '--tools', '',
  '--allowedTools', TOOLS.join(','),
  '--permission-mode', 'dontAsk',
  '--permission-prompts', 'none',
  '--setting-sources', 'project',
  '--disable-slash-commands',
  '--no-chrome',
];

const log = (kind, data) => appendFileSync(join(LOG, 'driver.jsonl'), JSON.stringify({ t: Date.now(), kind, ...data }) + '\n');
const md = (s) => appendFileSync(join(LOG, 'transcript.md'), s + '\n');
const say = (s) => { process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${s}\n`); };

// ---------------------------------------------------------------- Claude

function runClaude(argv, timeoutS) {
  return new Promise((ok) => {
    const child = spawn('claude', argv, { cwd: CWD, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, EBBFALL_CHALLENGE_STATE: STATE } });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutS * 1000);
    child.on('close', (code) => { clearTimeout(timer); ok({ code, out, err }); });
  });
}

/** The check: one call with the same limits, stream-json so its first message lists every tool and MCP server Claude
 *  has. Anything but our four tools, or our server not connected: refuse. */
async function checkLimits() {
  const argv = ['-p', 'Reply with the single word OK.', '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--system-prompt', 'You are a test.', ...CLAUDE_FLAGS, ...(opt.model ? ['--model', opt.model] : [])];
  const r = await runClaude(argv, 90);
  const init = r.out.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).find(m => m?.type === 'system' && m.subtype === 'init');
  if (!init) return { ok: false, why: `no init message (exit ${r.code}): ${r.err.slice(-400)}` };
  const tools = init.tools || [];
  const extra = tools.filter(t => !TOOLS.includes(t));
  const servers = init.mcp_servers || [];
  const ours = servers.find(s => s.name === 'ebbfall');
  const okay = extra.length === 0 && TOOLS.every(t => tools.includes(t)) && ours?.status === 'connected' && servers.length === 1;
  return { ok: okay, tools, servers, model: init.model, permissionMode: init.permissionMode, why: okay ? '' : `tools beyond ours: ${JSON.stringify(extra)}; servers: ${JSON.stringify(servers)}` };
}

const series = { name: opt.name, games: [], notes: '', tokens: { input: 0, cache_write: 0, cache_read: 0, output: 0, cost_usd: 0 }, stopped: '' };
const billed = (t) => t.input + t.cache_write + t.output;

let busy = null;
/** One moment to Claude; resolves with its result. One at a time (the caller queues). */
async function ask(text, game) {
  const argv = ['-p', text, '--output-format', 'json', ...(game.started ? ['--resume', game.session] : ['--session-id', game.session]), '--system-prompt', SYSTEM, ...CLAUDE_FLAGS, ...(opt.model ? ['--model', opt.model] : [])];
  game.started = true;
  const t0 = Date.now();
  log('ask', { game: game?.n, text });
  md(`\n**To Claude** (game ${game?.n ?? '-'}):\n\n\`\`\`\n${text.length > 1800 ? text.slice(0, 1800) + '...' : text}\n\`\`\``);
  await control({ action: 'status', status: 'Claude is thinking' });
  const r = opt.stub ? await stubReply(text) : await runClaude(argv, opt.callTimeout);
  await control({ action: 'status', status: 'idle' });
  let j = null;
  try { j = JSON.parse(r.out); } catch { /* below */ }
  const u = j?.usage || {};
  const t = { input: u.input_tokens || 0, cache_write: u.cache_creation_input_tokens || 0, cache_read: u.cache_read_input_tokens || 0, output: u.output_tokens || 0, cost_usd: j?.total_cost_usd || 0 };
  for (const k of Object.keys(t)) { series.tokens[k] += t[k]; if (game) game.tokens[k] += t[k]; }
  const ms = Date.now() - t0;
  log('answer', { game: game?.n, ms, code: r.code, result: j?.result, is_error: j?.is_error, num_turns: j?.num_turns, usage: t, denials: j?.permission_denials, model: Object.keys(j?.modelUsage || {}), err: j ? undefined : (r.err || r.out).slice(-800) });
  md(`\n*Claude (${(ms / 1000).toFixed(1)} s, ${billed(t)} new + ${t.cache_read} cached tokens):* ${j?.result ?? `(failed: ${(r.err || r.out).slice(-300)})`}`);
  if (j?.permission_denials?.length) md(`\n*Denied:* ${JSON.stringify(j.permission_denials)}`);
  // A usage or rate limit: stop at once, no retry around it.
  const said = `${j?.result ?? ''} ${j?.is_error ? 'is_error' : ''} ${j ? '' : r.err + r.out}`;
  if (!opt.stub && (j?.is_error || !j)) { // (a limit comes back as is_error, or as no JSON at all)
    series.stopped = `Claude call failed (${j?.is_error ? 'is_error' : `exit ${r.code}`}): ${said.trim().slice(0, 300)}`;
    say(series.stopped);
  }
  return j;
}

/** --stub: scripted replies through the same tools (no Claude, no tokens), to check the plumbing on the real game. */
let stubN = 0, stubNotes = 0;
async function stubReply(text) {
  const tool = (b) => api('tool', b);
  let did;
  if (/about to start/.test(text) && !/notes from the earlier/.test(text)) did = await tool({ tool: 'set_plan', plan: '1.w14.f5m.s10', say: 'Stub: a greedy start.' });
  else if (/is over/.test(text)) {
    did = await tool({ tool: 'say', text: 'Stub: good game.' });
    // Notes the way Claude writes them: one over the cap first (refused, nothing saved), then a short one.
    const long = await tool({ tool: 'save_notes', text: 'x'.repeat(NOTES_MAX + 1) });
    if (long.ok) throw new Error('stub: save_notes took notes over the cap');
    did = await tool({ tool: 'save_notes', text: `Stub notes ${++stubNotes}: next try 1.w12.parcher (more Archers); the opponent attacked.` });
  }
  else if (/notes from the earlier/.test(text)) did = await tool({ tool: 'set_plan', plan: '1.w12.parcher', say: 'Stub: my notes say Archers.' });
  else if (++stubN % 2 === 1) did = await tool({ tool: 'set_plan', delta: stubN === 3 ? '1.m14' : '', intents: stubN === 3 ? ['mass'] : ['attack'], say: `Stub moment ${stubN}.` });
  const result = `stub: ${JSON.stringify(did ?? 'nothing')}`;
  return { code: 0, err: '', out: JSON.stringify({ result, usage: {}, total_cost_usd: 0, num_turns: 1 }) };
}

// ---------------------------------------------------------------- the server and the page

let server, base, token, page, browser;
async function api(name, body) {
  const r = await fetch(`${base}/claude/api/${name}`, { method: body ? 'POST' : 'GET', headers: { 'x-challenge-token': token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}
const control = (b) => api('control', b).catch(() => null);

function startServer() {
  return new Promise((ok, no) => {
    const argv = [join(HERE, 'server.mjs'), '--mode', 'watch', '--player', opt.player, '--log', LOG, ...(opt.vs ? ['--vs', opt.vs] : []), ...(opt.mock ? ['--mock'] : [])];
    server = spawn(process.execPath, argv, { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, EBBFALL_CHALLENGE_STATE: STATE } });
    const rl = createInterface({ input: server.stdout });
    rl.on('line', (l) => { try { const m = JSON.parse(l); if (m.ready) ok(m); } catch { /* not ours */ } });
    server.on('exit', (c) => no(new Error(`server exited ${c}`)));
  });
}

let seq = 0;
/** The server's events after the last seen; waits up to `wait` s for one. */
async function events(wait = 20) {
  const r = await api(`events?after=${seq}&wait=${wait}`);
  if (r.events?.length) seq = r.events.at(-1).seq;
  return r.events || [];
}

async function gameFrame() {
  for (let i = 0; i < 100; i++) {
    const f = page.frames().find(fr => fr !== page.mainFrame() && /embed=1/.test(fr.url()));
    if (f) return f;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('the game frame did not load');
}

/** Waits for a game message of `type` (after now); others go to `onOther`. */
async function waitFor(type, timeoutS, onOther = () => {}, afterRematch = false) {
  const end = Date.now() + timeoutS * 1000;
  let rematched = !afterRematch;
  while (Date.now() < end) {
    for (const e of await events(5)) {
      if (e.kind === 'control' && e.data.action === 'rematch') rematched = true;
      if (rematched && e.kind === 'game' && e.data.type === `ebbfall:${type}`) return e.data;
      onOther(e);
    }
  }
  return null;
}

async function pressStart() {
  const f = await gameFrame();
  const start = f.locator('#btnStart');
  if (!(await start.isVisible().catch(() => false))) await f.locator('#btnSolo').click({ timeout: 20000 }).catch(() => {});
  await start.click({ timeout: 30000 });
}

// ---------------------------------------------------------------- one game

function trace(e, game) {
  if (e.kind === 'notes' && game) { game.notes = e.data.text; log('notes', { game: game.n, player: e.data.player, chars: e.data.chars, path: e.data.path }); }
  if (e.kind === 'tool') { log('tool', { game: game?.n, ...e.data }); md(`\n- tool \`${e.data.tool}\` ${e.data.kind}: \`${e.data.msg.code}\`${e.data.msg.say ? ` say "${e.data.msg.say}"` : ''}`); }
  if (e.kind === 'line') { log('line', { game: game?.n, ...e.data }); md(`\n> **Claude says** (${e.data.at ?? 'menu'}): ${e.data.text}`); game?.lines.push({ at: e.data.at, text: e.data.text }); }
  if (e.kind === 'game' && e.data.type === 'ebbfall:applied') { log('applied', { game: game?.n, ...e.data }); md(`\n- applied: ok=${e.data.ok} plan=\`${e.data.plan}\`${e.data.adjusted?.length ? ` adjusted ${JSON.stringify(e.data.adjusted)}` : ''}${e.data.error ? ` error ${e.data.error}` : ''}`); game?.deltas.push({ tick: e.data.tick, ok: e.data.ok, plan: e.data.plan, error: e.data.error, adjusted: e.data.adjusted }); }
}

async function playGame(n, record) {
  const game = { n, session: randomUUID(), started: false, seed: opt.seeds.length ? opt.seeds[(n - 1) % opt.seeds.length] : null, notes: '', result: null, at: null, startPlan: null, lines: [], deltas: [], digests: 0, calls: 0, tokens: { input: 0, cache_write: 0, cache_read: 0, output: 0, cost_usd: 0 }, wall_s: 0 };
  const t0 = Date.now();
  md(`\n## Game ${n}\n`);
  const rematch = n > 1 || game.seed !== null;
  if (rematch) await control({ action: 'rematch', ...(game.seed !== null ? { seed: game.seed } : {}) });
  log('game', { game: n, session: game.session, seed: game.seed });
  md(`session ${game.session}${game.seed !== null ? `, seed ${game.seed}` : ''}`);
  // (after a rematch, only the reloaded game's ready: the first load's may still be on its way)
  const ready = await waitFor('ready', 120, e => trace(e, game), rematch);
  if (!ready) throw new Error('the game did not answer hello');
  log('ready', ready);
  // The notes come from the server, as in /ebbfall (--fresh: not for the first game).
  const notes = n === 1 && opt.fresh ? '' : String(ready.challenge?.notes ?? '');
  await ask(preGame({ game: n, series: opt.games, mode: 'watch', peoples: 'Kingdom vs Kingdom', map: 'Dust Quarter (Standard, 96x96)', record, notes }), game);
  game.calls++;
  for (const e of await events(1)) trace(e, game);
  await pressStart();
  const start = await waitFor('start', 60, e => trace(e, game));
  if (!start) throw new Error('the game did not start');
  game.startPlan = start.plan;
  log('start', { ...start, frame: (await gameFrame()).url() });
  game.gameSeed = start.seed ?? null;
  md(`\nStarted: seed ${start.seed}, plan \`${start.plan}\`${start.adjusted?.length ? `, adjusted ${JSON.stringify(start.adjusted)}` : ''}`);
  say(`game ${n}: started with ${start.plan}`);

  const f = await gameFrame();
  // The pace: headless Chromium draws too slowly to keep the game's 30 Hz by itself (about a sixth of it, measured), so
  // the driver keeps game time at `speed` x real time, stepping the sim with endfall.skip where it falls behind.
  const p0 = Date.now(), tick0 = await f.evaluate(() => window.endfall?.G?.tick ?? 0).catch(() => 0);
  let pacing = false;
  const skipper = setInterval(async () => {
    if (pacing) return;
    pacing = true;
    try {
      const target = tick0 + ((Date.now() - p0) / 1000) * 30 * opt.speed;
      await f.evaluate((target) => { const G = window.endfall?.G; if (G && !G.over && G.tick < target) window.endfall.skip((target - G.tick) / 30); }, target);
    } catch { /* the frame is reloading */ }
    pacing = false;
  }, 250);

  let pending = null, inflight = null, end = null;
  const flush = () => {
    if (inflight || !pending || series.stopped) return;
    const p = pending; pending = null;
    game.calls++;
    inflight = ask(p, game).finally(() => { inflight = null; overCeiling(); flush(); });
  };
  while (!end) {
    for (const e of await events(10)) {
      trace(e, game);
      if (e.kind !== 'game') continue;
      const m = e.data;
      if (m.type === 'ebbfall:checkin' || m.type === 'ebbfall:event') {
        game.digests++;
        game.at = m.digest?.at;
        log('digest', { game: n, type: m.type, digest: m.digest });
        md(`\n### ${m.type.slice(8)} ${m.digest?.at} (${m.digest?.why})`);
        // While Claude thinks, only the newest moment waits (its events named).
        pending = moment(m.type.slice(8), m);
        flush();
        if (opt.cap && atLeast(m.digest?.at, opt.cap)) { end = { result: 'timeout', summary: null, capped: true }; break; }
      }
      if (m.type === 'ebbfall:end') { end = m; break; }
    }
    if (series.stopped) { end = { result: 'stopped', summary: null }; break; }
  }
  clearInterval(skipper);
  if (inflight) await inflight;
  game.result = end.result;
  game.styles = end.summary?.seats?.map(x => x.style ?? null) ?? null; // (each seat's AI style, as the summary tells it)
  if (end.summary?.length) game.at = end.summary.length; // (the last digest may be minutes before the end)
  log('end', { game: n, result: end.result, capped: !!end.capped, summary: end.summary });
  md(`\n**Result: ${end.result}** at ${game.at}`);
  say(`game ${n}: ${end.result} at ${game.at}`);
  if (!series.stopped) {
    game.calls++;
    game.notes = '';
    await ask(postGame({ result: end.result, summary: end.summary, game: n, series: opt.games, at: game.at }), game);
    for (const e of await events(1)) trace(e, game);
    if (game.notes) {
      series.notes = game.notes;
      appendFileSync(join(LOG, 'notes.md'), `## After game ${n} (${end.result}, ${game.notes.length} characters, player ${opt.player})\n\n${game.notes}\n\n`);
    } else {
      log('notes', { game: n, saved: false });
      md('\n*No notes saved after this game: the next one starts with the notes saved before.*');
    }
    overCeiling();
  }
  game.wall_s = Math.round((Date.now() - t0) / 1000);
  return game;
}

const atLeast = (at, minutes) => typeof at === 'string' && Number(at.split(':')[0]) >= minutes;
function overCeiling() {
  if (!series.stopped && billed(series.tokens) > opt.ceiling) {
    series.stopped = `token ceiling: ${billed(series.tokens)} > ${opt.ceiling}`;
    say(series.stopped);
  }
}

// ---------------------------------------------------------------- main

async function main() {
  const lim = opt.stub ? { ok: true, tools: TOOLS, servers: [], model: 'stub', permissionMode: '-' } : await checkLimits();
  log('limits', lim);
  say(`limits: ${opt.stub ? 'stub (no Claude)' : lim.ok ? 'enforced' : 'NOT ENFORCED'}; tools ${JSON.stringify(lim.tools)}; servers ${JSON.stringify(lim.servers)}; model ${lim.model}; mode ${lim.permissionMode}`);
  if (!lim.ok) { say(`refusing to play: ${lim.why}`); process.exit(2); }
  if (opt.check) return;
  if (!opt.mock) {
    const dist = join(REPO, 'dist/index.html');
    if (!existsSync(dist)) throw new Error('dist/ is missing: run npm run build first');
    say(`dist built ${statSync(dist).mtime.toISOString()}`);
  }
  const ready = await startServer();
  base = `http://127.0.0.1:${ready.port}`; token = ready.token;
  const { chromium } = await import('playwright-core');
  browser = await chromium.launch({ headless: !opt.headed, args: ['--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  page = await (await browser.newContext({ viewport: { width: 1400, height: 820 } })).newPage();
  page.on('pageerror', (e) => log('pageerror', { message: String(e.message || e) }));
  await page.goto(ready.url);
  md(`# Series ${opt.name}\n\na fresh session per game (notes carried, player ${opt.player}${opt.fresh ? ', fresh' : ''}), ${opt.games} games, ceiling ${opt.ceiling} new tokens, speed ${opt.speed}x, vs ${opt.vs}${opt.mock ? ' (MOCK GAME)' : ''}\n\nClaude flags: \`${CLAUDE_FLAGS.join(' ')}\``);
  const results = [];
  for (let n = 1; n <= opt.games && !series.stopped; n++) {
    const g = await playGame(n, results.map((r, i) => `game ${i + 1} ${r}`).join(', '));
    series.games.push(g);
    results.push(`${g.result} at ${g.at}`);
    writeFileSync(join(LOG, 'series.json'), JSON.stringify({ ...series, billed: billed(series.tokens) }, null, 2));
  }
  writeFileSync(join(LOG, 'series.json'), JSON.stringify({ ...series, billed: billed(series.tokens) }, null, 2));
  say(`series ${opt.name}: ${series.games.map(g => g.result).join(', ')}; ${billed(series.tokens)} new + ${series.tokens.cache_read} cached tokens, $${series.tokens.cost_usd.toFixed(2)}; log ${LOG}`);
}

main().catch((e) => { say(`failed: ${e.stack || e}`); log('failed', { error: String(e.stack || e) }); process.exitCode = 1; })
  .finally(async () => {
    await browser?.close().catch(() => {});
    if (server && server.exitCode === null) server.kill('SIGTERM');
  });
