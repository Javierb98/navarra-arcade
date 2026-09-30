// Every screen is a function (app, arg) -> { update(dt), draw(ctx) } that
// builds its own DOM over the canvas and moves on with app.go(). Flow:
// attract -> menu -> story(intro) -> briefing -> play -> results ->
// [initials] -> fact -> story(outro) -> attract.

import { h } from './dom.js';
import { t, getLang, setLang, nextLang, LANGS } from './i18n.js';
import { Town, RES } from '../core/town.js';
import { aiTurn } from '../core/ai.js';
import { drawTown, drawScene, iconURL } from './art.js';
import { sfx } from './audio.js';
import { settings, topScores, qualifies, addScore } from './store.js';
import { langParam } from './arcade.js';

const W = 480, H = 270;

// "[A] play" -> button glyph + text, so non-readers can match the button.
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

const img = (id, cls = 'ico') => h('img', { class: cls, src: iconURL(id), alt: '' });
const cardName = (id) => t(`card.${id}.name`);

function newTown(app, opts) {
  return new Town({ ...app.data.game, stage: app.data.stages[0], ...opts });
}

// ---- attract: the computer builds Olite while the title shows ----------------------

export function attract(app) {
  setLang(langParam ?? settings.lang);
  let town = newTown(app, { seed: (app.time * 1000) | 0 });
  let clock = 0, restart = 0;
  const cards = ['title', 'fact', 'title', 'scores'];
  let card = 0, cardT = 0, factI = Math.floor(Math.random() * app.data.facts.length);
  const show = () => {
    const kind = cards[card];
    const press = h('p', { class: 'press' }, rich(t('title.press')));
    if (kind === 'title') {
      app.ui.replaceChildren(h('div', { class: 'overlay attract' },
        h('h1', { class: 'logo' }, t('title.name')), h('p', { class: 'subtitle' }, t('title.subtitle')), press));
    } else if (kind === 'fact') {
      factI = (factI + 1) % app.data.facts.length;
      app.ui.replaceChildren(h('div', { class: 'overlay attract' }, factCard(app.data.facts[factI]), press));
    } else {
      app.ui.replaceChildren(h('div', { class: 'overlay attract' }, scoreTable(), press));
    }
  };
  show();
  return {
    attract: true,
    update(dt) {
      // One season every couple of seconds, so the town visibly grows.
      clock += dt;
      if (clock > 2.2 && !town.finished) { clock = 0; aiTurn(town, 0); if (!town.finished) town.endTurn(0); }
      if (town.finished && (restart += dt) > 4) { town = newTown(app, { seed: (app.time * 1000) | 0 }); restart = 0; }
      if ((cardT += dt) > (cards[card] === 'title' ? 8 : 10)) { card = (card + 1) % cards.length; cardT = 0; show(); }
      const [p1, p2] = app.input.players;
      if (p2.pressed.start || p2.pressed.a) app.go('menu', { players: 2 });
      else if (p1.pressed.start || p1.pressed.a) app.go('menu', { players: 1 });
    },
    draw(ctx) {
      drawTownFull(ctx, townView(town), app.time);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(0, 0, W, H);
    },
  };
}

const townView = (town) => ({ built: town.built, people: town.people, season: town.seasonName, pop: town.pop });

// The town strip centred on screen, its sky and ground stretched to fill it.
function drawTownFull(ctx, view, time) {
  drawTown(ctx, view, time, 60);
  const c = ctx.canvas;
  ctx.drawImage(c, 0, 60, W, 1, 0, 0, W, 60);
  // Below: plain ground, the colour of the open field beside the town.
  const [r, g, bl] = ctx.getImageData(470, 60 + 92, 1, 1).data;
  ctx.fillStyle = `rgb(${r},${g},${bl})`;
  ctx.fillRect(0, 210, W, 60);
}

function factCard(fact) {
  return h('div', { class: 'card' }, h('h3', {}, t('fact.title')), h('p', {}, t(fact.text_key)));
}

function scoreTable() {
  const cols = ['easy', 'normal'].map((d) => {
    const list = topScores('walledtown', d);
    return h('div', { class: 'scores-col' }, h('h3', {}, t(`menu.difficulty.${d}`)),
      list.length ? h('ol', {}, list.map((s) => h('li', {}, h('span', {}, s.name), h('span', {}, s.score)))) : h('p', { class: 'small' }, t('scores.empty')));
  });
  return h('div', { class: 'card scores' }, h('h2', {}, t('scores.title')), h('div', { class: 'scores-row' }, cols));
}

