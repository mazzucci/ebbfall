// Unit sprites: Harvester, Trooper, Vanguard. Each is drawn facing +x and rotated into 16 facings, with walk
// frames; materials 'team'/'trim' take the team's colours at shading time.
import { Sprite, shade } from './raster.js';
import { RAMPS, TEAMS, OUTLINE } from './palette.js';

export const FACINGS = 16;

function ramps(team) { return { ...RAMPS, team: TEAMS[team].team, trim: TEAMS[team].trim }; }

/** Harvester: tracked hauler with a cab, a cargo hopper and a mining claw. 32x32 cell. */
function harvester(s, f) {
  const o = f % 2 ? 1.5 : 0; // tread pattern shifts between frames
  for (const side of [-1, 1]) {
    s.rect(-9, side * 6.5 - 2.5, 17, 5, 'tread', 1);
    for (let k = -9 + o; k < 8; k += 3) s.rect(k, side * 6.5 - 2.5, 1, 5, 'boot', 1.2);
  }
  s.poly([[-9, -4.5], [4, -5], [7.5, -3], [7.5, 3], [4, 5], [-9, 4.5], [-10, 0]], 'team', 3);
  s.poly([[-8, -3], [-1.5, -3.5], [-1.5, 3.5], [-8, 3]], 'dark', 3.3);   // hopper
  s.rect(-7, -2, 4.5, 4, 'plate', 3.1);
  s.rect(-8.5, -4.6, 7.5, 1, 'hazard', 3.5); s.rect(-8.5, 3.6, 7.5, 1, 'hazard', 3.5);
  s.poly([[0, -4], [4.5, -4], [6.5, -2], [6.5, 2], [4.5, 4], [0, 4]], 'trim', 4.6); // cab
  s.rect(3.6, -2.4, 2, 4.8, 'glass', 5.2);
  s.line(6.5, -2.5, 11, -4, 2, 'steel', 3.2);     // claw arms
  s.line(6.5, 2.5, 11, 4, 2, 'steel', 3.2);
  s.poly([[10, -6], [13, -4.5], [11.5, -2.5]], 'barrel', 3.4); s.poly([[10, 6], [13, 4.5], [11.5, 2.5]], 'barrel', 3.4);
}

/** Trooper: a rifleman seen from above, legs striding. 32x32 cell. */
function trooper(s, f) {
  const stride = [0, 4, 0, -4][f % 4];
  s.ellipse(1 + stride, -2.6, 2.6, 1.8, 'boot', 1); s.ellipse(1 - stride, 2.6, 2.6, 1.8, 'boot', 1);
  s.ellipse(-0.5, 0, 4, 6.5, 'team', 3, 1.5);       // shoulders / armour
  s.rect(-4.5, -3, 2.5, 6, 'trim', 3.6);            // backpack
  s.ellipse(3, 3.4, 2.2, 1.7, 'team', 3.8);         // arms forward
  s.ellipse(3, -2.4, 2, 1.6, 'team', 3.8);
  s.rect(1.5, 1.6, 8.5, 2, 'barrel', 4.4);          // rifle
  s.rect(8.5, 1.8, 2.5, 1.6, 'steel', 4.5);
  s.circle(0, 0, 3.2, 'steel', 4.8, 1.2);           // helmet
  s.rect(1.6, -1.3, 1.5, 2.6, 'glass', 5.8);        // visor
}

/** Vanguard: a heavy two-legged walker with twin cannons. 48x48 cell. */
function vanguard(s, f) {
  const stride = [0, 5, 0, -5][f % 4];
  for (const [side, st] of [[-1, stride], [1, -stride]]) {
    s.rect(-4 + st, side * 10 - 3, 10, 6, 'plate', 1);
    s.rect(4 + st, side * 10 - 3.5, 4, 7, 'boot', 1.3);
    s.line(0, side * 6, st, side * 10, 4, 'steel', 2);
  }
  s.poly([[-11, -9], [8, -10], [13, -5], [13, 5], [8, 10], [-11, 9], [-14, 0]], 'team', 4);
  s.poly([[-9, -6], [4, -7], [4, 7], [-9, 6]], 'plate', 5);
  s.rect(-7, -4, 8, 8, 'dark', 5.4);
  for (const side of [-1, 1]) { s.rect(2, side * 5.5 - 2, 17, 4, 'barrel', 6); s.rect(17, side * 5.5 - 1.5, 4, 3, 'steel', 6.2); s.rect(4, side * 5.5 - 2.5, 6, 5, 'trim', 6.4); }
  s.circle(0, 0, 4.5, 'team', 7, 1.5);
  s.rect(1.5, -1.5, 2.5, 3, 'glass', 8.6);
}

export const UNIT_ART = {
  harvester: { cell: 32, frames: 2, draw: harvester },
  trooper: { cell: 32, frames: 4, draw: trooper },
  vanguard: { cell: 48, frames: 4, draw: vanguard },
};

/** Returns [{ name, img, anchor }] for every unit, team, facing and frame. */
export function unitSprites() {
  const out = [];
  for (const [kind, art] of Object.entries(UNIT_ART)) for (let team = 0; team < 2; team++)
    for (let dir = 0; dir < FACINGS; dir++) for (let f = 0; f < art.frames; f++) {
      const s = new Sprite(art.cell, art.cell).frame(art.cell / 2, art.cell / 2, dir / FACINGS * Math.PI * 2);
      art.draw(s, f);
      out.push({ name: `${kind}_${team}_${dir}_${f}`, img: shade(s, ramps(team), { outline: OUTLINE }), anchor: { x: 0.5, y: 0.5 } });
    }
  return out;
}
