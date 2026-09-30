// Pixel art for Piedra por piedra, painted in code: the town of Olite as it
// grows (drawn from the game's state and season), card and resource icons,
// and the story scenes. Static layers are painted once per state and cached;
// only smoke, walkers and flags are drawn each frame.

import { P, Bitmap, mix, dither, hash2, fbm1, cached } from './pixel.js';

const W = 480;
const TH = 150; // height of the town strip at the top of the play screen

// ---- small painters ---------------------------------------------------------------

function sky(bm, h, stops) {
  for (let y = 0; y < h; y++) {
    const f = (y / h) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(f));
    for (let x = 0; x < bm.w; x++) bm.set(x, y, dither(x, y, f - i) ? stops[i + 1] : stops[i]);
  }
}

const SKIES = {
  spring: [P.sky3, P.sky2, P.sky1, P.sky0],
  summer: [P.sky2, P.sky1, P.sky0, P.dusk0],
  autumn: [P.sky2, P.dusk0, P.dusk1, P.dusk1],
  winter: [P.far2, P.far1, P.far0, P.snow2],
};

// A house seen side-on: stone walls, a red tile roof, a door and a window.
function house(bm, x, y, w, h, seed, frost) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const n = hash2(Math.floor((i + (Math.floor(j / 3) & 1) * 2) / 4), Math.floor(j / 3), seed);
    let c = n > 0.6 ? P.stone0 : n > 0.3 ? P.stone1 : P.stone2;
    if (i >= w - 2) c = P.stone3;
    bm.set(x + i, y - h + j, c);
  }
  bm.rect(x + Math.floor(w / 2) - 2, y - 6, 4, 6, P.log3);
  bm.rect(x + 2, y - h + 3, 3, 3, hash2(seed, 2) > 0.5 ? P.sun1 : P.black);
  const rh = Math.round(w * 0.45);
  for (let j = 0; j < rh; j++) {
    const half = Math.round(((j + 1) / rh) * (w / 2 + 2));
    for (let i = -half; i <= half; i++) {
      let c = i < 0 ? P.tile0 : P.tile1;
      if ((j & 1) && ((i + j) & 3) === 0) c = P.tile2;
      if (frost && j < 2) c = P.snow0;
      bm.set(x + Math.floor(w / 2) + i, y - h - rh + j, c);
    }
  }
  return { chimney: [x + Math.floor(w * 0.7), y - h - rh + 1] };
}

function castle(bm, cx, base) {
  const stone = [P.stone1, P.stone2, P.stone3];
  const block = (x, y, w, h) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let c = i < 2 ? P.stone0 : i >= w - 3 ? P.stone3 : stone[(hash2(x + i >> 2, y + j >> 1) * 2) | 0];
      if (j % 5 === 4) c = P.stone3;
      bm.set(x + i, y + j, c);
    }
    for (let i = 0; i < w; i += 3) bm.rect(x + i, y - 3, 2, 3, P.stone1);
  };
  block(cx - 34, base - 26, 68, 26); // curtain wall
  block(cx - 38, base - 42, 14, 42); // towers
  block(cx + 22, base - 38, 14, 38);
  block(cx - 10, base - 50, 20, 50); // keep
  for (const [x, y] of [[cx - 33, base - 30], [cx + 27, base - 26], [cx - 3, base - 40], [cx - 3, base - 28]]) bm.rect(x, y, 3, 5, P.black);
  bm.rect(cx - 5, base - 12, 10, 12, P.log4);
  return { flag: [cx, base - 53] };
}

function fieldPatch(bm, x, y, w, h, season, seed) {
  const [a, b] = { spring: [P.grass0, P.dirt1], summer: [P.sun1, P.dusk1], autumn: [P.dirt0, P.dirt1], winter: [P.dirt1, P.dirt2] }[season];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let c = ((i + j * 2) >> 1) % 3 === 0 ? b : a;
    if (season === 'summer' && hash2(x + i, y + j, seed) > 0.93) c = P.sun;
    if (i === 0 || i === w - 1) c = P.grass4;
    bm.set(x + i, y + j, c);
  }
}

