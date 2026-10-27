import { NextRequest, NextResponse } from "next/server";
import { db, ensureDatabaseReady, isDatabaseConfigured } from "@/db";
import { runs, floorMaps } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { MapInputError, parseMapInput } from "@/lib/map-model";
import { runEvacuation, type HeuristicType } from "@/lib/astar";
import { runRecord } from "@/lib/run-storage";
import { getRequestUser } from "@/lib/auth";
import { SAMPLE_RUNS, SAMPLE_MAPS, type SampleRunRecord } from "@/lib/sample-data";
import { parsePagination } from "@/lib/api-validation";
import { reportServerError } from "@/lib/monitoring";

export async function GET(req: NextRequest) {
  const { limit, offset, mine } = parsePagination(req.nextUrl.searchParams, 50, 100);
  const session = getRequestUser(req);

  try {
    if (isDatabaseConfigured) {
      await ensureDatabaseReady();
      const baseQuery = db.select().from(runs);
      const dbRuns = await (mine && session
        ? baseQuery.where(eq(runs.userId, session.userId))
        : baseQuery
      )
        .orderBy(desc(runs.createdAt))
        .limit(limit)
        .offset(offset);

      if (dbRuns.length > 0 || (mine && session)) {
        return NextResponse.json({ runs: dbRuns, pagination: { limit, offset, count: dbRuns.length } });
      }
    }
  } catch (error) {
    console.warn("Runs query failed, using sample runs fallback:", error);
  }

  const sliced = SAMPLE_RUNS.slice(offset, offset + limit);
  return NextResponse.json({ runs: sliced, pagination: { limit, offset, count: sliced.length } });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mapId = body.mapId === null || body.mapId === undefined ? null : Number(body.mapId);
    if (mapId !== null && (!Number.isInteger(mapId) || mapId <= 0)) throw new MapInputError("Invalid map ID.");

    let map = null;
    let validMapId: number | null = mapId;
    if (mapId) {
      if (isDatabaseConfigured) {
        try {
          await ensureDatabaseReady();
          const [dbMap] = await db.select().from(floorMaps).where(eq(floorMaps.id, mapId));
          map = dbMap;
        } catch {
          map = null;
        }
      }
      if (!map) {
        map = SAMPLE_MAPS.find(m => m.id === mapId) ?? null;
      }
      if (!map) {
        validMapId = null;
        if (!body.document) {
          return NextResponse.json({ error: "This map no longer exists. Save a new map first.", code: "NOT_FOUND" }, { status: 404 });
        }
      }
    }

    const input = parseMapInput({ ...(body.document ?? map), title: body.title || map?.title || "Evacuation run" });
    if (!input.starts.length || !input.exits.length) {
      return NextResponse.json({ error: "A run needs at least one person and one exit.", code: "VALIDATION_FAILED" }, { status: 422 });
    }
    const heuristic: HeuristicType = body.heuristic ?? "manhattan";
    if (!["manhattan", "euclidean", "chebyshev"].includes(heuristic)) throw new MapInputError("Choose a supported heuristic.");
    const diagonal = body.config?.allowDiagonal === true;
    const congestionPenalty = typeof body.config?.congestionPenalty === "number" ? body.config.congestionPenalty : 0;
    const exitCapacity = typeof body.config?.exitCapacity === "number" && body.config.exitCapacity > 0 ? body.config.exitCapacity : undefined;
    const fireBufferPenalty = typeof body.config?.fireBufferPenalty === "number" ? body.config.fireBufferPenalty : 0;

    const results = runEvacuation(
      input.gridData,
      input.gridWidth,
      input.gridHeight,
      input.starts,
      input.exits,
      input.obstacles,
      heuristic,
      {
        allowDiagonal: diagonal,
        congestionPenalty,
        exitCapacity,
        fireBufferPenalty,
        includeSecondBestExit: true,
        trace: false,
      }
    );
    const userId = getRequestUser(req)?.userId ?? null;

    if (!isDatabaseConfigured) {
      const nextRunId = Math.max(...SAMPLE_RUNS.map(r => r.id), 10) + 1;
      const demoRun: SampleRunRecord = {
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
        config: { allowDiagonal: diagonal, congestionPenalty, exitCapacity, fireBufferPenalty },
        createdAt: new Date().toISOString(),
      };
      SAMPLE_RUNS.unshift(demoRun);
      return NextResponse.json({ run: demoRun }, { status: 201 });
    }

    await ensureDatabaseReady();
    const [run] = await db.insert(runs).values(runRecord(validMapId, userId, input.title, input, results, heuristic, diagonal)).returning();
    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    if (error instanceof MapInputError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error.message, code: "BAD_REQUEST" }, { status: 400 });
    }
    reportServerError("/api/runs", error);
    return NextResponse.json({ error: "The run could not be saved. Please try again.", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
