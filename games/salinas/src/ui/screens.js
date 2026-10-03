// Every screen is a function (app, arg) -> { update(dt), draw(ctx) } that
// builds its own DOM over the canvas and moves on with app.go(). Flow:
// attract -> menu -> story -> howto -> [day -> evening] x8 -> final ->
// [initials] -> fact -> attract.

import { h } from './dom.js';
import { t, getLang, setLang, nextLang, LANGS } from './i18n.js';
import { Season, Helper, UPGRADES } from '../core/salinas.js';
import { drawScene, finish, X, Y } from './art.js';
import { sfx } from './audio.js';
import { settings, topScores, qualifies, addScore } from './store.js';
import { langParam } from './arcade.js';
import { keysOn, keyName } from './keys.js';

const W = 960, H = 540, COURSE = 'verano';
const seed = (app) => (app.time * 1000 + Date.now()) | 0;
const fmt = (n) => String(Math.round(n));

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

function scoreTable() {
  const cols = ['easy', 'normal'].map((d) => {
    const list = topScores(COURSE, d);
    return h('div', { class: 'scores-col' }, h('h3', {}, t(`menu.difficulty.${d}`)),
      list.length ? h('ol', {}, list.map((s) => h('li', {}, h('span', {}, s.name), h('span', {}, String(s.score))))) : h('p', { class: 'small' }, t('scores.empty')));
  });
  return h('div', { class: 'parchment scores' }, h('h2', {}, t('scores.title')), h('div', { class: 'scores-row' }, cols));
}

// A season played by helpers, for the title screen and menus.
function demo(app, players = 2) {
  let s = new Season(app.data, { players, seed: seed(app) }), hs = s.workers.map((w) => new Helper(s, w.i));
  s.helpers = hs;
  return {
    get s() { return s; },
    update(dt) {
      if (s.phase === 'day') s.step(hs.map((x) => x.input()), dt);
      else if (s.phase === 'evening') { hs[0].shop(); s.nextDay(); }
      else { s = new Season(app.data, { players, seed: seed(app) }); hs = s.workers.map((w) => new Helper(s, w.i)); s.helpers = hs; }
    },
  };
}

// ---- attract ----------------------------------------------------------------------------------

export function attract(app) {
  setLang(langParam ?? settings.lang);
  const d = demo(app);
  const cards = ['title', 'fact', 'title', 'scores'];
  let card = 0, cardT = 0, factI = Math.floor(Math.random() * app.data.facts.length);
  const show = () => {
    let body;
    if (cards[card] === 'title') body = h('div', { class: 'title-card' }, h('h1', { class: 'logo' }, t('title.name')), h('p', { class: 'subtitle' }, t('title.subtitle')), h('p', { class: 'tag' }, t('title.players')));
    else if (cards[card] === 'fact') { factI = (factI + 1) % app.data.facts.length; body = h('div', { class: 'parchment fact-card' }, h('h3', {}, t('fact.title')), h('p', {}, t(app.data.facts[factI].text_key))); }
    else body = scoreTable();
    app.ui.replaceChildren(h('div', { class: 'overlay attract' }, body, h('p', { class: 'press' }, rich(t('title.press')))));
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
    draw(g) { drawScene(g, d.s, app.time); finish(g); g.fillStyle = 'rgba(20,12,6,0.3)'; g.fillRect(0, 0, W, H); },
  };
}

// ---- menu -------------------------------------------------------------------------------------

