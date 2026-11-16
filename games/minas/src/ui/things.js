// Painted things: the museum pieces, the belt's items and the jackpots.
// Smooth shapes, never pixel art. Each painter draws centred on (0, 0) at a
// size where the thing fits in about 40 x 40 pixels; callers translate and
// scale. findIcon() and itemIcon() turn them into little images for the
// HUD, the workshop and the museum (cached).

const TAU = Math.PI * 2;

function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const shine = (g, x, y, rx, ry, a = 0.5) => { g.fillStyle = `rgba(255,255,255,${a})`; g.beginPath(); g.ellipse(x, y, rx, ry, -0.5, 0, TAU); g.fill(); };
const radial = (g, x, y, r, stops) => { const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r); stops.forEach(([k, c]) => gr.addColorStop(k, c)); return gr; };

// ---- the museum pieces ---------------------------------------------------------------------------

export const FINDS = {
  // A potash miner's helmet, with the lamp on the front.
  casco(g) {
    g.fillStyle = radial(g, 0, 2, 18, [[0, '#fff6d8'], [0.6, '#e9c95a'], [1, '#a8842a']]);
    g.beginPath(); g.arc(0, 6, 15, Math.PI, 0); g.fill();
    g.fillStyle = '#b8932e'; rr(g, -20, 5, 40, 5, 2.5); g.fill();
    g.fillStyle = '#c9a43c'; rr(g, -3, -9, 6, 14, 2); g.fill();
    g.fillStyle = '#5a5f66'; rr(g, -7, -6, 14, 9, 3); g.fill();
    g.fillStyle = '#fff3c0'; g.beginPath(); g.arc(0, -1.5, 3.2, 0, TAU); g.fill();
    shine(g, -7, -2, 4, 2.4);
  },
  // A brass lamp token with a hole to hang it on its hook.
  ficha(g) {
    g.fillStyle = radial(g, 0, 0, 16, [[0, '#fff0b0'], [0.55, '#d8a640'], [1, '#8a6420']]);
    g.beginPath(); g.arc(0, 2, 15, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(90,60,20,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 2, 11.5, 0, TAU); g.stroke();
    g.fillStyle = '#3a2a18'; g.beginPath(); g.arc(0, -8, 2.6, 0, TAU); g.fill();
    g.fillStyle = 'rgba(80,52,16,0.85)'; g.font = 'bold 12px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('27', 0, 5);
    shine(g, -7, -3, 4, 2);
  },
  // A brass carbide lamp: water tank above, carbide below, a reflector.
  carburo(g) {
    g.fillStyle = '#b8862e'; rr(g, -8, -4, 16, 22, 4); g.fill();
    g.fillStyle = '#d9a845'; rr(g, -9, -14, 18, 11, 4); g.fill();
    g.strokeStyle = '#7a5a20'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-8, -3); g.lineTo(8, -3); g.stroke();
    g.fillStyle = radial(g, 13, -8, 8, [[0, '#ffffff'], [0.6, '#cfd4da'], [1, '#8a9098']]);
    g.beginPath(); g.arc(13, -8, 7.5, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,250,220,0.95)'; g.beginPath(); g.ellipse(13, -8, 2, 3.6, 0, 0, TAU); g.fill();
    g.strokeStyle = '#6a4a1a'; g.lineWidth = 2; g.beginPath(); g.arc(-12, -6, 5, Math.PI * 0.6, Math.PI * 1.5); g.stroke();
    shine(g, -4, -11, 3.5, 2);
  },
  // An iron cannonball.
  bala(g) {
    g.fillStyle = radial(g, 0, 2, 16, [[0, '#8a8f96'], [0.5, '#3e4248'], [1, '#1c1e22']]);
    g.beginPath(); g.arc(0, 2, 15, 0, TAU); g.fill();
    g.fillStyle = 'rgba(150,70,40,0.35)'; g.beginPath(); g.ellipse(6, 8, 6, 3.5, 0.4, 0, TAU); g.fill();
    shine(g, -6, -5, 5, 3, 0.45);
  },
  // An iron horseshoe with its nail holes.
  herradura(g) {
    g.strokeStyle = '#6e5848'; g.lineWidth = 8; g.lineCap = 'round';
    g.beginPath(); g.arc(0, -2, 12, Math.PI * 0.12, Math.PI * 0.88, true); g.stroke();
    g.strokeStyle = '#9a8676'; g.lineWidth = 2.5; g.beginPath(); g.arc(0, -2, 14, Math.PI * 1.1, Math.PI * 1.6); g.stroke();
    g.fillStyle = '#2c241e';
    for (const a of [1.05, 1.3, 1.7, 1.95].map((k) => k * Math.PI)) { g.beginPath(); g.arc(Math.cos(a) * 12, -2 + Math.sin(a) * 12, 1.4, 0, TAU); g.fill(); }
    g.lineCap = 'butt';
  },
  // A steel breastplate with rivets.
  coraza(g) {
    g.fillStyle = radial(g, 0, 0, 20, [[0, '#f2f4f6'], [0.55, '#a8b0b8'], [1, '#5e666e']]);
    g.beginPath(); g.moveTo(-14, -14); g.quadraticCurveTo(0, -8, 14, -14); g.lineTo(17, 6); g.quadraticCurveTo(0, 22, -17, 6); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(40,46,52,0.55)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -10); g.lineTo(0, 15); g.stroke();
    g.fillStyle = '#c8a24a'; for (const [x, y] of [[-12, -10], [12, -10], [-14, 3], [14, 3]]) { g.beginPath(); g.arc(x, y, 1.7, 0, TAU); g.fill(); }
    shine(g, -7, -4, 4, 6, 0.4);
  },
  // A small silver coin with a cross.
  dinero(g) {
    g.fillStyle = radial(g, 0, 0, 14, [[0, '#ffffff'], [0.6, '#c9ced4'], [1, '#7f868e']]);
    g.beginPath(); g.arc(0, 0, 13, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(70,76,84,0.7)'; g.lineWidth = 1.2; g.beginPath(); g.arc(0, 0, 10, 0, TAU); g.stroke();
    g.lineWidth = 2.4; g.beginPath(); g.moveTo(-6, 0); g.lineTo(6, 0); g.moveTo(0, -6); g.lineTo(0, 6); g.stroke();
    g.fillStyle = 'rgba(70,76,84,0.7)'; for (const [x, y] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) { g.beginPath(); g.arc(x, y, 1.1, 0, TAU); g.fill(); }
  },
  // An iron oil lamp (candil) with its hook.
  candil(g) {
    g.strokeStyle = '#4a4440'; g.lineWidth = 2.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-6, 4); g.lineTo(-6, -12); g.quadraticCurveTo(-6, -18, 0, -18); g.quadraticCurveTo(5, -18, 5, -13); g.stroke();
    g.fillStyle = '#5a524c'; g.beginPath(); g.moveTo(-14, 4); g.quadraticCurveTo(-2, 16, 12, 6); g.lineTo(18, 2); g.lineTo(10, 3); g.quadraticCurveTo(-2, 8, -14, 4); g.fill();
    g.fillStyle = 'rgba(255,200,90,0.95)'; g.beginPath(); g.ellipse(17, -2, 2.4, 4.5, 0.2, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,240,180,0.9)'; g.beginPath(); g.ellipse(17, -1, 1, 2.2, 0.2, 0, TAU); g.fill();
    g.lineCap = 'butt';
  },
  // A clay crucible.
  crisol(g) {
    g.fillStyle = '#b07a52'; g.beginPath(); g.moveTo(-13, -10); g.lineTo(13, -10); g.lineTo(6, 14); g.quadraticCurveTo(0, 17, -6, 14); g.closePath(); g.fill();
    g.fillStyle = '#7a4e30'; g.beginPath(); g.ellipse(0, -10, 13, 4, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(80,190,140,0.55)'; g.beginPath(); g.ellipse(0, -10, 9, 2.5, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(40,24,14,0.35)'; g.beginPath(); g.ellipse(4, 4, 3, 7, 0.2, 0, TAU); g.fill();
  },
  // A Roman silver coin with a head.
  moneda(g) {
    g.fillStyle = radial(g, 0, 0, 14, [[0, '#ffffff'], [0.6, '#cfd4da'], [1, '#868c94']]);
    g.beginPath(); g.arc(0, 0, 13.5, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(80,86,94,0.6)'; g.lineWidth = 1.2; g.beginPath(); g.arc(0, 0, 11, 0, TAU); g.stroke();
    g.fillStyle = '#9aa0a8'; g.beginPath(); g.ellipse(1, 0, 5, 7, 0, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(5, -1); g.lineTo(8, 1); g.lineTo(5, 2); g.fill();
    g.fillStyle = '#7d848c'; g.beginPath(); g.ellipse(-1, -5, 5, 2.6, -0.3, 0, TAU); g.fill();
  },
  // A clay oil lamp.
  lucerna(g) {
    g.fillStyle = '#b5683a'; g.beginPath(); g.ellipse(-3, 3, 15, 9, 0, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(8, -1); g.lineTo(20, 2); g.lineTo(9, 9); g.closePath(); g.fill();
    g.strokeStyle = '#b5683a'; g.lineWidth = 3.5; g.beginPath(); g.arc(-17, 2, 5, Math.PI * 0.6, Math.PI * 1.4); g.stroke();
    g.fillStyle = '#7d4222'; g.beginPath(); g.arc(-4, 1, 4, 0, TAU); g.fill();
    g.strokeStyle = '#d8946a'; g.lineWidth = 1.4; g.beginPath(); g.ellipse(-3, 2, 9.5, 5.5, 0, Math.PI, TAU); g.stroke();
    g.fillStyle = 'rgba(255,200,90,0.9)'; g.beginPath(); g.ellipse(19, -2, 2, 3.6, 0.2, 0, TAU); g.fill();
  },
  // The iron head of a pick.
  pico(g) {
    g.fillStyle = '#5c5650'; g.beginPath(); g.moveTo(-20, 6); g.quadraticCurveTo(0, -12, 20, 6); g.quadraticCurveTo(0, -4, -20, 6); g.fill();
    g.fillStyle = '#3a3430'; rr(g, -4, -8, 8, 9, 2); g.fill();
    g.fillStyle = 'rgba(150,80,40,0.4)'; g.beginPath(); g.ellipse(-10, 0, 5, 2.5, -0.4, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(200,200,200,0.35)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-14, 1); g.quadraticCurveTo(0, -9, 14, 1); g.stroke();
  },
  // A bronze axe head.
  hacha(g) {
    g.fillStyle = radial(g, 0, 0, 20, [[0, '#ffe0a0'], [0.5, '#c8963a'], [1, '#8a5e20']]);
    g.beginPath(); g.moveTo(-16, -5); g.lineTo(4, -8); g.quadraticCurveTo(20, 0, 4, 12); g.lineTo(-16, 5); g.closePath(); g.fill();
    g.fillStyle = 'rgba(94,154,122,0.55)'; g.beginPath(); g.ellipse(-6, 2, 6, 3.5, 0, 0, TAU); g.fill();
    shine(g, -4, -4, 7, 1.6, 0.5);
  },
  // A sherd of a handmade pot, with incised lines.
  ceramica(g) {
    g.fillStyle = '#9a6a40'; g.beginPath(); g.moveTo(-16, -6); g.quadraticCurveTo(0, -14, 15, -8); g.lineTo(12, 10); g.lineTo(2, 14); g.lineTo(-13, 9); g.closePath(); g.fill();
    g.fillStyle = '#7a4c2a'; g.beginPath(); g.moveTo(-16, -6); g.quadraticCurveTo(0, -14, 15, -8); g.lineTo(15, -5); g.quadraticCurveTo(0, -11, -16, -3); g.fill();
    g.strokeStyle = 'rgba(50,30,16,0.6)'; g.lineWidth = 1.3;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(-10 + k * 5, -2); g.lineTo(-7 + k * 5, 4); g.lineTo(-4 + k * 5, -2); g.stroke(); }
  },
  // A rounded stone hammer with a groove for its handle.
  martillo(g) {
    g.fillStyle = radial(g, 0, 0, 18, [[0, '#c6c2b8'], [0.6, '#8e8a80'], [1, '#5e5a52']]);
    g.beginPath(); g.ellipse(0, 1, 18, 12, 0.1, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(40,36,30,0.55)'; g.lineWidth = 3; g.beginPath(); g.moveTo(-2, -11); g.quadraticCurveTo(-5, 1, -2, 13); g.stroke();
    shine(g, 7, -4, 4, 2.4, 0.35);
  },
  // The cave's piece: a necklace of green stone beads on a thread.
  collar(g) {
    g.strokeStyle = '#8a6a3a'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(-15, -14); g.quadraticCurveTo(-18, 10, 0, 14); g.quadraticCurveTo(18, 10, 15, -14); g.stroke();
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI * (0.06 + 0.88 * k / 10), r = k === 5 ? 5.2 : 3.6 + (k % 2) * 0.6;
      const x = -Math.cos(a) * 16.5, y = -10 + Math.sin(a) * 23;
      g.fillStyle = radial(g, x, y, r + 1, [[0, '#d8ffe8'], [0.45, k % 3 ? '#3fae7c' : '#2a8a9a'], [1, '#14523e']]);
      g.beginPath(); g.ellipse(x, y, r, r * 0.9, a, 0, TAU); g.fill();
    }
    shine(g, -1.5, 11, 2, 1.2, 0.7);
  },
};

// ---- the belt ----------------------------------------------------------------------------------------

export const ITEMS = {
  dynamite(g) {
    g.save(); g.rotate(-0.35);
    g.fillStyle = '#c0392b'; rr(g, -6, -14, 12, 28, 4); g.fill();
    g.fillStyle = '#e8d4a8'; g.fillRect(-6, -4, 12, 6);
    g.fillStyle = 'rgba(255,255,255,0.3)'; rr(g, -4, -12, 3, 24, 1.5); g.fill();
    g.strokeStyle = '#4a3a2a'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(0, -14); g.quadraticCurveTo(4, -20, 1, -23); g.stroke();
    g.restore();
    g.fillStyle = '#ffd25a'; g.beginPath(); g.arc(-7, -22, 3, 0, TAU); g.fill();
  },
  kit(g) {
    g.fillStyle = '#e8e2d2'; rr(g, -15, -11, 30, 22, 5); g.fill();
    g.fillStyle = '#7a5a3a'; rr(g, -6, -15, 12, 6, 2.5); g.fill();
    g.fillStyle = '#2e8b57'; g.fillRect(-3, -7, 6, 14); g.fillRect(-7, -3, 14, 6);
    g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 1.2; rr(g, -15, -11, 30, 22, 5); g.stroke();
  },
  oil(g) {
    g.fillStyle = radial(g, 0, 4, 14, [[0, '#d0d4d8'], [0.6, '#8a9098'], [1, '#5a6068']]);
    g.beginPath(); g.ellipse(0, 4, 12, 11, 0, 0, TAU); g.fill();
    g.fillStyle = '#6a7078'; g.beginPath(); g.moveTo(4, -5); g.lineTo(16, -15); g.lineTo(18, -12); g.lineTo(8, -2); g.fill();
    g.fillStyle = '#d9a845'; g.beginPath(); g.ellipse(0, 4, 7, 4, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(232,184,64,0.9)'; g.beginPath(); g.arc(18, -15, 2, 0, TAU); g.fill();
  },
  rope(g) {
    g.strokeStyle = '#b89460'; g.lineWidth = 3.5;
    for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(0, 2, 14 - k * 3, 9 - k * 2, 0, 0, TAU); g.stroke(); }
    g.strokeStyle = '#8a6a3a'; g.lineWidth = 1; g.beginPath(); g.ellipse(0, 2, 14, 9, 0, 0, TAU); g.stroke();
    g.strokeStyle = '#b89460'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(12, -2); g.quadraticCurveTo(18, -14, 8, -18); g.stroke();
    g.fillStyle = '#6a6e74'; g.beginPath(); g.arc(7, -18, 3.5, 0, TAU); g.fill();
  },
  // Wooden bellows with a leather fold and a brass nozzle, puffing.
  bellows(g) {
    g.save(); g.rotate(-0.25);
    g.fillStyle = '#8a5a30'; g.beginPath(); g.moveTo(-16, -9); g.quadraticCurveTo(-4, -14, 8, -4); g.lineTo(8, 4); g.quadraticCurveTo(-4, 14, -16, 9); g.closePath(); g.fill();
    g.fillStyle = '#b8864a'; g.beginPath(); g.moveTo(-16, -9); g.quadraticCurveTo(-4, -14, 8, -4); g.lineTo(6, -2); g.quadraticCurveTo(-4, -9, -16, -5); g.closePath(); g.fill();
    g.strokeStyle = '#5a3a1e'; g.lineWidth = 1.3;
    for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(-12 + k * 6, -9 + k * 1.5); g.quadraticCurveTo(-10 + k * 6, 0, -12 + k * 6, 9 - k * 1.5); g.stroke(); }
    g.fillStyle = '#d9a845'; rr(g, 7, -2.5, 10, 5, 2); g.fill();
    g.fillStyle = '#6a4424'; rr(g, -24, -2, 9, 4, 2); g.fill();
    g.restore();
    g.fillStyle = 'rgba(220,235,255,0.75)';
    for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(19 + k * 4, -7 - k * 2, 2.2 - k * 0.5, 0, TAU); g.fill(); }
  },
};

