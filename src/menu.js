// The arcade menu: pick a game with the stick, press A or START to play.
// Games are listed in games.json; each runs on its own port, and gets the
// menu's address and the chosen language so it can come back here.

import { h } from './dom.js';
import { Input } from './input.js';
import { createScenery } from './scenery.js';
import { paintedThumb } from './art.js';

const LANGS = ['es', 'eu', 'en'];
const LANG_NAMES = { es: 'Castellano', eu: 'Euskara', en: 'English' };
const IDLE_SHOWCASE = 30; // seconds without input before the menu shows games off by itself
const FIXED = 1 / 60;

const stage = document.getElementById('stage');
const root = document.getElementById('menu');
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(`arcade.${k}`)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(`arcade.${k}`, JSON.stringify(v)); } catch { /* storage blocked */ } },
};

let games = [];
let strings = {};
// The language someone picked here before; otherwise the browser's own, when
// it's Spanish, Basque or English; otherwise Spanish.
function browserLang() {
  const list = navigator.languages?.length ? navigator.languages : [navigator.language ?? ''];
  for (const l of list) { const code = String(l).toLowerCase().split('-')[0]; if (LANGS.includes(code)) return code; }
  return 'es';
}
let lang = store.get('lang', null) ?? browserLang();
let sel = 0;
let input = null;
let idle = 0;
let launching = false;
let drawScenery = null;
let sponsors = null;
let credits = null;
let sponsorAt = 0;
let showcaseStep = 0;
let sponsorsAreTest = false;
let showingThanks = false;
let sponsorClock = 0;
let showcaseT = 0;
const SHOWCASE_STEP = 7; // seconds per game in the idle showcase

const t = (key, vars = {}) => (strings[lang]?.[key] ?? strings.es?.[key] ?? key).replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);

