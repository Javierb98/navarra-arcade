// Everything Salinas de Oro draws, painted in code with smooth shapes and
// warm light, like the other Navarra games: the salt pans terraced down a
// sunny hillside, the spring and its wooden channel, the stone store, the
// salt workers and their donkey, sun, clouds and summer storms. No pixel
// art: the canvas is 2x the 960x540 stage.

import { makeRng } from '../core/rng.js';

const W = 960, H = 540, SCALE = 2;
// World metres to screen: a gentle three-quarter view of the hillside.
export const X = (x) => 24 + x * 57;
export const Y = (y) => 92 + y * 49;
export const U = 50; // pixels per metre, roughly, for figures

function canvas(w, h, scale = SCALE) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * scale); c.height = Math.ceil(h * scale);
  const g = c.getContext('2d'); g.scale(scale, scale);
  return [c, g];
}
const cache = new Map();
const cached = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
function rgb(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function mix(a, b, t) { const A = rgb(a), B = rgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }
const shade = (c, k) => (k >= 0 ? mix(c, '#fff6e4', k) : mix(c, '#1a120c', -k));
function glow(g, x, y, r, colour, a = 1) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, colour.replace('A', a)); gr.addColorStop(1, colour.replace('A', 0));
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
}

// ---- the hillside, painted once ------------------------------------------------------------

