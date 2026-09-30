// Every screen is a function (app, arg) -> { update(dt), draw(ctx) }. It
// builds its own DOM inside app.ui, over the canvas, and moves on with
// app.go(). Flow: attract -> menu -> story(intro) -> briefing -> race ->
// results -> [initials] -> fact -> journey (route map) -> briefing for the
// next stretch, or story(outro) -> attract.

import { h } from './dom.js';
import { t, getLang, setLang, nextLang, LANGS } from './i18n.js';
import { Race } from '../core/race.js';
import { pilotInput } from '../core/pilot.js';
import { drawRace, camera, warmStrips, W, H } from './render.js';
import { drawScene, drawRouteMap } from './art.js';
import { sfx } from './audio.js';
import { langParam } from './arcade.js';
import { settings, topScores, qualifies, addScore } from './store.js';

// "[A] stroke" -> button glyph + text, so non-readers can match the button.
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

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const ICON = {
  one: '<svg viewBox="0 0 16 16"><circle cx="8" cy="4" r="3"/><rect x="5" y="8" width="6" height="8" rx="1"/></svg>',
  two: '<svg viewBox="0 0 24 16"><circle cx="7" cy="4" r="3"/><rect x="4" y="8" width="6" height="8" rx="1"/><circle cx="17" cy="4" r="3"/><rect x="14" y="8" width="6" height="8" rx="1"/></svg>',
  calm: '<svg viewBox="0 0 24 16"><path d="M1 10 q5 -4 11 0 t11 0" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  rapids: '<svg viewBox="0 0 24 16"><path d="M1 6 l4 -4 l4 4 l4 -4 l4 4 l4 -4 M1 13 l4 -4 l4 4 l4 -4 l4 4 l4 -4" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  speech: '<svg viewBox="0 0 16 16"><path d="M2 2 h12 v9 h-7 l-4 3 v-3 h-1 z"/></svg>',
  clock: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 4 v4 h3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  rope: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="3"/></svg>',
  flag: '<svg viewBox="0 0 16 16"><rect x="2" y="1" width="2" height="15"/><path d="M4 1 l10 3 l-10 4 z"/></svg>',
  log: '<svg viewBox="0 0 16 16"><rect x="1" y="5" width="14" height="6" rx="3"/></svg>',
  weir: '<svg viewBox="0 0 16 16"><rect x="0" y="6" width="5" height="4"/><rect x="11" y="6" width="5" height="4"/><path d="M5 3 l3 4 l3 -4" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  duck: '<svg viewBox="0 0 16 16"><rect x="2" y="8" width="10" height="5" rx="2"/><rect x="9" y="4" width="4" height="4"/><rect x="13" y="5" width="3" height="2"/></svg>',
};
const icon = (name) => h('span', { class: 'icon', html: ICON[name] });

// ---- attract --------------------------------------------------------------

export function attract(app) {
  setLang(langParam ?? settings.lang);
  // The demo floats down a different stretch each time round.
  const order = app.data.order;
  let demo = Math.floor(Math.random() * order.length);
  const newDemo = () => new Race({ rules: app.data.rules, course: order[demo++ % order.length], players: 2, seed: (app.time * 1000) | 0 });
  let race = newDemo(), cam = null, over = 0;
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
      app.ui.replaceChildren(h('div', { class: 'overlay attract' }, scoreTable(race.course),
        h('p', { class: 'press small' }, rich(t('title.press')))));
    }
  };
  show();

  return {
    attract: true,
    update(dt) {
      race.step(pilotInput(race));
      if (race.finished && (over += dt) > 2) { race = newDemo(); cam = null; over = 0; }
      if ((cardT += dt) > (cards[card] === 'title' ? 8 : 10)) { card = (card + 1) % cards.length; cardT = 0; show(); }
      const [p1, p2] = app.input.players;
      if (p2.pressed.start || p2.pressed.a) app.go('menu', { players: 2 });
      else if (p1.pressed.start || p1.pressed.a) app.go('menu', { players: 1 });
    },
    draw(ctx) {
      cam = camera(race, cam);
      drawRace(ctx, race, cam, app.time);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, W, H);
    },
  };
}

