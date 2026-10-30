// What this device remembers (localStorage, under endfall.*): the menu's choices, the sound, the record, a name for
// online play. Private browsing or a full disk only means nothing is remembered.
export const store = {
  get: (k) => { try { return localStorage.getItem('endfall.' + k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem('endfall.' + k, v); } catch { /* private mode */ } },
};

/** A name is at most this long (the relay's MAX_NAME: relay/room.js cuts a hello's name to it). */
export const MAX_NAME = 16;
/** A player's name as the relay takes it: any characters, trimmed, cut to MAX_NAME and trimmed again ('' for none or
 *  anything not a string). */
export const cleanName = (v) => (typeof v === 'string' ? v.trim().slice(0, MAX_NAME).trim() : '');
/** The player's name on this device (endfall.name), the one key behind every field that shows it: the lobby's NAME and
 *  OPTIONS' NAME. `set` stores it cleaned ('' too: no name yet) and returns what it stored. */
export const playerName = {
  get: () => cleanName(store.get('name')),
  set: (v) => { const n = cleanName(v); store.set('name', n); return n; },
};
