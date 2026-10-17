// Building, resource and debris models. Buildings are centred on their footprint (1 tile = 32 units).
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, plate, limb, boxUV } from './models.js';

const oct = (r, k = 0.42) => { const c = r * k; return [[-r + c, -r], [r - c, -r], [r, -r + c], [r, r - c], [r - c, r], [-r + c, r], [-r, r - c], [-r, -r + c]]; };
let s = 11; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);

export function core(M) {
  const g = grp();
  add(g, plate(oct(62), 4, 1.2), M.concrete, 0, 0, 0);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    add(g, rbox(14, 24, 14, 2), M.dark, x * 46, 0 + 12, z * 46);
    add(g, rbox(10, 3, 10, 1), M.paint, x * 46, 25, z * 46);
    add(g, sph(1.8, 12, 8), M.lamp, x * 46, 27.6, z * 46);
    add(g, cyl(2, 2, 26, 10), M.steel, x * 30, 9, z * 30, z * 0.0, 0, 0).rotation.set(Math.PI / 2, 0, Math.atan2(z, x));
  }
  add(g, plate(oct(48), 16, 2), M.trim, 0, 3, 0);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; add(g, rbox(10, 0.8, 3, 0.3), M.paint, Math.cos(a) * 40, 19.2, Math.sin(a) * 40, 0, -a); } // deck stripes
  for (const [x, z] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) add(g, rbox(x ? 16 : 6, 2, z ? 16 : 6, 0.6), M.dark, x * 38, 19.6, z * 38); // cable trays
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2 + 0.26; add(g, rbox(6, 0.6, 6, 0.2), M.dark, Math.cos(a) * 41, 19.4, Math.sin(a) * 41, 0, -a); } // intake grilles
  add(g, new THREE.TorusGeometry(38, 1.2, 8, 48), M.steel, 0, 18.6, 0, Math.PI / 2);
  add(g, plate(oct(49, 0.42).map(([x, z]) => [x * 1.0, z * 1.0]), 2.4, 0.6), M.trim, 0, 15.5, 0);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + Math.PI / 8; add(g, rbox(8, 6, 2, 0.6), M.dark, Math.cos(a) * 44, 9, Math.sin(a) * 44, 0, -a + Math.PI / 2); }
  add(g, rbox(26, 12, 6, 1.5), M.dark, 0, 8, 47);                                    // south hangar door
  add(g, rbox(28, 1.4, 1.4, 0.5), M.hazard, 0, 15, 50.4);
  add(g, cyl(32, 34, 10, 40), M.trim, 0, 23, 0);
  for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; add(g, rbox(2.6, 6, 1.4, 0.5), M.glass, Math.cos(a) * 32.4, 23, Math.sin(a) * 32.4, 0, -a + Math.PI / 2); }
  for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2 + 0.2; add(g, rbox(2, 2.4, 1, 0.3), M.glass, Math.cos(a) * 33.2, 27, Math.sin(a) * 33.2, 0, -a + Math.PI / 2); }
  const dome = add(g, new THREE.SphereGeometry(26, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), M.trim, 0, 28, 0);
  dome.scale.set(1, 0.72, 1);
  add(g, cyl(22.5, 24.5, 4, 40), M.paint, 0, 36.5, 0);                    // team band on the dome
  for (const [x, z, h] of [[-8, 10, 14], [10, 6, 10], [4, -12, 12]]) { add(g, cyl(0.4, 0.4, h, 6), M.steel, x, 44 + h / 2, z); add(g, sph(0.8, 8, 6), M.lamp, x, 44 + h, z); }
  add(g, cyl(6, 7, 8, 20), M.steel, 0, 46, 0);
  add(g, sph(4.2, 16, 12), M.white, 0, 51, 0);
  add(g, cyl(0.6, 0.6, 18, 6), M.steel, -14, 44, -10); add(g, sph(1, 8, 6), M.lamp, -14, 53, -10);
  const dish = add(g, new THREE.SphereGeometry(7, 20, 10, 0, Math.PI * 2, 0, Math.PI / 3), M.trim, 18, 40, 8, Math.PI * 0.75, 0, 0.3);
  dish.material = M.trim;
  return g;
}

export function depot(M) {
  const g = grp();
  add(g, rbox(60, 3, 60, 1), M.concrete, 0, 1.5, 0);
  for (const [x, mat] of [[-14, M.paint], [14, M.trim]]) {
    add(g, rbox(26, 14, 52, 1.5), mat, x, 10, 0);
    for (const z of [-24, 24]) add(g, rbox(26.4, 2, 1.2, 0.4), M.hazard, x, 3.6, z);
    for (const z of [-20, -8, 4, 16]) add(g, rbox(26.4, 12, 0.8, 0.3), M.dark, x, 10, z);
  }
  add(g, rbox(24, 10, 26, 1.5), M.trim, -2, 22, -8);
  add(g, rbox(24.4, 2, 1.2, 0.4), M.hazard, -2, 26.5, 5.6);
  add(g, rbox(3, 26, 3, 0.8), M.steel, 24, 16, -22);                       // crane mast + arm
  add(g, rbox(26, 2.4, 2.4, 0.6), M.steel, 12, 29, -22);
  add(g, cyl(0.25, 0.25, 10, 6), M.dark, 2, 23, -22);
  add(g, sph(1.2, 8, 6), M.lamp, 24, 30, -22);
  return g;
}

