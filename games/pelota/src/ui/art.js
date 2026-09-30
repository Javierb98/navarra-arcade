// Everything ¡Pelotari! draws, painted in code with smooth shapes and warm
// light (the look of Espadas de Hispania and Piedra por piedra): a village
// frontón built against the church, seen from behind the court as on
// television, in three lights: afternoon, sunset and night under the
// floodlights. No pixel art: the canvas is 2x the 960x540 stage.

import { makeRng } from '../core/rng.js';
import { drawCrowd } from './crowd.js';

const W = 960, H = 540, SCALE = 2;

// ---- the camera --------------------------------------------------------------------
//
// A pinhole camera 12 m behind the back line and 4 m up, looking almost level
// at the frontis. project(x, y, z) -> [screen x, screen y, pixels per metre].
const CAM = { y: 40, z: 4, pitch: 0.02, f: 1000, cx: 480, cy: 160, x: 5 };
const CP = Math.cos(CAM.pitch), SP = Math.sin(CAM.pitch);
export function project(x, y, z) {
  const dy = CAM.y - y, dz = z - CAM.z;
  const zc = Math.max(0.5, dy * CP - dz * SP), yc = dy * SP + dz * CP;
  const s = CAM.f / zc;
  return [CAM.cx + (x - CAM.x) * s, CAM.cy - yc * s, s];
}

export const COURT = { w: 10, l: 30, wall: 10, chapa: 0.8, top: 9 };

// ---- lights -------------------------------------------------------------------------

export const LIGHTS = {
  afternoon: {
    sky: ['#6fa6d2', '#a9cbe0', '#e8e2c8'], sun: [700, 40, 0.8], haze: '#dfd6bc',
    hills: ['#9fae9a', '#7e9480'], stone: '#e2cfa8', stoneD: '#b99c70', floor: ['#bdb49c', '#d2c9ae'],
    warm: 'rgba(255,236,190,0.10)', shadow: [-0.25, 0.1, 0.3], lamps: false, amb: 'rgba(0,0,0,0)',
  },
  sunset: {
    sky: ['#3e3b6e', '#c8674a', '#f2b760', '#f9dca0'], sun: [860, 150, 1], haze: '#f0c690',
    hills: ['#8a6a78', '#6e5260'], stone: '#e8c89a', stoneD: '#b08658', floor: ['#b39a7c', '#d4b690'],
    warm: 'rgba(255,190,120,0.18)', shadow: [-0.9, 0.12, 0.34], lamps: true, amb: 'rgba(60,20,40,0.08)',
  },
  night: {
    sky: ['#0b1026', '#1b2446', '#39406a'], sun: null, haze: '#3a3f60',
    hills: ['#1c2038', '#141829'], stone: '#b9ab96', stoneD: '#7a6e60', floor: ['#6f6a62', '#8d877c'],
    warm: 'rgba(255,200,130,0.10)', shadow: [0.15, 0.18, 0.4], lamps: true, amb: 'rgba(10,14,40,0.28)', floods: true,
  },
};

// ---- helpers ------------------------------------------------------------------------

function canvas(w, h, scale = SCALE) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * scale); c.height = Math.ceil(h * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale);
  return [c, g];
}
const cache = new Map();
const cached = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
function rgb(c) {
  if (c.startsWith('rgb')) return c.match(/[\d.]+/g).slice(0, 3).map(Number);
  const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(a, b, t) { const A = rgb(a), B = rgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }
const shade = (c, k) => (k >= 0 ? mix(c, '#fff6e4', k) : mix(c, '#1a120c', -k));

function quad(g, pts) {
  g.beginPath();
  pts.forEach(([x, y, z], k) => { const [sx, sy] = project(x, y, z); if (k) g.lineTo(sx, sy); else g.moveTo(sx, sy); });
  g.closePath();
}
function line3(g, a, b) {
  const [x0, y0] = project(...a), [x1, y1] = project(...b);
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
}
function glow(g, x, y, r, colour, a = 1) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, colour.replace('A', a)); gr.addColorStop(1, colour.replace('A', 0));
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
}

// ---- the sky and the country ---------------------------------------------------------------

