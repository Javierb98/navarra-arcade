// Los Hombres Verdes: a single-player dig-down mining game in the spirit of
// Motherload, with a person, not a machine. A miner goes down from the village through
// layers that are Navarre's mines, newest at the top and oldest at the
// bottom: the potash pits, the iron of the royal arms factories, the
// medieval copper of Arce, the Roman galleries, the Bronze Age copper, and
// at the very bottom the cave of the Hombres Verdes. Ore is sold at the
// surface; the money buys better tools, from a stone hammer to a pneumatic
// one, from a torch to an electric lamp, from notched logs to the cage.
// There is no clock: the game is won by reaching the cave, and the time it
// took is the score.
//
// Pure and seeded: no DOM, no clock, no Math.random. The UI calls
// step(inputs, dt). World units are tiles (1 x 1, about a metre); x across,
// y down; the ground surface is at y = SURFACE.
//
// inputs[p]: { x, y (stick -1..1; y < 0 is up), a, b (pressed) }
//   left/right: walk, or dig sideways into a wall
//   down: dig down (a ladder goes in behind you), or climb down a ladder
//   up: climb a ladder, or ride the shaft once it has a windlass or a cage
//   A at the workshop: the shop.  B: put a ladder where you stand.

import { makeRng } from './rng.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const SURFACE = 4;
export const UPGRADES = ['pick', 'lamp', 'bag', 'gear', 'ladders', 'shaft'];

export class Mine {
  constructor(data, { seed = 1, difficulty = 'normal' } = {}) {
    this.R = data.rules;
    this.r = makeRng(seed);
    this.diff = this.R.difficulty[difficulty] ?? this.R.difficulty.normal;
    this.W = this.R.world.w; this.H = this.R.world.h;
    this.levels = Object.fromEntries(UPGRADES.map((u) => [u, 0]));
    this.generate();
    this.money = this.R.start.money;
    this.t = 0;
    this.over = false; // set by the game once the cave's story has been told
    this.miners = [this.newMiner(0)];
    this.stats = { earned: 0, deepest: 0, finds: 0, ores: {}, rescues: 0, sold: 0, cave: false };
    this.found = new Set(); // layers and ores seen, for the history cards
    this.rocks = []; // loose rocks about to fall, or falling
    this.events = [];
  }

  emit(type, extra = {}) { this.events.push({ type, ...extra }); }

  // ---- the ground --------------------------------------------------------------------------

