// What a shared link to the game's page shows in a chat or a feed (WhatsApp, Discord, iMessage, X: their Open Graph and
// Twitter cards). index.html's head carries the site's card (title, description, image, url); a link with a card of its
// own (a room's, `?room=CODE`; a challenge's, `?vs=`, SHARE after a victory) changes some of those fields, which site/worker.js writes into the page with
// HTMLRewriter. Pure, no Workers runtime: the worker imports it, test/site-preview.test.js tests it. A module of its
// own: a Worker's entry module may export only handlers.
import * as challenge from '../src/client/challenge.js';

/** The game's one address (worker.js sends www and http here). */
export const ORIGIN = 'https://ebbfall.com';

/** The relay's room codes: four letters of this alphabet (relay/worker.js and relay/server.mjs make them; a test keeps
 *  the three equal). No vowels, so a valid code never spells a word, and anything else is not a room. */
export const ROOM_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
export const ROOM_LETTERS = 4;
const ROOM = new RegExp(`^[${ROOM_ALPHABET}]{${ROOM_LETTERS}}$`);

/** The room a link opens: `?room=CODE` (or `?join=CODE`, the links before 2026-10-30), as the client reads it (the
 *  first of the two, upper-cased), and only if it is a code the relay could have made: else null. Nothing of the query
 *  reaches the page but these four letters. */
export function roomCode(params) {
  const code = (params.get('room') || params.get('join') || '').toUpperCase();
  return ROOM.test(code) ? code : null;
}

/**
 * The links with a card of their own, in order (the first that answers wins): each takes the page's URL and returns the
 * fields it changes ({title, description, url}, any of them; the image and the rest stay the site's), or null when the
 * link is not of its kind.
 */
const LINKS = [
  function room(url) {
    const code = roomCode(url.searchParams);
    return code && {
      title: `Join my Ebbfall game: room ${code}`,
      description: 'Tap to join the room and play with me in your browser: free, nothing to install.',
      url: `${ORIGIN}/?room=${code}`,
    };
  },
  // A challenge (SHARE after a victory against the AI: src/client/challenge.js): the setup it names, in words made from
  // its values alone (a code that is not exactly one the game makes is no challenge), and its link made again from them.
  function vs(url) {
    const c = challenge.decode(url.searchParams.get(challenge.PARAM));
    return c && { ...challenge.card(c), url: challenge.link(c, ORIGIN) };
  },
];

/** Text that is safe in an attribute and as an element's text without escaping (a last guard: the cards are written by
 *  the code above, and a link's own text gets in only through a check like roomCode's). */
const SAFE = /^[^<>&"'\u0000-\u001f]*$/;

/** The card of the link `url` (a URL): the fields it changes, or null for the site's own card (index.html as it is). */
export function preview(url) {
  for (const link of LINKS) {
    const card = link(url);
    if (card) return Object.values(card).every(v => typeof v === 'string' && SAFE.test(v)) ? card : null;
  }
  return null;
}

/** Where each field of a card goes in index.html's head: the `content` of these <meta> tags. */
export const TAGS = {
  title: ['meta[property="og:title"]', 'meta[name="twitter:title"]'],
  description: ['meta[property="og:description"]', 'meta[name="twitter:description"]'],
  url: ['meta[property="og:url"]'],
};

/** A card's edits to the page: [selector, content] for each tag a field of it sets. */
export const edits = (card) => Object.entries(TAGS).flatMap(([k, sels]) => (card?.[k] ? sels.map(s => [s, card[k]]) : []));
