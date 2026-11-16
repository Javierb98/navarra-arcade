// A shepherd that plays by itself: the other valley in one-player games, both
// valleys in attract mode, and the crews the balance tests send up the
// mountain. It sees only what a player sees and answers with the same stick
// and buttons, so it can't do anything a child can't.
//
// It leads its flock to the best grass with the bell, fetches strays, takes
// back sheep the neighbours stole, and runs at wolves and the bear. Then it
// cheats, as much as it dares: `greed` (0..1) sets how much of the Peace it is
// willing to spend. An honest shepherd (greed 0) never grazes the neighbours'
// land or steals; a greedy one (greed 1) does whatever pays, even if the
// Peace breaks. In between, it keeps a margin: the lower the Peace, the
// sooner it stops, and when the Peace is low it helps the neighbours with
// their wolves to mend it.

import { pointSegDist } from './geom.js';

const DT = 1 / 60;

export function newShepherd(opts = {}) {
  return { greed: 0.5, pasture: null, cool: 0, stealCool: 8, target: null, detour: 0, ...opts };
}

export function shepherdInput(season, i, brain) {
  const out = { x: 0, y: 0, a: false, b: false, c: false };
  if (season.breakT > 0 || season.finished) return out;
  const R = season.rules, map = season.map, me = season.shepherds[i];
  const flock = season.flocks[i];
  const own = season.sheep.filter((s) => s.side === i && s.carriedBy < 0);
  const pen = map.valleys[i].pen, theirPen = map.valleys[1 - i].pen;
  brain.cool = Math.max(0, brain.cool - DT);
  brain.stealCool = Math.max(0, brain.stealCool - DT);

  // How much of the Peace it will spend: below `margin` it plays fair.
  const greed = brain.greed;
  const margin = greed >= 1 ? -1 : 80 - 50 * greed;
  const dares = greed > 0 && season.peace > margin;

  const d = (p, q = me) => Math.hypot(p.x - q.x, p.y - q.y);
  const walk = (x, y, speed = 1, stop = 3) => {
    const dx = x - me.x, dy = y - me.y, l = Math.hypot(dx, dy);
    if (l > stop) {
      const [ux, uy] = steer(season, me, dx / l, dy / l, brain, Math.min(l, 10));
      out.x = ux * speed; out.y = uy * speed;
    }
    return l;
  };
  const press = (k) => { if (brain.cool <= 0) { out[k] = true; brain.cool = 0.3; } };
  const ring = () => { if (me.bellT < 0.5) out.b = true; };
  const reach = R.shepherd.reach - 4;

  // Into a pen through its gate (on the top fence), or out of it.
  const inside = (p, r) => p.x > r.x + 4 && p.x < r.x + r.w - 4 && p.y > r.y + 4 && p.y < r.y + r.h - 4;
  const toPen = (r) => {
    const gx = (r.gate[0] + r.gate[1]) / 2;
    if (inside(me, r)) return true;
    const lined = Math.abs(me.x - gx) < 7 && me.y < r.y + 2 && me.y > r.y - 26;
    if (lined || (Math.abs(me.x - gx) < 10 && me.y >= r.y - 2)) walk(gx, r.y + r.h / 2, 1, 1);
    else walk(gx, r.y - 14, 1, 2);
    return false;
  };
  // In a pen, or standing in its gateway.
  const atPen = (p, r) => p.x > r.x && p.x < r.x + r.w && p.y > r.y - 3 && p.y < r.y + r.h;
  const outOfPen = (r) => {
    const gx = (r.gate[0] + r.gate[1]) / 2;
    if (Math.abs(me.x - gx) > 6) walk(gx, me.y, 1, 1);
    else walk(gx, r.y - 16, 1, 1);
  };

  // ---- carrying a sheep: home to our pen (or back to our flock) --------------
  if (me.carrying) {
    const sh = me.carrying;
    if (atPen(me, theirPen)) outOfPen(theirPen);
    else if (sh.side !== i || season.inPen(sh, 1 - i)) {
      if (toPen(pen)) press('c');
    } else if (walk(flock.x, flock.y) < 12) press('c');
    return out;
  }
  if (atPen(me, pen) || atPen(me, theirPen)) {
    // Something of ours still in their pen? Pick it up; else walk out.
    const r = atPen(me, pen) ? pen : theirPen;
    const mine = season.sheep.find((s) => s.carriedBy < 0 && (s.origin === i || s.side === i) && inside(s, r));
    if (r === theirPen && mine) { if (walk(mine.x, mine.y) < reach) press('c'); return out; }
    outOfPen(r);
    return out;
  }

  // ---- the bear: shove it off our flock, or join the neighbours ---------------
  const bear = season.bears.find((b) => b.mode !== 'leave');
  if (bear) {
    const other = season.shepherds[1 - i];
    const onUs = d(bear, flock) < R.bear.fear + 20;
    const together = d(other, bear) < R.bear.bellScare + 15 && d(bear) < 160;
    if (onUs || together) {
      if (walk(bear.x, bear.y, 1, R.bear.bellScare - 20) < R.bear.bellScare - 8) ring();
      return out;
    }
  }

  // ---- wolves: ours, or the neighbours' when the Peace needs mending ----------
  const help = greed < 1 && (greed < 0.4 || season.peace < 55);
  const wolf = season.wolves
    .filter((w) => w.mode !== 'leave' && (w.target === i || (help && d(w) < 170)))
    .sort((a, b) => d(a) - d(b))[0];
  if (wolf) {
    if (walk(wolf.x, wolf.y) < R.wolf.bellScare - 10) ring();
    return out;
  }

  // ---- take back what they took -------------------------------------------------
  const taken = season.sheep
    .filter((s) => s.carriedBy < 0 && s.side !== i && s.origin === i && d(s) < 260)
    .sort((a, b) => d(a) - d(b))[0];
  const ours = taken ?? season.sheep.find((s) => s.carriedBy < 0 && s.side === i && season.inPen(s, 1 - i));
  if (ours) {
    // In their pen, go in by the gate first.
    if (inside(ours, theirPen) && !toPen(theirPen)) return out;
    if (walk(ours.x, ours.y) < reach) press('c');
    return out;
  }

  // ---- steal: a lone sheep of theirs, closer to us than to them ---------------------
  if (dares && brain.stealCool <= 0 && (greed >= 1 || season.peace - R.peace.steal > margin)) {
    const them = season.shepherds[1 - i];
    const prey = brain.target && season.sheep[brain.target.id]?.side !== i && season.sheep[brain.target.id].carriedBy < 0
      ? season.sheep[brain.target.id]
      : season.sheep
        .filter((s) => s.side !== i && s.carriedBy < 0 && !season.inPen(s, 1 - i) && d(s) < 90 + 110 * greed && d(s, them) > 60 - 30 * greed)
        .sort((a, b) => d(a) - (a.stray ? 40 : 0) - d(b) + (b.stray ? 40 : 0))[0];
    if (prey) {
      brain.target = prey;
      if (walk(prey.x, prey.y) < reach) { press('c'); brain.target = null; brain.stealCool = 18 - 12 * greed; }
      return out;
    }
  }
  brain.target = null;

  // ---- graze --------------------------------------------------------------------
  const strays = own.filter((s) => s.stray).sort((a, b) => d(a) - d(b));
  if (strays.length && d(strays[0]) < 200) {
    if (d(strays[0]) > 12) walk(strays[0].x, strays[0].y);
    else { ring(); walk(flock.x, flock.y, 0.45); }
    return out;
  }
  if (d(flock) > 42) { walk(flock.x, flock.y); return out; }
  const p = choosePasture(season, i, brain, dares && season.peace > margin + 10);
  if (p && (Math.hypot(flock.x - p.x, flock.y - p.y) > 14 || d(p) > 10)) { ring(); walk(p.x, p.y, 0.42); }
  return out;
}

