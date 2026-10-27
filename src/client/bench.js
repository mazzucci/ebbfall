// The device test (?bench, loaded by main.js only then; docs/PLAN.md): a card, START (a tap, so also full screen), then
// an 8-seat 128x128 game the AI plays on every seat (Medium), seen with every seat's vision (a replay's), fast-forwarded
// to 3:00 so that armies exist, then a minute of real play through the game's own loop while the camera pans to the
// busiest spots. main.js calls `probe.lap` at the loop's phases while `probe.on`; the sim's share of a step is timed by
// wrapping the WASM Game's own `step`. The report (measurements and device/browser info only, under 64 KB) goes to the
// relay's POST /bench (relay/bench.js), which answers with a code to pass on (PERF-XXXX). Test knobs: &secs= (the
// measured seconds), &at= (the game time to start from).
import { G, DIFF, WW, resetGameSeats, startReplay, step, liveGame, clamp } from '../engine/index.js';
import { cam, view, cv, centerOn } from './gl/render.js';
import { enterFullscreen, isFull } from './screen.js';
import { relayUrl } from './online.js';
import { MAPS } from './maps.js';
import { $ } from './ui.js';

const params = new URLSearchParams(location.search);
const num = (k, d) => (params.get(k) !== null && params.get(k) !== '' && Number.isFinite(+params.get(k)) ? +params.get(k) : d);
const SECS = clamp(num('secs', 60), 3, 300), AT = clamp(num('at', 180), 0, 900);
const MAP = MAPS.find(m => m.size === 128 && !m.random); // (a fixed map: every device plays the same game)
const SEATS = 8, DIFF_MEDIUM = 1, RACES = Array.from({ length: SEATS }, (_, s) => (s % 2 ? 'vael' : 'humans'));
const WARMUP_MS = 1000; // the first second after the start (textures going up) is not counted
const KEEP = 1800; // frames kept raw in the report (the last ones); the summary counts them all
const PICK_TICKS = 180; // the camera looks for the busiest spot every 6 s of game time
const GLIDE_MS = 1500;
const MAX_JSON = 60000;
const BUILD = typeof __SIM_BUILD__ === 'string' ? __SIM_BUILD__ : 'dev';

let probe, ctx, card, badge, shield, refreshHz = 0, high = {};
const frame = () => new Promise(r => requestAnimationFrame(() => r()));

/** Called by main.js with its probe (`on`, `lap`) and its hooks: begin(reset), running(), started(), stop(). */
export function initBench(p, hooks) {
  probe = p; ctx = hooks;
  $('start').hidden = true; // (no menu: the test's card instead)
  card = el('div', 'screen', `<div class="card small" role="dialog" aria-modal="true" aria-label="Device test">
    <h2>Device test</h2>
    <p>Plays an 8-player game for a minute and measures how this device runs Ebbfall.</p>
    <p class="tag">Sends only the timings and this device's model, browser and screen: nothing about you.</p>
    <div id="benchOut"></div>
    <div class="row"><button class="ib" id="benchBack" hidden>TO THE GAME</button><span class="spacer"></span><button class="ib big" id="benchGo">START</button></div>
  </div>`);
  card.id = 'bench';
  badge = el('div', '', ''); badge.style.cssText = 'position:fixed;top:max(6px,env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:16;font:12px var(--mono);color:var(--muted);background:rgba(7,9,13,.7);padding:3px 10px;border-radius:4px;pointer-events:none';
  badge.hidden = true;
  shield = el('div', '', ''); shield.style.cssText = 'position:fixed;inset:0;z-index:15'; shield.hidden = true; // (the test plays alone: taps do nothing)
  $('benchGo').addEventListener('click', () => { enterFullscreen(); run(); }); // (full screen inside the tap)
  $('benchBack').addEventListener('click', () => { location.href = location.pathname; });
  measureRefresh().then(hz => { refreshHz = hz; });
  document.addEventListener('visibilitychange', () => { if (probe.on) M.away = M.hidden = true; }); // (the frame after is not counted)
  navigator.userAgentData?.getHighEntropyValues?.(['model', 'platformVersion', 'architecture', 'bitness', 'fullVersionList']).then(v => { high = v; }, () => {});
  document.body.dataset.bench = 'ready'; // (read by the browser test)
}

