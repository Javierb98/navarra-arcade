// Salinas de Oro: a summer season at the inland salt pans, as an arcade
// upgrade sim. Salty spring water runs down a wooden channel to the
// evaporation beds (eras). Open a bed's sluice to fill it, close it when
// it's full; the sun evaporates the water and salt crystallises. Rake it
// while it's white (left too long it greys), carry it in your basket to the
// store, and each evening the stored salt is sold and you buy upgrades.
// Summer storms wash out salt left in the beds.
//
// Pure and seeded: no DOM, no clock, no Math.random. The UI calls
// step(inputs, dt) and reads the state. World units are metres on a flat
// map seen from above: x across (0..W), y down the hillside (0..H).
//
// inputs[p]: { x, y (stick, -1..1), a (pressed), aHeld, b (pressed) }
//   A: rake (hold), pick up salt, unload at the store
//   B: open or close the sluice of the nearest bed

import { makeRng } from './rng.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const UPGRADES = ['era', 'rasero', 'cesto', 'canal', 'burro', 'toldo'];

export class Season {
  constructor(data, { players = 1, seed = 1, difficulty = 'normal' } = {}) {
    this.R = data.rules;
    this.L = data.layout;
    this.r = makeRng(seed);
    this.players = players === 2 ? 2 : 1;
    this.diff = this.R.difficulty[difficulty] ?? this.R.difficulty.normal;
    this.day = 1;
    this.days = this.R.season.days;
    this.t = 0;          // seconds into the current day
    this.phase = 'day';  // 'day' | 'evening' | 'over'
    this.coins = this.R.start.coins;
    this.levels = Object.fromEntries(UPGRADES.map((u) => [u, 0]));
    this.levels.era = this.R.start.beds;
    this.beds = this.L.beds.map((b, i) => ({ i, ...b, open: i < this.R.start.beds, sluice: false, water: 0, fill: 0, salt: 0, dry: 0, heap: 0, heapQ: 0, rake: 0, quality: 1, state: 'empty' }));
    // The first beds were filled the evening before: the sun is already at work on them.
    this.beds.filter((b) => b.open).forEach((b, k) => { b.water = this.R.start.water[k % this.R.start.water.length]; b.fill = 1; b.salt = (1 - b.water) * this.R.saltPerFill; });
    this.store = { ...this.L.store, kg: 0, value: 0 };
    this.workers = [0, 1].slice(0, this.players).map((i) => ({ i, x: this.L.start[i].x, y: this.L.start[i].y, vx: 0, vy: 0, carry: 0, carryValue: 0, raking: null, face: 1 }));
    this.donkey = { x: this.store.x + 1, y: this.store.y, carry: 0, value: 0, target: null };
    this.weather = { cloud: 0, rain: false, next: this.nextStorm(), left: 0 };
    this.stats = { kg: 0, coins: 0, white: 0, grey: 0, washed: 0, overflow: 0, sold: [], flor: 0, orders: 0, best: 0, shoos: 0, trampled: 0 };
    // Excitement: a streak of white rakes, muleteers' carts with orders, and goats.
    this.streak = 0;
    this.cart = null; this.nextCart = this.R.cart.first;
    this.goats = []; this.nextGoat = this.R.goat.first;
    this.events = [];
  }

  emit(type, extra = {}) { this.events.push({ type, ...extra }); }

  // ---- derived values ------------------------------------------------------------------

