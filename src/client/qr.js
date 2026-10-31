// A link as a QR code: the lobby's QR (online.js), for a friend in the same room to scan the screen with a phone's
// camera and join. online.js imports this module only when QR is tapped, so the encoder is never part of the first
// page's load (and, like every file of the build, the service worker keeps it for offline play). Encoder:
// qrcode-generator (Kazuhiko Arase, MIT); no network. Pure: test/qr.test.js decodes what it draws.
import qrcode from 'qrcode-generator';

/** Error correction M (15% of the code can be lost: glare on a screen, a phone at an angle) with the smallest version
 *  that holds the text. */
export const LEVEL = 'M';
/** The quiet zone round the code, in modules: the standard's four. */
export const QUIET = 4;

/** The QR code of `text` (byte mode) as rows of modules, true where dark. */
export function qrModules(text) {
  const q = qrcode(0, LEVEL);
  q.addData(text, 'Byte');
  q.make();
  const n = q.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c)));
}

/** An SVG of the code: dark modules on a white square that includes the quiet zone, one unit a module. Each row's runs
 *  of dark modules are one rectangle apiece. */
export function qrSvg(text) {
  const m = qrModules(text), size = m.length + 2 * QUIET;
  let d = '';
  m.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      const from = x;
      while (row[x + 1]) x++;
      d += `M${from + QUIET} ${y + QUIET}h${x - from + 1}v1h-${x - from + 1}z`;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/** The SVG as an image's address (for an <img>, whose alt text says what it is). */
export const qrImage = (text) => 'data:image/svg+xml,' + encodeURIComponent(qrSvg(text));
