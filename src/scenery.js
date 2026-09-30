// The menu's living backdrop, in the games' pixel style: a dusk sky with
// slowly twinkling stars, three ranges of the Pyrenees drifting at different
// speeds, clouds, and now and then a flock of birds. Each layer is painted
// once into a seamless strip and then just slid along, so it costs almost
// nothing per frame. Nothing flashes: stars fade over seconds.

const W = 480;
const H = 270;
const STRIP = 960; // layers repeat every 960px

const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const hash = (n) => {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x, y, t) => t > BAYER[(y & 3) * 4 + (x & 3)];
const HAZE = [74, 70, 98];

// A ridge line that wraps around seamlessly: sines with whole-number periods.
function ridge(x, seed, amp) {
  let h = 0;
  for (const [f, a] of [[3, 0.5], [7, 0.25], [13, 0.14], [29, 0.07]]) {
    h += Math.sin((x / STRIP) * Math.PI * 2 * f + seed * (f + 1)) * a;
  }
  // Sharpen into peaks.
  return amp * (1 - Math.abs(h));
}

function paintRange(base, amp, seed, lit, dark, snow) {
  const c = document.createElement('canvas');
  c.width = STRIP; c.height = H;
  const cx = c.getContext('2d');
  const img = cx.createImageData(STRIP, H), px = img.data;
  const L = rgb(lit), D = rgb(dark), S = snow ? rgb(snow) : null;
  const tops = new Float32Array(STRIP);
  for (let x = 0; x < STRIP; x++) tops[x] = base - ridge(x, seed, amp);
  for (let x = 0; x < STRIP; x++) {
    const top = Math.round(tops[x]);
    const slope = tops[(x + 3) % STRIP] - tops[(x - 3 + STRIP) % STRIP]; // > 0: falling away to the right
    const moonward = slope > 0; // faces right, toward the moon
    for (let y = Math.max(0, top); y < H; y++) {
      let col = moonward ? L : D;
      if (Math.abs(slope) < 1.5 && dither(x, y, 0.5)) col = moonward ? D : L;
      if (S && y - top < 5 + (hash(x >> 2) * 5) && top < base - amp * 0.55) col = moonward ? S : D.map((v, i) => (v + S[i]) >> 1);
      // A bright rim where moonlight catches the ridge.
      if (y === top && moonward) col = col.map((v) => Math.min(255, v + 40));
      // Haze: lower slopes fade into the valley mist.
      const depth = (y - top) / (H - top);
      if (depth > 0.45 && dither(x, y, (depth - 0.45) * 0.9)) col = col.map((v, i) => (v * 3 + HAZE[i]) >> 2);
      const i = (y * STRIP + x) * 4;
      px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = 255;
    }
  }
  cx.putImageData(img, 0, 0);
  return c;
}

// Foreground: a low hill with a ragged line of pines, the closest layer.
function paintTreeLine() {
  const c = document.createElement('canvas');
  c.width = STRIP; c.height = H;
  const cx = c.getContext('2d');
  cx.fillStyle = '#0c0f1a';
  for (let x = 0; x < STRIP; x++) {
    const top = 252 - Math.round(ridge(x, 11.3, 10));
    cx.fillRect(x, top, 1, H - top);
  }
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(hash(i * 31 + 5) * STRIP), h = 10 + Math.floor(hash(i * 17) * 16);
    const base = 252 - Math.round(ridge(x, 11.3, 10)) + 2;
    for (let j = 0; j < h; j++) {
      const half = Math.round((j / h) * (h * 0.32)) + ((j % 4) === 3 ? 1 : 0);
      cx.fillRect(x - half, base - h + j, half * 2 + 1, 1);
    }
  }
  cx.drawImage(c, 0, 0, 60, H, STRIP, 0, 60, H);
  return c;
}

// Warm windows in villages on the middle hills, glowing softly.
function villageLights() {
  const out = [];
  for (let v = 0; v < 5; v++) {
    const x0 = 80 + v * 190 + Math.floor(hash(v * 7) * 60);
    const top = 215 - ridge(x0, 4.1, 80);
    for (let k = 0; k < 4; k++) out.push({ x: x0 + Math.floor(hash(v * 13 + k) * 14) - 7, y: Math.round(top + 6 + hash(v * 5 + k) * 10), phase: hash(v + k * 3) * 6 });
  }
  return out;
}

