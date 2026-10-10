// The art, painted in code in the manner of the Flash arena brawlers
// (Siegius Arena): seen from the side with depth, a stone wall and the crowd
// behind, a dirt floor, and chunky big-headed characters with thick ink
// outlines and one shade of colour. Smooth, not pixel art. Everything sits
// behind ASSETS, so real sprites can replace a drawing later.
//
// No blood, ever: a blow throws up dust and a star, and a number.
//
// The match is in arena pixels (480x270); the stage is 960x540, so S = 2.
// A fighter stands at (x, y) at its feet; y is depth (further back = higher).

import { makeRng } from '../core/rng.js';
import { stageOf } from '../core/fight.js';

export const S = 2;
export const W = 960, H = 540;

// Swap a placeholder for an image by giving its key a URL here.
export const ASSETS = { arena: {}, fighters: {} };

const INK = '#221a14';
const TAU = Math.PI * 2;
const cache = new Map();
const cached = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const t = k >= 0 ? 255 : 0, a = Math.abs(k);
  return `rgb(${c.map((v) => Math.round(v + (t - v) * a)).join(',')})`;
};
const ease = (k) => 1 - (1 - k) * (1 - k);
const clamp01 = (k) => Math.max(0, Math.min(1, k));

// ---- drawing helpers ---------------------------------------------------------------------------

function stroke(g, w, c = INK) { g.lineWidth = w; g.strokeStyle = c; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }

// A shape with one shade: the base colour, a darker rim on the back and
// bottom (the light falls from in front and above), and an ink outline.
function cel(g, path, base, dark, w = 2.6, off = [3, -3]) {
  g.save();
  path(); g.fillStyle = dark; g.fill(); g.clip();
  g.translate(off[0], off[1]); path(); g.fillStyle = base; g.fill();
  g.restore();
  path(); if (w) stroke(g, w);
}
const ell = (x, y, rx, ry, rot = 0) => (g) => { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); };
function oval(g, x, y, rx, ry, base, dark = shade(base, -0.25), w = 2.4) { cel(g, () => ell(x, y, rx, ry)(g), base, dark, w); }
function dot(g, x, y, r, c = INK) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = c; g.fill(); }

// A limb: a thick rounded stroke with an ink edge.
function limb(g, x1, y1, x2, y2, w, base, lw = 2.4) {
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineWidth = w + lw * 2; g.strokeStyle = INK; g.stroke();
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineWidth = w; g.strokeStyle = base; g.stroke();
}

// A limb that tapers from w1 to w2, with round ends and an ink edge.
function taper(g, x1, y1, x2, y2, w1, w2, col, lw = 2.2) {
  const a = Math.atan2(y2 - y1, x2 - x1), nx = -Math.sin(a), ny = Math.cos(a);
  const shape = (e) => {
    g.beginPath();
    g.moveTo(x1 + nx * (w1 / 2 + e), y1 + ny * (w1 / 2 + e));
    g.lineTo(x2 + nx * (w2 / 2 + e), y2 + ny * (w2 / 2 + e));
    g.arc(x2, y2, w2 / 2 + e, a + Math.PI / 2, a - Math.PI / 2, true);
    g.lineTo(x1 - nx * (w1 / 2 + e), y1 - ny * (w1 / 2 + e));
    g.arc(x1, y1, w1 / 2 + e, a - Math.PI / 2, a + Math.PI / 2, true);
    g.closePath();
  };
  shape(lw); g.fillStyle = INK; g.fill();
  shape(0); g.fillStyle = col; g.fill();
  // A lighter stripe along the top edge, for roundness.
  g.save(); shape(0); g.clip();
  g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = Math.max(1, w2 * 0.35);
  g.beginPath(); g.moveTo(x1 + nx * w1 * 0.22, y1 + ny * w1 * 0.22); g.lineTo(x2 + nx * w2 * 0.22, y2 + ny * w2 * 0.22); g.stroke();
  g.restore();
}

// A ragged edge between two points (hair, fur, torn cloth).
function ragged(g, x1, y1, x2, y2, n, depth, seed = 0) {
  for (let i = 1; i <= n; i++) {
    const u = i / n, v = (i - 0.5) / n;
    const mx = x1 + (x2 - x1) * v, my = y1 + (y2 - y1) * v;
    const nx = -(y2 - y1), ny = x2 - x1, l = Math.hypot(nx, ny) || 1;
    const d = depth * (0.7 + 0.3 * Math.sin(seed + i * 2.3));
    g.lineTo(mx + (nx / l) * d, my + (ny / l) * d);
    g.lineTo(x1 + (x2 - x1) * u, y1 + (y2 - y1) * u);
  }
}

// Simple eyes: dots with a glint; squeezed shut when hurt.
function eyes(g, x, y, u, gap, { hurt = false, size = 1 } = {}) {
  for (const s of [0, 1]) {
    const ex = x + s * gap, ey = y;
    if (hurt) { g.beginPath(); g.moveTo(ex - 2.6 * u, ey - 1.6 * u); g.lineTo(ex + 0.4 * u, ey); g.lineTo(ex - 2.6 * u, ey + 1.6 * u); stroke(g, 1.8); continue; }
    dot(g, ex, ey, 1.9 * u * size);
    dot(g, ex + 0.6 * u, ey - 0.8 * u, 0.6 * u * size, '#fff');
  }
}

// ---- scenery helpers ------------------------------------------------------------------------------

function stoneBlocks(g, x0, y0, x1, y1, rows, base, rng) {
  const h = (y1 - y0) / rows;
  for (let r = 0; r < rows; r++) {
    let x = x0 - rng.range(0, 40);
    while (x < x1) {
      const w = rng.range(46, 86);
      g.fillStyle = shade(base, rng.range(-0.08, 0.06)); g.fillRect(x, y0 + r * h, w, h);
      // A lighter top edge on each stone, a darker bottom.
      g.fillStyle = 'rgba(255,250,230,0.08)'; g.fillRect(x, y0 + r * h, w, 3);
      g.fillStyle = 'rgba(20,14,8,0.12)'; g.fillRect(x, y0 + r * h + h - 4, w, 4);
      g.strokeStyle = 'rgba(34,26,20,0.75)'; g.lineWidth = 2; g.strokeRect(x, y0 + r * h, w, h);
      x += w;
    }
  }
}

// ---- the stage: Olite, seen from the side ----------------------------------------------------------
//
// The main platform is a stretch of the palace's battlements floating over
// the plain, the floating platforms are wooden galleries with Navarre's
// banners; behind, the palace towers and the vineyards of the Ribera. The
// platforms are drawn exactly where the stage data puts them.

function tower(g, x, base, w, h, cap, fade) {
  // A square tower with crenellations (or a pointed roof), faded by distance.
  g.save(); g.globalAlpha = fade;
  cel(g, () => { g.beginPath(); g.rect(x - w / 2, base - h, w, h); }, '#cdbb98', '#a8977a', 2, [-3, 0]);
  if (cap === 'roof') { g.beginPath(); g.moveTo(x - w / 2 - 4, base - h); g.lineTo(x, base - h - w * 0.9); g.lineTo(x + w / 2 + 4, base - h); g.closePath(); g.fillStyle = '#6f7f8a'; g.fill(); stroke(g, 2); }
  else for (let k = 0; k < 4; k++) { g.beginPath(); g.rect(x - w / 2 + k * (w / 3.5), base - h - 8, w / 6, 8); g.fillStyle = '#cdbb98'; g.fill(); stroke(g, 1.6); }
  for (const yy of [0.3, 0.6]) { g.beginPath(); g.roundRect(x - 3, base - h + h * yy, 6, 12, 3); g.fillStyle = '#3a3226'; g.fill(); }
  g.restore();
}

function paintOlite(arena, R) {
  const c = document.createElement('canvas');
  c.width = W * 2; c.height = H * 2;
  const g = c.getContext('2d');
  g.scale(2, 2);
  const rng = makeRng(1212);
  const M = arena.main;
  // Sky, late afternoon, and soft clouds.
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#8ec0e4'); sky.addColorStop(0.55, '#cfe2ea'); sky.addColorStop(1, '#f1dcb0');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  for (let k = 0; k < 6; k++) {
    const cx = rng.range(40, W - 40), cy = rng.range(30, 160), s = rng.range(0.7, 1.3);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (const [dx, dy, r] of [[-26, 4, 16], [0, -4, 22], [26, 4, 16], [10, 8, 14]]) { g.beginPath(); g.arc(cx + dx * s, cy + dy * s, r * s, 0, TAU); g.fill(); }
  }
  // The plain of the Ribera: hills, vineyard rows, fields.
  g.fillStyle = '#b9c4a6'; g.beginPath(); g.moveTo(0, 360); for (let x = 0; x <= W; x += 40) g.lineTo(x, 340 + Math.sin(x * 0.012) * 18); g.lineTo(W, H); g.lineTo(0, H); g.fill();
  g.fillStyle = '#a3b48a'; g.beginPath(); g.moveTo(0, 400); for (let x = 0; x <= W; x += 30) g.lineTo(x, 392 + Math.sin(x * 0.02 + 1) * 10); g.lineTo(W, H); g.lineTo(0, H); g.fill();
  g.strokeStyle = 'rgba(90,110,60,0.35)'; g.lineWidth = 2;
  for (let y = 410; y < H; y += 9) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y + (y - 410) * 0.1); g.stroke(); }
  // The palace behind, in the haze.
  const base = 350;
  g.save(); g.globalAlpha = 0.55;
  cel(g, () => { g.beginPath(); g.rect(80, base - 70, 800, 70); }, '#cdbb98', '#a8977a', 2, [-3, 0]);
  for (let x = 84; x < 880; x += 22) { g.beginPath(); g.rect(x, base - 80, 12, 10); g.fillStyle = '#cdbb98'; g.fill(); stroke(g, 1.4); }
  g.restore();
  for (const [x, w, h, cap] of [[110, 44, 150, 'cren'], [230, 36, 120, 'roof'], [330, 54, 190, 'cren'], [470, 40, 140, 'roof'], [620, 58, 205, 'cren'], [760, 38, 130, 'roof'], [860, 46, 160, 'cren']]) tower(g, x, base, w, h, cap, 0.6);
  // Haze: the palace and the plain sit far back, so the stage stands out.
  g.fillStyle = 'rgba(206,226,238,0.45)'; g.fillRect(0, 0, W, H);
  const hz = g.createLinearGradient(0, 200, 0, H); hz.addColorStop(0, 'rgba(240,230,210,0)'); hz.addColorStop(1, 'rgba(240,230,210,0.35)');
  g.fillStyle = hz; g.fillRect(0, 200, W, H - 200);

  // The main platform: a block of battlements, its walkway on top, the wall
  // tapering below into a pillar of stone.
  const x0 = M.x0 * S, x1 = M.x1 * S, top = M.top * S, bot = M.bottom * S;
  const body = () => { g.beginPath(); g.moveTo(x0, top); g.lineTo(x1, top); g.lineTo(x1, bot - 40); g.quadraticCurveTo(x1 - 40, bot, (x0 + x1) / 2 + 90, bot + 30); g.lineTo((x0 + x1) / 2 + 60, H + 10); g.lineTo((x0 + x1) / 2 - 60, H + 10); g.lineTo((x0 + x1) / 2 - 90, bot + 30); g.quadraticCurveTo(x0 + 40, bot, x0, bot - 40); g.closePath(); };
  cel(g, body, '#8c7a5e', '#6a5a44', 3, [-4, 0]);
  g.save(); body(); g.clip();
  stoneBlocks(g, x0 - 10, top + 14, x1 + 10, bot + 60, 6, '#8a785c', rng);
  const sh = g.createLinearGradient(0, top, 0, H); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(30,20,10,0.45)');
  g.fillStyle = sh; g.fillRect(x0, top, x1 - x0, H - top);
  g.restore();
  // Two banners of Navarre down the front of the wall.
  for (const bx of [x0 + (x1 - x0) * 0.25, x0 + (x1 - x0) * 0.75]) {
    const bw = 46, bt = top + 16, bb = top + 96;
    cel(g, () => { g.beginPath(); g.moveTo(bx - bw / 2, bt); g.lineTo(bx + bw / 2, bt); g.lineTo(bx + bw / 2, bb); g.lineTo(bx, bb - 12); g.lineTo(bx - bw / 2, bb); g.closePath(); }, '#a8323a', '#7e2228', 2.4, [-3, 0]);
    g.strokeStyle = '#e0b84a'; g.lineWidth = 2.2;
    g.strokeRect(bx - bw / 2 + 7, bt + 8, bw - 14, 40);
    g.beginPath(); g.moveTo(bx - bw / 2 + 7, bt + 8); g.lineTo(bx + bw / 2 - 7, bt + 48); g.moveTo(bx + bw / 2 - 7, bt + 8); g.lineTo(bx - bw / 2 + 7, bt + 48); g.moveTo(bx, bt + 8); g.lineTo(bx, bt + 48); g.moveTo(bx - bw / 2 + 7, bt + 28); g.lineTo(bx + bw / 2 - 7, bt + 28); g.stroke();
    dot(g, bx, bt + 28, 3.4, '#3a8a4a');
    limb(g, bx - bw / 2 - 4, bt, bx + bw / 2 + 4, bt, 4, '#5a4030', 1.6);
  }
  // The walkway: a lit stone edge where the fighters stand.
  cel(g, () => { g.beginPath(); g.roundRect(x0 - 6, top - 2, x1 - x0 + 12, 16, 4); }, '#d8c49a', '#a8926a', 3, [0, -3]);
  // A low parapet behind, with merlons (scenery: nothing to bump into).
  g.save(); g.globalAlpha = 0.9;
  for (let x = x0 + 4; x < x1 - 10; x += 34) { g.beginPath(); g.rect(x, top - 18, 20, 16); g.fillStyle = '#a8946e'; g.fill(); stroke(g, 2); }
  g.restore();
  g.beginPath(); g.moveTo(x0 - 6, top); g.lineTo(x1 + 6, top); stroke(g, 3);

  // The floating platforms: wooden galleries, a banner hanging from each.
  for (const p of arena.platforms ?? []) {
    const px0 = p.x0 * S, px1 = p.x1 * S, py = p.y * S;
    for (const bx of [px0 + 18, px1 - 18]) limb(g, bx, py + 10, bx, py + 26, 5, '#6b4a2a', 1.6);
    cel(g, () => { g.beginPath(); g.roundRect(px0, py - 2, px1 - px0, 13, 4); }, '#9a6a3a', '#6b4a2a', 2.8, [0, -3]);
    g.strokeStyle = 'rgba(34,26,20,0.5)'; g.lineWidth = 1.5;
    for (let x = px0 + 24; x < px1 - 6; x += 24) { g.beginPath(); g.moveTo(x, py); g.lineTo(x, py + 10); g.stroke(); }
    const bx = (px0 + px1) / 2, bw = 30;
    cel(g, () => { g.beginPath(); g.moveTo(bx - bw / 2, py + 11); g.lineTo(bx + bw / 2, py + 11); g.lineTo(bx + bw / 2, py + 52); g.lineTo(bx, py + 44); g.lineTo(bx - bw / 2, py + 52); g.closePath(); }, '#a8323a', '#7e2228', 2.2, [-2, 0]);
    g.strokeStyle = '#e0b84a'; g.lineWidth = 1.8; g.strokeRect(bx - 9, py + 17, 18, 18);
    g.beginPath(); g.moveTo(bx - 9, py + 17); g.lineTo(bx + 9, py + 35); g.moveTo(bx + 9, py + 17); g.lineTo(bx - 9, py + 35); g.stroke();
  }
  return c;
}

// ---- the other stages ------------------------------------------------------------------------------
//
// Each place from DESIGN.md as a floating island over its landscape: the main
// platform's top and the floating platforms are drawn exactly where the stage
// data puts them; the rest is scenery.

const THEMES = {
  forest: { sky: ['#a8d0e8', '#dceee0'], far: '#7a9a6a', near: '#4a7a3a', top: '#6aa040', topDark: '#4a7a2a', body: '#7a5a3a', bodyDark: '#5a4028', plat: 'branch' },
  river: { sky: ['#9cc8ec', '#e8f0e0'], far: '#8aaa8a', near: '#5a8a5a', top: '#7ab050', topDark: '#5a8a38', body: '#8a6a48', bodyDark: '#6a4e34', plat: 'stone' },
  desert: { sky: ['#f0c890', '#f8e8c8'], far: '#d8a878', near: '#c08858', top: '#d8a870', topDark: '#b8885a', body: '#c08050', bodyDark: '#9a6038', plat: 'clay' },
  night: { sky: ['#141a3a', '#3a3a6a'], far: '#2a3048', near: '#1e2a38', top: '#3a5a3a', topDark: '#2a4028', body: '#4a4458', bodyDark: '#322e40', plat: 'slab' },
  mountain: { sky: ['#b8d4ec', '#eef4f8'], far: '#9aaabc', near: '#7a8a9a', top: '#f4f8fc', topDark: '#c8d4e0', body: '#8a8a90', bodyDark: '#66666e', plat: 'rock' },
};

function hills(g, y, amp, freq, col, phase = 0) {
  g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x += 16) g.lineTo(x, y + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.7 + phase) * amp * 0.3);
  g.lineTo(W, H); g.closePath(); g.fill();
}

function paintScene(arena, R) {
  const c = document.createElement('canvas');
  c.width = W * 2; c.height = H * 2;
  const g = c.getContext('2d');
  g.scale(2, 2);
  const T = THEMES[arena.theme] ?? THEMES.forest, rng = makeRng(arena.id.length * 977);
  const M = arena.main, x0 = M.x0 * S, x1 = M.x1 * S, top = M.top * S, bot = M.bottom * S;
  // Sky.
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, T.sky[0]); sky.addColorStop(1, T.sky[1]);
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // The far scenery of each place.
  if (arena.theme === 'night') {
    for (let n = 0; n < 90; n++) dot(g, rng.range(0, W), rng.range(0, 300), rng.range(0.6, 1.8), `rgba(255,255,240,${rng.range(0.4, 1)})`);
    oval(g, 760, 90, 34, 34, '#f4f0d8', '#d8d0b0', 0);
    g.fillStyle = 'rgba(244,240,216,0.15)'; g.beginPath(); g.arc(760, 90, 60, 0, TAU); g.fill();
  } else if (arena.theme === 'desert') {
    oval(g, 180, 110, 40, 40, '#fff4c8', '#f8e0a0', 0);
  } else {
    for (let k = 0; k < 5; k++) {
      const cx = rng.range(40, W - 40), cy = rng.range(30, 150), s = rng.range(0.7, 1.3);
      g.fillStyle = 'rgba(255,255,255,0.8)';
      for (const [dx, dy, r] of [[-26, 4, 16], [0, -4, 22], [26, 4, 16]]) { g.beginPath(); g.arc(cx + dx * s, cy + dy * s, r * s, 0, TAU); g.fill(); }
    }
  }
  if (arena.theme === 'mountain') {
    // Pyrenean peaks with snow.
    for (const [px, ph, col] of [[150, 230, '#a8b8c8'], [420, 280, '#8a9aac'], [700, 250, '#a0b0c0'], [900, 200, '#b0bece']]) {
      g.fillStyle = col; g.beginPath(); g.moveTo(px - 260, 420); g.lineTo(px, 420 - ph); g.lineTo(px + 260, 420); g.fill();
      g.fillStyle = '#f4f8fc'; g.beginPath(); g.moveTo(px - 46, 420 - ph + 50); g.lineTo(px, 420 - ph); g.lineTo(px + 46, 420 - ph + 50); g.lineTo(px + 18, 420 - ph + 40); g.lineTo(px, 420 - ph + 52); g.lineTo(px - 20, 420 - ph + 40); g.fill();
    }
    hills(g, 420, 14, 0.01, T.near);
  } else if (arena.theme === 'desert') {
    // Clay towers like Castildetierra.
    hills(g, 380, 10, 0.008, T.far);
    for (const [px, w, h] of [[120, 50, 150], [330, 34, 110], [610, 60, 170], [820, 40, 120]]) {
      g.fillStyle = '#c89060'; g.beginPath(); g.moveTo(px - w, 390); g.lineTo(px - w * 0.6, 390 - h); g.lineTo(px - w * 0.2, 390 - h - 16); g.lineTo(px + w * 0.4, 390 - h - 4); g.lineTo(px + w * 0.7, 390 - h + 30); g.lineTo(px + w, 390); g.fill();
      for (let n = 1; n < 5; n++) { g.fillStyle = 'rgba(120,70,40,0.25)'; g.fillRect(px - w * 0.8, 390 - h + n * h / 5, w * 1.6, 3); }
    }
    hills(g, 430, 6, 0.012, T.near);
  } else if (arena.theme === 'night') {
    hills(g, 360, 22, 0.007, T.far);
    // Dolmens on the plateau.
    for (const [px, s] of [[180, 1], [700, 0.8]]) {
      g.fillStyle = '#4a4a5a'; g.fillRect(px - 26 * s, 330 - 40 * s, 12 * s, 40 * s); g.fillRect(px + 14 * s, 330 - 40 * s, 12 * s, 40 * s);
      g.fillRect(px - 34 * s, 330 - 52 * s, 68 * s, 14 * s);
    }
    hills(g, 420, 12, 0.01, T.near);
  } else {
    hills(g, 340, 24, 0.008, T.far);
    // Trees: beech and fir for the forest, alders along the river.
    for (let n = 0; n < 26; n++) {
      const px = rng.range(0, W), py = rng.range(330, 410), s = rng.range(0.6, 1.2);
      g.fillStyle = shade(T.near, rng.range(-0.15, 0.1));
      if (arena.theme === 'forest' && n % 2) { g.beginPath(); g.moveTo(px, py - 70 * s); g.lineTo(px + 22 * s, py); g.lineTo(px - 22 * s, py); g.fill(); }
      else { g.beginPath(); g.arc(px, py - 34 * s, 26 * s, 0, TAU); g.fill(); g.fillRect(px - 3 * s, py - 12 * s, 6 * s, 14 * s); }
    }
    if (arena.theme === 'river') {
      // The Bidasoa winding through the valley.
      g.fillStyle = '#7ab8d8'; g.beginPath(); g.moveTo(0, 470); g.bezierCurveTo(300, 420, 600, 500, W, 440); g.lineTo(W, 480); g.bezierCurveTo(600, 540, 300, 460, 0, 510); g.fill();
    }
    hills(g, 440, 10, 0.012, shade(T.near, -0.1));
  }
  // Haze so the stage stands out.
  g.fillStyle = arena.theme === 'night' ? 'rgba(20,24,50,0.25)' : 'rgba(230,236,240,0.3)'; g.fillRect(0, 0, W, H);

  // The main platform: an island of earth (or clay, or rock) tapering below.
  const body = () => { g.beginPath(); g.moveTo(x0, top); g.lineTo(x1, top); g.lineTo(x1 - 6, bot - 40); g.quadraticCurveTo(x1 - 50, bot, (x0 + x1) / 2 + 80, bot + 30); g.lineTo((x0 + x1) / 2 + 30, H + 10); g.lineTo((x0 + x1) / 2 - 30, H + 10); g.lineTo((x0 + x1) / 2 - 80, bot + 30); g.quadraticCurveTo(x0 + 50, bot, x0 + 6, bot - 40); g.closePath(); };
  cel(g, body, T.body, T.bodyDark, 3, [-4, 0]);
  g.save(); body(); g.clip();
  if (arena.theme === 'desert') for (let y = top + 14; y < H; y += 14) { g.fillStyle = `rgba(120,60,30,${0.12 + (y % 28 ? 0.06 : 0)})`; g.fillRect(x0, y, x1 - x0, 7); }
  else if (arena.theme === 'mountain') for (let n = 0; n < 30; n++) { const px = rng.range(x0, x1), py = rng.range(top + 20, H); g.beginPath(); g.moveTo(px, py); g.lineTo(px + rng.range(10, 30), py + rng.range(-8, 8)); stroke(g, 2, 'rgba(40,40,50,0.4)'); }
  else for (let n = 0; n < 40; n++) oval(g, rng.range(x0, x1), rng.range(top + 20, H), rng.range(3, 8), rng.range(2, 5), shade(T.body, rng.range(-0.15, 0.1)), shade(T.bodyDark, -0.1), 1.2);
  if (arena.theme === 'forest' || arena.theme === 'river' || arena.theme === 'night') for (let n = 0; n < 8; n++) { const rx = rng.range(x0 + 20, x1 - 20); g.beginPath(); g.moveTo(rx, top + 12); g.quadraticCurveTo(rx + rng.range(-20, 20), top + 50, rx + rng.range(-30, 30), top + rng.range(60, 110)); stroke(g, 3, shade(T.bodyDark, -0.2)); }
  const sh = g.createLinearGradient(0, top, 0, H); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(20,10,5,0.45)');
  g.fillStyle = sh; g.fillRect(x0, top, x1 - x0, H - top);
  g.restore();
  // The surface: grass, clay, snow; water where the stage has it.
  cel(g, () => { g.beginPath(); g.roundRect(x0 - 6, top - 3, x1 - x0 + 12, 16, 6); }, T.top, T.topDark, 3, [0, -3]);
  if (arena.theme === 'forest' || arena.theme === 'river' || arena.theme === 'night') for (let x = x0; x < x1; x += 7) { g.beginPath(); g.moveTo(x, top); g.lineTo(x + 2, top - 5 - (x * 7) % 4); stroke(g, 1.6, shade(T.top, 0.15)); }
  if (arena.theme === 'mountain') for (let x = x0; x < x1; x += 40) oval(g, x + 20, top + 2, 18, 4, '#ffffff', '#dde6ee', 0);
  for (const w of arena.water ?? []) {
    g.fillStyle = 'rgba(90,170,220,0.85)'; g.fillRect(w.x0 * S, top - 2, (w.x1 - w.x0) * S, 10);
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1.6;
    for (let x = w.x0 * S + 6; x < w.x1 * S - 10; x += 22) { g.beginPath(); g.moveTo(x, top + 2); g.quadraticCurveTo(x + 5, top - 1, x + 10, top + 2); g.stroke(); }
  }
  g.beginPath(); g.moveTo(x0 - 6, top); g.lineTo(x1 + 6, top); stroke(g, 3);

  // Floating platforms, each place its own kind.
  for (const p of arena.platforms ?? []) {
    const px0 = p.x0 * S, px1 = p.x1 * S, py = p.y * S;
    if (T.plat === 'branch') {
      cel(g, () => { g.beginPath(); g.roundRect(px0, py - 3, px1 - px0, 13, 6); }, '#8a6038', '#5e3e22', 2.8, [0, -3]);
      for (let n = 0; n < 5; n++) oval(g, px0 + 10 + n * (px1 - px0 - 20) / 4, py - 6 + (n % 2) * 3, 10, 6, n % 2 ? '#6aa040' : '#5a9035', '#4a7a2a', 1.6);
    } else if (T.plat === 'stone') {
      cel(g, () => { g.beginPath(); g.ellipse((px0 + px1) / 2, py + 6, (px1 - px0) / 2, 11, 0, 0, TAU); }, '#a8a49a', '#7a766c', 2.8, [0, -3]);
      g.beginPath(); g.ellipse((px0 + px1) / 2, py + 14, (px1 - px0) / 2 - 4, 4, 0, 0, Math.PI); stroke(g, 2, 'rgba(90,170,220,0.9)');
    } else if (T.plat === 'clay') {
      cel(g, () => { g.beginPath(); g.moveTo(px0, py - 2); g.lineTo(px1, py - 2); g.lineTo(px1 - 10, py + 22); g.lineTo(px0 + 10, py + 22); g.closePath(); }, '#d09868', '#a87048', 2.8, [0, -3]);
    } else if (T.plat === 'slab') {
      // A dolmen capstone on two uprights, as the jentilak left them.
      for (const bx of [px0 + 26, px1 - 26]) cel(g, () => { g.beginPath(); g.rect(bx - 8, py + 10, 16, 60); }, '#6a6a7a', '#4a4a5a', 2.4, [-3, 0]);
      cel(g, () => { g.beginPath(); g.roundRect(px0, py - 3, px1 - px0, 15, 5); }, '#8a8a9a', '#5a5a6a', 2.8, [0, -3]);
    } else {
      cel(g, () => { g.beginPath(); g.moveTo(px0, py - 2); g.lineTo(px1, py - 2); g.lineTo(px1 - 14, py + 18); g.lineTo((px0 + px1) / 2, py + 26); g.lineTo(px0 + 14, py + 18); g.closePath(); }, '#9a9aa2', '#6e6e76', 2.8, [0, -3]);
      oval(g, (px0 + px1) / 2, py - 1, (px1 - px0) / 2 - 4, 4, '#ffffff', '#dde6ee', 0);
    }
    g.beginPath(); g.moveTo(px0, py); g.lineTo(px1, py); stroke(g, 2.4);
  }
  return c;
}

