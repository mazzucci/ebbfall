# The Claude challenge

Play Ebbfall against Claude, or watch Claude play the built-in Hard, from a Claude Code session. Claude steers one AI
seat with a plan (claude/PLAN_VOCAB.md) and changes it while the game runs, through three MCP tools, and talks to you
in a side panel. The game side of it is the embed contract in claude/PROTOCOL.md.

## For Stelian: three steps

1. Build the game once (`npm run build`), then start Claude Code with the mod:
   `claude --plugin-dir claude/challenge/plugin` (from the repo root).
2. Type `/ebbfall watch` (Claude's seat vs Hard: you only watch) or `/ebbfall play` (you vs Claude). A page opens
   in your browser: the game on the left, Claude's lines on the right. Claude sets its start plan in a few seconds
   (the panel shows its first line); then press START GAME.
3. Play or watch to the end, then a rematch: reload the page, or `/ebbfall stop` and start again. What to note:
   whether Claude's lines fit what is happening on screen (and how late they come), whether a change of plan shows in
   how its seat plays (a wave held, a push called), what it says after a loss and whether the next game's start plan
   answers it, and anything that reads as a cheat or as nonsense.

## The pieces

| File | What it is |
| --- | --- |
| `server.mjs` | The local server (Node's standard library, 127.0.0.1, a random token): serves `dist/` (the game) at `/` and the page at `/claude/`, relays between the page and the tools, logs everything. Its address goes to a state file (`lib/common.mjs`). |
| `page/` | The page: the game in an iframe (`?embed=1&plan=..&watch=1&vs=..`), the side panel, the relay of the game's postMessages. |
| `mcp.mjs` | The MCP server (stdio): `set_plan` (a start plan, or a delta plus intents: attack, hold, pull, mass; with a line), `say` (one line, 140 characters at most), `read_state` (the latest digest). |
| `plugin/` | The mod (the Whiteboard pattern): `/ebbfall [watch\|play\|stop]` starts the server, opens the page and feeds each game moment into the session with `$.prompt.submit`. Its tools come from `mcp.mjs` through `plugin/.mcp.json`. |
| `drive.mjs` | The headless driver: real Claude vs Hard in the real page (Playwright), no person needed. See below. |
| `modcheck.py` | The one-time check of the mod path: an interactive `claude --plugin-dir` in a pty, typing `/ebbfall watch`. |
| `lib/prompt.mjs` | What Claude is told: the voice, the vocabulary copy, each moment's wording. |
| `test/` | `plumbing.test.mjs` (`node --test claude/challenge/test/*.test.mjs`), the stand-in game that speaks the protocol (`mock-game/`, `server.mjs --mock`), the stand-in browser for the mod check. |

## The headless driver

```sh
npm run build
node claude/challenge/drive.mjs --check               # only the tool-limits check
node claude/challenge/drive.mjs --games 5 --name s1   # a series: Kingdom mirror, Dust Quarter (Standard 96), vs Hard
```

Options: `--ceiling 150000` (new tokens per series: input + cache writes + output; cache reads are logged apart),
`--speed N` (fast-forwards the game N times real time through `endfall.skip`), `--cap 35` (game minutes before it
calls a timeout), `--session UUID` (carry a session over), `--model`, `--mock` (the stand-in game), `--headed`.
Logs in `target/challenge/logs/<name>-<time>/`: `transcript.md` (readable), `driver.jsonl`, `server.jsonl`,
`series.json` (results and tokens per game).

Each moment goes to `claude -p <moment> --output-format json --session-id|--resume <one session per series>
--system-prompt <lib/prompt.mjs SYSTEM>` with these limits, and nothing else:

```
--mcp-config <log>/mcp.json --strict-mcp-config --tools "" --allowedTools mcp__ebbfall__set_plan,mcp__ebbfall__say,mcp__ebbfall__read_state
--permission-mode dontAsk --permission-prompts none --setting-sources project --disable-slash-commands --no-chrome
```

Before playing, the driver runs one call with the same flags in `stream-json` and refuses to start unless the init
message lists exactly our three tools and our one MCP server. No permission bypass anywhere.
