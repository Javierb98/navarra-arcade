// Deployment and battle screens: the two that use the board.

import { h } from './dom.js';
import { t, tn, L } from './i18n.js';
import { Board, viewUnit } from './board.js';
import { Scene } from './scene.js';
import { emblemSVG } from './emblems.js';
import { MEN_PER_POINT } from './tableau.js';
import { aimVolley } from './archery.js';
import { chargeGame, fightGame, warCryGame } from './minigames.js';
import { navigate, mark } from './padnav.js';
import { lighten } from './screens.js';
import { playEvents, syncView, unitLabel, nameTag } from './playback.js';
import { Grid, manhattan } from '../core/grid.js';
import { Battle } from '../core/battle.js';
import { planTurn } from '../core/ai.js';
import { deployCells, autoDeploy, canStand, rosterList } from '../core/army.js';

const ORDER_COLOURS = {
  move: 'rgba(255,248,230,0.9)',
  attack: '#c8402c',
  shoot: '#e07a2a',
  rock: '#6b5b45',
  taunt: '#e6b534',
  rally: '#e6b534',
};

function statLine(data, kind) {
  const parts = [`${t('stat.attack')} ${kind.attack}`, `${t('stat.defence')} ${kind.defence}`, `${t('stat.moves')} ${kind.moves}`];
  if ((kind.range ?? 1) > 1) parts.push(`${t('stat.range')} ${kind.range}`);
  return parts.join(' · ');
}


// The 1066 scoreboard: roundel, army name and men on each side, turn and
// morale in the middle.
function scoreboard(S, sides) {
  const d = S.data;
  const el = h('div', { class: 'scoreboard' });
  const cols = {};
  for (const side of ['player', 'enemy']) {
    const f = d.factions[sides[side]];
    cols[side] = { men: h('span', { class: 'men' }), morale: h('span', { class: 'morale-num' }) };
    el.append(h('div', { class: `sb-side ${side}` },
      h('span', { class: 'emblem-wrap', html: emblemSVG(f.emblem, f.emblemField ?? f.color, 46) }),
      h('div', {},
        h('div', { class: 'sb-name', style: { color: lighten(f.color) } }, L(f.name)),
        h('div', { class: 'sb-men' }, '⚔ ', cols[side].men))));
    if (side === 'player') el.append(h('div', { class: 'sb-mid' }));
  }
  const mid = el.querySelector('.sb-mid');
  const turn = h('div', { class: 'sb-turn' });
  const extra = h('div', { class: 'sb-extra' });
  mid.append(h('div', { class: 'sb-label' }, t('battle.morale')), h('div', { class: 'sb-morale' }, cols.player.morale, h('span', { class: 'sep' }, '|'), cols.enemy.morale), turn, extra);
  return {
    el,
    update(unitIter, { turnText, extraText }) {
      const units = [...unitIter];
      for (const side of ['player', 'enemy']) {
        const mine = units.filter((u) => u.side === side && !u.gone && u.status === 'ok' && u.role !== 'wagon');
        const men = mine.reduce((a, u) => a + u.hp * MEN_PER_POINT, 0);
        const mor = mine.length ? Math.round(mine.reduce((a, u) => a + (u.morale / u.maxMorale) * 100, 0) / mine.length) : 0;
        cols[side].men.textContent = men.toLocaleString();
        cols[side].morale.textContent = mor;
      }
      turn.textContent = turnText ?? '';
      extra.textContent = extraText ?? '';
    },
  };
}

function stage(board, scene, sb, ...below) {
  const wrap = h('div', { class: 'scene-wrap' }, scene.canvas);
  const scroll = h('div', { class: 'grid-scroll' }, board.canvas);
  // On a phone both the battlefield and the grid scroll sideways; keep them
  // in step so the soldiers above are the squares below.
  let lock = false;
  const link = (from, to) => from.addEventListener('scroll', () => {
    if (lock) return;
    lock = true;
    const f = from.scrollWidth - from.clientWidth, g = to.scrollWidth - to.clientWidth;
    to.scrollLeft = f > 0 ? (from.scrollLeft / f) * g : 0;
    requestAnimationFrame(() => { lock = false; });
  }, { passive: true });
  link(scroll, wrap);
  link(wrap, scroll);
  // A minigame opens over the battlefield: bring it back to the start.
  new MutationObserver(() => { if (wrap.querySelector('.aim-overlay')) wrap.scrollLeft = 0; }).observe(wrap, { childList: true });
  return h('div', { class: 'stage' }, wrap, sb.el, h('div', { class: 'grid-frame' }, scroll), ...below);
}

// ---------------------------------------------------------------------------
// Deployment