function vineyardPatch(bm, x, y, w, h, season) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) bm.set(x + i, y + j, dither(x + i, y + j, 0.3) ? P.dirt1 : P.dirt0);
  for (let row = 0; row < h; row += 4) {
    for (let i = 1; i < w - 1; i += 3) {
      const leaf = { spring: P.grass1, summer: P.pine1, autumn: (i >> 1) & 1 ? P.flag : P.dusk2, winter: P.log3 }[season];
      bm.set(x + i, y + row + 1, leaf);
      if (season !== 'winter') { bm.set(x + i + 1, y + row + 1, leaf); bm.set(x + i, y + row, leaf); }
      if (season === 'autumn' && (i % 6 === 1)) bm.set(x + i + 1, y + row + 2, P.cloth1); // grapes
      bm.set(x + i, y + row + 2, P.log3);
    }
  }
}

function wall(bm, x0, x1, base, h) {
  for (let x = x0; x < x1; x++) {
    for (let j = 0; j < h; j++) {
      const course = j >> 2, n = hash2((x + (course & 1) * 3) >> 2, course, 5);
      let c = n > 0.55 ? P.stone1 : n > 0.25 ? P.stone2 : P.stone3;
      if ((j & 3) === 3) c = P.stone3;
      bm.set(x, base - h + j, c);
    }
    if (((x - x0) % 6) < 3) bm.rect(x, base - h - 3, 1, 3, P.stone1);
  }
  for (const tx of [x0, (x0 + x1) >> 1, x1 - 10]) {
    for (let j = 0; j < h + 8; j++) for (let i = 0; i < 10; i++) bm.set(tx + i, base - h - 8 + j, i < 2 ? P.stone0 : i > 7 ? P.stone3 : P.stone2);
    for (let i = 0; i < 10; i += 3) bm.rect(tx + i, base - h - 11, 2, 3, P.stone1);
  }
  const g = (x0 + x1) >> 1;
  bm.rect(g + 2, base - 8, 6, 8, P.log4); // gate
}

function person(bm, x, y, shirt, sash = P.sash0) {
  bm.rect(x - 1, y - 4, 1, 4, P.cloth1); bm.rect(x + 1, y - 4, 1, 4, P.cloth1);
  bm.rect(x - 2, y - 9, 5, 5, shirt); bm.rect(x - 2, y - 5, 5, 1, sash);
  bm.rect(x - 1, y - 12, 3, 3, P.skin0); bm.rect(x - 1, y - 13, 3, 1, P.beret);
}

// Where things go in the town strip.
const HOUSES = [[146, 99], [168, 101], [306, 101], [328, 99], [120, 104], [354, 104], [190, 106], [282, 106], [96, 106], [378, 106], [214, 108], [258, 108]];
const FIELDS = [4, 51, 98, 145, 192];
const VINES = [244, 291, 338, 385, 432];

// ---- the town -------------------------------------------------------------------

export function townKey(state) {
  const b = state.built, p = state.people;
  return ['house', 'field', 'vineyard', 'market', 'quarry', 'mill', 'press', 'wall'].map((k) => b[k] ?? 0).join('.') + '|' +
    ['mason', 'carpenter', 'merchant'].map((k) => p[k] ?? 0).join('.') + '|' + state.season;
}

