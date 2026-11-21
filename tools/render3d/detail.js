// The desktop detail test (branch detail-exp, never merged): a richer variant of two models, the Knight (kingdom.js
// `knight`) and the Data center (expedition-buildings.js `serverHall`), switched on by the renderer page's `?detail=1`.
// Off (the default) nothing here runs: no material is made, no mesh added, and both models are today's byte for byte.
// The rules of the variant: new elements (geometry, emissive maps), the same outline, footprint and proportions, team
// color only where it is today (the Knight's caparison, plume, surcoat, shield and pennon; the Data center's flags and
// trim), nothing too dark. New materials live under `M.dt`; the models' own materials are read, never changed.
import * as THREE from 'three';
import { grp, add, rbox, cyl, sph, plate, limb } from './models.js';
import { torus } from './harbour.js';
import { cone } from './vael.js';

export const DETAIL = typeof location !== 'undefined' && new URLSearchParams(location.search).get('detail') === '1';
const std = (o) => new THREE.MeshStandardMaterial(o);
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
/** A flat quad `w` by `h` facing +z, its texture once across it (the box-projected UVs of models.js tile instead). */
const quads = new Map();
const quad = (w, h) => { const k = `${w},${h}`; if (!quads.has(k)) quads.set(k, new THREE.PlaneGeometry(w, h)); return quads.get(k); };

// ------------------------------------------------ the Knight ------------------------------------------------
/** The Knight's own detail materials: polished plate for the new armor (paler than the helm's blackened iron, so the
 *  plates part from the mail), a dark rivet iron. */
function knightMats(M) {
  if (M.dt) return M.dt;
  const plateSteel = std({ color: 0xb4bac2, metalness: 0.75, roughness: 0.3 });
  if (M.steel.map) Object.assign(plateSteel, { map: M.steel.map, bumpMap: M.steel.bumpMap, bumpScale: 0.4, envMapIntensity: 2.2 });
  return M.dt = { plate: plateSteel, rivet: std({ color: 0x3a3c42, metalness: 0.6, roughness: 0.45 }), fold: std({ color: 0xc2b9a2, map: M.clothPale.map, bumpMap: M.clothPale.bumpMap, bumpScale: 1.0, roughness: 0.9 }) };
}
/** The Knight's detail, over the model as built (`h` the horse, `r` the rider, `sh` the shield, `ln` the lance's
 *  frame and `lb` its shaft, `pose` 0 the gallop, 1 the wind-up, 2 the strike; `hand` the lance hand in `r`):
 *  the caparison: a row of team lozenges along each flank between cloth folds, a team chevron on the chest and one
 *    lozenge on the rump's cloth, studs on the hem;
 *  the horse: eye holes in the hood, a rondel and a spike on the chamfron, a crupper and breeching straps with studs,
 *    studs on the breast strap and a steel pendant, bit rings, a bedroll behind the saddle, saddle studs;
 *  the rider: a brow band with rivets, breaths and a comb on the helm, a fuller plume (three more feathers in a steel
 *    holder), plate on the mail (pauldron lames, couters, gauntlets, poleyns, greaves, spurs), a team cross on the
 *    surcoat's chest and back, a belt and buckle, a sword in its scabbard under the shield;
 *  the shield: a team cross on its face, a boss plate, eight rim rivets;
 *  the lance: a steel rim on the vamplate, a ring under the socket, a grip binding. */
