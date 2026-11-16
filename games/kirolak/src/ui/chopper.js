// The aizkolari, seen from the front: standing on the log, facing the crowd,
// cutting a V between the feet. Strokes alternate shoulders, as the real ones
// do: wound up over one shoulder, the axe comes down across the body into
// that side's wall of the V, then lifts across to wind up over the other.
// Side +1 is the screen-right shoulder ([A]), -1 the screen-left one ([B]).
//
// A swing pose is a handful of numbers, not joints (the joints follow from
// them), so poses blend without limbs crossing:
//   hx, hy   hips (metres; feet on the log top at 0, y up is negative)
//   bend     0 upright .. 1 bent right over the cut
//   lean     shoulders shifted sideways from the hips
//   tilt     shoulder line: + raises the screen-right shoulder
//   turn     head turned toward screen-right (+) or left (-)
//   H        the lower hand on the haft
//   ang      the haft's direction from the hands to the head (radians)
//   len      haft length as seen (short when it points at us mid-swing)

import { TEAM, mix } from './figure.js';

const dirOf = (x, y) => Math.atan2(y, x);
export const SWING = {
  up: (s) => ({ hx: 0.03 * s, hy: -0.93, bend: 0, lean: 0.03 * s, tilt: 0.6 * s, turn: 0.25 * s, H: [0.2 * s, -1.6], ang: dirOf(0.56 * s, -0.83), len: 0.75 }),
  strike: (s) => ({ hx: 0.06 * s, hy: -0.76, bend: 1, lean: 0.02 * s, tilt: -0.5 * s, turn: -0.15 * s, H: [0.27 * s, -0.77], ang: dirOf(-0.26 * s, 0.97), len: 0.75 }),
  lift: (s) => ({ hx: 0, hy: -0.9, bend: 0.3, lean: 0, tilt: 0, turn: 0, H: [0.08 * s, -1.2], ang: dirOf(0.2 * s, -0.98), len: 0.7 }),
  cheer: () => ({ hx: 0, hy: -0.96, bend: 0, lean: 0, tilt: 0, turn: 0, H: [0.16, -1.86], ang: dirOf(0.15, -1), len: 0.75 }),
};

const lerp = (a, b, t) => a + (b - a) * t;
// Shortest way round between two angles.
const lerpAng = (a, b, t) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };
export function blendSwing(a, b, t) {
  const o = {};
  for (const k of ['hx', 'hy', 'bend', 'lean', 'tilt', 'turn', 'len']) o[k] = lerp(a[k], b[k], t);
  o.H = [lerp(a.H[0], b.H[0], t), lerp(a.H[1], b.H[1], t)];
  o.ang = lerpAng(a.ang, b.ang, t);
  return o;
}
const ease = (t) => t * t * (3 - 2 * t);

// Timing of one stroke, in seconds since it landed.
const DOWN = 0.07, HOLD = 0.16;
// The pose `since` seconds after a stroke on side `s` (the next one comes from
// the other shoulder), with `windup` the time to a full power ring. Also
// returns the swoosh of the downswing while it shows.
export function swingAt(s, since, windup) {
  if (since < DOWN) {
    // The downswing (drawn just after the press, so it's never missed): the
    // haft foreshortens as the head comes over toward us, then reappears
    // pointing down into the cut.
    const k = since / DOWN, up = SWING.up(s), hit = SWING.strike(s);
    const p = blendSwing(up, hit, ease(k));
    p.ang = k < 0.5 ? up.ang : hit.ang;
    p.len = 0.75 * Math.abs(1 - 2 * k) + 0.08;
    return { pose: p, swoosh: 1 - k * 0.3 };
  }
  if (since < HOLD) return { pose: SWING.strike(s), swoosh: Math.max(0, 1 - (since - DOWN) / (HOLD - DOWN)) * 0.7 };
  const k = Math.min(1, (since - HOLD) / Math.max(0.05, windup - HOLD)), n = -s;
  const pose = k < 0.45 ? blendSwing(SWING.strike(s), SWING.lift(n), ease(k / 0.45)) : blendSwing(SWING.lift(n), SWING.up(n), ease((k - 0.45) / 0.55));
  return { pose, swoosh: 0 };
}

// ---- drawing --------------------------------------------------------------------------------------

