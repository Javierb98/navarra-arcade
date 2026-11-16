// ¡Pelotari! Hand pelota (pelota a mano), one against one, on a village
// frontón. Both players face the same front wall (the frontis) and take
// turns: each hit must strike the frontis above the metal band at its foot
// (the chapa) and the other player must return it before its second bounce.
//
// Pure and seeded: no DOM, no clock, no Math.random. The UI calls
// step(inputs, dt) at a fixed rate and draws what it finds here.
//
// World units are metres. x runs across the court from the left wall (0) to
// the open right side (w); y runs back from the frontis (0) to the back line
// (l); z is height.
//
// Shots (data/rules.json "shots"), picked by button and stick at the moment
// of the hit:
//   A            drive: strikes high, comes back deep
//   A + left     txoko: into the left corner, off both walls, stays low
//   A + right    ancho: wide to the open side, close to the line
//   A + back     globo: a high lob that lands very deep
//   B            dejada: soft, dies close to the frontis (stick picks the side)

import { makeRng } from './rng.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function shotFor(button, stick = {}) {
  if (button === 'b') return 'dejada';
  const x = stick.x ?? 0, y = stick.y ?? 0;
  if (y > 0.5 && Math.abs(x) < 0.7) return 'globo';
  if (x < -0.5) return 'txoko';
  if (x > 0.5) return 'ancho';
  return 'drive';
}

export class Match {
  // opponent: the computer's profile (data/rules.json "opponents").
  constructor(rules, { players = 1, difficulty = 'normal', seed = 1, to = null, ai = null, opponent = null } = {}) {
    this.R = rules;
    this.C = rules.court;
    this.players = players === 2 ? 2 : 1;
    this.difficulty = rules.difficulty[difficulty] ? difficulty : 'normal';
    this.diff = rules.difficulty[this.difficulty];
    this.r = makeRng(seed);
    this.to = to ?? rules.match.to;
    // Red (0) and blue (1). With one player, blue is the computer.
    const aiFor = ai ?? [false, this.players === 1];
    const prof = (i) => (aiFor[i] ? (i === 1 && opponent) || rules.opponents[rules.match.defaultOpponent] : null);
    this.p = [0, 1].map((i) => ({ i, x: this.C.w * (i ? 0.66 : 0.34), y: this.C.l * 0.7, vx: 0, vy: 0, swing: 0, buffer: null, ai: aiFor[i], prof: prof(i), plan: null, react: 0, shot: null }));
    this.ball = { x: 5, y: 20, z: 1, vx: 0, vy: 0, vz: 0, wall: false, bounces: 0, lastHitter: 0, held: 0, spin: 0, kind: 'serve' };
    this.score = [0, 0];
    this.server = 0;
    this.turn = 1;
    this.phase = 'serve';
    this.phaseT = 0;
    this.t = 0;
    this.events = [];
    this.rally = 0;
    this.stats = { longest: 0, hits: [0, 0], perfect: [0, 0], shots: [{}, {}], faults: {} };
    this.winner = null;
    this.setupServe();
  }

  emit(type, extra = {}) { this.events.push({ type, ...extra }); }

  // ---- the serve ---------------------------------------------------------------------

  // Where each player stands for the serve.
  spots() {
    const s = this.server, C = this.C, out = [];
    out[s] = { x: C.w * 0.55, y: C.serveY };
    out[1 - s] = { x: C.w * 0.4, y: C.serveY + 6 };
    return out;
  }

  // Between points both players walk back to their spots.
  startWalk() {
    this.phase = 'walk';
    this.phaseT = 0;
    this.targets = this.spots();
    for (const pl of this.p) Object.assign(pl, { buffer: null, plan: null, shot: null });
    this.emit('walk', { p: this.server });
  }

  setupServe(snap = true) {
    const s = this.server, o = 1 - s, spots = this.spots();
    for (const i of [s, o]) {
      Object.assign(this.p[i], { vx: 0, vy: 0, swing: 0, buffer: null, plan: null });
      if (snap) Object.assign(this.p[i], spots[i]);
    }
    Object.assign(this.ball, { x: this.p[s].x + 0.4, y: this.p[s].y - 0.3, z: 1, vx: 0, vy: 0, vz: 0, wall: false, bounces: 0, lastHitter: s, held: s + 1 });
    this.phase = 'serve';
    this.phaseT = 0;
    this.rally = 0;
    this.emit('serveReady', { p: s });
  }

