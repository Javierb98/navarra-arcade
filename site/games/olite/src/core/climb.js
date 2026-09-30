// Piedra por piedra: two stonemasons, tied together by a rope, climb the
// palace of Olite floor by floor (in the spirit of Ice Climber). One level is
// one climb up a real part of the palace.
//
// Pure and seeded: no DOM, no clock, no Math.random. The UI calls
// step(inputs, dt) at a fixed rate and draws what it finds here.
//
// Units are pixels. The map is a grid of 48 px tiles, 20 wide; y grows down.
// A climber's (x, y) is the middle of their feet.
//
// Map characters (data/levels.json):
//   #  stone: solid          x  rubble: solid, breaks when hit from below or by a mallet
//   =  ledge: jump up through it, stand on it
//   c  crumbling ledge: gives way soon after you stand on it, comes back later
//   B  crate: solid, only there with one player (it stands in for a partner's boost)
//   m  moving scaffold board (a run of m is one board)
//   g  a carved stone: carry it to a slot    H  a slot: a missing part of the palace
//   _  pressure plate (a floor tile)          |  trapdoor/gate: open while a nearby plate is held
//   X  cracked wall: breaks like rubble, hides secrets
//   o  orange (points)    h  heart
//   k  storks fly across this row              r  a loose roof tile drops from here
//   S  where the climbers start                F  the royal banner at the top

import { makeRng } from './rng.js';

const SOLID = new Set(['#', 'x', 'X', 'B', '_', '|']);
const BREAKS = new Set(['x', 'X']);
const LEDGE = new Set(['=', 'c']);

export class Climb {
  constructor(data, { level = 0, players = 2, difficulty = 'normal', seed = 1, carry = null } = {}) {
    this.rules = data.rules;
    this.levelIndex = level;
    this.def = data.levels.levels[level];
    this.difficulty = this.rules.difficulty[difficulty] ? difficulty : 'normal';
    this.diff = this.rules.difficulty[this.difficulty];
    this.players = players === 1 ? 1 : 2;
    this.r = makeRng(seed);
    this.T = this.rules.tile;
    this.viewW = this.rules.view.w;
    this.viewH = this.rules.view.h;

    this.parse(this.def.map);

    const C = this.rules.climber;
    this.climbers = Array.from({ length: this.players }, (_, i) => ({
      i, x: this.spawn.x + i * this.T, y: this.spawn.y, vx: 0, vy: 0, dx: 0,
      w: C.w, h: C.h, face: 1, grounded: false, support: null, coyote: 0, buffer: 0, carry: null,
      stun: 0, safe: 0, hitT: 0, hitCool: 0, hitDone: false, hanging: false, atFlag: false,
      input: {},
    }));
    this.ropeLen = this.rules.rope.max * this.diff.ropeMul;

    this.hearts = carry?.hearts ?? this.diff.hearts;
    this.score = carry?.score ?? 0;
    this.stats = { gold: 0, goldTotal: this.slots.length, oranges: 0, shoos: 0, breaks: 0, falls: 0, secrets: 0 };
    this.storks = [];
    this.drops = [];
    this.wind = { on: false, dir: 1, t: this.def.wind ? this.def.wind.every : 0 };
    this.best = this.spawn.y;
    this.checkpoint = { x: this.spawn.x, y: this.spawn.y };
    this.camY = this.clampCam(this.spawn.y - this.viewH * this.rules.camera.lead);
    this.t = 0;
    this.events = [];
    this.finished = false;
    this.won = false;
    this.waitT = 0;
  }

  // ---- the map ------------------------------------------------------------------

