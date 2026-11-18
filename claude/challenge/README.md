# The Claude challenge

> **Experimental.** A prototype: not on ebbfall.com, nothing on the site changes. Built on Claude Code's mods, which
> are new. Tested on Linux with Claude Code 2.1.323 to 2.1.327.
>
> Not affiliated with or endorsed by Anthropic.

Play Ebbfall against Claude, or watch Claude play the game's built-in Hard AI, from a Claude Code session. Claude does
not click units: its seat is **Hard's AI, steered by Claude's plan** (claude/PLAN_VOCAB.md). Claude sets the plan
before the game, changes it while the game runs, and talks to you in a side panel.

## Install by hand (3 steps)

Requirements:
- Claude Code 2.1.323 or later (mods);
- Node.js 22 (`.nvmrc`; 18 or later runs the server);
- the game built once from this repo: `npm install`, then `npm run build`. The build goes to `dist/`, and the plugin
  serves that build, not the live site.

1. From the repo root, start Claude Code with the plugin:
   `claude --plugin-dir claude/challenge/plugin`
2. Type `/ebbfall watch` (Claude's seat against Hard, and you watch) or `/ebbfall play` (you against Claude). A page opens
   in your browser, with the game on the left and Claude's lines on the right. Claude sets its start plan in a few
   seconds and its first line appears; then press START GAME. Add a name to keep Claude's notes on you apart from
   anyone else's: `/ebbfall play sam` (letters, digits, `-` or `_`; the default is your login name in play, `hard` in
   watch).
3. Play or watch to the end. Claude says a line and saves its notes; then type `/clear` and reload the page for a
   rematch. `/ebbfall stop` closes it.

What to notice:
- whether Claude's lines fit what is on screen, and how late they come;
- whether a change of plan shows in how its seat plays (a wave held back, a push called);
- what it says after a loss, and whether the next start plan answers it;
- anything that reads as a cheat or as nonsense.

**Cost:** about $1.50 to $3 a game with the current model (Opus), the headless driver's figure from series 2, where each
game is a fresh session that carries only Claude's notes.

### Keep it cheap: `/clear` between games

A session that keeps the whole match pays for all of it again on every turn: in series 1, a single session across 5
games, the cost grew from about $1 to $7 a game. So after each game, once Claude has said its line and saved its notes:
type `/clear` (or quit and start a new session), then reload the page. The page and the server stay open across a
`/clear`, and the next game's first message brings Claude how to play and its notes, so the rival keeps its memory and
each game costs about the same.

**Claude's notes** are at most 1,200 characters, what to try next first, written by Claude with `save_notes` after each
game; longer notes are refused and Claude rewrites them. They live outside the repo, one file per player name:
`~/.ebbfall-challenge/notes/<player>.md` (`/ebbfall` shows the path when it starts). Read them to see what Claude thinks
of you. To reset Claude's memory of a player, delete the file: `rm ~/.ebbfall-challenge/notes/<player>.md` (or the
whole `~/.ebbfall-challenge` folder for everyone). `EBBFALL_CHALLENGE_HOME` names another folder.

Or ask Claude: _"Start the Ebbfall Claude challenge from this repo, following the Instructions for Claude in
claude/challenge/README.md."_

<details>
<summary>Instructions for Claude</summary>

You are starting the Ebbfall Claude challenge for the person you are working with. Follow these steps in order, and
stop to tell them if one fails.

1. **Check the requirements.** Run `node --version` (22, or at least 18) and `claude --version` (2.1.323 or later).
   You must be in the Ebbfall repository's root (it has `claude/challenge/plugin/`). If a check fails, stop and say which.
2. **Build the game if needed.** If `dist/index.html` is missing, or older than the last commit under `src/` or
   `crates/`, run `npm install` and then `npm run build`. The build needs Rust through rustup (see CLAUDE.md,
   Prerequisites). Tell the person first that it takes a minute or two.
