import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { NextRequest, NextResponse } from "next/server";

export const AUTH_COOKIE_NAME = "safepath_token";

function getJwtSecret(): string {
  const configured = process.env.JWT_SECRET?.trim();
  if (configured) return configured;

  const isStrictProd =
    process.env.STRICT_JWT_SECRET === "1" ||
    (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV === "production");

  if (isStrictProd) {
    throw new Error(
      "JWT_SECRET environment variable is required in production deployments."
    );
  }
  return "dev-secret-change-me";
}

export interface AuthTokenPayload {
  userId: number;
  email: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as AuthTokenPayload;
  } catch {
    return null;
  }
}

export function extractTokenFromRequest(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^Bearer\s+/i, "").trim();
  }
  const cookieToken = req.cookies?.get(AUTH_COOKIE_NAME)?.value;
  return cookieToken?.trim() || null;
}

export function getRequestUser(req: NextRequest): AuthTokenPayload | null {
  const token = extractTokenFromRequest(req);
  return token ? verifyToken(token) : null;
}

export function attachAuthCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

export function clearAuthCookie(res: NextResponse): NextResponse {
  res.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
