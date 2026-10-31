import { NextRequest, NextResponse } from "next/server";

const DEV_SERVER_URL = process.env.DEV_SERVER_URL || "http://localhost:8003";
const DEV_HEADERS: Record<string, string> = {
  "X-Tenant-Id": "00000000-0000-0000-0000-000000000001",
  "X-User-Id": "dev-user-001",
  "X-User-Roles": "biller",
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const periodDays = searchParams.get("period_days") || "90";
  try {
    const resp = await fetch(
      `${DEV_SERVER_URL}/api/v1/analytics/recovery?period_days=${periodDays}`,
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
