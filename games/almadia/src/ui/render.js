// Draws a race onto the 480x270 canvas, top-down, in pixel art.
//
// Everything that never moves (banks, water depth, trees, rocks, the weir
// wall, jetties) is painted once into 128px-tall strips of river and cached;
// strips ahead of the raft are painted a little at a time so the Pi never
// stalls. Each frame then blits the strips and draws only what moves: ripples,
// foam, ducks, flags, drifting logs and the raft.
//
// Anything that matters is also told apart by shape, not only colour.

import { P, Bitmap, mix, dither, hash2, noise2p, cached } from './pixel.js';

export const W = 480;
export const H = 270;
export const RAFT_SCREEN_Y = 78; // the raft rides high so players see ahead
const CH = 128; // strip height

export function camera(race, prev) {
  const target = race.raft.y - RAFT_SCREEN_Y;
  const y = prev == null ? target : prev + (target - prev) * 0.15;
  return Math.max(race.course.startY - RAFT_SCREEN_Y - 30, y);
}

// ---- tiles and sprites (painted once) ---------------------------------------

const TILE = 128;
const tile = (name, paint) => cached(`tile.${name}`, () => { const bm = new Bitmap(TILE, TILE); paint(bm); return bm; });

const grassTile = () => tile('grass', (bm) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    // Periodic noise, so the tile repeats without a seam.
    const n = noise2p(x / 16, y / 16, TILE / 16, 4) * 0.6 + noise2p(x / 8, y / 8, TILE / 8, 5) * 0.3 + noise2p(x / 4, y / 4, TILE / 4, 6) * 0.1;
    bm.set(x, y, n > 0.56 ? P.grass1 : n > 0.47 ? (dither(x, y, (n - 0.47) * 11) ? P.grass1 : P.grass2) : n > 0.4 ? P.grass2 : P.grass3);
  }
  for (let i = 0; i < 160; i++) {
    const x = Math.floor(hash2(i, 7) * TILE), y = Math.floor(hash2(7, i) * TILE);
    bm.set(x, y, P.grass0); bm.set(x + 1, y + 1, P.grass3);
    if (i % 17 === 0) { bm.set(x + 3, y, i % 2 ? P.white : P.sun1); }
  }
});

const pebbleTile = () => tile('pebble', (bm) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const h = hash2(x >> 1, y >> 1, 3);
    bm.set(x, y, h > 0.8 ? P.pebble0 : h > 0.45 ? P.pebble1 : h > 0.15 ? P.pebble2 : P.pebble3);
  }
});

// Rock for gorge walls: cracked grey stone.
const cliffTile = () => tile('cliff', (bm) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = noise2p(x / 16, y / 16, TILE / 16, 7) * 0.7 + noise2p(x / 4, y / 4, TILE / 4, 8) * 0.3;
    let c = n > 0.62 ? P.rock0 : n > 0.5 ? P.rock1 : n > 0.38 ? P.rock2 : P.rock3;
    if (Math.abs(noise2p(x / 10, y / 10, TILE / 10, 9) - 0.5) < 0.025) c = P.rock4; // cracks
    bm.set(x, y, c);
  }
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(hash2(i, 21) * TILE), y = Math.floor(hash2(21, i) * TILE);
    bm.set(x, y, P.moss); bm.set(x + 1, y, P.grass3);
  }
});

// Farmland: a patchwork of fields in rows, with hedges between them.
const fieldTile = () => tile('fields', (bm) => {
  const crops = [[P.sun1, P.dusk1], [P.grass1, P.grass2], [P.dirt1, P.dirt2], [P.grass0, P.grass1], [P.dusk0, P.dusk1]];
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const cx = x >> 5, cy = y >> 5, k = Math.floor(hash2(cx, cy, 3) * crops.length);
    const vertical = hash2(cy, cx, 4) > 0.5;
    const row = ((vertical ? x : y) >> 1) & 1;
    let c = crops[k][row];
    if ((x & 31) === 0 || (y & 31) === 0) c = P.grass4;
    else if ((x & 31) === 1 || (y & 31) === 1) c = P.grass3;
    bm.set(x, y, c);
  }
});

// Dry plain of the lower Ebro: pale earth, scrub, stones.
const plainTile = () => tile('plain', (bm) => {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = noise2p(x / 16, y / 16, TILE / 16, 12) * 0.7 + noise2p(x / 4, y / 4, TILE / 4, 13) * 0.3;
    bm.set(x, y, n > 0.6 ? P.dusk0 : n > 0.45 ? P.dirt0 : n > 0.32 ? (dither(x, y, 0.5) ? P.dirt0 : P.dirt1) : P.dirt1);
  }
  for (let i = 0; i < 120; i++) {
    const x = Math.floor(hash2(i, 31) * TILE), y = Math.floor(hash2(31, i) * TILE);
    bm.set(x, y, i % 3 ? P.mid1 : P.pebble1);
  }
});

const LAND = { forest: grassTile, gorge: cliffTile, fields: fieldTile, plain: plainTile };

// Style at a point, dithered across a 64px blend where zones meet.
function styleAt(race, x, y) {
  const th = race.themes;
  let i = 0;
  while (i + 1 < th.length && th[i + 1].y <= y) i++;
  const next = th[i + 1];
  if (next && next.y - y < 64 && dither(x, y, 1 - (next.y - y) / 64)) return next.style;
  return th[i].style;
}

// Olive or scrub bush for the plain.
function oliveTop(bm, cx, cy, r) {
  bm.ellipse(cx + 2, cy + 2, r, r * 0.8, (x, y) => (dither(cx + x, cy + y, 0.5) ? P.dirt2 : 0));
  bm.ellipse(cx, cy, r, r * 0.85, (x, y, q) => (q > 0.8 ? P.mid3 : x + y < -r * 0.4 ? P.mid0 : hash2(cx + x, cy + y) > 0.5 ? P.mid1 : P.mid2));
}

