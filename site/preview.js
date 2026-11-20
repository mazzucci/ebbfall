// What a shared room or challenge link shows in a chat or a feed (WhatsApp, Discord, iMessage, X: their Open Graph and
// Twitter cards). index.html's head carries the site's card (title, description, image, url), served as a file like the
// rest of the game (no Worker: site/wrangler.toml), so every link to the game's page, `?room=` and `?vs=` among them,
// shows the site's card. On the site, SHARE LINK in a room gives the room's card address instead, `/r/CODE`, and SHARE
// after a victory the challenge's, `/vs/CODE`: not files, so site/worker.js answers them with `roomPage` and
// `challengePage`, a small page of the link's own card that sends a browser on to the game's page, `/?room=CODE` or
// `/?vs=CODE`. Pure, no Workers runtime: the worker imports it, test/site-preview.test.js tests it. A module of its own:
// a Worker's entry module may export only handlers.
import { ALPHABET, LETTERS, SITE, ROOM_PATH, parseCode, showCode } from '../src/net/roomcode.js';
import * as challenge from '../src/client/challenge.js';

/** The game's one address (worker.js sends www and http here). */
export const ORIGIN = SITE;
export { ROOM_PATH };
/** A challenge's card address: VS_PATH + its code (src/client/challenge.js `link` gives it on the site). */
export const VS_PATH = challenge.VS_PATH;

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

/** The challenge a card address names (`/vs/CODE`: the path after VS_PATH, one segment, a trailing slash allowed), only if
 *  it is exactly a code the game makes (challenge.js `decode`: strict, so nothing is decoded or tidied here: the
 *  address's own characters, letters, digits and dots, are the code the page goes on with): else null. */
export function challengeCode(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith(VS_PATH) || pathname.length > VS_PATH.length + 65) return null;
  const rest = pathname.slice(VS_PATH.length).replace(/\/$/, '');
  return challenge.decode(rest) ? rest : null;
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

/** A challenge's card: the setup it names, in words made from its values alone (challenge.js `card`), its card address
 *  as its url, and `go`, the game's page with the challenge. Null for anything that is not exactly a challenge's code. */
export function challengeCard(code) {
  const c = challenge.decode(code);
  return c ? { ...challenge.card(c), url: `${ORIGIN}${VS_PATH}${code}`, go: `/?${challenge.PARAM}=${code}` } : null;
}

/**
 * The script of a card page: on to the game's page, the code read from the address (`/r/CODE` -> `/?room=CODE`,
 * `/vs/CODE` -> `/?vs=CODE`; the Worker serves the page only for a valid code, and the client reads it again). A script
 * and not a meta refresh: link crawlers run no script, so they keep this page's card, where some follow a refresh to the
 * game's page and its site card. One fixed text for both, so the CSP allows it by its hash (cache.js script-src:
 * test/site-csp.test.js).
 */
export const CARD_SCRIPT = "var p = location.pathname.split('/'); location.replace('/?' + (p[1] === 'vs' ? 'vs' : 'room') + '=' + p[2] + location.hash);";

/** Text that is safe in an attribute and as an element's text without escaping (a last guard: the cards are written by
 *  the code above, and a link's own text gets in only through a check like roomCode's). */
const SAFE = /^[^<>&"'\u0000-\u001f]*$/;

/** The page answering a room's card address: the room's card in its head, a script on to the room, and a link for
 *  whoever has scripts off. Null for anything that is not a room's code. */
export const roomPage = (code) => cardPage(roomCard(code));
/** The page answering a challenge's card address, the same way. Null for anything that is not a challenge's code. */
export const challengePage = (code) => cardPage(challengeCard(code));

/** A card page: `card` ({ title, description, url, go }) in its head, the script on, a link; null for no card. */
function cardPage(card) {
  const s = SITE_CARD;
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
