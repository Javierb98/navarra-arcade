// Every screen is a function (app, arg) -> { update(dt), draw(ctx) } that
// builds its own DOM over the canvas and moves on with app.go(). Flow:
// attract -> menu -> story -> howto -> mine (with the workshop, the museum,
// the cave and the escape inside) -> final (the museum opening) ->
// [initials] -> scores -> fact -> attract. One player, no clock: a career
// ends with the escape from the cave (or when the player chooses, once the
// cave has been reached), and the best scores are kept.

import { h } from './dom.js';
import { t, getLang, setLang, nextLang, LANGS } from './i18n.js';
import { Mine, Helper, UPGRADES, ITEMS, SURFACE } from '../core/minas.js';
import { drawView, camTarget, finish, TS, drawFiesta, fiestaPieceAt, fiestaCrownAt } from './art.js';
import { findIcon, itemIcon } from './things.js';
import { sfx } from './audio.js';
import { settings, topScores, qualifies, addScore } from './store.js';
import { langParam } from './arcade.js';
import { keysOn, keyName } from './keys.js';

const W = 960, H = 540, COURSE = 'carrera';
const seed = (app) => (app.time * 1000 + Date.now()) | 0;
const fmt = (n) => String(Math.round(n));
const labels = (rules) => ({
  museo: t('build.museo'), pozo: t('build.pozo'), taller: t('build.taller'), lampisteria: t('build.lampisteria'), bascula: t('build.bascula'), mark: t('esc.mark'),
  eras: Object.fromEntries((rules?.layers ?? []).map((l) => [l.card, (n) => t('era.layer', { n, name: t(`gl.${l.card}.name`) })])),
});

// "[A] workshop" -> button glyph + text (on the cabinet, and the phone's
// on-screen buttons look the same); at a computer, the key instead.
export function rich(text, p = 0) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(/\[(A|B|C|START)\]/g)) {
    const b = m[1].toLowerCase();
    parts.push(text.slice(last, m.index), keysOn() ? h('kbd', {}, keyName(p, b)) : h('span', { class: `btn btn-${b}` }, m[1]));
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

function scoreTable() {
  const cols = ['easy', 'normal'].map((d) => {
    const list = topScores(COURSE, d);
    return h('div', { class: 'scores-col' }, h('h3', {}, t(`menu.difficulty.${d}`)),
      list.length ? h('ol', {}, list.map((s) => h('li', {}, h('span', {}, s.name), h('span', {}, fmt(s.score))))) : h('p', { class: 'small' }, t('scores.empty')));
  });
  return h('div', { class: 'parchment scores' }, h('h2', {}, t('scores.title')), h('div', { class: 'scores-row' }, cols));
}

// One view, the whole stage, following the miner.
const viewsFor = () => [{ x: 0, w: W, p: 0 }];

// Cameras glide after their miner.
// In the escape the camera looks a little lower, to keep the water in view.
function aim(m, p, w) {
  const c = camTarget(m, p, w);
  if (m.escape && !m.escape.done && p.y > SURFACE) c.y = Math.min(m.H - H / TS, c.y + Math.min(1.5, Math.max(0, m.escape.y - p.y - 3) * 0.3));
  return c;
}
function cameras(m) {
  const views = viewsFor(m);
  const cams = views.map((v) => ({ ...aim(m, m.miners[v.p], v.w) }));
  return {
    views, cams,
    follow(dt) { views.forEach((v, i) => { const want = aim(m, m.miners[v.p], v.w), k = Math.min(1, dt * 6); cams[i].x += (want.x - cams[i].x) * k; cams[i].y += (want.y - cams[i].y) * k; }); },
    draw(g, time, fx) {
      const L = labels(m.R);
      views.forEach((v, i) => drawView(g, m, cams[i], v, time, fx, L));
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
      if (d.m.stats.cave || d.m.t > 150) { d = make(); d.cam = cameras(d.m); }
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
    h('ol', { class: 'howto-list' }, ['walk', 'dig', 'ladders', 'light', 'museum', 'shop', 'belt', 'danger'].map((k) => h('li', {}, rich(t(`howto.${k}`))))),
    h('p', { class: 'hint' }, rich(`[A] ${t('menu.go')}`)))));
  return {
    update(dt) { t0 += dt; if ((t0 > 0.6 && (app.input.any('a') || app.input.any('start'))) || t0 > 60) { sfx.ok(); app.go('mine'); } },
    draw(g) { cam.draw(g, app.time); finish(g); g.fillStyle = 'rgba(20,12,6,0.35)'; g.fillRect(0, 0, W, H); },
  };
}

// ---- the mine -------------------------------------------------------------------------------------------

const ORE_COLOUR = {
  sal: '#f6eee8', potasa: '#e98a52', hierro: '#9c4a2a', magnesita: '#efe6cf', cobre: '#d9803a', plata: '#dfe4ea', galena: '#9aa0a8', malaquita: '#2fa070',
  silvinita: '#e9764a', dolomita: '#f2ece2', veta: '#eef2f6', oro: '#f0c030', azurita: '#2f6ad0',
};
const ROCK_COLOUR = { potasas: '#a8765f', hierro: '#7c6052', cobre: '#707468', romanos: '#968060', bronce: '#525c5c' };

