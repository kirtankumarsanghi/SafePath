import { isBlocked, type CellType } from "./astar";
import type { Bounds, NavigationGraphSummary, PlanObject, WallSegment } from "./map-analysis";

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

/**
 * Identify narrow (1-3 cell) walkable gaps between collinear wall segments where
 * both sides perpendicular to the wall are walkable (structural doorway hypotheses).
 */
export function extractDoorCandidates(grid: Record<string, CellType>, cols: number, rows: number, crop: Bounds): PlanObject[] {
  const doors: PlanObject[] = [];
  const toNormBounds = (x0: number, y0: number, x1: number, y1: number): Bounds => ({
    left: crop.left + (x0 / cols) * (crop.right - crop.left),
    top: crop.top + (y0 / rows) * (crop.bottom - crop.top),
    right: crop.left + (x1 / cols) * (crop.right - crop.left),
    bottom: crop.top + (y1 / rows) * (crop.bottom - crop.top),
  });

  // Horizontal wall doorway gaps
  for (let y = 1; y < rows - 1; y++) {
    let x = 1;
    while (x < cols - 1) {
      if (grid[`${x - 1},${y}`] === "wall" && !isBlocked(grid[`${x},${y}`])) {
        let gapEnd = x;
        while (gapEnd < cols - 1 && !isBlocked(grid[`${gapEnd},${y}`]) && gapEnd - x < 4) gapEnd++;
        const gapLen = gapEnd - x;
        if (gapLen >= 1 && gapLen <= 3 && grid[`${gapEnd},${y}`] === "wall") {
          const hasLeftWallRun = x >= 2 && grid[`${x - 2},${y}`] === "wall";
          const hasRightWallRun = gapEnd + 1 < cols && grid[`${gapEnd + 1},${y}`] === "wall";
          const openAboveAndBelow = !isBlocked(grid[`${x},${y - 1}`]) && !isBlocked(grid[`${x},${y + 1}`]);
          if ((hasLeftWallRun || hasRightWallRun) && openAboveAndBelow) {
            const cells = Array.from({ length: gapLen }, (_, i) => `${x + i},${y}`);
            doors.push({
              id: `door-h-${doors.length}`,
              semanticClass: "DOOR",
              status: "NEEDS_REVIEW",
              bounds: toNormBounds(x, y, gapEnd, y + 1),
              gridCells: cells,
              method: "grid-geometry",
              scoreType: "not-calibrated",
              legendId: null,
              evidence: `A ${gapLen}-cell walkable opening between collinear horizontal wall segments connects two open areas.`,
            });
          }
        }
        x = gapEnd + 1;
      } else {
        x++;
      }
    }
  }

  // Vertical wall doorway gaps
  for (let x = 1; x < cols - 1; x++) {
    let y = 1;
    while (y < rows - 1) {
      if (grid[`${x},${y - 1}`] === "wall" && !isBlocked(grid[`${x},${y}`])) {
        let gapEnd = y;
        while (gapEnd < rows - 1 && !isBlocked(grid[`${x},${gapEnd}`]) && gapEnd - y < 4) gapEnd++;
        const gapLen = gapEnd - y;
        if (gapLen >= 1 && gapLen <= 3 && grid[`${x},${gapEnd}`] === "wall") {
          const hasTopWallRun = y >= 2 && grid[`${x},${y - 2}`] === "wall";
          const hasBottomWallRun = gapEnd + 1 < rows && grid[`${x},${gapEnd + 1}`] === "wall";
          const openLeftAndRight = !isBlocked(grid[`${x - 1},${y}`]) && !isBlocked(grid[`${x + 1},${y}`]);
          if ((hasTopWallRun || hasBottomWallRun) && openLeftAndRight) {
            const cells = Array.from({ length: gapLen }, (_, i) => `${x},${y + i}`);
            doors.push({
              id: `door-v-${doors.length}`,
              semanticClass: "DOOR",
              status: "NEEDS_REVIEW",
              bounds: toNormBounds(x, y, x + 1, gapEnd),
              gridCells: cells,
              method: "grid-geometry",
              scoreType: "not-calibrated",
              legendId: null,
              evidence: `A ${gapLen}-cell walkable opening between collinear vertical wall segments connects two open areas.`,
            });
          }
        }
        y = gapEnd + 1;
      } else {
        y++;
      }
    }
  }

  return doors.slice(0, 60);
}
