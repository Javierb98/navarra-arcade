// One timber run down one course. Pure simulation: no DOM, no clock, no
// Math.random. The UI feeds it one input per fixed step and draws what it
// finds here; the tests and the attract-mode pilot drive it the same way.
//
// Coordinates: x across the river (right is +x), y downstream. The raft's
// angle is 0 when its front points straight downstream; its axis is
// (sin a, cos a) and its right-hand side is (cos a, -sin a).
//
// Input per player per step: { x: -1..1, y: -1..1, a, b, c }. x steers; y < 0
// (stick up) rows harder, y > 0 (stick down) back-paddles to brake. `a` and
// `c` are true only on the step the button went down; `b` while held.

import { River } from './river.js';
import { makeRng } from './rng.js';
import { clamp, closestSegSeg } from './geom.js';

export const DT = 1 / 60;
const IDLE = { x: 0, y: 0, a: false, b: false, c: false };
const stick = (p) => clamp(Number(p?.x) || 0);
const rowing = (p) => -clamp(Number(p?.y) || 0);
const TAU = Math.PI * 2;
const wrapAngle = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);

export class Race {
  constructor({ rules, course, difficulty = 'normal', players = 1, seed = 1 }) {
    this.rules = rules;
    this.course = course;
    this.players = players === 2 ? 2 : 1;
    this.difficulty = rules.difficulty[difficulty] ? difficulty : 'normal';
    this.diff = rules.difficulty[this.difficulty];
    this.rng = makeRng(seed);
    this.river = new River(course);
    this.t = 0;
    this.finished = false;
    this.events = [];

    this.hazards = [];
    this.eddies = [];
    this.whirls = [];
    this.docks = [];
    this.users = [];
    this.ducks = [];
    this.weirs = [];
    this.bridges = [];
    this.rapids = [];
    this.prompts = [];
    this.villages = [];
    this.drift = [];
    // Scenery zones down the course (forest, gorge, fields, plain). Gorge
    // walls are rock, so bumping them hurts more than a pebble bank.
    this.themes = [...(course.themes ?? [{ y: -1e9, style: 'forest' }])].sort((a, b) => a.y - b.y);
    for (const f of course.features ?? []) this.addFeature(f);
    // Harder settings add rocks and floating debris, scaled by how far down
    // the route this stretch is (course.intensity), so the first one stays gentle.
    this.intensity = course.intensity ?? 1;
    if (this.diff.scatter) this.scatterRocks(this.diff.scatter * this.intensity);
    this.debris = [];
    this.nextDebris = (course.startY ?? 60) + 500;

    this.stats = { orders: 0, weirs: 0, weirsClean: 0, disturbed: 0, bumps: 0, logsLost: 0, relashes: 0 };

    const R = rules.raft;
    const y0 = course.startY ?? 60;
    this.raft = {
      x: this.river.cxAt(y0), y: y0, angle: 0, vx: 0, vy: 0, w: 0,
      oar: [0, 0], row: 0, braced: [false, false], strokeCd: [0, 0], lastStroke: [-9, -9],
      logs: R.logs, lashing: 100, loose: false,
    };
    // Launch at the speed of the water, not from a standstill.
    this.raft.vy = this.currentAt(this.raft.x, y0).y;
    this.lash = { active: false, t: 0, knots: 0, pressed: [-1, -1], knotBeat: 0 };
    this._c = { ax: 0, ay: 0, bx: 0, by: 0 };
  }

  // ---- course building ------------------------------------------------------

