// The parts of a stage that change during a match (data/arenas.json):
//
//   breakable  on a solid block or a floating platform: a wall section, a
//              pillar, a log, a boulder, the top of a clay tower, a bridge
//              plank. `hp`; `stub` keeps that many pixels of a solid standing
//              when it breaks (a tower crumbles to a stump). Blows wear it down
//              (by the move's damage), so do shots and thrown stones, and so
//              does a fighter launched into it hard enough: past
//              rules.pieces.slamSpeed they smash through and fly on, a little
//              slower. A broken piece rebuilds after rules.pieces.rebuild
//              seconds, shimmering first, and only once nobody is where it
//              goes (anyone still there after `pushAfter` is eased out
//              sideways). The main ground, ledges and the start points are
//              never breakable (tests/stage.test.js).
//   path       on a floating platform: it moves to and fro along these points
//              (its middle), `speed` px a frame on average, resting `pause`
//              frames at each end, starting `phase` frames in. Whoever stands
//              on it rides along. Where it is depends only on the fight's
//              time, so a match replays exactly. Platforms are soft (jump up
//              through, drop down through), so a moving one never squashes
//              anyone: a wall in the way just pushes the rider off.
//
// Pure like the rest of the core: no DOM, no clock, no Math.random.

const ease = (k) => (1 - Math.cos(Math.PI * k)) / 2;

// Where a moving platform's middle is at frame t of the fight.
export function pathAt(p, t) {
  const pts = p.path, segs = [];
  let L = 0;
  for (let k = 1; k < pts.length; k++) { const d = Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y); segs.push(d); L += d; }
  if (L <= 0) return { x: pts[0].x, y: pts[0].y };
  const leg = L / Math.max(0.01, p.speed ?? 0.5), pause = p.pause ?? 0, cycle = 2 * (leg + pause);
  const u = (((t + (p.phase ?? 0)) % cycle) + cycle) % cycle;
  const k = u < pause ? 0 : u < pause + leg ? (u - pause) / leg : u < 2 * pause + leg ? 1 : 1 - (u - 2 * pause - leg) / leg;
  let d = L * (p.ease === false ? k : ease(k));
  for (let s = 0; s < segs.length; s++) {
    if (d <= segs[s] || s === segs.length - 1) {
      const q = segs[s] > 0 ? Math.min(1, d / segs[s]) : 0;
      return { x: pts[s].x + (pts[s + 1].x - pts[s].x) * q, y: pts[s].y + (pts[s + 1].y - pts[s].y) * q };
    }
    d -= segs[s];
  }
  return { x: pts.at(-1).x, y: pts.at(-1).y };
}

// A moving platform's edges and height at frame t.
export function placeAt(p, t) {
  const c = pathAt(p, t), w = p.w ?? 60;
  return { x0: c.x - w / 2, x1: c.x + w / 2, y: c.y };
}

// The match's own copy of the stage pieces. stageOf has already copied the
// solids and platforms, so changing them never touches the data.
export function setupStage(m) {
  const st = m.stage;
  st.allSolids = st.solids;
  st.allPlatforms = st.platforms ?? [];
  m.stageT = 0;
  m.pieces = [];
  const add = (S, kind) => {
    const b = S.breakable, pc = { i: m.pieces.length, S, kind, hp: b.hp, max: b.hp, broken: false, rebuildT: 0, wait: 0 };
    if (kind === 'solid') { pc.top0 = S.top; pc.stub = Math.max(0, b.stub ?? 0); pc.stubTop = S.bottom - pc.stub; }
    S.piece = pc;
    m.pieces.push(pc);
  };
  for (const S of st.allSolids) if (S.breakable) add(S, 'solid');
  for (const p of st.allPlatforms) if (p.breakable) add(p, 'platform');
  m.movers = st.allPlatforms.filter((p) => p.path);
  refresh(m);
}

// The live lists the rest of the engine sees: broken pieces left out (or
// lowered to their stump).
function refresh(m) {
  const st = m.stage;
  st.solids = st.allSolids.filter((S) => !(S.piece?.broken && !S.piece.stub));
  st.platforms = st.allPlatforms.filter((p) => !p.piece?.broken);
}

// The box a piece fills when it stands (a platform: a thin plank).
export function pieceRect(pc) {
  const S = pc.S;
  if (pc.kind === 'platform') return { x0: S.x0, x1: S.x1, top: S.y, bottom: S.y + (S.thick ?? 8) };
  return { x0: S.x0, x1: S.x1, top: pc.top0, bottom: pc.stub ? pc.stubTop : S.bottom };
}
// The same, as a "body" for Match.touches (x in the middle, y at the bottom).
const asBody = (r) => ({ x: (r.x0 + r.x1) / 2, y: r.bottom, w: r.x1 - r.x0, h: r.bottom - r.top });

const PR = (m) => m.R.pieces ?? {};

