import { NextResponse } from "next/server";
import { db, isDatabaseConfigured } from "@/db";
import { floorMaps } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SAMPLE_MAPS } from "@/lib/sample-data";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id) || Number(id) <= 0) return new NextResponse(null, { status: 400 });
  const numId = Number(id);

  let rawImage: string | null = null;
  if (isDatabaseConfigured) {
    try {
      const [row] = await db.select({ image: floorMaps.imageUrl }).from(floorMaps).where(eq(floorMaps.id, numId));
      if (row?.image) rawImage = row.image;
    } catch (e) {
      console.warn("DB image lookup failed:", e);
    }
  }

  if (!rawImage) {
    const sample = SAMPLE_MAPS.find(m => m.id === numId);
    if (sample?.imageUrl) rawImage = sample.imageUrl;
  }

  if (!rawImage) return new NextResponse(null, { status: 404 });

  const match = rawImage.match(/^data:(image\/(?:webp|png|jpeg|jpg));base64,([\s\S]+)$/);
  if (!match) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(Buffer.from(match[2].replace(/\s/g, ""), "base64")), {
    headers: { "Content-Type": match[1], "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" },
  });
}