  // Each tile is { rock, ore, ladder, loose, cave }; rock 0 is open space.
  generate() {
    const R = this.R, rng = this.r;
    this.tiles = [];
    for (let y = 0; y < this.H; y++) {
      const row = [];
      for (let x = 0; x < this.W; x++) {
        if (y < SURFACE) { row.push({ rock: 0 }); continue; }
        const band = R.layers.find((l) => y < l.to) ?? R.layers.at(-1);
        let rock = band.rock;
        if (rng.chance(band.harder ?? 0)) rock = Math.min(R.rocks.length - 1, rock + 1);
        const tile = { rock, ore: null };
        if (y > SURFACE) {
          for (const [ore, o] of Object.entries(R.ores)) {
            if (y < o.from || y > o.to) continue;
            const mid = (o.from + o.to) / 2, spread = (o.to - o.from) / 2;
            if (rng.chance(o.chance * (1 - 0.6 * Math.abs(y - mid) / spread))) { tile.ore = ore; break; }
          }
          if (!tile.ore && y > R.badAir.from && rng.chance(R.badAir.chance)) tile.ore = 'air';
          if (!tile.ore && y > R.loose.from && rng.chance(R.loose.chance)) tile.loose = true;
        }
        row.push(tile);
      }
      this.tiles.push(row);
    }
    // Veins: ores come in small clusters (finds stay single).
    for (let y = SURFACE + 1; y < this.H - 1; y++) for (let x = 1; x < this.W - 1; x++) {
      const t = this.tiles[y][x];
      if (t.ore && t.ore !== 'air' && !R.ores[t.ore].find && rng.chance(R.vein)) {
        const n = this.tiles[y + rng.int(2)][x + rng.int(3) - 1];
        if (n.rock && !n.ore && !n.loose) n.ore = t.ore;
      }
    }
    // The village floor holds no ore and no loose rock.
    for (let x = 0; x < this.W; x++) Object.assign(this.tiles[SURFACE][x], { ore: null, loose: false });
    // The old pit already exists: a short shaft with ladders and a gallery.
    const S = R.shaft;
    for (let y = SURFACE; y <= S.to; y++) Object.assign(this.tiles[y][S.x], { rock: 0, ore: null, loose: false, ladder: true });
    for (let x = S.x + 1; x <= S.gallery; x++) Object.assign(this.tiles[S.to][x], { rock: 0, ore: null, loose: false });
    for (let x = S.x - 1; x <= S.gallery + 1; x++) if (this.tiles[S.to - 1][x]) this.tiles[S.to - 1][x].loose = false;
    // At the bottom, the cave of the Hombres Verdes, open since long ago.
    const C = R.cave;
    for (let y = C.y0; y <= C.y1; y++) for (let x = C.x0; x <= C.x1; x++) Object.assign(this.tiles[y][x], { rock: 0, ore: null, loose: false, cave: true });
    for (let x = C.x0 - 1; x <= C.x1 + 1; x++) { const t = this.tiles[C.y0 - 1][x]; if (t) t.loose = false; }
  }

  tile(x, y) { return x < 0 || x >= this.W || y >= this.H ? { rock: 99 } : y < 0 ? { rock: 0 } : this.tiles[y][x]; }
  solid(x, y) { return this.tile(Math.floor(x), Math.floor(y)).rock > 0; }
  ladderAt(x, y) { return !!this.tile(Math.floor(x), Math.floor(y)).ladder; }
  hardness(t) { return this.R.rocks[t.rock]?.hard ?? 99; }
  canDig(t) { return t.rock > 0 && t.rock < 99 && (this.R.rocks[t.rock].needs ?? 0) <= this.levels.pick; }
  inShaft(p) { return this.levels.shaft > 0 && Math.floor(p.x) === this.R.shaft.x && p.y > SURFACE - 1 && !this.solid(p.x, p.y + 0.45); }

  // ---- upgrades ------------------------------------------------------------------------------

  stat(u) { const U = this.R.upgrades[u]; return U.base + U.per * this.levels[u]; }
  cost(u) { const C = this.R.upgrades[u].cost; return this.levels[u] < C.length ? C[this.levels[u]] : null; }
  buy(u) {
    const c = this.cost(u);
    if (c == null || this.money < c) return false;
    this.money -= c; this.levels[u]++;
    // A better lamp comes lit; more ladders come stacked.
    for (const p of this.miners) { if (u === 'lamp') p.light = this.stat('lamp'); if (u === 'ladders') p.ladders = this.stat('ladders'); }
    this.emit('bought', { u, level: this.levels[u] });
    return true;
  }

  // ---- the miners ----------------------------------------------------------------------------

  newMiner(i) {
    const x = this.R.world.start[i];
    return {
      i, x: x + 0.5, y: SURFACE - 0.4, vx: 0, vy: 0, light: this.stat('lamp'), hp: this.R.miner.hp, ladders: this.stat('ladders'),
      cargo: [], dig: null, grounded: true, climbing: false, face: 1, atShop: null, walk: 0, riding: false,
    };
  }

  step(inputs, dt) {
    this.events = [];
    if (this.over) return;
    this.t += dt;
    for (const p of this.miners) this.updateMiner(p, inputs[p.i] ?? {}, dt);
    this.updateRocks(dt);
  }

