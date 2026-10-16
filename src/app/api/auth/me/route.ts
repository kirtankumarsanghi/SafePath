import { NextRequest, NextResponse } from "next/server";
import { db, ensureDatabaseReady, isDatabaseConfigured } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyToken } from "@/lib/auth";

function identity(req: NextRequest) {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return verifyToken(header.slice(7));
}

export async function GET(req: NextRequest) {
  const session = identity(req);
  if (!session) return NextResponse.json({ error: "Sign in to view your account." }, { status: 401 });

  try {
    if (isDatabaseConfigured) {
      await ensureDatabaseReady();
      const [user] = await db.select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt }).from(users).where(eq(users.id, session.userId));
      if (user) return NextResponse.json({ user });
    }
  } catch {
    // DB query failed, check demo session
  }

  // Fallback demo user
  if (session.userId === 1 || session.email === "demo@university.edu") {
    return NextResponse.json({
      user: {
        id: 1,
        name: "Demo Administrator",
        email: "demo@university.edu",
        createdAt: new Date().toISOString(),
      },
    });
  }

  return NextResponse.json({ error: "This account no longer exists. Sign in again." }, { status: 401 });
}

export async function PATCH(req: NextRequest) {
  const session = identity(req);
  if (!session) return NextResponse.json({ error: "Sign in before changing your account." }, { status: 401 });

  if (!isDatabaseConfigured) {
    return NextResponse.json({ error: "Database not connected. Configure DATABASE_URL in Vercel to save profile changes." }, { status: 503 });
  }

  try {
    await ensureDatabaseReady();
    const body = await req.json();
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100) {
      return NextResponse.json({ error: "Enter a display name of 1–100 characters." }, { status: 400 });
    }
    const [user] = await db.update(users).set({ name: body.name.trim() }).where(eq(users.id, session.userId)).returning({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt });
    return user ? NextResponse.json({ user }) : NextResponse.json({ error: "The account was not found." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Changes could not be saved. Please try again." }, { status: 500 });
  }
}
