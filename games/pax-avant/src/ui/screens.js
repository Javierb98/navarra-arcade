// Every screen is a function (app, arg) -> { update(dt), draw(ctx) }. It
// builds its own DOM inside app.ui, over the canvas, and moves on with
// app.go(). Flow: attract -> menu -> story(intro) -> briefing -> play ->
// results -> ceremony -> [initials] -> fact -> story(outro) -> attract.

import { h } from './dom.js';
import { t, getLang, setLang, nextLang, LANGS } from './i18n.js';
import { Season } from '../core/season.js';
import { newShepherd, shepherdInput } from '../core/shepherd_ai.js';
import { drawSeason, prepare, W, H } from './render.js';
import { drawScene } from './art.js';
import { sfx } from './audio.js';
import { langParam } from './arcade.js';
import { settings, topScores, qualifies, addScore } from './store.js';
import { keysOn, keyName, bySide } from './keys.js';
import { device } from './device.js';

const BOARD = 'cheese'; // one entry per valley's player; a new table for the new scoring

// "[A] whistle" -> button glyph + text, so non-readers can match the button
// (on the cabinet, and the phone's on-screen buttons look the same). At a
// computer it's the key instead ("Z whistle"). {p} picks whose keys; 'both'
// shows each player's key next to their mark, for prompts meant for either
// shepherd in a two-player season.
export function rich(text, p = 0) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(/\[(A|B|C|START)\]/g)) {
    const b = m[1].toLowerCase();
    parts.push(text.slice(last, m.index));
    if (!keysOn()) parts.push(h('span', { class: `btn btn-${b}` }, m[1]));
    else if (p === 'both') parts.push(h('span', { class: 'keypair' }, tag(0), h('kbd', {}, keyName(0, b)), tag(1), h('kbd', {}, keyName(1, b))));
    else parts.push(h('kbd', {}, keyName(p, b)));
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

const ICON = {
  one: '<svg viewBox="0 0 16 16"><circle cx="8" cy="4" r="3"/><rect x="5" y="8" width="6" height="8" rx="1"/></svg>',
  two: '<svg viewBox="0 0 24 16"><circle cx="7" cy="4" r="3"/><rect x="4" y="8" width="6" height="8" rx="1"/><circle cx="17" cy="4" r="3"/><rect x="14" y="8" width="6" height="8" rx="1"/></svg>',
  calm: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="4"/><path d="M8 0v3M8 13v3M0 8h3M13 8h3" stroke="currentColor" stroke-width="2"/></svg>',
  hard: '<svg viewBox="0 0 16 16"><path d="M1 15 L6 5 L9 10 L11 7 L15 15 Z"/></svg>',
  speech: '<svg viewBox="0 0 16 16"><path d="M2 2 h12 v9 h-7 l-4 3 v-3 h-1 z"/></svg>',
  sheep: '<svg viewBox="0 0 16 16"><ellipse cx="7" cy="8" rx="6" ry="4.5"/><rect x="12" y="5" width="4" height="5" rx="1.5"/><rect x="3" y="11" width="2" height="4"/><rect x="8" y="11" width="2" height="4"/></svg>',
  mountain: '<svg viewBox="0 0 16 16"><path d="M0 15 L6 3 L9 8 L11 5 L16 15 Z"/><path d="M6 3 L4.5 6 L7.5 6 Z" fill="#fff"/></svg>',
  hands: '<svg viewBox="0 0 16 16"><rect x="1" y="9" width="14" height="3" rx="1.5"/><rect x="3" y="5" width="12" height="3" rx="1.5"/><rect x="1" y="1" width="12" height="3" rx="1.5"/></svg>',
  star: '<svg viewBox="0 0 16 16"><path d="M8 1 L10 6 L15 6 L11 9.5 L12.5 15 L8 11.5 L3.5 15 L5 9.5 L1 6 L6 6 Z"/></svg>',
  starOff: '<svg viewBox="0 0 16 16"><path d="M8 1 L10 6 L15 6 L11 9.5 L12.5 15 L8 11.5 L3.5 15 L5 9.5 L1 6 L6 6 Z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  spring: '<svg viewBox="0 0 16 16"><circle cx="8" cy="6" r="2.5"/><circle cx="5" cy="4" r="2"/><circle cx="11" cy="4" r="2"/><circle cx="6" cy="8.5" r="2"/><circle cx="10" cy="8.5" r="2"/><rect x="7.3" y="10" width="1.4" height="6"/></svg>',
  summer: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="4"/><path d="M8 0v3M8 13v3M0 8h3M13 8h3M2 2l2 2M12 12l2 2M2 14l2-2M12 4l2-2" stroke="currentColor" stroke-width="1.6"/></svg>',
  autumn: '<svg viewBox="0 0 16 16"><path d="M8 1 C13 4 14 10 8 15 C2 10 3 4 8 1 Z"/><path d="M8 3 V16" stroke="#000" stroke-width="1" opacity=".4"/></svg>',
  storm: '<svg viewBox="0 0 16 16"><path d="M3 9 a3 3 0 0 1 1-6 a4 4 0 0 1 8 1 a2.5 2.5 0 0 1 0 5 Z"/><path d="M8 9 L6 13 L8.5 13 L7 16" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  moon: '<svg viewBox="0 0 16 16"><path d="M10 1 A7 7 0 1 0 15 11 A5.5 5.5 0 1 1 10 1 Z"/></svg>',
  drop: '<svg viewBox="0 0 16 16"><path d="M8 1 C11 6 13 8 13 11 A5 5 0 0 1 3 11 C3 8 5 6 8 1 Z"/></svg>',
  home: '<svg viewBox="0 0 16 16"><path d="M1 8 L8 2 L15 8 L13 8 L13 15 L3 15 L3 8 Z"/></svg>',
  lamb: '<svg viewBox="0 0 16 16"><ellipse cx="7" cy="9" rx="4.5" ry="3.5"/><rect x="10.5" y="6" width="3.5" height="4" rx="1.5"/><rect x="4" y="11" width="1.6" height="4"/><rect x="8" y="11" width="1.6" height="4"/></svg>',
  up: '<svg viewBox="0 0 16 16"><path d="M8 1 L15 9 L10.5 9 L10.5 15 L5.5 15 L5.5 9 L1 9 Z"/></svg>',
  cheese: '<svg viewBox="0 0 16 16"><path d="M1 7 L15 4 L15 12 L1 13 Z"/><circle cx="6" cy="9.5" r="1.3" fill="#000" opacity=".35"/><circle cx="11" cy="8" r="1" fill="#000" opacity=".35"/></svg>',
  heart: '<svg viewBox="0 0 16 16"><path d="M8 14 C2 10 1 7 1 5 A3.5 3.5 0 0 1 8 4 A3.5 3.5 0 0 1 15 5 C15 7 14 10 8 14 Z"/></svg>',
  open: '<svg viewBox="0 0 16 16"><rect x="2" y="1" width="1.6" height="14"/><path d="M3.6 2 H13 L11 5 L13 8 H3.6 Z"/></svg>',
  shut: '<svg viewBox="0 0 16 16"><rect x="1" y="7" width="14" height="2"/><rect x="1" y="11" width="14" height="2"/><rect x="2" y="5" width="2" height="10"/><rect x="12" y="5" width="2" height="10"/></svg>',
  bear: '<svg viewBox="0 0 18 16"><ellipse cx="8" cy="10" rx="7" ry="5"/><circle cx="14" cy="6" r="3.5"/><circle cx="12.5" cy="2.8" r="1.4"/><circle cx="16" cy="3" r="1.4"/></svg>',
  wolf: '<svg viewBox="0 0 18 16"><path d="M1 9 L5 6 L12 6 L14 2 L15 5 L17 7 L15 9 L13 9 L12 12 L10 12 L10 10 L6 10 L5 13 L3 13 L3 10 Z"/></svg>',
  cow: '<svg viewBox="0 0 18 16"><ellipse cx="8" cy="9" rx="6.5" ry="4"/><rect x="13" y="5" width="4" height="5" rx="1.5"/><rect x="3" y="12" width="2" height="4"/><rect x="10" y="12" width="2" height="4"/><path d="M13 5 L12 2 M17 5 L18 2" stroke="currentColor" stroke-width="1.2"/></svg>',
};
const icon = (name) => h('span', { class: 'icon', html: ICON[name] });
const tag = (side, extra = '') => h('span', { class: `ptag p${side + 1} ${extra}` });

// Arrows or W A S D (at a keyboard), in the order up, left, down, right.
const walkKeys = (p) => ['up', 'left', 'down', 'right'].map((d) => h('kbd', {}, keyName(p, d)));

// One shepherd's controls: walk, then what A, B and C do, with that
// player's own keys at a keyboard.
const controlsCol = (p, head) => h('div', { class: `keys-col p${p + 1}` },
  head,
  h('p', {}, ...(keysOn() ? [...walkKeys(p), ' ', t('keys.walk')] : [t('brief.walk')])),
  ['a', 'b', 'c'].map((b) => h('p', {}, rich(t(`brief.${b}`), p))));

// On the cabinet, which side of the machine a player stands at.
const side = (p) => (device === 'cabinet' ? h('small', {}, ` · ${t(p ? 'keys.right' : 'keys.left')}`) : null);

const newSeason = (app, opts) => new Season({ rules: app.data.rules, map: app.data.map, calendar: app.data.calendar, ...opts });

// ---- attract --------------------------------------------------------------

export function attract(app) {
  setLang(langParam ?? settings.lang);
  const demo = () => ({
    s: newSeason(app, { players: 2, seed: (app.time * 1000) | 0 }),
    crew: [newShepherd({ greed: 0.5 }), newShepherd({ greed: 0.7 })],
  });
  let d = demo(), age = 0;
  const cards = ['title', 'fact', 'title', 'scores'];
  let card = 0, cardT = 0, factI = Math.floor(Math.random() * app.data.facts.length);

  const show = () => {
    const kind = cards[card];
    if (kind === 'title') {
      app.ui.replaceChildren(h('div', { class: 'overlay attract' },
        h('h1', { class: 'logo' }, t('title.name')),
        h('p', { class: 'subtitle' }, t('title.subtitle')),
        h('p', { class: 'press' }, rich(t('title.press'))),
        h('p', { class: 'small' }, icon('one'), ' ', icon('two'), ' ', t('title.players'))));
    } else if (kind === 'fact') {
      factI = (factI + 1) % app.data.facts.length;
      app.ui.replaceChildren(h('div', { class: 'overlay attract' }, factCard(app.data.facts[factI]),
        h('p', { class: 'press small' }, rich(t('title.press')))));
    } else {
      app.ui.replaceChildren(h('div', { class: 'overlay attract' }, scoreTable(),
        h('p', { class: 'press small' }, rich(t('title.press')))));
    }
  };
  show();

  return {
    attract: true,
    update(dt) {
      d.s.step({ p1: shepherdInput(d.s, 0, d.crew[0]), p2: shepherdInput(d.s, 1, d.crew[1]) });
      if (d.s.finished || (age += dt) > 120) { d = demo(); age = 0; }
      if ((cardT += dt) > (cards[card] === 'title' ? 8 : 10)) { card = (card + 1) % cards.length; cardT = 0; show(); }
      const [p1, p2] = app.input.players;
      if (p2.pressed.start || p2.pressed.a) app.go('menu', { players: 2 });
      else if (p1.pressed.start || p1.pressed.a) app.go('menu', { players: 1 });
    },
    draw(ctx) {
      drawSeason(ctx, d.s, app.time, { grassBudget: 12 });
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, 0, W, H);
    },
  };
}

