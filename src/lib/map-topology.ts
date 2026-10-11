import { isBlocked, type CellType } from "./astar";
import type { Bounds, NavigationGraphSummary, WallSegment } from "./map-analysis";

/** Derive the exact four-neighbor graph used by the A* engine; UNKNOWN and windows are not vertices. */
export function summarizeGridGraph(grid: Record<string, CellType>, cols: number, rows: number): NavigationGraphSummary {
  const valid = new Set<string>();
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!isBlocked(grid[`${x},${y}`])) valid.add(`${x},${y}`);
  const seen = new Set<string>(); let components = 0, edges = 0, isolatedNodes = 0;
  for (const key of valid) {
    const [x, y] = key.split(",").map(Number);
    const degree = Number(valid.has(`${x + 1},${y}`)) + Number(valid.has(`${x - 1},${y}`)) + Number(valid.has(`${x},${y + 1}`)) + Number(valid.has(`${x},${y - 1}`));
    edges += degree / 2;
    if (degree === 0) isolatedNodes++;
    if (seen.has(key)) continue;
    components++;
    const queue = [key]; seen.add(key);
    for (let head = 0; head < queue.length; head++) {
      const [cx, cy] = queue[head].split(",").map(Number);
      for (const next of [`${cx + 1},${cy}`, `${cx - 1},${cy}`, `${cx},${cy + 1}`, `${cx},${cy - 1}`]) {
        if (!valid.has(next) || seen.has(next)) continue;
        seen.add(next); queue.push(next);
      }
    }
  }
  return { nodeCount: valid.size, undirectedEdgeCount: edges, connectedComponents: components, isolatedNodes, floors: 1, verticalTransitionsModeled: false };
}
function sourceBounds(cellBounds: Bounds, crop: Bounds, width: number, height: number) {
  const left = crop.left + cellBounds.left * (crop.right - crop.left), right = crop.left + cellBounds.right * (crop.right - crop.left);
  const top = crop.top + cellBounds.top * (crop.bottom - crop.top), bottom = crop.top + cellBounds.bottom * (crop.bottom - crop.top);
  return { left: Math.floor(left * width), top: Math.floor(top * height), right: Math.ceil(right * width), bottom: Math.ceil(bottom * height) };
}
/** Contiguous cell runs, traced back to the source image. These are line hypotheses, not confirmed walls. */
export function extractWallSegments(grid: Record<string, CellType>, cols: number, rows: number, crop: Bounds, width: number, height: number): WallSegment[] {
  const segments: WallSegment[] = [];
  const add = (orientation: "horizontal" | "vertical", cells: string[], x0: number, y0: number, x1: number, y1: number) => {
    if (cells.length < 2) return;
    const bounds = sourceBounds({ left: x0 / cols, top: y0 / rows, right: x1 / cols, bottom: y1 / rows }, crop, width, height);
    segments.push({ id: `wall-${orientation}-${segments.length}`, orientation, cells, sourceBounds: bounds, status: "NEEDS_REVIEW" });
  };
  for (let y = 0; y < rows; y++) {
    let begin = -1;
    for (let x = 0; x <= cols; x++) {
      const wall = x < cols && grid[`${x},${y}`] === "wall";
      if (wall && begin < 0) begin = x;
      else if (!wall && begin >= 0) { add("horizontal", Array.from({ length: x - begin }, (_, i) => `${begin + i},${y}`), begin, y, x, y + 1); begin = -1; }
    }
  }
  for (let x = 0; x < cols; x++) {
    let begin = -1;
    for (let y = 0; y <= rows; y++) {
      const wall = y < rows && grid[`${x},${y}`] === "wall";
      if (wall && begin < 0) begin = y;
      else if (!wall && begin >= 0) { add("vertical", Array.from({ length: y - begin }, (_, i) => `${x},${begin + i}`), x, begin, x + 1, y); begin = -1; }
    }
  }
  return segments;
}
