// Smooth, storybook-style icons for cards, works and resources, as small
// SVG pictures (64x64 box). Shapes and colours only; no text inside.

const P = {
  skin: '#f1c7a1', skinD: '#d49a74', shirt: '#f3ece0', shirtD: '#cfc3ad', sash: '#c0392b', beret: '#2d2a36',
  wood: '#b07a45', woodD: '#7a5230', woodL: '#d8a86c', stone: '#cfc4b0', stoneD: '#9d927e', stoneL: '#ebe3d2',
  bread: '#d99a4e', breadL: '#f0c27f', breadD: '#a86a2e', fire: '#f39c12', fireL: '#ffd166', fireD: '#d35400',
  water: '#5dade2', waterD: '#2e86c1', gold: '#f4c542', goldD: '#c89b1f', red: '#b03a2e', parch: '#f3e7c9', parchD: '#d8c49a',
  leaf: '#6aa84f', leafD: '#3f7d34', wine: '#7b2d4b', wineD: '#521d33', lime: '#f5f5ef', limeD: '#cfcfc4',
};

const person = (x, y, shirt = P.shirt, sash = P.sash, s = 1) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="0" cy="22" rx="11" ry="3" fill="rgba(0,0,0,.18)"/>
    <path d="M-7 6 Q0 1 7 6 L8 20 L-8 20 Z" fill="${shirt}" stroke="${P.shirtD}" stroke-width="1"/>
    <rect x="-8" y="12" width="16" height="3" rx="1" fill="${sash}"/>
    <circle cx="0" cy="-1" r="6.5" fill="${P.skin}" stroke="${P.skinD}" stroke-width="1"/>
    <path d="M-7 -3 Q0 -12 7 -3 Z" fill="${P.beret}"/>
  </g>`;

const loaf = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">
  <ellipse cx="0" cy="0" rx="9" ry="6" fill="${P.bread}" stroke="${P.breadD}" stroke-width="1.2"/>
  <path d="M-5 -2 q2 -2 4 0 M0 -2 q2 -2 4 0" stroke="${P.breadL}" stroke-width="1.5" fill="none" stroke-linecap="round"/></g>`;

const block = (x, y, w = 16, h = 11) => `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="${P.stone}" stroke="${P.stoneD}" stroke-width="1.2"/>
  <path d="M${x + 1} ${y + 2} h${w - 2}" stroke="${P.stoneL}" stroke-width="1.5"/></g>`;