function factCard(fact) {
  return h('div', { class: 'card' },
    h('h3', {}, t('fact.title')),
    h('p', {}, t(fact.text_key)));
}

function scoreTable() {
  const rows = ['easy', 'normal'].map((d) => {
    const list = topScores(BOARD, d);
    return h('div', { class: 'scores-col' },
      h('h3', {}, icon(d === 'easy' ? 'calm' : 'hard'), ' ', t(`menu.difficulty.${d}`)),
      list.length ? h('ol', {}, list.map((s) => h('li', {}, h('span', {}, s.name), h('span', {}, s.score))))
        : h('p', { class: 'small' }, t('scores.empty')));
  });
  return h('div', { class: 'card scores' }, h('h2', {}, t('scores.title')), h('div', { class: 'scores-row' }, rows));
}

// ---- menu -----------------------------------------------------------------

export function menu(app, { players = 1 } = {}) {
  // A phone's on-screen controls are player 1's only, so there the computer
  // always takes Barétous.
  const phone = device === 'phone';
  const S = { players: phone ? 1 : players, difficulty: settings.difficulty };
  const rows = phone ? ['difficulty', 'lang', 'go'] : ['players', 'difficulty', 'lang', 'go'];
  let row = 0;

  const value = (r) => {
    if (r === 'players') return h('span', {}, icon(S.players === 2 ? 'two' : 'one'), ' ', t(`menu.players.${S.players}`));
    if (r === 'difficulty') return h('span', {}, icon(S.difficulty === 'easy' ? 'calm' : 'hard'), ' ', t(`menu.difficulty.${S.difficulty}`));
    if (r === 'lang') return h('span', { class: 'langs' }, LANGS.map((l) => h('span', { class: l === getLang() ? 'on' : '' }, t(`lang.${l}`))));
    return h('span', {}, rich(t('menu.go')));
  };
  const show = () => {
    app.ui.replaceChildren(h('div', { class: 'overlay menu' },
      h('h1', { class: 'logo small-logo' }, t('title.name')),
      h('div', { class: 'rows' }, rows.map((r, i) => h('div', { class: `row ${i === row ? 'sel' : ''} row-${r}` },
        r !== 'go' ? h('span', { class: 'label' }, r === 'lang' ? icon('speech') : null, t(`menu.${r}`)) : null,
        r !== 'go' && r !== 'lang' ? h('span', { class: 'arrow' }, '◀') : null,
        value(r),
        r !== 'go' && r !== 'lang' ? h('span', { class: 'arrow' }, '▶') : null))),
      h('p', { class: 'note' }, t(`menu.${S.difficulty}.note`)),
      h('p', { class: 'note' }, S.players === 1 ? t('menu.solo.note') : t('menu.duo.note')),
      h('p', { class: 'hint' }, rich(t('menu.hint')))));
  };
  show();

  const change = (dir) => {
    const r = rows[row];
    if (r === 'players') S.players = S.players === 1 ? 2 : 1;
    else if (r === 'difficulty') S.difficulty = S.difficulty === 'easy' ? 'normal' : 'easy';
    else if (r === 'lang') nextLang(dir);
    else return;
    sfx.move();
    show();
  };

  return {
    update() {
      const inp = app.input, p1 = inp.players[0];
      if (inp.players[1].pressed.start && S.players !== 2 && !phone) { S.players = 2; sfx.move(); show(); }
      if (inp.any('up')) { row = (row + rows.length - 1) % rows.length; sfx.move(); show(); }
      if (inp.any('down')) { row = (row + 1) % rows.length; sfx.move(); show(); }
      if (inp.any('left')) change(-1);
      if (inp.any('right')) change(1);
      if (inp.any('c')) { nextLang(1); sfx.move(); show(); }
      if (p1.pressed.start || inp.players[1].pressed.start || (inp.any('a') && rows[row] === 'go')) {
        sfx.ok();
        app.session = { ...S };
        app.go('story', { panels: app.data.story.intro, next: 'briefing' });
      } else if (inp.any('a')) { row = rows.length - 1; sfx.move(); show(); }
    },
    draw(ctx) { drawScene(ctx, 'pastures', app.time); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H); },
  };
}

