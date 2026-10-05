// One grazing season on the border pastures. Pure simulation: no DOM, no
// clock, no Math.random. The UI feeds it one input per fixed step and draws
// what it finds here; the tests, the balance sweep and the attract-mode
// shepherds drive it the same way.
//
// Coordinates are map pixels (480x270), y down. Side 0 is Roncal (player 1,
// the left half), side 1 is Barétous (player 2, the right half).
//
// Input per shepherd per step: { x: -1..1, y: -1..1, a, b, c }. The stick
// walks; a and c are true only on the step the button went down, b while
// it is held:
//   A whistles the dog to push the nearest sheep the way you face,
//   B rings the bell so your flock comes to you (and you walk at a pace
//     it can follow),
//   C does whatever is at hand (gate, trough, fire, lost lamb).
//
// The idea the rules carry, from the 1375 treaty: the mountain can't feed
// both valleys at once, so they take turns on the pass, each lacks what the
// other has (Roncal has grass but a weak spring, Barétous water but thin
// grass), and both compete for their own valley (cheese, stars, sheep home,
// honour) while sharing one Peace. Take what isn't yours and the Peace
// suffers; open your land to the neighbours and you earn honour. If the Peace
// breaks, there is no ceremony at the stone and nobody gets its bonus.
// Barétous keeps three cows to hand over at the stone; healthy cows score
// for Roncal, so Roncal has its own reason to share its grass.

