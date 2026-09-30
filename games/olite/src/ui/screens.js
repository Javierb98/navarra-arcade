// Every screen is a function (app, arg) -> { update(dt), draw(ctx) } that
// builds its own DOM over the canvas and moves on with app.go(). Flow:
// attract -> menu -> story(intro) -> level -> play -> clear -> level ... ->
// story(outro) -> results -> [initials] -> fact -> attract.

import { h } from './dom.js';
import { t, getLang, setLang, nextLang, LANGS } from './i18n.js';
import { Climb } from '../core/climb.js';
import { drawLevel, drawScene, drawFx, finish } from './art.js';
import { sfx } from './audio.js';
import { settings, topScores, qualifies, addScore } from './store.js';
import { langParam } from './arcade.js';

const W = 960, H = 540;
const COURSE = 'olite';

// "[A] jump" -> button glyph + text, so non-readers can match the button.
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

const seed = (app) => (app.time * 1000 + Date.now()) | 0;
const levelCount = (app) => app.data.levels.levels.length;
const levelDef = (app, n) => app.data.levels.levels[n];

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

// ---- attract ---------------------------------------------------------------------------

export function attract(app) {
  setLang(langParam ?? settings.lang);
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
      if ((cardT += dt) > (cards[card] === 'title' ? 9 : 10)) { card = (card + 1) % cards.length; cardT = 0; show(); }
      const [p1, p2] = app.input.players;
      if (p1.pressed.start || p1.pressed.a || p2.pressed.start || p2.pressed.a) app.go('menu');
    },
    draw(ctx) { drawScene(ctx, 'palace', app.time); },
  };
}

// ---- menu ------------------------------------------------------------------------------

export function menu(app) {
  const S = { players: 2, difficulty: settings.difficulty };
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
    h('p', { class: 'note' }, S.players === 2 ? t('menu.duo.note') : t('menu.solo.note')),
    h('p', { class: 'note small' }, t(`menu.${S.difficulty}.note`)),
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
  const start = () => {
    sfx.ok();
    const dev = Number(new URLSearchParams(location.search).get('level')); // developer: start at a given climb
    app.session = { ...S, level: dev > 0 ? Math.min(dev, levelCount(app)) - 1 : 0, carry: null, stones: 0, stonesTotal: 0, climbs: 0 };
    app.go('story', { panels: app.data.story.intro, next: 'level' });
  };
  return {
    update() {
      const inp = app.input;
      if (inp.any('up')) { row = (row + rows.length - 1) % rows.length; sfx.move(); show(); }
      if (inp.any('down')) { row = (row + 1) % rows.length; sfx.move(); show(); }
      if (inp.any('left')) change(-1);
      if (inp.any('right')) change(1);
      if (inp.any('c')) { nextLang(1); sfx.move(); show(); }
      if (inp.any('start') || (inp.any('a') && rows[row] === 'go')) start();
      else if (inp.any('a')) change(1);
    },
    draw(ctx) { drawScene(ctx, 'palace', app.time); ctx.fillStyle = 'rgba(20,12,6,0.35)'; ctx.fillRect(0, 0, W, H); },
  };
}

// ---- story ------------------------------------------------------------------------------

export function story(app, { panels, next, arg }) {
  let i = 0, t0 = 0;
  const show = () => app.ui.replaceChildren(h('div', { class: 'overlay story' },
    h('div', { class: 'caption parchment' }, h('p', {}, t(panels[i].text)),
      h('div', { class: 'foot' },
        h('div', { class: 'dots' }, panels.map((_, k) => h('span', { class: k === i ? 'on' : '' }))),
        h('p', { class: 'hint' }, rich(t('ui.next')), '    ', rich(t('ui.skip')))))));
  show();
  const advance = () => { if (++i >= panels.length) app.go(next, arg); else { t0 = 0; show(); } };
  return {
    update(dt) {
      if (app.input.any('start')) { app.go(next, arg); return; }
      if (app.input.any('a')) { sfx.move(); advance(); return; }
      if ((t0 += dt) > 9) advance();
    },
    draw(ctx) { drawScene(ctx, panels[i].scene, app.time); },
  };
}

// ---- before each climb --------------------------------------------------------------------

