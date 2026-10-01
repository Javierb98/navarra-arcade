// Every screen is a function (app, arg) -> { update(dt), draw(ctx) } that
// builds its own DOM over the canvas and moves on with app.go(). Flow:
// attract -> menu -> story -> howto -> mine (with the workshop and the cave
// inside) -> final -> [initials] -> fact -> attract. One player, no clock:
// the game ends at the cave, and the best times are kept.

import { h } from './dom.js';
import { t, getLang, setLang, nextLang, LANGS } from './i18n.js';
import { Mine, Helper, UPGRADES, SURFACE } from '../core/minas.js';
import { drawView, camTarget, finish, TS } from './art.js';
import { sfx } from './audio.js';
import { settings, topScores, qualifies, addScore } from './store.js';
import { langParam } from './arcade.js';
import { keysOn, keyName } from './keys.js';

const W = 960, H = 540, COURSE = 'cueva';
const seed = (app) => (app.time * 1000 + Date.now()) | 0;
const fmt = (n) => String(Math.round(n));
const clock = (s) => { const v = Math.max(0, Math.ceil(s)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };
const labels = () => ({ pozo: t('build.pozo'), taller: t('build.taller'), lampisteria: t('build.lampisteria'), bascula: t('build.bascula') });

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
      list.length ? h('ol', {}, list.map((s) => h('li', {}, h('span', {}, s.name), h('span', {}, clock(s.score))))) : h('p', { class: 'small' }, t('scores.empty')));
  });
  return h('div', { class: 'parchment scores' }, h('h2', {}, t('scores.title')), h('div', { class: 'scores-row' }, cols));
}

// One view, the whole stage, following the miner.
const viewsFor = () => [{ x: 0, w: W, p: 0 }];

// Cameras glide after their miner.
function cameras(m) {
  const views = viewsFor(m);
  const cams = views.map((v) => ({ ...camTarget(m, m.miners[v.p], v.w) }));
  return {
    views, cams,
    follow(dt) { views.forEach((v, i) => { const want = camTarget(m, m.miners[v.p], v.w), k = Math.min(1, dt * 6); cams[i].x += (want.x - cams[i].x) * k; cams[i].y += (want.y - cams[i].y) * k; }); },
    draw(g, time, fx) {
      views.forEach((v, i) => drawView(g, m, cams[i], v, time, fx, labels()));
    },
  };
}

// A miner played by the helper, for the title screen and menus.
function demo(app) {
  const make = () => { const m = new Mine(app.data, { seed: seed(app) }); return { m, hs: m.miners.map((p) => new Helper(m, p.i)), cam: null }; };
  let d = make();
  d.cam = cameras(d.m);
  return {
    update(dt) {
      if (d.m.stats.cave || d.m.t > 100) { d = make(); d.cam = cameras(d.m); }
      d.m.step(d.hs.map((x) => x.input()), dt);
      d.cam.follow(dt);
    },
    draw(g, time) { d.cam.draw(g, time); finish(g); },
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
    draw(g) { d.draw(g, app.time); g.fillStyle = 'rgba(20,12,6,0.3)'; g.fillRect(0, 0, W, H); },
  };
}

// ---- menu -------------------------------------------------------------------------------------

export function menu(app) {
  const d = demo(app);
  const S = { difficulty: settings.difficulty };
  const rows = ['difficulty', 'lang', 'go'];
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
    if (r === 'difficulty') S.difficulty = S.difficulty === 'easy' ? 'normal' : 'easy';
    else if (r === 'lang') nextLang(dir);
    else return;
    sfx.move(); show();
  };
  return {
    update(dt) {
      d.update(dt);
      const inp = app.input;
      if (inp.any('up')) { row = (row + rows.length - 1) % rows.length; sfx.move(); show(); }
      if (inp.any('down')) { row = (row + 1) % rows.length; sfx.move(); show(); }
      if (inp.any('left')) change(-1);
      if (inp.any('right')) change(1);
      if (inp.any('c')) { nextLang(1); sfx.move(); show(); }
      if (inp.any('start') || (inp.any('a') && rows[row] === 'go')) {
        sfx.ok();
        app.session = { ...S, mine: new Mine(app.data, { difficulty: S.difficulty, seed: seed(app) }) };
        app.go('story');
      } else if (inp.any('a')) change(1);
    },
    draw(g) { d.draw(g, app.time); g.fillStyle = 'rgba(20,12,6,0.45)'; g.fillRect(0, 0, W, H); },
  };
}