import { makeRng } from './rng.js';
import { clamp, closestOnSeg, inRect } from './geom.js';
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
    this.t = 0;
    this.events = [];
    this.finished = false;

    const W = this.world;
    this.grass = new Float32Array(W.cols * W.rows);
    map.pastures.forEach((p, i) => { for (const c of W.pastureCells[i]) this.grass[c] = p.start; });
    this.grassStart = this.meanGrass();

    this.gates = W.gates.map((g) => ({ ...g }));
    this.springs = map.springs.map((s) => ({ ...s, level: s.cap, dry: false }));
    this.troughs = [];
    this.springs.forEach((s, si) => {
      for (const tr of s.troughs) this.troughs.push({ x: tr.x, y: tr.y, side: tr.side, spring: si, water: 0.6, filledBy: -1 });
    });
    this.fires = map.fires.map((f) => ({ x: f.x, y: f.y, lit: false, by: -1 }));

    this.shepherds = map.valleys.map((v, side) => ({
      side, x: v.start.x, y: v.start.y, fx: side === 0 ? 1 : -1, fy: 0, moving: false,
      bellT: 0, ringT: 0, carrying: null,
    }));
    this.dogs = this.shepherds.map((s) => ({
      owner: s.side, x: s.x - 8 * s.fx, y: s.y + 4, vx: 0, vy: 0,
      mode: 'heel', group: [], dirx: 0, diry: 0, t: 0, cd: 0, side: 1, drove: false,
    }));

    this.sheep = [];
    const n = rules.flock[this.difficulty] ?? rules.flock.normal;
    map.valleys.forEach((v, side) => {
      const p = v.pen;
      for (let k = 0; k < n; k++) this.addSheep(side, p.x + 10 + this.rng.next() * (p.w - 20), p.y + 10 + this.rng.next() * (p.h - 20));
    });
    this.flockSize = [n, n];
    // Barétous's three cows, for the tribute at the stone.
    const Cw = rules.cows, cp = map.valleys[Cw.side].pen;
    for (let k = 0; k < Cw.count; k++) this.addSheep(Cw.side, cp.x + 20 + k * 22, cp.y + cp.h / 2, false, true);

    this.wolves = [];
    this.lamb = null;
    this.weather = { storm: 0, stormOn: false, fog: 0, fogOn: false, snow: false, night: 0 };
    this.storms = [];
    this.trust = rules.trust.start; // the Peace both valleys share
    this.quarrel = false;
    this.welcome = [false, false]; // has this valley opened its land to the other?
    this.cheese = [0, 0];
    this.honour = [0, 0];
    this.shelterOpen = false;
    this.stats = [0, 1].map(() => ({ strays: 0, lambs: 0, wolves: 0, water: 0, fills: 0, stars: 0, goals: [], taken: 0, given: 0 }));
    this._quarrelT = [0, 0];
    this.flocks = [this.flockInfo(0), this.flockInfo(1)];
    this._p = { x: 0, y: 0 };
    this._strayT = 0;
    this.startWeek(0);
  }

  addSheep(side, x, y, lamb = false, cow = false) {
    const N = this.rules.needs;
    this.sheep.push({
      id: this.sheep.length, side, x, y, vx: 0, vy: 0, wa: this.rng.next() * Math.PI * 2,
      food: N.start, water: N.start, lamb, cow, stray: false, herdedBy: -1, herdedT: -9,
      eating: false, drinking: false, fleeing: false, sheltered: false, wentUp: lamb,
    });
  }

  // ---- the calendar -------------------------------------------------------

  get weekDef() { return this.calendar.weeks[this.week]; }

  // Whose turn it is on the high pass and its spring: 0, 1, or -1 for both.
  get passOwner() { return this.weekDef.pass ?? -1; }

  // Who a pasture belongs to right now (the pass changes hands by the week).
  pastureOwner(pi) { const o = this.map.pastures[pi].owner; return o === -1 ? this.passOwner : o; }

  // Who a trough belongs to right now: the shared spring's troughs go with the pass.
  troughOwner(tr) { return this.springs[tr.spring].id === 'shared' ? this.passOwner : tr.side; }

  // An animal of `side` eats or drinks `amount` on land owned by `owner`. On
  // its own land, or open land: nothing. On the neighbours' land: if they
  // opened it, they earn honour (they gave it up); if not, the Peace suffers.
  useLand(s, owner, amount) {
    if (owner < 0 || owner === s.side) return;
    const T = this.rules.trust;
    if (this.welcome[owner]) {
      this.honour[owner] += this.rules.honour.guestBite * amount;
      this.stats[owner].given += amount;
      this.trust += T.guest * amount;
    } else {
      this.trust -= T.trespass * amount;
      this.stats[s.side].taken += amount;
      if (this.t - this._quarrelT[s.side] > 6) { this._quarrelT[s.side] = this.t; this.events.push({ type: 'trespass', side: s.side, x: s.x, y: s.y }); }
    }
  }

  startWeek(i) {
    this.week = i;
    this.weekT = 0;
    this.breakT = this.rules.weekBreak;
    const w = this.weekDef;
    this.schedule = [...(w.events ?? [])].sort((a, b) => a.t - b.t).map((e) => ({ ...e, done: false }));
    this.prompts = (w.prompts ?? []).map((p) => ({ ...p, done: false }));
    this.storms = this.schedule.filter((e) => e.type === 'storm').map((e) => ({ t: e.t, dur: e.dur, warned: false, over: false }));
    this.weather.night = w.night ? 1 : 0;
    this.weather.snow = false;
    this.weather.fogOn = false;
    for (const f of this.fires) { f.lit = false; f.by = -1; }
    for (const w of this.wolves ?? []) w.mode = 'leave';
    this.goalDone = [null, null];
    this.events.push({ type: 'week', week: i });
  }

  endWeek() {
    const w = this.weekDef;
    for (const side of [0, 1]) {
      const ok = this.goalDone[side] ?? this.checkGoal(side, w.goal);
      this.stats[side].goals.push(ok);
      if (ok) this.stats[side].stars++;
    }
    this.events.push({ type: 'weekEnd', week: this.week, goals: [this.stats[0].goals.at(-1), this.stats[1].goals.at(-1)] });
    if (this.week + 1 >= this.calendar.weeks.length) {
      this.finished = true;
      this.events.push({ type: 'finish' });
    } else this.startWeek(this.week + 1);
  }

  // How far a valley is towards this week's goal, 0..1, and the bar to pass.
  goalProgress(side, goal = this.weekDef.goal) {
    const own = this.sheep.filter((s) => s.side === side && !s.cow);
    const frac = (f) => own.filter(f).length / own.length;
    const G = this.rules.goals;
    switch (goal) {
      case 'moveUp': return { v: frac((s) => this.pastureAt(s.x, s.y)?.high), need: G.moveUp };
      case 'graze': return { v: own.reduce((a, s) => a + s.food, 0) / own.length, need: G.graze };
      case 'storm': return { v: frac((s) => s.sheltered), need: G.storm };
      case 'night': return { v: 1 - frac((s) => s.stray), need: 1 };
      case 'drought': return { v: own.reduce((a, s) => a + s.water, 0) / own.length, need: G.drought };
      case 'moveDown': return { v: frac((s) => this.isHome(s)), need: G.moveDown };
      default: return { v: 1, need: 0 };
    }
  }

  checkGoal(side, goal) {
    const { v, need } = this.goalProgress(side, goal);
    return v >= need - 1e-9;
  }

  runSchedule() {
    for (const p of this.prompts) {
      if (!p.done && this.weekT >= p.t) { p.done = true; this.events.push({ type: 'prompt', key: p.key }); }
    }
    const lead = this.trust >= this.rules.trust.earlyWarningAt ? this.rules.weather.warnEarly : this.rules.weather.warn;
    for (const s of this.storms) {
      if (!s.warned && this.weekT >= s.t - lead) {
        s.warned = true;
        this.events.push({ type: 'stormWarn', in: Math.max(0, s.t - this.weekT), early: lead > this.rules.weather.warn });
      }
      if (!this.weather.stormOn && !s.over && this.weekT >= s.t && this.weekT < s.t + s.dur) {
        this.weather.stormOn = true;
        this.events.push({ type: 'storm' });
      }
      if (this.weather.stormOn && !s.over && this.weekT >= s.t + s.dur) {
        s.over = true;
        this.weather.stormOn = false;
        for (const side of [0, 1]) this.goalDone[side] = this.checkGoal(side, 'storm');
        this.events.push({ type: 'stormEnd', goals: [...this.goalDone] });
      }
    }
    for (const e of this.schedule) {
      if (e.done || this.weekT < e.t) continue;
      if (e.type === 'fog') {
        if (!e.started) { e.started = true; this.weather.fogOn = true; this.events.push({ type: 'fog' }); }
        if (this.weekT >= e.t + e.dur) { e.done = true; this.weather.fogOn = false; this.events.push({ type: 'fogEnd' }); }
        continue;
      }
      e.done = true;
      if (e.type === 'wolf') this.spawnWolf(e);
      else if (e.type === 'lamb') {
        this.lamb = { x: e.x, y: e.y, side: e.side, state: 'lost', by: -1, bleat: 0 };
        this.events.push({ type: 'lamb', side: e.side, x: e.x, y: e.y });
      } else if (e.type === 'dry') {
        const s = this.springs.find((sp) => sp.id === e.spring);
        if (s) { s.dry = true; s.level = 0; }
        this.events.push({ type: 'dry', spring: e.spring });
      } else if (e.type === 'hail') {
        // Hail flattens one valley's own grass: now it needs the neighbours.
        this.map.pastures.forEach((p, pi) => {
          if (p.owner !== e.side) return;
          for (const c of this.world.pastureCells[pi]) this.grass[c] *= this.rules.hail.keep;
        });
        this.events.push({ type: 'hail', side: e.side });
      } else if (e.type === 'snow') {
        this.weather.snow = true;
        this.events.push({ type: 'snow' });
      }
    }
  }

  // ---- the step -----------------------------------------------------------

  step(input = {}) {
    this.events = [];
    if (this.finished) return;
    if (this.breakT > 0) {
      this.breakT -= DT;
      if (this.breakT <= 0) this.events.push({ type: 'weekGo', week: this.week });
      return;
    }
    this.t += DT;
    this.weekT += DT;
    this.runSchedule();
    const W = this.weather;
    W.storm = clamp(W.storm + (W.stormOn ? DT / 1.5 : -DT / 2), 0, 1);
    W.fog = clamp(W.fog + (W.fogOn ? DT / 2 : -DT / 2), 0, 1);

    const ins = [input.p1 ?? IDLE, input.p2 ?? IDLE];
    this.flocks = [this.flockInfo(0), this.flockInfo(1)];
    for (const i of [0, 1]) this.stepShepherd(i, ins[i]);
    for (const d of this.dogs) this.stepDog(d);
    this.stepWolves();
    this.stepSheep();
    this.stepLamb();
    this.stepGrass();
    this.stepWater();
    if ((this._strayT += DT) >= 0.25) { this._strayT = 0; this.updateStrays(); }
    // Old grudges: left alone, the Peace slowly fades. It holds only if the
    // valleys keep giving to each other.
    this.trust -= (this.rules.trust.drift ?? 0) * DT;
    this.trust = clamp(this.trust, 0, 100);
    const q = this.trust < this.rules.trust.quarrelAt;
    if (q !== this.quarrel) { this.quarrel = q; this.events.push({ type: q ? 'quarrel' : 'reconcile' }); }
    if (!this.shelterOpen && this.trust >= this.rules.trust.sharedShelterAt) {
      this.shelterOpen = true;
      for (const g of this.gates) if (g.kind === 'shelter') g.open = true;
      this.events.push({ type: 'shelterOpen' });
    }
    if (this.weekT >= this.weekDef.length) this.endWeek();
  }

  // ---- shepherds ------------------------------------------------------------

  stepShepherd(i, inp) {
    const R = this.rules.shepherd, s = this.shepherds[i];
    const x = clamp(Number(inp.x) || 0), y = clamp(Number(inp.y) || 0);
    const m = Math.hypot(x, y);
    s.moving = m > 0.15;
    if (s.moving) {
      s.fx = x / m; s.fy = y / m;
      const sp = R.speed * Math.min(1, m) * (s.bellT > 0 ? R.ringPace : 1);
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
  }

  // A: send the dog round the far side of the nearest bunch of sheep, then
  // walk it forward so the sheep move the way the shepherd faces.
  whistle(i) {
    const s = this.shepherds[i], d = this.dogs[i], D = this.rules.dog;
    if (d.cd > 0) return;
    let best = null, bd = D.reach;
    for (const sh of this.sheep) {
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
        if (seen.has(o.id)) continue;
        if (Math.hypot(o.x - group[k].x, o.y - group[k].y) < D.link) { seen.add(o.id); group.push(o); }
      }
    }
    d.group = group.map((g) => g.id);
    d.dirx = s.fx; d.diry = s.fy;
    d.mode = 'outrun';
    d.t = 0;
    d.drove = false;
    const g = this.groupInfo(d);
    // Go round on whichever side the dog already is.
    d.side = (d.x - g.x) * -d.diry + (d.y - g.y) * d.dirx >= 0 ? 1 : -1;
    this.events.push({ type: 'whistle', side: i, x: s.x, y: s.y });
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
      const g = this.groupInfo(d);
      d.t += DT;
      const behindX = g.x - d.dirx * (g.r + 14), behindY = g.y - d.diry * (g.r + 14);
      if (d.mode === 'outrun') {
        // Once the bunch lies ahead of the dog (along the push), it is round
        // the back; until then it swings wide past the side instead of
        // charging through the sheep.
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
        // stay square behind the bunch, and never walking into its middle.
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

  // C: whatever is at hand, most urgent first.
  act(i) {
    const s = this.shepherds[i], reach = this.rules.shepherd.reach;
    const near = (o, r = reach) => Math.hypot(o.x - s.x, o.y - s.y) < r;
    const L = this.lamb;
    if (s.carrying) {
      s.carrying = null;
      L.state = 'lost';
      L.x = s.x; L.y = s.y + 4;
      this.events.push({ type: 'lambDown', side: i, x: s.x, y: s.y });
      return;
    }
    if (L && L.state === 'lost' && near(L)) {
      L.state = 'carried'; L.by = i; s.carrying = L;
      this.events.push({ type: 'lambUp', side: i, x: s.x, y: s.y });
      return;
    }
    for (const g of this.gates) {
      if (g.kind !== 'pen') continue;
      const c = closestOnSeg(s.x, s.y, g.x1, g.y1, g.x2, g.y2, this._p);
      if (Math.hypot(c.x - s.x, c.y - s.y) < reach) {
        g.open = !g.open;
        this.events.push({ type: g.open ? 'gateOpen' : 'gateShut', side: i, x: c.x, y: c.y });
        return;
      }
    }
    for (const tr of this.troughs) {
      if (!near(tr)) continue;
      const sp = this.springs[tr.spring];
      const want = 1 - tr.water;
      if (want < 0.05) { this.events.push({ type: 'troughFull', side: i, x: tr.x, y: tr.y }); return; }
      if (sp.level < 0.05) { this.events.push({ type: 'springEmpty', side: i, x: tr.x, y: tr.y }); return; }
      const got = Math.min(want, sp.level);
      sp.level -= got;
      tr.water += got;
      tr.filledBy = i;
      this.stats[i].fills++;
      this.events.push({ type: 'fill', side: i, x: tr.x, y: tr.y, other: tr.side !== i });
      return;
    }
    for (const f of this.fires) {
      if (f.lit || !near(f)) continue;
      if (!this.weather.night && this.weather.fog < 0.3) { this.events.push({ type: 'fireNotNeeded', side: i, x: f.x, y: f.y }); return; }
      f.lit = true; f.by = i;
      this.events.push({ type: 'fire', side: i, x: f.x, y: f.y });
      return;
    }
    // Nothing at hand: open your land to the neighbours, or close it again.
    this.welcome[i] = !this.welcome[i];
    this.events.push({ type: 'welcome', side: i, open: this.welcome[i], x: s.x, y: s.y });
  }

  // ---- sheep --------------------------------------------------------------

  flockInfo(side) {
    let x = 0, y = 0, n = 0;
    for (const s of this.sheep) if (s.side === side) { x += s.x; y += s.y; n++; }
    if (!n) return { x: 0, y: 0, n: 0 };
    x /= n; y /= n;
    // Ignore the far-flung: the flock is where most of it is.
    let cx = 0, cy = 0, m = 0;
    for (const s of this.sheep) {
      if (s.side === side && Math.hypot(s.x - x, s.y - y) < 80) { cx += s.x; cy += s.y; m++; }
    }
    return m ? { x: cx / m, y: cy / m, n } : { x, y, n };
  }

  stepSheep() {
    const S = this.rules.sheep, N = this.rules.needs, diff = this.diff, W = this.weather;
    const sep2 = S.separation * S.separation, coh2 = S.cohesionRadius * S.cohesionRadius;
    const fogK = 1 - W.fog * (0.65 - (diff.cohesion - 1) * 0.3);
    const wind = W.storm * this.rules.weather.wind;
    const sheep = this.sheep;
    for (const s of sheep) {
      let ax = 0, ay = 0, cx = 0, cy = 0, avx = 0, avy = 0, n = 0;
      for (const o of sheep) {
        if (o === s) continue;
        const dx = o.x - s.x, dy = o.y - s.y, d2 = dx * dx + dy * dy;
        if (d2 < sep2 && d2 > 1e-6) {
          const d = Math.sqrt(d2), k = S.sepForce * (1 - d / S.separation) / d;
          ax -= dx * k; ay -= dy * k;
        }
        if (o.side === s.side && !o.cow === !s.cow && d2 < coh2) { cx += o.x; cy += o.y; avx += o.vx; avy += o.vy; n++; }
      }
      if (n) {
        const k = S.cohesion * diff.cohesion * fogK;
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
          if (d.mode !== 'heel') {
            fear = 1;
            d.drove = true;
            // Credit a dog for bringing back a stray, not for bumping into one.
            if (s.stray) { s.herdedBy = d.owner; s.herdedT = this.t; }
          }
        }
      }
      for (const w of this.wolves) {
        const dx = s.x - w.x, dy = s.y - w.y, dd = Math.hypot(dx, dy);
        if (dd < S.wolfFear && dd > 1e-6) {
          const k = S.fleeWolf * (1 - dd / S.wolfFear) / dd;
          ax += dx * k; ay += dy * k; fear = 1;
        }
      }
      for (const sh of this.shepherds) {
        if (sh.bellT <= 0) continue;
        // A sheep knows its own shepherd's bell; another bell only turns its head.
        const P = this.rules.shepherd, mine = sh.side === s.side;
        const r = mine ? P.bellRadius : P.bellRadiusOther, k = mine ? S.bellPull : S.bellPull * P.bellPullOther;
        const dx = sh.x - s.x, dy = sh.y - s.y, dd = Math.hypot(dx, dy);
        if (dd < r && dd > 14) {
          ax += dx / dd * k; ay += dy / dd * k; pulled = pulled || mine;
        }
      }
      s.fleeing = fear > 0;

      // Needs: thirsty sheep look for water, hungry ones for better grass.
      if (!fear && !pulled) {
        let drew = false;
        if (s.water < N.thirstyBelow) {
          let best = null, bd = s.cow ? N.seekWater * 3 : N.seekWater;
          for (const tr of this.troughs) {
            if (tr.water < 0.03) continue;
            if (s.cow) { const o = this.troughOwner(tr); if (o >= 0 && o !== s.side && !this.welcome[o]) continue; }
            const dd = Math.hypot(tr.x - s.x, tr.y - s.y);
            if (dd < bd) { bd = dd; best = tr; }
          }
          if (best && bd > 6) { ax += (best.x - s.x) / bd * 22; ay += (best.y - s.y) / bd * 22; drew = true; }
        }
        if (!drew && s.cow) {
          // Cows amble to the best grass they may use: their own, open
          // land, or meadows the neighbours opened to them.
          const g = this.cowGoal(s);
          if (g) { const dx = g.x - s.x, dy = g.y - s.y, dd = Math.hypot(dx, dy); if (dd > 12) { ax += dx / dd * 12; ay += dy / dd * 12; drew = true; } }
        }
        if (!drew && s.food < 0.85) {
          const g = this.bestGrassNear(s.x, s.y);
          if (g) { ax += g.x * 10; ay += g.y * 10; drew = true; }
        }
        s.wa += this.rng.range(-1, 1) * 3 * DT;
        const wk = S.wander * (1 + W.fog * (diff.cohesion > 1 ? 1 : 2.5)) * (drew ? 0.5 : 1);
        ax += Math.cos(s.wa) * wk; ay += Math.sin(s.wa) * wk;
      }
      s.sheltered = this.isSheltered(s);
      if (wind && !s.sheltered) { ax += wind; ay += wind * 0.3; }

      s.vx += ax * DT; s.vy += ay * DT;
      const damp = Math.exp(-S.damping * DT);
      s.vx *= damp; s.vy *= damp;
      const weak = Math.min(s.food, s.water) < 0.15 ? 0.6 : 1;
      const cap = (fear ? S.maxSpeed : pulled ? S.bellSpeed : S.cruise) * weak * (s.cow ? this.rules.cows.speedK : 1);
      const sp = Math.hypot(s.vx, s.vy);
      if (sp > cap) { s.vx *= cap / sp; s.vy *= cap / sp; }
      s.x += s.vx * DT; s.y += s.vy * DT;
      this.collide(s, s.cow ? this.rules.cows.radius : S.radius);
      this.feed(s, sp);
    }
  }

  // Where a cow is heading: the richest pasture it may use, near beats far.
  // Rechosen every few seconds so the herd doesn't dither.
  cowGoal(c) {
    if (c.goalT > this.t) return c.goal;
    c.goalT = this.t + 4;
    const W = this.world;
    let best = null, bv = -1;
    this.map.pastures.forEach((p, pi) => {
      const owner = this.pastureOwner(pi);
      if (owner >= 0 && owner !== c.side && !this.welcome[owner]) return;
      const v = this.meanGrass(W.pastureCells[pi]) - Math.hypot(p.x - c.x, p.y - c.y) / 900;
      if (v > bv) { bv = v; best = p; }
    });
    c.goal = best ? { x: best.x, y: best.y } : null;
    return c.goal;
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

  feed(s, speed) {
    const N = this.rules.needs, T = this.rules.trust, W = this.world, Cw = this.rules.cows;
    const big = s.cow ? Cw.hunger : 1, mouth = s.cow ? Cw.eat : 1;
    s.food -= N.hunger * big * DT;
    s.water -= N.thirst * DT;
    if ((this.weather.storm > 0.5 && !s.sheltered) || (this.weather.snow && !this.inPen(s))) s.food -= N.cold * DT;
    s.eating = false;
    s.drinking = false;
    const ci = Math.floor(s.y / W.cell) * W.cols + Math.floor(s.x / W.cell);
    const pi = W.pastureOf[ci] ?? -1;
    if (pi >= 0 && this.map.pastures[pi].high) s.wentUp = true;
    if (pi >= 0 && speed < N.grazeSpeed && !s.fleeing) {
      if (s.food < 0.98 && this.grass[ci] > 0.05) {
        const bite = N.eat * mouth * DT;
        s.food += bite / big;
        this.grass[ci] = Math.max(0, this.grass[ci] - bite * N.grassPerFood * this.diff.grassUse);
        s.eating = true;
        this.useLand(s, this.pastureOwner(pi), bite);
        if (this.grass[ci] < this.rules.grass.overgrazed) this.trust -= T.hog * DT / this.flockSize[s.side];
      }
    }
    if (s.water < 0.98) {
      for (const tr of this.troughs) {
        if (tr.water <= 0 || Math.hypot(tr.x - s.x, tr.y - s.y) > 11) continue;
        const sip = Math.min(N.drink * DT, tr.water / N.waterPerDrink);
        s.water += sip;
        tr.water = Math.max(0, tr.water - sip * N.waterPerDrink);
        s.drinking = true;
        this.useLand(s, this.troughOwner(tr), sip);
        if (tr.filledBy >= 0 && tr.filledBy !== s.side) {
          this.trust += T.waterShare * sip;
          this.stats[tr.filledBy].water += sip;
          this.honour[tr.filledBy] += this.rules.honour.water * sip;
        }
        break;
      }
    }
    s.food = clamp(s.food, 0, 1);
    s.water = clamp(s.water, 0, 1);
    // Well-fed, well-watered sheep give milk: cheese for their valley.
    if (!s.cow) {
      const C = this.rules.cheese, c = Math.min(s.food, s.water);
      if (c > C.above) this.cheese[s.side] += C.rate * DT * (c - C.above) / (1 - C.above);
    }
  }

  updateStrays() {
    const d = this.rules.sheep.strayDistance;
    for (const s of this.sheep) {
      const f = this.flocks[s.side];
      const stray = Math.hypot(s.x - f.x, s.y - f.y) > d;
      if (s.stray && !stray && s.herdedBy >= 0 && s.herdedBy !== s.side && this.t - s.herdedT < 6) {
        this.trust += this.rules.trust.strayHelp;
        this.honour[s.herdedBy] += this.rules.honour.stray;
        this.stats[s.herdedBy].strays++;
        this.events.push({ type: 'helpStray', side: s.herdedBy, x: s.x, y: s.y });
        s.herdedBy = -1;
      }
      s.stray = stray;
    }
  }

  // ---- wolves, the lamb ---------------------------------------------------

  spawnWolf(e) {
    this.wolves.push({ x: e.from.x, y: e.from.y, hx: e.from.x, hy: e.from.y, target: e.target, mode: 'come', t: 0, ang: 0, vx: 0, vy: 0 });
    this.events.push({ type: 'wolf', x: e.from.x, y: e.from.y, target: e.target });
  }

  stepWolves() {
    const Wf = this.rules.wolf;
    for (const w of this.wolves) {
      w.t += DT;
      if (w.mode !== 'leave') {
        const by = this.wolfScarer(w);
        if (by >= 0) {
          w.mode = 'leave';
          this.stats[by].wolves++;
          if (by !== w.target) { this.trust += this.rules.trust.wolfHelp; this.honour[by] += this.rules.honour.wolf; }
          this.events.push({ type: 'wolfScared', side: by, x: w.x, y: w.y, helped: by !== w.target });
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
        w.ang += 0.6 * DT;
        tx = f.x + Math.cos(w.ang) * Wf.prowlRadius; ty = f.y + Math.sin(w.ang) * Wf.prowlRadius; sp = Wf.speed;
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

  // Who scared the wolf off (dog, bell, fire or a shepherd walking up), or -1.
  wolfScarer(w) {
    const Wf = this.rules.wolf;
    for (const d of this.dogs) if (Math.hypot(d.x - w.x, d.y - w.y) < Wf.dogScare) return d.owner;
    for (const s of this.shepherds) {
      const dd = Math.hypot(s.x - w.x, s.y - w.y);
      if (dd < Wf.shepherdScare || (s.bellT > 0 && dd < Wf.bellScare)) return s.side;
    }
    for (const f of this.fires) if (f.lit && Math.hypot(f.x - w.x, f.y - w.y) < Wf.fireScare) return f.by;
    return -1;
  }

  stepLamb() {
    const L = this.lamb;
    if (!L || L.state === 'home') return;
    if (L.state === 'lost') {
      if ((L.bleat -= DT) <= 0) { L.bleat = 3; this.events.push({ type: 'bleat', x: L.x, y: L.y }); }
      return;
    }
    const s = this.shepherds[L.by];
    L.x = s.x; L.y = s.y - 6;
    const f = this.flocks[L.side];
    if (Math.hypot(s.x - f.x, s.y - f.y) < 40) {
      L.state = 'home';
      s.carrying = null;
      this.addSheep(L.side, s.x, s.y + 6, true);
      this.flockSize[L.side]++;
      this.stats[L.by].lambs++;
      if (L.by !== L.side) { this.trust += this.rules.trust.lambHelp; this.honour[L.by] += this.rules.honour.lamb; }
      this.events.push({ type: 'lambHome', side: L.by, x: s.x, y: s.y, helped: L.by !== L.side });
    }
  }

  // ---- grass and water ----------------------------------------------------

  // Grass regrows in proportion to what is left: a lush pasture bounces back,
  // a bare one barely does. That is the whole lesson of the commons.
  stepGrass() {
    const G = this.rules.grass, W = this.world;
    for (const cells of W.pastureCells) {
      for (const c of cells) {
        const g = this.grass[c];
        this.grass[c] = Math.min(1, g + (G.regrow * g * (1 - g) + G.floor * (1 - g)) * DT);
      }
    }
  }

  stepWater() {
    for (const s of this.springs) if (!s.dry) s.level = Math.min(s.cap, s.level + s.regen * DT);
  }

  meanGrass(cells = null) {
    const list = cells ?? this.world.pastureCells.flat();
    let t = 0;
    for (const c of list) t += this.grass[c];
    return list.length ? t / list.length : 0;
  }

  // Mountain Health, 0..100: how much grass is left compared with the start.
  health() { return Math.round(100 * clamp(this.meanGrass() / this.grassStart, 0, 1)); }

  pastureAt(x, y) {
    const W = this.world;
    const c = Math.floor(x / W.cell), r = Math.floor(y / W.cell);
    if (c < 0 || r < 0 || c >= W.cols || r >= W.rows) return null;
    const i = W.pastureOf[r * W.cols + c];
    return i >= 0 ? this.map.pastures[i] : null;
  }

  // ---- places -------------------------------------------------------------

  inPen(s, side = s.side) { return inRect(s, this.map.valleys[side].pen, 1); }

  // Home from the mountain: back in the pen after a summer up high.
  isHome(s) { return s.wentUp && this.inPen(s); }

  // The own summer hut, the own pen, and (once the valleys trust each other)
  // the shared shelter and the neighbours' hut.
  isSheltered(s) {
    const V = this.map.valleys;
    const inHut = (v) => Math.hypot(s.x - v.shelter.x, s.y - v.shelter.y) < v.shelter.r;
    if (inHut(V[s.side]) || this.inPen(s)) return true;
    if (!this.shelterOpen) return false;
    return inRect(s, this.map.sharedShelter, 1) || inHut(V[1 - s.side]);
  }

  // Push a round thing out of trees, rocks, walls and closed gates, and keep
  // it on the map.
  collide(e, r) {
    for (const c of this.world.circles) {
      const dx = e.x - c.x, dy = e.y - c.y, min = r + c.r, d2 = dx * dx + dy * dy;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 1;
        e.x = c.x + dx / d * min; e.y = c.y + dy / d * min;
      }
    }
    const segs = this.world.walls;
    for (let k = 0; k < segs.length + this.gates.length; k++) {
      const w = k < segs.length ? segs[k] : this.gates[k - segs.length];
      if (w.open) continue;
      const p = closestOnSeg(e.x, e.y, w.x1, w.y1, w.x2, w.y2, this._p);
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

  // ---- the end ------------------------------------------------------------

  // The end of the summer, valley by valley: what each made for itself
  // (cheese, sheep home, stars), what it gave (honour), the tribute (healthy
  // cows score for Roncal), and the Peace. If the Peace broke, there is no
  // ceremony and both valleys score 0, however well they did on their own:
  // the best score needs a strong valley AND a kept peace.
  score() {
    const S = this.rules.score, Tr = this.rules.tribute;
    const sheepOf = (side) => this.sheep.filter((s) => s.side === side && !s.cow);
    const home = [0, 1].map((side) => sheepOf(side).filter((s) => this.isHome(s)).length);
    const flock = this.sheep.filter((s) => !s.cow);
    const condition = flock.reduce((a, s) => a + Math.min(s.food, s.water), 0) / flock.length;
    const cows = this.sheep.filter((s) => s.cow);
    const cowCondition = cows.length ? cows.reduce((a, s) => a + Math.min(s.food, s.water), 0) / cows.length : 1;
    const tributeOk = cowCondition >= Tr.minCondition;
    const peace = Math.round(clamp(this.trust - (tributeOk ? 0 : Tr.shortPeace), 0, 100));
    const ceremony = peace >= this.rules.trust.ceremonyAt;
    const health = this.health();
    const valleys = [0, 1].map((i) => {
      const parts = {
        cheese: Math.round(this.cheese[i] * S.cheese),
        home: home[i] * S.sheepHome,
        stars: this.stats[i].stars * S.star,
        honour: Math.round(this.honour[i] * S.honour),
        tribute: i === 0 && tributeOk ? Math.round(cowCondition * cows.length * Tr.perCow) : 0,
        peace: ceremony ? peace * S.peace : 0,
      };
      // No peace, no score: a valley that won its own race but lost the
      // peace has nothing to bring to the stone.
      const earned = Object.values(parts).reduce((a, b) => a + b, 0);
      return { parts, earned, total: ceremony ? earned : 0, cheese: Math.floor(this.cheese[i]) };
    });
    const gap = valleys[0].earned - valleys[1].earned;
    const winner = Math.abs(gap) < 15 ? -1 : gap > 0 ? 0 : 1;
    const homeFrac = (home[0] + home[1]) / (this.flockSize[0] + this.flockSize[1]);
    const together = (peace + health + condition * 100 + homeFrac * 100) / 4;
    const tier = ceremony ? Math.max(1, this.rules.ceremony.filter((c) => together >= c).length) : 0;
    const stars = this.stats[0].stars + this.stats[1].stars;
    return { valleys, winner, home, condition, cowCondition, tributeOk, health, peace, ceremony, trust: peace, stars, tier, together };
  }
}
