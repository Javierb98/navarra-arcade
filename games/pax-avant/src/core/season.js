// One summer on the border pastures. Pure simulation: no DOM, no clock, no
// Math.random. The UI feeds it one input per fixed step and draws what it
// finds here; the tests, the balance sweep and the computer shepherds drive
// it the same way.
//
// Coordinates are map pixels (480x270), y down. Side 0 is Roncal (player 1,
// the left half), side 1 is Barétous (player 2, the right half).
//
// Input per shepherd per step: { x: -1..1, y: -1..1, a, b, c }. The stick
// walks; a and c are true only on the step the button went down, b while
// it is held:
//   A whistles the dog to push the nearest sheep the way you face (any
//     sheep: the neighbours' too),
//   B rings the bell: your flock comes to you, and wolves and bears back off,
//   C picks up the nearest sheep (any sheep), or puts down the one you carry.
//
// The point: the valley with the most cheese at the end of the summer wins.
// Well-fed sheep make it, so more sheep and better grass mean more cheese.
// Each valley can cheat to get ahead: graze the neighbours' land, or carry or
// drive their sheep into its own pen, where they take its mark. Every trick
// costs the Peace both valleys share, a fixed amount. Helping (seeing off a
// wolf that went for the neighbours, driving the bear away together) mends
// it, and it heals slowly on its own. If the Peace reaches 0 the valleys go
// to war: the summer ends there and both score 0, as before 1375.
//
// Dangers: wolves (more of them as the summer goes on) and the bear. Neither
// ever hurts a sheep; they scatter flocks, and scattered sheep are easy to
// steal.

import { makeRng } from './rng.js';
import { clamp, inRect } from './geom.js';
import { buildWorld } from './world.js';

export const DT = 1 / 60;
const IDLE = { x: 0, y: 0, a: false, b: false, c: false };
const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

export class Season {
  constructor({ rules, map, calendar, difficulty = 'normal', players = 1, seed = 1 }) {
    this.rules = rules;
    this.map = map;
    this.calendar = calendar;
    this.players = players === 2 ? 2 : 1;
    this.difficulty = rules.difficulty[difficulty] ? difficulty : 'normal';
    this.diff = rules.difficulty[this.difficulty];
    this.rng = makeRng(seed);
    this.world = buildWorld(map);
    this.length = calendar.length;
    this.t = 0;
    this.breakT = rules.startBreak;
    this.events = [];
    this.finished = false;
    this.war = false;

    const W = this.world;
    this.grass = new Float32Array(W.cols * W.rows);
    map.pastures.forEach((p, i) => { for (const c of W.pastureCells[i]) this.grass[c] = p.start; });
    // Every gate stands open: pens are where stolen sheep change hands.
    this.gates = W.gates.map((g) => ({ ...g, open: true }));
    this.springs = map.springs.map((s) => ({ ...s, level: s.cap, dry: false }));
    this.troughs = [];

    this.shepherds = map.valleys.map((v, side) => ({
      side, x: v.start.x, y: v.start.y, fx: side === 0 ? 1 : -1, fy: 0, moving: false,
      bellT: 0, ringT: 0, carrying: null,
    }));
    this.dogs = this.shepherds.map((s) => ({
      owner: s.side, x: s.x - 8 * s.fx, y: s.y + 4, vx: 0, vy: 0,
      mode: 'heel', group: [], dirx: 0, diry: 0, t: 0, cd: 0, side: 1,
    }));

    this.sheep = [];
    const n = rules.flock[this.difficulty] ?? rules.flock.normal;
    map.valleys.forEach((v, side) => {
      const home = map.pastures.find((p) => p.owner === side && !p.high);
      for (let k = 0; k < n; k++) {
        const a = k * 2.4, r = 6 + (k % 4) * 6;
        this.addSheep(side, home.x + Math.cos(a) * r, home.y + Math.sin(a) * r * 0.7);
      }
    });

    this.wolves = [];
    this.bears = [];
    this.peace = rules.peace.start; // shared by both valleys, 0..100
    this.cheese = [0, 0];
    this.stats = [0, 1].map(() => ({ stolen: 0, recovered: 0, grazed: 0, helped: 0, scared: 0, cost: 0 }));
    this.lastCost = -1; // who last took from the Peace
    this.tension = this.tensionLevel();
    this.flocks = [this.flockInfo(0), this.flockInfo(1)];
    this.schedule = [...calendar.events].sort((a, b) => a.t - b.t).map((e) => ({ ...e, done: false }));
    this.prompts = calendar.prompts.map((p) => ({ ...p, done: false }));
    this._trespassT = [-9, -9];
    this._strayT = 0;
  }

