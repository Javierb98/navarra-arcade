// Los Hombres Verdes: a dig, light, load and upgrade game. A miner goes down
// from the village through layers that are Navarre's mines, newest at the top
// and oldest at the bottom: the potash pits, the iron of the royal arms
// factories, the medieval copper of Arce, the Roman galleries, the Bronze Age
// copper, and at the very bottom the cave of the Hombres Verdes.
//
// A career: ore is sold at the weighbridge (or, a little cheaper, at a cage
// station down the old shaft); old things found in hidden chambers go to the
// village museum for a finder's fee. The score is all the money earned, plus
// a bonus per museum piece and one for reaching the cave. There is no clock,
// except once: in the cave lies the piece the museum has been waiting for.
// Taking it wakes the old workings, water rises from below, and the miner
// climbs out by the mine they built (ladders, shafts, cage stations) for an
// escape bonus. Caught by the water, the cage lifts them out, piece and all.
//
// Pure and seeded: no DOM, no clock, no Math.random. The UI calls
// step(inputs, dt). World units are tiles (1 x 1, about a metre); x across,
// y down; the ground surface is at y = SURFACE.
//
// inputs[p]: { x, y (stick -1..1; y < 0 is up), a, b, c (pressed this step) }
//   left/right: walk, or dig sideways into a wall
//   down: dig down (a ladder goes in behind you), or climb down a ladder
//   up: climb (a ladder goes in if there isn't one), dig up from a ladder, or
//       ride the cage in the old shaft once there is a station
//   A: at the workshop the shop, at the museum the shelves; elsewhere the
//      next thing on your belt.  B: a ladder where you stand.  C: use it.

import { makeRng } from './rng.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const SURFACE = 4;
export const UPGRADES = ['pick', 'lamp', 'bag', 'gear', 'ladders', 'stations'];
export const ITEMS = ['dynamite', 'kit', 'oil', 'rope', 'bellows'];

export class Mine {
  constructor(data, { seed = 1, difficulty = 'normal' } = {}) {
    this.R = data.rules;
    this.r = makeRng(seed);
    this.diff = this.R.difficulty[difficulty] ?? this.R.difficulty.normal;
    this.W = this.R.world.w; this.H = this.R.world.h;
    this.levels = Object.fromEntries(UPGRADES.map((u) => [u, 0]));
    this.gas = new Float32Array(this.W * this.H); // seconds of bad air left in each open tile
    this.water = new Float32Array(this.W * this.H); // 0..1, how full each tile is
    this.vented = new Uint8Array(this.W * this.H); // 1 where air moves through (two ways out)
    this.draft = new Int8Array(this.W * this.H); // the way air flows out of each open tile (0 none, 1 up, 2 left, 3 right, 4 down)
    this.gasQueue = []; this.springs = []; this.waterT = 0; this.ventT = 0;
    this.escape = null; // the finale's rising water, once the cave piece is taken
    this.crown = 'cave'; // the cave piece: 'cave', 'carried' or 'museum'
    this.generate();
    this.money = this.R.start.money;
    this.t = 0;
    this.over = false; // set by the game when the career ends
    this.museum = []; // find ids on the museum's shelves, in the order delivered
    this.miners = [this.newMiner(0)];
    this.stats = {
      earned: 0, fees: 0, deepest: 0, finds: 0, ores: {}, rescues: 0, sold: 0, cave: false, jackpots: 0,
      used: Object.fromEntries(ITEMS.map((i) => [i, 0])), met: { air: 0, loose: 0, water: 0 }, harm: {}, escape: null, fizzles: 0,
    };
    this.found = new Set(); // layers and ores seen, for the history cards
    this.rocks = []; // loose rocks about to fall, or falling
    this.bombs = []; // lit dynamite
    this.events = [];
  }

  emit(type, extra = {}) { this.events.push({ type, ...extra }); }

  layerIndex(y) { const L = this.R.layers, i = L.findIndex((l) => y < l.to); return i < 0 ? L.length - 1 : i; }
  layerAt(y) { return this.R.layers[this.layerIndex(y)]; }
  idx(x, y) { return y * this.W + x; }

  // ---- the ground --------------------------------------------------------------------------

