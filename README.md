# Ebbfall

A classic real-time strategy game, free in the browser. Time travel was discovered. Naturally, the first thing we built
was a data center. Now a modern expedition and a medieval kingdom fight over the gold: mine it, build, grow your
population, raise an army, and bring down the enemy's Castle or Data center before their waves bring down yours. Two
peoples (the Kingdom and the Expedition), up to eight players (you and one to seven AIs, each at its own level, free for
all or in teams of any shape, or friends over the Internet with AIs in the empty seats), fourteen maps of three sizes
(for up to two, four or eight players, any of them for fewer: a duel on an eight-player map too; a random one of each
size, and a lake map with a random one of its own). Pre-alpha.

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
letter (`A` attack-move, `S` stop, `H` hold, `B` build with workers selected); **WASD** moves the map with `W` `A`
`S` `D` whatever is selected, and a command's key is its button's place on the card (`E` `R` `T` the top row, `F` `G`
`H` the middle one, `C` `V` `B` the bottom one). In both, `Ctrl`+`1`–`9` saves a control group, `Q` selects the army,
`Space` looks at the last attack, `Home` jumps to your base, `P` pauses. `Backspace` (or the browser's back gesture)
asks before leaving a game.

**Units:** the Kingdom's Villagers mine gold, build and repair; its Market earns gold by itself, with no workers. The
Barracks trains Guards (spearmen, ground only; they Brace for more armor once Shield Drill is researched) and Archers
(ground and air, strongest against flyers, and they slow what they hit). The Stables trains Riders (fast cavalry that
raids workers) and Knights (heavy cavalry). The Workshop builds Ballistas (the answer to flyers), Trebuchets (they set up
where they stop and hurl stones far, with splash, but cannot hit anything close) and the Balloon, an unarmed scout that
floats over cliffs. The Blacksmith researches weapon and armor upgrades and unlocks Knights, Trebuchets and Ballistas.
Watchtowers hit ground and air. The Expedition: Bots mine and build, staying at each building until it stands; the
Recruiting post hires Sellswords (local mercenaries with rifles, ground and air) and Bruisers (riot shields and heavy
guns); the Factory builds Buggies (fast raiders), Rovers (rocket artillery that fires on the move) and Drones (fast low
flyers); the Portal trains Marines (elite soldiers). Radio towers hit ground and air. A unit's button names what it
fights best beside and what beats it.

**Zoom:** pinch on touch screens, Ctrl+wheel or trackpad pinch with a mouse.

**Pause and after the game:** the pause card shows the clock. Against a friend the game goes on under it; PAUSE FOR
EVERYONE stops it for both of you (three a game, five minutes at most, and only you can end your pause early). The end
card gives the result and the time, and the map's story; after a victory against the AI, SHARE sends a friend the same
game as a challenge.

**Phones:** the game goes full screen in landscape when you start. On iPhone, use Share → Add to Home Screen.

**Touch:** tap or drag a box to select; tap the ground to move, tap an enemy to attack, tap a gold field to gather.
Two fingers pan. Drag on the minimap to scroll.

The simulation (Rust, `crates/endfall-sim/`, compiled to WebAssembly) is deterministic and runs without a browser; multiplayer is lockstep on top of
it, through a relay. See `CLAUDE.md` for how the code is organized.

## License

MIT, see [LICENSE](LICENSE).
