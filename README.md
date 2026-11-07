# Ebbfall

A classic real-time strategy game on a drained seabed, free in the browser: mine salt, build Excavators on the mine shafts, grow your population, raise an army, and level
the enemy Lighthouse before their waves level yours. Two peoples (the Harbour and the alien Vael, fighting over a drained seabed's salt), up to eight players (you and one to seven AIs, each at its own level, free for all or in teams of any shape, or friends over the Internet with AIs in the empty seats), twelve maps of three sizes (for up to two, four or eight players, any of them for fewer: a duel on an eight-player map too; a random one of each size). Pre-alpha.

**Play in your browser:** https://ebbfall.com/ (desktop or phone in landscape, nothing to install).
Every merge to `main` is built and published there by GitHub Actions. **Offline:** once the page has been opened, the
game keeps working with no connection (a service worker stores every file; PLAY OFFLINE, on the first page once
installed and on About, says whether it is all there); INSTALL on the menu (the browser's prompt in Chrome and Edge, how
to Add to Home Screen on iPad and iPhone) launches it like an app. A new version
installs itself the next time you open the game online.

To run it from source:

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # headless simulation tests
```

**Mouse and keyboard:** left-click or drag to select, right-click to move / attack / gather / set a rally point; hold
the middle button and drag to move the map. Two keyboard schemes, chosen in OPTIONS (the menu's first page or the pause
card, with a mouse): **Classic** moves the map with the arrow keys or the screen's edge, and each command has its own
letter (`A` attack-move, `S` stop, `H` hold, `B` build with Riggers selected); **WASD** moves the map with `W` `A`
`S` `D` whatever is selected, and a command's key is its button's place on the card (`E` `R` `T` the top row, `F` `G`
`H` the middle one, `C` `V` `B` the bottom one). In both, `Ctrl`+`1`–`9` saves a control group, `Q` selects the army,
`Space` looks at the last attack, `Home` jumps to your Lighthouse, `P` pauses. `Backspace` (or the browser's back gesture)
asks before leaving a game.

**Units:** Riggers mine, build and repair. The Crew Hall trains Pickets (line infantry, ground only; they Dig In for more
reach once Sandbags is researched), Harpooners (harpoons, strongest against flyers, that slow what they hit) and Menders (heal infantry). The Slipway builds
Breakwaters (armoured walkers for the front line that beach themselves where they fight: armour 6 and a splashing gun, a light gun on the move), Anchor Guns (artillery that fires
only when anchored: the longest reach on the ground and a heavy splash, but a blind ring close in, ground only, and it
fires only at what your side can see; under way, no gun at all) and Netters (fast ground missile vehicles that shoot only
flyers: the escort against air). Menders and the vehicles need a Workshop, which researches weapon and armor upgrades.
The Loft trains Kites, light jets that fly over cliffs and buildings, and Spyglasses, cheap unarmed flying scouts that
spot hidden units. Lookouts hit ground and air. The Vael: Glints mine and grow buildings, staying with each until it stands; the Cradle grows
Needles (fast blades), Lenses (ranged, ground and air, with Surge), Conchs (heavy shells that Surface past a line) and
Tenders (they mend); the Gyre sends out Petrels (flyers, hidden once Seaglass is researched), Undertows (blades that
lurk: hidden while still, so put them on Hold to lie in wait) and the Argonaut, a capital barge whose lantern spots what
hides. A unit's button names what it fights best beside and what beats it.

**Zoom:** pinch on touch screens, Ctrl+wheel or trackpad pinch with a mouse.

**Pause and after the game:** the pause card shows the clock. Against a friend the game goes on under it; PAUSE FOR
EVERYONE stops it for both of you (three a game, five minutes at most, and only you can end your pause early). The end
card gives the result and the time, and the map's story; after a victory against the AI, SHARE sends a friend the same
game as a challenge.

**Phones:** the game goes full screen in landscape when you start. On iPhone, use Share → Add to Home Screen.

**Touch:** tap or drag a box to select; tap the ground to move, tap an enemy to attack, tap a salt field to gather.
Two fingers pan. Drag on the minimap to scroll.

The simulation (Rust, `crates/endfall-sim/`, compiled to WebAssembly) is deterministic and runs without a browser; multiplayer is lockstep on top of
it, through a relay. See `CLAUDE.md` for how the code is organised.

## License

MIT, see [LICENSE](LICENSE).