function factCard(fact) {
  return h('div', { class: 'card' },
    h('h3', {}, t('fact.title')),
    h('p', {}, t(fact.text_key)));
}

function scoreTable(course) {
  const rows = ['easy', 'normal'].map((d) => {
    const list = topScores(course.id, d);
    return h('div', { class: 'scores-col' },
      h('h3', {}, icon(d === 'easy' ? 'calm' : 'rapids'), ' ', t(`menu.difficulty.${d}`)),
      list.length ? h('ol', {}, list.map((s) => h('li', {}, h('span', {}, s.name), h('span', {}, s.score))))
        : h('p', { class: 'small' }, t('scores.empty')));
  });
  return h('div', { class: 'card scores' }, h('h2', {}, t('scores.title')), h('p', { class: 'small' }, t(course.name_key)), h('div', { class: 'scores-row' }, rows));
}

// ---- menu -----------------------------------------------------------------

export function menu(app, { players = 1 } = {}) {
  const order = app.data.order;
  const S = { players, difficulty: settings.difficulty, stretch: 0 };
  const rows = ['players', 'stretch', 'difficulty', 'lang', 'go'];
  let row = 0;
  const preview = () => new Race({ rules: app.data.rules, course: order[S.stretch], players: 2, seed: 7 });
  let race = preview(), cam = null;

  const value = (r) => {
    if (r === 'players') return h('span', {}, icon(S.players === 2 ? 'two' : 'one'), ' ', t(`menu.players.${S.players}`));
    if (r === 'stretch') return h('span', {}, icon('flag'), ' ', t(order[S.stretch].name_key));
    if (r === 'difficulty') return h('span', {}, icon(S.difficulty === 'easy' ? 'calm' : 'rapids'), ' ', t(`menu.difficulty.${S.difficulty}`));
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
      h('p', { class: 'hint' }, rich(t('menu.hint')))));
  };
  show();

  const change = (dir) => {
    const r = rows[row];
    if (r === 'players') S.players = S.players === 1 ? 2 : 1;
    else if (r === 'stretch') { S.stretch = (S.stretch + dir + order.length) % order.length; race = preview(); cam = null; }
    else if (r === 'difficulty') S.difficulty = S.difficulty === 'easy' ? 'normal' : 'easy';
    else if (r === 'lang') nextLang(dir);
    else return;
    sfx.move();
    show();
  };

  return {
    update() {
      race.step(pilotInput(race));
      if (race.finished) { race = preview(); cam = null; }
      const inp = app.input, p1 = inp.players[0];
      if (inp.players[1].pressed.start && S.players !== 2) { S.players = 2; sfx.move(); show(); }
      if (inp.any('up')) { row = (row + rows.length - 1) % rows.length; sfx.move(); show(); }
      if (inp.any('down')) { row = (row + 1) % rows.length; sfx.move(); show(); }
      if (inp.any('left')) change(-1);
      if (inp.any('right')) change(1);
      if (inp.any('c')) { nextLang(1); sfx.move(); show(); }
      if (p1.pressed.start || inp.players[1].pressed.start || (inp.any('a') && rows[row] === 'go')) {
        sfx.ok();
        app.session = { players: S.players, difficulty: S.difficulty, course: order[S.stretch].id, done: new Set() };
        app.go('story', { panels: app.data.story.intro, next: 'briefing' });
      } else if (inp.any('a')) { row = rows.length - 1; sfx.move(); show(); }
    },
    draw(ctx) {
      cam = camera(race, cam);
      drawRace(ctx, race, cam, app.time);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, W, H);
    },
  };
}

// ---- story panels (intro / outro) -----------------------------------------