// ---- story and how to play ---------------------------------------------------------------------------

export function story(app) {
  const panels = app.data.story.intro, cam = cameras(app.session.mine);
  let i = 0, t0 = 0;
  const show = () => app.ui.replaceChildren(h('div', { class: 'overlay story' }, h('div', { class: 'caption parchment' }, h('p', {}, t(panels[i].text)),
    h('div', { class: 'foot' }, h('div', { class: 'dots' }, panels.map((_, k) => h('span', { class: k === i ? 'on' : '' }))), h('p', { class: 'hint' }, rich(t('ui.next')), '    ', rich(t('ui.skip')))))));
  show();
  return {
    update(dt) {
      if (app.input.any('start')) { app.go('howto'); return; }
      if (app.input.any('a') || (t0 += dt) > 9) { sfx.move(); t0 = 0; if (++i >= panels.length) app.go('howto'); else show(); }
    },
    draw(g) { cam.draw(g, app.time); finish(g); },
  };
}

export function howto(app) {
  const cam = cameras(app.session.mine);
  let t0 = 0;
  app.ui.replaceChildren(h('div', { class: 'overlay howto' }, h('div', { class: 'parchment brief-card' },
    h('h2', {}, t('howto.title')),
    h('ol', { class: 'howto-list' }, ['walk', 'dig', 'ladders', 'light', 'sell', 'shop', 'danger'].map((k) => h('li', {}, rich(t(`howto.${k}`))))),
    h('p', { class: 'hint' }, rich(`[A] ${t('menu.go')}`)))));
  return {
    update(dt) { t0 += dt; if ((t0 > 0.6 && (app.input.any('a') || app.input.any('start'))) || t0 > 30) { sfx.ok(); app.go('mine'); } },
    draw(g) { cam.draw(g, app.time); finish(g); g.fillStyle = 'rgba(20,12,6,0.35)'; g.fillRect(0, 0, W, H); },
  };
}

// ---- the mine -------------------------------------------------------------------------------------------

const ORE_COLOUR = { sal: '#f6eee8', potasa: '#e98a52', hierro: '#9c4a2a', magnesita: '#efe6cf', cobre: '#d9803a', plata: '#dfe4ea', galena: '#9aa0a8', malaquita: '#2fa070', moneda: '#cfd4da', lucerna: '#b5683a', hacha: '#c8963a' };

