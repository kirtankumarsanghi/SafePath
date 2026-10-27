export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  limit = 30,
  windowMs = 60_000,
  now = Date.now()
): RateLimitResult {
  const cutoff = now - windowMs;
  const existing = buckets.get(key) ?? { timestamps: [] };
  existing.timestamps = existing.timestamps.filter(ts => ts > cutoff);

  if (existing.timestamps.length >= limit) {
    const oldest = existing.timestamps[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    buckets.set(key, existing);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  existing.timestamps.push(now);
  buckets.set(key, existing);

  if (buckets.size > 2000) {
    for (const [k, b] of buckets.entries()) {
      if (b.timestamps.every(ts => ts <= cutoff)) buckets.delete(k);
    }
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - existing.timestamps.length),
    retryAfterSeconds: 0,
  };
}

export function clientKeyFromHeaders(headers: Headers, scope: string): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = headers.get("x-real-ip")?.trim();
  const ip = forwarded || realIp || "local";
  return `${scope}:${ip}`;
}
