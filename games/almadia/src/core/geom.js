export const clamp = (v, lo = -1, hi = 1) => (v < lo ? lo : v > hi ? hi : v);

// Closest points between segments p1-q1 and p2-q2 (Ericson, Real-Time
// Collision Detection 5.1.9). Writes into `out` to keep the step loop
// allocation-free.
export function closestSegSeg(p1x, p1y, q1x, q1y, p2x, p2y, q2x, q2y, out) {
  const d1x = q1x - p1x, d1y = q1y - p1y, d2x = q2x - p2x, d2y = q2y - p2y;
  const rx = p1x - p2x, ry = p1y - p2y;
  const a = d1x * d1x + d1y * d1y, e = d2x * d2x + d2y * d2y, f = d2x * rx + d2y * ry;
  let s = 0, t = 0;
  if (a > 1e-9 || e > 1e-9) {
    if (a <= 1e-9) t = clamp(f / e, 0, 1);
    else {
      const c = d1x * rx + d1y * ry;
      if (e <= 1e-9) s = clamp(-c / a, 0, 1);
      else {
        const b = d1x * d2x + d1y * d2y, denom = a * e - b * b;
        s = denom !== 0 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
      }
    }
  }
  out.ax = p1x + d1x * s; out.ay = p1y + d1y * s;
  out.bx = p2x + d2x * t; out.by = p2y + d2y * t;
  return out;
}

export function pointSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}