  // Each tile is { rock, ore, ladder, loose, gas, spring, cave, pocket, find, shaft, station, crown }; rock 0 is open.
  // gas and spring hold the id of the danger pocket the tile belongs to (or true for a lone tile).
  generate() {
    const R = this.R, rng = this.r, W = this.W, H = this.H, S = R.shaft, ST = R.stations;
    const lastStation = ST.list.at(-1).y;
    // The old shaft's column and the station landings stay clear of dangers
    // and treasure, so a station never opens onto a surprise.
    this.reserved = (x, y) => (x >= S.x - 1 && x <= S.x + 1 && y <= lastStation + 1)
      || ST.list.some((s) => Math.abs(y - s.y) <= 1 && x >= S.x - 1 && x <= S.x + ST.landing + 1)
      || (y <= S.to + 1 && x >= S.x - 1 && x <= S.gallery + 1);
    const scattered = Object.entries(R.ores).filter(([, o]) => o.chance);
    this.tiles = [];
    for (let y = 0; y < H; y++) {
      const row = [];
      for (let x = 0; x < W; x++) {
        if (y < SURFACE) { row.push({ rock: 0 }); continue; }
        const band = this.layerAt(y);
        let rock = band.rock;
        if (rng.chance(band.harder ?? 0)) rock = Math.min(R.rocks.length - 1, rock + 1);
        const tile = { rock, ore: null };
        if (y > SURFACE && !this.reserved(x, y)) {
          for (const [ore, o] of scattered) {
            if (y < o.from || y > o.to) continue;
            const mid = (o.from + o.to) / 2, spread = (o.to - o.from) / 2;
            if (rng.chance(o.chance * (1 - 0.6 * Math.abs(y - mid) / spread))) { tile.ore = ore; break; }
          }
          if (!tile.ore && y > R.loose.from && rng.chance(R.loose.chance)) tile.loose = true;
        }
        row.push(tile);
      }
      this.tiles.push(row);
    }
    // Veins: ores come in small clusters (jackpots stay single).
    for (let y = SURFACE + 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const t = this.tiles[y][x];
      if (t.ore && rng.chance(R.vein)) {
        const nx = x + rng.int(3) - 1, ny = y + rng.int(2), n = this.tiles[ny][nx];
        if (n.rock && !n.ore && !n.loose && !n.gas && !n.spring && !this.reserved(nx, ny)) n.ore = t.ore;
      }
    }
    // Dangers come in pockets of several tiles: bad air, and water from the copper down.
    this.hazards = [null];
    for (const [kind, D] of [['gas', R.badAir], ['spring', R.water]]) {
      for (let y = D.from + 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (rng.chance(D.seed)) this.growPocket(kind, D, x, y);
    }
    // The village floor holds nothing.
    for (let x = 0; x < W; x++) Object.assign(this.tiles[SURFACE][x], { ore: null, loose: false, gas: false, spring: false });
    // The old pit already exists: a short shaft with ladders and a gallery.
    for (let y = SURFACE; y <= S.to; y++) this.open(S.x, y, { ladder: true, shaft: true });
    for (let x = S.x + 1; x <= S.gallery; x++) this.open(x, S.to);
    // At the bottom, the cave of the Hombres Verdes, open since long ago, with
    // calm rock all round it.
    const C = R.cave;
    this.calm(C.x0 - 2, C.y0 - 2, C.x1 + 2, C.y1 + 1);
    for (let y = C.y0; y <= C.y1; y++) for (let x = C.x0; x <= C.x1; x++) this.open(x, y, { cave: true });
    // On its floor, the piece the museum has been waiting for.
    this.tiles[C.y1][R.escape.x].crown = true;
    // Museum pieces, each in a small old chamber or gallery, then the jackpots.
    this.pockets = [];
    for (const layer of R.layers) for (const f of R.finds.list.filter((q) => q.layer === layer.card)) this.carvePocket(f.id, layer);
    for (const [ore, o] of Object.entries(R.ores)) if (o.count) {
      const L = R.layers.find((l) => l.card === o.layer);
      for (let k = 0, tries = 0; k < o.count && tries < 2000; tries++) {
        const x = 1 + rng.int(W - 2), y = L.from + 1 + rng.int(L.to - L.from - 3);
        const t = this.tiles[y][x];
        if (!t.rock || t.ore || t.gas || t.spring || t.cave || this.reserved(x, y) || this.nearPocket(x, y, 1) || Math.abs(x - R.world.start[0]) < 2) continue;
        Object.assign(t, { ore, loose: false }); k++;
      }
    }
  }

  // A pocket of bad air or water: a few tiles of rock grown from (x, y).
  growPocket(kind, D, x, y) {
    const rng = this.r, ok = (tx, ty) => {
      const t = this.tile(tx, ty);
      return ty > D.from && ty < this.H - 1 && tx > 0 && tx < this.W - 1 && t.rock && !t.ore && !t.gas && !t.spring && !t.loose && !this.reserved(tx, ty);
    };
    if (!ok(x, y)) return;
    const id = this.hazards.length, tiles = [[x, y]], n = D.size[0] + rng.int(D.size[1] - D.size[0] + 1);
    this.tiles[y][x][kind] = id;
    for (let tries = 0; tiles.length < n && tries < 40; tries++) {
      const [bx, by] = tiles[rng.int(tiles.length)], [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][rng.int(4)];
      if (!ok(bx + dx, by + dy)) continue;
      this.tiles[by + dy][bx + dx][kind] = id; tiles.push([bx + dx, by + dy]);
    }
    this.hazards.push({ kind, tiles });
  }

  // The tiles of a danger pocket still holding it (after calm boxes and digging).
  pocketTiles(kind, id) {
    if (id === true || !this.hazards[id]) return [];
    return this.hazards[id].tiles.filter(([x, y]) => this.tiles[y][x][kind] === id && this.tiles[y][x].rock);
  }

  // Make a tile open space, and keep it clear of anything that would surprise.
  open(x, y, extra = {}) {
    Object.assign(this.tiles[y][x], { rock: 0, ore: null, loose: false, gas: false, spring: false, ...extra });
    this.water[this.idx(x, y)] = 0;
  }

  // No dangers in a box of tiles.
  calm(x0, y0, x1, y1) {
    for (let y = Math.max(SURFACE, y0); y <= Math.min(this.H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(this.W - 1, x1); x++) Object.assign(this.tiles[y][x], { loose: false, gas: false, spring: false });
  }

  nearPocket(x, y, r) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (this.tile(x + dx, y + dy).pocket) return true;
    return false;
  }

  // A small old working off the straight-down lines: a 2x2 chamber or a 3-4
  // tile timbered gallery, with the find lying on its floor.
  carvePocket(id, layer) {
    const R = this.R, rng = this.r, away = R.finds.away, C = R.cave;
    const lines = [R.world.start[0], R.shaft.x];
    for (let tries = 0; tries < 2000; tries++) {
      const chamber = rng.chance(0.4), w = chamber ? 2 : 3 + rng.int(2), h = chamber ? 2 : 1;
      const top = layer.from + 2, bottom = layer.to - 3; // floor row range
      const y = top + h - 1 + rng.int(Math.max(1, bottom - top - h + 2));
      const x0 = 1 + rng.int(this.W - 1 - w);
      let ok = y <= bottom && x0 + w <= this.W - 1;
      for (let x = x0; ok && x < x0 + w; x++) if (lines.some((l) => Math.abs(x - l) < away)) ok = false;
      for (let yy = y - h - 1; ok && yy <= y + 2; yy++) for (let x = x0 - 2; ok && x <= x0 + w + 1; x++) {
        const t = this.tile(x, yy);
        if (t.pocket || this.reserved(x, yy) || (x >= C.x0 - 1 && x <= C.x1 + 1 && yy >= C.y0 - 1)) ok = false;
      }
      if (!ok) continue;
      this.calm(x0 - 2, y - h - 1, x0 + w + 1, y + 2);
      for (let yy = y - h + 1; yy <= y; yy++) for (let x = x0; x < x0 + w; x++) this.open(x, yy, { pocket: id, old: chamber ? 'chamber' : 'gallery' });
      for (let x = x0; x < x0 + w; x++) if (!this.tiles[y + 1][x].rock) this.tiles[y + 1][x].rock = layer.rock;
      const fx = x0 + rng.int(w);
      this.tiles[y][fx].find = id;
      this.pockets.push({ id, layer: layer.card, x0, w, y, h, fx, fy: y });
      return;
    }
    throw new Error(`no room for the find ${id}`);
  }

  tile(x, y) { return x < 0 || x >= this.W || y >= this.H ? { rock: 99 } : y < 0 ? { rock: 0 } : this.tiles[y][x]; }
  solid(x, y) { return this.tile(Math.floor(x), Math.floor(y)).rock > 0; }
  ladderAt(x, y) { return !!this.tile(Math.floor(x), Math.floor(y)).ladder; }
  hardness(t) { return this.R.rocks[t.rock]?.hard ?? 99; }
  needs(t) { return this.R.rocks[t.rock]?.needs ?? 99; }
  canDig(t) { return t.rock > 0 && t.rock < 99 && this.needs(t) <= this.levels.pick; }
  // In the old shaft, with a cage running (only as deep as it has been built).
  inShaft(p) {
    const x = Math.floor(p.x);
    if (!this.levels.stations || x !== this.R.shaft.x || p.y < SURFACE - 1 || this.solid(p.x, p.y + 0.45)) return false;
    return p.y < SURFACE || !!this.tile(x, Math.floor(p.y)).shaft;
  }
  // How full a tile is, 0..1 from its floor up: spring water, or the
  // finale's rising water, which fills every open tile below its surface.
  waterAt(x, y) {
    if (x < 0 || x >= this.W || y < 0 || y >= this.H) return 0;
    const w = this.water[this.idx(x, y)], E = this.escape;
    if (!E || y + 1 <= E.y || this.tiles[y][x].rock) return w;
    return Math.max(w, Math.min(1, y + 1 - E.y));
  }
  gasAt(x, y) { return x < 0 || x >= this.W || y < 0 || y >= this.H ? 0 : this.gas[this.idx(x, y)]; }

  // ---- upgrades, stations and the belt ---------------------------------------------------------

  stat(u) { const U = this.R.upgrades[u]; return U.base + U.per * this.levels[u]; }
  cost(u) { const C = this.R.upgrades[u].cost; return this.levels[u] < C.length ? C[this.levels[u]] : null; }
  // A station can only be built once someone has been down that deep: the
  // depth still to reach, or 0.
  locked(u) {
    if (u !== 'stations') return 0;
    const st = this.R.stations.list[this.levels.stations];
    return st ? Math.max(0, st.y - SURFACE - this.stats.deepest) : 0;
  }
  buy(u) {
    const c = this.cost(u);
    if (c == null || this.money < c || this.locked(u)) return false;
    this.money -= c; this.levels[u]++;
    // A better lamp comes lit; more ladders come stacked; a station is built.
    for (const p of this.miners) { if (u === 'lamp') p.light = this.stat('lamp'); if (u === 'ladders') p.ladders = this.stat('ladders'); }
    if (u === 'stations') this.buildStation(this.levels.stations - 1);
    this.emit('bought', { u, level: this.levels[u] });
    return true;
  }

  // The old shaft goes down to the station, with a landing gallery beside it.
  buildStation(k) {
    const S = this.R.shaft, st = this.R.stations.list[k];
    for (let y = SURFACE; y <= st.y; y++) this.open(S.x, y, { ladder: true, shaft: true });
    for (let x = S.x + 1; x <= S.x + this.R.stations.landing; x++) {
      this.open(x, st.y, { station: k, ladder: false });
      if (!this.tiles[st.y + 1][x].rock) this.tiles[st.y + 1][x].rock = this.layerAt(st.y).rock;
    }
    this.calm(S.x - 1, st.y - 1, S.x + this.R.stations.landing + 1, st.y + 1);
  }

  // The landing a miner is standing on, or -1.
  stationAt(p) {
    const S = this.R.shaft, cx = Math.floor(p.x), cy = Math.floor(p.y);
    for (let k = 0; k < this.levels.stations; k++) if (cy === this.R.stations.list[k].y && cx >= S.x && cx <= S.x + this.R.stations.landing) return k;
    return -1;
  }

  itemCost(id) { return this.R.items[id].cost; }
  buyItem(id, p = this.miners[0]) {
    const I = this.R.items[id];
    if (this.money < I.cost || p.belt[id] >= I.max) return false;
    this.money -= I.cost; p.belt[id]++;
    this.emit('boughtItem', { id });
    return true;
  }

  cycleItem(p) {
    // To the next thing you actually carry (or simply the next one).
    for (let k = 1; k <= ITEMS.length; k++) {
      const s = (p.sel + k) % ITEMS.length;
      if (p.belt[ITEMS[s]] || k === ITEMS.length) { p.sel = s; break; }
    }
    this.emit('cycle', { p: p.i, id: ITEMS[p.sel] });
  }

  useItem(p) {
    const id = ITEMS[p.sel], R = this.R;
    if (!p.belt[id]) { this.emit('noItem', { p: p.i, id }); return false; }
    const under = p.y > SURFACE;
    if (id === 'dynamite') {
      if (!under) { this.emit('notHere', { p: p.i, id }); return false; }
      // Never a flame near bad air: the lamp flares, the fuse fizzles out and
      // the miner steps back. The stick is kept; nothing happens.
      if (this.gasNear(Math.floor(p.x), Math.floor(p.y), R.badAir.fizzle)) {
        this.stats.fizzles++;
        p.vx = -p.face * 3; p.dig = null;
        this.emit('fizzle', { p: p.i, x: p.x, y: p.y });
        return false;
      }
      this.bombs.push({ x: Math.floor(p.x), y: Math.floor(p.y), fuse: R.items.dynamite.fuse });
    } else if (id === 'kit') {
      if (p.hp >= R.miner.hp - 0.5) { this.emit('notNeeded', { p: p.i, id }); return false; }
      p.hp = Math.min(R.miner.hp, p.hp + R.miner.hp * R.items.kit.heal);
    } else if (id === 'oil') {
      if (p.light >= this.stat('lamp') - 0.5) { this.emit('notNeeded', { p: p.i, id }); return false; }
      p.light = Math.min(this.stat('lamp'), p.light + this.stat('lamp') * R.items.oil.fill);
    } else if (id === 'bellows') {
      // Pushes the bad air out of the stretch of tunnel you are in.
      const stretch = this.stretch(Math.floor(p.x), Math.floor(p.y), R.items.bellows.reach);
      const gassy = stretch.filter((i) => this.gas[i] > 0 || this.gasQueue.some((q) => q.i === i));
      if (!gassy.length) { this.emit('notNeeded', { p: p.i, id }); return false; }
      const set = new Set(stretch);
      for (const i of stretch) this.gas[i] = 0;
      this.gasQueue = this.gasQueue.filter((q) => !set.has(q.i));
      this.emit('blown', { p: p.i, tiles: gassy.map((i) => [i % this.W, Math.floor(i / this.W)]) });
    } else if (id === 'rope') {
      const to = under && this.ropeTarget(p);
      if (!to) { this.emit('notHere', { p: p.i, id }); return false; }
      p.haul = { t: 0, secs: R.items.rope.secs, x0: p.x, y0: p.y, ...to };
      p.dig = null; p.climbing = false;
    }
    p.belt[id]--; this.stats.used[id]++;
    this.emit('item', { p: p.i, id, x: p.x, y: p.y });
    return true;
  }

  // Open tiles within n steps of (x, y) through open space: the stretch of tunnel you are in.
  stretch(x, y, n) {
    const out = [], seen = new Set([this.idx(x, y)]);
    let front = [[x, y]];
    for (let d = 0; d <= n && front.length; d++) {
      const next = [];
      for (const [fx, fy] of front) {
        out.push(this.idx(fx, fy));
        for (const [nx, ny] of [[fx, fy - 1], [fx - 1, fy], [fx + 1, fy], [fx, fy + 1]]) {
          if (nx < 0 || nx >= this.W || ny < SURFACE || ny >= this.H || this.tiles[ny][nx].rock) continue;
          const i = this.idx(nx, ny);
          if (!seen.has(i)) { seen.add(i); next.push([nx, ny]); }
        }
      }
      front = next;
    }
    return out;
  }

  // Bad air within r tiles: let loose in the tunnels, or still in the rock.
  gasNear(x, y, r) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const tx = x + dx, ty = y + dy;
      if (tx < 0 || tx >= this.W || ty < SURFACE || ty >= this.H) continue;
      if (this.gas[this.idx(tx, ty)] > 0 || (this.tiles[ty][tx].gas && this.tiles[ty][tx].rock)) return true;
    }
    return this.gasQueue.some((q) => Math.abs((q.i % this.W) - x) <= r && Math.abs(Math.floor(q.i / this.W) - y) <= r);
  }

  // The winch rope hauls you up to the nearest station above you, or the surface.
  ropeTarget(p) {
    const R = this.R, S = R.shaft, h = R.miner.size / 2, cy = Math.floor(p.y);
    for (let k = this.levels.stations - 1; k >= 0; k--) {
      const st = R.stations.list[k];
      if (st.y < cy) return { x1: S.x + 2.5, y1: st.y + 1 - h, k };
    }
    return { x1: S.x + 2.5, y1: SURFACE - h, k: -1 };
  }

  // ---- the miners ----------------------------------------------------------------------------

  newMiner(i) {
    const x = this.R.world.start[i];
    return {
      i, x: x + 0.5, y: SURFACE - 0.4, vx: 0, vy: 0, light: this.stat('lamp'), hp: this.R.miner.hp, ladders: this.stat('ladders'),
      cargo: [], finds: [], belt: Object.fromEntries(ITEMS.map((id) => [id, 0])), sel: 0,
      dig: null, grounded: true, climbing: false, face: 1, atShop: null, atStation: -1, walk: 0, riding: false, haul: null,
      near: { gas: 99, water: 99, find: null }, cough: 0, breath: this.R.water.breath, under: false, bubble: 0,
    };
  }

  step(inputs, dt) {
    this.events = [];
    if (this.over) return;
    this.t += dt;
    for (const p of this.miners) this.updateMiner(p, inputs[p.i] ?? {}, dt);
    this.updateRocks(dt);
    this.updateBombs(dt);
    this.updateGas(dt);
    this.updateWater(dt);
    this.updateEscape(dt);
  }

  hurt(p, dmg, why) {
    if (p.haul) return;
    // Good gear softens knocks and bad air; nothing helps you breathe under water.
    const d = dmg * this.diff.damage * (why === 'water' ? 1 : 1 - this.stat('gear'));
    p.hp -= d;
    this.stats.harm[why] = (this.stats.harm[why] ?? 0) + d;
    this.emit('hurt', { p: p.i, dmg: d, why });
  }

  // What the lamp and ears pick up nearby: hissing gas, dripping water, and
  // the glint of something old. Each is told once as you come near.
  sense(p) {
    const R = this.R, cx = Math.floor(p.x), cy = Math.floor(p.y), r = 6, warnGas = this.gasWarn();
    let gas = 99, water = 99, find = null, fd = 99;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || x >= this.W || y < SURFACE || y >= this.H) continue;
      const t = this.tiles[y][x], d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y);
      if (t.gas && t.rock && d < gas) gas = d;
      if (t.spring && t.rock && d < water) water = d;
      if (t.find && d < fd) { fd = d; find = { x, y, id: t.find }; }
    }
    p.near = { gas, water, find: fd <= R.finds.glint ? find : null };
    if (gas <= warnGas) { if (!p.heardGas) { p.heardGas = true; this.emit('hiss', { p: p.i, d: gas }); } } else if (gas > warnGas + 1.5) p.heardGas = false;
    if (water <= R.water.warn) { if (!p.heardWater) { p.heardWater = true; this.emit('drip', { p: p.i, d: water }); } } else if (water > R.water.warn + 1.5) p.heardWater = false;
    if (p.near.find) { if (p.glinted !== p.near.find.id) { p.glinted = p.near.find.id; this.emit('glint', { p: p.i, ...p.near.find }); } } else p.glinted = null;
  }

  // How far off the lamp gives warning of bad air: a better lamp, sooner.
  gasWarn() { return this.R.badAir.warn + this.R.badAir.warnPerLamp * this.levels.lamp; }

  updateMiner(p, inp, dt) {
    const R = this.R, M = R.miner;
    if (p.haul) { this.updateHaul(p, dt); return; }
    const ix = clamp(inp.x ?? 0, -1, 1), iy = clamp(inp.y ?? 0, -1, 1);
    // No light left underground, or too worn out to go on: workmates come
    // down and bring the miner up.
    // In the escape, the cage lifts you out instead, piece and all.
    if ((p.light <= 0 && p.y > SURFACE) || p.hp <= 0) {
      if (this.escape && !this.escape.done) this.finishEscape('caught'); else this.rescue(p);
      return;
    }
    const cx0 = Math.floor(p.x), cy0 = Math.floor(p.y), wet = this.waterAt(cx0, cy0), gassy = p.y > SURFACE && this.gasAt(cx0, cy0) > 0;
    if (p.y > SURFACE) p.light = Math.max(0, p.light - M.drain * dt * (wet > R.water.deep ? R.water.drain : 1) * (gassy ? R.badAir.light : 1));
    if (gassy) {
      this.hurt(p, R.badAir.dps * dt, 'air');
      if ((p.cough -= dt) <= 0) { p.cough = 0.9; this.emit('cough', { p: p.i }); }
    }
    // Head under water (over half the tile): breath runs down, then strength.
    // Out of it, breath comes back at once.
    if (p.y > SURFACE && wet > R.water.drown) {
      if (!p.under) { p.under = true; this.emit('under', { p: p.i }); }
      p.breath = Math.max(0, p.breath - dt);
      if ((p.bubble -= dt) <= 0) { p.bubble = 0.6; this.emit('bubble', { p: p.i, x: p.x, y: p.y, out: p.breath <= 0 }); }
      if (p.breath <= 0) this.hurt(p, R.water.dps * dt, 'water');
    } else {
      if (p.under) this.emit('surfaced', { p: p.i });
      p.under = false; p.breath = R.water.breath;
    }
    this.sense(p);
    if (inp.c) this.useItem(p);
    if (p.haul) return;
    // A at the cave's piece takes it, and the escape begins.
    if (inp.a && this.tile(cx0, cy0).crown && !this.tile(cx0, cy0).rock) { this.takeCrown(p); return; }
    if (inp.a && p.atShop !== 'taller' && p.atShop !== 'museo') this.cycleItem(p);
    // Digging: the miner keeps at it while the stick is held.
    if (p.dig) {
      const d = p.dig;
      d.t += dt * this.stat('pick');
      const still = d.dx ? Math.sign(ix) === d.dx : d.up ? iy < -0.5 : iy > 0.5;
      if (!still) { p.dig = null; return; }
      if (d.t >= d.need) this.breakTile(p, d.x, d.y);
      return;
    }
    // A ladder where you stand, by hand.
    if (inp.b) this.placeLadder(p);
    const h = M.size / 2, cx = Math.floor(p.x), cy = Math.floor(p.y);
    const feet = Math.floor(p.y + h - 0.05);
    // Quick ladders: pushing up underground where there is none puts one in.
    if (iy < -0.5 && Math.abs(ix) < 0.5 && p.y > SURFACE && !this.tile(cx, cy).ladder && !this.tile(cx, cy).rock && (p.grounded || p.climbing)) {
      const above = this.tile(cx, cy - 1);
      if (!above.rock || this.canDig(above)) this.placeLadder(p, true);
    }
    const shaft = this.inShaft(p);
    const onLadder = this.ladderAt(p.x, p.y) || shaft;
    const ladderBelow = this.ladderAt(p.x, p.y + h + 0.05) && !this.solid(p.x, p.y + h + 0.05);
    // Digging up, from a ladder into the rock above.
    if (iy < -0.5 && Math.abs(ix) < 0.5 && onLadder && !shaft && cy - 1 >= SURFACE && this.solid(p.x, p.y - h - 0.08)) {
      const t = this.tile(cx, cy - 1);
      if (this.canDig(t)) { p.dig = { x: cx, y: cy - 1, dx: 0, up: true, t: 0, need: this.hardness(t) }; p.x = cx + 0.5; p.vx = p.vy = 0; this.emit('dig', { p: p.i, x: cx, y: cy - 1 }); return; }
      if (t.rock < 99 && !p.toldHard) { p.toldHard = true; this.emit('tooHard', { p: p.i, rock: t.rock }); }
    }
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
    // A heavy load and deep water slow you down.
    const slow = (1 - M.loadSlow * p.cargo.length) * (wet > R.water.slowAt ? R.water.slow : 1);
    p.riding = false;
    if (p.climbing) {
      const fast = shaft && Math.abs(iy) > 0.3;
      p.riding = fast;
      p.vy = Math.abs(iy) > 0.3 ? Math.sign(iy) * (fast ? R.stations.speed : M.climb * slow) : 0;
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
      p.vy = Math.min(M.maxFall * (wet > R.water.slowAt ? 0.5 : 1), p.vy + M.gravity * dt);
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
    this.arrive(p, inp, dt);
  }

  // Where the miner has got to: records, finds, the cave, a station or the village.
  arrive(p, inp, dt) {
    const R = this.R, M = R.miner, cx = Math.floor(p.x), cy = Math.floor(p.y);
    const depth = Math.max(0, cy - SURFACE);
    if (depth > this.stats.deepest) {
      this.stats.deepest = depth;
      const band = this.layerAt(cy);
      if (band?.card && !this.found.has(band.card) && cy >= band.from) { this.found.add(band.card); this.emit('layer', { card: band.card, depth }); }
    }
    const here = this.tile(cx, cy);
    if (here.find && !here.rock) {
      p.finds.push(here.find); this.stats.finds++;
      this.emit('find', { p: p.i, id: here.find, x: cx, y: cy, layer: this.layerAt(cy).card });
      here.find = null;
    }
    if (!this.stats.cave && here.cave) { this.stats.cave = true; this.stats.time = this.t; this.emit('cave', { p: p.i }); }
    // A cage station: sell (a little under the weighbridge price), light the
    // lamp and stack up ladders, without going all the way up.
    const k = p.riding ? -1 : this.stationAt(p);
    if (k >= 0) {
      if (p.atStation !== k) this.emit('station', { p: p.i, k });
      if (p.cargo.length) this.sell(p, R.stations.sell);
      if (p.light < this.stat('lamp') - 0.01) this.refill(p, dt);
      this.restock(p);
    }
    p.atStation = k;
    // At the surface: rest, sell, light the lamp, the workshop and the museum.
    p.atShop = null;
    if (p.y < SURFACE) {
      p.hp = Math.min(M.hp, p.hp + M.regen * dt);
      if (p.grounded) {
        for (const b of R.buildings) if (Math.abs(p.x - b.x) < b.w / 2 + 0.2) p.atShop = b.id;
        if (p.atShop === 'bascula' && p.cargo.length) this.sell(p);
        if (p.atShop === 'lampisteria' && p.light < this.stat('lamp') - 0.01) this.refill(p, dt);
        if (p.atShop === 'taller') { this.restock(p); if (inp.a) this.emit('workshop', { p: p.i }); }
        if (p.atShop === 'museo') { if (p.finds.length) this.deliver(p); if (inp.a) this.emit('museum', { p: p.i }); }
      }
    }
  }

  // The winch rope: a few seconds' haul, load and all.
  updateHaul(p, dt) {
    const H = p.haul;
    H.t += dt;
    const k = Math.min(1, H.t / H.secs), e = k * k * (3 - 2 * k);
    p.x = H.x0 + (H.x1 - H.x0) * e; p.y = H.y0 + (H.y1 - H.y0) * e;
    p.vx = p.vy = 0; p.walk += dt * 2;
    if (k < 1) return;
    p.haul = null; p.climbing = false; p.grounded = true; p.face = 1;
    this.emit('hauled', { p: p.i, k: H.k });
    if (H.end) this.endCareer();
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

  placeLadder(p, quiet = false) {
    const t = this.tile(Math.floor(p.x), Math.floor(p.y));
    if (t.rock || t.ladder || p.y < SURFACE) return false;
    if (p.ladders <= 0) { if (!quiet || !p.toldLadders) { p.toldLadders = true; this.emit('noLadders', { p: p.i }); } return false; }
    t.ladder = true; p.ladders--;
    this.emit('ladder', { p: p.i });
    return true;
  }

  breakTile(p, x, y) {
    const t = this.tiles[y][x], ore = t.ore, gas = t.gas, spring = t.spring;
    Object.assign(t, { rock: 0, ore: null, loose: false, gas: false, spring: false });
    if (gas) this.releaseGas(x, y, gas);
    if (spring) this.releaseWater(x, y, spring);
    p.dig = null;
    this.emit('broke', { p: p.i, x, y, rock: this.layerAt(y).card });
    const py = Math.floor(p.y);
    if (y > py) {
      // Going down, a ladder goes in behind you. Keep it unbroken: rungs in
      // the spot you're leaving too, if it was already open.
      const here = this.tile(x, py);
      if (!here.rock && !here.ladder && py >= SURFACE && p.ladders > 1) { here.ladder = true; p.ladders--; }
      p.y = y + 0.5 - 0.001;
      if (p.ladders > 0) { t.ladder = true; p.ladders--; } else if (!p.toldLadders) { p.toldLadders = true; this.emit('noLadders', { p: p.i }); }
    } else if (y < py) {
      // Going up: climb into the hole, rungs and all.
      p.y = y + 0.5; p.climbing = true;
      if (p.ladders > 0 && !t.ladder) { t.ladder = true; p.ladders--; }
    }
    p.x = x + 0.5;
    this.loosen(x, y - 1);
    if (ore) this.take(p, ore, x, y);
  }

  // Ore into the sack, if there's room.
  take(p, ore, x, y) {
    if (p.cargo.length >= this.stat('bag')) { this.emit('bagFull', { p: p.i, ore }); return false; }
    p.cargo.push(ore);
    const first = !this.found.has(ore), jackpot = !!this.R.ores[ore].jackpot;
    this.found.add(ore);
    if (jackpot) this.stats.jackpots++;
    this.emit('ore', { p: p.i, ore, x, y, first, jackpot, value: this.R.ores[ore].value, full: p.cargo.length >= this.stat('bag') });
    return true;
  }

  // ---- loose rock: with nothing under it, it trickles dust and creaks, then falls ------------------

  loosen(x, y) {
    const t = this.tile(x, y);
    if (!t.loose || !t.rock || t.falling || this.solid(x + 0.5, y + 1.5)) return;
    t.falling = true;
    this.stats.met.loose++;
    this.rocks.push({ x, y, wait: this.R.loose.warn, warn: this.R.loose.warn, vy: 0, fy: y, rock: t.rock });
    this.emit('creak', { x, y });
  }

  updateRocks(dt) {
    for (let k = this.rocks.length - 1; k >= 0; k--) {
      const r = this.rocks[k];
      if (r.wait > 0) {
        r.wait -= dt;
        if (r.wait <= 0) {
          const t = this.tiles[r.y][r.x];
          Object.assign(t, { rock: 0, loose: false, falling: false, ore: null });
          this.emit('fall', { x: r.x, y: r.y });
          this.loosen(r.x, r.y - 1);
        }
        continue;
      }
      r.vy = Math.min(14, r.vy + this.R.miner.gravity * dt);
      r.fy += r.vy * dt;
      // Hitting a miner: the rock breaks on the helmet.
      const hit = this.miners.find((p) => !p.haul && Math.abs(p.x - (r.x + 0.5)) < 0.8 && p.y - 0.4 < r.fy + 1 && p.y + 0.4 > r.fy);
      if (hit) { this.hurt(hit, this.R.loose.damage, 'rock'); this.emit('rockfall', { x: r.x, y: Math.floor(r.fy), hit: hit.i }); this.rocks.splice(k, 1); continue; }
      const below = Math.floor(r.fy + 1), under = this.tile(r.x, below);
      if (under.rock > 0 || under.shaft || under.station != null || under.cave || below >= this.H) {
        // It lands; a shaft, a station or the cave catches it in a net of
        // timber instead of filling up.
        const ty = below - 1, t = this.tiles[ty]?.[r.x];
        if (t && !t.rock && !t.shaft && t.station == null && !t.cave && !t.find && ty >= SURFACE) Object.assign(t, { rock: r.rock, ore: null, ladder: false, loose: true });
        this.emit('rockfall', { x: r.x, y: ty });
        this.rocks.splice(k, 1);
        this.loosen(r.x, ty);
      }
    }
  }

  // ---- dynamite: a short fuse, then a 3x3 blast -----------------------------------------------------

  updateBombs(dt) {
    for (let k = this.bombs.length - 1; k >= 0; k--) {
      const b = this.bombs[k];
      b.fuse -= dt;
      if (b.fuse > 0) continue;
      this.bombs.splice(k, 1);
      this.explode(b);
    }
  }

  // Breaks rock up to one grade harder than the tool can; ore in the blast
  // lands in a nearby miner's sack if there's room. Too close, and it hurts.
  explode(b) {
    const D = this.R.items.dynamite, reach = this.levels.pick + 1;
    const p = this.miners[0];
    // Bad air drifted near the fuse: it fizzles out, nothing more.
    if (this.gasNear(b.x, b.y, this.R.badAir.fizzle)) { this.stats.fizzles++; this.emit('fizzle', { p: -1, x: b.x + 0.5, y: b.y + 0.5 }); return; }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = b.x + dx, y = b.y + dy;
      if (x < 0 || x >= this.W || y <= SURFACE || y >= this.H) continue;
      const t = this.tiles[y][x];
      if (!t.rock || t.rock >= 99 || this.needs(t) > reach) continue;
      const { ore, spring } = t;
      Object.assign(t, { rock: 0, ore: null, loose: false, gas: false, spring: false, falling: false });
      if (spring) this.releaseWater(x, y, spring);
      if (ore && Math.hypot(p.x - (x + 0.5), p.y - (y + 0.5)) < 4) this.take(p, ore, x, y);
    }
    let hit = null;
    for (const q of this.miners) {
      const d = Math.hypot(q.x - (b.x + 0.5), q.y - (b.y + 0.5));
      if (d < D.hurtRadius) { this.hurt(q, D.damage * (1 - 0.5 * d / D.hurtRadius), 'blast'); hit = q.i; }
    }
    // The shock sets off loose rock nearby.
    for (let dy = -3; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) this.loosen(b.x + dx, b.y + dy);
    this.emit('boom', { x: b.x, y: b.y, hit });
  }

  // ---- bad air: hisses before you dig into it, then drifts through the tunnels -----------------------

  // The whole pocket lets go: the bigger it was, the further the gas drifts
  // and the longer it lingers.
  releaseGas(x, y, id = true) {
    const B = this.R.badAir, seen = new Set([this.idx(x, y)]);
    const rest = this.pocketTiles('gas', id), size = 1 + rest.length;
    for (const [tx, ty] of rest) this.tiles[ty][tx].gas = false;
    const reach = Math.round(B.reach + B.reachPer * (size - 1)), life = B.secs + B.secsPer * (size - 1);
    let front = [[x, y]];
    this.stats.met.air++;
    this.emit('air', { x, y, size });
    for (let d = 0; d <= reach && front.length; d++) {
      const next = [];
      for (const [fx, fy] of front) {
        this.gasQueue.push({ i: this.idx(fx, fy), at: this.t + d * B.drift, life: life - d * 0.3 });
        // Bad air rises: up first, then sideways, then down.
        for (const [nx, ny] of [[fx, fy - 1], [fx - 1, fy], [fx + 1, fy], [fx, fy + 1]]) {
          if (nx < 0 || nx >= this.W || ny < SURFACE || ny >= this.H) continue;
          const i = this.idx(nx, ny);
          if (seen.has(i) || this.tiles[ny][nx].rock) continue;
          seen.add(i); next.push([nx, ny]);
        }
      }
      front = next;
    }
  }

  updateGas(dt) {
    for (let k = this.gasQueue.length - 1; k >= 0; k--) {
      const q = this.gasQueue[k];
      if (q.at > this.t) continue;
      if (!this.tiles[Math.floor(q.i / this.W)][q.i % this.W].rock) this.gas[q.i] = Math.max(this.gas[q.i], q.life);
      this.gasQueue.splice(k, 1);
    }
    let any = false;
    for (let i = 0; i < this.gas.length; i++) if (this.gas[i] > 0) { any = true; break; }
    if (!any) { this.ventT = 0; return; }
    // Where the air moves, every half second: gas there drains much faster.
    if ((this.ventT -= dt) <= 0) { this.ventT = 0.5; this.airflow(); }
    const vent = this.R.badAir.vent;
    for (let i = 0; i < this.gas.length; i++) if (this.gas[i] > 0) {
      this.gas[i] = Math.max(0, this.gas[i] - dt * (this.vented[i] ? vent : 1));
      if (this.tiles[Math.floor(i / this.W)][i % this.W].rock) this.gas[i] = 0;
    }
  }

  // Fresh air comes in at the surface and down the old shaft.
  outlet(i) { const y = Math.floor(i / this.W), t = this.tiles[y][i % this.W]; return !t.rock && (y === SURFACE || !!t.shaft); }

  // Each cloud of bad air is vented when its open space has two separate ways
  // out (to the surface or the old shaft): air flows through and carries it
  // off. A dead end keeps its gas. Also marks the way the draught runs.
  airflow() {
    const W = this.W, N = W * this.H, open = (i) => i >= SURFACE * W && i < N && !this.tiles[Math.floor(i / W)][i % W].rock;
    this.vented.fill(0);
    const cloud = new Int32Array(N).fill(-1);
    let anyVent = false;
    for (let s = 0; s < N; s++) {
      if (!(this.gas[s] > 0) || cloud[s] >= 0 || !open(s)) continue;
      const tiles = [s]; cloud[s] = s;
      for (let k = 0; k < tiles.length; k++) for (const n of this.around(tiles[k])) if (this.gas[n] > 0 && cloud[n] < 0 && open(n)) { cloud[n] = s; tiles.push(n); }
      if (this.ventilated(s)) { anyVent = true; for (const i of tiles) this.vented[i] = 1; }
    }
    this.draft.fill(0);
    if (!anyVent) return;
    // The draught: from each open tile, the step toward the nearest way out.
    const dist = new Int32Array(N).fill(-1), queue = [];
    for (let i = SURFACE * W; i < N; i++) if (open(i) && this.outlet(i)) { dist[i] = 0; queue.push(i); }
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k];
      for (const n of this.around(i)) if (open(n) && dist[n] < 0) {
        dist[n] = dist[i] + 1; queue.push(n);
        const dx = (i % W) - (n % W), dy = Math.floor(i / W) - Math.floor(n / W);
        this.draft[n] = dy < 0 ? 1 : dx < 0 ? 2 : dx > 0 ? 3 : 4;
      }
    }
  }

  // The tiles beside tile i (in the mine).
  around(i) {
    const W = this.W, x = i % W, y = Math.floor(i / W), out = [];
    if (y > SURFACE) out.push(i - W);
    if (x > 0) out.push(i - 1);
    if (x < W - 1) out.push(i + 1);
    if (y < this.H - 1) out.push(i + W);
    return out;
  }

  // Two routes from tile s to fresh air that share no tile (but s): a little
  // max-flow over the open tiles, each tile carrying one route.
  ventilated(s) {
    if (this.outlet(s)) return true;
    const W = this.W, N = W * this.H, open = (i) => !this.tiles[Math.floor(i / W)][i % W].rock;
    const used = new Uint8Array(N), sunk = new Uint8Array(N), flow = new Map();
    const f = (a, b) => flow.get(a * N + b) ?? 0;
    for (let route = 0; route < 2; route++) {
      // Nodes: 2i is the way into tile i, 2i + 1 the way out of it.
      const prev = new Int32Array(2 * N).fill(-2), queue = [2 * s + 1];
      prev[2 * s + 1] = -1;
      let end = -1;
      for (let k = 0; k < queue.length && end < 0; k++) {
        const node = queue[k], i = node >> 1;
        const go = (n) => { if (prev[n] === -2 && (n >> 1) !== s) { prev[n] = node; queue.push(n); } };
        if (node & 1) {
          if (i !== s && this.outlet(i) && !sunk[i]) { end = node; break; }
          for (const n of this.around(i)) if (open(n) && f(i, n) === 0) go(2 * n);
          if (used[i] && i !== s) go(2 * i);
        } else {
          if (!used[i]) go(2 * i + 1);
          for (const j of this.around(i)) if (f(j, i) === 1) go(2 * j + 1);
        }
      }
      if (end < 0) return false;
      sunk[end >> 1] = 1;
      for (let n = end; prev[n] !== -1; n = prev[n]) {
        const m = prev[n], a = m >> 1, b = n >> 1;
        if (a === b) used[a] = (m & 1) ? 0 : 1; // through a tile, or back out of it
        else if (m & 1) flow.set(a * N + b, 1); // out of a, into b
        else flow.set(b * N + a, 0); // undoing a step b -> a
      }
    }
    return true;
  }

  // ---- water: drips before you dig into it, then runs downhill ---------------------------------------

  // The whole pocket lets go: volume tiles of water for each of its tiles.
  releaseWater(x, y, id = true) {
    const rest = this.pocketTiles('spring', id), size = 1 + rest.length;
    for (const [tx, ty] of rest) this.tiles[ty][tx].spring = false;
    this.springs.push({ x, y, left: this.R.water.volume * size, rate: this.R.water.rate * Math.sqrt(size) });
    this.stats.met.water++;
    this.wet = true;
    this.emit('flood', { x, y, size });
  }

  floodable(x, y) {
    if (x < 0 || x >= this.W || y < SURFACE || y >= this.H) return false;
    const t = this.tiles[y][x];
    return !t.rock && !t.shaft && t.station == null && !t.cave;
  }

  updateWater(dt) {
    if (!this.wet) return;
    const Wr = this.R.water, tick = 0.1;
    this.waterT += dt;
    if (this.waterT < tick) return;
    const k = this.waterT; this.waterT = 0;
    const w = this.water, W = this.W;
    for (let s = this.springs.length - 1; s >= 0; s--) {
      const sp = this.springs[s], i = this.idx(sp.x, sp.y);
      if (this.floodable(sp.x, sp.y)) { const add = Math.min((sp.rate ?? Wr.rate) * k, sp.left, 1 - w[i]); w[i] += add; sp.left -= add; }
      if (sp.left <= 0.01) this.springs.splice(s, 1);
    }
    let any = this.springs.length > 0;
    for (let y = this.H - 1; y >= SURFACE; y--) {
      const flip = y % 2 ? 1 : -1;
      for (let xx = 0; xx < W; xx++) {
        const x = flip > 0 ? xx : W - 1 - xx, i = y * W + x;
        let l = w[i];
        if (l <= 0) continue;
        if (!this.floodable(x, y)) { w[i] = 0; continue; }
        any = true;
        if (this.floodable(x, y + 1)) { const b = i + W, f = Math.min(l, 1 - w[b]); w[b] += f; l -= f; }
        for (const d of [flip, -flip]) {
          if (l <= 0.02 || !this.floodable(x + d, y)) continue;
          const n = i + d;
          if (w[n] < l) { const f = (l - w[n]) / 3; w[n] += f; l -= f; }
        }
        w[i] = Math.max(0, l - Wr.seep * k);
      }
    }
    this.wet = any;
  }

  // ---- the finale: the cave piece, the rising water and the climb out ---------------------------

  // Taking the piece wakes the old workings: a rumble, then the water rises.
  takeCrown(p) {
    const C = this.R.cave, E = this.R.escape, t = this.tile(Math.floor(p.x), Math.floor(p.y));
    if (this.crown !== 'cave' || !t.crown) return false;
    t.crown = false; this.crown = 'carried'; p.crown = true; p.dig = null;
    this.escape = { t: 0, y: C.y1 + 1, speed: 0, top: E.top, minGap: 99, done: null, time: null, quake: 0 };
    this.emit('crown', { p: p.i, x: p.x, y: p.y });
    return true;
  }

  updateEscape(dt) {
    const E = this.escape;
    if (!E) return;
    const X = this.R.escape, p = this.miners[0];
    E.t += dt;
    if (E.t > X.grace) {
      if (E.speed === 0) this.emit('rising', {});
      E.speed = Math.min(X.max, X.rise + X.accel * (E.t - X.grace));
      E.y = Math.max(E.top, E.y - E.speed * dt);
    }
    if (E.done) return;
    // A rumble now and then while the water climbs.
    if ((E.quake -= dt) <= 0 && E.y > E.top) { E.quake = E.t < X.grace ? 0.8 : 2.2; this.emit('quake', { y: E.y }); }
    const feet = p.y + this.R.miner.size / 2;
    if (!p.haul && E.t > X.grace) E.minGap = Math.min(E.minGap, E.y - feet);
    // Feet above where the water will stop: safe.
    if (feet <= E.top && !p.haul) this.finishEscape('escaped');
  }

  // Out ahead of the water, or caught by it: either way the cage brings you
  // up, with the piece and everything you carry, and the career ends.
  finishEscape(how) {
    const E = this.escape, p = this.miners[0], S = this.R.shaft, h = this.R.miner.size / 2;
    E.done = how; E.time = E.t; this.stats.escape = how;
    if (how === 'caught') { p.hp = Math.max(p.hp, 1); p.light = Math.max(p.light, 1); }
    p.dig = null; p.climbing = false;
    p.haul = { t: 0, secs: this.R.escape.haul, x0: p.x, y0: p.y, x1: S.x + 2.5, y1: SURFACE - h, k: -1, end: true };
    this.emit(how, { p: p.i, gap: E.minGap, secs: E.t });
  }

  // The career ends: the sack is sold, everything old goes to the museum
  // (the cave piece too) and the village opens it.
  endCareer() {
    if (this.over) return;
    const p = this.miners[0];
    if (p.cargo.length) this.sell(p);
    if (p.finds.length) this.deliver(p);
    if (this.crown === 'carried') {
      const fee = this.R.escape.fee;
      this.crown = 'museum'; p.crown = false;
      this.money += fee; this.stats.earned += fee; this.stats.fees += fee;
      this.emit('delivered', { p: p.i, id: 'crown', fee, n: this.museum.length });
    }
    this.over = true;
    this.emit('over', {});
  }

  // ---- the village -------------------------------------------------------------------------------

  sell(p, share = 1) {
    let total = 0;
    for (const ore of p.cargo) { total += Math.round(this.R.ores[ore].value * share); this.stats.ores[ore] = (this.stats.ores[ore] ?? 0) + 1; }
    this.money += total; this.stats.earned += total; this.stats.sold += p.cargo.length;
    this.emit('sold', { p: p.i, n: p.cargo.length, money: total, station: share < 1 });
    p.cargo = [];
  }

  // Old things go to the museum, not the weighbridge: a finder's fee each,
  // and a place on the shelves.
  deliver(p) {
    for (const id of p.finds) {
      const f = this.R.finds.list.find((q) => q.id === id);
      const fee = this.R.finds.fee[this.R.layers.findIndex((l) => l.card === f.layer)];
      this.museum.push(id);
      this.money += fee; this.stats.earned += fee; this.stats.fees += fee;
      this.emit('delivered', { p: p.i, id, fee, n: this.museum.length });
    }
    p.finds = [];
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

  // The carpenter stacks your ladders up again, free: nobody should be
  // stuck for want of a ladder.
  restock(p) {
    const n = this.stat('ladders') - p.ladders;
    if (n <= 0) return;
    p.ladders += n; p.toldLadders = false;
    this.emit('restocked', { p: p.i, n });
  }

  // Workmates bring you up. The ore in the sack stays below; anything old
  // you were carrying is left where you found it, to fetch again.
  rescue(p) {
    const lost = p.cargo.length, returned = p.finds.length;
    for (const id of p.finds) { const k = this.pockets.find((q) => q.id === id); this.tiles[k.fy][k.fx].find = id; }
    this.money = Math.max(0, this.money - this.R.prices.rescue);
    this.stats.rescues++;
    // Set down on solid village ground (not in a hole someone dug), with
    // ladders: nobody is left stuck.
    Object.assign(p, this.newMiner(p.i), { light: this.stat('lamp') * 0.5, belt: p.belt, sel: p.sel });
    p.x = this.solidGround(Math.floor(p.x)) + 0.5;
    this.emit('rescue', { p: p.i, lost, returned });
  }

  // The nearest village tile with ground under it.
  solidGround(x0) {
    for (let d = 0; d < this.W; d++) for (const x of [x0 + d, x0 - d]) if (x >= 0 && x < this.W && this.tiles[SURFACE][x].rock) return x;
    return x0;
  }

  // The career's score: every coin earned, a bonus per museum piece and one
  // for reaching the cave. Higher is better.
  score() { return this.breakdown().total; }

  // The score, line by line, for the museum opening.
  breakdown() {
    const S = this.R.score, n = this.museum.length;
    const b = { earned: Math.round(this.stats.earned), n, museum: n * S.museum, cave: this.stats.cave ? S.cave : 0, escape: this.stats.escape === 'escaped' ? S.escape : 0 };
    b.total = b.earned + b.museum + b.cave + b.escape;
    return b;
  }

  // What an upgrade level gives, for the workshop to explain where each
  // branch of tools leads. Layers newly opened to a better tool are listed.
  benefit(u, level) {
    const U = this.R.upgrades[u], value = U.base + U.per * level;
    if (u === 'pick') {
      const opens = this.R.layers.filter((l) => (this.R.rocks[l.rock].needs ?? 0) === level && level > 0).map((l) => l.card);
      return { speed: value, opens };
    }
    if (u === 'stations') { const st = this.R.stations.list[level - 1]; return { depth: st ? st.y - SURFACE : 0, card: st?.card }; }
    return { value };
  }
}