  hurt(p, dmg, why) {
    const d = dmg * this.diff.damage * (1 - this.stat('gear'));
    p.hp -= d;
    this.emit('hurt', { p: p.i, dmg: d, why });
  }

  updateMiner(p, inp, dt) {
    const R = this.R, M = R.miner;
    const ix = clamp(inp.x ?? 0, -1, 1), iy = clamp(inp.y ?? 0, -1, 1);
    // No light left underground, or too hurt to go on: workmates come down
    // and bring the miner up.
    if ((p.light <= 0 && p.y > SURFACE) || p.hp <= 0) { this.rescue(p); return; }
    if (p.y > SURFACE) p.light = Math.max(0, p.light - M.drain * dt);
    // Digging: the miner keeps at it while the stick is held.
    if (p.dig) {
      const d = p.dig;
      d.t += dt * this.stat('pick');
      const still = d.dx ? Math.sign(ix) === d.dx : iy > 0.5;
      if (!still) { p.dig = null; return; }
      if (d.t >= d.need) this.breakTile(p, d.x, d.y);
      return;
    }
    // A ladder where you stand, by hand.
    if (inp.b) this.placeLadder(p);
    const h = M.size / 2, cx = Math.floor(p.x), cy = Math.floor(p.y);
    const feet = Math.floor(p.y + h - 0.05);
    const shaft = this.inShaft(p);
    const onLadder = this.ladderAt(p.x, p.y) || shaft;
    const ladderBelow = this.ladderAt(p.x, p.y + h + 0.05) && !this.solid(p.x, p.y + h + 0.05);
    // Start digging: pushing down, or into a wall, from solid footing.
    if (p.grounded && !(p.climbing && iy < -0.3) && !(iy > 0.3 && ladderBelow)) {
      let target = null;
      if (iy > 0.5 && Math.abs(ix) < 0.5 && this.solid(p.x, feet + 1)) target = [cx, feet + 1, 0];
      else if (Math.abs(ix) > 0.5 && Math.abs(iy) < 0.5) {
        const nx = cx + Math.sign(ix);
        if (this.solid(nx + 0.5, cy + 0.5) && Math.abs(p.x - (cx + 0.5)) < 0.15) target = [nx, cy, Math.sign(ix)];
      }
      if (target) {
        const t = this.tile(target[0], target[1]);
        if (this.canDig(t)) {
          p.dig = { x: target[0], y: target[1], dx: target[2], t: 0, need: this.hardness(t) };
          p.x = cx + 0.5; p.vx = 0; p.climbing = false;
          if (target[2]) p.face = target[2];
          this.emit('dig', { p: p.i, x: target[0], y: target[1] });
          return;
        }
        if (t.rock > 0 && t.rock < 99 && !p.toldHard) { p.toldHard = true; this.emit('tooHard', { p: p.i, rock: t.rock }); }
      }
    }
    // Ladders: get on by pushing up or down, or by grabbing one as you fall.
    // Walking off sideways lets go.
    if (!p.climbing) {
      if ((onLadder && Math.abs(iy) > 0.3) || (iy > 0.3 && ladderBelow)) p.climbing = true;
    } else if ((Math.abs(ix) > 0.5 && Math.abs(iy) < 0.3) || !(onLadder || (iy > 0.3 && ladderBelow))) p.climbing = false;
    const slow = 1 - M.loadSlow * p.cargo.length;
    p.riding = false;
    if (p.climbing) {
      const fast = shaft && Math.abs(iy) > 0.3;
      p.riding = fast;
      p.vy = Math.abs(iy) > 0.3 ? Math.sign(iy) * (fast ? R.shaft.speed[this.levels.shaft] : M.climb * slow) : 0;
      p.x += (cx + 0.5 - p.x) * Math.min(1, dt * 12);
      p.vx = 0;
    } else if (onLadder) {
      // Holding on: stand on the nearest rung, level with any gallery, so
      // you can step off sideways (or grab hold as you fall past).
      const rowY = Math.floor(p.y) + 1 - h;
      p.vy = 0; p.y += (rowY - p.y) * Math.min(1, dt * 12);
      p.vx += (ix * M.speed * slow - p.vx) * Math.min(1, M.accel * dt);
    } else {
      const accel = p.grounded ? M.accel : M.airAccel;
      p.vx += (ix * M.speed * slow - p.vx) * Math.min(1, accel * dt);
      p.vy = Math.min(M.maxFall, p.vy + M.gravity * dt);
    }
    const wasRow = Math.floor(p.y), wasOn = onLadder;
    if (ix) p.face = Math.sign(ix);
    p.walk += Math.abs(p.vx) * dt + Math.abs(p.climbing ? p.vy : 0) * dt;
    this.move(p, dt, iy);
    if (!p.climbing && onLadder && this.ladderAt(p.x, p.y)) p.grounded = true;
    // Climbing up out of the top of a ladder: step onto it.
    if (p.climbing && p.vy < 0 && wasOn && !this.ladderAt(p.x, p.y) && !this.inShaft(p) && Math.floor(p.y) < wasRow) {
      p.y = wasRow - h; p.vy = 0; p.climbing = false; p.grounded = true;
    }
    // Depth record, the layer cards, and the cave at the bottom.
    const depth = Math.max(0, Math.floor(p.y) - SURFACE);
    if (depth > this.stats.deepest) {
      this.stats.deepest = depth;
      const band = R.layers.find((l) => Math.floor(p.y) < l.to);
      if (band?.card && !this.found.has(band.card) && Math.floor(p.y) >= band.from) { this.found.add(band.card); this.emit('layer', { card: band.card, depth }); }
    }
    if (!this.stats.cave && this.tile(Math.floor(p.x), Math.floor(p.y)).cave) { this.stats.cave = true; this.stats.time = this.t; this.emit('cave', { p: p.i }); }
    // At the surface: rest, sell, light the lamp, and the workshop.
    p.atShop = null;
    if (p.y < SURFACE) {
      p.hp = Math.min(M.hp, p.hp + M.regen * dt);
      if (p.grounded) {
        for (const b of R.buildings) if (Math.abs(p.x - b.x) < b.w / 2 + 0.2) p.atShop = b.id;
        if (p.atShop === 'bascula' && p.cargo.length) this.sell(p);
        if (p.atShop === 'lampisteria' && p.light < this.stat('lamp') - 0.01) this.refill(p, dt);
        if (p.atShop === 'taller') { this.restock(p); if (inp.a) this.emit('workshop', { p: p.i }); }
      }
    }
  }

