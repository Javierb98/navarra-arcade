// Every screen is a function (app, arg) -> { update(dt), draw(ctx) } that
// builds its own DOM over the canvas and moves on with app.go(). Flow:
// attract -> menu -> story -> howto -> match -> results -> [initials] -> fact -> attract.

import { h } from './dom.js';
import { t, getLang, setLang, nextLang, LANGS } from './i18n.js';
import { Match, shotFor } from '../core/pelota.js';
import { drawCourt, backdrop, finish, portrait, drawTxapela } from './art.js';
import { sfx } from './audio.js';
import { settings, topScores, qualifies, addScore } from './store.js';
import { langParam } from './arcade.js';
import { keysOn, keyName } from './keys.js';

const W = 960, H = 540;
const COURSE = 'mano';

// "[A] drive" -> button glyph + text, so non-readers can match the button.
// At a computer keyboard the key is shown too ("A·Z"). {p} picks whose keys.
export function rich(text, p = 0) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(/\[(A|B|C|START)\]/g)) {
    const b = m[1].toLowerCase();
    parts.push(text.slice(last, m.index), h('span', { class: `btn btn-${b}` }, m[1]));
    if (keysOn()) parts.push(h('kbd', {}, keyName(p, b)));
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

const seed = (app) => (app.time * 1000 + Date.now()) | 0;
const who = (i) => t(i ? 'who.blue' : 'who.red');

function factCard(fact) {
  return h('div', { class: 'parchment fact-card' }, h('h3', {}, t('fact.title')), h('p', {}, t(fact.text_key)));
}

function scoreTable() {
  const cols = ['easy', 'normal'].map((d) => {
    const list = topScores(COURSE, d);
    return h('div', { class: 'scores-col' }, h('h3', {}, t(`menu.difficulty.${d}`)),
      list.length ? h('ol', {}, list.map((s) => h('li', {}, h('span', {}, s.name), h('span', {}, String(s.score))))) : h('p', { class: 'small' }, t('scores.empty')));
  });
  return h('div', { class: 'parchment scores' }, h('h2', {}, t('scores.title')), h('div', { class: 'scores-row' }, cols));
}

// The match seen live: a computer against the computer behind the title.
function demo(app) {
  let m = new Match(app.data.rules, { seed: seed(app), ai: [true, true], to: 5 });
  const view = newView();
  return {
    get m() { return m; },
    view,
    update(dt) {
      if (m.phase === 'over') m = new Match(app.data.rules, { seed: seed(app), ai: [true, true], to: 5 });
      m.step([], dt);
      follow(m, view, dt);
    },
  };
}

function newView(light = 'sunset') { return { anim: [{ run: 0 }, { run: 0 }], trail: [], marks: [], cheer: 0, fx: [], shake: 0, light }; }

// Animation state that isn't part of the rules: run cycles, the ball's
// streak, marks on the wall and floor, the crowd.
function follow(m, view, dt) {
  m.p.forEach((pl, i) => { view.anim[i].run += Math.hypot(pl.vx, pl.vy) * dt * 2.2; });
  const b = m.ball;
  view.trail.push({ x: b.x, y: b.y, z: b.z });
  if (view.trail.length > 6 || Math.hypot(b.vx, b.vy) < 6) view.trail.shift();
  for (const e of m.events) {
    if (e.type === 'wall') view.marks.push({ x: e.x, y: 0, z: e.z, life: 0.9, max: 0.9 });
    if (e.type === 'chapa') view.marks.push({ x: e.x, y: 0, z: e.z, life: 1.5, max: 1.5, bad: true });
    if (e.type === 'bounce') view.marks.push({ x: e.x, y: e.y, z: 0, life: 0.7, max: 0.7 });
    if (e.type === 'point') view.cheer = 1.6 + Math.min(2, e.rally * 0.2);
  }
  for (const e of m.events) {
    if (e.type === 'wall') puff(view, e.x, 0.15, e.z, 5, '#e8dcc4', 0.25);
    if (e.type === 'bounce') puff(view, e.x, e.y, 0.05, 4, '#cdbb9a', 0.18);
    if (e.type === 'hit' && e.perfect) view.shake = 0.35;
  }
  for (const pl of m.p) if (Math.hypot(pl.vx, pl.vy) > 5 && Math.random() < dt * 8) puff(view, pl.x, pl.y + 0.2, 0.05, 1, '#c8b494', 0.12);
  for (const k of view.marks) k.life -= dt;
  view.marks = view.marks.filter((k) => k.life > 0);
  view.cheer = Math.max(0, view.cheer - dt);
  view.shake = Math.max(0, view.shake - dt * 1.5);
  for (const p of view.fx) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z = Math.max(0, p.z + p.vz * dt); p.vz -= (p.g ?? 0) * dt; }
  view.fx = view.fx.filter((p) => p.life > 0);
}

