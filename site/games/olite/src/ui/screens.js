// Every screen is a function (app, arg) -> { update(dt), draw(ctx) } that
// builds its own DOM over the canvas and moves on with app.go(). Flow:
// attract -> menu -> story(intro) -> briefing -> play -> results ->
// [initials] -> fact -> story(outro) -> attract.
//
// The logical screen is 960x540; main.js draws the canvas at 2x.

import { h } from './dom.js';
import { t, getLang, setLang, nextLang, LANGS } from './i18n.js';
import { Olite } from '../core/olite.js';
import { councilTurn } from '../core/council.js';
import { drawMap, T, OY } from './map.js';
import { iconSVG } from './icons.js';
import { sceneSVG } from './scenes.js';
import { sfx } from './audio.js';
import { settings, topScores, qualifies, addScore, loadCampaign, saveCampaign, clearCampaign } from './store.js';
import { langParam } from './arcade.js';

const W = 960, H = 540;
const COURSE = 'walledtown';
const MAP_W = 11 * T, MAP_H = 6 * T;

// "[A] use" -> button glyph + text, so non-readers can match the button.
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

const icon = (id, cls = 'ic') => h('span', { class: cls, html: iconSVG(id) });
const cardName = (id) => t(`card.${id}.name`);
const projName = (id) => t(`project.${id}.name`);
const seed = (app) => (app.time * 1000 + Date.now()) | 0;

function backdrop(ctx, g, time, shade) {
  const grad = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, 640);
  grad.addColorStop(0, '#46553f'); grad.addColorStop(1, '#1e2620');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  if (g) {
    // Behind the title and menu the map sits in the middle of the screen.
    ctx.save();
    if (shade) ctx.translate((W - (MAP_W + 28)) / 2, (H - MAP_H) / 2 - OY + 4);
    drawMap(ctx, g, time);
    ctx.restore();
  }
  if (shade) { ctx.fillStyle = `rgba(14,16,12,${shade})`; ctx.fillRect(0, 0, W, H); }
}

// A council game that plays itself behind the title and the menu.
function demo(app) {
  let g = new Olite(app.data.game, { seed: seed(app) }), clock = 0, rest = 0;
  return {
    get g() { return g; },
    update(dt) {
      if (g.finished) { if ((rest += dt) > 4) { g = new Olite(app.data.game, { seed: seed(app) }); rest = 0; } return; }
      if ((clock += dt) < 1.6) return;
      clock = 0;
      councilTurn(g, 0);
      if (!g.finished) g.endTurn(0);
    },
  };
}

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
  const d = demo(app);
  const cards = ['title', 'fact', 'title', 'scores'];
  let card = 0, cardT = 0, factI = Math.floor(Math.random() * app.data.facts.length);
  const show = () => {
    const press = h('p', { class: 'press' }, rich(t('title.press')));
    let body;
    if (cards[card] === 'title') body = h('div', { class: 'title-card' }, h('h1', { class: 'logo' }, t('title.name')), h('p', { class: 'subtitle' }, t('title.subtitle')));
    else if (cards[card] === 'fact') { factI = (factI + 1) % app.data.facts.length; body = factCard(app.data.facts[factI]); }
    else body = scoreTable();
    app.ui.replaceChildren(h('div', { class: 'overlay attract' }, body, press));
  };
  show();
  return {
    attract: true,
    update(dt) {
      d.update(dt);
      if ((cardT += dt) > (cards[card] === 'title' ? 8 : 10)) { card = (card + 1) % cards.length; cardT = 0; show(); }
      const [p1, p2] = app.input.players;
      if (p2.pressed.start || p2.pressed.a) app.go('menu', { players: 2 });
      else if (p1.pressed.start || p1.pressed.a) app.go('menu', { players: 1 });
    },
    draw(ctx) { backdrop(ctx, d.g, app.time, 0.4); },
  };
}

// ---- menu --------------------------------------------------------------------------------

