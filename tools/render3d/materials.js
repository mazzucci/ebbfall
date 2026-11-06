// Materials and procedural textures for the models. Team colour is a parameter; everything else is shared.
import * as THREE from 'three';
import { SEAT_COLORS } from '../../src/client/look.js';

function canvasTex(size, draw, { repeat = 1, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** Light grey plating: seams, rivets and grime; used as a colour map multiplied with the material colour. */
const panel = canvasTex(256, (g, n) => {
  g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 2600; i++) { const v = 200 + rnd() * 55; g.fillStyle = `rgba(${v},${v},${v},0.35)`; g.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 3, 1 + rnd() * 3); }
  for (let i = 0; i < 18; i++) { const x = (rnd() * 4 | 0) * 64, y = (rnd() * 8 | 0) * 32; g.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},0.07)`; g.fillRect(x, y, 64, 32); }
  g.strokeStyle = 'rgba(25,25,25,0.8)'; g.lineWidth = 3;
  for (const p of [0, 64, 128, 192]) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, n); g.stroke(); g.beginPath(); g.moveTo(0, p + 32); g.lineTo(n, p + 32); g.stroke(); }
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1;
  for (const p of [0, 64, 128, 192]) { g.beginPath(); g.moveTo(p + 2, 0); g.lineTo(p + 2, n); g.stroke(); g.beginPath(); g.moveTo(0, p + 34); g.lineTo(n, p + 34); g.stroke(); }
  g.fillStyle = 'rgba(30,30,30,0.6)';
  for (let x = 6; x < n; x += 64) for (let y = 6; y < n; y += 32) { g.beginPath(); g.arc(x, y + 32, 2, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1;
  for (let i = 0; i < 40; i++) { const x = (rnd() * 4 | 0) * 64 + 3, y = (rnd() * 8 | 0) * 32 + 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 6 + rnd() * 30, y); g.stroke(); }
  for (let x = 6; x < n; x += 64) for (let y = 6; y < n; y += 32) if (rnd() < 0.25) { g.fillStyle = 'rgba(70,40,20,0.35)'; g.beginPath(); g.ellipse(x, y + 32 + 6, 1.5, 6 + rnd() * 6, 0, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(20,20,20,0.55)';
  for (let i = 0; i < 12; i++) { const x = rnd() * (n - 12), y = rnd() * (n - 6); if (rnd() < 0.5) for (let k = 0; k < 4; k++) g.fillRect(x, y + k * 2, 8, 1); else { g.font = '7px monospace'; g.fillText(String(rnd() * 90 | 0), x, y + 7); } }
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(50,40,30,${0.06 + rnd() * 0.12})`; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 6 + rnd() * 20, 3 + rnd() * 10, rnd() * 3, 0, 7); g.fill(); }
}, { repeat: 2 });
const bump = canvasTex(256, (g, n) => {
  g.fillStyle = '#808080'; g.fillRect(0, 0, n, n);
  g.strokeStyle = '#303030'; g.lineWidth = 2;
  for (const p of [0, 64, 128, 192]) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, n); g.stroke(); g.beginPath(); g.moveTo(0, p + 32); g.lineTo(n, p + 32); g.stroke(); }
  g.fillStyle = '#d0d0d0';
  for (let x = 6; x < n; x += 64) for (let y = 6; y < n; y += 32) { g.beginPath(); g.arc(x, y + 32, 2, 0, 7); g.fill(); }
}, { srgb: false, repeat: 2 });
const concreteTex = canvasTex(256, (g, n) => {
  g.fillStyle = '#9a9a96'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 6000; i++) { const v = 120 + rnd() * 100; g.fillStyle = `rgba(${v},${v},${v - 6},0.25)`; g.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 2, 1 + rnd() * 2); }
  g.strokeStyle = 'rgba(40,40,40,0.5)'; g.lineWidth = 1.5;
  for (let p = 0; p < n; p += 64) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, n); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(n, p); g.stroke(); }
  for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(50,45,40,${0.05 + rnd() * 0.1})`; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 8 + rnd() * 30, 4 + rnd() * 14, rnd() * 3, 0, 7); g.fill(); }
});
const hazardTex = canvasTex(64, (g, n) => {
  g.fillStyle = '#e8b322'; g.fillRect(0, 0, n, n);
  g.fillStyle = '#1d1d1d';
  for (let k = -n; k < n * 2; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 16, 0); g.lineTo(k + 16 - n, n); g.lineTo(k - n, n); g.closePath(); g.fill(); }
});
const treadTex = canvasTex(64, (g, n) => { g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, n, n); g.fillStyle = '#111'; for (let k = 0; k < n; k += 8) g.fillRect(k, 0, 4, n); g.fillStyle = 'rgba(255,255,255,0.08)'; for (let k = 2; k < n; k += 8) g.fillRect(k, 0, 1, n); });

// ---- the Harbour (tools/render3d/STYLE.md): tarred planking, canvas, timber, rope, sandbags ----
/** Tarred hull planking: near-black with plank seams, a few pale scuffs where the tar has worn, caulking lines. */
const tarTex = canvasTex(256, (g, n) => {
  g.fillStyle = '#d8d4cc'; g.fillRect(0, 0, n, n); // (a light base: the material colour darkens it; keeps the finish's banding from crushing it)
  seed = 101;
  for (let i = 0; i < 3000; i++) { const v = 150 + rnd() * 90; g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.3)`; g.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 4, 1 + rnd() * 2); }
  g.strokeStyle = 'rgba(20,18,16,0.85)'; g.lineWidth = 2.5;
  for (let y = 0; y < n; y += 32) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(n, y + 0.5); g.stroke(); } // plank seams
  g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1;
  for (let y = 0; y < n; y += 32) { g.beginPath(); g.moveTo(0, y + 3); g.lineTo(n, y + 3); g.stroke(); }  // a lit plank edge
  g.strokeStyle = 'rgba(20,18,16,0.7)'; g.lineWidth = 2;
  for (let i = 0; i < 14; i++) { const x = rnd() * n, y = (rnd() * 8 | 0) * 32; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); } // plank ends
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(230,220,200,${0.1 + rnd() * 0.2})`; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 3 + rnd() * 10, 1 + rnd() * 2.5, rnd() * 3, 0, 7); g.fill(); } // worn tar
}, { repeat: 2 });
const tarBump = canvasTex(256, (g, n) => {
  g.fillStyle = '#808080'; g.fillRect(0, 0, n, n); g.strokeStyle = '#404040'; g.lineWidth = 2.5;
  for (let y = 0; y < n; y += 32) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(n, y + 0.5); g.stroke(); }
}, { srgb: false, repeat: 2 });
/** Canvas: a pale weave with stitched seams, faint stains and patches. */
const canvasWeave = canvasTex(128, (g, n) => {
  g.fillStyle = '#efe9da'; g.fillRect(0, 0, n, n); seed = 211;
  for (let i = 0; i < 4000; i++) { const v = 200 + rnd() * 55; g.fillStyle = `rgba(${v},${v - 5},${v - 18},0.35)`; g.fillRect(rnd() * n, rnd() * n, 1, 1); }
  g.fillStyle = 'rgba(0,0,0,0.05)'; for (let k = 0; k < n; k += 3) g.fillRect(k, 0, 1, n); for (let k = 0; k < n; k += 3) g.fillRect(0, k, n, 1);
  for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(120,100,70,${0.06 + rnd() * 0.1})`; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 6 + rnd() * 16, 4 + rnd() * 10, rnd() * 3, 0, 7); g.fill(); } // stains
  g.strokeStyle = 'rgba(90,80,60,0.55)'; g.lineWidth = 1; g.setLineDash([2, 2]);
  for (const p of [20, 84]) { g.beginPath(); g.moveTo(0, p); g.lineTo(n, p); g.stroke(); g.beginPath(); g.moveTo(p + 30, 0); g.lineTo(p + 30, n); g.stroke(); } // stitched seams
  g.setLineDash([]);
}, { repeat: 3 });
const grainTex = canvasTex(128, (g, n) => {
  g.fillStyle = '#c9b592'; g.fillRect(0, 0, n, n); seed = 307;
  for (let i = 0; i < 60; i++) { const y = rnd() * n; g.strokeStyle = `rgba(70,45,20,${0.15 + rnd() * 0.3})`; g.lineWidth = 0.6 + rnd() * 1.4; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(n / 3, y + rnd() * 6 - 3, 2 * n / 3, y + rnd() * 6 - 3, n, y + rnd() * 3 - 1.5); g.stroke(); }
}, { repeat: 2 });
const ropeBump = canvasTex(64, (g, n) => { g.fillStyle = '#808080'; g.fillRect(0, 0, n, n); g.strokeStyle = '#3a3a3a'; g.lineWidth = 3; for (let k = -n; k < n * 2; k += 8) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + n, n); g.stroke(); } }, { srgb: false, repeat: 6 });
const flagTex = canvasTex(256, (g, n) => {
  g.fillStyle = '#b8bcc0'; g.fillRect(0, 0, n, n); seed = 503;
  for (let i = 0; i < 5000; i++) { const v = 130 + rnd() * 90; g.fillStyle = `rgba(${v},${v + 2},${v + 6},0.3)`; g.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 2, 1 + rnd() * 2); }
  g.strokeStyle = 'rgba(20,22,26,0.85)'; g.lineWidth = 2.5;
  for (let y = 0; y < n; y += 64) for (let x = 0; x < n; x += 64) { const o = (y / 64) % 2 ? 32 : 0; g.strokeRect(x + o + 1, y + 1, 62, 62); } // flagstones, in courses
  for (let i = 0; i < 24; i++) { g.fillStyle = `rgba(255,255,255,${0.04 + rnd() * 0.08})`; const x = (rnd() * 4 | 0) * 64, y = (rnd() * 4 | 0) * 64; g.fillRect(x + ((y / 64) % 2 ? 32 : 0), y, 64, 64); } // lighter stones
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(30,35,30,${0.08 + rnd() * 0.15})`; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 4 + rnd() * 16, 2 + rnd() * 8, rnd() * 3, 0, 7); g.fill(); } // damp, weed
}, { repeat: 2 });
const flagBump = canvasTex(256, (g, n) => { g.fillStyle = '#808080'; g.fillRect(0, 0, n, n); g.strokeStyle = '#303030'; g.lineWidth = 3; for (let y = 0; y < n; y += 64) for (let x = 0; x < n; x += 64) g.strokeRect(x + ((y / 64) % 2 ? 32 : 0) + 1, y + 1, 62, 62); }, { srgb: false, repeat: 2 });
const burlapTex = canvasTex(64, (g, n) => { g.fillStyle = '#cfc8b4'; g.fillRect(0, 0, n, n); g.fillStyle = 'rgba(0,0,0,0.12)'; for (let k = 0; k < n; k += 2) g.fillRect(k, 0, 1, n); g.fillStyle = 'rgba(0,0,0,0.1)'; for (let k = 1; k < n; k += 2) g.fillRect(0, k, n, 1); seed = 409; for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(60,45,25,${0.1 + rnd() * 0.15})`; g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 3 + rnd() * 8, 2 + rnd() * 5, rnd() * 3, 0, 7); g.fill(); } }, { repeat: 4 });

