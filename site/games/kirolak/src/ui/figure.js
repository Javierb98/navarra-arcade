// The competitors, seen side-on, painted smooth. A pose is a set of joint
// positions in metres (feet on the ground at 0,0; y up is negative; facing
// +x), and every movement blends between keyframe poses, so nothing snaps.

const J = ['hip', 'sh', 'head', 'kf', 'ff', 'kb', 'fb', 'ef', 'hf', 'eb', 'hb'];

export const POSES = {
  stand: { hip: [0, -0.95], sh: [0.02, -1.48], head: [0.05, -1.68], kf: [0.06, -0.5], ff: [0.1, 0], kb: [-0.04, -0.5], fb: [-0.08, 0], ef: [0.08, -1.2], hf: [0.12, -0.95], eb: [-0.03, -1.2], hb: [-0.04, -0.95] },
  ready: { hip: [-0.02, -0.88], sh: [0.08, -1.4], head: [0.13, -1.6], kf: [0.16, -0.46], ff: [0.2, 0], kb: [-0.1, -0.46], fb: [-0.18, 0], ef: [0.2, -1.15], hf: [0.3, -1.0], eb: [0.08, -1.15], hb: [0.2, -1.0] },
  // Aizkolaritza: overhead backswing, and the strike between the feet.
  chopUp: { hip: [0, -0.95], sh: [-0.03, -1.47], head: [0.03, -1.67], kf: [0.17, -0.5], ff: [0.26, 0], kb: [-0.15, -0.5], fb: [-0.26, 0], ef: [0.02, -1.73], hf: [-0.1, -1.9], eb: [-0.1, -1.7], hb: [-0.14, -1.86] },
  chopDown: { hip: [-0.06, -0.84], sh: [0.2, -1.28], head: [0.31, -1.4], kf: [0.18, -0.44], ff: [0.26, 0], kb: [-0.17, -0.44], fb: [-0.26, 0], ef: [0.34, -1.05], hf: [0.36, -0.74], eb: [0.28, -1.03], hb: [0.3, -0.78] },
  // Harri-jasotzea: a deep squat to the stone, the stone rolled up to the chest, then on the shoulder.
  liftLow: { hip: [-0.2, -0.55], sh: [0.12, -0.98], head: [0.24, -1.1], kf: [0.2, -0.58], ff: [0.12, 0], kb: [0.06, -0.55], fb: [-0.14, 0], ef: [0.3, -0.7], hf: [0.38, -0.42], eb: [0.24, -0.7], hb: [0.3, -0.45] },
  liftChest: { hip: [-0.1, -0.78], sh: [-0.02, -1.32], head: [0.06, -1.52], kf: [0.12, -0.42], ff: [0.14, 0], kb: [-0.04, -0.42], fb: [-0.14, 0], ef: [0.2, -1.05], hf: [0.3, -1.2], eb: [0.14, -1.0], hb: [0.26, -0.9] },
  liftTop: { hip: [0, -0.95], sh: [0.02, -1.47], head: [0.12, -1.64], kf: [0.06, -0.5], ff: [0.1, 0], kb: [-0.05, -0.5], fb: [-0.1, 0], ef: [0.06, -1.3], hf: [-0.1, -1.5], eb: [-0.18, -1.32], hb: [-0.34, -1.52] },
  // Txingak: two strides, arms hanging straight with the weights.
  walkA: { hip: [0, -0.93], sh: [0.05, -1.46], head: [0.09, -1.66], kf: [0.18, -0.52], ff: [0.26, 0], kb: [-0.08, -0.48], fb: [-0.22, -0.06], ef: [0.05, -1.18], hf: [0.06, -0.88], eb: [0.03, -1.18], hb: [0.04, -0.88] },
  walkB: { hip: [0, -0.93], sh: [0.05, -1.46], head: [0.09, -1.66], kf: [-0.08, -0.48], ff: [-0.22, -0.06], kb: [0.18, -0.52], fb: [0.26, 0], ef: [0.05, -1.18], hf: [0.06, -0.88], eb: [0.03, -1.18], hb: [0.04, -0.88] },
  // Sokatira: leaning back hard on the rope, and a heave.
  lean: { hip: [-0.18, -0.8], sh: [-0.42, -1.26], head: [-0.46, -1.47], kf: [0.1, -0.44], ff: [0.36, 0], kb: [-0.02, -0.42], fb: [0.18, 0], ef: [-0.1, -1.05], hf: [0.18, -0.92], eb: [-0.14, -1.1], hb: [0.12, -0.95] },
  heave: { hip: [-0.32, -0.72], sh: [-0.62, -1.12], head: [-0.7, -1.32], kf: [0.0, -0.4], ff: [0.34, 0], kb: [-0.14, -0.38], fb: [0.16, 0], ef: [-0.3, -0.95], hf: [0.0, -0.86], eb: [-0.34, -1.0], hb: [-0.06, -0.9] },
  cheer: { hip: [0, -0.97], sh: [0, -1.5], head: [0.02, -1.71], kf: [0.08, -0.5], ff: [0.14, 0], kb: [-0.06, -0.5], fb: [-0.12, 0], ef: [0.14, -1.72], hf: [0.18, -1.98], eb: [-0.12, -1.72], hb: [-0.16, -1.98] },
  slump: { hip: [-0.02, -0.92], sh: [0.1, -1.4], head: [0.2, -1.52], kf: [0.06, -0.48], ff: [0.1, 0], kb: [-0.05, -0.48], fb: [-0.1, 0], ef: [0.12, -1.12], hf: [0.14, -0.86], eb: [0.04, -1.12], hb: [0.04, -0.86] },
};

