// The parts of the palace the masons restore, the then-and-now paintings
// shown after each climb, and the portraits for the workshop talks. Painted
// in code with smooth shapes, like the rest of art.js.
//
// drawPart draws a part with its bottom centre at (x, y), in one of three
// modes: 'ghost' (a glowing outline on the wall, still missing), 'done'
// (carved stone, restored) or 'ruin' (broken, for the 1813 painting).

import { makeRng } from '../core/rng.js';

const STONE = '#dcc39a', STONE_D = '#9c7f58', INK = '#5a4128', GOLD = '#f2c75a';

function rgb(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) { const A = rgb(a), B = rgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }

function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function archPath(g, x, y, w, h) {
  const spring = y + w * 0.55;
  g.moveTo(x, y + h); g.lineTo(x, spring);
  g.quadraticCurveTo(x, y + w * 0.12, x + w / 2, y);
  g.quadraticCurveTo(x + w, y + w * 0.12, x + w, spring);
  g.lineTo(x + w, y + h);
}
function merlons(g, x, y, w, n, mh) {
  const step = w / n;
  for (let k = 0; k < n; k++) g.rect(x + k * step + step * 0.15, y - mh, step * 0.7, mh + 1);
}

// Fill and outline in the part's current mode.
function style(g, mode, t) {
  if (mode === 'ghost') {
    const a = 0.55 + Math.sin(t * 3) * 0.25;
    g.fillStyle = `rgba(255,222,140,${0.1 + a * 0.08})`;
    g.strokeStyle = `rgba(255,214,110,${a})`;
    g.lineWidth = 2.2; g.setLineDash([6, 4]);
    return false;
  }
  g.setLineDash([]);
  g.lineWidth = 1.4;
  g.strokeStyle = mode === 'ruin' ? '#3b2a1e' : INK;
  const gr = g.createLinearGradient(-50, -120, 50, 0);
  gr.addColorStop(0, mode === 'ruin' ? '#8a7a68' : mix(STONE, '#fff6e0', 0.35));
  gr.addColorStop(1, mode === 'ruin' ? '#4e4036' : STONE_D);
  g.fillStyle = gr;
  return true;
}
const paint = (g) => { g.fill(); g.stroke(); };