export function story(app, { panels, next }) {
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
    if (++i >= panels.length) app.go(next);
    else { t0 = 0; show(); }
  };
  return {
    update(dt) {
      if (app.input.any('start')) { app.go(next); return; }
      if (app.input.any('a')) { sfx.move(); advance(); return; }
      if ((t0 += dt) > PANEL) advance();
    },
    draw(ctx) {
      if (!panels[i]) return;
      // Lift the picture so the action sits above the caption box.
      ctx.save();
      ctx.translate(0, -24);
      drawScene(ctx, panels[i].scene, app.time);
      ctx.restore();
      ctx.fillStyle = '#14121a';
      ctx.fillRect(0, H - 24, W, 24);
    },
  };
}

// ---- briefing: which stretch, which buttons ---------------------------------

export function briefing(app) {
  const course = app.data.courses[app.session.course];
  const two = app.session.players === 2;
  let t0 = 0;
  const places = course.features.filter((f) => f.type === 'village').map((f) => t(`place.${f.place}`));
  app.ui.replaceChildren(placeLabels(app, [...app.session.done, course.id]), h('div', { class: 'overlay briefing' },
    h('div', { class: 'card' },
      h('h2', {}, t(course.name_key)),
      h('p', {}, t(course.blurb_key)),
      h('p', { class: 'places' }, icon('flag'), ' ', places.join(' · ')),
      two
        ? h('div', { class: 'controls' },
          h('p', {}, h('span', { class: 'ptag p1' }, '1'), ' ', t('controls.p1')),
          h('p', {}, h('span', { class: 'ptag p2' }, '2'), ' ', t('controls.p2')),
          h('p', { class: 'small' }, t('controls.coop')),
          h('p', { class: 'small' }, rich(t('controls.buttons'))))
        : h('div', { class: 'controls' }, h('p', {}, rich(t('controls.solo')))),
      h('p', { class: 'hint' }, rich(t('ui.next'))))));
  return {
    update(dt) {
      t0 += dt;
      if (t0 > 0.5 && (app.input.any('a') || app.input.any('start'))) { sfx.ok(); app.go('race'); }
      else if (t0 > 20) app.go('race');
    },
    draw(ctx) { drawRouteMap(ctx, app.data.route, app.data.order, { done: app.session.done, current: course.id, t: app.time }); },
  };
}

// ---- journey: the route map between stretches -------------------------------

// Village names on the route map, for the stretches done and the one ahead.
function placeLabels(app, courseIds) {
  const where = app.data.route.places;
  const ids = new Set();
  for (const id of courseIds) for (const f of app.data.courses[id]?.features ?? []) if (f.type === 'village') ids.add(f.place);
  return h('div', { class: 'map-labels' }, [...ids].filter((id) => where[id]).map((id) => {
    const [x, y] = where[id];
    return h('span', { style: { left: `${x + 5}px`, top: `${y - 6}px` } }, t(`place.${id}`));
  }));
}

export function journey(app) {
  const order = app.data.order;
  const i = order.findIndex((c) => c.id === app.session.course);
  const next = order[i + 1];
  let t0 = 0;
  const shown = [...app.session.done, next?.id].filter(Boolean);
  app.ui.replaceChildren(placeLabels(app, shown), h('div', { class: 'overlay journey' },
    h('div', { class: 'card' },
      h('h2', {}, t(next ? 'journey.title' : 'journey.sea')),
      next ? h('p', {}, t('journey.next'), ' ', h('b', {}, t(next.name_key))) : null,
      h('p', { class: 'hint' }, rich(t(next ? 'journey.hint' : 'ui.next'))))));
  return {
    update(dt) {
      t0 += dt;
      if (t0 < 0.8) return;
      const inp = app.input;
      if (next && (inp.any('a') || inp.any('start'))) {
        sfx.ok();
        app.session.course = next.id;
        app.go('briefing');
      } else if (inp.any('b') || (!next && (inp.any('a') || inp.any('start'))) || t0 > 25) {
        app.go('story', { panels: app.data.story.outro, next: 'attract' });
      }
    },
    draw(ctx) {
      drawRouteMap(ctx, app.data.route, order, { done: app.session.done, current: next && t0 > 1.5 ? next.id : app.session.course, t: app.time });
    },
  };
}