// ---- story panels (intro / outro) -----------------------------------------

export function story(app, { panels, next, arg }) {
  let i = 0, t0 = 0;
  const PANEL = 7;
  const show = () => {
    app.ui.replaceChildren(h('div', { class: 'overlay story' },
      h('div', { class: 'caption' },
        h('p', {}, t(panels[i].text)),
        h('div', { class: 'dots' }, panels.map((_, k) => h('span', { class: k === i ? 'on' : '' }))),
        h('p', { class: 'hint' }, rich(t('ui.next')), '   ', rich(t('ui.skip'))))));
  };
  show();
  const advance = () => {
    if (++i >= panels.length) app.go(next, arg);
    else { t0 = 0; show(); }
  };
  return {
    update(dt) {
      if (app.input.any('start')) { app.go(next, arg); return; }
      if (app.input.any('a')) { sfx.move(); advance(); return; }
      if ((t0 += dt) > PANEL) advance();
    },
    draw(ctx) {
      if (!panels[i]) return;
      ctx.save();
      ctx.translate(0, -24);
      drawScene(ctx, panels[i].scene, app.time);
      ctx.restore();
      ctx.fillStyle = '#14121a';
      ctx.fillRect(0, H - 24, W, 24);
    },
  };
}

// ---- briefing: who is who, which buttons -------------------------------------