function paintClouds() {
  const c = document.createElement('canvas');
  c.width = STRIP; c.height = 90;
  const cx = c.getContext('2d');
  for (let i = 0; i < 7; i++) {
    const x = hash(i * 7) * STRIP, y = 16 + hash(i * 13) * 50, w = 40 + hash(i * 3) * 50;
    for (let k = 0; k < 4; k++) {
      const px = x + (k - 1.5) * w * 0.3, r = w * (0.18 + hash(i * 5 + k) * 0.1);
      for (const [dx, col] of [[0, '#3c4f6e'], [-1, '#56698a']]) {
        cx.fillStyle = col;
        cx.beginPath();
        cx.ellipse(Math.round(px + dx), Math.round(y + dx), Math.round(r), Math.round(r * 0.55), 0, 0, Math.PI * 2);
        cx.fill();
      }
    }
  }
  // Wrap: repeat the left edge on the right so the strip tiles.
  cx.drawImage(c, 0, 0, 120, 90, STRIP, 0, 120, 90);
  return c;
}

export function createScenery(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0f1424');
  sky.addColorStop(0.55, '#26324d');
  sky.addColorStop(1, '#4b3b52');
  const layers = [
    { img: paintRange(190, 110, 1.3, '#39456a', '#2c3657', '#9aa8c4'), speed: 2 },
    { img: paintRange(215, 80, 4.1, '#2a3450', '#212a42', '#6f7d9c'), speed: 5 },
    { img: paintRange(245, 55, 7.7, '#1b2236', '#161b2c', null), speed: 10 },
  ];
  const clouds = paintClouds();
  const trees = paintTreeLine();
  const lights = villageLights();
  const halo = ctx.createRadialGradient(392, 52, 8, 392, 52, 60);
  halo.addColorStop(0, 'rgba(241, 226, 166, 0.28)');
  halo.addColorStop(1, 'rgba(241, 226, 166, 0)');
  const stars = Array.from({ length: 70 }, (_, i) => ({ x: Math.floor(hash(i + 1) * W), y: Math.floor(hash(i + 99) * 120), phase: hash(i + 7) * 6.28, speed: 0.3 + hash(i + 3) * 0.6 }));
  let birds = null;

  return function draw(t) {
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // Stars fade in and out over several seconds.
    for (const s of stars) {
      const a = 0.35 + 0.35 * Math.sin(t * s.speed + s.phase);
      ctx.fillStyle = `rgba(240, 236, 220, ${a.toFixed(2)})`;
      ctx.fillRect(s.x, s.y, 1, 1);
    }
    // A low moon with a soft halo.
    ctx.fillStyle = halo;
    ctx.fillRect(330, 0, 130, 115);
    ctx.fillStyle = '#f1e2a6';
    ctx.beginPath(); ctx.arc(392, 52, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#26324d';
    ctx.beginPath(); ctx.arc(397, 49, 10, 0, Math.PI * 2); ctx.fill();

    const off = (speed) => -Math.round((t * speed) % STRIP);
    ctx.globalAlpha = 0.8;
    ctx.drawImage(clouds, off(3), 10); ctx.drawImage(clouds, off(3) + STRIP, 10);
    ctx.globalAlpha = 1;
    layers.forEach((l, i) => {
      ctx.drawImage(l.img, off(l.speed), 0);
      ctx.drawImage(l.img, off(l.speed) + STRIP, 0);
      if (i === 1) {
        // Village windows ride along with the middle range.
        for (const w of lights) {
          const a = 0.55 + 0.35 * Math.sin(t * 0.7 + w.phase);
          ctx.fillStyle = `rgba(255, 196, 96, ${a.toFixed(2)})`;
          const x = ((w.x + off(l.speed)) % STRIP + STRIP) % STRIP;
          if (x < W) ctx.fillRect(Math.round(x), w.y, 1, 1);
        }
      }
      if (i === 1) {
        // A band of valley mist drifting between the ranges.
        for (let k = 0; k < 3; k++) {
          const y = 205 + k * 9 + Math.round(Math.sin(t * 0.2 + k) * 3);
          ctx.fillStyle = `rgba(150, 160, 190, ${0.07 + k * 0.02})`;
          ctx.fillRect(0, y, W, 7);
        }
      }
    });
    ctx.drawImage(trees, off(16), 0);
    ctx.drawImage(trees, off(16) + STRIP, 0);

    // Now and then a small flock crosses the sky.
    if (!birds && Math.floor(t) % 23 === 0 && t - Math.floor(t) < 0.02) birds = { t0: t, y: 40 + (Math.floor(t) % 5) * 12 };
    if (birds) {
      const k = (t - birds.t0) * 22 - 20;
      if (k > W + 40) birds = null;
      else {
        ctx.fillStyle = '#0f1424';
        for (let i = 0; i < 5; i++) {
          const bx = Math.round(k - i * 9 - (i % 2) * 4), by = Math.round(birds.y + (i % 2) * 5 + i * 1.5), up = Math.sin(t * 8 + i) > 0 ? 1 : 0;
          ctx.fillRect(bx - 2, by - up, 2, 1); ctx.fillRect(bx, by, 1, 1); ctx.fillRect(bx + 1, by - up, 2, 1);
        }
      }
    }
  };
}
