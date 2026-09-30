// Herri Kirolak: a fiesta day of Basque rural sports, red against blue,
// side by side in the village plaza. Four events, each about 40 seconds:
//
//   aizkolaritza  chopping: alternate A/B in rhythm; a stroke at a full
//                 power ring bites deep, rushing or repeating a button glances
//   harri         stone lifting: alternate A/B to heave the stone to the
//                 shoulder, then keep it balanced with left/right to count the lift
//   txingak       carrying weights: alternate A/B steps at a steady pace and
//                 keep your balance, or drop them
//   sokatira      tug of war: pull on the leader's beat; off-beat pulls slip
//
// The winner of an event gets a point; a tie after the day is settled by a
// deciding tug of war. Pure and seeded: no DOM, no clock, no Math.random.
// inputs[p]: { a, b (pressed this step), left, right (held) }

import { makeRng } from './rng.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const EVENTS = ['aizkolaritza', 'harri', 'txingak', 'sokatira'];

// ---- one player's alternating presses ---------------------------------------------

// Returns 'a' | 'b' for a fresh press, or null; notes whether it repeated the last button.
function press(inp, st) {
  const btn = inp.a ? 'a' : inp.b ? 'b' : null;
  if (!btn) return null;
  const repeat = btn === st.last;
  st.last = btn;
  return { btn, repeat };
}

// ---- the events -----------------------------------------------------------------

class Event {
  constructor(day, id) {
    this.day = day; this.id = id; this.R = day.R[id]; this.r = day.r;
    this.t = 0; this.time = this.R.time; this.finished = false; this.winner = null; this.events = [];
  }
  emit(type, extra = {}) { this.events.push({ type, ...extra }); }
  step(inputs, dt) {
    this.events = [];
    if (this.finished) return;
    this.t += dt;
    this.update(inputs, dt);
    if (!this.finished && this.t >= this.time) this.finish();
  }
  finish(winner = this.leader()) {
    this.finished = true;
    this.winner = winner;
    this.emit('end', { winner });
  }
}

// Aizkolaritza: cut through the log. A power ring refills after each stroke;
// a stroke with the ring full is a clean, deep bite.
class Chop extends Event {
  constructor(day) {
    super(day, 'aizkolaritza');
    this.p = [0, 1].map(() => ({ cut: 0, since: 1, last: null, stagger: 0, strokes: 0, perfect: 0, doneAt: null }));
  }
  power(st) { return clamp(st.since / this.R.windup, 0, 1); }
  update(inputs, dt) {
    const R = this.R;
    this.p.forEach((st, i) => {
      st.since += dt; st.stagger = Math.max(0, st.stagger - dt);
      if (st.doneAt != null) return;
      const pr = press(inputs[i] ?? {}, st);
      if (!pr) return;
      if (st.stagger > 0) return;
      const pw = this.power(st);
      st.since = 0; st.strokes++;
      if (pr.repeat) {
        st.cut += R.glance; st.stagger = R.stagger;
        this.emit('glance', { p: i });
      } else {
        const perfect = pw >= R.perfect;
        const bite = perfect ? R.bite * R.perfectBonus : R.bite * pw * pw;
        st.cut = Math.min(1, st.cut + bite);
        if (perfect) st.perfect++;
        this.emit('stroke', { p: i, power: pw, perfect, cut: st.cut });
      }
      if (st.cut >= 1) {
        st.doneAt = this.t;
        this.emit('through', { p: i, t: this.t });
        if (this.p.every((q) => q.doneAt != null)) this.finish();
        else if (this.p.every((q) => q.doneAt != null || q === st)) this.finish(i);
      }
    });
  }
  leader() {
    const [a, b] = this.p;
    if (a.doneAt != null || b.doneAt != null) return a.doneAt == null ? 1 : b.doneAt == null ? 0 : a.doneAt <= b.doneAt ? 0 : 1;
    return Math.abs(a.cut - b.cut) < 0.005 ? null : a.cut > b.cut ? 0 : 1;
  }
  measure(i) { return this.p[i].cut; }
}

