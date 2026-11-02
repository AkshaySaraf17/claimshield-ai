import { NextRequest, NextResponse } from "next/server";
import { identityHeaders } from "@/app/lib/identity";

const JAVA_API_URL = process.env.JAVA_API_URL || "http://localhost:8080";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const params = new URLSearchParams();
    for (const [key, value] of searchParams.entries()) {
      params.set(key, value);
    }
    const resp = await fetch(
      `${JAVA_API_URL}/api/v1/claims/search?${params.toString()}`,
      { headers: await identityHeaders() },
    );
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Failed to reach dev server" },
      { status: 502 },
    );
  }
}