  serve(aim = 0) {
    const s = this.server;
    this.ball.held = 0;
    this.ball.z = 1.1;
    this.shoot(this.p[s], 'serve', { x: aim }, 1);
    this.phase = 'rally';
    this.emit('serve', { p: s });
  }

  // ---- shots ------------------------------------------------------------------------------

  // Send the ball at the frontis. The shot's speed and target height decide
  // its character; the stick picks where across the court it comes down.
  shoot(pl, kind, stick, quality) {
    const S = this.R.shots[kind], b = this.ball, C = this.C;
    const perfect = quality >= this.R.timing.perfect;
    const err = (1 - quality) * this.errorFor(pl) * (S.risk ?? 1) * (perfect ? 0.4 : 1);
    const n = () => (this.r.next() + this.r.next() + this.r.next() - 1.5) * 0.8;
    const zt = this.r.range(S.z[0], S.z[1]) + n() * err * 0.9;
    // Rallies get quicker as they go on; a clean hit is quicker still.
    const ramp = 1 + Math.min(this.R.match.rampMax, this.rally * this.R.match.ramp);
    const power = (perfect ? this.R.timing.perfectPower : 0.85 + 0.2 * quality) * ramp;
    const T = Math.max(0.3, b.y / (S.speed * power * this.r.range(0.94, 1.06)));
    let land;
    if (S.land != null) land = S.land * C.w;
    else land = C.w / 2 + clamp(stick.x ?? 0, -1, 1) * (C.w / 2 - 1);
    land = clamp(land, 0.5, C.w - 0.5);
    const k = (0.92 * S.back) / T;
    const xt = clamp((land + b.x * k) / (1 + k) + n() * err * 1.6, 0.15, C.w + 1.5);
    b.vx = (xt - b.x) / T;
    b.vy = -b.y / T;
    b.vz = (zt - b.z + 0.5 * this.R.ball.g * T * T) / T;
    b.wall = false; b.bounces = 0; b.lastHitter = pl.i; b.spin = kind === 'dejada' ? -1 : 1; b.kind = kind;
    this.turn = 1 - pl.i;
    this.stats.hits[pl.i]++;
    if (perfect) this.stats.perfect[pl.i]++;
    this.stats.shots[pl.i][kind] = (this.stats.shots[pl.i][kind] ?? 0) + 1;
    this.rally++;
    this.emit('hit', { p: pl.i, kind, quality, perfect, power, x: b.x, y: b.y, z: b.z });
  }

  errorFor(pl) { return pl.ai ? pl.prof.error : this.diff.error; }

  // How clean a hit is: best with the ball about waist-high, close in, and
  // struck right away rather than with the button pressed early.
  quality(pl, early = 0) {
    const b = this.ball, T = this.R.timing, d = Math.hypot(b.x - pl.x, b.y - pl.y);
    const hz = Math.abs(b.z - this.R.player.sweet);
    return clamp(1 - hz * T.height - Math.max(0, d - 0.55) * T.distance - early * T.early, 0, 1);
  }

  reachable(pl) {
    const P = this.R.player, b = this.ball;
    return this.phase === 'rally' && this.turn === pl.i && b.wall && b.bounces < 2
      && Math.hypot(b.x - pl.x, b.y - pl.y) <= P.reach * this.reachMul(pl) && b.z >= P.low && b.z <= P.high;
  }

  reachMul(pl) { return pl.ai ? 1 : this.diff.reach; }

  // ---- the step ------------------------------------------------------------------------------