// Harri-jasotzea: heave the stone up, then balance it on the shoulder until the judge counts it.
class Lift extends Event {
  constructor(day) {
    super(day, 'harri');
    this.p = [0, 1].map(() => ({ phase: 'raise', h: 0, bal: 0, v: 0, hold: 0, wait: 0, lifts: 0, last: null, drops: 0 }));
  }
  update(inputs, dt) {
    const R = this.R;
    this.p.forEach((st, i) => {
      const inp = inputs[i] ?? {};
      if (st.phase === 'raise') {
        st.h = Math.max(0, st.h - R.sag * dt * (0.3 + st.h));
        const pr = press(inp, st);
        if (pr && !pr.repeat) st.h += R.push;
        if (pr && pr.repeat) this.emit('slip', { p: i });
        if (st.h >= 1) {
          st.h = 1; st.phase = 'shoulder'; st.bal = 0; st.hold = 0;
          st.v = (this.r.chance(0.5) ? 1 : -1) * R.driftStart;
          this.emit('shoulder', { p: i });
        }
      } else if (st.phase === 'shoulder') {
        // The stone wants to roll off: its lean speeds up, more so with each lift.
        // Lean the other way: left pulls a stone tipping right back to the middle.
        const push = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
        st.v += (Math.sign(st.bal || st.v) * R.tip * (1 + st.lifts * R.harder) + (this.r.next() - 0.5) * R.wobble + push * R.correct) * dt;
        st.v *= 1 - R.damp * dt;
        st.bal += st.v * dt;
        st.hold += dt;
        if (Math.abs(st.bal) >= 1) {
          st.phase = 'drop'; st.wait = R.dropTime; st.drops++;
          this.emit('drop', { p: i });
        } else if (st.hold >= R.hold) {
          st.lifts++; st.phase = 'down'; st.wait = R.downTime;
          this.emit('lift', { p: i, n: st.lifts });
        }
      } else {
        st.h = Math.max(0, st.h - dt * 3);
        if ((st.wait -= dt) <= 0) { st.phase = 'raise'; st.h = 0; st.last = null; }
      }
    });
  }
  leader() {
    const [a, b] = this.p;
    if (a.lifts !== b.lifts) return a.lifts > b.lifts ? 0 : 1;
    const ha = a.phase === 'shoulder' ? 1 + a.hold : a.h, hb = b.phase === 'shoulder' ? 1 + b.hold : b.h;
    return Math.abs(ha - hb) < 0.02 ? null : ha > hb ? 0 : 1;
  }
  measure(i) { return this.p[i].lifts; }
}

// Txingak: walk with a weight in each hand. Steady, alternating steps carry
// you furthest; rushing makes the weights swing and tip your balance.
class Carry extends Event {
  constructor(day) {
    super(day, 'txingak');
    this.p = [0, 1].map(() => ({ dist: 0, since: 1, last: null, bal: 0, v: 0, down: 0, steps: 0, drops: 0 }));
  }
  update(inputs, dt) {
    const R = this.R;
    this.p.forEach((st, i) => {
      const inp = inputs[i] ?? {};
      st.since += dt;
      if (st.down > 0) { st.down -= dt; if (st.down <= 0) { st.bal = 0; st.v = 0; st.last = null; } return; }
      const push = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      st.v += ((this.r.next() - 0.5) * R.wobble + Math.sign(st.bal) * R.tip + push * R.correct) * dt;
      st.v *= 1 - R.damp * dt;
      st.bal += st.v * dt;
      const pr = press(inp, st);
      if (pr) {
        const gap = st.since; st.since = 0;
        if (pr.repeat) { st.v += (this.r.chance(0.5) ? 1 : -1) * R.stumble; this.emit('stumble', { p: i }); }
        else {
          // Best at a steady pace; a rushed step is short and swings the weights.
          const q = clamp(1 - Math.abs(gap - R.pace) / R.pace, 0.1, 1);
          const rushed = gap < R.pace * 0.6;
          st.dist += R.stride * q; st.steps++;
          st.v += (this.r.next() - 0.5) * R.kick * (rushed ? 3 : 1);
          this.emit('step', { p: i, q, dist: st.dist });
        }
      }
      if (Math.abs(st.bal) >= 1) {
        st.down = R.dropTime; st.drops++; st.bal = Math.sign(st.bal);
        this.emit('drop', { p: i });
      }
    });
  }
  leader() {
    const [a, b] = this.p;
    return Math.abs(a.dist - b.dist) < 0.05 ? null : a.dist > b.dist ? 0 : 1;
  }
  measure(i) { return this.p[i].dist; }
}

// Sokatira: the leader calls the beat; pulls on it move the rope, pulls off it slip.
class Tug extends Event {
  constructor(day) {
    super(day, 'sokatira');
    this.x = 0; this.v = 0; // metres; positive is toward blue
    this.beat = 0; this.nextBeat = this.R.lead; this.interval = this.R.beat[0];
    this.p = [0, 1].map(() => ({ pulledBeat: -1, good: 0, slips: 0, power: 0 }));
  }
  update(inputs, dt) {
    const R = this.R;
    // The beat quickens through the pull.
    this.interval = R.beat[0] + (R.beat[1] - R.beat[0]) * clamp(this.t / this.time, 0, 1);
    if (this.t >= this.nextBeat) { this.beat++; this.lastBeat = this.nextBeat; this.nextBeat += this.interval; this.emit('beat', { n: this.beat }); }
    this.p.forEach((st, i) => {
      st.power = Math.max(0, st.power - dt * 3);
      const inp = inputs[i] ?? {};
      if (!inp.a && !inp.b) return;
      // Which beat is this press nearest, and how close?
      const prev = this.lastBeat ?? -9, next = this.nextBeat;
      const [near, n] = this.t - prev < next - this.t ? [prev, this.beat] : [next, this.beat + 1];
      const off = Math.abs(this.t - near);
      if (off <= R.window && st.pulledBeat !== n) {
        st.pulledBeat = n;
        const q = 1 - off / R.window;
        st.power = 0.5 + q * 0.5; st.good++;
        this.v += (i ? 1 : -1) * R.pull * (0.4 + 0.6 * q);
        this.emit('pull', { p: i, q, perfect: q > 0.7 });
      } else {
        st.slips++;
        this.v -= (i ? 1 : -1) * R.slip;
        this.emit('slip', { p: i });
      }
    });
    this.v *= 1 - R.friction * dt;
    this.x += this.v * dt;
    if (Math.abs(this.x) >= R.win) this.finish(this.x > 0 ? 1 : 0);
  }
  leader() { return Math.abs(this.x) < 0.02 ? null : this.x > 0 ? 1 : 0; }
  measure(i) { return i ? this.x : -this.x; }
}

