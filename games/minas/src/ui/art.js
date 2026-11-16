// Paints the mine: a cross-section of Navarre's mines, newest on top and
// oldest at the bottom, with the village above. Smooth shapes and soft light, never pixel art. Everything is in stage
// pixels (960x540; the canvas is 2x). One tile is TS pixels.
//
// drawView(g, mine, cam, view, t, fx, labels) paints one view (the whole
// stage for one player, or one half each for two) with its own camera.

import { SURFACE } from '../core/minas.js';
import { paint } from './things.js';

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
  const near = mine.miners[0]?.near ?? { gas: 99, water: 99 };

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
    if (tile.ore) {
      if (mine.R.ores[tile.ore]?.jackpot) drawJackpot(g, tile.ore, px, py, x, y, t);
      else drawOre(g, tile.ore, px, py, x, y, t);
    }
    if (tile.gas) drawGasPocket(g, px, py, x, y, t, near.gas);
    if (tile.spring) drawSpring(g, px, py, x, y, t, near.water);
  }
  drawTunnels(g, mine, sx, sy, x0, x1, y0, y1);
  drawCave(g, mine, sx, sy, x0, x1, y0, y1, t);
  drawShaft(g, mine, sx, sy, y0, y1);
  drawStations(g, mine, sx, sy, y0, y1, t, labels);
  drawCracks(g, mine, sx, sy);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const tl = mine.tiles[y][x]; if (tl.find && !tl.rock) drawFindOnFloor(g, tl.find, sx(x), sy(y), t); }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (mine.tiles[y][x].ladder) drawLadder(g, sx(x), sy(y), mine.levels.ladders, x, y);
  for (const r of mine.rocks) if (r.wait <= 0) drawFallingRock(g, sx(r.x), sy(r.fy), r.x, r.y);
  drawWater(g, mine, sx, sy, x0, x1, y0, y1, t);
  drawGas(g, mine, sx, sy, x0, x1, y0, y1, t);
  // Grass along the village floor.
  if (surfY > -10 && surfY < H) drawGrass(g, mine, sx, surfY, x0, x1);

  for (const p of mine.miners) { drawMiner(g, mine, p, sx(p.x), sy(p.y), t); if (p.under) drawBreath(g, p, sx(p.x), sy(p.y), t); }
  drawBombs(g, mine, sx, sy, t);
  drawFx(g, fx, sx, sy);
  drawDark(g, mine, cam, vw, sx, sy, t);
  // Seen through the dark: the glint of something old, a lit fuse.
  drawGlints(g, mine, sx, sy, t);
  drawWarnings(g, mine, sx, sy, t);
  drawBombs(g, mine, sx, sy, t, true);
  drawMarkers(g, mine, sx, sy, y0, y1, labels);
  drawRising(g, mine, sx, sy, t, labels);
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
    const L = mine?.levels.stations ? 2 : 0;
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
  } else if (id === 'museo') {
    // The village museum: stone, a pediment and columns, a banner.
    g.fillStyle = '#e9e0cc'; g.fillRect(-w / 2 + 4, -58, w - 8, 58);
    g.fillStyle = '#d6cbb2'; g.fillRect(-w / 2, -6, w, 6); g.fillRect(-w / 2, -64, w, 7);
    g.fillStyle = '#cdbf9f'; g.beginPath(); g.moveTo(-w / 2 - 4, -63); g.lineTo(0, -88); g.lineTo(w / 2 + 4, -63); g.closePath(); g.fill();
    g.fillStyle = '#b8a888'; g.beginPath(); g.arc(0, -71, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f4ecdc';
    for (let k = 0; k < 4; k++) { const cx2 = -w / 2 + 12 + k * (w - 24) / 3; g.fillRect(cx2 - 4, -56, 8, 50); g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(cx2 + 1, -56, 3, 50); g.fillStyle = '#f4ecdc'; }
    g.fillStyle = '#5a3a22'; roundRect(g, -9, -34, 18, 28, 8); g.fill();
    g.fillStyle = `rgba(255,220,140,${0.35 + 0.1 * Math.sin(t * 2)})`; roundRect(g, -6, -30, 12, 24, 6); g.fill();
    // A little banner with a gold edge, gently waving.
    g.fillStyle = '#2e6b4f'; g.beginPath(); g.moveTo(w / 2 - 6, -60); g.lineTo(w / 2 + 12, -60 + Math.sin(t * 2) * 2); g.lineTo(w / 2 + 12, -44 + Math.sin(t * 2 + 1) * 2); g.lineTo(w / 2 - 6, -44); g.closePath(); g.fill();
    g.strokeStyle = '#d9a520'; g.lineWidth = 1.5; g.stroke();
    top = -116;
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
    const tile = mine.tiles[y][x];
    if (tile.old) { drawOld(g, tile.old, px, py, open(x - 1, y) && mine.tiles[y][x - 1].old, open(x + 1, y) && mine.tiles[y][x + 1].old, !up); continue; }
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
    g.strokeStyle = '#8a929a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -54); g.lineTo(0, -600); g.stroke();
    g.strokeStyle = '#8a929a'; g.lineWidth = 2.5; g.strokeRect(-14, -54, 28, 54); g.beginPath(); g.moveTo(-14, -27); g.lineTo(14, -27); g.stroke();
  }
  // Hauled up on the winch rope.
  if (p.haul) {
    g.strokeStyle = '#c8a070'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(2, -40); g.lineTo(2, -900); g.stroke();
    g.strokeStyle = '#8a6a3a'; g.lineWidth = 1; for (let k = 0; k < 8; k++) { const yy = -60 - k * 22 + (t * 90) % 22; g.beginPath(); g.moveTo(0, yy); g.lineTo(4, yy - 4); g.stroke(); }
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
  if (!mine.levels.stations) return;
  const S = mine.R.shaft;
  let bottom = SURFACE;
  while (bottom < mine.H - 1 && mine.tiles[bottom + 1][S.x].shaft) bottom++;
  g.strokeStyle = '#8a929a'; g.lineWidth = 2;
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
  // The piece the museum is waiting for, on a flat stone, glowing green.
  if (mine.crown === 'cave') {
    const cx = sx(mine.R.escape.x + 0.5), base = sy(C.y1 + 1) - 4;
    const halo = g.createRadialGradient(cx, base - 22, 4, cx, base - 22, 46);
    halo.addColorStop(0, `rgba(170,255,200,${0.5 + 0.2 * Math.sin(t * 2.4)})`); halo.addColorStop(1, 'rgba(170,255,200,0)');
    g.fillStyle = halo; g.fillRect(cx - 50, base - 72, 100, 76);
    g.fillStyle = '#7a7a70'; roundRect(g, cx - 17, base - 9, 34, 9, 3); g.fill();
    g.fillStyle = '#9a9a8e'; roundRect(g, cx - 15, base - 10, 30, 3, 1.5); g.fill();
    paint(g, 'find', 'collar', cx, base - 24 + Math.sin(t * 1.8) * 1.5, 34);
    const k = (t * 0.6) % 1;
    if (k < 0.3) sparkle(g, cx + 9, base - 34, 4 * Math.sin(k / 0.3 * Math.PI), 'rgba(220,255,230,0.95)');
  }
}

// Holding breath under water: little bubbles rising from the helmet.
function drawBreath(g, p, x, y, t) {
  for (let k = 0; k < 4; k++) {
    const ph = (t * 1.3 + k / 4) % 1;
    g.fillStyle = `rgba(220,240,255,${0.85 * (1 - ph)})`;
    g.beginPath(); g.arc(x + Math.sin(t * 5 + k * 2) * 4 + (p.face || 1) * 4, y - 14 - ph * TS * 0.9, 2 + k % 2 + ph * 2, 0, Math.PI * 2); g.fill();
  }
}

// The finale's rising water: a bright line where it stands, a soft tint
// below it, and a mark where it will stop. Drawn over the dark, so it can
// always be read.
function drawRising(g, mine, sx, sy, t, labels) {
  const E = mine.escape;
  if (!E) return;
  const top = sy(E.top), y = sy(E.y), x0 = sx(0), x1 = sx(mine.W);
  if (top > -20 && top < H + 20) {
    g.strokeStyle = 'rgba(160,220,255,0.75)'; g.setLineDash([10, 8]); g.lineWidth = 2;
    g.beginPath(); g.moveTo(x0, top); g.lineTo(x1, top); g.stroke(); g.setLineDash([]);
    if (labels.mark) {
      g.font = 'bold 13px system-ui, sans-serif';
      const tw = g.measureText(labels.mark).width + 16, lx = Math.max(6, x0 + 6);
      g.fillStyle = 'rgba(20,50,80,0.85)'; roundRect(g, lx, top - 22, tw, 20, 7); g.fill();
      g.fillStyle = '#e4f4ff'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(labels.mark, lx + 8, top - 11.5);
    }
  }
  if (y < H + 10) {
    const yy = Math.max(-10, y);
    const tint = g.createLinearGradient(0, yy, 0, yy + TS * 2);
    tint.addColorStop(0, 'rgba(70,140,200,0.32)'); tint.addColorStop(1, 'rgba(40,90,150,0.18)');
    g.fillStyle = tint; g.fillRect(x0, yy, x1 - x0, H - yy + 10);
    g.strokeStyle = 'rgba(200,235,255,0.95)'; g.lineWidth = 3;
    g.beginPath();
    for (let px = x0; px <= x1; px += 16) { const wy = y + Math.sin(t * 5 + px / 37) * 2.5; if (px === x0) g.moveTo(px, wy); else g.lineTo(px, wy); }
    g.stroke();
    // Foam flecks along the line.
    g.fillStyle = 'rgba(240,250,255,0.8)';
    for (let k = 0; k < 18; k++) { const px = x0 + ((k * 97 + t * 40) % (x1 - x0)); g.beginPath(); g.arc(px, y + Math.sin(t * 6 + k) * 2, 1.6 + (k % 3), 0, Math.PI * 2); g.fill(); }
  }
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
function drawDark(g, mine, cam, vw, sx, sy, t = 0) {
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
    // Near bad air the flame gutters: a warning you can see.
    const gas = p.near && p.near.gas <= mine.gasWarn() + 0.5 ? 0.75 + 0.25 * Math.abs(Math.sin(t * 17) * Math.sin(t * 5.3)) : 1;
    const R = (55 + mine.levels.lamp * 16) * left * gas * (mine.levels.lamp ? 1 : 0.94 + 0.06 * Math.sin(p.walk * 3 + mine.t * 13));
    const lx = sx(p.x) / 2, ly = sy(p.y) / 2;
    const rg = d.createRadialGradient(lx, ly, R * 0.25, lx, ly, R);
    rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = rg; d.beginPath(); d.arc(lx, ly, R, 0, Math.PI * 2); d.fill();
  }
  // Each cage station's lamp keeps a little light around its landing.
  for (let k = 0; k < mine.levels.stations; k++) {
    const st = mine.R.stations.list[k], lx = sx(mine.R.shaft.x + mine.R.stations.landing + 0.8) / 2, ly = sy(st.y + 0.3) / 2;
    if (ly < -60 || ly > shade.height + 60) continue;
    const sg = d.createRadialGradient(lx, ly, 4, lx, ly, 70);
    sg.addColorStop(0, 'rgba(0,0,0,0.85)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = sg; d.beginPath(); d.arc(lx, ly, 70, 0, Math.PI * 2); d.fill();
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

// ---- the new things in the rock ---------------------------------------------------------------------------

// A jackpot: a big, bright piece that shimmers.
function drawJackpot(g, ore, px, py, x, y, t) {
  const cx = px + TS / 2, cy = py + TS / 2;
  const glow = g.createRadialGradient(cx, cy, 2, cx, cy, TS * 0.6);
  glow.addColorStop(0, `rgba(255,240,190,${0.35 + 0.15 * Math.sin(t * 3 + x)})`); glow.addColorStop(1, 'rgba(255,240,190,0)');
  g.fillStyle = glow; g.fillRect(px - 6, py - 6, TS + 12, TS + 12);
  paint(g, 'jackpot', ore, cx, cy + 2, TS * 0.85);
  const k = (t * 0.7 + hash(x, y, 5)) % 1;
  if (k < 0.25) sparkle(g, cx - 10 + hash(x, y, 6) * 20, cy - 10 + hash(x, y, 7) * 16, 5 * Math.sin(k / 0.25 * Math.PI));
}

function sparkle(g, x, y, r, colour = 'rgba(255,255,240,0.95)') {
  if (r <= 0) return;
  g.fillStyle = colour;
  g.beginPath(); g.moveTo(x, y - r * 2); g.quadraticCurveTo(x, y, x + r * 2, y); g.quadraticCurveTo(x, y, x, y + r * 2); g.quadraticCurveTo(x, y, x - r * 2, y); g.quadraticCurveTo(x, y, x, y - r * 2); g.fill();
}

// A gas pocket in the rock: faint bubbles; close by, a sickly haze puffs out.
function drawGasPocket(g, px, py, x, y, t, near) {
  const cx = px + TS / 2, cy = py + TS / 2, close = near <= 3;
  for (let k = 0; k < 3; k++) {
    const ph = (t * 0.4 + hash(x, y, k + 120)) % 1;
    g.fillStyle = `rgba(190,230,150,${(close ? 0.55 : 0.25) * Math.sin(ph * Math.PI)})`;
    g.beginPath(); g.arc(cx - 9 + k * 9, cy + 10 - ph * 20, 3 + k, 0, Math.PI * 2); g.fill();
  }
  if (close) {
    const a = 0.18 + 0.1 * Math.sin(t * 4 + x);
    const gr = g.createRadialGradient(cx, cy, 4, cx, cy, TS * 0.75);
    gr.addColorStop(0, `rgba(200,230,120,${a})`); gr.addColorStop(1, 'rgba(200,230,120,0)');
    g.fillStyle = gr; g.fillRect(px - TS * 0.3, py - TS * 0.3, TS * 1.6, TS * 1.6);
  }
}

// A water pocket: a damp, darker patch; close by, drops run down its face.
function drawSpring(g, px, py, x, y, t, near) {
  const cx = px + TS / 2, cy = py + TS / 2;
  g.fillStyle = 'rgba(40,70,100,0.28)'; g.beginPath(); g.ellipse(cx, cy, TS * 0.42, TS * 0.36, hash(x, y, 9), 0, Math.PI * 2); g.fill();
  if (near > 3) return;
  for (let k = 0; k < 3; k++) {
    const ph = (t * 0.8 + hash(x, y, k + 60)) % 1, dx = cx - 10 + k * 10;
    g.fillStyle = `rgba(150,200,240,${0.8 * (1 - ph)})`;
    g.beginPath(); g.ellipse(dx, py + 6 + ph * (TS - 4), 2, 3, 0, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(150,200,240,0.4)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(cx - 6, py + 4); g.quadraticCurveTo(cx - 2, cy, cx - 5, py + TS - 4); g.stroke();
}

// Water standing in open tiles: a blue fill from the floor up, with a
// shimmering top.
function drawWater(g, mine, sx, sy, x0, x1, y0, y1, t) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const l = mine.waterAt(x, y);
    if (l < 0.03 || mine.tiles[y][x].rock) continue;
    const px = sx(x), py = sy(y), above = mine.waterAt(x, y - 1) > 0.03 && !mine.tiles[y - 1]?.[x]?.rock;
    const top = above ? py : py + TS * (1 - Math.min(1, l));
    const over = l > mine.R.water.drown;
    g.fillStyle = over ? `rgba(40,95,160,${0.5 + 0.3 * Math.min(1, l)})` : `rgba(60,120,170,${0.35 + 0.3 * Math.min(1, l)})`;
    g.fillRect(px - 0.5, top, TS + 1, py + TS - top);
    // A notch at half height on each side of a part-filled tile: over it,
    // your head is under.
    if (l < 0.98) {
      g.strokeStyle = over ? 'rgba(255,220,200,0.7)' : 'rgba(230,245,255,0.55)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(px, py + TS / 2); g.lineTo(px + 6, py + TS / 2); g.moveTo(px + TS - 6, py + TS / 2); g.lineTo(px + TS, py + TS / 2); g.stroke();
    }
    if (!above) {
      g.strokeStyle = 'rgba(190,225,250,0.75)'; g.lineWidth = 2;
      g.beginPath();
      for (let k = 0; k <= 8; k++) { const wx = px + k * TS / 8, wy = top + Math.sin(t * 4 + k + x * 2) * 1.5; if (k) g.lineTo(wx, wy); else g.moveTo(wx, wy); }
      g.stroke();
    }
  }
}

// Bad air let loose: yellow-green clouds drifting in the open tiles.
function drawGas(g, mine, sx, sy, x0, x1, y0, y1, t) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const v = mine.gasAt(x, y);
    if (v <= 0) continue;
    const a = Math.min(1, v / 2) * 0.42, px = sx(x), py = sy(y), i = mine.idx(x, y);
    // Where air moves, the haze streams off toward the way out.
    const dir = mine.vented[i] ? mine.draft[i] : 0, [dx, dy] = [[0, 0], [0, -1], [-1, 0], [1, 0], [0, 1]][dir];
    for (let k = 0; k < 3; k++) {
      const ph = (t * 0.9 + k / 3) % 1;
      const ox = dir ? dx * (ph - 0.3) * TS + Math.sin(t * 3 + k) * 3 : Math.sin(t * 0.9 + k * 2.1 + x) * 9;
      const oy = dir ? dy * (ph - 0.3) * TS + Math.cos(t * 3 + k) * 3 : Math.cos(t * 0.7 + k * 1.7 + y) * 7;
      const gr = g.createRadialGradient(px + TS / 2 + ox, py + TS / 2 + oy, 2, px + TS / 2 + ox, py + TS / 2 + oy, TS * 0.55);
      gr.addColorStop(0, `rgba(190,215,90,${a})`); gr.addColorStop(1, 'rgba(190,215,90,0)');
      g.fillStyle = gr; g.fillRect(px - TS * 0.2, py - TS * 0.2, TS * 1.4, TS * 1.4);
    }
  }
}

// An old working, part of a pocket: a timbered gallery or a stone chamber.
function drawOld(g, kind, px, py, joinL, joinR, roofed) {
  g.fillStyle = 'rgba(30,20,12,0.3)'; g.fillRect(px - 0.5, py - 0.5, TS + 1, TS + 1);
  if (kind === 'gallery') {
    const wood = '#6a4a2c', dark = '#3e2a18';
    if (!joinL) { g.fillStyle = wood; g.fillRect(px + 3, py + 4, 6, TS - 4); }
    if (!joinR) { g.fillStyle = wood; g.fillRect(px + TS - 9, py + 4, 6, TS - 4); }
    if (roofed) { g.fillStyle = dark; g.fillRect(px, py, TS, 7); g.fillStyle = wood; g.fillRect(px, py, TS, 5); }
    g.strokeStyle = 'rgba(200,170,120,0.18)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(px + 4, py + TS - 2); g.lineTo(px + TS - 4, py + TS - 2); g.stroke();
  } else {
    // Dry-stone walls, worn smooth.
    g.fillStyle = 'rgba(150,140,120,0.35)';
    for (let k = 0; k < 4; k++) {
      if (!joinL) { g.beginPath(); g.ellipse(px + 5, py + 8 + k * 11, 5, 4.5, 0, 0, Math.PI * 2); g.fill(); }
      if (!joinR) { g.beginPath(); g.ellipse(px + TS - 5, py + 8 + k * 11, 5, 4.5, 0, 0, Math.PI * 2); g.fill(); }
    }
  }
}

// A museum piece lying on the floor of its pocket.
function drawFindOnFloor(g, id, px, py, t) {
  const cx = px + TS / 2, cy = py + TS - 13;
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(cx, py + TS - 3, 14, 3, 0, 0, Math.PI * 2); g.fill();
  paint(g, 'find', id, cx, cy, TS * 0.62);
}

// Glints: something old within a few tiles catches the lamp, even through
// the rock and the dark.
function drawGlints(g, mine, sx, sy, t) {
  for (const p of mine.miners) {
    const f = p.near?.find;
    if (!f) continue;
    const cx = sx(f.x + 0.5), cy = sy(f.y + 0.6);
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    const gr = g.createRadialGradient(cx, cy, 1, cx, cy, TS * 0.7);
    gr.addColorStop(0, `rgba(255,236,170,${0.35 + 0.25 * pulse})`); gr.addColorStop(1, 'rgba(255,236,170,0)');
    g.fillStyle = gr; g.fillRect(cx - TS, cy - TS, TS * 2, TS * 2);
    sparkle(g, cx + Math.sin(t * 1.3) * 6, cy - 4, 3 + 3 * pulse);
    sparkle(g, cx - 9, cy + 5, 2 * (1 - pulse) + 0.5, 'rgba(255,250,220,0.8)');
  }
}

// Lit dynamite: a red stick and a sputtering fuse (the fuse shows in the dark).
function drawBombs(g, mine, sx, sy, t, glowOnly = false) {
  for (const b of mine.bombs) {
    const cx = sx(b.x + 0.5), cy = sy(b.y + 1) - 10;
    if (!glowOnly) {
      g.save(); g.translate(cx, cy); g.rotate(-0.3);
      g.fillStyle = '#c0392b'; roundRect(g, -4, -11, 8, 20, 3); g.fill();
      g.fillStyle = '#e8d4a8'; g.fillRect(-4, -3, 8, 4);
      g.restore();
      continue;
    }
    const k = b.fuse / mine.R.items.dynamite.fuse, fx = cx - 6 - 4 * k, fy = cy - 14 - 6 * k;
    const gr = g.createRadialGradient(fx, fy, 1, fx, fy, 22);
    gr.addColorStop(0, `rgba(255,220,120,${0.7 + 0.3 * Math.sin(t * 40)})`); gr.addColorStop(1, 'rgba(255,160,60,0)');
    g.fillStyle = gr; g.fillRect(fx - 22, fy - 22, 44, 44);
    for (let j = 0; j < 4; j++) sparkle(g, fx + Math.sin(t * 31 + j * 2) * 6, fy + Math.cos(t * 27 + j) * 5, 1.6, 'rgba(255,240,180,0.95)');
  }
}

// Cracks in the tile being dug, more of them as it gives.
function drawCracks(g, mine, sx, sy) {
  for (const p of mine.miners) {
    const d = p.dig;
    if (!d) continue;
    const k = Math.min(1, d.t / d.need), px = sx(d.x), py = sy(d.y), cx = px + TS / 2, cy = py + TS / 2;
    g.strokeStyle = `rgba(20,12,6,${0.45 + 0.35 * k})`; g.lineWidth = 1.6 + k; g.lineCap = 'round';
    const n = 1 + Math.floor(k * 3);
    for (let i = 0; i < n; i++) {
      const a = hash(d.x, d.y, i + 70) * Math.PI * 2, len = TS * (0.18 + 0.3 * k);
      g.beginPath(); g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a) * len * 0.5 + 3, cy + Math.sin(a) * len * 0.5 - 2);
      g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      g.stroke();
    }
    if (k > 0.66) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.arc(cx, cy, 6 * k, 0, Math.PI * 2); g.fill(); }
    g.lineCap = 'butt';
  }
}