  addSheep(side, x, y) {
    this.sheep.push({
      id: this.sheep.length, side, origin: side, x, y, vx: 0, vy: 0, wa: this.rng.next() * Math.PI * 2,
      food: this.rules.needs.start, carriedBy: -1, penT: 0, stray: false, eating: false, fleeing: false,
    });
  }

  // ---- the Peace ------------------------------------------------------------

  // A valley's trick costs the Peace. Fixed amounts, from rules.peace.
  cost(side, amount) {
    this.peace -= amount;
    this.stats[side].cost += amount;
    this.lastCost = side;
  }

  mend(amount) { this.peace = Math.min(100, this.peace + amount); }

  // 0 calm, 1 tense, 2 on the brink.
  tensionLevel() {
    const P = this.rules.peace;
    return this.peace < P.brinkAt ? 2 : this.peace < P.tenseAt ? 1 : 0;
  }

  // ---- the summer -------------------------------------------------------------

  runSchedule() {
    for (const p of this.prompts) {
      if (!p.done && this.t >= p.t) { p.done = true; this.events.push({ type: 'prompt', key: p.key }); }
    }
    for (const e of this.schedule) {
      if (e.done || this.t < e.t) continue;
      e.done = true;
      if (e.type === 'wolves') this.spawnWolves(e);
      else if (e.type === 'bear') this.spawnBear(e);
    }
  }

  // Which flock an event goes for: 'leader' (the valley with more cheese),
  // 'trailer', 'both', or a side.
  targets(spec) {
    if (spec === 'both') return [0, 1];
    if (spec === 0 || spec === 1) return [spec];
    const gap = this.cheese[0] - this.cheese[1];
    const lead = Math.abs(gap) < 0.5 ? this.rng.int(2) : gap > 0 ? 0 : 1;
    return [spec === 'trailer' ? 1 - lead : lead];
  }

  step(input = {}) {
    this.events = [];
    if (this.finished) return;
    if (this.breakT > 0) {
      this.breakT -= DT;
      if (this.breakT <= 0) this.events.push({ type: 'go' });
      return;
    }
    this.t += DT;
    this.runSchedule();
    const ins = [input.p1 ?? IDLE, input.p2 ?? IDLE];
    this.flocks = [this.flockInfo(0), this.flockInfo(1)];
    for (const i of [0, 1]) this.stepShepherd(i, ins[i]);
    for (const d of this.dogs) this.stepDog(d);
    this.stepWolves();
    this.stepBears();
    this.stepSheep();
    this.stepPens();
    this.stepGrass();
    if ((this._strayT += DT) >= 0.25) { this._strayT = 0; this.updateStrays(); }
    // Grudges fade: left alone, the Peace slowly heals.
    this.mend(this.rules.peace.heal * DT);
    const lvl = this.tensionLevel();
    if (lvl !== this.tension) { this.events.push({ type: 'tension', level: lvl, rising: lvl > this.tension }); this.tension = lvl; }
    if (this.peace <= 0) {
      this.peace = 0;
      this.war = true;
      this.finished = true;
      this.events.push({ type: 'war', by: this.lastCost });
      return;
    }
    if (this.t >= this.length) {
      this.finished = true;
      this.events.push({ type: 'finish' });
    }
  }

  // ---- shepherds --------------------------------------------------------------

  stepShepherd(i, inp) {
    const R = this.rules.shepherd, s = this.shepherds[i];
    const x = clamp(Number(inp.x) || 0), y = clamp(Number(inp.y) || 0);
    const m = Math.hypot(x, y);
    s.moving = m > 0.15;
    if (s.moving) {
      s.fx = x / m; s.fy = y / m;
      const pace = s.carrying ? R.carryPace : s.bellT > 0 ? R.ringPace : 1;
      const sp = R.speed * Math.min(1, m) * pace;
      s.x += s.fx * sp * DT;
      s.y += s.fy * sp * DT;
      this.collide(s, R.radius);
    }
    s.bellT = Math.max(0, s.bellT - DT);
    s.ringT = Math.max(0, s.ringT - DT);
    if (inp.b) {
      if (s.ringT <= 0) { s.ringT = R.ringEvery; this.events.push({ type: 'bell', side: i, x: s.x, y: s.y }); }
      s.bellT = R.bellTime;
    }
    if (inp.a) this.whistle(i);
    if (inp.c) this.act(i);
    if (s.carrying) { s.carrying.x = s.x; s.carrying.y = s.y - 1; }
  }

