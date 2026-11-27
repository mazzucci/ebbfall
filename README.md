# Ebbfall

A classic real-time strategy game, free in the browser. In 2047, time travel was first attempted. An expedition jumped six centuries back, into a medieval kingdom that wasn't expecting company. Now a modern expedition and a medieval kingdom fight over the gold: mine it, build, grow your
population, raise an army, and bring down the enemy's Castle or Data center before their waves bring down yours. Two
peoples (the Kingdom and the Expedition), up to eight players (you and one to seven AIs, each at its own level: Easy, Medium or Hard; free for
all or in teams of any shape, or friends over the Internet with AIs in the empty seats), eight maps of two sizes
(for up to four or eight players, any of them for fewer: a duel on an eight-player map too; a random one of each
size). Pre-alpha.

**Play in your browser:** https://ebbfall.com/ (desktop or phone in landscape, nothing to install).
Every merge to `main` is built and published there by GitHub Actions. **Offline:** once the page has been opened, the
game keeps working with no connection (a service worker stores every file; PLAY OFFLINE on the menu says whether
it is all there, or, where the browser can, adds the game to the device as an app: its own prompt in Chrome and Edge, how
to Add to Home Screen on iPad and iPhone). A new version
installs itself the next time you open the game online.

To run it from source:

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # headless simulation tests
```

**Mouse and keyboard:** left-click or drag to select; with units selected, left- or right-click to move / attack /
mine (OPTIONS, MOUSE: RIGHT CLICK ONLY keeps the left button to selecting); `Esc` lets go; right-click sets a building's
rally point; hold the middle button and drag to move the map. Two keyboard schemes, chosen in OPTIONS (the menu's first page or the pause
card, with a mouse): **Classic** moves the map with the arrow keys or the screen's edge, and each command has its own
letter (`A` attack-move, `S` stop, `H` hold, `B` build with workers selected); **WASD** moves the map with `W` `A`
`S` `D` whatever is selected, and a command's key is its button's place on the card (`E` `R` `T` the top row, `F` `G`
`H` the middle one, `C` `V` `B` the bottom one). In both, `Ctrl`+`1`–`9` saves a control group, `Q` selects the army,
`Space` looks at the last attack, `Home` jumps to your base, `P` pauses. `Backspace` (or the browser's back gesture)
asks before leaving a game.

**Units:** the Kingdom's Villagers mine gold, build and repair; its Market earns gold by itself, with no workers. The
Barracks trains Guards (spearmen, ground only; they Brace for more armor once Shield Wall is researched) and Archers
(ground and air, strongest against flyers). The Stables trains Riders (fast cavalry that
raids workers) and Knights (heavy cavalry). The Workshop builds Ballistas (the answer to flyers), Cannons (they set up
where they stop and fire cannonballs far, with splash, but cannot hit anything close) and the Balloon, an unarmed scout that
floats over cliffs. The Blacksmith researches weapon and armor upgrades and unlocks Knights, Cannons and Ballistas.
Watchtowers hit ground and air. The Expedition: Bots mine and build, staying at each building until it stands; the
Recruiting post hires Sellswords (locals with light swords) and Bruisers (big shields and axes), paid in gold coins it
prints from energy; the Factory builds Drones (fast low flyers) and, once a Lab stands, Buggies (fast raiders),
machines that move faster with the signal and slower without it. Its buildings go up near a Data center; an Uplink (a
large dish, unlocked by the Lab) gives its machines the signal across the whole map, and without one they have it only
near a Data center. The Portal the Lab unlocks (one per player) brings Rovers (rocket artillery that fires on the move)
and Androids, elite machines, slow to make and costly. The Expedition runs on energy: its Bots dig
thorium, which the Data center's small reactor turns into energy, and its Wind turbines generate more; its units draw
on the grid, from the Data center and its Substations (up to 150; the Kingdom's population, up to 120).
Energy builds things; the grid keeps them running. Sentry masts hit ground and air.

**Zoom:** pinch on touch screens, Ctrl+wheel or trackpad pinch with a mouse.

**Pause and after the game:** the pause card shows the clock. Against a friend the game goes on under it; PAUSE FOR
EVERYONE stops it for both of you (three a game, five minutes at most, and only you can end your pause early). The end
card gives the result and the time, and the map's story; after a victory against the AI, SHARE sends a friend the same
game as a challenge.

**Play against Claude (preview):** a link with `?plan=` gives the computer opponent a plan Claude wrote (the game's
Hard AI follows it: when to attack, expand and tech, units it won't build); `&watch=1` lets you watch that plan play
the built-in Hard instead. A bare link sets the plan for the whole game; only a page that embeds the game can let
Claude change it while you play ([claude/PLAN_VOCAB.md](claude/PLAN_VOCAB.md), [claude/PROTOCOL.md](claude/PROTOCOL.md)).

**Phones:** the game goes full screen in landscape when you start. On iPhone, use Share → Add to Home Screen.

**Touch:** tap or drag a box to select; tap the ground to move, tap an enemy to attack, tap a gold mine to mine it.
Two fingers pan. Drag on the minimap to scroll.

The simulation (Rust, `crates/endfall-sim/`, compiled to WebAssembly) is deterministic and runs without a browser; multiplayer is lockstep on top of
it, through a relay. See [ARCHITECTURE.md](ARCHITECTURE.md) for how the code is organized.

## License

MIT, see [LICENSE](LICENSE). It covers the code, not the game's pictures in `public/art/new/`: those were generated with
Google's Gemini and are provided as is, and anyone reusing them should check Google's terms (NOTICE.txt beside them).
