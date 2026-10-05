// The computer opponent. It reads the match and returns the same input a
// player gives each frame (the stick, held buttons, presses), so it can't do
// anything a player can't. Pure and seeded like the match (its own
// generator, so it never changes the match's damage rolls). How sharp it is
// comes from rules.json -> cpu.levels: reaction time, how often it guards,
// finishes a combo, uses its special.
//
// Its first job is always to get back to the stage. It never attacks during
// the agurra: the computer keeps Mari's rule. Moves that need more than one
// frame of input (a smash: stick still, then tap and A; a full hop: hold up)
// go through a small queue.

import { makeRng } from './rng.js';

const sign = (v) => (v < 0 ? -1 : 1);
const RANGED = new Set(['shot', 'boulder', 'stone', 'mark']);
const blank = () => ({ x: 0, y: 0, j: false, dn: false, a: false, b: false, c: false, s: false, ah: false, bh: false, ch: false });

export class Cpu {
  constructor(match, i, level = 'normal', seed = 1) {
    this.m = match;
    this.i = i;
    this.L = match.R.cpu.levels[level] ?? match.R.cpu.levels.normal;
    this.rng = makeRng(seed * 7919 + i);
    this.queue = [];     // inputs for the next frames
    this.think = 0;      // frames until the next decision
    this.seen = null;    // the rival's move it has noticed, and when
    this.hop = 0;        // frames until it may jump again
    this.guard = 0;      // frames left holding the shield
    this.plan = 0;       // a little wander so it isn't a straight line
  }

  me() { return this.m.fighters[this.i]; }

  input() {
    const out = this.next();
    const f = this.me();
    // Hold the shield for a while once it's up.
    if (this.guard > 0 && f.state === 'shield') { this.guard--; out.ch = true; }
    return out;
  }

  next() {
    const m = this.m, f = this.me(), r = m.rival(f), R = m.R, M = m.stage.main;
    if (this.queue.length) return { ...blank(), ...this.queue.shift() };
    const out = blank();
    if (m.phase !== 'fight' || m.freeze > 0) return out;
    if (this.hop > 0) this.hop--;
    if (['out', 'hitstun', 'dodge', 'dizzy', 'held', 'climb', 'jumpsquat', 'landing'].includes(f.state) || f.carried) return out;
    if (f.state === 'respawn') { if (f.t > 30) out.x = sign(240 - f.x) * 0; out.dn = f.t > 40; return out; }
    if (f.state === 'ledge') return this.fromLedge(out, f);
    if (f.state === 'holding') return this.throwIt(out, f, M);

    // Off the stage: head back. Air jump, then the recovery leap.
    // Off the stage: nothing underneath to land on.
    const offStage = !f.grounded && m.surfaceBelow(f.x, f.y - 1) === null;
    if (offStage) return this.recover(out, f, M);

    const dx = r.x - f.x, dy = r.y - f.y, gapX = Math.abs(dx) - (f.w + r.w) / 2;
    const k = f.kind, L = this.L;
    if (f.state === 'attack' && f.move) { out.a = f.t > f.move.startup && f.grounded && this.rng.chance(L.combo) && k.light.includes(f.move); return out; }
    if (f.state === 'shield') { if (this.guard <= 0) out.ch = false; return out; }
    if (!['idle', 'run', 'air', 'helpless'].includes(f.state)) return out;
    if (r.state === 'out' || r.state === 'respawn') { out.x = sign(240 - f.x) * (Math.abs(240 - f.x) > 30 ? 1 : 0); return out; }

    // Danger: a move or a shot coming its way, noticed after its reaction time.
    const threat = this.threat(f, r, gapX);
    if (threat) {
      if (!this.seen || this.seen.id !== threat.id) this.seen = { id: threat.id, at: m.frame };
      if (m.frame - this.seen.at >= L.react && this.rng.chance(L.dodge)) {
        const dn = k.specials.down;
        if (dn.kind === 'counter' && m.specialReady(f, dn, 'down') && this.rng.chance(0.6)) { out.b = true; out.y = 1; return out; }
        if (f.grounded) {
          const roll = this.rng.next();
          if (roll < 0.55) { out.c = true; out.ch = true; this.guard = 14; return out; }
          if (roll < 0.8) { out.c = true; out.y = 1; return out; }
          out.c = true; out.x = -sign(dx); return out;
        }
        if (!f.airDodged) { out.c = true; return out; }
      }
    } else this.seen = null;

    // Steering every frame; decisions every `react` frames.
    this.steer(out, f, r, gapX, dx, dy, M);
    if (--this.think > 0) return out;
    this.think = Math.max(2, Math.round(L.react * this.rng.range(0.6, 1.1)));

    const level = Math.abs(dy) < 12;
    if (f.meter >= R.meter.max && this.superFits(f, r, gapX, level) && this.rng.chance(L.super)) { out.s = true; return out; }
    // Specials by direction: whichever fits where the rival is.
    for (const dir of ['neutral', 'side', 'down']) {
      const mv = k.specials[dir];
      if (this.m.specialReady(f, mv, dir) && this.specialFits(f, mv, r, gapX, level) && this.rng.chance(L.special * 0.5)) {
        out.b = true; out.x = dir === 'side' ? sign(dx) : 0; out.y = dir === 'down' ? 1 : 0;
        return out;
      }
    }
    if (!this.rng.chance(L.aggression)) { if (this.rng.chance(0.1)) this.plan = this.rng.range(-1, 1); return out; }
    const reach = (k.ftilt.x ?? 10) + (k.ftilt.w ?? 10) / 2 - f.w / 2;
    if (f.grounded && level) {
      // A shielding rival gets grabbed.
      if (r.state === 'shield' && gapX < 10) { out.c = true; out.a = true; out.ch = true; return out; }
      if (gapX <= reach) {
        // High percentages: a charged smash to send them out; otherwise tilts and jabs.
        if (r.pct > 70 && this.rng.chance(0.55)) { this.smash(sign(dx), r.pct > 110 ? 18 : 6); return { ...blank() }; }
        const roll = this.rng.next();
        if (roll < 0.15 && gapX < 8) { out.c = true; out.a = true; out.ch = true; return out; }
        if (roll < 0.5) { out.a = true; return out; }
        out.a = true; out.x = sign(dx); return out;
      }
      if (gapX < reach + 18 && r.pct > 50 && this.rng.chance(0.3)) { this.queue.push({ x: 0, y: 0 }, { x: 0, y: 1, a: true, ah: true }, ...Array(6).fill({ y: 1, ah: true })); return out; }
    }
    if (f.grounded && dy < -16 && dy > -70 && Math.abs(dx) < f.w + 10) { this.queue.push({ j: true, y: -1 }, { y: -1 }, { y: -1 }, { y: -1 }, { y: -1, a: true }); return out; }
    if (!f.grounded && Math.abs(dy + (f.h - r.h) / 2) < 26 && gapX <= reach + 6) {
      out.a = true;
      out.x = Math.abs(dx) > 4 ? sign(dx) : 0;
      out.y = dy < -16 ? -1 : dy > 20 ? 1 : 0;
      return out;
    }
    return out;
  }

