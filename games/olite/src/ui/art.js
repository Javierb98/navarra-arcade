// Everything Piedra por piedra draws, painted in code with smooth shapes and
// soft light, in the manner of Espadas de Hispania: a warm sky with sun rays,
// Olite's towers fading into haze behind, sunlit sandstone in front, and a
// film-grain and vignette finish. No pixel art: the canvas is 2x the stage,
// so every edge is drawn at full screen resolution.
//
// Coordinates are the logical 960x540 stage (main.js scales the context).

import { makeRng } from '../core/rng.js';
import { drawPart, carvedStone } from './parts.js';

const W = 960, H = 540, SCALE = 2;

// ---- small helpers ------------------------------------------------------------

function canvas(w, h, scale = SCALE) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * scale); c.height = Math.ceil(h * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale);
  return [c, g];
}

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

const hash = (a, b = 0, c = 0) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function rgb(c) {
  if (c.startsWith('rgb')) return c.match(/[\d.]+/g).slice(0, 3).map(Number);
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
}
function shade(hex, k) { return k >= 0 ? mix(hex, '#fff6e0', k) : mix(hex, '#1e140c', -k); }

function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// A Gothic pointed arch opening, as a path.
function pointedArch(g, x, y, w, h) {
  const spring = y + w * 0.55;
  g.beginPath();
  g.moveTo(x, y + h);
  g.lineTo(x, spring);
  g.quadraticCurveTo(x, y + w * 0.12, x + w / 2, y);
  g.quadraticCurveTo(x + w, y + w * 0.12, x + w, spring);
  g.lineTo(x + w, y + h);
  g.closePath();
}

// ---- palettes -----------------------------------------------------------------

export const THEMES = {
  walls: { sky: ['#d98a3a', '#f0b45c', '#f8e0a4'], sun: [0.78, 0.2], haze: '#f1cf93', stone: '#d9b684', back: '#b98d5e', far: '#c9a377', ink: '#6a4a2e', accent: '#b23a2a' },
  gardens: { sky: ['#8fb9cf', '#d6d9bd', '#f6e2ae'], sun: [0.2, 0.18], haze: '#e8dcb4', stone: '#e0c294', back: '#b89468', far: '#b8b49a', ink: '#5d5236', accent: '#e38b2c', leaf: '#6c8f3a' },
  gallery: { sky: ['#c7702f', '#e9a150', '#f5d38f'], sun: [0.7, 0.28], haze: '#edc486', stone: '#d6ac72', back: '#a77a4c', far: '#bb9064', ink: '#5a3c22', accent: '#7b2d4b' },
  winds: { sky: ['#5f93c4', '#a9c8dc', '#eee3c6'], sun: [0.3, 0.12], haze: '#d9e0d8', stone: '#e3cda4', back: '#b79e78', far: '#9fb0b4', ink: '#4d4a44', accent: '#2e6fa7' },
  crowns: { sky: ['#6e4a7e', '#d9786a', '#f6c98a'], sun: [0.62, 0.42], haze: '#f0b58c', stone: '#dcae8c', back: '#a8765e', far: '#b47f78', ink: '#4d2c2e', accent: '#c0392b' },
  night: { sky: ['#1b1733', '#4a2a3e', '#a4523a'], sun: [0.5, 0.9], haze: '#7a3f35', stone: '#5a4038', back: '#3a2a28', far: '#402c30', ink: '#150d10', accent: '#ff9a3a' },
};

// ---- sky, haze and finish -------------------------------------------------------

function paintSky(g, th, w = W, h = H, seed = 1) {
  const rng = makeRng(seed);
  const sky = g.createLinearGradient(0, 0, 0, h);
  th.sky.forEach((c, i) => sky.addColorStop(i / (th.sky.length - 1), c));
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  const sx = w * th.sun[0], sy = h * th.sun[1];
  const sun = g.createRadialGradient(sx, sy, 6, sx, sy, w * 0.5);
  sun.addColorStop(0, 'rgba(255,250,228,0.95)'); sun.addColorStop(0.08, 'rgba(255,244,210,0.6)');
  sun.addColorStop(0.3, 'rgba(255,236,190,0.18)'); sun.addColorStop(1, 'rgba(255,236,190,0)');
  g.fillStyle = sun; g.fillRect(0, 0, w, h);
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 8; i++) {
    const a = Math.PI * (0.15 + 0.7 * rng.next()), s = 0.025 + rng.next() * 0.045;
    g.fillStyle = `rgba(255,236,196,${0.03 + rng.next() * 0.045})`;
    g.beginPath(); g.moveTo(sx, sy);
    g.lineTo(sx + Math.cos(a - s) * w * 1.4, sy + Math.sin(a - s) * w * 1.4);
    g.lineTo(sx + Math.cos(a + s) * w * 1.4, sy + Math.sin(a + s) * w * 1.4);
    g.fill();
  }
  g.restore();
  for (let i = 0; i < 12; i++) {
    g.fillStyle = `rgba(255,246,222,${0.08 + rng.next() * 0.1})`;
    g.beginPath();
    g.ellipse(rng.next() * w, h * (0.08 + rng.next() * 0.55), 70 + rng.next() * 170, 4 + rng.next() * 8, 0, 0, Math.PI * 2);
    g.fill();
  }
}

// Film grain, faint scratches and a vignette over the whole screen.
function grunge() {
  return cached('grunge', () => {
    const [c, g] = canvas(W, H);
    const rng = makeRng(77);
    for (let i = 0; i < 5200; i++) {
      g.fillStyle = rng.chance(0.6) ? `rgba(30,18,6,${0.04 + rng.next() * 0.07})` : `rgba(255,246,222,${0.03 + rng.next() * 0.05})`;
      g.fillRect(rng.next() * W, rng.next() * H, 0.6 + rng.next(), 0.6 + rng.next());
    }
    g.strokeStyle = 'rgba(255,240,210,0.045)';
    for (let i = 0; i < 16; i++) {
      const x = rng.next() * W, y = rng.next() * H;
      g.lineWidth = 0.5 + rng.next() * 0.8;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rng.next() - 0.5) * 50, y + rng.next() * 80); g.stroke();
    }
    const v = g.createRadialGradient(W / 2, H * 0.48, H * 0.38, W / 2, H * 0.48, W * 0.68);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(18,10,4,0.42)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    return c;
  });
}
export function finish(ctx) { ctx.drawImage(grunge(), 0, 0, W, H); }

// ---- Olite's skyline ----------------------------------------------------------------
//
// A loose portrait of the palace from the plain: a long curtain wall, a crowd
// of square towers of different heights (some crenellated, one with an open
// lookout, one with a stepped "crown" top), a few slender turrets with
// pointed slate roofs, and the spire of Santa María beside it.

const TOWERS = [
  { x: 0.02, w: 0.05, h: 0.52, top: 'crenel' },
  { x: 0.09, w: 0.035, h: 0.7, top: 'cone' },
  { x: 0.15, w: 0.07, h: 0.62, top: 'crenel' },
  { x: 0.25, w: 0.045, h: 0.86, top: 'gallery' },
  { x: 0.33, w: 0.08, h: 0.95, top: 'crown' },
  { x: 0.44, w: 0.04, h: 0.74, top: 'cone' },
  { x: 0.5, w: 0.09, h: 0.8, top: 'crenel' },
  { x: 0.62, w: 0.05, h: 0.66, top: 'crenel' },
  { x: 0.69, w: 0.03, h: 0.78, top: 'cone' },
  { x: 0.74, w: 0.06, h: 0.58, top: 'crenel' },
  { x: 0.83, w: 0.025, h: 1.0, top: 'spire' },
  { x: 0.88, w: 0.06, h: 0.5, top: 'crenel' },
];

function crenels(g, x, y, w, size) {
  const n = Math.max(2, Math.round(w / (size * 1.6)));
  const step = w / n;
  for (let k = 0; k < n; k++) g.rect(x + k * step, y - size, step * 0.62, size + 1);
}