export function menu(app) {
  const d = demo(app);
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
    h('div', { class: 'rows' }, rows.map((r, i) => h('div', { class: `row row-${r} ${i === row ? 'sel' : ''}` }, r !== 'go' ? h('span', { class: 'label' }, t(`menu.${r}`)) : null, value(r)))),
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
    update(dt) {
      d.update(dt);
      const inp = app.input;
      if (inp.players[1].pressed.start && S.players !== 2) { S.players = 2; sfx.move(); show(); return; }
      if (inp.any('up')) { row = (row + rows.length - 1) % rows.length; sfx.move(); show(); }
      if (inp.any('down')) { row = (row + 1) % rows.length; sfx.move(); show(); }
      if (inp.any('left')) change(-1);
      if (inp.any('right')) change(1);
      if (inp.any('c')) { nextLang(1); sfx.move(); show(); }
      if (inp.any('start') || (inp.any('a') && rows[row] === 'go')) {
        sfx.ok();
        app.session = { ...S, season: new Season(app.data, { players: S.players, difficulty: S.difficulty, seed: seed(app) }) };
        app.go('story');
      } else if (inp.any('a')) change(1);
    },
    draw(g) { drawScene(g, d.s, app.time); finish(g); g.fillStyle = 'rgba(20,12,6,0.45)'; g.fillRect(0, 0, W, H); },
  };
}

// ---- story and how to play ---------------------------------------------------------------------------

export function story(app) {
  const panels = app.data.story.intro, s = app.session.season;
  let i = 0, t0 = 0;
  const show = () => app.ui.replaceChildren(h('div', { class: 'overlay story' }, h('div', { class: 'caption parchment' }, h('p', {}, t(panels[i].text)),
    h('div', { class: 'foot' }, h('div', { class: 'dots' }, panels.map((_, k) => h('span', { class: k === i ? 'on' : '' }))), h('p', { class: 'hint' }, rich(t('ui.next')), '    ', rich(t('ui.skip')))))));
  show();
  return {
    update(dt) {
      if (app.input.any('start')) { app.go('howto'); return; }
      if (app.input.any('a') || (t0 += dt) > 9) { sfx.move(); t0 = 0; if (++i >= panels.length) app.go('howto'); else show(); }
    },
    draw(g) { drawScene(g, s, app.time); finish(g); },
  };
}

export function howto(app) {
  const s = app.session.season;
  let t0 = 0;
  app.ui.replaceChildren(h('div', { class: 'overlay howto' }, h('div', { class: 'parchment brief-card' },
    h('h2', {}, t('howto.title')),
    h('ol', { class: 'howto-list' }, ['move', 'b', 'sun', 'a', 'flor', 'carry', 'extra', 'storm'].map((k) => h('li', {}, rich(t(`howto.${k}`))))),
    h('p', { class: 'hint' }, rich(`[A] ${t('menu.go')}`)))));
  return {
    update(dt) { t0 += dt; if ((t0 > 0.6 && (app.input.any('a') || app.input.any('start'))) || t0 > 30) { sfx.ok(); app.go('day'); } },
    draw(g) { drawScene(g, s, app.time); finish(g); g.fillStyle = 'rgba(20,12,6,0.35)'; g.fillRect(0, 0, W, H); },
  };
}

// ---- a working day ------------------------------------------------------------------------------------