// A puff of dust or plaster, in world coordinates.
function puff(view, x, y, z, n, colour, size) {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2;
    view.fx.push({ kind: 'puff', x, y, z, vx: Math.cos(a) * 0.9, vy: Math.sin(a) * 0.5 + 0.3, vz: 0.3 + Math.random() * 0.5, life: 0.5, max: 0.5, size: size * 0.35, grow: size * 0.9, colour, alpha: 0.3 });
  }
}

function confetti(view, n = 80) {
  const cols = ['#c0392b', '#f3ece0', '#2e7d4f', '#e8b840'];
  for (let k = 0; k < n; k++) view.fx.push({ kind: 'confetti', x: Math.random() * 12, y: 8 + Math.random() * 20, z: 6 + Math.random() * 4, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, vz: -0.5 - Math.random(), g: 0.3, life: 4, max: 4, colour: cols[k % 4] });
}

// ---- attract -------------------------------------------------------------------------------

export function attract(app) {
  setLang(langParam ?? settings.lang);
  const d = demo(app);
  const cards = ['title', 'fact', 'title', 'scores'];
  let card = 0, cardT = 0, factI = Math.floor(Math.random() * app.data.facts.length);
  const show = () => {
    const press = h('p', { class: 'press' }, rich(t('title.press')));
    let body;
    if (cards[card] === 'title') body = h('div', { class: 'title-card' }, h('h1', { class: 'logo' }, t('title.name')), h('p', { class: 'subtitle' }, t('title.subtitle')), h('p', { class: 'tag' }, t('title.players')));
    else if (cards[card] === 'fact') { factI = (factI + 1) % app.data.facts.length; body = factCard(app.data.facts[factI]); }
    else body = scoreTable();
    app.ui.replaceChildren(h('div', { class: 'overlay attract' }, body, press));
  };
  show();
  return {
    attract: true,
    update(dt) {
      d.update(dt);
      if ((cardT += dt) > (cards[card] === 'title' ? 9 : 10)) { card = (card + 1) % cards.length; cardT = 0; show(); }
      const [p1, p2] = app.input.players;
      if (p1.pressed.start || p1.pressed.a || p2.pressed.start || p2.pressed.a) app.go('menu');
    },
    draw(ctx) { drawCourt(ctx, d.m, app.time, d.view); ctx.fillStyle = 'rgba(20,12,6,0.25)'; ctx.fillRect(0, 0, W, H); },
  };
}

// ---- menu -------------------------------------------------------------------------------------

