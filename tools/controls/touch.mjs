// The controls video's fingers (tools/controls/record.mjs): each gesture of a beat (beats.mjs) is a set of strokes, a
// finger down from `t0` to `t1` along a path, and the recorder plays them into the real game through CDP touch events
// (Input.dispatchTouchEvent, stamped on the recorded clock: the game's double-tap window, hold and flick read the
// events' own times), so the hold ring, SELECT lighting up, the selection and the card's details are the game's own.
// The same strokes drive the drawn indicator (overlay.mjs). A stroke's points are resolved in the page when it
// starts (`resolve`: a unit's body, a button's middle, a world point), as the camera and the units move.
//
// `clock` extends the stage's frozen clock (tools/trailer/stage.mjs `freeze`): the page's timers (setTimeout,
// setInterval: the hold's 350 ms, the card's long press) and its CSS animations (the hold ring's fill and pop) run on
// the recorded time, not the wall clock, so a 350 ms hold is ten frames however long each frame takes to draw.

/** Take the page's timers and animations onto the frozen clock (after `freeze`). */
export const clock = (page) => page.evaluate(() => {
  const real = { clear: window.clearTimeout.bind(window) };
  const timers = []; let seq = 1 << 20;
  const now = () => performance.now();
  window.setTimeout = (f, ms = 0, ...a) => { const id = seq++; timers.push({ id, due: now() + Math.max(0, +ms || 0), f, a }); return id; };
  window.setInterval = (f, ms = 0, ...a) => { const id = seq++; const every = Math.max(1, +ms || 0); timers.push({ id, due: now() + every, f, a, every }); return id; };
  window.clearTimeout = window.clearInterval = (id) => { const i = timers.findIndex(x => x.id === id); if (i >= 0) timers.splice(i, 1); else real.clear(id); };
  const anims = new Map(); // (each animation: the recorded time it started at)
  window.__tick = (t) => {
    for (;;) { // (the timers due, in order)
      let d = null; for (const x of timers) if (x.due <= t && (!d || x.due < d.due || (x.due === d.due && x.id < d.id))) d = x;
      if (!d) break;
      if (d.every) d.due += d.every; else timers.splice(timers.indexOf(d), 1);
      if (typeof d.f === 'function') d.f(...d.a);
    }
    for (const a of document.getAnimations()) {
      if (!anims.has(a)) { anims.set(a, t); try { a.pause(); } catch { /* (finished) */ } }
      try { a.currentTime = t - anims.get(a); } catch { /* (finished) */ }
    }
  };
});

/** In the page: window.S.resolve(target) → { x, y } in client px. Targets: { x, y } (client px as given); { unit: id }
 *  (its body's middle, as a tap picks it); { bldg: id } (its footprint's middle); { world: { x, y } }; { el: selector }
 *  (its middle); { card: label } (the command card's button with that label); { units: [ids], pad, corner } → the box
 *  round their bodies: { x0, y0, x1, y1 } (a hold-and-drag starts at its `corner`, 'tl' or 'br', and ends at the other). */
export const resolver = (page) => page.evaluate(() => {
  const e = window.endfall, G = e.G, cam = e.cam;
  const rect = () => document.getElementById('game').getBoundingClientRect();
  const sx = (x) => rect().left + (x - cam.x) * cam.zoom, sy = (y) => rect().top + (y - cam.y) * cam.zoom;
  const mid = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const body = (u) => ({ x: sx(u.x), y: sy(u.y - e.unitTop(u.type) / 2) });
  window.S.resolve = (tg) => {
    if (tg.unit != null) { const u = G.units.find(u => u.id === tg.unit); if (!u) throw new Error(`no unit ${tg.unit}`); return body(u); }
    if (tg.bldg != null) { const b = G.bldgs.find(b => b.id === tg.bldg); if (!b) throw new Error(`no building ${tg.bldg}`); return { x: sx(b.x), y: sy(b.y) }; }
    if (tg.world) return { x: sx(tg.world.x), y: sy(tg.world.y) };
    if (tg.el) { const el = document.querySelector(tg.el); if (!el) throw new Error(`no element ${tg.el}`); return mid(el.getBoundingClientRect()); }
    if (tg.card) { const b = [...document.querySelectorAll('#cmd button')].find(b => b.textContent.includes(tg.card)); if (!b) throw new Error(`no card button ${tg.card}: ${[...document.querySelectorAll('#cmd button')].map(b => b.textContent.trim()).join(', ')}`); return mid(b.getBoundingClientRect()); }
    if (tg.units) {
      const us = tg.units.map(id => G.units.find(u => u.id === id)).filter(Boolean), ps = us.map(body), pad = tg.pad ?? 24;
      return { x0: Math.min(...ps.map(p => p.x)) - pad, y0: Math.min(...ps.map(p => p.y)) - pad, x1: Math.max(...ps.map(p => p.x)) + pad, y1: Math.max(...ps.map(p => p.y)) + pad };
    }
    return { x: tg.x, y: tg.y };
  };
});

const ease = (u) => u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u);
const lerp = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });

/**
 * The gestures (times in seconds from the beat's start; points are targets for `resolve`). Each returns strokes:
 * { id (finger), t0, t1, from, to?, rest? (seconds still before moving), kind ('tap' | 'hold' | 'drag' | 'pinch' |
 * 'press'), via? (the box's corners) }. A stroke's `at(u)` is filled in when it starts, from the resolved points.
 */
