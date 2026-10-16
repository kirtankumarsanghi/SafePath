import { NextRequest, NextResponse } from "next/server";
import { db, ensureDatabaseReady, isDatabaseConfigured } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { comparePassword, signToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body.email !== "string" || typeof body.password !== "string" || body.email.length > 255 || body.password.length > 128 || !body.password) {
      return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
    }
    const email = body.email.trim().toLowerCase();

    if (isDatabaseConfigured) {
      await ensureDatabaseReady();
      const [user] = await db.select().from(users).where(eq(users.email, email));
      if (!user || !(await comparePassword(body.password, user.passwordHash))) {
        return NextResponse.json({ error: "The email or password is incorrect." }, { status: 401 });
      }
      const token = signToken({ userId: user.id, email: user.email });
      return NextResponse.json({ token, user: { id: user.id, email: user.email, name: user.name } });
    }

    // Demo mode login: accept demo credentials
    if (email === "demo@university.edu" && body.password === "demo123") {
      const token = signToken({ userId: 1, email: "demo@university.edu" });
      return NextResponse.json({
        token,
        user: { id: 1, email: "demo@university.edu", name: "Demo Administrator" },
      });
    }

    return NextResponse.json(
      { error: "Database not connected. In demo mode, sign in with demo@university.edu / demo123, or configure DATABASE_URL in Vercel." },
      { status: 401 }
    );
  } catch {
    return NextResponse.json({ error: "Sign-in could not be completed. Please try again." }, { status: 500 });
  }
}
