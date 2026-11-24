// The Kingdom's Guard (the `trooper` kind) for the new look: a stocky spearman in a big quilted vest, all of it the
// seat's color; gray mail sleeves and collar, a bright steel kettle hat, a tall pale oak shield, dark hose and boots.
// From the article folder's units3d/guard.js (the rig, the poses, the spear and the strike are its own), redressed
// after the sheet units/guard3-1.jpg. The sheet is read from the pictures' folder when the builder runs: only
// rectangles of it are named here.
import * as THREE from 'three';
import { crop, again, steelTex, std, team, V, mesh, grp, box, ball, cyl, lathe, turn, stand, march, man, held } from './rig.js';

// ---------------------------------------------------------------- the look: the palette and the vest, all of it here
export const LOOK = {
  sheet: 'guard3-1.jpg',
  // rectangles of the sheet (its 2752x1536 px): the mail (a sleeve), the oak (the shield under its boss)
  crops: { mail: [1300, 445, 105, 95], oak: [800, 800, 120, 200] },
  vest: {
    // the vest's outline from hem to collar, [radius, height] (a man is 100 tall; mid thigh is 33, the belt 56)
    profile: [[18.4, 32], [18.8, 34.5], [17.6, 45], [16.2, 55.5], [16.9, 66], [16.9, 75], [14.6, 80.5], [10.2, 84.2]],
    depth: 0.8,             // front to back, of its width
    ribs: 12,               // the quilting's padded channels round the body
    white: 1, seam: 0.6,    // the cloth's value under the seat's paint on a channel's crown, and how much of it is left in a seam
    bump: 1.2,
    belt: 56, trim: true,   // the belt's height; a dark binding along the hem
  },
  palette: {
    mail: 0x868b93, coif: 0x7a7f87, helm: 0xe2e6ea, steel: 0x9aa0a6, iron: 0x2e2f33, boss: 0x55585e,
    oak: 0xe8dcc4, oakBack: 0x6a5238, shaft: 0x70502f,
    hose: 0x4a4050, boot: 0x3a3836, cuff: 0x4c4844, belt: 0x2c221c, trim: 0x4a3426, skin: 0xd9a27e,
  },
};

/** The vest's quilting: `ribs` padded channels round the body, each a soft crown between two seams. Gray (the seat's
 *  paint colors it), and drawn rather than cut from the sheet: the sheet's wrinkles turned to black nicks at this size. */