function paintTown(state) {
  const season = state.season, frost = season === 'winter';
  const bm = new Bitmap(W, TH);
  sky(bm, 90, SKIES[season]);
  // Low hills on the horizon of the Ribera.
  for (let x = 0; x < W; x++) {
    const top = Math.round(66 - fbm1(x * 0.02, 3, 3) * 14);
    for (let y = top; y < 90; y++) bm.set(x, y, dither(x, y, (y - top) / 30) ? P.far2 : P.far1);
  }
  if (state.built.quarry) {
    for (let y = 64; y < 80; y++) for (let x = 404 + (80 - y); x < 452 - (80 - y) / 2; x++) bm.set(x, y, hash2(x, y) > 0.5 ? P.rock1 : P.rock2);
  }
  // The plain.
  const ground = { spring: [P.grass1, P.grass2], summer: [P.dusk1, P.grass2], autumn: [P.dirt0, P.grass3], winter: [P.pebble1, P.pebble2] }[season];
  for (let y = 88; y < TH; y++) for (let x = 0; x < W; x++) bm.set(x, y, dither(x, y, 0.35) ? ground[1] : ground[0]);
  // The castle mound and the old castle.
  bm.ellipse(240, 104, 92, 30, (dx, dy) => (dy < 0 ? (dither(dx, dy, 0.4) ? ground[1] : ground[0]) : 0));
  const c = castle(bm, 240, 84);
  // The Cidacos and the mill.
  for (let y = 88; y < TH; y++) { const x = 30 + Math.round(Math.sin(y * 0.15) * 3); bm.rect(x, y, 5, 1, P.water2); bm.set(x + 1, y, P.water1); }
  if (state.built.mill) {
    bm.rect(38, 92, 20, 14, P.stone1); bm.rect(38, 88, 20, 4, P.tile1);
    bm.ellipse(35, 100, 6, 6, (dx, dy, q) => (q > 0.6 ? P.log3 : (dx + dy) & 1 ? P.log2 : 0));
  }
  // Houses, filled in slot order.
  const chimneys = [];
  for (let i = 0; i < Math.min(HOUSES.length, state.built.house ?? 0); i++) {
    const [x, y] = HOUSES[i];
    chimneys.push(house(bm, x - 8, y, 16 + (i % 3) * 2, 11 + (i % 2) * 2, i, frost).chimney);
  }
  if (state.built.wall) wall(bm, 84, 400, 116, 12);
  if (state.built.market) {
    for (const [x, col] of [[206, P.sash0], [224, P.p2], [242, P.p1]]) {
      bm.rect(x, 116, 14, 3, col); bm.rect(x + 1, 119, 1, 6, P.log3); bm.rect(x + 12, 119, 1, 6, P.log3);
      bm.rect(x + 2, 122, 10, 2, P.log1);
    }
  }
  if (state.built.press) {
    bm.rect(412, 104, 22, 14, P.stone1); bm.rect(410, 100, 26, 4, P.tile1);
    for (const x of [436, 443]) bm.ellipse(x, 114, 3, 4, (dx, dy, q) => (q > 0.6 ? P.log4 : dy % 3 === 0 ? P.log3 : P.log2));
  }
  // Fields and vineyards in the foreground.
  for (let i = 0; i < Math.min(FIELDS.length, state.built.field ?? 0); i++) fieldPatch(bm, FIELDS[i], 124, 44, 24, season, i);
  for (let i = 0; i < Math.min(VINES.length, state.built.vineyard ?? 0); i++) vineyardPatch(bm, VINES[i], 124, 44, 24, season);
  // Craftspeople at work.
  if (state.people.mason) { person(bm, 70, 122, P.shirt1); bm.rect(74, 118, 5, 4, P.stone1); }
  if (state.people.carpenter) { person(bm, 460, 122, P.shirt0, P.p2); bm.rect(452, 119, 7, 2, P.log2); }
  if (state.people.merchant) { person(bm, 262, 124, P.dusk1, P.p1); bm.rect(266, 118, 8, 5, P.log1); }
  return { img: bm.canvas(), chimneys, flag: c.flag };
}

