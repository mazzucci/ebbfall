// The desktop controls video's mouse and keyboard (tools/controls/record.mjs, the desktop sets of desktop.mjs): each
// gesture is a set of strokes, as the phone's fingers are (touch.mjs), and the recorder plays them into the real game
// through CDP (Input.dispatchMouseEvent, Input.dispatchKeyEvent, stamped on the recorded clock: the game's double-click
// window and its held keys read the events' own times), so the box, the orders, the card's keys, the control group and
// the pan are the game's own. The same strokes draw the indicator: an arrow cursor, a ring at each click (white for
// the left button, teal for the right), and the keys pressed as keycaps just above the minimap, bottom left (clear of
// the caption under the top bar). A stroke's points are
// resolved in the page when it starts (touch.mjs `resolver`), as the camera and the units move; the cursor glides to
// each point before the click (`glide` seconds), from wherever it was.

const ease = (u) => u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u);
const lerp = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });

/** The strokes (times in seconds from the beat's start; points are targets for `resolve`). */
/** A click at `at` (`button` 'left' or 'right'), the cursor gliding there over `glide` seconds before. */
export const click = (t0, at, { button = 'left', glide = 0.5 } = {}) => [{ kind: 'click', t0, t1: t0 + 0.08, at, button, glide }];
export const rightClick = (t0, at, o = {}) => click(t0, at, { ...o, button: 'right' });
/** Two left clicks 0.18 s apart (the game's double-click window is 400 ms). */
export const doubleClick = (t0, at, o = {}) => [...click(t0, at, o), ...click(t0 + 0.18, at, { ...o, glide: 0, second: true })];
/** The left button held from `from` to `to` over `move` seconds (a box), the cursor gliding to `from` before. */
export const drag = (t0, from, to, { move = 0.9, glide = 0.5 } = {}) => [{ kind: 'drag', t0, t1: t0 + move + 0.06, at: from, to, move, glide }];
/** The cursor moved to `at` over `glide` seconds, nothing pressed (to the screen's edge: the edge pan). */
export const moveTo = (t0, at, { glide = 0.6, stay = 0.5 } = {}) => [{ kind: 'move', t0, t1: t0 + stay, at, glide }];
/** A key down for `hold` seconds: `key` as the event's key ('a', '1', 'ArrowRight'), with Ctrl when `ctrl`. */
export const key = (t0, k, { hold = 0.12, ctrl = false } = {}) => [{ kind: 'key', t0, t1: t0 + hold, key: k, ctrl }];

const CODES = { ArrowRight: 39, ArrowLeft: 37, ArrowUp: 38, ArrowDown: 40, Control: 17 };
/** The DOM code and virtual key code of a key. */
function keyInfo(k) {
  if (k.length === 1) { const up = k.toUpperCase(); return { code: /[0-9]/.test(k) ? `Digit${k}` : `Key${up}`, vk: up.charCodeAt(0), text: k }; }
  return { code: k, vk: CODES[k] || 0, text: undefined };
}
/** What a keycap shows for a key. */
export const capLabel = (k) => ({ ArrowRight: '→', ArrowLeft: '←', ArrowUp: '↑', ArrowDown: '↓', Control: 'Ctrl' }[k] || k.toUpperCase());

/**
 * Play the strokes into the page frame by frame: `step(t)` dispatches what happened since the last frame (the cursor's
 * moves, presses, releases, keys) as CDP events stamped at the recorded time, and returns the indicator's state: the
 * cursor, the clicks so far and the keys down or just released. `epoch`: the recorded clock's zero in the page's epoch
 * seconds; `start`: where the cursor begins (page px).
 */
