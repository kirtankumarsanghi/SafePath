import { runEvacuation, type AStarRunResult, type HeuristicType, type RunOptions } from "./astar";
import type { GridDocument } from "./map-model";
export async function computeEvacuation(document: GridDocument, heuristic: HeuristicType = "manhattan", options: RunOptions = {}, signal?: AbortSignal): Promise<AStarRunResult[]> {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  if (typeof Worker === "undefined") {
    return runEvacuation(document.gridData, document.gridWidth, document.gridHeight, document.starts, document.exits, document.obstacles, heuristic, options);
  }
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("../workers/astar.worker.ts", import.meta.url), { type: "module" });
    } catch {
      // Fallback directly to main thread execution if Worker cannot be constructed
      try {
        resolve(runEvacuation(document.gridData, document.gridWidth, document.gridHeight, document.starts, document.exits, document.obstacles, heuristic, options));
      } catch (err) {
        reject(err instanceof Error ? err : new Error("A* calculation failed."));
      }
      return;
    }

    let finished = false;
    const stop = () => {
      finished = true;
      try { worker.terminate(); } catch {}
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      stop();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });

    worker.onmessage = event => {
      stop();
      if (event.data?.error) {
        // Fallback to main thread
        try {
          resolve(runEvacuation(document.gridData, document.gridWidth, document.gridHeight, document.starts, document.exits, document.obstacles, heuristic, options));
        } catch {
          reject(new Error(event.data.error));
        }
      } else {
        resolve(event.data.results as AStarRunResult[]);
      }
    };

    worker.onerror = () => {
      if (finished) return;
      stop();
      // Graceful fallback to running on main thread rather than failing
      try {
        resolve(runEvacuation(document.gridData, document.gridWidth, document.gridHeight, document.starts, document.exits, document.obstacles, heuristic, options));
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Search computation failed."));
      }
    };

    try {
      worker.postMessage({ document, heuristic, options });
    } catch {
      stop();
      resolve(runEvacuation(document.gridData, document.gridWidth, document.gridHeight, document.starts, document.exits, document.obstacles, heuristic, options));
    }
  });
}