// ---- a sensible miner, for the attract demo and the balance tests --------------------------------
//
// Each trip it picks a target: a museum piece it has the tools for in a mine
// it has already reached, or the way down to the cave. It goes there by the
// cage when it can (along the station's landing, then down), and comes back
// when the sack is full, the light or strength runs low, or it has a find,
// stopping at a station to sell and refill when there's no reason to go up.
// explore: false makes a miner who only ever digs straight down.

export class Helper {
  constructor(mine, i, { explore = true } = {}) {
    this.m = mine; this.i = i; this.explore = explore;
    this.mode = 'shop'; this.plan = null; this.trips = 0; this.done = false;
    this.rescues = 0; this.anchor = null; this.skip = new Set(); this.bad = new Set();
  }

  // Press A until the belt shows the thing, then C.
  use(p, id) { return ITEMS[p.sel] === id ? { c: true } : { a: true }; }

  input() {
    const m = this.m, p = m.miners[this.i];
    if (m.over) this.done = true;
    if (p.haul || this.done) return {};
    if (m.stats.rescues !== this.rescues) { this.rescues = m.stats.rescues; this.mode = 'shop'; this.plan = null; }
    // Stuck for a while (nothing moving, nothing being dug): give up the target.
    const A = this.anchor;
    if (!A || Math.hypot(p.x - A.x, p.y - A.y) > 0.7 || m.bombs.length || p.y < SURFACE) this.anchor = { x: p.x, y: p.y, t: m.t };
    else if (m.t - A.t > 8 && !this.waiting) {
      this.anchor = null;
      if (this.plan?.id) this.skip.add(this.plan.id);
      if (this.mode !== 'up') this.mode = 'up';
      else this.wantRope = true;
    }
    return this.think(p) ?? {};
  }