export const tap = (t0, at) => [{ id: 1, kind: 'tap', t0, t1: t0 + 0.09, from: at }];
export const doubleTap = (t0, at) => [...tap(t0, at), ...tap(t0 + 0.22, at)];
/** A finger held still `rest` seconds (the ring fills at 0.35), then dragged to `to` over `move` seconds, then lifted. */
export const holdDrag = (t0, from, to, { rest = 0.75, move = 0.9, settle = 0.25 } = {}) => [{ id: 1, kind: 'hold', t0, t1: t0 + rest + move + settle, from, to, rest, move }];
/** A finger that moves at once: a pan (`settle`: still before lifting, so the camera does not glide on). */
export const drag = (t0, from, to, { move = 1.0, settle = 0.3 } = {}) => [{ id: 1, kind: 'drag', t0, t1: t0 + move + settle, from, to, rest: 0, move }];
/** Two fingers `d0` px apart round `center`, going to `d1` apart over `move` seconds (apart: zoom in). */
export const pinch = (t0, center, d0, d1, { move = 1.0, settle = 0.3, angle = 0.5 } = {}) => {
  const dir = { x: Math.cos(angle), y: Math.sin(angle) }, off = (d) => ({ x: dir.x * d / 2, y: dir.y * d / 2 });
  return [1, -1].map((s, i) => ({ id: i + 1, kind: 'pinch', t0, t1: t0 + move + settle, from: center, to: center, rest: 0, move, offFrom: { x: s * off(d0).x, y: s * off(d0).y }, offTo: { x: s * off(d1).x, y: s * off(d1).y } }));
};
/** A finger held on a button `dur` seconds (the card's details show at 0.45), then lifted. */
export const press = (t0, at, dur = 1.6) => [{ id: 1, kind: 'press', t0, t1: t0 + dur, from: at, rest: dur, move: 0 }];

/** Where a stroke's finger is at time t (after `start` filled in its points). */
export function fingerAt(s, t) {
  const dt = t - s.t0;
  if (!s.p1 || dt <= s.rest) return s.offFrom ? { x: s.p0.x + s.offFrom.x, y: s.p0.y + s.offFrom.y } : s.p0;
  const u = ease(s.move > 0 ? (dt - s.rest) / s.move : 1);
  if (s.offFrom) { const o = lerp(s.offFrom, s.offTo, u); return { x: s.p0.x + o.x, y: s.p0.y + o.y }; }
  return lerp(s.p0, s.p1, u);
}

/**
 * Play the strokes into the page frame by frame: `step(t)` dispatches what happened since the last frame (fingers
 * down, moved, up) as CDP touch events stamped at the recorded time, and returns the fingers now down and the taps
 * so far (for the indicator). `epoch`: the recorded clock's zero in the page's epoch seconds.
 */
export function player(page, cdp, strokes, epoch) {
  const all = [...strokes].sort((a, b) => a.t0 - b.t0 || a.id - b.id);
  const down = new Map(); // id → stroke
  let last = -1;
  const send = (type, points, t) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, id: p.id, radiusX: 11, radiusY: 11, force: 0.6 })), timestamp: epoch + t });
  const points = (t) => [...down.values()].map(s => ({ ...fingerAt(s, t), id: s.id }));
  const taps = [], holds = [];
  async function start(s, t) {
    const r = await page.evaluate((tg) => window.S.resolve(tg), s.from);
    if (r.x0 != null) { const br = s.from.corner === 'br'; s.p0 = br ? { x: r.x1, y: r.y1 } : { x: r.x0, y: r.y0 }; s.p1 = br ? { x: r.x0, y: r.y0 } : { x: r.x1, y: r.y1 }; } else { s.p0 = r; s.p1 = s.to ? await page.evaluate((tg) => window.S.resolve(tg), s.to) : null; }
    if (s.p1?.x0 != null) s.p1 = { x: s.p1.x1, y: s.p1.y1 };
    if (s.to?.dx != null) s.p1 = { x: s.p0.x + s.to.dx, y: s.p0.y + s.to.dy }; // (a drag by so much)
    down.set(s.id, s);
    if (s.kind === 'tap') taps.push({ ...s.p0, t: s.t0 });
    if (s.kind === 'hold') holds.push({ ...s.p0, t: s.t0, until: s.t0 + s.rest });
    await send('touchStart', points(t), s.t0);
  }
  return {
    taps, holds,
    async step(t) {
      // Events between the last frame and this one, in their order: lifts and touch-downs by their times, then the
      // moves of the fingers still down.
      const ev = [];
      for (const s of all) if (s.t0 > last && s.t0 <= t) ev.push({ t: s.t0, s, type: 'down' });
      for (const s of down.values()) if (s.t1 > last && s.t1 <= t) ev.push({ t: s.t1, s, type: 'up' });
      ev.sort((a, b) => a.t - b.t || (a.type === 'up' ? -1 : 1));
      for (const x of ev) {
        if (x.type === 'down') await start(x.s, x.t);
        else { down.delete(x.s.id); await send('touchEnd', points(x.t), x.t); }
      }
      if (down.size && [...down.values()].some(s => t - s.t0 > s.rest)) await send('touchMove', points(t), t);
      last = t;
      return { fingers: points(t).map(p => ({ ...p, kind: down.get(p.id).kind, since: t - down.get(p.id).t0 })), taps, holds };
    },
  };
}