const PARTS = {
  crenels(g, mode, t) {
    style(g, mode, t);
    g.beginPath(); g.rect(-50, -42, 100, 42);
    if (mode === 'ruin') { g.moveTo(-50, -42); g.rect(-46, -58, 16, 16); } else merlons(g, -50, -42, 100, 4, 24);
    paint(g);
    if (mode !== 'ghost') { g.fillStyle = 'rgba(40,24,10,0.25)'; for (let k = 0; k < 4; k++) g.fillRect(-50 + k * 25 + 3.5, -40, 18, 3); }
  },
  slit(g, mode, t) {
    style(g, mode, t);
    g.beginPath(); g.rect(-32, -104, 64, 104); paint(g);
    g.setLineDash([]);
    g.fillStyle = mode === 'ghost' ? 'rgba(255,214,110,0.3)' : '#2a1c12';
    g.beginPath(); g.rect(-4, -90, 8, 70); g.rect(-15, -62, 30, 7); g.fill();
    if (mode === 'done') { g.strokeStyle = 'rgba(255,246,222,0.5)'; g.beginPath(); g.moveTo(-6, -90); g.lineTo(-6, -20); g.stroke(); }
  },
  shield(g, mode, t) {
    const s = 32;
    g.save(); g.translate(0, -76);
    g.beginPath(); g.moveTo(-s, -s); g.lineTo(s, -s); g.lineTo(s, s * 0.3); g.quadraticCurveTo(s, s * 1.1, 0, s * 1.4); g.quadraticCurveTo(-s, s * 1.1, -s, s * 0.3); g.closePath();
    if (mode === 'ghost') { style(g, mode, t); paint(g); g.restore(); return; }
    g.setLineDash([]);
    g.fillStyle = mode === 'ruin' ? '#5a2a22' : '#b3261e'; g.fill();
    g.strokeStyle = mode === 'ruin' ? '#6a5a3a' : '#e8b840'; g.lineWidth = 4; g.stroke();
    g.save(); g.clip();
    g.lineWidth = 3.5;
    for (const [a, b, c, d] of [[-s, -s, s, s * 1.4], [s, -s, -s, s * 1.4], [0, -s, 0, s * 1.4], [-s, s * 0.1, s, s * 0.1]]) { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
    g.beginPath(); g.arc(0, s * 0.1, 6, 0, Math.PI * 2); g.fillStyle = '#2e7d4f'; g.fill();
    g.restore(); g.restore();
  },
  orange(g, mode, t) {
    style(g, mode, t);
    g.beginPath(); g.moveTo(-30, -24); g.lineTo(30, -24); g.lineTo(24, 0); g.lineTo(-24, 0); g.closePath(); paint(g);
    if (mode === 'ghost') { g.beginPath(); g.arc(0, -72, 30, 0, Math.PI * 2); g.fill(); g.stroke(); return; }
    g.strokeStyle = '#6a4a2a'; g.lineWidth = 6; g.setLineDash([]);
    g.beginPath(); g.moveTo(0, -24); g.lineTo(0, -58); g.stroke();
    if (mode === 'ruin') {
      g.lineWidth = 2.5; for (const a of [-2.2, -1.6, -1, -0.5]) { g.beginPath(); g.moveTo(0, -56); g.lineTo(Math.cos(a) * 30, -56 + Math.sin(a) * 30); g.stroke(); }
      return;
    }
    for (let k = 0; k < 9; k++) { const a = k * 0.7; g.fillStyle = mix('#4f7a2a', '#2c4a18', (k % 3) / 3); g.beginPath(); g.arc(Math.cos(a) * 18, -74 + Math.sin(a) * 12, 16, 0, Math.PI * 2); g.fill(); }
    for (let k = 0; k < 7; k++) { g.fillStyle = '#f0901e'; g.beginPath(); g.arc(Math.cos(k * 1.9) * 20, -72 + Math.sin(k * 1.9) * 14, 4.5, 0, Math.PI * 2); g.fill(); }
  },
  pergola(g, mode, t) {
    style(g, mode, t);
    const wood = mode === 'ghost' ? null : mode === 'ruin' ? '#4a3a2a' : '#9a6a3a';
    if (wood) g.fillStyle = wood;
    g.beginPath(); g.rect(-46, -112, 7, 112); g.rect(39, -112, 7, 112); g.rect(-54, -118, 108, 8);
    if (mode !== 'ruin') for (let k = 0; k < 5; k++) g.rect(-50 + k * 24, -126, 5, 16);
    paint(g);
    if (mode === 'done') {
      for (let k = 0; k < 22; k++) { g.fillStyle = mix('#5d8a32', '#2f4a18', (k % 4) / 4); g.beginPath(); g.ellipse(-50 + (k * 37) % 100, -112 + ((k * 13) % 50), 7, 4.5, k, 0, Math.PI * 2); g.fill(); }
      for (const x of [-26, 18]) for (let k = 0; k < 6; k++) { g.fillStyle = '#6b2d5e'; g.beginPath(); g.arc(x + (k % 2) * 5, -98 + Math.floor(k / 2) * 5, 3, 0, Math.PI * 2); g.fill(); }
    }
  },
  cistern(g, mode, t) {
    style(g, mode, t);
    g.beginPath(); g.ellipse(0, -8, 38, 10, 0, 0, Math.PI * 2); g.rect(-38, -44, 76, 36); paint(g);
    g.beginPath(); g.ellipse(0, -44, 38, 10, 0, 0, Math.PI * 2); paint(g);
    if (mode !== 'ghost') { g.fillStyle = mode === 'ruin' ? '#2a2018' : '#2e6f9e'; g.beginPath(); g.ellipse(0, -44, 28, 6, 0, 0, Math.PI * 2); g.fill(); }
    style(g, mode, t);
    g.beginPath(); g.rect(-34, -112, 6, 68); g.rect(28, -112, 6, 68); archPath(g, -34, -128, 68, 20); paint(g);
  },
  arch(g, mode, t) {
    style(g, mode, t);
    g.beginPath(); archPath(g, -50, -128, 100, 128); g.closePath();
    if (mode === 'ruin') { g.beginPath(); g.rect(-50, -70, 16, 70); g.rect(34, -54, 16, 54); }
    paint(g);
    if (mode !== 'ruin') {
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); archPath(g, -36, -110, 72, 110); g.closePath(); g.fill();
      g.globalCompositeOperation = 'source-over';
      if (mode === 'ghost') { g.beginPath(); archPath(g, -36, -110, 72, 110); g.stroke(); }
      else { g.strokeStyle = 'rgba(60,34,14,0.45)'; for (let k = 1; k < 6; k++) { const a = Math.PI + (k / 6) * Math.PI; g.beginPath(); g.moveTo(Math.cos(a) * 36, -64 + Math.sin(a) * 50); g.lineTo(Math.cos(a) * 50, -64 + Math.sin(a) * 64); g.stroke(); } }
    }
  },
  tracery(g, mode, t) {
    PARTS.arch(g, mode === 'ghost' ? 'ghost' : mode, t);
    if (mode === 'ruin') return;
    style(g, mode, t);
    g.lineWidth = mode === 'ghost' ? 2 : 4; g.fillStyle = 'rgba(0,0,0,0)';
    if (mode === 'done') g.strokeStyle = STONE;
    g.beginPath(); g.arc(0, -78, 20, 0, Math.PI * 2); g.stroke();
    for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(Math.cos(k * 2.09 - 1.57) * 9, -78 + Math.sin(k * 2.09 - 1.57) * 9, 8, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(0, -58); g.lineTo(0, 0); g.stroke();
  },
  plaster(g, mode, t) {
    style(g, mode, t);
    if (mode === 'done') g.fillStyle = '#efe4cc';
    g.beginPath(); g.rect(-46, -108, 92, 92); paint(g);
    if (mode === 'ruin') return;
    g.lineWidth = mode === 'ghost' ? 1.5 : 1.8;
    if (mode === 'done') g.strokeStyle = '#9a7a4a';
    // An eight-pointed star lattice, as in Mudéjar plasterwork.
    for (const [cx, cy] of [[-23, -85], [23, -85], [-23, -39], [23, -39], [0, -62]]) {
      g.beginPath();
      for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4, r = k % 2 ? 9 : 18; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      g.closePath(); g.stroke();
    }
  },
  lookout(g, mode, t) {
    style(g, mode, t);
    g.beginPath(); g.rect(-54, -12, 108, 12); g.rect(-58, -112, 116, 12);
    for (const x of [-54, -20, 14, 48]) g.rect(x, -100, 6, 88);
    if (mode === 'ruin') { g.beginPath(); g.rect(-54, -12, 108, 12); g.rect(-54, -60, 6, 48); g.rect(14, -44, 6, 32); }
    paint(g);
    if (mode === 'done') { g.strokeStyle = 'rgba(60,34,14,0.5)'; for (const x of [-48, -14, 20]) { g.beginPath(); archPath(g, x, -100, 28, 20); g.stroke(); } }
  },
  vane(g, mode, t) {
    style(g, mode, t);
    const a = mode === 'done' ? Math.sin(t * 0.8) * 0.5 : 0;
    g.lineWidth = mode === 'ghost' ? 2 : 3;
    if (mode !== 'ghost') g.strokeStyle = mode === 'ruin' ? '#3b2a1e' : '#3a3a42';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, mode === 'ruin' ? -50 : -120); g.stroke();
    if (mode === 'ruin') return;
    g.beginPath(); g.moveTo(-16, -84); g.lineTo(16, -84); g.stroke();
    g.fillStyle = mode === 'ghost' ? 'rgba(255,222,140,0.25)' : '#3a3a42';
    g.font = 'bold 11px Georgia, serif'; g.textAlign = 'center';
    if (mode === 'done') { g.fillText('N', 0, -90 + 0); g.fillText('S', 0, -70); }
    g.save(); g.translate(0, -108); g.scale(Math.cos(a), 1);
    g.beginPath(); g.moveTo(-34, 0); g.lineTo(26, 0); g.lineTo(26, -6); g.lineTo(40, 2); g.lineTo(26, 10); g.lineTo(26, 4); g.lineTo(-24, 4);
    g.lineTo(-24, 12); g.lineTo(-38, 12); g.closePath();
    g.fillStyle = mode === 'ghost' ? 'rgba(255,222,140,0.25)' : '#c9a24a'; g.fill(); g.stroke();
    g.restore();
    g.beginPath(); g.arc(0, -122, 4, 0, Math.PI * 2); g.fill();
  },
  spire(g, mode, t) {
    style(g, mode, t);
    if (mode === 'done') g.fillStyle = '#5a5f6e';
    g.beginPath();
    if (mode === 'ruin') { g.moveTo(-46, 0); g.lineTo(-30, -40); g.lineTo(-12, -24); g.lineTo(6, -52); g.lineTo(46, 0); }
    else { g.moveTo(-46, 0); g.lineTo(0, -128); g.lineTo(46, 0); }
    g.closePath(); paint(g);
    if (mode === 'done') {
      g.save(); g.clip();
      g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
      for (let y = -120; y < 0; y += 9) for (let x = -46; x < 46; x += 10) { g.beginPath(); g.arc(x + ((y / 9) % 2) * 5, y, 5, 0, Math.PI); g.stroke(); }
      g.fillStyle = 'rgba(255,240,210,0.18)'; g.beginPath(); g.moveTo(-46, 0); g.lineTo(0, -128); g.lineTo(-8, 0); g.fill();
      g.restore();
      g.fillStyle = GOLD; g.beginPath(); g.arc(0, -132, 5, 0, Math.PI * 2); g.fill();
    }
  },
  crown1(g, mode, t) { crownRing(g, mode, t, 104, 26); },
  crown2(g, mode, t) { crownRing(g, mode, t, 84, 24); },
  crown3(g, mode, t) { crownRing(g, mode, t, 64, 22); },
};

