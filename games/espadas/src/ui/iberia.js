// Ink-and-watercolour map of the peninsula for the cutscenes. Coastlines are
// hand-simplified from real coordinates (lon, lat); political areas are
// deliberately soft-edged washes, because in the 8th century most of these
// frontiers were zones, not lines.

import { makeRng } from '../core/rng.js';

const COAST = [
  [-1.78, 43.37], [-2.0, 43.32], [-2.6, 43.42], [-3.0, 43.4], [-3.8, 43.47], [-4.4, 43.4], [-5.2, 43.48],
  [-5.7, 43.55], [-5.85, 43.66], [-6.6, 43.57], [-7.05, 43.54], [-7.68, 43.79], [-8.4, 43.37], [-8.95, 43.2],
  [-9.3, 42.9], [-8.9, 42.5], [-8.75, 42.2], [-8.85, 41.85], [-8.65, 41.15], [-8.75, 40.64], [-8.9, 40.1],
  [-9.4, 39.36], [-9.5, 38.7], [-8.9, 38.5], [-8.87, 37.95], [-8.8, 37.3], [-9.0, 37.0], [-8.3, 37.08],
  [-7.93, 37.0], [-7.4, 37.18], [-6.95, 37.2], [-6.4, 36.8], [-6.3, 36.53], [-5.6, 36.0], [-5.35, 36.13],
  [-4.9, 36.5], [-4.42, 36.7], [-3.5, 36.73], [-2.45, 36.83], [-2.2, 36.72], [-1.6, 37.3], [-0.98, 37.6],
  [-0.7, 37.63], [-0.48, 38.35], [0.23, 38.73], [-0.2, 39.1], [-0.33, 39.47], [-0.03, 39.97], [0.5, 40.4],
  [0.87, 40.7], [1.25, 41.1], [2.17, 41.38], [3.2, 41.9], [3.32, 42.32], [3.05, 42.5],
  // Pyrenees, east to west.
  [2.5, 42.45], [1.7, 42.5], [0.7, 42.7], [0.0, 42.7], [-0.52, 42.8], [-1.0, 42.95], [-1.35, 43.02], [-1.6, 43.2],
];
// The land north of the Pyrenees, clipped by the frame.
const GAUL = [
  [3.05, 42.5], [2.5, 42.45], [1.7, 42.5], [0.7, 42.7], [0.0, 42.7], [-0.52, 42.8], [-1.0, 42.95], [-1.35, 43.02],
  [-1.6, 43.2], [-1.78, 43.37], [-1.45, 43.6], [-1.25, 44.3], [-1.2, 44.65], [-1.15, 45.4], [-1.05, 46.2],
  [5.5, 46.2], [5.5, 43.4], [4.8, 43.35], [4.0, 43.5], [3.1, 43.15],
];
const AFRICA = [[-6.2, 35.8], [-5.9, 35.8], [-5.35, 35.9], [-4.5, 35.2], [-2.9, 35.3], [-2.0, 35.1], [0.0, 35.9], [1.5, 36.4], [5.5, 36.8], [5.5, 34.8], [-6.5, 34.8]];

