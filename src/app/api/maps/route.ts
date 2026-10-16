import { NextRequest, NextResponse } from "next/server";
import { db, ensureDatabaseReady, isDatabaseConfigured } from "@/db";
import { floorMaps, runs } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import { MapInputError, inspectDocument, parseMapInput } from "@/lib/map-model";
import { runEvacuation } from "@/lib/astar";
import { runRecord } from "@/lib/run-storage";
import { verifyToken } from "@/lib/auth";
import { SAMPLE_MAPS } from "@/lib/sample-data";

function publicMap(map: typeof floorMaps.$inferSelect) {
  return { ...map, imageUrl: map.imageUrl ? `/api/maps/${map.id}/image?kind=working` : null, sourceImage: map.sourceImage ? `/api/maps/${map.id}/image?kind=source` : null };
}

export async function GET() {
  try {
    if (isDatabaseConfigured) {
      await ensureDatabaseReady();
      const maps = await db.select({ id: floorMaps.id, title: floorMaps.title, description: floorMaps.description, gridWidth: floorMaps.gridWidth, gridHeight: floorMaps.gridHeight, exits: floorMaps.exits, starts: floorMaps.starts, obstacles: floorMaps.obstacles, updatedAt: floorMaps.updatedAt, createdAt: floorMaps.createdAt, hasImage: sql<boolean>`${floorMaps.imageUrl} is not null`, hasSource: sql<boolean>`${floorMaps.sourceImage} is not null` }).from(floorMaps).orderBy(desc(floorMaps.updatedAt)).limit(100);
      if (maps.length > 0) {
        return NextResponse.json({ maps: maps.map(m => ({ ...m, imageUrl: m.hasImage ? `/api/maps/${m.id}/image?kind=working` : null, sourceImage: m.hasSource ? `/api/maps/${m.id}/image?kind=source` : null })) });
      }
    }
  } catch (error) {
    console.warn("List maps failed, using sample plans fallback:", error);
  }

  return NextResponse.json({
    maps: SAMPLE_MAPS.map(m => ({
      id: m.id,
      title: m.title,
      description: m.description,
      gridWidth: m.gridWidth,
      gridHeight: m.gridHeight,
      exits: m.exits,
      starts: m.starts,
      obstacles: m.obstacles,
      updatedAt: m.updatedAt,
      createdAt: m.createdAt,
      imageUrl: `/api/maps/${m.id}/preview?v=${encodeURIComponent(m.updatedAt)}`,
      sourceImage: null,
      analysis: m.analysis,
    })),
  });
}

export async function POST(req: NextRequest) {
  try {
    if (Number(req.headers.get("content-length") ?? 0) > 23_000_000) return NextResponse.json({ error: "The reviewed map and original image exceed the 23 MB storage limit. Use a smaller source image." }, { status: 413 });
    const body = await req.json();
    const input = parseMapInput(body);
    const token = req.headers.get("authorization")?.replace(/^Bearer /i, "");
    const userId = token ? verifyToken(token)?.userId ?? null : null;
    let results = null;
    if (body.runAStar) {
      const review = inspectDocument(input);
      if (review.errors.length) return NextResponse.json({ error: review.errors.join(" ") }, { status: 422 });
      if (input.imageUrl && !input.analysis?.reviewed) return NextResponse.json({ error: "Review and confirm the source image, doors and exit positions before running A*." }, { status: 422 });
      results = runEvacuation(input.gridData, input.gridWidth, input.gridHeight, input.starts, input.exits, input.obstacles, "manhattan", { trace: false });
      const unreachable = results.map((r, i) => r.reached ? null : `Person ${i + 1}: ${r.reason ?? "no route"}`).filter(Boolean);
      if (unreachable.length) return NextResponse.json({ error: `No valid route for every person; map was not saved as a successful run. ${unreachable.join(" ")}`, results }, { status: 422 });
    }

    if (!isDatabaseConfigured) {
      const nextId = Math.max(...SAMPLE_MAPS.map(m => m.id), 3) + 1;
      const demoMap: any = {
        id: nextId,
        userId: userId ?? 1,
        title: input.title,
        description: input.description ?? "",
        gridWidth: input.gridWidth,
        gridHeight: input.gridHeight,
        gridData: input.gridData,
        exits: input.exits,
        starts: input.starts,
        obstacles: input.obstacles,
        imageUrl: input.imageUrl ?? null,
        sourceImage: null,
        isPublic: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        analysis: input.analysis,
      };
      SAMPLE_MAPS.unshift(demoMap);
      return NextResponse.json({ map: publicMap(demoMap), run: null }, { status: 201 });
    }

    await ensureDatabaseReady();
    const saved = await db.transaction(async tx => {
      const [map] = await tx.insert(floorMaps).values({ ...input, userId, isPublic: false }).returning();
      let run = null;
      if (body.runAStar && results) {
        [run] = await tx.insert(runs).values(runRecord(map.id, userId, `${input.title} — reviewed grid`, input, results, "manhattan", false)).returning();
      }
      return { map, run };
    });
    return NextResponse.json({ map: publicMap(saved.map), run: saved.run }, { status: 201 });
  } catch (error) {
    if (error instanceof MapInputError || error instanceof SyntaxError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Save map failed", error);
    return NextResponse.json({ error: "The map could not be saved. Nothing was committed; your edits are still on this page. Please retry." }, { status: 500 });
  }
}