// The town strip, with smoke, a flag and people walking.
export function drawTown(ctx, state, t, y0 = 0) {
  const town = cached(`town.${townKey(state)}`, () => paintTown(state));
  ctx.drawImage(town.img, 0, y0);
  ctx.fillStyle = 'rgba(235,235,240,0.65)';
  for (const [cx, cy] of town.chimneys) {
    for (let k = 0; k < 3; k++) {
      const f = (t * 0.4 + k / 3 + cx * 0.01) % 1;
      ctx.fillRect(Math.round(cx + Math.sin(f * 6 + cx) * 2 + f * 6), Math.round(y0 + cy - f * 18), 2, 2);
    }
  }
  const [fx, fy] = town.flag;
  ctx.fillStyle = '#6c4420'; ctx.fillRect(fx, y0 + fy - 10, 1, 12);
  const wave = Math.round(Math.sin(t * 4));
  ctx.fillStyle = '#c0392b'; ctx.fillRect(fx + 1, y0 + fy - 10 + wave, 8, 5);
  ctx.fillStyle = '#f1c40f'; ctx.fillRect(fx + 3, y0 + fy - 8 + wave, 4, 1);
  // Townsfolk on the road below the walls.
  const walkers = Math.min(8, Math.floor((state.pop ?? 0) / 2));
  for (let i = 0; i < walkers; i++) {
    const dir = i % 2 ? 1 : -1, x = ((i * 67 + t * 9 * dir) % (W + 20) + W + 20) % (W + 20) - 10;
    const step = Math.floor(t * 4 + i) & 1;
    ctx.fillStyle = ['#f4efe4', '#56b4e9', '#e69f00', '#cc79a7'][i % 4];
    ctx.fillRect(Math.round(x) - 1, y0 + 113, 3, 4);
    ctx.fillStyle = '#f6d2ae'; ctx.fillRect(Math.round(x) - 1, y0 + 111, 3, 2);
    ctx.fillStyle = '#433b4c'; ctx.fillRect(Math.round(x) - 1 + step, y0 + 117, 1, 2); ctx.fillRect(Math.round(x) + 1 - step, y0 + 117, 1, 2);
  }
}

// ---- icons --------------------------------------------------------------------------

