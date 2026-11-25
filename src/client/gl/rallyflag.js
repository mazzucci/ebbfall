// The rally flag, painted in code: a long red pennant with a thin dark outline on a pale pole, standing in a small red
// ring on the ground, its cloth waving over FLAG_FRAMES frames. Red whatever the seat: an order's mark, not a seat's.
// A red seat's own flags (look.js SEAT_COLORS, the orange-red 0xe5553a and the rose 0xe0386e) are the rectangular cloths
// and small tips on its buildings, never on the open ground: the ring, the dark outline and the deeper red set it apart,
// and it is drawn for this side's selected building alone (render.js `rallyMarks`).

/** The cloth's red, and the dark of its outline. */
export const RALLY_RED = 0xc41020, RALLY_EDGE = 0x23070b;
/** Frames of the cloth's wave, and how many a second. */
export const FLAG_FRAMES = 4, FLAG_FPS = 6;
/** A frame's box (world px), the pole's foot in it, and the texture's px per world px (sharp at the closest zoom on a 2x
 *  screen; mipmapped down to a phone's). */
export const FLAG_BOX = { w: 32, h: 32, x: 9, y: 27, k: 4 };

const css = (c) => '#' + c.toString(16).padStart(6, '0');
/** A point on the cloth's edge: `u` 0 at the pole, 1 at the tip; `side` -1 the top edge, 1 the bottom. */
const cloth = (u, side, f) => {
  const { x, y } = FLAG_BOX, wave = Math.sin(u * 4.6 - f / FLAG_FRAMES * Math.PI * 2) * 1.3 * u;
  return [x + 0.6 + u * 17, y - 17.8 + wave + side * 5.2 * (1 - u * 0.9)];
};
/** Frame `f` of the flag, on a canvas of its own. */
export function paintFlag(f) {
  const { w, h, x, y, k } = FLAG_BOX, c = document.createElement('canvas'); c.width = w * k; c.height = h * k;
  const g = c.getContext('2d'); g.scale(k, k); g.lineJoin = g.lineCap = 'round';
  const line = (width, color) => { g.lineWidth = width; g.strokeStyle = color; g.stroke(); };
  // the ring on the ground: the spot itself
  g.beginPath(); g.ellipse(x, y, 6.4, 3, 0, 0, Math.PI * 2); line(2.6, css(RALLY_EDGE)); line(1.3, css(RALLY_RED));
  // the pole
  g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 24); line(2.8, css(RALLY_EDGE)); line(1.4, '#f0ebdf');
  // the cloth: its outline, its red, a darker lower half
  g.beginPath();
  for (let i = 0; i <= 12; i++) g.lineTo(...cloth(i / 12, -1, f));
  for (let i = 12; i >= 0; i--) g.lineTo(...cloth(i / 12, 1, f));
  g.closePath(); line(2, css(RALLY_EDGE)); g.fillStyle = css(RALLY_RED); g.fill();
  g.beginPath();
  for (let i = 0; i <= 12; i++) g.lineTo(...cloth(i / 12, 0.2, f));
  for (let i = 12; i >= 0; i--) g.lineTo(...cloth(i / 12, 1, f));
  g.closePath(); g.fillStyle = 'rgba(60,0,8,.28)'; g.fill();
  return c;
}