3. **Tell the person what will happen, and wait for their go-ahead:**
   - a new Claude Code session loads the plugin from `claude/challenge/plugin` for that session only; nothing is
     installed;
   - `/ebbfall` then runs a small local server (127.0.0.1 only, with a random token) that serves the local build and
     opens a page in their browser;
   - Claude gets four tools (`set_plan`, `say`, `read_state`, `save_notes`);
   - Claude's notes on its rival (at most 1,200 characters) are kept in `~/.ebbfall-challenge/notes/<player>.md`;
     deleting the file resets them;
   - each game costs about $1.50 to $3 at the current model if they `/clear` between games (the notes carry the
     memory), more for later games in the same conversation.
4. **Give them the command to run themselves**, since a plugin loads when a session starts:
   `claude --plugin-dir claude/challenge/plugin`. Then they type `/ebbfall watch` or `/ebbfall play` (optionally with
   a player name: `/ebbfall play sam`), `/clear` between games, and `/ebbfall stop` to close it.

Do not install the plugin into their settings, and do not change their Claude Code settings, permissions or other
plugins. Do not start the session with a permission bypass.

</details>

## How it works

- **The page, served from the same origin as the game.** `server.mjs` serves the local build (`dist/`) at `/` and the
  challenge page at `/claude/`, on one 127.0.0.1 port. That gives full screen and sound with no ebbfall.com
  Permissions-Policy in the way, and no drift from the live site.
  - The page embeds the game with `?embed=1&plan=..&watch=1&vs=..[&seed=..]` and relays its postMessages to the server
    (claude/PROTOCOL.md).
  - The server sends Claude's plans, deltas and lines back to the game.
  - Every API call needs the token; a request whose Host is not this machine's loopback address is refused; no service
    worker is served.
- **The tools.** `mcp.mjs` is an MCP server (stdio) with four tools:
  - `set_plan`: the start plan before a game; during a game, a delta and/or intents (attack, hold, pull, mass), with an
    optional line;
  - `say`: one line, at most 140 characters;
  - `read_state`: the latest digest (and, between games, the saved notes);
  - `save_notes`: Claude's notes for the next game against this player, at most 1,200 characters, refused (not cut)
    when longer.

  The game validates and clamps every field, and answers each plan or delta with what it applied.
- **Check-ins.** The game posts a digest of what Claude's seat knows every 2 game-minutes, and on key events: a wave
  arrives or is wiped out, its base is attacked, a building falls, its army is wiped out at home. The game never pauses
  for Claude: while Claude thinks, its seat keeps its current plan, and a delta takes effect on the tick it arrives.