function crownRing(g, mode, t, w, h) {
  style(g, mode, t);
  g.beginPath(); g.rect(-w / 2, -h - 30, w, h + 30);
  if (mode === 'ruin') { g.rect(-w / 2, -h - 44, w * 0.2, 14); } else merlons(g, -w / 2, -h - 30, w, Math.round(w / 20), 16);
  paint(g);
  if (mode === 'done') {
    g.fillStyle = 'rgba(40,24,10,0.22)'; g.fillRect(-w / 2, -30, w, 5);
    g.fillStyle = 'rgba(255,240,210,0.3)'; g.fillRect(-w / 2, -h - 30, w, 3);
  }
}

export function drawPart(g, id, x, y, mode, t = 0, s = 1) {
  const fn = PARTS[id];
  if (!fn) return;
  g.save(); g.translate(x, y); g.scale(s, s);
  if (mode === 'ghost') {
    const glow = g.createRadialGradient(0, -60, 10, 0, -60, 90);
    glow.addColorStop(0, `rgba(255,220,130,${0.16 + Math.sin(t * 3) * 0.05})`); glow.addColorStop(1, 'rgba(255,220,130,0)');
    g.fillStyle = glow; g.fillRect(-90, -150, 180, 170);
  }
  fn(g, mode, t);
  g.setLineDash([]);
  g.restore();
}

