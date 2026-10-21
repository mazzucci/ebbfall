# Endfall

A browser real-time strategy game in the 1998 mold: mine shards and ether, build supply, raise an army, and level
the enemy Command Core before their waves level yours. One faction, one map, one opponent. Pre-alpha.

**Play in your browser:** https://mazzucci.github.io/endfall/ (desktop or phone in landscape, nothing to install).
Every merge to `main` is built and published there by GitHub Actions.

To run it from source:

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # headless simulation tests
```

**Mouse:** left-click or drag to select, right-click to move / attack / gather / set a rally point. `A` attack-move,
`S` stop, `H` hold, `B` build (with Harvesters selected), `Ctrl`+`1`–`9` saves a control group, `Home` jumps to
your Core. `Backspace` (or the browser's back gesture) asks before leaving a game.

**Units:** Harvesters mine and build. The Barracks trains Troopers (shoot ground and air), Lancers (anti-air missiles)
and Medics (heal infantry, need a War Forge); the War Forge trains Vanguards (heavy, ground only); the Airfield trains
Wasps, gunships that fly over cliffs and buildings. Turrets hit ground and air.

**Zoom:** pinch on touch screens, Ctrl+wheel or trackpad pinch with a mouse.

**Phones:** the game goes full screen in landscape when you start. On iPhone, use Share → Add to Home Screen.

**Touch:** tap or drag a box to select; tap the ground to move, tap an enemy to attack, tap a shard field to gather.
Two fingers pan. Drag on the minimap to scroll.

The simulation (Rust, `crates/endfall-sim/`, compiled to WebAssembly) is deterministic and runs without a browser; the plan is lockstep multiplayer on top of
it. See `docs/PLAN.md` for the roadmap and `CLAUDE.md` for how the code is organised.

## License

MIT, see [LICENSE](LICENSE).