export function mine(app) {
  const S = app.session, m = S.mine, R = m.R;
  if (new URLSearchParams(location.search).has('debug')) window.mine = m; // developer peek
  const cam = cameras(m), fx = [];
  const taught = new Set(), lessons = [];
  let cardUntil = 0, toastUntil = 0, endT = 0, shake = 0, flash = 0, shop = null, museum = null, moment = null, choice = null, digTick = 0;
  let shown = m.money, tickT = 0;
  const el = {
    top: h('div', { class: 'topbar' }), toast: h('div', { class: 'toast hidden' }), card: h('div', { class: 'gloss parchment hidden' }),
    help: h('p', { class: 'play-help' }, rich(t('help.play'))), floats: h('div', { class: 'floats' }), pods: h('div', { class: 'pods' }),
    prompt: h('div', { class: 'prompts' }), shop: h('div', { class: 'shop-layer' }), fact: h('div', { class: 'fact-pop parchment hidden' }),
    esc: h('div', { class: 'escape hidden' }),
  };
  app.ui.replaceChildren(h('div', { class: 'overlay play one' }, el.top, el.esc, el.pods, el.prompt, el.floats, el.toast, el.card, el.fact, el.help, el.shop));

  // Where a world point is on screen.
  const screenAt = (wx, wy) => [(wx - cam.cams[0].x) * TS, (wy - cam.cams[0].y) * TS];

  // ---- the HUD ----
  let topKey = '';
  const renderTop = () => {
    const p = m.miners[0];
    const key = `${Math.round(shown)}|${m.museum.length}|${m.stats.deepest}|${getLang()}|${Math.round(p.light)},${Math.round(p.hp)},${p.cargo.join()},${p.finds.join()},${Math.floor(p.y)},${p.atShop},${p.ladders},${p.sel},${Object.values(p.belt).join()},${m.stats.cave},${Math.ceil(p.breath)},${p.under},${!!m.escape},${p.crown}`;
    if (key === topKey) return;
    topKey = key;
    el.top.replaceChildren(
      h('div', { class: 'tb-stat' }, h('span', { class: 'coin' }), h('b', { class: shown < m.money - 0.5 ? 'counting' : '' }, fmt(shown)), h('small', {}, t('hud.money'))),
      h('div', { class: 'tb-stat' }, h('small', {}, t('hud.museum')), h('b', {}, `${m.museum.length}/${R.finds.list.length}`)),
      h('div', { class: 'tb-stat' }, h('small', {}, t('hud.depth')), h('b', {}, t('hud.m', { n: m.stats.deepest }))),
      h('div', { class: 'tb-stat' }, h('small', {}, t('hud.score')), h('b', {}, fmt(m.score()))));
    const light = p.light / m.stat('lamp'), hp = p.hp / R.miner.hp, depth = Math.max(0, Math.floor(p.y) - SURFACE), cap = m.stat('bag');
    const full = p.cargo.length >= cap;
    const bar = (cls, k, label) => h('div', { class: `gauge ${cls} ${k < 0.25 ? 'low' : ''}` }, h('small', {}, label), h('span', { class: 'track' }, h('span', { class: 'fill', style: { width: `${Math.max(0, Math.min(1, k)) * 100}%` } })));
    const sel = ITEMS[p.sel], have = p.belt[sel], maxBreath = R.water.breath;
    // Breath: bubbles that go one by one while your head is under water.
    const breath = p.under || p.breath < maxBreath - 0.01
      ? h('div', { class: `breath ${p.breath <= 0 ? 'out' : p.breath < 2 ? 'low' : ''}` }, h('small', {}, t('hud.breath')),
        h('span', { class: 'bubbles' }, Array.from({ length: maxBreath }, (_, k) => h('i', { class: k < Math.ceil(p.breath) ? 'full' : '' }))))
      : null;
    el.pods.replaceChildren(h('div', { class: 'pod-panel p0' },
      h('div', { class: 'pp-depth' }, h('b', {}, t('hud.m', { n: depth })), h('span', { class: `ladders ${p.ladders < 5 ? 'low' : ''}` }, h('i', { class: 'ladder-icon' }), String(p.ladders))),
      bar('light', light, t('hud.light')), bar('hull', hp, t('hud.health')), breath,
      h('div', { class: `cargo ${full ? 'full' : ''}` }, h('small', {}, full ? t('hud.full') : t('hud.bag')),
        h('span', { class: 'slots' }, Array.from({ length: cap }, (_, k) => h('i', { class: p.cargo[k] && R.ores[p.cargo[k]].jackpot ? 'jack' : '', style: p.cargo[k] ? { background: ORE_COLOUR[p.cargo[k]] } : {} })))),
      h('div', { class: 'belt' },
        h('span', { class: `belt-item ${have ? '' : 'none'}` }, h('img', { src: itemIcon(sel, 30), alt: '' }), h('b', {}, `×${have}`)),
        h('span', { class: 'belt-text' }, h('span', { class: 'belt-name' }, t(`item.${sel}.name`)), h('span', { class: 'belt-keys' }, rich('[A]'), ' ', rich('[C]'))),
        h('span', { class: 'belt-rest' }, ITEMS.filter((id) => id !== sel).map((id) => h('span', { class: `mini ${p.belt[id] ? '' : 'none'}` }, h('img', { src: itemIcon(id, 18), alt: '' }), String(p.belt[id]))))),
      p.finds.length || p.crown ? h('div', { class: 'carried' }, h('small', {}, t('hud.finds')), [...p.finds, ...(p.crown ? ['collar'] : [])].map((id) => h('img', { src: findIcon(id, 26), alt: t(`find.${id}.name`) }))) : null));
    const prompts = [];
    if (p.grounded && p.atShop === 'taller') prompts.push(t('call.workshop'));
    if (p.grounded && p.atShop === 'museo') prompts.push(t('call.museum'));
    if (!m.escape && m.tile(Math.floor(p.x), Math.floor(p.y)).crown) prompts.push(t('call.crown'));
    el.prompt.replaceChildren(...prompts.map((text) => {
      const [x, y] = screenAt(p.x, p.y - 1.4);
      return h('div', { class: 'prompt', style: { left: `${x}px`, top: `${y}px` } }, rich(text));
    }));
  };

  // The escape: a big shout, and how far below you the water is.
  let escKey = '';
  const renderEscape = () => {
    const E = m.escape, p = m.miners[0];
    if (!E || E.done) { if (escKey) { el.esc.className = 'escape hidden'; escKey = ''; } return; }
    const gap = E.y - (p.y + R.miner.size / 2), rising = E.t > R.escape.grace;
    const key = `${rising}|${Math.round(gap)}|${getLang()}`;
    if (key === escKey) return;
    escKey = key;
    const k = Math.max(0, Math.min(1, gap / 12));
    el.esc.className = `escape ${!rising ? 'rumble' : gap < 3 ? 'close' : ''}`;
    el.esc.replaceChildren(h('b', {}, t(rising ? 'esc.go' : 'esc.rumble')),
      rising ? h('div', { class: 'gap' }, h('span', { class: 'gap-text' }, gap > 0 ? t('esc.gap', { n: Math.max(0, Math.round(gap)) }) : t('esc.gapUnder')),
        h('span', { class: 'gap-track' }, h('span', { class: 'gap-fill', style: { width: `${k * 100}%` } }))) : null);
  };

  const toast = (text, secs = 2, bad = false) => { el.toast.replaceChildren(...rich(text)); el.toast.className = `toast ${bad ? 'bad' : ''}`; toastUntil = app.time + secs; };
  const teach = (id) => { if (!taught.has(id) && !S.taught?.has(id)) { taught.add(id); lessons.push(id); (S.taught ??= new Set()).add(id); } };
  const nextLesson = () => {
    if (cardUntil || !lessons.length) return;
    const id = lessons.shift();
    el.card.replaceChildren(h('p', { class: 'kicker' }, t('gl.title')), h('b', {}, t(`gl.${id}.name`)), h('p', {}, t(`gl.${id}.text`)));
    el.card.className = 'gloss parchment'; cardUntil = app.time + 7;
  };
  const float = (wx, wy, text, cls = '') => {
    const [x, y] = screenAt(wx, wy);
    const f = h('span', { class: `float ${cls}`, style: { left: `${x}px`, top: `${y}px` } }, text);
    el.floats.append(f); setTimeout(() => f.remove(), 1400);
  };
  const burst = (x, y, n, colour, speed = 3, size = 3, life = 0.7) => { for (let k = 0; k < n; k++) fx.push({ x, y, vx: (Math.random() - 0.5) * speed, vy: -Math.random() * speed, life, max: life, size: size * (0.6 + Math.random() * 0.8), colour }); };
  teach('potasas');
  const wasDeep = { v: false };

  const handle = () => {
    const p = m.miners[0];
    for (const e of m.events) {
      if (e.type === 'broke') { burst(e.x + 0.5, e.y + 0.5, 12, ROCK_COLOUR[e.rock] ?? '#8a6a45', 4, 3); shake = Math.max(shake, 0.08); sfx.crack(); }
      else if (e.type === 'ore') {
        if (e.jackpot) { sfx.jackpot(); burst(e.x + 0.5, e.y + 0.5, 30, ORE_COLOUR[e.ore], 6, 3.5, 1.1); shake = 0.25; float(e.x + 0.5, e.y - 0.9, `+${e.value}`, 'jack'); toast(t('call.jackpot', { name: t(`ore.${e.ore}`) }), 2.6); }
        else { sfx.ore(); burst(e.x + 0.5, e.y + 0.5, 12, ORE_COLOUR[e.ore], 3, 2.5); float(e.x + 0.5, e.y - 0.9, `+${e.value} ${t(`ore.${e.ore}`)}`, 'good'); }
        if (e.first && app.data.glossary.terms.includes(e.ore)) teach(e.ore);
        if (e.full) { sfx.warn(); toast(t('call.bagFull'), 2.6, true); }
      } else if (e.type === 'bagFull') toast(t('call.bagFull'), 2.2, true);
      else if (e.type === 'hiss') { sfx.hiss(); toast(t('call.hiss'), 2.6, true); teach('air'); }
      else if (e.type === 'drip') { sfx.drip(); toast(t('call.drip'), 2.4, true); }
      else if (e.type === 'creak') { sfx.creak(); toast(t('call.creak'), 2.2, true); teach('loose'); }
      else if (e.type === 'fall') sfx.rumble();
      else if (e.type === 'air') { sfx.gas(); shake = 0.3; toast(t('call.air'), 2.6, true); teach('air'); }
      else if (e.type === 'cough') { sfx.cough(); float(p.x, p.y - 0.8, '…', 'bad'); }
      else if (e.type === 'flood') { sfx.splash(); shake = 0.2; toast(t('call.flood'), 2.4, true); teach('agua'); burst(e.x + 0.5, e.y + 0.5, 20, 'rgba(150,200,240,0.9)', 4, 3); }
      else if (e.type === 'glint') { sfx.glint(); float(e.x + 0.5, e.y - 0.3, t('call.glint'), 'gold'); }
      else if (e.type === 'find') { openMoment(e.id); burst(e.x + 0.5, e.y + 0.4, 40, '#ffd65a', 6, 3, 1.2); }
      else if (e.type === 'delivered' && e.id !== 'crown') { sfx.museum(); burst(p.x, p.y - 0.6, 24, '#ffd65a', 5, 3); float(p.x, p.y - 1.4, t('call.delivered', { fee: e.fee }), 'gold'); teach('museo'); }
      else if (e.type === 'delivered' && e.id === 'crown') {}
      else if (e.type === 'hurt' && e.why === 'fall') { sfx.crash(); shake = Math.min(0.5, 0.1 + e.dmg / 40); float(p.x, p.y - 0.8, t('call.fall'), 'bad'); }
      else if (e.type === 'rockfall') { sfx.crash(); burst(e.x + 0.5, e.y + 1, 14, '#8a7a6a', 4, 3); if (e.hit != null) { shake = 0.4; float(p.x, p.y - 0.8, t('call.rock'), 'bad'); } }
      else if (e.type === 'tooHard') toast(t('call.tooHard'), 2.6, true);
      else if (e.type === 'noLadders') { sfx.warn(); toast(t('call.noLadders'), 2.5, true); }
      else if (e.type === 'sold') { if (!e.station) nextFact(); sfx.cash(); burst(p.x, p.y - 0.5, 18, '#f2c75a', 5, 3); float(p.x, p.y - 1.2, t('call.sold', { money: e.money }), 'gold'); }
      else if (e.type === 'station') { sfx.bell(); toast(t('call.station'), 2.6); teach('jaula'); }
      else if (e.type === 'lit') { if (!p.toldLit) { p.toldLit = true; sfx.ding(); } }
      else if (e.type === 'noMoney') toast(t('call.noMoney'), 2.5, true);
      else if (e.type === 'rescue') { sfx.rescue(); shake = 0.3; toast(t('call.rescue', { cost: R.prices.rescue }) + (e.returned ? ` · ${t('call.returned')}` : ''), 4, true); teach('companeros'); }
      else if (e.type === 'layer') { sfx.layer(); teach(e.card); }
      else if (e.type === 'cave') { sfx.layer(); cave = { i: 0, t0: 0 }; showCave(); }
      else if (e.type === 'crown') { sfx.find(); sfx.quake(); shake = 0.8; flash = 0.25; burst(e.x, e.y - 0.4, 50, '#9effc4', 6, 3, 1.3); toast(t('esc.rumble'), 2.4, true); }
      else if (e.type === 'quake') { sfx.quake(); shake = Math.max(shake, 0.45); for (let k = 0; k < 6; k++) { const x = p.x + (Math.random() - 0.5) * 12; fx.push({ x, y: p.y - 3 - Math.random() * 3, vx: 0, vy: 1, fall: 8, life: 1.2, max: 1.2, size: 1.5 + Math.random() * 2, colour: 'rgba(200,180,150,0.9)' }); } }
      else if (e.type === 'rising') { sfx.alarm(); toast(t('esc.rising'), 3.2, true); }
      else if (e.type === 'escaped') { sfx.safe(); flash = 0.4; shake = 0; burst(p.x, p.y - 0.6, 40, '#ffd65a', 6, 3, 1.2); toast(t('esc.escaped'), 4); }
      else if (e.type === 'caught') { sfx.rescue(); shake = 0.3; toast(t('esc.caught'), 4); teach('companeros'); }
      else if (e.type === 'under') { sfx.bubble(); toast(t('call.under'), 2.4, true); teach('agua'); }
      else if (e.type === 'bubble') { sfx.bubble(); if (e.out && !p.toldBreath) { p.toldBreath = true; sfx.warn(); toast(t('call.noBreath'), 2.4, true); } }
      else if (e.type === 'surfaced') { sfx.gasp(); p.toldBreath = false; }
      else if (e.type === 'fizzle') { sfx.fizzle(); flash = 0.2; burst(e.x, e.y - 0.6, 18, '#ffe08a', 3, 2.5, 0.6); burst(e.x, e.y - 0.4, 10, 'rgba(160,160,150,0.8)', 2, 4, 1); toast(t('call.fizzle'), 3.2, true); teach('llama'); }
      else if (e.type === 'blown') { sfx.whoosh(); for (const [x, y] of e.tiles) burst(x + 0.5, y + 0.5, 4, 'rgba(225,240,190,0.8)', 5, 4, 0.7); float(p.x, p.y - 1, t('call.blown'), 'good'); }
      else if (e.type === 'workshop') openShop();
      else if (e.type === 'museum') openMuseum();
      else if (e.type === 'cycle') sfx.move();
      else if (e.type === 'noItem') { sfx.miss(); toast(t('call.noItem'), 2.2, true); }
      else if (e.type === 'notHere') { sfx.miss(); toast(t('call.notHere'), 1.6, true); }
      else if (e.type === 'notNeeded') { sfx.miss(); toast(t('call.notNeeded'), 1.6); }
      else if (e.type === 'item') {
        if (e.id === 'dynamite') { sfx.fuse(); toast(t('call.fuse'), 2, true); teach('dinamita'); }
        else if (e.id === 'kit') { sfx.ding(); burst(p.x, p.y - 0.4, 16, '#8fd88a', 3, 3); }
        else if (e.id === 'oil') { sfx.ding(); burst(p.x, p.y - 0.8, 16, '#ffd27a', 3, 3); }
        else if (e.id === 'rope') { sfx.rope(); teach('torno'); }
      } else if (e.type === 'boom') {
        sfx.boom(); shake = 0.7; flash = 0.35;
        burst(e.x + 0.5, e.y + 0.5, 46, '#8a7a6a', 9, 4, 1); burst(e.x + 0.5, e.y + 0.5, 20, '#ffcf6a', 7, 3, 0.5);
        if (e.hit != null) float(p.x, p.y - 0.8, t('call.blast'), 'bad');
      } else if (e.type === 'hauled') { sfx.ok(); float(p.x, p.y - 1, t('call.hauled'), 'good'); }
      else if (e.type === 'bought') { sfx.buy(); if (e.u === 'ladders') teach('escalera'); if (e.u === 'stations') teach('jaula'); }
    }
    // Light and strength warnings, once per trip down; deep water once.
    if (p.y < SURFACE) { p.warnLight = p.warnHp = false; wasDeep.v = false; if (p.light < m.stat('lamp') - 1) p.toldLit = false; }
    else {
      if (!p.warnLight && p.light < m.stat('lamp') * 0.25) { p.warnLight = true; sfx.warn(); toast(t('call.lowLight'), 2.5, true); }
      if (!p.warnHp && p.hp < R.miner.hp * 0.3) { p.warnHp = true; sfx.warn(); toast(t('call.lowHealth'), 2.5, true); }
      const deep = m.waterAt(Math.floor(p.x), Math.floor(p.y)) > R.water.deep;
      if (deep && !wasDeep.v) { toast(t('call.deep'), 2.4, true); teach('agua'); }
      wasDeep.v = deep;
    }
    // The first time bad air near you is carried off by a draught: say why.
    if (!S.ventTold) {
      const cx = Math.floor(p.x), cy = Math.floor(p.y);
      for (let y = cy - 5; y <= cy + 5 && !S.ventTold; y++) for (let x = cx - 6; x <= cx + 6; x++) {
        if (x < 0 || x >= m.W || y < SURFACE || y >= m.H) continue;
        const i = m.idx(x, y);
        if (m.gas[i] > 0 && m.vented[i]) { S.ventTold = true; toast(t('call.vented'), 3); teach('ventilacion'); break; }
      }
    }
    // Depth records, every ten metres.
    const rec = Math.floor(m.stats.deepest / 10) * 10;
    if (rec >= 10 && rec > (S.recordShown ?? 0)) { S.recordShown = rec; float(p.x + 1.6, p.y - 0.4, t('call.record', { n: rec }), 'gold'); }
  };

  // ---- a new fact from history every time ore is sold at the weighbridge ----
  const facts = [...app.data.facts].sort(() => Math.random() - 0.5);
  let factI = 0, factUntil = 0;
  const nextFact = () => {
    if (!facts.length) return;
    const f = facts[factI++ % facts.length];
    el.fact.replaceChildren(h('p', { class: 'kicker' }, t('fact.title')), h('p', {}, t(f.text_key)));
    el.fact.className = 'fact-pop parchment'; factUntil = app.time + 9;
  };

  // ---- a find: the game stops for a moment to look at it ----
  const openMoment = (id) => {
    sfx.find(); shake = 0.2;
    moment = { id, t0: 0 };
    el.shop.replaceChildren(h('div', { class: 'overlay moment-wrap' }, h('div', { class: 'parchment moment-card' },
      h('p', { class: 'kicker' }, t('museum.new')),
      h('div', { class: 'moment-art' }, h('img', { src: findIcon(id, 120), alt: '' })),
      h('h2', {}, t(`find.${id}.name`)),
      h('p', { class: 'moment-text' }, t(`find.${id}.text`)),
      h('p', { class: 'moment-go' }, t('call.find', { name: t(`find.${id}.name`) })),
      h('p', { class: 'hint' }, rich(t('ui.next'))))));
  };
  const updateMoment = (dt) => {
    moment.t0 += dt;
    if (moment.t0 > 0.8 && (app.input.any('a') || app.input.any('b') || app.input.any('c') || app.input.any('start'))) { sfx.move(); moment = null; el.shop.replaceChildren(); }
  };

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
      if (++cave.i >= app.data.story.cave.length) { cave = null; sfx.win(); openChoice(); return; }
      showCave();
    }
  };
  // Then: keep digging for the museum, or end the career here.
  const openChoice = () => {
    choice = { t0: 0 };
    el.shop.replaceChildren(h('div', { class: 'overlay cave-wrap' }, h('div', { class: 'parchment cave-card choice-card' },
      h('p', { class: 'kicker' }, t('crown.kicker')),
      h('div', { class: 'crown-row' }, h('img', { src: findIcon('collar', 84), alt: '' }), h('p', { class: 'cave-text' }, t('crown.text'))),
      h('p', { class: 'crown-ready' }, t('crown.ready')),
      h('p', { class: 'museum-line' }, t('museum.count', { n: m.museum.length, total: R.finds.list.length })),
      h('div', { class: 'choices' }, h('p', {}, rich(t('choice.keep'))), h('p', {}, rich(t('choice.end')))))));
  };
  const updateChoice = (dt) => {
    choice.t0 += dt;
    if (choice.t0 < 0.8) return;
    if (app.input.any('a')) { sfx.ok(); choice = null; el.shop.replaceChildren(); }
    else if (app.input.any('b')) { sfx.ok(); choice = null; el.shop.replaceChildren(); m.endCareer(); }
  };

  // ---- the museum: a shelf per old mine ----
  const openMuseum = () => { museum = { r: 0, c: 0, t0: 0 }; sfx.ok(); showMuseum(); };
  const showMuseum = () => {
    if (!museum) { el.shop.replaceChildren(); return; }
    const rows = R.layers.map((l) => ({ card: l.card, finds: R.finds.list.filter((f) => f.layer === l.card).map((f) => f.id) }));
    const id = rows[museum.r].finds[museum.c], have = m.museum.includes(id);
    el.shop.replaceChildren(h('div', { class: 'overlay shop-wrap' }, h('div', { class: 'parchment museum-card' },
      h('div', { class: 'shop-head' }, h('h2', {}, t('museum.title')), h('p', { class: 'purse' }, t('museum.count', { n: m.museum.length, total: R.finds.list.length }))),
      h('div', { class: 'shelves' }, rows.map((row, r) => h('div', { class: 'shelf' },
        h('div', { class: 'shelf-name' }, t(`gl.${row.card}.name`)),
        h('div', { class: 'shelf-items' }, row.finds.map((f, c) => {
          const got = m.museum.includes(f);
          return h('div', { class: `piece ${got ? 'got' : 'missing'} ${r === museum.r && c === museum.c ? 'sel' : ''}` },
            h('img', { src: findIcon(f, 44, !got), alt: '' }), h('span', {}, got ? t(`find.${f}.name`) : '?'));
        }))))),
      h('div', { class: 'detail' }, have
        ? h('p', {}, h('b', {}, t(`find.${id}.name`)), ': ', t(`find.${id}.text`))
        : h('p', { class: 'where' }, t('museum.where', { where: t(`gl.${rows[museum.r].card}.name`) }))),
      h('p', { class: 'hint' }, rich(t('museum.hint')), m.stats.cave ? ['   ', ...rich(t('call.end'))] : null))));
  };
  const updateMuseum = (dt) => {
    const inp = app.input;
    museum.t0 += dt;
    const nr = R.layers.length;
    if (inp.any('up')) { museum.r = (museum.r + nr - 1) % nr; sfx.move(); showMuseum(); }
    if (inp.any('down')) { museum.r = (museum.r + 1) % nr; sfx.move(); showMuseum(); }
    if (inp.any('left')) { museum.c = (museum.c + 2) % 3; sfx.move(); showMuseum(); }
    if (inp.any('right')) { museum.c = (museum.c + 1) % 3; sfx.move(); showMuseum(); }
    if (museum.t0 > 0.3 && m.stats.cave && inp.any('c')) { sfx.ok(); museum = null; showMuseum(); m.endCareer(); return; }
    if (museum.t0 > 0.3 && (inp.any('b') || inp.any('start') || inp.any('a'))) { sfx.move(); museum = null; showMuseum(); }
  };

  // ---- the workshop: the game pauses while you shop ----
  // Each branch of tools is a row: what you have, then every step to come,
  // with its era and what it opens up; then the belt's things.
  const rowsN = UPGRADES.length + 1;
  const benefitText = (u, level) => {
    const b = m.benefit(u, level);
    if (u === 'pick') return b.opens.length ? t('ben.opens', { what: b.opens.map((c) => t(`gl.${c}.name`)).join(', ') }) : t('ben.faster');
    if (u === 'lamp') return `${t('ben.lamp', { n: Math.round(b.value) })} · ${t('ben.lampAir', { n: (R.badAir.warn + R.badAir.warnPerLamp * level).toFixed(1) })}`;
    if (u === 'bag') return t('ben.bag', { n: Math.round(b.value) });
    if (u === 'gear') return t('ben.gear', { n: Math.round(b.value * 100) });
    if (u === 'ladders') return t('ben.ladders', { n: Math.round(b.value) });
    return level ? t('ben.station', { n: b.depth }) : t('ben.noStation');
  };
  const openShop = () => { shop = { sel: 0, item: 0, t0: 0 }; sfx.ok(); showShop(); };
  const showShop = () => {
    if (!shop) { el.shop.replaceChildren(); return; }
    const p = m.miners[0];
    const branch = (b, i) => {
      const own = m.levels[b], top = R.upgrades[b].cost.length, lock = m.locked(b);
      return h('div', { class: `branch ${i === shop.sel ? 'sel' : ''}` },
        h('div', { class: 'branch-name' }, h('div', { class: `icon up-${b}` }), h('b', {}, t(`up.${b}.kind`))),
        h('div', { class: 'track' }, Array.from({ length: top + 1 }, (_, n) => {
          const state = n <= own ? 'owned' : n === own + 1 ? 'next' : 'later';
          const era = R.eras?.[b]?.[n];
          const price = n > 0 ? R.upgrades[b].cost[n - 1] : null;
          return [n ? h('span', { class: `arrow ${state}` }, '→') : null,
            h('div', { class: `node ${state} ${state === 'next' && (price > m.money || lock) ? 'dear' : ''}` },
              h('span', { class: 'node-name' }, t(`up.${b}.${n}.name`)),
              era ? h('span', { class: 'era' }, t(`era.${era}`)) : null,
              state === 'owned' ? h('span', { class: 'tick' }, n === own ? t('shop.have') : '✓')
                : state === 'next' && lock ? h('span', { class: 'node-lock' }, t('shop.locked', { n: R.stations.list[own].y - SURFACE }))
                  : h('span', { class: 'node-price' }, h('span', { class: 'coin' }), fmt(price)))];
        }).flat()));
    };
    const onBelt = shop.sel === UPGRADES.length;
    const belt = h('div', { class: `branch belt-row ${onBelt ? 'sel' : ''}` },
      h('div', { class: 'branch-name' }, h('b', {}, t('shop.belt'))),
      h('div', { class: 'items' }, ITEMS.map((id, k) => {
        const I = R.items[id], full = p.belt[id] >= I.max;
        return h('div', { class: `item-card ${onBelt && k === shop.item ? 'on' : ''} ${full || I.cost > m.money ? 'dear' : ''}` },
          h('img', { src: itemIcon(id, 34), alt: '' }),
          h('span', { class: 'item-name' }, t(`item.${id}.name`)),
          h('span', { class: 'item-meta' }, h('span', { class: 'node-price' }, h('span', { class: 'coin' }), fmt(I.cost)), h('span', { class: 'carry' }, t('shop.carry', { n: p.belt[id], max: I.max }))));
      })));
    let detail;
    if (onBelt) { const id = ITEMS[shop.item]; detail = h('p', {}, h('b', {}, t(`item.${id}.name`)), ': ', t(`item.${id}.text`)); }
    else {
      const u = UPGRADES[shop.sel], lvl = m.levels[u], c = m.cost(u), lock = m.locked(u);
      detail = c == null ? h('p', {}, h('b', {}, t(`up.${u}.${lvl}.name`)), ' · ', t('shop.max'))
        : h('p', {}, h('b', {}, t(`up.${u}.${lvl + 1}.name`)), ': ', t(`up.${u}.${lvl + 1}.text`), h('span', { class: 'gain' }, ` ${benefitText(u, lvl + 1)}`),
          lock ? h('span', { class: 'lock' }, ` · ${t('shop.locked', { n: R.stations.list[lvl].y - SURFACE })}`) : null);
    }
    el.shop.replaceChildren(h('div', { class: 'overlay shop-wrap' }, h('div', { class: 'parchment shop-card tree' },
      h('div', { class: 'shop-head' }, h('h2', {}, t('shop.title')), h('p', { class: 'purse' }, h('span', { class: 'coin' }), h('b', {}, fmt(m.money)))),
      h('div', { class: 'branches' }, UPGRADES.map(branch), belt),
      h('div', { class: 'detail' }, detail),
      h('p', { class: 'hint' }, rich(t('shop.hint'))))));
  };
  const updateShop = (dt) => {
    const inp = app.input;
    shop.t0 += dt;
    if (inp.any('up')) { shop.sel = (shop.sel + rowsN - 1) % rowsN; sfx.move(); showShop(); }
    if (inp.any('down')) { shop.sel = (shop.sel + 1) % rowsN; sfx.move(); showShop(); }
    if (shop.sel === UPGRADES.length) {
      if (inp.any('left')) { shop.item = (shop.item + ITEMS.length - 1) % ITEMS.length; sfx.move(); showShop(); }
      if (inp.any('right')) { shop.item = (shop.item + 1) % ITEMS.length; sfx.move(); showShop(); }
    }
    if (shop.t0 > 0.3 && inp.any('a')) {
      const ok = shop.sel === UPGRADES.length ? m.buyItem(ITEMS[shop.item]) : m.buy(UPGRADES[shop.sel]);
      if (!ok) sfx.miss();
      else { const e = m.events.at(-1); sfx.buy(); shown = Math.min(shown, m.money); if (e?.u === 'ladders') teach('escalera'); if (e?.u === 'stations') teach('jaula'); }
      showShop(); m.events = [];
    }
    if (shop.t0 > 0.3 && (inp.any('b') || inp.any('start'))) { sfx.move(); shop = null; showShop(); }
  };

  const inputs = () => {
    const one = (p) => ({ x: (p.right ? 1 : 0) - (p.left ? 1 : 0), y: (p.down ? 1 : 0) - (p.up ? 1 : 0), a: p.pressed.a, b: p.pressed.b, c: p.pressed.c });
    const [a, b] = app.input.players.map(one);
    // One miner; either set of controls drives it.
    return [{ x: a.x || b.x, y: a.y || b.y, a: a.a || b.a, b: a.b || b.b, c: a.c || b.c }];
  };

  renderTop();
  return {
    update(dt) {
      if (toastUntil && app.time > toastUntil) { el.toast.className = 'toast hidden'; toastUntil = 0; }
      if (cardUntil && app.time > cardUntil) { el.card.className = 'gloss parchment hidden'; cardUntil = 0; }
      if (factUntil && (app.time > factUntil || m.miners[0].y > SURFACE + 2)) { el.fact.className = 'fact-pop parchment hidden'; factUntil = 0; }
      nextLesson();
      for (const q of fx) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += (q.fall ?? 6) * dt; }
      for (let k = fx.length - 1; k >= 0; k--) if (fx[k].life <= 0) fx.splice(k, 1);
      // Coins count up at the weighbridge.
      if (shown < m.money) {
        shown = Math.min(m.money, shown + Math.max(2, (m.money - shown) * dt * 3));
        if ((tickT += dt) > 0.07) { tickT = 0; sfx.tick(); }
      } else shown = m.money;
      if (moment) { updateMoment(dt); renderTop(); return; }
      if (cave) { updateCave(dt); return; }
      if (choice) { updateChoice(dt); return; }
      if (museum) { updateMuseum(dt); return; }
      if (shop) { updateShop(dt); renderTop(); return; }
      if (m.over) { if ((endT += dt) > 1.2) app.go('final'); renderEscape(); return; }
      m.step(inputs(), dt);
      // Digging: grit flying off the rock face, and the sound of the tool.
      for (const p of m.miners) if (p.dig) {
        const d = p.dig;
        if (Math.random() < 0.6) fx.push({ x: d.x + 0.5 - (d.dx || 0) * 0.45, y: d.y + (d.dx ? 0.5 : d.up ? 0.95 : 0.05), vx: (Math.random() - 0.5) * 3 - (d.dx || 0) * 1.5, vy: -Math.random() * 2.5, life: 0.5, max: 0.5, size: 2 + Math.random() * 2, colour: 'rgba(120,96,70,0.9)' });
        if ((digTick += dt) > (m.levels.pick === 3 ? 0.08 : 0.32 - m.levels.pick * 0.05)) { digTick = 0; sfx.dig(m.levels.pick); }
      }
      // Loose rock about to fall trickles dust.
      for (const r of m.rocks) if (r.wait > 0 && Math.random() < 0.35) fx.push({ x: r.x + 0.2 + Math.random() * 0.6, y: r.y + 1, vx: 0, vy: 0.5, fall: 3, life: 0.9, max: 0.9, size: 1.5 + Math.random() * 1.5, colour: 'rgba(200,180,150,0.85)' });
      handle();
      cam.follow(dt);
      renderTop();
      renderEscape();
    },
    draw(g) {
      g.save();
      if (shake > 0) { g.translate((Math.random() - 0.5) * shake * 14, (Math.random() - 0.5) * shake * 10); shake = Math.max(0, shake - 1 / 60); }
      cam.draw(g, app.time, fx);
      g.restore();
      finish(g);
      if (flash > 0) { g.fillStyle = `rgba(255,240,210,${flash})`; g.fillRect(0, 0, W, H); flash = Math.max(0, flash - 1 / 40); }
      if (shop || cave || museum || moment || choice) { g.fillStyle = 'rgba(30,18,10,0.45)'; g.fillRect(0, 0, W, H); }
    },
  };
}

