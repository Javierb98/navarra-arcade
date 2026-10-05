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

const BOARD = 'valley'; // one entry per valley's player; a new table for the new scoring

// "[A] whistle" -> button glyph + text, so non-readers can match the button.
export function rich(text) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(/\[(A|B|C|START)\]/g)) {
    parts.push(text.slice(last, m.index), h('span', { class: `btn btn-${m[1].toLowerCase()}` }, m[1]));
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
  cow: '<svg viewBox="0 0 18 16"><ellipse cx="8" cy="9" rx="6.5" ry="4"/><rect x="13" y="5" width="4" height="5" rx="1.5"/><rect x="3" y="12" width="2" height="4"/><rect x="10" y="12" width="2" height="4"/><path d="M13 5 L12 2 M17 5 L18 2" stroke="currentColor" stroke-width="1.2"/></svg>',
};
const icon = (name) => h('span', { class: 'icon', html: ICON[name] });
const GOAL_ICON = { moveUp: 'up', graze: 'sheep', storm: 'storm', night: 'moon', drought: 'drop', moveDown: 'home' };
const SEASON_ICON = { spring: 'spring', summer: 'summer', autumn: 'autumn' };
const tag = (side, extra = '') => h('span', { class: `ptag p${side + 1} ${extra}` });

const newSeason = (app, opts) => new Season({ rules: app.data.rules, map: app.data.map, calendar: app.data.calendar, ...opts });

// ---- attract --------------------------------------------------------------

