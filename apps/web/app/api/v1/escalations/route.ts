import { NextResponse } from "next/server";

const WORKFLOW_SERVICE_URL = process.env.WORKFLOW_SERVICE_URL || "http://localhost:8082";
const DEV_HEADERS: Record<string, string> = {
  "X-Tenant-Id": "00000000-0000-0000-0000-000000000001",
  "X-User-Id": "dev-user-001",
  "X-User-Roles": "biller",
};

export async function GET() {
  try {
    const resp = await fetch(`${WORKFLOW_SERVICE_URL}/api/v1/escalations`, {
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