// ---- menu ---------------------------------------------------------------------------

export function menu(app, { players = 1 } = {}) {
  const S = { players, difficulty: settings.difficulty };
  const rows = ['players', 'difficulty', 'lang', 'go'];
  let row = 0;
  let demo = newTown(app, { seed: 3 });
  let clock = 0;
  const value = (r) => {
    if (r === 'players') return h('span', {}, t(`menu.players.${S.players}`));
    if (r === 'difficulty') return h('span', {}, t(`menu.difficulty.${S.difficulty}`));
    if (r === 'lang') return h('span', { class: 'langs' }, LANGS.map((l) => h('span', { class: l === getLang() ? 'on' : '' }, t(`lang.${l}`))));
    return h('span', {}, rich(t('menu.go')));
  };
  const show = () => {
    app.ui.replaceChildren(h('div', { class: 'overlay menu' },
      h('h1', { class: 'logo small-logo' }, t('title.name')),
      h('div', { class: 'rows' }, rows.map((r, i) => h('div', { class: `row ${i === row ? 'sel' : ''} row-${r}` },
        r !== 'go' ? h('span', { class: 'label' }, t(`menu.${r}`)) : null,
        r === 'players' || r === 'difficulty' ? h('span', { class: 'arrow' }, '◀') : null,
        value(r),
        r === 'players' || r === 'difficulty' ? h('span', { class: 'arrow' }, '▶') : null))),
      h('p', { class: 'note' }, t(`menu.${S.difficulty}.note`)),
      h('p', { class: 'hint' }, rich(t('menu.hint')))));
  };
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
    update(dt) {
      clock += dt;
      if (clock > 2.5 && !demo.finished) { clock = 0; aiTurn(demo, 0); if (!demo.finished) demo.endTurn(0); }
      const inp = app.input;
      if (inp.players[1].pressed.start && S.players !== 2) { S.players = 2; sfx.move(); show(); }
      if (inp.any('up')) { row = (row + rows.length - 1) % rows.length; sfx.move(); show(); }
      if (inp.any('down')) { row = (row + 1) % rows.length; sfx.move(); show(); }
      if (inp.any('left')) change(-1);
      if (inp.any('right')) change(1);
      if (inp.any('c')) { nextLang(1); sfx.move(); show(); }
      if (inp.players[0].pressed.start || inp.players[1].pressed.start || (inp.any('a') && rows[row] === 'go')) {
        sfx.ok();
        app.session = { players: S.players, difficulty: S.difficulty };
        app.go('story', { panels: app.data.story.intro, next: 'briefing' });
      } else if (inp.any('a')) { row = rows.length - 1; sfx.move(); show(); }
    },
    draw(ctx) {
      drawTownFull(ctx, townView(demo), app.time);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
    },
  };
}

// ---- story panels -----------------------------------------------------------------

export function story(app, { panels, next }) {
  let i = 0, t0 = 0;
  const show = () => {
    app.ui.replaceChildren(h('div', { class: 'overlay story' }, h('div', { class: 'caption' },
      h('p', {}, t(panels[i].text)),
      h('div', { class: 'dots' }, panels.map((_, k) => h('span', { class: k === i ? 'on' : '' }))),
      h('p', { class: 'hint' }, rich(t('ui.next')), '   ', rich(t('ui.skip'))))));
  };
  show();
  const advance = () => { if (++i >= panels.length) app.go(next); else { t0 = 0; show(); } };
  return {
    update(dt) {
      if (app.input.any('start')) { app.go(next); return; }
      if (app.input.any('a')) { sfx.move(); advance(); return; }
      if ((t0 += dt) > 7) advance();
    },
    draw(ctx) {
      if (!panels[i]) return;
      ctx.save(); ctx.translate(0, -24); drawScene(ctx, panels[i].scene, app.time); ctx.restore();
      ctx.fillStyle = '#14121a'; ctx.fillRect(0, H - 24, W, 24);
    },
  };
}

// ---- briefing: the goal and the buttons ------------------------------------------------