  // inputs[i]: { x, y (stick, -1..1; y > 0 is back, away from the wall), a, b (pressed this step) }
  step(inputs, dt) {
    this.events = [];
    if (this.phase === 'over') return;
    this.t += dt;
    this.phaseT += dt;
    if (this.phase === 'walk') { this.walk(dt); return; }
    for (const pl of this.p) {
      const inp = pl.ai ? this.think(pl, dt) : (inputs[pl.i] ?? {});
      // Once a hit is pressed, the pelotari lunges for the ball by themself
      // and the stick only aims: aiming never walks you away from the ball.
      if (pl.buffer && this.lunging(pl)) this.lunge(pl, dt);
      else this.move(pl, inp, dt);
      if (inp.a || inp.b) pl.buffer = { button: inp.a ? 'a' : 'b', t: 0, stick: { x: inp.x ?? 0, y: inp.y ?? 0 } };
      if (pl.buffer) {
        if (inp.x != null) pl.buffer.stick = { x: inp.x, y: inp.y ?? 0 };
        if (this.phase === 'serve' && pl.i === this.server && this.phaseT > 0.4) { this.serve(pl.buffer.stick.x); pl.swing = this.R.player.swing; pl.buffer = null; }
        else if (this.reachable(pl)) {
          pl.swing = this.R.player.swing;
          this.shoot(pl, shotFor(pl.buffer.button, pl.buffer.stick), pl.buffer.stick, this.quality(pl, pl.buffer.t));
          pl.buffer = null;
        } else if ((pl.buffer.t += dt) > this.R.player.buffer) {
          if (this.phase === 'rally' && pl.i === this.turn) { pl.swing = this.R.player.swing; this.emit('whiff', { p: pl.i }); }
          pl.buffer = null;
        }
      }
      pl.swing = Math.max(0, pl.swing - dt);
    }
    this.separate();
    if (this.phase === 'serve') {
      const s = this.p[this.server];
      Object.assign(this.ball, { x: s.x + 0.4, y: s.y - 0.3, z: 1 + Math.abs(Math.sin(this.phaseT * 4)) * 0.5 });
      if (this.phaseT > this.R.match.serveWait) this.serve(0); // nobody serving: the ball goes anyway
    } else if (this.phase === 'rally') {
      const n = 4;
      for (let k = 0; k < n && this.phase === 'rally'; k++) this.fly(dt / n);
    } else if (this.phase === 'point' && this.phaseT > this.R.match.pointPause) {
      this.startWalk();
    }
    if (this.phase === 'point') this.fly(dt, true);
  }

  walk(dt) {
    const W = this.R.match.walk;
    let there = 0;
    for (const pl of this.p) {
      const tg = this.targets[pl.i], dx = tg.x - pl.x, dy = tg.y - pl.y, d = Math.hypot(dx, dy);
      const sp = this.R.player.speed * W.speed;
      if (d < 0.08) { pl.vx = pl.vy = 0; there++; continue; }
      const v = Math.min(sp, d / dt);
      pl.vx = (dx / d) * v; pl.vy = (dy / d) * v;
      pl.x += pl.vx * dt; pl.y += pl.vy * dt;
    }
    this.fly(dt, true);
    // The server picks the ball up on the way.
    if (there === 2 || this.phaseT > W.max) this.setupServe(this.phaseT > W.max);
  }

  lunging(pl) {
    const b = this.ball;
    return this.phase === 'rally' && this.turn === pl.i && b.wall && b.bounces < 2
      && Math.hypot(b.x - pl.x, b.y - pl.y) <= this.R.player.lunge * this.reachMul(pl);
  }

  lunge(pl, dt) {
    const b = this.ball, dx = b.x - pl.x, dy = b.y + 0.35 - pl.y, d = Math.hypot(dx, dy);
    const step = Math.min(d - 0.35, this.R.player.lungeSpeed * dt);
    if (step <= 0) { pl.vx *= 0.8; pl.vy *= 0.8; return; }
    pl.vx = (dx / d) * this.R.player.lungeSpeed; pl.vy = (dy / d) * this.R.player.lungeSpeed;
    pl.x += (dx / d) * step; pl.y += (dy / d) * step;
    pl.lungeT = 0.25;
  }

  move(pl, inp, dt) {
    const P = this.R.player, C = this.C;
    const serving = this.phase === 'serve' && pl.i === this.server;
    const sp = P.speed * (pl.ai ? pl.prof.speed : 1);
    let ix = serving ? 0 : clamp(inp.x ?? 0, -1, 1), iy = serving ? 0 : clamp(inp.y ?? 0, -1, 1);
    const len = Math.hypot(ix, iy);
    if (len > 1) { ix /= len; iy /= len; }
    const k = Math.min(1, P.accel * dt);
    pl.vx += (ix * sp - pl.vx) * k;
    pl.vy += (iy * sp - pl.vy) * k;
    pl.x = clamp(pl.x + pl.vx * dt, 0.35, C.w + 1.2);
    pl.y = clamp(pl.y + pl.vy * dt, 3, C.l + 2);
  }

