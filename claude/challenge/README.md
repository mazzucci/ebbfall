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
   seconds and its first line appears; then press START GAME.
3. Play or watch to the end; reload the page for a rematch. `/ebbfall stop` closes it.

What to notice:
- whether Claude's lines fit what is on screen, and how late they come;
- whether a change of plan shows in how its seat plays (a wave held back, a push called);
- what it says after a loss, and whether the next start plan answers it;
- anything that reads as a cheat or as nonsense.

**Cost:** about $1.50 to $3 a game with the current model (Opus). That is the headless driver's figure from series 2,
where each game is a fresh session that carries Claude's notes. In `/ebbfall`, one session keeps the whole match, so
each later game costs more: in series 1, a single session across 5 games, the cost grew from about $1 to $7.

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
   - Claude gets three tools (`set_plan`, `say`, `read_state`);
   - each game costs about $1.50 to $3 at the current model, more for later games in the same session.
4. **Give them the command to run themselves**, since a plugin loads when a session starts:
   `claude --plugin-dir claude/challenge/plugin`. Then they type `/ebbfall watch` or `/ebbfall play`, and
   `/ebbfall stop` to close it.

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
- **The tools.** `mcp.mjs` is an MCP server (stdio) with three tools:
  - `set_plan`: the start plan before a game; during a game, a delta and/or intents (attack, hold, pull, mass), with an
    optional line;
  - `say`: one line, at most 140 characters;
  - `read_state`: the latest digest.

  The game validates and clamps every field, and answers each plan or delta with what it applied.
- **Check-ins.** The game posts a digest of what Claude's seat knows every 2 game-minutes, and on key events: a wave
  arrives or is wiped out, its base is attacked, a building falls, its army is wiped out at home. The game never pauses
  for Claude: while Claude thinks, its seat keeps its current plan, and a delta takes effect on the tick it arrives.
- **The mod** (`plugin/`, in the pattern of [Whiteboard](https://github.com/mazzucci/whiteboard)):
  - `/ebbfall [watch|play|stop]` starts the server, opens the page and feeds each moment (the menu, the start, a
    check-in, an event, the end) into the session with `$.prompt.submit`;
  - while a turn runs, only the newest check-in waits;
  - its tools come from `mcp.mjs` through `plugin/.mcp.json`.
- **Post-game notes** (the headless driver). Each game is a fresh Claude session. At the end Claude says a line, then
  writes its notes for the next game as its final answer (aiming for 1,200 characters, cut at 1,500): what to try next,
  what worked and failed, what the opponent did. The next game's first message carries the notes and the results so
  far, and nothing else. In `/ebbfall`, the session itself carries over between games.
- **The tool limits** in the headless driver, verbatim. Each moment goes to `claude -p <moment> --output-format json
  --session-id|--resume <one session per game> --system-prompt <lib/prompt.mjs SYSTEM>` with:

  ```
  --mcp-config <log>/mcp.json --strict-mcp-config --tools "" --allowedTools mcp__ebbfall__set_plan,mcp__ebbfall__say,mcp__ebbfall__read_state
  --permission-mode dontAsk --permission-prompts none --setting-sources project --disable-slash-commands --no-chrome
  ```

  Before playing, the driver makes one call with the same flags in `stream-json` and refuses to start unless the init
  message lists exactly those three tools and one connected MCP server. No permission bypass is used anywhere.

  In `/ebbfall`, the session is the person's own, with their tools and permissions. The mod check (`modcheck.py`) ran
  it with the same limits:

  ```
  claude --plugin-dir claude/challenge/plugin --tools "" --allowedTools mcp__plugin_ebbfall_ebbfall__set_plan,mcp__plugin_ebbfall_ebbfall__say,mcp__plugin_ebbfall_ebbfall__read_state --disallowedTools mcp__claude_ai_Notion,mcp__claude_ai_Claude_Docs,mcp__claude_ai_Resend --permission-mode dontAsk --setting-sources project --no-chrome
  ```

  with `ENABLE_CLAUDEAI_MCP_SERVERS=false` in its environment. `--strict-mcp-config` would also drop the plugin's own
  MCP server.

## The pieces

| File | What it is |
| --- | --- |
| `server.mjs` | The local server (Node's standard library): the build, the page, the relay, the logs, the state file (`lib/common.mjs`). |
| `page/` | The page: the game in a same-origin iframe, the side panel, the relay of the game's postMessages. |
| `mcp.mjs` | The MCP server with the three tools. |
| `plugin/` | The mod: `/ebbfall`, `$.prompt.submit`, `.mcp.json`. |
| `drive.mjs` | The headless driver: real Claude against Hard in the real page (Playwright), no person needed. |
| `modcheck.py` | The one-time check of the mod path: an interactive `claude --plugin-dir` in a pty (Python's), typing `/ebbfall watch`. |
| `lib/prompt.mjs` | What Claude is told: the voice, the vocabulary copy, each moment's wording, the notes. |
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
- `--stub`: scripted replies, no Claude.
- `--mock`: the stand-in game.
- `--model`, `--headed`.

A series stops at once on a Claude call that errors or returns no JSON, and at the token ceiling. Logs go to
`target/challenge/logs/<name>-<time>/`:
- `transcript.md`: readable;
- `driver.jsonl`: every digest, call, tool call, line and result;
- `server.jsonl`;
- `series.json`: results and tokens per game;
- `notes.md`: Claude's notes after each game.