export function skyline(g, x0, base, width, height, fill, { windows = null, banners = null, pole = null, t = 0, broken = false, lit = null, only = null } = {}) {
  g.fillStyle = fill;
  // Curtain wall.
  if (only !== 'banners') {
  g.beginPath();
  g.rect(x0, base - height * 0.34, width, height * 0.34 + 2);
  crenels(g, x0, base - height * 0.34, width, height * 0.035);
  g.fill();
  }
  for (const [i, tw] of TOWERS.entries()) {
    const x = x0 + tw.x * width, w = tw.w * width;
    const hh = height * tw.h * (broken ? 0.55 + 0.35 * hash(i, 3) : 1), y = base - hh;
    if (only === 'banners') { drawTowerBanner(g, i, tw, x, y, w, banners, pole ?? fill, t); continue; }
    g.beginPath();
    if (broken) {
      // Jagged, burnt-out tops.
      g.moveTo(x, base); g.lineTo(x, y + 6);
      for (let k = 1; k <= 5; k++) g.lineTo(x + (w * k) / 5, y + hash(i, k) * 14);
      g.lineTo(x + w, base); g.closePath(); g.fill();
      continue;
    }
    g.rect(x, y, w, hh);
    if (tw.top === 'crenel') crenels(g, x - w * 0.04, y, w * 1.08, w * 0.12);
    g.fill();
    g.beginPath();
    if (tw.top === 'cone') { g.moveTo(x - w * 0.12, y); g.lineTo(x + w / 2, y - w * 1.6); g.lineTo(x + w * 1.12, y); }
    if (tw.top === 'spire') { g.moveTo(x - w * 0.1, y); g.lineTo(x + w / 2, y - w * 3.4); g.lineTo(x + w * 1.1, y); }
    if (tw.top === 'gallery') {
      g.rect(x - w * 0.1, y - w * 0.55, w * 1.2, w * 0.14);
      for (let k = 0; k < 4; k++) g.rect(x - w * 0.06 + (k * w * 1.12) / 3, y - w * 0.45, w * 0.1, w * 0.45);
      g.moveTo(x - w * 0.18, y - w * 0.55); g.lineTo(x + w / 2, y - w * 1.05); g.lineTo(x + w * 1.18, y - w * 0.55);
    }
    if (tw.top === 'crown') {
      // Three stepped rings of battlements: the "crowns".
      for (let k = 0; k < 3; k++) {
        const ww = w * (1.12 - k * 0.22), xx = x + (w - ww) / 2, yy = y - k * w * 0.28;
        g.rect(xx, yy - w * 0.2, ww, w * 0.2 + 1);
        crenels(g, xx, yy - w * 0.2, ww, w * 0.1);
      }
    }
    g.fill();
    if (windows) {
      g.fillStyle = windows;
      for (let k = 0; k < 3; k++) {
        if (hash(i, k, 9) < 0.35) continue;
        const wx = x + w * (0.3 + 0.4 * hash(i, k)), wy = y + hh * (0.18 + k * 0.22);
        g.beginPath(); g.rect(wx - w * 0.06, wy, w * 0.12, w * 0.22); g.arc(wx, wy, w * 0.06, Math.PI, 0); g.fill();
      }
      g.fillStyle = fill;
    }
    if (lit) {
      // The sunlit face of each tower, and a soft shadow on the other side.
      g.fillStyle = lit;
      g.fillRect(x, y, w * 0.34, hh);
      g.fillStyle = 'rgba(30,14,6,0.12)';
      g.fillRect(x + w * 0.8, y, w * 0.2, hh);
      g.fillStyle = fill;
    }
    if (banners) drawTowerBanner(g, i, tw, x, y, w, banners, pole ?? fill, t);
  }
}

function drawTowerBanner(g, i, tw, x, y, w, colour, pole, t) {
  if (hash(i, 7) <= 0.45 || tw.top === 'spire') return;
  const px = x + w / 2, py = y - (tw.top === 'cone' ? w * 1.6 : tw.top === 'crown' ? w * 0.8 : tw.top === 'gallery' ? w * 1.05 : w * 0.12);
  const len = Math.max(18, w * 0.9);
  g.strokeStyle = pole; g.lineWidth = Math.max(1.2, w * 0.035);
  g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - len); g.stroke();
  const fw = len * 0.8, fh = len * 0.3;
  g.fillStyle = colour;
  g.beginPath(); g.moveTo(px, py - len);
  for (let k = 1; k <= 6; k++) g.lineTo(px + (fw * k) / 6, py - len + Math.sin(t * 3 + i - k * 0.7) * fh * 0.18 * (k / 6));
  for (let k = 6; k >= 0; k--) g.lineTo(px + (fw * k) / 6, py - len + fh + Math.sin(t * 3 + i - k * 0.7) * fh * 0.18 * (k / 6));
  g.fill();
}

function hills(g, y, amp, fill, seed, w = W) {
  g.fillStyle = fill;
  g.beginPath(); g.moveTo(-10, H * 3);
  for (let x = -10; x <= w + 20; x += 20) g.lineTo(x, y - amp * (0.5 + 0.5 * Math.sin(x * 0.006 + seed) * Math.sin(x * 0.013 + seed * 2)));
  g.lineTo(w + 20, H * 3); g.fill();
}

// ---- story scenes (intro, outro, facts) ------------------------------------------------

// Silhouette trees in the manner of Espadas: a broad lumpy crown, or a cypress.
function tree(g, x, y, s, colour, cypress, seed) {
  g.fillStyle = colour;
  if (cypress) {
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x - 7 * s, y - 30 * s, x, y - 62 * s); g.quadraticCurveTo(x + 7 * s, y - 30 * s, x, y); g.fill();
    return;
  }
  g.fillRect(x - 1.5 * s, y - 20 * s, 3 * s, 20 * s);
  for (let k = 0; k < 7; k++) {
    const a = hash(seed, k) * Math.PI * 2, r = (7 + hash(k, seed) * 8) * s;
    g.beginPath(); g.arc(x + Math.cos(a) * 11 * s, y - 30 * s + Math.sin(a) * 7 * s, r, 0, Math.PI * 2); g.fill();
  }
}

// The town of Olite at the palace's feet: gabled houses, chimneys, trees.
function town(g, base, colour, roofLight, seed) {
  for (let k = 0; k < 26; k++) {
    const x = k * 40 - 30 + hash(k, seed) * 10, w = 52 + hash(seed, k) * 26, hh = 26 + hash(k, 2, seed) * 34, pitch = 12 + hash(k, 3) * 12;
    g.fillStyle = colour;
    g.beginPath(); g.moveTo(x, base + 40); g.lineTo(x, base - hh); g.lineTo(x + w / 2, base - hh - pitch); g.lineTo(x + w, base - hh); g.lineTo(x + w, base + 40); g.fill();
    if (roofLight) { g.fillStyle = roofLight; g.beginPath(); g.moveTo(x, base - hh); g.lineTo(x + w / 2, base - hh - pitch); g.lineTo(x + w / 2, base - hh - pitch + 3); g.lineTo(x + 2, base - hh + 2); g.fill(); }
    if (hash(k, 4) > 0.6) { g.fillStyle = colour; g.fillRect(x + w * 0.7, base - hh - pitch - 6, 5, pitch); }
  }
  for (let k = 0; k < 9; k++) tree(g, 40 + k * 110 + hash(k, 9) * 50, base + 34, 0.9 + hash(k, 8) * 0.5, colour, hash(k, 7) > 0.55, k + seed);
  g.fillStyle = colour; g.fillRect(0, base + 30, W, H);
}