  // Two pelotaris never stand in the same spot.
  separate() {
    const [a, b] = this.p, d = Math.hypot(a.x - b.x, a.y - b.y), min = 0.9;
    if (d >= min || d === 0) return;
    const push = (min - d) / 2, nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
    a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
  }

  // ---- the ball ---------------------------------------------------------------------------------

  fly(dt, dead = false) {
    const b = this.ball, B = this.R.ball, C = this.C;
    if (b.held) return;
    b.vz -= B.g * dt;
    const drag = 1 - B.drag * dt;
    b.vx *= drag; b.vy *= drag;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    // The frontis.
    if (b.y <= 0 && b.vy < 0) {
      b.y = 0;
      b.vy = -b.vy * B.eWall * (b.spin < 0 ? B.softWall : 1);
      b.vx *= 0.92; b.vz *= 0.85;
      if (!dead && !b.wall) {
        if (b.z < C.chapa) { this.emit('chapa', { x: b.x, z: b.z }); this.point(1 - b.lastHitter, 'chapa'); return; }
        if (b.z > C.top || b.x > C.w) { this.emit('wallOut', { x: b.x, z: b.z }); this.point(1 - b.lastHitter, 'fuera'); return; }
        b.wall = true;
        this.emit('wall', { x: b.x, z: b.z, speed: Math.hypot(b.vx, b.vy, b.vz) });
      }
    }
    // The left wall.
    if (b.x <= 0 && b.vx < 0) { b.x = 0; b.vx = -b.vx * B.eSide; if (!dead) this.emit('side', { y: b.y, z: b.z }); }
    // The floor.
    if (b.z <= B.r && b.vz < 0) {
      b.z = B.r;
      b.vz = -b.vz * B.eFloor;
      b.vx *= B.friction; b.vy *= B.friction;
      if (Math.abs(b.vz) < 0.8) b.vz = 0;
      if (dead) return;
      if (!b.wall) { this.emit('bounce', { x: b.x, y: b.y, n: 0 }); this.point(1 - b.lastHitter, 'corta'); return; }
      b.bounces++;
      this.emit('bounce', { x: b.x, y: b.y, n: b.bounces });
      const out = b.x > C.w || b.y > C.l;
      if (b.bounces === 1 && out) { this.point(1 - b.lastHitter, b.y > C.l ? 'larga' : 'fuera'); return; }
      if (b.bounces >= 2) { this.point(b.lastHitter, 'botes'); return; }
    }
    // Flew right off the court after a good bounce: the receiver missed it.
    if (!dead && b.wall && b.bounces >= 1 && (b.y > C.l + 3 || b.x > C.w + 4)) this.point(b.lastHitter, 'botes');
  }

  point(winner, reason) {
    this.score[winner]++;
    this.stats.longest = Math.max(this.stats.longest, this.rally);
    this.stats.faults[reason] = (this.stats.faults[reason] ?? 0) + 1;
    this.phase = 'point';
    this.phaseT = 0;
    this.server = winner;
    const matchPoint = this.score[winner] >= this.to;
    this.emit('point', { winner, reason, score: [...this.score], rally: this.rally, kind: this.ball.kind, last: matchPoint });
    if (matchPoint) {
      this.phase = 'over';
      this.winner = winner;
      this.emit('over', { winner });
    }
  }

  // ---- the computer pelotari --------------------------------------------------------------------------

  // Where will the ball be, a little ahead? Runs the same physics on a copy.
  predict(secs = 3, step = 1 / 30) {
    const saved = { ...this.ball }, keep = { phase: this.phase, events: this.events, score: [...this.score], stats: this.stats, server: this.server, rally: this.rally, turn: this.turn, winner: this.winner, phaseT: this.phaseT };
    this.stats = JSON.parse(JSON.stringify(this.stats));
    this.events = [];
    const path = [];
    for (let t = step; t <= secs && this.phase === 'rally'; t += step) {
      this.fly(step);
      if (this.phase === 'rally') path.push({ t, x: this.ball.x, y: this.ball.y, z: this.ball.z, wall: this.ball.wall, bounces: this.ball.bounces });
    }
    Object.assign(this.ball, saved);
    Object.assign(this, keep);
    return path;
  }

