// The controls video's beats as data (tools/controls/record.mjs): one scene, a small Kingdom base on a landscape
// phone (Gold Crown's first start), then six beats in the docs' order (tools/docs/copy/how-to-play.html, the touch table, its words shortened):
// select and move, a group by a hold then a box, all of one type by a double-tap, ARMY and HOME, a drag and a pinch,
// Deselect and a button held for its details. Each beat: its length, its captions ({ at, html }: the label in <b>;
// `until`: gone before the beat's end; `still`: where the review sheet samples it), and its strokes (touch.mjs: fingers on the real game), times in seconds from the beat's start.
import { tap, doubleTap, holdDrag, drag, pinch, press } from './touch.mjs';

/**
 * The scene (in the page, on window.S: tools/trailer/stage.mjs `helpers`): the Kingdom's Castle on Gold Crown's first
 * start, an open pocket well inside the map (HOME and a pan never show ground past the map's edge), its mine west of
 * it with Villagers mining, a Barracks east, two Cottages north, eight soldiers in a loose group south east of the
 * Castle and one Knight apart, south of it. The camera (`look`, at the phone's start zoom) has the Castle upper left
 * and the group right of the middle, above the command card, so that ARMY's second tap and HOME each move the view.
 * Returns the units' ids and the points the beats tap (world px).
 */
export function scene() {
  const { e, G, K, hqOf, spawn, place, gather, byId } = window.S;
  const hq = hqOf(K), at = (dx, dy) => ({ x: hq.x + dx, y: hq.y + dy });
  gather(K); e.setResources(K, 5000, 0);
  for (let i = 0; i < 2; i++) spawn(K, 'harvester', at(-120 + i * 30, 40));
  place(K, 'depot', at(140, -150)); place(K, 'depot', at(-200, -120)); place(K, 'barracks', at(300, 40));
  e.skip(70); gather(K); e.skip(70); gather(K);
  const c = at(190, 115); // (the group's middle: canvas (520, 175), its box below the caption and above the console and the card)
  const group = ['trooper', 'trooper', 'trooper', 'lancer', 'lancer', 'lancer', 'knight', 'knight'].map((k, i) => spawn(K, k, { x: c.x + ((i % 3) - 1) * 38, y: c.y + (Math.floor(i / 3) - 1) * 42 + (i % 3 === 1 ? 12 : 0) }));
  const knight = spawn(K, 'knight', at(-40, 175));
  if (180 > G.time) e.skip(180 - G.time);
  e.setResources(K, 470, 0);
  const barracks = G.bldgs.find(b => b.team === K && b.type === 'barracks');
  return {
    group, knight, guards: group.slice(0, 3), barracks: barracks?.id, hq: hq.id,
    center: c, walkTo: at(95, 85), look: at(92, 135), // (the Knight walks up to the Castle's corner, clear of the group's box) hqAt: { x: hq.x, y: hq.y }, ids: [...group, knight].map(id => [id, byId(id)?.type]),
  };
}

const cap = (at, label, text) => ({ at, html: `<b>${label}</b> ${text}` });


/** The beats, in the docs' order; each caption stays up until the next, so the game's answer shows under it. `a` is
 *  what `scene` returned. */
export const BEATS = [
  { id: 'select', seconds: 6.4,
    caps: [cap(0, 'Select', 'tap a unit'), cap(2.6, 'Move', 'tap the ground')],
    strokes: (a) => [...tap(1.0, { unit: a.knight }), ...tap(3.4, { world: a.walkTo })] },
  { id: 'group', seconds: 6.0,
    caps: [cap(0, 'Select a group', 'hold until the ring fills…'), cap(1.85, 'Select a group', '…then drag a box')],
    strokes: (a) => holdDrag(1.0, { units: a.group, pad: 22, corner: 'br' }, null, { rest: 0.85, move: 1.0, settle: 0.3 }) }, // (held below right of the group, on open ground, dragged up left)
  { id: 'type', seconds: 4.6,
    caps: [cap(0, 'All of one type', 'double-tap one')],
    strokes: (a) => doubleTap(1.1, { unit: a.guards[1] }) },
  { id: 'army', seconds: 7.6,
    caps: [cap(0, 'ARMY', 'your whole army&nbsp;· again: look at it'), cap(4.0, 'HOME', 'looks at your base')],
    strokes: () => [...tap(1.0, { el: '#btnArmy' }), ...tap(1.7, { el: '#btnArmy' }), ...tap(4.8, { el: '#btnHome' })] },
  { id: 'look', seconds: 7.6,
    caps: [cap(0, 'Look around', 'drag with one finger'), cap(3.3, 'Zoom', 'pinch')],
    strokes: () => [...drag(0.9, { x: 560, y: 240 }, { dx: -150, dy: -80 }, { move: 1.1, settle: 0.35 }), ...pinch(4.0, { x: 400, y: 229 }, 110, 165, { move: 1.2, settle: 0.4 })] },
  { id: 'letgo', seconds: 9.0,
    caps: [cap(0, 'Let go', 'Deselect on the card'), { ...cap(2.5, 'Hold a button', 'what it does and costs'), until: 4.7, still: 7.4 }], // (the caption goes as the cut punches in on the details; the sheet's still while they show)
    strokes: (a) => [...tap(1.1, { card: 'Deselect' }), ...tap(3.1, { bldg: a.barracks }), ...press(4.2, { card: 'Guard' }, 2.6)] },
];
