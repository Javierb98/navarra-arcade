// The combat engine. Pure: no DOM, no timers, no Math.random. Given the same
// data, armies, seed and orders it produces the same events, which is what
// lets tests/balance.test.js play hundreds of battles headless.
//
// Both sides give orders, then resolveTurn() carries them out one company at
// a time, alternating sides as 1066 does: a company of ours, one of theirs,
// and so on, each side in the order its orders were given. The side that goes
// first alternates each turn. Companies ordered to move as a formation act
// together in one slot. After every order, routing companies run, then morale
// is checked and the objectives scored. resolveTurn() returns the events for
// the UI to animate.

import { makeRng } from './rng.js';
import { Grid, dijkstra, pathTo, manhattan, volleyLine } from './grid.js';

const ON_BOARD = new Set(['ok', 'routing']);
export const SIDES = ['player', 'enemy'];
export const otherSide = (side) => (side === 'player' ? 'enemy' : 'player');

export class Battle {
  // data: { rules, factions, units }
  // armies: { player: { faction, units: [{type, x, y, name?}] }, enemy: {...} }
  constructor({ data, scenario, armies, seed = 1 }) {
    this.data = data;
    this.rules = data.rules;
    this.scenario = scenario;
    this.grid = new Grid(scenario.map.rows, data.rules.terrain);
    this.seed = seed >>> 0;
    this.rng = makeRng(this.seed);
    this.turn = 1;
    this.turnLimit = scenario.turnLimit;
    this.units = [];
    this.orders = new Map();
    this.result = null;
    this.ev = [];
    this.groupSeq = 0;
    this.pendingGroup = null;

    this.sides = {};
    for (const side of SIDES) {
      const army = armies[side];
      const sc = scenario.sides[side] ?? {};
      const faction = data.factions[army.faction];
      if (!faction) throw new Error(`unknown faction ${army.faction}`);
      this.sides[side] = {
        id: side,
        factionId: army.faction,
        faction,
        rocks: sc.rocks ?? 0,
        retreat: sc.retreat ?? (side === 'player' ? ['left'] : ['right']),
        ambush: !!sc.ambush,
        facing: sc.facing ?? (side === 'player' ? 1 : -1),
        convoy: { escaped: 0, captured: 0 },
        cries: 0, // war cries so far: each one the enemy hears means less
      };
    }
    for (const side of SIDES) for (const spec of armies[side].units) this.addUnit(side, spec);

    // Omens before battle (the eclipse before Simancas): every company's
    // morale is shaken by a random amount, recorded for the opening log.
    this.omen = null;
    if (scenario.omen) {
      const { min, max, floor = 25 } = scenario.omen;
      const shaken = { player: [], enemy: [] };
      for (const u of this.units) {
        if (this.isWagon(u)) continue;
        const loss = Math.round(this.rng.range(min, max));
        u.morale = Math.max(floor, u.morale - loss);
        shaken[u.side].push(loss);
      }
      const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
      this.omen = { type: scenario.omen.type, player: avg(shaken.player), enemy: avg(shaken.enemy) };
    }

    const obj = scenario.objective;
    this.exitKeys = new Set((obj?.exit ?? []).map(([x, y]) => this.grid.key(x, y)));
    this.retreatKeys = {};
    for (const side of SIDES) {
      this.retreatKeys[side] = new Set(this.grid.edgeCells(this.sides[side].retreat).map((c) => this.grid.key(c.x, c.y)));
    }
  }

  addUnit(side, spec) {
    const kind = this.data.units[spec.type];
    if (!kind) throw new Error(`unknown unit type ${spec.type}`);
    if (!this.grid.inside(spec.x, spec.y)) throw new Error(`${spec.type} placed off the map at ${spec.x},${spec.y}`);
    if (this.unitAt(spec.x, spec.y)) throw new Error(`two units placed at ${spec.x},${spec.y}`);
    const s = this.sides[side];
    const morale = this.rules.courageMorale[(this.data.factions[kind.faction] ?? s.faction).courage] + (kind.moraleBonus ?? 0);
    const u = {
      id: `${side[0]}${this.units.length}`,
      side,
      type: spec.type,
      kind,
      name: spec.name ?? null,
      x: spec.x,
      y: spec.y,
      hp: kind.hp,
      maxHp: kind.hp,
      morale,
      maxMorale: morale,
      status: 'ok',
      hidden: s.ambush && this.isCover(spec.x, spec.y),
      facing: s.facing,
      steps: 0,
      spent: 0,
      struck: false,
      wasHidden: false,
      hasStruck: false,
      ambushSpent: false,
    };
    this.units.push(u);
    return u;
  }

  // ---- queries -----------------------------------------------------------

  byId(id) { return this.units.find((u) => u.id === id) ?? null; }
  onBoard(u) { return ON_BOARD.has(u.status); }
  unitAt(x, y) { return this.units.find((u) => ON_BOARD.has(u.status) && u.x === x && u.y === y) ?? null; }
  has(u, tag) { return u.kind.tags.includes(tag); }
  isCavalry(u) { return this.has(u, 'cavalry'); }
  isLeader(u) { return this.has(u, 'leader'); }
  isWagon(u) { return this.has(u, 'wagon'); }
  heightAt(x, y) { return this.grid.at(x, y).height; }
  isCover(x, y) { const t = this.grid.at(x, y); return t.height > 0 || t.forest; }
  isExit(x, y) { return this.exitKeys.has(this.grid.key(x, y)); }
  isRetreat(side, x, y) { return this.retreatKeys[side].has(this.grid.key(x, y)); }
  visibleTo(side, u) { return u.side === side || !u.hidden; }

  // A unit fights with its own people's traits, so a side can field allies
  // (León with Pamplona at Simancas) or any mix in a custom battle.
  factionOf(u) { return this.data.factions[u.kind.faction] ?? this.sides[u.side].faction; }
  scale(trait) { return this.rules.traitScale[trait]; }
  attackOf(u) { return u.kind.attack * this.scale(this.factionOf(u).attack); }
  missileOf(u) { return (u.kind.missile ?? u.kind.attack) * this.scale(this.factionOf(u).attack); }
  defenceOf(u) { return u.kind.defence * this.scale(this.factionOf(u).defence); }
  courageOf(u) { return this.scale(this.factionOf(u).courage); }
  movesOf(u) { return u.kind.moves; }
  rangeOf(u) { return u.kind.range ?? 1; }

  friendsOf(u) { return this.units.filter((f) => f !== u && f.side === u.side && ON_BOARD.has(f.status)); }
  foesOf(u) { return this.units.filter((f) => f.side !== u.side && ON_BOARD.has(f.status)); }