// ---- then and now ------------------------------------------------------------------
//
// A small painting of each climb's part of the palace in three eras.

const ERA_SKY = {
  then: ['#e59a45', '#f6d690', '#fbe9bf'],
  ruin: ['#2f2630', '#7a4a3a', '#c87848'],
  now: ['#7fb2d8', '#bcd6e2', '#eef0e2'],
};

function eraSky(g, era, w, h) {
  const sky = g.createLinearGradient(0, 0, 0, h);
  ERA_SKY[era].forEach((c, i, a) => sky.addColorStop(i / (a.length - 1), c));
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  if (era !== 'ruin') {
    const sun = g.createRadialGradient(w * 0.78, h * 0.22, 2, w * 0.78, h * 0.22, w * 0.5);
    sun.addColorStop(0, 'rgba(255,250,228,0.9)'); sun.addColorStop(0.15, 'rgba(255,244,210,0.35)'); sun.addColorStop(1, 'rgba(255,244,210,0)');
    g.fillStyle = sun; g.fillRect(0, 0, w, h);
  }
  g.fillStyle = era === 'ruin' ? '#3a2a24' : era === 'then' ? '#a88a52' : '#8e9a6a';
  g.fillRect(0, h * 0.82, w, h * 0.18);
}

function stoneFill(g, era, x0, x1) {
  const gr = g.createLinearGradient(x0, 0, x1, 0);
  if (era === 'ruin') { gr.addColorStop(0, '#6e5e50'); gr.addColorStop(1, '#3e322a'); }
  else { gr.addColorStop(0, era === 'then' ? '#f0d8a8' : '#e6d4b0'); gr.addColorStop(1, era === 'then' ? '#b88e5a' : '#a8906a'); }
  return gr;
}

