// Everything ¡Pelotari! draws, painted in code with smooth shapes and warm
// light (the look of Espadas de Hispania and Piedra por piedra): a village
// frontón on a fiesta evening, seen from behind the court as on television.
// No pixel art: the canvas is 2x the 960x540 stage.

import { makeRng } from '../core/rng.js';

const W = 960, H = 540, SCALE = 2;

// ---- the camera --------------------------------------------------------------------
//
// A pinhole camera 20 m behind the back line and 6 m up, looking almost
// level at the frontis. project(x, y, z) -> [screen x, screen y, pixels per metre].
const CAM = { y: 50, z: 6, pitch: 0.04, f: 1300, cx: 480, cy: 160, x: 5 };
const CP = Math.cos(CAM.pitch), SP = Math.sin(CAM.pitch);
export function project(x, y, z) {
  const dy = CAM.y - y, dz = z - CAM.z;
  const zc = dy * CP - dz * SP, yc = dy * SP + dz * CP;
  const s = CAM.f / zc;
  return [CAM.cx + (x - CAM.x) * s, CAM.cy - yc * s, s];
}

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
const hash = (a, b = 0) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function rgb(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) { const A = rgb(a), B = rgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }

function quad(g, pts) {
  g.beginPath();
  pts.forEach(([x, y, z], k) => { const [sx, sy] = project(x, y, z); if (k) g.lineTo(sx, sy); else g.moveTo(sx, sy); });
  g.closePath();
}
function line3(g, a, b) {
  const [x0, y0] = project(...a), [x1, y1] = project(...b);
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
}

export const COURT = { w: 10, l: 30, wall: 10, chapa: 0.8, top: 9 };

// ---- the scene, painted once ----------------------------------------------------------

function paintSky(g) {
  const sky = g.createLinearGradient(0, 0, 0, 300);
  sky.addColorStop(0, '#d9823a'); sky.addColorStop(0.45, '#efae5a'); sky.addColorStop(1, '#f7dca0');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const sx = 830, sy = 110;
  const sun = g.createRadialGradient(sx, sy, 5, sx, sy, 420);
  sun.addColorStop(0, 'rgba(255,250,228,0.95)'); sun.addColorStop(0.1, 'rgba(255,240,200,0.5)'); sun.addColorStop(1, 'rgba(255,236,190,0)');
  g.fillStyle = sun; g.fillRect(0, 0, W, H);
  const rng = makeRng(5);
  for (let i = 0; i < 10; i++) {
    g.fillStyle = `rgba(255,244,220,${0.08 + rng.next() * 0.1})`;
    g.beginPath(); g.ellipse(rng.next() * W, 20 + rng.next() * 140, 80 + rng.next() * 150, 4 + rng.next() * 6, 0, 0, Math.PI * 2); g.fill();
  }
}