function joints(p) {
  const squat = Math.max(0, Math.min(1, (-0.95 - p.hy) / -0.2));
  const hip = [p.hx, p.hy];
  const hipL = [hip[0] - 0.12, hip[1] + 0.03], hipR = [hip[0] + 0.12, hip[1] + 0.03];
  const footL = [-0.3, 0], footR = [0.3, 0];
  const knee = (h, f, side) => [(h[0] + f[0]) / 2 + side * (0.03 + 0.09 * squat), (h[1] + f[1]) / 2];
  const T = 0.52 - 0.18 * p.bend;
  const sc = [hip[0] + p.lean, hip[1] - T];
  const shL = [sc[0] - 0.2, sc[1] + p.tilt * 0.08], shR = [sc[0] + 0.2, sc[1] - p.tilt * 0.08];
  const head = [sc[0] + p.turn * 0.04, sc[1] - 0.2 + p.bend * 0.06];
  const dir = [Math.cos(p.ang), Math.sin(p.ang)];
  const g1 = p.H, g2 = [p.H[0] + dir[0] * 0.14, p.H[1] + dir[1] * 0.14];
  // Each hand to the nearer shoulder.
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const [hL, hR] = d(shL, g1) + d(shR, g2) <= d(shL, g2) + d(shR, g1) ? [g1, g2] : [g2, g1];
  return { hip, hipL, hipR, footL, footR, kneeL: knee(hipL, footL, -1), kneeR: knee(hipR, footR, 1), sc, shL, shR, head, dir, hL, hR, elL: elbow(shL, hL, sc, -1), elR: elbow(shR, hR, sc, 1) };
}

// Two-bone reach from shoulder to hand, elbow bowed outward.
function elbow(s, h, sc, side) {
  const A = 0.31, B = 0.31;
  let dx = h[0] - s[0], dy = h[1] - s[1], d = Math.hypot(dx, dy) || 1e-6;
  const dd = Math.min(d, A + B - 0.005);
  const a = (A * A - B * B + dd * dd) / (2 * dd), hh = Math.sqrt(Math.max(0, A * A - a * a));
  const ux = dx / d, uy = dy / d, bx = s[0] + ux * a, by = s[1] + uy * a;
  const c1 = [bx - uy * hh, by + ux * hh], c2 = [bx + uy * hh, by - ux * hh];
  // Outward from the body, and a little down.
  const score = (c) => side * (c[0] - sc[0]) + 0.3 * (c[1] - s[1]);
  return score(c1) > score(c2) ? c1 : c2;
}

function stroke(g, pts, w, colour) {
  g.strokeStyle = colour; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(...pts[0]); for (const p of pts.slice(1)) g.lineTo(...p); g.stroke();
}

function drawAxe(g, J, len) {
  const [dx, dy] = J.dir, H = J.hL[1] > J.hR[1] ? J.hL : J.hR; // the lower hand holds the end
  const tip = [H[0] + dx * len, H[1] + dy * len];
  stroke(g, [[H[0] - dx * 0.06, H[1] - dy * 0.06], tip], 0.045, '#b08050');
  // The head, its edge across the haft, shrunk with the haft when foreshortened.
  const k = Math.min(1, len / 0.75 + 0.25);
  g.save(); g.translate(...tip); g.rotate(Math.atan2(dy, dx)); g.scale(k, 1);
  const steel = g.createLinearGradient(0, -0.14, 0, 0.14);
  steel.addColorStop(0, '#e8ecf0'); steel.addColorStop(0.5, '#9aa2ac'); steel.addColorStop(1, '#5a626c');
  g.fillStyle = steel; g.beginPath(); g.moveTo(-0.05, -0.05); g.lineTo(0.05, -0.15); g.quadraticCurveTo(0.1, 0, 0.05, 0.15); g.lineTo(-0.05, 0.05); g.closePath(); g.fill();
  g.restore();
  return tip;
}

