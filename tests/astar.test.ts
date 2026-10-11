import test from "node:test";
import assert from "node:assert/strict";
import { cellCost, getSearchFrame, isBlocked, pointKey, runEvacuation, runAStarWithSteps, type Point, type CellType, type HeuristicType } from "../src/lib/astar";
const types: HeuristicType[] = ["manhattan", "euclidean", "chebyshev"];
function baseline(grid: Record<string, CellType>, w: number, h: number, start: Point, goals: Point[], diagonal: boolean) {
  const distance = new Map<string, number>([[pointKey(start), 0]]), closed = new Set<string>(), queue: Point[] = [start];
  while (queue.length) {
    queue.sort((a, b) => distance.get(pointKey(a))! - distance.get(pointKey(b))!);
    const p = queue.shift()!, key = pointKey(p); if (closed.has(key)) continue; closed.add(key);
    if (goals.some(g => g.x === p.x && g.y === p.y)) return distance.get(key)!;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || (!diagonal && dx && dy)) continue;
      const n = { x: p.x + dx, y: p.y + dy }, nk = pointKey(n);
      if (n.x < 0 || n.x >= w || n.y < 0 || n.y >= h || isBlocked(grid[nk])) continue;
      if (dx && dy && (isBlocked(grid[`${p.x + dx},${p.y}`]) || isBlocked(grid[`${p.x},${p.y + dy}`]))) continue;
      const cost = distance.get(key)! + cellCost(grid[nk] ?? "empty") * (dx && dy ? Math.SQRT2 : 1);
      if (cost < (distance.get(nk) ?? Infinity)) { distance.set(nk, cost); queue.push(n); }
    }
  }
  return Infinity;
}
test("each heuristic matches independent Dijkstra for weighted, multi-exit grids", () => {
  let state = 2026; const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let n = 0; n < 20; n++) {
    const grid: Record<string, CellType> = {};
    for (let y = 0; y < 14; y++) for (let x = 0; x < 18; x++) { const v = random(); grid[`${x},${y}`] = v < .22 ? "wall" : v < .3 ? "obstacle" : "empty"; }
    const start = { x: 1, y: 1 }, exits = [{ x: 16, y: 12 }, { x: 2, y: 12 }];
    [start, ...exits].forEach(p => grid[pointKey(p)] = "empty");
    for (const diag of [false, true]) {
      const expected = baseline(grid, 18, 14, start, exits, diag);
      for (const heuristic of types) {
        const [r] = runEvacuation(grid, 18, 14, [start], exits, [], heuristic, { allowDiagonal: diag });
        assert.equal(r.reached, Number.isFinite(expected));
        if (r.reached) assert.ok(Math.abs(r.stats.totalCost - expected) < 1e-8, `${heuristic}, diagonal=${diag}: ${r.stats.totalCost} != ${expected}`);
        for (const p of r.path) assert.equal(isBlocked(grid[pointKey(p)]), false);
      }
    }
  }
});
test("blocked start, blocked goal, identical start/goal and no exits are explicit", () => {
  assert.equal(runAStarWithSteps({ "1,1": "wall" }, 8, 8, { x: 1, y: 1 }, { x: 6, y: 6 }).status, "invalid");
  assert.equal(runAStarWithSteps({ "6,6": "wall" }, 8, 8, { x: 1, y: 1 }, { x: 6, y: 6 }).status, "invalid");
  const same = runAStarWithSteps({}, 8, 8, { x: 1, y: 1 }, { x: 1, y: 1 }); assert.equal(same.stats.totalCost, 0); assert.equal(same.path.length, 1);
  assert.equal(runEvacuation({}, 8, 8, [{ x: 1, y: 1 }], [])[0].reached, false);
});
test("unreachable people retain their indices; diagonal corner cutting is forbidden", () => {
  const g: Record<string, CellType> = {}; for (let y = 0; y < 8; y++) g[`3,${y}`] = "wall";
  const r = runEvacuation(g, 8, 8, [{ x: 1, y: 1 }, { x: 6, y: 1 }], [{ x: 6, y: 6 }]); assert.equal(r.length, 2); assert.equal(r[0].status, "unreachable"); assert.equal(r[1].reached, true);
  const blocked = runAStarWithSteps({ "1,0": "wall", "0,1": "wall" }, 8, 8, { x: 0, y: 0 }, { x: 1, y: 1 }, [], "euclidean", { allowDiagonal: true }); assert.equal(blocked.reached, false);
});
test("trace frames match open and closed counts after expansion and rewind", () => {
  const r = runAStarWithSteps({}, 16, 16, { x: 1, y: 1 }, { x: 13, y: 12 });
  r.steps.forEach((s, i) => { const f = getSearchFrame(r, i); assert.equal(f.open.size, s.openCount); assert.equal(f.closed.size, s.closedCount); assert.ok(!f.open.has(pointKey(s.popped))); });
  assert.equal(getSearchFrame(r, -1).open.size, 1); assert.equal(getSearchFrame(r, 0).closed.size, 1);
});
test("dynamic hazards force a new route or an honest failure", () => {
  const first = runEvacuation({}, 8, 8, [{ x: 1, y: 4 }], [{ x: 6, y: 4 }])[0];
  const next = runEvacuation({}, 8, 8, [{ x: 1, y: 4 }], [{ x: 6, y: 4 }], [{ x: 3, y: 4 }])[0];
  assert.equal(first.stats.totalCost, 5); assert.equal(next.stats.totalCost, 7); assert.ok(!next.path.some(p => p.x === 3 && p.y === 4));
});