export function mine(app) {
  const S = app.session, m = S.mine;
  if (new URLSearchParams(location.search).has('debug')) window.mine = m; // developer peek
  const cam = cameras(m), fx = [];
  const taught = new Set(), lessons = [];
  let cardUntil = 0, toastUntil = 0, endT = 0, shake = 0, shop = null, digTick = 0;
  const el = {
    top: h('div', { class: 'topbar' }), toast: h('div', { class: 'toast hidden' }), card: h('div', { class: 'gloss parchment hidden' }),
    help: h('p', { class: 'play-help' }, rich(t('help.play'))), floats: h('div', { class: 'floats' }), pods: h('div', { class: 'pods' }),
    prompt: h('div', { class: 'prompts' }), shop: h('div', { class: 'shop-layer' }), fact: h('div', { class: 'fact-pop parchment hidden' }),
  };
  app.ui.replaceChildren(h('div', { class: 'overlay play one' }, el.top, el.pods, el.prompt, el.floats, el.toast, el.card, el.fact, el.help, el.shop));

  // Where a world point is on screen, in the view that follows player `i`.
  const screenAt = (wx, wy, i = 0) => {
    const v = cam.views[Math.min(i, cam.views.length - 1)], c = cam.cams[Math.min(i, cam.cams.length - 1)];
    return [v.x + (wx - c.x) * TS, (wy - c.y) * TS];
  };

  let topKey = '';
  const renderTop = () => {
    const key = `${Math.floor(m.t)}|${Math.round(m.money)}|${m.stats.deepest}|${getLang()}|${m.miners.map((p) => `${Math.round(p.light)},${Math.round(p.hp)},${p.cargo.length},${Math.floor(p.y)},${p.atShop},${p.ladders}`).join(';')}`;
    if (key === topKey) return;
    topKey = key;
    el.top.replaceChildren(
      h('div', { class: 'tb-stat time' }, h('small', {}, t('hud.time')), h('b', {}, clock(m.t))),
      h('div', { class: 'tb-stat' }, h('span', { class: 'coin' }), h('b', {}, fmt(m.money)), h('small', {}, t('hud.money'))),
      h('div', { class: 'tb-stat' }, h('small', {}, t('hud.depth')), h('b', {}, t('hud.m', { n: m.stats.deepest }))));
    el.pods.replaceChildren(...m.miners.map((p) => {
      const light = p.light / m.stat('lamp'), hp = p.hp / m.R.miner.hp, depth = Math.max(0, Math.floor(p.y) - SURFACE);
      const bar = (cls, k, label) => h('div', { class: `gauge ${cls} ${k < 0.25 ? 'low' : ''}` }, h('small', {}, label), h('span', { class: 'track' }, h('span', { class: 'fill', style: { width: `${Math.max(0, Math.min(1, k)) * 100}%` } })));
      return h('div', { class: `pod-panel p${p.i}` },
        h('div', { class: 'pp-depth' }, h('b', {}, t('hud.m', { n: depth })), h('span', { class: `ladders ${p.ladders < 5 ? 'low' : ''}` }, h('i', { class: 'ladder-icon' }), String(p.ladders))),
        bar('light', light, t('hud.light')), bar('hull', hp, t('hud.health')),
        h('div', { class: 'cargo' }, h('small', {}, t('hud.bag')),
          h('span', { class: 'slots' }, Array.from({ length: m.stat('bag') }, (_, k) => h('i', { style: p.cargo[k] ? { background: ORE_COLOUR[p.cargo[k]] } : {} })))));
    }));
    el.prompt.replaceChildren(...m.miners.filter((p) => p.atShop === 'taller' && p.grounded).map((p) => {
      const [x, y] = screenAt(p.x, p.y - 1.4, p.i);
      return h('div', { class: 'prompt', style: { left: `${x}px`, top: `${y}px` } }, rich(t('call.workshop'), p.i));
    }));
  };

  const toast = (text, secs = 2, bad = false) => { el.toast.replaceChildren(...rich(text)); el.toast.className = `toast ${bad ? 'bad' : ''}`; toastUntil = app.time + secs; };
  const teach = (id) => { if (!taught.has(id) && !S.taught?.has(id)) { taught.add(id); lessons.push(id); (S.taught ??= new Set()).add(id); } };
  const nextLesson = () => {
    if (cardUntil || !lessons.length) return;
    const id = lessons.shift();
    el.card.replaceChildren(h('p', { class: 'kicker' }, t('gl.title')), h('b', {}, t(`gl.${id}.name`)), h('p', {}, t(`gl.${id}.text`)));
    el.card.className = 'gloss parchment'; cardUntil = app.time + 7;
  };
  const float = (wx, wy, i, text, cls = '') => {
    const [x, y] = screenAt(wx, wy, i);
    const f = h('span', { class: `float ${cls}`, style: { left: `${x}px`, top: `${y}px` } }, text);
    el.floats.append(f); setTimeout(() => f.remove(), 1400);
  };
  const burst = (x, y, n, colour, speed = 3, size = 3) => { for (let k = 0; k < n; k++) fx.push({ x, y, vx: (Math.random() - 0.5) * speed, vy: -Math.random() * speed, life: 0.7, max: 0.7, size: size * (0.6 + Math.random() * 0.8), colour }); };
  teach('potasas');

  const handle = () => {
    for (const e of m.events) {
      const p = m.miners[e.p ?? 0];
      if (e.type === 'broke') burst(e.x + 0.5, e.y + 0.5, 10, '#8a6a45', 4, 3);
      else if (e.type === 'ore') {
        sfx.ore(); burst(e.x + 0.5, e.y + 0.5, 12, ORE_COLOUR[e.ore], 3, 2.5);
        float(e.x + 0.5, e.y - 0.9, e.p, t(`ore.${e.ore}`), e.find ? 'gold' : 'good');
        if (e.first && app.data.glossary.terms.includes(e.ore)) teach(e.ore);
      } else if (e.type === 'air') { sfx.gas(); shake = 0.3; float(e.x + 0.5, e.y, e.p, t('call.air'), 'bad'); teach('air'); for (let k = 0; k < 16; k++) fx.push({ x: e.x + 0.5, y: e.y + 0.5, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5, life: 1, max: 1, size: 6, colour: 'rgba(170,220,140,0.6)', grow: true }); }
      else if (e.type === 'hurt' && e.why === 'fall') { sfx.crash(); shake = Math.min(0.5, 0.1 + e.dmg / 40); float(p.x, p.y - 0.8, e.p, t('call.fall'), 'bad'); }
      else if (e.type === 'creak') { sfx.creak(); teach('loose'); }
      else if (e.type === 'rockfall') { sfx.crash(); burst(e.x + 0.5, e.y + 1, 14, '#8a7a6a', 4, 3); if (e.hit != null) { shake = 0.4; const q = m.miners[e.hit]; float(q.x, q.y - 0.8, e.hit, t('call.rock'), 'bad'); } }
      else if (e.type === 'bagFull') toast(t('call.bagFull'), 2.2);
      else if (e.type === 'tooHard') toast(t('call.tooHard'), 2.6, true);
      else if (e.type === 'noLadders') { sfx.warn(); toast(t('call.noLadders'), 2.5, true); }
      else if (e.type === 'sold') { nextFact(); sfx.cash(); burst(p.x, p.y - 0.5, 18, '#f2c75a', 5, 3); float(p.x, p.y - 1.2, e.p, t('call.sold', { money: e.money }), 'gold'); }
      else if (e.type === 'lit') { if (!p.toldLit) { p.toldLit = true; sfx.ding(); } }
      else if (e.type === 'noMoney') toast(t('call.noMoney'), 2.5, true);
      else if (e.type === 'rescue') { sfx.rescue(); shake = 0.3; toast(t('call.rescue', { cost: m.R.prices.rescue }), 3.4, true); teach('companeros'); }
      else if (e.type === 'layer') { sfx.layer(); teach(e.card); }
      else if (e.type === 'cave') { sfx.layer(); cave = { i: 0, t0: 0 }; showCave(); }
      else if (e.type === 'workshop') openShop(e.p);
      else if (e.type === 'bought') { sfx.buy(); if (e.u === 'ladders') teach('escalera'); if (e.u === 'shaft') teach(e.level === 1 ? 'torno' : 'jaula'); }
    }
    for (const p of m.miners) {
      // Warnings, once per trip down.
      if (p.y < SURFACE) { p.warnLight = p.warnHp = false; if (p.light < m.stat('lamp') - 1) p.toldLit = false; continue; }
      if (!p.warnLight && p.light < m.stat('lamp') * 0.25) { p.warnLight = true; sfx.warn(); toast(t('call.lowLight'), 2.5, true); }
      if (!p.warnHp && p.hp < m.R.miner.hp * 0.3) { p.warnHp = true; sfx.warn(); toast(t('call.lowHealth'), 2.5, true); }
    }
    // Depth records, every ten metres.
    const rec = Math.floor(m.stats.deepest / 10) * 10;
    if (rec >= 10 && rec > (S.recordShown ?? 0)) { S.recordShown = rec; const p = m.miners.reduce((a, b) => (b.y > a.y ? b : a)); float(p.x + 1.6, p.y - 0.4, p.i, t('call.record', { n: rec }), 'gold'); }
  };

  // ---- a new fact from history every time ore is sold at the weighbridge ----
  const facts = [...app.data.facts].sort(() => Math.random() - 0.5);
  let factI = 0;
  const nextFact = () => {
    if (!facts.length) return;
    const f = facts[factI++ % facts.length];
    el.fact.replaceChildren(h('p', { class: 'kicker' }, t('fact.title')), h('p', {}, t(f.text_key)));
    el.fact.className = 'fact-pop parchment'; factUntil = app.time + 9;
  };
  let factUntil = 0;

  // ---- the cave of the Hombres Verdes: the game pauses for their story ----
  let cave = null;
  const showCave = () => {
    if (!cave) { el.shop.replaceChildren(); return; }
    const panels = app.data.story.cave;
    el.shop.replaceChildren(h('div', { class: 'overlay cave-wrap' }, h('div', { class: 'parchment cave-card' },
      h('p', { class: 'kicker' }, t('call.cave')),
      h('p', { class: 'cave-text' }, t(panels[cave.i].text)),
      h('div', { class: 'foot' }, h('div', { class: 'dots' }, panels.map((_, k) => h('span', { class: k === cave.i ? 'on' : '' }))), h('p', { class: 'hint' }, rich(t('ui.next')))))));
  };
  const updateCave = (dt) => {
    cave.t0 += dt;
    if (cave.t0 > 0.8 && (app.input.any('a') || app.input.any('start'))) {
      sfx.move(); cave.t0 = 0;
      if (++cave.i >= app.data.story.cave.length) { cave = null; m.over = true; sfx.win(); }
      showCave();
    }
  };

  // ---- the workshop: the game pauses while someone shops ----
  // Each branch of tools is a row: what you have, then every step to come,
  // with its era and what it opens up, so you can see where it leads.
  const items = UPGRADES;
  const benefitText = (u, level) => {
    const b = m.benefit(u, level);
    if (u === 'pick') return b.opens.length ? t('ben.opens', { what: b.opens.map((c) => t(`gl.${c}.name`)).join(', ') }) : t('ben.faster');
    if (u === 'lamp') return t('ben.lamp', { n: Math.round(b.value) });
    if (u === 'bag') return t('ben.bag', { n: Math.round(b.value) });
    if (u === 'gear') return t('ben.gear', { n: Math.round(b.value * 100) });
    if (u === 'ladders') return t('ben.ladders', { n: Math.round(b.value) });
    return level ? t('ben.shaft', { n: b.speed }) : t('ben.noShaft');
  };
  const openShop = (pi) => { shop = { p: m.miners[pi], sel: 0, t0: 0 }; sfx.ok(); showShop(); };
  const showShop = () => {
    if (!shop) { el.shop.replaceChildren(); return; }
    const u = items[shop.sel], lvl = m.levels[u], c = m.cost(u);
    const branch = (b, i) => {
      const own = m.levels[b], top = m.R.upgrades[b].cost.length;
      return h('div', { class: `branch ${i === shop.sel ? 'sel' : ''}` },
        h('div', { class: 'branch-name' }, h('div', { class: `icon up-${b}` }), h('b', {}, t(`up.${b}.kind`))),
        h('div', { class: 'track' }, Array.from({ length: top + 1 }, (_, n) => {
          const state = n <= own ? 'owned' : n === own + 1 ? 'next' : 'later';
          const era = m.R.eras?.[b]?.[n];
          const price = n > 0 ? m.R.upgrades[b].cost[n - 1] : null;
          return [n ? h('span', { class: `arrow ${state}` }, '→') : null,
            h('div', { class: `node ${state} ${state === 'next' && price > m.money ? 'dear' : ''}` },
              h('span', { class: 'node-name' }, t(`up.${b}.${n}.name`)),
              era ? h('span', { class: 'era' }, t(`era.${era}`)) : null,
              state === 'owned' ? h('span', { class: 'tick' }, n === own ? t('shop.have') : '✓') : h('span', { class: 'node-price' }, h('span', { class: 'coin' }), fmt(price)))];
        }).flat()));
    };
    el.shop.replaceChildren(h('div', { class: 'overlay shop-wrap' }, h('div', { class: 'parchment shop-card tree' },
      h('div', { class: 'shop-head' }, h('h2', {}, t('shop.title')), h('p', { class: 'purse' }, h('span', { class: 'coin' }), h('b', {}, fmt(m.money)))),
      h('div', { class: 'branches' }, items.map(branch)),
      h('div', { class: 'detail' }, c == null
        ? h('p', {}, h('b', {}, t(`up.${u}.${lvl}.name`)), ' · ', t('shop.max'))
        : h('p', {}, h('b', {}, t(`up.${u}.${lvl + 1}.name`)), ': ', t(`up.${u}.${lvl + 1}.text`), h('span', { class: 'gain' }, ` ${benefitText(u, lvl + 1)}`))),
      h('p', { class: 'hint' }, rich(t('shop.hint'))))));
  };
  const updateShop = (dt) => {
    const inp = app.input, n = items.length;
    shop.t0 += dt;
    if (inp.any('up')) { shop.sel = (shop.sel + n - 1) % n; sfx.move(); showShop(); }
    if (inp.any('down')) { shop.sel = (shop.sel + 1) % n; sfx.move(); showShop(); }
    if (shop.t0 > 0.3 && inp.any('a')) {
      if (!m.buy(items[shop.sel])) sfx.miss();
      else { const e = m.events.at(-1); sfx.buy(); if (e?.u === 'ladders') teach('escalera'); if (e?.u === 'shaft') teach(e.level === 1 ? 'torno' : 'jaula'); }
      showShop(); m.events = [];
    }
    if (shop.t0 > 0.3 && (inp.any('b') || inp.any('start'))) { sfx.move(); shop = null; showShop(); }
  };

  const inputs = () => {
    const one = (p) => ({ x: (p.right ? 1 : 0) - (p.left ? 1 : 0), y: (p.down ? 1 : 0) - (p.up ? 1 : 0), a: p.pressed.a, b: p.pressed.b });
    const [a, b] = app.input.players.map(one);
    // One miner; either set of controls drives it.
    return [{ x: a.x || b.x, y: a.y || b.y, a: a.a || b.a, b: a.b || b.b }];
  };

  renderTop();
  return {
    update(dt) {
      if (toastUntil && app.time > toastUntil) { el.toast.className = 'toast hidden'; toastUntil = 0; }
      if (cardUntil && app.time > cardUntil) { el.card.className = 'gloss parchment hidden'; cardUntil = 0; }
      if (factUntil && (app.time > factUntil || m.miners[0].y > SURFACE + 2)) { el.fact.className = 'fact-pop parchment hidden'; factUntil = 0; }
      nextLesson();
      for (const q of fx) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 6 * dt; }
      for (let k = fx.length - 1; k >= 0; k--) if (fx[k].life <= 0) fx.splice(k, 1);
      if (cave) { updateCave(dt); return; }
      if (shop) { updateShop(dt); return; }
      if (m.over) { if ((endT += dt) > 1) app.go('final'); return; }
      m.step(inputs(), dt);
      // Digging: grit flying off the rock face, and the sound of the tool.
      for (const p of m.miners) if (p.dig) {
        const d = p.dig;
        if (Math.random() < 0.6) fx.push({ x: d.x + 0.5 - (d.dx || 0) * 0.45, y: d.y + (d.dx ? 0.5 : 0.05), vx: (Math.random() - 0.5) * 3 - (d.dx || 0) * 1.5, vy: -Math.random() * 2.5, life: 0.5, max: 0.5, size: 2 + Math.random() * 2, colour: 'rgba(120,96,70,0.9)' });
        if ((digTick += dt) > (m.levels.pick === 3 ? 0.08 : 0.32 - m.levels.pick * 0.05)) { digTick = 0; sfx.dig(m.levels.pick); }
      }
      handle();
      cam.follow(dt);
      renderTop();
    },
    draw(g) {
      g.save();
      if (shake > 0) { g.translate((Math.random() - 0.5) * shake * 14, (Math.random() - 0.5) * shake * 10); shake = Math.max(0, shake - 1 / 60); }
      cam.draw(g, app.time, fx);
      g.restore();
      finish(g);
      if (shop || cave) { g.fillStyle = 'rgba(30,18,10,0.45)'; g.fillRect(0, 0, W, H); }
    },
  };
}