// ---- stages: each place its own shape -------------------------------------------------------------
//
// Painted once at the stage's own size: the sky and far scenery of the place,
// then every solid block by what it is (castle floor, wall, pillars and arch,
// a beech trunk, river banks, clay towers, a dolmen, rock steps), then the
// floating platforms. Blocks and platforms sit exactly where the data puts them.

const MAT = {
  castle: { base: '#9a8a6c', dark: '#76684e', top: '#d8c49a', topDark: '#a8926a', plat: 'wood' },
  forest: { base: '#7a5a3a', dark: '#5a4028', top: '#6aa040', topDark: '#4a7a2a', plat: 'branch' },
  river: { base: '#8a6a48', dark: '#6a4e34', top: '#7ab050', topDark: '#5a8a38', plat: 'bridge' },
  desert: { base: '#c08050', dark: '#9a6038', top: '#d8a870', topDark: '#b8885a', plat: 'clay' },
  night: { base: '#4a4458', dark: '#322e40', top: '#3a5a3a', topDark: '#2a4028', plat: 'slab' },
  mountain: { base: '#8a8a90', dark: '#66666e', top: '#f4f8fc', topDark: '#c8d4e0', plat: 'rock' },
};

function paintStage(arena, R) {
  const st = stageOf(arena), Wd = st.world.w * S, Hd = st.world.h * S;
  const c = document.createElement('canvas');
  c.width = Wd * 2; c.height = Hd * 2;
  const g = c.getContext('2d');
  g.scale(2, 2);
  const theme = arena.theme ?? 'castle', T = THEMES[theme] ?? THEMES.forest, M = MAT[theme] ?? MAT.castle;
  const rng = makeRng(arena.id.length * 977 + 13);
  // Sky.
  const sky = g.createLinearGradient(0, 0, 0, Hd);
  if (theme === 'castle') { sky.addColorStop(0, '#8ec0e4'); sky.addColorStop(0.6, '#cfe2ea'); sky.addColorStop(1, '#f1dcb0'); }
  else { sky.addColorStop(0, T.sky[0]); sky.addColorStop(1, T.sky[1]); }
  g.fillStyle = sky; g.fillRect(0, 0, Wd, Hd);
  const hillsW = (y, amp, freq, col, ph = 0) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, Hd); for (let x = 0; x <= Wd; x += 16) g.lineTo(x, y + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 2.7 + ph) * amp * 0.3); g.lineTo(Wd, Hd); g.closePath(); g.fill(); };
  const clouds = (n) => { for (let k = 0; k < n; k++) { const cx = rng.range(40, Wd - 40), cy = rng.range(30, Hd * 0.3), s = rng.range(0.7, 1.4); g.fillStyle = 'rgba(255,255,255,0.8)'; for (const [dx, dy, r] of [[-26, 4, 16], [0, -4, 22], [26, 4, 16]]) { g.beginPath(); g.arc(cx + dx * s, cy + dy * s, r * s, 0, TAU); g.fill(); } } };
  // Far scenery.
  const horizon = Hd * 0.62;
  if (theme === 'night') {
    for (let n = 0; n < 140; n++) dot(g, rng.range(0, Wd), rng.range(0, horizon), rng.range(0.6, 1.8), `rgba(255,255,240,${rng.range(0.4, 1)})`);
    oval(g, Wd * 0.8, 90, 34, 34, '#f4f0d8', '#d8d0b0', 0); g.fillStyle = 'rgba(244,240,216,0.15)'; g.beginPath(); g.arc(Wd * 0.8, 90, 64, 0, TAU); g.fill();
    hillsW(horizon, 22, 0.007, T.far);
  } else if (theme === 'desert') {
    oval(g, Wd * 0.2, 110, 40, 40, '#fff4c8', '#f8e0a0', 0);
    hillsW(horizon, 10, 0.008, T.far);
    for (const [px, w, hh] of [[0.12, 50, 150], [0.38, 34, 110], [0.66, 60, 170], [0.88, 40, 120]]) { const x = px * Wd; g.fillStyle = '#c89060'; g.beginPath(); g.moveTo(x - w, horizon + 20); g.lineTo(x - w * 0.6, horizon + 20 - hh); g.lineTo(x - w * 0.2, horizon + 4 - hh); g.lineTo(x + w * 0.4, horizon + 16 - hh); g.lineTo(x + w * 0.7, horizon + 50 - hh); g.lineTo(x + w, horizon + 20); g.fill(); }
  } else if (theme === 'mountain') {
    clouds(4);
    for (const [px, ph, col] of [[0.15, 260, '#a8b8c8'], [0.45, 310, '#8a9aac'], [0.72, 280, '#a0b0c0'], [0.95, 230, '#b0bece']]) { const x = px * Wd; g.fillStyle = col; g.beginPath(); g.moveTo(x - 280, horizon + 40); g.lineTo(x, horizon + 40 - ph); g.lineTo(x + 280, horizon + 40); g.fill(); g.fillStyle = '#f4f8fc'; g.beginPath(); g.moveTo(x - 46, horizon + 90 - ph); g.lineTo(x, horizon + 40 - ph); g.lineTo(x + 46, horizon + 90 - ph); g.lineTo(x, horizon + 80 - ph); g.fill(); }
  } else if (theme === 'castle') {
    clouds(5);
    // The palace of Olite in the haze: walls and towers, some with pointed roofs.
    g.save(); g.globalAlpha = 0.55;
    g.fillStyle = '#cdbb98'; g.fillRect(Wd * 0.05, horizon - 70, Wd * 0.9, 70);
    for (let x = Wd * 0.05; x < Wd * 0.95; x += 22) g.fillRect(x, horizon - 80, 12, 10);
    g.restore();
    for (const [px, w, hh, roof] of [[0.1, 44, 150, 0], [0.24, 36, 120, 1], [0.38, 54, 200, 0], [0.55, 40, 140, 1], [0.7, 58, 210, 0], [0.84, 38, 130, 1], [0.95, 46, 160, 0]]) tower(g, px * Wd, horizon, w, hh, roof ? 'roof' : 'cren', 0.55);
  } else {
    clouds(5);
    hillsW(horizon - 20, 24, 0.008, T.far);
    for (let n = 0; n < Wd / 30; n++) { const px = rng.range(0, Wd), py = rng.range(horizon, horizon + 70), s = rng.range(0.6, 1.3); g.fillStyle = shade(T.near, rng.range(-0.15, 0.1)); if (theme === 'forest' && n % 2) { g.beginPath(); g.moveTo(px, py - 70 * s); g.lineTo(px + 22 * s, py); g.lineTo(px - 22 * s, py); g.fill(); } else { g.beginPath(); g.arc(px, py - 34 * s, 26 * s, 0, TAU); g.fill(); g.fillRect(px - 3 * s, py - 12 * s, 6 * s, 14 * s); } }
  }
  if (theme === 'river') {
    // The Bidasoa itself, between the banks and far below.
    g.fillStyle = '#5aa8d0'; g.fillRect(0, Hd - 70, Wd, 70);
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2;
    for (let n = 0; n < 30; n++) { const x = rng.range(0, Wd), y = rng.range(Hd - 64, Hd - 6); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 8, y - 3, x + 16, y); g.stroke(); }
  }
  g.fillStyle = theme === 'night' ? 'rgba(20,24,50,0.25)' : 'rgba(230,236,240,0.32)'; g.fillRect(0, 0, Wd, Hd);

  // Scenery that looks solid but isn't (pillars, uprights, the great beech), then the solid blocks.
  for (const b of arena.deco ?? []) paintBlock(g, b, theme, M, rng, Hd);
  for (const b of st.solids) paintBlock(g, b, theme, M, rng, Hd);
  // Water you can wade in (River-born).
  for (const w of arena.water ?? []) {
    g.fillStyle = 'rgba(90,170,220,0.85)'; g.fillRect(w.x0 * S, (w.y0 + 10) * S - 6, (w.x1 - w.x0) * S, 12);
  }
  // Floating platforms.
  for (const p of st.platforms ?? []) paintPlatform(g, p, M.plat, st);
  return c;
}

function paintBlock(g, b, theme, M, rng, Hd) {
  const x0 = b.x0 * S, x1 = b.x1 * S, top = b.top * S, bot = Math.min(Hd + 4, b.bottom * S), w = x1 - x0;
  const reachesFloor = b.bottom * S >= Hd - 40;
  const part = b.part ?? 'floor';
  // The body: a floating island tapers below; walls, pillars and towers are straight.
  const body = () => {
    g.beginPath();
    if (reachesFloor && ['floor', 'ground', 'bank', 'mesa', 'hill', 'rock'].includes(part)) {
      // Taper away only on sides open to the void (those with a ledge); a side
      // that meets the next block goes straight down so they join.
      const L = (b.ledges ?? []).includes('l'), Rr = (b.ledges ?? []).includes('r');
      g.moveTo(x0, top); g.lineTo(x1, top);
      if (Rr) { g.lineTo(x1 - 6, bot - 50); g.quadraticCurveTo(x1 - w * 0.15, bot, (x0 + x1) / 2 + w * 0.2, bot + 30); } else g.lineTo(x1, bot + 30);
      if (L) { g.lineTo((x0 + x1) / 2 - w * 0.2, bot + 30); g.quadraticCurveTo(x0 + w * 0.15, bot, x0 + 6, bot - 50); } else g.lineTo(x0, bot + 30);
      g.closePath();
    } else g.rect(x0, top, w, bot - top);
  };
  let base = M.base, dark = M.dark;
  if (part === 'trunk' || part === 'beech' || part === 'log') { base = '#8a7a6a'; dark = '#5e5246'; }
  if (part === 'stone' || part === 'capstone') { base = '#7a7a8a'; dark = '#55556a'; }
  if (part === 'tower' && theme === 'desert') { base = '#c89060'; dark = '#9a6838'; }
  cel(g, body, base, dark, 3, [-4, 0]);
  g.save(); body(); g.clip();
  if (theme === 'castle' || part === 'stone' || part === 'capstone') stoneBlocks(g, x0 - 10, top + (part === 'lintel' ? 0 : 12), x1 + 10, bot + 40, Math.max(1, Math.round((bot - top) / 26)), base, rng);
  else if (theme === 'desert') for (let y = top + 10; y < bot; y += 14) { g.fillStyle = `rgba(120,60,30,${0.1 + ((y / 14) % 2 ? 0.08 : 0)})`; g.fillRect(x0, y, w, 7); }
  else if (part === 'trunk' || part === 'beech' || part === 'log') for (let n = 0; n < 12; n++) { const yy = top + rng.range(10, bot - top); g.beginPath(); g.moveTo(x0 + rng.range(4, w * 0.4), yy); g.quadraticCurveTo(x0 + w * 0.5, yy + 4, x1 - rng.range(4, w * 0.4), yy); stroke(g, 1.8, 'rgba(40,30,20,0.4)'); }
  else if (theme === 'mountain') for (let n = 0; n < w / 20; n++) { const px = rng.range(x0, x1), py = rng.range(top + 20, bot); g.beginPath(); g.moveTo(px, py); g.lineTo(px + rng.range(10, 30), py + rng.range(-8, 8)); stroke(g, 2, 'rgba(40,40,50,0.4)'); }
  else for (let n = 0; n < w / 14; n++) oval(g, rng.range(x0, x1), rng.range(top + 20, bot), rng.range(3, 8), rng.range(2, 5), shade(base, rng.range(-0.15, 0.1)), shade(dark, -0.1), 1.2);
  const shd = g.createLinearGradient(0, top, 0, bot); shd.addColorStop(0, 'rgba(0,0,0,0)'); shd.addColorStop(1, 'rgba(20,10,5,0.4)');
  g.fillStyle = shd; g.fillRect(x0, top, w, bot - top);
  g.restore();
  // Details by part.
  if (part === 'lintel') {
    // The passage under the keep: dark inside, an arch at its top, a torch on each side.
    const ax0 = x0 + 40, ax1 = x1 - 40, floor = (b.archTo ?? b.bottom + 90) * S;
    const inside = g.createLinearGradient(0, bot, 0, floor); inside.addColorStop(0, '#1a140e'); inside.addColorStop(1, '#3a2c1e');
    g.fillStyle = inside; g.fillRect(ax0, bot, ax1 - ax0, floor - bot);
    g.beginPath(); g.moveTo(ax0, bot + 26); g.quadraticCurveTo((ax0 + ax1) / 2, bot - 6, ax1, bot + 26); g.lineTo(ax1, bot); g.lineTo(ax0, bot); g.closePath(); g.fillStyle = base; g.fill(); stroke(g, 2.4);
    for (const tx of [ax0 + 10, ax1 - 10]) { g.fillStyle = '#ffb040'; g.beginPath(); g.moveTo(tx - 4, bot + 50); g.quadraticCurveTo(tx, bot + 36, tx + 4, bot + 50); g.fill(); g.fillStyle = '#5a4030'; g.fillRect(tx - 2, bot + 50, 4, 10); }
  }
  if (part === 'wall' || part === 'tower' || (part === 'floor' && theme === 'castle')) {
    // Crenellations.
    if (part !== 'floor') for (let x = x0; x < x1 - 8; x += 20) { g.beginPath(); g.rect(x + 2, top - 12, 12, 12); g.fillStyle = shade(base, 0.08); g.fill(); stroke(g, 2); }
  }
  if (part === 'tower' && theme === 'castle') { g.beginPath(); g.moveTo(x0 + w / 2, top - 12); g.lineTo(x0 + w / 2, top - 60); stroke(g, 3); g.beginPath(); g.moveTo(x0 + w / 2, top - 60); g.lineTo(x0 + w / 2 + 30, top - 52); g.lineTo(x0 + w / 2, top - 44); g.closePath(); g.fillStyle = '#a8323a'; g.fill(); stroke(g, 2); }
  if (part === 'floor' && theme === 'castle') for (const bx of [x0 + w * 0.22, x0 + w * 0.78]) {
    const bw = 44, bt = top + 16, bb = top + 90;
    cel(g, () => { g.beginPath(); g.moveTo(bx - bw / 2, bt); g.lineTo(bx + bw / 2, bt); g.lineTo(bx + bw / 2, bb); g.lineTo(bx, bb - 12); g.lineTo(bx - bw / 2, bb); g.closePath(); }, '#a8323a', '#7e2228', 2.4, [-3, 0]);
    g.strokeStyle = '#e0b84a'; g.lineWidth = 2.2; g.strokeRect(bx - bw / 2 + 7, bt + 8, bw - 14, 36);
    g.beginPath(); g.moveTo(bx - bw / 2 + 7, bt + 8); g.lineTo(bx + bw / 2 - 7, bt + 44); g.moveTo(bx + bw / 2 - 7, bt + 8); g.lineTo(bx - bw / 2 + 7, bt + 44); g.stroke(); dot(g, bx, bt + 26, 3.4, '#3a8a4a');
  }
  if (part === 'log') for (const ex of [x0, x1]) oval(g, ex, (top + bot) / 2, 6, (bot - top) / 2, '#c8b08a', '#a08a68', 2);
  if (part === 'trunk' || part === 'beech') {
    // The beech's canopy spreads above the trunk.
    for (let n = 0; n < 7; n++) oval(g, (x0 + x1) / 2 + (n - 3) * 26, top - 10 - Math.abs(n - 3) * -6 - (n % 2) * 12, 34, 24, n % 2 ? '#5a9035' : '#6aa040', '#4a7a2a', 2);
  }
  // The walking surface.
  if (part === 'beech') return;
  const surfaceCol = part === 'trunk' || part === 'log' ? '#8a7a6a' : part === 'capstone' || part === 'stone' ? '#9a9aaa' : part === 'tower' && theme === 'desert' ? '#d8a870' : M.top;
  if (!['pillar', 'stone'].includes(part)) {
    cel(g, () => { g.beginPath(); g.roundRect(x0 - 4, top - 3, w + 8, 14, 5); }, surfaceCol, shade(surfaceCol, -0.25), 3, [0, -3]);
    if (['forest', 'river', 'night'].includes(theme) && !['trunk', 'capstone'].includes(part)) for (let x = x0; x < x1; x += 7) { g.beginPath(); g.moveTo(x, top); g.lineTo(x + 2, top - 5 - (x * 7) % 4); stroke(g, 1.6, shade(M.top, 0.15)); }
    if (theme === 'mountain') for (let x = x0; x < x1; x += 40) oval(g, x + 20, top + 2, 18, 4, '#ffffff', '#dde6ee', 0);
  }
  g.beginPath(); g.moveTo(x0 - 4, top); g.lineTo(x1 + 4, top); stroke(g, 3);
}

function paintPlatform(g, p, kind, st) {
  const px0 = p.x0 * S, px1 = p.x1 * S, py = p.y * S;
  if (kind === 'wood') {
    for (const bx of [px0 + 14, px1 - 14]) limb(g, bx, py + 10, bx, py + 24, 5, '#6b4a2a', 1.6);
    cel(g, () => { g.beginPath(); g.roundRect(px0, py - 2, px1 - px0, 13, 4); }, '#9a6a3a', '#6b4a2a', 2.8, [0, -3]);
    const bx = (px0 + px1) / 2;
    cel(g, () => { g.beginPath(); g.moveTo(bx - 14, py + 11); g.lineTo(bx + 14, py + 11); g.lineTo(bx + 14, py + 46); g.lineTo(bx, py + 38); g.lineTo(bx - 14, py + 46); g.closePath(); }, '#a8323a', '#7e2228', 2.2, [-2, 0]);
  } else if (kind === 'branch') {
    cel(g, () => { g.beginPath(); g.roundRect(px0, py - 3, px1 - px0, 13, 6); }, '#8a6038', '#5e3e22', 2.8, [0, -3]);
    for (let n = 0; n < 5; n++) oval(g, px0 + 10 + n * (px1 - px0 - 20) / 4, py - 6 + (n % 2) * 3, 10, 6, n % 2 ? '#6aa040' : '#5a9035', '#4a7a2a', 1.6);
  } else if (kind === 'bridge') {
    // The lamiak's bridge: planks with stone ends; low ones are stepping stones.
    if (p.y * S > st.main.top * S) { cel(g, () => { g.beginPath(); g.ellipse((px0 + px1) / 2, py + 6, (px1 - px0) / 2, 10, 0, 0, TAU); }, '#a8a49a', '#7a766c', 2.6, [0, -3]); }
    else { cel(g, () => { g.beginPath(); g.roundRect(px0, py - 2, px1 - px0, 14, 3); }, '#a49a88', '#746b5c', 2.8, [0, -3]); for (let x = px0 + 14; x < px1 - 6; x += 14) { g.beginPath(); g.moveTo(x, py); g.lineTo(x, py + 12); stroke(g, 1.5, 'rgba(34,26,20,0.5)'); } }
  } else if (kind === 'clay') {
    cel(g, () => { g.beginPath(); g.moveTo(px0, py - 2); g.lineTo(px1, py - 2); g.lineTo(px1 - 10, py + 22); g.lineTo(px0 + 10, py + 22); g.closePath(); }, '#d09868', '#a87048', 2.8, [0, -3]);
  } else if (kind === 'slab') {
    cel(g, () => { g.beginPath(); g.roundRect(px0, py - 3, px1 - px0, 15, 5); }, '#8a8a9a', '#5a5a6a', 2.8, [0, -3]);
  } else {
    cel(g, () => { g.beginPath(); g.moveTo(px0, py - 2); g.lineTo(px1, py - 2); g.lineTo(px1 - 14, py + 18); g.lineTo((px0 + px1) / 2, py + 26); g.lineTo(px0 + 14, py + 18); g.closePath(); }, '#9a9aa2', '#6e6e76', 2.8, [0, -3]);
    oval(g, (px0 + px1) / 2, py - 1, (px1 - px0) / 2 - 4, 4, '#ffffff', '#dde6ee', 0);
  }
  g.beginPath(); g.moveTo(px0, py); g.lineTo(px1, py); stroke(g, 2.4);
}