export function briefing(app) {
  const stage = app.data.stages[0];
  const two = app.session.players === 2;
  let t0 = 0;
  app.ui.replaceChildren(h('div', { class: 'overlay briefing' }, h('div', { class: 'card' },
    h('h2', {}, t(`stage.${stage.id}.name`)),
    h('p', {}, t(`stage.${stage.id}.blurb`)),
    h('div', { class: 'goal-list' }, Object.entries(stage.goal).map(([id, n]) => h('span', { class: 'goal-item' }, img(id), ` ${n} × ${cardName(id)}`))),
    h('p', { class: 'small' }, app.session.difficulty === 'normal' ? t('seasonsLeft', { n: stage.seasons }) : t('noLimit')),
    two ? h('p', { class: 'small' }, h('span', { class: 'ptag p1' }, '1'), ` ${t('role.town')}  `, h('span', { class: 'ptag p2' }, '2'), ` ${t('role.builder')}`) : null,
    h('p', { class: 'small' }, rich(t(two ? 'hint.duo' : 'hint.solo'))),
    h('p', { class: 'hint' }, rich(t('ui.next'))))));
  return {
    update(dt) {
      t0 += dt;
      if (t0 > 0.5 && (app.input.any('a') || app.input.any('start'))) { sfx.ok(); app.go('play'); }
      else if (t0 > 25) app.go('play');
    },
    draw(ctx) { drawScene(ctx, 'village', app.time); },
  };
}

// ---- play -----------------------------------------------------------------------------