function el(tag, cls, html) { const e = document.createElement(tag); e.className = cls; e.innerHTML = html; document.body.appendChild(e); return e; }
const say = (html) => { $('benchOut').innerHTML = html; };

/** The screen's refresh rate: the median rAF interval over a second of an idle page. */
async function measureRefresh() {
  const t = [];
  for (let i = 0; i < 61; i++) { await frame(); t.push(performance.now()); }
  const d = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b);
  return Math.round(1000 / d[d.length >> 1]);
}

// ---- the run ----
let M = null; // the measurement in progress

async function run() {
  $('benchGo').hidden = true; $('benchBack').hidden = true; delete document.body.dataset.bench;
  say(`<p class="tag">Setting up the game…</p>`);
  await frame(); await frame(); // (full screen settles; the card is drawn)
  if (!refreshHz) refreshHz = await measureRefresh();
  // Every seat the AI's; every seat's vision (a replay from the first tick: none of its orders are a person's).
  resetGameSeats(MAP.seed, DIFF_MEDIUM, MAP.kind, 0, RACES, [], RACES.map(() => true), 0, MAP.size);
  startReplay();
  const g = liveGame(), to = AT * 30, t0 = performance.now();
  while (g.tick() < to - 1) {
    g.runTo(Math.min(to - 1, g.tick() + 90)); // (the sim alone, no mirror between ticks)
    say(`<p class="tag">Fast-forwarding to ${fmt(AT)}… ${Math.round(100 * g.tick() / to)}%</p>`);
    await new Promise(r => setTimeout(r, 0));
  }
  const prepMs = performance.now() - t0, prepTicks = g.tick();
  if (to) step();
  G.events.length = 0; // (what happened while skipping: not news now)
  // The sim's share of every step the loop takes: the WASM call timed (core.js's step adds the mirror after it).
  const real = g.step;
  M = newMeasure({ prepMs, prepTicks });
  g.step = function () { const t = performance.now(); real.call(this); M.wasm += performance.now() - t; M.steps++; };
  card.hidden = true; shield.hidden = false; badge.hidden = false;
  ctx.begin(() => {}); // (main.js: the game on screen, its loop running)
  probe.lap = lap; probe.on = true;
}

function newMeasure(prep) {
  const n = Math.ceil(SECS * 250) + 10, f = () => new Float32Array(n);
  return {
    prep, wasm: 0, steps: 0, n: 0, iv: f(), sim: f(), sync: f(), other: f(), render: f(), hud: f(), nsteps: new Uint8Array(n),
    begin: 0, last: 0, prev: 0, cur: null, measured: 0, warmMax: 0, skipped: 0, gaps: 0, lost: 0, stepsAll: 0, hidden: false, away: false,
    sec: null, timeline: { t: [], fps: [], worstMs: [], sim: [], sync: [], other: [], render: [], hud: [], units: [], bldgs: [], projs: [], onScreen: [], behind: [], heapMB: [] },
    long: [], observer: null, cam: { next: 0, from: null, to: null, at: 0 }, heap0: heap(), zoom: 0, left: -1,
  };
}
const heap = () => (performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null);

/** main.js's loop calls this at its phases: 'start' (rAF time), 'steps' (after the fixed steps; only while the game
 *  runs), 'events' (events and effects), 'render', 'end' (the HUD; the frame is done). */
function lap(k, now) {
  const t = performance.now();
  if (k === 'start') {
    if (!M.begin) { M.begin = now; M.zoom = cam.zoom; watchLongTasks(); } // (the zoom a game starts at: begin's)
    M.cur = { iv: M.last ? now - M.last : 0, ran: false, now }; M.last = now; M.wasm = 0; M.steps = 0;
    pan(now);
    M.prev = performance.now(); return;
  }
  const d = t - M.prev, c = M.cur; M.prev = t;
  if (!c) return;
  if (k === 'steps') { c.ran = true; c.sim = M.wasm; c.sync = d - M.wasm; c.n = M.steps; }
  else if (k === 'events') c.other = d;
  else if (k === 'render') c.render = d;
  else if (k === 'end') { c.hud = d; commit(c); M.cur = null; }
}

