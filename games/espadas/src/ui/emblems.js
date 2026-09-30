// Identifying devices, drawn as round shields. Heraldry proper is a
// 12th-century invention, so nothing here claims to be a period coat of arms;
// where a device borrows a real motif, units.json says where from
// (faction.emblemNote) and the armies screen shows it.

const INK = '#2a2118';
const PALE = '#f3e7c9';

const DEVICES = {
  // Eight-pointed interlaced star, from the central medallion of the
  // Almohad banner at Las Huelgas, Burgos (its inscriptions are not used).
  huelgas: `<circle cx="20" cy="20" r="14.5" fill="none" stroke="#e3b554" stroke-width="1.2"/>
            <g fill="none" stroke="#e3b554" stroke-width="1.6" stroke-linejoin="round">
              <path d="M20 7 L33 20 L20 33 L7 20 Z"/><path d="M10.8 10.8 L29.2 10.8 L29.2 29.2 L10.8 29.2 Z"/>
            </g>
            <path d="M20.00 7.00 L22.76 13.35 L29.19 10.81 L26.65 17.24 L33.00 20.00 L26.65 22.76 L29.19 29.19 L22.76 26.65 L20.00 33.00 L17.24 26.65 L10.81 29.19 L13.35 22.76 L7.00 20.00 L13.35 17.24 L10.81 10.81 L17.24 13.35 Z" fill="#e3b554" opacity="0.35"/>
            <circle cx="20" cy="20" r="3" fill="#e3b554"/>`,
  // Displayed eagle from Sancho VII of Navarre's seal, drawn black; the seal
  // itself carries no colour, so the colours are an attribution.
  eagle: `<g fill="${INK}" stroke="${PALE}" stroke-width="0.6" stroke-linejoin="round">
            <path d="M17.4 16 L12.5 7.5 L11 10.5 L8.6 6.8 L7.6 11 L5 9.6 L5.8 14.6 L3.8 15.6 L6.8 18.8 L16.6 20.4 Z"/>
            <path d="M22.6 16 L27.5 7.5 L29 10.5 L31.4 6.8 L32.4 11 L35 9.6 L34.2 14.6 L36.2 15.6 L33.2 18.8 L23.4 20.4 Z"/>
            <path d="M17.6 13.4 L22.4 13.4 L23.2 22.6 L22.2 26.4 L24.6 31.6 L20 29.8 L15.4 31.6 L17.8 26.4 L16.8 22.6 Z"/>
            <circle cx="20" cy="11.4" r="2.7"/>
          </g>
          <path d="M17.6 10.6 L14.8 11.8 L17.6 12.6 Z" fill="${INK}"/>
          <path d="M18.4 25.6 L16.4 28.6 M21.6 25.6 L23.6 28.6" stroke="${INK}" stroke-width="1.2" stroke-linecap="round"/>`,
  // Sebka: the lozenge lattice of Almohad building, as on the Giralda.
  sebka: `<g fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
            <path d="M8 20 L14 13 L20 20 L26 13 L32 20 L26 27 L20 20 L14 27 Z"/>
            <path d="M14 13 L20 6.5 L26 13 M14 27 L20 33.5 L26 27"/>
          </g>
          <circle cx="20" cy="20" r="1.8" fill="${INK}"/>`,
  // Six-petalled compass rosette in a ring: a motif carved on Roman-era
  // funerary stelae in the Basque-Navarrese area. A device, not a coat of arms.
  rosette: `<circle cx="20" cy="20" r="11.6" fill="none" stroke="${PALE}" stroke-width="1.6"/>
            <path d="M20 20 A9.5 9.5 0 0 1 20.00 10.50 A9.5 9.5 0 0 1 20 20Z M20 20 A9.5 9.5 0 0 1 28.23 15.25 A9.5 9.5 0 0 1 20 20Z M20 20 A9.5 9.5 0 0 1 28.23 24.75 A9.5 9.5 0 0 1 20 20Z M20 20 A9.5 9.5 0 0 1 20.00 29.50 A9.5 9.5 0 0 1 20 20Z M20 20 A9.5 9.5 0 0 1 11.77 24.75 A9.5 9.5 0 0 1 20 20Z M20 20 A9.5 9.5 0 0 1 11.77 15.25 A9.5 9.5 0 0 1 20 20Z" fill="${PALE}" stroke="${INK}" stroke-width="0.9" stroke-linejoin="round"/>
            <circle cx="20" cy="20" r="1.6" fill="${INK}"/>`,
  // Three peaks: the mountain kingdom.
  peaks: `<path d="M7 29 L15 15 L20 21 L26 11 L33 29 Z" fill="${PALE}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
          <path d="M23.5 15 L26 11 L28.6 15.2" fill="none" stroke="${INK}" stroke-width="1.2"/>`,
  // Two crossed javelins.
  javelins: `<g stroke="${INK}" stroke-width="2.2" stroke-linecap="round"><line x1="10" y1="31" x2="29" y2="10"/><line x1="30" y1="31" x2="11" y2="10"/></g>
             <path d="M29 10 l-5 1.5 l3.5 3.5 Z M11 10 l5 1.5 l-3.5 3.5 Z" fill="${PALE}" stroke="${INK}" stroke-width="1"/>`,
  // A winged spearhead.
  spearhead: `<line x1="20" y1="34" x2="20" y2="20" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
              <path d="M20 6 C24 12 24 17 20 22 C16 17 16 12 20 6 Z" fill="${PALE}" stroke="${INK}" stroke-width="1.4"/>
              <path d="M13 22 L27 22" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
  // A horseshoe arch with banded voussoirs.
  arch: `<path d="M10 32 V20 A10 10 0 1 1 30 20 V32 H26 V20 A6 6 0 1 0 14 20 V32 Z" fill="${PALE}" stroke="${INK}" stroke-width="1.3"/>
         <g fill="#a33a2a"><path d="M10 20 A10 10 0 0 1 12.2 13.8 L15.3 16.3 A6 6 0 0 0 14 20 Z"/><path d="M17 10.5 A10 10 0 0 1 23 10.5 L21.8 14.3 A6 6 0 0 0 18.2 14.3 Z"/><path d="M27.8 13.8 A10 10 0 0 1 30 20 L26 20 A6 6 0 0 0 24.7 16.3 Z"/></g>`,
};

export function emblemSVG(key, color, size = 48) {
  return `<svg class="emblem" viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="20" cy="20" r="18.5" fill="${color}" stroke="${INK}" stroke-width="2"/>
    <circle cx="20" cy="20" r="15.5" fill="none" stroke="${PALE}" stroke-width="1" stroke-dasharray="2 2.2"/>
    ${DEVICES[key] ?? ''}
  </svg>`;
}

// The device alone, in pale, for drawing on banners (viewBox 0 0 40 40).
export function deviceSVG(key) {
  return DEVICES[key] ?? '';
}

// A standard-bearer silhouette with a big waving banner, as on 1066's army
// select screen, dressed like the army he carries it for: headgear, dress
// and shield shape come from the faction's look. Pure SVG over the scene.
const HEADS = {
  bare: '',
  cap: '<path d="M80 166 Q84 148 100 150 Q108 146 106 160 L104 166 Z"/>',
  hood: '<path d="M78 178 Q76 150 94 148 Q106 148 112 160 Q106 158 104 164 L106 180 Z"/>',
  nasal: '<path d="M78 166 L92 140 L106 166 Z"/><rect x="99" y="164" width="4" height="12"/>',
  round: '<path d="M78 168 A14 14 0 0 1 106 168 Z"/>',
  kettle: '<path d="M80 166 A12 12 0 0 1 104 166 Z"/><ellipse cx="92" cy="166" rx="20" ry="4"/>',
  greathelm: '<rect x="79" y="150" width="26" height="30" rx="3"/>',
  turban: '<ellipse cx="92" cy="159" rx="17" ry="14"/><ellipse cx="78" cy="166" rx="5" ry="4"/>',
  turbanHelm: '<ellipse cx="92" cy="164" rx="16" ry="9"/><path d="M83 160 L92 136 L101 160 Z"/>',
};
const SHIELDS = {
  round: (c) => `<circle cx="112" cy="222" r="24" fill="${c}" stroke="#15110c" stroke-width="3"/><circle cx="112" cy="222" r="5" fill="#15110c"/>`,
  buckler: (c) => `<circle cx="112" cy="222" r="15" fill="${c}" stroke="#15110c" stroke-width="3"/><circle cx="112" cy="222" r="4" fill="#15110c"/>`,
  heater: (c) => `<path d="M92 200 L132 200 Q132 234 112 256 Q92 234 92 200 Z" fill="${c}" stroke="#15110c" stroke-width="3"/>`,
  kite: (c) => `<path d="M92 204 Q112 188 132 204 Q130 236 112 262 Q94 236 92 204 Z" fill="${c}" stroke="#15110c" stroke-width="3"/>`,
  adarga: (c) => `<path d="M112 200 C104 192 86 194 86 214 C86 238 100 250 112 250 C124 250 138 238 138 214 C138 194 120 192 112 200 Z" fill="${c}" stroke="#15110c" stroke-width="3"/><path d="M112 202 L112 246" stroke="rgba(0,0,0,0.3)" stroke-width="2"/>`,
};
function body(dress, cloak) {
  const cape = cloak ? '<path d="M80 186 Q60 220 62 262 L84 250 Z"/>' : '';
  if (dress === 'robe' || dress === 'surcoat') {
    const split = dress === 'surcoat' ? '<path d="M90 298 L94 270 L98 298 Z" fill="#e8d9b0" opacity="0.0"/>' : '';
    return `${cape}<path d="M78 184 L108 184 L122 298 L66 298 Z"/>${split}`;
  }
  const hem = dress === 'mail' ? 262 : 250;
  return `${cape}<path d="M78 184 L108 184 L116 ${hem} L70 ${hem} Z"/>
    <path d="M76 ${hem} L88 ${hem} L86 298 L74 298 Z M96 ${hem} L108 ${hem} L112 298 L100 298 Z"/>`;
}

export function bannerBearerSVG(key, color, face = 1, shield = color, look = {}) {
  const wave = (a) => `M60 20 C 95 ${10 + a} 120 ${30 - a} 165 ${16 + a} L150 48 L168 ${78 + a} C 125 ${88 - a} 100 ${70 + a} 60 ${84 - a} Z`;
  return `<svg class="bearer" viewBox="0 0 200 300" aria-hidden="true" style="transform:scaleX(${face})">
    <g>
      <path fill="${color}" stroke="#15110c" stroke-width="1.5" d="${wave(0)}">
        <animate attributeName="d" dur="3.2s" repeatCount="indefinite" values="${wave(0)};${wave(8)};${wave(0)}"/>
      </path>
      <g transform="translate(88 22) scale(1.35)" opacity="0.95">${DEVICES[key] ?? ''}</g>
    </g>
    <line x1="60" y1="14" x2="72" y2="298" stroke="#15110c" stroke-width="5" stroke-linecap="round"/>
    <g fill="#15110c">
      <circle cx="92" cy="170" r="12"/>
      ${HEADS[look.head] ?? ''}
      ${body(look.dress, look.cloak)}
      <path d="M80 190 L64 214 L70 218 L86 200 Z"/>
    </g>
    ${(SHIELDS[look.shield] ?? SHIELDS.round)(shield)}
  </svg>`;
}
