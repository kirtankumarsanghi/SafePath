import { runEvacuation, type HeuristicType, type RunOptions } from "../lib/astar";
import type { GridDocument } from "../lib/map-model";
self.onmessage = (event: MessageEvent<{ document: GridDocument; heuristic: HeuristicType; options: RunOptions }>) => {
  try {
    const { document: d, heuristic, options } = event.data;
    const results = runEvacuation(d.gridData, d.gridWidth, d.gridHeight, d.starts, d.exits, d.obstacles, heuristic, options);
    self.postMessage({ results });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "A* could not complete." }); }
};
export {};