// ---- the career ends: the museum opening ----------------------------------------------------------------
//
// The village throws a fiesta: the crowd walks in, each shelf's pieces light
// up one by one while the score counts up (empty plinths for the ones still
// to find), the cave's piece takes the place of honour, and the paper prints
// the headline. Then the score and the best careers. [A] skips ahead.

export function final(app) {
  const S = app.session, m = S.mine, R = m.R, B = m.breakdown(), score = B.total, how = m.stats.escape;
  const T = { earned: [0.8, 2.6], pieces: 2.8, each: 0.32 };
  const order = R.finds.list.map((f) => ({ id: f.id, layer: f.layer, got: m.museum.includes(f.id) }));
  T.crown = T.pieces + order.length * T.each + 0.4; T.cave = T.crown + 0.9; T.escape = T.cave + 0.7; T.total = T.escape + 0.7; T.paper = T.total + 0.6; T.done = T.paper + 0.8;
  const F = {
    rows: R.layers.map((l) => ({ name: t(`gl.${l.card}.name`), pieces: order.filter((o) => o.layer === l.card).map((o) => ({ ...o, lit: 0 })) })),
    crown: { got: m.crown === 'museum', lit: 0, label: t('fin.centre') }, crowd: 0, cheer: 0, confetti: [],
  };
  const flat = F.rows.flatMap((r) => r.pieces);
  const missing = flat.filter((q) => !q.got).length;
  let t0 = 0, page = 'show', lastPiece = -1, tickT = 0;
  const shown = { earned: 0, museum: 0, cave: 0, escape: 0 };
  const cell = {};
  const row = (key, label) => { cell[key] = h('b', {}, '0'); return h('div', { class: `res-row fin-${key} hidden` }, h('span', {}, label), cell[key]); };
  const escapeLabel = how === 'escaped' ? t('final.escape') : `${t('final.escape')} (${t(how === 'caught' ? 'final.caught' : 'final.noEscape')})`;
  const card = h('div', { class: 'parchment fin-card' },
    h('p', { class: 'kicker' }, t('fin.kicker')),
    h('h2', {}, t('fin.title')),
    row('earned', t('final.earned')),
    row('museum', t('final.museum', { n: B.n, each: R.score.museum })),
    row('cave', B.cave ? t('final.cave') : `${t('final.cave')} (${t('final.noCave')})`),
    row('escape', escapeLabel),
    h('div', { class: 'res-total fin-total' }, h('span', {}, t('final.score')), cell.total = h('b', {}, '0')),
    h('p', { class: 'fin-missing' }, missing ? t('fin.missing', { n: missing }) : t('fin.full')),
    h('p', { class: 'hint fin-hint hidden' }, rich(t('ui.next'))));
  const head = how === 'escaped' ? 'escaped' : how === 'caught' ? 'caught' : 'none';
  const paper = h('div', { class: 'paper hidden' },
    h('div', { class: 'paper-mast' }, h('span', {}, t('fin.paper')), h('small', {}, t('fin.edition'))),
    h('div', { class: 'paper-body' },
      head !== 'none' ? h('img', { src: findIcon('collar', 70), alt: '' }) : null,
      h('div', {}, h('h1', {}, t(`fin.head.${head}`)), h('p', {}, t(`fin.sub.${head}`, { n: m.museum.length })))));
  app.ui.replaceChildren(h('div', { class: 'overlay fiesta' }, card, paper));
  const reveal = (key) => card.querySelector(`.fin-${key}`)?.classList.remove('hidden');
  const confetti = (n, x0 = 0, x1 = W, y0 = -20) => { for (let k = 0; k < n; k++) F.confetti.push({ x: x0 + Math.random() * (x1 - x0), y: y0 - Math.random() * 60, vx: (Math.random() - 0.5) * 40, vy: 40 + Math.random() * 60, a: Math.random() * 6, va: (Math.random() - 0.5) * 8, s: 3 + Math.random() * 3, c: ['#c8202a', '#f6f0e4', '#e8b840', '#2e8b57', '#3d8fd0'][k % 5] }); };
  sfx.fanfare(); confetti(70);
  const set = (key, v) => { shown[key] = v; cell[key].textContent = key === 'earned' ? fmt(v) : `+${fmt(v)}`; };
  // Skip to the end of the show.
  const finishShow = () => {
    for (const q of flat) q.lit = 1;
    F.crown.lit = 1; F.crowd = 1; F.cheer = 1;
    for (const k of ['earned', 'museum', 'cave', 'escape']) { set(k, B[k]); reveal(k); }
    cell.total.textContent = fmt(score);
    paper.className = 'paper'; card.querySelector('.fin-hint').classList.remove('hidden');
    t0 = Math.max(t0, T.done);
  };
  for (const k of ['earned']) reveal(k);
  return {
    update(dt) {
      const before = t0;
      t0 += dt;
      const inp = app.input, pressed = inp.any('a') || inp.any('start');
      if (page === 'scores') { if (pressed) { sfx.ok(); app.go('fact'); } return; }
      if (page === 'show' && t0 < T.done && pressed && t0 > 0.6) { finishShow(); return; }
      if (page === 'show' && t0 >= T.done && pressed) {
        sfx.ok();
        if (qualifies(COURSE, S.difficulty, score)) app.go('initials', { score });
        else { page = 'scores'; app.ui.replaceChildren(h('div', { class: 'overlay results' }, scoreTable(), h('p', { class: 'press' }, rich(t('ui.next'))))); }
        return;
      }
      F.crowd = Math.min(1, t0 / 2.2);
      // Money earned counts up first.
      if (t0 < T.earned[1] + 0.1) {
        const k = Math.max(0, Math.min(1, (t0 - T.earned[0]) / (T.earned[1] - T.earned[0])));
        set('earned', B.earned * k);
        if (k > 0 && k < 1 && (tickT += dt) > 0.06) { tickT = 0; sfx.tick(); }
      }
      // Then the pieces, shelf by shelf.
      const i = Math.floor((t0 - T.pieces) / T.each);
      if (i > lastPiece && i < flat.length && t0 >= T.pieces) {
        lastPiece = i; const q = flat[i];
        if (i === 0) reveal('museum');
        if (q.got) { sfx.pop(Math.min(14, i)); set('museum', shown.museum + R.score.museum); const [x, y] = fiestaPieceAt(Math.floor(i / 3), i % 3); confetti(6, x - 20, x + 20, y - 10); }
        else sfx.thud();
      }
      for (let k = 0; k < flat.length; k++) if (t0 >= T.pieces + k * T.each) flat[k].lit = Math.min(1, flat[k].lit + dt * 3);
      // The cave's piece, in the place of honour.
      if (before < T.crown && t0 >= T.crown) { if (F.crown.got) { sfx.fanfare(); const [x] = fiestaCrownAt(); confetti(50, x - 120, x + 120); } else sfx.thud(); }
      if (t0 >= T.crown) F.crown.lit = Math.min(1, F.crown.lit + dt * 1.5);
      if (before < T.cave && t0 >= T.cave) { reveal('cave'); set('cave', B.cave); if (B.cave) sfx.pop(7); }
      if (before < T.escape && t0 >= T.escape) { reveal('escape'); set('escape', B.escape); if (B.escape) { sfx.jackpot(); confetti(40); } else sfx.thud(); }
      cell.total.textContent = fmt(Object.values(shown).reduce((a, b) => a + b, 0));
      if (before < T.total && t0 >= T.total) { cell.total.textContent = fmt(score); cell.total.parentElement.classList.add('pulse'); }
      if (before < T.paper && t0 >= T.paper) { paper.className = 'paper'; sfx.cheer(); sfx.boom(); F.cheer = 1; confetti(60); }
      if (before < T.done && t0 >= T.done) card.querySelector('.fin-hint').classList.remove('hidden');
      F.cheer = Math.max(F.cheer * Math.exp(-dt * 0.15), t0 > T.crown ? 0.5 : 0.25);
      for (const q of F.confetti) { q.x += q.vx * dt; q.y += q.vy * dt; q.a += q.va * dt; q.vx *= 0.99; }
      F.confetti = F.confetti.filter((q) => q.y < H + 20);
      if (t0 > T.done && F.confetti.length < 25) confetti(2);
    },
    draw(g) { drawFiesta(g, F, app.time); },
  };
}

const ALPHABET = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';

export function initials(app, { score }) {
  const letters = [0, 0, 0], cam = cameras(app.session.mine);
  let slot = 0, saved = false, t0 = 0;
  const show = () => app.ui.replaceChildren(h('div', { class: 'overlay results' }, saved ? scoreTable() : h('div', { class: 'parchment res-card' },
    h('h2', {}, t('scores.new')), h('p', { class: 'big-score' }, fmt(score)),
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