export function extractor(M) {
  const g = grp();
  add(g, cyl(30, 31, 4, 40), M.concrete, 0, 2, 0);
  add(g, new THREE.TorusGeometry(22, 2.4, 10, 40), M.steel, 0, 6, 0, Math.PI / 2);
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + Math.PI / 4; add(g, rbox(8, 10, 8, 1.4), M.dark, Math.cos(a) * 22, 7, Math.sin(a) * 22); limb(g, [Math.cos(a) * 20, 11, Math.sin(a) * 20], [Math.cos(a) * 8, 22, Math.sin(a) * 8], 1.6, M.steel); }
  add(g, cyl(12, 13, 20, 28), M.paint, 0, 14, 0);
  add(g, cyl(12.3, 12.3, 4, 28), M.ether, 0, 13, 0);
  add(g, cyl(9, 11, 4, 24), M.trim, 0, 26, 0);
  add(g, cyl(3, 3, 6, 12), M.steel, 0, 31, 0); add(g, sph(2.2, 12, 8), M.ether, 0, 34.5, 0);
  add(g, rbox(10, 16, 10, 1.5), M.trim, 20, 8, -18); add(g, rbox(6, 3, 0.8, 0.3), M.glass, 20, 12, -12.6); add(g, sph(1.2, 8, 6), M.lamp, 20, 17, -18);
  return g;
}

export function barracks(M) {
  const g = grp();
  add(g, rbox(92, 3, 92, 1), M.concrete, 0, 1.5, 0);
  add(g, rbox(80, 18, 62, 2.5), M.trim, 0, 12, -6);
  for (const x of [-30, -10, 10, 30]) add(g, rbox(1.6, 16, 1.6, 0.4), M.steel, x, 12, 25.4); // downpipes
  const roof = new THREE.Shape([new THREE.Vector2(-33, 0), new THREE.Vector2(33, 0), new THREE.Vector2(20, 12), new THREE.Vector2(-20, 12)]);
  const rg = new THREE.ExtrudeGeometry(roof, { depth: 78, bevelEnabled: true, bevelSize: 1, bevelThickness: 1, bevelSegments: 2 });
  rg.translate(0, 0, -39); rg.rotateY(Math.PI / 2); rg.computeVertexNormals(); boxUV(rg);
  add(g, rg, M.trim, 0, 21, -6);
  add(g, rbox(82, 2, 4, 0.8), M.paint, 0, 33.5, -6);                       // team ridge stripe
  for (let x = -36; x <= 36; x += 8) add(g, rbox(2, 1.2, 60, 0.4), M.steel, x, 27, -6);
  for (const [x, z] of [[-22, -24], [22, 10]]) { add(g, rbox(10, 5, 8, 1), M.dark, x, 31, z); add(g, cyl(3, 3, 0.8, 16), M.gunmetal, x, 33.8, z); }
  for (const x of [-26, -13, 13, 26]) add(g, rbox(6, 3, 8, 1), M.dark, x, 31.5, -6);
  add(g, rbox(30, 17, 3.4, 1.2), M.paint, 0, 10.5, 25.2);                  // door frame (team)
  add(g, rbox(26, 14, 4, 1.5), M.dark, 0, 10, 25.5);                       // door
  for (let k = 0; k < 4; k++) add(g, rbox(24, 1.2, 0.6, 0.3), M.steel, 0, 5 + k * 3, 27.6);
  add(g, rbox(30, 1.6, 1.6, 0.5), M.hazard, 0, 18, 27);
  for (const x of [-18, 18]) { add(g, sph(1.4, 10, 8), M.white, x, 16, 25.8); add(g, rbox(3, 22, 3, 0.8), M.steel, x * 2.1, 13, 26); add(g, rbox(0.6, 9, 7, 0.2), M.paint, x * 2.1 + 1.8, 19, 29); }
  for (const side of [-1, 1]) { add(g, rbox(10, 10, 30, 2), M.trim, side * 42, 7, -4); for (const z of [-12, 0, 12]) add(g, rbox(1, 3, 6, 0.3), M.glass, side * 47.2, 8, z - 4); }
  add(g, cyl(0.5, 0.5, 16, 6), M.steel, -30, 40, -26); add(g, sph(1, 8, 6), M.lamp, -30, 48, -26);
  return g;
}

