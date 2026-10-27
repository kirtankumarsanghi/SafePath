export type CellType =
  | "empty"
  | "wall"
  | "exit"
  | "start"
  | "obstacle"
  | "fire"
  | "blocked"
  | "unknown"
  | "door"
  | "window"
  | "smoke"
  | "crowd"
  | "stairs";

export type HeuristicType = "manhattan" | "euclidean" | "chebyshev";
export interface Point { x: number; y: number }
export interface NodeValues { f: number; g: number; h: number }
export interface ScoredPoint extends Point, NodeValues {}

export interface ConnectorLink {
  from: Point;
  to: Point;
  cost?: number;
  bidirectional?: boolean;
  label?: string;
}

export interface AlternativeRoute {
  exit: Point;
  totalCost: number;
  path: Point[];
}

export interface EvacuationTimeEstimate {
  distanceMeters: number;
  travelSeconds: number;
  congestionDelaySeconds: number;
  totalSeconds: number;
  formatted: string;
}

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
  alternativeExit?: AlternativeRoute | null;
  congestionSharedCells?: number;
  assignedExitLoad?: number;
  stats: {
    totalCost: number;
    nodesExplored: number;
    nodesInOpen: number;
    nodesInClosed: number;
    timeTakenMs: number;
    heuristicUsed: HeuristicType;
  };
}

export interface RunOptions {
  allowDiagonal?: boolean;
  maxSteps?: number;
  trace?: boolean;
  /** Extra traversal cost added per prior occupant sharing a cell. */
  congestionPenalty?: number;
  /** Maximum occupants per exit (either a uniform cap or keyed by "x,y"). */
  exitCapacity?: number | Record<string, number>;
  /** Extra cost added to cells adjacent to fire/hazard obstacles. */
  fireBufferPenalty?: number;
  /** Compute the second-best exit route when multiple exits exist. */
  includeSecondBestExit?: boolean;
  /** Multi-floor stair/elevator connectors between grid coordinates. */
  connectors?: ConnectorLink[];
}

export const pointKey = (p: Point) => `${p.x},${p.y}`;
export const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
export const isBlocked = (t: CellType | undefined) =>
  t === "wall" || t === "fire" || t === "blocked" || t === "window";

export function cellCost(type: CellType): number {
  if (isBlocked(type)) return Infinity;
  if (type === "smoke") return 5;
  if (type === "obstacle") return 3;
  if (type === "crowd") return 2.5;
  if (type === "stairs") return 2;
  return 1;
}

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

const DIRECTIONS: Point[] = [
  { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
];

interface HeapNode { point: Point; g: number; f: number; h: number; order: number }

class MinHeap {
  values: HeapNode[] = [];
  less(a: HeapNode, b: HeapNode) {
    return a.f < b.f || (a.f === b.f && (a.h < b.h || (a.h === b.h && a.order < b.order)));
  }
  push(node: HeapNode) {
    const v = this.values; v.push(node); let i = v.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(v[i], v[p])) break;
      [v[i], v[p]] = [v[p], v[i]];
      i = p;
    }
  }
  pop(): HeapNode | undefined {
    const v = this.values; if (!v.length) return;
    const first = v[0], last = v.pop()!;
    if (v.length) {
      v[0] = last; let i = 0;
      for (;;) {
        let n = i; const l = i * 2 + 1, r = l + 1;
        if (l < v.length && this.less(v[l], v[n])) n = l;
        if (r < v.length && this.less(v[r], v[n])) n = r;
        if (n === i) break;
        [v[n], v[i]] = [v[i], v[n]]; i = n;
      }
    }
    return first;
  }
}

function buildFireAdjacentSet(grid: Record<string, CellType>, obstacles: Point[], width: number, height: number): Set<string> {
  const adj = new Set<string>();
  const hazards: Point[] = [...obstacles];
  for (const [k, v] of Object.entries(grid)) {
    if (v === "fire") {
      const [xs, ys] = k.split(",");
      hazards.push({ x: Number(xs), y: Number(ys) });
    }
  }
  for (const h of hazards) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = h.x + dx, ny = h.y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
          adj.add(`${nx},${ny}`);
        }
      }
    }
  }
  return adj;
}

