// Illustrations for the intro, outro, ceremony and fact cards: side-on
// pixel-art scenes of the Roncal valley and the pass above it, painted in
// code until real art arrives. Each scene has a static background painted
// once and cached, plus a light animation layer. The mountains, pines,
// houses and the Roncal figure come from Almadía!.
//
// The caption box covers roughly y > 190, so the subject sits above that.

import { P, Bitmap, mix, dither, hash2, fbm1, fbm2, cached } from './pixel.js';

const W = 480;
const H = 270;

// ---- building blocks --------------------------------------------------------

function sky(bm, stops, horizon = 190) {
  for (let y = 0; y < bm.h; y++) {
    const t = Math.min(1, y / horizon);
    const band = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(band)), f = band - i;
    for (let x = 0; x < bm.w; x++) bm.set(x, y, dither(x, y, f) ? stops[i + 1] : stops[i]);
  }
}

function cloud(bm, cx, cy, w, seed) {
  const puffs = 3 + Math.floor(hash2(seed, 1) * 3);
  for (let i = 0; i < puffs; i++) {
    const px = cx + (i - puffs / 2) * (w / puffs) + hash2(seed, i) * 6;
    const r = w / puffs * (0.7 + hash2(i, seed) * 0.5);
    bm.ellipse(px, cy - r * 0.3, r, r * 0.7, (x, y) => (y > r * 0.25 ? P.snow1 : y < -r * 0.3 && x < 0 ? P.white : P.snow0));
  }
  bm.rect(cx - w / 2, cy, w, 2, P.snow1);
}

// A mountain range as overlapping peaks, tallest at the back. Each peak has a
// lit left face and a shaded right face split by a wandering ridge line,
// gullies down the lit face, and a ragged snowcap. Returns the skyline.
function peaks(bm, { seed, count, baseY, minH, maxH, lit, mid, dark, snow = [P.snow0, P.snow2], snowFrac = 0.3, haze, hazeFrom = 0.45 }) {
  const skyline = new Float32Array(W).fill(H);
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push({ x: -40 + (i + hash2(i, 1, seed) * 0.9) * ((W + 80) / count), h: minH + hash2(i, 2, seed) * (maxH - minH), k: i });
  }
  list.sort((a, b) => b.h - a.h);
  for (const p of list) {
    const top = baseY - p.h, sl = 0.75 + hash2(p.k, 3, seed) * 0.7, sr = 0.75 + hash2(p.k, 4, seed) * 0.7;
    for (let y = Math.max(0, Math.ceil(top)); y < Math.min(H, baseY + 30); y++) {
      const dy = y - top, grow = Math.min(1, dy / 8);
      const left = p.x - dy * sl + (fbm1(y * 0.13, seed + p.k * 7) - 0.5) * 8 * grow;
      const right = p.x + dy * sr + (fbm1(y * 0.13, seed + p.k * 7 + 3) - 0.5) * 8 * grow;
      const ridge = p.x + (fbm1(y * 0.09, seed + p.k * 11) - 0.5) * dy * 0.5;
      const snowLine = p.h * snowFrac;
      for (let x = Math.max(0, Math.ceil(left)); x <= Math.min(W - 1, Math.floor(right)); x++) {
        const litSide = x < ridge;
        let c = litSide ? lit : dark;
        if (litSide && fbm1((x - p.x + dy * sl * 0.7) * 0.22, seed + p.k * 5) > 0.66) c = mid; // gullies
        if (!litSide && x - ridge < 2) c = mid;
        const sn = snowLine + (fbm1(x * 0.21, seed + p.k * 13) - 0.5) * 12;
        if (dy < sn) c = litSide ? snow[0] : snow[1];
        else if (dy < sn + 3 && dither(x, y, 0.5)) c = litSide ? snow[0] : snow[1];
        if (x - left < 1 && litSide && dy > 2) c = mix(c, P.white, 0.2);
        const t = (y - (baseY - p.h * (1 - hazeFrom))) / (p.h * hazeFrom + 30);
        if (haze && t > 0 && dither(x, y, Math.min(0.9, t))) c = haze;
        bm.set(x, y, c);
        if (y < skyline[x]) skyline[x] = y;
      }
    }
  }
  return skyline;
}