  moveCost(u, x, y) {
    const t = this.grid.at(x, y);
    if (t.impassable) return Infinity;
    if (this.isWagon(u) && t.height > 0) return Infinity;
    if (this.isCavalry(u) && t.height >= 2) return Infinity;
    const traits = this.factionOf(u).traits ?? [];
    let c = t.cost;
    if (traits.includes('terrainMaster')) c = t.height >= 2 ? 2 : 1;
    if (traits.includes('roughSlow') && (t.height > 0 || t.forest)) c += 1;
    if (this.isCavalry(u) && t.height > 0) c += 1;
    return c;
  }

  // Three or more shield-wall infantry of one side stacked in a column.
  inShieldWall(u) {
    if (!this.has(u, 'shieldwall') || u.status !== 'ok') return false;
    const member = (x, y) => {
      const o = this.unitAt(x, y);
      return o && o.side === u.side && o.status === 'ok' && this.has(o, 'shieldwall');
    };
    let n = 1;
    for (let y = u.y - 1; member(u.x, y); y--) n++;
    for (let y = u.y + 1; member(u.x, y); y++) n++;
    return n >= 3;
  }

  // A wagon with a formed friendly unit beside it is being defended.
  isGuarded(u) {
    if (!this.isWagon(u)) return false;
    return this.friendsOf(u).some((f) => f.status === 'ok' && !this.isWagon(f) && manhattan(f, u) === 1);
  }

  // Tip of a V (a wedge): two companies of the same arm diagonally behind
  // it, on either flank. Returns the direction the V points (1 or -1), or 0.
  isWedgeTip(u) {
    if (u.status !== 'ok') return 0;
    const arm = (o) => (this.isCavalry(o) ? 'horse' : o.kind.role === 'infantry' ? 'foot' : null);
    const mine = arm(u);
    if (!mine) return 0;
    const same = (x, y) => {
      const o = this.unitAt(x, y);
      return o && o.side === u.side && o.status === 'ok' && arm(o) === mine;
    };
    for (const f of [u.facing || 1, -(u.facing || 1)]) {
      if (same(u.x - f, u.y - 1) && same(u.x - f, u.y + 1)) return f;
    }
    return 0;
  }

  formations(side) {
    const walls = new Set();
    const wedges = new Map(); // tip id -> direction
    for (const u of this.units) {
      if (u.side !== side || u.status !== 'ok') continue;
      if (this.inShieldWall(u)) walls.add(u.id);
      const f = this.isWedgeTip(u);
      if (f) wedges.set(u.id, f);
    }
    return { walls, wedges };
  }

  // Cells the unit can end its move on, as seen by its own side: visible
  // enemies block, friends can be passed through, hidden enemies are invisible.
  // `ignore`: ids of friends that are moving too (a formation), whose cells
  // count as free.
  reachable(u, ignore = null) {
    const blocks = (x, y) => {
      const o = this.unitAt(x, y);
      return o && o.side !== u.side && this.visibleTo(u.side, o);
    };
    const all = dijkstra(this.grid, u, this.movesOf(u), (to) => (blocks(to.x, to.y) ? Infinity : this.moveCost(u, to.x, to.y)));
    const stops = new Map();
    for (const [k, n] of all) {
      const o = this.unitAt(n.x, n.y);
      if (o && o !== u && this.visibleTo(u.side, o) && !ignore?.has(o.id)) continue;
      stops.set(k, n);
    }
    return stops;
  }

  pathOf(node) { return pathTo(node); }

  // Everything the unit could be ordered to do this turn.
  options(u) {
    const none = { reach: new Map(), melee: [], shots: [], taunt: false, rocks: [], rally: false };
    if (u.status !== 'ok') return none;
    const reach = this.reachable(u);
    const armed = this.attackOf(u) > 0;
    const foes = this.foesOf(u).filter((e) => this.visibleTo(u.side, e));
    const melee = [];
    if (armed) {
      for (const e of foes) {
        let via = null;
        for (const n of reach.values()) {
          if (manhattan(n, e) === 1 && (!via || n.cost < via.cost)) via = n;
        }
        if (via) melee.push({ target: e, via });
      }
    }
    const range = this.rangeOf(u);
    // Missile troops loose along their row, left or right, as far as the
    // throw carries: no range limit. They can shoot from where they stand or
    // move into the enemy's row first; each shot names the cheapest square.
    const shots = [];
    if (armed && range > 1) {
      for (const e of foes) {
        let via = null;
        for (const n of reach.values()) {
          if (n.y === e.y && Math.abs(n.x - e.x) >= 2 && (!via || n.cost < via.cost)) via = n;
        }
        if (via) shots.push({ target: e, via });
      }
    }
    // Taunting needs no target: a company shouts at the whole enemy army.
    const taunt = armed && !this.isWagon(u);
    const h = this.heightAt(u.x, u.y);
    const rocks = armed && this.sides[u.side].rocks > 0 && h > 0
      ? foes.filter((e) => manhattan(u, e) === 1 && this.heightAt(e.x, e.y) < h)
      : [];
    return { reach, melee, shots, taunt, rocks, rally: this.isLeader(u) };
  }

  // ---- orders ------------------------------------------------------------

  validateOrder(u, o) {
    if (!u || u.status !== 'ok') return 'unit cannot act';
    const opts = this.options(u);
    const tgt = (list) => list.some((e) => (e.target ?? e).id === o.targetId);
    switch (o.type) {
      case 'hold': return null;
      case 'move': {
        if (!o.path?.length) return 'empty path';
        const end = o.path[o.path.length - 1];
        const reach = o.group != null ? this.reachable(u, this.groupMembers(o.group, u.side)) : opts.reach;
        return reach.has(this.grid.key(end.x, end.y)) ? null : 'destination unreachable';
      }
      case 'attack': return tgt(opts.melee) ? null : 'target not reachable';
      case 'shoot': {
        const t = this.byId(o.targetId);
        if (!t || !tgt(opts.shots)) return 'target not in range';
        const end = o.path?.length ? o.path[o.path.length - 1] : u;
        if (o.path?.length && !opts.reach.has(this.grid.key(end.x, end.y))) return 'cannot reach that spot';
        return this.canShoot(u, t, end) ? null : 'not in range from there';
      }
      case 'taunt': return opts.taunt ? null : 'this company cannot taunt';
      case 'rock': return tgt(opts.rocks) ? null : 'no rocks or no target below';
      case 'rally': return opts.rally ? null : 'only leaders rally';
      default: return `unknown order ${o.type}`;
    }
  }