function commit(c) {
  if (!ctx.started()) { finish('stopped'); return; }
  if (c.now - M.begin < WARMUP_MS) { M.warmMax = Math.max(M.warmMax, c.iv); return; }
  if (!c.ran || M.away) { // (paused, or the page was away: its frames are not the device's)
    M.skipped++; if (M.away) { M.gaps++; M.away = document.hidden; }
    if (M.skipped > 600) finish('interrupted');
    return;
  }
  const i = M.n++;
  M.iv[i] = c.iv; M.sim[i] = c.sim; M.sync[i] = c.sync; M.other[i] = c.other; M.render[i] = c.render; M.hud[i] = c.hud; M.nsteps[i] = c.n;
  M.measured += c.iv; M.stepsAll += c.n; M.lost = M.measured * 30 / 1000 - M.stepsAll; // (game time not kept up with: ticks)
  // A line of the timeline per second: means per frame, the worst frame, what is in the world.
  const s = M.sec ||= { from: i, worst: 0, ms: 0 };
  s.worst = Math.max(s.worst, c.iv); s.ms += c.iv;
  if (s.ms >= 1000 || M.measured >= SECS * 1000) { second(s, i + 1); M.sec = null; }
  const left = Math.max(0, Math.ceil(SECS - M.measured / 1000));
  if (left !== M.left) { M.left = left; badge.textContent = `DEVICE TEST · ${left} s`; }
  if (M.measured >= SECS * 1000 || M.n >= M.iv.length) finish('done');
}

function second(s, end) {
  const T = M.timeline, k = end - s.from, mean = (a) => r2(a.subarray(s.from, end).reduce((x, y) => x + y, 0) / k);
  T.t.push(r1(M.measured / 1000)); T.fps.push(r1(k * 1000 / s.ms)); T.worstMs.push(r1(s.worst));
  T.sim.push(mean(M.sim)); T.sync.push(mean(M.sync)); T.other.push(mean(M.other)); T.render.push(mean(M.render)); T.hud.push(mean(M.hud));
  T.units.push(G.units.length); T.bldgs.push(G.bldgs.length); T.projs.push(G.projs.length);
  const x0 = cam.x, y0 = cam.y, x1 = x0 + view.w / cam.zoom, y1 = y0 + view.h / cam.zoom;
  T.onScreen.push(G.units.filter(u => u.x > x0 && u.x < x1 && u.y > y0 && u.y < y1).length);
  T.behind.push(r1(M.lost)); T.heapMB.push(heap() === null ? null : r1(heap()));
}

function watchLongTasks() {
  try {
    M.observer = new PerformanceObserver((list) => { for (const e of list.getEntries()) M.long.push([r1(e.startTime - M.begin), r1(e.duration)]); });
    M.observer.observe({ type: 'longtask' });
  } catch { M.observer = null; } // (Chrome only)
}

// ---- the camera: to the busiest spot every 6 s of game time (by the game's tick: the same spots on every device) ----
function pan(now) {
  const C = M.cam, vw = view.w / cam.zoom, vh = view.h / cam.zoom;
  if (G.tick >= C.next) {
    C.next = G.tick - (G.tick % PICK_TICKS) + PICK_TICKS;
    C.from = { x: cam.x + vw / 2, y: cam.y + vh / 2 }; C.to = busiest(C.to, Math.max(vw, vh) / 2); C.at = now;
  }
  if (!C.to) return;
  const k = Math.min(1, (now - C.at) / GLIDE_MS), e = k * k * (3 - 2 * k);
  centerOn(C.from.x + (C.to.x - C.from.x) * e, C.from.y + (C.to.y - C.from.y) * e);
}
/** The centre of the 12-tile square with the most going on (fighters, shots; workers count a little), away from the
 *  last spot if another is busy at all; ties to the first square. */
