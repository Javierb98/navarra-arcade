// Every screen is a function (app, arg) -> { update(dt), draw(ctx) } that
// builds its own DOM over the canvas and moves on with app.go(). Flow:
// attract -> menu -> story -> [card -> event -> result] x4 (+ a deciding tug)
// -> champion -> fact -> attract.

import { h } from './dom.js';
import { t, getLang, setLang, nextLang, LANGS } from './i18n.js';
import { Day } from '../core/kirolak.js';
import { drawEvent, drawMeters, drawBeat, finish, newAnim, drawFigure, drawTxapela, POSES, GROUND, U, LANE } from './art.js';
import { sfx } from './audio.js';
import { settings } from './store.js';
import { langParam } from './arcade.js';
import { keysOn, keyName } from './keys.js';
import { device } from './device.js';

const W = 960, H = 540;
const seed = (app) => (app.time * 1000 + Date.now()) | 0;
const who = (i) => t(i ? 'who.blue' : 'who.red');

// "[A] chop" -> button glyph + text, so non-readers can match the button
// (on the cabinet, and the phone's on-screen buttons look the same). At a
// computer it's player p's key instead ("Z chop"); p = null when the text is
// for both players, and then both keys show ("Z/E").
export function rich(text, p = 0) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(/\[(A|B|C|START)\]/g)) {
    const b = m[1].toLowerCase();
    parts.push(text.slice(last, m.index));
    if (!keysOn()) parts.push(h('span', { class: `btn btn-${b}` }, m[1]));
    else if (p != null) parts.push(h('kbd', {}, keyName(p, b)));
    else parts.push(h('kbd', {}, keyName(0, b)), '/', h('kbd', {}, keyName(1, b)));
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

// Each player's own controls for an event: one line per action, with the
// keys of player p (arrows or A D for balance) at a keyboard.
const STICK = { harri: true, txingak: true };
function keyLines(ev, p) {
  const lines = [h('p', {}, rich(t(`keys.${ev}`), p))];
  if (STICK[ev]) {
    const plain = { l: '←', r: '→' }, dirs = { l: 'left', r: 'right' };
    lines.push(h('p', {}, t('keys.balance').split(/\{([lr])\}/).map((part, i) => (i % 2 ? (keysOn() ? h('kbd', {}, keyName(p, dirs[part])) : plain[part]) : part))));
  }
  return lines;
}

// Who plays with what: one column per player, so two people sharing one
// keyboard know which keys are theirs before the event starts.
function controlsCard(ev) {
  const col = (p) => h('div', { class: `keys-col ${p ? 'blue' : 'red'}` }, h('h3', {}, t(p ? 'hud.blue' : 'hud.red'), device === 'cabinet' ? h('small', {}, ` · ${t(p ? 'keys.right' : 'keys.left')}`) : null), keyLines(ev, p));
  return h('div', { class: 'keys-card' }, col(0), col(1));
}

// ---- effects: chips, sawdust, confetti, crowd mood ----------------------------------------------

function newFx() { return { bits: [], cheer: [0, 0], shake: 0 }; }
function burst(fx, x, y, n, kind, colour, speed = 180, life = 0.8, size = 3) {
  for (let k = 0; k < n; k++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v = speed * (0.4 + Math.random() * 0.6);
    fx.bits.push({ kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, colour, size: size * (0.6 + Math.random() * 0.8), rot: Math.random() * 6, spin: (Math.random() - 0.5) * 12 });
  }
}
function confetti(fx, n = 140) {
  const cols = ['#c0392b', '#f3ece0', '#2e7d4f', '#e8b840', '#2e6f9e'];
  for (let k = 0; k < n; k++) fx.bits.push({ kind: 'confetti', x: Math.random() * W, y: -Math.random() * 200, vx: (Math.random() - 0.5) * 40, vy: 60 + Math.random() * 80, life: 5, max: 5, colour: cols[k % 5], size: 5, rot: 0, spin: 0 });
}
function tickFx(fx, dt) {
  for (const b of fx.bits) { b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt; if (b.kind !== 'confetti') b.vy += 500 * dt; b.rot += b.spin * dt; if (b.kind === 'puff') { b.vx *= 0.9; b.vy *= 0.9; } }
  fx.bits = fx.bits.filter((b) => b.life > 0);
  fx.cheer = fx.cheer.map((c) => Math.max(0, c - dt * 0.6));
  fx.shake = Math.max(0, fx.shake - dt * 2);
}

// ---- attract: a demo day between two computers ------------------------------------------------------

export function attract(app) {
  setLang(langParam ?? settings.lang);
  let day = new Day(app.data.rules, { seed: seed(app), ai: [true, true] }), ev = day.start();
  const anim = newAnim(), fx = newFx();
  let cardT = 0, card = 0, rest = 0;
  const show = () => {
    const f = app.data.facts[card % app.data.facts.length];
    app.ui.replaceChildren(h('div', { class: 'overlay attract' },
      card % 2 === 0
        ? h('div', { class: 'title-card' }, h('h1', { class: 'logo' }, t('title.name')), h('p', { class: 'subtitle' }, t('title.subtitle')), h('p', { class: 'tag' }, t('title.players')))
        : h('div', { class: 'parchment fact-card' }, h('h3', {}, t('fact.title')), h('p', {}, t(f.text_key))),
      h('p', { class: 'press' }, rich(t('title.press')))));
  };
  show();
  return {
    attract: true,
    update(dt) {
      if ((cardT += dt) > 9) { card++; cardT = 0; show(); }
      if (ev && !ev.finished) { day.step([], dt); react(ev, anim, fx, dt, app, true); }
      else if ((rest += dt) > 2) { rest = 0; ev = day.next(); if (!ev) { day = new Day(app.data.rules, { seed: seed(app), ai: [true, true] }); ev = day.start(); } }
      tickFx(fx, dt);
      const [p1, p2] = app.input.players;
      if (p1.pressed.start || p1.pressed.a || p2.pressed.start || p2.pressed.a) app.go('menu');
    },
    draw(g) { drawEvent(g, ev, app.time, anim, fx); finish(g); g.fillStyle = 'rgba(20,12,6,0.3)'; g.fillRect(0, 0, W, H); },
  };
}

// ---- menu -------------------------------------------------------------------------------------------

export function menu(app) {
  // A phone's on-screen controls are player 1's only, so there it's always
  // one player against the computer.
  const phone = device === 'phone';
  const S = { players: phone ? 1 : 2, difficulty: settings.difficulty };
  const rows = phone ? ['difficulty', 'lang', 'go'] : ['players', 'difficulty', 'lang', 'go'];
  let row = 0;
  const value = (r) => {
    if (r === 'go') return h('span', {}, rich(`[A] ${t('menu.go')}`));
    if (r === 'lang') return h('span', { class: 'langs' }, LANGS.map((l) => h('span', { class: l === getLang() ? 'on' : '' }, t(`lang.${l}`))));
    return h('span', { class: 'value' }, h('span', { class: 'arrow' }, '‹'), h('span', {}, t(`menu.${r}.${S[r]}`)), h('span', { class: 'arrow' }, '›'));
  };
  const show = () => app.ui.replaceChildren(h('div', { class: 'overlay menu' }, h('div', { class: 'parchment menu-card' },
    h('h1', { class: 'logo small' }, t('title.name')),
    h('div', { class: 'rows' }, rows.filter((r) => r !== 'difficulty' || S.players === 1).map((r) => h('div', { class: `row row-${r} ${r === rows[row] ? 'sel' : ''}` },
      r !== 'go' ? h('span', { class: 'label' }, t(`menu.${r}`)) : null, value(r)))),
    h('p', { class: 'note' }, S.players === 2 ? t('menu.duo.note') : t(`menu.${S.difficulty}.note`)),
    h('p', { class: 'hint' }, rich(t('menu.hint'))))));
  show();
  const visible = () => rows.filter((r) => r !== 'difficulty' || S.players === 1);
  const change = (dir) => {
    const r = rows[row];
    if (r === 'players') S.players = S.players === 1 ? 2 : 1;
    else if (r === 'difficulty') S.difficulty = S.difficulty === 'easy' ? 'normal' : 'easy';
    else if (r === 'lang') nextLang(dir);
    else return;
    sfx.move(); show();
  };
  const moveRow = (d) => { const v = visible(); row = rows.indexOf(v[(v.indexOf(rows[row]) + d + v.length) % v.length]); sfx.move(); show(); };
  return {
    update() {
      const inp = app.input;
      if (inp.any('up')) moveRow(-1);
      if (inp.any('down')) moveRow(1);
      if (inp.any('left')) change(-1);
      if (inp.any('right')) change(1);
      if (inp.any('c')) { nextLang(1); sfx.move(); show(); }
      if (inp.any('start') || (inp.any('a') && rows[row] === 'go')) {
        sfx.ok();
        const only = new URLSearchParams(location.search).get('event'); // developer: one event only
        app.session = { ...S, day: new Day(app.data.rules, { players: S.players, difficulty: S.difficulty, seed: seed(app), ...(only ? { events: [only] } : {}) }) };
        app.go('story');
      } else if (inp.any('a')) change(1);
    },
    draw(g) { drawEvent(g, null, app.time, null, null); finish(g); g.fillStyle = 'rgba(20,12,6,0.45)'; g.fillRect(0, 0, W, H); },
  };
}

// ---- story -------------------------------------------------------------------------------------------

export function story(app) {
  const panels = app.data.story.intro;
  let i = 0, t0 = 0;
  const show = () => app.ui.replaceChildren(h('div', { class: 'overlay story' }, h('div', { class: 'caption parchment' }, h('p', {}, t(panels[i].text)),
    h('div', { class: 'foot' }, h('div', { class: 'dots' }, panels.map((_, k) => h('span', { class: k === i ? 'on' : '' }))), h('p', { class: 'hint' }, rich(t('ui.next')), '    ', rich(t('ui.skip')))))));
  show();
  const go = () => { app.session.day.start(); app.go('card'); };
  return {
    update(dt) {
      if (app.input.any('start')) { go(); return; }
      if (app.input.any('a') || (t0 += dt) > 8) { sfx.move(); t0 = 0; if (++i >= panels.length) go(); else show(); }
    },
    draw(g) { drawEvent(g, null, app.time, null, { cheer: [0.3, 0.3], bits: [] }); finish(g); },
  };
}

// ---- before each event: its name in Basque, what it is, how to play ---------------------------------

export function card(app) {
  const day = app.session.day, ev = day.event, n = day.index + 1;
  const decider = day.index >= 4;
  const word = app.data.glossary.byEvent[ev.id];
  const two = day.players === 2;
  let t0 = 0;
  app.ui.replaceChildren(h('div', { class: 'overlay event-card' }, h('div', { class: 'parchment brief-card' },
    h('p', { class: 'kicker' }, decider ? t('ev.decider') : t('ev.kicker', { n, total: 4 })),
    h('h2', {}, t(`ev.${ev.id}.name`)),
    h('p', { class: 'where' }, t(`ev.${ev.id}.what`)),
    h('p', { class: 'tip' }, ...rich(t(`ev.${ev.id}.how`), two ? null : 0)),
    two ? controlsCard(ev.id) : null,
    h('p', { class: 'goal' }, t(`ev.${ev.id}.goal`)),
    word ? h('div', { class: 'word' }, h('b', {}, t(`gl.${word}.name`)), ' — ', t(`gl.${word}.text`)) : null,
    h('p', { class: 'hint' }, rich(`[A] ${t('menu.go')}`)))));
  return {
    update(dt) { t0 += dt; if ((t0 > 0.6 && (app.input.any('a') || app.input.any('start'))) || t0 > 25) { sfx.ok(); app.go('play'); } },
    draw(g) { drawEvent(g, ev, app.time, newAnim(), null); finish(g); g.fillStyle = 'rgba(20,12,6,0.35)'; g.fillRect(0, 0, W, H); },
  };
}

// Sounds and effects from the events; `quiet` for the attract demo.
function react(ev, anim, fx, dt, app, quiet = false) {
  const s = quiet ? new Proxy({}, { get: () => () => {} }) : sfx;
  for (const e of ev.events) {
    const x = LANE[e.p ?? 0], dir = e.p ? -1 : 1;
    if (e.type === 'stroke') {
      s.chop(e.power); burst(fx, x + dir * 12, GROUND - 44, e.perfect ? 12 : 5, 'chip', '#f0d49c', e.perfect ? 260 : 150, 0.9, 4);
      if (e.perfect) { fx.shake = 0.25; if (!quiet) call(app, e.p, t('call.perfect')); }
    } else if (e.type === 'glance') { s.glance(); if (!quiet) call(app, e.p, t('call.glance'), true); }
    else if (e.type === 'through') { s.crack(); burst(fx, x + dir * 12, GROUND - 40, 30, 'chip', '#f0d49c', 300, 1.2, 5); fx.cheer[e.p] = 1.5; if (!quiet) call(app, e.p, t('call.through')); }
    else if (e.type === 'shoulder') s.heave();
    else if (e.type === 'lift') { s.thud(); fx.cheer[e.p] = 1.2; if (!quiet) count(app, e.p, e.n); }
    else if (e.type === 'drop') { s.thud(); fx.shake = 0.4; burst(fx, x + dir * 40, GROUND - 4, 14, 'puff', 'rgba(210,180,130,0.6)', 90, 0.8, 10); if (!quiet) call(app, e.p, t('call.drop'), true); }
    else if (e.type === 'step') { s.step(); if (Math.random() < 0.4) burst(fx, x, GROUND - 2, 2, 'puff', 'rgba(210,180,130,0.5)', 40, 0.5, 6); anim[e.p].stride += 1; }
    else if (e.type === 'stumble') s.miss();
    else if (e.type === 'beat') { s.drum(); if (!quiet) aupa(app); }
    else if (e.type === 'pull') { s.pull(e.q); if (e.perfect) fx.cheer[e.p] = Math.max(fx.cheer[e.p], 0.6); }
    else if (e.type === 'slip') { s.miss(); if (!quiet && ev.id === 'sokatira') call(app, e.p, t('call.slip'), true); }
    else if (e.type === 'end') { s.bell(); if (e.winner != null) fx.cheer[e.winner] = 2; }
  }
}

// Short calls over each competitor, the lift count in Basque, the leader's "Aupa!".
function call(app, p, text, bad = false) {
  const el = app.ui.querySelector(`.calls .c${p}`);
  if (!el) return;
  el.replaceChildren(h('b', { class: bad ? 'bad' : '' }, text));
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
}
function count(app, p, n) {
  const word = n <= 10 ? t(`num.${n}`) : String(n);
  call(app, p, `${word}!`);
  const note = app.ui.querySelector('.count-note');
  if (note && n === 1) note.classList.remove('hidden');
}
function aupa(app) {
  const el = app.ui.querySelector('.aupa');
  if (!el) return;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
}

// ---- the event -------------------------------------------------------------------------------------------

export function play(app) {
  const S = app.session, day = S.day, ev = day.event;
  if (new URLSearchParams(location.search).has('debug')) window.day = day; // developer peek
  const anim = newAnim(), fx = newFx();
  let countdown = 3.2, endT = 0;
  const el = {
    board: h('div', { class: 'board' }), timer: h('div', { class: 'timer' }),
    calls: h('div', { class: 'calls' }, h('div', { class: 'c c0' }), h('div', { class: 'c c1' })),
    big: h('div', { class: 'big' }), aupa: h('div', { class: 'aupa' }, t('call.aupa')),
    stat: h('div', { class: 'stats' }, h('span', { class: 's0' }), h('span', { class: 's1' })),
    note: h('p', { class: 'count-note hidden' }, t('num.note')),
    help: h('p', { class: 'play-help' }),
  };
  app.ui.replaceChildren(h('div', { class: `overlay play ev-${ev.id}` }, el.board, el.timer, el.calls, el.stat, el.big, ev.id === 'sokatira' ? el.aupa : null, ev.id === 'harri' ? el.note : null, el.help));
  el.board.replaceChildren(
    h('div', { class: 'side red' }, h('span', { class: 'name' }, t('hud.red')), h('b', {}, fmt(day.points[0]))),
    h('div', { class: 'mid' }, t(`ev.${ev.id}.name`)),
    h('div', { class: 'side blue' }, h('b', {}, fmt(day.points[1])), h('span', { class: 'name' }, t('hud.blue'), day.players === 1 ? h('small', {}, ` ${t('hud.cpu')}`) : null)));
  // With two, each player's own keys on a line of their own.
  const helpLine = (p) => h('p', {}, h('span', { class: `who ${p ? 'blue' : 'red'}` }, t(p ? 'hud.blue' : 'hud.red')), keyLines(ev.id, p).flatMap((l, i) => (i ? [' · ', ...l.childNodes] : [...l.childNodes])));
  if (day.players === 2) el.help.replaceChildren(helpLine(0), helpLine(1));
  else el.help.replaceChildren(...rich(t(`ev.${ev.id}.how`)));
  const stats = () => {
    const f = (i) => ev.id === 'aizkolaritza' ? `${Math.round(ev.measure(i) * 100)}%` : ev.id === 'harri' ? `${ev.p[i].lifts}` : ev.id === 'txingak' ? t('unit.m', { n: ev.p[i].dist.toFixed(1) }) : '';
    el.stat.querySelector('.s0').textContent = f(0); el.stat.querySelector('.s1').textContent = f(1);
    el.timer.textContent = Math.ceil(Math.max(0, ev.time - ev.t));
  };
  const inputs = () => app.input.players.map((p) => ({ a: p.pressed.a, b: p.pressed.b, left: p.left, right: p.right }));
  let shown = -1;
  return {
    update(dt) {
      tickFx(fx, dt);
      if (countdown > 0) {
        const before = Math.ceil(countdown);
        countdown -= dt;
        const now = Math.ceil(countdown);
        if (now !== shown) { shown = now; el.big.replaceChildren(h('b', { class: now > 0 ? '' : 'go' }, now > 0 ? String(now) : t('count.go'))); el.big.className = 'big pop'; if (now > 0) sfx.tick(); else sfx.go(); }
        if (countdown <= 0) setTimeout(() => { el.big.className = 'big hidden'; }, 500);
        void before;
        return;
      }
      if (!ev.finished) {
        const ins = inputs();
        // With one player, either set of controls works.
        if (day.players === 1) ins[0] = { a: ins[0].a || ins[1].a, b: ins[0].b || ins[1].b, left: ins[0].left || ins[1].left, right: ins[0].right || ins[1].right };
        day.step(ins, dt);
        react(ev, anim, fx, dt, app);
        stats();
        if (ev.finished) { el.big.replaceChildren(h('b', {}, ev.winner == null ? t('res.event.tie') : t('res.event.winner', { who: who(ev.winner) }))); el.big.className = 'big pop'; }
      } else if ((endT += dt) > 2.5) app.go('result');
    },
    draw(g) {
      g.save();
      if (fx.shake > 0) g.translate((Math.random() - 0.5) * fx.shake * 10, (Math.random() - 0.5) * fx.shake * 6);
      drawEvent(g, ev, app.time, anim, fx);
      drawMeters(g, ev, app.time);
      drawBeat(g, ev, app.time);
      g.restore();
      finish(g);
    },
  };
}

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// ---- after each event -------------------------------------------------------------------------------------

export function result(app) {
  const day = app.session.day, ev = day.event, R = day.results.at(-1);
  const fact = app.data.facts[(day.index + 2) % app.data.facts.length];
  const m = (i) => ev.id === 'aizkolaritza' ? `${Math.round(R.measure[i] * 100)}%` : ev.id === 'harri' ? String(R.measure[i]) : ev.id === 'txingak' ? t('unit.m', { n: R.measure[i].toFixed(1) }) : '';
  const label = { aizkolaritza: 'res.cut', harri: 'res.lifts', txingak: 'res.dist', sokatira: 'res.rope' }[ev.id];
  let t0 = 0;
  app.ui.replaceChildren(h('div', { class: 'overlay results' }, h('div', { class: 'parchment res-card' },
    h('p', { class: 'kicker' }, t(`ev.${ev.id}.name`)),
    h('h2', {}, R.winner == null ? t('res.event.tie') : t('res.event.winner', { who: who(R.winner) })),
    ev.id !== 'sokatira' ? h('div', { class: 'res-row' }, h('span', {}, t(label)), h('span', { class: 'red' }, m(0)), h('span', { class: 'blue' }, m(1))) : null,
    h('div', { class: 'res-total' }, h('span', {}, t('res.day')), h('b', {}, h('span', { class: 'red' }, fmt(day.points[0])), ' – ', h('span', { class: 'blue' }, fmt(day.points[1])))),
    h('div', { class: 'fact-inline' }, h('h3', {}, t('fact.title')), h('p', {}, t(fact.text_key))),
    h('p', { class: 'hint' }, rich(t('ui.next'))))));
  return {
    update(dt) {
      t0 += dt;
      if (t0 < 1.2 || !(app.input.any('a') || app.input.any('start'))) return;
      sfx.ok();
      const next = day.next();
      if (next) app.go('card'); else app.go('champion');
    },
    draw(g) { drawEvent(g, ev, app.time, newAnim(), { cheer: R.winner == null ? [0.4, 0.4] : [R.winner ? 0 : 1, R.winner ? 1 : 0], bits: [] }); finish(g); g.fillStyle = 'rgba(20,12,6,0.4)'; g.fillRect(0, 0, W, H); },
  };
}

// ---- the champion gets the txapela --------------------------------------------------------------------------

export function champion(app) {
  const day = app.session.day, w = day.winner, fx = newFx();
  confetti(fx);
  sfx.win();
  const solo = day.players === 1;
  let t0 = 0;
  const title = w == null ? t('final.draw') : solo && w === 1 ? t('final.youLost') : t('final.champion');
  app.ui.replaceChildren(h('div', { class: 'overlay champion' }, h('div', { class: 'parchment champ-card' },
    h('h2', { class: w == null ? '' : w ? 'blue' : 'red' }, title),
    w != null ? h('p', {}, t('final.text', { who: who(w) })) : null,
    h('p', { class: 'final' }, h('span', { class: 'red' }, `${t('hud.red')} ${fmt(day.points[0])}`), ' – ', h('span', { class: 'blue' }, `${fmt(day.points[1])} ${t('hud.blue')}`)),
    h('div', { class: 'word' }, h('b', {}, t('gl.txapela.name')), ' — ', t('gl.txapela.text')),
    h('p', { class: 'hint' }, rich(t('ui.next'))))));
  return {
    update(dt) {
      t0 += dt; tickFx(fx, dt * 0.6);
      fx.cheer = [w === 0 || w == null ? 1 : 0, w === 1 || w == null ? 1 : 0];
      if (t0 > 1.5 && (app.input.any('a') || app.input.any('start'))) { sfx.ok(); app.go('fact'); }
    },
    draw(g) {
      drawEvent(g, null, app.time, null, fx);
      // Both on the plaza: the winner arms up, the other clapping along.
      for (const i of [0, 1]) {
        const won = w === i || w == null;
        drawFigure(g, won ? POSES.cheer : POSES.slump, LANE[i] + (i ? -80 : 80), GROUND, U, i ? -1 : 1, i, { hair: i ? '#2a1c14' : '#4a3222', moustache: !!i, beret: won && w != null ? 'transparent' : undefined });
        if (won && w != null) {
          const drop = Math.min(1, t0 / 1.4);
          drawTxapela(g, LANE[i] + (i ? -80 : 80) + (i ? -5 : 5), GROUND - 1.84 * U - (1 - drop) * 160, 0.62);
        }
      }
      finish(g);
    },
  };
}

export function fact(app) {
  const f = app.data.facts[Math.floor(Math.random() * app.data.facts.length)];
  let t0 = 0;
  app.ui.replaceChildren(h('div', { class: 'overlay fact' }, h('div', { class: 'parchment fact-card' }, h('h3', {}, t('fact.title')), h('p', {}, t(f.text_key)), h('p', { class: 'hint' }, rich(t('ui.next'))))));
  return {
    update(dt) { t0 += dt; if ((t0 > 1 && (app.input.any('a') || app.input.any('start'))) || t0 > 20) app.go('attract'); },
    draw(g) { drawEvent(g, null, app.time, null, null); finish(g); g.fillStyle = 'rgba(20,12,6,0.4)'; g.fillRect(0, 0, W, H); },
  };
}