const MAKE = { aizkolaritza: Chop, harri: Lift, txingak: Carry, sokatira: Tug };

// ---- the computer competitor --------------------------------------------------------------

export class Rival {
  constructor(profile, rng) { this.P = profile; this.r = rng; this.plan = 0; this.hold = { left: false, right: false }; this.lastBtn = 'b'; }
  alt() { this.lastBtn = this.lastBtn === 'a' ? 'b' : 'a'; return { [this.lastBtn]: true }; }
  // Returns this step's input for player i.
  input(ev, i, dt) {
    const P = this.P, r = this.r;
    this.plan -= dt;
    const out = {};
    if (ev.id === 'aizkolaritza') {
      const st = ev.p[i];
      if (st.doneAt != null || st.stagger > 0) return out;
      if (ev.power(st) >= P.patience + (r.next() - 0.5) * P.jitter && this.plan <= 0) {
        this.plan = r.range(0, P.jitter * 0.3);
        if (r.chance(P.slip)) return { [this.lastBtn]: true }; // a fumble
        return this.alt();
      }
    } else if (ev.id === 'harri') {
      const st = ev.p[i];
      if (st.phase === 'raise' && this.plan <= 0) { this.plan = P.mash * r.range(0.8, 1.25); return this.alt(); }
      if (st.phase === 'shoulder') {
        // Lean against the tilt, a little late and a little rough.
        const want = st.bal + st.v * P.anticipate;
        if (this.plan <= 0) { this.plan = P.react; this.hold = { left: want > P.dead, right: want < -P.dead }; }
        return { ...this.hold };
      }
    } else if (ev.id === 'txingak') {
      const st = ev.p[i];
      if (st.down > 0) return out;
      const want = st.bal + st.v * P.anticipate;
      if (r.chance(dt / P.react)) this.hold = { left: want > P.dead, right: want < -P.dead };
      if (st.since >= ev.R.pace * P.pace + (r.next() - 0.5) * P.jitter * 0.5) return { ...this.hold, ...this.alt() };
      return { ...this.hold };
    } else if (ev.id === 'sokatira') {
      // Pull a little off the beat, by the rival's timing error.
      if (this.aim == null || ev.t > this.aim + 0.2) this.aim = ev.nextBeat + (r.next() + r.next() - 1) * P.timing;
      if (ev.t >= this.aim && this.pulled !== this.aim) { this.pulled = this.aim; return { a: true }; }
    }
    return out;
  }
}

// ---- the day -----------------------------------------------------------------------------------

export class Day {
  constructor(rules, { players = 2, difficulty = 'normal', seed = 1, ai = null, events = EVENTS } = {}) {
    this.R = rules; this.r = makeRng(seed);
    this.players = players === 1 ? 1 : 2;
    this.difficulty = rules.rivals[difficulty] ? difficulty : 'normal';
    const aiFor = ai ?? [false, this.players === 1];
    this.rivals = aiFor.map((on) => (on ? new Rival(rules.rivals[this.difficulty], this.r) : null));
    this.order = [...events];
    this.index = 0;
    this.points = [0, 0];
    this.results = [];
    this.event = null;
    this.over = false;
    this.winner = null;
  }

  start() { this.event = new MAKE[this.order[this.index]](this); return this.event; }

  step(inputs, dt) {
    const ev = this.event;
    if (!ev || ev.finished) return;
    const ins = [0, 1].map((i) => (this.rivals[i] ? this.rivals[i].input(ev, i, dt) : inputs[i] ?? {}));
    ev.step(ins, dt);
    if (ev.finished) this.record(ev);
  }

  record(ev) {
    const w = ev.winner;
    if (w == null) { this.points[0] += 0.5; this.points[1] += 0.5; } else this.points[w] += 1;
    this.results.push({ id: ev.id, winner: w, measure: [ev.measure(0), ev.measure(1)] });
  }

  // After an event: move on, add a deciding tug if the day is level, or end it.
  next() {
    this.index++;
    if (this.index >= this.order.length) {
      if (this.points[0] === this.points[1] && this.order.length < EVENTS.length + 2) this.order.push('sokatira');
      else { this.over = true; this.winner = this.points[0] > this.points[1] ? 0 : this.points[1] > this.points[0] ? 1 : null; return null; }
    }
    return this.start();
  }
}