// Cage stations: a plank landing, a lamp, and a sign with the depth.
function drawStations(g, mine, sx, sy, y0, y1, t, labels) {
  const S = mine.R.shaft, ST = mine.R.stations;
  for (let k = 0; k < mine.levels.stations; k++) {
    const st = ST.list[k];
    if (st.y < y0 - 1 || st.y > y1 + 1) continue;
    const left = sx(S.x), right = sx(S.x + ST.landing + 1), floor = sy(st.y + 1);
    g.fillStyle = '#6a4a2c'; g.fillRect(left, floor - 5, right - left, 5);
    g.strokeStyle = 'rgba(30,18,8,0.5)'; g.lineWidth = 1;
    for (let x = left; x < right; x += 12) { g.beginPath(); g.moveTo(x, floor - 5); g.lineTo(x, floor); g.stroke(); }
    // Posts and a beam.
    g.fillStyle = '#7a5434'; g.fillRect(right - 8, sy(st.y) + 2, 6, TS - 6); g.fillRect(left, sy(st.y), right - left, 5);
    // A lamp on the post, which warms the darkness around the landing.
    const lx = right - 5, ly = sy(st.y) + 14, fl = 0.8 + 0.2 * Math.sin(t * 6 + k);
    const gr = g.createRadialGradient(lx, ly, 1, lx, ly, 26);
    gr.addColorStop(0, `rgba(255,220,140,${0.55 * fl})`); gr.addColorStop(1, 'rgba(255,220,140,0)');
    g.fillStyle = gr; g.fillRect(lx - 26, ly - 26, 52, 52);
    g.fillStyle = '#ffe7a8'; g.beginPath(); g.arc(lx, ly, 3, 0, Math.PI * 2); g.fill();
    // The depth sign.
    const text = `${st.y - SURFACE} m`;
    g.font = 'bold 12px system-ui, sans-serif';
    const tw = g.measureText(text).width + 10, sx0 = left + (right - left) / 2 - tw / 2, sy0 = sy(st.y) + 9;
    g.fillStyle = '#e9dcbc'; roundRect(g, sx0, sy0, tw, 16, 3); g.fill();
    g.fillStyle = '#3a2a1a'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, sx0 + tw / 2, sy0 + 8.5);
  }
}