export function briefing(app) {
  const two = app.session.players === 2;
  let t0 = 0;
  app.ui.replaceChildren(h('div', { class: 'overlay briefing' },
    h('div', { class: 'card' },
      h('h2', {}, t('brief.title')),
      h('p', {}, t('brief.goal')),
      // Two players: one column each, so two people at one keyboard know
      // which keys are theirs. One player: the computer takes Barétous.
      h('div', { class: 'controls' },
        two ? h('div', { class: 'keys-card' },
          bySide().map((p) => controlsCol(p, h('h4', {}, tag(p), ' ', t(`brief.p${p + 1}`), side(p)))))
          : [h('p', {}, tag(0), ' ', t('brief.p1')),
            h('p', {}, tag(1), ' ', t('brief.cpu')),
            h('div', { class: 'keys-card one' }, controlsCol(0, null))],
        h('p', { class: 'small' }, icon('cheese'), ' ', t('brief.cheese'), '  ', icon('hands'), ' ', t('brief.trust'))),
      h('p', { class: 'hint' }, rich(t('ui.next'))))));
  return {
    update(dt) {
      t0 += dt;
      if (t0 > 0.5 && (app.input.any('a') || app.input.any('start'))) { sfx.ok(); app.go('play'); }
      else if (t0 > 25) app.go('play');
    },
    draw(ctx) { drawScene(ctx, 'pastures', app.time); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, H); },
  };
}