  // How strong the sun is now: low in the morning, fierce at midday.
  sun() {
    const k = this.t / this.R.season.dayLength;
    const base = Math.sin(Math.PI * clamp(k, 0, 1));
    return (0.25 + 0.75 * base) * (this.weather.cloud > 0.5 ? 0.25 : 1 - this.weather.cloud * 0.6) * (1 + (this.day - 1) * this.R.sun.perDay);
  }
  flowRate() { return this.R.flow.base * (1 + this.levels.canal * this.R.flow.perLevel); }
  rakeRate() { return this.R.rake.base * (1 + this.levels.rasero * this.R.rake.perLevel); }
  basket() { return this.R.basket.base + this.levels.cesto * this.R.basket.perLevel; }
  price(q) { return this.R.price.base * (q >= this.R.quality.white ? this.R.price.whiteBonus : 1) * (0.5 + 0.5 * q); }
  mult() { const S = this.R.streak; return Math.min(S.max, 1 + Math.max(0, this.streak - 1) * S.step); }
  // Just dried, the salt shimmers: flor de sal, worth double.
  isFlor(b) { return b.water === 0 && b.salt > 0 && b.dry < this.R.quality.flor; }
  cost(u) {
    const C = this.R.costs[u], lv = u === 'era' ? this.levels.era - this.R.start.beds : this.levels[u];
    if (u === 'era' && this.levels.era >= this.beds.length) return null;
    if (u !== 'era' && lv >= C.length) return null;
    return u === 'era' ? Math.round(C.base * Math.pow(C.growth, lv)) : C[lv];
  }

  // ---- the step --------------------------------------------------------------------------

  step(inputs, dt) {
    this.events = [];
    if (this.phase !== 'day') return;
    this.t += dt;
    this.updateWeather(dt);
    this.updateBeds(dt);
    for (const w of this.workers) this.updateWorker(w, inputs[w.i] ?? {}, dt);
    this.updateCart(dt);
    this.updateGoats(dt);
    if (this.levels.burro > 0) this.updateDonkey(dt);
    if (this.t >= this.R.season.dayLength) this.endDay();
  }

  nextStorm() { return this.r.chance(this.R.storm.chance) ? this.r.range(this.R.storm.earliest, this.R.season.dayLength - 10) : Infinity; }

  updateWeather(dt) {
    const W = this.weather, S = this.R.storm;
    if (!W.rain && this.t >= W.next - S.warning && this.t < W.next) {
      if (W.cloud === 0) this.emit('clouds');
      W.cloud = Math.min(1, W.cloud + dt / S.warning);
    } else if (!W.rain && this.t >= W.next) {
      W.rain = true; W.left = S.length * this.diff.storm; W.cloud = 1;
      this.emit('rain');
    } else if (W.rain) {
      W.left -= dt;
      if (W.left <= 0) { W.rain = false; W.next = this.t + 9999; this.emit('clear'); }
    } else W.cloud = Math.max(0, W.cloud - dt * 0.3);
  }

  updateBeds(dt) {
    const R = this.R;
    // The spring's flow is shared between the open sluices.
    const open = this.beds.filter((b) => b.open && b.sluice);
    const share = open.length ? this.flowRate() / open.length : 0;
    for (const b of this.beds) {
      if (!b.open) continue;
      if (b.sluice) {
        if (b.water < 1) { b.water = Math.min(1.08, b.water + share * dt); b.fill = Math.max(b.fill, Math.min(1, b.water)); }
        else { b.water = 1.08; this.stats.overflow += dt; if (!b.spilling) { b.spilling = true; this.emit('overflow', { bed: b.i }); } }
      } else b.spilling = false;
      if (b.water > 1) b.water = Math.max(1, b.water - dt * 0.5);
      // Evaporation: the sun takes the water; salt is left behind.
      if (!b.sluice && b.water > 0) {
        const before = b.water;
        b.water = Math.max(0, b.water - R.evap * this.sun() * this.diff.evap * dt);
        b.salt += (before - b.water) * R.saltPerFill;
        if (b.water === 0) { b.state = 'ready'; b.dry = 0; this.emit('ready', { bed: b.i }); }
      }
      // Dry salt in the sun: white for a while, then it greys.
      if (b.water === 0 && b.salt > 0) {
        b.dry += dt;
        b.quality = b.dry < R.quality.window ? 1 : Math.max(R.quality.floor, 1 - (b.dry - R.quality.window) / R.quality.fade);
      }
      // Rain dissolves salt in the bed and washes away uncarried heaps.
      if (this.weather.rain) {
        const guard = 1 - Math.min(0.9, this.levels.toldo * R.storm.coverPerLevel);
        const loss = R.storm.dissolve * guard * dt;
        if (b.salt > 0) { const l = Math.min(b.salt, b.salt * loss); b.salt -= l; this.stats.washed += l; if (b.water === 0 && this.streak) { this.streak = 0; this.emit('streakLost'); } }
        if (b.heap > 0) { const l = Math.min(b.heap, b.heap * loss); if (b.heapValue) b.heapValue *= 1 - l / b.heap; b.heap -= l; this.stats.washed += l; }
        if (b.water > 0 && b.water < 1) b.water = Math.min(1, b.water + dt * 0.04 * guard);
      }
      b.state = !b.water && !b.salt ? (b.heap ? 'heap' : 'empty') : b.water > 0 ? (b.sluice ? 'filling' : 'drying') : 'ready';
    }
  }

