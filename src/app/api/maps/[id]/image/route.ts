import { NextResponse } from "next/server";
import { db } from "@/db";
import { floorMaps } from "@/db/schema";
import { eq } from "drizzle-orm";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id) || Number(id) > 2147483647) return new NextResponse(null, { status: 400 });
  const [row] = await db.select({ image: floorMaps.imageUrl }).from(floorMaps).where(eq(floorMaps.id, Number(id)));
  const match = row?.image?.match(/^data:(image\/(?:webp|png|jpeg));base64,(.+)$/);
  if (!match) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(Buffer.from(match[2], "base64")), { headers: { "Content-Type": match[1], "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" } });
}