function towerShape(g, x, base, w, hgt, top, era, seed) {
  const y = base - hgt;
  g.beginPath();
  if (era === 'ruin') {
    const rng = makeRng(seed);
    g.moveTo(x, base); g.lineTo(x, y + 12);
    for (let k = 1; k <= 5; k++) g.lineTo(x + (w * k) / 5, y + rng.next() * hgt * 0.25);
    g.lineTo(x + w, base);
    g.closePath(); g.fill();
    return;
  }
  g.rect(x, y, w, hgt);
  if (top === 'crenel') merlons(g, x - 2, y, w + 4, Math.max(3, Math.round(w / 12)), w * 0.14);
  if (top === 'spire') { g.moveTo(x - 3, y); g.lineTo(x + w / 2, y - w * 1.3); g.lineTo(x + w + 3, y); }
  if (top === 'crowns') for (let k = 0; k < 3; k++) { const ww = w * (1.1 - k * 0.22), xx = x + (w - ww) / 2, yy = y - k * w * 0.26; g.rect(xx, yy - w * 0.18, ww, w * 0.18 + 1); merlons(g, xx, yy - w * 0.18, ww, 4, w * 0.1); }
  if (top === 'lookout') { g.rect(x - 4, y - w * 0.5, w + 8, w * 0.1); for (let k = 0; k < 4; k++) g.rect(x + (k * w) / 3 - 2, y - w * 0.42, 4, w * 0.42); g.moveTo(x - 6, y - w * 0.5); g.lineTo(x + w / 2, y - w * 1.1); g.lineTo(x + w + 6, y - w * 0.5); }
  g.fill();
}

function flagOn(g, x, y, t) {
  g.strokeStyle = '#4a3420'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 26); g.stroke();
  g.fillStyle = '#b3261e'; g.beginPath(); g.moveTo(x, y - 26); g.quadraticCurveTo(x + 9, y - 24 + Math.sin(t * 4) * 2, x + 18, y - 25); g.lineTo(x + 18, y - 15); g.quadraticCurveTo(x + 9, y - 14 + Math.sin(t * 4) * 2, x, y - 16); g.fill();
}

