// Keyboard names for the cabinet buttons, from the active control profile,
// so that at a computer the screens show "Z" where the cabinet shows the A
// button.

import { device } from './device.js';

const ARROWS = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };
let controls = null;

export function initKeys(cfg) { controls = cfg; }
export const keysOn = () => device === 'computer';

// The players left to right as they sit, so each one finds their controls on
// their own side: at a keyboard player 2 (W A S D) is on the left and player 1
// (the arrows) on the right; at the cabinet player 1 has the left stick.
export const bySide = () => (keysOn() ? [1, 0] : [0, 1]);

// The friendliest key for a button: a letter or arrow if there is one, and
// Enter for player 1's START.
export function keyName(player, button) {
  const codes = controls?.keyboard?.[player === 1 ? 'p2' : 'p1']?.[button] ?? [];
  const code = (button === 'start' && codes.includes('Enter') ? 'Enter' : null) ?? codes.find((c) => c.startsWith('Key') || c.startsWith('Arrow')) ?? codes[0];
  if (!code) return '';
  if (ARROWS[code]) return ARROWS[code];
  return code.replace(/^Key|^Digit/, '').replace('Semicolon', ';').replace(/^Numpad/, 'Num ');
}