// Side-on pine. Tiers with ragged lower edges, lit on the left.
export function pine(bm, x, baseY, h, { snow = false, fade = 0, haze = P.far1 } = {}) {
  x = Math.round(x); baseY = Math.round(baseY);
  const tone = (c) => (fade ? mix(c, haze, fade) : c);
  const trunk = Math.max(2, Math.round(h * 0.12));
  for (let j = 0; j < trunk; j++) { bm.set(x, baseY - j, tone(P.log3)); bm.set(x + 1, baseY - j, tone(P.log4)); }
  const tiers = Math.max(2, Math.round(h / 9));
  const crownH = h - trunk;
  for (let r = 0; r < crownH; r++) {
    const y = baseY - trunk - crownH + r;
    const tf = (r / crownH) * tiers, ti = Math.floor(tf), within = tf - ti;
    const maxW = (h * 0.34) * ((ti + 1) / tiers) + 1;
    const w = Math.max(0.5, maxW * (0.35 + within * 0.65));
    for (let i = -Math.ceil(w); i <= Math.ceil(w); i++) {
      if (Math.abs(i) > w + (hash2(x + i, y) - 0.5) * 1.5) continue;
      let c = i < -w * 0.35 ? P.pine1 : i > w * 0.35 ? P.pine3 : P.pine2;
      if (i < -w * 0.6 && within < 0.5) c = P.pine0;
      if (Math.abs(i) >= Math.floor(w)) c = P.pine4;
      if (snow && within < 0.35 && i < w * 0.3 && hash2(i + x, r) > 0.25) c = within < 0.15 ? P.snow0 : P.snow1;
      bm.set(x + i, y, tone(c));
    }
  }
}

function forest(bm, hts, { seed, count, minH, maxH, snow, fade, haze, dy = 0 }) {
  const trees = [];
  for (let i = 0; i < count; i++) {
    const x = Math.floor(hash2(i, seed) * W);
    trees.push({ x, h: minH + hash2(seed, i) * (maxH - minH), y: hts[Math.max(0, Math.min(W - 1, x))] + dy + hash2(i, i + seed) * 6 });
  }
  trees.sort((a, b) => a.y - b.y);
  for (const t of trees) pine(bm, t.x, t.y, t.h, { snow, fade, haze });
}

function hill(bm, { seed, base, amp, freq, color, top, dark }) {
  const hts = new Float32Array(W);
  for (let x = 0; x < W; x++) hts[x] = base - amp * fbm1(x * freq, seed, 3);
  for (let x = 0; x < W; x++) {
    for (let y = Math.round(hts[x]); y < H; y++) {
      const d = y - hts[x];
      bm.set(x, y, d < 2 ? top : d > 24 && dither(x, y, Math.min(1, (d - 24) / 30)) ? dark : color);
    }
  }
  return hts;
}

// Meadow texture: noise patches plus tufts and the odd flower.
function meadow(bm, y0, y1, seed, snowy = false) {
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < W; x++) {
      const n = fbm2(x * 0.05, y * 0.12, seed);
      let c;
      if (snowy) c = n > 0.62 ? P.snow1 : n < 0.35 && dither(x, y, 0.5) ? P.snow2 : P.snow0;
      else c = n > 0.62 ? P.grass0 : n > 0.48 ? P.grass1 : n > 0.36 ? P.grass2 : P.grass3;
      bm.set(x, y, c);
    }
  }
  if (snowy) return;
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(hash2(i, seed) * W), y = y0 + 2 + Math.floor(hash2(seed, i) * (y1 - y0 - 2));
    bm.set(x, y, P.grass4); bm.set(x + 1, y - 1, P.grass3); bm.set(x - 1, y - 1, P.grass3);
    if (i % 23 === 0) bm.set(x, y - 2, i % 2 ? P.white : P.sun1);
  }
}




