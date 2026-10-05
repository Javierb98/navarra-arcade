// On-screen controls for phones and tablets: an 8-way pad and the cabinet's
// buttons (A, B, C, START), plus an exit button. They press player 1's keys
// from data/controls.json, so the game sees exactly what a cabinet would send.
// The same file is shared by every Navarra arcade game; it only appears on a
// touch screen, and playArea() tells main.js where the game may draw.
//
// Upright: the game sits at the top and the controls fill the space below.
// On its side: the game is narrowed so the pad and buttons get the margins.

const SIDE = 150; // px kept free on each side for thumbs when held sideways
const BAR = 46;   // px for START and exit above the controls when upright

export const touchScreen = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && 'ontouchstart' in window);

let pad = null;

const size = () => ({ w: document.documentElement.clientWidth, h: document.documentElement.clientHeight });
const upright = () => { const { w, h } = size(); return h > w * 0.9; };

// The box (in CSS pixels) the game's stage should be fitted into.
export function playArea(W = 960, H = 540) {
  const { w, h } = size();
  if (!pad) return { x: 0, y: 0, w, h };
  if (upright()) {
    // Full width on top; the controls get the rest, but never less than 230px.
    const gh = Math.min(w * H / W, h - 230);
    return { x: 0, y: 0, w, h: gh };
  }
  return { x: SIDE, y: 0, w: w - 2 * SIDE, h };
}

// Builds the controls (touch screens only). `onGesture` runs inside the first
// real touch, so the game can start its sound there (iOS needs a gesture).
export function initTouch(cfg, { onGesture, onLayout } = {}) {
  if (!touchScreen) return false;
  const keys = cfg.keyboard.p1;
  // Prefer the cabinet's codes (Ctrl, Alt, Space, 1) over letter keys, so
  // screens don't start showing keyboard hints.
  const code = (b) => keys[b].find((c) => !c.startsWith('Key')) ?? keys[b][0];
  const exitCode = cfg.keyboard.exit?.[0] ?? 'Escape';
  const held = new Map(); // code -> number of fingers holding it
  const send = (c, down) => {
    const n = (held.get(c) ?? 0) + (down ? 1 : -1);
    held.set(c, Math.max(0, n));
    if (down && n === 1) dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true }));
    if (!down && n <= 0) dispatchEvent(new KeyboardEvent('keyup', { code: c, key: c, bubbles: true }));
  };
  let woke = false;
  const gesture = () => { if (!woke) { woke = true; onGesture?.(); } };

  const el = (tag, cls, text) => { const e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e; };
  pad = el('div', 'touchpad');
  pad.setAttribute('aria-hidden', 'true');

  // ---- the pad: where the thumb sits around the centre picks the directions.
  const stick = el('div', 'tp-stick');
  const knob = el('div', 'tp-knob');
  stick.append(knob);
  for (const d of ['up', 'right', 'down', 'left']) stick.append(el('span', `tp-arrow ${d}`));
  const dirs = { left: code('left'), right: code('right'), up: code('up'), down: code('down') };
  const on = new Set();
  let stickId = null;
  const aim = (e) => {
    const r = stick.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const rad = r.width / 2, dist = Math.hypot(dx, dy);
    const want = new Set();
    if (dist > rad * 0.22) {
      // Eight slices of 45°, so diagonals are as easy as straight lines.
      const a = Math.atan2(dy, dx), s = Math.round(a / (Math.PI / 4));
      const slice = ((s % 8) + 8) % 8; // 0 = right, 2 = down, 4 = left, 6 = up
      if ([7, 0, 1].includes(slice)) want.add('right');
      if ([1, 2, 3].includes(slice)) want.add('down');
      if ([3, 4, 5].includes(slice)) want.add('left');
      if ([5, 6, 7].includes(slice)) want.add('up');
    }
    for (const d of on) if (!want.has(d)) { on.delete(d); send(dirs[d], false); }
    for (const d of want) if (!on.has(d)) { on.add(d); send(dirs[d], true); }
    const k = Math.min(1, dist / rad) * rad * 0.45 / (dist || 1);
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    stick.classList.toggle('active', want.size > 0);
  };
  const release = () => {
    for (const d of on) send(dirs[d], false);
    on.clear();
    stickId = null;
    knob.style.transform = '';
    stick.classList.remove('active');
  };
  stick.addEventListener('pointerdown', (e) => { gesture(); stickId = e.pointerId; stick.setPointerCapture(e.pointerId); aim(e); e.preventDefault(); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) aim(e); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(ev, (e) => { if (e.pointerId === stickId) release(); });

  // ---- buttons: held while a finger is on them.
  const button = (cls, label, c) => {
    const b = el('div', `tp-btn ${cls}`, label);
    const ids = new Set();
    b.addEventListener('pointerdown', (e) => { gesture(); e.preventDefault(); b.setPointerCapture(e.pointerId); if (!ids.has(e.pointerId)) { ids.add(e.pointerId); send(c, true); } b.classList.add('down'); });
    const up = (e) => { if (ids.delete(e.pointerId)) send(c, false); if (!ids.size) b.classList.remove('down'); };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, up);
    return b;
  };
  const face = el('div', 'tp-face');
  face.append(button('tp-c', 'C', code('c')), button('tp-b', 'B', code('b')), button('tp-a', 'A', code('a')));
  const bar = el('div', 'tp-bar');
  bar.append(button('tp-exit', '✕', exitCode), button('tp-start', 'START', code('start')));
  pad.append(stick, face, bar);
  document.body.append(pad);

  // Fingers on the game itself shouldn't scroll, zoom or select anything.
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  addEventListener('blur', () => { release(); for (const c of held.keys()) { held.set(c, 1); send(c, false); } });

  const layout = () => {
    const tall = upright();
    pad.classList.toggle('upright', tall);
    pad.classList.toggle('sideways', !tall);
    if (tall) {
      const a = playArea();
      pad.style.top = `${a.h}px`;
    } else pad.style.top = '0px';
    onLayout?.();
  };
  addEventListener('resize', layout);
  document.body.classList.add('has-touchpad');
  injectStyle();
  layout();
  return true;
}