// A house seen from above: a pitched roof, ridge along its length.
function roofTop(bm, x, y, w, h, kind, seed) {
  const [lit, mid, dark] = kind === 'tile' ? [P.tile0, P.tile1, P.tile2] : [P.far1, P.roof0, P.roof1];
  bm.rect(x + 2, y + 2, w, h, P.grass4);
  const along = w >= h;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const firstHalf = along ? j < h / 2 : i < w / 2;
    let c = firstHalf ? lit : mid;
    if (along ? (i & 3) === 0 : (j & 3) === 0) c = firstHalf ? mid : dark; // tile courses
    if (along ? Math.abs(j - h / 2 + 0.5) < 0.6 : Math.abs(i - w / 2 + 0.5) < 0.6) c = dark; // ridge
    if (i === 0 || j === 0 || i === w - 1 || j === h - 1) c = P.roof3;
    bm.set(x + i, y + j, c);
  }
  if (hash2(seed, 5) > 0.3) { const cx = x + 2 + Math.floor(hash2(seed, 6) * (w - 5)); bm.rect(cx, y + 2, 3, 3, P.stone3); bm.set(cx + 1, y + 3, P.black); }
}

// A small walled vegetable plot between houses.
function garden(bm, x, y, seed) {
  const w = 14 + Math.floor(hash2(seed, 1) * 8), h = 12;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let c = (j >> 1) & 1 ? P.grass1 : P.dirt1;
    if (i === 0 || j === 0 || i === w - 1 || j === h - 1) c = P.stone2;
    bm.set(x + i, y + j, c);
  }
}

function churchTop(bm, x, y, kind) {
  roofTop(bm, x, y, 30, 16, kind, 99);
  // Square bell tower with a pyramid roof at the west end.
  const tx = x - 12, ty = y + 2;
  bm.rect(tx + 2, ty + 2, 12, 12, P.grass4);
  for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) {
    const cx = i - 5.5, cy = j - 5.5;
    let c = Math.abs(cx) > Math.abs(cy) ? (cx < 0 ? P.stone0 : P.stone2) : cy < 0 ? P.stone1 : P.stone3;
    if (i === 0 || j === 0 || i === 11 || j === 11) c = P.stone4;
    bm.set(tx + i, ty + j, c);
  }
  bm.rect(tx + 5, ty + 5, 2, 2, P.sun1);
}

// Houses along the banks, set back behind a street, with a church.
function paintVillage(bm, race, v, y0) {
  const rv = race.river;
  for (const side of v.sides) {
    const dir = side === 'left' ? -1 : 1;
    let k = 0;
    for (let y = v.y; y < v.y2; y += 20, k++) {
      if (y + 20 < y0 - 30 || y > y0 + CH + 30) continue;
      if (race.bridges.some((b) => Math.abs(b.y - y) < 18)) continue; // keep the bridge road clear
      const bank = side === 'left' ? rv.leftAt(y) : rv.rightAt(y);
      // Street along the river.
      for (let yy = y; yy < y + 20; yy++) for (let d = 14; d < 20; d++) {
        const x = Math.round(bank + dir * d);
        if (yy - y0 >= 0 && yy - y0 < CH) bm.set(x, yy - y0, dither(x, yy, 0.3) ? P.dirt1 : P.dirt0);
      }
      for (let rowN = 0; rowN < 3; rowN++) {
        const salt = v.seed * 7 + (side === 'left' ? 1 : 2);
        const hsh = hash2(k, rowN, salt);
        // Back rows thin out: the village fades into its fields.
        if (hsh < 0.22 + rowN * 0.18) {
          if (hsh > 0.1) garden(bm, side === 'left' ? Math.round(bank - 40 - rowN * 26) : Math.round(bank + 26 + rowN * 26), Math.round(y + 3 - y0), k + rowN);
          continue;
        }
        const w = 11 + Math.floor(hash2(k, rowN, 3) * 11), hh = 9 + Math.floor(hash2(rowN, k, 4) * 8);
        const dist = 22 + rowN * 27 + Math.floor(hash2(rowN, k, salt + 5) * 6);
        const jy = Math.floor(hash2(k, rowN, salt + 6) * 6) - 3;
        const x = side === 'left' ? Math.round(bank - dist - w) : Math.round(bank + dist);
        if (x < -w || x > W) continue;
        roofTop(bm, x, Math.round(y + 2 + jy - y0), w, hh, v.roof, k * 3 + rowN + salt);
      }
    }
    if (v.church === side) {
      const cy = Math.round((v.y + v.y2) / 2), bank = side === 'left' ? rv.leftAt(cy) : rv.rightAt(cy);
      const cx = side === 'left' ? Math.round(bank - 64) : Math.round(bank + 40);
      if (cy > y0 - 40 && cy < y0 + CH + 40) churchTop(bm, cx, cy - 8 - y0, v.roof);
    }
  }
}

// Roads running up to each bridge from both banks.
function paintBridgeRoads(bm, race, b, y0) {
  const rv = race.river, y = Math.round(b.y - y0);
  for (let x = 0; x < W; x++) {
    const d = Math.min(x - rv.leftAt(b.y), rv.rightAt(b.y) - x);
    if (d > -6) continue;
    for (let dy = -b.depth - 3; dy <= b.depth + 3; dy++) bm.set(x, y + dy, Math.abs(dy) > b.depth + 1 ? P.dirt2 : dither(x, dy, 0.3) ? P.dirt1 : P.dirt0);
  }
}

// Top-down pine: a ragged star, lit from the top left.
function pineTop(bm, cx, cy, r, seed) {
  bm.ellipse(cx + 3, cy + 3, r, r * 0.9, (x, y) => (dither(cx + x, cy + y, 0.55) ? P.grass4 : 0));
  const spikes = 7 + (seed % 3);
  for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
    const d = Math.hypot(x, y), ang = Math.atan2(y, x);
    const edge = r * (0.78 + 0.22 * Math.abs(Math.sin(ang * spikes / 2 + seed)));
    if (d > edge) continue;
    const light = -(x + y) / (r * 1.4) + (1 - d / r) * 0.4;
    let c = light > 0.55 ? P.pine0 : light > 0.15 ? P.pine1 : light > -0.3 ? P.pine2 : P.pine3;
    if (d > edge - 1) c = P.pine4;
    if (d < 1.2) c = P.pine3;
    bm.set(cx + x, cy + y, c);
  }
}

function bushTop(bm, cx, cy, r) {
  bm.ellipse(cx + 2, cy + 2, r, r * 0.8, (x, y) => (dither(cx + x, cy + y, 0.5) ? P.grass4 : 0));
  bm.ellipse(cx, cy, r, r * 0.85, (x, y, q) => (q > 0.8 ? P.grass4 : x + y < -r * 0.5 ? P.grass0 : x + y < r * 0.3 ? P.grass1 : P.grass2));
}

