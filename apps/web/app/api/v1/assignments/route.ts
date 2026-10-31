import { NextRequest, NextResponse } from "next/server";

const DEV_SERVER_URL = process.env.DEV_SERVER_URL || "http://localhost:8003";
const DEV_HEADERS: Record<string, string> = {
  "X-Tenant-Id": "00000000-0000-0000-0000-000000000001",
  "X-User-Id": "dev-user-001",
  "X-User-Roles": "biller",
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const params = new URLSearchParams();
    for (const [key, value] of searchParams.entries()) {
      params.set(key, value);
    }
    const resp = await fetch(
      `${DEV_SERVER_URL}/api/v1/assignments?${params.toString()}`,
      { headers: DEV_HEADERS },
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
