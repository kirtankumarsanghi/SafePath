import { runEvacuation, type AStarRunResult, type CellType, type NodeValues, type Point } from "./astar";
import type { SavedAnalysis } from "./map-analysis";

type Grid = Record<string, CellType>;

function blankGrid(cols: number, rows: number): Grid {
  const g: Grid = {};
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      g[`${x},${y}`] = y === 0 || y === rows - 1 || x === 0 || x === cols - 1 ? "wall" : "empty";
    }
  }
  return g;
}

function room(g: Grid, x0: number, y0: number, x1: number, y1: number, door: Point) {
  for (let x = x0 - 1; x <= x1 + 1; x++) {
    g[`${x},${y0 - 1}`] = "wall";
    g[`${x},${y1 + 1}`] = "wall";
  }
  for (let y = y0 - 1; y <= y1 + 1; y++) {
    g[`${x0 - 1},${y}`] = "wall";
    g[`${x1 + 1},${y}`] = "wall";
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[`${x},${y}`] = "empty";
  g[`${door.x},${door.y}`] = "empty";
}

function fillRect(g: Grid, x0: number, y0: number, x1: number, y1: number, type: CellType) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[`${x},${y}`] = type;
}

function openRect(g: Grid, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[`${x},${y}`] = "empty";
}

export function lectureHall(): { grid: Grid; cols: number; rows: number } {
  const cols = 30;
  const rows = 22;
  const g = blankGrid(cols, rows);

  room(g, 3, 3, 10, 8, { x: 6, y: 9 });
  room(g, 14, 3, 21, 8, { x: 17, y: 9 });
  room(g, 24, 2, 27, 8, { x: 25, y: 9 });

  openRect(g, 2, 10, 27, 10);
  openRect(g, 2, 11, 27, 16);
  fillRect(g, 12, 3, 12, 8, "wall");
  fillRect(g, 22, 3, 22, 8, "wall");
  fillRect(g, 2, 17, 27, 17, "wall");
  openRect(g, 6, 17, 6, 17);
  openRect(g, 17, 17, 17, 17);
  openRect(g, 25, 17, 25, 17);

  fillRect(g, 4, 5, 9, 5, "wall");
  fillRect(g, 15, 5, 20, 5, "wall");

  g["3,13"] = "exit";
  g["25,5"] = "exit";
  g["27,13"] = "exit";
  return { grid: g, cols, rows };
}

export function officeLevel3(): { grid: Grid; cols: number; rows: number } {
  const cols = 32;
  const rows = 24;
  const g = blankGrid(cols, rows);

  openRect(g, 3, 3, 19, 12);
  for (let y = 5; y <= 11; y += 3) fillRect(g, 5, y, 17, y, "wall");
  fillRect(g, 10, 3, 10, 4, "wall");
  fillRect(g, 10, 7, 10, 10, "wall");

  room(g, 22, 3, 27, 8, { x: 24, y: 9 });
  room(g, 22, 11, 27, 15, { x: 24, y: 10 });

  fillRect(g, 21, 3, 21, 15, "wall");
  fillRect(g, 2, 13, 19, 13, "wall");
  openRect(g, 2, 14, 29, 14);
  openRect(g, 2, 15, 29, 18);
  openRect(g, 8, 13, 8, 13);
  openRect(g, 24, 13, 24, 13);
  openRect(g, 2, 19, 29, 19);

  g["3,16"] = "exit";
  g["29,16"] = "exit";
  g["24,5"] = "exit";
  return { grid: g, cols, rows };
}

export function hospitalWing(): { grid: Grid; cols: number; rows: number } {
  const cols = 34;
  const rows = 26;
  const g = blankGrid(cols, rows);

  room(g, 3, 3, 8, 8, { x: 5, y: 9 });
  room(g, 11, 3, 16, 8, { x: 13, y: 9 });
  room(g, 19, 3, 24, 8, { x: 21, y: 9 });
  room(g, 27, 3, 31, 8, { x: 29, y: 9 });

  openRect(g, 3, 10, 10, 13);
  fillRect(g, 11, 10, 31, 10, "wall");
  openRect(g, 13, 10, 13, 10);
  openRect(g, 21, 10, 21, 10);
  openRect(g, 29, 10, 29, 10);

  openRect(g, 2, 14, 31, 20);
  fillRect(g, 2, 21, 31, 21, "wall");
  openRect(g, 3, 21, 3, 21);
  openRect(g, 16, 21, 16, 21);
  openRect(g, 31, 21, 31, 21);

  g["3,17"] = "exit";
  g["31,17"] = "exit";
  g["20,12"] = "exit";
  return { grid: g, cols, rows };
}

