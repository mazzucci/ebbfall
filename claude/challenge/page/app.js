// The challenge page: the game in an iframe (served by server.mjs from the local build) and a side panel for Claude's
// lines. It relays every message the game posts to the server, and the server's messages (Claude's plan, deltas and
// lines) to the game (claude/PROTOCOL.md). Same origin as the game: 127.0.0.1, a loopback origin the game accepts.
const token = new URLSearchParams(location.hash.slice(1)).get('t') || '';
const $ = (id) => document.getElementById(id);
const frame = $('game');
const api = (name, body) => fetch(`/claude/api/${name}`, {
  method: body ? 'POST' : 'GET',
  headers: { 'x-challenge-token': token, ...(body ? { 'content-type': 'application/json' } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}).then(r => r.json());

let cfg = null;
let ready = false;
let helloTimer = 0;

function send(m) {
  frame.contentWindow?.postMessage({ v: 1, ...m }, location.origin);
}

function gameUrl() {
  const q = new URLSearchParams({ embed: '1' });
  if (cfg.plan) q.set('plan', cfg.plan);
  if (cfg.mode === 'watch') q.set('watch', '1');
  if (cfg.vs) q.set('vs', cfg.vs);
  return `/?${q}`;
}

function load() {
  ready = false;
  frame.src = gameUrl();
}

frame.addEventListener('load', () => {
  clearInterval(helloTimer);
  // Until the game answers: it may still be loading its WASM.
  send({ type: 'ebbfall:hello' });
  helloTimer = setInterval(() => (ready ? clearInterval(helloTimer) : send({ type: 'ebbfall:hello' })), 500);
});

function addLine(text, cls, at) {
  const li = document.createElement('li');
  if (cls) li.className = cls;
  if (at) { const t = document.createElement('span'); t.className = 't'; t.textContent = at; li.append(t); }
  li.append(document.createTextNode(text));
  $('lines').append(li);
  li.scrollIntoView({ block: 'end' });
}

function facts(d) {
  if (!d) return;
  if (d.at) $('at').textContent = d.at;
  if (d.plan) $('plan').textContent = d.plan;
  const you = d.you || {};
  if (you.money !== undefined || you.bank !== undefined) $('money').textContent = String(you.bank ?? you.money);
  if (you.army?.value !== undefined) $('army').textContent = String(you.army.value);
}

addEventListener('message', (e) => {
  if (e.source !== frame.contentWindow || e.origin !== location.origin) return;
  const m = e.data;
  if (!m || typeof m.type !== 'string' || !m.type.startsWith('ebbfall:')) return;
  if (m.type === 'ebbfall:ready') {
    if (ready) return; // (one answer per hello sent before the first arrived: only the first counts)
    ready = true; clearInterval(helloTimer);
  }
  if (m.type === 'ebbfall:start') { addLine(`Game on: ${(m.peoples || []).join(' vs ')}, ${m.map?.name ?? ''} ${m.map?.size ?? ''}`, 'game'); $('result').textContent = ''; if (m.plan) $('plan').textContent = m.plan; }
  if (m.type === 'ebbfall:checkin' || m.type === 'ebbfall:event') facts(m.digest);
  if (m.type === 'ebbfall:applied' && m.plan) $('plan').textContent = m.plan;
  if (m.type === 'ebbfall:end') $('result').textContent = `Claude's seat: ${m.result}`;
  api('game', { msg: m }).catch(() => {});
});

function listen() {
  const es = new EventSource(`/claude/api/stream?t=${encodeURIComponent(token)}`);
  es.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.send) send(m.send);
    if (m.line) addLine(m.line.text, '', m.line.at || '');
    if (m.status) { $('status').textContent = m.status; $('status').classList.toggle('busy', m.status !== 'idle'); }
    if (m.note) $('note').textContent = m.note;
    if (m.reload) { addLine('Rematch', 'game'); load(); }
  };
}

(async () => {
  cfg = await api('config');
  $('mode').textContent = cfg.mode === 'watch' ? 'watch: Claude vs Hard' : 'play: you vs Claude';
  for (const l of cfg.lines || []) addLine(l.text, '', l.at || '');
  listen();
  load();
})();
