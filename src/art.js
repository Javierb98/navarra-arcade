// Pictures the menu paints itself, for games that don't have a thumbnail
// yet. games.json refers to them as "art:<name>". Painted once at 240x135
// and doubled, so they match the games' chunky pixels.

const W = 240;
const H = 135;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x, y, t) => t > BAYER[(y & 3) * 4 + (x & 3)];
const hash = (a, b = 0) => {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Olite at dusk: the Noble's palace with its many towers above the town,
// Santa María's spire, and vineyards in the foreground.
function olite() {
  const c = canvas(W, H), cx = c.getContext('2d');
  const px = (x, y, col) => { cx.fillStyle = col; cx.fillRect(x, y, 1, 1); };
  const rect = (x, y, w, h, col) => { cx.fillStyle = col; cx.fillRect(x, y, w, h); };

  // Sky: night blue down to a warm horizon, dithered between bands.
  const bands = ['#1d2640', '#34405f', '#6a5a78', '#b7736a', '#e3a36a'];
  for (let y = 0; y < 96; y++) {
    const f = (y / 96) * (bands.length - 1), i = Math.min(bands.length - 2, Math.floor(f));
    for (let x = 0; x < W; x++) px(x, y, dither(x, y, f - i) ? bands[i + 1] : bands[i]);
  }
  // Setting sun behind the palace.
  cx.fillStyle = '#ffd98a'; cx.beginPath(); cx.arc(150, 92, 16, 0, Math.PI * 2); cx.fill();
  cx.fillStyle = '#fff1b0'; cx.beginPath(); cx.arc(150, 92, 11, 0, Math.PI * 2); cx.fill();
  // Far plain.
  for (let x = 0; x < W; x++) {
    const top = 90 + Math.round(Math.sin(x * 0.05) * 2 + Math.sin(x * 0.13) * 1.5);
    rect(x, top, 1, 8, '#6d5670');
  }

  // The palace: a long wall with towers of different heights.
  const stone = '#c9a57a', stoneD = '#9c7a57', stoneDD = '#6f5540', slate = '#3d3a4a', slateL = '#57536a';
  const towers = [
    { x: 58, w: 12, h: 44, roof: 'cone' }, { x: 74, w: 10, h: 34 }, { x: 90, w: 14, h: 52 },
    { x: 110, w: 9, h: 38, roof: 'cone' }, { x: 124, w: 16, h: 58 }, { x: 146, w: 10, h: 40 },
    { x: 160, w: 12, h: 48, roof: 'cone' }, { x: 176, w: 9, h: 32 },
  ];
  const ground = 104;
  rect(52, ground - 22, 140, 22, stone);
  rect(52, ground - 22, 140, 2, '#e0c08e');
  for (let x = 52; x < 192; x += 4) rect(x, ground - 25, 2, 3, stone); // battlements
  for (let x = 52; x < 192; x++) for (let y = ground - 20; y < ground; y++) if ((x + (y >> 2) * 3) % 9 === 0 || y % 4 === 0) px(x, y, stoneD);
  for (const tw of towers) {
    const top = ground - tw.h;
    rect(tw.x, top, tw.w, tw.h, stone);
    rect(tw.x + tw.w - 3, top, 3, tw.h, stoneD); // shade on the side away from the sun
    rect(tw.x, top, 1, tw.h, '#e0c08e');
    if (tw.roof === 'cone') {
      for (let j = 0; j < tw.w + 2; j++) {
        const half = Math.round(((j + 1) / (tw.w + 2)) * (tw.w / 2 + 1));
        rect(tw.x + tw.w / 2 - half, top - tw.w - 2 + j, half, 1, slateL);
        rect(tw.x + tw.w / 2, top - tw.w - 2 + j, half, 1, slate);
      }
    } else {
      for (let x = tw.x; x < tw.x + tw.w; x += 3) rect(x, top - 3, 2, 3, stone);
    }
    // Arched windows, some lit.
    for (let wy = top + 6; wy < ground - 10; wy += 11) {
      const wx = tw.x + Math.floor(tw.w / 2) - 1;
      const lit = hash(tw.x, wy) > 0.55;
      rect(wx, wy, 2, 4, lit ? '#ffc460' : stoneDD);
      px(wx, wy - 1, lit ? '#ffb040' : stoneDD);
    }
  }
  // Gate.
  rect(116, ground - 11, 8, 11, stoneDD);
  cx.fillStyle = stoneDD; cx.beginPath(); cx.arc(120, ground - 11, 4, Math.PI, 0); cx.fill();

  // Santa María's spire to the right.
  rect(204, ground - 30, 10, 30, stone);
  rect(211, ground - 30, 3, 30, stoneD);
  for (let j = 0; j < 18; j++) {
    const half = Math.max(1, Math.round((j / 18) * 6));
    rect(209 - half, ground - 48 + j, half, 1, stone);
    rect(209, ground - 48 + j, half, 1, stoneD);
  }
  px(209, ground - 50, '#e0c08e');

  // Town houses below the walls.
  for (let i = 0; i < 16; i++) {
    const x = 10 + i * 14 + Math.floor(hash(i, 3) * 5), w = 10 + Math.floor(hash(i, 4) * 5), h = 7 + Math.floor(hash(i, 5) * 5);
    if (x > 44 && x < 196) continue;
    rect(x, ground - h, w, h, '#d9c4a0');
    rect(x + w - 2, ground - h, 2, h, '#b39c7a');
    for (let j = 0; j < 4; j++) rect(x - 1 + j, ground - h - 4 + j, w + 2 - j * 2, 1, j < 2 ? '#a8543a' : '#8a4330');
    if (hash(i, 6) > 0.5) rect(x + 3, ground - h + 3, 2, 2, '#ffc460');
  }
  for (let i = 0; i < 12; i++) {
    const x = 50 + i * 12 + Math.floor(hash(i, 8) * 4), w = 9, h = 6;
    rect(x, ground, w, h, '#d9c4a0');
    for (let j = 0; j < 3; j++) rect(x - 1 + j, ground - 3 + j, w + 2 - j * 2, 1, '#a8543a');
  }

  // Vineyards: rows of vines on warm soil, lit from the low sun.
  for (let y = ground + 6; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const row = Math.floor((x + (y - ground) * 1.6) / 6);
      const inRow = ((x + (y - ground) * 1.6) % 6) < 2.4;
      let col = dither(x, y, 0.3) ? '#8a6a45' : '#a47f52';
      if (inRow) col = (row + (y >> 1)) % 3 === 0 ? '#6a8a3a' : '#4f6e2c';
      px(x, y, col);
    }
  }
  return c;
}

const PAINTERS = { olite };
const cache = new Map();

// A data URL for "art:<name>", or null if there's no such painter.
export function paintedThumb(ref) {
  const name = ref?.startsWith('art:') ? ref.slice(4) : null;
  if (!name || !PAINTERS[name]) return null;
  if (!cache.has(name)) {
    const small = PAINTERS[name]();
    const big = canvas(W * 2, H * 2), bx = big.getContext('2d');
    bx.imageSmoothingEnabled = false;
    bx.drawImage(small, 0, 0, W * 2, H * 2);
    cache.set(name, big.toDataURL());
  }
  return cache.get(name);
}