function sceneBack(name) {
  return cached(`scene.${name}`, () => {
    const night = name === 'fire', ruins = name === 'ruins';
    const th = night ? THEMES.night : ruins ? { ...THEMES.winds, sky: ['#9fb2c4', '#e3d3b8', '#f4dfb6'], sun: [0.18, 0.62] } : THEMES.walls;
    const [c, g] = canvas(W, H);
    paintSky(g, th, W, H, night ? 9 : ruins ? 4 : 2);
    // Far plain and hills, hazed.
    hills(g, 330, 40, night ? '#3a2232' : mix(th.haze, '#9a8a70', 0.35), 1);
    hills(g, 356, 22, night ? '#2e1a28' : mix(th.haze, '#8a7052', 0.5), 3);
    // Olite's palace: a hazy far copy, then the lit one.
    skyline(g, 60, 402, 840, 250, night ? '#241420' : mix(th.haze, '#8f6a4a', 0.45), { broken: ruins });
    const body = night ? '#150b12' : ruins ? '#8d8078' : '#9a6c44';
    skyline(g, 150, 424, 660, 290, body, {
      windows: night ? '#ff9a3a' : ruins ? null : '#5a3a22',
      broken: ruins,
      lit: night ? null : ruins ? mix('#8d8078', '#f4e2c4', 0.35) : mix('#9a6c44', '#ffd79a', 0.45),
    });
    // Warm light low across the walls.
    if (!night) {
      const lg = g.createLinearGradient(0, 300, 0, 440);
      lg.addColorStop(0, 'rgba(255,220,160,0)'); lg.addColorStop(1, 'rgba(255,214,150,0.22)');
      g.fillStyle = lg; g.fillRect(0, 300, W, 140);
    }
    town(g, 468, night ? '#0b0509' : ruins ? '#5a534e' : '#4a2f1c', night ? null : 'rgba(255,210,150,0.25)', 3);
    if (ruins) {
      for (let k = 0; k < 40; k++) {
        g.fillStyle = mix('#7a7169', '#b8ab98', hash(k, 9) * 0.6);
        rrect(g, hash(k, 5) * W, 488 + hash(k, 6) * 30, 12 + hash(k, 7) * 26, 9 + hash(k, 8) * 14, 3); g.fill();
      }
    }
    return c;
  });
}

// Animated bits on top of a scene: embers, banners, storks, the two masons.
export function drawScene(ctx, name, t) {
  ctx.drawImage(sceneBack(name), 0, 0, W, H);
  if (name === 'fire') {
    for (let k = 0; k < 70; k++) {
      const life = (t * 0.22 + hash(k)) % 1;
      const x = 180 + hash(k, 1) * 600 + Math.sin(t + k) * 24 * life, y = 330 - life * 330;
      ctx.fillStyle = `rgba(255,${150 + hash(k, 2) * 80 | 0},60,${(1 - life) * 0.9})`;
      ctx.beginPath(); ctx.arc(x, y, 1.2 + hash(k, 3) * 1.8, 0, Math.PI * 2); ctx.fill();
    }
    const glow = ctx.createRadialGradient(480, 280, 20, 480, 280, 440);
    glow.addColorStop(0, `rgba(255,120,40,${0.3 + Math.sin(t * 5) * 0.05})`); glow.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  }
  if (name === 'palace') {
    skyline(ctx, 150, 424, 660, 290, '#9a6c44', { banners: '#c0392b', pole: '#5a3a22', t, only: 'banners' });
    for (let k = 0; k < 3; k++) stork(ctx, ((t * 38 + k * 330) % 1250) - 140, 80 + k * 46 + Math.sin(t + k) * 8, 1, t + k, 0.75);
  }
  if (name === 'ruins') {
    const a = { x: 440, y: 506, face: 1, grounded: true, w: 28, h: 44 };
    const b = { x: 520, y: 506, face: -1, grounded: true, w: 28, h: 44 };
    ctx.save(); ctx.translate(480, 506); ctx.scale(1.6, 1.6); ctx.translate(-480, -506);
    rope(ctx, a, b, 110, t);
    climber(ctx, a, 0, t, { walk: 0, look: -1 });
    climber(ctx, b, 1, t, { walk: 0, look: -1 });
    ctx.restore();
  }
  finish(ctx);
}

// ---- level backdrops ------------------------------------------------------------------

function levelSky(theme) {
  return cached(`sky.${theme}`, () => { const [c, g] = canvas(W, H); paintSky(g, THEMES[theme], W, H, theme.length); return c; });
}

// The far view: plain, hills and the rest of the palace, hazed.
function levelFar(theme) {
  return cached(`far.${theme}`, () => {
    const th = THEMES[theme];
    const [c, g] = canvas(W, 420, 1.5);
    hills(g, 230, 50, mix(th.haze, th.far, 0.35), 2);
    skyline(g, 40, 300, 880, 220, mix(th.haze, th.far, 0.55), { lit: 'rgba(255,236,200,0.12)' });
    hills(g, 300, 20, mix(th.haze, th.far, 0.75), 5);
    g.fillStyle = mix(th.haze, th.far, 0.9); g.fillRect(0, 300, W, 120);
    return c;
  });
}

// Mid-distance towers either side, slower than the climb: a sense of height.
function levelMid(g0) {
  const key = `mid.${g0.def.id}`;
  return cached(key, () => {
    const th = THEMES[g0.def.theme];
    const hgt = Math.round((g0.mapH - H) * 0.5 + H + 200);
    const [c, g] = canvas(W, hgt, 1);
    const col = mix(th.haze, th.back, 0.45);
    for (const [side, x, w] of [[-1, -30, 150], [1, 830, 160]]) {
      g.fillStyle = col;
      g.fillRect(x, 60, w, hgt);
      crenels(g, x - 4, 60, w + 8, 12); g.fill();
      g.fillStyle = mix(th.haze, th.back, 0.62);
      for (let y = 140; y < hgt; y += 150) {
        const wx = x + w / 2 - 10;
        g.beginPath(); g.rect(wx, y, 20, 40); g.arc(wx + 10, y, 10, Math.PI, 0); g.fill();
      }
      const lg = g.createLinearGradient(x, 0, x + w, 0);
      lg.addColorStop(0, side < 0 ? 'rgba(255,236,200,0.18)' : 'rgba(0,0,0,0)'); lg.addColorStop(1, side < 0 ? 'rgba(0,0,0,0.08)' : 'rgba(255,236,200,0.12)');
      g.fillStyle = lg; g.fillRect(x, 60, w, hgt);
    }
    return c;
  });
}