export function menu(app, { players = 1 } = {}) {
  const saved = loadCampaign();
  const S = { players, difficulty: settings.difficulty, mode: 'quick' };
  const rows = [...(saved && !saved.finished ? ['continue'] : []), 'mode', 'players', 'difficulty', 'lang', 'go'];
  const cycles = ['mode', 'players', 'difficulty', 'lang'];
  let row = 0; // a saved campaign is offered first
  const d = demo(app);
  const value = (r) => {
    if (r === 'continue') return h('span', {}, t('menu.continue', { n: saved.turn }));
    if (r === 'go') return h('span', {}, rich(t('menu.go')));
    if (r === 'lang') return h('span', { class: 'langs' }, LANGS.map((l) => h('span', { class: l === getLang() ? 'on' : '' }, t(`lang.${l}`))));
    return h('span', { class: 'val' }, t(`menu.${r}.${S[r]}`));
  };
  const note = () => (S.mode === 'campaign' ? t('menu.mode.campaign.note') : t(`menu.${S.difficulty}.note`));
  const show = () => app.ui.replaceChildren(h('div', { class: 'overlay menu' }, h('div', { class: 'parchment menu-card' },
    h('h1', { class: 'logo small' }, t('title.name')),
    h('div', { class: 'rows' }, rows.map((r, i) => h('div', { class: `row row-${r} ${i === row ? 'sel' : ''}` },
      cycles.includes(r) ? h('span', { class: 'label' }, t(`menu.${r}`)) : null,
      h('span', { class: 'value' }, cycles.includes(r) && r !== 'lang' ? h('span', { class: 'arrow' }, '‹') : null, value(r), cycles.includes(r) && r !== 'lang' ? h('span', { class: 'arrow' }, '›') : null)))),
    h('p', { class: 'note' }, note()),
    h('p', { class: 'hint' }, rich(t('menu.hint'))))));
  show();
  const change = (dir) => {
    const r = rows[row];
    if (r === 'mode') S.mode = S.mode === 'quick' ? 'campaign' : 'quick';
    else if (r === 'players') S.players = S.players === 1 ? 2 : 1;
    else if (r === 'difficulty') S.difficulty = S.difficulty === 'easy' ? 'normal' : 'easy';
    else if (r === 'lang') nextLang(dir);
    else return;
    sfx.move(); show();
  };
  const start = () => {
    sfx.ok();
    app.session = { ...S };
    app.go('story', { panels: app.data.story.intro, next: 'briefing' });
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
      if (rows[row] === 'continue' && (inp.any('a') || inp.any('start'))) {
        sfx.ok();
        app.session = { players: saved.players, difficulty: saved.difficulty, mode: 'campaign', resume: saved };
        app.go('play');
      } else if (inp.any('start') || (inp.any('a') && rows[row] === 'go')) start();
      else if (inp.any('a')) change(1);
    },
    draw(ctx) { backdrop(ctx, d.g, app.time, 0.55); },
  };
}

// ---- story -------------------------------------------------------------------------------

export function story(app, { panels, next }) {
  let i = 0, t0 = 0;
  const show = () => app.ui.replaceChildren(h('div', { class: 'overlay story' },
    h('div', { class: 'scene-wrap', html: sceneSVG(panels[i].scene) }),
    h('div', { class: 'caption parchment' }, h('p', {}, t(panels[i].text)),
      h('div', { class: 'foot' },
        h('div', { class: 'dots' }, panels.map((_, k) => h('span', { class: k === i ? 'on' : '' }))),
        h('p', { class: 'hint' }, rich(t('ui.next')), '    ', rich(t('ui.skip')))))));
  show();
  const advance = () => { if (++i >= panels.length) app.go(next); else { t0 = 0; show(); } };
  return {
    update(dt) {
      if (app.input.any('start')) { app.go(next); return; }
      if (app.input.any('a')) { sfx.move(); advance(); return; }
      if ((t0 += dt) > 8) advance();
    },
    draw(ctx) { backdrop(ctx); },
  };
}

// ---- briefing ----------------------------------------------------------------------------

export function briefing(app) {
  const st = app.data.game.stages.stages.find((s) => s.id === COURSE);
  const timed = app.session.mode === 'quick' && app.session.difficulty === 'normal';
  let t0 = 0;
  app.ui.replaceChildren(h('div', { class: 'overlay briefing' },
    h('div', { class: 'scene-wrap dim', html: sceneSVG('masons') }),
    h('div', { class: 'parchment brief-card' },
      h('h2', {}, t(`stage.${st.id}.name`)),
      h('p', {}, t(`stage.${st.id}.blurb`)),
      h('h3', {}, t('goal')),
      h('div', { class: 'goal-list' }, st.goal.projects.map((id) => h('span', { class: 'goal-item' }, icon(id, 'ic big'), h('span', {}, projName(id))))),
      h('p', { class: 'small' }, timed ? t('turn', { n: st.turns }) + ' · ' + t('menu.normal.note') : t('noLimit')),
      h('p', { class: 'hint' }, rich(t('ui.next'))))));
  return {
    update(dt) {
      t0 += dt;
      if ((t0 > 0.5 && (app.input.any('a') || app.input.any('start'))) || t0 > 40) { sfx.ok(); app.go('play'); }
    },
    draw(ctx) { backdrop(ctx); },
  };
}