export function deployScreen(app, S, { onBack, onBegin }) {
  const { data, scenario } = S;
  const side = scenario.sides.player;
  const grid = new Grid(scenario.map.rows, data.rules.terrain);
  const zone = deployCells(grid, side);
  const zoneKeys = new Set(zone.map((c) => grid.key(c.x, c.y)));
  const roster = rosterList(side, S.counts).map((spec, i) => ({ ...spec, slot: i }));
  // Placement per roster slot: {x, y} or null.
  const placed = S.placements && S.placements.length === roster.length ? S.placements.map((p) => (p ? { ...p } : null)) : roster.map(() => null);
  let selected = placed.findIndex((p) => !p);

  const board = new Board(grid, { cell: 50, exits: scenario.objective?.exit ?? [] });
  const scene = new Scene(grid, { width: 1200, height: 360 });
  board.scenes.push(scene);
  scene.label = { text: t('deploy.title'), colour: '#2f6b3c' };
  const sb = scoreboard(S, { player: side.faction, enemy: scenario.sides.enemy.faction });
  board.overlay.zone = zone;
  const enemyFaction = scenario.sides.enemy.faction;
  scenario.sides.enemy.units.forEach((u, i) => {
    board.units.set(`e${i}`, viewUnit(data, { ...u, id: `e${i}`, side: 'enemy', facing: scenario.sides.enemy.facing }, enemyFaction));
  });

  const listEl = h('ol', { class: 'roster' });
  const beginBtn = h('button', { class: 'primary', onclick: () => begin() }, t('deploy.begin'));
  const tipEl = h('p', { class: 'tip' });

  function slotAt(x, y) { return placed.findIndex((p) => p && p.x === x && p.y === y); }
  function enemyAt(x, y) { return scenario.sides.enemy.units.some((u) => u.x === x && u.y === y); }

  function sync() {
    for (const k of [...board.units.keys()]) if (k.startsWith('p')) board.units.delete(k);
    roster.forEach((spec, i) => {
      const p = placed[i];
      if (!p) return;
      const hidden = side.ambush && grid.at(p.x, p.y).height + (grid.at(p.x, p.y).forest ? 1 : 0) > 0;
      board.units.set(`p${i}`, viewUnit(data, { ...spec, id: `p${i}`, side: 'player', x: p.x, y: p.y, hidden, facing: side.facing }, side.faction));
    });
    board.overlay.selected = selected >= 0 && placed[selected] ? `p${selected}` : null;
    listEl.replaceChildren(...roster.map((spec, i) => {
      const k = data.units[spec.type];
      return h('li', { class: `${i === selected ? 'sel' : ''} ${placed[i] ? 'done' : ''}`, tabindex: '0', onclick: () => { selected = i; sync(); } },
        h('span', { class: `glyph g-${k.role}` }),
        h('span', { class: 'rname' }, spec.name ? L(spec.name) : L(k.name)),
        h('span', { class: 'rstate' }, placed[i] ? '✓' : '—'));
    }));
    sb.update(board.units.values(), { turnText: t('battle.turn', { n: 0, max: scenario.turnLimit }) });
    const left = placed.filter((p) => !p).length;
    beginBtn.disabled = left > 0;
    tipEl.textContent = left > 0 ? t('deploy.left', { n: left }) : t('deploy.ready');
  }

  board.onCell = ({ x, y }) => {
    const k = grid.key(x, y);
    const here = slotAt(x, y);
    if (selected < 0) {
      if (here >= 0) { selected = here; placed[here] = null; }
      sync();
      return;
    }
    if (here === selected) { placed[here] = null; sync(); return; }
    if (!zoneKeys.has(k) || enemyAt(x, y) || !canStand(data, grid, roster[selected].type, x, y)) {
      board.addFx({ kind: 'text', text: t('deploy.cannot'), x, y, color: '#ffd0c0', size: 13, ms: 900 });
      return;
    }
    if (here >= 0) placed[here] = placed[selected] ? { ...placed[selected] } : null;
    placed[selected] = { x, y };
    selected = placed.findIndex((p) => !p);
    sync();
  };
  board.onRight = () => { selected = -1; sync(); };

  function auto() {
    const out = autoDeploy(data, data.rules, scenario, 'player', roster.map(({ slot, ...s }) => s));
    const used = new Set();
    roster.forEach((spec, i) => {
      const j = out.findIndex((o, n) => !used.has(n) && o.type === spec.type);
      if (j >= 0) { used.add(j); placed[i] = { x: out[j].x, y: out[j].y }; }
    });
    selected = placed.findIndex((p) => !p);
    sync();
  }

  function begin() {
    if (placed.some((p) => !p)) return;
    S.placements = placed;
    board.destroy();
    onBegin(roster.map((spec, i) => ({ type: spec.type, name: spec.name, x: placed[i].x, y: placed[i].y })));
  }

  app.replaceChildren(h('div', { class: 'screen battle-layout' },
    stage(board, scene, sb),
    h('aside', { class: 'panel' },
      h('div', { class: 'row spread' }, h('h2', {}, t('deploy.title')), h('button', { class: 'ghost small', 'data-back': true, onclick: () => { board.destroy(); onBack(); } }, t('ui.back'))),
      h('p', {}, t('deploy.help')),
      h('p', { class: 'note' }, t('deploy.hiddenNote')),
      listEl,
      tipEl,
      h('div', { class: 'row' },
        h('button', { onclick: auto }, t('deploy.auto')),
        h('button', { class: 'ghost', onclick: () => { placed.fill(null); selected = 0; sync(); } }, t('deploy.clear'))),
      beginBtn)));
  sync();

  // Arcade: the stick moves the cursor on the field and A places the chosen
  // company there; C goes to the panel (the roster, Auto, Clear, Begin) and
  // back; START fills any gaps automatically and begins the battle.
  let padZone = 'board';
  const panelEl = () => app.querySelector('aside.panel');
  const toBoard = () => { padZone = 'board'; panelEl()?.classList.remove('pad-zone'); document.activeElement?.blur?.(); if (!board.cursor) board.setCursor(zone0()); };
  const zone0 = () => zone[Math.floor(zone.length / 2)] ?? { x: 0, y: 0 };
  return {
    destroy: () => board.destroy(),
    onKey(e) { if (e.key === 'Enter' && !beginBtn.disabled) begin(); },
    onPad(b) {
      if (b === 'start') { if (placed.some((p) => !p)) auto(); begin(); return true; }
      if (padZone === 'panel') {
        if (b === 'c' || b === 'b') { toBoard(); return true; }
        const r = navigate(panelEl(), b);
        if (b === 'a') toBoard();
        return r;
      }
      if (b === 'c') { padZone = 'panel'; panelEl()?.classList.add('pad-zone'); navigate(panelEl(), 'down'); return true; }
      if (!board.cursor) { board.setCursor(zone0()); if (b !== 'a') return true; }
      const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[b];
      if (d) { board.moveCursor(...d); return true; }
      if (b === 'a') { board.pressCursor(); return true; }
      if (b === 'b') { board.onRight(); return true; }
      return false;
    },
  };
}