  // A smash: the stick still for a frame, then the tap with A, A held to charge.
  smash(dir, charge) {
    this.queue.push({ x: 0 }, { x: dir, a: true, ah: true });
    for (let n = 0; n < charge; n++) this.queue.push({ x: dir, ah: true });
  }

  // Holding the rival: a couple of pummels, then throw them toward the nearer edge.
  throwIt(out, f, M) {
    if (f.t < 10 && f.pummelCD <= 0 && this.rng.chance(0.4)) { out.a = true; return out; }
    if (f.t < 12) return out;
    const edge = f.x - M.x0 < M.x1 - f.x ? -1 : 1;
    if (this.m.rival(f).pct > 120 && this.rng.chance(0.4)) out.y = -1;
    else out.x = edge;
    return out;
  }

  fromLedge(out, f) {
    if (f.t < 8 + this.rng.int(12)) return out;
    const roll = this.rng.next(), side = f.ledgeSide;
    if (roll < 0.45) out.x = -side;
    else if (roll < 0.7) { out.j = true; out.y = -1; }
    else if (roll < 0.85) out.a = true;
    else out.c = true;
    return out;
  }

  // Get back over the main platform: drift home, jump, leap.
  recover(out, f, M) {
    const home = (M.x0 + M.x1) / 2, toward = sign(home - f.x);
    out.x = toward;
    if (f.state === 'helpless') return out;
    const below = f.y > M.top - 8, falling = f.vy > -0.5;
    if (falling && below && f.jumps < 2 && this.hop <= 0) { out.j = true; out.y = -1; this.hop = 12; return out; }
    if (falling && (f.y > M.top + 6 || f.jumps >= 2) && !f.leapt) { out.b = true; out.y = -1; return out; }
    return out;
  }

