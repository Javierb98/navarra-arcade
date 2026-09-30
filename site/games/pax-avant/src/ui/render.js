// Draws a season onto the 480x270 canvas: the border pastures seen from
// above, in pixel art.
//
// Everything that never moves (turf, paths, trees, rocks, huts, pens, the
// San Martín stone) is painted once. The grass has its own layer, repainted
// a few cells at a time as sheep eat it and it grows back. Each frame then
// blits those two layers and draws only what moves: water levels, gates,
// fires, sheep, dogs, shepherds, wolves and the weather.
//
// Anything that matters is told apart by shape as well as colour: Roncal is
// a circle (sheep marks, player tag), Barétous a square; bare grass has
// cracks, not just a browner green; water levels are lengths.

import { P, Bitmap, dither, hash2, fbm2, mix, cached } from './pixel.js';

export const W = 480;
export const H = 270;

const hex = (c) => `rgb(${c & 0xff},${(c >> 8) & 0xff},${(c >> 16) & 0xff})`;
const SIDE = [{ main: P.p1, dark: P.p1d, css: '#e69f00' }, { main: P.p2, dark: P.p2d, css: '#56b4e9' }];

// ---- the ground (painted once per map) ---------------------------------------

function pineTop(bm, cx, cy, r, seed) {
  bm.ellipse(cx + 2, cy + 3, r, r * 0.9, (x, y) => (dither(cx + x, cy + y, 0.55) ? P.pine4 : 0));
  const spikes = 7 + (seed % 3);
  for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
    const d = Math.hypot(x, y), ang = Math.atan2(y, x);
    const edge = r * (0.78 + 0.22 * Math.abs(Math.sin(ang * spikes / 2 + seed)));
    if (d > edge) continue;
    const light = -(x + y) / (r * 1.4) + (1 - d / r) * 0.4;
    let c = light > 0.55 ? P.pine0 : light > 0.15 ? P.pine1 : light > -0.3 ? P.pine2 : P.pine3;
    if (d > edge - 1) c = P.pine4;
    if (d < 1.2) c = P.pine3;
    bm.set(cx + x, cy + y, c);
  }
}

function boulder(bm, cx, cy, r) {
  bm.ellipse(cx + 2, cy + 2, r, r * 0.8, (x, y) => (dither(cx + x, cy + y, 0.6) ? P.turf3 : 0));
  bm.ellipse(cx, cy, r, r * 0.85, (x, y) => {
    const l = -(x + y) / (r * 1.5);
    return l > 0.35 ? P.rock0 : l > 0 ? P.rock1 : l > -0.4 ? P.rock2 : P.rock3;
  });
  bm.set(cx - 1, cy + 1, P.moss);
  bm.set(cx + 1, cy - 2, P.moss);
}

// Top-down roof: a ridge across the middle, lit side up. Stone walls peek
// out at the edges and a dark doorway faces down the mountain.
function hutRoof(bm, r, { tall = false, chimney = false } = {}) {
  const { x, y, w, h } = r;
  bm.rect(x - 1, y + h, w + 2, 3, P.turf3);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const top = j < h / 2;
      let c = top ? ((i + j) % 5 === 0 ? P.roof1 : P.roof0) : ((i + j) % 5 === 0 ? P.roof3 : P.roof2);
      if (j === Math.floor(h / 2)) c = P.stone1;
      if (i === 0 || i === w - 1 || j === 0 || j === h - 1) c = P.roof3;
      bm.set(x + i, y + j, c);
    }
  }
  bm.rect(x + Math.floor(w / 2) - 2, y + h, 4, 2, P.black);
  if (chimney) {
    const cx = x + Math.floor(w * 0.7), cy = y + 3;
    bm.ellipse(cx, cy, 2.5, 2.5, (dx, dy) => (dx + dy < 0 ? P.stone0 : P.stone2));
    bm.set(cx, cy, P.black);
  }
  if (tall) bm.rect(x, y - 1, w, 1, P.roof3);
}

function fence(bm, x1, y1, x2, y2) {
  const n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1)));
  for (let k = 0; k <= n; k++) {
    const x = Math.round(x1 + (x2 - x1) * (k / n)), y = Math.round(y1 + (y2 - y1) * (k / n));
    bm.set(x, y, P.log2);
    bm.set(x + 1, y + 1, P.log4);
    if (k % 6 === 0) { bm.rect(x - 1, y - 1, 2, 3, P.log3); bm.set(x - 1, y - 1, P.log1); }
  }
}

function stoneWall(bm, x1, y1, x2, y2) {
  const n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1)));
  for (let k = 0; k <= n; k++) {
    const x = Math.round(x1 + (x2 - x1) * (k / n)), y = Math.round(y1 + (y2 - y1) * (k / n));
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const h = hash2(x + a, y + b, 5);
      bm.set(x + a, y + b, a + b < -1 ? P.stone0 : h > 0.6 ? P.stone1 : h > 0.25 ? P.stone2 : P.stone3);
    }
  }
}