// ---- the cave reached: the end ----------------------------------------------------------------------------

export function final(app) {
  const S = app.session, m = S.mine, st = m.stats, score = m.score(), cam = cameras(m);
  let t0 = 0;
  const row = (label, value) => h('div', { class: 'res-row' }, h('span', {}, label), h('b', {}, value));
  const ores = Object.entries(st.ores).map(([o, n]) => `${t(`ore.${o}`)} ×${n}`).join(' · ') || '—';
  app.ui.replaceChildren(h('div', { class: 'overlay results' }, h('div', { class: 'parchment res-card' },
    h('h2', {}, t('final.title')),
    h('p', { class: 'res-sub' }, t('final.sub')),
    row(t('final.earned'), fmt(st.earned)),
    row(t('final.finds'), String(st.finds)),
    row(t('final.ores'), ores),
    row(t('final.rescues'), String(st.rescues)),
    h('div', { class: 'res-total' }, h('span', {}, t('final.time')), h('b', {}, clock(score))),
    h('p', { class: 'hint' }, rich(t('ui.next'))))));
  return {
    update(dt) {
      t0 += dt;
      if (t0 < 1 || !(app.input.any('a') || app.input.any('start'))) return;
      sfx.ok();
      if (qualifies(COURSE, S.difficulty, score)) app.go('initials', { score }); else app.go('fact');
    },
    draw(g) { cam.draw(g, app.time); g.fillStyle = 'rgba(20,40,30,0.5)'; g.fillRect(0, 0, W, H); finish(g); },
  };
}

