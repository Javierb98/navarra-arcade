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
let lang = store.get('lang', 'es');
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

function fit() {
  const k = Math.min(innerWidth / 480, innerHeight / 270);
  const scale = k >= 1 ? Math.floor(k) : k;
  stage.style.transform = `scale(${scale})`;
  stage.style.left = `${Math.round((innerWidth - 480 * scale) / 2)}px`;
  stage.style.top = `${Math.round((innerHeight - 270 * scale) / 2)}px`;
}
addEventListener('resize', fit);

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
    hint: h('p', { class: 'hint' }),
    exit: h('p', { class: 'hint small' }),
    sponsor: h('div', { class: 'sponsor-plate' }),
    credit: h('div', { class: 'credit' }),
  };
  root.replaceChildren(
    h('header', {}, el.title, el.langs),
    el.feature,
    el.cards,
    h('footer', {}, el.sponsor, h('div', { class: 'hints' }, el.hint, el.exit), el.credit),
  );
  el.cardEls = games.map((g, i) => {
    const card = h('div', { class: `card ${g.status}`, onClick: () => (i === sel ? launch() : pick(i)) },
      g.thumb ? h('div', { class: 'thumb', style: { backgroundImage: `url(${g.thumb})` } }) : h('div', { class: 'thumb blank' }),
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
    ...LANGS.map((l) => h('button', { class: `lang ${l === lang ? 'on' : ''}`, onClick: () => setLanguage(l) }, LANG_NAMES[l])));
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
      g.thumb ? h('div', { class: 'pan', style: { backgroundImage: `url(${g.thumb})` } }) : h('div', { class: 'pan blank' }, L(g.title)),
      g.status === 'soon' ? h('span', { class: 'badge' }, t('soon')) : null),
    h('div', { class: 'info' },
      h('div', { class: 'title-row' }, h('h2', {}, L(g.title)), h('span', { class: `pace-tag ${g.pace}` }, `${t(g.pace)} · ${t('min', { n: g.minutes })}`)),
      h('p', { class: 'blurb' }, L(g.blurb)),
      h('p', { class: `best ${g.pace}` }, L(g.bestFor)),
      h('h3', {}, t('learn')),
      h('p', { class: 'lesson' }, L(g.lesson)),
      h('div', { class: 'chips' },
        h('span', { class: 'chip' }, h('b', {}, t('when')), ' ', L(g.era), ' · ', h('b', {}, t('where')), ' ', L(g.place)),
        h('span', { class: 'chip' }, players, ' · ', L(g.controls)))));
  el.feature.replaceChildren(panel);

  renderSponsor();
  el.credit.replaceChildren(...(credits ? [h('span', { class: 'sponsor-label' }, S(credits.label)),
    credits.logo ? h('img', { src: credits.logo, alt: credits.name }) : h('span', { class: 'sponsor-name' }, credits.name)] : []));
  el.hint.replaceChildren(...rich(t(focus === 'lang' ? 'hintLang' : 'hint')));
  el.exit.replaceChildren(...rich(t('exitHint')));
}

// ---- sponsors -----------------------------------------------------------------

const S = (o) => (typeof o === 'string' ? o : o ? o[lang] ?? o.es : '');

function sponsorBadge(sp, big = false) {
  const logo = (big && sp.logoBig) || sp.logo;
  return h('div', { class: `sponsor ${sp.placeholder ? 'placeholder' : ''} ${big ? 'big' : ''} ${sp.plate === 'dark' ? 'dark' : ''} ${big && sp.logoBig ? 'tall' : ''}` },
    logo ? h('img', { src: logo, alt: S(sp.name) }) : h('span', { class: 'sponsor-name' }, S(sp.name)),
    big && sp.tagline ? h('span', { class: 'sponsor-tag' }, S(sp.tagline)) : null);
}

// The corner plate: one sponsor at a time, fading to the next.
function renderSponsor() {
  if (!sponsors?.sponsors?.length) { el.sponsor.replaceChildren(); return; }
  const sp = sponsors.sponsors[sponsorAt % sponsors.sponsors.length];
  el.sponsor.replaceChildren(
    h('span', { class: 'sponsor-label' }, S(sponsors.label), sponsorsAreTest ? h('span', { class: 'test-tag' }, 'TEST') : null),
    h('div', { class: 'sponsor-slot' }, sponsorBadge(sp)));
}

// The showcase's big sponsor screen, shown after the last game in the rotation.
function renderThanks() {
  el.cardEls.forEach((c) => c.classList.remove('sel'));
  const list = sponsors.sponsors;
  el.feature.replaceChildren(h('div', { class: `feature-inner thanks from-right ${list.length === 1 ? 'solo' : ''}` },
    h('h2', {}, S(sponsors.label), sponsorsAreTest ? h('span', { class: 'test-tag' }, 'TEST') : null),
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
  if (idle > IDLE_SHOWCASE && Math.floor(idle / 7) !== Math.floor((idle - dt) / 7)) {
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
