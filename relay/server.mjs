// The relay as a Node WebSocket server (local play, a LAN or Tailscale game, the e2e tests): rooms by code over one
// endpoint. The rules are relay/room.js's; this file only moves bytes and keeps time. Usage: node relay/server.mjs
// [port] (default 8788). A client connects to ws://host:port/?room=CODE (or ?new=1 to open a room) and says hello.
import { WebSocketServer } from 'ws';
import { Room, TURN_MS } from './room.js';

const ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ'; // (no vowels: no words; no look-alikes)
const MAX_MSG = 64 * 1024;
const ROOM_IDLE_MS = 10 * 60 * 1000; // a room with nobody in it this long is closed

/** Start a relay on `port` (0: any free one). Returns { port, close, rooms }. */
export function startRelay({ port = 8788, latency = 0, jitter = 0 } = {}) {
  const rooms = new Map();
  let seed = Date.now() >>> 0;
  const code = () => {
    for (;;) {
      let c = ''; for (let i = 0; i < 4; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
      if (!rooms.has(c)) return c;
    }
  };
  // (latency and jitter: test knobs, a delay on everything the relay sends, in order per connection)
  const send = (ws, msg) => {
    const data = JSON.stringify(msg);
    if (!latency && !jitter) { if (ws.readyState === 1) ws.send(data); return; }
    const at = Math.max(ws.lastAt || 0, Date.now() + latency + Math.random() * jitter); ws.lastAt = at;
    setTimeout(() => { if (ws.readyState === 1) ws.send(data); }, at - Date.now());
  };
  const wss = new WebSocketServer({ port, maxPayload: MAX_MSG });
  wss.on('connection', (ws, req) => {
    const q = new URL(req.url, 'http://x').searchParams;
    let room = null;
    if (q.get('new')) { const c = code(); room = new Room({ code: c, send, seed: seed++ }); room.lastUsed = Date.now(); rooms.set(c, room); }
    else room = rooms.get((q.get('room') || '').toUpperCase());
    if (!room) { send(ws, { t: 'error', code: 'noroom', msg: 'No such room' }); ws.close(); return; }
    let seated = false;
    ws.on('message', (data) => {
      let msg; try { msg = JSON.parse(data); } catch { return; }
      room.lastUsed = Date.now();
      if (!seated) { seated = room.connect(ws, msg) >= 0; if (!seated) ws.close(); return; }
      room.receive(ws, msg);
    });
    ws.on('close', () => { room.close(ws); room.lastUsed = Date.now(); });
  });
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [c, r] of rooms) {
      r.tick(now);
      if (r.seats.every(s => !s.conn) && now - r.lastUsed > ROOM_IDLE_MS) rooms.delete(c);
    }
  }, TURN_MS / 4);
  const ready = new Promise(res => wss.on('listening', res));
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
