import { isBlocked, pointKey, samePoint, type CellType, type Point } from "./astar";
import { validCrop, validateConversionOptions, type SavedAnalysis } from "./map-analysis";
export interface GridDocument {
  gridWidth: number; gridHeight: number; gridData: Record<string, CellType>;
  starts: Point[]; exits: Point[]; obstacles: Point[];
}
export interface SavedMap extends GridDocument {
  id: number; title: string; description: string | null; imageUrl: string | null; sourceImage: string | null;
  analysis: SavedAnalysis | null; updatedAt?: string;
}
export type EditTool = "person" | "exit" | "wall" | "fire" | "floor" | "blocked" | "erase";
export function cleanTerrain(grid: Record<string, CellType>): Record<string, CellType> {
  return Object.fromEntries(Object.entries(grid).map(([k, v]) => [k, v === "start" || v === "exit" ? "empty" : v]));
}
export function applyTool(doc: GridDocument, tool: EditTool, p: Point): GridDocument {
  if (p.x < 0 || p.y < 0 || p.x >= doc.gridWidth || p.y >= doc.gridHeight) return doc;
  const k = pointKey(p);
  if ((tool === "person" || tool === "exit") && (isBlocked(doc.gridData[k]) || doc.obstacles.some(q => samePoint(p, q)))) return doc;
  if (tool === "person") {
    if (doc.exits.some(q => samePoint(q, p))) return doc;
    return { ...doc, starts: doc.starts.some(q => samePoint(q, p)) ? doc.starts.filter(q => !samePoint(q, p)) : doc.starts.length < 12 ? [...doc.starts, p] : doc.starts };
  }
  if (tool === "exit") {
    if (doc.starts.some(q => samePoint(q, p))) return doc;
    return { ...doc, exits: doc.exits.some(q => samePoint(q, p)) ? doc.exits.filter(q => !samePoint(q, p)) : doc.exits.length < 32 ? [...doc.exits, p] : doc.exits };
  }
  const removeAnchors = tool === "wall" || tool === "blocked" || tool === "erase";
  const obstacles = doc.obstacles.filter(q => !samePoint(q, p));
  return {
    ...doc,
    gridData: { ...doc.gridData, [k]: tool === "wall" ? "wall" : tool === "blocked" ? "blocked" : "empty" },
    starts: removeAnchors ? doc.starts.filter(q => !samePoint(q, p)) : doc.starts,
    exits: removeAnchors ? doc.exits.filter(q => !samePoint(q, p)) : doc.exits,
    obstacles: tool === "fire" ? [...obstacles, p] : obstacles,
  };
}
export function inspectDocument(doc: GridDocument) {
  const errors: string[] = [];
  if (!doc.starts.length) errors.push("Place at least one person on a walkable cell.");
  if (!doc.exits.length) errors.push("Confirm an exit candidate or mark a real exit on the grid.");
  const fires = new Set(doc.obstacles.map(pointKey));
  const free = (p: Point) => p.x >= 0 && p.y >= 0 && p.x < doc.gridWidth && p.y < doc.gridHeight && !isBlocked(doc.gridData[pointKey(p)]) && !fires.has(pointKey(p));
  doc.starts.forEach((p, i) => { if (!free(p)) errors.push(`Person ${i + 1} is on a wall or blocked cell.`); });
  doc.exits.forEach((p, i) => { if (!free(p)) errors.push(`Exit ${i + 1} is on a wall or blocked cell.`); });
  const reached = new Set<string>(), queue = doc.exits.filter(free);
  queue.forEach(p => reached.add(pointKey(p)));
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: p.x + dx, y: p.y + dy }, key = pointKey(n);
      if (!free(n) || reached.has(key)) continue;
      reached.add(key); queue.push(n);
    }
  }
  const unreachable = doc.starts.map((p, i) => reached.has(pointKey(p)) ? -1 : i).filter(i => i >= 0);
  return { errors, unreachable, reachablePeople: doc.starts.length - unreachable.length, connectedCells: reached.size, walls: Object.values(doc.gridData).filter(isBlocked).length };
}
export class MapInputError extends Error {}
const fail = (message: string): never => { throw new MapInputError(message); };
const TYPES = new Set(["empty", "wall", "exit", "start", "obstacle", "fire", "blocked", "unknown", "door", "window"]);
/** Validate all coordinates and JSON shapes before a map reaches PostgreSQL or A*. */
export function parseMapInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Send a map object.");
  const b = value as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title || title.length > 255) fail("A map title of 1–255 characters is required.");
  const width = b.gridWidth as number, height = b.gridHeight as number;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8 || width > 96 || height > 96) fail("Grid dimensions must be integers from 8 to 96.");
  if (!b.gridData || typeof b.gridData !== "object" || Array.isArray(b.gridData)) fail("The converted grid is missing. Analyze or create a map first.");
  const input = b.gridData as Record<string, unknown>, gridData: Record<string, CellType> = {};
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const k = `${x},${y}`, type = input[k];
    if (typeof type !== "string" || !TYPES.has(type)) fail(`Grid cell (${x}, ${y}) is missing or invalid. Re-convert the image.`);
    gridData[k] = type === "start" || type === "exit" ? "empty" : type as CellType;
  }
  const points = (field: string, max: number): Point[] => {
    const data = b[field]; if (!Array.isArray(data) || data.length > max) fail(`${field} must be an array with at most ${max} cells.`);
    const seen = new Set<string>(); const result: Point[] = [];
    for (const point of data as unknown[]) {
      if (!point || typeof point !== "object") fail(`Invalid ${field} coordinate.`);
      const p = point as Point;
      if (!Number.isInteger(p.x) || !Number.isInteger(p.y) || p.x < 0 || p.y < 0 || p.x >= width || p.y >= height) fail(`${field} has a coordinate outside the grid.`);
      const key = pointKey(p); if (!seen.has(key)) { seen.add(key); result.push({ x: p.x, y: p.y }); }
    }
    return result;
  };
  const starts = points("starts", 12), exits = points("exits", 32), obstacles = points("obstacles", width * height);
  const dataImage = (field: string, maxLength: number, types: string): string | null => {
    const value = b[field];
    if (value == null) return null;
    if (typeof value !== "string" || value.length > maxLength) fail(`${field} is invalid or too large. Re-upload the original image.`);
    // Maps loaded from the API carry the served image endpoint rather than the
    // base64 payload, so both forms are valid input.
    if (/^\/api\/maps\/\d+\/image(?:\?kind=(?:working|source))?$/.test(value as string)) return null;
    if (!new RegExp(`^data:image/(?:${types});base64,[a-zA-Z0-9+/=]+$`).test(value as string)) fail(`${field} is invalid or too large. Re-upload the original image.`);
    return value as string;
  };
  // `null` here means "keep whatever the server already stores".
  const imageUrl = dataImage("imageUrl", 6_000_000, "webp|png|jpeg"), sourceImage = dataImage("sourceImage", 16_900_000, "png|jpeg|webp|gif|tiff|avif|heif");
  const analysis = b.analysis as SavedAnalysis | null | undefined;
  if (analysis) {
    if (analysis.version !== 2 || !analysis.options || !Array.isArray(analysis.labels) || analysis.labels.length > 1000 || !Array.isArray(analysis.candidates) || analysis.candidates.length > 100 || typeof analysis.reviewed !== "boolean") fail("Invalid analysis metadata.");
    try { validateConversionOptions({ ...analysis.options, excludedRegions: analysis.options.excludedRegions ?? [] }); } catch { fail("Invalid image-conversion settings."); }
    if (!Array.isArray(analysis.objects ?? []) || (analysis.objects?.length ?? 0) > 3000 || !Array.isArray(analysis.legendRegions ?? []) || (analysis.legendRegions?.length ?? 0) > 30 || !Array.isArray(analysis.validation ?? [])) fail("Invalid analysis objects or validation summary.");
    if (analysis.options.cols !== width || analysis.options.rows !== height) fail("The grid size does not match the reviewed conversion. Apply settings again.");
  }
  return { title, description: typeof b.description === "string" ? b.description.slice(0, 4000) : "", imageUrl, sourceImage, gridWidth: width, gridHeight: height, gridData, starts, exits, obstacles, analysis: analysis ?? null };
}
export function requestHeaders(json = true): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return { ...(json ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
