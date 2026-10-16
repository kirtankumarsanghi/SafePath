import { pool, isDatabaseConfigured } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured) {
    return Response.json({
      ok: true,
      mode: "demo",
      database: "unconfigured",
      message: "SafePath is running with bundled demo floor plans. Configure DATABASE_URL in Vercel to connect PostgreSQL.",
    });
  }

  try {
    await pool.query("SELECT 1");
    return Response.json({
      ok: true,
      mode: "database",
      database: "connected",
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        mode: "demo",
        database: "unreachable",
        error: (error as Error).message,
      },
      { status: 503 }
    );
  }
}