export function knightDetail(M, { h, r, sh, ln, lb, pose, hand }) {
  const D = knightMats(M);
  // -- the caparison (the box is x -9.7 to 7.7, y 3.6 to 13.2, z +-4.1 in the horse's frame) --
  for (const s of [-1, 1]) {
    for (const x of [-7.7, -4.9, -2.1, 3.1, 5.9]) add(h, rbox(1.75, 1.75, 0.3, 0.1), M.cloth, x, 8.2, s * 4.12, 0, 0, Math.PI / 4);       // team lozenges along the flank
    for (const x of [-6.3, -3.5, 4.5]) add(h, rbox(0.7, 7.0, 0.6, 0.3), D.fold, x, 9.2, s * 4.0);                                        // folds between them: shallow ridges of the same cloth
    for (const x of [-8.4, -5.6, -2.8, 0, 2.8, 5.6]) add(h, sph(0.3, 6, 5), D.plate, x, 4.4, s * 4.28);                                    // studs along the team hem
  }
  for (const s of [-1, 1]) add(h, rbox(0.3, 4.6, 1.3, 0.1), M.cloth, 7.72, 8.6, s * 1.45, s * 0.5, 0, 0);                                   // a team chevron on the chest's cloth
  add(h, rbox(0.3, 2.2, 2.2, 0.1), M.cloth, -9.72, 8.4, 0, Math.PI / 4, 0, 0);                                                              // one lozenge on the rump's cloth
  // -- the horse's head and tack --
  for (const z of [-1.72, 1.72]) add(h, sph(0.42, 8, 6), M.inkLine, 12.3, 18.5, z).scale.set(1.2, 0.8, 0.35);                              // eye holes in the hood
  add(h, cyl(0.7, 0.7, 0.3, 10), D.plate, 12.75, 19.25, 0, 0, 0, -0.35); add(h, cone(0.32, 1.3, 6), D.plate, 12.95, 19.9, 0, 0, 0, -0.35);  // the chamfron's rondel and its spike
  for (const z of [-0.6, 0.6]) add(h, sph(0.22, 6, 5), D.rivet, 14.6, 18.75, z);                                                           // two rivets down the chamfron
  for (const z of [-1.35, 1.35]) add(h, torus(0.5, 0.16, 10), D.plate, 15.0, 16.5, z);                                                     // bit rings
  limb(h, [-3.4, 14.3, 0], [-9.3, 13.3, 0], 0.32, M.leather);                                                                               // the crupper, saddle to tail
  for (const s of [-1, 1]) { limb(h, [-6.4, 13.6, s * 0.4], [-8.6, 12.9, s * 4.0], 0.3, M.leather); add(h, sph(0.36, 6, 5), D.plate, -8.6, 13.0, s * 4.0); } // breeching straps over the rump, a stud at each end
  for (const s of [-1, 1]) for (const t of [0.25, 0.55, 0.85]) add(h, sph(0.3, 6, 5), D.plate, 3.5 + 4.2 * t, 13.4 - 2.6 * t + 0.3, s * 3.9 * (1 - t) + s * 0.25); // studs on the breast strap
  add(h, cyl(0.85, 0.85, 0.3, 12), D.plate, 7.95, 10.5, 0, 0, 0, Math.PI / 2);                                                             // a steel pendant where the straps meet
  add(h, cyl(1.05, 1.05, 6.2, 10), M.leather, -4.6, 14.7, 0, Math.PI / 2, 0, 0);                                                           // a bedroll behind the cantle
  for (const z of [-1.9, 1.9]) add(h, torus(1.08, 0.16, 10), D.plate, -4.6, 14.7, z);                                                      // its two straps
  for (const s of [-1, 1]) for (const x of [-2.2, 0.5, 3.2]) add(h, sph(0.28, 6, 5), D.plate, x, 14.2, s * 3.95);                          // saddle studs
  // -- the rider --
  add(r, torus(2.86, 0.26, 16), D.plate, 0.2, 10.9, 0, Math.PI / 2, 0, 0);                                                                  // the helm's brow band
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 + 0.3; add(r, sph(0.26, 6, 5), D.rivet, 0.2 + Math.cos(a) * 2.95, 10.9, Math.sin(a) * 2.95); } // its rivets
  for (const [y, z] of [[8.9, 1.3], [8.9, 1.9], [9.25, 1.6], [8.9, -1.3], [8.9, -1.9], [9.25, -1.6]]) add(r, sph(0.2, 6, 5), M.inkLine, 0.2 + Math.sqrt(2.82 * 2.82 - z * z), y - 0.25, z); // breaths, three a side under the slit
  add(r, cyl(1.95, 1.95, 0.42, 16), D.plate, 0.2, 11.85, 0, Math.PI / 2, 0, 0);                                                            // the comb: a steel ridge over the crown, front to back
  add(r, cyl(0.55, 0.7, 1.2, 8), D.plate, -1.3, 12.6, 0, 0, 0, 0.9);                                                                        // the plume's holder
  add(r, cone(1.0, 5.2, 8), M.cloth, -2.5, 12.2, -0.95, 0.28, 0, 1.3); add(r, cone(1.0, 5.2, 8), M.cloth, -2.5, 12.2, 0.95, -0.28, 0, 1.3); // two side feathers
  add(r, cone(1.1, 4.8, 8), M.cloth, -2.9, 11.5, 0, 0, 0, 1.55);                                                                            // and one drooping under them: a fuller plume
  for (const z of [-2.4, 2.4]) { add(r, rbox(5.4, 0.55, 1.9, 0.2), D.plate, 0, 6.3, z); add(r, rbox(4.6, 0.5, 1.7, 0.2), D.plate, 0, 5.6, z * 1.12); } // pauldron lames under the team pads
  for (const s of [-1, 1]) {
    const a = [0.5, 2, s * 3.2], b = [1.8, -3.6, s * 4.6], at = (t) => a.map((v, i) => v + (b[i] - v) * t);
    add(r, sph(1.3, 10, 8), D.plate, ...at(0.42)).scale.set(1, 1, 0.9);                                                                    // the poleyn at the knee
    limb(r, at(0.6), at(0.95), 1.28, D.plate);                                                                                            // the greave down the shin
    add(r, cone(0.3, 1.4, 6), D.plate, 1.3, -4.0, s * 4.7, 0, 0, Math.PI / 2);                                                              // a spur at the heel
  }
  const [LX, LY, LZ] = hand;
  add(r, sph(1.12, 10, 8), D.plate, LX + 0.2, LY, LZ + 0.1); add(r, sph(1.05, 10, 8), D.plate, 1.25, 4.35, -4.05);                          // gauntlets: the lance hand, the shield hand
  add(r, sph(0.95, 8, 6), D.plate, 0.5, 5.3, -3.45);                                                                                        // the shield arm's couter
  if (pose === 1) add(r, sph(1.2, 8, 6), D.plate, -3.0, 4.8, 5.0); else add(r, sph(1.0, 8, 6), D.plate, LX * 0.5, 6 + (LY - 6) * 0.5, 3 + (LZ - 3) * 0.5); // the lance arm's, at the elbow
  add(r, rbox(0.3, 4.4, 1.15, 0.1), M.cloth, 2.52, 4.3, 0); add(r, rbox(0.3, 1.15, 3.6, 0.1), M.cloth, 2.52, 5.2, 0);                       // a team cross on the surcoat's chest
  add(r, rbox(0.3, 4.4, 1.15, 0.1), M.cloth, -2.52, 4.3, 0); add(r, rbox(0.3, 1.15, 3.6, 0.1), M.cloth, -2.52, 5.2, 0);                     // and on its back
  add(r, rbox(5.3, 0.8, 6.5, 0.25), M.leather, 0, 2.0, 0); add(r, rbox(0.5, 1.2, 1.3, 0.15), D.plate, 2.7, 2.0, 0);                         // the belt and its buckle
  limb(r, [-0.2, 1.9, -3.5], [-6.6, -1.1, -4.5], 0.5, M.leather);                                                                           // the sword's scabbard, back along the left flank under the shield
  add(r, sph(0.6, 8, 6), D.plate, -6.9, -1.25, -4.52);                                                                                      // its chape
  limb(r, [-0.2, 1.9, -3.5], [1.5, 2.7, -3.3], 0.36, M.leather); add(r, rbox(0.5, 0.5, 2.4, 0.15), D.plate, 0.1, 2.05, -3.45, 0, 0, 0.44); add(r, sph(0.55, 8, 6), D.plate, 1.8, 2.85, -3.28); // the hilt: grip, cross guard, pommel
  // -- the shield (its face is local +y) --
  add(sh, rbox(5.6, 0.22, 1.2, 0.08), M.cloth, 0, 0.56, 0); add(sh, rbox(1.2, 0.22, 5.6, 0.08), M.cloth, 0, 0.56, 0);                       // a team cross on the cream face
  add(sh, cyl(1.45, 1.45, 0.3, 14), D.plate, 0, 0.66, 0);                                                                                   // the boss's plate
  for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2; add(sh, sph(0.3, 6, 5), D.plate, Math.cos(a) * 3.3, 0.86, Math.sin(a) * 3.3); } // rim rivets
  // -- the lance --
  add(ln, torus(1.92, 0.24, 12), D.plate, -3.6, 0, 0, 0, Math.PI / 2, 0);                                                                   // a steel rim on the vamplate
  add(lb, torus(1.5, 0.22, 10), D.plate, 17.5, 0, 0, 0, Math.PI / 2, 0);                                                                    // a ring under the socket
  for (const x of [1.0, 1.7, 2.4]) add(lb, torus(1.42, 0.16, 10), M.leather, x, 0, 0, 0, Math.PI / 2, 0);                                   // the grip's binding
}

