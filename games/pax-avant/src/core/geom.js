export const clamp = (v, lo = -1, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Closest point on segment (x1,y1)-(x2,y2) to (px,py), written into `out`.
export function closestOnSeg(px, py, x1, y1, x2, y2, out) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1) : 0;
  out.x = x1 + dx * t;
  out.y = y1 + dy * t;
  return out;
}

export function pointSegDist(px, py, x1, y1, x2, y2) {
  const c = closestOnSeg(px, py, x1, y1, x2, y2, { x: 0, y: 0 });
  return Math.hypot(px - c.x, py - c.y);
}

export const inRect = (p, r, pad = 0) => p.x > r.x + pad && p.x < r.x + r.w - pad && p.y > r.y + pad && p.y < r.y + r.h - pad;