const ICONS = {
  house: (bm) => house(bm, 4, 20, 16, 10, 3, false),
  field: (bm) => { for (let i = 0; i < 6; i++) { const x = 3 + i * 3; bm.rect(x, 8, 1, 13, P.dusk2); bm.rect(x - 1, 5, 3, 4, P.sun1); bm.set(x, 4, P.sun); } },
  vineyard: (bm) => { bm.ellipse(13, 6, 5, 3, P.grass1); for (const [x, y] of [[10, 10], [13, 10], [16, 10], [11, 13], [14, 13], [12, 16], [15, 16], [13, 19]]) bm.ellipse(x, y, 1.4, 1.4, P.cloth0); },
  market: (bm) => { for (let i = 0; i < 20; i++) bm.rect(2 + i, 5, 1, 4, i % 4 < 2 ? P.sash0 : P.shirt0); bm.rect(3, 9, 1, 11, P.log3); bm.rect(20, 9, 1, 11, P.log3); bm.rect(4, 15, 16, 3, P.log1); bm.ellipse(9, 13, 2, 2, P.flag); bm.ellipse(14, 13, 2, 2, P.grass1); },
  quarry: (bm) => { bm.ellipse(12, 15, 9, 6, (dx, dy) => (dx + dy < 0 ? P.rock0 : P.rock2)); bm.line(14, 3, 20, 11, P.log3, 1); bm.rect(12, 2, 6, 2, P.rock3); },
  mill: (bm) => { bm.ellipse(12, 12, 9, 9, (dx, dy, q) => (q > 0.7 ? P.log3 : (Math.abs(dx) < 1.2 || Math.abs(dy) < 1.2) ? P.log2 : 0)); bm.rect(0, 20, 24, 3, P.water2); },
  press: (bm) => bm.ellipse(12, 12, 8, 10, (dx, dy, q) => (q > 0.75 ? P.log4 : (dy + 12) % 6 === 0 ? P.rock2 : dx < -2 ? P.log1 : P.log2)),
  wall: (bm) => { for (let x = 1; x < 23; x++) for (let y = 9; y < 22; y++) bm.set(x, y, ((y >> 2) + ((x + ((y >> 2) & 1) * 2) >> 2)) & 1 ? P.stone1 : P.stone2); for (let x = 1; x < 23; x += 4) bm.rect(x, 5, 2, 4, P.stone1); },
  marketday: (bm) => { bm.ellipse(8, 14, 5, 5, (dx, dy) => (dx + dy < 0 ? P.sun : P.sun1)); bm.rect(15, 6, 6, 14, P.log1); bm.rect(16, 4, 4, 2, P.log2); },
  harvest: (bm) => { for (let i = 0; i < 7; i++) bm.line(12, 21, 6 + i * 2, 4, P.sun1, 1); bm.rect(8, 13, 9, 2, P.log3); },
  vereda: (bm) => { for (const [x, col] of [[5, P.shirt0], [12, P.p1], [19, P.p2]]) { bm.rect(x - 2, 10, 5, 7, col); bm.rect(x - 1, 6, 3, 3, P.skin0); bm.rect(x - 1, 17, 1, 5, P.cloth1); bm.rect(x + 1, 17, 1, 5, P.cloth1); } },
  merchant: (bm) => { bm.ellipse(12, 14, 7, 7, (dx, dy) => (dy < -4 ? P.log3 : dx < 0 ? P.log1 : P.log2)); bm.rect(9, 5, 6, 3, P.log3); bm.ellipse(12, 15, 2, 2, P.sun); },
  mason: (bm) => { bm.rect(3, 11, 12, 10, P.stone1); bm.rect(3, 11, 12, 1, P.stone0); bm.line(12, 3, 21, 12, P.rock2, 2); bm.rect(19, 2, 3, 4, P.log3); },
  carpenter: (bm) => { bm.rect(2, 14, 20, 4, P.log1); for (let x = 4; x < 20; x += 2) bm.set(x, 13, P.rock1); bm.rect(4, 6, 14, 5, P.rock1); bm.rect(17, 5, 5, 7, P.log3); },
  stonecart: (bm) => { bm.rect(3, 10, 18, 5, P.log2); bm.ellipse(7, 17, 3, 3, P.log4); bm.ellipse(17, 17, 3, 3, P.log4); for (const x of [5, 10, 15]) bm.rect(x, 6, 4, 4, P.stone1); },
  timberraft: (bm) => { bm.rect(0, 18, 24, 5, P.water2); for (let i = 0; i < 4; i++) { bm.rect(2, 8 + i * 3, 20, 3, P.log2); bm.rect(2, 8 + i * 3, 20, 1, P.log1); bm.rect(21, 8 + i * 3, 1, 3, P.log0); } },
  // events
  goodharvest: (bm) => { bm.ellipse(12, 11, 7, 7, P.sun); for (let a = 0; a < 8; a++) bm.set(12 + Math.round(Math.cos(a) * 10), 11 + Math.round(Math.sin(a) * 10), P.sun1); },
  drought: (bm) => { bm.ellipse(12, 9, 6, 6, P.flag); for (let x = 2; x < 22; x++) bm.set(x, 18 + ((x >> 2) & 1), P.dirt3); },
  goodgrapes: (bm) => ICONS.vineyard(bm),
  fair: (bm) => { for (let j = 0; j < 12; j++) { const h = Math.round(j * 0.9); bm.rect(12 - h, 6 + j, h * 2 + 1, 1, j & 2 ? P.sash0 : P.shirt0); } bm.rect(11, 3, 2, 3, P.log3); },
  rain: (bm) => { bm.ellipse(12, 7, 9, 4, P.far1); for (let i = 0; i < 6; i++) bm.line(5 + i * 3, 13, 3 + i * 3, 20, P.water2, 1); },
  hardwinter: (bm) => { for (let a = 0; a < 6; a++) bm.line(12, 12, 12 + Math.round(Math.cos(a) * 9), 12 + Math.round(Math.sin(a) * 9), P.snow1, 1); },
  travellingmasons: (bm) => ICONS.mason(bm),
  storm: (bm) => { bm.ellipse(12, 6, 9, 4, P.far2); bm.line(13, 10, 9, 16, P.sun, 1); bm.line(9, 16, 14, 16, P.sun, 1); bm.line(14, 16, 10, 22, P.sun, 1); },
  newfamily: (bm) => ICONS.vereda(bm),
  // resources
  food: (bm) => { bm.ellipse(12, 13, 9, 6, (dx, dy) => (dy < -2 ? P.log0 : P.log1)); for (const x of [8, 12, 16]) bm.set(x, 10, P.log3); },
  wine: (bm) => { bm.rect(9, 5, 6, 3, P.cloth1); bm.ellipse(12, 14, 6, 7, (dx) => (dx < 0 ? P.cloth0 : P.cloth1)); },
  stone: (bm) => { bm.rect(5, 8, 14, 11, P.stone1); bm.rect(5, 8, 14, 2, P.stone0); bm.rect(17, 8, 2, 11, P.stone3); },
  timber: (bm) => { for (let i = 0; i < 3; i++) { bm.rect(3, 7 + i * 4, 18, 4, P.log2); bm.rect(3, 7 + i * 4, 18, 1, P.log1); bm.ellipse(20, 9 + i * 4, 1.5, 1.5, P.log0); } },
  coin: (bm) => bm.ellipse(12, 12, 7, 7, (dx, dy, q) => (q > 0.7 ? P.dusk2 : dx + dy < 0 ? P.sun : P.sun1)),
  workers: (bm) => { bm.rect(9, 11, 7, 8, P.shirt0); bm.rect(9, 17, 7, 1, P.sash0); bm.rect(10, 5, 5, 5, P.skin0); bm.rect(10, 4, 5, 2, P.beret); },
  pop: (bm) => ICONS.vereda(bm),
};