  parse(rows) {
    const T = this.rules.tile;
    this.h = rows.length;
    this.w = rows[0].length;
    this.grid = rows.map((row) => row.split(''));
    this.items = [];
    this.movers = [];
    this.storkRows = [];
    this.droppers = [];
    this.crumbles = new Map();
    this.pieces = [];
    this.slots = [];
    this.plates = [];
    this.gates = [];
    for (let r = 0; r < this.h; r++) {
      for (let c = 0; c < this.w; c++) {
        const ch = this.grid[r][c];
        const at = { x: c * T + T / 2, y: r * T + T / 2 };
        if ('oh'.includes(ch)) { this.items.push({ type: ch, ...at, taken: false }); this.grid[r][c] = ' '; }
        else if (ch === 'g') { this.pieces.push({ i: this.pieces.length, ...at, home: { ...at }, vy: 0, held: null, placed: false }); this.grid[r][c] = ' '; }
        else if (ch === 'H') { this.slots.push({ c, r, ...at, filled: false }); this.grid[r][c] = ' '; }
        else if (ch === '_') this.plates.push({ c, r, pressed: false, latched: false });
        else if (ch === '|') this.gates.push({ c, r, open: false });
        else if (ch === 'S') { this.spawn = { x: at.x, y: (r + 1) * T }; this.grid[r][c] = ' '; }
        else if (ch === 'F') { this.flag = { x: at.x, y: (r + 1) * T, c, r }; this.grid[r][c] = ' '; }
        else if (ch === 'k') { if (!this.storkRows.includes(r)) this.storkRows.push(r); this.grid[r][c] = ' '; }
        else if (ch === 'r') { this.droppers.push({ c, r, x: at.x, y: r * T, t: 0, warn: 0 }); this.grid[r][c] = ' '; }
        else if (ch === 'B' && this.players === 2) this.grid[r][c] = ' ';
        else if (ch === 'm' && (c === 0 || this.grid[r][c - 1] !== 'm')) {
          let n = 0;
          while (this.grid[r][c + n] === 'm') n++;
          this.movers.push({ id: this.movers.length, x: c * T, y: r * T, w: n * T, dir: 1, dx: 0, row: r });
        }
      }
      for (let c = 0; c < this.w; c++) if (this.grid[r][c] === 'm') this.grid[r][c] = ' ';
    }
    // Each board slides between the walls on its row.
    for (const m of this.movers) {
      const c0 = Math.floor(m.x / T);
      let a = c0, b = c0 + m.w / T - 1;
      while (a > 0 && !SOLID.has(this.grid[m.row][a - 1])) a--;
      while (b < this.w - 1 && !SOLID.has(this.grid[m.row][b + 1])) b++;
      m.min = a * T;
      m.max = (b + 1) * T - m.w;
    }
    this.storkT = this.storkRows.map((_, k) => 1 + k * 1.3);
    // Slots name real parts of the palace, lowest first (data: level.parts).
    this.slots.sort((a, b) => b.r - a.r || a.c - b.c);
    this.slots.forEach((sl, k) => { sl.i = k; sl.part = this.def.parts?.[k] ?? null; });
    // A gate answers to the plates within a few floors of it.
    for (const gt of this.gates) gt.plates = this.plates.filter((p) => Math.abs(p.r - gt.r) <= 7);
    if (!this.spawn) throw new Error(`${this.def.id}: no S in the map`);
    if (!this.flag) throw new Error(`${this.def.id}: no F in the map`);
  }

  tile(c, r) {
    if (c < 0 || c >= this.w) return '#';
    if (r < 0 || r >= this.h) return ' ';
    const ch = this.grid[r][c];
    if (ch === 'c' && this.crumbles.get(`${c},${r}`)?.broken) return ' ';
    if (ch === '|' && this.gateAt(c, r)?.open) return ' ';
    return ch;
  }

  gateAt(c, r) { return this.gates.find((g) => g.c === c && g.r === r); }

  get mapH() { return this.h * this.T; }
  clampCam(y) { return Math.max(0, Math.min(this.mapH - this.viewH, y)); }
  emit(type, extra = {}) { this.events.push({ type, ...extra }); }