function path(bm, pts, width = 4) {
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay));
    for (let k = 0; k <= n; k++) {
      const cx = ax + (bx - ax) * k / n, cy = ay + (by - ay) * k / n;
      for (let dy = -width; dy <= width; dy++) for (let dx = -width; dx <= width; dx++) {
        const d = Math.hypot(dx, dy) / width;
        if (d > 1) continue;
        const x = Math.round(cx + dx), y = Math.round(cy + dy);
        if (d > 0.6 && !dither(x, y, (1 - d) * 2.5)) continue;
        bm.set(x, y, hash2(x, y, 4) > 0.9 ? P.pebble1 : d > 0.7 ? P.dirt1 : P.dirt0);
      }
    }
  }
}

function sanMartin(bm, x, y) {
  // A squat, weathered boundary stone on the pass, the border line cut into
  // its top, and a ring of trodden earth where the valleys meet.
  bm.ellipse(x, y + 4, 16, 8, (dx, dy) => (dither(x + dx, y + dy, 0.55) ? P.dirt1 : 0));
  bm.ellipse(x + 3, y + 3, 8, 4, (dx, dy) => (dither(x + dx, y + dy, 0.6) ? P.turf3 : 0));
  for (let j = -6; j <= 4; j++) {
    const half = 6 - (j < -4 ? (hash2(j, 1, 3) > 0.5 ? 1 : 2) : 0);
    for (let i = -half; i <= half; i++) {
      let c = j < -3 ? P.stone0 : i < -2 ? P.stone1 : i > 3 ? P.stone3 : P.stone2;
      if (Math.abs(i) === half || j === 4) c = P.stone4;
      if (hash2(i, j, 6) > 0.9) c = P.stone3;
      bm.set(x + i, y + j, c);
    }
  }
  bm.rect(x, y - 6, 1, 3, P.stone4);
}

function paintGround(season) {
  const map = season.map, bm = new Bitmap(W, H);
  // Mountain turf, rockier towards the pass at the top.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = fbm2(x * 0.035, y * 0.035, 3);
      const rocky = Math.max(0, 0.5 - y / 180) + (fbm2(x * 0.08, y * 0.08, 9) - 0.5) * 0.5;
      let c = n > 0.6 ? P.turf0 : n > 0.47 ? P.turf1 : n > 0.36 ? P.turf2 : P.turf3;
      if (rocky > 0.25 && dither(x, y, (rocky - 0.25) * 3)) c = hash2(x >> 1, y >> 1, 2) > 0.5 ? P.pebble1 : P.pebble2;
      bm.set(x, y, c);
    }
  }
  for (let i = 0; i < 500; i++) {
    const x = Math.floor(hash2(i, 11) * W), y = Math.floor(hash2(11, i) * H);
    bm.set(x, y, P.turf3); bm.set(x + 1, y - 1, P.turf2);
    if (i % 29 === 0) bm.set(x, y - 1, i % 2 ? P.white : P.sun1);
  }
  // Forest floor under the trees along the top.
  for (const f of map.forests) {
    for (let y = 0; y < f.y2 + 4; y++) for (let x = f.x1; x < f.x2; x++) {
      if (y > f.y2 - 2 && !dither(x, y, (f.y2 + 4 - y) / 6)) continue;
      bm.set(x, y, dither(x, y, 0.5) ? P.pine3 : P.grass4);
    }
  }
  // Tracks: from each pen gate past the spring, up to the high pasture and on to the stone.
  map.valleys.forEach((v, side) => {
    const gx = (v.pen.gate[0] + v.pen.gate[1]) / 2;
    const sp = map.springs.find((s) => s.id === v.id);
    const hi = map.pastures.find((p) => p.owner === side && p.high);
    path(bm, [[gx, v.pen.y], [gx + (side ? -20 : 20), v.pen.y - 30], [sp.x + (side ? -10 : 10), sp.y + 16], [hi.x, hi.y + 10], [map.stone.x + (side ? 20 : -20), map.stone.y + 18], [map.stone.x, map.stone.y + 10]]);
  });
  path(bm, [[map.stone.x, map.stone.y + 10], [map.stone.x, 170], [map.stone.x, 262]], 3);
  // Boundary markers along the border, and the line they make.
  for (let y = 44; y < H; y++) if ((y >> 2) & 1 && dither(map.border, y, 0.5)) bm.set(map.border, y, P.turf3);
  for (let y = 100; y < H; y += 34) boulder(bm, map.border, y, 2);
  for (const t of season.world.trees) pineTop(bm, Math.round(t.x), Math.round(t.y), t.r, Math.floor(t.x + t.y));
  // A second row of trees beyond the map edge, so the forest has depth.
  for (const f of map.forests) for (let x = f.x1 + 4; x < f.x2; x += 9) pineTop(bm, x, 4 + Math.floor(hash2(x, 3) * 5), 6, x);
  for (const r of map.rocks) boulder(bm, r.x, r.y, r.r);
  // Springs: a ring of stones round the source.
  for (const s of map.springs) bm.ellipse(s.x, s.y, 6, 5, (dx, dy, q) => (q > 0.55 ? (dx + dy < 0 ? P.stone0 : P.stone2) : 0));
  // Fire rings.
  for (const f of map.fires) {
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; bm.set(Math.round(f.x + Math.cos(a) * 4), Math.round(f.y + Math.sin(a) * 3), k < 4 ? P.stone1 : P.stone3); }
    bm.rect(f.x - 2, f.y - 1, 4, 2, P.log3);
  }
  // Huts, houses, pens.
  map.valleys.forEach((v) => {
    const s = v.shelter;
    bm.ellipse(s.x, s.y, s.r - 2, s.r - 5, (dx, dy) => (dither(s.x + dx, s.y + dy, 0.35) ? P.straw1 : 0));
    hutRoof(bm, v.hut, { chimney: true });
    hutRoof(bm, v.house, { chimney: true, tall: true });
    const p = v.pen;
    bm.ellipse(p.x + p.w / 2, p.y + p.h / 2, p.w / 2 - 3, p.h / 2 - 3, (dx, dy) => (dither(p.x + dx, p.y + dy, 0.4) ? P.straw1 : 0));
    fence(bm, p.x, p.y, p.gate[0], p.y);
    fence(bm, p.gate[1], p.y, p.x + p.w, p.y);
    fence(bm, p.x, p.y, p.x, p.y + p.h);
    fence(bm, p.x + p.w, p.y, p.x + p.w, p.y + p.h);
    fence(bm, p.x, p.y + p.h, p.x + p.w, p.y + p.h);
    for (const gx of p.gate) bm.rect(gx - 1, p.y - 2, 3, 4, P.log3);
  });
  // The shared shelter: stone walls, a roof over the back half.
  const S = map.sharedShelter;
  for (let y = S.y; y < S.y + S.h; y++) for (let x = S.x; x < S.x + S.w; x++) bm.set(x, y, dither(x, y, 0.4) ? P.straw1 : P.straw2);
  stoneWall(bm, S.x, S.y, S.x + S.w, S.y);
  stoneWall(bm, S.x, S.y, S.x, S.y + S.h);
  stoneWall(bm, S.x + S.w, S.y, S.x + S.w, S.y + S.h);
  hutRoof(bm, { x: S.x + 2, y: S.y + 1, w: S.w - 3, h: Math.round(S.h * 0.5) });
  sanMartin(bm, map.stone.x, map.stone.y);
  return bm.canvas();
}