function rich(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(/\[(A|B|C|START)\]/g)) {
    out.push(text.slice(last, m.index), h('span', { class: `btn btn-${m[1].toLowerCase()}` }, m[1]));
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

// CSS zoom (not a transform) so the browser lays the menu out at full screen
// size: text is drawn sharp at the real resolution instead of being drawn
// small and stretched. The pixel-art backdrop canvas stays crisp on its own.
//
// Upright screens (phones, iPads held tall) get their own layout instead of a
// tiny letterboxed 16:9 strip: the stage keeps the screen's shape, a narrow
// width (so text reads at a comfortable size) and stacks everything in a column.
const coarse = matchMedia('(pointer: coarse)');
function fit() {
  // clientWidth, not innerWidth: a phone widens innerWidth to fit whatever
  // overflowed last time, so sizing from it would feed on itself.
  const W = document.documentElement.clientWidth, H = document.documentElement.clientHeight;
  const tall = H > W * 0.9;
  const touch = coarse.matches || navigator.maxTouchPoints > 0;
  document.body.classList.toggle('tall', tall);
  document.body.classList.toggle('touch', touch);
  if (tall) {
    const w = Math.round(Math.max(240, Math.min(420, W / 1.6)));
    const k = W / w;
    stage.style.zoom = k;
    stage.style.width = `${w}px`;
    stage.style.height = `${H / k}px`;
    stage.style.left = stage.style.top = '0px';
    // The preview may not eat more than a quarter (a phone) to a third (a tablet) of the screen's height.
    stage.style.setProperty('--preview-w', `${Math.min(w - 30, (H / k) * (w > 300 ? 0.36 : 0.25) * 16 / 9)}px`);
  } else {
    const k = Math.min(W / 480, H / 270);
    stage.style.zoom = k;
    stage.style.width = '480px';
    stage.style.height = '270px';
    // With zoom, left/top are in zoomed units too.
    stage.style.left = `${(W - 480 * k) / 2 / k}px`;
    stage.style.top = `${(H - 270 * k) / 2 / k}px`;
  }
  const shape = `${tall}/${touch}`;
  isTouch = touch;
  if (el && shape !== lastShape) render();
  lastShape = shape;
}
let isTouch = false, lastShape = '';
addEventListener('resize', fit);
coarse.addEventListener?.('change', fit);
// A tap or a swipe counts as someone being here, like a button press.
for (const ev of ['pointerdown', 'wheel', 'touchmove']) addEventListener(ev, () => { idle = 0; }, { passive: true });

// Run locally (fire-up-arcade), every game has its own port on this machine.
// In the online site (build-site.py marks it) the games sit under games/<id>/.
const ONLINE = !!document.querySelector('meta[name="arcade-online"]');

function gameUrl(g) {
  const menu = `${location.origin}${location.pathname}`;
  const base = ONLINE ? new URL(g.url, location.href).href : `${location.protocol}//${location.hostname}:${g.port}/`;
  return `${base}?menu=${encodeURIComponent(menu)}&lang=${lang}`;
}

// Built once; later updates only swap classes and the featured panel, so the
// CSS transitions can run.
let el = null;
let focus = 'games'; // or 'lang'

function build() {
  el = {
    title: h('h1', {}),
    langs: h('div', { class: 'langs' }),
    feature: h('div', { class: 'feature' }),
    cards: h('div', { class: 'cards' }),
    play: h('button', { class: 'play', onClick: () => launch() }),
    hint: h('p', { class: 'hint' }),
    exit: h('p', { class: 'hint small' }),
    sponsor: h('div', { class: 'sponsor-plate' }),
    credit: h('div', { class: 'credit' }),
  };
  root.replaceChildren(
    h('header', {}, el.title, el.langs),
    el.feature,
    el.play,
    el.cards,
    h('footer', {}, el.sponsor, h('div', { class: 'hints' }, el.hint, el.exit), el.credit),
  );
  el.cardEls = games.map((g, i) => {
    const card = h('div', { class: `card ${g.status}`, onClick: () => (i === sel ? launch() : pick(i)) },
      g.poster || g.thumb ? h('div', { class: 'thumb', style: { backgroundImage: `url(${g.poster ?? g.thumb})` } }) : h('div', { class: 'thumb blank' }),
      h('span', { class: `pace ${g.pace}` }),
      h('span', { class: 'name' }));
    el.cards.append(card);
    return card;
  });
}

function pick(i) {
  if (i === sel) return;
  const dir = i > sel ? 1 : -1;
  sel = i;
  store.set('last', games[sel].id);
  beep(520, 0.04);
  render(dir);
}

function move(dir) {
  pick((sel + dir + games.length) % games.length);
}

function render(dir = 0) {
  document.documentElement.lang = lang;
  document.title = t('title');
  el.title.textContent = t('title');
  el.langs.replaceChildren(
    h('span', { class: 'lang-label' }, t('lang')),
    ...LANGS.map((l) => h('button', { class: `lang ${l === lang ? 'on' : ''}`, onClick: () => setLanguage(l) },
      h('span', { class: 'long' }, LANG_NAMES[l]), h('span', { class: 'short' }, l.toUpperCase()))));
  el.langs.classList.toggle('focus', focus === 'lang');
  el.cardEls.forEach((c, i) => {
    c.classList.toggle('sel', i === sel);
    c.querySelector('.name').textContent = games[i].title[lang] ?? games[i].title.es;
    c.querySelector('.pace').textContent = `${t(games[i].pace)} · ${t('min', { n: games[i].minutes })}`;
    const blank = c.querySelector('.thumb.blank');
    if (blank) blank.textContent = games[i].title[lang] ?? games[i].title.es;
  });
  el.cards.classList.toggle('dim', focus === 'lang');

  // The featured game: big moving preview on the left, its story on the right.
  const g = games[sel], L = (o) => (o ? o[lang] ?? o.es : '');
  const players = g.players === '1' ? t('player1') : t('players', { n: g.players.replace('-', '–') });
  const panel = h('div', { class: `feature-inner ${dir > 0 ? 'from-right' : dir < 0 ? 'from-left' : 'fade'}` },
    h('div', { class: `preview ${g.status}` },
      // Real gameplay when there's a clip; otherwise a slow pan over the picture.
      g.preview ? h('video', { class: 'clip', src: g.preview, poster: g.poster ?? '', muted: true, autoplay: true, loop: true, playsinline: true, preload: 'auto' })
        : g.thumb ? h('div', { class: 'pan', style: { backgroundImage: `url(${g.thumb})` } }) : h('div', { class: 'pan blank' }, L(g.title)),
      g.status === 'soon' ? h('span', { class: 'badge' }, t('soon')) : null),
    h('div', { class: 'info' }, h('div', { class: 'info-body' },
      h('div', { class: 'title-row' }, h('h2', {}, L(g.title)), h('span', { class: `pace-tag ${g.pace}` }, `${t(g.pace)} · ${t('min', { n: g.minutes })}`)),
      h('p', { class: 'blurb' }, L(g.blurb)),
      h('p', { class: `best ${g.pace}` }, L(g.bestFor)),
      h('h3', {}, t('learn')),
      h('p', { class: 'lesson' }, L(g.lesson)),
      h('div', { class: 'chips' },
        h('span', { class: 'chip' }, h('b', {}, t('when')), ' ', L(g.era), ' · ', h('b', {}, t('where')), ' ', L(g.place)),
        h('span', { class: 'chip' }, players, ...(isTouch || document.body.classList.contains('tall') ? [] : [' · ', L(g.controls)]))))));
  el.feature.replaceChildren(panel);
  fitText();
  // Once the layout has settled (fonts, the new panel sliding in), fit again.
  requestAnimationFrame(() => requestAnimationFrame(fitText));
  setTimeout(fitText, 400);
  const clip = panel.querySelector('video');
  if (clip) { clip.muted = true; clip.play().catch(() => {}); } // muted, so browsers let it autoplay

  renderSponsor();
  el.credit.replaceChildren(...(credits ? [h('span', { class: 'sponsor-label' }, S(credits.label)),
    h('span', { class: 'credit-mark' }, credits.logo ? h('img', { src: credits.logo, alt: '' }) : null, credits.name)] : []));
  // On a touch screen there's no stick to describe: say what to tap instead.
  el.hint.replaceChildren(...rich(t(isTouch ? 'hintTouch' : focus === 'lang' ? 'hintLang' : 'hint')));
  el.exit.replaceChildren(...rich(t(isTouch ? 'exitHintTouch' : 'exitHint')));
  fitText();
  el.play.textContent = g.status === 'ready' ? `▶ ${t('play')}` : t('soon');
  el.play.disabled = g.status !== 'ready';
  // Upright, the button gets its own row; on a wide screen it sits on the
  // preview's corner so the 16:9 layout keeps its room.
  if (document.body.classList.contains('tall')) el.feature.after(el.play);
  else panel.querySelector('.preview').append(el.play);
  // Keep the chosen card in view in the swipeable strip.
  // (Scrolling the strip itself, so the page doesn't jump down to it.)
  if (document.body.classList.contains('tall')) {
    const c = el.cardEls[sel];
    el.cards.scrollTo({ left: c.offsetLeft - el.cards.offsetLeft - (el.cards.clientWidth - c.offsetWidth) / 2, behavior: dir ? 'smooth' : 'auto' });
  }
}

// ---- keeping text inside its box, in every language ---------------------------

// The featured game's text shrinks a little when a description runs long,
// and long names on the cards shrink to fit their card, so nothing ever
// spills out, whatever the language.
function fitText() {
  const info = el.feature.querySelector('.info'), body = info?.querySelector('.info-body');
  if (body) {
    body.style.zoom = '';
    const room = info.getBoundingClientRect().height;
    for (let z = 1; z >= 0.62 && body.getBoundingClientRect().height > room + 0.5; z -= 0.04) body.style.zoom = String(z);
  }
  for (const c of el.cardEls) for (const n of c.querySelectorAll('.name, .pace')) shrink(n);
  for (const n of [el.hint, el.exit, ...el.feature.querySelectorAll('.pace-tag')]) shrink(n);
}
// One line of text, made smaller until it fits its box.
function shrink(n) {
  n.style.fontSize = '';
  if (!n.clientWidth) return;
  let size = parseFloat(getComputedStyle(n).fontSize);
  while (n.scrollWidth > n.clientWidth + 0.5 && size > 4.5) { size -= 0.25; n.style.fontSize = `${size}px`; }
}
addEventListener('resize', () => el && fitText());
document.fonts?.ready.then(() => el && fitText());

// ---- sponsors -----------------------------------------------------------------

const S = (o) => (typeof o === 'string' ? o : o ? o[lang] ?? o.es : '');

function sponsorBadge(sp, big = false) {
  const logo = (big && sp.logoBig) || sp.logo;
  return h('div', { class: `sponsor ${sp.placeholder ? 'placeholder' : ''} ${big ? 'big' : ''} ${sp.plate === 'dark' ? 'dark' : ''} ${big && sp.logoBig ? 'tall' : ''}` },
    logo ? h('img', { src: logo, alt: S(sp.name) }) : h('span', { class: 'sponsor-name' }, S(sp.name)),
    big && sp.tagline ? h('span', { class: 'sponsor-tag' }, S(sp.tagline)) : null);
}

// The corner plate: one sponsor at a time in the same spot. When there are
// several, the plate flips over to show the next, like a turning sign.
let shownSponsor = null;
function renderSponsor() {
  if (!sponsors?.sponsors?.length) { el.sponsor.replaceChildren(); shownSponsor = null; return; }
  const sp = sponsors.sponsors[sponsorAt % sponsors.sponsors.length];
  let slot = el.sponsor.querySelector('.sponsor-slot');
  if (!slot) {
    slot = h('div', { class: 'sponsor-slot' });
    el.sponsor.replaceChildren(h('span', { class: 'sponsor-label' }, S(sponsors.label)), slot);
    shownSponsor = null;
  } else el.sponsor.querySelector('.sponsor-label').textContent = S(sponsors.label);
  if (shownSponsor === sp) {
    // Same sponsor (a language change): just refresh it in place.
    slot.replaceChildren(h('div', { class: 'face' }, sponsorBadge(sp)));
    return;
  }
  const incoming = h('div', { class: `face ${shownSponsor ? 'flip-in' : ''}` }, sponsorBadge(sp));
  const outgoing = slot.querySelector('.face');
  if (outgoing && shownSponsor) {
    outgoing.className = 'face flip-out';
    outgoing.addEventListener('animationend', () => outgoing.remove(), { once: true });
    slot.append(incoming);
  } else slot.replaceChildren(incoming);
  shownSponsor = sp;
}

// The showcase's big sponsor screen, shown after the last game in the rotation.
function renderThanks() {
  el.cardEls.forEach((c) => c.classList.remove('sel'));
  const list = sponsors.sponsors;
  el.feature.replaceChildren(h('div', { class: `feature-inner thanks from-right ${list.length === 1 ? 'solo' : ''}` },
    h('h2', {}, S(sponsors.label)),
    h('div', { class: 'sponsor-grid' }, list.map((sp) => sponsorBadge(sp, true)))));
}

function setLanguage(l) {
  if (l === lang) return;
  lang = l;
  store.set('lang', lang);
  beep(520, 0.04);
  render();
}

async function launch() {
  const g = games[sel];
  if (g.status !== 'ready' || launching) { beep(160, 0.12); return; }
  launching = true;
  beep(660, 0.06); beep(990, 0.08, 0.06);
  root.classList.add('leaving');
  const url = gameUrl(g);
  // Make sure the game's server is up before leaving the menu.
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store' });
    location.href = url;
  } catch {
    launching = false;
    root.classList.remove('leaving');
    root.append(h('div', { class: 'toast' }, t('offline')));
    setTimeout(() => root.querySelector('.toast')?.remove(), 3000);
  }
}