export function iconURL(id) {
  return cached(`icon.${id}`, () => {
    const bm = new Bitmap(24, 24);
    (ICONS[id] ?? ICONS.house)(bm);
    return bm.canvas().toDataURL();
  });
}

// ---- story scenes --------------------------------------------------------------------

function palace(bm) {
  // Olite's palace at dusk: many towers above the town, vineyards in front.
  sky(bm, 200, [P.far3, P.far2, P.dusk2, P.dusk1, P.dusk0]);
  bm.ellipse(300, 170, 26, 26, (dx, dy) => (dy < 16 ? P.sun1 : 0));
  for (let x = 0; x < W; x++) for (let y = 176 + Math.round(Math.sin(x * 0.04) * 3); y < 200; y++) bm.set(x, y, P.far2);
  const base = 208;
  const towers = [[110, 20, 70, 1], [140, 16, 56, 0], [172, 22, 88, 0], [204, 14, 60, 1], [230, 26, 100, 0], [266, 16, 64, 0], [292, 20, 78, 1], [324, 14, 52, 0]];
  bm.rect(100, base - 36, 250, 36, P.stone1);
  for (let x = 100; x < 350; x += 5) bm.rect(x, base - 40, 3, 4, P.stone1);
  for (const [x, w, h, cone] of towers) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) bm.set(x + i, base - h + j, i < 3 ? P.stone0 : i > w - 5 ? P.stone2 : P.stone1);
    if (cone) for (let j = 0; j < w; j++) { const half = Math.round((j / w) * (w / 2 + 2)); bm.rect(x + w / 2 - half, base - h - w + j, half * 2, 1, j < w / 2 ? P.roof1 : P.roof2); }
    else for (let i = 0; i < w; i += 4) bm.rect(x + i, base - h - 4, 3, 4, P.stone1);
    for (let y = base - h + 10; y < base - 20; y += 16) bm.rect(x + w / 2 - 1, y, 3, 5, hash2(x, y) > 0.5 ? P.sun1 : P.stone3);
  }
  for (let y = base; y < 270; y++) for (let x = 0; x < W; x++) {
    const r = ((x + (y - base) * 1.5) % 7) < 3;
    bm.set(x, y, r ? ((x + y) % 5 ? P.pine1 : P.pine2) : dither(x, y, 0.3) ? P.dirt1 : P.dirt0);
  }
}