// ---- grass (repainted cell by cell) --------------------------------------------

// Grass colour for one pixel at grass level g (0 bare .. 1 lush). Texture
// changes with the level too: lush grass has tufts and flowers, bare earth
// has cracks.
function grassPixel(x, y, g) {
  const n = hash2(x, y, 7), n2 = hash2(x >> 1, y >> 1, 8);
  if (g > 0.7) {
    if (n > 0.985) return n2 > 0.5 ? P.white : P.sun1;
    return n2 > 0.55 ? P.grass0 : dither(x, y, (g - 0.7) * 3) ? P.grass1 : P.grass2;
  }
  if (g > 0.45) return n2 > 0.6 ? P.grass1 : n > 0.8 ? P.grass3 : P.grass2;
  if (g > 0.22) return dither(x, y, (g - 0.22) * 4.3) ? (n > 0.7 ? P.grass3 : P.grass2) : (n2 > 0.5 ? P.straw0 : P.straw1);
  if (g > 0.08) return n > 0.85 ? P.grass3 : dither(x, y, (g - 0.08) * 7) ? P.straw1 : P.dirt1;
  // Bare: trampled earth with cracks.
  const crack = Math.abs(Math.sin(x * 0.7 + Math.sin(y * 0.5) * 2)) < 0.12 || Math.abs(Math.sin(y * 0.8 + x * 0.2)) < 0.08;
  return crack ? P.dirt3 : n2 > 0.5 ? P.dirt1 : P.dirt2;
}

