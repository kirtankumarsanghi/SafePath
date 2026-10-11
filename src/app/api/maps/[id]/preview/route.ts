import { db } from "@/db";
import { floorMaps } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { Point } from "@/lib/astar";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id) || Number(id) <= 0 || Number(id) > 2147483647) return new NextResponse(null, { status: 400 });
  try {
    const [map] = await db.select({ grid: floorMaps.gridData, width: floorMaps.gridWidth, height: floorMaps.gridHeight, starts: floorMaps.starts, exits: floorMaps.exits, obstacles: floorMaps.obstacles }).from(floorMaps).where(eq(floorMaps.id, Number(id)));
    if (!map) return new NextResponse(null, { status: 404 });
    const width = Math.max(8, Math.min(96, map.width)), height = Math.max(8, Math.min(96, map.height));
    const grid = map.grid as Record<string, string>;
    const rects: string[] = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const type = grid?.[`${x},${y}`];
      const color = type === "wall" || type === "blocked" || type === "window" ? "#34414b" : type === "unknown" ? "#c6b8d4" : type === "fire" ? "#d2956b" : null;
      if (color) rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`);
    }
    const draw = (value: unknown, color: string) => {
      if (!Array.isArray(value)) return;
      for (const point of value as Point[]) if (point && Number.isInteger(point.x) && Number.isInteger(point.y) && point.x >= 0 && point.x < width && point.y >= 0 && point.y < height) rects.push(`<rect x="${point.x}" y="${point.y}" width="1" height="1" fill="${color}"/>`);
    };
    draw(map.exits, "#449a72"); draw(map.starts, "#ac6677"); draw(map.obstacles, "#c38a5f");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Saved floor-plan grid preview"><rect width="${width}" height="${height}" fill="#daddd7"/>${rects.join("")}</svg>`;
    return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch { return new NextResponse(null, { status: 500 }); }
}
