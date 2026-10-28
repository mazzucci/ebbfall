// What this device remembers (localStorage, under endfall.*): the menu's choices, the sound, the record, a name for
// online play. Private browsing or a full disk only means nothing is remembered.
export const store = {
  get: (k) => { try { return localStorage.getItem('endfall.' + k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem('endfall.' + k, v); } catch { /* private mode */ } },
};
