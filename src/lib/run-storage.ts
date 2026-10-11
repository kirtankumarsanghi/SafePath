import type { AStarRunResult, HeuristicType } from "./astar";
import type { GridDocument } from "./map-model";
export function runRecord(mapId: number | null, userId: number | null, title: string, doc: GridDocument, results: AStarRunResult[], heuristic: HeuristicType, allowDiagonal: boolean) {
  const allReached = results.length > 0 && results.every(r => r.reached);
  const cost = allReached ? results.reduce((sum, r) => sum + r.stats.totalCost, 0) : null;
  return {
    mapId, userId, title: title.slice(0, 255), heuristic,
    startPoints: doc.starts, exitPoints: doc.exits, obstaclePoints: doc.obstacles,
    pathResult: { version: 2, people: results.map(r => ({ start: r.start, exit: r.exit, path: r.path, reached: r.reached, status: r.status, reason: r.reason, stats: { ...r.stats, totalCost: Number.isFinite(r.stats.totalCost) ? r.stats.totalCost : null } })), allReached },
    totalPathCost: cost,
    nodesExplored: results.reduce((s, r) => s + r.stats.nodesExplored, 0),
    nodesInOpen: results.reduce((s, r) => s + r.stats.nodesInOpen, 0),
    nodesInClosed: results.reduce((s, r) => s + r.stats.nodesInClosed, 0),
    timeTakenMs: Math.ceil(results.reduce((s, r) => s + r.stats.timeTakenMs, 0)),
    config: { version: 2, allowDiagonal, model: "grid-cost", document: doc },
  };
}