// ---- play ---------------------------------------------------------------------------------

// Up/down walks through the areas of the table; left/right through the items.
const ZONES = ['hand', 'store', 'shop', 'projects', 'map'];
const COLOURS = ['#f0a020', '#4aa8e0'];

export function play(app) {
  const { players, difficulty, mode } = app.session;
  const g = app.session.resume
    ? Olite.load(app.data.game, app.session.resume)
    : new Olite(app.data.game, { players, difficulty, mode, seed: seed(app) });
  delete app.session.resume;
  if (mode === 'campaign') saveCampaign(g.save());
  if (new URLSearchParams(location.search).has('debug')) window.olite = g; // developer peek
  const P = g.players;
  // Each player's cursor, and what they're in the middle of picking:
  //   { kind: 'tile', tiles, card?: i, move?: uid, well?: id }  a spot on the map
  //   { kind: 'target', card: i, targets, ti }                    a project, the king...
  const cur = [0, 1].map(() => ({ zone: 'hand', i: 0, mx: 5, my: 2, pick: null, confirmEnd: 0 }));
  let focus = 0, bannerT = 0, endT = 0;

  const el = {
    top: h('div', { class: 'topbar' }), right: h('div', { class: 'side' }), bottom: h('div', { class: 'bottom' }),
    detail: h('div', { class: 'detail hidden' }), hint: h('p', { class: 'play-hint' }),
    banner: h('div', { class: 'banner hidden' }), toast: h('div', { class: 'toast hidden' }),
  };
  app.ui.replaceChildren(h('div', { class: `overlay play ${P === 2 ? 'duo' : 'solo'}` }, el.top, el.right, el.bottom, el.detail, el.hint, el.toast, el.banner));

  let toastUntil = 0;
  const toast = (text, secs = 2.2, bad = false) => {
    el.toast.replaceChildren(...rich(text));
    el.toast.className = `toast ${bad ? 'bad' : ''}`;
    toastUntil = app.time + secs;
  };
  const banner = (children, secs) => { el.banner.replaceChildren(h('div', { class: 'parchment' }, children)); el.banner.className = 'banner'; bannerT = secs; };

  // ---- where things can go ----
  const allTiles = (ok) => {
    const out = [];
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (ok(x, y)) out.push({ x, y });
    return out;
  };
  const tilesFor = (id) => {
    const def = g.cardDefs[id];
    return def.kind === 'action' ? allTiles((x, y) => g.blockAt(x, y)?.burning) : allTiles((x, y) => g.canPlaceAt(x, y, !!def.lot));
  };
  // Start the map cursor somewhere helpful: where the most hungry people would get bread.
  const bestSpot = (id, tiles) => {
    const sup = g.cardDefs[id].supply;
    if (!sup) return tiles[0];
    let best = tiles[0], most = -1;
    for (const tl of tiles) {
      let gain = 0;
      for (const b of g.blocks) {
        const d = Math.max(Math.abs(b.x - tl.x), Math.abs(b.y - tl.y));
        const give = d === 0 ? sup.own : d === 1 ? sup.near : 0;
        if (give && b.pop && !b.burning) gain += Math.min(give, Math.max(0, b.pop - b.supply));
      }
      if (gain > most) { most = gain; best = tl; }
    }
    return best;
  };
  const targetLabel = (tg) => (tg.project ? projName(tg.project) : tg.request ? t('to.request') : tg.favour ? t('to.favour') : t('to.pass'));
  const currentTarget = () => cur.slice(0, P).map((c) => (c.pick?.kind === 'target' ? c.pick.targets[c.pick.ti] : null)).filter(Boolean);

  // ---- drawing the table ----
  const renderTop = () => {
    const timed = g.diff.turnLimit && g.mode === 'quick';
    el.top.replaceChildren(
      h('div', { class: 'tb-title' }, h('b', {}, t('title.name')), h('span', {}, t(`stage.${g.stageDef.id}.name`))),
      h('div', { class: 'tb-turn' }, h('b', {}, t('turn', { n: g.turn })), h('span', {}, timed ? t('turnsLeft', { n: g.stageDef.turns - g.turn + 1 }) : t('noLimit'))),
      h('div', { class: 'tb-stats' },
        h('span', { class: 'stat' }, icon('people'), h('b', {}, String(g.people)), h('small', {}, t('res.people'))),
        h('span', { class: 'stat' }, icon('coin'), h('b', {}, String(g.coin)), h('small', {}, t('res.coin'))),
        h('span', { class: `stat favour ${g.favour <= 5 ? 'low' : ''}` }, icon('favour'), h('b', {}, String(g.favour)),
          h('span', { class: 'meter' }, h('i', { style: { width: `${(g.favour / g.rules.maxFavour) * 100}%` } })))));
  };

  const selClass = (zone, i) => cur.slice(0, P).map((c, k) => (!c.pick && c.zone === zone && c.i === i ? ` sel sel-p${k + 1}` : '')).join('');

  const cardEl = (id, { price, small } = {}) => {
    const def = g.cardDefs[id];
    return h('div', { class: `pcard k-${def.kind} ${small ? 'small' : ''}` },
      h('span', { class: 'kind' }, t(`kind.${def.kind}`)),
      icon(id, 'art'),
      h('span', { class: 'cname' }, cardName(id)),
      price != null ? h('span', { class: `price ${g.coin < price ? 'short' : ''}` }, icon('coin', 'ic mini'), String(price)) : null);
  };

  const renderSide = () => {
    const targets = currentTarget();
    const q = g.request;
    const request = h('div', { class: `request parchment ${q ? '' : 'quiet'} ${targets.some((x) => x.request || x.favour) ? 'target' : ''}` },
      icon('king', 'ic big'),
      q ? h('div', { class: 'req-body' },
        h('b', {}, t(`request.${q.def.id}.name`)), h('span', { class: 'req-left' }, `⏳ ${q.left}`),
        h('p', {}, t(`request.${q.def.id}.text`)),
        q.def.need ? h('div', { class: 'chips' }, Object.entries(q.def.need).map(([c, n]) => h('span', { class: `chip ${(q.given[c] ?? 0) >= n ? 'got' : ''}` }, icon(c, 'ic mini'), `${q.given[c] ?? 0}/${n}`))) : null)
        : h('div', { class: 'req-body' }, h('p', { class: 'quiet-text' }, t('res.favour'), ': ', String(g.favour), ' / ', String(g.rules.maxFavour))));

    const projects = h('div', { class: 'projects parchment' }, h('h3', {}, t('zone.projects')),
      g.projectDefs.map((def, i) => {
        const pr = g.projects[def.id], open = g.projectOpen(def.id), ready = g.projectReady(def.id);
        const isTarget = targets.some((x) => x.project === def.id);
        return h('div', { class: `proj ${pr.done ? 'done' : ''} ${open ? '' : 'closed'} ${ready ? 'ready' : ''} ${isTarget ? 'target' : ''}${selClass('projects', i)}` },
          icon(def.id, 'ic'), h('span', { class: 'pname' }, projName(def.id)),
          pr.done ? h('span', { class: 'tick' }, '✓') : h('span', { class: 'chips' },
            Object.entries(def.needs).map(([c, n]) => h('span', { class: `chip ${(pr.progress[c] ?? 0) >= n ? 'got' : ''}` }, icon(c, 'ic mini'), `${pr.progress[c] ?? 0}/${n}`)),
            h('span', { class: `chip coin ${g.coin >= def.coin ? '' : 'short'}` }, icon('coin', 'ic mini'), String(def.coin))));
      }));

    const shop = h('div', { class: 'shop parchment' }, h('h3', {}, t('zone.shop')), h('div', { class: 'cards' },
      g.shop.map((id, i) => h('div', { class: `slot${selClass('shop', i)} ${id ? '' : 'empty'}` }, id ? cardEl(id, { price: g.cardDefs[id].price, small: true }) : null))));

    const store = h('div', { class: 'store parchment' }, h('h3', {}, t('zone.store')), h('div', { class: 'cards' },
      Array.from({ length: g.rules.warehouse }, (_, i) => h('div', { class: `slot${selClass('store', i)} ${g.warehouse[i] ? '' : 'empty'}` }, g.warehouse[i] ? cardEl(g.warehouse[i].id, { small: true }) : null))));

    el.right.replaceChildren(request, projects, shop, store);
  };

  const renderBottom = () => {
    const hands = [];
    for (let p = 0; p < P; p++) {
      const held = cur[p].pick?.card;
      const mine = (i) => (!cur[p].pick && cur[p].zone === 'hand' && cur[p].i === i ? ` sel sel-p${p + 1}` : '');
      const items = g.hands[p].map((c, i) => h('div', { class: `slot${mine(i)} ${held === i ? 'held' : ''}` }, cardEl(c.id)));
      const waiting = P === 2 && g.done[p];
      items.push(h('div', { class: `slot endslot${mine(g.hands[p].length)}` },
        h('div', { class: `endbtn ${waiting ? 'waiting' : ''}` }, h('span', { class: 'glass' }, '⏳'), h('b', {}, waiting ? t('msg.waiting') : t('endTurn')))));
      // Squeeze the cards together when the hand grows past the space.
      const cardW = P === 2 ? 68 : 84, room = P === 2 ? 266 : 600, n = items.length;
      const stepW = n > 1 ? Math.min(cardW + 6, (room - cardW) / (n - 1)) : 0;
      items.forEach((it, k) => { if (k) it.style.marginLeft = `${stepW - cardW}px`; });
      hands.push(h('div', { class: `hand p${p + 1}` }, P === 2 ? h('span', { class: `ptag p${p + 1}` }, String(p + 1)) : null, h('div', { class: 'cards' }, items)));
    }
    el.bottom.replaceChildren(...hands);
  };

  // The strip over the fields explains whatever the focused player points at.
  const renderDetail = () => {
    const c = cur[focus];
    const hide = () => { el.detail.className = 'detail hidden'; };
    let id = null, isProject = false, extra = null;
    if (c.pick?.kind === 'target') { id = g.hands[focus][c.pick.card]?.id; extra = h('span', { class: 'd-target' }, ' ➜ ', h('b', {}, targetLabel(c.pick.targets[c.pick.ti]))); }
    else if (c.pick?.well) { id = c.pick.well; isProject = true; extra = h('span', { class: 'd-target' }, ' ➜ ', t('msg.lot')); }
    else if (c.pick?.move) id = g.units.find((u) => u.uid === c.pick.move)?.id;
    else if (c.pick) id = g.hands[focus][c.pick.card]?.id;
    else if (c.zone === 'hand') id = g.hands[focus][c.i]?.id;
    else if (c.zone === 'store') id = g.warehouse[c.i]?.id;
    else if (c.zone === 'shop') id = g.shop[c.i];
    else if (c.zone === 'projects') { id = g.projectDefs[c.i]?.id; isProject = true; }
    else if (c.zone === 'map') {
      const u = g.unitAt(c.mx, c.my), b = g.blockAt(c.mx, c.my);
      if (u) id = u.id;
      else if (b) {
        el.detail.className = 'detail';
        el.detail.replaceChildren(icon('people', 'ic big'), h('div', {},
          h('b', {}, `${b.pop} `, t('res.people').toLowerCase()), ' · ', icon('bread', 'ic mini'), ` ${b.supply}/${b.pop} `,
          b.burning ? h('b', { class: 'bad' }, '🔥') : b.fed ? h('b', { class: 'good' }, '✓') : h('b', { class: 'bad' }, '✗')));
        return;
      }
    }
    if (!id) { hide(); return; }
    const key = isProject ? `project.${id}` : `card.${id}`;
    el.detail.className = 'detail';
    el.detail.replaceChildren(icon(id, 'ic big'), h('div', {},
      h('p', {}, h('b', {}, t(`${key}.name`)), ' — ', t(`${key}.text`), extra),
      h('p', { class: 'd-hist' }, t(`${key}.history`))));
  };

  const renderHint = () => {
    const c = cur[focus];
    const key = c.pick ? (c.pick.kind === 'target' ? 'hint.pickTarget' : 'hint.pickTile') : P === 2 ? 'hint.duo' : `hint.${c.zone}`;
    el.hint.replaceChildren(...rich(t(key)));
  };

  const refresh = () => { renderTop(); renderSide(); renderBottom(); renderDetail(); renderHint(); };

  const zoneLen = (p, zone) => (zone === 'hand' ? g.hands[p].length + 1 : zone === 'store' ? g.rules.warehouse : zone === 'shop' ? g.shop.length : zone === 'projects' ? g.projectDefs.length : 1);
  const clamp = (p) => { const c = cur[p]; c.i = Math.max(0, Math.min(c.i, zoneLen(p, c.zone) - 1)); };

  // ---- what the game says back ----
  const handle = () => {
    const ev = g.events;
    for (const e of ev) {
      if (e.type === 'placed') { sfx.build(); toast(t('msg.placed', { name: cardName(e.id) }), 1.6); }
      else if (e.type === 'added' || e.type === 'gave') sfx.card();
      else if (e.type === 'finished') { sfx.build(); toast(t('msg.finished', { name: projName(e.id) }), 2.5); }
      else if (e.type === 'bought') { sfx.coin(); toast(t('msg.bought', { name: cardName(e.id) }), 1.5); }
      else if (e.type === 'stored') { sfx.card(); toast(t('msg.stored'), 1.2); }
      else if (e.type === 'passed') { sfx.card(); toast(t('msg.passed'), 1.2); }
      else if (e.type === 'moved') sfx.build();
      else if (e.type === 'fireOut') { sfx.splash(); toast(t('msg.fireOut'), 1.6); }
      else if (e.type === 'favour') sfx.eventGood();
      else if (e.type === 'requestMet') { sfx.eventGood(); toast(t('msg.requestMet'), 2.5); }
      else if (e.type === 'waiting') toast(t('msg.waiting'), 1.5);
      else if (e.type === 'cant') { sfx.miss(); toast(t(`why.${e.why}`), 2.2, true); }
    }
    if (g.won) { sfx.finish(); banner([h('h2', {}, t('msg.won'))], 3); }
    else if (ev.some((e) => e.type === 'turn')) overnight(ev);
    for (let p = 0; p < P; p++) clamp(p);
    refresh();
  };

  // A new turn: say what happened overnight.
  const overnight = (ev) => {
    const lines = [];
    const inc = ev.find((e) => e.type === 'income'), hungry = ev.find((e) => e.type === 'hungry'), req = ev.find((e) => e.type === 'request');
    if (inc) lines.push(h('p', {}, icon('coin', 'ic mini'), ` +${inc.n}`));
    lines.push(hungry ? h('p', { class: 'bad' }, icon('bread', 'ic mini'), ' ', t('msg.hungry', { n: hungry.blocks, f: hungry.favour })) : h('p', { class: 'good' }, icon('bread', 'ic mini'), ' ', t('msg.fed')));
    if (ev.some((e) => e.type === 'fire')) lines.push(h('p', { class: 'bad' }, icon('fire', 'ic mini'), ' ', t('msg.fire')));
    if (ev.some((e) => e.type === 'arrived')) lines.push(h('p', {}, icon('people', 'ic mini'), ' ', t('msg.arrived')));
    if (ev.some((e) => e.type === 'requestFailed')) lines.push(h('p', { class: 'bad' }, icon('king', 'ic mini'), ' ', t('msg.requestFailed')));
    if (req) lines.push(h('p', { class: 'req' }, icon('king', 'ic mini'), ' ', h('b', {}, t(`request.${req.id}.name`)), ' — ', t(`request.${req.id}.text`)));
    sfx.season();
    if (hungry || ev.some((e) => e.type === 'fire')) sfx.eventBad();
    banner([h('h2', {}, t('turn', { n: g.turn })), ...lines], req ? 4 : 2.6);
    if (g.mode === 'campaign') saveCampaign(g.save());
    for (const c of cur) { c.pick = null; c.zone = 'hand'; c.i = 0; }
  };

  // ---- actions ----
  const useCard = (p, i) => {
    const c = g.hands[p][i];
    if (!c) return;
    const def = g.cardDefs[c.id];
    if (def.kind === 'unit' || def.kind === 'action') {
      const tiles = tilesFor(c.id);
      if (!tiles.length) { sfx.miss(); toast(t(def.kind === 'action' ? 'why.noFire' : 'why.needLot'), 2, true); return; }
      const s = bestSpot(c.id, tiles);
      Object.assign(cur[p], { pick: { kind: 'tile', card: i, tiles }, mx: s.x, my: s.y });
    } else {
      const targets = g.targetsFor(c.id);
      if (P === 2) targets.push({ pass: true });
      if (!targets.length) { sfx.miss(); toast(t('why.nowhere'), 2, true); return; }
      if (targets.length === 1) { g.use(p, i, targets[0]); handle(); return; }
      cur[p].pick = { kind: 'target', card: i, targets, ti: 0 };
    }
    sfx.move(); refresh();
  };

  const confirm = (p) => {
    const c = cur[p], pk = c.pick;
    if (pk.kind === 'tile') {
      const tile = { x: c.mx, y: c.my };
      if (!pk.tiles.some((x) => x.x === tile.x && x.y === tile.y)) { sfx.miss(); return; }
      if (pk.move) g.move(pk.move, tile);
      else if (pk.well) g.finish(pk.well, tile);
      else g.use(p, pk.card, { tile });
    } else {
      const tg = pk.targets[pk.ti];
      if (tg.pass) g.pass(p, pk.card); else g.use(p, pk.card, tg);
    }
    c.pick = null;
    if (c.zone === 'map' && !pk.move && !pk.well) c.zone = 'hand';
    handle();
  };

  const finishProject = (p, def) => {
    if (def.lot !== 'any') { g.finish(def.id); handle(); return; }
    const chk = g.canFinish(def.id, { x: -1, y: -1 });
    if (chk.why !== 'pickLot') { g.finish(def.id); handle(); return; } // says why not
    const tiles = allTiles((x, y) => g.canPlaceAt(x, y, true));
    if (!tiles.length) { sfx.miss(); toast(t('why.nowhere'), 2, true); return; }
    Object.assign(cur[p], { pick: { kind: 'tile', well: def.id, tiles }, mx: tiles[0].x, my: tiles[0].y });
    refresh();
  };

  const endTurn = (p) => { cur[p].confirmEnd = 0; g.endTurn(p); handle(); };
  // Somebody still holding a playable card gets asked twice before the turn ends.
  const canStillPlay = (p) => g.hands[p].some((c) => {
    const def = g.cardDefs[c.id];
    return def.kind === 'unit' || def.kind === 'action' ? tilesFor(c.id).length > 0 : g.targetsFor(c.id).some((x) => !x.favour);
  });

  const mapUI = () => {
    const ui = { cursors: [], tiles: [] };
    for (let p = 0; p < P; p++) {
      const c = cur[p];
      if (c.zone === 'map' || c.pick?.kind === 'tile') ui.cursors.push({ x: c.mx, y: c.my, colour: COLOURS[p] });
      if (c.pick?.kind === 'tile') {
        ui.tiles.push(...c.pick.tiles);
        const id = c.pick.move ? g.units.find((u) => u.uid === c.pick.move)?.id : g.hands[p][c.pick.card]?.id;
        if (id && g.cardDefs[id].supply && !c.pick.well) ui.cover = { x: c.mx, y: c.my };
      }
    }
    return ui;
  };

  const step = (p, inp) => {
    const c = cur[p], pr = inp.pressed;
    let moved = false;
    if (c.pick?.kind === 'tile' || (c.zone === 'map' && !c.pick)) {
      if (pr.left) { c.mx = Math.max(0, c.mx - 1); moved = true; }
      if (pr.right) { c.mx = Math.min(g.w - 1, c.mx + 1); moved = true; }
      if (pr.up) { c.my = Math.max(0, c.my - 1); moved = true; }
      if (pr.down) {
        if (!c.pick && c.my === g.h - 1) { c.zone = 'hand'; c.i = 0; } else c.my = Math.min(g.h - 1, c.my + 1);
        moved = true;
      }
    } else if (c.pick?.kind === 'target') {
      const n = c.pick.targets.length;
      if (pr.left || pr.up) { c.pick.ti = (c.pick.ti + n - 1) % n; moved = true; }
      if (pr.right || pr.down) { c.pick.ti = (c.pick.ti + 1) % n; moved = true; }
    } else {
      const n = zoneLen(p, c.zone);
      if (pr.left) { c.i = (c.i + n - 1) % n; moved = true; }
      if (pr.right) { c.i = (c.i + 1) % n; moved = true; }
      if (pr.up) { c.zone = ZONES[(ZONES.indexOf(c.zone) + 1) % ZONES.length]; c.i = 0; moved = true; }
      if (pr.down) { c.zone = ZONES[(ZONES.indexOf(c.zone) + ZONES.length - 1) % ZONES.length]; c.i = 0; if (c.zone === 'map') c.my = g.h - 1; moved = true; }
    }
    if (moved) { focus = p; clamp(p); sfx.move(); refresh(); }

    if (pr.b) {
      focus = p;
      if (c.pick) { c.pick = null; sfx.move(); refresh(); }
      else if (c.zone !== 'hand') { c.zone = 'hand'; c.i = 0; sfx.move(); refresh(); }
      else if (c.confirmEnd > 0 || !canStillPlay(p)) endTurn(p);
      else { c.confirmEnd = 2.5; toast(t('msg.endAgain'), 2.5); }
    }
    if (pr.a) {
      focus = p;
      if (c.pick) confirm(p);
      else if (c.zone === 'hand') { if (c.i === g.hands[p].length) endTurn(p); else useCard(p, c.i); }
      else if (c.zone === 'store') { if (g.warehouse[c.i]) { g.unstore(p, c.i); handle(); } else sfx.miss(); }
      else if (c.zone === 'shop') { g.buy(p, c.i); handle(); }
      else if (c.zone === 'projects') finishProject(p, g.projectDefs[c.i]);
      else if (c.zone === 'map') {
        const u = g.unitAt(c.mx, c.my);
        if (u && g.cardDefs[u.id].movable && !u.moved) { c.pick = { kind: 'tile', move: u.uid, tiles: allTiles((x, y) => g.canPlaceAt(x, y, false)) }; sfx.move(); refresh(); }
        else { sfx.miss(); if (u) toast(t('why.cantMove'), 2, true); }
      }
    }
    if (pr.c && !c.pick && c.zone === 'hand' && c.i < g.hands[p].length) {
      focus = p;
      if (P === 2) g.pass(p, c.i); else g.store(p, c.i);
      handle();
    }
  };

  refresh();
  if (g.turn === 1) banner([h('h2', {}, t('turn', { n: 1 })), h('p', {}, t(`stage.${g.stageDef.id}.blurb`))], 3.5);

  return {
    update(dt) {
      if (toastUntil && app.time > toastUntil) { el.toast.className = 'toast hidden'; toastUntil = 0; }
      for (const c of cur) if (c.confirmEnd > 0) c.confirmEnd -= dt;
      if (bannerT > 0) {
        bannerT -= dt;
        if (bannerT < 3 && app.input.any('a')) bannerT = 0;
        if (bannerT <= 0) el.banner.className = 'banner hidden';
        return;
      }
      if (g.finished) {
        if ((endT += dt) > 1.5) { if (g.mode === 'campaign') clearCampaign(); app.go('results', { g }); }
        return;
      }
      if (P === 1) step(0, both(app.input));
      else for (let p = 0; p < 2; p++) if (!g.done[p] && !g.finished) step(p, app.input.players[p]);
    },
    draw(ctx) { backdrop(ctx); drawMap(ctx, g, app.time, mapUI()); },
  };
}

