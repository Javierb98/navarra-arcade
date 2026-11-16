// Square battle grid and path searches. Pure data; no DOM.

export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export class Grid {
  constructor(rows, terrainTable) {
    this.h = rows.length;
    this.w = rows[0].length;
    this.codes = rows.map((r, y) => {
      if (r.length !== this.w) throw new Error(`map row ${y} has ${r.length} cells, expected ${this.w}`);
      for (const c of r) if (!terrainTable[c]) throw new Error(`unknown terrain code '${c}' in row ${y}`);
      return [...r];
    });
    this.table = terrainTable;
  }

  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  at(x, y) { return this.table[this.codes[y][x]]; }
  key(x, y) { return y * this.w + x; }

  neighbours(x, y) {
    const out = [];
    for (const [dx, dy] of DIRS) if (this.inside(x + dx, y + dy)) out.push({ x: x + dx, y: y + dy });
    return out;
  }

  edgeCells(edges) {
    const out = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if ((edges.includes('left') && x === 0) || (edges.includes('right') && x === this.w - 1) ||
            (edges.includes('top') && y === 0) || (edges.includes('bottom') && y === this.h - 1)) {
          out.push({ x, y });
        }
      }
    }
    return out;
  }
}

// Cheapest paths from `start` within `budget`. `stepCost(to)` returns Infinity
// for impassable cells. A unit may always take a single step that costs more
// than its whole budget, spending all of it, so nobody is ever stuck on steep
// ground. Returns Map key -> node {x, y, cost, prev}.
export function dijkstra(grid, start, budget, stepCost) {
  const best = new Map();
  const root = { x: start.x, y: start.y, cost: 0, prev: null };
  best.set(grid.key(start.x, start.y), root);
  const open = [root];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].cost < open[bi].cost) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (best.get(grid.key(cur.x, cur.y)) !== cur) continue;
    for (const n of grid.neighbours(cur.x, cur.y)) {
      const c = stepCost(n, cur);
      if (!Number.isFinite(c)) continue;
      let nc = cur.cost + c;
      if (nc > budget) {
        if (cur === root && budget > 0) nc = budget;
        else continue;
      }
      const k = grid.key(n.x, n.y);
      const old = best.get(k);
      if (old && old.cost <= nc) continue;
      const node = { x: n.x, y: n.y, cost: nc, prev: cur };
      best.set(k, node);
      open.push(node);
    }
  }
  return best;
}

// Path from the search root to `node`, excluding the root itself.
export function pathTo(node) {
  const path = [];
  for (let n = node; n && n.prev; n = n.prev) path.push({ x: n.x, y: n.y });
  return path.reverse();
}

// Multi-source cost field: cost of the cheapest walk from each cell to any source.
export function distanceField(grid, sources, stepCost) {
  const field = new Map();
  const open = [];
  for (const s of sources) {
    field.set(grid.key(s.x, s.y), 0);
    open.push({ x: s.x, y: s.y, cost: 0 });
  }
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].cost < open[bi].cost) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (field.get(grid.key(cur.x, cur.y)) < cur.cost) continue;
    for (const n of grid.neighbours(cur.x, cur.y)) {
      // Walking n -> cur costs the entry cost of cur.
      if (!Number.isFinite(stepCost(n))) continue;
      const c = stepCost(cur);
      if (!Number.isFinite(c)) continue;
      const nc = cur.cost + c;
      const k = grid.key(n.x, n.y);
      if (field.has(k) && field.get(k) <= nc) continue;
      field.set(k, nc);
      open.push({ x: n.x, y: n.y, cost: nc });
    }
  }
  return field;
}

// Cells a volley passes over from `from` toward `to` and `extra` beyond, one
// sample per unit of distance. Entry k (1-based) is k squares out. Used by
// the engine to find where a volley lands and by the aiming minigame to lay
// out the same line, so the two always agree.
export function volleyLine(grid, from, to, extra = 2) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [];
  const ux = dx / len, uy = dy / len;
  const out = [];
  const reach = Math.ceil(len) + extra;
  const hit = Math.round(len);
  for (let k = 1; k <= reach; k++) {
    // The target's own square is exact; the rest are sampled along the line.
    const x = k === hit ? to.x : Math.round(from.x + ux * k);
    const y = k === hit ? to.y : Math.round(from.y + uy * k);
    if (!grid.inside(x, y)) break;
    out.push({ x, y, k });
  }
  return out;
}