// ---- the race -------------------------------------------------------------

export function race(app) {
  const { players, difficulty } = app.session;
  const course = app.data.courses[app.session.course];
  const r = new Race({ rules: app.data.rules, course, difficulty, players, seed: (app.time * 1000) | 0 });
  // Developer shortcut: index.html?at=4300 starts the run 4300px downriver.
  const at = Number(new URLSearchParams(location.search).get('at'));
  if (at > 0) { r.raft.y = at; r.raft.x = r.river.cxAt(at); for (const p of r.prompts) p.shown = p.y < at; }
  let cam = null, countdown = 3.999, lastCount = 4, shake = 0, doneT = 0, lastBeat = -1;
  let promptT = 0;

  const el = {
    time: h('span', {}), logs: h('span', { class: 'logs' }), rope: h('span', { class: 'bar' }, h('i')),
    orders: h('span', {}), prompt: h('div', { class: 'prompt hidden' }), lash: h('div', { class: 'lash hidden' }),
    big: h('div', { class: 'big' }), floats: h('div', { class: 'floats' }), place: h('div', { class: 'place hidden' }),
  };
  const logEls = Array.from({ length: app.data.rules.raft.logs }, () => h('i'));
  el.logs.append(...logEls);
  app.ui.replaceChildren(h('div', { class: 'overlay race' },
    h('div', { class: 'hud' },
      h('span', { class: 'hud-item' }, icon('clock'), el.time),
      h('span', { class: 'hud-item' }, icon('log'), el.logs),
      h('span', { class: 'hud-item' }, icon('rope'), el.rope),
      h('span', { class: 'hud-item' }, icon('flag'), el.orders)),
    el.floats, el.place, el.big, el.prompt, el.lash));

  const float = (text, x, y, cls = '') => {
    const f = h('span', { class: `float ${cls}`, style: { left: `${Math.round(x)}px`, top: `${Math.round(y - cam)}px` } }, text);
    el.floats.append(f);
    setTimeout(() => f.remove(), 1400);
  };
  const big = (text) => {
    el.big.replaceChildren(h('span', {}, text));
    el.big.classList.remove('pop'); void el.big.offsetWidth; el.big.classList.add('pop');
  };
  const prompt = (text, secs = 6) => {
    el.prompt.replaceChildren(...rich(text));
    el.prompt.classList.remove('hidden');
    promptT = secs;
  };
  const lashPanel = () => {
    if (!r.lash.active) { el.lash.classList.add('hidden'); return; }
    el.lash.classList.remove('hidden');
    const who = Array.from({ length: players }, (_, i) => h('span', { class: `ptag p${i + 1} ${r.lash.pressed[i] === r.lashBeat() && r.lashBeat() > 0 ? 'done' : ''}` }, String(i + 1)));
    el.lash.replaceChildren(h('p', {}, rich(t(players === 2 ? 'msg.lashTogether' : 'msg.lash'))), h('p', { class: 'small' }, who, '  ', rich(t('msg.lashHint'))));
  };

  const hudState = { time: '', logs: -1, rope: -1, orders: '' };
  const updateHud = () => {
    const time = clock(r.t) + (r.diff.timed ? ` / ${clock(course.targetTime)}` : '');
    if (time !== hudState.time) el.time.textContent = hudState.time = time;
    if (r.raft.logs !== hudState.logs) {
      hudState.logs = r.raft.logs;
      logEls.forEach((e, i) => e.classList.toggle('gone', i >= r.raft.logs));
    }
    const rope = Math.round(r.raft.lashing);
    if (rope !== hudState.rope) {
      hudState.rope = rope;
      el.rope.firstChild.style.width = `${rope}%`;
      el.rope.classList.toggle('low', r.raft.loose);
    }
    const orders = `${r.stats.orders}/${r.docks.length}`;
    if (orders !== hudState.orders) el.orders.textContent = hudState.orders = orders;
  };

  const onEvent = (e) => {
    switch (e.type) {
      case 'bump':
        // A knock from debris or a bank is just a nudge; a crash is loud and red.
        sfx.bump(e.harmless ? e.power / 3 : e.power);
        shake = Math.min(e.harmless ? 1 : 3, e.power / 12);
        if (!e.harmless) float(t(e.braced ? 'msg.braced' : 'msg.bump'), e.x, e.y, 'bad');
        break;
      case 'stroke': sfx.stroke(); break;
      case 'together': sfx.together(); float(t('msg.together'), e.x, e.y - 30, 'good'); break;
      case 'order':
        sfx.order();
        float(`${t('msg.orderFor', { town: t(`town.${e.town}`) })} +${app.data.rules.score.order}`, e.x, e.y, 'good');
        break;
      case 'loose': sfx.loose(); prompt(t('msg.loose'), 7); break;
      case 'logLost': sfx.logLost(); float(t('msg.logLost'), e.x, e.y, 'bad'); break;
      case 'lashStart': sfx.ok(); lastBeat = -1; break;
      case 'lashPress': sfx.lashPress(); break;
      case 'lashMiss': sfx.miss(); break;
      case 'knot': sfx.knot(); break;
      case 'lashDone': sfx.lashDone(); float(t('msg.lashDone'), e.x, e.y - 40, 'good'); break;
      case 'lashNotNeeded': float(t('msg.lashFull'), e.x, e.y - 30); break;
      case 'lashNoEddy': sfx.miss(); prompt(t('msg.findEddy'), 3); break;
      case 'lashTooFast': sfx.miss(); float(t('msg.slowDown'), e.x, e.y - 30); break;
      case 'eddyEnter': sfx.ok(); prompt(t('msg.eddyHere'), 4); break;
      case 'whirl': sfx.whirl(); float(t('msg.whirl'), e.x, e.y - 20, 'bad'); break;
      case 'weir': sfx.weir(e.clean); float(t(e.clean ? 'msg.weirClean' : 'msg.weir'), e.x, e.y, e.clean ? 'good' : ''); break;
      case 'duck': sfx.duck(); float(t('msg.duck'), e.x, e.y); break;
      case 'splash': sfx.splash(); float(t('msg.splash'), e.x, e.y); break;
      case 'prompt': prompt(t(e.key)); break;
      case 'village':
        el.place.replaceChildren(h('span', {}, t(`place.${e.place}`)));
        el.place.classList.remove('hidden', 'show'); void el.place.offsetWidth; el.place.classList.add('show');
        break;
      case 'cheer': sfx.cheer(); float(t('msg.cheer'), e.x, e.y - 14, 'good'); break;
      case 'finish': sfx.finish(); big(t('msg.finish')); break;
      default: break;
    }
  };

  updateHud();
  return {
    update(dt) {
      if (countdown > 0) {
        warmStrips(r, r.raft.y - 100, 1); // paint the river ahead while the clock counts down
        countdown -= dt;
        const n = Math.ceil(countdown);
        if (n !== lastCount) {
          lastCount = n;
          if (n > 0) { sfx.beep(); big(String(n)); } else { sfx.go(); big(t('msg.go')); }
        }
        return;
      }
      r.step({ p1: app.input.raceInput(0), p2: app.input.raceInput(1) });
      for (const e of r.events) onEvent(e);
      if (r.lash.active) {
        const beat = Math.floor(r.lash.t / app.data.rules.lash.beat);
        if (beat !== lastBeat && beat >= 1) sfx.lashBeat();
        lastBeat = beat;
      }
      lashPanel();
      shake *= 0.85;
      if (promptT > 0 && (promptT -= dt) <= 0) el.prompt.classList.add('hidden');
      updateHud();
      if (r.finished && (doneT += dt) > 2.5) app.go('results', { race: r });
    },
    draw(ctx) {
      cam = camera(r, cam);
      const fx = shake > 0.2 ? { shakeX: (Math.random() - 0.5) * shake * 2, shakeY: (Math.random() - 0.5) * shake * 2 } : {};
      drawRace(ctx, r, cam, app.time, fx);
    },
  };
}