// With one player, either stick and either set of buttons works.
function both(input) {
  const [a, b] = input.players;
  return { pressed: Object.fromEntries(Object.keys(a.pressed).map((k) => [k, a.pressed[k] || b.pressed[k]])) };
}

// ---- results -------------------------------------------------------------------------------

export function results(app, { g }) {
  const { parts, total } = g.score();
  const stars = g.stars();
  let t0 = 0;
  const row = (label, value, pts) => h('div', { class: 'res-row' }, h('span', {}, label), h('span', { class: 'res-val' }, value), h('span', { class: 'res-pts' }, `+${pts}`));
  app.ui.replaceChildren(h('div', { class: 'overlay results' }, h('div', { class: 'parchment res-card' },
    h('h2', {}, g.won ? t('results.won') : t(`results.lost.${g.reason === 'favour' ? 'favour' : 'time'}`)),
    h('p', { class: 'stars' }, [1, 2, 3].map((k) => h('span', { class: k <= stars ? 'on' : '' }, '★'))),
    row(t('results.projects'), String(Object.values(g.projects).filter((p) => p.done).length), parts.projects),
    row(t('results.people'), String(g.people), parts.people),
    row(t('results.favour'), String(g.favour), parts.favour),
    row(t('results.coin'), String(g.coin), parts.coin),
    parts.turns ? row(t('results.turns'), String(parts.turns / g.rules.score.turnLeft), parts.turns) : null,
    h('div', { class: 'res-total' }, h('span', {}, t('results.total')), h('b', {}, String(total))),
    g.won ? h('p', { class: 'small' }, t(g.mode === 'campaign' ? 'results.campaignNext' : 'results.next')) : null,
    h('p', { class: 'hint' }, rich(t('ui.next'))))));
  return {
    update(dt) {
      t0 += dt;
      if (t0 < 1 || !(app.input.any('a') || app.input.any('start'))) return;
      sfx.ok();
      if (qualifies(COURSE, g.difficulty, total)) app.go('initials', { score: total, difficulty: g.difficulty });
      else app.go('fact');
    },
    draw(ctx) { backdrop(ctx, g, app.time, 0.5); },
  };
}

// ---- initials --------------------------------------------------------------------------------

const ALPHABET = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';

export function initials(app, { score, difficulty }) {
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
        else { addScore(COURSE, difficulty, letters.map((l) => ALPHABET[l]).join(''), score); saved = true; }
        show();
      }
    },
    draw(ctx) { backdrop(ctx); },
  };
}

// ---- a fact between games ---------------------------------------------------------------------

export function fact(app) {
  const f = app.data.facts[Math.floor(Math.random() * app.data.facts.length)];
  let t0 = 0;
  const card = factCard(f);
  card.append(h('p', { class: 'hint' }, rich(t('ui.next'))));
  app.ui.replaceChildren(h('div', { class: 'overlay fact' }, h('div', { class: 'scene-wrap dim', html: sceneSVG('palace') }), card));
  return {
    update(dt) {
      t0 += dt;
      if ((t0 > 1 && (app.input.any('a') || app.input.any('start'))) || t0 > 20) app.go('story', { panels: app.data.story.outro, next: 'attract' });
    },
    draw(ctx) { backdrop(ctx); },
  };
}
