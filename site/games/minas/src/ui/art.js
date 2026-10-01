// Paints the mine: a cross-section of Navarre's mines, newest on top and
// oldest at the bottom, with the village above. Smooth shapes and soft light, never pixel art. Everything is in stage
// pixels (960x540; the canvas is 2x). One tile is TS pixels.
//
// drawView(g, mine, cam, view, t, fx, labels) paints one view (the whole
// stage for one player, or one half each for two) with its own camera.

import { SURFACE } from '../core/minas.js';

export const TS = 48;
export const W = 960, H = 540;

// ---- colours ------------------------------------------------------------------------------------

// Rock and tunnel-wall colours for each layer card, top to bottom.
const LAYER = {
  potasas: { rock: [168, 118, 96], wall: [60, 38, 30], line: [140, 94, 76] },
  hierro: { rock: [124, 96, 82], wall: [44, 32, 28], line: [100, 74, 62] },
  cobre: { rock: [112, 116, 104], wall: [38, 40, 36], line: [88, 98, 84] },
  romanos: { rock: [150, 128, 96], wall: [52, 42, 30], line: [124, 104, 76] },
  bronce: { rock: [82, 92, 92], wall: [26, 30, 32], line: [70, 96, 86] },
};
const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const rgb = (c, a = 1) => (a === 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);

// A stable pseudo-random number for a tile, so the texture doesn't flicker.
const hash = (x, y, s = 0) => {
  let n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

// The layer at a depth, blended softly across the boundary between layers.
function layerAt(mine, y) {
  const L = mine.R.layers;
  const i = Math.max(0, L.findIndex((l) => y < l.to));
  const here = LAYER[L[i]?.card ?? 'bronce'];
  const next = L[i + 1] && LAYER[L[i + 1].card];
  const k = next ? Math.max(0, Math.min(1, (y - (L[i].to - 1.5)) / 1.5)) * 0.5 : 0;
  if (!next || k <= 0) return here;
  return { rock: mix(here.rock, next.rock, k), wall: mix(here.wall, next.wall, k), line: mix(here.line, next.line, k) };
}

// ---- cameras ------------------------------------------------------------------------------------

// Where a view's camera wants to be (top-left corner, in tiles).
export function camTarget(mine, p, viewW) {
  const cols = viewW / TS, rows = H / TS;
  const x = Math.max(0, Math.min(mine.W - cols, p.x - cols / 2));
  const y = Math.max(-2.6, Math.min(mine.H - rows, p.y - rows * 0.42));
  return { x, y };
}

// ---- the view ------------------------------------------------------------------------------------

export function drawView(g, mine, cam, view, t, fx = [], labels = {}) {
  const { x: vx, w: vw } = view;
  g.save();
  g.beginPath(); g.rect(vx, 0, vw, H); g.clip();
  g.translate(vx, 0);
  const sx = (wx) => (wx - cam.x) * TS, sy = (wy) => (wy - cam.y) * TS;
  const surfY = sy(SURFACE);

  if (surfY > 0) drawSky(g, mine, cam, vw, surfY, t, labels);

  // Rows of rock, then the tunnels cut into them.
  const x0 = Math.max(0, Math.floor(cam.x)), x1 = Math.min(mine.W - 1, Math.ceil(cam.x + vw / TS));
  const y0 = Math.max(SURFACE, Math.floor(cam.y)), y1 = Math.min(mine.H - 1, Math.ceil(cam.y + H / TS));
  for (let y = y0; y <= y1; y++) {
    const c = layerAt(mine, y);
    g.fillStyle = rgb(c.rock);
    g.fillRect(sx(x0), sy(y), (x1 - x0 + 1) * TS, TS + 1);
  }
  // Soft strata: gently waving lines across the rock.
  g.lineWidth = 2;
  for (let y = y0; y <= y1; y++) {
    const c = layerAt(mine, y);
    g.strokeStyle = rgb(c.line, 0.55);
    g.beginPath();
    const off = hash(0, y, 3) * TS;
    for (let px = sx(x0); px <= sx(x1 + 1); px += 24) {
      const wy = sy(y) + off + Math.sin(px / 90 + y) * 4;
      if (px === sx(x0)) g.moveTo(px, wy); else g.lineTo(px, wy);
    }
    g.stroke();
  }
  // Pebbles and the texture of each solid tile.
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const tile = mine.tiles[y][x];
    if (!tile.rock) continue;
    const c = layerAt(mine, y), px = sx(x), py = sy(y);
    for (let k = 0; k < 3; k++) {
      const h1 = hash(x, y, k), h2 = hash(x, y, k + 7);
      g.fillStyle = rgb(h1 > 0.5 ? mix(c.rock, [255, 255, 255], 0.12) : mix(c.rock, [0, 0, 0], 0.14), 0.8);
      g.beginPath(); g.ellipse(px + 6 + h1 * (TS - 12), py + 6 + h2 * (TS - 12), 2 + h2 * 4, 1.5 + h1 * 2.5, h1 * 3, 0, Math.PI * 2); g.fill();
    }
    const band = mine.R.layers.find((l) => y < l.to) ?? mine.R.layers.at(-1);
    if (tile.rock > band.rock) drawBoulder(g, px, py, x, y, !mine.canDig(tile));
    if (tile.loose) drawLoose(g, px, py, x, y, tile.falling ? t : 0);
    if (tile.ore) drawOre(g, tile.ore, px, py, x, y, t);
  }
  drawTunnels(g, mine, sx, sy, x0, x1, y0, y1);
  drawCave(g, mine, sx, sy, x0, x1, y0, y1, t);
  drawShaft(g, mine, sx, sy, y0, y1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (mine.tiles[y][x].ladder) drawLadder(g, sx(x), sy(y), mine.levels.ladders, x, y);
  for (const r of mine.rocks) if (r.wait <= 0) drawFallingRock(g, sx(r.x), sy(r.fy), r.x, r.y);
  // Grass along the village floor.
  if (surfY > -10 && surfY < H) drawGrass(g, mine, sx, surfY, x0, x1);

  for (const p of mine.miners) drawMiner(g, mine, p, sx(p.x), sy(p.y), t);
  drawFx(g, fx, sx, sy);
  drawDark(g, mine, cam, vw, sx, sy);
  g.restore();
}

// ---- sky and village -------------------------------------------------------------------------------

function drawSky(g, mine, cam, vw, surfY, t, labels) {
  const sky = g.createLinearGradient(0, surfY - 6 * TS, 0, surfY);
  sky.addColorStop(0, '#7fb6dc'); sky.addColorStop(0.7, '#cfe3e6'); sky.addColorStop(1, '#f1e4c4');
  g.fillStyle = sky; g.fillRect(0, 0, vw, surfY);
  // Soft clouds drifting.
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (let k = 0; k < 4; k++) {
    const cx = ((k * 330 + t * (6 + k * 2) - cam.x * TS * 0.2) % (vw + 300)) - 150, cy = surfY - 4.6 * TS + k * 14 + (k % 2) * 20;
    for (let j = 0; j < 4; j++) { g.beginPath(); g.ellipse(cx + j * 22, cy + Math.sin(j * 2) * 5, 26 - j * 2, 12, 0, 0, Math.PI * 2); g.fill(); }
  }
  // Far mountains (the Pyrenees, blue with snow) and near green hills.
  const ridge = (base, amp, par, col, snow) => {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, surfY);
    const pts = [];
    for (let px = 0; px <= vw + 20; px += 20) {
      const wx = px + cam.x * TS * par;
      const y = base - amp * (0.55 + 0.3 * Math.sin(wx / 140) + 0.15 * Math.sin(wx / 47 + 1.3));
      pts.push([px, y]); g.lineTo(px, y);
    }
    g.lineTo(vw + 20, surfY); g.closePath(); g.fill();
    if (snow) {
      g.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 1; i < pts.length - 1; i++) if (pts[i][1] < pts[i - 1][1] && pts[i][1] < pts[i + 1][1] && pts[i][1] < base - amp * 0.75) {
        g.beginPath(); g.moveTo(pts[i][0] - 12, pts[i][1] + 10); g.lineTo(pts[i][0], pts[i][1]); g.lineTo(pts[i][0] + 12, pts[i][1] + 10); g.closePath(); g.fill();
      }
    }
  };
  ridge(surfY - 1.6 * TS, 2.4 * TS, 0.25, '#8aa0bd', true);
  ridge(surfY - 0.4 * TS, 1.3 * TS, 0.5, '#7d9a5c', false);
  ridge(surfY + 2, 0.6 * TS, 0.7, '#6c8a4c', false);
  // The village buildings, standing on the surface.
  const sx = (wx) => (wx - cam.x) * TS;
  for (const b of mine.R.buildings) drawBuilding(g, b.id, sx(b.x), surfY, b.w * TS, t, labels[b.id], mine);
}

