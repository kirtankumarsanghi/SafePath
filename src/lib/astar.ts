export type CellType = "empty" | "wall" | "exit" | "start" | "obstacle" | "fire" | "blocked" | "unknown" | "door" | "window";
export type HeuristicType = "manhattan" | "euclidean" | "chebyshev";
export interface Point { x: number; y: number }
export interface NodeValues { f: number; g: number; h: number }
export interface ScoredPoint extends Point, NodeValues {}
/** Compact deltas, not quadratic copies of the entire closed list. */
export interface SimStep {
  popped: Point;
  poppedF: number; poppedG: number; poppedH: number;
  updates: ScoredPoint[];
  openCount: number; closedCount: number;
}
export interface AStarRunResult {
  start: Point; exit: Point; path: Point[];
  initial: ScoredPoint | null;
  steps: SimStep[];
  fMap: Record<string, NodeValues>;
  reached: boolean;
  status: "found" | "unreachable" | "invalid" | "limit";
  reason?: string;
  stats: { totalCost: number; nodesExplored: number; nodesInOpen: number; nodesInClosed: number; timeTakenMs: number; heuristicUsed: HeuristicType };
}
export interface RunOptions { allowDiagonal?: boolean; maxSteps?: number; trace?: boolean }
export const pointKey = (p: Point) => `${p.x},${p.y}`;
export const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
export const isBlocked = (t: CellType | undefined) => t === "wall" || t === "fire" || t === "blocked" || t === "window";
export function cellCost(type: CellType): number { return isBlocked(type) ? Infinity : type === "obstacle" ? 3 : 1; }
export function heuristicValue(a: Point, b: Point, type: HeuristicType): number {
  const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
  return type === "euclidean" ? Math.hypot(dx, dy) : type === "chebyshev" ? Math.max(dx, dy) : dx + dy;
}
export function heuristicFormula(type: HeuristicType): string {
  return type === "euclidean" ? "h(n) = sqrt(dx² + dy²)" : type === "chebyshev" ? "h(n) = max(|dx|, |dy|)" : "h(n) = |dx| + |dy|";
}
export function heuristicDescription(type: HeuristicType): string {
  return type === "manhattan"
    ? "Exact unobstructed distance for four-way movement. With diagonals enabled it is divided by sqrt(2), so it remains admissible."
    : type === "euclidean" ? "Straight-line lower bound. Admissible with four-way movement or diagonals costing sqrt(2)."
    : "Maximum axis distance. A conservative, consistent lower bound for either movement model.";
}
const DIRECTIONS: Point[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }];
interface HeapNode { point: Point; g: number; f: number; h: number; order: number }
class MinHeap {
  values: HeapNode[] = [];
  less(a: HeapNode, b: HeapNode) { return a.f < b.f || (a.f === b.f && (a.h < b.h || (a.h === b.h && a.order < b.order))); }
  push(node: HeapNode) {
    const v = this.values; v.push(node); let i = v.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (!this.less(v[i], v[p])) break; [v[i], v[p]] = [v[p], v[i]]; i = p; }
  }
  pop(): HeapNode | undefined {
    const v = this.values; if (!v.length) return;
    const first = v[0], last = v.pop()!;
    if (v.length) { v[0] = last; let i = 0; for (;;) { let n = i; const l = i * 2 + 1, r = l + 1; if (l < v.length && this.less(v[l], v[n])) n = l; if (r < v.length && this.less(v[r], v[n])) n = r; if (n === i) break; [v[n], v[i]] = [v[i], v[n]]; i = n; } }
    return first;
  }
}