  addFeature(f) {
    const r = this.river;
    const H = this.rules.hardness;
    const X = (dx, y) => r.cxAt(y) + (dx ?? 0);
    // A point `inset` in from the given bank (negative = outside the water).
    const bank = (side, y, inset) => (side === 'left' ? r.leftAt(y) + inset : r.rightAt(y) - inset);
    switch (f.type) {
      case 'rock':
      case 'sandbar':
      case 'tree': {
        const y2 = f.y2 ?? f.y;
        const x1 = f.side ? bank(f.side, f.y, -12) : X(f.dx, f.y);
        const x2 = f.side ? bank(f.side, y2, f.reach) : X(f.dx2 ?? f.dx, y2);
        this.addHazard(f.type, x1, f.y, x2, y2, f.r, H[f.type]);
        break;
      }
      case 'bridge': {
        const d = f.depth ?? 8, pr = f.r ?? 8;
        const pillars = f.pillars.map((dx) => X(dx, f.y));
        for (const x of pillars) this.addHazard('pillar', x, f.y - d, x, f.y + d, pr, H.pillar);
        this.bridges.push({ y: f.y, depth: d, r: pr, pillars, crowd: !!f.crowd, passed: false });
        break;
      }
      case 'weir': {
        const x = X(f.dx, f.y), wr = 4;
        const w = { y: f.y, x, half: f.half, hits: 0, passed: false };
        this.addHazard('weir', r.leftAt(f.y) - 30, f.y, x - f.half - wr, f.y, wr, H.weir, w);
        this.addHazard('weir', x + f.half + wr, f.y, r.rightAt(f.y) + 30, f.y, wr, H.weir, w);
        this.weirs.push(w);
        break;
      }
      case 'whirlpool':
        this.whirls.push({ x: X(f.dx, f.y), y: f.y, r: f.r, spin: f.spin ?? 1 });
        break;
      case 'eddy':
        this.eddies.push({ x: bank(f.side, f.y, f.r * 0.6), y: f.y, r: f.r, side: f.side });
        break;
      case 'dock':
        this.docks.push({ x: bank(f.side, f.y, 10), y: f.y, r: f.r ?? 52, side: f.side, town: f.town, done: false });
        break;
      case 'washer':
        this.users.push({ kind: 'washer', x: bank(f.side, f.y, 6), y: f.y, r: 10, side: f.side, done: false });
        break;
      case 'duck':
        this.ducks.push({ baseX: X(f.dx, f.y), y: f.y, x: X(f.dx, f.y), range: f.range ?? 30, speed: f.speed ?? 0.8, phase: this.ducks.length * 1.7, r: 5, flying: 0 });
        break;
      case 'rapids':
        this.rapids.push({ y1: f.y1, y2: f.y2 });
        break;
      case 'prompt':
        this.prompts.push({ y: f.y, key: f.key, solo: f.solo, shown: false });
        break;
      case 'village':
        this.villages.push({ place: f.place, y: f.y, y2: f.y2, sides: f.sides ?? ['left', 'right'], roof: f.roof ?? 'slate', church: f.church ?? null, seed: this.villages.length + 1, entered: false });
        break;
      default:
        break;
    }
  }

