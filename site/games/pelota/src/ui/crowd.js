// The crowd in the stands on the open right side of the court, drawn every
// frame so it can live: heads follow the ball, people fan themselves, chat,
// clap after a good rally and leap up after a point. Painted in the same
// smooth style as the court, never pixel art.
//
// The stands face the court, so from behind the court we see each
// spectator in three-quarter view, turned toward the left of the screen.

import { makeRng } from '../core/rng.js';
import { project, COURT, LIGHTS, mix } from './art.js';

const SKIN = ['#f1cba6', '#e6b48c', '#d49c74', '#c08660', '#f6d8bc', '#a8704c'];
const HAIR = ['#2a1c14', '#3e2a1c', '#5a3a24', '#8a6040', '#b89060', '#d8d2c8', '#9a9690', '#1a1410'];
const SHIRT = ['#f5f1e8', '#f5f1e8', '#f5f1e8', '#f0ebe0', '#eae4d6']; // fiesta whites
const COLOUR = ['#c0392b', '#2e6f9e', '#d68a2a', '#4e7a3a', '#7a4a8a', '#3a4a5a', '#b85a7a', '#e0c070'];

// Build the audience once: who sits where, and what they look like.
function build(seed = 7) {
  const rng = makeRng(seed);
  const people = [];
  const rows = 6;
  for (let r = 0; r < rows; r++) {
    const x = COURT.w + 3.5 + r * 1.0 + 0.5, z = 0.35 + r * 0.5;
    for (let y = -0.4; y < COURT.l + 8; y += 0.55 + rng.next() * 0.2) {
      if (rng.chance(0.07)) { y += 0.3; continue; } // an empty seat
      const age = rng.next();
      const kid = age < 0.14, old = age > 0.85;
      const woman = rng.chance(0.5);
      people.push({
        r, kid, x: x + rng.range(-0.1, 0.1), y, z,
        s: kid ? 0.72 : rng.range(0.93, 1.07),
        skin: rng.pick(SKIN),
        hair: old ? rng.pick(['#d8d2c8', '#b8b2a8', '#9a9690']) : rng.pick(HAIR.slice(0, 6)),
        long: woman && !old && rng.chance(0.6), bun: woman && (old || rng.chance(0.2)), curls: rng.chance(0.15),
        bald: !woman && old && rng.chance(0.5),
        txapela: !woman && (old ? rng.chance(0.6) : rng.chance(0.12)),
        shirt: rng.chance(0.78) ? rng.pick(SHIRT) : rng.pick(COLOUR),
        panuelo: rng.chance(0.65), sash: rng.chance(0.4),
        glasses: old && rng.chance(0.4),
        beard: !woman && !kid && rng.chance(0.15),
        fan: woman && rng.chance(0.2),
        standing: r === rows - 1 && rng.chance(0.25),
        phase: rng.next() * 10, eager: rng.range(0.4, 1.2), talk: rng.chance(0.18) ? rng.pick([-1, 1]) : 0,
      });
    }
  }
  // Farther first, so nearer people overlap them.
  people.sort((a, b) => a.r - b.r || b.y - a.y);
  for (const p of people) [p.sx, p.sy, p.u] = project(p.x, p.y, p.z);
  return people;
}

let audience = null;

// mood: { cheer: 0..1 (after a point), clap: 0..1 (a long rally), ball: {x,y,z} }
export function drawCrowd(ctx, t, light, mood = {}) {
  audience = audience ?? build();
  const L = LIGHTS[light];
  const [bx] = mood.ball ? project(mood.ball.x, mood.ball.y, mood.ball.z) : [480];
  const dim = light === 'night' ? 0.35 : light === 'sunset' ? 0.08 : 0;
  const tint = light === 'night' ? '#1a2040' : '#6a3a50';
  const col = (c) => (dim ? mix(c, tint, dim) : c);
  for (const p of audience) {
    // At sunset the church shades the near end of the stands, softly.
    const shadeK = light === 'sunset' ? Math.max(0, Math.min(0.3, (14 - p.y) / 40)) : 0;
    const c = shadeK ? (x) => mix(col(x), '#4a2a5a', shadeK) : col;
    person(ctx, p, t, c, bx, mood);
  }
  if (L.floods) {
    // Floodlight spill on the near rows.
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const [fx, fy] = project(COURT.w + 5, 20, 2);
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 260);
    g.addColorStop(0, 'rgba(255,236,190,0.12)'); g.addColorStop(1, 'rgba(255,236,190,0)');
    ctx.fillStyle = g; ctx.fillRect(fx - 260, fy - 260, 520, 520);
    ctx.restore();
  }
}