export function level(app) {
  const S = app.session, n = S.level, def = levelDef(app, n);
  const g = new Climb({ rules: app.data.rules, levels: app.data.levels }, { level: n, players: S.players, difficulty: S.difficulty, seed: seed(app), carry: S.carry });
  let t0 = 0;
  app.ui.replaceChildren(h('div', { class: 'overlay level-intro' }, h('div', { class: 'parchment brief-card' },
    h('p', { class: 'kicker' }, t('hud.level', { n: n + 1, total: levelCount(app) })),
    h('h2', {}, t(`level.${def.id}.name`)),
    h('p', { class: 'where' }, t(`level.${def.id}.where`)),
    h('p', { class: 'tip' }, rich(t(`level.${def.id}.tip`))),
    h('p', { class: 'small' }, rich(t(S.players === 2 ? 'help.duo' : 'help.solo'))),
    h('p', { class: 'hint' }, rich(`[A] ${t('menu.go')}`)))));
  return {
    update(dt) {
      t0 += dt;
      if ((t0 > 0.6 && (app.input.any('a') || app.input.any('start'))) || t0 > 25) { sfx.ok(); app.go('play', { g }); }
    },
    draw(ctx) { drawLevel(ctx, g, app.time); ctx.fillStyle = 'rgba(20,12,6,0.3)'; ctx.fillRect(0, 0, W, H); finish(ctx); },
  };
}

// ---- play ----------------------------------------------------------------------------------