// A Roncal figure (shepherd, mayor, villager), side-on, feet at (x, y).
// dir 1 faces right.
// pose: stand, walk0, walk1, pull, wave, crook, point, shrug, hand, cheer
// look: shirt, sash, skirt, scarf, cloak (a mayor's long cloak), hat, tricolor
export function person(bm, x, y, dir = 1, pose = 'stand', look = {}) {
  const shirt = P[look.shirt ?? 'shirt0'], shirtD = P[look.shirtD ?? 'shirt1'], sash = P[look.sash ?? 'sash0'], sashD = P[look.sashD ?? 'sash1'];
  const X = (dx) => Math.round(x + dx * dir);
  const px = (dx, dy, c) => bm.set(X(dx), y + dy, c);
  const rect = (dx, dy, w, h, c) => { for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) px(dx + i, dy + j, c); };
  const ln = (a, b, c, d, col, th = 2) => bm.line(X(a), y + b, X(c), y + d, col, th);
  const bend = pose === 'tie0' || pose === 'tie1' ? 3 : 0;

  // Legs and abarcas (or a skirt).
  const s = pose === 'walk0' ? 3 : pose === 'walk1' ? -3 : pose === 'pull' ? -4 : pose === 'pole' ? 2 : 0;
  ln(-1, -12, -1 - Math.max(0, s), -2, P.cloth1);
  ln(1, -12, 1 + Math.max(0, -s) + (s > 0 ? s : 0), -2, P.cloth0);
  rect(-2 - Math.max(0, s), -1, 3, 1, P.shoe);
  rect(1 + Math.max(0, -s) + (s > 0 ? s : 0), -1, 3, 1, P.shoe);
  if (look.skirt) for (let j = 0; j < 9; j++) rect(-3 - (j >> 2), -12 + j, 7 + (j >> 2) * 2, 1, j === 8 ? P[look.skirtD ?? 'cloth2'] : P[look.skirt]);

  // Arm behind the body.
  const hands = {
    stand: [[-2, -12], [2, -12]], walk0: [[-4, -13], [4, -13]], walk1: [[3, -13], [-3, -13]],
    chop0: [[2, -27], [3, -28]], chop1: [[6, -15], [7, -14]], pull: [[7, -17], [6, -16]],
    pole: [[4, -23], [3, -14]], tie0: [[6, -10], [7, -9]], tie1: [[6, -12], [8, -12]], wave: [[-2, -12], [3, -30]],
    crook: [[-2, -12], [5, -17]], point: [[-2, -12], [9, -21]], shrug: [[-6, -17], [6, -17]],
    hand: [[-2, -12], [8, -17]], cheer: [[-4, -30], [4, -30]],
  }[pose] ?? [[-2, -12], [2, -12]];
  ln(-1 + bend, -20, hands[0][0], hands[0][1], shirtD);
  bm.set(X(hands[0][0]), y + hands[0][1], P.skin1);

  // Torso, sash (or a mayor's cloak), head, beret (or hat).
  rect(-3 + bend, -21 + (bend ? 1 : 0), 7, 9, shirt);
  rect(-3 + bend, -21 + (bend ? 1 : 0), 1, 9, shirtD);
  if (look.cloak) {
    for (let j = 0; j < 20; j++) rect(-4 - (j >> 3), -21 + j, 9 + (j >> 3), 1, j % 7 === 6 ? P.cloak1 : P.cloak0);
    rect(-4, -21, 1, 20, P.cloak1);
    rect(-3, -22, 7, 2, P.ruff);
  } else if (look.tricolor) {
    rect(-3, -21, 7, 9, P.cloth1);
    for (let j = 0; j < 9; j++) { px(-2 + j * 0.7, -21 + j, P.bleu); px(-1 + j * 0.7, -21 + j, P.white); px(j * 0.7, -21 + j, P.rouge); }
  } else {
    rect(-3 + bend, -13, 7, 2, sash);
    rect(-3 + bend, -12, 7, 1, sashD);
    px(-4 + bend, -12, sashD); px(-4 + bend, -11, sash); px(-4 + bend, -10, sashD);
  }
  const hx = -2 + bend * 1.3, hy = -26 + (bend ? 2 : 0);
  rect(hx, hy, 5, 5, P.skin0);
  rect(hx, hy, 1, 5, P.skin1);
  px(hx + 5, hy + 2, P.skin0);
  px(hx + 3, hy + 1, P.black);
  px(hx + 1, hy + 2, P.skin2);
  if (look.hat) {
    rect(hx - 3, hy - 1, 11, 1, P.cloak1);
    rect(hx - 1, hy - 4, 7, 3, P.cloak0);
  } else if (look.scarf) {
    rect(hx - 1, hy - 1, 6, 3, P[look.scarf]); rect(hx - 1, hy + 2, 2, 3, P[look.scarf]); px(hx - 2, hy + 4, P[look.scarf]);
  } else {
    rect(hx - 1, hy - 2, 7, 2, P.beret);
    rect(hx - 1, hy - 1, 7, 1, P.beret1);
    px(hx + 2, hy - 3, P.beret);
  }

  // Arm in front of the body, and a tool.
  ln(1 + bend, -20, hands[1][0], hands[1][1], shirt);
  bm.set(X(hands[1][0]), y + hands[1][1], P.skin0);
  if (pose === 'chop0') { ln(3, -28, 5, -35, P.log3, 1); rect(4, -37, 3, 3, P.rock2); }
  if (pose === 'chop1') { ln(7, -14, 12, -9, P.log3, 1); rect(11, -9, 3, 3, P.rock2); }
  if (pose === 'pole') ln(7, -34, -2, 2, P.log3, 1);
  if (pose === 'crook') { ln(6, -32, 5, 0, P.log2, 1); px(7, -33, P.log2); px(8, -32, P.log2); px(8, -31, P.log2); }
}