function busiest(last, away) {
  const S = 384, cols = Math.ceil(WW / S), score = new Float64Array(cols * cols);
  const add = (x, y, w) => { const i = clamp(Math.floor(y / S), 0, cols - 1) * cols + clamp(Math.floor(x / S), 0, cols - 1); score[i] += w; };
  for (const u of G.units) add(u.x, u.y, u.d.worker ? 0.25 : 1);
  for (const p of G.projs) add(p.x, p.y, 0.5);
  let best = -1, bestFar = -1;
  for (let i = 0; i < score.length; i++) {
    if (best < 0 || score[i] > score[best]) best = i;
    const x = (i % cols + 0.5) * S, y = (Math.floor(i / cols) + 0.5) * S;
    if ((!last || Math.hypot(x - last.x, y - last.y) > away) && (bestFar < 0 || score[i] > score[bestFar])) bestFar = i;
  }
  const i = bestFar >= 0 && score[bestFar] > 0 ? bestFar : best;
  return { x: (i % cols + 0.5) * S, y: (Math.floor(i / cols) + 0.5) * S };
}

// ---- the report ----
async function finish(how) {
  if (!probe.on) return;
  probe.on = false; probe.lap = () => {};
  const g = liveGame(); delete g.step; // (the prototype's again)
  M.observer?.disconnect();
  ctx.stop();
  shield.hidden = true; badge.hidden = true;
  const report = build(how);
  window.endfallBench = { report, code: null };
  const s = report.summary;
  card.hidden = false;
  const lines = how === 'done'
    ? `<p><b>${s.fps} fps</b> on average (screen ${refreshHz} Hz) · worst frame <b>${s.frameMs.max} ms</b> · ${s.over33}% of frames over 33 ms</p>
       <p class="tag">Per frame: sim ${s.sim.avg} ms, mirror ${s.sync.avg} ms, drawing ${s.render.avg} ms, HUD and the rest ${r2(s.other.avg + s.hud.avg)} ms. Game speed ${Math.round(s.gameSpeed * 100)}%.</p>`
    : `<p>The test was ${how}: ${s.secs} s measured.</p>`;
  say(`${lines}<p id="benchCode" class="tag">Sending…</p>`);
  $('benchBack').hidden = false; $('benchGo').textContent = 'RUN AGAIN'; $('benchGo').hidden = false;
  await send(report);
}

async function send(report) {
  const out = $('benchCode'), base = relayUrl();
  if (!base) { out.textContent = 'Not sent: no server is known here.'; document.body.dataset.bench = 'unsent'; return; }
  try {
    const res = await fetch(new URL('bench', base.replace(/^ws/, 'http')), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.code) throw new Error(body.error || `HTTP ${res.status}`);
    window.endfallBench.code = body.code;
    out.innerHTML = `Your code: <b style="font-size:20px;color:var(--ally2);user-select:all">${body.code}</b> (pass it on: it is kept a week)`;
    document.body.dataset.bench = 'sent';
  } catch (e) {
    out.innerHTML = `Not sent (${esc(e.message || String(e))}). <button class="ib" id="benchRetry">TRY AGAIN</button>`;
    $('benchRetry').addEventListener('click', () => { out.textContent = 'Sending…'; send(report); });
    document.body.dataset.bench = 'failed';
  }
}