function paintArena(arena, R) { return paintStage(arena, R); }

// A small picture of a stage for the stage-select screen.
export function stageThumb(arena, R) {
  return cached(`thumb.${arena.id}`, () => {
    const big = paintArena(arena, R), c = document.createElement('canvas'); c.width = 240; c.height = 135;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.fillStyle = '#1a140e'; g.fillRect(0, 0, 240, 135);
    const k = Math.max(240 / big.width, 135 / big.height); g.drawImage(big, (240 - big.width * k) / 2, (135 - big.height * k) / 2, big.width * k, big.height * k);
    return c.toDataURL();
  });
}

// ---- the fighters: skeleton and animation --------------------------------------------------------
//
// Every person-shaped fighter shares one skeleton: a torso that leans and
// squashes, a head, and two-part arms and legs with elbows and knees. A pose
// is a set of joint angles; animations are key poses blended over time, so a
// blow winds up, snaps out and follows through, a jump crouches, stretches
// and tucks, a landing squashes. Fighters are drawn facing right at their
// feet, then mirrored. Angles are measured from hanging straight down,
// turning forward: 0 down, PI/2 ahead, PI straight up.
//
//   afS/afE  front arm: shoulder angle, elbow bend (forearm turns further forward)
//   abS/abE  back arm
//   lfH/lfK  front leg: hip angle, knee bend (the shin folds back)
//   lbH/lbK  back leg
//   lean     torso tilt forward; head: head tilt; sq: squash (<1) or stretch (>1)
//   rx, ry   body offset; wpn: how a held weapon sits on the forearm; spin: whole-body turn

const STAND = { sq: 1, lean: 0.14, head: -0.04, rx: 0, ry: 0, afS: 1.0, afE: 1.35, abS: 0.7, abE: 1.3, lfH: 0.42, lfK: 0.55, lbH: -0.32, lbK: 0.4, wpn: 1.3, spin: 0 };
const pose = (over) => ({ ...STAND, ...over });
const mix = (a, b, k) => { const o = {}; for (const key in a) o[key] = a[key] + ((b[key] ?? a[key]) - a[key]) * k; return o; };
const easeIn = (k) => k * k;
const easeOut = (k) => 1 - (1 - k) * (1 - k);
const easeIO = (k) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k));

const KEY = {
  crouch: pose({ sq: 0.9, lean: 0.18, lfH: 0.8, lfK: 1.4, lbH: 0.25, lbK: 1.3, afS: 0.5, afE: 0.9, abS: 0.1, abE: 0.9 }),
  rise: pose({ sq: 1.08, lean: 0.05, lfH: 0.95, lfK: 1.5, lbH: -0.25, lbK: 0.5, afS: 2.3, afE: 0.4, abS: 1.7, abE: 0.5, wpn: 1.2 }),
  fall: pose({ sq: 1, lean: 0, lfH: 0.4, lfK: 0.5, lbH: -0.3, lbK: 0.35, afS: 1.4, afE: 0.6, abS: 2.0, abE: 0.3 }),
  tuck: pose({ sq: 0.92, lean: 0.25, lfH: 1.3, lfK: 2.0, lbH: 1.1, lbK: 1.9, afS: 1.0, afE: 1.4, abS: 0.9, abE: 1.4 }),
  hurt: pose({ lean: -0.35, head: -0.3, afS: 2.0, afE: 1.0, abS: 2.5, abE: 0.8, lfH: 0.45, lfK: 0.6, lbH: -0.25, lbK: 0.3, wpn: 2.4 }),
  spread: pose({ lean: -0.1, head: -0.2, afS: 2.4, afE: 0.2, abS: -2.2, abE: 0.2, lfH: 0.7, lfK: 0.2, lbH: -0.7, lbK: 0.2 }),
  shield: pose({ sq: 0.94, lean: 0.12, afS: 1.25, afE: 1.4, abS: 1.0, abE: 1.5, lfH: 0.45, lfK: 0.7, lbH: -0.2, lbK: 0.6, wpn: 2.8 }),
  hang: pose({ afS: 3.05, afE: 0.15, abS: 2.95, abE: 0.2, lfH: 0.2, lfK: 0.35, lbH: -0.05, lbK: 0.5, lean: -0.05, wpn: 2.2 }),
  climb: pose({ sq: 0.95, lean: 0.4, afS: 2.0, afE: 1.2, abS: 1.6, abE: 1.3, lfH: 1.1, lfK: 1.6, lbH: 0.2, lbK: 1.0 }),
  bow: pose({ lean: 0.65, head: 0.25, afS: 0.15, afE: 0.1, abS: 0.05, abE: 0.1, lfK: 0.15, lbK: 0.15, wpn: 0.9 }),
  hold: pose({ lean: 0.15, afS: 1.5, afE: 0.6, abS: 1.35, abE: 0.7, lfH: 0.4, lfK: 0.3, lbH: -0.35, lbK: 0.2 }),
  summon: pose({ sq: 1.06, lean: -0.08, afS: 2.9, afE: 0.25, abS: 2.8, abE: 0.3, wpn: 0.6 }),
};

// Blows: a wind-up (W) and the strike (S); the animation eases into W over
// the move's startup, snaps to S as it becomes active, holds, and eases back.
const ATK = {
  light0: { W: { afS: 0.5, afE: 1.9, lean: -0.05, wpn: 1.9 }, S: { afS: 1.65, afE: 0.05, lean: 0.2, lfH: 0.5, lfK: 0.25, lbH: -0.35, wpn: 0.15 } },
  light1: { W: { abS: 0.4, abE: 1.9, afS: 0.9, afE: 1.2 }, S: { abS: 1.6, abE: 0.05, afS: -0.3, afE: 0.8, lean: 0.24, lfH: 0.5, lbH: -0.35 } },
  light2: { W: { afS: 3.35, afE: 0.7, lean: -0.18, lbH: -0.4, wpn: 1.3 }, S: { afS: 1.2, afE: 0.1, lean: 0.34, lfH: 0.75, lfK: 0.45, lbH: -0.55, lbK: 0.15, sq: 0.95, wpn: 0.1 } },
  ftilt: { W: { afS: 2.9, afE: 0.7, lean: -0.12, wpn: 1.3 }, S: { afS: 1.3, afE: 0.05, lean: 0.3, lfH: 0.7, lfK: 0.4, lbH: -0.5, wpn: 0.05 } },
  up: { W: { afS: 0.35, afE: 0.4, lfK: 0.5, lbK: 0.5, sq: 0.94, wpn: 2.2 }, S: { afS: 3.1, afE: 0.1, lean: -0.2, head: -0.2, sq: 1.07, wpn: 0.1 } },
  down: { W: { ...KEY.crouch, afS: 0.6, afE: 1.0 }, S: { ...KEY.crouch, afS: 1.45, afE: 0.0, lean: 0.4, lfH: 1.15, lfK: 0.35, ry: 2, wpn: 0.05 } },
  fsmash: { W: { afS: 3.85, afE: 0.9, abS: -0.8, lean: -0.32, head: -0.15, lbH: -0.55, lbK: 0.4, lfH: 0.3, wpn: 1.2 }, S: { afS: 1.0, afE: 0.0, abS: -1.1, lean: 0.48, lfH: 0.95, lfK: 0.45, lbH: -0.85, lbK: 0.1, sq: 0.93, wpn: 0.0 } },
  usmash: { W: { ...KEY.crouch, afS: 0.2, abS: 0.2, wpn: 1.8 }, S: { afS: 3.1, afE: 0.05, abS: 3.0, abE: 0.05, sq: 1.15, lfH: 0.08, lfK: 0, lbH: -0.08, lbK: 0, lean: -0.08, head: -0.25, wpn: 0.05 } },
  dsmash: { W: { afS: 2.6, abS: 2.6, afE: 0.3, abE: 0.3, sq: 1.05, wpn: 0.6 }, S: { lfH: 1.05, lfK: 0.2, lbH: -1.05, lbK: 0.2, afS: 1.25, abS: -1.25, afE: 0, abE: 0, sq: 0.88, lean: 0.1, wpn: 0.0 } },
  air: { W: { ...KEY.tuck }, S: { afS: 1.75, afE: 0.1, abS: -1.5, abE: 0.1, lfH: 1.05, lfK: 0.1, lbH: -0.95, lbK: 0.1, lean: 0.1, wpn: 0.1 } },
  fair: { W: { afS: 3.5, afE: 0.6, abS: 2.8, lean: -0.22, lfH: 0.9, lfK: 1.2, wpn: 1.2 }, S: { afS: 0.8, afE: 0.1, abS: 0.6, lean: 0.38, lfH: 0.7, lfK: 0.6, lbH: -0.4, wpn: 0.05 } },
  bair: { W: { lfH: 0.8, lfK: 1.5, lbH: 0.6, lbK: 1.5, lean: 0.2 }, S: { lbH: -1.75, lbK: 0.05, lfH: 0.6, lfK: 1.0, lean: 0.5, afS: 1.3, abS: 1.0, head: 0.1 } },
  airUp: { W: { ...KEY.tuck }, S: { spin: -Math.PI * 1.1, afS: 2.9, abS: 2.9, afE: 0.1, lfH: 0.3, lfK: 0.1, lbH: -0.3, lbK: 0.1, wpn: 0.1 } },
  airDown: { W: { lfH: 1.25, lfK: 1.7, lbH: 1.05, lbK: 1.7, afS: 2.6, abS: 2.6 }, S: { lfH: 0.05, lfK: 0, lbH: -0.05, lbK: 0, afS: 2.95, abS: 2.95, afE: 0.1, abE: 0.1, sq: 1.12, wpn: 2.6 } },
  ledgeAttack: { W: { ...KEY.climb }, S: { afS: 1.3, afE: 0.05, lean: 0.35, lfH: 0.7, lfK: 0.4, lbH: -0.5, wpn: 0.05 } },
  grab: { W: { lean: 0.05, afS: 0.8, abS: 0.7 }, S: { afS: 1.55, afE: 0.15, abS: 1.45, abE: 0.25, lean: 0.32, lfH: 0.55, lfK: 0.3, lbH: -0.4 } },
  // Specials by kind.
  leap: { W: { ...KEY.crouch, afS: 0.3, abS: 0.2 }, S: { afS: 3.1, afE: 0, abS: 3.1, abE: 0, sq: 1.22, lfH: 0.1, lfK: 0, lbH: -0.1, lbK: 0.25, lean: -0.05, head: -0.2, wpn: 0 } },
  dash: { W: { ...KEY.crouch, lean: 0.4, afS: -0.4, abS: -0.6 }, S: { lean: 0.6, afS: -0.7, afE: 0.3, abS: -0.95, abE: 0.3, lfH: 0.95, lfK: 0.7, lbH: -0.95, lbK: 0.35, head: 0.15 } },
  ring: { W: { afS: 3, abS: 3, afE: 0.3, abE: 0.3, sq: 1.1, lfH: 0.9, lfK: 1.2 }, S: { ...KEY.crouch, afS: 0.35, abS: 0.2, lfH: 0.95, lfK: 0.25, sq: 0.86, ry: 2 } },
  throw: { W: { afS: 3.6, afE: 0.65, lean: -0.22, lbH: -0.4, wpn: 1.4 }, S: { afS: 1.3, afE: 0.05, lean: 0.32, lfH: 0.65, lbH: -0.45, wpn: 0.1 } },
  cone: { W: { lean: -0.1, sq: 1.04 }, S: { lean: 0.28, sq: 0.97 } },
  summon: { W: { afS: 1.5, abS: 1.4, sq: 0.95 }, S: KEY.summon },
};
// Fighting styles: the same blow looks different on each fighter. A style
// replaces some of the poses above and picks the colour of the swoosh.
const HEADBUTT = { W: { lean: -0.35, head: -0.3, afS: 0.2, abS: -0.2, lbH: -0.4, sq: 1.04 }, S: { lean: 0.78, head: 0.4, afS: -0.7, afE: 0.3, abS: -0.9, abE: 0.3, lfH: 0.9, lfK: 0.4, lbH: -0.85, lbK: 0.1, sq: 0.93 } };
const KICK = { W: { lfH: 0.9, lfK: 1.7, lean: -0.1, afS: -0.4, abS: 0.7 }, S: { lfH: 1.8, lfK: 0.05, lean: -0.3, afS: -0.8, abS: 1.0, lbH: -0.15, lbK: 0.2 } };
const AIRKICK = { W: { lfH: 1.2, lfK: 1.8, lbH: 0.9, lbK: 1.6 }, S: { lfH: 1.65, lfK: 0, lbH: -0.6, lbK: 0.8, lean: -0.25, afS: 2.4, abS: 2.2 } };
const CLAW = { W: { afS: 3.0, afE: 0.4, abS: 2.6, abE: 0.5, lean: -0.18 }, S: { afS: 0.9, afE: 0.1, abS: 1.35, abE: 0.2, lean: 0.38, lfH: 0.6, lbH: -0.45 } };
const BELLY = { W: { lean: -0.38, sq: 1.06, afS: -0.4, abS: -0.5, lbH: -0.3 }, S: { lean: 0.32, sq: 0.86, rx: 7, afS: -0.7, abS: -0.7, lfH: 0.55, lfK: 0.3 } };
const PALM = { W: { afS: 0.4, afE: 1.9, abS: 0.3, abE: 1.6, lean: -0.1 }, S: { afS: 1.6, afE: 0.0, abS: 1.45, abE: 0.1, lean: 0.28, lfH: 0.5, lbH: -0.35 } };
const STYLE = {
  basajaun: { fx: 'club' },
  lamia: { fx: 'water' },
  tartalo: { fx: 'dust' },
  galtzagorri: { fx: 'needle' },
  gaueko: { fx: 'claw', atk: { light0: CLAW, light1: CLAW, light2: CLAW, ftilt: CLAW, fsmash: CLAW, fair: CLAW } },
  akerbeltz: { fx: 'horn', atk: { light2: HEADBUTT, ftilt: HEADBUTT, fsmash: HEADBUTT, bair: AIRKICK } },
  herensuge: { fx: 'fire' },
  olentzero: { fx: 'club' },
  aatxe: { fx: 'horn', atk: { light2: HEADBUTT, fsmash: HEADBUTT, fair: HEADBUTT } },
  ziripot: { fx: 'dust', atk: { light2: BELLY, fsmash: BELLY } },
  eate: { fx: 'spark', atk: { light0: PALM, light1: PALM, light2: PALM, ftilt: PALM, fsmash: PALM } },
  basandere: { fx: 'leaf', atk: { light2: KICK, ftilt: KICK, fsmash: KICK, fair: AIRKICK, air: AIRKICK } },
};
export const styleOf = (id) => STYLE[id] ?? { fx: 'club' };

const SUMMON = new Set(['stampede', 'swarm', 'wall', 'darkness', 'heal', 'stonerain', 'burst']);
const THROWN = new Set(['shot', 'boulder', 'stone', 'mark', 'blink']);

function moveKey(f) {
  const k = f.kind, mv = f.move;
  if (f.state === 'grab') return 'grab';
  if (f.state === 'attack') {
    const li = k.light.indexOf(mv);
    if (li >= 0) return `light${Math.min(2, li)}`;
    for (const key of ['ftilt', 'up', 'down', 'fsmash', 'usmash', 'dsmash', 'air', 'fair', 'bair', 'airUp', 'airDown', 'ledgeAttack']) if (k[key] === mv) return key;
    return 'light2';
  }
  if (mv.kind === 'leap' || mv.kind === 'dash' || mv.kind === 'ring' || mv.kind === 'cone') return mv.kind;
  if (THROWN.has(mv.kind)) return 'throw';
  return 'summon';
}

// The pose for a fighter this frame (t: animation time, stepped like a sprite sheet).
function poseOf(f, t, R) {
  const air = !f.grounded;
  const base = air ? mix(KEY.rise, KEY.fall, clamp01(((f.vy ?? 0) + 2) / 4)) : STAND;
  let p = base, X = { hurt: false, open: false, glow: 0, align: 0, walk: 0 };
  switch (f.state) {
    case 'idle': case 'respawn': {
      const b = Math.sin(t * 6 + f.i * 2);
      p = { ...STAND, sq: 1 + 0.03 * b, lfK: STAND.lfK + 0.12 * b, lbK: STAND.lbK + 0.1 * b, afS: STAND.afS + 0.08 * b, abS: STAND.abS + 0.06 * b, afE: STAND.afE - 0.1 * b, head: 0.04 * b };
      break;
    }
    case 'run': {
      // A run cycle: legs reach and fold, arms swing against them, the body bobs and leans.
      const ph = t * 15, s = Math.sin(ph), c = Math.cos(ph);
      p = pose({ lean: 0.38, head: -0.12, sq: 1 + 0.05 * Math.abs(s), ry: -Math.abs(c) * 3,
        lfH: 1.0 * s + 0.1, lfK: 0.3 + 1.5 * Math.max(0, c), lbH: -1.0 * s + 0.1, lbK: 0.3 + 1.5 * Math.max(0, -c),
        afS: 0.3 - 1.1 * s, afE: 1.5, abS: 0.0 + 1.1 * s, abE: 1.5, wpn: 2.0 });
      X.walk = s;
      break;
    }
    case 'air': p = base; X.walk = 0.5; break;
    case 'helpless': p = mix(KEY.spread, KEY.fall, 0.5 + 0.5 * Math.sin(t * 18)); X.open = true; break;
    case 'jumpsquat': p = mix(STAND, KEY.crouch, easeOut(Math.min(1, f.t / 3))); break;
    case 'landing': p = mix(KEY.crouch, STAND, easeIO(clamp01(f.t / Math.max(1, f.lag ?? 4)))); p.sq = Math.min(p.sq, 0.86 + 0.14 * clamp01(f.t / 4)); break;
    case 'shield': p = KEY.shield; break;
    case 'dizzy': p = { ...KEY.hurt, lean: Math.sin(t * 5) * 0.2, head: Math.sin(t * 5 + 1) * 0.3, afS: 0.2, abS: 0.1 }; X.hurt = true; X.open = true; break;
    case 'held': p = KEY.hurt; X.hurt = true; X.open = true; break;
    case 'holding': p = KEY.hold; break;
    case 'ledge': p = { ...KEY.hang, lfH: 0.2 + Math.sin(t * 3) * 0.1, lbH: -0.05 - Math.sin(t * 3) * 0.1 }; break;
    case 'climb': p = KEY.climb; break;
    case 'bow': p = mix(STAND, KEY.bow, easeIO(clamp01(f.t / 30))); break;
    case 'dodge':
      if (f.dodgeKind === 'roll' || f.dodgeKind === 'air') { p = { ...KEY.tuck, spin: (f.t / Math.max(1, R.dodge.frames)) * TAU * (f.dodgeKind === 'roll' ? -1 : 1) }; }
      else p = { ...STAND, lean: -0.25, sq: 0.95, rx: -3 };
      break;
    case 'hitstun': {
      X.hurt = true; X.open = true;
      const speed = Math.hypot(f.vx ?? 0, f.vy ?? 0);
      // Flinch on small blows; tumble head over heels when sent flying.
      p = air && speed > 3.5 ? { ...KEY.spread, spin: -t * 14 } : mix(KEY.hurt, STAND, clamp01(f.t / Math.max(1, f.hitstun)) * 0.3);
      if (f.t < 3) p = { ...p, sq: 0.9 };
      break;
    }
    case 'attack': case 'special': case 'super': case 'grab': {
      const mv = f.move;
      if (!mv) break;
      const key = moveKey(f), A = STYLE[f.kind.id]?.atk?.[key] ?? ATK[key] ?? ATK.light2;
      const W = { ...base, ...A.W }, Sx = { ...base, ...A.S };
      // Push the strike a little past its key pose: blows read bigger.
      for (const j of ['lean', 'afS', 'abS', 'lfH', 'lbH']) Sx[j] = base[j] + (Sx[j] - base[j]) * 1.18;
      const a = mv.startup, b = a + mv.active, e = b + mv.recovery;
      if (f.charge > 0 && f.state === 'attack' && f.t <= a) p = W;
      else if (f.t <= a) p = mix(base, W, easeOut(f.t / Math.max(1, a)));
      else if (f.t <= b) { p = mix(W, Sx, easeOut(Math.min(1, (f.t - a) / 2))); X.align = 1; X.open = true; }
      else p = mix(Sx, base, easeIO(clamp01((f.t - b) / Math.max(1, e - b))));
      if (moveKey(f) === 'dash' && f.t > a && f.t <= b) { const ph = t * 24; p = { ...p, lfH: 0.9 * Math.sin(ph), lfK: 0.4 + Math.max(0, Math.cos(ph)), lbH: -0.9 * Math.sin(ph), lbK: 0.4 + Math.max(0, -Math.cos(ph)) }; }
      if (f.state === 'super' || (f.state === 'special' && f.t <= a)) X.glow = f.state === 'super' ? 0.7 : clamp01(f.t / a) * 0.6;
      break;
    }
    case 'exhausted': p = KEY.crouch; X.hurt = true; break;
    default: break;
  }
  // Older hooks read these: knees bent = crouch; a bob; the walk.
  const crouch = clamp01(((p.lfK + p.lbK) / 2 - 0.12) / 1.4);
  return { ...p, ...X, crouch, bob: p.ry, vx: f.vx ?? 0, vy: f.vy ?? 0, sit: false, step: 0, armF: p.afS, armB: p.abS };
}

