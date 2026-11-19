// The controls video's beats as data (tools/controls/record.mjs): one scene, a small Kingdom base on a landscape
// phone, then six beats in the docs' order (tools/docs/copy/how-to-play.html, the touch table, its words shortened):
// select and move, a group by a hold then a box, all of one type by a double-tap, ARMY and HOME, a drag and a pinch,
// Deselect and a button held for its details. Each beat: its length, its captions ({ at, html }: the label in <b>),
// and its strokes (touch.mjs: fingers on the real game), times in seconds from the beat's start.
import { tap, doubleTap, holdDrag, drag, pinch, press } from './touch.mjs';

/**
 * The scene (in the page, on window.S: tools/trailer/stage.mjs `helpers`): the Kingdom's Castle in its corner of the
 * map with its mine and Villagers mining, a Barracks beside it and two Cottages, eight soldiers in a loose group on
 * the open ground left of the Castle and one Knight apart from them, by its wall. The camera (`look`, at the phone's
 * start zoom) has the Castle upper right and the group left of the middle, so that ARMY's second tap and HOME each
 * move the view. Returns the units' ids and the points the beats tap (world px).
 */
export function scene() {
  const { e, G, eng, K, hqOf, spawn, place, gather, byId } = window.S;
  const hq = hqOf(K), at = (dx, dy) => ({ x: hq.x + dx, y: hq.y + dy }); // (the quarter map, seat 0: the top right corner; open ground left and below)
  gather(K); e.setResources(K, 5000, 0);
  for (let i = 0; i < 2; i++) spawn(K, 'harvester', at(-60 + i * 30, -80));
  place(K, 'depot', at(-150, -170)); place(K, 'depot', at(240, -90)); place(K, 'barracks', at(150, 75));
  e.skip(70); gather(K); e.skip(70); gather(K);
  const c = at(-281, 90); // (the group's middle: canvas (290, 165): its box's top clear of the caption, its bottom of the console)
  const group = ['trooper', 'trooper', 'trooper', 'lancer', 'lancer', 'lancer', 'knight', 'knight'].map((k, i) => spawn(K, k, { x: c.x + ((i % 3) - 1) * 38, y: c.y + (Math.floor(i / 3) - 1) * 42 + (i % 3 === 1 ? 12 : 0) }));
  const knight = spawn(K, 'knight', at(-171, 5));
  if (180 > G.time) e.skip(180 - G.time);
  e.setResources(K, 470, 0);
  const barracks = G.bldgs.find(b => b.team === K && b.type === 'barracks');
  return {
    group, knight, guards: group.slice(0, 3), barracks: barracks?.id, hq: hq.id,
    center: c, walkTo: at(-101, 125), look: at(-149, 120), hqAt: { x: hq.x, y: hq.y }, ids: [...group, knight].map(id => [id, byId(id)?.type]),
  };
}

const cap = (at, label, text) => ({ at, html: `<b>${label}</b> ${text}` });


/** The beats, in the docs' order. `a` is what `scene` returned. */
export const BEATS = [
  { id: 'select', seconds: 6.6,
    caps: [cap(0, 'Select', 'tap a unit'), cap(2.8, 'Move', 'tap the ground')],
    strokes: (a) => [...tap(1.3, { unit: a.knight }), ...tap(3.9, { world: a.walkTo })] },
  { id: 'group', seconds: 6.4,
    caps: [cap(0, 'Select a group', 'hold until the ring fills…'), cap(2.05, 'Select a group', '…then drag a box')],
    strokes: (a) => holdDrag(1.2, { units: a.group, pad: 26, corner: 'br' }, null, { rest: 0.85, move: 1.0, settle: 0.3 }) }, // (held below right of the group, on open ground, dragged up left)
  { id: 'type', seconds: 5.0,
    caps: [cap(0, 'All of one type', 'double-tap one')],
    strokes: (a) => doubleTap(1.4, { unit: a.guards[1] }) },
  { id: 'army', seconds: 8.0,
    caps: [cap(0, 'ARMY', 'your whole army&nbsp;· again: look at it'), cap(4.2, 'HOME', 'looks at your base')],
    strokes: () => [...tap(1.3, { el: '#btnArmy' }), ...tap(2.0, { el: '#btnArmy' }), ...tap(5.3, { el: '#btnHome' })] },
  { id: 'look', seconds: 8.0,
    caps: [cap(0, 'Look around', 'drag with one finger'), cap(3.6, 'Zoom', 'pinch')],
    strokes: () => [...drag(1.0, { x: 480, y: 290 }, { dx: 120, dy: -90 }, { move: 1.1, settle: 0.35 }), ...pinch(4.4, { x: 520, y: 189 }, 110, 185, { move: 1.2, settle: 0.4 })] },
  { id: 'letgo', seconds: 8.6,
    caps: [cap(0, 'Let go', 'Deselect on the card'), cap(2.7, 'Hold a button', 'what it does and costs')],
    strokes: (a) => [...tap(1.2, { card: 'Deselect' }), ...tap(3.4, { bldg: a.hq }), ...press(4.6, { card: 'Villager' }, 1.7)] },
];
