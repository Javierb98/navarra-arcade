// Point-buy and deployment. Pure functions over data; shared by the muster
// and deployment screens and by the headless tests.

import { Grid, manhattan } from './grid.js';

// Unit types a side can buy: its own people's, plus any allies'.
export function unitTypesFor(data, factionId, allies = []) {
  const ok = new Set([factionId, ...allies]);
  return Object.entries(data.units)
    .filter(([, k]) => ok.has(k.faction) && k.role !== 'leader' && k.role !== 'wagon')
    .map(([id, k]) => ({ id, ...k }));
}

export function rosterCost(data, counts) {
  let c = 0;
  for (const [type, n] of Object.entries(counts)) c += data.units[type].cost * n;
  return c;
}

export function rosterSize(counts) {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

// The full list of unit specs a side fields: its leader, then everything bought.
export function rosterList(scenarioSide, counts) {
  const list = [{ type: scenarioSide.leader.type, name: scenarioSide.leader.name }];
  for (const [type, n] of Object.entries(counts)) for (let i = 0; i < n; i++) list.push({ type });
  return list;
}

export function validateRoster(data, scenarioSide, counts) {
  const cost = rosterCost(data, counts);
  if (cost > scenarioSide.budget) return 'overBudget';
  if (rosterSize(counts) + 1 > scenarioSide.maxUnits) return 'tooMany';
  if (rosterSize(counts) === 0) return 'empty';
  return null;
}

export function deployCells(grid, scenarioSide) {
  const keys = new Set();
  const out = [];
  for (const r of scenarioSide.deploy ?? []) {
    for (let y = r.y0; y <= r.y1; y++) {
      for (let x = r.x0; x <= r.x1; x++) {
        if (!grid.inside(x, y)) continue;
        const h = grid.at(x, y).height;
        if (r.minHeight != null && h < r.minHeight) continue;
        if (r.maxHeight != null && h > r.maxHeight) continue;
        const k = grid.key(x, y);
        if (!keys.has(k)) { keys.add(k); out.push({ x, y }); }
      }
    }
  }
  return out;
}

// Can this unit type stand on that cell at all?
export function canStand(data, grid, type, x, y) {
  const k = data.units[type];
  const h = grid.at(x, y).height;
  if (grid.at(x, y).impassable) return false;
  if (k.tags.includes('wagon') && h > 0) return false;
  if (k.tags.includes('cavalry') && h >= 2) return false;
  return true;
}

// A sensible default placement. The scenario may name `block` cells (a road
// to hold); the sturdiest units take those first, the rest spread along the
// heights by role.
export function autoDeploy(data, rules, scenario, side, roster) {
  const grid = new Grid(scenario.map.rows, rules.terrain);
  const sc = scenario.sides[side];
  const cells = deployCells(grid, sc);
  const hints = sc.deployHints ?? {};
  const focusX = hints.focusX ?? Math.floor(grid.w / 2);
  const roads = [];
  for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) if (grid.at(x, y).height === 0) roads.push({ x, y });
  const roadDist = (c) => roads.reduce((m, r) => Math.min(m, manhattan(r, c)), 99);

  const taken = new Set();
  const placed = [];
  const place = (spec, c) => { taken.add(grid.key(c.x, c.y)); placed.push({ ...spec, x: c.x, y: c.y }); };

  const role = (s) => data.units[s.type].role;
  const sturdiness = { infantry: 0, cavalry: 1, leader: 3, skirmisher: 4, ranged: 5 };
  const pending = roster.map((s, i) => ({ ...s, i }));

  for (const [bx, by] of hints.block ?? []) {
    const pick = pending
      .filter((s) => role(s) === 'infantry' && canStand(data, grid, s.type, bx, by))
      .sort((a, b) => sturdiness[role(a)] - sturdiness[role(b)])[0];
    if (!pick || taken.has(grid.key(bx, by))) continue;
    place(pick, { x: bx, y: by });
    pending.splice(pending.indexOf(pick), 1);
  }

  const score = (spec, c) => {
    const t = grid.at(c.x, c.y);
    const d = roadDist(c);
    let s = -Math.abs(c.x - focusX) * 0.4;
    switch (role(spec)) {
      case 'infantry': s += (t.height > 0 && d === 1 ? 6 : 0) + (t.forest ? 1 : 0); break;
      case 'cavalry': s += (t.height === 1 && d === 1 ? 5 : t.height === 0 ? 3 : 0); break;
      case 'skirmisher':
      case 'ranged': s += (d === 2 ? 5 : d === 1 ? 3 : 0) + (t.forest ? 1 : 0); break;
      case 'leader': s += d === 2 ? 5 : d === 1 ? 2 : 0; break;
      default: break;
    }
    for (const p of placed) if (manhattan(p, c) === 0) s -= 99;
    return s;
  };

  pending.sort((a, b) => sturdiness[role(a)] - sturdiness[role(b)] || a.i - b.i);
  for (const spec of pending) {
    let best = null;
    let bestScore = -Infinity;
    for (const c of cells) {
      if (taken.has(grid.key(c.x, c.y)) || !canStand(data, grid, spec.type, c.x, c.y)) continue;
      const s = score(spec, c);
      if (s > bestScore) { bestScore = s; best = c; }
    }
    if (best) place(spec, best);
  }
  return placed.map(({ i, ...rest }) => rest);
}

