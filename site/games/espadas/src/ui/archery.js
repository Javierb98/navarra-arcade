import { arcadeKey } from './minigames.js';
// The volley minigame, after 1066's archery. A side view along the line of
// fire: your company on the left, whoever stands in the way beyond. Drag back
// to draw: the angle sets the arc, the length of the pull the power. Release
// and the whole company looses: a shower of missiles, each on its own arc,
// spreading more the higher and longer it flies. Every soldier on the field
// has a hitbox; what a missile strikes is what it hurts, friend or foe.
//
// Resolves to { hits: [{ k, frac }] } (see Battle.volley) or null to aim
// automatically.

import { h } from './dom.js';
import { t } from './i18n.js';
import { Scene } from './scene.js';
import { viewUnit } from './board.js';
import { unitLabel } from './playback.js';
import { COUNTDOWN, drawCountdown } from './minigames.js';

const GRAVITY = 950;                 // px/s², tuned for a satisfying hang time
const lastAim = new Map();           // shooter id -> { mid, arc } of its last volley, as a memory aid

// How each missile weapon looses: missiles per man, speed, spread, looks.
const WEAPONS = {
  javelin: { per: 2, speed: 1.0, spread: 1.2, len: 30, kind: 'javelin', stagger: 260 },
  bow: { per: 3, speed: 1.08, spread: 1.0, len: 20, kind: 'arrow', stagger: 200 },
  crossbow: { per: 2, speed: 1.2, spread: 0.6, len: 14, kind: 'bolt', stagger: 320 },
  sling: { per: 2, speed: 1.05, spread: 1.3, len: 0, kind: 'stone', stagger: 240 },
};

