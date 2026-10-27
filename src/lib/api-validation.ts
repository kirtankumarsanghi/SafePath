export interface ValidationResult<T> {
  ok: true;
  data: T;
}

export interface ValidationFailure {
  ok: false;
  error: string;
  code: string;
}

export type SafeParseResult<T> = ValidationResult<T> | ValidationFailure;

export interface PaginationParams {
  limit: number;
  offset: number;
  mine: boolean;
}

export function parsePagination(searchParams: URLSearchParams, defaultLimit = 100, maxLimit = 100): PaginationParams {
  const rawLimit = Number(searchParams.get("limit") ?? defaultLimit);
  const rawOffset = Number(searchParams.get("offset") ?? 0);
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, maxLimit) : defaultLimit;
  const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
  const mine = searchParams.get("mine") === "1" || searchParams.get("mine") === "true";
  return { limit, offset, mine };
}

export function validateLoginInput(body: unknown): SafeParseResult<{ email: string; password: string }> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Enter your email and password.", code: "INVALID_BODY" };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.email !== "string" || typeof b.password !== "string" || !b.email.trim() || !b.password || b.email.length > 255 || b.password.length > 128) {
    return { ok: false, error: "Enter your email and password.", code: "INVALID_CREDENTIALS_SHAPE" };
  }
  return {
    ok: true,
    data: {
      email: b.email.trim().toLowerCase(),
      password: b.password,
    },
  };
}

export function validateSignupInput(body: unknown): SafeParseResult<{ name: string; email: string; password: string }> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Enter your name, email and password.", code: "INVALID_BODY" };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.email !== "string" || typeof b.password !== "string" || typeof b.name !== "string") {
    return { ok: false, error: "Enter your name, email and password.", code: "INVALID_SIGNUP_SHAPE" };
  }
  const email = b.email.trim().toLowerCase();
  const name = b.name.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    return { ok: false, error: "Enter a valid email address.", code: "INVALID_EMAIL" };
  }
  if (b.password.length < 8 || b.password.length > 128) {
    return { ok: false, error: "Use a password of 8–128 characters.", code: "WEAK_PASSWORD" };
  }
  if (!name || name.length > 100) {
    return { ok: false, error: "Enter a name of 1–100 characters.", code: "INVALID_NAME" };
  }
  return { ok: true, data: { name, email, password: b.password } };
}
