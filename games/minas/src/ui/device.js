// Where the game is played, so every instruction names the controls in
// front of the player: the cabinet's stick and A/B/C buttons, a phone's
// on-screen pad and buttons, or a computer's keys. The arcade menu passes
// ?device=; the cabinet's kiosk opens the menu with ?device=cabinet (see the
// arcade's README). Opened on its own, a touch screen means a phone and
// anything else a computer.

import { touchScreen } from './touch.js';

export const DEVICES = ['cabinet', 'phone', 'computer'];
const asked = new URLSearchParams(location.search).get('device');
export const device = DEVICES.includes(asked) ? asked : touchScreen ? 'phone' : 'computer';