/** Multi-goal A*: h(n) is the minimum lower bound to any valid exit. */
function search(
  grid: Record<string, CellType>,
  width: number,
  height: number,
  start: Point,
  exits: Point[],
  obstacles: Point[],
  heuristic: HeuristicType,
  options: RunOptions,
  cellUsage?: Map<string, number>,
  fireAdj?: Set<string>
): AStarRunResult {
  const begin = performance.now();
  const blocked = new Set(obstacles.map(pointKey));
  const inBounds = (p: Point) => Number.isInteger(p?.x) && Number.isInteger(p?.y) && p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
  const traversable = (p: Point) => inBounds(p) && !blocked.has(pointKey(p)) && !isBlocked(grid[pointKey(p)]);
  const goals = exits.filter(traversable);
  const goalKeys = new Set(goals.map(pointKey));
  const diagonal = options.allowDiagonal ?? false;
  const heuristicScale = diagonal && heuristic === "manhattan" ? Math.SQRT2 : 1;
  const congestionPenalty = options.congestionPenalty && options.congestionPenalty > 0 ? options.congestionPenalty : 0;
  const fireBufferPenalty = options.fireBufferPenalty && options.fireBufferPenalty > 0 ? options.fireBufferPenalty : 0;

  const connectorMap = new Map<string, { to: Point; cost: number }[]>();
  if (options.connectors?.length) {
    for (const c of options.connectors) {
      if (!traversable(c.from) || !traversable(c.to)) continue;
      const cost = c.cost !== undefined && c.cost >= 0 ? c.cost : 2;
      const fk = pointKey(c.from);
      connectorMap.set(fk, [...(connectorMap.get(fk) ?? []), { to: c.to, cost }]);
      if (c.bidirectional !== false) {
        const tk = pointKey(c.to);
        connectorMap.set(tk, [...(connectorMap.get(tk) ?? []), { to: c.from, cost }]);
      }
    }
  }

  // When connectors (e.g. stairs between floors) are active, straight-line heuristic
  // across 2D coordinates could overestimate if a connector teleports closer to an exit,
  // unless we take the minimum over direct goal distance and connector-assisted distance.
  const hasConnectors = connectorMap.size > 0;
  const estimate = (p: Point) => {
    let nearest = Infinity;
    for (const goal of goals) {
      const value = heuristicValue(p, goal, heuristic);
      if (value < nearest) nearest = value;
    }
    if (hasConnectors && options.connectors) {
      for (const c of options.connectors) {
        for (const [entryPt, exitPt] of c.bidirectional !== false ? [[c.from, c.to], [c.to, c.from]] : [[c.from, c.to]]) {
          const toEntry = heuristicValue(p, entryPt, heuristic);
          for (const goal of goals) {
            const viaConnector = toEntry + (c.cost ?? 2) * heuristicScale + heuristicValue(exitPt, goal, heuristic);
            if (viaConnector < nearest) nearest = viaConnector;
          }
        }
      }
    }
    return nearest / heuristicScale;
  };

  const result: AStarRunResult = {
    start, exit: goals[0] ?? exits[0] ?? start, initial: null, path: [], steps: [], fMap: {}, reached: false, status: "unreachable",
    stats: { totalCost: Infinity, nodesExplored: 0, nodesInOpen: 0, nodesInClosed: 0, timeTakenMs: 0, heuristicUsed: heuristic },
  };
  if (!traversable(start) || goals.length === 0) {
    result.status = "invalid";
    result.reason = !traversable(start)
      ? "The person is outside the grid or on a blocked cell. Move them to a walkable cell."
      : "There are no walkable, unblocked exits. Review the exit positions.";
    return result;
  }

  const frontier = new MinHeap(), open = new Set<string>(), closed = new Set<string>();
  const parents = new Map<string, Point>();
  const firstH = estimate(start);
  const firstKey = pointKey(start);
  result.initial = { ...start, g: 0, h: firstH, f: firstH };
  result.fMap[firstKey] = { g: 0, h: firstH, f: firstH };
  let order = 0;
  frontier.push({ point: start, g: 0, h: firstH, f: firstH, order: order++ });
  open.add(firstKey);

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
        const baseStep = cellCost(grid[nextKey] ?? "empty") * (d.x !== 0 && d.y !== 0 ? Math.SQRT2 : 1);
        const crowdExtra = congestionPenalty > 0 && cellUsage ? (cellUsage.get(nextKey) ?? 0) * congestionPenalty : 0;
        const fireExtra = fireBufferPenalty > 0 && fireAdj?.has(nextKey) ? fireBufferPenalty : 0;
        const g = values.g + baseStep + crowdExtra + fireExtra;
        if (g >= (result.fMap[nextKey]?.g ?? Infinity) - 1e-10) continue;
        const h = estimate(next); const f = g + h;
        result.fMap[nextKey] = { g, h, f }; parents.set(nextKey, current);
        closed.delete(nextKey); open.add(nextKey);
        frontier.push({ point: next, g, h, f, order: order++ });
        if (options.trace !== false) step.updates.push({ ...next, g, h, f });
      }
      const links = connectorMap.get(key);
      if (links) {
        for (const link of links) {
          const next = link.to;
          const nextKey = pointKey(next);
          const crowdExtra = congestionPenalty > 0 && cellUsage ? (cellUsage.get(nextKey) ?? 0) * congestionPenalty : 0;
          const g = values.g + link.cost + crowdExtra;
          if (g >= (result.fMap[nextKey]?.g ?? Infinity) - 1e-10) continue;
          const h = estimate(next); const f = g + h;
          result.fMap[nextKey] = { g, h, f }; parents.set(nextKey, current);
          closed.delete(nextKey); open.add(nextKey);
          frontier.push({ point: next, g, h, f, order: order++ });
          if (options.trace !== false) step.updates.push({ ...next, g, h, f });
        }
      }
    }
    step.openCount = open.size; step.closedCount = closed.size;
    if (options.trace !== false) result.steps.push(step);
    if (result.reached) break;
  }
  if (!result.reached && result.status === "unreachable") {
    result.reason = "No exit is reachable through the reviewed grid. Check doors, walls, fire zones and exit placement; A* will not cross a wall to force a route.";
  }
  result.stats.nodesInOpen = open.size; result.stats.nodesInClosed = closed.size;
  result.stats.timeTakenMs = Math.round((performance.now() - begin) * 100) / 100;
  return result;
}

