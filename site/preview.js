// What a shared room link shows in a chat or a feed (WhatsApp, Discord, iMessage, X: their Open Graph and Twitter
// cards). index.html's head carries the site's card (title, description, image, url), served as a file like the rest of
// the game (no Worker: site/wrangler.toml), so every link to the game's page, `?room=` and `?vs=` among them, shows the
// site's card. SHARE LINK in a room gives the room's card address instead, `/r/CODE`: not a file, so site/worker.js
// answers it with `roomPage`, a small page of the room's own card that sends a browser on to the room, `/?room=CODE`.
// Pure, no Workers runtime: the worker imports it, test/site-preview.test.js tests it. A module of its own: a Worker's
// entry module may export only handlers.
import { ALPHABET, LETTERS, SITE, ROOM_PATH, parseCode, showCode } from '../src/net/roomcode.js';

/** The game's one address (worker.js sends www and http here). */
export const ORIGIN = SITE;
export { ROOM_PATH };

/** The relay's room codes: six letters of this alphabet (src/net/roomcode.js, which the relay and the lobby use too).
 *  No vowels, so a valid code never spells a word, and anything else is not a room. */
export const ROOM_ALPHABET = ALPHABET;
export const ROOM_LETTERS = LETTERS;

/** The room a card address names (`/r/CODE`: the path after ROOM_PATH, one segment, a trailing slash allowed), read as
 *  the client reads a code (any case, a hyphen or spaces ignored: roomcode.js parseCode), and only if it is a code the
 *  relay could have made: else null. Nothing of the address reaches the page but these six letters. */
export function roomCode(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith(ROOM_PATH)) return null;
  let rest = pathname.slice(ROOM_PATH.length).replace(/\/$/, '');
  try { rest = decodeURIComponent(rest); } catch { return null; }
  return rest.includes('/') ? null : parseCode(rest) || null;
}

/** The site's card fields a room's card keeps (index.html's head says the same: test/site-preview.test.js). */
export const SITE_CARD = {
  siteName: 'Ebbfall',
  image: `${ORIGIN}/og.png`,
  imageType: 'image/png',
  imageWidth: '1200',
  imageHeight: '630',
  imageAlt: "Ebbfall: a medieval kingdom's archers and knights against an expedition's bots and drones",
};

/** A room's card: its title, description and url (the card's own address, which a crawler keeps), and `go`, the game's
 *  page for the room. Null for anything that is not a room's code. */
export function roomCard(code) {
  const c = parseCode(code);
  return c ? {
    title: `Join my Ebbfall game: room ${showCode(c)}`,
    description: 'Tap to join the room and play with me in your browser: free, nothing to install.',
    url: `${ORIGIN}${ROOM_PATH}${c}`,
    go: `/?room=${c}`,
  } : null;
}

/**
 * The script of a room's card page: on to the room, the code read from the address (`/r/CODE` -> `/?room=CODE`; the
 * Worker serves the page only for a valid code, and the client reads it again). A script and not a meta refresh: link
 * crawlers run no script, so they keep this page's card, where some follow a refresh to the game's page and its
 * site card. One fixed text, so the CSP allows it by its hash (cache.js CARD_SCRIPT_HASH: test/site-csp.test.js).
 */
export const CARD_SCRIPT = "location.replace('/?room=' + location.pathname.split('/')[2] + location.hash);";

/** Text that is safe in an attribute and as an element's text without escaping (a last guard: the cards are written by
 *  the code above, and a link's own text gets in only through a check like roomCode's). */
const SAFE = /^[^<>&"'\u0000-\u001f]*$/;

/** The page answering a room's card address: the room's card in its head, a script on to the room, and a link for
 *  whoever has scripts off. Null for anything that is not a room's code. */
export function roomPage(code) {
  const card = roomCard(code), s = SITE_CARD;
  if (!card || !Object.values(card).every(v => SAFE.test(v))) return null;
  const meta = (k, v, attr = k.startsWith('og:') ? 'property' : 'name') => `<meta ${attr}="${k}" content="${v}">`;
  const alt = s.imageAlt; // (a constant, as index.html writes it: no double quote or markup)
  return [
    '<!doctype html>', '<html lang="en">', '<head>', '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${card.title}</title>`,
    meta('robots', 'noindex'),
    meta('description', card.description),
    meta('og:type', 'website'), meta('og:site_name', s.siteName),
    meta('og:title', card.title), meta('og:description', card.description), meta('og:url', card.url),
    meta('og:image', s.image), meta('og:image:type', s.imageType), meta('og:image:width', s.imageWidth), meta('og:image:height', s.imageHeight), meta('og:image:alt', alt),
    meta('twitter:card', 'summary_large_image'),
    meta('twitter:title', card.title), meta('twitter:description', card.description),
    meta('twitter:image', s.image), meta('twitter:image:alt', alt),
    `<script>${CARD_SCRIPT}</script>`,
    '</head>',
    `<body><p><a href="${card.go}">${card.title}</a></p></body>`,
    '</html>', '',
  ].join('\n');
}