export function attract(app) {
  setLang(langParam ?? settings.lang);
  const demo = () => ({
    s: newSeason(app, { players: 2, seed: (app.time * 1000) | 0 }),
    crew: [newShepherd({ kind: true }), newShepherd({ kind: true })],
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
  const S = { players, difficulty: settings.difficulty };
  const rows = ['players', 'difficulty', 'lang', 'go'];
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
      if (inp.players[1].pressed.start && S.players !== 2) { S.players = 2; sfx.move(); show(); }
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
      h('div', { class: 'controls' },
        h('p', {}, tag(0), ' ', t('brief.p1')),
        h('p', {}, tag(1), ' ', t(two ? 'brief.p2' : 'brief.cpu')),
        h('p', { class: 'small' }, rich(t('brief.buttons'))),
        h('p', { class: 'small' }, icon('mountain'), ' ', t('brief.health'), '  ', icon('hands'), ' ', t('brief.trust'))),
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

// ---- the season ---------------------------------------------------------------

export function play(app) {
  const { players, difficulty } = app.session;
  const s = newSeason(app, { difficulty, players, seed: (app.time * 1000) | 0 });
  const partner = players === 1 ? newShepherd() : null;
  const R = app.data.rules;
  // Developer shortcut: index.html?week=4 lets the computer play up to week 4.
  const skipTo = Number(new URLSearchParams(location.search).get('week'));
  if (skipTo > 1) {
    const crew = [newShepherd({ kind: true }), newShepherd({ kind: true })];
    while (s.week < skipTo - 1 && !s.finished) s.step({ p1: shepherdInput(s, 0, crew[0]), p2: shepherdInput(s, 1, crew[1]) });
  }
  prepare(s);
  let shake = 0, doneT = 0, promptT = 0, warnT = -1;

  const el = {
    sheep: [h('span', {}), h('span', {})], stars: [h('span', { class: 'stars' }), h('span', { class: 'stars' })],
    cheese: [h('span', { class: 'cheese' }), h('span', { class: 'cheese' })], honour: [h('span', { class: 'honour' }), h('span', { class: 'honour' })],
    gate: [h('span', { class: 'gate' }), h('span', { class: 'gate' })], pass: h('span', { class: 'pass' }), cows: h('span', { class: 'cows' }),
    week: h('span', { class: 'week' }), weekBar: h('span', { class: 'bar thin' }, h('i')),
    health: h('span', { class: 'bar' }, h('i')), healthN: h('span', { class: 'num' }),
    trust: h('span', { class: 'bar trust' }, h('i')), trustN: h('span', { class: 'num' }),
    goal: h('div', { class: 'goal' }), banner: h('div', { class: 'banner hidden' }),
    prompt: h('div', { class: 'prompt hidden' }), big: h('div', { class: 'big' }), floats: h('div', { class: 'floats' }),
  };
  // Each valley's own race (sheep, stars, cheese, honour, its land open or
  // shut) on its side; in the middle the week, the pass, and the Peace.
  const line = (...kids) => h('span', { class: 'hud-line' }, ...kids);
  const side = (i) => h('span', { class: `hud-side side${i}` },
    line(tag(i), icon('sheep'), el.sheep[i], el.stars[i]),
    line(el.cheese[i], el.honour[i], el.gate[i]));
  app.ui.replaceChildren(h('div', { class: 'overlay play' },
    h('div', { class: 'hud' },
      side(0),
      h('span', { class: 'hud-mid' },
        line(el.week, el.weekBar, el.pass),
        line(h('span', { class: 'hud-item peace' }, icon('hands'), el.trust, el.trustN), el.cows)),
      side(1)),
    el.goal, el.floats, el.big, el.banner, el.prompt));

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
    el.prompt.replaceChildren(...(ic ? [icon(ic), ' '] : []), ...rich(text));
    el.prompt.classList.remove('hidden');
    promptT = secs;
  };
  const who = (i) => t(i === 0 ? 'valley.roncal.of' : 'valley.baretous.of');
  const starIcons = (goals) => goals.map((ok) => h('span', { class: ok ? 'star on' : 'star' }, icon(ok ? 'star' : 'starOff')));

  const showBanner = (lastGoals) => {
    const w = s.weekDef;
    el.banner.replaceChildren(h('div', { class: 'card' },
      h('h3', {}, icon(SEASON_ICON[w.season]), ' ', t('week.label', { n: s.week + 1, of: s.calendar.weeks.length }), ' · ', t(`season.${w.season}`)),
      h('h2', {}, icon(GOAL_ICON[w.goal]), ' ', t(`goal.${w.goal}.title`)),
      h('p', {}, rich(t(`goal.${w.goal}.text`))),
      h('p', { class: 'small passline' }, s.passOwner < 0 ? t('week.passBoth') : t('week.pass', { valley: t(s.passOwner === 0 ? 'valley.roncal' : 'valley.baretous') })),
      lastGoals ? h('p', { class: 'small last' }, t('week.last'), ' ', tag(0), ...starIcons([lastGoals[0]]), '  ', tag(1), ...starIcons([lastGoals[1]])) : null));
    el.banner.classList.remove('hidden');
  };

  // HUD: only touch the DOM when something changed.
  const hud = {};
  const set = (k, v, fn) => { if (hud[k] !== v) { hud[k] = v; fn(v); } };
  const bar = (b, v) => { b.firstChild.style.width = `${Math.round(v)}%`; b.classList.toggle('low', v < 35); };
  const updateHud = () => {
    for (const i of [0, 1]) {
      set(`cheese${i}`, Math.floor(s.cheese[i]), (v) => el.cheese[i].replaceChildren(icon('cheese'), String(v)));
      set(`honour${i}`, Math.floor(s.honour[i] / 10), () => el.honour[i].replaceChildren(icon('heart'), String(Math.floor(s.honour[i]))));
      set(`gate${i}`, s.welcome[i], (v) => { el.gate[i].className = `gate ${v ? 'open' : ''}`; el.gate[i].replaceChildren(icon(v ? 'open' : 'shut')); });
      const own = s.sheep.filter((sh) => sh.side === i && !sh.cow);
      set(`sheep${i}`, `${own.filter((sh) => !sh.stray).length}/${own.length}`, (v) => { el.sheep[i].textContent = v; });
      set(`stars${i}`, s.stats[i].goals.join(), () => el.stars[i].replaceChildren(icon('star'), String(s.stats[i].stars)));
    }
    const w = s.weekDef;
    set('week', `${s.week}.${getLang()}`, () => el.week.replaceChildren(icon(SEASON_ICON[w.season]), ' ', t('week.short', { n: s.week + 1 })));
    set('weekBar', Math.round(100 * Math.min(1, s.weekT / w.length)), (v) => { el.weekBar.firstChild.style.width = `${v}%`; });
    set('pass', `${s.passOwner}.${getLang()}`, () => el.pass.replaceChildren(t('hud.pass'), ' ', s.passOwner < 0 ? t('hud.passBoth') : tag(s.passOwner)));
    set('trust', Math.round(s.trust), (v) => { bar(el.trust, v); el.trustN.textContent = v; el.trust.classList.toggle('quarrel', s.quarrel); });
    const cows = s.sheep.filter((c) => c.cow), cc = cows.reduce((a, c) => a + Math.min(c.food, c.water), 0) / cows.length;
    set('cows', Math.round(cc * 10), () => { el.cows.className = `cows ${cc < s.rules.tribute.minCondition ? 'thin' : ''}`; el.cows.replaceChildren(icon('cow'), h('span', { class: 'bar thin' }, h('i', { style: { width: `${Math.round(cc * 100)}%` } }))); });
    // This week's goal: a bar per valley with a notch at the target.
    const g = [0, 1].map((i) => s.goalProgress(i));
    const key = `${s.week}.${g.map((x) => Math.round(x.v * 20)).join()}.${getLang()}`;
    set('goal', key, () => el.goal.replaceChildren(icon(GOAL_ICON[w.goal]), ' ', t(`goal.${w.goal}.title`), ' ',
      ...[0, 1].flatMap((i) => [' ', tag(i), h('span', { class: `bar goalbar ${g[i].v >= g[i].need ? 'met' : ''}` }, h('i', { style: { width: `${Math.round(Math.min(1, g[i].v) * 100)}%` } }), h('b', { style: { left: `${Math.round(g[i].need * 100)}%` } }))])));
  };

  const onEvent = (e) => {
    switch (e.type) {
      case 'week': showBanner(s.week > 0 ? [s.stats[0].goals.at(-1), s.stats[1].goals.at(-1)] : null); break;
      case 'weekGo': el.banner.classList.add('hidden'); sfx.go(); break;
      case 'weekEnd': if (e.goals.some(Boolean)) sfx.star(); break;
      case 'prompt': prompt(t(e.key), 7); break;
      case 'bell': sfx.bell(); break;
      case 'whistle': sfx.whistle(); float(e.none ? '?' : '♪', e.x, e.y - 14); break;
      case 'gateOpen': case 'gateShut': sfx.gate(); float(t(e.type === 'gateOpen' ? 'msg.gateOpen' : 'msg.gateShut'), e.x, e.y); break;
      case 'fill': sfx.pour(); float(t(e.other ? 'msg.fillOther' : 'msg.fill'), e.x, e.y, e.other ? 'good' : ''); break;
      case 'troughFull': float(t('msg.troughFull'), e.x, e.y); break;
      case 'springEmpty': sfx.empty(); float(t('msg.springEmpty'), e.x, e.y, 'bad'); break;
      case 'fire': sfx.fire(); float(t('msg.fire'), e.x, e.y, 'good'); break;
      case 'fireNotNeeded': float(t('msg.fireDay'), e.x, e.y); break;
      case 'stormWarn': sfx.warn(); warnT = e.in; prompt(t('msg.stormWarn', { n: Math.ceil(e.in) }), e.in, 'storm'); break;
      case 'storm': sfx.thunder(); shake = 2; warnT = -1; prompt(t('msg.storm'), 5, 'storm'); break;
      case 'stormEnd': prompt(t('msg.stormEnd'), 4); break;
      case 'wolf': sfx.wolf(); prompt(t('msg.wolf', { valley: who(e.target) }), 7); break;
      case 'wolfScared': sfx.wolfGone(); float(t(e.helped ? 'msg.wolfHelped' : 'msg.wolfScared'), e.x, e.y, 'good'); if (e.helped) sfx.help(); break;
      case 'wolfLeaves': float(t('msg.wolfLeaves'), e.x, e.y); break;
      case 'lamb': sfx.baa(true); prompt(t('msg.lamb', { valley: who(e.side) }), 7, 'lamb'); break;
      case 'bleat': sfx.baa(true); float(t('msg.bleat'), e.x, e.y); break;
      case 'lambUp': sfx.ok(); break;
      case 'lambHome': sfx.help(); float(t(e.helped ? 'msg.lambHelped' : 'msg.lambHome'), e.x, e.y, 'good'); break;
      case 'helpStray': sfx.help(); float(t('msg.thanks'), e.x, e.y, 'good'); break;
      case 'dry': prompt(t(`msg.dry.${e.spring}`), 8, 'drop'); break;
      case 'hail': sfx.thunder(); shake = 2; prompt(t('msg.hail', { valley: who(e.side) }), 8, 'storm'); break;
      case 'welcome': sfx.gate(); float(t(e.open ? 'msg.open' : 'msg.shut', { valley: who(1 - e.side) }), e.x, e.y, e.open ? 'good' : ''); if (e.open) prompt(t('msg.openText'), 6, 'open'); break;
      case 'trespass': sfx.empty(); float(t('msg.trespass'), e.x, e.y, 'bad'); break;
      case 'quarrel': sfx.warn(); big(t('msg.quarrel')); prompt(t('msg.quarrelText'), 7, 'hands'); break;
      case 'reconcile': sfx.shelter(); prompt(t('msg.reconcile'), 5, 'hands'); break;
      case 'fog': prompt(t('msg.fog'), 6); break;
      case 'snow': prompt(t('msg.snow'), 6); break;
      case 'shelterOpen': sfx.shelter(); big(t('msg.shelterOpen')); prompt(t('msg.shelterOpenText'), 6, 'hands'); break;
      case 'finish': sfx.finish(); big(t('msg.finish')); break;
      default: break;
    }
  };

  updateHud();
  if (s.breakT > 0) showBanner(null);
  return {
    update(dt) {
      if (s.breakT > 0 && app.input.any('start')) s.breakT = Math.min(s.breakT, 0.05);
      const p2 = partner ? shepherdInput(s, 1, partner) : app.input.playInput(1);
      s.step({ p1: app.input.playInput(0), p2 });
      for (const e of s.events) onEvent(e);
      if (warnT > 0) {
        const before = Math.ceil(warnT);
        warnT -= dt;
        if (Math.ceil(warnT) !== before && warnT > 0) { el.prompt.replaceChildren(icon('storm'), ' ', ...rich(t('msg.stormWarn', { n: Math.ceil(warnT) }))); sfx.move(); }
      }
      shake *= 0.9;
      if (promptT > 0 && (promptT -= dt) <= 0) el.prompt.classList.add('hidden');
      updateHud();
      if (s.finished && (doneT += dt) > 2.5) app.go('results', { season: s });
    },
    draw(ctx) {
      const fx = shake > 0.2 ? { shakeX: (Math.random() - 0.5) * shake * 2, shakeY: (Math.random() - 0.5) * shake * 2 } : {};
      if (partner) fx.noArrows = [false, true];
      drawSeason(ctx, s, app.time, fx);
    },
  };
}

// ---- results ------------------------------------------------------------------

export function results(app, { season: s }) {
  const sc = s.score();
  let t0 = 0;
  const two = app.session.players === 2;
  const col = (i) => {
    const v = sc.valleys[i], P = v.parts;
    const row = (ic, label, pts) => h('div', { class: 'res-row' }, icon(ic), h('span', { class: 'res-label' }, label), h('span', { class: 'res-pts' }, pts ? `+${pts}` : '—'));
    return h('div', { class: `res-col side${i} ${sc.winner === i ? 'win' : ''}` },
      h('h3', {}, tag(i), ' ', t(i === 0 ? 'valley.roncal' : 'valley.baretous'), sc.winner === i ? h('span', { class: 'crown' }, ` ${t('results.ahead')}`) : null),
      row('cheese', t('results.cheese', { n: v.cheese }), P.cheese),
      row('home', t('results.home', { n: sc.home[i], of: s.flockSize[i] }), P.home),
      row('star', t('results.stars', { n: s.stats[i].stars }), P.stars),
      row('heart', t('results.honour'), P.honour),
      i === 0 ? row('cow', t('results.tribute'), P.tribute) : null,
      row('hands', t('results.peace'), P.peace),
      // Without the peace the valley's work is shown crossed out, and it scores 0.
      h('div', { class: 'res-total' }, h('span', {}, t('results.total')),
        sc.ceremony ? h('span', {}, String(v.total)) : h('span', {}, h('s', { class: 'lost' }, String(v.earned)), ' 0')));
  };
  app.ui.replaceChildren(h('div', { class: 'overlay results' },
    h('div', { class: 'card wide' },
      h('h2', {}, t('results.title')),
      h('p', { class: `res-peace ${sc.ceremony ? 'ok' : 'broken'}` }, icon('hands'), ' ', t(sc.ceremony ? 'results.peaceKept' : 'results.peaceBroken', { n: sc.peace })),
      h('p', { class: 'small' }, icon('cow'), ' ', t(sc.tributeOk ? 'results.cowsOk' : 'results.cowsThin')),
      h('div', { class: 'res-cols' }, col(0), col(1)),
      h('p', { class: 'res-verdict' }, t(sc.winner < 0 ? 'results.tie' : two ? 'results.winner' : sc.winner === 0 ? 'results.youWin' : 'results.theyWin', { valley: t(sc.winner === 0 ? 'valley.roncal' : 'valley.baretous') })),
      h('p', { class: 'hint' }, rich(t('ui.next'))))));
  return {
    update(dt) {
      t0 += dt;
      if ((t0 > 1 && (app.input.any('a') || app.input.any('start'))) || t0 > 30) {
        sfx.ok();
        // The leaderboard is per valley: each player's own score, which is 0
        // without the peace. (One player: only Roncal is yours.)
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
      score.ceremony ? h('p', { class: 'small' }, t(score.tributeOk ? 'ceremony.cows' : 'ceremony.cowsThin')) : null,
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
          h('p', { class: 'hint' }, rich(t('scores.hint'))))));
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
