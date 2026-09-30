// A shepherd that plays by itself: the other valley in one-player games, both
// valleys in attract mode, and the crews the balance tests send up the
// mountain. It sees only what a player sees and answers with the same stick
// and buttons, so it can't do anything a child can't.
//
// It leads with the bell (walk slowly, ring, the flock follows) and fetches
// strays. When the valleys trust each other it also helps the neighbours:
// returns their strays, carries their lamb home, tops up their trough and
// sees off wolves heading for their flock. When trust is low it minds its own
// flock and its own side. A `greedy` shepherd never helps and grazes wherever
// the grass is best until it is gone; the tests use it to show why the treaty
// was needed.

import { pointSegDist } from './geom.js';

const DT = 1 / 60;

export function newShepherd(opts = {}) {
  return { greedy: false, kind: null, pasture: null, cool: 0, helpT: 0, thirsty: false, ...opts };
}

export function shepherdInput(season, i, brain) {
  const out = { x: 0, y: 0, a: false, b: false, c: false };
  if (season.breakT > 0 || season.finished) return out;
  const R = season.rules, map = season.map, me = season.shepherds[i];
  const flock = season.flocks[i], other = season.flocks[1 - i];
  const own = season.sheep.filter((s) => s.side === i);
  const week = season.weekDef;
  const kind = brain.kind ?? (!brain.greedy && (season.diff.alwaysKind || season.trust >= R.trust.kindAt));
  brain.cool = Math.max(0, brain.cool - DT);
  brain.helpT = Math.max(0, brain.helpT - DT);

  const d = (p, q = me) => Math.hypot(p.x - q.x, p.y - q.y);
  const walk = (x, y, speed = 1, stop = 3) => {
    const dx = x - me.x, dy = y - me.y, l = Math.hypot(dx, dy);
    if (l > stop) {
      const [ux, uy] = steer(season, me, dx / l, dy / l, brain, Math.min(l, 10));
      out.x = ux * speed; out.y = uy * speed;
    }
    return l;
  };
  const press = (k) => { if (brain.cool <= 0) { out[k] = true; brain.cool = 0.35; } };
  const ring = () => { if (me.bellT < 0.5) out.b = true; };

  // Walk somewhere with the flock in tow. `via` is a doorway to pass first.
  const lead = (tx, ty, via = null) => {
    const strays = own.filter((s) => s.stray).sort((a, b) => d(a) - d(b));
    if (strays.length && d(strays[0]) < 220) {
      if (d(strays[0]) > 14) walk(strays[0].x, strays[0].y);
      else { ring(); walk(flock.x, flock.y, 0.45); }
      return;
    }
    if (d(flock) > 42) { walk(flock.x, flock.y); return; }
    let gx = tx, gy = ty;
    if (via && !via.inside(me)) {
      // Line up with the doorway before walking through it.
      const [ux, uy] = unit(tx - via.x, ty - via.y);
      const rx = me.x - via.x, ry = me.y - via.y;
      const along = rx * ux + ry * uy, lateral = Math.abs(rx * uy - ry * ux);
      if (!(along > -3 && lateral < 7)) { gx = via.x; gy = via.y; }
    }
    if (Math.hypot(flock.x - tx, flock.y - ty) < 12 && d({ x: tx, y: ty }) < 8) return;
    ring();
    walk(gx, gy, 0.42);
  };

  // ---- the lost lamb ------------------------------------------------------
  const L = season.lamb;
  if (me.carrying) {
    const f = season.flocks[L.side];
    walk(f.x, f.y);
    return out;
  }
  if (L && L.state === 'lost' && (L.side === i || kind) && d(L) < 170) {
    if (walk(L.x, L.y) < R.shepherd.reach - 6) press('c');
    return out;
  }

  // ---- wolves -------------------------------------------------------------
  const wolf = season.wolves
    .filter((w) => w.mode !== 'leave' && (w.target === i || (kind && d(w) < 140)))
    .sort((a, b) => d(a) - d(b))[0];
  if (wolf) {
    if (walk(wolf.x, wolf.y) < R.wolf.bellScare - 10) ring();
    return out;
  }

  // ---- a fire for the night ------------------------------------------------
  if (season.weather.night || season.weather.fog > 0.5) {
    const lit = season.fires.some((f) => f.lit && d(f, flock) < 90);
    const fire = season.fires.filter((f) => !f.lit && d(f, flock) < 110).sort((a, b) => d(a, flock) - d(b, flock))[0];
    if (!lit && fire) {
      if (walk(fire.x, fire.y) < R.shepherd.reach - 6) press('c');
      return out;
    }
  }

  // ---- gates ---------------------------------------------------------------
  const valley = map.valleys[i], pen = valley.pen;
  const gate = season.gates.find((g) => g.kind === 'pen' && g.side === i);
  const gx = (gate.x1 + gate.x2) / 2;
  const penDoor = { x: gx, y: pen.y - 12, inside: (p) => p.y > pen.y + 4 && p.x > pen.x && p.x < pen.x + pen.w };
  const inPen = own.filter((s) => season.inPen(s)).length / own.length;
  if (!gate.open && ((week.goal === 'moveUp' && inPen > 0.3) || (week.goal === 'moveDown' && inPen < 0.9))) {
    const side = me.y < pen.y ? -8 : 8;
    if (walk(gx, pen.y + side, 1, 2) < R.shepherd.reach - 8) press('c');
    return out;
  }

  // ---- water ---------------------------------------------------------------
  const meanWater = own.reduce((a, s) => a + s.water, 0) / own.length;
  if (meanWater < 0.5) brain.thirsty = true;
  if (meanWater > 0.7) brain.thirsty = false;
  const usable = (tr) => tr.water > 0.25 || season.springs[tr.spring].level > 0.2;
  if (kind && brain.helpT <= 0) {
    // Top up the neighbours' trough when their flock is waiting at it.
    const theirs = season.troughs.find((tr) => tr.side !== i && tr.water < 0.3 && season.springs[tr.spring].level > 0.3 && d(tr) < 70 && d(tr, other) < 60);
    if (theirs) {
      if (walk(theirs.x, theirs.y) < R.shepherd.reach - 6) { press('c'); brain.helpT = 4; }
      return out;
    }
  }
  const storming = season.storms.some((s) => s.warned && !s.over);
  const homeward = week.goal === 'moveDown' && season.weekT > week.length - 24;
  if (brain.thirsty && !storming && week.goal !== 'moveUp' && !homeward) {
    const tr = season.troughs
      .filter((t) => usable(t) && (brain.greedy || kind || t.side === i))
      .sort((a, b) => d(a, flock) - d(b, flock))[0];
    if (tr) {
      if (tr.water < 0.5 && season.springs[tr.spring].level > 0.1) {
        if (walk(tr.x, tr.y) < R.shepherd.reach - 6) press('c');
        return out;
      }
      lead(tr.x, tr.y + (tr.y < 160 ? 12 : 10));
      return out;
    }
  }

  // ---- storms: everyone under a roof --------------------------------------
  if (storming) {
    const S = map.sharedShelter;
    const spots = [{ x: valley.shelter.x, y: valley.shelter.y, via: null }];
    if (season.shelterOpen) {
      spots.push({ x: S.x + S.w / 2, y: S.y + S.h / 2, via: { x: S.x + S.w / 2, y: S.y + S.h + 10, inside: (p) => p.y < S.y + S.h - 2 && p.x > S.x && p.x < S.x + S.w } });
      const ov = map.valleys[1 - i].shelter;
      spots.push({ x: ov.x, y: ov.y, via: null });
    }
    const spot = spots.sort((a, b) => d(a, flock) - d(b, flock))[0];
    lead(spot.x, spot.y, spot.via);
    return out;
  }

  // ---- autumn: home ----------------------------------------------------------
  if (homeward) {
    lead(pen.x + pen.w / 2, pen.y + pen.h / 2 + 4, penDoor);
    return out;
  }

  // ---- lend the neighbours a dog --------------------------------------------
  if (kind && !own.some((s) => s.stray)) {
    const lost = season.sheep.find((s) => s.side !== i && s.stray && d(s) < 100);
    if (lost) {
      const [ux, uy] = unit(lost.x - other.x, lost.y - other.y);
      const bx = lost.x + ux * 16, by = lost.y + uy * 16;
      if (walk(bx, by) < 5 && brain.cool <= 0) {
        out.x = -ux * 0.2; out.y = -uy * 0.2;
        out.a = true;
        brain.cool = 2.5;
      }
      return out;
    }
  }

  // ---- graze --------------------------------------------------------------------
  if (inPen > 0.5 && week.goal !== 'moveDown') { lead(gx, pen.y - 30); return out; }
  const p = choosePasture(season, i, brain, kind);
  if (p) lead(p.x, p.y);
  if (!p && d(flock) > 30) walk(flock.x, flock.y);
  return out;
}