// The skeleton for people-shaped fighters. sp: proportions, colours and
// hooks for the parts that make each one who they are.
function person(g, f, t, P, sp) {
  const u = sp.u, L = sp.leg * u, T = sp.torso * u, Lt = L * 0.52, Ls = L * 0.5;
  // Where the feet end up for these leg angles; on the ground, the lower foot touches it.
  const legAt = (h, k, s) => {
    const hx = s * sp.hipW * u, kx = hx + Math.sin(h) * Lt, ky = Math.cos(h) * Lt;
    return { hx, kx, ky, fx: kx + Math.sin(h - k) * Ls, fy: ky + Math.cos(h - k) * Ls };
  };
  const lf = legAt(P.lfH, P.lfK, 1), lb = legAt(P.lbH, P.lbK, -1);
  const reach = Math.max(lf.fy, lb.fy);
  const hipY = (f.grounded !== false && f.state !== 'ledge' && f.state !== 'hitstun' && f.state !== 'helpless' ? -reach : -L * 0.95) + (P.ry ?? 0) * u;
  g.save();
  g.translate((P.rx ?? 0) * u, 0);
  // Squash and stretch from the feet.
  const sq = P.sq ?? 1;
  g.scale(1 + (1 - sq) * 0.7, sq);
  const footAt = (leg) => ({ x: leg.fx, y: hipY + leg.fy });
  const drawLeg = (leg, col, front) => {
    const knee = { x: leg.kx, y: hipY + leg.ky }, foot = footAt(leg);
    taper(g, leg.hx, hipY, knee.x, knee.y, sp.legW * u * 1.25, sp.legW * u * 0.95, col);
    taper(g, knee.x, knee.y, foot.x, foot.y - sp.foot * u * 0.35, sp.legW * u * 0.95, sp.legW * u * 0.72, col);
    dot(g, knee.x, knee.y, sp.legW * u * 0.5, col);
    (sp.foot_ ?? footBoot)(g, foot.x, foot.y, u, sp, front);
  };
  // Everything above the hips leans and bends together.
  const upper = (fn) => { g.save(); g.translate(0, hipY); g.rotate(P.lean); fn(); g.restore(); };
  const shY = -T + 4 * u;
  const drawArm = (S, E, front) => {
    const sx = sp.shX * u - (front ? 0 : sp.shW * u), Lu = sp.arm * u * 0.52, Lf = sp.arm * u * 0.5;
    const ex = sx + Math.sin(S) * Lu, ey = shY + Math.cos(S) * Lu;
    const hx = ex + Math.sin(S + E) * Lf, hy = ey + Math.cos(S + E) * Lf;
    const col = front ? sp.armCol : shade(sp.armCol, -0.22);
    taper(g, sx, shY, ex, ey, sp.armW * u * 1.25, sp.armW * u * 0.9, col);
    taper(g, ex, ey, hx, hy, sp.armW * u * 0.9, sp.armW * u * 0.7, col);
    if (front && sp.weapon) drawWeapon(g, sp.weapon, hx, hy, S + E + (P.wpn ?? 1.6), P, u, f, t);
    if (sp.hand) sp.hand(g, hx, hy, u, front);
    else oval(g, hx, hy, sp.handR * u, sp.handR * u, front ? sp.handCol : shade(sp.handCol, -0.15));
  };
  if (sp.behind) upper(() => sp.behind(g, u, P, T, t, f));
  upper(() => drawArm(P.abS, P.abE, false));
  if (sp.legs) sp.legs(g, u, P, hipY, t);
  else { drawLeg(lb, shade(sp.legCol, -0.2), false); drawLeg(lf, sp.legCol, true); }
  upper(() => {
    sp.body(g, u, P, T, t, f);
    g.save(); g.translate(sp.headX * u, -T - sp.headR * u * 0.82); g.rotate(P.head ?? 0); sp.head(g, u, P, t, f); g.restore();
    drawArm(P.afS, P.afE, true);
  });
  g.restore();
}

// A held weapon, pointing along angle b (same convention as the limbs).
function drawWeapon(g, draw, hx, hy, b, P, u, f, t) {
  g.save(); g.translate(hx, hy); g.rotate(Math.atan2(Math.cos(b), Math.sin(b)));
  draw(g, u, P, f, t);
  g.restore();
}

function footBoot(g, x, y, u, sp) { oval(g, x + 3 * u, y - sp.foot * u * 0.45, sp.foot * u, sp.foot * u * 0.55, sp.bootCol); }