// Tiny synthesised beeps; no audio files needed.
let actx = null;
function beep(freq, dur, delay = 0) {
  try {
    actx ??= new AudioContext();
    const o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime + delay;
    o.type = 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.08, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(actx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  } catch { /* no audio */ }
}

function update(dt) {
  input.poll(dt);
  if (input.activity) idle = 0;
  else idle += dt;
  const cycle = (d) => setLanguage(LANGS[(LANGS.indexOf(lang) + d + LANGS.length) % LANGS.length]);
  if (focus === 'lang') {
    if (input.any('left')) cycle(-1);
    if (input.any('right')) cycle(1);
    if (input.any('down') || input.any('a') || input.any('b')) { focus = 'games'; beep(440, 0.04); render(); }
    else if (input.any('start')) { focus = 'games'; launch(); }
  } else {
    if (input.any('left')) move(-1);
    if (input.any('right')) move(1);
    if (input.any('up')) { focus = 'lang'; beep(440, 0.04); render(); }
    if (input.any('a') || input.any('start')) launch();
  }
  if (input.any('c')) cycle(1);
  // Nobody here: show the games off one by one.
  // After each round of games, the showcase thanks the sponsors.
  // Each game is shown for 7 s; the sponsors' screen stays 50% longer.
  showcaseT = idle > IDLE_SHOWCASE ? showcaseT + dt : 0;
  if (idle > IDLE_SHOWCASE && showcaseT >= (showingThanks ? SHOWCASE_STEP * 1.5 : SHOWCASE_STEP)) {
    showcaseT = 0;
    focus = 'games';
    showcaseStep++;
    // Round the games in order; after the last one, the sponsors (if any).
    if (sel === games.length - 1 && sponsors?.sponsors?.length && !showingThanks) { showingThanks = true; renderThanks(); }
    else { showingThanks = false; sel = (sel + 1) % games.length; render(1); }
  }
  // The corner plate moves on to the next sponsor every few seconds.
  sponsorClock += dt;
  if (sponsorClock > 5 && sponsors?.sponsors?.length > 1) { sponsorClock = 0; sponsorAt++; renderSponsor(); }
}

let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  while (acc >= FIXED) { acc -= FIXED; update(FIXED); }
  drawScenery?.(now / 1000);
  requestAnimationFrame(frame);
}

