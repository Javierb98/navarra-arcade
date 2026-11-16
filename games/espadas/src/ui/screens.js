// Title, cutscene, armies, muster, results and help: every screen without a
// grid. Each is a scene on top and dark panels on the ground below, after 1066.

import { h } from './dom.js';
import { t, L, LANGS, getLang, setLang } from './i18n.js';
import { emblemSVG, bannerBearerSVG } from './emblems.js';
import { Scene, meadow } from './scene.js';
import { runTableau, viewSquad, MEN_PER_POINT } from './tableau.js';
import { IberiaMap } from './iberia.js';
import { unitTypesFor, rosterCost, rosterSize, validateRoster, customScenario, FIELD_MAP } from '../core/army.js';

const CAMPAIGN = [
  { id: 'covadonga', year: 722, title: 'Covadonga', sides: ['asturleonese', 'cordoba'], num: 'I' },
  { id: 'roncesvalles', year: 778, title: 'Roncesvalles', sides: ['vascones', 'franks'], num: 'II' },
  { id: 'simancas', year: 939, title: 'Simancas', sides: ['asturleonese', 'cordoba'], num: 'III' },
  { id: 'las_navas', year: 1212, title: 'Las Navas de Tolosa', sides: ['navarra', 'almohads'], epilogue: true },
];

function langToggle(rerender) {
  return h('div', { class: 'lang' }, LANGS.map((l) => h('button', {
    class: l === getLang() ? 'active' : 'ghost',
    'aria-pressed': l === getLang() ? 'true' : 'false',
    onclick: () => { setLang(l); rerender(); },
  }, l.toUpperCase())));
}

function roundel(data, factionId, size) {
  const f = data.factions[factionId];
  return h('span', { class: 'emblem-wrap', html: emblemSVG(f.emblem, f.emblemField ?? f.color, size) });
}

function tag(text) { return h('div', { class: 'screen-tag' }, text); }

// A scene with a few squads, for backdrops. Returns { el, stop }.
function hero(grid, squads, { sky, march, height = 360, horizon } = {}) {
  const scene = new Scene(grid, { width: 1200, height, sky, horizon });
  const units = new Map(squads.map((s) => [s.id, s]));
  const stop = runTableau(scene, units, { march });
  return { el: scene.canvas, stop, units, scene };
}

// ---------------------------------------------------------------------------

