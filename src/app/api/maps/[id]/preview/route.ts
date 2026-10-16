import { db, ensureDatabaseReady, isDatabaseConfigured } from "@/db";
import { floorMaps } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { Point } from "@/lib/astar";
import { SAMPLE_MAPS } from "@/lib/sample-data";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id) || Number(id) <= 0 || Number(id) > 2147483647) return new NextResponse(null, { status: 400 });
  const numId = Number(id);

  let mapData: { grid: any; width: number; height: number; starts: any; exits: any; obstacles: any } | null = null;

  try {
    if (isDatabaseConfigured) {
      await ensureDatabaseReady();
      const [map] = await db
        .select({
          grid: floorMaps.gridData,
          width: floorMaps.gridWidth,
          height: floorMaps.gridHeight,
          starts: floorMaps.starts,
          exits: floorMaps.exits,
          obstacles: floorMaps.obstacles,
        })
        .from(floorMaps)
        .where(eq(floorMaps.id, numId));
      if (map) mapData = map;
    }
  } catch (e) {
    // DB query failed, fallback to sample plans
  }

  if (!mapData) {
    const sample = SAMPLE_MAPS.find(m => m.id === numId);
    if (sample) {
      mapData = {
        grid: sample.gridData,
        width: sample.gridWidth,
        height: sample.gridHeight,
        starts: sample.starts,
        exits: sample.exits,
        obstacles: sample.obstacles,
      };
    }
  }

  if (!mapData) return new NextResponse(null, { status: 404 });

  try {
    const width = Math.max(8, Math.min(96, mapData.width));
    const height = Math.max(8, Math.min(96, mapData.height));
    const grid = mapData.grid as Record<string, string>;
    const rects: string[] = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const type = grid?.[`${x},${y}`];
        const color =
          type === "wall" || type === "blocked" || type === "window"
            ? "#34414b"
            : type === "unknown"
            ? "#c6b8d4"
            : type === "fire"
            ? "#d2956b"
            : null;
        if (color) rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`);
      }
    }

    const draw = (value: unknown, color: string) => {
      if (!Array.isArray(value)) return;
      for (const point of value as Point[]) {
        if (
          point &&
          Number.isInteger(point.x) &&
          Number.isInteger(point.y) &&
          point.x >= 0 &&
          point.x < width &&
          point.y >= 0 &&
          point.y < height
        ) {
          rects.push(`<rect x="${point.x}" y="${point.y}" width="1" height="1" fill="${color}"/>`);
        }
      }
    };

    draw(mapData.exits, "#449a72");
    draw(mapData.starts, "#ac6677");
    draw(mapData.obstacles, "#c38a5f");

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Saved floor-plan grid preview"><rect width="${width}" height="${height}" fill="#daddd7"/>${rects.join("")}</svg>`;
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
