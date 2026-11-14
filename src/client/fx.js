// Particles and markers. Purely visual: lives in the client, fed by sim events and local input.
export const fx = { list: [] };

/** A death's debris in its side's color (whose fighter fell: the cue at phone zoom), sparse and small: a third of the
 *  sim's `n` pieces, each 1 to 2 px, gone in 0.3 to 0.5 s, so it reads as a scatter, not confetti. */
export function burst(x, y, color, n = 10) {
  for (let i = 0; i < Math.ceil(n / 3); i++) {
    const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 100;
    fx.list.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + Math.random() * 0.2, t: 0, color, r: 1 + Math.random() });
  }
}
export function marker(x, y, color) { fx.list.push({ x, y, ring: true, color, life: 0.5, t: 0, vx: 0, vy: 0 }); }
/** A particle's drawn size (px): its `r` when new, shrinking to half as it fades (`k`: its life left, 1 to 0), at least 1. */
export const partSize = (f, k) => Math.max(1, Math.round(f.r * (0.5 + 0.5 * k)));

export function updateFx(dt) {
  const L = fx.list;
  for (let i = L.length - 1; i >= 0; i--) { const f = L[i]; f.t += dt; if (f.t >= f.life) { L.splice(i, 1); continue; } f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.9; f.vy *= 0.9; }
}