export function titleScreen(app, S, { onPlay, onHelp, onCustom, onHomage, rerender }) {
  const d = S.data;
  const grid = {
    w: 12, h: 3,
    at: (x, y) => ({ height: (y === 0 && x >= 8) || (y === 0 && x <= 1) ? 1 : 0, forest: y === 0 && (x === 9 || x === 11) }),
  };
  const squads = [
    viewSquad(d, { id: 'f1', type: 'fra_horsemen', side: 'enemy', faction: 'franks', x: 2, y: 2 }),
    viewSquad(d, { id: 'f2', type: 'fra_baggage', side: 'enemy', faction: 'franks', x: 3.4, y: 1 }),
    viewSquad(d, { id: 'f3', type: 'fra_spearmen', side: 'enemy', faction: 'franks', x: 4.6, y: 2 }),
    viewSquad(d, { id: 'f4', type: 'fra_commander', side: 'enemy', faction: 'franks', x: 5.6, y: 1 }),
    viewSquad(d, { id: 'v1', type: 'vas_warriors', side: 'player', faction: 'vascones', x: 9.2, y: 0, facing: -1 }),
    viewSquad(d, { id: 'v2', type: 'vas_skirmishers', side: 'player', faction: 'vascones', x: 10.4, y: 0, facing: -1 }),
    viewSquad(d, { id: 'v3', type: 'vas_chief', side: 'player', faction: 'vascones', x: 11.2, y: 0, facing: -1 }),
  ];
  const march = new Map([
    ['f1', { speed: 0.35, at: 2 }], ['f2', { speed: 0.35, at: 3.4 }],
    ['f3', { speed: 0.35, at: 4.6 }], ['f4', { speed: 0.35, at: 5.6 }],
  ]);
  const top = hero(grid, squads, { march, height: 420 });

  const items = CAMPAIGN.map((b) => {
    const ready = !!S.scenarios[b.id];
    return h('li', { class: `battle-card ${ready ? '' : 'locked'} ${b.epilogue ? 'epilogue' : ''}` },
      h('div', { class: 'num' }, b.epilogue ? h('span', { class: 'epi' }, t('title.epilogue')) : b.num),
      h('div', { class: 'emblems' }, b.sides.map((f) => roundel(d, f, 38))),
      h('div', { class: 'bc-text' },
        h('div', { class: 'bc-title' }, b.title, h('span', { class: 'year' }, ` ${b.year}`)),
        h('div', { class: 'muted' }, t(`campaign.${b.id}`))),
      ready ? h('button', { class: 'go-btn', onclick: () => onPlay(b.id) }, t('title.play'), ' ›') : h('span', { class: 'soon' }, t('title.soon')));
  });

  app.replaceChildren(h('div', { class: 'screen frame' },
    h('div', { class: 'hero' }, top.el,
      h('div', { class: 'hero-over title-over' },
        langToggle(rerender),
        h('h1', { class: 'game-title' }, t('title.name')),
        h('p', { class: 'subtitle' }, t('title.subtitle')))),
    h('div', { class: 'ground' },
      h('ol', { class: 'campaign' }, items),
      h('div', { class: 'row center' },
        h('button', { class: 'go-btn', onclick: onCustom }, t('title.custom')),
        h('button', { class: 'ghost', onclick: onHelp }, t('title.howto')),
        h('button', { class: 'ghost', onclick: onHomage }, t('title.homage'))),
      h('p', { class: 'fine' }, t('title.fine')))));
  return { destroy: top.stop };
}

// ---------------------------------------------------------------------------
// The map cutscene: captions step through the briefing while the route draws.