  // Axis-separated movement against the tile grid; ladder tops hold you up
  // unless you're climbing down.
  move(p, dt, iy) {
    const M = this.R.miner, h = M.size / 2;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy)) * dt / 0.2));
    for (let k = 0; k < steps; k++) {
      const sx = (p.vx * dt) / steps, sy = (p.vy * dt) / steps;
      p.x += sx;
      const side = p.x + h * Math.sign(sx || 1);
      if (sx && (this.solid(side, p.y - h + 0.02) || this.solid(side, p.y + h - 0.02))) {
        p.x = sx > 0 ? Math.floor(p.x + h) - h - 0.001 : Math.ceil(p.x - h) + h + 0.001; p.vx = 0;
      }
      const before = p.y + h;
      p.y += sy;
      p.grounded = false;
      const bottom = p.y + h;
      const floorSolid = this.solid(p.x - h + 0.02, bottom) || this.solid(p.x + h - 0.02, bottom);
      const ladderTop = !(iy > 0.3) && !p.climbing && this.ladderAt(p.x, bottom) && Math.floor(bottom) > Math.floor(before - 0.001) && !this.ladderAt(p.x, p.y);
      if (sy >= 0 && (floorSolid || ladderTop)) {
        if (p.vy > M.safeFall && !p.climbing) this.hurt(p, (p.vy - M.safeFall) * M.fallDamage, 'fall');
        p.y = Math.floor(bottom) - h; p.vy = 0; p.grounded = true;
      } else if (sy < 0 && (this.solid(p.x - h + 0.02, p.y - h) || this.solid(p.x + h - 0.02, p.y - h))) {
        p.y = Math.ceil(p.y - h) + h; p.vy = 0;
      }
      // Standing on rock (even while on a ladder) counts as ground.
      if (this.solid(p.x, p.y + h + 0.01)) p.grounded = true;
      // So does standing on a ladder's top.
      if (!p.climbing && !(iy > 0.3) && p.vy >= 0 && !this.ladderAt(p.x, p.y) && this.ladderAt(p.x, p.y + h + 0.01) && Math.abs(p.y + h - Math.round(p.y + h)) < 0.02) p.grounded = true;
    }
    p.x = clamp(p.x, h, this.W - h);
    if (p.y < h) { p.y = h; p.vy = Math.max(0, p.vy); }
  }

  placeLadder(p) {
    const t = this.tile(Math.floor(p.x), Math.floor(p.y));
    if (t.rock || t.ladder || p.y < SURFACE) return false;
    if (p.ladders <= 0) { this.emit('noLadders', { p: p.i }); return false; }
    t.ladder = true; p.ladders--;
    this.emit('ladder', { p: p.i });
    return true;
  }

  breakTile(p, x, y) {
    const t = this.tiles[y][x], ore = t.ore;
    t.rock = 0; t.ore = null; t.loose = false;
    p.dig = null;
    this.emit('broke', { p: p.i, x, y });
    // Step into the hole. Going down, a ladder goes in behind you.
    if (y > Math.floor(p.y)) {
      // Keep the ladder unbroken: rungs in the spot you're leaving too, if
      // it was already open (a gallery you dropped into).
      const here = this.tile(x, Math.floor(p.y));
      if (!here.rock && !here.ladder && Math.floor(p.y) >= SURFACE && p.ladders > 1) { here.ladder = true; p.ladders--; }
      p.y = y + 0.5 - 0.001;
      if (p.ladders > 0) { t.ladder = true; p.ladders--; } else if (!p.toldLadders) { p.toldLadders = true; this.emit('noLadders', { p: p.i }); }
    }
    p.x = x + 0.5;
    this.loosen(x, y - 1);
    if (ore === 'air') { this.hurt(p, this.R.badAir.damage, 'air'); this.emit('air', { p: p.i, x, y }); return; }
    if (!ore) return;
    if (p.cargo.length >= this.stat('bag')) { this.emit('bagFull', { p: p.i, ore }); return; }
    p.cargo.push(ore);
    const find = !!this.R.ores[ore].find;
    if (find) this.stats.finds++;
    const first = !this.found.has(ore);
    this.found.add(ore);
    this.emit('ore', { p: p.i, ore, x, y, first, find });
  }

  // ---- loose rock: with nothing under it, it shakes, then falls ------------------------------------

  loosen(x, y) {
    const t = this.tile(x, y);
    if (!t.loose || !t.rock || t.falling || this.solid(x + 0.5, y + 1.5)) return;
    t.falling = true;
    this.rocks.push({ x, y, wait: this.R.loose.warn, vy: 0, fy: y, rock: t.rock });
    this.emit('creak', { x, y });
  }

  updateRocks(dt) {
    for (let k = this.rocks.length - 1; k >= 0; k--) {
      const r = this.rocks[k];
      if (r.wait > 0) {
        r.wait -= dt;
        if (r.wait <= 0) {
          const t = this.tiles[r.y][r.x];
          t.rock = 0; t.loose = false; t.falling = false;
          this.loosen(r.x, r.y - 1);
        }
        continue;
      }
      r.vy = Math.min(14, r.vy + this.R.miner.gravity * dt);
      r.fy += r.vy * dt;
      // Hitting a miner: the rock breaks on the helmet.
      const hit = this.miners.find((p) => Math.abs(p.x - (r.x + 0.5)) < 0.8 && p.y - 0.4 < r.fy + 1 && p.y + 0.4 > r.fy);
      if (hit) { this.hurt(hit, this.R.loose.damage, 'rock'); this.emit('rockfall', { x: r.x, y: Math.floor(r.fy), hit: hit.i }); this.rocks.splice(k, 1); continue; }
      const below = Math.floor(r.fy + 1);
      if (this.solid(r.x + 0.5, below + 0.01) || below >= this.H) {
        const ty = below - 1, t = this.tiles[ty]?.[r.x];
        if (t && !t.rock) Object.assign(t, { rock: r.rock, ore: null, ladder: false, loose: true });
        this.emit('rockfall', { x: r.x, y: ty });
        this.rocks.splice(k, 1);
        this.loosen(r.x, ty);
      }
    }
  }

  // ---- the village -------------------------------------------------------------------------------

  sell(p) {
    let total = 0;
    for (const ore of p.cargo) { total += this.R.ores[ore].value; this.stats.ores[ore] = (this.stats.ores[ore] ?? 0) + 1; }
    this.money += total; this.stats.earned += total; this.stats.sold += p.cargo.length;
    this.emit('sold', { p: p.i, n: p.cargo.length, money: total });
    p.cargo = [];
  }

  // Lamp oil: the lamp room fills you up to a share of the lamp for free
  // (nobody is left without light), and charges for the rest.
  refill(p, dt) {
    const want = Math.min(this.stat('lamp') - p.light, this.R.prices.oilRate * dt);
    const cost = p.light < this.stat('lamp') * this.R.prices.freeOil ? 0 : want * this.R.prices.oil;
    if (this.money < cost) { if (!p.toldBroke) { p.toldBroke = true; this.emit('noMoney', { p: p.i }); } return; }
    this.money -= cost; p.light += want;
    if (p.light >= this.stat('lamp') - 0.01) this.emit('lit', { p: p.i });
  }

  // The carpenter stacks your ladders up again at the workshop, free:
  // nobody should be stuck at the top of the mine for want of a ladder.
  restock(p) {
    const n = this.stat('ladders') - p.ladders;
    if (n <= 0) return;
    p.ladders += n;
    this.emit('restocked', { p: p.i, n });
  }

  rescue(p) {
    const lost = p.cargo.length;
    this.money = Math.max(0, this.money - this.R.prices.rescue);
    this.stats.rescues++;
    Object.assign(p, this.newMiner(p.i), { light: this.stat('lamp') * 0.5, ladders: p.ladders });
    this.emit('rescue', { p: p.i, lost });
  }

  // The score is the time it took to reach the cave, in whole seconds:
  // lower is better.
  score() { return Math.ceil(this.stats.time ?? this.t); }

  // What an upgrade level gives, for the workshop to explain where each
  // branch of tools leads. Layers newly opened to a better tool are listed.
  benefit(u, level) {
    const U = this.R.upgrades[u], value = U.base + U.per * level;
    if (u === 'pick') {
      const opens = this.R.layers.filter((l) => (this.R.rocks[l.rock].needs ?? 0) === level && level > 0).map((l) => l.card);
      return { speed: value, opens };
    }
    if (u === 'shaft') return { speed: this.R.shaft.speed[level] };
    return { value };
  }
}