// A river rock, shaded, with a mossy top and a dark outline.
function rockTop(bm, cx, cy, r) {
  bm.ellipse(cx, cy, r, r * 0.9, (x, y, q) => {
    if (q > 0.78) return P.rock4;
    const l = -(x + y) / (r * 1.5);
    if (l > 0.35 && hash2(cx + x, cy + y) > 0.7) return P.moss;
    return l > 0.4 ? P.rock0 : l > 0.05 ? P.rock1 : l > -0.35 ? P.rock2 : P.rock3;
  });
}

// ---- static strips ----------------------------------------------------------

function stripKey(race, i) { return `strip.${race.course.id}.${i}`; }

function paintStrip(race, i) {
  const bm = new Bitmap(W, CH);
  const y0 = i * CH, rv = race.river;
  const pebble = pebbleTile();
  const tiles = Object.fromEntries(Object.entries(LAND).map(([k, f]) => [k, f()]));

  // Ground, shore and water depth, row by row. Gorges get rock walls that
  // shade the water below them instead of a pebble shore.
  for (let j = 0; j < CH; j++) {
    const y = y0 + j, l = rv.leftAt(y), r = rv.rightAt(y);
    const shoreL = 6 + Math.round(hash2(y >> 3, 1) * 4), shoreR = 6 + Math.round(hash2(y >> 3, 2) * 4);
    for (let x = 0; x < W; x++) {
      const inL = x - l, inR = r - x, d = Math.min(inL, inR);
      const shore = inL < inR ? shoreL : shoreR;
      const style = styleAt(race, x, y), gorge = style === 'gorge';
      let c;
      if (d < -shore) c = (tiles[style] ?? tiles.forest).px[(y & 127) * TILE + (x & 127)];
      else if (d < -1) c = gorge ? (d > -4 ? P.rock4 : d > -7 ? P.rock3 : P.rock2) : pebble.px[(y & 127) * TILE + (x & 127)];
      else if (d < 1) c = gorge ? P.rock4 : P.dirt2;
      else {
        const t = Math.min(1, d / 50);
        c = t < 0.12 ? P.water2 : t < 0.5 ? (dither(x, y, (t - 0.12) * 2.6) ? P.water3 : P.water2) : dither(x, y, (t - 0.5) * 2) ? P.water4 : P.water3;
        if (gorge && d < 10 && dither(x, y, 1 - d / 10)) c = P.water5; // cliff shadow
        else if (d < 3 && dither(x, y, 0.5)) c = P.water1;
      }
      bm.px[j * W + x] = c;
    }
  }

  // Trees and bushes on both banks, on a jittered grid.
  const G = 18;
  for (let gy = Math.floor((y0 - 20) / G); gy <= Math.floor((y0 + CH + 20) / G); gy++) {
    for (let gx = 0; gx < W / G; gx++) {
      const h = hash2(gx, gy, 11);
      if (h < 0.35) continue;
      const x = gx * G + hash2(gy, gx, 3) * G, y = gy * G + hash2(gx, gy, 5) * G;
      const d = Math.min(x - rv.leftAt(y), rv.rightAt(y) - x);
      if (d > -22) continue;
      if (race.villages.some((v) => y > v.y - 10 && y < v.y2 + 10 && d > -120)) continue;
      if (race.bridges.some((b) => Math.abs(b.y - y) < 20)) continue;
      const style = styleAt(race, x, y), px = Math.round(x), py = Math.round(y - y0);
      if (style === 'forest') {
        if (h > 0.55) pineTop(bm, px, py, 6 + Math.round(hash2(gx, gy, 9) * 4), gx + gy);
        else bushTop(bm, px, py, 3 + Math.round(hash2(gy, gx, 9) * 2));
      } else if (style === 'gorge') {
        if (h > 0.7 && d < -30) pineTop(bm, px, py, 5 + Math.round(hash2(gx, gy, 9) * 3), gx + gy);
      } else if (style === 'fields') {
        if (h > 0.85) bushTop(bm, px, py, 4 + Math.round(hash2(gy, gx, 9) * 3));
      } else if (h > 0.72) oliveTop(bm, px, py, 3 + Math.round(hash2(gy, gx, 9) * 2));
    }
  }
  for (const b of race.bridges) if (b.y > y0 - 30 && b.y < y0 + CH + 30) paintBridgeRoads(bm, race, b, y0);
  for (const v of race.villages) if (v.y2 > y0 - 40 && v.y < y0 + CH + 40) paintVillage(bm, race, v, y0);

  // Fixed hazards and landmarks that reach into this strip.
  const inStrip = (a, b, pad = 40) => b > y0 - pad && a < y0 + CH + pad;
  for (const hz of race.hazards) {
    if (!inStrip(hz.minY, hz.maxY)) continue;
    const oy = -y0;
    if (hz.kind === 'rock') rockTop(bm, Math.round(hz.x1), Math.round(hz.y1 + oy), hz.r);
    else if (hz.kind === 'sandbar') paintSandbar(bm, hz, oy);
    else if (hz.kind === 'tree') paintFallenTree(bm, hz, oy);
    else if (hz.kind === 'pillar') paintPillar(bm, hz, oy);
    else if (hz.kind === 'weir') paintWeirWall(bm, hz, oy);
  }
  for (const d of race.docks) if (inStrip(d.y - 20, d.y + 20)) paintJetty(bm, d, -y0);
  for (const u of race.users) if (inStrip(u.y - 20, u.y + 20)) paintWashStone(bm, u, -y0);
  for (const e of race.eddies) if (inStrip(e.y - 50, e.y + 50)) { paintEddyWater(bm, e, -y0); paintEddySign(bm, e, -y0); }
  if (inStrip(race.course.length - 30, race.course.length + 10)) paintFinish(bm, race, -y0);
  return bm.canvas();
}

function paintSandbar(bm, hz, oy) {
  const n = Math.max(1, Math.ceil(Math.hypot(hz.x2 - hz.x1, hz.y2 - hz.y1) / 3));
  for (let k = 0; k <= n; k++) {
    const x = hz.x1 + (hz.x2 - hz.x1) * (k / n), y = hz.y1 + (hz.y2 - hz.y1) * (k / n) + oy;
    bm.ellipse(Math.round(x), Math.round(y), hz.r, hz.r * 0.8, (dx, dy, q) => {
      const h = hash2(Math.round(x) + dx, Math.round(y) + dy, 4);
      if (q > 0.8) return dither(dx, dy, 0.5) ? P.water1 : P.pebble1;
      return h > 0.85 ? P.pebble0 : dy < -hz.r * 0.3 ? P.dirt0 : h > 0.3 ? P.pebble0 : P.pebble1;
    });
  }
}