const lerp = (a, b, t) => a + (b - a) * t;
export function blend(a, b, t) {
  const out = {};
  for (const k of J) out[k] = [lerp(a[k][0], b[k][0], t), lerp(a[k][1], b[k][1], t)];
  return out;
}
// Ease in and out, for natural motion between poses.
export const ease = (t) => t * t * (3 - 2 * t);

// Paint colours per team, and some shading helpers.
export const TEAM = [
  { sash: '#c62a22', sashD: '#8a1a14', beret: '#1a1a22', name: 'red' },
  { sash: '#2a6fb0', sashD: '#1a4a7a', beret: '#1a1a22', name: 'blue' },
];
function rgb(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function mix(a, b, t) { const A = rgb(a), B = rgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }

// A tapered limb from a to b, filled.
function limb(g, a, b, wa, wb, fill) {
  const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1e-6, nx = -dy / d, ny = dx / d;
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(a[0] + nx * wa / 2, a[1] + ny * wa / 2);
  g.lineTo(b[0] + nx * wb / 2, b[1] + ny * wb / 2);
  g.arc(b[0], b[1], wb / 2, Math.atan2(ny, nx), Math.atan2(-ny, -nx));
  g.lineTo(a[0] - nx * wa / 2, a[1] - ny * wa / 2);
  g.arc(a[0], a[1], wa / 2, Math.atan2(-ny, -nx), Math.atan2(ny, nx));
  g.fill();
}

// A whole leg or arm as one smooth stroke (no seams at the joint), with a
// slightly thinner second pass toward the end for a taper.
function chain(g, a, b, c, w0, w1, colour) {
  g.strokeStyle = colour; g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = w1; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...c); g.stroke();
  g.lineWidth = w0; g.beginPath(); g.moveTo(...a); g.lineTo((a[0] + b[0] * 3) / 4, (a[1] + b[1] * 3) / 4); g.stroke();
}