// ---- custom battles ---------------------------------------------------------

export const FIELD_MAP = {
  id: 'field',
  title: { en: 'Open field', es: 'Campo abierto' },
  desc: { en: 'Rolling open ground with a few rises and a copse. Room for horse to charge.', es: 'Terreno abierto y ondulado, con algunas lomas y un soto. Sitio de sobra para cargar.' },
  map: { rows: [
    ',,,,,,,,,,rr,,,,,,,,,,,,',
    ',,rr,,,,,,,,,,,,,oo,,,,,',
    ',,,,,,,,,,,,,,,,,,,,,,,,',
    ',,,,,,,,oo,,,,,,,,,,rr,,',
    ',,,,,,,,,,,,,rr,,,,,,,,,',
    ',,,,,rr,,,,,,,,,,,,,,,,,',
  ] },
};

export function leaderFor(data, factionId) {
  return Object.entries(data.units).find(([, k]) => k.faction === factionId && k.role === 'leader')?.[0] ?? null;
}

// The computer's point-buy: a balanced mix for its people, spending the war
// chest down in a fixed order so the same choices always give the same army.
export function autoRoster(data, factionId, budget, maxUnits) {
  const types = unitTypesFor(data, factionId).sort((a, b) => a.cost - b.cost);
  const byRole = (r) => types.filter((k) => k.role === r);
  const plan = [...byRole('infantry'), ...byRole('ranged'), ...byRole('skirmisher'), ...byRole('cavalry'), ...byRole('infantry')];
  const counts = {};
  let left = budget, n = 1, stuck = 0;
  while (n < maxUnits && stuck < plan.length) {
    stuck = 0;
    for (const k of plan) {
      if (n >= maxUnits) break;
      if (k.cost <= left) { counts[k.id] = (counts[k.id] ?? 0) + 1; left -= k.cost; n++; } else stuck++;
    }
  }
  return counts;
}

// A custom battle on any of the campaign's fields (or open ground): any
// people against any, each side deploying at its own end of the field.
export function customScenario(data, rules, { base, player, enemy, budget, hidden }) {
  const rows = base.map.rows;
  const grid = new Grid(rows, rules.terrain);
  const w = grid.w;
  const band = Math.min(5, Math.floor(w / 4));
  const mkSide = (faction, left) => ({
    faction,
    budget,
    maxUnits: 10,
    leader: { type: leaderFor(data, faction) },
    ambush: !!hidden,
    rocks: 0,
    facing: left ? 1 : -1,
    retreat: [left ? 'left' : 'right'],
    aggression: left ? 0.7 : 0.6,
    deploy: [{ x0: left ? 0 : w - band, x1: left ? band - 1 : w - 1, y0: 0, y1: grid.h - 1 }],
    deployHints: { focusX: left ? band : w - band - 1 },
    suggested: autoRoster(data, faction, budget, 10),
  });
  const sc = {
    id: 'custom',
    custom: true,
    title: { en: 'Custom battle', es: 'Batalla libre' },
    place: base.title,
    map: { rows },
    turnLimit: 12,
    objective: { type: 'field', text: {
      en: 'Break the enemy army, or hold the field in better shape than theirs at nightfall.',
      es: 'Rompe el ejército enemigo, o termina la jornada en mejor estado que él.' } },
    sides: { player: mkSide(player, true), enemy: mkSide(enemy, false) },
  };
  const es = sc.sides.enemy;
  sc.sides.enemy.units = autoDeploy(data, rules, sc, 'enemy', rosterList(es, es.suggested));
  return sc;
}
