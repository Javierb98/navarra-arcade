// A tiny pixel-art toolkit. Art is painted pixel by pixel into a Bitmap (no
// anti-aliasing, so edges stay crisp when the canvas is scaled up), then
// turned into a canvas once and reused. Nothing here runs per frame except
// the blits of finished canvases.

// Palette. Ramps run light -> dark. Player colours stay Okabe-Ito.
const HEX = {
  sky0: '#cfe6f2', sky1: '#a9d2ea', sky2: '#86bce0', sky3: '#6aa6d4',
  dusk0: '#f7dcb0', dusk1: '#efc08a', dusk2: '#d99a6c',
  far0: '#b5c3d6', far1: '#95a6c0', far2: '#7a8cab', far3: '#63759a',
  mid0: '#7d9a8e', mid1: '#5f7e72', mid2: '#46645a', mid3: '#344d45',
  snow0: '#f7fafc', snow1: '#dfe8f1', snow2: '#b9c8da', snow3: '#95a8c0',
  pine0: '#5f9a4e', pine1: '#3f7a3c', pine2: '#2c5c30', pine3: '#1d4024', pine4: '#132b1a',
  grass0: '#9ccb62', grass1: '#79b04d', grass2: '#5a913f', grass3: '#437334', grass4: '#315627',
  dirt0: '#c9a36c', dirt1: '#a57f4f', dirt2: '#7f5c37', dirt3: '#5a3f25',
  pebble0: '#d8cdb4', pebble1: '#b5a88c', pebble2: '#8e8269', pebble3: '#665d4b',
  water0: '#d8f0fb', water1: '#8fcbe9', water2: '#58a5d6', water3: '#3b83bf', water4: '#2b66a2', water5: '#204e84',
  rock0: '#c6c3b8', rock1: '#9d9a90', rock2: '#77756c', rock3: '#55534d', rock4: '#393834',
  moss: '#6f8d3f',
  log0: '#e7c690', log1: '#c9965a', log2: '#a0703d', log3: '#774e28', log4: '#4f3219',
  ring: '#b98a52',
  stone0: '#e4dac4', stone1: '#c8baa0', stone2: '#a4957c', stone3: '#7c6f5a', stone4: '#574c3c',
  roof0: '#6f6a70', roof1: '#54505a', roof2: '#3d3a43', roof3: '#2a2830',
  tile0: '#b9583a', tile1: '#93432c', tile2: '#6d3020',
  skin0: '#f6d2ae', skin1: '#dca47c', skin2: '#b27a55',
  shirt0: '#f4efe4', shirt1: '#d6cdbb', shirt2: '#aca28f',
  beret: '#2b2b36', beret1: '#1b1b22',
  sash0: '#d0443a', sash1: '#9e2d27',
  cloth0: '#5a5064', cloth1: '#433b4c', cloth2: '#2f2937',
  shoe: '#6b5a44',
  duck0: '#f4f0e2', duck1: '#cfc8b4', duckhead: '#2f7a55', beak: '#f0a020',
  flag: '#d55e00', flag1: '#a84900', ok: '#009e73',
  p1: '#e69f00', p1d: '#b07a00', p2: '#56b4e9', p2d: '#3a86b3',
  sun: '#fff1b0', sun1: '#ffd966',
  wool0: '#fbf7ec', wool1: '#e8e0cc', wool2: '#c9bea4', wool3: '#978c76', face: '#3a302a', face1: '#5e5046',
  dog0: '#2a2622', dog1: '#48413a', dogw: '#f2eee4',
  wolf0: '#b3ada2', wolf1: '#8c867c', wolf2: '#625d56', eye: '#f0e442',
  fire0: '#fff1b0', fire1: '#ffc24a', fire2: '#e6792a', fire3: '#b0441c', ember: '#5a2a1a',
  turf0: '#a7b879', turf1: '#8ea264', turf2: '#768b52', turf3: '#5f7343',
  straw0: '#e2d29a', straw1: '#c9b676', straw2: '#a9955a',
  cow0: '#c98d52', cow1: '#a26a38', cow2: '#744a26', cowh: '#efe6d2',
  cloak0: '#3b3642', cloak1: '#26222c', ruff: '#f4f1ea',
  bleu: '#2e5aa8', rouge: '#c8343c',
  bunt1: '#e69f00', bunt2: '#56b4e9', bunt3: '#009e73', bunt4: '#f0e442',
  black: '#14121a', white: '#ffffff', shadow: '#000000',
};