// Mountains, the church tower, roofs: the village around the frontón.
function paintVillage(g) {
  const hills = (y, amp, fill, seed) => {
    g.fillStyle = fill; g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 16) g.lineTo(x, y - amp * (0.5 + 0.5 * Math.sin(x * 0.007 + seed) * Math.cos(x * 0.013 + seed * 2)));
    g.lineTo(W, H); g.fill();
  };
  hills(150, 60, '#b79a86', 1);
  hills(185, 40, '#9e8270', 3);
  // Church tower and nave, to the right behind the stands.
  const tx = 760;
  g.fillStyle = '#8a6448';
  g.fillRect(tx - 120, 150, 150, 120);
  g.beginPath(); g.moveTo(tx - 128, 150); g.lineTo(tx - 45, 110); g.lineTo(tx + 38, 150); g.fill();
  g.fillStyle = '#9c7252'; g.fillRect(tx, 60, 46, 210);
  g.fillStyle = '#7a553a'; g.fillRect(tx + 30, 60, 16, 210);
  g.fillStyle = '#5a3a26';
  for (const [x, y] of [[tx + 10, 80], [tx + 10, 130]]) { g.beginPath(); g.rect(x, y + 6, 14, 20); g.arc(x + 7, y + 6, 7, Math.PI, 0); g.fill(); }
  g.fillStyle = '#6e4a34'; g.beginPath(); g.moveTo(tx - 4, 60); g.lineTo(tx + 23, 28); g.lineTo(tx + 50, 60); g.fill();
  g.strokeStyle = '#4a3222'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(tx + 23, 28); g.lineTo(tx + 23, 14); g.moveTo(tx + 18, 19); g.lineTo(tx + 28, 19); g.stroke();
  // Roofs of the houses round the plaza.
  for (let k = 0; k < 12; k++) {
    const x = 600 + k * 34 + hash(k) * 10, h = 40 + hash(k, 2) * 40, w = 44;
    g.fillStyle = mix('#b46a48', '#8a4e36', hash(k, 3));
    g.beginPath(); g.moveTo(x, 280 - h); g.lineTo(x + w / 2, 262 - h); g.lineTo(x + w, 280 - h); g.lineTo(x + w, 300); g.lineTo(x, 300); g.fill();
    g.fillStyle = mix('#e9d4b0', '#c9a67c', hash(k, 4));
    g.fillRect(x + 2, 280 - h, w - 4, h + 20);
    g.fillStyle = '#6a4a34';
    if (hash(k, 5) > 0.3) g.fillRect(x + 12, 290 - h, 8, 12);
    if (hash(k, 6) > 0.4) { g.fillStyle = '#3f6a3a'; g.fillRect(x + 11, 288 - h, 10, 2); }
  }
}

// The frontis: a tall plastered wall with the metal chapa along its foot.
function paintFrontis(g) {
  const C = COURT;
  // Main face.
  quad(g, [[0, 0, 0], [C.w + 1.2, 0, 0], [C.w + 1.2, 0, C.wall], [0, 0, C.wall]]);
  const [x0, yTop] = project(0, 0, C.wall), [, yBase] = project(0, 0, 0);
  const face = g.createLinearGradient(0, yTop, 0, yBase);
  face.addColorStop(0, '#e9dcc0'); face.addColorStop(1, '#d6c2a0');
  g.fillStyle = face; g.fill();
  // Stone quoins and a coping along the top.
  g.fillStyle = '#b89a72';
  quad(g, [[-0.3, 0, C.wall - 0.4], [C.w + 1.5, 0, C.wall - 0.4], [C.w + 1.5, 0, C.wall + 0.3], [-0.3, 0, C.wall + 0.3]]); g.fill();
  for (let z = 0; z < C.wall; z += 0.9) {
    g.fillStyle = z % 1.8 < 0.9 ? '#c4a67e' : '#b5976e';
    quad(g, [[C.w + 0.4, 0, z], [C.w + 1.2, 0, z], [C.w + 1.2, 0, z + 0.85], [C.w + 0.4, 0, z + 0.85]]); g.fill();
  }
  // Weathering streaks and ball marks.
  const rng = makeRng(11);
  for (let k = 0; k < 90; k++) {
    const [sx, sy, s] = project(rng.range(0.3, C.w), 0, rng.range(1, 5));
    g.fillStyle = `rgba(120,96,70,${0.08 + rng.next() * 0.1})`;
    g.beginPath(); g.arc(sx, sy, 0.09 * s, 0, Math.PI * 2); g.fill();
  }
  // The chapa: a band of steel at the foot. Below its top edge is a fault.
  quad(g, [[0, 0, 0], [C.w, 0, 0], [C.w, 0, C.chapa], [0, 0, C.chapa]]);
  const [, cTop] = project(0, 0, C.chapa);
  const steel = g.createLinearGradient(0, cTop, 0, yBase);
  steel.addColorStop(0, '#9aa2ab'); steel.addColorStop(0.5, '#6d757e'); steel.addColorStop(1, '#4e555c');
  g.fillStyle = steel; g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; line3(g, [0, 0, C.chapa - 0.05], [C.w, 0, C.chapa - 0.05]);
  for (let x = 0.8; x < C.w; x += 1.1) { const [sx, sy] = project(x, 0, C.chapa / 2); g.fillStyle = '#3e454c'; g.beginPath(); g.arc(sx, sy, 1.3, 0, Math.PI * 2); g.fill(); }
  // Red lines: the top of the chapa, the upper limit, and the right-hand edge.
  g.strokeStyle = '#b3261e'; g.lineWidth = 3;
  line3(g, [0, 0, C.chapa], [C.w, 0, C.chapa]);
  line3(g, [0, 0, C.top], [C.w, 0, C.top]);
  line3(g, [C.w, 0, 0], [C.w, 0, C.wall]);
  // A little shield of Navarre high on the frontis.
  const [hx, hy, hs] = project(C.w / 2, 0, C.top + 0.45);
  g.save(); g.translate(hx, hy); g.scale(hs / 60, hs / 60);
  g.beginPath(); g.moveTo(-18, -16); g.lineTo(18, -16); g.lineTo(18, 4); g.quadraticCurveTo(18, 16, 0, 22); g.quadraticCurveTo(-18, 16, -18, 4); g.closePath();
  g.fillStyle = '#b3261e'; g.fill(); g.strokeStyle = '#e8b840'; g.lineWidth = 2.5; g.stroke();
  g.restore();
}

