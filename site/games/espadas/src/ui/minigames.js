// The charge and fight minigames, after 1066. Each opens over the
// battlefield view as a close side-on scene of the two companies, plays for a
// few seconds, and resolves to a result the engine turns into damage or
// morale (see Battle.minigameQuality). "Auto" resolves to null: average.

import { h } from './dom.js';
import { t } from './i18n.js';
import { Scene } from './scene.js';
import { viewUnit } from './board.js';
import { unitLabel } from './playback.js';

// A close-up strip: attackers on the left, the defender on the right.
function stage({ host, data, battle, attackers, defender, label, colour }) {
  const strip = { w: 4, h: 1, at: (x) => battle.grid.at(x < 2 ? attackers[0].x : defender.x, x < 2 ? attackers[0].y : defender.y) };
  const scene = new Scene(strip, { width: 1200, height: 360, horizon: 0.3 });
  scene.lift = () => 0;
  scene.ground = scene.paintGround();
  scene.figure = 2.4;
  scene.label = { text: label, colour };
  const units = new Map();
  attackers.slice(0, 3).forEach((u, i) => {
    const v = viewUnit(data, u, battle.sides[u.side].factionId);
    v.x = 0.35 + i * 0.4; v.y = 0; v.facing = 1; v.hidden = false;
    units.set(u.id, v);
  });
  const d = viewUnit(data, defender, battle.sides[defender.side].factionId);
  d.x = 2.65; d.y = 0; d.facing = -1; d.hidden = false;
  units.set(defender.id, d);
  const bar = h('div', { class: 'aim-bar' });
  const overlay = h('div', { class: 'aim-overlay', tabindex: '0' }, scene.canvas, bar);
  host.append(overlay);
  overlay.focus();
  return { scene, units, overlay, bar, d, a: [...units.values()].filter((v) => v !== d) };
}

function banner(g, W, H, text, sub, colour = '#f1cf6a', y = 0.3) {
  g.save();
  g.textAlign = 'center';
  g.font = 'bold 34px Optima, "Palatino Linotype", serif';
  g.lineWidth = 6; g.strokeStyle = 'rgba(12,9,6,0.9)';
  g.strokeText(text, W / 2, H * y);
  g.fillStyle = colour; g.fillText(text, W / 2, H * y);
  if (sub) {
    g.font = 'bold 18px Optima, "Palatino Linotype", serif';
    g.lineWidth = 4;
    g.strokeText(sub, W / 2, H * y + 30);
    g.fillStyle = '#fbf3de'; g.fillText(sub, W / 2, H * y + 30);
  }
  g.restore();
}

// Every minigame opens with a 3-second count so nobody is caught off guard.
export const COUNTDOWN = 3000;