function house(bm, x, y, w, h, seed) {
  // Stone walls.
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const course = Math.floor(j / 3), brick = Math.floor((i + (course & 1) * 3) / 6);
      const n = hash2(brick, course, seed);
      let c = n > 0.66 ? P.stone0 : n > 0.33 ? P.stone1 : P.stone2;
      if (j % 3 === 2 || (i + (course & 1) * 3) % 6 === 0) c = P.stone3;
      if (i >= w - 2) c = P.stone3;
      bm.set(x + i, y - h + j, c);
    }
  }
  // Windows with shutters, a door.
  for (const wx of [x + 4, x + w - 9]) {
    bm.rect(wx, y - h + 5, 5, 6, P.black); bm.rect(wx + 1, y - h + 6, 3, 4, P.cloth2);
    bm.rect(wx - 2, y - h + 5, 2, 6, P.tile1); bm.rect(wx + 5, y - h + 5, 2, 6, P.tile1);
  }
  bm.rect(x + Math.floor(w / 2) - 3, y - 11, 6, 11, P.log3);
  bm.rect(x + Math.floor(w / 2) - 3, y - 11, 6, 1, P.stone3);
  bm.set(x + Math.floor(w / 2) + 1, y - 6, P.sun1);
  // Steep slate roof.
  const rh = Math.round(w * 0.55);
  for (let j = 0; j < rh; j++) {
    const half = Math.round(((j + 1) / rh) * (w / 2 + 4));
    for (let i = -half; i <= half; i++) {
      let c = i < 0 ? P.roof1 : P.roof2;
      if ((j & 1) && ((i + j) & 3) === 0) c = P.roof3;
      if (Math.abs(i) >= half - 0) c = P.roof3;
      if (i < 0 && j % 4 === 0) c = P.roof0;
      bm.set(x + Math.floor(w / 2) + i, y - h - rh + j, c);
    }
  }
  // The tall conical chimney of Roncal houses.
  const cx = x + Math.floor(w * 0.7), cy = y - h - Math.round(rh * 0.6);
  for (let j = 0; j < 12; j++) {
    const half = Math.max(1, Math.round(3 - j * 0.2));
    for (let i = -half; i <= half; i++) bm.set(cx + i, cy - j, i < 0 ? P.stone1 : P.stone2);
  }
  bm.rect(cx - 2, cy - 14, 5, 2, P.roof2);
  return { chimney: [cx, cy - 15] };
}


function sun(bm, x, y, r) {
  bm.ellipse(x, y, r + 3, r + 3, (dx, dy) => (dither(x + dx, y + dy, 0.5) ? P.sun : 0));
  bm.ellipse(x, y, r, r, (dx, dy) => (dx + dy < -r * 0.4 ? P.white : P.sun));
}


// A sheep side-on, feet at (x, y). Its paint mark matches the game: a round
// mark for Roncal (side 0), a square one for Barétous (side 1).
function sheepSide(bm, x, y, dir = 1, side = 0, pose = 'stand') {
  x = Math.round(x); y = Math.round(y);
  const X = (dx) => x + dx * dir;
  for (const lx of [-3, -1, 2, 4]) bm.rect(X(lx), y - 3, 1, 3, P.face);
  bm.ellipse(x, y - 6, 5.5, 3.5, (dx, dy) => (dy < -1 && dx * dir < 2 ? P.wool0 : dy > 1 ? P.wool2 : P.wool1));
  for (let k = -4; k <= 4; k += 2) bm.set(x + k, y - 9 + (k & 2 ? 0 : 1), P.wool0);
  const down = pose === 'eat' ? 4 : 0;
  bm.rect(X(5), y - 9 + down, 1, 1, P.face);
  bm.rect(Math.min(X(5), X(7)), y - 8 + down, 3, 3, P.face);
  bm.set(X(8), y - 7 + down, P.face1);
  bm.set(X(5), y - 9 + down, P.face1);
  const c = side ? P.p2 : P.p1;
  if (side === 0) { bm.rect(X(-1), y - 9, 1, 3, c); bm.rect(X(-2), y - 8, 3, 1, c); }
  else bm.rect(X(-2), y - 9, 3, 3, c);
}