// The left wall runs the whole length of the court, numbered by cuadros.
function paintLeftWall(g) {
  const C = COURT;
  quad(g, [[0, 0, 0], [0, C.l + 16, 0], [0, C.l + 16, C.wall], [0, 0, C.wall]]);
  const [xa] = project(0, C.l + 16, 0), [xb] = project(0, 0, 0);
  const lw = g.createLinearGradient(xa, 0, xb, 0);
  lw.addColorStop(0, '#d9b27e'); lw.addColorStop(1, '#e9d2a8');
  g.fillStyle = lw; g.fill();
  // Courses of stone, drawn in perspective.
  g.strokeStyle = 'rgba(110,80,50,0.18)'; g.lineWidth = 1;
  for (let z = 0.6; z < C.wall; z += 0.6) line3(g, [0, 0, z], [0, C.l + 16, z]);
  // Cuadro lines and numbers.
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2;
  for (let k = 1; k <= 7; k++) {
    const y = k * 4;
    line3(g, [0, y, 0], [0, y, 2.2]);
    const [sx, sy, s] = project(0.02, y - 0.6, 2.9);
    g.fillStyle = 'rgba(160,40,30,0.8)'; g.font = `bold ${Math.max(9, 0.55 * s)}px Georgia, serif`; g.textAlign = 'center';
    g.fillText(String(k), sx, sy);
  }
  // Shade in the corner where the walls meet.
  const [cx, cy] = project(0, 0, 0), [, cyTop] = project(0, 0, C.wall);
  const corner = g.createLinearGradient(cx - 40, 0, cx, 0);
  corner.addColorStop(0, 'rgba(60,34,14,0)'); corner.addColorStop(1, 'rgba(60,34,14,0.25)');
  g.fillStyle = corner; g.fillRect(cx - 40, cyTop, 40, cy - cyTop);
}