export function day(app) {
  const S = app.session, s = S.season;
  if (new URLSearchParams(location.search).has('debug')) window.season = s; // developer peek
  const fx = [];
  const taught = new Set(), lessons = [];
  let cardUntil = 0, toastUntil = 0, endT = 0;
  const el = {
    top: h('div', { class: 'topbar' }), toast: h('div', { class: 'toast hidden' }), card: h('div', { class: 'gloss parchment empty' }, h('p', { class: 'kicker' }, t('gl.title'))),
    help: h('p', { class: 'play-help' }, rich(t('help.play'))), floats: h('div', { class: 'floats' }), streak: h('div', { class: 'streak' }),
  };
  app.ui.replaceChildren(h('div', { class: 'overlay play' }, el.top, el.streak, el.floats, el.toast, el.card, el.help));
  let topKey = '';
  const renderTop = () => {
    const key = `${s.day}|${Math.round(s.coins)}|${Math.round(s.store.kg)}|${s.workers.map((w) => Math.round(w.carry)).join()}|${s.streak}|${getLang()}`;
    if (key === topKey) return;
    topKey = key;
    el.top.replaceChildren(
      h('div', { class: 'tb-day' }, h('b', {}, t('hud.day', { n: s.day, total: s.days }))),
      h('div', { class: 'tb-stat' }, h('span', { class: 'coin' }), h('b', {}, fmt(s.coins)), h('small', {}, t('hud.coins'))),
      h('div', { class: 'tb-stat' }, h('span', { class: 'sack' }), h('b', {}, t('kg', { n: fmt(s.store.kg) })), h('small', {}, t('hud.store'))),
      ...s.workers.map((w) => h('div', { class: `tb-stat basket p${w.i}` }, h('b', {}, `${fmt(w.carry)}/${fmt(s.basket())}`), h('small', {}, t('hud.basket')))));
    el.streak.className = `streak ${s.streak >= 2 ? 'on' : ''} ${s.streak >= 5 ? 'hot' : ''}`;
    el.streak.replaceChildren(h('b', {}, `×${s.mult().toFixed(1).replace('.0', '')}`), h('small', {}, t('hud.streak', { n: s.streak })));
  };
  const toast = (text, secs = 2, bad = false) => { el.toast.replaceChildren(...rich(text)); el.toast.className = `toast ${bad ? 'bad' : ''}`; toastUntil = app.time + secs; };
  const teach = (id) => { if (!taught.has(id) && !S.taught?.has(id)) { taught.add(id); lessons.push(id); (S.taught ??= new Set()).add(id); } };
  const nextLesson = () => {
    if (cardUntil || !lessons.length) return;
    const id = lessons.shift();
    el.card.replaceChildren(h('p', { class: 'kicker' }, t('gl.title')), h('b', {}, t(`gl.${id}.name`)), h('p', { class: 'gl-text' }, t(`gl.${id}.text`)));
    el.card.className = 'gloss parchment fresh'; cardUntil = app.time + 9;
  };
  // A word floating up from where something happened.
  const float = (x, y, text, cls = '') => {
    const f = h('span', { class: `float ${cls}`, style: { left: `${x}px`, top: `${y}px` } }, text);
    el.floats.append(f); setTimeout(() => f.remove(), 1400);
  };
  let shake = 0;
  const coinBurst = (x, y, n) => { for (let k = 0; k < n; k++) fx.push({ kind: 'dot', x, y, vx: (Math.random() - 0.5) * 220, vy: -120 - Math.random() * 160, life: 0.9, max: 0.9, size: 4, colour: '#f2c75a' }); };
  const sparkle = (x, y, n = 10) => { for (let k = 0; k < n; k++) fx.push({ kind: 'star', x, y, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 60, life: 0.8, max: 0.8, size: 3 + Math.random() * 3, colour: '#ffffff' }); };
  teach('manantial'); teach('era');
  // The morning after shopping: each new thing announces itself where it is.
  if (S.bought?.size) {
    const where = (u) => {
      const w = s.workers[0];
      if (u === 'cesto' || u === 'rasero') return [X(w.x), Y(w.y) - 70];
      if (u === 'burro') return [X(s.donkey.x), Y(s.donkey.y) - 50];
      if (u === 'canal') return [X(15.2), Y(1.3) - 20];
      if (u === 'era') { const b = s.beds[s.levels.era - 1]; return [X(b.x + b.w / 2), Y(b.y) - 20]; }
      const b = s.beds.find((x) => x.open); return [X(b.x + b.w / 2), Y(b.y) - 24];
    };
    [...S.bought].forEach((u, k) => setTimeout(() => {
      const [x, y] = where(u);
      float(x, y, t('new.' + u), 'gold'); sparkle(x, y + 20, 26); sfx.flor();
    }, 400 + k * 700));
    S.bought.clear();
  }

  const handle = () => {
    for (const e of s.events) {
      const b = e.bed != null ? s.beds[e.bed] : null, bx = b ? X(b.x + b.w / 2) : 0, by = b ? Y(b.y) : 0;
      if (e.type === 'open') { sfx.splash(); teach('compuerta'); }
      else if (e.type === 'close') sfx.move();
      else if (e.type === 'overflow') { sfx.miss(); float(bx, by - 30, t('call.overflow'), 'bad'); }
      else if (e.type === 'ready') { sfx.ding(); float(bx, by - 30, t('call.ready')); teach('salmuera'); }
      else if (e.type === 'raked') {
        sfx.rake(); sparkle(bx, Y(b.y + b.h), e.flor ? 30 : e.white ? 14 : 4); teach('rasero');
        if (e.flor) { sfx.flor(); float(bx, by - 34, t('call.flor'), 'gold'); teach('flor'); shake = 0.25; }
        else float(bx, by - 30, e.white ? t('call.white') : t('call.grey'), e.white ? 'good' : 'bad');
        if (e.streak >= 2) { sfx.streak(e.streak); float(bx, by - 6, `×${e.mult.toFixed(1).replace('.0', '')}`, 'streakpop'); }
      } else if (e.type === 'streakLost') { sfx.miss(); toast(t('call.streakLost'), 1.6, true); }
      else if (e.type === 'cart') { sfx.bell(); toast(t('call.cart', { kg: e.want }), 3); teach('arriero'); }
      else if (e.type === 'cartLoad') { sfx.pick(); }
      else if (e.type === 'cartDone') { sfx.cash(); coinBurst(X(s.L.cart.x) + 10, Y(s.L.cart.y) - 60, 18); float(X(s.L.cart.x) + 10, Y(s.L.cart.y) - 110, `+${e.coins}`, 'gold'); }
      else if (e.type === 'cartGone') { sfx.miss(); toast(t('call.cartGone'), 2, true); }
      else if (e.type === 'goat') { sfx.bleat(); toast(t('call.goat'), 2.2); teach('cabra'); }
      else if (e.type === 'shoo') { sfx.shoo(); float(X(e.x), Y(e.y) - 40, t('call.shoo'), 'good'); }
      else if (e.type === 'trample') { sfx.bleat(); float(bx, by - 30, t('call.trample'), 'bad'); }
      else if (e.type === 'pickup') sfx.pick();
      else if (e.type === 'unload') { sfx.coin(); float(X(s.store.x), Y(s.store.y) - 60, `+${t('kg', { n: fmt(e.kg) })}`, 'good'); coinBurst(X(s.store.x), Y(s.store.y) - 30, 6); }
      else if (e.type === 'donkey') sfx.pick();
      else if (e.type === 'clouds') { sfx.thunder(0.3); toast(t('call.clouds'), 3); }
      else if (e.type === 'rain') { sfx.thunder(1); toast(t('call.rain'), 3, true); shake = 0.4; }
      else if (e.type === 'clear') toast(t('call.clear'), 2);
    }
    // A full sluice reminder, once per bed fill.
    for (const b of s.beds) if (b.sluice && b.water >= 1 && !b.told) { b.told = true; float(X(b.x + b.w / 2), Y(b.y) - 44, t('call.full')); } else if (!b.sluice) b.told = false;
    for (const w of s.workers) if (w.carry >= s.basket() && !w.toldFull) { w.toldFull = true; toast(t('call.full_basket'), 2); } else if (w.carry < s.basket()) w.toldFull = false;
  };

  const inputs = () => {
    const one = (p) => ({ x: (p.right ? 1 : 0) - (p.left ? 1 : 0), y: (p.down ? 1 : 0) - (p.up ? 1 : 0), a: p.pressed.a, aHeld: p.a, b: p.pressed.b });
    const [a, b] = app.input.players.map(one);
    if (s.players === 2) return [a, b];
    return [{ x: a.x || b.x, y: a.y || b.y, a: a.a || b.a, aHeld: a.aHeld || b.aHeld, b: a.b || b.b }];
  };

  renderTop();
  return {
    update(dt) {
      if (toastUntil && app.time > toastUntil) { el.toast.className = 'toast hidden'; toastUntil = 0; }
      if (cardUntil && app.time > cardUntil) { el.card.className = 'gloss parchment'; cardUntil = 0; }
      nextLesson();
      for (const p of fx) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; }
      for (let k = fx.length - 1; k >= 0; k--) if (fx[k].life <= 0) fx.splice(k, 1);
      if (s.phase !== 'day') { if ((endT += dt) > 0.6) app.go(s.phase === 'over' ? 'final' : 'evening'); return; }
      s.step(inputs(), dt);
      handle();
      renderTop();
    },
    draw(g) {
      g.save();
      if (shake > 0) { g.translate((Math.random() - 0.5) * shake * 12, (Math.random() - 0.5) * shake * 8); shake = Math.max(0, shake - 1 / 60); }
      drawScene(g, s, app.time, fx);
      g.restore();
      finish(g);
    },
  };
}