function cow(bm, x, y, dir = 1, pose = 'stand') {
  x = Math.round(x); y = Math.round(y);
  const X = (dx) => x + dx * dir;
  const step = pose === 'walk' ? 1 : 0;
  for (const [lx, o] of [[-6, step], [-3, -step], [4, step], [7, -step]]) bm.rect(X(lx + o), y - 5, 2, 5, P.cow2);
  for (let j = 0; j < 9; j++) for (let i = -9; i <= 9; i++) {
    const c = j < 2 ? P.cow0 : j > 6 ? P.cow2 : i * dir > 5 ? P.cow0 : P.cow1;
    bm.set(x + i, y - 13 + j, c);
  }
  bm.rect(Math.min(X(9), X(13)), y - 15, 5, 6, P.cow1);
  bm.rect(Math.min(X(12), X(14)), y - 12, 3, 3, P.cowh);
  bm.set(X(12), y - 13, P.black);
  // Lyre-shaped pale horns.
  bm.set(X(10), y - 16, P.cowh); bm.set(X(9), y - 17, P.cowh); bm.set(X(9), y - 18, P.cowh);
  bm.set(X(13), y - 16, P.cowh); bm.set(X(14), y - 17, P.cowh); bm.set(X(14), y - 18, P.cowh);
  bm.rect(X(-10), y - 12, 1, 7, P.cow2); bm.set(X(-10), y - 5, P.black);
}

function dogSide(bm, x, y, dir = 1) {
  x = Math.round(x); y = Math.round(y);
  const X = (dx) => x + dx * dir;
  bm.rect(Math.min(X(-3), X(3)), y - 6, 7, 3, P.dog0);
  bm.rect(Math.min(X(1), X(3)), y - 5, 3, 2, P.dogw);
  bm.rect(Math.min(X(3), X(5)), y - 9, 3, 3, P.dog0);
  bm.set(X(6), y - 7, P.dog0); bm.set(X(5), y - 7, P.dogw);
  for (const lx of [-3, -1, 1, 3]) bm.rect(X(lx), y - 3, 1, 3, lx > 0 ? P.dogw : P.dog0);
  bm.set(X(-4), y - 7, P.dog0); bm.set(X(-5), y - 8, P.dogw);
}

// Limestone crags of the high border country.
function crags(bm, seed, baseY) {
  return peaks(bm, { seed, count: 7, baseY, minH: 50, maxH: 95, lit: P.stone1, mid: P.stone2, dark: P.stone3, snow: [P.snow0, P.snow2], snowFrac: 0.12, haze: P.sky0 });
}

// The San Martín stone, side-on, standing on the pass.
// A squat, weathered block with a flat top, not a slab: kids should read it
// as a landmark where people meet, nothing else.
function stoneSide(bm, x, y) {
  for (let j = 0; j < 20; j++) {
    const half = 10 - (j < 2 ? 2 - j : 0) + (j > 16 ? 1 : 0);
    const lean = Math.round(j * 0.1);
    for (let i = -half; i <= half; i++) {
      let c = j < 3 ? P.stone0 : i < -4 ? P.stone1 : i > 5 ? P.stone3 : P.stone2;
      if (Math.abs(i) === half) c = P.stone3;
      if (hash2(i, j, 4) > 0.92) c = P.stone3;
      if (hash2(i >> 1, j >> 1, 9) > 0.93) c = P.moss;
      bm.set(x + i - lean, y - 20 + j, c);
    }
  }
  bm.rect(x - 1, y - 20, 1, 3, P.stone4);
  bm.rect(x - 14, y, 29, 2, P.turf3);
}