  lightLow(p) {
    const m = this.m, R = m.R, cy = Math.floor(p.y), cx = Math.floor(p.x);
    const k = this.refuge(p);
    const d = Math.max(0, cy - k.y) + Math.abs(cx - k.x);
    return p.light < d * R.helper.lightPerTile + R.helper.lightSpare;
  }

  // The nearest place above to sell and light the lamp.
  refuge(p) {
    const m = this.m, R = m.R, cy = Math.floor(p.y);
    for (let k = m.levels.stations - 1; k >= 0; k--) { const st = R.stations.list[k]; if (st.y <= cy) return { x: R.shaft.x, y: st.y, k }; }
    return { x: Math.floor(p.x), y: SURFACE, k: -1 };
  }

  // Worth a trip to the surface: something to deliver, or something to buy.
  wantSurface(p) {
    const m = this.m;
    if (p.finds.length) return true;
    for (const u of ['pick', 'stations', 'lamp', 'bag']) { const c = m.cost(u); if (c != null && !m.locked(u) && c <= m.money) return true; }
    return false;
  }

  think(p) {
    const m = this.m, R = m.R;
    const surface = p.y < SURFACE;
    this.waiting = false;
    if (m.escape && !m.escape.done) return this.flee(p);
    const cx = Math.floor(p.x), cy = Math.floor(p.y);
    if (!surface && this.mode !== 'shop') {
      // Look after yourself first.
      if (p.hp < R.miner.hp * 0.4 && p.belt.kit) return this.use(p, 'kit');
      if (this.lightLow(p) && p.belt.oil) return this.use(p, 'oil');
      // Bad air here: the bellows, or get out of it, up the way you came.
      if (m.gasAt(cx, cy) > 0) {
        if (p.belt.bellows) return this.use(p, 'bellows');
        if (this.mode !== 'up') this.mode = 'up';
      }
      // Head under water: up and out of it.
      if (m.waterAt(cx, cy) > R.water.drown * 0.8 && this.mode !== 'up') this.mode = 'up';
      if (this.mode !== 'up' && (p.cargo.length >= m.stat('bag') || this.lightLow(p) || (p.hp < R.miner.hp * 0.35) || (p.ladders <= 0 && !p.dig))) this.mode = 'up';
    }
    if (this.mode === 'up') return this.goUp(p);
    if (this.mode === 'shop') {
      if (!surface) { this.mode = 'up'; return this.goUp(p); }
      return this.shop(p);
    }
    if (this.mode === 'shaft') return this.toEntry(p);
    if (this.mode === 'fuse') return this.clear(p);
    return this.approach(p);
  }

