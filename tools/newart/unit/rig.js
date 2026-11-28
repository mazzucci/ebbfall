// (From the article folder's units3d/rig.js, unchanged: code, no pictures.)
// Shared by every unit: textures cut from a design sheet, small builders, two-bone IK, and `man()`, the foot soldier's
// rig (the Guard, the Sellsword, the Knight's rider). Units: a man is 100 tall, faces +x, y up, +z his right.
import * as THREE from 'three';

/** A crop of the sheet as a texture. `flat` (0..1) divides out the crop's own soft shading (a blurred copy), so the
 *  3D light does the shading and only the surface detail stays; `gray` keeps luminance only, normalized to a mean of
 *  `gray` (a team cloth, tinted later); `gain` its local contrast. Crops are in the sheet's pixels (2752x1536). */
export function crop(img, [sx, sy, sw, sh], { size = [256, 256], flat = 0.8, gray = 0, gain = 1, wrap = THREE.MirroredRepeatWrapping, repeat = [1, 1] } = {}) {
  const [w, h] = size, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  const b = document.createElement('canvas'); b.width = w; b.height = h;
  const bg = b.getContext('2d', { willReadFrequently: true }); bg.filter = `blur(${Math.round(w / 6)}px)`; bg.drawImage(c, 0, 0);
  const d = g.getImageData(0, 0, w, h), p = d.data, q = bg.getImageData(0, 0, w, h).data, mean = [0, 0, 0];
  for (let i = 0; i < p.length; i += 4) for (let k = 0; k < 3; k++) mean[k] += p[i + k];
  for (let k = 0; k < 3; k++) mean[k] /= p.length / 4;
  const ml = 0.3 * mean[0] + 0.59 * mean[1] + 0.11 * mean[2];
  for (let i = 0; i < p.length; i += 4) {
    const l = 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2], lb = 0.3 * q[i] + 0.59 * q[i + 1] + 0.11 * q[i + 2];
    const k = Math.pow(ml / Math.max(8, lb), flat);
    for (let c2 = 0; c2 < 3; c2++) {
      const m = gray ? gray * 255 : mean[c2], v = gray ? l * k / ml * gray * 255 : p[i + c2] * k;
      p[i + c2] = Math.max(0, Math.min(255, (v - m) * gain + m));
    }
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = wrap; t.repeat.set(...repeat); t.anisotropy = 8;
  return t;
}
/** The same texture at another repeat. */
export const again = (t, rx, ry) => { if (!t) return null; const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; return c; };
export function steelTex() { // procedural: hammered steel, soft blotches
  const n = 128, c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d');
  g.fillStyle = '#b4b8bc'; g.fillRect(0, 0, n, n); let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) { const v = 150 + r() * 80; g.fillStyle = `rgba(${v},${v + 2},${v + 5},0.25)`; g.beginPath(); g.ellipse(r() * n, r() * n, 3 + r() * 9, 2 + r() * 6, r() * 3, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
export const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });
/** A team surface: rendered white (NEUTRAL), tinted by the client through the mask. */
export const team = (o = {}) => { const m = std({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide, ...o }); m.userData.team = 1; return m; };

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const mesh = (p, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); p.add(m); return m; };
export const grp = (p, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); return g; };
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const ball = (r, a = 14, b = 10) => new THREE.SphereGeometry(r, a, b);
export const cyl = (rt, rb, h, seg = 14, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
export const lathe = (pts, seg = 28, a0 = 0, len = Math.PI * 2) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, a0, len);
/** A tapered capsule from a to b (radius r1 at a, r2 at b). */
export function bone(p, a, b, r1, r2, mat) {
  const len = a.distanceTo(b), g = grp(p); g.position.copy(a).add(b).multiplyScalar(0.5);
  g.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
  mesh(g, cyl(r2, r1, len, 14, true), mat); mesh(g, ball(r1), mat, 0, -len / 2, 0); mesh(g, ball(r2), mat, 0, len / 2, 0);
  return g;
}
/** Two-bone IK: the middle joint between `a` and `b` for bone lengths l1, l2, bent towards `pole`. */
export function joint(a, b, l1, l2, pole) {
  const ab = b.clone().sub(a), d = Math.min(ab.length(), (l1 + l2) * 0.999), dir = ab.clone().normalize();
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const perp = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  return a.clone().add(dir.multiplyScalar(x)).add(perp.multiplyScalar(h));
}
/** The strike seen from behind (facings 11 to 13, walking away): a thrust straight ahead runs into depth behind the
 *  body, so the weapon swings out to the side to stay visible at this camera angle.
 *  Positive is to the unit's left. `turn(v, yaw)` turns a direction by it. */
export const awayYaw = (k) => (k === 11 ? 0.55 : k === 12 ? -0.8 : k === 13 ? -0.55 : 0);
export const turn = (v, a) => V(v.x * Math.cos(a) + v.z * Math.sin(a), v.y, -v.x * Math.sin(a) + v.z * Math.cos(a));

