// Canvas renderer for the battle grid. It draws a *view* of the battle, a set
// of display units that playback animates, never the engine state directly,
// so the engine can resolve a whole turn instantly while the board catches up.

import { makeRng } from '../core/rng.js';

const INK = '#15110c';
// Dark tactical board, as in 1066; terrain is only a tint so the unit icons
// carry the eye.
const TERRAIN_FILL = {
  road: '#1c1813',
  slope: '#1d2318',
  wood: '#172014',
  crag: '#26251f',
  highwood: '#141b10',
  plain: '#1d1a14',
  rise: '#222017',
  olives: '#1b2115',
  palisade: '#3d2c1c',
  camp: '#3a2a24',
  cave: '#141210',
  river: '#1f3345',
  ford: '#2b3a44',
  bridge: '#1f3345',
};

export class Board {
  constructor(grid, { cell = 60, exits = [] } = {}) {
    this.grid = grid;
    this.cell = cell;
    this.W = grid.w * cell;
    this.H = grid.h * cell;
    this.exits = exits;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'board';
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = this.W * dpr;
    this.canvas.height = this.H * dpr;
    this.canvas.style.aspectRatio = `${this.W} / ${this.H}`;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);

    this.units = new Map();
    this.overlay = { zone: null, reach: [], rings: [], arrows: [], selected: null, group: null, acting: null, sequence: null, hover: null, walls: new Set(), wedges: new Map() };
    this.fx = [];
    this.anims = [];
    this.scenes = [];
    this.terrain = this.paintTerrain();

