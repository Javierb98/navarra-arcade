#!/usr/bin/env python3
"""Start the arcade: the game menu (menu/) plus every game (games/), each on its own port.

    python3 start.py          # everything in games.json that isn't hidden
    python3 start.py --all    # hidden games too
    python3 start.py --open   # also open the menu in the default browser
    python3 start.py --cabinet   # show the cabinet's buttons, even off the Pi
    python3 start.py --paid      # paid arcade: each game costs a coin (0.50 by default)
    python3 start.py --paid --price=1.00
    python3 start.py --dev       # the mode switcher, even on the Pi

Three modes: desktop (instructions for keys, every game free), arcade (the
cabinet's stick and buttons, every game free) and paid (the cabinet, a coin a
game, arcade games only). It starts in paid with --paid, else arcade on the
Pi or with --cabinet, else desktop. Off the Pi (or with --dev) the menu shows
a DEV switcher (click it, or press F8) that changes the mode of the running
arcade; every page, menu and games alike, picks it up on its next load.

Paid arcade: the menu shows the credits and asks for a coin; starting a game
spends one, and when it's over the game goes back to the menu for the next
coin. Only arcade games are offered: the longer desktop games (kind
"desktop" in games.json) are neither listed in the menu nor served. The
coin mechanism must send the key 5 (as in MAME); a coin dropped during a game
counts too. Credits are kept in credits.json (they survive a
restart) and every coin is logged in coins.log with its time, for the takings.
Off the Pi it runs in dev mode: the menu says so, and 5 on the keyboard adds
a coin for testing.

On a Raspberry Pi (the arcade machine) every page is marked as the cabinet,
so the menu and the games show the stick and buttons; anywhere else they show
keys, or touch controls on a phone.

One process, one thread per server. Ctrl+C stops them all. Browsers are told
never to cache, so an update shows up on the next reload.
"""
import functools
import http.server
import json
import os
import socket
import sys
import threading
import time
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
FORBIDDEN = range(8000, 8011)  # taken by other projects on the dev machine


def on_raspberry_pi():
    """The arcade machine is a Raspberry Pi; the Pi says so in its device tree."""
    try:
        with open('/proc/device-tree/model', encoding='utf-8', errors='ignore') as f:
            return 'raspberry pi' in f.read().lower()
    except OSError:
        return False


MODES = ('desktop', 'arcade', 'paid')
PRICE = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--price=')), '0.50')
# The mode switcher (and, in paid mode, 5 on the keyboard as a coin) is for
# testing: always off the Pi, on the Pi only with --dev.
DEV = '--dev' in sys.argv or not on_raspberry_pi()
# --cabinet / --computer override the Pi check (to try the cabinet's
# instructions on another machine, or the reverse).
_cabinet = '--cabinet' in sys.argv or ('--computer' not in sys.argv and on_raspberry_pi())
mode = 'paid' if '--paid' in sys.argv else 'arcade' if _cabinet else 'desktop'


def paid():
    return mode == 'paid'


def marks():
    """The <meta> tags stamped into every page, for the current mode: the
    cabinet, the paid arcade, and the dev switcher."""
    out = []
    if mode in ('arcade', 'paid'):
        out.append(b'<meta name="arcade-device" content="cabinet">')
    if paid():
        out.append(f'<meta name="arcade-mode" content="paid" data-price="{PRICE}" data-dev="{int(DEV)}">'.encode())
    if DEV:
        out.append(f'<meta name="arcade-dev" content="{mode}">'.encode())
    return b'\n  '.join(out)

# ---- credits (paid arcade) ------------------------------------------------------
CREDITS_FILE = os.path.join(HERE, 'credits.json')
COINS_LOG = os.path.join(HERE, 'coins.log')
credits_lock = threading.Lock()


def read_credits():
    try:
        with open(CREDITS_FILE, encoding='utf-8') as f:
            return max(0, int(json.load(f).get('credits', 0)))
    except (OSError, ValueError, AttributeError):
        return 0


def write_credits(n):
    tmp = CREDITS_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump({'credits': n}, f)
    os.replace(tmp, CREDITS_FILE)  # never a half-written file after a power cut


def credits_action(action):
    """'get', 'coin' (one more) or 'spend' (one less, if there is one)."""
    with credits_lock:
        n = read_credits()
        ok = True
        if action == 'coin':
            n += 1
            write_credits(n)
            with open(COINS_LOG, 'a', encoding='utf-8') as f:
                note = '\tdev' if DEV else ''  # (no backslashes inside f-string braces: the Pi's Python 3.11)
                f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')}\t{PRICE}{note}\n")
        elif action == 'spend':
            ok = n > 0
            if ok:
                n -= 1
                write_credits(n)
        return {'credits': n, 'ok': ok, 'price': PRICE, 'dev': DEV}