export function play(app) {
  const { players, difficulty } = app.session;
  const town = newTown(app, { players, difficulty, seed: (app.time * 1000) | 0 });
  if (new URLSearchParams(location.search).has('debug')) window.olite = { town, get banner() { return banner; } }; // developer peek
  const cursors = [{ row: 'hand', i: 0 }, { row: 'hand', i: 0 }];
  let banner = 0, doneT = 0, confirmEnd = [0, 0], lastRes = { ...town.res }, detailFor = 0;

  // Build the DOM once; refresh() fills it from the town.
  const el = {
    res: h('div', { class: 'res-bar' }), season: h('div', { class: 'season-box' }), goal: h('div', { class: 'goal-box' }),
    detail: h('div', { class: 'detail' }), board: h('div', { class: `board ${players === 2 ? 'duo' : 'solo'}` }),
    banner: h('div', { class: 'banner hidden' }), msg: h('div', { class: 'msg hidden' }), hint: h('p', { class: 'hint play-hint' }),
  };
  app.ui.replaceChildren(h('div', { class: 'overlay play' }, el.res, el.season, el.goal, el.detail, el.board, el.hint, el.banner, el.msg));

  const say = (text, secs = 2.5) => {
    el.msg.replaceChildren(...rich(text));
    el.msg.classList.remove('hidden');
    el.msg.dataset.until = app.time + secs;
  };
  const showBanner = (children, secs = 2.2) => {
    el.banner.replaceChildren(...children);
    el.banner.classList.remove('hidden');
    banner = secs;
  };

  const costChips = (cost, missing = {}) => Object.entries(cost).filter(([, n]) => n > 0).map(([r, n]) =>
    h('span', { class: `chip ${missing[r] ? 'short' : ''}` }, img(r), String(n)));

  // What the selected card or plan is, what it costs and what's missing.
  const renderDetail = (p) => {
    const cur = cursors[p];
    const item = cur.row === 'plans' ? town.plansFor(p)[cur.i] : town.hands[p][cur.i];
    if (!item) { el.detail.replaceChildren(); return; }
    const id = item.id;
    const chk = cur.row === 'plans' ? town.checkPlan(p, id) : town.check(p, cur.i);
    const why = chk.noPlays ? t('why.noPlays')
      : Object.keys(chk.needs ?? {}).length ? t('why.needs', { list: Object.entries(chk.needs).map(([b, n]) => `${n} × ${cardName(b)}`).join(', ') })
        : null;
    el.detail.className = `detail ${players === 2 ? `p${p + 1}` : ''}`;
    el.detail.replaceChildren(
      h('div', { class: 'd-head' },
        h('b', {}, cardName(id)), h('span', { class: 'd-text' }, t(`card.${id}.text`)),
        h('span', { class: 'd-cost' }, costChips(chk.cost ?? town.costOf(id), chk.missing ?? {})),
        why ? h('span', { class: 'why' }, why) : null),
      h('p', { class: 'd-hist' }, t(`card.${id}.history`)));
  };

  const renderBoard = () => {
    const halves = [];
    for (let p = 0; p < players; p++) {
      const cur = cursors[p];
      const plans = town.plansFor(p).map((pl, i) => {
        const chk = town.checkPlan(p, pl.id);
        const goalNeed = town.stage.goal[pl.id];
        const locked = Object.keys(chk.needs ?? {}).length > 0;
        return h('div', { class: `tile ${chk.ok ? 'ok' : locked ? 'locked' : 'short'} ${cur.row === 'plans' && cur.i === i ? 'sel' : ''}` },
          img(pl.id), h('span', { class: 'tname' }, cardName(pl.id)),
          goalNeed ? h('span', { class: `count ${town.count(pl.id) >= goalNeed ? 'done' : ''}` }, `${Math.min(town.count(pl.id), goalNeed)}/${goalNeed}`) : town.count(pl.id) ? h('span', { class: 'count' }, `×${town.count(pl.id)}`) : null,
          locked ? h('span', { class: 'lock' }, '🔒') : null);
      });
      const hand = town.hands[p].map((c, i) => {
        const chk = town.check(p, i), def = town.cardDefs[c.id];
        return h('div', { class: `hcard ${def.type} ${chk.ok ? 'ok' : 'short'} ${cur.row === 'hand' && cur.i === i ? 'sel' : ''}` },
          img(c.id), h('span', { class: 'tname' }, cardName(c.id)));
      });
      const done = town.done[p] && players === 2;
      halves.push(h('div', { class: `half ${players === 2 ? `p${p + 1}` : ''} ${done ? 'done' : ''}` },
        h('div', { class: 'row-label' }, players === 2 ? h('span', { class: `ptag p${p + 1}` }, String(p + 1)) : null,
          ` ${players === 2 ? t(`role.${p === 0 ? 'town' : 'builder'}`) + ' · ' : ''}${t('plans')}`,
          h('span', { class: 'plays' }, t('plays', { n: town.playsLeft[p] }))),
        h('div', { class: 'tiles' }, plans),
        h('div', { class: 'row-label' }, t('hand')),
        h('div', { class: 'hand' }, hand.length ? hand : h('span', { class: 'empty' }, '—')),
        done ? h('div', { class: 'waiting' }, t('msg.waiting')) : null));
    }
    el.board.replaceChildren(...halves);
  };

  const renderHud = () => {
    el.res.replaceChildren(...RES.map((r) => {
      const d = town.res[r] - lastRes[r];
      return h('span', { class: 'res' }, img(r), h('b', {}, String(town.res[r])), d ? h('i', { class: d > 0 ? 'up' : 'down' }, `${d > 0 ? '+' : ''}${d}`) : null);
    }), h('span', { class: 'res' }, img('workers'), h('b', {}, `${town.workers}`)), h('span', { class: 'res pop' }, img('pop'), h('b', {}, String(town.pop))));
    el.season.replaceChildren(h('b', {}, `${t(`season.${town.seasonName}`)} · ${t('year', { n: town.year })}`),
      h('span', {}, town.seasonsLeft == null ? t('noLimit') : t('seasonsLeft', { n: town.seasonsLeft })));
    el.goal.replaceChildren(h('b', {}, t('goal')), ...town.goalProgress().map((g) =>
      h('span', { class: `g ${g.have >= g.need ? 'done' : ''}` }, img(g.id), `${g.have}/${g.need}`)));
    el.hint.replaceChildren(...rich(t(players === 2 ? 'hint.duo' : 'hint.solo')));
  };

  const refresh = () => { renderHud(); renderBoard(); renderDetail(detailFor); };

  // Keep each cursor on something that exists.
  const clamp = (p) => {
    const cur = cursors[p];
    const len = cur.row === 'plans' ? town.plansFor(p).length : town.hands[p].length;
    if (cur.row === 'hand' && !len) cur.row = 'plans';
    const n = cur.row === 'plans' ? town.plansFor(p).length : town.hands[p].length;
    cur.i = Math.max(0, Math.min(cur.i, n - 1));
  };

  const handleEvents = () => {
    for (const e of town.events) {
      if (e.type === 'built') { sfx.build(); say(`${cardName(e.card)} ✓`, 1.6); }
      else if (e.type === 'played') sfx.card();
      else if (e.type === 'sold') { sfx.coin(); say(t('msg.sold', { n: e.n }), 2); }
      else if (e.type === 'discarded') say(t('msg.swap'), 1.4);
      else if (e.type === 'passed') say(t('msg.passed'), 1.4);
      else if (e.type === 'cantPlay') sfx.miss();
      else if (e.type === 'hunger') { sfx.hunger(); say(t('msg.hunger'), 3.5); }
      else if (e.type === 'season') {
        sfx.season();
        const ev = town.events.find((x) => x.type === 'event');
        showBanner([h('h2', {}, `${t(`season.${e.season}`)} · ${t('year', { n: e.year })}`),
          ev ? h('div', { class: `event ${ev.good ? 'good' : 'bad'}` }, img(ev.id, 'ico big'), h('div', {}, h('b', {}, t(`event.${ev.id}.name`)), h('p', {}, t(`event.${ev.id}.text`)))) : null], ev ? 3.5 : 1.6);
        if (ev) (ev.good ? sfx.eventGood : sfx.eventBad)();
      } else if (e.type === 'won') { sfx.finish(); showBanner([h('h2', {}, t('msg.won'))], 3); }
      else if (e.type === 'timeUp') { sfx.eventBad(); showBanner([h('h2', {}, t('msg.timeUp'))], 3); }
    }
  };

  const act = (fn) => {
    lastRes = { ...town.res };
    fn();
    handleEvents();
    for (let p = 0; p < players; p++) clamp(p);
    refresh();
  };

  // Show the first season's banner (and any opening event).
  handleEvents();
  refresh();

  return {
    update(dt) {
      if (el.msg.dataset.until && app.time > Number(el.msg.dataset.until)) { el.msg.classList.add('hidden'); delete el.msg.dataset.until; }
      if (banner > 0) {
        banner -= dt;
        if (app.input.any('a') && banner < 3) banner = 0;
        if (banner <= 0) { el.banner.classList.add('hidden'); lastRes = { ...town.res }; refresh(); }
        return;
      }
      if (town.finished) {
        if ((doneT += dt) > 0.3) app.go('results', { town });
        return;
      }
      for (let p = 0; p < players; p++) {
        const inp = players === 1 ? anyPlayer(app.input) : app.input.players[p];
        const cur = cursors[p];
        if (confirmEnd[p] > 0) confirmEnd[p] -= dt;
        if (town.done[p] && players === 2) continue;
        let moved = false;
        if (inp.pressed.left) { cur.i--; moved = true; }
        if (inp.pressed.right) { cur.i++; moved = true; }
        if (inp.pressed.up || inp.pressed.down) { cur.row = cur.row === 'plans' ? 'hand' : 'plans'; moved = true; }
        if (moved) {
          const n = cur.row === 'plans' ? town.plansFor(p).length : town.hands[p].length;
          if (n) cur.i = (cur.i + n) % n;
          clamp(p); detailFor = p; sfx.move(); refresh();
        }
        if (inp.pressed.a) {
          detailFor = p;
          if (cur.row === 'plans') act(() => town.build(p, town.plansFor(p)[cur.i].id));
          else act(() => town.play(p, cur.i));
          if (town.events.some((e) => e.type === 'cantPlay')) {
            const e = town.events.find((x) => x.type === 'cantPlay');
            say(e.noPlays ? t('why.noPlays') : Object.keys(e.needs ?? {}).length ? t('why.needs', { list: Object.keys(e.needs).map(cardName).join(', ') }) : t('why.missing', { list: Object.keys(e.missing ?? {}).map((r) => t(`res.${r}`)).join(', ') }), 2.5);
          }
        }
        if (inp.pressed.c && cur.row === 'hand' && town.hands[p].length) {
          detailFor = p;
          act(() => (players === 2 ? town.pass(p, cur.i) : town.discard(p, cur.i)));
        }
        if (inp.pressed.b) {
          // Ending with plays and a playable card left asks once more.
          const canStill = town.playsLeft[p] > 0 && (town.hands[p].some((_, i) => town.check(p, i).ok) || town.plansFor(p).some((x) => town.checkPlan(p, x.id).ok));
          if (canStill && confirmEnd[p] <= 0) { confirmEnd[p] = 2.5; say(t('msg.endAgain'), 2.5); }
          else { confirmEnd[p] = 0; act(() => town.endTurn(p)); }
        }
      }
    },
    draw(ctx) {
      ctx.fillStyle = '#1b1612'; ctx.fillRect(0, 0, W, H);
      // Lifted by 26px (only sky is lost) so the fields and vineyards show above the detail strip.
      drawTown(ctx, townView(town), app.time, -26);
    },
  };
}