// ---- the summer ----------------------------------------------------------------

export function play(app) {
  const { players, difficulty } = app.session;
  const s = newSeason(app, { difficulty, players, seed: (app.time * 1000) | 0 });
  const R = app.data.rules;
  // One player: the computer takes Barétous, as greedy as the difficulty says.
  const partner = players === 1 ? newShepherd({ greed: R.difficulty[s.difficulty].aiGreed }) : null;
  prepare(s);
  let shake = 0, doneT = 0, promptT = 0;

  const el = {
    sheep: [h('span', {}), h('span', {})], cheese: [h('span', { class: 'cheese' }), h('span', { class: 'cheese' })],
    sun: h('span', { class: 'bar thin' }, h('i')),
    peace: h('span', { class: 'bar trust peace-bar' }, h('i')), peaceN: h('span', { class: 'num' }),
    banner: h('div', { class: 'banner hidden' }),
    prompt: h('div', { class: 'prompt hidden' }), big: h('div', { class: 'big' }), floats: h('div', { class: 'floats' }),
  };
  // Each valley's flock and cheese on its side; in the middle the summer
  // running out and the Peace both share.
  const line = (...kids) => h('span', { class: 'hud-line' }, ...kids);
  const side = (i) => h('span', { class: `hud-side side${i}` },
    line(tag(i), icon('sheep'), el.sheep[i]),
    line(el.cheese[i]));
  app.ui.replaceChildren(h('div', { class: 'overlay play' },
    h('div', { class: 'hud' },
      side(0),
      h('span', { class: 'hud-mid' },
        line(icon('summer'), el.sun),
        line(h('span', { class: 'hud-item peace' }, icon('hands'), el.peace, el.peaceN))),
      side(1)),
    el.floats, el.big, el.banner, el.prompt));

  const float = (text, x, y, cls = '') => {
    const f = h('span', { class: `float ${cls}`, style: { left: `${Math.round(x)}px`, top: `${Math.round(y - 12)}px` } }, text);
    el.floats.append(f);
    setTimeout(() => f.remove(), 1400);
  };
  const big = (text) => {
    el.big.replaceChildren(h('span', {}, text));
    el.big.classList.remove('pop'); void el.big.offsetWidth; el.big.classList.add('pop');
  };
  const prompt = (text, secs = 6, ic = null) => {
    el.prompt.replaceChildren(...(ic ? [icon(ic), ' '] : []), ...rich(text, players === 2 ? 'both' : 0));
    el.prompt.classList.remove('hidden');
    promptT = secs;
  };
  // A valley's name, and its Basque case forms (`of`: Erronkariko, `erg`:
  // Erronkarik); Castellano and English just repeat the name.
  const VK = ['valley.roncal', 'valley.baretous'];
  const names = (i, as = 'valley') => ({ [as]: t(VK[i]), of: t(`${VK[i]}.of`), [as === 'valley' ? 'erg' : `${as}Erg`]: t(`${VK[i]}.erg`) });
  const cost = (n) => `−${Math.round(n)} ${t('hud.peaceShort')}`;

  el.banner.replaceChildren(h('div', { class: 'card' },
    h('h2', {}, icon('summer'), ' ', t('banner.title')),
    h('p', {}, t('banner.text')),
    h('p', { class: 'small' }, icon('hands'), ' ', t('banner.peace'))));
  el.banner.classList.remove('hidden');

  // HUD: only touch the DOM when something changed.
  const hud = {};
  const set = (k, v, fn) => { if (hud[k] !== v) { hud[k] = v; fn(v); } };
  const updateHud = () => {
    for (const i of [0, 1]) {
      set(`cheese${i}`, Math.floor(s.cheese[i] * 10), () => el.cheese[i].replaceChildren(icon('cheese'), ` ${s.cheese[i].toFixed(1)}`));
      set(`sheep${i}`, s.sheep.filter((sh) => sh.side === i).length, (v) => { el.sheep[i].textContent = String(v); });
    }
    set('sun', Math.round(100 * Math.min(1, s.t / s.length)), (v) => { el.sun.firstChild.style.width = `${100 - v}%`; });
    set('peace', Math.round(s.peace), (v) => {
      el.peace.firstChild.style.width = `${v}%`;
      el.peaceN.textContent = v;
      el.peace.classList.toggle('low', s.tension >= 1);
      el.peace.classList.toggle('quarrel', s.tension >= 2);
    });
  };

  const onEvent = (e) => {
    switch (e.type) {
      case 'go': el.banner.classList.add('hidden'); sfx.go(); break;
      case 'prompt': prompt(t(e.key), 7); break;
      case 'bell': sfx.bell(); break;
      case 'whistle': sfx.whistle(); float(e.none ? '?' : '♪', e.x, e.y - 14); break;
      case 'grab': sfx.baa(true); if (e.theirs) { float(t('msg.grab'), e.x, e.y - 10, 'bad'); prompt(t('msg.grabText', { ...names(e.owner), ...names(e.side, 'thief') }), 4, 'sheep'); } break;
      case 'drop': sfx.move(); break;
      case 'reachNone': float('?', e.x, e.y - 14); break;
      case 'steal': sfx.empty(); shake = 1.5; float(cost(R.peace.steal), e.x, e.y, 'bad'); prompt(t('msg.steal', { ...names(e.from), ...names(e.side, 'thief') }), 5, 'sheep'); break;
      case 'recover': sfx.help(); float(t('msg.recover'), e.x, e.y, 'good'); break;
      case 'trespass': sfx.empty(); float(t('msg.trespass'), e.x, e.y, 'bad'); break;
      case 'wolves': sfx.wolf(); prompt(t(e.count > 1 ? 'msg.wolves' : 'msg.wolf', names(e.target)), 6, 'wolf'); break;
      case 'wolfScared': sfx.wolfGone(); float(t(e.helped ? 'msg.wolfHelped' : 'msg.wolfScared'), e.x, e.y, 'good'); if (e.helped) { sfx.help(); prompt(t('msg.helpedText', names(e.side)), 4, 'hands'); } break;
      case 'wolfLeaves': float(t('msg.wolfLeaves'), e.x, e.y); break;
      case 'bear': sfx.thunder(); shake = 2.5; big(t('msg.bear')); prompt(t('msg.bearText'), 8, 'bear'); break;
      case 'bearScared': sfx.shelter(); big(t('msg.bearTogether')); break;
      case 'bearLeaves': float(t('msg.bearLeaves'), e.x, e.y); break;
      case 'tension':
        if (e.rising) { sfx.warn(); big(t(e.level === 2 ? 'msg.brink' : 'msg.tense')); prompt(t(e.level === 2 ? 'msg.brinkText' : 'msg.tenseText'), 6, 'hands'); }
        else if (e.level === 0) { sfx.shelter(); prompt(t('msg.calm'), 4, 'hands'); }
        break;
      case 'war': sfx.thunder(); shake = 4; big(t('msg.war')); break;
      case 'finish': sfx.finish(); big(t('msg.finish')); break;
      default: break;
    }
  };

  updateHud();
  return {
    update(dt) {
      if (s.breakT > 0 && app.input.any('start')) s.breakT = Math.min(s.breakT, 0.05);
      const p2 = partner ? shepherdInput(s, 1, partner) : app.input.playInput(1);
      s.step({ p1: app.input.playInput(0), p2 });
      for (const e of s.events) onEvent(e);
      shake *= 0.9;
      if (promptT > 0 && (promptT -= dt) <= 0) el.prompt.classList.add('hidden');
      updateHud();
      if (s.finished && (doneT += dt) > (s.war ? 3.5 : 2.5)) app.go('results', { season: s });
    },
    draw(ctx) {
      const fx = shake > 0.2 ? { shakeX: (Math.random() - 0.5) * shake * 2, shakeY: (Math.random() - 0.5) * shake * 2 } : {};
      drawSeason(ctx, s, app.time, fx);
    },
  };
}

