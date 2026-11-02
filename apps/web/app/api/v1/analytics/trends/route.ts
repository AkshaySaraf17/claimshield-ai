import { NextResponse, type NextRequest } from "next/server";

const ANALYTICS_SERVICE_URL = process.env.ANALYTICS_SERVICE_URL || "http://localhost:8081";
const DEV_HEADERS: Record<string, string> = {
  "X-Tenant-Id": "00000000-0000-0000-0000-000000000001",
  "X-User-Id": "dev-user-001",
  "X-User-Roles": "biller",
};

export async function GET(request: NextRequest) {
  const months = request.nextUrl.searchParams.get("months") || "6";
  try {
    const resp = await fetch(`${ANALYTICS_SERVICE_URL}/api/v1/analytics/trends?months=${months}`, {
      headers: DEV_HEADERS,
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
