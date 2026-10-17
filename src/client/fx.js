// Particles and markers. Purely visual: lives in the client, fed by sim events and local input.
export const fx = { list: [] };

export function burst(x, y, r, color, n = 10) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 120;
    fx.list.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.5, t: 0, color, r: 1 + Math.random() * (r / 5) });
  }
}
export function hit(x, y, big) { fx.list.push({ x, y, vx: 0, vy: 0, life: 0.15, t: 0, color: '#fff4c2', r: big ? 7 : 3 }); }
export function marker(x, y, color) { fx.list.push({ x, y, ring: true, color, life: 0.5, t: 0, vx: 0, vy: 0 }); }

export function updateFx(dt) {
  const L = fx.list;
  for (let i = L.length - 1; i >= 0; i--) { const f = L[i]; f.t += dt; if (f.t >= f.life) { L.splice(i, 1); continue; } f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.9; f.vy *= 0.9; }
}