// ---------------------------------------------------------------------------
// Battle

// Counters for the results screen, after 1066's end-of-battle table.
function blankStats() { return { taunts: 0, charges: 0, melee: 0, missiles: 0, ambushes: 0, shieldWalls: 0 }; }

function tally(events, battle, stats) {
  for (const e of events) {
    const a = e.a ? battle.byId(e.a) : null;
    if (!a) continue;
    const st = stats[a.side];
    if (e.t === 'taunt') st.taunts++;
    if (e.t === 'strike' && e.mode === 'melee') { st.melee++; if (e.mods.includes('charge')) st.charges++; }
    if (e.t === 'strike' && (e.mode === 'shot' || e.mode === 'rock')) st.missiles++;
    if (e.t === 'strike' && e.ambush) st.ambushes++;
  }
}

// Most shield walls standing at once, per side.
function tallyWalls(battle, stats) {
  for (const side of ['player', 'enemy']) {
    const cols = new Set([...battle.formations(side).walls].map((id) => battle.byId(id).x));
    stats[side].shieldWalls = Math.max(stats[side].shieldWalls, cols.size);
  }
}

export function newBattle(S, placements) {
  S.stats = { player: blankStats(), enemy: blankStats() };
  const { data, scenario } = S;
  S.seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
  return new Battle({
    data, scenario, seed: S.seed,
    armies: {
      player: { faction: scenario.sides.player.faction, units: placements },
      enemy: { faction: scenario.sides.enemy.faction, units: scenario.sides.enemy.units },
    },
  });
}