  // ---- moving a body through the map ------------------------------------------------

  moveX(b, dx) {
    if (!dx) return;
    const T = this.T;
    b.x += dx;
    const top = b.y - b.h + 1, bottom = b.y - 1;
    const edge = dx > 0 ? b.x + b.w / 2 : b.x - b.w / 2;
    const c = Math.floor(edge / T);
    for (let r = Math.floor(top / T); r <= Math.floor(bottom / T); r++) {
      if (!SOLID.has(this.tile(c, r))) continue;
      b.x = dx > 0 ? c * T - b.w / 2 - 0.01 : (c + 1) * T + b.w / 2 + 0.01;
      b.vx = 0;
      return;
    }
  }

  moveY(b, dy, others = []) {
    if (!dy) return;
    const T = this.T;
    const left = b.x - b.w / 2 + 2, right = b.x + b.w / 2 - 2;
    const c0 = Math.floor(left / T), c1 = Math.floor(right / T);
    if (dy < 0) {
      const top = b.y - b.h + dy;
      const r = Math.floor(top / T);
      const hit = [];
      for (let c = c0; c <= c1; c++) if (SOLID.has(this.tile(c, r))) hit.push(c);
      if (hit.length) {
        b.y = (r + 1) * T + b.h + 0.01;
        if (b.vy < 0) b.vy = 0;
        for (const c of hit) this.bump(c, r);
        return;
      }
      b.y += dy;
      return;
    }
    const before = b.y, after = b.y + dy;
    // Tiles: the first tile top crossed on the way down.
    for (let r = Math.floor((before - 0.02) / T) + 1; r * T <= after; r++) {
      for (let c = c0; c <= c1; c++) {
        const ch = this.tile(c, r);
        if (SOLID.has(ch) || LEDGE.has(ch)) { this.land(b, r * T, { type: 'tile', c, r }); return; }
      }
    }
    // Scaffold boards and the partner's head.
    for (const m of this.movers) {
      if (before <= m.y + 0.02 && after >= m.y && right > m.x && left < m.x + m.w) { this.land(b, m.y, { type: 'mover', id: m.id }); return; }
    }
    for (const o of others) {
      const top = o.y - o.h;
      if (before <= top + 0.02 && after >= top && Math.abs(o.x - b.x) < (o.w + b.w) / 2 - 4) { this.land(b, top, { type: 'body', i: o.i }); return; }
    }
    b.y = after;
  }

  land(b, y, support) {
    b.y = y;
    if (b.vy > 0) b.vy = 0;
    b.grounded = true;
    b.support = support;
  }