// The wall right behind the climbers, one screen-high chunk at a time.
function backChunk(g0, k) {
  return cached(`back.${g0.def.id}.${k}`, () => {
    const th = THEMES[g0.def.theme], T = g0.T;
    const [c, g] = canvas(W, H);
    const y0 = k * H;
    const theme = g0.def.theme;
    // Openings cut through the back wall show the sky behind: arcades in the
    // gallery, a lookout in the winds, arched windows elsewhere.
    g.fillStyle = th.back;
    g.fillRect(0, 0, W, H);
    // Ashlar courses.
    for (let y = -(y0 % 24); y < H; y += 24) {
      const row = Math.floor((y + y0) / 24);
      g.fillStyle = 'rgba(60,35,15,0.16)'; g.fillRect(0, y, W, 1.2);
      for (let x = (row % 2) * 34; x < W; x += 68) {
        g.fillRect(x, y, 1.2, 24);
        g.fillStyle = `rgba(${hash(row, x) > 0.5 ? '255,236,200' : '40,24,10'},${0.04 + hash(x, row) * 0.05})`;
        g.fillRect(x + 1, y + 1, 67, 23);
        g.fillStyle = 'rgba(60,35,15,0.16)';
      }
    }
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    const floors = [];
    for (let r = 1; r < g0.h; r++) if (g0.grid[r].slice(1, -1).filter((ch) => '=#xcB'.includes(ch)).length >= 5) floors.push(r);
    for (let fi = 0; fi < floors.length - 1; fi++) {
      const top = floors[fi] * T + T, bottom = floors[fi + 1] * T; // the gap between two floors (world y)
      const span = bottom - top;
      if (span < T * 1.5 || bottom < y0 - T || top > y0 + H + T) continue;
      const seed = floors[fi];
      if (theme === 'gallery') {
        for (let x = 96; x < W - 96; x += 128) { pointedArch(g, x, top - y0 + 8, 88, span - 8); g.fill(); }
      } else if (theme === 'winds') {
        for (let x = 70; x < W - 70; x += 205) { pointedArch(g, x, top - y0 + 4, 150, span - 4); g.fill(); }
      } else {
        const n = theme === 'gardens' ? 4 : 3, aw = theme === 'crowns' ? 54 : 84;
        for (let j = 0; j < n; j++) {
          const x = 80 + (j + 0.25 + hash(seed, j) * 0.5) * ((W - 160) / n) - aw / 2;
          pointedArch(g, x, top - y0 + 6, aw, span - 10); g.fill();
        }
      }
    }
    // Above the top floor the climb comes out into the open sky.
    if (floors.length) {
      const sky = floors[0] * T - y0;
      if (sky > 0) {
        const fade = g.createLinearGradient(0, sky - 60, 0, sky);
        fade.addColorStop(0, '#000'); fade.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillRect(0, 0, W, Math.max(0, sky - 60));
        g.fillStyle = fade; g.fillRect(0, sky - 60, W, 60);
        g.fillStyle = '#000';
      }
    }
    g.globalCompositeOperation = 'source-over';
    // Tracery on the gallery arches, drawn over the holes.
    if (theme === 'gallery') {
      g.strokeStyle = shade(th.back, 0.15); g.lineWidth = 3;
      for (let fi = 0; fi < floors.length - 1; fi++) {
        const top = floors[fi] * T + T, bottom = floors[fi + 1] * T, span = bottom - top;
        if (span < T * 1.5 || bottom < y0 - T || top > y0 + H + T) continue;
        for (let x = 96; x < W - 96; x += 128) {
          g.beginPath(); g.arc(x + 44, top - y0 + 42, 16, 0, Math.PI * 2); g.stroke();
          for (let a = 0; a < 3; a++) { g.beginPath(); g.arc(x + 44 + Math.cos(a * 2.1 - 1.57) * 8, top - y0 + 42 + Math.sin(a * 2.1 - 1.57) * 8, 7, 0, Math.PI * 2); g.stroke(); }
          g.beginPath(); g.moveTo(x + 44, top - y0 + 58); g.lineTo(x + 44, bottom - y0); g.stroke();
        }
      }
    }
    // Ivy in the gardens.
    if (theme === 'gardens') {
      for (let k2 = 0; k2 < 26; k2++) {
        const x = hash(k, k2) * W, y = hash(k2, k) * H, len = 40 + hash(k2, 3) * 120;
        for (let j = 0; j < len; j += 7) {
          g.fillStyle = mix(th.leaf, '#2c3a18', hash(j, k2) * 0.5);
          g.beginPath(); g.ellipse(x + Math.sin(j * 0.2) * 6, y + j, 5, 3.5, hash(j) * 3, 0, Math.PI * 2); g.fill();
        }
      }
    }
    // Heraldry high on the crowns tower: the chains of Navarre.
    if (theme === 'crowns') {
      for (let k2 = 0; k2 < 2; k2++) {
        const x = 200 + k2 * 520 + hash(k, k2) * 60, y = 120 + hash(k2, k) * 300;
        shield(g, x, y, 26);
      }
    }
    // Shade: the wall is in the shadow of the ledges, darker than the stone you touch,
    // and darkest right under each floor.
    g.fillStyle = 'rgba(40,22,10,0.22)'; g.fillRect(0, 0, W, H);
    for (const r of floors) {
      const y = (r + 1) * T - y0;
      if (y < -60 || y > H + 60) continue;
      const ao = g.createLinearGradient(0, y, 0, y + 46);
      ao.addColorStop(0, 'rgba(25,12,4,0.42)'); ao.addColorStop(1, 'rgba(25,12,4,0)');
      g.fillStyle = ao; g.fillRect(0, y, W, 46);
    }
    return c;
  });
}

// Out-of-focus pillars, ivy and banners close to the camera, drifting past
// faster than the climb: the strongest cue of depth. Only at the edges.
function foreground(g0) {
  return cached(`fg.${g0.def.id}`, () => {
    const th = THEMES[g0.def.theme];
    const hgt = Math.round(g0.mapH * 1.35 + H);
    const [c, g] = canvas(W, hgt, 1);
    g.filter = 'blur(4px)';
    const rng = makeRng(g0.def.id.length * 7);
    const ink = mix(th.ink, '#120a04', 0.35);
    for (let y = 200; y < hgt; y += 380 + rng.next() * 300) {
      const left = rng.chance(0.5), x = left ? -20 + rng.next() * 30 : W - 70 - rng.next() * 30;
      const kind = rng.next();
      g.fillStyle = ink;
      if (kind < 0.45) {
        // A column with a capital.
        g.fillRect(x + 10, y, 50, 300); g.fillRect(x, y - 14, 70, 18); g.fillRect(x + 4, y - 30, 62, 16);
      } else if (kind < 0.75 || th.leaf) {
        // Hanging ivy.
        for (let j = 0; j < 40; j++) { g.beginPath(); g.ellipse(x + 30 + Math.sin(j * 0.5) * 16, y + j * 8, 11, 7, j, 0, Math.PI * 2); g.fill(); }
      } else {
        // A long banner.
        g.fillStyle = mix(th.accent, '#120a04', 0.45);
        g.beginPath(); g.moveTo(x + 10, y); g.lineTo(x + 60, y); g.lineTo(x + 60, y + 220); g.lineTo(x + 35, y + 190); g.lineTo(x + 10, y + 220); g.fill();
      }
    }
    return c;
  });
}

export function shield(g, x, y, s) {
  g.save();
  g.translate(x, y);
  g.beginPath(); g.moveTo(-s, -s); g.lineTo(s, -s); g.lineTo(s, s * 0.3); g.quadraticCurveTo(s, s * 1.1, 0, s * 1.4); g.quadraticCurveTo(-s, s * 1.1, -s, s * 0.3); g.closePath();
  g.fillStyle = '#b3261e'; g.fill();
  g.strokeStyle = '#e8b840'; g.lineWidth = s * 0.12; g.stroke();
  g.save(); g.clip();
  g.strokeStyle = '#e8b840'; g.lineWidth = s * 0.1;
  for (const [a, b, c2, d] of [[-s, -s, s, s * 1.4], [s, -s, -s, s * 1.4], [0, -s, 0, s * 1.4], [-s, s * 0.1, s, s * 0.1]]) { g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d); g.stroke(); }
  g.beginPath(); g.arc(0, s * 0.1, s * 0.18, 0, Math.PI * 2); g.fillStyle = '#2e7d4f'; g.fill();
  g.restore();
  g.restore();
}

// ---- tiles --------------------------------------------------------------------------