  // A: send the dog round the far side of the nearest bunch of sheep, then
  // walk it forward so the sheep move the way the shepherd faces.
  whistle(i) {
    const s = this.shepherds[i], d = this.dogs[i], D = this.rules.dog;
    if (d.cd > 0) return;
    let best = null, bd = D.reach;
    for (const sh of this.sheep) {
      if (sh.carriedBy >= 0) continue;
      const dd = Math.hypot(sh.x - s.x, sh.y - s.y);
      if (dd < bd) { bd = dd; best = sh; }
    }
    d.cd = D.cooldown;
    if (!best) { this.events.push({ type: 'whistle', side: i, x: s.x, y: s.y, none: true }); return; }
    // The bunch: sheep linked to the nearest one by short hops.
    const group = [best];
    const seen = new Set([best.id]);
    for (let k = 0; k < group.length; k++) {
      for (const o of this.sheep) {
        if (seen.has(o.id) || o.carriedBy >= 0) continue;
        if (Math.hypot(o.x - group[k].x, o.y - group[k].y) < D.link) { seen.add(o.id); group.push(o); }
      }
    }
    d.group = group.map((g) => g.id);
    d.dirx = s.fx; d.diry = s.fy;
    d.mode = 'outrun';
    d.t = 0;
    const g = this.groupInfo(d);
    // Go round on whichever side the dog already is.
    d.side = (d.x - g.x) * -d.diry + (d.y - g.y) * d.dirx >= 0 ? 1 : -1;
    this.events.push({ type: 'whistle', side: i, x: s.x, y: s.y, theirs: group.some((o) => o.side !== i) });
  }

  groupInfo(d) {
    let x = 0, y = 0, n = 0;
    for (const id of d.group) { const s = this.sheep[id]; x += s.x; y += s.y; n++; }
    if (!n) return { x: d.x, y: d.y, r: 0 };
    x /= n; y /= n;
    let r = 0;
    for (const id of d.group) { const s = this.sheep[id]; r = Math.max(r, Math.hypot(s.x - x, s.y - y)); }
    return { x, y, r: Math.min(r, 40) };
  }

  stepDog(d) {
    const D = this.rules.dog, s = this.shepherds[d.owner];
    d.cd = Math.max(0, d.cd - DT);
    let tx, ty, speed;
    if (d.mode === 'heel') {
      tx = s.x - s.fx * 9 + s.fy * 5; ty = s.y - s.fy * 9 - s.fx * 5 + 2;
      speed = Math.hypot(tx - d.x, ty - d.y) > 5 ? D.heelSpeed : 0;
    } else {
      // A picked-up sheep drops out of the bunch the dog is working.
      d.group = d.group.filter((id) => this.sheep[id].carriedBy < 0);
      if (!d.group.length) { d.mode = 'heel'; return; }
      const g = this.groupInfo(d);
      d.t += DT;
      const behindX = g.x - d.dirx * (g.r + 14), behindY = g.y - d.diry * (g.r + 14);
      if (d.mode === 'outrun') {
        // Swing wide past the side of the bunch until it lies ahead, then
        // come in behind it, instead of charging through the sheep.
        const ahead = (g.x - d.x) * d.dirx + (g.y - d.y) * d.diry;
        if (ahead < g.r + 4) {
          const px = -d.diry * d.side, py = d.dirx * d.side;
          tx = g.x + px * (g.r + 22) - d.dirx * (g.r + 16);
          ty = g.y + py * (g.r + 22) - d.diry * (g.r + 16);
        } else { tx = behindX; ty = behindY; }
        speed = D.runSpeed;
        if (Math.hypot(d.x - behindX, d.y - behindY) < 7 || d.t > 3.5) { d.mode = 'drive'; d.t = 0; }
      } else {
        // Drive: walk on the way the shepherd faced, drifting sideways to
        // stay square behind the bunch.
        const ahead = (g.x - d.x) * d.dirx + (g.y - d.y) * d.diry;
        const lat = (g.x - d.x) * -d.diry + (g.y - d.y) * d.dirx;
        const on = ahead > 10 ? 1 : 0;
        tx = d.x + d.dirx * 10 * on - d.diry * lat * 0.3;
        ty = d.y + d.diry * 10 * on + d.dirx * lat * 0.3;
        speed = D.driveSpeed;
        if (d.t > D.driveTime) { d.mode = 'heel'; d.group = []; }
      }
    }
    if (speed > 0) {
      const [nx, ny] = norm(tx - d.x, ty - d.y);
      const step = Math.min(speed * DT, Math.hypot(tx - d.x, ty - d.y));
      d.vx = nx * speed; d.vy = ny * speed;
      d.x += nx * step; d.y += ny * step;
      this.collide(d, 3);
    } else { d.vx = 0; d.vy = 0; }
  }