/** Multi-goal A*: h(n) is the minimum lower bound to any valid exit. */
function search(grid: Record<string, CellType>, width: number, height: number, start: Point, exits: Point[], obstacles: Point[], heuristic: HeuristicType, options: RunOptions): AStarRunResult {
  const begin = performance.now();
  const blocked = new Set(obstacles.map(pointKey));
  const inBounds = (p: Point) => Number.isInteger(p?.x) && Number.isInteger(p?.y) && p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
  const traversable = (p: Point) => inBounds(p) && !blocked.has(pointKey(p)) && !isBlocked(grid[pointKey(p)]);
  const goals = exits.filter(traversable);
  const goalKeys = new Set(goals.map(pointKey));
  const diagonal = options.allowDiagonal ?? false;
  const heuristicScale = diagonal && heuristic === "manhattan" ? Math.SQRT2 : 1;
  const estimate = (p: Point) => {
    let nearest = Infinity;
    for (const goal of goals) {
      const value = heuristicValue(p, goal, heuristic);
      if (value < nearest) nearest = value;
    }
    return nearest / heuristicScale;
  };
  const result: AStarRunResult = {
    start, exit: goals[0] ?? exits[0] ?? start, initial: null, path: [], steps: [], fMap: {}, reached: false, status: "unreachable",
    stats: { totalCost: Infinity, nodesExplored: 0, nodesInOpen: 0, nodesInClosed: 0, timeTakenMs: 0, heuristicUsed: heuristic },
  };
  if (!traversable(start) || goals.length === 0) {
    result.status = "invalid";
    result.reason = !traversable(start) ? "The person is outside the grid or on a blocked cell. Move them to a walkable cell." : "There are no walkable, unblocked exits. Review the exit positions.";
    return result;
  }
  const frontier = new MinHeap(), open = new Set<string>(), closed = new Set<string>();
  const parents = new Map<string, Point>();
  const firstH = estimate(start);
  const firstKey = pointKey(start);
  result.initial = { ...start, g: 0, h: firstH, f: firstH };
  result.fMap[firstKey] = { g: 0, h: firstH, f: firstH };
  let order = 0;
  frontier.push({ point: start, g: 0, h: firstH, f: firstH, order: order++ }); open.add(firstKey);
  while (frontier.values.length > 0) {
    const entry = frontier.pop()!;
    const current = entry.point, key = pointKey(current);
    if (closed.has(key) || entry.g !== result.fMap[key]?.g) continue;
    if (options.maxSteps !== undefined && result.stats.nodesExplored >= options.maxSteps) {
      result.status = "limit"; result.reason = "The configured search limit was reached. No optimality claim is made."; break;
    }
    open.delete(key); closed.add(key); result.stats.nodesExplored++;
    const values = result.fMap[key];
    const step: SimStep = { popped: current, poppedF: values.f, poppedG: values.g, poppedH: values.h, updates: [], openCount: 0, closedCount: 0 };
    if (goalKeys.has(key)) {
      result.reached = true; result.status = "found"; result.exit = current;
      result.stats.totalCost = values.g;
      let node: Point | undefined = current;
      while (node) { result.path.push(node); node = parents.get(pointKey(node)); }
      result.path.reverse();
    } else {
      for (const d of DIRECTIONS.slice(0, diagonal ? 8 : 4)) {
        const next = { x: current.x + d.x, y: current.y + d.y };
        if (!traversable(next)) continue;
        if (d.x !== 0 && d.y !== 0 && (!traversable({ x: current.x + d.x, y: current.y }) || !traversable({ x: current.x, y: current.y + d.y }))) continue;
        const nextKey = pointKey(next);
        const g = values.g + cellCost(grid[nextKey] ?? "empty") * (d.x !== 0 && d.y !== 0 ? Math.SQRT2 : 1);
        if (g >= (result.fMap[nextKey]?.g ?? Infinity) - 1e-10) continue;
        const h = estimate(next); const f = g + h;
        result.fMap[nextKey] = { g, h, f }; parents.set(nextKey, current);
        closed.delete(nextKey); open.add(nextKey);
        frontier.push({ point: next, g, h, f, order: order++ });
        if (options.trace !== false) step.updates.push({ ...next, g, h, f });
      }
    }
    step.openCount = open.size; step.closedCount = closed.size;
    if (options.trace !== false) result.steps.push(step);
    if (result.reached) break;
  }
  if (!result.reached && result.status === "unreachable") result.reason = "No exit is reachable through the reviewed grid. Check doors, walls, fire zones and exit placement; A* will not cross a wall to force a route.";
  result.stats.nodesInOpen = open.size; result.stats.nodesInClosed = closed.size;
  result.stats.timeTakenMs = Math.round((performance.now() - begin) * 100) / 100;
  return result;
}
export function runAStarWithSteps(grid: Record<string, CellType>, width: number, height: number, start: Point, exit: Point, obstacles: Point[] = [], heuristic: HeuristicType = "manhattan", options: RunOptions = {}): AStarRunResult {
  return search(grid, width, height, start, [exit], obstacles, heuristic, options);
}
/** Always returns one result per person, including unreachable people. */
export function runEvacuation(grid: Record<string, CellType>, width: number, height: number, starts: Point[], exits: Point[], obstacles: Point[] = [], heuristic: HeuristicType = "manhattan", options: RunOptions = {}): AStarRunResult[] {
  return starts.map(start => search(grid, width, height, start, exits, obstacles, heuristic, options));
}
export interface SearchFrame { open: Set<string>; closed: Set<string>; fMap: Record<string, NodeValues>; version: number }
interface FrameCache extends SearchFrame {}
/** One cache per run: advancing the playback cursor only applies the new steps. */
const searchFrameCaches = new WeakMap<AStarRunResult, FrameCache>();
function initialFrame(run: AStarRunResult): FrameCache {
  const frame: FrameCache = { open: new Set(), closed: new Set(), fMap: {}, version: -1 };
  if (run.initial) { const { x, y, ...v } = run.initial; const key = `${x},${y}`; frame.open.add(key); frame.fMap[key] = v; }
  return frame;
}
/** Returns a cached, live view. Treat the sets as read-only: later calls may advance the same cache. */
export function getSearchFrame(run: AStarRunResult | undefined, index: number): SearchFrame {
  if (!run) return { open: new Set(), closed: new Set(), fMap: {}, version: -1 };
  const target = Math.max(-1, Math.min(index, run.steps.length - 1));
  let frame = searchFrameCaches.get(run);
  if (!frame || target < frame.version) { frame = initialFrame(run); searchFrameCaches.set(run, frame); }
  while (frame.version < target) {
    const step = run.steps[++frame.version], key = pointKey(step.popped);
    frame.open.delete(key); frame.closed.add(key);
    for (const { x, y, ...v } of step.updates) { const k = `${x},${y}`; frame.closed.delete(k); frame.open.add(k); frame.fMap[k] = v; }
  }
  return frame;
}
export function runAStar(grid: Record<string, CellType>, width: number, height: number, starts: Point[], exits: Point[], obstacles: Point[] = [], heuristic: HeuristicType = "manhattan") {
  const results = runEvacuation(grid, width, height, starts, exits, obstacles, heuristic, { trace: false });
  const best = results.filter(r => r.reached).sort((a, b) => a.stats.totalCost - b.stats.totalCost)[0] ?? results[0];
  return { path: best?.path ?? [], stats: best?.stats ?? { totalCost: Infinity, nodesExplored: 0, nodesInOpen: 0, nodesInClosed: 0, timeTakenMs: 0, heuristicUsed: heuristic } };
}
export const PATH_COLORS = [
  { stroke: "#059669", glow: "rgba(16,185,129,.4)", label: "Person 1" },
  { stroke: "#2563eb", glow: "rgba(59,130,246,.4)", label: "Person 2" },
  { stroke: "#d97706", glow: "rgba(245,158,11,.4)", label: "Person 3" },
  { stroke: "#c026d3", glow: "rgba(217,70,239,.4)", label: "Person 4" },
  { stroke: "#0891b2", glow: "rgba(6,182,212,.4)", label: "Person 5" },
];
export function colorForIndex(i: number) { return PATH_COLORS[i % PATH_COLORS.length]; }
