// Utility AI. For each unit it scores every legal order and takes the best.
// It only knows what its side can see: hidden enemies do not exist to it,
// which is exactly why an ambush works on it.
//
// The same planner plays the player's side in the balance tests, so it has to
// be a reasonable general, not just a punching bag.

import { manhattan, distanceField } from './grid.js';

export function planTurn(battle, side, profile = {}) {
  const sc = battle.scenario.sides[side] ?? {};
  const ctx = {
    battle,
    side,
    aggression: profile.aggression ?? sc.aggression ?? 0.5,
    foes: battle.units.filter((u) => u.side !== side && battle.onBoard(u) && battle.visibleTo(side, u)),
    reserved: new Set(),
    planned: new Map(),
    exitField: null,
  };
  const obj = battle.scenario.objective;
  ctx.seizeCells = obj?.type === 'seize' && obj.side === side ? obj.cells.map(([x, y]) => ({ x, y })) : null;
  ctx.convoyMine = obj?.type === 'convoy' && obj.side === side;
  ctx.convoyTheirs = obj?.type === 'convoy' && obj.side !== side;
  if (ctx.convoyMine) {
    const wagonCost = (c) => (battle.grid.at(c.x, c.y).height > 0 ? Infinity : 1);
    ctx.exitField = distanceField(battle.grid, obj.exit.map(([x, y]) => ({ x, y })), wagonCost);
  }

  // Orders run in the sequence given, so escorts go first and wagons last,
  // letting the wagons move up behind a screen rather than ahead of it.
  const rank = (u) => (battle.isWagon(u) ? 5 : battle.rangeOf(u) > 1 ? 1 : battle.isLeader(u) ? 4 : battle.isCavalry(u) ? 3 : 2);
  const mine = battle.units.filter((u) => u.side === side && u.status === 'ok').sort((a, b) => rank(a) - rank(b));

  for (const u of mine) {
    const choice = chooseOrder(ctx, u);
    battle.setOrder(u.id, choice.order);
    ctx.reserved.add(battle.grid.key(choice.dest.x, choice.dest.y));
    ctx.planned.set(u.id, choice.dest);
  }
}

function chooseOrder(ctx, u) {
  const B = ctx.battle;
  const opts = B.options(u);
  const here = { x: u.x, y: u.y };
  const hereVal = positionValue(ctx, u, here);
  let best = { score: hereVal, order: { type: 'hold' }, dest: here };
  const consider = (score, order, dest) => {
    if (score > best.score + 1e-9) best = { score, order, dest };
  };
  const free = (c) => c.cost === 0 || !ctx.reserved.has(B.grid.key(c.x, c.y));

  // Anchored companies (a guard at its post) never leave their square.
  const anchored = B.has(u, 'anchored');
  for (const n of opts.reach.values()) {
    if (anchored || n.cost === 0 || !free(n)) continue;
    consider(positionValue(ctx, u, n) - 0.05 * n.cost, { type: 'move', path: B.pathOf(n) }, n);
  }
  const withdraw = B.has(u, 'hitAndRun');
  for (const { target, via } of opts.melee) {
    if (!free(via) || (anchored && via.cost > 0)) continue;
    const s = attackValue(ctx, u, target, 'melee', via);
    const dest = withdraw ? here : via;
    consider(positionValue(ctx, u, dest) * 0.6 + s, { type: 'attack', targetId: target.id, path: B.pathOf(via), withdraw }, dest);
  }
  for (const { target: t, via } of opts.shots) {
    if (!free(via) || (anchored && via.cost > 0)) continue;
    // Never waste a volley on a target the weapon cannot reach.
    if (manhattan(via, t) > B.throwReach(u)) continue;
    const order = via.cost === 0 ? { type: 'shoot', targetId: t.id } : { type: 'shoot', targetId: t.id, path: B.pathOf(via) };
    // A hidden company gives itself away by throwing: not worth it for a
    // weak shot at long range, when it could close in and strike from cover.
    const reveal = u.hidden ? Math.max(0, manhattan(via, t) - 2) * 1.2 : 0;
    consider(positionValue(ctx, u, via) + attackValue(ctx, u, t, 'shot', via) - reveal, order, via);
  }
  for (const t of opts.rocks) consider(hereVal + attackValue(ctx, u, t, 'rock', here) + 1, { type: 'rock', targetId: t.id }, here);

  if (opts.taunt) {
    // Worth it when many of the enemy are within earshot, or already shaky;
    // less so with every cry the army has already sounded.
    let bite = 0;
    for (const e of B.foesOf(u)) {
      if (e.status !== 'ok' || !B.visibleTo(u.side, e)) continue;
      const near = manhattan(u, e) <= B.rules.tauntRange;
      bite += (near ? 1 : B.rules.tauntFarShare) * (e.morale < 35 ? 1.6 : 0.6);
    }
    bite = bite * (B.isLeader(u) ? 1.3 : 1) * Math.pow(B.rules.tauntFade, B.sides[u.side].cries) - (u.hidden ? 3 : 0) - 1;
    consider(hereVal + bite, { type: 'taunt' }, here);
  }
  if (opts.rally) {
    let need = 0;
    for (const f of B.friendsOf(u)) {
      if (manhattan(f, u) > B.rules.rallyRadius) continue;
      if (f.status === 'routing') need += 25;
      else need += f.maxMorale - f.morale;
    }
    if (need > 20) consider(hereVal + need * 0.08, { type: 'rally' }, here);
  }
  return best;
}

