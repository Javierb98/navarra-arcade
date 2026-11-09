# Navarra Arcade

The game menu for the Navarra history arcade cabinets. It starts every game on its own local port and lets players choose one with the joystick. Every game returns here when players exit.

## One command to start everything

```sh
cd ~/Documents/GitHub
./fire-up-arcade
```

This starts the menu and every game, and opens the menu in your browser. `~/Documents/GitHub/fire-up-arcade` is a link to the script in this folder, so `./fire-up-arcade` from inside `navarra-arcade` works too, as does `npm start`. Add `--no-open` to start without opening a browser, or `--all` to include hidden games. Ctrl+C stops them all. It only needs Python 3, which Raspberry Pi OS already has.

| What | Address |
| --- | --- |
| Menu | http://localhost:8700 |
| ¡Almadía! | http://localhost:8710 |
| Pax Avant | http://localhost:8720 |
| Olite (coming soon) | http://localhost:8730 |
| Espadas de Hispania | http://localhost:8740 |

**Modes:** the running arcade is in one of three modes. **Desktop** shows keys and offers every game for free. **Arcade** shows the cabinet's stick and buttons and offers every game for free. **Paid arcade** shows the cabinet, charges a coin a game and offers arcade games only. It starts in paid with `--paid`, in arcade on the Pi (or with `--cabinet`), and in desktop otherwise. Off the Pi (or with `--dev`) the menu has a small **DEV** chip in the top-left corner: hover it and click a mode, or press **F8** to step through them. The switch changes the running arcade without a restart, and the menu and every game pick it up on their next load (the server's `/mode`).

**Paid arcade:** `~/fire-up-arcade --paid` (or `--paid --price=1.00`) makes every game cost a coin (0.50 € by default). It only offers the arcade games: the longer desktop games (`"kind": "desktop"` in `games.json`) are left out. The menu shows the credits and asks for a coin; starting a game spends one, and when the game ends it goes back to the menu. The coin mechanism must send the key **5**. Credits survive a restart (`credits.json`) and every coin is logged with its time in `coins.log` (both stay off git). Off the Pi it runs in dev mode: **5** on the keyboard adds a coin.

Ports 8000–8010 are never used; `start.py` refuses them. If a port is already taken (say you left `npm start` running in a game folder), it says so and carries on.

## Putting it online

The whole arcade (menu plus every game) goes online as **one website** on GitHub Pages:

```sh
./publish-arcade
```

It runs the tests, rebuilds `site/` from the latest version of every game (`build-site.py`), commits, pushes, and publishes `site/` as the `gh-pages` branch, which GitHub Pages serves at **https://javierb98.github.io/navarra-arcade/**. Run it again whenever a game changes, or the website keeps the old version.

Online, the menu opens the games from `games/<id>/` on the same site; on your Mac, `./fire-up-arcade` keeps using the local ports.

## Playing

- **Menu:** stick left/right to choose, A or START to play. The selected game gets a large, slowly panning preview and an info panel: what it's about, **what you'll learn** (the history lesson), when and where it's set, and how many players.
- **Language:** press ↑ to reach the language picker (Castellano / Euskara / English), ← → to choose, then A or ↓ to go back to the games. C cycles languages from anywhere, and the mouse works too. The chosen language carries into the game.
- **Leaving a game:** hold START for 2 seconds (or press Esc), then A to confirm. You're back at the menu.
- **Espadas de Hispania** is played with a mouse. Esc means "cancel" inside it, so to leave, hold Esc (or START) for 2 seconds or click "← Menú de juegos" in the corner. It has no Basque yet, so Euskara opens it in Castellano. Left alone for 4 minutes, it goes back to the menu.
- **Instructions for the device in front of you:** every screen names the controls the player actually has. **The arcade machine** (a Raspberry Pi): the stick and the A/B/C/START buttons. `start.py` sees it's on a Pi (from `/proc/device-tree/model`) and stamps every page it serves; a browser on ARM Linux that isn't Android counts too. **A phone or tablet** (a touch screen): the on-screen pad and buttons, one player only, since the touch controls are player 1's. **A computer** (anything else, this Mac or the website): the keys, player 1 arrows + O P L, player 2 W A S D + R T F, Enter to start, Esc to leave. The menu passes the answer to each game as `device=`. To try the cabinet's instructions on this Mac: `./fire-up-arcade --cabinet`. On any address, `?device=cabinet`, `phone` or `computer` forces one. `npm run online` builds the website and serves it at http://localhost:8800.
- **Nobody playing:** after 60 seconds idle plus a 10-second "Still playing?", a game returns to the menu by itself. After 30 seconds, the menu starts showing the games off one by one.

## Where the code lives

