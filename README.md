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

Ports 8000–8010 are never used; `start.py` refuses them. If a port is already taken (say you left `npm start` running in a game folder), it says so and carries on.

## Playing

- **Menu:** stick left/right to choose, A or START to play. The selected game gets a large, slowly panning preview and an info panel: what it's about, **what you'll learn** (the history lesson), when and where it's set, and how many players.
- **Language:** press ↑ to reach the language picker (Castellano / Euskara / English), ← → to choose, then A or ↓ to go back to the games. C cycles languages from anywhere, and the mouse works too. The chosen language carries into the game.
- **Leaving a game:** hold START for 2 seconds (or press Esc), then A to confirm. You're back at the menu.
- **Espadas de Hispania** is played with a mouse. Esc means "cancel" inside it, so to leave, hold Esc (or START) for 2 seconds or click "← Menú de juegos" in the corner. It has no Basque yet, so Euskara opens it in Castellano. Left alone for 4 minutes, it goes back to the menu.
- **Nobody playing:** after 60 seconds idle plus a 10-second "Still playing?", a game returns to the menu by itself. After 30 seconds, the menu starts showing the games off one by one.

## Adding or changing games

Everything is in `games.json`. No code changes needed:

```json
{
  "id": "olite",
  "folder": "../navarra-olite",
  "port": 8730,
  "status": "soon",
  "thumb": null,
  "players": "1-2",
  "title": { "es": "Olite", "eu": "Erriberri", "en": "Olite" },
  "blurb": { "es": "...", "eu": "...", "en": "..." }
}
```

- `status`: `ready` (playable), `soon` (shown greyed out), `hidden` (not listed or served).
- `thumb`: a 480×270 picture in `assets/thumbs/`, `art:<name>` for a picture the menu paints itself (see `src/art.js`, used for Olite), or `null` for a plain card.
- `lesson`, `era`, `place`, `controls`: the info panel, each in `es`, `eu` and `en`. The history text is a draft for a historian to check.
- For a game to come back to the menu, it needs the small exit hook that Almadía and Pax Avant have in `src/ui/arcade.js`. The menu opens games as `?menu=<menu address>&lang=<es|eu|en>`.

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

The game folders must sit next to this one, as they do in `~/Documents/GitHub`.