function paintLand(layout) {
  const [c, g] = canvas(W, H);
  const rng = makeRng(4);
  // Sky (only a strip shows above the hill) and the far hills of the Valdizarbe.
  const sky = g.createLinearGradient(0, 0, 0, 110);
  sky.addColorStop(0, '#7fb2da'); sky.addColorStop(1, '#e8e2c4');
  g.fillStyle = sky; g.fillRect(0, 0, W, 130);
  const hill = (y, amp, fill, seed) => { g.fillStyle = fill; g.beginPath(); g.moveTo(0, 140); for (let x = 0; x <= W; x += 12) g.lineTo(x, y - amp * (0.5 + 0.5 * Math.sin(x * 0.008 + seed) * Math.cos(x * 0.013 + seed))); g.lineTo(W, 140); g.fill(); };
  hill(70, 40, '#a9b89a', 1); hill(90, 26, '#8ea27a', 3);
  // A few village roofs and the church on the ridge.
  for (let k = 0; k < 7; k++) { const x = 600 + k * 34; g.fillStyle = '#e6d4b0'; g.fillRect(x, 68, 28, 18); g.fillStyle = '#b25a3a'; g.beginPath(); g.moveTo(x - 3, 69); g.lineTo(x + 14, 58); g.lineTo(x + 31, 69); g.fill(); }
  g.fillStyle = '#d9c09a'; g.fillRect(716, 36, 14, 50); g.fillStyle = '#b25a3a'; g.beginPath(); g.moveTo(714, 37); g.lineTo(723, 26); g.lineTo(732, 37); g.fill();
  // The hillside: dry summer grass and earth, terraced.
  const ground = g.createLinearGradient(0, 95, 0, H);
  ground.addColorStop(0, '#c9b07a'); ground.addColorStop(1, '#b89a64');
  g.fillStyle = ground; g.fillRect(0, 95, W, H);
  for (let k = 0; k < 900; k++) { const x = rng.next() * W, y = 95 + rng.next() * (H - 95); g.strokeStyle = rng.chance(0.5) ? 'rgba(120,96,50,0.25)' : 'rgba(240,226,180,0.3)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rng.range(-2, 2), y - rng.range(3, 7)); g.stroke(); }
  // Terrace walls under each row of beds: dry-stone retaining walls.
  for (const row of [0, 1, 2]) {
    const y = Y(layout.beds.find((b) => b.row === row).y + 1.5) + 14;
    g.fillStyle = '#a8946e'; g.fillRect(X(2.4), y, X(15.4) - X(2.4), 12);
    for (let x = X(2.4); x < X(15.4); x += 18) { g.fillStyle = mix('#b8a47c', '#8a7654', rng.next()); g.beginPath(); g.roundRect(x + 1, y + 1 + (Math.floor(x / 18) % 2) * 2, 16, 8, 3); g.fill(); }
    g.fillStyle = 'rgba(40,24,10,0.25)'; g.fillRect(X(2.4), y + 12, X(15.4) - X(2.4), 4);
  }
  // Paths: a beaten track down the left to the store.
  g.fillStyle = 'rgba(220,200,150,0.6)';
  g.beginPath(); g.moveTo(X(1.4), Y(1.3)); g.quadraticCurveTo(X(2.4), Y(4.5), X(1.6), Y(8.6)); g.lineTo(X(0.6), Y(8.6)); g.quadraticCurveTo(X(1.4), Y(4.5), X(0.6), Y(1.3)); g.fill();
  // The spring: a stone well-head with a little pool.
  const sp = layout.spring;
  g.fillStyle = '#8a8070'; g.beginPath(); g.ellipse(X(sp.x), Y(sp.y), 34, 16, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#5e8a96'; g.beginPath(); g.ellipse(X(sp.x), Y(sp.y) - 2, 26, 11, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.ellipse(X(sp.x) - 6, Y(sp.y) - 5, 10, 3, 0, 0, Math.PI * 2); g.fill();
  // Olive and almond trees dotted about.
  for (const [x, y, s] of [[0.6, 2.2, 1], [15.7, 2.5, 0.9], [15.6, 6.0, 1.1], [0.4, 4.6, 0.8]]) tree(g, X(x), Y(y), s, rng);
  return c;
}

function tree(g, x, y, s, rng) {
  g.fillStyle = 'rgba(40,24,10,0.25)'; g.beginPath(); g.ellipse(x + 6, y + 4, 26 * s, 8 * s, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#6a5038'; g.lineWidth = 5 * s; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x - 4, y - 16 * s, x + 2, y - 26 * s); g.stroke();
  for (let k = 0; k < 14; k++) { const a = rng.next() * Math.PI * 2, r = rng.next() * 18 * s; g.fillStyle = mix('#8a9a58', '#5a6e38', rng.next()); g.beginPath(); g.arc(x + Math.cos(a) * r, y - 36 * s + Math.sin(a) * r * 0.6, (7 + rng.next() * 6) * s, 0, Math.PI * 2); g.fill(); }
}

// The wooden channel from the spring along the top, with a branch to each bed's sluice.
function channel(g, s, t) {
  const top = Y(1.3), sp = s.L.spring;
  const flowing = s.beds.some((b) => b.sluice);
  const plank = (x0, y0, x1, y1, w) => {
    g.strokeStyle = '#7a5530'; g.lineWidth = w + 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = '#9a7040'; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = flowing ? '#6aa6b4' : '#8aa0a0'; g.lineWidth = w - 4; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    if (flowing) { g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.5; g.setLineDash([5, 9]); g.lineDashOffset = -t * 40; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.setLineDash([]); }
  };
  plank(X(sp.x) + 20, Y(sp.y), X(15), top, 10);
  // Down the side to the lower terraces.
  plank(X(15.2), top, X(15.2), Y(5.9), 8);
  for (const b of s.beds) {
    const y = b.row === 0 ? top : Y(b.y - 0.35);
    if (b.row > 0) plank(X(15.2), y, X(b.x + b.w / 2), y, 7);
    // Short spout down to the sluice.
    plank(X(b.x + b.w / 2), y, X(b.x + b.w / 2), Y(b.y) - 2, 6);
  }
}

// ---- the beds ---------------------------------------------------------------------------------

function bed(g, s, b, t) {
  const x = X(b.x), y = Y(b.y), w = X(b.x + b.w) - x, h = Y(b.y + b.h) - y;
  if (!b.open) {
    // An unbuilt plot: pegged out, waiting.
    g.fillStyle = 'rgba(90,64,30,0.08)'; g.fillRect(x + 4, y + 4, w - 8, h - 8);
    g.strokeStyle = 'rgba(90,64,30,0.25)'; g.setLineDash([4, 7]); g.lineWidth = 1.5; g.strokeRect(x + 4, y + 4, w - 8, h - 8); g.setLineDash([]);
    for (const [px, py] of [[x + 4, y + 4], [x + w - 4, y + 4], [x + 4, y + h - 4], [x + w - 4, y + h - 4]]) { g.fillStyle = 'rgba(110,80,44,0.6)'; g.fillRect(px - 1.5, py - 5, 3, 6); }
    return;
  }
  // Stone rim with a lit top edge, then the clay floor.
  g.fillStyle = 'rgba(40,24,10,0.3)'; g.beginPath(); g.roundRect(x - 2, y + 4, w + 6, h + 4, 6); g.fill();
  g.fillStyle = '#c8b690'; g.beginPath(); g.roundRect(x - 4, y - 4, w + 8, h + 8, 6); g.fill();
  g.fillStyle = '#e4d6b2'; g.fillRect(x - 3, y - 4, w + 6, 3);
  const floor = g.createLinearGradient(x, y, x, y + h);
  floor.addColorStop(0, '#9a8a70'); floor.addColorStop(1, '#b8a888');
  g.fillStyle = floor; g.fillRect(x, y, w, h);
  // Salt crystals forming as the water goes: pale flakes that thicken.
  // Salt only shows once the water is shallow: first a pale film, then white crystals.
  const saltK = Math.pow(Math.min(1, b.salt / 30), 0.6) * Math.max(0, 1 - Math.min(1, b.water) * 1.6);
  if (b.salt > 0 && saltK > 0.02) {
    const grey = 1 - b.quality;
    const base = mix('#fbfaf4', '#a8a49a', grey);
    const rng = makeRng(b.i * 31 + 7);
    g.globalAlpha = saltK;
    g.fillStyle = base; g.fillRect(x, y, w, h);
    for (let k = 0; k < 90; k++) {
      g.fillStyle = k % 3 ? mix(base, '#ffffff', 0.6) : mix(base, '#dcd6c8', 0.4);
      g.beginPath(); g.ellipse(x + 3 + rng.next() * (w - 6), y + 3 + rng.next() * (h - 6), 1.5 + rng.next() * 3, 1 + rng.next() * 1.5, rng.next() * 3, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    // Flor de sal: just dried, the top crust shimmers gold. Rake it now!
    if (s.isFlor(b)) {
      const k = 1 - b.dry / s.R.quality.flor;
      g.save(); g.globalCompositeOperation = 'lighter';
      const sh = g.createLinearGradient(x + ((t * 220) % (w + 120)) - 120, y, x + ((t * 220) % (w + 120)) - 40, y + h);
      sh.addColorStop(0, 'rgba(255,214,90,0)'); sh.addColorStop(0.5, `rgba(255,214,90,${0.55 * k})`); sh.addColorStop(1, 'rgba(255,214,90,0)');
      g.fillStyle = sh; g.fillRect(x, y, w, h);
      g.restore();
      g.strokeStyle = `rgba(255,210,80,${0.5 + 0.5 * Math.sin(t * 14)})`; g.lineWidth = 3; g.strokeRect(x - 2, y - 2, w + 4, h + 4);
    }
    // White salt sparkles in the sun.
    if (b.water === 0 && b.quality >= 0.9) for (let k = 0; k < 6; k++) { const ph = (t * 1.5 + k * 0.37 + b.i) % 1; if (ph < 0.25) { const sx = x + ((k * 53 + b.i * 17) % 100) / 100 * w, sy = y + ((k * 29 + b.i * 13) % 100) / 100 * h; g.fillStyle = `rgba(255,255,255,${1 - ph * 4})`; star(g, sx, sy, 3 + ph * 6); } }
  }
  // Water: blue-green brine, lighter as it shallows, with a moving sheen.
  if (b.water > 0) {
    const d = Math.min(1, b.water);
    g.globalAlpha = 0.25 + d * 0.65;
    const wg = g.createLinearGradient(x, y, x + w, y + h);
    wg.addColorStop(0, mix('#9ac8cc', '#4a8a9a', d)); wg.addColorStop(1, mix('#b8dcd8', '#5e9cac', d));
    g.fillStyle = wg; g.fillRect(x, y, w, h);
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) { const yy = y + ((t * 6 + k * h / 3) % h); g.beginPath(); g.moveTo(x + 6, yy); g.quadraticCurveTo(x + w / 2, yy - 3, x + w - 6, yy); g.stroke(); }
    if (b.water > 1) { g.fillStyle = 'rgba(90,150,170,0.4)'; g.beginPath(); g.ellipse(x + w / 2, y + h + 6, w / 2 + 6, 6, 0, 0, Math.PI * 2); g.fill(); } // spilling over
  }
  // Raking progress: lines drawn through the salt.
  if (b.rake > 0) {
    g.strokeStyle = 'rgba(120,110,90,0.5)'; g.lineWidth = 1.5;
    for (let k = 0; k < 6; k++) { const yy = y + 4 + k * (h - 8) / 5; g.beginPath(); g.moveTo(x + 3, yy); g.lineTo(x + 3 + (w - 6) * b.rake, yy); g.stroke(); }
  }
  // The heap at the bed's lower edge.
  if (b.heap > 0) {
    const r = 8 + Math.min(22, Math.sqrt(b.heap) * 3.2), hx = x + w / 2, hy = y + h + 2;
    const hc = mix('#fdfcf6', '#aaa69c', 1 - b.heapQ);
    g.fillStyle = 'rgba(40,24,10,0.25)'; g.beginPath(); g.ellipse(hx + 3, hy + 2, r, r * 0.3, 0, 0, Math.PI * 2); g.fill();
    const hg = g.createLinearGradient(hx - r, hy - r, hx + r, hy);
    hg.addColorStop(0, '#ffffff'); hg.addColorStop(1, mix(hc, '#8a8678', 0.25));
    g.fillStyle = hg; g.beginPath(); g.moveTo(hx - r, hy); g.quadraticCurveTo(hx, hy - r * 1.1, hx + r, hy); g.closePath(); g.fill();
  }
  // The sluice: a little wooden board at the top, lifted when open.
  const sx = X(b.x + b.w / 2), sy = y - 2;
  g.fillStyle = '#5a3c20'; g.fillRect(sx - 9, sy - 9, 3, 12); g.fillRect(sx + 6, sy - 9, 3, 12);
  g.fillStyle = '#9a6a3a'; g.fillRect(sx - 7, sy - (b.sluice ? 16 : 7), 14, 8);
  if (b.sluice) { g.fillStyle = 'rgba(120,180,200,0.85)'; g.beginPath(); g.moveTo(sx - 4, sy - 6); g.quadraticCurveTo(sx, sy + 6 + Math.sin(t * 20) * 1.5, sx + 4, sy - 6); g.fill(); }
}

function star(g, x, y, r) {
  g.beginPath();
  for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4, rr = k % 2 ? r * 0.3 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}

// A small status above each bed: a fill gauge while filling, a white/grey timer when dry.
function badge(g, s, b, t) {
  if (!b.open) return;
  const x = X(b.x + b.w / 2), y = Y(b.y) - 22;
  if (b.sluice) {
    const k = Math.min(1, b.water);
    g.fillStyle = 'rgba(28,20,12,0.6)'; g.beginPath(); g.roundRect(x - 26, y - 6, 52, 10, 5); g.fill();
    g.fillStyle = k >= 0.98 ? (Math.floor(t * 4) % 2 ? '#ffd65a' : '#ffffff') : '#7ac4d4'; g.beginPath(); g.roundRect(x - 24, y - 4, 48 * k, 6, 3); g.fill();
  } else if (b.water === 0 && b.salt > 0) {
    // How long it stays white: a shrinking ring.
    const left = Math.max(0, 1 - b.dry / s.R.quality.window);
    g.lineWidth = 4; g.strokeStyle = 'rgba(28,20,12,0.5)'; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = left > 0 ? '#ffffff' : '#9a968c'; g.beginPath(); g.arc(x, y, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (left > 0 ? left : b.quality)); g.stroke();
  }
}

// ---- the store, the workers, the donkey ------------------------------------------------------------

function store(g, s) {
  const x = X(s.store.x), y = Y(s.store.y);
  g.fillStyle = 'rgba(40,24,10,0.3)'; g.beginPath(); g.ellipse(x + 6, y + 30, 56, 12, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d8c4a0'; g.fillRect(x - 44, y - 18, 88, 48);
  for (let yy = y - 14; yy < y + 30; yy += 10) { g.fillStyle = 'rgba(100,70,40,0.15)'; g.fillRect(x - 44, yy, 88, 1); }
  g.fillStyle = '#a8553a'; g.beginPath(); g.moveTo(x - 52, y - 16); g.lineTo(x, y - 46); g.lineTo(x + 52, y - 16); g.closePath(); g.fill();
  g.fillStyle = '#7a3a26'; g.fillRect(x - 54, y - 18, 108, 5);
  g.fillStyle = '#4a3020'; g.beginPath(); g.roundRect(x - 13, y + 2, 26, 28, [12, 12, 0, 0]); g.fill();
  // Sacks of salt by the door, more as the store fills.
  const n = Math.min(6, Math.ceil(s.store.kg / 15));
  for (let k = 0; k < n; k++) { const sx = x + 22 + (k % 3) * 11, sy = y + 24 - Math.floor(k / 3) * 9; g.fillStyle = '#efe8d6'; g.beginPath(); g.roundRect(sx, sy, 10, 10, 3); g.fill(); g.strokeStyle = '#b8a888'; g.lineWidth = 1; g.stroke(); }
}

const LOOK = [
  { shirt: '#f4efe4', sash: '#c0392b', skin: '#e6b48c', hair: '#4a3222', beret: true },
  { shirt: '#e8d8b8', sash: '#2e6f9e', skin: '#d9a47c', hair: '#2a1c14', scarf: '#2e6f9e' },
];

// A salt worker seen from a three-quarter view above: smooth and simple at this scale.
function worker(g, s, w, t) {
  const L = LOOK[w.i], x = X(w.x), y = Y(w.y), u = 46;
  const moving = Math.hypot(w.vx, w.vy) > 0.2;
  const bob = moving ? Math.abs(Math.sin(t * 10 + w.i)) * 2 : 0;
  g.save(); g.translate(x, y - bob);
  g.fillStyle = 'rgba(40,24,10,0.3)'; g.beginPath(); g.ellipse(0, bob + 1, 13, 4, 0, 0, Math.PI * 2); g.fill();
  // Legs.
  const step = moving ? Math.sin(t * 10 + w.i) * 4 : 0;
  g.strokeStyle = '#ece6d8'; g.lineWidth = 6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-4, -16); g.lineTo(-4 + step, -1); g.moveTo(4, -16); g.lineTo(4 - step, -1); g.stroke();
  // Body: shirt, sash.
  const sg = g.createLinearGradient(-10, 0, 10, 0);
  sg.addColorStop(0, shade(L.shirt, -0.15)); sg.addColorStop(1, shade(L.shirt, 0.1));
  g.fillStyle = sg; g.beginPath(); g.roundRect(-10, -36, 20, 22, 6); g.fill();
  g.fillStyle = L.sash; g.fillRect(-10, -19, 20, 4);
  if (L.scarf) { g.fillStyle = L.scarf; g.beginPath(); g.moveTo(-6, -36); g.lineTo(6, -36); g.lineTo(0, -29); g.fill(); }
  // Arms: raking pulls the rake back and forth.
  const raking = w.raking != null;
  const sw = raking ? Math.sin(t * 9) * 7 : moving ? Math.sin(t * 10 + w.i) * 3 : 0;
  g.strokeStyle = L.skin; g.lineWidth = 4.5;
  g.beginPath(); g.moveTo(-9, -32); g.lineTo(-13 + (raking ? sw : 0), -20 + (raking ? 4 : sw)); g.moveTo(9, -32); g.lineTo(13 + (raking ? sw : 0), -20 + (raking ? 4 : -sw)); g.stroke();
  if (raking) {
    // The wooden rasero: a long handle and a wide flat head.
    g.strokeStyle = '#8a6036'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(sw, -18); g.lineTo(sw + 4, 10); g.stroke();
    g.fillStyle = '#9a7040'; g.fillRect(sw - 9, 9, 26, 4);
  }
  // Head and hair; a txapela or a scarf.
  g.fillStyle = L.skin; g.beginPath(); g.arc(0, -43, 8, 0, Math.PI * 2); g.fill();
  g.fillStyle = L.hair; g.beginPath(); g.arc(0, -45, 8, Math.PI, 0); g.fill();
  if (L.beret) { g.fillStyle = '#1a1a22'; g.beginPath(); g.ellipse(0, -50, 10, 3.5, -0.1, 0, Math.PI * 2); g.fill(); }
  else { g.fillStyle = L.scarf; g.beginPath(); g.ellipse(0, -48, 9, 5, 0, Math.PI, 0); g.fill(); }
  g.fillStyle = '#2a1a10'; g.beginPath(); g.arc(-3, -43, 1.2, 0, Math.PI * 2); g.arc(3, -43, 1.2, 0, Math.PI * 2); g.fill();
  // A wicker basket on the hip, heaped with salt as it fills.
  const load = Math.min(1, w.carry / s.basket());
  g.fillStyle = '#a07a46'; g.beginPath(); g.moveTo(9, -26); g.lineTo(23, -26); g.lineTo(21, -12); g.lineTo(11, -12); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(80,50,20,0.6)'; g.lineWidth = 1; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(10 + k * 0.4, -23 + k * 4); g.lineTo(22 - k * 0.4, -23 + k * 4); g.stroke(); }
  g.strokeStyle = '#7a5530'; g.lineWidth = 1.5; g.beginPath(); g.arc(16, -26, 6, Math.PI, 0); g.stroke();
  if (load > 0) { g.fillStyle = '#fbfaf4'; g.beginPath(); g.moveTo(9, -26); g.quadraticCurveTo(16, -26 - 10 * load, 23, -26); g.fill(); }
  g.restore();
}

function donkey(g, s, t) {
  if (s.levels.burro <= 0) return;
  const d = s.donkey, x = X(d.x), y = Y(d.y), f = d.face || 1;
  const moving = !!d.target;
  g.save(); g.translate(x, y); g.scale(f, 1);
  g.fillStyle = 'rgba(40,24,10,0.3)'; g.beginPath(); g.ellipse(0, 1, 22, 5, 0, 0, Math.PI * 2); g.fill();
  const step = moving ? Math.sin(t * 8) * 3 : 0;
  g.strokeStyle = '#6e625a'; g.lineWidth = 4;
  for (const [lx, k] of [[-12, 1], [-6, -1], [8, 1], [14, -1]]) { g.beginPath(); g.moveTo(lx, -12); g.lineTo(lx + step * k, 0); g.stroke(); }
  g.fillStyle = '#8a7e74'; g.beginPath(); g.ellipse(0, -18, 18, 9, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(14, -22); g.lineTo(22, -34); g.lineTo(28, -30); g.lineTo(20, -16); g.fill();
  g.beginPath(); g.ellipse(27, -32, 7, 5, 0.4, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#6e625a'; g.beginPath(); g.ellipse(21, -40, 2, 6, -0.3, 0, Math.PI * 2); g.ellipse(25, -40, 2, 6, 0.2, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e8e2d8'; g.beginPath(); g.ellipse(31, -30, 3, 3, 0, 0, Math.PI * 2); g.fill();
  // Panniers, white with salt when loaded.
  g.fillStyle = '#a07a46'; g.fillRect(-10, -24, 16, 12);
  if (d.carry > 0) { g.fillStyle = '#fbfaf4'; g.beginPath(); g.ellipse(-2, -24, 8, 3, 0, 0, Math.PI * 2); g.fill(); }
  g.restore();
}

// The muleteer's cart: a mule, a two-wheeled cart, the arriero, and his order.
function cart(g, s, t) {
  const c = s.cart; if (!c) return;
  const x = X(c.x), y = Y(c.y), wob = Math.sin(t * 8) * (c.x < c.arrive || c.leaving ? 1.5 : 0);
  g.fillStyle = 'rgba(40,24,10,0.3)'; g.beginPath(); g.ellipse(x + 20, y + 4, 70, 9, 0, 0, Math.PI * 2); g.fill();
  // Mule.
  g.fillStyle = '#7a6a5e'; g.beginPath(); g.ellipse(x + 70, y - 22 + wob, 22, 11, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(x + 86, y - 26); g.lineTo(x + 96, y - 40); g.lineTo(x + 103, y - 36); g.lineTo(x + 92, y - 20); g.fill();
  g.beginPath(); g.ellipse(x + 101, y - 38, 8, 5, 0.4, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(x + 95, y - 48, 2, 7, -0.3, 0, Math.PI * 2); g.ellipse(x + 99, y - 48, 2, 7, 0.2, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#5e5248'; g.lineWidth = 4; for (const lx of [56, 62, 78, 84]) { g.beginPath(); g.moveTo(x + lx, y - 14); g.lineTo(x + lx + wob, y); g.stroke(); }
  // Cart and its salt sacks.
  g.fillStyle = '#8a5e34'; g.fillRect(x - 30, y - 34, 76, 16);
  g.strokeStyle = '#5a3a1e'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + 46, y - 26); g.lineTo(x + 62, y - 24); g.stroke();
  g.fillStyle = '#4a3020'; g.beginPath(); g.arc(x + 6, y - 10, 14, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#9a7040'; g.lineWidth = 2; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4 + (c.x < c.arrive || c.leaving ? t * 4 : 0); g.beginPath(); g.moveTo(x + 6 - Math.cos(a) * 12, y - 10 - Math.sin(a) * 12); g.lineTo(x + 6 + Math.cos(a) * 12, y - 10 + Math.sin(a) * 12); g.stroke(); }
  const sacks = Math.round((c.got / c.want) * 6);
  for (let k = 0; k < sacks; k++) { g.fillStyle = '#efe8d6'; g.beginPath(); g.roundRect(x - 26 + (k % 3) * 22, y - 50 + (k >= 3 ? -10 : 0), 20, 16, 5); g.fill(); }
  // The arriero, in black with a red sash.
  g.fillStyle = '#2a2a30'; g.beginPath(); g.roundRect(x - 48, y - 40, 14, 22, 4); g.fill();
  g.fillStyle = '#c0392b'; g.fillRect(x - 48, y - 26, 14, 3);
  g.fillStyle = '#e2ae88'; g.beginPath(); g.arc(x - 41, y - 46, 6, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1a1a22'; g.beginPath(); g.ellipse(x - 41, y - 51, 8, 3, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#f0ece2'; g.lineWidth = 4; g.beginPath(); g.moveTo(x - 46, y - 18); g.lineTo(x - 46, y); g.moveTo(x - 37, y - 18); g.lineTo(x - 37, y); g.stroke();
  // The order: a speech bubble with how much he wants and a ring for the time left.
  if (!c.leaving && c.x >= c.arrive) {
    const bx = x + 10, by = y - 92, k = c.left / s.R.cart.time;
    g.fillStyle = 'rgba(255,250,236,0.96)'; g.beginPath(); g.roundRect(bx - 48, by - 24, 96, 40, 12); g.fill();
    g.beginPath(); g.moveTo(bx - 8, by + 16); g.lineTo(bx, by + 28); g.lineTo(bx + 8, by + 16); g.fill();
    g.fillStyle = '#3a2a1a'; g.font = 'bold 17px "Trebuchet MS", sans-serif'; g.textAlign = 'center';
    g.fillText(`${Math.round(c.got)} / ${c.want} kg`, bx - 6, by);
    g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.15)'; g.beginPath(); g.arc(bx + 34, by - 5, 9, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = k > 0.3 ? '#3a8a4a' : Math.floor(t * 6) % 2 ? '#c0392b' : '#e8b840'; g.beginPath(); g.arc(bx + 34, by - 5, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); g.stroke();
  }
}

function goat(g, s, gt, t) {
  const x = X(gt.x), y = Y(gt.y), f = gt.face || 1, munch = gt.munch > 0 && !gt.flee;
  g.save(); g.translate(x, y); g.scale(f, 1);
  g.fillStyle = 'rgba(40,24,10,0.3)'; g.beginPath(); g.ellipse(0, 1, 16, 4, 0, 0, Math.PI * 2); g.fill();
  const step = munch ? 0 : Math.sin(t * (gt.flee ? 20 : 10)) * 3;
  g.strokeStyle = '#5a4a3e'; g.lineWidth = 3;
  for (const [lx, k] of [[-9, 1], [-4, -1], [6, 1], [10, -1]]) { g.beginPath(); g.moveTo(lx, -9); g.lineTo(lx + step * k, 0); g.stroke(); }
  g.fillStyle = '#f2ece0'; g.beginPath(); g.ellipse(0, -14, 13, 7, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#5a4a3e'; g.beginPath(); g.ellipse(-4, -15, 5, 4, 0, 0, Math.PI * 2); g.fill();
  const hy = munch ? -6 + Math.abs(Math.sin(t * 8)) * 2 : -22;
  g.fillStyle = '#f2ece0'; g.beginPath(); g.ellipse(14, hy, 6, 5, munch ? 0.8 : 0.3, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#8a7a6a'; g.lineWidth = 2; g.beginPath(); g.moveTo(13, hy - 4); g.quadraticCurveTo(9, hy - 12, 6, hy - 9); g.stroke();
  g.fillStyle = '#2a1a10'; g.beginPath(); g.arc(16, hy - 1, 1, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d8d0c0'; g.beginPath(); g.moveTo(18, hy + 3); g.lineTo(17, hy + 9); g.lineTo(20, hy + 4); g.fill(); // beard
  g.restore();
  if (gt.flee) { g.fillStyle = '#3a2a1a'; g.font = 'bold 16px sans-serif'; g.textAlign = 'center'; g.fillText('!', x, y - 34); }
}

// ---- sun, clouds, rain, and the light of the day ------------------------------------------------

function sky(g, s, t) {
  const k = Math.min(1, s.t / s.R.season.dayLength);
  // The sun arcs across the strip of sky above the hill.
  const sx = 60 + k * 840, sy = 70 - Math.sin(Math.PI * k) * 52;
  glow(g, sx, sy, 90, 'rgba(255,240,190,A)', 0.6 * (1 - s.weather.cloud));
  g.fillStyle = `rgba(255,248,220,${0.95 * (1 - s.weather.cloud * 0.8)})`; g.beginPath(); g.arc(sx, sy, 13, 0, Math.PI * 2); g.fill();
  // Clouds gather before a storm.
  const c = s.weather.cloud;
  if (c > 0) {
    for (let i = 0; i < 6; i++) {
      const cx = ((i * 190 + t * 12) % 1160) - 100, cy = 30 + (i % 3) * 18;
      g.fillStyle = `rgba(${s.weather.rain ? '110,116,128' : '236,236,232'},${c * 0.9})`;
      for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(cx + j * 26, cy - (j % 2) * 8, 22 + (j % 2) * 6, 0, Math.PI * 2); g.fill(); }
    }
  }
}

function weatherOverlay(g, s, t) {
  const c = s.weather.cloud;
  if (c > 0) { g.fillStyle = `rgba(40,50,70,${c * (s.weather.rain ? 0.32 : 0.15)})`; g.fillRect(0, 0, W, H); }
  if (s.weather.rain) {
    // Now and then, a flash of lightning.
    const flash = (Math.sin(t * 1.7) + Math.sin(t * 2.9)) > 1.85;
    if (flash) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 0, W, H); g.strokeStyle = 'rgba(255,255,240,0.9)'; g.lineWidth = 2.5; g.beginPath(); let lx = 300 + (Math.floor(t) * 137) % 400, ly = 0; g.moveTo(lx, ly); while (ly < 110) { lx += (Math.sin(ly * 7 + t) * 14); ly += 14; g.lineTo(lx, ly); } g.stroke(); }
    g.strokeStyle = 'rgba(210,225,240,0.55)'; g.lineWidth = 1.2;
    for (let k = 0; k < 160; k++) { const x = ((k * 97 + t * 260) % (W + 60)) - 30, y = ((k * 53 + t * 700) % (H + 40)) - 20; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 5, y + 14); g.stroke(); }
  }
  // Toward evening the light warms and dims.
  const k = s.t / s.R.season.dayLength;
  if (k > 0.75) { g.fillStyle = `rgba(200,110,60,${(k - 0.75) * 0.6})`; g.fillRect(0, 0, W, H); }
}

// ---- the whole scene -----------------------------------------------------------------------------

export function drawScene(g, s, t, fx = []) {
  g.drawImage(cached('land', () => paintLand(s.L)), 0, 0, W, H);
  sky(g, s, t);
  channel(g, s, t);
  for (const b of s.beds) bed(g, s, b, t);
  store(g, s);
  // Sort the moving figures by depth.
  cart(g, s, t);
  const figs = [...s.workers.map((w) => ({ y: w.y, draw: () => worker(g, s, w, t) })), { y: s.donkey.y, draw: () => donkey(g, s, t) }, ...s.goats.map((gt) => ({ y: gt.y, draw: () => goat(g, s, gt, t) }))];
  figs.sort((a, b) => a.y - b.y).forEach((f) => f.draw());
  for (const b of s.beds) badge(g, s, b, t);
  weatherOverlay(g, s, t);
  for (const p of fx) { g.globalAlpha = Math.max(0, p.life / p.max); g.fillStyle = p.colour; if (p.kind === 'star') star(g, p.x, p.y, p.size); else { g.beginPath(); g.arc(p.x, p.y, p.size, 0, Math.PI * 2); g.fill(); } }
  g.globalAlpha = 1;
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