    this.onCell = null;
    this.onHover = null;
    this.onRight = null;
    this.canvas.addEventListener('click', (e) => { const c = this.cellAt(e); if (c && this.onCell) this.onCell(c, e); });
    this.canvas.addEventListener('mousemove', (e) => {
      this.cursorOn = false;
      const c = this.cellAt(e);
      const k = c ? `${c.x},${c.y}` : null;
      if (k !== this.hoverKey) { this.hoverKey = k; this.overlay.hover = c; if (this.onHover) this.onHover(c); }
    });
    this.canvas.addEventListener('mouseleave', () => { this.hoverKey = null; this.overlay.hover = null; if (this.onHover) this.onHover(null); });
    this.canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); if (this.onRight) this.onRight(); });

    this.running = true;
    const loop = (now) => {
      if (!this.running) return;
      this.tick(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  destroy() { this.running = false; }

  // The arcade cursor: a square the stick moves around the grid, standing in
  // for the mouse. A presses the square (like a click), B is a right-click.
  moveCursor(dx, dy) {
    const c = this.cursor ?? { x: Math.floor(this.grid.w / 2), y: Math.floor(this.grid.h / 2) };
    const x = Math.max(0, Math.min(this.grid.w - 1, c.x + dx)), y = Math.max(0, Math.min(this.grid.h - 1, c.y + dy));
    this.setCursor({ x, y });
  }
  setCursor(c) {
    this.cursor = c;
    this.cursorOn = true;
    this.hoverKey = `${c.x},${c.y}`;
    this.overlay.hover = c;
    if (this.onHover) this.onHover(c);
  }
  pressCursor() {
    if (!this.cursor) { this.moveCursor(0, 0); return; }
    if (this.onCell) this.onCell({ ...this.cursor }, { shiftKey: false });
  }

  cellAt(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * this.grid.w);
    const y = Math.floor(((e.clientY - r.top) / r.height) * this.grid.h);
    return this.grid.inside(x, y) ? { x, y } : null;
  }

  // Runs fn(p) for p in 0..1 over `ms`, resolving when done.
  animate(ms, fn) {
    if (ms <= 0) { fn(1); return Promise.resolve(); }
    return new Promise((resolve) => this.anims.push({ t0: performance.now(), ms, fn, resolve }));
  }

  addFx(f) { this.fx.push({ t0: performance.now(), ...f }); }

  tick(now) {
    for (const a of [...this.anims]) {
      const p = Math.min(1, (now - a.t0) / a.ms);
      a.fn(p);
      if (p >= 1) { this.anims.splice(this.anims.indexOf(a), 1); a.resolve(); }
    }
    this.fx = this.fx.filter((f) => now - f.t0 < f.ms);
    this.draw(now);
    for (const sc of this.scenes) sc.draw(this.units, this.fx, now);
  }

  // ---- terrain -----------------------------------------------------------

  paintTerrain() {
    const { grid, cell } = this;
    const off = document.createElement('canvas');
    off.width = this.W;
    off.height = this.H;
    const g = off.getContext('2d');
    const rng = makeRng(778);
    g.fillStyle = '#0f0c09';
    g.fillRect(0, 0, this.W, this.H);
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        const t = grid.at(x, y);
        const px = x * cell, py = y * cell;
        g.fillStyle = TERRAIN_FILL[t.key];
        // Water fills its whole square so neighbouring squares run together
        // as one river; everything else keeps a hairline gap as the grid.
        if (t.key === 'river' || t.key === 'bridge' || t.key === 'ford') g.fillRect(px, py, cell, cell);
        else g.fillRect(px + 1, py + 1, cell - 2, cell - 2);
        for (let i = 0; i < 10; i++) {
          g.fillStyle = `rgba(255,240,210,${0.02 + rng.next() * 0.03})`;
          g.fillRect(px + rng.next() * cell, py + rng.next() * cell, 1.5, 1.5);
        }
        if (t.height > 0 && !t.forest) {
          g.strokeStyle = t.height === 2 ? 'rgba(200,190,160,0.28)' : 'rgba(200,190,160,0.16)';
          g.lineWidth = 1.2;
          const n = t.height === 2 ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const cx = px + cell * (0.22 + 0.56 * rng.next());
            const cy = py + cell * (0.3 + 0.45 * rng.next());
            const sz = cell * 0.1;
            g.beginPath(); g.moveTo(cx - sz, cy + sz * 0.7); g.lineTo(cx, cy - sz * 0.5); g.lineTo(cx + sz, cy + sz * 0.7); g.stroke();
          }
        }
        if (t.key === 'palisade') {
          // A row of stakes.
          g.strokeStyle = 'rgba(220,190,140,0.6)'; g.lineWidth = 2;
          for (let i = 0; i < 5; i++) {
            const sx = px + cell * (0.15 + i * 0.175);
            g.beginPath(); g.moveTo(sx, py + cell * 0.78); g.lineTo(sx + cell * 0.04, py + cell * 0.25); g.stroke();
          }
        }
        if (t.key === 'river' || t.key === 'ford' || t.key === 'bridge') {
          // Ripples that run on from square to square.
          g.strokeStyle = 'rgba(160,190,215,0.3)'; g.lineWidth = 1.5;
          for (let i = 0; i < 3; i++) {
            const wy = py + cell * (0.2 + i * 0.3) + ((x * 7 + y * 3) % 5);
            g.beginPath(); g.moveTo(px, wy); g.quadraticCurveTo(px + cell * 0.25, wy - 4, px + cell * 0.5, wy); g.quadraticCurveTo(px + cell * 0.75, wy + 4, px + cell, wy); g.stroke();
          }
          if (t.key === 'bridge') {
            // A stone deck across the river, with parapets.
            const water = (xx, yy) => grid.inside(xx, yy) && ['river', 'bridge', 'ford'].includes(grid.at(xx, yy).key);
            const across = water(x, y - 1) || water(x, y + 1); // river runs up-down: bridge runs left-right
            g.save();
            g.translate(px + cell / 2, py + cell / 2);
            if (!across) g.rotate(Math.PI / 2);
            g.fillStyle = '#6b5f4c';
            g.fillRect(-cell / 2, -cell * 0.26, cell, cell * 0.52);
            g.fillStyle = 'rgba(0,0,0,0.25)';
            for (let k = -cell / 2; k < cell / 2; k += cell / 6) g.fillRect(k, -cell * 0.26, 1, cell * 0.52);
            g.fillStyle = '#8c7d63';
            g.fillRect(-cell / 2, -cell * 0.3, cell, cell * 0.07);
            g.fillRect(-cell / 2, cell * 0.23, cell, cell * 0.07);
            g.restore();
          }
        }
        if (t.key === 'cave') {
          g.fillStyle = '#050403';
          g.beginPath(); g.moveTo(px + cell * 0.2, py + cell * 0.85); g.lineTo(px + cell * 0.2, py + cell * 0.5); g.quadraticCurveTo(px + cell * 0.5, py + cell * 0.1, px + cell * 0.8, py + cell * 0.5); g.lineTo(px + cell * 0.8, py + cell * 0.85); g.fill();
        }
        if (t.key === 'camp') {
          g.fillStyle = 'rgba(200,120,90,0.28)';
          g.beginPath(); g.moveTo(px + cell * 0.2, py + cell * 0.78); g.lineTo(px + cell * 0.5, py + cell * 0.22); g.lineTo(px + cell * 0.8, py + cell * 0.78); g.fill();
        }
        if (t.forest) {
          for (let i = 0; i < (t.height === 2 ? 4 : 3); i++) {
            g.fillStyle = 'rgba(120,150,90,0.22)';
            g.beginPath();
            g.arc(px + cell * (0.2 + 0.6 * rng.next()), py + cell * (0.2 + 0.6 * rng.next()), cell * (0.08 + rng.next() * 0.04), 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    }
    // Faint contour where the ground rises.
    g.strokeStyle = 'rgba(214,190,140,0.35)';
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        const h0 = grid.at(x, y).height;
        if (x + 1 < grid.w && grid.at(x + 1, y).height !== h0) {
          g.lineWidth = Math.abs(grid.at(x + 1, y).height - h0);
          g.beginPath(); g.moveTo((x + 1) * cell, y * cell + 3); g.lineTo((x + 1) * cell, (y + 1) * cell - 3); g.stroke();
        }
        if (y + 1 < grid.h && grid.at(x, y + 1).height !== h0) {
          g.lineWidth = Math.abs(grid.at(x, y + 1).height - h0);
          g.beginPath(); g.moveTo(x * cell + 3, (y + 1) * cell); g.lineTo((x + 1) * cell - 3, (y + 1) * cell); g.stroke();
        }
      }
    }
    return off;
  }

  // ---- drawing -----------------------------------------------------------

  centre(x, y) { return [(x + 0.5) * this.cell, (y + 0.5) * this.cell]; }

  draw(now) {
    const g = this.ctx;
    const { cell, overlay: o } = this;
    g.clearRect(0, 0, this.W, this.H);
    g.drawImage(this.terrain, 0, 0, this.W, this.H);
    // Each side's edge of the field, in its colour, as 1066 marks them.
    if (this.edges) {
      for (const [side, x] of [['left', 0], ['right', this.W - 4]]) {
        if (!this.edges[side]) continue;
        g.fillStyle = this.edges[side];
        g.globalAlpha = 0.85;
        g.fillRect(x, 0, 4, this.H);
        g.globalAlpha = 1;
      }
    }

    for (const [x, y] of this.exits) {
      const [cx, cy] = this.centre(x, y);
      g.fillStyle = 'rgba(61,100,176,0.22)';
      g.fillRect(x * cell, y * cell, cell, cell);
      g.fillStyle = 'rgba(160,190,240,0.55)';
      g.beginPath(); g.moveTo(cx + cell * 0.3, cy); g.lineTo(cx - cell * 0.05, cy - cell * 0.2); g.lineTo(cx - cell * 0.05, cy + cell * 0.2); g.fill();
    }

    if (o.zone) {
      g.fillStyle = 'rgba(255,244,214,0.12)';
      g.strokeStyle = 'rgba(255,244,214,0.5)';
      g.lineWidth = 1;
      for (const c of o.zone) { g.fillRect(c.x * cell + 2, c.y * cell + 2, cell - 4, cell - 4); }
    }

    for (const c of o.reach) {
      g.fillStyle = c.color ?? 'rgba(255,248,230,0.13)';
      g.fillRect(c.x * cell + 1, c.y * cell + 1, cell - 2, cell - 2);
    }

    for (const a of o.arrows) this.drawArrow(a);

    const list = [...this.units.values()].filter((u) => this.drawable(u));
    list.sort((a, b) => a.y - b.y);
    this.drawFormations();
    for (const u of list) this.drawUnit(u, now);

    for (const r of o.rings) {
      const [cx, cy] = this.centre(r.x, r.y);
      g.strokeStyle = r.color;
      g.lineWidth = 3;
      g.setLineDash(r.dash ?? []);
      g.beginPath(); g.arc(cx, cy, cell * 0.44, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]);
    }

    if (o.hover) {
      // The arcade cursor glows and pulses so it can be found at a glance.
      const pad = this.cursorOn && this.cursor && o.hover.x === this.cursor.x && o.hover.y === this.cursor.y;
      g.strokeStyle = pad ? `rgba(255,214,90,${0.75 + 0.25 * Math.sin(now / 160)})` : 'rgba(230,181,52,0.8)';
      g.lineWidth = pad ? 4 : 2;
      g.strokeRect(o.hover.x * cell + 2, o.hover.y * cell + 2, cell - 4, cell - 4);
      if (pad) { g.strokeStyle = 'rgba(12,9,6,0.7)'; g.lineWidth = 1; g.strokeRect(o.hover.x * cell + 4.5, o.hover.y * cell + 4.5, cell - 9, cell - 9); }
    }

    for (const f of this.fx) this.drawFx(f, now);
  }

  // Shield walls get a white capsule around the column, wedges a chevron,
  // the way 1066 marks formations on its grid.
  drawFormations() {
    const g = this.ctx;
    const cell = this.cell;
    const walls = [...this.overlay.walls].map((id) => this.units.get(id)).filter((u) => u && this.drawable(u));
    const byCol = new Map();
    for (const u of walls) {
      const k = `${u.side}:${Math.round(u.x)}`;
      if (!byCol.has(k)) byCol.set(k, []);
      byCol.get(k).push(u);
    }
    g.save();
    g.strokeStyle = 'rgba(251,246,234,0.9)';
    g.fillStyle = 'rgba(251,246,234,0.12)';
    g.lineWidth = 2.5;
    for (const us of byCol.values()) {
      const x = Math.round(us[0].x);
      const ys = us.map((u) => Math.round(u.y));
      const y0 = Math.min(...ys), y1 = Math.max(...ys);
      roundRect(g, x * cell + cell * 0.08, y0 * cell + cell * 0.06, cell * 0.84, (y1 - y0 + 1) * cell - cell * 0.12, cell * 0.42);
      g.fill(); g.stroke();
    }
    for (const [id, dir] of this.overlay.wedges) {
      const u = this.units.get(id);
      if (!u || !this.drawable(u)) continue;
      const f = dir;
      const cx = (u.x + 0.5) * cell, cy = (u.y + 0.5) * cell;
      g.fillStyle = 'rgba(251,246,234,0.85)';
      g.beginPath();
      g.moveTo(cx + f * cell * 0.62, cy);
      g.lineTo(cx + f * cell * 0.4, cy - cell * 0.3);
      g.lineTo(cx + f * cell * 0.4, cy + cell * 0.3);
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  drawable(u) {
    if (u.gone) return false;
    if (u.side !== 'player' && u.hidden) return false;
    return true;
  }

  drawArrow({ path, color, dash, width = 3, head = true }) {
    if (!path || path.length < 2) return;
    const g = this.ctx;
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = width;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.setLineDash(dash ?? []);
    g.beginPath();
    path.forEach((p, i) => { const [x, y] = this.centre(p.x, p.y); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
    g.setLineDash([]);
    if (head) {
      const [x1, y1] = this.centre(path[path.length - 2].x, path[path.length - 2].y);
      const [x2, y2] = this.centre(path[path.length - 1].x, path[path.length - 1].y);
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const s = this.cell * 0.18;
      g.beginPath();
      g.moveTo(x2, y2);
      g.lineTo(x2 - s * Math.cos(ang - 0.5), y2 - s * Math.sin(ang - 0.5));
      g.lineTo(x2 - s * Math.cos(ang + 0.5), y2 - s * Math.sin(ang + 0.5));
      g.fill();
    }
  }

  // Unit as a roundel: faction-coloured disc with a white role glyph.
  drawUnit(u, now) {
    const g = this.ctx;
    const cell = this.cell;
    const cx = (u.x + 0.5 + (u.ox ?? 0)) * cell;
    const cy = (u.y + 0.5 + (u.oy ?? 0)) * cell;
    const r = cell * 0.34;
    const routing = u.status === 'routing';
    const fill = routing ? '#6f6a62' : u.color;
    const glyph = u.inkGlyph && !routing ? INK : '#fbf6ea';

    g.save();
    g.globalAlpha = (u.alpha ?? 1) * (u.hidden ? 0.55 : 1);

    if (this.overlay.selected === u.id || this.overlay.group?.has(u.id)) {
      g.strokeStyle = '#e6b534';
      g.lineWidth = 3;
      g.beginPath(); g.arc(cx, cy, r + 5, 0, Math.PI * 2); g.stroke();
    }
    if (this.overlay.acting?.has(u.id)) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 90);
      g.strokeStyle = `rgba(255,248,230,${0.5 + 0.5 * pulse})`;
      g.lineWidth = 3;
      g.beginPath(); g.arc(cx, cy, r + 6 + pulse * 3, 0, Math.PI * 2); g.stroke();
    }
    if (u.role === 'wagon') {
      roundRect(g, cx - r, cy - r * 0.8, r * 2, r * 1.6, 5);
    } else {
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
    }
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255,248,230,0.85)';
    g.stroke();
    this.glyph(g, u, cx, cy, r, glyph);

    // Strength as an arc around the rim.
    const hp = Math.max(0, u.hp / u.maxHp);
    if (hp < 1) {
      g.strokeStyle = hp > 0.5 ? '#9cc55a' : hp > 0.25 ? '#e0a526' : '#d9492f';
      g.lineWidth = 3;
      g.beginPath(); g.arc(cx, cy, r + 2.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hp); g.stroke();
    }
    // Morale as a short bar under the disc.
    if (u.role !== 'wagon') {
      const bw = cell * 0.56, bx = cx - bw / 2, by = cy + r + 5;
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(bx, by, bw, 3);
      g.fillStyle = '#7fb0e6'; g.fillRect(bx, by, bw * Math.max(0, u.morale / u.maxMorale), 3);
    }

    if (u.leader) {
      g.fillStyle = '#e6b534';
      g.beginPath(); star(g, cx + r * 0.8, cy - r * 0.8, r * 0.36, r * 0.16, 5); g.fill();
    }
    if (u.hidden) {
      g.globalAlpha = 1;
      g.strokeStyle = '#fbf3de'; g.lineWidth = 1.5; g.setLineDash([3, 3]);
      g.beginPath(); g.arc(cx, cy, r + 6, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]);
    }
    const seq = this.overlay.sequence?.get(u.id);
    if (seq) {
      g.globalAlpha = 1;
      g.fillStyle = '#e6b534';
      g.beginPath(); g.arc(cx - r * 0.85, cy - r * 0.85, cell * 0.14, 0, Math.PI * 2); g.fill();
      g.fillStyle = INK;
      g.font = `bold ${Math.round(cell * 0.2)}px Optima, serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(seq), cx - r * 0.85, cy - r * 0.83);
      g.textBaseline = 'alphabetic';
    }
    if (routing) {
      g.globalAlpha = 1;
      g.fillStyle = '#fbf6ea';
      g.font = `bold ${Math.round(cell * 0.3)}px Optima, serif`;
      g.textAlign = 'center';
      g.fillText('!', cx + r * 0.85, cy - r * 0.55);
    }
    g.restore();
  }

  // White pictograms, after the 1066 icons.
  glyph(g, u, cx, cy, r, colour) {
    g.save();
    g.strokeStyle = colour; g.fillStyle = colour; g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round';
    const k = r / 14;
    const f = u.facing ?? 1;
    g.translate(cx, cy);
    g.scale(k * f, k);
    g.beginPath();
    switch (u.role) {
      case 'infantry': // spear behind a round shield
        g.moveTo(-8, 9); g.lineTo(8, -10); g.stroke();
        g.beginPath(); g.arc(-1, 2, 5.5, 0, Math.PI * 2); g.fill();
        break;
      case 'cavalry': // horse head
        g.moveTo(-6, 9); g.lineTo(-4, -2); g.lineTo(1, -8); g.lineTo(3, -10); g.lineTo(4, -6);
        g.lineTo(9, -1); g.lineTo(7, 2); g.lineTo(2, 0); g.lineTo(3, 9); g.closePath(); g.fill();
        break;
      case 'skirmisher': // two javelins
        g.moveTo(-9, 8); g.lineTo(8, -9); g.moveTo(-4, 9); g.lineTo(10, -4); g.stroke();
        g.beginPath(); g.moveTo(8, -9); g.lineTo(3, -8); g.lineTo(7, -4); g.closePath(); g.fill();
        break;
      case 'ranged': // bow
        g.arc(-4, 0, 10, -1.1, 1.1); g.stroke();
        g.beginPath(); g.moveTo(1, -9); g.lineTo(1, 9); g.moveTo(-8, 0); g.lineTo(9, 0); g.stroke();
        break;
      case 'leader': // crown
        g.moveTo(-9, 6); g.lineTo(-9, -5); g.lineTo(-4, 0); g.lineTo(0, -8); g.lineTo(4, 0); g.lineTo(9, -5); g.lineTo(9, 6); g.closePath(); g.fill();
        break;
      case 'wagon': // cart
        g.fillRect(-10, -6, 17, 8);
        g.beginPath(); g.arc(-5, 5, 3.5, 0, Math.PI * 2); g.arc(3, 5, 3.5, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.moveTo(7, -2); g.lineTo(12, -2); g.stroke();
        break;
      default:
        g.arc(0, 0, 6, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  drawFx(f, now) {
    const g = this.ctx;
    const cell = this.cell;
    const p = Math.min(1, (now - f.t0) / f.ms);
    if (f.kind === 'text' && !this.scenes.length) {
      const [cx, cy] = this.centre(f.x, f.y);
      g.save();
      g.globalAlpha = p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25;
      g.font = `bold ${f.size ?? 16}px Georgia, serif`;
      g.textAlign = 'center';
      g.lineWidth = 3.5;
      g.strokeStyle = 'rgba(30,22,14,0.9)';
      const yy = cy - cell * 0.3 - p * cell * 0.5 + (f.dy ?? 0);
      g.strokeText(f.text, cx, yy);
      g.fillStyle = f.color ?? '#fff';
      g.fillText(f.text, cx, yy);
      g.restore();
    } else if (f.kind === 'missile' && !this.scenes.length) {
      const [x1, y1] = this.centre(f.from.x, f.from.y);
      const [x2, y2] = this.centre(f.to.x, f.to.y);
      const lob = f.style === 'rock' ? 0 : cell * 0.5;
      const at = (q) => [x1 + (x2 - x1) * q, y1 + (y2 - y1) * q - Math.sin(q * Math.PI) * lob];
      const [x, y] = at(p);
      g.save();
      if (f.style === 'rock') {
        g.fillStyle = '#6b5b45'; g.strokeStyle = INK; g.lineWidth = 1.5;
        for (const [ox, oy, r] of [[0, 0, 0.12], [-0.12, -0.08, 0.08], [0.1, -0.1, 0.07]]) {
          g.beginPath(); g.arc(x + ox * cell, y + oy * cell, r * cell, 0, Math.PI * 2); g.fill(); g.stroke();
        }
      } else {
        const [px, py] = at(Math.max(0, p - 0.03));
        const ang = Math.atan2(y - py, x - px || 0.001);
        g.strokeStyle = INK; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x - Math.cos(ang) * 12, y - Math.sin(ang) * 12); g.lineTo(x + Math.cos(ang) * 6, y + Math.sin(ang) * 6); g.stroke();
      }
      g.restore();
    } else if (f.kind === 'flash') {
      const u = this.units.get(f.id);
      if (!u) return;
      const [cx, cy] = this.centre(u.x, u.y);
      g.save();
      g.globalAlpha = 1 - p;
      g.fillStyle = f.color ?? '#fff3c4';
      g.beginPath(); g.arc(cx, cy, cell * 0.45, 0, Math.PI * 2); g.fill();
      g.restore();
    } else if (f.kind === 'ring') {
      const [cx, cy] = this.centre(f.x, f.y);
      g.save();
      g.globalAlpha = 1 - p;
      g.strokeStyle = f.color ?? '#e6b534'; g.lineWidth = 4;
      g.beginPath(); g.arc(cx, cy, cell * (0.4 + p * 2), 0, Math.PI * 2); g.stroke();
      g.restore();
    } else if (f.kind === 'bubble' && !this.scenes.length) {
      const u = this.units.get(f.id);
      if (!u) return;
      this.drawBubble(f.text, u, p);
    }
  }

  drawBubble(text, u, p) {
    const g = this.ctx;
    const cell = this.cell;
    g.save();
    g.globalAlpha = p < 0.08 ? p / 0.08 : p > 0.9 ? (1 - p) / 0.1 : 1;
    g.font = 'italic 14px Georgia, serif';
    const maxW = cell * 4;
    const lines = wrap(g, text, maxW);
    const lh = 17;
    const w = Math.max(...lines.map((l) => g.measureText(l).width)) + 18;
    const hgt = lines.length * lh + 12;
    const [ux, uy] = this.centre(u.x, u.y);
    let bx = ux - w / 2;
    let by = uy - cell * 0.5 - hgt - 10;
    if (by < 4) by = uy + cell * 0.55 + 10;
    bx = Math.max(4, Math.min(this.W - w - 4, bx));
    g.fillStyle = '#fbf3de';
    g.strokeStyle = INK;
    g.lineWidth = 2;
    roundRect(g, bx, by, w, hgt, 8);
    g.fill(); g.stroke();
    g.fillStyle = INK;
    g.textAlign = 'left';
    lines.forEach((l, i) => g.fillText(l, bx + 9, by + 18 + i * lh));
    g.restore();
  }
}

function wrap(g, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (g.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function star(g, cx, cy, ro, ri, n) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro;
    const a = (Math.PI / n) * i - Math.PI / 2;
    if (i) g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    else g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (p, s) => (p >> s) & 255;
  const c = (s) => Math.round(ch(pa, s) * (1 - t) + ch(pb, s) * t);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

// Display units built from specs or from live engine units.
// A unit is drawn in its own people's colours and dress (so allies in a
// mixed army look like themselves); `factionId` is only a fallback.
export function viewUnit(data, u, factionId) {
  const kind = u.kind ?? data.units[u.type];
  factionId = data.factions[kind.faction] ? kind.faction : factionId;
  return {
    id: u.id,
    side: u.side,
    type: u.type,
    kind,
    name: u.name ?? null,
    role: kind.role,
    leader: kind.tags.includes('leader'),
    color: data.factions[factionId].color,
    inkGlyph: !!data.factions[factionId].ink,
    look: { ...data.factions[factionId].look, ...(kind.look ?? {}) },
    x: u.x,
    y: u.y,
    hp: u.hp ?? kind.hp,
    maxHp: u.maxHp ?? kind.hp,
    morale: u.morale ?? 1,
    maxMorale: u.maxMorale ?? 1,
    status: u.status ?? 'ok',
    hidden: !!u.hidden,
    facing: u.facing ?? 1,
    gone: u.status ? !['ok', 'routing'].includes(u.status) : false,
    alpha: 1,
  };
}