  // Orders run in the sequence they were given, so re-ordering a company
  // moves it to the back of its side's queue.
  setOrder(id, order) {
    const u = this.byId(id);
    const err = this.validateOrder(u, order);
    if (err) throw new Error(`invalid order for ${id}: ${err}`);
    this.orders.delete(id);
    if (order.type !== 'hold') this.orders.set(id, order);
  }

  // Orders for a formation: every member moves (or fights) in one slot. The
  // members' own cells count as free while validating, since they all move.
  setGroupOrders(list) {
    const gid = `g${++this.groupSeq}`;
    const members = new Set(list.map((x) => x.id));
    this.pendingGroup = { gid, members };
    try {
      for (const { id, order } of list) {
        const err = this.validateOrder(this.byId(id), { ...order, group: gid });
        if (err) throw new Error(`invalid formation order for ${id}: ${err}`);
      }
    } finally { this.pendingGroup = null; }
    for (const { id, order } of list) { this.orders.delete(id); this.orders.set(id, { ...order, group: gid }); }
    return gid;
  }

  groupMembers(gid, side) {
    if (this.pendingGroup?.gid === gid) return this.pendingGroup.members;
    const ids = new Set();
    for (const [id, o] of this.orders) if (o.group === gid && this.byId(id)?.side === side) ids.add(id);
    return ids;
  }

  orderOf(u) { return (u.status === 'ok' && this.orders.get(u.id)) || { type: 'hold' }; }

  // ---- resolution --------------------------------------------------------

  // Resolves the whole turn at once, aiming every volley automatically.
  resolveTurn(opts) {
    const it = this.turnSteps(opts);
    let r = it.next();
    while (!r.done) r = it.next(null);
    return this.ev;
  }

