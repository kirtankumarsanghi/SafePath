import { NextRequest, NextResponse } from "next/server";
import { db, ensureDatabaseReady, isDatabaseConfigured } from "@/db";
import { floorMaps, runs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { MapInputError, parseMapInput, inspectDocument } from "@/lib/map-model";
import { runEvacuation } from "@/lib/astar";
import { runRecord } from "@/lib/run-storage";
import { getRequestUser } from "@/lib/auth";
import { SAMPLE_MAPS, type SampleMapRecord } from "@/lib/sample-data";
import { reportServerError } from "@/lib/monitoring";

type Context = { params: Promise<{ id: string }> };
const validId = (id: string) => /^\d+$/.test(id) && Number(id) > 0;

type MapLike = typeof floorMaps.$inferSelect | SampleMapRecord;

function publicMap(map: MapLike) {
  return {
    ...map,
    imageUrl: map.imageUrl ? `/api/maps/${map.id}/image?kind=working` : null,
    sourceImage: map.sourceImage ? `/api/maps/${map.id}/image?kind=source` : null,
  };
}

function canModifyMap(ownerUserId: number | null | undefined, req: NextRequest): boolean {
  // Maps without a personal owner (guest/workspace or seeded sample user 1) are shared workspace items.
  if (ownerUserId == null || ownerUserId === 1) return true;
  const session = getRequestUser(req);
  return Boolean(session && session.userId === ownerUserId);
}

export async function GET(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ error: "Invalid map ID.", code: "INVALID_ID" }, { status: 400 });
  const numId = Number(id);

  try {
    if (isDatabaseConfigured) {
      await ensureDatabaseReady();
      const [map] = await db.select().from(floorMaps).where(eq(floorMaps.id, numId));
      if (map) return NextResponse.json({ map: publicMap(map) });
    }
  } catch (error) {
    console.warn("DB lookup failed, checking sample plans:", error);
  }

  const sample = SAMPLE_MAPS.find(m => m.id === numId);
  if (sample) return NextResponse.json({ map: publicMap(sample) });

  return NextResponse.json({ error: "Map not found.", code: "NOT_FOUND" }, { status: 404 });
}