export function drawCountdown(g, W, H, elapsed) {
  if (elapsed >= COUNTDOWN) return false;
  const n = Math.ceil((COUNTDOWN - elapsed) / 1000);
  const frac = ((COUNTDOWN - elapsed) % 1000) / 1000;
  g.save();
  g.fillStyle = 'rgba(12,9,6,0.35)';
  g.fillRect(0, 0, W, H);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${Math.round(70 + 30 * frac)}px Optima, "Palatino Linotype", serif`;
  g.globalAlpha = 0.4 + 0.6 * frac;
  g.lineWidth = 8; g.strokeStyle = 'rgba(12,9,6,0.9)';
  g.strokeText(String(n), W / 2, H * 0.45);
  g.fillStyle = '#f1cf6a'; g.fillText(String(n), W / 2, H * 0.45);
  g.globalAlpha = 1;
  g.font = 'bold 18px Optima, "Palatino Linotype", serif';
  g.lineWidth = 4;
  g.strokeText(t('mini.getReady'), W / 2, H * 0.45 + 62);
  g.fillStyle = '#fbf3de'; g.fillText(t('mini.getReady'), W / 2, H * 0.45 + 62);
  g.restore();
  return true;
}

// Frame loop for a minigame. If a frame throws, `onError` ends the game
// (as "let the captains decide") rather than leaving the turn waiting.
function run(loop, onError) {
  let running = true;
  let last = performance.now();
  const frame = (now) => {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    try { loop(now, dt); } catch (err) { running = false; console.error(err); onError?.(); return; }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return () => { running = false; };
}

// ---------------------------------------------------------------------------
// Charge: mash Space (or tap) to drive the charge home.

export function chargeGame({ host, data, battle, request, speed }) {
  const attackers = (request.attackers ?? [request.attacker]).map((id) => battle.byId(id));
  const defender = battle.byId(request.defender);
  const st = stage({ host, data, battle, attackers, defender, label: t(request.formation ? 'mini.formationCharge' : 'mini.charge'), colour: '#8e2f1c' });
  const W = 1200, H = 360;
  const tip = h('p', { class: 'aim-tip' }, t('mini.chargeTip', { a: unitLabel(attackers[0]), d: unitLabel(defender) }));
  const auto = h('button', { class: 'ghost dark' }, t('mini.auto'));
  st.bar.append(tip, auto);
  const DUR = 2600;
  let meter = 0, sum = 0, samples = 0, t0 = null, done = null;
  let started = false;
  const bump = () => { if (started && !done) meter = Math.min(1, meter + 0.11); };

  return new Promise((resolve) => {
    let stop;
    const finish = (v) => { stop(); st.overlay.remove(); resolve(v); };
    auto.addEventListener('click', () => finish(null));
    st.overlay.addEventListener('keydown', (e) => {
      if (arcadeKey(e) === 'a' || e.code === 'KeyC' || e.code === 'KeyQ') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) bump(); }
      else if (e.key === 'Escape') finish(null);
    });
    st.scene.canvas.addEventListener('pointerdown', bump);
    const starts = st.a.map((v) => v.x);
    stop = run((now, dt) => {
      t0 ??= now;
      started = now - t0 >= COUNTDOWN;
      const p = Math.max(0, Math.min(1, (now - t0 - COUNTDOWN) / DUR));
      if (started && !done) {
        meter = Math.max(0, meter - dt * 0.42);
        sum += meter; samples++;
        // The company gathers pace with the meter, reaching the enemy at the end.
        st.a.forEach((v, i) => { v.x = starts[i] + (1.55 - 0.25 * i) * Math.pow(p, 1.6 - meter * 0.6); });
        if (p >= 1) {
          const power = Math.min(1, meter * 0.6 + (sum / samples) * 0.8);
          done = { power, t: now };
          st.scene.crowds.get(defender.id).hitT = now;
          setTimeout(() => finish({ power }), speed() === 0 ? 350 : 1200);
        }
      }
      st.scene.draw(st.units, [], now);
      const g = st.scene.ctx;
      // Charge meter.
      g.save();
      g.fillStyle = 'rgba(12,9,6,0.85)'; g.fillRect(W / 2 - 160, H - 42, 320, 18);
      const grd = g.createLinearGradient(W / 2 - 158, 0, W / 2 + 158, 0);
      grd.addColorStop(0, '#e6b534'); grd.addColorStop(1, '#e2694f');
      g.fillStyle = grd; g.fillRect(W / 2 - 158, H - 40, 316 * meter, 14);
      g.restore();
      if (drawCountdown(g, W, H, now - t0)) { /* waiting */ } else if (!done) {
        const pulse = 1 + Math.sin(now / 70) * 0.06;
        g.save(); g.translate(W / 2, H * 0.3); g.scale(pulse, pulse);
        banner(g, 0, 0, t('mini.mash'), null, '#fbf3de', 0);
        g.restore();
      } else {
        // Impact: a burst of dust and the verdict.
        const q = (now - done.t) / 600;
        if (q < 1) {
          g.save(); g.globalAlpha = 1 - q; g.fillStyle = '#d8c7a0';
          for (let k = 0; k < 8; k++) { g.beginPath(); g.arc(W * 0.62 + Math.cos(k) * 40 * q, H * 0.72 - Math.sin(k * 1.7) * 25 * q, 12 + q * 30, 0, Math.PI * 2); g.fill(); }
          g.restore();
        }
        const key = done.power > 0.75 ? 'mini.chargeGreat' : done.power > 0.4 ? 'mini.chargeGood' : 'mini.chargeWeak';
        banner(g, W, H, t(key), t('mini.power', { n: Math.round(done.power * 100) }));
      }
    }, () => finish(null));
  });
}

// ---------------------------------------------------------------------------
// Fight: hit the arrow keys as the notes cross the line.

const KEYS = ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight'];
const ANGLE = { ArrowRight: 0, ArrowDown: Math.PI / 2, ArrowLeft: Math.PI, ArrowUp: -Math.PI / 2 };

// A bold arrow drawn as a thick shaft and a wide head, easy to read at speed.
function drawArrow(g, x, y, key) {
  g.save();
  g.translate(x, y);
  g.rotate(ANGLE[key]);
  g.fillStyle = '#fbf3de';
  g.strokeStyle = 'rgba(12,9,6,0.85)';
  g.lineWidth = 2;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(-12, -4.5); g.lineTo(2, -4.5); g.lineTo(2, -11); g.lineTo(14, 0);
  g.lineTo(2, 11); g.lineTo(2, 4.5); g.lineTo(-12, 4.5); g.closePath();
  g.stroke(); g.fill();
  g.restore();
}
const GLYPH = { ArrowLeft: '←', ArrowUp: '↑', ArrowDown: '↓', ArrowRight: '→' };

export function fightGame({ host, data, battle, request, speed }) {
  const attacker = battle.byId(request.attacker);
  const defender = battle.byId(request.defender);
  const st = stage({ host, data, battle, attackers: [attacker], defender, label: t('phase.melee'), colour: '#3a3226' });
  st.scene.figure = 1.8;
  st.a[0].x = 1.05; st.d.x = 2.0;
  const W = 1200, H = 360;
  const tip = h('p', { class: 'aim-tip' }, t('mini.fightTip'));
  const auto = h('button', { class: 'ghost dark' }, t('mini.auto'));
  const pads = h('div', { class: 'pads' }, KEYS.map((k) => h('button', { class: 'pad', 'data-k': k, 'aria-label': k }, GLYPH[k])));
  st.bar.append(tip, pads, auto);

  // Notes scroll 25% slower than at first; the gap grows with them so they
  // keep the same spacing on screen.
  const COUNT = 8, LEAD = COUNTDOWN, TRAVEL = 2000, GAP = 690, HIT_X = 200;
  const notes = Array.from({ length: COUNT }, (_, i) => ({ key: KEYS[Math.floor(Math.random() * 4)], at: LEAD + i * GAP + (Math.random() - 0.5) * 120, res: null }));
  const enemySkill = 0.45 + Math.random() * 0.3;
  let mine = 0, theirs = 0, judged = 0, t0 = null, done = null;
  const flashes = [];

  return new Promise((resolve) => {
    let stop;
    const finish = (v) => { stop(); st.overlay.remove(); resolve(v); };
    auto.addEventListener('click', () => finish(null));
    const press = (key) => {
      if (!t0 || done) return;
      const now = performance.now() - t0;
      const n = notes.find((x) => !x.res && Math.abs(x.at - now) < 260);
      if (!n) return;
      const off = Math.abs(n.at - now);
      n.res = n.key !== key ? 'miss' : off < 95 ? 'perfect' : off < 180 ? 'good' : 'miss';
      judge(n);
    };
    const judge = (n) => {
      judged++;
      const val = n.res === 'perfect' ? 1 : n.res === 'good' ? 0.6 : 0;
      mine += val;
      const foe = Math.random() < enemySkill ? 1 : 0;
      theirs += foe;
      const now = performance.now();
      flashes.push({ text: t(`mini.${n.res}`), t0: now, colour: n.res === 'miss' ? '#e2694f' : '#f1cf6a' });
      // Whoever did better on this beat lands the blow in the scene above.
      if (val >= foe && val > 0) { lunge(st.a[0], 1); st.scene.crowds.get(defender.id).hitT = now; }
      else if (foe > val) { lunge(st.d, -1); st.scene.crowds.get(attacker.id).hitT = now; }
    };
    const lunge = (v, dir) => { v.ox = 0.22 * dir; setTimeout(() => { v.ox = 0; }, 160); };
    st.overlay.addEventListener('keydown', (e) => {
      const ak = arcadeKey(e), map = { left: 'ArrowLeft', up: 'ArrowUp', down: 'ArrowDown', right: 'ArrowRight' };
      if (map[ak]) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) press(map[ak]); }
      else if (e.key === 'Escape') finish(null);
    });
    pads.addEventListener('pointerdown', (e) => { const k = e.target.closest('.pad')?.dataset.k; if (k) press(k); });

    stop = run((now) => {
      t0 ??= now;
      const el = now - t0;
      for (const n of notes) if (!n.res && el > n.at + 260) { n.res = 'miss'; judge(n); }
      if (!done && judged === COUNT) {
        const acc = mine / COUNT, foeAcc = theirs / COUNT;
        const score = Math.max(0, Math.min(1, 0.5 + (acc - foeAcc) * 0.9));
        done = { score, acc, foeAcc };
        setTimeout(() => finish({ score }), speed() === 0 ? 400 : 1300);
      }
      st.scene.draw(st.units, [], now);
      const g = st.scene.ctx;
      // The lane, as in 1066's combat panel.
      const LY = H - 70, LH = 52;
      g.save();
      g.fillStyle = 'rgba(12,9,6,0.88)'; g.fillRect(40, LY, W - 80, LH);
      g.strokeStyle = 'rgba(251,246,234,0.15)';
      for (let x = 40; x < W - 40; x += 40) { g.beginPath(); g.moveTo(x, LY); g.lineTo(x, LY + LH); g.stroke(); }
      g.fillStyle = 'rgba(230,181,52,0.25)'; g.fillRect(HIT_X - 22, LY, 44, LH);
      g.strokeStyle = '#e6b534'; g.lineWidth = 2; g.strokeRect(HIT_X - 22, LY + 1, 44, LH - 2);
      for (const n of notes) {
        const x = HIT_X + ((n.at - el) / TRAVEL) * (W - 80 - HIT_X);
        if (x > W - 40 || (n.res && el - n.at > 300)) continue;
        const cx = Math.max(60, x);
        g.globalAlpha = n.res === 'miss' ? 0.3 : 1;
        g.fillStyle = n.res && n.res !== 'miss' ? '#e6b534' : (battle.sides[attacker.side].faction.color);
        g.beginPath(); g.arc(cx, LY + LH / 2, 22, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#fbf3de'; g.lineWidth = 2.5; g.stroke();
        drawArrow(g, cx, LY + LH / 2, n.key);
        g.globalAlpha = 1;
      }
      g.textBaseline = 'alphabetic';
      // Who is fighting better: your men against theirs.
      const bw = 260;
      g.fillStyle = 'rgba(12,9,6,0.85)'; g.fillRect(40, LY - 30, bw + 4, 16); g.fillRect(W - 44 - bw, LY - 30, bw + 4, 16);
      g.fillStyle = battle.sides[attacker.side].faction.color; g.fillRect(42, LY - 28, bw * (mine / COUNT), 12);
      g.fillStyle = battle.sides[defender.side].faction.color; g.fillRect(W - 42 - bw * (theirs / COUNT), LY - 28, bw * (theirs / COUNT), 12);
      g.fillStyle = '#fbf3de'; g.font = '13px Optima, serif';
      g.textAlign = 'left'; g.fillText(t('mini.yourMen'), 44, LY - 36);
      g.textAlign = 'right'; g.fillText(t('mini.theirMen'), W - 44, LY - 36);
      g.restore();
      for (const f of flashes) {
        const q = (now - f.t0) / 600;
        if (q > 1) continue;
        g.save(); g.globalAlpha = 1 - q; g.font = 'bold 20px Optima, serif'; g.textAlign = 'center';
        g.fillStyle = f.colour; g.fillText(f.text, HIT_X, LY - 50 - q * 20); g.restore();
      }
      if (drawCountdown(g, W, H, el)) { /* waiting */ } else if (done) {
        const key = done.score > 0.6 ? 'mini.foughtBetter' : done.score < 0.4 ? 'mini.foughtWorse' : 'mini.foughtEven';
        banner(g, W, H, t(key), `${Math.round(done.acc * 100)}% · ${Math.round(done.foeAcc * 100)}%`);
      }
    }, () => finish(null));
  });
}

// Which arcade button a key press is: arrows/WASD, A (Ctrl, Z, E, Space),
// or null. Space counts as A here for keyboard players.
export function arcadeKey(e) {
  const c = e.code;
  if (c === 'ArrowLeft' || c === 'KeyA') return 'left';
  if (c === 'ArrowRight' || c === 'KeyD') return 'right';
  if (c === 'ArrowUp' || c === 'KeyW') return 'up';
  if (c === 'ArrowDown' || c === 'KeyS') return 'down';
  if (c === 'ControlLeft' || c === 'KeyZ' || c === 'KeyE' || c === 'Space' || c === 'Enter') return 'a';
  return null;
}