  // The same turn, one step at a time. When a volley from a side listed in
  // `interactive` comes up, it yields { events, request } and waits for the
  // player's aim: next({ k, quality }) where k is how many squares out the
  // volley came down (see volleyLine), or next(null) to aim automatically.
  // Events are yielded in chunks so the UI can catch up before each request.
  *turnSteps({ interactive = [] } = {}) {
    if (this.result) return { events: [] };
    const ev = (this.ev = []);
    let mark = 0;
    const flush = () => { const out = ev.slice(mark); mark = ev.length; return out; };
    ev.push({ t: 'turn', turn: this.turn });
    for (const u of this.units) {
      u.steps = 0; u.spent = 0; u.struck = false; u.hasStruck = false; u.turnLoss = 0; u.shaken = false;
      u.wasHidden = u.hidden; u.startX = u.x; u.startY = u.y;
    }
    const first = this.turn % 2 === 1 ? 'player' : 'enemy';
    const a = this.slotsFor(first);
    const b = this.slotsFor(otherSide(first));
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i]) yield* this.slotSteps(a[i], interactive, flush);
      if (b[i]) yield* this.slotSteps(b[i], interactive, flush);
      if (this.broken('player') || this.broken('enemy')) break;
    }
    for (const u of this.units.filter((x) => x.status === 'routing')) this.flee(u);
    this.moralePhase();
    this.checkEnd();
    this.orders.clear();
    if (!this.result) this.turn++;
    return { events: flush() };
  }

  *slotSteps(slot, interactive, flush) {
    const live = slot.units.filter((u) => u.status === 'ok');
    if (!live.length) return;
    this.ev.push({ t: 'act', ids: live.map((u) => u.id), side: live[0].side, group: slot.group });
    const ask = interactive.includes(live[0].side);
    if (slot.group != null) {
      const walkers = live.filter((u) => this.orders.get(u.id)?.type === 'move');
      if (walkers.length) this.moveTogether(walkers);
      const fighters = live.filter((u) => u.status === 'ok' && this.orders.get(u.id)?.type === 'attack');
      let q = null;
      if (ask && fighters.length) {
        // A formation falling on the enemy together: one charge for all.
        for (const u of fighters) {
          const t = this.byId(this.orders.get(u.id).targetId);
          if (t && this.onBoard(t) && manhattan(u, t) !== 1) this.approach(u, t);
        }
        const t = this.byId(this.orders.get(fighters[0].id).targetId);
        if (t && this.onBoard(t) && fighters.some((u) => manhattan(u, t) === 1)) {
          const ans = yield { events: flush(), request: { kind: 'charge', formation: true, attacker: fighters[0].id, attackers: fighters.map((u) => u.id), defender: t.id } };
          q = this.minigameQuality('charge', ans);
        }
      }
      for (const u of live) if (u.status === 'ok' && this.orders.get(u.id)?.type !== 'move') this.act(u, q);
      return;
    }
    const u = live[0];
    const o = this.orders.get(u.id);
    if (ask && o.type === 'attack') { yield* this.fightSteps(u, o, flush); return; }
    if (ask && o.type === 'taunt') {
      // The player's war cry: drum the men up, then the shout (a minigame);
      // how well it goes scales the cry, on top of the ground and the fade.
      const listener = this.nearestFoe(u);
      const ans = yield { events: flush(), request: { kind: 'taunt', attacker: u.id, defender: listener?.id ?? null } };
      this.doTaunt(u, this.minigameQuality('taunt', ans).attack);
      return;
    }
    if (o.type !== 'shoot') { this.act(u); return; }
    // Move up if ordered to, then throw from wherever the company ended up.
    if (o.path?.length) this.walk(u, o.path);
    const t = this.byId(o.targetId);
    if (u.status !== 'ok' || !t || !this.onBoard(t) || !this.canShoot(u, t)) {
      if (u.status === 'ok' && t && this.onBoard(t)) this.ev.push({ t: 'short', id: u.id, target: t.id });
      return;
    }
    let aim = null;
    if (interactive.includes(u.side)) {
      aim = yield {
        events: flush(),
        // The aiming view shows the row out to a little past what the weapon
        // can throw; nothing can land further than that.
        request: { kind: 'aim', shooter: u.id, target: t.id, line: volleyLine(this.grid, u, t, this.grid.w).filter((c) => c.k <= Math.ceil(this.throwReach(u)) + 1), maxRange: this.throwReach(u) },
      };
    }
    this.volley(u, t, aim ?? null);
  }

  // An attack by a player's company: close in, then a charge (horse that
  // galloped in over two squares or more) or a hand-to-hand fight, each
  // settled by a minigame before the blow lands.
  *fightSteps(u, o, flush) {
    const t = this.byId(o.targetId);
    if (!t || !this.onBoard(t) || !this.visibleTo(u.side, t)) return;
    if (manhattan(u, t) !== 1) this.approach(u, t);
    if (u.status !== 'ok' || !this.onBoard(t) || manhattan(u, t) !== 1) {
      if (u.status === 'ok') this.ev.push({ t: 'short', id: u.id, target: t.id });
      return;
    }
    const charging = this.isCavalry(u) && u.steps >= this.rules.chargeMinSteps && this.heightAt(t.x, t.y) === 0 && !this.inShieldWall(t);
    const kind = charging ? 'charge' : 'melee';
    const ans = yield { events: flush(), request: { kind, attacker: u.id, defender: t.id } };
    const q = this.minigameQuality(kind, ans);
    this.strike(u, t, 'melee', q.attack, q.counter);
    if (o.withdraw && this.has(u, 'hitAndRun') && u.status === 'ok') this.withdraw(u);
  }

  // Minigame results as damage multipliers; no answer means average.
  minigameQuality(kind, ans) {
    if (!ans) return { attack: 1, counter: 1 };
    const R = this.rules.minigames;
    const clamp = (v) => Math.max(0, Math.min(1, v));
    if (kind === 'charge') { const p = clamp(ans.power); return { attack: R.chargeMin + (R.chargeMax - R.chargeMin) * p, counter: 1.1 - 0.3 * p }; }
    if (kind === 'melee') { const sc = clamp(ans.score); return { attack: R.meleeMin + (R.meleeMax - R.meleeMin) * sc, counter: 1.3 - 0.6 * sc }; }
    if (kind === 'taunt') { const sc = clamp(ans.score); return { attack: R.tauntMin + (R.tauntMax - R.tauntMin) * sc, counter: 1 }; }
    return { attack: 1, counter: 1 };
  }

  // Along the row, at two squares or more.
  canShoot(u, t, from = u) {
    return this.rangeOf(u) > 1 && from.y === t.y && Math.abs(from.x - t.x) >= 2;
  }

  // How far a full draw carries, in squares (the weapon's power).
  throwReach(u) { return this.rangeOf(u) * this.rules.throwReachPerPower; }

  // One slot per company, or one per formation, in the order given.
  slotsFor(side) {
    const slots = [];
    const groups = new Map();
    for (const [id, o] of this.orders) {
      const u = this.byId(id);
      if (!u || u.side !== side || u.status !== 'ok') continue;
      if (o.group != null) {
        if (!groups.has(o.group)) { const s = { group: o.group, units: [] }; groups.set(o.group, s); slots.push(s); }
        groups.get(o.group).units.push(u);
      } else {
        slots.push({ group: null, units: [u] });
      }
    }
    return slots;
  }

  act(u, q = null) {
    const R = this.rules;
    const o = this.orders.get(u.id);
    const t = o.targetId ? this.byId(o.targetId) : null;
    const live = t && this.onBoard(t);
    switch (o.type) {
      case 'rally': this.doRally(u); break;
      case 'taunt':
        this.doTaunt(u);
        break;
      case 'rock':
        if (live && this.sides[u.side].rocks > 0 && manhattan(u, t) === 1 && this.heightAt(t.x, t.y) < this.heightAt(u.x, u.y)) {
          this.sides[u.side].rocks--;
          this.strike(u, t, 'rock');
        }
        break;
      case 'shoot':
        if (o.path?.length) this.walk(u, o.path);
        if (live && u.status === 'ok' && this.canShoot(u, t)) this.volley(u, t, null);
        break;
      case 'move':
        this.walk(u, o.path);
        break;
      case 'attack': {
        if (!live || !this.visibleTo(u.side, t)) break;
        if (manhattan(u, t) !== 1) this.approach(u, t);
        if (u.status === 'ok' && this.onBoard(t) && manhattan(u, t) === 1) {
          this.strike(u, t, 'melee', q?.attack ?? 1, q?.counter ?? 1);
          if (o.withdraw && this.has(u, 'hitAndRun') && u.status === 'ok') this.withdraw(u);
        } else if (u.status === 'ok') {
          this.ev.push({ t: 'short', id: u.id, target: t.id });
        }
        break;
      }
      default: break;
    }
  }

  // Follow a path as far as it allows. Friends can be passed through but not
  // stopped on; an enemy (seen or hidden) ends the walk in front of it.
  walk(u, path) {
    if (!path?.length) return;
    const moves = this.movesOf(u);
    let left = moves - u.spent;
    let end = -1;
    let prev = u;
    for (let i = 0; i < path.length; i++) {
      const n = path[i];
      if (manhattan(n, prev) !== 1) break;
      const cost = this.moveCost(u, n.x, n.y);
      if (!Number.isFinite(cost) || (cost > left && !(i === 0 && u.spent === 0))) break;
      const occ = this.unitAt(n.x, n.y);
      if (occ && occ !== u && occ.side !== u.side) {
        if (occ.hidden) this.reveal(occ, 'bumped');
        break;
      }
      left = Math.max(0, left - cost);
      if (!occ) end = i;
      prev = n;
    }
    for (let i = 0; i <= end; i++) {
      if (!this.stepTo(u, path[i])) break;
    }
  }

  stepTo(u, n) {
    const cost = this.moveCost(u, n.x, n.y);
    const from = { x: u.x, y: u.y };
    if (n.x !== u.x) u.facing = Math.sign(n.x - u.x);
    u.x = n.x; u.y = n.y;
    u.steps++; u.spent += cost;
    this.ev.push({ t: 'steps', moves: [{ id: u.id, from, to: { x: n.x, y: n.y } }] });
    return this.afterStep(u);
  }

  // Move toward a target and stop beside it if it can be reached this turn,
  // otherwise as close as the legs allow.
  approach(u, t) {
    const blocks = (x, y) => {
      const o = this.unitAt(x, y);
      return o && o.side !== u.side && this.visibleTo(u.side, o);
    };
    const field = dijkstra(this.grid, u, this.movesOf(u) - u.spent, (to) => (blocks(to.x, to.y) ? Infinity : this.moveCost(u, to.x, to.y)));
    let best = null;
    let bestKey = null;
    for (const n of field.values()) {
      const o = this.unitAt(n.x, n.y);
      if (o && o !== u && this.visibleTo(u.side, o)) continue;
      const d = manhattan(n, t);
      const key = [d === 1 ? 0 : 1, d, n.cost];
      if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))) {
        best = n; bestKey = key;
      }
    }
    if (best && best.prev) this.walk(u, pathTo(best));
  }

  // A formation moves in lockstep, one square per round, so the companies
  // arrive together and never trip over each other.
  moveTogether(units) {
    const movers = units.map((u) => ({ u, path: this.orders.get(u.id).path, i: 0, left: this.movesOf(u), done: false, waits: 0 }));
    for (let round = 0; round < this.rules.maxMoveRounds; round++) {
      const steps = [];
      for (const m of movers) {
        const u = m.u;
        if (m.done || u.status !== 'ok') { m.done = true; continue; }
        const n = m.path[m.i];
        if (!n || manhattan(n, u) !== 1) { m.done = true; continue; }
        const cost = this.moveCost(u, n.x, n.y);
        if (!Number.isFinite(cost) || (cost > m.left && !(m.i === 0))) { m.done = true; continue; }
        const occ = this.unitAt(n.x, n.y);
        if (occ) {
          if (occ.side !== u.side) { if (occ.hidden) this.reveal(occ, 'bumped'); m.done = true; }
          else if (movers.some((o) => o.u === occ && !o.done) && m.waits < 3) m.waits++;
          else m.done = true;
          continue;
        }
        const from = { x: u.x, y: u.y };
        if (n.x !== u.x) u.facing = Math.sign(n.x - u.x);
        u.x = n.x; u.y = n.y;
        u.steps++; u.spent += cost;
        m.left = Math.max(0, m.left - cost);
        m.i++;
        steps.push({ id: u.id, from, to: { x: n.x, y: n.y } });
        if (!this.afterStep(u)) m.done = true;
      }
      if (steps.length) this.ev.push({ t: 'steps', moves: steps });
      if (movers.every((m) => m.done || m.i >= m.path.length)) break;
    }
  }

  // A routing company runs for its own edge of the field.
  flee(u) {
    if (u.status !== 'routing') return;
    if (this.isRetreat(u.side, u.x, u.y)) { this.leaveField(u, 'fled'); return; }
    const blocks = (x, y) => {
      const o = this.unitAt(x, y);
      return o && o.side !== u.side;
    };
    const field = dijkstra(this.grid, u, this.movesOf(u), (to) => (blocks(to.x, to.y) ? Infinity : this.moveCost(u, to.x, to.y)));
    const edge = (n) => Math.min(...this.sides[u.side].retreat.map((e) =>
      e === 'left' ? n.x : e === 'right' ? this.grid.w - 1 - n.x : e === 'top' ? n.y : this.grid.h - 1 - n.y));
    let best = null;
    for (const n of field.values()) {
      const o = this.unitAt(n.x, n.y);
      if (o && o !== u) continue;
      if (!best || edge(n) < edge(best) || (edge(n) === edge(best) && n.cost < best.cost)) best = n;
    }
    if (best && best.prev) this.walk(u, pathTo(best));
  }

  // Returns false if the unit left the field.
  afterStep(u) {
    if (this.isWagon(u) && this.isExit(u.x, u.y)) {
      this.sides[u.side].convoy.escaped++;
      this.leaveField(u, 'escaped');
      return false;
    }
    if (u.status === 'routing' && this.isRetreat(u.side, u.x, u.y)) {
      this.leaveField(u, 'fled');
      return false;
    }
    if (u.hidden && !this.isCover(u.x, u.y)) this.reveal(u, 'exposed');
    for (const e of this.foesOf(u)) {
      if (manhattan(u, e) !== 1) continue;
      if (e.hidden) this.reveal(e, 'spotted');
      if (u.hidden) this.reveal(u, 'spotted');
    }
    return true;
  }

  withdraw(u) {
    let left = Math.max(1, this.movesOf(u) - u.spent);
    const home = { x: u.startX, y: u.startY };
    const steps = [];
    while (left > 0 && (u.x !== home.x || u.y !== home.y)) {
      const field = dijkstra(this.grid, u, Infinity, (to) => {
        const o = this.unitAt(to.x, to.y);
        return o ? Infinity : this.moveCost(u, to.x, to.y);
      });
      const target = field.get(this.grid.key(home.x, home.y));
      if (!target) break;
      const next = pathTo(target)[0];
      const cost = this.moveCost(u, next.x, next.y);
      if (cost > left) break;
      steps.push({ id: u.id, from: { x: u.x, y: u.y }, to: { ...next } });
      u.x = next.x; u.y = next.y; left -= cost;
    }
    if (steps.length) {
      for (const s of steps) this.ev.push({ t: 'steps', moves: [s], withdraw: true });
      if (u.hidden === false && u.wasHidden && this.isCover(u.x, u.y) && !this.foesOf(u).some((e) => manhattan(u, e) === 1)) {
        // Back in the rocks and out of reach: the enemy loses sight of them.
        u.hidden = true;
        this.ev.push({ t: 'vanish', id: u.id });
      }
    }
  }

  // ---- combat ------------------------------------------------------------

  // Attack and defence after every modifier. `a` may be a virtual copy of a
  // unit standing somewhere else, which is how the AI and the UI preview odds.
  strikeFactors(a, d, mode, ambush) {
    const R = this.rules;
    const mods = [];
    const ha = this.heightAt(a.x, a.y);
    const hd = this.heightAt(d.x, d.y);
    if (mode === 'rock') {
      if (ambush) mods.push('ambush');
      return { damage: R.rockDamage * (ha - hd >= 2 ? 1.3 : 1) * (ambush ? 1.25 : 1), mods: ['rock', ...mods] };
    }
    let A = mode === 'shot' ? this.missileOf(a) : this.attackOf(a);
    let D = this.defenceOf(d);
    if (ambush) { A *= R.ambushBonus; mods.push('ambush'); }
    if (mode === 'melee' || mode === 'counter') {
      if (ha > hd) { A *= R.downhillBonus; mods.push('downhill'); } else if (ha < hd) { A *= R.uphillPenalty; mods.push('uphill'); }
      if (this.isCavalry(a) && hd > 0) { A *= R.cavalryVsHeights; mods.push('horseOnSlope'); }
      if (mode === 'melee' && this.isCavalry(a) && a.steps >= R.chargeMinSteps && hd === 0 && !this.inShieldWall(d)) {
        A *= R.chargeBonus; mods.push('charge');
      }
      if (mode === 'melee' && this.isWedgeTip(a)) { A *= R.wedgeBonus; mods.push('wedge'); }
    }
    if (d.status === 'routing') { A *= R.pursuitBonus; mods.push('pursuit'); }
    D *= R.heightDefence[hd];
    if (hd > 0) mods.push('height');
    if (this.grid.at(d.x, d.y).forest) { D *= R.forestDefence; mods.push('forest'); }
    if (this.inShieldWall(d)) { D *= R.shieldWallDefence; mods.push('shieldWall'); }
    if (this.isGuarded(d)) { D *= R.guardedDefence; mods.push('guarded'); }
    if (this.grid.at(d.x, d.y).fort) { D *= R.fortDefence; mods.push(this.grid.at(d.x, d.y).key === 'cave' ? 'cave' : 'palisade'); }
    if (this.grid.at(d.x, d.y).ford) { D *= R.fordDefence; mods.push('inFord'); }
    // A bridge is a narrow place to fight: no room to form up.
    if (this.grid.at(d.x, d.y).bridge) { D *= R.bridgeDefence; mods.push('onBridge'); }
    const strength = 0.5 + 0.5 * (a.hp / a.maxHp);
    let damage = (R.damageBase * A) / (A + D) * strength;
    // Missiles lose force with distance: full at two squares, weakest at
    // the end of their range.
    if (mode === 'shot') {
      const reach = this.throwReach(a);
      const far = Math.max(0, Math.min(1, (manhattan(a, d) - 2) / Math.max(1, reach - 2)));
      damage *= 1 - R.rangeFalloff * far;
      if (manhattan(a, d) > reach) { damage *= 0.05; mods.push('outOfReach'); } else if (far > 0.5) mods.push('longRange');
    }
    if (mode === 'counter') damage *= R.counterFactor;
    return { damage, mods };
  }

  // Expected outcome of `u` attacking `t` from `cell`, no dice rolled.
  preview(u, t, mode, cell = u) {
    const steps = mode === 'melee' ? u.steps + manhattan(u, cell) : u.steps;
    const va = { ...u, x: cell.x, y: cell.y, steps };
    const hit = this.strikeFactors(va, t, mode, u.hidden && !u.ambushSpent);
    let counter = 0;
    if (mode === 'melee' && t.status === 'ok' && this.attackOf(t) > 0 && hit.damage < t.hp) {
      const vt = { ...t, hp: t.hp - hit.damage };
      counter = this.strikeFactors(vt, va, 'counter', false).damage;
    }
    return { damage: hit.damage, counter, mods: hit.mods };
  }

  // A volley comes down along the line to the target. `aim` is either
  //   { hits: [{ k, frac }] }  what share of the volley struck the company k
  //                            squares out (0 is the throwers themselves),
  //                            from the aiming game's hitboxes, or
  //   { k, quality }           the whole volley came down k squares out,
  // or null to scatter it around the target as the AI does.
  volley(u, t, aim) {
    const R = this.rules;
    const line = volleyLine(this.grid, u, t, this.grid.w);
    const kT = line.find((c) => c.x === t.x && c.y === t.y)?.k ?? Math.round(Math.hypot(t.x - u.x, t.y - u.y));
    let hits;
    if (aim?.hits) {
      hits = aim.hits.map((h) => ({ k: h.k, quality: Math.min(R.volleyMaxQuality, h.frac / R.volleyFullShare) }));
    } else if (aim) {
      hits = [{ k: aim.k, quality: aim.quality ?? 1 }];
    } else {
      // Auto-aim: scatter grows with distance, and nothing lands beyond what
      // the weapon can throw; a target out of reach gets a volley that falls
      // short, on whoever stands in between.
      const dist = Math.abs(t.x - u.x);
      const reach = Math.floor(this.throwReach(u));
      const off = (this.rng.next() + this.rng.next() + this.rng.next() - 1.5) * R.volleySpread * (0.6 + dist / Math.max(4, reach));
      const k = Math.min(reach, kT + Math.round(off));
      hits = [{ k, quality: Math.max(0.85, 1.1 - Math.abs(off) * 0.25) }];
    }
    if (u.hidden) this.reveal(u, 'strikes');
    const cellAt = (k) => (k === 0 ? { x: u.x, y: u.y } : line.find((c) => c.k === k) ?? null);
    const struck = hits
      .filter((h) => h.quality >= R.volleyMinQuality)
      .map((h) => ({ ...h, cell: cellAt(h.k) }))
      .map((h) => ({ ...h, who: h.cell ? this.unitAt(h.cell.x, h.cell.y) : null }))
      .filter((h) => h.who);
    const main = struck.find((h) => h.who.side !== u.side) ?? struck[0] ?? null;
    const landK = main ? main.k : hits[0]?.k ?? kT;
    const land = cellAt(landK);
    const result = !main ? 'miss' : main.who.side === u.side ? 'friendly' : 'hit';
    this.ev.push({
      t: 'volley', a: u.id, d: t.id, land: land ? { x: land.x, y: land.y } : null, short: landK < kT, result,
      spread: struck.map((h) => ({ x: h.cell.x, y: h.cell.y })),
    });
    for (const h of struck) {
      if (!this.onBoard(h.who) || (h.who === u && h.quality < 0.3)) continue;
      if (h.who.hidden && h.who.side !== u.side) this.reveal(h.who, 'spotted');
      const q = h.quality * (this.grid.at(h.who.x, h.who.y).forest ? R.volleyForest : 1);
      this.strike(u, h.who, 'shot', q);
    }
  }

  strike(a, d, mode, quality = 1, counterQuality = 1) {
    const R = this.rules;
    // The first-strike bonus is once per unit per battle: slipping back into
    // cover hides a unit again, but the enemy is not surprised twice.
    const ambush = a.wasHidden && !a.hasStruck && !a.ambushSpent && a.side !== d.side;
    if (a.hidden) this.reveal(a, 'strikes');
    if (ambush) a.ambushSpent = true;
    const f = this.strikeFactors(a, d, mode, ambush);
    const dmg = Math.max(1, Math.round(f.damage * quality * this.rng.range(R.damageRoll[0], R.damageRoll[1])));
    a.hasStruck = true;
    this.hurt(d, dmg);
    this.ev.push({ t: 'strike', mode, a: a.id, d: d.id, dmg, hp: d.hp, mods: f.mods, ambush, friendly: a.side === d.side });
    if (d.hp <= 0) { this.kill(d); return; }
    const c = this.courageOf(d);
    this.changeMorale(d, (-dmg * R.moraleLossPerDamage) / c, 'hit');
    this.takeBlow(d, a, dmg);
    if (ambush) {
      this.changeMorale(d, -R.ambushShock / c, 'ambush');
      for (const f2 of this.friendsOf(d)) {
        if (manhattan(f2, d) <= R.splashRadius) this.changeMorale(f2, -R.ambushSplash / this.courageOf(f2), 'ambush');
      }
    }
    if (mode === 'rock') this.changeMorale(d, -R.rockShock / c, 'rock');

    if (mode === 'melee' && d.status === 'ok' && a.status === 'ok' && this.attackOf(d) > 0) {
      const cf = this.strikeFactors(d, a, 'counter', false);
      const cd = Math.max(1, Math.round(cf.damage * counterQuality * this.rng.range(R.damageRoll[0], R.damageRoll[1])));
      this.hurt(a, cd);
      this.ev.push({ t: 'strike', mode: 'counter', a: d.id, d: a.id, dmg: cd, hp: a.hp, mods: cf.mods, ambush: false });
      if (a.hp <= 0) this.kill(a);
      else { this.changeMorale(a, (-cd * R.moraleLossPerDamage) / this.courageOf(a), 'hit'); this.takeBlow(a, d, cd); }
    }
  }

  hurt(u, dmg) {
    u.hp = Math.max(0, u.hp - dmg);
    u.struck = true;
  }

  // Each company's courage bends with its situation, beyond the plain loss
  // of men: being hit from the flank or rear, being outnumbered at close
  // quarters, and losing too many men too fast all shake it.
  takeBlow(d, a, dmg) {
    const R = this.rules.courage;
    if (d.status !== 'ok' || this.isWagon(d)) return;
    const c = this.courageOf(d);
    // Flank or rear: the blow comes from behind the company's facing, or
    // from above or below it in the line.
    if (a && a.side !== d.side && manhattan(a, d) === 1) {
      const behind = Math.sign(a.x - d.x) === -d.facing && a.y === d.y;
      const side = a.x === d.x;
      if (behind) this.changeMorale(d, -R.rear / c, 'rear');
      else if (side) this.changeMorale(d, -R.flank / c, 'flanked');
    }
    // Outnumbered: more enemies pressing on it than friends beside it.
    if (d.status === 'ok') {
      const foes = this.foesOf(d).filter((e) => e.status === 'ok' && manhattan(e, d) === 1).length;
      const friends = this.friendsOf(d).filter((f) => f.status === 'ok' && !this.isWagon(f) && manhattan(f, d) === 1).length;
      if (foes >= 2 && foes > friends) this.changeMorale(d, -(R.outnumbered * (foes - friends)) / c, 'overwhelmed');
    }
    // Heavy losses in a single turn shake a company once, hard.
    d.turnLoss = (d.turnLoss ?? 0) + dmg;
    if (d.status === 'ok' && !d.shaken && d.turnLoss >= d.maxHp * R.heavyShare) {
      d.shaken = true;
      this.changeMorale(d, -R.heavyLosses / c, 'heavyLosses');
    }
  }

  kill(u) {
    const R = this.rules;
    const wagon = this.isWagon(u);
    u.status = wagon ? 'captured' : 'dead';
    u.hidden = false;
    if (wagon) this.sides[u.side].convoy.captured++;
    this.ev.push({ t: wagon ? 'captured' : 'dead', id: u.id });
    const friends = this.friendsOf(u).filter((f) => f.status === 'ok');
    if (this.isLeader(u)) {
      this.ev.push({ t: 'leaderFell', id: u.id, side: u.side });
      for (const f of friends) {
        const saw = manhattan(f, u) <= R.courage.leaderSeenRadius ? R.courage.leaderSeen : 0;
        this.changeMorale(f, -(R.leaderDeathMorale + saw) / this.courageOf(f), 'leaderLost');
      }
    } else if (wagon) {
      for (const f of friends) this.changeMorale(f, -R.wagonLostMorale / this.courageOf(f), 'wagonLost');
    } else {
      for (const f of friends) {
        if (manhattan(f, u) <= R.splashRadius) this.changeMorale(f, -R.friendKilledMorale / this.courageOf(f), 'friendFell');
      }
    }
  }

  // Leadership, as in 1066: a company near its leader holds; one far from
  // him frays; an army whose leader has gone breaks easily.
  command(u) {
    const leader = this.units.find((l) => l.side === u.side && this.isLeader(l));
    if (!leader || leader.status !== 'ok') return 'leaderless';
    if (leader === u || manhattan(leader, u) <= this.rules.commandRadius) return 'in';
    return 'out';
  }

  lossFactor(u) {
    const R = this.rules;
    const c = this.command(u);
    // Self-reliant armies (valley bands, not drilled companies) do not fray
    // for being far from their chief, though losing him still hurts.
    if (c === 'out' && (this.factionOf(u).traits ?? []).includes('selfReliant')) return 1;
    return { in: R.inCommandLoss, out: R.outOfCommandLoss, leaderless: R.leaderlessLoss }[c];
  }

  changeMorale(u, delta, reason) {
    if (!this.onBoard(u) || this.isWagon(u)) return;
    if (delta < 0 && reason !== 'leaderLost') delta *= this.lossFactor(u);
    const before = u.morale;
    u.morale = Math.max(0, Math.min(u.maxMorale, u.morale + delta));
    if (u.morale === before) return;
    this.ev.push({ t: 'morale', id: u.id, value: u.morale, delta: u.morale - before, reason });
    if (u.morale <= 0 && u.status === 'ok') this.rout(u, reason);
  }

  rout(u, reason) {
    u.status = 'routing';
    u.hidden = false;
    // A broken company turns its back on the enemy and faces the way it will run.
    const edges = this.sides[u.side].retreat;
    if (edges.includes('left') && !edges.includes('right')) u.facing = -1;
    else if (edges.includes('right') && !edges.includes('left')) u.facing = 1;
    else {
      const foe = this.foesOf(u).filter((e) => e.status === 'ok').sort((a, b) => manhattan(a, u) - manhattan(b, u))[0];
      if (foe && foe.x !== u.x) u.facing = Math.sign(u.x - foe.x);
    }
    this.ev.push({ t: 'rout', id: u.id, reason });
    for (const f of this.friendsOf(u)) {
      if (f.status === 'ok' && manhattan(f, u) <= this.rules.splashRadius) {
        this.changeMorale(f, -this.rules.friendRoutedMorale / this.courageOf(f), 'friendRouted');
      }
    }
  }

  reveal(u, reason) {
    if (!u.hidden) return;
    u.hidden = false;
    this.ev.push({ t: 'reveal', id: u.id, reason });
  }

  leaveField(u, status) {
    u.status = status;
    u.hidden = false;
    this.ev.push({ t: status, id: u.id });
  }

  doRally(u) {
    const R = this.rules;
    if (u.hidden) this.reveal(u, 'strikes');
    this.ev.push({ t: 'rally', id: u.id });
    for (const f of this.friendsOf(u)) {
      if (manhattan(f, u) > R.rallyRadius) continue;
      if (f.status === 'ok') this.changeMorale(f, R.rallyMorale, 'rally');
      else if (f.status === 'routing' && this.rng.chance(R.rallyRecoverChance)) {
        f.status = 'ok';
        f.morale = Math.max(f.morale, R.rallyRecoverMorale);
        this.ev.push({ t: 'rallied', id: f.id, value: f.morale });
      }
    }
  }

  // The nearest enemy company this company can see: who hears a taunt best.
  nearestFoe(u) {
    let best = null;
    for (const e of this.foesOf(u)) {
      if (e.status !== 'ok' || !this.visibleTo(u.side, e)) continue;
      if (!best || manhattan(u, e) < manhattan(u, best)) best = e;
    }
    return best;
  }

  // A war cry: the company spends its turn on it instead of fighting. It shakes the whole enemy army, those within
  // earshot (tauntRange) most; it carries further and hits harder from high
  // ground and from a leader; and every cry the army has already sounded this
  // battle is worth less (the enemy gets used to the noise), so it pays to
  // save it for the moment it can break someone. `sting` is how well the
  // player's drum and shout went (1 for the computer, or "let the captains decide").
  doTaunt(u, sting = 1) {
    const R = this.rules, side = this.sides[u.side];
    if (u.hidden) this.reveal(u, 'strikes');
    const listener = this.nearestFoe(u);
    const high = this.heightAt(u.x, u.y) > 0;
    const fade = Math.pow(R.tauntFade, side.cries);
    side.cries++;
    this.ev.push({ t: 'taunt', a: u.id, d: listener?.id ?? null, high, fade, sting });
    const bite = (R.tauntBase + this.rng.int(R.tauntSpread + 1)) * (this.isLeader(u) ? R.leaderTauntFactor : 1) * (high ? R.tauntHigh : 1) * fade * sting;
    const range = R.tauntRange + (high ? 1 : 0);
    for (const e of this.foesOf(u)) {
      if (e.status !== 'ok') continue;
      const near = manhattan(u, e) <= range;
      this.changeMorale(e, (-bite * (near ? 1 : R.tauntFarShare)) / this.courageOf(e), 'taunt');
    }
    this.changeMorale(u, R.tauntSelfMorale * fade, 'taunt');
  }

  moralePhase() {
    const R = this.rules;
    const leaders = this.units.filter((u) => u.status === 'ok' && this.isLeader(u));
    for (const u of this.units) {
      if (u.status !== 'ok' || this.isWagon(u)) continue;
      if (!u.struck) this.changeMorale(u, R.recoveryPerTurn, 'recover');
      if (leaders.some((l) => l !== u && l.side === u.side && manhattan(l, u) <= R.leaderAuraRadius)) {
        this.changeMorale(u, R.leaderAura, 'leader');
      }
    }
    for (const u of this.units) {
      if (u.status !== 'ok' || this.isWagon(u)) continue;
      // The fewer men a company has left, the sooner it thinks of running.
      const worn = (1 - u.hp / u.maxHp) * R.courage.woundedWaver;
      const waver = R.waverThreshold + worn + (this.command(u) === 'leaderless' ? R.leaderlessWaver : 0);
      if (u.morale < waver && this.rng.chance((waver - u.morale) / R.waverDivisor)) {
        this.rout(u, 'waver');
      }
    }
  }

  // ---- victory -----------------------------------------------------------

  broken(side) {
    return !this.units.some((u) => u.side === side && u.status === 'ok' && !this.isWagon(u));
  }

  strength(side) {
    let s = 0;
    for (const u of this.units) {
      if (u.side === side && u.status === 'ok') s += (u.hp / u.maxHp) * Math.max(u.kind.cost, 60);
    }
    return s;
  }

  checkEnd() {
    const pb = this.broken('player');
    const eb = this.broken('enemy');
    if (pb || eb) return this.finish(pb && eb ? null : pb ? 'enemy' : 'player', 'broken');
    const obj = this.scenario.objective;
    if (obj?.type === 'seize') {
      // Win by standing in the objective at the end of a turn; the defender
      // wins if the day runs out first.
      const keys = new Set(obj.cells.map(([x, y]) => this.grid.key(x, y)));
      if (this.units.some((u) => u.side === obj.side && u.status === 'ok' && keys.has(this.grid.key(u.x, u.y)))) {
        return this.finish(obj.side, 'seized');
      }
      // The defending commander leaving the field ends it too.
      const commander = this.units.find((u) => u.side !== obj.side && this.isLeader(u));
      if (obj.leaderFlight && commander && commander.status !== 'ok') return this.finish(obj.side, 'leaderFled');
      if (this.turn >= this.turnLimit) return this.finish(otherSide(obj.side), 'held');
      return null;
    }
    const convoy = obj?.type === 'convoy' ? this.sides[obj.side].convoy : null;
    if (convoy) {
      // The attacker must seize `need` wagons. Once too many have got away
      // for that to be possible, or night falls first, the column has won.
      const total = this.units.filter((u) => u.side === obj.side && this.isWagon(u)).length;
      const need = this.convoyNeed();
      if (convoy.captured >= need) return this.finish(otherSide(obj.side), 'convoyTaken');
      if (total - convoy.escaped < need) return this.finish(obj.side, 'convoyEscaped');
      if (this.turn >= this.turnLimit) return this.finish(obj.side, 'nightfall');
      return null;
    }
    if (this.turn >= this.turnLimit) {
      const p = this.strength('player');
      const e = this.strength('enemy');
      return this.finish(p === e ? null : p > e ? 'player' : 'enemy', 'nightfall');
    }
    return null;
  }

  convoyNeed() {
    const obj = this.scenario.objective;
    if (obj?.type !== 'convoy') return 0;
    const total = this.units.filter((u) => u.side === obj.side && this.isWagon(u)).length;
    return obj.seize ?? Math.floor(total / 2) + 1;
  }

  finish(winner, reason) {
    this.result = { winner, reason, turn: this.turn };
    this.ev.push({ t: 'end', winner, reason });
    return this.result;
  }

  // Tallies for the results screen.
  summary(side) {
    const mine = this.units.filter((u) => u.side === side);
    const count = (st) => mine.filter((u) => u.status === st).length;
    const leader = mine.find((u) => this.isLeader(u));
    return {
      fielded: mine.filter((u) => !this.isWagon(u)).length,
      standing: mine.filter((u) => u.status === 'ok' && !this.isWagon(u)).length,
      dead: count('dead'),
      routed: count('routing') + count('fled'),
      wagons: mine.filter((u) => this.isWagon(u)).length,
      escaped: this.sides[side].convoy.escaped,
      captured: this.sides[side].convoy.captured,
      leader: leader ? leader.status : null,
    };
  }
}
