import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import { AUTH_SECRET } from "@/app/lib/authSecret";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Writes through the API proxy require a signed-in user, so every change is attributable
 * in the audit log. Reads stay open. Role checks (e.g. appeal approval) live in the Java services.
 */
export async function middleware(req: NextRequest) {
  if (!WRITE_METHODS.has(req.method)) return NextResponse.next();

  const token = await getToken({
    req,
    secret: AUTH_SECRET,
  });
  if (!token) {
    return NextResponse.json({ detail: "Sign in required" }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/v1/:path*", "/api/backend/:path*"],
};
