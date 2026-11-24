// The new look's light: a bright early afternoon (the target still, scene-sun.jpg in the local pictures folder). One curve
// for every picture that goes into a pack, applied when it is built, never at run time: a lift that rolls off at the top
// (white panels keep their detail), a little more contrast and saturation, slightly warm highlights. The numbers are the
// still's own (scene-sun.mjs, the pixel loop before it is encoded). Never on a team mask, whose color is the seat's tint.

/** The curve on `data` (RGBA, 8 bits, straight alpha), in place, in the sRGB values as they are; alpha untouched. Pixels
 *  at alpha 0 are toned too, so the color bled under an edge matches it. `lift`: how far the midtones go up (the lower, the
 *  more the lights keep apart), `top`: what white comes to; a group of pictures may lower both (the Expedition's white
 *  panels, whose seams the full curve washed out). */
export function tone(data, { lift = 1.75, top = 1 } = {}) {
  for (let p = 0; p < data.length; p += 4) {
    let v = [data[p], data[p + 1], data[p + 2]].map(x => { x /= 255; x = x * lift / (1 + (lift - 1) * x); return x + 0.10 * (x - 0.5) * (1 - Math.abs(2 * x - 1)) * 2; });
    const l = 0.3 * v[0] + 0.59 * v[1] + 0.11 * v[2], hi = Math.max(0, Math.min(1, (l - 0.2) / 0.5));
    v = v.map(x => l + (x - l) * 1.2);
    v[0] *= 1 + 0.035 * hi; v[2] *= 1 - 0.07 * hi * (l < 0.8 ? 1 : Math.max(0, 1 - (l - 0.8) * 4));
    for (let q = 0; q < 3; q++) data[p + q] = Math.max(0, Math.min(255, Math.round(v[q] * top * 255)));
  }
  return data;
}

/** A shadow's color and strength on the ground (the same still): crisp-edged, cool dark blue, to the lower right, about
 *  a third of the object's height long, from the object's silhouette. In the still the curve went over the shadow too;
 *  a shadow in a pack does not get it, so it shows darker at the same numbers: judge it against the still. */
export const SHADOW = { color: '#0c1a2a', alpha: 0.4, reach: 1 / 3 };