  // Harder settings fill the quiet stretches with rock clusters. The layout
  // depends only on the course, so every crew faces the same river, and each
  // row always leaves a gap the raft fits through.
  scatterRocks(density) {
    const rng = makeRng([...this.course.id].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261));
    const rv = this.river, W = this.rules.raft.width;
    const busy = (y) => this.hazards.some((h) => h.maxY > y - 110 && h.minY < y + 110)
      || [...this.docks, ...this.eddies, ...this.whirls, ...this.weirs, ...this.bridges].some((f) => Math.abs(f.y - y) < 130);
    for (let y = (this.course.startY ?? 60) + 380; y < this.course.length - 220; y += 170 / density) {
      if (busy(y) || rng.chance(0.25)) continue;
      const hw = rv.hwAt(y), cx = rv.cxAt(y);
      const rocks = [];
      const n = hw > 120 ? 2 + rng.int(2) : 1 + rng.int(2);
      for (let i = 0; i < n; i++) rocks.push({ x: cx + rng.range(-0.72, 0.72) * hw, y: y + rng.range(-25, 25), r: 7 + rng.int(4) });
      // Some gap (banks included) must be wide enough to steer through, and
      // none may be a trap: just wide enough to wedge the raft in.
      rocks.sort((a, b) => a.x - b.x);
      const edges = [rv.leftAt(y), ...rocks.flatMap((k) => [k.x - k.r, k.x + k.r]), rv.rightAt(y)];
      let widest = 0, trap = false;
      for (let i = 0; i + 1 < edges.length; i += 2) {
        const gap = edges[i + 1] - edges[i];
        widest = Math.max(widest, gap);
        if (gap > 6 && gap < W + 24) trap = true;
      }
      if (widest < W + 34 || trap) continue;
      for (const k of rocks) this.addHazard('rock', k.x, k.y, k.x, k.y, k.r, this.rules.hardness.rock);
    }
    this.hazards.sort((a, b) => a.minY - b.minY);
  }

  addHazard(kind, x1, y1, x2, y2, r, hard, ref = null) {
    this.hazards.push({
      kind, x1, y1, x2, y2, r, hard: hard ?? 1, ref,
      minY: Math.min(y1, y2) - r, maxY: Math.max(y1, y2) + r,
    });
  }

  // ---- queries --------------------------------------------------------------

  // Water velocity at a point, including eddies and the difficulty setting.
  currentAt(x, y) {
    const rv = this.river;
    const hw = rv.hwAt(y), d = (x - rv.cxAt(y)) / hw;
    let k = rv.speedAt(y) * this.diff.current * Math.max(0.35, 1 - 0.55 * d * d);
    for (const e of this.eddies) {
      const q = Math.hypot(x - e.x, y - e.y) / e.r;
      if (q < 1) k *= q * q;
    }
    // Whirlpools: the water turns around the centre and is drawn inward, and
    // the river's own flow weakens inside, so a raft lingers and gets spun.
    const R = this.rules.raft;
    let wx = 0, wy = 0;
    for (const w of this.whirls) {
      const dx = x - w.x, dy = y - w.y, d = Math.hypot(dx, dy), reach = w.r * R.whirlReach;
      if (d >= reach || d < 1e-6) continue;
      const f = 1 - d / reach;
      const swirl = R.whirlSwirl * w.spin * this.diff.current * f * Math.min(1, d / (w.r * 0.5));
      wx += (-dy / d) * swirl - (dx / d) * R.whirlPull * f;
      wy += (dx / d) * swirl - (dy / d) * R.whirlPull * f;
      k *= 1 - R.whirlHold * f;
    }
    const sl = rv.slopeAt(y), inv = 1 / Math.hypot(sl, 1);
    let cx = k * sl * inv + wx;
    // Above a weir the water drains sideways toward the chute, so a raft
    // pinned against the wall is carried along it and never stuck for good.
    for (const w of this.weirs) {
      const up = w.y - y;
      if (up <= 0 || up > this.rules.raft.weirFunnelReach) continue;
      const dx = w.x - x;
      cx += Math.sign(dx) * Math.min(1, Math.abs(dx) / 30) * this.rules.raft.weirFunnel * (1 - up / this.rules.raft.weirFunnelReach);
    }
    return { x: cx, y: k * inv + wy };
  }

  ends() {
    const { x, y, angle } = this.raft, h = this.rules.raft.length / 2;
    const sx = Math.sin(angle) * h, sy = Math.cos(angle) * h;
    return { fx: x + sx, fy: y + sy, bx: x - sx, by: y - sy };
  }

  // The eddy the raft is in (anywhere inside its ring counts).
  eddyHere() {
    const { x, y } = this.raft;
    return this.eddies.find((e) => Math.hypot(x - e.x, y - e.y) < e.r) ?? null;
  }

  speed() { return Math.hypot(this.raft.vx, this.raft.vy); }

  styleAt(y) {
    let s = this.themes[0].style;
    for (const t of this.themes) if (t.y <= y) s = t.style;
    return s;
  }

  canLash() {
    return !this.lash.active && this.raft.lashing < 100 && this.eddyHere() != null
      && this.speed() < this.rules.lash.maxSpeed;
  }

  // Beat number if a lashing press right now would count, otherwise -1.
  lashBeat() {
    if (!this.lash.active) return -1;
    const P = this.rules.lash.beat;
    const k = Math.round(this.lash.t / P);
    return k >= 1 && Math.abs(this.lash.t - k * P) <= this.rules.lash.window ? k : -1;
  }

  // Seconds until the next beat, as a 0..1 fraction of the beat (for the ring).
  lashPhase() { const P = this.rules.lash.beat; return 1 - ((this.lash.t % P) / P); }

  score() {
    const S = this.rules.score, st = this.stats;
    const time = this.diff.timed ? Math.max(0, Math.round((this.course.targetTime - this.t) * S.perSecond)) : 0;
    const parts = {
      logs: this.raft.logs * S.log,
      orders: st.orders * S.order,
      weirs: st.weirsClean * S.weir,
      courtesy: st.disturbed === 0 ? S.courtesy : 0,
      time,
    };
    return { parts, total: Object.values(parts).reduce((a, b) => a + b, 0) };
  }

  // ---- simulation -----------------------------------------------------------

  step(input = {}) {
    this.events.length = 0;
    if (this.finished) return;
    this.t += DT;
    const ins = [input.p1 ?? IDLE, this.players === 2 ? (input.p2 ?? IDLE) : null];
    const prevY = this.raft.y;

    this.updateDucks();
    this.updateDebris();
    this.updateDrift();
    if (this.lash.active) this.stepLash(ins);
    else {
      if (ins.some((p) => p?.c)) this.tryStartLash();
      this.stepRaft(ins);
    }
    this.collide();
    this.checkZones(prevY);
    this.updateLashing();

    if (this.raft.y >= this.course.length) {
      this.finished = true;
      this.emit('finish', this.raft.x, this.raft.y);
    }
  }

  emit(type, x, y, extra) { this.events.push({ type, x, y, ...extra }); }

  stepRaft(ins) {
    const R = this.rules.raft, raft = this.raft;
    const sa = Math.sin(raft.angle), ca = Math.cos(raft.angle);

    // Oars. One player: the stick says where to go and the game keeps the raft
    // straight. Two players: each stick swings one end, and it is up to them.
    let u1, u2;
    raft.braced[0] = !!ins[0].b;
    raft.braced[1] = !!ins[1]?.b;
    if (this.players === 1) {
      const s = raft.braced[0] ? 0 : stick(ins[0]);
      // No automatic straightening while a whirlpool has hold of the raft,
      // or for a moment after: the crew has to recover from the spin.
      const whirled = this.t < (raft.whirledUntil ?? 0);
      const turn = whirled ? 0 : clamp(-(raft.angle * R.autoAngle + raft.w * R.autoSpin)) * (this.diff.autoAssist ?? 1);
      u1 = clamp(s + turn);
      u2 = clamp(s - turn);
    } else {
      u1 = raft.braced[0] ? 0 : stick(ins[0]);
      u2 = raft.braced[1] ? 0 : stick(ins[1]);
    }
    if (this.diff.weirAssist) {
      const w = this.weirs.find((q) => !q.passed && q.y > raft.y && q.y - raft.y < 170);
      if (w) {
        const turn = clamp(-(raft.angle * 3 + raft.w * 1.2)) * 0.7;
        const side = clamp((w.x - raft.x) * 0.05) * 0.5;
        u1 = clamp(u1 + turn + side);
        u2 = clamp(u2 - turn + side);
      }
    }
    raft.oar[0] = u1;
    raft.oar[1] = u2;

    let ax = R.oarAccel * (u1 + u2) / 2 * ca;
    let ay = -R.oarAccel * (u1 + u2) / 2 * sa;
    let alpha = R.oarSpin * (u1 - u2) / 2;

    // Water drag: the raft slides easily along its length, hardly at all sideways.
    const cur = this.currentAt(raft.x, raft.y);

    // Rowing along the raft's length: up to go faster, down to hold back.
    // Either player can do it; both together is no stronger than one.
    const row = clamp(ins.reduce((sum, p) => sum + (p && !p.b ? rowing(p) : 0), 0));
    raft.row = row;
    // Braking slows the raft but never holds it still or backs it upstream,
    // so a crew braking near a slow bank still drifts into the eddy below.
    const fwd = (sa * cur.x + ca * cur.y) < -1 ? -1 : 1;
    const ahead = (raft.vx * sa + raft.vy * ca) * fwd;
    if (row && !(row < 0 && ahead < R.brakeFloor)) {
      const acc = row > 0 ? R.rowAccel : R.brakeAccel;
      ax += sa * fwd * acc * row;
      ay += ca * fwd * acc * row;
    }
    const rvx = raft.vx - cur.x, rvy = raft.vy - cur.y;
    const va = rvx * sa + rvy * ca, vp = rvx * ca - rvy * sa;
    ax += -R.dragAlong * va * sa - R.dragPerp * vp * ca;
    ay += -R.dragAlong * va * ca + R.dragPerp * vp * sa;

    // A long raft feels different water at each end, and slowly swings to
    // lie along the current.
    const { fx, fy, bx, by } = this.ends();
    const cf = this.currentAt(fx, fy), cb = this.currentAt(bx, by);
    alpha += R.shear * ((cf.x - cb.x) * ca - (cf.y - cb.y) * sa) / R.length;
    const flow = Math.atan2(cur.x, cur.y);
    alpha += R.vane * Math.sin(2 * wrapAngle(flow - raft.angle)) / 2;
    alpha -= R.angularDrag * raft.w;

    raft.inWhirl = raft.inWhirl && this.t < (raft.whirledUntil ?? 0) - R.whirlDaze + DT * 2;
    // On top of the swirling water (in currentAt), a whirlpool grips the raft
    // so it can't just coast through, and twists it round.
    for (const wp of this.whirls) {
      const d = Math.hypot(raft.x - wp.x, raft.y - wp.y), reach = wp.r * R.whirlReach;
      if (d >= reach) continue;
      const f = 1 - d / reach;
      raft.whirledUntil = this.t + R.whirlDaze;
      if (!raft.inWhirl) this.emit('whirl', wp.x, wp.y);
      raft.inWhirl = true;
      alpha += R.whirlSpin * wp.spin * this.diff.current * f;
      ax -= R.whirlGrip * f * (raft.vx - cur.x);
      ay -= R.whirlGrip * f * (raft.vy - cur.y);
    }
    const eddy = this.eddyHere();
    if (eddy) { ax -= R.eddyDrag * raft.vx; ay -= R.eddyDrag * raft.vy; }

    // Safety net: a raft that has barely moved for a while (wedged, or
    // parked in an eddy by someone who doesn't know to push off) is eased
    // back out toward the middle of the river. Nobody is ever stuck for good.
    if (!raft.anchor || Math.hypot(raft.x - raft.anchor.x, raft.y - raft.anchor.y) > 24) raft.anchor = { x: raft.x, y: raft.y, t: this.t };
    raft.stuck = this.t - raft.anchor.t;
    if (raft.stuck > (eddy && raft.lashing < 100 ? 8 : 4)) {
      // Toward the chute if a weir wall is what's holding it, else mid-river.
      const weir = this.weirs.find((w) => !w.passed && Math.abs(w.y - raft.y) < R.length);
      const goal = weir ? weir.x : this.river.cxAt(raft.y);
      ax += (Math.abs(goal - raft.x) < 3 ? 1 : Math.sign(goal - raft.x)) * R.unstick;
      ay += R.unstick * 0.6;
    }

    raft.vx += ax * DT;
    raft.vy += ay * DT;
    raft.w += alpha * DT;

    // Hard strokes push the raft along its length, downstream-first. Two
    // strokes together are worth more than two apart.
    for (let i = 0; i < this.players; i++) {
      raft.strokeCd[i] = Math.max(0, raft.strokeCd[i] - DT);
      if (!ins[i].a || raft.strokeCd[i] > 0) continue;
      const dir = (sa * cur.x + ca * cur.y) < -1 ? -1 : 1;
      let imp = R.strokeImpulse;
      const other = raft.lastStroke[1 - i];
      if (this.players === 2 && this.t - other < R.togetherWindow) {
        imp *= 1 + R.togetherBonus;
        this.emit('together', raft.x, raft.y);
      }
      raft.vx += sa * imp * dir;
      raft.vy += ca * imp * dir;
      raft.strokeCd[i] = R.strokeCooldown;
      raft.lastStroke[i] = this.t;
      this.emit('stroke', raft.x, raft.y, { player: i });
    }

    raft.x += raft.vx * DT;
    raft.y += raft.vy * DT;
    raft.angle = wrapAngle(raft.angle + raft.w * DT);
  }

  // C pressed. Always say something, so the crew knows why nothing happened.
  tryStartLash() {
    const { x, y } = this.raft, eddy = this.eddyHere();
    if (this.canLash()) {
      Object.assign(this.lash, { active: true, t: 0, knots: 0, pressed: [-1, -1], knotBeat: 0, eddy });
      this.emit('lashStart', x, y);
    } else if (this.raft.lashing >= 100) {
      if (eddy) this.emit('lashNotNeeded', x, y);
    } else if (!eddy) this.emit('lashNoEddy', x, y);
    else this.emit('lashTooFast', x, y);
  }

  // Re-lashing: the raft is held in the eddy while the crew ties knots on the
  // beat. With two players, a knot needs both presses on the same beat.
  stepLash(ins) {
    const L = this.rules.lash, lash = this.lash, raft = this.raft;
    // The eddy draws the raft in and holds it while the crew ties up.
    raft.vx *= 0.85; raft.vy *= 0.85; raft.w *= 0.85;
    if (lash.eddy) { raft.vx += (lash.eddy.x - raft.x) * 0.15; raft.vy += (lash.eddy.y - raft.y) * 0.15; }
    raft.x += raft.vx * DT; raft.y += raft.vy * DT;
    raft.oar[0] = raft.oar[1] = 0;
    lash.t += DT;
    if (ins.some((p) => p?.b)) {
      lash.active = false;
      this.emit('lashCancel', raft.x, raft.y);
      return;
    }
    const beat = this.lashBeat();
    for (let i = 0; i < this.players; i++) {
      if (!ins[i].c) continue;
      if (beat > lash.knotBeat) {
        lash.pressed[i] = beat;
        this.emit('lashPress', raft.x, raft.y, { player: i });
      } else this.emit('lashMiss', raft.x, raft.y, { player: i });
    }
    if (beat > lash.knotBeat && lash.pressed.slice(0, this.players).every((p) => p === beat)) {
      lash.knotBeat = beat;
      lash.knots++;
      this.emit('knot', raft.x, raft.y, { knots: lash.knots });
      if (lash.knots >= L.knots) {
        lash.active = false;
        raft.lashing = 100;
        raft.loose = false;
        this.stats.relashes++;
        this.emit('lashDone', raft.x, raft.y);
      }
    }
  }

  collide() {
    const R = this.rules.raft, raft = this.raft, rr = R.width / 2, c = this._c;
    let { fx, fy, bx, by } = this.ends();
    const top = Math.min(fy, by) - rr, bottom = Math.max(fy, by) + rr;
    for (const h of this.hazards) {
      if (h.maxY < top || h.minY > bottom) continue;
      closestSegSeg(bx, by, fx, fy, h.x1, h.y1, h.x2, h.y2, c);
      const dx = c.ax - c.bx, dy = c.ay - c.by, d = Math.hypot(dx, dy), min = rr + h.r;
      if (d >= min) continue;
      const nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : -1;
      const impact = this.resolve(nx, ny, min - d, c.bx + nx * h.r, c.by + ny * h.r, h.hard, h.kind);
      if (h.ref && impact > 2) h.ref.hits++;
      ({ fx, fy, bx, by } = this.ends());
    }
    // Floating branches and logs: they bump like anything else, then get
    // shoved aside so they don't stick to the raft.
    for (const d of this.debris) {
      if (Math.abs(d.y - raft.y) > 60 || this.t < d.ghost) continue;
      const hx = Math.sin(d.angle) * d.len / 2, hy = Math.cos(d.angle) * d.len / 2;
      closestSegSeg(bx, by, fx, fy, d.x - hx, d.y - hy, d.x + hx, d.y + hy, c);
      const dx = c.ax - c.bx, dy = c.ay - c.by, dist = Math.hypot(dx, dy), min = rr + d.r;
      if (dist >= min) continue;
      const nx = dist > 1e-6 ? dx / dist : 0, ny = dist > 1e-6 ? dy / dist : -1;
      const dc = this.currentAt(d.x, d.y);
      this.resolve(nx, ny, min - dist, c.bx, c.by, this.rules.hardness.debris, 'debris', dc.x + d.push, dc.y * this.rules.raft.debrisSpeed);
      // One bump, then it swings away and can't hit again straight off.
      d.ghost = this.t + 1.5;
      d.push = (nx > 0 ? -1 : 1) * 45; d.spin += (this.rng.next() - 0.5) * 3;
      ({ fx, fy, bx, by } = this.ends());
    }
    // Banks, tested at both ends and the middle.
    const rv = this.river;
    for (const [px, py] of [[fx, fy], [bx, by], [raft.x, raft.y]]) {
      const l = rv.leftAt(py), r = rv.rightAt(py);
      const hard = this.styleAt(py) === 'gorge' ? this.rules.hardness.cliff : this.rules.hardness.bank;
      if (px - rr < l) this.resolve(1, 0, l - (px - rr), l, py, hard, 'bank');
      else if (px + rr > r) this.resolve(-1, 0, px + rr - r, r, py, hard, 'bank');
    }
  }

  // Push the raft out along normal n and bounce it as a rigid body. Returns
  // the impact speed. (ovx, ovy) is the obstacle's own velocity, for things
  // that float: only the closing speed counts.
  resolve(nx, ny, pen, px, py, hard, kind = 'bank', ovx = 0, ovy = 0) {
    const R = this.rules.raft, raft = this.raft, C = this.rules.collision;
    raft.x += nx * pen;
    raft.y += ny * pen;
    const rx = px - raft.x, ry = py - raft.y;
    const vcx = raft.vx + raft.w * ry - ovx, vcy = raft.vy - raft.w * rx - ovy;
    const vn = vcx * nx + vcy * ny;
    if (vn >= 0) return 0;
    const inertia = (R.length * R.length) / 12;
    const rn = rx * ny - ry * nx;
    const j = -(1 + C.restitution) * vn / (1 + (rn * rn) / inertia);
    raft.vx += j * nx;
    raft.vy += j * ny;
    raft.w -= (j * rn) / inertia;
    const impact = -vn;
    if (impact > C.threshold) {
      // Only real crashes into something solid do harm; floating debris,
      // banks and sandbars just knock the raft about. The first crash loosens
      // the lashings; a crash while they are loose throws off one log.
      const bracing = raft.braced.slice(0, this.players).filter(Boolean).length / this.players;
      const brace = 1 - (1 - C.braceFactor) * bracing;
      const dmg = (impact - C.threshold) * C.damage * hard * this.diff.damage * brace;
      if (dmg > 0 && raft.lashing < C.looseAt && dmg >= C.crashDamage && this.t - (raft.lastLoss ?? -9) > 1) this.loseLog();
      raft.lashing = Math.max(0, raft.lashing - dmg);
      this.stats.bumps++;
      this.emit('bump', px, py, { power: impact, braced: bracing > 0, kind, harmless: dmg <= 0 });
    }
    return impact;
  }

  checkZones(prevY) {
    const raft = this.raft, rr = this.rules.raft.width / 2;
    const { fx, fy, bx, by } = this.ends();
    const near = (x, y, r) => {
      const c = closestSegSeg(bx, by, fx, fy, x, y, x, y, this._c);
      return Math.hypot(c.ax - x, c.ay - y) < r + rr;
    };
    for (const d of this.docks) {
      if (d.done || !near(d.x, d.y, d.r - rr)) continue;
      d.done = true;
      this.stats.orders++;
      this.emit('order', d.x, d.y, { town: d.town });
    }
    for (const u of this.users) {
      if (u.done || !near(u.x, u.y, u.r)) continue;
      u.done = true;
      this.stats.disturbed++;
      this.emit('splash', u.x, u.y);
    }
    for (const k of this.ducks) {
      if (k.flying || !near(k.x, k.y, k.r)) continue;
      k.flying = this.t;
      this.stats.disturbed++;
      this.emit('duck', k.x, k.y);
    }
    for (const w of this.weirs) {
      if (w.passed || prevY >= w.y || raft.y < w.y) continue;
      w.passed = true;
      this.stats.weirs++;
      const clean = w.hits === 0;
      if (clean) this.stats.weirsClean++;
      raft.vx += Math.sin(raft.angle) * this.rules.raft.weirDrop;
      raft.vy += this.rules.raft.weirDrop;
      this.emit('weir', w.x, w.y, { clean });
    }
    // Tell the crew when they reach an eddy with ropes to fix.
    const eddy = this.eddyHere();
    if (eddy && eddy !== this.lastEddy && raft.lashing < 100 && !this.lash.active) this.emit('eddyEnter', eddy.x, eddy.y);
    this.lastEddy = eddy;
    for (const v of this.villages) {
      if (v.entered || raft.y < v.y + (v.y < this.course.startY ? 0 : 60)) continue;
      v.entered = true;
      this.emit('village', raft.x, raft.y, { place: v.place });
    }
    for (const b of this.bridges) {
      if (b.passed || raft.y < b.y) continue;
      b.passed = true;
      if (b.crowd) this.emit('cheer', raft.x, b.y);
    }
    for (const p of this.prompts) {
      if (p.shown || raft.y < p.y) continue;
      p.shown = true;
      this.emit('prompt', raft.x, raft.y, { key: this.players === 1 && p.solo ? p.solo : p.key });
    }
  }

  // Loose lashings are a warning: re-tie them in an eddy before the next crash.
  updateLashing() {
    const C = this.rules.collision, raft = this.raft;
    const loose = raft.lashing < C.looseAt;
    if (loose && !raft.loose) this.emit('loose', raft.x, raft.y);
    raft.loose = loose;
  }

  loseLog() {
    const R = this.rules.raft, raft = this.raft;
    if (raft.logs <= R.minLogs) return;
    raft.lastLoss = this.t;
    raft.logs--;
    this.stats.logsLost++;
    const side = this.rng.chance(0.5) ? 1 : -1;
    const ca = Math.cos(raft.angle), sa = Math.sin(raft.angle);
    this.drift.push({
      x: raft.x + ca * side * R.width / 2, y: raft.y - sa * side * R.width / 2,
      angle: raft.angle, spin: this.rng.range(-0.6, 0.6), push: side * 12,
    });
    this.emit('logLost', raft.x, raft.y);
  }

  updateDrift() {
    for (const g of this.drift) {
      const c = this.currentAt(g.x, g.y);
      g.x += (c.x + g.push * Math.cos(g.angle)) * DT;
      g.y += c.y * 1.1 * DT;
      g.push *= 0.98;
      g.angle += g.spin * DT;
    }
    if (this.drift.length) this.drift = this.drift.filter((g) => g.y < this.raft.y + 500);
  }

  // Debris is spawned a little ahead of the raft and drifts slower than it,
  // so the crew keeps catching up with it and has to weave past.
  updateDebris() {
    const every = this.diff.debris / this.intensity;
    if (!every) return;
    const rv = this.river, raft = this.raft;
    while (this.nextDebris < raft.y + 420 && this.nextDebris < this.course.length - 150) {
      const y = this.nextDebris;
      this.debris.push({
        x: rv.cxAt(y) + this.rng.range(-0.7, 0.7) * rv.hwAt(y), y, len: 18 + this.rng.int(18), r: 3,
        angle: this.rng.range(-1.2, 1.2), spin: this.rng.range(-0.3, 0.3), push: 0, ghost: 0, kind: this.rng.chance(0.5) ? 'branch' : 'log',
      });
      this.nextDebris += every * this.rng.range(0.7, 1.3);
    }
    for (const d of this.debris) {
      const c = this.currentAt(d.x, d.y);
      d.x += (c.x + d.push) * DT;
      d.y += c.y * this.rules.raft.debrisSpeed * DT;
      d.push *= 0.97;
      d.angle += d.spin * DT;
      const l = rv.leftAt(d.y) + 6, r = rv.rightAt(d.y) - 6;
      if (d.x < l) { d.x = l; d.push = Math.abs(d.push); } else if (d.x > r) { d.x = r; d.push = -Math.abs(d.push); }
    }
    if (this.debris.length && this.debris[0].y < raft.y - 300) this.debris = this.debris.filter((d) => d.y > raft.y - 300);
  }

  updateDucks() {
    for (const k of this.ducks) {
      if (k.flying) { k.x += 50 * DT; k.y -= 70 * DT; continue; }
      k.x = k.baseX + Math.sin(this.t * k.speed + k.phase) * k.range;
    }
  }
}
