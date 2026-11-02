import { NextRequest, NextResponse } from "next/server";
import { identityHeaders } from "@/app/lib/identity";

const JAVA_API_URL = process.env.JAVA_API_URL || "http://localhost:8080";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const resp = await fetch(`${JAVA_API_URL}/api/v1/claims/appeal-letters/generate`, {
      method: "POST",
      headers: { ...(await identityHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Failed to reach dev server" },
      { status: 502 },
    );
  }
}
