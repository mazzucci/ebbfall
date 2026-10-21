// Where the scenery goes: a deterministic scatter of doodads (sprites rendered by tools/render3d/doodads.js) from
// the map seed. Purely visual, so it lives in the client and never touches the sim. Tall props stand inside rock
// plateaus, which nothing walks on; low props (craters, wrecks, debris) lie on open ground away from the bases,
// the resource fields and cliff edges, and are walked over (the renderer hides one a building is put on).

export const DOODADS = {
  rock: ['boulders_0', 'boulders_1', 'boulders_2', 'spire_0', 'spire_1', 'ruin_0', 'ruin_1'],
  ground: ['crater_0', 'crater_1', 'wreck_0', 'wreck_1', 'debris_0', 'debris_1'],
};

/**
 * @param {number} seed the map seed
 * @param {{ rock: ArrayLike<number>, nodes: { tx: number, ty: number }[] }} map
 * @param {{ tx: number, ty: number }[]} keepClear tiles to stay well away from (the bases' cores)
 * @param {{ MW: number, MH: number, TILE: number, mulberry: (s: number) => () => number }} env
 * @returns {{ name: string, x: number, y: number, tx: number, ty: number, ground: boolean }[]}
 */
export function scatterDoodads(seed, map, keepClear, { MW, MH, TILE, mulberry }) {
  const rnd = mulberry(seed * 13 + 5);
  const rock = (x, y) => x < 0 || y < 0 || x >= MW || y >= MH || map.rock[y * MW + x] !== 0;
  const all = (x, y, r, want) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (rock(x + dx, y + dy) !== want) return false; return true; };
  const near = (list, x, y, d) => list.some(p => (p.tx - x) ** 2 + (p.ty - y) ** 2 < d * d);
  const out = [];
  for (let y = 2; y < MH - 2; y++) for (let x = 2; x < MW - 2; x++) {
    const r = rnd(), pick = rnd(), jx = rnd(), jy = rnd(); // four draws per tile, always, so the layout is stable
    let ground;
    if (all(x, y, 1, true)) {
      if (r > 0.16 || near(out, x, y, 3)) continue;
      ground = false;
    } else if (all(x, y, 1, false)) {
      if (r > 0.02 || near(out, x, y, 5) || near(keepClear, x, y, 11) || near(map.nodes, x, y, 4)) continue;
      ground = true;
    } else continue;
    const list = ground ? DOODADS.ground : DOODADS.rock;
    out.push({ name: list[Math.floor(pick * list.length)], tx: x, ty: y, ground, x: (x + 0.5) * TILE + (jx - 0.5) * 12, y: (y + 0.5) * TILE + (jy - 0.5) * 12 });
  }
  return out;
}