class GrassLayer {
  constructor(season) {
    this.season = season;
    const map = season.map, Wd = season.world, C = Wd.cell;
    this.cv = document.createElement('canvas');
    this.cv.width = W; this.cv.height = H;
    this.cx = this.cv.getContext('2d');
    this.img = this.cx.createImageData(W, H);
    this.px = new Uint32Array(this.img.data.buffer);
    // Every grass pixel blends the four nearest grass cells of its pasture,
    // so wear spreads softly instead of in squares. `deps` lists, per cell,
    // the pixels that depend on it.
    const pix = [], cells = [], weights = [];
    this.deps = new Map();
    Wd.pastureCells.forEach((list, pi) => {
      const p = map.pastures[pi];
      for (const c of list) this.deps.set(c, []);
      const own = (col, row) => (col >= 0 && row >= 0 && col < Wd.cols && row < Wd.rows && Wd.pastureOf[row * Wd.cols + col] === pi ? row * Wd.cols + col : -1);
      for (let y = Math.max(0, Math.floor(p.y - p.ry * 1.1)); y < Math.min(H, p.y + p.ry * 1.1); y++) {
        for (let x = Math.max(0, Math.floor(p.x - p.rx * 1.1)); x < Math.min(W, p.x + p.rx * 1.1); x++) {
          const q = ((x - p.x) / p.rx) ** 2 + ((y - p.y) / p.ry) ** 2;
          if (!(q < 0.9 || (q < 1.12 && dither(x, y, (1.12 - q) * 4.5)))) continue;
          // Nearest grass cell, to stand in for neighbours off the pasture.
          let near = -1, bd = Infinity;
          const col = Math.floor(x / C), row = Math.floor(y / C);
          for (let r = row - 1; r <= row + 1; r++) for (let k = col - 1; k <= col + 1; k++) {
            const i = own(k, r);
            if (i < 0) continue;
            const d = ((k + 0.5) * C - x) ** 2 + ((r + 0.5) * C - y) ** 2;
            if (d < bd) { bd = d; near = i; }
          }
          if (near < 0) continue;
          const fx = x / C - 0.5, fy = y / C - 0.5, c0 = Math.floor(fx), r0 = Math.floor(fy), tx = fx - c0, ty = fy - r0;
          const idx = pix.length;
          pix.push(y * W + x);
          const quad = [[c0, r0, (1 - tx) * (1 - ty)], [c0 + 1, r0, tx * (1 - ty)], [c0, r0 + 1, (1 - tx) * ty], [c0 + 1, r0 + 1, tx * ty]];
          for (const [k, r, w] of quad) {
            const i = own(k, r);
            const cell = i >= 0 ? i : near;
            cells.push(cell);
            weights.push(w);
            const dl = this.deps.get(cell);
            if (dl[dl.length - 1] !== idx) dl.push(idx);
          }
        }
      }
    });
    this.pix = Int32Array.from(pix);
    this.cells = Int32Array.from(cells);
    this.weights = Float32Array.from(weights);
    this.level = new Map();
    this.stamp = new Int32Array(pix.length);
    this.pass = 0;
    this.update(Infinity);
  }

