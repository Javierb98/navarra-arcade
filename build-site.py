#!/usr/bin/env python3
"""Build the online arcade: the menu plus every game, as one static website.

    python3 build-site.py

Writes site/: the menu at the top, each game under games/<id>/. Only the
files a browser needs are copied (no tests, tools or docs). GitHub Pages
publishes site/ (see .github/workflows/pages.yml). Run this again after
changing a game, then commit and push.
"""
import json
import os
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, 'site')
MENU_FILES = ['index.html', 'style.css', 'games.json', 'src', 'data', 'assets']
GAME_FILES = ['index.html', 'style.css', 'src', 'data', 'assets']


def copy(src, dst):
    if os.path.isdir(src):
        # *.local.* files and local/ folders are for testing on this Mac only.
        shutil.copytree(src, dst, ignore=shutil.ignore_patterns('.DS_Store', '.gitkeep', '*.local.*', 'local'))
    elif os.path.isfile(src):
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)


def main():
    with open(os.path.join(HERE, 'games.json'), encoding='utf-8') as f:
        config = json.load(f)
    shutil.rmtree(SITE, ignore_errors=True)
    for name in MENU_FILES:
        copy(os.path.join(HERE, name), os.path.join(SITE, name))
    # Tell the menu it's online, so it links to games/<id>/ instead of local ports.
    index = os.path.join(SITE, 'index.html')
    with open(index, encoding='utf-8') as f:
        html = f.read()
    html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="arcade-online" content="1">', 1)
    with open(index, 'w', encoding='utf-8') as f:
        f.write(html)
    open(os.path.join(SITE, '.nojekyll'), 'w').close()
    # Belt and braces: test sponsors must never reach the website.
    for d, _, files in os.walk(SITE):
        if any('.local.' in f for f in files) or os.path.basename(d) == 'local':
            raise SystemExit(f'refusing to publish test sponsor files found in {d}')

    for g in config['games']:
        if g['status'] == 'hidden':
            continue
        folder = os.path.normpath(os.path.join(HERE, g['folder']))
        if not os.path.isfile(os.path.join(folder, 'index.html')):
            raise SystemExit(f"{g['id']}: no index.html in {folder}")
        for name in GAME_FILES:
            copy(os.path.join(folder, name), os.path.join(SITE, 'games', g['id'], name))
        print(f"  {g['title']['es']:<22} -> site/games/{g['id']}/")
    size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(SITE) for f in fs)
    print(f'Built site/ ({size / 1e6:.1f} MB). Commit and push to publish it.')


if __name__ == '__main__':
    main()
