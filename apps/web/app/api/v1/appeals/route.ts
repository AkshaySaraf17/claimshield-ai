import { NextRequest, NextResponse } from "next/server";

const JAVA_API_URL =
  process.env.JAVA_API_URL || "http://localhost:8080";

const DEV_HEADERS: Record<string, string> = {
  "X-Tenant-Id": "00000000-0000-0000-0000-000000000001",
  "X-User-Id": "dev-user-001",
  "X-User-Roles": "biller",
};

export async function GET(req: NextRequest) {
  try {
    const qs = req.nextUrl.search;
    const resp = await fetch(`${JAVA_API_URL}/api/v1/appeals${qs}`, {
      headers: DEV_HEADERS,
    });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Failed to reach dev server" },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const resp = await fetch(`${JAVA_API_URL}/api/v1/appeals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...DEV_HEADERS },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Failed to reach dev server" },
      { status: 502 }
    );
  }
}