// One frame of the stage, before the fighters move: the platforms move and
// carry their riders; broken pieces count down and rebuild.
export function stepStage(m) {
  m.stageT++;
  for (const p of m.movers) {
    const was = { x0: p.x0, x1: p.x1, y: p.y }, now = placeAt(p, m.stageT), dx = now.x0 - was.x0;
    const riders = p.piece?.broken ? [] : m.fighters.filter((f) => f.grounded && !['out', 'respawn', 'ledge', 'climb'].includes(f.state) && f.drop <= 0 && Math.abs(f.y - was.y) < 0.01 && f.x >= was.x0 && f.x <= was.x1);
    Object.assign(p, now, { py: was.y });
    for (const f of riders) { f.x += dx; f.y = p.y; }
  }
  const P = PR(m), fps = m.R.fps;
  for (const pc of m.pieces) {
    if (!pc.broken) continue;
    if (pc.rebuildT > 0) { pc.rebuildT--; continue; }
    const blockers = m.fighters.filter((f) => inTheWay(f, pc));
    if (!blockers.length) { rebuild(m, pc); continue; }
    // Someone is standing where it goes: wait, then ease them out sideways.
    if (++pc.wait > (P.pushAfter ?? 1) * fps && pc.kind === 'solid') {
      const r = pieceRect(pc), mid = (r.x0 + r.x1) / 2;
      for (const f of blockers) f.x += (f.x < mid ? -1 : 1) * (P.push ?? 1.2);
    }
  }
}

// Would this fighter be inside the piece if it came back now?
function inTheWay(f, pc) {
  if (['out', 'respawn'].includes(f.state)) return false;
  const r = pieceRect(pc), half = f.w / 2, m = 1;
  if (!(f.x + half > r.x0 - m && f.x - half < r.x1 + m)) return false;
  // A plank only matters to someone it would cut through.
  if (pc.kind === 'platform') return f.y - f.h < r.top && f.y > r.top + 0.5;
  return f.y > r.top - m && f.y - f.h < r.bottom;
}

function rebuild(m, pc) {
  pc.broken = false; pc.hp = pc.max; pc.wait = 0;
  if (pc.kind === 'solid') pc.S.top = pc.top0;
  refresh(m);
  const r = pieceRect(pc);
  m.emit('rebuilt', { piece: pc.i, x: (r.x0 + r.x1) / 2, y: r.top });
}

// Wear a piece down; at 0 it breaks. Returns true if it broke.
export function damagePiece(m, pc, amount, by = -1) {
  if (pc.broken || !(amount > 0)) return false;
  pc.hp = Math.max(0, pc.hp - amount);
  const r = pieceRect(pc);
  if (pc.hp > 0) { m.emit('crack', { piece: pc.i, x: (r.x0 + r.x1) / 2, y: (r.top + r.bottom) / 2, hp: pc.hp / pc.max, f: by }); return false; }
  breakPiece(m, pc, by);
  return true;
}

export function breakPiece(m, pc, by = -1) {
  const r = pieceRect(pc), P = PR(m);
  pc.broken = true; pc.hp = 0; pc.wait = 0;
  pc.rebuildT = Math.round((P.rebuild ?? 10) * m.R.fps);
  if (pc.kind === 'solid') pc.S.top = pc.stub ? pc.stubTop : pc.top0;
  refresh(m);
  // Stones resting on it come down with it.
  for (const o of m.objects) if (o.kind === 'boulder' && o.landed && o.x >= r.x0 && o.x <= r.x1 && Math.abs(o.y - r.top) < 0.6) { o.landed = false; o.vy = 0; o.vx = 0; }
  m.freeze = Math.max(m.freeze, P.breakStop ?? 0);
  m.emit('break', { piece: pc.i, x: (r.x0 + r.x1) / 2, y: (r.top + r.bottom) / 2, x0: r.x0, x1: r.x1, top: r.top, bottom: r.bottom, part: pc.S.part ?? pc.kind, f: by });
}

// A blow's reach against the pieces (once per piece per swing).
export function hitPieces(m, a, shape) {
  if (!m.pieces.length) return;
  const mv = a.move, P = PR(m);
  const hits = a.state === 'attack' && mv.rehit ? Math.ceil(mv.active / mv.rehit) : 1;
  for (const pc of m.pieces) {
    const key = `p${pc.i}`;
    if (pc.broken || a.hitDone.has(key) || !m.touches(shape, asBody(pieceRect(pc)))) continue;
    a.hitDone.add(key);
    const amount = ((mv.damage ?? 0) / hits) * (a.chargeMul ?? 1) * (P.hitScale ?? 1);
    if (amount > 0) { m.freeze = Math.max(m.freeze, P.hitStop ?? 0); damagePiece(m, pc, amount, a.i); }
  }
}

// A launched fighter crashing into a piece. Returns true if they went through.
export function slam(m, f, pc) {
  const P = PR(m), v = Math.hypot(f.vx, f.vy);
  if (pc.broken || f.state !== 'hitstun' || v < (P.slamSpeed ?? 4.5) || f.slamT > 0) return false;
  f.slamT = P.slamEvery ?? 20;
  const by = 1 - f.i;
  m.emit('slam', { f: f.i, piece: pc.i, x: f.x, y: f.y - f.h / 2, v });
  if (!damagePiece(m, pc, v * (P.slamDamage ?? 8), by)) return false;
  const keep = P.slamKeep ?? 0.7;
  f.vx *= keep; f.vy *= keep;
  return true;
}

// The standing piece whose top is at (x, y), if any (a stone landing on it).
export function pieceUnder(m, x, y) {
  return m.pieces.find((pc) => !pc.broken && x >= pc.S.x0 && x <= pc.S.x1 && Math.abs(pieceRect(pc).top - y) < 0.6) ?? null;
}
