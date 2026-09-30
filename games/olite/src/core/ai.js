// A sensible town council, used for the attract-mode demo and the balance
// tests. Each play it scores the cards it could play right now and plays the
// best one; when nothing is worth playing it ends the season. It only makes
// the moves a player could make.

const GOAL = 100;

function want(town, cardId) {
  const def = town.cardDefs[cardId];
  const goal = town.stage.goal;
  const still = (id) => Math.max(0, (goal[id] ?? 0) - town.count(id));
  const food = town.res.food, eat = town.foodNeeded();
  const hungry = food < eat * 2;

  if (def.build) {
    const b = def.build;
    if (still(b) > 0) return GOAL + (b === 'wall' ? 30 : b === 'press' ? 20 : 0);
    // Beyond the goal, only what the town needs: don't spend the coin and
    // timber the walls will want.
    if (b === 'field') return hungry ? 80 : town.count('field') < 2 ? 40 : 0;
    if (b === 'house') return town.pop < 6 ? 30 : 0;
    if (b === 'mill') return town.count('field') >= 2 && hungry ? 35 : 0;
    if (b === 'quarry') return still('wall') && town.res.stone < 5 ? 45 : 0;
    if (b === 'market') return town.count('market') ? 0 : 20;
    return 0;
  }
  if (def.hire) {
    if (def.hire === 'mason') return still('wall') && !town.count('mason') ? 90 : 0;
    if (def.hire === 'carpenter') return town.count('carpenter') ? 0 : 25;
    if (def.hire === 'merchant') return town.count('merchant') ? 0 : 15;
  }
  // Supply cards: worth it when that resource is short for something we need.
  if (def.workers) return 20;
  if (def.gain?.food) return hungry ? 75 : 0;
  if (def.sell) return town.res.wine >= 2 ? 40 : 0;
  if (def.gain?.stone) return town.res.stone < 6 && (still('wall') || still('house') || still('press')) ? 60 : 0;
  if (def.gain?.timber) return town.res.timber < 3 && (still('house') || still('press') || still('wall')) ? 55 : 0;
  return 0;
}

// Play one turn for player p: returns the list of actions taken.
export function aiTurn(town, p = 0) {
  const done = [];
  for (let guard = 0; guard < 12 && !town.finished; guard++) {
    let best = null, bestScore = 0;
    for (const plan of town.plansFor(p)) {
      if (!town.checkPlan(p, plan.id).ok) continue;
      const s = want(town, plan.id);
      if (s > bestScore) { bestScore = s; best = { plan: plan.id }; }
    }
    town.hands[p].forEach((c, i) => {
      if (!town.check(p, i).ok) return;
      const s = want(town, c.id);
      if (s > bestScore) { bestScore = s; best = { i }; }
    });
    if (!best) break;
    if (best.plan) { done.push(best.plan); town.build(p, best.plan); }
    else { done.push(town.hands[p][best.i].id); town.play(p, best.i); }
  }
  // Clear out dead cards so next season's draw brings something useful.
  if (!town.finished && town.hands[p].length && town.swapsLeft[p] > 0) {
    let worst = -1, worstScore = Infinity;
    town.hands[p].forEach((c, i) => { const s = want(town, c.id); if (s < worstScore) { worstScore = s; worst = i; } });
    if (worst >= 0 && worstScore <= 0) {
      town.discard(p, worst);
      if (town.events.some((e) => e.swap)) return done.concat(aiTurn(town, p)); // the swap may bring something playable
    }
  }
  return done;
}

// Play a whole stage; returns the town.
export function autoplay(town, maxSeasons = 60) {
  for (let s = 0; s < maxSeasons && !town.finished; s++) {
    for (let p = 0; p < town.players && !town.finished; p++) aiTurn(town, p);
    for (let p = 0; p < town.players && !town.finished; p++) town.endTurn(p);
  }
  return town;
}
