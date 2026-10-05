// Cabinet input: two players, each with an 8-way stick, buttons A/B/C and
// Start, plus a hidden admin button. Keyboard (arcade encoders pretend to be
// keyboards) and gamepads are merged; mappings come from data/controls.json.
//
// Call poll() once per fixed update. Each player then has held states
// (left, right, up, down, a, b, c, start), a stick value x/y in -1..1, and
// `pressed` edges for this update only. Directions auto-repeat in `pressed`
// so menus can be held.

const BUTTONS = ['left', 'right', 'up', 'down', 'a', 'b', 'c', 'd', 'start']; // d: the super button
const REPEAT_DELAY = 0.4, REPEAT_EVERY = 0.14;

const blank = () => ({
  x: 0, y: 0,
  ...Object.fromEntries(BUTTONS.map((k) => [k, false])),
  pressed: Object.fromEntries(BUTTONS.map((k) => [k, false])),
  held: Object.fromEntries(BUTTONS.map((k) => [k, 0])),
});

export class Input {
  constructor(cfg) {
    this.cfg = cfg;
    this.down = new Set();
    this.hit = new Set(); // keys that went down since the last poll
    this.players = [blank(), blank()];
    this.admin = false;
    this.activity = false; // anything pressed or pushed this poll
    const mapped = new Set([
      ...Object.values(cfg.keyboard.p1).flat(),
      ...Object.values(cfg.keyboard.p2).flat(),
      ...cfg.keyboard.admin,
      ...(cfg.keyboard.exit ?? []),
    ]);
    // Someone at a computer keyboard (letter keys), rather than a cabinet
    // (whose encoders send Ctrl, Alt, Space, digits and arrows): screens
    // then show the keys next to the button glyphs.
    this.keyboard = false;
    addEventListener('keydown', (e) => {
      if (mapped.has(e.code)) e.preventDefault();
      if (mapped.has(e.code) && e.code.startsWith('Key')) this.keyboard = true;
      if (!e.repeat) this.hit.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => {
      if (mapped.has(e.code)) e.preventDefault();
      this.down.delete(e.code);
    });
    addEventListener('blur', () => this.down.clear());
  }

  key(codes) {
    let held = false, hit = false;
    for (const c of codes) {
      if (this.down.has(c)) held = true;
      if (this.hit.has(c)) hit = true;
    }
    return { held: held || hit, hit };
  }

  poll(dt) {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
    const G = this.cfg.gamepad;
    this.activity = false;
    ['p1', 'p2'].forEach((id, i) => {
      const p = this.players[i], map = this.cfg.keyboard[id];
      const pad = pads[G[id]] ?? null;
      const btn = (n) => !!pad?.buttons?.[n]?.pressed;
      const ax = pad ? pad.axes[0] ?? 0 : 0, ay = pad ? pad.axes[1] ?? 0 : 0;
      const now = {
        left: btn(14) || ax < -G.deadzone, right: btn(15) || ax > G.deadzone,
        up: btn(12) || ay < -G.deadzone, down: btn(13) || ay > G.deadzone,
        a: btn(G.buttons.a), b: btn(G.buttons.b), c: btn(G.buttons.c), d: G.buttons.d != null && btn(G.buttons.d), start: btn(G.buttons.start),
      };
      for (const k of BUTTONS) {
        const kb = this.key(map[k] ?? []);
        const held = now[k] || kb.held;
        const was = p[k];
        let pressed = (held && !was) || kb.hit;
        if (held && ['left', 'right', 'up', 'down'].includes(k)) {
          const before = p.held[k];
          p.held[k] += dt;
          if (before >= REPEAT_DELAY && Math.floor((before - REPEAT_DELAY) / REPEAT_EVERY) !== Math.floor((p.held[k] - REPEAT_DELAY) / REPEAT_EVERY)) pressed = true;
        } else if (!held) p.held[k] = 0;
        p[k] = held;
        p.pressed[k] = pressed;
        if (held || pressed) this.activity = true;
      }
      // Analogue stick if there is one, otherwise the digital directions.
      p.x = Math.abs(ax) > G.deadzone ? ax : (p.right ? 1 : 0) - (p.left ? 1 : 0);
      p.y = Math.abs(ay) > G.deadzone ? ay : (p.down ? 1 : 0) - (p.up ? 1 : 0);
    });
    const adminPad = pads.some((pad) => pad?.buttons?.[G.buttons.admin]?.pressed);
    this.admin = this.key(this.cfg.keyboard.admin).hit || (adminPad && !this._adminPad);
    this._adminPad = adminPad;
    this.exit = this.key(this.cfg.keyboard.exit ?? []).hit;
    if (this.admin || this.exit) this.activity = true;
    this.hit.clear();
  }

  // Either player pressed this button this update.
  any(button) { return this.players.some((p) => p.pressed[button]); }

  // What the race engine wants from one player.
  raceInput(i) {
    const p = this.players[i];
    return { x: p.x, y: p.y, a: p.pressed.a, b: p.b, c: p.pressed.c };
  }
}
