// Storybook scenes for the intro, outro and fact cards, as layered SVG
// illustrations (960x540). Smooth shapes and soft gradients, no pixels.

const defs = `
  <defs>
    <linearGradient id="skyDay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ec5e8"/><stop offset="1" stop-color="#f3e3c3"/></linearGradient>
    <linearGradient id="skyDusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b4a7a"/><stop offset=".55" stop-color="#d98a6a"/><stop offset="1" stop-color="#f6d49a"/></linearGradient>
    <linearGradient id="hillFar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8b8c8"/><stop offset="1" stop-color="#c9cfc6"/></linearGradient>
    <linearGradient id="hillNear" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9dbb6a"/><stop offset="1" stop-color="#6f9447"/></linearGradient>
    <linearGradient id="stone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#efe6d2"/><stop offset="1" stop-color="#b9aa8e"/></linearGradient>
    <linearGradient id="stoneDusk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8f7c6e"/><stop offset=".5" stop-color="#d9b48f"/><stop offset="1" stop-color="#7c6a5e"/></linearGradient>
    <radialGradient id="sun"><stop offset="0" stop-color="#fff4c2"/><stop offset=".6" stop-color="#ffd37a"/><stop offset="1" stop-color="rgba(255,211,122,0)"/></radialGradient>
  </defs>`;

const hills = (y, fill, amp = 30, seed = 1) => {
  let d = `M0 540 L0 ${y}`;
  for (let x = 0; x <= 960; x += 60) d += ` Q${x + 30} ${y - amp * Math.abs(Math.sin(x * 0.01 + seed))} ${x + 60} ${y + Math.sin(x * 0.02 + seed) * 8}`;
  return `<path d="${d} L960 540 Z" fill="${fill}"/>`;
};

const rows = (y0, y1, colA, colB) => {
  let out = '';
  for (let y = y0, k = 0; y < y1; y += 14, k++) out += `<path d="M0 ${y} Q480 ${y - 10} 960 ${y + 6} L960 ${y + 14} Q480 ${y + 4} 0 ${y + 14} Z" fill="${k % 2 ? colA : colB}"/>`;
  return out;
};

const house = (x, y, w, h, roof = '#c0603c') => `
  <g><rect x="${x}" y="${y - h}" width="${w}" height="${h}" fill="url(#stone)" stroke="#9d907a"/>
  <path d="M${x - 4} ${y - h} L${x + w / 2} ${y - h - w * 0.45} L${x + w + 4} ${y - h} Z" fill="${roof}" stroke="#7d3a24"/>
  <rect x="${x + w / 2 - 4}" y="${y - 12}" width="8" height="12" fill="#6b4a2b"/></g>`;

const tower = (x, y, w, h, cone, fill = 'url(#stone)') => `
  <g><rect x="${x}" y="${y - h}" width="${w}" height="${h}" fill="${fill}" stroke="#8f8270"/>
  ${cone ? `<path d="M${x - 3} ${y - h} L${x + w / 2} ${y - h - w * 1.1} L${x + w + 3} ${y - h} Z" fill="#4d4a5c"/>`
    : Array.from({ length: Math.floor(w / 8) }, (_, k) => `<rect x="${x + k * 8}" y="${y - h - 6}" width="5" height="6" fill="${fill}" stroke="#8f8270"/>`).join('')}
  <rect x="${x + w / 2 - 2}" y="${y - h + 14}" width="4" height="9" rx="2" fill="#3b2f28"/></g>`;

const figure = (x, y, shirt = '#f3ece0', sash = '#c0392b', s = 1) => `
  <g transform="translate(${x} ${y}) scale(${s})">
  <rect x="-5" y="-4" width="3" height="14" fill="#4a4050"/><rect x="2" y="-4" width="3" height="14" fill="#4a4050"/>
  <path d="M-8 -26 Q0 -30 8 -26 L9 -4 L-9 -4 Z" fill="${shirt}"/><rect x="-9" y="-10" width="18" height="4" fill="${sash}"/>
  <circle cx="0" cy="-33" r="6.5" fill="#f1c7a1"/><path d="M-7 -35 Q0 -44 7 -35 Z" fill="#2d2a36"/></g>`;