const SPEC = {
  basajaun: {
    h: 128, leg: 26, legW: 11, hipW: 6, foot: 7.5, legCol: '#5e4630', bootCol: '#b98a5e', torso: 32, shX: 2, shW: 9, arm: 26, armW: 10, armCol: '#6e5236', handR: 6.5, handCol: '#c99a6e', headX: 4, headR: 24,
    foot_(g, x, y, u) { oval(g, x + 4 * u, y - 3 * u, 9 * u, 4.5 * u, '#c99a6e'); for (let k = 0; k < 3; k++) dot(g, x + 9 * u + k * 2.2 * u, y - 5.5 * u + k * 0.6 * u, 1.3 * u, '#8a6040'); },
    behind(g, u, P, T, t) {
      // Long hair down his back to the knees.
      const sw = Math.sin(t * 2) * 2 * u;
      g.beginPath(); g.moveTo(-6 * u, -T - 30 * u); g.quadraticCurveTo(-26 * u + sw, -T, -20 * u + sw, 12 * u); ragged(g, -20 * u + sw, 12 * u, 2 * u, 2 * u, 5, 4 * u, 1); g.lineTo(4 * u, -T - 20 * u); g.closePath();
      g.fillStyle = '#5a422c'; g.fill(); stroke(g, 2.6);
    },
    body(g, u, P, T) {
      cel(g, () => { g.beginPath(); g.moveTo(-15 * u, -T); g.quadraticCurveTo(0, -T - 6 * u, 15 * u, -T); g.lineTo(18 * u, 4 * u); ragged(g, 18 * u, 4 * u, -18 * u, 4 * u, 7, 5 * u, 2); g.closePath(); }, '#6e5236', '#4e3a26', 2.8);
      g.strokeStyle = 'rgba(34,24,14,0.5)'; g.lineWidth = 1.6;
      for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(-12 * u + k * 5 * u, -T + 8 * u); g.quadraticCurveTo(-10 * u + k * 5 * u, -T / 2, -13 * u + k * 5.2 * u, -4 * u); g.stroke(); }
    },
    head(g, u, P) {
      // A great mane, a face peering out, a huge beard.
      cel(g, () => { g.beginPath(); for (let n = 0; n <= 20; n++) { const a = (n / 20) * TAU, r = (n % 2 ? 22 : 26) * u; g.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.95); } g.closePath(); }, '#6e5236', '#4e3a26', 2.8);
      oval(g, 9 * u, 1 * u, 12 * u, 13 * u, '#c99a6e', '#a87a52');
      g.beginPath(); g.moveTo(-2 * u, -8 * u); g.quadraticCurveTo(10 * u, -18 * u, 22 * u, -6 * u); g.lineTo(18 * u, -9 * u); g.quadraticCurveTo(9 * u, -12 * u, -2 * u, -4 * u); g.closePath(); g.fillStyle = '#5e4630'; g.fill(); stroke(g, 2);
      eyes(g, 8 * u, -1 * u, u, 8 * u, { hurt: P.hurt, size: 1.1 });
      oval(g, 19 * u, 4 * u, 4 * u, 3.4 * u, '#b98a5e', '#9a6e48', 1.8);
      // The beard, down over his chest.
      g.beginPath(); g.moveTo(-2 * u, 6 * u); g.quadraticCurveTo(10 * u, 12 * u, 22 * u, 6 * u); g.lineTo(18 * u, 26 * u); ragged(g, 18 * u, 26 * u, 2 * u, 30 * u, 4, 3.5 * u, 3); g.closePath();
      g.fillStyle = '#7d5f40'; g.fill(); stroke(g, 2.4);
      if (P.open) { g.beginPath(); g.ellipse(13 * u, 10 * u, 3 * u, 2.4 * u, 0, 0, TAU); g.fillStyle = '#3a1a10'; g.fill(); }
    },
    weapon(g, u) {
      // The oak club: a knobbly tapered log with a sprig of leaves.
      cel(g, () => { g.beginPath(); g.moveTo(-4 * u, -3.5 * u); g.lineTo(40 * u, -7 * u); g.quadraticCurveTo(50 * u, 0, 40 * u, 7 * u); g.lineTo(-4 * u, 3.5 * u); g.closePath(); }, '#8a6038', '#5e3e22', 2.6);
      for (const [x, y] of [[18, -2], [30, 3], [38, -3]]) oval(g, x * u, y * u, 2.6 * u, 2 * u, '#6b4a2a', '#4a3018', 1.4);
      g.beginPath(); g.moveTo(24 * u, -6 * u); g.quadraticCurveTo(28 * u, -16 * u, 34 * u, -14 * u); g.quadraticCurveTo(30 * u, -8 * u, 24 * u, -6 * u); g.fillStyle = '#6a8a3a'; g.fill(); stroke(g, 1.6);
    },
  },

  lamia: {
    h: 96, leg: 30, torso: 28, shX: 2, shW: 7, arm: 22, armW: 6.5, armCol: '#f3d6c0', handR: 4.2, handCol: '#f3d6c0', headX: 2, headR: 21,
    legs(g, u, P, hipY, t) {
      // A long river-green dress to the ground, swaying; webbed duck feet in front.
      const sway = (P.walk ? P.walk : Math.sin(t * 2) * 0.4) * 4 * u;
      for (const s of [-1, 1]) {
        const fx = 6 * u + s * P.walk * 5 * u;
        g.beginPath(); g.moveTo(fx - 2 * u, -2 * u); g.lineTo(fx + 12 * u, -4 * u); g.lineTo(fx + 13 * u, 0); g.lineTo(fx - 2 * u, 1 * u); g.closePath();
        g.fillStyle = s < 0 ? '#c88010' : '#f0a020'; g.fill(); stroke(g, 2);
        g.beginPath(); g.moveTo(fx + 4 * u, -3 * u); g.lineTo(fx + 6 * u, 0); g.moveTo(fx + 8 * u, -3.5 * u); g.lineTo(fx + 10 * u, 0); stroke(g, 1.2);
      }
      cel(g, () => { g.beginPath(); g.moveTo(-9 * u, hipY); g.lineTo(9 * u, hipY); g.quadraticCurveTo(14 * u + sway, -18 * u, 17 * u + sway, -4 * u); for (let k = 0; k < 5; k++) g.quadraticCurveTo(17 * u + sway - (k + 0.5) * 7.6 * u, 1 * u, 17 * u + sway - (k + 1) * 7.6 * u, -4 * u); g.quadraticCurveTo(-16 * u, -18 * u, -9 * u, hipY); g.closePath(); }, '#2f8f9d', '#22707b', 2.6);
      g.strokeStyle = 'rgba(220,250,255,0.4)'; g.lineWidth = 1.6;
      for (const yy of [-16, -9]) { g.beginPath(); g.moveTo(-12 * u, yy * u); g.quadraticCurveTo(0, (yy + 3) * u, 13 * u + sway, yy * u); g.stroke(); }
    },
    behind(g, u, P, T, t) {
      // Long golden hair falling behind her to below the waist.
      const w2 = Math.sin(t * 3) * 3 * u + (P.walk ? -6 * u : 0);
      cel(g, () => { g.beginPath(); g.moveTo(-4 * u, -T - 36 * u); g.quadraticCurveTo(-26 * u, -T - 10 * u, -20 * u + w2, 6 * u); g.quadraticCurveTo(-12 * u + w2, 10 * u, -6 * u + w2, 2 * u); g.quadraticCurveTo(-4 * u, -T, 6 * u, -T - 10 * u); g.closePath(); }, '#f2c75a', '#c99a2a', 2.6);
      g.strokeStyle = 'rgba(150,100,20,0.5)'; g.lineWidth = 1.5;
      for (const k of [0, 1]) { g.beginPath(); g.moveTo(-8 * u - k * 5 * u, -T - 20 * u); g.quadraticCurveTo(-18 * u - k * 4 * u, -T / 2, -14 * u + w2 - k * 3 * u, 0); g.stroke(); }
    },
    body(g, u, P, T) {
      cel(g, () => { g.beginPath(); g.moveTo(-9 * u, 0); g.quadraticCurveTo(-11 * u, -T * 0.6, -8 * u, -T); g.quadraticCurveTo(0, -T - 3 * u, 9 * u, -T); g.quadraticCurveTo(11 * u, -T * 0.6, 9 * u, 0); g.closePath(); }, '#38a3b2', '#2a808c', 2.4);
      g.beginPath(); g.moveTo(-9 * u, -6 * u); g.lineTo(9 * u, -6 * u); stroke(g, 3.4 * u, '#e0b84a');
    },
    head(g, u, P, t, f) {
      cel(g, () => ell(0, 0, 20 * u, 21 * u)(g), '#f2c75a', '#c99a2a', 2.6);
      oval(g, 7 * u, 3 * u, 12 * u, 14 * u, '#f3d6c0', '#dcb69a', 2.2);
      // A fringe of golden hair.
      g.beginPath(); g.moveTo(-6 * u, -14 * u); g.quadraticCurveTo(10 * u, -24 * u, 21 * u, -6 * u); g.quadraticCurveTo(14 * u, -10 * u, 10 * u, -4 * u); g.quadraticCurveTo(6 * u, -10 * u, -2 * u, -6 * u); g.closePath();
      g.fillStyle = '#f2c75a'; g.fill(); stroke(g, 2);
      eyes(g, 7 * u, 2 * u, u, 8 * u, { hurt: P.hurt, size: 1.15 });
      if (!P.hurt) { g.beginPath(); g.moveTo(5 * u, -1.5 * u); g.lineTo(7 * u, -3 * u); g.moveTo(13 * u, -1.5 * u); g.lineTo(15 * u, -3 * u); stroke(g, 1.2); }
      g.beginPath(); g.arc(12 * u, 9 * u, 2.6 * u, 0.1, Math.PI - 0.1); stroke(g, 1.4);
      // The golden comb in her hair while her special is ready.
      if ((f.cooldown?.[f.kind.specials.neutral.id] ?? 0) <= 0) { g.beginPath(); g.roundRect(-14 * u, -16 * u, 12 * u, 5 * u, 1.5 * u); g.fillStyle = '#ffd65a'; g.fill(); stroke(g, 1.6); }
    },
  },

  tartalo: {
    h: 140, leg: 30, legW: 13, hipW: 7, foot: 8, legCol: '#5a4a3a', bootCol: '#6a4a2a', torso: 38, shX: 3, shW: 11, arm: 31, armW: 12.5, armCol: '#c9a27a', handR: 8, handCol: '#c9a27a', headX: 4, headR: 18,
    body(g, u, P, T) {
      // A brown tunic over a big belly, a woolly sheepskin over the shoulders.
      cel(g, () => { g.beginPath(); g.moveTo(-17 * u, 2 * u); g.quadraticCurveTo(-22 * u, -T * 0.5, -16 * u, -T); g.lineTo(15 * u, -T); g.quadraticCurveTo(28 * u, -T * 0.4, 18 * u, 2 * u); g.closePath(); }, '#8a5a34', '#64401f', 2.8);
      g.beginPath(); g.moveTo(-15 * u, -6 * u); g.lineTo(18 * u, -6 * u); stroke(g, 4 * u, '#3a2a1a');
      cel(g, () => { g.beginPath(); g.moveTo(-17 * u, -T + 12 * u); for (let n = 0; n <= 10; n++) { const x = -17 * u + n * 3.6 * u; g.lineTo(x, -T + (n % 2 ? 16 : 11) * u); } g.lineTo(19 * u, -T + 4 * u); g.quadraticCurveTo(0, -T - 8 * u, -17 * u, -T + 2 * u); g.closePath(); }, '#e2d6b8', '#bfb294', 2.4);
    },
    head(g, u, P) {
      // A great bald head with one eye in the middle of the brow.
      g.scale(0.74, 0.74);
      oval(g, -14 * u, 2 * u, 5 * u, 7 * u, '#c9a27a', '#a8825a');
      cel(g, () => ell(0, 0, 24 * u, 25 * u)(g), '#c9a27a', '#a8825a', 2.8);
      oval(g, 9 * u, -4 * u, 9 * u, 8 * u, '#fbf6ea', '#e0d8c4', 2.2);
      if (P.hurt) { g.beginPath(); g.moveTo(2 * u, -4 * u); g.quadraticCurveTo(9 * u, 0, 16 * u, -4 * u); stroke(g, 2.2); }
      else { dot(g, 11 * u, -4 * u, 4.5 * u, '#7a4a20'); dot(g, 11.5 * u, -4 * u, 2.4 * u); dot(g, 12.5 * u, -5.5 * u, 1 * u, '#fff'); }
      g.beginPath(); g.moveTo(-1 * u, -14 * u); g.quadraticCurveTo(9 * u, -19 * u, 20 * u, -12 * u); stroke(g, 4 * u, '#4a3220');
      oval(g, 21 * u, 4 * u, 5 * u, 5 * u, '#b98e64', '#9a7048', 2);
      g.beginPath(); g.moveTo(6 * u, 13 * u); g.quadraticCurveTo(14 * u, P.open ? 20 * u : 16 * u, 20 * u, 12 * u); stroke(g, 2.2);
    },
    hand(g, x, y, u, front) {
      oval(g, x, y, 7.5 * u, 7 * u, front ? '#c9a27a' : '#b08a62', '#a8825a');
      if (front) { g.beginPath(); g.ellipse(x + 3 * u, y + 2 * u, 3 * u, 2 * u, 0.4, 0, TAU); stroke(g, 2.2, '#e0b84a'); } // the talking ring
    },
  },

  galtzagorri: {
    h: 64, leg: 24, legW: 8, hipW: 4, foot: 5, legCol: '#c0392b', bootCol: '#2a2420', torso: 22, shX: 1, shW: 6, arm: 18, armW: 5.5, armCol: '#e8b890', handR: 4, handCol: '#e8b890', headX: 2, headR: 23,
    foot_(g, x, y, u) { g.beginPath(); g.moveTo(x - 4 * u, y - 4 * u); g.quadraticCurveTo(x + 6 * u, y - 6 * u, x + 10 * u, y - 9 * u); g.quadraticCurveTo(x + 9 * u, y, x - 4 * u, y); g.closePath(); g.fillStyle = '#2a2420'; g.fill(); stroke(g, 1.8); },
    body(g, u, P, T) {
      // The red trousers up to his chest, braces over a cream shirt.
      cel(g, () => { g.beginPath(); g.roundRect(-10 * u, -T, 20 * u, T + 2 * u, 7 * u); }, '#e8dcc0', '#c4b89c', 2.4);
      cel(g, () => { g.beginPath(); g.moveTo(-11 * u, 2 * u); g.lineTo(-10 * u, -T * 0.45); g.lineTo(10 * u, -T * 0.45); g.lineTo(11 * u, 2 * u); g.closePath(); }, '#c0392b', '#8e2a20', 2.4);
      for (const x of [-5, 5]) { g.beginPath(); g.moveTo(x * u, -T * 0.45); g.lineTo(x * u * 0.8, -T + 1 * u); stroke(g, 2.6 * u, '#8e2a20'); }
    },
    head(g, u, P, t) {
      // A big round head, a pointed ear, a floppy red cap with a tassel, a grin.
      g.beginPath(); g.moveTo(-14 * u, -2 * u); g.lineTo(-30 * u, -12 * u); g.lineTo(-16 * u, 6 * u); g.closePath(); g.fillStyle = '#e8b890'; g.fill(); stroke(g, 2);
      cel(g, () => ell(0, 2 * u, 19 * u, 18 * u)(g), '#e8b890', '#c99a70', 2.6);
      const flop = Math.sin(t * 4) * 2 * u;
      cel(g, () => { g.beginPath(); g.moveTo(-19 * u, -4 * u); g.quadraticCurveTo(-4 * u, -28 * u, 18 * u, -6 * u); g.quadraticCurveTo(-6 * u, -18 * u, -22 * u + flop, -30 * u); g.quadraticCurveTo(-24 * u, -14 * u, -19 * u, -4 * u); g.closePath(); }, '#c0392b', '#8e2a20', 2.4);
      oval(g, -22 * u + flop, -31 * u, 3.6 * u, 3.6 * u, '#f2d06b', '#c8a040', 1.8);
      eyes(g, 5 * u, 1 * u, u, 9 * u, { hurt: P.hurt, size: 1.25 });
      g.beginPath(); g.moveTo(1 * u, -6 * u); g.lineTo(8 * u, -4 * u); g.moveTo(11 * u, -4 * u); g.lineTo(17 * u, -7 * u); stroke(g, 1.8);
      g.beginPath(); g.moveTo(3 * u, 9 * u); g.quadraticCurveTo(10 * u, 15 * u, 17 * u, 7 * u); g.lineTo(3 * u, 9 * u); g.fillStyle = P.open ? '#5a1a10' : '#fbf6ea'; g.fill(); stroke(g, 1.6);
      oval(g, 18 * u, 3 * u, 3 * u, 3 * u, '#d99a7a', '#c08060', 1.4);
    },
    weapon(g, u) {
      // A big sewing needle, his only tool.
      g.beginPath(); g.moveTo(-2 * u, -1.6 * u); g.lineTo(26 * u, 0); g.lineTo(-2 * u, 1.6 * u); g.closePath(); g.fillStyle = '#d8dde2'; g.fill(); stroke(g, 1.6);
      g.beginPath(); g.ellipse(1 * u, 0, 2 * u, 1 * u, 0, 0, TAU); g.fillStyle = INK; g.fill();
    },
  },

  gaueko: {
    h: 110, leg: 30, torso: 34, shX: 2, shW: 9, arm: 25, armW: 9, armCol: '#47417a', handR: 5, handCol: '#b8c4dc', headX: 4, headR: 22,
    legs(g, u, P, hipY, t) {
      // No feet: a cloak that frays into night wind just above the ground.
      cel(g, () => { g.beginPath(); g.moveTo(-12 * u, hipY); g.lineTo(12 * u, hipY); g.quadraticCurveTo(16 * u, hipY * 0.4, 14 * u, -8 * u); for (let k = 0; k < 5; k++) { const x = 14 * u - (k + 0.5) * 6.4 * u, w = Math.sin(t * 6 + k) * 3 * u; g.lineTo(x + w, (k % 2 ? -14 : -4) * u + w * 0.5); } g.lineTo(-18 * u, -6 * u); g.quadraticCurveTo(-16 * u, hipY * 0.5, -12 * u, hipY); g.closePath(); }, '#3a3568', '#252146', 2.4);
      for (let k = 0; k < 3; k++) { const q = (t * 0.8 + k / 3) % 1; g.strokeStyle = `rgba(160,190,255,${0.4 * (1 - q)})`; g.lineWidth = 2; g.beginPath(); g.arc(-16 * u - q * 20 * u, -6 * u - k * 6 * u, 6 * u, -1.2, 1.2); g.stroke(); }
    },
    body(g, u, P, T) {
      cel(g, () => { g.beginPath(); g.moveTo(-13 * u, 0); g.quadraticCurveTo(-16 * u, -T * 0.6, -11 * u, -T); g.quadraticCurveTo(0, -T - 6 * u, 11 * u, -T); g.quadraticCurveTo(16 * u, -T * 0.6, 13 * u, 0); g.closePath(); }, '#3a3568', '#252146', 2.6);
      g.strokeStyle = 'rgba(140,150,230,0.35)'; g.lineWidth = 1.6;
      for (const x of [-5, 2]) { g.beginPath(); g.moveTo(x * u, -T + 6 * u); g.quadraticCurveTo((x + 3) * u, -T / 2, x * u, -4 * u); g.stroke(); }
    },
    head(g, u, P, t) {
      // A deep hood with nothing in it but two pale eyes.
      cel(g, () => { g.beginPath(); g.moveTo(-20 * u, 16 * u); g.quadraticCurveTo(-24 * u, -18 * u, 2 * u, -24 * u); g.quadraticCurveTo(26 * u, -16 * u, 22 * u, 14 * u); g.closePath(); }, '#433d78', '#252146', 2.6);
      g.beginPath(); g.ellipse(8 * u, 2 * u, 12 * u, 14 * u, 0, 0, TAU); g.fillStyle = '#07060f'; g.fill(); stroke(g, 2);
      const glow = 0.8 + 0.2 * Math.sin(t * 5);
      for (const ex of [4, 13]) {
        g.fillStyle = `rgba(159,216,255,${0.25 * glow})`; g.beginPath(); g.arc(ex * u, 0, 5 * u, 0, TAU); g.fill();
        g.fillStyle = '#bfe8ff'; g.beginPath(); g.ellipse(ex * u, 0, 2.6 * u, P.hurt ? 0.8 * u : 1.9 * u, 0, 0, TAU); g.fill();
      }
    },
    hand(g, x, y, u, front) {
      // Long pale fingers.
      const c = front ? '#b8c4dc' : '#8a96b4';
      for (let k = -1; k <= 1; k++) limb(g, x + 2 * u, y + k * 2 * u, x + 8 * u, y + k * 3 * u + 2 * u, 2.2 * u, c, 1.2);
      oval(g, x, y, 4.4 * u, 4 * u, c, '#7a86a4', 1.8);
    },
  },

  akerbeltz: {
    h: 108, leg: 30, legW: 9, hipW: 5, foot: 5, legCol: '#463f37', bootCol: '#5a5048', torso: 30, shX: 2, shW: 8, arm: 22, armW: 8, armCol: '#4c443b', handR: 5, handCol: '#5a5048', headX: 8, headR: 18,
    foot_(g, x, y, u) { for (const d of [0, 4]) { g.beginPath(); g.moveTo(x + d * u - 1 * u, y - 5 * u); g.lineTo(x + d * u + 4 * u, y - 5 * u); g.lineTo(x + d * u + 4.5 * u, y); g.lineTo(x + d * u - 1.5 * u, y); g.closePath(); g.fillStyle = '#5a5048'; g.fill(); stroke(g, 1.6); } },
    body(g, u, P, T) {
      // A black shaggy goat standing tall, a leather collar and a brass bell.
      cel(g, () => { g.beginPath(); g.moveTo(-14 * u, 4 * u); g.quadraticCurveTo(-18 * u, -T * 0.5, -12 * u, -T); g.lineTo(12 * u, -T); g.quadraticCurveTo(17 * u, -T * 0.5, 13 * u, 4 * u); ragged(g, 13 * u, 4 * u, -14 * u, 4 * u, 6, 3.5 * u, 4); g.closePath(); }, '#4c443b', '#2b2621', 2.6);
      g.strokeStyle = 'rgba(120,110,100,0.35)'; g.lineWidth = 1.6;
      for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(-10 * u + k * 5 * u, -T + 8 * u); g.lineTo(-11 * u + k * 5 * u, -6 * u); g.stroke(); }
      g.beginPath(); g.moveTo(-10 * u, -T + 4 * u); g.quadraticCurveTo(2 * u, -T + 8 * u, 12 * u, -T + 3 * u); stroke(g, 3.4 * u, '#7a4a2a');
      oval(g, 6 * u, -T + 11 * u, 4 * u, 4.4 * u, '#d8a840', '#a87a20', 1.8);
    },
    head(g, u, P) {
      // A goat's head in profile: horns sweeping back, a long snout, a beard.
      for (const [dx, col] of [[-3, '#b8a888'], [0, '#d9c9a8']]) {
        g.beginPath(); g.moveTo((-2 + dx) * u, -12 * u); g.bezierCurveTo((-14 + dx) * u, -30 * u, (-34 + dx) * u, -22 * u, (-30 + dx) * u, -4 * u); g.bezierCurveTo((-30 + dx) * u, -16 * u, (-16 + dx) * u, -20 * u, (6 + dx) * u, -8 * u); g.closePath();
        g.fillStyle = col; g.fill(); stroke(g, 2.2);
      }
      g.strokeStyle = 'rgba(80,60,40,0.5)'; g.lineWidth = 1.2;
      for (let k = 0; k < 4; k++) { g.beginPath(); g.arc((-12 - k * 4) * u, -16 * u + k * 1.5 * u, 4 * u, 0.5, 2.2); g.stroke(); }
      cel(g, () => ell(0, 0, 15 * u, 14 * u)(g), '#4c443b', '#2b2621', 2.6);
      cel(g, () => { g.beginPath(); g.moveTo(4 * u, -8 * u); g.quadraticCurveTo(26 * u, -4 * u, 26 * u, 6 * u); g.quadraticCurveTo(22 * u, 12 * u, 6 * u, 10 * u); g.closePath(); }, '#4c443b', '#2b2621', 2.4);
      dot(g, 23 * u, 3 * u, 1.3 * u, '#5a5048');
      g.beginPath(); g.moveTo(-8 * u, -4 * u); g.quadraticCurveTo(-20 * u, 0, -16 * u, 8 * u); g.quadraticCurveTo(-10 * u, 4 * u, -6 * u, 2 * u); g.closePath(); g.fillStyle = '#332d28'; g.fill(); stroke(g, 2);
      // A yellow eye with a sideways pupil.
      if (P.hurt) { g.beginPath(); g.moveTo(5 * u, -4 * u); g.lineTo(11 * u, -2 * u); stroke(g, 2, '#e8c84a'); }
      else { oval(g, 8 * u, -3 * u, 3.6 * u, 3 * u, '#e8c84a', '#c0a030', 1.6); g.fillStyle = INK; g.fillRect(6 * u, -3.8 * u, 4.4 * u, 1.6 * u); }
      g.beginPath(); g.moveTo(10 * u, 9 * u); g.quadraticCurveTo(12 * u, 22 * u, 6 * u, 24 * u); g.quadraticCurveTo(6 * u, 16 * u, 4 * u, 10 * u); g.closePath(); g.fillStyle = '#d9c9a8'; g.fill(); stroke(g, 1.8);
    },
  },

  olentzero: {
    h: 120, leg: 26, legW: 11, hipW: 6, foot: 7.5, legCol: '#3a3a40', bootCol: '#7a5a3a', torso: 32, shX: 3, shW: 10, arm: 24, armW: 10, armCol: '#5a4a3a', handR: 6.5, handCol: '#f0c8a0', headX: 5, headR: 23,
    foot_(g, x, y, u) {
      // Abarkak: leather shoes with laces up the leg.
      oval(g, x + 3 * u, y - 3.4 * u, 8.6 * u, 4 * u, '#7a5a3a', '#5a4026', 2.2);
      for (const yy of [6, 10]) { g.beginPath(); g.moveTo(x - 4 * u, y - yy * u); g.lineTo(x + 4 * u, y - (yy + 1) * u); stroke(g, 1.4, '#d8cfb8'); }
    },
    body(g, u, P, T) {
      // A round belly in a dark jacket, a red sash, a white shirt at the neck.
      cel(g, () => { g.beginPath(); g.moveTo(-14 * u, 2 * u); g.quadraticCurveTo(-18 * u, -T * 0.5, -12 * u, -T); g.lineTo(12 * u, -T); g.quadraticCurveTo(26 * u, -T * 0.45, 16 * u, 2 * u); g.closePath(); }, '#5a4a3a', '#3e3226', 2.8);
      g.beginPath(); g.moveTo(-15 * u, -8 * u); g.quadraticCurveTo(2 * u, -4 * u, 19 * u, -9 * u); stroke(g, 6 * u, INK);
      g.beginPath(); g.moveTo(-15 * u, -8 * u); g.quadraticCurveTo(2 * u, -4 * u, 19 * u, -9 * u); stroke(g, 4.4 * u, '#c9302c');
      g.beginPath(); g.moveTo(-6 * u, -T); g.lineTo(4 * u, -T + 8 * u); g.lineTo(10 * u, -T); g.closePath(); g.fillStyle = '#ece4d2'; g.fill(); stroke(g, 1.8);
    },
    head(g, u, P) {
      // A round jolly face, rosy cheeks, a dark beard and a black txapela.
      cel(g, () => ell(0, 2 * u, 20 * u, 20 * u)(g), '#f0c8a0', '#d4a47a', 2.6);
      g.beginPath(); g.moveTo(-16 * u, 4 * u); g.quadraticCurveTo(-12 * u, 26 * u, 6 * u, 26 * u); g.quadraticCurveTo(22 * u, 24 * u, 21 * u, 8 * u); g.quadraticCurveTo(14 * u, 14 * u, 8 * u, 12 * u); g.quadraticCurveTo(-4 * u, 14 * u, -16 * u, 4 * u); g.closePath();
      g.fillStyle = '#4a4440'; g.fill(); stroke(g, 2.2);
      oval(g, 17 * u, 3 * u, 4.4 * u, 4 * u, '#e8a88a', '#d08868', 1.8);
      oval(g, 6 * u, 6 * u, 4 * u, 3 * u, '#e8908a', '#d07070', 0);
      eyes(g, 7 * u, -2 * u, u, 8 * u, { hurt: P.hurt, size: 1.05 });
      g.beginPath(); g.moveTo(4 * u, -7 * u); g.lineTo(9 * u, -8 * u); g.moveTo(13 * u, -8 * u); g.lineTo(18 * u, -7 * u); stroke(g, 2.4, '#6a625a');
      g.beginPath(); g.moveTo(8 * u, 14 * u); g.quadraticCurveTo(13 * u, P.open ? 20 * u : 17 * u, 18 * u, 13 * u); stroke(g, 1.8);
      cel(g, () => ell(2 * u, -14 * u, 24 * u, 8 * u, -0.08)(g), '#26262c', '#141418', 2.6);
      g.beginPath(); g.moveTo(4 * u, -21 * u); g.lineTo(5 * u, -25 * u); stroke(g, 2);
    },
    weapon(g, u) {
      // His sack of charcoal, swung by its neck.
      g.beginPath(); g.moveTo(-2 * u, 0); g.lineTo(8 * u, 0); stroke(g, 3 * u, '#8a7a62');
      cel(g, () => { g.beginPath(); g.moveTo(6 * u, -4 * u); g.quadraticCurveTo(14 * u, -16 * u, 28 * u, -13 * u); g.quadraticCurveTo(38 * u, -4 * u, 30 * u, 10 * u); g.quadraticCurveTo(16 * u, 16 * u, 6 * u, 4 * u); g.closePath(); }, '#9a8a6e', '#6e624c', 2.4);
      for (const [x, y] of [[18, -12], [24, -13]]) oval(g, x * u, y * u, 3 * u, 2.4 * u, '#2a2420', '#141210', 1.4);
      g.strokeStyle = 'rgba(60,50,36,0.5)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(14 * u, 0); g.lineTo(26 * u, 2 * u); g.stroke();
    },
  },
  aatxe: {
    h: 122, leg: 30, legW: 12, hipW: 6, foot: 6, legCol: '#8a3220', bootCol: '#3a2a22', torso: 34, shX: 3, shW: 10, arm: 26, armW: 11, armCol: '#a8402a', handR: 6.5, handCol: '#3a2a22', headX: 9, headR: 20,
    foot_(g, x, y, u) { for (const d of [0, 5]) { g.beginPath(); g.moveTo(x + d * u - 1.5 * u, y - 6 * u); g.lineTo(x + d * u + 4.5 * u, y - 6 * u); g.lineTo(x + d * u + 5 * u, y); g.lineTo(x + d * u - 2 * u, y); g.closePath(); g.fillStyle = '#3a2a22'; g.fill(); stroke(g, 1.8); } },
    behind(g, u, P, T, t) {
      // A tail with a dark tuft, swishing.
      const sw = Math.sin(t * 4) * 4 * u - (P.vx ?? 0) * 2 * u;
      g.beginPath(); g.moveTo(-12 * u, -6 * u); g.quadraticCurveTo(-24 * u, 4 * u + sw * 0.3, -22 * u + sw, 16 * u); stroke(g, 5 * u); g.beginPath(); g.moveTo(-12 * u, -6 * u); g.quadraticCurveTo(-24 * u, 4 * u + sw * 0.3, -22 * u + sw, 16 * u); stroke(g, 3 * u, '#8a3220');
      oval(g, -22 * u + sw, 18 * u, 4 * u, 5 * u, '#2a1a14', '#140c08', 1.6);
    },
    body(g, u, P, T) {
      // A big red bull standing tall: a deep chest, a dark mane over the shoulders.
      cel(g, () => { g.beginPath(); g.moveTo(-14 * u, 2 * u); g.quadraticCurveTo(-19 * u, -T * 0.5, -14 * u, -T); g.quadraticCurveTo(2 * u, -T - 6 * u, 15 * u, -T); g.quadraticCurveTo(21 * u, -T * 0.45, 13 * u, 2 * u); g.closePath(); }, '#a8402a', '#7a2a1a', 2.8);
      cel(g, () => ell(6 * u, -T * 0.55, 8 * u, 12 * u)(g), '#c86a4a', '#a8503a', 1.6);
      g.beginPath(); g.moveTo(-15 * u, -T + 2 * u); ragged(g, -15 * u, -T + 12 * u, 12 * u, -T + 6 * u, 6, 3 * u, 5); g.lineTo(14 * u, -T - 2 * u); g.quadraticCurveTo(0, -T - 8 * u, -15 * u, -T + 2 * u); g.closePath();
      g.fillStyle = '#5a1a12'; g.fill(); stroke(g, 2);
    },
    head(g, u, P) {
      // Horns sweeping forward and up, a broad pale muzzle, amber spirit eyes.
      for (const [dx, col] of [[-4, '#c8b898'], [0, '#ece0c4']]) {
        g.beginPath(); g.moveTo((-4 + dx) * u, -10 * u); g.bezierCurveTo((-16 + dx) * u, -16 * u, (-10 + dx) * u, -30 * u, (6 + dx) * u, -30 * u); g.bezierCurveTo((-4 + dx) * u, -24 * u, (-6 + dx) * u, -16 * u, (4 + dx) * u, -8 * u); g.closePath();
        g.fillStyle = col; g.fill(); stroke(g, 2);
      }
      cel(g, () => ell(0, 0, 16 * u, 15 * u)(g), '#a8402a', '#7a2a1a', 2.6);
      g.beginPath(); g.moveTo(-14 * u, -2 * u); g.lineTo(-22 * u, -6 * u); g.lineTo(-14 * u, 4 * u); g.closePath(); g.fillStyle = '#8a3220'; g.fill(); stroke(g, 1.8);
      cel(g, () => { g.beginPath(); g.roundRect(4 * u, -2 * u, 18 * u, 16 * u, 7 * u); }, '#e0a080', '#c08060', 2.2);
      dot(g, 17 * u, 4 * u, 1.6 * u); dot(g, 17 * u, 9 * u, 1.6 * u);
      g.beginPath(); g.moveTo(-6 * u, -12 * u); g.quadraticCurveTo(2 * u, -18 * u, 8 * u, -12 * u); g.fillStyle = '#5a1a12'; g.fill();
      if (P.hurt) { g.beginPath(); g.moveTo(1 * u, -5 * u); g.lineTo(7 * u, -3 * u); stroke(g, 2); }
      else { oval(g, 4 * u, -5 * u, 3.4 * u, 3 * u, '#ffc040', '#d09020', 1.4); dot(g, 5 * u, -5 * u, 1.4 * u); }
      if (P.open) { g.beginPath(); g.moveTo(10 * u, 13 * u); g.lineTo(20 * u, 13 * u); stroke(g, 2); }
    },
  },

  ziripot: {
    h: 118, leg: 22, legW: 13, hipW: 7, foot: 7, legCol: '#b89a62', bootCol: '#5a4030', torso: 34, shX: 2, shW: 12, arm: 22, armW: 13, armCol: '#c9b07a', handR: 6, handCol: '#e8c09a', headX: 4, headR: 19,
    body(g, u, P, T) {
      // A huge round body of sacks stuffed with hay, straw poking out at the seams, a rope belt.
      cel(g, () => ell(0, -T * 0.48, 22 * u, T * 0.62)(g), '#c9b07a', '#a08850', 2.8);
      g.strokeStyle = 'rgba(90,60,30,0.6)'; g.lineWidth = 1.4; g.setLineDash([3, 3]);
      g.beginPath(); g.ellipse(-4 * u, -T * 0.48, 12 * u, T * 0.55, 0, -1.2, 1.2); g.stroke(); g.setLineDash([]);
      for (const [x, y, a] of [[-20, -T * 0.6 / u, 2.6], [19, -T * 0.3 / u, 0.3], [-14, -T * 0.15 / u, 2.3], [16, -T * 0.8 / u, 0.6], [2, -T * 1.02 / u, -1.4]]) {
        for (let n = -1; n <= 1; n++) { g.beginPath(); g.moveTo(x * u, y * u); g.lineTo(x * u + Math.cos(a + n * 0.3) * 7 * u, y * u + Math.sin(a + n * 0.3) * 7 * u); stroke(g, 1.6, '#e8c84a'); }
      }
      g.beginPath(); g.moveTo(-21 * u, -T * 0.3); g.quadraticCurveTo(0, -T * 0.22, 21 * u, -T * 0.3); stroke(g, 4.4 * u); g.beginPath(); g.moveTo(-21 * u, -T * 0.3); g.quadraticCurveTo(0, -T * 0.22, 21 * u, -T * 0.3); stroke(g, 2.8 * u, '#8a6a3a');
    },
    head(g, u, P) {
      // A round red face, a big nose, a floppy sack hat with straw.
      cel(g, () => ell(2 * u, 2 * u, 16 * u, 16 * u)(g), '#f0b090', '#d08a6a', 2.6);
      oval(g, 15 * u, 4 * u, 5 * u, 4.4 * u, '#e08a70', '#c06a50', 1.8);
      eyes(g, 5 * u, -1 * u, u, 7 * u, { hurt: P.hurt, size: 1 });
      g.beginPath(); g.ellipse(9 * u, 11 * u, 3 * u, P.open ? 3 * u : 1.6 * u, 0, 0, TAU); g.fillStyle = '#5a1a10'; g.fill(); stroke(g, 1.4);
      cel(g, () => { g.beginPath(); g.moveTo(-17 * u, -4 * u); g.quadraticCurveTo(-4 * u, -24 * u, 14 * u, -10 * u); g.quadraticCurveTo(4 * u, -12 * u, -6 * u, -6 * u); g.quadraticCurveTo(-14 * u, -2 * u, -17 * u, -4 * u); g.closePath(); }, '#a08850', '#7a6438', 2.2);
      for (let n = 0; n < 4; n++) { g.beginPath(); g.moveTo(-15 * u + n * 3 * u, -5 * u); g.lineTo(-19 * u + n * 2 * u, 2 * u); stroke(g, 1.4, '#e8c84a'); }
    },
    weapon(g, u) {
      // His walking stick.
      g.beginPath(); g.moveTo(-6 * u, 0); g.lineTo(36 * u, 0); stroke(g, 5 * u); g.beginPath(); g.moveTo(-6 * u, 0); g.lineTo(36 * u, 0); stroke(g, 3 * u, '#8a6038');
    },
  },

  eate: {
    h: 108, leg: 28, torso: 32, shX: 2, shW: 9, arm: 24, armW: 8, armCol: '#5a6a8a', handR: 5, handCol: '#c8d4e8', headX: 4, headR: 19,
    legs(g, u, P, hipY, t) {
      // No legs: a swirling storm cloud, rain falling from it.
      for (let n = 0; n < 5; n++) {
        const a = t * 3 + n * 1.3, x = Math.cos(a) * 9 * u, y = hipY * (0.15 + n * 0.17) + Math.sin(a) * 2 * u;
        oval(g, x, y, (12 - n * 1.2) * u, (8 - n * 0.6) * u, n % 2 ? '#8a94a8' : '#a8b2c4', '#6a7488', 2);
      }
      g.strokeStyle = 'rgba(140,180,240,0.8)'; g.lineWidth = 1.4;
      for (let n = 0; n < 4; n++) { const x = (n - 1.5) * 6 * u, y = ((t * 40 + n * 7) % 14) * u; g.beginPath(); g.moveTo(x, y - 6 * u); g.lineTo(x - 1.5 * u, y); g.stroke(); }
    },
    behind(g, u, P, T, t) {
      // Wild hair of wind, streaming back.
      for (let n = 0; n < 5; n++) {
        const y0 = -T - 30 * u + n * 5 * u, w = Math.sin(t * 8 + n) * 3 * u - (P.vx ?? 0) * 2 * u;
        g.beginPath(); g.moveTo(2 * u, y0); g.quadraticCurveTo(-18 * u, y0 - 4 * u + w, -32 * u + w, y0 + 6 * u);
        stroke(g, 5 * u); g.beginPath(); g.moveTo(2 * u, y0); g.quadraticCurveTo(-18 * u, y0 - 4 * u + w, -32 * u + w, y0 + 6 * u); stroke(g, 3.2 * u, n % 2 ? '#e8eef8' : '#c8d4e8');
      }
    },
    body(g, u, P, T) {
      cel(g, () => { g.beginPath(); g.moveTo(-12 * u, 2 * u); g.quadraticCurveTo(-15 * u, -T * 0.6, -10 * u, -T); g.quadraticCurveTo(0, -T - 5 * u, 10 * u, -T); g.quadraticCurveTo(15 * u, -T * 0.6, 12 * u, 2 * u); g.closePath(); }, '#4a5878', '#323e58', 2.6);
      g.beginPath(); g.moveTo(-2 * u, -T + 6 * u); g.lineTo(4 * u, -T * 0.6); g.lineTo(-1 * u, -T * 0.55); g.lineTo(5 * u, -4 * u); stroke(g, 2.6, '#ffe060');
    },
    head(g, u, P, t) {
      cel(g, () => ell(2 * u, 2 * u, 15 * u, 16 * u)(g), '#b8c8dc', '#8a9cb8', 2.6);
      const glow = 0.7 + 0.3 * Math.sin(t * 9);
      for (const ex of [6, 13]) { g.fillStyle = `rgba(255,230,90,${0.35 * glow})`; g.beginPath(); g.arc(ex * u, 0, 4 * u, 0, TAU); g.fill(); g.fillStyle = P.hurt ? '#a8b2c4' : '#fff4a0'; g.beginPath(); g.ellipse(ex * u, 0, 2.4 * u, P.hurt ? 0.8 * u : 2 * u, 0, 0, TAU); g.fill(); }
      g.beginPath(); g.moveTo(-12 * u, -10 * u); g.quadraticCurveTo(2 * u, -22 * u, 16 * u, -10 * u); g.quadraticCurveTo(2 * u, -14 * u, -12 * u, -10 * u); g.fillStyle = '#e8eef8'; g.fill(); stroke(g, 1.8);
      g.beginPath(); g.moveTo(8 * u, 10 * u); g.quadraticCurveTo(12 * u, P.open ? 15 * u : 12 * u, 16 * u, 9 * u); stroke(g, 1.6);
    },
    hand(g, x, y, u, front) {
      oval(g, x, y, 5 * u, 5 * u, front ? '#c8d4e8' : '#9aa8c0', '#8a9cb8', 1.8);
      if (front) { g.beginPath(); g.moveTo(x + 3 * u, y - 6 * u); g.lineTo(x + 7 * u, y - 2 * u); g.lineTo(x + 4 * u, y); g.lineTo(x + 9 * u, y + 5 * u); stroke(g, 2, '#ffe060'); }
    },
  },

  basandere: {
    h: 100, leg: 30, legW: 7.5, hipW: 4.5, foot: 5, legCol: '#c99a6e', bootCol: '#c99a6e', torso: 28, shX: 2, shW: 7, arm: 23, armW: 6.5, armCol: '#c99a6e', handR: 4.2, handCol: '#c99a6e', headX: 2, headR: 20,
    behind(g, u, P, T, t) {
      // Very long dark hair to the knees, a leaf or two caught in it.
      const w2 = Math.sin(t * 3) * 3 * u - (P.vx ?? 0) * 3 * u;
      cel(g, () => { g.beginPath(); g.moveTo(-4 * u, -T - 36 * u); g.quadraticCurveTo(-28 * u, -T - 6 * u, -22 * u + w2, 18 * u); g.quadraticCurveTo(-12 * u + w2, 22 * u, -6 * u + w2, 10 * u); g.quadraticCurveTo(-4 * u, -T, 6 * u, -T - 10 * u); g.closePath(); }, '#3a2618', '#24160c', 2.6);
      for (const [x, y] of [[-16, -T / u], [-14, 4]]) { g.beginPath(); g.ellipse(x * u + w2 * 0.5, y * u, 3 * u, 1.6 * u, 0.6, 0, TAU); g.fillStyle = '#6a9a3a'; g.fill(); stroke(g, 1.2); }
    },
    body(g, u, P, T) {
      // A tunic of moss and leaves, a fur over one shoulder.
      cel(g, () => { g.beginPath(); g.moveTo(-9 * u, -T); g.quadraticCurveTo(0, -T - 3 * u, 9 * u, -T); g.lineTo(11 * u, 4 * u); ragged(g, 11 * u, 4 * u, -11 * u, 4 * u, 6, 3.5 * u, 3); g.closePath(); }, '#4a6a3a', '#344c28', 2.4);
      for (let n = 0; n < 4; n++) { g.beginPath(); g.ellipse(-6 * u + n * 4 * u, -T * 0.5 + (n % 2) * 4 * u, 2.6 * u, 1.4 * u, 0.8, 0, TAU); g.fillStyle = '#7aa04a'; g.fill(); }
      cel(g, () => { g.beginPath(); g.moveTo(-10 * u, -T + 1 * u); g.quadraticCurveTo(0, -T - 4 * u, 8 * u, -T + 2 * u); g.lineTo(2 * u, -T + 9 * u); g.closePath(); }, '#8a6a4a', '#6a4a2a', 1.8);
    },
    head(g, u, P) {
      cel(g, () => ell(0, 0, 18 * u, 19 * u)(g), '#3a2618', '#24160c', 2.6);
      oval(g, 7 * u, 3 * u, 11 * u, 13 * u, '#d8a87a', '#b8885a', 2.2);
      g.beginPath(); g.moveTo(-6 * u, -13 * u); g.quadraticCurveTo(10 * u, -22 * u, 19 * u, -6 * u); g.quadraticCurveTo(12 * u, -9 * u, 8 * u, -4 * u); g.quadraticCurveTo(4 * u, -9 * u, -2 * u, -6 * u); g.closePath(); g.fillStyle = '#3a2618'; g.fill(); stroke(g, 1.8);
      eyes(g, 7 * u, 2 * u, u, 8 * u, { hurt: P.hurt, size: 1.1 });
      g.beginPath(); g.moveTo(9 * u, 10 * u); g.quadraticCurveTo(12 * u, P.open ? 14 * u : 12 * u, 15 * u, 9 * u); stroke(g, 1.4);
      // A crown of leaves.
      for (let n = 0; n < 4; n++) { g.beginPath(); g.ellipse(-8 * u + n * 6 * u, -15 * u + Math.abs(n - 1.5) * 2 * u, 3.4 * u, 1.8 * u, -0.6 + n * 0.4, 0, TAU); g.fillStyle = n % 2 ? '#6a9a3a' : '#8ab04a'; g.fill(); stroke(g, 1.2); }
    },
  },
};