export function forge(M) {
  const g = grp();
  add(g, rbox(92, 3, 92, 1), M.concrete, 0, 1.5, 0);
  add(g, rbox(84, 22, 66, 2.5), M.trim, 0, 14, -6);
  add(g, rbox(84.6, 4, 66.6, 1), M.trim, 0, 24, -6);
  for (const z of [-30, 18]) add(g, rbox(84.8, 1.4, 2, 0.4), M.dark, 0, 26, z);
  for (let x = -40; x <= 40; x += 8) add(g, cyl(0.3, 0.3, 4, 6), M.steel, x, 28, 26.5);
  add(g, rbox(82, 0.6, 0.6, 0.2), M.steel, 0, 30, 26.5);                   // catwalk railing
  add(g, new THREE.TorusGeometry(22, 1.6, 8, 24, Math.PI), M.steel, 0, 50, -22, 0, 0, 0); // pipe arch between chimneys
  for (const x of [-22, 22]) {
    add(g, cyl(8, 9.5, 34, 24), M.dark, x, 40, -22);
    add(g, cyl(8.6, 8.6, 3, 24), M.paint, x, 50, -22);
    add(g, cyl(6, 6, 1, 20), M.skinDark, x, 57.2, -22);
  }
  add(g, rbox(34, 16, 6, 2), M.dark, 0, 11, 28);                           // furnace mouth
  add(g, rbox(28, 10, 2, 1), M.fire, 0, 10, 30.2);
  add(g, rbox(22, 0.6, 6, 0.3), M.slag, 0, 3.1, 34);                       // slag pool at the mouth
  add(g, rbox(36, 1.6, 1.6, 0.5), M.hazard, 0, 20.5, 29.4);
  add(g, rbox(26, 10, 26, 2), M.trim, 0, 31, -2);
  add(g, rbox(26.4, 2.4, 26.4, 0.6), M.paint, 0, 34.6, -2);
  for (const z of [-10, -3, 4]) add(g, rbox(24, 1, 2.4, 0.4), M.dark, 0, 36.4, z);
  for (const side of [-1, 1]) { add(g, rbox(3, 30, 3, 0.8), M.steel, side * 40, 17, 26); }
  add(g, rbox(86, 3, 3, 0.8), M.steel, 0, 33, 26);
  add(g, rbox(6, 4, 6, 1), M.gunmetal, 14, 30, 26); add(g, cyl(0.3, 0.3, 10, 6), M.dark, 14, 24, 26);
  for (const side of [-1, 1]) add(g, sph(1.4, 10, 8), M.lamp, side * 40, 33.5, 26);
  return g;
}

export function turretBase(M) {
  const g = grp();
  add(g, rbox(60, 3, 60, 1.2), M.concrete, 0, 1.5, 0);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(g, rbox(10, 1, 10, 0.4), M.hazard, x * 22, 3.2, z * 22);
  add(g, cyl(22, 25, 8, 36), M.trim, 0, 7, 0);
  add(g, cyl(22.3, 22.3, 2, 36), M.paint, 0, 10, 0);
  add(g, cyl(17, 18, 3, 36), M.trim, 0, 12, 0);
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; add(g, rbox(5, 5, 2, 0.6), M.dark, Math.cos(a) * 23.5, 7, Math.sin(a) * 23.5, 0, -a + Math.PI / 2); }
  return g;
}
/** Turret head facing +x; sits on the base at y = 13. */
export function turretHead(M) {
  const g = grp();
  add(g, cyl(10, 11, 4, 28), M.gunmetal, 0, 15, 0);
  add(g, sph(9, 24, 16), M.paint, 0, 19, 0).scale.set(1, 0.75, 1);
  for (const side of [-1, 1]) { add(g, rbox(18, 3, 3, 1), M.gunmetal, 12, 20, side * 4.2); add(g, rbox(3, 3.6, 3.6, 0.8), M.dark, 21, 20, side * 4.2); }
  add(g, rbox(6, 4, 7, 1.2), M.trim, -6, 24, 0); add(g, rbox(1, 2, 4, 0.3), M.glass, -2.6, 24.6, 0);
  add(g, sph(0.9, 8, 6), M.lamp, -8, 27, 2);
  return g;
}