export function player(page, cdp, strokes, epoch, start = { x: 640, y: 300 }) {
  const all = [...strokes].sort((a, b) => a.t0 - b.t0);
  let cur = { ...start }, last = -1, buttons = 0, active = null; // (active: the stroke whose button is down)
  const clicks = [], keys = [], glides = []; // glides: [{ from, to, t0, t1 }] the cursor's paths
  const mods = () => (keys.some(k => k.ctrl && k.down) ? 2 : 0);
  const mouse = (type, t, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x: Math.round(cur.x * 10) / 10, y: Math.round(cur.y * 10) / 10, buttons, modifiers: mods(), timestamp: epoch + t, ...extra });
  const keyEv = (type, k, t) => { const i = keyInfo(k.key); return cdp.send('Input.dispatchKeyEvent', { type, key: k.key, code: i.code, windowsVirtualKeyCode: i.vk, nativeVirtualKeyCode: i.vk, text: type === 'keyDown' ? i.text : undefined, modifiers: (k.ctrl ? 2 : 0) | mods(), timestamp: epoch + t }); };
  const resolve = async (tg) => { const r = await page.evaluate((tg) => window.S.resolve(tg), tg); return r.x0 != null ? r : (tg.dx != null ? { x: cur.x + tg.dx, y: cur.y + tg.dy } : r); };
  /** The cursor's point at time t along its glides (the latest one that covers t, else where it ended). */
  const cursorAt = (t) => { for (let i = glides.length - 1; i >= 0; i--) { const g = glides[i]; if (t >= g.t0) return t >= g.t1 ? g.to : lerp(g.from, g.to, ease((t - g.t0) / (g.t1 - g.t0))); } return cur; };
  return {
    clicks, keys,
    async step(t) {
      // The strokes starting by this frame: their points resolved, the cursor's glide to them laid out (it begins
      // `glide` seconds before the stroke: the glide is queued when its start comes, from the cursor's point then).
      for (const s of all) {
        if (s.queued || s.t0 - (s.glide || 0) > t) continue;
        s.queued = true;
        if (s.kind === 'key') continue;
        const r = await resolve(s.at);
        if (r.x0 != null) { s.p0 = { x: r.x0, y: r.y0 }; s.p1 = { x: r.x1, y: r.y1 }; } else { s.p0 = r; s.p1 = s.to ? await resolve(s.to) : null; }
        if (s.p1?.x0 != null) s.p1 = { x: s.p1.x1, y: s.p1.y1 };
        if (s.to?.dx != null) s.p1 = { x: s.p0.x + s.to.dx, y: s.p0.y + s.to.dy };
        const from = cursorAt(t), g0 = Math.max(t, s.t0 - (s.glide || 0));
        glides.push({ from, to: s.p0, t0: g0, t1: Math.max(g0 + 0.001, s.t0) });
        if (s.kind === 'drag') glides.push({ from: s.p0, to: s.p1, t0: s.t0 + 0.04, t1: s.t0 + 0.04 + s.move });
      }
      // The events between the last frame and this one, in their order.
      const ev = [];
      for (const s of all) {
        if (s.t0 > last && s.t0 <= t) ev.push({ t: s.t0, s, type: 'down' });
        if (s.t1 > last && s.t1 <= t && s.kind !== 'move') ev.push({ t: s.t1, s, type: 'up' });
      }
      ev.sort((a, b) => a.t - b.t || (a.type === 'up' ? -1 : 1));
      for (const x of ev) {
        const s = x.s;
        if (s.kind === 'key') {
          if (x.type === 'down') { const k = { key: s.key, ctrl: s.ctrl, t0: s.t0, down: true }; keys.push(k); if (s.ctrl) await keyEv('keyDown', { key: 'Control', ctrl: true }, x.t); await keyEv('keyDown', k, x.t); }
          else { const k = keys.find(k => k.key === s.key && k.down); if (k) { k.down = false; k.t1 = x.t; } await keyEv('keyUp', { key: s.key, ctrl: s.ctrl }, x.t); if (s.ctrl) await keyEv('keyUp', { key: 'Control', ctrl: false }, x.t); }
          continue;
        }
        if (x.type === 'down') {
          cur = { ...s.p0 }; await mouse('mouseMoved', x.t, { button: 'none' });
          const button = s.button || 'left', bit = button === 'left' ? 1 : button === 'right' ? 2 : 4;
          buttons |= bit; active = s;
          await mouse('mousePressed', x.t, { button, clickCount: s.second ? 2 : 1 });
          clicks.push({ x: cur.x, y: cur.y, t: x.t, button });
        } else {
          const button = s.button || 'left', bit = button === 'left' ? 1 : button === 'right' ? 2 : 4;
          if (s.kind === 'drag') { cur = { ...s.p1 }; await mouse('mouseMoved', x.t); }
          buttons &= ~bit; active = null;
          await mouse('mouseReleased', x.t, { button, clickCount: s.second ? 2 : 1 });
        }
      }
      // The cursor's glide this frame (a move with the button down drags the box).
      const p = cursorAt(t);
      if (Math.hypot(p.x - cur.x, p.y - cur.y) > 0.01) { cur = { ...p }; await mouse('mouseMoved', t, { button: active ? (active.button || 'left') : 'none' }); }
      last = t;
      return { cursor: { ...cur }, clicks, keys: keys.filter(k => k.down || t - k.t1 < 0.9).map(k => ({ ...k })) };
    },
  };
}

