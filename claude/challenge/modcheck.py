#!/usr/bin/env python3
"""The mod check (a one-time check of the real mod path): an interactive `claude --plugin-dir claude/challenge/plugin`
in a pseudo-terminal (Python's pty; no tmux), the same tool limits as the driver, typing "/ebbfall watch" and reading
the screen. The person's browser is test/open-headless.mjs (BROWSER), which presses START GAME and fast-forwards.

    python3 -I claude/challenge/modcheck.py [--real] [--minutes 12]

--real plays the local build (dist/); without it, the protocol's stand-in game (test/mock-game, 14 game-minutes).
Passes when Claude set a start plan through the plugin's MCP tools, answered at least one moment fed in by
$.prompt.submit with a tool call, and the game ended. Logs: target/challenge/logs/modcheck/ (screen.txt, events.jsonl).
Never a permission bypass: --tools "", --allowedTools (our four), --permission-mode dontAsk, no claude.ai connectors.
"""
import json, os, pty, re, select, signal, struct, fcntl, termios, time, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
LOG = os.path.join(REPO, 'target', 'challenge', 'logs', 'modcheck')
CWD = os.path.join(REPO, 'target', 'challenge', 'cwd-mod')
TOOLS = ['mcp__plugin_ebbfall_ebbfall__set_plan', 'mcp__plugin_ebbfall_ebbfall__say', 'mcp__plugin_ebbfall_ebbfall__read_state', 'mcp__plugin_ebbfall_ebbfall__save_notes']
FLAGS = [
    '--plugin-dir', os.path.join(HERE, 'plugin'),
    '--tools', '',
    '--allowedTools', ','.join(TOOLS),
    '--disallowedTools', 'mcp__claude_ai_Notion,mcp__claude_ai_Claude_Docs,mcp__claude_ai_Resend',
    '--permission-mode', 'dontAsk',
    '--setting-sources', 'project',
    '--no-chrome',
]
ANSI = re.compile(r'\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*(\x07|\x1b\\)|\x1b[()][0-9A-B]|\x1b[=>78]')

def main():
    real = '--real' in sys.argv
    minutes = float(sys.argv[sys.argv.index('--minutes') + 1]) if '--minutes' in sys.argv else 12
    os.makedirs(LOG, exist_ok=True)
    os.makedirs(CWD, exist_ok=True)
    for f in ('screen.txt', 'screen.raw', 'events.jsonl', 'browser.log'):
        if os.path.exists(os.path.join(LOG, f)):
            os.remove(os.path.join(LOG, f))
    env = dict(os.environ)
    env['EBBFALL_CHALLENGE_HOME'] = os.path.join(LOG, 'home')  # (Claude's notes: not the person's own)
    env['BROWSER'] = f'node {os.path.join(HERE, "test", "open-headless.mjs")}'
    env['ENABLE_CLAUDEAI_MCP_SERVERS'] = 'false'
    env['TERM'] = 'xterm-256color'
    env.pop('EBBFALL_CHALLENGE_STATE', None)
    if not real:
        env['EBBFALL_CHALLENGE_MOCK'] = '1'
    state_file = os.path.join(env.get('XDG_RUNTIME_DIR') or '/tmp', f'ebbfall-challenge-{os.getuid()}', 'server.json')
    if os.path.exists(state_file):
        print(f'a challenge server is already running ({state_file}): stop it first')
        return 2
    pid, fd = pty.fork()
    if pid == 0:
        os.chdir(CWD)
        os.execvpe('claude', ['claude', *FLAGS], env)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', 50, 160, 0, 0))
    raw = open(os.path.join(LOG, 'screen.raw'), 'wb')
    text = ''
    def pump(secs):
        nonlocal text
        end = time.time() + secs
        while time.time() < end:
            r, _, _ = select.select([fd], [], [], 0.2)
            if fd in r:
                try:
                    b = os.read(fd, 65536)
                except OSError:
                    return False
                if not b:
                    return False
                raw.write(b); raw.flush()
                text += ANSI.sub('', b.decode('utf8', 'replace'))
        return True
    def type_(s):
        for ch in s:
            os.write(fd, ch.encode())
            time.sleep(0.03)
    started = time.time()
    # The screen settles; a trust question for the (empty) check folder is answered yes.
    pump(8)
    if re.search(r'trust', text, re.I):
        os.write(fd, b'\r'); pump(5)
    type_('/ebbfall watch'); pump(1); os.write(fd, b'\r')
    seen = {'start_plan': False, 'moment_answered': False, 'ended': False, 'end_line': False}
    after, s = 0, None
    events = open(os.path.join(LOG, 'events.jsonl'), 'w')
    while time.time() - started < minutes * 60:
        if not pump(2):
            break
        if s is None and os.path.exists(state_file):
            s = json.load(open(state_file))
        if s:
            try:
                req = urllib.request.Request(f'http://127.0.0.1:{s["port"]}/claude/api/events?after={after}', headers={'x-challenge-token': s['token']})
                got = json.load(urllib.request.urlopen(req, timeout=5))
            except Exception:
                got = {'events': []}
            for e in got['events']:
                after = e['seq']
                events.write(json.dumps(e) + '\n'); events.flush()
                d = e['data']
                if e['kind'] == 'tool' and d.get('kind') == 'plan':
                    pass
                if e['kind'] == 'game' and d.get('type') == 'ebbfall:applied' and d.get('ok') and not seen['start_plan']:
                    seen['start_plan'] = True
                elif e['kind'] == 'tool' and d.get('kind') == 'delta':
                    seen['moment_answered'] = True
                elif e['kind'] == 'line' and seen['start_plan'] and d.get('at'):
                    seen['moment_answered'] = True
                if e['kind'] == 'game' and d.get('type') == 'ebbfall:end':
                    seen['ended'] = True
                elif e['kind'] == 'line' and seen['ended']:
                    seen['end_line'] = True
        if seen['end_line']:
            pump(15)
            break
    type_('/ebbfall stop'); pump(1); os.write(fd, b'\r'); pump(5)
    os.write(fd, b'\x03'); pump(1); os.write(fd, b'\x03'); pump(3)
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    open(os.path.join(LOG, 'screen.txt'), 'w').write(text)
    ok = seen['start_plan'] and seen['moment_answered'] and seen['ended']
    print(json.dumps({'ok': ok, **seen, 'seconds': round(time.time() - started), 'log': LOG}))
    return 0 if ok else 1

if __name__ == '__main__':
    sys.exit(main())