// Herensuge is no person: a dragon on four short legs with seven heads on
// long necks, one for each breath of fire it has left (a stub grows back).
function drawHerensuge(g, f, t, P) {
  const k = f.kind, u = 1.12, heads = k.specials.neutral.charges ? f.charges ?? 7 : 7;
  const col = '#4a7a42', dark = '#2f5229', belly = '#e8b878';
  // A blow: the heads draw back over the windup, snap out at the strike and
  // ease home; the whole body lunges with them. Forward blows strike ahead,
  // up blows overhead, down blows at the ground.
  const mv = f.move, atk = mv && ['attack', 'special', 'super'].includes(f.state) && mv.kind !== 'cone';
  let strike = 0, aim = 'fwd';
  if (atk) {
    const a = mv.startup, b = a + mv.active, e = b + mv.recovery;
    strike = f.t <= a ? -0.45 * easeOut(f.t / Math.max(1, a)) : f.t <= b ? 1 : 1 - easeIO(clamp01((f.t - b) / Math.max(1, e - b)));
    const key = f.state === 'attack' ? moveKey(f) : '';
    aim = ['up', 'usmash', 'airUp'].includes(key) ? 'up' : ['down', 'dsmash', 'airDown'].includes(key) ? 'down' : key === 'bair' ? 'back' : 'fwd';
  }
  const lunge = aim === 'back' ? -strike * 10 * u : strike * 9 * u;
  g.translate(lunge, 0);
  const tailSwing = aim === 'back' ? strike * 1.4 : f.state === 'attack' ? (P.align > 0.6 ? 1 : -0.5) : Math.sin(t * 2) * 0.15;
  const by = -30 * u + P.bob * 0.6 - P.crouch * 6;
  // The tail behind, swinging round in the tail sweep.
  g.beginPath(); g.moveTo(-22 * u, by); g.bezierCurveTo(-50 * u, by + 10 * u, -60 * u, by - 10 * u - tailSwing * 26 * u, -54 * u, by - 30 * u - tailSwing * 30 * u);
  g.lineWidth = 15 * u; g.strokeStyle = INK; g.lineCap = 'round'; g.stroke(); g.lineWidth = 11 * u; g.strokeStyle = col; g.stroke();
  const tx = -54 * u, ty = by - 30 * u - tailSwing * 30 * u;
  g.beginPath(); g.moveTo(tx, ty - 9 * u); g.lineTo(tx + 8 * u, ty); g.lineTo(tx, ty + 9 * u); g.lineTo(tx - 8 * u, ty); g.closePath(); g.fillStyle = '#c9502f'; g.fill(); stroke(g, 2);
  // Legs: the far pair darker.
  for (const [x, c] of [[-16, dark], [14, dark], [-10, col], [20, col]]) {
    const a = P.walk * (x < 0 ? 1 : -1) * 0.4, fx = x * u + Math.sin(a) * 18 * u;
    limb(g, x * u, by + 8 * u, fx, -4 * u, 11 * u, c);
    oval(g, fx + 3 * u, -3 * u, 8 * u, 4 * u, c, dark, 2);
    for (let n = 0; n < 3; n++) dot(g, fx + 7 * u + n * 2 * u, -2 * u, 1.2 * u, '#e8e0d0');
  }
  // Wings folded on the back.
  g.beginPath(); g.moveTo(-8 * u, by - 20 * u); g.lineTo(-30 * u, by - 46 * u - Math.sin(t * 3) * 3 * u); g.lineTo(-24 * u, by - 22 * u); g.lineTo(-36 * u, by - 30 * u); g.lineTo(-20 * u, by - 12 * u); g.closePath();
  g.fillStyle = '#3a6234'; g.fill(); stroke(g, 2.2);
  // The body and its belly plates.
  cel(g, () => ell(0, by, 32 * u, 24 * u)(g), col, dark, 2.8);
  g.save(); ell(0, by, 32 * u, 24 * u)(g); g.clip();
  g.beginPath(); g.ellipse(8 * u, by + 12 * u, 24 * u, 14 * u, 0, 0, TAU); g.fillStyle = belly; g.fill(); stroke(g, 2);
  for (let n = 0; n < 4; n++) { g.beginPath(); g.moveTo(-10 * u + n * 8 * u, by + 2 * u); g.lineTo(-12 * u + n * 8 * u, by + 26 * u); stroke(g, 1.4, 'rgba(120,80,40,0.6)'); }
  g.restore();
  for (let n = 0; n < 5; n++) { const x = -18 * u + n * 8 * u, dy = Math.abs(n - 2) * 2 * u; g.beginPath(); g.moveTo(x - 3 * u, by - 22 * u + dy); g.lineTo(x, by - 30 * u + dy); g.lineTo(x + 3 * u, by - 22 * u + dy); g.closePath(); g.fillStyle = '#c9502f'; g.fill(); stroke(g, 1.6); }
  // Seven necks fanning up from the front, a small head on each that's left.
  const breathing = (f.state === 'special' || f.state === 'super') && f.move?.kind === 'cone';
  const bx = 18 * u, byy = by - 14 * u;
  for (const n of [0, 6, 1, 5, 2, 4, 3]) {
    const alive = n < heads, spread = (n - 3) / 3, reachK = breathing ? 1.2 : 1;
    let hx = bx + (12 + spread * 22) * u * reachK + (breathing ? 14 * u : 0), hy = byy - (44 - Math.abs(spread) * 18) * u + Math.sin(t * 3 + n) * 3 * u + (breathing ? 14 * u : 0);
    if (strike && aim !== 'back') {
      // The front heads lead; the outer ones follow a little behind.
      const s2 = strike * (1 - Math.abs(spread) * 0.35);
      if (aim === 'fwd') { hx += s2 * 30 * u; hy += s2 * 22 * u; }
      else if (aim === 'up') { hx -= s2 * spread * 8 * u; hy -= s2 * 20 * u; }
      else { hx += s2 * 20 * u; hy += s2 * 44 * u; }
    }
    const len = alive ? 1 : 0.35;
    const ex = bx + (hx - bx) * len, ey = byy + (hy - byy) * len;
    g.beginPath(); g.moveTo(bx, byy); g.quadraticCurveTo(bx + spread * 6 * u, byy - 30 * u * len, ex, ey);
    g.lineCap = 'round'; g.lineWidth = 10 * u; g.strokeStyle = INK; g.stroke(); g.lineWidth = 6.5 * u; g.strokeStyle = n % 2 ? col : shade(col, -0.08); g.stroke();
    if (!alive) { oval(g, ex, ey, 4 * u, 4 * u, '#6a9a5a', dark, 2); continue; }
    const bite = strike > 0.5 && aim !== 'back';
    g.save(); g.translate(ex, ey); g.rotate(breathing ? 0.4 : bite ? (aim === 'up' ? -1.0 : aim === 'down' ? 1.1 : 0.45) : spread * 0.3); g.scale(1.25, 1.25);
    cel(g, () => ell(0, 0, 8 * u, 6.5 * u)(g), col, dark, 2.2);
    cel(g, () => { g.beginPath(); g.moveTo(2 * u, -4 * u); g.quadraticCurveTo(14 * u, -4 * u, 14 * u, 1 * u); g.lineTo(2 * u, 4 * u); g.closePath(); }, col, dark, 2);
    if (breathing || P.open || bite) { const jaw = bite ? 4 * u : 0; g.beginPath(); g.moveTo(4 * u, 2 * u); g.lineTo(14 * u, 1 * u); g.lineTo(12 * u, 6 * u + jaw); g.closePath(); g.fillStyle = '#7a1a10'; g.fill(); stroke(g, 1.6); if (bite) for (let q = 0; q < 3; q++) dot(g, (7 + q * 2.5) * u, 2.5 * u, 0.9 * u, '#f4eee0'); }
    g.beginPath(); g.moveTo(-4 * u, -5 * u); g.lineTo(-8 * u, -11 * u); g.lineTo(-1 * u, -6 * u); g.fillStyle = '#e8e0d0'; g.fill(); stroke(g, 1.4);
    if (P.hurt) { g.beginPath(); g.moveTo(1 * u, -2.5 * u); g.lineTo(5 * u, -1.5 * u); stroke(g, 1.6); }
    else { dot(g, 3 * u, -2 * u, 2 * u, '#ffd65a'); dot(g, 3.6 * u, -2 * u, 0.9 * u); }
    g.restore();
  }
}

// Fighters are drawn at DRAW x their art height, in screen pixels; the
// pixel layer then halves that to stage pixels (Basajaun is about 44 pixels
// tall, like a Super Smash Flash sprite).
const DRAW = 0.68;
const heightOf = (k) => (k.id === 'herensuge' ? 112 : SPEC[k.id]?.h ?? 100);
const drawnH = (k) => heightOf(k) * DRAW;

// Where on the screen a fighter's middle is (for effects and shots).
export const chestY = (f) => f.y * S - drawnH(f.kind) * 0.5;

const FXCOL = { club: 'rgba(255,250,235,0.9)', water: 'rgba(150,220,250,0.9)', dust: 'rgba(236,220,190,0.9)', needle: 'rgba(240,244,250,0.9)', claw: 'rgba(170,150,255,0.9)', horn: 'rgba(255,250,235,0.9)', fire: 'rgba(255,170,70,0.9)', spark: 'rgba(255,236,120,0.95)', leaf: 'rgba(170,230,120,0.9)' };

// A blow's swoosh, over the pixel layer (the camera is applied): an arc that
// pivots at the striker's chest and sweeps through the hitbox, reaching its
// far edge, so what you see is where it can land. Thin and see-through, in
// the fighter's colour of blow with a bright leading edge; claws add slashes,
// lightning a crackle, leaves a scatter.
function drawSwooshes(g, m, t) {
  for (const f of m.fighters) {
    const mv = f.move;
    if (!mv || f.state !== 'attack' || f.state === 'out' || (m.dark > 0 && m.darkOwner === f.i)) continue;
    const into = f.t - mv.startup;
    if (into < 1 || into > mv.active + 3) continue;
    const d = f.fx < 0 ? -1 : 1, px = f.x, py = f.y - f.h * 0.6;
    const hx = f.x + d * (mv.x ?? 0), hy = f.y - (mv.y ?? f.h / 2), hw = mv.w ?? f.w, hh = mv.h ?? f.h;
    const style = styleOf(f.kind.id).fx, col = FXCOL[style] ?? FXCOL.club;
    const k = clamp01(into / Math.max(1, mv.active)), fade = into > mv.active ? 1 - (into - mv.active) / 4 : 1;
    g.save();
    g.translate(px * S, py * S);
    const dx = (hx - px) * d, dy = hy - py, dist = Math.hypot(dx, dy);
    // Round the body (neutral air, spins): a ring all the way round.
    if (dist < 6) {
      const r = Math.max(hw, hh) / 2 * S;
      g.globalAlpha = 0.5 * fade; g.lineWidth = 7; g.strokeStyle = col;
      g.beginPath(); g.arc(0, 0, r * 0.85, 0, TAU); g.stroke();
      g.globalAlpha = 0.9 * fade; g.lineWidth = 2; g.strokeStyle = '#fffbe8'; g.stroke();
      g.restore(); continue;
    }
    g.scale(d, 1);
    const mid = Math.atan2(dy, dx), half = Math.min(1.1, 0.55 + hh / Math.max(20, dist * 2));
    const R1 = (dist + hw / 2) * S, R0 = Math.max(R1 * 0.72, R1 - 16);
    // It sweeps from above to below the aim (down blows sweep the other way).
    const dir = dy > hh ? -1 : 1, a0 = mid - dir * half, a1 = a0 + dir * 2 * half * Math.min(1, 0.35 + k * 0.9);
    g.globalAlpha = 0.68 * fade;
    g.beginPath(); g.arc(0, 0, R1, a0, a1, dir < 0); g.arc(0, 0, R0, a1, a0, dir > 0); g.closePath();
    g.fillStyle = col; g.fill();
    g.globalAlpha = 0.95 * fade;
    g.beginPath(); g.arc(0, 0, R1, a0, a1, dir < 0); g.lineWidth = 2.5; g.lineCap = 'round'; g.strokeStyle = '#fffbe8'; g.stroke();
    if (style === 'claw') for (let n = 1; n <= 2; n++) { g.beginPath(); g.arc(0, 0, R0 + (R1 - R0) * n / 3, a0, a1, dir < 0); g.lineWidth = 2; g.strokeStyle = 'rgba(150,130,255,0.9)'; g.stroke(); }
    if (style === 'spark') { g.beginPath(); for (let n = 0; n <= 5; n++) { const a = a0 + (a1 - a0) * n / 5, r = n % 2 ? R0 : R1; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.lineWidth = 2.5; g.strokeStyle = '#fff070'; g.stroke(); }
    if (style === 'leaf') for (let n = 0; n < 3; n++) { const a = a0 + (a1 - a0) * (n + 0.5) / 3; g.beginPath(); g.ellipse(Math.cos(a) * R1, Math.sin(a) * R1, 5, 2.5, a, 0, TAU); g.fillStyle = '#7ab04a'; g.fill(); }
    g.restore();
  }
}

export function drawCharacter(g, f, t, R, scale = 1) {
  const P = poseOf(f, t, R);
  g.save();
  g.scale(scale * DRAW, scale * DRAW);
  if (f.fx < 0) g.scale(-1, 1);
  if (P.spin) {
    const cy = -heightOf(f.kind) * 0.4;
    g.translate(0, cy); g.rotate(P.spin); g.scale(0.85, 0.85); g.translate(0, -cy);
  }
  if (f.kind.id === 'herensuge') { g.rotate((P.lean ?? 0) * 0.35); g.scale(1 + (1 - (P.sq ?? 1)) * 0.7, P.sq ?? 1); drawHerensuge(g, f, t, P); }
  else { const sp = SPEC[f.kind.id] ?? SPEC.basajaun; person(g, f, t, P, { ...sp, u: sp.h / 100 }); }
  g.restore();
  return P;
}

export const PCOL = ['#e69f00', '#56b4e9'];
const ELCOL = { ura: '#7ad0ff', sua: '#ffb040', basoa: '#9ae060', harria: '#e0d4b8', gaua: '#b8a8ff' };

// Animation steps like a sprite sheet: cycles at 12 frames a second, moves
// every 2 game frames.
const stepT = (t) => Math.floor(t * 12) / 12;

// The body only (glows, shields and tags are drawn over the pixel layer).
function drawBodyAt(g, m, f, t) {
  if (f.state === 'out') return;
  const x = f.x * S, y = f.y * S;
  // A charging smash trembles; a fresh hit shakes.
  const shake = (f.charge > 0 && f.state === 'attack' && f.t <= f.move?.startup) ? Math.sin(t * 90) * 2 : f.state === 'hitstun' && f.t < 8 ? Math.sin(t * 70) * 3 : 0;
  g.save();
  g.translate(x + shake, y);
  if (f.mirror) g.filter = 'hue-rotate(150deg) saturate(1.1)';
  if ((f.state === 'hitstun' && f.t < 4) || (f.charge > 0 && Math.floor(t * 20) % 2 && f.state === 'attack')) g.filter = 'brightness(2)';
  // Invincible (just back in the ring, or grabbing a ledge): the sprite flashes.
  else if (f.invT > 0 && Math.floor(t * 15) % 2) g.filter = 'brightness(1.7) saturate(0.6)';
  drawCharacter(g, { ...f, t: f.t - (f.t % 2) }, stepT(t), m.R);
  g.restore();
}

// ---- the pixel layer --------------------------------------------------------------------------------
//
// Fighters, objects and effects are painted at stage resolution (480x270)
// and turned into hard pixels: alpha snapped, colours posterized, a one-pixel
// dark outline round every shape. Then the layer is scaled up with no
// smoothing, through the camera. That's what gives the sprite look.

const OUTLINE = [26, 18, 12];
// Round very dark shapes (Akerbeltz, Gaueko, the night) the outline is a
// lighter rim instead, or they'd vanish into it.
const RIM = [128, 116, 104];
// Screen pixels per art pixel: 1.5 (three pixels of the 1920 canvas), fine enough for faces and hands.
const PX = 1.5;
const canvasOf = (name, w, h) => cached(`cv.${name}`, () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; });

