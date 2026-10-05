// The specials that make each fighter play differently. The match calls these
// hooks; everything stays pure and seeded like the rest of the core.
//
// Kinds (data/fighters.json, `specials` and `super`):
//   melee     a hitbox during the active frames, with options:
//               pull    drags the rival in (Lamia's water lasso)
//               stun    leaves the rival dizzy for that many frames (Tartalo's glare)
//               grab    catches the rival: { hits, every, throw } (Tartalo's grasp, Herensuge's bite)
//               rehit   hits again every that many frames (spins)
//               move    can be steered while it lasts (x run speed)
//   teleport  vanishes and reappears (`to`: 'behind' the rival, or along the stick), then strikes
//   counter   a guard for `active` frames; a blow that lands on it is answered with `strike`
//   bounce    leaps up (`vy`) and comes down hitting until landing, with a shockwave (`land`)
//   pounce    an arcing leap forward (`vx`, `vy`) that hits until landing
//   strike    a column that erupts after a warning: from the ground ahead (`at: 'ahead'`, a geyser)
//             or from the sky onto the rival (`at: 'rival'`, lightning); `count` for a storm
//   zone      a patch left on the stage: `effect` 'hold' (roots, a snare), 'tick' (smoke, fire)
//   quake     waves that run along the ground both ways
//   summon    Zaldiko gallops across the platform once
//   dash      (in fight.js) with `rehit` it keeps hitting (a roll), with `grab` it carries the
//             rival off on its horns, with `trail` it leaves fire behind
//   shot      (in fight.js) with `count`/`spread` a fan, `roll` along the ground, `charge` to grow
//
// Recoveries (`recovery`, kind 'leap') take: `flaps` (leaps per jump), `teleport` (a distance),
// `rehit` (keeps hitting on the way up), `slow` (gravity while rising, x).

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sign = (v) => (v < 0 ? -1 : 1);
const unit = (x, y) => { const l = Math.hypot(x, y); return l > 1e-6 ? [x / l, y / l] : [0, 0]; };

// Kinds that hit with the body (the match resolves their hitbox).
export const BODY = new Set(['melee', 'teleport', 'bounce', 'pounce']);

// Things that happen as a special's startup ends.
export function release(m, f, mv) {
  const r = m.rival(f), surf = (x) => m.surfaceBelow(x, f.y - 2) ?? m.stage.main.top;
  switch (mv.kind) {
    case 'teleport': {
      // Through the shadows: behind the rival, or along the stick.
      if (mv.to === 'behind' && r.state !== 'out') {
        f.x = r.x - (r.fx || 1) * ((r.w + f.w) / 2 + 2); f.y = r.y; f.grounded = r.grounded;
        f.fx = r.fx || 1;
      } else {
        const [dx, dy] = f.aim && Math.hypot(...f.aim) > 0.2 ? unit(...f.aim) : [0, -1];
        f.x += dx * mv.distance; f.y += dy * mv.distance; f.grounded = false; f.vy = 0;
      }
      f.vx = 0;
      m.emit('teleport', { f: f.i, x: f.x, y: f.y });
      return true;
    }
    case 'counter':
      f.guard = mv.active;
      m.emit('guard', { f: f.i });
      return true;
    case 'bounce':
      f.vy = mv.vy; f.vx = f.fx * (mv.vx ?? 0); f.grounded = false;
      return true;
    case 'pounce':
      f.vy = mv.vy; f.vx = f.fx * mv.vx; f.grounded = false;
      return true;
    case 'strike': {
      const n = mv.count ?? 1;
      for (let k = 0; k < n; k++) {
        const base = mv.at === 'rival' ? r.x : f.x + f.fx * (mv.dist ?? 40);
        const x = clamp(base + (n > 1 ? (k - (n - 1) / 2) * (mv.spacing ?? 40) + (m.rng.next() - 0.5) * 10 : 0), 10, m.stage.world.w - 10);
        m.objects.push({ kind: 'strike', id: mv.id, owner: f.i, x, y: mv.at === 'rival' ? (m.surfaceBelow(x, (r.grounded ? r.y : r.y) - 2) ?? m.surfaceBelow(x, -50) ?? 270) : surf(x), w: mv.width, h: mv.height, wait: mv.delay + k * (mv.stagger ?? 0), live: mv.lasts ?? 8, move: mv, sky: mv.at === 'rival', hits: n, hit: false, life: 1 });
      }
      m.emit('strikeCall', { f: f.i, id: mv.id });
      return true;
    }
    case 'zone': {
      const n = mv.count ?? 1;
      for (let k = 0; k < n; k++) {
        const x = clamp(f.x + f.fx * ((mv.dist ?? 24) + k * (mv.spacing ?? 0)), 10, m.stage.world.w - 10);
        m.objects.push({ kind: 'zone', id: mv.id, owner: f.i, x, y: surf(x), w: mv.w, h: mv.h, life: mv.life, move: mv, tick: 0, used: false });
      }
      m.emit('zone', { f: f.i, id: mv.id });
      return true;
    }
    case 'quake': {
      const y = f.grounded ? f.y : surf(f.x);
      for (const dir of [-1, 1]) m.objects.push({ kind: 'wave', id: mv.id, owner: f.i, x: f.x, y, dir, speed: mv.speed, left: mv.range, move: mv, hit: false, life: 1, step: 0, spacing: mv.spacing ?? 0 });
      m.emit('quake', { f: f.i });
      return true;
    }
    case 'summon': {
      // Zaldiko gallops in from behind Ziripot across the platform he's on.
      const y = f.grounded ? f.y : surf(f.x);
      const plat = (m.stage.platforms ?? []).find((p) => Math.abs(p.y - y) < 0.5 && f.x >= p.x0 && f.x <= p.x1) ?? m.stage.solids.find((S) => Math.abs(S.top - y) < 0.5 && f.x >= S.x0 && f.x <= S.x1) ?? m.stage.main;
      const dir = f.fx;
      m.objects.push({ kind: 'flock', creature: 'zaldiko', owner: f.i, x: dir > 0 ? Math.max(plat.x0 + 2, f.x - 30) : Math.min(plat.x1 - 2, f.x + 30), y, x0: plat.x0, x1: plat.x1, dir, speed: mv.speed, move: mv, hitsLeft: mv.hits ?? 1, tick: 0, single: true });
      m.emit('flock', { f: f.i, y, dir });
      return true;
    }
    default: return false;
  }
}