function build(how) {
  const n = M.n, sum = (a) => { let s = 0; for (let i = 0; i < n; i++) s += a[i]; return s; };
  const work = new Float32Array(n); for (let i = 0; i < n; i++) work[i] = M.sim[i] + M.sync[i] + M.other[i] + M.render[i] + M.hud[i];
  const over = (ms) => r1(100 * M.iv.subarray(0, n).filter(x => x > ms).length / Math.max(1, n));
  const T = M.timeline, ext = (a) => (a.length ? { start: a[0], end: a.at(-1), max: Math.max(...a) } : null);
  const longMs = M.long.map(l => l[1]);
  const report = {
    v: 1, kind: 'ebbfall-bench', build: BUILD, date: new Date().toISOString(), result: how,
    setup: { map: MAP.name, seed: MAP.seed, mapKind: MAP.kind, size: MAP.size, seats: SEATS, races: RACES, ai: DIFF[DIFF_MEDIUM].name, from: AT, secs: SECS, vision: 'every seat (replay)', zoom: r2(M.zoom) },
    device: device(),
    prep: { ticks: M.prep.prepTicks, ms: Math.round(M.prep.prepMs), msPerTick: r2(M.prep.prepMs / Math.max(1, M.prep.prepTicks)) },
    summary: {
      secs: r1(M.measured / 1000), frames: n, fps: r1(n * 1000 / Math.max(1, M.measured)), refreshHz,
      frameMs: stats(M.iv, n), over16: over(16.7), over33: over(33.4), over50: over(50),
      sim: stats(M.sim, n), sync: stats(M.sync, n), other: stats(M.other, n), render: stats(M.render, n), hud: stats(M.hud, n), work: stats(work, n),
      stepsPerFrame: r2(sum(M.nsteps) / Math.max(1, n)), ticks: M.stepsAll, ticksBehind: r1(Math.max(0, M.lost)), behindMax: Math.max(0, ...T.behind),
      gameSpeed: r2(M.stepsAll / Math.max(1, M.measured * 30 / 1000)),
      longTasks: { n: M.long.length, totalMs: r1(longMs.reduce((a, b) => a + b, 0)), maxMs: longMs.length ? Math.max(...longMs) : 0 },
      heapMB: performance.memory ? { start: r1(M.heap0), end: r1(heap()), max: Math.max(...T.heapMB.filter(x => x !== null), 0), limit: r1(performance.memory.jsHeapSizeLimit / 1048576) } : null,
      units: ext(T.units), bldgs: ext(T.bldgs), projs: ext(T.projs), onScreen: ext(T.onScreen),
      warmupMaxMs: r1(M.warmMax), skipped: M.skipped, gaps: M.gaps, hidden: M.hidden, fullscreen: isFull(),
    },
    timeline: T,
    frames: null,
    longTasks: M.long.slice(0, 60),
  };
  // The last frames raw, in tenths of a ms (fewer if the report would pass the relay's 64 KB).
  for (let keep = Math.min(KEEP, n); ; keep = Math.floor(keep / 2)) {
    const tenth = (a) => Array.from(a.subarray(n - keep, n), x => Math.round(x * 10));
    report.frames = { unit: '0.1 ms', first: n - keep, iv: tenth(M.iv), sim: tenth(M.sim), sync: tenth(M.sync), other: tenth(M.other), render: tenth(M.render), hud: tenth(M.hud), steps: Array.from(M.nsteps.subarray(n - keep, n)) };
    if (JSON.stringify(report).length <= MAX_JSON || keep < 50) break;
  }
  return report;
}

function device() {
  const n = navigator, ua = n.userAgentData;
  return {
    ua: n.userAgent, platform: ua?.platform ?? n.platform ?? null, mobile: ua?.mobile ?? null, model: high.model || null,
    platformVersion: high.platformVersion || null, arch: high.architecture || null, bitness: high.bitness || null,
    brands: high.fullVersionList?.map(b => `${b.brand} ${b.version}`) || ua?.brands?.map(b => `${b.brand} ${b.version}`) || null,
    cores: n.hardwareConcurrency ?? null, memoryGB: n.deviceMemory ?? null,
    screen: { w: screen.width, h: screen.height, availW: screen.availWidth, availH: screen.availHeight, orientation: screen.orientation?.type || null },
    dpr: devicePixelRatio, viewport: { w: innerWidth, h: innerHeight },
    canvas: { cssW: view.w, cssH: view.h, pxW: cv.width, pxH: cv.height, resolution: view.dpr },
    gpu: gpu(), refreshHz, touch: matchMedia('(pointer: coarse)').matches,
  };
}
/** The GPU as WebGL names it (the unmasked names where the browser gives them), from a context of its own. */
function gpu() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    if (!gl) return null;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const out = {
      vendor: gl.getParameter(dbg ? dbg.UNMASKED_VENDOR_WEBGL : gl.VENDOR), renderer: gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
      webgl: gl.getParameter(gl.VERSION), maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    };
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return out;
  } catch { return null; }
}

/** avg, median and tails of the first `n` values, in ms to 0.01. */
function stats(a, n) {
  if (!n) return { avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const s = Float32Array.from(a.subarray(0, n)).sort(), q = (p) => r2(s[Math.min(n - 1, Math.floor(p * n))]);
  let t = 0; for (let i = 0; i < n; i++) t += s[i];
  return { avg: r2(t / n), p50: q(0.5), p95: q(0.95), p99: q(0.99), max: r2(s[n - 1]) };
}
const r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const esc = (s) => s.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