/** Team paint: per-seat frames are rendered once in NEUTRAL (white paint, white lamps) with a team mask the client
 *  tints with the seat's colour (Notion: Ebbfall art); scaffolds and rubble keep seat 0's gold (GOLD). */
export const NEUTRAL = { paint: 0xffffff, light: 0xffffff }, GOLD = { paint: SEAT_COLORS[0], light: 0xffc65a };
/** Mark a material as team-coloured: its share of the team mask (1 paint; lamps less, so they read as a pale tint). */
export const team = (m, w = 1) => { m.userData.team = w; return m; };
export const LAMP_MASK = 0.4;

export function makeMats(tc = NEUTRAL) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    paint: team(std({ color: tc.paint, map: panel, bumpMap: bump, bumpScale: 1.2, metalness: 0.55, roughness: 0.32 })),
    paintPlain: team(std({ color: tc.paint, metalness: 0.35, roughness: 0.4 })),
    trim: std({ color: 0x7c838e, map: panel, bumpMap: bump, bumpScale: 0.9, metalness: 0.8, roughness: 0.3 }),
    steel: std({ color: 0x5c636e, metalness: 0.85, roughness: 0.32 }),
    dark: std({ color: 0x2a2f38, metalness: 0.6, roughness: 0.5 }),
    gunmetal: std({ color: 0x3b414b, metalness: 0.9, roughness: 0.28 }),
    rubber: std({ color: 0x222222, map: treadTex, metalness: 0.1, roughness: 0.9 }),
    glass: std({ color: 0x1b3b4a, emissive: 0x2e9fc7, emissiveIntensity: 1.2, metalness: 0.2, roughness: 0.08 }),
    lamp: team(std({ color: 0x222222, emissive: tc.light, emissiveIntensity: 3 }), LAMP_MASK),
    white: std({ color: 0xfff4d0, emissive: 0xfff0c0, emissiveIntensity: 2.4 }),
    concrete: std({ color: 0x8f8f8b, map: concreteTex, metalness: 0.05, roughness: 0.92 }),
    hazard: std({ color: 0xffffff, map: hazardTex, metalness: 0.2, roughness: 0.6 }),
    ether: std({ color: 0x5b3fb0, emissive: 0xa98bff, emissiveIntensity: 1.8, roughness: 0.2 }),
    fire: std({ color: 0x401000, emissive: 0xff7a1a, emissiveIntensity: 2.6 }),
    slag: std({ color: 0x2a0a00, emissive: 0xd8501a, emissiveIntensity: 1.1, roughness: 0.4 }),
    cloth: std({ color: 0x4a4f45, roughness: 0.95 }),
    skinDark: std({ color: 0x2e3238, metalness: 0.4, roughness: 0.6 }),
    medWhite: std({ color: 0xd8dde3, map: panel, bumpMap: bump, bumpScale: 0.6, metalness: 0.3, roughness: 0.45 }),
    medRed: std({ color: 0xc8242c, metalness: 0.1, roughness: 0.5 }),
    healGlow: std({ color: 0x103018, emissive: 0x6dff9a, emissiveIntensity: 2.4 }),
    rotor: std({ color: 0x15181d, metalness: 0.5, roughness: 0.5 }),
    // Building families (see Notion: Ebbfall art): command/civil = trim (grey steel), military = khaki, industry = iron.
    khaki: std({ color: 0x8e8664, map: panel, bumpMap: bump, bumpScale: 0.9, metalness: 0.55, roughness: 0.5 }),
    iron: std({ color: 0x3d3835, map: panel, bumpMap: bump, bumpScale: 1.0, metalness: 0.75, roughness: 0.55 }),
    ember: std({ color: 0x4a1200, emissive: 0xffb23a, emissiveIntensity: 3.2 }),
    etherSoft: std({ color: 0x4a2f9a, emissive: 0x9a7cf0, emissiveIntensity: 0.9, roughness: 0.3 }),
    mark: std({ color: 0xe4e0d4, metalness: 0.1, roughness: 0.7 }),
    beacon: std({ color: 0x300000, emissive: 0xff2a2a, emissiveIntensity: 3 }),
    // The Harbour (STYLE.md): dark hulls of tar and iron under pale canvas; timber, rope, brass only on small tips.
    tar: std({ color: 0x4a4542, map: tarTex, bumpMap: tarBump, bumpScale: 1.6, metalness: 0.3, roughness: 0.5 }),      // tarred planking (reads ~0x24211e lit, the seams showing)
    ironDark: std({ color: 0x2c2e31, map: panel, bumpMap: bump, bumpScale: 0.8, metalness: 0.85, roughness: 0.5 }),      // black iron: bands, fittings, gun metal
    canvas: std({ color: 0xd4ccb6, map: canvasWeave, roughness: 0.92, metalness: 0 }),                                    // pale canvas: hats, awnings, sails
    canvasDark: std({ color: 0x8f8872, map: canvasWeave, roughness: 0.95, metalness: 0 }),                                // a hat's underside, old sailcloth
    timber: std({ color: 0x7a5b3a, map: grainTex, roughness: 0.8, metalness: 0 }),                                        // handles, jetties, masts
    rope: std({ color: 0xc8b48a, bumpMap: ropeBump, bumpScale: 1.2, roughness: 0.95, metalness: 0 }),                     // coils, lines
    brass: std({ color: 0xc49a3c, metalness: 0.95, roughness: 0.28 }),                                                    // small tips only: a pick's point, a lamp's frame
    sandbag: std({ color: 0x7a7264, map: burlapTex, roughness: 1, metalness: 0 }),                                        // dug-in state
    oilskin: std({ color: 0x24262a, roughness: 0.6, metalness: 0.2 }),                                                    // coats, boots
    paintCanvas: team(std({ color: tc.paint, map: canvasWeave, roughness: 0.88, metalness: 0.02 })),                      // team paint on cloth: matte
    slate: std({ color: 0x3e4247, roughness: 0.9, metalness: 0.05, flatShading: true }),                                  // a quay's stone
    flagstone: std({ color: 0x565b60, map: flagTex, bumpMap: flagBump, bumpScale: 1.2, roughness: 0.88, metalness: 0.05 }), // a quay's paving
    timberPale: std({ color: 0xb09468, map: grainTex, roughness: 0.75, metalness: 0 }),                                    // a rifle's stock, pale enough to read
    inkLine: std({ color: 0x08080a, roughness: 0.8, metalness: 0 }),                                                      // the ink ring round a team band
    lanternGlass: std({ color: 0xe6dcc0, emissive: 0x9a8650, emissiveIntensity: 0.55, metalness: 0.1, roughness: 0.2 }),   // pale warm glass (opaque)
    lanternPane: new THREE.MeshPhysicalMaterial({ color: 0xf0e8d0, transparent: true, opacity: 0.15, roughness: 0.1, metalness: 0, depthWrite: false }), // the lantern room's panes, see-through
    lampHot: std({ color: 0xfff8e0, emissive: 0xfff2c0, emissiveIntensity: 6 }),                                           // the lantern's lamp: the brightest Harbour pixel
    lampHalo: new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }),
    lampHalo2: new THREE.MeshBasicMaterial({ color: 0xffb860, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
}