// Each frame of a special that moves the fighter. Returns { float } when
// gravity should not apply, { done } when the move should end now.
export function stepSpecial(m, f, mv, inp, sx) {
  const into = f.t - mv.startup;
  if (mv.kind === 'melee' && mv.move && into > 0) f.vx = sx * f.speed * mv.move;
  if ((mv.kind === 'bounce' || mv.kind === 'pounce') && into > 0) {
    // Keep going until the ground; the hit lasts the whole way down.
    if (f.grounded && into > 2) {
      if (mv.land) { f.move = { ...mv.land, kind: 'melee', id: `${mv.id}Land` }; f.t = mv.land.startup; f.hitDone = new Set(); m.emit('land', { x: f.x, y: f.y }); }
      else return { done: true };
    } else if (f.t >= mv.startup + mv.active) f.t = mv.startup + mv.active - 1; // hold the falling frame
  }
  if (mv.kind === 'counter' && f.guard > 0) f.guard--;
  return {};
}

// A blow is about to land on `d`. Returns true if a counter answered it.
export function counterHit(m, a, d) {
  if (!(d.guard > 0) || d.move?.kind !== 'counter') return false;
  const mv = d.move;
  d.guard = 0;
  // Slip behind and strike back.
  d.x = a.x - (a.fx || 1) * ((a.w + d.w) / 2 + 2); d.fx = a.fx || 1; d.y = a.y; d.grounded = a.grounded;
  d.move = { ...mv.strike, kind: 'melee', id: `${mv.id}Strike` }; d.t = mv.strike.startup; d.hitDone = new Set();
  d.invT = Math.max(d.invT, 12);
  m.freeze = Math.max(m.freeze, 10);
  m.emit('counter', { f: d.i, x: d.x, y: d.y - d.h / 2 });
  return true;
}

// What a blow does beyond damage and launch. Returns true if it fully handled the target.
export function onHit(m, a, d, mv) {
  if (mv.stun) {
    d.vx = 0; d.vy = d.grounded ? 0 : d.vy;
    m.setState(d, 'dizzy'); d.dizzyFor = mv.stun;
    m.emit('stunned', { f: d.i, x: d.x, y: d.y - d.h });
    return true;
  }
  if (mv.pull) {
    // Drawn in to just in front of the puller, briefly helpless.
    d.vx = 0; d.vy = 0;
    d.x = a.x + a.fx * ((a.w + d.w) / 2 + 2);
    if (a.grounded) { d.y = a.y; }
    d.hitstun = Math.max(d.hitstun, mv.pull);
    return false;
  }
  if (typeof mv.grab === 'object' && !d.grabbedBy) {
    d.grabbedBy = { a: a.i, mv, left: mv.grab.hits ?? 0, every: mv.grab.every ?? 8, tick: 0 };
    a.state = 'holding'; a.t = 0; a.holding = d.i; a.hold = 999;
    d.state = 'held'; d.t = 0; d.heldBy = a.i;
    m.emit('grabbed', { f: a.i, d: d.i });
    return true;
  }
  if (mv.heal) a.pct = Math.max(0, a.pct - mv.heal);
  return false;
}