// Triangle flags strung between two poles.
function bunting(bm, x1, x2, y) {
  const cols = [P.bunt1, P.bunt2, P.bunt3, P.bunt4];
  for (let x = x1; x <= x2; x++) bm.set(x, Math.round(y + Math.sin((x - x1) / (x2 - x1) * Math.PI) * 8), P.log4);
  for (let k = 0, x = x1 + 4; x < x2 - 4; x += 9, k++) {
    const yy = Math.round(y + Math.sin((x - x1) / (x2 - x1) * Math.PI) * 8);
    for (let j = 0; j < 6; j++) for (let i = 0; i < 6 - j; i++) bm.set(x + i + (j >> 1), yy + 1 + j, cols[k % 4]);
  }
  bm.rect(x1 - 1, y - 2, 2, 60, P.log3); bm.rect(x2 - 1, y - 2, 2, 60, P.log3);
}

const SKY_DAY = [P.sky3, P.sky2, P.sky1, P.sky0];
const SKY_DUSK = [P.sky2, P.dusk0, P.dusk1, P.dusk2];
const SKY_GREY = [P.far2, P.far1, P.far0, P.snow1];

function highMeadow(bm, seed, top = 150) {
  sky(bm, SKY_DAY);
  cloud(bm, 110, 38, 80, seed); cloud(bm, 370, 26, 60, seed + 1);
  crags(bm, seed + 20, top + 5);
  const h = hill(bm, { seed: seed + 3, base: top, amp: 16, freq: 0.012, color: P.grass2, top: P.grass1, dark: P.grass3 });
  forest(bm, h, { seed: seed + 5, count: 40, minH: 8, maxH: 14, fade: 0.35, haze: P.mid0, dy: 4 });
  meadow(bm, top + 10, H, seed);
  return h;
}