function paintSky(g, L) {
  const sky = g.createLinearGradient(0, 0, 0, 320);
  L.sky.forEach((c, i, a) => sky.addColorStop(i / (a.length - 1), c));
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  if (L.sun) {
    const [sx, sy, a] = L.sun;
    glow(g, sx, sy, 520, 'rgba(255,238,200,A)', 0.55 * a);
    glow(g, sx, sy, 120, 'rgba(255,250,232,A)', 0.9 * a);
    g.fillStyle = `rgba(255,252,240,${0.9 * a})`; g.beginPath(); g.arc(sx, sy, 22, 0, Math.PI * 2); g.fill();
  } else {
    // Night: stars and a moon.
    const rng = makeRng(9);
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,240,${0.3 + rng.next() * 0.6})`; g.beginPath(); g.arc(rng.next() * W, rng.next() * 260, rng.next() * 1.2 + 0.2, 0, Math.PI * 2); g.fill(); }
    glow(g, 880, 60, 90, 'rgba(220,230,255,A)', 0.3);
    g.fillStyle = '#f2efe0'; g.beginPath(); g.arc(880, 60, 16, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1b2446'; g.beginPath(); g.arc(887, 55, 14, 0, Math.PI * 2); g.fill();
  }
  const rng = makeRng(5);
  for (let i = 0; i < 12; i++) {
    g.fillStyle = L.floods ? `rgba(120,130,170,${0.06 + rng.next() * 0.06})` : `rgba(255,244,222,${0.1 + rng.next() * 0.12})`;
    g.beginPath(); g.ellipse(rng.next() * W, 20 + rng.next() * 160, 80 + rng.next() * 160, 4 + rng.next() * 7, 0, 0, Math.PI * 2); g.fill();
  }
}

function paintHills(g, L) {
  const hills = (y, amp, fill, seed) => {
    g.fillStyle = fill; g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 12) g.lineTo(x, y - amp * (0.5 + 0.5 * Math.sin(x * 0.006 + seed) * Math.cos(x * 0.011 + seed * 2)));
    g.lineTo(W, H); g.fill();
  };
  hills(200, 70, mix(L.hills[0], L.haze, 0.35), 1);
  hills(232, 46, L.hills[1], 3);
}

// ---- the village around the plaza ------------------------------------------------------------

// The church the frontón leans against: a stone nave and a tall bell tower,
// with a stork's nest on top.
function paintChurch(g, L) {
  const st = L.stone, sd = L.stoneD;
  const lit = (x, w, k = 0.12) => { const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, shade(st, k)); gr.addColorStop(1, shade(sd, -0.1)); return gr; };
  g.fillStyle = lit(640, 230); g.fillRect(640, 120, 230, 150);
  g.fillStyle = shade(sd, -0.2); g.beginPath(); g.moveTo(632, 122); g.lineTo(755, 70); g.lineTo(878, 122); g.fill();
  g.fillStyle = shade(sd, -0.05); g.beginPath(); g.moveTo(632, 122); g.lineTo(755, 70); g.lineTo(760, 74); g.lineTo(642, 124); g.fill();
  g.fillStyle = shade(sd, -0.35); g.beginPath(); g.arc(760, 150, 14, 0, Math.PI * 2); g.fill();
  g.strokeStyle = shade(st, 0.1); g.lineWidth = 1.5; for (let k = 0; k < 8; k++) { g.beginPath(); g.moveTo(760, 150); g.lineTo(760 + Math.cos(k * 0.785) * 14, 150 + Math.sin(k * 0.785) * 14); g.stroke(); }
  if (L.lamps) glow(g, 760, 150, 26, 'rgba(255,200,120,A)', 0.5);
  for (const x of [660, 710, 810, 850]) { g.fillStyle = shade(sd, -0.08); g.beginPath(); g.moveTo(x, 270); g.lineTo(x, 150); g.lineTo(x + 10, 140); g.lineTo(x + 14, 270); g.fill(); }
  const tx = 870;
  g.fillStyle = lit(tx, 70, 0.18); g.fillRect(tx, 20, 70, 250);
  g.fillStyle = shade(sd, -0.18); g.fillRect(tx + 50, 20, 20, 250);
  for (let y = 40; y < 270; y += 14) { g.fillStyle = 'rgba(90,60,30,0.14)'; g.fillRect(tx, y, 70, 1.2); }
  g.fillStyle = shade(sd, -0.45);
  for (const x of [tx + 10, tx + 38]) { g.beginPath(); g.rect(x, 48, 18, 34); g.arc(x + 9, 48, 9, Math.PI, 0); g.fill(); }
  g.fillStyle = '#8a6a2a'; for (const x of [tx + 19, tx + 47]) { g.beginPath(); g.moveTo(x - 6, 76); g.quadraticCurveTo(x, 58, x + 6, 76); g.fill(); }
  g.fillStyle = shade(sd, -0.1); g.fillRect(tx - 4, 14, 78, 8);
  for (let k = 0; k < 6; k++) g.fillRect(tx - 4 + k * 14, 4, 8, 11);
  // The stork's nest and a stork.
  g.fillStyle = '#6a4a2a'; g.beginPath(); g.ellipse(tx + 35, 2, 26, 8, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#4a321c'; g.lineWidth = 1; for (let k = 0; k < 10; k++) { g.beginPath(); g.moveTo(tx + 12 + k * 5, 4); g.lineTo(tx + 16 + k * 5, -4); g.stroke(); }
  g.fillStyle = '#f5f1e8'; g.beginPath(); g.ellipse(tx + 36, -9, 8, 5, -0.3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(tx + 42, -12); g.quadraticCurveTo(tx + 46, -20, tx + 44, -26); g.lineTo(tx + 47, -26); g.quadraticCurveTo(tx + 49, -18, tx + 44, -10); g.fill();
  g.fillStyle = '#d2452c'; g.beginPath(); g.moveTo(tx + 46, -27); g.lineTo(tx + 55, -25); g.lineTo(tx + 46, -24); g.fill();
  g.fillStyle = '#222'; g.beginPath(); g.ellipse(tx + 31, -8, 5, 3, -0.3, 0, Math.PI * 2); g.fill();
}

// Houses with wooden balconies and geraniums, and the arcaded town hall.
function paintHouses(g, L) {
  const rng = makeRng(21);
  const walls = ['#efe0c4', '#e8cfa6', '#f2e6d2', '#dcc09a'];
  for (let k = 0; k < 7; k++) {
    const x = 610 + k * 52 + rng.next() * 8, w = 56, top = 170 + rng.next() * 40, base = 290;
    const wall = mix(walls[k % 4], L.haze, L.floods ? 0.55 : 0.1);
    g.fillStyle = wall; g.fillRect(x, top, w, base - top);
    g.fillStyle = shade(wall, -0.18); g.fillRect(x + w - 8, top, 8, base - top);
    g.fillStyle = mix('#b25a3a', L.haze, L.floods ? 0.5 : 0.1);
    g.beginPath(); g.moveTo(x - 4, top + 2); g.lineTo(x + w / 2, top - 16); g.lineTo(x + w + 4, top + 2); g.fill();
    for (let r = 0; r < 2; r++) {
      const wy = top + 16 + r * 36;
      if (wy > base - 30) continue;
      const lit = L.lamps && rng.chance(0.6);
      g.fillStyle = lit ? '#ffcf80' : shade(wall, -0.5); g.fillRect(x + 16, wy, 20, 22);
      if (lit) glow(g, x + 26, wy + 11, 22, 'rgba(255,200,120,A)', 0.35);
      g.fillStyle = '#6a3e24'; g.fillRect(x + 10, wy + 20, 32, 3); for (let b = 0; b < 6; b++) g.fillRect(x + 11 + b * 6, wy + 23, 1.5, 8);
      g.fillRect(x + 10, wy + 30, 32, 2);
      for (let f = 0; f < 4; f++) { g.fillStyle = f % 2 ? '#d33a2c' : '#e8594a'; g.beginPath(); g.arc(x + 14 + f * 8, wy + 19, 2.6, 0, Math.PI * 2); g.fill(); g.fillStyle = '#4a7a2a'; g.beginPath(); g.arc(x + 17 + f * 8, wy + 20, 2, 0, Math.PI * 2); g.fill(); }
      if (rng.chance(0.4)) { g.fillStyle = rng.chance(0.5) ? '#c0392b' : '#f3ece0'; g.fillRect(x + 12, wy + 32, 28, 16); }
    }
  }
  // The town hall: an arcade on the ground floor, flags above.
  const ax = 620, aw = 330, ay = 250;
  g.fillStyle = mix('#e0c8a0', L.haze, L.floods ? 0.5 : 0.08); g.fillRect(ax, ay - 30, aw, 60);
  g.fillStyle = L.lamps ? '#5a3a24' : shade('#e0c8a0', -0.55);
  for (let k = 0; k < 6; k++) { const x = ax + 12 + k * 54; g.beginPath(); g.rect(x, ay - 6, 36, 36); g.arc(x + 18, ay - 6, 18, Math.PI, 0); g.fill(); if (L.lamps) glow(g, x + 18, ay + 4, 26, 'rgba(255,190,110,A)', 0.4); }
  for (const [x, c] of [[ax + 70, '#b3261e'], [ax + 250, '#f3ece0']]) {
    g.strokeStyle = '#4a3420'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, ay - 30); g.lineTo(x + 18, ay - 58); g.stroke();
    g.fillStyle = c; g.beginPath(); g.moveTo(x + 18, ay - 58); g.lineTo(x + 40, ay - 52); g.lineTo(x + 36, ay - 40); g.lineTo(x + 13, ay - 46); g.fill();
  }
}

// Plane trees along the plaza.
function paintTrees(g, L) {
  const rng = makeRng(31);
  for (const [x, y, s] of [[640, 300, 1], [790, 300, 1.1], [930, 305, 1.2]]) {
    g.fillStyle = mix('#8a7a62', L.haze, L.floods ? 0.5 : 0);
    g.beginPath(); g.moveTo(x - 5 * s, y); g.lineTo(x - 3 * s, y - 70 * s); g.lineTo(x + 3 * s, y - 70 * s); g.lineTo(x + 5 * s, y); g.fill();
    for (let k = 0; k < 26; k++) {
      const a = rng.next() * Math.PI * 2, r = rng.next() * 42 * s;
      g.fillStyle = L.floods ? mix('#2e4a2a', '#101a14', rng.next() * 0.5) : mix('#6a8a3a', '#3e5a26', rng.next());
      g.beginPath(); g.arc(x + Math.cos(a) * r, y - 92 * s + Math.sin(a) * r * 0.6, (12 + rng.next() * 12) * s, 0, Math.PI * 2); g.fill();
    }
    if (!L.floods) { g.fillStyle = 'rgba(255,240,190,0.18)'; g.beginPath(); g.arc(x + 14 * s, y - 104 * s, 26 * s, 0, Math.PI * 2); g.fill(); }
  }
}

// Strings of fiesta bulbs and bunting across the plaza.
function paintLights(g, L) {
  const strings = [[250, 22, 960, 70, 60], [-20, 80, 330, 30, 30], [560, 170, 960, 200, 30]];
  const cols = ['#c0392b', '#f3ece0', '#2e7d4f'];
  for (const [si, [ax, ay, bx, by, sag]] of strings.entries()) {
    g.strokeStyle = 'rgba(40,28,16,0.75)'; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + sag, bx, by); g.stroke();
    for (let t = 0.02, k = 0; t < 1; t += 0.03, k++) {
      const x = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * ((ax + bx) / 2) + t * t * bx;
      const y = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * ((ay + by) / 2 + sag) + t * t * by;
      if (si === 2 || (L.lamps && k % 2)) {
        if (L.lamps && (si !== 2 || k % 3 === 0)) { g.save(); g.globalCompositeOperation = 'lighter'; glow(g, x, y + 4, 12, 'rgba(255,200,120,A)', si === 2 ? 0.22 : 0.4); g.restore(); }
        g.fillStyle = L.lamps ? '#fff2c8' : '#e8e0c8'; g.beginPath(); g.arc(x, y + 4, 2.4, 0, Math.PI * 2); g.fill();
      } else {
        g.fillStyle = cols[k % 3];
        g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x + 6, y); g.lineTo(x, y + 13); g.fill();
      }
    }
  }
}

// Paint on the left wall (x = 0) as if on a flat panel: draw(c) paints in a
// 100x100 square that is mapped onto the wall between y0 (left edge, as
// seen) and y1, from height z0 (top) down to z1. Affine is close enough for
// a panel this small.
function onWall(g, y0, y1, z0, z1, draw) {
  const [ax, ay] = project(0, y0, z0), [ux, uy] = project(0, y1, z0), [vx, vy] = project(0, y0, z1);
  g.save();
  g.transform((ux - ax) / 100, (uy - ay) / 100, (vx - ax) / 100, (vy - ay) / 100, ax, ay);
  draw(g);
  g.restore();
}

// ---- the frontón --------------------------------------------------------------------------------

// The frontis: big blocks of ashlar, the metal chapa at its foot, red lines, and the arms of Navarre.
function paintFrontis(g, L) {
  const C = COURT, right = C.w + 1.4;
  quad(g, [[0, 0, 0], [right, 0, 0], [right, 0, C.wall], [0, 0, C.wall]]);
  const [, yTop] = project(0, 0, C.wall), [, yBase] = project(0, 0, 0);
  const face = g.createLinearGradient(0, yTop, 0, yBase);
  face.addColorStop(0, shade(L.stone, 0.12)); face.addColorStop(1, shade(L.stone, -0.06));
  g.fillStyle = face; g.fill();
  const rng = makeRng(17);
  const bh = 0.6;
  for (let z = C.chapa, row = 0; z < C.wall; z += bh, row++) {
    for (let x = row % 2 ? -0.6 : 0; x < right; x += 1.2) {
      const x0 = Math.max(0, x), x1 = Math.min(right, x + 1.2);
      quad(g, [[x0, 0, z], [x1, 0, z], [x1, 0, z + bh], [x0, 0, z + bh]]);
      g.fillStyle = `rgba(${rng.chance(0.5) ? '255,244,220' : '90,64,40'},${0.03 + rng.next() * 0.08})`; g.fill();
      g.strokeStyle = 'rgba(80,56,34,0.35)'; g.lineWidth = 0.9; g.stroke();
      // Bevel: a lit top edge and a shaded bottom edge on every block.
      g.strokeStyle = 'rgba(255,246,226,0.35)'; g.lineWidth = 1; line3(g, [x0 + 0.03, 0, z + bh - 0.04], [x1 - 0.03, 0, z + bh - 0.04]);
      g.strokeStyle = 'rgba(60,40,24,0.25)'; line3(g, [x0 + 0.03, 0, z + 0.03], [x1 - 0.03, 0, z + 0.03]);
    }
  }
  for (let k = 0; k < 260; k++) {
    const x = C.w / 2 + (rng.next() + rng.next() + rng.next() - 1.5) * 6, z = C.chapa + 0.4 + Math.abs(rng.next() + rng.next() - 1) * 5;
    if (x < 0.2 || x > C.w) continue;
    const [sx, sy, s] = project(x, 0, z);
    g.fillStyle = `rgba(80,56,36,${0.05 + rng.next() * 0.08})`;
    g.beginPath(); g.ellipse(sx, sy, 0.08 * s, 0.07 * s, 0, 0, Math.PI * 2); g.fill();
  }
  for (let k = 0; k < 18; k++) {
    const x = rng.next() * C.w, [sx, sy] = project(x, 0, C.wall - 0.4), [, ey] = project(x, 0, C.wall - 2 - rng.next() * 3);
    const gr = g.createLinearGradient(0, sy, 0, ey); gr.addColorStop(0, 'rgba(80,60,40,0.12)'); gr.addColorStop(1, 'rgba(80,60,40,0)');
    g.fillStyle = gr; g.fillRect(sx, sy, 2 + rng.next() * 3, ey - sy);
  }
  quad(g, [[-0.4, 0, C.wall - 0.1], [right + 0.3, 0, C.wall - 0.1], [right + 0.3, 0, C.wall + 0.5], [-0.4, 0, C.wall + 0.5]]);
  g.fillStyle = shade(L.stoneD, -0.05); g.fill();
  // The chapa: a band of steel. Below its top edge is a fault.
  quad(g, [[0, 0, 0], [C.w, 0, 0], [C.w, 0, C.chapa], [0, 0, C.chapa]]);
  const [, cTop] = project(0, 0, C.chapa);
  const steel = g.createLinearGradient(0, cTop, 0, yBase);
  steel.addColorStop(0, '#b8c0c8'); steel.addColorStop(0.35, '#7e878f'); steel.addColorStop(1, '#4a5057');
  g.fillStyle = steel; g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1; line3(g, [0, 0, C.chapa - 0.06], [C.w, 0, C.chapa - 0.06]);
  for (let x = 0.4; x < C.w; x += 0.8) { const [sx, sy] = project(x, 0, C.chapa / 2); g.fillStyle = '#353b41'; g.beginPath(); g.arc(sx, sy, 1.4, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(sx - 0.4, sy - 0.4, 0.6, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#b3261e'; g.lineWidth = 3;
  line3(g, [0, 0, C.chapa], [C.w, 0, C.chapa]);
  line3(g, [0, 0, C.top], [C.w, 0, C.top]);
  line3(g, [C.w, 0, 0], [C.w, 0, C.wall]);
  // The arms of Navarre carved into a stone high on the frontis.
  const [hx, hy, hs] = project(C.w / 2, 0, C.top + 0.5);
  g.save(); g.translate(hx, hy); g.scale(hs / 40, hs / 40);
  g.fillStyle = shade(L.stoneD, 0.05); g.beginPath(); g.ellipse(0, 0, 30, 18, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(-14, -12); g.lineTo(14, -12); g.lineTo(14, 3); g.quadraticCurveTo(14, 12, 0, 16); g.quadraticCurveTo(-14, 12, -14, 3); g.closePath();
  g.fillStyle = '#b3261e'; g.fill(); g.strokeStyle = '#e8b840'; g.lineWidth = 1.8; g.stroke();
  g.save(); g.clip(); g.lineWidth = 1.5;
  for (const [a, b, c, d] of [[-14, -12, 14, 16], [14, -12, -14, 16], [0, -12, 0, 16], [-14, 1, 14, 1]]) { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
  g.restore();
  g.fillStyle = '#e8b840'; g.beginPath(); g.moveTo(-10, -13); g.lineTo(-6, -19); g.lineTo(0, -15); g.lineTo(6, -19); g.lineTo(10, -13); g.fill();
  g.restore();
}

// The left wall, the whole length of the court, with its numbered cuadros.
function paintLeftWall(g, L) {
  const C = COURT, far = C.l + 9;
  quad(g, [[0, 0, 0], [0, far, 0], [0, far, C.wall], [0, 0, C.wall]]);
  const [xa] = project(0, far, 0), [xb] = project(0, 0, 0);
  const lw = g.createLinearGradient(xa, 0, xb, 0);
  lw.addColorStop(0, shade(L.stone, -0.12)); lw.addColorStop(1, shade(L.stone, 0.05));
  g.fillStyle = lw; g.fill();
  const rng = makeRng(41);
  for (let z = 0.6, row = 0; z < C.wall; z += 0.6, row++) {
    g.strokeStyle = 'rgba(90,64,40,0.2)'; g.lineWidth = 0.9; line3(g, [0, 0, z], [0, far, z]);
    for (let y = row % 2 ? 0.6 : 0; y < far; y += 1.2) { g.strokeStyle = `rgba(90,64,40,${0.1 + rng.next() * 0.1})`; line3(g, [0, y, z - 0.6], [0, y, z]); }
  }
  // The cuadro lines run up the wall, and each has its number painted on
  // the stone beside it, in the wall's own perspective.
  for (let k = 1; k <= 7; k++) {
    const y = k * 4;
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2; line3(g, [0, y, 0], [0, y, 2.2]);
    // Big white numerals painted straight onto the stone, just past the line.
    // The wall recedes steeply, so the numeral is laid out along enough of
    // it to keep a natural shape on screen.
    const zTop = 2.9, zBot = 1.7;
    const [, yA] = project(0, y, zTop), [, yB] = project(0, y, zBot);
    const hPx = Math.abs(yB - yA);
    let y1 = y - 0.2;
    while (y1 > y - 6 && Math.abs(project(0, y1, zTop)[0] - project(0, y, zTop)[0]) < hPx * 0.62) y1 -= 0.05;
    onWall(g, y - 0.15, y1 - 0.15, zTop, zBot, (c) => {
      c.font = 'bold 118px "Trebuchet MS", "DejaVu Sans", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 7; c.strokeStyle = 'rgba(90,64,40,0.35)'; c.strokeText(String(k), 50, 56);
      c.fillStyle = 'rgba(250,248,240,0.92)'; c.fillText(String(k), 50, 56);
      // Worn paint: a few flecks of stone showing through.
      c.fillStyle = 'rgba(200,170,120,0.35)';
      for (let f = 0; f < 10; f++) c.fillRect(20 + ((f * 37 + k * 11) % 60), 15 + ((f * 53 + k * 7) % 80), 3, 2);
    });
  }
  for (let y = 1; y < far; y += 0.5) {
    const [sx, sy, s] = project(0, y, C.wall - 0.2 - rng.next() * 0.8);
    g.fillStyle = mix('#4f7a2a', '#2c4a18', rng.next());
    g.beginPath(); g.ellipse(sx, sy, 0.3 * s, 0.22 * s, rng.next() * 3, 0, Math.PI * 2); g.fill();
  }
  quad(g, [[0, 0, 0], [0, 3, 0], [0, 3, C.wall], [0, 0, C.wall]]);
  g.fillStyle = 'rgba(40,24,10,0.18)'; g.fill();
}

function paintFloor(g, L) {
  const C = COURT, far = C.l + 9;
  quad(g, [[C.w, -1, 0], [C.w + 14, -1, 0], [C.w + 14, far, 0], [C.w, far, 0]]);
  g.fillStyle = mix('#a8957a', L.haze, L.floods ? 0.4 : 0.1); g.fill();
  const rng = makeRng(3);
  g.strokeStyle = 'rgba(70,52,34,0.18)'; g.lineWidth = 0.8;
  for (let y = 0; y < far; y += 0.8) line3(g, [C.w, y, 0], [C.w + 14, y, 0]);
  quad(g, [[0, 0, 0], [C.w, 0, 0], [C.w, far, 0], [0, far, 0]]);
  const [, y0] = project(0, 0, 0), [, y1] = project(0, far, 0);
  const fl = g.createLinearGradient(0, y0, 0, y1);
  fl.addColorStop(0, L.floor[0]); fl.addColorStop(1, L.floor[1]);
  g.fillStyle = fl; g.fill();
  // Fine grain in the concrete, and scuffs where the players run most.
  for (let k = 0; k < 2200; k++) {
    const [sx, sy, s] = project(rng.range(0, C.w), rng.range(0, far), 0);
    g.fillStyle = rng.chance(0.5) ? 'rgba(255,248,230,0.06)' : 'rgba(60,46,30,0.06)';
    g.fillRect(sx, sy, Math.max(0.6, 0.04 * s), Math.max(0.4, 0.015 * s));
  }
  for (let k = 0; k < 40; k++) {
    const [sx, sy, s] = project(rng.range(2, 8), rng.range(12, 26), 0);
    g.strokeStyle = 'rgba(70,56,40,0.07)'; g.lineWidth = Math.max(0.8, 0.03 * s);
    g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx + 0.3 * s, sy - 0.02 * s, sx + rng.range(0.4, 1) * s, sy + rng.range(-0.05, 0.05) * s); g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2.4;
  line3(g, [C.w, 0, 0], [C.w, C.l, 0]);
  line3(g, [0, C.l, 0], [C.w, C.l, 0]);
  for (let k = 1; k <= 7; k++) { const major = k === 4 || k === 7; g.strokeStyle = `rgba(255,255,255,${major ? 0.85 : 0.35})`; g.lineWidth = major ? 2.2 : 1.2; line3(g, [0, k * 4, 0], [C.w, k * 4, 0]); }
}

// The stands on the open right side, full of the village in fiesta whites.
function paintStands(g, L, frame) {
  const C = COURT, rows = 6;
  for (let r = rows - 1; r >= 0; r--) {
    const x = C.w + 3.5 + r * 1.0, z = 0.35 + r * 0.5;
    quad(g, [[x, -1, z], [x, C.l + 9, z], [x + 1, C.l + 9, z], [x + 1, -1, z]]);
    g.fillStyle = mix(mix('#b09878', '#8a7258', r / rows), L.haze, L.floods ? 0.35 : 0); g.fill();
    quad(g, [[x, -1, z - 0.5], [x, C.l + 9, z - 0.5], [x, C.l + 9, z], [x, -1, z]]);
    g.fillStyle = mix(mix('#8a7258', '#6e5a44', r / rows), L.haze, L.floods ? 0.35 : 0); g.fill();
    // The spectators are drawn every frame by crowd.js.
  }
}

// Floodlights for the night match: poles on the right, pools of light on the court.
function paintFloods(g, L, stage) {
  if (!L.floods) return;
  for (const y of [6, 20]) {
    const x = COURT.w + 2.5;
    if (stage === 'poles') {
      const [bx, by] = project(x, y, 0), [tx, ty, s] = project(x, y, 12);
      g.strokeStyle = '#2a2a32'; g.lineWidth = Math.max(2, 0.2 * s); g.beginPath(); g.moveTo(bx, by); g.lineTo(tx, ty); g.stroke();
      g.fillStyle = '#3a3a44'; g.fillRect(tx - 0.8 * s, ty - 0.3 * s, 1.6 * s, 0.5 * s);
      glow(g, tx, ty, 60, 'rgba(255,248,220,A)', 0.9);
      glow(g, tx, ty, 200, 'rgba(255,236,190,A)', 0.25);
    } else {
      const [px, py, ps] = project(5, y - 3, 0);
      g.save(); g.globalCompositeOperation = 'lighter';
      const pool = g.createRadialGradient(px, py, 0, px, py, 7 * ps);
      pool.addColorStop(0, 'rgba(255,236,190,0.28)'); pool.addColorStop(1, 'rgba(255,236,190,0)');
      g.fillStyle = pool; g.beginPath(); g.ellipse(px, py, 7 * ps, 2.4 * ps, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }
}

// Light and shade over the whole frontón, painted after the stone: the
// church's long shadow at sunset, floodlit pools and dark tops at night.
function paintLight(g, L, light) {
  const C = COURT;
  if (light === 'sunset') {
    // The left wall catches the low sun: warm, fading to the back.
    quad(g, [[0, 0, 0], [0, C.l + 9, 0], [0, C.l + 9, C.wall], [0, 0, C.wall]]);
    const [xa] = project(0, C.l + 9, 0), [xb] = project(0, 0, 0);
    const sun = g.createLinearGradient(xa, 0, xb, 0);
    sun.addColorStop(0, 'rgba(255,150,70,0.28)'); sun.addColorStop(1, 'rgba(255,190,110,0.1)');
    g.fillStyle = sun; g.fill();
    // The church's shadow falls across the right of the frontis and the court.
    g.fillStyle = 'rgba(70,40,90,0.32)';
    quad(g, [[4.5, 0, C.wall + 0.5], [C.w + 1.4, 0, C.wall + 0.5], [C.w + 1.4, 0, 0], [7.2, 0, 0]]); g.fill();
    quad(g, [[7.2, 0, 0], [C.w + 8, 0, 0], [C.w + 8, 16, 0], [3.2, 12, 0]]); g.fill();
    g.fillStyle = 'rgba(255,170,90,0.12)';
    quad(g, [[0, 0, C.wall], [4.5, 0, C.wall + 0.5], [7.2, 0, 0], [0, 0, 0]]); g.fill();
  } else if (light === 'night') {
    // Dark above, light where the floodlights point.
    const [, top] = project(0, 0, C.wall), [, base] = project(0, 0, 0);
    const dark = g.createLinearGradient(0, top - 40, 0, base);
    dark.addColorStop(0, 'rgba(8,10,28,0.7)'); dark.addColorStop(0.55, 'rgba(8,10,28,0.15)'); dark.addColorStop(1, 'rgba(8,10,28,0)');
    g.fillStyle = dark; g.fillRect(0, 0, W, base + 10);
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const [x, z] of [[3, 3], [7.5, 3.5]]) {
      const [px, py, ps] = project(x, 0, z);
      const pool = g.createRadialGradient(px, py, 0, px, py, 5 * ps);
      pool.addColorStop(0, 'rgba(255,240,200,0.28)'); pool.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = pool; g.fillRect(px - 5 * ps, py - 5 * ps, 10 * ps, 10 * ps);
    }
    // Beams from the floodlights down onto the court.
    for (const y of [6, 20]) {
      const [tx, ty] = project(C.w + 2.5, y, 12), [fx, fy] = project(3, y - 6, 0), [gx, gy] = project(8, y - 1, 0);
      const beam = g.createLinearGradient(tx, ty, (fx + gx) / 2, (fy + gy) / 2);
      beam.addColorStop(0, 'rgba(255,244,210,0.16)'); beam.addColorStop(1, 'rgba(255,244,210,0)');
      g.fillStyle = beam; g.beginPath(); g.moveTo(tx, ty); g.lineTo(fx, fy); g.lineTo(gx, gy); g.fill();
    }
    g.restore();
  } else {
    // Afternoon: bright on the left wall, soft shade along the stands.
    g.fillStyle = 'rgba(255,240,200,0.08)';
    quad(g, [[0, 0, 0], [0, C.l + 9, 0], [0, C.l + 9, C.wall], [0, 0, C.wall]]); g.fill();
    // Soft shade from the stands along the right-hand line.
    const [ax] = project(C.w - 1.5, 20, 0), [bx] = project(C.w + 3, 20, 0);
    quad(g, [[C.w - 2, 0, 0], [C.w + 8, 0, 0], [C.w + 8, C.l + 9, 0], [C.w - 2, C.l + 9, 0]]);
    const sh = g.createLinearGradient(ax, 0, bx, 0);
    sh.addColorStop(0, 'rgba(40,40,80,0)'); sh.addColorStop(1, 'rgba(40,40,80,0.14)');
    g.fillStyle = sh; g.fill();
  }
}

// Ivy spilling down the walls: trailing stems with small leaves, lit on top.
function paintIvy(g) {
  const rng = makeRng(61);
  const leaf = (sx, sy, r, rot, dark) => {
    g.save(); g.translate(sx, sy); g.rotate(rot);
    g.fillStyle = mix(dark ? '#2f4a1a' : '#5d8f34', '#1e3010', rng.next() * 0.4);
    g.beginPath(); g.moveTo(0, r); g.bezierCurveTo(-r * 1.2, 0, -r * 0.5, -r, 0, -r * 0.4); g.bezierCurveTo(r * 0.5, -r, r * 1.2, 0, 0, r); g.fill();
    g.restore();
  };
  const stem = (at, len) => {
    let [x, y, z] = at;
    const pts = [];
    for (let k = 0; k < len; k++) { z -= 0.12; y += (rng.next() - 0.5) * 0.1; pts.push([x, y, z]); }
    g.strokeStyle = 'rgba(70,50,30,0.5)'; g.lineWidth = 0.8;
    g.beginPath(); pts.forEach((p, k) => { const [sx, sy] = x === 0 ? project(0.01, p[1], p[2]) : project(p[0], 0.01, p[2]); if (k) g.lineTo(sx, sy); else g.moveTo(sx, sy); }); g.stroke();
    pts.forEach((p, k) => {
      const [sx, sy, s] = x === 0 ? project(0.01, p[1], p[2]) : project(p[0], 0.01, p[2]);
      const r = Math.min(4.5, 0.07 * s) * (1 - k / len * 0.5);
      leaf(sx + (k % 2 ? r : -r) * 0.8, sy, r, (k % 2 ? 0.6 : -0.6) + rng.next() * 0.4, rng.chance(0.4));
    });
  };
  // A mat of leaves along the top of the left wall, with stems trailing down.
  for (let y = 1; y < 20; y += 0.18) {
    const [sx, sy, s] = project(0.01, y, 9.8 - rng.next() * 0.3);
    leaf(sx, sy, Math.min(4.5, 0.08 * s), rng.next() * 6, rng.chance(0.5));
  }
  for (const [y, len] of [[2, 14], [3.1, 8], [5.5, 20], [6.2, 11], [9, 16], [12.5, 24], [13.2, 12], [17, 18]]) stem([0, y, 9.7], len);
  for (const [x, len] of [[0.5, 12], [1.2, 7]]) stem([x, 0, 9.7], len);
}

// Swallows over the plaza.
function paintBirds(g, light) {
  const rng = makeRng(71);
  g.strokeStyle = light === 'night' ? 'rgba(20,20,40,0.6)' : 'rgba(40,30,30,0.75)'; g.lineWidth = 1.4;
  for (let k = 0; k < 7; k++) {
    const x = 560 + rng.next() * 380, y = 20 + rng.next() * 110, s = 4 + rng.next() * 4;
    g.beginPath(); g.moveTo(x - s, y - s * 0.3); g.quadraticCurveTo(x - s * 0.4, y - s * 0.6, x, y); g.quadraticCurveTo(x + s * 0.4, y - s * 0.6, x + s, y - s * 0.3); g.stroke();
  }
}

function paintScene(light, frame) {
  const L = LIGHTS[light];
  const [c, g] = canvas(W, H);
  paintSky(g, L);
  paintHills(g, L);
  paintChurch(g, L);
  paintHouses(g, L);
  paintTrees(g, L);
  paintFloor(g, L);
  paintFloods(g, L, 'pools');
  paintStands(g, L, frame);
  paintLeftWall(g, L);
  paintFrontis(g, L);
  paintIvy(g);
  paintLight(g, L, light);
  if (light !== 'night') paintBirds(g, light);
  const warm = g.createLinearGradient(W, 0, 0, H);
  warm.addColorStop(0, L.warm); warm.addColorStop(1, 'rgba(40,20,40,0.12)');
  g.fillStyle = warm; g.fillRect(0, 0, W, H);
  g.fillStyle = L.amb; g.fillRect(0, 0, W, H);
  paintFloods(g, L, 'poles');
  paintLights(g, L);
  return c;
}

export function scene(light = 'sunset', cheer = false) { return cached(`scene.${light}.${cheer ? 1 : 0}`, () => paintScene(light, cheer)); }

// Grain and vignette.
function grunge() {
  return cached('grunge', () => {
    const [c, g] = canvas(W, H);
    const rng = makeRng(77);
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = rng.chance(0.6) ? `rgba(30,18,6,${0.03 + rng.next() * 0.05})` : `rgba(255,246,222,${0.025 + rng.next() * 0.04})`;
      g.fillRect(rng.next() * W, rng.next() * H, 0.6 + rng.next(), 0.6 + rng.next());
    }
    const v = g.createRadialGradient(W / 2, H * 0.5, H * 0.42, W / 2, H * 0.5, W * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(14,8,4,0.4)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    return c;
  });
}
export function finish(ctx) { ctx.drawImage(grunge(), 0, 0, W, H); }

// ---- the pelotaris, seen from behind -------------------------------------------------------

export const TEAM = [
  { shirt: '#c8342a', shirtD: '#8a2018', name: 'red' },
  { shirt: '#2f72b0', shirtD: '#1c4a78', name: 'blue' },
];

// Drawn in metres about the feet, scaled to pixels, seen from behind.
// Light comes from the right (the sun) or from above (the floodlights).
export function pelotari(ctx, pl, t, { turn = false, anim = {}, light = 'sunset', reflection = false } = {}) {
  const L = LIGHTS[light];
  const [sx, sy, s] = project(pl.x, pl.y, 0);
  const T = TEAM[pl.i];
  const speed = Math.hypot(pl.vx, pl.vy), moving = speed > 0.6;
  const run = anim.run ?? 0;
  const swing = pl.swing > 0 ? 1 - pl.swing / 0.3 : -1;
  // Knees bend when ready or running; the body bobs with each stride.
  const ready = turn && !moving && swing < 0;
  const crouch = swing >= 0 ? 0.1 * Math.sin(swing * Math.PI) + 0.06 : ready ? 0.14 : moving ? 0.07 : 0.03;
  const bob = moving ? Math.abs(Math.sin(run)) * 0.045 : 0;
  const lean = Math.max(-0.12, Math.min(0.12, pl.vx * 0.018));
  if (!reflection) {
    // Soft shadows: a pool at the feet, and a long, blurred one cast away from the light.
    const [shx, shy, shl] = L.shadow;
    ctx.save();
    ctx.filter = 'blur(3px)';
    ctx.translate(sx, sy); ctx.transform(1, 0, shx, shy, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, -1.8 * s);
    g.addColorStop(0, `rgba(30,18,8,${shl})`); g.addColorStop(1, 'rgba(30,18,8,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -0.9 * s, 0.24 * s, 0.9 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    const pool = ctx.createRadialGradient(sx, sy, 0, sx, sy, 0.5 * s);
    pool.addColorStop(0, 'rgba(30,18,8,0.4)'); pool.addColorStop(1, 'rgba(30,18,8,0)');
    ctx.fillStyle = pool; ctx.beginPath(); ctx.ellipse(sx, sy, 0.5 * s, 0.13 * s, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (turn) {
    ctx.strokeStyle = T.shirt; ctx.lineWidth = Math.max(2, 0.06 * s);
    ctx.globalAlpha = 0.6 + Math.sin(t * 6) * 0.3;
    ctx.beginPath(); ctx.ellipse(sx, sy, 0.62 * s, 0.16 * s, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.save(); ctx.translate(sx, sy); ctx.scale(s, s); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // Seen from behind, limbs swing toward and away from the camera, so a
  // swing shows as a limb getting shorter and the foot lifting, not as a
  // sideways splay.
  const hipY = -0.94 + crouch - bob;
  const cx = lean * 0.6;
  const stance = ready ? 0.15 : 0.09;
  const trou = '#f3efe7', trouD = '#d6cfc2', skin = '#e3ad84', skinD = '#bb8660';
  // Legs: far (left) then near (right).
  const legPh = moving ? [Math.sin(run), -Math.sin(run)] : [0, 0];
  legPh.forEach((ph, k) => {
    const side = k ? 1 : -1;
    const lift = Math.max(0, ph) * 0.2;        // the foot kicks up behind
    const hx = cx + side * 0.085, fx = side * (stance + 0.02);
    const kneeY = hipY + 0.44 - lift * 0.3, footY = -0.04 - lift;
    ctx.fillStyle = k ? trouD : trou;
    ctx.beginPath();
    ctx.moveTo(hx - 0.085, hipY); ctx.lineTo(hx + 0.085, hipY);
    ctx.lineTo(fx + 0.07, kneeY); ctx.lineTo(fx + 0.06, footY - 0.03);
    ctx.lineTo(fx - 0.06, footY - 0.03); ctx.lineTo(fx - 0.075, kneeY); ctx.closePath(); ctx.fill();
    // Shoe: when the foot lifts we see its sole.
    ctx.fillStyle = lift > 0.05 ? '#8a7a6a' : '#fafaf6';
    ctx.beginPath(); ctx.ellipse(fx, footY, 0.068, lift > 0.05 ? 0.05 : 0.04, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a3230'; ctx.fillRect(fx - 0.065, footY + 0.02, 0.13, 0.022);
  });
  // The shirt: a polo tucked into the trousers, shoulders rounded.
  const twist = swing >= 0 ? Math.sin(swing * Math.PI) * 0.06 : 0;
  const top = hipY - 0.56;
  const sw = 0.22; // half shoulder width
  const shirtG = ctx.createLinearGradient(cx - sw, 0, cx + sw, 0);
  shirtG.addColorStop(0, shade(T.shirt, -0.3)); shirtG.addColorStop(0.55, T.shirt); shirtG.addColorStop(1, shade(T.shirt, 0.18));
  // Far arm first, behind the body.
  const arm = (shx, shy, fwd, out, near) => {
    // fwd: -1 (back) .. 1 (forward, away from camera): foreshortens the arm.
    const len = 0.52 * (1 - Math.abs(fwd) * 0.45);
    const elx = shx + out * 0.05, ely = shy + len * 0.5;
    const hx2 = shx + out * 0.07, hy2 = shy + len;
    ctx.strokeStyle = near ? skin : skinD; ctx.lineWidth = 0.075;
    ctx.beginPath(); ctx.moveTo(shx, shy + 0.1); ctx.lineTo(elx, ely); ctx.lineTo(hx2, hy2); ctx.stroke();
    // Sleeve over the upper arm.
    ctx.fillStyle = near ? T.shirt : shade(T.shirt, -0.25);
    ctx.beginPath(); ctx.ellipse(shx + out * 0.015, shy + 0.08, 0.06, 0.1, 0, 0, Math.PI * 2); ctx.fill();
    // Hand, with a white band of tape across the palm.
    ctx.fillStyle = near ? skin : skinD; ctx.beginPath(); ctx.arc(hx2, hy2 + 0.02, 0.04, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f6f3ec'; ctx.fillRect(hx2 - 0.04, hy2 + 0.005, 0.08, 0.025);
  };
  const swingArm = moving ? Math.sin(run) : 0;
  arm(cx - sw + 0.02, top + 0.02, -swingArm, -1, false);
  // Body.
  ctx.fillStyle = shirtG;
  ctx.beginPath();
  ctx.moveTo(cx - 0.17, hipY + 0.02);
  ctx.lineTo(cx - 0.185, top + 0.2);
  ctx.quadraticCurveTo(cx - sw - 0.01, top + 0.04, cx - sw + 0.05, top - 0.01);
  ctx.quadraticCurveTo(cx, top - 0.06, cx + sw - 0.05, top - 0.01);
  ctx.quadraticCurveTo(cx + sw + 0.01, top + 0.04, cx + 0.185, top + 0.2);
  ctx.lineTo(cx + 0.17, hipY + 0.02);
  ctx.closePath(); ctx.fill();
  // Soft folds where the shirt tucks in.
  ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 0.012;
  ctx.beginPath(); ctx.moveTo(cx - 0.1, hipY - 0.12); ctx.quadraticCurveTo(cx - 0.06, hipY - 0.02, cx - 0.02, hipY); ctx.moveTo(cx + 0.09, hipY - 0.1); ctx.quadraticCurveTo(cx + 0.06, hipY - 0.02, cx + 0.03, hipY); ctx.stroke();
  // Collar.
  ctx.fillStyle = shade(T.shirt, -0.15); ctx.beginPath(); ctx.ellipse(cx, top - 0.02, 0.08, 0.03, 0, 0, Math.PI * 2); ctx.fill();
  // Trouser waistband.
  ctx.fillStyle = trou; ctx.fillRect(cx - 0.175, hipY - 0.005, 0.35, 0.045);
  // Light along the lit edge.
  ctx.strokeStyle = light === 'night' ? 'rgba(255,248,220,0.3)' : 'rgba(255,232,190,0.55)'; ctx.lineWidth = 0.018;
  ctx.beginPath(); ctx.moveTo(cx + sw - 0.04, top + 0.02); ctx.quadraticCurveTo(cx + 0.19, top + 0.2, cx + 0.17, hipY - 0.02); ctx.stroke();
  // Near (right, striking) arm.
  let hand;
  if (swing >= 0 || ready) {
    // The swing: from low behind the hip, up and forward past the shoulder.
    const k = swing >= 0 ? swing : 0;
    const ang = -0.4 - k * 2.4; // radians, from pointing down-right to up-left-ish
    const shx = cx + sw - 0.02 - twist, shy = top + 0.03;
    const reach = 0.5 * (1 - Math.sin(k * Math.PI) * 0.25);
    const ex = shx + Math.cos(ang + Math.PI / 2) * reach * 0.5, ey = shy + Math.sin(ang + Math.PI / 2) * reach * 0.5;
    const hx2 = shx + Math.cos(ang + Math.PI / 2 - 0.2) * reach, hy2 = shy + Math.sin(ang + Math.PI / 2 - 0.2) * reach;
    ctx.fillStyle = T.shirt; ctx.beginPath(); ctx.ellipse(shx, shy + 0.07, 0.06, 0.1, ang * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = skin; ctx.lineWidth = 0.075; ctx.beginPath(); ctx.moveTo(shx, shy + 0.1); ctx.lineTo(ex, ey); ctx.lineTo(hx2, hy2); ctx.stroke();
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(hx2, hy2, 0.042, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f6f3ec'; ctx.fillRect(hx2 - 0.042, hy2 - 0.012, 0.084, 0.025);
    hand = [hx2, hy2];
    if (swing >= 0 && swing < 0.7) {
      ctx.strokeStyle = `rgba(255,250,235,${0.5 * (1 - swing)})`; ctx.lineWidth = 0.04;
      ctx.beginPath(); ctx.arc(shx, shy, reach * 0.95, Math.PI / 2 - 0.6, Math.PI / 2 - 0.6 - k * 2.4, true); ctx.stroke();
    }
  } else {
    arm(cx + sw - 0.02, top + 0.02, swingArm, 1, true);
  }
  // Neck and head from behind: hair with a lit crown, ears.
  const hx = cx - twist * 0.3, hy = top - 0.17;
  ctx.fillStyle = skinD; ctx.fillRect(hx - 0.045, top - 0.1, 0.09, 0.1);
  ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(hx - 0.112, hy + 0.02, 0.026, 0.042, -0.2, 0, Math.PI * 2); ctx.ellipse(hx + 0.112, hy + 0.02, 0.026, 0.042, 0.2, 0, Math.PI * 2); ctx.fill();
  const hair = pl.i ? '#2a1c14' : '#4a3222';
  const hg = ctx.createRadialGradient(hx + 0.035, hy - 0.06, 0.01, hx, hy, 0.15);
  hg.addColorStop(0, shade(hair, 0.3)); hg.addColorStop(1, hair);
  ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(hx, hy, 0.115, 0.13, 0, 0, Math.PI * 2); ctx.fill();
  // Short hair at the nape.
  ctx.fillStyle = hair; ctx.beginPath(); ctx.moveTo(hx - 0.09, hy + 0.06); ctx.quadraticCurveTo(hx, hy + 0.15, hx + 0.09, hy + 0.06); ctx.fill();
  ctx.restore();
  return hand;
}

// The ball: leather, its streak when it flies fast, its shadow.
export function drawBall(ctx, b, t, trail, light) {
  const L = LIGHTS[light];
  const [hx, hy, hs] = project(b.x, b.y, 0);
  const lift = Math.min(1, b.z / 4);
  ctx.fillStyle = `rgba(30,18,8,${0.38 - lift * 0.22})`;
  ctx.beginPath(); ctx.ellipse(hx + L.shadow[0] * b.z * hs * 0.4, hy, (0.13 + lift * 0.08) * hs, 0.05 * hs, 0, 0, Math.PI * 2); ctx.fill();
  if (trail.length > 1) {
    const [x0, y0] = project(trail[0].x, trail[0].y, trail[0].z), [x1, y1, s1] = project(b.x, b.y, b.z);
    const gr = ctx.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, 'rgba(255,248,230,0)'); gr.addColorStop(1, 'rgba(255,248,230,0.55)');
    ctx.strokeStyle = gr; ctx.lineWidth = Math.max(2, 0.18 * s1); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  const [x, y, s] = project(b.x, b.y, b.z);
  const r = Math.max(3.5, 0.11 * s);
  if (L.floods) glow(ctx, x, y, r * 3, 'rgba(255,250,230,A)', 0.25);
  const gr = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  gr.addColorStop(0, '#fffdf6'); gr.addColorStop(0.65, '#ece2cc'); gr.addColorStop(1, '#a8987a');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(130,86,50,0.7)'; ctx.lineWidth = Math.max(0.8, r * 0.14);
  ctx.beginPath(); ctx.arc(x, y, r * 0.62, t * 9, t * 9 + 2.2); ctx.stroke();
}

// The timing ring: closes on the ball's shadow as it comes into reach, gold when a hit would be perfect.
export function drawTiming(ctx, m, perfectAt) {
  const tm = m.timing?.();
  if (!tm || m.p[tm.p].ai) return;
  const b = m.ball;
  const [x, y, s] = project(b.x, b.y, 0);
  const near = Math.max(0, 1 - Math.max(0, tm.d - 1.2) / 5);
  if (near <= 0) return;
  const perfect = tm.reach && tm.q >= perfectAt;
  const r = (0.3 + (1 - tm.q) * 1.2) * s;
  ctx.strokeStyle = perfect ? 'rgba(255,214,90,0.95)' : tm.reach ? 'rgba(255,255,255,0.8)' : `rgba(255,255,255,${0.35 * near})`;
  ctx.lineWidth = perfect ? 3.5 : 2;
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
  if (perfect) glow(ctx, x, y, r * 1.4, 'rgba(255,214,90,A)', 0.35);
}

// Dust puffs, chips of plaster, confetti: short-lived bits.
export function drawFx(ctx, fx) {
  for (const p of fx) {
    const a = Math.max(0, p.life / p.max);
    const [x, y, s] = project(p.x, p.y, p.z);
    ctx.globalAlpha = a * (p.alpha ?? 1);
    ctx.fillStyle = p.colour;
    ctx.beginPath();
    if (p.kind === 'puff') ctx.arc(x, y, (p.size + (1 - a) * p.grow) * s, 0, Math.PI * 2);
    else if (p.kind === 'confetti') ctx.rect(x - 2, y - 1, 4, 2.5);
    else ctx.arc(x, y, Math.max(1, p.size * s), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// A mark where the ball struck the frontis or bounced.
export function drawMarks(ctx, marks) {
  for (const m of marks) {
    const a = Math.max(0, m.life / m.max);
    const [x, y, s] = project(m.x, m.y, m.z);
    ctx.strokeStyle = m.bad ? `rgba(220,40,30,${a})` : `rgba(255,255,255,${a * 0.85})`;
    ctx.lineWidth = m.bad ? 3 : 2;
    ctx.beginPath();
    if (m.y === 0) ctx.arc(x, y, (0.2 + (1 - a) * 0.5) * s, 0, Math.PI * 2);
    else ctx.ellipse(x, y, (0.25 + (1 - a) * 0.6) * s, (0.07 + (1 - a) * 0.18) * s, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// The judge (juez) on a high chair beside the court, following the play.
function judge(ctx, m, t, light) {
  const [sx, sy, u] = project(COURT.w + 1.3, 15, 0);
  const [bx] = project(m.ball.x, m.ball.y, m.ball.z);
  const turn = Math.max(-1, Math.min(1, (bx - sx) / 200)) * 0.7 - 0.3;
  ctx.save(); ctx.translate(sx, sy); ctx.scale(u, u); ctx.lineCap = 'round';
  ctx.fillStyle = 'rgba(30,18,8,0.3)'; ctx.beginPath(); ctx.ellipse(-0.3, 0, 0.5, 0.1, 0, 0, Math.PI * 2); ctx.fill();
  // The chair.
  ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 0.06;
  ctx.beginPath(); ctx.moveTo(-0.25, 0); ctx.lineTo(-0.2, -1.0); ctx.moveTo(0.25, 0); ctx.lineTo(0.2, -1.0); ctx.moveTo(-0.22, -0.5); ctx.lineTo(0.22, -0.5); ctx.stroke();
  ctx.fillStyle = '#7a5530'; ctx.fillRect(-0.3, -1.05, 0.6, 0.07);
  // Legs dangling, white trousers.
  ctx.strokeStyle = '#ece6da'; ctx.lineWidth = 0.13;
  ctx.beginPath(); ctx.moveTo(-0.08, -1.02); ctx.lineTo(-0.12, -0.65); ctx.moveTo(0.08, -1.02); ctx.lineTo(0.06, -0.65); ctx.stroke();
  // White shirt, red sash and pañuelo, black txapela.
  ctx.fillStyle = '#f4f0e8'; ctx.beginPath(); ctx.moveTo(-0.2, -1.02); ctx.lineTo(-0.22, -1.48); ctx.quadraticCurveTo(0, -1.6, 0.22, -1.48); ctx.lineTo(0.2, -1.02); ctx.fill();
  ctx.fillStyle = '#b3261e'; ctx.fillRect(-0.21, -1.12, 0.42, 0.07);
  ctx.beginPath(); ctx.moveTo(-0.1, -1.52); ctx.lineTo(0.1, -1.52); ctx.lineTo(0, -1.4); ctx.fill();
  const hx = turn * 0.02, hy = -1.68;
  ctx.fillStyle = '#e2ae88'; ctx.beginPath(); ctx.ellipse(hx, hy, 0.1, 0.12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a1a10'; ctx.beginPath(); ctx.arc(hx + turn * 0.05 - 0.03, hy - 0.01, 0.012, 0, Math.PI * 2); ctx.arc(hx + turn * 0.05 + 0.03, hy - 0.01, 0.012, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8a8a88'; ctx.beginPath(); ctx.ellipse(hx + turn * 0.03 , hy + 0.06, 0.05, 0.02, 0, 0, Math.PI * 2); ctx.fill(); // grey moustache
  ctx.fillStyle = '#16161e'; ctx.beginPath(); ctx.ellipse(hx, hy - 0.1, 0.14, 0.05, -0.08, 0, Math.PI * 2); ctx.fill();
  // One arm resting; the other raised to signal when a point ends.
  ctx.strokeStyle = '#f4f0e8'; ctx.lineWidth = 0.08;
  const signal = m.phase === 'point' && m.phaseT < 1.5;
  ctx.beginPath(); ctx.moveTo(0.19, -1.44); ctx.lineTo(signal ? 0.3 : 0.24, signal ? -1.75 : -1.2); ctx.lineTo(signal ? 0.34 : 0.14, signal ? -2.0 : -1.06); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-0.19, -1.44); ctx.lineTo(-0.24, -1.2); ctx.lineTo(-0.12, -1.06); ctx.stroke();
  ctx.restore();
}

// The aim: an arrow on the floor at the striker's feet showing the shot the
// held direction will play, and its name.
export function drawAim(ctx, pl, aim, t) {
  if (!aim) return;
  const C = COURT, to = {
    drive: [pl.x, pl.y - 5], txoko: [0.6, pl.y - 4.5], ancho: [C.w - 0.4, pl.y - 4.5], globo: [pl.x, pl.y - 5], dejada: [pl.x, pl.y - 2.6],
  }[aim.kind];
  const [x0, y0, s0] = project(pl.x, pl.y - 0.3, 0.02);
  const [x1, y1] = project(to[0], to[1], 0.02);
  const pulse = 0.75 + Math.sin(t * 8) * 0.2;
  ctx.save();
  ctx.strokeStyle = `rgba(255,236,160,${pulse})`; ctx.fillStyle = `rgba(255,236,160,${pulse})`;
  ctx.lineWidth = Math.max(3, 0.12 * s0); ctx.lineCap = 'round'; ctx.setLineDash([10, 8]);
  ctx.beginPath(); ctx.moveTo(x0, y0);
  if (aim.kind === 'globo') { ctx.quadraticCurveTo((x0 + x1) / 2, y0 - 90, x1, y1 - 20); } else ctx.lineTo(x1, y1);
  ctx.stroke(); ctx.setLineDash([]);
  const ex = x1, ey = aim.kind === 'globo' ? y1 - 20 : y1, a = Math.atan2(ey - (aim.kind === 'globo' ? y0 - 60 : y0), ex - x0);
  ctx.beginPath(); ctx.moveTo(ex + Math.cos(a) * 10, ey + Math.sin(a) * 10);
  ctx.lineTo(ex + Math.cos(a + 2.5) * 12, ey + Math.sin(a + 2.5) * 12); ctx.lineTo(ex + Math.cos(a - 2.5) * 12, ey + Math.sin(a - 2.5) * 12); ctx.fill();
  // The shot's name in a small pill by the feet.
  ctx.font = 'bold 13px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center';
  const w = ctx.measureText(aim.label).width + 14, lx = x0, ly = y0 + 22;
  ctx.fillStyle = 'rgba(28,20,12,0.8)'; ctx.beginPath(); ctx.roundRect(lx - w / 2, ly - 12, w, 18, 9); ctx.fill();
  ctx.fillStyle = '#ffe9a0'; ctx.fillText(aim.label, lx, ly + 2);
  ctx.restore();
}

// The whole court with the match in progress.
export function drawCourt(ctx, m, t, view = {}) {
  const light = view.light ?? 'sunset';
  ctx.save();
  if (view.shake > 0) ctx.translate((Math.random() - 0.5) * view.shake * 6, (Math.random() - 0.5) * view.shake * 4);
  ctx.drawImage(scene(light), -4, -4, W + 8, H + 8);
  drawCrowd(ctx, t, light, { cheer: Math.min(1, (view.cheer ?? 0) / 1.2), clap: Math.min(1, Math.max(0, (m.rally - 4) / 8)), ball: m.ball });
  judge(ctx, m, t, light);
  drawMarks(ctx, view.marks ?? []);
  drawTiming(ctx, m, view.perfectAt ?? 0.84);
  for (const a of view.aims ?? []) if (a) drawAim(ctx, m.p[a.p], a, t);
  if (LIGHTS[light].floods) {
    // Dew on the floor: faint reflections of the players.
    for (const pl of m.p) {
      const [, sy] = project(pl.x, pl.y, 0);
      ctx.save(); ctx.globalAlpha = 0.14;
      ctx.translate(0, sy * 2); ctx.scale(1, -1);
      pelotari(ctx, pl, t, { anim: view.anim?.[pl.i], light, reflection: true });
      ctx.restore();
    }
  }
  const things = [...m.p.map((pl) => ({ y: pl.y, draw: () => pelotari(ctx, pl, t, { turn: m.phase === 'rally' && m.turn === pl.i && m.ball.wall, anim: view.anim?.[pl.i], light }) })),
    { y: m.ball.y, draw: () => drawBall(ctx, m.ball, t, view.trail ?? [], light) }];
  things.sort((a, b) => a.y - b.y).forEach((th) => th.draw());
  drawFx(ctx, view.fx ?? []);
  ctx.restore();
  finish(ctx);
}

// The court with its crowd but no match: for the menus and between screens.
export function backdrop(ctx, light = 'sunset', t = 0, cheer = 0) {
  ctx.drawImage(scene(light), 0, 0, W, H);
  drawCrowd(ctx, t, light, { cheer, ball: { x: 5, y: 10, z: 3 } });
}

export function clearArt() { cache.clear(); }

// ---- portraits ---------------------------------------------------------------------------------

const RIVALS = {
  txiki: { skin: '#f0c9a0', hair: '#6a4a2a', shirt: '#2f72b0', age: 0, curls: true },
  martillo: { skin: '#d9a47c', hair: '#1e1612', shirt: '#2f72b0', age: 1, beard: true, broad: true },
  txapeldun: { skin: '#e2b48a', hair: '#8a8a88', shirt: '#2f72b0', age: 2, moustache: true },
  red: { skin: '#e6b48c', hair: '#4a3222', shirt: '#c8342a', age: 0 },
};

// A front-facing bust in a round frame, for the rival cards and the txapela.
export function portrait(ctx, id, x, y, s = 1, t = 0, { txapela = false } = {}) {
  const P = RIVALS[id];
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath(); ctx.arc(0, 0, 64, 0, Math.PI * 2);
  const bg = ctx.createRadialGradient(-14, -20, 4, 0, 0, 66);
  bg.addColorStop(0, '#fbf0d6'); bg.addColorStop(1, '#d9b98a');
  ctx.fillStyle = bg; ctx.fill();
  ctx.save(); ctx.clip();
  const bob = Math.sin(t * 2) * 1.2;
  const w = P.broad ? 52 : 44;
  ctx.fillStyle = P.shirt; ctx.beginPath(); ctx.ellipse(0, 70 + bob, w, 40, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = mix(P.shirt, '#000', 0.25); ctx.beginPath(); ctx.moveTo(-10, 32 + bob); ctx.lineTo(0, 44 + bob); ctx.lineTo(10, 32 + bob); ctx.fill();
  ctx.fillStyle = P.skin; ctx.fillRect(-8, 20 + bob, 16, 16);
  ctx.beginPath(); ctx.ellipse(0, 0 + bob, 24, 28, 0, 0, Math.PI * 2); ctx.fill();
  // Hair.
  ctx.fillStyle = P.hair;
  if (P.curls) for (let k = 0; k < 9; k++) { ctx.beginPath(); ctx.arc(-20 + k * 5, -22 + bob + Math.sin(k) * 2, 7, 0, Math.PI * 2); ctx.fill(); }
  else { ctx.beginPath(); ctx.ellipse(0, -16 + bob, 25, 13, 0, Math.PI, 0); ctx.fill(); }
  if (P.age === 2) { ctx.fillStyle = P.skin; ctx.beginPath(); ctx.ellipse(0, -24 + bob, 12, 6, 0, 0, Math.PI * 2); ctx.fill(); }
  // Face.
  ctx.fillStyle = '#2a1a10';
  for (const ex of [-9, 9]) { ctx.beginPath(); ctx.ellipse(ex, -2 + bob, 2.6, (t % 4) < 0.12 ? 0.4 : 3, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = P.hair; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-14, -10 + bob); ctx.lineTo(-5, -9 + bob - (P.broad ? 1.5 : 0)); ctx.moveTo(14, -10 + bob); ctx.lineTo(5, -9 + bob - (P.broad ? 1.5 : 0)); ctx.stroke();
  if (P.beard) { ctx.fillStyle = mix(P.hair, P.skin, 0.25); ctx.beginPath(); ctx.ellipse(0, 16 + bob, 20, 12, 0, 0, Math.PI); ctx.fill(); }
  if (P.moustache) { ctx.fillStyle = P.hair; ctx.beginPath(); ctx.ellipse(0, 9 + bob, 10, 3.5, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#8a4a34'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 11 + bob, 7, 0.25, Math.PI - 0.25); ctx.stroke();
  ctx.fillStyle = 'rgba(230,120,100,0.22)'; for (const cx of [-14, 14]) { ctx.beginPath(); ctx.arc(cx, 8 + bob, 5, 0, Math.PI * 2); ctx.fill(); }
  if (txapela) drawTxapela(ctx, 0, -26 + bob, 1.1, t);
  ctx.restore();
  ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 64, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// The champion's txapela: a big black Basque beret.
export function drawTxapela(ctx, x, y, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  const g = ctx.createRadialGradient(-8, -8, 2, 0, 0, 36);
  g.addColorStop(0, '#3a3a46'); g.addColorStop(1, '#101016');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 36, 12, -0.08, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -11, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6a1a1a'; ctx.fillRect(-26, 4, 52, 4);
  ctx.restore();
}