// Draws onto a full-size scratch canvas (960x540) through the camera, then
// takes ONE pixel from each 2x2 block (no blended edge colours), snaps alpha,
// posterizes a little and outlines every shape with one dark pixel. The result
// (480x270) is drawn back up with hard pixels: the same pixel size at every zoom.
function pixelPass(name, view, paint, outline = true) {
  const big = canvasOf(`${name}.big`, W, H), small = canvasOf(`${name}.small`, W / PX, H / PX);
  const bg = big.getContext('2d');
  bg.setTransform(1, 0, 0, 1, 0, 0); bg.clearRect(0, 0, W, H);
  bg.imageSmoothingEnabled = true;
  applyCamera(bg, view);
  paint(bg);
  // Nearest-pixel shrink on the graphics card picks one pixel per block.
  const w = W / PX, h = H / PX, sg = small.getContext('2d', { willReadFrequently: true });
  sg.setTransform(1, 0, 0, 1, 0, 0); sg.clearRect(0, 0, w, h);
  sg.imageSmoothingEnabled = false;
  sg.drawImage(big, 0, 0, w, h);
  const img = sg.getImageData(0, 0, w, h), d = img.data, solid = new Uint8Array(w * h);
  for (let p = 0, di = 0; p < w * h; p++, di += 4) {
    if (d[di + 3] < 128) { d[di + 3] = 0; continue; }
    const a = d[di + 3] / 255;
    d[di] = Math.min(255, Math.round(d[di] / a / 12) * 12); d[di + 1] = Math.min(255, Math.round(d[di + 1] / a / 12) * 12); d[di + 2] = Math.min(255, Math.round(d[di + 2] / a / 12) * 12);
    d[di + 3] = 255; solid[p] = 1;
  }
  if (outline) {
    const edge = new Uint8Array(w * h); // 1: dark outline, 2: light rim
    const dark = (q) => { const i = q * 4; return d[i] + d[i + 1] + d[i + 2] < 150; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (solid[p]) continue;
      const n = [x > 0 && solid[p - 1] ? p - 1 : -1, x < w - 1 && solid[p + 1] ? p + 1 : -1, y > 0 && solid[p - w] ? p - w : -1, y < h - 1 && solid[p + w] ? p + w : -1].filter((q) => q >= 0);
      if (n.length) edge[p] = n.every(dark) ? 2 : 1;
    }
    for (let p = 0; p < w * h; p++) {
      if (!edge[p]) continue;
      const c = edge[p] === 2 ? RIM : OUTLINE, i = p * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  }
  sg.putImageData(img, 0, 0);
  return small;
}

// The stage, painted once at full detail and posterized; each frame it is
// point-sampled through the camera into stage pixels.
function stageArt(arena, R) {
  return cached(`stageart.${arena.id}`, () => {
    const c = paintArena(arena, R), g = c.getContext('2d', { willReadFrequently: true });
    const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = Math.round(d[i + k] / 14) * 14;
    g.putImageData(img, 0, 0);
    return c;
  });
}
function stageLayer(m, view) {
  const small = canvasOf('stage.small', W / PX, H / PX), g = small.getContext('2d');
  g.setTransform(1 / PX, 0, 0, 1 / PX, 0, 0);
  g.imageSmoothingEnabled = false;
  applyCamera(g, view);
  g.drawImage(stageArt(m.arena, m.R), 0, 0, m.stage.world.w * S, m.stage.world.h * S);
  return small;
}

// A small pixel image of anything drawn in screen pixels (for portraits).
function pixelate(c, step = 20) {
  const g = c.getContext('2d', { willReadFrequently: true });
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data, w = c.width, h = c.height;
  const solid = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    if (d[i + 3] < 110) { d[i + 3] = 0; continue; }
    const a = d[i + 3] / 255;
    for (let k = 0; k < 3; k++) d[i + k] = Math.min(255, Math.round(d[i + k] / a / step) * step);
    d[i + 3] = 255; solid[p] = 1;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (solid[p]) continue;
    if ((x > 0 && solid[p - 1]) || (x < w - 1 && solid[p + 1]) || (y > 0 && solid[p - w]) || (y < h - 1 && solid[p + w])) {
      const i = p * 4; d[i] = OUTLINE[0]; d[i + 1] = OUTLINE[1]; d[i + 2] = OUTLINE[2]; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// A fighter's portrait for the select screen and the HUD, painted once as a
// pixel sprite: standing, facing right, everyone the same height in the frame.
export function portrait(k, size = 96) {
  return cached(`portrait.${k.id}.${size}`, () => {
    const px = Math.round(size / 2), big = document.createElement('canvas'); big.width = big.height = px * 2;
    const g = big.getContext('2d');
    const dragon = k.id === 'herensuge', sc = (px * 2 * (dragon ? 0.66 : 0.84)) / heightOf(k) / DRAW;
    g.translate(px - (dragon ? -6 : 4), px * 1.9);
    drawCharacter(g, { i: 0, kind: k, fx: 1, fy: 0, state: 'idle', t: 0, grounded: true, charges: k.specials.neutral.charges ?? 7, cooldown: {} }, 0.3, { dodge: { frames: 20 } }, sc);
    const c = document.createElement('canvas'); c.width = c.height = px;
    const cg = c.getContext('2d'); cg.imageSmoothingEnabled = false; cg.drawImage(big, 0, 0, px, px);
    pixelate(c, 12);
    return c.toDataURL();
  });
}
const portraitImg = (k, size) => cached(`pimg.${k.id}.${size}`, () => { const im = new Image(); im.src = portrait(k, size); return im; });

// ---- effects ---------------------------------------------------------------------------------------

function star(g, x, y, r, c = '#fff8d8', lw = 2) {
  g.beginPath();
  for (let n = 0; n < 16; n++) { const a = (n / 16) * TAU, rr = n % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fillStyle = c; g.fill(); if (lw) stroke(g, lw);
}

function drawMoveFx(g, m, f, t) {
  const mv = f.move;
  if (!mv || f.state === 'out') return;
  const into = f.t - mv.startup, active = into > 0 && into <= mv.active;
  const d = f.fx < 0 ? -1 : 1, x = f.x * S, y = f.y * S;
  if ((f.state === 'special' || f.state === 'super') && active && mv.kind === 'ring') {
    // Stomp: a shockwave running along the ground both ways.
    const k = into / mv.active, r = mv.radius * S * (0.3 + 0.7 * k);
    g.strokeStyle = `rgba(240,225,190,${1 - k})`; g.lineWidth = 7; g.beginPath(); g.ellipse(x, y, r, 8, 0, Math.PI, TAU); g.stroke();
    for (const s2 of [-1, 1]) for (let n = 0; n < 3; n++) dot(g, x + s2 * r * (0.6 + n * 0.15), y - 4 - n * 3, 3 - n * 0.6, `rgba(214,196,150,${1 - k})`);
  } else if ((f.state === 'special' || f.state === 'super') && active && mv.kind === 'cone') {
    // Fire breath from the heads: a flickering cone.
    const R2 = mv.range * S, half = (mv.spread * Math.PI) / 360, ox = x + d * f.w * S * 0.5, oy = y - f.h * 0.6 * S;
    const gr = g.createRadialGradient(ox, oy, 4, ox, oy, R2);
    gr.addColorStop(0, 'rgba(255,245,180,0.95)'); gr.addColorStop(0.5, 'rgba(255,140,40,0.8)'); gr.addColorStop(1, 'rgba(200,50,20,0)');
    const a = d > 0 ? 0 : Math.PI;
    g.fillStyle = gr; g.beginPath(); g.moveTo(ox, oy); g.arc(ox, oy, R2 * (0.9 + 0.1 * Math.sin(t * 40)), a - half, a + half); g.closePath(); g.fill();
  } else if ((f.state === 'special' || f.state === 'super') && active && mv.kind === 'dash') {
    const cy = chestY(f);
    for (let n = 0; n < 4; n++) { g.beginPath(); g.moveTo(x - d * (20 + n * 8), cy - 14 + n * 9); g.lineTo(x - d * (60 + n * 8), cy - 14 + n * 9); stroke(g, 3, 'rgba(255,250,235,0.7)'); }
  } else if (f.state === 'special' && mv.kind === 'leap' && f.t > mv.startup) {
    // The recovery leap: a burst of light and a swirling trail as they shoot upward.
    const k = (f.t - mv.startup) / mv.active, hgt = f.h * S, col = ELCOL[f.kind.element] ?? '#fff4b0';
    if (k < 1) {
      for (let n = 0; n < 8; n++) {
        const a = t * 20 + (n * TAU) / 8, rr = hgt * 0.55;
        star(g, x + Math.cos(a) * rr, y - hgt * 0.5 + Math.sin(a) * rr * 0.5 + n * 3, 4 + (n % 3), n % 2 ? col : '#ffffff', 0);
      }
      g.fillStyle = col; g.globalAlpha = 0.85;
      g.beginPath(); g.moveTo(x - hgt * 0.25, y); g.lineTo(x + hgt * 0.25, y); g.lineTo(x + hgt * 0.08, y + hgt * 1.6 * (1 - k)); g.lineTo(x - hgt * 0.08, y + hgt * 1.6 * (1 - k)); g.closePath(); g.fill();
      g.globalAlpha = 1;
    }
    if (f.t < mv.startup + 6) for (let n = 0; n < 7; n++) dot(g, x + (n - 3) * 9, y + 6, 6 - Math.abs(n - 3), 'rgba(240,232,212,0.95)');
  }
}

function sheep(g, x, y, s, t, k) {
  const bob = Math.abs(Math.sin(t * 16 + k)) * -4;
  g.fillStyle = 'rgba(30,20,10,0.3)'; g.beginPath(); g.ellipse(x, y, 14 * s, 4 * s, 0, 0, TAU); g.fill();
  for (const lx of [-7, 6]) limb(g, x + lx * s, y - 8 * s + bob, x + lx * s + Math.sin(t * 16 + k + lx) * 3, y - 1, 3 * s, '#2a2420', 1.4);
  g.beginPath(); for (let n = 0; n <= 12; n++) { const a = (n / 12) * TAU, r = (n % 2 ? 12 : 14) * s; g.lineTo(x + Math.cos(a) * r, y - 16 * s + bob + Math.sin(a) * r * 0.7); } g.closePath();
  g.fillStyle = '#f4efe2'; g.fill(); stroke(g, 2);
  oval(g, x + 14 * s, y - 18 * s + bob, 5.5 * s, 4.6 * s, '#3a302a', '#241e1a', 1.8);
  dot(g, x + 16 * s, y - 19 * s + bob, 1.1 * s, '#fff');
}

function hayBale(g, x, y, r) {
  cel(g, () => { g.beginPath(); g.roundRect(x - r * 1.1, y - r * 0.8, r * 2.2, r * 1.6, r * 0.3); }, '#e0c060', '#b89838', 2.4);
  for (const dx of [-0.45, 0.45]) { g.beginPath(); g.moveTo(x + dx * r, y - r * 0.8); g.lineTo(x + dx * r, y + r * 0.8); stroke(g, 2, '#8a6a2a'); }
  for (let n = 0; n < 5; n++) { g.beginPath(); g.moveTo(x - r + n * r * 0.5, y - r * 0.8); g.lineTo(x - r + n * r * 0.5 + 2, y - r * 1.05); stroke(g, 1.2, '#f0d878'); }
}

// Zaldiko: a man in a little hobby-horse, galloping.
function zaldiko(g, x, y, t) {
  const bob = Math.abs(Math.sin(t * 16)) * -4;
  g.fillStyle = 'rgba(30,20,10,0.3)'; g.beginPath(); g.ellipse(x, y, 20, 5, 0, 0, TAU); g.fill();
  for (const lx of [-5, 5]) limb(g, x + lx, y - 18 + bob, x + lx + Math.sin(t * 16 + lx) * 6, y - 2, 5, '#f0ece0', 1.6);
  for (const lx of [-5, 5]) oval(g, x + lx + Math.sin(t * 16 + lx) * 6 + 2, y - 2, 4, 2.4, '#2a2420', '#141210', 1.4);
  cel(g, () => { g.beginPath(); g.roundRect(x - 20, y - 30 + bob, 40, 14, 6); }, '#8a5a34', '#64401f', 2.4);
  g.beginPath(); g.moveTo(x + 14, y - 28 + bob); g.quadraticCurveTo(x + 26, y - 44 + bob, x + 30, y - 36 + bob); stroke(g, 8); g.beginPath(); g.moveTo(x + 14, y - 28 + bob); g.quadraticCurveTo(x + 26, y - 44 + bob, x + 30, y - 36 + bob); stroke(g, 5, '#8a5a34');
  oval(g, x + 31, y - 37 + bob, 6, 4, '#8a5a34', '#64401f', 2);
  for (let n = 0; n < 4; n++) { g.beginPath(); g.moveTo(x + 18 + n * 3, y - 38 + bob - n * 2); g.lineTo(x + 14 + n * 3, y - 44 + bob - n * 2); stroke(g, 2, '#2a1a10'); }
  g.beginPath(); g.moveTo(x - 20, y - 26 + bob); g.lineTo(x - 30, y - 18 + bob); stroke(g, 3, '#2a1a10');
  cel(g, () => { g.beginPath(); g.roundRect(x - 6, y - 50 + bob, 12, 22, 4); }, '#f4f0e6', '#d0c8b4', 2);
  g.beginPath(); g.moveTo(x - 6, y - 36 + bob); g.lineTo(x + 6, y - 36 + bob); stroke(g, 3.4, '#c9302c');
  oval(g, x, y - 56 + bob, 6, 6, '#f0c8a0', '#d4a47a', 2);
  g.beginPath(); g.ellipse(x, y - 61 + bob, 7, 2.6, 0, 0, TAU); g.fillStyle = '#c9302c'; g.fill(); stroke(g, 1.6);
}

// A bird of the woods, wings beating.
function bird(g, x, y, vx, t) {
  const flap = Math.sin(t * 30) * 6, d = vx >= 0 ? 1 : -1;
  g.save(); g.translate(x, y); g.scale(d, 1);
  g.beginPath(); g.moveTo(-2, 0); g.lineTo(-10, -flap); g.lineTo(-4, 2); g.moveTo(2, 0); g.lineTo(-4, -flap - 2); g.lineTo(2, 2); g.fillStyle = '#5a4030'; g.fill(); stroke(g, 1.4);
  oval(g, 0, 0, 6, 3.6, '#7a5a3a', '#5a4030', 1.6);
  oval(g, 6, -1, 3, 3, '#7a5a3a', '#5a4030', 1.4);
  g.beginPath(); g.moveTo(9, -1); g.lineTo(12, 0); g.lineTo(9, 1); g.fillStyle = '#e8b030'; g.fill();
  g.restore();
}

function rock(g, x, y, r) {
  cel(g, () => { g.beginPath(); for (let n = 0; n < 9; n++) { const a = (n / 9) * TAU, rr = r * (0.82 + ((n * 37) % 7) / 30); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.86); } g.closePath(); }, '#a49a88', '#746b5c', 2.4);
  g.beginPath(); g.moveTo(x - r * 0.4, y - r * 0.2); g.lineTo(x + r * 0.05, y + r * 0.2); g.lineTo(x + r * 0.4, y); stroke(g, 1.4, 'rgba(34,26,20,0.7)');
}

function drawObjects(g, m, t, objects) {
  for (const o of objects) {
    const x = o.x * S, y = o.y * S;
    if (o.kind === 'boulder') {
      const r = o.radius * S;
      if (!o.landed) {
        // In flight (or falling): its shadow on the surface below.
        if (o.wait > 0) continue;
        const below = m.surfaceBelow ? m.surfaceBelow(o.x, o.y, !!o.fall) : null;
        if (below !== null) {
          const k = Math.max(0.2, 1 - (below - o.y) / 200);
          g.fillStyle = `rgba(30,20,10,${0.4 * k})`; g.beginPath(); g.ellipse(x, below * S, r * k, r * 0.3 * k, 0, 0, TAU); g.fill();
          if (o.fall) { g.strokeStyle = 'rgba(255,240,200,0.7)'; g.setLineDash([4, 4]); g.lineWidth = 2; g.beginPath(); g.ellipse(x, below * S, r * 1.1, r * 0.34, 0, 0, TAU); g.stroke(); g.setLineDash([]); }
        }
        if (o.move?.id === 'hayBale') hayBale(g, x, y, r);
        else if (o.move?.id === 'greatStorm') { oval(g, x, y, r * 0.8, r * 0.8, '#e8f4ff', '#a8c4e0', 2.2); dot(g, x - r * 0.3, y - r * 0.3, r * 0.25, '#ffffff'); }
        else rock(g, x, y, r);
        continue;
      }
      g.globalAlpha = o.life < 60 ? o.life / 60 : 1;
      if (o.move?.id === 'hayBale') { hayBale(g, x, y - r * 0.8, r); g.globalAlpha = 1; continue; }
      if (o.dolmen) {
        // A small dolmen: two uprights and a capstone.
        cel(g, () => { g.beginPath(); g.roundRect(x - r * 0.9, y - r * 1.9, r * 0.55, r * 1.9, 3); }, '#9a9282', '#6e675a', 2.2);
        cel(g, () => { g.beginPath(); g.roundRect(x + r * 0.35, y - r * 1.9, r * 0.55, r * 1.9, 3); }, '#9a9282', '#6e675a', 2.2);
        cel(g, () => { g.beginPath(); g.roundRect(x - r * 1.15, y - r * 2.4, r * 2.3, r * 0.6, 6); }, '#aaa290', '#7a7262', 2.4);
      } else rock(g, x, y - r * 0.8, r);
      g.globalAlpha = 1;
    } else if (o.kind === 'shot') {
      if (o.id === 'goldenComb') {
        g.save(); g.translate(x, y); g.rotate(t * 18);
        for (let k = -9; k <= 9; k += 3.6) { g.beginPath(); g.moveTo(k, 1); g.lineTo(k, 8); stroke(g, 3.4); g.beginPath(); g.moveTo(k, 1); g.lineTo(k, 8); stroke(g, 1.8, '#e8b030'); }
        g.beginPath(); g.roundRect(-11, -5, 22, 7, 2); g.fillStyle = '#ffd65a'; g.fill(); stroke(g, 1.8);
        g.restore();
      } else if (o.id === 'nightWind') {
        const a = Math.atan2(o.vy, o.vx);
        for (let k = 0; k < 3; k++) {
          const cx = x - o.vx * k * 5, rr = o.radius * S * (0.7 - k * 0.15);
          g.beginPath(); g.arc(cx, y, rr, a - 1.1, a + 1.1); stroke(g, 5, 'rgba(34,26,40,0.5)');
          g.beginPath(); g.arc(cx, y, rr, a - 1.1, a + 1.1); stroke(g, 3, 'rgba(200,215,255,0.85)');
        }
      } else if (o.id === 'needleThrow') {
        const a = Math.atan2(o.vy, o.vx);
        g.save(); g.translate(x, y); g.rotate(a);
        g.beginPath(); g.moveTo(-12, 0); g.lineTo(12, 0); stroke(g, 4.4); g.beginPath(); g.moveTo(-12, 0); g.lineTo(12, 0); stroke(g, 2.4, '#e0e6ec');
        g.restore();
      } else if (o.id === 'bellChime') {
        // The stable bell's ring, sent out in waves.
        const a = Math.atan2(o.vy, o.vx);
        for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x - o.vx * k * 4, y, 6 + k * 4, a - 0.9, a + 0.9); stroke(g, 5); g.beginPath(); g.arc(x - o.vx * k * 4, y, 6 + k * 4, a - 0.9, a + 0.9); stroke(g, 3, '#e8c84a'); }
      } else if (o.id === 'snort') {
        // Hot breath from a bull's nostrils.
        for (let k = 0; k < 3; k++) oval(g, x - o.vx * k * 3, y + Math.sin(t * 20 + k) * 2, 8 - k * 2, 6 - k * 1.5, '#f4f0ea', '#c8c0b4', 2);
      } else if (o.id === 'sheepCharge') {
        // A sheep charging along the ground.
        g.save(); if (o.vx < 0) { g.translate(x, 0); g.scale(-1, 1); g.translate(-x, 0); }
        sheep(g, x, y + o.radius * S, 0.9, t, 0); g.restore();
      } else if (o.id === 'hotChestnut') {
        const r = o.radius * S;
        g.fillStyle = 'rgba(255,140,40,0.5)'; g.beginPath(); g.arc(x, y, r * 1.5, 0, TAU); g.fill();
        cel(g, () => ell(x, y, r, r * 0.9)(g), '#8a4a20', '#5a2a10', 2); oval(g, x - r * 0.2, y + r * 0.4, r * 0.6, r * 0.35, '#e8c890', '#c8a870', 1.2);
      } else if (o.id === 'whirlwind') {
        // A whirlwind: a spinning funnel.
        const r = o.radius * S;
        for (let n = 0; n < 5; n++) { const yy = y + r - n * r * 0.55, w = r * (0.4 + n * 0.22); g.beginPath(); g.ellipse(x + Math.sin(t * 20 + n) * 3, yy, w, w * 0.3, 0, 0, TAU); stroke(g, 4); g.beginPath(); g.ellipse(x + Math.sin(t * 20 + n) * 3, yy, w, w * 0.3, 0, 0, TAU); stroke(g, 2.4, n % 2 ? '#e8eef8' : '#c8d4e8'); }
      } else if (o.id === 'hailVolley' || o.id === 'hailstone') {
        oval(g, x, y, 7, 7, '#e8f4ff', '#a8c4e0', 2.2); dot(g, x - 2, y - 2, 2, '#ffffff');
      } else if (o.id === 'pinecone') {
        g.save(); g.translate(x, y); g.rotate(t * 10);
        cel(g, () => ell(0, 0, 6, 8)(g), '#8a5a2a', '#6a4018', 2);
        for (const yy of [-4, 0, 4]) { g.beginPath(); g.moveTo(-5, yy); g.lineTo(5, yy + 2); stroke(g, 1.2); }
        g.restore();
      } else if (o.id === 'talkingRing') {
        g.beginPath(); g.arc(x, y, 8, 0, TAU); stroke(g, 6); g.beginPath(); g.arc(x, y, 8, 0, TAU); stroke(g, 3.6, '#f2c75a');
      } else {
        // A fireball with an ink edge and a tail.
        const r = o.radius * S;
        for (let k = 3; k >= 1; k--) { g.globalAlpha = 0.5 - k * 0.12; g.beginPath(); g.arc(x - o.vx * k * 4, y - o.vy * k * 4, r * (1 - k * 0.2), 0, TAU); g.fillStyle = '#ff8a2a'; g.fill(); }
        g.globalAlpha = 1;
        g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = '#ff8a2a'; g.fill(); stroke(g, 2.2);
        g.beginPath(); g.arc(x - r * 0.2, y - r * 0.2, r * 0.55, 0, TAU); g.fillStyle = '#fff0a0'; g.fill();
      }
    } else if (o.kind === 'wall') {
      // Bridge before dawn: a column of stones from the stage to the sky,
      // crumbling in its last second.
      const w = o.w * S;
      g.globalAlpha = o.life < 60 ? o.life / 60 : 1;
      for (let yy = (m.stage?.main.top ?? 196) * S; yy > -20; yy -= 22) {
        const off = (Math.floor(yy / 22) % 2) * 4 - 2;
        cel(g, () => { g.beginPath(); g.roundRect(x - w / 2 + off - 3, yy - 22, w + 6, 22, 3); }, '#a49a88', '#746b5c', 2.2);
      }
      g.globalAlpha = 1;
    } else if (o.kind === 'flock') {
      // A flock of sheep stampeding along a platform.
      g.save(); if (o.dir < 0) { g.translate(x, 0); g.scale(-1, 1); g.translate(-x, 0); }
      if (m.fighters[o.owner].kind.id === 'ziripot') zaldiko(g, x, y, t);
      else for (let k = 0; k < 7; k++) sheep(g, x - k * 20, y + (k % 2) * 3, 0.9, t, k);
      g.restore();
    } else if (o.kind === 'imp') {
      // A mini galtzagorri flying after the rival (or, for Basandere, a bird of the woods).
      const f = m.fighters[o.owner];
      if (f.kind.id === 'basandere') { bird(g, x, y, o.vx, t + o.x * 0.1); continue; }
      g.save(); g.translate(x, y + 8);
      drawCharacter(g, { ...f, fx: o.vx, state: 'air', grounded: false, vy: -1, move: null, t: 0 }, t + o.x * 0.1, m.R, 0.6);
      g.restore();
    }
  }
}

// ---- the pixel font ---------------------------------------------------------------------------------
//
// A 5x7 pixel font for the HUD, the damage numbers and the calls, drawn with a
// dark outline like the Flash fighting games.

const GLYPHS = {
  A: '.###.#...##...#######...##...##...#', B: '####.#...##...#####.#...##...#####.', C: '.###.#...##....#....#....#...#.###.', D: '####.#...##...##...##...##...#####.',
  E: '######....#....####.#....#....#####', F: '######....#....####.#....#....#....', G: '.###.#...##....#.####...##...#.####', H: '#...##...##...#######...##...##...#',
  I: '.###...#....#....#....#....#...###.', J: '..###...#....#....#....##..#..##...', K: '#...##..#.#.#..##...#.#..#..#.#...#', L: '#....#....#....#....#....#....#####',
  M: '#...###.###.#.##.#.##...##...##...#', N: '#...##...###..##.#.##..###...##...#', O: '.###.#...##...##...##...##...#.###.', P: '####.#...##...#####.#....#....#....',
  Q: '.###.#...##...##...##.#.##..#..##.#', R: '####.#...##...#####.#.#..#..#.#...#', S: '.#####....#.....###.....#....#####.', T: '#####..#....#....#....#....#....#..',
  U: '#...##...##...##...##...##...#.###.', V: '#...##...##...##...##...#.#.#...#..', W: '#...##...##...##.#.##.#.##.#.#.#.#.', X: '#...##...#.#.#...#...#.#.#...##...#',
  Y: '#...##...#.#.#...#....#....#....#..', Z: '#####....#...#...#...#...#....#####',
  0: '.###.#...##..###.#.###..##...#.###.', 1: '..#...##....#....#....#....#...###.', 2: '.###.#...#....#...#...#...#...#####', 3: '####.....#....#.###.....#....#####.',
  4: '...#...##..#.#.#..#.#####...#....#.', 5: '######....####.....#....##...#.###.', 6: '.###.#....#....####.#...##...#.###.', 7: '#####....#...#...#...#....#....#...',
  8: '.###.#...##...#.###.#...##...#.###.', 9: '.###.#...##...#.####....#....#.###.', '!': '..#....#....#....#....#.........#..', '?': '.###.#...#....#...#...#.........#..',
  '&': '.##..#..#..##...##.##..#.#..#..##.#',
  '%': '##..###..#...#...#...#...#..###..##', '.': '.........................##...##...', '-': '................###................', ':': '......##...##.........##...##......', ' ': '.'.repeat(35),
};

// Draws text in the pixel font: `px` screen pixels per font pixel.
export function pixelText(g, text, x, y, px = 4, colour = '#fff8e4', align = 'center', outline = '#1a120c') {
  const str = String(text).toUpperCase();
  const width = str.length * 6 * px - px;
  let x0 = Math.round(align === 'center' ? x - width / 2 : align === 'right' ? x - width : x), y0 = Math.round(y);
  const cells = [];
  for (const ch of str) {
    const gl = GLYPHS[ch] ?? GLYPHS['?'];
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (gl[r * 5 + c] === '#') cells.push([x0 + c * px, y0 + r * px]);
    x0 += 6 * px;
  }
  g.fillStyle = outline;
  for (const [cx, cy] of cells) g.fillRect(cx - px, cy - px, px * 3, px * 3);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (const [cx, cy] of cells) g.fillRect(cx + px, cy + px * 2, px, px);
  g.fillStyle = colour;
  for (const [cx, cy] of cells) g.fillRect(cx, cy, px, px);
  return width;
}

// ---- the camera ---------------------------------------------------------------------------------------
//
// Like Super Smash Flash: it follows the fighters and zooms in when they're
// close, out when they're apart, never showing past the edge of the stage.

export function makeView() { return { cam: { x: 240, y: 135, z: 1 }, shake: 0, floats: [], call: null, blasts: [] }; }

function updateCamera(view, m) {
  const cam = view.cam, Wo = m.stage.world.w, Ho = m.stage.world.h;
  // The furthest it zooms out shows the whole stage; it zooms in when the fighters are close.
  const minZ = Math.min(1, Math.max(480 / Wo, 270 / Ho) * 0.98), maxZ = 1.55;
  const live = m.fighters.filter((f) => f.state !== 'out' && f.x > -20 && f.x < Wo + 20 && f.y > -40 && f.y < Ho + 30);
  let tx = Wo / 2, ty = Ho / 2, tz = minZ;
  if (live.length) {
    const x0 = Math.min(...live.map((f) => f.x)) - 80, x1 = Math.max(...live.map((f) => f.x)) + 80;
    const y0 = Math.min(...live.map((f) => f.y - f.h)) - 60, y1 = Math.max(...live.map((f) => f.y)) + 50;
    tz = Math.max(minZ, Math.min(maxZ, 480 / (x1 - x0), 270 / (y1 - y0)));
    tx = (x0 + x1) / 2; ty = (y0 + y1) / 2;
  }
  if (cam.z === 1 && cam.x === 240 && cam.y === 135) { cam.z = tz; cam.x = tx; cam.y = ty; } // first frame
  cam.z += (tz - cam.z) * 0.06;
  const hw = 240 / cam.z, hh = 135 / cam.z;
  const cx = (v) => (Wo < hw * 2 ? Wo / 2 : Math.max(hw, Math.min(Wo - hw, v))), cy = (v) => (Ho < hh * 2 ? Ho / 2 : Math.max(hh, Math.min(Ho - hh, v)));
  cam.x += (cx(tx) - cam.x) * 0.1; cam.y += (cy(ty) - cam.y) * 0.1;
  cam.x = cx(cam.x); cam.y = cy(cam.y);
  view.shake *= 0.85;
  const sh = view.shake > 0.3 ? view.shake : 0;
  view.off = [Math.round((Math.random() - 0.5) * sh / S) * S, Math.round((Math.random() - 0.5) * sh / S) * S];
}

function applyCamera(g, view) {
  const { cam } = view, [ox, oy] = view.off ?? [0, 0];
  g.translate(W / 2 + ox, H / 2 + oy);
  g.scale(cam.z, cam.z);
  g.translate(-cam.x * S, -cam.y * S);
}

// ---- the whole scene ---------------------------------------------------------------------------------

export function drawMatch(g, m, t, fx = [], view = (m.__view ??= makeView())) {
  updateCamera(view, m);
  g.save();
  g.imageSmoothingEnabled = false;
  g.drawImage(stageLayer(m, view), 0, 0, W, H);
  g.save(); applyCamera(g, view); drawShadows(g, m); g.restore();
  // The solid layer: fighters, objects, blows, sparks.
  const behind = m.objects.filter((o) => o.kind === 'wall' || (o.kind === 'boulder' && o.landed));
  const solid = pixelPass('solid', view, (sg) => {
    drawObjects(sg, m, t, behind);
    for (const f of m.fighters) if (f.move?.kind === 'ring' || f.move?.kind === 'dash') drawMoveFx(sg, m, f, t);
    const order = [...m.fighters].sort((a, b) => (a.state === 'held') - (b.state === 'held'));
    for (const f of order) if (!(m.dark > 0 && m.darkOwner === f.i) && f.state !== 'dodge') drawBodyAt(sg, m, f, t);
    for (const f of m.fighters) if (!(f.move?.kind === 'ring' || f.move?.kind === 'dash')) drawMoveFx(sg, m, f, t);
    drawObjects(sg, m, t, m.objects.filter((o) => !behind.includes(o) && o.kind !== 'decoy'));
    drawSpecialObjects(sg, m, t);
    for (const p of fx) {
      const k = Math.max(0, p.life / p.max);
      if (p.star) star(sg, p.x, p.y, p.size * (0.6 + 0.6 * (1 - k)), p.colour, 0);
      else { sg.fillStyle = p.colour; sg.beginPath(); sg.arc(p.x, p.y, p.size * (0.6 + 0.8 * (1 - k)), 0, TAU); sg.fill(); }
    }
  });
  g.drawImage(solid, 0, 0, W, H);
  // The ghost layer: decoys, dodges, Gaueko in his own night.
  const ghosts = m.objects.filter((o) => o.kind === 'decoy').length + m.fighters.filter((f) => f.state === 'dodge' || (m.dark > 0 && m.darkOwner === f.i)).length;
  if (ghosts) {
    const ghost = pixelPass('ghost', view, (gg) => {
      for (const o of m.objects) if (o.kind === 'decoy') drawBodyAt(gg, m, { ...m.fighters[o.owner], x: o.x, y: o.y, state: 'idle', move: null, t: 0, charge: 0 }, t);
      for (const f of m.fighters) if (f.state === 'dodge' || (m.dark > 0 && m.darkOwner === f.i)) drawBodyAt(gg, m, f, t);
    });
    g.globalAlpha = 0.55; g.drawImage(ghost, 0, 0, W, H); g.globalAlpha = 1;
  }
  g.save(); applyCamera(g, view); drawSwooshes(g, m, t); drawImpacts(g, m, t); drawOverlays(g, m, t, view); drawNight(g, m); if (m.debugBoxes) drawBoxes(g, m); g.restore();
  g.restore();
  for (const f of m.fighters) offscreen(g, f, view);
}

// The moment a blow lands: a star burst where it struck, in the striker's
// element colour, bigger the harder the hit (it lasts the first frames of
// the hitstun), and a white ring that opens out from it.
function drawImpacts(g, m, t) {
  for (const d of m.fighters) {
    if (d.state !== 'hitstun' || d.t > 7) continue;
    const a = m.fighters[1 - d.i], k = d.t / 7;
    const side = Math.sign(a.x - d.x) || -d.fx;
    const x = (d.x + side * d.w * 0.35) * S, y = (d.y - d.h * 0.6) * S;
    const power = Math.min(1.6, 0.7 + Math.hypot(d.vx ?? 0, d.vy ?? 0) / 6);
    const col = ELCOL[a.kind.element] ?? '#fff4c0';
    g.save();
    g.globalAlpha = 1 - k;
    g.translate(x, y); g.rotate(d.i * 0.4 + Math.floor(d.t / 2) * 0.25);
    const n = 8, r1 = (10 + 26 * k) * power, r0 = r1 * 0.35;
    g.beginPath();
    for (let q = 0; q < n * 2; q++) { const r = q % 2 ? r0 : r1 * (q % 4 ? 0.75 : 1), ang = (q / (n * 2)) * TAU; g.lineTo(Math.cos(ang) * r, Math.sin(ang) * r); }
    g.closePath(); g.fillStyle = col; g.fill();
    g.lineWidth = 2.5; g.strokeStyle = '#fffbe8'; g.stroke();
    g.beginPath(); g.arc(0, 0, r1 * 1.25, 0, TAU); g.lineWidth = 3 * (1 - k); g.strokeStyle = 'rgba(255,255,250,0.9)'; g.stroke();
    g.restore();
  }
}

// Developer view (?debug&boxes): each body in green, a blow's reach in red
// while it can hit, in yellow before and after.
function drawBoxes(g, m) {
  g.lineWidth = 2;
  for (const f of m.fighters) {
    if (f.state === 'out') continue;
    g.strokeStyle = 'rgba(80,255,120,0.9)';
    g.strokeRect((f.x - f.w / 2) * S, (f.y - f.h) * S, f.w * S, f.h * S);
    if (!f.move || !['attack', 'special', 'super'].includes(f.state)) continue;
    const sh = m.hitShape(f);
    if (!sh.box) continue;
    g.strokeStyle = m.active(f) ? 'rgba(255,60,60,0.95)' : 'rgba(255,220,60,0.6)';
    g.strokeRect((sh.x - sh.w / 2) * S, (sh.y - sh.h / 2) * S, sh.w * S, sh.h * S);
  }
}

// Shadows on whatever is below each fighter, smaller the higher they are.
function drawShadows(g, m) {
  for (const f of m.fighters) {
    if (f.state === 'out' || (m.dark > 0 && m.darkOwner === f.i)) continue;
    const below = m.surfaceBelow(f.x, f.y - 0.5);
    if (below === null) continue;
    const up = Math.max(0, below - f.y), k = Math.max(0.25, 1 - up / 90), w = Math.max(8, f.w * 0.9) * S * k;
    g.fillStyle = `rgba(30,20,10,${0.35 * k})`;
    g.fillRect(Math.round(f.x * S - w), Math.round(below * S - 3), Math.round(w * 2), 6);
  }
}

// Shields, glows, the talking ring, invincibility, dizzy stars, tags, the
// respawn stone, floating damage numbers and the blast of a ring-out.
function drawOverlays(g, m, t, view) {
  for (const f of m.fighters) {
    if (f.state === 'out') continue;
    const x = f.x * S, y = f.y * S, hgt = f.h * S;
    if (f.state === 'respawn') {
      // The floating stone that brings you back in.
      g.fillStyle = '#1a120c'; g.fillRect(x - 26, y, 52, 10);
      g.fillStyle = '#b8ac90'; g.fillRect(x - 24, y + 2, 48, 6);
      g.fillStyle = PCOL[f.i]; g.fillRect(x - 24, y + 2, 48, 2);
    }
    if (f.state === 'shield') {
      const r = (hgt * 0.62) * (0.45 + 0.55 * f.shieldHP / m.R.shield.max);
      g.fillStyle = f.i === 0 ? 'rgba(240,170,40,0.38)' : 'rgba(90,180,240,0.38)';
      g.beginPath(); g.arc(x, y - hgt / 2, r, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2; g.stroke();
    }
    if (f.state === 'dizzy') for (let n = 0; n < 3; n++) { const q = t * 4 + (n * TAU) / 3; star(g, x + Math.cos(q) * 16, y - hgt - 6 + Math.sin(q) * 4, 5, '#fff4b0', 1.5); }
    if (f.guard > 0) { g.strokeStyle = `rgba(170,150,255,${0.6 + 0.3 * Math.sin(t * 30)})`; g.lineWidth = 3; g.beginPath(); g.ellipse(x, y - hgt / 2, f.w * S * 0.9, hgt * 0.65, 0, 0, TAU); g.stroke(); }
    if (f.shield > 0) { g.strokeStyle = `rgba(150,220,140,${0.6 + 0.3 * Math.sin(t * 12)})`; g.lineWidth = 3; g.beginPath(); g.arc(x, y - hgt / 2, hgt * 0.7, 0, TAU); g.stroke(); }
    if (f.state === 'super' || (f.move && f.state === 'special' && f.t <= f.move.startup)) { g.strokeStyle = `rgba(255,214,90,${0.5 + 0.4 * Math.sin(t * 20)})`; g.lineWidth = 3; g.strokeRect(x - f.w * S / 2 - 6, y - hgt - 6, f.w * S + 12, hgt + 12); }
    if (f.marked > 0) { g.fillStyle = '#f2c75a'; g.fillRect(x - 5, y - hgt - 24, 10, 3); g.fillRect(x - 5, y - hgt - 17, 10, 3); g.fillRect(x - 5, y - hgt - 24, 3, 10); g.fillRect(x + 2, y - hgt - 24, 3, 10); }
    // The player's tag: P1 / P2 over the head.
    if (!(m.dark > 0 && m.darkOwner === f.i)) {
      pixelText(g, `P${f.i + 1}`, x, y - hgt - 26, 2, PCOL[f.i]);
      g.fillStyle = PCOL[f.i]; g.fillRect(x - 3, y - hgt - 10, 6, 3); g.fillRect(x - 1, y - hgt - 7, 2, 3);
    }
  }
  // Damage numbers, rising.
  for (const fl of view.floats) {
    const k = (performance.now() / 1000 - fl.t0) / 0.8;
    if (k > 1) continue;
    pixelText(g, fl.text, fl.x * S, fl.y * S - 20 - k * 24, fl.px ?? 3, fl.colour ?? '#ffe0e8');
  }
  view.floats = view.floats.filter((fl) => performance.now() / 1000 - fl.t0 < 0.8);
  // Ring-out blasts: a column of light from where they left the screen.
  for (const b of view.blasts) {
    const k = (performance.now() / 1000 - b.t0) / 0.7;
    if (k > 1) continue;
    const ang = Math.atan2(135 - b.y, 240 - b.x);
    g.save(); g.translate(b.x * S, b.y * S); g.rotate(ang);
    g.globalAlpha = 1 - k;
    const len = 700, w = 70 * (1 - k * 0.6);
    g.fillStyle = b.colour; g.fillRect(0, -w / 2, len, w);
    g.fillStyle = '#ffffff'; g.fillRect(0, -w / 5, len, (w * 2) / 5);
    g.restore(); g.globalAlpha = 1;
  }
  view.blasts = view.blasts.filter((b) => performance.now() / 1000 - b.t0 < 0.7);
}

// The new specials' marks on the stage: geysers, lightning, roots, smoke, fire, shockwaves.
function drawSpecialObjects(g, m, t) {
  for (const o of m.objects) {
    const x = o.x * S, y = o.y * S;
    if (o.kind === 'strike') {
      const mv = o.move, w = o.w * S, h = (o.h || 60) * S;
      if (o.wait > 0) {
        // The warning: bubbles in the ground, a dark cloud overhead, cracks.
        if (o.sky) { oval(g, x, 30, w * 1.6, 14, '#4a4e60', '#2a2e40', 2); if (Math.floor(t * 10) % 2) { g.fillStyle = 'rgba(255,240,120,0.6)'; g.fillRect(x - w / 2, y - 3, w, 4); } }
        else for (let n = 0; n < 3; n++) dot(g, x + (n - 1) * w * 0.3, y - 3 - ((t * 30 + n * 5) % 8), 2.5, o.id === 'spring' ? '#a8dcf4' : '#8a6a3a');
        continue;
      }
      if (o.id === 'spring') {
        // A spring bursts from the ground.
        g.fillStyle = '#6ac0e8'; g.beginPath(); g.moveTo(x - w / 2, y); g.quadraticCurveTo(x - w * 0.3, y - h * 0.6, x - w * 0.1, y - h); g.lineTo(x + w * 0.1, y - h); g.quadraticCurveTo(x + w * 0.3, y - h * 0.6, x + w / 2, y); g.closePath(); g.fill(); stroke(g, 2.4);
        for (let n = 0; n < 4; n++) dot(g, x + Math.sin(t * 20 + n * 2) * w * 0.6, y - h - 4 - n * 5, 4 - n * 0.6, '#d8f0fc');
      } else if (o.sky) {
        // Lightning: a bolt from the sky to the ground.
        g.beginPath(); let px = x, py = -10; g.moveTo(px, py);
        while (py < y) { py += 22; px = x + (Math.floor(py / 22) % 2 ? -1 : 1) * w * 0.4; g.lineTo(px, Math.min(py, y)); }
        stroke(g, 8, 'rgba(255,240,140,0.5)'); g.beginPath(); px = x; py = -10; g.moveTo(px, py);
        while (py < y) { py += 22; px = x + (Math.floor(py / 22) % 2 ? -1 : 1) * w * 0.4; g.lineTo(px, Math.min(py, y)); }
        stroke(g, 3, '#fffbe0');
        star(g, x, y - 4, 14, '#fff4a0', 2);
      } else {
        // Roots erupting from the ground.
        for (let n = -1; n <= 1; n++) { g.beginPath(); g.moveTo(x + n * w * 0.3, y); g.quadraticCurveTo(x + n * w * 0.5, y - h * 0.5, x + n * w * 0.15, y - h * (0.8 + Math.abs(n) * -0.2)); stroke(g, 8); g.beginPath(); g.moveTo(x + n * w * 0.3, y); g.quadraticCurveTo(x + n * w * 0.5, y - h * 0.5, x + n * w * 0.15, y - h * (0.8 + Math.abs(n) * -0.2)); stroke(g, 5, '#7a5230'); }
        for (let n = 0; n < 3; n++) oval(g, x + (n - 1) * w * 0.3, y - h * 0.7, 4, 2.4, '#7ab04a', '#5a9035', 1.2);
      }
    } else if (o.kind === 'zone') {
      const w = o.w * S, h = o.h * S, fade = Math.min(1, o.life / 30);
      g.globalAlpha = fade;
      if (o.move?.effect === 'hold') {
        // A root snare, waiting in the grass.
        for (let n = 0; n < 4; n++) { const xx = x - w / 2 + (n + 0.5) * w / 4; g.beginPath(); g.moveTo(xx, y); g.quadraticCurveTo(xx + 4, y - 6 - (o.used ? 14 : 0), xx - 2, y - 8 - (o.used ? 18 : 0)); stroke(g, 4); g.beginPath(); g.moveTo(xx, y); g.quadraticCurveTo(xx + 4, y - 6 - (o.used ? 14 : 0), xx - 2, y - 8 - (o.used ? 18 : 0)); stroke(g, 2.4, '#6a4a2a'); }
      } else if (o.id === 'flames') {
        for (let n = 0; n < 3; n++) { const fx = x + (n - 1) * 6, fh = 10 + Math.sin(t * 20 + n * 2 + o.x) * 4; g.beginPath(); g.moveTo(fx - 5, y); g.quadraticCurveTo(fx - 4, y - fh * 0.6, fx, y - fh); g.quadraticCurveTo(fx + 4, y - fh * 0.6, fx + 5, y); g.fillStyle = n % 2 ? '#ffb040' : '#ff7030'; g.fill(); }
      } else {
        // Soot: a grey cloud, puffing.
        for (let n = 0; n < 6; n++) { const a = n * 1.1 + t * 1.5; oval(g, x + Math.cos(a) * w * 0.3, y - h * 0.5 + Math.sin(a * 1.3) * h * 0.25, w * 0.28, h * 0.32, n % 2 ? '#5a5650' : '#6e6a64', '#3e3a36', 1.6); }
      }
      g.globalAlpha = 1;
    } else if (o.kind === 'wave') {
      // A shockwave running along the ground.
      for (let n = 0; n < 3; n++) { const xx = x - o.dir * n * 8; g.beginPath(); g.moveTo(xx - 8, y); g.quadraticCurveTo(xx, y - 14 + n * 3, xx + 8, y); g.fillStyle = n ? '#a8906a' : '#c8b088'; g.fill(); stroke(g, 1.8); }
    }
  }
}

// An arrow at the edge of the screen for a fighter out of sight.
function offscreen(g, f, view) {
  if (f.state === 'out') return;
  const { cam } = view;
  const x = (f.x - cam.x) * S * cam.z + W / 2, y = (f.y - f.h / 2 - cam.y) * S * cam.z + H / 2;
  if (x >= 0 && x <= W && y >= 0 && y <= H) return;
  const ax = Math.max(22, Math.min(W - 22, x)), ay = Math.max(22, Math.min(H - 22, y));
  g.save(); g.translate(ax, ay); g.rotate(Math.atan2(y - ay, x - ax));
  g.fillStyle = '#1a120c'; g.beginPath(); g.moveTo(16, 0); g.lineTo(-8, -12); g.lineTo(-8, 12); g.fill();
  g.fillStyle = PCOL[f.i]; g.beginPath(); g.moveTo(11, 0); g.lineTo(-5, -8); g.lineTo(-5, 8); g.fill();
  g.restore();
}

// Gaueko's night: dark everywhere except a small pool of light round his rival.
function drawNight(g, m) {
  if (!(m.dark > 0)) return;
  const r = m.fighters[1 - m.darkOwner];
  const fade = Math.min(1, m.dark / 30);
  const c = cached(`night.${m.stage.world.w}`, () => { const cv = document.createElement('canvas'); cv.width = m.stage.world.w; cv.height = m.stage.world.h; return cv; });
  const d = c.getContext('2d');
  d.globalCompositeOperation = 'source-over';
  d.clearRect(0, 0, c.width, c.height);
  d.fillStyle = `rgba(6,6,20,${0.9 * fade})`; d.fillRect(0, 0, c.width, c.height);
  d.globalCompositeOperation = 'destination-out';
  const cx = r.x, cy = r.y - r.h / 2;
  const gr = d.createRadialGradient(cx, cy, 6, cx, cy, 38);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  d.fillStyle = gr; d.beginPath(); d.arc(cx, cy, 38, 0, TAU); d.fill();
  g.drawImage(c, 0, 0, m.stage.world.w * S, m.stage.world.h * S);
  const gk = m.fighters[m.darkOwner];
  if (gk.state === 'out') return;
  const dd = gk.fx < 0 ? -1 : 1;
  g.fillStyle = '#bfe8ff';
  for (const ex of [4, 10]) g.fillRect(Math.round(gk.x * S + dd * ex) - 2, Math.round((gk.y - gk.h * 0.86) * S) - 1, 4, 3);
}

// ---- the HUD: Super Smash Flash style -----------------------------------------------------------------
//
// A card per player along the bottom: portrait, name, the damage percentage
// in big digits (white when fresh, red as it climbs), stocks, the Indarra
// meter and the special. The clock on top.

const pctColour = (p) => (p < 35 ? '#fff8e4' : p < 70 ? '#ffe08a' : p < 110 ? '#ffaa50' : p < 150 ? '#ff6a40' : '#e83020');

export function drawHud(g, m, t, view, names) {
  g.save();
  g.imageSmoothingEnabled = false;
  const cx = [W / 2 - 150, W / 2 + 150];
  for (const f of m.fighters) {
    const x = cx[f.i] - 110, y = H - 78, k = f.kind;
    // The card.
    g.fillStyle = '#1a120c'; g.fillRect(x - 3, y - 3, 226, 76);
    g.fillStyle = f.i === 0 ? '#8a5e14' : '#2c6e94'; g.fillRect(x, y, 220, 70);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, y, 220, 6);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + 60, 220, 10);
    // Portrait.
    g.fillStyle = '#1a120c'; g.fillRect(x + 6, y + 6, 58, 58);
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x + 8, y + 8, 54, 54);
    const im = portraitImg(k, 108);
    if (im.complete) g.drawImage(im, x + 8, y + 8, 54, 54);
    // Name, percentage, stocks.
    pixelText(g, names[f.i], x + 70, y + 6, 2, '#fff8e4', 'left');
    const p = f.state === 'out' ? '' : `${Math.round(f.pct)}%`;
    const jitter = view.floats.some((fl) => fl.d === f.i && performance.now() / 1000 - fl.t0 < 0.15) ? 3 : 0;
    if (p) pixelText(g, p, x + 214 + (Math.random() - 0.5) * jitter, y + 22 + (Math.random() - 0.5) * jitter, 4, pctColour(f.pct), 'right');
    for (let n = 0; n < m.stocks; n++) {
      g.fillStyle = '#1a120c'; g.fillRect(x + 70 + n * 14, y + 24, 12, 12);
      g.fillStyle = n < f.stocks ? PCOL[f.i] : '#4a4038'; g.fillRect(x + 72 + n * 14, y + 26, 8, 8);
    }
    // Indarra meter and the special.
    const mt = f.meter / m.R.meter.max;
    g.fillStyle = '#1a120c'; g.fillRect(x + 70, y + 54, 144, 10);
    g.fillStyle = mt >= 1 ? (Math.floor(t * 8) % 2 ? '#ffe48a' : '#ffb830') : '#e0a020'; g.fillRect(x + 72, y + 56, Math.round(140 * mt), 6);
    const nsp = k.specials.neutral;
    if (nsp.charges) for (let n = 0; n < nsp.charges; n++) { g.fillStyle = '#1a120c'; g.fillRect(x + 70 + n * 8, y + 42, 7, 7); g.fillStyle = n < f.charges ? '#ff7a40' : '#4a4038'; g.fillRect(x + 71 + n * 8, y + 43, 5, 5); }
    else { g.fillStyle = '#1a120c'; g.fillRect(x + 70, y + 41, 10, 10); g.fillStyle = (f.cooldown[nsp.id] ?? 0) > 0 ? '#4a4038' : '#7ad860'; g.fillRect(x + 72, y + 43, 6, 6); }
  }
  // The clock.
  const secs = m.phase === 'bow' ? Math.ceil(m.matchTime / m.R.fps) : m.timeLeft();
  pixelText(g, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, W - 20, 34, 3, secs <= 10 ? '#ff6a40' : '#fff8e4', 'right');
  // The big call: PREST? HASI! KANPORA! IRABAZLEA!
  const c = view.call;
  if (c) {
    const k = (performance.now() / 1000 - c.t0);
    if (k < c.secs) {
      const pop = Math.min(1, k / 0.12), px = Math.round(c.px * (0.6 + 0.4 * pop));
      pixelText(g, c.text, W / 2, H * 0.36 - px * 3.5, px, c.colour ?? '#fff4b0');
    }
  }
  g.restore();
}

export function finish(g) {
  const v = g.createRadialGradient(W / 2, H * 0.55, H * 0.45, W / 2, H * 0.55, H * 0.95);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(10,6,2,0.22)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}
