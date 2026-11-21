// The desktop controls video's beats as data (tools/controls/record.mjs `--set desktop`): the phone's scene (beats.mjs)
// on a 1280x720 window at the docs' desktop zoom, with an idle Villager by the Castle,
// then seven beats in the docs' desktop tables' order and words (tools/docs/copy/how-to-play.html, Mouse and Keyboard,
// the Classic scheme): a box, a right-click, a double-click, A then a click, B then a building then a click, a control
// group saved and recalled, the arrow keys. `WASD_BEATS` (`--set desktop-wasd`, the WASD scheme): W A S D move the map
// while units stay selected, and the card's E R T keys. Each beat: its length, its captions ({ at, html }: the label in
// <b>), and its strokes (mouse.mjs: the cursor and the keys on the real game), times in seconds from the beat's start.
import { click, rightClick, doubleClick, drag, key } from './mouse.mjs';

/**
 * The scene (in the page, on window.S: tools/trailer/stage.mjs `helpers`): as the phone's (beats.mjs `scene`: the
 * Castle on Gold Crown's first start, its mine and Villagers, a Barracks east, two Cottages north, eight soldiers south
 * east, a Knight apart), plus an idle Villager below the Castle (the Build beat's); no enemy (one shooting from off
 * screen raises the ATTACK alert over the map). The camera at zoom 1.5 (the docs' desktop shots': the units read; the game starts farther
 * out) with the Castle upper left and the group right of the middle, above the command card. Returns the units' ids
 * and the points the beats click (world px), the camera, and where the cursor starts (page px).
 */
export function scene() {
  const { e, G, K, hqOf, spawn, place, gather, byId } = window.S;
  const hq = hqOf(K), at = (dx, dy) => ({ x: hq.x + dx, y: hq.y + dy });
  gather(K); e.setResources(K, 5000, 0);
  for (let i = 0; i < 2; i++) spawn(K, 'harvester', at(-120 + i * 30, 40));
  place(K, 'depot', at(140, -150)); place(K, 'depot', at(-200, -120)); place(K, 'barracks', at(300, 40));
  e.skip(70); gather(K); e.skip(70); gather(K);
  const c = at(190, 115);
  const group = ['trooper', 'trooper', 'trooper', 'lancer', 'lancer', 'lancer', 'knight', 'knight'].map((k, i) => spawn(K, k, { x: c.x + ((i % 3) - 1) * 38, y: c.y + (Math.floor(i / 3) - 1) * 42 + (i % 3 === 1 ? 12 : 0) }));
  const knight = spawn(K, 'knight', at(-40, 175));
  const builder = spawn(K, 'harvester', at(-130, 120)); // (idle: the Build beat's)
  if (180 > G.time) e.skip(180 - G.time);
  e.setResources(K, 470, 0);
  const barracks = G.bldgs.find(b => b.team === K && b.type === 'barracks');
  return {
    group, knight, builder, guards: group.slice(0, 3), barracks: barracks?.id, hq: hq.id,
    center: c, moveTo: at(90, 240), attackAt: at(290, 200), site: at(-150, 235), ground: at(200, 20),
    look: at(92, 135), zoom: 1.5, cursor: { x: 640, y: 300 }, ids: [...group, knight].map(id => [id, byId(id)?.type]),
  };
}

const cap = (at, label, text) => ({ at, html: `<b>${label}</b> ${text}` });

/** The beats, in the docs' desktop tables' order; each caption stays up until the next, so the game's answer shows
 *  under it. `a` is what `scene` returned. */
export const BEATS = [
  { id: 'select', seconds: 2.4,
    caps: [cap(0, 'Select', 'left-click, or drag a box')],
    strokes: (a) => drag(0.5, { units: a.group, pad: 30, corner: 'tl' }, null, { move: 0.9 }) },
  { id: 'move', seconds: 2.2,
    caps: [cap(0, 'Move, attack, mine', 'right-click')],
    strokes: (a) => rightClick(0.6, { world: a.moveTo }) },
  { id: 'type', seconds: 2.2,
    caps: [cap(0, 'All of one type', 'double-click one')],
    strokes: (a) => doubleClick(0.7, { unit: a.knight }) },
  { id: 'attack', seconds: 2.6,
    caps: [cap(0, 'Attack-move', 'A, then click')],
    strokes: (a) => [...key(0.5, 'a'), ...click(1.1, { world: a.attackAt })] },
  { id: 'build', seconds: 3.2,
    caps: [cap(0, 'Build', 'B, pick a building, then click')],
    strokes: (a) => [...click(0.4, { unit: a.builder }), ...key(1.0, 'b'), ...key(1.5, 'w'), ...click(2.3, { world: a.site })] },
  { id: 'group', seconds: 3.2,
    caps: [cap(0, 'Control group', 'Ctrl+1 saves, 1 recalls')],
    strokes: (a) => [...drag(0.3, { units: a.group, pad: 30, corner: 'tl' }, null, { move: 0.6, glide: 0.3 }), ...key(1.4, '1', { ctrl: true }), ...click(2.0, { world: a.ground }), ...key(2.6, '1')] },
  { id: 'pan', seconds: 2.2,
    caps: [cap(0, 'Move the map', 'arrow keys, or the screen’s edge')],
    strokes: () => key(0.5, 'ArrowRight', { hold: 0.6 }) },
];

/** The WASD scheme's one beat (its own recording): a box, W and D move the map with the eight still selected, then
 *  E (the card's first key: Attack) and a click attack-move them, and R (its second: Hold) holds them. (W held 0.2 s,
 *  D 0.3: edge to edge, 0.4 s of W took the eight down under the selection panel; the attack-move's click a point on
 *  the screen, not in the world, so that it lands on the map wherever the pan left it.) */
export const WASD_BEATS = [
  { id: 'wasd', seconds: 3.6,
    caps: [cap(0, 'WASD', 'W A S D move the map; E R T the card’s top row')],
    strokes: (a) => [...drag(0.3, { units: a.group, pad: 30, corner: 'tl' }, null, { move: 0.6, glide: 0.3 }), ...key(1.2, 'w', { hold: 0.2 }), ...key(1.7, 'd', { hold: 0.3 }), ...key(2.4, 'e'), ...click(2.9, { x: 840, y: 330 }), ...key(3.3, 'r')] }, // (the click on the screen, above right of the eight, wherever the pan left them)
];