/** The cursor, the click rings and the keycaps, drawn in the page (overlay.mjs's #ct layer, installed there). */
export const CURSOR_CSS = `
#ct .cur{filter:drop-shadow(0 1px 2px rgba(0,0,0,.7))}
#ct .cur path{fill:#fff;stroke:#0b0f16;stroke-width:1.5;stroke-linejoin:round}
#ct .lc{fill:none;stroke:#fff;stroke-width:3}
#ct .rc{fill:none;stroke:#4fd1c5;stroke-width:3}
#ct .keys{position:absolute;left:16px;bottom:176px;display:flex;gap:8px;font-family:'Chakra Petch',sans-serif}
#ct .keys kbd{display:flex;align-items:center;justify-content:center;min-width:44px;height:44px;padding:0 12px;border-radius:7px;background:rgba(18,26,37,.92);border:1px solid #34475f;border-bottom:3px solid #263548;box-shadow:0 2px 8px rgba(0,0,0,.5);font:700 22px 'Chakra Petch',sans-serif;color:#ffd27a;letter-spacing:.02em}
#ct .keys kbd.down{background:#f5a524;color:#1a1205;border-color:#ffd27a;border-bottom-color:#b8771a;transform:translateY(2px)}
#ct .keys .plus{align-self:center;font:700 20px 'Chakra Petch',sans-serif;color:#9fb0c4}
`;

/** Draw the desktop indicator for time t: the cursor, the rings of the clicks of the last 0.45 s, the keycaps. */
export const drawCursor = (page, t, { cursor, clicks, keys }) => page.evaluate(([t, c, clicks, keys]) => {
  const out = [];
  for (const k of clicks) { const u = (t - k.t) / 0.45; if (u >= 0 && u < 1) out.push(`<circle class="${k.button === 'right' ? 'rc' : 'lc'}" cx="${k.x.toFixed(1)}" cy="${k.y.toFixed(1)}" r="${(10 + 24 * u).toFixed(1)}" style="opacity:${(1 - u).toFixed(3)}"/>`); }
  out.push(`<g class="cur" transform="translate(${c.x.toFixed(1)} ${c.y.toFixed(1)}) scale(1.6)"><path d="M0 0 L0 19 L5 14.5 L8.2 22 L11.2 20.7 L8 13.2 L14.5 13.2 Z"/></g>`); // (1.6x a system cursor: it reads at the docs' width)
  document.querySelector('#ct svg').innerHTML = out.join('');
  const caps = keys.map(k => { const held = k.down, age = held ? 0 : t - k.t1, alpha = held ? 1 : Math.max(0, 1 - age / 0.9); const lab = (x) => ({ ArrowRight: '→', ArrowLeft: '←', ArrowUp: '↑', ArrowDown: '↓' }[x] || x.toUpperCase()); return `<span style="display:flex;gap:8px;opacity:${alpha.toFixed(3)}">${k.ctrl ? `<kbd class="${held ? 'down' : ''}">Ctrl</kbd><span class="plus">+</span>` : ''}<kbd class="${held ? 'down' : ''}">${lab(k.key)}</kbd></span>`; });
  let keysEl = document.querySelector('#ct .keys');
  if (!keysEl) { // (just above the minimap and in line with it, wherever the HUD puts it)
    keysEl = document.createElement('div'); keysEl.className = 'keys'; document.getElementById('ct').appendChild(keysEl);
    const mm = document.getElementById('minimap')?.getBoundingClientRect();
    if (mm?.width) Object.assign(keysEl.style, { left: `${Math.round(mm.left)}px`, bottom: `${Math.round(innerHeight - mm.top + 12)}px` });
  }
  keysEl.innerHTML = caps.join('');
}, [t, cursor, clicks, keys]);