// A special grab in progress: bite, bite, then the throw.
export function stepGrabbed(m, d) {
  const g = d.grabbedBy, a = m.fighters[g.a];
  if (a.state !== 'holding' || a.holding !== d.i) { d.grabbedBy = null; return; }
  d.x = a.x + a.fx * ((a.w + d.w) / 2); d.y = a.y; d.vx = 0; d.vy = 0;
  if (++g.tick % g.every === 0 && g.left > 0) {
    g.left--;
    m.hit(a, d, { damage: g.mv.grab.damage ?? 2, kb: 0, growth: 0, angle: 0 }, 1, { x: a.x, y: a.y, dir: a.fx }, true);
    d.state = 'held';
  }
  if (g.left <= 0 && g.tick >= g.every) {
    const T = g.mv.grab.throw;
    d.grabbedBy = null; d.heldBy = -1; a.holding = -1;
    d.state = 'hitstun'; d.t = 0;
    m.hit(a, d, T, 1, { x: a.x, y: a.y, dir: T.back ? -a.fx : a.fx });
    a.lag = 14; m.setState(a, 'landing');
    m.emit('throw', { f: a.i, kind: 'special' });
  }
}

// Objects these specials leave on the stage. Returns true if it stepped `o`.
export function stepObject(m, o, owner, target) {
  const can = m.canBeHit(target) && !m.invulnerable(target);
  if (o.kind === 'strike') {
    if (o.wait > 0) { o.wait--; return true; }
    if (o.wait === 0 && !o.started) { o.started = true; m.emit('strike', { x: o.x, y: o.y, id: o.id, sky: o.sky }); }
    if (--o.live <= 0) o.life = 0;
    const top = o.sky ? -40 : o.y - o.h;
    if (!o.hit && m.canBeHit(target) && Math.abs(target.x - o.x) < (o.w + target.w) / 2 && target.y > top && target.y - target.h < o.y + 2) {
      o.hit = true;
      if (m.invulnerable(target)) m.perfectCheck(target);
      else m.hit(owner, target, o.move, o.hits ?? 1, { x: o.x, y: o.y, dir: sign(target.x - o.x) || owner.fx });
    }
    return true;
  }
  if (o.kind === 'zone') {
    o.life--; o.tick++;
    const mv = o.move, inside = m.canBeHit(target) && Math.abs(target.x - o.x) < (o.w + target.w) / 2 && target.y > o.y - o.h && target.y - target.h < o.y + 2;
    if (!inside || !can) return true;
    if (mv.effect === 'hold' && !o.used) {
      // Roots, a snare: caught fast for a moment.
      o.used = true; o.life = Math.min(o.life, mv.hold + 10);
      m.hit(owner, target, mv, 1, { x: o.x, y: o.y, dir: owner.fx }, true);
      target.vx = 0; target.vy = 0; m.setState(target, 'dizzy'); target.dizzyFor = mv.hold;
      m.emit('caught', { f: target.i, x: target.x, y: target.y });
    } else if (mv.effect === 'tick' && o.tick % (mv.every ?? 15) === 0) {
      m.hit(owner, target, mv, mv.hits ?? 1, { x: o.x, y: o.y, dir: sign(target.x - o.x) || 1 }, !(mv.kb > 0));
    }
    return true;
  }
  if (o.kind === 'wave') {
    // A shockwave running along the ground, until the edge or its range.
    o.x += o.dir * o.speed; o.left -= o.speed;
    const under = m.surfaceBelow(o.x, o.y - 1);
    if (o.left <= 0 || under === null || Math.abs(under - o.y) > 1) { o.life = 0; return true; }
    if (!o.hit && m.canBeHit(target) && target.grounded && Math.abs(target.y - o.y) < 2 && Math.abs(target.x - o.x) < (target.w / 2 + 8)) {
      o.hit = true;
      if (m.invulnerable(target)) m.perfectCheck(target);
      else m.hit(owner, target, o.move, 1, { x: o.x, y: o.y, dir: o.dir });
    }
    return true;
  }
  return false;
}

// Recovery leaps that aren't simply a jump: a teleport, extra flaps.
export function startRecovery(m, f, mv, sx, sy) {
  if (mv.teleport) {
    const [dx, dy] = Math.hypot(sx, sy) > 0.3 ? unit(sx, sy) : [0, -1];
    f.x += dx * mv.teleport; f.y += dy * mv.teleport; f.vx = 0; f.vy = 0; f.grounded = false;
    m.emit('teleport', { f: f.i, x: f.x, y: f.y });
    return true;
  }
  return false;
}

export { clamp, sign, unit };