  // Walk (and jump, and drop) toward its best spot near the rival, without
  // walking off the edge.
  steer(out, f, r, gapX, dx, dy, M) {
    const want = this.wantGap(f);
    let dir = gapX > want + 4 ? sign(dx) : gapX < want - 8 ? -sign(dx) : 0;
    if (dir === 0 && Math.abs(this.plan) > 0.6) dir = sign(this.plan);
    // A rival recovering from a whiffed move is an opening: go in.
    if (['attack', 'special', 'super', 'landing'].includes(r.state) && r.move && r.t > r.move.startup + r.move.active) dir = sign(dx);
    // Don't walk off into the void (a step up or down is fine). With
    // something to land on across a gap, jump it.
    if (f.grounded && dir && this.m.surfaceBelow(f.x + dir * 14, f.y - 60) === null) {
      const across = [40, 70, 100, 130].some((d) => this.m.surfaceBelow(f.x + dir * d, f.y - 60) !== null);
      if (across && this.hop <= 0 && Math.abs(dx) > 40) { this.queue.push({ j: true, y: -1, x: dir }, ...Array(6).fill({ y: -1, x: dir }), ...Array(8).fill({ x: dir }), { j: true, y: -1, x: dir }, ...Array(10).fill({ x: dir })); this.hop = 40; }
      else dir = 0;
    }
    out.x = dir;
    // Blocked by a wall or a pillar: jump over it.
    this.stuck = dir && f.grounded && Math.abs(f.x - (this.lastX ?? f.x)) < 0.2 ? (this.stuck ?? 0) + 1 : 0;
    this.lastX = f.x;
    if (this.stuck > 6 && this.hop <= 0) { this.queue.push({ j: true, y: -1, x: dir }, { y: -1, x: dir }, { y: -1, x: dir }, { y: -1, x: dir }, { x: dir }, { x: dir }, { x: dir, j: true, y: -1 }); this.hop = 30; this.stuck = 0; }
    if (f.grounded && dy < -24 && Math.abs(dx) < 80 && this.hop <= 0) { this.queue.push({ j: true, y: -1, x: dir }, { y: -1, x: dir }, { y: -1, x: dir }, { y: -1, x: dir }); this.hop = 30; }
    else if (!f.grounded && f.jumps < 2 && dy < -30 && f.vy > 0 && this.hop <= 0) { out.j = true; out.y = -1; this.hop = 20; }
    else if (f.grounded && dy > 24 && f.y < M.top && Math.abs(dx) < 60) out.dn = true;
    else if (!f.grounded && dy > 30 && f.vy > 0) out.dn = true; // fast fall onto them
  }

  wantGap(f) {
    const sp = f.kind.specials.neutral;
    if (RANGED.has(sp.kind) && (f.cooldown[sp.id] ?? 0) <= 0) return Math.min(70, (sp.range ?? 90) * 0.5);
    const h = f.kind.ftilt;
    return Math.max(2, (h.x ?? 10) + (h.w ?? 10) / 2 - f.w / 2 - 6);
  }

  specialFits(f, sp, r, gapX, level) {
    switch (sp.kind) {
      case 'shot': case 'mark': return level && gapX > 20 && gapX < sp.range * 0.8;
      case 'boulder': case 'stone': return gapX > 30 && gapX < 150 && r.grounded;
      case 'ring': return level && gapX < sp.radius - 10 && r.grounded;
      case 'cone': return level && gapX < sp.range * 0.7;
      case 'dash': return level && gapX > 16 && gapX < sp.distance * 0.8 && this.safeDash(f, sp);
      case 'blink': return false; // kept for escaping
      case 'counter': return false; // kept for answering a blow (see threat)
      case 'melee': return level && gapX < Math.abs(sp.x ?? 10) + (sp.w ?? 20) / 2 - f.w / 2 + 2;
      case 'teleport': return gapX > 30 && r.grounded;
      case 'bounce': return gapX < 40;
      case 'pounce': return level && gapX > 20 && gapX < 90 && this.safeDash(f, { distance: 80 });
      case 'strike': return sp.at === 'rival' ? true : level && Math.abs(gapX + f.w / 2 - (sp.dist ?? 40)) < 22;
      case 'zone': return level && gapX < (sp.dist ?? 24) + 30;
      case 'quake': case 'summon': return level && r.grounded;
      default: return gapX < 60;
    }
  }

  safeDash(f, sp) {
    const r = this.m.rival(f), end = f.x + sign(r.x - f.x) * sp.distance;
    return this.m.surfaceBelow(end, f.y - 0.5) !== null;
  }

  superFits(f, r, gapX, level) {
    const su = f.kind.super;
    switch (su.kind) {
      case 'heal': return f.pct > 60;
      case 'mark': return level && gapX < su.range * 0.6;
      case 'burst': return gapX < su.range * 0.4;
      case 'wall': return gapX < 40;
      case 'stampede': return r.grounded;
      default: return true;
    }
  }

  // Something about to hit it: the rival winding up in range, or a shot heading for it.
  threat(f, r, gapX) {
    if (['attack', 'special', 'super'].includes(r.state) && r.move && r.t <= r.move.startup) {
      const mv = r.move, reach = mv.kind === 'ring' ? mv.radius : mv.kind === 'cone' ? mv.range : mv.kind === 'dash' ? mv.distance : Math.abs(mv.x ?? 0) + (mv.w ?? 0) / 2;
      if (reach && gapX < reach + 6 && Math.abs(r.y - f.y) < 30) return { id: `m${r.i}.${this.m.frame - r.t}` };
    }
    for (const [n, o] of this.m.objects.entries()) {
      if (o.kind !== 'shot' || o.owner === f.i) continue;
      const tx = f.x - o.x, ty = f.y - f.h / 2 - o.y, d = Math.hypot(tx, ty);
      if (d < 60 && (o.vx * tx + o.vy * ty) > 0.8 * d * Math.hypot(o.vx, o.vy)) return { id: `s${n}.${o.id}` };
    }
    return null;
  }
}