function court(bm) {
  // The king's banner coming along the road to Olite.
  sky(bm, 170, SKIES.summer);
  for (let x = 0; x < W; x++) { const top = Math.round(150 - fbm1(x * 0.02, 5, 3) * 20); for (let y = top; y < 175; y++) bm.set(x, y, P.far1); }
  for (let y = 175; y < 270; y++) for (let x = 0; x < W; x++) bm.set(x, y, dither(x, y, 0.4) ? P.dusk1 : P.grass2);
  for (let x = 0; x < W; x++) bm.rect(x, 196 + Math.round(Math.sin(x * 0.02) * 2), 1, 10, P.dirt0);
  for (let i = 0; i < 7; i++) {
    const x = 90 + i * 44;
    bm.rect(x - 8, 186, 18, 9, i % 2 ? P.log3 : P.shirt1); // horse
    bm.rect(x - 8, 195, 2, 8, P.log4); bm.rect(x + 7, 195, 2, 8, P.log4); bm.rect(x + 8, 180, 5, 8, i % 2 ? P.log3 : P.shirt1);
    person(bm, x, 187, i === 3 ? P.sun1 : P.sash0, P.sun);
    if (i === 1 || i === 5) { bm.rect(x + 3, 150, 1, 36, P.log3); bm.rect(x + 4, 150, 14, 10, P.sash1); bm.rect(x + 6, 153, 10, 1, P.sun); bm.rect(x + 6, 156, 10, 1, P.sun); }
  }
}

function masons(bm) {
  sky(bm, 170, SKIES.spring);
  for (let x = 0; x < W; x++) { const top = Math.round(130 - fbm1(x * 0.015, 9, 3) * 40); for (let y = top; y < 185; y++) bm.set(x, y, x > 300 && y < top + 30 ? (hash2(x, y) > 0.5 ? P.rock1 : P.rock2) : P.far1); }
  for (let y = 185; y < 270; y++) for (let x = 0; x < W; x++) bm.set(x, y, dither(x, y, 0.4) ? P.pebble1 : P.pebble0);
  for (let i = 0; i < 6; i++) { const x = 60 + i * 30; bm.rect(x, 190 - (i % 3) * 8, 22, 12, P.stone1); bm.rect(x, 190 - (i % 3) * 8, 22, 2, P.stone0); }
  for (const [x, shirt] of [[270, P.shirt0], [320, P.shirt1], [370, P.dusk1]]) { person(bm, x, 205, shirt); bm.rect(x + 3, 192, 8, 6, P.stone1); bm.line(x + 2, 194, x + 6, 188, P.rock3, 1); }
  bm.rect(400, 186, 40, 8, P.log2); bm.ellipse(406, 197, 4, 4, P.log4); bm.ellipse(434, 197, 4, 4, P.log4);
}

function village(bm) {
  sky(bm, 120, SKIES.spring);
  const town = paintTown({ built: { house: 2, field: 1, vineyard: 1 }, people: {}, season: 'spring' });
  bm.rect(0, 120, W, 150, P.grass2);
  const cx = town.img.getContext('2d').getImageData(0, 0, W, TH);
  const px = new Uint32Array(cx.data.buffer);
  for (let y = 0; y < TH; y++) for (let x = 0; x < W; x++) if (y > 60) bm.set(x, y + 70, px[y * W + x]);
}

const SCENES = { palace, court, masons, village };

export function drawScene(ctx, name, t = 0) {
  const key = SCENES[name] ? name : 'palace';
  ctx.drawImage(cached(`scene.${key}`, () => { const bm = new Bitmap(W, 270); SCENES[key](bm); return bm.canvas(); }), 0, 0);
  void t;
}

void mix;
