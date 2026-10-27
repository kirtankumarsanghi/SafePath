import { NextRequest, NextResponse } from "next/server";
import { db, ensureDatabaseReady, isDatabaseConfigured } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { attachAuthCookie, comparePassword, signToken } from "@/lib/auth";
import { checkRateLimit, clientKeyFromHeaders } from "@/lib/rate-limit";
import { validateLoginInput } from "@/lib/api-validation";
import { reportServerError } from "@/lib/monitoring";

export async function POST(req: NextRequest) {
  try {
    const rate = checkRateLimit(clientKeyFromHeaders(req.headers, "auth:login"), 25, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many sign-in attempts. Please wait a moment and try again.", code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    const body = await req.json();
    const parsed = validateLoginInput(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error, code: parsed.code }, { status: 400 });
    }
    const { email, password } = parsed.data;

    if (isDatabaseConfigured) {
      await ensureDatabaseReady();
      const [user] = await db.select().from(users).where(eq(users.email, email));
      if (!user || !(await comparePassword(password, user.passwordHash))) {
        return NextResponse.json({ error: "The email or password is incorrect.", code: "INVALID_CREDENTIALS" }, { status: 401 });
      }
      const token = signToken({ userId: user.id, email: user.email });
      const res = NextResponse.json({ token, user: { id: user.id, email: user.email, name: user.name } });
      return attachAuthCookie(res, token);
    }

    const demoAllowed = process.env.ENABLE_DEMO_LOGIN !== "false";
    const expectedDemoPassword = process.env.DEMO_ADMIN_PASSWORD || "demo123";
    if (demoAllowed && email === "demo@university.edu" && password === expectedDemoPassword) {
      const token = signToken({ userId: 1, email: "demo@university.edu" });
      const res = NextResponse.json({
        token,
        user: { id: 1, email: "demo@university.edu", name: "Demo Administrator" },
      });
      return attachAuthCookie(res, token);
    }

    return NextResponse.json(
      { error: "Database not connected. Configure DATABASE_URL to sign in with a registered account.", code: "DB_UNCONFIGURED" },
      { status: 401 }
    );
  } catch (err) {
    reportServerError("/api/auth/login", err);
    return NextResponse.json({ error: "Sign-in could not be completed. Please try again.", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