// Draw the aizkolari at (x, y) (the log top under their feet), `u` px per metre.
export function drawChopper(g, pose, x, y, u, team, opts = {}) {
  const T = TEAM[team], J = joints(pose);
  const skin = '#e2ad84', skinD = mix(skin, '#6a3a20', 0.25);
  const white = '#f5f2ea', whiteD = '#d6d0c2';
  g.save(); g.translate(x, y); g.scale(u, u);
  // The swoosh of the downswing: from over the shoulder, across, into the cut.
  if (opts.swoosh > 0 && opts.side) {
    const s = opts.side, a = opts.swoosh;
    const from = [0.6 * s, -2.2], via = [0.05 * s, -1.25], to = [0.05 * s, -0.05];
    for (const [w, al] of [[0.22, 0.18], [0.1, 0.4]]) {
      g.strokeStyle = `rgba(255,250,235,${al * a})`; g.lineWidth = w; g.lineCap = 'round';
      g.beginPath(); g.moveTo(...from); g.quadraticCurveTo(...via, ...to); g.stroke();
    }
  }
  // Legs, apart on the log; the trouser legs shaded on the inside.
  for (const [h, k, f] of [[J.hipL, J.kneeL, J.footL], [J.hipR, J.kneeR, J.footR]]) {
    stroke(g, [h, k, f], 0.17, white);
    stroke(g, [[(h[0] + k[0]) / 2, (h[1] + k[1]) / 2], k, f], 0.06, 'rgba(0,0,0,0.07)');
    g.fillStyle = '#3a2e28'; g.beginPath(); g.ellipse(f[0], f[1] - 0.03, 0.09, 0.05, 0, 0, Math.PI * 2); g.fill();
  }
  // The axe goes behind the head while it's up over a shoulder.
  const behind = J.dir[1] < -0.3 && J.hL[1] < J.sc[1] + 0.1;
  if (behind) drawAxe(g, J, pose.len);
  // Torso: shirt from hips to the (tilted) shoulders, the sash at the waist.
  const shirt = g.createLinearGradient(J.shL[0], 0, J.shR[0], 0);
  shirt.addColorStop(0, whiteD); shirt.addColorStop(0.45, white); shirt.addColorStop(1, '#fffdf8');
  g.fillStyle = shirt; g.beginPath();
  g.moveTo(J.hipL[0] - 0.04, J.hipL[1]);
  g.quadraticCurveTo(J.shL[0] - 0.03, (J.hipL[1] + J.shL[1]) / 2, J.shL[0], J.shL[1]);
  g.quadraticCurveTo(J.sc[0], J.sc[1] - 0.05, J.shR[0], J.shR[1]);
  g.quadraticCurveTo(J.shR[0] + 0.03, (J.hipR[1] + J.shR[1]) / 2, J.hipR[0] + 0.04, J.hipR[1]);
  g.closePath(); g.fill();
  g.save(); g.translate(...J.hip); g.rotate(Math.atan2(J.shR[1] - J.shL[1], J.shR[0] - J.shL[0]) * 0.4);
  g.fillStyle = T.sash; g.fillRect(-0.18, -0.08, 0.36, 0.12);
  g.fillStyle = T.sashD; g.fillRect(-0.18, 0.02, 0.36, 0.022);
  g.fillStyle = T.sash; g.beginPath(); g.moveTo(0.1, 0.0); g.lineTo(0.16, 0.24); g.lineTo(0.21, 0.23); g.lineTo(0.17, 0.0); g.fill(); // the sash's tail
  g.restore();
  // Neck and head, facing us (turned a little), with the txapela.
  const [hx, hy] = J.head, tw = pose.turn * 0.035;
  g.fillStyle = skinD; g.fillRect(J.sc[0] - 0.045, J.sc[1] - 0.12, 0.09, 0.13);
  // Hair showing under the txapela at the temples, behind the face.
  g.fillStyle = opts.hair ?? '#3a2618'; for (const e of [-1, 1]) { g.beginPath(); g.ellipse(hx + e * 0.09, hy - 0.06, 0.035, 0.06, e * 0.2, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = skinD; for (const e of [-1, 1]) { g.beginPath(); g.ellipse(hx + e * 0.105 - tw, hy + 0.01, 0.022, 0.035, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = skin; g.beginPath(); g.ellipse(hx, hy, 0.1, 0.13, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2a1a10'; for (const e of [-1, 1]) { g.beginPath(); g.arc(hx + e * 0.042 + tw, hy - 0.015, 0.013, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#2a1a10'; g.lineWidth = 0.012;
  for (const e of [-1, 1]) { g.beginPath(); g.moveTo(hx + e * 0.02 + tw, hy - 0.05 + (opts.effort ? 0.008 : 0)); g.lineTo(hx + e * 0.065 + tw, hy - 0.055); g.stroke(); }
  g.strokeStyle = skinD; g.lineWidth = 0.014; g.beginPath(); g.moveTo(hx + tw, hy - 0.01); g.lineTo(hx + tw * 1.4 + 0.008, hy + 0.035); g.stroke(); // nose
  if (opts.moustache) { g.fillStyle = opts.hair ?? '#3a2618'; g.beginPath(); g.ellipse(hx + tw, hy + 0.055, 0.045, 0.014, 0, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#7a2a20'; g.lineWidth = 0.013; g.beginPath();
  if (opts.effort) { g.moveTo(hx - 0.03 + tw, hy + 0.08); g.lineTo(hx + 0.03 + tw, hy + 0.08); } else g.arc(hx + tw, hy + 0.06, 0.03, 0.3, Math.PI - 0.3);
  g.stroke();
  g.fillStyle = opts.beret ?? T.beret;
  g.beginPath(); g.ellipse(hx + tw * 0.5, hy - 0.115, 0.15, 0.055, pose.tilt * -0.08, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(hx + tw * 0.5, hy - 0.17, 0.014, 0, Math.PI * 2); g.fill();
  // The axe in front, then the arms over its haft.
  if (!behind) drawAxe(g, J, pose.len);
  for (const [s, e, h] of [[J.shL, J.elL, J.hL], [J.shR, J.elR, J.hR]]) {
    stroke(g, [s, e], 0.12, whiteD);
    stroke(g, [e, h], 0.085, skin);
    g.fillStyle = skin; g.beginPath(); g.arc(h[0], h[1], 0.05, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}
