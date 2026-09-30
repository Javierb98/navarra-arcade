// River geometry for one course: centreline x, half-width and current speed
// as functions of distance downstream (y grows downstream). The course JSON
// gives control points; the values between them are eased and baked into a
// table so lookups in the step loop are cheap.

const STEP = 4;
const BEFORE = 300; // table starts this far above y = 0
const AFTER = 600; // and runs this far past the finish

const ease = (t) => t * t * (3 - 2 * t);

function sample(points, key, y) {
  if (y <= points[0].y) return points[0][key];
  for (let i = 1; i < points.length; i++) {
    const b = points[i];
    if (y <= b.y) {
      const a = points[i - 1];
      return a[key] + (b[key] - a[key]) * ease((y - a.y) / (b.y - a.y));
    }
  }
  return points[points.length - 1][key];
}

export class River {
  constructor(course) {
    this.length = course.length;
    const n = Math.ceil((course.length + BEFORE + AFTER) / STEP) + 2;
    this.cx = new Float32Array(n);
    this.hw = new Float32Array(n);
    this.speed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const y = i * STEP - BEFORE;
      this.cx[i] = sample(course.river, 'cx', y);
      this.hw[i] = sample(course.river, 'hw', y);
      this.speed[i] = sample(course.current, 'speed', y);
    }
  }

  lookup(table, y) {
    let f = (y + BEFORE) / STEP;
    if (f < 0) f = 0;
    if (f > table.length - 1.001) f = table.length - 1.001;
    const i = Math.floor(f);
    return table[i] + (table[i + 1] - table[i]) * (f - i);
  }

  cxAt(y) { return this.lookup(this.cx, y); }
  hwAt(y) { return this.lookup(this.hw, y); }
  speedAt(y) { return this.lookup(this.speed, y); }
  slopeAt(y) { return (this.cxAt(y + 8) - this.cxAt(y - 8)) / 16; }
  leftAt(y) { return this.cxAt(y) - this.hwAt(y); }
  rightAt(y) { return this.cxAt(y) + this.hwAt(y); }
}