// Where each old mine begins: a soft line across and a plaque at the left.
function drawMarkers(g, mine, sx, sy, y0, y1, labels) {
  g.font = 'bold 12px system-ui, sans-serif';
  for (const L of mine.R.layers) {
    if (L.from <= SURFACE || L.from < y0 || L.from > y1 + 1) continue;
    const y = sy(L.from);
    g.strokeStyle = 'rgba(255,240,210,0.22)'; g.setLineDash([6, 8]); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(sx(0), y); g.lineTo(sx(mine.W), y); g.stroke(); g.setLineDash([]);
    const text = labels.eras?.[L.card] ? labels.eras[L.card](L.from - SURFACE) : `${L.from - SURFACE} m`;
    const tw = g.measureText(text).width + 14, x = Math.min(sx(mine.W), W) - tw - 6;
    g.fillStyle = 'rgba(36,26,16,0.78)'; roundRect(g, x, y - 10, tw, 20, 6); g.fill();
    g.fillStyle = '#f4e8cb'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(text, x + 7, y + 0.5);
  }
}

// Warnings you can see in the dark: near a gas pocket a sickly haze puffs
// out of the rock; near a water pocket, a wet shine.
function drawWarnings(g, mine, sx, sy, t) {
  const p = mine.miners[0];
  if (!p || p.y < SURFACE) return;
  const cx = Math.floor(p.x), cy = Math.floor(p.y), R = mine.R;
  for (let y = cy - 5; y <= cy + 5; y++) for (let x = cx - 5; x <= cx + 5; x++) {
    const tl = mine.tile(x, y);
    if (!tl.rock || y < SURFACE || y >= mine.H) continue;
    const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y);
    const px = sx(x + 0.5), py = sy(y + 0.5);
    if (tl.gas && d <= mine.gasWarn() + 0.7) {
      const a = 0.28 + 0.14 * Math.sin(t * 5 + x);
      const gr = g.createRadialGradient(px, py, 3, px, py, TS * 0.7);
      gr.addColorStop(0, `rgba(205,235,110,${a})`); gr.addColorStop(1, 'rgba(205,235,110,0)');
      g.fillStyle = gr; g.fillRect(px - TS, py - TS, TS * 2, TS * 2);
      for (let k = 0; k < 3; k++) {
        const ph = (t * 0.6 + k / 3) % 1;
        g.fillStyle = `rgba(215,240,140,${0.5 * (1 - ph)})`;
        g.beginPath(); g.arc(px - 8 + k * 8 + Math.sin(t * 3 + k) * 3, py - ph * TS * 0.6, 3 + ph * 5, 0, Math.PI * 2); g.fill();
      }
    }
    if (tl.spring && d <= R.water.warn + 0.7) {
      const gr = g.createRadialGradient(px, py, 3, px, py, TS * 0.6);
      gr.addColorStop(0, `rgba(140,190,235,${0.22 + 0.1 * Math.sin(t * 3 + y)})`); gr.addColorStop(1, 'rgba(140,190,235,0)');
      g.fillStyle = gr; g.fillRect(px - TS, py - TS, TS * 2, TS * 2);
      const ph = (t * 0.9 + hash(x, y, 3)) % 1;
      g.fillStyle = `rgba(170,215,250,${0.9 * (1 - ph)})`;
      g.beginPath(); g.ellipse(px, py - TS * 0.3 + ph * TS * 0.8, 2.2, 3.2, 0, 0, Math.PI * 2); g.fill();
    }
  }
}

