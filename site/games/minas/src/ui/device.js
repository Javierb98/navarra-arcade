// Where the game is played, so every instruction names the controls in
// front of the player. Two versions:
//   - the arcade install (fire-up-arcade on the cabinet): the stick and the
//     A/B/C/START buttons;
//   - online play (the website, built by the arcade's build-site.py, which
//     marks each page with <meta name="arcade-online">): a computer's keys,
//     or on a touch screen the on-screen pad and buttons.
// ?device=cabinet|phone|computer overrides it, for testing.

import { touchScreen } from './touch.js';

export const DEVICES = ['cabinet', 'phone', 'computer'];
const asked = new URLSearchParams(location.search).get('device');
const online = !!document.querySelector('meta[name="arcade-online"]');
export const device = DEVICES.includes(asked) ? asked : !online ? 'cabinet' : touchScreen ? 'phone' : 'computer';