  // C: put down the sheep you carry, or pick up the nearest one in reach.
  act(i) {
    const s = this.shepherds[i];
    if (s.carrying) {
      const sh = s.carrying;
      s.carrying = null;
      sh.carriedBy = -1;
      sh.x = s.x + s.fx * 6; sh.y = s.y + 5;
      this.collide(sh, this.rules.sheep.radius);
      sh.vx = sh.vy = 0;
      // Put down inside a pen, it changes hands at once.
      if (this.penOf(sh) >= 0 && this.penOf(sh) !== sh.side) sh.penT = this.rules.pens.time;
      this.events.push({ type: 'drop', side: i, x: s.x, y: s.y, theirs: sh.side !== i });
      return;
    }
    let best = null, bd = this.rules.shepherd.reach;
    for (const sh of this.sheep) {
      if (sh.carriedBy >= 0) continue;
      const dd = Math.hypot(sh.x - s.x, sh.y - s.y);
      if (dd < bd) { bd = dd; best = sh; }
    }
    if (!best) { this.events.push({ type: 'reachNone', side: i, x: s.x, y: s.y }); return; }
    best.carriedBy = i;
    best.penT = 0;
    best.vx = best.vy = 0;
    s.carrying = best;
    for (const d of this.dogs) d.group = d.group.filter((id) => id !== best.id);
    this.events.push({ type: 'grab', side: i, x: s.x, y: s.y, theirs: best.side !== i, owner: best.side });
  }

  // ---- pens: where sheep change hands -------------------------------------------

  penOf(p) {
    const V = this.map.valleys;
    for (let k = 0; k < V.length; k++) if (inRect(p, V[k].pen, 1)) return k;
    return -1;
  }

  // A sheep that stays a moment in the other valley's pen takes that
  // valley's mark. Taking back your own costs nothing; anyone else's costs
  // the Peace.
  stepPens() {
    const P = this.rules.pens;
    for (const s of this.sheep) {
      if (s.carriedBy >= 0) { s.penT = 0; continue; }
      const pen = this.penOf(s);
      if (pen < 0 || pen === s.side) { s.penT = 0; continue; }
      s.penT += DT;
      if (s.penT < P.time) continue;
      const from = s.side;
      s.side = pen;
      s.penT = 0;
      s.stray = false;
      if (s.origin === pen) {
        this.stats[pen].recovered++;
        this.events.push({ type: 'recover', side: pen, from, x: s.x, y: s.y });
      } else {
        this.cost(pen, this.rules.peace.steal);
        this.stats[pen].stolen++;
        this.events.push({ type: 'steal', side: pen, from, x: s.x, y: s.y });
      }
    }
  }

  // ---- sheep --------------------------------------------------------------------

  flockInfo(side) {
    let x = 0, y = 0, n = 0;
    for (const s of this.sheep) if (s.side === side && s.carriedBy < 0) { x += s.x; y += s.y; n++; }
    if (!n) return { x: this.map.valleys[side].start.x, y: this.map.valleys[side].start.y, n: 0 };
    x /= n; y /= n;
    // Ignore the far-flung: the flock is where most of it is.
    let cx = 0, cy = 0, m = 0;
    for (const s of this.sheep) {
      if (s.side === side && s.carriedBy < 0 && Math.hypot(s.x - x, s.y - y) < 80) { cx += s.x; cy += s.y; m++; }
    }
    return m ? { x: cx / m, y: cy / m, n } : { x, y, n };
  }