export function menu(app) {
  const S = { players: 1, difficulty: settings.difficulty };
  const rows = ['players', 'difficulty', 'lang', 'go'];
  let row = 0;
  const value = (r) => {
    if (r === 'go') return h('span', {}, rich(`[A] ${t('menu.go')}`));
    if (r === 'lang') return h('span', { class: 'langs' }, LANGS.map((l) => h('span', { class: l === getLang() ? 'on' : '' }, t(`lang.${l}`))));
    return h('span', { class: 'value' }, h('span', { class: 'arrow' }, '‹'), h('span', {}, t(`menu.${r}.${S[r]}`)), h('span', { class: 'arrow' }, '›'));
  };
  const show = () => app.ui.replaceChildren(h('div', { class: 'overlay menu' }, h('div', { class: 'parchment menu-card' },
    h('h1', { class: 'logo small' }, t('title.name')),
    h('div', { class: 'rows' }, rows.map((r, i) => h('div', { class: `row row-${r} ${i === row ? 'sel' : ''}` },
      r !== 'go' ? h('span', { class: 'label' }, t(`menu.${r}`)) : null, value(r)))),
    h('p', { class: 'note' }, t(`menu.${S.difficulty}.note`)),
    h('p', { class: 'hint' }, rich(t('menu.hint'))))));
  show();
  const change = (dir) => {
    const r = rows[row];
    if (r === 'players') S.players = S.players === 1 ? 2 : 1;
    else if (r === 'difficulty') S.difficulty = S.difficulty === 'easy' ? 'normal' : 'easy';
    else if (r === 'lang') nextLang(dir);
    else return;
    sfx.move(); show();
  };
  return {
    update() {
      const inp = app.input;
      if (inp.players[1].pressed.start && S.players !== 2) { S.players = 2; sfx.move(); show(); return; }
      if (inp.any('up')) { row = (row + rows.length - 1) % rows.length; sfx.move(); show(); }
      if (inp.any('down')) { row = (row + 1) % rows.length; sfx.move(); show(); }
      if (inp.any('left')) change(-1);
      if (inp.any('right')) change(1);
      if (inp.any('c')) { nextLang(1); sfx.move(); show(); }
      if (inp.any('start') || (inp.any('a') && rows[row] === 'go')) { sfx.ok(); app.session = { ...S, stage: 0, total: 0, perfect: 0, longest: 0 }; app.go('story'); }
      else if (inp.any('a')) change(1);
    },
    draw(ctx) { backdrop(ctx, 'sunset', app.time); finish(ctx); ctx.fillStyle = 'rgba(20,12,6,0.45)'; ctx.fillRect(0, 0, W, H); },
  };
}

// ---- story and how to play ------------------------------------------------------------------------

export function story(app) {
  const panels = app.data.story.intro;
  let i = 0, t0 = 0;
  const show = () => app.ui.replaceChildren(h('div', { class: 'overlay story' },
    h('div', { class: 'caption parchment' }, h('p', {}, t(panels[i].text)),
      h('div', { class: 'foot' },
        h('div', { class: 'dots' }, panels.map((_, k) => h('span', { class: k === i ? 'on' : '' }))),
        h('p', { class: 'hint' }, rich(t('ui.next')), '    ', rich(t('ui.skip')))))));
  show();
  return {
    update(dt) {
      if (app.input.any('start')) { app.go('howto'); return; }
      if (app.input.any('a') || (t0 += dt) > 8) { sfx.move(); t0 = 0; if (++i >= panels.length) app.go('howto'); else show(); }
    },
    draw(ctx) { backdrop(ctx, 'afternoon', app.time, i === 0 ? 0.8 : 0); finish(ctx); },
  };
}

export function howto(app) {
  let t0 = 0;
  app.ui.replaceChildren(h('div', { class: 'overlay howto' }, h('div', { class: 'parchment brief-card' },
    h('h2', {}, t('howto.title')),
    h('ul', { class: 'howto-list' }, ['move', 'a', 'b', 'aim', 'txoko', 'ancho', 'globo', 'timing', 'turn'].map((k) => h('li', {}, rich(t(`howto.${k}`))))),
    app.session.players === 2 ? h('p', { class: 'small' }, t('hud.to', { n: app.data.rules.match.to })) : null,
    h('p', { class: 'hint' }, rich(`[A] ${t('menu.go')}`)))));
  return {
    update(dt) { t0 += dt; if ((t0 > 0.6 && (app.input.any('a') || app.input.any('start'))) || t0 > 25) { sfx.ok(); app.go(app.session.players === 1 ? 'rival' : 'play'); } },
    draw(ctx) { backdrop(ctx, 'sunset', app.time); finish(ctx); ctx.fillStyle = 'rgba(20,12,6,0.35)'; ctx.fillRect(0, 0, W, H); },
  };
}