function people(g, n, y, w, seed, colour) {
  const rng = makeRng(seed);
  g.fillStyle = colour;
  for (let k = 0; k < n; k++) {
    const x = 20 + rng.next() * (w - 40), s = 0.8 + rng.next() * 0.3;
    g.beginPath(); g.arc(x, y - 16 * s, 3.2 * s, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(x - 4 * s, y); g.lineTo(x - 3 * s, y - 12 * s); g.lineTo(x + 3 * s, y - 12 * s); g.lineTo(x + 4 * s, y); g.fill();
  }
}

function smoke(g, w, h, t) {
  for (let k = 0; k < 14; k++) {
    const life = (t * 0.12 + k / 14) % 1, x = w * (0.2 + 0.6 * ((k * 37) % 100) / 100) + Math.sin(t + k) * 10;
    g.fillStyle = `rgba(40,34,36,${0.35 * (1 - life)})`;
    g.beginPath(); g.arc(x, h * 0.55 - life * h * 0.5, 10 + life * 26, 0, Math.PI * 2); g.fill();
  }
}

export function drawReveal(g, level, era, w, h, t) {
  g.save();
  g.beginPath(); g.rect(0, 0, w, h); g.clip();
  eraSky(g, era, w, h);
  const base = h * 0.84;
  g.fillStyle = stoneFill(g, era, 0, w);
  if (level === 'walls') {
    g.beginPath(); g.rect(0, base - h * 0.34, w, h * 0.34);
    if (era !== 'ruin') merlons(g, 0, base - h * 0.34, w, 16, h * 0.05);
    g.fill();
    for (const [x, tw] of [[0.1, 0.12], [0.45, 0.14], [0.8, 0.12]]) towerShape(g, x * w, base, tw * w, h * 0.55, 'crenel', era, x * 100);
    if (era === 'then') { flagOn(g, 0.52 * w, base - h * 0.62, t); people(g, 3, base - h * 0.34, w, 3, 'rgba(60,40,24,0.8)'); }
  } else if (level === 'gardens') {
    g.beginPath(); g.rect(w * 0.08, base - h * 0.42, w * 0.84, h * 0.42); g.fill();
    for (let k = 0; k < 4; k++) {
      const x = w * (0.18 + k * 0.21), y = base - h * 0.42;
      g.fillStyle = era === 'ruin' ? '#4a3a2e' : '#8a5a34'; g.fillRect(x - 12, y - 10, 24, 10);
      if (era === 'ruin') { g.strokeStyle = '#2e2420'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x - 8, y - 30); g.moveTo(x, y - 10); g.lineTo(x + 6, y - 28); g.stroke(); }
      else {
        g.fillStyle = '#6a4a2a'; g.fillRect(x - 2, y - 26, 4, 16);
        g.fillStyle = era === 'then' ? '#4f7a2a' : '#5d8a36'; g.beginPath(); g.arc(x, y - 34, 15, 0, Math.PI * 2); g.fill();
        if (era === 'then') { g.fillStyle = '#f0901e'; for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(x - 8 + j * 5, y - 36 + (j % 2) * 7, 2.6, 0, Math.PI * 2); g.fill(); } }
      }
      g.fillStyle = stoneFill(g, era, 0, w);
    }
    if (era === 'then') people(g, 4, base - h * 0.42, w, 7, 'rgba(90,40,50,0.8)');
  } else if (level === 'gallery') {
    g.beginPath(); g.rect(w * 0.04, base - h * 0.6, w * 0.92, h * 0.6); g.fill();
    g.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 5; k++) {
      if (era === 'ruin' && k % 2) { g.beginPath(); g.rect(w * (0.08 + k * 0.18), base - h * 0.6, w * 0.13, h * 0.6); g.fill(); continue; }
      g.beginPath(); archPath(g, w * (0.08 + k * 0.18), base - h * 0.52, w * 0.13, h * 0.52); g.closePath(); g.fill();
    }
    g.globalCompositeOperation = 'destination-over';
    eraSky(g, era, w, h);
    g.globalCompositeOperation = 'source-over';
    if (era !== 'ruin') {
      g.strokeStyle = era === 'then' ? '#f0d8a8' : '#e6d4b0'; g.lineWidth = 2;
      for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(w * (0.08 + k * 0.18 + 0.065), base - h * 0.38, w * 0.03, 0, Math.PI * 2); g.stroke(); }
    }
    if (era === 'then') people(g, 4, base, w, 11, 'rgba(70,30,50,0.85)');
  } else if (level === 'winds') {
    towerShape(g, w * 0.4, base, w * 0.2, h * 0.4, 'lookout', era, 5);
    if (era === 'then') flagOn(g, w * 0.5, base - h * 0.4 - w * 0.22, t);
  } else {
    towerShape(g, w * 0.39, base, w * 0.22, h * 0.36, 'crowns', era, 8);
    if (era !== 'ruin') flagOn(g, w * 0.5, base - h * 0.36 - w * 0.2, t);
  }
  if (era === 'ruin') {
    smoke(g, w, h, t);
    g.fillStyle = 'rgba(20,10,8,0.25)'; g.fillRect(0, 0, w, h);
  }
  if (era === 'now') people(g, 5, h * 0.97, w, 21, 'rgba(40,50,70,0.7)');
  g.restore();
}

// ---- workshop portraits ----------------------------------------------------------------

const LOOKS = {
  aitziber: { skin: '#e9bf98', hair: '#b9b3aa', top: '#6b4a3a', scarf: '#2f5d6b', beret: null },
  inigo: { skin: '#f0c9a0', hair: '#3a2a1e', top: '#f1e6d0', sash: '#e8902a', beret: '#b3261e' },
  maite: { skin: '#e2b48a', hair: '#4a2e1c', top: '#e3dac6', sash: '#3a8fd0', beret: '#1f3150', braid: true },
};