  // The escape: out by the mine already built, up the ladders and into the
  // cage; the bellows, a first-aid kit, oil or the winch rope if need be.
  flee(p) {
    const m = this.m, R = m.R, E = m.escape, cx = Math.floor(p.x), cy = Math.floor(p.y);
    if (m.gasAt(cx, cy) > 0 && p.belt.bellows) return this.use(p, 'bellows');
    if (p.hp < R.miner.hp * 0.4 && p.belt.kit) return this.use(p, 'kit');
    if (p.light < 4 && p.belt.oil) return this.use(p, 'oil');
    const gap = E.y - (p.y + R.miner.size / 2);
    if (p.belt.rope && gap < 1.2 && E.t > R.escape.grace && !m.inShaft(p) && m.ropeTarget(p).k !== m.stationAt(p)) return this.use(p, 'rope');
    if (this.wantRope && p.belt.rope) { this.wantRope = false; return this.use(p, 'rope'); }
    return this.climb(p);
  }

  goUp(p) {
    const m = this.m, R = m.R, cy = Math.floor(p.y);
    if (p.y < SURFACE && p.grounded) { this.mode = 'shop'; return {}; }
    // At a station: sell and refill here, and go straight back down if
    // there's no reason to go up.
    const k = m.stationAt(p);
    if (k >= 0 && !this.wantSurface(p)) {
      if (p.light < m.stat('lamp') - 0.5 && m.money > 1) return {};
      if (this.planTrip(p, k)) return {};
    }
    // Stuck, a long way up, or about to run out of light: the winch rope.
    const ref = this.refuge(p);
    if (this.wantRope && p.belt.rope && p.y > SURFACE) return this.use(p, 'rope');
    this.wantRope = false;
    if (p.belt.rope && ref.k !== m.stationAt(p) && p.light < (cy - ref.y) * 0.3 + 4) return this.use(p, 'rope');
    return this.climb(p);
  }