const SCENES = {
  village: () => `${defs}<rect width="960" height="540" fill="url(#skyDay)"/>
    <circle cx="780" cy="110" r="70" fill="url(#sun)"/>
    ${hills(250, 'url(#hillFar)', 40, 1)}${hills(310, 'url(#hillNear)', 20, 3)}
    ${rows(330, 540, '#d8b85c', '#b8c86a')}
    ${tower(440, 330, 40, 110)}${tower(480, 330, 60, 80)}${tower(540, 330, 34, 100)}
    ${house(330, 340, 40, 30)}${house(380, 345, 34, 26)}${house(600, 340, 44, 30)}${house(652, 346, 34, 24)}
    ${figure(250, 420, '#f3ece0', '#e67e22', 1.4)}${figure(720, 430, '#e8d3b0', '#2e86c1', 1.4)}`,
  court: () => `${defs}<rect width="960" height="540" fill="url(#skyDay)"/>
    ${hills(280, 'url(#hillFar)', 30, 2)}${hills(340, 'url(#hillNear)', 14, 5)}
    <path d="M0 420 Q480 400 960 430 L960 460 Q480 430 0 450 Z" fill="#dcc79a"/>
    ${Array.from({ length: 7 }, (_, k) => {
      const x = 130 + k * 110, rider = k === 3 ? '#8e2c48' : '#c0392b';
      return `<g><ellipse cx="${x}" cy="420" rx="34" ry="14" fill="${k % 2 ? '#7a5230' : '#e8e0d0'}"/><rect x="${x + 22}" y="395" width="14" height="24" rx="6" fill="${k % 2 ? '#7a5230' : '#e8e0d0'}"/>
        <rect x="${x - 26}" y="425" width="5" height="26" fill="#5a4630"/><rect x="${x + 20}" y="425" width="5" height="26" fill="#5a4630"/>${figure(x, 408, rider, '#f4c542', 1.2)}
        ${k === 1 || k === 5 ? `<rect x="${x + 12}" y="300" width="3" height="100" fill="#5a4630"/><path d="M${x + 15} 302 h46 v34 h-46 z" fill="#b03a2e"/><path d="M${x + 22} 312 h32 M${x + 22} 322 h32" stroke="#f4c542" stroke-width="3"/>` : ''}</g>`;
    }).join('')}`,
  masons: () => `${defs}<rect width="960" height="540" fill="url(#skyDay)"/>
    ${hills(260, 'url(#hillFar)', 50, 4)}
    <path d="M520 540 L560 250 Q700 220 820 260 L900 540 Z" fill="#c9bea8"/><path d="M600 300 h200 M590 350 h230 M580 400 h260" stroke="#a89d86" stroke-width="3"/>
    <path d="M0 540 L0 400 Q480 380 960 410 L960 540 Z" fill="#d9ccae"/>
    ${[[150, 430], [220, 440], [185, 400], [300, 445]].map(([x, y]) => `<rect x="${x}" y="${y}" width="60" height="36" rx="3" fill="url(#stone)" stroke="#9d907a"/>`).join('')}
    ${figure(420, 470, '#f3ece0', '#c0392b', 1.5)}${figure(520, 480, '#e8d3b0', '#2e86c1', 1.5)}
    <path d="M430 410 l30 -30" stroke="#8a8f98" stroke-width="6" stroke-linecap="round"/>
    <g><rect x="640" y="440" width="130" height="30" rx="4" fill="#9b6b3f"/><circle cx="660" cy="480" r="16" fill="#5a4630"/><circle cx="750" cy="480" r="16" fill="#5a4630"/>
    ${[650, 690, 730].map((x) => `<rect x="${x}" y="410" width="34" height="30" rx="3" fill="url(#stone)" stroke="#9d907a"/>`).join('')}</g>`,
  palace: () => `${defs}<rect width="960" height="540" fill="url(#skyDusk)"/>
    <circle cx="640" cy="330" r="110" fill="url(#sun)"/>
    ${hills(330, '#8a7e8e', 26, 6)}
    <rect x="210" y="300" width="560" height="120" fill="url(#stoneDusk)"/>
    ${tower(220, 420, 50, 190, true, 'url(#stoneDusk)')}${tower(290, 420, 44, 150, false, 'url(#stoneDusk)')}${tower(350, 420, 60, 240, false, 'url(#stoneDusk)')}
    ${tower(430, 420, 40, 170, true, 'url(#stoneDusk)')}${tower(490, 420, 70, 270, false, 'url(#stoneDusk)')}${tower(580, 420, 44, 180, false, 'url(#stoneDusk)')}
    ${tower(640, 420, 54, 210, true, 'url(#stoneDusk)')}${tower(710, 420, 40, 150, false, 'url(#stoneDusk)')}
    ${rows(420, 540, '#5f7a3a', '#7a5a3a')}`,
};

export function sceneSVG(name) {
  return `<svg class="scene" viewBox="0 0 960 540" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">${(SCENES[name] ?? SCENES.palace)()}</svg>`;
}
