// Keyboard names for the cabinet buttons, from data/controls.json, so the
// screens can say "Z" as well as show the A glyph when someone plays at a
// computer.

const ARROWS = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };
let controls = null;
let on = false;

export function initKeys(cfg) { controls = cfg; }
export function showKeys(value) { const changed = value !== on; on = value; return changed; }
export const keysOn = () => on;

// The friendliest key for a button: a letter or arrow if there is one.
export function keyName(player, button) {
  const codes = controls?.keyboard?.[player === 1 ? 'p2' : 'p1']?.[button] ?? [];
  const code = codes.find((c) => c.startsWith('Key') || c.startsWith('Arrow')) ?? codes[0];
  if (!code) return '';
  if (ARROWS[code]) return ARROWS[code];
  return code.replace(/^Key|^Digit/, '').replace('Enter', '↵');
}