function quiltTex({ ribs, white, seam }) {
  const w = 512, c = document.createElement('canvas'); c.width = w; c.height = 8; const g = c.getContext('2d');
  for (let x = 0; x < w; x++) { const v = Math.round(255 * white * (seam + (1 - seam) * Math.pow(Math.sin(Math.PI * ((x + 0.5) / w * ribs % 1)), 0.55))); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 1, 8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
function makeMats(sheet) {
  const C = LOOK.crops, Vv = LOOK.vest, K = LOOK.palette;
  const quilt = quiltTex(Vv);
  const mail = crop(sheet, C.mail, { flat: 0.9, gray: 0.9, gain: 1.1, repeat: [2, 2] });
  const wood = crop(sheet, C.oak, { size: [128, 256], flat: 0.5, gain: 1.3, wrap: THREE.ClampToEdgeWrapping }); // the shield's planks
  const st = steelTex();
  return {
    vest: team({ map: quilt, bumpMap: quilt, bumpScale: Vv.bump }),
    coat: std({ color: K.mail, map: mail, roughness: 0.55, metalness: 0.45, side: THREE.DoubleSide }),      // what shows of the mail under the vest: the collar
    sleeve: std({ color: K.mail, map: again(mail, 2, 1), roughness: 0.55, metalness: 0.45 }),
    wood: std({ color: K.oak, map: wood, bumpMap: wood, bumpScale: 0.8 }), woodBack: std({ color: K.oakBack }),
    iron: std({ color: K.iron, roughness: 0.6, metalness: 0.5 }), boss: std({ color: K.boss, roughness: 0.4, metalness: 0.7 }), steel: std({ color: K.steel, map: st, roughness: 0.42, metalness: 0.75 }),
    helm: std({ color: K.helm, map: st, roughness: 0.28, metalness: 0.8 }),                                  // bright and polished: the top reads from above
    skin: std({ color: K.skin, roughness: 0.8 }), hair: std({ color: K.coif, map: mail, roughness: 0.6, metalness: 0.4 }), // (the rig's hair: his mail coif)
    trouser: std({ color: K.hose }), boot: std({ color: K.boot, roughness: 0.75 }), cuff: std({ color: K.cuff, roughness: 0.75 }), hand: std({ color: K.skin, roughness: 0.8 }),
    belt: std({ color: K.belt, roughness: 0.7 }), trim: std({ color: K.trim, roughness: 0.8 }), shaft: std({ color: K.shaft, roughness: 0.8 }),
  };
}
const SPEAR = 110;
/** The strike seen from behind: a thrust straight up the screen runs behind the body, so the spear swings out by this
 *  yaw (positive: to his left). The rig's `awayYaw`, smaller: on the flat map facing 13 already shows its spear, and
 *  facing 12's must still point up the screen. */
const awayYaw = (k) => (k === 11 ? 0.55 : k === 12 ? -0.45 : k === 13 ? -0.2 : 0);
function pose(name, k) {
  const P = { ...stand(), handL: V(10, 55, -15), handR: V(9, 55, 19), spear: V(0.05, 1, 0), grip: 51, shieldYaw: 0.5, shieldTilt: 0 };
  const yaw = awayYaw(k);
  if (name[0] === 'w' && name !== 'wind') {
    const [c, s] = march(P, +name[1] / 4);
    P.handL.x += 3 * -c; P.handL.y += 2 * Math.abs(s); P.handR.x += 5 * c; P.handR.y += 3 * Math.abs(s);
    P.spear.set(0.12 + 0.1 * c, 1, 0); P.shieldTilt = 0.08 * c;
  } else if (name === 'wind') { // the spear leveled and drawn back, the right shoulder back; from behind, raised steep: a spike over the shoulder
    P.hips.set(-3, 43, 0); P.twist = -0.5; P.lean = 0.08; P.footL.set(9, 4.5, -7); P.footR.set(-10, 4.5, 8); P.handL.set(13, 58, -13); P.shieldYaw = 0.25;
    if (yaw) { P.handR.set(-4, 64, 18); P.spear.set(0.5, 0.87, 0); P.grip = 34; } else { P.handR.set(-11, 66, 17); P.spear.set(1, 0.16, 0); P.grip = 40; }
  } else if (name === 'strike') { // the lunge: the front knee bent, the body thrown forward, the arm straight out; from behind, out to a side
    P.hips.set(7, 41, 0); P.twist = 0.4; P.lean = -0.17; P.footL.set(22, 4.5, -7); P.footR.set(-15, 5.5, 8); P.pitchR = 0.3; P.handL.set(8, 56, -15); P.shieldYaw = 0.75; P.nod = 0.1;
    P.handR.set(29, 63, 9); P.spear = turn(V(1, -0.04, 0), yaw); P.grip = 30;
    if (yaw < 0) P.handR.set(22, 63, 20); if (yaw > 0) { P.handR.set(27, 66, 6); P.twist = 0.7; }
  }
  return P;
}
function build(M, name, k) {
  const P = pose(name, k), Vv = LOOK.vest, at = (y) => { const p = Vv.profile; for (let i = 1; i < p.length; i++) if (y <= p[i][1]) { const t = (y - p[i - 1][1]) / (p[i][1] - p[i - 1][1]); return p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t; } return p[p.length - 1][0]; };
  const root = man(M, P, {
    head: 1.35, hands: 1.3, boot: 0.5,
    profile: [[12.5, 40], [13.0, 60], [13.6, 74], [12.4, 80], [8.9, 83.5], [7.2, 85.2], [7.6, 89.2]],  // the mail under the vest: its collar shows
    dress(body) {
      mesh(body, lathe(Vv.profile), M.vest).scale.x = Vv.depth;                                 // the vest: front, sides and back the seat's
      const hem = Vv.profile[0];
      if (Vv.trim) mesh(body, cyl(hem[0] + 0.5, hem[0] + 0.3, 2.2, 28, true), M.trim, 0, hem[1] + 0.6, 0).scale.x = Vv.depth;
      const rb = at(Vv.belt) + 0.6;
      mesh(body, cyl(rb, rb, 3.6, 28, true), M.belt, 0, Vv.belt, 0).scale.x = Vv.depth;
      mesh(body, box(1.4, 4.8, 4.8), M.steel, rb * Vv.depth, Vv.belt, 2);                       // the buckle
    },
    hat(head) { // the kettle hat, set high and tipped back: the camera looks down 30 degrees and must still find a face under the brim
      const hat = grp(head, -0.9, 4.4, 0); hat.rotation.z = 0.17;
      mesh(hat, lathe([[0, -0.6], [9.9, -0.9], [10.2, -0.4], [9.7, 0.1], [6.6, 1.6], [6.4, 4.2], [5.0, 6.6], [2.7, 7.7], [0, 8.0]]), M.helm);
      mesh(hat, new THREE.TorusGeometry(6.6, 0.45, 8, 28), M.iron, 0, 1.7, 0).rotation.x = Math.PI / 2;
    },
  });
  const { body, hands } = root.userData;
  // the shield on the left arm: a tall heater, pale planks in a dark iron rim, a boss
  const S = grp(body, hands[-1].x + 3.4, hands[-1].y - 9, hands[-1].z - 1); S.rotation.set(0, Math.PI / 2 + P.shieldYaw, 0); S.rotateX(-P.shieldTilt - 0.06);
  const shape = (w, top, bot) => { const s = new THREE.Shape(); s.moveTo(-w, top); s.lineTo(w, top); s.lineTo(w, top - 26); s.quadraticCurveTo(w * 0.9, bot + 12, 0, bot); s.quadraticCurveTo(-w * 0.9, bot + 12, -w, top - 26); s.closePath(); return s; };
  const face = new THREE.ExtrudeGeometry(shape(11, 29, -29), { depth: 2.2, bevelEnabled: false });
  const uv = face.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + 11) / 22, (uv.getY(i) + 29) / 58);
  mesh(S, face, [M.wood, M.woodBack]);
  mesh(S, new THREE.ExtrudeGeometry(shape(12.6, 30.6, -31.2), { depth: 1.4, bevelEnabled: false }), M.iron, 0, 0, 0.4);
  mesh(S, ball(4.6, 14, 10), M.boss, 0, 9, 2.4).scale.z = 0.55;
  // the spear
  const sp = held(root, body, hands[1], P.spear), L = SPEAR - 14, c = L / 2 - P.grip;
  mesh(sp, cyl(2.0, 2.2, L, 10), M.shaft, 0, c, 0); mesh(sp, cyl(2.1, 2.7, 5, 10), M.iron, 0, c + L / 2 + 1.5, 0);
  mesh(sp, new THREE.ConeGeometry(4.8, 16, 10), M.steel, 0, c + L / 2 + 10.5, 0).scale.z = 0.45;
  root.scale.set(1.26, 1, 1.26);
  return root;
}
/** `frames`: the poses the model has: standing, four of the march (left foot forward, passing, right, passing), the
 *  spear drawn back, the lunge. */
export default { kind: 'trooper', sheet: LOOK.sheet, makeMats, build, frames: ['idle', 'w0', 'w1', 'w2', 'w3', 'wind', 'strike'] };
