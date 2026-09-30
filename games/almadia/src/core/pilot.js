// A reasonable crew, used for the attract-mode demo and the balance tests.
// It looks down the river, picks the lane with the most room, steers into
// it, picks up orders it can reach, and re-lashes in an eddy when logs start
// coming loose. Same inputs a player would give, nothing more.

import { clamp, pointSegDist } from './geom.js';

const CAP = 18;
// Candidate lanes every 4px across the river, as offsets from the centre
// in units of the half-width.
function lanes(hw) {
  const out = [];
  const step = 4 / hw;
  for (let s = -0.85; s <= 0.851; s += step) out.push(s);
  return out;
}

// Room around the raft's centreline at (x, y); negative means a hit.
function clearance(race, x, y, half) {
  const rv = race.river;
  let best = rv.hwAt(y) - Math.abs(x - rv.cxAt(y));
  for (const h of race.hazards) {
    if (y < h.minY - 40 || y > h.maxY + 40) continue;
    const d = pointSegDist(x, y, h.x1, h.y1, h.x2, h.y2) - h.r;
    if (d < best) best = d;
  }
  for (const w of race.whirls) {
    const d = Math.hypot(x - w.x, y - w.y) - w.r * 1.3; // give its pull a wide berth
    if (d < best) best = d;
  }
  // Debris drifts slower than the raft, so we meet it further downstream
  // than where it is now: check where it will be.
  const k = race.rules.raft.debrisSpeed, ahead = k / (1 - k);
  for (const d of race.debris) {
    const meet = d.y + Math.max(0, d.y - race.raft.y) * ahead;
    if (Math.abs(y - meet) > 50) continue;
    const dd = Math.hypot(x - d.x, y - meet) - d.len / 2 - 4;
    if (dd < best) best = dd;
  }
  for (const u of race.users) {
    const d = Math.hypot(x - u.x, y - u.y) - u.r - 6;
    if (d < best) best = d;
  }
  for (const k of race.ducks) {
    if (k.flying) continue;
    const d = Math.abs(y - k.y) < 30 ? Math.abs(x - k.baseX) - k.range - 4 : 99;
    if (d < best) best = d;
  }
  return best - half;
}

export function chooseTarget(race) {
  const { raft, river } = race;
  const half = race.rules.raft.width / 2 + 2;
  const L = race.rules.raft.length / 2;

  // Loose logs: head for the next eddy if there is one close enough.
  if (raft.loose || raft.lashing < 70) {
    const e = race.eddies.find((q) => q.y > raft.y - 10 && q.y - raft.y < 320
      && !race.weirs.some((w) => w.y > raft.y && w.y < q.y)); // not through a weir wall
    if (e) return { x: e.x, y: e.y, eddy: e };
  }

  let bestS = 0, bestV = -Infinity, bestY = raft.y + L + 40;
  const hw0 = river.hwAt(raft.y);
  for (const s of lanes(hw0)) {
    let v = CAP, tightY = raft.y + L + 40;
    for (let dy = 0; dy <= L + 190; dy += 10) {
      const y = raft.y + dy;
      const c = clearance(race, river.cxAt(y) + s * river.hwAt(y), y, half);
      // Nearer trouble matters more: it is harder to dodge.
      const w = c < CAP ? c + (dy - L) * 0.02 : CAP;
      if (w < v) { v = w; tightY = y; }
    }
    for (const d of race.docks) {
      if (d.done || d.y < raft.y || d.y - raft.y > 260) continue;
      const x = river.cxAt(d.y) + s * river.hwAt(d.y);
      if (Math.abs(x - d.x) < d.r - 12) v += 20;
    }
    // Prefer lanes the raft can actually reach before the tight spot: it
    // slides sideways at about 30px/s at best.
    const tx = river.cxAt(tightY) + s * river.hwAt(tightY);
    const secs = Math.max(0.4, (tightY - raft.y - L) / Math.max(25, raft.vy));
    const need = Math.abs(tx - raft.x) / secs;
    // Capped, so a far lane that is open still beats a near one that is blocked.
    v -= Math.abs(tx - raft.x) * 0.04 + Math.min(12, Math.max(0, need - 22) * 1.2);
    if (v > bestV) { bestV = v; bestS = s; bestY = tightY; }
  }
  // Aim at where the lane is tightest: that is the point that has to be hit.
  return { x: river.cxAt(bestY) + bestS * river.hwAt(bestY), y: bestY, room: bestV };
}

export function pilotInput(race) {
  const { raft } = race;
  const p1 = { x: 0, a: false, b: false, c: false };
  const p2 = { x: 0, a: false, b: false, c: false };
  const both = (k, v) => { p1[k] = v; p2[k] = v; };

  if (race.lash.active) {
    const beat = race.lashBeat();
    if (beat > race.lash.knotBeat && race.lash.pressed[0] !== beat) both('c', true);
    return { p1, p2 };
  }
  if (race.canLash()) { both('c', true); return { p1, p2 }; }

  const target = chooseTarget(race);
  let lat = clamp((target.x - raft.x) * 0.08 - raft.vx * 0.12);

  // Sitting still in an eddy with a sound raft: push off towards the middle.
  const stalled = race.speed() < 12 && raft.lashing >= 70;
  if (stalled) {
    lat = clamp((race.river.cxAt(raft.y) - raft.x) * 0.05);
    if (raft.strokeCd[0] <= 0) both('a', true);
  }

  // Brake when a tight spot is coming and we're not lined up yet: what a
  // good crew does before a weir or a bridge.
  const gap = target.y - raft.y - race.rules.raft.length / 2;
  const tight = target.room != null && target.room < 10;
  if (!stalled && tight && gap > 0 && gap < 170 && Math.abs(target.x - raft.x) > 10) { p1.y = 1; p2.y = 1; }

  if (race.players === 1) {
    p1.x = lat;
  } else {
    const turn = clamp(-(raft.angle * 2.8 + raft.w * 1.6));
    p1.x = clamp(lat + turn);
    p2.x = clamp(lat - turn);
  }
  return { p1, p2 };
}
