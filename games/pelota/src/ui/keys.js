// Keyboard names for the cabinet buttons, from data/controls.json, so that at
// a computer the screens show "O" where the cabinet shows the A button.

import { device } from './device.js';

const ARROWS = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };
let controls = null;

export function initKeys(cfg) { controls = cfg; }
export const keysOn = () => device === 'computer';

// The friendliest key for a button: a letter or arrow if there is one, and
// Enter for player 1's START.
export function keyName(player, button) {
  const codes = controls?.keyboard?.[player === 1 ? 'p2' : 'p1']?.[button] ?? [];
  const code = (button === 'start' && codes.includes('Enter') ? 'Enter' : null) ?? codes.find((c) => c.startsWith('Key') || c.startsWith('Arrow')) ?? codes[0];
  if (!code) return '';
  if (ARROWS[code]) return ARROWS[code];
  return code.replace(/^Key|^Digit/, '');
}