export function play(app, { g }) {
  const S = app.session, P = g.players;
  if (new URLSearchParams(location.search).has('debug')) window.climb = g; // developer peek
  const anim = g.climbers.map(() => ({ walk: 0 }));
  const fx = [];
  let endT = 0, toastUntil = 0, stuckT = 0, lastBest = g.best, hangT = 0;
  const shown = new Set();

  const el = {
    left: h('div', { class: 'hud-left' }), right: h('div', { class: 'hud-right' }),
    toast: h('div', { class: 'toast hidden' }), help: h('p', { class: 'play-help' }, rich(t(P === 2 ? 'help.duo' : 'help.solo'))),
  };
  app.ui.replaceChildren(h('div', { class: 'overlay play' }, el.left, el.right, el.toast, el.help));
  let hudKey = '';
  const renderHud = () => {
    const key = `${g.hearts}|${g.score}|${g.stats.gold}|${getLang()}`;
    if (key === hudKey) return;
    hudKey = key;
    el.left.replaceChildren(
      h('b', {}, t(`level.${g.def.id}.name`)),
      h('span', { class: 'stones' }, Array.from({ length: g.stats.goldTotal }, (_, k) => h('i', { class: k < g.stats.gold ? 'got' : '' }))));
    el.right.replaceChildren(
      h('span', { class: 'hearts' }, Array.from({ length: g.hearts }, () => h('i'))),
      h('span', { class: 'score' }, String(g.score)));
  };
  const toast = (text, secs = 2.4, bad = false) => {
    el.toast.replaceChildren(...rich(text));
    el.toast.className = `toast ${bad ? 'bad' : ''}`;
    toastUntil = app.time + secs;
  };
  const once = (key, text, secs) => { if (shown.has(key)) return; shown.add(key); toast(text, secs); };

  const burst = (x, y, n, kind, colour, speed = 160, life = 0.7) => {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.6);
      fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.4, life, max: life, kind, colour, size: 2 + Math.random() * 4, grav: kind === 'feather' ? 60 : 700 });
    }
  };
  const floatText = (x, y, text, colour = '#fff4c8') => fx.push({ x, y, vx: 0, vy: -40, life: 1, max: 1, kind: 'text', text, colour, grav: 0 });

  const handle = () => {
    for (const e of g.events) {
      if (e.type === 'jump') sfx.jump();
      else if (e.type === 'break') { sfx.break(); burst(e.x, e.y, 14, 'chip', '#e2cfa8', 200); }
      else if (e.type === 'bonk') sfx.bonk();
      else if (e.type === 'swing') sfx.swing();
      else if (e.type === 'pickup') {
        if (e.kind === 'g') { sfx.gold(); burst(e.x, e.y, 16, 'spark', '#ffe38a', 150); floatText(e.x, e.y - 20, `+${app.data.rules.score.gold}`); toast(t('msg.gold'), 1.4); }
        else if (e.kind === 'o') { sfx.orange(); burst(e.x, e.y, 8, 'spark', '#f7a13c', 100); floatText(e.x, e.y - 16, `+${app.data.rules.score.orange}`); }
        else { sfx.heart(); burst(e.x, e.y, 10, 'spark', '#ff7a7a', 100); }
      } else if (e.type === 'shoo') { sfx.shoo(); burst(e.x, e.y, 8, 'feather', '#f7f3ea', 120, 1.2); floatText(e.x, e.y - 20, `+${app.data.rules.score.shoo}`); once('shoo', t('msg.shoo'), 1.2); }
      else if (e.type === 'stork') sfx.stork();
      else if (e.type === 'hurt') { sfx.hurt(); burst(e.x, e.y - 30, 6, 'spark', '#ffe07a', 90); }
      else if (e.type === 'fall') { sfx.fall(); toast(t('msg.fall'), 2, true); }
      else if (e.type === 'mantle') sfx.mantle();
      else if (e.type === 'crumble') { sfx.crumble(); burst(e.c * g.T + 24, e.r * g.T + 8, 10, 'chip', '#b8966a', 80); }
      else if (e.type === 'wobble') sfx.wobble();
      else if (e.type === 'shatter') burst(e.x, e.y, 8, 'chip', '#d5763f', 140);
      else if (e.type === 'gust') { sfx.gust(); toast(t('msg.gust'), 1.6); }
      else if (e.type === 'waitPartner') toast(t('msg.wait'), 2.4);
      else if (e.type === 'won') { sfx.won(); for (let k = 0; k < 5; k++) burst(g.flag.x + 30, g.flag.y - 80, 12, 'spark', ['#ffe38a', '#e8b840', '#ff9a6a'][k % 3], 260, 1.4); }
      else if (e.type === 'lost') sfx.lost();
    }
  };

  // Hints when a pair seems stuck, or someone is left dangling.
  const coach = (dt) => {
    if (g.best < lastBest - 1) { lastBest = g.best; stuckT = 0; } else stuckT += dt;
    if (stuckT > 9) { stuckT = -12; toast(t(P === 2 ? 'msg.boost' : 'help.solo'), 4); }
    if (P === 2) {
      const hanging = g.climbers.find((b) => b.hanging);
      hangT = hanging ? hangT + dt : 0;
      if (hangT > 0.8) { once('haul', t('msg.haul'), 3.5); if (hangT > 5) once('hang', t('msg.hang'), 3); }
    }
  };

  const inputs = () => {
    const [a, b] = app.input.players;
    const one = (p) => ({ left: p.left, right: p.right, up: p.up, down: p.down, jump: p.a, jumpPressed: p.pressed.a, hitPressed: p.pressed.b, tug: p.c });
    if (P === 2) return [one(a), one(b)];
    const x = one(a), y = one(b);
    return [Object.fromEntries(Object.keys(x).map((k) => [k, x[k] || y[k]]))];
  };

  renderHud();
  return {
    update(dt) {
      if (toastUntil && app.time > toastUntil) { el.toast.className = 'toast hidden'; toastUntil = 0; }
      for (const p of fx) { p.life -= dt; p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      for (let k = fx.length - 1; k >= 0; k--) if (fx[k].life <= 0) fx.splice(k, 1);
      if (g.finished) {
        if ((endT += dt) > 2.2) {
          S.carry = g.carry();
          if (g.won) { S.stones += g.stats.gold; S.stonesTotal += g.stats.goldTotal; S.climbs++; app.go('clear', { g }); }
          else { S.stonesTotal += g.stats.goldTotal; S.stones += g.stats.gold; app.go('results', { won: false }); }
        }
        return;
      }
      g.step(inputs(), dt);
      g.climbers.forEach((b, i) => { if (b.grounded) anim[i].walk += Math.abs(b.dx) * 0.16; });
      if (g.reeling && Math.floor(app.time * 10) !== Math.floor((app.time - dt) * 10)) sfx.reel();
      handle();
      coach(dt);
      renderHud();
    },
    draw(ctx) {
      drawLevel(ctx, g, app.time, { anim });
      drawFx(ctx, fx, g.camY);
      finish(ctx);
    },
  };
}

// ---- a climb done ---------------------------------------------------------------------------

