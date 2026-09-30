// One stage of Piedra por piedra: the town of Olite, its cards and its
// seasons. Pure simulation, like Almadía's race: no DOM, no clock and no
// Math.random, so the tests, the balance sweep and the attract-mode player
// can run it headless and replay it from a seed.
//
// A season goes: an event may turn up, buildings produce, everyone draws up
// to their hand size, the players build from the plans (always on show) and
// play action cards from their hands, paying resources and this season's
// workers, then the town eats. Reaching the stage goal wins; on
// Normal, running out of seasons ends the stage without winning it.
//
// After every public call, `events` lists what happened, for the UI.

import { makeRng } from './rng.js';

export const RES = ['food', 'wine', 'stone', 'timber', 'coin'];

export class Town {
  constructor({ rules, cards, buildings, events, stage, difficulty = 'normal', players = 1, seed = 1 }) {
    this.rules = rules;
    this.defs = buildings;
    this.cardDefs = Object.fromEntries([...cards.plans, ...cards.cards].map((c) => [c.id, c]));
    this.plans = cards.plans;
    this.eventDefs = events.events;
    this.stage = stage;
    this.players = players === 2 ? 2 : 1;
    this.difficulty = rules.difficulty[difficulty] ? difficulty : 'normal';
    this.diff = rules.difficulty[this.difficulty];
    this.rng = makeRng(seed);
    this.events = [];

    this.res = Object.fromEntries(RES.map((r) => [r, 0]));
    for (const [r, n] of Object.entries(stage.start.resources)) this.res[r] = n;
    for (const [r, n] of Object.entries(this.diff.bonusStart ?? {})) this.res[r] += n;
    this.built = { ...stage.start.buildings };
    this.people = { ...stage.start.people };
    this.left = 0; // people who left town for lack of food
    this.hungerSeasons = 0;
    this.season = 0;
    this.finished = false;
    this.won = false;
    this.current = null; // this season's event, if any

    this.handSize = this.players === 2 ? rules.twoPlayer.hand : this.diff.hand;
    this.playsPer = this.players === 2 ? rules.twoPlayer.plays : this.diff.plays;
    this.uid = 0;
    this.decks = [[], []];
    this.discards = [[], []];
    this.hands = [[], []];
    for (const c of cards.cards) {
      for (let k = 0; k < c.count; k++) {
        const owner = this.players === 2 && c.role === 'builder' ? 1 : 0;
        this.decks[owner].push(this.card(c.id));
      }
    }
    for (const d of this.decks) this.rng.shuffle(d);
    this.startSeason();
  }

  card(id) { return { uid: ++this.uid, id }; }

  // ---- queries ------------------------------------------------------------------

  get seasonName() { return this.rules.seasonNames[this.season % 4]; }
  get year() { return Math.floor(this.season / 4) + 1; }
  get seasonLimit() { return this.diff.seasonLimit ? this.stage.seasons : null; }
  get seasonsLeft() { return this.seasonLimit == null ? null : this.seasonLimit - this.season; }

  get pop() {
    let p = 0;
    for (const [b, n] of Object.entries(this.built)) p += (this.defs.buildings[b]?.pop ?? 0) * n;
    return Math.max(0, p - this.left);
  }

  count(id) { return (this.built[id] ?? 0) + (this.people[id] ?? 0); }

  foodNeeded() {
    return Math.ceil(this.pop * this.rules.eatPerPerson) + (this.seasonName === 'winter' ? this.rules.winterEat : 0) + this.extraEat;
  }

  // What a card really costs, after discounts (the carpenter saves timber).
  costOf(cardId) {
    const def = this.cardDefs[cardId], cost = { ...def.cost };
    if (def.build) {
      for (const [who, n] of Object.entries(this.people)) {
        for (const [r, off] of Object.entries(this.defs.people[who]?.discount ?? {})) {
          if (cost[r]) cost[r] = Math.max(0, cost[r] - off * n);
        }
      }
    }
    return cost;
  }

  // The plans player p may build from (all of them, or their role's with two players).
  plansFor(p) {
    if (this.players === 1) return this.plans;
    const role = p === 0 ? 'town' : 'builder';
    return this.plans.filter((x) => x.role === role);
  }

  // Can player p play hand card i? Says why not, so the UI can show it.
  check(p, i) {
    const c = this.hands[p][i];
    if (!c || this.finished) return { ok: false };
    return this.checkDef(p, c.id);
  }

  checkPlan(p, planId) {
    if (this.finished || !this.plansFor(p).some((x) => x.id === planId)) return { ok: false };
    return this.checkDef(p, planId);
  }