export function runAStarWithSteps(
  grid: Record<string, CellType>,
  width: number,
  height: number,
  start: Point,
  exit: Point,
  obstacles: Point[] = [],
  heuristic: HeuristicType = "manhattan",
  options: RunOptions = {}
): AStarRunResult {
  const fireAdj = options.fireBufferPenalty && options.fireBufferPenalty > 0 ? buildFireAdjacentSet(grid, obstacles, width, height) : undefined;
  return search(grid, width, height, start, [exit], obstacles, heuristic, options, undefined, fireAdj);
}

function exitCapFor(exit: Point, cap: number | Record<string, number> | undefined): number {
  if (cap === undefined) return Infinity;
  if (typeof cap === "number") return cap > 0 ? cap : Infinity;
  const k = pointKey(exit);
  return cap[k] !== undefined && cap[k] > 0 ? cap[k] : Infinity;
}

/** Always returns one result per person, including unreachable people. */
export function runEvacuation(
  grid: Record<string, CellType>,
  width: number,
  height: number,
  starts: Point[],
  exits: Point[],
  obstacles: Point[] = [],
  heuristic: HeuristicType = "manhattan",
  options: RunOptions = {}
): AStarRunResult[] {
  const useCongestion = Boolean(options.congestionPenalty && options.congestionPenalty > 0);
  const useCapacity = options.exitCapacity !== undefined;
  const useFireBuffer = Boolean(options.fireBufferPenalty && options.fireBufferPenalty > 0);
  const fireAdj = useFireBuffer ? buildFireAdjacentSet(grid, obstacles, width, height) : undefined;

  const cellUsage = new Map<string, number>();
  const exitLoads = new Map<string, number>();

  return starts.map(start => {
    const availableExits = useCapacity
      ? exits.filter(e => (exitLoads.get(pointKey(e)) ?? 0) < exitCapFor(e, options.exitCapacity))
      : exits;

    const run = search(
      grid,
      width,
      height,
      start,
      availableExits,
      obstacles,
      heuristic,
      options,
      useCongestion ? cellUsage : undefined,
      fireAdj
    );

    if (!run.reached && useCapacity && availableExits.length === 0 && exits.length > 0) {
      run.status = "unreachable";
      run.reason = "All reachable exits have reached their configured occupant capacity.";
    }

    if (run.reached) {
      let sharedCells = 0;
      for (const p of run.path) {
        const k = pointKey(p);
        const prev = cellUsage.get(k) ?? 0;
        if (prev > 0) sharedCells++;
        cellUsage.set(k, prev + 1);
      }
      run.congestionSharedCells = sharedCells;

      const ek = pointKey(run.exit);
      const nextLoad = (exitLoads.get(ek) ?? 0) + 1;
      exitLoads.set(ek, nextLoad);
      run.assignedExitLoad = nextLoad;

      if (options.includeSecondBestExit && exits.length > 1) {
        const otherExits = exits.filter(e => !samePoint(e, run.exit));
        if (otherExits.length > 0) {
          const alt = search(
            grid,
            width,
            height,
            start,
            otherExits,
            obstacles,
            heuristic,
            { ...options, trace: false, includeSecondBestExit: false },
            useCongestion ? cellUsage : undefined,
            fireAdj
          );
          run.alternativeExit = alt.reached
            ? { exit: alt.exit, totalCost: alt.stats.totalCost, path: alt.path }
            : null;
        }
      }
    }

    return run;
  });
}

