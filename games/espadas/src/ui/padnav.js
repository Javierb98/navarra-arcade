// Arcade controls for a mouse-built game: the stick and the A/B/C/START
// buttons of a library cabinet (keys from the arcade's controls: arrows or
// WASD; A = Left Ctrl, Z or E; B = Left Alt, X or R; C = Space, C or Q;
// START = Enter, 1 or 2), and the on-screen pads phones get.
//
// padButton(e) says which arcade button a key is. moveFocus() walks the
// buttons of a screen with the stick, the way a console menu does: from the
// focused element to the nearest one in that direction. A presses it, B
// presses the screen's Back button ([data-back]), START its main button
// (.primary or .go-btn), and left/right on an element that listens for
// 'pad' events (a counter row) changes its value instead of moving.

export function padButton(e) {
  switch (e.code) {
    case 'ArrowUp': case 'KeyW': return 'up';
    case 'ArrowDown': case 'KeyS': return 'down';
    case 'ArrowLeft': case 'KeyA': return 'left';
    case 'ArrowRight': case 'KeyD': return 'right';
    case 'ControlLeft': case 'KeyZ': case 'KeyE': return 'a';
    case 'AltLeft': case 'KeyX': case 'KeyR': return 'b';
    case 'Space': case 'KeyC': case 'KeyQ': return 'c';
    case 'Enter': case 'NumpadEnter': case 'Digit1': case 'Digit2': return 'start';
    default: return null;
  }
}

const FOCUSABLE = 'button:not([disabled]), [tabindex]:not([tabindex="-1"]), input[type="range"], input[type="checkbox"], select';
const visible = (el) => el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';

export function focusables(scope) {
  return [...scope.querySelectorAll(FOCUSABLE)].filter(visible);
}

let marked = null;
export function mark(el) {
  if (marked && marked !== el) marked.classList.remove('pad-focus');
  marked = el;
  if (el) { el.classList.add('pad-focus'); el.focus({ preventScroll: false }); el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }
}

// From the focused element to the nearest one in direction `dir`.
export function moveFocus(scope, dir) {
  const list = focusables(scope);
  if (!list.length) return false;
  const cur = list.includes(document.activeElement) ? document.activeElement : null;
  if (!cur) { mark(list[0]); return true; }
  const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  let best = null, bs = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const q = el.getBoundingClientRect(), ex = q.left + q.width / 2, ey = q.top + q.height / 2;
    const along = (ex - cx) * dx + (ey - cy) * dy;
    if (along <= 2) continue;
    const across = Math.abs((ex - cx) * dy) + Math.abs((ey - cy) * dx);
    const score = along + across * 2.2;
    if (score < bs) { bs = score; best = el; }
  }
  if (best) { mark(best); return true; }
  return false;
}

// One arcade button on an ordinary screen (menus, the army, dialogs).
export function navigate(scope, b) {
  const cur = scope.contains(document.activeElement) ? document.activeElement : null;
  if (b === 'left' || b === 'right') {
    if (cur && cur.matches('input[type="range"]')) {
      const step = Number(cur.step || 1) * (b === 'left' ? -1 : 1);
      cur.value = String(Number(cur.value) + step);
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      cur.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    if (cur && cur.dataset.pad != null) { cur.dispatchEvent(new CustomEvent('pad', { detail: b })); return true; }
  }
  if (b === 'up' || b === 'down' || b === 'left' || b === 'right') return moveFocus(scope, b);
  if (b === 'a') {
    if (!cur) { const first = focusables(scope)[0]; if (first) mark(first); return true; }
    cur.click();
    return true;
  }
  if (b === 'b') { const back = [...scope.querySelectorAll('[data-back]')].find(visible); if (back) { back.click(); return true; } return false; }
  if (b === 'start') {
    const main = [...scope.querySelectorAll('.primary:not([disabled]), .go-btn:not([disabled])')].find(visible);
    if (main) { main.click(); return true; }
    return false;
  }
  return false;
}