// ---- evening: the salt is sold, and upgrades for tomorrow ------------------------------------------------

export function evening(app) {
  const s = app.session.season, sold = s.stats.sold.at(-1), R = s.R;
  let sel = 0, t0 = 0, popped = null, gone = false; // gone: the day has started, so never redraw the shop
  // What each upgrade does at a level, so a card can say "now → next".
  const value = (u, lv) => ({
    era: lv,
    rasero: `×${(1 + lv * R.rake.perLevel).toFixed(1).replace('.0', '')}`,
    cesto: t('kg', { n: R.basket.base + lv * R.basket.perLevel }),
    canal: `×${(1 + lv * R.flow.perLevel).toFixed(1).replace('.0', '')}`,
    burro: lv ? t('kg', { n: R.donkey.carry * lv }) : '—',
    toldo: `${Math.round(Math.min(0.9, lv * R.storm.coverPerLevel) * 100)}%`,
  })[u];
  const levelOf = (u) => (u === 'era' ? s.levels.era : s.levels[u]);
  const show = () => !gone && app.ui.replaceChildren(h('div', { class: 'overlay evening' }, h('div', { class: 'parchment shop-card' },
    h('p', { class: 'kicker' }, t('hud.day', { n: s.day, total: s.days })),
    h('h2', {}, t('evening.title')),
    h('p', { class: 'sold' }, t('evening.sold', { kg: fmt(sold.kg), coins: fmt(sold.coins) })),
    h('p', { class: 'purse' }, h('span', { class: 'coin' }), h('b', {}, fmt(s.coins)), ` ${t('hud.coins')}`),
    h('h3', {}, t('evening.shop')),
    h('div', { class: 'shop' }, UPGRADES.map((u, i) => {
      const c = s.cost(u), level = levelOf(u);
      const top = u === 'era' ? s.beds.length : (R.costs[u].length ?? 0);
      return h('div', { class: `item ${i === sel ? 'sel' : ''} ${c == null ? 'max' : c > s.coins ? 'dear' : ''} ${popped === u ? 'pop' : ''}` },
        h('div', { class: `icon up-${u}` }), h('b', {}, t(`up.${u}.name`)), h('p', {}, t(`up.${u}.text`)),
        // Now → next, in plain numbers.
        h('p', { class: 'gain' }, c == null ? h('span', {}, value(u, level)) : [h('span', { class: 'now' }, value(u, level)), ' → ', h('b', {}, value(u, level + 1))]),
        h('span', { class: 'lvl' }, u === 'era' ? `${level}/${top}` : Array.from({ length: top }, (_, k) => h('i', { class: k < level ? `on ${popped === u && k === level - 1 ? 'new' : ''}` : '' }))),
        h('span', { class: 'price' }, c == null ? t('evening.max') : h('span', {}, h('span', { class: 'coin' }), fmt(c))));
    })),
    h('p', { class: 'hint' }, rich(t('evening.hint')), '    ', rich(t('evening.next', { n: s.day + 1 }))))));
  show();
  sfx.coin();
  return {
    update(dt) {
      t0 += dt;
      const inp = app.input;
      if (inp.any('left')) { sel = (sel + UPGRADES.length - 1) % UPGRADES.length; sfx.move(); show(); }
      if (inp.any('right')) { sel = (sel + 1) % UPGRADES.length; sfx.move(); show(); }
      if (inp.any('up')) { sel = (sel + 3) % UPGRADES.length; sfx.move(); show(); }
      if (inp.any('down')) { sel = (sel + 3) % UPGRADES.length; sfx.move(); show(); }
      if (t0 > 0.5 && inp.any('a')) {
        const u = UPGRADES[sel];
        if (s.buy(u)) {
          sfx.buy(); sfx.flor();
          popped = u; show();
          (app.session.bought ??= new Set()).add(u);
          setTimeout(() => { if (popped === u) { popped = null; show(); } }, 900);
        } else sfx.miss();
      }
      if (t0 > 0.5 && inp.any('start')) { sfx.ok(); gone = true; s.nextDay(); app.go('day'); }
    },
    draw(g) { drawScene(g, s, app.time); g.fillStyle = 'rgba(40,20,40,0.45)'; g.fillRect(0, 0, W, H); finish(g); },
  };
}