function person(ctx, p, t, col, ballX, mood) {
  const u = p.u * p.s, ph = t * 1.3 + p.phase;
  // Up on their feet after a point, bouncing; clapping during long rallies.
  const up = (mood.cheer ?? 0) * p.eager > 0.6 || p.standing;
  const jump = up && mood.cheer > 0 ? Math.abs(Math.sin(t * 7 + p.phase)) * 0.12 * mood.cheer : 0;
  const rise = (up ? 0.42 : 0) + jump;
  const clapping = !up && (mood.clap ?? 0) * p.eager > 0.35;
  // Heads follow the ball (they face left, toward the court).
  const look = Math.max(-1, Math.min(1, (ballX - p.sx) / 260));
  const turn = p.talk && Math.sin(ph * 0.4) > 0.6 ? p.talk : look * 0.6 - 0.4;
  const breathe = Math.sin(ph) * 0.006;
  ctx.save();
  ctx.translate(p.sx, p.sy); ctx.scale(u, u);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const base = -rise;
  // Standing up, the lower body shows as more shirt and trousers above the row in front.
  if (up) {
    ctx.fillStyle = col(p.kid ? '#4a5a7a' : '#ece6da');
    ctx.beginPath(); ctx.moveTo(-0.19, base + 0.02); ctx.lineTo(-0.17, 0.02); ctx.lineTo(0.18, 0.02); ctx.lineTo(0.2, base + 0.02); ctx.fill();
  }
  // Torso: a shirt shaded from the light, a sash for some.
  const sh = col(p.shirt);
  const g = ctx.createLinearGradient(-0.24, 0, 0.24, 0);
  g.addColorStop(0, mix(sh, '#ffffff', 0.15)); g.addColorStop(0.6, sh); g.addColorStop(1, mix(sh, '#2a1a10', 0.25));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-0.2, base + 0.02); ctx.lineTo(-0.22, base - 0.42 + breathe);
  ctx.quadraticCurveTo(-0.02, base - 0.56 + breathe, 0.2, base - 0.44 + breathe);
  ctx.lineTo(0.21, base + 0.02); ctx.closePath(); ctx.fill();
  if (p.sash) { ctx.fillStyle = col('#b3261e'); ctx.fillRect(-0.21, base - 0.1, 0.42, 0.06); }
  // Arms.
  const skin = col(p.skin);
  ctx.strokeStyle = sh; ctx.lineWidth = 0.09;
  if (up) {
    // Arms up, waving.
    for (const [sx, k] of [[-0.18, -1], [0.18, 1]]) {
      const w = Math.sin(t * 8 + p.phase + k) * 0.08;
      ctx.beginPath(); ctx.moveTo(sx, base - 0.44); ctx.lineTo(sx + k * 0.1 + w, base - 0.72); ctx.lineTo(sx + k * 0.12 + w, base - 0.95); ctx.stroke();
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(sx + k * 0.12 + w, base - 0.98, 0.045, 0, Math.PI * 2); ctx.fill();
    }
  } else if (clapping) {
    const c = Math.abs(Math.sin(t * 9 + p.phase)) * 0.07;
    for (const k of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(k * 0.18, base - 0.42); ctx.lineTo(k * 0.12, base - 0.26); ctx.lineTo(-0.1 + k * (0.035 + c), base - 0.36); ctx.stroke();
    }
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(-0.1 - 0.04 - 0.035, base - 0.36, 0.04, 0, Math.PI * 2); ctx.arc(-0.1 + 0.04 + 0.035, base - 0.36, 0.04, 0, Math.PI * 2); ctx.fill();
  } else if (p.fan) {
    // Fanning herself.
    const f = Math.sin(t * 6 + p.phase) * 0.3;
    ctx.beginPath(); ctx.moveTo(-0.18, base - 0.42); ctx.lineTo(-0.24, base - 0.24); ctx.lineTo(-0.2, base - 0.5); ctx.stroke();
    ctx.save(); ctx.translate(-0.2, base - 0.52); ctx.rotate(f - 0.4);
    ctx.fillStyle = col('#c0392b'); ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 0.14, -Math.PI * 0.85, -Math.PI * 0.15); ctx.closePath(); ctx.fill();
    ctx.restore();
  } else {
    // Resting: hands on knees.
    ctx.beginPath(); ctx.moveTo(-0.19, base - 0.42); ctx.lineTo(-0.23, base - 0.2); ctx.lineTo(-0.14, base - 0.04); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.19, base - 0.42); ctx.lineTo(0.22, base - 0.2); ctx.lineTo(0.12, base - 0.04); ctx.stroke();
  }
  // A red pañuelo knotted at the neck.
  if (p.panuelo) {
    ctx.fillStyle = col('#c8261e');
    ctx.beginPath(); ctx.moveTo(-0.12, base - 0.5); ctx.lineTo(0.1, base - 0.5); ctx.lineTo(-0.02 + turn * 0.03, base - 0.36); ctx.closePath(); ctx.fill();
  }
  // Head in three-quarter view: the face turns with `turn` (-1 left .. 1 right).
  const hy = base - 0.66 + breathe * 2, hx = turn * 0.02;
  ctx.fillStyle = skin; ctx.fillRect(-0.04, base - 0.58, 0.08, 0.08); // neck
  ctx.beginPath(); ctx.ellipse(hx, hy, 0.105, 0.125, 0, 0, Math.PI * 2); ctx.fill();
  // Ear on the side away from the face.
  ctx.beginPath(); ctx.ellipse(hx - turn * 0.075 + (turn >= 0 ? -0.02 : 0.02), hy + 0.01, 0.02, 0.035, 0, 0, Math.PI * 2); ctx.fill();
  // Face features, shifted toward where they look.
  const fx = hx + turn * 0.055;
  ctx.fillStyle = col('#2a1a10');
  ctx.beginPath(); ctx.arc(fx - 0.03, hy - 0.01, 0.012, 0, Math.PI * 2); ctx.arc(fx + 0.03, hy - 0.01, 0.012, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = mix(skin, '#8a4a30', 0.3); ctx.beginPath(); ctx.ellipse(fx + turn * 0.02, hy + 0.025, 0.012, 0.02, 0, 0, Math.PI * 2); ctx.fill(); // nose
  const open = (up && mood.cheer > 0) || (p.talk && Math.sin(ph * 0.4) > 0.6 && Math.sin(t * 12) > 0);
  ctx.fillStyle = col('#7a2a20');
  ctx.beginPath(); ctx.ellipse(fx, hy + 0.065, 0.025, open ? 0.022 : 0.006, 0, 0, Math.PI * 2); ctx.fill();
  if (p.glasses) { ctx.strokeStyle = col('#3a3a3a'); ctx.lineWidth = 0.012; ctx.beginPath(); ctx.arc(fx - 0.03, hy - 0.01, 0.025, 0, Math.PI * 2); ctx.arc(fx + 0.03, hy - 0.01, 0.025, 0, Math.PI * 2); ctx.stroke(); }
  if (p.beard) { ctx.fillStyle = col(p.hair); ctx.beginPath(); ctx.ellipse(fx, hy + 0.07, 0.075, 0.05, 0, 0, Math.PI); ctx.fill(); }
  // Hair on the back of the head (the side away from the face).
  const hair = col(p.hair);
  ctx.fillStyle = hair;
  if (!p.bald) {
    ctx.beginPath(); ctx.ellipse(hx - turn * 0.03, hy - 0.05, 0.11, 0.085, 0, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx - turn * 0.06, hy - 0.01, 0.07, 0.09, 0, 0, Math.PI * 2); ctx.fill();
    if (p.long) { ctx.beginPath(); ctx.ellipse(hx - turn * 0.06, hy + 0.08, 0.08, 0.12, 0, 0, Math.PI * 2); ctx.fill(); }
    if (p.bun) { ctx.beginPath(); ctx.arc(hx - turn * 0.1, hy - 0.08, 0.05, 0, Math.PI * 2); ctx.fill(); }
    if (p.curls) for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(hx - 0.08 + k * 0.04, hy - 0.1, 0.035, 0, Math.PI * 2); ctx.fill(); }
  } else {
    ctx.beginPath(); ctx.ellipse(hx - turn * 0.07, hy + 0.01, 0.05, 0.07, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (p.txapela) {
    ctx.fillStyle = col('#16161e');
    ctx.beginPath(); ctx.ellipse(hx - 0.01, hy - 0.1, 0.14, 0.05, -0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(hx - 0.01, hy - 0.15, 0.012, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function resetCrowd() { audience = null; }
