// Piedra por piedra, after Waterworks!: the town of Olite as a map of blocks
// whose people need bread every turn. Players place bakers and ovens that
// feed their own block and the blocks around them, feed cards (workers,
// materials, documents) into projects, answer the king's requests, and keep
// fires from spreading. Losing all the king's favour ends the game.
//
// Pure simulation: no DOM, no clock, no Math.random (a seeded generator whose
// state is saved too), so tests, the balance sweep, the attract demo and the
// campaign autosave can all run and restore it exactly.
//
// Every public action clears and refills `events`, for the UI.

export function rng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    chance: (p) => next() < p,
    pick: (a) => a[Math.floor(next() * a.length)],
    shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    get state() { return s; },
    set state(v) { s = v >>> 0; },
  };
}

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export class Olite {
  constructor(data, { stage = 'walledtown', difficulty = 'normal', players = 1, seed = 1, mode = 'quick' } = {}) {
    this.data = data;
    this.rules = data.rules;
    this.cardDefs = Object.fromEntries(data.cards.cards.map((c) => [c.id, c]));
    this.stageDef = data.stages.stages.find((s) => s.id === stage) ?? data.stages.stages[0];
    this.projectDefs = data.projects.projects.filter((p) => p.stage === this.stageDef.id);
    this.requestDefs = data.requests.requests.filter((r) => r.stage === this.stageDef.id);
    this.difficulty = this.rules.difficulty[difficulty] ? difficulty : 'normal';
    this.diff = this.rules.difficulty[this.difficulty];
    this.players = players === 2 ? 2 : 1;
    this.mode = mode;
    this.r = rng(seed);
    this.events = [];

    this.tiles = data.map.tiles;
    this.w = this.tiles[0].length;
    this.h = this.tiles.length;
    this.blocks = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.tile(x, y) === 'H') this.blocks.push({ x, y, pop: 0, fed: true, supply: 0, burning: 0 });
    for (const [x, y, n] of data.map.startPop) { const b = this.blockAt(x, y); if (b) b.pop = n; }

    this.uid = 0;
    this.units = (this.stageDef.start.units ?? []).map((u) => ({ uid: ++this.uid, id: u.id, x: u.x, y: u.y, moved: false }));
    this.wells = [];
    this.projects = Object.fromEntries(this.projectDefs.map((p) => [p.id, { progress: {}, done: false }]));
    this.coin = this.stageDef.start.coin + this.diff.startCoin;
    this.favour = this.stageDef.start.favour + this.diff.startFavour;
    this.turn = 1;
    this.finished = false;
    this.won = false;
    this.reason = null;
    this.request = null;
    this.nextRequest = this.stageDef.requestEvery;
    this.fedStreak = 0;
    this.stats = { requestsMet: 0, requestsFailed: 0, fires: 0, firesOut: 0, hungryTurns: 0 };

    this.handSize = this.players === 2 ? this.rules.twoPlayer.hand : this.diff.hand;
    this.decks = [[], []];
    this.discards = [[], []];
    this.hands = [[], []];
    this.warehouse = [];
    for (const [id, n] of Object.entries(data.cards.startDeck)) for (let k = 0; k < n; k++) this.decks[this.ownerOf(id)].push(this.card(id));
    for (const d of this.decks) this.r.shuffle(d);
    this.shop = [];
    this.refillShop(true);
    this.done = [false, this.players === 1];
    for (let p = 0; p < this.players; p++) this.draw(p);
    this.computeSupply();
  }

  card(id) { return { uid: ++this.uid, id }; }
  ownerOf(id) { return this.players === 2 && this.cardDefs[id].role === 'town' ? 0 : this.players === 2 ? 1 : 0; }

  // ---- the map ------------------------------------------------------------------

  tile(x, y) { return this.tiles[y]?.[x] ?? null; }
  blockAt(x, y) { return this.blocks.find((b) => b.x === x && b.y === y) ?? null; }
  unitAt(x, y) { return this.units.find((u) => u.x === x && u.y === y) ?? null; }
  wellAt(x, y) { return this.wells.find((u) => u.x === x && u.y === y) ?? null; }
  get people() { return this.blocks.reduce((s, b) => s + b.pop, 0); }

  // Where a unit or building may go: houses and empty lots for units that
  // walk; only empty lots for ovens and wells.
  canPlaceAt(x, y, lotOnly) {
    const t = this.tile(x, y);
    if (!t || this.unitAt(x, y) || this.wellAt(x, y)) return false;
    return lotOnly ? t === '.' : t === '.' || t === 'H';
  }

  protectedAt(x, y) {
    const at = { x, y };
    return this.units.some((u) => this.cardDefs[u.id].protect != null && cheb(u, at) <= this.cardDefs[u.id].protect)
      || this.wells.some((w) => cheb(w, at) <= w.protect);
  }

  // Bread reaching each block: every baker and oven gives its own block
  // `own` and each of the 8 blocks around it `near`.
  computeSupply() {
    for (const b of this.blocks) {
      let s = 0;
      for (const u of this.units) {
        const sup = this.cardDefs[u.id].supply;
        if (!sup) continue;
        const d = cheb(u, b);
        if (d === 0) s += sup.own; else if (d === 1) s += sup.near;
      }
      b.supply = s;
      b.fed = b.pop === 0 || (s >= b.pop && !b.burning);
    }
  }

  unhappy() { return this.blocks.filter((b) => b.pop > 0 && !b.fed); }

  // ---- checks ----------------------------------------------------------------------

  // What player p can do with hand card i (target decides: a tile, a project,
  // the request, or nothing for gifts). Returns { ok, why }.
  check(p, i, target = {}) {
    const c = this.hands[p][i];
    if (!c || this.finished) return { ok: false, why: 'none' };
    return this.checkCard(c.id, target);
  }

  checkCard(id, target) {
    const def = this.cardDefs[id];
    if (def.kind === 'unit') {
      if (!target.tile) return { ok: false, why: 'pickTile' };
      return this.canPlaceAt(target.tile.x, target.tile.y, def.lot) ? { ok: true } : { ok: false, why: def.lot ? 'needLot' : 'blocked' };
    }
    if (def.kind === 'action') {
      const b = target.tile && this.blockAt(target.tile.x, target.tile.y);
      return b?.burning ? { ok: true } : { ok: false, why: 'noFire' };
    }
    if (target.request) {
      const need = this.request?.def.need?.[id] ?? 0;
      return need > (this.request?.given[id] ?? 0) ? { ok: true } : { ok: false, why: 'notWanted' };
    }
    if (target.project) {
      const pr = this.projects[target.project], def2 = this.projectDefs.find((x) => x.id === target.project);
      if (!pr || pr.done) return { ok: false, why: 'done' };
      if (!this.projectOpen(target.project)) return { ok: false, why: 'notOpen' };
      return (def2.needs[id] ?? 0) > (pr.progress[id] ?? 0) ? { ok: true } : { ok: false, why: 'notNeeded' };
    }
    if (def.favour) return { ok: true }; // a gift can simply be sent to the king
    return { ok: false, why: 'pickProject' };
  }

  // Everything this card could go to right now, for the UI's target picker.
  targetsFor(id) {
    const out = [];
    for (const pr of this.projectDefs) if (this.checkCard(id, { project: pr.id }).ok) out.push({ project: pr.id });
    if (this.request && this.checkCard(id, { request: true }).ok) out.push({ request: true });
    const def = this.cardDefs[id];
    if (def.favour) out.push({ favour: true });
    return out;
  }

  // A project that needs another finished first (the gate needs its wall).
  projectOpen(id) {
    const def = this.projectDefs.find((x) => x.id === id);
    return !!def && (def.needsDone ?? []).every((d) => this.projects[d]?.done);
  }

  projectReady(id) {
    const def = this.projectDefs.find((x) => x.id === id), pr = this.projects[id];
    if (!def || !pr || pr.done || !this.projectOpen(id)) return false;
    return Object.entries(def.needs).every(([c, n]) => (pr.progress[c] ?? 0) >= n);
  }

  canFinish(id, tile) {
    const def = this.projectDefs.find((x) => x.id === id);
    if (!this.projectReady(id)) return { ok: false, why: 'missing' };
    if (this.coin < def.coin) return { ok: false, why: 'coin' };
    if (def.lot === 'any' && !(tile && this.canPlaceAt(tile.x, tile.y, true))) return { ok: false, why: 'pickLot' };
    return { ok: true };
  }

  // ---- actions --------------------------------------------------------------------------

  emit(type, extra = {}) { this.events.push({ type, ...extra }); }

  use(p, i, target = {}) {
    this.events = [];
    const chk = this.check(p, i, target);
    if (!chk.ok) { this.emit('cant', { why: chk.why }); return false; }
    const c = this.hands[p].splice(i, 1)[0], def = this.cardDefs[c.id];
    if (def.kind === 'unit') {
      const u = { uid: ++this.uid, id: c.id, x: target.tile.x, y: target.tile.y, moved: true };
      this.units.push(u);
      if (def.protect != null) for (const b of this.blocks) if (b.burning && cheb(b, u) <= def.protect) { b.burning = 0; this.stats.firesOut++; this.emit('fireOut', { x: b.x, y: b.y }); }
      this.emit('placed', { id: c.id, x: u.x, y: u.y });
      // Units stay on the map; the card is spent.
    } else if (def.kind === 'action') {
      const b = this.blockAt(target.tile.x, target.tile.y);
      b.burning = 0;
      this.stats.firesOut++;
      this.emit('fireOut', { x: b.x, y: b.y });
      this.discards[this.ownerOf(c.id)].push(c);
    } else if (target.request) {
      this.request.given[c.id] = (this.request.given[c.id] ?? 0) + 1;
      this.emit('gave', { id: c.id });
      this.checkRequest();
      this.discards[this.ownerOf(c.id)].push(c);
    } else if (target.project) {
      const pr = this.projects[target.project];
      pr.progress[c.id] = (pr.progress[c.id] ?? 0) + 1;
      this.emit('added', { id: c.id, project: target.project, ready: this.projectReady(target.project) });
      this.discards[this.ownerOf(c.id)].push(c);
    } else if (def.favour) {
      this.favour = Math.min(this.rules.maxFavour, this.favour + def.favour);
      this.emit('favour', { n: def.favour });
      this.discards[this.ownerOf(c.id)].push(c);
    }
    this.computeSupply();
    this.checkWin();
    return true;
  }

  // Move a baker or fire watch (once a turn each).
  move(unitUid, tile) {
    this.events = [];
    const u = this.units.find((x) => x.uid === unitUid);
    if (!u || !this.cardDefs[u.id].movable || u.moved || !this.canPlaceAt(tile.x, tile.y, false)) { this.emit('cant', { why: 'cantMove' }); return false; }
    u.x = tile.x; u.y = tile.y; u.moved = true;
    const def = this.cardDefs[u.id];
    if (def.protect != null) for (const b of this.blocks) if (b.burning && cheb(b, u) <= def.protect) { b.burning = 0; this.stats.firesOut++; this.emit('fireOut', { x: b.x, y: b.y }); }
    this.emit('moved', { id: u.id, x: u.x, y: u.y });
    this.computeSupply();
    return true;
  }

  store(p, i) {
    this.events = [];
    if (this.warehouse.length >= this.rules.warehouse || !this.hands[p][i]) { this.emit('cant', { why: 'full' }); return false; }
    this.warehouse.push(this.hands[p].splice(i, 1)[0]);
    this.emit('stored');
    return true;
  }

  unstore(p, slot) {
    this.events = [];
    const c = this.warehouse.splice(slot, 1)[0];
    if (!c) return false;
    this.hands[p].push(c);
    this.emit('unstored');
    return true;
  }

  discard(p, i) {
    this.events = [];
    const c = this.hands[p].splice(i, 1)[0];
    if (!c) return false;
    this.discards[this.ownerOf(c.id)].push(c);
    this.emit('discarded', { id: c.id });
    return true;
  }

  pass(p, i) {
    this.events = [];
    if (this.players !== 2 || !this.hands[p][i]) return false;
    this.hands[1 - p].push(this.hands[p].splice(i, 1)[0]);
    this.emit('passed');
    return true;
  }

  buy(p, slot) {
    this.events = [];
    const id = this.shop[slot];
    if (!id) return false;
    const price = this.cardDefs[id].price;
    if (this.coin < price) { this.emit('cant', { why: 'coin' }); return false; }
    this.coin -= price;
    if (!(this.data.cards.shopFixed ?? []).includes(id)) this.shop[slot] = null;
    this.hands[p].push(this.card(id));
    this.emit('bought', { id, price });
    return true;
  }

  finish(id, tile) {
    this.events = [];
    const chk = this.canFinish(id, tile);
    if (!chk.ok) { this.emit('cant', { why: chk.why }); return false; }
    const def = this.projectDefs.find((x) => x.id === id), pr = this.projects[id];
    this.coin -= def.coin;
    if (def.effect.protect) this.wells.push({ x: tile.x, y: tile.y, protect: def.effect.protect });
    if (def.repeatable) pr.progress = {};
    else pr.done = true;
    this.emit('finished', { id, x: tile?.x, y: tile?.y });
    this.computeSupply();
    this.checkWin();
    return true;
  }

  endTurn(p) {
    this.events = [];
    if (this.finished) return;
    this.done[p] = true;
    if (this.done.every(Boolean)) this.resolveTurn();
    else this.emit('waiting', { p });
  }

  // ---- the turn -------------------------------------------------------------------------

  resolveTurn() {
    const R = this.rules, S = this.stageDef;
    // Fires burn, spread and burn out.
    for (const b of this.blocks.filter((x) => x.burning)) {
      b.burning++;
      if (b.pop > 0) { b.pop--; this.emit('burnt', { x: b.x, y: b.y }); }
      if (b.burning === R.fire.spreadAfter + 1) {
        const next = this.blocks.filter((n) => cheb(n, b) === 1 && !n.burning && n.pop > 0 && !this.protectedAt(n.x, n.y));
        if (next.length) { const n = this.r.pick(next); n.burning = 1; this.stats.fires++; this.emit('fire', { x: n.x, y: n.y, spread: true }); }
      }
      if (b.burning > R.fire.burnsOut) { b.burning = 0; this.emit('burntOut', { x: b.x, y: b.y }); }
    }
    this.computeSupply();

    // Bread: fed blocks pay taxes; hungry ones cost the king's favour.
    const hungry = this.unhappy().length;
    const happy = this.blocks.filter((b) => b.pop > 0 && b.fed).length;
    let income = Math.floor(happy / R.taxPerHappyBlocks);
    for (const def of this.projectDefs) if (this.projects[def.id].done && def.effect.income) income += def.effect.income;
    this.coin += income;
    this.emit('income', { n: income });
    if (hungry === 0) {
      this.fedStreak++;
      this.favour = Math.min(R.maxFavour, this.favour + R.allFedFavour);
    } else {
      this.fedStreak = 0;
      this.stats.hungryTurns++;
      let loss = 0;
      for (const [n, l] of R.unhappyFavour) if (hungry >= n) loss = l;
      loss = Math.ceil(loss * (this.diff.favourMul ?? 1));
      this.favour -= loss;
      this.emit('hungry', { blocks: hungry, favour: loss });
    }

    // The king's requests.
    if (this.request) {
      this.request.left--;
      if (this.request.def.fed && this.fedStreak >= this.request.def.fed) this.checkRequest(true);
      else if (this.request.left <= 0) {
        this.favour -= this.request.def.penalty.favour ?? 0;
        this.coin = Math.max(0, this.coin - (this.request.def.penalty.coin ?? 0));
        this.stats.requestsFailed++;
        this.emit('requestFailed', { id: this.request.def.id });
        this.request = null;
        this.nextRequest = this.turn + S.requestEvery;
      }
    } else if (this.turn >= this.nextRequest && this.requestDefs.length) {
      const def = this.r.pick(this.requestDefs);
      this.request = { def, left: def.turns, given: {} };
      this.emit('request', { id: def.id });
    }

    // A new fire, perhaps.
    if (this.r.chance(S.fireChance * this.diff.fireMul)) {
      const risk = this.blocks.filter((b) => b.pop > 0 && !b.burning && !this.protectedAt(b.x, b.y));
      if (risk.length) { const b = this.r.pick(risk); b.burning = 1; this.stats.fires++; this.emit('fire', { x: b.x, y: b.y }); }
    }

    // New people arrive, and they go where there is bread.
    if (this.turn % this.diff.growthEvery === 0) {
      for (let k = 0; k < S.growth; k++) {
        const room = this.blocks.filter((b) => b.pop < R.maxPop && !b.burning);
        const fed = room.filter((b) => b.fed && b.pop > 0);
        const pool = fed.length ? fed : room;
        if (pool.length) { const b = this.r.pick(pool); b.pop++; this.emit('arrived', { x: b.x, y: b.y }); }
      }
    }

    this.turn++;
    if (this.favour <= 0) { this.favour = 0; this.end(false, 'favour'); return; }
    if (this.diff.turnLimit && this.mode === 'quick' && this.turn > S.turns) { this.end(false, 'time'); return; }

    // New hands; units can move again; the shop restocks.
    for (let p = 0; p < this.players; p++) {
      for (const c of this.hands[p]) this.discards[this.ownerOf(c.id)].push(c);
      this.hands[p] = [];
      this.draw(p);
    }
    for (const u of this.units) u.moved = false;
    this.refillShop(false);
    this.done = [false, this.players === 1];
    this.computeSupply();
    this.emit('turn', { turn: this.turn });
    this.checkWin();
  }

  checkRequest(fedMet = false) {
    const q = this.request;
    if (!q) return;
    const met = fedMet || (q.def.need && Object.entries(q.def.need).every(([c, n]) => (q.given[c] ?? 0) >= n));
    if (!met) return;
    this.favour = Math.min(this.rules.maxFavour, this.favour + (q.def.reward.favour ?? 0));
    this.coin += q.def.reward.coin ?? 0;
    this.stats.requestsMet++;
    this.emit('requestMet', { id: q.def.id });
    this.request = null;
    this.nextRequest = this.turn + this.stageDef.requestEvery;
  }

  draw(p) {
    const d = this.players === 2 ? p : 0;
    while (this.hands[p].length < this.handSize) {
      if (!this.decks[d].length) {
        if (!this.discards[d].length) break;
        this.decks[d] = this.r.shuffle(this.discards[d]);
        this.discards[d] = [];
      }
      this.hands[p].push(this.decks[d].pop());
    }
  }

  // The shop: bakers and ovens always (bread is never down to luck), then a
  // few rotating offers, one of which changes every turn.
  refillShop(all) {
    const fixed = this.data.cards.shopFixed ?? [], pool = this.data.cards.shop;
    if (all) this.shop = [];
    fixed.forEach((id, k) => { this.shop[k] = id; });
    if (!all) this.shop[fixed.length + this.r.int(this.rules.shopSize)] = null;
    for (let k = fixed.length; k < fixed.length + this.rules.shopSize; k++) if (!this.shop[k]) this.shop[k] = this.r.pick(pool);
  }

  goalProgress() {
    return this.stageDef.goal.projects.map((id) => ({ id, done: this.projects[id]?.done ?? false }));
  }

  checkWin() {
    if (this.finished) return;
    if (this.goalProgress().every((x) => x.done)) this.end(true, 'goal');
  }

  end(won, reason) {
    this.finished = true;
    this.won = won;
    this.reason = reason;
    this.emit(won ? 'won' : 'lost', { reason });
  }

  score() {
    const S = this.rules.score;
    const left = this.diff.turnLimit ? Math.max(0, this.stageDef.turns - this.turn + 1) : 0;
    const parts = {
      people: this.people * S.person,
      favour: this.favour * S.favour,
      coin: this.coin * S.coin,
      projects: Object.values(this.projects).filter((p) => p.done).length * S.project,
      turns: this.won ? left * S.turnLeft : 0,
    };
    return { parts, total: Object.values(parts).reduce((a, b) => a + b, 0) };
  }

  stars() {
    if (!this.won) return 0;
    const left = this.stageDef.turns - this.turn + 1;
    if (left >= 8 && this.favour >= 12) return 3;
    if (left >= 4 || this.favour >= 10) return 2;
    return 1;
  }

  // ---- saving (campaign autosave) -------------------------------------------------------

  save() {
    const keep = ['blocks', 'units', 'wells', 'projects', 'coin', 'favour', 'turn', 'finished', 'won', 'reason', 'nextRequest', 'fedStreak', 'stats', 'decks', 'discards', 'hands', 'warehouse', 'shop', 'done', 'uid', 'players', 'difficulty', 'mode'];
    const out = Object.fromEntries(keep.map((k) => [k, structuredClone(this[k])]));
    out.stage = this.stageDef.id;
    out.request = this.request && { id: this.request.def.id, left: this.request.left, given: { ...this.request.given } };
    out.rng = this.r.state;
    out.version = 1;
    return out;
  }

  static load(data, saved) {
    const g = new Olite(data, { stage: saved.stage, difficulty: saved.difficulty, players: saved.players, mode: saved.mode, seed: 1 });
    for (const [k, v] of Object.entries(saved)) if (!['stage', 'request', 'rng', 'version'].includes(k)) g[k] = structuredClone(v);
    g.request = saved.request && { def: g.requestDefs.find((r) => r.id === saved.request.id), left: saved.request.left, given: { ...saved.request.given } };
    g.r.state = saved.rng;
    g.events = [];
    g.computeSupply();
    return g;
  }
}