// ---- the next rival in the tournament ----------------------------------------------------------------

export function rival(app) {
  const S = app.session, stages = app.data.rules.tournament, st = stages[S.stage];
  let t0 = 0;
  app.ui.replaceChildren(h('div', { class: 'overlay rival' }, h('div', { class: 'parchment rival-card' },
    h('p', { class: 'kicker' }, t('rival.kicker', { n: S.stage + 1, total: stages.length })),
    h('h2', {}, t(`rival.${st.id}.name`)),
    h('p', { class: 'about' }, t(`rival.${st.id}.about`)),
    h('p', { class: 'small' }, `${t(`light.${st.place}`)} · ${t('rival.to', { n: st.to })}`),
    h('p', { class: 'hint' }, rich(`[A] ${t('menu.go')}`)))));
  return {
    update(dt) { t0 += dt; if ((t0 > 0.6 && (app.input.any('a') || app.input.any('start'))) || t0 > 20) { sfx.ok(); app.go('play'); } },
    draw(ctx) {
      backdrop(ctx, st.place, app.time); finish(ctx);
      ctx.fillStyle = 'rgba(20,12,6,0.4)'; ctx.fillRect(0, 0, W, H);
      portrait(ctx, 'red', 250, 250, 1.2, app.time);
      portrait(ctx, st.id, 710, 250, 1.2, app.time + 1);
      ctx.fillStyle = '#fff4d6'; ctx.font = 'bold 44px "Palatino Linotype", Palatino, Georgia, serif'; ctx.textAlign = 'center';
      ctx.fillText('vs', 480, 262);
    },
  };
}

// ---- the match ------------------------------------------------------------------------------------

