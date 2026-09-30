// A sensible town council, used for the attract-mode demo and the balance
// sweep. It makes only the moves a player can make: put out fires, feed the
// hungriest blocks, answer the king, build the projects, buy what's missing.

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// How much unmet hunger a bread source at (x, y) would fix.
function gainAt(g, x, y, sup) {
  let gain = 0;
  for (const b of g.blocks) {
    if (!b.pop || b.burning) continue;
    const d = cheb(b, { x, y });
    const give = d === 0 ? sup.own : d === 1 ? sup.near : 0;
    if (give) gain += Math.min(give, Math.max(0, b.pop - b.supply));
  }
  return gain;
}

function bestTile(g, sup, lotOnly) {
  let best = null, bestGain = 0;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    if (!g.canPlaceAt(x, y, lotOnly)) continue;
    const gain = gainAt(g, x, y, sup);
    if (gain > bestGain) { bestGain = gain; best = { x, y }; }
  }
  return best && { tile: best, gain: bestGain };
}

// Cards still needed by unfinished projects, request included.
function stillNeeded(g) {
  const need = {};
  for (const def of g.projectDefs) {
    const pr = g.projects[def.id];
    if (pr.done || (def.repeatable && g.wells.length >= 2) || !g.projectOpen(def.id)) continue;
    for (const [c, n] of Object.entries(def.needs)) need[c] = (need[c] ?? 0) + Math.max(0, n - (pr.progress[c] ?? 0));
  }
  if (g.request?.def.need) for (const [c, n] of Object.entries(g.request.def.need)) need[c] = (need[c] ?? 0) + Math.max(0, n - (g.request.given[c] ?? 0));
  return need;
}

export function councilTurn(g, p = 0) {
  const hand = () => g.hands[p];
  const useFirst = (pred, target) => {
    const i = hand().findIndex((c) => pred(c) && g.check(p, i2(c), typeof target === 'function' ? target(c) : target).ok);
    function i2(c) { return hand().indexOf(c); }
    if (i < 0) return false;
    return g.use(p, i, typeof target === 'function' ? target(hand()[i]) : target);
  };

  for (let guard = 0; guard < 30 && !g.finished; guard++) {
    let acted = false;
    // 1. Fires first.
    const fire = g.blocks.find((b) => b.burning);
    if (fire) acted = useFirst((c) => c.id === 'buckets', { tile: { x: fire.x, y: fire.y } }) || acted;
    // 2. Answer the king.
    if (!acted && g.request?.def.need) acted = useFirst((c) => g.request?.def.need[c.id], { request: true });
    // 3. Feed the hungry: place bakers and ovens where they help most.
    if (!acted) {
      for (const [i, c] of hand().entries()) {
        const def = g.cardDefs[c.id];
        if (!def.supply) continue;
        const spot = bestTile(g, def.supply, def.lot);
        if (spot && spot.gain >= 1) { acted = g.use(p, i, { tile: spot.tile }); break; }
      }
    }
    // 4. Feed the projects (the goal ones first).
    if (!acted) {
      for (const def of [...g.projectDefs].sort((a, b) => (b.effect.goal ? 1 : 0) - (a.effect.goal ? 1 : 0))) {
        if (def.repeatable && g.wells.length >= 2) continue;
        if (!g.projectOpen(def.id)) continue;
        if (useFirst((c) => def.needs[c.id], { project: def.id })) { acted = true; break; }
      }
    }
    // 5. Finish what's ready.
    if (!acted) {
      for (const def of g.projectDefs) {
        if (!g.projectReady(def.id)) continue;
        let tile = null;
        if (def.lot === 'any') {
          // A well where the most people live.
          let best = -1;
          for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
            if (!g.canPlaceAt(x, y, true)) continue;
            const v = g.blocks.filter((b) => cheb(b, { x, y }) <= def.effect.protect).reduce((s, b) => s + b.pop, 0);
            if (v > best) { best = v; tile = { x, y }; }
          }
        }
        if (g.canFinish(def.id, tile).ok) { g.finish(def.id, tile); acted = true; break; }
      }
    }
    // 6. A fire watch where fires would hurt most, if there are fires about.
    if (!acted && g.stats.fires > g.wells.length) {
      const i = hand().findIndex((c) => c.id === 'firewatch');
      if (i >= 0) {
        const spot = bestTile(g, { own: 0, near: 0 }, false);
        const t = spot?.tile ?? [...g.blocks].sort((a, b) => b.pop - a.pop).map((b) => ({ x: b.x, y: b.y })).find((b) => g.canPlaceAt(b.x, b.y, false));
        if (t) acted = g.use(p, i, { tile: t });
      }
    }
    // 7. Gifts for favour when it runs low.
    if (!acted && g.favour < 8) acted = useFirst((c) => c.id === 'gift' && !(g.request?.def.need?.gift), { favour: true });
    // 8. Buy what's missing: bread first when people are hungry, then ingredients.
    if (!acted) {
      const hungry = g.unhappy().length;
      const need = stillNeeded(g);
      const want = g.shop.map((id, slot) => ({ id, slot })).filter((o) => o.id && g.cardDefs[o.id].price <= g.coin);
      // Bread first: a baker if one would help, an oven for a crowded corner.
      const breadNeed = hungry > 0 && want.filter((o) => g.cardDefs[o.id].supply).map((o) => ({ ...o, spot: bestTile(g, g.cardDefs[o.id].supply, g.cardDefs[o.id].lot) })).filter((o) => o.spot?.gain >= 1).sort((a, b) => b.spot.gain - a.spot.gain)[0];
      const pick = breadNeed
        || want.find((o) => (need[o.id] ?? 0) > 0 && g.coin - g.cardDefs[o.id].price >= 3)
        || (g.stats.fires > 0 && want.find((o) => o.id === 'buckets' && !hand().some((c) => c.id === 'buckets')));
      if (pick) acted = g.buy(p, pick.slot);
    }
    if (!acted) break;
  }
  // Keep useful ingredients for later; the rest go back in the deck.
  const need = stillNeeded(g);
  for (let i = hand().length - 1; i >= 0 && g.warehouse.length < g.rules.warehouse; i--) {
    if ((need[hand()[i].id] ?? 0) > 0) g.store(p, i);
  }
  // Take stored cards back out if they can be used now.
  for (let s = g.warehouse.length - 1; s >= 0; s--) {
    const id = g.warehouse[s].id;
    if (g.targetsFor(id).some((t) => t.project || t.request)) { g.unstore(p, s); }
  }
}

export function autoplay(g, maxTurns = 120) {
  for (let t = 0; t < maxTurns && !g.finished; t++) {
    for (let p = 0; p < g.players && !g.finished; p++) { councilTurn(g, p); councilTurn(g, p); }
    for (let p = 0; p < g.players && !g.finished; p++) g.endTurn(p);
  }
  return g;
}