// ---- the museum opening: the village's fiesta at the end of a career ----------------------------------
//
// drawFiesta(g, F, t): F = { rows: [{ name, pieces: [{ id, got, lit }] }], crown: { got, lit, label },
// crowd: 0..1 (how far the crowd has walked in), cheer: 0..1, confetti: [{ x, y, a, s, c }] }.
// lit is 0..1: how far that plinth's light has come up.

const HALL = { x: 24, y: 64, w: 590, h: 372 };
const PLINTH_X = [262, 352, 442], CROWN_X = 540;
export const fiestaRowY = (r) => HALL.y + 58 + r * 62;
export const fiestaPieceAt = (r, c) => [PLINTH_X[c], fiestaRowY(r) - 4];
export const fiestaCrownAt = () => [CROWN_X, 236];

export function drawFiesta(g, F, t) {
  // An evening sky over the Pyrenees.
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#24325e'); sky.addColorStop(0.45, '#8a5a7a'); sky.addColorStop(0.75, '#e89a5a'); sky.addColorStop(1, '#f3c27a');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(60,50,80,0.55)';
  g.beginPath(); g.moveTo(0, 300);
  for (let x = 0; x <= W; x += 40) g.lineTo(x, 250 - Math.abs(Math.sin(x / 130)) * 70 - Math.sin(x / 47) * 12);
  g.lineTo(W, H); g.lineTo(0, H); g.fill();
  // The museum hall: warm plaster, a timber frame and a tiled roof edge.
  const { x: hx, y: hy, w: hw, h: hh } = HALL;
  g.fillStyle = 'rgba(0,0,0,0.25)'; roundRect(g, hx + 6, hy + 8, hw, hh, 14); g.fill();
  const wall = g.createLinearGradient(0, hy, 0, hy + hh);
  wall.addColorStop(0, '#f1e3c4'); wall.addColorStop(1, '#dcc7a0');
  g.fillStyle = wall; roundRect(g, hx, hy, hw, hh, 14); g.fill();
  g.fillStyle = '#8a3a26'; roundRect(g, hx - 10, hy - 16, hw + 20, 24, 8); g.fill();
  g.fillStyle = '#a8492e';
  for (let x = hx - 6; x < hx + hw + 6; x += 22) { g.beginPath(); g.arc(x + 11, hy + 6, 11, 0, Math.PI); g.fill(); }
  g.strokeStyle = '#7a5434'; g.lineWidth = 6; g.strokeRect(hx + 3, hy + 3, hw - 6, hh - 6);
  // The shelves, one per old mine, each with three plinths.
  F.rows.forEach((row, r) => {
    const y = fiestaRowY(r);
    g.fillStyle = '#7a5232'; roundRect(g, hx + 186, y + 22, 300, 9, 3); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(hx + 190, y + 31, 292, 5);
    g.font = 'bold 14px "Palatino Linotype", Palatino, Georgia, serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillStyle = '#5a4226'; wrapText(g, row.name, hx + 176, y + 4, 160, 16);
    row.pieces.forEach((pc, c) => drawPlinth(g, PLINTH_X[c], y, pc, t, 40));
  });
  // The cave's piece, in the place of honour on a tall pedestal.
  const C = F.crown, [cx, cy] = fiestaCrownAt();
  if (C.lit > 0) spotlight(g, cx, cy, C.lit, 120, 'rgba(190,255,215,');
  g.fillStyle = '#b8a888'; roundRect(g, cx - 34, cy + 34, 68, 150, 6); g.fill();
  g.fillStyle = '#d2c4a4'; roundRect(g, cx - 42, cy + 28, 84, 12, 4); g.fill(); roundRect(g, cx - 42, cy + 178, 84, 12, 4); g.fill();
  // An engraved plaque on the pedestal.
  g.fillStyle = '#8a6a3a'; roundRect(g, cx - 30, cy + 62, 60, 50, 4); g.fill();
  g.fillStyle = '#c9a24a'; roundRect(g, cx - 27, cy + 65, 54, 44, 3); g.fill();
  g.font = 'bold 11px "Palatino Linotype", Palatino, Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#4a3214';
  wrapText(g, C.label, cx, cy + 87, 50, 12);
  if (C.got && C.lit > 0) {
    g.save(); g.globalAlpha = Math.min(1, C.lit * 1.5);
    paint(g, 'find', 'collar', cx, cy + 4 + Math.sin(t * 1.6) * 2, 64 * (0.85 + 0.15 * Math.min(1, C.lit)));
    g.restore();
    if (C.lit >= 1 && (t * 0.7) % 1 < 0.3) sparkle(g, cx + 18, cy - 18, 5 * Math.sin(((t * 0.7) % 1) / 0.3 * Math.PI));
  } else if (!C.got) questionCard(g, cx, cy + 8);
  // Bunting across the top, red and white, and a string of lights.
  for (const [y0, sag, off] of [[20, 26, 0], [40, 18, 0.5]]) {
    g.strokeStyle = 'rgba(60,40,30,0.8)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, y0); g.quadraticCurveTo(W / 2, y0 + sag * 2, W, y0); g.stroke();
    for (let k = 0; k < 24; k++) {
      const u = (k + off) / 24, x = u * W, y = y0 + 4 * sag * u * (1 - u) * 1, sway = Math.sin(t * 2 + k) * 2;
      g.fillStyle = k % 3 === 2 ? '#2e8b57' : k % 2 ? '#f6f0e4' : '#c8202a';
      g.beginPath(); g.moveTo(x - 9, y); g.lineTo(x + 9, y); g.lineTo(x + sway, y + 20); g.closePath(); g.fill();
    }
  }
  // The crowd walks in from both sides and cheers.
  drawCrowd(g, F.crowd, F.cheer, t);
  // Confetti.
  for (const q of F.confetti) {
    g.save(); g.translate(q.x, q.y); g.rotate(q.a); g.fillStyle = q.c;
    g.fillRect(-q.s, -q.s * 0.4, q.s * 2, q.s * 0.8); g.restore();
  }
}