function paintFallenTree(bm, hz, oy) {
  const len = Math.hypot(hz.x2 - hz.x1, hz.y2 - hz.y1), ux = (hz.x2 - hz.x1) / len, uy = (hz.y2 - hz.y1) / len;
  // Crown (drowned branches) at the far end, then the trunk over it.
  pineTop(bm, Math.round(hz.x2 - ux * 4), Math.round(hz.y2 + oy), 11, 3);
  for (let s = 0; s < len; s++) {
    const x = hz.x1 + ux * s, y = hz.y1 + uy * s + oy;
    for (let w = -hz.r; w <= hz.r; w++) {
      const px = x - uy * w, py = y + ux * w;
      bm.set(px, py, w <= -hz.r + 1 ? P.log1 : w >= hz.r - 1 ? P.log4 : hash2(Math.round(s), w) > 0.85 ? P.log3 : P.log2);
    }
    if (Math.round(s) % 11 === 5) bm.line(x, y, x + uy * 9 + ux * 3, y - ux * 9 + uy * 3, P.log3);
    if (Math.round(s) % 13 === 8) bm.line(x, y, x - uy * 8 + ux * 2, y + ux * 8 + uy * 2, P.log3);
  }
  // The pale root plate on the bank.
  bm.ellipse(Math.round(hz.x1), Math.round(hz.y1 + oy), 5, 6, (dx, dy, q) => (q > 0.6 ? P.dirt3 : P.dirt1));
}

function paintPillar(bm, hz, oy) {
  const x = Math.round(hz.x1), top = Math.round(hz.y1 + oy - hz.r), bottom = Math.round(hz.y2 + oy + hz.r);
  for (let y = top; y <= bottom; y++) {
    // Pointed cutwater facing upstream.
    const inset = y - top < hz.r ? hz.r - (y - top) : 0;
    for (let dx = -hz.r + inset; dx <= hz.r - inset; dx++) {
      const course = (y >> 2) & 1, n = hash2((dx + course * 2) >> 2, y >> 2, 5);
      let c = n > 0.6 ? P.stone1 : n > 0.25 ? P.stone2 : P.stone3;
      if (dx === -hz.r + inset) c = P.stone0;
      if (dx === hz.r - inset || (y & 3) === 3) c = P.stone3;
      bm.set(x + dx, y, c);
    }
  }
}

function paintWeirWall(bm, hz, oy) {
  const y = Math.round(hz.y1 + oy);
  for (let x = Math.round(Math.min(hz.x1, hz.x2)); x <= Math.round(Math.max(hz.x1, hz.x2)); x++) {
    for (let dy = -5; dy <= 4; dy++) {
      const n = hash2((x + ((dy >> 2) & 1) * 3) >> 3, (dy + 8) >> 2, 9);
      let c = dy < -3 ? P.stone0 : n > 0.5 ? P.stone1 : P.stone2;
      if ((x & 7) === 0 || dy === 4) c = P.stone3;
      bm.set(x, y + dy, c);
    }
  }
  // Striped marker posts at the chute: shape as well as colour.
  const w = hz.ref;
  if (w && hz.x2 < w.x) for (const px of [w.x - w.half - 3, w.x + w.half + 1]) {
    for (let dy = -9; dy <= 5; dy++) { bm.set(px, y + dy, ((dy + 9) >> 2) & 1 ? P.white : P.p1); bm.set(px + 1, y + dy, ((dy + 9) >> 2) & 1 ? P.snow2 : P.p1d); }
  }
}

function paintJetty(bm, d, oy) {
  const dir = d.side === 'left' ? 1 : -1, y = Math.round(d.y + oy);
  const base = Math.round(d.x - dir * 22);
  for (let k = 0; k < 22; k++) {
    const x = base + dir * k;
    for (let dy = -4; dy <= 4; dy++) bm.set(x, y + dy, (k % 4 === 0) ? P.log4 : dy === -4 ? P.log1 : dy === 4 ? P.log3 : P.log2);
  }
  for (const k of [3, 19]) { bm.rect(base + dir * k - 1, y - 6, 3, 3, P.log4); bm.rect(base + dir * k - 1, y + 4, 3, 3, P.log4); }
  // Timber stacked on the bank, waiting for the order.
  const sx = base - dir * 14;
  for (let r = 0; r < 3; r++) for (let k = 0; k < 12; k++) {
    const x = sx + k, yy = y - 6 + r * 4;
    bm.set(x, yy, P.log1); bm.set(x, yy + 1, P.log2); bm.set(x, yy + 2, P.log3);
    if (k === 0 || k === 11) { bm.set(x, yy, P.log0); bm.set(x, yy + 1, P.ring); bm.set(x, yy + 2, P.log0); }
  }
}

function paintWashStone(bm, u, oy) {
  const x = Math.round(u.x + (u.side === 'left' ? -10 : 10)), y = Math.round(u.y + oy);
  bm.ellipse(x, y + 3, 9, 4, (dx, dy, q) => (q > 0.7 ? P.stone3 : dy < 0 ? P.stone0 : P.stone1));
  bm.ellipse(x + (u.side === 'left' ? -9 : 9), y - 5, 4, 3, (dx, dy, q) => (q > 0.7 ? P.log4 : P.dirt1)); // basket
  for (let k = 0; k < 3; k++) bm.rect(x + (u.side === 'left' ? -11 : 7) + k, y - 7 + k, 2, 1, P.shirt0);
}

// Eddies are calm, pale pools: easy to tell from the dark swirl of a whirlpool.
function paintEddyWater(bm, e, oy) {
  const cy = Math.round(e.y + oy);
  bm.ellipse(Math.round(e.x), cy, e.r, e.r * 0.85, (dx, dy, q) => {
    const x = Math.round(e.x) + dx, y = cy + dy, c = bm.get(x, y);
    if (c !== P.water2 && c !== P.water3 && c !== P.water4 && c !== P.water1) return c; // leave the bank alone
    return q > 0.85 ? (dither(x, y, 0.5) ? P.water0 : P.water1) : dither(x, y, 0.35) ? P.water1 : P.water2;
  });
}

