// The plaza and everything in it, painted in code with smooth shapes and
// warm afternoon light, like ¡Pelotari! and the other games. Side-on: red on
// the left facing right, blue on the right facing left, the crowd behind the
// barrier facing us. No pixel art: the canvas is 2x the 960x540 stage.

import { makeRng } from '../core/rng.js';
import { POSES, blend, ease, drawFigure, TEAM, mix } from './figure.js';

const W = 960, H = 540, SCALE = 2;
export const GROUND = 470; // screen y of the competitors' feet
export const U = 102; // pixels per metre
export const LANE = [255, 705]; // screen x of each competitor

function canvas(w, h, scale = SCALE) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * scale); c.height = Math.ceil(h * scale);
  const g = c.getContext('2d'); g.scale(scale, scale);
  return [c, g];
}
const cache = new Map();
const cached = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
const shade = (c, k) => (k >= 0 ? mix(c, '#fff6e4', k) : mix(c, '#1a120c', -k));
function glow(g, x, y, r, colour, a = 1) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, colour.replace('A', a)); gr.addColorStop(1, colour.replace('A', 0));
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
}

// ---- the plaza, painted once ----------------------------------------------------------------

function paintPlaza() {
  const [c, g] = canvas(W, H);
  const rng = makeRng(3);
  // Sky and sun.
  const sky = g.createLinearGradient(0, 0, 0, 300);
  sky.addColorStop(0, '#6aa2d0'); sky.addColorStop(0.6, '#b8d4e2'); sky.addColorStop(1, '#f2e6c8');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  glow(g, 820, 60, 380, 'rgba(255,240,200,A)', 0.5);
  for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(255,248,230,${0.18 + rng.next() * 0.15})`; g.beginPath(); g.ellipse(rng.next() * W, 30 + rng.next() * 90, 60 + rng.next() * 120, 6 + rng.next() * 6, 0, 0, Math.PI * 2); g.fill(); }
  // Mountains.
  g.fillStyle = '#9fb3a8'; g.beginPath(); g.moveTo(0, 220);
  for (let x = 0; x <= W; x += 20) g.lineTo(x, 175 - 45 * Math.abs(Math.sin(x * 0.006 + 1)) - 15 * Math.sin(x * 0.02));
  g.lineTo(W, 260); g.lineTo(0, 260); g.fill();
  // Buildings round the plaza: stone houses with wooden balconies, the town hall's arcade, the church.
  const houses = [[-10, 100, 150], [140, 70, 130], [630, 90, 140], [770, 60, 200]];
  for (const [x, top, w] of houses) building(g, x, top, w, rng);
  townHall(g, 270, 60, 360);
  // Plane trees at the corners.
  for (const [x, s] of [[40, 1.1], [920, 1.2]]) tree(g, x, 300, s, rng);
  // Strings of fiesta bunting.
  bunting(g, [[0, 90], [480, 150], [960, 88]]);
  bunting(g, [[0, 40], [480, 95], [960, 36]], 1);
  return c;
}

function building(g, x, top, w, rng) {
  const wall = ['#efe0c4', '#e6cfa8', '#f2e8d4'][Math.floor(rng.next() * 3)];
  const base = 300;
  const lit = g.createLinearGradient(x, 0, x + w, 0);
  lit.addColorStop(0, shade(wall, -0.08)); lit.addColorStop(1, shade(wall, 0.08));
  g.fillStyle = lit; g.fillRect(x, top, w, base - top);
  // Stone quoins and a tiled roof with eaves.
  g.fillStyle = shade(wall, -0.18); for (let y = top; y < base; y += 16) { g.fillRect(x, y, 10, 12); g.fillRect(x + w - 10, y + 6, 10, 12); }
  g.fillStyle = '#a8553a'; g.beginPath(); g.moveTo(x - 10, top); g.lineTo(x + w / 2, top - 30); g.lineTo(x + w + 10, top); g.closePath(); g.fill();
  g.fillStyle = '#7a3a26'; g.fillRect(x - 12, top - 2, w + 24, 6);
  for (let k = 0; k < w; k += 9) { g.fillStyle = 'rgba(80,30,20,0.3)'; g.fillRect(x + k, top - 26 + Math.abs(k - w / 2) * 0.6, 1, 20); }
  // Windows with wooden balconies and geraniums.
  for (let r = 0; r < 2; r++) for (let k = 0; k < Math.floor(w / 60); k++) {
    const wx = x + 22 + k * 60, wy = top + 30 + r * 70;
    if (wy > base - 60) continue;
    g.fillStyle = '#5a3a24'; g.fillRect(wx - 3, wy - 3, 30, 44);
    g.fillStyle = '#2e2a30'; g.fillRect(wx, wy, 24, 38);
    g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(wx + 2, wy + 2, 8, 30);
    g.fillStyle = '#6e3e22'; g.fillRect(wx - 8, wy + 34, 40, 4);
    for (let b = 0; b < 7; b++) g.fillRect(wx - 7 + b * 6, wy + 38, 2, 12);
    g.fillRect(wx - 8, wy + 50, 40, 3);
    for (let f = 0; f < 5; f++) { g.fillStyle = f % 2 ? '#d33a2c' : '#e8594a'; g.beginPath(); g.arc(wx - 4 + f * 8, wy + 33, 3.4, 0, Math.PI * 2); g.fill(); g.fillStyle = '#4e7a2a'; g.beginPath(); g.arc(wx + f * 8, wy + 34, 2.6, 0, Math.PI * 2); g.fill(); }
  }
}

function townHall(g, x, top, w) {
  const base = 300, stone = '#dcc4a0';
  const lit = g.createLinearGradient(x, 0, x + w, 0);
  lit.addColorStop(0, shade(stone, -0.05)); lit.addColorStop(1, shade(stone, 0.1));
  g.fillStyle = lit; g.fillRect(x, top, w, base - top);
  for (let y = top; y < base; y += 14) { g.fillStyle = 'rgba(100,70,40,0.1)'; g.fillRect(x, y, w, 1.2); }
  // Cornice and a pediment with the arms of Navarre.
  g.fillStyle = shade(stone, -0.12); g.fillRect(x - 8, top - 6, w + 16, 10);
  g.beginPath(); g.moveTo(x + w / 2 - 60, top - 6); g.lineTo(x + w / 2, top - 40); g.lineTo(x + w / 2 + 60, top - 6); g.fill();
  const sx = x + w / 2, sy = top - 18;
  g.fillStyle = '#b3261e'; g.beginPath(); g.moveTo(sx - 12, sy - 12); g.lineTo(sx + 12, sy - 12); g.lineTo(sx + 12, sy + 2); g.quadraticCurveTo(sx + 12, sy + 10, sx, sy + 14); g.quadraticCurveTo(sx - 12, sy + 10, sx - 12, sy + 2); g.closePath(); g.fill();
  g.strokeStyle = '#e8b840'; g.lineWidth = 1.4; g.stroke();
  g.beginPath(); g.moveTo(sx - 12, sy - 12); g.lineTo(sx + 12, sy + 14); g.moveTo(sx + 12, sy - 12); g.lineTo(sx - 12, sy + 14); g.moveTo(sx, sy - 12); g.lineTo(sx, sy + 14); g.stroke();
  // The balcony and its hanging banners.
  g.fillStyle = '#4a3a30'; g.fillRect(x + 40, top + 62, w - 80, 5);
  for (let k = x + 44; k < x + w - 40; k += 8) g.fillRect(k, top + 67, 2, 22);
  g.fillRect(x + 40, top + 88, w - 80, 4);
  for (let k = 0; k < 4; k++) {
    const wx = x + 60 + k * ((w - 120) / 3) - 16;
    g.fillStyle = '#3a3036'; g.fillRect(wx, top + 18, 32, 48);
    g.fillStyle = k % 2 ? '#c0392b' : '#f3ece0'; g.fillRect(wx + 2, top + 92, 28, 30);
  }
  // Arcade on the ground floor.
  for (let k = 0; k < 6; k++) {
    const ax = x + 14 + k * (w - 28) / 6, aw = (w - 28) / 6 - 12;
    g.fillStyle = '#3e3028'; g.beginPath(); g.rect(ax, base - 70, aw, 70); g.arc(ax + aw / 2, base - 70, aw / 2, Math.PI, 0); g.fill();
  }
  // Clock.
  g.fillStyle = '#f6f0e0'; g.beginPath(); g.arc(x + w / 2, top + 36, 14, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#3a2a20'; g.lineWidth = 1.5; g.stroke(); g.beginPath(); g.moveTo(x + w / 2, top + 36); g.lineTo(x + w / 2, top + 26); g.moveTo(x + w / 2, top + 36); g.lineTo(x + w / 2 + 7, top + 38); g.stroke();
}

function tree(g, x, y, s, rng) {
  g.fillStyle = '#8a7a62'; g.beginPath(); g.moveTo(x - 6 * s, y); g.lineTo(x - 3 * s, y - 90 * s); g.lineTo(x + 3 * s, y - 90 * s); g.lineTo(x + 6 * s, y); g.fill();
  for (let k = 0; k < 30; k++) {
    const a = rng.next() * Math.PI * 2, r = rng.next() * 55 * s;
    g.fillStyle = mix('#6a8a3a', '#3e5a26', rng.next());
    g.beginPath(); g.arc(x + Math.cos(a) * r, y - 120 * s + Math.sin(a) * r * 0.6, (14 + rng.next() * 14) * s, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = 'rgba(255,240,190,0.2)'; g.beginPath(); g.arc(x + 18 * s, y - 136 * s, 30 * s, 0, Math.PI * 2); g.fill();
}

function bunting(g, [[ax, ay], [mx, my], [bx, by]], alt = 0) {
  g.strokeStyle = 'rgba(40,28,16,0.7)'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(mx, my, bx, by); g.stroke();
  const cols = alt ? ['#2e7d4f', '#f3ece0', '#c0392b'] : ['#c0392b', '#f3ece0', '#2e7d4f'];
  for (let t = 0.02, k = 0; t < 1; t += 0.028, k++) {
    const x = (1 - t) ** 2 * ax + 2 * (1 - t) * t * mx + t * t * bx, y = (1 - t) ** 2 * ay + 2 * (1 - t) * t * my + t * t * by;
    g.fillStyle = cols[k % 3]; g.beginPath(); g.moveTo(x - 7, y); g.lineTo(x + 7, y); g.lineTo(x, y + 15); g.fill();
  }
}

// The barrier and the sawdust floor, in front of the crowd.
function paintFront() {
  const [c, g] = canvas(W, H);
  // Barrier: wooden rails hung with red and white cloth.
  g.fillStyle = '#6e4a2a'; g.fillRect(0, 332, W, 7);
  for (let x = 10; x < W; x += 80) { g.fillStyle = '#5a3a20'; g.fillRect(x, 322, 8, 44); }
  for (let x = 0; x < W; x += 160) {
    g.fillStyle = x % 320 ? '#f3ece0' : '#c0392b';
    g.beginPath(); g.moveTo(x, 339); g.quadraticCurveTo(x + 80, 362, x + 160, 339); g.lineTo(x + 160, 350); g.quadraticCurveTo(x + 80, 374, x, 350); g.fill();
  }
  // Sawdust: warm, soft, speckled, lighter where the sun falls.
  const floor = g.createLinearGradient(0, 358, 0, H);
  floor.addColorStop(0, '#caa46e'); floor.addColorStop(1, '#e2c28e');
  g.fillStyle = floor; g.fillRect(0, 358, W, H - 358);
  const rng = makeRng(8);
  for (let k = 0; k < 4000; k++) {
    const y = 360 + rng.next() * 180;
    g.fillStyle = rng.chance(0.5) ? 'rgba(255,240,210,0.35)' : 'rgba(140,100,50,0.25)';
    g.fillRect(rng.next() * W, y, 1 + (y - 360) / 90, 0.8 + (y - 360) / 200);
  }
  g.fillStyle = 'rgba(80,50,20,0.15)'; g.fillRect(0, 358, W, 6);
  // A white line between the two sides.
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(478, 370, 4, 170);
  return c;
}

// ---- the crowd, facing us over the barrier, drawn every frame ---------------------------------

const SKIN = ['#f1cba6', '#e6b48c', '#d49c74', '#c08660', '#f6d8bc', '#a8704c'];
const HAIR = ['#2a1c14', '#3e2a1c', '#5a3a24', '#8a6040', '#b89060', '#d8d2c8', '#9a9690'];
const TOPS = ['#f5f1e8', '#f5f1e8', '#c0392b', '#2e6f9e', '#d68a2a', '#4e7a3a', '#7a4a8a', '#3a4a5a', '#e0c070'];
let crowd = null;
function buildCrowd() {
  const rng = makeRng(11), out = [];
  for (let row = 0; row < 3; row++) {
    for (let x = -10 + row * 14; x < W + 20; x += 34 + rng.next() * 12) {
      const kid = rng.chance(0.15);
      out.push({ row, x, y: 318 + row * 10 - (2 - row) * 0, s: (kid ? 0.72 : 1) * (1 - row * 0.12), skin: rng.pick(SKIN), hair: rng.pick(HAIR), top: rng.pick(TOPS),
        txapela: rng.chance(0.18), panuelo: rng.chance(0.5), long: rng.chance(0.35), phase: rng.next() * 10, eager: rng.range(0.4, 1.2), side: rng.chance(0.5) ? 0 : 1 });
    }
  }
  return out.sort((a, b) => b.row - a.row);
}

// mood: { cheer: [0..1, 0..1] per side, look: -1..1 }
export function drawCrowd(g, t, mood = {}) {
  crowd = crowd ?? buildCrowd();
  for (const p of crowd) {
    const cheer = (mood.cheer?.[p.side] ?? 0) * p.eager;
    const up = cheer > 0.5;
    const bob = up ? Math.abs(Math.sin(t * 8 + p.phase)) * 8 : Math.sin(t * 1.2 + p.phase) * 1;
    const s = p.s * 34, x = p.x, y = p.y - bob - p.row * 26;
    // Shoulders and body.
    g.fillStyle = mix(p.top, '#1a120c', p.row * 0.12);
    g.beginPath(); g.moveTo(x - s * 0.55, y + s * 0.9); g.quadraticCurveTo(x - s * 0.55, y + s * 0.1, x, y + s * 0.05); g.quadraticCurveTo(x + s * 0.55, y + s * 0.1, x + s * 0.55, y + s * 0.9); g.fill();
    if (p.panuelo) { g.fillStyle = '#c8261e'; g.beginPath(); g.moveTo(x - s * 0.18, y + s * 0.08); g.lineTo(x + s * 0.18, y + s * 0.08); g.lineTo(x, y + s * 0.34); g.fill(); }
    // Arms up to cheer, or clapping.
    const skin = mix(p.skin, '#1a120c', p.row * 0.1);
    if (up) {
      g.strokeStyle = p.top; g.lineWidth = s * 0.16; g.lineCap = 'round';
      for (const k of [-1, 1]) { const w = Math.sin(t * 9 + p.phase + k) * s * 0.1; g.beginPath(); g.moveTo(x + k * s * 0.42, y + s * 0.25); g.lineTo(x + k * s * 0.55 + w, y - s * 0.55); g.stroke(); g.fillStyle = skin; g.beginPath(); g.arc(x + k * s * 0.55 + w, y - s * 0.62, s * 0.1, 0, Math.PI * 2); g.fill(); }
    } else if (cheer > 0.2) {
      const c = Math.abs(Math.sin(t * 10 + p.phase)) * s * 0.12;
      g.fillStyle = skin; g.beginPath(); g.arc(x - c - s * 0.06, y + s * 0.5, s * 0.09, 0, Math.PI * 2); g.arc(x + c + s * 0.06, y + s * 0.5, s * 0.09, 0, Math.PI * 2); g.fill();
    }
    // Head, facing us, eyes on the action.
    const look = (mood.look ?? 0) * s * 0.06;
    g.fillStyle = skin; g.beginPath(); g.ellipse(x, y - s * 0.2, s * 0.26, s * 0.3, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = mix(p.hair, '#1a120c', p.row * 0.1);
    g.beginPath(); g.ellipse(x, y - s * 0.34, s * 0.27, s * 0.18, 0, Math.PI, 0); g.fill();
    if (p.long) { g.beginPath(); g.ellipse(x - s * 0.24, y - s * 0.1, s * 0.08, s * 0.24, 0, 0, Math.PI * 2); g.ellipse(x + s * 0.24, y - s * 0.1, s * 0.08, s * 0.24, 0, 0, Math.PI * 2); g.fill(); }
    if (p.txapela) { g.fillStyle = '#16161e'; g.beginPath(); g.ellipse(x, y - s * 0.44, s * 0.32, s * 0.1, -0.1, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#2a1a10'; g.beginPath(); g.arc(x - s * 0.09 + look, y - s * 0.2, s * 0.035, 0, Math.PI * 2); g.arc(x + s * 0.09 + look, y - s * 0.2, s * 0.035, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8a3a2a';
    g.beginPath(); if (up) g.ellipse(x + look, y - s * 0.04, s * 0.08, s * 0.07, 0, 0, Math.PI * 2); else g.ellipse(x + look, y - s * 0.05, s * 0.07, s * 0.02, 0, 0, Math.PI * 2); g.fill();
  }
}

// ---- props --------------------------------------------------------------------------------

// A beech log lying under the aizkolari's feet, with the V of the cut in it.
function drawLog(g, x, y, cut, dir, t) {
  const L = 1.5 * U, R = 0.22 * U, top = y - 2 * R;
  // End grain on the near end, bark along the length.
  const bark = g.createLinearGradient(0, top, 0, y);
  bark.addColorStop(0, '#8a6a48'); bark.addColorStop(0.5, '#6e5236'); bark.addColorStop(1, '#4a3622');
  g.fillStyle = 'rgba(60,36,16,0.3)'; g.beginPath(); g.ellipse(x, y + 4, L / 2 + 10, 8, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = bark; g.fillRect(x - L / 2, top, L, 2 * R);
  g.strokeStyle = 'rgba(40,24,12,0.35)'; g.lineWidth = 1.2;
  for (let k = 0; k < 8; k++) { const yy = top + 6 + k * (2 * R - 12) / 7; g.beginPath(); g.moveTo(x - L / 2, yy); for (let s = 0; s <= L; s += 20) g.lineTo(x - L / 2 + s, yy + Math.sin(s * 0.1 + k) * 1.5); g.stroke(); }
  for (const e of [-1, 1]) {
    const ex = x + e * L / 2;
    g.fillStyle = '#d9b27a'; g.beginPath(); g.ellipse(ex, top + R, 12, R, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(140,90,40,0.5)'; for (let r = 4; r < R; r += 5) { g.beginPath(); g.ellipse(ex, top + R, 12 * r / R, r, 0, 0, Math.PI * 2); g.stroke(); }
  }
  // The cut: a V opening in front of the feet, pale fresh wood inside.
  if (cut > 0) {
    const cx = x + dir * 0.12 * U, depth = Math.min(1, cut) * 2 * R, half = 8 + Math.min(1, cut) * 22;
    g.fillStyle = '#f0d49c';
    g.beginPath(); g.moveTo(cx - half, top); g.lineTo(cx, top + depth); g.lineTo(cx + half, top); g.fill();
    g.strokeStyle = 'rgba(120,80,30,0.5)'; g.lineWidth = 1; g.stroke();
  }
}

function drawAxe(g, pose, t) {
  // Along the line from the hands through the axe head; the head swings with the arms.
  const [hx, hy] = pose.hf, [bx, by] = pose.hb;
  const dx = hx - bx, dy = hy - by, d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d, L = 0.78;
  const ex = hx + ux * (L - 0.1), ey = hy + uy * (L - 0.1);
  g.strokeStyle = '#b08050'; g.lineWidth = 0.045; g.beginPath(); g.moveTo(bx - ux * 0.08, by - uy * 0.08); g.lineTo(ex, ey); g.stroke();
  g.save(); g.translate(ex, ey); g.rotate(Math.atan2(uy, ux));
  const steel = g.createLinearGradient(0, -0.12, 0, 0.14);
  steel.addColorStop(0, '#e8ecf0'); steel.addColorStop(0.5, '#9aa2ac'); steel.addColorStop(1, '#5a626c');
  g.fillStyle = steel; g.beginPath(); g.moveTo(-0.05, -0.04); g.lineTo(0.06, -0.14); g.quadraticCurveTo(0.1, 0, 0.06, 0.16); g.lineTo(-0.05, 0.05); g.closePath(); g.fill();
  g.restore();
}

function drawStone(g, cx, cy, tilt) {
  // A granite cylinder standing on end, with its grip hollows.
  g.save(); g.translate(cx, cy); g.rotate(tilt);
  const w = 0.44, h = 0.5;
  const gr = g.createLinearGradient(-w / 2, 0, w / 2, 0);
  gr.addColorStop(0, '#6e6e74'); gr.addColorStop(0.4, '#a8a8ae'); gr.addColorStop(1, '#5a5a60');
  g.fillStyle = gr; g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, 0.05); g.fill();
  g.fillStyle = '#c4c4c8'; g.beginPath(); g.ellipse(0, -h / 2, w / 2, 0.06, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(40,40,46,0.5)'; g.beginPath(); g.ellipse(-0.1, 0, 0.05, 0.08, 0, 0, Math.PI * 2); g.ellipse(0.12, -0.02, 0.05, 0.08, 0, 0, Math.PI * 2); g.fill();
  for (let k = 0; k < 18; k++) { g.fillStyle = k % 2 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)'; g.fillRect(-w / 2 + ((k * 37) % 40) / 100, -h / 2 + ((k * 53) % 48) / 100, 0.015, 0.015); }
  g.restore();
}

function drawTxinga(g, hx, hy, swing) {
  g.save(); g.translate(hx, hy); g.rotate(swing);
  g.strokeStyle = '#4a4a50'; g.lineWidth = 0.03; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 0.08); g.stroke();
  const gr = g.createLinearGradient(-0.1, 0, 0.1, 0);
  gr.addColorStop(0, '#4a4a52'); gr.addColorStop(0.45, '#8a8a94'); gr.addColorStop(1, '#3a3a40');
  g.fillStyle = gr; g.beginPath(); g.roundRect(-0.1, 0.08, 0.2, 0.3, 0.03); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(-0.07, 0.1, 0.02, 0.26);
  g.restore();
}

// ---- each event's scene -------------------------------------------------------------------------

// Animation state per competitor (swing phases, stride clocks), kept by the screen.
export function newAnim() { return [0, 1].map(() => ({ swing: 1, stride: 0, strideDir: 1, heave: 0, drop: 0, chips: [] })); }

export function drawEvent(g, ev, t, anim, fx) {
  g.drawImage(cached('plaza', paintPlaza), 0, 0, W, H);
  drawCrowd(g, t, { cheer: fx?.cheer ?? [0, 0], look: 0 });
  g.drawImage(cached('front', paintFront), 0, 0, W, H);
  if (!ev) return;
  if (ev.id === 'sokatira') drawTug(g, ev, t, anim);
  else for (const i of [0, 1]) drawCompetitor(g, ev, i, t, anim[i]);
  drawFx(g, fx?.bits ?? []);
}

function drawCompetitor(g, ev, i, t, a) {
  const x = LANE[i], dir = i ? -1 : 1, st = ev.p[i];
  const look = { hair: i ? '#2a1c14' : '#4a3222', moustache: !!i };
  if (ev.id === 'aizkolaritza') {
    const logY = GROUND;
    drawLog(g, x, logY, ev.measure(i), dir, t);
    const stand = logY - 0.44 * U;
    // swing: 0 = strike, 1 = raised; the pelotari raises the axe as the power ring fills.
    const raise = st.doneAt != null ? 0 : Math.min(1, st.since / ev.R.windup);
    const p = st.doneAt != null ? POSES.cheer : blend(POSES.chopDown, POSES.chopUp, ease(raise));
    drawFigure(g, p, x - dir * 0.02 * U, stand, U, dir, i, { ...look, effort: raise < 0.3, hold: st.doneAt != null ? null : (gg, pose) => drawAxe(gg, pose, t) });
    if (st.doneAt != null) {
      // The two halves of the log fall apart.
      g.fillStyle = 'rgba(255,230,160,0.5)'; g.fillRect(x + dir * 12 - 3, logY - 45, 6, 45);
    }
  } else if (ev.id === 'harri') {
    const h = st.phase === 'raise' ? st.h : st.phase === 'shoulder' ? 1 : st.phase === 'down' ? Math.max(0, st.h) : 0;
    const pose = h < 0.6 ? blend(POSES.liftLow, POSES.liftChest, ease(h / 0.6)) : blend(POSES.liftChest, POSES.liftTop, ease((h - 0.6) / 0.4));
    const tilt = st.phase === 'shoulder' ? st.bal * 0.5 : 0;
    const stone = (gg, pz) => {
      if (st.phase === 'drop') { drawStone(gg, 0.5, -0.25, 0.3); return; }
      // Up the front of the body to the chest, then rolled back onto the shoulder behind the head.
      const c = h < 0.6 ? [0.38 - h * 0.15, -0.28 - h * 1.25] : [0.29 - (h - 0.6) / 0.4 * 0.53, -1.03 - (h - 0.6) / 0.4 * 0.72];
      drawStone(gg, c[0] + tilt * 0.12, c[1], tilt);
    };
    drawFigure(g, pose, x, GROUND, U, dir, i, { ...look, effort: st.phase === 'raise' && h > 0.1, hold: stone });
  } else if (ev.id === 'txingak') {
    // The ground moves under them: posts every 5 m slide by as they walk.
    const posts = (st.dist % 5) / 5;
    for (let k = -1; k <= 2; k++) {
      const px = x - dir * ((k - posts) * 1.6 * U) + dir * 0.4 * U;
      if (Math.abs(px - x) > 200) continue;
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(px - 2, GROUND - 26, 4, 30);
      g.fillStyle = TEAM[i].sash; g.fillRect(px - 2, GROUND - 26, 12 * dir, 7);
    }
    const down = st.down > 0;
    const k = (Math.sin(a.stride * Math.PI) + 1) / 2;
    const pose = down ? POSES.liftLow : blend(POSES.walkA, POSES.walkB, ease(k));
    const lean = st.bal * 0.3;
    drawFigure(g, pose, x + lean * 12, GROUND, U, dir, i, {
      ...look, effort: true,
      hold: (gg, pz) => { if (down) { drawTxinga(gg, 0.35, -0.38, 0.4); drawTxinga(gg, -0.2, -0.38, -0.4); } else drawTxinga(gg, pz.hb[0], pz.hb[1], lean * 0.5 + Math.sin(t * 6) * 0.05); },
      front: (gg, pz) => { if (!down) drawTxinga(gg, pz.hf[0], pz.hf[1], lean * 0.5 - Math.sin(t * 6) * 0.05); },
    });
  }
}

function drawTug(g, ev, t, anim) {
  const shift = ev.x * U * 0.9; // the whole rope and both teams slide with the marker
  const y = GROUND - 0.88 * U;
  // The two winning lines on the sawdust.
  for (const k of [-1, 1]) { g.fillStyle = TEAM[k > 0 ? 1 : 0].sash; g.globalAlpha = 0.6; g.fillRect(480 + k * ev.R.win * U * 0.9 - 3, GROUND - 60, 6, 80); g.globalAlpha = 1; }
  // Rope.
  const rope = g.createLinearGradient(0, y - 4, 0, y + 4);
  rope.addColorStop(0, '#d8b880'); rope.addColorStop(1, '#8a6a3a');
  g.strokeStyle = rope; g.lineWidth = 7; g.beginPath(); g.moveTo(40 + shift, y + 6); g.quadraticCurveTo(480 + shift, y - 2, 920 + shift, y + 6); g.stroke();
  g.strokeStyle = 'rgba(80,50,20,0.4)'; g.lineWidth = 1; g.setLineDash([4, 5]); g.beginPath(); g.moveTo(40 + shift, y + 6); g.quadraticCurveTo(480 + shift, y - 2, 920 + shift, y + 6); g.stroke(); g.setLineDash([]);
  // The marker ribbon in the middle.
  g.fillStyle = '#e8b840'; g.beginPath(); g.moveTo(480 + shift, y - 2); g.lineTo(474 + shift, y + 34); g.lineTo(486 + shift, y + 34); g.fill();
  // Each team: the player at the front, two teammates behind.
  for (const i of [0, 1]) {
    const dir = i ? -1 : 1, st = ev.p[i];
    for (let k = 2; k >= 0; k--) {
      const px = 480 - dir * (115 + k * 95) + shift;
      const pull = k ? Math.max(0, Math.sin(t * 6 + k)) * 0.2 + st.power * 0.6 : st.power;
      drawFigure(g, blend(POSES.lean, POSES.heave, ease(Math.min(1, pull))), px, GROUND, U * (1 - k * 0.04), dir, i, { hair: k ? ['#5a3a24', '#2a1c14'][k - 1] : undefined, effort: pull > 0.4, beret: k ? '#2a2a32' : undefined });
    }
  }
}

// Wood chips, sawdust puffs, confetti.
function drawFx(g, bits) {
  for (const b of bits) {
    g.globalAlpha = Math.max(0, Math.min(1, b.life / b.max * 1.5));
    g.fillStyle = b.colour;
    if (b.kind === 'chip') { g.save(); g.translate(b.x, b.y); g.rotate(b.rot); g.fillRect(-b.size, -b.size * 0.4, b.size * 2, b.size * 0.8); g.restore(); }
    else if (b.kind === 'puff') { g.beginPath(); g.arc(b.x, b.y, b.size * (1.5 - b.life / b.max), 0, Math.PI * 2); g.fill(); }
    else g.fillRect(b.x, b.y, b.size, b.size * 0.6);
  }
  g.globalAlpha = 1;
}

// ---- meters, drawn on the canvas beside each competitor ----------------------------------------------

function ring(g, x, y, r, frac, colour, full) {
  g.lineWidth = 7; g.strokeStyle = 'rgba(30,20,10,0.35)'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = full ? '#ffd65a' : colour; g.beginPath(); g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); g.stroke();
  if (full) glow(g, x, y, r * 1.8, 'rgba(255,214,90,A)', 0.45);
}

function bar(g, x, y, w, h, frac, colour) {
  g.fillStyle = 'rgba(30,20,10,0.45)'; g.beginPath(); g.roundRect(x, y, w, h, h / 2); g.fill();
  g.fillStyle = colour; g.beginPath(); g.roundRect(x + 2, y + 2, Math.max(0, (w - 4) * Math.min(1, frac)), h - 4, (h - 4) / 2); g.fill();
}

// A balance bar: a needle that must stay inside the green.
function balance(g, x, y, w, bal) {
  g.fillStyle = 'rgba(30,20,10,0.5)'; g.beginPath(); g.roundRect(x - w / 2, y, w, 16, 8); g.fill();
  const safe = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  safe.addColorStop(0, '#c0392b'); safe.addColorStop(0.25, '#e8b840'); safe.addColorStop(0.5, '#4e9a4a'); safe.addColorStop(0.75, '#e8b840'); safe.addColorStop(1, '#c0392b');
  g.fillStyle = safe; g.globalAlpha = 0.85; g.beginPath(); g.roundRect(x - w / 2 + 3, y + 3, w - 6, 10, 5); g.fill(); g.globalAlpha = 1;
  const nx = x + Math.max(-1, Math.min(1, bal)) * (w / 2 - 6);
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(nx, y - 5); g.lineTo(nx - 6, y - 12); g.lineTo(nx + 6, y - 12); g.fill();
  g.fillRect(nx - 1.5, y, 3, 16);
}

export function drawMeters(g, ev, t) {
  if (!ev || ev.id === 'sokatira') return;
  for (const i of [0, 1]) {
    const x = LANE[i], st = ev.p[i], col = TEAM[i].sash;
    const mx = x + (i ? 1 : -1) * 150;
    if (ev.id === 'aizkolaritza') {
      const pw = st.doneAt != null ? 0 : Math.min(1, st.since / ev.R.windup);
      ring(g, mx, 250, 26, pw, col, pw >= ev.R.perfect);
      bar(g, x - 70, 500, 140, 14, ev.measure(i), col);
    } else if (ev.id === 'harri') {
      if (st.phase === 'raise') bar(g, mx - 8, 180, 16, 120, 0, col), (() => { g.fillStyle = col; g.beginPath(); g.roundRect(mx - 6, 298 - 116 * st.h, 12, 116 * st.h, 6); g.fill(); })();
      if (st.phase === 'shoulder') { balance(g, x, 150, 160, st.bal); bar(g, x - 60, 176, 120, 8, st.hold / ev.R.hold, '#fff'); }
    } else if (ev.id === 'txingak') {
      if (st.down <= 0) balance(g, x, 150, 160, st.bal);
    }
  }
}

// The tug of war's beat: a drum at the centre that thumps on each call.
export function drawBeat(g, ev, t) {
  if (!ev || ev.id !== 'sokatira') return;
  const since = ev.t - (ev.lastBeat ?? -9), to = ev.nextBeat - ev.t;
  const k = Math.max(0, 1 - since / 0.25);
  const x = 480, y = 190;
  // A ring closes in on the drum toward the next beat.
  const r = 30 + Math.min(1, to / ev.interval) * 60;
  g.strokeStyle = `rgba(255,236,160,${0.8 - to / ev.interval * 0.5})`; g.lineWidth = 4; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  const d = g.createRadialGradient(x - 8, y - 8, 4, x, y, 32);
  d.addColorStop(0, '#f6e2b8'); d.addColorStop(1, '#b8864a');
  g.fillStyle = d; g.beginPath(); g.arc(x, y, 28 + k * 6, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#6a3a20'; g.lineWidth = 3; g.stroke();
  if (k > 0) glow(g, x, y, 90, 'rgba(255,220,140,A)', k * 0.6);
}

// Grain and vignette, as in the other games.
export function finish(g) {
  g.drawImage(cached('grunge', () => {
    const [c, gg] = canvas(W, H), rng = makeRng(77);
    for (let i = 0; i < 4000; i++) { gg.fillStyle = rng.chance(0.6) ? `rgba(30,18,6,${0.03 + rng.next() * 0.05})` : `rgba(255,246,222,${0.025 + rng.next() * 0.04})`; gg.fillRect(rng.next() * W, rng.next() * H, 0.6 + rng.next(), 0.6 + rng.next()); }
    const v = gg.createRadialGradient(W / 2, H * 0.5, H * 0.45, W / 2, H * 0.5, W * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(14,8,4,0.35)');
    gg.fillStyle = v; gg.fillRect(0, 0, W, H);
    return c;
  }), 0, 0, W, H);
}

export function drawTxapela(g, x, y, s = 1) {
  g.save(); g.translate(x, y); g.scale(s, s);
  const gr = g.createRadialGradient(-8, -8, 2, 0, 0, 36);
  gr.addColorStop(0, '#3a3a46'); gr.addColorStop(1, '#101016');
  g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, 36, 12, -0.08, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(0, -11, 3, 0, Math.PI * 2); g.fill();
  g.restore();
}

export { POSES, blend, ease, drawFigure };