export function clear(app, { g }) {
  const S = app.session, n = S.level, last = n + 1 >= levelCount(app);
  const facts = app.data.facts.filter((f) => f.level === g.def.id);
  const fact = facts[0] ?? app.data.facts[(n * 3) % app.data.facts.length];
  const stars = g.stars();
  const mins = Math.floor(g.t / 60), secs = String(Math.floor(g.t % 60)).padStart(2, '0');
  const row = (label, value) => h('div', { class: 'res-row' }, h('span', {}, label), h('span', { class: 'res-val' }, value));
  let t0 = 0;
  app.ui.replaceChildren(h('div', { class: 'overlay results' }, h('div', { class: 'parchment res-card clear-card' },
    h('p', { class: 'kicker' }, t(`level.${g.def.id}.name`)),
    h('h2', {}, t('clear.title')),
    h('p', { class: 'stars' }, [1, 2, 3].map((k) => h('span', { class: k <= stars ? 'on' : '' }, '★'))),
    row(t('clear.stones'), `${g.stats.gold} / ${g.stats.goldTotal}`),
    row(t('clear.time'), `${mins}:${secs}`),
    row(t('clear.bonus'), `+${g.timeBonus ?? 0}`),
    h('div', { class: 'res-total' }, h('span', {}, t('hud.score')), h('b', {}, String(g.score))),
    h('div', { class: 'fact-inline' }, h('h3', {}, t('fact.title')), h('p', {}, t(fact.text_key))),
    h('p', { class: 'small' }, last ? t('clear.last') : t('clear.next', { name: t(`level.${levelDef(app, n + 1).id}.name`) })),
    h('p', { class: 'hint' }, rich(t('ui.next'))))));
  return {
    update(dt) {
      t0 += dt;
      if (t0 < 1.2 || !(app.input.any('a') || app.input.any('start'))) return;
      sfx.ok();
      if (last) app.go('story', { panels: app.data.story.outro, next: 'results', arg: { won: true } });
      else { S.level++; app.go('level'); }
    },
    draw(ctx) { drawLevel(ctx, g, app.time); ctx.fillStyle = 'rgba(20,12,6,0.4)'; ctx.fillRect(0, 0, W, H); finish(ctx); },
  };
}

// ---- the end --------------------------------------------------------------------------------

export function results(app, { won }) {
  const S = app.session, R = app.data.rules.score;
  const hearts = S.carry?.hearts ?? 0;
  const heartBonus = won ? hearts * R.heartLeft : 0;
  const total = (S.carry?.score ?? 0) + heartBonus;
  S.total = total;
  let t0 = 0;
  const row = (label, value, pts) => h('div', { class: 'res-row' }, h('span', {}, label), h('span', { class: 'res-val' }, value), pts != null ? h('span', { class: 'res-pts' }, `+${pts}`) : h('span', { class: 'res-pts' }));
  app.ui.replaceChildren(h('div', { class: 'overlay results' }, h('div', { class: 'parchment res-card' },
    h('h2', {}, won ? t('results.won') : t('results.lost')),
    row(t('results.climbs'), `${S.climbs} / ${levelCount(app)}`),
    row(t('results.stones'), `${S.stones} / ${S.stonesTotal}`),
    won ? row(t('results.hearts'), String(hearts), heartBonus) : null,
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
    draw(ctx) { drawScene(ctx, won ? 'palace' : 'ruins', app.time); ctx.fillStyle = 'rgba(20,12,6,0.35)'; ctx.fillRect(0, 0, W, H); },
  };
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
    draw(ctx) { drawScene(ctx, 'palace', app.time); ctx.fillStyle = 'rgba(20,12,6,0.45)'; ctx.fillRect(0, 0, W, H); },
  };
}

export function fact(app) {
  const f = app.data.facts[Math.floor(Math.random() * app.data.facts.length)];
  let t0 = 0;
  const card = factCard(f);
  card.append(h('p', { class: 'hint' }, rich(t('ui.next'))));
  app.ui.replaceChildren(h('div', { class: 'overlay fact' }, card));
  return {
    update(dt) {
      t0 += dt;
      if ((t0 > 1 && (app.input.any('a') || app.input.any('start'))) || t0 > 20) app.go('attract');
    },
    draw(ctx) { drawScene(ctx, 'palace', app.time); ctx.fillStyle = 'rgba(20,12,6,0.4)'; ctx.fillRect(0, 0, W, H); },
  };
}