export function play(app) {
  const S = app.session;
  const R = app.data.rules, st = S.players === 1 ? R.tournament[S.stage] : null;
  const m = new Match(R, { players: S.players, difficulty: S.difficulty, seed: seed(app), opponent: st ? R.opponents[st.id] : null, to: st ? st.to : R.match.to });
  if (new URLSearchParams(location.search).has('debug')) window.match = m; // developer peek
  const view = newView(new URLSearchParams(location.search).get('light') ?? (st ? st.place : 'sunset')); // ?light= is a developer switch
  view.perfectAt = R.timing.perfect;
  const taught = new Set();
  let endT = 0, callUntil = 0, cardUntil = 0;

  const el = {
    board: h('div', { class: 'board' }), status: h('p', { class: 'status' }),
    call: h('div', { class: 'call hidden' }), card: h('div', { class: 'gloss parchment hidden' }), fb: h('div', { class: 'fb hidden' }),
    help: h('div', { class: 'play-help' }),
  };
  app.ui.replaceChildren(h('div', { class: 'overlay play' }, el.board, el.status, el.call, el.card, el.fb, el.help));
  let fbUntil = 0;
  const feedback = (e) => {
    const grade = e.perfect ? 'perfect' : e.quality > 0.55 ? 'good' : 'poor';
    el.fb.replaceChildren(h('b', { class: grade }, t(`fb.${grade}`)), h('span', {}, t(`shot.${e.kind}`)));
    el.fb.className = `fb ${e.p ? 'blue' : 'red'}`;
    fbUntil = app.time + 1.1;
  };

  let boardKey = '';
  const renderBoard = () => {
    const key = `${m.score}|${getLang()}`;
    if (key === boardKey) return;
    boardKey = key;
    el.board.replaceChildren(
      h('div', { class: 'side red' }, h('span', { class: 'name' }, t('hud.red')), h('b', {}, String(m.score[0]))),
      h('div', { class: 'mid' }, h('span', {}, t('hud.to', { n: m.to }))),
      h('div', { class: 'side blue' }, h('b', {}, String(m.score[1])), h('span', { class: 'name' }, t('hud.blue'), S.players === 1 ? h('small', {}, ` ${t('hud.cpu')}`) : null)));
  };
  let statusKey = '';
  const renderStatus = () => {
    const txt = m.phase === 'serve' && !m.p[m.server].ai ? t('hud.serve', { who: who(m.server) }) : m.phase === 'rally' && m.rally > 2 ? t('hud.rally', { n: m.rally }) : '';
    if (txt === statusKey) return;
    statusKey = txt;
    el.status.replaceChildren(...rich(txt));
  };
  const call = (text, sub, secs = 2) => {
    el.call.replaceChildren(h('b', {}, text), sub ? h('span', {}, sub) : null);
    el.call.className = 'call';
    callUntil = app.time + secs;
  };
  // The first time a pelota word comes up, a small card explains it, one at a time.
  const lessons = [];
  const teach = (id) => { if (!taught.has(id)) { taught.add(id); lessons.push(id); } };
  const nextLesson = () => {
    if (cardUntil || !lessons.length) return;
    const id = lessons.shift();
    el.card.replaceChildren(h('p', { class: 'kicker' }, t('gl.title')), h('b', {}, t(`gl.${id}.name`)), h('p', {}, t(`gl.${id}.text`)));
    el.card.className = 'gloss parchment';
    cardUntil = app.time + 5.5;
  };

  const handle = () => {
    for (const e of m.events) {
      if (e.type === 'hit') {
        sfx.hit(e.quality);
        if (!m.p[e.p].ai) feedback(e);
        if (e.kind === 'dejada') teach('dejada');
        if (e.kind === 'txoko') teach('txoko');
      }
      else if (e.type === 'serve') { sfx.hit(1); if (m.score[0] + m.score[1] > 0) teach('saque'); }
      else if (e.type === 'wall') { sfx.wall(); teach('frontis'); }
      else if (e.type === 'chapa') sfx.chapa();
      else if (e.type === 'side') { sfx.wall(); teach('pared'); }
      else if (e.type === 'bounce') sfx.bounce();
      else if (e.type === 'whiff') sfx.whiff();
      else if (e.type === 'point') {
        const reason = { chapa: 'chapa', fuera: 'fuera', larga: 'fuera', corta: 'corta', botes: 'botes' }[e.reason];
        call(t(`call.${e.reason}`), t('call.tanto', { who: who(e.winner) }), 2.2);
        sfx.point(e.rally);
        if (reason) teach(reason);
        teach('tanto');
      } else if (e.type === 'over') { call(t('call.win', { who: who(e.winner) }), `${m.score[0]} – ${m.score[1]}`, 4); sfx.win(); if (!m.p[e.winner].ai) confetti(view); }
    }
  };

  const inputs = () => {
    const [a, b] = app.input.players;
    const one = (p) => ({ x: (p.right ? 1 : 0) - (p.left ? 1 : 0), y: (p.down ? 1 : 0) - (p.up ? 1 : 0), a: p.pressed.a, b: p.pressed.b });
    if (S.players === 2) return [one(a), one(b)];
    const x = one(a), y = one(b);
    return [{ x: x.x || y.x, y: x.y || y.y, a: x.a || y.a, b: x.b || y.b }, {}];
  };

  // How to hit and aim; shows each player's own keys at a keyboard.
  let helpKey = '';
  const renderHelp = () => {
    const key = `${keysOn()}|${getLang()}`;
    if (key === helpKey) return;
    helpKey = key;
    const line = (p) => {
      const arrows = keysOn() ? ['left', 'right', 'down'].map((d) => keyName(p, d)) : ['←', '→', '↓'];
      return h('p', {}, S.players === 2 ? h('span', { class: `who ${p ? 'blue' : 'red'}` }, t(p ? 'hud.blue' : 'hud.red')) : null,
        ...rich(t('help.hit'), p), ' · ', h('span', { class: 'aim' }, t('help.aim', { l: arrows[0], r: arrows[1], d: arrows[2] })));
    };
    el.help.replaceChildren(...(S.players === 2 ? [line(0), line(1)] : [line(0)]));
  };
  renderBoard(); renderStatus(); renderHelp();
  return {
    update(dt) {
      if (callUntil && app.time > callUntil) { el.call.className = 'call hidden'; callUntil = 0; }
      if (cardUntil && app.time > cardUntil) { el.card.className = 'gloss parchment hidden'; cardUntil = 0; }
      if (fbUntil && app.time > fbUntil) { el.fb.className = 'fb hidden'; fbUntil = 0; }
      nextLesson();
      if (m.phase === 'over') {
        m.step([], dt); follow(m, view, dt);
        if ((endT += dt) > 4) {
          S.perfect += m.stats.perfect[0]; S.longest = Math.max(S.longest, m.stats.longest);
          S.total += m.score[S.players === 1 ? 0 : m.winner] * R.score.point + m.stats.longest * R.score.rally + (m.winner === 0 || S.players === 2 ? R.score.win : 0);
          if (S.players === 1 && m.winner === 0) {
            if (S.stage + 1 < R.tournament.length) { S.stage++; app.go('rival'); }
            else app.go('txapela', { m });
          } else app.go('results', { m });
        }
        return;
      }
      const inp = inputs();
      m.step(inp, dt);
      follow(m, view, dt);
      // Show each person's aim when it's their turn to strike (or serve).
      view.aims = m.p.map((pl) => {
        if (pl.ai) return null;
        const mine = (m.phase === 'rally' && m.turn === pl.i && m.ball.wall) || (m.phase === 'serve' && m.server === pl.i);
        if (!mine) return null;
        const held = S.players === 2 ? inp[pl.i] : inp[0];
        const kind = m.phase === 'serve' ? 'drive' : shotFor('a', held);
        return { p: pl.i, kind, label: m.phase === 'serve' ? t('shot.serve') : t(`shot.${kind}`) };
      });
      handle();
      renderBoard(); renderStatus(); renderHelp();
    },
    draw(ctx) { drawCourt(ctx, m, app.time, view); },
  };
}