  checkDef(p, id) {
    const def = this.cardDefs[id], cost = this.costOf(id);
    const missing = {};
    for (const [r, n] of Object.entries(cost)) {
      const have = r === 'workers' ? this.workers : this.res[r];
      if (have < n) missing[r] = n - have;
    }
    const needs = {};
    for (const [b, n] of Object.entries(def.needs ?? {})) if (this.count(b) < n) needs[b] = n - this.count(b);
    const noPlays = this.playsLeft[p] <= 0;
    const ok = !noPlays && !Object.keys(missing).length && !Object.keys(needs).length;
    return { ok, cost, missing, needs, noPlays };
  }

  goalProgress() {
    return Object.entries(this.stage.goal).map(([id, need]) => ({ id, need, have: Math.min(need, this.count(id)) }));
  }

  goalMet() { return this.goalProgress().every((g) => g.have >= g.need); }

  // ---- actions (each clears and refills `events`) ----------------------------------

  // Build from a plan.
  build(p, planId) {
    this.events = [];
    const chk = this.checkPlan(p, planId);
    if (!chk.ok) { this.emit('cantPlay', { p, plan: planId, ...chk }); return false; }
    this.apply(p, planId, chk.cost);
    return true;
  }

  // Play a card from the hand.
  play(p, i) {
    this.events = [];
    const chk = this.check(p, i);
    if (!chk.ok) { this.emit('cantPlay', { p, i, ...chk }); return false; }
    const c = this.hands[p].splice(i, 1)[0];
    this.discards[this.players === 2 ? p : 0].push(c);
    this.apply(p, c.id, chk.cost);
    return true;
  }

  apply(p, id, cost) {
    const def = this.cardDefs[id];
    const c = { id };
    const chk = { cost };
    for (const [r, n] of Object.entries(chk.cost)) {
      if (r === 'workers') this.workers -= n;
      else this.res[r] -= n;
    }
    if (def.build) this.built[def.build] = (this.built[def.build] ?? 0) + 1;
    if (def.hire) this.people[def.hire] = (this.people[def.hire] ?? 0) + 1;
    for (const [r, n] of Object.entries(def.gain ?? {})) this.res[r] += n;
    if (def.workers) this.workers += def.workers;
    if (def.sell) {
      const [give, get] = Object.keys(def.sell);
      const k = Math.floor(this.res[give] / def.sell[give]);
      this.res[give] -= k * def.sell[give];
      this.res[get] += k * def.sell[get];
      if (k) this.emit('sold', { give, get, n: k * def.sell[get] });
    }
    this.playsLeft[p]--;
    this.emit(def.build ? 'built' : 'played', { p, card: c.id });
    if (this.goalMet()) this.finish(true);
  }

  // Throw a card away. Once a season it's a swap: you draw a new one at once.
  // After that you draw back up next season.
  discard(p, i) {
    this.events = [];
    const c = this.hands[p].splice(i, 1)[0];
    if (!c) return false;
    this.discards[this.players === 2 ? p : 0].push(c);
    const swap = this.swapsLeft[p] > 0;
    if (swap) { this.swapsLeft[p]--; this.draw(p, this.hands[p].length + 1, i); }
    this.emit('discarded', { p, card: c.id, swap });
    return true;
  }

  // Two players: hand a card to your partner.
  pass(p, i) {
    this.events = [];
    const q = 1 - p;
    if (this.players !== 2 || this.hands[q].length >= this.handSize + 2) return false;
    const c = this.hands[p].splice(i, 1)[0];
    if (!c) return false;
    this.hands[q].push(c);
    this.emit('passed', { p, card: c.id });
    return true;
  }

  // One player: ends the season. Two players: the season ends when both are done.
  endTurn(p) {
    this.events = [];
    if (this.finished) return;
    this.done[p] = true;
    if (this.players === 1 || this.done.every(Boolean)) this.endSeason();
    else this.emit('waiting', { p });
  }

  // ---- the seasons ----------------------------------------------------------------

  emit(type, extra = {}) { this.events.push({ type, ...extra }); }

  startSeason() {
    this.current = null;
    this.yieldMul = {};
    this.yieldBonus = {};
    this.extraEat = 0;
    this.workers = this.pop;
    this.playsLeft = [this.playsPer, this.players === 2 ? this.playsPer : 0];
    this.swapsLeft = [this.rules.swapsPerSeason, this.players === 2 ? this.rules.swapsPerSeason : 0];
    this.done = [false, this.players === 1];
    this.emit('season', { season: this.seasonName, year: this.year });
    this.rollEvent();
    this.produce();
    for (let p = 0; p < this.players; p++) this.draw(p);
  }