// The court floor with its white lines.
function paintFloor(g) {
  const C = COURT;
  // Beyond the court on the right: the contracancha, a strip before the stands.
  quad(g, [[C.w, 0, 0], [C.w + 5, 0, 0], [C.w + 9, C.l + 16, 0], [C.w, C.l + 16, 0]]);
  g.fillStyle = '#9a8a6e'; g.fill();
  quad(g, [[0, 0, 0], [C.w, 0, 0], [C.w, C.l + 16, 0], [0, C.l + 16, 0]]);
  const [, y0] = project(0, 0, 0), [, y1] = project(0, C.l + 16, 0);
  const fl = g.createLinearGradient(0, y0, 0, y1);
  fl.addColorStop(0, '#b8ab90'); fl.addColorStop(1, '#cfc3a6');
  g.fillStyle = fl; g.fill();
  // Worn patches where players stand most.
  const rng = makeRng(3);
  for (let k = 0; k < 40; k++) {
    const [sx, sy, s] = project(rng.range(1, 9), rng.range(12, 28), 0);
    g.fillStyle = `rgba(90,76,56,${0.04 + rng.next() * 0.05})`;
    g.beginPath(); g.ellipse(sx, sy, s * rng.range(0.4, 1.4), s * 0.2, 0, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2;
  line3(g, [C.w, 0, 0], [C.w, C.l, 0]);
  line3(g, [0, C.l, 0], [C.w, C.l, 0]);
  for (let k = 1; k <= 7; k++) { g.strokeStyle = k === 4 || k === 7 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)'; g.lineWidth = k === 4 || k === 7 ? 2.2 : 1.2; line3(g, [0, k * 4, 0], [C.w, k * 4, 0]); }
}

// The stands on the open right side, full of the village.
function paintStands(g, frame) {
  const C = COURT;
  const rows = 5;
  for (let r = rows - 1; r >= 0; r--) {
    const x = C.w + 5 + r * 1.1, z = 0.4 + r * 0.55;
    quad(g, [[x, -1, z], [x, C.l + 8, z], [x + 1.1, C.l + 8, z], [x + 1.1, -1, z]]);
    g.fillStyle = mix('#8a6a4a', '#6a4e36', r / rows); g.fill();
    quad(g, [[x, -1, z - 0.55], [x, C.l + 8, z - 0.55], [x, C.l + 8, z], [x, -1, z]]);
    g.fillStyle = mix('#a88460', '#7a5a3e', r / rows); g.fill();
    // People: heads and shoulders in fiesta white and red, facing the court.
    const rng = makeRng(r * 13 + 1);
    for (let y = 0; y < C.l + 7; y += 0.75 + rng.next() * 0.3) {
      if (rng.chance(0.12)) continue;
      const bob = frame && rng.chance(0.6) ? 0.18 : 0;
      const [sx, sy, s] = project(x + 0.5, y, z + 0.35 + bob);
      const shirt = rng.chance(0.7) ? '#f3ece0' : ['#c0392b', '#2e6f9e', '#e0a030', '#5d8a36'][rng.int(4)];
      g.fillStyle = shirt; g.beginPath(); g.ellipse(sx, sy + 0.2 * s, 0.28 * s, 0.3 * s, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = rng.chance(0.3) ? '#c0392b' : '#3a2a20'; // a red pañuelo or dark hair
      g.beginPath(); g.arc(sx, sy - 0.18 * s, 0.14 * s, 0, Math.PI * 2); g.fill();
      if (frame && bob) { g.strokeStyle = shirt; g.lineWidth = 0.08 * s; g.beginPath(); g.moveTo(sx - 0.2 * s, sy); g.lineTo(sx - 0.3 * s, sy - 0.45 * s); g.moveTo(sx + 0.2 * s, sy); g.lineTo(sx + 0.3 * s, sy - 0.45 * s); g.stroke(); }
    }
  }
}

// Strings of fiesta bunting across the top of the scene.
function paintBunting(g) {
  const cols = ['#c0392b', '#f3ece0', '#2e7d4f'];
  for (const [ax, ay, bx, by, sag] of [[250, 18, 960, 60, 50], [-20, 70, 360, 30, 30]]) {
    g.strokeStyle = 'rgba(60,40,24,0.7)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + sag, bx, by); g.stroke();
    for (let t = 0.03, k = 0; t < 1; t += 0.035, k++) {
      const x = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * ((ax + bx) / 2) + t * t * bx;
      const y = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * ((ay + by) / 2 + sag) + t * t * by;
      g.fillStyle = cols[k % 3];
      g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x + 6, y); g.lineTo(x, y + 13); g.fill();
    }
  }
}

function paintScene(frame) {
  const [c, g] = canvas(W, H);
  paintSky(g);
  paintVillage(g);
  paintFloor(g);
  paintStands(g, frame);
  paintLeftWall(g);
  paintFrontis(g);
  // Evening light: warm from the right, a long shadow of the stands over part of the court.
  const warm = g.createLinearGradient(W, 0, 0, H);
  warm.addColorStop(0, 'rgba(255,214,150,0.18)'); warm.addColorStop(1, 'rgba(60,30,40,0.12)');
  g.fillStyle = warm; g.fillRect(0, 0, W, H);
  paintBunting(g);
  return c;
}

export function scene(cheer = false) { return cached(`scene.${cheer ? 1 : 0}`, () => paintScene(cheer)); }

// Grain and vignette.
function grunge() {
  return cached('grunge', () => {
    const [c, g] = canvas(W, H);
    const rng = makeRng(77);
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = rng.chance(0.6) ? `rgba(30,18,6,${0.035 + rng.next() * 0.06})` : `rgba(255,246,222,${0.03 + rng.next() * 0.04})`;
      g.fillRect(rng.next() * W, rng.next() * H, 0.6 + rng.next(), 0.6 + rng.next());
    }
    const v = g.createRadialGradient(W / 2, H * 0.5, H * 0.4, W / 2, H * 0.5, W * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(18,10,4,0.38)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    return c;
  });
}
export function finish(ctx) { ctx.drawImage(grunge(), 0, 0, W, H); }

// ---- the pelotaris, seen from behind -------------------------------------------------------

export const TEAM = [
  { shirt: '#c0392b', shirtD: '#8e2a20', name: 'red' },
  { shirt: '#2e6fa7', shirtD: '#1f4f7a', name: 'blue' },
];

export function pelotari(ctx, pl, t, { turn = false, anim = {}, ball = null } = {}) {
  const [sx, sy, s] = project(pl.x, pl.y, 0);
  const T = TEAM[pl.i];
  // Shadow, long toward the front-left in the evening sun.
  ctx.fillStyle = 'rgba(40,24,10,0.28)';
  ctx.beginPath(); ctx.ellipse(sx - 0.45 * s, sy - 0.08 * s, 0.75 * s, 0.16 * s, -0.12, 0, Math.PI * 2); ctx.fill();
  if (turn) {
    // A ring at the feet of whoever must strike next.
    ctx.strokeStyle = T.shirt; ctx.lineWidth = Math.max(2, 0.07 * s);
    ctx.globalAlpha = 0.6 + Math.sin(t * 6) * 0.3;
    ctx.beginPath(); ctx.ellipse(sx, sy, 0.55 * s, 0.14 * s, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  const run = anim.run ?? 0, moving = Math.hypot(pl.vx, pl.vy) > 0.6;
  const leg = moving ? Math.sin(run) * 0.28 : 0;
  const u = s; // pixels per metre
  ctx.save(); ctx.translate(sx, sy);
  ctx.lineCap = 'round';
  // Legs (white trousers) and dark shoes.
  for (const [dx, sw] of [[-0.11, leg], [0.11, -leg]]) {
    ctx.strokeStyle = '#f3efe6'; ctx.lineWidth = 0.15 * u;
    ctx.beginPath(); ctx.moveTo(dx * u, -0.92 * u); ctx.lineTo((dx + sw * 0.4) * u, -0.12 * u); ctx.stroke();
    ctx.fillStyle = '#e9e4da'; ctx.beginPath(); ctx.ellipse((dx + sw * 0.4) * u, -0.05 * u, 0.09 * u, 0.06 * u, 0, 0, Math.PI * 2); ctx.fill();
  }
  // Sash (faja) in the team colour, then the shirt.
  ctx.fillStyle = T.shirtD; ctx.fillRect(-0.21 * u, -1.0 * u, 0.42 * u, 0.12 * u);
  const sg = ctx.createLinearGradient(-0.25 * u, 0, 0.25 * u, 0);
  sg.addColorStop(0, T.shirtD); sg.addColorStop(0.6, T.shirt); sg.addColorStop(1, mix(T.shirt, '#ffe6c0', 0.25));
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.moveTo(-0.24 * u, -1.0 * u); ctx.lineTo(-0.26 * u, -1.42 * u); ctx.quadraticCurveTo(0, -1.52 * u, 0.26 * u, -1.42 * u); ctx.lineTo(0.24 * u, -1.0 * u); ctx.fill();
  // Arms: the right one swings to strike.
  const swing = pl.swing > 0 ? 1 - pl.swing / 0.3 : -1;
  const ang = swing >= 0 ? -2.6 + swing * 3.4 : moving ? 0.25 + Math.sin(run) * 0.3 : 0.15;
  ctx.strokeStyle = '#e8b890'; ctx.lineWidth = 0.09 * u;
  ctx.beginPath(); ctx.moveTo(-0.24 * u, -1.38 * u); ctx.lineTo(-0.34 * u, -1.0 * u - Math.sin(run) * 0.08 * u); ctx.stroke();
  ctx.save(); ctx.translate(0.24 * u, -1.38 * u); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 0.5 * u); ctx.stroke();
  ctx.fillStyle = '#f7f2ea'; ctx.beginPath(); ctx.arc(0, 0.54 * u, 0.06 * u, 0, Math.PI * 2); ctx.fill(); // taped hand
  ctx.restore();
  // Head from behind: neck, dark hair.
  ctx.fillStyle = '#e8b890'; ctx.fillRect(-0.05 * u, -1.56 * u, 0.1 * u, 0.08 * u);
  ctx.fillStyle = '#3a2a20'; ctx.beginPath(); ctx.ellipse(0, -1.67 * u, 0.12 * u, 0.13 * u, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8b890'; ctx.beginPath(); ctx.ellipse(-0.12 * u, -1.64 * u, 0.025 * u, 0.04 * u, 0, 0, Math.PI * 2); ctx.ellipse(0.12 * u, -1.64 * u, 0.025 * u, 0.04 * u, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawBall(ctx, b, t, trail) {
  // Shadow on the floor (or the frontis, when it's right against it).
  const [hx, hy, hs] = project(b.x, b.y, 0);
  const lift = Math.min(1, b.z / 4);
  ctx.fillStyle = `rgba(40,24,10,${0.35 - lift * 0.2})`;
  ctx.beginPath(); ctx.ellipse(hx - b.z * 0.15 * hs, hy, (0.13 + lift * 0.06) * hs, 0.05 * hs, 0, 0, Math.PI * 2); ctx.fill();
  // A short streak behind it when it's flying fast.
  for (let k = 0; k < trail.length; k++) {
    const p = trail[k], [tx, ty, ts] = project(p.x, p.y, p.z);
    ctx.fillStyle = `rgba(255,248,230,${(k / trail.length) * 0.35})`;
    ctx.beginPath(); ctx.arc(tx, ty, Math.max(1.5, 0.08 * ts), 0, Math.PI * 2); ctx.fill();
  }
  const [x, y, s] = project(b.x, b.y, b.z);
  const r = Math.max(3.5, 0.11 * s);
  const gr = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  gr.addColorStop(0, '#fffaf0'); gr.addColorStop(0.7, '#e9dfc8'); gr.addColorStop(1, '#b8a888');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(120,80,50,0.6)'; ctx.lineWidth = Math.max(0.8, r * 0.15);
  ctx.beginPath(); ctx.arc(x, y, r * 0.65, t * 8, t * 8 + 2.2); ctx.stroke();
}

// A mark where the ball struck the frontis or bounced.
export function drawMarks(ctx, marks) {
  for (const m of marks) {
    const a = Math.max(0, m.life / m.max);
    const [x, y, s] = project(m.x, m.y, m.z);
    ctx.strokeStyle = m.bad ? `rgba(200,40,30,${a})` : `rgba(255,255,255,${a * 0.8})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (m.y === 0) ctx.arc(x, y, (0.2 + (1 - a) * 0.4) * s, 0, Math.PI * 2);
    else ctx.ellipse(x, y, (0.25 + (1 - a) * 0.5) * s, (0.08 + (1 - a) * 0.16) * s, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// The whole court with the match in progress.
export function drawCourt(ctx, m, t, view = {}) {
  ctx.drawImage(scene(view.cheer && Math.floor(t * 4) % 2 === 0), 0, 0, W, H);
  drawMarks(ctx, view.marks ?? []);
  // Nearer things drawn last.
  const things = [...m.p.map((pl) => ({ y: pl.y, draw: () => pelotari(ctx, pl, t, { turn: m.phase === 'rally' && m.turn === pl.i && m.ball.wall, anim: view.anim?.[pl.i] }) })),
    { y: m.ball.y, draw: () => drawBall(ctx, m.ball, t, view.trail ?? []) }];
  things.sort((a, b) => a.y - b.y).forEach((th) => th.draw());
  finish(ctx);
}

export function clearArt() { cache.clear(); }
