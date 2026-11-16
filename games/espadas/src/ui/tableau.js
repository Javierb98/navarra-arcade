// Scenes outside battle (title, muster, results): a Scene plus a little rAF
// loop and some marching companies.

import { Scene } from './scene.js';

// Display only: how many men a point of strength stands for.
export const MEN_PER_POINT = 10;

export function viewSquad(data, { id, type, side, faction, x, y, facing = 1, hp }) {
  const kind = data.units[type];
  return {
    id, side, type, kind, role: kind.role, leader: kind.tags.includes('leader'),
    color: data.factions[faction].color,
    look: { ...data.factions[faction].look, ...(kind.look ?? {}) },
    x, y, hp: hp ?? kind.hp, maxHp: kind.hp, morale: 1, maxMorale: 1,
    status: 'ok', hidden: false, facing, gone: false, alpha: 1, ox: 0, oy: 0,
  };
}

// march: map id -> { speed (squares/s), at (starting square) }. Marching
// companies walk from beyond the left edge of the scene to beyond the right,
// then come round again off-screen, so they always enter and leave the stage
// instead of being dragged back across it.
export function runTableau(scene, units, { march = new Map() } = {}) {
  let running = true;
  let last = performance.now();
  const enter = -2.5;
  const exit = scene.grid.w + 1.5;
  for (const [id, m] of march) {
    const u = units.get(id);
    if (u) { u.x = m.at ?? u.x; u.facing = 1; }
  }
  const loop = (now) => {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const [id, m] of march) {
      const u = units.get(id);
      if (!u) continue;
      u.x += m.speed * dt;
      u.facing = 1;
      if (u.x > exit) {
        u.x = enter;
        scene.snap(u);   // re-enter off-screen, with no visible pull-back
      }
    }
    scene.draw(units, [], now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return () => { running = false; };
}

export { Scene };