function attackValue(ctx, u, t, mode, cell) {
  const B = ctx.battle;
  const p = B.preview(u, t, mode, cell);
  let s = p.damage;
  if (p.damage >= t.hp) s += 6;
  if (B.isWagon(t)) s += ctx.convoyTheirs ? 6 : 2;
  if (B.isLeader(t)) s += 3;
  if (t.status === 'routing') s -= 2;
  // Whoever stands on the objective has to be cleared off it, at a price.
  if (ctx.seizeCells?.some((c) => c.x === t.x && c.y === t.y)) s += 8 + p.counter * 0.5;
  // Escorts go for whoever is on the wagons.
  if (ctx.convoyMine && B.units.some((w) => w.side === u.side && B.isWagon(w) && B.onBoard(w) && manhattan(w, t) <= 1)) s += 5;
  s -= p.counter * (B.isLeader(u) ? 1.6 : 0.8);
  // Eagerness to engage scales with what the blow would actually do.
  s += ctx.aggression * Math.min(3, p.damage * 0.5);
  return s;
}

// How good is it for `u` to be standing on `c` at the end of this turn?
function positionValue(ctx, u, c) {
  const B = ctx.battle;
  const R = B.rules;
  const t = B.grid.at(c.x, c.y);
  let v = (R.heightDefence[t.height] * (t.forest ? R.forestDefence : 1) - 1) * 6;

  // Missile troops and wagons stay careful however bold the army is.
  const fragile = B.isWagon(u) || B.isLeader(u) || B.rangeOf(u) > 1;
  v -= threatAt(ctx, u, c) * (B.rangeOf(u) > 1 ? 1.1 : fragile ? 0.9 * (1 - ctx.aggression * 0.5) : 0.5 * (1 - ctx.aggression * 0.5));

  if (B.isWagon(u)) {
    const d = ctx.exitField?.get(B.grid.key(c.x, c.y));
    // A wagon wants a friend beside it (guarded) more than it wants to hurry.
    let escorted = false;
    for (const f of B.units) {
      if (f === u || f.side !== u.side || f.status !== 'ok' || B.isWagon(f)) continue;
      const p = ctx.planned.get(f.id) ?? f;
      if (manhattan(p, c) === 1) { escorted = true; break; }
    }
    return v - (d ?? 99) * 3 + (escorted ? 8 : 0);
  }

  let dE = null;
  for (const f of ctx.foes) {
    if (f.status !== 'ok') continue;
    const d = manhattan(f, c);
    if (dE === null || d < dE) dE = d;
  }
  if (dE !== null) {
    if (B.rangeOf(u) > 1) v -= Math.abs(dE - B.rangeOf(u)) * 1.2;
    else if (B.isLeader(u)) v -= Math.abs(dE - 3) * 0.8;
    else v -= dE * (0.3 + ctx.aggression) * (ctx.seizeCells ? 0.4 : 1);
  } else {
    const mid = { x: Math.floor(B.grid.w / 2), y: Math.floor(B.grid.h / 2) };
    v -= manhattan(c, mid) * 0.3;
  }

  if (ctx.convoyMine) {
    let dW = null;
    for (const w of B.units) {
      if (w.side !== u.side || !B.isWagon(w) || !B.onBoard(w)) continue;
      const d = manhattan(w, c);
      if (dW === null || d < dW) dW = d;
    }
    if (dW !== null) v -= Math.max(0, dW - 1) * 1.2 * (1 - ctx.aggression * 0.5);
  }

  if (ctx.seizeCells && !B.isLeader(u)) {
    const dS = Math.min(...ctx.seizeCells.map((s) => manhattan(s, c)));
    v -= dS * 2.2;
    if (dS === 0) v += 30;
  }
  if (B.has(u, 'shieldwall') && wouldWall(ctx, u, c)) v += 3;
  if (u.hidden && B.isCover(c.x, c.y)) v += 1.5 * (1 - ctx.aggression * 0.5);
  return v;
}

// Rough damage the visible enemy could deal to `u` on `c` next turn.
function threatAt(ctx, u, c) {
  const B = ctx.battle;
  const R = B.rules;
  const t = B.grid.at(c.x, c.y);
  const D = B.defenceOf(u) * R.heightDefence[t.height] * (t.forest ? R.forestDefence : 1);
  let threat = 0;
  for (const f of ctx.foes) {
    if (f.status !== 'ok') continue;
    const A = B.attackOf(f);
    if (A <= 0) continue;
    const reach = B.rangeOf(f) > 1 ? B.rangeOf(f) + 1 : B.movesOf(f) + 1;
    if (manhattan(f, c) <= reach) threat += (R.damageBase * A) / (A + D) * 0.5;
  }
  return threat;
}

function wouldWall(ctx, u, c) {
  const B = ctx.battle;
  const at = (x, y) => {
    for (const f of B.units) {
      if (f === u || f.side !== u.side || f.status !== 'ok' || !B.has(f, 'shieldwall')) continue;
      const p = ctx.planned.get(f.id) ?? f;
      if (p.x === x && p.y === y) return true;
    }
    return false;
  };
  let n = 1;
  for (let y = c.y - 1; at(c.x, y); y--) n++;
  for (let y = c.y + 1; at(c.x, y); y++) n++;
  return n >= 3;
}
