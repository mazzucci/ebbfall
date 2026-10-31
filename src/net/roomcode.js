// Room codes (docs/MULTIPLAYER.md, Security): six letters of ALPHABET, 20^6 = 64 million codes, shown and said in two
// threes, BCD-FGH. One module for every place that makes, reads or shows one: the relay (relay/worker.js and
// relay/server.mjs make them), the lobby (src/client/online.js reads what is typed or linked) and a room link's card
// (site/preview.js). Pure, no imports. The links carry the code without the hyphen (`?room=BCDFGH`); a code is read
// whatever its case, with or without the hyphen or spaces.

/** No vowels (a code never spells a word) and no look-alikes (no O or 0, no I or 1). */
export const ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
export const LETTERS = 6;
const CODE = new RegExp(`^[${ALPHABET}]{${LETTERS}}$`);
const OLD = new RegExp(`^[${ALPHABET}]{4}$`);

/** A new code: `random()` returns a uniform 32-bit unsigned integer (crypto.getRandomValues; the modulo's bias is
 *  2^32 mod 20 in 2^32, nothing). */
export const newCode = (random) => Array.from({ length: LETTERS }, () => ALPHABET[random() % ALPHABET.length]).join('');

/** A code as typed or linked: upper-cased, spaces and hyphens dropped; the code (six capitals) if it is one the relay
 *  could have made, else ''. */
export function parseCode(text) {
  const s = typeof text === 'string' && text.length <= 32 ? text.toUpperCase().replace(/[\s-]/g, '') : '';
  return CODE.test(s) ? s : '';
}

/** A code as shown and said: BCD-FGH. */
export const showCode = (code) => `${code.slice(0, 3)}-${code.slice(3)}`;

/** A code of the first format (four letters, until PROTO 6), as an old client sends it. */
export const oldCode = (text) => typeof text === 'string' && OLD.test(text.toUpperCase());
