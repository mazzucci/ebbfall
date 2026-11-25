// The smoke puff, painted in code: round, soft-edged lobes with no outline, pale where the sun (upper left) takes it and
// a cool gray below, growing and thinning over its frames. For a burning roof, a chimney and a cannon's mouth.

/** Frames, a frame's box (world px, square, its middle the puff's) and the texture's px per world px. */
export const PUFF = { frames: 4, box: 22, k: 3 };
const LIT = '244,239,229', SHADE = '126,126,132';
/** Each frame: how far its lobes have spread, their radius (world px) and how solid they are. */
const STEPS = [[1.6, 4.6, 0.8], [2.4, 5.6, 0.66], [3.1, 6.4, 0.46], [3.7, 7, 0.24]];
const LOBES = [[-0.7, 0.25], [0.75, 0.35], [0.05, -0.75]]; // (where they sit, of the spread)

/** Frame `f` of the puff, on a canvas of its own. */
export function paintPuff(f) {
  const { box, k } = PUFF, c = document.createElement('canvas'); c.width = c.height = box * k;
  const g = c.getContext('2d'); g.scale(k, k); g.translate(box / 2, box / 2);
  const [spread, r, a] = STEPS[f];
  const blob = (x, y, r, rgb, alpha) => {
    const q = g.createRadialGradient(x, y, 0, x, y, r);
    for (const [at, v] of [[0, 1], [0.45, 0.82], [0.75, 0.34], [1, 0]]) q.addColorStop(at, `rgba(${rgb},${(alpha * v).toFixed(3)})`);
    g.fillStyle = q; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  };
  for (const [x, y] of LOBES) blob(x * spread, y * spread + 0.8, r, SHADE, a * 0.85);
  for (const [x, y] of LOBES) blob(x * spread - 1, y * spread - 1.1, r * 0.72, LIT, a * 0.8);
  return c;
}
