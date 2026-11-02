import { NextResponse } from "next/server";
import { identityHeaders } from "@/app/lib/identity";

const ANALYTICS_SERVICE_URL = process.env.ANALYTICS_SERVICE_URL || "http://localhost:8081";

export async function GET() {
  try {
    const resp = await fetch(`${ANALYTICS_SERVICE_URL}/api/v1/analytics/appeal-effectiveness`, {
      headers: await identityHeaders(),
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