  shop(p) {
    const m = this.m, R = m.R;
    const b = (id) => R.buildings.find((q) => q.id === id);
    const go = (tx) => ({ x: Math.abs(tx - p.x) < 0.08 ? 0 : Math.sign(tx - p.x) });
    if (p.cargo.length) return go(b('bascula').x);
    if (p.finds.length) return go(b('museo').x);
    if (p.light < m.stat('lamp') * 0.9 && (m.money > 5 || p.light < m.stat('lamp') * R.prices.freeOil)) return go(b('lampisteria').x);
    if (Math.abs(p.x - b('taller').x) > 0.4) return go(b('taller').x);
    this.buy(p);
    return this.planTrip(p, -1) ? {} : {};
  }

  buy(p) {
    const m = this.m, R = m.R;
    // When the next layer down needs a better tool, save up for it.
    const ahead = R.layers.find((l) => l.from > SURFACE + m.stats.deepest - 2) ?? R.layers.at(-1);
    const saving = (R.rocks[ahead.rock].needs ?? 0) > m.levels.pick;
    const can = (u) => m.cost(u) != null && !m.locked(u);
    // A station as soon as there's one to build: every trip starts deeper.
    if (can('stations') && m.cost('stations') <= m.money * 0.9 && (!saving || m.cost('stations') + m.cost('pick') <= m.money)) m.buy('stations');
    if (saving) {
      if (can('pick') && m.cost('pick') <= m.money) m.buy('pick');
      // Something cheaper on the way (a station first), if the pick stays in reach.
      else {
        const u = ['stations', 'lamp', 'bag'].filter(can).sort((x, y) => m.cost(x) - m.cost(y))[0];
        if (u && m.cost(u) + m.cost('pick') * 0.4 <= m.money) m.buy(u);
      }
    } else for (const u of ['pick', 'stations', 'bag', 'lamp', 'ladders', 'gear']) if (can(u) && m.cost(u) <= m.money * 0.85) { m.buy(u); break; }
    // The belt: a rope, a first-aid kit and a flask, and dynamite while
    // waiting for a better tool, keeping money back for what it's saving for.
    const keep = 80 + (saving && can('pick') ? m.cost('pick') * 0.25 : 0);
    const want = { rope: 1, kit: 1, oil: 1, dynamite: m.levels.pick < 3 ? 1 : 0, bellows: m.stats.deepest > R.badAir.from - SURFACE ? 1 : 0 };
    for (const id of ['oil', 'rope', 'bellows', 'dynamite', 'kit']) while (p.belt[id] < want[id] && m.money > m.itemCost(id) + keep && m.buyItem(id, p));
  }

