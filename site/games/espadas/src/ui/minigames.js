// The charge, fight and war-cry minigames, after 1066. Each opens over the
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

// ---------------------------------------------------------------------------
// War cry: the drum, then the shout. Four drum beats, quickening, each hit
// as a ring closes on the drum; then the shout: hold A to fill the army's
// lungs and let go in the gold. Hold too long and the voices crack. The
// drum counts a little more than the shout; it resolves to { score } 0..1,
// which the engine turns into the cry's sting (high ground and the fade
// still apply on top).

const BEATS = [600, 1300, 1950, 2550]; // ms after the count, quickening
const SHOUT_FROM = 2950, SHOUT_FOR = 2300, FILL = 1100, CRACK = 260;
const GOLD = [0.78, 0.95];

// The arcade install names the cabinet's A, the website the space bar, a
// touch screen the screen itself (build-site.py marks the online pages).
function cryDevice() {
  if (!document.querySelector('meta[name="arcade-online"]')) return 'cabinet';
  return matchMedia('(pointer: coarse)').matches ? 'phone' : 'computer';
}

// A small drum and a crowd's roar, made on the spot (the game has no sound files).
let audio = null;
function sound(kind, k = 1) {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const now = audio.currentTime, out = audio.createGain();
    out.connect(audio.destination);
    if (kind === 'drum') {
      const o = audio.createOscillator();
      o.frequency.setValueAtTime(140, now); o.frequency.exponentialRampToValueAtTime(48, now + 0.22);
      out.gain.setValueAtTime(0.55 * k, now); out.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      o.connect(out); o.start(now); o.stop(now + 0.35);
    } else {
      // The roar: filtered noise swelling and dying, louder the better the shout.
      const len = 1.3, buf = audio.createBuffer(1, audio.sampleRate * len, audio.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const n = audio.createBufferSource(); n.buffer = buf;
      const f = audio.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 520 + 300 * k; f.Q.value = 0.8;
      out.gain.setValueAtTime(0.001, now); out.gain.exponentialRampToValueAtTime(0.25 + 0.5 * k, now + 0.12); out.gain.exponentialRampToValueAtTime(0.001, now + len);
      n.connect(f); f.connect(out); n.start(now);
    }
  } catch { /* no sound: fine */ }
}