export function aimVolley({ host, data, battle, request, speed }) {
  const shooter = battle.byId(request.shooter);
  const target = battle.byId(request.target);
  const line = request.line;
  const n = line.length + 1; // the throwers' own square at 0
  const cellAtK = (k) => (k === 0 ? shooter : line[k - 1]);
  const strip = { w: n, h: 1, at: (x) => { const c = cellAtK(x); return battle.grid.at(c.x, c.y); } };
  const W = 1200, H = 360;
  const scene = new Scene(strip, { width: W, height: H, horizon: 0.3 });
  const cellPx = W / n;
  scene.lift = () => cellPx * 0.12;
  scene.ground = scene.paintGround();
  scene.figure = Math.max(2.2, Math.min(3, 26 / n));
  scene.label = { text: t('phase.aim'), colour: '#8e2f1c' };

  // Who stands along the line (the enemy's hidden companies stay unseen).
  const units = new Map();
  const place = (u, k) => {
    const v = viewUnit(data, u, battle.sides[u.side].factionId);
    v.x = k; v.y = 0; v.facing = u.side === shooter.side ? 1 : -1;
    v.hidden = u.side === shooter.side ? false : u.hidden;
    v.k = k;
    units.set(u.id, v);
  };
  place(shooter, 0);
  line.forEach((c, i) => {
    const o = battle.unitAt(c.x, c.y);
    if (o && o !== shooter) place(o, i + 1);
  });

  const weapon = WEAPONS[shooter.kind.weapon ?? (shooter.kind.role === 'skirmisher' ? 'javelin' : 'bow')] ?? WEAPONS.bow;
  // Full draw at 45° carries the missile to the unit's range plus a margin.
  const reachPx = (request.maxRange + 0.3) * cellPx;
  const vmax = Math.sqrt(GRAVITY * reachPx) * weapon.speed;
  // A gust along the row: + helps the volley on, - holds it back. Heavy
  // crossbow bolts feel it least, sling stones and arrows most.
  const WIND = (Math.random() * 2 - 1) * 170 * (weapon.kind === 'bolt' ? 0.5 : 1);
  const groundAt = (px) => scene.groundY(0, px / cellPx - 0.5);

  let angle = 42;
  let power = 0.6;
  let drag = null;
  let missiles = null;   // in flight or landed
  let loosedAt = 0;
  let result = null;
  const sparks = [];

  const canvas = scene.canvas;
  canvas.classList.add('aim-canvas');
  const tip = h('p', { class: 'aim-tip' }, t('aim.tip', { a: unitLabel(shooter), d: unitLabel(target) }));
  const autoBtn = h('button', { class: 'ghost dark' }, t('mini.auto'));
  const overlay = h('div', { class: 'aim-overlay', tabindex: '0' }, canvas, h('div', { class: 'aim-bar' }, tip, autoBtn));
  host.append(overlay);
  overlay.focus();

  // Hitboxes: every standing soldier of every company on the line.
  function hitboxes() {
    const out = [];
    for (const [id, v] of units) {
      if (id === shooter.id || v.hidden) continue;
      const c = scene.crowds.get(id);
      if (!c) continue;
      const s = scene.scaleAt(0) * scene.figure;
      const mounted = v.role === 'cavalry' || (v.role === 'leader' && v.kind.tags.includes('cavalry'));
      for (const f of c.figs) {
        if (f.fallT) continue;
        const gy = groundAt(f.x) + f.dy;
        out.push({
          id, k: v.k, side: v.side, c,
          x0: f.x - (mounted ? 13 : 4.5) * s, x1: f.x + (mounted ? 13 : 4.5) * s,
          y0: gy - (mounted ? 36 : 31) * s, y1: gy,
        });
      }
    }
    return out;
  }

  let openedAt = null;
  const ready = () => openedAt !== null && performance.now() - openedAt >= COUNTDOWN;

  function loose() {
    if (!ready() || missiles || result) return;
    loosedAt = performance.now();
    const c = scene.crowds.get(shooter.id);
    const s = scene.scaleAt(0) * scene.figure;
    const men = c ? c.figs.filter((f) => !f.fallT) : [{ x: scene.colX(0), dy: 0 }];
    const rad = (angle * Math.PI) / 180;
    // Higher, longer arcs scatter more: jitter grows with the time aloft.
    const spreadDeg = weapon.spread * (1.6 + 5 * Math.sin(rad) * power);
    const spreadPow = weapon.spread * (0.03 + 0.05 * power);
    missiles = [];
    let i = 0;
    for (const m of men) {
      for (let j = 0; j < weapon.per; j++, i++) {
        const a = rad + ((Math.random() + Math.random() - 1) * spreadDeg * Math.PI) / 180;
        const v = vmax * Math.max(0.05, power) * (1 + (Math.random() + Math.random() - 1) * spreadPow);
        missiles.push({
          x: m.x + 4 * s, y: groundAt(m.x) + (m.dy ?? 0) - 24 * s,
          vx: Math.cos(a) * v, vy: -Math.sin(a) * v,
          delay: (i / (men.length * weapon.per)) * weapon.stagger + Math.random() * 60,
          state: 'wait', trail: [],
        });
      }
    }
  }

  return new Promise((resolve) => {
    let running = true;
    let last = performance.now();
    const finish = (value) => {
      if (!running) return;
      running = false;
      stopHeld?.();
      overlay.remove();
      resolve(value);
    };
    autoBtn.addEventListener('click', () => finish(null));

    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    };
    canvas.addEventListener('pointerdown', (e) => { if (missiles || !ready()) return; canvas.setPointerCapture(e.pointerId); drag = pos(e); });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag || missiles) return;
      const p = pos(e);
      const dx = drag.x - p.x, dy = p.y - drag.y;
      const len = Math.hypot(dx, dy);
      if (len < 4) return;
      angle = Math.max(5, Math.min(80, (Math.atan2(dy, Math.max(1, dx)) * 180) / Math.PI));
      power = Math.max(0.05, Math.min(1, len / 260));
    });
    canvas.addEventListener('pointerup', () => { if (drag && !missiles) loose(); drag = null; });
    const held = { up: false, down: false, left: false, right: false };
    const release = (e) => { const k = arcadeKey(e); if (k in held) held[k] = false; };
    addEventListener('keyup', release);
    const stopHeld = () => removeEventListener('keyup', release);
    overlay.addEventListener('keydown', (e) => {
      // Stick to aim, A (or Space/Enter) to loose: arcade cabinet buttons.
      // Holding the stick turns the aim smoothly (see the frame loop), so it
      // works the same on a cabinet, a keyboard or the on-screen pad.
      const k = arcadeKey(e);
      if (k === 'up' || k === 'down' || k === 'left' || k === 'right') held[k] = true;
      else if (k === 'a') { if (!e.repeat && !missiles && ready()) loose(); }
      else if (e.key === 'Escape') finish(null);
      else return;
      e.preventDefault();
      e.stopPropagation();
    });

    const settle = () => {
      const total = missiles.length;
      const byK = new Map();
      let friendly = 0, onTarget = 0;
      for (const m of missiles) {
        if (m.state !== 'hit') continue;
        byK.set(m.k, (byK.get(m.k) ?? 0) + 1);
        if (m.side === shooter.side) friendly++; else onTarget++;
      }
      const landed = missiles.filter((m) => m.state !== 'gone');
      const mid = landed.length ? landed.reduce((a, m) => a + m.x, 0) / landed.length : 0;
      const lead = missiles[Math.floor(missiles.length / 2)];
      lastAim.set(shooter.id, { mid, arc: lead?.path ?? [] });
      const verdict = onTarget && onTarget >= friendly ? 'aim.hit' : friendly ? 'aim.friendly' : mid < scene.colX(0.6) ? 'aim.short' : 'aim.miss';
      result = { verdict, onTarget, friendly, at: mid, hits: [...byK].map(([k, c]) => ({ k, frac: c / total })) };
      setTimeout(() => finish({ hits: result.hits }), speed() === 0 ? 400 : 1300);
    };

    const loop = (now) => {
      if (!running) return;
      openedAt ??= now;
      try { frame(now); } catch (err) { console.error(err); finish(null); return; }
      requestAnimationFrame(loop);
    };
    const frame = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      if (!missiles) {
        // Stick held: up/down raise and lower the arc, right/left pull harder or ease off.
        angle = Math.max(5, Math.min(80, angle + ((held.up ? 1 : 0) - (held.down ? 1 : 0)) * 38 * dt));
        power = Math.max(0.05, Math.min(1, power + ((held.right ? 1 : 0) - (held.left ? 1 : 0)) * 0.55 * dt));
      }
      last = now;
      scene.draw(units, [], now);
      const g = scene.ctx;

      // Where the last volley fell, as a memory aid.
      const prev = lastAim.get(shooter.id);
      if (prev && !missiles) {
        // The ghost of the last volley's arc, and an X where it came down.
        g.save();
        g.strokeStyle = 'rgba(251,246,234,0.35)'; g.lineWidth = 1.5; g.setLineDash([4, 6]);
        g.beginPath();
        prev.arc.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.stroke(); g.setLineDash([]);
        g.strokeStyle = 'rgba(251,246,234,0.6)'; g.lineWidth = 2;
        const px = prev.mid, py = groundAt(px) + 8;
        g.beginPath(); g.moveTo(px - 6, py - 6); g.lineTo(px + 6, py + 6); g.moveTo(px + 6, py - 6); g.lineTo(px - 6, py + 6); g.stroke();
        g.restore();
      }
      // The wind: a pennant streaming with it, and its strength.
      {
        const wx = W - 110, wy = 150, str = Math.abs(WIND) / 170, dir = Math.sign(WIND) || 1;
        g.save();
        g.fillStyle = 'rgba(12,9,6,0.75)'; g.fillRect(wx - 40, wy - 30, 120, 52);
        g.strokeStyle = '#fbf3de'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(wx, wy + 14); g.lineTo(wx, wy - 22); g.stroke();
        const len = 12 + 26 * str, flap = Math.sin(now / 90) * (2 + 4 * str);
        g.fillStyle = '#e6b534';
        g.beginPath(); g.moveTo(wx, wy - 22); g.lineTo(wx + dir * len, wy - 16 + flap); g.lineTo(wx, wy - 10); g.closePath(); g.fill();
        g.fillStyle = '#fbf3de'; g.font = '12px Optima, serif'; g.textAlign = 'left';
        const arrows = (dir > 0 ? '›' : '‹').repeat(Math.round(str * 3)) || '·';
        g.fillText(`${t('aim.wind')} ${arrows}`, wx + 14, wy + 14);
        g.restore();
      }

      if (!missiles) {
        // The drawn bow: angle, power, and only the first stretch of the arc.
        const c = scene.crowds.get(shooter.id);
        const ox = (c?.figs[0]?.x ?? scene.colX(0)) + 8, oy = groundAt(ox) - 40;
        const rad = (angle * Math.PI) / 180;
        const v = vmax * Math.max(0.05, power);
        g.save();
        g.fillStyle = 'rgba(251,243,222,0.85)';
        for (let i = 1; i <= 14; i++) {
          const tt = i * 0.028;
          g.beginPath();
          g.arc(ox + Math.cos(rad) * v * tt, oy - Math.sin(rad) * v * tt + 0.5 * GRAVITY * tt * tt, 2.4 - i * 0.12, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = 'rgba(12,9,6,0.8)';
        g.fillRect(ox - 36, oy + 38, 72, 10);
        g.fillStyle = power > 0.85 ? '#e2694f' : '#e6b534';
        g.fillRect(ox - 34, oy + 40, 68 * power, 6);
        g.fillStyle = '#fbf3de'; g.font = '13px Optima, serif'; g.textAlign = 'center';
        g.fillText(`${Math.round(angle)}°`, ox + Math.cos(rad) * 70, oy - Math.sin(rad) * 70 - 8);
        g.restore();
      } else {
        const since = now - loosedAt;
        const boxes = hitboxes();
        let busy = false;
        for (const m of missiles) {
          if (m.state === 'wait') { if (since >= m.delay) m.state = 'fly'; else { busy = true; continue; } }
          if (m.state !== 'fly') continue;
          busy = true;
          // Sub-steps, so fast missiles cannot pass through a soldier.
          for (let k = 0; k < 3 && m.state === 'fly'; k++) {
            const st = dt / 3;
            m.vy += GRAVITY * st;
            m.vx += WIND * st;
            m.x += m.vx * st;
            m.y += m.vy * st;
            if (m.vy > 0) {
              const hit = boxes.find((b) => m.x >= b.x0 && m.x <= b.x1 && m.y >= b.y0 && m.y <= b.y1);
              if (hit) {
                m.state = 'hit'; m.k = hit.k; m.side = hit.side; m.stuckAt = now;
                hit.c.hitT = now;
                sparks.push({ x: m.x, y: m.y, t0: now, friendly: hit.side === shooter.side });
                break;
              }
            }
            if (m.y >= groundAt(m.x) + 4) {
              m.state = 'ground'; m.y = groundAt(m.x) + 4; m.stuckAt = now;
              sparks.push({ x: m.x, y: m.y, t0: now, dust: true });
            } else if (m.x > W + 40 || m.x < -40) m.state = 'gone';
          }
          m.trail.push([m.x, m.y]);
          if (m.trail.length > 6) m.trail.shift();
          (m.path ??= []).push([m.x, m.y]);
        }
        for (const m of missiles) if (m.state !== 'wait' && m.state !== 'gone') drawMissile(g, m, weapon);
        if (!busy && !result) settle();
      }

      // Impacts: dust where missiles bite the ground, a flash where they strike.
      for (const s of sparks) {
        const p = (now - s.t0) / 450;
        if (p > 1) continue;
        g.save();
        g.globalAlpha = 1 - p;
        g.fillStyle = s.dust ? '#b9a27a' : s.friendly ? '#ff8a6a' : '#fff1c4';
        g.beginPath(); g.arc(s.x, s.y - (s.dust ? p * 6 : 0), (s.dust ? 3 + p * 7 : 2 + p * 4), 0, Math.PI * 2); g.fill();
        g.restore();
      }

      if (result) {
        g.save();
        g.textAlign = 'center';
        const x = Math.max(120, Math.min(W - 120, result.at || W / 2));
        g.font = 'bold 30px Optima, "Palatino Linotype", serif';
        g.lineWidth = 5; g.strokeStyle = 'rgba(12,9,6,0.9)';
        const colour = result.verdict === 'aim.hit' ? '#f1cf6a' : result.verdict === 'aim.friendly' ? '#e2694f' : '#fbf3de';
        g.strokeText(t(result.verdict), x, H * 0.42);
        g.fillStyle = colour; g.fillText(t(result.verdict), x, H * 0.42);
        const counts = [];
        if (result.onTarget) counts.push(t('aim.hits', { n: result.onTarget }));
        if (result.friendly) counts.push(t('aim.friendlyHits', { n: result.friendly }));
        if (counts.length) {
          g.font = 'bold 18px Optima, "Palatino Linotype", serif';
          g.lineWidth = 4;
          g.strokeText(counts.join(' · '), x, H * 0.42 + 28);
          g.fillStyle = '#fbf3de'; g.fillText(counts.join(' · '), x, H * 0.42 + 28);
        }
        g.restore();
      }
      drawCountdown(g, W, H, now - openedAt);
    };
    requestAnimationFrame(loop);
  });
}

