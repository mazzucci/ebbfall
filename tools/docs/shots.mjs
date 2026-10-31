// The docs' in-game screenshots: what each one shows, its size and its words. tools/docs-shots.mjs captures them into
// public/docs-img/shots/ (committed; run by hand, not in CI); the pages (tools/docs/pages.mjs) show each one that is
// there. `frame`: phone portrait, phone landscape or desktop (the phone's in a CSS phone frame); `w` x `h`: the CSS
// size it is captured at (a phone's file is twice that, as a phone draws it; a desktop's that size).
export const SHOTS = {
  battle: { frame: 'landscape', w: 844, h: 390, alt: 'A battle on a phone held sideways: gold Human Troopers, Lancers and a Vanguard, selected, fire on pale Vael Scythes with Prisms behind; the minimap, the selection and the command card along the bottom' },
  siege: { frame: 'desktop', w: 1280, h: 720, alt: 'Four deployed Human Siege Tanks behind a line of Troopers and two Vanguards, as Vael Scythes close in and two Monoliths hang back' },
  umbra: { frame: 'desktop', w: 1280, h: 720, alt: 'Vael Umbras, shadow blades that are always cloaked (their own side sees a shimmer), cutting into a line of Human Troopers in front of two Siege Tanks, with Scythes and Prisms behind them' },
  base: { frame: 'desktop', w: 1280, h: 720, alt: 'A Human base: the Command Core with Supply Depots, a Garrison, a Foundry, a Factory and an Airfield, Ether Rigs on both vents, Harvesters at the shard fields' },
  lobby: { frame: 'portrait', w: 390, h: 844, alt: 'A multiplayer room on a phone: its four-letter code and SHARE LINK, the host, a friend who is ready and a computer seat on the board, the map and READY' },
  menu: { frame: 'portrait', w: 390, h: 844, alt: 'The first page of the menu on a phone: SINGLE PLAYER and MULTIPLAYER, FIRST GAME, HOW TO PLAY, OPTIONS and SAVE OFFLINE, and the links to these docs in its footer' },
};
/** A shot's file name under public/docs-img/shots/. */
export const shotFile = (key) => `${key}.webp`;
