import type { Point } from "./astar";
export interface MapSummary {
  id: number; title: string; description: string | null; gridWidth: number; gridHeight: number;
  starts: Point[]; exits: Point[]; obstacles: Point[];
  imageUrl: string | null; updatedAt: string; createdAt?: string;
}
export interface RunSummary {
  id: number; title: string; mapId: number | null; heuristic: string;
  totalPathCost: number | null; nodesExplored: number | null; timeTakenMs: number | null;
  createdAt: string;
  pathResult?: { version?: number; allReached?: boolean; people?: { reached: boolean }[] };
}
export async function getJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({ error: "The server returned an unreadable response. Please try again." }));
  if (!response.ok) throw new Error(data.error || "The request could not be completed.");
  return data as T;
}
export function mapPreview(map: MapSummary) {
  return map.imageUrl || `/api/maps/${map.id}/preview?v=${encodeURIComponent(map.updatedAt ?? "")}`;
}
export function shortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}