function paintEddySign(bm, e, oy) {
  const bx = Math.round(e.side === 'left' ? e.x - e.r - 4 : e.x + e.r + 4), y = Math.round(e.y + oy);
  bm.rect(bx, y - 6, 2, 10, P.log3);
  // A coil of rope on a post: "tie up here".
  bm.ellipse(bx + 1, y - 9, 5, 4, (dx, dy, q) => (q > 0.75 ? P.log4 : q > 0.3 ? (((dx + dy) & 1) ? P.moss : P.pine1) : 0));
}

function paintFinish(bm, race, oy) {
  const y = Math.round(race.course.length + oy), l = Math.round(race.river.leftAt(race.course.length)), r = Math.round(race.river.rightAt(race.course.length));
  for (const px of [l - 6, r + 3]) bm.rect(px, y - 26, 3, 30, P.log3);
  for (let x = l - 3; x < r + 3; x++) for (let dy = 0; dy < 8; dy++) {
    const c = (((x - l) >> 2) + (dy >> 2)) & 1 ? P.black : P.white;
    bm.set(x, y - 26 + dy, c);
  }
}

// Strips are cached per course. Paint at most one new strip per frame,
// nearest first, to spread the work.
const strips = new Map();
function strip(race, i, allowPaint) {
  const key = stripKey(race, i);
  let c = strips.get(key);
  if (!c && allowPaint.n > 0) {
    allowPaint.n--;
    c = paintStrip(race, i);
    strips.set(key, c);
    if (strips.size > 24) strips.delete(strips.keys().next().value);
  }
  return c;
}

export function warmStrips(race, fromY, count = 4) {
  const budget = { n: count };
  for (let i = Math.floor(fromY / CH); budget.n > 0 && i < Math.floor(fromY / CH) + 8; i++) strip(race, i, budget);
}

// ---- dynamic sprites ----------------------------------------------------------

const sprite = (key, w, h, paint) => cached(`sp.${key}`, () => { const bm = new Bitmap(w, h); paint(bm); return bm.canvas(); });

function raftCanvas(race) {
  const R = race.rules.raft, raft = race.raft;
  const L = R.length, Wd = R.width, per = Wd / R.logs;
  const coop = race.players === 2;
  const key = `raft.${raft.logs}.${raft.loose ? 1 : 0}.${coop ? 2 : 1}.${raft.braced[0] ? 1 : 0}${raft.braced[1] ? 1 : 0}`;
  return sprite(key, Wd + 4, L + 4, (bm) => {
    const n = raft.logs, x0 = 2 + Math.round((Wd - n * per) / 2);
    for (let i = 0; i < n; i++) {
      const lx = Math.round(x0 + i * per), lw = Math.max(2, Math.round(per)), trim = (i * 7) % 3, len = L - trim * 2;
      const top = 2 + trim;
      for (let y = 0; y < len; y++) for (let k = 0; k < lw; k++) {
        let c = k === 0 ? P.log1 : k === lw - 1 ? P.log3 : P.log2;
        if (hash2(i, y, 2) > 0.9) c = P.log3;
        if (y === 0 || y === len - 1) c = k === lw - 1 ? P.log3 : P.log0;
        bm.set(lx + k, top + y, c);
      }
    }
    // Lashings: twisted withies across the logs; broken when loose.
    for (const ry of [8, Math.round(L / 2) + 2, L - 4]) {
      for (let x = x0 - 1; x <= x0 + n * per; x++) {
        if (raft.loose && hash2(x, ry) > 0.55) continue;
        bm.set(x, ry, (x & 1) ? P.moss : P.pine1);
        bm.set(x, ry + 1, (x & 1) ? P.pine2 : P.moss);
      }
    }
    // Crew, seen from above: beret, shoulders, sash in the player's colour.
    const crew = [{ y: L - 8, sash: coop ? P.p1 : P.sash0, braced: raft.braced[0] }, { y: 10, sash: coop ? P.p2 : P.sash0, braced: coop ? raft.braced[1] : raft.braced[0] }];
    const cx = 2 + Math.round(Wd / 2);
    for (const m of crew) {
      const sw = m.braced ? 3 : 4;
      bm.ellipse(cx, m.y, sw, 2, (dx) => (dx < 0 ? P.shirt0 : P.shirt1));
      bm.rect(cx - sw, m.y + 1, sw * 2 + 1, 1, m.sash);
      bm.ellipse(cx, m.y - 1, 2, 2, (dx, dy) => (dx + dy < 0 ? P.beret : P.beret1));
    }
  });
}

const raftShadow = (race) => {
  const src = raftCanvas(race);
  return cached(`shadow.${src.width}.${race.raft.logs}`, () => {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#0b2440';
    x.fillRect(0, 0, c.width, c.height);
    return c;
  });
};

const oarCanvas = () => sprite('oar', 3, 30, (bm) => {
  for (let y = 0; y < 22; y++) bm.set(1, y, y < 2 ? P.log0 : P.log3);
  bm.rect(0, 22, 3, 8, P.log2);
  bm.rect(0, 22, 1, 8, P.log1);
  bm.rect(0, 29, 3, 1, P.log4);
});

const duckFrames = () => [0, 1, 2].map((f) => sprite(`duck.${f}`, 13, 9, (bm) => {
  if (f === 0) {
    bm.ellipse(5, 5, 4, 2, (dx, dy) => (dy < 0 ? P.duck0 : P.duck1));
    bm.rect(1, 5, 2, 1, P.duck1);
  } else {
    bm.ellipse(5, 4, 3, 2, P.duck0);
    const up = f === 1 ? -3 : 2;
    bm.line(3, 4, 0, 4 + up, P.duck1, 2); bm.line(7, 4, 10, 4 + up, P.duck1, 2);
  }
  bm.rect(8, 2, 3, 3, P.duckhead); bm.set(9, 2, P.white);
  bm.rect(11, 3, 2, 1, P.beak);
}));

const washerSprite = (splashed) => sprite(`washer.${splashed ? 1 : 0}`, 12, 12, (bm) => {
  bm.ellipse(6, 7, 4, 3, (dx) => (dx < 0 ? P.cloth0 : P.cloth1)); // kneeling, seen from above
  bm.rect(2, 8, 9, 1, P.sash0);
  bm.ellipse(6, 4, 2, 2, (dx, dy) => (dx + dy < 0 ? P.dusk1 : P.dirt2)); // headscarf
  if (splashed) { bm.set(1, 1, P.water0); bm.set(10, 0, P.water0); bm.set(11, 3, P.water0); bm.set(0, 4, P.water0); }
});

