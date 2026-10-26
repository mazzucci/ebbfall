// The relay as a Node WebSocket server (local play, a LAN or Tailscale game, the e2e tests): rooms by code over one
// endpoint. The rules are relay/room.js's; this file only moves bytes and keeps time. Usage: node relay/server.mjs
// [port] (default 8788). A client connects to ws://host:port/?room=CODE (or ?new=1 to open a room) and says hello.
import { WebSocketServer } from 'ws';
import { Room, TURN_MS } from './room.js';

const ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ'; // (no vowels: no words; no look-alikes)
const MAX_MSG = 64 * 1024;
const ROOM_IDLE_MS = 10 * 60 * 1000; // a room with nobody in it this long is closed
const HELLO_MS = 10000; // a connection that has not said hello by then is closed

/** Start a relay on `port` (0: any free one). `latency`/`jitter` (ms): test knobs, a delay on everything the relay
 *  sends (in order per connection). Returns { port, ready, close, rooms }. */
export function startRelay({ port = 8788, latency = 0, jitter = 0 } = {}) {
  const rooms = new Map();
  let seed = Date.now() >>> 0;
  const code = () => {
    for (;;) {
      let c = ''; for (let i = 0; i < 4; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
      if (!rooms.has(c)) return c;
    }
  };
  // Every connection's messages go out in order, after the test delay if any (one queue, one timer at a time).
  const flush = (ws) => {
    ws.timer = null;
    while (ws.queue.length && ws.queue[0].at <= Date.now()) {
      const m = ws.queue.shift();
      if (m.close) { ws.close(); ws.queue.length = 0; return; }
      if (ws.readyState === 1) ws.send(m.data);
    }
    if (ws.queue.length) ws.timer = setTimeout(() => flush(ws), ws.queue[0].at - Date.now());
  };
  const later = (ws, m) => {
    const at = Math.max(ws.queue.at(-1)?.at ?? 0, Date.now() + latency + Math.random() * jitter);
    ws.queue.push({ ...m, at });
    if (!ws.timer) ws.timer = setTimeout(() => flush(ws), at - Date.now());
  };
  const send = (ws, msg) => {
    const data = JSON.stringify(msg);
    if (latency || jitter) later(ws, { data });
    else if (ws.readyState === 1) ws.send(data);
  };
  const kick = (ws) => { if (latency || jitter) later(ws, { close: true }); else ws.close(); };
  const wss = new WebSocketServer({ port, maxPayload: MAX_MSG });
  wss.on('error', () => {}); // (a failed listen is reported through `ready`)
  wss.on('connection', (ws, req) => {
    ws.queue = []; ws.timer = null;
    ws.on('error', () => {}); // (an oversize or broken frame: `close` follows; it must not take the server down)
    const q = new URL(req.url, 'http://x').searchParams;
    let room = null;
    if (q.get('new')) { const c = code(); room = new Room({ code: c, send, kick, seed: seed++ }); room.lastUsed = Date.now(); rooms.set(c, room); }
    else room = rooms.get((q.get('room') || '').toUpperCase());
    if (!room) { send(ws, { t: 'error', code: 'noroom', msg: 'No such room' }); kick(ws); return; }
    let seated = false;
    const silent = setTimeout(() => { if (!seated) ws.terminate(); }, HELLO_MS);
    ws.on('message', (data) => {
      let msg; try { msg = JSON.parse(data); } catch { return; }
      room.lastUsed = Date.now();
      if (!seated) {
        if (rooms.get(room.code) !== room) { send(ws, { t: 'error', code: 'noroom', msg: 'No such room' }); kick(ws); return; } // (closed meanwhile)
        seated = room.connect(ws, msg) >= 0;
        if (!seated) kick(ws);
        return;
      }
      room.receive(ws, msg);
    });
    ws.on('close', () => { clearTimeout(silent); clearTimeout(ws.timer); room.close(ws); room.lastUsed = Date.now(); });
  });
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [c, r] of rooms) {
      r.tick(now);
      if (r.seats.every(s => !s.conn) && now - r.lastUsed > ROOM_IDLE_MS) rooms.delete(c);
    }
  }, TURN_MS / 4);
  const ready = new Promise((res, rej) => { wss.once('listening', res); wss.once('error', rej); });
  return {
    rooms, ready,
    get port() { return wss.address().port; },
    close: () => new Promise(res => { clearInterval(timer); for (const c of wss.clients) c.terminate(); wss.close(res); }),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = startRelay({ port: Number(process.argv[2] || 8788) });
  await r.ready;
  console.log(`Ebbfall relay on ws://localhost:${r.port}`);
}