function drawBuilding(g, id, cx, floor, w, t, label, mine) {
  g.save();
  g.translate(cx, floor);
  g.fillStyle = 'rgba(40,30,20,0.25)'; g.beginPath(); g.ellipse(0, 0, w / 2 + 6, 5, 0, 0, Math.PI * 2); g.fill();
  let top = -80;
  if (id === 'pozo') {
    // The pithead over the old shaft: a timber frame, then a windlass, then
    // a steel headframe with its wheel.
    const L = mine?.levels.shaft ?? 0;
    if (L < 2) {
      g.strokeStyle = '#6a4424'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(-w / 2 + 2, 0); g.lineTo(-6, -60); g.moveTo(w / 2 - 2, 0); g.lineTo(6, -60); g.moveTo(-14, -60); g.lineTo(14, -60); g.stroke();
      if (L === 1) {
        g.fillStyle = '#7a5434'; g.beginPath(); g.arc(0, -46, 9, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#4e341f'; g.lineWidth = 2; for (let k = 0; k < 4; k++) { const a = t * 2 + k * Math.PI / 2; g.beginPath(); g.moveTo(0, -46); g.lineTo(Math.cos(a) * 9, -46 + Math.sin(a) * 9); g.stroke(); }
        g.strokeStyle = '#c8b080'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(9, -46); g.lineTo(9, 0); g.stroke();
      }
      top = -84;
    } else {
      g.strokeStyle = '#5a6670'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(-8, -100); g.moveTo(w / 2, 0); g.lineTo(8, -100); g.moveTo(-w / 2 + 10, -40); g.lineTo(w / 2 - 10, -40); g.moveTo(-w / 2 + 6, -40); g.lineTo(8, -100); g.stroke();
      g.strokeStyle = '#3a444c'; g.lineWidth = 3; g.beginPath(); g.arc(0, -100, 14, 0, Math.PI * 2); g.stroke();
      for (let k = 0; k < 6; k++) { const a = t + k * Math.PI / 3; g.beginPath(); g.moveTo(0, -100); g.lineTo(Math.cos(a) * 14, -100 + Math.sin(a) * 14); g.stroke(); }
      top = -132;
    }
  } else if (id === 'taller') {
    // The workshop and forge: stone walls, a tiled roof, a glowing door.
    g.fillStyle = '#c9b48f'; g.fillRect(-w / 2, -64, w, 64);
    g.fillStyle = 'rgba(120,100,70,0.35)';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) { g.beginPath(); g.ellipse(-w / 2 + 10 + c * (w / 6) + (r % 2) * 8, -56 + r * 15, 8, 5, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#9b4a32'; g.beginPath(); g.moveTo(-w / 2 - 10, -62); g.lineTo(0, -96); g.lineTo(w / 2 + 10, -62); g.closePath(); g.fill();
    g.fillStyle = '#6b6058'; g.fillRect(w / 4, -108, 14, 36);
    for (let k = 0; k < 3; k++) { const ph = (t * 0.5 + k / 3) % 1; g.fillStyle = `rgba(200,200,200,${0.5 * (1 - ph)})`; g.beginPath(); g.arc(w / 4 + 7 + ph * 14, -112 - ph * 40, 6 + ph * 10, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#5a3a22'; roundRect(g, -22, -46, 44, 46, 20); g.fill();
    g.fillStyle = `rgba(255,${150 + 30 * Math.sin(t * 3)},60,0.6)`; roundRect(g, -16, -38, 32, 38, 15); g.fill();
    // Ladders stacked by the wall.
    g.strokeStyle = '#7a5434'; g.lineWidth = 2.5;
    for (let k = 0; k < 2; k++) { const lx = -w / 2 - 8 + k * 6; g.beginPath(); g.moveTo(lx, 0); g.lineTo(lx + 10, -52); g.stroke(); }
    top = -128;
  } else if (id === 'lampisteria') {
    // The lamp room: a small hut with lamps hanging in its window.
    g.fillStyle = '#e2d2b0'; g.fillRect(-w / 2, -54, w, 54);
    g.fillStyle = '#6a4a2a'; g.beginPath(); g.moveTo(-w / 2 - 6, -52); g.lineTo(0, -74); g.lineTo(w / 2 + 6, -52); g.closePath(); g.fill();
    g.fillStyle = '#2e3a46'; g.fillRect(-w / 2 + 8, -44, w - 16, 22);
    for (let k = 0; k < 3; k++) {
      const lx = -w / 2 + 16 + k * (w - 32) / 2, fl = 0.7 + 0.3 * Math.sin(t * 9 + k);
      g.strokeStyle = '#8a8f96'; g.lineWidth = 1; g.beginPath(); g.moveTo(lx, -44); g.lineTo(lx, -36); g.stroke();
      g.fillStyle = `rgba(255,210,120,${fl})`; g.beginPath(); g.arc(lx, -32, 3.5, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#5a3a22'; g.fillRect(-7, -18, 14, 18);
    top = -98;
  } else {
    // The weighbridge office, with its scale and a cart.
    g.fillStyle = '#e8dcc0'; g.fillRect(-w / 2, -70, w * 0.62, 70);
    g.fillStyle = '#8c3a2a'; g.fillRect(-w / 2 - 4, -76, w * 0.62 + 8, 8);
    g.fillStyle = '#4a6a8a'; roundRect(g, -w / 2 + 10, -58, 18, 22, 3); g.fill(); roundRect(g, -w / 2 + 36, -58, 18, 22, 3); g.fill();
    g.fillStyle = '#6b4a2a'; roundRect(g, -w / 2 + 20, -30, 22, 30, 3); g.fill();
    g.fillStyle = '#5a5a5a'; g.fillRect(w * 0.12 - 10, -4, 56, 4);
    g.fillStyle = '#7a5434'; roundRect(g, w * 0.12, -24, 36, 18, 3); g.fill();
    g.fillStyle = '#2f2a26'; g.beginPath(); g.arc(w * 0.12 + 8, -4, 5, 0, Math.PI * 2); g.arc(w * 0.12 + 28, -4, 5, 0, Math.PI * 2); g.fill();
    top = -100;
  }
  if (label) {
    g.font = 'bold 13px "Palatino Linotype", Palatino, Georgia, serif';
    const tw = g.measureText(label).width + 14;
    g.fillStyle = 'rgba(58,42,26,0.85)'; roundRect(g, -tw / 2, top, tw, 20, 6); g.fill();
    g.fillStyle = '#f4e8cb'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, 0, top + 10.5);
  }
  g.restore();
}

function drawGrass(g, mine, sx, surfY, x0, x1) {
  for (let x = x0; x <= x1; x++) {
    if (!mine.tiles[SURFACE][x].rock) continue;
    const px = sx(x);
    g.fillStyle = '#6f9a45'; g.fillRect(px, surfY - 1, TS + 1, 7);
    g.fillStyle = '#86b356';
    for (let k = 0; k < 5; k++) { const hx = px + 3 + k * 8 + hash(x, k) * 4; g.beginPath(); g.moveTo(hx - 3, surfY + 2); g.lineTo(hx, surfY - 5 - hash(k, x) * 4); g.lineTo(hx + 3, surfY + 2); g.fill(); }
  }
}

// ---- tunnels -------------------------------------------------------------------------------------------

function drawTunnels(g, mine, sx, sy, x0, x1, y0, y1) {
  const open = (x, y) => y < SURFACE || (x >= 0 && x < mine.W && y < mine.H && !mine.tiles[y][x].rock);
  const r = 12;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!open(x, y) || y < SURFACE || mine.tiles[y][x].cave) continue;
    const c = layerAt(mine, y), px = sx(x), py = sy(y);
    // The dug-out wall behind, darker at the top like a shadow.
    const grad = g.createLinearGradient(0, py, 0, py + TS);
    grad.addColorStop(0, rgb(mix(c.wall, [0, 0, 0], 0.25))); grad.addColorStop(1, rgb(c.wall));
    g.fillStyle = grad; g.fillRect(px - 0.5, py - 0.5, TS + 1, TS + 1);
    // Round the inside corners where rock meets rock.
    g.fillStyle = rgb(c.rock);
    const corner = (cx, cy, dx, dy) => { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + dx * r, cy); g.quadraticCurveTo(cx, cy, cx, cy + dy * r); g.closePath(); g.fill(); };
    const up = open(x, y - 1), dn = open(x, y + 1), lf = open(x - 1, y), rt = open(x + 1, y);
    if (!up && !lf) corner(px, py, 1, 1);
    if (!up && !rt) corner(px + TS, py, -1, 1);
    if (!dn && !lf) corner(px, py + TS, 1, -1);
    if (!dn && !rt) corner(px + TS, py + TS, -1, -1);
    // A lit floor edge and a shaded ceiling.
    if (!dn) { g.fillStyle = rgb(mix(c.rock, [255, 255, 255], 0.15), 0.5); g.fillRect(px + (lf ? 0 : r), py + TS - 3, TS - (lf ? 0 : r) - (rt ? 0 : r), 3); }
    if (!up) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px + (lf ? 0 : r), py, TS - (lf ? 0 : r) - (rt ? 0 : r), 4); }
    // A little texture on the bare wall.
    g.fillStyle = 'rgba(255,255,255,0.04)';
    g.beginPath(); g.ellipse(px + 10 + hash(x, y, 40) * 28, py + 10 + hash(x, y, 41) * 28, 6, 3, hash(x, y, 42) * 3, 0, Math.PI * 2); g.fill();
    // Timber props, as real mines shored up their shafts and galleries.
    const wood = '#7a5434', woodDark = '#4e341f';
    if (!lf && !rt && y % 3 === 0) {
      g.fillStyle = woodDark; g.fillRect(px, py + TS / 2 - 3, TS, 7);
      g.fillStyle = wood; g.fillRect(px, py + TS / 2 - 4, TS, 5);
    } else if (!up && !dn && x % 3 === 0) {
      g.fillStyle = wood; g.fillRect(px + 4, py + 2, 5, TS - 2); g.fillRect(px + TS - 9, py + 2, 5, TS - 2);
      g.fillStyle = woodDark; g.fillRect(px + 2, py, TS - 4, 6);
    }
  }
}