// ---------------------------------------------- the Data center ----------------------------------------------
/** The Data center's detail materials: pale composite and steel for the roof's machines, a louver gray, a charcoal
 *  panel a step over the roof's ink, white-and-charcoal warning stripes (never yellow: gold is the coins'), lit rack
 *  windows (an emissive map: cabinets seen through glass, rows of cyan and white lights) and small lights. */
function hallMats(M) {
  if (M.dt) return M.dt;
  const stripes = canvasTex(64, 64, (g, n) => { g.fillStyle = '#d8dce0'; g.fillRect(0, 0, n, n); g.fillStyle = '#2a2e34'; for (let k = -n; k < n * 2; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 8, 0); g.lineTo(k + 8 - n, n); g.lineTo(k - n, n); g.closePath(); g.fill(); } });
  stripes.wrapS = stripes.wrapT = THREE.RepeatWrapping; stripes.repeat.set(2, 2);
  // a window's glow: three cabinets side by side behind glass, each a column of drive rows with lights (seeded, so the same every run)
  let seed = 4099; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const win = canvasTex(96, 128, (g, w, hh) => {
    g.fillStyle = '#06222c'; g.fillRect(0, 0, w, hh);
    for (let c = 0; c < 3; c++) {
      const x0 = 4 + c * 31;
      g.fillStyle = '#0c3a48'; g.fillRect(x0, 6, 27, hh - 12);
      for (let y = 10; y < hh - 12; y += 9) {
        g.fillStyle = '#0a2a34'; g.fillRect(x0 + 2, y, 23, 6);
        for (let k = 0; k < 4; k++) { const v = rnd(); g.fillStyle = v < 0.55 ? '#38e4ff' : v < 0.8 ? '#e8fbff' : '#0e4a5a'; g.fillRect(x0 + 4 + k * 5, y + 2, 3, 3); }
      }
      g.fillStyle = '#48e8ff'; g.fillRect(x0, 4, 27, 2);
    }
  });
  return M.dt = {
    unit: std({ color: 0x858a8c, metalness: 0.1, roughness: 0.75 }),                                                  // the rooftop units' shells: pale composite, matte (the turbine blades' tone)
    steel: std({ color: 0xb4b8ba, metalness: 0.5, roughness: 0.4 }),                                                  // pipes, rails, ladders, masts
    louver: std({ color: 0x8a9096, metalness: 0.4, roughness: 0.5 }),                                                 // vent slats
    dark: std({ color: 0x2c3036, metalness: 0.3, roughness: 0.6 }),                                                   // a vent's throat, a fan's well
    roofPanel: std({ color: 0x30343a, metalness: 0.3, roughness: 0.7 }),                                              // the roof's panels, a step over its ink
    cable: std({ color: 0x33363c, roughness: 0.7 }),
    stripes: std({ color: 0xffffff, map: stripes, roughness: 0.8 }),
    win: std({ color: 0x0a1418, emissive: 0xffffff, emissiveMap: win, emissiveIntensity: 0.85, metalness: 0.2, roughness: 0.3 }),
    ledWhite: std({ color: 0x000000, emissive: 0xd8f4ff, emissiveIntensity: 1.2 }),
  };
}
/** A louvered vent at (x, y, z) on a face whose normal is the group's +z after `ry`: a pale frame `w` by `hh`, a dark
 *  throat, `n` slats tilted down and out. */
