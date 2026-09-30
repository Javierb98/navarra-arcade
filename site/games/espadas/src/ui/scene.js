// The side-on battlefield above the grid, in the manner of 1066: silhouette
// companies with coloured shields and banners on layered ground, under a
// dusk sky. It draws the same display units the grid does, so every step,
// clash and rout the playback animates shows up here too.
//
// Grid column -> horizontal position. Grid row -> depth (row 0 is farthest).
// Terrain height lifts the ground line, so slopes read as hillsides.

import { makeRng } from '../core/rng.js';

const SIL = '#17120d';

export class Scene {
  // grid: { w, h, at(x, y) -> {height, forest} }
  constructor(grid, { width = 1200, height = 380, seed = 778, sky = 'dusk', horizon = 0.36 } = {}) {
    this.grid = grid;
    this.W = width;
    this.H = height;
    this.seed = seed;
    this.sky = sky;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'scene';
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.aspectRatio = `${width} / ${height}`;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);
    this.horizon = height * horizon;
    this.bottom = height * 0.97;
    this.label = null;
    // Figure scale: bigger when there are few columns to share the width.
    this.figure = Math.max(1.2, Math.min(2.4, 52 / grid.w));
    this.backdrop = this.paintBackdrop();
    this.ground = this.paintGround();
    this.grunge = this.paintGrunge();
    this.ink = SIL;
  }

  // ---- geometry ----------------------------------------------------------

  colX(x) { return ((x + 0.5) / this.grid.w) * this.W; }
  depth(row) { return this.grid.h === 1 ? 1 : Math.max(-0.3, Math.min(1.2, row / (this.grid.h - 1))); }
  scaleAt(row) { return 0.8 + 0.2 * this.depth(row); }
  baseY(row) { return this.horizon + 64 + (this.bottom - this.horizon - 100) * this.depth(row); }
  lift(row) { return 16 + 18 * this.depth(row); }

  // Ground line of a row at fractional column x (smoothstep between cells).
  groundY(row, x) {
    const r = Math.max(0, Math.min(this.grid.h - 1, Math.round(row)));
    const cx = Math.max(0, Math.min(this.grid.w - 1, x));
    const i = Math.floor(cx);
    const j = Math.min(this.grid.w - 1, i + 1);
    const f = cx - i;
    const s = f * f * (3 - 2 * f);
    const h = this.grid.at(i, r).height * (1 - s) + this.grid.at(j, r).height * s;
    // Rows between integers (a unit walking across) blend two lines.
    const base = this.baseY(row);
    return base - h * this.lift(r);
  }

  // ---- static layers -----------------------------------------------------
  //
  // Painted once: a dusk sky with light rays and misty ranges, one continuous
  // ground plane under a soft ridge (hills are mounds on it, not stripes),
  // and a grain-and-vignette overlay laid over everything at the end.

  get haze() { return this.sky === 'grey' ? [170, 170, 160] : [186, 162, 118]; }

  // Silhouette ink at a given depth: far figures fade toward the haze, as
  // in 1066's scenes; the nearest are solid black.
  inkAt(depth, base = [23, 18, 13]) {
    const t = Math.max(0, Math.min(1, 1 - depth)) * 0.6;
    const c = base.map((b, i) => Math.round(b + (this.haze[i] - b) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  tint(hex, depth) {
    const n = parseInt(hex.slice(1), 16);
    return this.inkAt(depth + 0.35, [(n >> 16) & 255, (n >> 8) & 255, n & 255]);
  }

  paintBackdrop() {
    if (this.sky === 'none') return null;
    const off = document.createElement('canvas');
    off.width = this.W; off.height = this.H;
    const g = off.getContext('2d');
    const rng = makeRng(this.seed);
    const grey = this.sky === 'grey';
    const sky = g.createLinearGradient(0, 0, 0, this.horizon + 40);
    if (grey) { sky.addColorStop(0, '#8f9594'); sky.addColorStop(1, '#e2e0d8'); }
    else { sky.addColorStop(0, '#d9892b'); sky.addColorStop(0.45, '#eeb44a'); sky.addColorStop(1, '#f7df9f'); }
    g.fillStyle = sky;
    g.fillRect(0, 0, this.W, this.H);

    // Sun, and rays fanning down from it.
    const sx = this.W * 0.7, sy = this.horizon * 0.45;
    const sun = g.createRadialGradient(sx, sy, 4, sx, sy, this.W * 0.45);
    sun.addColorStop(0, 'rgba(255,250,225,0.9)'); sun.addColorStop(0.25, 'rgba(255,240,200,0.35)'); sun.addColorStop(1, 'rgba(255,235,190,0)');
    g.fillStyle = sun;
    g.fillRect(0, 0, this.W, this.H);
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.25 + 0.5 * rng.next());
      const w = 0.03 + rng.next() * 0.05;
      g.fillStyle = `rgba(255,236,190,${0.04 + rng.next() * 0.05})`;
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(sx + Math.cos(a - w) * this.W, sy + Math.sin(a - w) * this.W);
      g.lineTo(sx + Math.cos(a + w) * this.W, sy + Math.sin(a + w) * this.W);
      g.fill();
    }
    g.restore();
    // Wisps of cloud.
    for (let i = 0; i < 9; i++) {
      g.fillStyle = grey ? 'rgba(255,255,255,0.10)' : 'rgba(255,245,215,0.12)';
      g.beginPath();
      g.ellipse(rng.next() * this.W, this.horizon * (0.15 + rng.next() * 0.5), 80 + rng.next() * 160, 4 + rng.next() * 7, 0, 0, Math.PI * 2);
      g.fill();
    }
    // Misty ranges, softened by stacking translucent copies.
    const ranges = [
      { y: this.horizon - 62, amp: 55, a: 0.32 },
      { y: this.horizon - 34, amp: 40, a: 0.42 },
      { y: this.horizon - 10, amp: 26, a: 0.55 },
    ];
    for (const [ri, r] of ranges.entries()) {
      const pts = [];
      let x = -40;
      while (x < this.W + 60) {
        pts.push([x, r.y - (rng.chance(0.45) ? r.amp * (0.6 + rng.next() * 0.5) : r.amp * rng.next() * 0.4)]);
        x += 40 + rng.next() * 70;
      }
      const tone = grey ? [120 - ri * 15, 125 - ri * 15, 120 - ri * 15] : [150 - ri * 22, 146 - ri * 20, 118 - ri * 18];
      for (let k = 0; k < 3; k++) {
        g.fillStyle = `rgba(${tone.join(',')},${r.a / 2})`;
        g.beginPath();
        g.moveTo(-40, this.H);
        for (const [px, py] of pts) g.lineTo(px + (k - 1) * 2, py + k * 2);
        g.lineTo(this.W + 60, this.H);
        g.fill();
      }
    }
    // Great trees on the ridge behind the field, hazy with distance.
    const big = [0.08, 0.42, 0.9].map((f) => f + (rng.next() - 0.5) * 0.06);
    for (const f of big) this.oak(g, f * this.W, this.horizon + 22, Math.min(1.5, this.horizon / 70) * (0.9 + rng.next() * 0.3), this.inkAt(0.45, [34, 32, 26]), rng);
    for (let i = 0; i < 16; i++) this.tree(g, rng.next() * this.W, this.horizon + 10, 0.35 + rng.next() * 0.3, this.inkAt(-0.2, [70, 74, 58]), rng);
    return off;
  }

  // A broad oak: trunk, forked limbs, a heavy crown of overlapping lobes.
  oak(g, x, y, s, colour, rng) {
    g.fillStyle = colour;
    g.strokeStyle = colour;
    g.lineCap = 'round';
    g.lineWidth = 7 * s;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 3 * s, y - 30 * s, x - 2 * s, y - 52 * s); g.stroke();
    g.lineWidth = 3.5 * s;
    for (const [dx, dy] of [[-26, -58], [24, -62], [-8, -72], [14, -48]]) {
      g.beginPath(); g.moveTo(x, y - 34 * s); g.quadraticCurveTo(x + dx * 0.4 * s, y - 50 * s, x + dx * s, y + dy * s); g.stroke();
    }
    for (let i = 0; i < 16; i++) {
      const a = rng.next() * Math.PI * 2;
      const rr = (12 + rng.next() * 14) * s;
      g.beginPath();
      g.arc(x + Math.cos(a) * 30 * s, y - 70 * s + Math.sin(a) * 16 * s, rr, 0, Math.PI * 2);
      g.fill();
    }
  }

  paintGround() {
    const off = document.createElement('canvas');
    off.width = this.W; off.height = this.H;
    const g = off.getContext('2d');
    const rng = makeRng(this.seed + 1);
    const colW = this.W / this.grid.w;
    const top = this.horizon + 14;
    const [hr, hg, hb] = this.haze;
    const grad = g.createLinearGradient(0, top - 10, 0, this.H);
    // Lighter, hazy earth near the ridge so the black figures stand out
    // against it, darkening toward the foreground.
    grad.addColorStop(0, `rgb(${Math.round(hr * 0.72)},${Math.round(hg * 0.64)},${Math.round(hb * 0.54)})`);
    grad.addColorStop(0.32, '#5a4631');
    grad.addColorStop(0.7, '#261c13');
    grad.addColorStop(1, '#16110c');
    // One ground plane under a gently rolling ridge.
    const ridge = (px) => top + 18 - Math.sin((px / this.W) * Math.PI * 0.9 + 0.3) * 22 + Math.sin(px / 67 + 1.3) * 2.2;
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, this.H);
    for (let px = 0; px <= this.W; px += 6) g.lineTo(px, ridge(px));
    g.lineTo(this.W, this.H);
    g.fill();
    // Grass along the ridge.
    g.strokeStyle = this.inkAt(0.05, [60, 52, 36]);
    g.lineWidth = 1;
    for (let px = 0; px < this.W; px += 3) {
      if (!rng.chance(0.5)) continue;
      const y = ridge(px);
      g.beginPath(); g.moveTo(px, y + 1); g.lineTo(px + (rng.next() - 0.5) * 3, y - 2 - rng.next() * 4); g.stroke();
    }

    // Hills: every row's lifted ground as a mound on the same plane, drawn
    // back to front, so heights read as hillsides rather than stripes.
    for (let r = 0; r < this.grid.h; r++) {
      let lifted = false;
      for (let x = 0; x < this.grid.w; x++) if (this.grid.at(x, r).height > 0) lifted = true;
      if (!lifted) continue;
      const d = this.depth(r);
      const base = this.baseY(r) + 14;
      g.save();
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, base);
      for (let px = 0; px <= this.W; px += 4) {
        const y = Math.min(base, this.groundY(r, (px / this.W) * this.grid.w - 0.5) + 3);
        g.lineTo(px, y);
      }
      g.lineTo(this.W, base);
      g.closePath();
      g.fill();
      // A lighter, hazier top to the mound, and a soft shadowed flank.
      g.clip();
      const shade = g.createLinearGradient(0, base - this.lift(r) * 2.2, 0, base);
      shade.addColorStop(0, `rgba(${hr},${hg},${hb},${0.18 * (1.1 - d)})`);
      shade.addColorStop(1, 'rgba(0,0,0,0.12)');
      g.fillStyle = shade;
      g.fillRect(0, base - this.lift(r) * 3, this.W, this.lift(r) * 3);
      g.restore();
    }

    this.paintWater(g);

    // Terrain props at their depth: woods, rocks, stakes and tents.
    for (let r = 0; r < this.grid.h; r++) {
      const d = this.depth(r);
      const s = this.scaleAt(r);
      const prop = this.inkAt(d * 0.55, [42, 46, 33]);
      for (let x = 0; x < this.grid.w; x++) {
        const t = this.grid.at(x, r);
        const cx = this.colX(x);
        if (t.forest && rng.chance(0.55)) {
          const bx = cx + (rng.next() - 0.5) * colW * 0.8;
          g.globalAlpha = 0.8;
          this.tree(g, bx, this.groundY(r, (bx / this.W) * this.grid.w - 0.5) - 5 * s, s * (0.55 + rng.next() * 0.25), prop, rng);
          g.globalAlpha = 1;
        }
        if (t.height >= 2 && !t.forest && rng.chance(0.7)) {
          const bx = cx + (rng.next() - 0.5) * colW * 0.7, by = this.groundY(r, x) - 3 * s;
          const w = (6 + rng.next() * 9) * s, hgt = (5 + rng.next() * 8) * s;
          g.fillStyle = this.inkAt(d * 0.4 + 0.2, [70, 64, 52]);
          g.beginPath();
          g.moveTo(bx - w, by + 2); g.lineTo(bx - w * 0.3, by - hgt); g.lineTo(bx + w * 0.2, by - hgt * 0.7); g.lineTo(bx + w, by + 2);
          g.fill();
        }
        if (t.key === 'cave') {
          // The mouth of the cave in the rock face.
          const by = this.groundY(r, x) - 2 * s;
          g.fillStyle = this.inkAt(d * 0.5 + 0.2, [70, 64, 52]);
          g.beginPath(); g.moveTo(cx - colW * 0.6, by + 2); g.lineTo(cx - colW * 0.4, by - 34 * s); g.lineTo(cx + colW * 0.1, by - 44 * s); g.lineTo(cx + colW * 0.55, by - 30 * s); g.lineTo(cx + colW * 0.6, by + 2); g.fill();
          g.fillStyle = '#0b0907';
          g.beginPath(); g.moveTo(cx - 9 * s, by + 1); g.lineTo(cx - 9 * s, by - 14 * s); g.quadraticCurveTo(cx, by - 26 * s, cx + 9 * s, by - 14 * s); g.lineTo(cx + 9 * s, by + 1); g.fill();
        }
        if (t.key === 'palisade') {
          const by = this.groundY(r, x) - 4 * s;
          g.fillStyle = this.inkAt(d * 0.8, [50, 38, 26]);
          for (let k = 0; k < 6; k++) {
            const px = cx - colW * 0.45 + k * colW * 0.18;
            g.beginPath(); g.moveTo(px - 2.5 * s, by + 3); g.lineTo(px, by - 20 * s); g.lineTo(px + 2.5 * s, by + 3); g.fill();
          }
        }
        if (t.key === 'camp' && rng.chance(0.6)) {
          const by = this.groundY(r, x) - 6 * s;
          const w = 24 * s, hgt = 26 * s;
          g.fillStyle = this.inkAt(d * 0.7, [60, 40, 30]);
          g.beginPath(); g.moveTo(cx - w, by); g.quadraticCurveTo(cx - w * 0.3, by - hgt * 0.6, cx, by - hgt); g.quadraticCurveTo(cx + w * 0.3, by - hgt * 0.6, cx + w, by); g.fill();
          g.strokeStyle = g.fillStyle; g.lineWidth = 2 * s;
          g.beginPath(); g.moveTo(cx, by - hgt); g.lineTo(cx, by - hgt - 10 * s); g.stroke();
        }
      }
    }
    // Earth texture: specks and clods, denser near the front.
    for (let i = 0; i < 1400; i++) {
      const px = rng.next() * this.W;
      const py = top + Math.pow(rng.next(), 0.7) * (this.H - top);
      g.fillStyle = rng.chance(0.7) ? `rgba(0,0,0,${0.08 + rng.next() * 0.14})` : `rgba(255,235,200,${0.03 + rng.next() * 0.04})`;
      g.fillRect(px, py, 1 + rng.next() * 2.2, 1 + rng.next() * 1.6);
    }
    return off;
  }

  // Rivers: every water square is joined to its water neighbours, so a line
  // of squares reads as one river winding across the field, not a row of
  // puddles. Bridges are stone arches spanning it.
  paintWater(g) {
    const grid = this.grid;
    // Scene grids (menus, minigames) are minimal: bounds are checked here.
    const isWater = (x, r) => x >= 0 && r >= 0 && x < grid.w && r < grid.h && ['river', 'ford', 'bridge'].includes(grid.at(x, r)?.key);
    const cells = [];
    for (let r = 0; r < grid.h; r++) for (let x = 0; x < grid.w; x++) if (isWater(x, r)) cells.push({ x, r });
    if (!cells.length) return;
    const colW = this.W / grid.w;
    const at = (x, r) => ({ px: this.colX(x), py: this.groundY(r, x) + 2 * this.scaleAt(r), hw: colW * 0.34 * (0.6 + 0.4 * this.scaleAt(r)) });
    // Paint opaque on a layer, then lay it down once, so overlaps don't darken.
    const off = document.createElement('canvas');
    off.width = this.W; off.height = this.H;
    const w = off.getContext('2d');
    // Dark river water, only a little hazed with distance.
    const water = (r) => this.inkAt(0.55 + this.depth(r) * 0.45, [58, 82, 98]);
    const band = (a, b, colour, grow = 1) => {
      w.fillStyle = colour;
      w.beginPath();
      w.moveTo(a.px - a.hw * grow, a.py); w.lineTo(a.px + a.hw * grow, a.py);
      w.lineTo(b.px + b.hw * grow, b.py); w.lineTo(b.px - b.hw * grow, b.py);
      w.closePath(); w.fill();
    };
    // A river crossing the whole field runs off both ends.
    for (const { x, r } of cells) {
      const a = at(x, r);
      w.fillStyle = water(r);
      w.beginPath(); w.ellipse(a.px, a.py, a.hw, 5 * this.scaleAt(r), 0, 0, Math.PI * 2); w.fill();
      if (isWater(x, r + 1)) band(a, at(x, r + 1), water(r));
      if (isWater(x + 1, r)) { const b = at(x + 1, r); w.fillStyle = water(r); w.fillRect(a.px, a.py - 5 * this.scaleAt(r), b.px - a.px, 10 * this.scaleAt(r)); }
      if (r === 0) band({ ...a, py: a.py - 30 }, a, water(r), 0.8);
      if (r === grid.h - 1) band(a, { ...a, py: this.H + 10, hw: a.hw * 1.3 }, water(r));
    }
    // Pale ripples along the stream.
    w.strokeStyle = 'rgba(200,215,220,0.3)'; w.lineWidth = 1.2;
    for (const { x, r } of cells) {
      const a = at(x, r);
      for (let k = -1; k <= 1; k++) { w.beginPath(); w.moveTo(a.px + k * a.hw * 0.5 - 6, a.py + k * 2); w.lineTo(a.px + k * a.hw * 0.5 + 6, a.py + k * 2); w.stroke(); }
    }
    g.save(); g.globalAlpha = 0.9; g.drawImage(off, 0, 0, this.W, this.H); g.restore();
    // Bridges: a stone arch with a deck and parapet over the water.
    for (const { x, r } of cells) {
      if (grid.at(x, r).key !== 'bridge') continue;
      const a = at(x, r);
      const s = this.scaleAt(r) * this.figure;
      const half = colW * 0.75, deck = a.py - 3 * s;
      g.fillStyle = this.inkAt(this.depth(r) * 0.7, [96, 84, 66]);
      g.beginPath();
      g.moveTo(a.px - half, deck + 6 * s); g.lineTo(a.px - half, deck); g.lineTo(a.px + half, deck); g.lineTo(a.px + half, deck + 6 * s);
      g.lineTo(a.px + half * 0.55, deck + 6 * s);
      g.quadraticCurveTo(a.px, deck - 1 * s, a.px - half * 0.55, deck + 6 * s);
      g.closePath(); g.fill();
      g.fillStyle = this.inkAt(this.depth(r) * 0.7, [70, 60, 46]);
      g.fillRect(a.px - half, deck - 2.5 * s, half * 2, 2.5 * s);
      for (let k = -half; k <= half; k += half / 3) g.fillRect(a.px + k - 0.8 * s, deck - 5 * s, 1.6 * s, 3 * s);
    }
  }

  // Film grain, a few scratches and a vignette: the painted-print finish.
  paintGrunge() {
    const off = document.createElement('canvas');
    off.width = this.W; off.height = this.H;
    const g = off.getContext('2d');
    const rng = makeRng(this.seed + 7);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = rng.chance(0.6) ? `rgba(20,12,4,${0.05 + rng.next() * 0.08})` : `rgba(255,245,220,${0.03 + rng.next() * 0.05})`;
      g.fillRect(rng.next() * this.W, rng.next() * this.H, 1 + rng.next() * 1.5, 1 + rng.next() * 1.5);
    }
    g.strokeStyle = 'rgba(255,240,210,0.05)';
    for (let i = 0; i < 18; i++) {
      const x = rng.next() * this.W, y = rng.next() * this.H;
      g.lineWidth = 0.6 + rng.next();
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rng.next() - 0.5) * 60, y + rng.next() * 90); g.stroke();
    }
    for (let i = 0; i < 12; i++) {
      g.fillStyle = `rgba(40,25,10,${0.03 + rng.next() * 0.04})`;
      g.beginPath(); g.arc(rng.next() * this.W, rng.next() * this.H, 20 + rng.next() * 70, 0, Math.PI * 2); g.fill();
    }
    const v = g.createRadialGradient(this.W / 2, this.H * 0.45, this.H * 0.35, this.W / 2, this.H * 0.45, this.W * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(10,6,2,0.45)');
    g.fillStyle = v;
    g.fillRect(0, 0, this.W, this.H);
    return off;
  }

  // Beech silhouette: trunk and a broad, lumpy crown.
  tree(g, x, y, s, colour, rng) {
    g.fillStyle = colour;
    g.strokeStyle = colour;
    g.lineWidth = 3 * s;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 2 * s, y - 34 * s); g.stroke();
    g.lineWidth = 1.5 * s;
    g.beginPath(); g.moveTo(x + s, y - 22 * s); g.lineTo(x - 10 * s, y - 36 * s); g.stroke();
    g.beginPath(); g.moveTo(x + 2 * s, y - 26 * s); g.lineTo(x + 12 * s, y - 38 * s); g.stroke();
    for (let i = 0; i < 7; i++) {
      const a = rng.next() * Math.PI * 2;
      const rr = (8 + rng.next() * 9) * s;
      g.beginPath();
      g.arc(x + Math.cos(a) * 13 * s, y - 42 * s + Math.sin(a) * 8 * s, rr, 0, Math.PI * 2);
      g.fill();
    }
  }

  // ---- per frame ---------------------------------------------------------
  //
  // Each company is drawn as a crowd. Every soldier keeps its own position
  // and follows its place in the formation with a little lag, so a company
  // moves like people, not like a sprite; legs swing by distance walked so
  // feet do not slide; casualties fall and stay on the ground for a while.

  draw(units, fx, now) {
    const g = this.ctx;
    const dt = Math.min(0.05, Math.max(0, (now - (this.lastNow ?? now)) / 1000));
    this.lastNow = now;
    g.clearRect(0, 0, this.W, this.H);
    if (this.backdrop) g.drawImage(this.backdrop, 0, 0, this.W, this.H);
    g.drawImage(this.ground, 0, 0, this.W, this.H);

    const live = [...units.values()].filter((u) => !u.gone && !(u.side !== 'player' && u.hidden));
    for (const u of live) this.stepCrowd(u, now, dt);
    // Companies that have left the board keep their fallen until they fade.
    for (const [id, c] of this.crowds) {
      if (live.some((u) => u.id === id)) continue;
      if (c.u.status === 'fled' || c.u.status === 'escaped' || c.u.status === 'left') { this.crowds.delete(id); continue; }
      for (const f of c.figs) if (!f.fallT) f.fallT = now;
      if (c.figs.every((f) => now - f.fallT > this.bodyMs)) this.crowds.delete(id);
    }

    for (let r = 0; r < this.grid.h; r++) {
      // Dropped arms and the fallen first, so the living stand over them.
      this.drawDrops(r, now);
      for (const [, c] of this.crowds) if (this.rowOf(c.row) === r) this.drawFallen(c, now);
      for (const u of live) if (this.rowOf(u.y) === r) this.drawCompany(u, now);
    }
    for (const f of fx) this.drawFx(f, units, now);
    if (this.backdrop) g.drawImage(this.grunge, 0, 0, this.W, this.H);
    if (this.label) this.drawLabel(this.label);
  }

  // The phase tab, after 1066's: a coloured tab with a round "!" badge.
  drawLabel({ text, colour }) {
    const g = this.ctx;
    g.save();
    g.font = '600 18px Optima, "Palatino Linotype", Palatino, serif';
    const w = g.measureText(text).width + 62;
    g.fillStyle = colour ?? '#2f6b3c';
    g.beginPath(); g.moveTo(0, 12); g.lineTo(w, 12); g.lineTo(w + 10, 30); g.lineTo(w, 48); g.lineTo(0, 48); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 44, w + 4, 4);
    g.fillStyle = '#fbf3de';
    g.beginPath(); g.arc(24, 30, 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = colour ?? '#2f6b3c';
    g.font = '800 15px Optima, serif'; g.textAlign = 'center'; g.fillText('!', 24, 36);
    g.fillStyle = '#fbf3de'; g.textAlign = 'left';
    g.font = '600 18px Optima, "Palatino Linotype", Palatino, serif';
    g.fillText(text, 44, 36);
    g.restore();
  }

  get crowds() { return (this._crowds ??= new Map()); }
  get bodyMs() { return 5000; }

  crowdOf(u) {
    let c = this.crowds.get(u.id);
    if (c && c.type === u.type) return c;
    const total = { infantry: 8, skirmisher: 6, ranged: 6, cavalry: 3, leader: 3, wagon: 1 }[u.role] ?? 6;
    const rng = makeRng(hash(u.id));
    const colW = this.W / this.grid.w;
    const figs = [];
    for (let i = 0; i < total; i++) {
      // Two ranks, the rear standing in the gaps of the front so every
      // head, shield and spear can be told apart.
      const rank = i % 2;
      const perRank = Math.ceil(total / 2);
      const slot = Math.floor(i / 2) + (rank ? 0.5 : 0);
      const dx = ((slot / Math.max(1, perRank - 0.5)) - 0.5) * colW * 0.95 + (rng.next() - 0.5) * 2.5;
      figs.push({
        i, dx, rank,
        dy: rank ? -5 : 1.5 + (rng.next() - 0.5) * 1.5,
        x: this.colX(u.x) + dx,
        phase: rng.next() * Math.PI * 2,
        lag: 7 + rng.next() * 6,        // spring stiffness: how tightly it follows
        size: 0.92 + rng.next() * 0.16,
        speed: 0,
        fallT: 0,
        fallDir: rng.chance(0.5) ? 1 : -1,
      });
    }
    c = { figs, total, type: u.type, hp: u.hp, hitT: -1e9, row: u.y, side: u.side, u };
    this.crowds.set(u.id, c);
    return c;
  }

  // Put a company's soldiers straight into place, with no walk-in.
  snap(u) {
    const c = this.crowdOf(u);
    const ax = this.colX(u.x);
    for (const f of c.figs) { f.x = ax + f.dx; f.speed = 0; }
  }

  rowOf(y) { return Math.max(0, Math.min(this.grid.h - 1, Math.round(y))); }

  stepCrowd(u, now, dt) {
    const c = this.crowdOf(u);
    c.u = u;
    if (u.status === 'routing' && !c.routedAt) {
      // The moment a company breaks, its men throw down their arms.
      c.routedAt = now;
      const look = u.look ?? {};
      for (const f of c.figs) {
        if (f.fallT) continue;
        (this.drops ??= []).push({
          x: f.x + (Math.random() - 0.5) * 6, row: u.y, dy: f.dy, t0: now,
          colour: u.color, shield: look.shield, spear: u.role !== 'wagon', ang: (Math.random() - 0.5) * 0.5,
        });
      }
    } else if (u.status !== 'routing') c.routedAt = 0;
    c.row = u.y;
    if (u.hp < c.hp) c.hitT = now;
    c.hp = u.hp;
    const alive = u.role === 'wagon' ? 1 : Math.max(0, Math.ceil(c.total * (u.hp / u.maxHp)));
    // Casualties drop where they stand: from the back rank of the flanks first.
    const standing = c.figs.filter((f) => !f.fallT);
    for (let k = standing.length - 1; k >= alive && k >= 0; k--) standing[k].fallT = now;
    const ax = this.colX(u.x + (u.ox ?? 0));
    const s = this.scaleAt(u.y) * this.figure;
    const stride = 15 * s;
    const wantFace = u.facing ?? 1;
    for (const f of c.figs) {
      if (f.fallT) continue;
      f.face = (f.face ?? wantFace) + (wantFace - (f.face ?? wantFace)) * Math.min(1, dt * 9);
      const tx = ax + f.dx;
      const k = 1 - Math.exp(-dt * f.lag);
      const nx = f.x + (tx - f.x) * k;
      const moved = Math.abs(nx - f.x);
      f.x = nx;
      const v = dt > 0 ? moved / dt : 0;
      f.speed += (v - f.speed) * Math.min(1, dt * 10);
      f.phase += (moved / stride) * Math.PI;
      if (u.status === 'routing') f.phase += dt * 3;
    }
  }

  drawCompany(u, now) {
    const g = this.ctx;
    const c = this.crowdOf(u);
    const row = u.y;
    const s0 = this.scaleAt(row) * this.figure;
    const colW = this.W / this.grid.w;
    const routing = u.status === 'routing';
    const face = u.facing ?? 1;
    const d = this.depth(row);
    this.depthNow = d;
    this.ink = this.inkAt(d);
    const colour = routing ? this.inkAt(d, [141, 135, 124]) : this.tint(u.color, d);
    const attacking = Math.abs(u.ox ?? 0) > 0.03 || Math.abs(u.oy ?? 0) > 0.03;
    const flinch = Math.max(0, 1 - (now - c.hitT) / 320);

    g.save();
    g.globalAlpha = (u.alpha ?? 1) * (u.hidden ? 0.45 : 1);
    const figs = c.figs.filter((f) => !f.fallT).sort((a, b) => a.dy - b.dy);
    // The front rank (toward the enemy) is who thrusts in an attack.
    const front = [...figs].sort((a, b) => (b.dx - a.dx) * face).slice(0, Math.ceil(figs.length / 2));

    const bearer = figs.find((f) => f.i === 0) ?? figs[0];
    if (bearer && u.role !== 'wagon' && !routing) {
      const px = bearer.x - face * 6 * s0;
      const py = this.groundY(row, (px / this.W) * this.grid.w - 0.5) + bearer.dy;
      this.flag(px, py, s0 * (u.leader ? 1.6 : 1.15), u.flag ?? colour, now, u.leader);
    }

    const frontInk = this.ink;
    const rearInk = this.inkAt(d - 0.18);
    for (const f of figs) {
      this.ink = f.rank ? rearInk : frontInk;
      const s = s0 * f.size;
      const shake = flinch > 0 ? Math.sin(now / 28 + f.i) * 2.2 * s * flinch : 0;
      const x = f.x + shake;
      const y = this.groundY(row, (f.x / this.W) * this.grid.w - 0.5) + f.dy;
      // Routed men never stand still: they run, or mill about in panic.
      const moving = routing ? 1 : Math.min(1, f.speed / (40 * s));
      const pose = { phase: f.phase, moving, thrust: attacking && front.includes(f) ? 1 : 0, routing, now, seed: f.i * 0.37 + (f.lag % 1) };
      const fface = f.face ?? face;
      const face2 = Math.sign(fface || 1) * Math.max(0.2, Math.abs(fface));
      const mounted = u.role === 'cavalry' || (u.role === 'leader' && (u.kind.tags.includes('cavalry') || f === bearer));
      if (u.role === 'wagon') this.wagon(x, y, s * 1.1, face2, pose);
      else if (mounted) this.rider(x, y, s, colour, face2, pose, u.role === 'leader', u);
      else if (routing) this.footman(x, y, s, colour, face2, pose, 'fleeing', u);
      else if (u.role === 'skirmisher') this.footman(x, y, s, colour, face2, pose, 'javelin', u);
      else if (u.role === 'ranged') this.footman(x, y, s, colour, face2, pose, u.kind.weapon ?? 'bow', u);
      else this.footman(x, y, s, colour, face2, pose, 'spear', u);
    }
    g.restore();
  }

  // Shields and spears thrown down by a company that broke, fading away.
  drawDrops(row, now) {
    if (!this.drops?.length) return;
    const g = this.ctx;
    this.drops = this.drops.filter((d) => now - d.t0 < 8000);
    for (const d of this.drops) {
      if (this.rowOf(d.row) !== row) continue;
      const age = now - d.t0;
      const fall = Math.min(1, age / 350);
      const fade = age < 6000 ? 1 : (8000 - age) / 2000;
      const s = this.scaleAt(d.row) * this.figure;
      const y = this.groundY(d.row, (d.x / this.W) * this.grid.w - 0.5) + d.dy;
      g.save();
      g.globalAlpha = 0.85 * fade;
      this.ink = this.inkAt(this.depth(d.row));
      if (d.spear) {
        g.strokeStyle = this.ink; g.lineWidth = 1.3 * s;
        const tilt = (1 - fall) * -1.2 + d.ang;
        g.beginPath(); g.moveTo(d.x - Math.cos(tilt) * 12 * s, y - 1 * s + Math.sin(tilt) * 12 * s); g.lineTo(d.x + Math.cos(tilt) * 12 * s, y - 1 * s - Math.sin(tilt) * 12 * s); g.stroke();
      }
      if (d.shield) {
        g.fillStyle = this.tint(d.colour, this.depth(d.row));
        g.beginPath(); g.ellipse(d.x + 4 * s, y - (1 + 5 * (1 - fall)) * s, 5.5 * s, (1.8 + 4 * (1 - fall)) * s, d.ang, 0, Math.PI * 2); g.fill();
        g.strokeStyle = this.ink; g.lineWidth = 0.8 * s; g.stroke();
      }
      g.restore();
    }
  }

  drawFallen(c, now) {
    const g = this.ctx;
    const u = c.u;
    const s0 = this.scaleAt(c.row) * this.figure;
    this.ink = this.inkAt(this.depth(c.row));
    for (const f of c.figs) {
      if (!f.fallT) continue;
      const t = now - f.fallT;
      if (t > this.bodyMs) continue;
      const tip = Math.min(1, t / 420);               // topple
      const ease = 1 - Math.pow(1 - tip, 3);
      const fade = t < this.bodyMs - 1500 ? 1 : (this.bodyMs - t) / 1500;
      const s = s0 * f.size;
      const x = f.x;
      const y = this.groundY(c.row, (f.x / this.W) * this.grid.w - 0.5) + f.dy;
      g.save();
      g.globalAlpha = 0.85 * fade;
      g.translate(x, y);
      g.rotate(f.fallDir * ease * Math.PI * 0.48);
      g.fillStyle = this.ink;
      if (u.role === 'cavalry' || (u.role === 'leader' && u.kind.tags.includes('cavalry'))) {
        g.beginPath(); g.ellipse(0, -8 * s, 12 * s, 5 * s, 0, 0, Math.PI * 2); g.fill();
      } else if (u.role !== 'wagon') {
        g.beginPath(); g.roundRect(-3.4 * s, -24 * s, 6.8 * s, 14 * s, 2.5 * s); g.fill();
        g.beginPath(); g.arc(0, -27 * s, 3 * s, 0, Math.PI * 2); g.fill();
        g.lineWidth = 3 * s; g.lineCap = 'round'; g.strokeStyle = this.ink;
        g.beginPath(); g.moveTo(-1.5 * s, -11 * s); g.lineTo(-2 * s, 0); g.moveTo(1.5 * s, -11 * s); g.lineTo(2.5 * s, 0); g.stroke();
      }
      g.restore();
      // The dropped shield lies where he fell.
      if (tip >= 1 && u.role !== 'wagon') {
        g.save();
        g.globalAlpha = 0.8 * fade;
        g.fillStyle = u.color;
        g.beginPath(); g.ellipse(x + f.fallDir * 10 * s, y - 1.5 * s, 5 * s, 2 * s, 0, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    }
  }

  // ---- figures -----------------------------------------------------------
  //
  // Every soldier is a black silhouette (the 1066 look) dressed in its
  // people's kit: cloth and shields in colour, headgear, hair, legwear and
  // weapons from what is known of how each army looked. `look` comes from
  // units.json. Idle soldiers breathe, shift and sway; cloth moves in the wind.

  // Clothing is part of the silhouette: 1066 draws every figure solid black
  // and keeps colour for shields and banners. Peoples are told apart by
  // outline (headgear, dress, shields, weapons), not by cloth colour.
  cloth() { return this.ink; }

  // Head, hair, beard and headgear. (x, y) is the centre of the head.
  head(x, y, s, face, look, now = 0, sway = 0) {
    const g = this.ctx;
    const f = face;
    const ink = this.ink;
    g.fillStyle = ink;
    // Hair behind the head.
    if (look.hair === 'long' && look.head !== 'greathelm') {
      g.beginPath();
      g.moveTo(x - f * 1.5 * s, y - 2.5 * s);
      g.quadraticCurveTo(x - f * (5 + sway) * s, y + 1 * s, x - f * (3.5 + sway) * s, y + 6 * s);
      g.lineTo(x - f * 1 * s, y + 3 * s);
      g.closePath(); g.fill();
    }
    g.beginPath(); g.arc(x, y, 3.1 * s, 0, Math.PI * 2); g.fill();
    // Nose, so faces read in profile.
    g.beginPath(); g.moveTo(x + f * 2.8 * s, y - 0.8 * s); g.lineTo(x + f * 4 * s, y + 0.8 * s); g.lineTo(x + f * 2.6 * s, y + 1.2 * s); g.fill();
    if (look.beard && look.head !== 'greathelm' && !look.veil) {
      g.beginPath();
      g.moveTo(x + f * 2.6 * s, y + 1.2 * s);
      g.quadraticCurveTo(x + f * 2.4 * s, y + 5 * s, x + f * 0.2 * s, y + 4.6 * s);
      g.lineTo(x - f * 1 * s, y + 2 * s);
      g.closePath(); g.fill();
    }
    g.beginPath();
    switch (look.head) {
      case 'cap': // a woollen cap, flopped forward
        g.moveTo(x - 3.3 * s, y - 0.8 * s); g.quadraticCurveTo(x - 1 * s, y - 6.5 * s, x + f * 3.8 * s, y - 4.2 * s);
        g.quadraticCurveTo(x + f * 2.5 * s, y - 2 * s, x + 3.3 * s * f, y - 0.8 * s); g.closePath(); g.fill();
        break;
      case 'hood': // hooded wool cloak, the hood up
        g.fillStyle = this.cloth(look.cloth ?? '#5b6444');
        g.moveTo(x - f * 3.8 * s, y + 4 * s); g.quadraticCurveTo(x - f * 4.8 * s, y - 5.5 * s, x + f * 1 * s, y - 5 * s);
        g.quadraticCurveTo(x + f * 4 * s, y - 4 * s, x + f * 3.4 * s, y - 1 * s);
        g.lineTo(x + f * 1.8 * s, y - 2 * s); g.quadraticCurveTo(x - f * 1 * s, y - 2 * s, x - f * 1.4 * s, y + 4 * s);
        g.closePath(); g.fill();
        break;
      case 'nasal': // conical helmet with a nose guard
        g.moveTo(x - 3.6 * s, y - 0.6 * s); g.lineTo(x - f * 0.4 * s, y - 7.4 * s); g.lineTo(x + 3.6 * s, y - 0.6 * s); g.closePath(); g.fill();
        g.fillRect(x + f * 2.5 * s - 0.6 * s, y - 1 * s, 1.2 * s, 3.8 * s);
        break;
      case 'kettle': // brimmed iron hat
        g.arc(x, y - 0.9 * s, 3.4 * s, Math.PI, 0); g.fill();
        g.beginPath(); g.ellipse(x, y - 0.7 * s, 6.2 * s, 1.1 * s, 0, 0, Math.PI * 2); g.fill();
        break;
      case 'greathelm': { // flat-topped great helm with an eye slit
        g.roundRect(x - 3.7 * s, y - 5.4 * s, 7.4 * s, 9 * s, 0.8 * s); g.fill();
        g.fillStyle = `rgb(${this.haze.join(',')})`;
        g.globalAlpha *= 0.6;
        g.fillRect(f > 0 ? x + 0.4 * s : x - 3.6 * s, y - 1.8 * s, 3.2 * s, 0.9 * s);
        g.globalAlpha /= 0.6;
        break;
      }
      case 'turban': case 'turbanHelm': {
        // White or pale linen, wound round; a tail hangs behind and moves.
        const helm = look.head === 'turbanHelm';
        if (helm) { g.moveTo(x - 2.2 * s, y - 3.6 * s); g.lineTo(x, y - 9.4 * s); g.lineTo(x + 2.2 * s, y - 3.6 * s); g.closePath(); g.fill(); }
        g.beginPath();
        g.fillStyle = this.cloth(helm ? '#e8e2d2' : (look.turban ?? '#f1ede2'));
        g.ellipse(x - f * 0.3 * s, y - (helm ? 2 : 2.4) * s, 4.4 * s, (helm ? 2.6 : 3.7) * s, 0, 0, Math.PI * 2); g.fill();
        g.lineWidth = 0.8 * s; g.strokeStyle = ink; g.stroke();
        g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 0.6 * s;
        g.beginPath(); g.moveTo(x - 3.8 * s, y - 2.8 * s); g.quadraticCurveTo(x, y - 4.2 * s, x + 3.8 * s, y - 1.6 * s); g.stroke();
        g.fillStyle = this.cloth(helm ? '#e8e2d2' : (look.turban ?? '#f1ede2'));
        g.beginPath();
        g.moveTo(x - f * 3.4 * s, y - 1.6 * s);
        g.quadraticCurveTo(x - f * (6 + sway) * s, y + 2 * s, x - f * (5.4 + sway * 1.5) * s, y + 6.5 * s);
        g.lineTo(x - f * 3.8 * s, y + 5 * s); g.quadraticCurveTo(x - f * 4.2 * s, y + 1 * s, x - f * 2 * s, y - 0.4 * s);
        g.closePath(); g.fill();
        if (look.veil) {
          g.beginPath(); g.fillStyle = this.cloth(look.cloth ?? '#c9b58e');
          g.moveTo(x + f * 3.4 * s, y + 0.2 * s); g.lineTo(x + f * 3.2 * s, y + 3.8 * s); g.lineTo(x - f * 1.6 * s, y + 4 * s); g.lineTo(x - f * 1.2 * s, y + 0.4 * s); g.closePath(); g.fill();
        }
        break;
      }
      default: break;
    }
    g.fillStyle = ink;
  }

  // Shields: round (with rim and boss), small buckler, kite, heater, or the
  // lobed leather adarga. Decoration from the kit, never a real coat of arms.
  shield(sx, sy, r, colour, shape, deco) {
    const g = this.ctx;
    const ink = this.ink;
    g.save();
    g.fillStyle = colour;
    g.beginPath();
    if (shape === 'kite' || shape === 'heater') {
      const top = shape === 'heater' ? -0.95 : -1.2;
      g.moveTo(sx - r * 0.8, sy + r * top);
      g.lineTo(sx + r * 0.8, sy + r * top);
      g.quadraticCurveTo(sx + r * 0.85, sy + r * (shape === 'heater' ? 0.4 : 0.3), sx, sy + r * (shape === 'heater' ? 1.25 : 1.6));
      g.quadraticCurveTo(sx - r * 0.85, sy + r * (shape === 'heater' ? 0.4 : 0.3), sx - r * 0.8, sy + r * top);
    } else if (shape === 'adarga') {
      g.moveTo(sx, sy - r * 0.78);
      g.bezierCurveTo(sx - r * 0.3, sy - r * 1.08, sx - r * 0.98, sy - r * 1.0, sx - r * 0.98, sy - r * 0.15);
      g.bezierCurveTo(sx - r * 0.98, sy + r * 0.72, sx - r * 0.45, sy + r * 1.12, sx, sy + r * 1.12);
      g.bezierCurveTo(sx + r * 0.45, sy + r * 1.12, sx + r * 0.98, sy + r * 0.72, sx + r * 0.98, sy - r * 0.15);
      g.bezierCurveTo(sx + r * 0.98, sy - r * 1.0, sx + r * 0.3, sy - r * 1.08, sx, sy - r * 0.78);
    } else {
      const rr = shape === 'buckler' ? r * 0.62 : r;
      g.ellipse(sx, sy, rr * 0.84, rr, 0, 0, Math.PI * 2);
    }
    g.fill();
    g.clip();
    // Decoration and shading, clipped to the shield.
    const rr = shape === 'buckler' ? r * 0.62 : r;
    g.strokeStyle = 'rgba(20,14,8,0.45)'; g.fillStyle = 'rgba(20,14,8,0.35)';
    if (deco === 'bands') {
      g.lineWidth = rr * 0.16;
      for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 4; g.beginPath(); g.moveTo(sx - Math.cos(a) * rr, sy - Math.sin(a) * rr); g.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); g.stroke(); }
    } else if (deco === 'bend') {
      g.fillStyle = 'rgba(240,210,120,0.55)';
      g.beginPath(); g.moveTo(sx - r, sy - r * 1.3); g.lineTo(sx - r * 0.6, sy - r * 1.3); g.lineTo(sx + r, sy + r * 0.9); g.lineTo(sx + r, sy + r * 1.4); g.closePath(); g.fill();
    } else if (deco === 'star') {
      g.strokeStyle = 'rgba(240,210,120,0.7)'; g.lineWidth = rr * 0.1;
      for (const a of [0, Math.PI / 4]) { g.save(); g.translate(sx, sy); g.rotate(a); g.strokeRect(-rr * 0.42, -rr * 0.42, rr * 0.84, rr * 0.84); g.restore(); }
    } else if (shape === 'adarga') {
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = r * 0.09;
      g.beginPath(); g.moveTo(sx, sy - r * 0.7); g.lineTo(sx, sy + r * 1.05); g.stroke();
    }
    // Light from the low sun on the upper edge.
    const hl = g.createLinearGradient(sx, sy - rr, sx, sy + rr);
    hl.addColorStop(0, 'rgba(255,240,210,0.28)'); hl.addColorStop(0.5, 'rgba(255,240,210,0)'); hl.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = hl; g.fillRect(sx - r * 1.2, sy - r * 1.7, r * 2.4, r * 3.4);
    g.restore();
    g.lineWidth = Math.max(0.8, r * 0.17); g.strokeStyle = ink;
    g.beginPath();
    if (shape === 'round' || shape === 'buckler' || !shape) {
      g.ellipse(sx, sy, rr * 0.84, rr, 0, 0, Math.PI * 2); g.stroke();
      if (deco === 'rim' || deco === 'bands') { g.lineWidth = rr * 0.12; g.strokeStyle = 'rgba(20,14,8,0.6)'; g.beginPath(); g.ellipse(sx, sy, rr * 0.7, rr * 0.86, 0, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = ink; g.beginPath(); g.arc(sx, sy, rr * 0.24, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,240,210,0.35)'; g.beginPath(); g.arc(sx - rr * 0.06, sy - rr * 0.08, rr * 0.09, 0, Math.PI * 2); g.fill();
    }
  }

  // Legs with knees; legwear by kit.
  legs(x, hipY, y, s, f, ph, m, pose, look) {
    const g = this.ctx;
    const leg = (p, back) => {
      const swing = Math.sin(p) * 0.55 * m + (pose.thrust ? 0.25 : 0) + (back ? -0.04 : 0.04) * (1 - m);
      const knee = Math.max(0, -Math.cos(p)) * 0.9 * m;
      const kx = x + Math.sin(swing) * 6.4 * s * f, ky = hipY + Math.cos(swing) * 6.4 * s;
      const fx2 = kx + Math.sin(swing - knee) * 6.6 * s * f;
      const fy = Math.min(y, ky + Math.cos(swing - knee) * 6.6 * s);
      g.strokeStyle = this.ink;
      g.lineWidth = (look.legs === 'trousers' ? 3.6 : 3) * s;
      g.beginPath(); g.moveTo(x, hipY); g.lineTo(kx, ky); g.lineTo(fx2, fy); g.stroke();
      if (false && (look.legs === 'wraps' || look.legs === 'garters')) {
        // Wrappings or cross-garters on the shin, pale against the leg.
        g.strokeStyle = look.legs === 'wraps' ? 'rgba(210,190,150,0.55)' : 'rgba(200,170,120,0.6)';
        g.lineWidth = 0.7 * s;
        for (let k = 0.25; k < 0.9; k += 0.2) {
          const lx = kx + (fx2 - kx) * k, ly = ky + (fy - ky) * k;
          g.beginPath(); g.moveTo(lx - 1.4 * s, ly - (look.legs === 'garters' ? 0.9 : 0.2) * s); g.lineTo(lx + 1.4 * s, ly + 0.8 * s); g.stroke();
        }
      }
      g.strokeStyle = this.ink; g.lineWidth = 1.7 * s;
      g.beginPath(); g.moveTo(fx2, fy); g.lineTo(fx2 + f * 2.6 * s, fy); g.stroke();
    };
    leg(ph + Math.PI, true);
    leg(ph, false);
  }

  footman(x, y, s, colour, face, pose, weapon, u) {
    const g = this.ctx;
    const f = face;
    const m = pose.moving;
    const ph = pose.phase;
    const now = pose.now ?? 0;
    const look = u?.look ?? {};
    // Idle life: breathing, a slow weight shift, and wind in the cloth.
    const idle = 1 - m;
    const breathe = Math.sin(now / 650 + pose.seed * 7) * 0.5 * s * idle;
    const wind = Math.sin(now / 480 + pose.seed * 11) * 0.9 + 0.6;
    const bob = m * Math.abs(Math.cos(ph)) * 1.6 * s;
    const lean = (pose.thrust ? 0.2 : 0) + (pose.routing ? 0.32 : m * 0.06);
    const hipY = y - 13 * s - bob;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.fillStyle = this.ink; g.strokeStyle = this.ink;
    const long = look.dress === 'robe' || look.dress === 'surcoat';
    const shx = x + f * lean * 10 * s;
    const shy = hipY - 11 * s + breathe;
    const sway = Math.sin(ph) * m * 1.8 * s + wind * 0.6 * s * idle;

    // Cloak behind the body: wool with a hem, or a shaggy sheepskin.
    if (look.cloak) {
      g.fillStyle = look.cloak === 'fleece' ? this.cloth('#8a7a60') : this.cloth(look.cloth ?? '#5b5b5b');
      g.beginPath();
      g.moveTo(shx + f * 1 * s, shy + 0.5 * s);
      g.quadraticCurveTo(shx - f * (5 + 4 * m + wind) * s, hipY - 2 * s, x - f * (5 + 6 * m + wind * 1.4) * s, hipY + ((look.cloak === 'fleece' ? 2 : 7) - 3 * m) * s + sway);
      if (look.cloak === 'fleece') for (let k = 0; k < 4; k++) g.lineTo(x - f * (4 + 6 * m + wind - k * 1.2) * s, hipY + (k % 2 ? 1 : 3.5) * s + sway);
      g.lineTo(x - f * 1 * s, hipY + 3 * s);
      g.closePath(); g.fill();
      g.lineWidth = 0.9 * s; g.stroke();
      g.fillStyle = this.ink;
    }

    this.legs(x, hipY, y, s, f, ph, m, pose, look);

    // Body: the silhouette, then the garment in its cloth colour over it.
    const hem = long ? y - 1.5 * s : look.dress === 'mail' ? hipY + 5.5 * s : look.dress === 'gambeson' ? hipY + 4 * s : hipY + 2.5 * s;
    const flare = long ? 6.2 : look.dress === 'mail' ? 4.8 : 4.4;
    const bodyPath = () => {
      g.beginPath();
      g.moveTo(x - flare * s + (long ? sway : 0), hem);
      g.quadraticCurveTo(x - 3.2 * s, hipY - 4 * s, shx - 3.1 * s, shy);
      g.lineTo(shx + 3.1 * s, shy);
      g.quadraticCurveTo(x + 3.3 * s, hipY - 4 * s, x + (flare + 0.2) * s + (long ? sway : 0), hem);
      g.closePath();
    };
    bodyPath();
    g.fillStyle = this.ink; g.fill();
    g.save();
    bodyPath(); g.clip();
    if (look.dress === 'mail') {
      // Mail: a grey sheen with ring texture, a cloth tunic showing below.
      g.fillStyle = this.cloth('#7f8288', 0.9); g.fillRect(x - 8 * s, shy - 1, 16 * s, hem - shy + 2);
      g.fillStyle = 'rgba(20,14,8,0.35)';
      for (let yy = shy + 1.5 * s; yy < hem; yy += 1.6 * s) for (let xx = x - 6 * s + ((yy / s) % 2) * 0.8 * s; xx < x + 6 * s; xx += 1.6 * s) g.fillRect(xx, yy, 0.8 * s, 0.8 * s);
    } else if (look.dress === 'surcoat') {
      g.fillStyle = this.cloth('#7f8288', 0.9); g.fillRect(x - 8 * s, shy - 1, 16 * s, 4 * s);
      g.fillStyle = this.cloth(look.cloth ?? '#b22a31'); g.fillRect(x - 8 * s, shy + 2.5 * s, 16 * s, hem - shy);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 0.5 * s, hipY, 1 * s, hem - hipY);
    } else if (look.dress === 'gambeson') {
      g.fillStyle = this.cloth(look.cloth ?? '#8a7a5a'); g.fillRect(x - 8 * s, shy - 1, 16 * s, hem - shy + 2);
      g.strokeStyle = 'rgba(20,14,8,0.35)'; g.lineWidth = 0.6 * s;
      for (let xx = x - 5 * s; xx < x + 6 * s; xx += 1.8 * s) { g.beginPath(); g.moveTo(xx, shy); g.lineTo(xx + (hem > y - 3 * s ? 0 : 0.5 * s), hem); g.stroke(); }
    } else {
      g.fillStyle = this.cloth(look.cloth ?? '#6b5a44'); g.fillRect(x - 8 * s, shy - 1, 16 * s, hem - shy + 2);
      // Folds, and the sash of a robe.
      g.strokeStyle = 'rgba(20,14,8,0.25)'; g.lineWidth = 0.7 * s;
      for (const k of [-2, 1.5]) { g.beginPath(); g.moveTo(x + k * s, hipY - 2 * s); g.lineTo(x + k * 1.4 * s + (long ? sway * 0.6 : 0), hem); g.stroke(); }
    }
    if (look.sash) { g.fillStyle = this.cloth(look.sash); g.fillRect(x - 6 * s, hipY - 2.6 * s, 12 * s, 1.8 * s); }
    else { g.fillStyle = this.ink; g.fillRect(x - 6 * s, hipY - 2.2 * s, 12 * s, 1.1 * s); } // belt
    // Shade the side away from the sun.
    const sh = g.createLinearGradient(x - f * 5 * s, 0, x + f * 5 * s, 0);
    sh.addColorStop(0, 'rgba(0,0,0,0.35)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.fillRect(x - 8 * s, shy - 1, 16 * s, hem - shy + 2);
    g.restore();
    g.lineWidth = 0.9 * s; g.strokeStyle = this.ink; bodyPath(); g.stroke();
    g.fillStyle = this.ink;

    // Sword at the hip for mail-clad men.
    if (look.dress === 'mail' || look.dress === 'surcoat') {
      g.lineWidth = 1.2 * s;
      g.beginPath(); g.moveTo(x - f * 1 * s, hipY - 1 * s); g.lineTo(x - f * 6 * s, hipY + 7 * s); g.stroke();
    }

    this.head(shx + f * 0.5 * s, shy - 3.4 * s, s, f, look, now, wind * idle + m * 1.5);
    g.fillStyle = this.ink; g.strokeStyle = this.ink;

    if (weapon === 'fleeing') {
      // Arms thrown up and flailing, empty-handed, looking back over the shoulder.
      g.lineWidth = 2.2 * s;
      for (const [k, o] of [[1, 0], [-1, Math.PI]]) {
        const a = -1.9 + Math.sin(ph * 1.5 + o) * 0.5;
        g.beginPath(); g.moveTo(shx, shy + 1 * s); g.lineTo(shx + Math.cos(a) * 7 * s * f * k, shy + Math.sin(a) * 7 * s); g.stroke();
      }
      return;
    }
    // Weapon arm and weapon, with idle sway.
    const idleSway = Math.sin(now / 900 + pose.seed * 5) * 0.06 * idle;
    const armSwing = pose.routing ? -1.2 : Math.sin(ph) * 0.4 * m;
    const hx = shx + f * (pose.thrust ? 9 : 5 + armSwing * 2) * s;
    const hy = shy + (pose.thrust ? 3 : 7) * s;
    g.lineWidth = 2.4 * s;
    g.beginPath(); g.moveTo(shx + f * 1.5 * s, shy + 1 * s); g.lineTo(hx, hy); g.stroke();
    g.lineWidth = 1.3 * s;
    if (weapon === 'spear') {
      const ang = (pose.thrust ? -0.12 : -1.2 + armSwing * 0.1) + idleSway;
      const L = (look.spear === 'long' ? 30 : 25) * s;
      const tx = hx + Math.cos(ang) * L * f, ty = hy + Math.sin(ang) * L;
      g.beginPath(); g.moveTo(hx - Math.cos(ang) * 8 * s * f, hy - Math.sin(ang) * 8 * s); g.lineTo(tx, ty); g.stroke();
      // Leaf blade; the Frankish winged spear has lugs below it.
      g.save(); g.translate(tx, ty); g.rotate(Math.atan2(Math.sin(ang), Math.cos(ang) * f));
      g.beginPath(); g.moveTo(3.4 * s, 0); g.quadraticCurveTo(0, -1.3 * s, -2.4 * s, 0); g.quadraticCurveTo(0, 1.3 * s, 3.4 * s, 0); g.fill();
      if (look.spear === 'winged') { g.lineWidth = 1 * s; g.beginPath(); g.moveTo(-3.2 * s, -1.8 * s); g.lineTo(-3.2 * s, 1.8 * s); g.stroke(); }
      g.restore();
    } else if (weapon === 'javelin') {
      const up = pose.thrust ? 0.2 : m > 0.2 ? -1.4 : -0.5 + idleSway * 3;
      g.beginPath(); g.moveTo(hx - f * 8 * s, hy + Math.sin(up) * -6 * s); g.lineTo(hx + f * 14 * s, hy + Math.sin(up) * 8 * s); g.stroke();
      g.lineWidth = 1 * s;
      for (const k of [0, 1.6, 3.2]) { g.beginPath(); g.moveTo(shx - f * (4 - k * 0.3) * s, shy + 8 * s); g.lineTo(shx + f * (2 + k * 0.4) * s, shy - (12 - k) * s); g.stroke(); }
    } else if (weapon === 'bow') {
      g.beginPath(); g.arc(hx, hy - 3 * s, 8.5 * s, f > 0 ? -1.25 : Math.PI - 1.9, f > 0 ? 1.9 - 0.65 : Math.PI + 1.25); g.stroke();
      g.lineWidth = 0.6 * s; g.beginPath(); g.moveTo(hx + f * Math.cos(-1.25) * 8.5 * s, hy - 3 * s + Math.sin(-1.25) * 8.5 * s); g.lineTo(hx - f * 2 * s, hy - 1 * s); g.stroke();
      // Quiver on the back.
      g.fillStyle = this.cloth('#6b4f2a'); g.fillRect(shx - f * 4.5 * s - 1.2 * s, shy - 2 * s, 2.4 * s, 9 * s); g.fillStyle = this.ink;
    } else if (weapon === 'crossbow') {
      g.lineWidth = 2 * s;
      g.beginPath(); g.moveTo(hx - f * 6 * s, hy + 1 * s); g.lineTo(hx + f * 8 * s, hy - 1 * s); g.stroke();
      g.lineWidth = 1.3 * s;
      g.beginPath(); g.moveTo(hx + f * 7 * s, hy - 6.5 * s); g.quadraticCurveTo(hx + f * 9.5 * s, hy - 1 * s, hx + f * 7 * s, hy + 4.5 * s); g.stroke();
    } else if (weapon === 'sling') {
      const whirl = pose.thrust ? now / 60 : now / 400 * idle;
      g.lineWidth = 0.8 * s;
      g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + Math.cos(whirl) * 6 * s * f, hy + 5 * s + Math.sin(whirl) * 3 * s); g.stroke();
      g.beginPath(); g.arc(hx + Math.cos(whirl) * 6 * s * f, hy + 5 * s + Math.sin(whirl) * 3 * s, 1.2 * s, 0, Math.PI * 2); g.fill();
    }

    // Shield on the other arm, facing the enemy.
    if (look.shield && (weapon === 'spear' || weapon === 'javelin' || weapon === 'none')) {
      const r = (look.shield === 'buckler' ? 5.6 : 7.4) * s;
      // Hide shields (the adarga) keep their leather colour; the rest carry the army's.
      const shCol = colour;
      this.shield(shx + f * 3.8 * s, shy + 7 * s + breathe, r, shCol, look.shield, look.shieldDeco);
    }
  }

  rider(x, y, s, colour, face, pose, leader, u) {
    const g = this.ctx;
    const f = face;
    const m = pose.moving;
    const now = pose.now ?? 0;
    const look = u?.look ?? {};
    const ph = pose.phase * 0.8;
    const gallop = m > 0.05;
    const idle = 1 - m;
    const bob = gallop ? Math.abs(Math.sin(ph)) * 2.4 * s * m : Math.sin(now / 700 + pose.seed * 9) * 0.4 * s;
    const by = y - 15 * s - bob;
    const wind = Math.sin(now / 480 + pose.seed * 11) * 0.9 + 0.6;
    g.fillStyle = this.ink; g.strokeStyle = this.ink;
    g.lineCap = 'round'; g.lineJoin = 'round';

    // Legs, jointed; an idle horse shifts a hoof now and then.
    const stamp = idle * Math.max(0, Math.sin(now / 900 + pose.seed * 13) - 0.85) * 6;
    const legs = [[-9, 0], [-6, 1.9], [7, 3.3], [10, 1.2]];
    legs.forEach(([lx, off], i) => {
      const p = ph + off;
      const swing = gallop ? Math.sin(p) * 0.6 * m : i === 2 ? -stamp * 0.08 : 0;
      const fold = gallop ? Math.max(0, Math.cos(p)) * 1.1 * m : i === 2 ? stamp * 0.12 : 0;
      const hx0 = x + f * lx * s, hy0 = by + 3 * s;
      const kx = hx0 + Math.sin(swing) * 6.5 * s * f, ky = hy0 + Math.cos(swing) * 6.5 * s;
      const fx2 = kx + Math.sin(swing - fold * (lx > 0 ? -1 : 1)) * 6.5 * s * f;
      const fy = Math.min(y, ky + Math.cos(swing - fold) * 6.5 * s);
      g.lineWidth = 2.6 * s;
      g.beginPath(); g.moveTo(hx0, hy0); g.lineTo(kx, ky); g.lineTo(fx2, fy); g.stroke();
    });
    const body = () => {
      g.beginPath();
      g.moveTo(x - f * 13 * s, by - 1 * s);
      g.bezierCurveTo(x - f * 13 * s, by - 7 * s, x + f * 8 * s, by - 7.5 * s, x + f * 11 * s, by - 3 * s);
      g.bezierCurveTo(x + f * 13 * s, by + 1 * s, x + f * 10 * s, by + 5 * s, x + f * 6 * s, by + 5 * s);
      g.lineTo(x - f * 9 * s, by + 5 * s);
      g.bezierCurveTo(x - f * 13 * s, by + 5 * s, x - f * 14 * s, by + 2 * s, x - f * 13 * s, by - 1 * s);
    };
    body(); g.fill();
    // Horse trappings: a full caparison for knights of 1212, a saddle cloth
    // for Andalusi horsemen, bare horses for light riders.
    if (look.horse === 'caparison') {
      g.save(); body(); g.clip();
      g.fillStyle = this.cloth(look.cloth ?? '#b22a31');
      g.beginPath();
      g.moveTo(x - f * 15 * s, by - 5 * s); g.lineTo(x + f * 13 * s, by - 5 * s);
      for (let k = 0; k <= 8; k++) g.lineTo(x + f * (13 - k * 3.5) * s, by + (k % 2 ? 5.5 : 8) * s + Math.sin(now / 200 + k) * m * s);
      g.closePath(); g.fill();
      g.restore();
      g.fillStyle = this.cloth(look.cloth ?? '#b22a31');
      for (let k = 0; k < 7; k++) { const cx = x + f * (12 - k * 3.6) * s; g.beginPath(); g.moveTo(cx - 1.8 * s, by + 4 * s); g.lineTo(cx, by + (8.5 + Math.sin(now / 180 + k) * m) * s); g.lineTo(cx + 1.8 * s, by + 4 * s); g.fill(); }
      g.fillStyle = this.ink;
    } else if (look.horse === 'saddlecloth') {
      g.fillStyle = this.cloth(look.cloth ?? '#1f6b5c');
      g.beginPath(); g.moveTo(x - f * 5 * s, by - 5 * s); g.lineTo(x + f * 4 * s, by - 5 * s); g.lineTo(x + f * 4 * s, by + 4 * s); g.lineTo(x - f * 5 * s, by + 4.5 * s); g.closePath(); g.fill();
      g.strokeStyle = this.cloth('#e6b534', 0.8); g.lineWidth = 0.8 * s; g.stroke();
      g.fillStyle = this.ink; g.strokeStyle = this.ink;
    }
    // Neck and head, nodding with the stride or grazing a little at rest.
    const nod = gallop ? Math.sin(ph * 2) * 1.2 * s : Math.sin(now / 1100 + pose.seed * 3) * 1.1 * s;
    g.beginPath();
    g.moveTo(x + f * 7 * s, by - 3.5 * s);
    g.quadraticCurveTo(x + f * 12 * s, by - 14 * s + nod, x + f * 15 * s, by - 15 * s + nod);
    g.lineTo(x + f * 21 * s, by - 8.5 * s + nod);
    g.quadraticCurveTo(x + f * 19.5 * s, by - 6.5 * s + nod, x + f * 17.5 * s, by - 8 * s + nod);
    g.quadraticCurveTo(x + f * 14 * s, by - 5 * s, x + f * 12 * s, by + 1 * s);
    g.closePath(); g.fill();
    // Mane.
    g.lineWidth = 1 * s;
    for (let k = 0; k < 5; k++) { const t = k / 5; const mx = x + f * (8 + 7 * t) * s, my = by - (5 + 10 * t) * s + nod * t; g.beginPath(); g.moveTo(mx, my); g.lineTo(mx - f * (2 + wind) * s, my + 1.5 * s); g.stroke(); }
    g.beginPath(); g.moveTo(x + f * 15 * s, by - 15 * s + nod); g.lineTo(x + f * 15.5 * s, by - 18 * s + nod); g.lineTo(x + f * 16.6 * s, by - 15 * s + nod); g.fill();
    // Tail: streams at the gallop, swishes at rest.
    const swish = idle * Math.sin(now / 520 + pose.seed * 4) * 2.5;
    g.lineWidth = 2.4 * s;
    g.beginPath();
    g.moveTo(x - f * 13 * s, by - 1.5 * s);
    g.quadraticCurveTo(x - f * (17 + 4 * m) * s, by + (1 - 4 * m) * s, x - f * (16 + 6 * m + swish) * s, by + (8 - 5 * m) * s);
    g.stroke();

    // Rider: legs over the flank, body, cloak or robe streaming, head.
    const sy = by - 5 * s;
    const lean = pose.routing ? 0.55 : pose.thrust ? 0.3 : gallop ? 0.12 : 0;
    const shx = x + f * lean * 8 * s, shy = sy - 11 * s;
    const long = look.cloak || look.dress === 'surcoat' || look.dress === 'robe';
    if (long) {
      const stream = gallop ? m : 0.25 + wind * 0.1;
      g.fillStyle = this.cloth(look.dress === 'surcoat' || look.dress === 'robe' ? (look.cloth ?? '#555') : (look.cloth ?? '#555'));
      g.beginPath();
      g.moveTo(shx - f * 0.5 * s, shy + 1 * s);
      g.quadraticCurveTo(shx - f * (6 + 6 * stream) * s, shy + 3 * s, x - f * (9 + 7 * stream) * s, sy + (4 - 3 * stream) * s + Math.sin(now / 150) * stream * 1.2 * s);
      g.lineTo(x - f * 3 * s, sy + 3 * s);
      g.closePath(); g.fill();
      g.lineWidth = 0.8 * s; g.strokeStyle = this.ink; g.stroke();
      g.fillStyle = this.ink;
    }
    const torso = () => { g.beginPath(); g.moveTo(x - 3.2 * s, sy + 1 * s); g.lineTo(shx - 2.8 * s, shy); g.lineTo(shx + 2.8 * s, shy); g.lineTo(x + 3.4 * s, sy + 1 * s); g.closePath(); };
    torso(); g.fillStyle = this.ink; g.fill();
    g.save(); torso(); g.clip();
    if (look.dress === 'mail') g.fillStyle = this.cloth('#7f8288', 0.85);
    else g.fillStyle = this.cloth(look.cloth ?? '#6b5a44');
    g.fillRect(x - 8 * s, shy - 1, 16 * s, 16 * s);
    if (look.dress === 'surcoat') { g.fillStyle = this.cloth('#7f8288', 0.85); g.fillRect(x - 8 * s, shy - 1, 16 * s, 3 * s); }
    g.restore();
    g.fillStyle = this.ink; g.strokeStyle = this.ink;
    g.lineWidth = 2.4 * s;
    g.beginPath(); g.moveTo(x + f * 1 * s, sy); g.lineTo(x + f * 3 * s, sy + 6 * s); g.stroke();
    this.head(shx + f * 0.4 * s, shy - 3.3 * s, s, f, look.head ? look : { ...look, head: 'nasal' }, now, gallop ? m * 2 : wind * 0.6);
    if (leader) {
      g.strokeStyle = '#e6b534'; g.lineWidth = 1.4 * s;
      g.beginPath(); g.arc(shx, shy - 3.3 * s, 4.8 * s, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    }
    g.fillStyle = this.ink; g.strokeStyle = this.ink;
    if (pose.routing) {
      // Lance and shield gone; the rider flattens over the horse's neck.
      g.fillStyle = this.ink;
      return;
    }
    // Lance: upright at rest (swaying), lowered at the gallop, couched for the charge.
    const lanceAng = pose.thrust ? -0.05 : gallop ? -0.45 : -1.25 + Math.sin(now / 900 + pose.seed * 5) * 0.05;
    const lx0 = shx + f * 2 * s, ly0 = shy + 5 * s;
    const tipX = lx0 + Math.cos(lanceAng) * 30 * s * f, tipY = ly0 + Math.sin(lanceAng) * 30 * s;
    g.lineWidth = 1.4 * s;
    g.beginPath(); g.moveTo(lx0 - Math.cos(lanceAng) * 10 * s * f, ly0 - Math.sin(lanceAng) * 10 * s); g.lineTo(tipX, tipY); g.stroke();
    if (look.pennon) {
      // A pennon below the lance head, fluttering.
      const bx = lx0 + Math.cos(lanceAng) * 25 * s * f, byy = ly0 + Math.sin(lanceAng) * 25 * s;
      const flap = Math.sin(now / 90 + pose.seed * 3) * 1.5 * s;
      g.fillStyle = colour;
      g.beginPath(); g.moveTo(bx, byy); g.lineTo(bx - f * 8 * s, byy + 1.5 * s + flap); g.lineTo(bx - f * 6 * s, byy + 3 * s); g.lineTo(bx - f * 8 * s, byy + 4.5 * s + flap); g.lineTo(bx - Math.cos(lanceAng) * 5 * s * f, byy - Math.sin(lanceAng) * 5 * s + 4 * s); g.closePath(); g.fill();
      g.fillStyle = this.ink;
    }
    // Shield on the rider's arm.
    if (look.shield) this.shield(shx - f * 1.5 * s, shy + 6 * s, 6 * s, colour, look.shield, look.shieldDeco);
    g.fillStyle = this.ink;
  }

  wagon(x, y, s, face, pose) {
    const g = this.ctx;
    const f = face;
    const m = pose.moving;
    g.fillStyle = this.ink;
    g.strokeStyle = this.ink;
    g.lineCap = 'round';
    // Cart with a load under a hide.
    g.beginPath(); g.roundRect(x - 14 * s, y - 17 * s, 26 * s, 8 * s, 1.5 * s); g.fill();
    g.beginPath();
    g.moveTo(x - 13 * s, y - 17 * s); g.bezierCurveTo(x - 9 * s, y - 30 * s, x + 7 * s, y - 30 * s, x + 11 * s, y - 17 * s);
    g.fill();
    // Wheels turn with distance travelled.
    const spin = pose.phase * 0.6;
    for (const wx of [-7, 6]) {
      g.lineWidth = 1.8 * s;
      g.beginPath(); g.arc(x + wx * s, y - 5 * s, 5 * s, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 1 * s;
      g.beginPath();
      for (let k = 0; k < 3; k++) {
        const a = spin + (k * Math.PI) / 3;
        g.moveTo(x + wx * s + Math.cos(a) * 5 * s, y - 5 * s + Math.sin(a) * 5 * s);
        g.lineTo(x + wx * s - Math.cos(a) * 5 * s, y - 5 * s - Math.sin(a) * 5 * s);
      }
      g.stroke();
    }
    // Shaft and ox, plodding.
    g.lineWidth = 1.5 * s;
    g.beginPath(); g.moveTo(x + f * 12 * s, y - 12 * s); g.lineTo(x + f * 21 * s, y - 13 * s); g.stroke();
    const ox = x + f * 30 * s;
    g.beginPath();
    g.moveTo(ox - f * 10 * s, y - 13 * s);
    g.bezierCurveTo(ox - f * 10 * s, y - 20 * s, ox + f * 6 * s, y - 20 * s, ox + f * 8 * s, y - 15 * s);
    g.lineTo(ox + f * 8 * s, y - 9 * s); g.lineTo(ox - f * 9 * s, y - 8 * s); g.closePath(); g.fill();
    g.beginPath(); g.ellipse(ox + f * 11 * s, y - 13 * s, 4 * s, 3 * s, f * 0.3, 0, Math.PI * 2); g.fill();
    g.lineWidth = 1.2 * s;
    g.beginPath(); g.moveTo(ox + f * 10 * s, y - 16 * s); g.quadraticCurveTo(ox + f * 12 * s, y - 21 * s, ox + f * 8 * s, y - 20 * s); g.stroke();
    g.lineWidth = 2.4 * s;
    for (const [lx, off] of [[-7, 0], [-4, Math.PI], [4, Math.PI * 0.5], [7, Math.PI * 1.5]]) {
      const sw = Math.sin(pose.phase * 0.8 + off) * 2.5 * s * m;
      g.beginPath(); g.moveTo(ox + f * lx * s, y - 9 * s); g.lineTo(ox + f * lx * s + sw, y); g.stroke();
    }
  }

  // A ragged war banner with three tails, rippling in two waves.
  flag(x, y, s, colour, now, big) {
    const g = this.ctx;
    const top = y - (big ? 70 : 56) * s;
    g.strokeStyle = this.ink;
    g.lineWidth = 1.5 * s;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, top - 4 * s); g.stroke();
    const len = (big ? 36 : 23) * s, hgt = (big ? 21 : 13) * s;
    const t = now / 240;
    const wave = (k, o = 0) => (Math.sin(t + k * 4 + o) * 2.8 + Math.sin(t * 1.7 + k * 7 + o) * 0.9) * s * k;
    const P = (k, v, o = 0) => [x + len * k, top + hgt * v + wave(k, o)];
    const edge = [];
    for (let i = 0; i <= 8; i++) edge.push(P(0.72 * i / 8, 0));
    const tails = [[1.0, 0.1], [0.74, 0.33], [0.97, 0.5], [0.74, 0.67], [0.92, 0.92]];
    for (const [k, v] of tails) edge.push(P(k, v, v));
    for (let i = 8; i >= 0; i--) edge.push(P(0.72 * i / 8, 1, 1));
    g.fillStyle = colour;
    g.beginPath();
    edge.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
    g.closePath();
    g.fill();
    // Folds of shadow travelling down the cloth.
    g.save();
    g.clip();
    g.fillStyle = 'rgba(0,0,0,0.2)';
    for (const o of [0, 2.1]) {
      const fk = ((t * 0.12 + o) % 1) * 0.9;
      g.fillRect(x + len * fk, top - 4 * s, 2.6 * s, hgt + 8 * s);
    }
    g.restore();
    g.fillStyle = this.ink;
    g.beginPath(); g.arc(x, top - 4 * s, 1.6 * s, 0, Math.PI * 2); g.fill();
  }

  // ---- effects -----------------------------------------------------------

  anchor(u) {
    const row = u.y;
    return { x: this.colX(u.x), y: this.groundY(row, u.x), s: this.scaleAt(row) };
  }

  drawFx(f, units, now) {
    const g = this.ctx;
    const p = Math.min(1, (now - f.t0) / f.ms);
    if (f.kind === 'text') {
      const x = this.colX(f.x);
      const y = this.groundY(f.y, f.x) - 70 * this.scaleAt(f.y) - p * 22 + (f.dy ?? 0) * 0.6;
      g.save();
      g.globalAlpha = p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25;
      g.font = `bold ${Math.round((f.size ?? 16) * 1.1)}px Optima, "Palatino Linotype", serif`;
      g.textAlign = 'center';
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(20,14,8,0.9)';
      g.strokeText(f.text, x, y);
      g.fillStyle = f.color ?? '#fff';
      g.fillText(f.text, x, y);
      g.restore();
    } else if (f.kind === 'missile') {
      // A shower on proper arcs: each missile its own launch time, height
      // and landing spot around the target square.
      const a = { x: this.colX(f.from.x), y: this.groundY(f.from.y, f.from.x) - 30 * this.scaleAt(f.from.y) };
      const b = { x: this.colX(f.to.x), y: this.groundY(f.to.y, f.to.x) - 12 * this.scaleAt(f.to.y) };
      const count = f.count ?? (f.style === 'rock' ? 3 : 5);
      const rng = makeRng(hash(`${f.t0}`));
      const dist = Math.abs(b.x - a.x);
      g.save();
      for (let i = 0; i < count; i++) {
        const lag = rng.next() * 0.3;
        const q = Math.max(0, Math.min(1, (p - lag) / 0.7));
        if (q <= 0) continue;
        const jx = (rng.next() - 0.5) * (this.W / this.grid.w) * 0.9;
        const lob = f.style === 'rock' ? 0 : 40 + dist * (0.35 + rng.next() * 0.15);
        const at = (k) => [a.x + (b.x + jx - a.x) * k, a.y + (b.y - a.y) * k - Math.sin(k * Math.PI) * lob];
        const [x, y] = at(q);
        if (f.style === 'rock') {
          g.fillStyle = SIL;
          g.beginPath(); g.arc(x, y, 4 + i, 0, Math.PI * 2); g.fill();
          continue;
        }
        const [px, py] = at(Math.max(0, q - 0.03));
        const ang = Math.atan2(y - py, x - px || 0.001);
        g.globalAlpha = q >= 1 ? Math.max(0, 1 - (p - 0.7 - lag) * 3) : 1;
        g.strokeStyle = SIL; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(x - Math.cos(ang) * 12, y - Math.sin(ang) * 12); g.lineTo(x, y); g.stroke();
      }
      g.restore();
    } else if (f.kind === 'flash') {
      const u = units.get(f.id);
      if (!u) return;
      const { x, y, s } = this.anchor(u);
      // A puff of dust where the blow lands.
      g.save();
      g.globalAlpha = (1 - p) * 0.7;
      g.fillStyle = '#d8c7a0';
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        g.arc(x + (k - 2) * 8 * s, y - 8 * s - p * 10 * s, (6 + p * 10) * s, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    } else if (f.kind === 'ring') {
      const { x, y, s } = this.anchor({ x: f.x, y: f.y });
      g.save();
      g.globalAlpha = 1 - p;
      g.strokeStyle = f.color ?? '#e6b534';
      g.lineWidth = 3;
      g.beginPath(); g.ellipse(x, y - 4, (20 + p * 70) * s, (6 + p * 20) * s, 0, 0, Math.PI * 2); g.stroke();
      g.restore();
    } else if (f.kind === 'bubble') {
      const u = units.get(f.id);
      if (!u) return;
      this.bubble(f.text, u, p);
    }
  }

  bubble(text, u, p) {
    const g = this.ctx;
    const { x, y, s } = this.anchor(u);
    g.save();
    g.globalAlpha = p < 0.05 ? p / 0.05 : p > 0.9 ? (1 - p) / 0.1 : 1;
    g.font = 'italic 16px "Palatino Linotype", Palatino, Georgia, serif';
    const lines = wrap(g, text, 260);
    const lh = 20;
    const w = Math.max(...lines.map((l) => g.measureText(l).width)) + 22;
    const hgt = lines.length * lh + 14;
    let bx = Math.max(6, Math.min(this.W - w - 6, x - w / 2));
    const by = Math.max(6, y - 78 * s - hgt);
    g.fillStyle = 'rgba(20,15,10,0.88)';
    g.fillRect(bx, by, w, hgt);
    g.strokeStyle = '#e6b534';
    g.lineWidth = 1.5;
    g.strokeRect(bx + 0.5, by + 0.5, w - 1, hgt - 1);
    g.beginPath();
    g.moveTo(Math.max(bx + 10, Math.min(bx + w - 10, x)) - 7, by + hgt);
    g.lineTo(Math.max(bx + 10, Math.min(bx + w - 10, x)), by + hgt + 9);
    g.lineTo(Math.max(bx + 10, Math.min(bx + w - 10, x)) + 7, by + hgt);
    g.fillStyle = 'rgba(20,15,10,0.88)';
    g.fill();
    g.fillStyle = '#fbf3de';
    lines.forEach((l, i) => g.fillText(l, bx + 11, by + 22 + i * lh));
    g.restore();
  }
}

function wrap(g, text, maxW) {
  const lines = [];
  let cur = '';
  for (const w of text.split(' ')) {
    const test = cur ? `${cur} ${w}` : w;
    if (g.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// A flat meadow for menu backdrops.
export function meadow(w = 12, h = 3) {
  return { w, h, at: () => ({ height: 0, forest: false }) };
}