**navarra-arcade** (this repository, public) holds no game or menu code: only the list of games (`games.json`), the scripts that start and publish the arcade, and links (git submodules) to the repositories that hold the code. The menu is in `menu/` and each game in `games/`:

| Folder | Repository |
| --- | --- |
| `menu` | Javierb98/navarra-menu (private): the game picker, its text, previews and font |
| `games/almadia` | Javierb98/navarra-almadia (private) |
| `games/pax-avant` | Javierb98/navarra-pax-avant (private) |
| `games/pelota` | Javierb98/navarra-pelota (private) |
| `games/kirolak` | Javierb98/navarra-herri-kirolak (private) |
| `games/jentilak` | Javierb98/navarra-jentilak (private) |
| `games/salinas` | Javierb98/navarra-salinas (private) |
| `games/minas` | Javierb98/navarra-minas (private) |
| `games/espadas` | Javierb98/navarra-1212 (private; the web game is its `mountain-kings/` folder) |

**Getting everything** (a new computer, or the Pi):

```sh
git clone --recursive https://github.com/Javierb98/navarra-arcade.git
```

(Already cloned without it? `git submodule update --init`.)

**Changing a game or the menu:** work inside its folder (`menu/` or under `games/`), which is a normal repository of its own: `cd games/pelota`, `git switch master` (or `main`) the first time, edit, commit there. Then `./publish-arcade` from the arcade pushes the game's commits, records which version of each game the arcade uses, and publishes the website. To take the newest version of every game from GitHub: `git submodule update --remote`.

## Adding or changing games

Everything is in `games.json`. No code changes needed:

```json
{
  "id": "olite",
  "folder": "games/olite",
  "port": 8730,
  "status": "soon",
  "kind": "arcade",
  "thumb": null,
  "players": "1-2",
  "title": { "es": "Olite", "eu": "Erriberri", "en": "Olite" },
  "blurb": { "es": "...", "eu": "...", "en": "..." }
}
```

- `status`: `ready` (playable), `soon` (shown greyed out), `hidden` (not listed or served).
- `kind`: `arcade` (a short game, made for the arcade machine) or `desktop` (a longer game to play at a computer, Flash-style: Salinas de Oro, The Green Men, Espadas de Hispania). The free arcade lists both; the paid arcade (`--paid`) neither lists nor serves desktop games.
- `thumb`: a 480×270 picture in `menu/assets/thumbs/`, `art:<name>` for a picture the menu paints itself (see `menu/src/art.js`, used for Olite), or `null` for a plain card.
- `lesson`, `era`, `place`, `controls`: the info panel, each in `es`, `eu` and `en`. The history text is a draft for a historian to check.
- For a game to come back to the menu, it needs the small exit hook that Almadía and Pax Avant have in `src/ui/arcade.js`. The menu opens games as `?menu=<menu address>&lang=<es|eu|en>`.

### Credits and sponsors

`menu/data/credits.json` is the maker's credit in the bottom-right corner ("Hecho por" Evocultiva). It is public.


`menu/data/sponsors.json` lists **confirmed** sponsors only (empty for now): they appear in the corner plate and on a big "Con el apoyo de" screen after the last game of the idle showcase, both on the website and on every cabinet. It takes (name, `logo`, optional `logoBig` for the panel, `plate: "dark"` for white logos, and a `tagline`). **Test mode:** to try out a sponsor before they've agreed, put them in `menu/data/sponsors.local.json` (logos in `menu/assets/sponsors/local/`). The menu on this Mac then shows them, marked TEST. That file is ignored by git, `build-site.py` refuses to publish it, and a cabinet set up from GitHub never has it.

`npm test` checks the list: unique ports outside 8000–8010, folders present, all three languages filled in, and every ready game has its exit hook.

## On the cabinet (Raspberry Pi)

Boot straight into the menu with Chromium in a minimal kiosk. This hasn't been tried on a Pi yet:

```ini
# /etc/systemd/system/arcade.service
[Unit]
Description=Navarra arcade
After=network.target

[Service]
User=arcade
WorkingDirectory=/home/arcade/navarra-arcade
ExecStart=/bin/sh -c 'python3 start.py & exec cage -- chromium-browser --kiosk --noerrdialogs --disable-infobars --autoplay-policy=no-user-gesture-required http://localhost:8700'
Restart=always

[Install]
WantedBy=multi-user.target
```

The games come with the arcade (see **Where the code lives**). Because the game repositories are private, log the Pi in to GitHub once before cloning: install `gh` and run `gh auth login`, then `gh auth setup-git`.

## Credits

The arcade's name is set in **BilboINC**, a typeface based on Basque vernacular lettering by Hélène Marian Srodogora, published by [Velvetyne](https://github.com/velvetyne/BilboINC) under CC BY-NC-SA (licence in `assets/fonts/BilboINC-licence.txt`). The arcade is free and non-commercial; the font file is never sold.
