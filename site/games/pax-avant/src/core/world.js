// Turns data/map.json into what the simulation and the renderer both need:
// the grass grid, solid things to bump into, gates and shelters. Pure and
// deterministic, so the painted trees are exactly the trees sheep walk around.

const hash = (x, y, seed) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// A rectangle as four walls, with an optional gap [g1, g2] along its top edge
// that becomes a gate (or along its bottom edge, if `bottom`).
function box(r, walls, gap = null, bottom = false) {
  const { x, y, w, h } = r;
  const gy = bottom ? y + h : y;
  const edge = (y0) => {
    if (gap && y0 === gy) {
      walls.push({ x1: x, y1: y0, x2: gap[0], y2: y0 });
      walls.push({ x1: gap[1], y1: y0, x2: x + w, y2: y0 });
    } else walls.push({ x1: x, y1: y0, x2: x + w, y2: y0 });
  };
  edge(y);
  edge(y + h);
  walls.push({ x1: x, y1: y, x2: x, y2: y + h });
  walls.push({ x1: x + w, y1: y, x2: x + w, y2: y + h });
}

export function buildWorld(map) {
  const cell = map.cell;
  const cols = Math.ceil(map.w / cell), rows = Math.ceil(map.h / cell);
  const pastureOf = new Int8Array(cols * rows).fill(-1);
  const pastureCells = map.pastures.map(() => []);
  map.pastures.forEach((p, i) => {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * cell, y = (r + 0.5) * cell;
      if (((x - p.x) / p.rx) ** 2 + ((y - p.y) / p.ry) ** 2 <= 1 && pastureOf[r * cols + c] < 0) {
        pastureOf[r * cols + c] = i;
        pastureCells[i].push(r * cols + c);
      }
    }
  });

  const trees = [];
  for (const f of map.forests ?? []) {
    for (let y = f.y1; y < f.y2; y += 11) {
      for (let x = f.x1; x < f.x2; x += 12) {
        const tx = x + 6 + (hash(x, y, 1) - 0.5) * 8, ty = y + 5 + (hash(x, y, 2) - 0.5) * 6;
        if (tx < f.x1 + 3 || tx > f.x2 - 3) continue;
        trees.push({ x: tx, y: ty, r: 5 + Math.floor(hash(x, y, 3) * 3) });
      }
    }
  }

  const circles = [
    ...trees.map((t) => ({ x: t.x, y: t.y, r: 4 })),
    ...map.rocks.map((r) => ({ x: r.x, y: r.y, r: r.r })),
    { x: map.stone.x, y: map.stone.y, r: 6 },
    ...map.springs.map((s) => ({ x: s.x, y: s.y, r: 5 })),
  ];

  const walls = [];
  const gates = [];
  map.valleys.forEach((v, side) => {
    const p = v.pen;
    box(p, walls, p.gate);
    gates.push({ x1: p.gate[0], y1: p.y, x2: p.gate[1], y2: p.y, kind: 'pen', side, open: false });
    box(v.hut, walls);
    box(v.house, walls);
  });
  // The shared shelter: stone walls, and a gate on the side facing the
  // pasture that stays shut until the valleys trust each other.
  const s = map.sharedShelter;
  box(s, walls, [s.x, s.x + s.w], true);
  gates.push({ x1: s.x, y1: s.y + s.h, x2: s.x + s.w, y2: s.y + s.h, kind: 'shelter', side: -1, open: false });

  return { cell, cols, rows, pastureOf, pastureCells, trees, circles, walls, gates };
}