function tileSprite(theme, kind, v, open) {
  return cached(`tile.${theme}.${kind}.${v}.${open}`, () => {
    const th = THEMES[theme];
    const [c, g] = canvas(48, 48);
    const stone = th.stone;
    if (kind === 'X') {
      // A cracked patch of wall: something behind it?
      g.drawImage(tileSprite(theme, '#', v, open), 0, 0, 48, 48);
      g.strokeStyle = 'rgba(40,20,8,0.75)'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(10, 4); g.lineTo(18, 16); g.lineTo(14, 26); g.lineTo(24, 36); g.lineTo(20, 46);
      g.moveTo(18, 16); g.lineTo(32, 20); g.lineTo(38, 34); g.moveTo(24, 36); g.lineTo(36, 40); g.stroke();
      g.strokeStyle = 'rgba(255,240,210,0.35)'; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(11, 5); g.lineTo(19, 17); g.lineTo(33, 21); g.stroke();
      return c;
    }
    if (kind === '_' || kind === '_p') {
      g.drawImage(tileSprite(theme, '#', v, 't'), 0, 0, 48, 48);
      const down = kind === '_p';
      g.fillStyle = 'rgba(30,16,6,0.4)'; g.fillRect(5, down ? 3 : 1, 38, 6);
      const br = g.createLinearGradient(0, 0, 0, 8);
      br.addColorStop(0, down ? '#e2b04a' : '#d6a24a'); br.addColorStop(1, '#8a5a1e');
      g.fillStyle = br; rrect(g, 6, down ? 2 : -2, 36, 6, 2); g.fill();
      g.fillStyle = down ? 'rgba(255,230,140,0.9)' : 'rgba(255,240,200,0.5)'; g.fillRect(9, down ? 3 : -1, 30, 1.5);
      return c;
    }
    if (kind === '|') {
      // An iron grille set in the floor: a trapdoor.
      g.fillStyle = '#2a1e16'; g.fillRect(0, 0, 48, 48);
      g.fillStyle = '#6a4a2a'; g.fillRect(0, 0, 48, 6); g.fillRect(0, 42, 48, 6);
      for (let x = 4; x < 48; x += 9) { const gr = g.createLinearGradient(x, 0, x + 5, 0); gr.addColorStop(0, '#8a8f98'); gr.addColorStop(1, '#3e424a'); g.fillStyle = gr; g.fillRect(x, 4, 5, 40); }
      g.fillStyle = '#4e525a'; g.fillRect(0, 20, 48, 5);
      for (let x = 6; x < 48; x += 9) { g.fillStyle = '#c9ccd2'; g.beginPath(); g.arc(x + 0.5, 22.5, 1.4, 0, Math.PI * 2); g.fill(); }
      return c;
    }
    if (kind === '#') {
      const base = g.createLinearGradient(0, 0, 48, 48);
      base.addColorStop(0, shade(stone, 0.12)); base.addColorStop(1, shade(stone, -0.12));
      g.fillStyle = base; g.fillRect(0, 0, 48, 48);
      // Two courses of ashlar per tile, staggered.
      for (let row = 0; row < 2; row++) {
        const y = row * 24, off = (row + v) % 2 ? 0 : 24;
        for (let x = -24 + off; x < 48; x += 48) {
          const tone = hash(v, row, x) - 0.5;
          g.fillStyle = shade(stone, tone * 0.16); g.fillRect(x + 1.5, y + 1.5, 45, 21);
          g.fillStyle = 'rgba(255,248,226,0.35)'; g.fillRect(x + 1.5, y + 1.5, 45, 1.5);
          g.fillStyle = 'rgba(60,34,14,0.25)'; g.fillRect(x + 1.5, y + 21, 45, 1.5);
        }
      }
      for (let k = 0; k < 10; k++) { g.fillStyle = `rgba(80,50,24,${0.1 + hash(v, k) * 0.12})`; g.beginPath(); g.arc(hash(k, v) * 48, hash(v, k, 2) * 48, 0.6 + hash(k) * 0.8, 0, Math.PI * 2); g.fill(); }
      if (open.includes('t')) {
        // A sunlit coping stone along the top.
        g.fillStyle = shade(stone, 0.28); g.fillRect(0, 0, 48, 7);
        g.fillStyle = shade(stone, 0.45); g.fillRect(0, 0, 48, 2);
        g.fillStyle = 'rgba(60,34,14,0.3)'; g.fillRect(0, 7, 48, 2);
        if (theme === 'gardens' || theme === 'walls') for (let k = 0; k < 5; k++) {
          g.fillStyle = mix(th.leaf ?? '#7d8f3c', '#3d4a1c', hash(v, k) * 0.6);
          const x = hash(k, v, 5) * 48;
          g.beginPath(); g.moveTo(x - 3, 1); g.quadraticCurveTo(x, -6 - hash(k) * 4, x + 3, 1); g.fill();
        }
      }
      if (open.includes('b')) { g.fillStyle = 'rgba(40,22,10,0.35)'; g.fillRect(0, 42, 48, 6); }
      if (open.includes('l')) { g.fillStyle = 'rgba(255,240,210,0.18)'; g.fillRect(0, 0, 3, 48); }
      if (open.includes('r')) { g.fillStyle = 'rgba(40,22,10,0.22)'; g.fillRect(45, 0, 3, 48); }
    } else if (kind === '=' || kind === 'c') {
      const cracked = kind === 'c';
      const col = cracked ? shade(stone, -0.12) : stone;
      // A carved cornice slab on corbels.
      g.fillStyle = 'rgba(30,16,6,0.25)'; g.fillRect(2, 14, 44, 6);
      g.fillStyle = shade(col, -0.1);
      g.beginPath(); g.moveTo(16, 14); g.lineTo(32, 14); g.lineTo(29, 30); g.quadraticCurveTo(24, 34, 19, 30); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,240,210,0.25)'; g.fillRect(17, 15, 3, 13);
      const slab = g.createLinearGradient(0, 5, 0, 16);
      slab.addColorStop(0, shade(col, 0.12)); slab.addColorStop(1, shade(col, -0.25));
      g.fillStyle = slab; g.fillRect(0, 4, 48, 12);
      // The sunlit top surface, seen from just above: gives the ledge depth.
      const top = g.createLinearGradient(0, 0, 0, 5);
      top.addColorStop(0, shade(col, 0.55)); top.addColorStop(1, shade(col, 0.3));
      g.fillStyle = top; g.fillRect(0, 0, 48, 5);
      g.fillStyle = 'rgba(60,34,14,0.35)'; g.fillRect(0, 5, 48, 1);
      g.fillStyle = 'rgba(60,34,14,0.25)'; g.fillRect(0, 11, 48, 1);
      if (cracked) {
        g.strokeStyle = 'rgba(40,20,8,0.7)'; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(8 + v * 9, 0); g.lineTo(14 + v * 7, 7); g.lineTo(10 + v * 9, 15); g.stroke();
        g.beginPath(); g.moveTo(34 - v * 4, 0); g.lineTo(30, 9); g.lineTo(36, 15); g.stroke();
        for (let k = 0; k < 4; k++) { g.fillStyle = shade(col, -0.2); g.beginPath(); g.arc(6 + hash(k, v) * 36, 18 + hash(v, k) * 6, 1.5, 0, Math.PI * 2); g.fill(); }
      } else if (theme === 'gardens' && v === 1) {
        // A pot of flowers on some ledges.
        g.fillStyle = '#b8603a'; g.beginPath(); g.moveTo(30, 0); g.lineTo(42, 0); g.lineTo(40, -9); g.lineTo(32, -9); g.fill();
      }
    } else if (kind === 'x') {
      // Rubble: a heap of broken, dusty blocks, lighter than good stone.
      const col = mix(stone, '#e8dcc6', 0.35);
      g.fillStyle = 'rgba(40,24,10,0.25)'; g.fillRect(2, 40, 44, 8);
      const chunks = [[2, 22, 22, 24], [22, 24, 24, 22], [8, 6, 20, 18], [26, 4, 18, 20], [16, 16, 16, 12]];
      chunks.forEach(([x, y, w, h], k) => {
        const tone = hash(v, k) * 0.2 - 0.1;
        g.fillStyle = shade(col, tone);
        g.beginPath();
        g.moveTo(x + 2, y + hash(k, v) * 3); g.lineTo(x + w - 1, y + hash(v, k, 1) * 4); g.lineTo(x + w, y + h - 2); g.lineTo(x + hash(k, 2) * 3, y + h);
        g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,248,230,0.4)'; g.fillRect(x + 3, y + 1, w - 6, 1.6);
        g.strokeStyle = 'rgba(70,44,20,0.5)'; g.lineWidth = 1; g.stroke();
      });
      g.strokeStyle = 'rgba(60,34,14,0.55)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(14, 10); g.lineTo(20, 20); g.lineTo(17, 30); g.stroke();
    } else if (kind === 'B') {
      g.fillStyle = '#8a5a2e'; rrect(g, 3, 6, 42, 42, 3); g.fill();
      g.fillStyle = '#a8703c'; for (let k = 0; k < 3; k++) g.fillRect(5, 9 + k * 13, 38, 10);
      g.strokeStyle = '#5e3a1a'; g.lineWidth = 3; g.beginPath(); g.moveTo(6, 9); g.lineTo(42, 45); g.moveTo(42, 9); g.lineTo(6, 45); g.stroke();
      g.fillStyle = 'rgba(255,240,210,0.3)'; g.fillRect(3, 6, 42, 2);
      g.fillStyle = '#d9c38c'; g.fillRect(20, 6, 8, 42);
    }
    return c;
  });
}