const logCanvas = () => sprite('drift', 4, 54, (bm) => {
  for (let y = 0; y < 54; y++) { bm.set(0, y, P.log1); bm.set(1, y, P.log2); bm.set(2, y, P.log2); bm.set(3, y, P.log3); }
  bm.rect(0, 0, 4, 1, P.log0); bm.rect(0, 53, 4, 1, P.log0);
});

const flagCanvas = (f) => sprite(`flag.${f}`, 14, 22, (bm) => {
  bm.rect(1, 0, 2, 22, P.log4);
  if (f === 3) { // collected: a tick
    bm.line(4, 8, 7, 11, P.ok, 2); bm.line(7, 11, 12, 3, P.ok, 2);
    return;
  }
  const wave = [0, 1, 0][f];
  for (let x = 3; x < 13; x++) {
    const yy = 1 + Math.round(Math.sin((x + f * 2) * 0.8) * wave);
    for (let y = 0; y < 7; y++) bm.set(x, yy + y, y === 6 ? P.flag1 : P.flag);
  }
  bm.rect(5, 3 + wave, 6, 1, P.log0); bm.rect(5, 5 + wave, 6, 1, P.log0); // two logs: a timber order
});

// ---- per frame -----------------------------------------------------------------

export function drawRace(ctx, race, camY, time, fx = {}) {
  ctx.imageSmoothingEnabled = false;
  const sx = Math.round(fx.shakeX ?? 0), sy = Math.round(fx.shakeY ?? 0);
  const cam = Math.round(camY);
  ctx.save();
  ctx.translate(sx, -cam + sy);
  const top = cam - 20, bottom = cam + H + 20;

  // Static strips; paint one missing strip per frame (the nearest visible first).
  const budget = { n: 1 };
  ctx.fillStyle = '#437334';
  for (let i = Math.floor(top / CH); i <= Math.floor(bottom / CH); i++) {
    const c = strip(race, i, budget);
    if (c) ctx.drawImage(c, 0, i * CH);
    else ctx.fillRect(0, i * CH, W, CH);
  }
  if (budget.n > 0) strip(race, Math.floor(bottom / CH) + 1, budget); // look ahead

  drawRipples(ctx, race, top, bottom, time);
  for (const e of race.eddies) if (near(e.y, top, bottom, 60)) drawEddy(ctx, e, time, race.raft.lashing < 100 && !race.lash.active);
  for (const w of race.whirls) if (near(w.y, top, bottom, 60)) drawWhirl(ctx, w, time);
  for (const hz of race.hazards) if (hz.kind === 'rock' && near(hz.y1, top, bottom, 30)) drawRockFoam(ctx, race, hz, time);
  for (const hz of race.hazards) if (hz.kind === 'pillar' && near(hz.y1, top, bottom, 30)) drawPillarFoam(ctx, hz, time);
  for (const w of race.weirs) if (near(w.y, top, bottom, 80)) drawWeirWater(ctx, race, w, time);
  for (const d of race.docks) if (near(d.y, top, bottom, 40)) drawDockFlag(ctx, d, time);
  for (const u of race.users) if (near(u.y, top, bottom, 30)) ctx.drawImage(washerSprite(u.done), Math.round(u.x + (u.side === 'left' ? -16 : 4)), Math.round(u.y - 10));
  const ducks = duckFrames();
  for (const k of race.ducks) if (near(k.y, top, bottom, 200)) ctx.drawImage(ducks[k.flying ? 1 + (Math.floor(time * 8) & 1) : 0], Math.round(k.x) - 6, Math.round(k.y) - 4);
  for (const g of race.drift) if (near(g.y, top, bottom, 60)) blitRotated(ctx, logCanvas(), g.x, g.y, g.angle);
  drawRaft(ctx, race);
  for (const b of race.bridges) if (near(b.y, top, bottom, 40)) drawBridgeDeck(ctx, race, b);
  drawCrowds(ctx, race, top, bottom, time);
  ctx.restore();
  drawProgress(ctx, race);
}

const near = (y, top, bottom, pad) => y > top - pad && y < bottom + pad;

function blitRotated(ctx, img, x, y, angle, ox = img.width / 2, oy = img.height / 2) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(-angle);
  ctx.drawImage(img, -Math.round(ox), -Math.round(oy));
  ctx.restore();
}

// Short light dashes drifting at the speed of the current.
function drawRipples(ctx, race, top, bottom, time) {
  const rv = race.river, cell = 20;
  for (let k = Math.floor(top / cell); k <= Math.ceil(bottom / cell); k++) {
    const y0 = k * cell, rapid = race.rapids.some((r) => y0 > r.y1 && y0 < r.y2);
    const n = rapid ? 8 : 4;
    const sp = rv.speedAt(y0) * race.diff.current;
    for (let j = 0; j < n; j++) {
      const s = (hash2(k, j, 1) * 2 - 1) * 0.85;
      const y = Math.round(y0 + ((hash2(j, k, 2) * cell + time * sp) % cell));
      const x = Math.round(rv.cxAt(y) + s * rv.hwAt(y));
      const len = 2 + Math.floor(hash2(k, j, 3) * 3);
      ctx.fillStyle = rapid && j % 2 ? '#f7fafc' : '#8fcbe9';
      ctx.fillRect(x, y, len, 1);
      if (rapid && j % 3 === 0) ctx.fillRect(x + 1, y - 1, len - 1, 1);
    }
  }
}

// A bobbing [C] sign over each eddy while the ropes need fixing.
const cSign = () => sprite('csign', 13, 13, (bm) => {
  bm.rect(1, 0, 11, 13, P.black); bm.rect(0, 1, 13, 11, P.black);
  bm.rect(1, 1, 11, 11, P.log0); bm.rect(2, 2, 9, 9, P.dusk0);
  const glyph = ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'];
  glyph.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && bm.set(4 + x, 3 + y, P.black)));
});