// Areas by date. Rough on purpose.
const AREAS = {
  722: [
    { key: 'franks', land: 'gaul', pts: [[-1.4, 43.5], [-1.0, 45.9], [5.6, 46.0], [5.6, 43.3], [3.2, 43.0], [2.2, 42.4], [0.0, 42.6], [-1.0, 42.9]] },
    { key: 'asturleonese', pts: [[-6.4, 43.55], [-5.6, 43.6], [-4.6, 43.42], [-4.6, 43.05], [-5.5, 43.0], [-6.4, 43.15]] },
    { key: 'cordoba', pts: [[-9.3, 43.0], [-7.7, 43.8], [-6.5, 43.5], [-6.4, 43.1], [-4.5, 43.0], [-4.3, 43.4], [-1.9, 43.3], [-0.8, 42.8], [2.4, 42.4], [3.2, 42.0], [0.5, 39.5], [-0.8, 37.5], [-5.5, 36.0], [-8.8, 37.0], [-9.4, 39.0]] },
  ],
  939: [
    { key: 'franks', land: 'gaul', colour: '#6f7fa8', pts: [[-1.4, 43.5], [-1.0, 45.9], [5.6, 46.0], [5.6, 43.3], [3.2, 43.0], [2.2, 42.4], [0.0, 42.6], [-1.0, 42.9]] },
    { key: 'asturleonese', pts: [[-9.2, 42.9], [-8.4, 43.4], [-7.0, 43.6], [-5.3, 43.5], [-3.0, 43.4], [-2.6, 42.8], [-3.2, 41.6], [-4.6, 41.4], [-6.4, 41.3], [-8.0, 41.1], [-8.8, 41.5]] },
    { key: 'vascones', pts: [[-2.6, 43.3], [-1.8, 43.35], [-1.2, 43.1], [-0.9, 42.8], [-1.2, 42.3], [-2.0, 42.2], [-2.6, 42.7]] },
    { key: 'cordoba', pts: [[-8.8, 41.0], [-6.4, 41.1], [-4.6, 41.2], [-3.2, 41.4], [-2.2, 41.9], [-1.2, 42.1], [0.4, 42.3], [2.0, 42.2], [3.2, 42.0], [0.5, 39.5], [-0.8, 37.5], [-5.5, 36.0], [-8.8, 37.0], [-9.4, 39.0]] },
  ],
  1212: [
    { key: 'leon', colour: '#7a4b8c', pts: [[-9.2, 42.9], [-8.4, 43.4], [-7.0, 43.6], [-5.3, 43.5], [-4.9, 42.6], [-5.6, 41.3], [-6.9, 40.3], [-7.0, 41.9], [-8.8, 41.9]] },
    { key: 'portugal', colour: '#3f6f8a', pts: [[-8.8, 41.9], [-7.0, 41.9], [-6.9, 40.3], [-7.4, 39.2], [-9.0, 38.9], [-9.5, 39.4], [-8.9, 40.5]] },
    { key: 'castile', colour: '#b58b2a', pts: [[-4.9, 43.45], [-3.0, 43.4], [-1.8, 43.35], [-2.3, 42.6], [-1.9, 41.9], [-1.9, 40.6], [-2.2, 39.4], [-3.2, 38.7], [-5.4, 38.9], [-5.6, 40.2], [-5.6, 41.3], [-4.9, 42.6]] },
    { key: 'aragon', colour: '#c97a2a', pts: [[-1.6, 42.0], [-0.8, 42.85], [0.7, 42.75], [2.5, 42.45], [3.2, 42.0], [2.2, 41.4], [0.9, 40.7], [-0.3, 40.2], [-1.2, 40.1], [-1.9, 40.6], [-1.9, 41.9]] },
    { key: 'navarra', pts: [[-2.2, 42.95], [-1.75, 43.25], [-1.35, 43.1], [-0.8, 42.85], [-1.0, 42.35], [-1.6, 42.0], [-2.1, 42.2], [-2.3, 42.6]] },
    { key: 'almohads', pts: [[-9.0, 38.9], [-7.4, 39.2], [-5.4, 38.9], [-3.2, 38.7], [-1.2, 39.8], [-0.3, 40.2], [0.2, 39.4], [-0.7, 37.6], [-2.2, 36.7], [-5.5, 36.0], [-8.9, 37.0]] },
  ],
  778: [
    { key: 'franks', land: 'gaul', pts: [[-1.4, 43.5], [-1.0, 45.9], [5.6, 46.0], [5.6, 43.3], [3.2, 43.0], [2.2, 42.4], [0.0, 42.6], [-1.0, 42.9]] },
    { key: 'asturleonese', pts: [[-8.2, 43.3], [-7.6, 43.7], [-5.8, 43.6], [-4.4, 43.4], [-3.6, 43.45], [-3.3, 43.1], [-4.5, 42.9], [-6.2, 42.8], [-7.4, 42.9]] },
    { key: 'vascones', pts: [[-2.6, 43.3], [-1.8, 43.35], [-1.2, 43.1], [-0.9, 42.8], [-1.3, 42.5], [-2.1, 42.5], [-2.7, 42.8]] },
    { key: 'cordoba', pts: [[-9.0, 42.0], [-7.0, 42.4], [-4.5, 42.4], [-2.8, 42.35], [-1.3, 42.3], [0.5, 42.3], [3.0, 42.0], [0.5, 39.5], [-0.8, 37.5], [-5.5, 36.0], [-8.8, 37.0], [-9.4, 39.0]] },
  ],
};