function vent(g, D, M, x, y, z, ry, w, hh, n = 4) {
  const v = grp(); v.position.set(x, y, z); v.rotation.y = ry; g.add(v);
  add(v, rbox(w, hh, 0.6, 0.15), D.dark, 0, 0, 0.3);
  add(v, rbox(w + 0.9, 0.6, 1.0, 0.15), D.steel, 0, hh / 2 + 0.1, 0.5); add(v, rbox(w + 0.9, 0.6, 1.0, 0.15), D.steel, 0, -hh / 2 - 0.1, 0.5);
  for (const s of [-1, 1]) add(v, rbox(0.6, hh + 0.8, 1.0, 0.15), D.steel, s * (w / 2 + 0.15), 0, 0.5);
  for (let k = 0; k < n; k++) add(v, rbox(w - 0.3, 0.3, 1.1, 0.1), D.louver, 0, -hh / 2 + (k + 0.5) * hh / n, 0.75, 0.6, 0, 0);
  return v;
}
/** A rooftop cooling unit at (x, y, z): a pale box `w` by `d` and `hh` tall on dark feet, a round fan well in its lid
 *  with a hub, five blades and a guard of two bars and a ring; a louver on its south side, warning stripes round its foot. */
function coolingUnit(g, D, M, x, y, z, w, d, hh, turn = 0) {
  const u = grp(); u.position.set(x, y, z); g.add(u);
  add(u, rbox(w + 1.2, 0.5, d + 1.2, 0.1), D.stripes, 0, 0.25, 0);                                                    // the warning stripes round its foot
  add(u, rbox(w, hh, d, 0.5), D.unit, 0, hh / 2 + 0.4, 0);
  add(u, rbox(w + 0.3, 0.4, d + 0.3, 0.1), D.steel, 0, hh + 0.5, 0);                                                  // the lid's rim
  const R = Math.min(w, d) * 0.4, top = hh + 0.75;
  add(u, cyl(R + 0.7, R + 0.7, 0.7, 24), D.steel, 0, top, 0); add(u, cyl(R, R, 0.74, 24), D.dark, 0, top + 0.02, 0);   // the fan's collar and well
  const f = grp(); f.position.set(0, top + 0.45, 0); f.rotation.y = turn; u.add(f);
  for (let k = 0; k < 5; k++) { const b = grp(); b.rotation.y = k / 5 * Math.PI * 2; f.add(b); add(b, rbox(R * 0.82, 0.14, R * 0.36, 0.06), D.louver, R * 0.5, 0, 0, 0.3, 0, 0); } // the blades, pitched
  add(u, cyl(R * 0.26, R * 0.26, 0.5, 12), D.steel, 0, top + 0.6, 0);                                                 // the hub
  add(u, rbox(R * 2 + 1, 0.22, 0.34, 0.08), D.steel, 0, top + 0.85, 0); add(u, rbox(0.34, 0.22, R * 2 + 1, 0.08), D.steel, 0, top + 0.85, 0); // the guard's bars
  add(u, torus(R * 0.6, 0.14, 20), D.steel, 0, top + 0.85, 0, Math.PI / 2, 0, 0);                                      // and its ring
  vent(u, D, M, 0, hh / 2 + 0.5, d / 2, 0, w - 4, hh - 2.6, 3);
  return u;
}
/** A cable tray along the roof from a to b ([x, z]) at height y: two pale rails, rungs, three dark cables in it. */
function cableTray(g, D, a, b, y) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
  for (const s of [-1, 1]) limb(g, [a[0] + nx * s * 1.5, y + 0.6, a[1] + nz * s * 1.5], [b[0] + nx * s * 1.5, y + 0.6, b[1] + nz * s * 1.5], 0.24, D.steel);
  for (let t = 1.2; t < L; t += 2.6) limb(g, [a[0] + ux * t - nx * 1.5, y + 0.4, a[1] + uz * t - nz * 1.5], [a[0] + ux * t + nx * 1.5, y + 0.4, a[1] + uz * t + nz * 1.5], 0.16, D.steel);
  for (const s of [-0.8, 0, 0.8]) limb(g, [a[0] + nx * s, y + 0.55, a[1] + nz * s], [b[0] + nx * s, y + 0.55, b[1] + nz * s], 0.3, D.cable);
}
/** The Data center's detail, over the hall as built (`W` by `D` and `H` tall on a course `Y0` high; the bay `BW` wide
 *  and `BH` tall; the roof's surface is the parapet's ink lid at TOP + 3.15, the chip in its middle, the dish at its
 *  north-east):
 *  the roof: panels with seams either side of the chip, two cooling units with fans on the west, pipes between them and
 *    down to a manifold, a cable tray from the chip east to a roof hatch and an antenna array (three whips, a light),
 *    small components round the chip's corners;
 *  the south face: louvered vents over the bay, bolt heads on the jambs, lights on the racks, warning stripes on the
 *    course before the bay;
 *  the east face (blank today): four lit rack windows in pale frames, a vent, a door with a lit keypad, a ladder to
 *    the roof, a cable riser. */