// Draw a competitor at (x, y) on screen, `u` pixels per metre, facing `dir`
// (+1 right, -1 left). `hold` draws what's in their hands afterwards, in the
// same coordinates (metres, facing +x).
export function drawFigure(g, pose, x, y, u, dir, team, opts = {}) {
  const T = TEAM[team];
  const skin = opts.skin ?? '#e2ad84', skinD = mix(skin, '#6a3a20', 0.25);
  const white = '#f5f2ea', whiteD = '#d6d0c2', whiteDD = '#bdb5a6';
  g.save();
  g.translate(x, y); g.scale(u * dir, u);
  g.lineJoin = 'round'; g.lineCap = 'round';
  // Shadow on the sawdust.
  if (!opts.noShadow) {
    const sh = g.createRadialGradient(0, 0, 0, 0, 0, 0.5);
    sh.addColorStop(0, 'rgba(60,36,16,0.35)'); sh.addColorStop(1, 'rgba(60,36,16,0)');
    g.fillStyle = sh; g.save(); g.scale(1, 0.18); g.beginPath(); g.arc((pose.ff[0] + pose.fb[0]) / 2, 0, 0.55, 0, Math.PI * 2); g.fill(); g.restore();
  }
  if (opts.behind) opts.behind(g);
  // Back leg and arm, in shade.
  chain(g, pose.hip, pose.kb, pose.fb, 0.19, 0.13, whiteD);
  foot(g, pose.fb, '#3a2e28');
  chain(g, pose.sh, pose.eb, pose.eb, 0.12, 0.1, whiteDD);
  chain(g, pose.eb, pose.hb, pose.hb, 0.085, 0.075, skinD);
  g.fillStyle = skinD; g.beginPath(); g.arc(pose.hb[0], pose.hb[1], 0.05, 0, Math.PI * 2); g.fill();
  // Torso: white shirt, lit from the front, with the sash (gerriko) at the waist.
  const tx = pose.sh[0] - pose.hip[0], ty = pose.sh[1] - pose.hip[1], tl = Math.hypot(tx, ty), ang = Math.atan2(ty, tx) + Math.PI / 2;
  g.save(); g.translate(pose.hip[0], pose.hip[1]); g.rotate(ang);
  const shirt = g.createLinearGradient(-0.2, 0, 0.2, 0);
  shirt.addColorStop(0, whiteD); shirt.addColorStop(0.6, white); shirt.addColorStop(1, '#fffdf8');
  g.fillStyle = shirt;
  g.beginPath(); g.moveTo(-0.15, 0.05); g.quadraticCurveTo(-0.19, -tl * 0.55, -0.13, -tl - 0.02); g.quadraticCurveTo(0, -tl - 0.07, 0.13, -tl - 0.02); g.quadraticCurveTo(0.2, -tl * 0.5, 0.15, 0.05); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 0.012; g.beginPath(); g.moveTo(0.05, -tl * 0.9); g.quadraticCurveTo(0.08, -tl * 0.5, 0.04, -0.1); g.stroke();
  g.fillStyle = T.sash; g.fillRect(-0.16, -0.12, 0.32, 0.12);
  g.fillStyle = T.sashD; g.fillRect(-0.16, -0.02, 0.32, 0.025);
  g.fillStyle = T.sash; g.beginPath(); g.moveTo(-0.15, -0.06); g.lineTo(-0.24, 0.16); g.lineTo(-0.18, 0.17); g.lineTo(-0.1, -0.02); g.fill(); // the sash's tail
  g.restore();
  // Head: profile facing forward, with a txapela.
  const hx = pose.head[0], hy = pose.head[1];
  g.fillStyle = skin; g.fillRect(pose.sh[0] - 0.04 + (hx - pose.sh[0]) * 0.3, pose.sh[1] - 0.12, 0.08, 0.14); // neck
  g.beginPath(); g.ellipse(hx, hy, 0.11, 0.13, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(hx + 0.1, hy - 0.02); g.lineTo(hx + 0.145, hy + 0.03); g.lineTo(hx + 0.1, hy + 0.05); g.fill(); // nose
  g.fillStyle = skinD; g.beginPath(); g.ellipse(hx - 0.02, hy + 0.01, 0.025, 0.04, 0, 0, Math.PI * 2); g.fill(); // ear
  g.fillStyle = '#2a1a10'; g.beginPath(); g.arc(hx + 0.06, hy - 0.02, 0.013, 0, Math.PI * 2); g.fill(); // eye
  g.strokeStyle = '#2a1a10'; g.lineWidth = 0.012; g.beginPath(); g.moveTo(hx + 0.035, hy - 0.05); g.lineTo(hx + 0.085, hy - 0.055); g.stroke(); // brow
  if (opts.effort) { g.strokeStyle = '#7a2a20'; g.lineWidth = 0.014; g.beginPath(); g.moveTo(hx + 0.05, hy + 0.07); g.lineTo(hx + 0.1, hy + 0.065); g.stroke(); }
  else { g.strokeStyle = '#8a4a34'; g.lineWidth = 0.012; g.beginPath(); g.arc(hx + 0.07, hy + 0.04, 0.03, 0.3, 1.4); g.stroke(); }
  g.fillStyle = opts.hair ?? '#3a2618'; g.beginPath(); g.ellipse(hx - 0.04, hy - 0.02, 0.08, 0.1, 0, Math.PI * 0.6, Math.PI * 1.5); g.fill();
  if (opts.moustache) { g.fillStyle = opts.hair ?? '#3a2618'; g.beginPath(); g.ellipse(hx + 0.08, hy + 0.05, 0.04, 0.015, 0.2, 0, Math.PI * 2); g.fill(); }
  // Txapela: a flat black beret, tilted.
  g.fillStyle = opts.beret ?? T.beret; g.beginPath(); g.ellipse(hx + 0.01, hy - 0.11, 0.15, 0.05, -0.12, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(hx + 0.01, hy - 0.16, 0.014, 0, Math.PI * 2); g.fill();
  // Front leg.
  chain(g, pose.hip, pose.kf, pose.ff, 0.2, 0.14, white);
  foot(g, pose.ff, '#4a3a30');
  if (opts.hold) opts.hold(g, pose);
  // Front arm: rolled sleeve, forearm, hand.
  chain(g, pose.sh, pose.ef, pose.ef, 0.13, 0.11, whiteD);
  chain(g, pose.ef, pose.hf, pose.hf, 0.09, 0.08, skin);
  g.fillStyle = skin; g.beginPath(); g.arc(pose.hf[0], pose.hf[1], 0.055, 0, Math.PI * 2); g.fill();
  if (opts.front) opts.front(g, pose);
  g.restore();
}

// Abarkak: the traditional leather shoes, tied up the ankle.
function foot(g, f, colour) {
  g.fillStyle = colour;
  g.beginPath(); g.ellipse(f[0] + 0.05, f[1] - 0.03, 0.12, 0.045, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 0.01;
  g.beginPath(); g.moveTo(f[0] - 0.03, f[1] - 0.12); g.lineTo(f[0] + 0.03, f[1] - 0.06); g.moveTo(f[0] + 0.03, f[1] - 0.12); g.lineTo(f[0] - 0.03, f[1] - 0.06); g.stroke();
}