// With one player, either stick and either set of buttons works.
function anyPlayer(input) {
  const [a, b] = input.players;
  const pressed = {};
  for (const k of Object.keys(a.pressed)) pressed[k] = a.pressed[k] || b.pressed[k];
  return { pressed };
}

// ---- results ------------------------------------------------------------------------

export function results(app, { town }) {
  const { parts, total } = town.score();
  const stars = town.stars();
  let t0 = 0;
  const row = (label, value, pts) => h('div', { class: 'res-row' }, h('span', {}, label), h('span', { class: 'res-detail' }, value), h('span', { class: 'res-pts' }, pts >= 0 ? `+${pts}` : String(pts)));
  app.ui.replaceChildren(h('div', { class: 'overlay results' }, h('div', { class: 'card' },
    h('h2', {}, t(town.won ? 'results.won' : 'results.timeUp')),
    h('p', { class: 'stars' }, [1, 2, 3].map((k) => h('span', { class: k <= stars ? 'on' : '' }, '★'))),
    row(t('results.goal'), town.goalProgress().map((g) => `${g.have}/${g.need}`).join(' · '), parts.goal),
    row(t('results.seasons'), String(town.season + (town.won ? 1 : 0)), parts.seasons),
    row(t('results.people'), String(town.pop), parts.people),
    row(`${t('res.wine')} · ${t('res.coin')}`, `${town.res.wine} · ${town.res.coin}`, parts.wine + parts.coin),
    town.hungerSeasons ? row(t('results.hunger'), String(town.hungerSeasons), parts.hunger) : null,
    h('div', { class: 'res-total' }, h('span', {}, t('results.total')), h('span', {}, String(total))),
    town.won ? h('p', { class: 'small' }, t('results.next')) : null,
    h('p', { class: 'hint' }, rich(t('ui.next'))))));
  return {
    update(dt) {
      t0 += dt;
      if (t0 < 1 || !(app.input.any('a') || app.input.any('start'))) return;
      sfx.ok();
      if (qualifies('walledtown', app.session.difficulty, total)) app.go('initials', { score: total });
      else app.go('fact');
    },
    draw(ctx) {
      drawTownFull(ctx, townView(town), app.time);
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
    },
  };
}