// Soft shadows the stonework casts on the wall behind it (the sun is up and to the left).
function shadowSprite(kind) {
  return cached(`shadow.${kind}`, () => {
    const [c, g] = canvas(80, 80);
    g.filter = 'blur(5px)';
    g.fillStyle = 'rgba(25,12,4,0.55)';
    if (kind === 'slab') g.fillRect(16, 16, 48, 18); else g.fillRect(16, 16, 48, 48);
    return c;
  });
}

function drawTiles(ctx, g0, t) {
  const T = g0.T, th = g0.def.theme;
  const r0 = Math.max(0, Math.floor(g0.camY / T) - 1), r1 = Math.min(g0.h - 1, Math.ceil((g0.camY + H) / T));
  ctx.globalAlpha = 0.55;
  for (let r = r0; r <= r1; r++) {
    for (let c = 1; c < g0.w - 1; c++) {
      const ch = g0.tile(c, r);
      if (!'#=cxX_|B'.includes(ch) || ch === ' ') continue;
      const slab = ch === '=' || ch === 'c';
      ctx.drawImage(shadowSprite(slab ? 'slab' : 'block'), c * T - 16 + 9, r * T - g0.camY - 16 + 11, 80, 80);
    }
  }
  ctx.globalAlpha = 1;
  for (let r = r0; r <= r1; r++) {
    for (let c = 0; c < g0.w; c++) {
      const ch = g0.tile(c, r);
      if (!'#=cxXB_|'.includes(ch) || ch === ' ') continue;
      const open = ch === '#' || ch === 'X'
        ? ['t', 'b', 'l', 'r'].filter((s, k) => !'#xXB_|'.includes(g0.tile(c + [0, 0, -1, 1][k], r + [-1, 1, 0, 0][k]))).join('')
        : '';
      let kind = ch;
      if (ch === '_') kind = g0.plates.find((p) => p.c === c && p.r === r && (p.pressed || p.latched)) ? '_p' : '_';
      let x = c * T, y = r * T - g0.camY;
      if (ch === 'c') {
        const cr = g0.crumbles.get(`${c},${r}`);
        if (cr && cr.t > 0) x += Math.sin(t * 60 + c) * 1.5 * (cr.t / 0.55);
      }
      ctx.drawImage(tileSprite(th, kind, (c * 7 + r * 3) % 3, open), x, y, T, T);
    }
  }
  // Open trapdoors: just the frame, grille swung away.
  for (const gt of g0.gates) {
    if (!gt.open) continue;
    const x = gt.c * T, y = gt.r * T - g0.camY;
    if (y < -T || y > H) continue;
    ctx.fillStyle = '#4a3420'; ctx.fillRect(x, y, T, 5); ctx.fillRect(x, y + T - 5, T, 5);
    ctx.fillStyle = 'rgba(20,10,4,0.35)'; ctx.fillRect(x, y + 5, T, T - 10);
  }
  // Crumbled ledges: a few pebbles left hanging in the gap.
  for (const [key, cr] of g0.crumbles) {
    if (!cr.broken) continue;
    const [c, r] = key.split(',').map(Number);
    ctx.fillStyle = 'rgba(80,50,26,0.35)';
    ctx.fillRect(c * T + 4, r * T - g0.camY, 40, 3);
  }
}

// ---- things in the world ----------------------------------------------------------------

function goldStone(ctx, x, y, t) {
  const bob = Math.sin(t * 3 + x) * 3;
  ctx.save(); ctx.translate(x, y + bob);
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
  glow.addColorStop(0, 'rgba(255,230,140,0.55)'); glow.addColorStop(1, 'rgba(255,230,140,0)');
  ctx.fillStyle = glow; ctx.fillRect(-26, -26, 52, 52);
  const gr = ctx.createLinearGradient(-12, -10, 12, 10);
  gr.addColorStop(0, '#fff1b0'); gr.addColorStop(0.45, '#f0c24a'); gr.addColorStop(1, '#a8741a');
  ctx.fillStyle = gr; rrect(ctx, -12, -9, 24, 18, 3); ctx.fill();
  ctx.strokeStyle = 'rgba(120,70,10,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.moveTo(0, -9); ctx.lineTo(0, 0); ctx.stroke();
  const sp = (t * 1.3 + x * 0.01) % 1;
  ctx.fillStyle = `rgba(255,255,240,${1 - sp})`;
  ctx.beginPath(); ctx.moveTo(6, -14 - sp * 4); ctx.lineTo(7.5, -11); ctx.lineTo(11, -10); ctx.lineTo(7.5, -9); ctx.lineTo(6, -6); ctx.lineTo(4.5, -9); ctx.lineTo(1, -10); ctx.lineTo(4.5, -11); ctx.fill();
  ctx.restore();
}

function orange(ctx, x, y, t) {
  ctx.save(); ctx.translate(x, y + Math.sin(t * 2.5 + x) * 2);
  const gr = ctx.createRadialGradient(-3, -3, 1, 0, 0, 10);
  gr.addColorStop(0, '#ffd08a'); gr.addColorStop(0.5, '#f08a1e'); gr.addColorStop(1, '#b8540c');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4f7a2a'; ctx.beginPath(); ctx.ellipse(4, -9, 5, 2.4, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function heart(ctx, x, y, s, fill = '#d0342c') {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(0, 6); ctx.bezierCurveTo(-11, -2, -6, -11, 0, -5); ctx.bezierCurveTo(6, -11, 11, -2, 0, 6); ctx.closePath();
  const gr = ctx.createLinearGradient(0, -10, 0, 6); gr.addColorStop(0, shade(fill, 0.35)); gr.addColorStop(1, fill);
  ctx.fillStyle = gr; ctx.fill();
  ctx.restore();
}

function banner(ctx, x, y, t) {
  ctx.fillStyle = '#5a3d22'; ctx.fillRect(x - 2, y - 110, 4, 110);
  ctx.fillStyle = '#e8b840'; ctx.beginPath(); ctx.arc(x, y - 112, 4, 0, Math.PI * 2); ctx.fill();
  const w = 70, h = 46;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + 2, y - 106);
  for (let k = 0; k <= 10; k++) ctx.lineTo(x + 2 + (k * w) / 10, y - 106 + Math.sin(t * 4 - k * 0.6) * 4 * (k / 10));
  for (let k = 10; k >= 0; k--) ctx.lineTo(x + 2 + (k * w) / 10, y - 106 + h + Math.sin(t * 4 - k * 0.6) * 4 * (k / 10));
  ctx.closePath();
  ctx.fillStyle = '#b3261e'; ctx.fill();
  ctx.clip();
  ctx.strokeStyle = '#e8b840'; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 2, y - 106); ctx.lineTo(x + w, y - 60); ctx.moveTo(x + w, y - 106); ctx.lineTo(x + 2, y - 60);
  ctx.moveTo(x + w / 2, y - 110); ctx.lineTo(x + w / 2, y - 56); ctx.moveTo(x, y - 83); ctx.lineTo(x + w, y - 83);
  ctx.stroke();
  ctx.fillStyle = '#2e7d4f'; ctx.beginPath(); ctx.arc(x + w / 2, y - 83, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function scaffold(ctx, m, camY) {
  const y = m.y - camY;
  ctx.strokeStyle = 'rgba(120,90,50,0.9)'; ctx.lineWidth = 2;
  for (const x of [m.x + 8, m.x + m.w - 8]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 600); ctx.stroke(); }
  const gr = ctx.createLinearGradient(0, y, 0, y + 14);
  gr.addColorStop(0, '#d8a466'); gr.addColorStop(1, '#8c5c2c');
  ctx.fillStyle = gr; rrect(ctx, m.x, y, m.w, 14, 3); ctx.fill();
  ctx.fillStyle = 'rgba(70,40,16,0.5)';
  for (let x = m.x + 12; x < m.x + m.w - 4; x += 24) ctx.fillRect(x, y + 2, 1.5, 10);
}