export function warCryGame({ host, data, battle, request, speed }) {
  const attacker = battle.byId(request.attacker);
  const target = battle.byId(request.defender) ?? battle.units.find((u) => u.side !== attacker.side && battle.onBoard(u)) ?? attacker;
  const st = stage({ host, data, battle, attackers: [attacker], defender: target, label: t('phase.taunt'), colour: '#8a6a1a' });
  st.a[0].x = 0.8; st.d.x = 2.6;
  const W = 1200, H = 360, DRUM = { x: 600, y: 168 }; // between the armies, below the tip bar
  const dev = cryDevice();
  const a = t(`mini.cry.btn.${dev}`);
  const auto = h('button', { class: 'ghost dark' }, t('mini.auto'));
  st.bar.append(h('p', { class: 'aim-tip' }, dev === 'phone' ? t('mini.cry.tipTouch') : t('mini.cry.tip', { a })), auto);

  const beats = BEATS.map((at) => ({ at, res: null }));
  let extra = 0, holdFrom = null, fill = 0, fullAt = null, shout = null, t0 = null, done = null;
  const flashes = [];
  const team = battle.sides[attacker.side].faction.color;

  return new Promise((resolve) => {
    let stop;
    const finish = (v) => { stop(); st.overlay.remove(); removeEventListener('keyup', onUp); resolve(v); };
    auto.addEventListener('click', () => finish(null));
    const el = () => performance.now() - t0 - COUNTDOWN;
    const flash = (text, colour) => flashes.push({ text, colour, t0: performance.now() });
    const hop = (v, k) => { v.ox = k; setTimeout(() => { v.ox = 0; }, 150); };
    const down = () => {
      if (!t0 || done || el() < 0) return;
      const now = el();
      if (now < SHOUT_FROM - 150) {
        // The drum: the nearest beat not yet struck.
        const b = beats.find((x) => !x.res && Math.abs(x.at - now) < 260);
        if (!b) { extra++; flash(t('mini.miss'), '#e2694f'); return; }
        const off = Math.abs(b.at - now);
        b.res = off < 100 ? 'perfect' : off < 190 ? 'good' : 'miss';
        flash(t(`mini.${b.res}`), b.res === 'miss' ? '#e2694f' : '#f1cf6a');
        if (b.res !== 'miss') { sound('drum', b.res === 'perfect' ? 1 : 0.7); st.a.forEach((v) => hop(v, 0.08)); }
      } else if (now >= SHOUT_FROM && shout == null && holdFrom == null) holdFrom = now;
    };
    const up = () => {
      if (holdFrom == null || shout != null) return;
      release(fill);
    };
    const release = (f, cracked = false) => {
      shout = cracked ? 0.3 : f >= GOLD[0] && f <= GOLD[1] ? 1 : Math.max(0, 1 - Math.min(Math.abs(f - GOLD[0]), Math.abs(f - GOLD[1])) / 0.35);
      const drum = Math.max(0, beats.reduce((s, b) => s + (b.res === 'perfect' ? 1 : b.res === 'good' ? 0.6 : 0), 0) / beats.length - extra * 0.1);
      const score = Math.max(0, Math.min(1, drum * 0.55 + shout * 0.45));
      done = { score, cracked, t: performance.now() };
      sound('roar', score);
      st.a.forEach((v) => hop(v, 0.18));
      if (score >= 0.4 && target !== attacker) { st.scene.crowds.get(target.id).hitT = performance.now(); if (score >= 0.75) hop(st.d, -0.12); }
      setTimeout(() => finish({ score }), speed() === 0 ? 450 : 1500);
    };
    const onUp = (e) => { if (arcadeKey(e) === 'a') up(); };
    addEventListener('keyup', onUp);
    st.overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { finish(null); return; }
      if (arcadeKey(e) === 'a') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) down(); }
    });
    st.scene.canvas.addEventListener('pointerdown', down);
    st.scene.canvas.addEventListener('pointerup', up);
    st.scene.canvas.addEventListener('pointercancel', up);

    stop = run((now) => {
      t0 ??= now;
      const e = now - t0 - COUNTDOWN;
      for (const b of beats) if (!b.res && e > b.at + 260) { b.res = 'miss'; flash(t('mini.miss'), '#e2694f'); }
      if (holdFrom != null && shout == null) {
        fill = Math.min(1, (e - holdFrom) / FILL);
        if (fill >= 1) { fullAt ??= e; if (e - fullAt > CRACK) release(1, true); }
      }
      if (shout == null && holdFrom == null && e > SHOUT_FROM + SHOUT_FOR) release(0);
      st.scene.draw(st.units, [], now);
      const g = st.scene.ctx;
      g.save();
      // The drum, with a ring closing on it toward the next beat.
      const next = beats.find((b) => !b.res);
      const since = Math.min(...beats.filter((b) => b.res && b.res !== 'miss').map((b) => e - b.at), 9999);
      const thump = Math.max(0, 1 - since / 220);
      if (next && e > next.at - 650) {
        const k = Math.max(0, (next.at - e) / 650);
        g.strokeStyle = `rgba(255,236,160,${0.9 - k * 0.6})`; g.lineWidth = 5;
        g.beginPath(); g.arc(DRUM.x, DRUM.y, 34 + k * 50, 0, Math.PI * 2); g.stroke();
      }
      const skin = g.createRadialGradient(DRUM.x - 8, DRUM.y - 8, 4, DRUM.x, DRUM.y, 36);
      skin.addColorStop(0, '#f6e2b8'); skin.addColorStop(1, '#b8864a');
      g.fillStyle = skin; g.beginPath(); g.arc(DRUM.x, DRUM.y, 30 + thump * 6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = team; g.lineWidth = 5; g.stroke();
      // Four marks under the drum: the beats struck so far.
      beats.forEach((b, i) => {
        g.fillStyle = b.res === 'perfect' ? '#f1cf6a' : b.res === 'good' ? '#c9a24a' : b.res === 'miss' ? 'rgba(226,105,79,0.8)' : 'rgba(251,246,234,0.25)';
        g.beginPath(); g.arc(DRUM.x - 39 + i * 26, DRUM.y + 50, 8, 0, Math.PI * 2); g.fill();
      });
      // The shout: the army's breath, with the gold to let go in.
      if (e >= SHOUT_FROM - 400) {
        const bx = W / 2 - 220, by = H - 54, bw = 440;
        g.fillStyle = 'rgba(12,9,6,0.85)'; g.fillRect(bx - 4, by - 4, bw + 8, 30);
        g.fillStyle = 'rgba(230,181,52,0.45)'; g.fillRect(bx + GOLD[0] * bw, by - 4, (GOLD[1] - GOLD[0]) * bw, 30);
        const grd = g.createLinearGradient(bx, 0, bx + bw, 0);
        grd.addColorStop(0, '#8a6a1a'); grd.addColorStop(1, fullAt != null ? '#e2694f' : '#f1cf6a');
        g.fillStyle = grd; g.fillRect(bx, by, bw * fill, 22);
        g.strokeStyle = '#fbf3de'; g.lineWidth = 2; g.strokeRect(bx + GOLD[0] * bw, by - 4, (GOLD[1] - GOLD[0]) * bw, 30);
      }
      g.restore();
      for (const f of flashes) {
        const q = (now - f.t0) / 600;
        if (q > 1) continue;
        g.save(); g.globalAlpha = 1 - q; g.font = 'bold 22px Optima, serif'; g.textAlign = 'center';
        g.fillStyle = f.colour; g.fillText(f.text, DRUM.x + 110, DRUM.y + 6 - q * 20); g.restore();
      }
      if (drawCountdown(g, W, H, now - t0)) { /* waiting */ } else if (done) {
        const key = done.cracked ? 'mini.cry.cracked' : done.score >= 0.75 ? 'mini.cry.thunder' : done.score >= 0.4 ? 'mini.cry.strong' : 'mini.cry.weak';
        const pulse = done.score >= 0.75 ? 1 + Math.max(0, 1 - (now - done.t) / 400) * 0.15 : 1;
        g.save(); g.translate(W / 2, H * 0.62); g.scale(pulse, pulse);
        banner(g, 0, 0, t(key), t('mini.power', { n: Math.round(done.score * 100) }), done.score >= 0.4 ? '#f1cf6a' : '#e2694f', 0);
        g.restore();
      } else {
        const shouting = e >= SHOUT_FROM;
        const text = shouting ? (holdFrom != null ? t('mini.cry.letGo') : t(dev === 'phone' ? 'mini.cry.holdTouch' : 'mini.cry.hold', { a })) : t(dev === 'phone' ? 'mini.cry.drumTouch' : 'mini.cry.drum', { a });
        const pulse = 1 + Math.sin(now / 70) * (shouting ? 0.06 : 0.02);
        g.save(); g.translate(W / 2, H * 0.73); g.scale(pulse, pulse);
        banner(g, 0, 0, text, null, '#fbf3de', 0);
        g.restore();
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