  // Moves in small steps so nothing tunnels through a tile.
  moveBy(b, dx, dy, others) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 6));
    for (let k = 0; k < n; k++) { this.moveX(b, dx / n); this.moveY(b, dy / n, others); }
  }

  // Hitting a tile from below (or with the mallet): rubble breaks.
  bump(c, r) {
    const ch = this.tile(c, r);
    if (!BREAKS.has(ch)) { this.emit('bonk', { c, r }); return; }
    this.grid[r][c] = ' ';
    this.stats.breaks++;
    if (ch === 'X') { this.stats.secrets++; this.emit('secret', { c, r, x: c * this.T + this.T / 2, y: r * this.T + this.T / 2 }); }
    this.score += this.rules.score.break;
    this.emit('break', { c, r, x: c * this.T + this.T / 2, y: r * this.T + this.T / 2 });
  }

  // ---- the step --------------------------------------------------------------------------

  // inputs[i]: { left, right, up, down, jump, jumpPressed, hitPressed, tug }
  step(inputs, dt) {
    this.events = [];
    if (this.finished) return;
    this.t += dt;
    this.updateWorld(dt);
    for (const b of this.climbers) this.updateClimber(b, inputs[b.i] ?? {}, dt);
    if (this.players === 2) this.rope(dt);
    for (const b of this.climbers) this.touch(b);
    this.falls();
    this.camera(dt);
    this.checkFlag(dt);
  }

  updateWorld(dt) {
    const R = this.rules, mul = this.diff.hazardMul;
    for (const m of this.movers) {
      const x0 = m.x;
      m.x += m.dir * (this.def.moverSpeed ?? R.mover.speed) * dt;
      if (m.x < m.min) { m.x = m.min; m.dir = 1; }
      if (m.x > m.max) { m.x = m.max; m.dir = -1; }
      m.dx = m.x - x0;
    }
    for (const [key, cr] of this.crumbles) {
      if (cr.broken) { if ((cr.back -= dt) <= 0) { cr.broken = false; cr.t = 0; this.emit('restored', { key }); } }
      else if (cr.standing) { if ((cr.t += dt) >= R.crumble.after) { cr.broken = true; cr.back = R.crumble.back; const [c, r] = key.split(',').map(Number); this.emit('crumble', { c, r }); } }
      cr.standing = false;
    }
    this.updatePlates();
    for (const p of this.pieces) {
      if (p.cool > 0) p.cool -= dt;
      if (p.held == null && !p.placed && p.vy > 0) this.dropPiece(p, dt);
    }
    const visible = (y) => y > this.camY - this.T && y < this.camY + this.viewH;
    // Storks cross their rows every so often, but only on screen.
    if (mul > 0) this.storkRows.forEach((row, k) => {
      if ((this.storkT[k] -= dt) > 0 || !visible(row * this.T)) return;
      this.storkT[k] = R.stork.every / mul * this.r.range(0.8, 1.3);
      const dir = this.r.chance(0.5) ? 1 : -1;
      this.storks.push({ x: dir > 0 ? -40 : this.viewW + 40, base: row * this.T + this.T / 2, y: row * this.T + this.T / 2, dir, t: 0, flee: false, vy: 0 });
      this.emit('stork');
    });
    for (const s of this.storks) {
      s.t += dt;
      s.x += s.dir * R.stork.speed * (s.flee ? 1.8 : 1) * dt;
      if (s.flee) { s.vy -= 500 * dt; s.y += s.vy * dt; } else s.y = s.base + Math.sin(s.t * 3) * 10;
    }
    this.storks = this.storks.filter((s) => s.x > -80 && s.x < this.viewW + 80 && s.y > this.camY - 200);
    // Loose roof tiles wobble, then fall.
    if (mul > 0) for (const d of this.droppers) {
      if (!visible(d.y)) continue;
      if (d.warn > 0) { if ((d.warn -= dt) <= 0) { this.drops.push({ x: d.x, y: d.y + 8, vy: 0 }); this.emit('drop'); } continue; }
      if ((d.t += dt) >= R.drop.every / mul) { d.t = this.r.range(-1, 0); d.warn = R.drop.warn; this.emit('wobble', { c: d.c, r: d.r }); }
    }
    for (const p of this.drops) {
      p.vy = Math.min(900, p.vy + R.climber.gravity * dt);
      p.y += p.vy * dt;
      const ch = this.tile(Math.floor(p.x / this.T), Math.floor((p.y + 8) / this.T));
      if (SOLID.has(ch) || LEDGE.has(ch) || p.y > this.camY + this.viewH + 60) { p.gone = true; this.emit('shatter', { x: p.x, y: p.y }); }
    }
    this.drops = this.drops.filter((p) => !p.gone);
    // Gusts of wind, turn and turn about.
    if (this.def.wind) {
      const W = this.def.wind;
      if ((this.wind.t -= dt) <= 0) {
        this.wind.on = !this.wind.on;
        this.wind.t = this.wind.on ? W.lasts : W.every;
        if (this.wind.on) { this.wind.dir = this.r.chance(0.5) ? 1 : -1; this.emit('gust', { dir: this.wind.dir }); }
      }
    }
  }

  // Plates are pressed by anyone standing on them. With one player a plate
  // stays down once pressed, since nobody is there to hold it.
  updatePlates() {
    for (const p of this.plates) {
      const was = p.pressed;
      p.pressed = this.climbers.some((b) => b.grounded && b.support?.type === 'tile' && b.support.c === p.c && b.support.r === p.r);
      if (p.pressed && this.players === 1) p.latched = true;
      if (p.pressed !== was) this.emit(p.pressed ? 'plateDown' : 'plateUp', { c: p.c, r: p.r });
    }
    for (const gt of this.gates) {
      const want = gt.plates.some((p) => p.pressed || p.latched);
      if (want === gt.open) continue;
      // A gate never shuts on someone standing in it.
      const x0 = gt.c * this.T, y0 = gt.r * this.T;
      if (!want && this.climbers.some((b) => b.x + b.w / 2 > x0 && b.x - b.w / 2 < x0 + this.T && b.y > y0 && b.y - b.h < y0 + this.T)) continue;
      gt.open = want;
      this.emit(want ? 'gateOpen' : 'gateShut', { c: gt.c, r: gt.r });
    }
  }

  // A dropped carved stone falls to the next floor.
  dropPiece(p, dt) {
    p.vy = Math.min(900, p.vy + this.rules.climber.gravity * dt);
    const y = p.y + p.vy * dt, c = Math.floor(p.x / this.T);
    const r = Math.floor((y + 12) / this.T);
    const ch = this.tile(c, r);
    if (SOLID.has(ch) || LEDGE.has(ch)) { p.y = r * this.T - 12; p.vy = 0; p.resting = true; return; }
    p.y = y;
    if (p.y > this.mapH) Object.assign(p, { x: p.home.x, y: p.home.y, vy: 0 });
  }

  drop(b) {
    if (b.carry == null) return;
    const p = this.pieces[b.carry];
    Object.assign(p, { held: null, x: b.x, y: b.y - b.h - 8, vy: 1, resting: false, cool: 1 });
    b.carry = null;
    this.emit('dropPiece', { i: b.i, x: p.x, y: p.y });
  }

  updateClimber(b, inp, dt) {
    const C = this.rules.climber;
    b.input = inp;
    const x0 = b.x;
    // Ride what you stand on.
    if (b.grounded && b.support?.type === 'mover') this.moveX(b, this.movers[b.support.id].dx);
    if (b.grounded && b.support?.type === 'body') this.moveX(b, this.climbers[b.support.i].dx);

    b.stun = Math.max(0, b.stun - dt);
    b.safe = Math.max(0, b.safe - dt);
    b.hitCool = Math.max(0, b.hitCool - dt);
    const free = b.stun <= 0;
    const want = free ? (inp.right ? 1 : 0) - (inp.left ? 1 : 0) : 0;
    if (want) b.face = want;
    const accel = b.grounded ? C.accelGround : C.accelAir;
    // A gust shifts the speed you settle at: walk into it and you barely move.
    const target = want * C.speed * (b.carry != null ? this.rules.carry.speed : 1) + (this.wind.on ? this.wind.dir * this.def.wind.force : 0);
    b.vx += Math.max(-accel * dt, Math.min(accel * dt, target - b.vx));

    b.coyote = b.grounded ? C.coyote : b.coyote - dt;
    b.buffer = free && inp.jumpPressed ? C.buffer : b.buffer - dt;
    if (b.buffer > 0 && b.coyote > 0) {
      b.vy = -C.jumpSpeed;
      b.buffer = 0; b.coyote = 0;
      b.grounded = false; b.support = null;
      this.emit('jump', { i: b.i });
    }
    b.vy += C.gravity * dt;
    if (!inp.jump && b.vy < 0) b.vy += C.gravity * (C.shortHop - 1) * dt;
    b.vy = Math.min(b.vy, C.maxFall);

    // The mallet.
    if (free && inp.hitPressed && b.hitCool <= 0 && b.carry == null) {
      b.hitT = this.rules.hit.time; b.hitCool = this.rules.hit.cooldown; b.hitDone = false;
      this.emit('swing', { i: b.i });
    }
    if (b.hitT > 0) { b.hitT -= dt; if (!b.hitDone) this.swing(b); }

    const others = this.climbers.filter((o) => o !== b);
    this.moveX(b, b.vx * dt);
    b.grounded = false;
    b.support = null;
    this.moveY(b, b.vy * dt, others);
    if (b.grounded && b.support.type === 'tile') {
      const { c, r } = b.support;
      if (this.tile(c, r) === 'c') {
        const key = `${c},${r}`;
        if (!this.crumbles.has(key)) this.crumbles.set(key, { t: 0, broken: false, back: 0 });
        this.crumbles.get(key).standing = true;
      } else if (b.y < this.checkpoint.y) this.checkpoint = { x: b.x, y: b.y };
      if (b.y < this.best) this.best = b.y;
    }
    if (b.grounded && b.support.type === 'mover' && b.y < this.best) this.best = b.y;
    b.dx = b.x - x0;
  }

  swing(b) {
    const reach = this.rules.hit.reach;
    const x0 = b.face > 0 ? b.x : b.x - b.w / 2 - reach, x1 = b.face > 0 ? b.x + b.w / 2 + reach : b.x;
    const y0 = b.y - b.h - 6, y1 = b.y - 6;
    for (const s of this.storks) {
      if (s.flee || s.x < x0 - 16 || s.x > x1 + 16 || s.y < y0 - 12 || s.y > y1 + 12) continue;
      s.flee = true; s.dir = b.face; s.vy = -120;
      b.hitDone = true;
      this.stats.shoos++;
      this.score += this.rules.score.shoo;
      this.emit('shoo', { x: s.x, y: s.y });
    }
    for (const p of this.drops) if (p.x > x0 && p.x < x1 && p.y > y0 - 20 && p.y < y1) { p.gone = true; this.emit('shatter', { x: p.x, y: p.y }); }
    // Rubble right in front of you.
    const c = Math.floor((b.face > 0 ? x1 - 4 : x0 + 4) / this.T);
    for (const r of [Math.floor((b.y - 10) / this.T), Math.floor((b.y - b.h + 4) / this.T)]) {
      if (BREAKS.has(this.tile(c, r))) { this.bump(c, r); b.hitDone = true; }
    }
  }

  // ---- the rope ---------------------------------------------------------------------------

  // The two are tied together. A climber who is standing holds the one who
  // isn't; holding C (standing) or up (hanging) reels the rope in.
  rope(dt) {
    const R = this.rules.rope, [a, b] = this.climbers;
    const max = R.max * this.diff.ropeMul;
    const reelA = (a.input.tug && a.grounded) || (a.input.up && a.hanging);
    const reelB = (b.input.tug && b.grounded) || (b.input.up && b.hanging);
    this.reeling = reelA || reelB;
    this.ropeLen = this.reeling ? Math.max(R.min, this.ropeLen - R.reel * dt) : Math.min(max, this.ropeLen + R.relax * dt);
    a.hanging = b.hanging = false;
    const ax = a.x, ay = a.y - a.h / 2, bx = b.x, by = b.y - b.h / 2;
    const d = Math.hypot(bx - ax, by - ay);
    if (d <= this.ropeLen || d < 1) return;
    const excess = d - this.ropeLen, nx = (bx - ax) / d, ny = (by - ay) / d;
    // Who gets pulled?
    let pullA = 0.5, pullB = 0.5;
    if ((a.input.tug && a.grounded) || (a.grounded && !b.grounded)) { pullA = 0; pullB = 1; }
    else if ((b.input.tug && b.grounded) || (b.grounded && !a.grounded)) { pullA = 1; pullB = 0; }
    if (pullB) {
      this.moveBy(b, -nx * excess * pullB, -ny * excess * pullB, [a]);
      const vr = b.vx * nx + b.vy * ny;
      if (vr > 0) { b.vx -= nx * vr; b.vy -= ny * vr; }
      if (!b.grounded) b.hanging = true;
      if (-ny * excess * pullB < -0.5) { b.grounded = false; b.support = null; }
    }
    if (pullA) {
      this.moveBy(a, nx * excess * pullA, ny * excess * pullA, [b]);
      const vr = -(a.vx * nx + a.vy * ny);
      if (vr > 0) { a.vx += nx * vr; a.vy += ny * vr; }
      if (!a.grounded) a.hanging = true;
      if (ny * excess * pullA < -0.5) { a.grounded = false; a.support = null; }
    }
    // Reeled all the way in: the one hanging scrambles up beside the other.
    if (this.ropeLen <= R.min + 1) {
      if (pullA && a.hanging && b.grounded) this.mantle(a, b);
      else if (pullB && b.hanging && a.grounded) this.mantle(b, a);
    }
  }

  mantle(b, anchor) {
    if (b.y < anchor.y - 4) return;
    const T = this.T, side = Math.sign(b.x - anchor.x) || 1;
    for (const dir of [side, -side]) {
      const x = anchor.x + dir * (b.w + 4);
      const c = Math.floor(x / T), r = Math.floor((anchor.y - 1) / T);
      const free = [Math.floor((x - b.w / 2) / T), Math.floor((x + b.w / 2) / T)].every((cc) => !SOLID.has(this.tile(cc, r)));
      const held = SOLID.has(this.tile(c, r + 1)) || LEDGE.has(this.tile(c, r + 1));
      if (!free || !held) continue;
      Object.assign(b, { x, y: anchor.y, vx: 0, vy: 0, grounded: true, hanging: false, support: { type: 'tile', c, r: r + 1 } });
      this.ropeLen = this.rules.rope.max * this.diff.ropeMul * 0.6;
      this.emit('mantle', { i: b.i });
      return;
    }
  }

  // ---- things you touch ---------------------------------------------------------------------

  touch(b) {
    const S = this.rules.score;
    const left = b.x - b.w / 2, right = b.x + b.w / 2, top = b.y - b.h, bottom = b.y;
    for (const it of this.items) {
      if (it.taken || it.x < left - 16 || it.x > right + 16 || it.y < top - 16 || it.y > bottom + 16) continue;
      it.taken = true;
      if (it.type === 'g') { this.stats.gold++; this.score += S.gold; }
      else if (it.type === 'o') { this.stats.oranges++; this.score += S.orange; }
      else if (it.type === 'h') { this.hearts = Math.min(this.diff.maxHearts, this.hearts + 1); }
      this.emit('pickup', { kind: it.type, x: it.x, y: it.y, i: b.i });
    }
    // Carved stones: pick one up, carry it to a slot.
    for (const p of this.pieces) {
      if (b.carry != null || p.held != null || p.placed || p.cool > 0 || Math.abs(p.x - b.x) > 26 || p.y < top - 18 || p.y > bottom + 8) continue;
      p.held = b.i; b.carry = p.i;
      this.emit('pickup', { kind: 'p', x: p.x, y: p.y, i: b.i });
    }
    if (b.carry != null) {
      const p = this.pieces[b.carry];
      p.x = b.x; p.y = b.y - b.h - 12;
      const sl = this.slots.find((q) => !q.filled && Math.abs(q.x - b.x) < 40 && Math.abs(q.y - (b.y - b.h / 2)) < 44);
      if (sl) {
        sl.filled = true; p.placed = true; p.held = null; b.carry = null;
        Object.assign(p, { x: sl.x, y: sl.y });
        this.stats.gold++; this.score += S.gold;
        this.emit('placed', { slot: sl.i, part: sl.part, x: sl.x, y: sl.y, i: b.i });
      }
    }
    if (b.safe > 0 || b.stun > 0) return;
    const hurt = (fromX) => {
      this.drop(b);
      b.stun = this.rules.stork.stun;
      b.safe = this.rules.stork.stun + 0.6;
      b.vx = (b.x >= fromX ? 1 : -1) * this.rules.stork.knock;
      b.vy = -260;
      b.grounded = false; b.support = null;
      this.emit('hurt', { i: b.i, x: b.x, y: b.y });
    };
    for (const s of this.storks) if (!s.flee && Math.abs(s.x - b.x) < 30 && s.y > top - 10 && s.y < bottom + 4) { hurt(s.x); return; }
    for (const p of this.drops) if (Math.abs(p.x - b.x) < 24 && p.y > top - 8 && p.y < bottom) { p.gone = true; hurt(p.x); return; }
  }

  // ---- falling, the camera, the banner ------------------------------------------------------

  falls() {
    const limit = this.camY + this.viewH + 40;
    const down = this.climbers.filter((b) => b.y - b.h > limit);
    if (!down.length) return;
    for (const b of down) {
      if (b.carry != null) { const p = this.pieces[b.carry]; Object.assign(p, { held: null, x: p.home.x, y: p.home.y, vy: 0 }); b.carry = null; }
      this.hearts--;
      this.stats.falls++;
      this.emit('fall', { i: b.i });
    }
    if (this.hearts <= 0) { this.hearts = 0; this.end(false); return; }
    // Back in play: next to a partner who is safely standing, or on the highest safe floor.
    const partner = this.climbers.find((o) => !down.includes(o) && o.grounded);
    for (const b of down) {
      const at = partner ? { x: partner.x, y: partner.y - 2 } : this.checkpoint;
      Object.assign(b, { x: at.x, y: at.y - 60, vx: 0, vy: 0, stun: 0, safe: this.rules.respawnSafe, grounded: false, support: null });
      this.emit('respawn', { i: b.i });
    }
    this.ropeLen = this.rules.rope.max * this.diff.ropeMul;
    // Never bring someone back below the bottom of the view.
    const lowest = Math.max(...down.map((b) => b.y));
    if (lowest > this.camY + this.viewH - 60) this.camY = this.clampCam(lowest - this.viewH * this.rules.camera.lead);
  }

  // Like Ice Climber, the view only ever goes up: it follows the highest floor reached.
  camera(dt) {
    const target = this.clampCam(this.best - this.viewH * this.rules.camera.lead);
    if (target < this.camY) this.camY = Math.max(target, this.camY - Math.max(40, (this.camY - target) * 4) * dt);
  }

  checkFlag(dt) {
    const F = this.flag;
    for (const b of this.climbers) b.atFlag = Math.abs(b.x - F.x) < this.T * 1.6 && Math.abs(b.y - F.y) < this.T;
    const at = this.climbers.filter((b) => b.atFlag).length;
    if (at === this.climbers.length) { this.end(true); return; }
    if (at && (this.waitT -= dt) <= 0) { this.waitT = 4; this.emit('waitPartner'); }
  }

  end(won) {
    if (this.finished) return;
    this.finished = true;
    this.won = won;
    if (won) {
      this.timeBonus = Math.max(0, Math.round((this.def.par - this.t) * this.rules.score.perSecond));
      this.score += this.timeBonus;
      this.emit('won');
    } else this.emit('lost');
  }

  // Carried into the next level.
  carry() { return { hearts: this.hearts, score: this.score }; }

  // 0..3 stars for this climb: how much of the palace you restored.
  stars() {
    if (!this.won) return 0;
    const g = this.stats.goldTotal ? this.stats.gold / this.stats.goldTotal : 1;
    return g >= 1 ? 3 : g >= 0.5 ? 2 : 1;
  }
}
