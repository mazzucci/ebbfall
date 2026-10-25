// The end screen's army chart: both sides' army value over the game as two lines, no numbers (the shape tells the
// story: who was ahead, when a fight turned).

/** SVG markup for `mine` and `theirs` (army values sampled every 10 s), `w` x `h` px. */
export function armyChart(mine, theirs, w = 320, h = 90) {
  const n = Math.max(mine.length, theirs.length);
  if (n < 2) return '';
  const top = Math.max(1, ...mine, ...theirs), pad = 4;
  const line = (vals) => vals.map((v, i) => `${(pad + i / (n - 1) * (w - 2 * pad)).toFixed(1)},${(h - pad - v / top * (h - 2 * pad)).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Army strength over the game: yours and the enemy's">`
    + `<line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="var(--line2)"/>`
    + `<polyline points="${line(theirs)}" fill="none" stroke="var(--foe)" stroke-width="2" stroke-linejoin="round"/>`
    + `<polyline points="${line(mine)}" fill="none" stroke="var(--ally)" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
}
