import type { EngineInterface, Register } from 'claude-code'

// The Ebbfall challenge mod (the Whiteboard pattern): /ebbfall [watch|play] starts the challenge's local server
// (../../server.mjs: the local build of the game and a page that embeds it, 127.0.0.1 only), opens the page, and
// feeds every game moment (the start, a check-in every 2 game-minutes, a key event, the end) into this session with
// $.prompt.submit. Claude answers with the tools of the challenge's MCP server (../.mcp.json -> ../../mcp.mjs):
// set_plan, say, read_state, save_notes. The game never waits for Claude: while a turn runs, only the newest moment
// waits here.
//
// Cheap rematches: after each game Claude saves its notes on the player with save_notes (the server keeps them in
// ~/.ebbfall-challenge/notes/<player>.md), and each game's menu moment carries them. So the person can /clear (or start a
// new session) between games and keep the rival's memory without paying for the whole match again. After a /clear the
// next moment also carries how to play, since the context /ebbfall gave went with the conversation.

type Server = { url: string; port: number; token: string; mode: string; player: string; notes_path: string; notes_chars: number }
type Notes = { player?: string; path?: string; chars?: number; max?: number; notes?: string }
type GameMsg = { type: string; [k: string]: unknown }

let server: Promise<Server> | null = null
let mode = 'watch'
/** The moment waiting for the session to be idle (only the newest: the game has moved on). */
let pending: string | null = null
let delivering: Promise<void> | null = null
let game = 0
/** How to play (lib/prompt.mjs's system text), and whether this conversation has it: a /clear drops it. */
let howToPlay = ''
let briefed = true

const NOTES_MAX = 1200 // (lib/notes.mjs)

const CONTEXT_HEAD =
  'The Ebbfall challenge is open (the ebbfall plugin): a game page in the browser, where you play a seat. Messages ' +
  'starting "(Ebbfall)" are game moments from it, not the person typing: answer each with at most one ebbfall ' +
  'set_plan call (with its say line) or one say call, or nothing, then a few words here. What follows is how to play.\n\n'

function notesLine(n: Notes | undefined): string {
  const who = n?.player ? `"${n.player}"` : 'this player'
  if (!n?.notes) return `You have no notes on ${who} yet: this is your first game against them.`
  return `Your notes on ${who} from the earlier games (written by you after the last one):\n${n.notes}`
}

async function node($: EngineInterface): Promise<string> {
  for (const dir of [...((await $.env.get('PATH')) ?? '').split(':').filter(Boolean), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']) {
    if (await $.fs.exists(`${dir}/node`)) return `${dir}/node`
  }
  throw new Error('Node.js was not found: the challenge runs a small local server with it (Node 18 or later).')
}

const root = ($: EngineInterface) => `${$.plugin.root}/..`

function startServer($: EngineInterface, m: string, player: string): Promise<Server> {
  const self: Promise<Server> = new Promise<Server>((resolve, reject) => {
    void (async () => {
      try {
        const argv = [await node($), `${root($)}/server.mjs`, '--mode', m, ...(player ? ['--player', player] : [])]
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
      `(Ebbfall) Game ${game} is on the menu (${mode === 'watch' ? 'watch: your seat vs the built-in Hard AI' : 'play: the person vs your seat'}).\n` +
      `${notesLine(m.challenge as Notes | undefined)}\n` +
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
      'Say one line to the player with say (rival and coach). Then save your notes for the next game with save_notes: ' +
      `at most ${NOTES_MAX.toLocaleString('en-US')} characters (longer ones are refused: rewrite them shorter), plain text. The next game may start in a ` +
      'fresh conversation with only these notes. Put what to try next (with the plan code) FIRST, then merge what still ' +
      'matters from your earlier notes: what worked and what failed, what the opponent did and when. Then a few words here.'
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
        // After a /clear the conversation no longer knows the game: the first moment brings how to play again.
        const fresh = !briefed && howToPlay
        try {
          await $.prompt.submit({ text: fresh ? `${CONTEXT_HEAD}${howToPlay}\n\n---\n\n${text}` : text })
        } catch {
          return // (busy: turn.complete tries again)
        }
        if (fresh) briefed = true
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

  // A /clear ends the conversation but not the process: the page and the server go on, the context /ebbfall gave does not.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') briefed = false
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (pending) void deliver($)
    return done
  })

  on('command.run', { command: 'ebbfall' }, async ($, e) => {
    const [first, name, ...rest] = e.args.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const arg = first || 'watch'
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
    const usage =
      'Usage: /ebbfall watch [name] | /ebbfall play [name] | /ebbfall stop. The name (letters, digits, - or _) keys ' +
      "Claude's notes on its rival: default hard in watch, your login name in play."
    if (arg !== 'watch' && arg !== 'play') return { text: usage }
    if (rest.length || (name && !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(name))) return { text: usage }
    if (server) return { text: `An Ebbfall challenge is already open (${mode}): ${(await server).url} (/ebbfall stop closes it).` }
    mode = arg
    game = 0
    try {
      server = startServer($, arg, name ?? '')
      const open = await server
      const opened = await openInBrowser($, open.url)
      howToPlay = await systemText($)
      briefed = true
      const notes = open.notes_chars
        ? `Claude's notes on "${open.player}" (${open.notes_chars} characters) are in ${open.notes_path}`
        : `Claude will keep its notes on "${open.player}" in ${open.notes_path}`
      return {
        text:
          `Ebbfall ${arg === 'watch' ? 'watch: Claude vs the built-in Hard' : 'play: you vs Claude'}, ${opened ? 'opened in your browser' : 'open it in your browser'}: ${open.url}\n` +
          `${notes}; delete that file to reset them. To keep each game cheap, /clear between games (after the end, before ` +
          'you reload the page): the notes carry the memory.',
        context: [CONTEXT_HEAD + howToPlay],
      }
    } catch (error) {
      server = null
      return { text: `The Ebbfall page could not start: ${error instanceof Error ? error.message : String(error)}` }
    }
  })
}
