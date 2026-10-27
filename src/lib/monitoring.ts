export interface ErrorEventRecord {
  timestamp: string;
  route: string;
  message: string;
  context?: Record<string, unknown>;
}

const recentErrors: ErrorEventRecord[] = [];
const startedAt = Date.now();

export function reportServerError(route: string, error: unknown, context?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);
  const entry: ErrorEventRecord = {
    timestamp: new Date().toISOString(),
    route,
    message,
    context,
  };
  recentErrors.unshift(entry);
  if (recentErrors.length > 50) recentErrors.pop();

  if (process.env.SENTRY_DSN) {
    console.error(`[SafePath Telemetry][${route}]`, message, context ?? {});
  }
}

export function getServiceTelemetry() {
  return {
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    recentErrorCount: recentErrors.length,
    lastErrorAt: recentErrors[0]?.timestamp ?? null,
    nodeVersion: process.version,
  };
}