export function cutsceneScreen(app, S, { onBack, onNext, rerender }) {
  const sc = S.scenario;
  const d = S.data;
  const map = new IberiaMap(d, { year: sc.year, width: 1200, height: 640 });
  map.marker = d.factions[sc.cutscene.column.faction].color;
  const lines = sc.briefing[getLang()] ?? sc.briefing.en;
  const steps = sc.cutscene.steps;
  let i = 0;
  let from = 0;
  let t0 = performance.now();

  // Foreground: the Frankish column marching home, in silhouette.
  const strip = { w: 12, h: 1, at: () => ({ height: 0, forest: false }) };
  const fg = new Scene(strip, { width: 1200, height: 170, sky: 'none' });
  const column = sc.cutscene.column;
  const col = new Map(column.types
    .map((type, k) => [`c${k}`, viewSquad(d, { id: `c${k}`, type, side: column.side, faction: column.faction, x: 0.2 + k * 1.1, y: 0 })]));
  const march = new Map([...col.keys()].map((id, k) => [id, { speed: 0.3, at: 5.5 - k * 1.1 }]));
  const stopFg = runTableau(fg, col, { march });

  let running = true;
  const loop = (now) => {
    if (!running) return;
    const st = steps[Math.min(i, steps.length - 1)];
    map.labels = st.labels.map(([place, text]) => ({ place, text }));
    map.route = st.route;
    map.progress = from + (st.to - from) * Math.min(1, (now - t0) / 2200);
    map.draw(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  const caption = h('p', { class: 'caption-text' });
  const nextBtn = h('button', { class: 'go-btn', onclick: () => advance() });
  const paint = () => {
    caption.textContent = lines[i] ?? '';
    nextBtn.textContent = `${i < lines.length - 1 ? t('ui.next') : t('ui.continue')} ›`;
  };
  function advance() {
    if (i >= lines.length - 1) { onNext(); return; }
    from = map.progress;
    i++;
    t0 = performance.now();
    paint();
  }
  paint();

  app.replaceChildren(h('div', { class: 'screen frame' },
    h('div', { class: 'cutscene' },
      // The map and the marching column share a box, so on a phone the
      // caption can drop below both without the column covering it.
      h('div', { class: 'cut-map' }, map.canvas, h('div', { class: 'cut-fg' }, fg.canvas)),
      h('div', { class: 'hero-over' }, h('div', { class: 'row spread' }, h('button', { class: 'ghost dark', 'data-back': true, onclick: onBack }, t('ui.back')), langToggle(rerender))),
      h('div', { class: 'caption' },
        h('div', { class: 'caption-date' }, `${L(sc.date)} · ${L(sc.place)}`),
        caption,
        h('div', { class: 'row end' }, h('button', { class: 'ghost dark', onclick: onNext }, t('ui.skip')), nextBtn)))));
  return {
    destroy: () => { running = false; stopFg(); },
    onKey(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advance(); } },
  };
}

// ---------------------------------------------------------------------------
// "Your army vs their army", after 1066's army select screen.

export function armiesScreen(app, S, { onBack, onNext, rerender }) {
  const sc = S.scenario;
  const d = S.data;
  const fp = sc.sides.player.faction, fe = sc.sides.enemy.faction;
  const top = hero(meadow(12, 2), [], { height: 380 });
  const enemyLeader = sc.sides.enemy.units.find((u) => d.units[u.type].tags.includes('leader'));
  const card = (id, leaderName, label) => {
    const f = d.factions[id];
    return h('div', { class: 'dark-panel faction-card' },
      h('div', { class: 'row' }, roundel(d, id, 52), h('div', {},
        h('div', { class: 'fc-name', style: { color: id === 'cordoba' ? '#efe6d2' : lighten(f.color) } }, L(f.name)),
        leaderName ? h('div', { class: 'fc-led' }, t('armies.ledBy', { name: leaderName })) : null)),
      h('p', {}, L(f.blurb)),
      h('div', { class: 'traits' }, ['attack', 'defence', 'courage'].map((k) => h('span', {}, h('i', {}, t(`stat.${k}`)), ' ', t(`trait.${f[k]}`)))),
      f.emblemNote ? h('p', { class: 'emblem-note' }, h('b', {}, `${t('armies.emblem')}: `), L(f.emblemNote)) : null,
      h('div', { class: 'fc-label' }, label));
  };
  app.replaceChildren(h('div', { class: 'screen frame' },
    h('div', { class: 'hero' }, top.el,
      tag(t('armies.title')),
      h('div', { class: 'hero-over bearers' },
        h('div', { class: 'bearer-wrap', html: bannerBearerSVG(d.factions[fp].emblem, d.factions[fp].emblemField ?? d.factions[fp].color, 1, d.factions[fp].color, d.factions[fp].look) }),
        h('div', { class: 'vs' }, t('armies.vs')),
        h('div', { class: 'bearer-wrap', html: bannerBearerSVG(d.factions[fe].emblem, d.factions[fe].emblemField ?? d.factions[fe].color, -1, d.factions[fe].color, d.factions[fe].look) })),
      h('div', { class: 'hero-over' }, h('div', { class: 'row end' }, langToggle(rerender)))),
    h('div', { class: 'ground' },
      h('div', { class: 'two-col' },
        card(fp, L(sc.sides.player.leader.name), t('brief.you')),
        card(fe, enemyLeader?.name ? L(enemyLeader.name) : null, t('brief.them'))),
      h('p', { class: 'fine heraldry-note' }, t('armies.heraldry')),
      h('div', { class: 'dark-panel objective-box' }, h('h3', {}, t('brief.objective')), h('p', {}, L(sc.objective.text)), h('p', { class: 'muted small' }, t('brief.turns', { n: sc.turnLimit }))),
      sc.legendNote ? h('details', { class: 'dark-panel legend' }, h('summary', {}, t('brief.legend')), h('p', {}, L(sc.legendNote))) : null,
      h('div', { class: 'row spread' },
        h('button', { class: 'ghost dark', 'data-back': true, onclick: onBack }, t('ui.back')),
        h('button', { class: 'go-btn', onclick: onNext }, `${t('ui.continue')} ›`)))));
  return { destroy: top.stop };
}

// ---------------------------------------------------------------------------

export function musterScreen(app, S, { onBack, onNext, rerender }) {
  const sc = S.scenario;
  const d = S.data;
  const side = sc.sides.player;
  const types = unitTypesFor(d, side.faction, side.allies ?? []);
  if (!S.counts) S.counts = { ...side.suggested };
  let focus = types[0].id;

  // The warband you are buying marches across the top.
  const top = hero(meadow(12, 3), [], { height: 330 });
  const refreshTroops = () => {
    top.units.clear();
    const list = [{ type: side.leader.type }];
    for (const k of types) for (let n = 0; n < (S.counts[k.id] ?? 0); n++) list.push({ type: k.id });
    list.forEach((s, i) => {
      const row = i % 3;
      const x = 10.6 - Math.floor(i / 3) * 1.25 - row * 0.35;
      top.units.set(`m${i}`, viewSquad(d, { id: `m${i}`, type: s.type, side: 'player', faction: d.units[s.type].faction, x, y: row, facing: 1 }));
    });
  };

  const detail = h('div', { class: 'dark-panel unit-detail' });
  const rows = h('tbody');
  const totalEl = h('tr', { class: 'total' });
  const next = h('button', { class: 'go-btn', onclick: () => { if (!validateRoster(d, side, S.counts)) onNext(); } });
  const errEl = h('p', { class: 'err', role: 'status' });

  const pips = (n, max = 8) => h('span', { class: 'pips' }, Array.from({ length: max }, (_, i) => h('i', { class: i < n ? 'on' : '' })));

  const bump = (id, delta) => {
    const n = Math.max(0, (S.counts[id] ?? 0) + delta);
    const trial = { ...S.counts, [id]: n };
    if (delta > 0 && (rosterCost(d, trial) > side.budget || rosterSize(trial) + 1 > side.maxUnits)) return;
    S.counts = trial;
    S.placements = null;
    focus = id;
    paint();
  };

  function paintDetail() {
    const k = d.units[focus] ?? d.units[side.leader.type];
    const f = d.factions[k.faction];
    detail.replaceChildren(
      h('div', { class: 'row' }, roundel(d, k.faction, 46), h('div', {},
        h('div', { class: 'ud-name', style: { color: lighten(f.color) } }, focus === side.leader.type ? L(side.leader.name) : L(k.name)),
        h('div', { class: 'ud-stats' },
          h('span', {}, t('stat.attack'), ' ', pips(k.attack)),
          h('span', {}, t('stat.defence'), ' ', pips(k.defence)),
          h('span', {}, `» ${t('stat.moves')} ${k.moves}`),
          k.range > 1 ? h('span', {}, t('stat.missile'), ' ', pips(k.missile ?? k.attack)) : null,
          k.range > 1 ? h('span', {}, `${t('stat.range')} ${Math.floor(k.range * d.rules.throwReachPerPower)}`) : null))),
      h('p', {}, L(k.desc)),
      h('div', { class: 'muted small' }, [t(`role.${k.role}`), ...k.tags.filter((x) => x !== 'cavalry').map((x) => t(`tag.${x}`))].join(' · ')));
  }

  function paint() {
    // Keep the stick's place when the rows are redrawn.
    const keep = rows.contains(document.activeElement) ? focus : null;
    const spent = rosterCost(d, S.counts);
    const leader = d.units[side.leader.type];
    rows.replaceChildren(
      h('tr', { class: `fixed ${focus === side.leader.type ? 'focus' : ''}`, onmouseenter: () => { focus = side.leader.type; paintDetail(); } },
        h('td', {}, L(side.leader.name)), h('td', {}, 'n/a'), h('td', { class: 'count' }, '1'), h('td', {}, 'n/a')),
      ...types.map((k) => h('tr', { class: focus === k.id ? 'focus' : '', tabindex: '0', 'data-pad': '', 'data-id': k.id,
        onfocus: () => { if (focus !== k.id) { focus = k.id; paintDetail(); } },
        onpad: (e) => bump(k.id, e.detail === 'left' ? -1 : 1),
        onmouseenter: () => { focus = k.id; paintDetail(); }, onclick: () => { focus = k.id; paint(); } },
        h('td', {}, L(k.name),
          h('div', { class: 'muted small cost-inline' }, `${k.cost} ${t('muster.pts')}`),
          k.faction !== side.faction ? h('div', { class: 'muted small' }, t('muster.ally', { f: L(d.factions[k.faction].name) })) : null),
        h('td', {}, `${k.cost} ${t('muster.pts')}`),
        h('td', { class: 'count' },
          h('button', { class: 'step', 'aria-label': t('muster.less'), onclick: (e) => { e.stopPropagation(); bump(k.id, -1); } }, '−'),
          h('span', {}, S.counts[k.id] ?? 0),
          h('button', { class: 'step', 'aria-label': t('muster.more'), onclick: (e) => { e.stopPropagation(); bump(k.id, 1); } }, '+')),
        h('td', {}, `${(S.counts[k.id] ?? 0) * k.cost} ${t('muster.pts')}`))));
    totalEl.replaceChildren(
      h('td', { colspan: '2' }, t('muster.total'), ' ', h('span', { class: 'muted small' }, t('muster.budgetOf', { n: side.budget }))),
      h('td', { class: 'muted small' }, t('muster.companies', { n: rosterSize(S.counts) + 1, max: side.maxUnits })),
      h('td', {}, h('b', {}, `${spent} ${t('muster.pts')}`)));
    const err = validateRoster(d, side, S.counts);
    next.disabled = !!err;
    next.textContent = `${t('ui.continue')} ›`;
    errEl.textContent = err ? t(`muster.err.${err}`) : '';
    refreshTroops();
    paintDetail();
    if (keep) { const el = rows.querySelector(`[data-id="${keep}"]`); if (el) { el.classList.add('pad-focus'); el.focus(); } }
  }

  app.replaceChildren(h('div', { class: 'screen frame' },
    h('div', { class: 'hero' }, top.el, tag(t('muster.title')),
      h('div', { class: 'hero-over' }, h('div', { class: 'row end' }, langToggle(rerender)))),
    h('div', { class: 'ground' },
      h('div', { class: 'two-col muster-cols' },
        detail,
        h('div', { class: 'dark-panel' },
          h('table', { class: 'muster' },
            h('thead', {}, h('tr', {}, h('th', {}, t('muster.unit')), h('th', {}, t('muster.value')), h('th', {}, t('muster.count')), h('th', {}, t('muster.points')))),
            rows,
            h('tfoot', {}, totalEl)),
          errEl)),
      h('div', { class: 'row spread' },
        h('button', { class: 'ghost dark', 'data-back': true, onclick: onBack }, t('ui.back')),
        h('div', { class: 'row' },
          h('button', { class: 'ghost dark', onclick: () => { S.counts = { ...side.suggested }; S.placements = null; paint(); } }, t('muster.suggested')),
          next)))));
  paint();
  return { destroy: top.stop };
}

// ---------------------------------------------------------------------------

export function resultsScreen(app, S, { onAgain, onTitle, rerender }) {
  const b = S.battle;
  const sc = S.scenario;
  const d = S.data;
  const r = b.result;
  const outcome = r.winner === 'player' ? 'won' : r.winner ? 'lost' : 'draw';

  // The field as the battle left it, in grey mist.
  const squads = b.units.filter((u) => b.onBoard(u)).map((u) => ({
    ...viewSquad(d, { id: u.id, type: u.type, side: u.side, faction: b.sides[u.side].factionId, x: u.x, y: u.y, facing: u.facing, hp: u.hp }),
    status: u.status, hidden: false,
  }));
  const top = hero(b.grid, squads, { sky: 'grey', height: 440, horizon: 0.58 });

  const stats = S.stats ?? { player: {}, enemy: {} };
  const mine = b.summary('player');
  const rank = battleRank(outcome, mine, r, b);
  const side = (id) => {
    const s = b.summary(id);
    const f = d.factions[b.sides[id].factionId];
    const st = stats[id] ?? {};
    const men = b.units.filter((u) => u.side === id && u.status === 'ok' && !b.isWagon(u)).reduce((a, u) => a + u.hp * MEN_PER_POINT, 0);
    // Every stat for both sides, in the same order, so the two columns line
    // up; a side without wagons shows a dash on the wagon rows.
    const wagons = b.units.some((u) => b.isWagon(u));
    const rows = [
      ['res.lost', s.dead], ['res.routed', s.routed],
      ['res.taunts', st.taunts ?? 0], ['res.charges', st.charges ?? 0],
      ['res.melee', st.melee ?? 0], ['res.missiles', st.missiles ?? 0],
      ['res.ambushes', st.ambushes ?? 0], ['res.shieldWalls', st.shieldWalls ?? 0],
      ...(wagons ? [['res.escaped', s.wagons ? s.escaped : '—'], ['res.captured', s.wagons ? s.captured : '—']] : []),
      ['res.leader', t(`res.leader.${s.leader ?? 'none'}`)],
    ];
    return {
      rows,
      colour: lighten(f.color),
      head: h('div', { class: `sb-side ${id}` }, roundel(d, b.sides[id].factionId, 46),
        h('div', {}, h('div', { class: 'sb-name', style: { color: lighten(f.color) } }, L(f.name)), h('div', { class: 'sb-men' }, `⚔ ${men.toLocaleString()}`))),
    };
  };
  const P = side('player'), E = side('enemy');
  const morale = (id) => {
    const us = b.units.filter((u) => u.side === id && u.status === 'ok' && !b.isWagon(u));
    return us.length ? Math.round(us.reduce((a, u) => a + (u.morale / u.maxMorale) * 100, 0) / us.length) : 0;
  };

  app.replaceChildren(h('div', { class: 'screen frame' },
    h('div', { class: 'hero' }, top.el,
      h('div', { class: 'hero-over result-over' },
        h('div', { class: 'row end' }, langToggle(rerender)),
        h('div', { class: 'you-are' }, t(`res.youAre.${outcome}`)),
        h('h1', { class: `outcome ${outcome}` }, t(`res.outcome.${outcome}`)),
        h('div', { class: 'rank' }, `${t('res.rank')} : ${t(`rank.${rank}`)}`))),
    h('div', { class: 'ground' },
      h('div', { class: 'dark-panel results' },
        h('div', { class: 'scoreboard' }, P.head,
          h('div', { class: 'sb-mid' }, h('div', { class: 'sb-label' }, t('battle.morale')),
            h('div', { class: 'sb-morale' }, h('span', { class: 'morale-num' }, morale('player')), h('span', { class: 'sep' }, '|'), h('span', { class: 'morale-num' }, morale('enemy'))),
            h('div', { class: 'sb-turn' }, reasonText(sc, r, outcome))),
          E.head),
        // One table, both sides on each row, so the lines match exactly.
        h('table', { class: 'res-table' }, h('tbody', {}, P.rows.map(([key, pv], i) => h('tr', {},
          h('td', { class: 'num', style: { color: P.colour } }, String(pv)),
          h('td', { class: 'stat' }, t(key)),
          h('td', { class: 'num', style: { color: E.colour } }, String(E.rows[i][1]))))))),
      sc.custom ? null : h('section', { class: 'dark-panel history' },
        h('h2', {}, t('res.history')),
        h('p', {}, L(sc.historicalNote)),
        sc.legendNote ? h('p', { class: 'legend-note' }, L(sc.legendNote)) : null,
        h('h4', {}, t('res.sources')),
        h('ul', { class: 'sources' }, sc.sources.map((x) => h('li', {}, L(x)))),
        h('p', { class: 'fine' }, t('res.seed', { seed: b.seed }))),
      h('div', { class: 'row center' },
        h('button', { class: 'ghost dark', onclick: onTitle }, `${t('res.title')} ✕`),
        h('button', { class: 'go-btn', onclick: onAgain }, `${t('res.again')} ›`)))));
  return { destroy: top.stop };
}

// A scenario may word its own endings; otherwise the generic line is used.
function reasonText(sc, r, outcome) {
  const key = outcome === 'won' ? 'won' : 'lost';
  const own = sc.results?.[r.reason]?.[key];
  return own ? L(own) : t(`reason.${r.reason}.${key}`, { turn: r.turn });
}

function battleRank(outcome, mine, r, b) {
  if (outcome !== 'won') return b.sides.enemy.convoy.captured > 0 ? 'raider' : 'shepherd';
  const lost = mine.dead + mine.routed;
  if (lost === 0) return 'king';
  if (lost <= 2) return 'lord';
  return 'chief';
}

// Faction colours are chosen for shields on a bright sky; on the dark ground
// panels the text needs a lift.
export function lighten(hex) {
  const n = parseInt(hex.slice(1), 16);
  const c = (s) => Math.min(255, Math.round(((n >> s) & 255) * 0.6 + 255 * 0.4));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

export function helpDialog() {
  const sections = ['turns', 'orders', 'ground', 'hidden', 'formations', 'morale', 'taunts'];
  const dlg = h('dialog', { class: 'help' },
    h('h2', {}, t('help.title')),
    sections.map((s) => h('section', {}, h('h4', {}, t(`help.${s}.h`)), h('p', {}, t(`help.${s}.p`)))),
    h('h4', {}, t('help.keys.h')),
    h('p', { class: 'small' }, t('help.keys.p')),
    h('div', { class: 'row end' }, h('button', { class: 'go-btn', 'data-back': true, onclick: () => dlg.close() }, t('ui.close'))));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

// ---------------------------------------------------------------------------
// Custom battle: choose both peoples, the field and the war chest.

export function customScreen(app, S, { onBack, onNext, rerender }) {
  const d = S.data;
  const peoples = Object.keys(d.factions);
  const bases = [FIELD_MAP, ...['covadonga', 'roncesvalles', 'simancas', 'las_navas'].map((id) => S.scenarios[id]).filter(Boolean)];
  const c = (S.customChoice ??= { player: 'vascones', enemy: 'franks', base: 'field', budget: 700, hidden: true });
  const top = hero(meadow(12, 2), [], { height: 300 });

  const peoplePicker = (key) => h('div', { class: 'picker' }, peoples.map((id) => h('button', {
    class: `pick ${c[key] === id ? 'active' : ''}`,
    'aria-pressed': c[key] === id ? 'true' : 'false',
    onclick: () => { c[key] = id; paint(); },
  }, roundel(d, id, 34), h('span', {}, L(d.factions[id].name)))));

  const body = h('div');
  function paint() {
    const base = bases.find((b) => b.id === c.base) ?? bases[0];
    body.replaceChildren(
      h('div', { class: 'two-col' },
        h('div', { class: 'dark-panel' }, h('h3', {}, t('custom.you')), peoplePicker('player')),
        h('div', { class: 'dark-panel' }, h('h3', {}, t('custom.them')), peoplePicker('enemy'))),
      h('div', { class: 'dark-panel' },
        h('h3', {}, t('custom.field')),
        h('div', { class: 'picker fields' }, bases.map((b) => h('button', {
          class: `pick ${c.base === b.id ? 'active' : ''}`,
          'aria-pressed': c.base === b.id ? 'true' : 'false',
          onclick: () => { c.base = b.id; paint(); },
        }, h('span', {}, L(b.title)), b.year ? h('span', { class: 'muted small' }, ` ${b.year}`) : null))),
        h('p', { class: 'muted small' }, b_desc(base))),
      h('div', { class: 'dark-panel' },
        h('h3', {}, t('custom.chest')),
        h('div', { class: 'row' },
          h('input', { type: 'range', min: '400', max: '1400', step: '50', value: String(c.budget), 'aria-label': t('custom.chest'),
            oninput: (e) => { c.budget = Number(e.target.value); chest.textContent = `${c.budget} ${t('muster.pts')}`; } }),
          (chest = h('strong', {}, `${c.budget} ${t('muster.pts')}`))),
        h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: c.hidden, onchange: (e) => { c.hidden = e.target.checked; } }),
          ' ', t('custom.hidden'))),
      h('div', { class: 'row spread' },
        h('button', { class: 'ghost dark', 'data-back': true, onclick: onBack }, t('ui.back')),
        h('button', { class: 'go-btn', onclick: go }, `${t('ui.continue')} ›`)));
  }
  let chest;
  const b_desc = (base) => (base.desc ? L(base.desc) : L(base.place));
  function go() {
    const base = bases.find((b) => b.id === c.base) ?? bases[0];
    S.scenario = customScenario(d, d.rules, { base, player: c.player, enemy: c.enemy, budget: c.budget, hidden: c.hidden });
    S.counts = null;
    S.placements = null;
    onNext();
  }

  app.replaceChildren(h('div', { class: 'screen frame' },
    h('div', { class: 'hero' }, top.el, tag(t('title.custom')),
      h('div', { class: 'hero-over' }, h('div', { class: 'row end' }, langToggle(rerender)))),
    h('div', { class: 'ground' }, body)));
  paint();
  return { destroy: top.stop };
}