- **The mod** (`plugin/`, in the pattern of [Whiteboard](https://github.com/mazzucci/whiteboard)):
  - `/ebbfall [watch|play] [player]` starts the server, opens the page and feeds each moment (the menu, the start, a
    check-in, an event, the end) into the session with `$.prompt.submit`; `/ebbfall stop` closes it;
  - while a turn runs, only the newest check-in waits;
  - the menu moment carries Claude's saved notes on the player; after a `/clear` (`session.end` with reason `clear`)
    the next moment also carries how to play, since the context `/ebbfall` gave went with the conversation;
  - its tools come from `mcp.mjs` through `plugin/.mcp.json`.
- **Post-game notes** (both paths). At the end Claude says a line, then saves its notes for the next game with
  `save_notes` (at most 1,200 characters; longer ones are refused with their length, and Claude rewrites them): what to
  try next first, then what worked and failed, what the opponent did. The server keeps them per player
  (`lib/notes.mjs`, `~/.ebbfall-challenge/notes/<player>.md`) and puts them on each game's `ready` event, so the next
  game's first message carries them. The headless driver starts each game in a fresh session with the notes and the
  results so far, and nothing else; in `/ebbfall`, `/clear` between games does the same.
- **The tool limits** in the headless driver, verbatim. Each moment goes to `claude -p <moment> --output-format json
  --session-id|--resume <one session per game> --system-prompt <lib/prompt.mjs SYSTEM>` with:

  ```
  --mcp-config <log>/mcp.json --strict-mcp-config --tools "" --allowedTools mcp__ebbfall__set_plan,mcp__ebbfall__say,mcp__ebbfall__read_state,mcp__ebbfall__save_notes
  --permission-mode dontAsk --permission-prompts none --setting-sources project --disable-slash-commands --no-chrome
  ```

  Before playing, the driver makes one call with the same flags in `stream-json` and refuses to start unless the init
  message lists exactly those four tools and one connected MCP server. No permission bypass is used anywhere.

  In `/ebbfall`, the session is the person's own, with their tools and permissions. The mod check (`modcheck.py`) ran
  it with the same limits (that check ran with the first three tools; `save_notes` came after):

  ```
  claude --plugin-dir claude/challenge/plugin --tools "" --allowedTools mcp__plugin_ebbfall_ebbfall__set_plan,mcp__plugin_ebbfall_ebbfall__say,mcp__plugin_ebbfall_ebbfall__read_state,mcp__plugin_ebbfall_ebbfall__save_notes --disallowedTools mcp__claude_ai_Notion,mcp__claude_ai_Claude_Docs,mcp__claude_ai_Resend --permission-mode dontAsk --setting-sources project --no-chrome
  ```

  with `ENABLE_CLAUDEAI_MCP_SERVERS=false` in its environment. `--strict-mcp-config` would also drop the plugin's own
  MCP server.

## The pieces

| File | What it is |
| --- | --- |
| `server.mjs` | The local server (Node's standard library): the build, the page, the relay, the logs, the state file (`lib/common.mjs`). |
| `page/` | The page: the game in a same-origin iframe, the side panel, the relay of the game's postMessages. |
| `mcp.mjs` | The MCP server with the four tools. |
| `plugin/` | The mod: `/ebbfall`, `$.prompt.submit`, `.mcp.json`. |
| `drive.mjs` | The headless driver: real Claude against Hard in the real page (Playwright), no person needed. |
| `modcheck.py` | The one-time check of the mod path: an interactive `claude --plugin-dir` in a pty (Python's), typing `/ebbfall watch`. |
| `lib/prompt.mjs` | What Claude is told: the voice, the vocabulary copy, each moment's wording, the notes. |
| `lib/notes.mjs` | Claude's notes per player: the cap, the player names, the file under `~/.ebbfall-challenge/notes/`. |
| `test/` | `plumbing.test.mjs` (`node --test claude/challenge/test/*.test.mjs`), a stand-in game that speaks the protocol (`mock-game/`, `server.mjs --mock`), and a stand-in browser for the mod check. |

## The headless driver

```sh
npm run build
node claude/challenge/drive.mjs --check                 # only the tool-limits check
node claude/challenge/drive.mjs --games 5 --name s2 --speed 2 --seeds 90377,271828,31337,1618033,4242
```

The default match is the Kingdom mirror on Dust Quarter (the Standard map, 96x96) against Hard. Options:
- `--ceiling 150000`: new tokens per series (input + cache writes + output); cache reads are logged separately.
- `--speed N`: game time at N times real time (default 1). Headless Chromium draws too slowly to hold 30 Hz, so the
  driver keeps the pace with `endfall.skip`.
- `--seeds 11,22,..`: a game seed per game (`&seed=`), cycled.
- `--cap M`: a safety cutoff in game minutes, off by default; watch mode ends itself at 30:00 with a timeout.
- `--player NAME`: whose notes the series reads and saves (default `hard`, the same file as `/ebbfall watch`; with
  `--stub`, `stub`). The notes persist across series: `--fresh` starts the first game without them (its own notes
  then replace them), or delete the file.
- `--stub`: scripted replies, no Claude (they include an over-long `save_notes`, which must be refused).
- `--mock`: the stand-in game.
- `--model`, `--headed`.

A series stops at once on a Claude call that errors or returns no JSON, and at the token ceiling. Logs go to
`target/challenge/logs/<name>-<time>/`:
- `transcript.md`: readable;
- `driver.jsonl`: every digest, call, tool call, line and result;
- `server.jsonl`;
- `series.json`: results and tokens per game;
- `notes.md`: a copy of Claude's notes after each game (the live ones are in `~/.ebbfall-challenge/notes/`).