const SCENES = {
  // Summer on the high pastures: flocks from both valleys.
  pastures: {
    paint(bm) {
      highMeadow(bm, 3);
      for (const [x, hgt] of [[24, 54], [58, 40], [440, 60]]) pine(bm, x, 172 + (hgt % 5), hgt);
      house(bm, 380, 170, 34, 22, 5);
    },
    anim(ctx, t, frame) {
      const flock = (key, x0, side, n) => frame(`pastures.${key}${Math.floor(t * 0.8) % 2}`, (bm) => {
        for (let i = 0; i < n; i++) sheepSide(bm, 8 + i * 17 + (i % 2) * 5, 20 + (i % 3) * 5, i % 2 ? -1 : 1, side, (i + Math.floor(t * 0.8)) % 3 === 0 ? 'eat' : 'stand');
      }, n * 17 + 20, 34, x0, 172);
      flock('r', 40, 0, 6);
      flock('b', 270, 1, 6);
      frame('pastures.shep', (bm) => { person(bm, 14, 38, 1, 'crook'); dogSide(bm, 26, 38, 1); }, 36, 42, 180, 150);
    },
  },

  // The old quarrels: one spring, two flocks, and nobody giving way.
  dispute: {
    paint(bm) {
      sky(bm, SKY_GREY);
      crags(bm, 51, 150);
      const h = hill(bm, { seed: 9, base: 150, amp: 14, freq: 0.012, color: P.grass3, top: P.grass2, dark: P.grass4 });
      forest(bm, h, { seed: 12, count: 30, minH: 8, maxH: 14, fade: 0.4, haze: P.far0, dy: 4 });
      meadow(bm, 160, H, 5);
      // A pasture eaten bare between them.
      for (let y = 172; y < 200; y++) for (let x = 150; x < 330; x++) {
        const d = Math.hypot((x - 240) / 90, (y - 186) / 14);
        if (d < 1 && dither(x, y, 1.3 - d)) bm.set(x, y, hash2(x, y, 3) > 0.7 ? P.dirt2 : P.dirt1);
      }
      // The spring, walled in stone, and its trough.
      for (let j = 0; j < 10; j++) for (let i = -12; i <= 12; i++) bm.set(240 + i, 178 + j, j < 2 ? P.stone0 : (i + j) % 4 ? P.stone2 : P.stone3);
      bm.rect(233, 180, 15, 3, P.water2);
      bm.rect(233, 180, 15, 1, P.water0);
    },
    anim(ctx, t, frame) {
      const k = Math.floor(t * 1.2) % 2;
      frame(`dispute.a${k}`, (bm) => person(bm, 14, 38, 1, k ? 'point' : 'shrug'), 30, 42, 190, 150);
      frame(`dispute.b${k}`, (bm) => person(bm, 14, 38, -1, k ? 'shrug' : 'point', { sash: 'p2', sashD: 'p2d' }), 30, 42, 262, 150);
      frame('dispute.flockA', (bm) => { for (let i = 0; i < 5; i++) sheepSide(bm, 8 + i * 15, 20 + (i % 2) * 6, 1, 0); }, 90, 34, 70, 172);
      frame('dispute.flockB', (bm) => { for (let i = 0; i < 5; i++) sheepSide(bm, 8 + i * 15, 20 + (i % 2) * 6, -1, 1); }, 90, 34, 325, 172);
    },
  },

  // The agreement: the valleys meet at the stone on the pass.
  treaty: {
    paint(bm) {
      highMeadow(bm, 7, 160);
      stoneSide(bm, 240, 186);
    },
    anim(ctx, t, frame) {
      frame('treaty.people', (bm) => {
        person(bm, 70, 40, 1, 'hand', { cloak: true, hat: true });
        person(bm, 56, 42, 1, 'stand', { cloak: true, hat: true });
        person(bm, 42, 40, 1, 'stand', { cloak: true, hat: true });
        person(bm, 110, 40, -1, 'hand', { shirt: 'cloth0', shirtD: 'cloth1', sash: 'p2', sashD: 'p2d' });
        person(bm, 124, 42, -1, 'stand', { shirt: 'cloth0', shirtD: 'cloth1', sash: 'p2', sashD: 'p2d' });
        person(bm, 138, 40, -1, 'stand', { shirt: 'cloth0', shirtD: 'cloth1', sash: 'p2', sashD: 'p2d' });
      }, 180, 46, 150, 146);
    },
  },

  // Roncal shepherds walked their flocks south for the winter.
  transhumance: {
    paint(bm) {
      sky(bm, SKY_DUSK);
      sun(bm, 390, 110, 14);
      peaks(bm, { seed: 61, count: 6, baseY: 175, minH: 20, maxH: 45, lit: P.dusk1, mid: P.dirt1, dark: P.dirt2, snowFrac: 0, haze: P.dusk0 });
      for (let y = 170; y < H; y++) for (let x = 0; x < W; x++) {
        const n = fbm2(x * 0.03, y * 0.1, 4);
        bm.set(x, y, n > 0.55 ? P.straw0 : n > 0.4 ? P.straw1 : P.straw2);
      }
      for (let x = 0; x < W; x++) for (let y = 186; y < 198; y++) bm.set(x, y, y === 186 || y === 197 ? P.dirt2 : dither(x, y, 0.3) ? P.dirt1 : P.dirt0);
    },
    anim(ctx, t, frame) {
      const k = Math.floor(t * 3) % 2, x0 = (t * 8) % 160;
      frame(`trans.flock${k}`, (bm) => {
        for (let i = 0; i < 10; i++) sheepSide(bm, 8 + i * 13 + (i % 3) * 3, 22 + (i % 2) * 5 - ((i + k) % 2), 1, 0);
        person(bm, 150, 34, 1, k ? 'walk0' : 'walk1');
        dogSide(bm, 5, 30, 1);
      }, 170, 40, 40 + x0, 160);
    },
  },

  // Cheese from the summer's milk, in front of a mountain hut.
  cheese: {
    paint(bm) {
      highMeadow(bm, 11, 150);
      house(bm, 250, 188, 60, 30, 9);
      // A bench of round cheeses.
      bm.rect(180, 176, 50, 3, P.log2);
      bm.rect(184, 179, 2, 9, P.log3); bm.rect(224, 179, 2, 9, P.log3);
      for (let i = 0; i < 4; i++) bm.ellipse(189 + i * 12, 172, 5, 3.5, (dx, dy) => (dy < -1 ? P.straw0 : dy > 1 ? P.straw2 : P.straw1));
    },
    anim(ctx, t, frame) {
      frame('cheese.shep', (bm) => { person(bm, 14, 38, 1, 'crook'); dogSide(bm, 30, 38, -1); }, 40, 42, 130, 150);
      frame(`cheese.flock${Math.floor(t) % 2}`, (bm) => { for (let i = 0; i < 4; i++) sheepSide(bm, 8 + i * 16, 22, 1, 0, (i + Math.floor(t)) % 2 ? 'eat' : 'stand'); }, 80, 30, 340, 170);
    },
  },
};

