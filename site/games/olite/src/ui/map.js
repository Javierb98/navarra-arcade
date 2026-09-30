// The painted map of Olite: a smooth, storybook top-down view drawn with
// canvas paths and gradients. Coordinates are in the game's logical 960x540
// space; everything is drawn at 2x for a crisp picture on a 1080p screen.
//
// What never changes (fields, river, streets, castle) is painted once; roofs,
// walls and wells are repainted only when they change; bakers, fires,
// badges and the cursor are drawn every frame.

import { iconURL } from './icons.js';

export const T = 54; // tile size
export const OX = 14; // map origin
export const OY = 60;
const SCALE = 2;

const hash = (a, b = 0, c = 0) => {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export const tileRect = (x, y) => ({ x: OX + x * T, y: OY + y * T, w: T, h: T });

function layer(w, h) {
  const c = document.createElement('canvas');
  c.width = w * SCALE; c.height = h * SCALE;
  const ctx = c.getContext('2d');
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  return { c, ctx };
}

// Images for the unit tokens, loaded once.
const imgs = new Map();
function img(id) {
  if (!imgs.has(id)) { const i = new Image(); i.src = iconURL(id); imgs.set(id, i); }
  return imgs.get(id);
}

// ---- static ground --------------------------------------------------------------------

function paintGround(g) {
  const W = g.w * T, H = g.h * T;
  const { c, ctx } = layer(W, H);
  // Town ground: warm packed earth.
  const earth = ctx.createLinearGradient(0, 0, 0, H);
  earth.addColorStop(0, '#e2d2ae'); earth.addColorStop(1, '#d4c095');
  ctx.fillStyle = earth; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(120, 95, 60, ${0.05 + hash(i, 1) * 0.07})`;
    ctx.beginPath(); ctx.ellipse(hash(i, 2) * W, hash(i, 3) * H, 1 + hash(i, 4) * 2, 1 + hash(i, 5) * 1.5, 0, 0, Math.PI * 2); ctx.fill();
  }
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const t = g.tile(x, y), px = x * T, py = y * T;
    if (t === 'F') field(ctx, px, py, x, y);
    else if (t === '.') lot(ctx, px, py, x, y);
    else if (t === 'M') plaza(ctx, px, py);
  }
  river(ctx, g, H);
  castle(ctx, g);
  return c;
}

function field(ctx, px, py, x, y) {
  const palettes = [['#d9b95c', '#c9a445'], ['#9cbf5f', '#86aa4b'], ['#c8a36a', '#b58e56'], ['#b5c96a', '#9fb558']];
  const [a, b] = palettes[Math.floor(hash(x, y, 7) * palettes.length)];
  ctx.save();
  ctx.beginPath(); ctx.rect(px, py, T, T); ctx.clip();
  ctx.fillStyle = a; ctx.fillRect(px, py, T, T);
  ctx.translate(px + T / 2, py + T / 2);
  ctx.rotate(hash(x, y, 9) > 0.5 ? 0.35 : -0.35);
  ctx.strokeStyle = b; ctx.lineWidth = 3;
  for (let k = -T; k < T; k += 7) { ctx.beginPath(); ctx.moveTo(-T, k); ctx.lineTo(T, k); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = 'rgba(90, 110, 50, .35)'; ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
}

function tree(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(40, 50, 20, .25)';
  ctx.beginPath(); ctx.ellipse(x + r * 0.4, y + r * 0.5, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  const gr = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.2, x, y, r);
  gr.addColorStop(0, '#8cc56a'); gr.addColorStop(1, '#4d8a3a');
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

function lot(ctx, px, py, x, y) {
  const m = 5;
  ctx.fillStyle = '#b9c98a';
  roundRect(ctx, px + m, py + m, T - 2 * m, T - 2 * m, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(120, 100, 60, .35)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
  roundRect(ctx, px + m, py + m, T - 2 * m, T - 2 * m, 6); ctx.stroke(); ctx.setLineDash([]);
  if (hash(x, y, 1) > 0.4) tree(ctx, px + 14 + hash(x, y, 2) * 8, py + 14 + hash(x, y, 3) * 8, 6);
  if (hash(x, y, 4) > 0.6) tree(ctx, px + 36 + hash(x, y, 5) * 6, py + 34 + hash(x, y, 6) * 6, 5);
}

function plaza(ctx, px, py) {
  const m = 4;
  ctx.fillStyle = '#e9dcc0';
  roundRect(ctx, px + m, py + m, T - 2 * m, T - 2 * m, 5); ctx.fill();
  ctx.strokeStyle = 'rgba(150, 125, 90, .35)'; ctx.lineWidth = 1;
  for (let k = 8; k < T - 4; k += 8) { ctx.beginPath(); ctx.moveTo(px + m, py + k); ctx.lineTo(px + T - m, py + k); ctx.stroke(); }
}

function river(ctx, g, H) {
  const pts = [];
  for (let y = -10; y <= H + 10; y += 12) pts.push([T * 0.5 + Math.sin(y * 0.03) * 8, y]);
  const path = (w) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x - w, y) : ctx.moveTo(x - w, y)));
    for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0] + w, pts[i][1]);
    ctx.closePath();
  };
  ctx.fillStyle = '#b8c27f'; path(24); ctx.fill(); // green banks
  const gr = ctx.createLinearGradient(0, 0, T, 0);
  gr.addColorStop(0, '#4f93c6'); gr.addColorStop(0.5, '#6fb3dd'); gr.addColorStop(1, '#4f93c6');
  ctx.fillStyle = gr; path(16); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5;
  for (let k = 0; k < 18; k++) {
    const y = hash(k, 11) * H, x = T * 0.5 + Math.sin(y * 0.03) * 8 + (hash(k, 12) - 0.5) * 14;
    ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.quadraticCurveTo(x, y - 2, x + 4, y); ctx.stroke();
  }
}

function castle(ctx, g) {
  // The castle ground: the block of C tiles.
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.tile(x, y) === 'C') { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) return;
  const px = x0 * T + 6, py = y0 * T + 6, w = (x1 - x0 + 1) * T - 12, h = (y1 - y0 + 1) * T - 12;
  ctx.fillStyle = 'rgba(40,30,20,.3)'; roundRect(ctx, px + 4, py + 5, w, h, 6); ctx.fill();
  const st = ctx.createLinearGradient(px, py, px + w, py + h);
  st.addColorStop(0, '#e5dccb'); st.addColorStop(1, '#bfb29a');
  ctx.fillStyle = st; roundRect(ctx, px, py, w, h, 6); ctx.fill();
  ctx.fillStyle = '#d7ccb4'; roundRect(ctx, px + 10, py + 10, w - 20, h - 20, 4); ctx.fill(); // courtyard
  ctx.strokeStyle = '#9d907a'; ctx.lineWidth = 1.5; roundRect(ctx, px, py, w, h, 6); ctx.stroke();
  // Keep in the middle.
  const kx = px + w / 2 - 16, ky = py + h / 2 - 16;
  ctx.fillStyle = 'rgba(40,30,20,.35)'; ctx.fillRect(kx + 4, ky + 5, 32, 32);
  const kg = ctx.createLinearGradient(kx, ky, kx + 32, ky + 32);
  kg.addColorStop(0, '#efe7d6'); kg.addColorStop(1, '#b8aa90');
  ctx.fillStyle = kg; ctx.fillRect(kx, ky, 32, 32);
  ctx.strokeStyle = '#8f8270'; ctx.strokeRect(kx + 0.5, ky + 0.5, 31, 31);
  for (let k = 0; k < 4; k++) { ctx.fillStyle = '#a89a82'; ctx.fillRect(kx + 3 + k * 8, ky + 2, 4, 3); }
  // Round corner towers.
  for (const [tx, ty] of [[px, py], [px + w, py], [px, py + h], [px + w, py + h]]) tower(ctx, tx, ty, 10);
}

function tower(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(40,30,20,.35)'; ctx.beginPath(); ctx.arc(x + 3, y + 4, r, 0, Math.PI * 2); ctx.fill();
  const gr = ctx.createRadialGradient(x - r / 3, y - r / 3, 1, x, y, r);
  gr.addColorStop(0, '#f2ebdc'); gr.addColorStop(1, '#b3a58c');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#8f8270'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.strokeStyle = 'rgba(120,105,85,.6)'; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.arc(x, y, r - 3, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ---- houses (repainted when a block's people change) ----------------------------------------

// Where the houses of a block sit, as the block fills up.
const SPOTS = [[8, 8, 22, 16], [30, 10, 18, 14], [8, 28, 16, 18], [26, 30, 20, 14], [16, 18, 16, 12], [34, 22, 12, 16]];

function roof(ctx, x, y, w, h, seed) {
  const along = w >= h;
  ctx.fillStyle = 'rgba(50,30,20,.3)'; ctx.fillRect(x + 2.5, y + 3, w, h);
  const hue = ['#c0603c', '#b5563a', '#c96f45', '#a94d34'][Math.floor(seed * 4)];
  ctx.fillStyle = hue; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255, 220, 190, .28)';
  if (along) ctx.fillRect(x, y, w, h / 2); else ctx.fillRect(x, y, w / 2, h);
  ctx.strokeStyle = 'rgba(90, 40, 25, .45)'; ctx.lineWidth = 0.8;
  for (let k = 2; k < (along ? w : h); k += 3) {
    ctx.beginPath();
    if (along) { ctx.moveTo(x + k, y); ctx.lineTo(x + k, y + h); } else { ctx.moveTo(x, y + k); ctx.lineTo(x + w, y + k); }
    ctx.stroke();
  }
  ctx.strokeStyle = '#7d3a24'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  if (along) { ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); } else { ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(70, 35, 20, .6)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function paintBlock(b) {
  const { c, ctx } = layer(T, T);
  const m = 3;
  ctx.fillStyle = b.pop ? '#cbb98f' : '#b9c98a';
  roundRect(ctx, m, m, T - 2 * m, T - 2 * m, 5); ctx.fill();
  if (!b.pop) {
    tree(ctx, 18, 18, 6); tree(ctx, 36, 34, 7);
  } else {
    const n = Math.min(SPOTS.length, Math.ceil(b.pop * 0.9) + 1);
    for (let k = 0; k < n; k++) {
      const [x, y, w, h] = SPOTS[k];
      roof(ctx, x, y, w, h, hash(b.x, b.y, k));
    }
    if (b.pop <= 2) tree(ctx, 42, 42, 5);
  }
  return c;
}

// ---- walls and wells -------------------------------------------------------------------------

export function wallGeometry(g) {
  // The town: everything that isn't field or river.
  let x0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const t = g.tile(x, y);
    if (t !== 'F' && t !== 'R') { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  const L = x0 * T, R = (x1 + 1) * T, Tp = 5, B = (y1 + 1) * T;
  return {
    n: [[L, Tp], [R, Tp]],
    e: [[R, Tp], [R, B]],
    s: [[L, B], [R, B]],
    gate: [(L + R) / 2, B],
    corners: [[L, Tp], [R, Tp], [R, B], [L, B]],
  };
}

function paintBuilt(g) {
  const W = g.w * T, H = g.h * T;
  const { c, ctx } = layer(W, H);
  const geo = wallGeometry(g);
  const seg = (a, b, built) => {
    if (built) {
      ctx.strokeStyle = 'rgba(40,30,20,.35)'; ctx.lineWidth = 10; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a[0] + 3, a[1] + 4); ctx.lineTo(b[0] + 3, b[1] + 4); ctx.stroke();
      ctx.strokeStyle = '#c9bca3'; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.strokeStyle = '#ece4d3'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      // Battlements.
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
      ctx.fillStyle = '#a99c84';
      for (let d = 6; d < len; d += 9) ctx.fillRect(a[0] + ux * d - uy * 5 - 2, a[1] + uy * d + ux * 5 - 2, 4, 4);
    } else {
      ctx.strokeStyle = 'rgba(110, 85, 55, .55)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
    }
  };
  seg(...geo.n, g.projects.wall_n?.done);
  seg(...geo.e, g.projects.wall_e?.done);
  seg(...geo.s, g.projects.wall_s?.done);
  for (const [k, [x, y]] of geo.corners.entries()) {
    const built = [g.projects.wall_n?.done, g.projects.wall_e?.done, g.projects.wall_s?.done].filter(Boolean).length >= (k < 2 ? 1 : 2);
    if (built) tower(ctx, x, y, 9);
  }
  if (g.projects.gate?.done) {
    const [x, y] = geo.gate;
    ctx.fillStyle = 'rgba(40,30,20,.35)'; ctx.fillRect(x - 14 + 3, y - 9 + 4, 28, 18);
    ctx.fillStyle = '#d8cdb7'; ctx.fillRect(x - 14, y - 9, 28, 18);
    ctx.fillStyle = '#6b4a2b'; ctx.fillRect(x - 6, y - 9, 12, 18);
    tower(ctx, x - 15, y, 7); tower(ctx, x + 15, y, 7);
  }
  if (g.projects.market?.done) {
    const r = marketTile(g);
    if (r) {
      const px = r.x * T, py = r.y * T;
      for (const [k, col] of [[0, '#c0392b'], [1, '#2e86c1'], [2, '#e67e22']]) {
        const sx = px + 8 + (k % 2) * 20, sy = py + 8 + Math.floor(k / 2) * 20;
        ctx.fillStyle = 'rgba(40,30,20,.3)'; ctx.fillRect(sx + 2, sy + 3, 16, 12);
        ctx.fillStyle = col; ctx.fillRect(sx, sy, 16, 12);
        ctx.fillStyle = 'rgba(255,255,255,.55)'; for (let s = 2; s < 16; s += 5) ctx.fillRect(sx + s, sy, 2, 12);
      }
    }
  }
  for (const w of g.wells) {
    const x = w.x * T + T / 2, y = w.y * T + T / 2;
    ctx.fillStyle = 'rgba(40,30,20,.3)'; ctx.beginPath(); ctx.arc(x + 3, y + 4, 12, 0, Math.PI * 2); ctx.fill();
    const gr = ctx.createRadialGradient(x - 4, y - 4, 2, x, y, 12);
    gr.addColorStop(0, '#f0e8d8'); gr.addColorStop(1, '#a99c84');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3d7fb3'; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(x - 2, y - 2, 2, 0, Math.PI * 2); ctx.fill();
  }
  return c;
}

function marketTile(g) {
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.tile(x, y) === 'M') return { x, y };
  return null;
}

// ---- per frame -----------------------------------------------------------------------------------

const cache = new Map();
function cached(key, paint) {
  let v = cache.get(key);
  if (!v) { v = paint(); cache.set(key, v); if (cache.size > 300) cache.delete(cache.keys().next().value); }
  return v;
}

function flameShape(ctx, x, y, s, t, k) {
  const f = 1 + Math.sin(t * 9 + k * 2) * 0.15;
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s * f);
  const gr = ctx.createLinearGradient(0, -14, 0, 6);
  gr.addColorStop(0, '#ffd166'); gr.addColorStop(0.5, '#f39c12'); gr.addColorStop(1, '#d35400');
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.moveTo(0, -14); ctx.bezierCurveTo(7, -6, 8, 0, 5, 5); ctx.quadraticCurveTo(0, 9, -5, 5); ctx.bezierCurveTo(-8, 0, -5, -5, 0, -14);
  ctx.fill();
  ctx.restore();
}

function badge(ctx, b) {
  if (!b.pop) return;
  const x = OX + b.x * T + T - 4, y = OY + b.y * T + T - 4;
  const text = `${Math.min(b.supply, 99)}/${b.pop}`;
  ctx.font = 'bold 9px "Trebuchet MS", sans-serif';
  const w = ctx.measureText(text).width + 17;
  ctx.fillStyle = b.fed ? 'rgba(20, 110, 80, .92)' : 'rgba(190, 70, 20, .95)';
  roundRect(ctx, x - w, y - 13, w, 13, 6.5); ctx.fill();
  // A loaf: filled when fed, an outline when not (shape as well as colour).
  ctx.beginPath(); ctx.ellipse(x - w + 7, y - 6.5, 4.5, 3, 0, 0, Math.PI * 2);
  if (b.fed) { ctx.fillStyle = '#f0c27f'; ctx.fill(); } else { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.3; ctx.stroke(); }
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(text, x - w + 13, y - 6);
}

function token(ctx, u, g, t, ring) {
  const x = OX + u.x * T + T / 2, y = OY + u.y * T + T / 2;
  if (u.id === 'oven') {
    ctx.fillStyle = 'rgba(40,30,20,.35)'; ctx.beginPath(); ctx.arc(x + 3, y + 4, 15, 0, Math.PI * 2); ctx.fill();
    const gr = ctx.createRadialGradient(x - 5, y - 5, 2, x, y, 15);
    gr.addColorStop(0, '#efe6d4'); gr.addColorStop(1, '#a3957c');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.fill();
    const glow = 0.6 + Math.sin(t * 5) * 0.2;
    ctx.fillStyle = `rgba(243, 156, 18, ${glow})`; ctx.beginPath(); ctx.arc(x, y + 6, 6, Math.PI, 0); ctx.fill();
    ctx.fillStyle = 'rgba(230,230,235,.5)';
    for (let k = 0; k < 3; k++) { const f = (t * 0.4 + k / 3) % 1; ctx.beginPath(); ctx.arc(x + Math.sin(f * 6 + k) * 3, y - 10 - f * 22, 2 + f * 3, 0, Math.PI * 2); ctx.fill(); }
    return;
  }
  const bob = Math.sin(t * 3 + u.uid) * 1.2;
  ctx.fillStyle = 'rgba(40,30,20,.35)'; ctx.beginPath(); ctx.ellipse(x + 2, y + 13, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fbf6ea'; ctx.beginPath(); ctx.arc(x, y + bob, 15, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = ring; ctx.lineWidth = 3; ctx.stroke();
  const im = img(u.id);
  if (im.complete) ctx.drawImage(im, x - 13, y - 13 + bob, 26, 26);
  if (u.moved && g.cardDefs[u.id].movable) { ctx.fillStyle = 'rgba(40,30,20,.55)'; ctx.beginPath(); ctx.arc(x + 11, y - 11 + bob, 4, 0, Math.PI * 2); ctx.fill(); }
}

// Draw the whole map. `ui` may carry: cursors [{x,y,colour}], highlight
// {tiles:[{x,y}], cover:{x,y}} for placement previews.
export function drawMap(ctx, g, t, ui = {}) {
  const W = g.w * T, H = g.h * T;
  // Frame.
  ctx.fillStyle = 'rgba(0,0,0,.35)'; roundRect(ctx, OX - 4 + 4, OY - 4 + 5, W + 8, H + 8, 10); ctx.fill();
  ctx.fillStyle = '#6e5433'; roundRect(ctx, OX - 4, OY - 4, W + 8, H + 8, 10); ctx.fill();
  ctx.save();
  roundRect(ctx, OX, OY, W, H, 7); ctx.clip();
  ctx.drawImage(cached(`ground.${g.stageDef.id}`, () => paintGround(g)), OX, OY, W, H);
  for (const b of g.blocks) ctx.drawImage(cached(`b.${b.x}.${b.y}.${b.pop}`, () => paintBlock(b)), OX + b.x * T, OY + b.y * T, T, T);
  const builtKey = `built.${['market', 'wall_n', 'wall_e', 'wall_s', 'gate'].map((k) => (g.projects[k]?.done ? 1 : 0)).join('')}.${g.wells.map((w) => `${w.x},${w.y}`).join(';')}`;
  ctx.drawImage(cached(builtKey, () => paintBuilt(g)), OX, OY, W, H);

  // Placement preview: where a baker or oven would reach.
  if (ui.cover) {
    ctx.fillStyle = 'rgba(255, 214, 102, .28)';
    ctx.fillRect(OX + (ui.cover.x - 1) * T, OY + (ui.cover.y - 1) * T, T * 3, T * 3);
  }
  for (const h of ui.tiles ?? []) {
    ctx.fillStyle = h.bad ? 'rgba(190,70,20,.18)' : 'rgba(255,255,255,.22)';
    ctx.fillRect(OX + h.x * T + 2, OY + h.y * T + 2, T - 4, T - 4);
  }
  // Fires.
  for (const b of g.blocks.filter((x) => x.burning)) {
    const cx = OX + b.x * T + T / 2, cy = OY + b.y * T + T / 2;
    ctx.fillStyle = 'rgba(70,70,75,.35)';
    for (let k = 0; k < 4; k++) { const f = (t * 0.5 + k / 4) % 1; ctx.beginPath(); ctx.arc(cx + Math.sin(f * 5 + k) * 6, cy - 6 - f * 30, 4 + f * 6, 0, Math.PI * 2); ctx.fill(); }
    flameShape(ctx, cx - 10, cy + 6, 1.1, t, 0); flameShape(ctx, cx + 9, cy + 8, 0.9, t, 1); flameShape(ctx, cx, cy, 1.4, t, 2);
  }
  // Units.
  for (const u of g.units) token(ctx, u, g, t, u.id === 'firewatch' ? '#2e86c1' : '#e0a030');
  for (const b of g.blocks) badge(ctx, b);
  // Castle flag.
  const flag = g.tiles.findIndex((row) => row.includes('C'));
  if (flag >= 0) {
    const fx = OX + (g.tiles[flag].indexOf('C') + 1) * T, fy = OY + flag * T + T - 4;
    ctx.fillStyle = '#5b4632'; ctx.fillRect(fx - 1, fy - 22, 2, 22);
    const wv = Math.sin(t * 4) * 2;
    ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(fx + 1, fy - 22); ctx.quadraticCurveTo(fx + 8, fy - 20 + wv, fx + 16, fy - 21); ctx.lineTo(fx + 16, fy - 12); ctx.quadraticCurveTo(fx + 8, fy - 11 + wv, fx + 1, fy - 13); ctx.fill();
    ctx.fillStyle = '#f4c542'; ctx.fillRect(fx + 5, fy - 18, 7, 1.5);
  }
  ctx.restore();
  // Cursors.
  for (const c of ui.cursors ?? []) {
    const a = 0.6 + Math.sin(t * 5) * 0.3;
    ctx.strokeStyle = c.colour; ctx.globalAlpha = a; ctx.lineWidth = 3;
    roundRect(ctx, OX + c.x * T + 2, OY + c.y * T + 2, T - 4, T - 4, 6); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

export function clearMapCache() { cache.clear(); }
