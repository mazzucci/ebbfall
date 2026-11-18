import type { EngineInterface, Register } from 'claude-code'

// The Ebbfall challenge mod (the Whiteboard pattern): /ebbfall [watch|play] starts the challenge's local server
// (../../server.mjs: the local build of the game and a page that embeds it, 127.0.0.1 only), opens the page, and
// feeds every game moment (the start, a check-in every 2 game-minutes, a key event, the end) into this session with
// $.prompt.submit. Claude answers with the tools of the challenge's MCP server (../.mcp.json -> ../../mcp.mjs):
// set_plan, say, read_state. The game never waits for Claude: while a turn runs, only the newest moment waits here.

type Server = { url: string; port: number; token: string; mode: string }
type GameMsg = { type: string; [k: string]: unknown }

let server: Promise<Server> | null = null
let mode = 'watch'
/** The moment waiting for the session to be idle (only the newest: the game has moved on). */
let pending: string | null = null
let delivering: Promise<void> | null = null
let game = 0

const CONTEXT_HEAD =
  'The Ebbfall challenge is open (the ebbfall plugin): a game page in the browser, where you play a seat. Messages ' +
  'starting "(Ebbfall)" are game moments from it, not the person typing: answer each with at most one ebbfall ' +
  'set_plan call (with its say line) or one say call, or nothing, then a few words here. What follows is how to play.\n\n'

async function node($: EngineInterface): Promise<string> {
  for (const dir of [...((await $.env.get('PATH')) ?? '').split(':').filter(Boolean), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']) {
    if (await $.fs.exists(`${dir}/node`)) return `${dir}/node`
  }
  throw new Error('Node.js was not found: the challenge runs a small local server with it (Node 18 or later).')
}

const root = ($: EngineInterface) => `${$.plugin.root}/..`

function startServer($: EngineInterface, m: string): Promise<Server> {
  const self: Promise<Server> = new Promise<Server>((resolve, reject) => {
    void (async () => {
      try {
        const argv = [await node($), `${root($)}/server.mjs`, '--mode', m]
        let buffer = ''
        let err = ''
        for await (const piece of $.process.spawn({ argv })) {
          if (piece.stream !== 'stdout') {
            err = (err + piece.text).slice(-2000)
            continue
          }
          buffer += piece.text
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines.filter(Boolean)) {
            let msg: { ready?: boolean; event?: { kind: string; data: GameMsg } }
            try {
              msg = JSON.parse(line)
            } catch {
              continue
            }
            if (msg.ready) resolve(msg as unknown as Server)
            else if (msg.event?.kind === 'game') onGame($, msg.event.data)
          }
        }
        if (server === self) server = null
        reject(new Error(`The Ebbfall page stopped. ${err.trim().split('\n').slice(-2).join(' ')}`))
      } catch (error) {
        if (server === self) server = null
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })()
  })
  return self
}

/** A game message, put to Claude in words. */
function onGame($: EngineInterface, m: GameMsg) {
  let text: string | null = null
  if (m.type === 'ebbfall:ready') {
    game++
    text =
      `(Ebbfall) Game ${game} is on the menu (${mode === 'watch' ? 'watch: your seat vs the built-in Hard AI' : 'play: the person vs your seat'}). ` +
      'Set your start plan now with set_plan (plan: a code) and a say line; the person presses START GAME.'
  } else if (m.type === 'ebbfall:start') {
    text = `(Ebbfall) The game started: ${JSON.stringify({ peoples: m.peoples, map: m.map, plan: m.plan, adjusted: m.adjusted, seat: m.seat, me: m.me })}. Nothing to do unless the plan was adjusted badly.`
  } else if (m.type === 'ebbfall:checkin' || m.type === 'ebbfall:event') {
    const d = m.digest as { at?: string; why?: string } | undefined
    text =
      `(Ebbfall) ${m.type === 'ebbfall:event' ? `Event at ${d?.at}: ${d?.why}.` : `Check-in at ${d?.at}.`} Digest:\n${JSON.stringify(d)}\n` +
      'Steer with set_plan (a delta and/or intents) if something should change, else do nothing.'
  } else if (m.type === 'ebbfall:end') {
    const s = JSON.stringify(m.summary ?? null)
    text =
      `(Ebbfall) The game is over: your seat ${m.result}. Summary: ${s.length > 3500 ? s.slice(0, 3500) + '...' : s}\n` +
      'Say one line to the player with say (rival and coach), then note in two short sentences what you would change next game.'
  }
  if (!text) return
  // The end and the menu always reach Claude; a newer check-in replaces one still waiting.
  pending = pending && /^\(Ebbfall\) (The game is over|Game \d+ is on the menu)/.test(pending) ? `${pending}\n\n${text}` : text
  void deliver($)
}

function deliver($: EngineInterface): Promise<void> {
  delivering ??= (async () => {
    try {
      while (pending) {
        const text = pending
        try {
          await $.prompt.submit({ text })
        } catch {
          return // (busy: turn.complete tries again)
        }
        if (pending === text) pending = null
      }
    } finally {
      delivering = null
    }
  })()
  return delivering
}

async function openInBrowser($: EngineInterface, url: string): Promise<boolean> {
  const chosen = ((await $.env.get('BROWSER')) ?? '').split(':')[0]?.trim()
  try {
    if (chosen) {
      const started = await $.process.run(['/bin/sh', '-c', 'nohup "$@" >/dev/null 2>&1 </dev/null &', 'sh', ...chosen.split(/\s+/), url])
      return started.exitCode === 0
    }
    const opener = (await $.fs.exists('/usr/bin/open')) ? '/usr/bin/open' : 'xdg-open'
    return (await $.process.run([opener, url])).exitCode === 0
  } catch {
    return false
  }
}

async function systemText($: EngineInterface): Promise<string> {
  try {
    return (await $.process.run([await node($), `${root($)}/lib/prompt.mjs`, 'system'])).stdout
  } catch {
    return ''
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ebbfall',
      description: 'Play Ebbfall against Claude: /ebbfall watch (Claude vs the built-in Hard) or /ebbfall play (you vs Claude)',
    })
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (pending) void deliver($)
    return done
  })

  on('command.run', { command: 'ebbfall' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase() || 'watch'
    if (arg === 'stop') {
      const s = server
      server = null
      if (!s) return { text: 'No Ebbfall challenge is open.' }
      const open = await s
      await $.http.fetch(`http://127.0.0.1:${open.port}/claude/api/control`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-challenge-token': open.token },
        body: JSON.stringify({ action: 'stop' }),
      }).catch(() => null)
      return { text: 'The Ebbfall challenge is closed.' }
    }
    if (arg !== 'watch' && arg !== 'play') return { text: 'Usage: /ebbfall watch | /ebbfall play | /ebbfall stop' }
    if (server) return { text: `An Ebbfall challenge is already open (${mode}): ${(await server).url} (/ebbfall stop closes it).` }
    mode = arg
    game = 0
    try {
      server = startServer($, arg)
      const open = await server
      const opened = await openInBrowser($, open.url)
      const sys = await systemText($)
      return {
        text: `Ebbfall ${arg === 'watch' ? 'watch: Claude vs the built-in Hard' : 'play: you vs Claude'}, ${opened ? 'opened in your browser' : 'open it in your browser'}: ${open.url}`,
        context: [CONTEXT_HEAD + sys],
      }
    } catch (error) {
      server = null
      return { text: `The Ebbfall page could not start: ${error instanceof Error ? error.message : String(error)}` }
    }
  })
}