export interface TimeEstimateOptions {
  /** Meters per grid cell (default 1.0 m). */
  scaleMetersPerCell?: number;
  /** Unimpeded walking speed in m/s (default 1.35 m/s per NFPA/SFPE standard). */
  walkingSpeedMps?: number;
  /** Queuing delay in seconds per shared congested cell (default 0.6 s). */
  congestionDelayPerCell?: number;
}

export function estimateEvacuationTime(
  run: AStarRunResult,
  grid?: Record<string, CellType>,
  options: TimeEstimateOptions = {}
): EvacuationTimeEstimate {
  const scale = options.scaleMetersPerCell && options.scaleMetersPerCell > 0 ? options.scaleMetersPerCell : 1.0;
  const speed = options.walkingSpeedMps && options.walkingSpeedMps > 0 ? options.walkingSpeedMps : 1.35;
  const delayPerShared = options.congestionDelayPerCell ?? 0.6;

  if (!run.reached || !Number.isFinite(run.stats.totalCost)) {
    return {
      distanceMeters: 0,
      travelSeconds: Infinity,
      congestionDelaySeconds: 0,
      totalSeconds: Infinity,
      formatted: "No route",
    };
  }

  let geometricCells = 0;
  for (let i = 1; i < run.path.length; i++) {
    const a = run.path[i - 1], b = run.path[i];
    geometricCells += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const distanceMeters = Math.round(geometricCells * scale * 100) / 100;
  const weightedDistance = run.stats.totalCost * scale;
  void grid;
  const travelSeconds = Math.round((weightedDistance / speed) * 10) / 10;
  const congestionDelaySeconds = Math.round((run.congestionSharedCells ?? 0) * delayPerShared * 10) / 10;
  const totalSeconds = Math.round((travelSeconds + congestionDelaySeconds) * 10) / 10;

  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  const formatted = mins > 0 ? `${mins}m ${secs}s` : `${totalSeconds.toFixed(1)}s`;

  return {
    distanceMeters,
    travelSeconds,
    congestionDelaySeconds,
    totalSeconds,
    formatted,
  };
}

/** Accessible screen-reader text summary of a computed route. */
export function describeRouteSteps(run: AStarRunResult, scaleMetersPerCell = 1.0): string[] {
  if (!run.reached || run.path.length === 0) {
    return [run.reason ?? "No reachable exit route found."];
  }
  if (run.path.length === 1) {
    return [`Start at (${run.start.x}, ${run.start.y}), already at exit.`];
  }

  const instructions: string[] = [`Start at (${run.start.x}, ${run.start.y}).`];
  const dirName = (dx: number, dy: number): string => {
    if (dx === 0 && dy < 0) return "North";
    if (dx === 0 && dy > 0) return "South";
    if (dx > 0 && dy === 0) return "East";
    if (dx < 0 && dy === 0) return "West";
    if (dx > 0 && dy < 0) return "Northeast";
    if (dx < 0 && dy < 0) return "Northwest";
    if (dx > 0 && dy > 0) return "Southeast";
    if (dx < 0 && dy > 0) return "Southwest";
    return "Connector";
  };

  let segStart = 0;
  while (segStart < run.path.length - 1) {
    const p0 = run.path[segStart], p1 = run.path[segStart + 1];
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      instructions.push(`Take stair/floor connector from (${p0.x}, ${p0.y}) to (${p1.x}, ${p1.y}).`);
      segStart++;
      continue;
    }
    let segEnd = segStart + 1;
    while (segEnd < run.path.length - 1) {
      const a = run.path[segEnd], b = run.path[segEnd + 1];
      if (b.x - a.x === dx && b.y - a.y === dy) segEnd++;
      else break;
    }
    const steps = segEnd - segStart;
    const stepLen = Math.hypot(dx, dy) * steps * scaleMetersPerCell;
    const target = run.path[segEnd];
    instructions.push(
      `Move ${dirName(dx, dy)} ${steps} ${steps === 1 ? "cell" : "cells"} (${stepLen.toFixed(1)} m) to (${target.x}, ${target.y}).`
    );
    segStart = segEnd;
  }

  instructions.push(`Arrive at exit (${run.exit.x}, ${run.exit.y}).`);
  return instructions;
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