export const P = {};
for (const [k, hex] of Object.entries(HEX)) {
  const n = parseInt(hex.slice(1), 16);
  P[k] = (0xff << 24) | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16); // ABGR (little-endian RGBA)
}
P.none = 0;

// Blend two packed colours (t = 0 -> a, 1 -> b).
export function mix(a, b, t) {
  const ch = (c, s) => (c >>> s) & 0xff;
  const m = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return ((0xff << 24) | m(16) | m(8) | m(0)) >>> 0;
}

// Ordered dithering: 4x4 Bayer threshold for (x, y), 0..1.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
export const dither = (x, y, t) => t > bayer(x, y);

// Deterministic hash and value noise, so every painting is the same each time.
export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = smooth(x - i);
  return hash2(i, 0, seed) * (1 - f) + hash2(i + 1, 0, seed) * f;
}
export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
export function fbm1(x, seed = 0, oct = 4) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += noise1(x * f, seed + i) * a; a /= 2; f *= 2; }
  return v;
}
// Value noise that repeats every `period` cells, for seamless tiles.
export function noise2p(x, y, period, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  const w = (i) => ((i % period) + period) % period;
  const a = hash2(w(ix), w(iy), seed), b = hash2(w(ix + 1), w(iy), seed);
  const c = hash2(w(ix), w(iy + 1), seed), d = hash2(w(ix + 1), w(iy + 1), seed);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

export function fbm2(x, y, seed = 0, oct = 3) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += noise2(x * f, y * f, seed + i * 17) * a; a /= 2; f *= 2; }
  return v;
}

export class Bitmap {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Uint32Array(w * h);
  }

  set(x, y, c) {
    x |= 0; y |= 0;
    if (c && x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
  }

  get(x, y) {
    x |= 0; y |= 0;
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x] : 0;
  }

  rect(x, y, w, h, c) {
    for (let j = Math.max(0, y | 0); j < Math.min(this.h, (y + h) | 0); j++) {
      for (let i = Math.max(0, x | 0); i < Math.min(this.w, (x + w) | 0); i++) this.px[j * this.w + i] = c;
    }
  }

  // Filled circle/ellipse; `shade(dx, dy)` may return a colour per pixel.
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(-ry); y <= Math.ceil(ry); y++) {
      for (let x = Math.floor(-rx); x <= Math.ceil(rx); x++) {
        const q = (x * x) / (rx * rx + 0.3) + (y * y) / (ry * ry + 0.3);
        if (q > 1) continue;
        this.set(cx + x, cy + y, typeof c === 'function' ? c(x, y, q) : c);
      }
    }
  }

  line(x0, y0, x1, y1, c, thick = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (thick === 1) this.set(x0, y0, c);
      else this.rect(x0 - (thick >> 1), y0 - (thick >> 1), thick, thick, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  // Draw another bitmap on top (transparent pixels skipped).
  blit(src, x, y, flip = false) {
    x |= 0; y |= 0;
    for (let j = 0; j < src.h; j++) {
      for (let i = 0; i < src.w; i++) {
        const c = src.px[j * src.w + (flip ? src.w - 1 - i : i)];
        if (c) this.set(x + i, y + j, c);
      }
    }
  }

  // One-pixel dark outline around every opaque region.
  outline(c) {
    const out = new Uint32Array(this.px);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.px[y * this.w + x]) continue;
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) out[y * this.w + x] = c;
      }
    }
    this.px = out;
    return this;
  }

  canvas() {
    const cv = document.createElement('canvas');
    cv.width = this.w;
    cv.height = this.h;
    const cx = cv.getContext('2d');
    const img = cx.createImageData(this.w, this.h);
    new Uint32Array(img.data.buffer).set(this.px);
    cx.putImageData(img, 0, 0);
    return cv;
  }
}

// Paint once, then keep the canvas.
const cache = new Map();
export function cached(key, paint) {
  let c = cache.get(key);
  if (!c) { c = paint(); cache.set(key, c); }
  return c;
}
export function uncache(prefix) {
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
}