// The 13 July ceremony. The better the valleys got on, the bigger the
// party: tier 0 is the mayors alone in the drizzle, tier 3 has music, dancing
// and the whole valley.
for (const tier of [0, 1, 2, 3]) {
  SCENES[`ceremony${tier}`] = {
    paint(bm) {
      if (tier === 0) {
        sky(bm, SKY_GREY);
        crags(bm, 71, 165);
        hill(bm, { seed: 5, base: 160, amp: 12, freq: 0.012, color: P.grass3, top: P.grass2, dark: P.grass4 });
        meadow(bm, 170, H, 6);
      } else highMeadow(bm, 17, 160);
      if (tier >= 2) { bunting(bm, 30, 200, 112); bunting(bm, 280, 450, 112); }
      stoneSide(bm, 240, 186);
    },
    anim(ctx, t, frame) {
      const beat = Math.floor(t * 2) % 2;
      frame('cer.mayors', (bm) => {
        person(bm, 70, 40, 1, 'hand', { cloak: true, hat: true });
        person(bm, 56, 42, 1, 'stand', { cloak: true, hat: true });
        person(bm, 42, 40, 1, 'stand', { cloak: true, hat: true });
        person(bm, 110, 40, -1, 'hand', { tricolor: true });
        person(bm, 124, 42, -1, 'stand', { tricolor: true });
        person(bm, 138, 40, -1, 'stand', { tricolor: true });
      }, 180, 46, 150, 146);
      // The three cows, and the herder who brings them.
      frame(`cer.cows${Math.floor(t * 2) % 2}`, (bm) => {
        for (let i = 0; i < 3; i++) cow(bm, 16 + i * 26, 24, -1, Math.floor(t * 2 + i) % 2 ? 'walk' : 'stand');
        person(bm, 88, 26, -1, 'pull', { sash: 'p2', sashD: 'p2d' });
      }, 100, 30, 330, 164);
      if (tier >= 1) {
        const n = tier === 1 ? 3 : tier === 2 ? 6 : 9;
        frame(`cer.crowd${tier}.${beat}`, (bm) => {
          const looks = [{}, { skirt: 'tile1', scarf: 'sash0' }, { sash: 'p2', sashD: 'p2d' }, { skirt: 'cloth0', scarf: 'shirt1' }, { shirt: 'dusk0', shirtD: 'dusk1' }, { skirt: 'mid2', scarf: 'dusk1' }, { sash: 'p1', sashD: 'p1d' }, { skirt: 'sash1', scarf: 'white' }, {}];
          for (let i = 0; i < n; i++) person(bm, 8 + i * 14, 36 + (i % 2) * 2, i % 2 ? -1 : 1, tier >= 2 && (i + beat) % 3 === 0 ? 'wave' : 'stand', looks[i]);
        }, 140, 42, 20, 150);
      }
      if (tier === 3) {
        frame(`cer.dance${beat}`, (bm) => {
          for (let i = 0; i < 4; i++) person(bm, 10 + i * 16, 34 - ((i + beat) % 2) * 2, i % 2 ? -1 : 1, (i + beat) % 2 ? 'cheer' : 'hand', i % 2 ? { skirt: 'sash0', scarf: 'white' } : { sash: 'sash0', sashD: 'sash1' });
        }, 76, 38, 40, 190);
      }
      if (tier >= 2) {
        ctx.fillStyle = '#fbf6ea';
        for (let i = 0; i < 4; i++) {
          const k = (t * 0.4 + i / 4) % 1, x = 120 + i * 70 + Math.sin(k * 6 + i) * 6, y = 120 - k * 50;
          ctx.fillRect(Math.round(x), Math.round(y), 2, 2); ctx.fillRect(Math.round(x) + 2, Math.round(y) - 5, 1, 6); ctx.fillRect(Math.round(x) + 2, Math.round(y) - 5, 3, 1);
        }
      }
    },
  };
}

// Draw a scene: cached background, then its animation. `frame(key, paint,
// w, h, x, y)` caches small sprites so each figure is painted only once.
export function drawScene(ctx, name, t = 0) {
  const key = SCENES[name] ? name : 'pastures';
  const scene = SCENES[key];
  ctx.drawImage(cached(`scene.${key}`, () => { const bm = new Bitmap(W, H); scene.paint(bm); return bm.canvas(); }), 0, 0);
  const frame = (k, paint, w = W, h = H, x = 0, y = 0) => {
    ctx.drawImage(cached(`sprite.${k}`, () => { const bm = new Bitmap(w, h); paint(bm); return bm.canvas(); }), Math.round(x), Math.round(y));
  };
  scene.anim?.(ctx, t, frame);
}

export const hasScene = (name) => name in SCENES;