/** A man's base pose: feet (ankles) and hips in his own space; hands in the torso's (it twists, leans, sways). */
export const stand = () => ({ hips: V(0, 46, 0), twist: 0, lean: 0, sway: 0, nod: 0, footL: V(0, 4.5, -7), footR: V(0, 4.5, 7), pitchL: 0, pitchR: 0, handL: V(4, 50, -18), handR: V(4, 50, 18) });
/** The march, phase p: 0 left foot forward (contact), 0.25 passing, 0.5 right foot forward, 0.75 passing. Returns cos, sin. */
export function march(P, p, stride = 15) {
  const c = Math.cos(p * Math.PI * 2), s = Math.sin(p * Math.PI * 2);
  P.footL.x = stride * c; P.footR.x = -stride * c; P.footL.y += 9 * Math.max(0, -s); P.footR.y += 9 * Math.max(0, s);
  P.pitchL = 0.35 * Math.max(0, -s) - 0.2 * Math.max(0, c); P.pitchR = 0.35 * Math.max(0, s) - 0.2 * Math.max(0, -c);
  P.hips.y -= 4 * Math.abs(c); P.hips.x = 1; P.twist = 0.16 * c; P.lean = -0.08; P.sway = 0.05 * s;
  return [c, s];
}
/**
 * The man in pose P. Materials M: trouser, boot, cuff, coat, sleeve, fore (forearm; sleeve if absent), hand, skin, hair.
 * o: `profile` the coat's lathe ([radius, height] from hem to collar), `depth` its front-to-back squash, `boot` where
 * the boot starts down the shin (0 the knee .. 1), `head` and `hands` scales, `astride` (knees out: a rider),
 * `dress(body)` and `hat(head)` add the unit's own parts. Returns the root; root.userData: body, hands, feet.
 * Scale it by `girth` AFTER attaching what he holds (held()).
 */
export function man(M, P, o) {
  const root = new THREE.Group(), { depth = 0.74, boot = 0.42, head: HEAD = 1, hands: HAND = 1 } = o;
  for (const [side, foot, pitch] of [[-1, P.footL, P.pitchL], [1, P.footR, P.pitchR]]) {
    const hip = P.hips.clone().add(V(0, 0, side * 6.5)), knee = joint(hip, foot, 21, 21, o.astride ? V(1, 0.3, side * 1.4) : V(1, 0, 0));
    bone(root, hip, knee, 6.6, 5.4, M.trouser);
    const mid = knee.clone().lerp(foot, boot);
    if (boot > 0.05) bone(root, knee, mid, 5.4, 5.0, M.trouser);
    bone(root, mid, foot, 5.7, 4.9, M.boot);
    const cuff = grp(root); cuff.position.copy(mid); cuff.quaternion.setFromUnitVectors(V(0, 1, 0), knee.clone().sub(foot).normalize());
    mesh(cuff, cyl(6.5, 6.1, 3.6), M.cuff);
    const f = grp(root); f.position.copy(foot); f.rotation.z = -pitch;
    mesh(f, ball(5), M.boot, 4.2, -1.3, 0).scale.set(1.75, 0.68, 0.98);
  }
  const torso = grp(root, P.hips.x, P.hips.y, 0); torso.rotation.set(P.sway, P.twist, P.lean, 'YXZ');
  const body = grp(torso, 0, -46, 0);                                   // parts in standing heights (0 the ground)
  mesh(body, lathe(o.profile), M.coat).scale.x = depth;
  o.dress?.(body);
  const head = grp(body, 0.8, 89.0, 0); head.rotation.z = -P.nod; head.scale.setScalar(HEAD);
  mesh(head, ball(5.3, 18, 14), M.skin).scale.set(0.95, 1.08, 0.9);
  mesh(head, ball(5.4, 16, 12), M.hair, -1.3, 0.6, 0).scale.set(0.9, 1.0, 0.92);
  mesh(head, ball(1.2, 8, 6), M.skin, 5.2, -0.6, 0);
  mesh(head, ball(3.6, 12, 8), M.hair, 1.2, -5.0, 0).scale.set(0.85, 0.4, 0.8);
  o.hat?.(head);
  const hands = {};
  for (const [side, hand] of [[-1, P.handL], [1, P.handR]]) {
    const sh = V(0, 77, side * 15), el = joint(sh, hand, 17.5, 16.5, V(-0.4, -1, side * 0.9));
    bone(body, sh, el, 6.2, 5.4, M.sleeve); bone(body, el, hand, 5.4, 4.6, M.fore || M.sleeve);
    mesh(body, ball(3.7 * HAND, 12, 10), M.hand, hand.x, hand.y, hand.z);
    hands[side] = hand.clone();
  }
  root.userData = { body, hands, feet: [P.footL.clone(), P.footR.clone()] };
  return root;
}
/** A group on `root` at a point of `part` (the hand, in the body's space), its +y along `dir` (root space): what he
 *  holds keeps the pose's direction whatever the torso does. */
export function held(root, part, at, dir) {
  root.updateMatrixWorld(true);
  const g = grp(root); g.position.copy(root.worldToLocal(part.localToWorld(at.clone()))); g.quaternion.setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
  return g;
}