// ---- the end -------------------------------------------------------------------------------------------

export function results(app, { m }) {
  const S = app.session;
  const total = S.total;
  const champion = S.players === 1 && m.winner === 0;
  let t0 = 0;
  const row = (label, value) => h('div', { class: 'res-row' }, h('span', {}, label), h('span', { class: 'res-val' }, value));
  const title = S.players === 1 ? (champion ? t('txapela.title') : t('results.out')) : t('call.win', { who: who(m.winner) });
  app.ui.replaceChildren(h('div', { class: 'overlay results' }, h('div', { class: 'parchment res-card' },
    h('h2', {}, title),
    h('p', { class: 'final' }, h('span', { class: 'red' }, `${t('hud.red')} ${m.score[0]}`), ' – ', h('span', { class: 'blue' }, `${m.score[1]} ${t('hud.blue')}`)),
    S.players === 1 && !champion ? h('p', { class: 'small' }, t('results.reached', { n: S.stage + 1 })) : null,
    row(t('results.longest'), String(S.longest)),
    row(t('results.perfect'), String(S.perfect)),
    h('div', { class: 'res-total' }, h('span', {}, t('results.total')), h('b', {}, String(total))),
    h('p', { class: 'hint' }, rich(t('ui.next'))))));
  return {
    update(dt) {
      t0 += dt;
      if (t0 < 1 || !(app.input.any('a') || app.input.any('start'))) return;
      sfx.ok();
      if (qualifies(COURSE, S.difficulty, total)) app.go('initials', { score: total });
      else app.go('fact');
    },
    draw(ctx) { backdrop(ctx, 'night', app.time, 1); finish(ctx); ctx.fillStyle = 'rgba(20,12,6,0.4)'; ctx.fillRect(0, 0, W, H); },
  };
}