// ---- initials -----------------------------------------------------------------------

const ALPHABET = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';

export function initials(app, { score }) {
  const letters = [0, 0, 0];
  let slot = 0, saved = false, t0 = 0;
  const show = () => {
    app.ui.replaceChildren(h('div', { class: 'overlay results' }, saved ? scoreTable() : h('div', { class: 'card' },
      h('h2', {}, t('scores.new')), h('p', { class: 'big-score' }, String(score)),
      h('div', { class: 'initials' }, letters.map((l, i) => h('span', { class: i === slot ? 'sel' : '' }, ALPHABET[l]))),
      h('p', { class: 'hint' }, rich(t('scores.hint'))))));
  };
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
        else { addScore('walledtown', app.session.difficulty, letters.map((l) => ALPHABET[l]).join(''), score); saved = true; }
        show();
      }
    },
    draw(ctx) { drawScene(ctx, 'palace', app.time); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H); },
  };
}

// ---- fact card between games -----------------------------------------------------------

export function fact(app) {
  const f = app.data.facts[Math.floor(Math.random() * app.data.facts.length)];
  let t0 = 0;
  const card = factCard(f);
  card.append(h('p', { class: 'hint' }, rich(t('ui.next'))));
  app.ui.replaceChildren(h('div', { class: 'overlay fact' }, card));
  return {
    update(dt) {
      t0 += dt;
      if ((t0 > 1 && (app.input.any('a') || app.input.any('start'))) || t0 > 20) app.go('story', { panels: app.data.story.outro, next: 'attract' });
    },
    draw(ctx) { drawScene(ctx, f.scene, app.time); },
  };
}
