import { pool, isDatabaseConfigured } from "@/db";
import { getServiceTelemetry, reportServerError } from "@/lib/monitoring";

export const dynamic = "force-dynamic";

export async function GET() {
  const telemetry = getServiceTelemetry();

  if (!isDatabaseConfigured) {
    return Response.json({
      ok: true,
      mode: "demo",
      database: "unconfigured",
      telemetry,
      message: "SafePath is running with bundled demo floor plans. Configure DATABASE_URL in Vercel to connect PostgreSQL.",
    });
  }

  try {
    await pool.query("SELECT 1");
    return Response.json({
      ok: true,
      mode: "database",
      database: "connected",
      telemetry,
    });
  } catch (error) {
    reportServerError("/api/health", error);
    return Response.json(
      {
        ok: false,
        mode: "demo",
        database: "unreachable",
        telemetry,
        error: (error as Error).message,
      },
      { status: 503 }
    );
  }
}