class NoCache(http.server.SimpleHTTPRequestHandler):
    extra = {}  # URL path -> a function giving JSON from elsewhere (the menu's games.json is the arcade's)
    credits = False  # the menu's server also keeps the credits (paid arcade) and the mode
    desktop = False  # a desktop game: not offered in the paid arcade

    def send_json(self, data):
        body = json.dumps(data).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')  # games on other ports add coins too
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        global mode
        path = self.path.split('?')[0]
        if self.credits and DEV and path.startswith('/mode/') and path[6:] in MODES:
            mode = path[6:]
            print(f'Mode: {mode}', flush=True)
            return self.send_json({'mode': mode})
        action = path.removeprefix('/credits/')
        if self.credits and paid() and action in ('coin', 'spend'):
            return self.send_json(credits_action(action))
        self.send_error(404)

    def do_GET(self):
        if self.credits and self.path.split('?')[0] == '/mode':
            return self.send_json({'mode': mode, 'modes': MODES, 'switchable': DEV})
        if self.credits and self.path.split('?')[0] == '/credits':
            return self.send_json(credits_action('get') if paid() else {'credits': 0, 'ok': False, 'paid': False})
        if self.desktop and paid():
            return self.send_error(404, 'Not in the paid arcade')
        own = self.extra.get(self.path.split('?')[0])
        if own:
            body = own()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        # On the cabinet, every page says so, so the menu and every game show
        # the stick and buttons rather than keys.
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            path = os.path.join(path, 'index.html')
        mark = marks()
        if not (mark and path.endswith('.html') and os.path.isfile(path)):
            return super().do_GET()
        with open(path, 'rb') as f:
            html = f.read()
        head = html.lower().find(b'<head>')
        html = html[:head + 6] + b'\n  ' + mark + html[head + 6:] if head >= 0 else mark + html
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(html)))
        self.end_headers()
        self.wfile.write(html)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, *args):
        pass  # keep the terminal readable


def port_free(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(('', port))
            return True
        except OSError:
            return False


def serve(name, folder, port, extra=None, credits=False, desktop=False):
    if port in FORBIDDEN:
        return f'  {name:<22} port {port} is in the forbidden range 8000-8010: change it in games.json'
    if not os.path.isdir(folder):
        return f'  {name:<22} folder not found: {folder}'
    if not port_free(port):
        return f'  {name:<22} http://localhost:{port}  (port already in use: assuming it is already running)'
    handler = functools.partial(type('Handler', (NoCache,), {'extra': extra or {}, 'credits': credits, 'desktop': desktop}), directory=folder)
    server = http.server.ThreadingHTTPServer(('', port), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f'  {name:<22} http://localhost:{port}'


def offered(game):
    """Whether this arcade offers the game: the paid arcade leaves out the
    longer desktop games (kind "desktop"), which aren't arcade games."""
    return not (paid() and game.get('kind') == 'desktop')


def load_games():
    """games.json as this arcade offers it (read afresh, so edits show on reload)."""
    with open(os.path.join(HERE, 'games.json'), encoding='utf-8') as f:
        config = json.load(f)
    config['games'] = [g for g in config['games'] if offered(g)]
    return config


def main():
    # Every game gets a server, whatever the mode, so switching mode needs no
    # restart; in the paid arcade a desktop game's server answers 404.
    with open(os.path.join(HERE, 'games.json'), encoding='utf-8') as f:
        config = json.load(f)
    show_all = '--all' in sys.argv
    # The menu is its own repository (menu/); the list of games is the arcade's
    # (as offered here: in the paid arcade, without the desktop games).
    games_json = lambda: json.dumps(load_games(), ensure_ascii=False).encode()
    lines = [serve('Menu', os.path.join(HERE, 'menu'), config['menuPort'], {'/games.json': games_json}, credits=True)]
    for g in config['games']:
        if g['status'] == 'hidden' and not show_all:
            continue
        desktop = g.get('kind') == 'desktop'
        lines.append(serve(g['title']['es'], os.path.normpath(os.path.join(HERE, g['folder'])), g['port'], desktop=desktop)
                     + ('  (desktop game: not in the paid arcade)' if desktop else ''))
    menu = f"http://localhost:{config['menuPort']}"
    where = {'desktop': 'desktop: keys (touch controls on a phone), every game free',
             'arcade': 'arcade: the cabinet\'s stick and buttons, every game free',
             'paid': f'paid arcade: the cabinet, {PRICE} a game, {read_credits()} credit(s) left over, arcade games only'}[mode]
    dev = ' DEV: switch modes from the menu (F8); in paid mode 5 adds a coin.' if DEV else ''
    print('Navarra arcade:\n' + '\n'.join(lines) + f'\n\nMode: {where}.{dev}\nOpen the menu at {menu}  (Ctrl+C to stop)', flush=True)
    if '--open' in sys.argv and '--no-open' not in sys.argv:
        webbrowser.open(menu)
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        print('\nStopped.')


if __name__ == '__main__':
    main()