const ALPHABET = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';

export function initials(app, { score }) {
  const letters = [0, 0, 0], cam = cameras(app.session.mine);
  let slot = 0, saved = false, t0 = 0;
  const show = () => app.ui.replaceChildren(h('div', { class: 'overlay results' }, saved ? scoreTable() : h('div', { class: 'parchment res-card' },
    h('h2', {}, t('scores.new')), h('p', { class: 'big-score' }, clock(score)),
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
    draw(g) { cam.draw(g, app.time); g.fillStyle = 'rgba(30,18,10,0.55)'; g.fillRect(0, 0, W, H); finish(g); },
  };
}

export function fact(app) {
  const f = app.data.facts[Math.floor(Math.random() * app.data.facts.length)];
  let t0 = 0;
  app.ui.replaceChildren(h('div', { class: 'overlay fact' }, h('div', { class: 'parchment fact-card' }, h('h3', {}, t('fact.title')), h('p', {}, t(f.text_key)), h('p', { class: 'hint' }, rich(t('ui.next'))))));
  const d = demo(app);
  return {
    update(dt) { d.update(dt); t0 += dt; if ((t0 > 1 && (app.input.any('a') || app.input.any('start'))) || t0 > 20) app.go('attract'); },
    draw(g) { d.draw(g, app.time); g.fillStyle = 'rgba(20,12,6,0.4)'; g.fillRect(0, 0, W, H); },
  };
}