const flame = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M0 -12 C6 -5 8 0 5 6 C3 10 -3 10 -5 6 C-8 0 -4 -4 0 -12 Z" fill="${P.fireD}"/>
  <path d="M0 -6 C4 -1 4 3 2 6 C1 8 -2 8 -3 6 C-4 2 -2 0 0 -6 Z" fill="${P.fire}"/>
  <path d="M0 0 C2 3 1 6 0 6 C-1 6 -2 4 0 0 Z" fill="${P.fireL}"/></g>`;

const ICONS = {
  labourer: `${person(28, 30, P.shirt, '#8e6b3a')}<path d="M40 14 L46 48" stroke="${P.woodD}" stroke-width="3" stroke-linecap="round"/><path d="M42 46 l8 3 l-3 8 l-8 -3 z" fill="#8a8f98" stroke="#5f646c"/>`,
  mason: `${block(36, 38, 20, 14)}${person(24, 28, P.shirtD, P.sash)}<path d="M36 18 L46 30" stroke="#8a8f98" stroke-width="3.5" stroke-linecap="round"/><path d="M44 14 l6 -2 l2 6 l-6 2 z" fill="${P.woodD}"/>`,
  carpenter: `<rect x="8" y="40" width="48" height="9" rx="2" fill="${P.woodL}" stroke="${P.woodD}"/><path d="M12 44 h40" stroke="${P.wood}"/>${person(30, 24)}<path d="M40 26 L56 36 L54 39 L38 30 Z" fill="#aab2bd" stroke="#6c757d"/><path d="M41 28 l2 1 m2 1 l2 1 m2 1 l2 1" stroke="#6c757d"/>`,
  stone: `${block(10, 38, 22, 14)}${block(33, 38, 22, 14)}${block(20, 23, 24, 15)}`,
  timber: [0, 1, 2].map((k) => `<rect x="8" y="${20 + k * 11}" width="46" height="10" rx="5" fill="${P.wood}" stroke="${P.woodD}"/><ellipse cx="53" cy="${25 + k * 11}" rx="4" ry="5" fill="${P.woodL}" stroke="${P.woodD}"/><circle cx="53" cy="${25 + k * 11}" r="1.6" fill="none" stroke="${P.woodD}"/>`).join(''),
  lime: `<path d="M18 22 Q32 14 46 22 L50 52 Q32 58 14 52 Z" fill="${P.parch}" stroke="${P.parchD}" stroke-width="1.5"/><path d="M20 22 Q32 30 44 22" fill="${P.lime}" stroke="${P.limeD}"/><circle cx="26" cy="12" r="3" fill="${P.lime}"/><circle cx="34" cy="9" r="2.5" fill="${P.lime}"/><circle cx="40" cy="14" r="2" fill="${P.lime}"/>`,
  permit: `<rect x="14" y="12" width="36" height="40" rx="3" fill="${P.parch}" stroke="${P.parchD}" stroke-width="1.5"/><path d="M20 22 h24 M20 28 h24 M20 34 h16" stroke="#a08a5e" stroke-width="2" stroke-linecap="round"/><circle cx="40" cy="46" r="7" fill="${P.red}" stroke="#7b241c"/><path d="M36 52 l-3 8 l4 -2 l3 3 z M44 52 l3 8 l-4 -2 l-3 3 z" fill="${P.red}"/>`,
  gift: `<path d="M24 16 h16 l-2 6 q10 6 10 18 q0 14 -16 14 q-16 0 -16 -14 q0 -12 10 -18 z" fill="${P.wine}" stroke="${P.wineD}" stroke-width="1.5"/><path d="M22 34 q10 6 20 0" stroke="${P.gold}" stroke-width="3" fill="none"/><path d="M28 22 q-2 8 -6 14" stroke="rgba(255,255,255,.3)" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  baker: `${person(24, 26, P.shirt, P.bread)}<ellipse cx="44" cy="40" rx="14" ry="7" fill="${P.woodL}" stroke="${P.woodD}"/>${loaf(40, 36, 0.6)}${loaf(48, 37, 0.6)}${loaf(44, 32, 0.6)}`,
  oven: `<path d="M8 50 Q8 16 32 16 Q56 16 56 50 Z" fill="${P.stone}" stroke="${P.stoneD}" stroke-width="1.5"/><path d="M14 30 q18 -14 36 0" stroke="${P.stoneL}" stroke-width="2" fill="none"/><path d="M22 50 Q22 34 32 34 Q42 34 42 50 Z" fill="#3b2a20"/>${flame(32, 48, 0.8)}<rect x="6" y="50" width="52" height="5" rx="2" fill="${P.stoneD}"/>`,
  firewatch: `${person(26, 26, P.shirt, '#2e86c1')}<path d="M40 30 l12 0 l-2 14 l-8 0 z" fill="#8a8f98" stroke="#5f646c"/><path d="M40 30 q6 -8 12 0" stroke="#5f646c" fill="none" stroke-width="1.5"/><path d="M42 31 h8" stroke="${P.water}" stroke-width="3"/>`,
  buckets: `${[14, 36].map((x) => `<path d="M${x} 26 l16 0 l-3 22 l-10 0 z" fill="#8a8f98" stroke="#5f646c"/><path d="M${x + 1} 27 h14" stroke="${P.water}" stroke-width="3"/>`).join('')}<path d="M28 12 q2 6 0 10 q-2 -4 0 -10 z M36 8 q2 6 0 10 q-2 -4 0 -10 z" fill="${P.water}"/>`,
  // works
  market: `<path d="M6 22 L32 10 L58 22 Z" fill="${P.red}"/>${[0, 1, 2, 3, 4].map((k) => `<path d="M${6 + k * 10.4} 22 h10.4 v6 q-5.2 5 -10.4 0 z" fill="${k % 2 ? P.shirt : P.red}"/>`).join('')}<rect x="10" y="30" width="3" height="24" fill="${P.woodD}"/><rect x="51" y="30" width="3" height="24" fill="${P.woodD}"/><rect x="12" y="42" width="40" height="6" rx="1" fill="${P.wood}"/>${loaf(22, 40, 0.5)}<circle cx="34" cy="39" r="3.5" fill="${P.leaf}"/><circle cx="43" cy="39" r="3.5" fill="#e67e22"/>`,
  well: `<ellipse cx="32" cy="44" rx="20" ry="9" fill="${P.stoneD}"/><ellipse cx="32" cy="40" rx="20" ry="9" fill="${P.stone}" stroke="${P.stoneD}"/><ellipse cx="32" cy="40" rx="13" ry="5" fill="${P.waterD}"/><rect x="14" y="14" width="3" height="26" fill="${P.woodD}"/><rect x="47" y="14" width="3" height="26" fill="${P.woodD}"/><path d="M10 16 L32 6 L54 16 Z" fill="${P.red}"/><path d="M32 16 v14" stroke="#6c757d"/><path d="M28 30 h8 l-1 5 h-6 z" fill="${P.wood}"/>`,
  wall_n: 'wall', wall_e: 'wall', wall_s: 'wall',
  wall: `<rect x="6" y="24" width="52" height="30" fill="${P.stone}" stroke="${P.stoneD}" stroke-width="1.5"/>${[0, 1, 2, 3, 4, 5].map((k) => `<rect x="${6 + k * 9}" y="16" width="6" height="9" fill="${P.stone}" stroke="${P.stoneD}"/>`).join('')}${[0, 1, 2].map((r) => [0, 1, 2, 3].map((k) => `<path d="M${6 + k * 13 + (r % 2) * 6} ${30 + r * 8} h11" stroke="${P.stoneD}"/>`).join('')).join('')}`,
  gate: `<rect x="6" y="16" width="52" height="40" fill="${P.stone}" stroke="${P.stoneD}" stroke-width="1.5"/>${[0, 1, 2, 3, 4, 5].map((k) => `<rect x="${6 + k * 9}" y="9" width="6" height="8" fill="${P.stone}" stroke="${P.stoneD}"/>`).join('')}<path d="M20 56 V36 Q32 22 44 36 V56 Z" fill="${P.woodD}"/><path d="M26 56 V38 M32 56 V32 M38 56 V38" stroke="${P.wood}" stroke-width="2"/>`,
  // resources and signs
  coin: `<circle cx="32" cy="32" r="20" fill="${P.gold}" stroke="${P.goldD}" stroke-width="2.5"/><circle cx="32" cy="32" r="13" fill="none" stroke="${P.goldD}" stroke-width="1.5"/><path d="M26 26 q6 -6 12 0" stroke="#fff3c4" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  favour: `<path d="M10 44 L14 20 L24 32 L32 14 L40 32 L50 20 L54 44 Z" fill="${P.gold}" stroke="${P.goldD}" stroke-width="2" stroke-linejoin="round"/><rect x="10" y="44" width="44" height="8" rx="2" fill="${P.goldD}"/><circle cx="32" cy="36" r="4" fill="${P.red}"/><circle cx="20" cy="40" r="3" fill="#2e86c1"/><circle cx="44" cy="40" r="3" fill="#27ae60"/>`,
  people: `${person(22, 26, P.shirt, '#2e86c1', 0.9)}${person(42, 28, '#e8d3b0', P.sash, 0.9)}`,
  bread: `${loaf(32, 34, 2)}`,
  fire: `${flame(32, 40, 2)}`,
  king: `${person(32, 30, '#8e2c48', P.gold, 1.4)}<path d="M22 8 l3 7 l4 -5 l3 6 l3 -6 l4 5 l3 -7 v9 h-20 z" fill="${P.gold}" stroke="${P.goldD}"/>`,
};

export function iconSVG(id) {
  let body = ICONS[id] ?? ICONS.stone;
  if (body === 'wall') body = ICONS.wall;
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
}

// An <img>-able data URL of the same picture (for canvas drawing).
const urls = new Map();
export function iconURL(id) {
  if (!urls.has(id)) urls.set(id, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSVG(id))}`);
  return urls.get(id);
}
