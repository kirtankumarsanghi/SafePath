import { db } from "@/db";
import { users, floorMaps, runs } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import type { CellType, Point } from "./astar";

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

/** Draws a rectangular room with walls and a single doorway. */
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

/* ------------------------------------------------------------------ */
/* 1. University Lecture Hall                                         */
/* ------------------------------------------------------------------ */
function lectureHall(): { grid: Grid; cols: number; rows: number } {
  const cols = 30;
  const rows = 22;
  const g = blankGrid(cols, rows);

  room(g, 3, 3, 10, 8, { x: 6, y: 9 });   // Lecture theatre A
  room(g, 14, 3, 21, 8, { x: 17, y: 9 }); // Lecture theatre B
  room(g, 24, 2, 27, 8, { x: 25, y: 9 }); // Stairwell

  openRect(g, 2, 10, 27, 10);              // corridor threshold
  openRect(g, 2, 11, 27, 16);              // main corridor
  fillRect(g, 12, 3, 12, 8, "wall");       // divider between theatres
  fillRect(g, 22, 3, 22, 8, "wall");       // divider before stairwell
  fillRect(g, 2, 17, 27, 17, "wall");      // corridor south wall
  openRect(g, 6, 17, 6, 17);               // south door
  openRect(g, 17, 17, 17, 17);             // south door
  openRect(g, 25, 17, 25, 17);             // south door

  // furniture inside theatres
  fillRect(g, 4, 5, 9, 5, "wall");
  fillRect(g, 15, 5, 20, 5, "wall");

  g["3,13"] = "exit";
  g["25,5"] = "exit";
  g["27,13"] = "exit";
  return { grid: g, cols, rows };
}

/* ------------------------------------------------------------------ */
/* 2. Office Building Level 3                                         */
/* ------------------------------------------------------------------ */
function officeLevel3(): { grid: Grid; cols: number; rows: number } {
  const cols = 32;
  const rows = 24;
  const g = blankGrid(cols, rows);

  // cubicle farm (open plan with partitions)
  openRect(g, 3, 3, 19, 12);
  for (let y = 5; y <= 11; y += 3) fillRect(g, 5, y, 17, y, "wall");
  fillRect(g, 10, 3, 10, 4, "wall");
  fillRect(g, 10, 7, 10, 10, "wall");

  // meeting rooms
  room(g, 22, 3, 27, 8, { x: 24, y: 9 });
  room(g, 22, 11, 27, 15, { x: 24, y: 10 });

  // elevator + service shaft (solid block, impassable)
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

/* ------------------------------------------------------------------ */
/* 3. Hospital Wing                                                   */
/* ------------------------------------------------------------------ */
function hospitalWing(): { grid: Grid; cols: number; rows: number } {
  const cols = 34;
  const rows = 26;
  const g = blankGrid(cols, rows);

  room(g, 3, 3, 8, 8, { x: 5, y: 9 });
  room(g, 11, 3, 16, 8, { x: 13, y: 9 });
  room(g, 19, 3, 24, 8, { x: 21, y: 9 });
  room(g, 27, 3, 31, 8, { x: 29, y: 9 });

  openRect(g, 3, 10, 10, 13);   // nurse station
  fillRect(g, 11, 10, 31, 10, "wall");
  openRect(g, 13, 10, 13, 10);
  openRect(g, 21, 10, 21, 10);
  openRect(g, 29, 10, 29, 10);

  openRect(g, 2, 14, 31, 20);   // wide corridor
  fillRect(g, 2, 21, 31, 21, "wall");
  openRect(g, 3, 21, 3, 21);
  openRect(g, 16, 21, 16, 21);
  openRect(g, 31, 21, 31, 21);

  g["3,17"] = "exit";
  g["31,17"] = "exit";
  g["20,12"] = "exit";
  return { grid: g, cols, rows };
}

async function seed() {
  console.log("Seeding SafePath demo data…");

  await db.delete(runs);
  await db.delete(floorMaps);

  const passwordHash = await hashPassword("demo123");
  const [demoUser] = await db
    .insert(users)
    .values({ email: "demo@university.edu", passwordHash, name: "Demo Student" })
    .onConflictDoNothing()
    .returning();
  const userId = demoUser?.id ?? 1;

  const lecture = lectureHall();
  const office = officeLevel3();
  const hospital = hospitalWing();

  const maps = [
    {
      userId,
      title: "University Lecture Hall Floor",
      description: "Two lecture theatres, a central corridor, stairwell and three exits.",
      gridWidth: lecture.cols,
      gridHeight: lecture.rows,
      gridData: lecture.grid,
      exits: [
        { x: 3, y: 13 },
        { x: 25, y: 5 },
        { x: 27, y: 13 },
      ],
      starts: [
        { x: 6, y: 6 },
        { x: 17, y: 6 },
      ],
      obstacles: [{ x: 17, y: 11 }],
      isPublic: true,
    },
    {
      userId,
      title: "Office Building Level 3",
      description: "Open-plan cubicles, two meeting rooms, an elevator shaft and a fire escape.",
      gridWidth: office.cols,
      gridHeight: office.rows,
      gridData: office.grid,
      exits: [
        { x: 3, y: 16 },
        { x: 29, y: 16 },
        { x: 24, y: 5 },
      ],
      starts: [
        { x: 8, y: 8 },
        { x: 14, y: 11 },
      ],
      obstacles: [{ x: 24, y: 15 }],
      isPublic: true,
    },
    {
      userId,
      title: "Hospital Wing",
      description: "Four patient rooms, a nurse station, wide corridors and an emergency exit.",
      gridWidth: hospital.cols,
      gridHeight: hospital.rows,
      gridData: hospital.grid,
      exits: [
        { x: 3, y: 17 },
        { x: 31, y: 17 },
        { x: 20, y: 12 },
      ],
      starts: [
        { x: 5, y: 6 },
        { x: 13, y: 6 },
        { x: 29, y: 6 },
      ],
      obstacles: [{ x: 16, y: 17 }],
      isPublic: true,
    },
  ];

  for (const m of maps) {
    const [map] = await db.insert(floorMaps).values(m as any).returning();
    if (!map) continue;

    // Pre-compute the A* route so history is populated on first visit.
    const { runEvacuation } = await import("./astar");
    const results = runEvacuation(
      m.gridData as Grid,
      m.gridWidth,
      m.gridHeight,
      m.starts,
      m.exits,
      m.obstacles,
      "manhattan"
    );
    const best = results.sort((a, b) => a.stats.totalCost - b.stats.totalCost)[0];

    for (const [i, r] of results.entries()) {
      await db.insert(runs).values({
        userId,
        mapId: map.id,
        title: `${m.title} — Person ${i + 1}`,
        heuristic: r.stats.heuristicUsed,
        startPoints: [r.start],
        exitPoints: [r.exit],
        obstaclePoints: m.obstacles,
        pathResult: {
          path: r.path,
          explored: r.steps.map((s) => s.popped).filter(Boolean),
          fValues: r.fMap,
        },
        totalPathCost: Number.isFinite(r.stats.totalCost) ? r.stats.totalCost : null,
        nodesExplored: r.stats.nodesExplored,
        nodesInOpen: r.stats.nodesInOpen,
        nodesInClosed: r.stats.nodesInClosed,
        timeTakenMs: Math.round(r.stats.timeTakenMs),
        config: { multiStart: true, allowDiagonal: false },
      });
    }

    if (best) {
      console.log(`  ${m.title}: best route cost ${best.stats.totalCost}, ${best.stats.nodesExplored} nodes`);
    }
  }

  console.log("Seed complete.");
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
