// The Endfall palette. Ramps run dark → light; the middle entry is the base tone. Documented in docs/ART.md.
export const OUTLINE = '#0b0f16';

export const TEAMS = [
  { name: 'ally', team: ['#5a3a0c', '#9a6212', '#d98c1a', '#f5a524', '#ffd27a'], trim: ['#b88a3a', '#f0c879', '#fff1c7'] },
  { name: 'foe', team: ['#4d1028', '#86203f', '#c23664', '#e2457a', '#ff8bb0'], trim: ['#b0506f', '#ff9cbc', '#ffe0ea'] },
];

export const RAMPS = {
  steel: ['#1c2330', '#2b3443', '#3c4759', '#55627a', '#7a879e'],
  dark: ['#0f141c', '#161c27', '#1f2734', '#2a3444'],
  glass: ['#1d3b4a', '#2f6b80', '#5fb4c9', '#bff0ff'],
  boot: ['#0c0f14', '#151a21', '#1f252f'],
  tread: ['#14171d', '#262c36', '#3a4250'],
  barrel: ['#161a21', '#232a35', '#363f4d'],
  shard: ['#0f4f4a', '#1f8a80', '#4fd1c5', '#a8f5ec', '#e9fffb'],
  ether: ['#2e1f57', '#4f3a91', '#a78bfa', '#d7c8ff', '#f4efff'],
  ventRim: ['#1a1428', '#2a2140', '#3e3160', '#5b4a8a'],
  concrete: ['#20262f', '#2c333e', '#3a424f', '#4c5564', '#636d7e'],
  plate: ['#262b33', '#343a45', '#454d5a', '#5b6474'],
  hazard: ['#3a2a08', '#c9921d', '#f2c84b'],
  light: ['#fff4c2'],
  fire: ['#7a1d0a', '#d1461a', '#ff8a2a', '#ffc94d', '#fff2b0'],
  smoke: ['#1b1e24', '#2a2f37', '#3c424c', '#555c68'],
};

// Terrain
export const GROUND = ['#121925', '#161f2d', '#1a2434', '#1e293b', '#233045'];
export const ROCK = ['#1d2431', '#273042', '#323d52', '#3f4b63', '#55627c', '#7584a0'];
