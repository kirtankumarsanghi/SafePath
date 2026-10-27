import { NextRequest, NextResponse } from "next/server";
import { db, ensureDatabaseReady, isDatabaseConfigured } from "@/db";
import { users } from "@/db/schema";
import { attachAuthCookie, hashPassword, signToken } from "@/lib/auth";
import { checkRateLimit, clientKeyFromHeaders } from "@/lib/rate-limit";
import { validateSignupInput } from "@/lib/api-validation";
import { reportServerError } from "@/lib/monitoring";

export async function POST(req: NextRequest) {
  try {
    const rate = checkRateLimit(clientKeyFromHeaders(req.headers, "auth:signup"), 15, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many sign-up attempts. Please wait a moment and try again.", code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    if (!isDatabaseConfigured) {
      return NextResponse.json(
        { error: "PostgreSQL database is not configured. Please set DATABASE_URL to register persistent accounts.", code: "DB_UNCONFIGURED" },
        { status: 503 }
      );
    }
    await ensureDatabaseReady();

    const body = await req.json();
    const parsed = validateSignupInput(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error, code: parsed.code }, { status: 400 });
    }
    const { email, name, password } = parsed.data;

    const passwordHash = await hashPassword(password);
    const [user] = await db.insert(users).values({ email, name, passwordHash }).onConflictDoNothing({ target: users.email }).returning();
    if (!user) {
      return NextResponse.json({ error: "An account already exists for this email. Please sign in.", code: "EMAIL_EXISTS" }, { status: 409 });
    }
    const token = signToken({ userId: user.id, email: user.email });
    const res = NextResponse.json(
      { token, user: { id: user.id, name: user.name, email: user.email } },
      { status: 201 }
    );
    return attachAuthCookie(res, token);
  } catch (err) {
    reportServerError("/api/auth/signup", err);
    return NextResponse.json({ error: "Your account could not be created. Please try again.", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
