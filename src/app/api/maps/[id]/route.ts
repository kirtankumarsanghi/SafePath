import { NextRequest, NextResponse } from "next/server";
import { db, ensureDatabaseReady, isDatabaseConfigured } from "@/db";
import { floorMaps, runs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { MapInputError, parseMapInput, inspectDocument } from "@/lib/map-model";
import { runEvacuation } from "@/lib/astar";
import { runRecord } from "@/lib/run-storage";
import { SAMPLE_MAPS } from "@/lib/sample-data";

type Context = { params: Promise<{ id: string }> };
const validId = (id: string) => /^\d+$/.test(id) && Number(id) > 0 && Number(id) < 2147483647;

function publicMap(map: typeof floorMaps.$inferSelect | any) {
  return { ...map, imageUrl: map.imageUrl ? `/api/maps/${map.id}/image?kind=working` : null, sourceImage: map.sourceImage ? `/api/maps/${map.id}/image?kind=source` : null };
}

export async function GET(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ error: "Invalid map ID." }, { status: 400 });
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

  return NextResponse.json({ error: "Map not found." }, { status: 404 });
}

export async function PUT(req: NextRequest, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ error: "Invalid map ID." }, { status: 400 });
  if (!isDatabaseConfigured) {
    return NextResponse.json({ error: "PostgreSQL database is not configured. Please set DATABASE_URL in Vercel Project Settings to save plan edits." }, { status: 503 });
  }
  await ensureDatabaseReady();
  try {
    const [existing] = await db.select().from(floorMaps).where(eq(floorMaps.id, Number(id)));
    if (!existing) return NextResponse.json({ error: "Map not found." }, { status: 404 });
    const body = await req.json();
    const input = parseMapInput({ ...existing, ...body });
    // A map update must never drop the stored source/working image: the client
    // sends the served image URL, which parseMapInput intentionally ignores.
    if (!input.imageUrl && existing.imageUrl) input.imageUrl = existing.imageUrl;
    if (!input.sourceImage && existing.sourceImage) input.sourceImage = existing.sourceImage;
    if (input.analysis && body.analysis === undefined && ["gridWidth", "gridHeight", "gridData", "starts", "exits", "obstacles", "imageUrl"].some(key => body[key] !== undefined)) {
      input.analysis = { ...input.analysis, reviewed: false, reviewedAt: null };
    }
    let results = null;
    if (body.runAStar) {
      const review = inspectDocument(input);
      if (review.errors.length) return NextResponse.json({ error: review.errors.join(" ") }, { status: 422 });
      if (input.imageUrl && !input.analysis?.reviewed) return NextResponse.json({ error: "Confirm the edited plan against the source before running A*." }, { status: 422 });
      results = runEvacuation(input.gridData, input.gridWidth, input.gridHeight, input.starts, input.exits, input.obstacles, "manhattan", { trace: false });
      const unreachable = results.map((r, i) => r.reached ? null : `Person ${i + 1}: ${r.reason ?? "no route"}`).filter(Boolean);
      if (unreachable.length) return NextResponse.json({ error: `No valid route for every person; changes were not committed. ${unreachable.join(" ")}` }, { status: 422 });
    }
    const data = await db.transaction(async tx => {
      const [map] = await tx.update(floorMaps).set({ ...input, updatedAt: new Date() }).where(eq(floorMaps.id, Number(id))).returning();
      let run = null;
      if (body.runAStar && results) {
        [run] = await tx.insert(runs).values(runRecord(map.id, existing.userId, `${input.title} — reviewed grid`, input, results, "manhattan", false)).returning();
      }
      return { map, run };
    });
    return NextResponse.json({ map: publicMap(data.map), run: data.run });
  } catch (error) {
    if (error instanceof MapInputError || error instanceof SyntaxError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error(error); return NextResponse.json({ error: "Changes could not be saved. Please retry; your local edits are unchanged." }, { status: 500 });
  }
}
export async function DELETE(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ error: "Invalid map ID." }, { status: 400 });
  try {
    const deleted = await db.delete(floorMaps).where(eq(floorMaps.id, Number(id))).returning({ id: floorMaps.id });
    return deleted.length ? NextResponse.json({ success: true }) : NextResponse.json({ error: "Map not found." }, { status: 404 });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Map could not be deleted." }, { status: 500 }); }
}
