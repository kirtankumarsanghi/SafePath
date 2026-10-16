import { NextRequest, NextResponse } from "next/server";
import { db, ensureDatabaseReady, isDatabaseConfigured } from "@/db";
import { runs, floorMaps } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { MapInputError, parseMapInput, inspectDocument } from "@/lib/map-model";
import { runEvacuation, type HeuristicType } from "@/lib/astar";
import { runRecord } from "@/lib/run-storage";
import { verifyToken } from "@/lib/auth";
import { SAMPLE_RUNS } from "@/lib/sample-data";

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
    if (!isDatabaseConfigured) {
      return NextResponse.json(
        { error: "PostgreSQL database is not configured. Please set DATABASE_URL in Vercel Project Settings to persist runs." },
        { status: 503 }
      );
    }
    await ensureDatabaseReady();
    const body = await req.json();
    const mapId = body.mapId === null || body.mapId === undefined ? null : Number(body.mapId);
    if (mapId !== null && (!Number.isInteger(mapId) || mapId <= 0 || mapId > 2147483647)) throw new MapInputError("Invalid map ID.");
    const [map] = mapId ? await db.select().from(floorMaps).where(eq(floorMaps.id, mapId)) : [];
    if (mapId && !map) return NextResponse.json({ error: "This map no longer exists. Save a new map first." }, { status: 404 });
    const input = parseMapInput({ ...(body.document ?? map), title: body.title || map?.title || "Evacuation run" });
    if (!input.starts.length || !input.exits.length) return NextResponse.json({ error: "A run needs at least one person and one exit." }, { status: 422 });
    const heuristic: HeuristicType = body.heuristic ?? "manhattan";
    if (!["manhattan", "euclidean", "chebyshev"].includes(heuristic)) throw new MapInputError("Choose a supported heuristic.");
    const diagonal = body.config?.allowDiagonal === true;
    const results = runEvacuation(input.gridData, input.gridWidth, input.gridHeight, input.starts, input.exits, input.obstacles, heuristic, { allowDiagonal: diagonal, trace: false });
    const token = req.headers.get("authorization")?.replace(/^Bearer /i, "");
    const userId = token ? verifyToken(token)?.userId ?? null : null;
    const [run] = await db.insert(runs).values(runRecord(mapId, userId, input.title, input, results, heuristic, diagonal)).returning();
    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    if (error instanceof MapInputError || error instanceof SyntaxError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error(error); return NextResponse.json({ error: "The run could not be saved. Please try again." }, { status: 500 });
  }
}
