#!/usr/bin/env python3
"""Start the arcade: the game menu plus every game, each on its own port.

    python3 start.py          # everything in games.json that isn't hidden
    python3 start.py --all    # hidden games too
    python3 start.py --open   # also open the menu in the default browser

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
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
FORBIDDEN = range(8000, 8011)  # taken by other projects on the dev machine


class NoCache(http.server.SimpleHTTPRequestHandler):
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


def serve(name, folder, port):
    if port in FORBIDDEN:
        return f'  {name:<22} port {port} is in the forbidden range 8000-8010: change it in games.json'
    if not os.path.isdir(folder):
        return f'  {name:<22} folder not found: {folder}'
    if not port_free(port):
        return f'  {name:<22} http://localhost:{port}  (port already in use: assuming it is already running)'
    handler = functools.partial(NoCache, directory=folder)
    server = http.server.ThreadingHTTPServer(('', port), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f'  {name:<22} http://localhost:{port}'


def main():
    with open(os.path.join(HERE, 'games.json'), encoding='utf-8') as f:
        config = json.load(f)
    show_all = '--all' in sys.argv
    lines = [serve('Menu', HERE, config['menuPort'])]
    for g in config['games']:
        if g['status'] == 'hidden' and not show_all:
            continue
        lines.append(serve(g['title']['es'], os.path.normpath(os.path.join(HERE, g['folder'])), g['port']))
    menu = f"http://localhost:{config['menuPort']}"
    print('Navarra arcade:\n' + '\n'.join(lines) + f'\n\nOpen the menu at {menu}  (Ctrl+C to stop)', flush=True)
    if '--open' in sys.argv and '--no-open' not in sys.argv:
        webbrowser.open(menu)
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        print('\nStopped.')


if __name__ == '__main__':
    main()