  // Which shot, given where the other player stands and this player's style.
  choose(pl) {
    const other = this.p[1 - pl.i], C = this.C, st = pl.prof.style, r = this.r.next();
    let kind = 'drive';
    if (other.y > C.l * 0.7 && r < st.dejada) kind = 'dejada';
    else if (other.y < C.l * 0.5 && r < st.globo) kind = 'globo';
    else if (other.x > C.w * 0.55 && r < st.txoko) kind = 'txoko';
    else if (other.x < C.w * 0.45 && r < st.ancho) kind = 'ancho';
    const stick = { x: kind === 'txoko' ? -1 : kind === 'ancho' ? 1 : other.x > C.w / 2 ? -this.r.range(0.3, 1) : this.r.range(0.3, 1), y: kind === 'globo' ? 1 : 0 };
    return { button: kind === 'dejada' ? 'b' : 'a', stick };
  }

  think(pl, dt) {
    const A = pl.prof, C = this.C, P = this.R.player, b = this.ball;
    const other = this.p[1 - pl.i];
    const go = (tx, ty) => {
      const dx = tx - pl.x, dy = ty - pl.y, d = Math.hypot(dx, dy);
      return d < 0.15 ? { x: 0, y: 0 } : { x: dx / Math.max(d, 0.6), y: dy / Math.max(d, 0.6) };
    };
    if (this.phase === 'serve') {
      if (pl.i === this.server && this.phaseT > 0.9 + A.react * 3) return { a: true, x: this.r.range(-0.6, 0.8) };
      return pl.i === this.server ? {} : go(C.w * 0.45, C.serveY + 6);
    }
    if (this.phase !== 'rally') { pl.plan = null; return {}; }
    if (this.turn !== pl.i) {
      pl.plan = null; pl.shot = null;
      // Back to a good base between shots, clear of the striker.
      const bx = other.x > C.w / 2 ? C.w * 0.38 : C.w * 0.62;
      return go(bx, C.l * A.base);
    }
    // Plan an intercept once the ball is on its way back, after a reaction time.
    if (!b.wall) { pl.react = 0; return go(clamp(b.x, 1, C.w - 1), C.l * A.base); }
    pl.react += dt;
    if (pl.react < A.react) return {};
    if (!pl.plan || this.t - pl.plan.at > 0.25) {
      const path = this.predict(2.5);
      const sp = P.speed * A.speed;
      let best = null;
      for (const q of path) {
        if (!q.wall || q.bounces >= 2 || q.z < P.low + 0.15 || q.z > P.high - 0.4) continue;
        const need = Math.hypot(q.x - pl.x, q.y - pl.y) / sp;
        if (need > q.t + 0.05) continue;
        // The best spot: after the bounce, near the sweet height.
        const score = Math.abs(q.z - P.sweet) + (q.bounces ? 0 : 0.6) + q.t * 0.15;
        if (!best || score < best.score) best = { ...q, score };
      }
      pl.plan = { at: this.t, q: best ?? path.find((q) => q.bounces === 1) ?? path.at(-1) };
    }
    const q = pl.plan.q ?? b;
    const mv = go(q.x - 0.25, q.y + 0.25);
    if (this.reachable(pl) && this.quality(pl) > A.patience - this.r.next() * 0.2) {
      pl.shot = pl.shot ?? this.choose(pl);
      return { ...mv, a: pl.shot.button === 'a', b: pl.shot.button === 'b', x: pl.shot.stick.x, y: pl.shot.stick.y };
    }
    return mv;
  }

  // For the timing ring: how close the ball is to a clean strike for the player whose turn it is.
  timing() {
    const pl = this.p[this.turn], b = this.ball;
    if (this.phase !== 'rally' || !b.wall) return null;
    return { p: this.turn, reach: this.reachable(pl), q: this.quality(pl), d: Math.hypot(b.x - pl.x, b.y - pl.y) };
  }
}