// ---- results ------------------------------------------------------------------

export function results(app, { season: s }) {
  const sc = s.score();
  const VK = ['valley.roncal', 'valley.baretous'];
  const named = (i) => ({ valley: t(VK[i]), erg: t(`${VK[i]}.erg`) });
  let t0 = 0;
  const two = app.session.players === 2;
  const col = (i) => {
    const v = sc.valleys[i];
    const row = (ic, label, val) => h('div', { class: 'res-row' }, icon(ic), h('span', { class: 'res-label' }, label), h('span', { class: 'res-pts' }, val));
    return h('div', { class: `res-col side${i} ${sc.winner === i ? 'win' : ''}` },
      h('h3', {}, tag(i), ' ', t(i === 0 ? 'valley.roncal' : 'valley.baretous'), sc.winner === i ? h('span', { class: 'crown' }, ` ${t('results.ahead')}`) : null),
      row('cheese', t('results.cheese'), String(v.cheese)),
      row('sheep', t('results.sheep'), String(v.sheep)),
      row('open', t('results.stolen'), String(v.stolen)),
      row('heart', t('results.helped'), String(v.helped)),
      row('hands', t('results.cost'), v.cost ? `−${Math.round(v.cost)}` : '—'),
      // At war, the valley's cheese counts for nothing: shown crossed out, 0.
      h('div', { class: 'res-total' }, h('span', {}, t('results.total')),
        sc.war ? h('span', {}, h('s', { class: 'lost' }, String(v.earned)), ' 0') : h('span', {}, String(v.total))));
  };
  const verdict = sc.war ? t('results.war')
    : sc.winner < 0 ? t('results.tie')
      : two ? t('results.winner', named(sc.winner))
        : t(sc.winner === 0 ? 'results.youWin' : 'results.theyWin');
  app.ui.replaceChildren(h('div', { class: 'overlay results' },
    h('div', { class: 'card wide' },
      h('h2', {}, t('results.title')),
      h('p', { class: `res-peace ${sc.war ? 'broken' : 'ok'}` }, icon('hands'), ' ',
        sc.war ? t('results.peaceBroken', named(Math.max(0, sc.warBy))) : t('results.peaceKept', { n: sc.peace })),
      h('div', { class: 'res-cols' }, col(0), col(1)),
      h('p', { class: 'res-verdict' }, verdict),
      h('p', { class: 'hint' }, rich(t('ui.next'))))));
  return {
    update(dt) {
      t0 += dt;
      if ((t0 > 1 && (app.input.any('a') || app.input.any('start'))) || t0 > 30) {
        sfx.ok();
        // The leaderboard is per valley: each player's own score, which is 0
        // after a war. (One player: only Roncal is yours.)
        const entries = (two ? [0, 1] : [0]).map((i) => ({ side: i, score: sc.valleys[i].total }));
        app.go('ceremony', { score: sc, entries });
      }
    },
    draw(ctx) { drawSeason(ctx, s, app.time); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H); },
  };
}