function wrapText(g, text, x, y, maxW, lh) {
  const words = String(text).split(' '), lines = [];
  let line = '';
  for (const w of words) { const test = line ? `${line} ${w}` : w; if (g.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; }
  lines.push(line);
  lines.forEach((l, i) => g.fillText(l, x, y + (i - (lines.length - 1) / 2) * lh));
}

function spotlight(g, x, y, k, r, rgb) {
  const a = Math.min(1, k);
  const cone = g.createLinearGradient(0, y - r * 1.6, 0, y + r * 0.5);
  cone.addColorStop(0, `${rgb}0)`); cone.addColorStop(0.6, `${rgb}${0.28 * a})`); cone.addColorStop(1, `${rgb}0)`);
  g.fillStyle = cone; g.beginPath(); g.moveTo(x - 8, y - r * 1.6); g.lineTo(x + 8, y - r * 1.6); g.lineTo(x + r * 0.5, y + r * 0.45); g.lineTo(x - r * 0.5, y + r * 0.45); g.closePath(); g.fill();
  const glow = g.createRadialGradient(x, y, 2, x, y, r * 0.55);
  glow.addColorStop(0, `${rgb}${0.55 * a})`); glow.addColorStop(1, `${rgb}0)`);
  g.fillStyle = glow; g.fillRect(x - r, y - r, r * 2, r * 2);
}

function questionCard(g, x, y) {
  g.fillStyle = 'rgba(120,96,64,0.28)'; roundRect(g, x - 13, y - 15, 26, 30, 5); g.fill();
  g.strokeStyle = 'rgba(90,66,38,0.5)'; g.setLineDash([3, 3]); g.lineWidth = 1.5; roundRect(g, x - 13, y - 15, 26, 30, 5); g.stroke(); g.setLineDash([]);
  g.fillStyle = 'rgba(90,66,38,0.7)'; g.font = 'bold 18px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', x, y + 1);
}