// ---- a sensible miner, for the attract demo and the balance tests --------------------------------

export class Helper {
  constructor(mine, i) { this.m = mine; this.i = i; this.col = mine.R.world.start[i] + 2 + i * 3; this.mode = 'down'; }

  input() {
    const m = this.m, p = m.miners[this.i], R = m.R;
    const go = (tx) => ({ x: Math.abs(tx - p.x) < 0.08 ? 0 : Math.sign(tx - p.x) });
    const surface = p.y < SURFACE;
    const depth = Math.max(0, p.y - SURFACE);
    const lightLow = p.light < depth * R.helper.lightPerTile + R.helper.lightSpare;
    if (!surface && (p.cargo.length >= m.stat('bag') || lightLow || p.hp < R.miner.hp * 0.35 || (p.ladders <= 0 && !p.dig))) this.mode = 'up';
    if (this.mode === 'up') {
      if (surface && p.grounded) this.mode = 'shop';
      else return this.climb(p);
    }
    if (this.mode === 'shop') {
      const b = (id) => R.buildings.find((q) => q.id === id);
      if (p.cargo.length) return go(b('bascula').x);
      if (p.light < m.stat('lamp') * 0.9 && m.money > 5) return go(b('lampisteria').x);
      if (!this.shopped) {
        if (Math.abs(p.x - b('taller').x) > 0.4) return go(b('taller').x);
        this.shopped = true;
        // When the next layer down needs a better tool, save up for it.
        const ahead = R.layers.find((l) => l.from > SURFACE + m.stats.deepest - 2) ?? R.layers.at(-1);
        const saving = (R.rocks[ahead.rock].needs ?? 0) > m.levels.pick;
        if (saving) { if (m.cost('pick') != null && m.cost('pick') <= m.money) m.buy('pick'); }
        else for (const u of ['pick', 'bag', 'lamp', 'ladders', 'gear', 'shaft']) if (m.cost(u) != null && m.cost(u) <= m.money * 0.8) { m.buy(u); break; }
      }
      this.col = 1 + ((this.col + 5) % (m.W - 3)); if (this.col === R.shaft.x) this.col++;
      this.mode = 'down'; this.shopped = false;
    }
    // Down: get above the column, then dig straight down (sideways round rock that's too hard).
    if (Math.abs(p.x - (this.col + 0.5)) > 0.1 && p.y < SURFACE + 0.5) return go(this.col + 0.5);
    if (p.grounded && p.y > SURFACE) {
      const cx = Math.floor(p.x), cy = Math.floor(p.y);
      for (const d of [-1, 1]) {
        const t = m.tile(cx + d, cy);
        if (t.ore && t.ore !== 'air' && m.canDig(t)) { this.col = cx + d; return { x: d }; }
      }
    }
    const below = m.tile(Math.floor(p.x), Math.floor(p.y) + 1);
    if (below.rock && !m.canDig(below)) { this.col = clamp(Math.floor(p.x) + (this.col % 2 ? 1 : -1), 1, m.W - 2); return { x: Math.sign(this.col + 0.5 - p.x) }; }
    return { x: 0, y: 1 };
  }

  // Up the ladders the way it came: when the ladder ends under rock, walk
  // along the gallery to the column it came down.
  climb(p) {
    const m = this.m, cx = Math.floor(p.x), cy = Math.floor(p.y);
    const upOk = (x) => (!!m.tile(x, cy).ladder || m.inShaft({ x: x + 0.5, y: p.y })) && !m.solid(x + 0.5, cy - 0.5);
    if (upOk(cx)) return { x: 0, y: -1 };
    for (let d = 1; d < m.W; d++) for (const s of [-1, 1]) {
      const x = cx + s * d;
      if (x < 0 || x >= m.W) continue;
      // Only along open ground with a floor under every step.
      let clear = true;
      for (let k = 1; k <= d; k++) {
        const tx = cx + s * k;
        if (m.solid(tx + 0.5, cy + 0.5) || (k < d && !m.solid(tx + 0.5, cy + 1.5) && !m.tile(tx, cy + 1).ladder)) { clear = false; break; }
      }
      if (clear && upOk(x)) return { x: s, y: 0 };
    }
    // Stuck: put a ladder here and climb.
    return { x: 0, y: -1, b: !m.tile(cx, cy).ladder };
  }
}