// ---- jackpots: big, bright ore -------------------------------------------------------------------

function crystal(g, x, y, s, a, body, light) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = body; g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.55, -s * 0.25); g.lineTo(s * 0.42, s * 0.8); g.lineTo(-s * 0.42, s * 0.8); g.lineTo(-s * 0.55, -s * 0.25); g.closePath(); g.fill();
  g.fillStyle = light; g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.55, -s * 0.25); g.lineTo(0, 0); g.closePath(); g.fill();
  g.restore();
}

export const JACKPOTS = {
  silvinita(g) { [[-9, 4, 11, -0.4], [0, 0, 15, 0], [9, 5, 10, 0.4]].forEach(([x, y, s, a], k) => crystal(g, x, y, s, a, k % 2 ? '#c8442c' : '#e9764a', 'rgba(255,220,200,0.75)')); },
  dolomita(g) { [[-8, 5, 10, -0.5], [0, 1, 15, 0.1], [9, 6, 9, 0.6]].forEach(([x, y, s, a]) => crystal(g, x, y, s, a, '#f2ece2', 'rgba(255,255,255,0.95)')); g.fillStyle = 'rgba(220,180,160,0.4)'; g.beginPath(); g.ellipse(0, 12, 14, 3, 0, 0, TAU); g.fill(); },
  veta(g) {
    g.strokeStyle = '#eef2f6'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-18, 12); g.quadraticCurveTo(-4, 0, 2, -4); g.quadraticCurveTo(10, -10, 18, -14); g.stroke();
    g.lineWidth = 2.5; g.beginPath(); g.moveTo(-6, 4); g.quadraticCurveTo(0, 10, 10, 12); g.stroke();
    g.lineCap = 'butt';
  },
  oro(g) {
    g.fillStyle = radial(g, 0, 0, 15, [[0, '#fff6c0'], [0.5, '#f0c030'], [1, '#a87810']]);
    g.beginPath(); g.moveTo(-13, 2); g.quadraticCurveTo(-12, -10, -2, -10); g.quadraticCurveTo(12, -12, 13, 0); g.quadraticCurveTo(12, 11, 0, 10); g.quadraticCurveTo(-12, 12, -13, 2); g.fill();
    shine(g, -4, -5, 4, 2, 0.7);
  },
  azurita(g) { [[-8, 4, 11, -0.4], [0, 0, 14, 0.1], [9, 4, 10, 0.5]].forEach(([x, y, s, a], k) => crystal(g, x, y, s, a, k % 2 ? '#1f4fa8' : '#2f6ad0', 'rgba(170,200,255,0.8)')); g.fillStyle = 'rgba(40,160,110,0.6)'; g.beginPath(); g.ellipse(-2, 11, 12, 3, 0, 0, TAU); g.fill(); },
};

// Paint a thing at (x, y), `size` pixels across (about).
export function paint(g, kind, id, x, y, size, { dark = false } = {}) {
  const f = (kind === 'find' ? FINDS : kind === 'item' ? ITEMS : JACKPOTS)[id];
  if (!f) return;
  g.save(); g.translate(x, y); const k = size / 44; g.scale(k, k);
  f(g);
  g.restore();
  if (dark) {
    // A silhouette, for a museum shelf still waiting for its piece.
    g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(58,44,30,0.92)'; g.fillRect(x - size, y - size, size * 2, size * 2); g.restore();
  }
}

const cache = new Map();
function icon(kind, id, size, dark) {
  const key = `${kind}|${id}|${size}|${dark}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'), s = size * 2;
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.scale(2, 2);
  paint(g, kind, id, size / 2, size / 2, size * 0.9, { dark });
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
export const findIcon = (id, size = 48, dark = false) => icon('find', id, size, dark);
export const itemIcon = (id, size = 32) => icon('item', id, size, false);