  rollEvent() {
    if (!this.rng.chance(this.rules.eventChance)) return;
    const pool = this.eventDefs.filter((e) => (!e.seasons || e.seasons.includes(this.seasonName)) && (e.good || !this.diff.eventGoodOnly));
    const total = pool.reduce((s, e) => s + e.weight, 0);
    if (!total) return;
    let roll = this.rng.next() * total, ev = pool[0];
    for (const e of pool) { roll -= e.weight; if (roll <= 0) { ev = e; break; } }
    this.current = ev.id;
    for (const [r, n] of Object.entries(ev.gain ?? {})) this.res[r] += n;
    for (const [r, n] of Object.entries(ev.lose ?? {})) this.res[r] = Math.max(0, this.res[r] - n);
    Object.assign(this.yieldMul, ev.yieldMul ?? {});
    Object.assign(this.yieldBonus, ev.yieldBonus ?? {});
    this.extraEat += ev.eat ?? 0;
    this.workersDelta = ev.workers ?? 0;
    if (ev.addCard) {
      const owner = this.players === 2 && this.cardDefs[ev.addCard].role === 'builder' ? 1 : 0;
      this.hands[owner].push(this.card(ev.addCard));
    }
    this.emit('event', { id: ev.id, good: ev.good });
  }

  produce() {
    const season = this.seasonName, made = {};
    const add = (who, r, n) => {
      if (n <= 0) return;
      this.res[r] += n;
      made[r] = (made[r] ?? 0) + n;
      this.emit('produced', { who, res: r, n });
    };
    for (const [b, count] of Object.entries(this.built)) {
      const def = this.defs.buildings[b];
      if (!def?.produce || !count || !def.seasons?.includes(season)) continue;
      const mul = this.yieldMul[b] ?? 1;
      for (const [r, n] of Object.entries(def.produce)) {
        let per = n;
        // Other buildings that boost this one (the mill for fields, the press for vineyards).
        for (const [o, oc] of Object.entries(this.built)) per += (this.defs.buildings[o]?.boost?.[b]?.[r] ?? 0) * Math.min(1, oc);
        per += this.yieldBonus[b]?.[r] ?? 0;
        add(b, r, Math.round(per * count * mul));
      }
    }
    for (const [who, count] of Object.entries(this.people)) {
      const def = this.defs.people[who];
      if (def?.produce && def.seasons?.includes(season)) for (const [r, n] of Object.entries(def.produce)) add(who, r, n * count);
      if (def?.trade) {
        const { give, get, times } = def.trade;
        const [g] = Object.keys(give), [t] = Object.keys(get);
        for (let k = 0; k < times * count && this.res[g] >= give[g]; k++) { this.res[g] -= give[g]; add(who, t, get[t]); }
      }
    }
    this.workers = Math.max(0, this.workers + (this.workersDelta ?? 0));
    this.workersDelta = 0;
    this.lastMade = made;
  }

  // Draw up to `upTo` cards (the hand size by default); `at` puts a single
  // replacement card back where the old one was.
  draw(p, upTo = this.handSize, at = null) {
    const d = this.players === 2 ? p : 0;
    while (this.hands[p].length < upTo) {
      if (!this.decks[d].length) {
        if (!this.discards[d].length) break;
        this.decks[d] = this.rng.shuffle(this.discards[d]);
        this.discards[d] = [];
      }
      const c = this.decks[d].pop();
      if (at != null) this.hands[p].splice(at, 0, c);
      else this.hands[p].push(c);
    }
  }

  endSeason() {
    const need = this.foodNeeded();
    if (this.res.food >= need) {
      this.res.food -= need;
      this.emit('ate', { n: need });
    } else {
      // Not enough bread: a family leaves to look for work elsewhere.
      this.emit('ate', { n: this.res.food });
      this.res.food = 0;
      this.left += this.rules.hungerLeaves;
      this.hungerSeasons++;
      this.emit('hunger', { left: this.rules.hungerLeaves });
    }
    this.season++;
    if (this.seasonLimit != null && this.season >= this.seasonLimit) { this.finish(false); return; }
    this.startSeason();
  }

  finish(won) {
    this.finished = true;
    this.won = won;
    this.emit(won ? 'won' : 'timeUp');
  }

  score() {
    const S = this.rules.score;
    const goal = this.goalProgress().reduce((s, g) => s + g.have, 0);
    const parts = {
      goal: goal * S.goalItem,
      seasons: this.won && this.seasonsLeft != null ? this.seasonsLeft * S.seasonLeft : 0,
      people: this.pop * S.person,
      wine: this.res.wine * S.wine,
      coin: this.res.coin * S.coin,
      hunger: -this.hungerSeasons * S.hungerPenalty,
    };
    return { parts, total: Math.max(0, Object.values(parts).reduce((a, b) => a + b, 0)) };
  }

  // One star for finishing the stage, more for finishing early and never going hungry.
  stars() {
    if (!this.won) return 0;
    const spare = this.seasonsLeft ?? Math.max(0, this.stage.seasons - this.season);
    const fed = this.hungerSeasons === 0;
    if (fed && spare >= this.rules.stars.three) return 3;
    if (fed || spare >= this.rules.stars.two) return 2;
    return 1;
  }
}