// Styles live here so each game only needs this one file.
function injectStyle() {
  const css = `
.touchpad { position: fixed; left: 0; right: 0; bottom: 0; z-index: 50; pointer-events: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; font: bold 14px/1 "Trebuchet MS", "Segoe UI", sans-serif; }
.touchpad > * { pointer-events: auto; touch-action: none; }
.touchpad.upright { background: linear-gradient(#141018, #0c0a10); border-top: 1px solid rgba(255, 240, 200, 0.18); }
.tp-stick { position: absolute; width: 150px; height: 150px; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,0.10), rgba(255,255,255,0.04) 70%); border: 2px solid rgba(255, 240, 200, 0.28); }
.tp-stick.active { border-color: rgba(241, 226, 166, 0.65); }
.tp-knob { position: absolute; left: 50%; top: 50%; width: 58px; height: 58px; margin: -29px 0 0 -29px; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #f6e9b8, #b89a64); box-shadow: 0 3px 8px rgba(0,0,0,0.5); transition: transform 0.06s; }
.tp-arrow { position: absolute; width: 0; height: 0; border: 7px solid transparent; opacity: 0.55; }
.tp-arrow.up { left: 50%; top: 8px; margin-left: -7px; border-bottom: 10px solid #f1e2a6; border-top: 0; }
.tp-arrow.down { left: 50%; bottom: 8px; margin-left: -7px; border-top: 10px solid #f1e2a6; border-bottom: 0; }
.tp-arrow.left { top: 50%; left: 8px; margin-top: -7px; border-right: 10px solid #f1e2a6; border-left: 0; }
.tp-arrow.right { top: 50%; right: 8px; margin-top: -7px; border-left: 10px solid #f1e2a6; border-right: 0; }
.tp-face { position: absolute; width: 170px; height: 150px; }
.tp-btn { position: absolute; display: flex; align-items: center; justify-content: center; border-radius: 50%; color: #111; box-shadow: 0 3px 0 rgba(0,0,0,0.45), 0 4px 10px rgba(0,0,0,0.4); transition: transform 0.05s; }
.tp-btn.down { transform: translateY(2px) scale(0.95); box-shadow: 0 1px 0 rgba(0,0,0,0.45); filter: brightness(1.15); }
.tp-a { width: 70px; height: 70px; right: 0; top: 52px; background: #f0e442; font-size: 22px; }
.tp-b { width: 58px; height: 58px; right: 80px; top: 86px; background: #eeeeee; font-size: 19px; }
.tp-c { width: 50px; height: 50px; right: 66px; top: 8px; background: #f1e2a6; border-radius: 10px; font-size: 16px; }
.tp-bar { position: absolute; display: flex; gap: 12px; }
.tp-start, .tp-exit { position: relative; height: 32px; border-radius: 8px; font-size: 12px; letter-spacing: 1px; }
.tp-start { padding: 0 16px; background: #eeeeee; }
.tp-exit { width: 40px; background: rgba(255,255,255,0.14); color: #fbf6ea; font-size: 16px; box-shadow: none; border: 1px solid rgba(255, 240, 200, 0.3); }
/* Upright: pad bottom-left, buttons bottom-right, START and exit across the top. */
.touchpad.upright .tp-stick { left: 18px; top: calc(50% - 75px + 22px); }
.touchpad.upright .tp-face { right: 14px; top: calc(50% - 75px + 22px); }
.touchpad.upright .tp-bar { left: 0; right: 0; top: 10px; justify-content: center; }
/* Sideways: the same, in the margins beside the game, a little see-through. */
.touchpad.sideways { top: 0; }
.touchpad.sideways .tp-stick { left: max(4px, env(safe-area-inset-left)); bottom: 18px; width: 140px; height: 140px; opacity: 0.85; }
.touchpad.sideways .tp-face { right: max(0px, env(safe-area-inset-right)); bottom: 14px; transform: scale(0.85); transform-origin: right bottom; opacity: 0.92; }
.touchpad.sideways .tp-bar { right: max(10px, env(safe-area-inset-right)); top: 10px; }
.touchpad.sideways .tp-exit { position: fixed; left: max(10px, env(safe-area-inset-left)); top: 10px; }
/* Tablets held upright: bigger controls, further in from the edges. */
@media (min-width: 700px) and (orientation: portrait) {
  .touchpad.upright .tp-stick { left: 60px; transform: scale(1.3); transform-origin: left center; }
  .touchpad.upright .tp-face { right: 60px; transform: scale(1.3); transform-origin: right center; }
  .touchpad.upright .tp-bar { transform: scale(1.2); }
}
@media (max-height: 640px) and (orientation: portrait) {
  .tp-stick { width: 128px; height: 128px; }
  .tp-face { transform: scale(0.88); transform-origin: right bottom; }
}
body.has-touchpad { touch-action: none; -webkit-user-select: none; user-select: none; }
`;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.append(s);
}