export function portrait(g, who, x, y, s = 1, t = 0) {
  const L = LOOKS[who];
  g.save(); g.translate(x, y); g.scale(s, s);
  g.beginPath(); g.arc(0, 0, 50, 0, Math.PI * 2);
  const bg = g.createRadialGradient(-10, -16, 4, 0, 0, 52);
  bg.addColorStop(0, '#fbf0d6'); bg.addColorStop(1, '#d9c294');
  g.fillStyle = bg; g.fill();
  g.save(); g.clip();
  const bob = Math.sin(t * 2) * 1.2;
  // Shoulders and top.
  g.fillStyle = L.top; g.beginPath(); g.ellipse(0, 52 + bob, 40, 30, 0, Math.PI, 0); g.fill();
  if (L.sash) { g.fillStyle = L.sash; g.fillRect(-40, 38 + bob, 80, 6); }
  if (L.scarf) { g.fillStyle = L.scarf; g.beginPath(); g.moveTo(-22, 26 + bob); g.lineTo(22, 26 + bob); g.lineTo(0, 44 + bob); g.fill(); }
  // Head.
  g.fillStyle = L.skin; g.fillRect(-6, 14 + bob, 12, 12);
  g.beginPath(); g.ellipse(0, -2 + bob, 19, 22, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = L.hair;
  if (who === 'aitziber') { g.beginPath(); g.ellipse(0, -16 + bob, 21, 12, 0, Math.PI, 0); g.fill(); g.beginPath(); g.arc(0, -26 + bob, 8, 0, Math.PI * 2); g.fill(); }
  else { g.beginPath(); g.ellipse(0, -12 + bob, 19, 9, 0, Math.PI, 0); g.fill(); }
  if (L.braid) { g.beginPath(); g.ellipse(17, 14 + bob, 4, 12, 0.3, 0, Math.PI * 2); g.fill(); }
  if (L.beret) { g.fillStyle = L.beret; g.beginPath(); g.ellipse(-2, -20 + bob, 23, 9, -0.12, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(-2, -29 + bob, 3, 0, Math.PI * 2); g.fill(); }
  // Face: eyes that blink now and then, a smile.
  const blink = (t * 0.6 + (who.length % 3) * 0.3) % 4 < 0.12;
  g.fillStyle = '#2a1a10';
  for (const ex of [-7, 7]) { g.beginPath(); g.ellipse(ex, -2 + bob, 2.2, blink ? 0.4 : 2.6, 0, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#8a4a34'; g.lineWidth = 1.8; g.beginPath(); g.arc(0, 6 + bob, 6, 0.2, Math.PI - 0.2); g.stroke();
  if (who === 'aitziber') { g.strokeStyle = 'rgba(120,70,50,0.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-14, 4 + bob); g.lineTo(-11, 6 + bob); g.moveTo(14, 4 + bob); g.lineTo(11, 6 + bob); g.stroke(); }
  g.fillStyle = 'rgba(230,120,100,0.25)'; for (const cx of [-11, 11]) { g.beginPath(); g.arc(cx, 6 + bob, 4, 0, Math.PI * 2); g.fill(); }
  g.restore();
  g.strokeStyle = '#8a6a3a'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 50, 0, Math.PI * 2); g.stroke();
  g.restore();
}

// A carved stone, carried or waiting to be picked up.
export function carvedStone(g, x, y, t, glow = true) {
  g.save(); g.translate(x, y);
  if (glow) {
    const gl = g.createRadialGradient(0, 0, 2, 0, 0, 28);
    gl.addColorStop(0, `rgba(255,226,140,${0.45 + Math.sin(t * 4) * 0.12})`); gl.addColorStop(1, 'rgba(255,226,140,0)');
    g.fillStyle = gl; g.fillRect(-28, -28, 56, 56);
  }
  const gr = g.createLinearGradient(-14, -12, 14, 12);
  gr.addColorStop(0, '#fff3c8'); gr.addColorStop(0.45, '#e9c46a'); gr.addColorStop(1, '#a8741a');
  g.fillStyle = gr; rrect(g, -14, -11, 28, 22, 3); g.fill();
  g.strokeStyle = 'rgba(110,64,10,0.7)'; g.lineWidth = 1.2;
  g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.moveTo(-6, 0); g.lineTo(6, 0); g.moveTo(0, -6); g.lineTo(0, 6); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(-12, -9, 24, 2);
  g.restore();
}
