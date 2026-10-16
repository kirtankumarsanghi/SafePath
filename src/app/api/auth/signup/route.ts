import { NextRequest, NextResponse } from "next/server";
import { db, ensureDatabaseReady, isDatabaseConfigured } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, signToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    if (!isDatabaseConfigured) {
      return NextResponse.json(
        { error: "PostgreSQL database is not configured. Please set DATABASE_URL in Vercel Project Settings to register persistent accounts, or sign in with demo@university.edu / demo123." },
        { status: 503 }
      );
    }
    await ensureDatabaseReady();

    const body = await req.json();
    if (typeof body.email !== "string" || typeof body.password !== "string" || typeof body.name !== "string") {
      return NextResponse.json({ error: "Enter your name, email and password." }, { status: 400 });
    }
    const email = body.email.trim().toLowerCase(), name = body.name.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (body.password.length < 8 || body.password.length > 128) {
      return NextResponse.json({ error: "Use a password of 8–128 characters." }, { status: 400 });
    }
    if (!name || name.length > 100) {
      return NextResponse.json({ error: "Enter a name of 1–100 characters." }, { status: 400 });
    }
    const passwordHash = await hashPassword(body.password);
    const [user] = await db.insert(users).values({ email, name, passwordHash }).onConflictDoNothing({ target: users.email }).returning();
    if (!user) {
      return NextResponse.json({ error: "An account already exists for this email. Please sign in." }, { status: 409 });
    }
    return NextResponse.json({ token: signToken({ userId: user.id, email: user.email }), user: { id: user.id, name: user.name, email: user.email } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Your account could not be created. Please try again." }, { status: 500 });
  }
}