  stepSheep() {
    const S = this.rules.sheep, diff = this.diff;
    const sep2 = S.separation * S.separation, coh2 = S.cohesionRadius * S.cohesionRadius;
    const sheep = this.sheep;
    for (const s of sheep) {
      if (s.carriedBy >= 0) { s.eating = false; s.fleeing = false; this.hunger(s); continue; }
      let ax = 0, ay = 0, cx = 0, cy = 0, avx = 0, avy = 0, n = 0;
      for (const o of sheep) {
        if (o === s || o.carriedBy >= 0) continue;
        const dx = o.x - s.x, dy = o.y - s.y, d2 = dx * dx + dy * dy;
        if (d2 < sep2 && d2 > 1e-6) {
          const d = Math.sqrt(d2), k = S.sepForce * (1 - d / S.separation) / d;
          ax -= dx * k; ay -= dy * k;
        }
        if (o.side === s.side && d2 < coh2) { cx += o.x; cy += o.y; avx += o.vx; avy += o.vy; n++; }
      }
      if (n) {
        const k = S.cohesion * diff.cohesion;
        ax += ((cx / n) - s.x) / S.cohesionRadius * k * 4;
        ay += ((cy / n) - s.y) / S.cohesionRadius * k * 4;
        ax += (avx / n - s.vx) * S.align;
        ay += (avy / n - s.vy) * S.align;
      }

      let fear = 0, pulled = false;
      for (const d of this.dogs) {
        const dx = s.x - d.x, dy = s.y - d.y, dd = Math.hypot(dx, dy);
        const r = d.mode === 'heel' ? S.separation * 2 : this.rules.dog.fear;
        if (dd < r && dd > 1e-6) {
          const k = S.fleeDog * (1 - dd / r) / dd;
          ax += dx * k; ay += dy * k;
          if (d.mode !== 'heel') fear = 1;
        }
      }
      const flee = (x, y, radius, force) => {
        const dx = s.x - x, dy = s.y - y, dd = Math.hypot(dx, dy);
        if (dd < radius && dd > 1e-6) { const k = force * (1 - dd / radius) / dd; ax += dx * k; ay += dy * k; fear = 1; }
      };
      for (const w of this.wolves) flee(w.x, w.y, S.wolfFear, S.fleeWolf);
      for (const b of this.bears) if (b.mode !== 'leave') flee(b.x, b.y, this.rules.bear.fear, S.fleeWolf);
      for (const sh of this.shepherds) {
        if (sh.bellT <= 0) continue;
        // A sheep knows its own shepherd's bell; another bell only turns its head.
        const P = this.rules.shepherd, mine = sh.side === s.side;
        const r = mine ? P.bellRadius : P.bellRadiusOther, k = mine ? S.bellPull : S.bellPull * P.bellPullOther;
        const dx = sh.x - s.x, dy = sh.y - s.y, dd = Math.hypot(dx, dy);
        if (dd < r && dd > 14) { ax += dx / dd * k; ay += dy / dd * k; pulled = pulled || mine; }
      }
      s.fleeing = fear > 0;

      // Hungry sheep drift towards better grass.
      if (!fear && !pulled) {
        let drew = false;
        if (s.food < 0.85) {
          const g = this.bestGrassNear(s.x, s.y);
          if (g) { ax += g.x * 10; ay += g.y * 10; drew = true; }
        }
        s.wa += this.rng.range(-1, 1) * 3 * DT;
        const wk = S.wander * (drew ? 0.5 : 1);
        ax += Math.cos(s.wa) * wk; ay += Math.sin(s.wa) * wk;
      }

      s.vx += ax * DT; s.vy += ay * DT;
      const damp = Math.exp(-S.damping * DT);
      s.vx *= damp; s.vy *= damp;
      const cap = fear ? S.maxSpeed : pulled ? S.bellSpeed : S.cruise;
      const sp = Math.hypot(s.vx, s.vy);
      if (sp > cap) { s.vx *= cap / sp; s.vy *= cap / sp; }
      s.x += s.vx * DT; s.y += s.vy * DT;
      this.collide(s, S.radius);
      this.feed(s, sp);
    }
  }