const PLACES = {
  zaragoza: [-0.88, 41.65],
  pamplona: [-1.64, 42.81],
  roncesvalles: [-1.32, 43.01],
  cordoba: [-4.78, 37.88],
  oviedo: [-5.85, 43.36],
  aachen: [6.08, 50.77],
  toledo: [-4.02, 39.86],
  calatrava: [-3.83, 38.87],
  navas: [-3.6, 38.28],
  covadonga: [-4.98, 43.31],
  gijon: [-5.66, 43.54],
  leon: [-5.57, 42.6],
  simancas: [-4.83, 41.6],
};

export class IberiaMap {
  constructor(data, { width = 1200, height = 640, year = 778, seed = 7 } = {}) {
    this.data = data;
    this.W = width;
    this.H = height;
    this.year = year;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'iberia';
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.aspectRatio = `${width} / ${height}`;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);
    this.rng = makeRng(seed);
    this.base = this.paintBase();
    this.route = [];
    this.progress = 0;
    this.labels = [];
  }

  // Equirectangular with a cos(40°) squeeze, framed on the peninsula.
  px([lon, lat]) {
    const x0 = -10.2, x1 = 5.2, y0 = 45.6, y1 = 35.2;
    const sx = this.W / (x1 - x0);
    const sy = this.H / (y0 - y1);
    const s = Math.min(sx / 0.766, sy);
    const ox = (this.W - (x1 - x0) * s * 0.766) / 2;
    return [ox + (lon - x0) * s * 0.766, (y0 - lat) * s];
  }

  wash(g, pts, colour, { alpha = 0.55, spread = 6, layers = 5 } = {}) {
    const rng = this.rng;
    for (let l = 0; l < layers; l++) {
      g.fillStyle = colour;
      g.globalAlpha = alpha / layers * 1.6;
      g.beginPath();
      pts.forEach((p, i) => {
        const [x, y] = this.px(p);
        const jx = (rng.next() - 0.5) * spread * 2, jy = (rng.next() - 0.5) * spread * 2;
        if (i) g.lineTo(x + jx, y + jy); else g.moveTo(x + jx, y + jy);
      });
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
  }

  splatter(g, [lon, lat], colour, n = 18, radius = 40) {
    const [cx, cy] = this.px([lon, lat]);
    const rng = this.rng;
    g.fillStyle = colour;
    for (let i = 0; i < n; i++) {
      const a = rng.next() * Math.PI * 2;
      const d = Math.pow(rng.next(), 0.6) * radius;
      g.globalAlpha = 0.25 + rng.next() * 0.5;
      g.beginPath();
      g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.8 + rng.next() * 3.2, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  paintBase() {
    const off = document.createElement('canvas');
    off.width = this.W; off.height = this.H;
    const g = off.getContext('2d');
    // Sea: cold grey-blue wash, darker at the edges.
    const sea = g.createRadialGradient(this.W * 0.5, this.H * 0.5, this.H * 0.2, this.W * 0.5, this.H * 0.5, this.W * 0.75);
    sea.addColorStop(0, '#a9b4b8'); sea.addColorStop(1, '#5d6a72');
    g.fillStyle = sea;
    g.fillRect(0, 0, this.W, this.H);
    for (let i = 0; i < 600; i++) {
      g.fillStyle = `rgba(20,30,40,${this.rng.next() * 0.08})`;
      g.fillRect(this.rng.next() * this.W, this.rng.next() * this.H, 2 + this.rng.next() * 30, 1 + this.rng.next() * 2);
    }
    // Land: parchment washes.
    for (const pts of [COAST, GAUL, AFRICA]) this.wash(g, pts, '#d6c79f', { alpha: 0.95, spread: 2, layers: 3 });
    // Political washes for the year, each clipped to its landmass so the
    // coast stays crisp while the inland edge bleeds.
    for (const a of AREAS[this.year] ?? []) {
      const f = this.data.factions[a.key];
      const pale = a.key === 'cordoba' || a.key === 'almohads';
      const colour = a.colour ?? (pale ? '#fbf6e8' : f.color);
      g.save();
      g.beginPath();
      (a.land === 'gaul' ? GAUL : COAST).forEach((p, i) => { const [x, y] = this.px(p); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.closePath();
      g.clip();
      this.wash(g, a.pts, colour, { alpha: pale ? 0.6 : 0.7, spread: 9, layers: 7 });
      g.restore();
      this.splatter(g, centroid(a.pts), colour, 22, 60);
    }
    // Coast ink.
    g.strokeStyle = 'rgba(40,32,24,0.55)';
    g.lineWidth = 1.4;
    for (const pts of [COAST, AFRICA]) {
      g.beginPath();
      pts.forEach((p, i) => { const [x, y] = this.px(p); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.closePath();
      g.stroke();
    }
    // Pyrenees hachures.
    g.strokeStyle = 'rgba(40,32,24,0.5)';
    g.lineWidth = 1.2;
    for (let lon = -1.9; lon < 3.0; lon += 0.28) {
      const lat = 42.55 + 0.35 * Math.cos((lon + 1.9) / 1.6) + (lon < -0.5 ? 0.3 : 0);
      const [x, y] = this.px([lon, lat]);
      g.beginPath(); g.moveTo(x - 6, y + 4); g.lineTo(x, y - 5); g.lineTo(x + 6, y + 4); g.stroke();
    }
    // Stains.
    for (let i = 0; i < 10; i++) {
      g.fillStyle = `rgba(60,45,30,${0.02 + this.rng.next() * 0.025})`;
      g.beginPath();
      g.arc(this.rng.next() * this.W, this.rng.next() * this.H, 10 + this.rng.next() * 40, 0, Math.PI * 2);
      g.fill();
    }
    // Ink spatter, the way 1066's maps are flecked.
    for (let i = 0; i < 6; i++) this.splatter(g, [-10 + this.rng.next() * 15, 35.5 + this.rng.next() * 10], '#2a2118', 14, 30);
    return off;
  }

  // route: list of place keys; progress 0..1 draws it progressively.
  draw(now) {
    const g = this.ctx;
    g.clearRect(0, 0, this.W, this.H);
    g.drawImage(this.base, 0, 0, this.W, this.H);
    const pts = this.route.map((k) => this.px(PLACES[k]));
    if (pts.length > 1) {
      const total = pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
      let left = total * this.progress;
      g.save();
      g.strokeStyle = '#1d1a16';
      g.lineWidth = 3;
      g.setLineDash([9, 7]);
      g.beginPath();
      g.moveTo(...pts[0]);
      let end = pts[0];
      for (let i = 1; i < pts.length && left > 0; i++) {
        const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        const k = Math.min(1, left / seg);
        end = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
        g.lineTo(...end);
        left -= seg;
      }
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = this.marker ?? '#3d64b0';
      g.strokeStyle = '#1d1a16';
      g.lineWidth = 2;
      g.beginPath(); g.arc(end[0], end[1], 7, 0, Math.PI * 2); g.fill(); g.stroke();
      g.restore();
    }
    g.save();
    g.font = 'italic 17px "Palatino Linotype", Palatino, Georgia, serif';
    for (const { place, text, dx = 10, dy = -8 } of this.labels) {
      const [x, y] = this.px(PLACES[place]);
      g.fillStyle = '#1d1a16';
      g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(230,220,190,0.8)';
      g.strokeText(text, x + dx, y + dy);
      g.fillText(text, x + dx, y + dy);
    }
    g.restore();
  }
}

function centroid(pts) {
  const n = pts.length;
  return [pts.reduce((a, p) => a + p[0], 0) / n, pts.reduce((a, p) => a + p[1], 0) / n];
}