export interface SampleMapRecord {
  id: number;
  userId: number;
  title: string;
  description: string;
  gridWidth: number;
  gridHeight: number;
  gridData: Grid;
  exits: Point[];
  starts: Point[];
  obstacles: Point[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  imageUrl: string | null;
  sourceImage: string | null;
  hasImage?: boolean;
  hasSource?: boolean;
  analysis?: Partial<SavedAnalysis> | null;
}

export interface SampleRunPathResult {
  path?: Point[];
  explored?: Point[];
  fValues?: Record<string, NodeValues>;
  people?: AStarRunResult[];
  allReached?: boolean;
}

export interface SampleRunRecord {
  id: number;
  userId: number;
  mapId: number | null;
  title: string;
  heuristic: string;
  startPoints: Point[];
  exitPoints: Point[];
  obstaclePoints: Point[];
  pathResult: SampleRunPathResult | AStarRunResult[];
  totalPathCost: number | null;
  nodesExplored: number;
  nodesInOpen: number;
  nodesInClosed: number;
  timeTakenMs: number;
  config: Record<string, unknown>;
  createdAt: string;
}

const lecture = lectureHall();
const office = officeLevel3();
const hospital = hospitalWing();

const baseDate = new Date("2026-10-15T10:00:00Z").toISOString();

export const SAMPLE_MAPS: SampleMapRecord[] = [
  {
    id: 1,
    userId: 1,
    title: "University Lecture Hall Floor",
    description: "Two lecture theatres, a central corridor, stairwell and three exits.",
    gridWidth: lecture.cols,
    gridHeight: lecture.rows,
    gridData: lecture.grid,
    exits: [{ x: 3, y: 13 }, { x: 25, y: 5 }, { x: 27, y: 13 }],
    starts: [{ x: 6, y: 6 }, { x: 17, y: 6 }],
    obstacles: [{ x: 17, y: 11 }],
    isPublic: true,
    createdAt: baseDate,
    updatedAt: baseDate,
    imageUrl: null,
    sourceImage: null,
    hasImage: false,
    hasSource: false,
    analysis: { reviewed: true },
  },
  {
    id: 2,
    userId: 1,
    title: "Office Building Level 3",
    description: "Open-plan cubicles, two meeting rooms, an elevator shaft and a fire escape.",
    gridWidth: office.cols,
    gridHeight: office.rows,
    gridData: office.grid,
    exits: [{ x: 3, y: 16 }, { x: 29, y: 16 }, { x: 24, y: 5 }],
    starts: [{ x: 8, y: 7 }, { x: 14, y: 10 }],
    obstacles: [{ x: 24, y: 15 }],
    isPublic: true,
    createdAt: baseDate,
    updatedAt: baseDate,
    imageUrl: null,
    sourceImage: null,
    hasImage: false,
    hasSource: false,
    analysis: { reviewed: true },
  },
  {
    id: 3,
    userId: 1,
    title: "Hospital Wing",
    description: "Patient wards, central nursing station, triage bay and dual isolation exits.",
    gridWidth: hospital.cols,
    gridHeight: hospital.rows,
    gridData: hospital.grid,
    exits: [{ x: 3, y: 17 }, { x: 31, y: 17 }, { x: 20, y: 12 }],
    starts: [{ x: 5, y: 6 }, { x: 13, y: 6 }, { x: 29, y: 6 }],
    obstacles: [{ x: 16, y: 17 }],
    isPublic: true,
    createdAt: baseDate,
    updatedAt: baseDate,
    imageUrl: null,
    sourceImage: null,
    hasImage: false,
    hasSource: false,
    analysis: { reviewed: true },
  },
];

export function generateSampleRuns(): SampleRunRecord[] {
  const generatedRuns: SampleRunRecord[] = [];
  let runId = 1;

  for (const map of SAMPLE_MAPS) {
    const results = runEvacuation(
      map.gridData,
      map.gridWidth,
      map.gridHeight,
      map.starts,
      map.exits,
      map.obstacles,
      "manhattan"
    );

    for (const [i, r] of results.entries()) {
      generatedRuns.push({
        id: runId++,
        userId: 1,
        mapId: map.id,
        title: `${map.title} — Person ${i + 1}`,
        heuristic: r.stats.heuristicUsed,
        startPoints: [r.start],
        exitPoints: [r.exit],
        obstaclePoints: map.obstacles,
        pathResult: {
          path: r.path,
          explored: r.steps.map((s) => s.popped).filter(Boolean),
          fValues: r.fMap,
        },
        totalPathCost: Number.isFinite(r.stats.totalCost) ? r.stats.totalCost : null,
        nodesExplored: r.stats.nodesExplored,
        nodesInOpen: r.stats.nodesInOpen,
        nodesInClosed: r.stats.nodesInClosed,
        timeTakenMs: Math.max(1, Math.round(r.stats.timeTakenMs)),
        config: { multiStart: true, allowDiagonal: false },
        createdAt: baseDate,
      });
    }
  }

  return generatedRuns;
}

export const SAMPLE_RUNS = generateSampleRuns();