  // Which way the grass gets better, as a unit vector (or null if it doesn't).
  bestGrassNear(x, y) {
    const W = this.world, c = Math.floor(x / W.cell), r = Math.floor(y / W.cell);
    const here = this.cellGrass(c, r);
    if (here > 0.45) return null;
    let bx = 0, by = 0, best = here + 0.08;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const g = this.cellGrass(c + dc, r + dr);
      if (g > best) { best = g; bx = (c + dc + 0.5) * W.cell - x; by = (r + dr + 0.5) * W.cell - y; }
    }
    if (!bx && !by) return null;
    const l = Math.hypot(bx, by);
    return { x: bx / l, y: by / l };
  }

  cellGrass(c, r) {
    const W = this.world;
    if (c < 0 || r < 0 || c >= W.cols || r >= W.rows) return 0;
    const i = r * W.cols + c;
    return W.pastureOf[i] >= 0 ? this.grass[i] : 0;
  }

  hunger(s) {
    s.food = clamp(s.food - this.rules.needs.hunger * DT, 0, 1);
  }

  feed(s, speed) {
    const N = this.rules.needs, W = this.world;
    this.hunger(s);
    s.eating = false;
    const ci = Math.floor(s.y / W.cell) * W.cols + Math.floor(s.x / W.cell);
    const pi = W.pastureOf[ci] ?? -1;
    if (pi >= 0 && speed < N.grazeSpeed && !s.fleeing && s.food < 0.98 && this.grass[ci] > 0.05) {
      const bite = N.eat * DT;
      s.food = Math.min(1, s.food + bite);
      this.grass[ci] = Math.max(0, this.grass[ci] - bite * N.grassPerFood * this.diff.grassUse);
      s.eating = true;
      // Grass on the neighbours' land: a fixed cost to the Peace per bite.
      const owner = this.map.pastures[pi].owner;
      if (owner >= 0 && owner !== s.side) {
        this.cost(s.side, this.rules.peace.trespass * bite);
        this.stats[s.side].grazed += bite;
        if (this.t - this._trespassT[s.side] > 5) { this._trespassT[s.side] = this.t; this.events.push({ type: 'trespass', side: s.side, x: s.x, y: s.y }); }
      }
    }
    // Well-fed sheep give milk: cheese for the valley whose mark they carry.
    const C = this.rules.cheese;
    if (s.food > C.above) this.cheese[s.side] += C.rate * DT * (s.food - C.above) / (1 - C.above);
  }

  updateStrays() {
    const d = this.rules.sheep.strayDistance;
    for (const s of this.sheep) {
      const f = this.flocks[s.side];
      s.stray = s.carriedBy < 0 && Math.hypot(s.x - f.x, s.y - f.y) > d;
    }
  }

  // ---- wolves ---------------------------------------------------------------------

  spawnWolves(e) {
    const Wf = this.rules.wolf;
    for (const target of this.targets(e.target)) {
      for (let k = 0; k < (e.count ?? 1); k++) {
        // From the forest edge on the target's side, spread out a little.
        const x = target === 0 ? 30 + k * 40 + this.rng.int(30) : this.map.w - 30 - k * 40 - this.rng.int(30);
        const from = { x, y: 20 };
        this.wolves.push({ x: from.x, y: from.y, hx: from.x, hy: from.y, target, mode: 'come', t: 0, ang: k * 2.1, vx: 0, vy: 0, lunge: Wf.lungeEvery * (0.5 + this.rng.next()) });
      }
      this.events.push({ type: 'wolves', target, count: e.count ?? 1 });
    }
  }

  stepWolves() {
    const Wf = this.rules.wolf;
    for (const w of this.wolves) {
      w.t += DT;
      if (w.mode !== 'leave') {
        const by = this.scarer(w, Wf);
        if (by >= 0) {
          w.mode = 'leave';
          this.stats[by].scared++;
          const helped = by !== w.target;
          if (helped) { this.mend(this.rules.peace.wolfHelp); this.stats[by].helped++; }
          this.events.push({ type: 'wolfScared', side: by, x: w.x, y: w.y, helped });
        } else if (w.mode === 'prowl' && w.t > this.diff.wolfPatience) {
          w.mode = 'leave';
          this.events.push({ type: 'wolfLeaves', x: w.x, y: w.y });
        }
      }
      const f = this.flocks[w.target];
      let tx, ty, sp;
      if (w.mode === 'come') {
        tx = f.x; ty = f.y; sp = Wf.speed;
        if (Math.hypot(f.x - w.x, f.y - w.y) < Wf.prowlRadius + 4) { w.mode = 'prowl'; w.t = 0; w.ang = Math.atan2(w.y - f.y, w.x - f.x); }
      } else if (w.mode === 'prowl') {
        // Circle the flock, and every few seconds lunge through it: the flock
        // scatters (no sheep is ever caught).
        w.ang += 0.8 * DT;
        w.lunge -= DT;
        if (w.lunge < -Wf.lungeTime) w.lunge = Wf.lungeEvery;
        const r = w.lunge < 0 ? 4 : Wf.prowlRadius;
        tx = f.x + Math.cos(w.ang) * r; ty = f.y + Math.sin(w.ang) * r; sp = w.lunge < 0 ? Wf.lungeSpeed : Wf.speed;
      } else { tx = w.hx; ty = w.hy - 20; sp = Wf.fleeSpeed; }
      const [nx, ny] = norm(tx - w.x, ty - w.y);
      const step = Math.min(sp * DT, Math.hypot(tx - w.x, ty - w.y));
      w.vx = nx * sp; w.vy = ny * sp;
      w.x += nx * step; w.y += ny * step;
    }
    const before = this.wolves.length;
    this.wolves = this.wolves.filter((w) => !(w.mode === 'leave' && (w.y < 0 || Math.hypot(w.x - w.hx, w.y - w.hy + 20) < 4)));
    if (this.wolves.length < before) this.events.push({ type: 'wolfGone' });
  }

  // Who scared a wolf off (dog, bell or a shepherd walking up), or -1.
  scarer(w, R) {
    for (const d of this.dogs) if (Math.hypot(d.x - w.x, d.y - w.y) < R.dogScare) return d.owner;
    for (const s of this.shepherds) {
      const dd = Math.hypot(s.x - w.x, s.y - w.y);
      if (dd < R.shepherdScare || (s.bellT > 0 && dd < R.bellScare)) return s.side;
    }
    return -1;
  }

  // ---- the bear -------------------------------------------------------------------
  // It comes down to the best grass and sits there; flocks keep clear of it.
  // One shepherd ringing at it only shoves it away, which can mean onto the
  // neighbours' grass. Both ringing at once drive it off for good, and mend
  // the Peace: the valleys did it together.

  spawnBear(e) {
    const W = this.world;
    let best = 0, bv = -1;
    this.map.pastures.forEach((p, pi) => { const v = this.meanGrass(W.pastureCells[pi]); if (v > bv) { bv = v; best = pi; } });
    const p = this.map.pastures[best];
    const x = p.x < this.map.border ? p.x - 40 : p.x + 40;
    this.bears.push({ x, y: 14, hx: x, hy: 14, tx: p.x, ty: p.y, mode: 'come', t: 0, push: [0, 0], vx: 0, vy: 0 });
    this.events.push({ type: 'bear', x: p.x, y: p.y, owner: p.owner });
  }

  stepBears() {
    const B = this.rules.bear;
    for (const b of this.bears) {
      b.t += DT;
      let px = 0, py = 0;
      if (b.mode !== 'leave') {
        for (const s of this.shepherds) {
          const dd = Math.hypot(s.x - b.x, s.y - b.y);
          const dog = this.dogs[s.side], dogNear = dog.mode !== 'heel' && Math.hypot(dog.x - b.x, dog.y - b.y) < B.dogScare;
          const on = (s.bellT > 0 && dd < B.bellScare) || dogNear;
          b.push[s.side] = on ? B.pushMemory : Math.max(0, b.push[s.side] - DT);
          if (on) { const [nx, ny] = norm(b.x - s.x, b.y - s.y); px += nx; py += ny; }
        }
        if (b.push[0] > 0 && b.push[1] > 0) {
          b.mode = 'leave';
          this.mend(this.rules.peace.bearTogether);
          for (const k of [0, 1]) { this.stats[k].helped++; this.stats[k].scared++; }
          this.events.push({ type: 'bearScared', together: true, x: b.x, y: b.y });
        } else if (b.t > this.diff.bearPatience) {
          b.mode = 'leave';
          this.events.push({ type: 'bearLeaves', x: b.x, y: b.y });
        }
      }
      let tx, ty, sp;
      if (b.mode === 'leave') { tx = b.hx; ty = -30; sp = B.leaveSpeed; }
      else if (px || py) {
        // Shoved: it lumbers away from the bell(s) and sits wherever it stops.
        tx = b.x + px * 20; ty = b.y + py * 20; sp = B.shoveSpeed;
        b.tx = tx; b.ty = ty;
        b.mode = 'sit';
      } else if (b.mode === 'come') {
        tx = b.tx; ty = b.ty; sp = B.speed;
        if (Math.hypot(b.tx - b.x, b.ty - b.y) < 4) b.mode = 'sit';
      } else { tx = b.tx; ty = b.ty; sp = B.speed * 0.5; }
      const [nx, ny] = norm(tx - b.x, ty - b.y);
      const step = Math.min(sp * DT, Math.hypot(tx - b.x, ty - b.y));
      b.vx = nx * sp; b.vy = ny * sp;
      b.x += nx * step; b.y += ny * step;
      if (b.mode !== 'leave') { b.x = clamp(b.x, 20, this.map.w - 20); b.y = clamp(b.y, 40, this.map.h - 20); }
    }
    this.bears = this.bears.filter((b) => !(b.mode === 'leave' && b.y < -20));
  }

  // ---- grass --------------------------------------------------------------------

  // Grass regrows in proportion to what is left: a lush pasture bounces back,
  // a bare one barely does.
  stepGrass() {
    const G = this.rules.grass, W = this.world;
    for (const cells of W.pastureCells) {
      for (const c of cells) {
        const g = this.grass[c];
        this.grass[c] = Math.min(1, g + (G.regrow * g * (1 - g) + G.floor * (1 - g)) * DT);
      }
    }
  }

  meanGrass(cells = null) {
    const list = cells ?? this.world.pastureCells.flat();
    let t = 0;
    for (const c of list) t += this.grass[c];
    return list.length ? t / list.length : 0;
  }

  // Mean grass on one valley's own pastures (or the shared one, side -1).
  landGrass(side) {
    const cells = this.map.pastures.flatMap((p, pi) => (p.owner === side ? this.world.pastureCells[pi] : []));
    return this.meanGrass(cells);
  }

  pastureAt(x, y) {
    const W = this.world;
    const c = Math.floor(x / W.cell), r = Math.floor(y / W.cell);
    if (c < 0 || r < 0 || c >= W.cols || r >= W.rows) return null;
    const i = W.pastureOf[r * W.cols + c];
    return i >= 0 ? this.map.pastures[i] : null;
  }

  // ---- places ---------------------------------------------------------------------

  inPen(s, side = s.side) { return inRect(s, this.map.valleys[side].pen, 1); }

  // Push a round thing out of trees, rocks and walls, and keep it on the map.
  collide(e, r) {
    for (const c of this.world.circles) {
      const dx = e.x - c.x, dy = e.y - c.y, min = r + c.r, d2 = dx * dx + dy * dy;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 1;
        e.x = c.x + dx / d * min; e.y = c.y + dy / d * min;
      }
    }
    const segs = this.world.walls;
    const p = { x: 0, y: 0 };
    for (const w of segs) {
      const dx0 = w.x2 - w.x1, dy0 = w.y2 - w.y1, l2 = dx0 * dx0 + dy0 * dy0;
      const tt = l2 > 0 ? clamp(((e.x - w.x1) * dx0 + (e.y - w.y1) * dy0) / l2, 0, 1) : 0;
      p.x = w.x1 + dx0 * tt; p.y = w.y1 + dy0 * tt;
      const dx = e.x - p.x, dy = e.y - p.y, min = r + 1.5, d2 = dx * dx + dy * dy;
      if (d2 < min * min) {
        const d = Math.sqrt(d2);
        if (d > 1e-6) { e.x = p.x + dx / d * min; e.y = p.y + dy / d * min; }
        else if (w.x1 === w.x2) e.x += e.x < w.x1 ? -min : min;
        else e.y += e.y < w.y1 ? -min : min;
      }
    }
    e.x = clamp(e.x, 4, this.map.w - 4);
    e.y = clamp(e.y, 16, this.map.h - 4);
  }

  // ---- the end ------------------------------------------------------------------

  // Cheese decides it. If the Peace broke, the valleys went to war: nobody
  // goes to the stone and both score 0, however much cheese they made.
  score() {
    const S = this.rules.score;
    const sheep = [0, 1].map((side) => this.sheep.filter((s) => s.side === side).length);
    const valleys = [0, 1].map((i) => {
      const cheese = Math.floor(this.cheese[i]);
      const earned = Math.round(this.cheese[i] * S.cheese);
      return { cheese, earned, total: this.war ? 0 : earned, sheep: sheep[i], ...this.stats[i] };
    });
    const gap = this.cheese[0] - this.cheese[1];
    const winner = this.war || Math.abs(gap) < 1 ? -1 : gap > 0 ? 0 : 1;
    const peace = Math.round(this.peace);
    const tier = this.war ? 0 : 1 + S.tiers.filter((p) => peace >= p).length;
    return { valleys, winner, peace, war: this.war, ceremony: !this.war, tier, warBy: this.war ? this.lastCost : -1 };
  }
}
