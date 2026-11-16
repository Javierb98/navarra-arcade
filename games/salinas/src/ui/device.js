// Where the game is being played, so every instruction names the controls
// in front of the player:
//   - cabinet:  the Raspberry Pi arcade machine. The arcade's start.py
//               stamps the pages it serves with <meta name="arcade-device"
//               content="cabinet"> when it runs on a Pi; failing that, a
//               browser on ARM Linux (that isn't Android) is taken for one.
//               Names the stick and the A/B/C/START buttons.
//   - phone:    a touch screen (phone or tablet). Names the on-screen pad
//               and buttons.
//   - computer: anything else, local or online. Names the keys.
// ?device=cabinet|phone|computer overrides it, for testing.

import { touchScreen } from './touch.js';

export const DEVICES = ['cabinet', 'phone', 'computer'];

function detect() {
  const asked = new URLSearchParams(location.search).get('device');
  if (DEVICES.includes(asked)) return asked;
  if (document.querySelector('meta[name="arcade-device"]')?.content === 'cabinet') return 'cabinet';
  const ua = navigator.userAgent;
  if (/Linux/.test(ua) && /aarch64|armv7l|armv8l|arm64/i.test(ua) && !/Android/.test(ua)) return 'cabinet';
  return touchScreen ? 'phone' : 'computer';
}

export const device = detect();