export async function PUT(req: NextRequest, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ error: "Invalid map ID.", code: "INVALID_ID" }, { status: 400 });
  const numId = Number(id);

  if (!isDatabaseConfigured) {
    const existingIndex = SAMPLE_MAPS.findIndex(m => m.id === numId);
    try {
      const body = await req.json();
      const existing = existingIndex >= 0 ? SAMPLE_MAPS[existingIndex] : null;
      if (existing && !canModifyMap(existing.userId, req)) {
        return NextResponse.json({ error: "You do not have permission to modify this floor plan.", code: "FORBIDDEN" }, { status: 403 });
      }
      const input = parseMapInput({ ...(existing ?? {}), ...body });
      if (!input.imageUrl && existing?.imageUrl) input.imageUrl = existing.imageUrl;
      if (!input.sourceImage && existing?.sourceImage) input.sourceImage = existing.sourceImage;
      const nowIso = new Date().toISOString();
      const updated: SampleMapRecord = {
        ...(existing ?? {
          userId: 1,
          isPublic: false,
          createdAt: nowIso,
        }),
        ...input,
        id: numId,
        updatedAt: nowIso,
        createdAt: existing?.createdAt ?? nowIso,
      };
      if (existingIndex >= 0) {
        SAMPLE_MAPS[existingIndex] = updated;
      } else {
        SAMPLE_MAPS.unshift(updated);
      }
      return NextResponse.json({ map: updated, run: null });
    } catch (error) {
      if (error instanceof MapInputError || error instanceof SyntaxError) {
        return NextResponse.json({ error: error.message, code: "BAD_REQUEST" }, { status: 400 });
      }
      reportServerError(`/api/maps/${numId}`, error);
      return NextResponse.json({ error: "Changes could not be saved.", code: "INTERNAL_ERROR" }, { status: 500 });
    }
  }

  await ensureDatabaseReady();
  try {
    const [existing] = await db.select().from(floorMaps).where(eq(floorMaps.id, numId));
    if (!existing) return NextResponse.json({ error: "Map not found.", code: "NOT_FOUND" }, { status: 404 });
    if (!canModifyMap(existing.userId, req)) {
      return NextResponse.json({ error: "You do not have permission to modify this floor plan.", code: "FORBIDDEN" }, { status: 403 });
    }
    const body = await req.json();
    const input = parseMapInput({ ...existing, ...body });
    if (!input.imageUrl && existing.imageUrl) input.imageUrl = existing.imageUrl;
    if (!input.sourceImage && existing.sourceImage) input.sourceImage = existing.sourceImage;
    if (input.analysis && body.analysis === undefined && ["gridWidth", "gridHeight", "gridData", "starts", "exits", "obstacles", "imageUrl"].some(key => body[key] !== undefined)) {
      input.analysis = { ...input.analysis, reviewed: false, reviewedAt: null };
    }
    let results = null;
    if (body.runAStar) {
      const review = inspectDocument(input);
      if (review.errors.length) return NextResponse.json({ error: review.errors.join(" "), code: "VALIDATION_FAILED" }, { status: 422 });
      results = runEvacuation(input.gridData, input.gridWidth, input.gridHeight, input.starts, input.exits, input.obstacles, "manhattan", { trace: false });
    }
    const data = await db.transaction(async tx => {
      const [map] = await tx.update(floorMaps).set({ ...input, updatedAt: new Date() }).where(eq(floorMaps.id, numId)).returning();
      let run = null;
      if (body.runAStar && results) {
        [run] = await tx.insert(runs).values(runRecord(map.id, existing.userId, `${input.title} — reviewed grid`, input, results, "manhattan", false)).returning();
      }
      return { map, run };
    });
    return NextResponse.json({ map: publicMap(data.map), run: data.run });
  } catch (error) {
    if (error instanceof MapInputError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error.message, code: "BAD_REQUEST" }, { status: 400 });
    }
    reportServerError(`/api/maps/${numId}`, error);
    return NextResponse.json({ error: "Changes could not be saved. Please retry; your local edits are unchanged.", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ error: "Invalid map ID.", code: "INVALID_ID" }, { status: 400 });
  const numId = Number(id);

  if (!isDatabaseConfigured) {
    const existingIndex = SAMPLE_MAPS.findIndex(m => m.id === numId);
    if (existingIndex >= 0) {
      if (!canModifyMap(SAMPLE_MAPS[existingIndex].userId, req)) {
        return NextResponse.json({ error: "You do not have permission to delete this floor plan.", code: "FORBIDDEN" }, { status: 403 });
      }
      SAMPLE_MAPS.splice(existingIndex, 1);
    }
    return NextResponse.json({ success: true });
  }

  try {
    const [existing] = await db.select({ id: floorMaps.id, userId: floorMaps.userId }).from(floorMaps).where(eq(floorMaps.id, numId));
    if (!existing) return NextResponse.json({ error: "Map not found.", code: "NOT_FOUND" }, { status: 404 });
    if (!canModifyMap(existing.userId, req)) {
      return NextResponse.json({ error: "You do not have permission to delete this floor plan.", code: "FORBIDDEN" }, { status: 403 });
    }
    const deleted = await db.delete(floorMaps).where(eq(floorMaps.id, numId)).returning({ id: floorMaps.id });
    return deleted.length ? NextResponse.json({ success: true }) : NextResponse.json({ error: "Map not found.", code: "NOT_FOUND" }, { status: 404 });
  } catch (error) {
    reportServerError(`/api/maps/${numId}`, error);
    return NextResponse.json({ error: "Map could not be deleted.", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
