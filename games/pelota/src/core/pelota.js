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

import { makeRng } from './rng.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Match {
  constructor(rules, { players = 1, difficulty = 'normal', seed = 1, to = null, ai = null } = {}) {
    this.R = rules;
    this.C = rules.court;
    this.players = players === 2 ? 2 : 1;
    this.difficulty = rules.difficulty[difficulty] ? difficulty : 'normal';
    this.diff = rules.difficulty[this.difficulty];
    this.r = makeRng(seed);
    this.to = to ?? rules.match.to;
    // Red (0) and blue (1). With one player, blue is the computer.
    const aiFor = ai ?? [false, this.players === 1];
    this.p = [0, 1].map((i) => ({ i, x: this.C.w * (i ? 0.66 : 0.34), y: this.C.l * 0.7, vx: 0, vy: 0, swing: 0, buffer: null, ai: aiFor[i], plan: null, react: 0 }));
    this.ball = { x: 5, y: 20, z: 1, vx: 0, vy: 0, vz: 0, wall: false, bounces: 0, lastHitter: 0, held: 0, spin: 0 };
    this.score = [0, 0];
    this.server = 0;
    this.turn = 1;
    this.phase = 'serve';
    this.phaseT = 0;
    this.t = 0;
    this.events = [];
    this.rally = 0;
    this.stats = { longest: 0, hits: [0, 0], faults: {} };
    this.winner = null;
    this.setupServe();
  }

  emit(type, extra = {}) { this.events.push({ type, ...extra }); }

  // ---- the serve ---------------------------------------------------------------------

  setupServe() {
    const s = this.server, o = 1 - s, C = this.C;
    Object.assign(this.p[s], { x: C.w * 0.55, y: C.serveY, vx: 0, vy: 0, swing: 0, buffer: null, plan: null });
    Object.assign(this.p[o], { x: C.w * 0.35, y: C.serveY + 5, vx: 0, vy: 0, swing: 0, buffer: null, plan: null });
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
    this.shoot(this.p[s], 'serve', aim, 1);
    this.phase = 'rally';
    this.emit('serve', { p: s });
  }

  // ---- shots ------------------------------------------------------------------------------

  // Send the ball at a point on the frontis. The shot's flight time and target
  // height decide its character: a drive strikes high and runs deep, a soft
  // shot (dejada) kisses the wall just above the chapa and dies short.
  shoot(pl, kind, aim, quality) {
    const S = this.R.shots[kind], b = this.ball, C = this.C;
    const err = (1 - quality) * this.errorFor(pl);
    const n = () => (this.r.next() + this.r.next() + this.r.next() - 1.5) * 0.8;
    const zt = this.r.range(S.z[0], S.z[1]) + n() * err * 0.9;
    // Hard shots still rise when they meet the wall, so they rebound deep.
    const T = Math.max(0.35, b.y / (S.speed * this.r.range(0.92, 1.08)));
    // The stick picks where across the court the ball comes down (left wall
    // side to open side); work back to where it must strike the frontis,
    // since it keeps drifting sideways after the rebound.
    const land = clamp(C.w / 2 + clamp(aim, -1, 1) * (C.w / 2 - 1), 0.8, C.w - 0.8);
    const k = (0.92 * S.back) / T;
    const xt = clamp((land + b.x * k) / (1 + k) + n() * err * 1.6, 0.3, C.w + 1.5);
    b.vx = (xt - b.x) / T;
    b.vy = -b.y / T;
    b.vz = (zt - b.z + 0.5 * this.R.ball.g * T * T) / T;
    b.wall = false; b.bounces = 0; b.lastHitter = pl.i; b.spin = kind === 'soft' ? -1 : 1;
    this.turn = 1 - pl.i;
    this.stats.hits[pl.i]++;
    this.rally++;
    this.emit('hit', { p: pl.i, kind, quality, x: b.x, y: b.y, z: b.z });
  }

  errorFor(pl) {
    return pl.ai ? this.R.ai[this.difficulty].error : this.diff.error;
  }

  // How clean a hit is: best with the ball about waist-high and close in.
  quality(pl) {
    const b = this.ball, d = Math.hypot(b.x - pl.x, b.y - pl.y);
    const hz = Math.abs(b.z - this.R.player.sweet);
    return clamp(1 - hz * 0.45 - Math.max(0, d - 0.6) * 0.5, 0, 1);
  }

  reachable(pl) {
    const P = this.R.player, b = this.ball;
    return this.phase === 'rally' && this.turn === pl.i && b.wall && b.bounces < 2
      && Math.hypot(b.x - pl.x, b.y - pl.y) <= P.reach * this.reachMul(pl) && b.z >= P.low && b.z <= P.high;
  }

  reachMul(pl) { return pl.ai ? 1 : this.diff.reach; }

  // ---- the step ------------------------------------------------------------------------------

  // inputs[i]: { x, y (stick, -1..1), a (drive, pressed this step), b (soft, pressed) }
  step(inputs, dt) {
    this.events = [];
    if (this.phase === 'over') return;
    this.t += dt;
    this.phaseT += dt;
    for (const pl of this.p) {
      const inp = pl.ai ? this.think(pl, dt) : (inputs[pl.i] ?? {});
      this.move(pl, inp, dt);
      if (inp.a || inp.b) pl.buffer = { kind: inp.a ? 'drive' : 'soft', t: this.R.player.buffer, aim: inp.x ?? 0 };
      if (pl.buffer) {
        pl.buffer.aim = inp.x ?? pl.buffer.aim;
        if (this.phase === 'serve' && pl.i === this.server && this.phaseT > 0.4) { this.serve(pl.buffer.aim); pl.swing = this.R.player.swing; pl.buffer = null; }
        else if (this.reachable(pl)) {
          pl.swing = this.R.player.swing;
          this.shoot(pl, pl.buffer.kind, pl.buffer.aim, this.quality(pl));
          pl.buffer = null;
        } else if ((pl.buffer.t -= dt) <= 0) {
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
      if (this.phase !== 'over') this.setupServe();
    }
    if (this.phase === 'point') this.fly(dt, true);
  }

  move(pl, inp, dt) {
    const P = this.R.player, C = this.C;
    const serving = this.phase === 'serve' && pl.i === this.server;
    const sp = P.speed * (pl.ai ? this.R.ai[this.difficulty].speed : 1);
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
        this.emit('wall', { x: b.x, z: b.z });
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
    this.emit('point', { winner, reason, score: [...this.score], rally: this.rally });
    if (this.score[winner] >= this.to) {
      this.phase = 'over';
      this.winner = winner;
      this.emit('over', { winner });
    }
  }

  // ---- the computer pelotari --------------------------------------------------------------------------

  // Where will the ball be, a little ahead? Runs the same physics on a copy.
  predict(secs = 3, step = 1 / 30) {
    const saved = { ...this.ball }, phase = this.phase, events = this.events, score = [...this.score], stats = JSON.stringify(this.stats), server = this.server, rally = this.rally, turn = this.turn, winner = this.winner, phaseT = this.phaseT;
    const path = [];
    this.events = [];
    for (let t = step; t <= secs && this.phase === 'rally'; t += step) {
      this.fly(step);
      if (this.phase === 'rally') path.push({ t, x: this.ball.x, y: this.ball.y, z: this.ball.z, wall: this.ball.wall, bounces: this.ball.bounces });
    }
    Object.assign(this.ball, saved);
    Object.assign(this, { phase, events, score, stats: JSON.parse(stats), server, rally, turn, winner, phaseT });
    return path;
  }

  think(pl, dt) {
    const A = this.R.ai[this.difficulty], C = this.C, P = this.R.player, b = this.ball;
    const other = this.p[1 - pl.i];
    const go = (tx, ty) => {
      const dx = tx - pl.x, dy = ty - pl.y, d = Math.hypot(dx, dy);
      return d < 0.15 ? { x: 0, y: 0 } : { x: dx / Math.max(d, 0.6), y: dy / Math.max(d, 0.6) };
    };
    if (this.phase === 'serve') {
      if (pl.i === this.server && this.phaseT > 0.9 + A.react * 3) return { a: true, x: this.r.range(-0.6, 0.8) };
      return pl.i === this.server ? {} : go(C.w * 0.4, C.serveY + 5);
    }
    if (this.phase !== 'rally' || this.turn !== pl.i) {
      pl.plan = null;
      // Out of the way, back and to the far side from the striker.
      return go(other.x > C.w / 2 ? C.w * 0.3 : C.w * 0.7, C.l * 0.72);
    }
    // Plan an intercept once the ball is on its way back, after a reaction time.
    if (!b.wall) { pl.react = 0; return go(clamp(b.x, 1, C.w - 1), C.l * 0.65); }
    pl.react += dt;
    if (pl.react < A.react) return {};
    if (!pl.plan || this.t - pl.plan.at > 0.3) {
      const path = this.predict(2.5);
      const sp = P.speed * A.speed;
      let best = null;
      for (const q of path) {
        if (!q.wall || q.bounces >= 2 || q.z < P.low + 0.15 || q.z > P.high - 0.4) continue;
        const need = Math.hypot(q.x - pl.x, q.y - pl.y) / sp;
        if (need <= q.t + 0.05) { best = q; if (q.bounces >= 1 && Math.abs(q.z - P.sweet) < 0.5) break; if (!best.bounces) continue; break; }
      }
      pl.plan = { at: this.t, q: best ?? path.find((q) => q.bounces === 1) ?? path.at(-1) };
    }
    const q = pl.plan.q ?? b;
    const mv = go(q.x - 0.2, q.y + 0.2);
    if (this.reachable(pl) && this.quality(pl) > 0.35 + this.r.next() * 0.3) {
      const soft = this.r.chance(A.soft) && other.y > C.l * 0.55;
      // Aim away from the other player.
      const aim = other.x > C.w / 2 ? -this.r.range(0.3, 1) : this.r.range(0.2, 0.9);
      return { ...mv, a: !soft, b: soft, x: aim };
    }
    return mv;
  }
}