// ---- the end of the summer ------------------------------------------------------------------------------

export function final(app) {
  const S = app.session, s = S.season, st = s.stats, score = s.score();
  let t0 = 0;
  const row = (label, value) => h('div', { class: 'res-row' }, h('span', {}, label), h('b', {}, value));
  app.ui.replaceChildren(h('div', { class: 'overlay results' }, h('div', { class: 'parchment res-card' },
    h('h2', {}, t('final.title')),
    row(t('final.kg'), t('kg', { n: fmt(st.kg) })),
    row(t('final.white'), t('kg', { n: fmt(st.white) })),
    row(t('final.flor'), t('kg', { n: fmt(st.flor) })),
    row(t('final.orders'), String(st.orders)),
    row(t('final.best'), `${st.best}`),
    row(t('final.washed'), t('kg', { n: fmt(st.washed) })),
    row(t('final.coins'), fmt(st.coins)),
    h('div', { class: 'res-total' }, h('span', {}, t('final.score')), h('b', {}, String(score))),
    h('p', { class: 'hint' }, rich(t('ui.next'))))));
  sfx.win();
  return {
    update(dt) {
      t0 += dt;
      if (t0 < 1 || !(app.input.any('a') || app.input.any('start'))) return;
      sfx.ok();
      if (qualifies(COURSE, S.difficulty, score)) app.go('initials', { score }); else app.go('fact');
    },
    draw(g) { drawScene(g, s, app.time); g.fillStyle = 'rgba(40,20,40,0.45)'; g.fillRect(0, 0, W, H); finish(g); },
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
      if (inp.any('a') || inp.any('start')) { sfx.ok(); if (slot < 2) slot++; else { addScore(COURSE, app.session.difficulty, letters.map((l) => ALPHABET[l]).join(''), score); saved = true; } show(); }
    },
    draw(g) { drawScene(g, app.session.season, app.time); g.fillStyle = 'rgba(40,20,40,0.5)'; g.fillRect(0, 0, W, H); finish(g); },
  };
}

export function fact(app) {
  const f = app.data.facts[Math.floor(Math.random() * app.data.facts.length)];
  let t0 = 0;
  app.ui.replaceChildren(h('div', { class: 'overlay fact' }, h('div', { class: 'parchment fact-card' }, h('h3', {}, t('fact.title')), h('p', {}, t(f.text_key)), h('p', { class: 'hint' }, rich(t('ui.next'))))));
  const d = demo(app);
  return {
    update(dt) { d.update(dt); t0 += dt; if ((t0 > 1 && (app.input.any('a') || app.input.any('start'))) || t0 > 20) app.go('attract'); },
    draw(g) { drawScene(g, d.s, app.time); finish(g); g.fillStyle = 'rgba(20,12,6,0.4)'; g.fillRect(0, 0, W, H); },
  };
}