// ---- rocks and ores ------------------------------------------------------------------------------------------

function drawBoulder(g, px, py, x, y, tooHard) {
  // A harder lump: a rounded blue-grey stone with a crack. Too hard for the
  // drill yet: darker, with a steel sheen, so players learn to go round.
  const c = tooHard ? [78, 84, 98] : [122, 122, 128];
  g.fillStyle = rgb(c);
  g.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, rr = 15 + hash(x, y, k) * 4;
    const qx = px + TS / 2 + Math.cos(a) * rr * TS / 40, qy = py + TS / 2 + Math.sin(a) * rr * 0.9 * TS / 40;
    if (k === 0) g.moveTo(qx, qy); else g.lineTo(qx, qy);
  }
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(px + 15, py + 13, 7, 4, -0.5, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(px + 15, py + 16); g.lineTo(px + 22, py + 22); g.lineTo(px + 19, py + 27); g.lineTo(px + 27, py + 32); g.stroke();
  if (tooHard) { g.strokeStyle = 'rgba(200,220,255,0.35)'; g.lineWidth = 2; g.beginPath(); g.arc(px + TS / 2, py + TS / 2, 12, -2.4, -1.2); g.stroke(); }
}

function crystal(g, x, y, s, a, body, light) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = body; g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.6, -s * 0.2); g.lineTo(s * 0.45, s * 0.8); g.lineTo(-s * 0.45, s * 0.8); g.lineTo(-s * 0.6, -s * 0.2); g.closePath(); g.fill();
  g.fillStyle = light; g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.6, -s * 0.2); g.lineTo(0, 0); g.closePath(); g.fill();
  g.restore();
}

