// The page build.mjs drives: one unit's model and materials, one frame at a time.
import { setup, shoot, yaw } from './stage.js';
import guard from './guard.js';

const UNITS = { trooper: guard };
let U = null, M = null;
/** Load a unit's sheet and make its materials; `view`: stage.js setup. Returns the poses the model has. */
window.init = async (kind, view) => {
  U = UNITS[kind]; setup(view);
  const sheet = new Image(); sheet.src = '/sheet/' + U.sheet; await sheet.decode();
  M = U.makeMats(sheet); return U.frames;
};
/** Facing k of pose `frame` in a cell of game px: stage.js shoot's { img, mask, edge }. */
window.shot = (k, frame, cell) => { const obj = U.build(M, frame, k); obj.rotation.y = yaw(k); return shoot(obj, cell); };
window.ready = true;