// ---- results --------------------------------------------------------------

export function results(app, { race: r }) {
  const { parts, total } = r.score();
  app.session.done.add(r.course.id);
  const R = app.data.rules.raft;
  let t0 = 0, cam = null;
  const row = (ic, label, detail, pts) => h('div', { class: 'res-row' },
    icon(ic), h('span', { class: 'res-label' }, label), h('span', { class: 'res-detail' }, detail), h('span', { class: 'res-pts' }, `+${pts}`));
  app.ui.replaceChildren(h('div', { class: 'overlay results' },
    h('div', { class: 'card' },
      h('h2', {}, t('results.title')),
      row('log', t('results.logs'), `${r.raft.logs} / ${R.logs}`, parts.logs),
      row('flag', t('results.orders'), `${r.stats.orders} / ${r.docks.length}`, parts.orders),
      row('weir', t('results.weirs'), `${r.stats.weirsClean} / ${r.weirs.length}`, parts.weirs),
      row('duck', t('results.courtesy'), r.stats.disturbed ? t('results.courtesyBad', { n: r.stats.disturbed }) : t('results.courtesyOk'), parts.courtesy),
      row('clock', t('results.time'), r.diff.timed ? `${clock(r.t)} / ${clock(r.course.targetTime)}` : t('results.timeEasy'), parts.time),
      h('div', { class: 'res-total' }, h('span', {}, t('results.total')), h('span', {}, String(total))),
      h('p', { class: 'hint' }, rich(t('ui.next'))))));
  return {
    update(dt) {
      t0 += dt;
      if (t0 < 1 || !(app.input.any('a') || app.input.any('start'))) return;
      sfx.ok();
      const { course, difficulty } = app.session;
      if (qualifies(course, difficulty, total)) app.go('initials', { score: total });
      else app.go('fact');
    },
    draw(ctx) {
      cam = camera(r, cam);
      drawRace(ctx, r, cam, app.time);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, W, H);
    },
  };
}

