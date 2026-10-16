import { NextRequest, NextResponse } from "next/server";
import { db, ensureDatabaseReady, isDatabaseConfigured } from "@/db";
import { runs, floorMaps } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { MapInputError, parseMapInput, inspectDocument } from "@/lib/map-model";
import { runEvacuation, type HeuristicType } from "@/lib/astar";
import { runRecord } from "@/lib/run-storage";
import { verifyToken } from "@/lib/auth";
import { SAMPLE_RUNS, SAMPLE_MAPS } from "@/lib/sample-data";

export async function GET() {
  try {
    if (isDatabaseConfigured) {
      await ensureDatabaseReady();
      const dbRuns = await db.select().from(runs).orderBy(desc(runs.createdAt)).limit(50);
      if (dbRuns.length > 0) {
        return NextResponse.json({ runs: dbRuns });
      }
    }
  } catch (error) {
    console.warn("Runs query failed, using sample runs fallback:", error);
  }

  return NextResponse.json({ runs: SAMPLE_RUNS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mapId = body.mapId === null || body.mapId === undefined ? null : Number(body.mapId);
    if (mapId !== null && (!Number.isInteger(mapId) || mapId <= 0 || mapId > 2147483647)) throw new MapInputError("Invalid map ID.");

    let map = null;
    if (mapId) {
      if (isDatabaseConfigured) {
        await ensureDatabaseReady();
        const [dbMap] = await db.select().from(floorMaps).where(eq(floorMaps.id, mapId));
        map = dbMap;
      }
      if (!map) {
        map = SAMPLE_MAPS.find(m => m.id === mapId) ?? null;
      }
      if (!map) return NextResponse.json({ error: "This map no longer exists. Save a new map first." }, { status: 404 });
    }

    const input = parseMapInput({ ...(body.document ?? map), title: body.title || map?.title || "Evacuation run" });
    if (!input.starts.length || !input.exits.length) return NextResponse.json({ error: "A run needs at least one person and one exit." }, { status: 422 });
    const heuristic: HeuristicType = body.heuristic ?? "manhattan";
    if (!["manhattan", "euclidean", "chebyshev"].includes(heuristic)) throw new MapInputError("Choose a supported heuristic.");
    const diagonal = body.config?.allowDiagonal === true;
    const results = runEvacuation(input.gridData, input.gridWidth, input.gridHeight, input.starts, input.exits, input.obstacles, heuristic, { allowDiagonal: diagonal, trace: false });
    const token = req.headers.get("authorization")?.replace(/^Bearer /i, "");
    const userId = token ? verifyToken(token)?.userId ?? null : null;

    if (!isDatabaseConfigured) {
      const nextRunId = Math.max(...SAMPLE_RUNS.map(r => r.id), 10) + 1;
      const demoRun: any = {
        id: nextRunId,
        userId: userId ?? 1,
        mapId,
        title: input.title,
        heuristic,
        startPoints: input.starts,
        exitPoints: input.exits,
        obstaclePoints: input.obstacles,
        pathResult: results,
        totalPathCost: results[0]?.stats.totalCost ?? null,
        nodesExplored: results[0]?.stats.nodesExplored ?? 0,
        nodesInOpen: results[0]?.stats.nodesInOpen ?? 0,
        nodesInClosed: results[0]?.stats.nodesInClosed ?? 0,
        timeTakenMs: Math.round(results[0]?.stats.timeTakenMs ?? 0),
        config: { allowDiagonal: diagonal },
        createdAt: new Date().toISOString(),
      };
      SAMPLE_RUNS.unshift(demoRun);
      return NextResponse.json({ run: demoRun }, { status: 201 });
    }

    await ensureDatabaseReady();
    const [run] = await db.insert(runs).values(runRecord(mapId, userId, input.title, input, results, heuristic, diagonal)).returning();
    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    if (error instanceof MapInputError || error instanceof SyntaxError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error(error); return NextResponse.json({ error: "The run could not be saved. Please try again." }, { status: 500 });
  }
}
