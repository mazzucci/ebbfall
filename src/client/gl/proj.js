// The map's projection, a trial (`?iso=34,0.512`; `?iso=1` means the same; off without it): the ground turned by an angle and
// squashed down the screen, what stands on it kept upright. Two spaces: world px, which the sim knows, and plane px,
// world px projected (one plane px is one screen px at zoom 1; the camera, cam.x and cam.y, is in plane px). With the
// switch off the two are the same numbers, returned untouched. Pure: no DOM, no PixiJS.

/** The default: what the new pictures are drawn at. */
export const TURN = 34, SQUASH = 0.512;

/** `?iso=` read: null (off), or `{ turn, squash }` (degrees; the share of its height the turned ground keeps). */
export function parseIso(v) {
  if (v == null || v === '' || v === '0') return null;
  if (v === '1') return { turn: TURN, squash: SQUASH };
  const [turn, squash] = v.split(',').map(Number);
  return turn > 0 && turn < 90 && squash > 0.2 && squash <= 1 ? { turn, squash } : null;
}

/** The projection for `iso` (parseIso's; null: the flat map of today). */
export function makeProj(iso) {
  if (!iso) return { on: false, turn: 0, k: 1, cos: 1, sin: 0, X: (x) => x, Y: (x, y) => y, to: (x, y) => ({ x, y }), from: (x, y) => ({ x, y }), up: (x, y, h) => ({ x, y: y - h }), shift: (x, y, dx, dy) => ({ x: x + dx, y: y + dy }), face: (f) => f, depth: (x, y) => y, area: 1, span: 1 };
  const a = iso.turn * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), k = iso.squash;
  const X = (x, y) => c * x - s * y, Y = (x, y) => k * (s * x + c * y);
  const from = (px, py) => ({ x: c * px + s * py / k, y: -s * px + c * py / k });
  const shift = (x, y, dx, dy) => ({ x: x + c * dx + s * dy / k, y: y - s * dx + c * dy / k });
  return {
    on: true, turn: iso.turn, k, cos: c, sin: s, X, Y, from, shift,
    to: (x, y) => ({ x: X(x, y), y: Y(x, y) }),
    /** The ground point drawn `h` px higher on the screen than (x, y): how an effect up on a body is placed. */
    up: (x, y, h) => shift(x, y, 0, -h),
    /** A heading on the ground as the angle it is seen at on the screen. */
    face: (f) => Math.atan2(k * (s * Math.cos(f) + c * Math.sin(f)), c * Math.cos(f) - s * Math.sin(f)),
    /** The draw order. The screen's y alone (s x + c y) is right at 45 degrees only: turned less, a square's two side
     *  corners are not level (the left one lower), and what stands by the east wall near the right corner sorts behind
     *  the building. The line between those corners is x + y = const at any turn, so x + y tells in front from behind
     *  of any square footprint; between two units close enough to overlap it is the screen's order too. */
    depth: (x, y) => x + y,
    /** Plane px² a world px² takes; the plane's width of a map one px wide. */
    area: k, span: c + s,
  };
}

/** The page's. */
export const proj = makeProj(typeof location === 'undefined' ? null : parseIso(new URLSearchParams(location.search).get('iso')));
