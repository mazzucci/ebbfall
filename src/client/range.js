// The range's circles (the Expedition's machines move faster inside them: crates/endfall-sim/src/world/radio.rs), pure:
// whether a point is in range, by the sim's own rule (exact distance from a source's center, at most its reach), and the
// outline of their union as arcs, for the renderer (gl/render.js). Circles are { x, y, r } in world px (G.radio).

/** Whether (x, y) lies in range: within a circle, its edge included (the sim's `in_radio`, with the same hypot). */
export const inRange = (circles, x, y) => circles.some(c => Math.hypot(c.x - x, c.y - y) <= c.r);

const TAU = Math.PI * 2;
/** An angle brought into [0, 2pi). */
const norm = (a) => ((a % TAU) + TAU) % TAU;

/** The outline of the circles' union: the arcs of each circle's edge that no other circle covers, as
 *  [x, y, r, from, to] (radians, from < to, counter-clockwise in the screen's terms as Pixi's `arc` draws them). A
 *  circle inside another (or a second copy of one) adds nothing; one apart from the rest is a whole turn. */
export function unionArcs(circles) {
  const out = [];
  circles.forEach((c, i) => {
    const cover = []; // the parts of c's edge inside another circle, as [from, to] with from in [0, 2pi)
    for (let j = 0; j < circles.length; j++) {
      if (j === i) continue;
      const o = circles[j], d = Math.hypot(o.x - c.x, o.y - c.y);
      if (d >= c.r + o.r) continue; // apart (or touching)
      if (d + c.r <= o.r && !(d === 0 && c.r === o.r && j > i)) { cover.length = 0; cover.push([0, TAU]); break; } // inside o (of two copies, the first is drawn)
      if (d + o.r <= c.r) continue; // o inside c: c's edge is free
      const at = Math.atan2(o.y - c.y, o.x - c.x), half = Math.acos(Math.max(-1, Math.min(1, (c.r * c.r + d * d - o.r * o.r) / (2 * c.r * d))));
      cover.push([norm(at - half), norm(at - half) + 2 * half]);
    }
    if (cover.length === 1 && cover[0][1] - cover[0][0] >= TAU) return;
    // The free parts: the complement of the covered intervals on the circle, walking once round from 0.
    const spans = cover.flatMap(([a, b]) => (b > TAU ? [[a, TAU], [0, b - TAU]] : [[a, b]])).sort((p, q) => p[0] - q[0]);
    let at = 0; const free = [];
    for (const [a, b] of spans) { if (a > at) free.push([at, a]); at = Math.max(at, b); }
    if (at < TAU) free.push([at, TAU]);
    // A free arc across 0 (one ending at 2pi, another starting at 0) is one arc.
    if (free.length > 1 && free[0][0] === 0 && free.at(-1)[1] === TAU) { const last = free.pop(); free[0] = [last[0] - TAU, free[0][1]]; }
    for (const [a, b] of free) if (b - a > 1e-9) out.push([c.x, c.y, c.r, a, b]);
  });
  return out;
}