// ---- initials -------------------------------------------------------------

const ALPHABET = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';

export function initials(app, { score }) {
  const letters = [0, 0, 0];
  let slot = 0, saved = null, t0 = 0;
  const show = () => {
    app.ui.replaceChildren(h('div', { class: 'overlay results' },
      saved ? scoreTable(app.data.courses[app.session.course])
        : h('div', { class: 'card' },
          h('h2', {}, t('scores.new')),
          h('p', { class: 'big-score' }, String(score)),
          h('div', { class: 'initials' }, letters.map((l, i) => h('span', { class: i === slot ? 'sel' : '' }, ALPHABET[l]))),
          h('p', { class: 'hint' }, rich(t('scores.hint'))))));
  };
  show();
  return {
    update(dt) {
      const inp = app.input;
      if (saved) {
        if ((t0 += dt) > 6 || (t0 > 0.5 && (inp.any('a') || inp.any('start')))) app.go('fact');
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
          const { course, difficulty } = app.session;
          addScore(course, difficulty, letters.map((l) => ALPHABET[l]).join(''), score);
          saved = true;
        }
        show();
      }
    },
    draw(ctx) { drawScene(ctx, 'burgui', app.time); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H); },
  };
}

// ---- fact card between runs -----------------------------------------------

export function fact(app) {
  const facts = app.data.facts;
  const f = facts[Math.floor(Math.random() * facts.length)];
  const img = app.images.get(f.image);
  let t0 = 0;
  const card = factCard(f);
  card.append(h('p', { class: 'hint' }, rich(t('ui.next'))));
  app.ui.replaceChildren(h('div', { class: 'overlay fact' }, card));
  return {
    update(dt) {
      t0 += dt;
      if ((t0 > 1 && (app.input.any('a') || app.input.any('start'))) || t0 > 20) {
        app.go('journey');
      }
    },
    draw(ctx) {
      if (img) ctx.drawImage(img, 0, 0, W, H);
      else drawScene(ctx, f.scene, app.time);
    },
  };
}