  // Choose where to go next, from the surface (from = -1) or a station.
  planTrip(p, from) {
    const m = this.m, R = m.R, C = R.cave;
    const reach = m.layerIndex(m.stats.deepest + SURFACE);
    const finds = this.explore ? m.pockets.filter((q) => m.tiles[q.fy][q.fx].find && !this.skip.has(q.id)
      && R.layers.findIndex((l) => l.card === q.layer) <= reach
      && (R.rocks[m.layerAt(q.fy).rock].needs ?? 0) <= m.levels.pick) : [];
    const goDeep = !m.stats.cave && (!finds.length || this.trips % 2 === 1);
    // The finale: once the museum is as full as it will get (or time is
    // getting on), go for the cave's piece, with a full lamp and the belt.
    const finale = m.stats.cave && m.crown === 'cave' && (!finds.length || m.t > R.helper.finaleAt);
    let target;
    if (finale) target = { x: R.escape.x, y: C.y1, crown: true };
    else if (!goDeep && finds.length) {
      const entryFor = (q) => this.entry(q.fy);
      const cost = (q) => { const e = entryFor(q); return (q.fy - e.y) * 1.5 + Math.abs(q.fx - e.x); };
      const q = finds.sort((a, b) => cost(a) - cost(b))[0];
      target = { x: q.fx, y: q.fy, id: q.id };
    } else {
      // Down: to the cave, or, while the next mine's rock is too hard for
      // the tool, a fresh column for ore above it (dynamite is for boulders).
      const block = R.layers.find((l) => (R.rocks[l.rock].needs ?? 0) > m.levels.pick);
      const ore = m.stats.cave || !!block;
      if (ore || this.deepCol == null || m.stats.deepest <= (this.lastDeep ?? -1)) {
        if (this.explore) {
          this.deepCol = 1 + (((this.deepCol ?? R.world.start[0] - 4) + 4) % (m.W - 2));
          if (Math.abs(this.deepCol - R.shaft.x) < 2) this.deepCol += 3;
        } else this.deepCol = R.world.start[0] - 2 + ((this.trips * 3) % 5); // never strays from where it started
      }
      this.lastDeep = m.stats.deepest;
      // Ore trips work the row with the most ore left in the mines the tool
      // can dig, starting from the end with the ore.
      let row = m.H - 3, best = -1, col = this.deepCol;
      if (ore && this.explore) for (let y = SURFACE + 2; y < (block ? block.from : m.H - 1); y++) {
        let v = 0, first = null;
        for (let x = 1; x < m.W - 1; x++) { const t = m.tiles[y][x]; if (t.ore && t.rock && m.canDig(t) && !this.bad.has(y * m.W + x)) { v += R.ores[t.ore].value; first ??= x; } }
        if (v > best) { best = v; row = y; col = first ?? col; }
      }
      // (Digging only straight down: just as deep as the tool allows.)
      if (ore && !this.explore) row = block ? block.from - 1 : m.H - 3;
      target = { x: ore && this.explore ? col : this.deepCol, y: ore ? row : C.y0 + 1, deep: true, ore, along: ore && !this.explore };
    }
    this.trips++;
    const e = this.entry(target.y);
    this.plan = { ...target, entry: e.k, ey: e.y };
    this.detour = null;
    this.mode = from === e.k ? 'go' : 'shaft';
    return true;
  }