const unit = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

// Is there room to stand at (x, y)?
function clear(season, x, y) {
  const W = season.world;
  if (x < 6 || y < 18 || x > season.map.w - 6 || y > season.map.h - 6) return false;
  for (const c of W.circles) if (Math.hypot(x - c.x, y - c.y) < c.r + 5) return false;
  for (const w of W.walls) if (pointSegDist(x, y, w.x1, w.y1, w.x2, w.y2) < 6) return false;
  for (const g of season.gates) if (!g.open && pointSegDist(x, y, g.x1, g.y1, g.x2, g.y2) < 6) return false;
  return true;
}

// Head for (ux, uy), or the nearest free heading beside it. Once it starts
// going round something it keeps to that side until the way is clear, so it
// follows a wall instead of dithering in front of it.
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

function choosePasture(season, i, brain, kind) {
  const pastures = season.map.pastures;
  const W = season.world;
  const flock = season.flocks[i], other = season.flocks[1 - i];
  // Spring goes up to the high pastures; autumn comes down to the low ones.
  const goal = season.weekDef.goal;
  const fits = (p) => (goal === 'moveUp' ? p.high : goal === 'moveDown' ? !p.high : true);
  const inside = (p, f, k = 1) => ((f.x - p.x) / (p.rx * k)) ** 2 + ((f.y - p.y) / (p.ry * k)) ** 2 <= 1;
  const value = (idx) => {
    const p = pastures[idx];
    let v = season.meanGrass(W.pastureCells[idx]);
    if (kind && inside(p, other, 1.2)) v -= 0.35;
    if (!brain.greedy && p.owner === 1 - i) v -= 1;
    v -= Math.hypot(p.x - flock.x, p.y - flock.y) / 1000;
    return v;
  };
  const allowed = pastures.map((p, idx) => idx).filter((idx) => fits(pastures[idx]));
  if (!allowed.length) return null;
  let best = allowed.reduce((a, b) => (value(b) > value(a) ? b : a));
  const cur = brain.pasture;
  if (cur != null && allowed.includes(cur)) {
    const left = season.meanGrass(W.pastureCells[cur]);
    const floor = brain.greedy ? 0.05 : 0.4;
    if (left > floor && value(best) < value(cur) + 0.25) best = cur;
  }
  brain.pasture = best;
  return pastures[best];
}