// A local test list (data/sponsors.local.json, never published) wins over the
// public one when it exists.
async function loadSponsors() {
  const get = async (p) => { try { const r = await fetch(p, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; } };
  // Test mode: a private sponsors file on this Mac. Never used online.
  if (!ONLINE) {
    const test = await get('data/sponsors.local.json');
    if (test) { sponsorsAreTest = true; return test; }
  }
  return get('data/sponsors.json');
}

async function boot() {
  fit();
  try {
    const get = (p) => fetch(p, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(p); return r.json(); });
    const [config, controls, table, sponsorList] = await Promise.all([get('games.json'), get('data/controls.json'), get('data/strings.json'), loadSponsors()]);
    sponsors = sponsorList;
    credits = await fetch('data/credits.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    games = config.games.filter((g) => g.status !== 'hidden');
    // "art:<name>" thumbnails are painted by the menu itself.
    for (const g of games) g.thumb = paintedThumb(g.thumb) ?? g.thumb;
    strings = table;
    if (!LANGS.includes(lang)) lang = 'es';
    sel = Math.max(0, games.findIndex((g) => g.id === store.get('last', null)));
    input = new Input(controls);
    drawScenery = createScenery(document.getElementById('bg'));
    build();
    render();
    requestAnimationFrame(frame);
  } catch (err) {
    console.error(err);
    root.textContent = `No se pudo cargar el menú / Could not load the menu (${err.message})`;
  }
}

// Coming back from a game via the browser's back cache: allow launching again.
addEventListener('pageshow', () => { launching = false; root.classList.remove('leaving'); });

boot();