  // The deepest station above a row, or the surface.
  entry(y) {
    const m = this.m, R = m.R;
    for (let k = m.levels.stations - 1; k >= 0; k--) { const st = R.stations.list[k]; if (st.y < y) return { k, y: st.y, x: R.shaft.x }; }
    return { k: -1, y: SURFACE, x: R.world.start[0] };
  }

  // To the shaft, then the cage to the entry row.
  toEntry(p) {
    const m = this.m, R = m.R, S = R.shaft, P = this.plan;
    const cx = Math.floor(p.x);
    if (P.entry < 0) {
      if (p.y < SURFACE && p.grounded) { this.mode = 'go'; return {}; }
      if (cx !== S.x) return this.climb(p);
      return { y: -1 };
    }
    if (cx !== S.x) return { x: Math.sign(S.x + 0.5 - p.x) };
    const ty = R.stations.list[P.entry].y + 0.5;
    if (Math.abs(p.y - ty) < 0.6) { this.mode = 'go'; return { x: 1 }; }
    return { y: Math.sign(ty - p.y) };
  }

  // Across, then down, to the target; round bad air and rock that's too hard.
  approach(p) {
    const m = this.m, R = m.R, P = this.plan;
    if (!P) { this.mode = 'up'; return {}; }
    const cx = Math.floor(p.x), cy = Math.floor(p.y);
    if (P.id && !m.tiles[P.y][P.x].find && !p.finds.includes(P.id)) { this.mode = 'up'; return {}; }
    if (P.id && p.finds.includes(P.id)) { this.mode = 'up'; return {}; }
    if (P.deep && !P.ore && m.stats.cave) { this.mode = 'up'; return {}; }
    if (P.crown && m.crown !== 'cave') { this.mode = 'up'; return {}; }
    if (p.y < SURFACE) {
      // Walk along the village to the column.
      if (Math.abs(p.x - (P.x + 0.5)) > 0.1) return { x: Math.sign(P.x + 0.5 - p.x) };
      return { y: 1 };
    }
    if (this.detour && cy >= this.detour.until) this.detour = null;
    const col = this.detour ? this.detour.x : P.x;
    // Grab ore right beside you on the way (not near bad air).
    if (p.grounded && p.cargo.length < m.stat('bag')) for (const d of [-1, 1]) {
      const t = m.tile(cx + d, cy);
      if (t.ore && m.canDig(t) && Math.abs(p.x - (cx + 0.5)) < 0.15 && !m.tile(cx + d, cy - 1).loose) return { x: d };
    }
    if (cx !== col) {
      const s = Math.sign(col - cx), next = m.tile(cx + s, cy);
      // Bad air drifting ahead: wait for the draught to clear it.
      if (!next.rock && m.gasAt(cx + s, cy) > 0) return this.wait();
      if (next.gas || next.spring || (next.rock && !m.canDig(next))) {
        if (!next.gas && !next.spring && p.belt.dynamite && m.needs(next) <= m.levels.pick + 1 && this.boulder(cx + s, cy)) return this.blast(p, cx, cy, s);
        // Under it instead, if the rock below can be dug.
        if (this.passable(cx, cy + 1)) { this.detour = { x: cx, until: cy + 2 }; return { y: 1 }; }
        return this.giveUp();
      }
      return { x: s };
    }
    if (cy < P.y) {
      const below = m.tile(cx, cy + 1);
      if (!below.rock && m.gasAt(cx, cy + 1) > 0) return this.wait();
      // Over an open hole: step to its middle to drop in.
      if (!below.rock && Math.abs(p.x - (cx + 0.5)) > 0.12) return { x: Math.sign(cx + 0.5 - p.x) * 0.4 };
      if (below.gas || below.spring || (below.rock && !m.canDig(below))) {
        if (!below.gas && !below.spring && p.belt.dynamite && m.needs(below) <= m.levels.pick + 1 && this.boulder(cx, cy + 1)) return this.blast(p, cx, cy, 0);
        // Round it: the nearest column beside where both this row and the
        // one below can be dug, and the way across is clear.
        for (const d of [1, -1, 2, -2, 3, -3]) {
          const x = cx + d;
          if (x < 1 || x > m.W - 2) continue;
          let clear = true;
          for (let k = 1; k <= Math.abs(d); k++) if (!this.passable(cx + Math.sign(d) * k, cy)) clear = false;
          if (clear && this.passable(x, cy + 1)) { this.detour = { x, until: cy + 2 }; return { x: Math.sign(d) }; }
        }
        return this.giveUp();
      }
      return { y: 1 };
    }
    if (cy > P.y) return { y: -1 };
    // On the target's row: walk to it.
    if (P.id) return { x: Math.sign(P.x + 0.5 - p.x) };
    if (P.crown) return cx === P.x ? { a: true } : { x: Math.sign(P.x + 0.5 - p.x) };
    // An ore trip at the bottom of what the tool can dig: along the row.
    if (P.ore && !P.along) { P.along = true; P.x = P.x < m.W / 2 ? m.W - 2 : 1; return {}; }
    if (P.ore) { this.mode = 'up'; return {}; }
    return { y: 1 };
  }

  // Open, or rock the tool can dig, and no bad air or water pocket.
  passable(x, y) {
    const t = this.m.tile(x, y);
    return !t.gas && !t.spring && (!t.rock || this.m.canDig(t));
  }

  // Hold still a moment (the stuck timer lets it be), for the air to clear.
  wait() { this.waiting = true; return {}; }

  // A harder lump in rock the tool can otherwise dig.
  boulder(x, y) { const m = this.m; return (m.R.rocks[m.layerAt(y).rock].needs ?? 0) <= m.levels.pick; }

  giveUp() {
    if (this.plan?.id) this.skip.add(this.plan.id);
    // An ore row it can't get to: try another next time.
    else if (this.plan?.ore) this.bad.add(this.plan.y * this.m.W + this.plan.x);
    this.mode = 'up';
    return {};
  }

  // Dynamite for rock one grade too hard: light it and get clear.
  blast(p, cx, cy, s) {
    if (this.m.bombs.length) return {};
    // Never a flame near bad air.
    if (this.m.gasNear(cx, cy, this.m.R.badAir.fizzle)) return this.giveUp();
    if (!p.grounded) return s ? {} : { y: 1 };
    this.fuse = { x: cx, y: cy, s }; this.mode = 'fuse';
    return this.use(p, 'dynamite');
  }

  // Get clear of the blast: up the ladder a couple of rungs, and wait.
  clear(p) {
    const m = this.m;
    if (!m.bombs.length) { this.mode = 'go'; return {}; }
    const F = this.fuse;
    if (F.s) return Math.abs(p.x - (F.x + 0.5)) < 2 ? { x: -F.s } : {};
    if (p.y > F.y - 1.6) return { y: -1 };
    return {};
  }

  // Up the ladders the way it came: when the ladder ends under rock, walk
  // along the gallery to the old shaft if it can, or to a ladder going up.
  climb(p) {
    const m = this.m, cx = Math.floor(p.x), cy = Math.floor(p.y);
    const upOk = (x) => (!!m.tile(x, cy).ladder || m.inShaft({ x: x + 0.5, y: p.y })) && !m.solid(x + 0.5, cy - 0.5);
    const along = (x) => {
      const s = Math.sign(x - cx);
      for (let k = 1; k <= Math.abs(x - cx); k++) {
        const tx = cx + s * k;
        if (m.solid(tx + 0.5, cy + 0.5) || (k < Math.abs(x - cx) && !m.solid(tx + 0.5, cy + 1.5) && !m.tile(tx, cy + 1).ladder)) return false;
      }
      return true;
    };
    // A ladder a few open tiles overhead (out of a chamber or the cave): push
    // up and the rungs go in on the way to it.
    const ladderAbove = (x) => {
      for (let k = 1; k <= 5; k++) { const t = m.tile(x, cy - k); if (t.rock) return false; if (t.ladder || t.shaft) return true; }
      return false;
    };
    const S = m.R.shaft.x;
    if (cx !== S && m.levels.stations > 0 && upOk(S) && along(S)) return { x: Math.sign(S - cx), y: 0 };
    if (upOk(cx) || (ladderAbove(cx) && Math.abs(p.x - (cx + 0.5)) < 0.2)) { this.side = null; return { x: 0, y: -1 }; }
    for (let d = 0; d < m.W; d++) for (const s of [-1, 1]) {
      const x = cx + s * d;
      if (x < 0 || x >= m.W) continue;
      if (d === 0) { if (ladderAbove(x)) return { x: Math.sign(cx + 0.5 - p.x), y: 0 }; continue; }
      if (along(x) && (upOk(x) || ladderAbove(x))) return { x: s, y: 0 };
    }
    // No ladder way up from here: up anyway if the rock above can be dug (a
    // ladder goes in as you go), or else sideways, one way, until it can.
    if (this.passable(cx, cy - 1)) return { x: 0, y: -1 };
    this.side ??= cx < m.W / 2 ? 1 : -1;
    if (!this.passable(cx + this.side, cy) || cx + this.side < 0 || cx + this.side >= m.W) this.side = -this.side;
    return { x: this.side, y: 0 };
  }
}