export function serverHallDetail(M, g, { W, D: DP, H, Y0, TOP, BW, BH, BD }) {
  const D = hallMats(M), RY = TOP + 3.15;
  // -- the roof: panels and seams (inside the parapet, clear of the chip's pins at x +-27) --
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) add(g, rbox(23.6, 0.3, 13.6, 0.12), D.roofPanel, sx * 40.4, RY + 0.1, -22.2 + k * 14.6);
  // two cooling units on the west, pipes between them and to a manifold at the south-west
  coolingUnit(g, D, M, -41, RY + 0.2, -15, 17, 15, 5.2, 0.2); coolingUnit(g, D, M, -41, RY + 0.2, 8, 17, 15, 5.2, 0.7);
  for (const dx of [-3, 3]) limb(g, [-41 + dx, RY + 1.6, -7.5], [-41 + dx, RY + 1.6, 0.5], 0.7, D.steel);               // pipes unit to unit
  limb(g, [-45, RY + 1.2, 15.5], [-45, RY + 1.2, 23], 0.7, D.steel); limb(g, [-45, RY + 1.2, 23], [-36, RY + 1.2, 23], 0.7, D.steel); add(g, sph(0.95, 8, 6), D.steel, -45, RY + 1.2, 23); // a pipe out of the south unit, an elbow, east
  add(g, rbox(5, 2.6, 4, 0.4), D.unit, -33.5, RY + 1.5, 23); add(g, cyl(0.8, 0.8, 0.5, 10), D.dark, -33.5, RY + 2.9, 23); for (const z of [21.6, 24.4]) add(g, sph(0.3, 6, 5), M.neon, -31.4, RY + 2.0, z); // the manifold: a small box, a cap, two lights
  // the east strip: a hatch, a cable tray from the chip to it and on to the antenna array
  add(g, rbox(8, 1.6, 8, 0.3), D.unit, 40, RY + 0.9, 4); add(g, rbox(6.6, 0.4, 6.6, 0.15), D.steel, 40, RY + 1.8, 4); add(g, rbox(0.5, 0.7, 3, 0.15), D.dark, 42.4, RY + 2.2, 4); // the hatch, its lid and handle
  cableTray(g, D, [27.5, -3], [35.6, 1.8], RY + 0.2); cableTray(g, D, [41, 8.4], [44, 17], RY + 0.2);
  add(g, rbox(9, 1.6, 5, 0.4), D.unit, 45, RY + 0.9, 21); add(g, rbox(9.4, 0.4, 6.4, 0.1), D.stripes, 45, RY + 0.2, 21);  // the antenna array's base, stripes round its foot
  for (const [dx, hh, r] of [[-3, 13, 0.5], [0, 17, 0.55], [3, 10.5, 0.5]]) { add(g, cyl(r, r + 0.12, hh, 6), D.steel, 45 + dx, RY + 2.3 + hh / 2, 21); add(g, cyl(0.7, 0.7, 0.8, 8), D.dark, 45 + dx, RY + 2.6, 21); } // three whips
  add(g, sph(0.5, 8, 6), M.neon, 45, RY + 19.6, 21); add(g, sph(1.2, 8, 6), M.neonHalo, 45, RY + 19.6, 21);              // a light on the tallest
  for (const dx of [-3, 3]) for (const t of [0.45, 0.75]) add(g, rbox(2.6, 0.4, 0.4, 0.1), D.steel, 45 + dx, RY + 2.3 + (dx < 0 ? 13 : 10.5) * t, 21); // cross pieces on the outer whips
  // small components round the chip's corners: pale blocks in rows, as on a board
  for (const [sx, sz] of [[-1, -1], [1, 1], [-1, 1]]) for (let k = 0; k < 3; k++) add(g, rbox(1.6, 0.9, 2.6, 0.2), k === 1 ? D.steel : D.unit, sx * (24.6 - k * 2.4), RY + 0.5, -3 + sz * 26.0);
  // -- the south face --
  for (const x of [-22.5, -7.5, 7.5, 22.5]) vent(g, D, M, x, Y0 + BH + 5.6, DP / 2, 0, 11.5, 4.6, 4);                    // four louvered vents over the bay
  for (const sx of [-1, 1]) for (const y of [4, 10, 16]) add(g, sph(0.34, 6, 5), D.steel, sx * (BW / 2 + 0.8), Y0 + y, DP / 2 + 1.25); // bolt heads on the jambs
  for (let k = 0; k < 6; k++) { const x = -25 + k * 10, z = DP / 2 - BD + 4.5 + 4.05; for (const [dy, m] of [[13.2, D.ledWhite], [10.2, M.neon], [7.2, D.ledWhite], [4.2, M.neon]]) add(g, rbox(1.5, 0.4, 0.3, 0.05), m, x + (dy % 2 > 1 ? 0.6 : -0.6), Y0 + dy, z); } // the racks' status lights, rows of short bars
  add(g, rbox(BW + 2, 0.34, 2.4, 0.08), D.stripes, 0, Y0 + 0.12, DP / 2 + 1.7);                                           // warning stripes on the course before the bay
  // -- the east face (x = W / 2, its normal +x): lit rack windows, a vent, a door, a ladder, a cable riser --
  const E = W / 2;
  for (const z of [-19.5, -8.5, 2.5, 13.5]) {
    add(g, quad(8.4, 10.4), D.win, E + 0.42, Y0 + 15.2, z, 0, Math.PI / 2, 0);
    add(g, rbox(0.8, 0.7, 9.8, 0.15), D.steel, E + 0.5, Y0 + 20.7, z); add(g, rbox(1.3, 0.7, 10.2, 0.15), D.steel, E + 0.6, Y0 + 9.7, z); // the lintel, the sill
    for (const s of [-1, 1]) add(g, rbox(0.8, 11.4, 0.7, 0.15), D.steel, E + 0.5, Y0 + 15.2, z + s * 4.55);              // the jambs
    add(g, rbox(0.5, 10.4, 0.35, 0.1), M.trim, E + 0.5, Y0 + 15.2, z);                                                  // a mullion down the middle
  }
  vent(g, D, M, E, Y0 + 4.6, -14, Math.PI / 2, 14, 4.2, 3);                                                               // a low vent under the north windows
  add(g, rbox(0.7, 9.6, 5.6, 0.2), M.trim, E + 0.4, Y0 + 4.8, 24.5); add(g, rbox(0.8, 10.4, 0.6, 0.1), D.steel, E + 0.45, Y0 + 5.2, 21.4); add(g, rbox(0.8, 10.4, 0.6, 0.1), D.steel, E + 0.45, Y0 + 5.2, 27.6); add(g, rbox(0.8, 0.6, 6.8, 0.1), D.steel, E + 0.45, Y0 + 10.3, 24.5); // the door in its frame
  add(g, rbox(0.4, 1.2, 0.9, 0.1), M.neon, E + 0.7, Y0 + 5.6, 20.2); add(g, sph(0.3, 6, 5), D.steel, E + 0.9, Y0 + 5.0, 26.4); // its lit keypad, its handle
  for (const s of [-1, 1]) limb(g, [E + 1.0, Y0 + 0.5, -27 + s * 1.3], [E + 1.0, TOP + 4.6, -27 + s * 1.3], 0.24, D.steel); // the ladder's rails, up past the parapet
  for (let y = 2; y < H + 4; y += 2.4) limb(g, [E + 1.0, Y0 + y, -28.3], [E + 1.0, Y0 + y, -25.7], 0.18, D.steel);        // its rungs
  for (const dz of [-0.7, 0.2]) limb(g, [E + 0.6, Y0 + 0.5, 18 + dz], [E + 0.6, TOP + 3.3, 18 + dz], 0.34, D.cable);    // a cable riser, up to the roof and over to the antennas
  for (const y of [8, 17, 26]) add(g, rbox(0.9, 0.7, 2.4, 0.15), D.steel, E + 0.7, Y0 + y, 17.75);                       // its clamps
  limb(g, [E + 0.6, TOP + 3.3, 17.75], [48.5, RY + 0.6, 19.5], 0.34, D.cable);
}