  // ---- the workers ---------------------------------------------------------------------------

  nearestBed(w, max = 1.1) {
    let best = null, bd = max;
    for (const b of this.beds) {
      if (!b.open) continue;
      // Distance to the bed's rectangle.
      const dx = Math.max(b.x - w.x, 0, w.x - (b.x + b.w)), dy = Math.max(b.y - w.y, 0, w.y - (b.y + b.h));
      const d = Math.hypot(dx, dy);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  sluicePoint(b) { return { x: b.x + b.w / 2, y: b.y - 0.25 }; }

  updateWorker(w, inp, dt) {
    const R = this.R;
    const sp = R.walk * (w.carry > 0 ? 1 - R.basket.slow * (w.carry / this.basket()) : 1);
    let ix = clamp(inp.x ?? 0, -1, 1), iy = clamp(inp.y ?? 0, -1, 1);
    const l = Math.hypot(ix, iy); if (l > 1) { ix /= l; iy /= l; }
    if (w.raking && inp.aHeld) { ix = 0; iy = 0; }
    w.vx = ix * sp; w.vy = iy * sp;
    if (ix) w.face = Math.sign(ix);
    w.x = clamp(w.x + w.vx * dt, this.L.bounds.x0, this.L.bounds.x1);
    w.y = clamp(w.y + w.vy * dt, this.L.bounds.y0, this.L.bounds.y1);

    const bed = this.nearestBed(w);
    // B: the nearest bed's sluice.
    if (inp.b && bed) {
      bed.sluice = !bed.sluice;
      this.emit(bed.sluice ? 'open' : 'close', { bed: bed.i, p: w.i });
    }
    // A at the store: unload the basket.
    if (inp.a && dist(w, this.store) < this.store.r && w.carry > 0) {
      this.deliver(w.carry, w.carryValue, w.i);
      w.carry = 0; w.carryValue = 0;
      return;
    }
    // A at a bed: pick up its heap, or start raking dry salt (hold A).
    if (inp.a && bed && bed.heap > 0 && w.carry < this.basket()) {
      const take = Math.min(bed.heap, this.basket() - w.carry);
      const share = (bed.heapValue ?? take * this.price(bed.heapQ)) * (take / bed.heap);
      w.carryValue += share; bed.heapValue = (bed.heapValue ?? 0) - share;
      w.carry += take; bed.heap -= take;
      if (bed.heap <= 1e-6) { bed.heap = 0; bed.heapValue = 0; }
      this.emit('pickup', { p: w.i, kg: take, bed: bed.i });
      return;
    }
    if (inp.aHeld && bed && bed.water === 0 && bed.salt > 0) {
      w.raking = bed.i;
      bed.rake += this.rakeRate() * dt;
      if (bed.rake >= 1) {
        // The salt goes into a heap at the bed's edge, valued as it was when raked:
        // white beats grey, flor de sal doubles it, and a streak of white rakes multiplies it.
        const kg = bed.salt, white = bed.quality >= R.quality.white, flor = this.isFlor(bed);
        if (white) this.streak++; else this.streak = 0;
        this.stats.best = Math.max(this.stats.best, this.streak);
        const value = kg * this.price(bed.quality) * (flor ? R.quality.florBonus : 1) * this.mult();
        bed.heapQ = bed.heap ? (bed.heapQ * bed.heap + bed.quality * kg) / (bed.heap + kg) : bed.quality;
        bed.heapValue = (bed.heapValue ?? 0) + value;
        bed.heap += kg; bed.salt = 0; bed.rake = 0; bed.fill = 0;
        this.stats.kg += kg;
        if (flor) this.stats.flor += kg;
        if (white) this.stats.white += kg; else this.stats.grey += kg;
        this.emit('raked', { p: w.i, bed: bed.i, kg, white, flor, streak: this.streak, mult: this.mult() });
      }
    } else w.raking = null;
  }

  // The donkey walks heaps to the store on its own.
  updateDonkey(dt) {
    const d = this.donkey, R = this.R.donkey;
    const cap = R.carry * this.levels.burro;
    if (!d.target) {
      if (d.carry > 0) d.target = { store: true, x: this.store.x + 0.6, y: this.store.y };
      else { const b = this.beds.filter((q) => q.open && q.heap > 0).sort((p, q) => q.heap - p.heap)[0]; if (b) d.target = { bed: b.i, x: b.x + b.w / 2, y: b.y + b.h + 0.4 }; }
      if (!d.target) return;
    }
    const dx = d.target.x - d.x, dy = d.target.y - d.y, l = Math.hypot(dx, dy);
    if (l > 0.15) { const s = Math.min(l, R.speed * dt); d.x += (dx / l) * s; d.y += (dy / l) * s; d.face = Math.sign(dx) || d.face; return; }
    if (d.target.store) { this.store.kg += d.carry; this.store.value += d.value; if (d.carry) this.emit('donkey', { kg: d.carry }); d.carry = 0; d.value = 0; }
    else {
      const b = this.beds[d.target.bed], take = Math.min(b.heap, cap - d.carry);
      if (take > 0) { const share = (b.heapValue ?? take * this.price(b.heapQ)) * (take / b.heap); d.value += share; b.heapValue = (b.heapValue ?? 0) - share; d.carry += take; b.heap -= take; if (b.heap <= 1e-6) { b.heap = 0; b.heapValue = 0; } }
    }
    d.target = null;
  }

  // ---- deliveries, muleteers' carts and goats ------------------------------------------------------

  // Salt brought to the store goes first to a waiting cart's order (paid on the spot, with a bonus).
  deliver(kg, value, p) {
    let rest = kg, restValue = value;
    if (this.cart && this.cart.got < this.cart.want) {
      const give = Math.min(rest, this.cart.want - this.cart.got);
      const v = value * (give / kg);
      this.cart.got += give; this.cart.value += v; rest -= give; restValue -= v;
      this.emit('cartLoad', { p, kg: give, got: this.cart.got, want: this.cart.want });
      if (this.cart.got >= this.cart.want - 1e-6) {
        const pay = Math.round(this.cart.value * this.R.cart.bonus + this.R.cart.tip);
        this.coins += pay; this.stats.coins += pay; this.stats.orders++;
        this.emit('cartDone', { coins: pay });
        this.cart.leaving = true;
      }
    }
    if (rest > 1e-6) { this.store.kg += rest; this.store.value += restValue; this.emit('unload', { p, kg: rest }); }
  }

  updateCart(dt) {
    const C = this.R.cart;
    if (this.cart) {
      const c = this.cart;
      if (c.leaving) { c.x += dt * 2.2; if (c.x > c.arrive + 6) this.cart = null; return; }
      if (c.x < c.arrive) { c.x = Math.min(c.arrive, c.x + dt * 2.2); return; }
      c.left -= dt;
      if (c.left <= 0) { c.leaving = true; this.emit('cartGone', { got: c.got, want: c.want }); if (c.got > 0) { const pay = Math.round(c.value); this.coins += pay; this.stats.coins += pay; } }
      return;
    }
    if (this.t >= this.nextCart && this.t < this.R.season.dayLength - C.time * 0.6) {
      const want = Math.round(this.r.range(C.want[0], C.want[1]) * (1 + (this.day - 1) * C.grow) / 5) * 5;
      this.cart = { want, got: 0, value: 0, left: C.time, x: this.L.cart.x - 4, arrive: this.L.cart.x, y: this.L.cart.y };
      this.nextCart = this.t + this.r.range(C.every[0], C.every[1]);
      this.emit('cart', { want });
    }
  }

  updateGoats(dt) {
    const G = this.R.goat;
    if (this.t >= this.nextGoat && this.goats.length < G.max) {
      const fromRight = this.r.chance(0.5);
      this.goats.push({ x: fromRight ? this.L.bounds.x1 + 0.5 : this.L.bounds.x0 + 0.3, y: this.r.range(2, 8), target: null, flee: 0, munch: 0, face: fromRight ? -1 : 1 });
      this.nextGoat = this.t + this.r.range(G.every[0], G.every[1]) / this.diff.goats;
      this.emit('goat');
    }
    for (const g of this.goats) {
      // Workers scare goats off by running at them.
      for (const w of this.workers) if (!g.flee && dist(w, g) < G.scare) { g.flee = 1; g.face = Math.sign(g.x - w.x) || 1; this.stats.shoos++; this.emit('shoo', { p: w.i, x: g.x, y: g.y }); }
      if (g.flee) { g.x += g.face * G.run * dt; g.y += (g.y < 5 ? -1 : 1) * G.run * 0.3 * dt; continue; }
      // Otherwise they head for a bed with salt in it and trample it.
      if (g.target == null || !this.beds[g.target].open) {
        const tasty = this.beds.filter((b) => b.open && (b.salt > 0 || b.heap > 0));
        g.target = tasty.length ? this.r.pick(tasty).i : null;
      }
      if (g.target == null) continue;
      const b = this.beds[g.target], tx = b.x + b.w / 2, ty = b.y + b.h / 2, dx = tx - g.x, dy = ty - g.y, l = Math.hypot(dx, dy);
      if (l > 0.3) { g.x += (dx / l) * G.walk * dt; g.y += (dy / l) * G.walk * dt; g.face = Math.sign(dx) || g.face; g.munch = 0; }
      else {
        g.munch += dt;
        const lose = G.trample * dt;
        const ls = Math.min(b.salt, lose), lh = Math.min(b.heap, lose);
        b.salt -= ls; if (lh) { if (b.heapValue) b.heapValue *= 1 - lh / b.heap; b.heap -= lh; }
        this.stats.trampled += ls + lh;
        if (g.munch > 0 && g.munch - dt <= 0) this.emit('trample', { bed: b.i });
      }
    }
    this.goats = this.goats.filter((g) => g.x > this.L.bounds.x0 - 2 && g.x < this.L.bounds.x1 + 2 && g.y > -1 && g.y < 11);
  }

  // ---- evenings ----------------------------------------------------------------------------

  endDay() {
    // Whatever is in the store is sold; salt still in baskets waits for tomorrow.
    const earned = Math.round(this.store.value);
    this.coins += earned; this.stats.coins += earned;
    this.stats.sold.push({ day: this.day, kg: this.store.kg, coins: earned });
    this.emit('sold', { kg: this.store.kg, coins: earned, day: this.day });
    this.store.kg = 0; this.store.value = 0;
    for (const b of this.beds) b.sluice = false;
    this.cart = null; this.goats = [];
    this.phase = this.day >= this.days ? 'over' : 'evening';
    if (this.phase === 'over') this.emit('over', { coins: this.stats.coins });
  }

  buy(u) {
    const c = this.cost(u);
    if (this.phase !== 'evening' || c == null || this.coins < c) return false;
    this.coins -= c;
    if (u === 'era') { this.beds[this.levels.era].open = true; this.levels.era++; }
    else this.levels[u]++;
    this.emit('bought', { u, level: this.levels[u] });
    return true;
  }

  nextDay() {
    if (this.phase !== 'evening') return;
    this.day++; this.t = 0; this.phase = 'day';
    this.weather = { cloud: 0, rain: false, next: this.nextStorm(), left: 0 };
    this.nextCart = this.R.cart.first; this.nextGoat = this.R.goat.first;
    for (const w of this.workers) { w.raking = null; }
    this.emit('morning', { day: this.day });
  }

  score() { return Math.round(this.stats.coins + this.stats.white * this.R.score.whiteKg + this.stats.best * this.R.score.streak); }
}

// ---- a sensible salt worker, for the attract demo and the balance tests ------------------------

export class Helper {
  constructor(season, i) { this.s = season; this.i = i; this.goal = null; }

  // Beds the other worker is already heading for are left to them.
  claimed(b) { return (this.s.helpers ?? []).some((h) => h !== this && h.target === b.i); }

  input() {
    const out = this.decide();
    return out;
  }

  decide() {
    const s = this.s, w = s.workers[this.i], R = s.R;
    this.target = null;
    const mine = (b) => { this.target = b.i; return b; };
    const go = (x, y) => { const dx = x - w.x, dy = y - w.y, l = Math.hypot(dx, dy); return l < 0.12 ? { x: 0, y: 0, there: true } : { x: dx / Math.max(l, 0.4), y: dy / Math.max(l, 0.4), there: false }; };
    const atBed = (b) => go(b.x + b.w / 2, b.y + b.h / 2);
    const open = s.beds.filter((b) => b.open);
    // 1. Carry a full basket (or anything, near day's end) to the store.
    if (w.carry >= s.basket() * 0.95 || (w.carry > 0 && s.t > R.season.dayLength - 8) || (w.carry > 0 && !open.some((b) => b.heap > 0 || (b.water === 0 && b.salt > 0)))) {
      const m = go(s.store.x, s.store.y);
      return dist(w, s.store) < s.store.r * 0.8 ? { a: true } : m;
    }
    // 1b. Chase off a goat that's trampling salt.
    const goat = s.goats.find((g) => !g.flee && g.target != null && Math.hypot(g.x - w.x, g.y - w.y) < 6);
    if (goat) return go(goat.x, goat.y);
    // 2. Close a full sluice.
    const full = open.find((b) => b.sluice && b.water >= 0.98 && !this.claimed(b));
    if (full) { mine(full); const sp = s.sluicePoint(full); const m = go(sp.x, sp.y); return s.nearestBed(w) === full && dist(w, sp) < 0.9 ? { b: true } : m; }
    // 3. Rake ready salt (whitest first), or pick up a heap.
    const ready = open.filter((b) => b.water === 0 && b.salt > 0 && !this.claimed(b) && !s.workers.some((o) => o !== w && o.raking === b.i)).sort((a, b) => a.dry - b.dry)[0];
    if (ready) { mine(ready); const m = atBed(ready); return s.nearestBed(w, 0.3) === ready ? { aHeld: true, a: false } : m; }
    const heap = open.filter((b) => b.heap > 0 && !this.claimed(b)).sort((a, b) => b.heap - a.heap)[0];
    if (heap && w.carry < s.basket()) { mine(heap); const m = atBed(heap); return s.nearestBed(w, 0.3) === heap ? { a: true } : m; }
    // 4. Open the sluice of an empty bed (not in the last stretch of the day).
    const empty = open.find((b) => !b.sluice && b.water === 0 && b.salt === 0 && b.heap === 0 && !this.claimed(b));
    if (empty && s.t < R.season.dayLength - 10) { mine(empty); const sp = s.sluicePoint(empty); const m = go(sp.x, sp.y); return s.nearestBed(w) === empty && dist(w, sp) < 0.9 ? { b: true } : m; }
    if (w.carry > 0) { const m = go(s.store.x, s.store.y); return dist(w, s.store) < s.store.r * 0.8 ? { a: true } : m; }
    return go(open[0].x + open[0].w / 2, open[0].y - 0.6);
  }

  // Evening shopping: beds first, then whatever is cheapest that helps.
  shop() {
    const s = this.s, order = ['era', 'cesto', 'rasero', 'canal', 'burro', 'toldo'];
    for (let k = 0; k < 6; k++) {
      const can = order.filter((u) => s.cost(u) != null && s.cost(u) <= s.coins);
      if (!can.length) return;
      const pick = can.includes('era') ? 'era' : can.sort((a, b) => s.cost(a) - s.cost(b))[0];
      s.buy(pick);
    }
  }
}