export function battleScreen(app, S, { onEnd, onHelp }) {
  const { data, scenario } = S;
  const battle = S.battle;
  const board = new Board(battle.grid, { cell: 50, exits: scenario.objective?.exit ?? [] });
  const pCol = data.factions[battle.sides.player.factionId].color, eCol = data.factions[battle.sides.enemy.factionId].color;
  board.edges = battle.sides.player.facing > 0 ? { left: pCol, right: eCol } : { left: eCol, right: pCol };
  const scene = new Scene(battle.grid, { width: 1200, height: 360 });
  board.scenes.push(scene);
  const sb = scoreboard(S, { player: battle.sides.player.factionId, enemy: battle.sides.enemy.factionId });
  // ?debug exposes the live battle to the console (and to test harnesses).
  if (new URLSearchParams(location.search).has('debug')) window.__battle = battle;
  for (const u of battle.units) board.units.set(u.id, viewUnit(data, u, battle.sides[u.side].factionId));

  // sel: selected company ids. One is a single company; several are a
  // formation (the first is the lead, which goes where you click).
  let sel = [];
  let mode = null; // 'taunt' | 'rock' | 'raid' | 'wall' | 'vee'
  let padZone = 'board'; // where the arcade stick is: the field or the orders panel
  let busy = false;
  let hover = null;

  const panelEl = h('div', { class: 'unit-panel' });
  const armyEl = h('ol', { class: 'army' });
  const logEl = h('div', { class: 'log', 'aria-live': 'polite' });
  const goBtn = h('button', { class: 'go execute', onclick: () => execute() }, t('battle.execute'));
  const speedBtn = h('button', { class: 'ghost', onclick: () => { S.speed = S.speed === 1 ? 2.5 : S.speed === 2.5 ? 0 : 1; paintSpeed(); } });
  const paintSpeed = () => { speedBtn.textContent = `${t('battle.speed')}: ${S.speed === 1 ? '1×' : S.speed === 2.5 ? '2×' : t('battle.instant')}`; };
  paintSpeed();
  const aimBtn = h('button', { class: 'ghost', title: t('aim.toggleHint'), onclick: () => { S.autoAim = !S.autoAim; paintAim(); } });
  const paintAim = () => { aimBtn.textContent = S.autoAim ? t('aim.autoOn') : t('aim.manualOn'); };
  paintAim();

  // Shown in the chronicle and the console, so a problem can be reported
  // instead of silently stopping the game.
  const reportError = (err) => {
    console.error(err);
    log(h('span', {}, `${t('ui.error')}: ${err?.message ?? err}`), 'bad');
  };

  const log = (node, cls) => {
    logEl.append(h('p', { class: cls ?? '' }, node));
    while (logEl.childElementCount > 250) logEl.firstChild.remove();
    logEl.scrollTop = logEl.scrollHeight;
  };
  const say = (text, x, y, colour = '#ffd0c0') => board.addFx({ kind: 'text', text, x, y, color: colour, size: 14, ms: 1200 });

  const me = (u) => u && u.side === 'player';
  const unit = (id) => battle.byId(id);
  const single = () => (sel.length === 1 ? unit(sel[0]) : null);
  const group = () => (sel.length > 1 ? sel.map(unit).filter((u) => u && u.status === 'ok') : null);
  const inList = (list, id) => list.some((e) => (e.target ?? e).id === id);

  // ---- formations ----------------------------------------------------------

  // The formation a company stands in, if any: its shield wall column or its V.
  function formationOf(u) {
    if (battle.inShieldWall(u)) {
      const run = [u];
      const member = (y) => { const o = battle.unitAt(u.x, y); return o && o.side === u.side && battle.inShieldWall(o) ? o : null; };
      for (let y = u.y - 1, o; (o = member(y)); y--) run.unshift(o);
      for (let y = u.y + 1, o; (o = member(y)); y++) run.push(o);
      return { kind: 'wall', members: run };
    }
    for (const [tipId, f] of battle.formations(u.side).wedges) {
      const tip = unit(tipId);
      const wings = [battle.unitAt(tip.x - f, tip.y - 1), battle.unitAt(tip.x - f, tip.y + 1)];
      const members = [tip, ...wings];
      if (members.includes(u)) return { kind: 'vee', members };
    }
    return null;
  }

  function describeGroup(units) {
    if (units.length === 3) {
      const f = formationOf(units[0]);
      if (f && f.members.length === units.length && f.members.every((m) => units.includes(m))) return f.kind;
    }
    if (units.length >= 3 && units.every((u) => battle.inShieldWall(u))) return 'wall';
    return 'loose';
  }

  // Direction the enemy lies in from x: the way a V should point.
  function enemyward(x) {
    const foes = battle.units.filter((e) => e.side !== 'player' && battle.onBoard(e) && battle.visibleTo('player', e));
    if (!foes.length) return battle.sides.player.facing;
    const cx = foes.reduce((a, e) => a + e.x, 0) / foes.length;
    return Math.sign(cx - x) || battle.sides.player.facing;
  }

  // Send `units` to `cells` (same length), pairing each cell with the nearest
  // company. Returns an error key, or null once the orders are set.
  function orderFormation(units, cells) {
    const ids = new Set(units.map((u) => u.id));
    const left = [...units];
    const plan = [];
    for (const c of cells) {
      if (!battle.grid.inside(c.x, c.y)) return 'form.noRoom';
      left.sort((a, b) => manhattan(a, c) - manhattan(b, c));
      const u = left.shift();
      plan.push({ u, c });
    }
    const list = [];
    for (const { u, c } of plan) {
      if (u.x === c.x && u.y === c.y) { list.push({ id: u.id, order: { type: 'hold' } }); continue; }
      const node = battle.reachable(u, ids).get(battle.grid.key(c.x, c.y));
      if (!node) return battle.unitAt(c.x, c.y) && !ids.has(battle.unitAt(c.x, c.y).id) ? 'form.noRoom' : 'form.tooFar';
      list.push({ id: u.id, order: { type: 'move', path: battle.pathOf(node) } });
    }
    const moving = list.filter((x) => x.order.type === 'move');
    for (const x of list) if (x.order.type === 'hold') battle.setOrder(x.id, { type: 'hold' });
    if (moving.length) battle.setGroupOrders(moving);
    return null;
  }

  function formationCells(kind, units, anchor) {
    if (kind === 'wall') {
      const n = units.length;
      const top = anchor.y - Math.floor((n - 1) / 2);
      return units.map((_, i) => ({ x: anchor.x, y: top + i }));
    }
    if (kind === 'vee') {
      const f = enemyward(anchor.x);
      return [anchor, { x: anchor.x - f, y: anchor.y - 1 }, { x: anchor.x - f, y: anchor.y + 1 }];
    }
    const lead = units[0];
    return units.map((u) => ({ x: anchor.x + (u.x - lead.x), y: anchor.y + (u.y - lead.y) }));
  }

  function canForm(kind, units) {
    if (kind === 'wall') return units.length >= 3 && units.length <= battle.grid.h && units.every((u) => battle.has(u, 'shieldwall'));
    if (kind === 'vee') {
      if (units.length !== 3) return false;
      const arm = (u) => (battle.isCavalry(u) ? 'horse' : u.kind.role === 'infantry' ? 'foot' : null);
      return arm(units[0]) && units.every((u) => arm(u) === arm(units[0]));
    }
    return true;
  }

  // ---- drawing the plan ----------------------------------------------------

  function orderPath(u, o) {
    if (o.type === 'move') return [{ x: u.x, y: u.y }, ...o.path];
    const tgt = o.targetId ? unit(o.targetId) : null;
    if (o.type === 'attack') {
      const p = [{ x: u.x, y: u.y }, ...(o.path ?? [])];
      return tgt ? [...p, { x: tgt.x, y: tgt.y }] : p;
    }
    if (o.type === 'shoot' && o.path?.length && tgt) return [{ x: u.x, y: u.y }, ...o.path, { x: tgt.x, y: tgt.y }];
    if (['shoot', 'taunt', 'rock'].includes(o.type)) return tgt ? [{ x: u.x, y: u.y }, { x: tgt.x, y: tgt.y }] : null;
    return null;
  }

  // Position of each player order in the queue (formations share a number).
  function sequence() {
    const seq = new Map();
    const groups = new Map();
    let n = 0;
    for (const [id, o] of battle.orders) {
      const u = unit(id);
      if (!me(u)) continue;
      if (o.group != null) {
        if (!groups.has(o.group)) groups.set(o.group, ++n);
        seq.set(id, groups.get(o.group));
      } else seq.set(id, ++n);
    }
    return seq;
  }

  function refresh() {
    const o = board.overlay;
    o.reach = []; o.rings = []; o.arrows = [];
    const f = battle.formations('player');
    const fe = battle.formations('enemy');
    o.walls = new Set([...f.walls, ...fe.walls]);
    o.wedges = new Map([...f.wedges, ...fe.wedges]);
    o.selected = sel.length === 1 ? sel[0] : null;
    o.group = sel.length > 1 ? new Set(sel) : null;
    o.sequence = busy ? null : sequence();

    for (const u of battle.units) {
      if (!me(u) || u.status !== 'ok') continue;
      const ord = battle.orders.get(u.id);
      if (!ord) continue;
      if (ord.type === 'rally' || ord.type === 'taunt') { o.rings.push({ x: u.x, y: u.y, color: ORDER_COLOURS[ord.type], dash: [5, 4] }); continue; }
      const path = orderPath(u, ord);
      if (path) o.arrows.push({ path, color: ORDER_COLOURS[ord.type], width: sel.includes(u.id) ? 4 : 2.5, dash: ['shoot', 'taunt'].includes(ord.type) ? [6, 5] : null });
    }

    const u = !busy && single();
    if (u && u.status === 'ok') {
      const op = battle.options(u);
      if (!mode) {
        // A missile company's fire lane: its row, out to how far it can throw.
        if (battle.rangeOf(u) > 1) {
          const reach = Math.floor(battle.throwReach(u));
          for (let x = 0; x < battle.grid.w; x++) {
            const d = Math.abs(x - u.x);
            if (d >= 2 && d <= reach) o.reach.push({ x, y: u.y, color: 'rgba(224,122,42,0.16)' });
          }
        }
        for (const n of op.reach.values()) if (n.cost > 0) o.reach.push({ x: n.x, y: n.y });
        // Missile troops throw by default, so their throwing targets take precedence.
        for (const { target } of op.shots) o.rings.push({ x: target.x, y: target.y, color: '#e07a2a', dash: [6, 4] });
        for (const { target } of op.melee) if (!inList(op.shots, target.id)) o.rings.push({ x: target.x, y: target.y, color: '#c8402c' });
      } else {
        const list = mode === 'rock' ? op.rocks : op.melee.map((m) => m.target);
        for (const tg of list) o.rings.push({ x: tg.x, y: tg.y, color: mode === 'rock' ? '#a08a6a' : '#c8402c' });
      }
    }
    const g = !busy && group();
    if (g && hover && (mode === 'wall' || mode === 'vee' || !mode)) {
      // Ghost of where the formation would stand.
      const kind = mode ?? 'loose';
      if (canForm(kind, g)) {
        for (const c of formationCells(kind, g, hover)) if (battle.grid.inside(c.x, c.y)) o.reach.push({ x: c.x, y: c.y, color: 'rgba(230,181,52,0.25)' });
      }
    }

    const rocks = battle.sides.player.rocks;
    sb.update(board.units.values(), {
      turnText: t('battle.turn', { n: battle.turn, max: battle.turnLimit }),
      extraText: rocks > 0 ? t('battle.rocks', { n: rocks }) : '',
    });
    if (!busy) scene.label = battle.result ? null : { text: t('phase.orders'), colour: '#2f6b3c' };
    goBtn.disabled = busy || !!battle.result;
    paintPanel();
    paintArmy();
  }

  function orderText(u) {
    const o = battle.orders.get(u.id);
    if (!o) return t('order.hold');
    const tg = o.targetId ? unit(o.targetId) : null;
    const base = t(`order.${o.type}`, { d: tg ? unitLabel(tg) : '' }) + (o.type === 'attack' && o.withdraw ? ` ${t('order.withdrawSuffix')}` : '');
    return o.group != null ? `${base} ${t('order.inFormation')}` : base;
  }

  function meter(label, v, max, cls) {
    return h('div', { class: 'meter' },
      h('span', {}, label),
      h('span', { class: `track ${cls}` }, h('span', { style: { width: `${Math.max(0, (v / max) * 100)}%` } })),
      h('span', { class: 'num' }, `${v}/${max}`));
  }

  function unitCard(u) {
    const k = u.kind;
    const faction = battle.sides[u.side].faction;
    const terr = battle.grid.at(u.x, u.y);
    const tags = [];
    if (u.hidden) tags.push(t('tag.hidden'));
    if (u.status === 'ok' && !battle.isWagon(u) && !battle.isLeader(u)) tags.push(t(`tag.command.${battle.command(u)}`));
    if (u.status === 'routing') tags.push(t('tag.routing'));
    if (battle.inShieldWall(u)) tags.push(t('tag.shieldWall'));
    const form = formationOf(u);
    if (form?.kind === 'vee') tags.push(battle.isWedgeTip(u) ? t('tag.wedge') : t('tag.veeWing'));
    if (battle.isGuarded(u)) tags.push(t('tag.guarded'));
    if (u.status === 'ok' && !battle.isWagon(u)) {
      const foes = battle.foesOf(u).filter((e) => e.status === 'ok' && manhattan(e, u) === 1).length;
      const friends = battle.friendsOf(u).filter((f) => f.status === 'ok' && !battle.isWagon(f) && manhattan(f, u) === 1).length;
      if (foes >= 2 && foes > friends) tags.push(t('tag.outnumbered'));
      if (u.hp / u.maxHp < 0.4) tags.push(t('tag.battered'));
    }
    if (k.tags.includes('hitAndRun')) tags.push(t('tag.hitAndRun'));
    const parts = [`${t('stat.attack')} ${k.attack}`, `${t('stat.defence')} ${k.defence}`, `${t('stat.moves')} ${k.moves}`];
    if ((k.range ?? 1) > 1) parts.push(`${t('stat.missile')} ${k.missile ?? k.attack}`, `${t('stat.range')} ${Math.floor(battle.throwReach(u))}`);
    return h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('span', { class: 'chip', style: { background: faction.color } }), h('strong', {}, unitLabel(u))),
      h('div', { class: 'muted small' }, L(faction.name)),
      h('div', { class: 'muted' }, `${t(`role.${k.role}`)} — ${parts.join(' · ')}`),
      meter(t('stat.strength'), u.hp, u.maxHp, 'hp'),
      k.role !== 'wagon' ? meter(t('stat.morale'), Math.round(u.morale), u.maxMorale, 'mo') : null,
      h('div', { class: 'muted' }, `${t('stat.ground')}: ${t(`terrain.${terr.key}`)}`),
      tags.length ? h('div', { class: 'tags' }, tags.map((x) => h('span', { class: 'tag' }, x))) : null);
  }

  function preview(u, tgt) {
    const op = battle.options(u);
    let m2 = null, cell = u;
    if (mode === 'rock') m2 = inList(op.rocks, tgt.id) ? 'rock' : null;
    else if (mode !== 'raid' && inList(op.shots, tgt.id)) { m2 = 'shot'; cell = op.shots.find((e) => e.target.id === tgt.id).via; }
    else { const m = op.melee.find((e) => e.target.id === tgt.id); if (m) { m2 = 'melee'; cell = m.via; } }
    if (!m2) return h('p', { class: 'muted' }, t('battle.outOfReach'));
    const p = battle.preview(u, tgt, m2, cell);
    const mods = p.mods.filter((x) => x !== 'rock').map((x) => t(`mod.${x}`)).join(', ');
    return h('div', { class: 'preview' },
      h('div', {}, t('battle.expect', { dmg: Math.round(p.damage), hp: tgt.hp })),
      p.counter ? h('div', {}, t('battle.expectCounter', { n: Math.round(p.counter) })) : null,
      mods ? h('div', { class: 'muted' }, mods) : null);
  }

  const btn = (label, fn, { on = true, active = false, title } = {}) =>
    h('button', { class: active ? 'active' : '', disabled: !on || busy, title, onclick: fn }, label);
  const toggle = (m) => () => { mode = mode === m ? null : m; refresh(); };

  function paintPanel() {
    const kids = [];
    const u = single();
    const g = group();
    const hu = hover && battle.unitAt(hover.x, hover.y);
    const hoverFoe = hu && !me(hu) && battle.visibleTo('player', hu) ? hu : null;

    if (g) {
      const kind = describeGroup(g);
      kids.push(h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('strong', {}, t(`form.name.${kind}`))),
        h('div', { class: 'muted small' }, t('form.count', { n: g.length })),
        h('ul', { class: 'group-list' }, g.map((m, i) => h('li', {}, i === 0 ? '★ ' : '', unitLabel(m))))));
      kids.push(h('div', { class: 'actions' },
        btn(t('act.moveFormation'), () => { mode = null; refresh(); }, { active: !mode }),
        btn(t('act.formWall'), toggle('wall'), { on: canForm('wall', g), active: mode === 'wall', title: t('form.wallNeeds') }),
        btn(t('act.formVee'), toggle('vee'), { on: canForm('vee', g), active: mode === 'vee', title: t('form.veeNeeds') }),
        btn(t('act.hold'), () => { for (const m of g) battle.setOrder(m.id, { type: 'hold' }); mode = null; refresh(); })));
      kids.push(h('p', { class: 'hint' }, t(mode === 'wall' ? 'hint.wall' : mode === 'vee' ? 'hint.vee' : 'hint.group')));
    } else if (u) {
      kids.push(unitCard(u));
      if (u.status === 'ok') {
        const op = battle.options(u);
        kids.push(h('div', { class: 'order-now' }, `${t('battle.order')}: `, h('b', {}, orderText(u))));
        const row = [
          btn(t('act.hold'), () => { battle.setOrder(u.id, { type: 'hold' }); mode = null; refresh(); }),
          btn(t('act.taunt'), () => { battle.setOrder(u.id, { type: 'taunt' }); mode = null; refresh(); }, { on: op.taunt, active: battle.orders.get(u.id)?.type === 'taunt', title: t('hint.taunt') }),
        ];
        if (battle.has(u, 'hitAndRun')) row.push(btn(t('act.raid'), toggle('raid'), { on: op.melee.length > 0, active: mode === 'raid', title: t('hint.raid') }));
        if (battle.sides.player.rocks > 0) row.push(btn(t('act.rock', { n: battle.sides.player.rocks }), toggle('rock'), { on: op.rocks.length > 0, active: mode === 'rock' }));
        if (op.rally) row.push(btn(t('act.rally'), () => { battle.setOrder(u.id, { type: 'rally' }); mode = null; refresh(); }));
        kids.push(h('div', { class: 'actions' }, row));
        const form = formationOf(u);
        if (form) {
          kids.push(h('div', { class: 'actions' },
            btn(t(form.kind === 'wall' ? 'act.selectWall' : 'act.selectVee'), () => pickFormation(u), { title: t('hint.leaveFormation') })));
          kids.push(h('p', { class: 'muted small' }, t('hint.leaveFormation')));
        }
        if (mode) kids.push(h('p', { class: 'hint' }, t(`hint.${mode}`)));
        else kids.push(h('p', { class: 'muted small' }, t('hint.shift')));
        if (hoverFoe) kids.push(h('h4', {}, t('battle.against', { d: unitLabel(hoverFoe) })), preview(u, hoverFoe));
      }
    } else if (hu && battle.visibleTo('player', hu)) {
      kids.push(unitCard(hu));
    } else {
      kids.push(h('p', { class: 'muted' }, t('battle.selectHint')));
    }
    panelEl.replaceChildren(...kids);
  }

  function paintArmy() {
    const seq = sequence();
    const mine = battle.units.filter((u) => me(u) && battle.onBoard(u));
    armyEl.replaceChildren(...mine.map((u) => h('li', {
      class: `${sel.includes(u.id) ? 'sel' : ''} ${u.status !== 'ok' ? 'out' : ''} ${battle.orders.has(u.id) ? 'ordered' : ''}`,
      onclick: (e) => { if (u.status === 'ok') { pick(u, e.shiftKey); } },
    },
    h('span', { class: `glyph g-${u.kind.role}` }),
    h('span', { class: 'rname' }, seq.has(u.id) ? h('b', { class: 'seq' }, seq.get(u.id)) : null, unitLabel(u)),
    h('span', { class: 'rstate' }, u.status === 'routing' ? t('tag.routing') : orderText(u)))));
  }

  // ---- input ---------------------------------------------------------------

  // Clicking a company selects just that company, so any company can step
  // out of a shield wall or V at will; shift adds or removes it from the
  // selection. The unit card offers to select its whole formation.
  // Touch screens have no Shift key: the Group button makes taps add to the
  // selection instead.
  let groupTap = false;
  const groupBtn = h('button', { class: 'ghost group-tap', 'aria-pressed': 'false', onclick: () => {
    groupTap = !groupTap;
    groupBtn.classList.toggle('active', groupTap);
    groupBtn.setAttribute('aria-pressed', String(groupTap));
    if (!groupTap && sel.length > 1) refresh();
  } }, t('battle.groupTap'));

  function pick(u, additive) {
    additive = additive || groupTap;
    mode = null;
    if (additive) sel = sel.includes(u.id) ? sel.filter((x) => x !== u.id) : [...sel, u.id];
    else sel = sel.length === 1 && sel[0] === u.id ? [] : [u.id];
    refresh();
  }

  function pickFormation(u) {
    const form = formationOf(u);
    if (!form) return;
    mode = null;
    sel = [u.id, ...form.members.map((m) => m.id).filter((x) => x !== u.id)];
    refresh();
  }

  board.onHover = (c) => { hover = c; if (!busy) { if (group()) refresh(); else paintPanel(); } };
  board.onRight = () => { if (mode) mode = null; else sel = []; refresh(); };
  board.onCell = ({ x, y }, e) => {
    if (busy || battle.result) return;
    const u = battle.unitAt(x, y);
    const seen = u && battle.visibleTo('player', u) ? u : null;

    if (seen && me(seen) && !(group() && (mode === 'wall' || mode === 'vee'))) {
      if (seen.status !== 'ok') { say(t('tag.routing'), x, y, '#fff'); return; }
      pick(seen, e?.shiftKey);
      return;
    }

    const g = group();
    if (g) {
      if (seen && !me(seen)) {
        // The formation falls on one enemy together.
        const list = [];
        for (const m of g) {
          const hit = battle.options(m).melee.find((o) => o.target.id === seen.id);
          if (hit) list.push({ id: m.id, order: { type: 'attack', targetId: seen.id, path: battle.pathOf(hit.via) } });
        }
        if (list.length) battle.setGroupOrders(list); else say(t('battle.outOfReach'), x, y);
        refresh();
        return;
      }
      const kind = mode ?? 'loose';
      if (!canForm(kind, g)) { say(t(kind === 'wall' ? 'form.wallNeeds' : 'form.veeNeeds'), x, y); return; }
      const err = orderFormation(g, formationCells(kind, g, { x, y }));
      if (err) say(t(err), x, y);
      mode = null;
      refresh();
      return;
    }

    const sel1 = single();
    if (!sel1) { refresh(); return; }
    const op = battle.options(sel1);
    if (mode === 'rock') {
      if (seen && inList(op.rocks, seen.id)) battle.setOrder(sel1.id, { type: 'rock', targetId: seen.id });
      mode = null;
      refresh();
      return;
    }
    if (seen) {
      const melee = op.melee.find((m) => m.target.id === seen.id);
      if (mode === 'raid') {
        if (melee) battle.setOrder(sel1.id, { type: 'attack', targetId: seen.id, path: battle.pathOf(melee.via), withdraw: true });
        else say(t('battle.outOfReach'), x, y);
        mode = null;
      } else if (inList(op.shots, seen.id)) {
        const via = op.shots.find((e) => e.target.id === seen.id).via;
        battle.setOrder(sel1.id, via.cost === 0 ? { type: 'shoot', targetId: seen.id } : { type: 'shoot', targetId: seen.id, path: battle.pathOf(via) });
      } else if (melee) {
        battle.setOrder(sel1.id, { type: 'attack', targetId: seen.id, path: battle.pathOf(melee.via) });
      } else say(t('battle.outOfReach'), x, y);
      refresh();
      return;
    }
    mode = null;
    const node = op.reach.get(battle.grid.key(x, y));
    if (node && node.cost > 0) battle.setOrder(sel1.id, { type: 'move', path: battle.pathOf(node) });
    else if (x === sel1.x && y === sel1.y) battle.setOrder(sel1.id, { type: 'hold' });
    else sel = [];
    refresh();
  };

  function nextUnit() {
    const mine = battle.units.filter((u) => me(u) && u.status === 'ok');
    if (!mine.length) return;
    const i = mine.findIndex((u) => u.id === sel[0]);
    const rest = [...mine.slice(i + 1), ...mine.slice(0, i + 1)];
    sel = [(rest.find((u) => !battle.orders.has(u.id)) ?? rest[0]).id];
    mode = null;
    refresh();
  }

  async function execute() {
    if (busy || battle.result) return;
    busy = true; mode = null; sel = []; hover = null;
    refresh();
    planTurn(battle, 'enemy');
    tallyWalls(battle, S.stats);
    // Formation outlines are recomputed after the turn; mid-turn they'd lag.
    board.overlay.arrows = []; board.overlay.rings = []; board.overlay.reach = [];
    board.overlay.walls = new Set(); board.overlay.wedges = new Map(); board.overlay.sequence = null; board.overlay.group = null;
    const names = { player: L(battle.sides.player.faction.name), enemy: L(battle.sides.enemy.faction.name) };
    const phase = (key, colour) => { scene.label = { text: t(key), colour: colour ?? '#3a3226' }; };
    const ctx = {
      board, battle, data, log, phase, speed: () => S.speed,
      onAct: (ids, side) => {
        board.overlay.acting = new Set(ids);
        const first = unit(ids[0]);
        scene.label = { text: `${names[side]} · ${ids.length > 1 ? t('form.formation') : unitLabel(first)}`, colour: side === 'player' ? '#8e2f1c' : '#2f4a7a' };
      },
      onChange: () => sb.update(board.units.values(), { turnText: t('battle.turn', { n: battle.turn, max: battle.turnLimit }) }),
    };
    // The turn plays in chunks; each of our volleys, charges, fights and
    // war cries pauses it for a minigame. Whatever goes wrong while it plays,
    // the turn is always finished in the engine and the board released, so
    // the game can never be left frozen; the error is reported on screen.
    const host = app.querySelector('.scene-wrap');
    const steps = battle.turnSteps({ interactive: ['player'] });
    let r = steps.next();
    try {
      for (;;) {
        tally(r.value.events, battle, S.stats);
        await playEvents(r.value.events, ctx);
        if (r.done) break;
        const req = r.value.request;
        const game = { aim: aimVolley, charge: chargeGame, melee: fightGame, taunt: warCryGame }[req.kind];
        let answer = null;
        if (!S.autoAim && game) {
          try { answer = await game({ host, data, battle, request: req, speed: () => S.speed }); } catch (err) {
            reportError(err);
            host.querySelector('.aim-overlay')?.remove();
          }
        }
        r = steps.next(answer);
      }
    } catch (err) {
      reportError(err);
      host.querySelector('.aim-overlay')?.remove();
      // Finish the turn without animation so the battle stays consistent.
      try { while (!r.done) r = steps.next(null); } catch (err2) { reportError(err2); }
    }
    board.overlay.acting = null;
    syncView(board, battle);
    busy = false;
    refresh();
    if (battle.result) {
      log(h('span', {}, t(`end.${battle.result.winner === 'player' ? 'won' : battle.result.winner ? 'lost' : 'draw'}`)), 'turn');
      setTimeout(() => { board.destroy(); onEnd(); }, S.speed === 0 ? 300 : 1400);
    }
  }

  const obj = scenario.objective;
  app.replaceChildren(h('div', { class: 'screen battle-layout' },
    stage(board, scene, sb,
      h('div', { class: 'go-row' }, goBtn),
      h('p', { class: 'objective' }, obj ? L(obj.text) : ''),
      h('section', { class: 'log-wrap' }, h('h3', {}, t('battle.chronicle')), logEl)),
    h('aside', { class: 'panel' },
      h('div', { class: 'row spread tools' }, speedBtn, aimBtn, groupBtn, h('button', { class: 'ghost', onclick: onHelp, 'aria-label': t('title.howto') }, '?')),
      panelEl,
      h('h3', {}, t('battle.army')),
      armyEl,
      h('p', { class: 'muted small' }, t('battle.sequenceNote')),
      h('div', { class: 'row' }, h('button', { class: 'ghost', onclick: nextUnit }, t('battle.next'))))));

  log(h('span', {}, t(scenario.id === 'roncesvalles' ? 'log.start' : 'log.startGeneric')), 'turn');
  if (battle.omen) {
    log(h('span', {}, t(`log.omen.${battle.omen.type}`, { p: battle.omen.player, e: battle.omen.enemy })), 'alert');
    scene.label = { text: t(`phase.omen.${battle.omen.type}`), colour: '#3a3226' };
  }
  refresh();

  return {
    destroy: () => board.destroy(),
    // Arcade: the stick moves the cursor, A presses the square under it (pick
    // a company, then where it goes or whom it attacks), B cancels, C goes to
    // the orders panel (the stick picks an order, A gives it and returns to
    // the field), START ends the turn.
    onPad(b) {
      if (busy) return b !== null;
      const panel = app.querySelector('aside.panel');
      if (b === 'start') { execute(); return true; }
      if (padZone === 'panel') {
        if (b === 'c' || b === 'b') { padZone = 'board'; panel?.classList.remove('pad-zone'); document.activeElement?.blur?.(); return true; }
        const r = navigate(panel, b);
        if (b === 'a') { padZone = 'board'; panel?.classList.remove('pad-zone'); }
        return r;
      }
      if (b === 'c') {
        // Into the panel, starting on the orders when a company is chosen.
        padZone = 'panel'; panel?.classList.add('pad-zone');
        const first = panel?.querySelector('.actions button:not([disabled])');
        if (first) mark(first); else navigate(panel, 'down');
        return true;
      }
      if (!board.cursor) {
        const first = battle.units.find((x) => me(x) && battle.onBoard(x)) ?? { x: 0, y: 0 };
        board.setCursor({ x: first.x, y: first.y });
        if (b !== 'a') return true;
      }
      const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[b];
      if (d) { board.moveCursor(...d); return true; }
      if (b === 'a') { board.pressCursor(); return true; }
      if (b === 'b') { board.onRight(); return true; }
      return false;
    },
    onKey(e) {
      if (e.key === 'Enter') { e.preventDefault(); execute(); }
      else if (e.key === 'Escape') { if (mode) mode = null; else sel = []; refresh(); }
      else if (e.key === 'Tab') { e.preventDefault(); nextUnit(); }
      else if (e.key === 'h') { for (const id of sel) battle.setOrder(id, { type: 'hold' }); refresh(); }
    },
  };
}