export function stork(ctx, x, y, dir, t, s = 1, flee = false) {
  ctx.save(); ctx.translate(x, y); ctx.scale(dir * s, s);
  const flap = Math.sin(t * (flee ? 18 : 9));
  // Legs trailing, neck forward, beak red.
  ctx.strokeStyle = '#d2452c'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-10, 2); ctx.lineTo(-26, 6); ctx.moveTo(-10, 4); ctx.lineTo(-25, 9); ctx.stroke();
  ctx.fillStyle = '#f7f3ea';
  ctx.beginPath(); ctx.ellipse(0, 0, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(10, -3); ctx.quadraticCurveTo(16, -6, 20, -5); ctx.lineTo(20, -1); ctx.quadraticCurveTo(15, 0, 10, 2); ctx.fill();
  ctx.beginPath(); ctx.arc(21, -3, 3.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d2452c'; ctx.beginPath(); ctx.moveTo(23, -4); ctx.lineTo(34, -1); ctx.lineTo(23, -1); ctx.fill();
  ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(22, -4, 0.9, 0, Math.PI * 2); ctx.fill();
  // Wings: white with black flight feathers.
  for (const k of [1, -1]) {
    ctx.fillStyle = k > 0 ? '#f7f3ea' : '#e6e0d2';
    ctx.beginPath(); ctx.moveTo(-6, -2); ctx.quadraticCurveTo(0, -2 - flap * 18 * k, 8, -2 - flap * 20 * k); ctx.lineTo(4, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.moveTo(-8, -2); ctx.quadraticCurveTo(-8, -2 - flap * 18 * k, -1, -2 - flap * 22 * k); ctx.lineTo(-4, -1); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function roofTile(ctx, x, y, wobble) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(wobble);
  const gr = ctx.createLinearGradient(-10, 0, 10, 0);
  gr.addColorStop(0, '#c86a3c'); gr.addColorStop(0.5, '#e58a52'); gr.addColorStop(1, '#9c4a26');
  ctx.fillStyle = gr; rrect(ctx, -10, -6, 20, 14, 5); ctx.fill();
  ctx.restore();
}

// ---- the stonemasons ---------------------------------------------------------------------

const MASONS = [
  { beret: '#b3261e', tunic: '#f1e6d0', sash: '#e8902a', skin: '#f0c9a0', hose: '#4a3a44' },
  { beret: '#1f3150', tunic: '#e3dac6', sash: '#3a8fd0', skin: '#e2b48a', hose: '#3e3a4c' },
];

export function climber(ctx, b, i, t, anim = {}) {
  const M = MASONS[i];
  const x = b.x, y = b.y, f = b.face || 1;
  if (b.safe > 0 && Math.floor(t * 12) % 2) ctx.globalAlpha = 0.45;
  ctx.save(); ctx.translate(x, y);
  // Soft shadow on the ground.
  if (b.grounded) { ctx.fillStyle = 'rgba(30,16,6,0.25)'; ctx.beginPath(); ctx.ellipse(0, 0, 14, 3.5, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.scale(f, 1);
  const walk = anim.walk ?? 0, air = !b.grounded;
  const swingL = air ? -0.5 : Math.sin(walk) * 0.6, swingR = air ? 0.7 : -Math.sin(walk) * 0.6;
  // Legs.
  ctx.strokeStyle = M.hose; ctx.lineWidth = 5.5; ctx.lineCap = 'round';
  for (const [s, dx] of [[swingL, -3], [swingR, 3]]) {
    ctx.beginPath(); ctx.moveTo(dx, -17); ctx.lineTo(dx + Math.sin(s) * 10, -3 - (air ? 4 : 0)); ctx.stroke();
    ctx.fillStyle = '#3b2616'; ctx.beginPath(); ctx.ellipse(dx + Math.sin(s) * 10 + 2, -2 - (air ? 4 : 0), 4.5, 2.6, 0, 0, Math.PI * 2); ctx.fill();
  }
  // Back arm.
  const hang = b.hanging;
  ctx.strokeStyle = shade(M.tunic, -0.15); ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(-3, -31); ctx.lineTo(hang ? -4 : -9 - Math.sin(walk) * 3, hang ? -50 : -20); ctx.stroke();
  // Tunic, lit from the upper left.
  const tg = ctx.createLinearGradient(-10, -34, 10, -14);
  tg.addColorStop(0, shade(M.tunic, 0.3)); tg.addColorStop(1, shade(M.tunic, -0.18));
  ctx.fillStyle = tg;
  ctx.beginPath(); ctx.moveTo(-8, -34); ctx.quadraticCurveTo(0, -37, 8, -34); ctx.lineTo(10, -15); ctx.quadraticCurveTo(0, -12, -10, -15); ctx.closePath(); ctx.fill();
  ctx.fillStyle = M.sash; ctx.fillRect(-10, -21, 20, 4.5);
  ctx.fillStyle = shade(M.sash, -0.25); ctx.beginPath(); ctx.moveTo(-9, -17); ctx.lineTo(-12, -9); ctx.lineTo(-7, -10); ctx.fill();
  // Head, beret (txapela), eye.
  ctx.fillStyle = M.skin; ctx.beginPath(); ctx.arc(1, -40.5, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,240,220,0.4)'; ctx.beginPath(); ctx.arc(-1.5, -43, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = M.beret; ctx.beginPath(); ctx.ellipse(0, -46.5, 9, 4.2, -0.12, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -50, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a1a10'; ctx.beginPath(); ctx.arc(4.6, anim.look < 0 ? -43 : -41, 1.2, 0, Math.PI * 2); ctx.fill();
  if (b.stun > 0) { ctx.strokeStyle = '#ffe07a'; ctx.lineWidth = 1.5; for (let k = 0; k < 3; k++) { const a = t * 8 + k * 2.1; ctx.beginPath(); ctx.arc(Math.cos(a) * 10, -56 + Math.sin(a) * 3, 2, 0, Math.PI * 2); ctx.stroke(); } }
  // Front arm with the mallet.
  const hitK = b.hitT > 0 ? 1 - b.hitT / 0.25 : -1;
  const ang = hang ? -2.6 : hitK >= 0 ? -2.2 + hitK * 2.8 : air ? -1.9 : 0.5 + Math.sin(walk) * 0.25;
  ctx.save(); ctx.translate(4, -31); ctx.rotate(ang);
  ctx.strokeStyle = M.tunic; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 12); ctx.stroke();
  ctx.fillStyle = M.skin; ctx.beginPath(); ctx.arc(0, 13, 2.6, 0, Math.PI * 2); ctx.fill();
  if (!hang) {
    ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(0, 13); ctx.lineTo(0, 27); ctx.stroke();
    ctx.fillStyle = '#9aa0a8'; rrect(ctx, -6, 25, 12, 8, 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(-5, 26, 10, 1.6);
  }
  ctx.restore();
  if (hitK >= 0 && hitK < 0.8) {
    ctx.strokeStyle = `rgba(255,248,220,${0.7 * (1 - hitK)})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(4, -31, 32, -1.6, -1.6 + hitK * 2.4); ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// A hemp rope between the two, sagging with its slack.
export function rope(ctx, a, b, len, t, taut = false) {
  const ax = a.x, ay = a.y - 19, bx = b.x, by = b.y - 19;
  const d = Math.hypot(bx - ax, by - ay);
  const slack = Math.max(0, len - d);
  const mx = (ax + bx) / 2, my = (ay + by) / 2 + Math.min(80, slack * 0.55) + Math.sin(t * 2) * (slack > 10 ? 2 : 0);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#6b4a24'; ctx.lineWidth = taut ? 3.6 : 3;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by); ctx.stroke();
  ctx.strokeStyle = '#d9b777'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(ax, ay - 0.5); ctx.quadraticCurveTo(mx, my - 0.5, bx, by - 0.5); ctx.stroke();
  ctx.setLineDash([]);
}

// ---- the whole level ---------------------------------------------------------------------

export function drawLevel(ctx, g0, t, view) {
  const th = THEMES[g0.def.theme], cam = g0.camY, T = g0.T;
  ctx.drawImage(levelSky(g0.def.theme), 0, 0, W, H);
  // The plain drops away as you climb.
  const climbed = g0.mapH - H - cam;
  ctx.drawImage(levelFar(g0.def.theme), 0, 250 + climbed * 0.16, W, 420);
  const mid = levelMid(g0);
  ctx.drawImage(mid, 0, -((cam * 0.5)) - 100, W, mid.height);
  // Back wall chunks.
  const k0 = Math.floor(cam / H);
  for (let k = k0; k <= k0 + 1; k++) if (k * H < g0.mapH) ctx.drawImage(backChunk(g0, k), 0, k * H - cam, W, H);
  // Sunlight falling across the wall.
  const sun = ctx.createLinearGradient(0, 0, W, H);
  sun.addColorStop(0, 'rgba(255,226,170,0.16)'); sun.addColorStop(0.6, 'rgba(255,226,170,0)'); sun.addColorStop(1, 'rgba(30,16,40,0.12)');
  ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);

  // Shafts of sunlight through the arches, drifting slowly.
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 3; k++) {
    const x = ((k * 360 + t * 6) % (W + 400)) - 200;
    const sh = ctx.createLinearGradient(x, 0, x + 260, H);
    sh.addColorStop(0, 'rgba(255,226,170,0)'); sh.addColorStop(0.5, 'rgba(255,226,170,0.07)'); sh.addColorStop(1, 'rgba(255,226,170,0)');
    ctx.fillStyle = sh;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 120, 0); ctx.lineTo(x + 380, H); ctx.lineTo(x + 260, H); ctx.fill();
  }
  ctx.restore();
  // The missing parts of the palace, glowing on the wall until they're restored.
  for (const sl of g0.slots) {
    const y = (sl.r + 1) * T - cam;
    if (y < -60 || y > H + 160 || !sl.part) continue;
    drawPart(ctx, sl.part, sl.x, y, sl.filled ? 'done' : 'ghost', t, 1);
  }
  // The climbers' shadows on the wall.
  for (const b of g0.climbers) {
    ctx.fillStyle = 'rgba(20,10,4,0.16)';
    ctx.beginPath(); ctx.ellipse(b.x + 9, b.y - cam - 18, 12, 24, 0.1, 0, Math.PI * 2); ctx.fill();
  }
  for (const m of g0.movers) scaffold(ctx, m, cam);
  drawTiles(ctx, g0, t);
  // Loose roof tiles, wobbling before they drop.
  for (const d of g0.droppers) if (d.y - cam > -40 && d.y - cam < H) roofTile(ctx, d.x, d.y - cam + 6, d.warn > 0 ? Math.sin(t * 40) * 0.25 : 0);
  for (const p of g0.drops) roofTile(ctx, p.x, p.y - cam, p.vy * 0.002);
  for (const it of g0.items) {
    if (it.taken || it.y - cam < -40 || it.y - cam > H + 40) continue;
    const y = it.y - cam;
    if (it.type === 'o') orange(ctx, it.x, y, t);
    else heart(ctx, it.x, y + Math.sin(t * 3) * 2, 1.3);
  }
  banner(ctx, g0.flag.x, g0.flag.y - cam, t);

  // Climbers, and the rope between them.
  ctx.save(); ctx.translate(0, -cam);
  if (g0.players === 2) rope(ctx, g0.climbers[0], g0.climbers[1], g0.ropeLen, t, g0.reeling);
  g0.climbers.forEach((b, i) => climber(ctx, b, i, t, view?.anim?.[i] ?? {}));
  for (const s of g0.storks) stork(ctx, s.x, s.y, s.dir, g0.t + s.x * 0.01, 1, s.flee);
  // Carved stones: waiting on the floor, or held up overhead.
  for (const p of g0.pieces) if (!p.placed) carvedStone(ctx, p.x, p.y + (p.held == null ? Math.sin(t * 3 + p.i) * 2 : 0), t, p.held == null);
  ctx.restore();

  // Close, blurred foreground.
  const fg = foreground(g0);
  ctx.globalAlpha = 0.6;
  ctx.drawImage(fg, 0, -(cam * 1.35) - 200, W, fg.height);
  ctx.globalAlpha = 1;

  // Wind streaks.
  if (g0.wind?.on) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
    for (let k = 0; k < 24; k++) {
      const y = hash(k, 3) * H, len = 40 + hash(k) * 80;
      const x = ((t * 700 * g0.wind.dir + hash(k, 1) * W * 2) % (W + 200) + W + 200) % (W + 200) - 100;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - g0.wind.dir * len / 2, y - 4, x - g0.wind.dir * len, y); ctx.stroke();
    }
  }
  // Haze at the bottom of the view: depth.
  const haze = ctx.createLinearGradient(0, H * 0.7, 0, H);
  haze.addColorStop(0, 'rgba(0,0,0,0)'); haze.addColorStop(1, `${mix(th.haze, th.haze, 0).replace('rgb', 'rgba').replace(')', ',0.22)')}`);
  ctx.fillStyle = haze; ctx.fillRect(0, H * 0.7, W, H * 0.3);
  heightMeter(ctx, g0);
}

// How far up the tower you are: a slim gauge on the right with the banner at
// the top, each climber's marker and the missing parts.
function heightMeter(ctx, g0) {
  const x = W - 18, y0 = 70, y1 = H - 40, T = g0.T;
  const at = (y) => y1 - (1 - y / g0.mapH) * (y1 - y0);
  ctx.fillStyle = 'rgba(28,18,10,0.5)'; rrect(ctx, x - 5, y0 - 8, 10, y1 - y0 + 16, 5); ctx.fill();
  ctx.fillStyle = 'rgba(255,240,210,0.25)'; ctx.fillRect(x - 1, y0, 2, y1 - y0);
  ctx.fillStyle = '#b3261e'; ctx.fillRect(x, y0 - 14, 9, 6); ctx.fillStyle = '#e8d7b0'; ctx.fillRect(x - 1, y0 - 14, 1.5, 14);
  for (const sl of g0.slots) {
    const y = at((sl.r + 1) * T);
    ctx.fillStyle = sl.filled ? '#f2c75a' : 'rgba(242,199,90,0.35)';
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
  }
  g0.climbers.forEach((b, i) => {
    const y = at(b.y);
    ctx.fillStyle = i ? '#3a8fd0' : '#e8902a';
    ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x - 13, y - 5); ctx.lineTo(x - 13, y + 5); ctx.fill();
  });
}

// Particles: dust, chips, sparkles, feathers.
export function drawFx(ctx, fx, camY) {
  for (const p of fx) {
    const a = Math.max(0, p.life / p.max);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.colour;
    ctx.beginPath();
    if (p.kind === 'spark') { ctx.arc(p.x, p.y - camY, 2.2 * a + 0.5, 0, Math.PI * 2); }
    else if (p.kind === 'feather') { ctx.ellipse(p.x, p.y - camY, 4, 1.6, p.life * 5, 0, Math.PI * 2); }
    else if (p.kind === 'text') { ctx.globalAlpha = a; ctx.font = 'bold 16px "Palatino Linotype", Palatino, Georgia, serif'; ctx.textAlign = 'center'; ctx.fillStyle = p.colour; ctx.fillText(p.text, p.x, p.y - camY); continue; }
    else ctx.rect(p.x - p.size / 2, p.y - camY - p.size / 2, p.size, p.size);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function clearArt() { cache.clear(); }