function drawEddy(ctx, e, time, needed) {
  if (needed) ctx.drawImage(cSign(), Math.round(e.x) - 6, Math.round(e.y - e.r - 18 + Math.sin(time * 3) * 2));
  // A slow, clear ring of white arcs: calm water turning gently.
  ctx.fillStyle = '#f7fafc';
  const dir = e.side === 'left' ? -1 : 1;
  for (let ring = 0; ring < 2; ring++) {
    const r = e.r * (0.55 + ring * 0.4), n = 28 + ring * 12;
    for (let i = 0; i < n; i++) {
      if ((i % 7) > 4) continue; // dashed: arcs, not a solid circle
      const a = (i / n) * Math.PI * 2 + time * 0.5 * dir * (ring ? 1 : -1);
      ctx.fillRect(Math.round(e.x + Math.cos(a) * r), Math.round(e.y + Math.sin(a) * r * 0.85), 2, 2);
    }
  }
}

function drawWhirl(ctx, w, time) {
  ctx.fillStyle = '#d8f0fb';
  for (let i = 0; i < 40; i++) {
    const t = i / 40, r = w.r * (0.15 + t * 0.85), a = t * 9 + time * 3 * w.spin;
    ctx.fillRect(Math.round(w.x + Math.cos(a) * r), Math.round(w.y + Math.sin(a) * r), 2, 1);
  }
  ctx.fillStyle = '#204e84';
  ctx.fillRect(Math.round(w.x) - 2, Math.round(w.y) - 1, 4, 3);
}

// Foam piling up on the upstream side, a V of wake below.
function drawRockFoam(ctx, race, hz, time) {
  const x = Math.round(hz.x1), y = Math.round(hz.y1), r = hz.r;
  ctx.fillStyle = '#f7fafc';
  for (let i = -r; i <= r; i += 2) {
    const up = Math.round(Math.sqrt(Math.max(0, r * r - i * i)));
    if (Math.sin(time * 6 + i) > -0.6) ctx.fillRect(x + i, y - up - 2, 2, 1);
  }
  ctx.fillStyle = '#d8f0fb';
  for (let k = 1; k < 5; k++) {
    const yy = y + r + k * 3 + Math.round((time * 20) % 3);
    ctx.fillRect(x - r + 1 - k, yy, 2, 1);
    ctx.fillRect(x + r - 2 + k, yy, 2, 1);
  }
}

function drawPillarFoam(ctx, hz, time) {
  ctx.fillStyle = '#f7fafc';
  const x = Math.round(hz.x1), y = Math.round(hz.y1 - hz.r * 2);
  for (let i = -3; i <= 3; i++) if (Math.sin(time * 7 + i) > -0.4) ctx.fillRect(x + i * 2, y - Math.abs(i) + 1, 2, 1);
}

function drawWeirWater(ctx, race, w, time) {
  const l = race.river.leftAt(w.y), r = race.river.rightAt(w.y);
  const y = Math.round(w.y);
  // Tumbling foam below the wall; the chute pours longer and faster.
  for (let x = Math.round(l); x < r; x += 2) {
    const inChute = Math.abs(x - w.x) < w.half;
    const len = inChute ? 22 : 8;
    const k = (hash2(x, 1) * len + time * (inChute ? 50 : 25)) % len;
    ctx.fillStyle = k < len * 0.5 ? '#f7fafc' : '#d8f0fb';
    ctx.fillRect(x, y + 5 + Math.round(k), 2, 1);
    if (hash2(x, 2) > 0.5) ctx.fillRect(x, y + 6 + Math.round((k + len / 2) % len), 1, 1);
  }
  // Down-arrows leading into the chute.
  ctx.fillStyle = '#f7fafc';
  for (let i = 0; i < 3; i++) {
    const ay = y - 60 + i * 16 + Math.round((time * 18) % 16);
    for (let row = 0; row < 4; row++) ctx.fillRect(Math.round(w.x) - 4 + row, ay + row, 9 - row * 2, 1);
  }
}

function drawDockFlag(ctx, d, time) {
  const dir = d.side === 'left' ? 1 : -1;
  const x = Math.round(d.x - dir * 22) - 1, y = Math.round(d.y) - 24;
  ctx.drawImage(flagCanvas(d.done ? 3 : Math.floor(time * 4) % 3), x, y);
  if (d.done) return;
  // A dotted ring shows how close to pass.
  ctx.fillStyle = 'rgba(213,94,0,0.8)';
  for (let i = 0; i < 24; i += 2) {
    const a = (i / 24) * Math.PI * 2 + time * 0.3;
    ctx.fillRect(Math.round(d.x + Math.cos(a) * d.r), Math.round(d.y + Math.sin(a) * d.r), 2, 2);
  }
}

function drawBridgeDeck(ctx, race, b) {
  const l = Math.round(race.river.leftAt(b.y)) - 34, r = Math.round(race.river.rightAt(b.y)) + 34;
  const img = cached(`deck.${race.course.id}.${b.y}`, () => {
    const h = b.depth * 2 + 10, bm = new Bitmap(r - l, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < r - l; x++) {
      let c = hash2(x >> 2, y >> 1, 8) > 0.5 ? P.stone1 : P.stone2; // cobbles
      if (y < 2 || y >= h - 2) c = y === 0 || y === h - 1 ? P.stone4 : P.stone0; // parapets
      if ((y === 2 || y === h - 3)) c = P.stone3;
      bm.set(x, y, c);
    }
    return bm.canvas();
  });
  ctx.fillStyle = 'rgba(11,36,64,0.35)';
  ctx.fillRect(l + 3, Math.round(b.y - b.depth - 5) + 4, r - l, b.depth * 2 + 10);
  ctx.drawImage(img, l, Math.round(b.y - b.depth - 5));
}

function drawRaft(ctx, race) {
  const raft = race.raft;
  const img = raftCanvas(race);
  ctx.globalAlpha = 0.35;
  blitRotated(ctx, raftShadow(race), raft.x + 3, raft.y + 3, raft.angle);
  ctx.globalAlpha = 1;
  // Oars pivot at each end and swing the way the stick pushes.
  const oar = oarCanvas();
  const e = race.ends();
  // Canvas rotation is clockwise; the oar image points "down" from its grip.
  // Front oar trails downstream, back oar upstream; the blade swings toward
  // the side the stick is pushed.
  for (const [x, y, turn] of [[e.fx, e.fy, -raft.oar[0] * 0.5], [e.bx, e.by, Math.PI + raft.oar[1] * 0.5]]) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(-raft.angle + turn);
    ctx.drawImage(oar, -1, -4);
    ctx.restore();
  }
  blitRotated(ctx, img, raft.x, raft.y, raft.angle);

  // Upright player tags: a circle for 1, a square for 2.
  if (race.players === 2) {
    tag(ctx, e.fx, e.fy + 30, 1);
    tag(ctx, e.bx, e.by - 30, 2);
  }
  if (race.lash.active) drawLashRing(ctx, race);
}