// A plinth on its shelf: lit up with its piece, or empty with a question mark.
function drawPlinth(g, x, y, pc, t, size) {
  if (pc.got && pc.lit > 0) spotlight(g, x, y, pc.lit, 60, 'rgba(255,230,160,');
  g.fillStyle = '#c8b898'; roundRect(g, x - 20, y + 12, 40, 10, 3); g.fill();
  g.fillStyle = '#ddd0b0'; roundRect(g, x - 22, y + 10, 44, 4, 2); g.fill();
  if (pc.got && pc.lit > 0) {
    const pop = pc.lit < 1 ? 1 + 0.35 * Math.sin(pc.lit * Math.PI) : 1;
    g.save(); g.globalAlpha = Math.min(1, pc.lit * 2);
    paint(g, 'find', pc.id, x, y - 6, size * pop);
    g.restore();
  } else if (!pc.got && pc.lit > 0) { g.save(); g.globalAlpha = Math.min(1, pc.lit * 2); questionCard(g, x, y - 6); g.restore(); }
}

const SKIN = ['#f1c9a5', '#e0ac85', '#c98e63', '#a8704a', '#f6d7bd'];
function drawCrowd(g, walk, cheer, t) {
  const n = 26;
  for (let k = 0; k < n; k++) {
    const left = k % 2 === 0, slot = Math.floor(k / 2), row = k % 4 < 2 ? 0 : 1;
    const home = left ? 40 + slot * 34 + row * 17 : W - 40 - slot * 34 - row * 17;
    const start = left ? -60 - slot * 30 : W + 60 + slot * 30;
    const u = Math.max(0, Math.min(1, walk * 1.4 - slot * 0.04)), e = 1 - (1 - u) * (1 - u);
    const x = start + (home - start) * e, kid = hash(k, 5) < 0.3, s = kid ? 0.72 : 0.95 + hash(k, 6) * 0.15;
    const hop = u < 1 ? Math.abs(Math.sin(t * 9 + k)) * 3 : cheer * Math.abs(Math.sin(t * 6 + k * 1.3)) * 7;
    const base = H - 8 - row * 16, y = base - hop;
    g.save(); g.translate(x, y); g.scale(s, s);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(0, hop / s, 13, 3, 0, 0, Math.PI * 2); g.fill();
    // Fiesta whites, a red sash and neckerchief.
    g.fillStyle = '#3a3a44'; roundRect(g, -8, -26, 6, 26, 3); g.fill(); roundRect(g, 2, -26, 6, 26, 3); g.fill();
    g.fillStyle = '#f8f4ea'; roundRect(g, -11, -58, 22, 36, 8); g.fill();
    g.fillStyle = '#c8202a'; g.fillRect(-11, -32, 22, 5);
    g.beginPath(); g.moveTo(-8, -58); g.lineTo(8, -58); g.lineTo(0, -48); g.closePath(); g.fill();
    // Arms: up when cheering.
    const up = cheer > 0.2 && hash(k, 8) < 0.7;
    g.strokeStyle = '#f8f4ea'; g.lineWidth = 6; g.lineCap = 'round';
    const wave = Math.sin(t * 8 + k) * 0.3;
    for (const sd of [-1, 1]) {
      g.beginPath(); g.moveTo(sd * 10, -52);
      if (up) g.lineTo(sd * (16 + wave * 6), -78 + Math.abs(wave) * 6); else g.lineTo(sd * 14, -32);
      g.stroke();
    }
    g.lineCap = 'butt';
    g.fillStyle = SKIN[k % SKIN.length]; g.beginPath(); g.arc(0, -68, 10, 0, Math.PI * 2); g.fill();
    if (hash(k, 9) < 0.45) { g.fillStyle = hash(k, 10) < 0.5 ? '#c8202a' : '#26262e'; g.beginPath(); g.ellipse(0, -76, 12, 4.5, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(0, -78, 2, 0, Math.PI * 2); g.fill(); }
    else { g.fillStyle = ['#3a2a1a', '#6a4a2a', '#2a2a2a', '#b8864a'][k % 4]; g.beginPath(); g.arc(0, -71, 10, Math.PI, 0); g.fill(); }
    g.fillStyle = '#2a1a10'; g.beginPath(); g.arc(-3.5, -68, 1.3, 0, Math.PI * 2); g.arc(3.5, -68, 1.3, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#7a3a2a'; g.lineWidth = 1.4; g.beginPath(); g.arc(0, -65, 3.5, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    g.restore();
  }
}