// ---------------------------------------------------------------------------
// Homage: the game this one learned from.

export function homageScreen(app, S, { onBack, rerender }) {
  const d = S.data;
  const grid = { w: 12, h: 2, at: () => ({ height: 0, forest: false }) };
  const squads = [
    viewSquad(d, { id: 'h1', type: 'fra_spearmen', side: 'enemy', faction: 'franks', x: 3.2, y: 1, facing: 1 }),
    viewSquad(d, { id: 'h2', type: 'vas_warriors', side: 'player', faction: 'vascones', x: 8.8, y: 1, facing: -1 }),
  ];
  const top = hero(grid, squads, { height: 300 });
  const points = ['orders', 'taunts', 'archery', 'walls', 'morale', 'look'];
  app.replaceChildren(h('div', { class: 'screen frame' },
    h('div', { class: 'hero' }, top.el, tag(t('homage.title')),
      h('div', { class: 'hero-over' }, h('div', { class: 'row end' }, langToggle(rerender)))),
    h('div', { class: 'ground' },
      h('div', { class: 'dark-panel homage' },
        h('h2', {}, t('homage.heading')),
        h('p', { class: 'lead' }, t('homage.intro')),
        h('h3', {}, t('homage.borrowed')),
        h('ul', {}, points.map((k) => h('li', {}, h('b', {}, t(`homage.${k}.h`)), ' ', t(`homage.${k}.p`)))),
        h('p', {}, t('homage.own')),
        h('p', { class: 'muted' }, t('homage.thanks'))),
      h('div', { class: 'row' }, h('button', { class: 'ghost dark', 'data-back': true, onclick: onBack }, t('ui.back'))))));
  return { destroy: top.stop };
}
