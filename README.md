# Ebbfall

A browser real-time strategy game in the 1998 mold: mine shards and ether, build supply, raise an army, and level
the enemy Command Core before their waves level yours. Two races (the human colonists and the alien Vael), up to eight players (you and one to seven AIs, each at its own level, free for all or in teams of any shape, or friends over the Internet with AIs in the empty seats), twelve maps of three sizes (for up to two, four or eight players, any of them for fewer: a duel on an eight-player map too; a random one of each size). Pre-alpha.

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
letter (`A` attack-move, `S` stop, `H` hold, `B` build with Harvesters selected); **WASD** moves the map with `W` `A`
`S` `D` whatever is selected, and a command's key is its button's place on the card (`E` `R` `T` the top row, `F` `G`
`H` the middle one, `C` `V` `B` the bottom one). In both, `Ctrl`+`1`–`9` saves a control group, `Q` selects the army,
`Space` looks at the last attack, `Home` jumps to your Core, `P` pauses. `Backspace` (or the browser's back gesture)
asks before leaving a game.

**Units:** Harvesters mine, build and repair. The Garrison trains Troopers (shoot ground and air), Lancers (anti-air
missiles), Medics (heal infantry) and Vanguards (heavy walkers whose shells splash, ground only); Medics and Vanguards
need a Foundry, which researches weapon and armor upgrades. The Airfield trains Wasps, gunships that fly over cliffs
and buildings, and Observers, cheap unarmed flying scouts. Turrets hit ground and air.

**Zoom:** pinch on touch screens, Ctrl+wheel or trackpad pinch with a mouse.

**Pause and after the game:** the pause card shows the clock and the enemy units you have seen in the last minute and
a half. Against a friend the game goes on under it; PAUSE FOR EVERYONE stops it for both of you (three a game, five
minutes at most, and only you can end your pause early). The end card says what beat you and what you saw of their army; WATCH plays the game again from the start,
both sides in view, at up to 8x.

**Phones:** the game goes full screen in landscape when you start. On iPhone, use Share → Add to Home Screen.

**Touch:** tap or drag a box to select; tap the ground to move, tap an enemy to attack, tap a shard field to gather.
Two fingers pan. Drag on the minimap to scroll.

The simulation (Rust, `crates/endfall-sim/`, compiled to WebAssembly) is deterministic and runs without a browser; the plan is lockstep multiplayer on top of
it. See `docs/PLAN.md` for the roadmap and `CLAUDE.md` for how the code is organised.

## License

MIT, see [LICENSE](LICENSE).