// A missile along its heading: javelins long, arrows fletched, bolts stubby,
// sling stones round. Stuck ones stay where they bit, tail up.
function drawMissile(g, m, w) {
  const ang = m.state === 'fly' ? Math.atan2(m.vy, m.vx) : (m.angle ??= Math.atan2(m.vy, m.vx));
  g.save();
  if (m.state === 'fly' && m.trail.length > 1) {
    g.strokeStyle = 'rgba(30,22,14,0.18)';
    g.lineWidth = 1;
    g.beginPath();
    m.trail.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  }
  g.translate(m.x, m.y);
  g.rotate(ang);
  g.strokeStyle = '#15110c';
  g.fillStyle = '#15110c';
  if (w.kind === 'stone') {
    g.beginPath(); g.arc(0, 0, 2.2, 0, Math.PI * 2); g.fill();
  } else {
    const L = w.len;
    const sunk = m.state === 'fly' ? 0 : L * 0.3;
    g.lineWidth = w.kind === 'javelin' ? 2.4 : 1.8;
    g.beginPath(); g.moveTo(-L + sunk, 0); g.lineTo(sunk, 0); g.stroke();
    g.beginPath(); g.moveTo(sunk + 3, 0); g.lineTo(sunk - 1, -1.8); g.lineTo(sunk - 1, 1.8); g.fill();
    if (w.kind === 'arrow' || w.kind === 'bolt') {
      g.strokeStyle = '#6b4f2a';
      g.beginPath(); g.moveTo(-L + sunk, 0); g.lineTo(-L + sunk - 3, -2.5); g.moveTo(-L + sunk, 0); g.lineTo(-L + sunk - 3, 2.5); g.stroke();
    }
  }
  g.restore();
}