// Is there room to stand at (x, y)?
function clear(season, x, y) {
  const W = season.world;
  if (x < 6 || y < 18 || x > season.map.w - 6 || y > season.map.h - 6) return false;
  for (const c of W.circles) if (Math.hypot(x - c.x, y - c.y) < c.r + 5) return false;
  for (const w of W.walls) if (pointSegDist(x, y, w.x1, w.y1, w.x2, w.y2) < 6) return false;
  return true;
}

// Head for (ux, uy), or the nearest free heading beside it. Once it starts
// going round something it keeps to that side until the way is clear.
const TURNS = [35, 70, 105, 140].map((d) => (d * Math.PI) / 180);
function steer(season, me, ux, uy, brain, probe) {
  if (clear(season, me.x + ux * probe, me.y + uy * probe)) { brain.detour = 0; return [ux, uy]; }
  const signs = brain.detour ? [brain.detour, -brain.detour] : [1, -1];
  for (const a of TURNS) {
    for (const sg of signs) {
      const c = Math.cos(a * sg), sn = Math.sin(a * sg);
      const vx = ux * c - uy * sn, vy = ux * sn + uy * c;
      if (clear(season, me.x + vx * probe, me.y + vy * probe)) { brain.detour = sg; return [vx, vy]; }
    }
  }
  return [ux, uy];
}

// The best grass it may use: its own, the shared pass, and (when it dares)
// the neighbours'. Away from the bear and from the other flock.
function choosePasture(season, i, brain, trespass) {
  const pastures = season.map.pastures, W = season.world;
  const flock = season.flocks[i], other = season.flocks[1 - i];
  const bear = season.bears.find((b) => b.mode !== 'leave');
  const value = (idx) => {
    const p = pastures[idx];
    let v = season.meanGrass(W.pastureCells[idx]);
    if (p.owner === 1 - i) v = trespass ? v - 0.1 : -1;
    if (Math.hypot(p.x - other.x, p.y - other.y) < p.rx) v -= 0.25;
    if (bear && Math.hypot(p.x - bear.x, p.y - bear.y) < p.rx + 40) v -= 1;
    v -= Math.hypot(p.x - flock.x, p.y - flock.y) / 1000;
    return v;
  };
  const all = pastures.map((_, idx) => idx);
  let best = all.reduce((a, b) => (value(b) > value(a) ? b : a));
  const cur = brain.pasture;
  if (cur != null && value(cur) > -0.5 && season.meanGrass(W.pastureCells[cur]) > 0.35 && value(best) < value(cur) + 0.2) best = cur;
  brain.pasture = best;
  return value(best) > -0.5 ? pastures[best] : null;
}