function drawOre(g, ore, px, py, x, y, t) {
  const cx = px + TS / 2, cy = py + TS / 2, h1 = hash(x, y, 11), h2 = hash(x, y, 12);
  if (ore === 'sal') {
    // Halite: pale pinkish cubes.
    for (let k = 0; k < 4; k++) {
      const ox = cx - 10 + hash(x, y, k + 20) * 20, oy = cy - 9 + hash(x, y, k + 30) * 18, s = 5 + hash(x, y, k + 40) * 4;
      g.save(); g.translate(ox, oy); g.rotate(hash(x, y, k) * 0.8 - 0.4);
      g.fillStyle = '#f6eee8'; g.fillRect(-s, -s, s * 2, s * 2);
      g.fillStyle = '#e3c9c4'; g.fillRect(-s, s * 0.3, s * 2, s * 0.7);
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(-s + 1, -s + 1, s * 0.8, s * 0.5);
      g.restore();
    }
  } else if (ore === 'potasa') {
    // Sylvinite: red and orange crystals in a cluster.
    for (let k = 0; k < 5; k++) crystal(g, cx - 11 + hash(x, y, k + 50) * 22, cy - 6 + hash(x, y, k + 60) * 14, 6 + hash(x, y, k + 70) * 4, hash(x, y, k + 80) - 0.5, k % 2 ? '#d0573a' : '#e98a52', 'rgba(255,220,190,0.7)');
  } else if (ore === 'magnesita') {
    // Magnesite: chalky cream nodules.
    for (let k = 0; k < 4; k++) {
      const ox = cx - 10 + hash(x, y, k + 90) * 20, oy = cy - 8 + hash(x, y, k + 91) * 16, s = 6 + hash(x, y, k + 92) * 4;
      g.fillStyle = '#efe6cf'; g.beginPath(); g.ellipse(ox, oy, s, s * 0.8, h1 * 3, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(160,150,130,0.6)'; g.beginPath(); g.ellipse(ox + 2, oy + 2, s * 0.5, s * 0.35, 0, 0, Math.PI * 2); g.fill();
    }
  } else if (ore === 'hierro') {
    // Iron ore: rusty red-brown lumps with metallic glints.
    for (let k = 0; k < 4; k++) {
      const ox = cx - 10 + hash(x, y, k + 100) * 20, oy = cy - 8 + hash(x, y, k + 101) * 16, s = 6 + hash(x, y, k + 102) * 4;
      g.fillStyle = k % 2 ? '#7e2f1e' : '#9c4a2a'; g.beginPath(); g.ellipse(ox, oy, s, s * 0.85, h2 * 3, 0, Math.PI * 2); g.fill();
    }
    const glint = 0.5 + 0.5 * Math.sin(t * 3 + x + y);
    g.fillStyle = `rgba(220,225,235,${0.5 + glint * 0.4})`;
    for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(cx - 8 + hash(x, y, k + 110) * 16, cy - 8 + hash(x, y, k + 111) * 16, 1.6, 0, Math.PI * 2); g.fill(); }
  } else if (ore === 'fosil') {
    // An ammonite: a ribbed spiral shell.
    g.fillStyle = '#e8dcc0'; g.beginPath(); g.arc(cx, cy, 13, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8a7556'; g.lineWidth = 2; g.beginPath();
    for (let a = 0; a < Math.PI * 5; a += 0.2) { const rr = 12 * Math.exp(-a * 0.16); const qx = cx + Math.cos(a + h1 * 6) * rr, qy = cy + Math.sin(a + h1 * 6) * rr; if (a === 0) g.moveTo(qx, qy); else g.lineTo(qx, qy); }
    g.stroke();
    g.strokeStyle = 'rgba(138,117,86,0.6)'; g.lineWidth = 1;
    for (let a = 0; a < Math.PI * 2; a += 0.45) { g.beginPath(); g.moveTo(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7); g.lineTo(cx + Math.cos(a) * 12.5, cy + Math.sin(a) * 12.5); g.stroke(); }
  } else if (ore === 'cobre') {
    // Native copper: warm, metallic nuggets.
    for (let k = 0; k < 4; k++) {
      const ox = cx - 10 + hash(x, y, k + 130) * 20, oy = cy - 8 + hash(x, y, k + 131) * 16, s = 5 + hash(x, y, k + 132) * 4;
      const gr = g.createRadialGradient(ox - 2, oy - 2, 1, ox, oy, s);
      gr.addColorStop(0, '#ffd0a0'); gr.addColorStop(0.5, '#d9803a'); gr.addColorStop(1, '#8a4a1e');
      g.fillStyle = gr; g.beginPath(); g.ellipse(ox, oy, s, s * 0.8, h1 * 3, 0, Math.PI * 2); g.fill();
    }
  } else if (ore === 'plata') {
    // Silver: pale threads with bright glints.
    g.strokeStyle = '#dfe4ea'; g.lineWidth = 2.5; g.lineCap = 'round';
    for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(cx - 12 + k * 8, cy + 10); g.quadraticCurveTo(cx - 6 + k * 6 + h1 * 6, cy, cx - 8 + k * 9, cy - 11); g.stroke(); }
    const glint = 0.5 + 0.5 * Math.sin(t * 4 + x * 2 + y);
    g.fillStyle = `rgba(255,255,255,${0.4 + glint * 0.6})`; g.beginPath(); g.arc(cx + 4, cy - 4, 2.2, 0, Math.PI * 2); g.fill();
  } else if (ore === 'galena') {
    // Galena: grey metallic cubes.
    for (let k = 0; k < 3; k++) {
      const ox = cx - 9 + hash(x, y, k + 140) * 18, oy = cy - 8 + hash(x, y, k + 141) * 16, sz = 6 + hash(x, y, k + 142) * 3;
      g.fillStyle = '#7d848c'; g.fillRect(ox - sz, oy - sz, sz * 2, sz * 2);
      g.fillStyle = '#b8c0c8'; g.fillRect(ox - sz, oy - sz, sz * 2, sz * 0.6);
      g.fillStyle = '#5a6068'; g.fillRect(ox + sz * 0.4, oy - sz, sz * 0.6, sz * 2);
    }
  } else if (ore === 'malaquita') {
    // Malachite: green, banded.
    for (let k = 0; k < 3; k++) {
      const ox = cx - 8 + hash(x, y, k + 150) * 16, oy = cy - 7 + hash(x, y, k + 151) * 14, s = 7 + hash(x, y, k + 152) * 3;
      g.fillStyle = '#1f8a5a'; g.beginPath(); g.ellipse(ox, oy, s, s * 0.85, h2 * 3, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#7fd8a8'; g.lineWidth = 1.5;
      for (let r = s * 0.35; r < s; r += s * 0.3) { g.beginPath(); g.ellipse(ox, oy, r, r * 0.85, h2 * 3, 0, Math.PI * 2); g.stroke(); }
    }
  } else if (ore === 'moneda') {
    // A Roman silver coin, half buried.
    g.fillStyle = '#cfd4da'; g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8a9098'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, 8, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#9aa0a8'; g.beginPath(); g.ellipse(cx + 1, cy, 3.5, 5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(cx - 4, cy - 4, 2, 0, Math.PI * 2); g.fill();
  } else if (ore === 'lucerna') {
    // A clay oil lamp.
    g.fillStyle = '#b5683a'; g.beginPath(); g.ellipse(cx - 2, cy + 2, 11, 7, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(cx + 6, cy - 1); g.lineTo(cx + 15, cy + 1); g.lineTo(cx + 7, cy + 6); g.closePath(); g.fill();
    g.fillStyle = '#7d4222'; g.beginPath(); g.arc(cx - 3, cy, 3, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#d8946a'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(cx - 2, cy + 1, 7, 4, 0, Math.PI, Math.PI * 2); g.stroke();
  } else if (ore === 'hacha') {
    // A bronze axe head.
    g.fillStyle = '#b8863a'; g.beginPath(); g.moveTo(cx - 10, cy - 4); g.lineTo(cx + 4, cy - 6); g.quadraticCurveTo(cx + 14, cy, cx + 4, cy + 8); g.lineTo(cx - 10, cy + 4); g.closePath(); g.fill();
    g.fillStyle = '#5e9a7a'; g.globalAlpha = 0.5; g.beginPath(); g.ellipse(cx - 4, cy + 1, 5, 3, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    g.fillStyle = 'rgba(255,230,170,0.6)'; g.fillRect(cx - 8, cy - 4, 10, 2);
  } else if (ore === 'air') {
    // Bad air: faint bubbles rising in the rock, easy to miss.
    for (let k = 0; k < 3; k++) {
      const ph = (t * 0.4 + hash(x, y, k + 120)) % 1;
      g.fillStyle = `rgba(190,230,170,${0.28 * Math.sin(ph * Math.PI)})`;
      g.beginPath(); g.arc(cx - 8 + k * 8, cy + 10 - ph * 20, 3 + k, 0, Math.PI * 2); g.fill();
    }
  }
}

// ---- the steam drill --------------------------------------------------------------------------------------------

// ---- the miners ---------------------------------------------------------------------------------

const PLAYER = [{ shirt: '#d9822b', dark: '#9a5418' }, { shirt: '#3d8fd0', dark: '#245d8f' }];

// A miner, side on: walking, climbing or swinging the tool. What they carry
// changes with the ages: the tool, the light, the helmet and the load.
function drawMiner(g, mine, p, x, y, t) {
  const col = PLAYER[p.i], L = mine.levels, f = p.face || 1, u = TS / 48;
  g.save(); g.translate(x, y + TS * 0.4); g.scale(u, u);
  const step = Math.sin(p.walk * 7), climbing = p.climbing, dig = p.dig;
  const swing = dig ? Math.sin(t * (10 + L.pick * 4)) : 0;
  // Shadow.
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(0, 0, 12, 3, 0, 0, Math.PI * 2); g.fill();
  // The load on the back: a basket, a sack, a pack or (best) it rides in a cart.
  const n = p.cargo.length, cap = mine.stat('bag');
  if (n && L.bag < 3) {
    const k = Math.min(1, n / cap), bx = -f * 9;
    g.fillStyle = L.bag === 0 ? '#a07a46' : L.bag === 1 ? '#c8b080' : '#7a5232';
    roundRect(g, bx - 6, -34, 12, 10 + k * 10, 4); g.fill();
    if (L.bag === 0) { g.strokeStyle = 'rgba(70,45,20,0.6)'; g.lineWidth = 1; for (let r = -30; r < -24 + k * 10; r += 4) { g.beginPath(); g.moveTo(bx - 6, r); g.lineTo(bx + 6, r); g.stroke(); } }
  }
  // Legs and boots.
  const legA = climbing ? Math.sin(p.walk * 6) * 5 : step * 5, legB = -legA;
  g.strokeStyle = '#3a3a48'; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-2, -16); g.lineTo(-2 + legA * f * (climbing ? 0 : 1), -2 - (climbing ? Math.max(0, legA) : 0)); g.stroke();
  g.beginPath(); g.moveTo(2, -16); g.lineTo(2 + legB * f * (climbing ? 0 : 1), -2 - (climbing ? Math.max(0, legB) : 0)); g.stroke();
  g.fillStyle = L.gear >= 2 ? '#2a2420' : '#5a3a22';
  g.beginPath(); g.ellipse(-2 + (climbing ? 0 : legA * f) + f * 2, -1, 4, 2.5, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(2 + (climbing ? 0 : legB * f) + f * 2, -1, 4, 2.5, 0, 0, Math.PI * 2); g.fill();
  // Body: shirt in the player's colour, a belt.
  g.fillStyle = col.shirt; roundRect(g, -7, -32, 14, 18, 5); g.fill();
  g.fillStyle = col.dark; g.fillRect(-7, -18, 14, 3);
  // Head and face.
  g.fillStyle = '#f0c8a0'; g.beginPath(); g.arc(f * 1, -38, 6.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#3a2a1a'; g.beginPath(); g.arc(f * 4, -39, 1.1, 0, Math.PI * 2); g.fill();
  // Headgear through the ages: beret, leather helmet, helmet, steel helmet.
  if (L.gear === 0) { g.fillStyle = '#26303f'; g.beginPath(); g.ellipse(f * 0.5, -43, 8, 3.5, 0, 0, Math.PI * 2); g.fill(); g.fillRect(f * 0.5 - 1, -47, 2, 3); }
  else { g.fillStyle = L.gear === 1 ? '#7a5232' : L.gear === 2 ? '#c9a24a' : '#9aa4ae'; g.beginPath(); g.arc(f * 1, -40, 7.5, Math.PI, 0); g.fill(); g.fillRect(f * 1 - 9, -41, 18, 2.5); }
  // Light: a torch in hand, or on the helmet (candle, carbide, electric).
  const lamp = L.lamp, flick = 0.8 + 0.2 * Math.sin(t * 17 + p.i * 3) * Math.sin(t * 7);
  const lowLight = p.light / mine.stat('lamp');
  if (lamp > 0) {
    const lx = f * 6, ly = -45;
    g.fillStyle = lamp === 1 ? '#c8b080' : lamp === 2 ? '#8a8f96' : '#f2f2f2'; roundRect(g, lx - 2.5, ly - 3, 5, 5, 1.5); g.fill();
    g.fillStyle = lamp === 3 ? `rgba(255,255,230,${0.9 * Math.min(1, lowLight * 3)})` : `rgba(255,${lamp === 2 ? 240 : 190},120,${flick * Math.min(1, lowLight * 3)})`;
    g.beginPath(); g.arc(lx + f * 3, ly - 1, lamp === 3 ? 3 : 2.5, 0, Math.PI * 2); g.fill();
  }
  // Arms, and the tool.
  g.strokeStyle = '#f0c8a0'; g.lineWidth = 3.5;
  if (climbing) {
    const r = Math.sin(p.walk * 6) * 4;
    g.beginPath(); g.moveTo(-4, -30); g.lineTo(-5, -44 + r); g.stroke();
    g.beginPath(); g.moveTo(4, -30); g.lineTo(5, -44 - r); g.stroke();
  } else {
    // Tool angle: at rest, held down; digging, swinging at the face or the floor.
    let ang = 0.6;
    if (dig) ang = dig.dx ? (-0.3 + swing * 0.7) : (1.2 + swing * 0.5);
    g.save(); g.translate(f * 4, -28); g.scale(f, 1); g.rotate(ang);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(9, 0); g.stroke();
    drawTool(g, L.pick, t, !!dig);
    g.restore();
    if (lamp === 0) {
      // The torch, held in the other hand.
      g.save(); g.translate(-f * 6, -26); g.rotate(-f * 0.3);
      g.strokeStyle = '#6a4424'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 6); g.lineTo(0, -10); g.stroke();
      const fl = g.createRadialGradient(0, -14, 1, 0, -14, 8);
      fl.addColorStop(0, `rgba(255,240,170,${Math.min(1, lowLight * 3)})`); fl.addColorStop(0.5, `rgba(255,150,40,${0.8 * flick * Math.min(1, lowLight * 3)})`); fl.addColorStop(1, 'rgba(255,90,20,0)');
      g.fillStyle = fl; g.beginPath(); g.ellipse(0, -14, 5, 8 * flick, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }
  // Riding the windlass or the cage.
  if (p.riding) {
    g.strokeStyle = '#c8b080'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -50); g.lineTo(0, -400); g.stroke();
    if (L.shaft >= 2) { g.strokeStyle = '#8a929a'; g.lineWidth = 2.5; g.strokeRect(-14, -54, 28, 54); g.beginPath(); g.moveTo(-14, -27); g.lineTo(14, -27); g.stroke(); }
  }
  g.restore();
}

// The tool in hand, through the ages: a stone hammer, an iron pick, a
// blaster's drill, a pneumatic hammer.
function drawTool(g, level, t, busy) {
  if (level === 0) {
    g.strokeStyle = '#7a5232'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(6, 0); g.lineTo(18, 0); g.stroke();
    g.fillStyle = '#8a8a86'; g.beginPath(); g.ellipse(19, 0, 4, 5.5, 0, 0, Math.PI * 2); g.fill();
  } else if (level === 1) {
    g.strokeStyle = '#7a5232'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(6, 0); g.lineTo(20, 0); g.stroke();
    g.strokeStyle = '#6a6e74'; g.lineWidth = 3; g.beginPath(); g.moveTo(20, -8); g.quadraticCurveTo(23, 0, 20, 8); g.stroke();
  } else if (level === 2) {
    g.strokeStyle = '#9aa0a8'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(6, 0); g.lineTo(24, 0); g.stroke();
    g.fillStyle = '#5a3a22'; g.fillRect(4, -3, 5, 6);
  } else {
    const shake = busy ? Math.sin(t * 60) * 1.2 : 0;
    g.fillStyle = '#c0392b'; roundRect(g, 4, -4 + shake, 14, 8, 2); g.fill();
    g.strokeStyle = '#9aa0a8'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(18, shake); g.lineTo(27, shake); g.stroke();
  }
}

// Ladders: notched logs at first, then wooden ladders.
function drawLadder(g, px, py, level, x, y) {
  const cx = px + TS / 2;
  if (level === 0) {
    g.fillStyle = '#7a5434'; roundRect(g, cx - 5, py - 1, 10, TS + 2, 4); g.fill();
    g.fillStyle = '#4e341f';
    for (let k = 0; k < 3; k++) { const ny = py + 8 + k * 14; g.beginPath(); g.moveTo(cx - 5, ny); g.lineTo(cx + 3, ny + 3); g.lineTo(cx - 5, ny + 6); g.closePath(); g.fill(); }
    return;
  }
  g.strokeStyle = level === 2 ? '#a07a46' : '#7a5434'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(cx - 9, py - 1); g.lineTo(cx - 9, py + TS + 1); g.moveTo(cx + 9, py - 1); g.lineTo(cx + 9, py + TS + 1); g.stroke();
  g.lineWidth = 2.5;
  for (let k = 0; k < 4; k++) { const ry = py + 6 + k * (TS / 4); g.beginPath(); g.moveTo(cx - 9, ry); g.lineTo(cx + 9, ry); g.stroke(); }
}

// The old shaft: with the windlass, a rope hangs down it.
function drawShaft(g, mine, sx, sy, y0, y1) {
  if (!mine.levels.shaft) return;
  const S = mine.R.shaft;
  let bottom = SURFACE;
  while (bottom < mine.H - 1 && !mine.tiles[bottom + 1][S.x].rock) bottom++;
  g.strokeStyle = mine.levels.shaft >= 2 ? '#8a929a' : '#c8b080'; g.lineWidth = mine.levels.shaft >= 2 ? 2 : 1.5;
  const x = sx(S.x + 0.5) + 12;
  g.beginPath(); g.moveTo(x, sy(Math.max(y0, 0))); g.lineTo(x, sy(Math.min(y1 + 1, bottom + 1))); g.stroke();
}

function drawLoose(g, px, py, x, y, shake) {
  const dx = shake ? Math.sin(shake * 60) * 1.5 : 0;
  g.strokeStyle = 'rgba(40,24,14,0.55)'; g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(px + 6 + dx, py + 10); g.lineTo(px + 18 + dx, py + 16); g.lineTo(px + 14 + dx, py + 26); g.lineTo(px + 30 + dx, py + 34);
  g.moveTo(px + 30 + dx, py + 8); g.lineTo(px + 26 + dx, py + 20); g.lineTo(px + 40 + dx, py + 24);
  g.stroke();
}

function drawFallingRock(g, px, py, x, y) {
  g.fillStyle = '#8a7a6a';
  g.beginPath();
  for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2, r = (TS / 2 - 3) * (0.8 + hash(x, y, k + 200) * 0.2); const qx = px + TS / 2 + Math.cos(a) * r, qy = py + TS / 2 + Math.sin(a) * r; if (k) g.lineTo(qx, qy); else g.moveTo(qx, qy); }
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.ellipse(px + TS / 2 - 5, py + TS / 2 - 6, 7, 4, -0.4, 0, Math.PI * 2); g.fill();
}

// The cave of the Hombres Verdes: green-stained rock, a soft green light,
// pots and stones left by the people of long ago. Quiet and respectful.
function drawCave(g, mine, sx, sy, x0, x1, y0, y1, t) {
  const C = mine.R.cave;
  if (y1 < C.y0 - 1 || y0 > C.y1 + 1) return;
  const left = sx(C.x0), top = sy(C.y0), w = (C.x1 - C.x0 + 1) * TS, h = (C.y1 - C.y0 + 1) * TS;
  const bg = g.createLinearGradient(0, top, 0, top + h);
  bg.addColorStop(0, '#16302a'); bg.addColorStop(1, '#25483a');
  g.fillStyle = bg; roundRect(g, left, top, w, h, 30); g.fill();
  // Green copper stains in the walls.
  for (let k = 0; k < 14; k++) {
    g.fillStyle = `rgba(80,190,130,${0.12 + hash(k, 3) * 0.15})`;
    g.beginPath(); g.ellipse(left + hash(k, 1) * w, top + hash(k, 2) * h * 0.7, 20 + hash(k, 4) * 30, 6 + hash(k, 5) * 8, hash(k, 6) * 3, 0, Math.PI * 2); g.fill();
  }
  // A soft glow that breathes slowly.
  const glow = g.createRadialGradient(left + w / 2, top + h * 0.6, 10, left + w / 2, top + h * 0.6, w * 0.6);
  glow.addColorStop(0, `rgba(120,230,170,${0.18 + 0.06 * Math.sin(t * 0.8)})`); glow.addColorStop(1, 'rgba(120,230,170,0)');
  g.fillStyle = glow; g.fillRect(left, top, w, h);
  // Clay pots and a ring of stones on the floor.
  const floor = top + h - 4;
  for (let k = 0; k < 4; k++) {
    const px = left + w * (0.18 + k * 0.2), s = 9 + hash(k, 9) * 4;
    g.fillStyle = '#9a6a40'; g.beginPath(); g.ellipse(px, floor - s, s * 0.8, s, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7a4a28'; g.fillRect(px - s * 0.4, floor - s * 2 - 1, s * 0.8, 3);
  }
  g.fillStyle = '#6a6a62';
  for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI; g.beginPath(); g.ellipse(left + w * 0.62 + Math.cos(a) * 34, floor - 3 - Math.sin(a) * 4, 6, 4, 0, 0, Math.PI * 2); g.fill(); }
}

function drawFx(g, fx, sx, sy) {
  for (const q of fx) {
    const a = Math.max(0, q.life / q.max);
    g.fillStyle = q.colour; g.globalAlpha = a;
    g.beginPath(); g.arc(sx(q.x), sy(q.y), q.size * (q.grow ? 2 - a : 1), 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
}

// Deeper is darker; each drill's lamp lights the rock around it.
function drawDark(g, mine, cam, vw, sx, sy) {
  const mid = cam.y + H / TS / 2 - SURFACE;
  const dark = Math.max(0, Math.min(0.82, (mid - 1) / 22));
  if (dark <= 0.02) return;
  // Painted on a small offscreen layer: darkness, with the lamps rubbed out.
  shade ??= document.createElement('canvas');
  if (shade.width !== vw / 2) { shade.width = vw / 2; shade.height = H / 2; }
  const d = shade.getContext('2d');
  d.globalCompositeOperation = 'source-over';
  d.clearRect(0, 0, shade.width, shade.height);
  d.fillStyle = `rgba(6,4,10,${dark})`; d.fillRect(0, 0, shade.width, shade.height);
  d.globalCompositeOperation = 'destination-out';
  for (const p of mine.miners) {
    // A torch lights a little; an electric lamp, a lot. Running low, it shrinks.
    const left = Math.min(1, 0.35 + (p.light / mine.stat('lamp')) * 1.3);
    const R = (55 + mine.levels.lamp * 16) * left * (mine.levels.lamp ? 1 : 0.94 + 0.06 * Math.sin(p.walk * 3 + mine.t * 13));
    const lx = sx(p.x) / 2, ly = sy(p.y) / 2;
    const rg = d.createRadialGradient(lx, ly, R * 0.25, lx, ly, R);
    rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = rg; d.beginPath(); d.arc(lx, ly, R, 0, Math.PI * 2); d.fill();
  }
  // The cave at the bottom glows softly on its own.
  const C = mine.R.cave, cl = sx(C.x0) / 2, ct = sy(C.y0) / 2, cw = (C.x1 - C.x0 + 1) * TS / 2, ch = (C.y1 - C.y0 + 1) * TS / 2;
  if (ct < shade.height && ct + ch > 0) {
    const cg = d.createRadialGradient(cl + cw / 2, ct + ch / 2, 10, cl + cw / 2, ct + ch / 2, cw * 0.7);
    cg.addColorStop(0, 'rgba(0,0,0,0.85)'); cg.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = cg; d.fillRect(cl - cw * 0.2, ct - ch * 0.4, cw * 1.4, ch * 1.8);
  }
  g.drawImage(shade, 0, 0, vw, H);
}
let shade = null;

export function finish(g) {
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