// ---- crowds ------------------------------------------------------------------

const SHIRTS = ['shirt0', 'sash0', 'p2', 'p1', 'sky1', 'tile0', 'cloth0', 'mid0', 'dusk1', 'ok'];
const HAIR = ['beret', 'dirt3', 'log3', 'black', 'shirt1'];

// A person seen from above: hair or beret, shoulders, and arms that go up
// when they cheer.
const personFrames = (k) => [0, 1].map((f) => sprite(`person.${k}.${f}`, 7, 7, (bm) => {
  const body = P[SHIRTS[k % SHIRTS.length]], hair = P[HAIR[(k * 7) % HAIR.length]];
  bm.ellipse(3, 4, 2.2, 1.6, (dx) => (dx > 0 ? mixDark(body) : body));
  bm.ellipse(3, 3, 1.4, 1.4, hair);
  if (f === 1) { bm.set(0, 1, P.skin0); bm.set(0, 2, body); bm.set(6, 1, P.skin0); bm.set(6, 2, body); }
  else { bm.set(0, 4, P.skin0); bm.set(6, 4, P.skin0); }
}));
const mixDark = (c) => mix(c, P.black, 0.25);

// Where everyone stands: along each village shore and both bridge parapets.
const crowdCache = new WeakMap();
function crowdOf(race) {
  let list = crowdCache.get(race);
  if (list) return list;
  list = [];
  const rv = race.river;
  for (const v of race.villages) {
    for (const side of v.sides) {
      for (let y = v.y; y < v.y2; y += 8) {
        const h = hash2(y, v.seed, side === 'left' ? 3 : 4);
        if (h < 0.45 || race.bridges.some((b) => Math.abs(b.y - y) < 20)) continue;
        const bank = side === 'left' ? rv.leftAt(y) : rv.rightAt(y);
        list.push({ x: bank + (side === 'left' ? -9 - h * 6 : 9 + h * 6), y, k: Math.floor(h * 97), phase: h * 7 });
      }
    }
  }
  for (const b of race.bridges) {
    if (!b.crowd) continue;
    const l = rv.leftAt(b.y) - 16, r = rv.rightAt(b.y) + 16;
    for (const row of [-1, 1]) {
      for (let x = l; x < r; x += 6) {
        const h = hash2(Math.round(x), b.y, row + 5);
        if (h < 0.3) continue;
        list.push({ x, y: b.y + row * (b.depth + 1), k: Math.floor(h * 89), phase: h * 5, onBridge: true });
      }
    }
  }
  list.sort((a, b) => a.y - b.y);
  crowdCache.set(race, list);
  return list;
}

function drawCrowds(ctx, race, top, bottom, time) {
  const ry = race.raft.y;
  for (const p of crowdOf(race)) {
    if (p.y < top - 10 || p.y > bottom + 10) continue;
    // Close to the raft they cheer hard; otherwise the odd wave.
    const near = Math.abs(p.y - ry) < 150;
    const up = near ? Math.floor(time * 5 + p.phase) & 1 : Math.sin(time * 0.8 + p.phase * 3) > 0.92;
    ctx.drawImage(personFrames(p.k)[up ? 1 : 0], Math.round(p.x) - 3, Math.round(p.y) - 3);
  }
}

const tagCanvas = (n) => sprite(`tag.${n}`, 11, 11, (bm) => {
  const col = n === 1 ? P.p1 : P.p2;
  if (n === 1) bm.ellipse(5, 5, 5, 5, (dx, dy, q) => (q > 0.75 ? P.black : col));
  else { bm.rect(0, 0, 11, 11, P.black); bm.rect(1, 1, 9, 9, col); }
  const glyph = n === 1 ? ['.#.', '##.', '.#.', '.#.', '###'] : ['##.', '..#', '.#.', '#..', '###'];
  glyph.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && bm.set(4 + x, 3 + y, P.black)));
});

function tag(ctx, x, y, n) {
  ctx.drawImage(tagCanvas(n), Math.round(x) - 5, Math.round(y) - 5);
}

// The beat ring closes in on the raft; tie a knot when it lands.
function drawLashRing(ctx, race) {
  const { x, y } = race.raft, open = race.lashBeat() >= 0;
  const r = open ? 34 : Math.min(64, 34 + race.lashPhase() * 30);
  ctx.fillStyle = open ? '#fff1b0' : '#f1e2a6';
  const n = Math.round(r * 1.2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), open ? 3 : 2, open ? 3 : 2);
  }
  const k = race.rules.lash.knots;
  for (let i = 0; i < k; i++) {
    const kx = Math.round(x - (k - 1) * 7 + i * 14), ky = Math.round(y - 46);
    ctx.fillStyle = '#14121a'; ctx.fillRect(kx - 5, ky - 5, 11, 11);
    ctx.fillStyle = i < race.lash.knots ? '#f1e2a6' : '#433b4c'; ctx.fillRect(kx - 4, ky - 4, 9, 9);
    if (i < race.lash.knots) { ctx.fillStyle = '#6f8d3f'; ctx.fillRect(kx - 2, ky - 1, 5, 3); }
  }
}

// Course progress down the right-hand edge.
function drawProgress(ctx, race) {
  const x = W - 9, y0 = 30, h = H - 50;
  ctx.fillStyle = 'rgba(20,18,26,0.55)'; ctx.fillRect(x - 4, y0 - 4, 9, h + 8);
  ctx.fillStyle = '#58a5d6'; ctx.fillRect(x, y0, 1, h);
  const at = (y) => Math.round(y0 + Math.max(0, Math.min(1, y / race.course.length)) * h);
  ctx.fillStyle = '#c8baa0';
  for (const w of race.weirs) ctx.fillRect(x - 3, at(w.y), 7, 2);
  ctx.fillStyle = '#d55e00';
  for (const d of race.docks) if (!d.done) ctx.fillRect(x - 2, at(d.y) - 1, 5, 3);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 3, y0 + h, 7, 2);
  ctx.fillStyle = '#14121a'; ctx.fillRect(x - 3, at(race.raft.y) - 3, 7, 7);
  ctx.fillStyle = '#e69f00'; ctx.fillRect(x - 2, at(race.raft.y) - 2, 5, 5);
}

