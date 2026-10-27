import type { SavedMap, GridDocument } from "./map-model";
import type { MapSummary } from "./workspace-client";
import { isBlocked, type Point } from "./astar";

const STORAGE_KEY = "safepath_custom_floorplans_v1";

export interface StoredCustomMap extends SavedMap {
  savedAt: string;
}

function safeGetStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getCustomMaps(): StoredCustomMap[] {
  const storage = safeGetStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("[SafePath] Failed to read custom maps from localStorage:", e);
    return [];
  }
}

export function getCustomMapById(id: number | string): StoredCustomMap | null {
  const maps = getCustomMaps();
  return maps.find(m => m.id === Number(id) || String(m.id) === String(id)) ?? null;
}

export function saveCustomMap(map: SavedMap): StoredCustomMap {
  const storage = safeGetStorage();
  const maps = getCustomMaps();
  const index = maps.findIndex(m => m.id === map.id || String(m.id) === String(map.id));

  const entry: StoredCustomMap = {
    ...map,
    savedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let nextMaps: StoredCustomMap[];
  if (index >= 0) {
    nextMaps = [...maps];
    nextMaps[index] = entry;
  } else {
    nextMaps = [entry, ...maps];
  }

  // Keep up to 25 custom floor plans in local client storage
  if (nextMaps.length > 25) {
    nextMaps = nextMaps.slice(0, 25);
  }

  if (storage) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(nextMaps));
    } catch (e) {
      console.warn("[SafePath] localStorage quota reached; saving without full image cache:", e);
      try {
        // Fallback: save without the raw base64 data to save quota
        const lightMaps = nextMaps.map(m => ({ ...m, imageUrl: null, sourceImage: null }));
        storage.setItem(STORAGE_KEY, JSON.stringify(lightMaps));
      } catch {}
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("safepath-maps-updated"));
  }

  return entry;
}

export function deleteCustomMap(id: number | string): void {
  const storage = safeGetStorage();
  const maps = getCustomMaps().filter(m => m.id !== Number(id) && String(m.id) !== String(id));
  if (storage) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(maps));
    } catch {}
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("safepath-maps-updated"));
  }
}

export function toMapSummary(m: StoredCustomMap): MapSummary {
  return {
    id: m.id,
    title: m.title,
    description: m.description,
    gridWidth: m.gridWidth,
    gridHeight: m.gridHeight,
    starts: m.starts,
    exits: m.exits,
    obstacles: m.obstacles,
    imageUrl: m.imageUrl ?? null,
    updatedAt: m.updatedAt || m.savedAt,
    createdAt: m.savedAt,
  };
}

/**
 * Filters starts/exits to walkable cells. By default it also adds a fallback
 * start and exit so a newly loaded map can run immediately; pass
 * `{ addDefaults: false }` while editing an analyzed plan so no phantom
 * people or exits are created.
 */
export function ensureValidCoordinates(doc: GridDocument, options: { addDefaults?: boolean } = {}): { doc: GridDocument; addedDefault: boolean } {
  let { starts, exits, gridData, gridWidth, gridHeight, obstacles } = doc;
  const addDefaults = options.addDefaults ?? true;
  let added = false;

  const blockedObstacles = new Set((obstacles ?? []).map(p => `${p.x},${p.y}`));
  const isFree = (x: number, y: number) => {
    const k = `${x},${y}`;
    return x >= 0 && y >= 0 && x < gridWidth && y < gridHeight &&
      !isBlocked(gridData?.[k]) && !blockedObstacles.has(k);
  };

  // Only keep starts and exits that are currently on free, walkable cells
  let nextExits = (Array.isArray(exits) ? exits : []).filter(p => isFree(p.x, p.y));
  let nextStarts = (Array.isArray(starts) ? starts : []).filter(p => isFree(p.x, p.y));

  // Find all free walkable coordinates
  const freeCells: Point[] = [];
  for (let y = 1; y < gridHeight - 1; y++) {
    for (let x = 1; x < gridWidth - 1; x++) {
      if (isFree(x, y)) freeCells.push({ x, y });
    }
  }

  if (freeCells.length === 0) {
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        if (isFree(x, y)) freeCells.push({ x, y });
      }
    }
  }

  if (addDefaults && nextExits.length === 0 && freeCells.length > 0) {
    const perimeterExit = freeCells.find(p => p.x <= 2 || p.x >= gridWidth - 3 || p.y <= 2 || p.y >= gridHeight - 3) || freeCells[freeCells.length - 1];
    nextExits.push(perimeterExit);
    added = true;
  }

  if (addDefaults && nextStarts.length === 0 && freeCells.length > 0) {
    const exitKey = nextExits[0] ? `${nextExits[0].x},${nextExits[0].y}` : "";
    const startCandidate = freeCells.find(p => `${p.x},${p.y}` !== exitKey) || freeCells[0];
    if (startCandidate) {
      nextStarts.push(startCandidate);
      added = true;
    }
  }

  return {
    doc: {
      ...doc,
      starts: nextStarts,
      exits: nextExits,
    },
    addedDefault: added,
  };
}
