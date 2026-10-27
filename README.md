# Ebbfall

A browser real-time strategy game in the 1998 mold: mine shards and ether, build supply, raise an army, and level
the enemy Command Core before their waves level yours. Two races (the human colonists and the alien Vael), three maps (and a random one), one opponent at four levels. Pre-alpha.

**Play in your browser:** https://ebbfall.com/ (desktop or phone in landscape, nothing to install).
Every merge to `main` is built and published there by GitHub Actions. **Offline:** once the page has been opened, the
game keeps working with no connection (a service worker stores every file); add it to your home screen to launch it
like an app. A new version installs itself the next time you open the game online.

To run it from source:

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # headless simulation tests
```

**Mouse:** left-click or drag to select, right-click to move / attack / gather / set a rally point. `A` attack-move,
`S` stop, `H` hold, `B` build (with Harvesters selected), `Ctrl`+`1`–`9` saves a control group, `Home` jumps to
your Core. `Backspace` (or the browser's back gesture) asks before leaving a game.

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
