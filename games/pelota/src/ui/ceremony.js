// The crowning: the champion stands on the court facing the crowd, the judge
// sets the txapela on their head, the beaten rival claps beside them and
// confetti falls. Front-facing figures, painted smooth like the rest.

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
function rgb(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) { const A = rgb(a), B = rgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }

// A person facing us, feet at (x, y), `u` pixels per metre.
// look: { shirt, skin, hair, hairStyle, beret (null | 'on'), moustache, sash }
// arms: { l: [shoulderAngle, elbowBend], r: [...] } in radians, 0 = hanging down.
function person(g, x, y, u, look, arms, opts = {}) {
  const skin = look.skin, skinD = mix(skin, '#6a3a20', 0.25), shirt = look.shirt, shirtD = mix(shirt, '#1a120c', 0.25);
  const white = '#f5f2ea', whiteD = '#d8d2c4';
  const bob = opts.bob ?? 0;
  g.save(); g.translate(x, y); g.scale(u, u); g.lineCap = 'round'; g.lineJoin = 'round';
  // Shadow.
  const sh = g.createRadialGradient(0, 0, 0, 0, 0, 0.55);
  sh.addColorStop(0, 'rgba(20,12,6,0.45)'); sh.addColorStop(1, 'rgba(20,12,6,0)');
  g.save(); g.scale(1, 0.2); g.fillStyle = sh; g.beginPath(); g.arc(0, 0, 0.55, 0, Math.PI * 2); g.fill(); g.restore();
  const hip = -0.95 + bob, top = hip - 0.56;
  // Legs: white trousers, shoes.
  for (const s of [-1, 1]) {
    g.strokeStyle = s < 0 ? whiteD : white; g.lineWidth = 0.17;
    g.beginPath(); g.moveTo(s * 0.09, hip); g.lineTo(s * 0.11, -0.47 + bob / 2); g.lineTo(s * 0.12, -0.06); g.stroke();
    g.fillStyle = '#f4f2ec'; g.beginPath(); g.ellipse(s * 0.13, -0.035, 0.085, 0.045, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3a3230'; g.fillRect(s * 0.13 - 0.08, -0.02, 0.16, 0.02);
  }
  g.fillStyle = white; g.beginPath(); g.roundRect(-0.19, hip - 0.06, 0.38, 0.16, 0.05); g.fill();
  // Arms behind the torso first where they hang down.
  const arm = (side, [a1, a2], front) => {
    if (front !== (a1 > 1.2 || a2 < -1)) return null; // raised arms, and hands brought together, are in front
    const sx = side * 0.22, sy = top + 0.06;
    const ex = sx + side * Math.sin(a1) * 0.28, ey = sy + Math.cos(a1) * 0.28;
    const hx = ex + side * Math.sin(a1 + a2) * 0.26, hy = ey + Math.cos(a1 + a2) * 0.26;
    g.strokeStyle = shirt; g.lineWidth = 0.1; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + (ex - sx) * 0.45, sy + (ey - sy) * 0.45); g.stroke(); // sleeve
    g.strokeStyle = skin; g.lineWidth = 0.085; g.beginPath(); g.moveTo(sx + (ex - sx) * 0.4, sy + (ey - sy) * 0.4); g.lineTo(ex, ey); g.lineTo(hx, hy); g.stroke();
    g.fillStyle = look.tape ? '#fbf9f4' : skin; g.beginPath(); g.arc(hx, hy, 0.055, 0, Math.PI * 2); g.fill();
    return [hx, hy];
  };
  const hands = {};
  hands.l = arm(-1, arms.l, false) ?? hands.l;
  hands.r = arm(1, arms.r, false) ?? hands.r;
  // Torso: shirt with shading and a placket.
  const tg = g.createLinearGradient(-0.25, 0, 0.25, 0);
  tg.addColorStop(0, shirtD); tg.addColorStop(0.45, shirt); tg.addColorStop(1, mix(shirt, '#fff4e0', 0.18));
  g.fillStyle = tg;
  g.beginPath();
  g.moveTo(-0.18, hip + 0.02); g.lineTo(-0.2, top + 0.22); g.quadraticCurveTo(-0.24, top + 0.02, -0.14, top - 0.01);
  g.quadraticCurveTo(0, top + 0.04, 0.14, top - 0.01); g.quadraticCurveTo(0.24, top + 0.02, 0.2, top + 0.22); g.lineTo(0.18, hip + 0.02); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 0.012; g.beginPath(); g.moveTo(0, top + 0.03); g.lineTo(0, top + 0.2); g.stroke();
  if (look.sash) { g.fillStyle = look.sash; g.fillRect(-0.19, hip - 0.08, 0.38, 0.08); }
  if (look.panuelo) { g.fillStyle = '#c8261e'; g.beginPath(); g.moveTo(-0.08, top); g.lineTo(0.08, top); g.lineTo(0, top + 0.12); g.fill(); }
  // Neck and head.
  g.fillStyle = skinD; g.fillRect(-0.045, top - 0.1, 0.09, 0.11);
  const hx = 0, hy = top - 0.2;
  g.fillStyle = skin; g.beginPath(); g.ellipse(hx, hy, 0.11, 0.13, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(hx - 0.108, hy + 0.01, 0.022, 0.04, 0, 0, Math.PI * 2); g.ellipse(hx + 0.108, hy + 0.01, 0.022, 0.04, 0, 0, Math.PI * 2); g.fill();
  // Hair.
  g.fillStyle = look.hair;
  if (look.bald) { g.beginPath(); g.ellipse(hx - 0.1, hy - 0.01, 0.025, 0.06, 0, 0, Math.PI * 2); g.ellipse(hx + 0.1, hy - 0.01, 0.025, 0.06, 0, 0, Math.PI * 2); g.fill(); }
  else { g.beginPath(); g.moveTo(hx - 0.112, hy - 0.01); g.quadraticCurveTo(hx - 0.12, hy - 0.15, hx, hy - 0.145); g.quadraticCurveTo(hx + 0.12, hy - 0.15, hx + 0.112, hy - 0.01); g.quadraticCurveTo(hx + 0.07, hy - 0.08, hx, hy - 0.085); g.quadraticCurveTo(hx - 0.07, hy - 0.08, hx - 0.112, hy - 0.01); g.fill(); }
  // Face: a real expression.
  const e = opts.face ?? 'smile';
  g.fillStyle = '#2a1a10';
  for (const s of [-1, 1]) {
    if (e === 'joy') { g.strokeStyle = '#2a1a10'; g.lineWidth = 0.014; g.beginPath(); g.arc(hx + s * 0.042, hy - 0.005, 0.018, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
    else { g.beginPath(); g.ellipse(hx + s * 0.042, hy - 0.01, 0.012, 0.016, 0, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = mix(look.hair, '#2a1a10', 0.3); g.lineWidth = 0.012; g.beginPath(); g.moveTo(hx + s * 0.022, hy - 0.045); g.lineTo(hx + s * 0.065, hy - 0.05); g.stroke();
  }
  g.fillStyle = skinD; g.beginPath(); g.moveTo(hx, hy - 0.005); g.lineTo(hx - 0.014, hy + 0.035); g.lineTo(hx + 0.012, hy + 0.035); g.fill();
  if (look.moustache) { g.fillStyle = look.hair; g.beginPath(); g.ellipse(hx, hy + 0.05, 0.045, 0.014, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#8a3a2a';
  if (e === 'joy') { g.beginPath(); g.moveTo(hx - 0.04, hy + 0.06); g.quadraticCurveTo(hx, hy + 0.12, hx + 0.04, hy + 0.06); g.closePath(); g.fill(); }
  else { g.strokeStyle = '#8a3a2a'; g.lineWidth = 0.012; g.beginPath(); g.arc(hx, hy + 0.045, 0.035, 0.3, Math.PI - 0.3); g.stroke(); }
  g.fillStyle = 'rgba(220,110,90,0.2)'; g.beginPath(); g.arc(hx - 0.07, hy + 0.035, 0.022, 0, Math.PI * 2); g.arc(hx + 0.07, hy + 0.035, 0.022, 0, Math.PI * 2); g.fill();
  if (look.beret) txapela(g, hx, hy - 0.12, 1, 0);
  // Raised arms in front.
  hands.l = arm(-1, arms.l, true) ?? hands.l;
  hands.r = arm(1, arms.r, true) ?? hands.r;
  g.restore();
  return { head: [x + hx * u, y + hy * u], hands, u };
}

// A txapela in metres: a wide flat black beret with a little stalk (txirtena) on top.
function txapela(g, x, y, s = 1, tilt = -0.08, big = false) {
  g.save(); g.translate(x, y); g.rotate(tilt); g.scale(s, s);
  const w = big ? 0.2 : 0.15;
  const gr = g.createRadialGradient(-0.03, -0.03, 0.01, 0, 0, w * 1.1);
  gr.addColorStop(0, '#3e3e4a'); gr.addColorStop(1, '#0e0e14');
  g.fillStyle = gr;
  g.beginPath(); g.ellipse(0, 0, w, w * 0.34, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(0.01, -0.012, w * 0.85, w * 0.3, 0, Math.PI, 0); g.fill();
  g.strokeStyle = '#0e0e14'; g.lineWidth = 0.012; g.beginPath(); g.moveTo(0.01, -w * 0.3); g.lineTo(0.014, -w * 0.3 - 0.03); g.stroke();
  g.restore();
}

// t: seconds since the screen opened. Returns nothing; draws the whole group.
export function drawCrowning(g, t, { floor = 470, u = 118 } = {}) {
  const cx = 480;
  // A pool of light on the court where they stand.
  const pool = g.createRadialGradient(cx, floor, 10, cx, floor, 360);
  pool.addColorStop(0, 'rgba(255,236,190,0.35)'); pool.addColorStop(1, 'rgba(255,236,190,0)');
  g.fillStyle = pool; g.beginPath(); g.ellipse(cx, floor, 360, 90, 0, 0, Math.PI * 2); g.fill();
  // The txapela comes down between 0.6 s and 2.2 s, then the champion's arms go up.
  const k = ease(Math.max(0, Math.min(1, (t - 0.6) / 1.6)));
  const crowned = k >= 1, joyT = Math.max(0, t - 2.2);
  const bounce = crowned ? Math.abs(Math.sin(joyT * 6)) * 0.03 * Math.exp(-joyT * 0.4) : 0;
  // The beaten rival, a step back, clapping.
  // Clapping: forearms folded in so the hands meet in front of the chest.
  const clap = Math.abs(Math.sin(t * 8)) * 0.3;
  person(g, cx + 250, floor - 8, u * 0.94, { shirt: '#2f72b0', skin: '#d9a47c', hair: '#1e1612', moustache: true, sash: '#1c4a78', tape: true },
    { l: [0.25, -2.45 + clap], r: [0.25, -2.45 + clap] }, { face: 'smile' });
  // The judge, beside the champion: white shirt, red pañuelo and sash, a txapela of his own.
  const reach = lerp(1.95, 0.9, k);
  const judge = person(g, cx - 150, floor, u, { shirt: '#f4f0e8', skin: '#e2ae88', hair: '#8a8a88', bald: true, moustache: true, sash: '#b3261e', panuelo: true, beret: 'on' },
    { l: [0.25, 0.3], r: [crowned ? 0.35 : reach, crowned ? 0.3 : 0.45] }, { face: 'smile' });
  // The champion.
  const up = crowned ? Math.min(1, joyT * 3) : 0;
  const champ = person(g, cx, floor, u, { shirt: '#c8342a', skin: '#e6b48c', hair: '#4a3222', sash: '#8a2018', tape: true, beret: crowned ? 'on' : null },
    { l: [lerp(0.2, 2.9, up), lerp(0.3, 0.2, up)], r: [lerp(0.2, 2.9, up), lerp(0.3, 0.2, up)] }, { face: crowned ? 'joy' : 'smile', bob: -bounce });
  // Until it's on, the txapela is in the judge's hand, travelling to the champion's head.
  if (!crowned) {
    const [hx, hy] = judge.hands.r ?? [0, 0];
    const from = [cx - 150 + hx * u, floor + hy * u - 0.05 * u];
    const to = [champ.head[0], champ.head[1] - 0.12 * u];
    const at = [lerp(from[0], to[0], k), lerp(from[1], to[1], k) - Math.sin(k * Math.PI) * 12];
    g.save(); g.translate(at[0], at[1]); g.scale(u, u); txapela(g, 0, 0, 1, -0.2 + k * 0.12); g.restore();
  }
}
