// Illustrations for the intro, outro and fact cards: side-on pixel-art
// scenes of the Roncal valley, painted in code until real art arrives. Each
// scene has a static background painted once and cached, plus a light
// animation layer (snow, smoke, water, a working crew).
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

// Side-on river band with depth shading.
function riverBand(bm, y0, y1) {
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / (y1 - y0);
    for (let x = 0; x < W; x++) {
      let c = t < 0.12 ? P.water2 : t < 0.5 ? (dither(x, y, (t - 0.12) * 2.6) ? P.water3 : P.water2) : dither(x, y, (t - 0.5) * 2) ? P.water4 : P.water3;
      if (y === y0) c = P.water1;
      bm.set(x, y, c);
    }
  }
}

function shimmer(ctx, y0, y1, t, density = 1) {
  ctx.fillStyle = 'rgba(216,240,251,0.85)';
  const n = Math.round(26 * density);
  for (let i = 0; i < n; i++) {
    const y = y0 + 2 + Math.floor(hash2(i, 5) * (y1 - y0 - 4));
    const len = 3 + Math.floor(hash2(5, i) * 7);
    const x = (hash2(i, 9) * (W + 40) + t * (12 + hash2(i, 3) * 10)) % (W + 40) - 20;
    if (Math.sin(t * 2 + i) > -0.3) ctx.fillRect(Math.round(x), y, len, 1);
  }
}

// A log lying side-on: bark with grain, a pale cut end with rings.
function log(bm, x, y, len, r = 3) {
  for (let i = 0; i < len; i++) {
    for (let j = -r; j <= r; j++) {
      let c = j < -r + 1 ? P.log1 : j > r - 2 ? P.log3 : P.log2;
      if (hash2(x + i, y + j) > 0.9) c = P.log3;
      if (j === r) c = P.log4;
      bm.set(x + i, y + j, c);
    }
  }
  bm.ellipse(x + len, y, Math.max(1, r * 0.6), r, (dx, dy, q) => (q > 0.7 ? P.log3 : q > 0.3 ? P.log0 : P.ring));
}

// Rope lashing across a log bundle (the old rafts used twisted green withies).
function lashing(bm, x, y0, y1) {
  for (let y = y0; y <= y1; y++) {
    bm.set(x, y, (y & 1) ? P.moss : P.pine2);
    bm.set(x + 1, y, (y & 1) ? P.pine2 : P.moss);
  }
}

function raftSide(bm, x, y, len) {
  log(bm, x + 3, y - 6, len - 4, 3);
  log(bm, x, y, len, 3);
  for (const f of [0.12, 0.5, 0.88]) lashing(bm, Math.round(x + len * f), y - 9, y + 3);
}

