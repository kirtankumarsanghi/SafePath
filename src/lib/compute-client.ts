import { runEvacuation, type AStarRunResult, type HeuristicType, type RunOptions } from "./astar";
import type { GridDocument } from "./map-model";
export async function computeEvacuation(document: GridDocument, heuristic: HeuristicType = "manhattan", options: RunOptions = {}, signal?: AbortSignal): Promise<AStarRunResult[]> {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  if (typeof Worker === "undefined") return runEvacuation(document.gridData, document.gridWidth, document.gridHeight, document.starts, document.exits, document.obstacles, heuristic, options);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/astar.worker.ts", import.meta.url), { type: "module" });
    const stop = () => { worker.terminate(); signal?.removeEventListener("abort", abort); };
    const abort = () => { stop(); reject(new DOMException("Cancelled", "AbortError")); };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = event => { stop(); if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.results as AStarRunResult[]); };
    worker.onerror = () => { stop(); reject(new Error("The search worker could not start. Reload the page and try again.")); };
    worker.postMessage({ document, heuristic, options });
  });
}