// ---- the 13 July ceremony --------------------------------------------------------

export function ceremony(app, { score, entries = [] }) {
  const tier = score.tier;
  let t0 = 0, popped = false;
  app.ui.replaceChildren(h('div', { class: 'overlay story ceremony' },
    h('div', { class: 'big pax' }),
    h('div', { class: 'caption' },
      h('p', {}, t(`ceremony.${tier}`)),
      score.ceremony ? h('p', { class: 'small' }, t('ceremony.cows')) : null,
      h('p', { class: 'hint' }, rich(t('ui.next'))))));
  const pax = app.ui.querySelector('.pax');
  sfx.ceremony(tier);
  return {
    update(dt) {
      t0 += dt;
      if (!popped && t0 > 1.2 && score.ceremony) { popped = true; pax.replaceChildren(h('span', {}, t('ceremony.pax'))); pax.classList.add('stay'); }
      if ((t0 > 2 && (app.input.any('a') || app.input.any('start'))) || t0 > 14) {
        const { difficulty } = app.session;
        const queue = entries.filter((e) => e.score > 0 && qualifies(BOARD, difficulty, e.score)).sort((a, b) => b.score - a.score);
        if (queue.length) app.go('initials', { score: queue[0].score, side: queue[0].side, queue: queue.slice(1) });
        else app.go('fact');
      }
    },
    draw(ctx) {
      ctx.save();
      ctx.translate(0, -24);
      drawScene(ctx, `ceremony${tier}`, app.time);
      ctx.restore();
      ctx.fillStyle = '#14121a';
      ctx.fillRect(0, H - 24, W, 24);
    },
  };
}