// Winning the tournament: the txapela.
export function txapela(app, { m }) {
  let t0 = 0;
  const view = newView('night');
  confetti(view, 140);
  app.ui.replaceChildren(h('div', { class: 'overlay txapela' }, h('div', { class: 'parchment txapela-card' },
    h('h2', {}, t('txapela.title')), h('p', {}, t('txapela.text')),
    h('p', { class: 'hint' }, rich(t('ui.next'))))));
  sfx.win();
  return {
    update(dt) {
      t0 += dt;
      for (const p of view.fx) { p.life -= dt * 0.5; p.x += p.vx * dt; p.y += p.vy * dt; p.z = Math.max(0, p.z + p.vz * dt); }
      if (t0 > 1.5 && (app.input.any('a') || app.input.any('start'))) { sfx.ok(); app.go('results', { m }); }
    },
    draw(ctx) {
      backdrop(ctx, 'night', app.time, 1);
      ctx.fillStyle = 'rgba(10,8,20,0.35)'; ctx.fillRect(0, 0, W, H);
      const drop = Math.min(1, t0 / 1.4);
      portrait(ctx, 'red', 480, 210, 1.5, app.time);
      drawTxapela(ctx, 480, 210 - 40 * 1.5 - (1 - drop) * 160, 1.5 * 1.1);
      drawFxLite(ctx, view.fx);
      finish(ctx);
    },
  };
}

function drawFxLite(ctx, fx) {
  for (const p of fx) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.colour;
    ctx.fillRect(80 + p.x * 70, 540 - p.z * 60 - (p.max - p.life) * 60 % 540, 5, 3);
  }
  ctx.globalAlpha = 1;
}

const ALPHABET = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';

export function initials(app, { score }) {
  const letters = [0, 0, 0];
  let slot = 0, saved = false, t0 = 0;
  const show = () => app.ui.replaceChildren(h('div', { class: 'overlay results' }, saved ? scoreTable() : h('div', { class: 'parchment res-card' },
    h('h2', {}, t('scores.new')), h('p', { class: 'big-score' }, String(score)),
    h('div', { class: 'initials' }, letters.map((l, i) => h('span', { class: i === slot ? 'sel' : '' }, ALPHABET[l]))),
    h('p', { class: 'hint' }, rich(t('scores.hint'))))));
  show();
  return {
    update(dt) {
      const inp = app.input;
      if (saved) { if ((t0 += dt) > 6 || (t0 > 0.5 && (inp.any('a') || inp.any('start')))) app.go('fact'); return; }
      if (inp.any('up')) { letters[slot] = (letters[slot] + 1) % ALPHABET.length; sfx.move(); show(); }
      if (inp.any('down')) { letters[slot] = (letters[slot] + ALPHABET.length - 1) % ALPHABET.length; sfx.move(); show(); }
      if (inp.any('left') && slot > 0) { slot--; sfx.move(); show(); }
      if (inp.any('right') && slot < 2) { slot++; sfx.move(); show(); }
      if (inp.any('a') || inp.any('start')) {
        sfx.ok();
        if (slot < 2) slot++;
        else { addScore(COURSE, app.session.difficulty, letters.map((l) => ALPHABET[l]).join(''), score); saved = true; }
        show();
      }
    },
    draw(ctx) { backdrop(ctx, 'sunset', app.time); finish(ctx); ctx.fillStyle = 'rgba(20,12,6,0.45)'; ctx.fillRect(0, 0, W, H); },
  };
}

export function fact(app) {
  const f = app.data.facts[Math.floor(Math.random() * app.data.facts.length)];
  let t0 = 0;
  const card = factCard(f);
  card.append(h('p', { class: 'hint' }, rich(t('ui.next'))));
  app.ui.replaceChildren(h('div', { class: 'overlay fact' }, card));
  return {
    update(dt) { t0 += dt; if ((t0 > 1 && (app.input.any('a') || app.input.any('start'))) || t0 > 20) app.go('attract'); },
    draw(ctx) { backdrop(ctx, 'sunset', app.time); finish(ctx); ctx.fillStyle = 'rgba(20,12,6,0.4)'; ctx.fillRect(0, 0, W, H); },
  };
}