  // Repaint around up to `budget` cells whose grass has visibly changed.
  update(budget = 24) {
    const s = this.season, g = s.grass;
    let n = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
    this.pass++;
    for (const [c, list] of this.deps) {
      const q = Math.round(g[c] * 20);
      if (this.level.get(c) === q) continue;
      this.level.set(c, q);
      for (const k of list) {
        if (this.stamp[k] === this.pass) continue;
        this.stamp[k] = this.pass;
        let v = 0;
        for (let j = 0; j < 4; j++) v += g[this.cells[k * 4 + j]] * this.weights[k * 4 + j];
        const i = this.pix[k], x = i % W, y = (i - x) / W;
        this.px[i] = grassPixel(x, y, Math.round(v * 20) / 20);
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      if (++n >= budget) break;
    }
    if (n && x1 >= x0) this.cx.putImageData(this.img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  }
}

// ---- sprites (painted once) --------------------------------------------------------

const sprite = (key, w, h, paint) => cached(`spr.${key}`, () => { const bm = new Bitmap(w, h); paint(bm); return bm.canvas(); });

// A sheep seen from above and a little to the side. Its paint mark says
// which valley it belongs to: a round mark for Roncal, a square for Barétous.
function sheepSprite(side, pose, lamb = false, weak = false) {
  return sprite(`sheep.${side}.${pose}.${lamb}.${weak}`, 11, 9, (bm) => {
    const r = lamb ? 2.6 : 3.6, cx = 4.5, cy = 4;
    const w0 = weak ? P.wool2 : P.wool0, w1 = weak ? P.wool3 : P.wool1;
    bm.ellipse(cx + 1, cy + 2, r, r * 0.6, P.shadow);
    const step = pose === 'walk1' ? 1 : 0;
    for (const lx of [cx - 2, cx + 1]) bm.set(Math.round(lx + (lx > cx ? step : -step)), cy + 3, P.face);
    bm.ellipse(cx, cy, r + 0.6, r * 0.78, (x, y) => (x + y < -1 ? w0 : y > 1 ? P.wool2 : w1));
    for (let k = 0; k < 4; k++) bm.set(Math.round(cx - 2 + k * 1.3), Math.round(cy - 1 + (k & 1)), P.wool0);
    const hx = Math.round(cx + r + (pose === 'eat' ? 1 : 0)), hy = cy + (pose === 'eat' ? 1 : -1);
    bm.rect(hx, hy, 2, 3, P.face);
    bm.set(hx + 1, hy, P.face1);
    bm.set(hx - 1, hy, P.face1);
    if (!lamb) {
      const c = SIDE[side].main, mx = Math.round(cx - 1), my = cy - 2;
      if (side === 0) { bm.rect(mx, my - 1, 1, 3, c); bm.rect(mx - 1, my, 3, 1, c); bm.set(mx, my, SIDE[0].dark); }
      else { bm.rect(mx - 1, my - 1, 3, 3, c); bm.set(mx, my, SIDE[1].dark); }
    }
  });
}

// A Roncal or Barétous shepherd, three-quarter view, crook in hand.
function shepherdSprite(side, frame) {
  return sprite(`shep.${side}.${frame}`, 11, 16, (bm) => {
    const c = SIDE[side];
    bm.ellipse(5, 14, 4, 1.5, P.shadow);
    const s = frame === 1 ? 1 : frame === 2 ? -1 : 0;
    bm.rect(3, 10, 2, 4 + (s > 0 ? 0 : 0), P.cloth1);
    bm.rect(6, 10, 2, 4, P.cloth0);
    bm.set(3 - (s < 0 ? 1 : 0), 14, P.shoe); bm.set(4, 14, P.shoe);
    bm.set(6, 14, P.shoe); bm.set(7 + (s > 0 ? 1 : 0), 14, P.shoe);
    bm.rect(2, 5, 7, 5, P.shirt0);
    bm.rect(2, 5, 1, 5, P.shirt1);
    bm.rect(2, 8, 7, 2, c.main);
    bm.rect(2, 9, 7, 1, c.dark);
    bm.rect(3, 1, 5, 4, P.skin0);
    bm.rect(3, 1, 1, 4, P.skin1);
    bm.set(6, 2, P.black);
    bm.rect(2, 0, 7, 2, P.beret);
    bm.set(5, -1 + 1, P.beret1);
    // Crook.
    bm.rect(9, 2, 1, 13, P.log2);
    bm.set(9, 1, P.log2); bm.set(8, 0, P.log2); bm.set(7, 1, P.log2);
    bm.set(8, 7, P.skin0);
  });
}

function dogSprite(frame) {
  return sprite(`dog.${frame}`, 11, 7, (bm) => {
    bm.ellipse(5, 5, 4, 1.3, P.shadow);
    const k = frame === 1 ? 1 : 0;
    bm.rect(2, 2, 6, 3, P.dog0);
    bm.rect(3, 2, 4, 1, P.dog1);
    bm.rect(6, 3, 2, 2, P.dogw);
    bm.rect(7, 0, 3, 3, P.dog0);
    bm.set(9, 2, P.dogw); bm.set(10, 2, P.dog0);
    bm.set(7, 0, P.dog1);
    bm.set(2 - k, 5, P.dog0); bm.set(4 + k, 5, P.dog0); bm.set(6 - k, 5, P.dogw); bm.set(7 + k, 5, P.dogw);
    bm.set(1, 1 + k, P.dog0); bm.set(0, 0 + k, P.dogw);
  });
}

function wolfSprite(frame) {
  return sprite(`wolf.${frame}`, 14, 8, (bm) => {
    bm.ellipse(6, 6, 5, 1.4, P.shadow);
    const k = frame === 1 ? 1 : 0;
    bm.rect(3, 2, 7, 3, P.wolf1);
    bm.rect(3, 2, 7, 1, P.wolf2);
    bm.rect(4, 4, 5, 1, P.wolf0);
    bm.rect(9, 1, 3, 3, P.wolf1);
    bm.set(12, 2, P.wolf1); bm.set(13, 3, P.black);
    bm.set(9, 0, P.wolf2); bm.set(11, 0, P.wolf2);
    bm.set(10, 2, P.eye);
    for (const [x, o] of [[3, -k], [5, k], [7, -k], [9, k]]) bm.set(x + o, 5, P.wolf2);
    bm.rect(0, 2 + k, 3, 1, P.wolf1); bm.set(0, 3 + k, P.wolf0);
  });
}

function flame(frame) {
  return sprite(`flame.${frame}`, 7, 9, (bm) => {
    const sway = [0, 1, -1][frame];
    bm.ellipse(3, 6, 2.5, 2.2, P.fire2);
    bm.ellipse(3 + sway * 0.5, 4, 1.8, 2.5, P.fire1);
    bm.ellipse(3 + sway, 3, 1, 2, P.fire0);
    bm.set(3 + sway, 0, P.fire1);
    bm.rect(1, 7, 5, 1, P.log3);
  });
}

// ---- fog ---------------------------------------------------------------------------

const fogTile = () => cached('fog', () => {
  const N = 160, cv = document.createElement('canvas');
  cv.width = N; cv.height = N;
  const cx = cv.getContext('2d'), img = cx.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    // Tileable by sampling a torus.
    const a = x / N * Math.PI * 2, b = y / N * Math.PI * 2;
    const n = fbm2(Math.cos(a) * 2 + 5, Math.sin(a) * 2 + Math.cos(b) * 2, 4) * 0.6 + fbm2(Math.sin(b) * 2, Math.cos(a) + 7, 5) * 0.4;
    const i = (y * N + x) * 4;
    img.data[i] = 230; img.data[i + 1] = 234; img.data[i + 2] = 238;
    img.data[i + 3] = Math.max(0, Math.min(255, (n - 0.3) * 520));
  }
  cx.putImageData(img, 0, 0);
  return cv;
});

// ---- per-frame drawing ------------------------------------------------------------------

let layers = null;

// Paint the static layers for a new season (call once when a season starts).
export function prepare(season) {
  layers = { season, ground: cached(`ground.${season.map.w}`, () => paintGround(season)), grass: new GrassLayer(season) };
}

export function drawSeason(ctx, season, time, fx = {}) {
  if (!layers || layers.season !== season) prepare(season);
  layers.grass.update(fx.grassBudget ?? 24);
  ctx.save();
  if (fx.shakeX || fx.shakeY) ctx.translate(Math.round(fx.shakeX ?? 0), Math.round(fx.shakeY ?? 0));
  ctx.drawImage(layers.ground, 0, 0);
  ctx.drawImage(layers.grass.cv, 0, 0);
  drawWater(ctx, season);
  drawGates(ctx, season);
  drawShelterHints(ctx, season, time);
  drawFires(ctx, season, time);
  drawActors(ctx, season, time, fx);
  drawWeather(ctx, season, time);
  drawMarkers(ctx, season, time, fx);
  ctx.restore();
}

function drawWater(ctx, s) {
  for (const sp of s.springs) {
    const f = sp.dry ? 0 : sp.level / sp.cap;
    ctx.fillStyle = sp.dry ? hex(P.dirt2) : hex(P.water4);
    ctx.fillRect(sp.x - 3, sp.y - 2, 7, 5);
    if (!sp.dry) {
      ctx.fillStyle = hex(P.water2);
      const r = Math.max(1, Math.round(f * 3));
      ctx.fillRect(sp.x - r, sp.y - Math.min(2, r), r * 2 + 1, Math.min(2, r) * 2 + 1);
      ctx.fillStyle = hex(P.water0);
      ctx.fillRect(sp.x - 1, sp.y - 1, 1, 1);
    } else {
      ctx.fillStyle = hex(P.dirt3);
      ctx.fillRect(sp.x - 2, sp.y, 5, 1); ctx.fillRect(sp.x, sp.y - 2, 1, 4);
    }
  }
  for (const tr of s.troughs) {
    // A wooden trough; the water is a bar whose length is the level.
    ctx.fillStyle = hex(P.log3);
    ctx.fillRect(tr.x - 7, tr.y - 3, 14, 6);
    ctx.fillStyle = hex(P.log1);
    ctx.fillRect(tr.x - 7, tr.y - 3, 14, 1);
    ctx.fillStyle = hex(P.log4);
    ctx.fillRect(tr.x - 6, tr.y - 1, 12, 3);
    const n = Math.round(tr.water * 12);
    if (n > 0) {
      ctx.fillStyle = hex(P.water2);
      ctx.fillRect(tr.x - 6, tr.y - 1, n, 3);
      ctx.fillStyle = hex(P.water0);
      ctx.fillRect(tr.x - 6, tr.y - 1, n, 1);
    }
    // Whose side it stands on.
    ctx.fillStyle = SIDE[tr.side].css;
    if (tr.side === 0) ctx.fillRect(tr.x - 9, tr.y - 1, 1, 3), ctx.fillRect(tr.x - 10, tr.y, 3, 1);
    else ctx.fillRect(tr.x + 8, tr.y - 1, 3, 3);
  }
}

function drawGates(ctx, s) {
  for (const g of s.gates) {
    if (g.kind === 'pen') {
      ctx.fillStyle = hex(P.log1);
      if (g.open) {
        // Swung open against the fence.
        ctx.fillRect(g.x1, g.y1 - 12, 2, 12);
        ctx.fillStyle = hex(P.log3);
        ctx.fillRect(g.x1 + 2, g.y1 - 12, 1, 12);
      } else {
        ctx.fillRect(g.x1, g.y1 - 1, g.x2 - g.x1, 2);
        ctx.fillStyle = hex(P.log3);
        for (let x = g.x1; x < g.x2; x += 5) ctx.fillRect(x, g.y1 - 2, 1, 4);
        ctx.fillRect(g.x1, g.y1 + 1, g.x2 - g.x1, 1);
      }
    } else if (!g.open) {
      // Shared shelter: barred until the valleys trust each other.
      ctx.fillStyle = hex(P.log2);
      ctx.fillRect(g.x1, g.y1 - 1, g.x2 - g.x1, 2);
      ctx.fillStyle = hex(P.rope ?? P.straw0);
      for (let x = g.x1 + 3; x < g.x2; x += 6) ctx.fillRect(x, g.y1 - 3, 2, 5);
    }
  }
}

// While a storm is coming, ring each shelter and float a roof over it. Each
// valley's own hut is marked in its colour and shape; shared places (open
// once the valleys trust each other) in white.
function drawShelterHints(ctx, s, time) {
  const coming = s.storms.some((st) => st.warned && !st.over);
  if (!coming) return;
  const a = 0.6 + 0.3 * Math.sin(time * Math.PI);
  const S = s.map.sharedShelter;
  const spots = s.map.valleys.map((v, i) => ({ x: v.shelter.x, y: v.shelter.y, r: v.shelter.r, color: s.shelterOpen ? '#f4efe4' : SIDE[i].css, side: s.shelterOpen ? -1 : i }));
  if (s.shelterOpen) spots.push({ x: S.x + S.w / 2, y: S.y + S.h / 2, rect: S, color: '#f4efe4', side: -1 });
  ctx.save();
  ctx.globalAlpha = a;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  for (const sp of spots) {
    ctx.strokeStyle = sp.color;
    ctx.beginPath();
    if (sp.rect) ctx.rect(sp.rect.x - 1, sp.rect.y - 1, sp.rect.w + 2, sp.rect.h + 3);
    else ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  for (const sp of spots) {
    const x = Math.round(sp.x), y = Math.round(sp.y - (sp.r ?? 16) - 10 + Math.sin(time * 2) * 1.5);
    ctx.fillStyle = '#14121a';
    ctx.beginPath(); ctx.moveTo(x - 7, y + 1); ctx.lineTo(x, y - 6); ctx.lineTo(x + 7, y + 1); ctx.closePath(); ctx.fill();
    ctx.fillRect(x - 5, y, 10, 7);
    ctx.fillStyle = sp.color;
    ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x, y - 4); ctx.lineTo(x + 5, y); ctx.closePath(); ctx.fill();
    ctx.fillRect(x - 4, y, 8, 6);
    ctx.fillStyle = '#14121a';
    if (sp.side === 0) { ctx.fillRect(x - 1, y + 1, 2, 4); ctx.fillRect(x - 2, y + 2, 4, 2); }
    else if (sp.side === 1) ctx.fillRect(x - 2, y + 1, 4, 4);
    else ctx.fillRect(x - 1, y + 2, 2, 4);
  }
}

function drawFires(ctx, s, time) {
  for (const f of s.fires) {
    if (!f.lit) continue;
    ctx.drawImage(flame(Math.floor(time * 5 + f.x) % 3), Math.round(f.x) - 3, Math.round(f.y) - 7);
  }
}

function drawActors(ctx, s, time, fx) {
  const list = [];
  for (const sh of s.sheep) list.push({ y: sh.y, kind: 'sheep', o: sh });
  for (const d of s.dogs) list.push({ y: d.y, kind: 'dog', o: d });
  for (const p of s.shepherds) if (!fx.hide?.[p.side]) list.push({ y: p.y, kind: 'shep', o: p });
  for (const w of s.wolves) list.push({ y: w.y, kind: 'wolf', o: w });
  if (s.lamb && s.lamb.state === 'lost') list.push({ y: s.lamb.y, kind: 'lamb', o: s.lamb });
  list.sort((a, b) => a.y - b.y);
  for (const it of list) {
    const o = it.o;
    if (it.kind === 'sheep') {
      const sp = Math.hypot(o.vx, o.vy);
      const pose = o.eating ? 'eat' : sp > 6 ? (Math.floor(time * 8 + o.id) % 2 ? 'walk1' : 'stand') : 'stand';
      const img = sheepSprite(o.side, pose, o.lamb, Math.min(o.food, o.water) < 0.15);
      drawFlip(ctx, img, o.x - 5, o.y - 6 + (o.fleeing && Math.floor(time * 10 + o.id) % 2 ? -1 : 0), o.vx < -0.5);
    } else if (it.kind === 'dog') {
      const moving = Math.hypot(o.vx, o.vy) > 5;
      drawFlip(ctx, dogSprite(moving ? Math.floor(time * 10) % 2 : 0), o.x - 5, o.y - 5, o.vx < -1 || (!moving && s.shepherds[o.owner].fx < 0));
    } else if (it.kind === 'wolf') {
      drawFlip(ctx, wolfSprite(Math.floor(time * 8) % 2), o.x - 7, o.y - 6, o.vx < 0);
    } else if (it.kind === 'lamb') {
      drawFlip(ctx, sheepSprite(o.side, 'stand', true), o.x - 5, o.y - 6, false);
    } else {
      const frame = o.moving ? 1 + (Math.floor(time * 6) % 2) : 0;
      drawFlip(ctx, shepherdSprite(o.side, frame), o.x - 5, o.y - 14, o.fx < -0.1);
      if (o.carrying) drawFlip(ctx, sheepSprite(o.carrying.side, 'stand', true), o.x - 5, o.y - 19, o.fx < -0.1);
      drawTag(ctx, o, time);
      if (o.bellT > 0) drawBell(ctx, o, time);
    }
  }
}

function drawFlip(ctx, img, x, y, flip) {
  x = Math.round(x); y = Math.round(y);
  if (!flip) { ctx.drawImage(img, x, y); return; }
  ctx.save();
  ctx.translate(x + img.width, y);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

// The player tag above each shepherd: a circle for Roncal, a square for Barétous.
function drawTag(ctx, o, time) {
  const x = Math.round(o.x), y = Math.round(o.y) - 21 - (o.carrying ? 4 : 0) + (Math.sin(time * 2) > 0.6 ? -1 : 0);
  ctx.fillStyle = '#14121a';
  if (o.side === 0) {
    ctx.fillRect(x - 2, y - 3, 5, 7); ctx.fillRect(x - 3, y - 2, 7, 5);
    ctx.fillStyle = SIDE[0].css;
    ctx.fillRect(x - 1, y - 2, 3, 5); ctx.fillRect(x - 2, y - 1, 5, 3);
  } else {
    ctx.fillRect(x - 3, y - 3, 7, 7);
    ctx.fillStyle = SIDE[1].css;
    ctx.fillRect(x - 2, y - 2, 5, 5);
  }
}

function drawBell(ctx, o, time) {
  // A bell and two widening arcs while it rings.
  const x = Math.round(o.x) + 6, y = Math.round(o.y) - 10;
  ctx.fillStyle = '#f0e442';
  ctx.fillRect(x, y, 3, 3); ctx.fillRect(x - 1, y + 2, 5, 1); ctx.fillRect(x + 1, y - 1, 1, 1);
  const k = (time * 1.5) % 1;
  ctx.strokeStyle = `rgba(240,228,66,${(1 - k) * 0.8})`;
  ctx.beginPath();
  ctx.arc(x + 1.5, y + 1.5, 4 + k * 8, -0.7, 0.7);
  ctx.stroke();
}

function drawWeather(ctx, s, time) {
  const Wt = s.weather;
  if (Wt.night > 0) {
    // Darkness with pools of light round lanterns and fires.
    const shade = cached('nightShade', () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; });
    const sc = shade.getContext('2d');
    sc.globalCompositeOperation = 'source-over';
    sc.clearRect(0, 0, W, H);
    sc.fillStyle = `rgba(12,16,44,${0.55 * Wt.night})`;
    sc.fillRect(0, 0, W, H);
    sc.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r) => {
      const g = sc.createRadialGradient(x, y, r * 0.3, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      sc.fillStyle = g;
      sc.fillRect(x - r, y - r, r * 2, r * 2);
    };
    for (const p of s.shepherds) hole(p.x, p.y - 4, 44);
    for (const f of s.fires) if (f.lit) hole(f.x, f.y, 70 + Math.sin(time * 3 + f.x) * 2);
    ctx.drawImage(shade, 0, 0);
    // Wolves' eyes catch the light.
    ctx.fillStyle = '#f0e442';
    for (const w of s.wolves) { const dir = w.vx < 0 ? -1 : 1; ctx.fillRect(Math.round(w.x + dir * 3), Math.round(w.y - 5), 1, 1); ctx.fillRect(Math.round(w.x + dir * 5), Math.round(w.y - 5), 1, 1); }
    // Fires glow warm.
    for (const f of s.fires) {
      if (!f.lit) continue;
      const g = ctx.createRadialGradient(f.x, f.y, 2, f.x, f.y, 26);
      g.addColorStop(0, 'rgba(255,194,74,0.35)'); g.addColorStop(1, 'rgba(255,194,74,0)');
      ctx.fillStyle = g;
      ctx.fillRect(f.x - 26, f.y - 26, 52, 52);
    }
  }
  if (Wt.storm > 0) {
    ctx.fillStyle = `rgba(30,36,56,${0.35 * Wt.storm})`;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = `rgba(200,215,235,${0.55 * Wt.storm})`;
    ctx.beginPath();
    const n = Math.round(140 * Wt.storm);
    for (let i = 0; i < n; i++) {
      const x = (hash2(i, 3) * (W + 60) + time * 90) % (W + 60) - 30, y = (hash2(3, i) * H + time * 260 + i * 7) % H;
      ctx.moveTo(Math.round(x), Math.round(y)); ctx.lineTo(Math.round(x + 3), Math.round(y + 7));
    }
    ctx.stroke();
  }
  if (Wt.fog > 0) {
    const tile = fogTile(), N = tile.width;
    ctx.save();
    ctx.globalAlpha = 0.8 * Wt.fog;
    for (const [sp, off] of [[6, 0], [-4, 80]]) {
      const ox = ((time * sp + off) % N + N) % N;
      for (let y = -N; y < H + N; y += N) for (let x = -N; x < W + N; x += N) ctx.drawImage(tile, Math.round(x + ox), Math.round(y + off / 2));
    }
    ctx.restore();
  }
  if (Wt.snow) {
    ctx.fillStyle = '#f7fafc';
    for (let i = 0; i < 90; i++) {
      const x = (hash2(i, 1) * W + Math.sin(time + i) * 6 + time * 6) % W, y = (hash2(1, i) * H + time * (14 + (i % 5) * 4)) % H;
      ctx.fillRect(Math.round(x), Math.round(y), i % 7 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1);
    }
  }
}

// Pointers for things that need finding: the lost lamb always, and on Easy
// an arrow from each shepherd to the nearest sheep of theirs that strayed.
function drawMarkers(ctx, s, time, fx) {
  const L = s.lamb;
  if (L && L.state === 'lost') ring(ctx, L.x, L.y - 2, 7 + Math.sin(time * 2) * 1.5, '#f4efe4');
  if (!s.diff.arrows) return;
  for (const p of s.shepherds) {
    if (fx.noArrows?.[p.side]) continue;
    let best = null, bd = Infinity;
    for (const sh of s.sheep) {
      if (sh.side !== p.side || !sh.stray) continue;
      const d = Math.hypot(sh.x - p.x, sh.y - p.y);
      if (d < bd) { bd = d; best = sh; }
    }
    if (!best || bd < 24) continue;
    ring(ctx, best.x, best.y - 2, 6, SIDE[p.side].css);
    const a = Math.atan2(best.y - p.y, best.x - p.x), r = 14;
    const x = p.x + Math.cos(a) * r, y = p.y - 5 + Math.sin(a) * r;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(a);
    ctx.fillStyle = '#14121a';
    ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-3, -4); ctx.lineTo(-3, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = SIDE[p.side].css;
    ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-2, -3); ctx.lineTo(-2, 3); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

function ring(ctx, x, y, r, color) {
  ctx.strokeStyle = color;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.arc(Math.round(x), Math.round(y), r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}