// An almadiero, side-on, feet at (x, y). dir 1 faces right.
// pose: stand, walk0, walk1, chop0, chop1, pull, pole, tie0, tie1, wave
export function almadiero(bm, x, y, dir = 1, pose = 'stand', look = {}) {
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
  }[pose] ?? [[-2, -12], [2, -12]];
  ln(-1 + bend, -20, hands[0][0], hands[0][1], shirtD);
  bm.set(X(hands[0][0]), y + hands[0][1], P.skin1);

  // Torso, sash, head, beret.
  rect(-3 + bend, -21 + (bend ? 1 : 0), 7, 9, shirt);
  rect(-3 + bend, -21 + (bend ? 1 : 0), 1, 9, shirtD);
  rect(-3 + bend, -13, 7, 2, sash);
  rect(-3 + bend, -12, 7, 1, sashD);
  px(-4 + bend, -12, sashD); px(-4 + bend, -11, sash); px(-4 + bend, -10, sashD);
  const hx = -2 + bend * 1.3, hy = -26 + (bend ? 2 : 0);
  rect(hx, hy, 5, 5, P.skin0);
  rect(hx, hy, 1, 5, P.skin1);
  px(hx + 5, hy + 2, P.skin0);
  px(hx + 3, hy + 1, P.black);
  px(hx + 1, hy + 2, P.skin2);
  if (look.scarf) {
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

// A humped medieval bridge, side-on: solid masonry with one big arch and a
// dark shadow on the water beneath it.
function stoneBridge(bm, x, y, w, archH) {
  const deck = 12, hump = 8;
  for (let i = 0; i < w; i++) {
    const u = (i - w / 2) / (w / 2);
    const top = Math.round(y - archH - deck - (1 - u * u) * hump + Math.max(0, Math.abs(u) - 0.8) * 20);
    const du = (i - w / 2) / (w / 2 - 14);
    const archTop = Math.abs(du) < 1 ? y - Math.sqrt(1 - du * du) * archH : y + 1;
    for (let yy = top; yy <= y; yy++) {
      if (yy > archTop) {
        const c = bm.get(x + i, yy);
        if (c) bm.set(x + i, yy, dither(x + i, yy, 0.7) ? P.water5 : P.water4);
        continue;
      }
      const course = Math.floor((yy - top) / 4), n = hash2(Math.floor((i + (course & 1) * 3) / 6), course, 7);
      let c = n > 0.6 ? P.stone1 : n > 0.3 ? P.stone2 : P.stone3;
      if ((yy - top) % 4 === 3 || (i + (course & 1) * 3) % 6 === 0) c = P.stone3;
      if (archTop - yy < 4 && Math.abs(du) < 1) c = ((i >> 1) & 1) ? P.stone2 : P.stone4; // voussoirs
      if (yy - top < 2) c = yy === top ? P.stone0 : P.stone1; // parapet cap
      if (i < 2 || i > w - 3) c = P.stone3;
      bm.set(x + i, yy, c);
    }
  }
}

function sun(bm, x, y, r) {
  bm.ellipse(x, y, r + 3, r + 3, (dx, dy) => (dither(x + dx, y + dy, 0.5) ? P.sun : 0));
  bm.ellipse(x, y, r, r, (dx, dy) => (dx + dy < -r * 0.4 ? P.white : P.sun));
}

// ---- scenes -----------------------------------------------------------------

// The route map's rivers and villages come from data/route.json.
let ROUTE = { rivers: {}, places: {} };
export function setRoute(route) { ROUTE = route; }

const SKY_DAY = [P.sky3, P.sky2, P.sky1, P.sky0];
const SKY_WINTER = [P.far1, P.far0, P.snow2, P.snow1];
const SKY_DUSK = [P.sky2, P.dusk0, P.dusk1, P.dusk2];

const SCENES = {
  // Winter in the Roncal valley: felling pines in the snow.
  winter: {
    paint(bm) {
      sky(bm, SKY_WINTER);
      peaks(bm, { seed: 3, count: 6, baseY: 150, minH: 70, maxH: 115, lit: P.snow1, mid: P.snow2, dark: P.snow3, snow: [P.snow0, P.snow2], snowFrac: 0.9, haze: P.far0 });
      peaks(bm, { seed: 11, count: 9, baseY: 175, minH: 30, maxH: 60, lit: P.far1, mid: P.far2, dark: P.far3, snow: [P.snow1, P.snow3], snowFrac: 0.5, haze: P.far0 });
      const h2 = hill(bm, { seed: 7, base: 160, amp: 18, freq: 0.014, color: P.snow1, top: P.snow0, dark: P.snow2 });
      forest(bm, h2, { seed: 5, count: 70, minH: 10, maxH: 18, snow: true, fade: 0.45, haze: P.far0, dy: 10 });
      meadow(bm, 170, H, 4, true);
      for (const [x, h] of [[26, 60], [60, 44], [430, 66], [465, 50], [392, 40]]) pine(bm, x, 178 + (h % 7), h, { snow: true });
      pine(bm, 196, 178, 30, { snow: true });
      // Felled trunks waiting to be dragged to the river.
      log(bm, 250, 182, 90, 4);
      log(bm, 262, 174, 70, 3);
      bm.rect(318, 178, 14, 6, P.log0);
    },
    anim(ctx, t, frame) {
      frame(`winter.chop${Math.floor(t * 2) % 2}`, (bm) => almadiero(bm, 176, 186, 1, Math.floor(t * 2) % 2 ? 'chop1' : 'chop0'));
      frame('winter.pull', (bm) => almadiero(bm, 360, 186, 1, 'pull', { sash: 'p2', sashD: 'p2d' }));
      ctx.fillStyle = '#f7fafc';
      for (let i = 0; i < 70; i++) {
        const x = (hash2(i, 1) * W + Math.sin(t + i) * 6 + t * 6) % W, y = (hash2(1, i) * H + t * (14 + (i % 5) * 4)) % H;
        ctx.fillRect(Math.round(x), Math.round(y), i % 7 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1);
      }
    },
  },

  // Building the raft on the riverbank.
  build: {
    paint(bm) {
      sky(bm, SKY_DAY);
      cloud(bm, 90, 40, 70, 1); cloud(bm, 340, 28, 90, 2);
      peaks(bm, { seed: 21, count: 6, baseY: 160, minH: 70, maxH: 120, lit: P.far0, mid: P.far1, dark: P.far2, haze: P.sky0 });
      const h2 = hill(bm, { seed: 4, base: 150, amp: 30, freq: 0.012, color: P.mid1, top: P.mid0, dark: P.mid2 });
      forest(bm, h2, { seed: 8, count: 90, minH: 12, maxH: 22, fade: 0.3, haze: P.mid0, dy: 8 });
      meadow(bm, 160, 196, 6);
      riverBand(bm, 196, H);
      for (const [x, h] of [[18, 70], [52, 52], [452, 74]]) pine(bm, x, 170 + (h % 5), h);
      // A stack of trunks, and the raft taking shape.
      for (let i = 0; i < 4; i++) log(bm, 70 + i * 3, 178 - i * 7, 70 - i * 4, 3);
      raftSide(bm, 170, 190, 190);
    },
    anim(ctx, t, frame) {
      shimmer(ctx, 198, H, t);
      frame(`build.tie${Math.floor(t * 1.6) % 2}`, (bm) => almadiero(bm, 196, 186, 1, Math.floor(t * 1.6) % 2 ? 'tie1' : 'tie0'));
      frame(`build.tie2${Math.floor(t * 1.6 + 0.5) % 2}`, (bm) => almadiero(bm, 330, 186, -1, Math.floor(t * 1.6 + 0.5) % 2 ? 'tie1' : 'tie0', { sash: 'p2', sashD: 'p2d' }));
      frame('build.carry', (bm) => { almadiero(bm, 400, 188, -1, 'pull'); log(bm, 380, 170, 40, 2); });
    },
  },

  // Spring thaw: high water, the raft sets off.
  thaw: {
    paint(bm) {
      sky(bm, SKY_DAY);
      sun(bm, 400, 40, 12);
      cloud(bm, 120, 50, 80, 3);
      peaks(bm, { seed: 31, count: 7, baseY: 150, minH: 60, maxH: 105, lit: P.far0, mid: P.far1, dark: P.far2, haze: P.sky0 });
      const h2 = hill(bm, { seed: 9, base: 140, amp: 26, freq: 0.014, color: P.mid1, top: P.mid0, dark: P.mid2 });
      forest(bm, h2, { seed: 12, count: 80, minH: 10, maxH: 20, fade: 0.3, haze: P.mid0, dy: 6 });
      meadow(bm, 150, 160, 7);
      riverBand(bm, 160, H);
      for (const [x, h] of [[20, 60], [455, 56]]) pine(bm, x, 158, h);
    },
    anim(ctx, t, frame) {
      shimmer(ctx, 162, H, t, 1.4);
      const bob = Math.round(Math.sin(t * 1.5) * 1.5);
      frame('thaw.raft', (bm) => {
        raftSide(bm, 20, 40, 230);
        almadiero(bm, 40, 34, -1, 'pole', { sash: 'p2', sashD: 'p2d' });
        almadiero(bm, 230, 34, 1, 'pole');
      }, 280, 60, 130 + (t * 8 % 60), 138 + bob);
    },
  },

  // Burgui today: stone houses, the old bridge, people on the bank.
  burgui: {
    paint(bm) {
      sky(bm, SKY_DAY);
      cloud(bm, 300, 36, 90, 4);
      sun(bm, 60, 36, 10);
      peaks(bm, { seed: 41, count: 6, baseY: 140, minH: 55, maxH: 95, lit: P.far0, mid: P.far1, dark: P.far2, snowFrac: 0.25, haze: P.sky0 });
      const h2 = hill(bm, { seed: 13, base: 128, amp: 22, freq: 0.012, color: P.mid1, top: P.mid0, dark: P.mid2 });
      forest(bm, h2, { seed: 15, count: 60, minH: 10, maxH: 18, fade: 0.3, haze: P.mid0, dy: 6 });
      meadow(bm, 138, 176, 9);
      this.chimneys = [];
      for (const [x, w, h] of [[14, 40, 34], [64, 34, 40], [372, 44, 36], [428, 40, 42]]) this.chimneys.push(house(bm, x, 150, w, h, x).chimney);
      riverBand(bm, 176, H);
      stoneBridge(bm, 214, 204, 150, 26);
    },
    anim(ctx, t, frame) {
      shimmer(ctx, 178, H, t);
      ctx.fillStyle = 'rgba(230,230,235,0.7)';
      for (const [cx, cy] of SCENES.burgui.chimneys ?? []) {
        for (let i = 0; i < 5; i++) {
          const k = (t * 0.5 + i / 5) % 1;
          ctx.fillRect(Math.round(cx + Math.sin(k * 6 + i) * 2 + k * 10), Math.round(cy - k * 30), 2 + Math.round(k * 2), 2 + Math.round(k * 2));
        }
      }
      // People on the bank watching the rafts go by.
      frame(`burgui.crowd${Math.floor(t * 1.5) % 2}`, (bm) => {
        const people = [
          [8, 34, 1, 'stand', { skirt: 'tile1', scarf: 'dusk1' }],
          [22, 36, 1, 'stand', {}],
          [40, 33, -1, 'stand', { sash: 'p2', sashD: 'p2d' }],
          [52, 35, 1, Math.floor(t * 1.5) % 2 ? 'wave' : 'stand', { skirt: 'cloth0', scarf: 'shirt1', shirt: 'sky0', shirtD: 'sky1' }],
          [70, 34, 1, 'stand', { shirt: 'dusk0', shirtD: 'dusk1' }],
          [84, 36, -1, 'stand', { skirt: 'mid2', scarf: 'sash0' }],
          [100, 33, 1, Math.floor(t * 1.5 + 1) % 2 ? 'wave' : 'stand', { sash: 'p1', sashD: 'p1d' }],
        ];
        for (const [px, py, dir, pose, look] of people) almadiero(bm, px, py, dir, pose, look);
      }, 120, 40, 92, 136);
      const bob = Math.round(Math.sin(t * 1.4) * 1.5);
      frame('burgui.raft', (bm) => {
        raftSide(bm, 10, 40, 150);
        almadiero(bm, 28, 34, -1, 'pole', { sash: 'p2', sashD: 'p2d' });
        almadiero(bm, 146, 34, 1, 'pole');
      }, 200, 60, 20 + ((t * 10) % 100), 166 + bob);
    },
  },

  // The route to the sea, on an old map.
  map: {
    paint(bm) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const n = fbm2(x * 0.02, y * 0.02, 2), edge = Math.min(x, y, W - 1 - x, H - 1 - y);
        let c = n > 0.5 ? P.dusk0 : dither(x, y, (0.5 - n) * 4) ? P.pebble0 : P.dusk0;
        if (hash2(x, y, 9) > 0.985) c = P.pebble1;
        if (edge < 14 && dither(x, y, 1 - edge / 14)) c = P.pebble1;
        bm.set(x, y, c);
      }
      for (let x = 0; x < W; x++) for (let y = 0; y < 6; y++) { if (dither(x, y, 1 - y / 6)) { bm.set(x, y, P.dirt2); bm.set(x, H - 1 - y, P.dirt2); } }
      // Pyrenees along the top.
      for (let i = 0; i < 14; i++) {
        const x = 20 + i * 34 + hash2(i, 3) * 10, y = 30 + hash2(3, i) * 8, s = 9 + hash2(i, 4) * 7;
        for (let j = 0; j < s; j++) for (let k = -j; k <= j; k++) bm.set(x + k, y - s + j, k < 0 ? P.stone2 : P.stone3);
        for (let j = 0; j < 3; j++) for (let k = -j; k <= j; k++) bm.set(x + k, y - s + j, P.white);
      }
      // The sea in the bottom right.
      for (let y = 190; y < H; y++) for (let x = 330; x < W; x++) {
        if ((x - 330) * 0.6 + (y - 190) < 40 + fbm1(x * 0.1, 3) * 20) continue;
        bm.set(x, y, dither(x, y, 0.3) ? P.water3 : P.water2);
      }
      // Rivers, simplified: the Esca and Salazar run south to the Aragón,
      // which flows west into the Ebro, which runs south-east to the sea.
      const width = { ebro: 3, aragon: 2 };
      for (const [name, pts] of Object.entries(ROUTE.rivers)) { routeLine(bm, pts, (width[name] ?? 1) + 2, P.water1); routeLine(bm, pts, width[name] ?? 1, P.water4); }
      for (const [x, y] of Object.values(ROUTE.places)) { bm.rect(x - 2, y - 2, 5, 5, P.black); bm.rect(x - 1, y - 1, 3, 3, P.stone1); }
    },
  },

  // A mill weir with its narrow chute.
  weir: {
    paint(bm) {
      sky(bm, SKY_DAY);
      cloud(bm, 380, 40, 70, 6);
      peaks(bm, { seed: 51, count: 6, baseY: 145, minH: 55, maxH: 100, lit: P.far0, mid: P.far1, dark: P.far2, haze: P.sky0 });
      const h2 = hill(bm, { seed: 17, base: 132, amp: 20, freq: 0.014, color: P.mid1, top: P.mid0, dark: P.mid2 });
      forest(bm, h2, { seed: 19, count: 70, minH: 10, maxH: 18, fade: 0.3, haze: P.mid0, dy: 6 });
      meadow(bm, 140, 150, 3);
      riverBand(bm, 150, H);
      house(bm, 400, 150, 50, 30, 3); // the mill
      // Weir wall, with a gap for the chute.
      for (let x = 0; x < W; x++) {
        if (x > 210 && x < 262) continue;
        for (let y = 168; y < 178; y++) bm.set(x, y, (y === 168) ? P.stone0 : ((x >> 2) + (y >> 1)) & 1 ? P.stone2 : P.stone3);
      }
      bm.rect(206, 160, 4, 20, P.p1); bm.rect(262, 160, 4, 20, P.p1);
    },
    anim(ctx, t, frame) {
      shimmer(ctx, 152, 166, t, 0.6);
      ctx.fillStyle = '#f7fafc';
      for (let i = 0; i < 90; i++) {
        const x = hash2(i, 2) * W, inChute = x > 210 && x < 262;
        const y = 178 + ((hash2(2, i) * 20 + t * (inChute ? 40 : 18)) % (inChute ? 60 : 24));
        ctx.fillRect(Math.round(x), Math.round(y), 2, 1);
      }
      const bob = Math.round(Math.sin(t * 2) * 1);
      frame('weir.raft', (bm) => {
        raftSide(bm, 4, 40, 110);
        almadiero(bm, 20, 34, -1, 'pole', { sash: 'p2', sashD: 'p2d' });
        almadiero(bm, 104, 34, 1, 'pole');
      }, 130, 50, 90, 118 + bob);
    },
  },

  // The long walk home.
  walk: {
    paint(bm) {
      sky(bm, SKY_DUSK);
      sun(bm, 380, 120, 16);
      peaks(bm, { seed: 61, count: 7, baseY: 180, minH: 40, maxH: 90, lit: P.dusk2, mid: P.stone3, dark: P.cloth1, snow: [P.dusk0, P.stone2], snowFrac: 0.15, haze: P.dusk1 });
      const h2 = hill(bm, { seed: 23, base: 168, amp: 18, freq: 0.012, color: P.dirt2, top: P.dirt1, dark: P.dirt3 });
      forest(bm, h2, { seed: 29, count: 30, minH: 8, maxH: 14, fade: 0.5, haze: P.dusk2, dy: 4 });
      meadow(bm, 176, H, 8);
      for (let y = 176; y < H; y++) for (let x = 0; x < W; x++) if (dither(x, y, 0.35)) bm.set(x, y, mix(bm.get(x, y), P.dusk2, 0.45));
      for (let x = 0; x < W; x++) for (let y = 182; y < 196; y++) {
        const edge = y === 182 || y === 195;
        bm.set(x, y, edge ? P.dirt2 : hash2(x >> 1, y, 3) > 0.85 ? P.pebble1 : dither(x, y, 0.25) ? P.dirt1 : P.dirt0);
      }
    },
    anim(ctx, t, frame) {
      const step = Math.floor(t * 3) % 2;
      const looks = [{}, { sash: 'p2', sashD: 'p2d' }, { sash: 'p1', sashD: 'p1d' }];
      for (let i = 0; i < 3; i++) {
        frame(`walk.${i}.${(step + i) % 2}`, (bm) => almadiero(bm, 10, 34, 1, (step + i) % 2 ? 'walk0' : 'walk1', looks[i]), 24, 40, 120 + i * 40 + ((t * 6) % 200), 156);
      }
    },
  },
};