// ---- initials -------------------------------------------------------------

const ALPHABET = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';

export function initials(app, { score, side = 0, queue = [] }) {
  const letters = [0, 0, 0];
  let slot = 0, saved = null, t0 = 0;
  const show = () => {
    app.ui.replaceChildren(h('div', { class: 'overlay results' },
      saved ? scoreTable()
        : h('div', { class: 'card' },
          h('h2', {}, t('scores.new')),
          h('p', { class: 'small' }, tag(side), ' ', t(side === 0 ? 'valley.roncal' : 'valley.baretous')),
          h('p', { class: 'big-score' }, String(score)),
          h('div', { class: 'initials' }, letters.map((l, i) => h('span', { class: i === slot ? 'sel' : '' }, ALPHABET[l]))),
          h('p', { class: 'hint' }, keysOn() ? [h('kbd', {}, keyName(side, 'up')), h('kbd', {}, keyName(side, 'down')), ' '] : null, rich(t('scores.hint'), side)))));
  };
  show();
  return {
    update(dt) {
      const inp = app.input;
      if (saved) {
        if ((t0 += dt) > 6 || (t0 > 0.5 && (inp.any('a') || inp.any('start')))) {
          // The other valley's player gets their turn too, if they made the board.
          const next = queue.find((e) => qualifies(BOARD, app.session.difficulty, e.score));
          if (next) app.go('initials', { score: next.score, side: next.side, queue: queue.filter((e) => e !== next) });
          else app.go('fact');
        }
        return;
      }
      if (inp.any('up')) { letters[slot] = (letters[slot] + 1) % ALPHABET.length; sfx.move(); show(); }
      if (inp.any('down')) { letters[slot] = (letters[slot] + ALPHABET.length - 1) % ALPHABET.length; sfx.move(); show(); }
      if (inp.any('left') && slot > 0) { slot--; sfx.move(); show(); }
      if (inp.any('right') && slot < 2) { slot++; sfx.move(); show(); }
      if (inp.any('a') || inp.any('start')) {
        sfx.ok();
        if (slot < 2) slot++;
        else {
          addScore(BOARD, app.session.difficulty, letters.map((l) => ALPHABET[l]).join(''), score);
          saved = true;
        }
        show();
      }
    },
    draw(ctx) { drawScene(ctx, 'pastures', app.time); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H); },
  };
}

// ---- fact card between plays -----------------------------------------------

export function fact(app) {
  const facts = app.data.facts;
  const f = facts[Math.floor(Math.random() * facts.length)];
  const img = app.images.get(f.image);
  let t0 = 0;
  app.ui.replaceChildren(h('div', { class: 'overlay fact' }, factCard(f), h('p', { class: 'hint' }, rich(t('ui.next')))));
  return {
    update(dt) {
      t0 += dt;
      if ((t0 > 1 && (app.input.any('a') || app.input.any('start'))) || t0 > 20) {
        app.go('story', { panels: app.data.story.outro, next: 'attract' });
      }
    },
    draw(ctx) {
      if (img) ctx.drawImage(img, 0, 0, W, H);
      else drawScene(ctx, f.scene, app.time);
    },
  };
}