// ------------------------------------------------ the Gold mine ------------------------------------------------
/** The mine's detail materials: moss and grass greens (the ground's mid green and a step darker), a warm halo round a
 *  lantern, pale fresh-cut timber ends. */
function mineDetailMats(M) {
  if (M.dt) return M.dt;
  return M.dt = {
    moss: std({ color: 0x55703a, roughness: 1, flatShading: true }), mossDark: std({ color: 0x3e5630, roughness: 1, flatShading: true }),
    tuft: std({ color: 0x66883e, roughness: 1 }), cut: std({ color: 0x8a7a62, roughness: 1 }), rope: std({ color: 0x8c8068, roughness: 1 }),
    halo: new THREE.MeshBasicMaterial({ color: 0xffb050, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
}
const icos = new Map();
const lump = (r) => { if (!icos.has(r)) icos.set(r, new THREE.IcosahedronGeometry(r, 1)); return icos.get(r); };
/** The Gold mine's detail, over the mine as built and before its scale (`C` the country's materials, `M` the mine's;
 *  `st` 0 full, 1 low, 2 empty; the portal's frame at z `PZ`, its posts at x +-`PX` and `PH` tall, the mouth `MW` wide):
 *  moss on the crags and the boulder, grass tufts and pebbles round the apron's edge;
 *  at the portal: knee braces under the lintel, a cage and a cap on its lantern, a ladder up the west rock;
 *  in the yard: a stack of cut timbers, a barrel and a crate by the east wing wall, a lantern on a post by the rails
 *    (lit while the mine is worked; on the empty mine the post leans and the lamp is out, the barrel lies on its side,
 *    the stack is two logs left behind), tie plates on the sleepers;
 *  on the cart (on its rails): rivets along its bands, a coupling bar and hook. */
export function mineDetail(C, M, g, { st, PZ, PX, PH, MW }) {
  const D = mineDetailMats(M), EMPTY = st === 2;
  let t = 9001 + st; const rnd = () => ((t = (t * 16807) % 2147483647) / 2147483647);
  const blob = (r, mat, x, y, z, sx, sy, sz, ry = 0) => { const m = add(g, lump(r), mat, x, y, z, 0, ry, 0); m.scale.set(sx, sy, sz); return m; };
  // moss: flat lumps on the lit tops of the flank crags, the dark crag behind, the yard's boulder, the slab's east shoulder
  for (const [x, y, z, r, k] of [[-33, 16.6, -9, 6, 0], [-25, 21.2, -29, 5.5, 1], [40.5, 7.0, 13, 3.6, 0], [26, 25.0, -3, 4.2, 1], [-41, 7.2, 3.5, 3.6, 1], [13, 31.2, -20, 3.6, 0]]) {
    blob(r, k ? D.mossDark : D.moss, x, y, z, 1.25, 0.22, 1.0, rnd() * 3); blob(r * 0.55, k ? D.moss : D.mossDark, x + r * 0.5, y + 0.3, z + r * 0.3, 1.1, 0.25, 1.0, rnd() * 3);
  }
  // grass tufts and pebbles at the apron's edge and along the scree
  for (const [x, z] of [[-45, 18], [-38, 33], [-22, 43], [20, 44], [38, 34], [46, 20], [-47, -4], [47, 3], [-13, 14], [14, 15]]) for (let k = 0; k < 4; k++) add(g, cone(0.75, 3.2 + rnd() * 1.8, 5), D.tuft, x + (rnd() - 0.5) * 3, 1.5, z + (rnd() - 0.5) * 2.4, (rnd() - 0.5) * 0.5, 0, (rnd() - 0.5) * 0.5);
  for (let k = 0; k < 12; k++) { const a = 0.3 + rnd() * 2.5, d = 24 + rnd() * 20; blob(0.9 + rnd() * 0.7, k % 2 ? M.rock : M.rockPale, Math.cos(a) * d, 0.5, 6 + Math.sin(a) * d * 0.8, 1, 0.6, 1, rnd() * 3); }
  // the portal
  if (!EMPTY) {
    for (const s of [-1, 1]) limb(g, [s * (PX - 0.4), PH - 7.5, PZ + 0.6], [s * (PX - 8.5), PH - 0.6, PZ + 0.6], 1.15, M.timber);     // knee braces under the lintel
    add(g, cone(1.5, 1.2, 8), C.iron, -10, PH + 2.5, PZ + 5.2); add(g, torus(1.45, 0.16, 10), C.iron, -10, PH + 0.9, PZ + 5.2, Math.PI / 2, 0, 0); // the lantern's cap and cage ring
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + 0.4; limb(g, [-10 + Math.cos(a) * 1.4, PH - 0.4, PZ + 5.2 + Math.sin(a) * 1.4], [-10 + Math.cos(a) * 1.4, PH + 2.0, PZ + 5.2 + Math.sin(a) * 1.4], 0.13, C.iron); }
    add(g, sph(3.0, 10, 8), D.halo, -10, PH + 0.9, PZ + 5.2);
  }
  for (const s of [-1, 1]) limb(g, [-27.5 + s * 1.5, 0.4, PZ + 6.5], [-26 + s * 1.5, 19.5, PZ - 3.2], 0.42, M.timberDark);              // a ladder up the rock west of the portal
  for (let k = 1; k < 8; k++) { const q = k / 8; limb(g, [-29 + 1.5 * q, 0.4 + 19.1 * q, PZ + 6.5 - 9.7 * q], [-26 + 1.5 * q, 0.4 + 19.1 * q, PZ + 6.5 - 9.7 * q], 0.3, M.timber); }
  // the yard west of the rails: cut timbers stacked (two logs left on the empty mine)
  const logs = EMPTY ? [[-27, 1.6, 21, 0.25], [-22, 1.6, 26.5, -0.5]] : [[-27, 1.7, 19.6, 0], [-27, 1.7, 22.9, 0], [-27, 1.7, 26.2, 0], [-27, 4.5, 21.2, 0], [-27, 4.5, 24.6, 0]];
  for (const [x, y, z, ry] of logs) { const l = grp(); l.position.set(x, y, z); l.rotation.y = ry; g.add(l); add(l, cyl(1.65, 1.65, 17, 9), M.timber, 0, 0, 0, 0, 0, Math.PI / 2); for (const s of [-1, 1]) add(l, cyl(1.3, 1.3, 0.3, 9), D.cut, s * 8.45, 0, 0, 0, 0, Math.PI / 2); }
  if (!EMPTY) for (const x of [-32.5, -21.5]) for (const z of [18.2, 27.6]) add(g, rbox(1.0, 4.4, 1.0, 0.2), M.timberDark, x, 2.2, z);    // stakes holding the stack
  // east of the rails: a barrel and a crate by the wing wall
  const brl = grp(); brl.position.set(EMPTY ? 19 : 17, EMPTY ? 2.7 : 0, EMPTY ? 37 : 20.5); brl.rotation.set(0, 0.4, EMPTY ? Math.PI / 2 : 0); g.add(brl);
  add(brl, cyl(2.5, 2.5, 6.4, 12), M.board, 0, 3.2, 0); add(brl, cyl(2.85, 2.85, 2.6, 12), M.board, 0, 3.2, 0); for (const y of [1.3, 5.1]) add(brl, cyl(2.72, 2.72, 0.6, 12), C.iron, 0, y, 0); add(brl, cyl(2.1, 2.1, 0.2, 12), M.timberDark, 0, 6.42, 0);
  if (!EMPTY) { add(g, rbox(6.4, 5.2, 6.0, 0.3), M.board, 23.5, 2.6, 16.5, 0, 0.2, 0); for (const y of [0.9, 4.4]) add(g, rbox(6.8, 0.8, 6.4, 0.15), M.timberDark, 23.5, y, 16.5, 0, 0.2, 0); add(g, torus(1.8, 0.45, 12), D.rope, 23.5, 5.6, 16.5, Math.PI / 2, 0, 0); } // the crate, banded, a rope coil on it
  // a lantern on a post by the rails
  const post = grp(); post.position.set(13, 0, 36); post.rotation.z = EMPTY ? -0.3 : 0; g.add(post);
  add(post, rbox(1.7, 15, 1.7, 0.3), M.timber, 0, 7.5, 0); add(post, rbox(5.0, 1.1, 1.1, 0.2), M.timber, -1.8, 14.2, 0); limb(post, [0, 10.4, 0], [-3.4, 13.8, 0], 0.4, M.timberDark);
  add(post, cyl(0.9, 0.9, 2.0, 8), C.iron, -3.8, 12.2, 0); add(post, cone(1.3, 1.0, 8), C.iron, -3.8, 13.5, 0);
  if (!EMPTY) { add(post, sph(1.25, 8, 6), M.lamp, -3.8, 11.9, 0); add(post, sph(2.8, 10, 8), D.halo, -3.8, 11.9, 0); }
  // tie plates where the rails cross the sleepers
  for (let z = PZ + 3; z < 46; z += 5) for (const s of [-1, 1]) add(g, rbox(2.0, 0.35, 1.5, 0.1), C.iron, s * 5.0, 1.12, z);
  // the cart on its rails (full and low: at (0, 27), its tub 12 by 9 from y 2 to 9): rivets along the bands, a coupling
  if (!EMPTY) {
    for (const y of [3.0, 8.2]) for (const x of [-4.5, -1.5, 1.5, 4.5]) add(g, sph(0.42, 6, 5), M.rockPale, x, y, 27 + 4.95);
    for (const y of [3.0, 8.2]) for (const z of [-2.6, 0, 2.6]) for (const s of [-1, 1]) add(g, sph(0.42, 6, 5), M.rockPale, s * 6.4, y, 27 + z);
    limb(g, [0, 3.2, 31.6], [0, 3.2, 35.4], 0.5, C.iron); add(g, torus(0.9, 0.3, 10), C.iron, 0, 3.2, 36.2, Math.PI / 2, 0, 0);
  }
}