function routeLine(bm, pts, thick, c) {
  for (let i = 1; i < pts.length; i++) bm.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], c, thick);
}

// The route map with progress: finished stretches glow, the next one
// pulses, and a little raft sits where the crew is now.
export function drawRouteMap(ctx, route, courses, { done = new Set(), current = null, t = 0 } = {}) {
  drawScene(ctx, 'map', t);
  for (const c of courses) {
    const pts = c.route ?? [];
    const isNow = c.id === current;
    if (!done.has(c.id) && !isNow) continue;
    const pulse = isNow && !done.has(c.id) ? 0.5 + 0.5 * Math.sin(t * 3) : 1;
    ctx.strokeStyle = `rgba(255, 217, 102, ${0.35 + pulse * 0.65})`;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
  const now = courses.find((c) => c.id === current);
  if (now?.route?.length) {
    const [x, y] = done.has(now.id) ? now.route[now.route.length - 1] : now.route[0];
    ctx.fillStyle = '#14121a'; ctx.fillRect(Math.round(x) - 5, Math.round(y) - 3, 11, 7);
    ctx.fillStyle = '#c9965a'; ctx.fillRect(Math.round(x) - 4, Math.round(y) - 2, 9, 5);
    ctx.fillStyle = '#774e28'; ctx.fillRect(Math.round(x) - 4, Math.round(y), 9, 1);
  }
}

// Draw a scene: cached background, then its animation. `frame(key, paint,
// w, h, x, y)` caches small sprites so the crew is painted only once.
export function drawScene(ctx, name, t = 0) {
  const scene = SCENES[name] ?? SCENES.thaw;
  const key = SCENES[name] ? name : 'thaw';
  ctx.drawImage(cached(`scene.${key}`, () => { const bm = new Bitmap(W, H); scene.paint(bm); return bm.canvas(); }), 0, 0);
  const frame = (k, paint, w = W, h = H, x = 0, y = 0) => {
    ctx.drawImage(cached(`sprite.${k}`, () => { const bm = new Bitmap(w, h); paint(bm); return bm.canvas(); }), Math.round(x), Math.round(y));
  };
  scene.anim?.(ctx, t, frame);
}

export const hasScene = (name) => name in SCENES;
