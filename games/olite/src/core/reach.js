// A rough route finder over a level map, for the tests: can a climber who
// jumps `jump` tiles high (3 alone, 4 standing on a partner) get from the
// start to the banner, and to each golden stone? Scaffold boards count as a
// ledge along their whole track. It ignores storks, wind and timing.

const SOLID = '#xXB_|', LEDGE = '=c';

export function reach(map, { players = 2, jump = 3, side = 4 } = {}) {
  const h = map.length, w = map[0].length;
  const grid = map.map((row) => row.split('').map((ch) => (ch === 'B' && players === 2 ? ' ' : ch)));
  // Scaffold boards: the whole run between walls on their row is standable.
  for (const row of grid) {
    const c0 = row.indexOf('m');
    if (c0 < 0) continue;
    let a = c0, b = c0;
    while (a > 0 && !SOLID.includes(row[a - 1])) a--;
    while (b < w - 1 && !SOLID.includes(row[b + 1])) b++;
    for (let c = a; c <= b; c++) row[c] = '=';
  }
  const at = (c, r) => (c < 0 || c >= w ? '#' : r < 0 || r >= h ? ' ' : grid[r][c]);
  // Rubble and cracked walls break; gates open (someone holds a plate, or it latches alone).
  const solid = (c, r) => SOLID.includes(at(c, r)) && !'xX|'.includes(at(c, r));
  const blocks = (c, r) => SOLID.includes(at(c, r));
  const support = (c, r) => SOLID.includes(at(c, r)) || LEDGE.includes(at(c, r));
  const stand = (c, r) => !blocks(c, r) && support(c, r + 1);
  // Rubble can be broken from below, so it doesn't stop a climb.
  const passUp = (c, r) => !solid(c, r);

  let start, flag;
  const gold = [], slots = [];
  grid.forEach((row, r) => row.forEach((ch, c) => {
    if (ch === 'S') start = [c, r];
    if (ch === 'F') flag = [c, r];
    if (ch === 'g') gold.push([c, r]);
    if (ch === 'H') slots.push([c, r]);
  }));
  const seen = new Set([start.join()]), queue = [start];
  const add = (c, r) => { const k = `${c},${r}`; if (!seen.has(k)) { seen.add(k); queue.push([c, r]); } };
  while (queue.length) {
    const [c, r] = queue.shift();
    for (const dc of [-1, 1]) {
      const c2 = c + dc;
      if (blocks(c2, r)) continue;
      let r2 = r;
      while (r2 < h && !stand(c2, r2)) r2++;
      if (r2 < h) add(c2, r2);
    }
    for (let up = 1; up <= jump; up++) {
      const r2 = r - up;
      for (let c2 = c - side; c2 <= c + side; c2++) {
        if (!stand(c2, r2)) continue;
        // A column to rise through, reached along the floor and left along the top.
        const lo = Math.min(c, c2), hi = Math.max(c, c2);
        for (let cx = lo; cx <= hi; cx++) {
          let ok = true;
          for (let k = Math.min(c, cx); k <= Math.max(c, cx) && ok; k++) if (blocks(k, r)) ok = false;
          for (let rr = r2; rr < r && ok; rr++) if (!passUp(cx, rr)) ok = false;
          for (let k = Math.min(cx, c2); k <= Math.max(cx, c2) && ok; k++) if (blocks(k, r2)) ok = false;
          if (ok) { add(c2, r2); break; }
        }
      }
    }
  }
  const reached = (c, r, up) => [...seen].some((k) => { const [a, b] = k.split(',').map(Number); return Math.abs(a - c) <= 3 && b - r >= 0 && b - r <= up; });
  return {
    flag: reached(flag[0], flag[1], 0),
    gold: gold.filter(([c, r]) => reached(c, r, jump)).length,
    goldTotal: gold.length,
    slots: slots.filter(([c, r]) => reached(c, r, jump)).length,
    slotsTotal: slots.length,
  };
}