export function foundation(n) {
  const g = grp(), W = n * 32 - 6;
  const M = { concrete: new THREE.MeshStandardMaterial({ color: 0x4e504f, roughness: 0.95 }), mark: new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.7 }) };
  add(g, rbox(W, 2, W, 0.8), M.concrete, 0, 1, 0);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { add(g, rbox(W * 0.22, 0.6, 2, 0.2), M.mark, x * W * 0.36, 2.2, z * (W / 2 - 3)); add(g, rbox(2, 0.6, W * 0.22, 0.2), M.mark, x * (W / 2 - 3), 2.2, z * W * 0.36); }
  return g;
}
export function scaffold(n, M) {
  const g = grp(), W = n * 32 - 8, H = 10 + n * 6;
  for (let x = -W / 2; x <= W / 2 + 0.1; x += W / Math.max(2, n)) for (const z of [-W / 2, W / 2]) { add(g, rbox(2.2, H, 2.2, 0.4), M.steel, x, H / 2, z); add(g, rbox(2.2, H, 2.2, 0.4), M.steel, z, H / 2, x); }
  for (const y of [H * 0.35, H * 0.7, H]) for (const z of [-W / 2, W / 2]) { add(g, rbox(W, 1.6, 1.6, 0.4), M.hazard, 0, y, z); add(g, rbox(1.6, 1.6, W, 0.4), M.hazard, z, y, 0); }
  for (const z of [-W / 2, W / 2]) { limb(g, [-W / 2, 1, z], [W / 2, H * 0.7, z], 0.7, M.steel); limb(g, [z, 1, -W / 2], [z, H * 0.7, W / 2], 0.7, M.steel); }
  return g;
}
export function rubble(n, M) {
  const g = grp(), W = n * 32 - 8; s = 11 + n;
  for (let k = 0; k < n * n * 9; k++) {
    const x = (rnd() - 0.5) * W, z = (rnd() - 0.5) * W, sz = 2 + rnd() * (3 + n * 1.5);
    const m = add(g, rbox(sz, sz * (0.4 + rnd() * 0.6), sz * (0.5 + rnd()), 0.4), [M.dark, M.gunmetal, M.skinDark, M.concrete][k % 4], x, sz * 0.3, z, rnd(), rnd() * 3, rnd());
    m.scale.y = 0.7;
  }
  return g;
}

// ---------------- resources ----------------
export function shardField(stage, mats) {
  const g = grp(); s = 31;
  add(g, cyl(13, 15, 2, 14), mats.rock, 0, 1, 0).scale.set(1, 1, 0.8);
  const crystals = [[-6, 2, 3.4, 15, -0.25, 0.2], [5, 3, 3, 13, 0.3, -0.3], [0, -2, 3.8, 19, 0.05, 0.1], [-2, 6, 2.6, 10, -0.4, 0.4], [7, -4, 2.2, 10, 0.5, -0.2], [-8, -4, 2, 8, -0.5, -0.4]];
  crystals.slice(0, 6 - stage * 1.5 | 0).forEach(([x, z, r, h, lx, lz]) => {
    const k = 1 - stage * 0.15, c = grp();
    add(c, new THREE.CylinderGeometry(r * k, r * k * 1.1, h * k * 0.75, 5), mats.crystal, 0, h * k * 0.375, 0);
    add(c, new THREE.ConeGeometry(r * k, h * k * 0.4, 5), mats.crystalTip, 0, h * k * 0.75 + h * k * 0.2, 0);
    c.position.set(x, 1, z); c.rotation.set(lz, rnd() * 3, -lx); g.add(c);
  });
  for (let k = 0; k < 6; k++) add(g, new THREE.DodecahedronGeometry(1.5 + rnd() * 1.5), mats.rock, (rnd() - 0.5) * 24, 1, (rnd() - 0.5) * 18);
  for (let k = 0; k < 7 - stage * 2; k++) add(g, new THREE.ConeGeometry(0.9, 3 + rnd() * 2, 5), mats.crystalTip, (rnd() - 0.5) * 22, 1.5, (rnd() - 0.5) * 16, (rnd() - 0.5), 0, (rnd() - 0.5));
  return g;
}
export function vent(f, mats) {
  const g = grp(); s = 51;
  for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; const r = 23 + rnd() * 3; add(g, new THREE.DodecahedronGeometry(4 + rnd() * 3), mats.rock, Math.cos(a) * r, 2, Math.sin(a) * r, rnd(), rnd(), rnd()).scale.y = 0.7; }
  add(g, cyl(20, 22, 2, 32), mats.pit, 0, 0.5, 0);
  add(g, new THREE.ConeGeometry(18, 8, 32, 1, true), mats.pit, 0, -2, 0, Math.PI, 0, 0);
  // three spiral arms (arcs of growing radius), turned a little more each frame
  for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) {
    const arm = grp(); arm.rotation.y = k / 3 * Math.PI * 2 + f / 4 * Math.PI * 2 / 3 + j * 0.9;
    add(arm, new THREE.TorusGeometry(6 + j * 4.5, 2.2 - j * 0.4, 8, 16, 1.1), mats.glow, 0, 1.4, 0, Math.PI / 2);
    g.add(arm);
  }
  add(g, cyl(5 + (f % 2), 6, 1.5, 20), mats.glow, 0, 2, 0);
  return g;
}
